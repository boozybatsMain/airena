/**
 * Молния · ПОЛЕ РАЗРЯДОВ: материалы трёх слоёв ленты (рубашка, свечение,
 * ядро), инстансированная геометрия сегментов и генераторы нитей: ломаная
 * со смещением середин (`strandSegs`), явная ломаная (`polySegs`) и
 * ПУЧОК-КЛЕТКА (`bundleSegs`) — то, чем рисуется главный разряд луча.
 * Это единый примитив, на котором стоят все доставки (см. `../arc.js`).
 *
 * Замер эталона (Storm Lance, 1280×720, ~35 px/м): нить — ядро ~2 px чисто
 * белое, ореол 6–10 px насыщенно-синий, снаружи слабое широкое свечение.
 * На трансляционной дистанции (26 м, 46°, ~41 px/м поперёк) это ядро
 * полушириной ~0.02 м и ореол в пять ядер. Оба слоя — ОБЫЧНЫЙ блендинг:
 * на белом полу аддитивного не видно (§10.1), а аддитивные ядра полутора
 * десятков нитей, лёгших друг на друга с торца, складывались в HDR-столб,
 * который bloom размазывал на весь кадр. Ядро всегда лежит ПОВЕРХ синего
 * ореола — поэтому белая нить читается и на белом полу: белое на синем, а
 * не белое на белом; пересечения и клубок у цели белеют сами, потому что
 * там ядер больше, чем рубашек. Аддитивное только широкое свечение — оно
 * работает на тёмном фоне и телах.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { TIME, col, markGlow, pooled, withFade } from '../core.js';
import { TAU, clampN, hex } from './util.js';

const {
  float, vec3, vec4, uniform, mix, smoothstep, oneMinus, attribute,
  positionLocal, cameraProjectionMatrix, modelViewMatrix, cross, select, step, mx_noise_float,
} = TSL;

/* ── материалы разряда ──────────────────────────────────────────────────── */

/**
 * Множитель ширины слоя от ширины нити (полуширина ядра в метрах). Ядро
 * 0.022 м — 2 px с трансляции, рубашка 0.12 м — ~10 px синей полосы,
 * свечение 0.2 м — мягкий ореол, который виден только на тёмном.
 * Порядок: рубашка под свечением под ядром — ядро всегда сверху.
 */
const LAYER = {
  jacket: { mul: 5.5, order: 7, blend: THREE.NormalBlending },
  glow: { mul: 9.0, order: 9, blend: THREE.AdditiveBlending },
  core: { mul: 1.0, order: 10, blend: THREE.NormalBlending },
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
 *
 * Униформы: `fade` — общее затухание, `hot` — вспышка перестройки (1 в
 * момент перестройки, 0 через ~35 мс: ядро ярче в полтора раза, рубашка и
 * свечение шире на треть), `reach` — доля пути, до которой разряд дорос;
 * у фронта прорастания сегменты горят вдвое ярче (лидер).
 */
function makeBoltMat(layer, P) {
  const L = LAYER[layer];
  const m = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: L.blend,
  });
  const fade = withFade(m);
  const hot = uniform(0), reach = uniform(1);
  m.userData.u = { fade, hot, reach };

  const a = attribute('sa', 'vec3'), b = attribute('sb', 'vec3'), cfg = attribute('scfg', 'vec4');
  const along = positionLocal.x, across = positionLocal.y;
  const widen = layer === 'core' ? float(1) : hot.mul(0.35).add(1);
  const W = cfg.x.mul(L.mul).mul(widen);

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
     `reach` ещё не существуют; фронт — лидер — горит ярче. */
  const on = step(cfg.w, reach);
  const tip = select(reach.lessThan(1.0), smoothstep(reach.sub(0.18), reach, cfg.w), float(0));
  /* Мерцание ~25 Гц от часов: нить живёт между перестройками, а не стоит. */
  const flick = mx_noise_float(vec3(TIME.mul(23.0), cfg.z.mul(7.3), 0.7)).mul(0.2).add(0.9);
  const base = fade.mul(cfg.y).mul(on);

  if (layer === 'core') {
    /* Ядро — ОБЫЧНЫЙ блендинг, а не аддитивный. С трансляции пучок смотрит
       на камеру торцом, и полтора десятка нитей ложатся друг на друга: в
       аддитиве они складывались в HDR-столб, а bloom радиуса 0.85 размазывал
       его вуалью на весь кадр (снято в первом раунде). Белое поверх синего
       не складывается дальше белого; в bloom уходит половина. */
    m.colorNode = mix(col(P[0]).mul(1.1), vec3(1.45, 1.5, 1.6), mask.pow(1.2));
    const alpha = mask.pow(1.2).mul(base).mul(flick).mul(hot.mul(0.5).add(0.85)).mul(tip.add(1)).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.4));
  }
  if (layer === 'glow') {
    m.colorNode = mix(col(P[2]), col(P[1]), mask.pow(2.0).mul(0.5));
    const alpha = mask.pow(2.0).mul(0.15).mul(base).mul(hot.mul(0.6).add(0.8)).mul(tip.add(1)).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.1));
  }
  /* Рубашка: насыщенно-синяя, почти непрозрачная во внутренней половине
     ширины, мягкий край снаружи; мерцание её не трогает — форма стоит,
     пока мигает ядро. Именно она держит молнию на белом полу. */
  m.colorNode = mix(col(P[2]).mul(0.8), mix(col(P[2]), col(P[1]), 0.3), mask.pow(2.5));
  const solid = smoothstep(float(0.0), float(0.55), mask).mul(0.95);
  const alpha = solid.mul(base).mul(tip.mul(0.3).add(1)).clamp(0, 1);
  m.opacityNode = alpha;
  return markGlow(m, alpha.mul(0.08));
}

/* ── поле разрядов ──────────────────────────────────────────────────────── */

/** Раскладка инстанса: a×3, b×3, cfg×4 (ширина, яркость, фаза, u вдоль). */
const STRIDE = 10;

/**
 * Поле: одна инстансированная геометрия сегментов и три меша на ней (три
 * слоя). Нити переписываются целиком на каждой перестройке — `write(items,
 * rng)`; элемент списка — нить (`a`, `b`, см. `strandSegs`), явная ломаная
 * (`pts`, см. `polySegs`) или пучок (`bundle: true`, см. `bundleSegs`).
 * У элемента может быть свой генератор `rng` — так след на полу держит
 * форму между перестройками. `set({fade, hot, reach})` — униформы слоёв.
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
    write(items, rng) {
      n = 0;
      for (const s of items) {
        const r = s.rng || rng;
        if (s.bundle) bundleSegs(s, r, put);
        else if (s.pts) polySegs(s, put);
        else strandSegs(s, r, put, 0);
      }
      geo.instanceCount = n;
      ibuf.needsUpdate = true;
      if (ibuf.clearUpdateRanges) ibuf.clearUpdateRanges();
      if (ibuf.addUpdateRange) ibuf.addUpdateRange(0, Math.max(1, n) * STRIDE);
    },
    set({ fade = 1, hot = 0, reach = 1 }) {
      for (const m of mats) { m.userData.u.fade.value = fade; m.userData.u.hot.value = hot; m.userData.u.reach.value = reach; }
    },
    /** Сколько сегментов легло в последнюю запись (для подбора бюджета). */
    count() { return n; },
  };
  field.set({});
  return field;
}

/**
 * Явная ломаная: `pts` — точки, `u` вдоль — линейно от `u0` к `u1` по
 * номеру вершины (или массив `us` по точкам).
 */
function polySegs(s, put) {
  const pts = s.pts;
  const N = pts.length - 1;
  if (N < 1) return;
  const u0 = s.u0 ?? 0, u1 = s.u1 ?? 1;
  const width = s.width ?? 0.03, bright = s.bright ?? 1, phase = s.phase ?? 0;
  for (let i = 0; i < N; i++) {
    const p = pts[i], q = pts[i + 1];
    const u = s.us ? s.us[i + 1] : u0 + ((u1 - u0) * (i + 1)) / N;
    put(p[0], p[1], p[2], q[0], q[1], q[2], width, bright, phase, u);
  }
}

/**
 * ПУЧОК-КЛЕТКА — главный разряд эталона. Из одной точки `a` расходятся `n`
 * нитей в трубу-конус (радиус `r0` у руки → `r1` у цели), каждая — ломаная
 * с звеньями ~`step` и изломами 30–60°: нить одновременно плывёт по своему
 * кругу (угол и радиус в сечении меняются с собственными фазами — нити
 * сходятся и расходятся, ПЕРЕСЕКАЯСЬ) и дёргается на каждом узле. Между
 * нитями — перемычки (`rungs` на шаг), и сеть читается как многоугольные
 * ячейки; от нитей — обрубки в пустоту (`stubs` — доля нитей с обрубком);
 * у дальнего конца — клубок коротких нитей (`tangle` 0..1 — плотность).
 * Весь пучок чуть выгнут одной дугой (`bend` — доля длины).
 *
 * Замер эталона (1280×720): 12–20 нитей, звенья 0.3–0.6 м, изломы 30–60°,
 * труба 0.8–1.4 м, дальний конец — белый клубок. Здесь ~450 сегментов на
 * 9 м при `n` 15.
 *
 * `u` вдоль (для `reach`) — доля пути по оси; клубок — у `u1`.
 */
function bundleSegs(s, rng, put) {
  const [ax, ay, az] = s.a, [bx, by, bz] = s.b;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const L = Math.hypot(dx, dy, dz);
  if (L < 0.2) return;
  const ux = dx / L, uy = dy / L, uz = dz / L;
  /* Базис сечения: e1 — горизонтальный бок, e2 = u × e1 — почти вверх. */
  let e1x = -uz, e1y = 0, e1z = ux;
  const e1l = Math.hypot(e1x, e1z);
  if (e1l < 1e-3) { e1x = 1; e1z = 0; } else { e1x /= e1l; e1z /= e1l; }
  const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;

  const n = clampN(Math.round(s.n ?? 12), 2, 40);
  const step = s.step ?? 0.42;
  const K = clampN(Math.round(L / step), 3, 64);
  const r0 = s.r0 ?? 0.1, r1 = s.r1 ?? 0.6;
  const minY = s.minY ?? 0.08;
  const width = s.width ?? 0.03, bright = s.bright ?? 1, phase = s.phase ?? 0;
  const u0 = s.u0 ?? 0, u1 = s.u1 ?? 1;
  const jump = step * (s.kink ?? 0.7);
  /* Изгиб пучка: одна дуга в случайном направлении сечения. */
  const bAng = rng() * TAU, bAmp = (s.bend ?? 0.04) * L * (0.5 + rng());
  const bc1 = Math.cos(bAng) * bAmp, bc2 = Math.sin(bAng) * bAmp;
  const R = (t) => r0 + (r1 - r0) * Math.pow(t, 0.75);
  const at = (t, p, q) => {
    const bow = Math.sin(Math.PI * t);
    const lx = p + bc1 * bow, ly = q + bc2 * bow;
    return [
      ax + ux * L * t + e1x * lx + e2x * ly,
      Math.max(minY, ay + uy * L * t + e1y * lx + e2y * ly),
      az + uz * L * t + e1z * lx + e2z * ly,
    ];
  };

  /* Узлы нитей: pts[i][k]; ts[i][k] — доля пути по оси. */
  const pts = new Array(n), ts = new Array(n);
  for (let i = 0; i < n; i++) {
    const th0 = rng() * TAU, om = (rng() - 0.5) * 3.0 * Math.PI;
    const ph = rng() * TAU, kap = (1.5 + rng() * 2.5) * Math.PI;
    /* Треть нитей обрывается раньше цели — рваный дальний край. */
    const endT = i < n * 0.66 ? 1 : 0.78 + rng() * 0.2;
    const Ki = Math.max(2, Math.round(K * endT));
    const P = [], T = [];
    for (let k = 0; k <= Ki; k++) {
      let t = (k / Ki) * endT;
      if (k > 0 && k < Ki) t += ((rng() - 0.5) * 0.4) / K;
      const rr = R(t) * Math.pow(0.15 + 0.85 * Math.abs(Math.sin(ph + kap * t)), 0.8);
      const th = th0 + om * t;
      let p = rr * Math.cos(th), q = rr * Math.sin(th);
      if (k > 0) {
        p += (rng() - 0.5) * 2 * jump * 0.5;
        q += (rng() - 0.5) * 2 * jump * 0.5;
        const lim = R(t) * 1.15;
        const ll = Math.hypot(p, q);
        if (ll > lim) { p *= lim / ll; q *= lim / ll; }
      }
      P.push(at(t, p, q));
      T.push(t);
    }
    pts[i] = P; ts[i] = T;
  }

  const uAt = (t) => u0 + (u1 - u0) * t;
  /* Нити: две первые — «герои», шире и ярче; остальные чуть разные. */
  for (let i = 0; i < n; i++) {
    const hero = i < 2;
    const w = width * (hero ? 1.35 : 0.85 + rng() * 0.3);
    const k = bright * (hero ? 1 : 0.8 + rng() * 0.2);
    const P = pts[i], T = ts[i];
    for (let j = 0; j + 1 < P.length; j++) {
      const p = P[j], q = P[j + 1];
      put(p[0], p[1], p[2], q[0], q[1], q[2], w, k, phase + i, uAt(T[j + 1]));
    }
  }

  /* Перемычки: на каждом шаге пара нитей, если их узлы не дальше метра. */
  const rungs = s.rungs ?? 1.0;
  for (let k = 2; k < K; k++) {
    let tries = Math.floor(rungs) + (rng() < rungs % 1 ? 1 : 0);
    while (tries-- > 0) {
      const i = Math.floor(rng() * n), j = Math.floor(rng() * n);
      if (i === j) continue;
      const kj = clampN(k + Math.floor(rng() * 3) - 1, 1, K);
      const p = pts[i][Math.min(k, pts[i].length - 1)], q = pts[j][Math.min(kj, pts[j].length - 1)];
      const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (d < 0.12 || d > 1.0) continue;
      const m = [
        (p[0] + q[0]) * 0.5 + (rng() - 0.5) * 0.24,
        Math.max(minY, (p[1] + q[1]) * 0.5 + (rng() - 0.5) * 0.24),
        (p[2] + q[2]) * 0.5 + (rng() - 0.5) * 0.24,
      ];
      const w = width * 0.75, kb = bright * 0.85, u = uAt(ts[i][Math.min(k, ts[i].length - 1)]);
      put(p[0], p[1], p[2], m[0], m[1], m[2], w, kb, phase + 40 + k, u);
      put(m[0], m[1], m[2], q[0], q[1], q[2], w, kb, phase + 40 + k, u);
    }
  }

  /* Обрубки: от узла нити под 35–65° к касательной, 0.3–0.8 м, с изломом. */
  const stubs = s.stubs ?? 0.5;
  for (let i = 0; i < n; i++) {
    if (rng() >= stubs) continue;
    const P = pts[i];
    if (P.length < 4) continue;
    const k = 1 + Math.floor(rng() * (P.length - 3));
    const p = P[k];
    let tx = P[k + 1][0] - P[k - 1][0], ty = P[k + 1][1] - P[k - 1][1], tz = P[k + 1][2] - P[k - 1][2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    let nx = rng() * 2 - 1, ny = rng() * 2 - 1, nz = rng() * 2 - 1;
    const dn = nx * tx + ny * ty + nz * tz;
    nx -= tx * dn; ny -= ty * dn; nz -= tz * dn;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const ang = (35 + rng() * 30) * (Math.PI / 180);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const len = 0.3 + rng() * 0.5;
    const dxs = tx * ca + nx * sa, dys = ty * ca + ny * sa, dzs = tz * ca + nz * sa;
    /* второй перпендикуляр для излома посередине */
    const cx = ty * nz - tz * ny, cy = tz * nx - tx * nz, cz = tx * ny - ty * nx;
    const kk = (rng() - 0.5) * 0.5 * len;
    const m = [p[0] + dxs * len * 0.5 + cx * kk, Math.max(minY, p[1] + dys * len * 0.5 + cy * kk), p[2] + dzs * len * 0.5 + cz * kk];
    const q = [p[0] + dxs * len, Math.max(minY, p[1] + dys * len), p[2] + dzs * len];
    const w = width * 0.65, kb = bright * 0.75, u = uAt(ts[i][k]);
    put(p[0], p[1], p[2], m[0], m[1], m[2], w, kb, phase + 80 + i, u);
    put(m[0], m[1], m[2], q[0], q[1], q[2], w, kb, phase + 80 + i, u);
  }

  /* Клубок у цели: короткие нити внутри шара радиуса r1 — белая путаница. */
  const tangle = s.tangle ?? 1;
  const m = Math.round(n * 0.7 * tangle);
  const [cx, cy, cz] = at(1, 0, 0);
  const rt = r1 * 0.95;
  for (let i = 0; i < m; i++) {
    let px = cx + (rng() - 0.5) * 2 * rt, py = Math.max(minY, cy + (rng() - 0.5) * 2 * rt * 0.8), pz = cz + (rng() - 0.5) * 2 * rt;
    const segs = 2 + Math.floor(rng() * 2);
    const w = width * (0.8 + rng() * 0.3), kb = bright * 1.05;
    for (let j = 0; j < segs; j++) {
      const l = 0.22 + rng() * 0.3;
      let qx = px + (rng() - 0.5) * 2 * l, qy = py + (rng() - 0.5) * 2 * l * 0.8, qz = pz + (rng() - 0.5) * 2 * l;
      const ox = qx - cx, oy = qy - cy, oz = qz - cz;
      const ol = Math.hypot(ox, oy, oz);
      if (ol > rt) { qx = cx + (ox * rt) / ol; qy = cy + (oy * rt) / ol; qz = cz + (oz * rt) / ol; }
      qy = Math.max(minY, qy);
      put(px, py, pz, qx, qy, qz, w, kb, phase + 120 + i, u1);
      px = qx; py = qy; pz = qz;
    }
  }
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

export { LAYER, STRIDE, boltMat, boltField, strandSegs, polySegs, bundleSegs };
