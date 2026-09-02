/**
 * ВРЕМЯ (`time`) — ЗАМЕДЛЕННОЕ И ПРОПУЩЕННОЕ ВРЕМЯ (план §6.3).
 *
 * Что это такое. Сепия, точность, неподвижность. Пузырь, внутри которого
 * всё выглядит фотографией: пылинки ВИСЯТ в воздухе, несколько тонких
 * обручей (часовые кольца) идут с разной скоростью, и один — назад
 * СТУПЕНЯМИ, кромка пузыря — тёмная умбровая рубашка с волоском горячего
 * ядра и преломляющим краем, на полу под ним — бледный циферблат тёмными
 * линиями. Всё ТИКАЕТ: яркость ступенчато прыгает дважды в секунду, а не
 * пульсирует плавно. Ни огня, ни искр, ни вида урона.
 *
 * НА БЕЛОМ ПОЛУ СТИХИЯ — ЭТО ЕЁ ТЁМНЫЕ ЛИНИИ, А НЕ СВЕТЛЫЕ (P3). Палитра
 * сепийная: `P[1]` (#d4b48a) — бледный загар, на белом полу он невидим, и
 * жить там имеет право только `P[2]` (тёмная умбра). Светлое `P[1]` уходит
 * во второй аддитивный слой — он работает на телах и стенах, где фон тёмный.
 *
 * Формы: зона (пузырь медленного времени), себя (ускорение), мигание
 * (пропуск времени) — плюс удар, статус, заряд и стена (§P6). Ни луча, ни
 * снаряда: у времени нечем стрелять, и правило E1 их отвергает.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { TIME, clamp01, col, markGlow, markDistort, mulberry, pooled, seedOf, shared, withFade } from './core.js';
import * as kit from './kit.js';
import { EFFECTS } from '../../skills/registry.js';

const {
  float, vec2, vec3, uniform, mix, smoothstep, oneMinus, uv, abs: tabs,
  normalView, normalLocal, positionViewDirection, positionLocal, step: tstep, fract: tfract,
  sin: tsin, cos: tcos, mx_noise_float,
} = TSL;

const TAU = Math.PI * 2;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const hex = (P) => P.map((c) => c.getHexString()).join();
/* ТИК: ступенька дважды в секунду. Время не пульсирует, оно щёлкает. */
const TICK = () => tstep(tfract(TIME.mul(2.0)), float(0.5));

/* ── пузырь ─────────────────────────────────────────────────────────────── */

/**
 * `bubbleMat` — нормально смешанная сфера: нутро тонировано `P[0]` при
 * альфе 0.06 (обесцвечивает то, что за ним, — «фотография»), кромка —
 * рубашка `P[2]·0.9` при 0.85, растущая к силуэту, поверх неё HDR-волосок
 * `(2.4,2.2,1.8)` на `fres^7`, и `markDistort` по кромке (край линзы). Тик
 * добавляет 0.25 к альфе кромки.
 */
function bubbleMat(P) {
  return pooled(`time:bubble:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      /* ЛИЦЕВАЯ сторона: при `DoubleSide` задняя полусфера складывалась с
         передней, кромка складывалась сама с собой и пузырь выходил ровным
         белесым шаром вместо сепийной кромки (замер i1 с бокового глаза). */
      transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    m.userData.u = { fade };
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    /* Кромка ЗЖЕ и темнее: 0.6→1.0 вместо 0.35→1.0. Волосок ^12, не ^7 —
       при ^7 HDR-белое расползалось по всей кромке и съедало умбру. */
    const rim = smoothstep(float(0.6), float(1.0), fres);
    const hair = fres.pow(12.0);
    const tick = TICK();
    m.colorNode = mix(mix(col(P[0]).mul(0.9), col(P[2]).mul(0.8), rim), vec3(2.4, 2.2, 1.8), hair.mul(0.7).clamp(0, 1));
    const alpha = mix(float(0.05), float(0.92), rim).add(tick.mul(rim).mul(0.25)).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    /* Преломление по кромке: сдвиг наружу по нормали, сильный только у края. */
    markDistort(m, normalView.xy.mul(0.35).mul(fres.pow(2.0)), fres.pow(2.0).mul(fade));
    return markGlow(m, hair.mul(fade).clamp(0, 1));
  }, 4);
}

let BUB_GEO = null;
function bubble(P, radius) {
  if (!BUB_GEO) BUB_GEO = shared(new THREE.IcosahedronGeometry(1, 4));
  const m = bubbleMat(P);
  const mesh = new THREE.Mesh(BUB_GEO, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.scale.setScalar(radius);
  return { mesh, set(fade, r = radius) { m.userData.fade.value = fade; mesh.scale.setScalar(Math.max(0.001, r)); } };
}

/* ── часовые обручи ─────────────────────────────────────────────────────── */

/**
 * `hoopMat` — КОПИЯ `ringMat` из `arc/common.js`, а не импорт: модуль стихии
 * не имеет права зависеть от другой стихии (её файлы правят своими кругами).
 * Отличие только в цвете: жила — HDR-волосок `(2.4,2.2,1.8)`, край — `P[2]`.
 * НЕ `P[1]`: бледный загар на белом полу читается пылью.
 *
 * Полоса задаётся униформой `wid` = метры / радиус, поэтому геометрия обязана
 * покрывать внутренний радиус: `RingGeometry(0.3, 1)`.
 */
function hoopMat(P) {
  return pooled(`time:hoop:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const wid = uniform(0.1);
    m.userData.u = { fade, wid };
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const d = q.length();
    const dd = d.sub(oneMinus(wid.mul(0.5))).abs().div(wid.mul(0.5).max(1e-4));
    const band = oneMinus(smoothstep(float(0.72), float(1.0), dd));
    const core = oneMinus(smoothstep(float(0.0), float(0.2), dd));
    const ang = TSL.atan(q.y, q.x);
    const rag = mx_noise_float(vec3(tcos(ang).mul(3.0), tsin(ang).mul(3.0), 0.5)).mul(0.15).add(0.9);
    m.colorNode = mix(col(P[2]), vec3(2.4, 2.2, 1.8), core);
    const alpha = band.mul(rag).mul(0.95).mul(fade).mul(TICK().mul(0.15).add(0.85)).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, core.mul(alpha).mul(0.4));
  }, 4);
}

let HOOP_GEO = null;
function hoop(P, r, tilt, thick) {
  if (!HOOP_GEO) HOOP_GEO = shared(new THREE.RingGeometry(0.3, 1, 96).rotateX(-Math.PI / 2));
  const m = hoopMat(P);
  const mesh = new THREE.Mesh(HOOP_GEO, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.scale.setScalar(r);
  /* Наклон ПОСЛЕ масштаба: `scale.setScalar` не должен его крутить. */
  mesh.rotation.z = tilt;
  m.userData.u.wid.value = thick / r;
  return { mesh, m, set(fade, rr = r) { m.userData.fade.value = fade; mesh.scale.setScalar(rr); m.userData.u.wid.value = thick / rr; } };
}

/* ── висящие пылинки ────────────────────────────────────────────────────── */

/** Пылинки ВИСЯТ: скорость и тяжесть нулевые, жизнь — вся жизнь пузыря. */
function motes(vfx, P, { x, z, r, hi = 2.2, n, life, rng, at = 0 }) {
  const put = (pool, colour, count, size) => pool.emit(count, (i, s) => {
    const a = rng() * TAU, d = Math.sqrt(rng()) * r;
    s.pos(x + Math.sin(a) * d, 0.2 + rng() * (hi - 0.2), z + Math.cos(a) * d);
    s.vel(0, 0, 0);
    s.gravity(0, 0, 0);
    s.color(colour, colour);
    s.life(vfx.now + at, life, size, kit.SHAPE.dot);
    s.ext(0, 1.0, 0, 0.15);
  });
  put(vfx.body, P[2], n, 0.05);
  put(vfx.glow, P[0], Math.round(n * 0.3), 0.05);
}

/* ── формы ──────────────────────────────────────────────────────────────── */

/** Три обруча с разными скоростями; средний идёт НАЗАД ступенями по 0.15 с. */
function hoops(vfx, P, { x, y, z, r, life, thick, follow = null, fast = false }) {
  const tilts = [Math.PI / 2, 0.61, -1.05];
  const spin = fast ? [3.0, -0.6, 2.2] : [0.5, -0.2, 0.9];
  const out = [];
  for (let i = 0; i < 3; i++) {
    const h = hoop(P, r * (0.86 + i * 0.09), tilts[i], thick);
    h.mesh.position.set(x, y, z);
    vfx.spawnMesh(h.mesh, life, (o, u) => {
      const t = u * life;
      /* Средний обруч тикает ступенями по 0.15 с: он и есть «время идёт
         назад», а не просто вращается медленно. */
      const ang = i === 1 ? Math.floor(t * 6.67) / 6.67 * spin[i] : t * spin[i];
      o.rotation.y = ang;
      h.set(u < 0.12 ? u / 0.12 : (u > 0.88 ? (1 - u) / 0.12 : 1), r * (0.86 + i * 0.09));
      o.rotation.z = tilts[i];
      if (follow) { const p = follow(); if (p) o.position.set(p.x, y, p.z); }
    });
    out.push(h);
  }
  return out;
}

export function zone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const r = fp.radius;
  const D = Math.max(0.8, e.duration || 3);
  const GROW = 0.2, END = 0.15;

  kit.decal(vfx, { type: 'time', x: e.x, z: e.z, radius: r * 1.05, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
  const b = bubble(P, r);
  b.mesh.position.set(e.x, r * 0.75, e.z);
  vfx.spawnMesh(b.mesh, D, (o, u) => {
    const t = u * D;
    /* Рост с перелётом (easeOutBack) — пузырь ВСТАЁТ, а не надувается. */
    const k = t < GROW ? (() => { const p = t / GROW - 1; return 1 + p * p * (2.7 * p + 1.7); })() : 1;
    const end = t > D - END ? clamp01((D - t) / END) : 1;
    b.set(end, r * Math.max(0.01, k) * (0.9 + 0.1 * end));
  });
  hoops(vfx, P, { x: e.x, y: r * 0.7, z: e.z, r: r * 0.6, life: D, thick: r >= 3 ? 0.12 : 0.10 });
  motes(vfx, P, { x: e.x, z: e.z, r: r * 0.95, hi: 2.2, n: clampN(kit.countFor(80, fp.area, kit.REF_AREA.zone, 260), 40, 260), life: D, rng });
  /* Свет держится подпиткой каждые 0.3 с: пул круговой и гасит квадратично. */
  let lightAt = -1;
  vfx.spawnMesh(new THREE.Group(), D, (o, u) => {
    const t = u * D;
    if (t - lightAt > 0.3 && t < D - END) { vfx.flashLight(e.x, r * 0.7, e.z, P[0], 6, 0.4, r + 2); lightAt = t; }
  });
  return true;
}

export function self(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const R = (bs ? bs.r : 0.9) * 1.4, H = (bs ? bs.h : 2.0) * 0.55;
  const p0 = at();
  /* БЕАТ КАСТА: обручи появляются на 0.6 с; держащееся ускорение открывает
     запись `status: boost` (§P10). */
  hoops(vfx, P, { x: p0.x, y: H, z: p0.z, r: R, life: 0.6, thick: 0.1, follow: at, fast: true });
  kit.decal(vfx, { type: 'time', x: p0.x, z: p0.z, radius: R * 1.1, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
  motes(vfx, P, { x: p0.x, z: p0.z, r: R * 1.2, hi: H * 2, n: 30, life: 0.8, rng });
  return true;
}

export function blink(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const R = (bs ? bs.r : 0.9) * 1.3, H = (bs ? bs.h : 2.0) * 0.55;
  const S = [e.x0, H, e.z0], E = [e.x1, H, e.z1];
  /* ПРОПУСК ВРЕМЕНИ: у старта пузырь размером с бойца схлопывается в точку с
     тиком, у конца — разворачивается из точки. */
  for (const [C, dirn] of [[S, -1], [E, 1]]) {
    const b = bubble(P, R);
    b.mesh.position.set(C[0], C[1], C[2]);
    const at = dirn > 0 ? 0.1 : 0;
    vfx.spawnMesh(b.mesh, 0.25 + at, (o, u) => {
      const t = u * (0.25 + at);
      if (t < at) { b.set(0, 0.01); return; }
      const k = (t - at) / 0.2;
      b.set(1, R * (dirn > 0 ? Math.min(1, k) : Math.max(0.01, 1 - k)));
    });
    kit.decal(vfx, { type: 'time', x: C[0], z: C[2], radius: 0.6, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
  }
  /* Восемь пылинок ВИСЯТ по следу и гаснут за 0.6 с — след пропущенного
     времени: не движение, а места, где боец был мгновение назад. */
  const n = 8;
  vfx.body.emit(n, (i, s) => {
    const f = (i + 0.5) / n;
    s.pos(S[0] + (E[0] - S[0]) * f, H + (rng() - 0.5) * 0.6, S[2] + (E[2] - S[2]) * f);
    s.vel(0, 0, 0); s.gravity(0, 0, 0);
    s.color(P[2], P[2]);
    s.life(vfx.now, 0.6, 0.09, kit.SHAPE.dot);
    s.ext(0, 1.0, 0, 0.15);
  });
  hoops(vfx, P, { x: E[0], y: H, z: E[2], r: R, life: 0.4, thick: 0.1 });
  vfx.flashLight(E[0], H, E[2], P[0], 8, 0.25, 6);
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
  const R = (bs ? bs.r : 0.9) * 1.3, H = (bs ? bs.h : 2.0) * 0.55;
  /* СТОП-КАДР: пузырь на четверть секунды, обруч и один яркий тик. */
  const b = bubble(P, R);
  b.mesh.position.set(cx, H, cz);
  vfx.spawnMesh(b.mesh, 0.25, (o, u) => b.set(u < 0.7 ? 1 : (1 - u) / 0.3, R * (0.7 + 0.3 * Math.min(1, u * 4))));
  hoops(vfx, P, { x: cx, y: H, z: cz, r: R * 1.1, life: 0.3, thick: 0.1 });
  /* Двенадцать пылинок ВИСЯТ 0.8 с и падают — время вокруг жертвы стало. */
  vfx.body.emit(12, (i, s) => {
    const a = rng() * TAU, d = Math.sqrt(rng()) * R * 1.3;
    s.pos(cx + Math.sin(a) * d, 0.4 + rng() * H * 1.4, cz + Math.cos(a) * d);
    s.vel(0, 0, 0); s.gravity(0, -1.2, 0);
    s.color(P[2], P[2]);
    s.life(vfx.now, 0.9, 0.08, kit.SHAPE.dot);
    s.ext(0, 1.0, 0, 0.15);
  });
  kit.decal(vfx, { type: 'time', x: cx, z: cz, radius: 0.7, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
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
  const R = (bs ? bs.r : 0.9) * 1.3, H = (bs ? bs.h : 2.0);
  const p0 = at();
  const stopped = e.effect === 'stun';
  /* ОДИН обруч НАД ГОЛОВОЙ, идущий назад ступенями; при оглушении он стоит
     и мигает. Плюс висящие пылинки и рубашка пузыря на 0.35. */
  const h = hoop(P, R, Math.PI / 2, 0.1);
  h.mesh.position.set(p0.x, H * 1.05, p0.z);
  const b = bubble(P, R * 1.1);
  b.mesh.position.set(p0.x, H * 0.55, p0.z);
  const MAX = 60;
  let next = 0;
  const g = new THREE.Group();
  g.add(h.mesh, b.mesh);
  vfx.spawnMesh(g, MAX, (o, u) => {
    const t = u * MAX;
    if (vfx.now > entry.until) {
      g.visible = false;
      if (STATUS.get(key) === entry) STATUS.delete(key);
      return;
    }
    g.visible = true;
    const p = at();
    h.mesh.position.set(p.x, H * 1.05, p.z);
    b.mesh.position.set(p.x, H * 0.55, p.z);
    const blink = stopped ? (Math.floor(t * 4) % 2 ? 0.25 : 1) : 1;
    h.set(blink, R);
    h.mesh.rotation.y = stopped ? 0 : -(Math.floor(t * 4) / 4) * 0.8;
    h.mesh.rotation.z = Math.PI / 2;
    b.set(0.35, R * 1.1);
    if (t >= next) { next = t + 0.6; motes(vfx, P, { x: p.x, z: p.z, r: R * 1.2, hi: H, n: 10, life: 0.8, rng }); }
  });
  return true;
}

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const secs = Math.max(0.15, e.windup || 0.4);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const p0 = at();
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const H = (bs ? bs.h : 2.0) * 0.55;
  /* Обручи СХОДЯТСЯ к кастеру и тикают всё чаще к концу замаха. */
  const hs = hoops(vfx, P, { x: p0.x, y: H, z: p0.z, r: 2.2, life: secs, thick: 0.1, follow: at });
  vfx.spawnMesh(new THREE.Group(), secs, (o, u) => {
    for (let i = 0; i < hs.length; i++) hs[i].set(1, (2.2 - 1.1 * u) * (0.86 + i * 0.09));
  });
  motes(vfx, P, { x: p0.x, z: p0.z, r: 2.0, hi: 2.0, n: 24, life: secs, rng });
  return true;
}
