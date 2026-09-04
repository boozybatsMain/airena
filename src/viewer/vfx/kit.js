/**
 * Ударный набор: то, из чего собирается любой каст независимо от элемента.
 *
 * Референсы основателя (Path of Exile 2, Elemental Sandbox) устроены одинаково
 * под капотом: сфера взрыва со смещением по шуму, ударная волна по полу,
 * след на полу, свет в точке удара, дым и обломки в пуле частиц, толчок
 * камеры и вспышка кадра. Элемент выбирает цвета, формы и тайминги — сам
 * словарь общий. Поэтому он здесь один раз, а не три.
 *
 * Два правила, которые дороже красоты:
 *   · РАЗМЕР — ПАРАМЕТР. Конус, зона, луч завтра меняют дальность, угол и
 *     радиус (решение основателя 02.09). Ни одна плотность не константа:
 *     число частиц, кристаллов, обломков считается от ПЛОЩАДИ следа через
 *     `footprint` и `countFor`. Эффект адаптируется, а не растягивается.
 *   · СЛЕД ОСТАЁТСЯ. Каждый удар оставляет декаль на полу на десятки секунд
 *     (`decal`): бой должен быть виден по арене, а не только по ленте.
 *
 * TSL, ни строки GLSL: одно и то же на WebGPU и WebGL2 (§9.1).
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import {
  TIME, basic, col, easeOutCubic, markGlow, markDistort, mulberry, pooled, rnd, shared, withFade,
} from './core.js';

const {
  float, vec2, vec3, uv, uniform, mix, smoothstep, oneMinus, abs: tabs,
  mx_noise_float, mx_fractal_noise_float, positionLocal, normalLocal, normalView,
  positionViewDirection, positionWorld, attribute, sin: tsin, cos: tcos, step: tstep,
  floor: tfloor,
} = TSL;

/* ── настраиваемые параметры формы ──────────────────────────────────────── */

/**
 * НАСТРОЙКА ФОРМЫ: `kit.tune(e, defaults)` возвращает копию `defaults`, в
 * которой каждое поле перекрыто одноимённым полем записи, если оно там есть.
 *
 * ЗАЧЕМ. Заказ основателя: «главные параметры каждой формы должны быть
 * настраиваемыми, чтобы потом можно было легко перенастроить практически
 * любую из них». До этого размеры, направления и длительности сидели в
 * модулях числами: высота колонн зоны, подъём параболы навеса, время роста
 * стены, стойкость следа. Изменить их можно было только правкой кода, и
 * ревизия нашла 194 таких числа.
 *
 * ПОЧЕМУ ИМЕННО ТАК, а не «читать `e.foo ?? 0.35` на каждой строке». Объект
 * `defaults` — это ОПИСЬ того, что у формы вообще можно крутить: он стоит
 * одним куском в начале функции, его видно целиком, и он не расходится с
 * тем, что читает код ниже. Значение по умолчанию — ровно сегодняшнее число,
 * поэтому подключение параметра НИКОГДА не меняет картинку: пока запись поля
 * не несёт, кадр байт в байт прежний.
 *
 * Запись формы приходит из сима (`src/core/deliver.js`) и несёт только то,
 * что сим про неё знает (зона — `x z r duration h`, конус — `range halfAngle`
 * и так далее). Всё остальное — чисто визуальные ручки: их кладёт стойка
 * (`src/viewer/vfxfixture.js`) или будущий редактор. Поэтому проверка на
 * `!= null`, а не на истинность: ноль — законное значение подъёма параболы.
 */
export function tune(e, defaults) {
  const out = {};
  for (const k of Object.keys(defaults)) {
    const v = e ? e[k] : undefined;
    out[k] = v == null ? defaults[k] : v;
  }
  /* Опись запоминается — см. `knobsFor`. */
  if (e && e.element && e.kind) {
    const key = `${e.element}:${e.kind}`;
    const prev = KNOBS.get(key);
    KNOBS.set(key, prev ? { ...prev, ...defaults } : { ...defaults });
  }
  return out;
}

/*
 * ЧТО У ЭТОЙ ФОРМЫ ВООБЩЕ МОЖНО КРУТИТЬ. `tune` видит опись целиком, поэтому
 * он же её и записывает: после первого каста пары «стихия + доставка» здесь
 * лежит полный список ручек с их значениями по умолчанию. Песочница
 * (`vfxsandbox.js`) строит по нему ползунки — иначе пришлось бы держать
 * второй, руками писаный список, который разошёлся бы с кодом на первой же
 * правке. Формы, которые зовут `tune` дважды (навес гравитации ставит зону),
 * складывают описи: ручек становится больше, и это правда.
 */
const KNOBS = new Map();

/** Опись ручек формы `kind` стихии `element` — или null, если ещё не кастили. */
export function knobsFor(element, kind) {
  const v = KNOBS.get(`${element}:${kind}`);
  return v ? { ...v } : null;
}

/* ── след умения → площадь → плотность ─────────────────────────────────── */

/** Радиус луча из сима (`BEAM_RADIUS` в `config.js`); здесь только для площади. */
const BEAM_RADIUS = 0.4;
/** Радиус удара снаряда: у болта и навеса своего радиуса нет, есть точка. */
const IMPACT_RADIUS = 1.4;

/**
 * Геометрия следа по записи `world.fx`: где, какой площади, куда смотрит.
 * Всё, что считает плотность, читает площадь отсюда — и только отсюда.
 */
export function footprint(e, ctx = {}) {
  switch (e.kind) {
    case 'cone': {
      const range = e.range || 3.4, half = e.halfAngle || 0.96;
      return { x: e.x, z: e.z, dir: e.h || 0, range, half, radius: range, span: range, area: half * range * range };
    }
    case 'zone': {
      /* `dir` больше не ноль: сим начал писать курс кастера в момент постановки
         (`deliver.js`), и без него внутри зоны нечего было ориентировать —
         «направление зоны» было нечем настроить (заказ основателя). */
      const r = e.r || 3;
      return { x: e.x, z: e.z, dir: e.h || 0, radius: r, span: r * 2, area: Math.PI * r * r };
    }
    case 'beam': case 'dash': {
      const len = Math.hypot((e.x1 ?? e.x0) - e.x0, (e.z1 ?? e.z0) - e.z0);
      return { x: e.x0, z: e.z0, x1: e.x1, z1: e.z1, dir: Math.atan2(e.x1 - e.x0, e.z1 - e.z0), len, radius: BEAM_RADIUS, span: len, area: len * BEAM_RADIUS * 2 };
    }
    case 'bolt': case 'lob': {
      const range = e.range || 10;
      return { x: e.x, z: e.z, dir: e.h || 0, range, x1: e.x + Math.sin(e.h) * range, z1: e.z + Math.cos(e.h) * range, radius: IMPACT_RADIUS, span: range, area: Math.PI * IMPACT_RADIUS * IMPACT_RADIUS };
    }
    case 'self': {
      /*
       * РАЗМЕР ЩИТА — ОТ ТЕЛА, а не от `ctx.radius`, которого не существует.
       * Мост в `main.js` отдаёт `bodyPos` и `bodyShape`; поля `radius` там нет
       * и не было никогда, так что эта ветка ВСЕГДА возвращала запасные 1.5 м:
       * щит гориллы и щит осьминога выходили одного размера, а «размер —
       * параметр» (решение 11) молча не работало для целой доставки.
       */
      const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
      const r = (bs ? bs.r * 1.25 + 0.35 : null) || ctx.radius || 1.5;
      return { x: e.x, z: e.z, dir: e.h || 0, radius: r, span: r * 2, area: Math.PI * r * r };
    }
    default: {
      const r = 1.2;
      return { x: e.x ?? 0, z: e.z ?? 0, dir: e.h || 0, radius: r, span: r * 2, area: Math.PI * r * r };
    }
  }
}

/** Эталонные площади — от умений реестра по умолчанию. */
export const REF_AREA = { cone: 0.96 * 3.4 * 3.4, zone: Math.PI * 9, beam: 24 * BEAM_RADIUS * 2, impact: Math.PI * IMPACT_RADIUS * IMPACT_RADIUS, self: Math.PI * 2.25 };

/**
 * Плотность от площади: `base` частиц на эталонной площади → столько же на
 * квадратный метр на любой другой. Пол — треть базы (совсем маленький след
 * всё равно должен читаться), потолок — `cap` (пул конечен).
 */
export function countFor(base, area, refArea, cap = 900) {
  return Math.round(Math.min(cap, Math.max(base * 0.35, (base * area) / Math.max(0.01, refArea))));
}

/** Случайная точка в секторе конуса (равномерно по площади). */
export function inSector(fp, r = Math.random) {
  const a = fp.dir + (r() * 2 - 1) * fp.half;
  const d = Math.sqrt(r()) * fp.range;
  return [fp.x + Math.sin(a) * d, fp.z + Math.cos(a) * d, d, a];
}

/** Случайная точка в диске (равномерно по площади). */
export function inDisc(x, z, radius, r = Math.random) {
  const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
  return [x + Math.sin(a) * d, z + Math.cos(a) * d, d, a];
}

/* ── сфера взрыва ───────────────────────────────────────────────────────── */

let BURST_GEO = null;
function burstGeo() {
  if (!BURST_GEO) BURST_GEO = shared(new THREE.IcosahedronGeometry(1, 5));
  return BURST_GEO;
}

/**
 * Икосфера, вершины которой ходят по шуму вдоль нормалей, тело — плотный
 * огненный шар, а не прозрачная плёнка: цвет берётся из ШУМА (бело-горячее
 * ядро → жёлтое → оранжевое → тёмная сажа), обод по френелю темнеет и
 * рвётся, растворение по второму шуму к концу жизни. Обычный блендинг —
 * на белом полу аддитивная сфера была белым пятном, а взрыв обязан быть
 * плотнее фона. Ровно та вещь, которая в референсе делает взрыв взрывом.
 *
 * `flash` — отдельный аддитивный режим на первые доли секунды: чистый
 * бело-горячий шар для свечения, без тела.
 *
 * Материалы — кольцо на режим; у каждого свои униформы возраста и цветов,
 * поэтому шесть одновременных взрывов одного режима живут независимо.
 */
function burstMat(mode) {
  return pooled(`burst:${mode}`, () => {
    const additive = mode === 'flash' || mode === 'storm';
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const age = uniform(0), seed = uniform(0), displace = uniform(0.55), intensity = uniform(1);
    const cA = uniform(new THREE.Color(1, 1, 1)), cB = uniform(new THREE.Color(1, 0.6, 0.2)), cC = uniform(new THREE.Color(0.6, 0.1, 0.02));
    m.userData.u = { age, seed, displace, intensity, cA, cB, cC };

    /* Смещение по нормали: грубый fbm плюс «гребни» (|noise|), сила растёт с
       возрастом — шар рвётся, а не надувается. */
    const p = positionLocal.mul(1.7).add(seed);
    const n1 = mx_fractal_noise_float(p.add(vec3(0, TIME.mul(0.35), 0)), 3, 2.0, 0.55, 1);
    const n2 = tabs(mx_noise_float(p.mul(2.3).add(11.7)));
    const disp = n1.mul(0.6).add(n2.mul(0.5)).mul(displace).mul(age.mul(0.9).add(0.35));
    m.positionNode = positionLocal.add(normalLocal.mul(disp));

    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    /* Тело: шум в мировых-локальных координатах, дрейфует вверх — огонь
       течёт по шару, а не приклеен к нему. */
    const flow = mx_fractal_noise_float(positionLocal.mul(2.6).add(vec3(seed, TIME.mul(-0.9), 0)), 4, 2.1, 0.5, 1).mul(0.5).add(0.5);
    /* Растворение: пиксель живёт, пока его шум выше возраста. Порог идёт
       быстрее возраста (×1.25): к последней трети жизни шар уже рваный, а не
       плотный красный мяч, стоящий на теле до конца (снято на навесе огня). */
    const dn = mx_noise_float(positionLocal.mul(3.1).add(seed.mul(1.3))).mul(0.5).add(0.5);
    const gone = age.mul(1.12).sub(0.06);
    const keep = smoothstep(gone.sub(0.14), gone.add(0.05), dn.mul(0.85).add(flow.mul(0.15)));

    if (additive) {
      const body = mix(cA, cB, fres.mul(0.7).add(age.mul(0.3)).clamp(0, 1));
      m.colorNode = body;
      const alpha = fres.mul(0.5).add(0.5).mul(intensity).mul(oneMinus(age).pow(1.2)).mul(keep);
      m.opacityNode = alpha.clamp(0, 1);
      return markGlow(m, alpha.clamp(0, 1));
    }
    /* Жар = шум, сдвинутый возрастом вниз: молодой шар весь бело-жёлтый,
       старый — оранжево-чёрный с редкими горячими языками. */
    const heat = flow.mul(1.25).sub(age.mul(0.95)).add(fres.mul(-0.35)).clamp(0, 1);
    const hot = mix(cB, cA, smoothstep(float(0.55), float(0.95), heat));
    const body = mix(cC, hot, smoothstep(float(0.08), float(0.6), heat));
    /* Кант по френелю темнеет к саже: край шара — это уже дым. К концу
       жизни саже уходит и тело целиком. */
    const soot = cC.mul(0.35);
    const rimmed = mix(body, soot, fres.pow(1.8).mul(0.75).mul(age.mul(0.7).add(0.3)));
    m.colorNode = mix(rimmed, soot, age.pow(1.6).mul(0.8));
    const alpha = intensity.mul(oneMinus(age.pow(1.3)).pow(1.3)).mul(keep).mul(oneMinus(fres.pow(2.5).mul(0.55)));
    m.opacityNode = alpha.clamp(0, 1);
    /* В свечение уходит только ЖАР: сажа не светится. */
    return markGlow(m, smoothstep(float(0.35), float(0.9), heat).mul(alpha).mul(1.1).clamp(0, 1));
  });
}

/**
 * Взрыв. `radius` → `endRadius` за `life` секунд (замедляясь), цвета от ядра к
 * краю: `colours = [ядро, тело, край]`. `squash` прижимает к полу. С
 * `flash` (по умолчанию) в первые доли секунды сверху рисуется бело-горячий
 * аддитивный шар — свет удара, который видно и с трансляционной дистанции.
 */
export function burst(vfx, { x, y = 1.0, z, radius = 1.2, endRadius = null, life = 0.7, mode = 'fire', colours, displace = 0.55, intensity = 1, squash = 1, order = 9, flash = true, at = 0 }) {
  const m = burstMat(mode);
  const u = m.userData.u;
  u.seed.value = ((x * 3.7 + z * 5.1) % 7) + 1;
  u.displace.value = displace; u.intensity.value = intensity;
  if (colours) { u.cA.value.copy(colours[0]); u.cB.value.copy(colours[1]); u.cC.value.copy(colours[2] || colours[1]); }
  const mesh = new THREE.Mesh(burstGeo(), m);
  mesh.position.set(x, y, z);
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  const r1 = endRadius ?? radius * 2.1;
  const r0 = radius * 0.25;
  /*
   * `at` — НА СКОЛЬКО СЕКУНД ВСПЫШКА ОПАЗДЫВАЕТ. Просил агент льда: у мигания
   * в описи есть ручка `gap` («вспышка на прилёте позже вспышки на отлёте»),
   * и она ничего не делала — `burst` про опоздание не знал, обе вспышки
   * выходили в один кадр. Приём тот же, что у следов (`decal`): меш до срока
   * стоит нулевого размера, а не рождается позже, — пул мешей не умеет
   * отложенный старт, зато умеет масштаб.
   */
  const DELAY = Math.max(0, at);
  const total = life + DELAY;
  vfx.spawnMesh(mesh, total, (o, t) => {
    const s = t * total;
    if (s < DELAY) { o.scale.set(0, 0, 0); return; }
    const k = Math.min(1, (s - DELAY) / Math.max(0.001, life));
    const r = r0 + (r1 - r0) * easeOutCubic(k);
    o.scale.set(r, r * squash, r);
    u.age.value = k;
  });
  if (flash && mode !== 'flash' && colours) {
    const fm = burstMat('flash');
    const fu = fm.userData.u;
    fu.seed.value = u.seed.value + 3; fu.displace.value = 0.3; fu.intensity.value = 1.6 * intensity;
    fu.cA.value.copy(colours[0]); fu.cB.value.copy(colours[1]); fu.cC.value.copy(colours[1]);
    const fl = new THREE.Mesh(burstGeo(), fm);
    fl.position.set(x, y, z);
    fl.renderOrder = order + 1;
    fl.frustumCulled = false;
    const fr1 = r1 * 0.85;
    const fLife = Math.min(0.28, life * 0.45);
    vfx.spawnMesh(fl, fLife + DELAY, (o, t) => {
      const s = t * (fLife + DELAY);
      if (s < DELAY) { o.scale.set(0, 0, 0); return; }
      const k = Math.min(1, (s - DELAY) / Math.max(0.001, fLife));
      const r = r0 + (fr1 - r0) * easeOutCubic(k);
      o.scale.set(r, r * squash, r);
      fu.age.value = k;
    });
  }
  return mesh;
}

/* ── ударная волна по полу ──────────────────────────────────────────────── */

let SHOCK_GEO = null;
function shockGeo() {
  if (!SHOCK_GEO) {
    SHOCK_GEO = shared(new THREE.RingGeometry(0.5, 1, 80, 1));
    SHOCK_GEO.rotateX(-Math.PI / 2);
  }
  return SHOCK_GEO;
}

function shockMat(hot) {
  return pooled(hot ? 'shock:hot' : 'shock:dust', () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: hot ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const age = uniform(0), seed = uniform(0), intensity = uniform(1), colour = uniform(new THREE.Color(1, 0.8, 0.5));
    /* `half` — полураствор сектора в радианах; π (по умолчанию) = целое
       кольцо. Нужен фронту волны конуса (радиация §6.5). Направление НЕ
       мапится в шейдере — меш поворачивается по Y (см. `shockwave`). */
    const half = uniform(Math.PI);
    m.userData.u = { age, seed, intensity, colour, half };
    /* uv кольца — квадрат описанной окружности; радиус — расстояние до центра. */
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const d = q.length();
    const ang = TSL.atan(q.y, q.x);
    const rag = mx_fractal_noise_float(vec3(tcos(ang).mul(2.2), tsin(ang).mul(2.2), seed), 2, 2.0, 0.5, 1).mul(0.35).add(0.85);
    /* Клин: uv-угол 0 — местная ось +x, и `step(edge, x)` берёт край ПЕРВЫМ. */
    const wedge = tstep(tcos(half), tcos(ang));
    if (hot) {
      const band = smoothstep(float(0.62), float(0.8), d).mul(oneMinus(smoothstep(float(0.86), float(1.0), d))).mul(wedge);
      m.colorNode = mix(colour, vec3(1, 1, 1), oneMinus(age).mul(0.5));
      const alpha = band.mul(rag).mul(oneMinus(age).pow(2.0)).mul(intensity);
      m.opacityNode = alpha.clamp(0, 1);
      return markGlow(m, alpha.clamp(0, 1));
    }
    /* ПЫЛЬ: широкая тёмная волна, поднятая ударом. Обычный блендинг —
       аддитивное кольцо на белом полу невидимо (замер выше по проекту). */
    const band = smoothstep(float(0.5), float(0.7), d).mul(oneMinus(smoothstep(float(0.8), float(1.0), d))).mul(wedge);
    const grain = mx_noise_float(vec3(q.mul(6.0), seed.add(3))).mul(0.5).add(0.5);
    m.colorNode = mix(colour.mul(0.35), vec3(0.16, 0.14, 0.12), grain.mul(0.6).add(0.2));
    const alpha = band.mul(rag).mul(grain.mul(0.5).add(0.5)).mul(oneMinus(age).pow(1.3)).mul(intensity).mul(0.8);
    m.opacityNode = alpha.clamp(0, 1);
    return markGlow(m, float(0));
  });
}

/**
 * Ударная волна: пылевое кольцо, расширяющееся от `r0` до `radius` за
 * `life` секунд, и внутри — горячее светящееся, гаснущее вдвое быстрее.
 */
/*
 * `hot` — ВТОРОЙ, СВЕТЯЩИЙСЯ СЛОЙ ФРОНТА, и его можно выключить.
 *
 * Он рисовался безусловно и уходил в bloom. Стихии без свечения — кинетика
 * и гравитация — платили за это чужим накалом на своём фронте, и кинетике
 * пришлось завести СВОЮ волну, сорок строк копии этой же мысли. Просили оба
 * агента, независимо. Значение по умолчанию прежнее: у кого свечение есть,
 * у того ничего не изменилось.
 */
export function shockwave(vfx, { x, z, radius = 5, r0 = 0.6, life = 0.6, colour, intensity = 1, y = 0.06, dust = true, dir = null, half = null, hot = true }) {
  const make = (hot, lifeK, order) => {
    const m = shockMat(hot);
    const u = m.userData.u;
    u.seed.value = ((x * 1.3 + z * 2.9) % 5) + 1;
    u.intensity.value = intensity;
    if (colour) u.colour.value.copy(colour);
    if (u.half) u.half.value = half == null ? Math.PI : half;
    const mesh = new THREE.Mesh(shockGeo(), m);
    /*
     * ПОЧЕМУ −π/2. uv-угол 0 геометрии кольца — её местная ось +x
     * (`RingGeometry` + `rotateX(−π/2)` уводит местную y в мировую −z);
     * мировой курс `h` смотрит в `(sin h, cos h)`, как в `Vfx.cone`; поворот
     * на θ вокруг Y уносит местную +x в `(cos θ, −sin θ)`. Отсюда θ = h − π/2.
     * Если фронт лёг на 90° мимо сектора — ошибка ровно в этом знаке.
     */
    if (dir != null) mesh.rotation.y = dir - Math.PI / 2;
    mesh.position.set(x, y + (hot ? 0.01 : 0), z);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    vfx.spawnMesh(mesh, life * lifeK, (o, t) => {
      const r = r0 + (radius - r0) * easeOutCubic(t);
      o.scale.set(r, 1, r);
      u.age.value = t;
    });
    return mesh;
  };
  const cool = dust ? make(false, 1.0, 5) : null;
  return hot ? make(true, 0.55, 6) : cool;
}

/* ── следы на полу ──────────────────────────────────────────────────────── */

/**
 * Декали — инстансированное поле на тип: один материал, один вызов
 * отрисовки, возраст каждого следа считается в шейдере от часов. Стойкость —
 * секунды до начала затухания (`hold`), бюджет — `MAX_DECALS` на тип, кольцо:
 * самый старый след уступает место.
 *
 * Типы: `soot` — сажа; `scorch` — ожог с остывающими трещинами; `frost` —
 * иней с тёмными трещинами; `arc` — ветвистый электрический ожог;
 * `grav` — концентрические кольца, сжимающиеся к центру (продавленный пол);
 * `time` — циферблат тёмными линиями; `acid` — глянцевая лужа с тёмным
 * мокрым ободом; `rad` — заражение: кляксы, пульсирующие цветом;
 * `crater` — воронка кольцами; `laser` — оплавленное стекловидное пятно с
 * тёмным ободом и лучами (лазер плавит, а не жжёт: иней и ожог не подошли —
 * иней на белом полу невидим, у ожога горячие трещины). Все — плоские на
 * полу, обычный блендинг: сажа на белом столе обязана ТЕМНИТЬ, аддитивное
 * там невидимо.
 */
const MAX_DECALS = 28;
/*
 * ПОТОЛОК ПЛОТНОСТИ СЛЕДА ПО ТИПУ — «громкость», а не рисунок (объяснение у
 * `opacityNode` ниже). Тёмные типы держатся тоном и терпят низкий потолок;
 * светлые (иней, циферблат) на белом полу ниже 0.8 исчезают.
 */
const DECAL_PEAK = {
  soot: 0.70, scorch: 0.72, crater: 0.74,   /* тёмные: тон несёт форму */
  frost: 0.82, time: 0.80,                  /* светлые: ниже — пропадают */
  arc: 0.66, grav: 0.68,                    /* линейные: рисунок читается и бледным */
  acid: 0.60, rad: 0.60, laser: 0.62,       /* цветные пятна: были громче всех */
};
/*
 * ПОТОЛОК СВЕЧЕНИЯ СЛЕДА. Свечение пола — вуаль во весь кадр, поэтому оно
 * режется отдельно от плотности и сильнее: ожог светился трещинами на 0.9,
 * лазер ободом на 0.35, кислота бликом на 0.3. Ноль — «этот след не светится
 * вовсе»; так у гравитации (у неё светится только ободок горизонта, и тот на
 * сфере) и у циферблата времени (время не горит).
 */
const DECAL_GLOW = {
  soot: 0, grav: 0, time: 0,
  scorch: 0.34, arc: 0.40, frost: 0.45,
  acid: 0.30, rad: 0.35, laser: 0.32, crater: 0.4,
};
/* Высота над полом — порядок наложения. Кислота НИЖЕ инея, ожога и лазера:
   капли и поздние следы обязаны лечь ПОВЕРХ лужи, а не под ней. */
const DECAL_Y = { soot: 0.018, scorch: 0.022, frost: 0.026, arc: 0.030, crater: 0.014, laser: 0.028, grav: 0.021, time: 0.023, acid: 0.020, rad: 0.025 };

class DecalField {
  constructor(scene, type, palette) {
    this.type = type;
    this.head = 0;
    /*
     * КВАД ШИРЕ ФОРМЫ. Жалоба основателя 04.09: «лужи обрезаются квадратом, в
     * который вписаны, видно границы». Так и было, и это чистая арифметика.
     * `q` шёл от −1 до 1, то есть `d` доходил до 1.0 по стороне квада, а
     * форма живёт до `d = порог + амплитуда шума`: копоть 1.0+0.42 = 1.42,
     * кислота 0.95+0.45 = 1.40, радиация 1.30, воронка 1.25. Всё, что дальше
     * 1.0, срезала ГЕОМЕТРИЯ — отсюда прямая грань поперёк рваного края.
     *
     * Лечится не формой, а полем: квад расширен множителем `DECAL_PAD`, и `q`
     * домножен на него же, поэтому в МИРЕ след остаётся ровно того же
     * размера и с той же частотой шума — прибавляется только пустота вокруг.
     * Цена — площадь квада в PAD² раз больше, заливка там прозрачная.
     */
    const geo = new THREE.PlaneGeometry(2 * DECAL_PAD, 2 * DECAL_PAD);
    geo.rotateX(-Math.PI / 2);
    /* born, hold, fade, seed */
    this.cfg = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 4), 4);
    this.cfg.setUsage(THREE.DynamicDrawUsage);
    /* Тон следа плюс ВРЕМЯ ПРОЯВЛЕНИЯ: (r, g, b, rise). Четвёртая компонента
       подсажена сюда, а не заведена своим буфером, нарочно — WebGPU даёт
       восемь вершинных буферов на геометрию, и тратить один на единственное
       число нельзя (§10.1). */
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 4), 4);
    this.tint.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('dcfg', this.cfg);
    geo.setAttribute('dtint', this.tint);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending });

    const cfg = attribute('dcfg', 'vec4');
    const tintRise = attribute('dtint', 'vec4');
    const tint = tintRise.xyz;
    const age = TIME.sub(cfg.x);
    const hold = cfg.y, fadeS = cfg.z, seed = cfg.w;
    const born = age.greaterThanEqual(float(0));
    /*
     * УХОД СГЛАЖЕН С ОБОИХ КОНЦОВ. Заказ основателя 04.09: «эффект произошёл —
     * и его нет; не резко, а с плавным затуханием». Линейная доля
     * `1 − (age−hold)/fade` кончается ПЛАВНО только по значению: у неё излом
     * производной в двух точках — в начале ухода (след стоял неподвижно и
     * вдруг поехал вниз) и в конце (ехал вниз и встал). Глаз видит именно
     * излом, а не значение: на полутора секундах ухода начало читается как
     * щелчок выключателя, а конец — как обрыв.
     *
     * Полином 3t²−2t³ по той же доле снимает оба излома разом: производная
     * ноль и в начале, и в конце. Тот же полином уже стоит на ВХОДЕ следа
     * (`inK` ниже), и это не совпадение — вход и выход обязаны быть одной
     * породы, иначе след возникает мягко и пропадает жёстко.
     */
    const kLin = oneMinus(age.sub(hold).div(fadeS.max(0.01))).clamp(0, 1);
    const k = kLin.mul(kLin).mul(kLin.mul(-2.0).add(3.0));
    /*
     * ПРОЯВЛЕНИЕ. Прежде след ВСПЫХИВАЛ на полную непрозрачность в первом же
     * кадре своей жизни: `k` при `age` 0 равен 1 + hold/fade и обрезался в 1
     * на всё время выдержки, так что никакого входа не было вовсе. Основатель
     * про кислоту: «след появляется почти мгновенно и очень резко, вместо
     * того чтобы плавно проявиться». Теперь вход — своя длительность `rise`
     * на каждый след (четвёртая компонента тона), сглаженная `smoothstep`:
     * лужа набегает за секунду, ожог вспыхивает за десятую долю.
     */
    const rise = tintRise.w.max(0.001);
    /*
     * Огибающая входа СЧИТАЕТСЯ ВРУЧНУЮ, а не через `smoothstep` с узловыми
     * краями. Замер: при `smoothstep(float(0), rise, age)` след выходил на
     * полную непрозрачность в первом же кадре — проба в браузере показала
     * возраст 0.216 с при `rise` 3.5 (то есть 1.1 % по формуле), а на экране
     * лужа лежала целиком. Полином тот же (3t²−2t³), но по явно зажатой доле
     * `age/rise`, и он ведёт себя предсказуемо.
     */
    const tIn = age.div(rise).clamp(0, 1);
    const inK = tIn.mul(tIn).mul(tIn.mul(-2.0).add(3.0));
    /*
     * ── ЖАР ОСТЫВАЕТ ЗА СВОЮ ЖИЗНЬ, А НЕ ЗА КОНСТАНТУ ────────────────────
     *
     * Ветки `scorch`, `arc` и `laser` считали остывание по глухому числу:
     * ожог 6 с, разряд 2.5 с, оплавление 1.5 с. Пока метки лежали по двадцать
     * секунд, это было безразлично; после чистки 04.09 выдержки стали 1–3 с, и
     * число стало ВРАТЬ в обе стороны разом. Поймал это агент молнии: при
     * выдержке 1.6 + уходе 1.8 ветка `arc` к середине жизни уже отдавала
     * восемь десятых тёмного, то есть след успевал стать пылью, ещё будучи
     * полностью непрозрачным, — «уходит уже серым».
     *
     * `COOL` — доля жизни, за которую метка остывает: 0.55 от `hold + fade`,
     * не короче 0.4 с. Тогда жар — свойство СОБЫТИЯ, а не календаря: короткий
     * разряд светится ярко и коротко, долгий пожар держит жар дольше, и ни
     * тот ни другой не гаснет в цвете раньше, чем в альфе.
     */
    const cool = hold.add(fadeS).mul(0.55).max(0.4);
    const heatK = oneMinus(age.div(cool)).clamp(0, 1);
    const life = born.select(k.mul(inK), float(0));
    const q = uv().sub(vec2(0.5, 0.5)).mul(2 * DECAL_PAD);
    const d = q.length();
    const p3 = vec3(q.mul(3.0), seed);
    /* Страховка от среза: к границе квада альфа обязана прийти в ноль. Порог
       1.44 выше самой длинной формы (1.42), так что ни одну ветку не режет. */
    const inQuad = oneMinus(smoothstep(float(1.44), float(DECAL_PAD - 0.02), d));

    let colour, alpha, glow = float(0);
    if (type === 'soot') {
      const edge = d.add(mx_fractal_noise_float(p3.mul(2.2), 3, 2.0, 0.5, 1).mul(0.42));
      const core = oneMinus(smoothstep(float(0.35), float(1.0), edge));
      const grain = mx_noise_float(p3.mul(9)).mul(0.5).add(0.5);
      colour = vec3(0.05, 0.045, 0.04).add(grain.mul(0.05));
      alpha = core.mul(grain.mul(0.4).add(0.7)).mul(0.86);
    } else if (type === 'scorch') {
      const edge = d.add(mx_fractal_noise_float(p3.mul(2.0), 3, 2.0, 0.5, 1).mul(0.38));
      const core = oneMinus(smoothstep(float(0.4), float(1.0), edge));
      const n = mx_noise_float(p3.mul(3.4).add(7.1));
      const cracks = oneMinus(smoothstep(float(0.0), float(0.075), tabs(n))).mul(core);
      /* Трещины остывают за 0.55 жизни метки (см. `heatK` выше), а не за
         глухие шесть секунд: ожог живёт от полутора секунд у мгновенной формы
         до длительности пожара у зоны, и одно число не годится обоим. */
      const heat = heatK.pow(1.6);
      const hot = mix(tint.mul(0.7), vec3(1, 0.62, 0.22), heat);
      colour = mix(vec3(0.06, 0.05, 0.045), hot, cracks.mul(heat.mul(0.9).add(0.1)));
      alpha = core.mul(0.88);
      glow = cracks.mul(heat).mul(0.9);
    } else if (type === 'frost') {
      const edge = d.add(mx_fractal_noise_float(p3.mul(2.4), 3, 2.0, 0.5, 1).mul(0.36));
      const core = oneMinus(smoothstep(float(0.5), float(1.0), edge));
      const rime = mx_fractal_noise_float(p3.mul(5.0).add(3.3), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
      const n = mx_noise_float(p3.mul(2.8).add(5.7));
      const cracks = oneMinus(smoothstep(float(0.0), float(0.05), tabs(n))).mul(core);
      /* иней светлый и ХОЛОДНЫЙ, трещины тёмные — щель это отсутствие света */
      colour = mix(mix(tint.mul(0.85), vec3(0.93, 0.98, 1.0), rime.mul(0.7)), vec3(0.04, 0.12, 0.16), cracks.mul(0.85));
      alpha = core.mul(rime.mul(0.5).add(0.45)).mul(0.9);
      glow = core.mul(rime).mul(0.18).add(cracks.mul(0.0));
    } else if (type === 'arc') {
      const core = oneMinus(smoothstep(float(0.25), float(1.0), d));
      const n = mx_noise_float(p3.mul(4.2).add(2.2));
      const n2 = mx_noise_float(p3.mul(7.7).add(9.9));
      const branches = oneMinus(smoothstep(float(0.0), float(0.05), tabs(n))).add(oneMinus(smoothstep(float(0.0), float(0.03), tabs(n2))).mul(0.6));
      const heat = heatK;
      colour = mix(vec3(0.05, 0.05, 0.06), mix(tint, vec3(1, 1, 1), heat.mul(0.6)), branches.mul(heat.mul(0.8).add(0.2)).clamp(0, 1));
      alpha = branches.clamp(0, 1).mul(core).mul(0.92);
      glow = branches.clamp(0, 1).mul(core).mul(heat);
    } else if (type === 'laser') {
      /* Стекло: почти круглое СВЕТЛОЕ пятно — оплавленный пол, в котором
         отражается свет: середина чуть ярче и холоднее пола (белое 1.05 с
         оттенком элемента, зерно, радиальные блики до 1.2), по краю ТОНКИЙ
         тёмный обод оплавления (0.84–0.93 радиуса), который и держит след на
         белом полу. Широкий обод 0.6–1.0 с плотностью 0.78 первого круга
         читался тенью-кляксой. Обод остывает ~1.5 с из оттенка в тёмный,
         середина в bloom едва, пока горяча. */
      const edge = d.add(mx_fractal_noise_float(p3.mul(2.0), 2, 2.0, 0.5, 1).mul(0.07));
      const glass = oneMinus(smoothstep(float(0.6), float(0.9), edge));
      const rim = smoothstep(float(0.84), float(0.9), edge).mul(oneMinus(smoothstep(float(0.93), float(1.0), edge)));
      const grain = mx_noise_float(p3.mul(8.0).add(4.4)).mul(0.5).add(0.5);
      const ang = TSL.atan(q.y, q.x);
      const rays = smoothstep(float(0.6), float(0.9), mx_noise_float(vec3(tcos(ang).mul(3.5), tsin(ang).mul(3.5), seed.add(2))).mul(0.5).add(0.5)).mul(glass);
      const heat = heatK;
      /* Середина ТЁПЛАЯ, а не синевато-белая (найдено агентом лазера): было
         (1.05, 1.06, 1.10) — то есть синьше белого пола, и оплавленное стекло
         читалось холодным, чем противоречило собственному ободу, который
         остывает из красного. */
      const glassC = mix(mix(tint.mul(0.9), vec3(1.10, 1.06, 1.02), grain.mul(0.35).add(0.5)), vec3(1.26, 1.20, 1.14), rays.mul(0.6));
      const dark = mix(vec3(0.06, 0.06, 0.08), tint.mul(0.45), 0.4);
      colour = mix(glassC, mix(dark, tint, heat.mul(0.5)), rim.clamp(0, 1));
      alpha = glass.mul(grain.mul(0.2).add(0.35)).add(rays.mul(0.25)).add(rim.mul(0.85)).clamp(0, 1);
      glow = glass.mul(heat).mul(0.12).add(rim.mul(heat).mul(0.35));
    } else if (type === 'grav') {
      /* ГРАВИТАЦИЯ: концентрические тёмные кольца, шаг которых СЖИМАЕТСЯ к
         центру, и чуть более тёмная середина — пол, продавленный весом.
         Никакого свечения: у гравитации светится только ободок горизонта, и
         тот на сфере, а не на полу. Кольца медленно ползут внутрь
         (`TIME·0.6`), поэтому колодец не выглядит наклейкой. */
      const core = oneMinus(smoothstep(float(0.75), float(1.0), d));
      /* Шаг по d^0.55: у центра кольца плотнее, у края реже. */
      /* Кольца ползут К ЦЕНТРУ, а не наружу (найдено агентом гравитации:
         комментарий обещал «внутрь», а знак давал наружу — точка постоянной
         фазы у `−TIME` уходит к краю). Стихия ТЯНЕТ; волны, убегающие от
         центра, говорят прямо противоположное. */
      const rings = tsin(d.pow(0.55).mul(26.0).add(TIME.mul(0.6))).mul(0.5).add(0.5);
      const line = smoothstep(float(0.55), float(0.95), rings);
      const dip = oneMinus(d).clamp(0, 1).pow(2.2);
      colour = mix(tint.mul(0.5), vec3(0.02, 0.02, 0.03), line.mul(0.7).add(dip.mul(0.3)));
      alpha = core.mul(line.mul(0.55).add(0.25).add(dip.mul(0.35))).clamp(0, 1).mul(0.92);
    } else if (type === 'time') {
      /* ВРЕМЯ: циферблат — обод, двенадцать штрихов и волосок-стрелка,
         тёмным умбровым по белому полу (P3: у времени на полу читаются
         ТЁМНЫЕ линии, а не бледные). Без свечения: время не горит. */
      const ang = TSL.atan(q.y, q.x);
      const rim = smoothstep(float(0.88), float(0.93), d).mul(oneMinus(smoothstep(float(0.97), float(1.0), d)));
      /* Двенадцать штрихов: |sin(6·угол)| у нуля — попали на штрих. */
      const tick = oneMinus(smoothstep(float(0.0), float(0.09), tabs(tsin(ang.mul(6.0)))))
        .mul(smoothstep(float(0.68), float(0.74), d)).mul(oneMinus(smoothstep(float(0.9), float(0.94), d)));
      /* Стрелка: волосок от центра до 0.62 радиуса, стоит (время встало). */
      const hand = oneMinus(smoothstep(float(0.0), float(0.045), tabs(tsin(ang.sub(float(-0.9))))))
        .mul(oneMinus(smoothstep(float(0.5), float(0.62), d)));
      const ink = rim.add(tick).add(hand.mul(0.8)).clamp(0, 1);
      const face = oneMinus(smoothstep(float(0.9), float(1.0), d)).mul(0.12);
      colour = mix(tint.mul(0.75), tint.mul(0.35), ink);
      alpha = ink.mul(0.9).add(face).clamp(0, 1);
    } else if (type === 'acid') {
      /* КИСЛОТА: глянцевая лужа. Край РВАНЫЙ по шуму (порог 0.45), чтобы ни
         одна лужа не была диском; по внешним 18 % радиуса — тёмный мокрый
         обод в `P[2]` (он и держит форму на белом полу, P3); внутри тело
         луже-зелёное; один HDR-блик вдоль `rot` в одном квадранте — от него
         лужа читается ЖИДКОЙ, а не пятном краски. */
      /*
       * ШУМ ПРИЖАТ К КРАЮ, А НЕ РАЗЛИТ ПО ВСЕМУ ПЯТНУ (найдено агентом
       * кислоты). Амплитуда 0.45 равнялась ВСЕЙ ширине окна `smoothstep(0.45,
       * 0.95)`, поэтому дыры шли по всей площади, и вокруг каждой дыры
       * рисовался ещё и мокрый обод: получался лишайник, а не лужа. Модулю
       * приходилось класть по четыре-пять следов внахлёст, чтобы залатать
       * середину. Множитель `smoothstep(0.3, 0.9, d)` оставляет шум только
       * там, где он и нужен, — на кромке; середина пятна сплошная, и одного
       * следа снова хватает.
       */
      /* Амплитуда 0.22, а не 0.45. Прижать шум к краю было половиной дела:
         0.45 всё ещё сравнимо с шириной окна `smoothstep(0.45, 0.95)` = 0.5,
         и кромка выходила КРУЖЕВНОЙ — с заливами до самой середины. Замерил
         агент кислоты: одного следа по-прежнему не хватало, приходилось
         класть четыре внахлёст. Меньше половины окна — край рваный, но
         связный, и пятно снова читается одним. */
      const ragged = mx_fractal_noise_float(p3.mul(3.5), 3, 2.0, 0.5, 1)
        .mul(0.22).mul(smoothstep(float(0.30), float(0.90), d));
      const edge = d.add(ragged);
      const core = oneMinus(smoothstep(float(0.45), float(0.95), edge));
      const rim = smoothstep(float(0.62), float(0.82), edge).mul(oneMinus(smoothstep(float(0.95), float(1.05), edge)));
      const grain = mx_noise_float(p3.mul(7.0).add(2.2)).mul(0.5).add(0.5);
      const body = mix(tint.mul(0.7), vec3(0.62, 0.91, 0.23), 0.55);
      /* Блик: узкая полоса 0.08 радиуса в одном квадранте. */
      const spec = oneMinus(smoothstep(float(0.0), float(0.08), tabs(q.y.sub(q.x.mul(0.45)))))
        .mul(smoothstep(float(0.0), float(0.3), q.x)).mul(core).mul(grain.mul(0.4).add(0.6));
      /* Блик БЫЛ HDR-белым (2.6, 2.8, 2.4) — то есть в два с половиной раза
         ярче белого пола, на который он лёг, плюс своя добавка в bloom. От
         этого лужа читалась не мокрой, а РАСКАЛЁННОЙ, и она была самым
         громким пятном в кадре («слишком яркие», заказ 04.09). 1.35 — это
         блик чуть ярче пола, ровно настолько, чтобы поверхность прочиталась
         жидкой. */
      colour = mix(mix(body, vec3(1.35, 1.42, 1.28), spec.mul(0.8)), tint.mul(0.55), rim.clamp(0, 1));
      alpha = core.mul(grain.mul(0.2).add(0.75)).mul(0.85).add(rim.mul(0.95)).clamp(0, 1);
      glow = spec.mul(0.3);
    } else if (type === 'rad') {
      /* РАДИАЦИЯ: заражённый пол — кляксы `P[1]` по тёмно-оливковой земле
         `P[2]`, ПУЛЬСИРУЮЩИЕ цветом (не в bloom: пол не имеет права цвести,
         §10.1). Держится и светится после того, как всё остальное погасло. */
      /*
       * КЛЯКСЫ, А НЕ ЗАЛИВКА. Замер 03.09 (судья, 22 из 100 за дисциплину):
       * при пороге кляксы 0.42–0.62 и подложке 0.5 пятно выходило СПЛОШНОЙ
       * жёлтой мазнёй — «читается лужей, а это прямое нарушение „никакой
       * жидкости“», и, что хуже, той же техникой, что лужа кислоты: две
       * стихии переставали различаться в РОДЕ. Порог поднят до 0.62–0.78
       * (клякс меньше и они мельче: шум ×7 вместо ×4.2), подложки между ними
       * почти нет (0.06 вместо 0.5) — между кляксами виден ЧИСТЫЙ ПОЛ, и
       * заражение читается сыпью, по которой скачет треск счётчика, а не
       * разлитой краской.
       */
      /*
       * ── СЫПЬ ПО РЕШЁТКЕ, А НЕ КЛЯКСЫ ПО ШУМУ (круг судей 04.09) ─────────
       *
       * Порог по фрактальному шуму — ТОТ ЖЕ ПРИЁМ, каким рисуется лужа
       * кислоты двадцатью строками выше, и судьи назвали это дважды: «у обеих
       * один и тот же словарь меток — рваные угловатые кляксы 4–10 px,
       * разделяет их только цвет». Цвет — не род вещества; пока рисунок
       * общий, две стихии остаются одной с разной подписью.
       *
       * Заражение — это ВЫПАВШИЕ ЧАСТИЦЫ, то есть множество отдельных
       * крупинок, а не связное пятно. Отдельность рисуется решёткой: `q`
       * квантуется в клетки, у каждой клетки свой сдвинутый шумом центр и
       * свой радиус, и крупинка — это диск вокруг него. Между крупинками
       * ЧИСТЫЙ ПОЛ по построению, а не по счастливому порогу; ни одна не
       * сливается с соседкой, потому что живёт в своей клетке.
       *
       * Девять клеток на радиус — крупинка выходит около 0.1 радиуса следа:
       * на трёхметровом пятне это 15 см, то есть видно с трансляции и не
       * складывается в мазню.
       */
      const core = oneMinus(smoothstep(float(0.6), float(1.0), d.add(mx_fractal_noise_float(p3.mul(2.0), 2, 2.0, 0.5, 1).mul(0.3))));
      const CELL = 9.0;
      const gq = q.mul(CELL);
      const gi = tfloor(gq);
      const gf = gq.sub(gi);
      const jx = mx_noise_float(vec3(gi, seed)).mul(0.5).add(0.5);
      const jz = mx_noise_float(vec3(gi.add(vec2(11.3, 7.1)), seed)).mul(0.5).add(0.5);
      const centre = vec2(jx.mul(0.66).add(0.17), jz.mul(0.66).add(0.17));
      const dd = gf.sub(centre).length();
      const rr = mx_noise_float(vec3(gi.add(vec2(3.7, 19.4)), seed)).mul(0.5).add(0.5);
      /* Радиус крупинки 0.06…0.34 клетки, край жёсткий: у выпавшей частицы
         нет мягкой каймы, мягкая кайма — это язык жидкости. */
      const blot = oneMinus(smoothstep(rr.mul(0.26).add(0.05), rr.mul(0.26).add(0.10), dd));
      /* Треск счётчика: пульсируют не все крупинки разом, а каждая в свою
         фазу — ровная пульсация всего пятна читалась бы лампой. */
      const pulse = tsin(TIME.mul(9.4).add(rr.mul(19.0))).mul(0.5).add(0.5);
      const hot = mix(tint, tint.mul(0.6), pulse);
      colour = mix(tint.mul(0.32), hot, blot.mul(core));
      alpha = core.mul(blot.mul(0.86).add(0.04)).mul(0.92);
      /* Свечение — ТОЛЬКО по краю кляксы и слабое: ровный светящийся диск на
         полу дал бы вуаль во весь кадр. */
      glow = blot.mul(oneMinus(blot)).mul(core).mul(0.8).clamp(0, 0.2);
    } else {
      /*
       * crater: тёмное кольцо с рваным краем и светлым отсыпанным валом.
       *
       * ЧАША КРАСИТСЯ СТИХИЕЙ. До 03.09 обе ветки цвета были константами, а
       * `tint` не читался вообще — во всех четырнадцати вызовах (void.js и
       * kinetic.js по семь) он передавался впустую. Судья это померил: «оба
       * элемента оставляют одинаковый бурый гравий», воронка пустоты и
       * воронка кинетики в одной коробке дали (160,151,142) и (152,145,137) —
       * разницу в шум. Теперь чаша уходит в `tint` (тёмную P[2]), а вал
       * остаётся отсыпанной породой, лишь подкрашенной ею: по цвету воронку
       * одной стихии видно рядом с воронкой другой. Чаша умножением держится
       * тёмной при любой палитре — на белом полу светлая воронка не читается.
       */
      const edge = d.add(mx_fractal_noise_float(p3.mul(2.0), 2, 2.0, 0.5, 1).mul(0.25));
      const bowl = oneMinus(smoothstep(float(0.2), float(0.8), edge));
      const rim = smoothstep(float(0.6), float(0.78), edge).mul(oneMinus(smoothstep(float(0.85), float(1.0), edge)));
      const dark = mix(vec3(0.11, 0.1, 0.09), tint.mul(0.5), 0.7);
      const ejecta = mix(vec3(0.6, 0.58, 0.54), tint, 0.45);
      colour = mix(dark, ejecta, rim);
      alpha = bowl.mul(0.75).add(rim.mul(0.55)).clamp(0, 1);
    }
    m.colorNode = colour;
    /*
     * ── ПОТОЛОК ПЛОТНОСТИ И РАННЯЯ СМЕРТЬ СВЕЧЕНИЯ (заказ 04.09) ──────────
     *
     * Основатель: «лужи слишком яркие и слишком заметные». Две причины, и
     * гасить их надо по-разному.
     *
     * ПЕРВАЯ — плотность самой метки. Каждая ветка выше выводила альфу почти
     * в единицу (кислота 0.85 тела + 0.95 обода, радиация 0.92, гравитация
     * 0.92, дуга 0.92, ожог 0.88, копоть 0.86): на белом столе это ПЛАШКА,
     * которая спорит с телами и снарядами. Потолок ставится ЗДЕСЬ, одной
     * величиной на тип, а не правкой десяти формул: формулы задают РИСУНОК
     * следа (рваный край, обод, трещины), и трогать их ради громкости значит
     * ломать рисунок. `DECAL_PEAK` — это громкость.
     *
     * Числа не с потолка: тип, который на белом полу держится тоном (копоть,
     * ожог, воронка — тёмные), теряет от снижения меньше всех и получает
     * 0.72; цветные пятна (кислота, радиация, лазер) — 0.62, они и были
     * громче всех; иней и циферблат — светлые и бледные, ниже 0.8 они
     * пропадают вовсе, и это тот самый урок «на белом полу бледное не
     * читается», за который гравитация once получила 28 из 100.
     *
     * ВТОРАЯ — свечение. Пол в bloom — это вуаль во весь кадр, и она живёт
     * ровно столько, сколько живёт след. Свечение теперь гаснет по КУБУ
     * общей огибающей: на середине ухода от него остаётся 12 %, к трём
     * четвертям — 2 %. То есть жар виден, пока эффект ПРОИСХОДИТ, и пол
     * перестаёт быть источником света задолго до того, как метка исчезнет.
     */
    m.opacityNode = alpha.mul(float(DECAL_PEAK[type] ?? 0.72)).mul(life).mul(inQuad).clamp(0, 1);
    markGlow(m, glow.mul(life).mul(life).mul(life).mul(float(DECAL_GLOW[type] ?? 0.5)).clamp(0, 1));

    this.mesh = new THREE.InstancedMesh(geo, m, MAX_DECALS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.position.y = DECAL_Y[type] ?? 0.02;
    /* Все инстансы стартуют мёртвыми: масштаб ноль и рождение в далёком прошлом. */
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DECALS; i++) { this.mesh.setMatrixAt(i, z); this.cfg.setXYZW(i, -1e6, 0, 1, 0); }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
    this.mat = new THREE.Matrix4();
  }

  place({ x, z, radius, rot, now, hold, fade, seed, tint, rise }) {
    const i = this.head; this.head = (this.head + 1) % MAX_DECALS;
    this.mat.makeRotationY(rot).scale(new THREE.Vector3(radius, 1, radius)).setPosition(x, 0, z);
    this.mesh.setMatrixAt(i, this.mat);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cfg.setXYZW(i, now, hold, fade, seed);
    this.cfg.needsUpdate = true;
    this.tint.setXYZW(i, tint.r, tint.g, tint.b, rise);
    this.tint.needsUpdate = true;
  }
}

/*
 * ЗАПАС КВАДА вокруг следа: больше самой длинной формы (копоть, 1.42) с
 * зазором под страховочную маску.
 */
const DECAL_PAD = 1.6;

/*
 * ВРЕМЯ ПРОЯВЛЕНИЯ по типу следа, секунды. Это не украшение: скорость, с
 * которой метка набегает, — часть её вещества. Ожог, копоть и воронка
 * возникают в момент удара (0.05–0.12 с); иней нарастает (0.35); лужа
 * кислоты РАСТЕКАЕТСЯ, и ей нужна почти секунда — с неё и начался разговор.
 */
const DECAL_RISE = { soot: 0.10, scorch: 0.08, frost: 0.35, arc: 0.06, crater: 0.05, laser: 0.12, grav: 0.30, time: 0.45, acid: 0.90, rad: 0.55 };

/*
 * ── ТРИ ЧИСЛА ЗАКАЗА 04.09, В ОДНОМ МЕСТЕ ────────────────────────────────
 *
 * «Эффект сработал — пусть исчезает сразу после эффекта, не моментально, а
 * постепенно. Никакого мусора и визуального шума». Это одно правило, и у
 * него три границы; они живут здесь, а не в гейте, потому что это политика
 * СЛОЯ. Гейт (`tools/checkdecay.mjs`) их читает и меряет по ним каждую
 * форму каждой стихии; README называет их же и привязан к ним через
 * `checkdocs`. Один источник, три читателя.
 */
/** Потолок выдержки следа, с. Зажимается в `decal` — объяснение там. */
export const DECAL_HOLD_MAX = 8;
/** Сколько эффекту позволено жить ПОСЛЕ конца собственной формы, с. */
export const TAIL_MAX = 5;
/** Быстрее этого след не имеет права уходить, с («не моментально»). */
export const FADE_MIN = 0.6;
/*
 * ── ЧЕТВЁРТОЕ ЧИСЛО: УХОД ДОЛГОГО НОСИТЕЛЯ ───────────────────────────────
 *
 * `FADE_MIN` — ПОЛ, и он не растёт вместе с формой. Судья приёмки поймал это
 * числом: шестисекундная оболочка законно гасла по тому же полу, что и
 * полусекундный замах. После его разбора гейт (`tools/checkdecay.mjs`) требует
 * участок «половина пика → пять процентов» не короче `0.045 · жизнь носителя`
 * с потолком 0.30 с.
 *
 * Проба меряет НЕ длительность ухода. У ухода, сглаженного полиномом 3t²−2t³,
 * участок 50 %→5 % равен 0.365 его длины (у прямой — 0.45). Значит носителю от
 * 6.7 с и дальше, где требование упирается в потолок, нужен уход
 * 0.30 / 0.365 = 0.82 с. Здесь стоит 0.85 — то же число с запасом на шаг
 * пробы: замер гейта на статусе даёт 0.31 при нужных 0.30, а не 0.30 впритык.
 */
export const FADE_LONG = 0.85;

/*
 * ОДИН РЕЦЕПТ УХОДА СТАТУСА, А НЕ ШЕСТЬ КОПИЙ.
 *
 * Эти две строки были написаны пять раз подряд — в «kinetic.js», «ice.js»,
 * «void.js», «arc/status.js» и (в другой расстановке) в «time.js», — и каждая
 * копия ссылалась в комментарии на предыдущую: «рецепт уже был написан в
 * time.js, здесь он повторён». Гейт показал, что это буквально одно число:
 * kinetic/status, frost/status, arc/status, void/status и time/status дали
 * РОВНО 0.222 с каждый (0.365 × `FADE_MIN`). Совпадение такого рода означает,
 * что чинить надо один раз.
 *
 * `left` — сколько осталось до `until`, срока, который держит СИМ: он
 * продлевает статус тиками, пока боец в зоне. Поэтому уход идёт ПОСЛЕ
 * `until`, а не перед ним: начни его раньше — следующий тик вернул бы
 * плотность обратно, и статус на теле мигал бы вместо того, чтобы гаснуть.
 * В ноль огибающая приходит на `until + span`.
 *
 * ПРЯТАТЬ МЕШ НАДО ПО ЭТОМУ ЖЕ НУЛЮ, а не по своему счётчику: спрятать
 * раньше, чем записана нулевая плотность, — это снова обрыв, тот самый, из-за
 * которого яма статуса пустоты падала в двести пятьдесят раз за три десятых.
 */
export function statusFade(left, span = FADE_LONG) {
  const k = Math.min(1, Math.max(0, (left + span) / span));
  return k * k * (3 - 2 * k);
}

/*
 * НАБЛЮДАТЕЛЬ ЗА СЛЕДАМИ — РАДИ ГЕЙТА (`tools/checkdecay.mjs`), и это
 * единственная его причина. Поле декалей наружу не отдаёт ничего, а лезть в
 * инстансированный буфер значило бы проверять РЕАЛИЗАЦИЮ вместо правила — и
 * вдобавок читать уже зажатое значение, то есть не отличить «модуль попросил
 * две секунды» от «модуль попросил тридцать и его зажали». Гейт обязан видеть
 * ЗАПРОС. В браузере наблюдателя нет: `null` стоит по умолчанию и ставится
 * только из инструмента.
 */
let decalWatch = null;
export function watchDecals(fn) { decalWatch = typeof fn === 'function' ? fn : null; }

const decalFields = new WeakMap();

/**
 * Оставить след. `hold` — секунды до начала затухания (по умолчанию 22),
 * `fade` — секунды затухания, `rise` — секунды ПРОЯВЛЕНИЯ (по умолчанию своё
 * у каждого типа, см. `DECAL_RISE`), `at` — на сколько секунд след опаздывает.
 * Радиус — в метрах, как след умения.
 *
 * СЛЕД-ОСТАТОК И СЛЕД-ПРОЕКЦИЯ — это разные вещи, и путать их нельзя.
 * Ожог, копоть, лужа — ОСТАТОК: их дело пережить эффект, и `hold` у них
 * большой. Циферблат времени, кольца сжатия под живым колодцем — ПРОЕКЦИЯ
 * работающего эффекта на пол: они обязаны умереть вместе с ним, иначе на полу
 * остаётся часовой циферблат от пузыря, которого давно нет (жалоба
 * основателя). Проекции передают `hold` от собственной длительности умения.
 */
export function decal(vfx, { type = 'soot', x, z, radius = 2, rot = null, hold = 2.5, fade = 2, tint = null, seed = null, at = 0, rise = null }) {
  /* `now` в наблюдателе — не роскошь: метку кладут и ИЗ ХОДА формы (лужа
     навеса — в момент, когда колба разбилась), и тогда её рождение — это
     не `at`, а часы вьювера. Гейт, читавший только `at`, считал такую метку
     родившейся в нуле и недосчитывал ей полжизни. */
  if (decalWatch) decalWatch({ type, hold, fade, at, radius, x, z, now: vfx.now });
  let fields = decalFields.get(vfx);
  if (!fields) { fields = {}; decalFields.set(vfx, fields); }
  if (!fields[type]) fields[type] = new DecalField(vfx.scene, type);
  fields[type].place({
    /* `at` — на сколько секунд след ОПАЗДЫВАЕТ (капля кислоты ещё летит,
       канистра ещё не упала). Шейдер и так считает будущий `born`
       невидимым, так что достаточно сдвинуть часы рождения вперёд. */
    /*
     * ПОТОЛОК ВЫДЕРЖКИ — СТРУКТУРНАЯ ГАРАНТИЯ, А НЕ ВКУС.
     *
     * Правило основателя 04.09 звучит как свойство слоя, а не как настройка
     * модуля: «эффект сработал — и его нет». Пока выдержка была свободным
     * числом в двадцати с лишним местах, правило держалось на дисциплине
     * десяти файлов, и держалось плохо: после общей чистки в дереве всё ещё
     * оставались 20 с у штатного луча, 16 и 10 с у времени. Один забытый
     * вызов — и арена снова в пятнах.
     *
     * Поэтому потолок стоит на ВХОДЕ поля, где его нельзя обойти. Восемь
     * секунд выбраны так, чтобы не задеть ни одну законную ПРОЕКЦИЮ: самая
     * длинная живущая форма в грамматике — стена и щит по 5 с, зона короче,
     * и проекция под ними держится ровно своей длительностью. Всё, что
     * просит больше восьми, — это ОСТАТОК, переживший своё событие, то есть
     * ровно то, что заказом запрещено.
     */
    x, z, radius, rot: rot ?? ((x * 7.1 + z * 3.3) % 6.28), now: vfx.now + at,
    hold: Math.min(hold, DECAL_HOLD_MAX), fade,
    seed: seed ?? (((x * 2.3 + z * 1.7) % 9) + 1), tint: tint || new THREE.Color(0.5, 0.5, 0.5),
    rise: rise ?? DECAL_RISE[type] ?? 0.12,
  });
}

/* ── марево ─────────────────────────────────────────────────────────────── */

/**
 * Прокси теплового искажения: биллборд, который ничего не рисует в цвет и
 * пишет в выход `distort` шумовое смещение. Пост-граф сдвигает по нему
 * картинку. На бэкенде без MRT — невидим и безвреден.
 */
function heatMat() {
  return pooled('heat', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending });
    const fade = withFade(m);
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const mask = oneMinus(q.length()).clamp(0, 1).pow(1.4);
    const drift = vec3(uv().mul(3.0), TIME.mul(1.7));
    const ox = mx_noise_float(drift), oz = mx_noise_float(drift.add(vec3(4.1, 2.2, 0)));
    m.colorNode = vec3(0, 0, 0);
    m.opacityNode = float(0);
    markDistort(m, vec2(ox, oz), mask.mul(fade));
    /* Биллборд по осям экрана, как у частиц. */
    const { cameraProjectionMatrix, modelViewMatrix, vec4 } = TSL;
    m.vertexNode = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(0, 0, 0, 1)).add(vec4(positionLocal.xy, 0, 0)));
    return m;
  }, 8);
}

let HEAT_GEO = null;
/** Марево над точкой: `size` метров, `life` секунд, сила спадает к концу. */
export function heat(vfx, { x, y = 1.2, z, size = 3, life = 1.5, strength = 1 }) {
  if (!HEAT_GEO) HEAT_GEO = shared(new THREE.PlaneGeometry(1, 1));
  const m = heatMat();
  const mesh = new THREE.Mesh(HEAT_GEO, m);
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(size);
  mesh.renderOrder = 12;
  mesh.frustumCulled = false;
  vfx.spawnMesh(mesh, life, (o, t) => {
    o.material.userData.fade.value = strength * (1 - t) * (1 - t);
    o.scale.setScalar(size * (1 + t * 0.4));
  });
  return mesh;
}

/* ── линза ──────────────────────────────────────────────────────────────── */

function lensMat() {
  return pooled('lens', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending });
    const fade = withFade(m);
    /* Смещение РАДИАЛЬНОЕ К ЦЕНТРУ (у марева — шумовое): картинка за линзой
       стягивается внутрь, как у гравитационного колодца. Сила падает от
       центра к краю по (1 − r)^1.5, иначе край проксивного квадрата виден
       ступенькой. */
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const mask = oneMinus(q.length()).clamp(0, 1).pow(1.5);
    m.colorNode = vec3(0, 0, 0);
    m.opacityNode = float(0);
    markDistort(m, q.negate().mul(mask), mask.mul(fade));
    const { cameraProjectionMatrix, modelViewMatrix, vec4 } = TSL;
    m.vertexNode = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(0, 0, 0, 1)).add(vec4(positionLocal.xy, 0, 0)));
    return m;
  }, 6);
}

let LENS_GEO = null;
/**
 * ЛИНЗА: искажение к центру. В отличие от марева (`heat`), которое гаснет от
 * рождения, линза ДЕРЖИТ силу всю жизнь и отпускает за последние 0.3 с —
 * гравитационный колодец не «остывает», он выключается.
 */
export function lens(vfx, { x, y = 1.0, z, size = 3, life = 1.5, strength = 1, out = null, env = null }) {
  if (!LENS_GEO) LENS_GEO = shared(new THREE.PlaneGeometry(1, 1));
  const m = lensMat();
  const mesh = new THREE.Mesh(LENS_GEO, m);
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(size);
  mesh.renderOrder = 12;
  mesh.frustumCulled = false;
  /*
   * УХОД ЛИНЗЫ БЫЛ 0.3 с — ВДВОЕ БЫСТРЕЕ СОБСТВЕННОГО ПОЛА СЛОЯ (`FADE_MIN`).
   * Число стояло здесь константой и не спрашивалось ни у кого: на статусе
   * гравитации именно линза оказалась той кривой, что упирала общую огибающую
   * формы в 0.228 с при требовании гейта 0.30 (замер `tools/checkdecay.mjs`,
   * gravity/status). Теперь уход — параметр, по умолчанию пол слоя, и он
   * зажат сроком самой линзы: у короткой (навес, удар) он ужимается до 0.4 её
   * жизни, чтобы вспышка не превратилась в кисель.
   */
  const OUT = Math.max(0.001, Math.min(out ?? FADE_MIN, life * 0.4));
  vfx.spawnMesh(mesh, life, (o, t) => {
    const s = t * life;
    const own = s < life - OUT ? 1 : Math.max(0, (life - s) / OUT);
    /* `env` — ВНЕШНЯЯ огибающая (уход статуса по `until`, срок которого держит
       сим). Своя рампа при этом остаётся и УМНОЖАЕТСЯ, а не заменяется: если
       сим продлит статус дальше жизни носителя, линзу всё равно снимет пул, и
       без своей рампы это был бы обрыв на полной плотности. */
    o.material.userData.fade.value = strength * own * (env ? env() : 1);
  });
  return mesh;
}

/* ── рецепты частиц ─────────────────────────────────────────────────────── */

/** Формы частиц (см. `Particles`): индексы в `cfg.w`. */
export const SHAPE = { dot: 0, streak: 1, shard: 2, spark: 3, smoke: 4, chip: 5, flame: 6, ring: 7 };

/**
 * Дым: медленный подъём, рост, тёмный к светлому, обычный блендинг.
 * `dark` — цвет сажи, `lit` — цвет подсветки (огонь снизу).
 */
export function smoke(vfx, { x, y = 0.6, z, n = 40, radius = 1.2, dark, lit, rise = 2.2, life = 2.4, size = 1.1, at = null, spread = 1.0, r = Math.random }) {
  const born = at ?? vfx.now;
  vfx.body.emit(n, (i, s) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    s.pos(x + Math.sin(a) * d, y + r() * 0.4, z + Math.cos(a) * d);
    s.vel(Math.sin(a) * spread * rnd(0.3, 1.4, r), rnd(rise * 0.5, rise * 1.3, r), Math.cos(a) * spread * rnd(0.3, 1.4, r));
    s.gravity(rnd(-0.2, 0.2, r), rnd(-0.6, -0.2, r), rnd(-0.2, 0.2, r));
    s.color(lit || dark, dark);
    s.life(born + r() * 0.25, rnd(life * 0.6, life * 1.3, r), rnd(size * 0.6, size * 1.4, r), SHAPE.smoke);
    s.ext(rnd(-1.2, 1.2, r), 2.6, 0, 0.15);
  });
}

/** Угли: горячие штрихи вверх и в стороны, гаснут по цвету, падают. */
export function embers(vfx, { x, y = 0.8, z, n = 60, radius = 1.0, hot, cool, speed = 5, up = 5, life = 1.4, size = 0.16, at = null, r = Math.random }) {
  const born = at ?? vfx.now;
  vfx.add.emit(n, (i, s) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    s.pos(x + Math.sin(a) * d, y + r() * 0.5, z + Math.cos(a) * d);
    const v = rnd(speed * 0.3, speed, r);
    s.vel(Math.sin(a) * v, rnd(up * 0.4, up, r), Math.cos(a) * v);
    s.gravity(0, rnd(-9, -4, r), 0);
    s.color(hot, cool);
    s.life(born + r() * 0.15, rnd(life * 0.5, life * 1.4, r), rnd(size * 0.6, size * 1.5, r), SHAPE.streak);
    s.ext(0, 0.4, 1, 1);
  });
}

/** Обломки: угловатые, тяжёлые, крутятся, обычный блендинг. */
export function debris(vfx, { x, y = 0.5, z, n = 24, radius = 0.8, colour, glowColour = null, speed = 7, up = 7, life = 1.6, size = 0.28, at = null, r = Math.random }) {
  const born = at ?? vfx.now;
  vfx.body.emit(n, (i, s) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    s.pos(x + Math.sin(a) * d, y, z + Math.cos(a) * d);
    const v = rnd(speed * 0.3, speed, r);
    s.vel(Math.sin(a) * v, rnd(up * 0.5, up, r), Math.cos(a) * v);
    s.gravity(0, rnd(-16, -11, r), 0);
    s.color(glowColour || colour, colour);
    s.life(born, rnd(life * 0.7, life * 1.3, r), rnd(size * 0.6, size * 1.6, r), SHAPE.chip);
    s.ext(rnd(-9, 9, r), 0.9, 0, glowColour ? 0.5 : 0);
  });
}

/** Искры: быстрые, тонкие, вытянуты по скорости, светятся целиком. */
export function sparks(vfx, { x, y = 1.0, z, n = 50, colour, tail = null, speed = 9, life = 0.5, size = 0.12, gravity = -12, cone = null, at = null, r = Math.random }) {
  const born = at ?? vfx.now;
  vfx.add.emit(n, (i, s) => {
    let ux, uy, uz;
    if (cone) {
      const a = cone.dir + (r() * 2 - 1) * cone.half;
      ux = Math.sin(a); uz = Math.cos(a); uy = rnd(-0.2, 0.6, r);
    } else {
      const a = r() * Math.PI * 2, e = rnd(-0.3, 1, r);
      ux = Math.sin(a) * Math.cos(e); uz = Math.cos(a) * Math.cos(e); uy = Math.sin(e);
    }
    const v = rnd(speed * 0.3, speed, r);
    s.pos(x, y, z);
    s.vel(ux * v, uy * v, uz * v);
    s.gravity(0, gravity, 0);
    s.color(colour, tail || colour);
    s.life(born, rnd(life * 0.5, life * 1.5, r), rnd(size * 0.6, size * 1.4, r), SHAPE.spark);
    s.ext(0, 0.3, 1, 1);
  });
}

/** Туман / пар / пыль: крупные мягкие, медленные, обычный блендинг. */
export function mist(vfx, { x, y = 0.3, z, n = 24, radius = 1.5, colour, colour2 = null, life =1.8, size = 1.4, rise = 0.6, at = null, r = Math.random }) {
  const born = at ?? vfx.now;
  vfx.body.emit(n, (i, s) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    s.pos(x + Math.sin(a) * d, y + r() * 0.3, z + Math.cos(a) * d);
    s.vel(Math.sin(a) * rnd(0.2, 0.9, r), rnd(rise * 0.4, rise, r), Math.cos(a) * rnd(0.2, 0.9, r));
    s.gravity(0, -0.15, 0);
    s.color(colour, colour2 || colour);
    s.life(born + r() * 0.2, rnd(life * 0.7, life * 1.3, r), rnd(size * 0.6, size * 1.5, r), SHAPE.smoke);
    s.ext(rnd(-0.6, 0.6, r), 1.9, 0, 0.1);
  });
}

/* ── заряд и выброс ─────────────────────────────────────────────────────── */

/**
 * Заряд у кастера в замахе: сходящиеся к точке искры и растущее ядро.
 * Группа следует за телом (`ctx.bodyPos`), живёт ровно `secs`.
 */
export function charge(vfx, { who, x, z, y = 1.2, secs = 0.4, colours, mode = 'fire', ctx, n = 40, radius = 1.8, r = null }) {
  const P = colours;
  const born = vfx.now;
  /*
   * СЛУЧАЙ — ОТ КАСТА, А НЕ ОТ `Math.random`. Искры замаха брали угол и
   * момент рождения прямо из `Math.random()`, и это не мелочь: замах есть у
   * всех десяти стихий, то есть ОДИН И ТОТ ЖЕ ПОСЕВ ДАВАЛ РАЗНЫЙ КАДР во
   * всей игре, вопреки §9 («никакого `Math.random`, весь случай — от
   * `mulberry(seedOf(e))`»). Нашлось 03.09 при разборе замеров: судьи
   * сравнивали формы `charge` лазера, пустоты и кинетики попиксельно против
   * общей медианы десяти стихий — по недетерминированному замаху такая
   * мерка считает шум, а не эффект. Генератор теперь либо приходит от модуля
   * (`r: rng`), либо строится от точки каста — той же связкой `x, z`, что
   * уже кормит `seed` ядра строкой ниже.
   */
  const rr = r || mulberry((Math.round(x * 97.3 + z * 31.7) ^ 0x5bd1e995) >>> 0);
  const core = burstMat(mode);
  core.userData.u.cA.value.copy(P[0]); core.userData.u.cB.value.copy(P[1]); core.userData.u.cC.value.copy(P[1]);
  core.userData.u.displace.value = 0.25; core.userData.u.intensity.value = 1.2;
  core.userData.u.seed.value = ((x * 2.1 + z * 4.3) % 7) + 1;
  const orb = new THREE.Mesh(burstGeo(), core);
  orb.frustumCulled = false;
  orb.renderOrder = 9;
  const g = new THREE.Group();
  g.add(orb);
  g.position.set(x, y, z);
  vfx.spawnMesh(g, secs, (o, t) => {
    const p = ctx && ctx.bodyPos ? ctx.bodyPos(who) : null;
    if (p) o.position.set(p.x, p.y + y, p.z);
    const r = 0.15 + 0.55 * t;
    orb.scale.setScalar(r);
    core.userData.u.age.value = 1 - t * 0.7;
  });
  /* Искры, летящие ВНУТРЬ: рождаются на радиусе и летят к ядру. */
  vfx.add.emit(n, (i, s) => {
    const a = rr() * Math.PI * 2, e = rnd(-0.4, 0.9, rr);
    const d = rnd(radius * 0.5, radius, rr);
    const ox = Math.sin(a) * Math.cos(e) * d, oy = Math.sin(e) * d, oz = Math.cos(a) * Math.cos(e) * d;
    const life = rnd(secs * 0.5, secs * 0.95, rr);
    s.pos(x + ox, y + oy, z + oz);
    s.vel(-ox / life, -oy / life, -oz / life);
    s.gravity(0, 0, 0);
    s.color(P[1], P[0]);
    s.life(born + rr() * secs * 0.3, life, rnd(0.1, 0.2, rr), SHAPE.spark);
    s.ext(0, 0.3, 1, 1);
  });
  return g;
}

/** Выброс при выходе: маленький взрыв у руки плюс искры вперёд. */
export function muzzle(vfx, { x, z, y = 1.2, dir = 0, colours, mode = 'fire', size = 0.9 }) {
  burst(vfx, { x, y, z, radius: size * 0.5, endRadius: size * 1.3, life: 0.32, mode, colours, displace: 0.4, intensity: 1.4 });
  sparks(vfx, { x, y, z, n: 26, colour: colours[0], tail: colours[1], speed: 10, life: 0.4, cone: { dir, half: 0.5 }, gravity: -6 });
}

/* ── удары по экрану ─────────────────────────────────────────────────────── */

/**
 * Один вызов на удар: свет, волна, толчок камеры, вспышка, аберрация.
 * Элемент даёт цвета и масштаб; всё остальное общее, чтобы удары разных
 * элементов били с одной силой на одинаковый размер.
 */
export function impactKit(vfx, { x, z, y = 1.0, radius = 2.5, colours, strength = 1, shock = true, light = true }) {
  const P = colours;
  /*
   * СВЕТ УДАРА ПРИВЯЗАН К РАДИУСУ УДАРА, А НЕ К ПЯТИ ЕГО РАДИУСАМ.
   *
   * Это та самая «сплошная серая плоскость» из вердикта судьи — и нашёл её не
   * глаз, а бисекция агента мороза. Тёмный задник кадра поднимался на +22…+34
   * уровня RGB в миг удара при +0.0…+1.8 у стихий, которые в тот момент не
   * били. Прогон с `?bloom=0` разделил вклад: четверть давала экранная заливка
   * (её ведущий уже опустил втрое), а ТРИ ЧЕТВЕРТИ — этот источник. Причина
   * арифметическая: `22·strength` доходило до 35 при радиусе `radius·5`, то
   * есть десять метров света ради воронки в два, и мип-пирамида свечения
   * размазывала пик по всему кадру.
   *
   * Мороз и огонь уже завели себе локальные `frostHit` и `fireHit`, чтобы
   * обойти это; остальные восемь стихий звали набор как есть, и у любой, чей
   * удар совпадал с судейским мигом, была та же плёнка. Чинится в одном месте:
   * пик 22 → 13, радиус ×5 → ×2.5. Свет остаётся тем, чем он заведён, —
   * подсветкой ТЕЛ И ПОЛА вокруг точки, — и перестаёт быть засветкой сцены.
   */
  if (light) vfx.flashLight(x, y + 0.6, z, P[1], 13 * strength, 0.35, radius * 2.5);
  if (shock) shockwave(vfx, { x, z, radius: radius * 2.2, life: 0.55, colour: P[1], intensity: 0.9 * strength });
  vfx.screen.shake(Math.min(1, 0.35 * strength + radius * 0.06));
  /*
   * ЭКРАННАЯ ЗАЛИВКА ОПУЩЕНА ВТРОЕ (0.12 → 0.04 силы), И ЭТО ПРО ЧИСЛО
   * ПОПАДАНИЙ, А НЕ ПРО ОДНО.
   *
   * За пятидесятисекундный бой ударов бывает под сотню, и каждый красил ВЕСЬ
   * кадр в цвет стихии на десятую долю секунды. По одному это «удар
   * почувствовался»; сотней подряд это мигающий экран — то самое «захламляет»
   * из заказа 04.09, только не на полу, а поверх всего. Агент огня наткнулся
   * на это, разбирая, почему у жара светится дальняя стена: у него удар
   * приходит поздно и совпадает с пиком, и две заливки складываются.
   *
   * Толчок камеры не тронут: он не закрашивает кадр, а двигает его, и именно
   * он несёт «попало». Кайму (`aberration`) уже ополовинил пост-граф.
   */
  vfx.screen.flash(P[0], Math.min(0.18, 0.04 * strength));
  /* Кайма: 0.18, а не 0.5. Пост-граф уже ополовинен, но и заявка набора была
     велика — у мороза, вылечившего это у себя первым, стоит 0.12. */
  vfx.screen.aberration(Math.min(1, 0.18 * strength));
}

/** Аддитивный цвет — короткая ссылка для модулей. */
export { basic, col };
