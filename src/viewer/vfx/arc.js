/**
 * Молния (`arc`): cone zone self beam bolt lob impact charge.
 *
 * Эталон — Storm Lance из Path of Exile 2 (reports/vfx/reference/ref-storm-*):
 * не тонкая синяя линия, а ТОЛСТЫЙ пучок нитей, который рвётся по земле,
 * ветвится и перестраивается несколько раз за полсекунды. Всё здесь стоит на
 * одном примитиве — ПОЛЕ РАЗРЯДОВ (`boltField`): набор нитей между двумя
 * точками, каждая — ломаная со смещением середин, с дочерними ветками;
 * сегменты лежат в одном инстансированном буфере и разворачиваются к камере
 * в вершинном шейдере (лента поперёк взгляда, TSL, без GLSL). Одна геометрия
 * рисуется ТРИЖДЫ:
 *
 *   · рубашка — обычный блендинг, ПОЧТИ НЕПРОЗРАЧНАЯ насыщенно-синяя полоса.
 *     Арена белая и в HDR ярче единицы (§10.1): полупрозрачная синяя лента
 *     на ней бледнеет до серо-голубого, а аддитивная не существует вовсе.
 *     Рубашка — то, что держит форму и цвет молнии на белом полу;
 *   · свечение — широкая мягкая аддитивная лента глубокого синего: халo для
 *     тёмного фона и тел, на белом полу честно ничего не делает;
 *   · ядро — тонкая бело-горячая нить, HDR-цвет выше единицы уходит в bloom.
 *
 * ПЕРЕСТРОЙКА: ломаные пересчитываются каждые ~45 мс всё время жизни
 * разряда, ядро мерцает шумом от часов `TIME`, и на каждой перестройке
 * разряд вспыхивает (`hot`). Это отличает молнию от нарисованного зигзага.
 *
 * Детерминизм (A2): все ломаные — от `mulberry(seedOf(e))`, номер
 * перестройки подмешивается в сид, повтор боя даёт те же кадры.
 *
 * Размер — параметр (решение 11): число нитей, ползущих дуг, ударов
 * считается от длины и площади следа через `footprint`/`countFor`.
 * Декорация выходит за след до ~2× (решение 8) — дуги стекают на пол вокруг.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import {
  TIME, clamp01, col, lerp, markGlow, mulberry, pooled, rnd, seedOf, shared, withFade,
} from './core.js';
import * as kit from './kit.js';

const {
  float, vec3, vec4, uv, uniform, mix, smoothstep, oneMinus, abs: tabs, attribute,
  positionLocal, normalLocal, normalView, positionViewDirection, cameraProjectionMatrix,
  modelViewMatrix, cross, select, step, mx_noise_float, mx_fractal_noise_float,
} = TSL;

export const READY = true;

const TAU = Math.PI * 2;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const hex = (P) => P.map((c) => c.getHexString()).join();

/* ── материалы разряда ──────────────────────────────────────────────────── */

/**
 * Множитель ширины слоя от ширины нити (полуширина ядра в метрах). Замер с
 * трансляционной дистанции (26 м, ~66 px/м): ядро 0.1 м — 6–7 px, рубашка
 * 0.5 м — читается полосой, свечение 0.9 м — мягкий ореол на тёмном.
 */
const LAYER = {
  jacket: { mul: 4.2, order: 7, blend: THREE.NormalBlending },
  glow: { mul: 8.0, order: 9, blend: THREE.AdditiveBlending },
  core: { mul: 1.0, order: 10, blend: THREE.AdditiveBlending },
};

function boltMat(layer, P) {
  return pooled(`arc:bolt:${layer}:${hex(P)}`, () => makeBoltMat(layer, P), 8);
}

/**
 * Лента сегмента. Инстанс — один сегмент (`sa` → `sb`), квад из четырёх вершин:
 * `positionLocal.x` — доля вдоль (0..1), `positionLocal.y` — поперёк (−1..1).
 * В пространстве вида квад растягивается вдоль касательной с запасом на
 * ширину (стыки соседних сегментов перекрываются, а не рвутся) и раздвигается
 * поперёк по `cross(касательная, взгляд)` — лента всегда смотрит на камеру.
 * В пикселе — капсула: расстояние до отрезка в метрах через ширину слоя.
 */
function makeBoltMat(layer, P) {
  const L = LAYER[layer];
  const m = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: L.blend,
  });
  const fade = withFade(m);
  const hot = uniform(1), reach = uniform(1);
  m.userData.u = { fade, hot, reach };

  const a = attribute('sa', 'vec3'), b = attribute('sb', 'vec3'), cfg = attribute('scfg', 'vec4');
  const along = positionLocal.x, across = positionLocal.y;
  const W = cfg.x.mul(L.mul);

  const av = modelViewMatrix.mul(vec4(a, 1)).xyz;
  const bv = modelViewMatrix.mul(vec4(b, 1)).xyz;
  const seg = bv.sub(av);
  const len = seg.length();
  const tng = seg.div(len.max(1e-4));
  const pv = av.add(tng.mul(along.mul(len.add(W.mul(2))).sub(W)));
  const view = pv.negate().normalize();
  const sideRaw = cross(tng, view);
  const sl = sideRaw.length();
  const side = select(sl.greaterThan(1e-4), sideRaw.div(sl.max(1e-4)), vec3(1, 0, 0));
  m.vertexNode = cameraProjectionMatrix.mul(vec4(pv.add(side.mul(across.mul(W))), 1));

  /* Капсула в пикселе: за концами отрезка расстояние растёт, поперёк — по
     ширине; всё в метрах, делённых на ширину слоя. */
  const lenW = b.sub(a).length();
  const alongM = along.mul(lenW.add(W.mul(2))).sub(W);
  const dEnd = alongM.negate().max(alongM.sub(lenW)).max(0);
  const dAcross = across.abs().mul(W);
  const d = dEnd.mul(dEnd).add(dAcross.mul(dAcross)).sqrt().div(W.max(1e-4));
  const mask = oneMinus(d).clamp(0, 1);
  /* Разряд доходит до цели за десятки миллисекунд: сегменты с `u` дальше
     `reach` ещё не существуют. */
  const on = step(cfg.w, reach);
  /* Мерцание ~25 Гц от часов и бегущая по нити рябь: нить живёт между
     перестройками, а не стоит. */
  const flick = mx_noise_float(vec3(TIME.mul(23.0), cfg.z.mul(7.3), 0.7)).mul(0.28).add(0.8);
  const ripple = mx_noise_float(vec3(alongM.mul(2.7).add(cfg.z.mul(3.0)), TIME.mul(41.0), 0.2)).mul(0.25).add(0.85);
  const base = fade.mul(cfg.y).mul(on);

  if (layer === 'core') {
    m.colorNode = mix(col(P[0]), vec3(1.35, 1.45, 1.6), mask.pow(1.5));
    const alpha = mask.pow(0.9).mul(ripple).mul(base).mul(hot).mul(flick).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.55));
  }
  if (layer === 'glow') {
    m.colorNode = mix(col(P[2]), col(P[1]), mask.pow(2.0).mul(0.6));
    const alpha = mask.pow(2.2).mul(0.55).mul(ripple).mul(base).mul(hot).mul(flick).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.3));
  }
  /* Рубашка: непрозрачна во внутренних сорока процентах ширины, мягкий край
     снаружи; мерцание её почти не трогает — форма стоит, пока мигает ядро. */
  m.colorNode = mix(col(P[2]).mul(0.9), col(P[1]), mask.pow(3.0).mul(0.5));
  const solid = smoothstep(float(0.0), float(0.6), mask).mul(0.97);
  const alpha = solid.mul(base).mul(hot.mul(flick).mul(0.25).add(0.78)).clamp(0, 1);
  m.opacityNode = alpha;
  return markGlow(m, float(0));
}

/* ── поле разрядов ──────────────────────────────────────────────────────── */

/** Раскладка инстанса: a×3, b×3, cfg×4 (ширина, яркость, фаза, u вдоль). */
const STRIDE = 10;

/**
 * Поле: одна инстансированная геометрия сегментов и три меша на ней (три
 * слоя). Нити переписываются целиком на каждой перестройке — `write(strands,
 * rng)`. `set({fade, hot, reach})` — униформы всех трёх слоёв.
 */
function boltField(vfx, P, maxSeg = 1400) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  /* Нормаль не нужна ленте, но базовый материал её запрашивает — иначе предупреждение на каждой сборке. */
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  const arr = new Float32Array(maxSeg * STRIDE);
  const ibuf = new THREE.InstancedInterleavedBuffer(arr, STRIDE, 1);
  ibuf.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('sa', new THREE.InterleavedBufferAttribute(ibuf, 3, 0));
  geo.setAttribute('sb', new THREE.InterleavedBufferAttribute(ibuf, 3, 3));
  geo.setAttribute('scfg', new THREE.InterleavedBufferAttribute(ibuf, 4, 6));
  geo.instanceCount = 0;

  const group = new THREE.Group();
  const mats = [];
  for (const layer of ['jacket', 'glow', 'core']) {
    const m = boltMat(layer, P);
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = LAYER[layer].order;
    group.add(mesh);
    mats.push(m);
  }

  let n = 0;
  const put = (ax, ay, az, bx, by, bz, w, k, phase, u) => {
    if (n >= maxSeg) return;
    const o = n * STRIDE;
    arr[o] = ax; arr[o + 1] = ay; arr[o + 2] = az;
    arr[o + 3] = bx; arr[o + 4] = by; arr[o + 5] = bz;
    arr[o + 6] = w; arr[o + 7] = k; arr[o + 8] = phase; arr[o + 9] = u;
    n++;
  };
  const field = {
    group,
    write(strands, rng) {
      n = 0;
      for (const s of strands) strandSegs(s, rng, put, 0);
      geo.instanceCount = n;
      ibuf.needsUpdate = true;
      if (ibuf.clearUpdateRanges) ibuf.clearUpdateRanges();
      if (ibuf.addUpdateRange) ibuf.addUpdateRange(0, Math.max(1, n) * STRIDE);
    },
    set({ fade = 1, hot = 1, reach = 1 }) {
      for (const m of mats) { m.userData.u.fade.value = fade; m.userData.u.hot.value = hot; m.userData.u.reach.value = reach; }
    },
  };
  field.set({});
  return field;
}

/**
 * Одна нить: ломаная со смещением середин между `a` и `b`, затем ветки.
 *
 * Смещение перпендикулярно отрезку, амплитуда на первом уровне — `jag`·L и
 * чуть больше половины на каждом следующем: крупный изгиб пучка плюс мелкая
 * рваность. Ветки уходят от случайной точки середины нити под 20–40°, тоньше
 * и короче; на второй глубине — одна ветка, дальше нет.
 *
 * `floor` — дуга по полу: вертикаль зажата в полосе над полом, смещения по
 * высоте ослаблены. `minY` — не уходить под пол.
 */
function strandSegs(s, rng, put, depth) {
  const [ax, ay, az] = s.a, [bx, by, bz] = s.b;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const L = Math.hypot(dx, dy, dz);
  if (L < 0.04) return;
  const levels = clampN(Math.round(Math.log2(L / (s.step || 0.32))), 1, 5);
  const N = 1 << levels;
  const px = new Float64Array(N + 1), py = new Float64Array(N + 1), pz = new Float64Array(N + 1);
  px[0] = ax; py[0] = ay; pz[0] = az; px[N] = bx; py[N] = by; pz[N] = bz;
  let amp = L * (s.jag ?? 0.12);
  const yk = s.floor ? 0.25 : 1;
  for (let lv = 0, stride = N; lv < levels; lv++, stride >>= 1) {
    const half = stride >> 1;
    for (let i = 0; i < N; i += stride) {
      const j = i + stride, mid = i + half;
      let ox = rng() * 2 - 1, oy = (rng() * 2 - 1) * yk, oz = rng() * 2 - 1;
      const t = (ox * dx + oy * dy + oz * dz) / (L * L);
      ox -= dx * t; oy -= dy * t; oz -= dz * t;
      const ol = Math.hypot(ox, oy, oz) || 1;
      const k = (amp * (0.45 + rng() * 0.55)) / ol;
      px[mid] = (px[i] + px[j]) * 0.5 + ox * k;
      py[mid] = (py[i] + py[j]) * 0.5 + oy * k;
      pz[mid] = (pz[i] + pz[j]) * 0.5 + oz * k;
    }
    amp *= 0.55;
  }
  if (s.floor) {
    const lo = s.floorY ?? 0.05, hi = s.floorTop ?? 0.4;
    for (let i = 1; i < N; i++) py[i] = clampN(py[i], lo, hi);
  } else if (s.minY != null) {
    for (let i = 1; i < N; i++) py[i] = Math.max(py[i], s.minY);
  }
  const u0 = s.u0 ?? 0, u1 = s.u1 ?? 1;
  const bright = s.bright ?? 1;
  const phase = s.phase ?? 0;
  for (let i = 0; i < N; i++) {
    put(px[i], py[i], pz[i], px[i + 1], py[i + 1], pz[i + 1], s.width, bright, phase, u0 + ((u1 - u0) * (i + 1)) / N);
  }

  const nb = depth === 0 ? (s.branches ?? 0) : (depth === 1 && (s.branches ?? 0) >= 2 && L > 0.9 ? 1 : 0);
  for (let q = 0; q < nb; q++) {
    const i = clampN(Math.round(N * (0.15 + rng() * 0.7)), 1, N - 1);
    let tx = px[i + 1] - px[i - 1], ty = py[i + 1] - py[i - 1], tz = pz[i + 1] - pz[i - 1];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    /* Перпендикуляр к касательной (Грам — Шмидт от случайного вектора). */
    let nx = rng() * 2 - 1, ny = (rng() * 2 - 1) * (s.floor ? 0.2 : 1), nz = rng() * 2 - 1;
    const dn = nx * tx + ny * ty + nz * tz;
    nx -= tx * dn; ny -= ty * dn; nz -= tz * dn;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const ang = (20 + rng() * 20) * (Math.PI / 180);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const len = L * (0.2 + rng() * 0.25) * (depth === 0 ? 1 : 0.7);
    const rx = px[i], ry = py[i], rz = pz[i];
    const u = u0 + ((u1 - u0) * i) / N;
    strandSegs({
      a: [rx, ry, rz],
      b: [rx + (tx * ca + nx * sa) * len, ry + (ty * ca + ny * sa) * len, rz + (tz * ca + nz * sa) * len],
      width: s.width * 0.6, bright: bright * 0.75, jag: (s.jag ?? 0.12) * 1.3, branches: s.branches,
      floor: s.floor, floorY: s.floorY, floorTop: s.floorTop, minY: s.minY,
      phase: phase + 1.7 + q, u0: u, u1: Math.min(1, u + 0.1), step: s.step,
    }, rng, put, depth + 1);
  }
}

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

/* ── общие кусочки ───────────────────────────────────────────────────────── */

/** Огибающая: полная до `full`, потом гаснет к `life`. */
const env = (t, full, life) => (t < full ? 1 : Math.max(0, 1 - (t - full) / Math.max(0.01, life - full)) ** 1.4);

/** Точка на сфере радиуса R (равномерно). */
function onSphere(rng, R) {
  const a = rng() * TAU, e = Math.asin(rng() * 2 - 1);
  return [Math.cos(e) * Math.sin(a) * R, Math.sin(e) * R, Math.cos(e) * Math.cos(a) * R];
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

const bodyAt = (ctx, who) => (ctx && ctx.bodyPos ? ctx.bodyPos(who) : null);

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

/* ── луч: главный разряд ────────────────────────────────────────────────── */

export function beam(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const A = [e.x0, 1.15, e.z0];
  const B = [e.x1, 1.1, e.z1];
  const dx = B[0] - A[0], dz = B[2] - A[2];
  const len = Math.hypot(dx, dz);
  if (len < 0.1) return false;
  const ux = dx / len, uz = dz / len;
  const sx = -uz, sz = ux;
  const dir = Math.atan2(dx, dz);

  /* Нитей — по длине: три на коротком, девять на длинном пучке. */
  const nFil = clampN(Math.round(2.5 + len * 0.42), 3, 9);
  /* Контакты с полом — по одному на ~1.3 м пути: дуги стекают с пучка. */
  const nGround = clampN(Math.round(len / 1.3), 2, 10);
  const contacts = [];
  for (let g = 0; g < nGround; g++) {
    const f = (g + 0.3 + rng() * 0.5) / nGround;
    const sidew = (g % 2 ? -1 : 1) * (0.8 + rng() * 1.6);
    const px = A[0] + ux * len * f, pz = A[2] + uz * len * f;
    contacts.push({
      f, top: [px, 1.15, pz], foot: [px + sx * sidew * 0.6, 0.05, pz + sz * sidew * 0.6],
      out: dir + Math.sign(sidew) * (1.1 + rng() * 0.7), len: 1.2 + rng() * 1.6, phase: 20 + g,
    });
  }

  const LIFE = 0.9, FULL = 0.52;
  const field = boltField(vfx, P, 1800);
  const strandsAt = (t, r) => {
    const k = env(t, FULL, LIFE);
    const n = Math.max(1, Math.round(nFil * (0.4 + 0.6 * k)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const hero = i < 2;
      out.push({
        a: A, b: B, width: hero ? 0.06 : 0.038, bright: hero ? 1 : 0.8 + r() * 0.2,
        jag: hero ? 0.07 : 0.11, branches: hero ? 3 : 2, minY: 0.08, phase: i, step: 0.3,
      });
    }
    const ng = Math.round(contacts.length * (0.5 + 0.5 * k));
    for (let g = 0; g < ng; g++) {
      const c = contacts[g];
      out.push({ a: c.top, b: c.foot, width: 0.04, bright: 0.85, jag: 0.16, branches: 1, minY: 0.05, phase: c.phase, u0: c.f, u1: c.f + 0.05 });
      out.push({ a: c.foot, b: [c.foot[0] + Math.sin(c.out) * c.len, 0.05, c.foot[2] + Math.cos(c.out) * c.len], floor: true, width: 0.045, bright: 0.85, jag: 0.28, branches: 2, phase: c.phase + 0.5, u0: c.f + 0.05, u1: c.f + 0.12 });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.045);
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    field.set({ fade: env(t, FULL, LIFE), hot, reach: clamp01(t / 0.06) + 0.001 });
  });
  rs.tick(0);

  /* Чехол по оси, выброс у руки, гроза у цели, веер дуг по полу вокруг цели. */
  halo(vfx, P, A, B, 0.5, 0.6);
  muzzle(vfx, P, { x: A[0], y: 1.15, z: A[2], dir, size: 0.9, r: rng });
  if (e.hit) {
    stormBurst(vfx, P, { x: B[0], y: 1.05, z: B[2], radius: 0.9, endRadius: 2.6, life: 0.5, intensity: 1.2 });
    radialArcs(vfx, P, seed, B[0], B[2], 7, 2.6, 0.45, 0.5);
  } else {
    stormBurst(vfx, P, { x: B[0], y: 0.9, z: B[2], radius: 0.5, endRadius: 1.5, life: 0.35, intensity: 0.9 });
    radialArcs(vfx, P, seed, B[0], B[2], 4, 1.8, 0.35, 0.4);
  }
  kit.impactKit(vfx, { x: B[0], z: B[2], y: 1.0, radius: 2.0, colours: P, strength: e.hit ? 1.4 : 0.9 });
  vfx.screen.aberration(0.7);
  vfx.flashLight(A[0], 1.4, A[2], P[1], 16, 0.3, 7);

  /* Следы: ожог у цели и под каждым контактом дуги с полом. */
  kit.decal(vfx, { type: 'arc', x: B[0], z: B[2], radius: 2.6, hold: 20, tint: P[1], seed: (seed % 7) + 1 });
  for (const c of contacts) kit.decal(vfx, { type: 'arc', x: c.foot[0], z: c.foot[2], radius: 1.0 + rng() * 0.5, hold: 20, tint: P[1], seed: (c.phase % 9) + 1 });

  arcSparks(vfx, P, { x: B[0], y: 1.0, z: B[2], n: 50, speed: 11, life: 0.5, r: rng });
  arcSparks(vfx, P, { x: A[0], y: 1.15, z: A[2], n: 16, speed: 6, life: 0.35, r: rng });
  for (const c of contacts) arcSparks(vfx, P, { x: c.foot[0], y: 0.1, z: c.foot[2], n: 9, speed: 5, life: 0.4, gravity: -6, at: vfx.now + rng() * 0.2, r: rng });
  /* Искры вдоль пучка, рождаются по ходу жизни — пучок сыплет, пока стоит. */
  const nAlong = clampN(Math.round(len * 6), 12, 70);
  vfx.add.emit(nAlong, (i, s) => {
    const f = rng();
    s.pos(A[0] + ux * len * f + rng() * 0.6 - 0.3, 1.15 + rng() * 0.6 - 0.3, A[2] + uz * len * f + rng() * 0.6 - 0.3);
    s.vel(rnd(-2, 2, rng), rnd(-1, 2.5, rng), rnd(-2, 2, rng));
    s.gravity(0, -7, 0);
    s.color(P[1], P[2]);
    s.life(vfx.now + rng() * FULL, rnd(0.25, 0.5, rng), rnd(0.1, 0.18, rng), kit.SHAPE.spark);
    s.ext(0, 0.3, 1, 1);
  });
  return true;
}

/* ── конус: веер разрядов ───────────────────────────────────────────────── */

export function cone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const { range, half } = fp;
  const dir = fp.dir;
  const ux = Math.sin(dir), uz = Math.cos(dir);
  const src = [e.x + ux * 0.6, 1.2, e.z + uz * 0.6];

  const nBolt = clampN(kit.countFor(5, fp.area, kit.REF_AREA.cone, 12), 3, 9);
  const targets = [];
  for (let i = 0; i < nBolt; i++) {
    const a = dir + (-1 + (2 * (i + 0.5)) / nBolt) * half * 0.92 + (rng() - 0.5) * (half / nBolt);
    const d = range * (0.9 + rng() * 0.25);
    targets.push({ p: [e.x + Math.sin(a) * d, 0.1, e.z + Math.cos(a) * d], a, phase: i });
  }
  const nCrawl = clampN(kit.countFor(14, fp.area, kit.REF_AREA.cone, 34), 6, 34);
  const crawls = [];
  for (let i = 0; i < nCrawl; i++) {
    const [x, z, d, a] = kit.inSector({ ...fp, range: range * 1.05 }, rng);
    crawls.push({ x, z, dir: a, len: 0.8 + rng() * 1.4 + d * 0.15, phase: 40 + i });
  }

  const LIFE = 0.8, FULL = 0.45;
  const field = boltField(vfx, P, 1800);
  const strandsAt = (t, r) => {
    const k = env(t, FULL, LIFE);
    const out = [];
    const nb = Math.max(1, Math.round(nBolt * (0.5 + 0.5 * k)));
    for (let i = 0; i < nb; i++) {
      const tg = targets[i];
      out.push({ a: src, b: tg.p, width: 0.055, bright: 1, jag: 0.1, branches: 3, minY: 0.06, phase: tg.phase, step: 0.28 });
      out.push({ a: src, b: tg.p, width: 0.035, bright: 0.8, jag: 0.15, branches: 2, minY: 0.06, phase: tg.phase + 0.5, step: 0.28 });
    }
    const nc = Math.round(crawls.length * (0.4 + 0.6 * k));
    for (let i = 0; i < nc; i++) {
      const c = crawls[i];
      out.push(crawl(c.x, c.z, c.dir, c.len, r, c.phase, 0.045));
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.045);
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    field.set({ fade: env(t, FULL, LIFE), hot, reach: clamp01(t / 0.07) + 0.001 });
  });
  rs.tick(0);

  muzzle(vfx, P, { x: src[0], y: 1.2, z: src[2], dir, size: 1.1, r: rng });
  /* Гроза у дальнего края — по одной на ~0.8 рад раскрытия. */
  const nBurst = clampN(Math.round((half * 2) / 0.8), 1, 3);
  for (let i = 0; i < nBurst; i++) {
    const a = dir + (nBurst === 1 ? 0 : (-1 + (2 * (i + 0.5)) / nBurst) * half * 0.7);
    const d = range * 0.9;
    stormBurst(vfx, P, { x: e.x + Math.sin(a) * d, y: 0.6, z: e.z + Math.cos(a) * d, radius: 0.6, endRadius: 1.9, life: 0.45, intensity: 1.1, squash: 0.7 });
  }
  const cx = e.x + ux * range * 0.6, cz = e.z + uz * range * 0.6;
  kit.impactKit(vfx, { x: cx, z: cz, y: 0.8, radius: range * 0.5, colours: P, strength: 1.2 });
  vfx.screen.aberration(0.5);

  /* Ожог размером с сектор плюс два поменьше по краям широкого веера. */
  kit.decal(vfx, { type: 'arc', x: e.x + ux * range * 0.55, z: e.z + uz * range * 0.55, radius: range * 0.7, hold: 20, tint: P[1], seed: (seed % 7) + 1 });
  if (half > 0.6) {
    for (const sgn of [-1, 1]) {
      const a = dir + sgn * half * 0.6;
      kit.decal(vfx, { type: 'arc', x: e.x + Math.sin(a) * range * 0.8, z: e.z + Math.cos(a) * range * 0.8, radius: range * 0.4, hold: 20, tint: P[1], seed: ((seed + sgn) % 9) + 1 });
    }
  }
  arcSparks(vfx, P, { x: src[0], y: 1.1, z: src[2], n: 44, speed: 13, life: 0.5, cone: { dir, half }, gravity: -8, r: rng });
  for (const tg of targets) arcSparks(vfx, P, { x: tg.p[0], y: 0.2, z: tg.p[2], n: 9, speed: 5, life: 0.4, gravity: -6, at: vfx.now + 0.05 + rng() * 0.15, r: rng });
  return true;
}

/* ── зона: вольтов столб ─────────────────────────────────────────────────── */

export function zone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const r = fp.radius;
  const D = Math.max(0.8, e.duration || 3);
  const cx = e.x, cz = e.z;
  const SKY = 9.5;
  const LAND = 0.12;
  const COLLAPSE = 0.32;

  const nCol = clampN(kit.countFor(10, fp.area, kit.REF_AREA.zone, 28), 4, 28);
  const nRim = clampN(Math.round((TAU * r) / 1.4), 4, 20);
  const nTend = clampN(kit.countFor(7, fp.area, kit.REF_AREA.zone, 18), 3, 18);
  const cols = [];
  for (let i = 0; i < nCol; i++) cols.push({ h: 2.4 + rng() * 2.0, phase: 100 + i, w: i < 3 ? 0.06 : 0.04 + rng() * 0.015 });
  const tend = [];
  for (let i = 0; i < nTend; i++) tend.push({ phi: (i / nTend) * TAU + rng() * 0.4, spin: (rng() - 0.5) * 0.9, phase: 200 + i });

  /* Удары с неба по случайным точкам диска, каждые ~0.34 с. */
  const strikes = [];
  for (let k = 0, t = 0.45 + rng() * 0.2; t < D - COLLAPSE - 0.15; k++, t += 0.3 + rng() * 0.12) {
    const [x, z] = kit.inDisc(cx, cz, r * 0.85, rng);
    strikes.push({ t, x, z, fired: false, phase: 300 + k, until: t + 0.14 });
  }

  const field = boltField(vfx, P, 2600);
  const colBase = (i, t) => {
    /* Колонны переходят с места на место каждые полсекунды — сид от номера
       окна, чтобы место держалось между перестройками. */
    const win = Math.floor(t / 0.5);
    const g = mulberry((seed ^ Math.imul(i * 131 + win * 977 + 1, 0x85ebca6b)) >>> 0);
    const [x, z] = kit.inDisc(cx, cz, r * 0.85, g);
    return [x, z];
  };
  const strandsAt = (t, g) => {
    const out = [];
    if (t < 0.26) {
      for (let i = 0; i < 5; i++) {
        out.push({ a: [cx + (g() - 0.5) * 0.5, SKY, cz + (g() - 0.5) * 0.5], b: [cx, 0.1, cz], width: i === 0 ? 0.09 : 0.045, bright: 1, jag: 0.06, branches: 3, minY: 0.06, phase: i, step: 0.4 });
      }
    }
    if (t < LAND + 0.05 || t >= D) return out;
    const c = clamp01((t - (D - COLLAPSE)) / COLLAPSE);
    const shrink = 1 - c * 0.92;
    const to = (x, z) => [cx + (x - cx) * shrink, cz + (z - cz) * shrink];
    const kIn = clamp01((t - LAND) / 0.25);
    const ncol = Math.round(nCol * kIn);
    for (let i = 0; i < ncol; i++) {
      const cc = cols[i];
      const [bx, bz] = colBase(i, t);
      const [x0, z0] = to(bx, bz);
      const [x1, z1] = to(bx + (cx - bx) * 0.25, bz + (cz - bz) * 0.25);
      out.push({ a: [x0, 0.06, z0], b: [x1, cc.h * (1 - c * 0.5), z1], width: cc.w, bright: 0.95, jag: 0.12, branches: 2, minY: 0.05, phase: cc.phase, step: 0.3 });
    }
    const rr = r * shrink;
    for (let i = 0; i < nRim; i++) {
      const th = t * 1.1 + (i / nRim) * TAU;
      const th2 = th + (TAU / nRim) * 0.85;
      const y1 = 0.12 + g() * 0.5, y2 = 0.12 + g() * 0.5;
      out.push({ a: [cx + Math.sin(th) * rr, y1, cz + Math.cos(th) * rr], b: [cx + Math.sin(th2) * rr, y2, cz + Math.cos(th2) * rr], width: 0.045, bright: 0.9, jag: 0.22, branches: 1, minY: 0.05, phase: 400 + i, step: 0.3 });
    }
    for (let i = 0; i < nTend; i++) {
      const td = tend[i];
      const phi = td.phi + t * td.spin;
      out.push({ a: [cx, 0.07, cz], b: [cx + Math.sin(phi) * rr, 0.05, cz + Math.cos(phi) * rr], floor: true, width: 0.05, bright: 0.9, jag: 0.26, branches: 2, phase: td.phase, step: 0.3 });
    }
    for (const s of strikes) {
      if (t < s.t || t >= s.until) continue;
      for (let i = 0; i < 3; i++) out.push({ a: [s.x + (g() - 0.5) * 0.3, 7.5, s.z + (g() - 0.5) * 0.3], b: [s.x, 0.08, s.z], width: i === 0 ? 0.075 : 0.04, bright: 1, jag: 0.06, branches: 2, minY: 0.06, phase: s.phase + i, step: 0.4 });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.05);
  const pulse = { next: 0.3 };
  const LIFE = D;
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    const c = clamp01((t - (D - COLLAPSE)) / COLLAPSE);
    field.set({ fade: t < 0.26 ? 1 : 1 - c * c, hot, reach: t < 0.26 ? clamp01(t / 0.09) + 0.001 : 1 });
    for (const s of strikes) {
      if (s.fired || t < s.t) continue;
      s.fired = true;
      stormBurst(vfx, P, { x: s.x, y: 0.45, z: s.z, radius: 0.4, endRadius: 1.3, life: 0.32, intensity: 1.0, squash: 0.7 });
      kit.decal(vfx, { type: 'arc', x: s.x, z: s.z, radius: 0.85, hold: 20, tint: P[1], seed: (s.phase % 9) + 1 });
      vfx.flashLight(s.x, 1.2, s.z, P[0], 22, 0.25, 7);
      arcSparks(vfx, P, { x: s.x, y: 0.2, z: s.z, n: 24, speed: 7, life: 0.45, gravity: -7, r: rng });
      vfx.screen.shake(0.12);
    }
    /* Пульс света в центре, пока столб стоит. */
    if (t >= pulse.next && t < D - COLLAPSE) { pulse.next = t + 0.45; vfx.flashLight(cx, 1.6, cz, P[1], 16, 0.5, r * 3.5); }
  });
  rs.tick(0);

  /* Посадка: гроза, веер дуг, волна, большой ожог под всем диском. */
  stormBurst(vfx, P, { x: cx, y: 0.6, z: cz, radius: 0.7, endRadius: r * 0.9, life: 0.5, intensity: 1.2, squash: 0.75 });
  radialArcs(vfx, P, seed, cx, cz, 8, r * 1.1, 0.5, 0.35);
  kit.decal(vfx, { type: 'arc', x: cx, z: cz, radius: r * 1.1, hold: 20 + D, tint: P[1], seed: (seed % 7) + 1 });
  kit.impactKit(vfx, { x: cx, z: cz, y: 0.8, radius: r * 0.6, colours: P, strength: 1.3 });
  vfx.screen.aberration(0.6);
  arcSparks(vfx, P, { x: cx, y: 0.3, z: cz, n: 56, speed: 9, life: 0.55, gravity: -7, at: vfx.now + LAND, r: rng });

  /* Треск: искры по диску пачками всю жизнь. */
  const nBatch = Math.ceil((D - COLLAPSE - 0.3) / 0.2);
  const perBatch = clampN(kit.countFor(8, fp.area, kit.REF_AREA.zone, 30), 4, 30);
  for (let k = 0; k < nBatch; k++) {
    const at = vfx.now + 0.3 + k * 0.2;
    vfx.add.emit(perBatch, (i, s) => {
      const [x, z] = kit.inDisc(cx, cz, r * 0.9, rng);
      s.pos(x, 0.08 + rng() * 0.5, z);
      s.vel(rnd(-1.5, 1.5, rng), rnd(1.5, 4.5, rng), rnd(-1.5, 1.5, rng));
      s.gravity(0, -6, 0);
      s.color(P[1], P[2]);
      s.life(at + rng() * 0.2, rnd(0.3, 0.6, rng), rnd(0.1, 0.17, rng), kit.SHAPE.spark);
      s.ext(0, 0.3, 1, 1);
    });
  }

  /* Схлопывание: гроза из центра, волна, толчок. */
  const tail = new THREE.Group();
  vfx.spawnMesh(tail, D, (o, u) => {
    if (!tail.userData.done && u * D >= D - COLLAPSE) {
      tail.userData.done = true;
      stormBurst(vfx, P, { x: cx, y: 0.9, z: cz, radius: r * 0.35, endRadius: r * 1.2, life: 0.45, intensity: 1.3 });
      radialArcs(vfx, P, seed ^ 0x77, cx, cz, 10, r * 1.3, 0.4, 0.4);
      kit.shockwave(vfx, { x: cx, z: cz, radius: r * 1.9, life: 0.5, colour: P[1], intensity: 1.0 });
      vfx.flashLight(cx, 1.5, cz, P[0], 30, 0.4, r * 4);
      vfx.screen.shake(0.5);
      vfx.screen.flash(P[0], 0.14);
      vfx.screen.aberration(0.6);
      arcSparks(vfx, P, { x: cx, y: 0.6, z: cz, n: 60, speed: 12, life: 0.5, gravity: -8, r: rng });
    }
  });
  return true;
}

/* ── self: ионизированное гало ─────────────────────────────────────────── */

export function self(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const LIFE = 2.4, R = 1.75, CY = 1.15;
  const nArc = 9;
  const arcs = [];
  for (let i = 0; i < nArc; i++) {
    arcs.push({ th: rng() * TAU, ph: (rng() - 0.5) * 2.2, w1: (rng() - 0.5) * 2.6, w2: (rng() - 0.5) * 1.2, span: 1.3 + rng() * 1.2, phase: i });
  }
  const nFeet = 5;
  const feet = [];
  for (let i = 0; i < nFeet; i++) feet.push({ a: (i / nFeet) * TAU + rng(), len: 1.4 + rng() * 1.4, phase: 20 + i });

  const field = boltField(vfx, P, 1200);
  const centre = () => {
    const p = bodyAt(ctx, e.who);
    return p ? [p.x, p.y + CY, p.z] : [e.x, CY, e.z];
  };
  const strandsAt = (t, g) => {
    const [x, y, z] = centre();
    const out = [];
    const k = t < 0.25 ? clamp01(t / 0.25) : env(t, LIFE - 0.45, LIFE);
    const n = Math.max(2, Math.round(nArc * k));
    const rr = R * (0.95 + 0.05 * Math.sin(t * 9));
    for (let i = 0; i < n; i++) {
      const a = arcs[i];
      const th = a.th + t * a.w1, ph = Math.sin(a.ph + t * a.w2) * 1.0;
      const th2 = th + a.span, ph2 = Math.sin(a.ph + 1.3 + t * a.w2 * 1.3) * 1.0;
      out.push({
        a: [x + Math.cos(ph) * Math.sin(th) * rr, y + Math.sin(ph) * rr * 0.8, z + Math.cos(ph) * Math.cos(th) * rr],
        b: [x + Math.cos(ph2) * Math.sin(th2) * rr, y + Math.sin(ph2) * rr * 0.8, z + Math.cos(ph2) * Math.cos(th2) * rr],
        width: i < 3 ? 0.055 : 0.04, bright: 0.95, jag: 0.16, branches: 2, minY: 0.06, phase: a.phase, step: 0.25,
      });
    }
    /* Дуги в пол: гало заземляется, ожог под телом — от них. */
    const nf = Math.round(nFeet * k);
    for (let i = 0; i < nf; i++) {
      const f = feet[i];
      const a = f.a + t * 0.6;
      out.push({ a: [x + Math.sin(a) * rr * 0.5, y - CY * 0.5, z + Math.cos(a) * rr * 0.5], b: [x + Math.sin(a) * (rr * 0.5 + f.len), 0.05, z + Math.cos(a) * (rr * 0.5 + f.len)], width: 0.045, bright: 0.85, jag: 0.2, branches: 2, minY: 0.05, phase: f.phase, step: 0.3 });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.055);

  const sh = orb(P, R * 0.8, (seed % 5) + 1, 0.5);
  const [x0, y0, z0] = centre();
  sh.group.position.set(x0, y0, z0);
  const moveLight = heldLight(vfx, x0, y0, z0, P[1], 14, LIFE, 7);
  const g = new THREE.Group();
  g.add(field.group, sh.group);
  vfx.spawnMesh(g, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    const k = t < 0.25 ? clamp01(t / 0.25) : env(t, LIFE - 0.45, LIFE);
    field.set({ fade: k, hot, reach: 1 });
    const [x, y, z] = centre();
    sh.group.position.set(x, y, z);
    sh.set(k * 0.8, 0, R * 0.8 * (0.8 + 0.2 * k) * (1 + 0.03 * Math.sin(t * 13)));
    if (moveLight) moveLight(x, y, z);
    if (!o.userData.next || t >= o.userData.next) {
      o.userData.next = t + 0.3;
      if (t < LIFE - 0.5) arcSparks(vfx, P, { x, y, z, n: 10, speed: 5, life: 0.4, gravity: -5, r: rng });
    }
  });
  rs.tick(0);

  stormBurst(vfx, P, { x: x0, y: y0, z: z0, radius: 0.6, endRadius: R * 1.6, life: 0.4, intensity: 0.9 });
  radialArcs(vfx, P, seed, x0, z0, 6, 2.4, 0.4, 0.3);
  kit.decal(vfx, { type: 'arc', x: x0, z: z0, radius: 2.2, hold: 20, tint: P[1], seed: (seed % 7) + 1 });
  vfx.flashLight(x0, y0, z0, P[0], 20, 0.25, 8);
  vfx.screen.flash(P[0], 0.06);
  return true;
}

/* ── болт и навес: шаровая молния ──────────────────────────────────────── */

function ball(vfx, e, P, ctx, lob) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const ux = Math.sin(e.h), uz = Math.cos(e.h);
  const speed = e.speed || 20;
  const range = e.range || 10;
  const travel = Math.min(range / speed, 1.6);
  const flown = speed * travel;
  const S = [e.x + ux * 0.7, 1.1, e.z + uz * 0.7];
  const E = [S[0] + ux * flown, lob ? 0.25 : 1.1, S[2] + uz * flown];
  const apex = flown * 0.35;
  const at = (f) => {
    const y = lob ? lerp(S[1], E[1], f) + 4 * apex * f * (1 - f) : S[1];
    return [S[0] + ux * flown * f, y, S[2] + uz * flown * f];
  };
  const HR = 0.55;
  const HOLD = 0.55;
  const LIFE = travel + HOLD;

  /* Голова: шар с ползущими по нему дугами и шлейф дуг назад на несколько
     метров (локально: −z — назад по полёту). */
  const head = new THREE.Group();
  const sph = orb(P, HR, (seed % 5) + 1, 0.6);
  const onHead = boltField(vfx, P, 900);
  head.add(sph.group, onHead.group);
  const headStrands = (t, g) => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      out.push({ a: onSphere(g, HR * 1.1), b: onSphere(g, HR * 1.1), width: 0.04, bright: 0.95, jag: 0.25, branches: 1, phase: i, step: 0.2 });
    }
    const tailK = clamp01(t / 0.12);
    for (let i = 0; i < 4; i++) {
      const tl = (2.2 + g() * 2.0) * tailK;
      out.push({ a: [(g() - 0.5) * 0.4, (g() - 0.5) * 0.4, -HR * 0.5], b: [(g() - 0.5) * 1.4, (g() - 0.5) * 1.0, -tl], width: i === 0 ? 0.055 : 0.04, bright: 0.9, jag: 0.14, branches: 2, phase: 10 + i, step: 0.28 });
    }
    return out;
  };
  const rsHead = restriker(onHead, seed, headStrands, 0.04);

  /* Земля под шаром — в мировом поле; веер при посадке — отдельным полем. */
  const ground = boltField(vfx, P, 500);
  let headPos = at(0);
  const groundStrands = (t, g) => {
    const out = [];
    if (t >= travel) return out;
    const [x, y, z] = headPos;
    if (y < 2.4) {
      for (let i = 0; i < 3; i++) {
        const a = e.h + Math.PI / 2 + (g() < 0.5 ? Math.PI : 0) + (g() - 0.5) * 0.8;
        const d = 0.8 + g() * 1.5;
        out.push({ a: [x, y, z], b: [x + Math.sin(a) * d, 0.05, z + Math.cos(a) * d], width: 0.04, bright: 0.8, jag: 0.2, branches: 1, minY: 0.05, phase: 30 + i, step: 0.25 });
      }
    }
    return out;
  };
  const rsGround = restriker(ground, seed ^ 0x51, groundStrands, 0.045);

  const moveLight = heldLight(vfx, S[0], S[1], S[2], P[1], 14, LIFE, 8);
  const root = new THREE.Group();
  root.add(head, ground.group);
  const look = new THREE.Vector3();
  vfx.spawnMesh(root, LIFE, (o, u) => {
    const t = u * LIFE;
    const f = clamp01(t / travel);
    headPos = at(f);
    const hotG = rsGround.tick(t);
    ground.set({ fade: t < travel ? 1 : 0, hot: hotG, reach: 1 });
    if (t < travel) {
      const hot = rsHead.tick(t);
      onHead.set({ fade: 1, hot, reach: 1 });
      head.position.set(headPos[0], headPos[1], headPos[2]);
      const nx = at(Math.min(1, f + 0.02));
      look.set(nx[0], nx[1], nx[2]);
      head.lookAt(look);
      sph.set(1, 1, HR * (0.9 + 0.1 * Math.sin(t * 27)));
      if (moveLight) moveLight(headPos[0], headPos[1], headPos[2]);
    } else {
      head.visible = false;
      if (!o.userData.landed) {
        o.userData.landed = true;
        stormBurst(vfx, P, { x: E[0], y: Math.max(0.7, E[1]), z: E[2], radius: 0.8, endRadius: 2.6, life: 0.45, intensity: 1.3 });
        radialArcs(vfx, P, seed, E[0], E[2], 9, 2.8, HOLD, 0.5);
        kit.decal(vfx, { type: 'arc', x: E[0], z: E[2], radius: 2.4, hold: 20, tint: P[1], seed: (seed % 7) + 1 });
        kit.impactKit(vfx, { x: E[0], z: E[2], y: 0.9, radius: 2.0, colours: P, strength: 1.3 });
        vfx.screen.aberration(0.6);
        arcSparks(vfx, P, { x: E[0], y: 0.8, z: E[2], n: 50, speed: 10, life: 0.5, r: rng });
      }
    }
  });
  rsHead.tick(0); rsGround.tick(0);

  muzzle(vfx, P, { x: S[0], y: 1.1, z: S[2], dir: e.h, size: 0.8, r: rng });
  /* Шлейф искр рождается вдоль пути в будущем — по мере пролёта головы. */
  const nTrail = clampN(Math.round(flown * 9), 24, 110);
  vfx.add.emit(nTrail, (i, s) => {
    const f = rng();
    const [x, y, z] = at(f);
    s.pos(x + rng() * 0.5 - 0.25, y + rng() * 0.5 - 0.25, z + rng() * 0.5 - 0.25);
    s.vel(-ux * rnd(1, 3, rng) + rnd(-1.2, 1.2, rng), rnd(-0.5, 1.5, rng), -uz * rnd(1, 3, rng) + rnd(-1.2, 1.2, rng));
    s.gravity(0, -6, 0);
    s.color(P[1], P[2]);
    s.life(vfx.now + f * travel, rnd(0.3, 0.5, rng), rnd(0.1, 0.18, rng), kit.SHAPE.spark);
    s.ext(0, 0.3, 1, 1);
  });
  return true;
}

export function bolt(vfx, e, P, ctx) { return ball(vfx, e, P, ctx, false); }
export function lob(vfx, e, P, ctx) { return ball(vfx, e, P, ctx, true); }

/* ── удар: элементная вспышка на жертве ────────────────────────────────── */

export function impact(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const victim = bodyAt(ctx, e.who === 'blue' ? 'orange' : 'blue');
  const cx = victim ? victim.x : e.x, cz = victim ? victim.z : e.z;
  const cy = (victim ? victim.y : 0) + 1.1;

  if (e.blocked) {
    stormBurst(vfx, P, { x: e.x, y: 1.0, z: e.z, radius: 0.4, endRadius: 1.1, life: 0.3, intensity: 0.9 });
    arcSparks(vfx, P, { x: e.x, y: 1.0, z: e.z, n: 18, speed: 7, life: 0.35, r: rng });
    return true;
  }

  const LIFE = 0.4;
  const field = boltField(vfx, P, 700);
  const strandsAt = (t, g) => {
    const out = [];
    const k = env(t, 0.22, LIFE);
    const n = Math.max(2, Math.round(7 * k));
    for (let i = 0; i < n; i++) {
      const a = onSphere(g, 1.15), b = onSphere(g, 1.15);
      out.push({ a: [cx + a[0], cy + a[1] * 0.9, cz + a[2]], b: [cx + b[0], cy + b[1] * 0.9, cz + b[2]], width: 0.05, bright: 0.95, jag: 0.22, branches: 1, minY: 0.06, phase: i, step: 0.22 });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.04);
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    field.set({ fade: env(t, 0.22, LIFE), hot, reach: 1 });
  });
  rs.tick(0);

  stormBurst(vfx, P, { x: e.x, y: 1.0, z: e.z, radius: 0.6, endRadius: 2.0, life: 0.42, intensity: 1.1 });
  radialArcs(vfx, P, seed, e.x, e.z, 6, 2.4, 0.4, 0.5);
  kit.decal(vfx, { type: 'arc', x: e.x, z: e.z, radius: 1.6, hold: 20, tint: P[1], seed: (seed % 9) + 1 });
  kit.impactKit(vfx, { x: e.x, z: e.z, y: 1.0, radius: 1.5, colours: P, strength: 0.9 });
  arcSparks(vfx, P, { x: e.x, y: 1.0, z: e.z, n: 36, speed: 9, life: 0.45, r: rng });
  return true;
}

/* ── заряд: дуги сходятся на кастере ───────────────────────────────────── */

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const secs = Math.max(0.15, e.windup || 0.4);
  const CY = 1.2;
  const centre = () => {
    const p = bodyAt(ctx, e.who);
    return p ? [p.x, p.y + CY, p.z] : [e.x, CY, e.z];
  };
  kit.charge(vfx, { who: e.who, x: e.x, z: e.z, y: CY, secs, colours: [P[1], P[2], P[2]], mode: 'storm', ctx, n: 30, radius: 2.2 });

  const field = boltField(vfx, P, 800);
  const strandsAt = (t, g) => {
    const [x, y, z] = centre();
    const k = clamp01(t / secs);
    const n = 3 + Math.round(6 * k);
    const R = 2.6 - 1.1 * k;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = onSphere(g, R);
      out.push({ a: [x + p[0], Math.max(0.08, y + p[1] * 0.8), z + p[2]], b: [x, y, z], width: 0.035 + 0.025 * k, bright: 0.75 + 0.25 * k, jag: 0.18, branches: 1, minY: 0.06, phase: i, step: 0.25 });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.055);
  vfx.spawnMesh(field.group, secs, (o, u) => {
    const t = u * secs;
    const hot = rs.tick(t);
    field.set({ fade: clamp01(t / 0.1) * (0.6 + 0.4 * u), hot, reach: 1 });
  });
  rs.tick(0);
  const [x0, y0, z0] = centre();
  vfx.flashLight(x0, y0, z0, P[1], 8, secs, 5);
  arcSparks(vfx, P, { x: x0, y: y0, z: z0, n: 10, speed: 3, life: 0.3, gravity: -3, at: vfx.now + secs * 0.5, r: rng });
  return true;
}
