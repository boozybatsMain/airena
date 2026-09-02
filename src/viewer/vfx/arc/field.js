/**
 * Молния · ПОЛЕ РАЗРЯДОВ: материалы трёх слоёв ленты (рубашка, свечение,
 * ядро), инстансированная геометрия сегментов и генератор нитей. Это единый
 * примитив, на котором стоят все доставки (см. `../arc.js`).
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { TIME, col, markGlow, pooled, withFade } from '../core.js';
import { clampN, hex } from './util.js';

const {
  float, vec3, vec4, uv, uniform, mix, smoothstep, oneMinus, abs: tabs, attribute,
  positionLocal, normalLocal, normalView, positionViewDirection, cameraProjectionMatrix,
  modelViewMatrix, cross, select, step, mx_noise_float, mx_fractal_noise_float,
} = TSL;

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

export { LAYER, STRIDE, boltMat, boltField, strandSegs };
