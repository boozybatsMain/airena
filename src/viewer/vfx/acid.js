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
  let next = 0;
  vfx.spawnMesh(new THREE.Group(), hold, (o, u) => {
    const t = u * hold;
    if (t < next) return;
    /* Последнее излучение короче — лужа высыхает, а не пропадает. */
    const left = hold - t;
    for (const l of landed) if (t >= l.t) emitDot(l, left < 1.4 ? Math.max(0.3, left / 1.4) : 1);
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
  const ux = Math.sin(dir), uz = Math.cos(dir);
  const S = [e.x + ux * 0.6, 1.2, e.z + uz * 0.6];

  /* СЛЕДЫ ПЕРВЫМИ — иначе ковёр выселит их из кольца (см. шапку). */
  kit.decal(vfx, { type: 'acid', x: e.x + ux * range * 0.6, z: e.z + uz * range * 0.6, radius: range * 0.5, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
  for (const sgn of [-1, 1]) {
    const a = dir + sgn * half * 0.5;
    kit.decal(vfx, { type: 'acid', x: e.x + Math.sin(a) * range * 0.55, z: e.z + Math.cos(a) * range * 0.55, radius: 0.5, hold: 20, tint: P[2], seed: ((seed + sgn + 3) % 9) + 1 });
  }

  const n = clampN(kit.countFor(160, fp.area, kit.REF_AREA.cone, 420), 60, 420);
  const landed = [];
  for (let i = 0; i < n; i++) {
    const a = dir + (rng() * 2 - 1) * half;
    const el = (5 + rng() * 15) * (Math.PI / 180);
    const sp = 9 + rng() * 4;
    landed.push(droplet(vfx, P, {
      x: S[0], y: S[1], z: S[2],
      vx: Math.sin(a) * sp * Math.cos(el), vy: sp * Math.sin(el), vz: Math.cos(a) * sp * Math.cos(el),
      rng, at: rng() * 0.35,
    }));
  }
  carpet(vfx, P, landed, 8, rng);
  fizz(vfx, P, landed, rng, { rate: 0.4 });
  fumes(vfx, P, { x: e.x + ux * range * 0.55, z: e.z + uz * range * 0.55, r: range * 0.6, n: 26, life: 1.2, rng });
  /* Рука КАПАЕТ ещё полсекунды после броска. */
  const drips = [];
  for (let i = 0; i < 10; i++) {
    drips.push(droplet(vfx, P, { x: S[0], y: S[1], z: S[2], vx: (rng() - 0.5) * 0.6, vy: 0, vz: (rng() - 0.5) * 0.6, rng, at: 0.1 + rng() * 0.4 }));
  }
  carpet(vfx, P, drips, 3, rng);
  vfx.flashLight(S[0], S[1], S[2], P[1], 8, 0.3, 6);
  return true;
}

export function bolt(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const ux = Math.sin(e.h), uz = Math.cos(e.h);
  const len = Math.max(1.5, e.range || 10);
  const speed = Math.max(6, e.speed || 20);
  const S = [e.x + ux * 0.7, 1.1, e.z + uz * 0.7];
  const state = { hit: null };
  vfx.flight(e.who, e.skill, state);

  /* P1: СТРУЯ, а не ком. Капли льются из руки непрерывно 0.25 с — сама
     струя и есть разряд; ни одного летящего объекта. */
  const landed = [];
  const N = clampN(Math.round(len * 9), 40, 160);
  for (let i = 0; i < N; i++) {
    const f = i / N;
    const sp = speed * (0.9 + rng() * 0.2);
    landed.push(droplet(vfx, P, {
      x: S[0], y: S[1], z: S[2],
      vx: ux * sp + (rng() - 0.5) * 1.2, vy: 1.2 + rng() * 0.8, vz: uz * sp + (rng() - 0.5) * 1.2,
      rng, at: f * 0.25,
    }));
  }
  carpet(vfx, P, landed, 6, rng);
  fizz(vfx, P, landed, rng, { rate: 0.3 });
  kit.decal(vfx, { type: 'acid', x: S[0] + ux * len * 0.8, z: S[2] + uz * len * 0.8, radius: 0.8, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
  vfx.flashLight(S[0], S[1], S[2], P[1], 8, 0.25, 6);

  /* Попадание (§7.2): брызги по жертве. */
  vfx.spawnMesh(new THREE.Group(), len / speed + 0.6, (o, u) => {
    if (!state.hit || o.userData.done) return;
    o.userData.done = true;
    const X = state.hit.x, Z = state.hit.z;
    const sp = [];
    for (let i = 0; i < 24; i++) {
      const a = rng() * TAU, v = 2.5 + rng() * 2.5;
      sp.push(droplet(vfx, P, { x: X, y: 1.2, z: Z, vx: Math.sin(a) * v, vy: 1.5 + rng(), vz: Math.cos(a) * v, rng }));
    }
    carpet(vfx, P, sp, 4, rng);
    fizz(vfx, P, sp, rng, { rate: 1 });
    kit.decal(vfx, { type: 'acid', x: X, z: Z, radius: 0.8, hold: 20, tint: P[2], seed: ((seed + 4) % 9) + 1 });
    vfx.flights.delete(`${e.who}:${e.skill}`);
  });
  return true;
}

export function lob(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const ux = Math.sin(e.h), uz = Math.cos(e.h);
  const len = Math.max(1.5, e.range || 10);
  const speed = Math.max(4, e.speed || 12);
  const travel = len / speed;
  const S = [e.x + ux * 0.7, 1.1, e.z + uz * 0.7];
  const E = [S[0] + ux * len, 0.25, S[2] + uz * len];
  const apex = 0.35 * len;

  /* КОЛБА — брошенный предмет: P1 к ней не применяется, она летит. */
  const f = flask(P, 0.25);
  let landed = false;
  let trailAt = 0;
  vfx.spawnMesh(f.mesh, travel + 0.1, (o, u) => {
    const t = u * (travel + 0.1);
    const k = Math.min(1, t / travel);
    const x = S[0] + (E[0] - S[0]) * k;
    const z = S[2] + (E[2] - S[2]) * k;
    const y = Math.max(0.25, S[1] + (E[1] - S[1]) * k + 4 * apex * k * (1 - k));
    o.position.set(x, y, z);
    o.rotation.set(t * 5, t * 3, 0);
    f.set(1);
    if (t >= trailAt && k < 1) {
      trailAt = t + 0.06;
      droplet(vfx, P, { x, y, z, vx: (rng() - 0.5) * 0.5, vy: -0.5, vz: (rng() - 0.5) * 0.5, rng });
    }
    if (k >= 1 && !landed) {
      landed = true;
      o.visible = false;
      /* Посадка: сорок капель в диск 2 м, шипение, пары, лужа. */
      kit.decal(vfx, { type: 'acid', x: E[0], z: E[2], radius: 1.6, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
      const sp = [];
      for (let i = 0; i < 40; i++) {
        const a = rng() * TAU, v = 1.5 + rng() * 3.5;
        sp.push(droplet(vfx, P, { x: E[0], y: 0.4, z: E[2], vx: Math.sin(a) * v, vy: 2 + rng() * 1.5, vz: Math.cos(a) * v, rng }));
      }
      carpet(vfx, P, sp, 8, rng);
      fizz(vfx, P, sp, rng, { rate: 1 });
      fumes(vfx, P, { x: E[0], z: E[2], r: 1.8, n: 34, life: 2, rng });
      vfx.screen.shake(0.15);
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
  const D = Math.max(0.8, e.duration || 3);
  /* ЛУЖА: один след сразу; в конце ничего не схлопывается — она просто
     перестаёт пузыриться, а след держится. */
  kit.decal(vfx, { type: 'acid', x: e.x, z: e.z, radius: r * 1.05, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
  const spots = [];
  const nSpot = clampN(Math.round(r * 26), 40, 160);
  for (let i = 0; i < nSpot; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * r;
    spots.push({ x: e.x + Math.sin(a) * d, z: e.z + Math.cos(a) * d, t: 0 });
  }
  carpet(vfx, P, spots, D + 2, rng);
  /* Двадцать пузырей в секунду; по ободу — ярче. */
  let next = 0;
  vfx.spawnMesh(new THREE.Group(), D, (o, u) => {
    const t = u * D;
    if (t < next) return;
    next = t + 0.1;
    fizz(vfx, P, spots.slice(0, Math.max(2, Math.round(spots.length * 0.05))).map((s2) => ({ ...s2, t: 0 })), rng, { rate: 1 });
    for (let i = 0; i < 2; i++) {
      const a = rng() * TAU;
      fizz(vfx, P, [{ x: e.x + Math.sin(a) * r * 0.95, z: e.z + Math.cos(a) * r * 0.95, t: 0 }], rng, { rate: 1 });
    }
  });
  fumes(vfx, P, { x: e.x, z: e.z, r: r * 0.9, n: clampN(Math.round(r * 10), 12, 40), life: D * 0.6, rng });
  return true;
}

export function impact(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const cand = ['blue', 'orange'].map((id) => {
    const b = ctx && ctx.bodyShape ? ctx.bodyShape(id) : null;
    return b ? { id, ...b } : null;
  }).filter(Boolean).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
  const bs = cand[0] && Math.hypot(cand[0].x - e.x, cand[0].z - e.z) <= 2 ? cand[0] : null;
  const cx = bs ? bs.x : e.x, cz = bs ? bs.z : e.z;
  const R = (bs ? bs.r : 0.9) * 1.05, H = (bs ? bs.h : 2.0);

  kit.decal(vfx, { type: 'acid', x: cx, z: cz, radius: 0.7, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
  const sp = [];
  for (let i = 0; i < 16; i++) {
    const a = rng() * TAU, v = 2 + rng() * 2.5;
    sp.push(droplet(vfx, P, { x: cx, y: H * 0.6, z: cz, vx: Math.sin(a) * v, vy: 1.5 + rng(), vz: Math.cos(a) * v, rng }));
  }
  carpet(vfx, P, sp, 4, rng);
  /* Шипение НА ПОВЕРХНОСТИ капсулы (P2): пузырьки рождаются на теле. */
  vfx.glow.emit(24, (i, s) => {
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
  for (let i = 0; i < 14; i++) {
    const a = rng() * TAU, hh = 0.3 + rng() * 0.6;
    dr.push(droplet(vfx, P, { x: cx + Math.sin(a) * R, y: hh * H, z: cz + Math.cos(a) * R, vx: 0, vy: 0, vz: 0, rng, at: rng() * 1.2 }));
  }
  carpet(vfx, P, dr, 4, rng);
  return true;
}

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
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(who) : null) || { x: e.x ?? 0, z: e.z ?? 0 };
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(who) : null;
  const R = (bs ? bs.r : 0.9) * 1.05, H = (bs ? bs.h : 2.0);
  const MAX = 60;
  let nextDrip = 0, nextFume = 0;
  /* РАЗЪЕДАЕТСЯ: капли срываются с тела каждые 0.3 с, шипят там, где упали,
     под телом растёт лужа, раз в полсекунды поднимается пар. */
  vfx.spawnMesh(new THREE.Group(), MAX, (o, u) => {
    const t = u * MAX;
    if (vfx.now > entry.until) { if (STATUS.get(key) === entry) STATUS.delete(key); return; }
    const p = at();
    if (t >= nextDrip) {
      nextDrip = t + 0.3;
      const l = [];
      for (let i = 0; i < 3; i++) {
        const a = rng() * TAU, hh = 0.3 + rng() * 0.6;
        l.push(droplet(vfx, P, { x: p.x + Math.sin(a) * R, y: hh * H, z: p.z + Math.cos(a) * R, vx: 0, vy: 0, vz: 0, rng }));
      }
      carpet(vfx, P, l, 2.2, rng);
      fizz(vfx, P, l, rng, { rate: 1 });
    }
    if (t >= nextFume) {
      nextFume = t + 0.5;
      fumes(vfx, P, { x: p.x, z: p.z, r: R, n: 2, life: 1.2, rng });
    }
  });
  return true;
}

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const secs = Math.max(0.15, e.windup || 0.4);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const dir = e.h ?? 0;
  let next = 0;
  const l = [];
  /* Рука КАПАЕТ, под ней растёт пятно: замах кислоты — накопление жидкости. */
  vfx.spawnMesh(new THREE.Group(), secs, (o, u) => {
    const t = u * secs;
    if (t < next) return;
    next = t + 0.12;
    const p = at();
    l.push(droplet(vfx, P, {
      x: p.x + Math.sin(dir) * 0.7, y: 1.1, z: p.z + Math.cos(dir) * 0.7,
      vx: (rng() - 0.5) * 0.3, vy: 0, vz: (rng() - 0.5) * 0.3, rng,
    }));
    carpet(vfx, P, [l[l.length - 1]], 2, rng);
  });
  return true;
}
