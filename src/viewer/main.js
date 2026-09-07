/**
 * The viewer.
 *
 * ── the part that quietly decides whether any of this looks real ────────────
 *
 * The two bodies are finished art with one entry point: `root.userData.pose(s)`
 * where s = { t, dt, speed, stride, turn, grounded, health, action, phase }.
 * Three of those fields are easy to get wrong in a way that reads as "the
 * animation is broken" rather than as "the bridge is wrong", so they are
 * spelled out here:
 *
 *  - `speed` is in BODY LENGTHS per second, not metres. The body is measured
 *    with a Box3 at load and the sim's metres are divided by it. Feed it metres
 *    and a body at 4.6 m/s reads as a sprint at the clamp ceiling and never
 *    varies again.
 *  - `stride` is a gait phase that must accumulate by DISTANCE TRAVELLED, not
 *    by time. Accumulate by time and the feet skate whenever the body is
 *    accelerating, decelerating, knocked back or held against a wall — which
 *    in this game is most of the time.
 *  - `stride` carries the SIGN of travel against facing, so a body backing away
 *    from its opponent backpedals instead of moonwalking.
 *
 * ── and the part that decides whether it looks fair ─────────────────────────
 *
 * Snapshots arrive at the sim rate. Rendering the newest one on arrival makes
 * every motion a staircase, so the render clock runs one snapshot interval in
 * the past and interpolates between the two frames that bracket it. Headings
 * are interpolated the short way round; interpolating the raw radians spins a
 * body the long way through a heading wrap once per fight, which looks exactly
 * like a physics bug.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';

/* Относительный путь, не абсолютный: дев-вьювер монтирует эту папку в
   корень (`/main.js`), продукт — в `/viewer/`. Абсолютный работал бы ровно
   в одном из двух, и в дев-режиме сцена просто не собиралась. */
import { buildBody } from './loadbody.js';
import { bakeStatic } from './bake.js';
import { Vfx, markGlow, setGlowEnabled, telegraphMat, setFade } from './vfx.js';
import { playIr } from './vfxir.js';
/* The place: everything that is not a fighter, a telegraph or an effect. */
import { buildEnvironment, preTone, srgbToLin, REFLECT_LAYER, initialQuality, qualityGovernor, RIG } from './environment.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
const errBox = $('#err');
const fail = (m) => { errBox.style.display = 'block'; errBox.textContent += `${m}\n`; console.error(m); };

/**
 * A THROW REPORTED ON ONE LINE, WITH THE FRAMES THAT NAME IT.
 *
 * Four review rounds logged the identical, unactionable string
 * `render: TypeError: Cannot read properties of undefined (reading 'abs')`
 * and not one of them could say which material threw it. The reason is
 * mechanical, not mysterious: these sites reported `e.stack`, whose FIRST
 * line is the message and whose frames follow on later lines — and the
 * capture harness keeps `String(e).split('\n')[0]`, i.e. exactly the line
 * that carries no location. Every frame of every trace was thrown away by
 * construction, in the one place a capture is the only witness.
 *
 * So the top frames are folded onto the first line, shortest part first: the
 * message, then three frames joined by ` <- `, each trimmed of the `at ` and
 * of the origin so a 400-character line still holds three locations. Nothing
 * else about the reporting changes — `fail` still prints the whole thing to
 * the console, where the full stack is one expand away.
 */
function where(e) {
  const msg = (e && e.message) || String(e);
  const frames = String((e && e.stack) || '')
    .split('\n').slice(1, 4)
    .map((s) => s.trim().replace(/^at\s+/, '').replace(/https?:\/\/[^/]+/g, ''))
    .filter(Boolean);
  return frames.length ? `${msg} @ ${frames.join(' <- ')}` : msg;
}

/**
 * АДРЕС БЭКЕНДА. Пусто — свой хост, то есть прежнее поведение целиком.
 *
 * Ставится страницей до загрузки модулей (`index.html`, блок «где живёт
 * бэкенд»): статику продукта может раздавать GENEX, а ручки живут на своём
 * сервере. Дев-страница вьювера глобаль не ставит — там всегда свой хост.
 *
 * Префикс идёт ТОЛЬКО на `/api/...`. `/bodies/octopus.js` — это статика, она
 * лежит рядом со страницей, и увести её на бэкенд значило бы просить у него
 * файл, которого он в бандле не раздаёт.
 */
/**
 * A stamp on the shell's own clock (`app.js`'s `__airenaMarks`).
 *
 * `rendererReady` — the moment this module finishes evaluating — lands 4.5–6 s
 * after `screenReady` in every live capture, and it is 60 % of F6's ten-second
 * budget with NOTHING inside it measured: module fetch and parse, the WebGPU
 * device, the environment's build (its PMREM among it), the post graph and two
 * compiles are all one number. These split it, so the next person optimising
 * the first frame is aiming at a measurement instead of at a guess.
 * `tools/checkboot.mjs` prints the split beside the weight.
 */
const mark = (name) => {
  if (typeof window === 'undefined' || !window.__airenaMarks) return;
  if (!window.__airenaMarks[name]) window.__airenaMarks[name] = Math.round(performance.now());
};
mark('viewerStart');

const API = () => (typeof window !== 'undefined' && window.__api) || '';

// ---------------------------------------------------------------------------
// scene
// ---------------------------------------------------------------------------

const cfg = await (await fetch(`${API()}/api/config`)).json();
const HALF = cfg.arena.half;

const scene = new THREE.Scene();
/*
 * The grade of the world — the sky, the fog, the ground and the whole rig —
 * lives in `./environment.js` now (`buildEnvironment`, called once the
 * renderer is up): one warm hazy plaza under a single low sun, built against
 * `reports/arena/ARENA-BRIEF.md` and photographed on `arena.html`. Nothing
 * about the PLACE is decided in this file any more; what stays here is the
 * fight — the bodies, the camera, the telegraphs, the effects, the HUD.
 */

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.3, 400);
/*
 * ── THE BOOT POSE: THE ARENA'S OWN PORTRAIT, NOT A MAP OF IT ──────────────
 *
 * This is the eye until the first snapshot arrives, which makes it the
 * `searching` beat's camera and the first picture the product ever draws — and
 * `arena.html`'s `default` preset MIRRORS IT, so it is also the frame the
 * stand is judged in (`reports/arena/stand-default.png`). It was (0, 26, 34)
 * looking at (0, 1, 0), and that pose failed the same two ways in both places.
 *
 * IT LOOKED DOWN. 26 m up over a 34 m shot is 37° of pitch against a 23°
 * half-frame, so the top of the picture pointed 14° BELOW the horizon: the
 * whole bank, deck and banner layer was compressed into the top 48 px of 900
 * (5.3 % of the frame) with both banners cut by the edge, and there was no
 * sky, no roofline and no planet in it at all. Dropping the eye to 16 m and
 * raising the aim to 3.6 puts the top of frame 4° ABOVE the horizon, which is
 * where the world the second directive asks for actually stands.
 *
 * IT LOOKED STRAIGHT DOWN THE SUN'S OWN AXIS. The key flanks from (−x, +z);
 * from an eye on +z every block's shadow lay directly behind its caster, and
 * `live-searching.png` measured the whole pit interior at a flat 88.5 L to
 * ±0.1 — the arena's one detail, gone. At 30° of azimuth the shadow direction
 * projects 0.97 across the frame and 0.26 into it: the shadows lie ACROSS the
 * floor, which is what makes a floor read as a floor. It is also the direction
 * the fight camera settles on (`CAM_ANCHOR`, 45°), so the hand-over from
 * searching to the first fighting frame is a small move rather than a swing.
 *
 * Ground radius 38 keeps the eye 14 m outside the wall at this azimuth, so the
 * plaza still reads under it and the near wall hides ~3 m of the field — which
 * `wallHidesField` fades, as it was written to.
 */
camera.position.set(19, 16, 32.9);
camera.lookAt(0, 3.6, 0);

/**
 * THE HUD'S FREE BAND — where a fighter may stand on the screen.
 *
 * The frame is not the picture. The shell owns the top of it (the phase word
 * and its subline end ~190 px down at 1440×900) and the bottom (the name
 * plates begin ~285 px up; ~260 under 800 px), and a body framed to the
 * symmetric |ndc| ≤ 0.88 box stood with its feet through the name row and its
 * head off the top edge while the assertion said HOLDS: the aim point sat at
 * the frame's centre, which is inside the bottom band at every width. So the
 * camera solves against THIS band — `yTop` / `yBot` are its edges in ndc —
 * and the two tests (`bodyInBand`) project feet and head, not the centre.
 *
 * The numbers here are the DATA-ONLY default: `tools/checkframing.mjs`
 * evaluates this slice in Node with no DOM, and 0.58 / −0.37 is the 1440×900
 * layout (190 → 618 px). The browser measures the real elements in
 * `measureHud()` on every resize and phase change. `card` says a card (VS,
 * the result) is up — the establishing camera's cue; `feed` is the live-feed
 * panel's box in ndc, for the occlusion pass, which ghosts the glass when a
 * fighter stands under it as it ghosts a block.
 *
 * `cardRect` is the CARD ITSELF, in ndc — a third band, not an edge. The two
 * cards own the MIDDLE of the screen (1440×900: the VS card x 283–1160 /
 * y 333–568, the result card x 510–930 / y 208–692) and the solver was blind
 * to them, so it happily "framed" a pair the card covered whole: the result
 * beat aimed at the pair's midpoint, which is the frame's centre, which is
 * under the card, and the capture came back an empty plaza with a VICTORY
 * card on it. Only the ESTABLISHING path reads this (`clearAim` below); the
 * fight camera does not, so `tools/checkframing.mjs` grades what it graded.
 */
const hudBand = { yTop: 0.58, yBot: -0.37, card: false, vs: false, feed: null, cardRect: null };

/*
 * WebGPU when the browser has it, WebGL2 when it does not, and `?webgl=1` to
 * take the fallback path deliberately — because a fallback nobody can exercise
 * on purpose is a fallback nobody has tested.
 */
const forceWebGL = new URLSearchParams(location.search).get('webgl') === '1';
let renderer;
try {
  renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
  await renderer.init();
  window.__airenaBackend = forceWebGL ? 'webgl2 (forced)' : 'webgpu';
} catch (e) {
  fail(`WebGPU unavailable (${e.message}) — falling back to WebGL2`);
  renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: true });
  await renderer.init();
  window.__airenaBackend = 'webgl2 (fallback)';
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
/**
 * THE EXPOSURE CONTRACT — 1.0, in both places.
 *
 * The environment inverts every unlit colour (the sky, the fog, the banner,
 * the planet, and this file's telegraph tokens) through the ACES curve AT
 * THIS EXPOSURE, so they land on their hex after the grade; the post graph
 * tone-maps at `postU.exposure` and the raster path, when the graph is not
 * built, at `renderer.toneMappingExposure`. All three read one constant and
 * the graph asserts it once at build. At 0.94 every pre-toned colour landed
 * 6 % under its hex and the horizon left the fogged plaza.
 */
const ENV_EXPOSURE = 1.0;
renderer.toneMappingExposure = ENV_EXPOSURE;
document.body.appendChild(renderer.domElement);

/*
 * NO DOM VIGNETTE. There was a radial-gradient element over the canvas here
 * (`#arena-vignette`, `--ink` and then `--muted` at .14–.20 in the corners),
 * stacked on a darkening vignette in the post graph. The built HUD already
 * dims the top and the bottom of the frame by WASHING toward `--sky-2`
 * (`hud.css` `#hud::before/::after`), and c1's edges go lighter into haze,
 * not darker: a darkening under that wash cancelled at the top and bottom and
 * survived at the flanks — a soft bow-tie of darker edges nothing else on the
 * site has, with the darkest non-fighter ink of the frame along the nav
 * rail's column. The post graph's vignette is a wash now (`buildPost`), and
 * it is the only one.
 */
/**
 * Measure the HUD's band and the feed's box from the DOM (see `hudBand`).
 *
 * Top: the lowest bottom edge of what the shell docks at the top — the phase
 * block, and the feed when it is folded into a strip across the top (the
 * phone). Bottom: the highest top edge of what it docks at the bottom — the
 * two fighter panels (real or simulated) and the clock. Elements that are
 * not laid out are skipped; opacity is NOT a criterion, because the panels
 * fade in over 320 ms at the start of a fight and a band measured through
 * that fade would aim the first second of every fight at the name row. A
 * measurement that leaves no band (a window collapsed mid-resize) keeps the
 * previous one. The feed at the side is a box for the occlusion pass; the
 * feed across the top is part of the band.
 */
function measureHud() {
  const W = Math.max(1, innerWidth), H = Math.max(1, innerHeight);
  const box = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  };
  let top = 0, bottom = H, topSeen = false, bottomSeen = false;
  for (const el of document.querySelectorAll('.live-top')) {
    const r = box(el);
    if (r && r.bottom < H * 0.5) { top = Math.max(top, r.bottom); topSeen = true; }
  }
  /* the visitor's invitation (`.live-cta`) is docked in the bottom column
     above the clock: it is part of the bottom band wherever it stands, so
     the pair is framed above it and never under its glass */
  for (const el of document.querySelectorAll('.bar-wrap, #clock, .clock-sim, .live-cta')) {
    const r = box(el);
    if (r && r.top > H * 0.45) { bottom = Math.min(bottom, r.top); bottomSeen = true; }
  }
  /* The card's own rectangle, for the establishing shot (`hudBand.cardRect`).
     Measured whether or not it is inside the band: it is an exclusion, not an
     edge, and a result card taller than the band is exactly the case that
     broke. A card mid-transition (scale/opacity) still reports its laid-out
     box, which is the box it is about to occupy. */
  const cr = box(document.querySelector('.ov-card'));
  hudBand.cardRect = cr
    ? { x0: (cr.left / W) * 2 - 1, x1: (cr.right / W) * 2 - 1, y0: 1 - (cr.top / H) * 2, y1: 1 - (cr.bottom / H) * 2 }
    : null;
  const fr = box(document.getElementById('feedwrap'));
  const strip = !!fr && fr.width >= W * 0.6;
  if (fr && strip && fr.bottom < H * 0.5) { top = Math.max(top, fr.bottom); topSeen = true; }
  hudBand.feed = fr && !strip
    ? { x0: (fr.left / W) * 2 - 1, x1: (fr.right / W) * 2 - 1, y0: 1 - (fr.top / H) * 2, y1: 1 - (fr.bottom / H) * 2 }
    : null;
  /* 12 %: on a phone the visitor's card and the folded feed leave the fight
     ~130 px of 844, and the pair, 30 px tall at the 34–44 m the narrow frame
     needs anyway, is framed in it without loss */
  /* Each edge is replaced only when an element was found for it: a frame in
     which the phase block or the panels are between two states (a card
     rising, a transition's `visibility` delay) must not open the band to the
     frame's edge, where the next measurement is a second away. */
  if (bottom - top > H * 0.12) {
    if (topSeen) hudBand.yTop = 1 - (2 * top) / H;
    if (bottomSeen) hudBand.yBot = 1 - (2 * bottom) / H;
  }
  hudBand.top = top; hudBand.bottom = bottom;
}

/*
 * AND ONCE MORE WHEN THE TOP BLOCK HAS FINISHED GROWING.
 *
 * `.live-word` transitions its own `font-size` over `--d-screen`, so for most
 * of a second after a phase change the band is measured against a block that
 * is still growing — and the loop's own beat is 30 frames (~0.77 s at 39 fps),
 * i.e. exactly one measurement, taken mid-transition. That is how a mech's
 * head came to stand inside `ARENA · FIGHT #…`: the body was 32 px above a
 * `yTop` that was measured too high. Listening on the transition costs
 * nothing and lands the measurement on the settled layout.
 */
addEventListener('transitionend', (e) => {
  if (e.target instanceof Element && e.target.closest('.live-top, .ov-card, .bar-wrap, #clock, .live-cta')) measureHud();
}, true);

addEventListener('resize', () => {
  /*
   * ВЫРОЖДЕННЫЙ РАЗМЕР ОКНА НЕ ИМЕЕТ ПРАВА УБИТЬ КАМЕРУ.
   *
   * `innerHeight` бывает нулём — свёрнутая панель, момент между сменой
   * ориентации, окно, схлопнутое до заголовка. Тогда `aspect` становится
   * Infinity, матрица проекции — NaN, и NaN расходится по всему состоянию
   * камеры (`camState.look/dist/height`, `camera.position`) НАВСЕГДА: он
   * переживает возврат нормального размера, потому что дальше всё считается
   * от него самого. Арена перестаёт рисоваться до перезагрузки страницы.
   *
   * Один кадр с плохими числами стоит дешевле мёртвой сцены.
   */
  const w = Math.max(1, innerWidth);
  const h = Math.max(1, innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  hitRT.setSize(Math.round(w * renderer.getPixelRatio()), Math.round(h * renderer.getPixelRatio()));
  measureHud();
});

/*
 * ── ИЗБИРАТЕЛЬНЫЙ BLOOM (D163) ────────────────────────────────────────────
 *
 * ЗАЧЕМ. Аддитивное свечение без bloom — это просто более яркие пиксели.
 * `vfx.js` держит ДВА пула частиц вместо одного ровно поэтому: аддитивный на
 * белом полу выбеливался, и половину эффекта приходилось рисовать обычным
 * блендингом. Свет, который не растекается, читается как наклейка.
 *
 * WHY IT SELECTS RATHER THAN THRESHOLDS. The floor is the biggest and stillest
 * surface in the frame, and under a 3.0 key it is bright even now that the
 * grade has taken its albedo down to `GROUND` (it used to be 0xe9e6de, a
 * near-white). A brightness threshold would bloom THAT, and the whole picture
 * would swim at once. So the threshold is not brightness but MEMBERSHIP: the
 * raster pass's second output (`bloomIntensity`) is written only by the
 * materials §10.1 allows to glow — abilities, telegraphs, impacts. A body
 * never glows, and that is no longer a convention written in a comment but a
 * property of the pipeline: an unmarked material physically cannot reach the
 * bloom.
 *
 * ЗАПАСНОЙ ПУТЬ ОБЯЗАТЕЛЕН. MRT и постобработка — это две вещи, которые
 * могут не собраться на чужом железе, а бой обязан идти. Если конвейер не
 * построился, `post` остаётся null и кадр рисуется напрямую, как раньше.
 */
let post = null;
/*
 * ── СОСТАВНОЙ ПОСТ-ГРАФ (решение основателя 02.09) ────────────────────────
 *
 * Один полноэкранный проход, внутри которого — вся кинематография кадра:
 *
 *   растр (HDR, без тонмаппинга; MRT: цвет, маска свечения, искажение)
 *     → тепловое искажение: цвет читается со сдвигом по выходу `distort`
 *     → хроматическая аберрация: R и B по радиальному смещению от центра,
 *       покой 0, всплеск на ударе
 *     → избирательное свечение по маске `bloomIntensity` — В HDR: до того,
 *       как ACES прижмёт цвета к единице. Именно из-за порядка первый заход
 *       (D163) при силе 1.15 давал три ОДИНАКОВЫХ белых луча — свечение
 *       складывалось с уже LDR-цветом
 *     → ACES с экспозицией → виньетка → вспышка удара (смешивание с цветом
 *       элемента) → выход в sRGB.
 *
 * Свечение по-прежнему ИЗБИРАТЕЛЬНОЕ, по метке `markGlow`: пороговое
 * засветило бы пол — самую большую поверхность кадра. Искажение пишут прокси
 * (`markDistort`), остальные пишут ноль.
 *
 * ЗАПАСНОЙ ПУТЬ ОБЯЗАТЕЛЕН. Если граф не собрался (`?post=0`, бэкенд без MRT),
 * `post` остаётся null, тонмаппинг возвращается растру и кадр рисуется
 * напрямую. Вспышка тогда идёт через DOM `#vfxflash`.
 */
/*
 * Силуэт удара живёт в СВОЕЙ текстуре: жертва рисуется в неё одним
 * материалом-оверрайдом (см. `drawHitFlash`), а пост-граф кладёт эту
 * текстуру ПОСЛЕДНИМ слоем поверх готового кадра. Второй проход в канвас
 * (первая попытка) стирал кадр в чёрное: WebGPU не держит `autoClear = false`
 * между двумя `render` в одном кадре.
 */
/*
 * ── И ВСПЫШКА НЕ НАЗЫВАЕТ СТОРОНУ ─────────────────────────────────────────
 *
 * Она была прибитой константой rgb(1, 0.14, 0.09) — красной, всегда, кем бы
 * ни была жертва, и `applySides` её не трогал. Замер на `live-vs.png`:
 * существо ИГРОКА (синее кольцо у его ног) горело 7 994 пикселями при
 * hue 8°, S 0.67 — самый насыщенный объект кадра, в трёх градусах от
 * `--accent`, то есть в цвете противника, ровно в тот момент, когда читатель
 * ищет глазами, кому попало.
 *
 * Так что вспышка несёт ТОЛЬКО ЗНАЧЕНИЕ: нейтральная светлая заливка в
 * `--sky-2` (#F4EEE8) — самый светлый цвет мира, — а «чей» продолжают
 * говорить кольцо, плита и полоса здоровья. Двух таблиц по сторонам здесь
 * больше нет, и противоречить владению нечему.
 *
 * НЕ `preTone`, а `srgbToLin`: подмешивание идёт ПОСЛЕ тонмапа (строка с
 * `struck` ниже стоит за `mapped`), в тех же display-linear единицах, что и
 * `washTo` виньетки. Пре-тонированное значение здесь ушло бы в белый.
 */
const hitRT = new THREE.RenderTarget(
  Math.max(1, Math.round(innerWidth * renderer.getPixelRatio())),
  Math.max(1, Math.round(innerHeight * renderer.getPixelRatio())),
  { depthBuffer: true },
);
const HIT_WASH = new THREE.Color(srgbToLin(0xF4 / 255), srgbToLin(0xEE / 255), srgbToLin(0xE8 / 255));
const hitU = { alpha: TSL.uniform(0), colour: TSL.uniform(HIT_WASH) };
/*
 * ── THE PLACE ─────────────────────────────────────────────────────────────
 *
 * `buildEnvironment` builds everything that is not a fighter, a telegraph or
 * an effect: the sunken field, the six cover blocks, the plaza, the two tier
 * wings, the banner, the planet, the sky dome, the fog and the whole lighting
 * rig — VSM shadows, the hemisphere fill, a PMREM of its own sky, and on
 * `high` a bodies-only planar reflection in the floor. It runs after
 * `renderer.init()` (the PMREM needs a live renderer) and before the post
 * graph, and it SETS the shadow filter, the background and the fog itself;
 * the `PCFSoftShadowMap` line above is overwritten here on purpose.
 *
 * The tier: 'high' on WebGPU unless `?quality=` pins another, 'low' on the
 * WebGL2 backend always (no AO, no reflection, FXAA, a 1024 shadow map). The
 * meter in the loop can only take it DOWN from there (`autoQuality`).
 */
const isWebGL = !!renderer.backend?.isWebGLBackend;
const QUALITIES = ['high', 'medium', 'low'];
/*
 * `?quality=` — THE ONE LEVER THAT NAMES A TIER, AND IT HAS TO SURVIVE A HARNESS.
 *
 * The tier's post half is decided once, at boot (see `applyPost` and
 * `setTier`), so the only way to PHOTOGRAPH a medium or a low graph is to ask
 * for one in the URL. `tools/shots.mjs` builds its address as
 * `${BASE}/#${route}`, so a base carrying the parameter arrives here as
 * `?quality=medium/` — the slash the template adds before the hash. A value
 * that differs from a tier's name by punctuation is that tier, so the letters
 * are taken and the rest dropped; a genuinely wrong word still falls through
 * `QUALITIES.includes` to the measured guess.
 */
const qualityParam = (new URLSearchParams(location.search).get('quality') || '')
  .toLowerCase().replace(/[^a-z]/g, '');
/*
 * WHO STARTS WHERE. `initialQuality`: 'low' on WebGL2; over ~2.6 MP of DRAWING
 * BUFFER 'medium'; 'high' otherwise. A coarse pointer (a phone) starts one
 * tier down whatever its size — GTAO, SMAA, a 2048 map and the reflector on a
 * mobile GPU, with the governor held for the whole first fight, is not a
 * guess worth making. `?quality=` pins; the pin is ignored on WebGL2, whose
 * graph has no AO, no reflector and no SMAA whatever the tier is called.
 *
 * THE BUFFER, NOT THE CSS PIXELS, AND ONE FUNCTION OWNS THE BOUNDARY.
 *
 * This file used to pass CSS pixels — 1440×900 is 1.30 MP at any DPR, so the
 * module's 2.6 MP branch could never fire from here and the only DPR guard
 * left was a second, separate `bufferMP > 8.3` test written beside it. The
 * measurement that settled it is `reports/screens/dpr2/live-fighting.json`:
 * at DPR 2 the same 1440×900 window ran 'high' at 24.49 ms a frame (41 fps)
 * against 9.73 ms at DPR 1 — the four-attachment MSAA-4× RGBA16F pass costs
 * 2.5× on the buffer it is really drawing, and the page took it anyway. So
 * the DPR goes to `initialQuality` (its own comment asks for it) and the
 * duplicate threshold here is gone: two copies of one boundary is how the
 * boundary came to be in neither.
 *
 * A Retina laptop therefore starts at 'medium' and CLIMBS when the frame is
 * measured cheap at a boundary (`tryPromote`); the governor drops it when it
 * is measured dear. Start conservative, measure, then decide, in both
 * directions — which is what the meter is for.
 */
/*
 * AND WHAT THIS MACHINE MEASURED LAST TIME, WHICH BEATS ANY GUESS.
 *
 * The graph's tier is decided here and nowhere else — `setTier` no longer
 * rebuilds it mid-session, because that rebuild has never drawn a frame (see
 * there). So a session's demotion has to reach the NEXT session or it reaches
 * nothing: `setTier` writes the tier it settled on, and the boot takes the
 * LOWER of that and the static guess. Lower, not the remembered one: the
 * guess knows this load's viewport and DPR, and a machine that ran 'high' on
 * a laptop panel must not open at 'high' because it once did — while a
 * machine that MEASURED itself too slow never has to measure it twice. The
 * climb (`tryPromote`) is what lifts it back, and it persists too.
 */
const TIER_KEY = 'airena.quality';
const savedTier = (() => {
  try { const v = localStorage.getItem(TIER_KEY); return QUALITIES.includes(v) ? v : null; } catch { return null; }
})();
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const dprNow = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
const guessTier = coarse ? 'medium'
  : initialQuality({ isWebGL, width: innerWidth, height: innerHeight, dpr: dprNow });
let quality = isWebGL ? 'low'
  : QUALITIES.includes(qualityParam) ? qualityParam
    : QUALITIES[Math.max(QUALITIES.indexOf(guessTier), savedTier ? QUALITIES.indexOf(savedTier) : 0)];
mark('rendererUp');
const env = buildEnvironment(THREE, TSL, {
  scene, renderer, camera, cfg,
  half: HALF, wallHeight: cfg.arena.wallHeight, obstacles: cfg.arena.obstacles,
  quality, exposure: ENV_EXPOSURE,
});
mark('envBuilt');
window.__airenaQuality = quality;
/* Every unlit colour this file puts into the scene goes through the same
   inverse the environment uses, so it lands on its hex after the grade. */
const toned = (hex) => { const c = preTone(hex, ENV_EXPOSURE); return new THREE.Color(c.r, c.g, c.b); };

const postU = {
  /* The exposure the frame is graded at — see `ENV_EXPOSURE`. With the graph
     built the raster hands over linear HDR and `renderer.toneMappingExposure`
     is dead; this is the one that counts, and it is the same number. */
  exposure: TSL.uniform(ENV_EXPOSURE),
  aberration: TSL.uniform(0),
  /* The vignette is a WASH toward `--sky-2` (#F4EEE8), not a darkening, and
     this is its strength at the far corner (the ramp starts a third of the
     way out from (0.5, 0.46), so the centre is untouched).

     0.15, NOT 0.4. At 0.4 the corners measured L 91.5–92.1 against a centre
     floor of L 85.6: the BRIGHTEST region of the picture was its edge and
     nothing framed the fight — the opposite of the reference, whose corners
     go dark and defocused. The documented reason for the wash (a darkening
     vignette fought the HUD's own) was real, but the HUD's wash is the thing
     that moved; what is left here is a light touch of haze at the very edge
     plus a separate DARKENING term below, so the frame closes instead of
     opening. */
  vignette: TSL.uniform(0.15),
  /* The other half: a darkening outside r² = 0.55, which is what puts the
     corners 3–6 L UNDER the centre floor and gives the frame an edge. A
     multiply, not a mix toward a colour, so a corner keeps its hue and a
     fighter that strays there darkens with the ground instead of being greyed
     into it. */
  edge: TSL.uniform(0.12),
  distort: TSL.uniform(0.07),
  flashAmount: TSL.uniform(0),
  flashColour: TSL.uniform(new THREE.Color(1, 1, 1)),
  bloom: TSL.uniform(0.9),
};
/*
 * The contract, asserted once: the environment inverted its colours through
 * `ENV_EXPOSURE`, so the graph must tone-map at exactly that.
 *
 * The old assertion read `postU.exposure.value`, which is created FROM
 * `ENV_EXPOSURE` sixteen lines above and written by nothing in between — a
 * tautology guarding nothing. The readers that CAN drift are the raster's own
 * exposure (live until the graph sets `NoToneMapping`, and the one the frame
 * is graded at when the graph fails to build) and the number handed to
 * `buildEnvironment`, which is what every pre-toned colour was inverted
 * through. The second is asserted only when the module reports it.
 */
if (renderer.toneMappingExposure !== ENV_EXPOSURE) throw new Error('raster exposure and environment exposure disagree');
if (env.exposure !== undefined && env.exposure !== ENV_EXPOSURE) throw new Error('post exposure and environment exposure disagree');
/* `?post=0` (and the older `?bloom=0`) — switch the post-processing off on
   purpose. A path nobody can take deliberately is a path nobody has tested,
   and it is the only way to compare "with the graph" and "without". */
const wantBloom = new URLSearchParams(location.search).get('bloom') !== '0'
  && new URLSearchParams(location.search).get('post') !== '0';
/*
 * The post nodes, fetched in ONE `Promise.all` so the five requests overlap:
 * they stand on the first frame's critical path and `tools/checkboot.mjs`
 * weighs them (GTAO 15 KB, denoise 10 KB, SMAA 68 KB, FXAA 10 KB, bloom
 * 15 KB). All five are fetched whatever the tier, because the tier can drop
 * at run time and a module fetch mid-fight is a stall.
 */
let postMods = null;
if (wantBloom) {
  try {
    const [b, g, d, s, f] = await Promise.all([
      import('three/addons/tsl/display/BloomNode.js'),
      import('three/addons/tsl/display/GTAONode.js'),
      import('three/addons/tsl/display/DenoiseNode.js'),
      import('three/addons/tsl/display/SMAANode.js'),
      import('three/addons/tsl/display/FXAANode.js'),
    ]);
    postMods = { bloom: b.bloom, ao: g.ao, denoise: d.denoise, smaa: s.smaa, fxaa: f.fxaa };
  } catch (e) {
    fail(`post nodes unavailable (${e.message}) — drawing without post-processing`);
  }
}

/**
 * THE POST GRAPH, as the stand runs it (`arena.html`), with the fight's own
 * passes kept in their places:
 *
 *   pass(scene, camera, { samples: 4 })   MSAA 4× MRT: output, bloomIntensity,
 *                                          distort (+ normalView on 'high', for AO)
 *     → heat distortion: the colour is read with the `distort` offset
 *     → chromatic aberration: R and B shifted radially, rest 0, a spike on a hit
 *     → GTAO (radius 0.7, scale 0.7, 16 samples at half resolution) → denoise
 *       (radius 4) — 'high' only; the glow mask EXEMPTS the telegraphs, so a
 *       ring under a body never takes the floor's contact AO
 *     → selective bloom on the `bloomIntensity` mask, in HDR, before ACES
 *     → ACES at `postU.exposure` → the wash vignette (toward --sky-2, 0.4 at
 *       the far corner, centred at 46 %)
 *     → the hit flash (a mix toward the element's colour)
 *     → the victim's red silhouette, on top
 *     → sRGB → ±0.5/255 hash dither (the sky banded without it; it stays
 *       under the AA's edge threshold) → SMAA ('high', 'medium') or FXAA ('low').
 *
 * `samples: 4` is a no-op on WebGPU (`antialias: true` already set the
 * renderer's samples) and 0 on WebGL2, where the MSAA MRT does not resolve.
 * The 4th RGBA16F attachment (`normal`) is 32 B/sample, exactly WebGPU's
 * default `maxColorAttachmentBytesPerSample`: a 5th output would fail
 * validation. If one is ever needed, pack it into the distortion target.
 *
 * Bloom is SELECTIVE, by the `markGlow` mark: a brightness threshold would
 * bloom the floor, the largest and stillest surface in the frame. It is added
 * in HDR, before the tone map, so the palette survives (D163 at 1.15 gave
 * three identical white beams because it summed with an LDR colour).
 *
 * Built per tier and REBUILT when the tier drops (`applyPost`): a new scene
 * pass is a new render target, so every material recompiles against the new
 * MRT layout by itself.
 */
function buildPost(q) {
  const { bloom, ao, denoise, smaa, fxaa } = postMods;
  const parts = [];
  const wantAO = q === 'high' && !isWebGL;
  const scenePass = TSL.pass(scene, camera, { samples: isWebGL ? 0 : 4 });
  parts.push(scenePass);
  const mrtSpec = { output: TSL.output, bloomIntensity: TSL.float(0), distort: TSL.vec3(0) };
  if (wantAO) mrtSpec.normal = TSL.normalView;
  scenePass.setMRT(TSL.mrt(mrtSpec));
  /*
   * THE TIER WINGS WRITE NO DEPTH, so the AO reads the plaza or the sky
   * BEHIND a wing while the wing pixel writes its own vertical riser normal
   * through the pass MRT — a mismatch that printed 3–4 px columns of full
   * occlusion every ~25 px along the whole wing (2–4 L vertical bands;
   * neither a wider denoise nor 32 spp touched them). `arena.html` hands the
   * wing material an MRT normal of "up" so it agrees with that plaza depth and
   * the AO on a wing pixel is exactly 1. Latent at r 0.7; it lands the moment
   * the radius is the stand's.
   *
   * Cleared on the way DOWN as well as set on the way up: unlike the stand,
   * this graph is REBUILT per tier, and a merged output with no `normal`
   * attachment is a pipeline error — which is what a high→medium demotion
   * would otherwise leave behind.
   *
   * The lookup is guarded because it is a CONTRACT WITH ANOTHER FILE: the
   * environment's stands were rebuilt as banks and decks and no longer carry
   * a mesh called `wing+x`, so this is currently a no-op and the 62→80 m AO
   * fade above is what keeps the far architecture out of the pass. Left in
   * place, not deleted: the override is the correct answer the moment a
   * depth-less riser stands inside the fade again, and the stand still runs
   * it.
   */
  const wingMat = env.group.getObjectByName('wing+x')?.material;
  if (wingMat) {
    wingMat.mrtNode = wantAO ? TSL.mrt({ normal: TSL.transformNormalToView(TSL.vec3(0, 1, 0)) }) : null;
    wingMat.needsUpdate = true;
  }
  const colourTex = scenePass.getTextureNode('output');
  const glowTex = scenePass.getTextureNode('bloomIntensity');
  const distTex = scenePass.getTextureNode('distort');

  const uvN = TSL.uv();
  /* Aberration and distortion stay centred on the frame; only the vignette
     is centred on the fight (below). */
  const centred = uvN.sub(TSL.vec2(0.5, 0.5));
  const r2 = centred.dot(centred);
  /* heat distortion: offset xy · strength z · gain */
  const dst = distTex.sample(uvN);
  const uvW = uvN.add(dst.xy.mul(dst.z).mul(postU.distort));
  /*
   * ABERRATION: radial, stronger toward the edge. The gain is 0.011, halved
   * from 0.022 ("no visual noise", 04.09): at the edge `centred` ≈ 0.7 and
   * r² ≈ 0.5, so at strength 0.5 the shift was 0.0077 UV — fifteen pixels of
   * coloured fringe on every edge of the scene from a ten-pixel projectile.
   * Halved, not removed: a kill and a zone burst reach the 1.4 ceiling, and
   * seven pixels at the very edge is exactly the spike it exists for.
   */
  const shift = centred.mul(r2.mul(2.0).add(0.2)).mul(postU.aberration).mul(0.011);
  const cr = colourTex.sample(uvW.add(shift)).r;
  const cg = colourTex.sample(uvW).g;
  const cb = colourTex.sample(uvW.sub(shift)).b;
  const colour = TSL.vec3(cr, cg, cb);
  const glow = glowTex.sample(uvW).r;
  let lit = colour;
  if (wantAO) {
    const depth = scenePass.getTextureNode('depth');
    const normal = scenePass.getTextureNode('normal');
    const aoPass = ao(depth, normal, camera);
    /*
     * THE TUNING IS `RIG.ao`, NOT A COPY OF IT.
     *
     * The comment that stood here said "the stand's numbers, verbatim" and was
     * not true: the stand had moved to radius 1.5 / distanceExponent 1.0 /
     * fade 52–68 m while this file still ran 1.2 / 1.5 / 62–80, and nothing
     * detected the drift — so the game ran a narrower, steeper-falloff,
     * further-out AO than the frame it was being graded against. Copying the
     * new numbers over would only reset the clock on the same failure. Both
     * this graph and `arena.html` now read the one exported block, and the
     * next stand change lands in the game by construction.
     */
    aoPass.radius.value = RIG.ao.radius;
    aoPass.scale.value = RIG.ao.scale;
    aoPass.thickness.value = RIG.ao.thickness;
    aoPass.distanceExponent.value = RIG.ao.distanceExponent;
    aoPass.distanceFallOff.value = 1;
    aoPass.samples.value = RIG.ao.samples;
    aoPass.resolutionScale = RIG.ao.resolutionScale;
    parts.push(aoPass);
    const aoTex = denoise(aoPass.getTextureNode(), depth, normal, camera);
    /* The denoise footprint has to cover the half-resolution noise tile, or it
       prints a ~7 px tick pattern along a block-foot crease at the melee
       cameras. `RIG.ao.denoiseRadius`, the stand's. */
    aoTex.radius.value = RIG.ao.denoiseRadius;
    parts.push(aoTex);
    /*
     * THE TWO GUARDS, both from `RIG.ao`. The floor clamps the term at the
     * brief's umbra floor (−20 % linear ≈ −6.5 L at L 88), so a crease can
     * never fall through it; the distance fade takes the AO off the bank,
     * where the GTAO's noise tile over a sawtooth of ~1 m steps prints
     * vertical bands. Then the glow mask: the telegraphs are the only thing
     * that writes it, and the floor's AO under a body must not muddy them.
     */
    const viewDist = TSL.perspectiveDepthToViewZ(depth.sample(uvN).r, TSL.cameraNear, TSL.cameraFar).negate();
    const aoFade = TSL.smoothstep(TSL.float(RIG.ao.fadeFrom), TSL.float(RIG.ao.fadeTo), viewDist);
    let aoF = TSL.mix(aoTex.r.max(TSL.float(RIG.ao.floor)), TSL.float(1.0), aoFade);
    aoF = TSL.mix(aoF, TSL.float(1.0), glow.clamp(0, 1));
    lit = colour.mul(aoF);
  }
  /* Strength 0.9 and radius 0.85: the glow spreads wider than the silhouette
     or it is not light. Bloom takes the un-occluded colour — a glow-marked
     pixel is exempt from AO anyway. */
  const bloomPass = bloom(colour.mul(glow), 0.9, 0.85, 0);
  parts.push(bloomPass);
  /* Bloom returns a vec4; only colour is added in HDR. */
  const hdr = lit.add(bloomPass.rgb.mul(postU.bloom));
  const mapped = TSL.toneMapping(THREE.ACESFilmicToneMapping, postU.exposure, hdr);
  /* The wash vignette: after the tone map, mix toward --sky-2 (as a display-
     linear value, since `mapped` is already tone-mapped) by a ramp centred at
     46 % of the height — the fight sits above the middle because the HUD
     owns the bottom third — reaching `postU.vignette` at the far corner. */
  const vigC = uvN.sub(TSL.vec2(0.5, 0.46));
  const vr2 = vigC.dot(vigC);
  const wash = TSL.smoothstep(TSL.float(0.25), TSL.float(1.35), vr2.mul(2.4)).mul(postU.vignette);
  const washTo = TSL.vec3(srgbToLin(0xF4 / 255), srgbToLin(0xEE / 255), srgbToLin(0xE8 / 255));
  const hazed = TSL.mix(mapped.rgb, washTo, wash);
  /* and the darkening (see `postU.edge`) */
  const dark = TSL.smoothstep(TSL.float(0.55), TSL.float(1.6), vr2.mul(2.4)).mul(postU.edge);
  const washed = hazed.mul(TSL.float(1.0).sub(dark));
  const flashed = TSL.mix(washed, postU.flashColour, postU.flashAmount);
  /* The victim's silhouette — over everything, like a sprite in an old game. */
  const hitTex = TSL.texture(hitRT.texture).sample(uvN);
  const struck = TSL.mix(flashed.rgb, hitU.colour, hitTex.a.mul(hitU.alpha).clamp(0, 1));
  /* `.rgb` explicitly: a mix node inherits its type, and a five-component
     vec4 drops the graph with a quiet console error. */
  let srgb = TSL.renderOutput(TSL.vec4(struck, 1));
  /* ±0.5 of a code of hash noise on the 8-bit output: the sky's 7 L over 60
     steps banded visibly without it. Static per pixel. */
  const px = uvN.mul(TSL.screenSize).floor();
  const n = TSL.hash(px.x.add(px.y.mul(4096.0))).sub(0.5).div(255.0);
  srgb = srgb.add(TSL.vec4(n, n, n, 0));
  /* `|| isWebGL`, not the tier alone: `?webgl=1&quality=high` pins a tier the
     WebGL2 graph does not have — AO and the reflector drop out by their own
     guards, and SMAA over a pass with `samples: 0` was the one part of the
     documented "no AO, no reflection, FXAA" degrade the pin could still
     bypass. The fallback's AA is FXAA whatever the tier is called. */
  const out = q === 'low' || isWebGL ? fxaa(srgb) : smaa(srgb);
  parts.push(out);
  const p = new THREE.PostProcessing(renderer);
  p.outputColorTransform = false;
  p.outputNode = out;
  parts.push(p);
  return { post: p, parts, scenePass };
}

/** The graph's disposable parts, so a tier change can throw the old one away. */
let postParts = [];
/** The graph's scene pass — what the precompile below warms. */
let scenePassNow = null;
/**
 * Build (or rebuild) the graph for a tier. On failure the previous graph is
 * kept if there is one; on the first build there is none, `post` stays null
 * and the frame is drawn directly, tone-mapped by the raster — the fight
 * matters more than the light. The flash then goes through the DOM
 * `#vfxflash`. Reported once per attempt.
 */
/** Compile a scene pass's pipelines off the main thread. The pass restores
    the render target and the MRT only on the way out of a compile that
    finished; after one that threw they are put back by hand, or the next
    frame would draw into the pass's own target. */
async function precompilePass(pass) {
  try {
    await pass.compileAsync(renderer);
  } catch (e) {
    renderer.setRenderTarget(null);
    renderer.setMRT(null);
    throw e;
  }
}
/** A rebuild in flight: `drawFrame` skips the draw until the swap. */
let rebuilding = false;
async function applyPost(q) {
  if (!postMods || rebuilding) return;
  rebuilding = true;
  let built;
  try {
    built = buildPost(q);
    /*
     * ── THERE IS NO MID-SESSION REBUILD ANY MORE, AND THAT IS THE FIX ─────
     *
     * This function used to be reachable twice: once at boot with `post`
     * null, and again from `setTier` with a graph already up. The second path
     * never worked. `high` writes four MRT attachments and `medium` three, a
     * material variant compiled against the old layout assembles an output
     * struct WGSL will not take, and the whole frame is dropped: measured on
     * five states at three sizes, every sidecar reading `quality: "medium"`
     * or `"low"` came back a BLACK canvas (dark 51–70 %) and every one
     * reading `"high"` came back a picture. Two rounds of repair were tried
     * against it — warming the new graph's own passes with `renderAsync`, and
     * invalidating every material's variant before `compileAsync` — and the
     * split survived both.
     *
     * So the tier's post half is decided ONCE, at boot, and `setTier` no
     * longer calls this: a demotion takes the environment's half now (which
     * is the larger part of the cost and is safe) and the graph's half at the
     * next page load, out of `localStorage`. Nothing here is left to go wrong
     * mid-fight, and there is no longer a code path in this file that has
     * never drawn a good frame.
     */
  } catch (e) {
    if (!post) { window.__airenaBloom = false; renderer.toneMapping = THREE.ACESFilmicToneMapping; }
    fail(`post unavailable (${where(e)}) — ${post ? 'keeping the previous graph' : 'drawing without post-processing'}`);
    for (const part of built?.parts || []) { try { part.dispose?.(); } catch { /* never built */ } }
    rebuilding = false;
    return;
  }
  const old = postParts;
  post = built.post;
  postParts = built.parts;
  scenePassNow = built.scenePass;
  /* Tone mapping lives in the graph: the raster hands over linear HDR. */
  renderer.toneMapping = THREE.NoToneMapping;
  /* The glow mark is allowed ONLY now: a material with an `mrtNode` under a
     pass without MRT compiles to an empty output struct and draws nothing. */
  setGlowEnabled(true);
  window.__airenaBloom = true;
  window.__airenaPost = postU;
  /*
   * THE GRAPH'S OWN TIER, beside the variable's.
   *
   * `window.__airenaQuality` says what the PAGE has decided; this says what
   * the PICTURE was built at, and they are allowed to differ for the rest of
   * a session in which the governor demoted (the environment takes the drop
   * now, the graph at the next load). Every sidecar in this repo has read the
   * first and called it the tier, which is how four captures came to be
   * labelled `"medium"` over a high graph and "fps >= 30 at medium" came to be
   * unverifiable from any evidence here. Both handles now, and the second one
   * rides in `__airenaDrawn` — which `tools/shots.mjs` already spreads into
   * every sidecar — so the picture is named without a capture-side change.
   */
  window.__airenaPostTier = q;
  if (typeof window !== 'undefined' && window.__airenaDrawn) window.__airenaDrawn.postTier = q;
  for (const part of old) { try { part.dispose?.(); } catch { /* already gone */ } }
  rebuilding = false;
}
if (postMods) await applyPost(quality);
else window.__airenaBloom = false;
mark('postBuilt');

/**
 * PUT THE RASTER PATH BACK, so a direct render draws a GRADED frame.
 *
 * With the graph up, `applyPost` hands three things to it and takes them off
 * the raster: the tone map (the graph's ACES step owns it), the render target
 * (a pass's own colour attachment) and the MRT layout (four attachments). A
 * fallback `renderer.render(scene, camera)` that runs without putting them
 * back draws into whatever target the failed pass left bound, with no tone
 * map and no output transform — which is a canvas that is never written, and
 * it is exactly the black rectangle `live-visitor.png` photographed: the HUD
 * over pure #000000 for a whole 14 s capture.
 *
 * Called before every fallback render and once when the graph is dropped.
 */
/** What a fallback frame clears to when the scene has no colour background. */
const DIRECT_CLEAR = new THREE.Color(0xE4D9CE);
function directGrade() {
  try {
    renderer.setRenderTarget(null);
    renderer.setMRT(null);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = ENV_EXPOSURE;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    /* A clear colour ALWAYS, not only when the background happens to be one:
       the renderer's default is black, and a fallback frame that clears to
       black and then draws nothing is the blank page this whole path exists
       to prevent. The sky's own value is the honest ground. */
    if (scene.background && scene.background.isColor) renderer.setClearColor(scene.background, 1);
    else renderer.setClearColor(DIRECT_CLEAR, 1);
  } catch (e) { console.warn('direct grade', e); }
}

/**
 * AND AFTER THE SECOND THROW THE GRAPH IS GONE, not retried thirty times a
 * second.
 *
 * The catch in `drawFrame` used to quarantine the body and try again with the
 * same graph on the next frame, for ever: `live-visitor.json` recorded 30
 * draws over 14 s (2 fps) with the same `TypeError` behind every one of them.
 * A graph that has thrown twice in a row is not going to build; what a viewer
 * needs from that page is the fight, at full rate, in whatever light the
 * raster can give it.
 *
 * The glow mark goes with it, and the marks already on materials are stripped:
 * a material carrying an `mrtNode` under a pass WITHOUT MRT compiles to an
 * empty output struct and draws nothing (see `vfx/core.js`), so leaving them
 * on would trade a black canvas for an empty one. This path is taken once in
 * a session, at the cost of a shader rebuild that was going to happen anyway.
 */
function dropPost(why) {
  if (!post) return;
  const parts = postParts;
  post = null; postParts = []; scenePassNow = null;
  setGlowEnabled(false);
  window.__airenaBloom = false;
  window.__airenaPost = null;
  scene.traverse((o) => {
    const m = o.material;
    if (!m) return;
    for (const one of Array.isArray(m) ? m : [m]) {
      if (one && one.mrtNode) { one.mrtNode = null; one.needsUpdate = true; }
    }
  });
  directGrade();
  for (const part of parts) { try { part.dispose?.(); } catch { /* already gone */ } }
  console.warn(`post graph dropped: ${why}`);
}


/**
 * Everything opaque that can stand between the eye and a fighter.
 *
 * The four walls are 4 m tall and are NOT in `cfg.arena.obstacles` — the sim
 * carries them separately, as arena bounds — so the viewer's occlusion test
 * never looked at them, and the camera reported "clear" with a wall across the
 * shot. Measured with a per-frame recorder over 12 matches and 16 573 live
 * fighter-frames (l1/l3, l1/l4, l3/l1, l1/l6, l2/l5, l4/l2, seeds 101 and 202):
 * a fighter was COMPLETELY invisible — all three sample heights blocked — in
 * 12.1% of frames and 22.3% had at least one blocked. So both kinds of solid
 * live in one list from here on, each with its own material rather than a
 * shared one, because the same list answers three questions: what the camera
 * has to climb over, what has to get out of the way, and where the aim line
 * stops. Adding them does NOT make the camera clear them by itself: over 24
 * matches and 25 498 live fighter-frames, 345 of the 1 905 fully-hidden frames
 * are still a single wall blocking all three heights (18.1%), against 1 560 for
 * the blocks. A wall is 40 m long and the eye orbits inside the room, so there
 * is no azimuth that clears it — which is exactly why the fade and the
 * silhouette below are the load-bearing half of this fix and the camera is not.
 *
 * `transparent` is set at construction (in `environment.js`) even though
 * everything starts fully opaque: flipping the flag later would rebuild the
 * pipeline in the middle of a fight, and the fade below has to be free to
 * start on any frame.
 *
 * DATA ONLY between here and `segSolid`: `tools/checkframing.mjs` cuts this
 * stretch out of the file and evaluates it in Node, where there is no `env`.
 * The walls (+z, −z, +x, −x) and then the config blocks, in the order
 * `buildEnvironment` builds them; its materials are bound onto these entries
 * outside every slice (before `GHOST_BODY`, below).
 */
const SOLIDS = [];
for (const [x, z, sx, sz] of [
  [0, HALF + 0.4, HALF * 2 + 1.6, 0.8], [0, -HALF - 0.4, HALF * 2 + 1.6, 0.8],
  [HALF + 0.4, 0, 0.8, HALF * 2 + 1.6], [-HALF - 0.4, 0, 0.8, HALF * 2 + 1.6],
]) {
  SOLIDS.push({ x, z, hx: sx / 2, hz: sz / 2, h: cfg.arena.wallHeight, mats: [], fade: 1, want: 1 });
}
for (const o of cfg.arena.obstacles) SOLIDS.push({ x: o.x, z: o.z, hx: o.hx, hz: o.hz, h: o.h, mats: [], fade: 1, want: 1 });

/**
 * Is the segment eye -> point inside this box?
 *
 * Three axes, not two. The old test at this spot was a flat X/Z slab over the
 * blocks alone, and height is not a detail here: the eye orbits 13-34 m out and
 * sits 12 m up, so most sight lines that cross a 3.2 m block in plan view pass
 * well above it. Over 25 498 live fighter-frames a plan-view slab test on the
 * blocks alone calls 35.0% blocked, the same test with the walls added calls
 * 74.6%, and this one calls 16.4% — so simply adding the walls to the old test
 * would have put the camera in permanent evasion, climbing and orbiting away
 * from a picture that was never obstructed.
 */
function segSolid(eye, px, py, pz, o) {
  let t0 = 0, t1 = 1;
  const axes = [
    [eye.x, px - eye.x, o.x - o.hx, o.x + o.hx],
    [eye.y, py - eye.y, 0, o.h],
    [eye.z, pz - eye.z, o.z - o.hz, o.z + o.hz],
  ];
  for (const [s, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (s < lo || s > hi) return false; continue; }
    let a = (lo - s) / d, b = (hi - s) / d;
    if (a > b) { const q = a; a = b; b = q; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return t1 > 0 && t0 < 1;
}

/**
 * How much of a body is behind something, from this eye, as 0..3.
 *
 * Three heights up the body rather than one centre point, because "the head is
 * showing over a block" and "there is a wall across the whole animal" are
 * different pictures and the camera should only pay to fix the second. The
 * sample heights are the same ones the audit recorder used, so the number this
 * returns is the number that was measured.
 */
const SAMPLE_HEIGHTS = [0.15, 0.5, 0.9];
function hiddenCount(eye, f, height, mark) {
  let n = 0;
  for (const u of SAMPLE_HEIGHTS) {
    const py = f.y + height * u;
    let any = false;
    for (const o of SOLIDS) {
      if (!segSolid(eye, f.x, py, f.z, o)) continue;
      any = true;
      // every blocker, not just the first: a body caught between a block and
      // the wall behind it is hidden by both, and fading one of them out still
      // leaves nothing to look at
      if (mark) o.hits++; else break;
    }
    if (any) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// bodies
// ---------------------------------------------------------------------------

/**
 * Сторона -> имя СТОКОВОГО ТЕЛА на диске.
 *
 * Стороны арены зовутся по цвету: `blue` и `orange`. Ничего, кроме цвета, за
 * ними не стоит — видов больше нет, соперник любой, сторона раздаётся по сиду
 * матча.
 *
 * А файлы стоковых тел на диске так и лежат: `bodies/octopus.js` и
 * `bodies/gorilla.js`. Их назвали, когда стороны ещё были видами, и
 * переименовать их — отдельная операция (их читают тулы, отчёты и замеры).
 *
 * Пока два имени не совпадают, перевод обязан быть ОДИН и явный. Раньше его
 * не было вовсе: сторона подставлялась в `/bodies/<сторона>.js` напрямую и
 * работала ровно потому, что называлась так же, как файл. Мест, где это
 * происходило, три — стартовая загрузка, откат после несобравшегося тела и
 * бой, в котором у существа своего тела нет, — и разойтись они могли по
 * отдельности.
 *
 * Стоковое тело — это ЗАПАСКА СТОРОНЫ, а не её вид. Ни одно существо им не
 * описывается: у существа тело своё.
 */
const STOCK_BODY = { blue: 'octopus', orange: 'gorilla' };

/**
 * Load one art asset.
 *
 * This used to say "these files are two of ours and there is nothing here to
 * defend against". That stopped being true the day a body could be WRITTEN BY
 * A MODEL from a player's free text: the code then runs in the browser of a
 * stranger who only opened a broadcast, and "nothing to defend against" turns
 * into a player-authored path to that stranger's session token.
 *
 * So there are two doors now. Ours are still evaluated as-is. A generated body
 * comes from the server already parsed, restricted to a known vocabulary and
 * fuel-metered (`src/server/sandbox/bodyrules.js`), and is built here inside a
 * scope where every dangerous name is shadowed to `undefined`
 * (`src/viewer/loadbody.js`).
 *
 * What matters after that is the same as before — measuring the result. The
 * pose function wants speed in body lengths, and the only place that number
 * exists is the geometry.
 *
 * @param {string} ref  a stock body FILE — `octopus` | `gorilla`, see
 *   `STOCK_BODY` — or `gen:<creature id>` for a generated one
 * @param {string} kind which SIDE the art is dressed on: `blue` | `orange`.
 *   It picks the physics (`cfg.fighters[kind]`), nothing else.
 * @param {number} size the creature's own size (0.75…1.5). The collider grows
 *   with it, so the mesh has to grow with it too — a body normalised to the
 *   default build's base radius would make a whale and a mosquito the same
 *   width and put the picture back at odds with the physics.
 */
async function loadBody(ref, kind = ref, bodySize = 1) {
  const generated = ref.startsWith('gen:');
  const url = generated ? `${API()}/api/body/${encodeURIComponent(ref.slice(4))}` : `/bodies/${ref}.js`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`body ${ref}: ${res.status}`);
  const src = await res.text();
  const root = buildBody(THREE, TSL, src, { trusted: !generated });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  /**
   * Measure, then make the picture agree with the physics.
   *
   * These two files were authored independently of this arena and land at
   * whatever scale their geometry happened to end at. A body drawn smaller than
   * its own collider stops short of everything it touches and reads as
   * floating; drawn larger, it visibly overlaps a wall it never entered. So the
   * mesh is scaled until its horizontal footprint IS the collision diameter the
   * simulation uses, and after that "they are touching" and "they look like
   * they are touching" are the same statement.
   */
  const raw = new THREE.Box3().setFromObject(root);
  const rawSize = new THREE.Vector3();
  raw.getSize(rawSize);
  const footprint = Math.max(rawSize.x, rawSize.z) || 1;
  const k = Number.isFinite(bodySize) ? Math.max(0.75, Math.min(1.5, bodySize)) : 1;
  const scale = (cfg.fighters[kind].radius * k * 2) / footprint;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  // The gait phase wants body lengths: the longest horizontal extent.
  const length = Math.max(size.x, size.z) || 2.5;

  /*
   * The meshes, listed once, with their bounds precomputed.
   *
   * `spanY` runs this list every frame (see below) and `Box3.setFromObject`
   * over the same tree costs 0.437 ms on `bodies/octopus.js` and 0.326 ms on
   * `bodies/gorilla.js` — 0.76 ms a frame for both, 4.6% of a 60 Hz budget, to
   * answer one scalar question. The flat list plus a min-Y-only scan answers it
   * in 0.049 and 0.039 ms: 0.088 ms a frame, 13x cheaper, same number.
   */
  /*
   * СКЛЕЙКА НЕПОДВИЖНЫХ ЧАСТЕЙ — до того, как считается список мешей.
   *
   * Замерено в Chrome: кадр стоит примерно 6 мкс на вызов отрисовки, а наши
   * эталонные тела дают их по две тысячи каждое. При этом поза шевелит четыре
   * процента узлов. Подробности и отмена по `?bake=0` — в `bake.js`.
   */
  if (bakeStatic && (typeof location === 'undefined' || new URLSearchParams(location.search).get('bake') !== '0')) {
    try {
      const r = bakeStatic(THREE, root);
      if (r.reverted) console.warn(`body ${ref}: merge reverted: ${r.why}`);
      else if (r.groups) console.info(`body ${ref}: ${r.before} → ${r.after} meshes (${r.groups} merges)`);
      root.updateMatrixWorld(true);
    } catch (e) {
      console.warn(`body ${ref}: merge failed: ${e.message}`);
    }
  }

  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    meshes.push(o);
  });
  bandBody(meshes);

  /*
   * ── ГДЕ СТОИТ СУЩЕСТВО, РЕШАЕТ АРЕНА, А НЕ ТЕЛО ──────────────────────────
   *
   * Арена ставила бойца прямо в корень, который вернула чужая программа, и
   * СРАЗУ ПОСЛЕ ЭТОГО звала её же позу — шестьдесят раз в секунду. Поза
   * получает тот же самый объект и вольна написать в него что угодно. Тело
   * СТЕКЛЯННОЙ ОСЫ этим и пользуется: замерено в живом браузере, кадр за
   * кадром — арена клала (-16.45, 14.92), а после позы в корне оставался
   * ровно (0, 0). Существо честно дралось по всей арене и всё это время
   * стояло в центре, потому что нарисовать себя в другом месте ему не давала
   * его же собственная программа.
   *
   * Заметить это было почти нельзя: цикл кадра ПОСЛЕ позы переписывает `y`
   * (высота считается по фактически принятой позе), поэтому тело мелко
   * дышало по вертикали и выглядело живым — просто никуда не ехало.
   *
   * Починка — граница, а не запрет. Модель пусть двигает что хочет ВНУТРИ
   * своего графа: это её работа, там живёт вся анимация. Но её корень теперь
   * лежит в держателе, который завела арена, и ставит бойца на место
   * держатель. Написать в него чужой код не может — ссылки на него у него
   * нет.
   *
   * Тот же принцип, что у топлива и у фасада THREE: чужому коду не
   * запрещают работать, ему очерчивают, где именно.
   */
  const holder = new THREE.Group();
  holder.name = 'arena';
  holder.add(root);
  /* Измерения (`spanY`, `fallOrientation`, склейка) идут по СПИСКУ МЕШЕЙ и по
     мировым матрицам, поэтому лишний узел между корнем и сценой их не
     трогает: он тождественный, пока арена не поставит бойца. */
  holder.updateMatrixWorld(true);
  return { root: holder, inner: root, length, height: size.y, scale, footprint, meshes };
}

/**
 * THE FIGHTER BAND — the animal is the darkest thing in the picture.
 *
 * ARENA-BRIEF §5 is explicit: "fighters the darkest objects (≤ #8D7F73)", and
 * measured on the shipped capture they were the floor's own value — STONE
 * GOLEM's box medians L 87.3 against a lit floor of L 88.6, with a quarter of
 * its footprint under the brief's ceiling, and its torso panels at L 69.5
 * beside block sun-sides at L 79.3 and block tops at L 90.0. The architecture
 * and the animal were in the same value band, which is why the frame read as
 * an elevation drawing. In the other direction the same bodies reached L 3.4
 * in places — 50 L past the brief the other way, a scribble of near-black.
 *
 * So this is a RANGE COMPRESSION, not a darkening: the body's albedo
 * luminance is mapped affinely and then capped, which pulls a pale plaster
 * shell down under the ceiling and lifts a near-black hollow up off zero. In
 * linear albedo luminance the map is `y · 0.31 + 0.020`, capped at 0.222 —
 * #D8D2C6's 0.65 lands at L 54 (the ceiling), a mid #8D7F73 at L 35 and
 * #1E1D1B's 0.012 at L 17. Specular is tempered with it: an 0.12-rough metal
 * panel under this key put the light straight back at L 88 whatever its
 * albedo, so roughness takes a floor and metalness a ceiling.
 *
 * It is applied to the NODE where a body writes one (every generated body and
 * both stock ones do: the colour is a graph of noise, wear and rust, not a
 * constant) and to `.color` where it does not. Once per material — a cached
 * body handed back for the second side must not be compressed twice.
 * `?bodyband=0` switches it off for a diff.
 */
/**
 * …AND THE TWO SIDE HUES BELONG TO THE MARKS, NOT TO THE MEAT.
 *
 * Measured in `live-fighting.png` inside the foe's own footprint: ring pixels
 * median L 43.5 / S 0.46, body pixels median L 42.4 / S 0.36 at hue 17° — one
 * hue family, 1.1 L apart, and a 6× crop shows the mark and the creature as a
 * single coral blob with the stroke running through the legs. The mark now
 * carries a value sandwich a body cannot imitate (`makeTelegraph`); this is
 * the other half of the same answer. Inside the foe's band (0–25° and 335–360°)
 * and the player's (200–250°) a body's saturation is capped, hue and lightness
 * untouched: a creature may be reddish or bluish, it may not be as saturated
 * as the mark that names its side.
 *
 * RASTER MATERIALS ONLY, deliberately. A body whose colour is a graph
 * (`colorNode` — every generated body and both stock ones) would need a hue
 * test written in TSL, and a hand-written node graph inserted into a
 * model-written one is exactly the class of edit that produced the
 * `reading 'abs'` blocker four review rounds have been chasing. The range
 * compression above is safe there because it is one multiply on a luminance
 * ratio; a branchy hue clamp is not. Recorded as not done rather than done
 * badly.
 */
const ACCENT_S = 0.25;
const _bandHsl = { h: 0, s: 0, l: 0 };
function capAccent(col) {
  col.getHSL(_bandHsl);
  const deg = _bandHsl.h * 360;
  if (!(deg < 25 || deg > 335 || (deg > 200 && deg < 250))) return;
  if (_bandHsl.s <= ACCENT_S) return;
  col.setHSL(_bandHsl.h, ACCENT_S, _bandHsl.l);
}
const BAND_GAIN = 0.31, BAND_LIFT = 0.020, BAND_CEIL = 0.222;
const BAND_ROUGH = 0.75, BAND_METAL = 0.5;
const bandOff = typeof location !== 'undefined' && new URLSearchParams(location.search).get('bodyband') === '0';
function bandBody(meshes) {
  if (bandOff) return;
  const seen = new Set();
  for (const o of meshes) {
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || seen.has(m) || m.userData.__banded) continue;
      seen.add(m); m.userData.__banded = true;
      /*
       * ── AND THE HUE COMES INTO THE WORLD'S BAND FIRST ────────────────────
       *
       * The arena's whole palette is warm — `environment.js` states its own
       * discipline as "a ≤ 3, b 7–11: warm, never pink, never blue" — and
       * ARENA-BRIEF §5 bans blue-grey stone by name. A forge-written body owes
       * that discipline nothing: measured in `live-result-win.png`, the
       * loser's wreckage read #545E69 / #606D79 / #55626F, Lab b* −7.6 to
       * −9.0, beside a floor at b* +6.6 and the winner's own body at +9.4 — a
       * 16-point swing away from the world, lying directly beside the VICTORY
       * card on the beat the player looks at longest.
       *
       * The clamp is one channel and it is the cheapest honest one: blue may
       * not stand above the mean of red and green, which is the linear-space
       * statement of "b* ≥ 0". A cold grey lands on a neutral grey and a warm
       * body is untouched; hue and saturation elsewhere are the model's to
       * choose. Luminance moves by under 1 L (blue carries 0.0722 of it), and
       * the range compression below then runs on the corrected colour. It
       * belongs here rather than upstream because the forge will keep
       * producing cold albedos and the arena is where the world's rule lives.
       */
      try {
        if (m.colorNode) {
          const c0 = m.colorNode;
          const over = c0.b.sub(c0.r.add(c0.g).mul(TSL.float(0.5))).max(TSL.float(0));
          m.colorNode = TSL.vec3(c0.r, c0.g, c0.b.sub(over));
        } else if (m.color) {
          m.color.b = Math.min(m.color.b, (m.color.r + m.color.g) * 0.5);
          capAccent(m.color);
        }
      } catch (e) {
        console.warn(`body warm: ${e.message}`);
      }
      /* a light that is meant to be a light stays one: the glow parts carry
         their brightness on `emissiveNode`/`emissive`, which is untouched */
      try {
        if (m.colorNode) {
          const c = m.colorNode;
          const y = c.r.mul(0.2126).add(c.g.mul(0.7152)).add(c.b.mul(0.0722)).max(TSL.float(1e-4));
          const yo = y.mul(TSL.float(BAND_GAIN)).add(TSL.float(BAND_LIFT)).min(TSL.float(BAND_CEIL));
          m.colorNode = c.mul(yo.div(y));
        } else if (m.color) {
          const y = Math.max(1e-4, 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b);
          const yo = Math.min(BAND_CEIL, y * BAND_GAIN + BAND_LIFT);
          m.color.multiplyScalar(yo / y);
        }
        if (m.roughnessNode) m.roughnessNode = m.roughnessNode.max(TSL.float(BAND_ROUGH));
        else if (typeof m.roughness === 'number') m.roughness = Math.max(BAND_ROUGH, m.roughness);
        if (m.metalnessNode) m.metalnessNode = m.metalnessNode.min(TSL.float(BAND_METAL));
        else if (typeof m.metalness === 'number') m.metalness = Math.min(BAND_METAL, m.metalness);
        m.needsUpdate = true;
      } catch (e) {
        console.warn(`body band: ${e.message}`);
      }
    }
  }
}

/**
 * The lowest point of this body's geometry right now, in world Y.
 *
 * The obvious thing — measure the bounding box once at rest and lift by that —
 * is what shipped first, and it buries a corpse: `bodies/gorilla.js`'s `die`
 * pose reaches 2.07 m below its own origin against a rest-measured 0.02 m. The
 * second thing that shipped was a table sampled at load, nine actions by
 * sixteen phases by eight speed bins, and it is wrong in a subtler way: it
 * samples `turn: 0, health: 1, grounded: true` and the fight is full of
 * turning, wounded, airborne bodies. Swept on the two stock files,
 * `bodies/octopus.js`'s own pose drops from -0.102 m at turn 0 to -0.492 m at
 * turn ±1 and -0.567 m at a quarter health — nearly half a metre the table
 * never saw. Measured over 12 matches / 16 573 live fighter-frames, geometry
 * was below the floor plane in 35.7% of them, worst -0.544 m on a body 1.13 m
 * tall.
 *
 * So the pose is measured after it is struck, not predicted from a key. There
 * is no key left to get wrong, and no interpolation between bins to smooth over
 * the states that matter.
 */
const _span = { min: 0, max: 0 };
function spanY(body) {
  let lo = Infinity, hi = -Infinity;
  for (const o of body.meshes) {
    const e = o.matrixWorld.elements;
    const ax = e[1]; const ay = e[5]; const az = e[9];
    /*
     * У склеенного меша части запомнены ориентированными (см. `bake.js`):
     * центр и три полуоси. Размах вдоль вертикали мировой матрицы считается по
     * ним точно, а одна общая коробка разрасталась бы при повороте и поднимала
     * бы тело над полом.
     */
    if (o.userData.subParts) {
      for (const p of o.userData.subParts) {
        const c = ax * p.c.x + ay * p.c.y + az * p.c.z + e[13];
        const r = Math.abs(ax * p.u.x + ay * p.u.y + az * p.u.z)
          + Math.abs(ax * p.v.x + ay * p.v.y + az * p.v.z)
          + Math.abs(ax * p.w.x + ay * p.w.y + az * p.w.z);
        if (c - r < lo) lo = c - r;
        if (c + r > hi) hi = c + r;
      }
      continue;
    }
    {
    const bb = o.geometry.boundingBox;
    // row 1 of the world matrix is all that contributes to Y: the box's centre
    // projects onto it, and its half-extents project onto the absolute values
    const c = ax * (bb.min.x + bb.max.x) * 0.5 + ay * (bb.min.y + bb.max.y) * 0.5
      + az * (bb.min.z + bb.max.z) * 0.5 + e[13];
    const r = Math.abs(ax) * (bb.max.x - bb.min.x) * 0.5
      + Math.abs(ay) * (bb.max.y - bb.min.y) * 0.5
      + Math.abs(az) * (bb.max.z - bb.min.z) * 0.5;
    if (c - r < lo) lo = c - r;
    if (c + r > hi) hi = c + r;
    }
  }
  _span.min = lo; _span.max = hi;
  return _span;
}

/**
 * Which way this body has to turn to end up lying on the ground.
 *
 * Both `die` poses are authored as a collapse about the rig's own hip, and at
 * phase 1 they end up standing on end. Measured on the two stock files (they
 * are named below by their file names, not by anything in the game):
 * `bodies/gorilla.js` spans 2.601 m in Y — taller than its own 2.079 m standing
 * pose — with 2.056 m of it below the floor, and `bodies/octopus.js` 1.853 m
 * against a 1.127 m standing height. Anything that lifts that back out of the
 * floor produces a corpse TALLER than the living animal, propped on one limb,
 * which is what shipped.
 *
 * So the fall is searched rather than typed: the death pose is struck once at
 * load, turned through every 15 degrees of body-local pitch and roll within
 * ±90, dropped onto the floor, and scored by where its MASS ends up — the
 * volume-weighted mean height of its geometry, which is the potential energy
 * gravity would have taken out of it. Ties inside 3 cm go to the shortest turn.
 *
 * Height alone was tried first and it cannot tell a corpse from a crouch: both
 * ±90 degrees of roll leave `bodies/gorilla.js` exactly 1.777 m tall, but at
 * -90 it comes to rest propped on its own limbs with its mass at 0.960 m and at
 * +90 it is on its back with its mass at 0.817 m, and only one of those reads
 * as dead. What the search settles on: `bodies/gorilla.js` 15/90, its mass
 * falling from 1.398 m to 0.706 m and its height from 2.601 m to 1.754 m
 * against a 2.079 m standing pose; `bodies/octopus.js` 30/90, mass 1.074 m to
 * 0.406 m, height 1.853 m to 1.034 m against 1.127 m standing. Both corpses
 * end up lower and wider than the living animal, which is the whole point —
 * the silhouette has to say it.
 *
 * The rotation is applied in Y-X-Z order at draw time so pitch and roll stay in
 * the BODY's frame: in the default X-Y-Z the pitch would be a world-space tip
 * and everything measured here would only hold for a corpse facing north.
 */
function fallOrientation(body) {
  const keepP = body.root.position.clone();
  const keepR = body.root.rotation.clone();
  body.root.position.set(0, 0, 0);
  body.root.rotation.set(0, 0, 0, 'YXZ');
  body.inner.userData.pose({
    t: 0, dt: 1 / 60, speed: 0, stride: 0, turn: 0,
    grounded: true, health: 0, action: 'die', phase: 1,
  });
  /** Volume-weighted mean height of the posed geometry, in world Y. */
  const massY = () => {
    let sum = 0, w = 0;
    for (const o of body.meshes) {
      const bb = o.geometry.boundingBox;
      const e = o.matrixWorld.elements;
      const vol = (bb.max.x - bb.min.x) * (bb.max.y - bb.min.y) * (bb.max.z - bb.min.z) + 1e-9;
      const cy = e[1] * (bb.min.x + bb.max.x) * 0.5 + e[5] * (bb.min.y + bb.max.y) * 0.5
        + e[9] * (bb.min.z + bb.max.z) * 0.5 + e[13];
      sum += cy * vol; w += vol;
    }
    return sum / w;
  };
  const tried = [];
  for (let ix = -6; ix <= 6; ix++) {
    for (let iz = -6; iz <= 6; iz++) {
      body.root.rotation.set((ix * Math.PI) / 12, 0, (iz * Math.PI) / 12, 'YXZ');
      body.root.updateMatrixWorld(true);
      const s = spanY(body);
      // scored as it would be drawn: standing on the floor, not where the pose
      // happens to have left it
      tried.push({
        ix, iz, turn: Math.abs(ix) + Math.abs(iz),
        rest: massY() - s.min, height: s.max - s.min,
      });
    }
  }
  const lowest = Math.min(...tried.map((t) => t.rest));
  let best = null;
  for (const t of tried) {
    if (t.rest > lowest + 0.03) continue;
    if (!best || t.turn < best.turn) best = t;
  }
  body.root.position.copy(keepP);
  body.root.rotation.copy(keepR);
  return {
    rx: (best.ix * Math.PI) / 12, rz: (best.iz * Math.PI) / 12,
    height: +best.height.toFixed(3), rest: +best.rest.toFixed(3),
  };
}

const bodies = {};

/**
 * ОДИН КОНТЕКСТ на оба вызова `vfx.play` (docs/VFX-PLAN.md §7.1).
 *
 * `bodyPos` — где тело сейчас (эффект, привязанный к телу, идёт за ним).
 * `bodyShape` — КАПСУЛА тела: она нужна всему, что живёт на его поверхности,
 * — щиту, удару по жертве, статусу. Радиус берётся из `footprint` СЫРОЙ
 * модели (это её размер ДО масштаба, у осьминога 3.94 модельных единицы) и
 * потому обязан быть умножен на `scale`: `footprint·scale/2` — это ровно
 * радиус коллайдера в метрах. `height` меряется ПОСЛЕ масштаба, то есть уже
 * в метрах. Модуль, которому капсулы не дали, рисует шар — см. `arc/self.js`.
 */
const FX_CTX = {
  bodyPos: (who) => (bodies[who] ? bodies[who].root.position : null),
  bodyShape: (who) => {
    const b = bodies[who];
    if (!b) return null;
    const p = b.root.position;
    return {
      x: p.x, y: p.y, z: p.z,
      r: Math.max(0.5, b.footprint * b.scale * 0.5),
      h: Math.max(0.8, b.height || 2.0),
      yaw: b.root.rotation.y,
    };
  },
};

/**
 * Поставить на сторону другое тело.
 *
 * Тела грузились один раз при старте и держались весь сеанс — правильно,
 * пока их два. Как только тело генерируется, «кто дерётся» меняется от боя
 * к бою, и картинка обязана меняться вместе с ним.
 *
 * Три вещи здесь важнее краткости.
 *
 *   Старое тело снимается со сцены и его геометрия освобождается. Зритель
 *   смотрит трансляцию часами; тело, оставленное в памяти на каждый бой, —
 *   это утечка, которая проявится как «через сорок минут вкладка умирает».
 *
 *   Загрузка асинхронная, а боёв может прийти несколько подряд. Поэтому у
 *   каждой загрузки свой номер, и опоздавшая не затирает актуальную.
 *
 *   Падение НЕ фатально: при любой ошибке на стороне остаётся СТОКОВОЕ
 *   тело стороны (`STOCK_BODY`). Существо будет выглядеть не собой — но бой
 *   будет виден, и это несравнимо лучше пустой сцены. Причина уходит в
 *   консоль и в `airena:bodyfail`, чтобы отказ был заметен, а не проглочен.
 */
/*
 * СЧЁТЧИК ЭПОХ — ПО СТОРОНЕ, А НЕ ОДИН НА ДВОИХ.
 *
 * Он был общий, и это молча съедало половину всей генерации тел. `sendMatch`
 * зовёт `swapBody` для обоих бойцов в одном цикле и БЕЗ `await`: оба вызова
 * успевают увеличить счётчик до первого ожидания, поэтому к моменту, когда
 * тело первого бойца собралось, `mine` уже отстал от `bodyEpoch` — и готовое
 * тело выбрасывалось охраной от гонки. Охрана предназначалась для двух
 * загрузок ОДНОЙ стороны, а срабатывала на двух сторонах одного боя.
 *
 * Пострадавшая сторона всегда одна и та же — та, что в цикле первая, то есть
 * СИНЯЯ. Замерено по последним 2000 матчам: существо с клон-телом заняло
 * 1065 левых слотов и 58 правых — то есть слева зритель видел не тело
 * существа, а её запаску `/bodies/octopus.js`. Отсюда и жалоба основателя:
 * «2 осьминога очень часто вижу с разными именами» — он назвал видом то, что
 * было запаской синей стороны. Имена разные, тело одно, потому что своё тело
 * левому бойцу не доезжало НИКОГДА.
 *
 * Хуже всего было то, что дефект самозакрепляющийся: `bodyRefOf[id]` пишется
 * ДО загрузки, поэтому повторный вызов с той же ссылкой выходил на первой
 * строке, и второго шанса у стороны не было до конца боя.
 */
const bodyEpoch = { blue: 0, orange: 0 };
/** Whether the render catch has already detached both bodies (see `evictBodies`). */
let evicted = false;
/** How many times it has done so this session, and what it took out. */
let evictions = 0;
const evictedRoots = new Map();
/** How many rounds of evict-and-restore before the fighters stay out. */
const EVICT_MAX = 3;
const bodyRefOf = {};

/**
 * Построенные тела, по ссылке.
 *
 * Без кэша каждый бой — это заново скачать сто тридцать килобайт, заново их
 * скомпилировать и заново собрать шесть тысяч мешей. Замерено: сборка
 * сгенерированного тела — 552 мс на главном потоке, и она не одна, а по одной
 * на сторону, каждую минуту. Зритель, оставивший вкладку открытой, получал бы
 * заикание ровно в момент начала боя — то есть ровно тогда, когда смотрит.
 *
 * Кэш возможен именно потому, что тело неизменяемо (F2: новое существо —
 * новый id), и потому ключ — ссылка, а не содержимое.
 *
 * Потолок нужен: боёв за сеанс много, тел столько же, и шесть тысяч мешей на
 * каждое — это память, которая иначе не вернётся. Выбрасывается самое
 * давнее; те два, что стоят на сторонах прямо сейчас, не выбрасываются
 * никогда, иначе кэш убивал бы то, что рисует.
 */
const BODY_CACHE_MAX = 6;
const bodyCache = new Map();
/* Все корни тел, что когда-либо строились: по нему `syncBodies` отличает
   тело от арены, не полагаясь на имя, которое задаёт чужая модель. */
const bodyRoots = new WeakSet();
/* см. `__airenaBodies`: последний посчитанный вид, только для диагностики. */
let lastView = null;

async function bodyFor(ref, kind, size = 1) {
  /* Ключ кэша включает РАЗМЕР: одно и то же тело на 0.75 и на 1.5 — это два
     разных меша, и отдать из кэша чужой масштаб значило бы нарисовать
     существо не того размера, что дерётся. */
  /*
   * ── И СТОРОНУ. ЭТО НЕ ОПТИМИЗАЦИЯ, А УСЛОВИЕ ПРАВИЛЬНОСТИ ────────────────
   *
   * Ключ был `ref@size`, без стороны, и ломал сразу две вещи.
   *
   * Первая: масштаб тела считается ПО СТОРОНЕ — `loadBody` берёт
   * `cfg.fighters[kind].radius`, а он приезжает с сервера НА СТОРОНУ и
   * сторонам вольно разойтись (когда-то было 1.0 против 1.25). Тело,
   * собранное для синей стороны и отданное из кэша оранжевой, приезжало бы
   * не по своему коллайдеру.
   *
   * Вторая и хуже: при одинаковой ссылке обе стороны получали ОДИН И ТОТ ЖЕ
   * объект. Тогда `bodies.blue` и `bodies.orange` — это одна ссылка, цикл
   * кадра ставит её сначала в точку левого бойца, потом в точку правого,
   * и на арене остаётся ОДНО тело: правое едет, левый выглядит бестелесным.
   * А одинаковая ссылка — не редкость: двадцать четыре существа в базе носят
   * клонированные тела, и встреча двух таких попадала в этот случай всегда.
   *
   * Комментарий в `swapBody` всё это время обещал обратное — «вторая сторона
   * честно строит свой экземпляр под своим ключом». Обещание было, ключа не
   * было.
   */
  const key = `${ref}@${size}@${kind}`;
  const hit = bodyCache.get(key);
  if (hit) { bodyCache.delete(key); bodyCache.set(key, hit); return hit; }
  const made = await loadBody(ref, kind, size);
  /* The floor mirrors what stands on REFLECT_LAYER and nothing else: the
     bodies go on it, the arena never does (`environment.js`). Without this
     the reflector's pass draws the background alone and the floor mirrors
     nothing. */
  made.root.traverse((o) => o.layers.enable(REFLECT_LAYER));
  made.fall = fallOrientation(made);
  made.root.visible = false;
  /*
   * ── КЭШ ДЕРЖИТ ТЕЛО В ПАМЯТИ, А НЕ В СЦЕНЕ ────────────────────────────────
   *
   * Здесь стояло `scene.add(made.root)` — то есть каждое загруженное тело
   * оставалось в графе сцены навсегда, просто с `visible = false`. Кэш на шесть
   * тел означал до шести графов в сцене одновременно.
   *
   * Невидимое тело не рисуется: сборка списка отрисовки обрывается на первом
   * же `visible === false`. Но `updateMatrixWorld` обходит граф ЦЕЛИКОМ,
   * независимо от видимости, — и вот это стоит кадров.
   *
   * Замерено в настоящем Chrome (профайлер, дев-сервер, живой бой): в сцене
   * было 17 032 меша при двух видимых телах на 4 154. Удаление невидимых
   * подняло кадры с 17.5 до 40.8 в секунду — то есть больше чем вдвое, и это
   * при том, что разрешение на кадры не влияет вовсе (проверено уменьшением
   * канваса вчетверо: 33.9 → 34.0).
   *
   * Тело добавляется в сцену, когда его показывают, и убирается, когда
   * прячут (`swapBody`). Кэш при этом продолжает держать ссылку — ради него
   * он и заведён: вернувшееся тело не грузится заново.
   */
  bodyCache.set(key, made);
  bodyRoots.add(made.root);
  while (bodyCache.size > BODY_CACHE_MAX) {
    const oldest = bodyCache.keys().next().value;
    if (Object.values(bodyRefOf).includes(oldest)) break;
    const dead = bodyCache.get(oldest);
    bodyCache.delete(oldest);
    scene.remove(dead.root);
    disposeBody(dead);
  }
  return made;
}

async function swapBody(id, ref, size = 1) {
  /* Ключ сравнения — ссылка, размер И СТОРОНА, ровно тот же, что у кэша в
     `bodyFor`. Это не украшение: защита кэша от вытеснения живого тела
     сравнивает `bodyRefOf` с ключами кэша (`Object.values(bodyRefOf).includes`),
     и стоит этим двум строкам разойтись — кэш выбросит и УНИЧТОЖИТ тело,
     которое прямо сейчас на экране. */
  const want = `${ref}@${size}@${id}`;
  if (bodyRefOf[id] === want) return;
  const mine = ++bodyEpoch[id];
  bodyRefOf[id] = want;
  try {
    const next = await bodyFor(ref, id, size);
    /* Отстали только если ЭТУ ЖЕ сторону успели перезапросить. Соседний боец
       к этому отношения не имеет — у него свой счётчик. */
    if (mine !== bodyEpoch[id]) return;
    /* Одно и то же тело на обеих сторонах — законный случай: два существа,
       рождённые одним промптом, выглядят одинаково. Клонировать граф ради
       этого нельзя (материалы и шейдеры общие), поэтому вторая сторона
       честно строит свой экземпляр под своим ключом. */
    const prev = bodies[id];
    /*
     * A PER-BODY PRECOMPILE WAS TRIED HERE AND TAKEN OUT AGAIN. Recorded
     * because it is the obvious next idea and it does not work.
     *
     * The reasoning was F6's: a generated body's pipelines are built inside
     * the first `post.render()` that draws it, so compiling them off the main
     * thread first ought to buy back the seconds. Measured over the six live
     * states, it bought nothing — `drawn.firstMs` stayed at 2.6–4.3 s, because
     * that number is the POST GRAPH's own pipelines (GTAO, the denoise, the
     * bloom mip chain, SMAA), which live outside the scene pass and which the
     * boot precompile never touched. Warming those is `post.renderAsync()`,
     * and it is done once before the loop.
     *
     * What the attempt DID cost is a race: `PassNode.compileAsync` points the
     * renderer at the pass's own target for the length of its promise, so the
     * draw has to be held while it runs, and any deadline on that hold is a
     * frame drawn into a half-built pipeline — `TypeError: parameter 1 is not
     * of type 'GPURenderPipeline'` in `live-visitor-w`. A body whose material
     * throws is caught where it always was: the catch below puts the side on
     * its stock body, and `drawFrame`'s own catch keeps the picture graded
     * while that arrives.
     */
    if (prev && prev !== next) prev.root.visible = false;
    bodies[id] = next;
    next.root.visible = true;
    if (!next.root.parent) scene.add(next.root);
    /* A body that arrives is a body the eviction has not judged: the budget is
       given back and whatever is still detached comes back with it — except
       this side's own retired root, which `restoreBodies` skips because
       `bodies[id]` no longer points at it. */
    evictions = 0;
    restoreBodies();
    evictedRoots.delete(id);
    syncBodies();
  } catch (e) {
    bodyRefOf[id] = null;
    console.warn(`body ${ref} did not build:`, e.message);
    dispatchEvent(new CustomEvent('airena:bodyfail', { detail: { side: id, ref, message: e.message } }));
    /*
     * ОТКАТ К СТОКОВОМУ ТЕЛУ СТОРОНЫ, А НЕ «ОСТАВИТЬ КАК БЫЛО».
     *
     * Шапка обещает: при любой ошибке на стороне остаётся её стоковое тело.
     * На деле оставалось тело ПРЕДЫДУЩЕГО СУЩЕСТВА — то, которое стояло здесь
     * в прошлом бою, — и обещание было враньём ровно в том случае, ради
     * которого писалось. Зритель видел чужое существо под новым именем и
     * никак не мог этого распознать.
     *
     * Рекурсия ограничена условием `ref !== STOCK_BODY[id]`: запаска
     * запрашивается не более одного раза, и если не собралась уже она, сцена
     * остаётся с тем, что есть, — но это уже отказ самого вьюера, а не
     * подмена.
     */
    if (ref !== STOCK_BODY[id]) swapBody(id, STOCK_BODY[id], size);
  }
}

/**
 * Сцена приводится в соответствие со сторонами — одной сверкой, а не цепочкой
 * побочных эффектов.
 *
 * Сначала я расставил `scene.add` и `scene.remove` по путям подмены, и это
 * сломалось дважды подряд: сперва тело оставалось в сцене после подмены
 * (лишние 4078 вызовов отрисовки, кадры с 35 до 17), потом наоборот — боец
 * стоял `visible = true`, но без родителя, то есть был невидим на арене.
 * Путей больше, чем кажется: одно тело на обеих сторонах, попадание в кэш,
 * вытеснение из кэша, гонка двух загрузок (`bodyEpoch`).
 *
 * Сверка не зависит от пути. Она говорит, каким сцена ОБЯЗАНА быть: ровно два
 * корня, те, что лежат в `bodies`. Всё лишнее убирается, всё недостающее
 * добавляется, и порядок вызовов перестаёт иметь значение.
 *
 * Стоит это обходом детей сцены (несколько десятков) и только при подмене.
 */
/*
 * Наблюдаемость сцены — иначе тело чинится вслепую.
 *
 * Дважды подряд дефект «тело не едет за бойцом» приходилось искать чтением
 * кода: со стороны страницы `bodies`, `bodyRefOf` и содержимое сцены не видны
 * ниоткуда, а именно их расхождение и есть весь дефект. Хук отдаёт СЛЕПОК, а
 * не сами объекты: ссылки на граф сцены наружу — это приглашение подержать
 * их живыми и получить утечку, которой в профайлере не видно.
 */
window.__airenaBodies = () => ({
  refOf: { ...bodyRefOf },
  sides: Object.fromEntries(['blue', 'orange'].map((id) => {
    const b = bodies[id];
    return [id, b ? {
      visible: b.root.visible,
      inScene: b.root.parent === scene,
      pos: [+b.root.position.x.toFixed(2), +b.root.position.y.toFixed(2), +b.root.position.z.toFixed(2)],
      poseFailed: b.inner.userData.poseFailed || null,
      meshes: (() => { let n = 0; b.root.traverse((o) => { if (o.isMesh) n++; }); return n; })(),
    } : null];
  })),
  /* Тела в сцене, которых нет ни на одной стороне: ровно то, что выглядит как
     «существо стоит и не двигается» — осиротевший граф на старом месте. */
  orphans: scene.children.filter((c) => bodyRoots.has(c)
    && !Object.values(bodies).some((b) => b && b.root === c))
    .map((c) => ({ pos: [+c.position.x.toFixed(2), +c.position.z.toFixed(2)], visible: c.visible })),
  cache: bodyCache.size,
  /* То, что цикл кадра положил в тела: если тело стоит, а здесь координаты
     живые — виноват цикл; если и здесь ноль — виновата интерполяция. */
  view: lastView ? Object.fromEntries(Object.entries(lastView)
    .map(([k, v]) => [k, { x: +(+v.x).toFixed(2), z: +(+v.z).toFixed(2), y: +(+v.y).toFixed(2) }])) : null,
  /* Последний пришедший кадр боя — сырой, как его прислал сервер. Именно из
     него берутся координаты тел, и когда тело стоит, вопрос ровно один:
     стоит ли оно в кадре или его туда не положили. */
  frame: frames.length ? (() => {
    const f = frames[frames.length - 1];
    const one = (id) => (f[id] ? { x: +(+f[id].x).toFixed(2), z: +(+f[id].z).toFixed(2), hp: f[id].hp } : null);
    return { t: f.t, keys: Object.keys(f), blue: one('blue'), orange: one('orange') };
  })() : null,
});

function syncBodies() {
  const live = new Set(Object.values(bodies).filter(Boolean).map((b) => b.root));
  for (const child of scene.children.slice()) {
    if (bodyRoots.has(child) && !live.has(child)) {
      child.visible = false;
      scene.remove(child);
    }
  }
  for (const root of live) if (root.parent !== scene) scene.add(root);
}

function disposeBody(b) {
  b?.root?.traverse?.((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
    else m?.dispose?.();
  });
}

/* Стороны открываются на своих запасках: до первого `match` неизвестно, кто
   дерётся, а пустая сцена читается как сломанная страница. Имя файла берётся
   из `STOCK_BODY` — сторона зовётся цветом, файл на диске зовётся иначе. */
for (const id of ['blue', 'orange']) {
  try {
    bodies[id] = await bodyFor(STOCK_BODY[id], id);
    bodies[id].root.visible = true;
    /* Сцену приводит в соответствие `syncBodies`, а не этот цикл: одно место,
       которое знает, что в сцене должно лежать. */
    syncBodies();
    bodyRefOf[id] = STOCK_BODY[id];
  } catch (e) {
    fail(`body "${STOCK_BODY[id]}" failed to build for the ${id} side: ${e.message}`);
  }
}

/** Per-fighter animation state that lives between frames. */
const anim = {
  blue: { stride: 0, turn: 0, lastX: null, lastZ: null, hitUntil: 0, lastHp: null },
  orange: { stride: 0, turn: 0, lastX: null, lastZ: null, hitUntil: 0, lastHp: null },
};

// ---------------------------------------------------------------------------
// effects
// ---------------------------------------------------------------------------

/*
 * The side colours: `--info` for blue, `--accent` for orange — the two tokens
 * the HUD's bars, dots and feed use, so the floor and the panel agree
 * (docs/REDESIGN.md §2.1). `COLOR` is the hex, for the DOM (feed lines, damage
 * numbers, the result card); `SCENE_COLOR` is the same hex inverted through
 * the tone map (`preTone`), for every material this file builds — fed raw,
 * the blue renders #85CAD8-grey under ACES; pre-toned it renders #70A7F7, the
 * nearest the curve can reach. White too: raw linear (1, 1, 1) tone-maps to
 * #E2E2E2, a light grey, and the i-frame blink is the one moment that must
 * read as WHITE; pre-toned (14.5 per channel) the curve puts it on #FFFFFF.
 */
/*
 * ── COLOUR IS OWNERSHIP, NOT SLOT (founder, 06.09; reports/arena/ARENA-AAA.md)
 *
 * Blue is the player's creature. Orange is the opponent. Always, on every
 * surface: the ring under the feet, the floor telegraph, the aim line, the
 * cast plate, the say-bubble, the damage pill, the feed's name, the ghost
 * silhouette, the winner's line on the banner.
 *
 * The server says which SLOT is the viewer's (`match.mine`), and the slot is
 * still what everything downstream is keyed by — `tele.blue`, `bodies.orange`,
 * `cfg.fighters[id]`. So ownership is not a second keying: it is a re-tint of
 * the ONE table every drawing site already reads. `COLOR.orange` simply holds
 * the blue hue for the fights in which the player's creature was dealt the
 * orange slot, and not one call site changes.
 *
 * What this replaces is the argument in the D162 note below, which is kept
 * because its OTHER half still stands: the founder's answer to "then the plate
 * and the ring disagree" was that they must not — and they do not, because
 * every one of them moves together, in one function, on the frame the match
 * arrives (`applySides`).
 *
 * A spectator with no creature in the fight keeps the slot colours
 * (`SLOT_ROLE`): telling a stranger that one of the two is "theirs" would be
 * the one thing worse than an arbitrary pair of hues.
 */
const HUE = { own: 0x6EA8FF, foe: 0xFF7A5C };
const HUE_RIM = { own: 0x4E78B9, foe: 0xBE5943 };
/** With no creature in the fight the slots keep their names: first slot blue. */
const SLOT_ROLE = { blue: 'own', orange: 'foe' };
/**
 * Which ROLE a slot is wearing right now — the one place ownership is decided.
 * `mineSide` is declared below and is null until the first `match`.
 */
const sideRole = (id) => (mineSide ? (id === mineSide ? 'own' : 'foe') : SLOT_ROLE[id]);
const COLOR = { blue: HUE.own, orange: HUE.foe };
const SCENE_COLOR = { blue: toned(HUE.own), orange: toned(HUE.foe) };
/**
 * THE TELEGRAPH RIM CARRIES VALUE, NOT ONLY HUE.
 *
 * Measured on the shipped capture, the coral ring's peak stroke is #F56E56 and
 * the blue ring's #608AEC against a floor of #DFD2C4 — 1.95:1 and 2.23:1. They
 * read in colour at 1440, but a 2:1 telegraph is thin in motion, thin at
 * 390 px where the arena is 180 px tall, and gone for a reader who cannot
 * separate coral from blue. These are the same two hues taken down in LINEAR
 * luminance until each is 3:1 against the plaza (#4E78B9 and #BE5943, both at
 * Y 0.185): the hue is the side, the value is the warning, and the warning now
 * survives a greyscale frame. The filled disc inside it is a different
 * problem again and has its own answer — see `HUE_FILL`.
 */
const RIM_COLOR = { blue: toned(HUE_RIM.own), orange: toned(HUE_RIM.foe) };
/*
 * ── AND THE FILL UNDER THE FEET IS A LIFT, NOT A SHADOW ───────────────────
 *
 * The disc inside the ring was `SCENE_COLOR` at 16 % over the plaza, and on
 * an L 86 warm floor a 16 % wash of a saturated blue is a DARKENING: measured
 * on `live-fighting.png` the own fill read #DACCCE, L 82.6 against a floor of
 * 85.7, and on `live-visitor.png` #C2B8C9, L 76.6 against 85.1 — 8.5 L down,
 * 22 % of Y, where the brief caps a telegraph umbra at 13 % so a zone never
 * reads as shade. Worse, the composite of `--info`'s 277° over a 78° floor
 * lands at Lab hue 313–340: the player's own mark read PINK-VIOLET, the one
 * cast section 5 bans, on the beat the card had just said "you are blue".
 *
 * A colour cannot be both `--info` and the floor's own value, so the fill
 * takes `--info`'s HUE at the floor's VALUE: #A9CBFF and #FF9F87, the two
 * accents lifted until a 34 % wash lands within a lightness of the plaza.
 * Computed against the measured floor (#E3D4C2) through the same ACES the
 * frame is graded with: own → sRGB (213,209,241), L 85.0, Lab hue 296, C 17;
 * foe → (235,201,181), L 83.3, Lab hue 58, C 17. Both inside 1 L of a floor
 * the brief allows 6 — a mark that is legible in colour and invisible in
 * greyscale, which is the opposite of the rim's contract one radius out.
 *
 * A THIRD LIST, not a third palette. `sideMats` carries every material that
 * wears the side's own colour and `rimMats` those that wear its value; the
 * fill wears neither, so it gets its own list and `applySides` writes all
 * three in the same loop. One decision, three tables, no second keying.
 */
const HUE_FILL = { own: 0xA9CBFF, foe: 0xFF9F87 };
const FILL_COLOR = { blue: toned(HUE_FILL.own), orange: toned(HUE_FILL.foe) };
/** How much of the floor the fill replaces — see `HUE_FILL` for the arithmetic. */
const FILL_ALPHA = 0.34;
const WHITE = toned(0xffffff);
/* A missed cone is drawn in a neutral, pre-toned like the rest. */
const MISS_COLOUR = toned(0x8a8f99);
/*
 * THE MARK'S VALUE SANDWICH — the two strokes a creature's albedo cannot be.
 *
 * See `makeTelegraph`: the side's hue says WHOSE the mark is and these two say
 * that it IS a mark. Both are on the world's warm axis and inside the brief's
 * bounds — `MARK_SHADE` is #3A3430 (L 21.5, well under the L 30 the reading
 * asks for and darker than any fighter the brief allows at #8D7F73 / L 57.5),
 * `MARK_EDGE` is #F2ECE6 (L 93.0, under the #F4EEE8 / L 94.4 ceiling that is
 * the brightest thing in the world). Neither is saturated, so neither counts
 * against the two accents the brief allows.
 */
const MARK_SHADE = toned(0x3A3430);
const MARK_EDGE = toned(0xF2ECE6);

/*
 * ── КАКОГО ЦВЕТА ОПАСНАЯ ЗОНА (D162, решение основателя 01.09) ────────────
 *
 * Дословно: «глянь ещё на визуальное различие зон ударов. Сейчас они все
 * помечаются красным — нужно сделать так, чтобы было понятно, где твоя зона,
 * а где врага. Например, синим и оранжевым, как это сделано везде.»
 *
 * Было: и конус, и полоса рисовались литералом `0xff4d3d` у ОБЕИХ сторон.
 * Зона, которая сейчас ударит тебя, была пиксель в пиксель как та, которую
 * кастует твоё существо. Красный при этом не значил «опасно» — он значил
 * «замах», потому что другого замаха на экране не было.
 *
 * Стало: цвет фигуры на полу — ЦВЕТ ТОГО, КТО ЕЁ КАСТУЕТ, тот же циан и тот
 * же оранж, что у плиты с именем, у кольца под ногами, у линии прицела и у
 * всплывающей цифры урона. Это и есть «как это сделано везде»: одна палитра
 * на всю сторону, а не вторая палитра только для зон.
 *
 * ПОЧЕМУ НЕ «моё синее, чужое оранжевое» БУКВАЛЬНО. Потому что сторона
 * раздаётся по сиду матча и в половине боёв существо игрока И ЕСТЬ оранжевая
 * сторона. Красить его зоны синими значило бы завести ВТОРУЮ систему цветов,
 * противоречащую первой: плита оранжевая, кольцо оранжевое, урон оранжевый —
 * а зона синяя. Человек читает экран целиком, и такой
 * разнобой хуже одинакового красного.
 *
 * ЧТО ОТВЕЧАЕТ НА ВОПРОС «ГДЕ МОЯ». Две вещи, и обе явные:
 *   1. Плита своего существа помечена словом (см. `mineSide` ниже) — цвет
 *      привязывается к стороне один раз и дальше читается сам.
 *   2. ЯРКОСТЬ несёт угрозу отдельно от цвета: зона противника рисуется
 *      плотнее собственной. Оттенок говорит «чьё», плотность — «в кого».
 *      Две независимые оси на две независимые вещи.
 */

/**
 * Какая сторона принадлежит зрителю: 'blue', 'orange' или null.
 *
 * Приходит с сервера в сообщении `match` полем `mine` — считается ТАМ, потому
 * что там уже лежит id существа этого сокета. Клиент второй раз этого не
 * решает: два источника принадлежности разошлись бы ровно в тот момент, когда
 * игрок сменил существо посреди боя.
 */
let mineSide = null;

/**
 * Множитель плотности телеграфа: своя фигура тише, чужая громче.
 *
 * 1.0 для обоих, когда своего существа в бою нет (гость, чужой бой): врать
 * зрителю, что одна из сторон его, нельзя, а без принадлежности «громче»
 * значило бы просто «оранжевее».
 */
function threatGain(id) {
  if (!mineSide) return 1;
  /*
   * 0.85, а не 0.62.
   *
   * Первое число отняло у СОБСТВЕННОГО замаха ровно то, ради чего замах
   * существует: замер дал 1.06–1.19:1 против пола, тогда как прежний красный
   * держал 1.23–1.68. Плотность обязана различать «чьё», а не прятать одно из
   * двух: в автобатлере игрок читает по замаху собственного существа, что оно
   * сейчас сделает, не меньше, чем по чужому.
   *
   * Разница 0.85 против 1.25 — это полтора раза, и её видно; при этом нижняя
   * граница остаётся выше старой базовой, потому что контур фигуры теперь
   * несёт читаемость сам (`telegraphMat`).
   */
  return id === mineSide ? 0.85 : 1.25;
}
/*
 * `INK_COLOR` здесь БЫЛ и убран вместе со светлой темой (30.08).
 *
 * Он существовал ради одной задачи: на белой арене светящийся циан давал
 * 1.74:1, и плоский текст поверх сцены — лента боя, реплика, всплывающий урон,
 * подпись победителя — переставал читаться. На тёмном фоне ровно эти
 * светящиеся цвета читаются лучше всего, и второй набор не нужен.
 *
 * Если светлая тема вернётся, вернётся и он: разделение на «цвет материала» и
 * «цвет плоского текста» — не украшение, а следствие того, что у текста нет ни
 * объёма, ни тени, ни свечения, только цвет.
 */

/**
 * Lay a flat geometry on the ground so that its local +Y becomes world +Z.
 *
 * The sign is the whole point and it was wrong for a while. Rotating -PI/2
 * about X sends local +Y to world MINUS Z, so every ground telegraph and the
 * smash effect were drawn a half-turn away from the direction the skill
 * actually went — a danger zone painted behind the body that was about to
 * swing. It looked entirely plausible in a screenshot, which is why there is
 * now a load-time check (see `checkTelegraphOrientation`) rather than an eye.
 *
 * +PI/2 puts the face normal downwards, so anything using this needs
 * DoubleSide; that is cheaper than another sign to get wrong.
 */
function layFlat(obj) { obj.rotation.x = Math.PI / 2; return obj; }
/** Point a laid-flat object along a simulation heading. */
function faceHeading(obj, h) { obj.rotation.z = -h; return obj; }

/**
 * Metres of travel per gait cycle, as a fraction of body length.
 *
 * The gait phase accumulates by DISTANCE, which is the part that matters: drive
 * it by time instead and the feet skate every time the body accelerates, is
 * knocked back, or is held against a wall — which in this game is most of the
 * match. This constant only sets how many cycles that distance buys, and it is
 * the one number in the bridge that has to be judged by eye: too small and the
 * legs churn, too large and they drag. Exposed here rather than buried in the
 * expression so it can be moved without hunting for it.
 */
const STRIDE_PER_LENGTH = 0.85;

/**
 * Metres of ground per body length, for the SPEED the pose functions read.
 *
 * The obvious divisor is the measured AABB, and that is what shipped: it is the
 * one number in the file that is already known. It is also the wrong one. The
 * AABB measures the animal nose to tail, and no animal covers its own length in
 * a stride. Measured on the two stock files — 2.5 m for `bodies/gorilla.js`,
 * 2.0 m for `bodies/octopus.js` — top speed came out at 2.14 and 2.43 body
 * lengths per second, while `bodies/gorilla.js` opens its gallop blend at 2.6
 * and its sprint at 2.8 and `bodies/octopus.js` opens its fast blend at 3.0.
 * So the gallop was pinned at exactly 0.00 for entire matches: one of the two
 * could only walk, and the chase — the part of the fight the camera is built
 * to hold — was shot at a stroll.
 *
 * These are gait lengths judged against those bands instead, and they put top
 * speed at 3.96 and 3.34 bl/s: inside the gallop, into the sprint, with the
 * whole walk/run/gallop ladder reachable. Not read from the geometry, because
 * what one stride covers is a property of how the animal is animated, not of
 * how long it is. `stride` keeps the measured length above — that sets
 * cadence, which was judged by eye and is right.
 *
 * ── КЛЮЧ ЗДЕСЬ — СТОРОНА, И ЭТО НАДО СКАЗАТЬ ВСЛУХ ────────────────────────
 *
 * Числа снимались с двух стоковых тел, а таблица индексируется СТОРОНОЙ.
 * Пока сторона и тело назывались одинаково, разницы было не видно; теперь
 * видно: сгенерированное тело получает то число, которое несёт его сторона, а
 * не то, которое сняли бы с него самого. Это приближение, и оно осознанное —
 * длина шага у чужого тела ниоткуда не читается, а промах в этом множителе
 * стоит темпа ног, а не правильности боя. Настоящий ответ — просить длину шага
 * у самого тела; до тех пор здесь стоят два разумных числа на две стороны.
 */
const GAIT_LENGTH = { blue: 1.45, orange: 1.35 };

const fxPool = [];

function spawnFx(obj, life, update) {
  scene.add(obj);
  fxPool.push({ obj, born: performance.now() / 1000, life, update });
}

/**
 * Слой эффектов грамматики §8.
 *
 * Четыре захардкоженных умения рисуются как рисовались — `beamFx`,
 * `blinkFx`, `coneFx` ниже утверждены вместе с остальным боевым экраном
 * (§10.6) и не трогаются. Всё, у чего есть `element`, — из грамматики, и
 * его рисует `vfx`: силуэт по доставке, палитра по элементу, импакт по
 * эффекту (READ KIT, §9.2).
 *
 * Разделение по полю, а не по списку имён: новая доставка появляется в
 * грамматике и рисуется сама, без правки этого файла.
 */
const vfx = new Vfx(scene, {
  spawnMesh: (obj, life, update) => spawnFx(obj, life, update),
});

/*
 * Хуки экрана для набора эффектов (docs/VFX.md §6). `camState` объявлена
 * ниже через `let`, а удар может прийти раньше конца evaluation (стенд,
 * сокет во время верхнеуровневого await) — поэтому `try`, как и прежде.
 */
vfx.screen = {
  shake: (trauma) => { try { camState.trauma = Math.min(1, (camState.trauma || 0) + trauma); } catch { /* ещё не готова */ } },
  flash: (colour, amount) => screenFlash(colour, amount),
  aberration: (amount) => { postU.aberration.value = Math.min(1.4, postU.aberration.value + amount); },
  hit: (who) => hitFlash(who),
};

/** Вспышка кадра: в граф, если он есть; иначе DOM-вспышка, как раньше. */
function screenFlash(colour, amount) {
  if (post) {
    postU.flashAmount.value = Math.min(0.55, postU.flashAmount.value + amount);
    if (colour) postU.flashColour.value.set(colour);
  } else flashFrame(amount);
}

/** Спад экранных величин между кадрами: вспышка и аберрация. */
function tickScreen(dt) {
  postU.flashAmount.value *= Math.exp(-dt * 11);
  if (postU.flashAmount.value < 0.002) postU.flashAmount.value = 0;
  postU.aberration.value *= Math.exp(-dt * 7);
  if (postU.aberration.value < 0.003) postU.aberration.value = 0;
}

/*
 * КРАСНАЯ ВСПЫШКА ТЕЛА (решение основателя 02.09): жертва на мгновение
 * становится целиком красной — так в старых играх читается «получил урон».
 *
 * Не через материалы тела. Первый заход менял `material.color`, а у стоковых
 * тел материалы узловые со своим графом цвета: поле `color` там не читается
 * вовсе, и вспышки не было видно (основатель заметил на повторе). Вместо
 * этого — ОТДЕЛЬНЫЙ ПРОХОД ПОВЕРХ КАДРА: меши жертвы поднимаются на слой
 * `HIT_LAYER`, сцена рисуется ещё раз одним красным материалом-оверрайдом
 * без теста глубины и без очистки — сплошной красный силуэт поверх всех
 * эффектов и пост-графа, как спрайт в старой игре. Тело при этом не
 * светится: проход идёт после свечения и в него не попадает (§10.1).
 */
const HIT_LAYER = 3;
/*
 * ВСПЫШКА УРОНА КОРОЧЕ И НЕ ГЛУХАЯ (замечание волны приёмки 04.09).
 *
 * Решение 8 требует, чтобы тело жертвы вспыхнуло на мгновение, — и оно
 * вспыхивает. Но полка полной заливки держалась 0.12 с при уходе 0.16, а
 * потолок стоял 0.95: судья померил два кадра записи боя, где ОБА тела ушли
 * в плоский лососевый на 5.10 % и 4.36 % арены — больше любого эффекта в
 * повторе, — слились друг с другом и потеряли и силуэт, и элементный статус
 * ровно в тот момент, когда он важнее всего.
 *
 * Полка срезана до 0.03 с (мгновение — это мгновение), уход до 0.09, а
 * потолок до 0.35: 120 мс и треть плотности. Модель не заменяется заливкой
 * целиком — её форма, стихия и СОБСТВЕННАЯ ТЕНЬ остаются читаемыми под
 * вспышкой, а «попало» несут ещё и толчок камеры, и подпись атома. При 0.72
 * силуэт становился плоским пятном на 210 мс, то есть на каждом шестом кадре
 * боя, и судья мерил именно его.
 */
const HIT_SOLID = 0.03, HIT_FADE = 0.09;
/** Потолок подмеса. Значение, а не цвет: см. `HIT_WASH`. */
const HIT_PEAK = 0.35;
const hitUntil = { blue: 0, orange: 0 };
const hitMat = (() => {
  const M = THREE.MeshBasicNodeMaterial || THREE.MeshBasicMaterial;
  return new M({ color: 0xffffff, fog: false, side: THREE.DoubleSide });
})();
/* Своя камера на слой удара: копия боевой, но видит только `HIT_LAYER`. */
const hitCam = camera.clone();
let hitActive = false;
function setHitLayer(body, on) {
  if (body.hitLayer === on) return;
  body.hitLayer = on;
  body.root.traverse((o) => { if (o.isMesh) { if (on) o.layers.enable(HIT_LAYER); else o.layers.disable(HIT_LAYER); } });
}
/*
 * Вспышка идёт от СОБЫТИЯ удара, а не от падения здоровья: горение и
 * внезапная смерть снимают здоровье каждый кадр, и по дельте hp оба тела
 * стояли красными до конца боя (снято на повторе m_fbe57248). Удар — это
 * запись `hit` или `impact` с уроном по цели.
 */
function hitFlash(id) {
  if (!bodies[id]) return;
  hitUntil[id] = performance.now() / 1000 + HIT_SOLID + HIT_FADE;
}
const TARGETED = new Set(['damage', 'burn', 'knock', 'pull', 'stun', 'root', 'blind', 'silence', 'weaken']);
function hitFlashFromImpact(e) {
  if (e.blocked) return;
  const list = Array.isArray(e.effects) ? e.effects : ['damage'];
  if (!list.some((a) => TARGETED.has(a))) return;
  hitFlash(e.who === 'blue' ? 'orange' : 'blue');
}
function tickHit(now) {
  let peak = 0;
  for (const id of ['blue', 'orange']) {
    const b = bodies[id];
    if (!hitUntil[id]) { if (b) setHitLayer(b, false); continue; }
    if (!b) { hitUntil[id] = 0; continue; }
    const left = hitUntil[id] - now;
    if (left <= 0) { hitUntil[id] = 0; setHitLayer(b, false); continue; }
    setHitLayer(b, true);
    /* Полка, потом короткий спад. Цвет один на обе стороны (`HIT_WASH`). */
    peak = Math.max(peak, left > HIT_FADE ? 1 : left / HIT_FADE);
  }
  hitU.alpha.value = peak * HIT_PEAK;
  hitActive = peak > 0;
}
/**
 * Силуэт жертвы — в свою текстуру, ДО основного кадра; пост-граф кладёт его
 * сверху. Без пост-графа вспышки нет: запасной путь рисует бой, а не свет.
 */
const clearTmp = new THREE.Color();
function drawHitFlash() {
  if (!post) return;
  if (!hitActive) { hitU.alpha.value = 0; return; }
  hitCam.copy(camera);
  hitCam.layers.set(HIT_LAYER);
  const bg = scene.background, fogWas = scene.fog;
  renderer.getClearColor(clearTmp);
  const clearA = renderer.getClearAlpha();
  scene.background = null; scene.fog = null;
  scene.overrideMaterial = hitMat;
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(hitRT);
  try { renderer.render(scene, hitCam); } catch (e) { hitActive = false; hitU.alpha.value = 0; console.warn('hit flash', e); }
  renderer.setRenderTarget(null);
  renderer.setClearColor(clearTmp, clearA);
  scene.overrideMaterial = null;
  scene.background = bg; scene.fog = fogWas;
}

/* Стенд VFX стреляет теми же событиями, что и симуляция, через ту же
   функцию. Стенд, рисующий сам, проверял бы себя. */
/* Ручки для стенда: сцена и слой эффектов. Только при ?vfx=1 — в
   продуктовом бандле этих полей нет ни на одном кадре. */
if (new URLSearchParams(location.search).get('vfx')) {
  window.__airenaScene = scene;
  window.__airenaVfx = vfx;
  /* Камера — чтобы стенд можно было облететь. Визуальная проверка с одного
     ракурса проверяет ракурс, а не эффект: половина того, что видно сверху,
     сбоку не читается вовсе. */
  window.__airenaCamera = camera;
  /*
   * Прогон снимков (`tools/vfxshot.mjs`): поставить тела, задать глаз,
   * выстрелить событием. Ручки, а не сценарий: сценарий живёт в инструменте,
   * чтобы один и тот же кадр можно было снять с трёх ракурсов и в три
   * момента — визуальная проверка с одного ракурса проверяет ракурс.
   *
   * `cam` переопределяет глаз ПОСЛЕ решателя кадрирования (см. `frame`),
   * поэтому работает и в пустой арене, и поверх идущего боя; `null`
   * возвращает камеру решателю.
   */
  window.__airenaSweep = {
    cam: (spec) => { sweepCam = spec || null; },
    place: (at) => {
      for (const id of ['blue', 'orange']) {
        const b = bodies[id], v = at && at[id];
        if (!b || !v) continue;
        b.root.position.set(v.x, 0, v.z);
        b.root.rotation.set(0, v.h || 0, 0, 'YXZ');
        b.root.visible = true;
        if (!b.root.parent) scene.add(b.root);
        try {
          b.inner.userData.pose({ t: 0, dt: 1 / 60, speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: 'idle', phase: 0 });
          b.root.updateMatrixWorld(true);
          b.root.position.y = Math.max(0, -spanY(b).min);
        } catch { /* тело без позы — стоит как есть */ }
      }
    },
    /*
     * ДВИЖЕНИЕ ТЕЛА ДЛЯ ПЕСОЧНИЦЫ. `place` ставит бойца и бьёт позу «стоит»;
     * песочнице нужно, чтобы он ШЁЛ — с походкой, разворотом и той же
     * анатомией, что в бою. Считать шаг здесь, а не в песочнице, незачем:
     * `stride` копится по ПРОЙДЕННОМУ ПУТИ и несёт знак хода против взгляда
     * (см. шапку файла), и это ровно то, что уже умеет боевой цикл, — поэтому
     * песочница передаёт готовые `speed`/`stride`/`turn`, а тут только
     * прикладывается поза и тело ставится на пол.
     */
    move: (id, v) => {
      const b = bodies[id];
      if (!b || !v) return;
      b.root.position.set(v.x, 0, v.z);
      b.root.rotation.set(0, v.h || 0, 0, 'YXZ');
      b.root.visible = true;
      if (!b.root.parent) scene.add(b.root);
      try {
        b.inner.userData.pose({
          t: v.t || 0, dt: v.dt || 1 / 60, speed: v.speed || 0, stride: v.stride || 0,
          turn: v.turn || 0, grounded: true, health: 1, action: v.action || 'idle', phase: v.phase || 0,
        });
        b.root.updateMatrixWorld(true);
        b.root.position.y = Math.max(0, -spanY(b).min);
      } catch { /* тело без позы — стоит как есть */ }
    },
    cast: (e) => { playFx(e); },
    bodies: () => Object.fromEntries(['blue', 'orange'].map((id) => [id, bodies[id] ? { x: bodies[id].root.position.x, z: bodies[id].root.position.z, h: bodies[id].root.rotation.y, height: bodies[id].height } : null])),
    stats: () => ({ backend: window.__airenaBackend, bloom: window.__airenaBloom, fps: fps.last, draws: renderer.info?.render?.drawCalls ?? null }),
  };
}
/** Глаз прогона снимков: `{az, pitch, dist, look:{x,y,z}}` или null. */
let sweepCam = null;

addEventListener('airena:demofx', (ev) => {
  try { playFx(ev.detail); } catch (err) { console.error('demofx', err); }
});

/*
 * Вспышка кадра — единственный экранный эффект, который может дать автор
 * помимо толчка камеры, и он же самый опасный: полноэкранная засветка на
 * каждом касте делает бой нечитаемым. Поэтому она короткая, слабая и
 * складывается сама с собой затуханием, а не яркостью.
 */
let flashUntil = 0; let flashAmount = 0; let flashRaf = 0;
/*
 * Вспышка живёт СВОИМ циклом, а не кадровым.
 *
 * Это не вкус: `tools/checkframing.mjs` вырезает из этого файла настоящий
 * кадровый цикл и гоняет камеру головой без браузера. Всё, что стоит в
 * `frame()`, обязано быть про камеру, иначе гейт падает на функции, которой в
 * его вырезке нет. И это правильное давление — вспышка это DOM, а не сцена:
 * она не читает мир, не двигает камеру и не участвует в кадрировании.
 *
 * Цикл заводится только на время затухания и сам себя останавливает: держать
 * rAF ради прозрачного элемента незачем.
 */
function flashFrame(a) {
  flashAmount = Math.min(0.25, flashAmount + a);
  flashUntil = performance.now() + 140;
  if (!flashRaf) flashRaf = requestAnimationFrame(paintFlash);
}
function paintFlash() {
  flashRaf = 0;
  const el = document.getElementById('vfxflash');
  if (!el) return;
  const left = flashUntil - performance.now();
  if (left <= 0) { flashAmount = 0; el.style.opacity = '0'; return; }
  el.style.opacity = String(flashAmount * (left / 140));
  flashRaf = requestAnimationFrame(paintFlash);
}

/*
 * ДЕКОРАЦИЯ УРОВНЯ 1 ЗАМОРОЖЕНА (решение основателя 02.09).
 *
 * Интерпретатор, валидатор, хранение в базе и гейт `tools/checkvfx.mjs`
 * остаются как есть: контракт с моделью не меняется, и стары́е IR в базе
 * по-прежнему валидны. Не рисуется ровно то, что интерпретатор кладёт
 * ПОВЕРХ read-kit: плоские квадраты-частицы и одна декаль на каст. Поверх
 * новых кинематографических эффектов они читались как дешёвые частицы и
 * спорили с ними за тот же кадр. Когда части IR будут переведены на новые
 * системы (частицы с масками, декали пола, свет), флаг снимается.
 */
const IR_DRAWS = false;

/*
 * ── THE FIVE RECORDS THAT CARRY NO ELEMENT ──────────────────────────────────
 *
 * A refusal, an interrupt, an absorbed hit, a shield breaking and a dodge are
 * not things an ELEMENT did — they are the arena answering — so the simulation
 * writes them without one, and the branch below (`if (e.element)`) would have
 * dropped every single one on the floor. The spectator review of 07.09
 * measured 2.7–4.1 refusals and 1.3–1.6 interrupts in an average fight and
 * found none of them on screen or in the feed, in fights whose outcome they
 * decided; this set is what makes them arrive.
 */
const RULE_FX = new Set(['immune', 'interrupt', 'absorbed', 'shieldBroke', 'evade']);

function playFx(e) {
  if (RULE_FX.has(e.kind)) { ruleFx(e); return; }
  if (e.element) {
    vfx.play(e, FX_CTX);
    /*
     * ДЕКОРАЦИЯ ИГРАЕТСЯ ПОСЛЕ READ-KIT И НЕ ВМЕСТО НЕГО.
     *
     * Порядок здесь — это и есть правило §9.2 «модель может добавлять, но не
     * заменять», выраженное кодом: read-kit уже нарисован к моменту, когда
     * интерпретатор получает управление, и отменить нарисованное ему нечем.
     *
     * Своя `try` не потому, что мы не доверяем валидатору, а потому что этот
     * IR приехал из базы: он мог быть записан прошлой версией пределов.
     * Упавшая декорация не имеет права уносить бой — она вообще не имеет
     * права ни на что влиять.
     */
    try {
      /*
       * `__demoVfx` — ТОЛЬКО СТЕНД, и симуляция его не пишет никогда.
       *
       * Запись `world.fx` собирается в `src/core/deliver.js`, и поля с таким
       * именем там нет: VFX не влияет на симуляцию и не ездит в ней (§9.2).
       * Стенд же рисует эффекты вне боя, у него нет ни набора, ни сторон, —
       * и без этой двери декорацию нельзя посмотреть иначе как дождавшись
       * настоящего существа с настоящим IR. Проверять то, что видно раз в
       * час, — это не проверка.
       *
       * `tools/checkscope.mjs` обходит бандл игрока: стенда там нет.
       */
      const k = kitLabels[e.who] && kitLabels[e.who][e.skill];
      const ir = e.__demoVfx || (k && k.vfx);
      if (ir && IR_DRAWS) {
        playIr(vfx, ir, e, {
          shake: (a) => { try { camState.shake = Math.min(0.55, camState.shake + a); } catch { /* ещё не готова */ } },
          flash: (a) => flashFrame(a),
        });
      }
    } catch (err) { console.warn('vfx-ir', err); }
    /*
     * ПРОМАХ УМЕНИЯ ГРАММАТИКИ ПОПАДАЕТ В ЛЕНТУ.
     *
     * Ветки `beamFx`/`coneFx` ниже, которые единственные писали в ленту «мимо»
     * и «закрыт укрытием», для существа с набором НЕДОСТИЖИМЫ: у любого
     * умения грамматики есть `element`, и функция выходит по `return` выше.
     * То есть у всех существ игроков промах не объяснялся ни разу.
     *
     * После D160 это стало дороже: причина `airborne` — единственное
     * свидетельство, что прыжок сработал. Без строки в ленте механика, ради
     * которой прыжок сделали доставкой, для зрителя не существует.
     */
    if (e.miss) {
      const c2 = COLOR[e.who];
      pushFeed(`<span style="color:#${c2.toString(16)}">${esc(sideName[e.who])}</span> · ${esc(skillRu(e.skill, e.who))}`
        + ` · <span style="opacity:.65">${MISS_RU[e.miss] || 'missed'}</span>`,
      `${e.who}|${e.skill}|${e.miss}`);
    }
    /*
     * A HEAL AND A WALL ARE DECISIONS, AND BOTH WERE MUTE.
     *
     * GRAVEDIGGER healed nine times in one 34 s fight and raised nothing on
     * screen but a ring of sparks (review §2b); a wall is the one thing in the
     * arena that changes the geometry of the fight, and the feed never said it
     * had been built. Both records already exist and already carry an element,
     * so they only ever needed a line.
     */
    if (e.kind === 'status' && e.effect === 'heal') healFeed(e);
    if (e.kind === 'wall') {
      pushFeed(ruleLine(e.who, 'raises a wall'), `wall|${e.who}`, { window: 4, ev: true });
    }
    if (e.kind === 'impact') hitFlashFromImpact(e);
    if (e.kind === 'impact' || (e.hit && (e.kind === 'beam' || e.kind === 'cone' || e.kind === 'dash'))) {
      /* `camState` объявлена ниже по файлу через `let`, а `playFx` может быть
         вызвана до конца evaluation — стендом VFX или сокетом, пришедшим во
         время верхнеуровневого await. Тот же класс, что уронил `framingLost`:
         толчок камеры не стоит того, чтобы из-за него не нарисовался эффект. */
      try { camState.shake = Math.min(0.55, camState.shake + 0.14); } catch { /* ещё не готова */ }
    }
    return;
  }
  if (e.kind === 'beam') beamFx(e);
  else if (e.kind === 'blink') blinkFx(e);
  else if (e.kind === 'cone') coneFx(e);
  else if (e.kind === 'hit') {
    // A knock on the lens, scaled to the hit. The cheapest thing in the whole
    // viewer that makes an impact read as an impact rather than as a number
    // changing.
    camState.shake = Math.min(0.55, camState.shake + e.amount / 90);
    hitFlash(e.who);
    floatDamage(e.x, e.z, e.amount, e.who);
    const src = e.who === 'blue' ? 'orange' : 'blue';
    pushFeed(`<span style="color:#${COLOR[src].toString(16)}">${esc(sideName[src])}</span> · ${esc(skillRu(e.skill, src))} · <b>${Math.round(Number(e.amount) * 100) / 100}</b>`, `${src}|${e.skill}|${e.amount}`);
  }
}

/**
 * One feed line about a RULE rather than about a hit.
 *
 * Same shape as every other line — the fighter's name in its own ink, a middot,
 * then what happened — and the tail is set back at .65 alpha, exactly like the
 * miss reasons, because these are annotations on a fight and not events of it.
 *
 * `data-ev` on the ROW — and not a wrapper around the tail — is a contract with
 * the product shell: `screens/live.js` re-reads every feed line and rewrites it
 * into a sentence built from the ability names it knows ("drives a KINETIC
 * LUNGE"), which for these lines would produce "lands a stun refused —
 * immune". The flag says: this line is already a sentence, leave it alone.
 *
 * THE TAIL IS A BARE TEXT NODE, AND THAT IS A LAYOUT DECISION. Wrapped in a
 * span it was one, and the 1280 px capture came back with an overlap finding:
 * a two-line inline element reports ONE bounding box across both lines, which
 * intersects the name sitting on the first of them. A text node reports a
 * rectangle per line, and the row's own div contains the name, so the probe
 * skips the pair. The dimming that span carried moved to the row (`#feed
 * div[data-ev]`), where it costs no box at all.
 */
function ruleLine(who, tail) {
  const c = COLOR[who] ? COLOR[who].toString(16) : '999999';
  return `<span style="color:#${c}">${esc(sideName[who] || who)}</span> · ${esc(tail)}`;
}

/**
 * What a refused atom is called in a sentence.
 *
 * The ids are already English words, so the table only holds the three that
 * are not the noun a player would say out loud. Anything unknown prints its own
 * id: a new control atom should read as itself rather than disappear.
 */
const REFUSED_WORD = { knock: 'knockback', weaken: 'weakening', boost: 'boost' };

/**
 * The five records the simulation writes with no element.
 *
 * Each one is drawn (`vfx.play` → the rule marks in `vfx.js`), written into the
 * feed with a collapse key, and — where a number or a word is the whole point —
 * floated over the fighter it belongs to. `who` is the SUBJECT of the sentence
 * in every one of them and `by` is the other side; that is the shape the
 * simulation agreed to write, and it is the shape a spectator reads.
 */
function ruleFx(e) {
  const who = e.who;
  if (!who) return;
  vfx.play(e, FX_CTX);

  switch (e.kind) {
    case 'immune': {
      /*
       * THE SINGLE MOST IMPORTANT LINE IN THIS FUNCTION.
       *
       * A beam connects, the body does not stagger, and until now the arena
       * said nothing at all — the spectator saw an ability that "did nothing"
       * (review §2a, 14.2 s). Naming the atom that was refused turns that into
       * the rule it actually is, and the rule is learnable: the same fighter
       * cannot be stunned twice inside three seconds.
       */
      const word = REFUSED_WORD[e.effect] || String(e.effect || 'control');
      floatMark(who, 'IMMUNE', { rise: 1.1, life: 800 });
      pushFeed(ruleLine(who, `${word} refused — immune`), `immune|${who}|${e.effect}`, { window: 6, ev: true });
      return;
    }
    case 'interrupt': {
      /* The cast that was cut is named where the viewer knows its name: the
         skill belongs to the fighter that was interrupted, i.e. to `who`. */
      const named = e.skill ? skillRu(e.skill, who) : '';
      flashFrame(0.06);
      pushFeed(ruleLine(who, named ? `${named} cut short` : 'cut short'),
        `interrupt|${who}|${e.skill || ''}`, { window: 4, ev: true });
      return;
    }
    case 'absorbed': {
      const n = Number(e.amount);
      const shown = Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '';
      if (shown) floatMark(who, `▣ ${shown}`, { rise: 1.2, life: 850 });
      pushFeed(ruleLine(who, shown ? `shield took ${shown}` : 'shield holds'),
        `absorbed|${who}`, { window: 4, ev: true });
      return;
    }
    case 'shieldBroke': {
      pushFeed(ruleLine(who, 'shield shatters'), `shieldbroke|${who}`, { window: 4, ev: true });
      return;
    }
    case 'evade': {
      /* A dodge is invisible by construction — the hit simply does not land —
         so this line is the only evidence it happened at all. */
      const named = e.skill ? skillRu(e.skill, e.by || (who === 'blue' ? 'orange' : 'blue')) : '';
      pushFeed(ruleLine(who, named ? `dodged the ${named}` : 'dodged'),
        `evade|${who}|${e.skill || ''}`, { window: 4, ev: true });
      return;
    }
    default:
  }
}

/**
 * A heal, said out loud.
 *
 * The amount rides on the record when the simulation sends one (`amount`); with
 * no number the line still says the fighter healed, because "GRAVEDIGGER heals"
 * is true and useful and "nothing on screen" is neither.
 */
function healFeed(e) {
  const n = Number(e.amount ?? e.mag);
  const shown = Number.isFinite(n) && n > 0 ? String(Math.round(n * 10) / 10) : '';
  if (shown) floatMark(e.who, `+${shown}`, { rise: 1.8, life: 950 });
  pushFeed(ruleLine(e.who, shown ? `heals ${shown}` : 'heals'), `heal|${e.who}`, { window: 4, ev: true });
}

/**
 * A WORD OR A NUMBER OVER A FIGHTER, in the mark the damage pill already uses.
 *
 * `.dmg` is the product's one body-anchored text style (`ui/hud.css`): side ink
 * on a tight halo of the page ground, no surface, no plate — the stylesheet's
 * own comment explains at length why it may not be a chip, and a second style
 * here would be a second answer to a question already answered.
 *
 * `data-from` is deliberately NOT set: that attribute draws the dealer's caret
 * on the pill's leading edge, and these marks have no dealer — they are about
 * the fighter they stand on. The mark FOLLOWS the body rather than staying
 * where the record was written, for the same reason the status gestures do: it
 * says something about a fighter, not about a place.
 */
/* Starts ABOVE the say-bubble's line, not level with it. The bubble sits at
   `height + 1.1` and the damage pill starts at `top + 0.5`; a word as wide as
   IMMUNE launched from there lands across a quip — photographed on
   `rules-marks/rule-01-immune.png`. The pill keeps its own start: it is two
   glyphs and it has been read there since the beginning. */
const MARK_FLOOR = 1.4;
function floatMark(who, text, { life = 900, rise = 1.4 } = {}) {
  if (!bodies[who] || !hud) return;
  const d = document.createElement('div');
  d.className = 'dmg';
  d.textContent = text;
  d.dataset.side = who;
  d.dataset.rule = '1';
  d.style.color = `#${COLOR[who].toString(16).padStart(6, '0')}`;
  hud.appendChild(d);
  const born = performance.now();
  const tick = () => {
    const u = (performance.now() - born) / life;
    if (u >= 1 || !bodies[who]) { d.remove(); return; }
    const b = bodies[who];
    const p = b.root.position;
    const top = Math.max(1.4, b.top ?? b.height ?? 2);
    const v = project(p.x, top + MARK_FLOOR + u * rise, p.z);
    d.style.left = `${v.x}px`; d.style.top = `${v.y}px`;
    d.style.opacity = String(1 - u * u);
    d.style.fontSize = `${16 - u * 3}px`;
    requestAnimationFrame(tick);
  };
  tick();
}

/** Fire every queued effect the render clock has now caught up with. */
/*
 * ONE EFFECT IS NOT ALLOWED TO TAKE THE FRAME.
 *
 * `playFx` reaches into the effects layer, and the effects layer builds its
 * node graphs LAZILY — the first bolt of an element it has not drawn yet
 * assembles a material on that frame, sixty frames into a fight, on whichever
 * machine the viewer happens to be running. Everything about that is normal
 * except the consequence: an unguarded throw came back up through
 * `playFxUpTo` into the loop, and the loop's single catch returned before the
 * draw. Round one photographed the shape of it — `create-visitor` reported one
 * `TypeError` and then showed a still frame behind the veil for the rest of
 * the session, while the identical owner's screen showed the live arena.
 *
 * The same reasoning the effects layer already applies to a dying form
 * (`updateFx`, "fx end"), applied at the other end of the life: a decoration
 * that cannot be drawn is a decoration that is not drawn. The fight goes on,
 * every other effect in the same tick goes on, and the failure is reported
 * ONCE per element+kind rather than sixty times a second — a console that
 * repeats itself is not evidence, and the capture tool reads this console.
 */
const fxFaults = new Set();
function playFxUpTo(clock) {
  while (pendingFx.length && pendingFx[0].t <= clock) {
    for (const e of pendingFx.shift().fx) {
      try {
        playFx(e);
      } catch (err) {
        const key = `${e && e.element}|${e && e.kind}`;
        if (!fxFaults.has(key)) {
          fxFaults.add(key);
          console.warn(`fx ${key}`, err);
        }
      }
    }
  }
}

function updateFx(now) {
  for (let i = fxPool.length - 1; i >= 0; i--) {
    const f = fxPool[i];
    const u = (now - f.born) / f.life;
    if (u >= 1) {
      /*
       * ПОСЛЕДНИЙ КАДР ЖИЗНИ ЗОВЁТСЯ, А НЕ ПРОПУСКАЕТСЯ.
       *
       * Здесь меш снимался, а обновление на этом кадре не звалось НИ РАЗУ.
       * Любая форма, которая делает что-то «в конце» — посадка навеса у всех
       * десяти стихий, удар метеора, лужа разбитой колбы, — заводит это из
       * своего обновления по условию вида `u >= 1`. Значит срабатывала она
       * только тогда, когда какой-нибудь кадр случайно попадал в окно между
       * условием и концом жизни, то есть ВЕРОЯТНОСТНО.
       *
       * Нашёл это агент кислоты, снимая свою стихию: у радиации посадка
       * навеса не оставила ничего в девяти кадрах подряд (r5-radiation), при
       * том что тот же код в прошлой галерее давал 12 326 пикселей лужи. Он
       * же посчитал вероятность: окно у него было 11 % кадров жизни носителя.
       * Модули лечили это расширением окна — то есть лечили симптом, каждый
       * у себя и по-разному.
       *
       * Гейт `checkdecay` звал этот кадр с самого начала (там это называется
       * «разогрев») — и был прав: без него он не видел следов, рождённых в
       * конце формы. Расхождение между гейтом и вьювером было не в гейте.
       */
      try { f.update(f.obj, 1); } catch (err) { console.warn('fx end', err); }
      scene.remove(f.obj);
      /*
       * УТИЛИЗИРУЕТСЯ И МАТЕРИАЛ, А НЕ ТОЛЬКО ГЕОМЕТРИЯ.
       *
       * В три.js освобождение конвейера держит МАТЕРИАЛ: `RenderObject`
       * подписан на его событие `dispose`, и только оттуда идут
       * `pipelines.delete` и `bindings.delete`. Замерено: после утилизации
       * одной геометрии кэш узловых состояний не отдаёт ни одной записи
       * (3 → 83 на сорока материалах, после геометрии 85, после материалов 5).
       * То есть каждый эффект боя оставлял запись на всё время жизни
       * страницы.
       *
       * Общие материалы из пула (`userData.pooled`) не трогаются: их берут
       * следующие эффекты, и утилизировать их значит вернуть ту самую
       * пересборку графа, ради устранения которой пул и заведён.
       */
      f.obj.traverse?.((o) => {
        /* Общая геометрия набора (`shared` в vfx/core.js) — как пул материалов:
           её делят все взрывы и волны, утилизировать её значит грузить заново
           на каждом ударе. */
        if (!o.geometry?.userData?.shared) o.geometry?.dispose?.();
        const m = o.material;
        if (!m) return;
        for (const one of Array.isArray(m) ? m : [m]) {
          if (one && !one.userData?.pooled) one.dispose?.();
        }
      });
      fxPool.splice(i, 1);
      continue;
    }
    f.update(f.obj, u);
  }
}

function beamFx(e) {
  const c = COLOR[e.who];
  const sc = SCENE_COLOR[e.who];
  const a = new THREE.Vector3(e.x0, 1.15, e.z0);
  const b = new THREE.Vector3(e.x1, 1.15, e.z1);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(0.11, 0.11, len, 8, 1, true);
  g.translate(0, len / 2, 0);
  const m = markGlow(new THREE.MeshBasicMaterial({ color: sc, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  const glowG = new THREE.CylinderGeometry(0.34, 0.34, len, 8, 1, true);
  glowG.translate(0, len / 2, 0);
  const glow = new THREE.Mesh(glowG, markGlow(new THREE.MeshBasicMaterial({ color: sc, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })));
  mesh.add(glow);
  spawnFx(mesh, 0.22, (o, u) => {
    o.material.opacity = 0.95 * (1 - u);
    glow.material.opacity = 0.22 * (1 - u) ** 2;
    o.scale.set(1 - u * 0.55, 1, 1 - u * 0.55);
  });
  if (e.hit) impactFlash(e.x1, e.z1, sc);
  else {
    /*
     * The one event class the feed never carried, and the only one that is not
     * a repeat: the sim counts misses and blocked shots separately (a laser
     * that ends on a solid is 'cover', one that ends at full range is 'aim'),
     * and a beam that ends short of its 24 m range ended on something. That is
     * the difference between "it dodged" and "it used the block", which is the
     * whole tactical story of this arena.
     */
    const cover = len < cfg.skills.laser.range - 0.05;
    pushFeed(`<span style="color:#${c.toString(16)}">${esc(sideName[e.who])}</span> · ${esc(skillRu('laser', e.who))} · <span style="opacity:.65">${cover ? 'blocked by cover' : 'missed'}</span>`,
      `${e.who}|laser|${cover ? 'cover' : 'aim'}`);
  }
}

function impactFlash(x, z, c) {
  const s = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 8),
    markGlow(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false })),
  );
  s.position.set(x, 1.15, z);
  spawnFx(s, 0.3, (o, u) => { o.scale.setScalar(1 + u * 2.4); o.material.opacity = 0.85 * (1 - u); });
}

function blinkFx(e) {
  const c = SCENE_COLOR[e.who];
  for (const [x, z, dir] of [[e.x0, e.z0, 1], [e.x1, e.z1, -1]]) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.09, 8, 28),
      markGlow(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false })),
    );
    layFlat(r);
    r.position.set(x, 0.6, z);
    spawnFx(r, 0.45, (o, u) => {
      o.scale.setScalar(dir > 0 ? 1 + u * 2.6 : 3.4 - u * 2.4);
      o.position.y = 0.6 + u * 1.4;
      o.material.opacity = 0.9 * (1 - u);
    });
  }
}

function coneFx(e) {
  const c = COLOR[e.who];
  const g = new THREE.CircleGeometry(e.range, 24, -e.half + Math.PI / 2, e.half * 2);
  const m = new THREE.Mesh(g, markGlow(new THREE.MeshBasicMaterial({
    color: e.hit ? SCENE_COLOR[e.who] : MISS_COLOUR, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
  })));
  layFlat(m);
  faceHeading(m, e.heading);
  m.position.set(e.x, 0.06, e.z);
  spawnFx(m, 0.3, (o, u) => { o.material.opacity = 0.55 * (1 - u); o.scale.setScalar(1 + u * 0.12); });
  if (!e.hit) {
    pushFeed(`<span style="color:#${c.toString(16)}">${esc(sideName[e.who])}</span> · ${esc(skillRu('smash', e.who))} · <span style="opacity:.65">missed</span>`, `${e.who}|smash|miss`);
  }
}

// ---------------------------------------------------------------------------
// telegraphs — the part that makes the fight readable
// ---------------------------------------------------------------------------

/**
 * Everything a watcher needs in order to see a decision BEFORE its consequence.
 *
 * A hit that arrives with no warning is arbitrary; a hit that arrives after a
 * visible wind-up is a thing someone failed to dodge, and that is the whole
 * difference between a number changing and a fight. Each of these is drawn from
 * the same state the simulation resolves against — the aim line uses the
 * current heading because the beam uses the current heading, the danger cone
 * uses `range + radius` because `inCone` does — so a telegraph can never
 * promise something the strike will not deliver.
 */
/*
 * ── THE SIDE'S OWN MATERIALS, RE-TINTED IN PLACE ──────────────────────────
 *
 * Four telegraph faces, a ring, a rim, an aim line and two ghost materials are
 * built ONCE per side and live the whole session. Ownership changes between
 * fights, so on every `match` they have to change colour — and rebuilding them
 * is not an option: three of them are node materials, and a node material
 * rebuilt mid-session compiles a pipeline on the main thread in the frame the
 * VS card is up, which is the one frame that must not stall.
 *
 * So the colour is a HANDLE, not a literal. The node materials read a uniform
 * (`SIDE_U`, one per side, swapped by value); the raster ones are collected
 * here and written with `material.color.copy` — the two lists exist because
 * the rim carries VALUE as well as hue (see `RIM_COLOR`) and is a different
 * colour from the face it rims.
 *
 * The uniform is assigned to `colorNode` BEFORE the material has ever been
 * drawn, so nothing is recompiled by it: the shader is built once, with the
 * uniform already in it.
 */
const SIDE_U = {
  blue: TSL.uniform(SCENE_COLOR.blue.clone()),
  orange: TSL.uniform(SCENE_COLOR.orange.clone()),
};
const sideMats = { blue: [], orange: [] };
const rimMats = { blue: [], orange: [] };
const fillMats = { blue: [], orange: [] };
/**
 * Give one material the side's colour and remember it for the next `match`.
 * A node material takes the uniform; a raster one joins one of three lists —
 * the face's own hue, the rim's value (`RIM_COLOR`) or the fill's lift
 * (`FILL_COLOR`).
 */
function sideTint(mat, id, kind = 'face') {
  if (!mat) return mat;
  if (mat.colorNode) mat.colorNode = SIDE_U[id];
  else (kind === 'rim' ? rimMats : kind === 'fill' ? fillMats : sideMats)[id].push(mat);
  return mat;
}

function makeTelegraph(id) {
  const c = SCENE_COLOR[id];
  const g = new THREE.Group();

  /*
   * A filled disc under the feet plus a hard rim at exactly the collision
   * radius. Two jobs: it says where a small dark body is on a big pale floor,
   * and it makes "they are touching" visible — the two rims meet at the instant
   * the solver starts pushing them apart, so a viewer can see a body block
   * rather than wondering why one stopped.
   */
  /*
   * ── AND THE RIM IS A SANDWICH, BECAUSE A BODY CAN IMITATE A HUE ───────────
   *
   * The mark that says "enemy" was one stroke in one hue, and a coral creature
   * standing on it is the same hue: measured on `live-fighting.png` inside the
   * foe's own footprint, ring pixels median L 43.5 / S 0.46 against body
   * pixels median L 42.4 / S 0.36 at hue 17° — 1.1 L apart in one family, and
   * a 6× crop shows ring and creature as a single coral blob with the stroke
   * running through the legs. The player's side escaped it only because the
   * stock golem happens to be neutral-dark; the forge ships blue creatures.
   *
   * So the contract is VALUE, which an albedo cannot imitate without being a
   * different animal: a dark stroke inside, the side's colour, a near-white
   * stroke outside. Three concentric annuli, and the OUTERMOST edge is still
   * at exactly the collision radius, because "the two rims meet at the instant
   * the solver starts pushing them apart" is the other job this ring does and
   * a halo outside the radius would make them meet early. At a 20 m shot on a
   * 0.75 m fighter each stroke is 3–4 px, which is what the sandwich needs to
   * survive a resample.
   *
   * The two outer strokes are NOT side-tinted: they are the value contract,
   * not the identity, and tinting them would put the whole sandwich back in
   * one hue family. They keep the world's warm neutrals so a mark never
   * introduces a third accent (ARENA-BRIEF §5).
   */
  const R = cfg.fighters[id].radius;
  const ring = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(R, 40),
    sideTint(markGlow(new THREE.MeshBasicMaterial({
      color: FILL_COLOR[id], transparent: true, opacity: FILL_ALPHA, side: THREE.DoubleSide, depthWrite: false,
    }), 0.18), id, 'fill'),
  );
  const shade = new THREE.Mesh(
    new THREE.RingGeometry(R * 0.76, R * 0.84, 44),
    new THREE.MeshBasicMaterial({ color: MARK_SHADE, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
  );
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(R * 0.84, R * 0.94, 44),
    sideTint(markGlow(new THREE.MeshBasicMaterial({ color: RIM_COLOR[id], transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }), 0.5), id, 'rim'),
  );
  const edge = new THREE.Mesh(
    new THREE.RingGeometry(R * 0.94, R, 44),
    new THREE.MeshBasicMaterial({ color: MARK_EDGE, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.add(disc); ring.add(shade); ring.add(rim); ring.add(edge);
  layFlat(ring);
  ring.position.y = 0.03;
  ring.userData.rim = rim;
  ring.userData.disc = disc;
  /* The three strokes move together: `updateTelegraph` dims them on a stun and
     `restMarks` puts them back, and a sandwich with one stroke at a different
     opacity is not a sandwich. */
  ring.userData.strokes = [shade, rim, edge];
  g.add(ring);

  const sk = cfg.skills;
  /* Фигура на полу — заливка И КОНТУР (см. `telegraphMat`): полупрозрачная
     заливка цвета стороны на белом полу даёт 1.06–1.19:1, а контур читается
     на любом фоне. Запасной путь на бэкенде без узловых материалов — прежняя
     заливка, лучше слабая фигура, чем никакой. */
  const cone = new THREE.Mesh(
    new THREE.CircleGeometry(1, 30, -sk.smash.halfAngle + Math.PI / 2, sk.smash.halfAngle * 2),
    sideTint(telegraphMat(c, 'cone', sk.smash.halfAngle)
      || markGlow(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }), 0.55), id),
  );
  layFlat(cone);
  cone.position.y = 0.045;
  cone.visible = false;
  g.add(cone);

  const laneLen = sk.charge.dashSpeed * sk.charge.dashSeconds;
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, laneLen),
    sideTint(telegraphMat(c, 'lane')
      || markGlow(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 0.55), id),
  );
  lane.geometry.translate(0, laneLen / 2, 0);
  layFlat(lane);
  lane.position.y = 0.04;
  lane.visible = false;
  g.add(lane);

  /* Диск зоны: единичный радиус, масштабируется под radius умения. Форма
     телеграфа обязана совпадать с формой доставки (§9.2). Имя `zoneDisc`, а
     не `disc`: `disc` выше — это заливка кольца под ногами. */
  const zoneDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    sideTint(telegraphMat(c, 'cone', Math.PI)
      || markGlow(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }), 0.55), id),
  );
  layFlat(zoneDisc);
  zoneDisc.visible = false;
  g.add(zoneDisc);

  const aim = new THREE.Mesh(
    new THREE.PlaneGeometry(0.06, sk.laser.range),
    sideTint(markGlow(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 0.8), id),
  );
  aim.geometry.translate(0, sk.laser.range / 2, 0);
  layFlat(aim);
  aim.position.y = 0.05;
  aim.visible = false;
  g.add(aim);

  // A wireframe, not a solid. A filled sphere at this radius reads as the body
  // vanishing rather than as the body being untouchable, and the whole point of
  // an i-frame telegraph is that you can still see what it is protecting.
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.fighters[id].radius * 1.45, 14, 10),
    /* `WHITE`, not a raw 0xffffff: linear (1,1,1) tone-maps to #E2E2E2, a light
       grey, and the i-frame blink is the one moment that must read as WHITE.
       Bloom at 0.9 hides most of it; the unbloomed core of the wireframe was
       landing on the grey. */
    markGlow(new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0, depthWrite: false, wireframe: true }), 0.9),
  );
  shell.visible = false;
  g.add(shell);

  scene.add(g);
  return { g, ring, cone, lane, laneLen, aim, shell, disc: zoneDisc };
}

/**
 * How far a charge launched from here along `h` can actually travel.
 *
 * The lane was drawn at its nominal 12 m — dashSpeed * dashSeconds — and never
 * trimmed, while the simulation ends a dash the instant the swept body meets
 * anything solid. Over an even sweep of the floor the sim cuts 73.2% of dashes
 * short, by 5.23 m on average, so the one telegraph a charger fully commits to
 * was routinely promising reach straight through a block it would stop dead
 * against — and the other side was being told to clear ground it never had to
 * leave. A telegraph that overstates is worse than none: it teaches a dodge
 * that is not needed and hides the one that is.
 *
 * This marches the swept body exactly as `dashStep` does — the same 0.5 m tick,
 * the same circle-against-box rule, the same walls — rather than solving a ray
 * against the geometry. A closed-form answer was written first and it was wrong
 * in the place it mattered: expanding a block by the body radius squares off
 * its corners, so a body standing on the diagonal beside a block read as
 * already touching it and the lane collapsed to nothing in 8.3% of the sweep.
 * Twenty-four steps against six boxes, only on the frames a charge is being
 * telegraphed, is not worth being clever about.
 */
function dashReach(id, x, z, h, budget) {
  const r = cfg.fighters[id].radius;
  const step = cfg.skills.charge.dashSpeed / cfg.tickHz;
  const dx = Math.sin(h), dz = Math.cos(h);
  let gone = 0;
  while (gone + step <= budget + 1e-6) {
    const nx = x + dx * (gone + step), nz = z + dz * (gone + step);
    // the walls are not in `cfg.arena.obstacles`: a charge stops with its rim
    // against the inside face, which is all four of them at once
    if (Math.abs(nx) + r > HALF || Math.abs(nz) + r > HALF) break;
    let struck = false;
    for (const o of cfg.arena.obstacles) {
      const qx = THREE.MathUtils.clamp(nx, o.x - o.hx, o.x + o.hx);
      const qz = THREE.MathUtils.clamp(nz, o.z - o.hz, o.z + o.hz);
      if ((nx - qx) ** 2 + (nz - qz) ** 2 < r * r) { struck = true; break; }
    }
    if (struck) break;
    gone += step;
  }
  return gone;
}

/**
 * How far a beam fired from (x, z) along `h` travels before it meets a solid.
 *
 * Plan view only, and deliberately: the blocks are 3.2 m, the walls are 4 m and
 * the beam flies at 1.15 m, so nothing the footprint stops can be cleared by
 * height. This is the same question `segBoxes` answers for the simulation in
 * `resolveStrike`, over the same set of boxes, so the line ends where the shot
 * ends. It ignores the enemy body on purpose — a beam that would hit is still
 * aimed at the wall behind, and drawing it short of the target would say the
 * shot stops there whether or not the target moves.
 */
function beamReach(x, z, h, rOff) {
  const range = cfg.skills.laser.range;
  const dx = Math.sin(h) * range, dz = Math.cos(h) * range;
  const ox = x + Math.sin(h) * rOff, oz = z + Math.cos(h) * rOff;
  let best = 1;
  for (const o of SOLIDS) {
    let t0 = 0, t1 = 1;
    let miss = false;
    for (const [s, d, lo, hi] of [[ox, dx, o.x - o.hx, o.x + o.hx], [oz, dz, o.z - o.hz, o.z + o.hz]]) {
      if (Math.abs(d) < 1e-9) { if (s < lo || s > hi) { miss = true; break; } continue; }
      let a = (lo - s) / d, b = (hi - s) / d;
      if (a > b) { const q = a; a = b; b = q; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) { miss = true; break; }
    }
    if (!miss && t1 > 0 && t0 < best) best = Math.max(0, t0);
  }
  return best * range;
}

const tele = { blue: makeTelegraph('blue'), orange: makeTelegraph('orange') };

/**
 * A MARK MUST NOT OUTLIVE THE FIGHT IT BELONGS TO.
 *
 * `updateTelegraph` runs only from the streaming branch of the loop, so when
 * `frames` runs out both telegraph groups keep whatever visibility — and
 * whatever POSITION — the last streamed frame left them. Measured on
 * `live-searching.png` (1440×900, phase `searching`, "NEXT FIGHT IN 8"): two
 * rings on an empty plaza, and the brighter of the two is the FOE's, 762
 * saturated px peaking at #D85143 with the one standing creature's feet
 * inside it, against 123 px of blue lying empty in front of it. Between
 * fights the frame therefore said "orange" about the only creature on
 * screen, and that creature is the player's. `live-away.png` repeated it.
 *
 * So the beat that has no fight has no fight's marks. Everything a skill
 * draws goes; the ring goes with it for a side that is not standing there;
 * and the ONE body still on the floor keeps its own ring, moved to where it
 * actually stands, in the colour ownership gave it (`applySides`) — blue for
 * the player, always, whatever slot the last fight dealt.
 *
 * Which body that is comes from `mineSide`, not from the last fight's
 * geometry: an idle creature drawn with no live match would otherwise inherit
 * the slot it happened to be dealt. With no `mineSide` — a spectator, or a
 * visitor before any match — nobody on the floor is "yours" and the plaza
 * carries no mark at all, which is the honest answer rather than an arbitrary
 * one. That is the BETWEEN-fights rule; on a card beat both bodies keep their
 * marks (see below), because there the two of them are the picture.
 */
function restMarks() {
  /*
   * BETWEEN fights, one mark and it is the player's. ON a card beat — the VS
   * announcement, the result — the two bodies on the floor are both part of
   * the picture the card is standing over, and the result's own composition
   * depends on it: "the fallen is read from the ring under the winner". The
   * shell's phase is what separates the two, and it is the same attribute the
   * camera already reads a line later.
   */
  const idle = /^(searching|away|idle)$/.test((typeof document !== 'undefined' && document.body?.dataset.phase) || '');
  for (const id of ['blue', 'orange']) {
    const t = tele[id];
    t.cone.visible = false;
    t.lane.visible = false;
    t.aim.visible = false;
    t.disc.visible = false;
    t.shell.visible = false;
    const root = (idle && mineSide !== id) ? null : bodies[id]?.root;
    if (root && root.visible && root.parent) {
      t.g.position.set(root.position.x, 0, root.position.z);
      t.g.visible = true;
      for (const m of t.ring.userData.strokes) m.material.opacity = 0.95;
      t.ring.userData.disc.material.opacity = FILL_ALPHA;
    } else {
      t.g.visible = false;
    }
  }
}

/**
 * What a fighter looks like when there is something between it and the eye.
 *
 * The camera can climb over a solid and step around it, and with the walls in
 * the test it now does — but a body pressed against a 3.2 m block a metre away
 * cannot be cleared from any angle the framing rule is allowed to take, and a
 * chase spends its life against cover. Measured: completely invisible in 12.1%
 * of live fighter-frames before, 10.5% after the camera work alone. The audit
 * caught a fighter casting its laser through an entire 0.83 s charge from
 * behind a block — the kiter-and-chaser beat this whole viewer exists to show,
 * played with the kiter off screen — so the last 10% is not a rounding error.
 *
 * Two answers, in this order. The occluders between eye and body fade (their
 * edge wireframes stay, so the cover is still legible), and a silhouette drawn
 * with `depthTest: false` puts the fighter's colour and position through the
 * geometry regardless. Together they cover 98.2% of the frames where the body
 * is geometrically hidden — the other 1.8% is the fade's own ramp — and they
 * cost the arena almost nothing: averaged over a match, 0.43 of the ten solids
 * is dimmed at any instant. The silhouette is deliberately weak — a soft body
 * tint and a hard ground ring, the same ring language the telegraphs already
 * use — because it exists to say WHERE, not to replace the animal with a
 * lozenge.
 */
/*
 * The environment's materials, bound onto `SOLIDS`.
 *
 * `env.solids` has the same ten entries in the same order — four walls (pit
 * face, apron strip, coping, and on ±z the notch stair with its cut faces),
 * then the six blocks (side, top) — every material `transparent: true` with
 * an alpha-scaled `castShadowNode`, so `updateOcclusion` below works
 * unchanged and a faded solid casts a faded shadow. The position check is the
 * drift alarm: a solid that moved in one file and not the other would fade
 * the wrong thing.
 */
if (env.solids.length !== SOLIDS.length) throw new Error('environment.js and main.js disagree on the number of solids');
env.solids.forEach((s, i) => {
  const o = SOLIDS[i];
  if (s.x !== o.x || s.z !== o.z || s.hx !== o.hx || s.hz !== o.hz) throw new Error(`solid ${i} moved between environment.js and main.js`);
  o.mats = s.mats;
});

const GHOST_BODY = 0.30;
const GHOST_RING = 0.85;
/*
 * WHAT A LIVING FIGHTER'S RING IS WORTH WHEN NOTHING IS HIDING IT: NOTHING.
 *
 * It used to be 0.35, on the argument that a small fighter needs a mark the
 * debris cannot out-read. It does — and it HAS one: `makeTelegraph`'s ring is
 * under every living body every frame (`updateTelegraph` and `restMarks` both
 * keep it there), in the same three-annulus sandwich, and it is DEPTH-TESTED.
 * The ghost is the stand-in for that ring over cover, and raising it under a
 * fighter in the clear meant a second, depth-blind copy of a mark that was
 * already drawn — which is how a saturated stroke came to run across the
 * middle of a body: measured on `live-result-loss.png` at x=1080, shin at
 * L 17–26, a coral band rgb(190,90,79) at y=524, shin again at L 18–19, and
 * on `live-vs.png` at x=816 the blue stroke crossing a flashed body. The far
 * arc of a ring at the feet projects OVER the legs, and with `depthTest:
 * false` nothing stops it.
 *
 * So: no floor, and the ghost's ring is depth-tested (see `makeGhost`). What
 * the ghost still buys is the case it was written for — a ring behind cover —
 * and it keeps it, because the cover that hides a ring is FADED cover and a
 * faded solid is a transparent one, drawn after the ghost.
 */
const RING_ALWAYS = 0;
/** What an occluder fades to. Below about this the arena stops reading as solid. */
const FADE_TO = 0.24;

function makeGhost(id) {
  const c = SCENE_COLOR[id];
  const rad = cfg.fighters[id].radius;
  const h = Math.max(0.6, bodies[id]?.height ?? 2);
  const r = rad * 0.6;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: 0, depthTest: false, depthWrite: false,
  });
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.1, h - r * 2), 3, 12), bodyMat);
  cap.position.y = h / 2;
  cap.renderOrder = 999;
  g.add(cap);
  const ringMat = new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  /* THE SAME SANDWICH AS THE REAL RING (`makeTelegraph`). This is the mark
     that stands in for it over cover — the one place the reader has nothing
     else to go on — so it cannot be the one place the mark is a single stroke
     in a hue a creature can wear. Same three radii, same two neutrals; only
     the middle stroke is the side's, and only the middle stroke is re-tinted
     on `match`. */
  /*
   * ── A BODY OCCLUDES THE MARK UNDER IT ─────────────────────────────────────
   *
   * The ring is FLAT AT THE FEET, so its far arc is behind the fighter and
   * projects over the fighter's legs. Drawn `depthTest: false` at
   * `renderOrder` 999 it painted straight through them — a 2 px saturated
   * stroke across the darkest object in the frame, measured on
   * `live-result-loss.png` and `live-vs.png` (see `RING_ALWAYS`).
   *
   * `depthTest: true` and `renderOrder = -1` fix it with the depth buffer
   * instead of a screen-space test, and they do not cost the ghost its job.
   * The order matters and is the whole trick: three.js draws the OPAQUE list
   * first (the bodies), then the transparent list sorted by `renderOrder`.
   * Every arena solid is `transparent: true` (environment.js) and sits at
   * order 0, so at −1 the ghost is drawn BEFORE any cover and after every
   * body — depth-tested against the bodies alone. A fighter therefore hides
   * the arc behind it, and the faded block in front of the ring is composited
   * OVER the ghost at its own alpha rather than clipping it, which is exactly
   * "the mark shows through cover".
   *
   * The lozenge keeps `depthTest: false`: it is the silhouette of a body that
   * is BEHIND something, and depth-testing it would erase the one thing the
   * ghost exists to say.
   */
  const shadeMat = new THREE.MeshBasicMaterial({
    color: MARK_SHADE, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.MeshBasicMaterial({
    color: MARK_EDGE, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Group();
  for (const [r0, r1, mat] of [[0.76, 0.84, shadeMat], [0.84, 0.94, ringMat], [0.94, 1.0, edgeMat]]) {
    const m = new THREE.Mesh(new THREE.RingGeometry(rad * r0, rad * r1, 40), mat);
    m.renderOrder = -1;
    ring.add(m);
  }
  layFlat(ring);
  ring.position.y = 0.05;
  ring.renderOrder = -1;
  g.add(ring);
  g.visible = false;
  scene.add(g);
  return { g, bodyMat, ringMat, shadeMat, edgeMat, on: 0, ringOn: 0 };
}

/** One opacity for the whole sandwich — see `makeGhost`. */
function setGhostRing(gh, a) {
  gh.ringMat.opacity = a;
  gh.shadeMat.opacity = a;
  gh.edgeMat.opacity = a;
}

const ghosts = { blue: makeGhost('blue'), orange: makeGhost('orange') };

/**
 * Fade whatever is in the way, and show the silhouette while it is still there.
 *
 * Two of a body's three sample heights behind one solid is the threshold: a
 * block that clips a foot is not worth dissolving the arena for, and by the
 * time two of the three are gone the animal is unreadable. Getting out of the
 * way is quick (rate 14) and coming back is slow (3.5), because being late is
 * the only way the fast direction can fail, while a fast return strobes the
 * whole block every time a fighter crosses its corner.
 */
/**
 * THE WALL RULE (brief §2, stand round 3): "whichever wall is between camera
 * and FIELD fades to the coping". The two-of-three test below fades a solid
 * only when it hides a fighter, and from the boot camera (0, 26, 34) the near
 * wall hides neither — but it hides a strip of the field, and its notch's two
 * cut faces stood as the darkest architecture in the frame at bottom-centre,
 * where the VS card's stats row sits. Per wall: `d` is the eye's distance
 * outside that wall's outer face, and the strip of floor the wall's top edge
 * hides from an eye at height `h` is WALL·d/(h − WALL) minus the 0.8 m of
 * wall thickness; ≥ 1.5 m and the wall (with its apron, coping and stair)
 * goes to the fade value. The boot camera hides 1.6 m → fades; the fight
 * camera −0.1 (the eye is over the wall) → not; the establishing camera from
 * outside the pit → fades. Verbatim from `arena.html`, which photographs it.
 */
const WALL_H = cfg.arena.wallHeight;
function wallHidesField(eye, s) {
  const alongX = s.hx > s.hz;                           // the ±z walls run along x
  const n = alongX ? Math.sign(s.z) : Math.sign(s.x);   // the wall's outward normal
  const d = (alongX ? eye.z : eye.x) * n - (HALF + 0.8);
  if (!(eye.y > WALL_H) || !(d > 0)) return 0;
  return (WALL_H * d) / (eye.y - WALL_H) - 0.8;
}
const _occ = new THREE.Vector3();
const feedWrap = document.getElementById('feedwrap');
/** No fighters on the floor — the wall rule still has an opinion. */
const EMPTY_VIEW = {};
/**
 * Whether the pass has already run for this frame's eye.
 *
 * Raised by the fight branch of the loop and cleared at the loop's tail, not
 * at its head: the head of `frame()` is one of the ten slices
 * `tools/checkframing.mjs` evaluates in Node, and this flag lives outside
 * them — a write to it up there would be a ReferenceError in the gate.
 */
let occluded = false;

function updateOcclusion(view, dt) {
  for (const o of SOLIDS) o.want = 1;
  for (const s of SOLIDS.slice(0, 4)) if (wallHidesField(camera.position, s) >= 1.5) s.want = FADE_TO;
  camera.updateMatrixWorld();
  let underFeed = false;
  for (const id of ['blue', 'orange']) {
    const v = view[id];
    const gh = ghosts[id];
    const body = bodies[id];
    /*
     * NO FIGHTER THIS FRAME → DECAY, not freeze. With `EMPTY_VIEW` the branch
     * below is skipped entirely, so `on`, `ringOn`, `visible` and `position`
     * kept whatever the last fight's final frame left them — and since the VS
     * beat now clears `frames` and takes the arena's own portrait, a fighter
     * that died behind a block left its lozenge and ring drawn at its last
     * position, depth test off, render order 999, over the establishing shot
     * under the card.
     */
    if (!v || !body) {
      const k = 1 - Math.exp(-5 * dt);
      gh.on -= gh.on * k;
      gh.ringOn -= gh.ringOn * k;
      gh.g.visible = gh.on > 0.02 || gh.ringOn > 0.02;
      if (gh.g.visible) {
        gh.bodyMat.opacity = GHOST_BODY * gh.on;
        setGhostRing(gh, GHOST_RING * Math.max(gh.on, gh.ringOn));
      }
      continue;
    }
    for (const o of SOLIDS) o.hits = 0;
    const n = hiddenCount(camera.position, v, body.height, true);
    for (const o of SOLIDS) if (o.hits >= 2) o.want = FADE_TO;
    const want = n >= 3 ? 1 : 0;
    gh.on += (want - gh.on) * (1 - Math.exp(-(want > gh.on ? 16 : 5) * dt));
    /*
     * THE RING RULE (stand round 3). A telegraph ring at y 0.03 is the first
     * thing a 3.2 m block takes, long before the body: a fighter's side — and
     * "they are touching" — stopped reading while the fighter itself showed,
     * because the two-of-three rule never fades a block that clips only the
     * feet. When the ring's centre is hidden from the eye by a solid that is
     * NOT faded (a block already at 0.24 shows the real ring through it), the
     * ghost ring is drawn over the cover at its own opacity; the lozenge stays
     * on the three-sample rule. Same 16/5 rates as the ghost.
     */
    /* Both halves, not one. The rule the stand photographs fades the BLOCK to
       0.24 as well as raising the ghost ring over it (`stand-far.png`: "block
       b hides only the orange ring, so the ring rule fades it to 0.35 with the
       ring over it"), and only the ghost was ported — so a block that hid a
       fighter's ring but fewer than two of three body samples stayed at full
       opacity in the game while the stand faded it. Blocks only (`i >= 4`):
       the four walls are the arena's boundary and have their own rule. */
    /*
     * AND THE TEST IS THE RING, NOT ITS CENTRE.
     *
     * Asking only about (v.x, v.z) means a block that covers half the
     * circumference and misses the middle raises nothing — so the reader gets
     * one bright arc and one washed arc on the same fighter, with a hard
     * vertical seam through the mark and the leg where the faded solid's alpha
     * edge falls. Measured in `live-fighting-w.png` at y=365: the same blue
     * ring reads sat 79 / L 70.7 on its left arc and sat 138 / L 58.6 on its
     * right, six pixels apart. Six samples on the circumference plus the
     * centre: any one of them behind an unfaded solid breaks the mark, and a
     * broken mark is what the ghost ring is for.
     */
    /*
     * …AND A FADED SOLID STILL BREAKS IT. The test used to skip anything
     * already under `fade` 0.6, on the argument that "a block already at 0.24
     * shows the real ring through it". It shows a WASHED one: measured by a
     * polar scan of the blue ring under STONE GOLEM in `live-fighting-w.png`,
     * the arc crossing the faded block face reads L 79.4–80.7 at S 0.16–0.19
     * against L 51.4–54.8 at S 0.64–0.73 on the clean arc — 28 L and 0.55
     * saturation of difference around ONE circle, with a hard vertical seam
     * where the alpha edge falls. Ten per cent of the mark's contrast is not
     * "shows through". Every solid between the eye and the ring raises the
     * ghost now, whatever its own opacity; the ghost's ring is drawn FIRST in
     * the transparent list (`renderOrder` −1, see `makeGhost`), so the faded
     * block composites over it and the mark comes back whole rather than in
     * two values — while the depth buffer still keeps it off the fighters.
     */
    let ringHidden = false;
    const rr = cfg.fighters[id].radius;
    SOLIDS.forEach((o, i) => {
      let touched = segSolid(camera.position, v.x, 0.05, v.z, o);
      for (let k = 0; !touched && k < 6; k++) {
        const th = (k / 6) * Math.PI * 2;
        touched = segSolid(camera.position, v.x + Math.cos(th) * rr, 0.05, v.z + Math.sin(th) * rr, o);
      }
      if (!touched) return;
      ringHidden = true;
      if (i >= 4) o.want = Math.min(o.want, 0.35);
    });
    gh.ringOn += ((ringHidden ? 1 : 0) - gh.ringOn) * (1 - Math.exp(-(ringHidden ? 16 : 5) * dt));
    /*
     * AND A LIVING FIGHTER ALWAYS HAS A MARK UNDER IT — the REAL ring.
     *
     * `RING_ALWAYS` used to put a second, depth-blind copy of the mark under
     * every living body so that a small fighter could not be out-read by a
     * hit's debris. The mark is right and the copy was not: `makeTelegraph`'s
     * ring is already under every living body, in the same sandwich, and it
     * is depth-tested — so the floor bought nothing but a stroke that could
     * paint through a leg (see `RING_ALWAYS`). The occlusion boost is what is
     * left, which is what the ghost was for.
     */
    gh.g.visible = gh.on > 0.02 || gh.ringOn > 0.02 || !!v.alive;
    if (gh.g.visible) {
      gh.g.position.set(v.x, v.y, v.z);
      // a corpse keeps the ring and loses the standing lozenge, which would be
      // the one shape on screen still claiming the loser is on its feet
      gh.bodyMat.opacity = v.alive ? GHOST_BODY * gh.on : 0;
      setGhostRing(gh, Math.max(v.alive ? RING_ALWAYS : 0, GHOST_RING * Math.max(gh.on, gh.ringOn)));
      // white while the blink i-frames are up, so the one moment a fighter is
      // untouchable still reads as untouchable when it happens behind a wall
      gh.bodyMat.color.copy(v.inv ? WHITE : SCENE_COLOR[id]);
      gh.ringMat.color.copy(v.inv ? WHITE : SCENE_COLOR[id]);
    }
    /*
     * THE FEED RULE: the live-feed glass is treated as the blocks are —
     * nothing between the eye and a fighter that cannot fade. It covers a
     * fifth of the width at 1280×720 (ndc x 0.49..0.96, y −0.11..0.58) and the
     * framing allows a fighter out to 0.88; a fighter whose feet or middle
     * project inside its box ghosts it to the same value a block fades to.
     */
    const fb = hudBand.feed;
    if (fb && v.alive) {
      for (const hy of [0, body.height * 0.5]) {
        _occ.set(v.x, v.y + hy, v.z).project(camera);
        if (_occ.z < 1 && _occ.x > fb.x0 && _occ.x < fb.x1 && _occ.y < fb.y0 && _occ.y > fb.y1) underFeed = true;
      }
    }
  }
  feedWrap?.classList.toggle('ghost', underFeed);
  for (const o of SOLIDS) {
    o.fade += (o.want - o.fade) * (1 - Math.exp(-(o.want < o.fade ? 14 : 3.5) * dt));
    for (const m of o.mats) m.opacity = o.fade;
  }
}

/**
 * Do the ground telegraphs point where the simulation says the skill will go?
 *
 * This is not paranoia about three.js Euler order — it is the one thing in the
 * viewer that, if it were wrong, would be WORSE than not drawing it at all. A
 * danger zone drawn on the wrong side of a body does not merely fail to warn,
 * it actively misleads, and it would look perfectly plausible in every
 * screenshot. Four headings, checked at load, in the same frame of reference
 * the simulation uses: heading 0 is +Z and heading PI/2 is +X.
 */
(function checkTelegraphOrientation() {
  /* Какая именно сторона — не важно: обе группы собраны одним и тем же
     `makeTelegraph`, и проверяется здесь его геометрия, а не сторона. */
  const t = tele.orange;
  const probe = new THREE.Object3D();
  probe.position.set(0, 1, 0); // the +Y axis of the flat geometries, before rotation
  t.cone.add(probe);
  const keep = t.g.position.clone();
  t.g.position.set(0, 0, 0);
  const out = new THREE.Vector3();
  for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    t.cone.rotation.z = -h;
    t.g.updateMatrixWorld(true);
    probe.getWorldPosition(out);
    const wantX = Math.sin(h), wantZ = Math.cos(h);
    if (Math.hypot(out.x - wantX, out.z - wantZ) > 0.02) {
      fail(`telegraph points the wrong way at heading ${h.toFixed(2)}: `
        + `drawn towards (${out.x.toFixed(2)}, ${out.z.toFixed(2)}), skill goes to (${wantX.toFixed(2)}, ${wantZ.toFixed(2)})`);
    }
  }
  t.cone.remove(probe);

  /*
   * ── И ДИСК ЗОНЫ: ОН ПРОВЕРЯЕТСЯ НЕ В ЦЕНТРЕ АРЕНЫ ────────────────────────
   *
   * Проверка выше обнуляет позицию группы — и потому не могла поймать самый
   * дорогой класс ошибки в этом файле: диск зоны — РЕБЁНОК группы, которой
   * присвоена позиция бойца, и мировая точка, положенная в его `position`,
   * складывалась с ней. Боец в (12.7, −0.7) рисовал диск в (19.3, −1.2) —
   * промах 12.7 м, у самой стены. В центре арены ошибки нет, поэтому она
   * прожила ровно столько, сколько проверялась в центре.
   *
   * Здесь боец ставится ЗАВЕДОМО НЕ В ЦЕНТР.
   */
  const dprobe = new THREE.Object3D();
  t.disc.add(dprobe);
  t.g.position.set(10, 0, -8);
  const at = 6;
  for (const h of [0, Math.PI / 2, -Math.PI / 2]) {
    t.disc.position.set(Math.sin(h) * at, 0.042, Math.cos(h) * at);
    t.g.updateMatrixWorld(true);
    dprobe.getWorldPosition(out);
    const wantX = 10 + Math.sin(h) * at;
    const wantZ = -8 + Math.cos(h) * at;
    if (Math.hypot(out.x - wantX, out.z - wantZ) > 0.02) {
      fail(`zone telegraph lands in the wrong place at heading ${h.toFixed(2)}: `
        + `drawn at (${out.x.toFixed(2)}, ${out.z.toFixed(2)}), the zone goes to (${wantX.toFixed(2)}, ${wantZ.toFixed(2)})`);
    }
  }
  t.disc.remove(dprobe);
  t.disc.position.set(0, 0.042, 0);

  t.g.position.copy(keep);
})();

/** Where in a skill's own clock we are, in seconds, from the snapshot's 0..1. */
/**
 * Сколько секунд прошло с начала умения.
 *
 * `f.phase` — доля ВСЕГО умения; чтобы получить секунды, нужна его полная
 * длительность. Она бралась ТОЛЬКО из `cfg.skills`, где живут четыре
 * захардкоженных умения и прыжок, — а умение из грамматики зовётся `k1..k3`,
 * и функция возвращала ноль.
 *
 * Последствие было не про прыжок и не про одно умение: телеграф на полу
 * разгорается по `el / kd.windup`, и при нуле он застревал на стартовой
 * плотности НАВСЕГДА. Комментарий рядом с этой формулой объясняет, что
 * разгорание — и есть разница между «предупреждение было» и «предупреждение,
 * на которое можно среагировать»; у всех существ игроков её не было.
 *
 * Полоса каста над головой считалась той же функцией и по той же причине
 * стояла на нуле весь замах.
 */
function actElapsed(f, id = null) {
  const sk = cfg.skills[f.act] || (id && kitLabels[id] && kitLabels[id][f.act]) || null;
  if (!sk) return 0;
  const total = (sk.windup || 0) + (sk.airborne || 0) + (sk.dashSeconds || 0) + (sk.recover || 0);
  return f.phase * total;
}

/*
 * ЗАРЯД В ЗАМАХЕ (docs/VFX.md §4).
 *
 * Грамматика каста начинается не с выхода, а с замаха: элементная энергия
 * собирается на кастере, пока горит телеграф. Сим этого события не пишет —
 * замах виден только по фазе действия в кадре, той же, по которой рисуется
 * телеграф. Здесь она превращается в запись `charge` для слоя эффектов ровно
 * один раз на замах: новое действие или откат `el` назад — новый замах.
 * Телеграф при этом не трогается ни цветом, ни формой (D162).
 */
const chargeSeen = { blue: { act: null, lastEl: 0, live: false }, orange: { act: null, lastEl: 0, live: false } };
function chargeBeat(id, v, kd, el) {
  const cs = chargeSeen[id];
  const winding = !!kd && v.actPhase === 'windup' && (kd.windup || 0) > 0.12;
  if (!winding) { cs.live = false; cs.act = null; return; }
  const fresh = !cs.live || cs.act !== v.act || el < cs.lastEl - 0.05;
  cs.lastEl = el;
  if (!fresh) return;
  cs.live = true; cs.act = v.act;
  try {
    vfx.play({
      kind: 'charge', who: id, element: kd.element || 'kinetic', skill: v.act, t: renderClock,
      x: v.x, z: v.z, h: v.h, windup: Math.max(0.1, kd.windup - el), for: kd.kind,
    }, FX_CTX);
  } catch (err) { console.warn('charge', err); }
}

function updateTelegraph(id, v, view = null) {
  const t = tele[id];
  t.g.position.set(v.x, 0, v.z);
  t.g.visible = v.alive;
  if (!v.alive) return;

  for (const m of t.ring.userData.strokes) m.material.opacity = v.stun ? 0.35 : 0.95;
  t.ring.userData.disc.material.opacity = v.stun ? FILL_ALPHA * 0.4 : FILL_ALPHA;

  const sk = cfg.skills;
  const el = actElapsed(v, id);

  /*
   * ТЕЛЕГРАФ ДЛЯ УМЕНИЙ ИЗ ГРАММАТИКИ.
   *
   * Всё, что ниже, написано под четыре захардкоженных умения и включается по
   * именам `smash`, `charge`, `laser`. Умение из грамматики зовётся `k1`, и ни
   * одна из этих веток на него не срабатывает: существо игрока замахивалось
   * НЕВИДИМО. §10.3 держится на том, что по замаху видно, что сейчас будет, —
   * и держалось это ровно для двух наших существ.
   *
   * Форма берётся из ДОСТАВКИ — тот же принцип, что у §9.2 (доставка владеет
   * силуэтом) и у моста «доставка → поза тела». Конус рисуется конусом, всё,
   * что летит по прямой, — полосой; умения на себя земле не угрожают и фигуры
   * на полу не получают, у них есть полоса каста над головой.
   */
  const kd = kitLabels[id] && kitLabels[id][v.act];
  chargeBeat(id, v, kd, el);
  if (kd && v.actPhase === 'windup' && (kd.windup || 0) > 0.05) {
    const u = THREE.MathUtils.clamp(el / kd.windup, 0, 1);
    /* Плотность несёт УГРОЗУ, цвет — принадлежность (D162): чужая фигура
       плотнее собственной, потолок 0.82, чтобы пол под ней всё же читался. */
    const fade = Math.min(0.95, (0.42 + 0.38 * u) * threatGain(id));
    const reach = kd.range ?? kd.distance ?? 0;
    if (kd.kind === 'cone' && reach) {
      t.cone.visible = true;
      t.cone.scale.setScalar(reach + cfg.fighters[id].radius);
      faceHeading(t.cone, v.h);
      setFade(t.cone, fade);
      t.lane.visible = false;
      return;
    }
    /*
     * ЗОНА ТЕЛЕГРАФИРУЕТСЯ ДИСКОМ, А НЕ ПОЛОСОЙ.
     *
     * Ветка знала только конус, а всё остальное рисовала полосой по курсу.
     * У зоны range 12 и radius 3: игрок видел прямую полосу длиной двенадцать
     * метров вместо диска радиусом три в точке установки — вчетверо больше
     * настоящего и не той формы. Диск появлялся только в момент срабатывания,
     * то есть когда уходить уже поздно.
     *
     * Комментарий в этом же файле называет телеграф, который преувеличивает,
     * хуже отсутствующего: он учит неверному уклонению. Зона стоит в живых
     * наборах прямо сейчас.
     *
     * Точка установки считается ТАК ЖЕ, как в симуляции (`deliver.js`, ветка
     * `zone`): min(дальность, расстояние до врага) по курсу. Иначе диск
     * встанет не туда, куда придёт зона.
     */
    if (kd.kind === 'zone' && kd.radius) {
      t.cone.visible = false;
      t.lane.visible = false;
      t.disc.visible = true;
      const you = view && view[id === 'blue' ? 'orange' : 'blue'];
      const toEnemy = you ? Math.hypot(you.x - v.x, you.z - v.z) : reach;
      const at = Math.min(reach || kd.range || 12, toEnemy);
      /*
       * КООРДИНАТЫ ЗДЕСЬ ЛОКАЛЬНЫЕ, А НЕ МИРОВЫЕ.
       *
       * `t.disc` — ребёнок группы `t.g`, а группе на первой строке этой
       * функции присвоена позиция бойца. Мировая точка, положенная в
       * `disc.position`, складывается с ней и даёт УДВОЕННУЮ координату
       * кастера: боец в (12.7, −0.7) рисовал диск в (19.3, −1.2) — промах
       * 12.7 м, у самой стены. Совпадало только когда кастер стоял ровно в
       * центре арены, а самопроверка `checkTelegraphOrientation` обнуляет
       * позицию группы и щупает конус — то есть проверяет ровно тот случай,
       * в котором ошибки нет.
       */
      t.disc.position.set(Math.sin(v.h) * at, 0.042, Math.cos(v.h) * at);
      t.disc.scale.setScalar(kd.radius);
      setFade(t.disc, fade);
      return;
    }
    if (reach && kd.kind !== 'self' && kd.kind !== 'blink') {
      t.lane.visible = true;
      t.cone.visible = false;
      faceHeading(t.lane, v.h);
      /*
       * Обрезаем укрытием ТОЛЬКО то, что укрытие останавливает.
       *
       * Луч и рывок упираются в первый солид, и полоса до него — правда.
       * Навес летит по дуге, зона ставится в точку: им укрытие безразлично
       * (`needsLos: false` в реестре), и обрезанная полоса обещала бы им
       * дальность вдвое меньше настоящей. Телеграф, который преуменьшает,
       * учит неверному дожду ровно так же, как тот, который преувеличивает.
       */
      const shown = kd.needsLos ? dashReach(id, v.x, v.z, v.h, reach) : reach;
      t.lane.scale.set(1, Math.max(0.02, shown) / t.laneLen, 1);
      setFade(t.lane, fade);
      return;
    }
    /* На себя и мигание: земле ничто не угрожает, фигуры нет. */
    t.cone.visible = false; t.lane.visible = false;
    return;
  }
  if (kd) { t.cone.visible = false; t.lane.visible = false; t.disc.visible = false; }

  /*
   * Both wind-ups are under a third of a second — eight frames at 30 Hz — so a
   * telegraph that fades UP from nothing spends most of its life invisible and
   * the hit still arrives unannounced. They start clearly visible and brighten,
   * which is the difference between "there was a warning" and "there was a
   * warning you could act on".
   */
  /* Диск гасится БЕЗУСЛОВНО, как конус и полоса ниже.
     Он гасился только внутри ветки `if (kd)`, а у бойца без набора `kd`
     всегда falsy — и диск зоны из прошлого боя стоял на арене весь
     следующий. По живой базе «бой с набором → бой без набора» — обычная
     последовательность. */
  t.disc.visible = false;
  const winding = v.act === 'smash' && v.actPhase === 'windup';
  t.cone.visible = winding;
  if (winding) {
    const u = THREE.MathUtils.clamp(el / sk.smash.windup, 0, 1);
    t.cone.scale.setScalar(sk.smash.range + cfg.fighters[id].radius);
    faceHeading(t.cone, v.h);
    setFade(t.cone, Math.min(0.95, (0.42 + 0.38 * u) * threatGain(id)));
  }

  // charge: the lane while it can still be aimed, and again while it travels,
  // so the committed path is visible rather than inferred from a blur
  const revving = v.act === 'charge' && v.actPhase === 'windup';
  const running = v.act === 'charge' && v.actPhase === 'dash';
  t.lane.visible = revving || running;
  if (revving || running) {
    // Trimmed twice: by the dash time still unspent, and by the first solid in
    // the way. Mid-dash the lane is what is LEFT of the charge, which is the
    // only honest thing to draw once part of it has been spent.
    const spent = running ? THREE.MathUtils.clamp(el - sk.charge.windup, 0, sk.charge.dashSeconds) : 0;
    const budget = sk.charge.dashSpeed * (sk.charge.dashSeconds - spent);
    faceHeading(t.lane, v.h);
    t.lane.scale.set(1, Math.max(0.02, dashReach(id, v.x, v.z, v.h, budget)) / t.laneLen, 1);
  }
  if (revving) {
    const u = THREE.MathUtils.clamp(el / sk.charge.windup, 0, 1);
    setFade(t.lane, Math.min(0.95, (0.38 + 0.36 * u) * threatGain(id)));
  } else if (running) {
    const u = THREE.MathUtils.clamp((el - sk.charge.windup) / sk.charge.dashSeconds, 0, 1);
    setFade(t.lane, Math.min(0.95, 0.55 * (1 - u) * threatGain(id)));
  }

  // laser: where the beam will leave from, tracked live through the cast
  const casting = v.act === 'laser' && v.actPhase === 'windup';
  t.aim.visible = casting;
  if (casting) {
    const u = THREE.MathUtils.clamp(el / sk.laser.windup, 0, 1);
    faceHeading(t.aim, v.h);
    t.aim.material.opacity = 0.34 + 0.4 * u;
    /*
     * Trimmed at the first solid, like the charge lane beside it.
     *
     * The lane has been honest about its reach since `dashReach` went in, with
     * a comment arguing that a telegraph which overstates is worse than none.
     * The aim line was not: it was drawn at the full 24 m range and ran through
     * blocks and out through the 4 m walls into the void, while the legend
     * promised "where the beam will go" and the sim blocked the shot — the
     * stats count it, `blocked.laser` was 1 of 9 uses in one match. The beam
     * leaves from `radius + 0.2` ahead of the centre and stops at the first
     * solid (sim.js resolveStrike), so the drawn plane, which starts at the
     * centre, ends exactly where the beam does.
     */
    const rOff = cfg.fighters[id].radius + 0.2;
    t.aim.scale.set(1 + u * 4, (rOff + beamReach(v.x, v.z, v.h, rOff)) / sk.laser.range, 1);
  }

  /*
   * AND NOTHING SURVIVES INTO THE RESULT THAT WAS NOT PART OF THE FIGHT.
   *
   * `v.inv` is read from the last interpolated bracket, and once the fight
   * stops streaming that bracket stops changing — so a fighter that died
   * inside its own i-frames left this wireframe sphere standing on the plaza
   * for the whole result beat. Measured in `live-result-win-w.png`: a white
   * lat/long globe at (1205–1280, 515–625), #F5F3F1 at L* 95.9 — brighter
   * than the coping, which ARENA-BRIEF §3 makes the ceiling of the whole
   * picture — with no shadow, no contact and no relationship to anything, on
   * the one beat the player looks at longest. A corpse is not untouchable and
   * a decided fight has no i-frames: both are reasons this is off.
   */
  t.shell.visible = !!v.inv && !!v.alive && !decided;
  if (t.shell.visible) {
    t.shell.position.y = cfg.fighters[id].radius * 1.2 + v.y;
    t.shell.material.opacity = 0.45 + 0.25 * Math.sin(performance.now() / 55);
    t.shell.rotation.y += 0.06;
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

const hud = $('#hud');
const feed = $('#feed');
/* Ключ — СТОРОНА (цвет). Идентификаторы в разметке остались `-oct`/`-gor`:
   это имена узлов и CSS-переменных, их читают `index.html`, `hud-skin.js` и
   продуктовые стили, и вида они уже не называют. Перевод один и здесь. */
const bars = {
  blue: { wrap: $('#bar-oct'), fill: $('#bar-oct .hp > i'), label: $('#bar-oct .hp > b'), cds: $('#bar-oct .cds'), meta: $('#meta-oct') },
  orange: { wrap: $('#bar-gor'), fill: $('#bar-gor .hp > i'), label: $('#bar-gor .hp > b'), cds: $('#bar-gor .cds'), meta: $('#meta-gor') },
};
/**
 * Русские подписи умений и имена существ на плитах.
 *
 * Экран боя утверждён поэлементно (§10.6) — но утверждён он был как
 * инструмент ревьюера, на английском и с названиями сторон вместо имён
 * существ. В продукте на плите стоит имя существа игрока, а не название
 * стороны, и подпись чипа читается по-русски. Таблица тут, а не в клиенте,
 * потому что чипы строит этот файл.
 */
const SKILL_RU = {
  laser: 'laser', blink: 'blink', smash: 'smash', charge: 'charge', jump: 'leap',
  beam: 'beam', cone: 'fan', bolt: 'bolt', lob: 'mortar', zone: 'field', dash: 'lunge',
};
/**
 * Как умение называется в ленте боя.
 *
 * Сначала — набор ТЕКУЩЕГО боя: у существа с грамматикой умения зовутся
 * `k1..k3`, и это внутренние имена, которыми мозг их вызывает. Игроку они
 * не говорят ничего: «ПРИЗМА · k1 · 26» — это строка для отладки, а стоит
 * она в ленте, то есть на месте свидетельства.
 */
const kitLabels = { blue: null, orange: null };
const skillRu = (id, who) => {
  const k = who && kitLabels[who] && kitLabels[who][id];
  if (k) return k.ru.toLowerCase();
  return SKILL_RU[id] || id;
};
/**
 * Почему удар не прошёл — словами игрока.
 *
 * `airborne` здесь главная: это единственное место в продукте, где видно,
 * что прыжок сработал. Остальные три существовали в симуляции с самого
 * начала и до сих пор не доезжали до экрана ни у одного существа с набором.
 */
const MISS_RU = {
  airborne: 'passed under the leap',
  cover: 'blocked by cover',
  range: 'out of range',
  aim: 'missed',
};

/**
 * WHY THE FIGHT ENDED — ONE TABLE FOR THE WHOLE PRODUCT.
 *
 * These four strings are the same four `screens/history.js` prints in the
 * match detail, word for word. They used to differ: the banner said "the
 * opponent ran out of health" and the detail said "knocked out", so one fight
 * carried two vocabularies depending on whether it was being watched or
 * remembered. "in the same tick" went with them — a tick is the simulation
 * talking, and nothing else a player reads counts in ticks.
 *
 * The viewer is a page of its own and cannot import the client's module, so
 * the table is duplicated rather than shared; the words are the contract
 * (docs/REDESIGN.md §9, glossary) and the two copies are kept identical.
 */
const REASON = {
  kill: 'knocked out',
  timeout: 'time ran out, more health left',
  'timeout-draw': 'time ran out, health even',
  'double-ko': 'both went down at once',
};

/**
 * Имя существа на стороне — приходит в сообщении `match`.
 *
 * До него в ленте и на плашке победы стоит сама сторона, а сторона — это
 * цвет и только цвет. Здесь стояли «осьминог» и «горилла»: названия видов,
 * которых больше нет, — и на гостевом бое без имён зритель читал их как
 * настоящих участников.
 */
const sideName = { blue: 'BLUE', orange: 'ORANGE' };

const cdEls = { blue: {}, orange: {} };

/**
 * Перестроить чипы кулдаунов под набор бойца.
 *
 * `kit` — `{ k1: {ru, element}, ... }` от сервера, либо null для существа на
 * эталонном наборе. Имена, которыми зовёт мозг (`k1`), игроку не показываются
 * никогда: он читает «конус·урон», а не «k1».
 */
function rebuildCds(id, kit) {
  const box = bars[id].cds;
  box.innerHTML = '';
  cdEls[id] = {};
  /*
   * D160: у существа с набором чипов РОВНО ТРИ. Раньше сюда дописывался
   * четвёртый, «прыжок», — и он был правдой ровно до того дня, когда прыжок
   * перестал доставаться всем даром. Чип умения, которого у бойца нет,
   * обещает кнопку, которой не существует.
   *
   * Два захардкоженных эталона кита не имеют, и им прыжок по-прежнему
   * дописывается: `skillsOf` отдаёт его им на сервере, и HUD обязан
   * показывать то же, что видит мозг.
   */
  /*
   * D160: у существа с набором чипов РОВНО ТРИ. Раньше сюда дописывался
   * четвёртый, «прыжок», — и он был правдой ровно до того дня, когда прыжок
   * перестал доставаться всем даром. Чип умения, которого у бойца нет,
   * обещает кнопку, которой не существует.
   *
   * Два захардкоженных эталона кита не имеют, и им прыжок по-прежнему
   * дописывается: `skillsOf` отдаёт его им на сервере, и HUD обязан
   * показывать то же, что видит мозг.
   *
   * D195 (07.09) держит то же правило против собственной правки: свободный
   * четвёртый глагол был на день восстановлен и в тот же день снят, и чип для
   * него снят вместе с ним. Ряд плиток равен набору, всегда.
   */
  const names = kit ? Object.keys(kit) : cfg.fighters[id].skills.concat('jump');
  for (const name of names) {
    const el = document.createElement('div');
    el.className = 'cd';
    el.dataset.skill = name;
    el.textContent = kit && kit[name] ? kit[name].ru : skillRu(name, id);
    box.appendChild(el);
    cdEls[id][name] = el;
  }
  if (window.__airenaSkin) window.__airenaSkin();
}

const sayEls = { blue: null, orange: null };
const lastSaid = { blue: null, orange: null };
function setSay(id, textValue) {
  /* The product is English-only; quips from legacy brains may still be Russian. */
  if (textValue && /[Ѐ-ӿ]/.test(textValue)) textValue = '';
  /*
   * Реплика дублируется в ленту.
   *
   * F11 закрыл исходник и назначил эти строки одним из двух доказательств,
   * что поведение написала модель. Пузырь висит три секунды над телом, и
   * зритель, смотревший в другую половину арены, теряет единственное
   * доказательство, которое там было. Лента его сохраняет.
   */
  if (textValue && lastSaid[id] !== textValue) {
    lastSaid[id] = textValue;
    /* Имя стороны — наше, реплика — чужая: экранируется только она. */
    /*
     * A QUIP IS THE ONE PROOF A MIND IS FIGHTING, AND IT WAS WALLPAPER.
     *
     * Measured on 361 stored quips (review §5, finding 8): 1.9 distinct lines
     * per speaking fighter, repeated on every cast — "Charging up." twelve
     * times in one fight. The line is worth keeping and worth keeping ONCE, so
     * it carries a key of its own text and a ten-second window: a repeat inside
     * that raises a counter on the row already there instead of pushing the
     * rest of the fight off the bottom of a fourteen-line feed.
     */
    pushFeed(`<span style="color:#${COLOR[id].toString(16)}">${esc(sideName[id])}</span> · <i style="font-style:normal;opacity:.9">\u201c${esc(textValue)}\u201d</i>`,
      `say|${id}|${textValue}`, { window: 10 });
  }
  if (!textValue) {
    /*
     * THE MEMORY IS CLEARED WITH THE BUBBLE.
     *
     * `lastSaid` was written and never reset, so it did not mean "the line
     * showing now", it meant "the last line this fighter ever said" — and a
     * mind that said one thing at 2 s and the same thing again at 24 s reached
     * the feed once in a fight it spoke through twice. The guard stays for the
     * bubble and goes with the bubble: repetition is now collapsed by
     * `pushFeed` on a clock, not by a memory with no end.
     */
    lastSaid[id] = null;
    if (sayEls[id]) { sayEls[id].remove(); sayEls[id] = null; }
    return;
  }
  if (!sayEls[id]) {
    const d = document.createElement('div');
    d.className = 'saybubble';
    d.style.color = `#${COLOR[id].toString(16).padStart(6, '0')}`;
    hud.appendChild(d);
    sayEls[id] = d;
  }
  sayEls[id].textContent = textValue;
}

/**
 * THE PILL'S COLOUR AND THE PILL'S POSITION HAVE TO NAME THE SAME FIGHTER.
 *
 * `who` here is the VICTIM — `playFx` calls this with `e.who` and derives the
 * actor one line below as the other side — and the pill is anchored over
 * `bodies[who]`, i.e. over the creature that was HIT. It was painted the
 * colour of the creature that hit it. So the one number the arena produces
 * pointed at one side and was coloured the other: measured on
 * `live-fighting.png`, a `−20` pill in `--info` blue floating over coral-ringed
 * MARK-92; on `live-fighting-w.png` a blue `−33` over coral-ringed PRESS-60.
 * A stranger reads that as the blue creature's number.
 *
 * The victim wins, because the victim is what the pill is standing on and
 * whose HP bar moves on the same frame — position, colour and bar then say
 * one thing. The dealer is not thrown away: it keeps a caret on the pill's
 * leading edge in its own hue (`--from`, drawn by `hud.css`), so the two facts
 * occupy two marks instead of contradicting each other inside one.
 */
function floatDamage(x, z, amount, who) {
  const d = document.createElement('div');
  d.className = 'dmg';
  /* Округление на всякий случай и здесь: старые записанные бои в базе несут
     сырое число, а повтор обязан читаться так же, как живой бой. */
  d.textContent = `-${Math.round(Number(amount) * 100) / 100}`;
  d.style.color = `#${COLOR[who].toString(16).padStart(6, '0')}`;
  d.style.setProperty('--from', `#${COLOR[who === 'blue' ? 'orange' : 'blue'].toString(16).padStart(6, '0')}`);
  d.dataset.from = who === 'blue' ? 'orange' : 'blue';
  hud.appendChild(d);
  const born = performance.now();
  /*
   * ABOVE THE HEAD, NOT IN THE CHEST. The pill used to rise from 1.8 m to
   * 4.0 m — torso height for the 2 m stock bodies and mid-chest for the ~5 m
   * generated ones that are now normal — and its surface is `--glass-strong`,
   * measured brighter than the floor: it punched a white hole through the one
   * dark shape in the picture, on the frame that most needed it read. The
   * nameplate already owns the air over the head (`updatePlate`, +0.45); this
   * starts half a metre above that and climbs out of it.
   */
  const top = Math.max(1.4, bodies[who]?.top ?? bodies[who]?.height ?? 2);
  const tick = () => {
    const u = (performance.now() - born) / 1100;
    if (u >= 1) { d.remove(); return; }
    const v = project(x, top + 0.5 + u * 2.5, z);
    d.style.left = `${v.x}px`; d.style.top = `${v.y}px`;
    d.style.opacity = String(1 - u * u);
    d.style.fontSize = `${20 - u * 5}px`;
    requestAnimationFrame(tick);
  };
  tick();
}

const _p = new THREE.Vector3();
function project(x, y, z) {
  _p.set(x, y, z).project(camera);
  return { x: (_p.x * 0.5 + 0.5) * innerWidth, y: (-_p.y * 0.5 + 0.5) * innerHeight };
}

/**
 * The feed, with the repeats collapsed.
 *
 * Every laser does exactly 27 and every smash exactly 35, so a fight that goes
 * the distance prints the same string eight times in a row and the feed carries
 * nothing but ordering — eight consecutive "blue laser 27" lines in the audit
 * shots. Counting the repeat instead keeps the ordering, says how many, and
 * leaves room in fourteen lines for the events that are not repeats.
 */
/**
 * Экранирование для ленты боя.
 *
 * ЗАЧЕМ. `pushFeed` собирает строку разметкой и кладёт её в `innerHTML` —
 * это удобно для цветных имён и курсива, и это же дыра, если внутрь попадает
 * текст, который писали не мы. Ровно один такой текст есть: РЕПЛИКА МОЗГА
 * (`api.say`). Мозг пишет модель по промпту игрока, симуляция режет реплику
 * до девяноста символов и НИЧЕГО не экранирует, а кадр с ней уезжает КАЖДОМУ
 * зрителю боя — включая анонимных гостей на витрине и всё это внутри чужого
 * iframe (F8).
 *
 * Проверено прогоном изолята: `api.say('<img src=x onerror=…>')` доезжает до
 * кадра ПОБИТОВО. Заголовка CSP сервер не отдаёт, значит обработчик
 * исполнился бы.
 *
 * Имена существ санитизируются на входе (`creatures.js`, `sanitizeName`), а
 * реплика — нет и не может: это свободный текст, в нём законны и кавычки, и
 * угловые скобки. Значит экранировать надо на выходе, здесь.
 */
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/*
 * ── A REPEAT NO LONGER HAS TO BE THE LINE ABOVE ────────────────────────────
 *
 * Collapsing only against the TOP line answers "the same laser eight times in
 * a row" and nothing else, and the fight does not oblige. Two things measured
 * on 361 stored quips (review §5, finding 8) fall straight through it: a mind
 * that alternates two lines — "Charging up." / "Closing in." — prints both on
 * every cast forever, and a control field whose refusal fires between two
 * damage lines prints a fresh row every half second.
 *
 * So a key may also collapse into a line further down, while that line is
 * young: `window` seconds of fight time, 0 meaning the old top-only rule. The
 * count goes up in PLACE and the row keeps its own first stamp — the column is
 * read downward and a timestamp that walked forward would break the ordering
 * that is the feed's only structure. The top line keeps the old behaviour and
 * takes the newest stamp, because there is nothing above it to disorder.
 */
function pushFeed(line, key, { window: win = 0, ev = false } = {}) {
  const paint = (el) => {
    const n = Number(el.dataset.n) || 1;
    el.innerHTML = `<span class="ft">${el.dataset.stamp}</span>${el.dataset.body}`
      + (n > 1 ? ` <span style="opacity:.6">x${n}</span>` : '');
  };
  if (key) {
    const top = feed.firstElementChild;
    if (top && top.dataset.key === key) {
      top.dataset.n = String((Number(top.dataset.n) || 1) + 1);
      top.dataset.stamp = renderClock.toFixed(1);
      top.dataset.body = line;
      paint(top);
      return;
    }
    if (win > 0) {
      for (const el of feed.children) {
        if (el.dataset.key !== key) continue;
        const t0 = Number(el.dataset.t0);
        /* The first match walking from the newest end IS the most recent one;
           if that is already out of the window, so is everything behind it. */
        if (!Number.isFinite(t0) || renderClock - t0 > win) break;
        el.dataset.n = String((Number(el.dataset.n) || 1) + 1);
        paint(el);
        return;
      }
    }
  }
  const d = document.createElement('div');
  d.dataset.stamp = renderClock.toFixed(1);
  d.dataset.t0 = String(renderClock);
  d.dataset.body = line;
  if (key) d.dataset.key = key;
  /* "This line is already a sentence" — read by the product shell and by the
     stylesheet that sets the row back. */
  if (ev) d.dataset.ev = '1';
  paint(d);
  feed.prepend(d);
  while (feed.children.length > 14) feed.lastChild.remove();
}

/**
 * Nameplates: the two numbers that change, over the fighter they belong to.
 *
 * `project` already puts the taunt bubble on a body, so this is the same trick
 * with the health bar and the cast bar a duel is actually read from. The cast
 * bar is the more valuable of the two: the laser's wind-up is 0.65 s of config
 * and 0.667 s on the tick clock — long enough to react to — and until now the
 * only sign it was happening at all was a thin line on the floor.
 */
const plates = {};
for (const id of ['blue', 'orange']) {
  const d = document.createElement('div');
  d.className = 'plate';
  d.style.color = `#${COLOR[id].toString(16).padStart(6, '0')}`;
  d.innerHTML = '<div class="lab"></div><div class="t"><i></i></div><div class="t cast"><i></i></div>';
  d.style.display = 'none';
  hud.appendChild(d);
  plates[id] = { root: d, lab: d.querySelector('.lab'), hp: d.querySelector('.t > i'), cast: d.querySelector('.cast > i') };
}

/**
 * PUT THE PLAYER'S CREATURE IN BLUE, WHATEVER SLOT IT WAS DEALT.
 *
 * Called on every `match`, once, before the first frame of it is drawn. It
 * rewrites the three colour tables by ROLE and then walks everything this file
 * built once per side — the two node-material uniforms, the raster telegraph
 * faces, the two rims, the name plates and a say-bubble that may still be up —
 * so a fight never starts with half the screen on the last fight's mapping.
 *
 * What it deliberately does NOT do is rebuild anything: see `sideTint`.
 *
 * Two signals go out with it, because the picture is not the only surface that
 * has to agree. `window.__airenaSides` says which ROLE each hue is carrying
 * ('own' / 'foe', or 'slot' when nobody in this fight belongs to the viewer),
 * and `body.dataset.mine` carries the slot itself so the HUD's stylesheet can
 * put the player's panel on the left with one attribute selector rather than a
 * second copy of this decision in JavaScript.
 */
function applySides(signal = true) {
  for (const id of ['blue', 'orange']) {
    const role = sideRole(id);
    COLOR[id] = HUE[role];
    SCENE_COLOR[id].copy(toned(HUE[role]));
    RIM_COLOR[id].copy(toned(HUE_RIM[role]));
    SIDE_U[id].value.copy(SCENE_COLOR[id]);
    FILL_COLOR[id].copy(toned(HUE_FILL[role]));
    for (const m of sideMats[id]) m.color.copy(SCENE_COLOR[id]);
    for (const m of rimMats[id]) m.color.copy(RIM_COLOR[id]);
    for (const m of fillMats[id]) m.color.copy(FILL_COLOR[id]);
    const hex = `#${COLOR[id].toString(16).padStart(6, '0')}`;
    if (plates[id]) plates[id].root.style.color = hex;
    if (sayEls[id]) sayEls[id].style.color = hex;
  }
  if (typeof window !== 'undefined') {
    window.__airenaSides = mineSide
      ? { blue: 'own', orange: 'foe', mine: mineSide }
      : { blue: 'slot', orange: 'slot', mine: null };
    /*
     * …AND IT IS MIRRORED WHERE A CAPTURE ALREADY LOOKS.
     *
     * The handle was published and read by nobody: `grep` over `src/` and
     * `tools/` found no consumer, and a dead handle on the one decision the
     * founder's addendum is about drifts in silence. `tools/shots.mjs` spreads
     * `window.__airenaDrawn` into every sidecar JSON, so hanging the resolved
     * mapping there records the role-to-hue answer beside every live picture —
     * a future disagreement between the viewer's palette and the HUD's is then
     * caught by the JSON rather than by eye, and no capture-side change is
     * needed to get it.
     */
    if (window.__airenaDrawn) window.__airenaDrawn.sides = window.__airenaSides;
  }
  /*
   * THE DOM SIGNAL IS WRITTEN THE WAY THE HUD WRITES IT, OR NOT AT ALL.
   *
   * `screens/live.js` (`markMine`) already keeps `body[data-mine]` from the
   * store, and its stylesheet keys on the attribute's PRESENCE — so writing an
   * empty string here would leave `data-mine=""`, which matches
   * `body[data-mine]` and would swap the panels for a spectator. Same shape as
   * the HUD's, then: the slot when there is one, the attribute removed when
   * there is not. And only from a real `match` — a `?ui=` fixture states its
   * own ownership and has no socket to be corrected by, so the module's own
   * first call must not touch what the fixture set.
   */
  if (signal && typeof document !== 'undefined' && document.body) {
    if (mineSide) document.body.dataset.mine = mineSide;
    else delete document.body.dataset.mine;
  }
}
applySides(false);

function updatePlate(id, v, height) {
  const p = plates[id];
  if (!v.alive) { p.root.style.display = 'none'; return; }
  /* Умение может быть захардкоженным (cfg.skills) или из грамматики — тогда
     его параметры приехали с набором. Второй случай — это все существа
     игроков, и до этой строки полоса каста у них не появлялась ни разу. */
  const sk = cfg.skills[v.act] || (kitLabels[id] && kitLabels[id][v.act]) || null;
  const casting = !!sk && v.actPhase === 'windup' && (sk.windup || 0) > 0.05;
  p.root.style.display = 'block';
  p.root.classList.toggle('casting', casting);
  p.hp.style.width = `${THREE.MathUtils.clamp(v.hp / v.maxHp, 0, 1) * 100}%`;
  if (casting) {
    /* Имя для человека, а не идентификатор слота: «конус·урон», не «k1». */
    p.lab.textContent = (kitLabels[id] && kitLabels[id][v.act]?.ru) || v.act;
    p.cast.style.width = `${THREE.MathUtils.clamp(actElapsed(v, id) / sk.windup, 0, 1) * 100}%`;
  }
  const at = project(v.x, v.y + height + 0.45, v.z);
  p.root.style.left = `${at.x}px`;
  p.root.style.top = `${at.y}px`;
}

// ---------------------------------------------------------------------------
// the socket
// ---------------------------------------------------------------------------

let frames = [];
/**
 * Effects waiting for the render clock to reach them, `{ t, fx }` in order.
 *
 * They used to fire the instant their frame arrived off the socket, which put
 * every beam, blink ring, screen shake and damage number one to two snapshot
 * intervals AHEAD of the body that caused it — the flash landed before the arm
 * came down and the hit number floated off a fighter still winding up. The
 * bodies are drawn at `renderClock`; so is this now.
 */
let pendingFx = [];
let matchInfo = null;
let renderClock = 0;
let over = null;

/**
 * The fight is decided — read off the frame being DRAWN, not off the message.
 *
 * `over` above is the socket's `over` message, and the server runs the world
 * with `curtainSeconds` 2.6, so that message lands 2.6 s after somebody dies.
 * The camera had nothing else to go on, which made the whole death animation
 * and topple — 154 rendered frames a match at 60 Hz, measured over 24 kills on
 * l1/l3, l1/l4, l3/l1, l1/l6, l2/l5, l4/l2 at seeds 101, 202, 303, 404 — a
 * window in which the framing rule dropped the corpse (`holds` and
 * `checkFraming` both skipped a dead fighter until `over` arrived) and the kill
 * push-in had not started: mean eye distance across that window 19.26 m against
 * 15.11 m off this flag, and 19.21 m against 14.50 m at the 1.3 s mark, which
 * is the middle of the topple. The push-in was arriving after its own shot.
 *
 * The snapshot has carried `over` per frame all along (`sim.js` sets it on the
 * same tick that sets `alive: false`), so the flag is free and it is exactly in
 * step with the corpse the viewer is drawing — `view[id].alive` comes from the
 * same bracket frame. The banner, the stats and the loop timer still wait for
 * the message, because those are about the match REPORT and not about the shot.
 */
let decided = false;

const SNAP_DT = 1 / cfg.tickHz;
/** How far behind the newest snapshot the render clock runs. Two intervals. */
const DELAY = SNAP_DT * 2;

let ws;
/* Живёт СНАРУЖИ `connect`: переподключение вызывает её заново, и локальная
   переменная обнулялась бы на каждой попытке — то есть «связи нет уже пять
   секунд» никогда бы не наступило. */
let downSince = 0;

function connect() {
  /*
   * ── ЛИЧНОСТЬ СОКЕТА ЕДЕТ ПОДПРОТОКОЛОМ, А НЕ ТОЛЬКО КУКОЙ ────────────────
   *
   * D22 увёл сессию из куки в заголовок `Authorization: Bearer` ровно потому,
   * что продукт живёт в чужом iframe (F8), где куки может не быть вовсе. А
   * рукопожатие WebSocket из браузера заголовков не принимает — API их не
   * даёт. Значит сокет опознавался ТОЛЬКО кукой, и в проде, где её нет, он
   * анонимен: ни «ТВОЁ» на плите, ни «твой бой» под часами, ни перебивки
   * «свой бой забирает экран». То есть весь D162 в проде не работал бы.
   *
   * Подпротокол — единственный заголовок, который браузер даёт задать. Он не
   * попадает ни в строку запроса, ни в логи прокси, в отличие от `?token=`.
   * Сервер выбирает первый протокол и читает второй как токен.
   */
  let tok = null;
  try { tok = localStorage.getItem('airena.session'); } catch { /* приватный режим */ }
  /* Сокет идёт туда же, куда ручки: бой считает бэкенд, а не тот, кто отдал
     страницу. Без `API()` живая трансляция осталась бы стучаться в раздатчик
     статики, где `/ws` не отвечает вовсе. */
  const url = API()
    ? `${API().replace(/^http/, 'ws')}/ws`
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  ws = tok ? new WebSocket(url, ['airena', tok]) : new WebSocket(url);
  window.__ws = () => (ws ? ws.readyState : -1);
  /* Одна дверь наружу для оболочки: попросить сервер повторить конкретный
     бой. Второй сокет дал бы второе мнение о том, что сейчас идёт. */
  window.__airenaSend = (v) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(v)); };
  /*
   * ПЕРЕОТКРЫТЬ СОКЕТ. Нужно ровно после привязки аккаунта.
   *
   * Личность сокета берётся ОДИН РАЗ, на рукопожатии, из куки. `claimAccount`
   * всегда меняет id: гостевой `g_…` удаляется, вместо него появляется `u_…`.
   * Сокет остаётся с прежней личностью, и первое же созданное существо
   * приезжает как ЧУЖОЕ — `owned: false`, значит ни «ТВОЁ» на плите, ни
   * «твой бой» под часами.
   *
   * Проверять владение по каждой команде нельзя: у сокета нет токена после
   * рукопожатия, а верить слову клиента про владение — это отдать метку
   * принадлежности тому, кто её просит. Дешевле и честнее переоткрыть.
   */
  window.__airenaReconnect = () => { try { ws.close(); } catch { /* уже закрыт */ } };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    /*
     * Everything the socket says is re-broadcast as a DOM event.
     *
     * The product shell (tabs, result panel, idle countdown) has to react to
     * the same messages, and giving it a second socket would give it a second
     * opinion about what fight is running. One socket, one truth, and the
     * shell listens rather than asks.
     */
    dispatchEvent(new CustomEvent(`airena:${m.type}`, { detail: m }));
    if (m.type === 'error') { fail(m.message); return; }
    if (m.type === 'match') {
      frames = []; pendingFx = []; renderClock = 0; over = null; decided = false; matchInfo = m; framingLost = false;
      /*
       * AND THE FIRE GOES OUT WITH THE FIGHT THAT LIT IT.
       *
       * `env.applySuddenDeath(heat)` is called from one place — the fight
       * branch of the loop — so a match that reached sudden death left the
       * floor at FLOOR_BURN, the fog and the sky at their ember, and the
       * reflection at 0.3×, with nothing resetting them through the result
       * card, the searching beat or the next match's VS. Since the VS beat
       * became the arena's own portrait that is the whole picture: the next
       * fight was announced over the previous fight's fire, and it cleared
       * only on the new fight's first frame.
       */
      env.applySuddenDeath(0);
      quarantined = false; postFailed = false;
      /* Чья сторона (D162). Сервер считает это персонально для сокета; здесь
         только запоминаем, чтобы телеграфы и плиты читали одно и то же. */
      mineSide = m.mine || null;
      /* …and the whole palette follows it, in one place, before this match's
         first frame: the player's creature is the blue one whatever slot the
         server dealt it (ARENA-AAA §1). */
      applySides();
      /*
       * Эффекты прошлого боя снимаются вместе с ним.
       *
       * Стена живёт до пяти секунд, плита зоны — до трёх, ожог — полторы.
       * Между боями обычно есть карточка итога, поэтому видно это редко; при
       * быстром переходе (D161 сократил паузу до пяти секунд) плита зоны из
       * предыдущего боя стояла на арене нового.
       */
      for (const f of fxPool) {
        scene.remove(f.obj);
        f.obj.traverse?.((o) => {
          if (!o.geometry?.userData?.shared) o.geometry?.dispose?.();
          const mat = o.material;
          if (!mat) return;
          for (const one of Array.isArray(mat) ? mat : [mat]) {
            if (one && !one.userData?.pooled) one.dispose?.();
          }
        });
      }
      fxPool.length = 0;
      fps.min = 0;
      // Snap rather than ease onto the first frame: easing in from the previous
      // match's framing means the opening seconds — the approach, which is the
      // only part of the fight with the whole arena in it — are shot from
      // wherever the last one ended.
      camState.snap = true;
      $('#banner').classList.remove('on');
      feed.innerHTML = '';
      for (const id of ['blue', 'orange']) {
        const meta = m.meta[id];
        /* Под именем — автор мозга, и всё. Теги, effort и длина исходника —
           дев-телеметрия; на продуктовой плите они занимают место, где должно
           стоять единственное, что игроку важно: кто это написал. */
        bars[id].meta.textContent = meta?.model || '';
        anim[id].lastHp = null; anim[id].lastX = null;
        /*
         * The plate carries the CREATURE's name when the server sends one.
         * `blue` and `orange` are the names of the two SIDES, and they are
         * exactly what they say — cyan and orange, nothing else. They are not
         * names of the things fighting; once creatures belong to players,
         * printing the side on the plate is printing the wrong word in the
         * most visible place on the screen.
         */
        if (m.names && m.names[id]) {
          const el = $(id === 'blue' ? '#bar-oct .name' : '#bar-gor .name');
          if (el) el.textContent = m.names[id];
          sideName[id] = m.names[id];
        }
        /*
         * Чипы кулдаунов перестраиваются под НАБОР ЭТОГО БОЙЦА.
         *
         * Они строились один раз при загрузке, из `cfg.fighters[id].skills` —
         * то есть из четырёх захардкоженных умений. Существу с набором из
         * грамматики HUD показывал «ЛУЧ · РЫВОК · ПРЫЖОК», которых у него
         * нет ни одного, и подписывал их чужими кулдаунами. Хуже, чем
         * ничего: игрок видел уверенное враньё.
         */
        kitLabels[id] = (m.kits && m.kits[id]) || null;
        rebuildCds(id, kitLabels[id]);
        /* Тело этого бойца. Приезжает вместе с именем и набором, потому что
           это третья часть одного и того же ответа на вопрос «кто дерётся».
           Своего тела может не быть — тогда сторона встаёт на свою запаску, и
           её имя на диске даёт `STOCK_BODY`, а не сама сторона. */
        swapBody(id, (m.bodies && m.bodies[id]) || STOCK_BODY[id], m.sizes?.[id] ?? 1);
      }
      /*
       * ПОДПИСЬ ПОД БОЕМ ГОВОРИТ ПРО ЭТОТ БОЙ.
       *
       * В разметке она статична: «Оба мозга написаны нейросетью. Мы в них не
       * вмешивались.» Это центральное утверждение продукта, и оно стояло в
       * двух дюймах от боя, который ему противоречил: показательные бои идут
       * между библиотечными существами, а у четырёх из них мозг рукописный —
       * наш эталон грамматики. Утверждение либо верно, либо его нет; третьего
       * («верно почти всегда») для главной страницы не бывает.
       */
      const byline = $('#clock .byline');
      if (byline) {
        const models = ['blue', 'orange'].map((id) => m.meta?.[id]?.model || '');
        const handmade = models.filter((x) => /рукописн|reference|stub/i.test(x)).length;
        byline.textContent = handmade === 2
          ? 'Both minds here are ours: reference sparring partners.'
          : (handmade === 1
            ? 'One mind here was written by an AI; the other is our reference sparring partner.'
            : 'Both minds here were written by an AI. We did not touch them.');
      }
      /*
       * THE FIGHT'S NUMBER IS PRINTED ONCE.
       *
       * It used to be written here as well as into the phase subline the shell
       * draws above the arena, so one frame carried `ARENA · FIGHT #232998750`
       * at the top and `FIGHT #232998750` at the bottom — one object, named
       * twice, in two places a player reads at the same time (§9.1). The
       * subline keeps it; this line is the arena's status line, and its job is
       * to say what the arena is doing.
       */
      $('#clock .s').textContent = '';
      const box = $('#seed');
      if (box && box.value.trim() === '') box.placeholder = String(m.seed);
      return;
    }
    if (m.type === 'frame') {
      /*
       * Один и тот же кадр может прийти дважды — при догоне после разрыва
       * связи (D14) сервер отдаёт трансляцию с текущей секунды, и стык
       * перекрывается. Эффекты кадра при этом проигрывались ВТОРОЙ раз:
       * двойная вспышка на один удар, двойная стена на одну стену. Кадр
       * узнаётся по своему времени — оно и есть его имя.
       */
      const last = frames.length ? frames[frames.length - 1] : null;
      if (last && m.frame.t <= last.t) return;
      frames.push(m.frame);
      if (frames.length === 1) renderClock = m.frame.t - DELAY;
      if (frames.length > 240) frames.splice(0, frames.length - 240);
      if (m.frame.fx.length) pendingFx.push({ t: m.frame.t, fx: m.frame.fx });
      return;
    }
    if (m.type === 'over') {
      // The last frame's effects have no successor to walk the render clock
      // past them — the clock is held one tick behind the newest snapshot — so
      // without this the killing blow is the one hit that never flashes.
      playFxUpTo(Infinity);
      over = m;
      const b = $('#banner');
      b.querySelector('.who').textContent = m.winner ? `${sideName[m.winner]} · VICTORY` : 'DRAW';
      b.querySelector('.who').style.color = m.winner ? `#${COLOR[m.winner].toString(16)}` : '#fff';
      b.querySelector('.why').textContent = REASON[m.reason] || m.reason;
      b.classList.add('on');
      if ($('#chk-loop').checked) setTimeout(startMatch, 2600);
      /*
       * `faults 0/716 · uses {...}` больше не печатается в ленту.
       *
       * Это телеметрия, и стояла она ровно в том слоте, который §10.3 отводит
       * под свидетельство: последнее, что видит зритель после боя. Ревьюеру
       * она по-прежнему доступна — в дев-режиме, в консоли.
       */
      if (new URLSearchParams(location.search).get('dev')) {
        for (const id of ['blue', 'orange']) {
          const s = m.stats[id];
          console.log(`${id}: faults ${s.faults}/${s.thinks} · uses`, s.uses);
        }
      }
    }
  };
  /*
   * РАЗРЫВ СВЯЗИ ВИДЕН.
   *
   * Переподключение молча стояло здесь с самого начала и работает: через
   * секунду сокет открывается снова, и бой продолжается с текущего места
   * (D14). Чего не было — сообщения. Кадры переставали приходить, HUD
   * замирал на последнем и продолжал показывать здоровье, время и
   * кулдауны, как будто бой идёт. Зритель видел не «связь пропала», а
   * «игра сломалась»: единственная разница между этими двумя вещами —
   * сказали ему или нет.
   *
   * Сообщение появляется не сразу: обрыв на четверть секунды между двумя
   * кадрами — обычное дело, и мигать плашкой на каждый такой значит
   * научить не обращать на неё внимания.
   */
  ws.onclose = () => {
    downSince = downSince || Date.now();
    const el = $('#clock .byline');
    const late = Date.now() - downSince > 1500;
    if (el && late) el.textContent = 'connection lost — the fight goes on at the server, catching up';
    dispatchEvent(new CustomEvent('airena:offline', { detail: { since: downSince } }));
    setTimeout(connect, 900);
  };
  ws.onopen = () => {
    if (!downSince) return;
    downSince = 0;
    dispatchEvent(new CustomEvent('airena:online', {}));
  };
}
/*
 * Сокет открывается В КОНЦЕ файла, а не здесь.
 *
 * Модуль приостанавливается на двух верхнеуровневых await (`/api/config` и
 * `/api/recommended`), и всё, что объявлено ниже через `let`, во время этой
 * паузы ещё не инициализировано. Дев-вьювер этого не замечал: там матч
 * начинается по пробелу, то есть заведомо после конца evaluation. Продуктовый
 * сервер шлёт `match` сразу на подключение — и `onmessage` падал на
 * `framingLost` с «Cannot access before initialization», а вместе с ним
 * умирал весь рендер.
 */

/**
 * A specific fight, again.
 *
 * There is no replay FILE because there does not need to be one: a match is a
 * pure function of (seed, brainA, brainB), so naming the seed replays it
 * exactly. `?seed=123456&oct=g1&gor=g2` reproduces any fight in the report, and
 * the seed of whatever you are watching is printed under the clock.
 */
let forcedSeed = null;

function startMatch() {
  if (!ws || ws.readyState !== 1) {
    // Silent no-ops are how a viewer ends up looking broken for a reason nobody
    // can see. Say what happened and try again when the socket comes back.
    fail(`not connected (socket state ${ws ? ws.readyState : 'none'}) — retrying`);
    setTimeout(startMatch, 700);
    return;
  }
  errBox.style.display = 'none';
  errBox.textContent = '';
  const seedBox = $('#seed');
  const typed = seedBox && seedBox.value.trim() !== '' ? Number(seedBox.value) : NaN;
  const seed = Number.isFinite(typed) ? typed : (forcedSeed !== null ? forcedSeed : undefined);
  forcedSeed = null;
  /* Ключи — СТОРОНЫ, значения — теги эталонных мозгов: «этот мозг дерётся за
     синюю». Дев-сервер сам переводит сторону в имя файла фикстуры
     (`brains/<тег>/<слот>.js`) — там, где он этот файл и открывает. Такой же
     перевод, как `STOCK_BODY` для тел, и по той же причине: имя стороны и имя
     файла на диске больше не совпадают. */
  ws.send(JSON.stringify({
    cmd: 'start',
    blue: $('#sel-oct').value,
    orange: $('#sel-gor').value,
    speed: Number($('#sel-speed').value),
    ...(seed === undefined ? {} : { seed }),
  }));
}
$('#btn-run').onclick = startMatch;
addEventListener('keydown', (e) => {
  const t = e.target;
  /* TEXTAREA joined this list the moment the product grew a prompt field:
     Space is "fight" here and a space character there, and preventDefault on
     the wrong one silently eats every second word the player types. */
  if (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
      || t.isContentEditable || document.body.dataset.typing === '1') return;
  if (e.code === 'Space') { e.preventDefault(); startMatch(); }
  /* Кнопки камеры есть только в дев-вьювере: в продукте её нет, и вызов
     `.click()` у null ронял обработчик на каждое нажатие «c» — то есть на
     каждое слово, которое игрок набирал бы вне поля ввода. */
  if (e.key === 'c' || e.key === 'C') $('#btn-cam')?.click();
  if (e.key === 'Escape') $('#code').classList.remove('on');
});

/**
 * The brain, on screen — MOVED OUT.
 *
 * The panel that fetches `/api/source/<tag>/<id>` now lives in
 * `src/viewer/devpanel.js`, which only the dev viewer loads. It stayed here
 * for a while behind "the handler never binds in the product, there is no
 * data-fighter attribute" — and that is exactly the reasoning F11 exists to
 * refuse. The string `/api/source/` shipping in the player's bundle is a
 * path, and a path that only a missing attribute closes is not closed.
 *
 * Worse than the leak is the shape of it: a visitor reads a brain's source on
 * the landing page, makes their own four minutes later, and cannot read that
 * one. Bait and switch, at the exact moment we ask for an account.
 *
 * `tools/checkscope.mjs` fails the build if it comes back.
 */

/**
 * Three kinds of thing in one list, said out loud.
 *
 * `j3`, `probe-corner` and `stub` are not entries in the same competition and
 * the difference is the whole claim this project makes: one was written by a
 * model, one is a hand-written degeneracy probe that exists to be beaten, and
 * one is the reference floor everything is measured against. A flat list of
 * tags invites a reader to compare a generated brain's showing against a
 * probe's as though both were candidates. The sidecar meta is the
 * discriminator rather than the tag spelling — a generated brain has a JSON
 * naming the model that wrote it, a hand-written one has none.
 */
/* Список тегов — дев-удобство, а не часть боя. На продуктовом сервере
   этого маршрута нет вовсе (F11: исходники и теги чужих мозгов наружу не
   ходят), и падать из-за отсутствующего выпадающего списка — значит терять
   картинку ради инструмента ревьюера. */
const tagList = await fetch(`${API()}/api/brains`)
  .then((r) => (r.ok ? r.json() : []))
  .then((v) => (Array.isArray(v) ? v : []))
  .catch(() => []);
const BRAIN_GROUPS = [
  ['written by an AI', (t, id) => !!t[id]],
  ['hand-written probes', (t, id) => !t[id] && t.tag !== 'stub'],
  ['reference stub', (t) => t.tag === 'stub'],
];
/**
 * Сторона -> слот ЭТАЛОННОГО МОЗГА в `brains/<тег>/<слот>.js`.
 *
 * Это второй и последний перевод в файле, и он ровно того же рода, что
 * `STOCK_BODY`: сторона зовётся цветом, а фикстура замера §1 лежит на диске
 * под старыми именами и переименованию не подлежит — на этих шести мозгах
 * измерены §1 и §16, и сдвинуть их имена значит сдвинуть замер.
 *
 * Нужен он ровно в ОДНОМ месте ниже, и это стоит сказать явно, иначе легко
 * перевести не то. `/api/brains` уже отвечает ПО СТОРОНАМ: файлы фикстуры под
 * ними читает сам сервер. А `/api/recommended` — это кусок
 * `reports/tournament.json`, отданный как есть; его пишет
 * `tools/tournament.mjs` и ключует ИМЕНАМИ ФАЙЛОВ, потому что отчёт о турнире
 * — это отчёт о том, что лежит в `brains/`, а не о том, кто какого цвета.
 * Вот там перевод и стоит.
 *
 * Дев-инструмент: в продукте ни этих селекторов, ни этих ручек нет.
 */
const REF_BRAIN_SLOT = { blue: 'octopus', orange: 'gorilla' };

for (const [sel, id] of [[$('#sel-oct'), 'blue'], [$('#sel-gor'), 'orange']]) {
  for (const [label, belongs] of BRAIN_GROUPS) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const t of tagList) {
      if (!t.has[id] || !belongs(t, id)) continue;
      const o = document.createElement('option');
      o.value = t.tag; o.textContent = t.tag;
      group.appendChild(o);
    }
    if (group.children.length) sel.appendChild(group);
  }
  const preferred = [...sel.options].find((o) => o.value !== 'stub');
  if (preferred) sel.value = preferred.value;
}
/**
 * Capture mode: `?shots=1&oct=f1&gor=f1&n=20&every=1.1`
 *
 * A reviewer with a clean context needs to be able to LOOK at this, and the
 * cheapest way to make that survive being handed to someone else is a set of
 * PNGs on disk that anyone can regenerate with a URL. It also sidesteps the
 * fact that a devtools console runs in an isolated world and cannot see this
 * module's own scope at all.
 */
const params = new URLSearchParams(location.search);
if (params.get('seed')) {
  forcedSeed = Number(params.get('seed'));
  const box = $('#seed');
  if (box) box.value = params.get('seed');
}

/*
 * Открыться на самом близком бою, который нашёл турнир, — если он был.
 *
 * Это дев-удобство, и ручка живёт только в дев-вьювере (`src/server/index.js`).
 * Продуктовый сервер её не знает, и запрос давал 404 в консоли КАЖДОМУ игроку.
 * Ошибка была безвредной и оттого хуже безвредной: она приучает не смотреть в
 * консоль, а следующая ошибка там будет настоящей.
 *
 * Спрашиваем только там, где есть кому отвечать. Условие «есть селекторы
 * мозгов» для этого не годилось: продуктовая страница держит те же
 * `#sel-oct`/`#sel-gor` скрытыми в `#controls`, и 404 получал каждый игрок —
 * ровно то, чего этот комментарий обещал не делать. Метка `data-dev` стоит
 * только на дев-странице вьювера и проверяема.
 */
try {
  const rec = document.body.dataset.dev && $('#sel-oct') && $('#sel-gor')
    ? await (await fetch(`${API()}/api/recommended`)).json()
    : null;
  if (rec) {
    /* `reports/tournament.json` пишет `tools/tournament.mjs` и ключует его
       СЛОТАМИ ФИКСТУРЫ, а не сторонами: это отчёт о файлах в `brains/`. */
    const o = rec[REF_BRAIN_SLOT.blue], g = rec[REF_BRAIN_SLOT.orange];
    if ([...$('#sel-oct').options].some((x) => x.value === o)) $('#sel-oct').value = o;
    if ([...$('#sel-gor').options].some((x) => x.value === g)) $('#sel-gor').value = g;
  }
} catch { /* no tournament has been run; the first tag is fine */ }

/**
 * Post the current canvas to the server, which writes it to reports/screens.
 *
 * The read has to happen inside the frame, immediately after the draw: once the
 * canvas has been presented the drawing buffer is gone and `toDataURL` returns
 * a blank image on both backends. So this queues, and the loop serves it.
 */
let pendingShot = null;
function shoot(name) {
  return new Promise((resolve) => { pendingShot = { name, resolve }; });
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

const camModes = ['auto', 'wide', 'top'];
let camMode = 0;
/*
 * When the last cut was, because a cut is not a framing failure.
 *
 * Switching modes carries `camState.look` across and plants the eye somewhere
 * new in the same frame, so for a few frames the old aim point is being shot
 * from the new position and a body can genuinely leave the picture. That is
 * what pressing the button asks for. `checkFraming` judges the framing RULE,
 * so it stands down until the ease has caught up — otherwise the one assertion
 * in this file cries wolf every time someone tries the other two cameras.
 */
let camCutAt = -1;
$('#btn-cam').onclick = () => {
  camMode = (camMode + 1) % camModes.length;
  camCutAt = performance.now() / 1000;
  $('#btn-cam').textContent = camModes[camMode];
};

const camState = { az: Math.PI * 0.25, look: new THREE.Vector3(), dist: 30, height: 16, shake: 0, cover: 0, orbit: 0, establishing: 0, blend: 0, aimY: 1.6, bandNeed: 0 };
/** The side melee is shot from once the pair is close enough to anchor to. */
const CAM_ANCHOR = Math.PI * 0.25;
const ARENA_CENTRE = new THREE.Vector3(0, 1.2, 0);
/** A stand-in for `camera`, so a framing can be tried before it is committed. */
const trialCam = new THREE.PerspectiveCamera(46, 1, 0.3, 400);
/** The orbit's field of view; the establishing shot narrows it and the return widens it back. */
const ORBIT_FOV = 46;

/**
 * Is this fighter inside the HUD's band from this eye? FEET AND HEAD, not the
 * centre: `holds` used to project the body's half-height point against a
 * symmetric box, so a 5 m generated body "held" with its head off the top
 * edge and its feet through the name row (the golem in every fighting
 * capture). Both ends must sit inside `hudBand` with a margin, and the x test
 * keeps the old edge. The margin is 0.04 ndc at FRAME_TARGET (what the solve
 * asks for) and 0 at FRAME_EDGE (what the assertion grades) — the same slack
 * the two constants always kept between the servo and the alarm, for the
 * eases and the hit shake. A corpse counts half its standing height: it lies
 * down, and demanding room for a head that is not there would push the
 * result's push-in out again.
 */
function bodyInBand(cam, id, f, edge) {
  const m = 0.04 - (edge - FRAME_TARGET);
  /*
   * `top` is the vertical extent of the pose that was actually struck this
   * frame (`spanY`, written by the body loop), and `height` is the rest
   * measurement. A mech in mid-air with its arms up overshoots the cached cap
   * by a metre and more — which is how `ARENA · FIGHT #915843606` came to be
   * drawn straight through a head this test had just called framed. Node has
   * no pose, so the gate keeps grading the cached height.
   */
  const h = bodies[id]?.top ?? bodies[id]?.height ?? 2;
  for (const hy of [0, f.alive ? h : h * 0.5]) {
    _p.set(f.x, f.y + hy, f.z).project(cam);
    if (Math.abs(_p.x) > edge) return false;
    if (_p.y > hudBand.yTop - m || _p.y < hudBand.yBot + m) return false;
  }
  return true;
}

/**
 * WHERE A SUBJECT MAY BE PUT WHEN A CARD IS UP.
 *
 * The band (`hudBand.yTop/yBot`) is what the shell docks at the TOP and the
 * BOTTOM; a card is neither — it is a hole in the middle of the frame. The VS
 * card is 877 × 235 px at 1440×900 and the result card 420 × 484, and the
 * establishing shot aimed at the pair's midpoint, i.e. the frame's centre,
 * i.e. under the card: the result capture came back an empty plaza with a
 * VICTORY card on it, and the VS capture put both fighters in the left bezel.
 *
 * So the card's rectangle cuts the band into four candidate regions — left of
 * it, right of it, above it, below it — and the widest-by-area wins, with a
 * nudge to the right on a tie because the shell's nav rail owns the left
 * gutter. The answer is an ndc point to aim the subject at; `aimAt` below is
 * what actually points the eye there. With no card up the answer is the band's
 * own centre, which is what the shot did before.
 */
const _clear = { x: 0, y: 0, w: 1.76, h: 0.95 };
function clearAim() {
  const yT = hudBand.yTop, yB = hudBand.yBot;
  const c = hudBand.cardRect;
  _clear.x = 0; _clear.y = (yT + yB) / 2; _clear.w = 1.76; _clear.h = Math.max(0.05, yT - yB);
  if (!c) return _clear;
  const cand = [
    [-0.88, Math.min(0.88, c.x0), yB, yT, -0.02],           // left of the card
    [Math.max(-0.88, c.x1), 0.88, yB, yT, 0.02],            // right of it
    [-0.88, 0.88, Math.max(yB, c.y0), yT, 0],               // above it
    [-0.88, 0.88, yB, Math.min(yT, c.y1), 0],               // below it
  ];
  let best = -1;
  for (const [x0, x1, y0, y1, bias] of cand) {
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0.24 || h <= 0.16) continue;
    const score = w * h + bias;
    if (score <= best) continue;
    best = score;
    _clear.x = (x0 + x1) / 2; _clear.y = (y0 + y1) / 2; _clear.w = w; _clear.h = h;
  }
  /* Nothing clear enough to stand a body in: the caller falls through to the
     stand shot, which makes the ARENA the subject instead of the pair. */
  if (best < 0) { _clear.w = 0; _clear.h = 0; }
  return _clear;
}

/**
 * Point an eye at (lx, ly, lz) so that the point lands at ndc (tx, ty).
 *
 * Looking AT a point puts it at the centre of the frame. To put it somewhere
 * else the eye is aimed past it, by the offset that centre-to-target is worth
 * at this distance and field of view: `slant · tan(halfFov)` per unit of ndc,
 * along the eye's own right and up axes. Rotating the eye rather than moving
 * it keeps the composition — the arena stays where it is behind the subject.
 */
const _rightAx = new THREE.Vector3();
const _upAx = new THREE.Vector3();
const _aimAt = new THREE.Vector3();
function aimAt(cam, lx, ly, lz, tx, ty) {
  cam.lookAt(lx, ly, lz);
  if (!tx && !ty) return;
  cam.updateMatrixWorld();
  _rightAx.setFromMatrixColumn(cam.matrixWorld, 0);
  _upAx.setFromMatrixColumn(cam.matrixWorld, 1);
  const slant = Math.hypot(cam.position.x - lx, cam.position.y - ly, cam.position.z - lz);
  const tanV = Math.tan((cam.fov * Math.PI) / 360);
  _aimAt.set(lx, ly, lz)
    .addScaledVector(_rightAx, -tx * slant * tanV * cam.aspect)
    .addScaledVector(_upAx, -ty * slant * tanV);
  cam.lookAt(_aimAt);
}

/**
 * Are both bodies clear of the card, and big enough to be worth looking at?
 *
 * The band test says "inside the picture"; this says "inside the part of the
 * picture the reader can see". A body whose screen box touches the card rect
 * is behind it, and a winner 120 px tall at the bottom of a 900 px frame is
 * not a winner anybody can see — the result beat's whole job. `TALL_WANT` is
 * 0.34 ndc, ~150 px at 900 and ~285 px on a phone.
 */
const TALL_WANT = 0.34;
/**
 * HOW BIG THE SUBJECT OF A CARD BEAT HAS TO BE, AND THE UNIT IS PIXELS.
 *
 * `TALL_WANT` is 0.34 ndc, which is 153 px at 900 and 143 px on the phone's
 * 844 — and the bar for the one frame the whole loop pays off in is 200 px.
 * ndc is the wrong unit for that question: a reader's eye counts pixels, not
 * fractions of a viewport, and the shorter the window the smaller a fixed ndc
 * makes the winner. So the card beat asks for `HERO_PX` of whatever the frame
 * is, with `TALL_WANT` as its floor and 0.62 as its ceiling (past that the
 * arena the winner is standing in stops being in the picture at all).
 */
const HERO_PX = 210;
const heroTall = () => THREE.MathUtils.clamp((2 * HERO_PX) / Math.max(1, innerHeight), TALL_WANT, 0.62);
/** How close a card beat may come. The pair beat's floor is 13; a winner
    over a corpse is a portrait and is allowed the extra three metres. */
const HERO_NEAR = 10;
const _pA = new THREE.Vector3();
const _pB = new THREE.Vector3();
/**
 * The same two questions asked of ONE body: clear of the card, big enough.
 *
 * `pairReadable` demands them of BOTH, and when it refuses the beat is handed
 * to the arena portrait — which is the right answer for a VS card announcing a
 * fight that has not started, and the wrong one for a result. Measured: at
 * 1440×900 `live-result-loss.png` and `live-fighting.png` (both in phase
 * `result`) carried ZERO pixels under L 58 anywhere outside the chrome and the
 * card — the beat the whole loop pays off in arrived as an empty plaza with a
 * DEFEAT card on it — while `clearAim` had a perfectly good half-frame beside
 * the card the whole time (0.588 × 0.95 ndc). The fallen is read from the ring
 * under the winner, which is what the 3846-3852 comment already argues for.
 */
/*
 * WHY THE BEAT TOOK THE SHOT IT DID — recorded, not guessed.
 *
 * The result beat has been wrong for four review rounds and every round's
 * evidence was one number off a picture: "39 px of the winner survive", "no
 * pixel under L 70 beside the card". Which of the two tests refused — the
 * SIZE or the CARD — is the whole question, and neither a capture nor a
 * console could answer it: the verdict lived and died inside one frame. So
 * `soloReadable` writes what it measured onto `standShot.beat`, `drawFrame`
 * hangs it on `window.__airenaDrawn`, and every sidecar from here on carries
 * the reason beside the picture.
 */
function soloReadable(cam, id, f) {
  if (!f) return false;
  const c = hudBand.cardRect;
  const h = (bodies[id]?.top ?? bodies[id]?.height ?? 2) * (f.alive ? 1 : 0.5);
  const r = cfg.fighters[id].radius;
  _pA.set(f.x, f.y, f.z).project(cam);
  _pB.set(f.x, f.y + h, f.z).project(cam);
  /* The card beat's own bar (`heroTall`), not the general one: this test is
     the verdict that decides whether the beat KEEPS its subject or hands the
     frame to the arena portrait, and it was accepting a 150 px winner. */
  const want = c ? heroTall() : TALL_WANT;
  const tall = Math.abs(_pB.y - _pA.y);
  standShot.beat = { sid: id, tall: +tall.toFixed(3), want: +want.toFixed(3), lapped: false, dist: Math.round(camState.dist) };
  if (tall < want) return false;
  if (!c) return true;
  const wide = (r / Math.max(1, Math.hypot(cam.position.x - f.x, cam.position.y - f.y, cam.position.z - f.z)))
    / Math.tan((cam.fov * Math.PI) / 360) / Math.max(0.2, cam.aspect);
  const x0 = Math.min(_pA.x, _pB.x) - wide, x1 = Math.max(_pA.x, _pB.x) + wide;
  const y0 = Math.min(_pA.y, _pB.y), y1 = Math.max(_pA.y, _pB.y);
  standShot.beat.lapped = x1 > c.x0 && x0 < c.x1 && y1 > c.y1 && y0 < c.y0;
  standShot.beat.box = [+x0.toFixed(2), +x1.toFixed(2), +y0.toFixed(2), +y1.toFixed(2)];
  standShot.beat.card = [+c.x0.toFixed(2), +c.x1.toFixed(2), +c.y0.toFixed(2), +c.y1.toFixed(2)];
  return !standShot.beat.lapped;
}
/**
 * WHOSE BEAT IS THIS — IN ORDER, because the first answer can be unusable.
 *
 * The winner when there is one, then whoever is still standing, then the
 * taller of the two; never nobody, because a result card over an empty arena
 * is the failure this answers. It used to return ONE subject and the caller
 * took it or fell through to the arena portrait. On a LOSS the winner is the
 * opponent, and the opponent is wherever the kill happened — which on
 * `live-result-loss.png` was outside the strip the card leaves clear: masking
 * the card and the chrome, that capture carried NO pixel under L 70 anywhere
 * beside the card, while `live-result-win.png` carried its winner. The solver
 * kept the subject on a win and lost it on a loss, and the screen a player
 * reads after a defeat was a card on empty plaster.
 *
 * So the beat has an order and the caller tries them in turn, keeping the
 * first that lands inside the clear region: a fallen creature the reader can
 * see is a better result screen than an empty plaza.
 */
function beatOrder(a, b) {
  const cand = [['blue', a], ['orange', b]].filter(([, f]) => !!f);
  if (cand.length < 2) return cand;
  const win = over && over.winner;
  const rank = ([id, f]) => (id === win ? 0 : (f.alive ? 1 : 2));
  return cand.slice().sort((x, y) => {
    const d = rank(x) - rank(y);
    if (d) return d;
    return (bodies[y[0]]?.height ?? 2) - (bodies[x[0]]?.height ?? 2);
  });
}
function pairReadable(cam, a, b) {
  const c = hudBand.cardRect;
  /* BOTH clear of the card, and at least ONE big enough. Demanding the size
     of both was demanding it of a CORPSE — a body lying on its side is a
     third of its standing height, so the result beat could never satisfy it
     and always fell through to the arena, leaving the winner behind the card
     with only its ring showing. What the beat has to deliver is a winner the
     reader can see; the fallen is read from the winner standing over it. */
  let tall = false;
  for (const [id, f] of [['blue', a], ['orange', b]]) {
    if (!f) return false;
    const h = (bodies[id]?.top ?? bodies[id]?.height ?? 2) * (f.alive ? 1 : 0.5);
    const r = cfg.fighters[id].radius;
    _pA.set(f.x, f.y, f.z).project(cam);
    _pB.set(f.x, f.y + h, f.z).project(cam);
    if (Math.abs(_pB.y - _pA.y) >= TALL_WANT) tall = true;
    if (!c) continue;
    /* the body's screen box, widened by its own collision radius at the
       feet's depth — a shoulder that clips the card's rail still reads as
       behind it */
    const wide = (r / Math.max(1, Math.hypot(cam.position.x - f.x, cam.position.y - f.y, cam.position.z - f.z)))
      / Math.tan((cam.fov * Math.PI) / 360) / Math.max(0.2, cam.aspect);
    const x0 = Math.min(_pA.x, _pB.x) - wide, x1 = Math.max(_pA.x, _pB.x) + wide;
    const y0 = Math.min(_pA.y, _pB.y), y1 = Math.max(_pA.y, _pB.y);
    if (x1 > c.x0 && x0 < c.x1 && y1 > c.y1 && y0 < c.y0) return false;
  }
  return tall;
}

/**
 * THE ESTABLISHING CAMERA — the VS beat and the result.
 *
 * The brief (§2) asks for "a low establishing framing for VS/intro/result";
 * the stand's `vs` preset is the eye at (−12, 5, 16) from the pair's
 * midpoint, aimed 2 m up, fov 42 — the planet whole upper-left, both bodies
 * whole in the lower two thirds, the tiers pale in the fog. The orbit is the
 * wrong picture under a card: the VS card lay over the previous fight's
 * wreck at melee range and the result card over the fallen body's cabin.
 *
 * This eases `camState` — never `camera` directly, so the trail
 * `tools/checkcamera.mjs` grades stays continuous and the orbit resumes from
 * wherever this left it — toward the stand's azimuth, 22 m and 5 m, or
 * further out and a little higher when the pair is wide (up to 44 m, with the
 * same back-off the orbit uses so both bodies are whole), and the fov toward
 * 42. Before the first frame of a match the aim is the previous fight's pair,
 * or the field's centre. The wall rule in `updateOcclusion` fades whichever
 * wall the eye looks over. On the first fighting frame the orbit takes over
 * with `blend` up: its eases and rate caps run ×5 for 0.6 s, so the swing
 * back to the anchor is a move — not a cut, not a crawl — and the framing
 * assertion stands down for that 0.6 s as it does for a cut.
 */
const EST = { az: Math.atan2(-12, 16), fov: 42, dist: 22, height: 5, aimY: 2.0 };
function establishingCamera(a, b, dt) {
  const snap = camState.snap;
  camState.snap = false;
  const ease = (rate) => (snap ? 1 : 1 - Math.exp(-rate * dt));
  const both = !!(a && b);
  const mid = both ? new THREE.Vector3((a.x + b.x) / 2, 0, (a.z + b.z) / 2) : new THREE.Vector3(0, 0, 0);
  const sep = both ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
  camera.fov += (EST.fov - camera.fov) * ease(3);
  camera.updateProjectionMatrix();
  const hFov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
  let want = THREE.MathUtils.clamp((sep / 2 + 5.5) / Math.tan(hFov / 2), EST.dist, 44);
  /*
   * AND UNDER A CARD, CLOSE IN. The 22 m preset frames the pair whole, which
   * on the result beat left the winner ~120 px tall at the bottom of a 900 px
   * picture — the shot this branch was written for ("close in on the kill")
   * never reached the frame. So when a card is up the distance is also solved
   * for SIZE: the eye comes in until the taller body is `TALL_WANT` of the
   * frame, floored at 13 m so the arena does not vanish behind the pair. The
   * fit loop below still backs off if that costs the band or the card.
   */
  if (hudBand.cardRect) {
    /* solved for the TALLER of the two — the winner, at the result — because
       that is the body the beat has to make legible */
    const hMax = Math.max(
      (bodies.blue?.top ?? bodies.blue?.height ?? 2) * (a?.alive ? 1 : 0.5),
      (bodies.orange?.top ?? bodies.orange?.height ?? 2) * (b?.alive ? 1 : 0.5),
    );
    const eye = hMax / Math.max(0.05, heroTall() * Math.tan((camera.fov * Math.PI) / 360));
    const rise = camState.height - EST.aimY;
    const near = Math.sqrt(Math.max(1, eye * eye - rise * rise));
    want = THREE.MathUtils.clamp(Math.min(want, near), HERO_NEAR, 44);
  }
  const heightAt = (d) => EST.height + (d - EST.dist) / 12;
  camState.look.lerp(mid, ease(4));
  const d = ((EST.az - camState.az + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const azStep = d * ease(2.5);
  camState.az += snap ? azStep : THREE.MathUtils.clamp(azStep, -AZ_RATE * dt, AZ_RATE * dt);
  const stepDist = (want - camState.dist) * ease(want > camState.dist ? 9 : 2.6);
  const capDist = snap ? Infinity : 26 * dt;
  camState.dist += THREE.MathUtils.clamp(stepDist, -capDist, capDist);
  camState.height += (heightAt(camState.dist) - camState.height) * ease(2.5);
  camState.aimY += (EST.aimY - camState.aimY) * ease(3);
  camState.cover = 0; camState.orbit = 0; camState.rescueTo = 0;
  /* The entry is a move, as the return is: the eye leaves the kill push-in
     (9.5 m, 7 m up) for 22 m and 5 m over about half a second, and the
     framing assertion stands down for the first 0.6 s of it as it does for
     a cut. The back-off below still keeps both bodies inside the band
     through the move, at the orbit's rescue rate. */
  if (!camState.establishing) camCutAt = performance.now() / 1000;
  camState.establishing = 1;
  /* Where the pair goes on the screen: the band's centre with no card up, the
     widest clear region beside or below one when there is (`clearAim`). */
  const aim = clearAim();
  /*
   * WHAT THE EYE POINTS AT, WHICH ON A SOLO BEAT IS NOT WHAT IT ORBITS.
   *
   * `place` aimed the pair's MIDPOINT into the clear region, and the solo
   * branch below inherited that: the winner was solved for, tested for, and
   * then framed by the midpoint of a pair one of whose members is a corpse
   * three metres away. On `live-result-win.png` it put the winner ASTRIDE the
   * card's edge — the card's body ran to x=927 and the winner's mass to
   * x=930–968, so 41 px of a body survived beside a 420 px card and the rest
   * was behind it. The eye still stands where the pair solve put it (the
   * composition, the arena behind the subject, the azimuth are all that
   * orbit's); only what it looks AT moves.
   */
  const focus = { x: camState.look.x, z: camState.look.z, tx: aim.x, ty: aim.y };
  const place = (cam) => {
    cam.position.set(
      camState.look.x + Math.sin(camState.az) * camState.dist,
      camState.height,
      camState.look.z + Math.cos(camState.az) * camState.dist,
    );
    aimAt(cam, focus.x, camState.aimY, focus.z, focus.tx, focus.ty);
  };
  /*
   * …AND THE SILHOUETTE CLEARS THE CARD, NOT THE POINT AT THE MIDDLE OF IT.
   *
   * Aiming a body's centre into the clear region says nothing about its
   * WIDTH, and a card edge cuts silhouettes, not centres. So after the
   * distance is solved the subject's projected box is measured against
   * `hudBand.cardRect` and, if it laps it, the aim is pushed the shortfall
   * plus a pad further out along whichever axis the clear region actually
   * lies on — right of the card, left of it, above it (which is the phone's
   * answer: the card stacks over the fighters) or below. Two passes: the push
   * changes the projection, and the second reading is against the frame the
   * first one made. Bounded by the frame's own edge, so the cure can never be
   * a body half outside the picture.
   */
  const CLEAR_PAD = 0.05;
  const clearOfCard = (cam, id, f) => {
    const c = hudBand.cardRect;
    if (!c || !f) return false;
    const h = (bodies[id]?.top ?? bodies[id]?.height ?? 2) * (f.alive ? 1 : 0.5);
    const r = cfg.fighters[id].radius;
    _pA.set(f.x, f.y, f.z).project(cam);
    _pB.set(f.x, f.y + h, f.z).project(cam);
    const wide = (r / Math.max(1, Math.hypot(cam.position.x - f.x, cam.position.y - f.y, cam.position.z - f.z)))
      / Math.tan((cam.fov * Math.PI) / 360) / Math.max(0.2, cam.aspect);
    const x0 = Math.min(_pA.x, _pB.x) - wide, x1 = Math.max(_pA.x, _pB.x) + wide;
    const y0 = Math.min(_pA.y, _pB.y), y1 = Math.max(_pA.y, _pB.y);
    if (!(x1 > c.x0 && x0 < c.x1 && y1 > c.y1 && y0 < c.y0)) return false;
    const rx0 = aim.x - aim.w / 2, rx1 = aim.x + aim.w / 2, ry0 = aim.y - aim.h / 2;
    let dx = 0, dy = 0;
    if (rx0 >= c.x1 - 1e-3) dx = c.x1 + CLEAR_PAD - x0;
    else if (rx1 <= c.x0 + 1e-3) dx = c.x0 - CLEAR_PAD - x1;
    else if (ry0 >= c.y0 - 1e-3) dy = c.y0 + CLEAR_PAD - y0;
    else dy = c.y1 - CLEAR_PAD - y1;
    if (!dx && !dy) return false;
    focus.tx = THREE.MathUtils.clamp(focus.tx + dx, -FRAME_TARGET, FRAME_TARGET);
    focus.ty = THREE.MathUtils.clamp(focus.ty + dy, hudBand.yBot, hudBand.yTop);
    return true;
  };
  if (both) {
    const fits = (edge) => {
      trialCam.fov = camera.fov; trialCam.aspect = camera.aspect; trialCam.updateProjectionMatrix();
      place(trialCam);
      trialCam.updateMatrixWorld();
      return bodyInBand(trialCam, 'blue', a, edge) && bodyInBand(trialCam, 'orange', b, edge);
    };
    /* the orbit's rescue, verbatim in spirit: steps of 8 % until the band
       holds, rate-limited unless the frame is already lost; the height is
       left to its own ease — writing it onto the curve here was a 2.6 m
       step in one frame */
    const before = camState.dist;
    const lost = snap || !fits(FRAME_EDGE);
    for (let i = 0; i < 16 && camState.dist < 44 && !fits(FRAME_TARGET); i++) camState.dist = Math.min(44, camState.dist * 1.08);
    if (camState.dist > before && !lost) camState.dist = Math.min(camState.dist, before + RESCUE_RATE * dt);
  }
  place(camera);
  /*
   * AND THE VERDICT ON THIS SHOT, for the loop's own choice next frame
   * (`standShot.auto`). A pair shot only earns the beat when both bodies are
   * actually visible: inside the band, clear of the card, and big enough to
   * be looked at. The VS card is 877 px wide and leaves 0.32 ndc of clear
   * frame above it — no pair fits there, so the VS beat falls through to the
   * ARENA (the stand shot, with the banner in it), which is what that beat is
   * for. The result card is narrow and leaves a clear half beside it, so the
   * winner-over-the-fallen framing survives where it is worth having.
   */
  camera.updateMatrixWorld();
  standShot.pair = both && aim.w > 0 && pairReadable(camera, a, b);
  /*
   * AND WHEN THE PAIR WILL NOT FIT, THE BEAT KEEPS ITS SUBJECT.
   *
   * The stand-shot fallback is for "there is nothing to frame" — a VS card
   * that rises before the first snapshot — not for "the two of them do not
   * both fit beside the card". Handing the result to the arena portrait cost
   * the beat its winner: no fighter at all in the 1440×900 result captures.
   * So the pair test failing is not the end of the question. One body is
   * re-solved for on its own with the SAME back-off loop, and only if that
   * fails too does the arena take the beat.
   */
  /*
   * …AND RETREATING PAST THE POINT WHERE THE SUBJECT IS VISIBLE BUYS NOTHING.
   *
   * The loop below grows the distance by 8 % up to sixteen times — ×3.4 — to
   * satisfy `bodyInBand`, and at 1440×900 the centred 430×484 result card
   * leaves side strips only 0.58 ndc wide, so it ran to the cap almost every
   * time. At that distance the subject is far under `TALL_WANT`, `soloReadable`
   * refuses, and the beat falls through to the arena portrait — which is
   * exactly what the desktop result captures are: `live-result-loss.png` with
   * ZERO connected regions under L 62 outside the card, `live-result-win.png`
   * with one 58 × 23 px blob that is the LOSER's corpse.
   *
   * The two tests were pulling against each other, then: the band asks the eye
   * to retreat and the size test refuses the answer. So the retreat is capped
   * at the distance where the body still subtends `TALL_WANT` — past it there
   * is no answer to find, only a smaller body — and the loop stops there and
   * hands the beat on. Same arithmetic as the push-in above: the eye's SLANT
   * range is what a projected height is worth, so the ground distance is
   * `sqrt(slant² − rise²)`.
   */
  const sizeCap = (id, f) => {
    const h = (bodies[id]?.top ?? bodies[id]?.height ?? 2) * (f && f.alive ? 1 : 0.5);
    /* THE SAME BAR THE VERDICT WILL APPLY. `soloReadable` asks for `heroTall`
       only when there IS a card to stand beside and for `TALL_WANT` otherwise,
       and this cap was asking for the hero bar either way — so with no card
       (the after-over window `checkframing` flies, and any beat before the
       shell has measured one) the cap named a distance a third nearer than
       the verdict needs, and every metre of that is a metre the OTHER fighter
       spends closer to the edge. */
    const want = hudBand.cardRect ? heroTall() : TALL_WANT;
    const slant = h / Math.max(0.05, want * Math.tan((camera.fov * Math.PI) / 360));
    const rise = camState.height - EST.aimY;
    return THREE.MathUtils.clamp(Math.sqrt(Math.max(1, slant * slant - rise * rise)), HERO_NEAR, 44);
  };
  if (!standShot.pair && aim.w > 0) {
    /*
     * AND IT IS TRIED ON BOTH BODIES, WINNER FIRST (see `beatOrder`). On a
     * loss the winner is the opponent and it may be nowhere near the clear
     * half; a fallen creature the reader can see beats an empty plaza, so the
     * second candidate gets the same solve from the same starting eye.
     */
    const before = camState.dist;
    for (const [sid, sf] of beatOrder(a, b)) {
      camState.dist = before;
      /* THE SUBJECT IS WHAT THE EYE POINTS AT (see `focus`). Solving for one
         body and then aiming the pair's midpoint is how the winner came to
         straddle the card's edge. */
      focus.x = sf.x; focus.z = sf.z; focus.tx = aim.x; focus.ty = aim.y;
      const cap = sizeCap(sid, sf);
      /*
       * ── AND THE EYE COMES IN AS WELL AS OUT ───────────────────────────────
       *
       * `sizeCap` is the FARTHEST distance at which the subject still reaches
       * `heroTall`, and the loop under it only ever GROWS the distance. So the
       * beat inherited whatever the fight camera left behind and had no way to
       * shorten it: the card beat opens at the fighting eye's 17–26 m, the cap
       * is nearer than that, `camState.dist < cap` is false on the first test,
       * the loop does not run, and the winner is photographed at the distance
       * a dash left the camera at. Measured on the three card captures of this
       * round, straight off `__airenaDrawn.beat` — the record this file added
       * for exactly this question: `live-result-win` tall **0.069** at dist
       * 26, `live-result-loss` **0.26** at 17, `live-vs` **0.248** at 20,
       * against a `want` of 0.467 in all three. Every one of them refused on
       * SIZE, with the eye standing further out than the size test can accept,
       * and every one fell through to the arena portrait — the empty-plaza
       * result frame this whole block exists to prevent.
       *
       * So the same cap is a FLOOR as well as a ceiling: past it there is no
       * answer to find, short of it there is one and it is the beat's.
       *
       * AND IT IS TAKEN IN ONE STEP, NOT WALKED. Every other move in this
       * function is rate-limited, and a rate-limited approach here buys
       * nothing: the solve restarts from `camState.dist` every frame and the
       * restore at the end of this block hands the whole approach back the
       * moment the beat fails, so a metre a frame is a metre a frame given
       * away. Rate-limiting it and flooring the restore instead was tried and
       * is worse — see the restore's own note; it cost `checkframing` a
       * fighter at |ndc| 1.103. So the eye arrives at the distance the beat
       * needs and the distance is COMMITTED ONLY IF THE BEAT KEEPS IT: on the
       * frame `soloReadable` passes, the shot the reader sees is the shot that
       * was graded, and on every frame it refuses, `camState.dist` goes back
       * untouched. A card beat is a cut in the edit anyway (`camCut`), which is
       * what `checkcamera` excludes and why it stays green across this.
       *
       * AND ONLY WHERE THERE IS A CARD TO STAND BESIDE. A hero shot of ONE
       * fighter is bought with the other one's place in the frame, and that is
       * the right trade exactly once: when a card has taken the middle of the
       * screen and the beat is about the creature beside it. With no card the
       * subject is the pair, and pushing in on one of them is how
       * `checkframing` came to lose the other at |ndc| 0.955 and 1.273 in six
       * replays of the after-over window. So the approach is conditional on
       * `hudBand.cardRect`, which is the same thing `soloReadable` keys its
       * own bar on — one question, asked once, answered the same way twice.
       */
      if (hudBand.cardRect && camState.dist > cap) camState.dist = cap;
      const fitsOne = (edge) => {
        trialCam.fov = camera.fov; trialCam.aspect = camera.aspect;
        trialCam.updateProjectionMatrix();
        place(trialCam);
        trialCam.updateMatrixWorld();
        return bodyInBand(trialCam, sid, sf, edge);
      };
      for (let i = 0; i < 16 && camState.dist < cap && !fitsOne(FRAME_TARGET); i++) {
        camState.dist = Math.min(cap, camState.dist * 1.08);
      }
      if (camState.dist > before && !snap) camState.dist = Math.min(camState.dist, before + RESCUE_RATE * dt);
      place(camera);
      camera.updateMatrixWorld();
      for (let i = 0; i < 2 && clearOfCard(camera, sid, sf); i++) {
        place(camera);
        camera.updateMatrixWorld();
      }
      if (soloReadable(camera, sid, sf)) { standShot.pair = true; break; }
    }
    /* Neither of them: put the eye back where the pair solve left it, so the
       arena portrait blends out of the shot this frame actually composed
       rather than out of a retreat nobody is going to see. */
    /*
     * …AND THE RESTORE IS TOTAL, WHICH IS WHY THE PUSH-IN ABOVE IS NOT.
     *
     * Flooring this at the size test's own `capWant` was tried, so that a beat
     * failing on SIZE could walk the eye in a metre a frame instead of handing
     * every metre straight back. It works and it costs more than it buys: the
     * eye then sits at `HERO_NEAR` for the whole of a beat it never wins, and
     * `checkframing` — which grades every live fighter through the after-over
     * window too — went from worst |ndc| 0.849/0.867 to 0.890 and **1.103**,
     * a fighter a fifth of a screen outside the picture, in 20 replays. A beat
     * that cannot keep its subject must not keep the approach either; the
     * push-in lands on the beat's CUT (`snap`, unlimited there) or not at all.
     */
    if (!standShot.pair) {
      camState.dist = before;
      focus.x = camState.look.x; focus.z = camState.look.z; focus.tx = aim.x; focus.ty = aim.y;
      place(camera);
      camera.updateMatrixWorld();
    }
  }
}

/**
 * THE STAND SHOT — the arena as the picture, on request.
 *
 * `establishingCamera` above frames the PAIR: it is the right answer for the
 * result, where the winner stands over the fallen, and for a VS beat whose two
 * bodies are already on the floor. It is the wrong answer when there is
 * nothing to frame — a VS card rises before the match's first snapshot, so
 * neither body is visible yet, and the shot became a mid-height view of empty
 * plaster with the card over it, no wall, no blocks, no planet, no banner.
 * That is the beat the site is most looked at.
 *
 * So there is a second establishing shot, and it is the STAND's `low` preset
 * verbatim (`arena.html` CAMS.low, photographed as `reports/arena/stand-low.png`):
 * 8 m over the coping, 32 m out, aimed 8 m past the centre at fov 56 — the
 * four walls, the blocks, the tiers in the haze, the banner and the planet's
 * disc, which is the arena's own portrait. (The brief's "about (0, 10, 30),
 * fov 48" is this shot rounded; the stand's numbers are the ones that were
 * photographed, and at fov 50 the tier wings showed only as two chips cut by
 * the frame edges.)
 *
 * ── it does not touch the solver ────────────────────────────────────────────
 *
 * The auto camera keeps running underneath, every frame, into `camState`; this
 * only BLENDS the drawn eye toward the preset, over 600 ms in and 600 ms out,
 * and puts the field of view back before the solver reads it again
 * (`releaseStandShot`, at the head of `frame()`). The eye is put back whole —
 * position, orientation and field of view — for two reasons: `camera.fov` is
 * the one piece the solver READS BACK (its own ease runs on it, so a borrowed
 * 56° would feed into the next solve), and on the loop's third path, where
 * neither camera branch runs at all (no frames, no match: a visitor's first
 * seconds), nothing would re-place the eye and the blend would have no pose
 * to blend FROM — it would sit at the shot for ever instead of easing back.
 * When the shot is released the orbit is
 * already where it would have been, and `tools/checkframing.mjs`, which slices
 * this file and never asks for the shot, grades exactly the camera it graded
 * before. The framing assertion stands down while the blend is up, as it does
 * for a cut: what it grades is the fight's eye, and this is not it.
 *
 * Asked for by the shell — `window.__airenaCam('stand')` and `('auto')` — or
 * by `?cam=stand` for a capture; and by the viewer itself on a card beat with
 * no pair to stand over (`standShot.auto`, set in the loop).
 */
const STAND_SHOT = { pos: new THREE.Vector3(0, cfg.arena.wallHeight + 8, 32), look: new THREE.Vector3(0, 2.5, -8), fov: 56 };
/**
 * …AND IT IS COMPOSED FOR 16:9, so a portrait frame has to be given the same
 * picture rather than a crop of it.
 *
 * `STAND_SHOT.fov` is a VERTICAL field of view. At 1440×900 (aspect 1.6) the
 * horizontal field is 80.8°, which is what puts the banner at ndc x −0.29 and
 * both tier wings inside the frame. At 390×844 (aspect 0.46) the same 56°
 * vertical is 28° horizontal: the banner projects to x −1.02 — off the left
 * bezel — the wings leave the frame, and the mobile capture came back a blank
 * page with a card on it.
 *
 * So the HORIZONTAL field is what is held, not the vertical: the fov is
 * widened until the frame carries the same horizontal angle it carries at
 * 1.6, capped at 74° (past that the perspective bends), and the eye is pulled
 * back along its own view line for what the cap could not buy — capped at
 * 1.25×, because pulling all the way back turns the arena into a strip in the
 * middle of a tall frame. At 390×844 that is fov 74 from (0, 14.4, 42), which
 * puts the banner at −0.65 and the arena across the width. Identity at 1.6;
 * a wider frame than 1.6 keeps the composed 56° rather than narrowing.
 */
const STAND_REF_ASPECT = 1.6;
const STAND_FOV_CAP = 74;
const STAND_PULL_CAP = 1.25;
const _standPos = new THREE.Vector3();
const standFit = { fov: 56, pos: _standPos };
function fitStandShot(aspect) {
  const tanH = Math.tan((STAND_SHOT.fov * Math.PI) / 360) * STAND_REF_ASPECT;
  const a = Math.max(0.2, aspect);
  const fov = THREE.MathUtils.clamp(
    (2 * Math.atan(tanH / a) * 180) / Math.PI, STAND_SHOT.fov, STAND_FOV_CAP,
  );
  const have = Math.tan((fov * Math.PI) / 360) * a;
  const pull = THREE.MathUtils.clamp(tanH / have, 1, STAND_PULL_CAP);
  standFit.fov = fov;
  _standPos.copy(STAND_SHOT.pos).sub(STAND_SHOT.look).multiplyScalar(pull).add(STAND_SHOT.look);
  return standFit;
}
const standShot = {
  want: 0, auto: false, pair: false, done: false, k: 0, held: false,
  /* the last card beat's own verdict, for the sidecar — see `soloReadable` */
  beat: null,
  /* the solver's own eye, kept while the blend borrows it */
  fovAuto: 0, posAuto: new THREE.Vector3(), quatAuto: new THREE.Quaternion(),
};
/* A camera, not a bare Object3D: `Object3D.lookAt` points −z at the target
   only for a camera or a light, and +z for everything else — a plain object
   here would aim the shot at the wall behind it. */
const _standEye = new THREE.PerspectiveCamera(STAND_SHOT.fov, 1, 0.3, 400);
/** The shell's hook. Anything but 'stand' is the fight's own camera again. */
function requestCam(mode) {
  standShot.want = mode === 'stand' ? 1 : 0;
  return standShot.want ? 'stand' : camModes[camMode];
}
if (typeof window !== 'undefined') {
  window.__airenaCam = requestCam;
  if (new URLSearchParams(location.search).get('cam') === 'stand') requestCam('stand');
}
/** Give the solver its own field of view back, before it runs. */
function releaseStandShot() {
  standShot.done = false;
  if (!standShot.held) return;
  standShot.held = false;
  camera.position.copy(standShot.posAuto);
  camera.quaternion.copy(standShot.quatAuto);
  camera.fov = standShot.fovAuto;
  camera.updateProjectionMatrix();
}
/**
 * Blend the drawn eye toward the stand shot. Called after the camera solve and
 * BEFORE `updateOcclusion`, so the wall rule fades the wall this eye looks
 * over rather than the one the orbit was behind.
 */
function applyStandShot(dt) {
  /* ONCE A FRAME, whichever call site reaches it first — after the solve when
     a fight is on the screen (so `updateOcclusion` fades the wall THIS eye
     looks over), at the tail of the loop otherwise. The loop has a third
     path, and it is the one the VS beat takes: with no frames and no match
     announced neither camera branch runs at all, and a blend that only
     stepped inside them stopped half way and left the eye between the boot
     camera and the shot — which is exactly what the first capture showed. */
  if (standShot.done) return;
  standShot.done = true;
  const step = dt / 0.6;
  const want = standShot.want || standShot.auto ? 1 : 0;
  standShot.k = THREE.MathUtils.clamp(standShot.k + (want ? step : -step), 0, 1);
  if (standShot.k <= 0) return;
  /* smoothstep, so the move leaves and arrives at rest — a linear ramp on a
     600 ms cut reads as a shove at both ends */
  const k = standShot.k * standShot.k * (3 - 2 * standShot.k);
  standShot.posAuto.copy(camera.position);
  standShot.quatAuto.copy(camera.quaternion);
  standShot.fovAuto = camera.fov;
  standShot.held = true;
  const fit = fitStandShot(camera.aspect);
  _standEye.position.copy(fit.pos);
  _standEye.fov = fit.fov;
  _standEye.aspect = camera.aspect;
  /*
   * AND ON A TALL FRAME THE SHOT LOOKS DOWN, so the arena is not all behind
   * the card. In portrait the far coping — the arena's own horizon — projects
   * to y ≈ 375 of 844 and the banner to y ≈ 311, both inside the card's
   * 165–578, so the band ABOVE the card measured 5.4 L: a blank cream page
   * with a VICTORY card on it. Tilting the aim down by half a frame lifts the
   * coping to y ≈ 139 and the banner to y ≈ 80 — the arena's boundary, its
   * tiers and its one coral mark all land in the band the reader has. Zero at
   * 16:9, where the composed shot already works, and ramped in as the frame
   * narrows so a tablet gets a third of it.
   */
  const tilt = THREE.MathUtils.clamp((1.2 - camera.aspect) * 0.7, 0, 0.55);
  aimAt(_standEye, STAND_SHOT.look.x, STAND_SHOT.look.y, STAND_SHOT.look.z, 0, tilt);
  camera.position.lerp(_standEye.position, k);
  camera.quaternion.slerp(_standEye.quaternion, k);
  camera.fov += (fit.fov - camera.fov) * k;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  camCutAt = performance.now() / 1000;
}

/**
 * How much of the half-frame the pair and the wall-bias between them may fill.
 *
 * The distance solve below asks for room for both, but the [13, 34] clamp is
 * allowed to refuse it and `camState.dist` eases toward its answer rather than
 * jumping to it — so the bias is bounded a second time, against the frame the
 * shot really has rather than the one it asked for. The remaining 38% pays for
 * that lag, for the shake, and for the fact that `halfFrameAt` measures across
 * the ground distance and ignores the camera's elevation, so it reads low.
 */
const AIM_HEADROOM = 0.62;
/**
 * Where in the HUD's free band the pair is placed, from its floor.
 *
 * 0.5 is the band's middle, which is where this sat; 0.36 puts the fighters in
 * the lower third of the room they have and gives the upper third to the
 * arena's own horizon. See the note at `bandMid`.
 */
const BAND_PLACE = 0.36;
/**
 * THE FIGHT CAMERA'S PITCH CEILING — how the world got into the frame.
 *
 * The stand's `orbit()` looks at a fixed 3.5 m and the port looks at the pair,
 * which is 1.2 m; the difference is 4.6° of pitch and it is the whole of the
 * founder's second directive. Measured on the frame before this: above the
 * coping there were 18 px of sky, 22 px of deck fascia and then tier bank —
 * no banner, no planet, no moon, no skyline anywhere in a fighting frame.
 *
 * A FLOOR UNDER THE AIM WAS TRIED FIRST AND IT IS THE WRONG LEVER. The aim's
 * height is not free: `dropAt` places the pair inside whatever band the HUD
 * leaves, and on the visitor's page — where the invitation card docks in the
 * bottom column and `measureHud` reports a band whose centre is ABOVE the
 * frame's — the drop is positive and the aim is legitimately below the
 * fighters' feet. Clamping it to 2.8 m there raised the aim by three metres,
 * dropped the pair 0.22 ndc toward the band's floor, and the band solve
 * answered the only way it can: it backed the eye out to the 44 m cap. The
 * capture is unmistakable — the whole 40 m pit inside 66 % of the width and
 * two fighters 40 px tall.
 *
 * So the pitch is capped where pitch actually lives: the EYE's height. The
 * aim keeps the composition the band asked for, the eye comes down until the
 * shot is no steeper than this, and the frame's top edge rises by exactly the
 * angle the eye gave up. At the fight's mean 20 m shot that is an eye at
 * about 7.3 m instead of 9.2, a top of frame at +8° instead of +2.8°, and a
 * deck roofline (16.4 m at the far ring) inside the picture with sky over it.
 *
 * Floored at the wall's own height plus a metre: below that the eye is INSIDE
 * the room, the near wall stops being something the wall rule can fade
 * (`wallHidesField` needs an eye above the coping) and becomes a lid.
 */
/*
 * 15°, swept against both gates over the same 60 464 rendered frames. The
 * whole grid, worst |ndc| at 16:9 / 4:3 and `checkcamera`'s height p99:
 *
 *   no cap  0.694 / 0.847   height p99 19.1  dist p99 175  (before)
 *   20°     0.770 / 0.868   height p99 10.2  dist p99 162
 *   18°     (not read)     height p99  8.6  dist p99 146
 *   16°     0.847 / 0.860   height p99  7.0  dist p99 134
 *   15°     0.849 / 0.867   height p99  6.4  dist p99 129   ← taken
 *   14°     0.851 / 0.872   height p99  5.8  dist p99 128
 *
 * Everything holds; what moves is where the margin sits. The fighters give
 * up 0.15 of `FRAME_EDGE`'s slack (0.85 against 0.92, and still inside
 * `FRAME_TARGET`'s own 0.88) and the camera's smoothness gains three times
 * that. 15° is where the WORLD arrives and not a degree past it: the top of
 * frame lands at +8° of elevation, which at the far ring's 94 m puts the
 * picture's edge above 20 m against the deck's 16.4 m roofline. 18° leaves
 * the edge at 16.6 m — the roofline exactly, i.e. clipped — and buying more
 * sky below 14° costs |ndc| without adding anything the frame does not have.
 */
const PITCH_MAX = 15;
const PITCH_TAN = Math.tan((PITCH_MAX * Math.PI) / 180);
/**
 * How fast the eye climbs with distance — the fight camera's pitch, really.
 *
 * 0.42 put the eye 15.4 m up at a 30 m shot and pointed the top of frame BELOW
 * the horizon at every distance the orbit uses. 0.32 is 3 m lower at 30 m and
 * 1.8 m at 18 m (the measured mean shot) — about 5° of pitch — and it is a
 * quieter camera as well as a flatter one, because the eye's height follows
 * the distance and a shallower coupling means a dolly moves the eye less.
 * Read in two places, the servo's own target and the band solve's trial
 * height, and they must be the same number or the trial answers about an eye
 * that never arrives.
 *
 * The pair was swept against both gates at 60 464 rendered frames each:
 * 0.36/0.32 leaves `checkframing` at worst |ndc| 0.694 (against 0.826 before,
 * i.e. the shot is LOOSER on the fighters, not tighter) and `checkcamera` at
 * height p99 19.1 of 20 and dist p99 175 of 200. 0.42 for the rise fails the
 * height ceiling at 21.7: the lower placement makes the band solve work the
 * distance harder, and at the old coupling the height servo rode it.
 *
 * 0.32 STANDS, AND THE PITCH IS CAPPED SEPARATELY (06.09). Lowering this
 * number was tried as the way to get the deck's roofline into a fighting
 * frame, and it is the wrong lever twice over: it flattens the shot at every
 * distance equally, when what the frame needs is a ceiling on the ANGLE, and
 * it is the number two gates were swept on. `PITCH_MAX` caps the eye's height
 * against the aim instead, so this curve is what the eye rides whenever the
 * shot is already flat enough — and the cap turns out to be the quieter
 * camera as well: over the same 60 464 frames `checkcamera`'s height p99 goes
 * 19.1 → 6.4 of its 20 ceiling and dist p99 175 → 129 of 200, because the
 * eye now tracks an aim eased at rate 12 instead of a distance the rescue
 * loop steps.
 */
const EYE_RISE = 0.32;
/** How far out a body may sit before the framing counts as having lost it. */
const FRAME_EDGE = 0.92;
/** What the framing solves for, leaving the edge slack for the hit shake. */
const FRAME_TARGET = 0.88;
/** Насколько быстро камера отъезжает, спасая бойца из-за края кадра, м/с. */
const RESCUE_RATE = 90;
/** Потолок угловой скорости камеры вокруг пары, рад/с. */
const AZ_RATE = 2.2;

/**
 * A trial eye, for the camera to ask "would I see them from over there?".
 *
 * The old test at this spot looped `cfg.arena.obstacles` and nothing else, so
 * the four walls — the tallest opaque things in the arena — were invisible to
 * it, and `hidden()` reported a clear shot with a wall across the picture 12.1%
 * of the time. It also flattened the world to 2D, which cannot be extended to
 * the walls: the eye orbits outside them. `hiddenCount` is the 3D answer over
 * every solid; this wraps it for the two candidate azimuths.
 */
const trialEye = { x: 0, y: 0, z: 0 };
function eyeHides(az, dist, height, look, f, id) {
  trialEye.x = look.x + Math.sin(az) * dist;
  trialEye.y = height;
  trialEye.z = look.z + Math.cos(az) * dist;
  return hiddenCount(trialEye, f, bodies[id]?.height ?? 2, false);
}

/**
 * Framing rule: sit on the perpendicular bisector of the pair, so both bodies
 * are in profile and the gap between them is the widest thing on screen — that
 * gap IS the fight. The side is chosen to be the one the camera is already on,
 * because swapping sides mid-chase reverses the picture and reads as a cut.
 */
function updateCamera(a, b, dt) {
  /* Under a card, and once the result is in, the shot is the establishing
     one (above); the orbit is for the fight. `over` is the socket's message
     (2.6 s after the kill, so the push-in still shows the topple), `card` the
     DOM's — the VS beat, and the screen's own fixtures. */
  if ((over || hudBand.card) && camModes[camMode] === 'auto') { establishingCamera(a, b, dt); return; }
  /* The orbit is a fight camera: it never claims a card beat's pair (see
     `standShot.pair`, decided by the establishing shot alone). Without this
     the flag stood at last fight's value on the frame a card rose, and the
     beat took a pair shot of a pair nobody could see. */
  standShot.pair = false;
  const pair = [['blue', a], ['orange', b]];
  const mid = new THREE.Vector3((a.x + b.x) / 2, 1.2, (a.z + b.z) / 2);
  const sep = Math.hypot(b.x - a.x, b.z - a.z);
  const snap = camState.snap;
  camState.snap = false;
  /* Back from the establishing shot: 0.6 s of eases and caps at ×5 (see
     `establishingCamera`), and the assertion stands down as for a cut. Not
     after a snap — the plant has already done the job, and a ×5 servo on top
     of it was the opening jerk in the camera trail. */
  if (camState.establishing) {
    camState.establishing = 0;
    if (!snap) { camState.blend = 1; camCutAt = performance.now() / 1000; }
  }
  camState.blend = Math.max(0, camState.blend - dt / 0.6);
  const gain = 1 + 4 * camState.blend;
  const ease = (rate) => (snap ? 1 : 1 - Math.exp(-rate * gain * dt));
  if (camera.fov !== ORBIT_FOV) {
    camera.fov = snap || Math.abs(camera.fov - ORBIT_FOV) < 0.05 ? ORBIT_FOV : camera.fov + (ORBIT_FOV - camera.fov) * ease(3);
    camera.updateProjectionMatrix();
  }

  /* Half the frame's width in metres at a subject `d` metres away, along the
     ground. The camera is elevated, so the true slant range is longer than `d`
     and this reads low — which is the direction an error here should point. */
  const hFov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
  const halfFrameAt = (d) => d * Math.tan(hFov / 2);
  /*
   * The aim sits at the BAND's centre, not the frame's. `look.y + 0.4` used to
   * project the pair's midpoint to ndc y ≈ 0, the middle of the screen —
   * which at every width is inside or just above the HUD's bottom band (the
   * name row is at 69 % / 64 % / 51 % of the height). Aiming that much lower
   * lifts the pair to the middle of the free band: ~0.65 m at 1440×900 from
   * 13 m, ~2 m on the phone. A function of the eye's slant range, because
   * the rescue loop below moves the eye while it asks.
   */
  /*
   * …AND LOW IN IT, NOT IN THE MIDDLE OF IT (ARENA-AAA §2).
   *
   * The pair used to be centred in the free band, which put the top of frame
   * at −3.6° of elevation: from orbit(π/4, 30) the eye is 15.4 m up looking at
   * 0.4 m, so everything above y = 15.4 − d·tan(3.6°) is clipped — y ≈ 9.5 m
   * at the far ring. The deck's roofline (16.4 m), the sky, the planet and the
   * moon were outside every fighting frame, and the top 145 px of stand-game
   * measured 12.9 L of range: corduroy, not a world. The founder's second
   * directive is that the world beyond the field is the picture's scale, and a
   * camera that never shows it makes the whole ring an expense.
   *
   * Two numbers buy it and neither moves the fighter out of the band. The
   * subject is placed at 0.36 of the band up from its floor rather than at its
   * middle (−0.03 ndc against +0.105 at 1440×900), and the eye rides a flatter
   * curve (`EYE_RISE` 0.32 against 0.42). Together they lift the top of frame
   * by about 8°, which at the ring's distance admits the deck's roofline and a
   * strip of sky over it. The band solve, `bodyInBand` and the rescue all read
   * the same number, so nothing here trades a fighter for a roofline — and the
   * measurement says the opposite happened: the worst any fighter reached over
   * 60 464 rendered frames went 0.826 → 0.694 of `FRAME_EDGE`.
   */
  const bandMid = hudBand.yBot + (hudBand.yTop - hudBand.yBot) * BAND_PLACE;
  const dropAt = (dist, height) => bandMid * Math.tan((camera.fov * Math.PI) / 360) * Math.hypot(dist, height - 1.6);
  /*
   * …AND THE AIM HAS A FLOOR, WHICH IS THE STAND'S OWN NUMBER.
   *
   * The pair's midpoint is 1.2 m off the floor and the drop above adds about
   * 0.3 m at a 24 m shot, so the fight camera looks at roughly 1.5–1.9 m —
   * against the stand's `orbit()`, which the port copied everything else
   * from, looking at a FIXED 3.5 m. The difference is 2.5° of pitch and it is
   * the whole of the founder's second directive: measured on
   * `live-fighting.png`, the frame above the coping is 18 px of sky, 22 px of
   * deck fascia and then tier bank — no banner, no planet, no moon, no far
   * skyline anywhere in a fighting frame, because the roofline sits in the
   * top 4 % of the picture and everything hung below it is behind the bank.
   *
   * A floor, not a constant: the drop still composes the pair inside the free
   * band whenever the pair is high enough to need it, and the floor only
   * binds where the alternative is a camera pointed at the plaster. 3.2 m is
   * the stand's 3.5 less the 0.3 the drop is already worth, so the two files
   * end up aiming within a fifth of a metre of each other at the fight's own
   * distance. Read by the servo below AND by the band solve above, or the
   * trial answers about an eye that never arrives.
   */
  const aimFor = (lookY, dist, height) => lookY + 0.4 - dropAt(dist, height);
  /*
   * The eye's own curve, capped so the shot is never steeper than `PITCH_MAX`
   * (see there). Read by the servo below AND by the band solve's trial
   * height, and they must be the same function or the trial answers about an
   * eye that never arrives.
   */
  const eyeAt = (dist, aim, cover) => Math.max(
    cfg.arena.wallHeight + 1.2,
    Math.min(2.8 + dist * (EYE_RISE + 0.20 * cover), aim + dist * PITCH_TAN),
  );
  /* The aim's height is a state of its own, eased fast (rate 12: 63 % in
     80 ms, instant in steady state, where the drop changes with the distance
     only) so that the hand-overs with the establishing shot (whose aim is
     2 m up, undropped) move the composition instead of stepping it. */

  /*
   * Bias the look-at inward as the fight approaches a wall.
   *
   * The framing rule is sized to the pair and knows nothing about the arena, so
   * a fight that ends in a corner is shot from outside the building: half the
   * frame is the dark apron and the two fighters are pushed to one edge. That
   * matters more than it sounds, because the frame it ruins is usually the last
   * one — the kill happens where somebody got cornered. Pulling the target up
   * to 45% of the way to the centre turns the camera back over the floor.
   *
   * What the pull cannot do is ignore the frame it is moving inside of. It
   * displaces the aim by up to 45% of the pair's distance from the centre —
   * around ten metres deep in a corner, more than the whole half-frame buys at
   * the near end of the distance clamp — and it used to be applied flat, with
   * nothing checking that the fighters came with it. Six matches, 8 705
   * fighter-frames: one of the two projected clean off the screen in 13.3% of
   * them, 44.4% in the worst pairing, peaking at |ndc| 3.12 — a body a full
   * screen width outside the picture, in the frame where somebody was being
   * cornered and killed. The cure for a corner cannot be losing the fighter who
   * got cornered, so the demand below buys its own room in the distance solve,
   * is bounded by what that distance actually granted, and is then tried
   * against the real projection before anything commits to it. Eight matches
   * after, six of them the same seeds: 0 off the screen out of 8 432, worst
   * |ndc| 0.882 — which is exactly `FRAME_TARGET`, so it is the trial binding.
   */
  const edge = Math.max(Math.abs(mid.x), Math.abs(mid.z)) / HALF;
  const wantPull = THREE.MathUtils.clamp((edge - 0.45) / 0.45, 0, 1) * 0.45;
  /** Metres the full pull would move the aim off the pair's true midpoint. */
  const bias = wantPull * Math.hypot(mid.x, mid.z);
  /** As much of that pull as a frame this wide can pay for. */
  const affordable = (halfFrame) => {
    const room = Math.max(0, halfFrame * AIM_HEADROOM - sep / 2);
    return bias > 1e-3 ? Math.min(1, room / bias) * wantPull : 0;
  };
  const aimAt = (pull) => mid.clone().lerp(ARENA_CENTRE, pull);

  if (camModes[camMode] === 'top') {
    const d = Math.max(20, sep * 1.1 + 12);
    // Straight down, so the frame's SHORT side is the one the bias has to fit
    // inside: a pull along world Z leaves the top of the picture, not the side.
    // No trial is needed here — nothing is tilted, so the arithmetic is exact.
    camState.look.lerp(aimAt(affordable(halfFrameAt(d) / camera.aspect)), 1 - Math.exp(-4 * dt));
    camera.position.set(camState.look.x, d, camState.look.z + 0.01);
    camera.lookAt(camState.look);
    return;
  }
  if (camModes[camMode] === 'wide') {
    camState.look.lerp(new THREE.Vector3(0, 1, 0), 1 - Math.exp(-3 * dt));
    camera.position.set(0, 30, 42);
    camera.lookAt(camState.look);
    return;
  }

  let want = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
  // pick the representative of {want, want+PI} nearer the current azimuth
  let d = ((want - camState.az + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(d) > Math.PI / 2) want += Math.PI;

  /*
   * Anchor the perpendicular as they close.
   *
   * The bisector rule is rigidly tied to the pair's axis, and a kite IS one
   * fighter circling the other — so the axis sweeps a full turn and the shot
   * sweeps with it. Damping lags that, it does not stop it, and the result is a
   * camera that never settles during the one part of the fight worth watching.
   * Below about twelve metres the framing blends toward a fixed arena azimuth,
   * so melee is shot from a stable side with the blocks where the eye left them.
   */
  const anchorPull = THREE.MathUtils.clamp((12 - sep) / 7, 0, 1) * 0.8;
  let toAnchor = ((CAM_ANCHOR - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(toAnchor) > Math.PI / 2) toAnchor -= Math.sign(toAnchor) * Math.PI;
  /*
   * The anchor is a LINE, not a direction — melee may be shot from either end
   * of it — and the fold above is what makes it one. But the fold is a step:
   * one frame either side of |toAnchor| = PI/2 the pull points opposite ways,
   * so `want` moves by PI * anchorPull in a single frame and the eye snaps.
   * Measured worst case 0.23 rad, about 13 degrees, inside one frame.
   *
   * Fading the pull out as it approaches the fold costs nothing where the
   * anchor does its work — dead ahead of either end, `fold` is 1 — and makes
   * the crossing continuous, because the term is already zero by the time its
   * sign changes.
   */
  const fold = THREE.MathUtils.clamp((Math.PI / 2 - Math.abs(toAnchor)) / 0.35, 0, 1);
  want += toAnchor * anchorPull * fold;

  /*
   * The one azimuth discontinuity left in this function, and why it is left.
   *
   * Measure per-frame azimuth motion by the JUMP IN ANGULAR VELOCITY — |dw| =
   * |(az_n - az_n-1)/dt - (az_n-1 - az_n-2)/dt|, rad/s — never by a raw
   * per-frame second difference. A second difference is a function of the frame
   * time: over the same 24 matches its worst value is 0.168 rad at 30 Hz,
   * 0.088 at 60 Hz and 0.044 at 120 Hz, so two runs of one seed at different
   * frame rates cannot be compared and a dropped frame reads as camera jerk.
   * |dw| converges instead — 5.05, 5.30, 5.26 rad/s over those same three — so
   * it is a fact about this code and not about the machine it ran on.
   *
   * By that metric the representative pick 30 lines up is the largest event
   * here. Choosing whichever of {want, want + PI} is nearer moves the TARGET by
   * PI on the frame the nearer one changes, and `d * ease(1.6)` reverses at
   * full speed: 15 changes across 24 matches, and 13 of the 14 frames anywhere
   * in those matches with |dw| above 3 rad/s are one of them.
   *
   * It is left alone deliberately. The change happens when the eye is PI/2 from
   * both ends of the bisector — looking straight down the pair's axis, where
   * the two are one behind the other and either direction is equally right. A
   * continuous error term over the line (sin(2d)/2) removes the reversal and
   * halves the slew rate everywhere else to do it, and it cannot be applied
   * here anyway: the anchor blend above moves `want` up to 1.26 rad off the
   * bisector, so `d` is not bounded by PI/2 by the time it reaches this line —
   * measured at -2.79 and +2.05 rad, where a folded term drives the eye the
   * wrong way. Trading a once-in-four-matches reversal for a slower servo in
   * every frame is the wrong trade. This wants a different framing rule, not a
   * smoothing term bolted onto this one.
   */
  d = ((want - camState.az + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  /*
   * У ПОВОРОТА ЕСТЬ ПОТОЛОК СКОРОСТИ, как у отъезда.
   *
   * Экспоненциальное сглаживание гладко только при малой ошибке. Биссектриса
   * пары переворачивается, когда бойцы меняются местами, и `d` доходит до π;
   * первый кадр после этого поворачивал глаз на 0.08 рад из состояния покоя,
   * то есть 5 рад/с из нуля за 16.7 мс. Замерено `tools/checkcamera.mjs`:
   * вторая разность азимута доходила до 465 рад/с².
   *
   * 2.2 рад/с — примерно 126°/с: быстрее, чем успевает следить глаз, и
   * медленнее, чем «камеру провернуло». Потолок не трогает обычное слежение
   * (99-й процентиль скорости заметно ниже) и срезает только переворот.
   * Склейка (`snap`) исключена: это монтаж, а не движение.
   */
  const azStep = d * ease(1.6);
  camState.az += snap ? azStep : THREE.MathUtils.clamp(azStep, -AZ_RATE * gain * dt, AZ_RATE * gain * dt);

  /*
   * Close, and derived rather than guessed.
   *
   * A 2 m body in a 40 m arena is a realistic scale and an unreadable shot:
   * from far enough to hold the whole floor, a fighter is twenty pixels and its
   * wind-up is invisible. So the shot is sized to the PAIR — solve the horizontal
   * field of view for the distance at which the two of them plus a margin
   * exactly fill the frame. The camera is then as tight as it can be without
   * ever losing one of them, which is the only framing rule a 1v1 needs.
   */
  const margin = 5.5;
  // `bias` is in the solve because the wall pull moves the aim off the pair and
  // the frame has to hold the pair PLUS that offset, not just the pair.
  const need = (sep / 2 + bias + margin) / Math.tan(hFov / 2);
  /*
   * Close in on the kill.
   *
   * The wide framing that holds a chase is the wrong shot for a corpse: it left
   * the winner 120 px tall at the bottom of the picture with the loser behind a
   * wall while the banner said who won. The pair are by definition together at
   * that point, so `need` is already at its floor; this takes another quarter
   * off it and lets the ease carry the eye in over about a second. The framing
   * servo below still has the last word, so the push-in can ask for more than
   * the frame can hold and simply gets as much as it can.
   *
   * `decided`, not `over`: the socket's `over` message is 2.6 s of curtain late
   * and the push-in used to miss the shot it exists for entirely. Over 24 kills
   * the eye was at 19.65 m when the fighter died and still 18.43 m when the
   * message landed — mean 19.26 m across the whole death and topple. Off the
   * frame flag it is 15.11 m across the same window and 14.50 m at the 1.3 s
   * mark. It does not reach the 9.5 m floor in most of them and should not:
   * `need * 0.75` is still sized to the pair, and the servo below still has the
   * last word.
   */
  /*
   * The near clamp was 13 m, sized for the 2 m stock bodies; a ~5 m generated
   * body at 13 m does not fit the band from any aim, so melee kept asking for
   * a frame it could not hold and the rescue loop paid for it every frame.
   * The floor is the distance at which the tallest body is 42 % of the
   * frame's height — 13 m for the stock bodies, ~14 for 5 m, ~16.5 for 7 m —
   * and the kill push-in keeps its 9.5/13 of that.
   */
  const tallest = Math.max(bodies.blue?.height ?? 2, bodies.orange?.height ?? 2);
  const distMin = Math.max(13, tallest / (0.42 * 2 * Math.tan((camera.fov * Math.PI) / 360)));
  let targetDist = THREE.MathUtils.clamp(decided ? need * 0.75 : need, decided ? distMin * (9.5 / 13) : distMin, 34);
  /*
   * THE BAND'S OWN DISTANCE. `need` is honest arithmetic about the frame's
   * WIDTH; the band is a constraint on its HEIGHT, and from an elevated eye
   * the two are different problems: a pair whose axis has a component along
   * the view stands at two depths, and the nearer body drops down the
   * picture while the farther rises — at 21 m and the 0.42 height ratio a
   * 12 m pair along the view puts the near feet 0.5 ndc under the aim, below
   * the name row from any aim the band allows. Distance is what shrinks the
   * spread. So the band asks for its own distance: the smallest at which both
   * bodies sit inside it, found by bisection through the same trial
   * projection `holds` uses, at the height the eye WILL have there. It joins
   * `need` as the servo's target and the servo eases to it — measured
   * without this, the rescue loop below re-bought the same distance every
   * frame and the servo took it back: a sawtooth at 3 100 m/s² (p99) on
   * `tools/checkcamera.mjs`, against its 200 ceiling.
   */
  /*
   * Two heights per candidate, and a margin of its own. The eye's height
   * eases at 1.4 toward its curve (2.8 + 0.42·dist) while the distance eases
   * at 2.6/9, so during a tightening the eye rides ABOVE the curve for a
   * second and the true spread is larger than the curve predicts — measured
   * as a sawtooth: the feet crossed the band's edge, the lost-jump fired
   * (14 → 25 m in a frame), the servo tightened again. So a candidate must
   * fit at the height the eye has NOW as well as the height it will have
   * there, and the steady-state target keeps 0.10 ndc inside the band (the
   * rescue below still fires at 0.04): the eye sits a few percent further
   * and the feet stay a finger above the name row through a dash. On the
   * snap frame the look is the pair's own midpoint, not the previous match's
   * — the stale look planted the opening 10 m too far and dollied in at the
   * cap for a second.
   */
  /* The current height is asked only of candidates at or beyond the eye's
     distance. Asked of a nearer one it deadlocked every tightening: the
     height's target followed the distance the eye HAD, the eye could not
     come in while the height was high, and the height never came down —
     the fight camera sat 35–40 m out over a pair three metres apart. */
  const fitsAt = (D) => {
    const look = snap ? aimAt(0) : camState.look;
    const raw = 2.8 + D * (EYE_RISE + 0.20 * camState.cover);
    for (const H of [eyeAt(D, aimFor(look.y, D, raw), camState.cover), snap || D < camState.dist ? null : camState.height]) {
      if (H === null) continue;
      trialCam.fov = camera.fov; trialCam.aspect = camera.aspect;
      trialCam.updateProjectionMatrix();
      trialCam.position.set(look.x + Math.sin(camState.az) * D, H, look.z + Math.cos(camState.az) * D);
      trialCam.lookAt(look.x, aimFor(look.y, D, H), look.z);
      trialCam.updateMatrixWorld();
      for (const [id, f] of pair) {
        if (!f.alive && !decided) continue;
        if (!bodyInBand(trialCam, id, f, FRAME_TARGET - 0.06)) return false;
      }
    }
    return true;
  };
  /*
   * …AND THE BAND MAY NOT BUY A DISTANCE AT WHICH THERE IS NOTHING TO SEE.
   *
   * The bisection's ceiling was 44 m flat, and on a page whose HUD leaves a
   * SHORT band it went there: `live-visitor.png` (the invitation card docks
   * in the bottom column, so `measureHud` reports a band a third of the
   * frame) came back with both fighters inside a 193 × 90 px box — 1.3 % of
   * the picture, jammed in the left third, with the right 740 px carrying no
   * fighter, no mark and nothing but plaza. The owner's page, same solver,
   * same frame size, framed its pair at 165 × 364. A stranger's first view of
   * this product was a fight they could not see.
   *
   * The two rules were pulling against each other exactly as they did on the
   * result beat (see `sizeCap` in the establishing shot, which is the same
   * argument): the band asks the eye to retreat and there is no distance at
   * which a 40 px fighter is worth framing. So the retreat stops at the
   * distance where the taller body still subtends `PAIR_TALL` of the frame —
   * 0.24 ndc, about 108 px at 900 and 12 % of the height, which is the bar
   * the reading set for a pair. Past it the band solve has no answer to find,
   * only a smaller fighter, and the rescue loop at the end of this function
   * is still the guarantee that neither of them leaves the picture.
   */
  const PAIR_TALL = 0.24;
  const bandCap = (() => {
    const h = Math.max(bodies.blue?.top ?? bodies.blue?.height ?? 2, bodies.orange?.top ?? bodies.orange?.height ?? 2);
    const slant = h / Math.max(0.05, PAIR_TALL * Math.tan((camera.fov * Math.PI) / 360));
    const rise = Math.max(0, camState.height - 1.6);
    return THREE.MathUtils.clamp(Math.sqrt(Math.max(1, slant * slant - rise * rise)), distMin, 44);
  })();
  let bandNeed = targetDist;
  if (!fitsAt(targetDist)) {
    let lo = targetDist, hi = Math.max(targetDist, bandCap);
    /* ten halvings: 3 cm over the 31 m bracket. At six the answer was
       quantised to 0.4 m and jittered frame to frame, and the servo's first
       step toward each new value was itself a 200 m/s² event. */
    if (fitsAt(hi)) for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (fitsAt(m)) hi = m; else lo = m; }
    bandNeed = hi;
  }
  /* The band's answer moves as fast as a body moves in depth — a dash is a
     step in it — and fed raw to the servo it saturated the 26 m/s cap from
     rest (1 560 m/s² in one frame) several times a fight. Eased first, at
     less than the servo's own rates, the servo sees a slope it can follow;
     the 0.10 ndc margin above pays for the lag, and the rescue below is
     still the guarantee. Widening 6, tightening 2, as everywhere else the
     wide direction is the safe one. */
  camState.bandNeed = snap || !camState.bandNeed ? bandNeed
    : camState.bandNeed + (bandNeed - camState.bandNeed) * ease(bandNeed > camState.bandNeed ? 6 : 2);
  targetDist = Math.max(targetDist, camState.bandNeed);
  /*
   * Pull back fast, close in slow.
   *
   * A blink moves a body 7.5 m in one tick, so `sep` and `targetDist` step
   * discontinuously while `camState.dist` is still easing. At a symmetric 2.6
   * the eye is roughly half a second behind the jump, and half a second is long
   * enough to push the fighter who just teleported past `FRAME_EDGE` -- measured
   * on the long-match seeds, where the blinker reached |ndc| 0.992 and the
   * framing assertion fired. The teleport is also the single most watchable
   * thing a fighter does, so losing the frame exactly there is the worst
   * possible time to lose it.
   *
   * Widening is the safe direction: it can only ever show more of the arena, so
   * it can be near-immediate. Tightening is the direction that pumps -- it is
   * what made the shot breathe in and out around every passing block -- so it
   * keeps the old rate. The asymmetry leaves a mild bias toward the wider shot,
   * which is the bias a 1v1 wants.
   *
   * Measured, when this went in, on eight long-match seeds of l1 vs l3 alone:
   * 1 of 8 lost a fighter at |ndc| 0.992 -> 0 of 8, worst 0.792. That was one
   * pairing, and the comment that stood here read as though it were the system.
   * It was not: the same asymmetry over six pairings (l1/l3, l1/l4, l3/l1,
   * l1/l6, l2/l5, l4/l2, seeds 101 and 202) still put a body past FRAME_EDGE in
   * 1 match of 12 — rare per frame, 1 in 12 per MATCH, and a viewer counts
   * matches. The ease is right and it is not sufficient; what closes the gap is
   * the framing servo at the end of this function.
   */
  /*
   * Eased, then speed-limited.
   *
   * The asymmetry above is what keeps a 7.5 m blink in frame, and it works --
   * but at rate 9 the first frame after a teleport moved the eye 2.4 m on its
   * own, which reads as a lurch even though the framing is correct. Capping the
   * dolly at 26 m/s spends about a third of a second covering the same blink
   * instead of a single frame, and leaves the slow direction untouched: the cap
   * is far above anything the 2.6 ease ever asks for.
   */
  /* Пол от спасения: пока он стоит, сервопривод не имеет права тянуть камеру
     обратно внутрь — иначе спасение и сервопривод дерутся каждый кадр. */
  if (camState.rescueTo) targetDist = Math.max(targetDist, camState.rescueTo);
  const stepDist = (targetDist - camState.dist) * ease(targetDist > camState.dist ? 9 : 2.6);
  /*
   * The cap does not apply to the snap, because the snap is not a dolly.
   *
   * `ease()` returns 1 on the first frame of a match, which plants the azimuth,
   * the height and the look-at — but the cap sat outside that and held the
   * DISTANCE to 26 m/s, so the eye crawled out from wherever the last fight
   * ended while the new one had already started 31 m apart. That is exactly the
   * "shot from wherever the last one ended" the snap exists to prevent, and it
   * was a real assertion failure, not a theoretical one: over 12 back-to-back
   * matches (l1/l3, l1/l4, l3/l1, l1/l6, l2/l5, l4/l2 at seeds 101 and 202) the
   * framing assertion fired at t=0.0 s in 8 of them, worst |ndc| 1.46 — a body
   * half a screen outside the picture on the opening frame. 0 of 12 after.
   * Only the first frame of a match is exempt; every dolly move still caps.
   */
  const capDist = snap ? Infinity : 26 * gain * dt;
  camState.dist += THREE.MathUtils.clamp(stepDist, -capDist, capDist);
  /*
   * Rise, and step sideways, when something is in the way.
   *
   * Six 3.2 m boxes and four 4 m walls at this elevation occlude often, and
   * pulling the camera in and out every time one crosses the line pumps the
   * shot. Climbing over is invisible and usually enough; when it is not — a body
   * directly behind a long block — a small orbit is. Both candidates are tested
   * before committing so the camera never rotates toward a worse view, and the
   * nudge is blended rather than snapped.
   *
   * The count is now 0..6 (three heights on each of two bodies) instead of 0..2,
   * so climbing and stepping also answer the case that used to read the same as
   * clear: one fighter half behind something. What the eye can NOT clear is a
   * wall — 18.1% of fully-hidden frames over 25 498 are one wall covering all
   * three heights, and no azimuth inside a closed room escapes a 40 m slab —
   * nor a body pressed against a 3.2 m block a metre away. Both of those are
   * what the fade and the silhouette are for; this loop only buys the cases an
   * orbit or a climb can actually win.
   */
  const hiddenAt = (az, h) => eyeHides(az, camState.dist, h, camState.look, a, 'blue')
    + eyeHides(az, camState.dist, h, camState.look, b, 'orange');
  const here = hiddenAt(camState.az, camState.height);
  const blocked = here > 0;
  let wantOrbit = 0;
  if (blocked) {
    const left = hiddenAt(camState.az - 0.7, camState.height);
    const right = hiddenAt(camState.az + 0.7, camState.height);
    /*
     * A whole sample point better, not merely different.
     *
     * `hiddenAt` counts hidden samples out of six, so `left < here` fires on a
     * one-sample flicker that the next frame undoes — and with the walls now in
     * the occlusion set, `blocked` is true far more often and a 40 m wall is
     * never actually escapable, so the tie case is the common case. Measured on
     * one match it was stepping the azimuth 13 degrees inside a single frame.
     * Demanding a full point of improvement leaves the orbit for the cases an
     * orbit can win and stops it hunting around the ones it cannot.
     */
    if (left <= here - 1 || right <= here - 1) wantOrbit = left <= right ? -0.7 : 0.7;
  }
  /*
   * The orbit RATE is eased too, and for the same reason the cover term is.
   *
   * `wantOrbit` used to be added to the azimuth directly, which made it a
   * 0.84 rad/s angular velocity switched on and off between one frame and the
   * next. Measured with a metric that survives a dropped frame — the per-frame
   * jump in angular velocity, |dw| in rad/s, which converges as dt shrinks
   * where a raw per-frame second difference does not — that switch is the most
   * common discontinuity in this camera: over 24 matches and 26 830 rendered
   * frames at a fixed 60 Hz it put |dw| past 0.2 rad/s on 1 507 of them, p99
   * 0.852 rad/s, which at a 20 m shot is 17 m/s of lateral eye speed appearing
   * inside one frame.
   *
   * Fast on, slow off, like the occluder fade above and for the same reason:
   * being late to escape is the only way the escape can fail, and the release
   * edge buys nothing by being instant. At 25/4 the jerk frames fall to 529 and
   * p99 to 0.285 rad/s. It is not free — the eye reaches its escape angle a
   * little later, and fully-hidden fighter-frames go 9.9% -> 10.2% over the
   * same 24 matches (hidden at all, 18.6% -> 18.9%) — but every one of those
   * frames has the silhouette up, because `updateOcclusion` raises the ghost on
   * exactly the same three-of-three test. Rate 1.1, which is what `cover` uses,
   * buys only 0.1 rad/s more and costs 13.2% fully hidden; 40/8 costs 10.0% and
   * leaves p99 at 0.398. 25/4 is the knee of that curve.
   */
  camState.orbit += (wantOrbit - camState.orbit) * ease(Math.abs(wantOrbit) > Math.abs(camState.orbit) ? 25 : 4);
  camState.az += camState.orbit * (1 - Math.exp(-1.2 * dt));
  /*
   * Cover is eased, not switched.
   *
   * This used to read `blocked ? 0.62 : 0.42` off a boolean recomputed every
   * frame. At a 20 m shot that is a four-metre step in the target height, and
   * `blocked` flickers whenever a body grazes the edge of a block: measured
   * over 775 frames the eye swung between 8.61 m and 20.49 m and reversed
   * direction 35 times in 22 seconds, which is the "camera shakes" a viewer
   * reports. Dropping the term entirely cut the mean height jerk 0.01707 ->
   * 0.00387, so this is three quarters of it. Easing a continuous `cover`
   * instead keeps the climb — a blocked shot still rises — and spends about a
   * second doing it rather than one frame.
   */
  camState.cover += ((blocked ? 1 : 0) - camState.cover) * ease(1.1);
  const wantHeight = eyeAt(camState.dist, camState.aimY, camState.cover);
  /* Down at the tightening rate (2.6), up at 1.4: descending slower than
     the distance closes left the eye above its curve for a second on every
     tightening, which is more pitch than the band solve planned for and
     the near body's feet under the name row. */
  camState.height += (wantHeight - camState.height) * ease(wantHeight < camState.height ? 2.6 : 1.4);
  camState.aimY += (aimFor(mid.y, camState.dist, camState.height) - camState.aimY) * ease(12);

  /*
   * The bias, tried before it is committed to.
   *
   * `affordable` is honest arithmetic about the frame's WIDTH and blind to its
   * height, and in this shot those are different problems: the eye is tilted
   * down, so a bias that happens to land along the view axis moves a body up or
   * down the picture by an amount that depends on how much nearer it is than
   * the aim point. Modelling that is a page of trigonometry; projecting the
   * candidate is four lines. So the eased look-at is built, both bodies are
   * projected through a stand-in camera placed exactly where this one is about
   * to go, and the pull is halved until they fit — or abandoned. Five trials at
   * most, almost always none, and the frame that needs one is the frame the
   * whole bias exists for. Caught a corner at (-18.7, -14.4) that the width
   * arithmetic passed and the picture dropped off the bottom edge.
   */
  const eased = ease(7);
  const holds = (look, edge = FRAME_TARGET) => {
    trialCam.fov = camera.fov; trialCam.aspect = camera.aspect;
    trialCam.updateProjectionMatrix();
    trialCam.position.set(
      look.x + Math.sin(camState.az) * camState.dist,
      camState.height,
      look.z + Math.cos(camState.az) * camState.dist,
    );
    trialCam.lookAt(look.x, camState.aimY, look.z);
    trialCam.updateMatrixWorld();
    for (const [id, f] of pair) {
      // A dead fighter is dropped while the fight is live — the corpse is not
      // what the shot is about — and kept once it is decided, because then it
      // is exactly what the shot is about. Gated on the frame's own flag, not
      // on the socket's `over` message: that message is 2.6 s of curtain late,
      // which is the whole death animation and topple.
      if (!f.alive && !decided) continue;
      if (!bodyInBand(trialCam, id, f, edge)) return false;
    }
    return true;
  };
  let pull = affordable(halfFrameAt(camState.dist));
  let look = camState.look.clone().lerp(aimAt(pull), eased);
  for (let i = 0; i < 5 && pull > 0.002 && !holds(look); i++) {
    pull = i === 4 ? 0 : pull * 0.5;
    look = camState.look.clone().lerp(aimAt(pull), eased);
  }
  camState.look.copy(look);

  /*
   * Give up the bias and the frame still does not hold? Then back off.
   *
   * The loop above can only surrender the wall bias; when the trial fails at
   * pull 0 the shot commits anyway, and that is the one path by which this
   * camera loses a fighter. It is rare — over 12 matches and 16 573 live
   * fighter-frames across l1/l3, l1/l4, l3/l1, l1/l6, l2/l5 and l4/l2, one frame
   * crossed FRAME_EDGE (|ndc| 0.941) and none left the picture — but a viewer
   * counts matches, not frames, and that was 1 match in 12. The comment this
   * replaces claimed the case was measured away on eight seeds of ONE pairing,
   * which is how it came back.
   *
   * Steps of 8% until it holds, at most four (+36% in one frame), rather than a
   * closed-form solve: the fault is always that an ease is lagging something —
   * a 7.5 m blink, a corner pull, the near body dropping down a tilted frame —
   * and stepping the projection is the same four lines the bias trial above
   * already uses. One step per frame was tried first and let a blink through at
   * |ndc| 0.96 on seed 808 (l1 vs l3, t=21.6 s): the body outran it for a frame.
   * Four steps cannot pump the shot, because the loop stops the moment the frame
   * holds and these frames are rare — 1 in 13 matches reached the edge at all.
   * 44 m is past the 34 m clamp on purpose: that clamp is a taste limit, this is
   * the limit past which a fighter is off screen.
   *
   * After, over 20 matches and 20 815 live fighter-frames on those six pairings
   * plus the two seeds that had failed: 0 frames past FRAME_EDGE, worst |ndc|
   * 0.859, no framing assertion. The shot did not get wider to buy it — mean
   * distance 18.2 m and the servo never once reached even the 34 m clamp, let
   * alone this cap.
   */
  /*
   * ── СПАСЕНИЕ ПЕРЕСТАЛО БЫТЬ РЫВКОМ ────────────────────────────────────────
   *
   * Этот цикл множил `camState.dist` на 1.08 до четырёх раз ЗА ОДИН КАДР, в
   * обход сервопривода и его потолка в 26 м/с. На восемнадцати метрах это
   * ×1.36 — плюс шесть с половиной метров за 16.7 мс, то есть скорость около
   * 390 м/с из нуля. Замерено `tools/checkcamera.mjs`: вторая разность
   * дистанции доходила до 19643 м/с² при медиане 3.1, и таких кадров 188 из
   * 52576. Это и есть «камеру дёргает»: почти всегда гладко и изредка рывком.
   *
   * Отменить спасение нельзя — оно единственное, что держит бойца в кадре, и
   * `tools/checkframing.mjs` стоит именно на этом. Но между «пора спасать»
   * (`FRAME_TARGET` 0.88) и «боец потерян» (`FRAME_EDGE` 0.92) есть запас, и
   * этого запаса хватает, чтобы доехать за несколько кадров вместо одного.
   *
   * Поэтому цикл теперь считает, КУДА надо, а не прыгает туда. Требуемая
   * дистанция запоминается как пол для сервопривода (`camState.rescueTo`),
   * иначе на следующем кадре обычный сервопривод потянул бы обратно и всё
   * повторилось бы; а сам шаг ограничен `RESCUE_RATE`. Пол снимается, как
   * только кадр снова держится.
   */
  const beforeRescue = camState.dist;
  /* Считается ДО цикла: `holds` читает `camState.dist` из замыкания, а цикл её
     меняет — спросив после, спрашиваешь про уже спасённый кадр и всегда
     получаешь «держится». Ровно на этом кадрирование теряло бойца на телепорте
     в 7.5 м: замер сказал |ndc| 1.118 на t=4.0 с. */
  const lost = snap || !holds(camState.look, FRAME_EDGE);
  /* Four steps (+36 %) while the frame is merely past the target; as many as
     it takes once it is LOST — a blink can land a body a few metres from the
     eye, whose feet then need ~2.5× the distance to clear the band's bottom,
     and a lost frame jumps anyway (below): more steps in that jump cost no
     extra motion, and stopping short of the frame is the one failure this
     loop exists to close. */
  for (let i = 0; i < (lost ? 16 : 4) && camState.dist < 44 && !holds(camState.look); i++) {
    camState.dist = Math.min(44, camState.dist * 1.08);
  }
  if (camState.dist > beforeRescue) {
    camState.rescueTo = Math.max(camState.rescueTo || 0, camState.dist);
    /*
     * ЗАПАС ЕСТЬ — ЕДЕМ ПЛАВНО. ЗАПАСА НЕТ — ПРЫГАЕМ.
     *
     * Спасение срабатывает по `FRAME_TARGET` (0.88), а провалом считается
     * `FRAME_EDGE` (0.92). Пока боец в этом зазоре, у камеры есть несколько
     * кадров, и рывок не нужен. Как только он ВЫШЕЛ за 0.92 — торговаться не о
     * чем: кадр уже потерян, и плавность потерянного кадра никому не нужна.
     *
     * Без этого различения замер сразу это и показал: ограничение скорости
     * без исключения стоило одного потерянного бойца на 36 прогонах
     * (l2/l5, сид 808, t=0.2 с, глаз уже на 34 м). Первый кадр матча — тот же
     * случай: `snap` это склейка, а не движение.
     */
    if (!lost) camState.dist = Math.min(camState.dist, beforeRescue + RESCUE_RATE * dt);
  } else if (camState.rescueTo && camState.dist >= camState.rescueTo - 0.05) {
    camState.rescueTo = 0;
  }

  /*
   * ТРЯСКА — МОДЕЛЬ ТРАВМЫ (решение основателя 02.09), ПОСЛЕ решателя.
   *
   * `trauma` копится ударами до единицы и спадает линейно; сила — квадрат:
   * мелкие удары почти не трясут, большой трясёт по-настоящему. Смещение
   * идёт по ОСЯМ ЭКРАНА уже поставленной камеры плюс крен до двух градусов,
   * суммой синусов на несоизмеримых частотах — так это не читается как
   * дрожь одной пружины. В след камеры (`checkcamera` судит `dist/height/az`)
   * тряска не попадает: судят решатель, а не удар. `shake` — прежняя ось,
   * оставлена для автора IR (`MAX_SHAKE`) и гейта кадрирования.
   */
  camState.trauma = Math.max(0, (camState.trauma || 0) - dt * 1.7);
  camState.shake = Math.max(0, camState.shake - dt * 2.4);
  const k = camState.trauma * camState.trauma + camState.shake * camState.shake;
  const t = performance.now() / 1000;
  camera.position.set(
    camState.look.x + Math.sin(camState.az) * camState.dist,
    camState.height,
    camState.look.z + Math.cos(camState.az) * camState.dist,
  );
  camera.lookAt(camState.look.x, camState.aimY, camState.look.z);
  if (k > 0.0001) {
    const amp = 0.42 * k * (camState.dist / 26);
    camera.translateX((Math.sin(t * 47) * 0.6 + Math.sin(t * 89 + 1.3) * 0.4) * amp);
    camera.translateY((Math.sin(t * 61 + 1.7) * 0.6 + Math.sin(t * 103 + 0.4) * 0.4) * amp * 0.7);
    camera.rotateZ((Math.sin(t * 53 + 3.1) * 0.6 + Math.sin(t * 71) * 0.4) * 0.03 * k);
  }
}

/**
 * The one way this camera fails without looking like it failed.
 *
 * Every other framing mistake announces itself the moment you glance at the
 * screen. Losing a fighter off the edge does not: the shot stays composed, the
 * HUD keeps moving, and what reads as broken is the FIGHT — a body that
 * vanishes and teleports back in from nowhere. So both of them are projected
 * every frame and the first frame that drops one says so. `FRAME_EDGE` rather
 * than 1.0 because a body is two metres wide and its shoulder leaves the frame
 * well before its centre does.
 *
 * Once per match, not per frame: the failure is a run of hundreds of
 * consecutive frames, and `fail` appends to a box that never scrolls.
 */
let framingLost = false;
function checkFraming(view, t) {
  if (framingLost || performance.now() / 1000 - camCutAt < 0.6) return;
  // `project` reads `camera.matrixWorldInverse`, which the renderer only
  // refreshes at draw — without this the assertion grades the previous frame's
  // camera against this frame's positions and reports phantoms during a snap.
  camera.updateMatrixWorld();
  for (const id of ['blue', 'orange']) {
    const v = view[id];
    // The same rule the framing solves against: the loser counts once the fight
    // is decided, so "the banner is on empty floor" is also an assertion
    // failure. On the FRAME's flag rather than the socket message, which closes
    // a 2.6 s blind spot — the death animation and the topple, 154 frames a
    // match. Nothing was actually being lost in there: over 24 kills the corpse
    // reached |ndc| 0.629 unwatched, and 0.714 now that the push-in closes on
    // it, against FRAME_EDGE 0.92 and 0.874 for a live fighter over the same
    // matches. This is about the window being watched at all.
    if (!v || (!v.alive && !decided)) continue;
    /* The same rule the framing solves against — feet and head inside the
       HUD's band, the x edge — at FRAME_EDGE's zero margin. */
    if (bodyInBand(camera, id, v, FRAME_EDGE)) continue;
    framingLost = true;
    _p.set(v.x, v.y + (bodies[id]?.height ?? 2) * 0.5, v.z).project(camera);
    fail(`camera lost ${id} at t=${t.toFixed(1)}s — ndc (${_p.x.toFixed(2)}, ${_p.y.toFixed(2)}), `
      + `band ${hudBand.yBot.toFixed(2)}..${hudBand.yTop.toFixed(2)}, `
      + `body at (${v.x.toFixed(1)}, ${v.z.toFixed(1)}), eye ${camState.dist.toFixed(1)} m out`);
    return;
  }
}

// ---------------------------------------------------------------------------
// the sim -> pose bridge
// ---------------------------------------------------------------------------

/**
 * What the body plays for what the simulation is doing.
 *
 * The phase is remapped per skill so that the visual wind-up occupies the same
 * wall time as the mechanical one. That is the difference between a telegraph a
 * watcher can act on and a decoration: while a body's arms are over its head
 * the cone has not landed yet, and when they come down it has.
 */
/**
 * Доставка -> действие тела.
 *
 * Тела знают словарь поз (`attack`, `fire`, `block`, `signal`…), а не имена
 * умений: имена умений у существа из грамматики свои, и знать их тело не
 * может по определению — набор меняется без перегенерации (F10).
 *
 * Мост между ними — ДОСТАВКА, и это ровно тот же принцип, на котором стоит
 * §9.2: силуэт принадлежит доставке. Луч и снаряд — «выстрел», конус, зона и
 * стена — «удар», рывок — «упор», мигание и умение на себя — «знак».
 *
 * Без этой таблицы существо с набором из грамматики кастовало НЕВИДИМО:
 * `poseAction` знал четыре захардкоженных умения и на всё остальное отвечал
 * «ничего не играть». HUD показывал каст, VFX рисовал конус, а тело в это
 * время просто шло вперёд. Телеграф, который не читается по телу, — это не
 * телеграф, и вся идея «по замаху видно, что сейчас будет» держалась только
 * на двух наших существах.
 */
const ACTION_BY_DELIVERY = {
  beam: 'fire', bolt: 'fire', lob: 'fire',
  cone: 'attack', zone: 'attack', wall: 'attack',
  dash: 'block', blink: 'signal', self: 'signal',
  /* `jump` здесь намеренно ОТСУТСТВУЕТ: он один из девяти не укладывается в
     «одна доставка — один клип». Прыжок это два клипа, `jump` и `land`, и
     граница между ними — конец воздушной фазы, а не середина умения.
     Обрабатывается отдельной веткой в `poseAction`. */
};

/**
 * Разложить прыжок на подъём и приземление.
 *
 * Одна формула на оба прыжка — захардкоженный (`cfg.skills.jump`) и любой из
 * грамматики (`kitLabels[id][name]`): доля времени до касания земли есть
 * (замах + воздух) / всё умение, и по ней клип переключается с `jump` на
 * `land`. Дублировать её было бы приглашением к расхождению, а расхождение
 * здесь читается как «существо приземлилось раньше, чем коснулось пола».
 */
function hopPose(phase, windup, airborne, recover) {
  const total = windup + airborne + recover;
  if (!(total > 0)) return { action: 'jump', phase: Math.min(1, phase) };
  const air = (windup + airborne) / total;
  return phase < air
    ? { action: 'jump', phase: phase / air }
    : { action: 'land', phase: Math.min(1, (phase - air) / (1 - air || 1)) };
}

function poseAction(f, id, now) {
  if (!f.alive) return { action: 'die', phase: Math.min(1, f.phase) };
  if (f.act === 'laser') return { action: 'fire', phase: f.phase };
  if (f.act === 'smash') return { action: 'attack', phase: f.phase };
  if (f.act === 'blink') return { action: 'signal', phase: Math.min(1, f.phase * 1.6) };
  /* Умение из грамматики: имени вьювер не знает, доставку — знает. */
  if (f.act && kitLabels[id] && kitLabels[id][f.act]) {
    const kd = kitLabels[id][f.act];
    if (kd.kind === 'jump') return hopPose(f.phase, kd.windup, kd.airborne ?? 0.55, kd.recover);
    const a = ACTION_BY_DELIVERY[kd.kind];
    if (a) return { action: a, phase: Math.min(1, f.phase) };
  }
  if (f.act === 'jump') {
    const sk = cfg.skills.jump;
    return hopPose(f.phase, sk.windup, sk.airborne, sk.recover);
  }
  if (f.act === 'charge') {
    const sk = cfg.skills.charge;
    const total = sk.windup + sk.dashSeconds + sk.recover;
    const w = sk.windup / total;
    if (f.actPhase === 'windup') return { action: 'block', phase: Math.min(1, f.phase / w) };
    if (f.actPhase === 'recover') return { action: 'land', phase: 0.5 };
    return { action: null, phase: 0 }; // the dash is locomotion, and fast
  }
  if (now < anim[id].hitUntil) {
    return { action: 'hit', phase: 1 - (anim[id].hitUntil - now) / 0.34 };
  }
  return { action: null, phase: 0 };
}

const shortAngle = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

function interpolate(t) {
  if (frames.length === 0) return null;
  if (frames.length === 1) return { a: frames[0], b: frames[0], u: 0 };
  let i = frames.length - 1;
  while (i > 0 && frames[i].t > t) i--;
  const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
  const span = b.t - a.t;
  const u = span > 1e-6 ? THREE.MathUtils.clamp((t - a.t) / span, 0, 1) : 0;
  return { a, b, u };
}

const lerp = (a, b, u) => a + (b - a) * u;

// ---------------------------------------------------------------------------
// the loop
// ---------------------------------------------------------------------------

/**
 * THE BOOT CARD LEAVES WHEN THE FIRST FRAME LANDS, NOT WHEN THE MODULE DOES.
 *
 * `boot.remove()` used to stand right here, at the bottom of module
 * evaluation — which reads as "the renderer is up" and is not the same claim
 * as "there is a picture". Everything between this line and the first
 * `post.render()` still had to work: the loop, the scene graph, the post
 * pipeline compiling on the driver. If any of it did not, the card that says
 * `CONNECTING TO THE ARENA` had already been deleted, and what a visitor got
 * instead was a flat, silent, motionless ground — the exact picture round one
 * photographed on `create-visitor`, where §1.8's "one uninterrupted
 * experience over the persistent arena" has to begin.
 *
 * So the card stays until a frame is genuinely on the screen, and it stays on
 * the veiled Create ground as well as on live. Two ways out, one per host:
 *
 *  - Inside the product shell the card belongs to `screens/live.js` (the orbit
 *    canvas is its animation and it watches this element to know when to stop
 *    it, §5.1). So the viewer FADES it with the class the shell already reads
 *    and leaves the node in the DOM — deleting it made the shell's own
 *    `classList.add('off')` a no-op and left its orbit running against a
 *    detached canvas.
 *  - On the standalone viewer page nothing else owns it, so it is removed.
 *
 * A frame deliberately not drawn (a document screen covers the arena) counts
 * as landed. The alternative is a full-screen card sitting under an opaque
 * document for as long as the player stays on it, eating the clicks that fall
 * between the screen's own children.
 */
let bootGone = false;
function bootLanded() {
  if (bootGone) return;
  bootGone = true;
  /* The shell's clock (`app.js` marks) gets the one instant it cannot see
     from outside: the first frame PRESENTED on the canvas. `firstFrame`
     there is the first socket frame, which says nothing about the picture. */
  if (typeof window !== 'undefined' && window.__airenaMarks && !window.__airenaMarks.firstDraw) {
    window.__airenaMarks.firstDraw = Math.round(performance.now());
  }
  if (document.getElementById('arena')) boot.classList.add('off');
  else boot.remove();
}
let last = performance.now() / 1000;

/**
 * The loop, with its first throw made visible.
 *
 * `setAnimationLoop` swallows an exception into the console and keeps calling,
 * so a single bad frame becomes a page that renders a static arena, accepts
 * clicks, reports no error and does nothing — which is indistinguishable from
 * a dead socket and cost an hour once already.
 */
let loopFailed = false;
if (params.get('shots')) {
  const oct = params.get('oct'), gor = params.get('gor');
  if (oct) $('#sel-oct').value = oct;
  if (gor) $('#sel-gor').value = gor;
  const n = Number(params.get('n') || 20);
  const every = Number(params.get('every') || 1.1) * 1000;
  const prefix = params.get('prefix') || 'match';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /*
   * Strictly sequential. `shoot` holds one slot that the render loop drains,
   * so two overlapping calls lose one of them and leave a promise that never
   * settles — which an interval-driven capture produces on its first slow
   * frame. Awaiting each shot before asking for the next removes the race
   * rather than racing more carefully.
   */
  (async () => {
    const done = [];
    startMatch();
    await sleep(500);
    for (let i = 0; i < n; i++) {
      let guard = 0;
      while (!frames.length && guard++ < 50) await sleep(150);
      if (!frames.length) break;
      const t = frames[frames.length - 1].t;
      done.push(await shoot(`${prefix}-${String(i).padStart(2, '0')}-t${t.toFixed(1).replace('.', '_')}`));
      if (over) break;
      await sleep(every);
    }
    // Left in the DOM, which a devtools console in an isolated world can read.
    const tag = document.createElement('div');
    tag.id = 'shots-done';
    tag.textContent = JSON.stringify(done);
    tag.style.display = 'none';
    document.body.appendChild(tag);
    document.title = `Airena — ${done.length} shots`;
  })();
}

/*
 * СЧЁТЧИК КАДРОВ — ЗАМЕР, А НЕ УКРАШЕНИЕ.
 *
 * `docs/STAGE5-LOOK.md` признаёт, что боевой fps не измерен ни разу: он
 * снимался руками на одной машине, и гейта под него нет. С появлением
 * постобработки (D163) это перестало быть терпимым — bloom добавляет проходы,
 * и «стало красиво» без числа рядом ничего не значит.
 *
 * Скользящее окно в одну секунду; наружу отдаётся последнее и минимальное.
 * Минимум важнее среднего: провал в 20 fps на полсекунды виден глазом, а в
 * среднем за минуту его не видно вовсе.
 */
/*
 * `min` начинается с НУЛЯ, а не с бесконечности, и сбрасывается на каждом бою.
 *
 * Бесконечность не переживает JSON — снаружи она приходит как `null`, то есть
 * прибор молчал ровно там, где его спрашивают. А минимум, взятый от загрузки
 * страницы, ловит секунду компиляции конвейеров и любую секунду троттлинга:
 * это худшая секунда БРАУЗЕРА, а не худшая секунда боя.
 */
const fps = { last: 0, min: 0, frames: 0, since: performance.now() };
window.__airenaFps = fps;

/**
 * ONE THROW MUST NOT COST THE PICTURE.
 *
 * The loop used to be a single `try { frame() }`. `frame()` reads the socket
 * buffer, poses two bodies, ticks the effects layer and THEN draws — so any
 * exception at all, from anywhere in that first four fifths, returned before
 * the draw and left the arena frozen on whatever pixels happened to be in the
 * canvas. Round one photographed it: `create-visitor` reported
 * `TypeError: Cannot read properties of undefined (reading 'abs')` once and
 * showed a flat empty ground behind the veil, where the owner's identical
 * screen showed the live arena. The very first thing a stranger sees was a
 * still page, and §1.8's "one uninterrupted experience over the persistent
 * arena" was over before it started.
 *
 * So the two halves are separated and each is caught on its own. If the state
 * update throws, the world is a frame stale and IT STILL DRAWS — a fight that
 * stops advancing is a bug, a page that stops moving is a dead product. If the
 * draw itself throws, the state still advances and the next frame gets its own
 * chance; a driver hiccup on one frame is not a reason to stop trying.
 *
 * Each half reports its FIRST failure and then goes quiet. Sixty identical
 * stack traces a second is not diagnosis, it is a second failure on top of the
 * first one — and the report is what a capture reads (`tools/shots.mjs`), so
 * it has to arrive exactly once.
 */
let drawFailed = false;
let postFailed = false;
/* Once per match: swap every generated body for the side's stock body. */
let quarantined = false;
function quarantineBodies(reason) {
  if (quarantined) return false;
  quarantined = true;
  let did = false;
  for (const id of ['blue', 'orange']) {
    const key = bodyRefOf[id] || '';
    if (!/^gen:/.test(key)) continue;
    const [ref, size] = key.split('@');
    dispatchEvent(new CustomEvent('airena:bodyfail', { detail: { side: id, ref, message: `render failed: ${reason}` } }));
    console.warn(`body ${ref} failed while rendering; ${id} falls back to ${STOCK_BODY[id]}:`, reason);
    /* hidden at once, so the frame drawn right after this shows everything
       else while the stock body is fetched from the cache */
    if (bodies[id]) bodies[id].root.visible = false;
    swapBody(id, STOCK_BODY[id], Number(size) || 1);
    did = true;
  }
  return did;
}
/**
 * TAKE BOTH FIGHTERS OUT OF THE SCENE, not merely out of sight.
 *
 * `quarantineBodies` hides `root` and asks for a stock body; neither is
 * enough for the frame that is about to be drawn in the same catch. `visible
 * = false` stops the render-list traversal at that node but does not remove
 * the node, and on a backend that builds its render objects lazily the object
 * that threw is still reachable — which is precisely what `live-visitor.json`
 * recorded: the post render threw, the direct render threw too, and the page
 * presented nothing at all.
 *
 * So this detaches. Called only from the render catch, once the throw has
 * repeated, and it is not a state the session recovers from by itself: the
 * stock body `quarantineBodies` asked for is a NEW root and `swapBody` adds
 * it to the scene when it lands, so the arena comes back with fighters in it
 * one swap later. Idempotent — a detached root has no parent and `remove` on
 * it is a no-op.
 */
function evictBodies() {
  if (evicted) return;
  evicted = true; evictions++;
  evictedRoots.clear();
  for (const id of ['blue', 'orange']) {
    const root = bodies[id]?.root;
    if (!root) continue;
    evictedRoots.set(id, { root, visible: root.visible, had: !!root.parent });
    root.visible = false;
    try { scene.remove(root); } catch { /* already detached */ }
  }
  console.warn(`both bodies detached from the scene after a repeated render throw (${evictions})`);
}
/**
 * …AND THE EFFECT LAYER GOES WITH THEM.
 *
 * `evictBodies` walks the two fighters and nothing else, and the fighters are
 * not the only thing in the scene that can carry a lazily-built material: so
 * can every mesh `spawnFx` puts on stage. `vfx.js`'s own rollback covers a
 * module that throws SYNCHRONOUSLY inside `play`; the failure this whole path
 * exists for throws inside `post.render()`, where `play` has already returned
 * cleanly and nothing is quarantined. A broken emitter therefore reproduces
 * the exact page this round fixed for bodies — the throw repeats, `blank`
 * climbs, and the canvas is presented transparent — and the only reason no
 * capture has shown it is that this time the throw came from a body.
 *
 * Effects are transient by construction, so unlike the fighters they are not
 * put back: losing what is on stage costs one cast. Removed from the scene
 * and dropped from the pool, without disposing — a geometry marked `shared`
 * belongs to the pool that made it, and a session that is already failing is
 * the wrong place to free something someone else may still hold.
 */
function evictFx() {
  if (!fxPool.length) return;
  const n = fxPool.length;
  for (let i = fxPool.length - 1; i >= 0; i--) {
    try { scene.remove(fxPool[i].obj); } catch { /* already detached */ }
    fxPool.splice(i, 1);
  }
  console.warn(`${n} effect meshes swept from the scene after a repeated render throw`);
}
/**
 * …AND PUT BACK BY THE FIRST FRAME THAT RENDERS.
 *
 * Not every repeated throw is a bad body. The capture that made this path
 * necessary carries `parameter 1 is not of type 'GPURenderPipeline'` — a
 * pipeline still compiling when the sync path reached it, which passes on its
 * own — and leaving the fighters out of a match because of two transient
 * frames would trade a blank page for an empty arena, the same mistake in the
 * other direction. So a frame that renders takes them back, and a throw that
 * returns takes them out again. `EVICT_MAX` bounds the oscillation: after
 * three rounds of it the fault is not transient, and the arena keeps the
 * picture it can draw until the next `match` or the next `swapBody`.
 */
function restoreBodies() {
  /* PAST THE BUDGET THEY STAY OUT. The polarity matters and it was wrong the
     first time: refusing to EVICT after three rounds left the throwing body in
     the scene for ever, which is the blank frame with the fighters in it —
     `drawn.blank 47` in the capture that caught it. Refusing to RESTORE is the
     rule the budget was for. */
  if (!evicted || evictions >= EVICT_MAX) return;
  evicted = false;
  for (const [id, e] of evictedRoots) {
    /* Only if this side still stands on the same body: a `swapBody` that
       landed while the eviction was up has already put its own root in the
       scene, and this one is the retired one. */
    if (bodies[id]?.root !== e.root) continue;
    if (e.had && !e.root.parent) scene.add(e.root);
    e.root.visible = e.visible;
  }
  evictedRoots.clear();
}
/**
 * QUALITY AUTO-SELECT (RENDER-QUALITY §7): the environment's own governor.
 *
 * `qualityGovernor` keeps a rolling mean of the frame's wall-clock delta over
 * the last 120 frames after a 40-frame warm-up (the pipeline compiles and the
 * bodies building are the browser's worst seconds, not the frame's) and only
 * ever DEMOTES: two seconds under 45 fps → 'medium' (no AO, no reflection),
 * under 30 → 'low' (FXAA, the shadow map to 1024). Never up — a fight must
 * not flicker between graphs. It is HELD while a fight is on the screen and
 * released at the boundary (searching, the result), so a graph rebuild —
 * itself a stall — never lands mid-fight; the pending tier applies at the
 * next boundary. Ticked next to `env.update` in `drawFrame`, never with a
 * frame longer than 250 ms (a throttled tab is the browser choosing not to
 * draw, not a slow frame) and never while the document is hidden. A
 * `?quality=` pin switches it off. `gov.msPerFrame` is what the captures
 * carry.
 */
/*
 * THE METER READS WALL-CLOCK DELTAS, AND UNDER VSYNC THAT IS THE DISPLAY'S
 * PERIOD, NOT THE FRAME'S COST. On a 30 Hz external display an idle GPU
 * measures 33 ms every frame — 30 fps < 45 — and after the 2 s dwell the page
 * would demote itself to `medium` for good. So the thresholds follow the
 * display: the shortest delta the loop has seen is its cadence (accepted
 * only if it is a plausible refresh, ≥ 30 Hz — a machine that never once
 * drew a fast frame is slow, not a slow display), and the demotion lines are
 * 75 % and 50 % of that rate, capped at the 45/30 the module ships. The
 * governor reads `demote` on every tick, so the object is shared and mutated.
 */
/**
 * WHAT THE FRAME COSTS, MEASURED IN THE GAME — `window.__airenaStats`.
 *
 * The boot gate (`tools/checkboot.mjs`) weighs BYTES, and it is green on
 * bytes; nothing in the repo measured what the frame costs once the arena is
 * up. Every capture beside it said the same two things — `fps.ticks` 0 and
 * `msPerFrame` null — because the governor's own meter only reports after 160
 * frames and the capture harness had not ticked the page that far, so "the
 * picture is at 'high'" was recorded with no idea what 'high' was costing.
 *
 * So the page keeps its own rolling mean over the last 120 drawn frames, of
 * BOTH numbers that matter and are not the same number:
 *
 *  - `msPerFrame` / `fps`: the wall-clock delta between draws. Under vsync
 *    this is the display's cadence when there is headroom and the real cost
 *    when there is not — a ceiling, not a cost.
 *  - `drawMs`: the main-thread cost of the draw call itself. This one moves
 *    with the tier whether or not the display is capping the rate, and it is
 *    what the climb below reads.
 *
 * Reported from 24 samples so a capture that ticked the page for a handful of
 * frames still carries a number, and reset on every tier change: a mean that
 * spans two graphs describes neither.
 */
const STAT_WIN = 120;
const statRing = { dt: new Float64Array(STAT_WIN), draw: new Float64Array(STAT_WIN), i: 0, n: 0, sumDt: 0, sumDraw: 0 };
const stats = { msPerFrame: null, fps: null, drawMs: null, samples: 0, frames: 0, tier: quality, displayHz: null, window: STAT_WIN };
window.__airenaStats = stats;
function statsReset() {
  statRing.i = 0; statRing.n = 0; statRing.sumDt = 0; statRing.sumDraw = 0;
  stats.msPerFrame = null; stats.fps = null; stats.drawMs = null; stats.samples = 0;
}
function tickStats(dt, drawMs) {
  stats.frames++;
  if (document.hidden || !(dt > 0) || dt > 0.25) return;
  const i = statRing.i;
  if (statRing.n >= STAT_WIN) { statRing.sumDt -= statRing.dt[i]; statRing.sumDraw -= statRing.draw[i]; }
  statRing.dt[i] = dt; statRing.draw[i] = drawMs;
  statRing.sumDt += dt; statRing.sumDraw += drawMs;
  statRing.i = (i + 1) % STAT_WIN;
  if (statRing.n < STAT_WIN) statRing.n++;
  stats.samples = statRing.n;
  if (statRing.n >= 24) {
    stats.msPerFrame = (statRing.sumDt / statRing.n) * 1000;
    stats.fps = 1000 / stats.msPerFrame;
    stats.drawMs = statRing.sumDraw / statRing.n;
  }
  stats.displayHz = refreshDt <= 0.034 ? Math.round(1 / refreshDt) : null;
}

const demote = { medium: 45, low: 30 };
let refreshDt = Infinity;
/* A hidden tab's rAF is the browser choosing not to draw; whatever cadence was
   learned before it went away may not be the cadence it comes back to (a
   window dragged to another display, a laptop off its dock). Relearn. */
if (typeof document !== 'undefined') addEventListener('visibilitychange', () => { refreshDt = Infinity; });
/** Move the whole page to a tier: the environment's rig now, the graph next load. */
/*
 * ── A TIER CHANGE HAS TWO HALVES AND THEY LAND AT DIFFERENT TIMES ─────────
 *
 * The environment's half (`env.setQuality` — shadow map size, instancing,
 * dust, the sun shafts, the mist, the two far skylines, the floor reflector)
 * is cheap, safe and immediate. It is also the larger part of the cost.
 *
 * The post graph's half is not, and this is the round it stopped pretending.
 * `applyPost` rebuilt the pass in place, and a rebuild has never once drawn a
 * frame: `high` writes four MRT attachments and `medium` three, and a shader
 * variant compiled against the old layout drops the whole command buffer. The
 * split in the capture set was total — 12 sidecars at `"high"` all a picture,
 * 4 at `"medium"`/`"low"` all a BLACK canvas — and it survived both repairs
 * (`renderAsync` warm, whole-scene variant invalidation). The fault is inside
 * three's node cache and it is not repairable from here.
 *
 * The half-acting version was the worst of the three possible answers: the
 * environment moved, the graph did not, and `window.__airenaQuality` reported
 * a tier the picture was not drawn at — so "fps >= 30 at medium" could not be
 * read off any capture this repo has ever taken. So the graph's half is
 * DEFERRED rather than faked. The tier is written to `localStorage` and the
 * next page load builds the graph at it (see the boot pick beside
 * `initialQuality`), which is the one path that works; `__airenaPostTier`,
 * written by `applyPost`, is the graph's own answer beside the variable's.
 *
 * A session therefore ends at a tier and the next one starts there. That is
 * slower to converge than a live rebuild and it is the honest version of it:
 * one machine, one measurement, one page load.
 */
function setTier(q, why) {
  console.info(`quality: ${quality} \u2192 ${q} (${why}) \u2014 the post graph takes it at the next load`);
  quality = q;
  window.__airenaQuality = quality;
  stats.tier = quality;
  env.setQuality(quality);
  /*
   * AND A MEMORY THAT OUTLIVES THE SESSION HAS TO BE A MEASUREMENT.
   *
   * The governor's own window is 20 ticks (`GOV_TUNE`), which is the right
   * length for "stop the picture stuttering NOW" and far too short to pin a
   * machine's tier for every visit after this one. Measured immediately: the
   * first capture after this went in, `live-visitor` drew 53 frames on a
   * machine running four agents, demoted to 'low' on that, and every state
   * captured after it in the same browser booted at 'low' — the whole
   * evidence set graded at a tier one bad window had chosen. So the write
   * waits for the page's OWN full window (`STAT_WIN` = 120 drawn frames,
   * read before `statsReset` below clears it); under that the drop still
   * lands on the environment for this session and is simply not remembered.
   *
   * Private mode, a blocked origin, a full store: a tier that cannot be
   * remembered is not a reason to stop demoting the half that CAN land.
   */
  if (stats.samples >= STAT_WIN) {
    try { localStorage.setItem(TIER_KEY, q); } catch { /* приватный режим */ }
  }
  statsReset();
}
/**
 * THE CEILING: the best tier this session may still climb to.
 *
 * A demotion is a MEASUREMENT — this machine could not hold that tier — so it
 * closes the door above it for good. That is the other half of the hysteresis:
 * the climb below can lift a conservative START (a phone, a 4K viewport, a
 * pinned-down laptop) at most once per step, and a single measured demotion
 * makes the pair of rules settle instead of oscillating. Without it a machine
 * sitting exactly on the line would rebuild the whole post graph every five
 * seconds, for ever.
 */
let ceiling = 'high';
const onTierDrop = (q) => {
  /*
   * ONE STEP BELOW THE TIER THAT FAILED — not the tier landed on.
   *
   * The module picks its target from the measured rate directly, so a machine
   * running `high` under 30 fps demotes straight to `low` without ever
   * drawing a `medium` frame. Setting the ceiling to `low` there bars `medium`
   * for the whole session on no evidence at all — and from the stand's own
   * numbers `medium` costs 0.6 ms more than `low` and keeps SMAA and the 2048
   * shadow map instead of FXAA and 1024. The tier that was MEASURED as too
   * dear is the one that closes; everything under it stays open to the climb.
   */
  const from = quality;
  ceiling = QUALITIES[Math.min(QUALITIES.indexOf(from) + 1, QUALITIES.length - 1)];
  climb = 0;
  setTier(q, `${gov.msPerFrame?.toFixed(1)} ms/frame measured`);
};
/* `QUALITIES.includes`, not the raw parameter's truthiness: `?quality=hgih`
   used to switch the whole adaptive system off — the pin was correctly
   ignored by the tier choice up top, but the governor was not built, so there
   was no demotion, no climb, and `window.__airenaGov` was null with every
   capture reporting `msPerFrame: null` and no indication why. */
/*
 * THE METER HAS TO HAVE AN OPINION INSIDE THE WINDOW ANYONE WATCHES.
 *
 * The module's defaults are `warmup 40` + `fast 24`, i.e. 64 ticks before
 * `gov.msPerFrame` is anything but null — and `tools/shots.mjs` drives 24.
 * Measured across the 21 fresh live captures: `quality: "high"`, `forced: 0`
 * and `msPerFrame: null` in 8 of 21, with `live-visitor.json` sitting at
 * 108 ms/frame under drive and the governor reporting nothing about it. The
 * `starving` escape below reads `gov.fps` too, so it was dead on any page
 * that draws fewer than 64 frames. 10 + 10 gives the meter an answer at tick
 * 20, which is inside both a capture and a viewer's first second, and still
 * skips the pipeline-compile frames the warm-up exists for.
 */
const GOV_TUNE = { warmup: 10, fast: 10 };
let gov = QUALITIES.includes(qualityParam) && !isWebGL
  ? null : qualityGovernor({ tier: quality, demote, onChange: onTierDrop, ...GOV_TUNE });
/*
 * The handle the capture harness reads. `msPerFrame` is the module's own
 * meter; `drawMs` and `displayHz` are the page's (`window.__airenaStats`),
 * hung off the same object so a tool that already reads one gets all three —
 * and so the vsync-capped wall-clock delta the captures carry can be told
 * apart from what the frame actually costs on the main thread.
 */
const govStats = (g) => (g ? Object.defineProperties(g, {
  drawMs: { get: () => stats.drawMs, configurable: true },
  displayHz: { get: () => stats.displayHz, configurable: true },
  tier: { get: () => quality, configurable: true },
}) : g);
window.__airenaGov = govStats(gov);
/**
 * THE CLIMB — the measured half of "start conservative, then decide".
 *
 * The static rule up top has to guess, and it guesses DOWN: a phone and a 4K
 * viewport start at 'medium' because the alternative is a first fight at 20 fps
 * on a machine that cannot be asked about itself before it has drawn anything.
 * The governor only ever demotes ("a fight must not flicker between graphs"),
 * so a guess that was too cautious used to stand for the whole session — a
 * modern phone or a desktop GPU on a 4K monitor never saw the AO seating or
 * the floor's reflection the stand was judged on.
 *
 * So the page measures itself and climbs once it has evidence, under four
 * conditions that between them make a wrong climb cheap and rare:
 *
 *  - AT A BOUNDARY, never in a fight. The rebuild is precompiled off the main
 *    thread (`applyPost`) but it still holds the picture for a few frames.
 *  - FULL RATE: the rolling 120-frame mean delta is within 8 % of the display's
 *    own cadence, so the page is not dropping frames at the tier it is on.
 *  - CHEAP TO DRAW: the mean main-thread cost of the draw is under half the
 *    display period. Under vsync the delta alone cannot tell a machine with
 *    headroom from one with none — both read 16.7 ms — and this is the term
 *    that can. The stand's own frame is CPU-bound (12.3 ms at 'high'), so this
 *    is the number that moves when the tier does.
 *  - FOR THREE SECONDS of that, and never above the ceiling.
 *
 * A climb that was wrong is corrected by the governor within its own two
 * seconds, and then the ceiling holds the tier down for the rest of the
 * session. `?quality=` pins switch both halves off.
 */
let climb = 0;
function tryPromote(dt, inPlay) {
  if (!gov || isWebGL || rebuilding || inPlay || document.hidden) { climb = 0; return; }
  const up = QUALITIES[QUALITIES.indexOf(quality) - 1];
  if (!up || QUALITIES.indexOf(up) < QUALITIES.indexOf(ceiling)) { climb = 0; return; }
  /*
   * THE BAR IS A 60 Hz FRAME, WHATEVER THE PANEL RUNS AT.
   *
   * Measured against the display's own period, a 120 Hz panel asked the page
   * to sustain 120 fps AND draw in ≤ 4.17 ms before it would climb; the
   * stand's own cost for the tier being climbed TO is 12.46 ms of main thread
   * (`reports/arena/stand.json`). On 144 Hz the bar is 3.5 ms, on 165 Hz 3.0.
   * So the climb could never fire on exactly the hardware §8.1 wrote it for —
   * a modern phone is 120 Hz ProMotion and every one of them starts at
   * 'medium'. The question this test is actually asking is "is there headroom
   * at 60", and clamping the period to a 60 Hz frame is that question: ≤ 8.3
   * ms of draw and ≤ 18 ms of delta. The demotion side has had the matching
   * clamp all along (`Math.min(45, displayHz * 0.75)`).
   */
  const hz = refreshDt <= 0.034 ? 1 / refreshDt : 60;
  const period = Math.max(1000 / 60, 1000 / hz);
  const fast = stats.samples >= STAT_WIN && stats.msPerFrame <= period * 1.08 && stats.drawMs <= period * 0.5;
  climb = fast ? climb + dt : 0;
  if (climb < 3) return;
  climb = 0;
  const why = `${stats.msPerFrame.toFixed(1)} ms/frame, ${stats.drawMs.toFixed(1)} ms of it drawn`;
  setTier(up, why);
  /* A fresh meter at the new tier: the governor's own rolling mean is 120
     frames of the OLD graph, and demoting on it would undo the climb before
     the first frame of the new one had been weighed. The module refuses to
     raise its own tier (`set` only ever descends), so the way to move it up
     is to build the meter again — same demote lines, same object. */
  gov = qualityGovernor({ tier: up, demote, onChange: onTierDrop, ...GOV_TUNE });
  window.__airenaGov = govStats(gov);
}

/*
 * THE PIPELINES ARE COMPILED BEFORE THE FIRST FRAME, ASYNCHRONOUSLY — and
 * after EVERY scene object exists.
 *
 * The first `post.render()` used to build every material's WGSL and pipeline
 * on the main thread in one go — measured 3.1–3.2 s in the capture harness
 * with the environment, the two stock bodies and the VFX pools in the scene
 * — and Chrome compiles a synchronously created pipeline serially at first
 * use. `PassNode.compileAsync` compiles the scene's render objects against
 * the pass's own render target and MRT with `createRenderPipelineAsync`, so
 * the GPU process compiles them in parallel while this awaits, and the first
 * frame keeps only the post nodes' own few pipelines. Awaited, not fired: a
 * pipeline still compiling when the sync path reaches it is `undefined` to
 * the encoder.
 *
 * It stands HERE, past the VFX pools, the telegraphs and the ghosts, because
 * `compileAsync` compiles what the scene lists at that moment and skips what
 * is invisible: run right after the stock bodies (as it first was) it left
 * the two pool materials and the fourteen telegraph materials to the first
 * frame, and everything hidden until its first use — the cones, lanes, aim
 * lines and the two ghosts — is switched visible for the compile and put
 * back. Nothing here is fatal: a failed precompile leaves the first frame to
 * do what it always did.
 */
if (scenePassNow?.compileAsync) {
  const t0 = performance.now();
  const hidden = [];
  scene.traverse((o) => { if (o.visible === false) { hidden.push(o); o.visible = true; } });
  try {
    await precompilePass(scenePassNow);
    console.info(`precompile: ${Math.round(performance.now() - t0)} ms`);
    mark('precompiled');
  } catch (e) {
    console.warn(`precompile: ${where(e)}`);
  }
  for (const o of hidden) o.visible = false;
  /*
   * AND THE POST GRAPH'S OWN PIPELINES, WHICH ARE NOT IN THE SCENE PASS.
   *
   * `precompilePass` compiles the render objects the scene pass draws. GTAO,
   * its denoise, the bloom's whole mip chain and SMAA are not render objects
   * — they are the graph's own passes, and every one of them was still being
   * built synchronously inside the first `post.render()`. That is where
   * `drawn.firstMs` was going: 2 621–4 348 ms across the six live captures,
   * on a machine whose steady frame is 10–22 ms, and it is most of the gap
   * between F6's ten seconds and the 9.1 s average the harness measures to
   * the first drawn frame.
   *
   * `post.renderAsync()` runs the identical graph through `renderAsync`, so
   * the pipelines are created with `createRenderPipelineAsync` in the GPU
   * process instead of serially on this thread. It draws a real frame, which
   * is the point: the arena is on the canvas under the boot card a beat
   * earlier than it used to be. Not fatal — if it throws, the first frame does
   * what it always did.
   */
  if (post?.renderAsync) {
    const t1 = performance.now();
    try {
      await post.renderAsync();
      console.info(`post warm: ${Math.round(performance.now() - t1)} ms`);
      mark('postWarm');
    } catch (e) {
      console.warn(`post warm: ${where(e)}`);
    }
  }
}
renderer.setAnimationLoop(() => {
  fps.frames++;
  const t = performance.now();
  if (t - fps.since >= 1000) {
    fps.last = Math.round((fps.frames * 1000) / (t - fps.since));
    if (fps.last > 0) fps.min = fps.min ? Math.min(fps.min, fps.last) : fps.last;
    fps.frames = 0; fps.since = t;
  }
  try { frame(); } catch (e) {
    if (!loopFailed) { loopFailed = true; fail(`render loop: ${where(e)}`); }
  }
  try { drawFrame(); } catch (e) {
    if (!drawFailed) { drawFailed = true; fail(`render draw: ${where(e)}`); }
  }
});

function frame() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - last);
  last = now;
  /* The stand shot borrowed the field of view for the last frame's picture
     (`applyStandShot`); the solver reads its own back before it runs. */
  releaseStandShot();
  /*
   * WHOSE BEAT IS THIS. EVERY card beat is the arena's, unless the pair shot
   * has earned it.
   *
   * The rule used to be "the VS beat, or a card with no pair on the floor",
   * and `pair` was raised on every streaming frame — so at the result, where
   * a fight is still streaming behind the card, it was always true and the
   * beat always fell to the pair shot, which aims at the pair's midpoint,
   * which is the frame's centre, which is under the card. The capture came
   * back an empty plaza with a VICTORY card on it.
   *
   * Now `pair` is the ESTABLISHING shot's own verdict from last frame — both
   * bodies inside the band, clear of the card's rectangle, and at least
   * `TALL_WANT` of the frame tall (`pairReadable`). When that holds, the
   * winner-over-the-fallen framing is worth keeping and it keeps the beat.
   * When it does not — the VS card, which leaves no room beside it — the beat
   * is the ARENA: walls, blocks, tiers, banner, planet.
   */
  standShot.auto = hudBand.card && !standShot.pair;

  /*
   * Часы частиц идут ВСЕГДА, а не только когда есть кадры боя.
   *
   * Слой эффектов интегрирует движение аналитически: частица знает, где она,
   * из разницы «сейчас минус рождение». Часы, стоящие между боями, держат
   * каждую искру в момент рождения — то есть невидимой, потому что она ещё
   * не начала лететь. Стенд VFX ловил это первым: эффекты не рисовались
   * вовсе, пока не идёт матч.
   *
   * Собственные часы, а не `renderClock`: тот привязан к времени матча и
   * прыгает назад на каждом новом бое, а у частицы время только вперёд.
   */
  vfx.update(now);

  if (frames.length) {
    const newest = frames[frames.length - 1].t;
    renderClock += dt;
    // Snap back if the socket ran ahead or behind; a drifting render clock is
    // how an interpolated view slowly turns into a slideshow.
    if (renderClock > newest - DELAY * 0.5) renderClock = newest - DELAY * 0.5;
    if (renderClock < newest - DELAY * 4) renderClock = newest - DELAY;
  }
  playFxUpTo(renderClock);

  const fr = interpolate(renderClock);
  if (fr) {
    // Taken from the bracket frame the bodies are posed from, so "the fight is
    // decided" and "this body is a corpse" can never disagree by a frame.
    decided = !!fr.a.over;
    const view = {};
    for (const id of ['blue', 'orange']) {
      const a = fr.a[id], b = fr.b[id];
      const x = lerp(a.x, b.x, fr.u), z = lerp(a.z, b.z, fr.u), y = lerp(a.y, b.y, fr.u);
      const h = shortAngle(a.h, b.h, fr.u);
      const speedMs = Math.hypot(lerp(a.vx, b.vx, fr.u), lerp(a.vz, b.vz, fr.u));
      view[id] = { ...a, x, y, z, h, speedMs, hp: lerp(a.hp, b.hp, fr.u) };
    }
    /* Слепок того, ЧТО ИМЕННО получили тела в этом кадре. Одна ссылка на
       кадр; читается только диагностикой (`__airenaBodies`). */
    lastView = view;

    for (const id of ['blue', 'orange']) {
      const body = bodies[id];
      const v = view[id];
      const st = anim[id];
      if (!body) continue;

      if (st.lastHp !== null && v.hp < st.lastHp - 0.01 && v.alive) st.hitUntil = now + 0.34;
      st.lastHp = v.hp;

      const moved = st.lastX === null ? 0 : Math.hypot(v.x - st.lastX, v.z - st.lastZ);
      // sign of travel against facing, so backing away backpedals
      let sign = 1;
      if (moved > 1e-5) {
        const fx = Math.sin(v.h), fz = Math.cos(v.h);
        sign = ((v.x - st.lastX) * fx + (v.z - st.lastZ) * fz) >= 0 ? 1 : -1;
      }
      st.lastX = v.x; st.lastZ = v.z;
      st.stride += (sign * moved) / (body.length * STRIDE_PER_LENGTH);

      const targetTurn = THREE.MathUtils.clamp(
        ((shortAngle(fr.a[id].h, fr.b[id].h, 1) - fr.a[id].h) / Math.max(1e-4, fr.b.t - fr.a.t)) / cfg.fighters[id].turnRate,
        -1, 1,
      );
      st.turn += (targetTurn - st.turn) * (1 - Math.exp(-8 * dt));

      const pa = poseAction(v, id, now);
      const speedBl = THREE.MathUtils.clamp(v.speedMs / GAIT_LENGTH[id], 0, 6);

      /*
       * The fall, ramped over the 1.5 s the sim gives a death.
       *
       * `fallOrientation` measured where the body has to end up; this is when it
       * gets there. The turn starts a quarter of the way into the death so the
       * pose's own collapse reads first and the topple finishes it, and both are
       * done together — a corpse that is still rotating after the banner is up
       * looks like a physics glitch rather than a body coming to rest.
       */
      const fell = v.alive ? 0 : THREE.MathUtils.smoothstep(pa.phase, 0.25, 1);
      const fall = body.fall;
      body.root.position.set(v.x, v.y, v.z);
      body.root.rotation.set(fall.rx * fell, v.h, fall.rz * fell, 'YXZ');
      body.inner.userData.pose({
        t: now,
        dt,
        speed: speedBl,
        stride: st.stride,
        turn: st.turn,
        grounded: v.y < 0.02,
        health: THREE.MathUtils.clamp(v.hp / v.maxHp, 0, 1),
        action: pa.action,
        phase: pa.phase,
      });
      /*
       * Measure the pose that was actually struck, then stand it on the floor.
       *
       * Upward only while alive — a hop legitimately leaves the ground and
       * pulling it back down would cancel the jump — but exact for a corpse,
       * because a body lying on its back can end up ABOVE the floor as easily as
       * below it and a corpse hovering 0.12 m over its own shadow is the same
       * bug in the other direction.
       *
       * The price is one extra world-matrix pass, 0.31 ms a frame for both
       * bodies, plus 0.088 ms for the scan itself: 2.4% of a 60 Hz budget to
       * take frames-below-the-floor from 35.7% to 0.0% and leave nothing for a
       * smoothing filter to lag behind. The eased lift this replaces was itself
       * a lag: at rate 14 it was still a quarter of the way behind a pose that
       * changed on the frame a skill started.
       */
      body.root.updateMatrixWorld(true);
      const low = spanY(body).min;
      body.root.position.y = v.y + (v.alive ? Math.max(0, -low) : -low);
      body.root.visible = true;

      // HUD
      const frac = THREE.MathUtils.clamp(v.hp / v.maxHp, 0, 1);
      bars[id].fill.style.width = `${frac * 100}%`;
      bars[id].label.textContent = `${Math.ceil(v.hp)} / ${v.maxHp}`;
      /*
       * A corpse has no cooldowns.
       *
       * This loop had no `alive` guard, so a dead fighter's chips went on
       * ticking and re-lighting: a dead fighter at 0/205 read back
       * ['smash|cd ready', 'charge 1.0|cd cool', 'jump|cd ready'] — a glowing
       * ready smash on a body the banner had already declared dead, with a
       * charge timer counting down in real time. Freeze the chips, grey the
       * column, and say what the column is now a record OF.
       */
      bars[id].wrap.classList.toggle('dead', !v.alive);
      for (const [sk, el] of Object.entries(cdEls[id])) {
        const label = el.dataset.label || el.textContent.replace(/\s[\d.]+$/, '');
        el.dataset.label = label;
        if (!v.alive) { el.className = 'cd cool'; el.textContent = label; el.dataset.cd = ''; continue; }
        const cd = v.cd ? v.cd[sk] : 0;
        /*
         * "0.0" IS NOT A COOLDOWN, IT IS A ROUNDING ARTEFACT.
         *
         * The threshold was 0.001 and the print is `toFixed(1)`, so every
         * value in [0.001, 0.049] — one to one and a half ticks, which every
         * ability passes through on its way back — rendered as a chip reading
         * `0.0`: a number that says "wait" about an ability that is ready on
         * the next frame. Round first, then decide: what cannot be printed as
         * a wait is not one.
         */
        const wait = Math.round((v.cd ? cd : 0) * 10) / 10;
        el.className = `cd ${wait > 0 ? 'cool' : 'ready'}`;
        el.textContent = wait > 0 ? `${label} ${wait.toFixed(1)}` : label;
        /* The product HUD draws the chip as an icon tile and reads the seconds from here. */
        el.dataset.cd = wait > 0 ? wait.toFixed(1) : '';
      }
      updateTelegraph(id, v, view);
      updatePlate(id, v, body.height || 2);
      setSay(id, v.say);
      if (sayEls[id]) {
        const p = project(v.x, (body.height || 2) + 1.1, v.z);
        sayEls[id].style.left = `${p.x}px`;
        sayEls[id].style.top = `${p.y}px`;
      }
    }

    updateCamera(view.blue, view.orange, dt);
    /* `standShot.pair` is written by the camera itself — raised by the
       establishing shot when its pair is readable, cleared by the orbit.
       Raising it here, on every streaming frame, is what made the result beat
       claim a pair shot of two bodies the card was standing on. */
    applyStandShot(dt);
    // after the camera, because both answers are about THIS frame's eye
    updateOcclusion(view, dt);
    occluded = true;
    checkFraming(view, fr.a.t);
    $('#clock .t').textContent = fr.a.t.toFixed(1);

    /*
     * Sudden death has to be VISIBLE. It is the one rule that changes what a
     * good decision is — from "outlast them" to "finish this" — and a rule that
     * changes the game silently is indistinguishable from the fighters both
     * losing health for no reason.
     */
    const burn = Math.max(0, cfg.suddenDeathRamp * (fr.a.t - cfg.suddenDeathAt));
    const heat = THREE.MathUtils.clamp(burn / 0.16, 0, 1);
    /*
     * The burn is the environment's (`applySuddenDeath`): the floor to pale
     * peach, the fog, the background and the dome's horizon to ember, the
     * reflection scaled down with the floor. The coral rim keeps ≥ 18 L over
     * the burnt floor; the mood is carried by the sky and the pit merely
     * warms. A lerp from the calm end, never a literal set of numbers — the
     * calm end IS the floor, the fog and the sky.
     */
    env.applySuddenDeath(heat);
    const clockEl = $('#clock .s');
    if (burn > 0) {
      clockEl.textContent = `SUDDEN DEATH · the arena burns both, −${(burn * 100).toFixed(1)}%/s`;
      clockEl.style.color = '#ff6a52';
      clockEl.classList.add('burning');
    } else if (matchInfo) {
      /* Nothing to say yet. How long is left before the arena ignites is
         already drawn under the clock (`data-left`, §5.2), and the fight's
         number belongs to the phase subline alone (§9.1) — so this line stays
         empty until sudden death gives it something of its own to report. */
      clockEl.textContent = '';
      clockEl.style.color = '';
      clockEl.classList.remove('burning');
    }
    // A handle for a human (or a reviewer's console) to inspect the live view.
    // `decided` as well as `over`: the 2.6 s between them is the curtain, and a
    // recorder that splits a match on `over` alone cannot see into it.
    /* `renderer` здесь ради замера кадров: без него нельзя ни спросить
       `info.render.drawCalls`, ни отличить «кадр стоит дорого» от «кадр стоит
       дорого ИМЕННО в отрисовке». Ручка отладочная и в бою ничего не делает. */
    window.airena = { THREE, TSL, view, frames, bodies, camera, camState, scene, renderer, cfg, over, decided, matchInfo, renderClock, shoot, startMatch, tele, ghosts, solids: SOLIDS, env, quality, hudBand, measureHud, backend: window.__airenaBackend };
  } else if ((matchInfo || over) && camModes[camMode] === 'auto' && !sweepCam) {
    /* A match announced and no frame yet (the VS beat), or a result with the
       socket gone quiet: the establishing shot over the bodies where they
       STAND — the match's own bodies, just swapped in, not the previous
       fight's positions — or the empty field. The snap the match set is
       kept for the fight's first frame, so a page opened mid-fight plants
       the orbit instead of swinging out of this shot for three seconds. A
       fresh visitor before any match keeps the boot camera, whose near wall
       the wall rule fades. */
    const standing = (id) => (bodies[id]?.root?.visible
      ? { x: bodies[id].root.position.x, y: 0, z: bodies[id].root.position.z, alive: true } : null);
    const keep = camState.snap;
    const a = standing('blue'), b = standing('orange');
    establishingCamera(a, b, dt);
    camState.snap = keep;
    /*
     * NOTHING TO ESTABLISH OVER → THE ARENA IS THE SUBJECT (`applyStandShot`).
     * A VS card rises before the match's first snapshot, so neither body is
     * visible yet and the pair shot aims at an empty midpoint: the capture
     * `live-vs.png` was plaster with a card over it. With no pair, the beat
     * takes the stand's establishing frame instead — walls, blocks, tiers,
     * banner, planet — and hands back to the orbit over 600 ms on the first
     * fighting frame. The result beat keeps the pair shot when — and only
     * when — the winner is actually visible beside the card; that verdict is
     * `establishingCamera`'s, written into `standShot.pair` above.
     */
  }

  /* If neither camera branch ran (no frames, no match: a visitor's first
     seconds, and the VS beat), the blend still has to advance — and the wall
     rule wants THIS eye too: from the boot camera and from the stand shot the
     near wall hides a strip of the field and stands with its notch's cut
     faces at bottom-centre, and with no fighters on the floor nothing else
     was asking for the pass at all. */
  applyStandShot(dt);
  /* …and the floor is cleared with it. `occluded` is raised only by the
     streaming branch, so it is exactly the question "did a fight draw this
     frame" — the same question `restMarks` answers about the plaza's marks,
     and `updateOcclusion(EMPTY_VIEW)` about the two ghosts. */
  if (!occluded) { restMarks(); updateOcclusion(EMPTY_VIEW, dt); }
  occluded = false;

  updateFx(now);
  tickScreen(dt);
  tickHit(now);
}

/**
 * The half of a frame that puts pixels on the screen.
 *
 * Split out of `frame()` and called with its own guard (see the loop above),
 * because the state update and the picture are not the same promise. Nothing
 * here reads the socket or advances the world: it places the sweep camera if a
 * stand has taken it, decides whether the frame is visible at all, and draws.
 */
let envClock = performance.now();
/* `direct` — frames the post graph could not draw and the raster path did;
   `blank` — frames NOBODY drew. A capture reads both (`window.__airenaDrawn`)
   so "the arena is dark" can be told from "the arena was never written". */
const drawn = { n: 0, firstAt: 0, firstMs: 0, lastMs: 0, direct: 0, blank: 0, postTier: window.__airenaPostTier || null };
/** Consecutive throws out of `post.render()`; two of them retire the graph. */
let postThrows = 0;
let drawBlank = false;
/** The phase/card the HUD was last measured in (see `measureHud`). */
let hudBeat = '';
window.__airenaDrawn = drawn;
function drawFrame() {
  if (sweepCam) {
    /* Орбита вокруг точки взгляда: азимут, наклон, дистанция. Тряска
       решателя сюда не попадает — снимок сравнивают, а не переживают. */
    const { az = Math.PI * 0.25, pitch = 0.5, dist = 26, look = { x: 0, y: 1.2, z: 0 } } = sweepCam;
    camera.position.set(
      look.x + Math.sin(az) * Math.cos(pitch) * dist,
      look.y + Math.sin(pitch) * dist,
      look.z + Math.cos(az) * Math.cos(pitch) * dist,
    );
    camera.lookAt(look.x, look.y, look.z);
  }
  /*
   * ── КАДР НЕ РИСУЕТСЯ, КОГДА ЕГО НЕ ВИДНО ────────────────────────────────
   *
   * Вьювер живёт в той же странице, что и продукт, и `#arena` не
   * размонтируется никогда — иначе первый кадр (F6) пришлось бы платить на
   * каждом переходе. Но экраны бывают двух видов, и CSS их уже различает:
   * `#screen.doc` (существо, лестница) — непрозрачный документ поверх арены,
   * `#screen.veil` — полупрозрачный слой, сквозь который §10.3 требует
   * показывать идущий бой.
   *
   * Под непрозрачным документом рисовалась полная сцена с тенями 2048,
   * MRT-проходом, мипами свечения и двумя пулами по три тысячи инстансов —
   * замерено 2.9 мс GPU на кадр, тридцать раз в секунду, ни одного пикселя
   * которых никто не видит.
   *
   * Логика кадра при этом ИДЁТ: она проигрывает буфер сокета и двигает HUD,
   * и остановить её значило бы разъехаться с трансляцией. Пропускается ровно
   * рисование.
   */
  /*
   * `document.hidden` СЮДА НЕ ВХОДИТ, и это решение.
   *
   * Скрытой вкладке браузер и так режет `requestAnimationFrame` до одного
   * кадра в секунду — своя проверка почти ничего не экономит. Зато она
   * ломает снятие кадров: панель предпросмотра сообщает `hidden: true` и при
   * этом просит композицию для снимка, и вместо арены получается чёрный
   * прямоугольник. Инструмент, которым проверяют картинку, не должен
   * зависеть от того, смотрит ли кто-то в него прямо сейчас.
   */
  /*
   * СНИМОК КАДРА ПЕРЕВЕШИВАЕТ ПРОПУСК РИСОВАНИЯ.
   *
   * Пропуск стоял ПЕРЕД этим блоком, и обещание, которое возвращает
   * `shoot()`, не разрешалось никогда, пока открыт документный экран —
   * то есть вкладка «Существо» и лестница. Инструмент, которым проверяют
   * картинку, зависал вместо ответа ровно на тех экранах, ради которых
   * его и зовут.
   */
  const covered = document.getElementById('screen')?.classList.contains('doc');
  if (covered && !pendingShot) { bootLanded(); return; }
  /* A graph rebuild is compiling: the renderer is pointed at the new pass's
     target until it finishes, so the picture holds for the frames it takes
     (see `applyPost`) rather than drawing into that target. */
  if (rebuilding) return;
  /*
   * ── THE BANNER'S PLAY RULE IS WITHDRAWN (ARENA-AAA §2, founder 06.09) ─────
   *
   * It read: the banner is hidden while the orbit or the top camera frames a
   * fight, because from any orbit state under dist 34 the frame's top edge
   * crossed a banner standing at the horizon and it slid along the HUD's top
   * row as a coral stub.
   *
   * That answered a frame-edge stub by DELETING the object. Measured on
   * `live-fighting.png`: zero coral pixels anywhere above the coping in the
   * whole fight — no banner, and with it none of the world the founder's
   * second directive is about, because the rule fires for precisely the beat
   * the product is watched on. The addendum puts coral on "banners and the
   * opponent" both, during play, and names the banners as the arena's only
   * saturated objects.
   *
   * The stub itself is a FRAMING fault and is answered where framing lives:
   * the fight camera's pitch is capped so the deck's roofline and the
   * banners' hanging points are inside the picture rather than clipped by its
   * top edge (see `PITCH_MAX` in the solver). The banner is a permanent
   * object from here on, exactly as it is on the stand that photographs it.
   */
  const inPlay = frames.length > 0 && !decided;
  env.banner.visible = true;
  /* The HUD's band, the feed's box and the card, from the DOM, for the
     camera (`hudBand`): re-measured on every phase or card change and every
     30 frames (half a second), because the panels move with the phase and
     the layout with the width. */
  const ds = document.body.dataset;
  const beat = `${ds.phase || ''}/${ds.card || ''}`;
  if (beat !== hudBeat || drawn.n % 30 === 0) { hudBeat = beat; measureHud(); }
  hudBand.card = /^(vs|result|win|loss)$/.test(ds.card || '') || /^(vs|result)$/.test(ds.phase || '');
  /* The card beat's own verdict, beside the picture it produced (see
     `soloReadable`). `tools/shots.mjs` spreads `__airenaDrawn` into every
     sidecar, so a result frame with no fighter in it now says which test
     refused rather than leaving the next round to guess again. */
  if (hudBand.card && standShot.beat) drawn.beat = { ...standShot.beat, pair: standShot.pair, stand: +standShot.k.toFixed(2) };
  /* The VS beat on its own: it is the one card that announces a fight that has
     NOT started, so nothing on the floor under it is the subject — whatever
     stands there is the last fight's. The camera answers with the arena
     itself (`applyStandShot`); the result card keeps the pair. */
  hudBand.vs = ds.card === 'vs' || ds.phase === 'vs';
  /* The post graph if it built; otherwise a direct frame — the fight matters more than the light. */
  drawHitFlash();
  /* Once per frame, AFTER the hit-flash pass and BEFORE the render: one
     shadow refresh for whichever camera renders first, and the reflection's
     zero level kept on the background. */
  const nowMs = performance.now();
  const dtEnv = (nowMs - envClock) / 1000;
  envClock = nowMs;
  env.update(Math.min(0.1, dtEnv));
  if (gov) {
    /*
     * THE DEMOTION LINES MUST NOT CALIBRATE TO THE MACHINE'S OWN SLOWNESS.
     *
     * `refreshDt` is the shortest delta the loop has seen and the lines are
     * 75 % and 50 % of that rate — so a machine whose FASTEST frame is 30 ms
     * was read as a 33 Hz display and its lines became 25 / 16.5 fps: it ran
     * `high` at 30 fps for the whole session and RENDER-QUALITY §7's "under
     * 45 fps → medium" never fired. The 30–60 fps band, which is precisely
     * the band the governor exists for, was where a slow machine looked like
     * a slow display.
     *
     * The page already measures the draw's own main-thread cost, and that is
     * what tells the two apart: a 30 ms frame with 25 ms of drawing in it is a
     * slow MACHINE; a 30 ms frame with 2 ms of drawing is a slow DISPLAY. Only
     * the second is allowed to teach the cadence. And it decays — one
     * anomalous 6.1 ms delta used to pin the cadence at 164 Hz for the whole
     * session and kill the climb outright — so a display that changes (a
     * window dragged to another monitor, a tab restored) is relearned.
     */
    const idle = stats.drawMs === null || stats.drawMs < dtEnv * 600;
    if (dtEnv >= 0.006 && dtEnv <= 0.25 && idle) refreshDt = Math.min(refreshDt, dtEnv);
    if (refreshDt < 0.25) refreshDt = Math.min(0.25, refreshDt * (1 + 0.02 * Math.min(0.1, dtEnv)));
    const displayHz = refreshDt <= 0.034 ? 1 / refreshDt : 60;
    demote.medium = Math.min(45, displayHz * 0.75);
    demote.low = Math.min(30, displayHz * 0.5);
    /* The hold has a floor. A fight under the `low` line is the one case
       RENDER-QUALITY §7 forbids, and with the rebuild precompiled off the
       main thread a mid-fight swap costs a short hold of the picture, not a
       freeze — so a starving fight drops a tier after the governor's 2 s
       instead of running out at 25 fps until the boundary. */
    const starving = gov.fps !== null && gov.fps < demote.low;
    if (inPlay && !starving) gov.hold(); else gov.release();
    /*
     * AND THE METER IS NOT ALLOWED TO DISCARD THE STALLS IT EXISTS FOR.
     *
     * The ceiling was 0.25 s — "a throttled tab is the browser choosing not to
     * draw, not a slow frame" — which is true of a hidden tab and false of a
     * one-second pipeline compile on a visible one. The consequence is the
     * module's panic rule (3 consecutive dt > 0.1 s) could only ever see the
     * 4–10 fps band and never a half-second frame, which is exactly the shape
     * the result and visitor captures measured. `document.hidden` already
     * answers the throttled tab, so the ceiling is raised to 2 s for the
     * PANIC's sake and the value handed over is still clamped at 0.25 for the
     * rolling mean's — a 1 s frame counts as one panic tick without pulling
     * the mean four times further than a frame can pull it.
     */
    if (!document.hidden && dtEnv > 0 && dtEnv <= 2) gov.tick(Math.min(0.25, dtEnv));
    /* and the other direction, at a boundary only (`tryPromote`) */
    tryPromote(Math.min(0.25, dtEnv), inPlay);
  }
  /*
   * A FRAME THAT THROWS MUST NOT BLANK THE ARENA.
   *
   * Two causes are known. A post-effect can fail: the frame then falls back to
   * a direct render. And a GENERATED BODY can fail lazily — a model-written
   * material that builds fine and throws at shader time (`reading 'abs'` inside
   * `buildBody`), which surfaces inside the render call on every frame. For
   * that case the offending side is put back on its stock body once per match
   * (`quarantineBodies`) and the failure is reported as `airena:bodyfail`, the
   * same signal a body that failed at build time sends.
   */
  const drawT0 = performance.now();
  try {
    if (post) post.render(); else renderer.render(scene, camera);
    postThrows = 0;
    if (evicted) restoreBodies();
  } catch (e) {
    if (!postFailed) { postFailed = true; fail(`render: ${where(e)}`); }
    /* Quarantine or not, a frame is drawn: with the failed body hidden the
       direct render shows the environment and the other fighter while the
       stock body arrives, instead of a cleared canvas under the veil — the
       one blank frame a visitor met on any fight with a bad generated body,
       and one the capture harness could not tell from a broken renderer. */
    quarantineBodies(e.message);
    /*
     * AND THE FALLBACK IS PUT BACK ON THE RASTER PATH BEFORE IT DRAWS.
     *
     * Without `directGrade` this line rendered into the failed pass's own
     * target with no tone map, i.e. into nothing: `live-visitor.png` came back
     * #000000 across the whole arena with the HUD readable on top of it, and
     * the sidecar recorded 30 draws in 14 s because the throw simply repeated.
     * The two counters below are what tells a capture a black canvas from a
     * drawn one — a picture nobody drew used to look exactly like a dark
     * theme.
     */
    directGrade();
    /*
     * AND THE SECOND THROW TAKES THE THROWING OBJECT OUT OF THE FALLBACK.
     *
     * `quarantineBodies` only hides `root` and fires an ASYNC swap, so the
     * retry below draws the same scene graph — and on the run that produced
     * `live-visitor.png` the retry threw too: `drawn.direct 1 / blank 1`, 24
     * ticks in 2 586 ms, and a WebGPU frame whose command buffer is never
     * submitted presents a TRANSPARENT surface, which is why the round-6 black
     * frame came back as a flat `--sky` page with the HUD floating on it.
     *
     * A hidden root is not out of the render list until the traversal that
     * builds it runs again, and it is not out of the SCENE at all — so from
     * the second consecutive throw both fighters are DETACHED, not dimmed.
     * The worst frame this can now present is the arena with no fighters in
     * it, which is a picture; the page it replaces was not one.
     */
    if (postThrows >= 1) { evictBodies(); evictFx(); }
    try {
      renderer.render(scene, camera);
      drawn.direct++;
    } catch (e2) {
      drawn.blank++;
      if (!drawBlank) { drawBlank = true; console.warn('the direct render failed too', e2); }
    }
    /*
     * TWO IN A ROW IS NOT BAD LUCK — the number `dropPost`'s own docstring has
     * always argued for, and the number the visitor evidence settles.
     *
     * Eight was chosen because `quarantineBodies` answers with an async swap
     * and a handful of frames can still meet the material that threw. That is
     * true and it is not the point: eight consecutive throws are eight frames
     * the viewer spends looking at a transparent canvas, and the async swap
     * needs the graph gone rather than retried while it lands. Reset by the
     * first frame that renders.
     */
    if (++postThrows >= 2) dropPost(`${postThrows} consecutive throws: ${e.message}`);
  }
  /* How many frames this page has drawn and what the first one cost on the
     main thread (the pipeline compiles land there): read by the capture
     tool beside every picture, so "the arena had not appeared" can be told
     apart from "the arena was never asked to draw". */
  drawn.n++;
  const drawMs = performance.now() - drawT0;
  drawn.lastMs = Math.round(drawMs);
  if (drawn.n === 1) { drawn.firstAt = Math.round(drawT0); drawn.firstMs = drawn.lastMs; }
  /* The rolling mean the captures carry (`window.__airenaStats`): the frame's
     wall-clock delta and the part of it this thread spent drawing. */
  tickStats(dtEnv, drawMs);
  /* A picture exists. Only now does the connecting card have nothing to say. */
  bootLanded();

  if (pendingShot) {
    const { name, resolve } = pendingShot;
    pendingShot = null;
    const png = renderer.domElement.toDataURL('image/png');
    fetch(`${API()}/api/shot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, png }),
    }).then((r) => r.json()).then((j) => resolve(j.file)).catch((e) => resolve(String(e)));
  }
}

/* Всё объявлено — можно подключаться. См. комментарий выше. */
connect();
