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
 * СТВОЛ — КРЕСТ ИЗ ДВУХ КВАДОВ, а не лента, развёрнутая к камере. Крест даёт
 * одинаковую толщину с любого глаза без вершинной математики и, главное, не
 * схлопывается в нить, когда камера смотрит вдоль ствола, — а
 * трансляционный глаз смотрит почти вдоль каста (26 м вдоль линии выстрела).
 *
 * ПОЧЕМУ ЖИЛА УЗКАЯ, А РУБАШКА ШИРОКАЯ. Урок, дважды купленный в этом
 * проекте — на пучке молнии и на лентах Nova: на белом полу полупрозрачное
 * светлое выцветает в серое, поэтому пиксель обязан быть либо HDR-белым,
 * либо насыщенно-багровым, но не бледно-розовым. Жила — треть полуширины и
 * только она уходит в bloom; рубашка — остальное, обычным блендингом.
 *
 * НАСТРОЙКА. Все размеры и времена идут через `kit.tune(e, {...})`: опись
 * в начале каждой формы — это и есть список того, что можно крутить, а
 * значения по умолчанию равны сегодняшним числам, так что запись без полей
 * даёт прежний кадр.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { clamp01, col, markGlow, mulberry, pooled, seedOf, shared, withFade } from './core.js';
import * as kit from './kit.js';
import { EFFECTS } from '../../skills/registry.js';

const { float, vec3, uv, uniform, mix, smoothstep, oneMinus, abs: tabs, normalView, positionViewDirection } = TSL;

const TAU = Math.PI * 2;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const hex = (P) => P.map((c) => c.getHexString()).join();
/* Курс мира (sin h, cos h) → поворот по Y, уносящий местную +X в него. */
const yawFor = (ux, uz) => Math.atan2(-uz, ux);

/* ── ствол ──────────────────────────────────────────────────────────────── */

/**
 * Материал ствола. Поперёк (`uv().y`, середина 0.5): жила до 0.32 полуширины
 * — HDR-белое с красным подмесом, дальше рубашка `P[1]`→`P[2]` до края.
 * Вдоль (`uv().x`): срез у самого фронта по униформе `head`, чтобы луч
 * ВЫРАСТАЛ из руки, а не появлялся целиком.
 */
function beamMat(P) {
  return pooled(`laser:beam:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    const head = uniform(1);
    m.userData.u = { fade, head };
    const d = tabs(uv().y.sub(0.5)).mul(2);
    const along = uv().x;
    /*
     * ЖИЛА УЗКАЯ, РУБАШКА ШИРОКАЯ — и это уже вторая попытка. Сначала жила
     * была 0.32 полуширины и с 26 м не читалась вовсе; её расширили до 0.46,
     * и луч стал БЕЛЫМ: замер судьи по столбу луча с трансляции — 58 %
     * пикселей с насыщенностью ниже 0.15, то есть попросту белых, и лишь 8 %
     * выше 0.45. «Красный лазер», у которого две трети ствола белые, красным
     * не читается. Теперь жила 0.26 (тонкая нить накала), рубашка занимает
     * всё остальное, и её багровое начинается сразу за жилой.
     */
    const core = oneMinus(smoothstep(float(0.08), float(0.26), d));
    const jacket = oneMinus(smoothstep(float(0.28), float(1.0), d));
    /* Фронт резкий (4 % длины), корень мягкий: у руки луч рождается из
       вспышки, у цели он обрублен — так читается выстрел, а не полоса. */
    const grown = oneMinus(smoothstep(head.sub(0.04), head, along));
    const ends = smoothstep(float(0.0), float(0.02), along).mul(grown);
    /* Рубашка держит НАСЫЩЕННЫЙ `P[1]` почти до края и только у самой кромки
       уходит в глубокий `P[2]`: спад по ^0.55 вместо ^1.6 — иначе середина
       ствола, где рубашка ещё широкая, уже выцветала к тёмному. */
    m.colorNode = mix(mix(col(P[2]), col(P[1]), jacket.pow(0.55)), vec3(3.0, 1.15, 1.05), core);
    const alpha = jacket.mul(0.94).max(core).mul(ends).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, core.mul(ends).mul(fade).mul(0.5));
  }, 4);
}

/**
 * `coreMat` — точка накала: HDR-белое ядро в багровой оболочке по френелю.
 * Отдельный материал, а не ствол, натянутый на шар (см. `charge`).
 */
function coreMat(P) {
  return pooled(`laser:core:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    m.userData.u = { fade };
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    const shell = fres.pow(1.7);
    m.colorNode = mix(vec3(3.0, 1.15, 1.05), mix(col(P[1]), col(P[2]), shell), shell.clamp(0, 1));
    m.opacityNode = float(0.97).mul(fade).clamp(0, 1);
    return markGlow(m, oneMinus(shell).mul(fade).mul(0.6));
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
function barrel(P, a, b, width) {
  const m = beamMat(P);
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
    group: g, len,
    set(fade, head = 1) { m.userData.fade.value = fade; m.userData.u.head.value = head; },
  };
}

/** Вспышка у руки: сноп искр вперёд плюс короткий свет. */
function muzzle(vfx, P, { x, y, z, dir, rng, size = 1 }) {
  kit.sparks(vfx, {
    x, y, z, n: Math.round(14 * size), colour: P[0], tail: P[1], speed: 12, life: 0.22,
    cone: { dir, half: 0.4 }, gravity: -6, size: 0.11, r: rng,
  });
  kit.burst(vfx, {
    x, y, z, radius: 0.16 * size, endRadius: 0.42 * size, life: 0.16, mode: 'air',
    colours: [P[0], P[1], P[2]], intensity: 1.1, flash: false,
  });
  vfx.flashLight(x, y, z, P[1], 12, 0.18, 6);
}

/** Попадание: точка света, кольцо на полу, ожог и брызги искр. */
function hitAt(vfx, P, e, rng, S, { x, y, z, radius, hold, rise }) {
  kit.burst(vfx, {
    x, y, z, radius: radius * 0.35, endRadius: radius, life: 0.3, mode: 'air',
    colours: [P[0], P[1], P[2]], intensity: 1.3,
  });
  kit.sparks(vfx, { x, y, z, n: 22, colour: P[0], tail: P[2], speed: 9, life: 0.4, gravity: -9, size: 0.1, r: rng });
  kit.shockwave(vfx, { x, z, radius: radius * 1.6, r0: 0.2, life: 0.35, colour: P[1], intensity: 0.9, dust: false });
  kit.decal(vfx, { type: 'laser', x, z, radius: radius * 0.8, hold, fade: 4, rise, tint: P[2], seed: (seedOf(e) % 9) + 1 });
  vfx.flashLight(x, y, z, P[1], 18, 0.3, 7);
}

/* ── луч ────────────────────────────────────────────────────────────────── */

export function beam(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения — сегодняшние; запись, не несущая поля,
     даёт прежний кадр (см. `kit.tune`). */
  const S = kit.tune(e, {
    width: 0.22,        /* полная толщина ствола, м */
    y: 1.15,            /* высота ствола над полом, м */
    grow: 0.05,         /* за сколько секунд луч дорастает до цели */
    duration: 0.28,     /* сколько держится на полной силе */
    decay: 0.16,        /* за сколько гаснет */
    hitRadius: 0.9,     /* радиус вспышки и кольца у цели, м */
    decalHold: 14,      /* стойкость ожога, с */
    decalRise: 0.12,    /* за сколько ожог проявляется, с */
    muzzle: 1,          /* размер выброса у руки, доли */
  });
  const A = [e.x0, S.y, e.z0], B = [e.x1, S.y, e.z1];
  const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
  if (len < 0.05) return false;
  const LIFE = S.grow + S.duration + S.decay;

  const bar = barrel(P, A, B, S.width);
  vfx.spawnMesh(bar.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const head = clamp01(t / Math.max(0.001, S.grow));
    const fade = t < S.grow + S.duration ? 1 : Math.max(0, 1 - (t - S.grow - S.duration) / Math.max(0.001, S.decay));
    bar.set(fade, head);
  });
  bar.set(0, 0);

  muzzle(vfx, P, { x: A[0], y: A[1], z: A[2], dir: Math.atan2(B[0] - A[0], B[2] - A[2]), rng, size: S.muzzle });
  if (e.hit !== false) {
    hitAt(vfx, P, e, rng, S, { x: B[0], y: S.y, z: B[2], radius: S.hitRadius, hold: S.decalHold, rise: S.decalRise });
  }
  /* Крошка на полу вдоль трассы: лазер жжёт то, над чем прошёл. */
  const n = clampN(kit.countFor(30, fp.area, kit.REF_AREA.beam, 90), 12, 90);
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
  const S = kit.tune(e, {
    width: 0.20,        /* толщина болта, м */
    boltLen: 1.5,       /* длина светящегося отрезка, м */
    y: 1.15,            /* высота полёта, м */
    speed: e.speed || 22,
    range: e.range || 10,
    hitRadius: 0.8,
    decalHold: 12,
    decalRise: 0.12,
    muzzle: 0.9,
  });
  const ux = Math.sin(e.h), uz = Math.cos(e.h);
  const len = Math.max(1.2, S.range);
  const travel = len / Math.max(4, S.speed);
  const A = [e.x + ux * 0.7, S.y, e.z + uz * 0.7];

  const state = { hit: null };
  vfx.flight(e.who, e.skill, state);

  /* Болт — короткий отрезок того же ствола, который ЛЕТИТ: это снаряд, а не
     разряд, и правило неподвижного начала (P1) к нему не применяется. */
  const bar = barrel(P, A, [A[0] + ux * S.boltLen, S.y, A[2] + uz * S.boltLen], S.width);
  let done = false;
  vfx.spawnMesh(bar.group, travel + 0.4, (o, u) => {
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
    bar.set(1, 1);
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
  muzzle(vfx, P, { x: A[0], y: A[1], z: A[2], dir: e.h, rng, size: S.muzzle });
  return true;
}

/* ── удар, статус, заряд, стена (доходят до всякой стихии, §P6) ─────────── */

export function impact(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = kit.tune(e, { hitRadius: 0.7, decalHold: 12, decalRise: 0.12 });
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
  const S = kit.tune(e, { period: 0.45, dots: 8 });
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(who) : null) || { x: e.x ?? 0, z: e.z ?? 0 };
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(who) : null;
  const R = (bs ? bs.r : 0.9) * 1.05, H = (bs ? bs.h : 2.0);
  /* ПРОЖИГ: точки света вспыхивают на капсуле — тело продолжает гореть там,
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
     * формы, которой у лазера вообще нет (замер судьи). Теперь тёмные
     * `P[2]`-точки идут в пул тел — их видно на любом фоне, — а светлые
     * остаются сверху как накал; плюс дымок от прожжённого места.
     */
    const put = (pool, c1, c2, n, size, glow) => pool.emit(n, (i, s) => {
      const a = rng() * TAU, hh = rng();
      s.pos(p.x + Math.sin(a) * R, 0.2 + hh * H, p.z + Math.cos(a) * R);
      s.vel(0, 0.3 + rng() * 0.3, 0); s.gravity(0, 0.4, 0);
      s.color(c1, c2);
      s.life(vfx.now, 0.5 + rng() * 0.3, size, kit.SHAPE.dot);
      s.ext(0, 0.5, 0, glow);
    });
    put(vfx.body, P[2], P[2], S.dots, 0.1 + rng() * 0.06, 0);
    put(vfx.glow, P[0], P[1], Math.max(2, Math.round(S.dots * 0.6)), 0.07 + rng() * 0.04, 0.7);
    kit.smoke(vfx, {
      x: p.x, y: H * 0.6, z: p.z, n: 2, radius: R, dark: P[2], lit: P[1],
      rise: 1.1, life: 1.0, size: 0.32, spread: 0.5, r: rng,
    });
  });
  return true;
}

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const secs = Math.max(0.15, e.windup || 0.4);
  const S = kit.tune(e, { r0: 0.06, r1: 0.26, reach: 0.7 });
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const dir = e.h ?? 0;
  /* Точка накала в стволе: растёт и наливается, как заряжающийся конденсатор. */
  const p0 = at();
  const g = new THREE.Group();
  /*
   * У НАКАЛА СВОЙ МАТЕРИАЛ, а не одолженный у ствола. Прежде здесь стоял
   * `beamMat`, и это была настоящая поломка на два фронта. Во-первых, его
   * сечение считается по `uv().y` ленты, а натянутое на шар оно давало
   * полосатую бело-красную «жемчужину». Во-вторых и хуже: `pooled` держит
   * кольцо из четырёх материалов, `charge` не писал в них ни `fade`, ни
   * `head`, а `beam` в конце жизни гонит `fade` в ноль — после нескольких
   * кастов накал доставал из кольца погашенный материал и не рисовался
   * вовсе. В бою это выглядело бы как замах, который иногда исчезает.
   */
  const dot = new THREE.Mesh(shared(new THREE.IcosahedronGeometry(1, 3)), coreMat(P));
  dot.frustumCulled = false;
  dot.renderOrder = 10;
  g.add(dot);
  g.position.set(p0.x + Math.sin(dir) * S.reach, 1.1, p0.z + Math.cos(dir) * S.reach);
  let lightAt = -1;
  vfx.spawnMesh(g, secs, (o, u) => {
    const t = u * secs;
    const p = at();
    o.position.set(p.x + Math.sin(dir) * S.reach, 1.1, p.z + Math.cos(dir) * S.reach);
    dot.scale.setScalar(S.r0 + (S.r1 - S.r0) * u);
    dot.material.userData.fade.value = u < 0.9 ? 1 : (1 - u) / 0.1;
    if (t - lightAt > 0.3) { vfx.flashLight(o.position.x, 1.1, o.position.z, P[1], 5 + 8 * u, 0.4, 5); lightAt = t; }
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
    rise: 0.15,
    fall: 0.3,
  });
  const D = S.duration, W = S.w, H = S.height;
  /* РЕШЁТКА ИЗ ЛУЧЕЙ: вертикальные стволы через равные промежутки — забор
     из лазеров, а не стена вещества. Плиту коллизии рисует штатный силуэт. */
  const n = S.bars ?? clampN(Math.round(W * 1.6), 3, 9);
  const g = new THREE.Group();
  const set = [];
  for (let i = 0; i < n; i++) {
    const fx = ((i + 0.5) / n - 0.5) * W * 0.94;
    const b = barrel(P, [e.x + fx, 0.05, e.z], [e.x + fx, 0.05 + H, e.z], 0.09);
    g.add(b.group);
    set.push(b);
  }
  vfx.spawnMesh(g, D, (o, u) => {
    const t = u * D;
    const k = t < S.rise ? t / S.rise : (t > D - S.fall ? Math.max(0, (D - t) / S.fall) : 1);
    for (const b of set) b.set(k, Math.min(1, t / Math.max(0.001, S.rise)));
  });
  kit.decal(vfx, { type: 'laser', x: e.x, z: e.z, radius: Math.max(W, S.d) * 0.5, hold: D, fade: 1.2, rise: 0.3, tint: P[2], seed: (seed % 9) + 1 });
  vfx.flashLight(e.x, H * 0.5, e.z, P[1], 10, 0.4, W + 2);
  return true;
}
