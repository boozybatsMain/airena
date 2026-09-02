/**
 * Молния · общие кусочки доставок: шар грозы и чехол, перестройщик,
 * ползущие дуги, гроза, искры, выброс у руки, ведомый свет, веер дуг,
 * ОБЛАКО (шар каста у руки и облако удара), горячее ядро, ШИПЫ удара,
 * тонкое кольцо по полу.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { TIME, clamp01, col, easeOutCubic, markGlow, mulberry, pooled, shared, withFade } from '../core.js';
import * as kit from '../kit.js';
import { TAU, clampN, hex, env, onSphere } from './util.js';
import { boltField } from './field.js';

const {
  float, vec2, vec3, uv, uniform, mix, smoothstep, oneMinus, abs: tabs,
  positionLocal, normalLocal, normalView, positionViewDirection, mx_noise_float, mx_fractal_noise_float,
} = TSL;

/* ── шар грозы и чехол ─────────────────────────────────────────────────── */

let ORB_GEO = null;
function orbGeo() {
  if (!ORB_GEO) ORB_GEO = shared(new THREE.IcosahedronGeometry(1, 4));
  return ORB_GEO;
}
let TUBE_GEO = null;
function tubeGeo() {
  if (!TUBE_GEO) TUBE_GEO = shared(new THREE.CylinderGeometry(1, 1, 1, 18, 1, true));
  return TUBE_GEO;
}
let RING_GEO = null;
function ringGeo() {
  if (!RING_GEO) {
    RING_GEO = shared(new THREE.RingGeometry(0.86, 1, 96, 1));
    RING_GEO.rotateX(-Math.PI / 2);
  }
  return RING_GEO;
}

/**
 * Шар грозы: плазма ползёт по сфере (прожилки по фрактальному шуму, как у
 * ледяного купола, только быстрее), френелевый обод. Два режима: `shell` —
 * аддитивная оболочка, `solid` — обычный блендинг, чтобы шар читался на белом
 * полу; у `solid` униформа `fill` выбирает между полным телом (шаровая
 * молния) и только ободом (гало вокруг тела, тело видно сквозь).
 */
function orbMat(mode, P) {
  return pooled(`arc:orb:${mode}:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide,
      blending: mode === 'shell' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const fade = withFade(m);
    const seed = uniform(0), fill = uniform(1);
    m.userData.u = { fade, seed, fill };
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    const n = mx_fractal_noise_float(normalLocal.mul(2.6).add(vec3(seed, TIME.mul(1.9), TIME.mul(-1.3))), 3, 2.0, 0.5, 1);
    const veins = oneMinus(smoothstep(float(0.0), float(0.09), tabs(n)));
    const plasma = mx_noise_float(normalLocal.mul(4.0).add(vec3(TIME.mul(3.0), seed, 0))).mul(0.5).add(0.5);
    if (mode === 'shell') {
      const centre = oneMinus(fres).pow(2.2).mul(fill);
      m.colorNode = mix(mix(col(P[2]), col(P[1]), fres.mul(0.5).add(plasma.mul(0.3))), vec3(1.3, 1.4, 1.6), veins.mul(0.7).add(centre.mul(0.6)).clamp(0, 1));
      const alpha = fres.pow(1.4).mul(0.4).add(veins.mul(0.55)).add(centre.mul(0.6)).add(plasma.mul(0.1)).mul(fade).clamp(0, 1);
      m.opacityNode = alpha;
      return markGlow(m, alpha.mul(0.6));
    }
    const body = mix(col(P[2]), col(P[1]), plasma.mul(0.45).add(fres.mul(0.35)));
    m.colorNode = mix(body, col(P[0]), veins.mul(0.5).mul(fill.mul(0.6).add(0.4)));
    const rim = fres.pow(2.0).mul(0.85);
    const full = oneMinus(fres).pow(0.4).mul(0.96).add(fres.mul(0.5));
    const alpha = mix(rim, full, fill).add(veins.mul(0.3)).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, veins.mul(0.4).mul(fade).clamp(0, 1));
  }, 6);
}

/** Шар: `solid` под `shell`; возвращает группу и ручку `set(fade, fill, r)`. */
function orb(P, radius, seed, shellK = 1) {
  const g = new THREE.Group();
  const solid = new THREE.Mesh(orbGeo(), orbMat('solid', P));
  const shell = new THREE.Mesh(orbGeo(), orbMat('shell', P));
  solid.renderOrder = 8; shell.renderOrder = 9;
  solid.frustumCulled = shell.frustumCulled = false;
  shell.scale.setScalar(1.06);
  for (const m of [solid.material, shell.material]) m.userData.u.seed.value = seed;
  g.add(solid, shell);
  g.scale.setScalar(radius);
  return {
    group: g,
    set(fade, fill = 1, r = radius) {
      solid.material.userData.u.fade.value = fade; shell.material.userData.u.fade.value = fade * shellK;
      solid.material.userData.u.fill.value = fill; shell.material.userData.u.fill.value = fill;
      g.scale.setScalar(Math.max(0.001, r));
    },
  };
}

/**
 * Ионизированный чехол вдоль оси луча: труба с френелевым краем и бегущими
 * к цели прожилками. Обычный блендинг — на белом полу аддитивная труба
 * невидима; светится по метке.
 */
function haloMat(P) {
  return pooled(`arc:halo:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    const streak = mx_fractal_noise_float(vec3(uv().x.mul(7.0), uv().y.mul(16.0).sub(TIME.mul(7.0)), 1.5), 2, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const body = fres.pow(1.7).mul(0.6).add(streak.mul(fres).mul(0.5));
    m.colorNode = mix(col(P[2]).mul(0.9), col(P[1]), body.clamp(0, 1).mul(0.5));
    m.opacityNode = body.mul(0.55).mul(fade).clamp(0, 1);
    return markGlow(m, body.mul(0.3).mul(fade).clamp(0, 1));
  }, 4);
}

function halo(vfx, P, a, b, radius, life) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  if (len < 0.1) return;
  const mesh = new THREE.Mesh(tubeGeo(), haloMat(P));
  mesh.position.copy(A).lerp(B, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  mesh.renderOrder = 8;
  mesh.frustumCulled = false;
  vfx.spawnMesh(mesh, life, (o, u) => {
    const r = radius * (0.7 + u * 0.7);
    o.scale.set(r, len, r);
    o.material.userData.fade.value = (1 - u) ** 1.4;
  });
}

/* ── облако: шар каста у руки и облако удара ───────────────────────────── */

/**
 * Мягкое бело-голубое облако (эталон: шар ~1.2 м у руки в первые 300 мс и
 * облако ~2.5 м в точке удара). Обычный блендинг: середина — HDR-белое
 * (по метке уходит в bloom), к краю — светло-синий и на самом ободе
 * глубокий синий с малой прозрачностью. Именно синий обод делает белое
 * облако видимым на белом полу; поверх тёмного тела оно просто белое.
 * Поверхность рыхлая — смещение по нормали шумом, пятна по второму шуму.
 */
function cloudMat(P) {
  return pooled(`arc:cloud:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const seed = uniform(0), hotK = uniform(1), dense = uniform(1);
    m.userData.u = { fade, seed, hotK, dense };
    const n1 = mx_fractal_noise_float(normalLocal.mul(2.2).add(vec3(seed, TIME.mul(1.2), 0)), 3, 2.0, 0.5, 1);
    m.positionNode = positionLocal.add(normalLocal.mul(n1.mul(0.16)));
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    const body = oneMinus(fres).pow(1.1);
    const mottle = mx_noise_float(normalLocal.mul(3.5).add(vec3(TIME.mul(2.0), seed, 0))).mul(0.5).add(0.5);
    const white = vec3(1.15, 1.2, 1.3);
    const rimC = mix(col(P[1]), col(P[2]), fres.pow(2.0).mul(0.35));
    m.colorNode = mix(rimC, white, body.mul(hotK).clamp(0, 1));
    /* Полупрозрачно: сквозь облако видно тело и клубок (эталон), а в bloom
       уходит треть — иначе большое белое облако затягивает кадр вуалью. */
    const alpha = body.mul(mottle.mul(0.5).add(0.55)).mul(0.62).add(fres.pow(1.5).mul(0.22)).mul(dense).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, body.mul(alpha).mul(0.35).clamp(0, 1));
  }, 6);
}

/**
 * Облако с собственной жизнью: с момента `at` растёт от `r0` до `r1` за
 * `grow` секунд (замедляясь), держится до `hold`, гаснет к `life`. Время —
 * секунды от каста; `squash` прижимает к полу. Возвращает меш.
 */
function cloud(vfx, P, { x, y, z, at = 0, r0 = 0.3, r1 = 1.0, grow = 0.2, hold = 0.4, life = 0.7, squash = 1, seed = 1, hot = 1, dense = 1 }) {
  const m = cloudMat(P);
  const u = m.userData.u;
  u.seed.value = seed; u.hotK.value = hot; u.dense.value = dense;
  const mesh = new THREE.Mesh(orbGeo(), m);
  mesh.position.set(x, y, z);
  mesh.renderOrder = 8;
  mesh.frustumCulled = false;
  mesh.scale.setScalar(0.001);
  vfx.spawnMesh(mesh, life, (o, k) => {
    const t = k * life - at;
    if (t < 0) { o.scale.setScalar(0.001); u.fade.value = 0; return; }
    const r = r0 + (r1 - r0) * easeOutCubic(clamp01(t / grow));
    o.scale.set(r, r * squash, r);
    const tail = life - at - (hold - at);
    u.fade.value = t < hold - at ? 1 : Math.max(0, 1 - (t - (hold - at)) / Math.max(0.01, tail)) ** 1.3;
  });
  return mesh;
}

/** Горячее ядро: аддитивный HDR-белый шарик с френелевым спадом — ядро шара каста, где из него выходит пучок. */
function hotMat(P) {
  return pooled(`arc:hot:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending });
    const fade = withFade(m);
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    const body = oneMinus(fres).pow(1.6);
    m.colorNode = mix(col(P[1]), vec3(1.5, 1.55, 1.7), body);
    const alpha = body.mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.7));
  }, 6);
}

function hotCore(vfx, P, { x, y, z, r = 0.2, life = 0.4, at = 0, hold = 0.3 }) {
  const mesh = new THREE.Mesh(orbGeo(), hotMat(P));
  mesh.position.set(x, y, z);
  mesh.renderOrder = 11;
  mesh.frustumCulled = false;
  const fade = mesh.material.userData.fade;
  vfx.spawnMesh(mesh, life, (o, k) => {
    const t = k * life;
    const on = t >= at ? 1 : 0;
    const f = t < hold ? 1 : Math.max(0, 1 - (t - hold) / Math.max(0.01, life - hold));
    fade.value = on * f;
    o.scale.setScalar(Math.max(0.001, r * (0.9 + 0.1 * Math.sin(t * 40))));
  });
  return mesh;
}

/* ── шипы удара и кольцо по полу ───────────────────────────────────────── */

/**
 * Шипы: длинные тонкие бело-голубые штрихи, летящие из точки радиально
 * (эталон: 0.5–1.5 м, десятки штук в момент удара). Форма — штрих,
 * вытянутый по скорости: при 13 м/с квад длиной ~1.4 м и толщиной ~8 см.
 * Без тяжести — это свет, а не осколки; к концу жизни уходят в синий,
 * чтобы дочитаться на белом полу.
 */
function spikes(vfx, P, { x, y, z, n = 40, speed = 13, life = 0.32, size = 0.26, at = null, r, up = 0.55 }) {
  const born = at ?? vfx.now;
  const white = new THREE.Color(0.8, 0.9, 1.0);
  vfx.add.emit(n, (i, s) => {
    const a = r() * TAU, e = (r() * 2 - 1) * up;
    const ce = Math.cos(e);
    const v = speed * (0.6 + r() * 0.8);
    s.pos(x, y, z);
    s.vel(Math.sin(a) * ce * v, Math.sin(e) * v, Math.cos(a) * ce * v);
    s.gravity(0, 0, 0);
    s.color(white, P[2]);
    s.life(born + r() * 0.03, life * (0.6 + r() * 0.8), size * (0.6 + r() * 0.8), kit.SHAPE.streak);
    s.ext(0, 0.5, 1, 1);
  });
}

/**
 * Тонкое кольцо по полу: белое с голубыми краями, обычный блендинг (на
 * белом полу — светло-синее, на тёмном — белое), расходится от `r0` до `r1`.
 */
function ringMat(P) {
  return pooled(`arc:ring:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const d = q.length();
    const band = oneMinus(d.sub(0.93).abs().div(0.07)).clamp(0, 1);
    /* Края кольца — глубокий синий, середина — белая: на белом полу читается
       синее кольцо с белой жилой, на тёмном — белое. В bloom — чуть: белая
       жила и так яркая, а засветка стирала бы синие края. */
    m.colorNode = mix(col(P[2]), vec3(1.3, 1.35, 1.45), band.pow(7.0));
    const alpha = band.pow(0.3).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.15));
  }, 4);
}

function floorRing(vfx, P, { x, z, r0 = 0.4, r1 = 3.5, life = 0.45, at = 0, y = 0.07 }) {
  const mesh = new THREE.Mesh(ringGeo(), ringMat(P));
  mesh.position.set(x, y, z);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.scale.setScalar(0.001);
  const fade = mesh.material.userData.fade;
  const total = at + life;
  vfx.spawnMesh(mesh, total, (o, k) => {
    const t = k * total - at;
    if (t < 0) { fade.value = 0; return; }
    const u = clamp01(t / life);
    const r = r0 + (r1 - r0) * easeOutCubic(u);
    o.scale.set(r, 1, r);
    fade.value = (1 - u) ** 0.8;
  });
  return mesh;
}

/* ── перестройщик ──────────────────────────────────────────────────────── */

/**
 * Перестройщик: держит таймер перестроек и вспышку. `strandsAt(t, rng)`
 * отдаёт список элементов поля на этот момент, `interval` — секунды между
 * перестройками (число или функция от времени: луч перестраивается реже,
 * когда гаснет). `tick(t)` возвращает вспышку 0..1: единица в момент
 * перестройки, ноль через `flash` секунд — в шейдере ядро в полтора раза
 * ярче, рубашка на треть шире; видимый удар на каждом перестроении.
 */
function restriker(field, seed, strandsAt, interval = 0.045, flash = 0.035) {
  let strike = 0, next = 0, hotAt = -1;
  const gen = () => mulberry((seed ^ Math.imul(strike + 1, 0x9e3779b1)) >>> 0);
  return {
    tick(t) {
      if (t >= next) {
        strike++;
        const r = gen();
        field.write(strandsAt(t, r), r);
        hotAt = t;
        const iv = typeof interval === 'function' ? interval(t) : interval;
        next = t + iv * (0.7 + r() * 0.6);
      }
      return Math.max(0, 1 - (t - hotAt) / flash);
    },
  };
}

/** Ползущая дуга по полу от точки наружу. */
function crawl(x, z, dir, len, rng, phase, width = 0.04, bright = 0.85) {
  const a = dir + (rng() * 2 - 1) * 0.5;
  return {
    a: [x, 0.06, z], b: [x + Math.sin(a) * len, 0.05, z + Math.cos(a) * len],
    floor: true, width, bright, jag: 0.28, branches: 2, phase,
  };
}

/**
 * Гроза: плотный синий шар обычным блендингом (он и виден на белом полу)
 * и поверх — аддитивная ионизированная оболочка `storm` из набора.
 */
function stormBurst(vfx, P, { x, y, z, radius, endRadius, life = 0.45, intensity = 1, squash = 1, shell = true }) {
  kit.burst(vfx, { x, y, z, radius: radius * 0.85, endRadius: endRadius * 0.8, life, mode: 'air', colours: [P[0], P[1], P[2]], displace: 0.6, intensity, squash, flash: false, order: 8 });
  if (shell) kit.burst(vfx, { x, y, z, radius, endRadius, life: life * 0.9, mode: 'storm', colours: [P[1], P[2], P[2]], displace: 0.6, intensity: intensity * 0.8, squash, flash: false, order: 10 });
}

/** Искры разряда: голубые штрихи к глубокому синему, вытянутые по скорости. */
function arcSparks(vfx, P, o) {
  kit.sparks(vfx, { colour: P[1], tail: P[2], size: 0.14, gravity: -9, ...o });
}

/** Выброс у руки при выходе: маленькая гроза и сноп искр вперёд. */
function muzzle(vfx, P, { x, y, z, dir, size = 0.9, r }) {
  stormBurst(vfx, P, { x, y, z, radius: size * 0.45, endRadius: size * 1.2, life: 0.3, intensity: 1.2 });
  kit.sparks(vfx, { x, y, z, n: 26, colour: P[1], tail: P[2], speed: 10, life: 0.4, cone: { dir, half: 0.5 }, gravity: -6, size: 0.14, r });
}

/** Свет, который можно вести за точкой: ссылка на источник из пула. */
function heldLight(vfx, x, y, z, colour, intensity, secs, radius) {
  vfx.flashLight(x, y, z, colour, intensity, secs, radius);
  if (!vfx.lights || !vfx.lights.length) return null;
  const l = vfx.lights[(vfx.lightHead - 1 + vfx.lights.length) % vfx.lights.length];
  const born = l.userData.born;
  return (nx, ny, nz) => { if (l.userData.born === born) l.position.set(nx, ny, nz); };
}

/** Веер дуг по полу из точки: `n` штук длиной `len`, вспышка `life` секунд. */
function radialArcs(vfx, P, seed, x, z, n, len, life, y0 = 0.3) {
  const rng = mulberry(seed ^ 0x2a7);
  const rays = [];
  for (let i = 0; i < n; i++) rays.push({ a: (i / n) * TAU + rng() * (TAU / n), len: len * (0.7 + rng() * 0.6), phase: 60 + i });
  const field = boltField(vfx, P, 700);
  const strandsAt = (t) => {
    const k = env(t, life * 0.45, life);
    const m = Math.max(2, Math.round(n * (0.4 + 0.6 * k)));
    const out = [];
    for (let i = 0; i < m; i++) {
      const rd = rays[i];
      out.push({ a: [x, y0, z], b: [x + Math.sin(rd.a) * rd.len, 0.05, z + Math.cos(rd.a) * rd.len], floor: true, floorTop: 0.55, width: 0.04, bright: 0.95, jag: 0.26, branches: 2, phase: rd.phase, step: 0.3 });
    }
    return out;
  };
  const rs = restriker(field, seed ^ 0x2a7, strandsAt, 0.045);
  vfx.spawnMesh(field.group, life, (o, u) => {
    const t = u * life;
    const hot = rs.tick(t);
    field.set({ fade: env(t, life * 0.45, life), hot, reach: clamp01(t / 0.05) + 0.001 });
  });
  rs.tick(0);
}

export {
  orb, halo, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs,
  cloud, hotCore, spikes, floorRing,
};
