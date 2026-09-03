/**
 * ПУСТОТА (`void`) — ОТСУТСТВИЕ (заказ основателя: «пустота и кинетика не
 * доделаны, доделайте их»).
 *
 * Что это такое. Не взрыв и не свет: место, где вещества БОЛЬШЕ НЕТ. Разрез,
 * а не ствол; яма, а не диск; схлопывание, а не разлёт. Читается двумя
 * вещами сразу — почти чёрной сердцевиной (пол под ней перестал быть) и
 * тонкой фиолетовой кромкой по краю разрыва, где реальность ещё держится.
 *
 * ЧЕМ ОНА ОТЛИЧАЕТСЯ ОТ КИНЕТИКИ, у которой похожая сдержанность. Кинетика —
 * это ФОРМА И ДВИЖЕНИЕ вещества: пыль, обломки, трещины, отдача. У пустоты
 * вещества нет вовсе: ей нельзя поднять пыль и нечему отлететь. Её язык —
 * ГЕОМЕТРИЯ ДЫРЫ и то, что в неё СТЯГИВАЕТСЯ. Поэтому здесь нет ни одной
 * разлетающейся частицы: всё летит ВНУТРЬ.
 *
 * НА БЕЛОМ ПОЛУ пустота держится сердцевиной — почти чёрным нормально
 * смешанным `P[2]`, а не фиолетовым свечением: `P[1]` (#a98cf0) на белом
 * выцветает в сиреневую дымку. Светится только кромка, и то узкая.
 *
 * НАСТРОЙКА — через `kit.tune(e, {...})`, опись в начале каждой формы.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { TIME, clamp01, col, markGlow, markDistort, mulberry, pooled, rnd, seedOf, shared, withFade } from './core.js';
import * as kit from './kit.js';
import { EFFECTS } from '../../skills/registry.js';

const {
  float, vec2, vec3, uv, uniform, mix, smoothstep, oneMinus, abs: tabs,
  normalView, positionViewDirection, mx_noise_float, mx_fractal_noise_float,
} = TSL;

const TAU = Math.PI * 2;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const hex = (P) => P.map((c) => c.getHexString()).join();
const yawFor = (ux, uz) => Math.atan2(-uz, ux);

/* ── материалы: дыра и её кромка ────────────────────────────────────────── */

/**
 * `holeMat` — плоская дыра на полу: почти чёрная сердцевина, рваный край по
 * шуму, узкая фиолетовая кромка и ТОЛЬКО она в bloom. `open` — доля, до
 * которой дыра раскрыта (0 — закрыта, 1 — полностью).
 */
function holeMat(P) {
  return pooled(`void:hole:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    const open = uniform(1), seed = uniform(1);
    m.userData.u = { fade, open, seed };
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const d = q.length();
    const n = mx_fractal_noise_float(vec3(q.mul(2.6), seed), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
    /* Край рваный: разрыв не бывает круглым. */
    const edge = d.add(n.sub(0.5).mul(0.4)).div(open.max(0.001));
    const inside = oneMinus(smoothstep(float(0.82), float(1.0), edge));
    /* Кромка — узкая полоса у самого края, где реальность ещё держится. */
    const rim = smoothstep(float(0.62), float(0.86), edge).mul(oneMinus(smoothstep(float(0.98), float(1.12), edge)));
    m.colorNode = mix(vec3(0.015, 0.010, 0.030), col(P[1]).mul(1.4), rim.clamp(0, 1));
    m.opacityNode = inside.mul(0.96).max(rim.mul(0.9)).mul(fade).clamp(0, 1);
    /* Пол НЕ ЦВЕТЁТ (§10.1): в bloom уходит только кромка, и слабо. */
    return markGlow(m, rim.mul(fade).mul(0.35).clamp(0, 0.35));
  }, 4);
}

let HOLE_GEO = null;
function hole(P, { x, z, r, seed, y = 0.027 }) {
  if (!HOLE_GEO) HOLE_GEO = shared(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const m = holeMat(P);
  m.userData.u.seed.value = seed;
  const mesh = new THREE.Mesh(HOLE_GEO, m);
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(r * 2);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return { mesh, set(fade, open = 1) { m.userData.fade.value = fade; m.userData.u.open.value = open; } };
}

/**
 * `riftMat` — РАЗРЕЗ в воздухе: почти чёрная щель с фиолетовой кромкой,
 * искажающая то, что за ней. Поперёк (`uv().y`) сердцевина узкая, кромка ещё
 * уже; вдоль (`uv().x`) щель сходит на нет к обоим концам — у разреза нет
 * торцов, он просто кончается.
 */
function riftMat(P) {
  return pooled(`void:rift:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    const head = uniform(1);
    m.userData.u = { fade, head };
    const dy = tabs(uv().y.sub(0.5)).mul(2);
    const along = uv().x;
    /* Щель шире посередине и сходит к концам — форма пореза, а не бруса. */
    const belly = smoothstep(float(0.0), float(0.22), along).mul(oneMinus(smoothstep(head.sub(0.22), head, along)));
    const w = belly.mul(0.85).add(0.15);
    const core = oneMinus(smoothstep(w.mul(0.42), w.mul(0.72), dy));
    const rim = smoothstep(w.mul(0.6), w.mul(0.86), dy).mul(oneMinus(smoothstep(w.mul(1.0), w.mul(1.25), dy)));
    m.colorNode = mix(vec3(0.012, 0.008, 0.026), col(P[1]).mul(1.5), rim.clamp(0, 1));
    const alpha = core.mul(0.97).max(rim.mul(0.92)).mul(belly).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    /* Кромка тянет картинку за собой — то, что за разрезом, смещено. */
    markDistort(m, vec2(0, 1).mul(rim).mul(0.4), rim.mul(fade).mul(0.5));
    return markGlow(m, rim.mul(alpha).mul(0.4));
  }, 4);
}

let RIFT_A = null, RIFT_B = null;
function riftGeo() {
  if (!RIFT_A) {
    RIFT_A = shared(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0));
    RIFT_B = shared(new THREE.PlaneGeometry(1, 1).rotateX(Math.PI / 2).translate(0.5, 0, 0));
  }
  return [RIFT_A, RIFT_B];
}

/** Разрез от `a` до `b`: крест из двух квадов, ручка `set(fade, head)`. */
function rift(P, a, b, width) {
  const m = riftMat(P);
  const g = new THREE.Group();
  for (const geo of riftGeo()) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    g.add(mesh);
  }
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 0.01;
  g.position.set(a[0], a[1], a[2]);
  g.rotation.y = yawFor(dx / len, dz / len);
  g.rotation.z = Math.asin(clampN(dy / len, -1, 1));
  g.scale.set(len, width, width);
  return { group: g, len, set(fade, head = 1) { m.userData.fade.value = fade; m.userData.u.head.value = head; } };
}

/* ── частицы: всё летит ВНУТРЬ ──────────────────────────────────────────── */

/**
 * `intake` — вещество, СТЯГИВАЕМОЕ в точку. Это единственный вид частиц у
 * пустоты: у неё нечему разлетаться. Частица рождается на радиусе `from` и
 * летит к центру так, чтобы дойти за свою жизнь.
 */
function intake(vfx, P, { x, y = 0.6, z, n, from, life = 0.5, size = 0.14, at = null, rng, glow = 0.35 }) {
  const born = at ?? vfx.now;
  const put = (pool, c1, c2, k) => pool.emit(Math.max(1, Math.round(n * k)), (i, s) => {
    const a = rng() * TAU, e2 = (rng() - 0.5) * 1.2;
    const d = from * (0.7 + rng() * 0.5);
    const px = x + Math.cos(e2) * Math.sin(a) * d, py = y + Math.sin(e2) * d * 0.6, pz = z + Math.cos(e2) * Math.cos(a) * d;
    const L = life * (0.75 + rng() * 0.5);
    s.pos(px, Math.max(0.05, py), pz);
    /* Скорость подобрана так, чтобы частица пришла в центр к концу жизни. */
    s.vel((x - px) / L, (y - Math.max(0.05, py)) / L, (z - pz) / L);
    s.gravity(0, 0, 0);
    s.color(c1, c2);
    s.life(born + rng() * 0.08, L, rnd(size * 0.6, size * 1.4, rng), kit.SHAPE.streak);
    s.ext(0, 0.75, 1, k === 1 ? 0 : glow);
  });
  /* Тёмная доля — в пул тел (её видно на белом полу), светлая — в свечение. */
  put(vfx.body, P[2], P[2], 1);
  put(vfx.glow, P[0], P[1], 0.4);
}

/** Хлопья отслаивающейся реальности: тёмные чипы, падающие в дыру. */
function flakes(vfx, P, { x, y = 0.5, z, n, radius, life = 0.8, size = 0.16, at = null, rng }) {
  const born = at ?? vfx.now;
  vfx.body.emit(n, (i, s) => {
    const a = rng() * TAU, d = Math.sqrt(rng()) * radius;
    const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
    s.pos(px, y + rng() * 0.4, pz);
    s.vel((x - px) * 0.8, -0.4 - rng() * 0.8, (z - pz) * 0.8);
    s.gravity(0, -1.2, 0);
    s.color(P[2], P[2]);
    s.life(born, rnd(life * 0.7, life * 1.3, rng), rnd(size * 0.6, size * 1.4, rng), kit.SHAPE.chip);
    s.ext(rnd(-6, 6, rng), 0.7, 0, 0);
  });
}

/* ── формы ──────────────────────────────────────────────────────────────── */

export function beam(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  if (!(fp.len > 0.3)) return false;
  const S = kit.tune(e, {
    width: 0.34,        /* раскрытие щели, м */
    y: 1.15,            /* высота разреза, м */
    grow: 0.06,         /* за сколько разрез раскрывается, с */
    duration: 0.3,      /* держится, с */
    decay: 0.3,         /* закрывается, с */
    intakeN: 40,        /* сколько вещества втянуто у цели */
    hitRadius: 1.0,
    decalHold: 11,
  });
  const A = [e.x0, S.y, e.z0], B = [e.x1, S.y, e.z1];
  const LIFE = S.grow + S.duration + S.decay;
  const rf = rift(P, A, B, S.width);
  vfx.spawnMesh(rf.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const head = clamp01(t / Math.max(0.001, S.grow));
    /* Закрывается СХЛОПЫВАНИЕМ ширины, а не затуханием: разрез не гаснет,
       он зарастает. */
    const k = t < S.grow + S.duration ? 1 : Math.max(0, 1 - (t - S.grow - S.duration) / Math.max(0.001, S.decay));
    o.scale.set(rf.len, S.width * k, S.width * k);
    rf.set(k > 0 ? 1 : 0, head);
  });
  if (e.hit !== false) {
    intake(vfx, P, { x: B[0], y: S.y, z: B[2], n: S.intakeN, from: S.hitRadius * 1.8, life: 0.45, rng, at: vfx.now + S.grow });
    flakes(vfx, P, { x: B[0], z: B[2], n: 16, radius: S.hitRadius, rng, at: vfx.now + S.grow });
    const h = hole(P, { x: B[0], z: B[2], r: S.hitRadius * 0.8, seed: (seed % 5) + 1 });
    vfx.spawnMesh(h.mesh, 0.9, (o, u) => h.set(u < 0.7 ? 1 : (1 - u) / 0.3, Math.min(1, u * 5)));
    kit.decal(vfx, { type: 'crater', x: B[0], z: B[2], radius: S.hitRadius * 0.9, hold: S.decalHold, fade: 4, rise: 0.2, tint: P[2], seed: (seed % 9) + 1 });
  }
  vfx.screen.aberration(0.5);
  return true;
}

export function cone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const S = kit.tune(e, {
    open: 0.18,         /* за сколько сектор раскрывается, с */
    duration: 0.55,     /* держится, с */
    close: 0.45,        /* зарастает, с */
    intakeN: 70,
    flakeN: 34,
    decalHold: 8,
  });
  const LIFE = S.open + S.duration + S.close;
  /* СЕКТОР ПОЛА, КОТОРОГО НЕТ. Клин строится как срез круга: угол начала и
     размах берутся из следа, так что «ширина конуса» настраивается записью. */
  const seg = Math.max(12, Math.round(fp.half * 24));
  const geo = new THREE.CircleGeometry(1, seg, -fp.half + Math.PI / 2 - fp.dir, fp.half * 2).rotateX(-Math.PI / 2);
  const m = holeMat(P);
  m.userData.u.seed.value = (seed % 5) + 1;
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(e.x, 0.027, e.z);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  vfx.spawnMesh(mesh, LIFE, (o, u) => {
    const t = u * LIFE;
    const open = clamp01(t / S.open);
    const k = t < S.open + S.duration ? 1 : Math.max(0, 1 - (t - S.open - S.duration) / S.close);
    o.scale.setScalar(fp.range * open);
    m.userData.fade.value = k;
    m.userData.u.open.value = 1;
  });
  /* Вещество из сектора стягивается К РУКЕ: пустота не толкает, она берёт. */
  const n = clampN(kit.countFor(S.intakeN, fp.area, kit.REF_AREA.cone, 160), 24, 160);
  for (let i = 0; i < 5; i++) {
    const f = (i + 0.5) / 5;
    const a = fp.dir;
    intake(vfx, P, {
      x: e.x + Math.sin(a) * 0.4, y: 1.0, z: e.z + Math.cos(a) * 0.4,
      n: Math.round(n / 5), from: fp.range * f, life: 0.5, rng, at: vfx.now + f * S.open,
    });
  }
  flakes(vfx, P, { x: e.x + Math.sin(fp.dir) * fp.range * 0.5, z: e.z + Math.cos(fp.dir) * fp.range * 0.5, n: S.flakeN, radius: fp.range * 0.5, rng });
  kit.decal(vfx, { type: 'crater', x: e.x + Math.sin(fp.dir) * fp.range * 0.55, z: e.z + Math.cos(fp.dir) * fp.range * 0.55, radius: fp.range * 0.45, hold: S.decalHold, fade: 4, rise: 0.25, tint: P[2], seed: (seed % 9) + 1 });
  vfx.screen.aberration(0.4);
  return true;
}

export function zone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const S = kit.tune(e, {
    duration: Math.max(0.8, e.duration || 3),
    open: 0.35,          /* раскрытие ямы, с */
    close: 0.4,          /* схлопывание, с */
    period: 0.45,        /* как часто втягивает, с */
    intakeN: 22,         /* вещества за раз */
    flakeN: 8,
    decalHold: 10,
  });
  const D = S.duration, r = fp.radius;
  /* ЯМА: дыра раскрывается, стоит, и в конце СХЛОПЫВАЕТСЯ в точку — не
     гаснет. По краю всё это время осыпаются хлопья и втягивается воздух. */
  const h = hole(P, { x: e.x, z: e.z, r, seed: (seed % 5) + 1 });
  let next = 0;
  vfx.spawnMesh(h.mesh, D + S.close, (o, u) => {
    const t = u * (D + S.close);
    const open = t < S.open ? clamp01(t / S.open) : (t > D ? Math.max(0.001, 1 - (t - D) / S.close) : 1);
    h.set(1, open);
    o.scale.setScalar(r * 2 * open);
    if (t >= next && t < D) {
      next = t + S.period;
      const g = mulberry((seed ^ Math.imul(Math.round(t * 100) + 1, 0x9e3779b1)) >>> 0);
      intake(vfx, P, { x: e.x, y: 0.7, z: e.z, n: S.intakeN, from: r * 1.15, life: 0.55, rng: g });
      flakes(vfx, P, { x: e.x, z: e.z, n: S.flakeN, radius: r * 0.9, rng: g });
    }
  });
  kit.decal(vfx, { type: 'crater', x: e.x, z: e.z, radius: r * 1.02, hold: D + S.decalHold, fade: 4, rise: 0.35, tint: P[2], seed: (seed % 9) + 1 });
  return true;
}

export function self(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = kit.tune(e, { duration: 0.8, intakeN: 30, flakeN: 14 });
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const R = (bs ? bs.r : 0.9) * 1.3, H = (bs ? bs.h : 2.0);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const p0 = at();
  /* КАСТЕР ПЕРЕСТАЁТ БЫТЬ ПО СВОЕМУ КРАЮ: под ним раскрывается дыра ровно
     по его следу, а вещество вокруг стягивается к нему. Никакой сферы —
     сфера вокруг бойца читается энергетическим щитом (урок гравитации,
     радиации и лазера), а пустота щитов не ставит. */
  const h = hole(P, { x: p0.x, z: p0.z, r: R, seed: (seed % 5) + 1 });
  vfx.spawnMesh(h.mesh, S.duration, (o, u) => {
    const p = at();
    o.position.set(p.x, 0.027, p.z);
    const open = u < 0.3 ? u / 0.3 : (u > 0.7 ? Math.max(0.001, 1 - (u - 0.7) / 0.3) : 1);
    h.set(1, open);
    o.scale.setScalar(R * 2 * open);
  });
  intake(vfx, P, { x: p0.x, y: H * 0.5, z: p0.z, n: S.intakeN, from: R * 2.2, life: 0.5, rng });
  flakes(vfx, P, { x: p0.x, z: p0.z, n: S.flakeN, radius: R, rng });
  kit.decal(vfx, { type: 'crater', x: p0.x, z: p0.z, radius: R * 1.1, hold: 7, fade: 3, rise: 0.3, tint: P[2], seed: (seed % 9) + 1 });
  vfx.screen.aberration(0.35);
  return true;
}

/** Снаряд пустоты: прокол, летящий по прямой или по параболе. */
function puncture(vfx, e, P, ctx, arc) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const S = kit.tune(e, {
    speed: e.speed || (arc ? 12 : 20),
    size: 0.55,          /* раскрытие прокола, м */
    y: arc ? 1.3 : 1.15,
    gravity: 18,
    trail: 0.06,
    hitRadius: 1.1,
    intakeN: 34,
    decalHold: 10,
  });
  const ux = Math.sin(e.h), uz = Math.cos(e.h);
  const len = Math.max(1.2, fp.range);
  const T = len / Math.max(4, S.speed);
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const off = (bs ? bs.r : 0.7) + 0.1;
  const A = [e.x + ux * off, S.y, e.z + uz * off];
  const vy = arc ? (S.gravity * T) / 2 : 0;

  const state = { hit: null };
  vfx.flight(e.who, e.skill, state);

  /* Прокол — короткий разрез, летящий поперёк собственного хода: дыра в
     воздухе, которую тянут за собой. */
  /* Прокол ДЛИННЕЕ, чем широк (2.6 к 1): при квадратном разрезе 0.3 м на
     26 м от него оставалось меньше трёх пикселей, и снаряд был невидим. */
  const rf = rift(P, A, [A[0] + ux * S.size * 2.6, S.y, A[2] + uz * S.size * 2.6], S.size);
  let done = false, trailAt = 0;
  vfx.spawnMesh(rf.group, T + 0.6, (o, u) => {
    const t = u * (T + 0.6);
    if (done) return;
    const land = state.hit ? true : t >= T;
    if (!land) {
      const f = t / T;
      const x = A[0] + ux * len * f, z = A[2] + uz * len * f;
      const y = Math.max(0.2, A[1] + vy * t - 0.5 * S.gravity * t * t);
      o.position.set(x, y, z);
      rf.set(1, 1);
      if (t >= trailAt) {
        trailAt = t + S.trail;
        /* След — не искры, а хлопья, осыпающиеся из разреза. */
        flakes(vfx, P, { x, y, z, n: 2, radius: 0.12, life: 0.5, size: 0.1, rng });
      }
      return;
    }
    done = true;
    o.visible = false;
    const X = state.hit ? state.hit.x : A[0] + ux * len;
    const Z = state.hit ? state.hit.z : A[2] + uz * len;
    /* СХЛОПЫВАНИЕ, А НЕ ВЗРЫВ: всё летит внутрь и исчезает. */
    intake(vfx, P, { x: X, y: 1.0, z: Z, n: S.intakeN, from: S.hitRadius * 2, life: 0.45, rng });
    flakes(vfx, P, { x: X, z: Z, n: 18, radius: S.hitRadius, rng });
    const h = hole(P, { x: X, z: Z, r: S.hitRadius, seed: (seed % 5) + 1 });
    vfx.spawnMesh(h.mesh, 1.0, (o2, u2) => h.set(1, u2 < 0.25 ? u2 / 0.25 : Math.max(0.001, 1 - (u2 - 0.25) / 0.75)));
    kit.decal(vfx, { type: 'crater', x: X, z: Z, radius: S.hitRadius * 0.9, hold: S.decalHold, fade: 4, rise: 0.22, tint: P[2], seed: (seed % 9) + 1 });
    vfx.screen.aberration(0.5);
    vfx.screen.shake(0.15);
    vfx.flights.delete(`${e.who}:${e.skill}`);
  });
  return true;
}

export function bolt(vfx, e, P, ctx) { return puncture(vfx, e, P, ctx, false); }
export function lob(vfx, e, P, ctx) { return puncture(vfx, e, P, ctx, true); }

export function impact(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = kit.tune(e, { radius: 0.9, intakeN: 30, flakeN: 14, decalHold: 8 });
  const cand = ['blue', 'orange'].map((id) => {
    const b = ctx && ctx.bodyShape ? ctx.bodyShape(id) : null;
    return b ? { id, ...b } : null;
  }).filter(Boolean).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
  const bs = cand[0] && Math.hypot(cand[0].x - e.x, cand[0].z - e.z) <= 2 ? cand[0] : null;
  const cx = bs ? bs.x : e.x, cz = bs ? bs.z : e.z, cy = bs ? bs.h * 0.55 : 1.0;
  if (e.blocked) {
    intake(vfx, P, { x: e.x, y: 1.0, z: e.z, n: 10, from: 0.7, life: 0.3, rng });
    return true;
  }
  /* ИМПЛОЗИЯ: дыра раскрывается и тут же схлопывается, вещество уходит в неё. */
  intake(vfx, P, { x: cx, y: cy, z: cz, n: S.intakeN, from: S.radius * 2.2, life: 0.4, rng });
  flakes(vfx, P, { x: cx, z: cz, n: S.flakeN, radius: S.radius, rng });
  const h = hole(P, { x: cx, z: cz, r: S.radius, seed: (seed % 5) + 1 });
  vfx.spawnMesh(h.mesh, 0.8, (o, u) => h.set(1, u < 0.22 ? u / 0.22 : Math.max(0.001, 1 - (u - 0.22) / 0.78)));
  kit.decal(vfx, { type: 'crater', x: cx, z: cz, radius: S.radius * 0.85, hold: S.decalHold, fade: 4, rise: 0.22, tint: P[2], seed: (seed % 9) + 1 });
  vfx.screen.aberration(0.4);
  return true;
}

/** Одно тело — один статус (§P10). */
const STATUS = new Map();

export function status(vfx, e, P, ctx) {
  const who = e.who || 'orange';
  const dur = e.duration ?? EFFECTS[e.effect]?.duration ?? 2;
  const key = `${who}:${e.effect}`;
  const live = STATUS.get(key);
  if (live && live.until > vfx.now) { live.until = vfx.now + dur; return true; }
  const entry = { until: vfx.now + dur };
  STATUS.set(key, entry);

  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = kit.tune(e, { period: 0.45, intakeN: 6, flakeN: 2 });
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(who) : null) || { x: e.x ?? 0, z: e.z ?? 0 };
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(who) : null;
  const R = (bs ? bs.r : 0.7) * 1.15, H = (bs ? bs.h : 2.0);
  /* ТЕЛО ОСЫПАЕТСЯ: с него сходят хлопья и втягивается воздух, пока держится
     эффект. Дыра под ногами держится всё время и ходит за телом — это и есть
     «проекция живого эффекта», её жизнь равна длительности статуса. */
  const h = hole(P, { x: at().x, z: at().z, r: R, seed: (seed % 5) + 1 });
  const MAX = 60;
  let next = -1;
  vfx.spawnMesh(h.mesh, MAX, (o, u) => {
    const t = u * MAX;
    if (vfx.now > entry.until) {
      o.visible = false;
      if (STATUS.get(key) === entry) STATUS.delete(key);
      return;
    }
    o.visible = true;
    const p = at();
    o.position.set(p.x, 0.027, p.z);
    h.set(0.85, 0.9);
    if (t >= next) {
      next = t + S.period;
      intake(vfx, P, { x: p.x, y: H * 0.5, z: p.z, n: S.intakeN, from: R * 2, life: 0.45, rng });
      flakes(vfx, P, { x: p.x, z: p.z, n: S.flakeN, radius: R, life: 0.7, size: 0.11, rng });
    }
  });
  return true;
}

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const secs = Math.max(0.15, e.windup || 0.4);
  const S = kit.tune(e, { period: 0.1, reach: 0.7, from: 2.2 });
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const dir = e.h ?? 0;
  /* Замах пустоты — ВДОХ: воздух со всей округи стягивается к руке, и там
     раскрывается точка, в которую он уходит. */
  const h = hole(P, { x: at().x, z: at().z, r: 0.3, seed: (seed % 5) + 1, y: 1.1 });
  h.mesh.rotation.x = 0;
  let next = -1;
  vfx.spawnMesh(h.mesh, secs, (o, u) => {
    const t = u * secs;
    const p = at();
    const hx = p.x + Math.sin(dir) * S.reach, hz = p.z + Math.cos(dir) * S.reach;
    o.position.set(hx, 1.1, hz);
    o.scale.setScalar(0.3 * 2 * (0.3 + 0.7 * u));
    h.set(1, 1);
    if (t >= next) {
      next = t + S.period;
      intake(vfx, P, { x: hx, y: 1.1, z: hz, n: 5, from: S.from * (1 - u * 0.5), life: 0.35, rng });
    }
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
    rise: 0.18,          /* СЕКУНДЫ раскрытия, не доля жизни */
    fall: 0.35,
    period: 0.6,
  });
  const D = S.duration, W = S.w, H = S.height;
  /* СТЕНА — ОДИН ДЛИННЫЙ РАЗРЕЗ, стоящий поперёк прохода: не плита из
     вещества, а место, где прохода больше нет. Коллизионную плиту рисует
     штатный силуэт под нами (§7.3). */
  const rf = rift(P, [e.x - W / 2, H * 0.5, e.z], [e.x + W / 2, H * 0.5, e.z], H * 0.9);
  let next = -1;
  vfx.spawnMesh(rf.group, D, (o, u) => {
    const t = u * D;
    const up = Math.min(1, t / Math.max(0.001, S.rise));
    const k = t > D - S.fall ? Math.max(0, (D - t) / S.fall) : 1;
    o.scale.set(W, H * 0.9 * up * k, H * 0.9 * up * k);
    rf.set(1, up);
    if (t >= next && t < D - S.fall) {
      next = t + S.period;
      flakes(vfx, P, { x: e.x + (rng() - 0.5) * W, z: e.z, n: 4, radius: 0.3, life: 0.9, rng });
    }
  });
  kit.decal(vfx, { type: 'crater', x: e.x, z: e.z, radius: Math.max(W, S.d) * 0.5, hold: D + 5, fade: 4, rise: 0.3, tint: P[2], seed: (seed % 9) + 1 });
  vfx.screen.aberration(0.3);
  return true;
}
