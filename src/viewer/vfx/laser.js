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
 *     радиусе ~0.5–0.6 м, каждую можно пересчитать, между ними видна труба;
 *     10–14 px шириной с ореолом — то есть ~0.35 м; ореол в 2–3 ядра;
 *     передняя лента ЗАКРЫВАЕТ заднюю; крутятся и ползут к цели; за
 *     точкой удара распускаются в хлысты 2–4 м, которые медленно
 *     разматываются вверх, а не бьются;
 *   · КОЛЬЦА — тонкие белые, радиус ~0.8 м, поперёк оси через ~0.7 м, бегут
 *     к цели; один гладкий штрих с мягким ореолом; овалы, не палки;
 *   · КУПОЛ у цели ~2.5 м: стеклянный колокол, цель видна сквозь, горячее
 *     ядро там, где луч входит в колокол, обод; ленты расходятся из него;
 *   · ПОЛ — плотный ковёр МЕЛКИХ искрящихся точек под всем путём от кастера
 *     до цели и вокруг цели, живёт после луча.
 *
 * Сим решает луч мгновенно (`e.hit`, `x1,z1`), поэтому картинка — удержанный
 * залп по таймлайну `T`: шар 0.2 с (кадр 0.15 — только шар, как эталон 150 и
 * 450 мс) → луч вырастает за 0.1 с → держится до 1.2 с → гаснет к 1.5 с; шар
 * до конца луча; купол гаснет медленнее — до 1.8 с, на 1.6 с над ковром ещё
 * стоит тающий колокол; точки на полу ~2.9 с.
 *
 * ЦВЕТ. Палитра кинетики (#d8e2ea, #9fb4c4, #5d7183) — серое на сером: на
 * белом полу (§10.1) ни один из трёх не читается. Эталон читается за счёт
 * КОНТРАСТА: тёплые яркие ленты на холодной прозрачной трубе. Поэтому от
 * палитры берётся контрастная пара (`tones`): рубашки, ободы и точки — из
 * P[2], насыщенного и затемнённого (обычный блендинг, непрозрачно), ядра —
 * HDR-белое (3.2,3.3,3.6): ACES прижимает 3.2 к ~251 из 255, и горячий
 * пиксель получается из самого ядра, а не из bloom (замер первого круга:
 * ядро (1.6,1.62,1.7) с мягким краем давало потолок 241 и 15 горячих
 * пикселей в коробке бокового глаза; резкое HDR-ядро — 2876). P[1] ни для
 * чего, что обязано читаться на полу. Пустота (фиолетовая) проходит той же
 * дорогой и остаётся тем же эффектом.
 *
 * ЧТО ДЕРЖИТ ФОРМУ НА БЕЛОМ ПОЛУ (замер круга 2.1, боковой глаз 26 м):
 *   · труба с одним тёмным ободом у силуэта была невидима — между лентами
 *     пол светился своей яркостью. Теперь у трубы ЗАЛИВКА средним тоном по
 *     всей грани (α ≈ 0.3, штрихи видны) и тёмная полоса перед силуэтом с
 *     пиком на facing ≈ 0.3 (α до 0.85): с бокового глаза — тёмные кромки,
 *     синеватые плечи, бледная ось; на тёмной стене — светлый цилиндр;
 *   · обод купола, заданный по френелю 0.25–0.7, лежал в 4 % проекционного
 *     радиуса (2 px с 26 м) — пузыря не было. Теперь обод задан по
 *     ПРОЕКЦИОННОМУ радиусу sin θ: полоса 0.6–0.97 R, плато 0.86–0.97 R
 *     (~6 px), α 0.85 — тёмное кольцо колокола видно на полу с любого глаза;
 *   · кольца перпендикулярно оси с бокового глаза (плоскость кольца
 *     содержит направление взгляда) схлопывались в вертикальные палки:
 *     передняя и задняя половины штриха ложились одна на другую в проходе с
 *     глубиной — «штакетник». У каждого кольца свой наклон 10–16° вокруг
 *     случайной оси в его плоскости: с любого азимута кольцо — овал.
 *
 * ПОРЯДОК ЛЕНТ. Камера не доступна слою эффектов, сортировать сегменты на
 * процессоре нечем; ленты рисуются в ДВА прохода: плотный (рубашка внутри
 * 0.5 прозрачности + ядро) ПИШЕТ ГЛУБИНУ и режет по альфа-тесту — так
 * передняя лента закрывает заднюю честно, по z-буферу; мягкий край и ореол
 * (прозрачность ниже порога) идут вторым проходом без записи глубины и
 * прячутся за плотной частью передней ленты. Порог альфа-теста ведётся от
 * затухания, чтобы форма ленты не менялась, пока луч гаснет.
 *
 * СТЫКИ. У каждого сегмента касательные в обоих концах, и квад скошен «под
 * ус» (митра): соседние квады стыкуются встык, без наложения и без щелей;
 * ленты и кольца — один гладкий штрих (без митры звенья по 6 см с круглыми
 * концами клались по 8 квадов на пиксель, и кольца читались бусами).
 *
 * ФРОНТ. Прорастание сужает ленту в вершинном шейдере до четверти ширины на
 * последних 6 % пути перед `reach` и гасит её там же: остриё, а не плоский
 * срез (замер 2.1: плотный проход резал ленту по порогу 0.5 стеной).
 *
 * Ленты, хлысты, кольца и контактное кольцо купола — один инстансированный
 * буфер сегментов, переписываемый КАЖДЫЙ кадр (винт крутится, кольца бегут):
 * ~1.7 тыс. сегментов × 16 чисел на 9 м — ~110 КБ на кадр, дешевле любой
 * перестройки материала. Огибающие луча и купола разные, а буфер один:
 * униформа затухания — максимум из двух, доля каждого — в яркости сегмента.
 *
 * Детерминизм (A2): всё случайное — от `mulberry(seedOf(e))`; вращение и бег
 * колец — от возраста эффекта, не от часов страницы.
 * Размер — параметр: число лент, колец, точек — от длины и площади следа.
 * TSL, ни строки GLSL; материалы — из кольца `pooled`, геометрии общие.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { MAT_RING, TIME, clamp01, col, easeOutCubic, markGlow, mulberry, pooled, seedOf, shared, withFade } from './core.js';
import * as kit from './kit.js';
import { TAU, clampN, hex } from './arc/util.js';
import { floorRing } from './arc/common.js';

const {
  float, vec3, vec4, uv, uniform, mix, smoothstep, oneMinus, abs: tabs, attribute,
  positionLocal, normalLocal, normalView, normalWorld, positionWorld, cameraPosition, positionViewDirection,
  cameraProjectionMatrix, modelViewMatrix, cross, select, mx_noise_float, mx_fractal_noise_float, min: tmin,
} = TSL;

/**
 * Тайминги, секунды от каста (см. шапку). `out0` 0.2, а не 0.15: снимок
 * «0.15» ложится на 0.150–0.156 с, и при выходе ровно на 0.15 кадр ловил луч
 * на треть пути (замер 2.1) — эталон на 150 и 450 мс показывает только шар.
 */
const T = { out0: 0.2, out1: 0.3, full: 1.2, off: 1.5, orbEnd: 1.55, dome: 1.8, residue: 2.9 };

/* ── контрастная пара от палитры ───────────────────────────────────────── */

const TONES = new Map();
/**
 * `deep` — тёмный насыщенный тон для рубашек, ободов и точек на полу: P[2]
 * с насыщенностью не ниже 0.7 и светлотой не выше 0.3 (кинетика #5d7183 →
 * стальная синь ~#174d82, пустота #4b2f8c → глубокий фиолет). `mid` — тот
 * же тон средней светлоты (0.38–0.44), для канта рубашки у ядра, ореола на
 * тёмном, заливки трубы и следа: светлее — и кант белеет рядом с ядром
 * (замер i1: рубашка при светлоте 0.5 читалась бледно-голубой каймой).
 */
function tones(P) {
  const key = hex(P);
  let t = TONES.get(key);
  if (t) return t;
  const hsl = {};
  P[2].getHSL(hsl);
  const deep = new THREE.Color().setHSL(hsl.h, Math.max(hsl.s, 0.7), Math.min(hsl.l, 0.3));
  const mid = new THREE.Color().setHSL(hsl.h, Math.max(hsl.s, 0.65), Math.min(Math.max(hsl.l, 0.38), 0.44));
  t = { deep, mid };
  TONES.set(key, t);
  return t;
}

/* ── сегментная лента: ленты, хлысты, кольца ───────────────────────────── */

/**
 * Ширины в полуширинах ядра. Ядро 0.06–0.085 м — 5–7 px с трансляции
 * (эталон: белая жила 4–6 px); плотная рубашка до ~2.1 полуширины — полоса
 * 0.3 м (эталон 10–14 px при 35 px/м); мягкий проход ×4.5 — хвост рубашки
 * и ореол среднего тона за ней (замер 2.1: ореол в 1–2 px читался трубой из
 * пластика, у эталона ореол в 2–3 ядра); свечение ×7 — широкий аддитивный
 * ореол, виден только на тёмном. Порядок: свечение ПОД плотным (с глубиной)
 * → мягкий край: аддитивный ореол поверх рубашки высветлял её до белого
 * (замер i1), под ней он остаётся только снаружи ленты.
 */
const JM = 3.0, SM = 4.5, GM = 7.0;
const LAYER = {
  solid: { mul: JM, order: 7, blend: THREE.NormalBlending, depth: true },
  glow: { mul: GM, order: 6, blend: THREE.AdditiveBlending, depth: false },
  soft: { mul: SM, order: 9, blend: THREE.NormalBlending, depth: false },
};
/** Раскладка инстанса: a×3, b×3, касательная в a ×3, в b ×3, cfg×4 (полуширина ядра, яркость, вид, u вдоль). */
const STRIDE = 16;
/** Ядро ленты: выше 3 ACES даёт ≥250 из 255 — белое, а не светло-серое. */
const HOT = [3.2, 3.3, 3.6];

function segMat(layer, P) {
  return pooled(`laser:seg:${layer}:${hex(P)}`, () => makeSegMat(layer, P), MAT_RING);
}

/**
 * Инстанс — один отрезок `sa`→`sb`; квад разворачивается к камере в
 * пространстве вида по `cross(касательная, взгляд)`, причём боковой вектор
 * считается ОТДЕЛЬНО в каждом конце от касательной там (`sta`, `stb`) и
 * растягивается на 1/cos половины угла излома — митра: соседние сегменты
 * стыкуются встык. В пикселе — расстояние до оси в полуширинах ядра.
 *
 * `cfg.z` — вид: 0 лента, 1 кольцо (рубашка мягче и прозрачнее — круглый
 * профиль, а не плоский столбик). `reach` — доля пути, до которой луч
 * дорос: на последних 6 % перед фронтом лента сужается и гаснет.
 */
function makeSegMat(layer, P) {
  const L = LAYER[layer];
  const { deep, mid } = tones(P);
  const m = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: L.depth, side: THREE.DoubleSide, blending: L.blend,
  });
  const fade = withFade(m);
  const reach = uniform(1);
  m.userData.u = { fade, reach };

  const a = attribute('sa', 'vec3'), b = attribute('sb', 'vec3');
  const ta = attribute('sta', 'vec3'), tb = attribute('stb', 'vec3');
  const cfg = attribute('scfg', 'vec4');
  const along = positionLocal.x, across = positionLocal.y;
  /* Фронт: остриё. Считается и в вершине (ширина), и в пикселе (яркость). */
  const on = oneMinus(smoothstep(reach.sub(0.06), reach, cfg.w));
  const W = cfg.x.mul(L.mul).mul(on.mul(0.75).add(0.25));

  const av = modelViewMatrix.mul(vec4(a, 1)).xyz;
  const bv = modelViewMatrix.mul(vec4(b, 1)).xyz;
  const tav = modelViewMatrix.mul(vec4(ta, 0)).xyz.normalize();
  const tbv = modelViewMatrix.mul(vec4(tb, 0)).xyz.normalize();
  const pv = mix(av, bv, along);
  const view = pv.negate().normalize();
  const seg = bv.sub(av);
  const segN = seg.div(seg.length().max(1e-4));
  const sideOf = (t) => {
    const c = cross(t, view);
    const l = c.length();
    return select(l.greaterThan(1e-4), c.div(l.max(1e-4)), vec3(1, 0, 0));
  };
  const sS = sideOf(segN), sA = sideOf(tav), sB = sideOf(tbv);
  /* Митра: ширина поперёк сегмента сохраняется, излом до 60° без щели. */
  const kA = float(1).div(sA.dot(sS).max(0.5)), kB = float(1).div(sB.dot(sS).max(0.5));
  const side = mix(sA.mul(kA), sB.mul(kB), along);
  m.vertexNode = cameraProjectionMatrix.mul(vec4(pv.add(side.mul(across.mul(W))), 1));

  const d = across.abs().mul(L.mul);
  const base = fade.mul(cfg.y).mul(on);
  const ring = cfg.z.greaterThan(0.5);

  if (layer === 'glow') {
    const mask = oneMinus(d.div(GM)).clamp(0, 1);
    m.colorNode = mix(col(mid), col(P[0]), mask.pow(2.0));
    const alpha = mask.pow(1.8).mul(0.32).mul(base).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.12));
  }
  /* Ядро — РЕЗКИЙ край (0.85→1.05 полуширины, ~1 px): либо белый пиксель,
     либо цвет рубашки; мягкое ядро давало ни белое, ни синее (урок молнии).
     Ядро шире канта: у эталона белая жила — основная часть ленты, цветная
     кайма с каждой стороны — примерно в жилу (замер 2.1: при ядре 0.9 и
     рубашке до 2.35 лента читалась синей трубкой с белой прожилкой). */
  /*
   * ЯДРО УЖЕ, РУБАШКА ШИРЕ — тот же урок, что у пучка молнии. Замер двух
   * судей круга 2: при ядре в 0.7 полуширины лента читалась «непрозрачной
   * белой пластиковой трубкой с жёсткой синей кромкой», а не светящейся
   * лентой: белое занимало 70 % ширины, цветной кайме оставалось 30 %.
   * Теперь ядро 0.35 (белая жила ~ треть ширины) при рубашке до 3.4 — доля
   * цвета к жиле примерно 3:1, как у эталона Nova Beam, и HDR-жила уходит в
   * bloom НАД цветом, а не вместо него.
   */
  const core = oneMinus(smoothstep(float(0.25), float(0.5), d));
  const jacketEdge = select(ring, smoothstep(float(1.2), float(3.0), d), smoothstep(float(1.7), float(3.4), d));
  const jacketA = oneMinus(jacketEdge).mul(select(ring, float(0.6), float(0.96)));
  const jacketC = mix(col(mid), col(deep), smoothstep(float(0.45), float(1.9), d));
  m.colorNode = mix(jacketC, vec3(...HOT), core);
  const alpha = jacketA.max(core).mul(base).clamp(0, 1);
  if (layer === 'solid') {
    m.opacityNode = alpha;
    /* Порог от затухания: форма плотной части не зависит от `fade`. */
    m.alphaTestNode = fade.mul(0.5);
    return markGlow(m, core.mul(base).mul(0.3));
  }
  /* Мягкий край — ровно то, что плотный проход отрезал, плюс ОРЕОЛ среднего
     тона до 4.5 полуширин: на белом полу — синеватая дымка вокруг ленты, на
     тёмном — светлая; поверх плотной части не рисуется. */
  const halo = oneMinus(d.div(SM)).clamp(0, 1).pow(1.6).mul(0.3).mul(base);
  m.colorNode = mix(mix(jacketC, vec3(...HOT), core), col(mid), smoothstep(float(2.4), float(3.4), d));
  m.opacityNode = select(alpha.lessThan(fade.mul(0.5)), alpha.max(halo), float(0));
  return markGlow(m, float(0));
}

/**
 * Поле сегментов: одна инстансированная геометрия, три меша (три прохода).
 * Пишется целиком каждый кадр: `begin()` → `poly(...)` → `end()`.
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
  geo.setAttribute('sta', new THREE.InterleavedBufferAttribute(ibuf, 3, 6));
  geo.setAttribute('stb', new THREE.InterleavedBufferAttribute(ibuf, 3, 9));
  geo.setAttribute('scfg', new THREE.InterleavedBufferAttribute(ibuf, 4, 12));
  geo.instanceCount = 0;

  const group = new THREE.Group();
  const mats = [];
  for (const layer of ['solid', 'glow', 'soft']) {
    const m = segMat(layer, P);
    const mesh = new THREE.Mesh(geo, m);
    mesh.frustumCulled = false;
    mesh.renderOrder = LAYER[layer].order;
    group.add(mesh);
    mats.push(m);
  }
  let n = 0;
  /* Касательные ломаной: буфер на самую длинную ломаную. */
  let TG = new Float64Array(3 * 512);
  return {
    group,
    begin() { n = 0; },
    /**
     * Ломаная `pts` (плоский xyz, `cnt` точек), `closed` — кольцо. `w`, `k`,
     * `u` — число или массив по точкам (берётся в начале сегмента).
     */
    poly(pts, cnt, closed, w, k, kind, u) {
      if (cnt < 2) return;
      if (TG.length < cnt * 3) TG = new Float64Array(cnt * 3);
      for (let i = 0; i < cnt; i++) {
        const ip = closed ? (i - 1 + cnt) % cnt : Math.max(0, i - 1);
        const inx = closed ? (i + 1) % cnt : Math.min(cnt - 1, i + 1);
        let tx = pts[inx * 3] - pts[ip * 3], ty = pts[inx * 3 + 1] - pts[ip * 3 + 1], tz = pts[inx * 3 + 2] - pts[ip * 3 + 2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        TG[i * 3] = tx / tl; TG[i * 3 + 1] = ty / tl; TG[i * 3 + 2] = tz / tl;
      }
      const segs = closed ? cnt : cnt - 1;
      const wA = typeof w !== 'number', kA = typeof k !== 'number', uA = typeof u !== 'number';
      for (let i = 0; i < segs && n < maxSeg; i++) {
        const j = (i + 1) % cnt;
        const o = n * STRIDE;
        arr[o] = pts[i * 3]; arr[o + 1] = pts[i * 3 + 1]; arr[o + 2] = pts[i * 3 + 2];
        arr[o + 3] = pts[j * 3]; arr[o + 4] = pts[j * 3 + 1]; arr[o + 5] = pts[j * 3 + 2];
        arr[o + 6] = TG[i * 3]; arr[o + 7] = TG[i * 3 + 1]; arr[o + 8] = TG[i * 3 + 2];
        arr[o + 9] = TG[j * 3]; arr[o + 10] = TG[j * 3 + 1]; arr[o + 11] = TG[j * 3 + 2];
        arr[o + 12] = wA ? w[i] : w; arr[o + 13] = kA ? k[i] : k; arr[o + 14] = kind; arr[o + 15] = uA ? u[i] : u;
        n++;
      }
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
 * Труба: подсвеченный туман, который ОБЯЗАН читаться на белом полу с
 * бокового глаза (замер 2.1: труба с одним тёмным ободом на facing 0.25
 * была невидима — между лентами пол светился своей яркостью, цилиндр
 * угадывался только с трансляции). Три слоя в одном материале, обычный
 * блендинг:
 *   · ЗАЛИВКА по всей грани: средний тон → P[0] к оси, α ≈ 0.3 со штрихами
 *     (продольный шум бежит к цели) и медленным шумом `haze`, рвущим края;
 *     на белом — синеватая плёнка, на тёмной стене — светлый цилиндр;
 *   · тёмная ПОЛОСА `deep` перед силуэтом: пик на facing ≈ 0.3 (α до 0.85),
 *     ноль на самом крае — кромки без жёсткого обода (в первом круге обод на
 *     силуэте давал плашку с жёсткой верхней кромкой с низкого глаза);
 *   · ГОРЯЧАЯ ОСЬ: HDR-белые штрихи по facing^3.5, треть в bloom — свет на
 *     тёмном фоне и телах.
 * `span` — длина в метрах, чтобы плотность штрихов не зависела от длины
 * луча; концы трубы (в шаре и в куполе) размыты по uv.
 */
function tubeMat(P) {
  return pooled(`laser:tube:${hex(P)}`, () => {
    const { deep, mid } = tones(P);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const span = uniform(10);
    m.userData.u = { fade, span };
    const V = cameraPosition.sub(positionWorld).normalize();
    const facing = normalWorld.dot(V).abs().clamp(0, 1);
    const along = uv().y.mul(span);
    const streak = mx_fractal_noise_float(vec3(uv().x.mul(8.0), along.mul(0.8).sub(TIME.mul(6.5)), 2.0), 2, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const haze = mx_noise_float(vec3(uv().x.mul(3.0), along.mul(0.45).sub(TIME.mul(2.0)), 5.0)).mul(0.5).add(0.5);
    const ends = smoothstep(float(0.0), float(0.05), uv().y).mul(oneMinus(smoothstep(float(0.92), float(1.0), uv().y)));
    const fill = streak.mul(0.45).add(0.55).mul(haze.mul(0.3).add(0.7));
    const band = smoothstep(float(0.03), float(0.3), facing).mul(oneMinus(facing).pow(1.1));
    const hot = facing.pow(3.5).mul(streak.mul(0.6).add(0.4));
    let colour = mix(col(mid), col(P[0]).mul(1.05), facing.pow(1.5).mul(0.45).add(0.1));
    colour = mix(colour, vec3(1.7, 1.72, 1.8), hot.mul(0.8));
    colour = mix(colour, col(deep).mul(0.85), band.mul(0.9));
    m.colorNode = colour;
    const alpha = fill.mul(0.35).add(band.mul(0.9)).add(hot.mul(0.25)).mul(ends).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, hot.mul(ends).mul(fade).mul(0.2).clamp(0, 1));
  }, MAT_RING);
}

/* ── стекло: шар каста и купол удара, горячее ядро ─────────────────────── */

const FACET_GEO = {};
/**
 * Икосфера (у `PolyhedronGeometry` индекса нет и так): после
 * `computeVertexNormals` нормали плоские на грань — гранёный шар без
 * освещения. Атрибут `bary` — барицентрические координаты вершины в своём
 * треугольнике: по ним шейдер рисует РЁБРА граней, едва (эталон: у купола
 * угадываются кромки многоугольников; в первом круге кромки в полную силу
 * читались геодезической клеткой, в 2.1 — всё ещё сеткой внутри пузыря).
 */
function facetGeo(detail = 3) {
  if (!FACET_GEO[detail]) {
    const g = new THREE.IcosahedronGeometry(1, detail);
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
 * Стеклянный полупрозрачный шар (шар у руки, купол у цели). Обычный
 * блендинг: середина — светлая, зернистая, с плотностью `dense` (у купола
 * 0.5 — цель видна сквозь), к краю — обод `deep`, который и делает белое
 * стекло видимым на белом полу.
 *
 * ОБОД ЗАДАН ПО ПРОЕКЦИОННОМУ РАДИУСУ sin θ = √(1 − (n·v)²), а не по
 * френелю: полоса френеля 0.25–0.7 (замер 2.1) начиналась на 0.66 R и
 * достигала силы только на 0.95–0.99 R — 2–4 px с 26 м, купол читался
 * бледным пузырём с потерянной нижней половиной. Теперь полоса 0.6–0.97 R с
 * плато 0.86–0.97 R (~6 px при R 1.25 м) и силой `rimK` (у купола 0.85).
 * Грань — своя яркость (шум от плоской нормали постоянен по грани), зерно
 * плывёт, прожилки ползут; рёбра граней — едва (`edgeK`), чтобы колокол
 * читался одной стеклянной поверхностью. Горячее ядро — отдельный меш
 * (`coreMat`), здесь только тёплая середина `hotK`.
 */
function glassMat(P) {
  return pooled(`laser:glass:${hex(P)}`, () => {
    const { deep, mid } = tones(P);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const seed = uniform(0), hotK = uniform(1), dense = uniform(1), rimK = uniform(0.6), edgeW = uniform(0.03), edgeK = uniform(0.4);
    m.userData.u = { fade, seed, hotK, dense, rimK, edgeW, edgeK };
    const body = tabs(TSL.dot(normalView, positionViewDirection)).clamp(0, 1);
    const sinT = oneMinus(body.mul(body)).max(0).sqrt();
    const facet = mx_noise_float(normalLocal.mul(3.1).add(seed)).mul(0.5).add(0.5);
    const bary = attribute('bary', 'vec3');
    const edge = oneMinus(smoothstep(float(0.0), edgeW, tmin(bary.x, tmin(bary.y, bary.z)))).mul(edgeK);
    const grain = mx_noise_float(positionLocal.mul(11.0).add(vec3(seed, TIME.mul(0.7), 0))).mul(0.5).add(0.5);
    const vn = mx_fractal_noise_float(normalLocal.mul(2.2).add(vec3(TIME.mul(0.8), seed, 0)), 2, 2.0, 0.5, 1);
    const veins = oneMinus(smoothstep(float(0.0), float(0.06), tabs(vn)));
    const white = vec3(1.3, 1.32, 1.4);
    const base = mix(col(P[0]).mul(0.9), white, facet.mul(0.25).add(0.45));
    const rimC = mix(col(deep), col(mid), body.mul(0.5));
    let colour = mix(rimC, base, smoothstep(float(0.35), float(0.8), body));
    colour = mix(colour, vec3(2.2, 2.25, 2.4), body.pow(2.5).mul(hotK).mul(0.7));
    colour = mix(colour, mix(col(mid), white, 0.5), veins.mul(0.35));
    colour = mix(colour, white, edge.mul(0.6));
    m.colorNode = colour;
    const centre = body.pow(1.2).mul(grain.mul(0.35).add(0.65)).mul(facet.mul(0.25).add(0.75)).mul(dense);
    const rim = smoothstep(float(0.6), float(0.86), sinT).mul(oneMinus(smoothstep(float(0.965), float(1.0), sinT))).mul(rimK);
    const alpha = centre.add(rim).add(veins.mul(0.15)).add(edge.mul(0.3)).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, body.pow(2.0).mul(hotK).mul(alpha).mul(0.35).add(veins.mul(0.08)).mul(fade).clamp(0, 1));
  }, MAT_RING);
}

/**
 * Горячее ядро: HDR-белый диск с РЕЗКИМ краем обычным блендингом (на
 * силуэте сферы body → 0, край диска на body 0.3–0.45), треть — в bloom:
 * ореол вокруг. Мягкое аддитивное ядро первого круга давало потолок 241.
 */
function coreMat(P) {
  return pooled(`laser:core:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const body = tabs(TSL.dot(normalView, positionViewDirection)).clamp(0, 1);
    m.colorNode = mix(col(P[0]).mul(1.2), vec3(...HOT), smoothstep(float(0.3), float(0.5), body));
    const alpha = smoothstep(float(0.3), float(0.45), body).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.35));
  }, MAT_RING);
}

/** Ореол ядра: аддитивный, светлый, виден на тёмном и на теле. */
function haloMat(P) {
  return pooled(`laser:halo:${hex(P)}`, () => {
    const { mid } = tones(P);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending });
    const fade = withFade(m);
    const body = tabs(TSL.dot(normalView, positionViewDirection)).clamp(0, 1).pow(1.6);
    m.colorNode = mix(col(mid), col(P[0]).mul(1.3), body);
    const alpha = body.mul(0.7).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.5));
  }, MAT_RING);
}

/** Огибающая: 0 до `at`, рост `grow` с замедлением, полная до `hold`, гаснет к `life`. */
function envelope(t, at, grow, hold, life) {
  if (t < at) return { r: 0, f: 0 };
  const r = easeOutCubic(clamp01((t - at) / Math.max(0.01, grow)));
  const f = t < hold ? 1 : Math.pow(Math.max(0, 1 - (t - hold) / Math.max(0.01, life - hold)), 1.3);
  return { r, f };
}

/**
 * Стекло с ядром: от `at` растёт с `r0` до `r1` за `grow`, держится до
 * `hold`, гаснет к `life`. `core` — радиус горячего ядра, `halo` — его
 * ореола (метры).
 */
function glass(vfx, P, { x, y, z, at = 0, r0 = 0.1, r1 = 0.6, grow = 0.15, hold, life, squash = 1, seed = 1, hot = 1, dense = 0.8, rim = 0.6, core = 0, halo = 0, coreAt = null, detail = 3, edge = 0.03, edgeK = 0.4 }) {
  const m = glassMat(P);
  const u = m.userData.u;
  u.seed.value = seed; u.hotK.value = hot; u.dense.value = dense; u.rimK.value = rim; u.edgeW.value = edge; u.edgeK.value = edgeK;
  const mesh = new THREE.Mesh(facetGeo(detail), m);
  mesh.position.set(x, y, z);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.scale.setScalar(0.001);
  let hc = null, hl = null;
  if (core > 0) {
    /* Ядро и ореол — дети стекла, но с собственным масштабом; `coreAt` —
       смещение ядра от центра в мировых метрах. У купола ядро сидит там,
       где луч входит в колокол: на 0.6 м перед центром и на 0.5 м ВЫШЕ —
       над спиной цели. В центре купола стоит непрозрачное тело, и ядро там
       не видно ни сбоку (тело длиной ~1.5 м вдоль луча), ни с трансляции
       (тело между камерой и точкой входа) — замер i1, i3, i4, 2.1. */
    hc = new THREE.Mesh(sphereGeo(), coreMat(P));
    hc.renderOrder = 11;
    hc.frustumCulled = false;
    mesh.add(hc);
    hl = new THREE.Mesh(sphereGeo(), haloMat(P));
    hl.renderOrder = 10;
    hl.frustumCulled = false;
    mesh.add(hl);
  }
  vfx.spawnMesh(mesh, life, (o, k) => {
    const t = k * life;
    const { r, f } = envelope(t, at, grow, hold, life);
    const R = Math.max(0.001, r0 + (r1 - r0) * r);
    o.scale.set(R, R * squash, R);
    u.fade.value = f;
    if (hc) {
      /* Ядро дышит ~9 Гц и живёт в масштабе родителя. */
      const br = 0.93 + 0.07 * Math.sin(t * 57);
      hc.scale.setScalar(Math.max(0.001, (core / R) * br));
      hl.scale.setScalar(Math.max(0.001, (halo / R) * (1.1 - 0.1 * br)));
      if (coreAt) {
        hc.position.set(coreAt[0] / R, coreAt[1] / (R * squash), coreAt[2] / R);
        hl.position.copy(hc.position);
      }
      hc.material.userData.fade.value = f;
      hl.material.userData.fade.value = f;
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

/**
 * Шипы удара: тонкие штрихи, вытянутые по скорости, из точки во все стороны.
 * Две копии одной траектории: белая в пуле свечения (на тёмном теле — с
 * bloom) и `deep` в обычном пуле — на белом полу белое невидимо, тёмный
 * штрих читается. Цвет — от палитры, а не синий молнии: пустота остаётся
 * фиолетовой.
 */
function spikes(vfx, P, { x, y, z, n, at, r, speed = 13, life = 0.35, size = 0.24 }) {
  const { deep, mid } = tones(P);
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, e = (r() * 2 - 1) * 0.6, ce = Math.cos(e);
    const v = speed * (0.6 + r() * 0.8);
    list.push({ vx: Math.sin(a) * ce * v, vy: Math.sin(e) * v, vz: Math.cos(a) * ce * v, born: at + r() * 0.03, life: life * (0.6 + r() * 0.8), size: size * (0.6 + r() * 0.8) });
  }
  const white = new THREE.Color(0.95, 0.97, 1.0);
  const fill = (c1, c2, glow) => (i, s) => {
    const k = list[i];
    s.pos(x, y, z);
    s.vel(k.vx, k.vy, k.vz);
    s.gravity(0, 0, 0);
    s.color(c1, c2);
    s.life(k.born, k.life, k.size, kit.SHAPE.streak);
    s.ext(0, 0.35, 1, glow);
  };
  vfx.glow.emit(n, fill(white, mid, 1));
  vfx.body.emit(n, fill(deep, deep.clone().multiplyScalar(0.7), 0.4));
}

/** Поворот вектора вокруг оси `n` на угол `a` (Родриг), в `out`. */
function rot(v, n, a, out) {
  const c = Math.cos(a), s = Math.sin(a);
  const d = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  const cx = n[1] * v[2] - n[2] * v[1], cy = n[2] * v[0] - n[0] * v[2], cz = n[0] * v[1] - n[1] * v[0];
  out[0] = v[0] * c + cx * s + n[0] * d * (1 - c);
  out[1] = v[1] * c + cy * s + n[1] * d * (1 - c);
  out[2] = v[2] * c + cz * s + n[2] * d * (1 - c);
}

/** Нормировать вектор на месте (нулевой оставить). */
function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l > 1e-9) { v[0] /= l; v[1] /= l; v[2] /= l; }
  return v;
}

/* ── луч ───────────────────────────────────────────────────────────────── */

export function beam(vfx, e, P, ctx) {
  const fp = kit.footprint(e, ctx);
  const len = fp.len;
  if (!(len > 0.3)) return false;
  const seed = (seedOf(e) ^ 0x1a5e) >>> 0;
  const rng = mulberry(seed);
  const hit = e.hit !== false;
  const { deep, mid } = tones(P);
  const A = [e.x0, 1.15, e.z0], B = [e.x1, 1.15, e.z1];
  const ux = (B[0] - A[0]) / len, uz = (B[2] - A[2]) / len;
  const sx = -uz, sz = ux;
  const U = [ux, 0, uz], S = [sx, 0, sz], Y = [0, 1, 0];
  const REF = kit.REF_AREA.beam;

  /*
   * Винт: 5 лент на 9 м (эталон 4–6). У КАЖДОЙ свой радиус (0.5–0.7),
   * шаг, фаза, ширина (ядро 0.06–0.085) и дыхание радиуса, плюс медленное
   * качание угла (`wob`). Шаг 2.0–2.7 м, а у одной-двух последних лент —
   * ОСОБЫЙ, 3.0–3.6 м: при шаге 1.4–2.3 у всех пяти лент винт с бокового
   * глаза читался тугой косой (ДНК) — пересечений по три на метр, трубы
   * между лентами не было (замер 2.1). При 2–3.6 м лента с другим шагом
   * догоняет соседок и уходит, ленты можно пересчитать. 1.5 об/с — лента
   * ползёт к цели ~3.5 м/с.
   * Хлыст: длина 2–4 м, полный угол закрутки 2.2–4.2 рад; его рамка
   * (азимут выхода `wAz`) крутится в 0.3 РАЗА медленнее винта: при рамке
   * на скорости винта завиток менял форму C → X → S за 50 мс — «щупальца»
   * (замер 2.1 по ролику), при 0.3 — медленно разматывается, как у эталона.
   */
  const nRib = clampN(Math.round(2.5 + len * 0.3), 4, 6);
  const OMEGA = TAU * 1.5;
  const ribs = [];
  /*
   * ЛЕНТЫ РАЗНЫЕ, и это лечит «плетёнку ДНК». Два независимых судьи круга 2:
   * «все пять лент идут почти с одним шагом и одним радиусом, поэтому
   * пересекаются повторяющейся решёткой». Причина была в узких вилках: шаг
   * 2.0–2.7 (или 3.0–3.6 у пары), радиус 0.5–0.7 — при таком разбросе винты
   * почти синхронны, и глаз видит регулярную косу.
   *
   * Теперь три рода лент, и род выбирается по номеру:
   *   · ЖИЛА (первая) — почти прямая (шаг 14–20 м на 9 м пути = меньше
   *     полуоборота) и толстая: у эталона Nova Beam есть прямой сердечник,
   *     вокруг которого вьётся остальное, а не однородная коса;
   *   · ВСТРЕЧНАЯ (каждая третья) — шаг ОТРИЦАТЕЛЬНЫЙ: две ленты, идущие
   *     навстречу, не могут сложиться в решётку ни при каком шаге;
   *   · ОБВИВКА — шаг 1.3–4.6, радиус 0.26–0.78, ширина 0.032–0.115.
   * Начальные азимуты тоже не равномерны: ±0.9 рад от деления.
   */
  for (let i = 0; i < nRib; i++) {
    const kind = i === 0 ? 'core' : (i % 3 === 2 ? 'counter' : 'wrap');
    const pitch = kind === 'core' ? 14 + rng() * 6
      : (kind === 'counter' ? -(1.6 + rng() * 2.2) : 1.3 + rng() * 3.3);
    ribs.push({
      th0: (i / nRib) * TAU + (rng() - 0.5) * 1.8, ph: rng() * TAU, ph2: rng() * TAU,
      r: kind === 'core' ? 0.1 + rng() * 0.12 : 0.26 + rng() * 0.52, pitch,
      breathe: 0.06 + rng() * 0.1, wob: kind === 'core' ? 0.05 : 0.12 + rng() * 0.34,
      w: kind === 'core' ? 0.09 + rng() * 0.03 : 0.032 + rng() * 0.06, k: 0.88 + rng() * 0.12,
      whip: 2 + rng() * 2, curl: 2.2 + rng() * 2.0, wAz: rng() * TAU,
      wUp: 0.15 + rng() * 0.5, wOut: 0.6 + rng() * 0.5, wTilt: (rng() - 0.5) * 0.7, wTw: (rng() - 0.5) * 0.5,
    });
  }
  const K = clampN(Math.round(len * 18), 24, 320);
  const KW = 40;

  /*
   * Кольца: радиус 0.8, через ~0.7 м, бегут к цели. У каждого свой НАКЛОН
   * 10–16° вокруг случайной оси в плоскости кольца: кольцо строго поперёк
   * оси с бокового глаза (пл. кольца содержит взгляд) — вертикальная палка,
   * в проходе с глубиной передняя половина ложилась на заднюю штакетником
   * (замер 2.1). Наклон около вертикали даёт с бокового глаза овал в
   * ~0.25 м, около горизонтали — ~0.12 м; смесь читается неровными
   * овалами, как у эталона. Базис (e1, e2) считается один раз.
   */
  const nRing = clampN(Math.round(len / 0.7), 3, 40);
  const RING_R = 0.8, RING_V = 5.5, RING_N = 40, FOOT_N = 48;
  const rings = [];
  const tmpA = [0, 0, 0];
  for (let q = 0; q < nRing; q++) {
    const ta = (10 + rng() * 6) * (Math.PI / 180), tp = rng() * TAU;
    tmpA[0] = sx * Math.cos(tp); tmpA[1] = Math.sin(tp); tmpA[2] = sz * Math.cos(tp);
    const e1 = [0, 0, 0], e2 = [0, 0, 0];
    rot(S, tmpA, ta, e1); rot(Y, tmpA, ta, e2);
    rings.push({ e1, e2, ph: rng() * TAU });
  }
  const maxSeg = nRib * (K + KW + 2) + nRing * (RING_N + 1) + FOOT_N + 8;
  const field = segField(vfx, P, maxSeg);

  /* Буферы ломаной одной ленты: точки, ширина, яркость, u. */
  const NP = K + KW + 2;
  const PX = new Float64Array(NP * 3), PW = new Float32Array(NP), PK = new Float32Array(NP), PU = new Float32Array(NP);
  const RX = new Float64Array(Math.max(RING_N, FOOT_N) * 3);
  const dv = [0, 0, 0], dn = [0, 0, 0], ax3 = [0, 0, 0], tEnd = [0, 0, 0];

  const helix = (rb, t, time, out, o) => {
    const th = rb.th0 + t * len * (TAU / rb.pitch) + OMEGA * time + rb.wob * Math.sin(t * len * 1.1 + rb.ph + time * 1.5);
    /* Лента выходит из шара: радиус 0.15 → полный за первые 0.6 м. */
    const emerge = clamp01((t * len) / 0.6);
    const r = (0.15 + (rb.r - 0.15) * emerge) * (1 + rb.breathe * Math.sin(t * len * 1.7 + rb.ph2 + time * 3.0));
    const along = t * len;
    out[o] = A[0] + ux * along + sx * r * Math.cos(th);
    out[o + 1] = A[1] + r * Math.sin(th);
    out[o + 2] = A[2] + uz * along + sz * r * Math.cos(th);
  };

  /**
   * Запись поля на кадр: `kRib` — доля огибающей луча, `kFoot` — доля
   * огибающей купола (обе относительно общей униформы затухания).
   */
  const writeField = (time, reach, kRib, kFoot) => {
    field.begin();
    for (let i = 0; i < nRib; i++) {
      const rb = ribs[i];
      let cnt = 0;
      for (let j = 0; j <= K; j++, cnt++) {
        const tt = j / K;
        helix(rb, tt, time, PX, cnt * 3);
        /* Яркость бежит к цели волнами — лента «скользит», не только крутится. */
        PK[cnt] = rb.k * (0.86 + 0.14 * Math.sin(tt * len * 2.6 - time * 9.0 + rb.ph)) * kRib;
        PW[cnt] = rb.w * (0.8 + 0.2 * tt);
        PU[cnt] = tt;
      }
      if (reach >= 1) {
        /*
         * Хлыст. Рамка медленная: азимут ψ = wAz + 0.3·Ω·t. Начальное
         * направление — вперёд, НАРУЖУ по радиусу ψ и ВВЕРХ (`wUp`),
         * подмешанное к касательной ленты в конце (излом не больше митры).
         * Ось закрутки — горизонталь поперёк выхода (cross(вверх, d0)) с
         * небольшим наклоном: завиток поднимается и заворачивается назад,
         * как гребень, а не стелется. Знак — тот, при котором первый шаг
         * поднимает. Не ниже 0.45 м над полом: при касании вертикаль
         * отражается вверх (замер 2.1: часть хлыстов лежала на полу).
         */
        const psi = rb.wAz + 0.3 * OMEGA * time;
        const cs = Math.cos(psi), sn = Math.sin(psi);
        const e0 = (cnt - 1) * 3, e1 = (cnt - 2) * 3;
        tEnd[0] = PX[e0] - PX[e1]; tEnd[1] = PX[e0 + 1] - PX[e1 + 1]; tEnd[2] = PX[e0 + 2] - PX[e1 + 2];
        norm(tEnd);
        dv[0] = ux * 0.4 + sx * cs * rb.wOut; dv[1] = sn * rb.wOut * 0.5 + rb.wUp; dv[2] = uz * 0.4 + sz * cs * rb.wOut;
        norm(dv);
        dv[0] = 0.4 * tEnd[0] + 0.6 * dv[0]; dv[1] = 0.4 * tEnd[1] + 0.6 * dv[1]; dv[2] = 0.4 * tEnd[2] + 0.6 * dv[2];
        norm(dv);
        /* ось = cross(Y, dv) + наклоны */
        ax3[0] = -dv[2] + dv[0] * rb.wTilt; ax3[1] = rb.wTw * 2.4; ax3[2] = dv[0] + dv[2] * rb.wTilt;
        norm(ax3);
        rot(dv, ax3, 0.3, dn);
        const sgn = dn[1] >= dv[1] ? 1 : -1;
        const ds = rb.whip / KW;
        let px = PX[e0], py = PX[e0 + 1], pz = PX[e0 + 2], prev = 0;
        for (let j = 1; j <= KW; j++, cnt++) {
          const s = j / KW;
          const ang = rb.curl * (s + 0.6 * s * s) / 1.6;
          rot(dv, ax3, sgn * (ang - prev), dn);
          prev = ang;
          dv[0] = dn[0]; dv[1] = dn[1]; dv[2] = dn[2];
          px += dv[0] * ds; py += dv[1] * ds; pz += dv[2] * ds;
          if (py < 0.45) { py = 0.45; if (dv[1] < 0) dv[1] = -dv[1]; }
          PX[cnt * 3] = px; PX[cnt * 3 + 1] = py; PX[cnt * 3 + 2] = pz;
          PK[cnt] = rb.k * kRib * (s < 0.7 ? 1 : 1 - (s - 0.7) / 0.3);
          PW[cnt] = rb.w * (1 - 0.4 * s);
          PU[cnt] = 1;
        }
      }
      field.poly(PX, cnt, false, PW, PK, 0, PU);
    }
    /* Кольца: бегут к цели, растворяются у шара и у купола. */
    for (let q = 0; q < nRing; q++) {
      const along = ((q / nRing) * len + RING_V * time) % len;
      const kk = clamp01(along / 0.8) * clamp01((len - 0.6 - along) / 0.9);
      if (kk <= 0.02) continue;
      const rg = rings[q];
      const rr = RING_R * (0.95 + 0.05 * Math.sin(time * 7 + rg.ph));
      const cx = A[0] + ux * along, cz = A[2] + uz * along;
      for (let j = 0; j < RING_N; j++) {
        const phi = (j / RING_N) * TAU, c = rr * Math.cos(phi), s = rr * Math.sin(phi);
        RX[j * 3] = cx + rg.e1[0] * c + rg.e2[0] * s;
        RX[j * 3 + 1] = A[1] + rg.e1[1] * c + rg.e2[1] * s;
        RX[j * 3 + 2] = cz + rg.e1[2] * c + rg.e2[2] * s;
      }
      field.poly(RX, RING_N, true, 0.026, 0.9 * kk * kRib, 1, along / len);
    }
    /* Контактное кольцо купола на полу: колокол стоит на полу весь удар
       (кольцо удара из набора живёт 0.5 с, а купол — до 1.8 с). Тот же
       штрих: белая жила, тёмная рубашка; включается с хлыстами (u = 1). */
    if (hit && kFoot > 0.001) {
      const rr = 1.15 * (1 + 0.03 * Math.sin(time * 5.0));
      for (let j = 0; j < FOOT_N; j++) {
        const phi = (j / FOOT_N) * TAU;
        RX[j * 3] = B[0] + sx * rr * Math.cos(phi) + ux * rr * Math.sin(phi);
        RX[j * 3 + 1] = 0.07;
        RX[j * 3 + 2] = B[2] + sz * rr * Math.cos(phi) + uz * rr * Math.sin(phi);
      }
      field.poly(RX, FOOT_N, true, 0.03, 0.92 * kFoot, 1, 1);
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
  /* Огибающая купола: с удара, полная до `full`, гаснет к `dome`. */
  const envD = (t) => (t < T.out1 ? 0 : t < T.full ? 1 : Math.pow(clamp01(1 - (t - T.full) / (T.dome - T.full)), 1.3));
  const reachAt = (t) => (t < T.out0 ? 0 : clamp01((t - T.out0) / (T.out1 - T.out0)));

  /* Труба тела. */
  const tube = new THREE.Mesh(tubeGeo(), tubeMat(P));
  tube.material.userData.u.span.value = len;
  tube.position.set(A[0], A[1], A[2]);
  tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(ux, 0, uz));
  tube.renderOrder = 5;
  tube.frustumCulled = false;
  tube.scale.set(0.001, 0.001, 0.001);
  const TUBE_R = 0.48;

  const state = { hit: false, lightA: null, lightB: null };
  vfx.spawnMesh(field.group, T.dome, (o, u) => {
    const t = u * T.dome;
    const kB = envK(t), kD = hit ? envD(t) : 0;
    const fade = Math.max(kB, kD);
    const reach = reachAt(t);
    if (fade <= 0.001) { field.set(0, 0); return; }
    writeField(t, reach, kB / fade, kD / fade);
    /* Хлысты и контактное кольцо (u = 1) включаются, когда фронт ушёл за цель. */
    field.set(fade, reach >= 1 ? 1.06 : reach);
    if (state.lightA) state.lightA();
    if (state.lightB) state.lightB();
    if (!state.hit && t >= T.out1) { state.hit = true; onHit(); }
  });
  vfx.spawnMesh(tube, T.off, (o, u) => {
    const t = u * T.off;
    const k = envK(t);
    const reach = reachAt(t);
    const r = TUBE_R * (0.55 + 0.45 * k);
    o.scale.set(Math.max(0.001, r), Math.max(0.001, reach * len), Math.max(0.001, r));
    o.material.userData.fade.value = k;
  });

  /* Шар каста у руки: растёт 0.15 с, стоит весь луч, гаснет вместе с ним.
     Ядро — там, где из шара выходит луч. */
  glass(vfx, P, { x: A[0], y: A[1], z: A[2], at: 0, r0: 0.15, r1: 0.6, grow: 0.15, hold: T.full + 0.05, life: T.orbEnd, seed: (seed % 5) + 2, hot: 1.0, dense: 0.85, rim: 0.5, core: 0.22, halo: 0.5, detail: 3, edge: 0.03, edgeK: 0.2 });
  state.lightA = holdLight(vfx, A[0] + ux * 0.4, 1.4, A[2] + uz * 0.4, P[0], 14, T.full, 0.4, 7);
  kit.sparks(vfx, { x: A[0] + ux * 0.5, y: A[1], z: A[2] + uz * 0.5, n: 14, colour: P[0], tail: mid, speed: 7, life: 0.35, cone: { dir: fp.dir, half: 0.45 }, gravity: -4, size: 0.1, at: vfx.now + T.out0, r: rng });

  /*
   * Удар: купол ~2.5 м с ядром, шипы, кольцо по полу, свет, толчок, след.
   * След кладётся ЗДЕСЬ, в момент удара, а не при касте: декаль рождается
   * от `vfx.now`, и положенная при касте она висела у цели за 0.1 с до
   * выстрела (замер r1: «мутный диск на 0.15 с»).
   */
  const nSpike = kit.countFor(44, Math.PI * 1.25 * 1.25, kit.REF_AREA.impact, 90);
  const onHit = () => {
    state.lightB = holdLight(vfx, B[0], 1.5, B[2], P[0], hit ? 26 : 12, T.full - T.out1, 0.45, 10);
    vfx.screen.shake(hit ? 0.32 : 0.15);
    vfx.screen.flash(P[0], hit ? 0.04 : 0.02);
    vfx.screen.aberration(hit ? 0.5 : 0.25);
    if (hit) {
      spikes(vfx, P, { x: B[0], y: 1.0, z: B[2], n: nSpike, at: vfx.now, r: rng });
      /* Кольцо по полу — с насыщенным `deep` вместо серо-голубого P[2]. */
      floorRing(vfx, [P[0], P[1], deep], { x: B[0], z: B[2], r0: 0.4, r1: 3.4, life: 0.5, at: 0 });
      kit.decal(vfx, { type: 'laser', x: B[0], z: B[2], radius: 1.6, hold: 20, tint: mid, seed: (seed % 9) + 1 });
    } else {
      kit.sparks(vfx, { x: B[0], y: 1.1, z: B[2], n: 16, colour: P[0], tail: mid, speed: 6, life: 0.4, gravity: -6, size: 0.1, at: vfx.now, r: rng });
    }
  };
  if (hit) {
    /* Купол живёт дольше луча (до 1.8 с): на 1.6 с над ковром ещё тает
       колокол, как у эталона на 1600 мс. */
    glass(vfx, P, { x: B[0], y: 1.1, z: B[2], at: T.out1, r0: 0.3, r1: 1.25, grow: 0.14, hold: T.full, life: T.dome, squash: 0.92, seed: (seed % 7) + 1, hot: 1.0, dense: 0.5, rim: 0.85, core: 0.46, halo: 1.05, coreAt: [-ux * 0.6, 0.5, -uz * 0.6], detail: 3, edge: 0.02, edgeK: 0.12 });
  }

  /* Штрихи внутри трубы — «подсвеченный туман» летит к цели всю полную фазу;
     пул свечения: на белом полу их нет, на тёмном теле и стенах — есть. */
  const nMote = kit.countFor(110, fp.area, REF, 320);
  const white = new THREE.Color(0.95, 0.97, 1.0);
  vfx.glow.emit(nMote, (i, s) => {
    const f = rng(), a = rng() * TAU, rr = rng() * 0.35;
    const v = 5 + rng() * 4;
    const life = Math.min(0.25 + rng() * 0.3, (len * (1 - f) + 0.4) / v);
    s.pos(A[0] + ux * len * f + sx * Math.cos(a) * rr, A[1] + Math.sin(a) * rr, A[2] + uz * len * f + sz * Math.cos(a) * rr);
    s.vel(ux * v, 0, uz * v);
    s.gravity(0, 0, 0);
    s.color(white, mid);
    s.life(vfx.now + T.out1 + rng() * (T.full - T.out1), life, 0.06 + rng() * 0.06, kit.SHAPE.streak);
    s.ext(0, 0.6, 1, 1);
  });

  /*
   * Ковёр искр на полу: под всем путём (±1.0 м, гуще у оси) и в круге ~2.2 м
   * у цели. Пул тела (обычный блендинг) и цвет `deep` от рождения до смерти:
   * на белом полу аддитивная и серая точка невидимы (замер r1: ~100 серых
   * крапин), тёмная насыщенная читается. Форма — обломок/точка 0.06–0.1 м
   * (2.6–4.4 px с трансляции; 0.045 м в i1 усреднялись в бледные крапины): крошка 0.08–0.14 м читалась синим конфетти, у
   * эталона — мелкие блики (замер 2.1).
   *
   * ЖИЗНЬ КОРОТКАЯ, РОЖДЕНИЕ ДОЛГОЕ. Точка гаснет прозрачностью, и долгая
   * точка полжизни висит бледной серо-голубой крапиной (замер 2.1 на 1.6 с:
   * blue60 214 против 1766 на 0.45). Теперь жизнь 0.6–1.1 с, а рождение
   * растянуто по rng^1.15 на 2.4 с после выхода: в любой момент большинство
   * видимых точек молоды и насыщенны, ковёр редеет числом, а не бледнеет;
   * на 1.6 с он ещё плотный, к 2.9 с гаснет. Вторая копия — белая в пуле
   * свечения, мелкая: на тёмных лапах и обломках ковёр светится.
   */
  /* Чернила ковра: тот же тон, но насыщенность 0.9 и светлота 0.33 — у `deep`
     разность b−r ≈ 107, и точка на половине жизни (α ≈ 0.43) уже серо-голубая;
     у чернил ≈ 146, и она остаётся синей до двух третей жизни. */
  const hsl = {};
  P[2].getHSL(hsl);
  const ink = new THREE.Color().setHSL(hsl.h, 0.9, 0.33), inkEnd = ink.clone().multiplyScalar(0.55);
  const dot = (x, z, i, s, glow) => {
    const born = vfx.now + T.out0 + 0.05 + Math.pow(rng(), 1.15) * 2.4;
    const life = 0.6 + Math.pow(rng(), 1.2) * 0.5;
    s.pos(x, 0.035, z);
    s.vel(0, 0, 0);
    s.gravity(0, 0, 0);
    if (glow) { s.color(mid, deep); } else { s.color(i % 6 === 0 ? mid : ink, inkEnd); }
    /* Две трети — обломки с жёстким краем (плотный тёмный пиксель на белом),
       треть — мягкие точки: мягкая точка в 5 px усредняется в бледную
       крапину (замер i2: ковёр читался светло-голубой пылью). */
    s.life(born, life, (glow ? 0.06 : 0.085) + rng() * 0.05, i % 4 === 0 ? kit.SHAPE.dot : kit.SHAPE.chip);
    s.ext(0, 0.6, 0, glow ? 1 : 0);
  };
  /*
   * БЮДЖЕТ ПУЛА, а не «сколько влезет». Пул тел — кольцо на 5000 мест
   * (`MAX_PARTICLES`, `vfx.js`), и старое место отдаётся молча. При потолках
   * 2600 на ковёр трассы и 800 у цели ОДИН луч занимал ~3400 мест — 68 %
   * пула на каст (замечание ревьюера круга 2). Три одновременных луча (а их
   * в бою бывает три) выселяли бы друг у друга и ковёр, и искры, и всё, что
   * успел положить кто-то ещё. Потолки снижены до 1200 и 420 (суммарно ~26 %),
   * а плотность добрана РАЗМЕРОМ обломка, а не их числом: на белом полу
   * читается площадь тёмного, и 1200 обломков по 0.085 м кроют её не хуже
   * 2600 по 0.065.
   */
  const nDot = kit.countFor(3100, fp.area, REF, 1200);
  const pathDot = (glow) => (i, s) => {
    const f = rng();
    const q = rng() * 2 - 1;
    const lat = Math.sign(q) * Math.pow(Math.abs(q), 1.3) * 1.0;
    dot(A[0] + ux * len * f + sx * lat, A[2] + uz * len * f + sz * lat, i, s, glow);
  };
  vfx.body.emit(nDot, pathDot(false));
  vfx.glow.emit(Math.round(nDot * 0.2), pathDot(true));
  if (hit) {
    const nTgt = kit.countFor(900, Math.PI * 2.2 * 2.2, kit.REF_AREA.impact, 420);
    const tgtDot = (glow) => (i, s) => {
      const a = rng() * TAU, d = Math.sqrt(rng()) * 2.2;
      dot(B[0] + Math.sin(a) * d, B[2] + Math.cos(a) * d, i, s, glow);
    };
    vfx.body.emit(nTgt, tgtDot(false));
    vfx.glow.emit(Math.round(nTgt * 0.2), tgtDot(true));
  }
  return true;
}
