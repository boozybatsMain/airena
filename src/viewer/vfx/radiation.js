/**
 * РАДИАЦИЯ (`radiation`) — ЗАРАЖЕНИЕ (план §6.5).
 *
 * Что это такое. Свечение, которого быть не должно: опасно-жёлтое,
 * пульсирующее около 1.5 Гц на телах и стенах, дрожь воздуха (слабое
 * искажение) и ТРЕСК СЧЁТЧИКА — крошечные крупинки, вспыхивающие наугад в
 * заражённом объёме, гуще там, где сильнее. На белом полу треск — ТЁМНО-
 * ОЛИВКОВЫЕ крупинки (цвет пола, P3), на телах — яркие. Заражённый пол
 * продолжает светиться, когда всё остальное погасло. Ни жидкости, ни дуг,
 * ни пламени.
 *
 * КРУПИНКА — ГЛАВНАЯ ПРИМЕТА СТИХИИ, и она излучается ДВАЖДЫ, как шипы
 * молнии: светлая `P[0]` в пул свечения (видна на телах и стенах) и крупная
 * тёмная `P[2]` в пул тел (видна на белом полу). Жизнь 0.08–0.16 с, скорость
 * ноль, рождение размазано по окну: это не искры, а щелчки счётчика.
 *
 * Формы: зона (выпадение), навес (канистра), конус (импульс) — плюс удар,
 * статус, заряд и стена (§P6). Луч — ВТОРАЯ ОЧЕРЕДЬ (§6.5): его нет ни в
 * `forms` реестра, ни здесь, пока остальные пять не приняты.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { TIME, clamp01, col, markGlow, markDistort, mulberry, pooled, seedOf, shared, withFade } from './core.js';
import * as kit from './kit.js';
import { EFFECTS } from '../../skills/registry.js';

const {
  float, vec3, uniform, mix, smoothstep, oneMinus, abs: tabs,
  normalView, normalLocal, positionViewDirection, mx_noise_float, sin: tsin,
} = TSL;

const TAU = Math.PI * 2;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const hex = (P) => P.map((c) => c.getHexString()).join();

/* ── крупинки счётчика ──────────────────────────────────────────────────── */

/**
 * `flecks` — `n` вспышек за окно `window` секунд в объёме (диск радиуса `r`,
 * высота `hi`) или на поверхности капсулы, если задан `surf`.
 */
function flecks(vfx, P, { x, z, r, hi = 1.5, n, window = 1, rng, at = 0, surf = null }) {
  const put = (pool, colour, count, s0, s1) => pool.emit(count, (i, s) => {
    let px, py, pz;
    if (surf) {
      const a = rng() * TAU, e2 = Math.asin(rng() * 2 - 1);
      px = surf.x + Math.cos(e2) * Math.sin(a) * surf.r;
      py = surf.y + Math.sin(e2) * surf.ry;
      pz = surf.z + Math.cos(e2) * Math.cos(a) * surf.r;
    } else {
      const a = rng() * TAU, d = Math.sqrt(rng()) * r;
      px = x + Math.sin(a) * d; py = 0.06 + rng() * hi; pz = z + Math.cos(a) * d;
    }
    s.pos(px, Math.max(0.05, py), pz);
    s.vel(0, 0, 0);
    s.gravity(0, 0, 0);
    s.color(colour, colour);
    /* Рождение РАЗМАЗАНО по окну — щелчки идут вразнобой, а не залпом. */
    /* 0.10–0.20 с вместо 0.08–0.16: при средних 0.12 с и окне 0.25 с в
       кадре жило лишь ~48 % выпущенных крупинок, и треска не было видно
       из-под заливки следа. */
    s.life(vfx.now + at + rng() * window, 0.10 + rng() * 0.10, s0 + rng() * (s1 - s0), kit.SHAPE.dot);
    s.ext(0, 0, 0, 0);
  });
  /* Светлая крупинка 0.05 м (тела, стены), тёмная 0.07–0.10 м (белый пол).
     При 0.09–0.13 тёмная читалась жёлтым квадратиком, а не щелчком счётчика
     (замер i1 с бокового глаза: пятно выходило сплошной жёлтой заливкой). */
  put(vfx.glow, P[0], n, 0.05, 0.05);
  put(vfx.body, P[2], n, 0.07, 0.10);
}

/* ── светящийся купол ───────────────────────────────────────────────────── */

/**
 * `domeMat` — нормально смешанная сфера: рубашка `P[2]·0.8` при 0.8 по краю
 * (она держит форму на белом полу), под ней аддитивный ободок `P[1]` при 0.6
 * с bloom 0.4 ТОЛЬКО по краю, нутро `P[1]` при `0.08 + 0.06·sin(TIME·9.4)` —
 * это и есть пульс около 1.5 Гц; `markDistort` шумом при 0.25 — дрожь.
 * ВАЖНО: пульс живёт в АЛЬФЕ И ЦВЕТЕ, а не в bloom: светящийся пол дал бы
 * вуаль во весь кадр (§10.1).
 */
function domeMat(P) {
  return pooled(`rad:dome:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    m.userData.u = { fade };
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    const rim = smoothstep(float(0.4), float(1.0), fres);
    const pulse = tsin(TIME.mul(9.4)).mul(0.5).add(0.5);
    const inner = float(0.08).add(pulse.mul(0.06));
    m.colorNode = mix(mix(col(P[1]), col(P[2]).mul(0.8), rim.mul(0.7)), col(P[1]).mul(1.6), rim.mul(pulse.mul(0.4).add(0.3)));
    /* Кромка 0.45, не 0.8: над зоной купол читался ЩИТОМ, а не дрожью
       воздуха (замер 03.09 по статусу и зоне). Заражение держит на полу
       сыпь и треск, а купол только подкрашивает объём. */
    const alpha = mix(inner, float(0.45), rim).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    /* Дрожь: шумовое смещение, сильное только там, где купол плотный. */
    const n = mx_noise_float(normalLocal.mul(3.0).add(vec3(TIME.mul(1.4), 0, 0)));
    markDistort(m, normalView.xy.mul(n).mul(0.25), rim.mul(0.25).mul(fade));
    return markGlow(m, rim.mul(pulse.mul(0.2).add(0.2)).mul(fade).clamp(0, 0.4));
  }, 4);
}

let DOME_GEO = null;
function dome(P, r) {
  if (!DOME_GEO) DOME_GEO = shared(new THREE.IcosahedronGeometry(1, 4));
  const m = domeMat(P);
  const mesh = new THREE.Mesh(DOME_GEO, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.scale.setScalar(r);
  return { mesh, set(fade) { m.userData.fade.value = fade; } };
}

function fume(vfx, P, { x, z, r, n, life = 2, rng, at = null }) {
  kit.smoke(vfx, { x, y: 0.5, z, n, radius: r, dark: P[2], lit: P[1], rise: 0.8, life, size: 0.5, at, spread: 1.0, r: rng });
}

/* ── формы ──────────────────────────────────────────────────────────────── */

export function zone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const r = fp.radius;
  const D = Math.max(0.8, e.duration || 3);

  /* След ЖИВЁТ ДОЛЬШЕ ВСЕГО и продолжает светиться (P9). */
  kit.decal(vfx, { type: 'rad', x: e.x, z: e.z, radius: r * 1.1, hold: 20, tint: P[1], seed: (seed % 9) + 1 });

  const d = dome(P, r * 0.9);
  d.mesh.position.set(e.x, 0.05, e.z);
  d.mesh.scale.set(r * 0.9, 1.4, r * 0.9);
  const nFleck = clampN(kit.countFor(400, fp.area, kit.REF_AREA.zone, 900), 120, 900);
  let next = 0, lightAt = -1, fumeAt = -1;
  vfx.spawnMesh(d.mesh, D + 0.4, (o, u) => {
    const t = u * (D + 0.4);
    const k = t < 0.3 ? t / 0.3 : (t > D ? Math.max(0, (D + 0.4 - t) / 0.4) : 1);
    d.set(k);
    o.scale.set(r * 0.9, 1.4 * k, r * 0.9);
    if (t >= next && t < D + 1) {
      next = t + 0.25;
      /* Плотность на пике — `nFleck` в секунду: четверть за четверть. */
      flecks(vfx, P, { x: e.x, z: e.z, r, hi: 1.5, n: Math.max(4, Math.round(nFleck * 0.25)), window: 0.25, rng });
    }
    if (t >= fumeAt + 0.34 && t < D) { fumeAt = t; fume(vfx, P, { x: e.x, z: e.z, r: r * 0.8, n: 3, life: 2, rng }); }
    if (t - lightAt > 0.3 && t < D) { vfx.flashLight(e.x, 1.0, e.z, P[1], 10, 0.4, r + 2); lightAt = t; }
  });
  return true;
}

export function cone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const { range, half } = fp;
  const dir = fp.dir;
  const ux = Math.sin(dir), uz = Math.cos(dir);

  /* ИМПУЛЬС: секторный фронт волны проходит `range` за 0.25 с. */
  kit.shockwave(vfx, {
    x: e.x, z: e.z, radius: range, r0: 0.4, life: 0.25, colour: P[1], intensity: 1.2,
    dir, half, dust: true,
  });
  kit.decal(vfx, { type: 'rad', x: e.x + ux * range * 0.6, z: e.z + uz * range * 0.6, radius: range * 0.4, hold: 20, tint: P[1], seed: (seed % 9) + 1 });

  /* Крупинки рождаются ВДОЛЬ ФРОНТА: их доля по пути = доля времени. */
  const n = clampN(kit.countFor(260, fp.area, kit.REF_AREA.cone, 600), 80, 600);
  for (let i = 0; i < 6; i++) {
    const f = (i + 0.5) / 6;
    const rr = range * f;
    vfx.glow.emit(Math.round(n / 12), (j, s) => {
      const a = dir + (rng() * 2 - 1) * half;
      s.pos(e.x + Math.sin(a) * rr * (0.9 + rng() * 0.2), 0.1 + rng() * 1.4, e.z + Math.cos(a) * rr * (0.9 + rng() * 0.2));
      s.vel(0, 0, 0); s.gravity(0, 0, 0);
      s.color(P[0], P[0]);
      s.life(vfx.now + f * 0.25 + rng() * 0.06, 0.1, 0.05, kit.SHAPE.dot);
      s.ext(0, 0, 0, 0);
    });
    vfx.body.emit(Math.round(n / 12), (j, s) => {
      const a = dir + (rng() * 2 - 1) * half;
      s.pos(e.x + Math.sin(a) * rr * (0.9 + rng() * 0.2), 0.08 + rng() * 0.3, e.z + Math.cos(a) * rr * (0.9 + rng() * 0.2));
      s.vel(0, 0, 0); s.gravity(0, 0, 0);
      s.color(P[2], P[2]);
      s.life(vfx.now + f * 0.25 + rng() * 0.06, 0.12, 0.1 + rng() * 0.03, kit.SHAPE.dot);
      s.ext(0, 0, 0, 0);
    });
  }
  /* Дрожь над сектором — купол, растянутый по конусу и почти прозрачный. */
  const d = dome(P, range * 0.5);
  d.mesh.position.set(e.x + ux * range * 0.5, 0.05, e.z + uz * range * 0.5);
  d.mesh.scale.set(range * 0.55, 1.2, range * 0.55);
  vfx.spawnMesh(d.mesh, 0.7, (o, u) => d.set(0.5 * (1 - u)));
  vfx.flashLight(e.x + ux * range * 0.4, 1.0, e.z + uz * range * 0.4, P[1], 12, 0.35, range + 2);
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
  const E = [S[0] + ux * len, 0.3, S[2] + uz * len];
  const apex = 0.35 * len;

  /* КАНИСТРА — брошенный предмет (P1 к ней не применяется): капсула `P[2]`
     с полосой `P[1]`, кувыркающаяся по параболе и сыплющая крупинками. */
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    shared(new THREE.CapsuleGeometry(0.16, 0.46, 6, 12)),
    new THREE.MeshBasicMaterial({ color: P[2], transparent: true, opacity: 0.98, depthWrite: false }),
  );
  const band = new THREE.Mesh(
    shared(new THREE.CylinderGeometry(0.175, 0.175, 0.14, 14)),
    new THREE.MeshBasicMaterial({ color: P[1], transparent: true, opacity: 1, depthWrite: false }),
  );
  g.add(body, band);
  g.renderOrder = 9;
  let landed = false, trailAt = 0;
  vfx.spawnMesh(g, travel + 0.1, (o, u) => {
    const t = u * (travel + 0.1);
    const k = Math.min(1, t / travel);
    const x = S[0] + (E[0] - S[0]) * k;
    const z = S[2] + (E[2] - S[2]) * k;
    const y = Math.max(0.3, S[1] + (E[1] - S[1]) * k + 4 * apex * k * (1 - k));
    o.position.set(x, y, z);
    o.rotation.set(t * 7, t * 4, t * 2);
    if (t >= trailAt && k < 1) {
      /* Крупинки сыплются вчетверо чаще и ВЫШЕ над полом — иначе канистра
         на 26 м читалась плоским жёлтым кружком без следа в воздухе. */
      trailAt = t + 0.05;
      vfx.glow.emit(6, (i, s2) => {
        s2.pos(x + (rng() - 0.5) * 0.4, y + (rng() - 0.5) * 0.4, z + (rng() - 0.5) * 0.4);
        s2.vel(0, 0, 0); s2.gravity(0, -1.5, 0);
        s2.color(P[0], P[1]);
        s2.life(vfx.now, 0.22, 0.055, kit.SHAPE.dot);
        s2.ext(0, 0, 0, 0);
      });
      vfx.body.emit(6, (i, s2) => {
        s2.pos(x + (rng() - 0.5) * 0.4, y + (rng() - 0.5) * 0.4, z + (rng() - 0.5) * 0.4);
        s2.vel(0, 0, 0); s2.gravity(0, -1.5, 0);
        s2.color(P[2], P[2]);
        s2.life(vfx.now, 0.24, 0.085, kit.SHAPE.dot);
        s2.ext(0, 0, 0, 0);
      });
    }
    if (k >= 1 && !landed) {
      landed = true;
      o.visible = false;
      kit.burst(vfx, { x: E[0], y: 0.6, z: E[2], radius: 0.6, endRadius: 2.0, life: 0.45, mode: 'air', colours: [P[0], P[1], P[2]], intensity: 1.2 });
      zone(vfx, { ...e, x: E[0], z: E[2], r: 1.8, duration: 1.6, kind: 'zone' }, P, ctx);
      vfx.screen.shake(0.15);
    }
  });
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
  /* Вспышка ДОЛЬШЕ (0.6 с против 0.35) и налёт НА ТЕЛЕ — 1.2 с крупинок по
     капсуле. Замер круга 2: кадр на 0.5 с заставал уже пустое место, и
     судья не нашёл на жертве «ни вспышки, ни налёта — только редкие
     крупинки у ног, неотличимые от остатка». */
  kit.burst(vfx, { x: cx, y: 1.0, z: cz, radius: 0.4, endRadius: 1.5, life: 0.6, mode: 'air', colours: [P[0], P[1], P[2]], intensity: 1.2 });
  flecks(vfx, P, { x: cx, z: cz, r: 1.2, hi: 1.6, n: 30, window: 0.3, rng });
  vfx.flashLight(cx, 1.0, cz, P[1], 14, 0.4, 6);
  if (bs) {
    const R = bs.r * 1.06, H = bs.h * 0.55;
    let next = -1;
    vfx.spawnMesh(new THREE.Group(), 1.2, (o, u) => {
      const t = u * 1.2;
      if (t < next) return;
      next = t + 0.15;
      flecks(vfx, P, { x: bs.x, z: bs.z, r: R, n: 10, window: 0.15, rng, surf: { x: bs.x, y: H, z: bs.z, r: R, ry: H } });
    });
  }
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
  const R = (bs ? bs.r : 0.9) * 1.06, H = (bs ? bs.h : 2.0) * 0.55;
  /*
   * У БОЛЕЗНИ КУПОЛА НЕТ — тот же урок, что дала гравитация. Судья: «статус
   * оборачивает бойца полупрозрачным куполом, и это язык ЩИТА, а не
   * заражения — путаница в роде». Сферу вокруг тела зритель читает как
   * защиту, чем бы она ни была покрашена. Болезнь держат крупинки НА САМОЙ
   * КАПСУЛЕ (втрое чаще, чем в куполе: 30 в секунду) и редкий пар: тело
   * само трещит счётчиком.
   */
  const MAX = 60;
  let fleckAt = -1, fumeAt = -1;
  const bright = e.effect === 'blind' ? 1.6 : 1;
  vfx.spawnMesh(new THREE.Group(), MAX, (o, u) => {
    const t = u * MAX;
    if (vfx.now > entry.until) { if (STATUS.get(key) === entry) STATUS.delete(key); return; }
    const p = at();
    if (t >= fleckAt + 0.25) {
      fleckAt = t;
      flecks(vfx, P, { x: p.x, z: p.z, r: R, n: Math.round(8 * bright), window: 0.25, rng, surf: { x: p.x, y: H, z: p.z, r: R, ry: H } });
    }
    if (t >= fumeAt + 0.6) { fumeAt = t; fume(vfx, P, { x: p.x, z: p.z, r: R, n: 2, life: 1.6, rng }); }
  });
  return true;
}

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const secs = Math.max(0.15, e.windup || 0.4);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const dir = e.h ?? 0;
  const d = dome(P, 0.1);
  const p0 = at();
  d.mesh.position.set(p0.x + Math.sin(dir) * 0.7, 1.1, p0.z + Math.cos(dir) * 0.7);
  let next = 0, lightAt = -1;
  vfx.spawnMesh(d.mesh, secs, (o, u) => {
    const t = u * secs;
    const p = at();
    const hx = p.x + Math.sin(dir) * 0.7, hz = p.z + Math.cos(dir) * 0.7;
    o.position.set(hx, 1.1, hz);
    /* Купол в руке растёт 0.1 → 0.4 м, крупинки СХОДЯТСЯ к ней. */
    /* Купол в руке 0.16 → 0.55 м при полной непрозрачности и крупинки,
       СХОДЯЩИЕСЯ к ней: замах должен ТЕЛЕГРАФИРОВАТЬ каст, а при 0.1 → 0.4 м
       и альфе 0.6 судья нашёл лишь «слабый оттенок в тени ноги». */
    const r = 0.16 + 0.39 * u;
    o.scale.setScalar(r);
    d.set(1);
    if (t >= next) {
      next = t + 0.08;
      flecks(vfx, P, { x: hx, z: hz, r: 2.0 * (1 - u * 0.65), hi: 1.8, n: 12, window: 0.08, rng });
    }
    if (t - lightAt > 0.3) { vfx.flashLight(hx, 1.1, hz, P[1], 6 + 6 * u, 0.4, 5); lightAt = t; }
  });
  return true;
}
