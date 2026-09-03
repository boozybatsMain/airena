/**
 * КИНЕТИКА (`kinetic`) — УДАР ВЕЩЕСТВА (заказ основателя: «пустота и кинетика
 * не доделаны, доделайте их»).
 *
 * Что это такое. Не энергия и не свет: масса, приходящая в точку. Ударные
 * линии, пыль, поднятая давлением, обломки, трещины в полу, отдача. Ничего не
 * светится — и это ДОМОВОЕ ПРАВИЛО ЭТОГО ФАЙЛА, а не пожелание: у каждого
 * материала здесь `markGlow(m, 0)`, у каждой частицы нулевой вес свечения
 * (`s.ext(..., 0)`), и всё, что обязано читаться, читается ТЁМНЫМ по белому
 * полу обычным блендингом. Единственное «яркое» у кинетики — пыль, а пыль
 * светлая не потому, что светится, а потому, что она пыль.
 *
 * ПОЧЕМУ ЭТО ВООБЩЕ ОТДЕЛЬНАЯ СТИХИЯ. Палитра кинетики (`#d8e2ea #9fb4c4
 * #5d7183`) — серо-стальная, и на белом полу она беднее всех остальных: у
 * неё нет ни цвета, ни свечения, чтобы себя объявить. Значит её язык — ФОРМА
 * и ДВИЖЕНИЕ: резкая геометрия, направленный выброс, оседающая пыль,
 * остающийся скол. Ровно этим она и отличается от пустоты, у которой при
 * похожей сдержанности есть фиолетовый и есть «исчезновение».
 *
 * НАСТРОЙКА. Все размеры и времена — через `kit.tune(e, {...})`: опись в
 * начале формы и есть список того, что можно крутить, а значения по
 * умолчанию равны сегодняшним, так что запись без полей даёт прежний кадр.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { TIME, clamp01, col, markGlow, mulberry, pooled, rnd, seedOf, shared, withFade } from './core.js';
import * as kit from './kit.js';
import { EFFECTS } from '../../skills/registry.js';

const {
  float, vec2, vec3, uv, uniform, mix, smoothstep, oneMinus, abs: tabs,
  normalView, positionViewDirection, mx_noise_float, mx_fractal_noise_float,
} = TSL;

const TAU = Math.PI * 2;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const hex = (P) => P.map((c) => c.getHexString()).join();
/* Курс мира (sin h, cos h) → поворот по Y, уносящий местную +X в него. */
const yawFor = (ux, uz) => Math.atan2(-uz, ux);

/* ── материалы: всё тёмное, всё без свечения ────────────────────────────── */

/**
 * `slabMat` — плоская пластина на полу: тёмная сердцевина `P[2]`, рваный
 * край по шуму, и НИ КАПЛИ свечения. Ею рисуются диск зоны и клин конуса.
 * `reveal` — доля, до которой пластина проявлена (фронт давления бежит
 * наружу), `fade` — общее затухание.
 */
function slabMat(P) {
  return pooled(`kin:slab:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    const reveal = uniform(1), seed = uniform(1);
    m.userData.u = { fade, reveal, seed };
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const d = q.length();
    const grain = mx_fractal_noise_float(vec3(q.mul(3.4), seed), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
    /* Край рваный: пыль не ложится ровным кругом. */
    const edge = d.add(grain.sub(0.5).mul(0.34));
    const body = oneMinus(smoothstep(float(0.45), float(1.0), edge));
    /* Фронт: наружу проявлено только до `reveal`, с узкой тёмной каймой. */
    const front = oneMinus(smoothstep(reveal, reveal.add(0.06), d));
    const lip = smoothstep(reveal.sub(0.12), reveal.sub(0.02), d).mul(front);
    m.colorNode = mix(col(P[2]).mul(0.75), col(P[2]).mul(0.35), lip.add(grain.mul(0.2)).clamp(0, 1));
    m.opacityNode = body.mul(front).mul(grain.mul(0.3).add(0.55)).mul(fade).clamp(0, 1);
    /* Пол не цветёт (§10.1) — и кинетика не цветёт нигде. */
    return markGlow(m, float(0));
  }, 4);
}

let SLAB_GEO = null;
function slab(P, { x, z, r, seed }) {
  if (!SLAB_GEO) SLAB_GEO = shared(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const m = slabMat(P);
  m.userData.u.seed.value = seed;
  const mesh = new THREE.Mesh(SLAB_GEO, m);
  mesh.position.set(x, 0.026, z);
  mesh.scale.setScalar(r * 2);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return { mesh, set(fade, reveal = 1) { m.userData.fade.value = fade; m.userData.u.reveal.value = reveal; } };
}

/**
 * `barMat` — тёмный брус: ударная линия, слуг, прут стены. Плотный `P[2]`
 * с чуть более светлой кромкой, чтобы на тёмной стене он тоже читался.
 * Ни грамма bloom.
 */
function barMat(P) {
  return pooled(`kin:bar:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    m.userData.u = { fade };
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    m.colorNode = mix(col(P[2]).mul(0.7), col(P[1]), fres.pow(2.2).mul(0.8));
    m.opacityNode = float(0.95).mul(fade).clamp(0, 1);
    return markGlow(m, float(0));
  }, 4);
}

let ROD_GEO = null, CHIP_GEO = null;
function rodGeo() {
  /* Брус вдоль местной +X длиной 1 и толщиной 1: масштаб задаёт размеры. */
  if (!ROD_GEO) ROD_GEO = shared(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0));
  return ROD_GEO;
}
function chipGeo() {
  if (!CHIP_GEO) CHIP_GEO = shared(new THREE.IcosahedronGeometry(1, 0));
  return CHIP_GEO;
}

/** Тёмный брус от `a` к `b` толщиной `w`. */
function rod(P, a, b, w) {
  const m = barMat(P);
  const mesh = new THREE.Mesh(rodGeo(), m);
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 0.01;
  mesh.position.set(a[0], a[1], a[2]);
  mesh.rotation.y = yawFor(dx / len, dz / len);
  mesh.rotation.z = Math.asin(clampN(dy / len, -1, 1));
  mesh.scale.set(len, w, w);
  mesh.renderOrder = 9;
  mesh.frustumCulled = false;
  return { mesh, set(fade) { m.userData.fade.value = fade; } };
}

/* ── частицы: пыль, обломки, осколки ────────────────────────────────────── */

/** Пыль: светлая, но БЕЗ свечения — она рассеивает свет, а не излучает. */
function dust(vfx, P, { x, y = 0.15, z, n, radius, speed = 2.2, up = 1.4, life = 1.1, size = 0.5, at = null, rng, dir = null, half = null }) {
  const born = at ?? vfx.now;
  vfx.body.emit(n, (i, s) => {
    const a = dir == null ? rng() * TAU : dir + (rng() * 2 - 1) * (half ?? 0.5);
    const d = Math.sqrt(rng()) * radius;
    s.pos(x + Math.sin(a) * d, y + rng() * 0.3, z + Math.cos(a) * d);
    s.vel(Math.sin(a) * speed * (0.4 + rng() * 0.8), rnd(up * 0.3, up, rng), Math.cos(a) * speed * (0.4 + rng() * 0.8));
    s.gravity(0, -2.2, 0);
    s.color(P[1], P[2]);
    s.life(born + rng() * 0.08, rnd(life * 0.7, life * 1.3, rng), rnd(size * 0.6, size * 1.4, rng), kit.SHAPE.smoke);
    /* Последний аргумент — доля в свечении. У кинетики он НОЛЬ везде. */
    s.ext(rnd(-0.5, 0.5, rng), 0.45, 0, 0);
  });
}

/** Обломки: тяжёлые тёмные чипы, летят и падают. */
function chips(vfx, P, { x, y = 0.3, z, n, radius, speed = 6, up = 6, life = 1.2, size = 0.2, at = null, rng, dir = null, half = null }) {
  const born = at ?? vfx.now;
  vfx.body.emit(n, (i, s) => {
    const a = dir == null ? rng() * TAU : dir + (rng() * 2 - 1) * (half ?? 0.6);
    s.pos(x + Math.sin(a) * radius * Math.sqrt(rng()), y + rng() * 0.3, z + Math.cos(a) * radius * Math.sqrt(rng()));
    s.vel(Math.sin(a) * rnd(speed * 0.4, speed, rng), rnd(up * 0.3, up, rng), Math.cos(a) * rnd(speed * 0.4, speed, rng));
    s.gravity(0, -14, 0);
    s.color(P[2], P[2]);
    s.life(born, rnd(life * 0.7, life * 1.3, rng), rnd(size * 0.6, size * 1.5, rng), kit.SHAPE.chip);
    s.ext(rnd(-9, 9, rng), 0.7, 0, 0);
  });
}

/** Трещины в полу: тонкие тёмные лучи от точки, лежат и остаются. */
function cracks(vfx, P, { x, z, n, len, rng, life = 1.6, at = 0 }) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rng() - 0.5) * 0.5;
    const L = len * (0.6 + rng() * 0.8);
    /* Ломаная в два колена: трещина не бывает прямой. */
    let px = x, pz = z, ang = a;
    for (let k = 0; k < 2; k++) {
      const seg = L * (k === 0 ? 0.6 : 0.4);
      const qx = px + Math.sin(ang) * seg, qz = pz + Math.cos(ang) * seg;
      const r = rod(P, [px, 0.03, pz], [qx, 0.03, qz], 0.035 * (1 - k * 0.35));
      g.add(r.mesh);
      px = qx; pz = qz; ang += (rng() - 0.5) * 0.9;
    }
  }
  vfx.spawnMesh(g, life + at, (o, u) => {
    const t = u * (life + at);
    if (t < at) { o.visible = false; return; }
    o.visible = true;
    const k = t - at;
    for (const c of o.children) c.material.userData.fade.value = k < life * 0.7 ? 1 : Math.max(0, (life - k) / (life * 0.3));
  });
  return g;
}

/* ── формы ──────────────────────────────────────────────────────────────── */

export function beam(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  if (!(fp.len > 0.3)) return false;
  const S = kit.tune(e, {
    width: 0.10,        /* толщина ударной линии, м */
    y: 1.15,            /* высота линии, м */
    grow: 0.045,        /* за сколько долетает, с */
    duration: 0.2,      /* держится, с */
    decay: 0.25,        /* гаснет, с */
    cones: 6,           /* сколько конусов Маха вдоль ствола */
    dustN: 90,          /* пыли вдоль трассы */
    decalHold: 10,      /* стойкость борозды, с */
  });
  const A = [e.x0, S.y, e.z0], B = [e.x1, S.y, e.z1];
  const ux = (B[0] - A[0]) / fp.len, uz = (B[2] - A[2]) / fp.len;
  const LIFE = S.grow + S.duration + S.decay;

  /* РЕЛЬСОТРОН: тёмный стержень и косые конусы уплотнения вдоль него —
     это не свет, а воздух, который не успел расступиться. */
  const g = new THREE.Group();
  const shaft = rod(P, A, B, S.width);
  g.add(shaft.mesh);
  const n = clampN(Math.round(S.cones), 2, 12);
  const cone = [];
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const px = A[0] + ux * fp.len * f, pz = A[2] + uz * fp.len * f;
    const w = S.width * (2.2 + f * 2.6);
    const r = rod(P, [px - ux * w, S.y, pz - uz * w], [px, S.y, pz], w);
    r.mesh.scale.set(w, w * 0.6, w * 0.6);
    g.add(r.mesh);
    cone.push({ r, f });
  }
  vfx.spawnMesh(g, LIFE, (o, u) => {
    const t = u * LIFE;
    const head = clamp01(t / Math.max(0.001, S.grow));
    const k = t < S.grow + S.duration ? 1 : Math.max(0, 1 - (t - S.grow - S.duration) / Math.max(0.001, S.decay));
    shaft.mesh.scale.set(fp.len * head, S.width, S.width);
    shaft.set(k);
    for (const c of cone) c.r.set(c.f <= head ? k : 0);
  });

  /* Пыль, сорванная с пола по всей трассе — она и объявляет удар на белом. */
  const nd = clampN(kit.countFor(S.dustN, fp.area, kit.REF_AREA.beam, 220), 30, 220);
  vfx.body.emit(nd, (i, s) => {
    const f = rng();
    const lat = (rng() - 0.5) * 1.1;
    s.pos(A[0] + ux * fp.len * f - uz * lat, 0.1 + rng() * 0.4, A[2] + uz * fp.len * f + ux * lat);
    s.vel(-uz * (rng() - 0.5) * 2.2, rnd(0.6, 2.4, rng), ux * (rng() - 0.5) * 2.2);
    s.gravity(0, -2.4, 0);
    s.color(P[1], P[2]);
    s.life(vfx.now + f * S.grow, rnd(0.8, 1.6, rng), rnd(0.4, 0.9, rng), kit.SHAPE.smoke);
    s.ext(rnd(-0.4, 0.4, rng), 0.4, 0, 0);
  });
  chips(vfx, P, { x: B[0], y: 0.6, z: B[2], n: 16, radius: 0.4, speed: 7, up: 5, rng, dir: Math.atan2(-ux, -uz), half: 1.1 });
  kit.decal(vfx, { type: 'crater', x: B[0], z: B[2], radius: 1.0, hold: S.decalHold, fade: 4, rise: 0.06, tint: P[2], seed: (seed % 9) + 1 });
  cracks(vfx, P, { x: B[0], z: B[2], n: 5, len: 1.3, rng, life: 2.2 });
  vfx.screen.shake(0.25);
  return true;
}

export function cone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const S = kit.tune(e, {
    sweep: 0.22,        /* за сколько фронт доходит до края, с */
    duration: 0.5,      /* сколько живёт пыль на полу, с */
    dustN: 200,         /* пыли в секторе */
    chipN: 26,          /* обломков */
    decalHold: 9,       /* стойкость борозд, с */
  });
  /* ВАЛ ДАВЛЕНИЯ, идущий по сектору: у набора уже есть секторная волна. */
  kit.shockwave(vfx, {
    x: e.x, z: e.z, radius: fp.range, r0: 0.4, life: S.sweep, colour: P[1],
    intensity: 1.2, dir: fp.dir, half: fp.half, dust: true,
  });
  /* Пластина пола под сектором: проявляется вслед за фронтом. */
  const sl = slab(P, { x: e.x + Math.sin(fp.dir) * fp.range * 0.45, z: e.z + Math.cos(fp.dir) * fp.range * 0.45, r: fp.range * 0.6, seed: (seed % 5) + 1 });
  vfx.spawnMesh(sl.mesh, S.duration + 0.6, (o, u) => {
    const t = u * (S.duration + 0.6);
    sl.set(t < S.duration ? 1 : Math.max(0, 1 - (t - S.duration) / 0.6), clamp01(t / S.sweep));
  });
  const nd = clampN(kit.countFor(S.dustN, fp.area, kit.REF_AREA.cone, 420), 60, 420);
  /* Пыль рождается ВОЛНОЙ: доля пути = доля времени, иначе весь сектор
     вспыхивает разом и фронта не видно. */
  vfx.body.emit(nd, (i, s) => {
    const f = Math.sqrt(rng());
    const a = fp.dir + (rng() * 2 - 1) * fp.half;
    const d = fp.range * f;
    s.pos(e.x + Math.sin(a) * d, 0.1 + rng() * 0.4, e.z + Math.cos(a) * d);
    s.vel(Math.sin(a) * rnd(1.5, 4, rng), rnd(0.8, 2.6, rng), Math.cos(a) * rnd(1.5, 4, rng));
    s.gravity(0, -2.6, 0);
    s.color(P[1], P[2]);
    s.life(vfx.now + f * S.sweep, rnd(0.8, 1.6, rng), rnd(0.5, 1.1, rng), kit.SHAPE.smoke);
    s.ext(rnd(-0.5, 0.5, rng), 0.4, 0, 0);
  });
  chips(vfx, P, { x: e.x, y: 0.3, z: e.z, n: S.chipN, radius: 0.6, speed: 8, up: 5, rng, dir: fp.dir, half: fp.half });
  kit.decal(vfx, { type: 'crater', x: e.x + Math.sin(fp.dir) * fp.range * 0.55, z: e.z + Math.cos(fp.dir) * fp.range * 0.55, radius: fp.range * 0.5, hold: S.decalHold, fade: 4, rise: 0.1, tint: P[2], seed: (seed % 9) + 1 });
  vfx.screen.shake(0.2);
  return true;
}

export function zone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const S = kit.tune(e, {
    duration: Math.max(0.8, e.duration || 3),  /* жизнь зоны, с */
    grow: 0.25,          /* проявление плиты, с */
    period: 0.5,         /* как часто бьёт снова, с (тик зоны сима) */
    dustN: 26,           /* пыли на удар */
    chipN: 8,            /* обломков на удар */
    crackN: 6,           /* трещин на удар */
    decalHold: 12,       /* стойкость скола, с */
  });
  const D = S.duration, r = fp.radius;
  /* РАЗБИТАЯ ПЛИТА, КОТОРУЮ БЬЮТ СНОВА: зона сима переприменяет атомы каждые
     полсекунды — здесь это видно ударами, а не ровным свечением. */
  const sl = slab(P, { x: e.x, z: e.z, r, seed: (seed % 5) + 1 });
  let next = 0, hit = 0;
  vfx.spawnMesh(sl.mesh, D + 0.5, (o, u) => {
    const t = u * (D + 0.5);
    sl.set(t < D ? 1 : Math.max(0, 1 - (t - D) / 0.5), clamp01(t / S.grow));
    if (t >= next && t < D) {
      next = t + S.period;
      hit++;
      const g = mulberry((seed ^ Math.imul(hit, 0x9e3779b1)) >>> 0);
      const a = g() * TAU, d = Math.sqrt(g()) * r * 0.85;
      const hx = e.x + Math.sin(a) * d, hz = e.z + Math.cos(a) * d;
      dust(vfx, P, { x: hx, z: hz, n: S.dustN, radius: 0.5, speed: 2.6, up: 1.8, rng: g });
      chips(vfx, P, { x: hx, z: hz, n: S.chipN, radius: 0.3, speed: 5, up: 5, rng: g });
      cracks(vfx, P, { x: hx, z: hz, n: S.crackN, len: 0.9, rng: g, life: Math.min(2.4, D) });
      kit.shockwave(vfx, { x: hx, z: hz, radius: 1.4, r0: 0.15, life: 0.35, colour: P[1], intensity: 0.7, dust: true });
      vfx.screen.shake(0.12);
    }
  });
  /* След — ОСТАТОК: скол переживает зону, но не на двадцать секунд. */
  kit.decal(vfx, { type: 'crater', x: e.x, z: e.z, radius: r * 1.05, hold: D + S.decalHold, fade: 4, rise: 0.12, tint: P[2], seed: (seed % 9) + 1 });
  return true;
}

export function self(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = kit.tune(e, {
    duration: 0.75,     /* беат каста, с */
    plates: 7,          /* сколько пластин брони */
    thick: 0.1,         /* толщина пластины, м */
    dustN: 22,
  });
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const R = (bs ? bs.r : 0.9) * 1.35, H = (bs ? bs.h : 2.0);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const p0 = at();
  /* УПОР, А НЕ ПУЗЫРЬ: пластины встают вокруг бойца кольцом и упираются в
     пол. Сфера вокруг тела читается энергетическим щитом — а кинетике нужна
     броня, то есть вещество. */
  const g = new THREE.Group();
  const set = [];
  const n = clampN(Math.round(S.plates), 3, 12);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng() * 0.2;
    const px = p0.x + Math.sin(a) * R, pz = p0.z + Math.cos(a) * R;
    const r = rod(P, [px, 0.04, pz], [px, 0.04 + H * 0.8, pz], S.thick);
    /* Пластина шире, чем толще: это щиток, а не прут. */
    r.mesh.scale.set(H * 0.8, S.thick, S.thick * 4.5);
    r.mesh.rotation.y = yawFor(Math.sin(a), Math.cos(a)) + Math.PI / 2;
    r.mesh.rotation.z = Math.PI / 2;
    g.add(r.mesh);
    set.push({ r, a });
  }
  vfx.spawnMesh(g, S.duration, (o, u) => {
    const p = at();
    const k = u < 0.3 ? u / 0.3 : Math.max(0, 1 - (u - 0.3) / 0.7);
    for (let i = 0; i < set.length; i++) {
      const { r, a } = set[i];
      /* Пластины ВЫЛЕТАЮТ наружу на месте: смещение от тела растёт с рывком. */
      const rr = R * (0.55 + 0.45 * Math.min(1, u / 0.3));
      r.mesh.position.set(p.x + Math.sin(a) * rr, 0.04, p.z + Math.cos(a) * rr);
      r.set(k);
    }
  });
  dust(vfx, P, { x: p0.x, z: p0.z, n: S.dustN, radius: R, speed: 2, up: 1.2, rng });
  kit.decal(vfx, { type: 'crater', x: p0.x, z: p0.z, radius: R * 1.1, hold: 8, fade: 3, rise: 0.1, tint: P[2], seed: (seed % 9) + 1 });
  vfx.screen.shake(0.15);
  return true;
}

/** Снаряд: болт — слуг по прямой, навес — та же масса по параболе. */
function slug(vfx, e, P, ctx, arc) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const S = kit.tune(e, {
    speed: e.speed || (arc ? 12 : 22),
    size: 0.22,          /* размер слуга, м */
    y: arc ? 1.3 : 1.15, /* высота вылета, м */
    gravity: 18,         /* тяжесть параболы, м/с² */
    trail: 0.05,         /* как часто сыпать след, с */
    hitRadius: 1.2,
    decalHold: 10,
  });
  const ux = Math.sin(e.h), uz = Math.cos(e.h);
  const len = Math.max(1.2, fp.range);
  const T = len / Math.max(4, S.speed);
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const off = (bs ? bs.r : 0.7) + 0.1;
  const A = [e.x + ux * off, S.y, e.z + uz * off];
  /* Парабола выводится из дальности и скорости, а не из двух магических
     чисел: у 6-метрового и 22-метрового навеса угол вылета обязан отличаться. */
  const vy = arc ? (S.gravity * T) / 2 : 0;

  const state = { hit: null };
  vfx.flight(e.who, e.skill, state);

  const m = barMat(P);
  const mesh = new THREE.Mesh(chipGeo(), m);
  mesh.scale.setScalar(S.size);
  mesh.renderOrder = 9;
  mesh.frustumCulled = false;
  mesh.position.set(A[0], A[1], A[2]);
  let done = false, trailAt = 0;
  vfx.spawnMesh(mesh, T + 0.5, (o, u) => {
    const t = u * (T + 0.5);
    if (done) return;
    const land = state.hit ? true : t >= T;
    if (!land) {
      const f = t / T;
      const x = A[0] + ux * len * f, z = A[2] + uz * len * f;
      const y = Math.max(0.2, A[1] + vy * t - 0.5 * S.gravity * t * t);
      o.position.set(x, y, z);
      o.rotation.set(t * 9, t * 6, t * 3);
      m.userData.fade.value = 1;
      if (t >= trailAt) {
        trailAt = t + S.trail;
        dust(vfx, P, { x, y, z, n: 3, radius: 0.15, speed: 0.4, up: 0.2, life: 0.5, size: 0.28, rng });
      }
      return;
    }
    done = true;
    o.visible = false;
    const X = state.hit ? state.hit.x : A[0] + ux * len;
    const Z = state.hit ? state.hit.z : A[2] + uz * len;
    /* Прилёт массы: волна, пыль, обломки, трещины, скол, отдача камеры. */
    kit.shockwave(vfx, { x: X, z: Z, radius: S.hitRadius * 2.2, r0: 0.25, life: 0.45, colour: P[1], intensity: 1.2, dust: true });
    dust(vfx, P, { x: X, z: Z, n: 40, radius: S.hitRadius, speed: 3.4, up: 2.4, rng });
    chips(vfx, P, { x: X, z: Z, n: 22, radius: 0.4, speed: 8, up: 7, rng });
    cracks(vfx, P, { x: X, z: Z, n: 7, len: S.hitRadius * 1.3, rng, life: 2.4 });
    kit.decal(vfx, { type: 'crater', x: X, z: Z, radius: S.hitRadius, hold: S.decalHold, fade: 4, rise: 0.06, tint: P[2], seed: (seed % 9) + 1 });
    vfx.screen.shake(arc ? 0.3 : 0.25);
    vfx.flights.delete(`${e.who}:${e.skill}`);
  });
  /* Отдача у ствола: пыль назад и вбок. */
  dust(vfx, P, { x: A[0], y: A[1], z: A[2], n: 14, radius: 0.3, speed: 2.4, up: 0.8, life: 0.7, rng, dir: e.h + Math.PI, half: 0.8 });
  return true;
}

export function bolt(vfx, e, P, ctx) { return slug(vfx, e, P, ctx, false); }
export function lob(vfx, e, P, ctx) { return slug(vfx, e, P, ctx, true); }

export function impact(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = kit.tune(e, { radius: 1.0, dustN: 30, chipN: 16, crackN: 6, decalHold: 9 });
  /* Тело — БЛИЖАЙШЕЕ к точке удара: `who` записи это кастер, а удар
     SELF-атомов приходит к нему самому (`pushImpact` в deliver.js). */
  const cand = ['blue', 'orange'].map((id) => {
    const b = ctx && ctx.bodyShape ? ctx.bodyShape(id) : null;
    return b ? { id, ...b } : null;
  }).filter(Boolean).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
  const bs = cand[0] && Math.hypot(cand[0].x - e.x, cand[0].z - e.z) <= 2 ? cand[0] : null;
  const cx = bs ? bs.x : e.x, cz = bs ? bs.z : e.z;
  if (e.blocked) {
    dust(vfx, P, { x: e.x, y: 1.0, z: e.z, n: 12, radius: 0.3, speed: 1.8, up: 1.2, life: 0.7, rng });
    chips(vfx, P, { x: e.x, y: 1.0, z: e.z, n: 8, radius: 0.2, speed: 5, up: 4, rng });
    return true;
  }
  kit.shockwave(vfx, { x: cx, z: cz, radius: S.radius * 2, r0: 0.2, life: 0.4, colour: P[1], intensity: 1.1, dust: true });
  dust(vfx, P, { x: cx, z: cz, n: S.dustN, radius: S.radius, speed: 3, up: 2.2, rng });
  chips(vfx, P, { x: cx, z: cz, n: S.chipN, radius: 0.35, speed: 7, up: 6, rng });
  cracks(vfx, P, { x: cx, z: cz, n: S.crackN, len: S.radius, rng, life: 2.0 });
  kit.decal(vfx, { type: 'crater', x: cx, z: cz, radius: S.radius * 0.9, hold: S.decalHold, fade: 4, rise: 0.06, tint: P[2], seed: (seed % 9) + 1 });
  vfx.screen.shake(0.22);
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
  const S = kit.tune(e, { period: 0.5, dustN: 7, chipN: 2 });
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(who) : null) || { x: e.x ?? 0, z: e.z ?? 0 };
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(who) : null;
  const R = bs ? bs.r : 0.6;
  /* ИЗМОТАННОЕ ТЕЛО: с него сыплется пыль и мелкая крошка, пока держится
     эффект. Ни свечения, ни ауры — кинетика не светит даже на статусе. */
  const MAX = 60;
  let next = -1;
  vfx.spawnMesh(new THREE.Group(), MAX, (o, u) => {
    const t = u * MAX;
    if (vfx.now > entry.until) { if (STATUS.get(key) === entry) STATUS.delete(key); return; }
    if (t < next) return;
    next = t + S.period;
    const p = at();
    dust(vfx, P, { x: p.x, y: 0.9, z: p.z, n: S.dustN, radius: R, speed: 0.5, up: 0.3, life: 0.9, size: 0.3, rng });
    chips(vfx, P, { x: p.x, y: 1.0, z: p.z, n: S.chipN, radius: R * 0.7, speed: 1.4, up: 1.2, life: 0.9, size: 0.12, rng });
  });
  return true;
}

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const secs = Math.max(0.15, e.windup || 0.4);
  const S = kit.tune(e, { period: 0.12, radius: 1.8 });
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  /* Замах кинетики — УПОР: пыль стягивается под ноги, боец вжимается в пол. */
  let next = -1;
  vfx.spawnMesh(new THREE.Group(), secs, (o, u) => {
    const t = u * secs;
    if (t < next) return;
    next = t + S.period;
    const p = at();
    const rr = S.radius * (1 - u * 0.6);
    vfx.body.emit(6, (i, s) => {
      const a = rng() * TAU;
      s.pos(p.x + Math.sin(a) * rr, 0.1 + rng() * 0.5, p.z + Math.cos(a) * rr);
      s.vel(-Math.sin(a) * rr * 1.6, 0.15, -Math.cos(a) * rr * 1.6);
      s.gravity(0, -1.2, 0);
      s.color(P[1], P[2]);
      s.life(vfx.now, 0.5, rnd(0.3, 0.6, rng), kit.SHAPE.smoke);
      s.ext(0, 0.4, 0, 0);
    });
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
    rise: 0.18,          /* СЕКУНДЫ подъёма, а не доля жизни */
    fall: 0.35,
    slabs: null,
  });
  const D = S.duration, W = S.w, H = S.height;
  /* ПЛИТЫ, ВЫДАВЛЕННЫЕ ИЗ ПОЛА: стена кинетики — вещество, поднятое силой,
     и она поднимается за фиксированное ВРЕМЯ, а не за долю своей жизни
     (прежний `u * 12` растягивал подъём вместе с длительностью). */
  const n = S.slabs ?? clampN(Math.round(W * 1.3), 3, 8);
  const g = new THREE.Group();
  const set = [];
  for (let i = 0; i < n; i++) {
    const fx = ((i + 0.5) / n - 0.5) * W * 0.96;
    const r = rod(P, [e.x + fx, 0, e.z], [e.x + fx, H, e.z], 1);
    r.mesh.scale.set(H, (W / n) * 0.92, S.d * 0.9);
    r.mesh.rotation.z = Math.PI / 2;
    g.add(r.mesh);
    set.push(r);
  }
  vfx.spawnMesh(g, D, (o, u) => {
    const t = u * D;
    const up = Math.min(1, t / Math.max(0.001, S.rise));
    const k = t > D - S.fall ? Math.max(0, (D - t) / S.fall) : 1;
    for (let i = 0; i < set.length; i++) {
      const r = set[i];
      r.mesh.scale.set(H * up, (W / n) * 0.92, S.d * 0.9);
      r.mesh.position.y = 0;
      r.set(k);
    }
  });
  dust(vfx, P, { x: e.x, z: e.z, n: 34, radius: W * 0.5, speed: 1.8, up: 2.2, rng });
  kit.decal(vfx, { type: 'crater', x: e.x, z: e.z, radius: Math.max(W, S.d) * 0.55, hold: D + 6, fade: 4, rise: 0.12, tint: P[2], seed: (seed % 9) + 1 });
  vfx.screen.shake(0.2);
  return true;
}
