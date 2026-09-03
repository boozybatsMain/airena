/**
 * ЛАЗЕР (`laser`) — ПРОСТОЙ КРАСНЫЙ ЛУЧ.
 *
 * Заказ основателя дословно: «просто добавь простой лазер, который стреляет
 * красным лучом. Обычный базовый красный лазер». Это НАРОЧНО
 * противоположность штатному лучу Nova (`novabeam.js`) с его пятью лентами,
 * бегущими кольцами и стеклянным куполом: здесь прямая линия и выстрел. Вся
 * работа — в том, чтобы прямая линия читалась на белом полу и не выглядела
 * дёшево, а не в том, чтобы наворотить деталей.
 *
 * ── УРОКИ, КУПЛЕННЫЕ ЗАМЕРАМИ ─────────────────────────────────────────────
 *
 * Первые три куплены кругом «после4», и этот круг их ПЕРЕПРОВЕРИЛ на своих
 * кадрах (`reports/vfx/r70b/laser/r0`, диф против кадра того же прогона без
 * эффекта — `--el=nil --kind=charge`, где рисовать нечего). Числа стоят
 * рядом с каждым уроком: правку без замера здесь принимать нельзя.
 *
 * 1. БЕЛЫЙ НАКАЛ НА БЕЛОМ ПОЛУ — ЭТО НЕ КРАСНЫЙ ЛАЗЕР. Тонемап арены — ACES
 *    с экспозицией 1.05, и он рушит насыщенность на ярком: цвет жилы
 *    `(3.0, 1.15, 1.05)` выходит на экран как `(250, 234, 231)`, то есть
 *    БЕЛЫМ (посчитано по матрицам ACES и сверено с кадром: ряд y=440 столба
 *    луча с трансляции читался
 *    `(221,212,209)(226,175,170)(236,130,121)(250,234,231)(246,212,207)`).
 *    Насыщенный красный на выходе получается только при умеренной светимости:
 *    `(1.5, 0.05, 0.04)` → `(255, 104, 73)`, S = 0.71. Жила стала HDR-КРАСНОЙ,
 *    а не HDR-белой; bloom она держит (R > 1), а ореол у неё красный.
 *    ПЕРЕПРОВЕРЕНО: в рамке судьи (782,420–796,500, трансляция, 0.30 с) из
 *    557 пикселей столба 543 (97 %) держат S ≥ 0.45 и только 8 (1 %) ниже
 *    0.15; было 53 из 537 (10 %) и 230 (43 %). Ряд y=440 читается
 *    `(241,69,61)(245,75,64)(255,115,84)(241,72,63)(225,56,54)`.
 *
 * 2. ВЫЦВЕТАЛА НЕ ЖИЛА, А АЛЬФА. Полупрозрачный `P[1]` над полом `#e9e6de`
 *    даёт: α=1 → `(238,52,49)` S=0.79; α=0.7 → `(227,163,156)` S=0.31;
 *    α=0.5 → `(223,190,186)` S=0.17. То есть ЛЮБОЙ плавный спад альфы поперёк
 *    ствола — это фабрика бледно-розового. Замер судьи (58 % столба ниже
 *    S=0.15) и мой (991 из 1657 пикселей дифа против пустого пола) мерили
 *    именно её. Теперь альфа поперёк ствола ПОЧТИ ПРЯМОУГОЛЬНАЯ: единица до
 *    `edge`, спад только на кромке; глубину даёт ЦВЕТ — жила, рубашка,
 *    тёмная кайма `P[2]`, а не прозрачность. (Экранное значение каймы
 *    прежний круг записал как `(209,13,33)`; своим замером я его не
 *    подтвердил и не опроверг — кайма занимает 15 % полуширины и на
 *    трансляции это доли пикселя. Числа, на которые здесь можно опереться,
 *    — распределение насыщенности столба в уроке 1.)
 *    И гаснет луч СЖАТИЕМ, а не растворением: `fade` делит поперечную
 *    координату, ствол утончается до нитки при полной насыщенности.
 *
 * 3. КРЕСТ ИЗ ДВУХ КВАДОВ НЕ СПАСАЕТ ОТ ВЗГЛЯДА ВДОЛЬ ОСИ. Оба квада
 *    СОДЕРЖАТ ось, поэтому смотрящий вдоль неё глаз видит два ребра. У
 *    трансляционного глаза азимут 0.25π, а курс каста в стойке — 0.785 рад:
 *    он смотрит болту ровно в хвост, и замер это подтвердил — с 0.24 с по
 *    0.30 с кадр болта ПОПИКСЕЛЬНО равен пустому полу (0 из 1 440 000).
 *    Поэтому болт больше не крест, а КАПСУЛА: тело вращения видно с любого
 *    глаза, в хвост оно читается горячим диском, сбоку — скруглённым
 *    снарядом. Крест остался лучу и решётке стены, где вдоль оси не смотрят.
 *    ПЕРЕПРОВЕРЕНО: с трансляции болт больше не пуст — 78 пикселей на 0.24 с
 *    и 84 на 0.36 с против нуля прежде.
 *
 * 4. НО 78 ПИКСЕЛЕЙ — ЭТО НЕ ЧИТАЕМОСТЬ. Те же 78 — это пятнышко 9×15 на
 *    кадре 1600×900, наполовину закрытое телом самого кастера; сбоку в тот
 *    же момент болт занимает 735. Тело вращения снимает ноль, но не даёт
 *    размера: в хвост видно только сечение. Поэтому у болта появился ШЛЕЙФ
 *    ТРАССЫ — пачки в пуле ТЕЛ тёмным `P[2]` (обычный блендинг; светлый
 *    цвет тут запрещён — см. замер у самого шлейфа) пачками в будущее вдоль
 *    пути, приём ледяного снаряда
 *    (`ice.js::projectile`). Взгляду вдоль оси шлейф складывается в пятно за
 *    головой, а не растягивается в нить, и это ровно то, что нужно.
 *    В свечение шлейф не идёт: аддитивное на белом полу не добавляет ничего.
 *    Плюс сама капсула стала ШТРИХОМ: 2.4 м вместо 1.6 и 0.30 м вместо 0.26.
 *    ИТОГ ЗАМЕРА: трансляция 313 → 600 пикселей на 0.12 с (84 % при
 *    S ≥ 0.45), 78 → 208 на 0.24 с, 84 → 110 на 0.36 с; сбоку 675 → 1 319,
 *    735 → 1 824 и 7 → 407.
 *
 * 5. СВЕТ РАДИУСОМ 5 М НА БЕЛОМ ПОЛУ — ЭТО РОЗОВАЯ ЛУЖА. Замер заряда
 *    (0.60 с, трансляция): 13 200 пикселей отличия от пустого пола, из них
 *    9 233 (70 %) в полосе 0.15 ≤ S < 0.45 при средней светлоте 162 — то
 *    есть бледно-розовая пастель, запрещённая §10.1. Виноват не шар, а
 *    `flashLight` с радиусом 5: точечный источник светит на пол вокруг
 *    ног. Радиус вспышек стал ручкой и ужат; яркость НЕ тронута — красную
 *    заливку тела жертвы (то, что в ударе хвалили) даёт она, а не радиус:
 *    на метре от источника ослабление с радиусом 7 и 3.6 различается на 1 %.
 *    ИТОГ ЗАМЕРА. Заряд, трансляция, 0.60 с: 13 200 → 4 201 пикселя, полоса
 *    0.15 ≤ S < 0.45 усохла с 9 233 до 990 (−89 %), а насыщенное ядро
 *    осталось (1 543 → 1 488). Удар, трансляция, 0.12 с: 13 455 → 13 683
 *    пикселя, из них при S ≥ 0.45 было 9 264, стало 9 232 — красная заливка
 *    жертвы НЕ пострадала; сбоку бледных стало 16 378 → 4 751.
 *
 * ЧЕГО НЕ ЧИНИТЬ. Светлая середина ожога на полу — ЭТО ЗАМЫСЕЛ, а не
 * выцветание: остеклованное пятно внутри тёмно-бордовой каймы (замер судьи:
 * meanL 210 против 182 у затенённого пола рядом). В дифе оно честно
 * считается «бледным» — не гоняйтесь за этими пикселями.
 *
 * НАСТРОЙКА. Все размеры, времена и пороги профиля идут через
 * `kit.tune(e, {...})`: опись в начале каждой формы — это и есть список
 * того, что можно крутить, а значения по умолчанию равны сегодняшним
 * числам, так что запись без полей даёт прежний кадр.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { clamp01, col, markGlow, mulberry, pooled, seedOf, shared, withFade } from './core.js';
import * as kit from './kit.js';
import { EFFECTS } from '../../skills/registry.js';

const {
  float, vec3, uv, uniform, mix, smoothstep, oneMinus, abs: tabs,
  dot: tdot, normalView, positionViewDirection, positionGeometry,
} = TSL;

const TAU = Math.PI * 2;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const hex = (P) => P.map((c) => c.getHexString()).join();
/* Курс мира (sin h, cos h) → поворот по Y, уносящий местную +X в него. */
const yawFor = (ux, uz) => Math.atan2(-uz, ux);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/*
 * ЖИЛА — HDR-КРАСНАЯ, А НЕ HDR-БЕЛАЯ (урок 1 в шапке). Оттенок задан
 * отношением каналов: при яркости 1.5 это `(1.5, 0.050, 0.041)`, что ACES
 * выводит в `(255, 104, 73)`. Поднимать яркость выше ~2 нельзя: при 3.0
 * тот же оттенок выходит `(255, 141, 83)` и дальше стремится к белому —
 * это и была прежняя поломка.
 */
const hotHue = (b) => vec3(b, b.mul(0.033), b.mul(0.027));

/**
 * Поперечный профиль ствола. `d` — расстояние от оси в долях полуширины
 * (0 на оси, 1 на кромке). Отдаёт цвет, альфу и маску жилы для bloom.
 *
 * Альфа почти прямоугольная НАРОЧНО: см. урок 2. Глубину даёт цвет —
 * жила, насыщенная рубашка `P[1]`, тёмная кайма `P[2]` у самой кромки.
 */
function crossSection(P, d, u) {
  const core = oneMinus(smoothstep(u.core.mul(0.45), u.core, d));
  const rim = smoothstep(u.rim, float(1.0), d).mul(0.85);
  const body = mix(col(P[1]), col(P[2]), rim);
  return {
    colour: mix(body, hotHue(u.hot), core),
    alpha: oneMinus(smoothstep(u.edge, float(1.0), d)),
    core,
  };
}

/* ── ствол: крест из двух квадов (луч и прутья решётки) ──────────────────── */

/**
 * Материал ствола. Поперёк — `crossSection` по `uv().y`; вдоль (`uv().x`) —
 * срез у самого фронта по униформе `head`, чтобы луч ВЫРАСТАЛ из руки.
 *
 * `key` разводит луч и решётку стены по РАЗНЫМ кольцам пула. Это не
 * педантизм: у `pooled` кольцо на ключ, и когда луч и прутья тянули
 * униформы из одного кольца, один каст гасил чужой материал (та же поломка,
 * что утопила накал заряда — см. `roundMat`).
 */
function barMat(P, key) {
  return pooled(`laser:${key}:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    const u = {
      fade,
      head: uniform(1),
      core: uniform(0.3),
      rim: uniform(0.72),
      edge: uniform(0.88),
      hot: uniform(1.5),
      glow: uniform(0.45),
    };
    m.userData.u = u;
    /*
     * ЗАТУХАНИЕ — СЖАТИЕ, А НЕ РАСТВОРЕНИЕ. Делим поперечную координату на
     * `fade`: ствол утончается до нитки, оставаясь насыщенным до последнего
     * кадра. Растворение давало ровно тот бледно-розовый, ради которого и
     * затевался урок 2.
     */
    const d = tabs(uv().y.sub(0.5)).mul(2).div(fade.clamp(0.02, 1));
    const along = uv().x;
    const X = crossSection(P, d, u);
    /* Фронт резкий (4 % длины), корень мягкий: у руки луч рождается из
       вспышки, у цели он обрублен — так читается выстрел, а не полоса. */
    const grown = oneMinus(smoothstep(u.head.sub(0.04), u.head, along));
    const ends = smoothstep(float(0.0), float(0.02), along).mul(grown);
    m.colorNode = X.colour;
    m.opacityNode = X.alpha.mul(ends).clamp(0, 1);
    return markGlow(m, X.core.mul(ends).mul(u.glow));
  }, 4);
}

let BAR_A = null, BAR_B = null;
/** Два квада вдоль местного X (длина 1, полуширина 0.5), крестом. */
function bars() {
  if (!BAR_A) {
    BAR_A = shared(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0));
    BAR_B = shared(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2).translate(0.5, 0, 0));
  }
  return [BAR_A, BAR_B];
}

/** Ствол от `a` до `b`: группа с ручкой `set(fade, head)`. */
function barrel(P, a, b, width, prof, key = 'beam') {
  const m = barMat(P, key);
  const g = new THREE.Group();
  for (const geo of bars()) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    g.add(mesh);
  }
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 0.01;
  g.position.set(a[0], a[1], a[2]);
  g.rotation.y = yawFor(dx / len, dz / len);
  /* Наклон в вертикали — поворот вокруг местной Z после рыска. */
  g.rotation.z = Math.asin(clampN(dy / len, -1, 1));
  g.scale.set(len, width, width);
  return {
    group: g,
    len,
    /* Профиль пишется КАЖДЫЙ кадр вместе с затуханием: материал общий на
       кольцо, и владельцем униформ считается тот, кто рисует сейчас. */
    set(fade, head = 1) {
      const u = m.userData.u;
      u.fade.value = fade; u.head.value = head;
      u.core.value = prof.core; u.rim.value = prof.rim; u.edge.value = prof.edge;
      u.hot.value = prof.hot; u.glow.value = prof.glow;
    },
  };
}

/* ── тело вращения: болт-капсула и накал заряда ─────────────────────────── */

/**
 * Материал КРУГЛОГО тела: доля к силуэту считается френелем, поэтому
 * горячая жила сама ложится туда, куда смотрит глаз, а тёмная кайма `P[2]`
 * — на силуэт. Отсюда снаряд читается объёмным с любого ракурса, включая
 * взгляд в хвост, где крест из квадов исчезал совсем (урок 3).
 *
 * `tail` — продольный хвост по местной оси Y: у болта хвост уходит в
 * тёмный `P[2]`, а не в прозрачность (правило «тёмное или насыщенное»).
 *
 * У КАЖДОГО ПОТРЕБИТЕЛЯ СВОЙ КЛЮЧ ПУЛА. Прежняя поломка: `pooled` держит
 * кольцо из четырёх материалов, накал заряда одалживал материал у ствола,
 * не писал в него ни `fade`, ни `head`, а луч в конце жизни гонит `fade` в
 * ноль — после нескольких кастов заряд доставал погашенный материал и не
 * рисовался вовсе. В бою это был замах, который иногда исчезает.
 */
function roundMat(P, key, tail) {
  return pooled(`laser:${key}:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    const u = { fade, rim: uniform(0.55), hot: uniform(1.6), glow: uniform(0.55), tail: uniform(0.5) };
    m.userData.u = u;
    const fres = oneMinus(tabs(tdot(normalView, positionViewDirection))).clamp(0, 1);
    const core = oneMinus(smoothstep(float(0.0), u.rim, fres));
    const edge = smoothstep(u.rim, float(1.0), fres).mul(0.9);
    let hotK = core;
    let body = mix(col(P[1]), col(P[2]), edge);
    if (tail) {
      /* Местная +Y — направление полёта; геометрия капсулы лежит в [-1, 1]. */
      const along = positionGeometry.y.mul(0.5).add(0.5);
      const back = oneMinus(smoothstep(float(0.0), u.tail, along));
      body = mix(body, col(P[2]), back.mul(0.9));
      hotK = core.mul(oneMinus(back));
    }
    m.colorNode = mix(body, hotHue(u.hot), hotK);
    /* Тело НЕПРОЗРАЧНО: гаснет масштабом, а не альфой (урок 2). */
    m.opacityNode = fade.clamp(0, 1);
    return markGlow(m, hotK.mul(fade).mul(u.glow));
  }, 4);
}

let CAPSULE = null, ORB = null;
/** Капсула вдоль местной Y: радиус 0.5, средняя часть 1 → y ∈ [-1, 1]. */
function capsuleGeo() {
  if (!CAPSULE) CAPSULE = shared(new THREE.CapsuleGeometry(0.5, 1, 6, 20));
  return CAPSULE;
}
function orbGeo() {
  if (!ORB) ORB = shared(new THREE.IcosahedronGeometry(1, 3));
  return ORB;
}

/**
 * Вспышка у руки: сноп искр вперёд плюс короткий свет.
 *
 * `lightR` — не украшение, а урок 5: радиус точечного источника решает,
 * сколько БЕЛОГО ПОЛА он покрасит в бледно-розовое. Яркость держим, радиус
 * ужимаем.
 */
function muzzle(vfx, P, { x, y, z, dir, rng, size = 1, light = 12, lightR = 3.2 }) {
  kit.sparks(vfx, {
    x, y, z, n: Math.round(14 * size), colour: P[0], tail: P[1], speed: 12, life: 0.22,
    cone: { dir, half: 0.4 }, gravity: -6, size: 0.11, r: rng,
  });
  kit.burst(vfx, {
    x, y, z, radius: 0.16 * size, endRadius: 0.42 * size, life: 0.16, mode: 'air',
    colours: [P[0], P[1], P[2]], intensity: 1.1, flash: false,
  });
  vfx.flashLight(x, y, z, P[1], light, 0.18, lightR);
}

/**
 * Попадание: точка света, кольцо на полу, ожог и брызги искр.
 *
 * Свет — тот же урок 5: яркость 18 оставлена (ею жертва заливается красным,
 * и это то, что в ударе работает), радиус ужат с 7 до `S.lightR`. На метре
 * от источника ослабление three.js `(1 − (d/R)⁴)²` даёт 0.999 при R = 7 и
 * 0.992 при R = 3.6 — тело теряет 1 %, а лужа на полу площадью падает вчетверо.
 */
function hitAt(vfx, P, e, rng, S, { x, y, z, radius, hold, rise }) {
  kit.burst(vfx, {
    x, y, z, radius: radius * 0.35, endRadius: radius, life: 0.3, mode: 'air',
    colours: [P[0], P[1], P[2]], intensity: 1.3,
  });
  kit.sparks(vfx, { x, y, z, n: 22, colour: P[0], tail: P[2], speed: 9, life: 0.4, gravity: -9, size: 0.1, r: rng });
  kit.shockwave(vfx, { x, z, radius: radius * 1.6, r0: 0.2, life: 0.35, colour: P[1], intensity: 0.9, dust: false });
  kit.decal(vfx, { type: 'laser', x, z, radius: radius * 0.8, hold, fade: 4, rise, tint: P[2], seed: (seedOf(e) % 9) + 1 });
  vfx.flashLight(x, y, z, P[1], S.light ?? 18, 0.3, S.lightR ?? 3.6);
}

/* ── луч ────────────────────────────────────────────────────────────────── */

export function beam(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения — сегодняшние; запись, не несущая поля,
     даёт прежний кадр (см. `kit.tune`). */
  const S = kit.tune(e, {
    width: 0.24,        /* полная толщина ствола, м */
    y: 1.15,            /* высота ствола над полом, м */
    grow: 0.05,         /* за сколько секунд луч дорастает до цели */
    duration: 0.28,     /* сколько держится на полной силе */
    decay: 0.16,        /* за сколько гаснет (сжатием, не растворением) */
    core: 0.30,         /* доля полуширины под жилой */
    rim: 0.72,          /* где начинается тёмная кайма P[2] */
    edge: 0.88,         /* где альфа начинает спадать — почти у самой кромки */
    hot: 1.5,           /* яркость жилы: 1.5 → (255,104,73), выше уходит в белый */
    glow: 0.45,         /* сколько жилы уходит в bloom */
    trail: 30,          /* база плотности крошки на полу вдоль трассы */
    hitRadius: 0.9,     /* радиус вспышки и кольца у цели, м */
    decalHold: 14,      /* стойкость ожога, с */
    decalRise: 0.12,    /* за сколько ожог проявляется, с */
    muzzle: 1,          /* размер выброса у руки, доли */
    muzzleLight: 12,    /* яркость вспышки у руки */
    muzzleR: 3.2,       /* радиус вспышки у руки, м (урок 5) */
    light: 18,          /* яркость вспышки в цели */
    lightR: 3.6,        /* радиус вспышки в цели, м (урок 5) */
  });
  const A = [e.x0, S.y, e.z0], B = [e.x1, S.y, e.z1];
  const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
  if (len < 0.05) return false;
  const LIFE = S.grow + S.duration + S.decay;

  const bar = barrel(P, A, B, S.width, S, 'beam');
  vfx.spawnMesh(bar.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const head = clamp01(t / Math.max(0.001, S.grow));
    const fade = t < S.grow + S.duration ? 1 : Math.max(0, 1 - (t - S.grow - S.duration) / Math.max(0.001, S.decay));
    bar.set(fade, head);
  });
  bar.set(1, 0);

  muzzle(vfx, P, {
    x: A[0], y: A[1], z: A[2], dir: Math.atan2(B[0] - A[0], B[2] - A[2]),
    rng, size: S.muzzle, light: S.muzzleLight, lightR: S.muzzleR,
  });
  if (e.hit !== false) {
    hitAt(vfx, P, e, rng, S, { x: B[0], y: S.y, z: B[2], radius: S.hitRadius, hold: S.decalHold, rise: S.decalRise });
  }
  /* Крошка на полу вдоль трассы: лазер жжёт то, над чем прошёл. */
  const n = clampN(kit.countFor(S.trail, fp.area, kit.REF_AREA.beam, 90), 12, 90);
  vfx.body.emit(n, (i, s) => {
    const f = rng();
    const lat = (rng() - 0.5) * 0.5;
    const ux = (B[0] - A[0]) / len, uz = (B[2] - A[2]) / len;
    s.pos(A[0] + ux * len * f - uz * lat, 0.05, A[2] + uz * len * f + ux * lat);
    s.vel(0, 0, 0); s.gravity(0, 0, 0);
    s.color(P[2], P[2]);
    s.life(vfx.now + f * S.grow, 0.5 + rng() * 0.5, 0.06 + rng() * 0.05, kit.SHAPE.dot);
    s.ext(0, 0.8, 0, 0.1);
  });
  return true;
}

/* ── болт: классический бластерный выстрел ──────────────────────────────── */

export function bolt(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const S = kit.tune(e, {
    width: 0.30,        /* диаметр капсулы, м */
    boltLen: 2.4,       /* длина снаряда, м: болт — ШТРИХ, а не шарик; с 1.6 м
                           голова занимала на трансляции 12×25 пикселей */
    y: 1.15,            /* высота полёта, м */
    speed: e.speed || 22,
    range: e.range || 10,
    rim: 0.55,          /* доля к силуэту, где начинается тёмная кайма */
    hot: 1.6,           /* яркость носовой жилы */
    glow: 0.55,         /* сколько жилы уходит в bloom */
    tail: 0.5,          /* какая доля длины уходит в тёмный хвост */
    tracer: 64,         /* база плотности шлейфа трассы (урок 4) */
    tracerLife: 0.30,   /* сколько живёт крупица шлейфа, с */
    tracerSize: 0.18,   /* размер крупицы шлейфа, м */
    tracerSpread: 0.10, /* разброс шлейфа поперёк трассы, м */
    tracerSag: 0.4,     /* с какой силой шлейф оседает, м/с² */
    hitRadius: 0.8,
    decalHold: 12,
    decalRise: 0.12,
    muzzle: 0.9,
    muzzleLight: 12,    /* яркость вспышки у руки */
    muzzleR: 3.2,       /* радиус вспышки у руки, м (урок 5) */
    light: 18,          /* яркость вспышки в цели */
    lightR: 3.6,        /* радиус вспышки в цели, м (урок 5) */
  });
  const ux = Math.sin(e.h), uz = Math.cos(e.h);
  const len = Math.max(1.2, S.range);
  const travel = len / Math.max(4, S.speed);
  const A = [e.x + ux * 0.7, S.y, e.z + uz * 0.7];

  const state = { hit: null };
  vfx.flight(e.who, e.skill, state);

  /*
   * БОЛТ — КАПСУЛА, А НЕ КРЕСТ ИЗ КВАДОВ (урок 3 в шапке). Замер до правки:
   * с трансляционного глаза, который смотрит болту в хвост, кадры на 0.24 с
   * и 0.30 с были ПОПИКСЕЛЬНО равны пустому полу. Тело вращения такого
   * ракурса не имеет.
   */
  const m = roundMat(P, 'bolt', true);
  const mesh = new THREE.Mesh(capsuleGeo(), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3(ux, 0, uz));
  mesh.scale.set(S.width, S.boltLen * 0.5, S.width);
  mesh.position.set(A[0], A[1], A[2]);
  const write = () => {
    const u = m.userData.u;
    u.fade.value = 1; u.rim.value = S.rim; u.hot.value = S.hot; u.glow.value = S.glow; u.tail.value = S.tail;
  };
  write();

  let done = false;
  vfx.spawnMesh(mesh, travel + 0.4, (o, u) => {
    const t = u * (travel + 0.4);
    if (state.hit && !done) {
      done = true;
      o.visible = false;
      hitAt(vfx, P, e, rng, S, { x: state.hit.x, y: S.y, z: state.hit.z, radius: S.hitRadius, hold: S.decalHold, rise: S.decalRise });
      vfx.flights.delete(`${e.who}:${e.skill}`);
      return;
    }
    if (done) return;
    const f = clamp01(t / travel);
    o.position.set(A[0] + ux * len * f, S.y, A[2] + uz * len * f);
    write();
    if (f >= 1) {
      done = true;
      o.visible = false;
      /* Промах: болт просто гаснет в точке, куда долетел. */
      kit.burst(vfx, {
        x: A[0] + ux * len, y: S.y, z: A[2] + uz * len, radius: 0.2, endRadius: 0.5,
        life: 0.2, mode: 'air', colours: [P[0], P[1], P[2]], intensity: 0.8, flash: false,
      });
      vfx.flights.delete(`${e.who}:${e.skill}`);
    }
  });

  /*
   * ШЛЕЙФ ТРАССЫ (урок 4). Пачками В БУДУЩЕЕ вдоль пути — приём ледяного
   * снаряда (`ice.js::projectile`): частица рождается тогда, когда голова до
   * неё долетит, и шлейф тянется сам, без истории и без per-frame эмиссии.
   *
   * ТОЛЬКО ПУЛ ТЕЛ и ТОЛЬКО ТЁМНЫЙ `P[2]`. Аддитивный `glow` на белом полу
   * не добавляет ничего (§10.1). А светлый цвет здесь тоже нельзя, и это
   * замер: маска точки мягкая (`soft^1.5` в шейдере частиц), то есть у неё
   * есть кайма с альфой меньше единицы, и `P[1]` под такой альфой над полом
   * `#e9e6de` даёт ровно бледно-розовое — на кадре первой попытки шлейф
   * читался как еле заметная сыпь (32 % его пикселей ниже S = 0.15).
   * Тёмный `P[2]` при любой альфе над белым остаётся тёмным. Шлейф — это
   * след ожжённого воздуха, а не второй источник света; светит голова.
   *
   * Плотность — от следа доставки (`kit.footprint` + `kit.countFor`), не
   * числом: у болта след — круг удара, эталон тот же (§P11).
   */
  const n = clampN(kit.countFor(S.tracer, fp.area, kit.REF_AREA.impact, 140), 20, 140);
  const steps = Math.max(4, Math.round(n / 2));
  for (let k = 0; k < steps; k++) {
    const f = k / steps, at = vfx.now + f * travel;
    const px = A[0] + ux * len * f, pz = A[2] + uz * len * f;
    vfx.body.emit(2, (i, s) => {
      const lat = (rng() - 0.5) * 2 * S.tracerSpread;
      s.pos(px - uz * lat, S.y + (rng() - 0.5) * 2 * S.tracerSpread, pz + ux * lat);
      /* Разлёт поперёк трассы, а не вдоль: вдоль его съест сама голова. */
      s.vel(-uz * lat * 2, (rng() - 0.5) * 0.5, ux * lat * 2);
      s.gravity(0, -S.tracerSag, 0);
      s.color(P[2], P[2]);
      s.life(at, S.tracerLife * (0.7 + rng() * 0.6), S.tracerSize * (0.6 + rng() * 0.8), kit.SHAPE.dot);
      s.ext(0, 0.35, 0, 0);
    });
  }

  muzzle(vfx, P, {
    x: A[0], y: A[1], z: A[2], dir: e.h, rng,
    size: S.muzzle, light: S.muzzleLight, lightR: S.muzzleR,
  });
  return true;
}

/* ── удар, статус, заряд, стена (доходят до всякой стихии, §P6) ─────────── */

export function impact(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  /* Яркость 18 не тронута НАРОЧНО: ею жертва заливается красным, и это
     единственное, что в этой форме признано работающим. Ужат только радиус
     (урок 5) — на теле это 1 % ослабления, на полу вчетверо меньше лужи. */
  const S = kit.tune(e, {
    hitRadius: 0.7,
    decalHold: 12,
    decalRise: 0.12,
    light: 18,          /* яркость вспышки на жертве */
    lightR: 3.6,        /* радиус вспышки, м (урок 5) */
  });
  const cand = ['blue', 'orange'].map((id) => {
    const b = ctx && ctx.bodyShape ? ctx.bodyShape(id) : null;
    return b ? { id, ...b } : null;
  }).filter(Boolean).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
  const bs = cand[0] && Math.hypot(cand[0].x - e.x, cand[0].z - e.z) <= 2 ? cand[0] : null;
  const cx = bs ? bs.x : e.x, cz = bs ? bs.z : e.z, cy = bs ? bs.h * 0.55 : 1.0;
  hitAt(vfx, P, e, rng, S, { x: cx, y: cy, z: cz, radius: S.hitRadius, hold: S.decalHold, rise: S.decalRise });
  return true;
}

/** Одно тело — один статус (§P10). */
const STATUS = new Map();

export function status(vfx, e, P, ctx) {
  const who = e.who || 'orange';
  const dur = e.duration ?? EFFECTS[e.effect]?.duration ?? 1.5;
  const key = `${who}:${e.effect}`;
  const live = STATUS.get(key);
  if (live && live.until > vfx.now) { live.until = vfx.now + dur; return true; }
  const entry = { until: vfx.now + dur };
  STATUS.set(key, entry);

  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = kit.tune(e, {
    period: 0.3,    /* как часто вспыхивает новая порция прожига, с */
    dots: 26,       /* база плотности прожига на эталонной площади щита */
    size: 0.26,     /* размер тёмной точки прожига, м */
    lit: 0.16,      /* размер горячей точки, м */
    cling: 0.98,    /* на какой доле радиуса тела садятся точки: глубже
                       нельзя — частицы проверяются по глубине, и точка,
                       утопленная в корпус, просто исчезает */
    hold: 1.0,      /* сколько живёт точка прожига, с */
    sink: 0.25,     /* с какой скоростью подпалина сползает вниз, м/с */
    foot: 0.15,     /* с какой высоты над полом начинается прожиг, м */
    span: 0.92,     /* какую долю высоты тела он покрывает */
    smoke: 5,       /* струек дыма за порцию */
    smokeSize: 0.28, /* размер струйки, м */
  });
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(who) : null) || { x: e.x ?? 0, z: e.z ?? 0 };
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(who) : null;
  const R = (bs ? bs.r : 0.9) * 1.05, H = (bs ? bs.h : 2.0);
  /* ПЛОТНОСТЬ ОТ ПЛОЩАДИ, а не числом: жжётся боковая поверхность капсулы
     бойца, её и меряем (у формы `status` собственного следа на полу нет —
     `kit.footprint` отдаёт запасной круг, он идёт в дело только если тела
     нет). Эталон — площадь щита, §P11. */
  const fp = kit.footprint(e, ctx);
  const area = bs ? TAU * R * H : fp.area;
  const N = clampN(kit.countFor(S.dots, area, kit.REF_AREA.self, 60), 8, 60);
  /* ПРОЖИГ: точки вспыхивают на капсуле — тело продолжает гореть там,
     куда попал луч. Без купола (урок гравитации и радиации: сфера вокруг
     бойца читается щитом, чем бы её ни красили). */
  const MAX = 60;
  let next = -1;
  vfx.spawnMesh(new THREE.Group(), MAX, (o, u) => {
    const t = u * MAX;
    if (vfx.now > entry.until) { if (STATUS.get(key) === entry) STATUS.delete(key); return; }
    if (t < next) return;
    next = t + S.period;
    const p = at();
    /*
     * ПРОЖИГ ВИДЕН, а не только светится. Прежде статус клал точки ТОЛЬКО в
     * пул свечения светлым `P[0]`: на белом полу и на светлом корпусе такие
     * точки не существуют, и кадр статуса выходил ПОПИКСЕЛЬНО равен кадру
     * формы, которой у лазера вообще нет (замер судьи; я его повторил — 0 из
     * 1 440 000 пикселей отличия). Тёмные `P[2]`-точки в пуле тел видно на
     * любом фоне; светлые остаются сверху как накал.
     *
     * ВТОРАЯ ПОЧИНКА — ЗА ЧИТАЕМОСТЬ, А НЕ ЗА СУЩЕСТВОВАНИЕ. После первой
     * замер дал 979–1418 пикселей с трансляции: они ЕСТЬ, но это россыпь
     * маковых зёрен по телу высотой 170 пикселей. Правки, каждая ручкой:
     * точка КРУПНЕЕ (0.26 вместо 0.18 — площадь вдвое), живёт `hold` = 1.0 с
     * вместо 0.5–0.8 (при периоде 0.3 с на экране стоят три порции разом, а
     * не полторы), потолок плотности поднят с 40 до 60, и точки СПОЛЗАЮТ
     * вниз (`sink`), а не улетают вверх: подпалина не искра, она течёт по
     * корпусу. `cling` держит их у самой обшивки — глубже нельзя, частицы
     * проверяются по глубине и утопленная точка просто пропадает; шаром
     * вокруг бойца их тоже разносить нельзя (урок гравитации и радиации:
     * сфера вокруг тела читается щитом, чем бы её ни красили).
     *
     * ИТОГ ЗАМЕРА: с трансляции 979–1 418 → 3 351–4 344 пикселя отличия, из
     * них при S ≥ 0.45 было 351–707, стало 1 567–1 943 — прожиг вырос втрое
     * и остался насыщенным, а не расплылся в розовое.
     */
    const put = (pool, c1, c2, n, base, glow) => pool.emit(n, (i, s) => {
      const a = rng() * TAU, hh = rng();
      s.pos(p.x + Math.sin(a) * R * S.cling, S.foot + hh * H * S.span, p.z + Math.cos(a) * R * S.cling);
      /* Оседание — доля от `sink`, а не отдельное число: подпалина и её
         ускорение суть одно движение, крутить их врозь нечего. */
      s.vel(0, -S.sink * (0.5 + rng()), 0); s.gravity(0, -S.sink * 0.6, 0);
      s.color(c1, c2);
      s.life(vfx.now, S.hold * (0.7 + rng() * 0.6), base * (0.7 + rng() * 0.6), kit.SHAPE.dot);
      s.ext(0, 0.7, 0, glow);
    });
    put(vfx.body, P[2], P[1], N, S.size, 0);
    put(vfx.glow, P[1], P[2], Math.max(3, Math.round(N * 0.6)), S.lit, 0.7);
    /*
     * ДЫМ ТЁМНЫЙ С ОБОИХ КОНЦОВ. Со светлым `lit` = `P[1]` он давал над
     * белым полом ровно то, что здесь запрещено: 1 553 пикселя средним
     * цветом (212,198,196), светлота 206, S = 0.08 — бледно-розовая дымка.
     * Маска дыма мягкая, альфа у неё дробная, и светлый цвет под дробной
     * альфой над полом `#e9e6de` не может дать ничего, кроме пастели.
     * `P[2]` под той же альфой остаётся тёмным. Гарь от прожига и обязана
     * быть тёмной.
     */
    kit.smoke(vfx, {
      x: p.x, y: H * 0.6, z: p.z, n: S.smoke, radius: R, dark: P[2], lit: P[2],
      rise: 1.1, life: 1.0, size: S.smokeSize, spread: 0.5, r: rng,
    });
  });
  return true;
}

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const secs = Math.max(0.15, e.windup || 0.4);
  const S = kit.tune(e, {
    r0: 0.06,     /* радиус в начале замаха, м */
    r1: 0.26,     /* радиус к выстрелу, м */
    reach: 0.7,   /* насколько вынесен вперёд от тела, м */
    y: 1.1,       /* высота накала, м */
    rim: 0.45,    /* доля к силуэту, где начинается тёмная кайма */
    hot: 1.6,     /* яркость середины шара */
    glow: 0.6,    /* сколько середины уходит в bloom */
    light: 5,     /* базовая яркость подсветки */
    lightR: 2.6,  /* радиус подсветки, м: с прежними 5 пол вокруг ног уходил
                     в бледно-розовое — 9 233 из 13 200 пикселей отличия в
                     полосе 0.15 ≤ S < 0.45 (урок 5) */
  });
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const dir = e.h ?? 0;
  /* Точка накала в стволе: растёт и наливается, как заряжающийся конденсатор. */
  const p0 = at();
  const g = new THREE.Group();
  /*
   * ШАР КРАСНЫЙ, А НЕ ЖЕМЧУЖНЫЙ. Прежний накал брал `beamMat`: его сечение
   * считается по `uv().y` ленты, и натянутое на шар оно давало полосатую
   * бело-красную «жемчужину» (замер судьи по столбцу x=636). Своего
   * материала не хватило: с френелем `(3.0,1.15,1.05)` в середине шар вышел
   * ровным БЕЛЫМ шариком — тот же тонемап, что и у жилы луча. Теперь
   * середина — насыщенный HDR-красный, силуэт — тёмный `P[2]`.
   */
  const m = roundMat(P, 'orb', false);
  const dot = new THREE.Mesh(orbGeo(), m);
  dot.frustumCulled = false;
  dot.renderOrder = 10;
  g.add(dot);
  g.position.set(p0.x + Math.sin(dir) * S.reach, S.y, p0.z + Math.cos(dir) * S.reach);
  let lightAt = -1;
  vfx.spawnMesh(g, secs, (o, u) => {
    const t = u * secs;
    const p = at();
    o.position.set(p.x + Math.sin(dir) * S.reach, S.y, p.z + Math.cos(dir) * S.reach);
    /* Гаснет СЖАТИЕМ: альфа остаётся единицей, иначе последние кадры замаха
       выцветают в бледно-розовое (урок 2). */
    const shrink = u < 0.9 ? 1 : Math.max(0, (1 - u) / 0.1);
    dot.scale.setScalar((S.r0 + (S.r1 - S.r0) * u) * shrink);
    const uu = m.userData.u;
    uu.fade.value = 1; uu.rim.value = S.rim; uu.hot.value = S.hot; uu.glow.value = S.glow;
    if (t - lightAt > 0.3) { vfx.flashLight(o.position.x, S.y, o.position.z, P[1], S.light + 8 * u, 0.4, S.lightR); lightAt = t; }
  });
  return true;
}

export function wall(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = kit.tune(e, {
    duration: Math.max(0.6, e.duration || 5),
    w: Math.max(0.6, e.w || 4),
    d: Math.max(0.5, e.d || 1),
    height: e.height ?? 2.2,
    bars: null,          /* число прутьев; null — от ширины */
    barWidth: 0.14,      /* толщина прутка, м */
    core: 0.34,          /* доля полуширины под жилой */
    rim: 0.70,           /* где начинается тёмная кайма */
    edge: 0.86,          /* где альфа начинает спадать */
    hot: 1.4,            /* яркость жилы прутка */
    glow: 0.4,           /* сколько жилы уходит в bloom */
    light: 6,            /* яркость подсветки у основания */
    lightR: 3,           /* радиус подсветки, м */
    rise: 0.15,
    fall: 0.3,
  });
  const D = S.duration, W = S.w, H = S.height;
  /* РЕШЁТКА ИЗ ЛУЧЕЙ: вертикальные стволы через равные промежутки — забор
     из лазеров, а не стена вещества. Плиту коллизии рисует штатный силуэт.
     Прутки СВОЙ ключ пула: с ключом луча один каст гасил чужие униформы. */
  const n = S.bars ?? clampN(Math.round(W * 1.6), 3, 9);
  const g = new THREE.Group();
  const set = [];
  for (let i = 0; i < n; i++) {
    const fx = ((i + 0.5) / n - 0.5) * W * 0.94;
    const b = barrel(P, [e.x + fx, 0.05, e.z], [e.x + fx, 0.05 + H, e.z], S.barWidth, S, 'bar');
    g.add(b.group);
    set.push(b);
  }
  vfx.spawnMesh(g, D, (o, u) => {
    const t = u * D;
    const k = t < S.rise ? t / S.rise : (t > D - S.fall ? Math.max(0, (D - t) / S.fall) : 1);
    for (const b of set) b.set(k, Math.min(1, t / Math.max(0.001, S.rise)));
  });
  kit.decal(vfx, { type: 'laser', x: e.x, z: e.z, radius: Math.max(W, S.d) * 0.5, hold: D, fade: 1.2, rise: 0.3, tint: P[2], seed: (seed % 9) + 1 });
  /*
   * СВЕТ У ОСНОВАНИЯ, А НЕ НА ВЕСЬ ЗАБОР. Прежний источник (яркость 10,
   * радиус W+2 = 6 м) заливал пол розовым: из 11 145 пикселей отличия от
   * пустого пола 8 667 (78 %) были ниже S=0.15, то есть почти белыми. Это и
   * есть та самая бледная пастель, которой на белом полу быть не должно.
   */
  vfx.flashLight(e.x, H * 0.35, e.z, P[1], S.light, 0.35, S.lightR);
  return true;
}
