/**
 * КИСЛОТА (`acid`) — РАЗЪЕДАНИЕ (план §6.4).
 *
 * Что это такое. Жидкое, глянцевое, болезненно жёлто-зелёное. Струи и брызги
 * капель, ложащиеся глянцевыми лужами с тёмным мокрым ободом, пузыри,
 * поднимающиеся и лопающиеся, тонкие жёлто-зелёные пары, капли, стекающие с
 * разъеденного тела, и шипение там, где они падают. Ярко там, где жидкость
 * толстая, темно у мокрого края (это и есть цвет пола, P3). Ничто не искрит.
 *
 * ПОЧЕМУ КОВЁР ЛУЖИ — ЧАСТИЦЫ, А НЕ СЛЕДЫ. Кольцо следов — 28 на тип: один
 * конус выселил бы собственные лужи. Но пул тел ГАСИТ каждую частицу от
 * рождения (`(1−u)^1.3`), и долгоживущая точка бледнеет до невидимости.
 * Поэтому каждая капля ковра живёт 1.4–1.8 с, а модуль ПЕРЕИЗЛУЧАЕТ весь
 * список посадок каждые 0.7 с до конца выдержки: альфа не опускается ниже
 * ~0.55, и последнее излучение гаснет вместе с высыхающей лужей. Следов
 * `acid` не больше трёх на каст, и лужа кладётся ПЕРВОЙ, чтобы ковёр не
 * выселил её из кольца.
 *
 * НАСТРОЙКА. Все размеры, направления и времена идут через `kit.tune(e, {…})`:
 * опись в начале каждой формы — это и есть список того, что можно крутить, а
 * значения по умолчанию равны сегодняшним числам, так что запись без полей
 * даёт прежний кадр. Исключения названы на месте: скорость капель конуса,
 * радиус его боковых луж, окно слива струи и стойкость следа зоны исправлены
 * по замечаниям судей — они и раньше были неверны, просто числом.
 *
 * ПРОЯВЛЕНИЕ ЛУЖИ. `kit.decal` научился фазе входа (`rise`, у типа `acid` —
 * 0.90 с): жалоба основателя была именно на то, что след «появляется почти
 * мгновенно и очень резко». Здесь `rise` идёт от РАЗМЕРА пятна: разлив зоны
 * (3 м) набегает 1.6 с, лужа разбитой колбы — 1.4 с, брызги с тела и боковые
 * капли конуса — полсекунды. Большая лужа растекается, капля шлёпается.
 *
 * Формы: конус (брызги), навес (колба), зона (лужа), болт (струя) — плюс
 * удар, статус, заряд и стена (§P6).
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { clamp01, col, markGlow, mulberry, pooled, seedOf, shared, withFade } from './core.js';
import * as kit from './kit.js';
import { EFFECTS } from '../../skills/registry.js';

const {
  float, vec3, uniform, mix, smoothstep, oneMinus, abs: tabs,
  normalView, positionViewDirection, mx_noise_float, normalLocal,
} = TSL;

const TAU = Math.PI * 2;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const hex = (P) => P.map((c) => c.getHexString()).join();

/* ── стеклянная колба ───────────────────────────────────────────────────── */

/** Копия строения `wellMat` гравитации, но нутро — `P[1]`, а блик белый. */
function flaskMat(P) {
  return pooled(`acid:flask:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    m.userData.u = { fade };
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    const rim = fres.pow(2.2);
    /* Зеркальная точка: узкий блик на «верхней» стороне модели. */
    const spec = smoothstep(float(0.55), float(0.9), normalLocal.y.add(normalLocal.x.mul(0.4)));
    m.colorNode = mix(mix(col(P[1]), col(P[2]).mul(0.7), rim), vec3(2.4, 2.6, 2.2), spec.mul(0.8));
    const alpha = mix(float(0.8), float(1.0), rim).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, spec.mul(0.4).mul(fade).clamp(0, 1));
  }, 4);
}

let FLASK_GEO = null;
function flask(P, r) {
  if (!FLASK_GEO) FLASK_GEO = shared(new THREE.IcosahedronGeometry(1, 3));
  const m = flaskMat(P);
  const mesh = new THREE.Mesh(FLASK_GEO, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.scale.setScalar(r);
  return { mesh, set(fade) { m.userData.fade.value = fade; } };
}

/* ── капли, ковёр, шипение, пары ────────────────────────────────────────── */

/**
 * Одна капля: штрих, вытянутый по скорости, с тяжестью. Возвращает МЕСТО И
 * МОМЕНТ ПАДЕНИЯ — по ним потом ложится ковёр и шипит.
 */
function droplet(vfx, P, { x, y, z, vx, vy, vz, rng, at = 0 }) {
  const tLand = (vy + Math.sqrt(vy * vy + 2 * 9 * Math.max(0.02, y))) / 9;
  const emit = (pool, colour, tail, size) => pool.emit(1, (i, s) => {
    s.pos(x, y, z);
    s.vel(vx, vy, vz);
    s.gravity(0, -9, 0);
    s.color(colour, tail);
    s.life(vfx.now + at, tLand, size, kit.SHAPE.streak);
    s.ext(0, 0.9, 1, 0.5);
  });
  emit(vfx.glow, P[1], P[1], 0.1 + rng() * 0.06);
  emit(vfx.body, P[2], P[2], 0.11 + rng() * 0.07);
  return { x: x + vx * tLand, z: z + vz * tLand, t: at + tLand };
}

/**
 * КОВЁР ЛУЖИ. `landed` — список посадок; ковёр переизлучается каждые 0.7 с
 * до конца `hold`, чтобы точки не выцветали (см. шапку).
 */
function carpet(vfx, P, landed, hold, rng) {
  if (!landed.length) return;
  const emitDot = (l, k) => vfx.body.emit(1, (i, s) => {
    s.pos(l.x, 0.04, l.z);
    s.vel(0, 0, 0); s.gravity(0, 0, 0);
    s.color(P[1], P[2].clone().multiplyScalar(0.8));
    /* Точка ковра 0.11–0.19 м, не 0.2–0.35: замер i1 с бокового глаза —
       крупные точки читались зелёным конфетти, а не глянцевой лужей; форму
       лужи держит след `acid`, а точки — её блеск и зернистость. */
    s.life(vfx.now, (1.4 + rng() * 0.4) * k, 0.11 + rng() * 0.08, kit.SHAPE.dot);
    s.ext(0, 1.0, 0, 0.1);
  });
  /*
   * ДВА РИТМА. Пока лужа РАЗЛИВАЕТСЯ, такт мелкий (0.08 с) и каждое пятно
   * рождается ровно в свой срок `l.t` — иначе разбег точек по расстоянию
   * (см. `zone`) схлопнулся бы в три ступени по 0.7 с и разлив читался бы
   * рывками. Как только родилось последнее пятно, такт становится редким:
   * дальше это уже не разлив, а ПОДДЕРЖАНИЕ — пул тел гасит частицу от
   * рождения, и без переизлучения лужа выцвела бы за полторы секунды.
   */
  const spread = landed.reduce((m, l) => Math.max(m, l.t || 0), 0);
  const born = new Set();
  let next = 0;
  vfx.spawnMesh(new THREE.Group(), hold, (o, u) => {
    const t = u * hold;
    if (t < next) return;
    const left = hold - t;
    const k = left < 1.4 ? Math.max(0.3, left / 1.4) : 1;
    if (t <= spread) {
      /* Разлив: только те пятна, чей срок пришёл и которые ещё не рождались. */
      for (let i = 0; i < landed.length; i++) {
        const l = landed[i];
        if (t >= (l.t || 0) && !born.has(i)) { born.add(i); emitDot(l, k); }
      }
      next = t + 0.08;
      return;
    }
    for (const l of landed) emitDot(l, k);
    next = t + 0.7;
  });
}

/** Шипение: пузырьки `P[0]`, всплывающие и лопающиеся (конечный размер 0). */
function fizz(vfx, P, landed, rng, { rate = 1, at = 0 } = {}) {
  for (const l of landed) {
    if (rng() > rate) continue;
    vfx.glow.emit(1, (i, s) => {
      s.pos(l.x + (rng() - 0.5) * 0.2, 0.05, l.z + (rng() - 0.5) * 0.2);
      s.vel((rng() - 0.5) * 0.3, 0.6, (rng() - 0.5) * 0.3);
      s.gravity(0, 0, 0);
      s.color(P[0], P[1]);
      s.life(vfx.now + at + l.t, 0.3 + rng() * 0.3, 0.05 + rng() * 0.04, kit.SHAPE.dot);
      /* Конечный размер 0 — пузырь ЛОПАЕТСЯ, а не гаснет. */
      s.ext(0, 0.0, 0, 0.1);
    });
  }
}

/** Пары: тонкие, медленные, в `P[2]`/`P[1]`. */
function fumes(vfx, P, { x, z, r, n, life = 1.4, at = null, rng }) {
  kit.smoke(vfx, {
    x, y: 0.5, z, n, radius: r, dark: P[2].clone().multiplyScalar(0.6), lit: P[1],
    rise: 1.2, life, size: 0.6, at, spread: 1.0, r: rng,
  });
}

/* ── формы ──────────────────────────────────────────────────────────────── */

export function cone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const { range, half } = fp;
  const dir = fp.dir;
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения — сегодняшние, кроме `reach` и `flank`
     (см. комментарии на месте); запись без полей даёт прежний кадр. */
  const S = kit.tune(e, {
    y: 1.2,           /* высота слива с руки, м */
    hand: 0.6,        /* вынос точки слива вперёд, м */
    reach: 1.0,       /* докуда добивают капли, доли длины конуса */
    pool: 0.5,        /* радиус главной лужи, доли длины конуса */
    flank: 0.15,      /* радиус боковых луж, доли длины конуса */
    drops: 160,       /* капель на эталонной площади конуса, шт */
    spray: 0.35,      /* разброс задержек капель, с */
    fizz: 0.4,        /* доля посадок, которые шипят, 0..1 */
    carpetHold: 8,    /* сколько лужа пузырится, с */
    drips: 10,        /* капель с руки после броска, шт */
    dripHold: 3,      /* сколько пузырится пятно под рукой, с */
    decalHold: 20,    /* стойкость следа, с */
    decalRise: 1.1,   /* за сколько проявляется главная лужа, с */
  });
  const ux = Math.sin(dir), uz = Math.cos(dir);
  const H = [e.x + ux * S.hand, S.y, e.z + uz * S.hand];

  /* СЛЕДЫ ПЕРВЫМИ — иначе ковёр выселит их из кольца (см. шапку). */
  kit.decal(vfx, { type: 'acid', x: e.x + ux * range * 0.6, z: e.z + uz * range * 0.6, radius: range * S.pool, hold: S.decalHold, rise: S.decalRise, tint: P[2], seed: (seed % 9) + 1 });
  for (const sgn of [-1, 1]) {
    const a = dir + sgn * half * 0.5;
    /* Боковые лужи были в АБСОЛЮТНЫХ метрах (0.5) при главной в долях длины:
       у длинного конуса по краям оставались две точки, не растущие с замахом.
       Доля 0.15 даёт те же 0.51 м на реестровых 3.4 м. Расплывается такое
       пятнышко вдвое быстрее главной лужи — оно втрое меньше. */
    kit.decal(vfx, { type: 'acid', x: e.x + Math.sin(a) * range * 0.55, z: e.z + Math.cos(a) * range * 0.55, radius: range * S.flank, hold: S.decalHold, rise: S.decalRise * 0.5, tint: P[2], seed: ((seed + sgn + 3) % 9) + 1 });
  }

  const n = clampN(kit.countFor(S.drops, fp.area, kit.REF_AREA.cone, 420), 60, 420);
  /*
   * КАПЛИ ОБЯЗАНЫ ПАДАТЬ В КОНУС. Прежние 9–13 м/с с подъёмом 5–20° уносили
   * их на 6–15 м (пересчёт по той же формуле посадки) — вдвое-вчетверо дальше
   * собственного следа (реестровая длина 3.4 м) и мимо любого `e.range`.
   * Теперь капли ложатся ПО ВСЕМУ сектору. Скорость
   * теперь РЕШАЕТСЯ из той же баллистики, по которой `droplet` считает посадку
   * (g = 9, старт с высоты `S.y`): v = R·√(g / (2·cos²α·(y₀ + R·tg α))).
   * Дальность меряется от кастера, поэтому вынос руки вычитается.
   */
  /*
   * ДАЛЬНОСТЬ — СВОЯ У КАЖДОЙ КАПЛИ, И ПО ПЛОЩАДИ. Первая правка решала
   * баллистику от ОДНОЙ дальности на весь каст, и все капли до единой
   * ложились на внешнюю кромку: пересчёт 200 тысяч капель дал 98.7 % между
   * 0.90 и 1.10 длины и РОВНО НОЛЬ ближе 0.8 — весь блеск и шипение
   * полутораметрового пятна собирались в кольцо шириной 0.7 м по его краю.
   * Было «всё мимо конуса», стало «всё по ободу»; нужно «по сектору».
   * Множитель `√rng` берёт долю равномерно ПО ПЛОЩАДИ, а не по радиусу, —
   * иначе середина оказывается гуще края, чего у брызга не бывает.
   */
  const landed = [];
  for (let i = 0; i < n; i++) {
    const a = dir + (rng() * 2 - 1) * half;
    const el = (5 + rng() * 15) * (Math.PI / 180);
    const ca = Math.cos(el);
    const reach = Math.max(0.5, range * S.reach * Math.sqrt(rng()) - S.hand);
    const sp = reach * Math.sqrt(9 / (2 * ca * ca * (S.y + reach * Math.tan(el)))) * (0.9 + rng() * 0.2);
    landed.push(droplet(vfx, P, {
      x: H[0], y: H[1], z: H[2],
      vx: Math.sin(a) * sp * ca, vy: sp * Math.sin(el), vz: Math.cos(a) * sp * ca,
      rng, at: rng() * S.spray,
    }));
  }
  carpet(vfx, P, landed, S.carpetHold, rng);
  fizz(vfx, P, landed, rng, { rate: S.fizz });
  fumes(vfx, P, { x: e.x + ux * range * 0.55, z: e.z + uz * range * 0.55, r: range * 0.6, n: 26, life: 1.2, rng });
  /* Рука КАПАЕТ ещё полсекунды после броска. */
  const drips = [];
  for (let i = 0; i < S.drips; i++) {
    drips.push(droplet(vfx, P, { x: H[0], y: H[1], z: H[2], vx: (rng() - 0.5) * 0.6, vy: 0, vz: (rng() - 0.5) * 0.6, rng, at: 0.1 + rng() * 0.4 }));
  }
  carpet(vfx, P, drips, S.dripHold, rng);
  vfx.flashLight(H[0], H[1], H[2], P[1], 8, 0.3, 6);
  return true;
}

export function bolt(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const S = kit.tune(e, {
    y: 1.1,           /* высота слива с руки, м */
    hand: 0.7,        /* вынос точки слива вперёд, м */
    range: 10,        /* длина струи, м */
    speed: 20,        /* скорость капель, м/с */
    pour: 0.25,       /* окно слива, СЕКУНДЫ */
    pool: 0.6,        /* радиус лужи на конце струи, доли радиуса удара */
    hitPool: 0.6,     /* радиус лужи под жертвой, доли радиуса удара */
    splash: 24,       /* капель в брызге по жертве, шт */
    fizz: 0.3,        /* доля посадок, которые шипят, 0..1 */
    carpetHold: 6,    /* сколько пузырится лужа струи, с */
    hitHold: 4,       /* сколько пузырится лужа под жертвой, с */
    decalHold: 20,    /* стойкость следа, с */
    decalRise: 0.9,   /* за сколько проявляется лужа, с */
  });
  const ux = Math.sin(e.h), uz = Math.cos(e.h);
  const len = Math.max(1.5, S.range);
  const speed = Math.max(6, S.speed);
  const H = [e.x + ux * S.hand, S.y, e.z + uz * S.hand];
  const state = { hit: null };
  vfx.flight(e.who, e.skill, state);

  /* P1: СТРУЯ, а не ком. Капли льются из руки непрерывно — сама струя и есть
     разряд; ни одного летящего объекта. Окно слива — это ДЛИТЕЛЬНОСТЬ, и оно
     обязано следовать полёту: доля 0.68 от `len/speed` даёт прежние 0.25 с на
     реестровых 8.15 м / 22 м/с и растёт у медленной дальней струи. Потолок
     0.6 с — чтобы слив не пережил сам каст. */
  /*
   * ОКНО СЛИВА — В СЕКУНДАХ, а не в долях времени полёта. Доля 0.68 была
   * подобрана под дальность 8.15 м, которой нет нигде в проекте: стойка даёт
   * 9.19 м (`vfxfixture.js`), реестр — 18 м (`registry.js`), и на реестровом
   * болте окно выходило 0.556 с — вдвое против 0.25 с, которые план называет
   * приёмочным числом (docs/VFX-PLAN.md §6.4). Абсолютная секунда никуда не
   * уедет при смене дальности и настраивается напрямую.
   */
  const pour = Math.max(0.05, S.pour);
  const landed = [];
  const N = clampN(Math.round(len * 9), 40, 160);
  for (let i = 0; i < N; i++) {
    const f = i / N;
    const sp = speed * (0.9 + rng() * 0.2);
    landed.push(droplet(vfx, P, {
      x: H[0], y: H[1], z: H[2],
      vx: ux * sp + (rng() - 0.5) * 1.2, vy: 1.2 + rng() * 0.8, vz: uz * sp + (rng() - 0.5) * 1.2,
      rng, at: f * pour,
    }));
  }
  carpet(vfx, P, landed, S.carpetHold, rng);
  fizz(vfx, P, landed, rng, { rate: S.fizz });
  /* Радиус лужи — от радиуса удара доставки (`footprint`), а не абсолютные
     0.8 м: 1.4 × 0.6 = 0.84, то же пятно, но оно теперь знает свой снаряд. */
  kit.decal(vfx, { type: 'acid', x: H[0] + ux * len * 0.8, z: H[2] + uz * len * 0.8, radius: fp.radius * S.pool, hold: S.decalHold, rise: S.decalRise, tint: P[2], seed: (seed % 9) + 1 });
  vfx.flashLight(H[0], H[1], H[2], P[1], 8, 0.25, 6);

  /* Попадание (§7.2): брызги по жертве. */
  vfx.spawnMesh(new THREE.Group(), len / speed + 0.6, (o, u) => {
    if (!state.hit || o.userData.done) return;
    o.userData.done = true;
    const X = state.hit.x, Z = state.hit.z;
    const sp = [];
    for (let i = 0; i < S.splash; i++) {
      const a = rng() * TAU, v = 2.5 + rng() * 2.5;
      sp.push(droplet(vfx, P, { x: X, y: 1.2, z: Z, vx: Math.sin(a) * v, vy: 1.5 + rng(), vz: Math.cos(a) * v, rng }));
    }
    carpet(vfx, P, sp, S.hitHold, rng);
    fizz(vfx, P, sp, rng, { rate: 1 });
    kit.decal(vfx, { type: 'acid', x: X, z: Z, radius: fp.radius * S.hitPool, hold: S.decalHold, rise: S.decalRise, tint: P[2], seed: ((seed + 4) % 9) + 1 });
    vfx.flights.delete(`${e.who}:${e.skill}`);
  });
  return true;
}

export function lob(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const S = kit.tune(e, {
    y: 1.1,           /* высота броска, м */
    hand: 0.7,        /* вынос точки броска вперёд, м */
    range: 10,        /* дальность броска, м */
    speed: 12,        /* скорость колбы, м/с */
    apex: 0.35,       /* подъём дуги, доли длины броска */
    flask: 0.25,      /* радиус колбы, м */
    trail: 0.06,      /* период капель со швов колбы, с */
    pool: 1.15,       /* радиус лужи посадки, доли радиуса удара */
    splash: 40,       /* капель в брызге посадки, шт */
    carpetHold: 8,    /* сколько лужа пузырится, с */
    decalHold: 20,    /* стойкость следа, с */
    decalRise: 1.4,   /* за сколько РАСТЕКАЕТСЯ лужа разбитой колбы, с */
    shake: 0.15,      /* толчок камеры на посадке, доли */
  });
  const ux = Math.sin(e.h), uz = Math.cos(e.h);
  const len = Math.max(1.5, S.range);
  const speed = Math.max(4, S.speed);
  const travel = len / speed;
  const A = [e.x + ux * S.hand, S.y, e.z + uz * S.hand];
  const E = [A[0] + ux * len, 0.25, A[2] + uz * len];
  /* Подъём дуги — главный параметр навеса: им он и отличается от болта.
     Поле названо `apex`, а не `arc`: `arc` сим уже кладёт на снаряд флагом
     (`deliver.js`), и одноимённая ручка означала бы дугу в целую длину. */
  const apex = S.apex * len;
  /* Радиус лужи — от радиуса удара доставки: 1.4 × 1.15 = 1.61, прежние 1.6 м,
     но теперь пятно следует за снарядом, а не стоит абсолютным числом. */
  const pool = fp.radius * S.pool;

  /* КОЛБА — брошенный предмет: P1 к ней не применяется, она летит. */
  const f = flask(P, S.flask);
  let landed = false;
  let trailAt = 0;
  vfx.spawnMesh(f.mesh, travel + 0.1, (o, u) => {
    const t = u * (travel + 0.1);
    const k = Math.min(1, t / travel);
    const x = A[0] + (E[0] - A[0]) * k;
    const z = A[2] + (E[2] - A[2]) * k;
    const y = Math.max(0.25, A[1] + (E[1] - A[1]) * k + 4 * apex * k * (1 - k));
    o.position.set(x, y, z);
    o.rotation.set(t * 5, t * 3, 0);
    f.set(1);
    if (t >= trailAt && k < 1) {
      trailAt = t + S.trail;
      droplet(vfx, P, { x, y, z, vx: (rng() - 0.5) * 0.5, vy: -0.5, vz: (rng() - 0.5) * 0.5, rng });
    }
    if (k >= 1 && !landed) {
      landed = true;
      o.visible = false;
      /* Посадка: сорок капель в диск 2 м, шипение, пары, лужа. Лужа вторая
         по ширине после зоны и наливается дольше всех, кроме неё: колба
         ЛОПАЕТСЯ, содержимое РАСТЕКАЕТСЯ — оно не появляется разом. */
      kit.decal(vfx, { type: 'acid', x: E[0], z: E[2], radius: pool, hold: S.decalHold, rise: S.decalRise, tint: P[2], seed: (seed % 9) + 1 });
      const sp = [];
      for (let i = 0; i < S.splash; i++) {
        const a = rng() * TAU, v = 1.5 + rng() * 3.5;
        sp.push(droplet(vfx, P, { x: E[0], y: 0.4, z: E[2], vx: Math.sin(a) * v, vy: 2 + rng() * 1.5, vz: Math.cos(a) * v, rng }));
      }
      carpet(vfx, P, sp, S.carpetHold, rng);
      fizz(vfx, P, sp, rng, { rate: 1 });
      fumes(vfx, P, { x: E[0], z: E[2], r: pool * 1.1, n: 34, life: 2, rng });
      vfx.screen.shake(S.shake);
      vfx.flashLight(E[0], 0.6, E[2], P[1], 10, 0.3, 6);
    }
  });
  return true;
}

export function zone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const r = fp.radius;
  const S = kit.tune(e, {
    duration: 3,      /* жизнь зоны, с */
    pool: 1.05,       /* радиус следа, доли радиуса зоны */
    spots: 26,        /* точек ковра на метр радиуса, шт */
    bubble: 0.1,      /* период пузырей, с */
    edge: 2,          /* пузырей по ободу за такт, шт */
    carpetAfter: 2,   /* сколько лужа пузырится после конца зоны, с */
    decalAfter: 6,    /* сколько след держится после конца зоны, с */
    decalRise: 1.6,   /* за сколько РАЗЛИВАЕТСЯ лужа зоны, с */
    fume: 0.6,        /* сколько курится пар, доли длительности */
  });
  const D = Math.max(0.8, S.duration);
  /*
   * ЛУЖА: один след сразу; в конце ничего не схлопывается — она просто
   * перестаёт пузыриться, а след держится ещё `decalAfter` секунд и уходит
   * обычным затуханием. Стойкость была глухими 20 с и не смотрела на
   * `duration` вовсе: трёхсекундная зона оставляла после себя пятно ещё на
   * двадцать секунд — лужа переживала того, кто её наливает, вшестеро.
   * Основатель про это и писал: след обязан подстраиваться под реальную
   * длительность умения. Разливается она дольше всех в модуле — это самое
   * широкое пятно кислоты (три метра против полутора у колбы).
   */
  kit.decal(vfx, { type: 'acid', x: e.x, z: e.z, radius: r * S.pool, hold: D + S.decalAfter, rise: S.decalRise, tint: P[2], seed: (seed % 9) + 1 });
  const spots = [];
  const nSpot = clampN(Math.round(r * S.spots), 40, 160);
  for (let i = 0; i < nSpot; i++) {
    const a = rng() * TAU, f = Math.sqrt(rng()), d = f * r;
    /*
     * ЛУЖА РАСТЕКАЕТСЯ ОТ ЦЕНТРА, а не возникает готовой. Точка ковра ждёт
     * тем дольше, чем дальше она от середины: `t = f · decalRise`. Прежде у
     * всех точек стояло `t: 0`, и весь ковёр — до полутора сотен пятен —
     * выпускался в первом же кадре; на это основатель и жаловался («след
     * появляется почти мгновенно и очень резко»). Плавное проявление самого
     * следа (`rise` в `kit.decal`) этого не лечило: поверх него лежал ковёр
     * частиц, который появлялся разом и перекрывал собой всю картину.
     * Разбег привязан к `decalRise`, чтобы жидкость и её пятно разливались
     * одним движением.
     */
    spots.push({ x: e.x + Math.sin(a) * d, z: e.z + Math.cos(a) * d, t: f * S.decalRise });
  }
  carpet(vfx, P, spots, D + S.carpetAfter, rng);
  /* Двадцать пузырей в секунду; по ободу — ярче. */
  let next = 0;
  vfx.spawnMesh(new THREE.Group(), D, (o, u) => {
    const t = u * D;
    if (t < next) return;
    next = t + S.bubble;
    /* Пузырится только то, что УЖЕ разлилось: пятна, чей срок ещё не
       наступил, лужей пока не являются. */
    const live = spots.filter((s2) => t >= (s2.t || 0));
    fizz(vfx, P, live.slice(0, Math.max(2, Math.round(live.length * 0.05))).map((s2) => ({ ...s2, t: 0 })), rng, { rate: 1 });
    for (let i = 0; i < S.edge; i++) {
      const a = rng() * TAU;
      fizz(vfx, P, [{ x: e.x + Math.sin(a) * r * 0.95, z: e.z + Math.cos(a) * r * 0.95, t: 0 }], rng, { rate: 1 });
    }
  });
  /*
   * ПАР ПОДНИМАЕТСЯ ВСЛЕД ЗА РАЗЛИВОМ, а не весь разом. Сорок больших
   * зелёных клубов, выпущенных в кадре каста, накрывали всё пятно целиком —
   * и разлив, который мы устроили ковру и следу, был не виден вообще: замер
   * показывал 10778 зелёных пикселей на 0.15 с при следе в полпроцента
   * непрозрачности. Пар делится на пять заходов по времени разлива; курится
   * он ровно там, где лужа уже есть.
   */
  const nF = clampN(Math.round(r * 10), 12, 40);
  for (let i = 0; i < 5; i++) {
    const f = i / 5;
    fumes(vfx, P, {
      x: e.x, z: e.z, r: r * 0.9 * (0.35 + 0.65 * f), n: Math.max(2, Math.round(nF / 5)),
      life: D * S.fume, at: vfx.now + f * S.decalRise, rng,
    });
  }
  return true;
}

export function impact(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = kit.tune(e, {
    pool: 0.75,       /* радиус лужи под жертвой, доли радиуса капсулы */
    splash: 16,       /* капель в брызге, шт */
    bubbles: 24,      /* пузырей на поверхности тела, шт */
    drips: 14,        /* капель, стекающих с тела, шт */
    dripSpan: 1.2,    /* сколько тело капает, с */
    carpetHold: 4,    /* сколько пузырятся лужи, с */
    decalHold: 20,    /* стойкость следа, с */
    decalRise: 0.6,   /* пятно под телом маленькое — проявляется быстро, с */
  });
  const cand = ['blue', 'orange'].map((id) => {
    const b = ctx && ctx.bodyShape ? ctx.bodyShape(id) : null;
    return b ? { id, ...b } : null;
  }).filter(Boolean).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
  const bs = cand[0] && Math.hypot(cand[0].x - e.x, cand[0].z - e.z) <= 2 ? cand[0] : null;
  const cx = bs ? bs.x : e.x, cz = bs ? bs.z : e.z;
  const R = (bs ? bs.r : 0.9) * 1.05, H = (bs ? bs.h : 2.0);

  /* Радиус пятна — от КАПСУЛЫ ЖЕРТВЫ, которая посчитана строкой выше и до
     сих пор шла только на пузыри и капли: 0.9 × 1.05 × 0.75 = 0.71, прежние
     0.7 м, но под крупным телом лужа теперь крупнее. */
  kit.decal(vfx, { type: 'acid', x: cx, z: cz, radius: R * S.pool, hold: S.decalHold, rise: S.decalRise, tint: P[2], seed: (seed % 9) + 1 });
  const sp = [];
  for (let i = 0; i < S.splash; i++) {
    const a = rng() * TAU, v = 2 + rng() * 2.5;
    sp.push(droplet(vfx, P, { x: cx, y: H * 0.6, z: cz, vx: Math.sin(a) * v, vy: 1.5 + rng(), vz: Math.cos(a) * v, rng }));
  }
  carpet(vfx, P, sp, S.carpetHold, rng);
  /* Шипение НА ПОВЕРХНОСТИ капсулы (P2): пузырьки рождаются на теле. */
  vfx.glow.emit(S.bubbles, (i, s) => {
    const a = rng() * TAU, hh = rng();
    s.pos(cx + Math.sin(a) * R, 0.2 + hh * H, cz + Math.cos(a) * R);
    s.vel(Math.sin(a) * 0.2, 0.5, Math.cos(a) * 0.2);
    s.gravity(0, 0, 0);
    s.color(P[0], P[1]);
    s.life(vfx.now + rng() * 0.3, 0.3 + rng() * 0.3, 0.05 + rng() * 0.04, kit.SHAPE.dot);
    s.ext(0, 0.0, 0, 0.1);
  });
  /* Капли СТЕКАЮТ с тела 1.2 с. */
  const dr = [];
  for (let i = 0; i < S.drips; i++) {
    const a = rng() * TAU, hh = 0.3 + rng() * 0.6;
    dr.push(droplet(vfx, P, { x: cx + Math.sin(a) * R, y: hh * H, z: cz + Math.cos(a) * R, vx: 0, vy: 0, vz: 0, rng, at: rng() * S.dripSpan }));
  }
  carpet(vfx, P, dr, S.carpetHold, rng);
  return true;
}

const STATUS = new Map();

export function status(vfx, e, P, ctx) {
  const who = e.who || 'orange';
  const S = kit.tune(e, {
    duration: EFFECTS[e.effect]?.duration ?? 1.5,  /* жизнь статуса, с */
    drip: 0.3,        /* период срыва капель с тела, с */
    drops: 3,         /* капель за срыв, шт */
    fume: 0.5,        /* период пара, с */
    carpetHold: 2.2,  /* сколько пузырится лужа под телом, с */
    max: 60,          /* потолок жизни узла, с */
  });
  const dur = S.duration;
  const key = `${who}:${e.effect}`;
  const live = STATUS.get(key);
  if (live && live.until > vfx.now) { live.until = vfx.now + dur; return true; }
  const entry = { until: vfx.now + dur };
  STATUS.set(key, entry);

  const seed = seedOf(e);
  const rng = mulberry(seed);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(who) : null) || { x: e.x ?? 0, z: e.z ?? 0 };
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(who) : null;
  const R = (bs ? bs.r : 0.9) * 1.05, H = (bs ? bs.h : 2.0);
  const MAX = S.max;
  let nextDrip = 0, nextFume = 0;
  /* РАЗЪЕДАЕТСЯ: капли срываются с тела каждые 0.3 с, шипят там, где упали,
     под телом растёт лужа, раз в полсекунды поднимается пар. */
  vfx.spawnMesh(new THREE.Group(), MAX, (o, u) => {
    const t = u * MAX;
    if (vfx.now > entry.until) { if (STATUS.get(key) === entry) STATUS.delete(key); return; }
    const p = at();
    if (t >= nextDrip) {
      nextDrip = t + S.drip;
      const l = [];
      for (let i = 0; i < S.drops; i++) {
        const a = rng() * TAU, hh = 0.3 + rng() * 0.6;
        l.push(droplet(vfx, P, { x: p.x + Math.sin(a) * R, y: hh * H, z: p.z + Math.cos(a) * R, vx: 0, vy: 0, vz: 0, rng }));
      }
      carpet(vfx, P, l, S.carpetHold, rng);
      fizz(vfx, P, l, rng, { rate: 1 });
    }
    if (t >= nextFume) {
      nextFume = t + S.fume;
      fumes(vfx, P, { x: p.x, z: p.z, r: R, n: 2, life: 1.2, rng });
    }
  });
  return true;
}

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = kit.tune(e, {
    windup: 0.4,      /* замах, с */
    y: 1.1,           /* высота руки, м */
    hand: 0.7,        /* вынос руки вперёд, м */
    period: 0.12,     /* период капель с руки, с */
    carpetHold: 2,    /* сколько пузырится пятно под рукой, с */
  });
  const secs = Math.max(0.15, S.windup);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const dir = e.h ?? 0;
  let next = 0;
  const l = [];
  /* Пятно под рукой не может высохнуть раньше, чем кончится сам замах:
     при длинном замахе первые капли пропадали до удара. Отсюда пол по
     `carpetHold` и рост вместе с `secs`. */
  const dripHold = Math.max(S.carpetHold, secs);
  /* Рука КАПАЕТ, под ней растёт пятно: замах кислоты — накопление жидкости. */
  vfx.spawnMesh(new THREE.Group(), secs, (o, u) => {
    const t = u * secs;
    if (t < next) return;
    next = t + S.period;
    const p = at();
    l.push(droplet(vfx, P, {
      x: p.x + Math.sin(dir) * S.hand, y: S.y, z: p.z + Math.cos(dir) * S.hand,
      vx: (rng() - 0.5) * 0.3, vy: 0, vz: (rng() - 0.5) * 0.3, rng,
    }));
    carpet(vfx, P, [l[l.length - 1]], dripHold, rng);
  });
  return true;
}
