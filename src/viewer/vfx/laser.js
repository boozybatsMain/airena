/**
 * Лазер — штатный луч для элементов без своего модуля (кинетика, пустота).
 * Эталон: Nova Beam из песочницы основателя (reports/vfx/reference/ref-nova-*),
 * планка — Path of Exile 2.
 *
 * Что видно в эталоне (замер по кадрам 1280×720, ~35 px/м):
 *   · ШАР КАСТА у руки ~1.2 м: гранёный, зернистый, полупрозрачный, с ярким
 *     ядром; стоит весь каст (150 и 450 мс — только шар: долгий замах);
 *   · ТЕЛО ЛУЧА — прозрачный бледный цилиндр ~0.9 м в диаметре, ярче на оси,
 *     с продольными штрихами, как подсвеченный туман; края размыты;
 *   · ЛЕНТЫ — 4–6 ярких (белое ядро, цветной кант) винтом вокруг трубы на
 *     радиусе ~0.55 м, шаг ~1.8 м, ~10–14 px шириной с bloom; крутятся и
 *     ползут к цели; за точкой удара распускаются в хлысты 2–4 м;
 *   · КОЛЬЦА — тонкие белые, радиус ~0.8 м, поперёк оси через ~0.7 м, бегут
 *     к цели; тонкая яркая линия с мягким ореолом;
 *   · КУПОЛ у цели ~2.5 м: гранёный, полупрозрачный, с ярким ядром, ленты
 *     расходятся из него;
 *   · ПОЛ — ковёр мелких искрящихся точек под всем путём от кастера до цели,
 *     живёт после луча.
 *
 * Сим решает луч мгновенно (`e.hit`, `x1,z1`), поэтому картинка — удержанный
 * залп по таймлайну `T`: шар 0.15 с → луч вырастает за 0.1 с → держится
 * ~0.75 с → гаснет 0.3 с; купол до конца луча; точки на полу ~2 с.
 *
 * Пол арены белый (§10.1): труба, кольца и ленты держат форму на нём
 * НОРМАЛЬНО-блендящимся тёмным слоем (рубашка ленты из P[2], френелевый
 * обод трубы), а аддитивные слои дают свечение на тёмном фоне и телах — тот
 * же урок, что у молнии (`arc/field.js`). Ленты и кольца — один
 * инстансированный буфер сегментов, переписываемый КАЖДЫЙ кадр (винт
 * крутится, кольца бегут): ~1.5 тыс. сегментов на 9 м — это десятки
 * килобайт на кадр, дешевле любой перестройки материала.
 *
 * Детерминизм (A2): всё случайное — от `mulberry(seedOf(e))`; вращение и бег
 * колец — от возраста эффекта, не от часов страницы.
 * Размер — параметр: число лент, колец, точек — от длины и площади следа.
 * TSL, ни строки GLSL; материалы — из кольца `pooled`, геометрии общие.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { TIME, clamp01, col, easeOutCubic, markGlow, mulberry, pooled, seedOf, shared, withFade } from './core.js';
import * as kit from './kit.js';
import { TAU, clampN, hex } from './arc/util.js';
import { floorRing, spikes } from './arc/common.js';

const {
  float, vec3, vec4, uv, uniform, mix, smoothstep, oneMinus, abs: tabs, attribute,
  positionLocal, normalLocal, normalView, normalWorld, positionWorld, cameraPosition, positionViewDirection,
  cameraProjectionMatrix, modelViewMatrix, cross, select, step, mx_noise_float, mx_fractal_noise_float, min: tmin,
} = TSL;

/** Тайминги, секунды от каста (см. шапку). */
const T = { out0: 0.15, out1: 0.25, full: 1.0, off: 1.3, orbEnd: 1.4, residue: 2.2 };

/* ── ленты и кольца: слои сегментной ленты ─────────────────────────────── */

/**
 * Множитель ширины слоя от полуширины ядра сегмента (метры). Лента эталона
 * ~10–14 px с bloom при 35 px/м — то есть ~0.35 м вместе с ореолом: ядро
 * 0.05 м (4 px с трансляции), рубашка ×3.6 — 0.36 м полосы цвета, свечение
 * ×6.5 — мягкий ореол только на тёмном. Порядок: рубашка → свечение → ядро.
 * Первый раунд: рубашка, плотная только у ядра, на белом полу исчезала под
 * bloom ядра, и лента читалась проволокой — теперь она плотная на две трети
 * ширины, а в bloom от ядра уходит треть.
 */
const LAYER = {
  jacket: { mul: 3.6, order: 7, blend: THREE.NormalBlending },
  glow: { mul: 6.5, order: 9, blend: THREE.AdditiveBlending },
  core: { mul: 1.0, order: 10, blend: THREE.NormalBlending },
};
/** Раскладка инстанса: a×3, b×3, cfg×4 (полуширина, яркость, фаза, u вдоль). */
const STRIDE = 10;

function ribbonMat(layer, P) {
  return pooled(`laser:rib:${layer}:${hex(P)}`, () => makeRibbonMat(layer, P), 6);
}

/**
 * Лента сегмента — тот же приём, что у поля разрядов молнии: инстанс — один
 * отрезок `sa`→`sb`, квад разворачивается к камере в пространстве вида по
 * `cross(касательная, взгляд)`, в пикселе — капсула по расстоянию до отрезка.
 * Униформы: `fade` — общее затухание, `reach` — доля пути, до которой луч
 * дорос (сегменты дальше ещё не существуют).
 */
function makeRibbonMat(layer, P) {
  const L = LAYER[layer];
  const m = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: L.blend,
  });
  const fade = withFade(m);
  const reach = uniform(1);
  m.userData.u = { fade, reach };

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

  const lenW = b.sub(a).length();
  const alongM = along.mul(lenW.add(W.mul(2))).sub(W);
  const dEnd = alongM.negate().max(alongM.sub(lenW)).max(0);
  const dAcross = across.abs().mul(W);
  const d = dEnd.mul(dEnd).add(dAcross.mul(dAcross)).sqrt().div(W.max(1e-4));
  const mask = oneMinus(d).clamp(0, 1);
  const on = step(cfg.w, reach);
  const base = fade.mul(cfg.y).mul(on);

  if (layer === 'core') {
    /* Ядро — обычный блендинг: белое поверх цветной рубашки читается и на
       белом полу; HDR выше единицы уходит в bloom по метке. */
    m.colorNode = mix(col(P[0]).mul(1.1), vec3(1.6, 1.62, 1.7), mask.pow(1.2));
    const alpha = mask.pow(1.2).mul(base).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.35));
  }
  if (layer === 'glow') {
    m.colorNode = mix(col(P[2]), col(P[1]), mask.pow(1.5));
    const alpha = mask.pow(2.0).mul(0.2).mul(base).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.1));
  }
  /* Рубашка: цвет элемента, плотная во внутренней половине, мягкий край.
     Именно она держит ленту на белом полу. */
  m.colorNode = mix(col(P[2]).mul(0.65), col(P[2]).mul(0.95), mask);
  const solid = smoothstep(float(0.0), float(0.4), mask).mul(0.9);
  const alpha = solid.mul(base).clamp(0, 1);
  m.opacityNode = alpha;
  return markGlow(m, alpha.mul(0.06));
}

/**
 * Поле сегментов: одна инстансированная геометрия, три меша (три слоя).
 * Пишется целиком каждый кадр: `begin()` → `put(...)`/`ring(...)` → `end()`.
 */
function segField(vfx, P, maxSeg) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
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
    const m = ribbonMat(layer, P);
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = LAYER[layer].order;
    group.add(mesh);
    mats.push(m);
  }
  let n = 0;
  return {
    group,
    begin() { n = 0; },
    put(ax, ay, az, bx, by, bz, w, k, phase, u) {
      if (n >= maxSeg) return;
      const o = n * STRIDE;
      arr[o] = ax; arr[o + 1] = ay; arr[o + 2] = az;
      arr[o + 3] = bx; arr[o + 4] = by; arr[o + 5] = bz;
      arr[o + 6] = w; arr[o + 7] = k; arr[o + 8] = phase; arr[o + 9] = u;
      n++;
    },
    end() {
      geo.instanceCount = n;
      ibuf.needsUpdate = true;
      if (ibuf.clearUpdateRanges) ibuf.clearUpdateRanges();
      if (ibuf.addUpdateRange) ibuf.addUpdateRange(0, Math.max(1, n) * STRIDE);
    },
    set(fade, reach) {
      for (const m of mats) { m.userData.u.fade.value = fade; m.userData.u.reach.value = reach; }
    },
  };
}

/* ── тело луча: труба ──────────────────────────────────────────────────── */

let TUBE_GEO = null;
function tubeGeo() {
  if (!TUBE_GEO) {
    TUBE_GEO = shared(new THREE.CylinderGeometry(1, 1, 1, 28, 1, true));
    TUBE_GEO.translate(0, 0.5, 0);
  }
  return TUBE_GEO;
}

/**
 * Труба: ярче на оси (нормаль смотрит на камеру), к силуэту — френелевый
 * обод цвета P[2] обычным блендингом, чтобы на белом полу у трубы были
 * края; вдоль ствола — продольные штрихи шумом, бегущие к цели. `span` —
 * длина в метрах, чтобы плотность штрихов не зависела от длины луча.
 */
function tubeMat(P) {
  return pooled(`laser:tube:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const span = uniform(10);
    m.userData.u = { fade, span };
    const V = cameraPosition.sub(positionWorld).normalize();
    const facing = normalWorld.dot(V).abs().clamp(0, 1);
    const along = uv().y.mul(span);
    const streak = mx_fractal_noise_float(vec3(uv().x.mul(9.0), along.mul(0.9).sub(TIME.mul(7.0)), 2.0), 2, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const body = facing.pow(1.3);
    const hot = facing.pow(5.0).mul(streak.mul(0.7).add(0.3));
    const rim = oneMinus(facing).pow(1.8);
    m.colorNode = mix(mix(col(P[2]).mul(0.8), col(P[0]), body), vec3(1.25, 1.28, 1.35), hot.mul(0.8));
    const alpha = body.mul(streak.mul(0.45).add(0.3)).mul(0.55).add(rim.mul(0.7)).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, hot.mul(fade).mul(0.3).clamp(0, 1));
  }, 4);
}

/* ── кристалл: шар каста и купол удара ─────────────────────────────────── */

const FACET_GEO = {};
/**
 * Икосфера без индекса: после `computeVertexNormals` нормали плоские на
 * грань — гранёный шар без освещения. Атрибут `bary` — барицентрические
 * координаты вершины в своём треугольнике: по ним шейдер рисует РЁБРА
 * граней (эталон: у купола видны светлые кромки многоугольников).
 * `detail` 2 — 80 граней (купол ~0.5 м на грань), 3 — 320 (шар у руки).
 */
function facetGeo(detail = 3) {
  if (!FACET_GEO[detail]) {
    const g = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
    g.computeVertexNormals();
    const n = g.attributes.position.count;
    const bary = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) bary[i * 3 + (i % 3)] = 1;
    g.setAttribute('bary', new THREE.BufferAttribute(bary, 3));
    FACET_GEO[detail] = shared(g);
  }
  return FACET_GEO[detail];
}
let SPHERE_GEO = null;
function sphereGeo() {
  if (!SPHERE_GEO) SPHERE_GEO = shared(new THREE.IcosahedronGeometry(1, 3));
  return SPHERE_GEO;
}

/**
 * Гранёный полупрозрачный шар (эталон: шар у руки и купол у цели). Обычный
 * блендинг: середина — бело-горячая, к краю — P[1], на самом ободе — P[2]
 * (обод и делает белый шар видимым на белом полу). Грань — своя яркость
 * (шум от плоской нормали постоянен по грани), зерно плывёт по телу,
 * прожилки P[1] ползут по поверхности.
 */
function crystalMat(P) {
  return pooled(`laser:crystal:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const seed = uniform(0), hotK = uniform(1), edgeW = uniform(0.08);
    m.userData.u = { fade, seed, hotK, edgeW };
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    const facet = mx_noise_float(normalLocal.mul(3.1).add(seed)).mul(0.5).add(0.5).pow(1.6);
    /* Рёбра граней: расстояние до края треугольника в барицентрических. */
    const bary = attribute('bary', 'vec3');
    const edge = oneMinus(smoothstep(float(0.0), edgeW, tmin(bary.x, tmin(bary.y, bary.z))));
    const grain = smoothstep(float(0.3), float(0.8), mx_noise_float(positionLocal.mul(13.0).add(vec3(seed, TIME.mul(0.8), 0))).mul(0.5).add(0.5));
    const vn = mx_fractal_noise_float(normalLocal.mul(2.4).add(vec3(TIME.mul(0.9), seed, 0)), 2, 2.0, 0.5, 1);
    const veins = oneMinus(smoothstep(float(0.0), float(0.07), tabs(vn)));
    const body = oneMinus(fres).pow(1.2);
    const white = vec3(1.35, 1.37, 1.45);
    const base = mix(col(P[1]), col(P[0]), facet.mul(0.6).add(0.3));
    /* Обод — затемнённый P[2]: без него белый шар на белом полу — ничто. */
    const rimC = mix(col(P[2]).mul(0.7), col(P[1]), oneMinus(fres.pow(1.6)).mul(0.5));
    let colour = mix(rimC, base, body);
    colour = mix(colour, white, body.mul(hotK).mul(facet.mul(0.5).add(0.4)).clamp(0, 1));
    colour = mix(colour, col(P[1]), veins.mul(0.5));
    /* Кромки — светлые (P[1] → HDR-белое к середине шара): на тёмном фоне
       светятся, на белом полу читаются как светло-серые линии. */
    const edgeC = mix(col(P[1]), vec3(1.3, 1.32, 1.4), body.mul(0.7));
    colour = mix(colour, edgeC, edge.mul(0.85));
    m.colorNode = colour;
    const alpha = body.mul(grain.mul(0.45).add(0.55)).mul(facet.mul(0.6).add(0.45)).mul(0.85)
      .add(fres.pow(1.4).mul(0.55)).add(veins.mul(0.25)).add(edge.mul(0.55)).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, body.mul(hotK).mul(alpha).mul(0.4).add(edge.mul(body).mul(0.3)).mul(fade).clamp(0, 1));
  }, 6);
}

/** Горячее ядро: аддитивный HDR-белый шарик с френелевым спадом. */
function hotMat(P) {
  return pooled(`laser:hot:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending });
    const fade = withFade(m);
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    const body = oneMinus(fres).pow(1.5);
    m.colorNode = mix(col(P[1]), vec3(1.6, 1.62, 1.7), body);
    const alpha = body.mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.8));
  }, 6);
}

/** Огибающая: 0 до `at`, рост `grow` с замедлением, полная до `hold`, гаснет к `life`. */
function envelope(t, at, grow, hold, life) {
  if (t < at) return { r: 0, f: 0 };
  const r = easeOutCubic(clamp01((t - at) / Math.max(0.01, grow)));
  const f = t < hold ? 1 : Math.pow(Math.max(0, 1 - (t - hold) / Math.max(0.01, life - hold)), 1.3);
  return { r, f };
}

/**
 * Кристалл с ядром: от `at` растёт с `r0` до `r1` за `grow`, держится до
 * `hold`, гаснет к `life`. `core` — радиус горячего ядра внутри.
 */
function crystal(vfx, P, { x, y, z, at = 0, r0 = 0.1, r1 = 0.6, grow = 0.15, hold, life, squash = 1, seed = 1, hot = 1, core = 0, detail = 3, edge = 0.08 }) {
  const m = crystalMat(P);
  m.userData.u.seed.value = seed; m.userData.u.hotK.value = hot; m.userData.u.edgeW.value = edge;
  const mesh = new THREE.Mesh(facetGeo(detail), m);
  mesh.position.set(x, y, z);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.scale.setScalar(0.001);
  let hc = null;
  if (core > 0) {
    hc = new THREE.Mesh(sphereGeo(), hotMat(P));
    hc.renderOrder = 11;
    hc.frustumCulled = false;
    mesh.add(hc);
  }
  vfx.spawnMesh(mesh, life, (o, k) => {
    const t = k * life;
    const { r, f } = envelope(t, at, grow, hold, life);
    const R = Math.max(0.001, r0 + (r1 - r0) * r);
    o.scale.set(R, R * squash, R);
    m.userData.u.fade.value = f;
    if (hc) {
      /* Ядро дышит ~9 Гц и живёт в масштабе родителя. */
      const cr = (core / R) * (0.92 + 0.08 * Math.sin(t * 57));
      hc.scale.setScalar(Math.max(0.001, cr));
      hc.material.userData.fade.value = f;
    }
  });
  return mesh;
}

/**
 * Удержанный свет: вспышка из пула, у которой рождение сдвигается вперёд,
 * пока луч горит — квадратичный спад набора начинается только после `hold`.
 * Если источник забрал другой эффект (его `born` изменился), отпускаем.
 */
function holdLight(vfx, x, y, z, colour, intensity, hold, tail, radius) {
  vfx.flashLight(x, y, z, colour, intensity, tail, radius);
  const ls = vfx.lights;
  if (!ls || !ls.length) return () => {};
  const l = ls[(vfx.lightHead - 1 + ls.length) % ls.length];
  let mine = l.userData.born;
  const t0 = vfx.now;
  return () => {
    if (l.userData.born !== mine) return;
    if (vfx.now - t0 < hold) { mine = vfx.now; l.userData.born = mine; }
  };
}

/* ── луч ───────────────────────────────────────────────────────────────── */

export function beam(vfx, e, P, ctx) {
  const fp = kit.footprint(e, ctx);
  const len = fp.len;
  if (!(len > 0.3)) return false;
  const seed = (seedOf(e) ^ 0x1a5e) >>> 0;
  const rng = mulberry(seed);
  const hit = e.hit !== false;
  const A = [e.x0, 1.15, e.z0], B = [e.x1, 1.15, e.z1];
  const ux = (B[0] - A[0]) / len, uz = (B[2] - A[2]) / len;
  const sx = -uz, sz = ux;
  const REF = kit.REF_AREA.beam;

  /* Геометрия винта: 5 лент на 9 м (эталон 4–6), радиус 0.55, шаг 1.8 м,
     1.8 об/с — лента ползёт к цели ~3.2 м/с. Кольца через 0.7 м, бегут
     5.5 м/с. */
  const nRib = clampN(Math.round(2.5 + len * 0.28), 4, 6);
  const RIB_R = 0.55, PITCH = 1.8, OMEGA = TAU * 1.8;
  const ribs = [];
  for (let i = 0; i < nRib; i++) {
    /* У каждой ленты свой радиус и шаг (±15 %): ленты разных шагов
       пересекаются, и винт читается живым, а не намотанной проволокой. */
    ribs.push({
      th0: (i / nRib) * TAU + rng() * 0.5, ph: rng() * TAU,
      r: RIB_R * (0.8 + rng() * 0.4), pitch: PITCH * (0.85 + rng() * 0.3), breathe: 0.12 + rng() * 0.12,
      whip: 2 + rng() * 2, curl: 1.6 + rng() * 2.2, lift: 0.3 + rng() * 0.6, w: 0.05 + rng() * 0.012,
    });
  }
  const K = clampN(Math.round(len * 16), 24, 400);
  const KW = 30;
  const nRing = clampN(Math.round(len / 0.7), 3, 40);
  const RING_R = 0.82, RING_V = 5.5, RING_N = 28;
  const maxSeg = nRib * (K + KW) + nRing * RING_N + 8;
  const field = segField(vfx, P, maxSeg);

  const pa = [0, 0, 0], pb = [0, 0, 0];
  const helix = (rb, t, time, out) => {
    const th = rb.th0 + t * len * (TAU / rb.pitch) + OMEGA * time;
    /* Лента выходит из шара: радиус 0.12 → полный за первые 0.7 м. */
    const emerge = clamp01((t * len) / 0.7);
    const r = (0.12 + (rb.r - 0.12) * emerge) * (1 - rb.breathe * 0.5 + rb.breathe * 0.5 * Math.sin(t * len * 1.7 + rb.ph + time * 3.0));
    const ax = t * len;
    out[0] = A[0] + ux * ax + sx * r * Math.cos(th);
    out[1] = A[1] + r * Math.sin(th);
    out[2] = A[2] + uz * ax + sz * r * Math.cos(th);
  };
  /* Хлыст за точкой удара: продолжает вращение, закручивается сильнее,
     радиус растёт до ~2 м, вперёд идёт всё медленнее — загибается. */
  const whip = (rb, s, time, out) => {
    const th = rb.th0 + len * (TAU / rb.pitch) + OMEGA * time + s * rb.curl * (1 + s);
    const r = rb.r + 1.6 * Math.pow(s, 0.8);
    const ax = len + rb.whip * s * (0.85 - 0.45 * s);
    out[0] = A[0] + ux * ax + sx * r * Math.cos(th);
    out[1] = Math.max(0.1, A[1] + r * Math.sin(th) * 0.65 + rb.lift * s);
    out[2] = A[2] + uz * ax + sz * r * Math.cos(th);
  };

  const writeField = (t, reach, k) => {
    field.begin();
    const time = t;
    for (let i = 0; i < nRib; i++) {
      const rb = ribs[i];
      const kMax = Math.min(K, Math.ceil(K * reach));
      helix(rb, 0, time, pa);
      for (let j = 1; j <= kMax; j++) {
        const tt = j / K;
        helix(rb, tt, time, pb);
        /* Яркость бежит к цели волнами — лента «скользит», не только крутится. */
        const pulse = 0.72 + 0.28 * Math.sin(tt * len * 2.6 - time * 9.0 + rb.ph);
        const w = rb.w * (0.75 + 0.25 * tt);
        field.put(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], w, pulse * k, i, tt);
        pa[0] = pb[0]; pa[1] = pb[1]; pa[2] = pb[2];
      }
      if (reach >= 1) {
        whip(rb, 0, time, pa);
        for (let j = 1; j <= KW; j++) {
          const s = j / KW;
          whip(rb, s, time, pb);
          const w = rb.w * (1 - 0.55 * s);
          const kb = Math.pow(1 - s, 0.9) * 0.95 * k;
          field.put(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], w, kb, i, 1);
          pa[0] = pb[0]; pa[1] = pb[1]; pa[2] = pb[2];
        }
      }
    }
    /* Кольца: бегут к цели, растворяются у шара и у купола. */
    for (let q = 0; q < nRing; q++) {
      const ax = ((q / nRing) * len + RING_V * time) % len;
      const kk = clamp01(ax / 0.8) * clamp01((len - 0.5 - ax) / 0.9);
      if (kk <= 0.02) continue;
      const rr = RING_R * (0.94 + 0.06 * Math.sin(time * 7 + q * 1.7));
      const cx = A[0] + ux * ax, cz = A[2] + uz * ax;
      const u = ax / len;
      let px = cx + sx * rr, py = A[1], pz = cz + sz * rr;
      for (let j = 1; j <= RING_N; j++) {
        const phi = (j / RING_N) * TAU;
        const qx = cx + sx * rr * Math.cos(phi), qy = A[1] + rr * Math.sin(phi), qz = cz + sz * rr * Math.cos(phi);
        field.put(px, py, pz, qx, qy, qz, 0.012, 0.6 * kk * k, 100 + q, u);
        px = qx; py = qy; pz = qz;
      }
    }
    field.end();
  };

  /* Огибающая луча: рост 0.08 с после выхода, полная до `full`, гаснет к `off`. */
  const envK = (t) => {
    if (t < T.out0) return 0;
    const inK = clamp01((t - T.out0) / 0.08);
    const outK = t < T.full ? 1 : Math.pow(clamp01(1 - (t - T.full) / (T.off - T.full)), 1.3);
    return inK * outK;
  };

  /* Труба тела. */
  const tube = new THREE.Mesh(tubeGeo(), tubeMat(P));
  tube.material.userData.u.span.value = len;
  tube.position.set(A[0], A[1], A[2]);
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ux, 0, uz));
  tube.renderOrder = 5;
  tube.frustumCulled = false;
  tube.scale.set(0.001, 0.001, 0.001);
  const TUBE_R = 0.45;

  const state = { hit: false, lightA: null, lightB: null };
  vfx.spawnMesh(field.group, T.off, (o, u) => {
    const t = u * T.off;
    const k = envK(t);
    const reach = t < T.out0 ? 0 : clamp01((t - T.out0) / (T.out1 - T.out0));
    if (k <= 0) { field.set(0, 0); return; }
    writeField(t, reach, k);
    field.set(1, reach + 0.001);
    if (state.lightA) state.lightA();
    if (state.lightB) state.lightB();
    if (!state.hit && t >= T.out1) { state.hit = true; onHit(); }
  });
  vfx.spawnMesh(tube, T.off, (o, u) => {
    const t = u * T.off;
    const k = envK(t);
    const reach = t < T.out0 ? 0 : clamp01((t - T.out0) / (T.out1 - T.out0));
    const r = TUBE_R * (0.55 + 0.45 * k);
    o.scale.set(Math.max(0.001, r), Math.max(0.001, reach * len), Math.max(0.001, r));
    o.material.userData.fade.value = k;
  });

  /* Шар каста у руки: растёт 0.15 с, стоит весь луч, гаснет после него.
     Ядро — там, где из шара выходит луч. */
  crystal(vfx, P, { x: A[0], y: A[1], z: A[2], at: 0, r0: 0.12, r1: 0.6, grow: 0.15, hold: T.full + 0.1, life: T.orbEnd, seed: (seed % 5) + 2, hot: 1.0, core: 0.3, detail: 3, edge: 0.05 });
  state.lightA = holdLight(vfx, A[0] + ux * 0.4, 1.4, A[2] + uz * 0.4, P[1], 14, T.full, 0.4, 7);
  kit.sparks(vfx, { x: A[0] + ux * 0.5, y: A[1], z: A[2] + uz * 0.5, n: 14, colour: P[0], tail: P[1], speed: 7, life: 0.35, cone: { dir: fp.dir, half: 0.45 }, gravity: -4, size: 0.1, at: vfx.now + T.out0, r: rng });

  /* Удар: купол ~2.5 м с ядром, шипы, кольцо по полу, свет, толчок, след. */
  const onHit = () => {
    state.lightB = holdLight(vfx, B[0], 1.5, B[2], P[0], hit ? 26 : 12, T.full - T.out1, 0.45, 10);
    vfx.screen.shake(hit ? 0.32 : 0.15);
    vfx.screen.flash(P[0], hit ? 0.04 : 0.02);
    vfx.screen.aberration(hit ? 0.5 : 0.25);
  };
  if (hit) {
    crystal(vfx, P, { x: B[0], y: 1.1, z: B[2], at: T.out1, r0: 0.3, r1: 1.25, grow: 0.14, hold: T.full + 0.05, life: T.off, squash: 0.9, seed: (seed % 7) + 1, hot: 1.1, core: 0.5, detail: 2, edge: 0.07 });
    spikes(vfx, P, { x: B[0], y: 1.0, z: B[2], n: 44, speed: 13, life: 0.35, size: 0.24, at: vfx.now + T.out1, r: rng });
    floorRing(vfx, P, { x: B[0], z: B[2], r0: 0.4, r1: 3.4, life: 0.5, at: T.out1 });
    /* След — оплавленное стекло с тёмным ободом: лазер плавит, не жжёт. */
    kit.decal(vfx, { type: 'laser', x: B[0], z: B[2], radius: 1.6, hold: 20, tint: P[1], seed: (seed % 9) + 1 });
  } else {
    kit.sparks(vfx, { x: B[0], y: 1.1, z: B[2], n: 16, colour: P[0], tail: P[1], speed: 6, life: 0.4, gravity: -6, size: 0.1, at: vfx.now + T.out1, r: rng });
  }

  /* Штрихи внутри трубы — «подсвеченный туман» летит к цели всю полную фазу. */
  const nMote = kit.countFor(90, fp.area, REF, 300);
  const white = new THREE.Color(0.95, 0.97, 1.0);
  vfx.add.emit(nMote, (i, s) => {
    const f = rng(), a = rng() * TAU, rr = rng() * 0.35;
    const v = 5 + rng() * 4;
    const life = Math.min(0.25 + rng() * 0.3, (len * (1 - f) + 0.4) / v);
    s.pos(A[0] + ux * len * f + sx * Math.cos(a) * rr, A[1] + Math.sin(a) * rr, A[2] + uz * len * f + sz * Math.cos(a) * rr);
    s.vel(ux * v, 0, uz * v);
    s.gravity(0, 0, 0);
    s.color(white, P[1]);
    s.life(vfx.now + T.out1 + rng() * (T.full - T.out1), life, 0.06 + rng() * 0.06, kit.SHAPE.streak);
    s.ext(0, 0.6, 1, 1);
  });

  /* Ковёр искр на полу: под всем путём (±1.1 м, гуще у оси) и в круге ~2.2 м
     у цели. Рождение растянуто до ~1.1 с, жизнь 0.35–1.85 с: ковёр мерцает
     и живёт после луча. Пул тела (обычный блендинг): на белом полу
     аддитивная точка невидима, тёмная — читается. */
  const nDot = kit.countFor(2200, fp.area, REF, 900);
  const dotC = P[2].clone().multiplyScalar(0.9), dotE = P[2].clone().multiplyScalar(0.55);
  vfx.body.emit(nDot, (i, s) => {
    let x, z, f;
    if (hit && rng() < 0.3) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * 2.2;
      x = B[0] + Math.sin(a) * d; z = B[2] + Math.cos(a) * d; f = 1;
    } else {
      f = rng();
      const q = rng() * 2 - 1;
      const lat = Math.sign(q) * Math.pow(Math.abs(q), 1.3) * 1.1;
      x = A[0] + ux * len * f + sx * lat; z = A[2] + uz * len * f + sz * lat;
    }
    const born = vfx.now + T.out0 + f * 0.1 + Math.pow(rng(), 1.5) * 1.1;
    const life = 0.35 + Math.pow(rng(), 1.2) * 1.5;
    s.pos(x, 0.035, z);
    s.vel(0, 0, 0);
    s.gravity(0, 0, 0);
    s.color(i % 5 === 0 ? P[0] : dotC, dotE);
    s.life(born, life, 0.09 + rng() * 0.06, kit.SHAPE.dot);
    s.ext(0, 0.5, 0, 0);
  });
  return true;
}
