/**
 * Молния · общие кусочки доставок: шар грозы и чехол, перестройщик,
 * ползущие дуги, гроза, искры, выброс у руки, ведомый свет, веер дуг.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { TIME, clamp01, col, markGlow, mulberry, pooled, shared, withFade } from '../core.js';
import * as kit from '../kit.js';
import { TAU, clampN, hex, env, onSphere } from './util.js';
import { boltField } from './field.js';

const {
  float, vec3, vec4, uv, uniform, mix, smoothstep, oneMinus, abs: tabs, attribute,
  positionLocal, normalLocal, normalView, positionViewDirection, cameraProjectionMatrix,
  modelViewMatrix, cross, select, step, mx_noise_float, mx_fractal_noise_float,
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

/**
 * Перестройщик: держит таймер перестроек и вспышку `hot`. `strandsAt(t)`
 * отдаёт список нитей на этот момент, `interval` — секунды между ними.
 */
function restriker(field, seed, strandsAt, interval = 0.045) {
  let strike = 0, next = 0, hotAt = 0;
  const gen = () => mulberry((seed ^ Math.imul(strike + 1, 0x9e3779b1)) >>> 0);
  return {
    tick(t) {
      if (t >= next) {
        strike++;
        const r = gen();
        field.write(strandsAt(t, r), r);
        hotAt = t;
        next = t + interval * (0.7 + r() * 0.6);
      }
      return 0.6 + 0.4 * Math.max(0, 1 - (t - hotAt) / interval);
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
      out.push({ a: [x, y0, z], b: [x + Math.sin(rd.a) * rd.len, 0.05, z + Math.cos(rd.a) * rd.len], floor: true, floorTop: 0.55, width: 0.055, bright: 0.95, jag: 0.26, branches: 2, phase: rd.phase, step: 0.3 });
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

export { orb, halo, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs };
