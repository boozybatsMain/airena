/**
 * Молния · ПОЛЕ РАЗРЯДОВ: материалы трёх слоёв ленты (рубашка, свечение,
 * ядро), инстансированная геометрия сегментов и генераторы нитей: ломаная
 * со смещением середин (`strandSegs`), явная ломаная (`polySegs`),
 * ПУЧОК-КЛЕТКА (`bundleSegs`) — то, чем рисуется главный разряд луча, —
 * и треск по полу: одиночный глиф (`glyphSegs`) и ковёр глифов вдоль
 * трассы (`crackleSegs`). Это единый примитив, на котором стоят все
 * доставки (см. `../arc.js`).
 *
 * Замер эталона (Storm Lance, 1280×720, ~35 px/м): нить — ядро ~2 px чисто
 * белое, ореол 6–10 px насыщенно-синий, снаружи слабое широкое свечение.
 * На трансляционной дистанции (26 м, 46°, ~41 px/м поперёк) это ядро
 * полушириной ~0.02 м и ореол в четыре ядра. Оба слоя — ОБЫЧНЫЙ блендинг:
 * на белом полу аддитивного не видно (§10.1), а аддитивные ядра полутора
 * десятков нитей, лёгших друг на друга с торца, складывались в HDR-столб,
 * который bloom размазывал на весь кадр. Ядро всегда лежит ПОВЕРХ синего
 * ореола — поэтому белая нить читается и на белом полу: белое на синем, а
 * не белое на белом; пересечения и клубок у цели белеют сами, потому что
 * там ядер больше, чем рубашек. Аддитивное только широкое свечение — оно
 * работает на тёмном фоне и телах.
 *
 * Замер турнира (02.09, трансляция 26 м, столб пучка 110×110 px на 0.3 с):
 * ядро (1.45,1.5,1.6) с маской^1.2 давало 72 горячих пикселя при потолке
 * 238 на полу 224 — белых нитей с трансляции не было. Теперь ядро
 * (3.5,3.7,4.1), резкий край (~2 px) и 0.15 в bloom: наложения белеют. Почему
 * так ярко: ACES прижимает 1.7 к 243 из 255, 3.5 — к 251, и горячий пиксель
 * получается из самого ядра, а не из bloom. Bloom при таком цвете — вуаль:
 * при 0.3 столб с трансляции белел целиком (замер r4: 1465 горячих, но
 * синих 1701 против нужных 2000), при 0.15 ядро остаётся нитью.
 *
 * Замер полировки r1 (02.09, все четыре глаза): рубашка в 6.5 ядра у полутора
 * десятков нитей сливалась в одну гладкую синюю трубу с белыми каракулями
 * внутри — «чулок», а не нити, каждая со своим ореолом. Теперь рубашка —
 * 4 ядра с мягким краем: между нитями виден пол, край пучка рваный.
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
 * 0.021 м — 2 px с трансляции, рубашка 0.084 м — ~7 px синей полосы вокруг
 * (эталон: ореол 6–10 px при ядре 2 px). При 6.5 ядра рубашки соседних нитей
 * сливались в сплошную трубу (замер r1: «чулок»); при 4 у каждой нити свой
 * ореол, и между ячейками виден пол. Свечение 0.15 м — мягкий ореол, который
 * виден только на тёмном. Порядок: рубашка под свечением под ядром — ядро
 * всегда сверху.
 */
const LAYER = {
  jacket: { mul: 4.0, order: 7, blend: THREE.NormalBlending },
  glow: { mul: 7.0, order: 9, blend: THREE.AdditiveBlending },
  core: { mul: 1.0, order: 10, blend: THREE.NormalBlending },
};

/** Тёмно-синий остывшего следа: у эталона на 1.5 с крошки (25,58,96) на тёмном полу. */
const NAVY = [0.02, 0.05, 0.28];

/**
 * Кольцо 6, а не 8: инструмент съёмки греет пул шестью кастами, и седьмой
 * каст (первый глаз) при кольце 8 собирал материалы на кадре спавна —
 * первый кадр опаздывал на 40–60 мс (замер r1 по `index.json`).
 */
function boltMat(layer, P) {
  return pooled(`arc:bolt:${layer}:${hex(P)}`, () => makeBoltMat(layer, P), 6);
}

/**
 * Лента сегмента. Инстанс — один сегмент (`sa` → `sb`), квад из четырёх вершин:
 * `positionLocal.x` — доля вдоль (0..1), `positionLocal.y` — поперёк (−1..1).
 * В пространстве вида квад растягивается вдоль касательной с запасом на
 * ширину (стыки соседних сегментов перекрываются, а не рвутся) и раздвигается
 * поперёк по `cross(касательная, взгляд)` — лента всегда смотрит на камеру.
 * В пикселе — капсула: расстояние до отрезка в метрах через ширину слоя.
 *
 * Атрибут `scfg` = (полуширина ядра, яркость, фаза, u вдоль). ЗНАК яркости —
 * есть ли у сегмента белое ядро: отрицательная яркость даёт метку без ядра
 * (треск по полу — сплошные синие штрихи, а не синие колечки с белой
 * серединой; замер турнира: метки с ядром читались как макароны). У метки
 * без ядра концы ПРЯМЫЕ, а не круглые: круглые концы на штрихе шириной
 * 1.5 px читались таблетками (замер r1 с бокового и низкого глаза).
 *
 * Униформы: `fade` — общее затухание, `hot` — вспышка перестройки (1 в
 * момент перестройки, 0 через ~35 мс: ядро ярче в полтора раза, рубашка и
 * свечение шире на треть), `reach` — доля пути, до которой разряд дорос
 * (фронт МЯГКИЙ: 5 % пути перед фронтом гаснут, чуть позади него сегменты
 * горят вдвое ярче — лидер; при `reach` ≥ 1 всё включено), `cool` —
 * остывание 0..1: рубашка уходит в тёмно-синий, ядро и свечение гаснут.
 * Так след на полу отделяется от живого разряда: у эталона на 1.5 с лежат
 * тёмно-синие крошки, а не бледная копия молнии. Нить с ядром остывает на
 * треть от `cool`: пучок гаснет числом нитей, а не сереет.
 */
function makeBoltMat(layer, P) {
  const L = LAYER[layer];
  const m = new THREE.MeshBasicNodeMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: L.blend,
  });
  const fade = withFade(m);
  const hot = uniform(0), reach = uniform(1), cool = uniform(0);
  m.userData.u = { fade, hot, reach, cool };

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

  /* Яркость: модуль — сила слоя, знак — есть ли ядро. */
  const bright = cfg.y.abs(), withCore = step(float(0), cfg.y);
  /* Расстояние до отрезка в пикселе: за концами растёт, поперёк — по ширине;
     всё в метрах, делённых на ширину слоя. Нить — капсула (стыки звеньев
     круглые), метка без ядра — прямой срез. */
  const lenW = b.sub(a).length();
  const alongM = along.mul(lenW.add(W.mul(2))).sub(W);
  const dEnd = alongM.negate().max(alongM.sub(lenW)).max(0);
  const dAcross = across.abs().mul(W);
  const dRound = dEnd.mul(dEnd).add(dAcross.mul(dAcross)).sqrt();
  const dBox = dEnd.max(dAcross);
  const d = mix(dBox, dRound, withCore).div(W.max(1e-4));
  const mask = oneMinus(d).clamp(0, 1);
  /* Прорастание: фронт мягкий — сегменты в 5 % пути перед `reach` гаснут к
     нему; у каждой нити пучка своё `u` (см. `bundleSegs`), так что фронт
     рваный, а не стена (замер r1: покрытие 37 → 0 за 8 px). При `reach` ≥ 1
     всё включено — доставки, которым прорастание не нужно, ставят 1. */
  const grown = reach.greaterThanEqual(1.0);
  const on = select(grown, float(1), oneMinus(smoothstep(reach.sub(0.05), reach, cfg.w)));
  const tip = select(grown, float(0), smoothstep(reach.sub(0.16), reach.sub(0.04), cfg.w));
  /* Мерцание ~25 Гц от часов: нить живёт между перестройками, а не стоит. */
  const flick = mx_noise_float(vec3(TIME.mul(23.0), cfg.z.mul(7.3), 0.7)).mul(0.2).add(0.9);
  const base = fade.mul(on);
  const coolK = cool.mul(oneMinus(withCore.mul(0.7)));
  const live = oneMinus(coolK);

  if (layer === 'core') {
    /* Ядро — ОБЫЧНЫЙ блендинг, а не аддитивный. С трансляции пучок смотрит
       на камеру торцом, и полтора десятка нитей ложатся друг на друга: в
       аддитиве они складывались в HDR-столб, а bloom радиуса 0.85 размазывал
       его вуалью на весь кадр (снято в первом раунде). Белое поверх синего
       не складывается дальше белого; в bloom уходит малая доля — там, где
       ядра легли друг на друга, кадр белеет, как у эталона. */
    /* Край ядра РЕЗКИЙ (smoothstep 0.15→0.7 маски): мягкий край ^0.9 клал
       полупрозрачное белое на рубашку, и пиксели выходили ни белыми, ни
       синими — бледно-голубыми (замер r3: 116 горячих и 1831 синих в столбе
       против нужных 300 и 2000). Резкое ядро — либо белый пиксель, либо синий. */
    m.colorNode = mix(col(P[0]).mul(1.1), vec3(3.5, 3.7, 4.1), smoothstep(float(0.1), float(0.6), mask));
    const alpha = smoothstep(float(0.15), float(0.7), mask).mul(base).mul(bright).mul(withCore).mul(live)
      .mul(flick.mul(0.5).add(0.5)).mul(hot.mul(0.4).add(0.95)).mul(tip.add(1)).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.15));
  }
  if (layer === 'glow') {
    m.colorNode = mix(col(P[2]), col(P[1]), mask.pow(2.0).mul(0.5));
    const alpha = mask.pow(2.0).mul(0.15).mul(base).mul(bright).mul(live).mul(hot.mul(0.6).add(0.8)).mul(tip.add(1)).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.1));
  }
  /* Рубашка: насыщенно-синяя, непрозрачная в середине, мягкий край снаружи;
     мерцание её не трогает — форма стоит, пока мигает ядро. Именно она
     держит молнию на белом полу. Остывая, уходит в тёмно-синий и перестаёт
     светиться. Середина светлеет к P[1] чуть сильнее под ядром. */
  const liveC = mix(col(P[2]).mul(0.85), mix(col(P[2]), col(P[1]), withCore.mul(0.2).add(0.12)), mask.pow(2.5));
  m.colorNode = mix(liveC, vec3(...NAVY), coolK);
  /* Прозрачность рубашки НАСЫЩАЕТСЯ по яркости: от 0.6 она уже непрозрачна.
     Иначе градиент яркости ядра вдоль пути и любая огибающая метки давали
     полупрозрачную синюю ленту, сквозь которую белел пол, — сиреневую
     (замер r1: метки на 1.2 с (89,113,207) при цвете рубашки, который на
     непрозрачной ленте даёт (40,110,215)). */
  const sat = smoothstep(float(0.0), float(0.6), bright);
  const solid = smoothstep(float(0.0), float(0.7), mask).mul(0.97);
  const alpha = solid.mul(base).mul(sat).mul(tip.mul(0.3).add(1)).clamp(0, 1);
  m.opacityNode = alpha;
  return markGlow(m, alpha.mul(0.08).mul(live));
}

/* ── поле разрядов ──────────────────────────────────────────────────────── */

/** Раскладка инстанса: a×3, b×3, cfg×4 (ширина, яркость, фаза, u вдоль). */
const STRIDE = 10;

/**
 * Поле: одна инстансированная геометрия сегментов и три меша на ней (три
 * слоя). Нити переписываются целиком на каждой перестройке — `write(items,
 * rng)`; элемент списка — нить (`a`, `b`, см. `strandSegs`), явная ломаная
 * (`pts`, см. `polySegs`), пучок (`bundle: true`, см. `bundleSegs`), глиф
 * треска (`glyph: true`, см. `glyphSegs`) или ковёр треска (`crackle: true`,
 * см. `crackleSegs`). У элемента может быть свой генератор `rng` — так след
 * на полу держит форму между перестройками. `set({fade, hot, reach, cool})`
 * — униформы слоёв.
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
        else if (s.glyph) glyphSegs(s, r, put);
        else if (s.crackle) crackleSegs(s, r, put);
        else if (s.pts) polySegs(s, put);
        else strandSegs(s, r, put, 0);
      }
      geo.instanceCount = n;
      ibuf.needsUpdate = true;
      if (ibuf.clearUpdateRanges) ibuf.clearUpdateRanges();
      if (ibuf.addUpdateRange) ibuf.addUpdateRange(0, Math.max(1, n) * STRIDE);
    },
    set({ fade = 1, hot = 0, reach = 1, cool = 0 }) {
      for (const m of mats) {
        const u = m.userData.u;
        u.fade.value = fade; u.hot.value = hot; u.reach.value = reach; u.cool.value = cool;
      }
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
 * нитей в трубу-конус (радиус `r0` у руки → `r1` у цели по `t^cone`), каждая
 * — ломаная с звеньями ~`step` (0.7–1.3 шага) и изломами 30–60°.
 *
 * Закон узла — ЗИГЗАГ ВОКРУГ ДРЕЙФА в сечении трубы: у нити есть медленно
 * поворачивающееся направление хода (`turn` рад на узел) и сторона, которая
 * на каждом узле с вероятностью 3/4 меняется; прыжок уходит от дрейфа на
 * 40–90° в эту сторону. Так соседние звенья ломаются под прямым углом и
 * больше (прыжок ~0.3 м поперёк на 0.45 м вдоль — звено под 35° к оси, а
 * следующее — в другую сторону), а дрейф гонит нить вокруг оси: нити
 * пересекаются, и между ними читаются МНОГОУГОЛЬНЫЕ ячейки 0.3–0.6 м.
 * Прежний закон «блуждание с памятью направления» (угол ±70° на узел) давал
 * плавно вьющиеся волнистые петли (замер r1: «синусоиды, а не изломы»).
 * У стенки трубы нить отражается внутрь (дрейф разворачивается).
 *
 * КОНУС: `r0` 0.02 → `r1` по `t^1.35` — первая треть пути не шире 0.25 м,
 * дальняя половина расходится до трубы ~1.4 м с обрубками наружу (замер r1:
 * при `t^0.9` пучок читался трубой почти постоянной ширины, 51 → 100 px).
 * Ширина нити тоже растёт вдоль пути (`taper` — доля у руки): у руки нити
 * лежат друг на друге, и полная ширина давала белый жгут в 20 px.
 * Яркость ядра растёт вдоль пути (`ramp` — доля у руки): дальний клубок —
 * самое белое место эталона, у руки видны отдельные нити.
 *
 * Между нитями — перемычки с изломом посередине (`rungs` на шаг), от нитей
 * — обрубки НАРУЖУ из трубы, в дальней половине (`stubs` — доля нитей с
 * обрубком): край пучка рваный, не гладкая колбаса. У дальнего конца —
 * клубок коротких нитей (`tangle` 0..1 — плотность). Треть нитей обрывается
 * раньше цели — рваный дальний край. Весь пучок чуть выгнут одной дугой
 * (`bend` — доля длины). Три нити-героя шире и ярче, остальные тоньше: без
 * иерархии пучок читался проволочной сеткой.
 *
 * `u` вдоль (для `reach`) — доля пути по оси, у каждой нити растянутая на
 * свои 0–14 %: при прорастании нити кончаются на разной доле пути, и фронт
 * рваный. Клубок — у `u1`.
 *
 * Замер эталона (1280×720): 12–20 нитей, звенья 0.3–0.6 м, изломы 30–60°,
 * труба 0.8–1.4 м, дальний конец — белый клубок. Здесь ~420 сегментов на
 * 9 м при `n` 14.
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
  const stepM = s.step ?? 0.45;
  const K = clampN(Math.round(L / stepM), 3, 64);
  const r0 = s.r0 ?? 0.02, r1 = s.r1 ?? 0.6, cone = s.cone ?? 1.35;
  const minY = s.minY ?? 0.08;
  const width = s.width ?? 0.03, bright = s.bright ?? 1, phase = s.phase ?? 0;
  const u0 = s.u0 ?? 0, u1 = s.u1 ?? 1;
  const wander = s.wander ?? 1, turn = s.turn ?? 0.9;
  const heroes = s.heroes ?? 3;
  const taper = s.taper ?? 0.75, ramp = s.ramp ?? 0.7;
  /* Изгиб пучка: одна дуга в случайном направлении сечения. */
  const bAng = rng() * TAU, bAmp = (s.bend ?? 0.04) * L * (0.5 + rng());
  const bc1 = Math.cos(bAng) * bAmp, bc2 = Math.sin(bAng) * bAmp;
  const R = (t) => r0 + (r1 - r0) * Math.pow(t, cone);
  const wAt = (t) => width * (taper + (1 - taper) * t);
  const kAt = (t) => bright * (ramp + (1 - ramp) * t);
  const at = (t, p, q) => {
    const bow = Math.sin(Math.PI * t);
    const lx = p + bc1 * bow, ly = q + bc2 * bow;
    return [
      ax + ux * L * t + e1x * lx + e2x * ly,
      Math.max(minY, ay + uy * L * t + e1y * lx + e2y * ly),
      az + uz * L * t + e1z * lx + e2z * ly,
    ];
  };

  /* Узлы нитей: pts[i][k]; ts[i][k] — доля пути по оси; ust[i] — растяжка u. */
  const pts = new Array(n), ts = new Array(n), ust = new Array(n);
  for (let i = 0; i < n; i++) {
    /* Треть нитей обрывается раньше цели — рваный дальний край. */
    const endT = i < n * 0.66 ? 1 : 0.78 + rng() * 0.2;
    const Ki = Math.max(2, Math.round(K * endT));
    const P = [at(0, 0, 0)], T = [0];
    let p = 0, q = 0, drift = rng() * TAU, zig = rng() < 0.5 ? -1 : 1;
    for (let k = 1; k <= Ki; k++) {
      let t = (k / Ki) * endT;
      if (k < Ki) t += ((rng() - 0.5) * 0.6) / K;
      const rad = R(t);
      drift += (rng() - 0.5) * turn;
      if (rng() < 0.75) zig = -zig;
      const ang = drift + zig * (0.7 + rng() * 0.9);
      /* Прыжок не больше радиуса трубы здесь: у руки нити почти прямые. */
      const jump = Math.min(stepM * (0.45 + rng() * 0.65) * wander, rad * 1.3 + 0.03);
      p += Math.cos(ang) * jump; q += Math.sin(ang) * jump;
      const d = Math.hypot(p, q);
      if (d > rad) { const kk = (rad * (0.8 + rng() * 0.2)) / d; p *= kk; q *= kk; drift += Math.PI * (0.6 + rng() * 0.6); }
      /* Нити, дошедшие до цели, сходятся к ней: там клубок. */
      if (k === Ki && endT === 1) { p *= 0.3; q *= 0.3; }
      P.push(at(t, p, q));
      T.push(t);
    }
    pts[i] = P; ts[i] = T; ust[i] = 1 + rng() * 0.14;
  }

  const uAt = (t, i) => u0 + (u1 - u0) * Math.min(0.999, t * (i == null ? 1 : ust[i]));
  /* Нити: первые `heroes` — «герои», шире (и ещё шире к цели) и ярче. */
  for (let i = 0; i < n; i++) {
    const hero = i < heroes;
    const wk = hero ? 1.1 : 0.8 + rng() * 0.2;
    const kk = hero ? 1.05 : 0.85 + rng() * 0.15;
    const P = pts[i], T = ts[i];
    for (let j = 0; j + 1 < P.length; j++) {
      const p = P[j], q = P[j + 1], tm = (T[j] + T[j + 1]) * 0.5;
      put(p[0], p[1], p[2], q[0], q[1], q[2], wAt(tm) * (hero ? wk + 0.35 * tm : wk), kAt(tm) * kk, phase + i, uAt(T[j + 1], i));
    }
  }

  /* Перемычки: на каждом шаге пара нитей, если их узлы не дальше метра;
     излом посередине — перемычка тоже кусок молнии, а не линейка. */
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
      const t = ts[i][Math.min(k, ts[i].length - 1)];
      const w = wAt(t) * 0.6, kb = kAt(t) * 0.85, u = uAt(t, i);
      put(p[0], p[1], p[2], m[0], m[1], m[2], w, kb, phase + 40 + k, u);
      put(m[0], m[1], m[2], q[0], q[1], q[2], w, kb, phase + 40 + k, u);
    }
  }

  /* Обрубки: от узла дальней половины НАРУЖУ из трубы под 40–70° к
     касательной, 0.3–0.8 м, с изломом — они и делают край пучка рваным. */
  const stubs = s.stubs ?? 0.5;
  for (let i = 0; i < n; i++) {
    if (rng() >= stubs) continue;
    const P = pts[i], T = ts[i];
    if (P.length < 4) continue;
    const k = clampN(1 + Math.floor((0.4 + rng() * 0.6) * (P.length - 2)), 1, P.length - 2);
    const p = P[k];
    let tx = P[k + 1][0] - P[k - 1][0], ty = P[k + 1][1] - P[k - 1][1], tz = P[k + 1][2] - P[k - 1][2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    /* Наружу — от точки оси на этой доле пути; у самой оси — куда попало. */
    const ap = at(T[k], 0, 0);
    let nx = p[0] - ap[0], ny = p[1] - ap[1], nz = p[2] - ap[2];
    if (Math.hypot(nx, ny, nz) < 0.05) { nx = rng() * 2 - 1; ny = rng() * 2 - 1; nz = rng() * 2 - 1; }
    const dn = nx * tx + ny * ty + nz * tz;
    nx -= tx * dn; ny -= ty * dn; nz -= tz * dn;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const ang = (40 + rng() * 30) * (Math.PI / 180);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const dirK = rng() < 0.3 ? -1 : 1;
    const len = 0.3 + rng() * 0.5;
    const dxs = tx * ca * dirK + nx * sa, dys = ty * ca * dirK + ny * sa, dzs = tz * ca * dirK + nz * sa;
    /* второй перпендикуляр для излома посередине */
    const cx = ty * nz - tz * ny, cy = tz * nx - tx * nz, cz = tx * ny - ty * nx;
    const kk = (rng() - 0.5) * 0.6 * len;
    const m = [p[0] + dxs * len * 0.5 + cx * kk, Math.max(minY, p[1] + dys * len * 0.5 + cy * kk), p[2] + dzs * len * 0.5 + cz * kk];
    const q = [p[0] + dxs * len, Math.max(minY, p[1] + dys * len), p[2] + dzs * len];
    const w = wAt(T[k]) * 0.55, kb = kAt(T[k]) * 0.8, u = uAt(T[k], i);
    put(p[0], p[1], p[2], m[0], m[1], m[2], w, kb, phase + 80 + i, u);
    put(m[0], m[1], m[2], q[0], q[1], q[2], w, kb, phase + 80 + i, u);
  }

  /* Клубок у цели: короткие ломаные внутри шара 0.6·r1 — белая путаница,
     самое яркое место разряда. */
  const tangle = s.tangle ?? 1;
  const m = Math.round(n * tangle);
  const [cx, cy, cz] = at(1, 0, 0);
  const rt = Math.max(0.2, r1 * 0.6);
  for (let i = 0; i < m; i++) {
    let px = cx + (rng() - 0.5) * 2 * rt, py = Math.max(minY, cy + (rng() - 0.5) * 2 * rt * 0.8), pz = cz + (rng() - 0.5) * 2 * rt;
    const segs = 3 + Math.floor(rng() * 2);
    const w = wAt(1) * (0.8 + rng() * 0.3), kb = bright * 1.15;
    for (let j = 0; j < segs; j++) {
      const l = 0.18 + rng() * 0.22;
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

/* ── треск по полу ──────────────────────────────────────────────────────── */

/**
 * ГЛИФ ТРЕСКА: одна метка на полу в точке (`x`, `z`, высота `y`) —
 * `links` звеньев (3–5) по 0.07–0.20 м (× `len`) с поворотами 45–110° между
 * звеньями, СТОРОНА поворота меняется (зигзаг): рваный обломок проволоки,
 * как у эталона на 0.8 с, а не скобка L/Z одного размера (замер r1: метки в
 * 2–4 звена по 0.12–0.28 м читались с трансляции буквами, с низкого глаза —
 * таблетками). `arc` — длинная дуга треска: 5–7 звеньев по 0.16–0.30 м с
 * поворотами 20–50°, идёт вдоль `dir`; несколько таких в ковре читаются
 * трещинами вдоль трассы. `dot` — вместо зазубрины точка 0.02–0.06 м.
 * Ширина ТОНКАЯ: 0.009 м полуширины ядра → рубашка 0.036 м, ~1.5 px с
 * трансляции; концы прямые (см. материал). Яркость по умолчанию
 * ОТРИЦАТЕЛЬНАЯ — без белого ядра. `dir` — начальный угол (иначе
 * случайный; луч даёт направление трассы ± разброс, чтобы ковёр шёл вдоль
 * пути), `u` — доля вдоль трассы для `reach`.
 */
function glyphSegs(s, rng, put) {
  const x0 = s.x, z0 = s.z, y = s.y ?? 0.05;
  const width = s.width ?? 0.009, bright = s.bright ?? -0.9, phase = s.phase ?? 0;
  const u = s.u ?? s.u0 ?? 1;
  const scale = s.len ?? 1;
  if (s.dot) {
    const l = (0.02 + rng() * 0.04) * scale, a = rng() * TAU;
    put(x0, y, z0, x0 + Math.sin(a) * l, y, z0 + Math.cos(a) * l, width * 1.4, bright, phase, u);
    return;
  }
  const arc = !!s.arc;
  const links = s.links ?? (arc ? 5 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 3));
  let ang = s.dir ?? rng() * TAU, x = x0, z = z0;
  let zig = rng() < 0.5 ? -1 : 1;
  for (let q = 0; q < links; q++) {
    const l = (arc ? 0.16 + rng() * 0.14 : 0.07 + rng() * 0.13) * scale;
    const nx = x + Math.sin(ang) * l, nz = z + Math.cos(ang) * l;
    put(x, y, z, nx, y, nz, width, bright, phase + q * 0.1, u);
    x = nx; z = nz;
    if (rng() < 0.8) zig = -zig;
    ang += zig * (arc ? 0.35 + rng() * 0.5 : 0.8 + rng() * 1.1);
  }
}

/**
 * КОВЁР ТРЕСКА вдоль трассы `a`→`b`: `n` глифов под путём и по бокам
 * ±`spread` м (полоса шире к дальнему концу), гуще под дальней половиной
 * (эталон), треть — точки, шестая часть — длинные дуги вдоль трассы;
 * масштаб глифов 0.6–2.2 (0.1–0.5 м). `u` глифа — доля вдоль оси, чтобы
 * ковёр появлялся вместе с пучком по `reach`. Это ковёр на одну перестройку
 * — для доставок, которым не нужна своя жизнь у каждой метки (веер, зона);
 * луч ведёт метки поштучно через `glyph` с собственным сидом и жизнью.
 */
function crackleSegs(s, rng, put) {
  const [ax, , az] = s.a, [bx, , bz] = s.b;
  const dx = bx - ax, dz = bz - az;
  const L = Math.hypot(dx, dz);
  if (L < 0.2) return;
  const ux = dx / L, uz = dz / L, sx = -uz, sz = ux;
  const axis = Math.atan2(ux, uz);
  const y = s.y ?? 0.05;
  const spread = s.spread ?? 1.2;
  const n = Math.round(s.n ?? 30);
  const width = s.width ?? 0.009, bright = s.bright ?? -0.9, phase = s.phase ?? 0;
  const u0 = s.u0 ?? 0, u1 = s.u1 ?? 1;
  for (let m = 0; m < n; m++) {
    const f = Math.pow(rng(), 0.7);
    const lat = (rng() * 2 - 1) * spread * (0.35 + 0.65 * f);
    const dot = rng() < 0.3, arc = !dot && rng() < 0.2;
    glyphSegs({
      x: ax + ux * L * f + sx * lat, z: az + uz * L * f + sz * lat, y,
      width: width * (0.7 + rng() * 0.6), bright, phase: phase + m * 0.37, u: u0 + (u1 - u0) * f,
      dot, arc, len: arc ? 1.4 + rng() : 0.6 + rng() * 1.3, dir: axis + (rng() - 0.5) * (arc ? 0.9 : 2.2),
    }, rng, put);
  }
}

/* ── нить ───────────────────────────────────────────────────────────────── */

/**
 * Одна нить: ломаная со смещением середин между `a` и `b`, затем ветки.
 *
 * Смещение перпендикулярно отрезку. Амплитуда САМОПОДОБНАЯ: на каждом
 * уровне — `kink` от длины звена этого уровня (по умолчанию 0.36 → изломы
 * 30–40° на каждом масштабе), но не больше `jag`·L (общий размах). Прежний
 * закон «`jag`·L на первом уровне и половина на каждом следующем» давал
 * метровую дугу и мелкую рябь 0.1 м на шаге 0.3 м — волнистого червя, а не
 * молнию (замер турнира: лучи веера и метки читались «макаронами»).
 *
 * Ветки уходят от случайной точки середины нити под 20–40°, тоньше и
 * короче; на второй глубине — одна ветка, дальше нет.
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
  const bow = L * (s.jag ?? 0.12);
  const kink = s.kink ?? 0.36;
  const yk = s.floor ? 0.25 : 1;
  for (let lv = 0, stride = N; lv < levels; lv++, stride >>= 1) {
    const half = stride >> 1;
    const amp = Math.min(bow, ((L * stride) / N) * kink);
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
      width: s.width * 0.6, bright: bright * 0.75, jag: (s.jag ?? 0.12) * 1.3, kink, branches: s.branches,
      floor: s.floor, floorY: s.floorY, floorTop: s.floorTop, minY: s.minY,
      phase: phase + 1.7 + q, u0: u, u1: Math.min(1, u + 0.1), step: s.step,
    }, rng, put, depth + 1);
  }
}

export { LAYER, STRIDE, boltMat, boltField, strandSegs, polySegs, bundleSegs, glyphSegs, crackleSegs };
