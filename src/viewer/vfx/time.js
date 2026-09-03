/**
 * ВРЕМЯ (`time`) — ЗАМЕДЛЕННОЕ И ПРОПУЩЕННОЕ ВРЕМЯ (план §6.3).
 *
 * Что это такое. Сепия, точность, неподвижность. Пузырь, внутри которого
 * всё выглядит фотографией: пылинки ВИСЯТ в воздухе, несколько тонких
 * обручей (часовые кольца) идут с разной скоростью, и один — назад
 * СТУПЕНЯМИ, кромка пузыря — тёмная умбровая рубашка с волоском горячего
 * ядра и преломляющим краем, на полу под ним — циферблат тёмными линиями.
 * Всё ТИКАЕТ: яркость ступенчато прыгает дважды в секунду, а не пульсирует
 * плавно. Ни огня, ни искр, ни вида урона.
 *
 * НА БЕЛОМ ПОЛУ СТИХИЯ — ЭТО ЕЁ ТЁМНЫЕ ЛИНИИ, А НЕ СВЕТЛЫЕ (P3). Палитра
 * сепийная: `P[1]` (#d4b48a) — бледный загар, на белом полу он невидим, и
 * жить там имеет право только `P[2]` (тёмная умбра). Светлое `P[1]` уходит
 * во второй аддитивный слой — он работает на телах и стенах, где фон тёмный.
 *
 * ── ЧТО ЗДЕСЬ ПОЯВИЛОСЬ ПОСЛЕ ЗАМЕЧАНИЯ «ОБРУЧИ ВЫГЛЯДЯТ ДЁШЕВО» ───────────
 *
 * Эталон качества — холод (`ice.js`): у него есть настоящее твёрдое тело на
 * полу, живой диск со своим материалом, беат в начале и в конце, несколько
 * ФОРМ частиц. У времени всего этого не было: один прозрачный шар, три
 * обруча и точки в 5 сантиметров. Добавлено ровно то же по составу, но НЕ
 * его вещество:
 *   · ПОЛЕ СТРЕЛОК — инстансированные твёрдые тела трёх форм (часовая
 *     стрелка, гномон, осколок стекла). У льда кристалл выезжает упруго и
 *     ЛОПАЕТСЯ; у времени предмет встаёт СТУПЕНЯМИ и СТОИТ неподвижно, а на
 *     срыве заваливается — вещи времени останавливаются, а не растут;
 *   · ЖИВОЙ ЦИФЕРБЛАТ — диск со своим материалом, который рисуется обходом
 *     стрелки, а не включается простынёй, плюс кольцо контакта под телом;
 *   · БЕАТЫ — оболочка, тёмная волна по полу, свет и толчок камеры на касте
 *     и на сроке; у удара — `kit.impactKit`;
 *   · ВТОРАЯ ФОРМА ЧАСТИЦЫ — застывшие обломки с массой: вылетают и гаснут
 *     ровно в ноль скорости, а не падают.
 * Все примитивы холода СКОПИРОВАНЫ и переписаны здесь: модуль стихии не
 * имеет права импортировать другую стихию — её файл правят своими кругами.
 *
 * Формы: зона (пузырь медленного времени), себя (ускорение), мигание
 * (пропуск времени), стена — плюс удар, статус и заряд (§P6). Ни луча, ни
 * снаряда: у времени нечем стрелять, и правило E1 их отвергает.
 *
 * НАСТРОЙКА. Размеры, направления и длительности каждой формы идут через
 * `kit.tune(e, {...})`: опись в начале функции — это и есть список того, что
 * можно крутить записью. Значения по умолчанию — сегодняшние, кроме
 * стойкости следов: см. «след-проекция» ниже.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import {
  TIME, clamp01, col, easeOutBack, markGlow, markDistort, mulberry, pooled, rnd, seedOf, setFade, shared, withFade,
} from './core.js';
import * as kit from './kit.js';
import { EFFECTS } from '../../skills/registry.js';

const {
  float, vec2, vec3, uniform, mix, smoothstep, oneMinus, uv, abs: tabs, max: tmax,
  atan: tatan, dot: tdot, normalView, positionViewDirection, positionGeometry, positionWorld,
  step: tstep, fract: tfract, sin: tsin, cos: tcos, mx_noise_float, mx_fractal_noise_float,
} = TSL;

const TAU = Math.PI * 2;
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const hex = (P) => P.map((c) => c.getHexString()).join();
/* ТИК: ступенька дважды в секунду. Время не пульсирует, оно щёлкает. */
const TICK = () => tstep(tfract(TIME.mul(2.0)), float(0.5));
/* Тот же тик на процессоре: движение времени идёт ступенями, а не гладко. */
const stepped = (v, hz) => Math.floor(v * hz) / hz;
/*
 * ЧЕРНИЛА: почти чёрная умбра для гравировки — деления, щели, штрихи. Своя
 * константа, а не заимствованная: у льда ту же роль играет `GAP`, но он
 * сине-зелёный и приватен для своего файла (решение 7: нейтральные цвета
 * сверх трёх ступеней палитры разрешены).
 */
const INK = vec3(0.04, 0.025, 0.015);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/*
 * ── ГЕОМЕТРИЯ ──────────────────────────────────────────────────────────────
 *
 * Три ТВЁРДЫХ формы времени: часовая стрелка, гномон солнечных часов и
 * осколок стекла, застывший в падении. Все неиндексированные, с плоскими
 * нормалями (`computeVertexNormals` по несшитым треугольникам): грань обязана
 * читаться гранью. Основание в y=0, высота 1 — масштаб даёт поле.
 *
 * Порядок вершин — тот же, что у кварца холода (обход от +x к +z, крышка
 * через вершину, донце через точку под основанием): при обратном обходе
 * нормали смотрят внутрь и тело выворачивается наизнанку.
 */
const pushTri = (a, A, B, C) => a.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);

/** Кольцо из четырёх точек: полуширина `w` по x, полутолщина `t` по z. */
function ring4(w, t, y) {
  return [
    new THREE.Vector3(w, y, 0), new THREE.Vector3(0, y, t),
    new THREE.Vector3(-w, y, 0), new THREE.Vector3(0, y, -t),
  ];
}

/** Протянуть тело по кольцам одинаковой длины, закрыть вершиной и донцем. */
function loft(rings, apex, base) {
  const pos = [];
  for (let k = 0; k + 1 < rings.length; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length;
      pushTri(pos, A[i], B[i], B[j]);
      pushTri(pos, A[i], B[j], A[j]);
    }
  }
  const top = rings[rings.length - 1];
  for (let i = 0; i < top.length; i++) pushTri(pos, top[i], apex, top[(i + 1) % top.length]);
  const bot = rings[0];
  for (let i = 0; i < bot.length; i++) pushTri(pos, bot[(i + 1) % bot.length], base, bot[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Часовая стрелка: плоское лезвие с плечом и остриём, толщина втрое меньше
    ширины — с трансляционной камеры это ЛИНИЯ, а не палка. */
function makeHand(rng) {
  const w = 0.09 + rng() * 0.04;
  const t = 0.026 + rng() * 0.012;
  const sh = 0.6 + rng() * 0.12;
  return loft(
    [ring4(w, t, 0), ring4(w * 1.02, t, 0.16), ring4(w * 0.42, t * 0.8, sh)],
    new THREE.Vector3((rng() - 0.5) * 0.04, 1, 0),
    new THREE.Vector3(0, -0.02, 0),
  );
}

/** Гномон: клин, у которого катет стоит, а гипотенуза падает к полу. На
    белом полу его читает ТЕНЬ, а не собственная яркость. */
function makeGnomon(rng) {
  const d = 0.3 + rng() * 0.16, t = 0.03 + rng() * 0.02;
  const rect = (dd, y) => [
    new THREE.Vector3(0, y, -t), new THREE.Vector3(dd, y, -t),
    new THREE.Vector3(dd, y, t), new THREE.Vector3(0, y, t),
  ];
  return loft(
    [rect(d, 0), rect(d * 0.55, 0.45), rect(d * 0.2, 0.8)],
    new THREE.Vector3(0.02, 1, 0),
    new THREE.Vector3(d * 0.4, -0.02, 0),
  );
}

/** Осколок стекла: трёхгранная щепка с неровными рёбрами. Углы и радиусы
    выбираются ОДИН РАЗ на грань — иначе рёбра винтом и тело самопересечено. */
function makeSliver(rng) {
  const ang = [], rad = [];
  for (let i = 0; i < 3; i++) {
    ang.push(((i + (rng() - 0.5) * 0.4) / 3) * TAU);
    rad.push(0.05 + rng() * 0.05);
  }
  const at = (y, k) => ang.map((a, i) => new THREE.Vector3(Math.cos(a) * rad[i] * k, y, Math.sin(a) * rad[i] * k));
  return loft(
    [at(0, 1), at(0.52, 0.8), at(0.84, 0.34)],
    new THREE.Vector3((rng() - 0.5) * 0.08, 1, (rng() - 0.5) * 0.08),
    new THREE.Vector3(0, -0.02, 0),
  );
}

/* Геометрии делятся всеми кастами (`shared`: `updateFx` их не утилизирует);
   лениво — чтобы не платить на страницах, где времени не будет. */
let GEO = null;
function geo() {
  if (!GEO) {
    const r = mulberry(0xc10c);
    GEO = {
      /* Три формы на весь бой; разнообразие внутри формы даёт материал. */
      n: [shared(makeHand(r)), shared(makeGnomon(r)), shared(makeSliver(r))],
      bubble: shared(new THREE.IcosahedronGeometry(1, 4)),
      /* Полоса обруча задаётся униформой `wid` = метры / радиус, поэтому
         геометрия обязана покрывать внутренний радиус: `RingGeometry(0.3, 1)`. */
      hoop: shared(new THREE.RingGeometry(0.3, 1, 96).rotateX(-Math.PI / 2)),
      ring: shared(new THREE.RingGeometry(0.55, 1.0, 72).rotateX(-Math.PI / 2)),
      disc: shared(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2)),
    };
  }
  return GEO;
}

/* ── пузырь ─────────────────────────────────────────────────────────────── */

/**
 * `bubbleMat` — нормально смешанная сфера: нутро тонировано `P[0]` при
 * альфе 0.06 (обесцвечивает то, что за ним, — «фотография»), кромка —
 * рубашка `P[2]·0.9` при 0.85, растущая к силуэту, поверх неё HDR-волосок
 * `(2.4,2.2,1.8)` на `fres^7`, и `markDistort` по кромке (край линзы). Тик
 * добавляет 0.25 к альфе кромки.
 */
function bubbleMat(P) {
  return pooled(`time:bubble:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      /* ЛИЦЕВАЯ сторона: при `DoubleSide` задняя полусфера складывалась с
         передней, кромка складывалась сама с собой и пузырь выходил ровным
         белесым шаром вместо сепийной кромки (замер i1 с бокового глаза). */
      transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    m.userData.u = { fade };
    const fres = oneMinus(tabs(tdot(normalView, positionViewDirection))).clamp(0, 1);
    /* Кромка ЗЖЕ и темнее: 0.6→1.0 вместо 0.35→1.0. Волосок ^12, не ^7 —
       при ^7 HDR-белое расползалось по всей кромке и съедало умбру. */
    const rim = smoothstep(float(0.6), float(1.0), fres);
    const hair = fres.pow(12.0);
    const tick = TICK();
    m.colorNode = mix(mix(col(P[0]).mul(0.9), col(P[2]).mul(0.8), rim), vec3(2.4, 2.2, 1.8), hair.mul(0.7).clamp(0, 1));
    const alpha = mix(float(0.05), float(0.92), rim).add(tick.mul(rim).mul(0.25)).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    /* Преломление по кромке: сдвиг наружу по нормали, сильный только у края. */
    markDistort(m, normalView.xy.mul(0.35).mul(fres.pow(2.0)), fres.pow(2.0).mul(fade));
    return markGlow(m, hair.mul(fade).clamp(0, 1));
  }, 4);
}

function bubble(P, radius) {
  const m = bubbleMat(P);
  const mesh = new THREE.Mesh(geo().bubble, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.scale.setScalar(radius);
  return { mesh, m, set(fade, r = radius) { m.userData.fade.value = fade; mesh.scale.setScalar(Math.max(0.001, r)); } };
}

/* ── часовые обручи ─────────────────────────────────────────────────────── */

/**
 * `hoopMat` — КОПИЯ `ringMat` из `arc/common.js`, а не импорт: модуль стихии
 * не имеет права зависеть от другой стихии (её файлы правят своими кругами).
 *
 * ПЕРЕСМОТР ПОСЛЕ «ОБРУЧИ ВЫГЛЯДЯТ ДЁШЕВО». Прежде вся переменность полосы
 * держалась на ОДНОМ угловом шуме, и тот правил только альфой: две краски,
 * ровный кант, ничего внутри. Слоёв теперь столько же, сколько у самого
 * дешёвого напольного кольца холода, и все они читаются тёмным:
 *   · зерно по кругу правит И ЦВЕТОМ, и альфой;
 *   · волосяная ЩЕЛЬ поперёк полосы — разлом это отсутствие света;
 *   · двенадцать ДЕЛЕНИЙ тем же приёмом, что на циферблате следа
 *     (`|sin(6·угол)|` у нуля), поэтому обруч читается шкалой, а не кольцом;
 *   · отдельная ГУБА по кромке полосы — она и жила уходят в свечение.
 * Жила остаётся HDR-волоском `(2.4,2.2,1.8)`, край — `P[2]`: бледный загар
 * на белом полу читается пылью.
 */
function hoopMat(P) {
  return pooled(`time:hoop:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const wid = uniform(0.1);
    m.userData.u = { fade, wid };
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const d = q.length();
    const dd = d.sub(oneMinus(wid.mul(0.5))).abs().div(wid.mul(0.5).max(1e-4));
    const band = oneMinus(smoothstep(float(0.72), float(1.0), dd));
    const core = oneMinus(smoothstep(float(0.0), float(0.2), dd));
    const ang = tatan(q.y, q.x);
    const rag = mx_noise_float(vec3(tcos(ang).mul(3.0), tsin(ang).mul(3.0), 0.5)).mul(0.15).add(0.9);
    const grain = mx_fractal_noise_float(vec3(tcos(ang).mul(4.0), tsin(ang).mul(4.0), 3.0), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const n1 = mx_fractal_noise_float(vec3(tcos(ang).mul(7.0), tsin(ang).mul(7.0), dd.mul(1.5)), 3, 2.0, 0.55, 1);
    const crack = oneMinus(smoothstep(float(0.0), float(0.06), tabs(n1))).mul(band);
    const ticks = oneMinus(smoothstep(float(0.0), float(0.09), tabs(tsin(ang.mul(6.0))))).mul(band);
    const lip = smoothstep(float(0.78), float(0.98), dd).mul(band);
    const body = mix(col(P[2]), col(P[1]).mul(0.5), grain.mul(0.45));
    const inked = mix(body, INK, tmax(crack, ticks).mul(0.85));
    m.colorNode = mix(inked, vec3(2.4, 2.2, 1.8), core);
    const alpha = band.mul(rag).mul(grain.mul(0.3).add(0.7)).mul(0.95)
      .add(crack.mul(0.5)).add(ticks.mul(0.35)).add(lip.mul(0.45))
      .mul(fade).mul(TICK().mul(0.15).add(0.85)).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, core.add(lip.mul(0.5)).clamp(0, 1).mul(alpha).mul(0.4));
  }, 4);
}

function hoop(P, r, tilt, thick) {
  const m = hoopMat(P);
  const mesh = new THREE.Mesh(geo().hoop, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.scale.setScalar(r);
  /* Наклон ПОСЛЕ масштаба: `scale.setScalar` не должен его крутить. */
  mesh.rotation.z = tilt;
  m.userData.u.wid.value = thick / r;
  return { mesh, m, set(fade, rr = r) { m.userData.fade.value = fade; mesh.scale.setScalar(rr); m.userData.u.wid.value = thick / rr; } };
}

/* ── твёрдое тело: стрелки, гномоны, осколки ────────────────────────────── */

/**
 * Материал стрелок — плотное тело, а не плёнка: `MeshStandardNodeMaterial`,
 * то есть его ЛЕПИТ ключевой свет и оно кладёт тень. На белом полу это и
 * есть главный носитель формы (P3): тень тёмная, а бликовать нечему.
 *
 * Слои: сепийная толща от умбры у основания к загару у острия, зерно по
 * мировым координатам (соседние стрелки не близнецы), НАСЕЧКА ШКАЛЫ —
 * восемь тёмных поясов по высоте, от которой предмет читается размеченным,
 * и волосок горячего ядра ТОЛЬКО на острие. Волосок ступенчато прыгает
 * тиком: единственное, что у стоящей стрелки меняется во времени.
 */
function clockMat(key, P) {
  return pooled(`time:needle:${key}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ metalness: 0.1, roughness: 0.45 });
    const fade = withFade(m);
    const h = positionGeometry.y.clamp(0, 1);
    const fres = oneMinus(tabs(tdot(normalView, positionViewDirection))).pow(2.0).clamp(0, 1);
    const grain = mx_fractal_noise_float(positionWorld.mul(3.0), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const notch = oneMinus(smoothstep(float(0.0), float(0.04), tabs(tfract(h.mul(8.0)).sub(0.5))));
    const body = mix(col(P[2]), col(P[1]).mul(0.7), h.pow(1.3).mul(0.55).add(grain.mul(0.12)).clamp(0, 1));
    const inked = mix(body, INK, notch.mul(0.7));
    m.colorNode = mix(inked, col(P[1]), fres.mul(0.22));
    const tip = h.pow(14.0).mul(TICK().mul(0.5).add(0.5));
    m.emissiveNode = col(P[0]).mul(tip.mul(fade).mul(0.8));
    /* В свечение уходит ТА ЖЕ маска, что светится: помеченное целиком тело
       на белом полу стирается в белую кляксу (замер стенда /ice). */
    return markGlow(m, tip.mul(fade).clamp(0, 1));
  });
}

/* ── пол: живой циферблат и кольцо контакта ─────────────────────────────── */

/**
 * ЖИВОЙ ЦИФЕРБЛАТ. Не декаль: у декали типа `time` нет ни одного живого
 * члена (обод, штрихи и стрелка стоят), поэтому пол под пузырём был
 * неподвижен всю его жизнь. Здесь диск со своим материалом, и он РИСУЕТСЯ
 * ОБХОДОМ: грань закрашивается там, где стрелка уже прошла (`reveal`), потом
 * стрелки идут ступенями — минутная вперёд, часовая НАЗАД.
 *
 * Ни следа свечения: пол не имеет права цвести (§10.1), а на белом полу
 * светлая линия и так невидима — держит форму только тёмная.
 */
function dialMat(P) {
  return pooled('time:dial', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const reveal = uniform(0), hand = uniform(0), hand2 = uniform(0), span = uniform(3), seed = uniform(0);
    m.userData.u = { reveal, hand, hand2, span, seed };
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const d = q.length();
    const ang = tatan(q.y, q.x);
    /* Доля круга 0..1 от угла: по ней и закрашивается грань, и стоят стрелки. */
    const a01 = tfract(ang.div(TAU).add(0.5));
    const P3 = vec3(q.mul(span), seed);
    const grain = mx_fractal_noise_float(P3.mul(1.7).add(13.0), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);

    const face = oneMinus(smoothstep(float(0.9), float(0.99), d));
    const rim = smoothstep(float(0.9), float(0.94), d).mul(oneMinus(smoothstep(float(0.985), float(1.0), d)));
    const inner = oneMinus(smoothstep(float(0.0), float(0.012), tabs(d.sub(0.66))));
    /* Шестьдесят мелких делений и двенадцать крупных: |sin(k·угол)| у нуля. */
    const minor = oneMinus(smoothstep(float(0.0), float(0.035), tabs(tsin(ang.mul(30.0)))))
      .mul(smoothstep(float(0.82), float(0.85), d)).mul(oneMinus(smoothstep(float(0.9), float(0.92), d)));
    const major = oneMinus(smoothstep(float(0.0), float(0.075), tabs(tsin(ang.mul(6.0)))))
      .mul(smoothstep(float(0.7), float(0.73), d)).mul(oneMinus(smoothstep(float(0.9), float(0.93), d)));
    const h1 = oneMinus(smoothstep(float(0.0), float(0.006), tabs(a01.sub(hand))))
      .mul(oneMinus(smoothstep(float(0.56), float(0.62), d)));
    const h2 = oneMinus(smoothstep(float(0.0), float(0.013), tabs(a01.sub(hand2))))
      .mul(oneMinus(smoothstep(float(0.36), float(0.42), d)));
    const ink = rim.add(minor.mul(0.8)).add(major).add(inner.mul(0.7)).add(h1).add(h2.mul(0.9)).clamp(0, 1);
    const painted = oneMinus(smoothstep(reveal, reveal.add(0.02), a01));
    /* Стрелки ВЕДУТ обход и потому видны и за его краем. */
    const on = tmax(painted, h1.add(h2).clamp(0, 1));
    m.colorNode = mix(col(P[2]).mul(0.85), INK, ink);
    m.opacityNode = face.mul(grain.mul(0.05).add(0.1)).add(ink.mul(0.92))
      .mul(on).mul(TICK().mul(0.12).add(0.88)).mul(fade).clamp(0, 1);
    return m;
  });
}

/**
 * Кольцо контакта под телом — двойник иневого кольца холода, но ТЁМНЫЙ. У
 * льда наружная губа кольца светлая и уходит в свечение; на белом полу
 * светлая линия исчезает, и у времени губа сделана чернилами (P3).
 */
function ringMat(P) {
  return pooled('time:ring', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const d = q.length();
    const ang = tatan(q.y, q.x);
    const grain = mx_fractal_noise_float(vec3(q.mul(5.0), 9.0), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const wob = mx_noise_float(vec3(q.mul(3.0), 2.0)).mul(0.04);
    const band = smoothstep(float(0.6), float(0.82), d).mul(oneMinus(smoothstep(float(0.94), float(1.0), d.add(wob))));
    const lip = smoothstep(float(0.9), float(0.955), d).mul(oneMinus(smoothstep(float(0.975), float(1.0), d)));
    const ticks = oneMinus(smoothstep(float(0.0), float(0.06), tabs(tsin(ang.mul(6.0))))).mul(band);
    const n1 = mx_noise_float(vec3(q.mul(6.0), 5.0));
    const crack = oneMinus(smoothstep(float(0.0), float(0.05), tabs(n1))).mul(band);
    m.colorNode = mix(mix(col(P[2]).mul(0.9), col(P[1]).mul(0.5), grain.mul(0.35)), INK,
      tmax(crack, ticks).mul(0.9).add(lip.mul(0.6)).clamp(0, 1));
    m.opacityNode = band.mul(grain.mul(0.35).add(0.3)).add(lip.mul(0.8)).add(ticks.mul(0.5))
      .mul(TICK().mul(0.12).add(0.88)).mul(fade).clamp(0, 1);
    return m;
  });
}

/** Кольцо контакта: меш на общей геометрии, ставится вызывающим. */
function contactRing(P) {
  const mesh = new THREE.Mesh(geo().ring, ringMat(P));
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Поставить живой циферблат: обход за `paint` секунд, потом стрелки идут
 * ступенями (`hz` щелчков в секунду) — минутная круг за 4 с, часовая назад
 * круг за 24 с. Уходит за `out` секунд до конца жизни.
 */
function dialAt(vfx, P, { x, z, radius, life, paint = 0.6, seed = 0, hz = 2, out = 0.45 }) {
  const m = dialMat(P);
  const u = m.userData.u;
  u.span.value = radius; u.seed.value = seed; u.reveal.value = 0;
  const mesh = new THREE.Mesh(geo().disc, m);
  mesh.position.set(x, 0.034, z);
  mesh.scale.set(radius, 1, radius);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  vfx.spawnMesh(mesh, life, (o, k) => {
    const t = k * life;
    const q = stepped(t, hz);
    u.reveal.value = clamp01(t / Math.max(0.001, paint));
    u.hand.value = (q / 4) % 1;
    u.hand2.value = (1 - (q / 24) % 1) % 1;
    setFade(o, t > life - out ? clamp01((life - t) / out) : 1);
  });
  return mesh;
}

/* ── частицы: три формы, а не одна ──────────────────────────────────────── */

/**
 * Пылинки ВИСЯТ: скорость и тяжесть нулевые, жизнь — вся жизнь пузыря.
 * `fall` держится ради одного случая — срыва кадра, когда висевшее разом
 * получает вес.
 */
function motes(vfx, P, { x, z, r, hi = 2.2, n, life, rng, at = 0, fall = 0 }) {
  const put = (pool, colour, count, size) => pool.emit(count, (i, s) => {
    const a = rng() * TAU, d = Math.sqrt(rng()) * r;
    s.pos(x + Math.sin(a) * d, 0.2 + rng() * Math.max(0.1, hi - 0.2), z + Math.cos(a) * d);
    s.vel(0, 0, 0);
    s.gravity(0, -fall, 0);
    s.color(colour, colour);
    s.life(vfx.now + at, life, size, kit.SHAPE.dot);
    s.ext(0, 1.0, 0, 0.15);
  });
  put(vfx.body, P[2], n, 0.05);
  put(vfx.glow, P[0], Math.round(n * 0.3), 0.05);
}

/**
 * ЗАСТЫВШИЕ ОБЛОМКИ — вторая форма частицы и единственное, у чего есть
 * масса. Вылетают и ГАСНУТ В НОЛЬ СКОРОСТИ: ускорение ровно `−v/жизнь`,
 * поэтому на последнем кадре скорость точно нулевая — обломок не улетает за
 * кадр, а останавливается в воздухе. Ни тяжести, ни вращения: внутри
 * остановленного времени нечему падать и не с чего крутиться, и каждый висит
 * под своим случайным углом.
 */
function frozen(vfx, P, { x, y = 0.8, z, n = 14, radius = 0.5, speed = 3.5, up = 2.4, life = 0.9, size = 0.18, at = 0, r = Math.random, shape = kit.SHAPE.chip }) {
  const born = vfx.now + at;
  vfx.body.emit(n, (i, s) => {
    const a = r() * TAU, d = Math.sqrt(r()) * radius;
    const L = rnd(life * 0.7, life * 1.3, r);
    const v = rnd(speed * 0.3, speed, r);
    const vx = Math.sin(a) * v, vz = Math.cos(a) * v, vy = rnd(up * 0.2, up, r);
    s.pos(x + Math.sin(a) * d, y + r() * 0.4, z + Math.cos(a) * d);
    s.vel(vx, vy, vz);
    s.gravity(-vx / L, -vy / L, -vz / L);
    s.color(P[2], P[2]);
    s.life(born, L, rnd(size * 0.6, size * 1.4, r), shape);
    s.ext(0, 0.9, 0, 0.1);
  });
}

/**
 * НАЛЁТ НА ТЕЛЕ: пылинки садятся ровно на силуэт капсулы (радиус `R`, а не
 * вразброс по цилиндру) и висят на нём. Облако вокруг бойца читается
 * туманом; то же число частиц НА нём читается наложенным статусом.
 */
function coat(vfx, P, { x, z, R, H, n, life, rng }) {
  const put = (pool, c1, c2, count, size, glow) => pool.emit(count, (i, s) => {
    const a = rng() * TAU;
    s.pos(x + Math.sin(a) * R, 0.15 + rng() * H, z + Math.cos(a) * R);
    s.vel(0, 0.1, 0);
    s.gravity(0, 0, 0);
    s.color(c1, c2);
    s.life(vfx.now, life, size + rng() * 0.04, kit.SHAPE.dot);
    s.ext(0, 0.8, 0, glow);
  });
  put(vfx.glow, P[0], P[1], n, 0.06, 0.6);
  put(vfx.body, P[2], P[2], Math.ceil(n * 0.6), 0.06, 0.15);
}

/** Осевшая пыль: сепия, ПАДАЮЩАЯ, а не поднимающаяся — время её уронило. */
function dust(vfx, P, o) {
  kit.mist(vfx, { colour: P[2], colour2: P[1], life: 1.4, size: 0.9, rise: 0.15, ...o });
}

/**
 * Отложить беат: у `kit.burst` нет параметра задержки (запись `at` в него
 * молча теряется), а второй конец прыжка обязан прозвучать позже первого.
 * Приём тот же, которым лёд откладывает посадку прыжка.
 */
function later(vfx, secs, fn) {
  if (secs <= 0) { fn(); return; }
  vfx.spawnMesh(new THREE.Group(), secs + 0.5, (o, u) => {
    if (o.userData.done || u * (secs + 0.5) < secs) return;
    o.userData.done = true;
    fn();
  });
}

/*
 * ── ПОЛЕ СТРЕЛОК ───────────────────────────────────────────────────────────
 *
 * Инстансы по трём формам: матрицы пересобираются каждый кадр, параметры
 * лежат в списке — приём поля кристаллов холода. Отличие в ПОВЕДЕНИИ, и оно
 * и есть стихия: у льда кристалл выезжает упруго (easeOutBack) и лопается;
 * у времени предмет встаёт СТУПЕНЯМИ (три щелчка) и СТОИТ неподвижно — ни
 * дрейфа, ни дыхания, — а на срыве заваливается набок и уходит в пол.
 *
 * Элемент списка: { x, z, yaw, lx, lz (наклон оси, мировой), h, w, born
 * (секунды от каста), v (форма) }.
 */
function field(vfx, P, items, { key, life, releaseAt = null, sink = 0.75, rng = Math.random, steps = 3, shardN = 0, dustN = 0, onRelease = null }) {
  const G = geo().n;
  const buckets = [[], [], []];
  for (const c of items) {
    if (c.fx == null) { c.fx = (rng() - 0.5) * 1.6; c.fz = (rng() - 0.5) * 1.6; }
    buckets[(c.v ?? 0) % 3].push(c);
  }
  const mat = clockMat(key, P);
  const group = new THREE.Group();
  const meshes = buckets.map((list, v) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(G[v], mat, list.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    /* Тень и есть контакт с полом: на белом полу стрелку держит она. */
    im.castShadow = true;
    im.frustumCulled = false;
    group.add(im);
    return im;
  });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), QY = new THREE.Quaternion(),
    UP = new THREE.Vector3(), S = new THREE.Vector3(), Pp = new THREE.Vector3();

  const layout = (t) => {
    const s = releaseAt == null ? 0 : clamp01((t - releaseAt) / sink);
    for (let v = 0; v < 3; v++) {
      const im = meshes[v];
      if (!im) continue;
      const list = buckets[v];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const a = clamp01((t - c.born) / 0.24);
        const g = a <= 0 ? 0 : Math.min(1, Math.ceil(a * steps) / steps);
        UP.set(c.lx + s * c.fx * 2.2, 1 - s * 0.55, c.lz + s * c.fz * 2.2).normalize();
        Q.setFromUnitVectors(Y_AXIS, UP);
        QY.setFromAxisAngle(Y_AXIS, c.yaw);
        Q.multiply(QY);
        const wk = c.w * g * (1 - s * 0.25);
        S.set(wk, Math.max(0.001, c.h * g * (1 - s * 0.25)), wk);
        Pp.set(c.x, -0.06 * c.h * (1 - g) - c.h * s * s, c.z);
        M.compose(Pp, Q, S);
        im.setMatrixAt(i, M);
      }
      im.instanceMatrix.needsUpdate = true;
    }
    return s;
  };
  layout(0);

  let released = false;
  vfx.spawnMesh(group, life, (o, u) => {
    const t = u * life;
    const s = layout(t);
    mat.userData.fade.value = 1 - s;
    if (releaseAt != null && !released && t >= releaseAt) {
      released = true;
      releaseFx(vfx, P, items, rng, shardN, dustN);
      if (onRelease) onRelease();
    }
  });
  return group;
}

/**
 * СРЫВ КАДРА: то, что стояло, разом получает скорость. У льда на этом месте
 * шаттер — осколки летят потому, что кристалл лопнул; здесь они летят
 * потому, что время пошло: щепки с настоящим вращением и тяжестью, осевшая
 * пыль, свет и короткий толчок камеры.
 */
function releaseFx(vfx, P, items, rng, shardN, dustN) {
  if (!items.length) return;
  let cx = 0, cz = 0;
  for (const c of items) { cx += c.x; cz += c.z; }
  cx /= items.length; cz /= items.length;
  if (shardN > 0) {
    vfx.add.emit(shardN, (i, s) => {
      const c = items[Math.floor(rng() * items.length)];
      const a = rng() * TAU;
      s.pos(c.x + Math.sin(a) * c.w * 0.3, rnd(0.15, 0.95, rng) * c.h, c.z + Math.cos(a) * c.w * 0.3);
      const v = rnd(1.2, 3.4, rng);
      s.vel(Math.sin(a) * v, rnd(1.4, 4.2, rng), Math.cos(a) * v);
      s.gravity(0, rnd(-11, -7, rng), 0);
      s.color(i % 3 === 0 ? P[1] : P[2], P[2]);
      s.life(vfx.now + rng() * 0.06, rnd(0.5, 1.0, rng), rnd(0.12, 0.26, rng), kit.SHAPE.shard);
      s.ext(rnd(-9, 9, rng), 0.7, 0, 0.35);
    });
  }
  if (dustN > 0) dust(vfx, P, { x: cx, y: 0.3, z: cz, n: dustN, radius: 1.2, r: rng });
  vfx.flashLight(cx, 1.2, cz, P[1], 12, 0.3, 8);
  vfx.screen.shake(0.1);
}

/* ── формы ──────────────────────────────────────────────────────────────── */

/**
 * Три обруча с разными скоростями; средний идёт НАЗАД ступенями по 0.15 с.
 * `radiusAt` меняет радиус ИЗ СОБСТВЕННОГО обхода обруча: у заряда радиус
 * правился вторым обходом, тот шёл после и затирал затухание — кольца
 * появлялись и исчезали рывком, без входа и выхода.
 */
function hoops(vfx, P, { x, y, z, r, life, thick, follow = null, fast = false, radiusAt = null }) {
  const tilts = [Math.PI / 2, 0.61, -1.05];
  const spin = fast ? [3.0, -0.6, 2.2] : [0.5, -0.2, 0.9];
  const out = [];
  for (let i = 0; i < 3; i++) {
    const h = hoop(P, r * (0.86 + i * 0.09), tilts[i], thick);
    h.mesh.position.set(x, y, z);
    vfx.spawnMesh(h.mesh, life, (o, u) => {
      const t = u * life;
      /* Средний обруч тикает ступенями по 0.15 с: он и есть «время идёт
         назад», а не просто вращается медленно. */
      const ang = i === 1 ? Math.floor(t * 6.67) / 6.67 * spin[i] : t * spin[i];
      o.rotation.y = ang;
      const rr = radiusAt ? radiusAt(u, i) : r * (0.86 + i * 0.09);
      h.set(u < 0.12 ? u / 0.12 : (u > 0.88 ? (1 - u) / 0.12 : 1), rr);
      o.rotation.z = tilts[i];
      if (follow) { const p = follow(); if (p) o.position.set(p.x, y, p.z); }
    });
    out.push(h);
  }
  return out;
}

/*
 * СЛЕД-ПРОЕКЦИЯ, А НЕ ОСТАТОК. Циферблат на полу — это проекция РАБОТАЮЩЕГО
 * пузыря, а не ожог, который обязан его пережить. Прежде он держался 20 с +
 * 4 с затухания при трёхсекундной зоне: жалоба основателя «след появляется и
 * остаётся навсегда» была ровно про эти четыре строки. Стойкость каждого
 * теперь равна собственной длительности своей формы, и она же — ручка
 * `decalHold` в описи: единственное место, где значение по умолчанию
 * НАРОЧНО не сегодняшнее.
 */

export function zone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const r = fp.radius;
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения — сегодняшние; запись, не несущая поля,
     даёт прежний кадр (см. `kit.tune`). */
  const S = kit.tune(e, {
    duration: 3,       /* жизнь зоны, с (запись зоны несёт своё) */
    grow: 0.2,         /* подъём пузыря, с */
    end: 0.15,         /* схлопывание, с */
    bubbleY: 0.75,     /* центр пузыря, доли радиуса */
    hoopY: 0.7,        /* высота обручей, доли радиуса */
    hoopScale: 0.6,    /* радиус обручей, доли радиуса зоны */
    hoopThick: r >= 3 ? 0.12 : 0.10, /* ширина полосы обруча, м */
    moteHeight: 2.2,   /* высота столба висящей пыли, м */
    motes: 80,         /* пылинок на эталонную площадь зоны */
    needles: 26,       /* стрелок на эталонную площадь зоны */
    needleH: 0.95,     /* рост стрелки, м */
    dialScale: 1.02,   /* радиус живого циферблата, доли радиуса зоны */
    release: 0.75,     /* оседание стрелок после срыва, с */
    lightEvery: 0.3,   /* подпитка света, с (пул круговой, гасит квадратично) */
    decalHold: null,   /* стойкость следа, с (null — ровно жизнь зоны) */
    decalFade: 1.5,    /* затухание следа, с */
    decalRise: 0.3,    /* проявление следа, с */
  });
  /* Границу 0.8 с ставит модуль: `kit.tune` отдаёт поле записи как есть. */
  const D = Math.max(0.8, S.duration || 3);
  const GROW = Math.min(S.grow, D * 0.5), END = Math.min(S.end, D * 0.5);

  kit.decal(vfx, {
    type: 'time', x: e.x, z: e.z, radius: r * 1.05, tint: P[2], seed: (seed % 9) + 1,
    hold: S.decalHold == null ? D : S.decalHold, fade: S.decalFade, rise: S.decalRise,
  });
  dialAt(vfx, P, {
    x: e.x, z: e.z, radius: r * S.dialScale, life: D,
    paint: Math.min(0.9, D * 0.35), seed: (seed % 9) + 1, out: Math.min(0.45, D * 0.3),
  });

  const b = bubble(P, r);
  b.mesh.position.set(e.x, r * S.bubbleY, e.z);
  vfx.spawnMesh(b.mesh, D, (o, u) => {
    const t = u * D;
    /* Рост с перелётом (easeOutBack) — пузырь ВСТАЁТ, а не надувается. */
    const k = t < GROW ? easeOutBack(t / GROW) : 1;
    const end = t > D - END ? clamp01((D - t) / END) : 1;
    b.set(end, r * Math.max(0.01, k) * (0.9 + 0.1 * end));
  });
  hoops(vfx, P, { x: e.x, y: r * S.hoopY, z: e.z, r: r * S.hoopScale, life: D, thick: S.hoopThick });

  /*
   * ТВЁРДОЕ ТЕЛО ЗОНЫ. Прежде вся её плоть была одним прозрачным шаром и
   * точками в пять сантиметров — это и есть то, что назвали дёшево. Стрелки
   * встают ступенями и стоят; каждая повёрнута на СВОЁ деление (шаг 1/12
   * круга), поэтому поле читается разметкой, а не бурьяном.
   */
  const N = clampN(kit.countFor(S.needles, fp.area, kit.REF_AREA.zone, 140), 8, 140);
  const items = [];
  for (let i = 0; i < N; i++) {
    const [nx, nz] = kit.inDisc(e.x, e.z, Math.max(0.3, r - 0.35), rng);
    items.push({
      x: nx, z: nz, v: i % 3,
      yaw: (Math.floor(rng() * 12) / 12) * TAU,
      lx: (rng() - 0.5) * 0.16, lz: (rng() - 0.5) * 0.16,
      h: S.needleH * (0.7 + rng() * 0.7), w: 0.8 + rng() * 0.5,
      born: (i / N) * Math.min(0.5, D * 0.3) + rng() * 0.04,
    });
  }
  const nMotes = clampN(kit.countFor(S.motes, fp.area, kit.REF_AREA.zone, 260), 40, 260);
  field(vfx, P, items, {
    key: 'zone', life: D + S.release + 0.1, releaseAt: D, sink: S.release, rng,
    shardN: kit.countFor(60, fp.area, kit.REF_AREA.zone, 220),
    dustN: kit.countFor(14, fp.area, kit.REF_AREA.zone, 60),
    /* Висевшая пыль разом получает вес: кадр отпустили. */
    onRelease: () => motes(vfx, P, { x: e.x, z: e.z, r: r * 0.95, hi: S.moteHeight, n: Math.round(nMotes * 0.5), life: 1.0, rng, fall: 3.2 }),
  });
  motes(vfx, P, { x: e.x, z: e.z, r: r * 0.95, hi: S.moteHeight, n: nMotes, life: D, rng });

  /*
   * БЕАТ КАСТА. Оболочка сходится, по полу уходит тёмная волна, свет и
   * короткий толчок. ВСПЫШКИ НЕТ (`flash: false`): у времени кадр не горит,
   * он замирает, а бело-горячий аддитивный шар — это язык огня и урона.
   * Режим `time`, а не `flash`: `flash` в наборе аддитивный, и на белом полу
   * он был бы белой кляксой.
   */
  kit.burst(vfx, { x: e.x, y: r * 0.5, z: e.z, radius: r * 0.3, endRadius: r * 0.95, life: 0.32, mode: 'time', colours: P, intensity: 0.7, displace: 0.16, flash: false });
  kit.shockwave(vfx, { x: e.x, z: e.z, radius: r * 1.5, r0: r * 0.25, life: 0.5, colour: P[2], intensity: 0.8 });
  dust(vfx, P, { x: e.x, y: 0.25, z: e.z, n: 8, radius: r * 0.9, r: rng });
  vfx.flashLight(e.x, r * S.hoopY, e.z, P[1], 14, 0.4, r * 3);
  vfx.screen.shake(0.1);

  /* Свет держится подпиткой: пул круговой и гасит квадратично. */
  let lightAt = -1;
  vfx.spawnMesh(new THREE.Group(), D, (o, u) => {
    const t = u * D;
    if (t - lightAt > S.lightEvery && t < D - END) { vfx.flashLight(e.x, r * S.hoopY, e.z, P[0], 6, 0.4, r + 2); lightAt = t; }
  });
  return true;
}

export function self(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const S = kit.tune(e, {
    hoopLife: 0.6,     /* сколько показывается каст ускорения, с */
    hoopThick: 0.1,    /* ширина полосы обруча, м */
    hoopScale: 1.4,    /* радиус обручей, доли радиуса тела */
    bodyY: 0.55,       /* высота обручей, доли роста тела */
    ringLife: 0.7,     /* жизнь кольца контакта, с */
    ringScale: 1.7,    /* до чего расходится кольцо, доли радиуса тела */
    needles: 7,        /* венец стрелок вокруг кастера, шт */
    needleH: 0.7,      /* рост стрелки, м */
    moteLife: 0.8,     /* сколько висит пыль, с */
    motes: 30,         /* висящих пылинок, шт */
    slivers: 14,       /* застывших щепок, шт */
    decalHold: null,   /* стойкость следа, с (null — ровно жизнь каста) */
    decalFade: 1.2,    /* затухание следа, с */
    decalRise: 0.18,   /* проявление следа, с */
    decalScale: 1.1,   /* радиус следа, доли радиуса тела */
  });
  const R = (bs ? bs.r : 0.9) * S.hoopScale, H = (bs ? bs.h : 2.0) * S.bodyY;
  const p0 = at();
  const LIVE = Math.max(S.hoopLife, S.ringLife);

  /* БЕАТ КАСТА: обручи на 0.6 с; держащееся ускорение открывает запись
     `status: boost` (§P10), и её рисует `status`. */
  hoops(vfx, P, { x: p0.x, y: H, z: p0.z, r: R, life: S.hoopLife, thick: S.hoopThick, follow: at, fast: true });
  kit.decal(vfx, {
    type: 'time', x: p0.x, z: p0.z, radius: R * S.decalScale, tint: P[2], seed: (seed % 9) + 1,
    hold: S.decalHold == null ? LIVE : S.decalHold, fade: S.decalFade, rise: S.decalRise,
  });

  /*
   * ЖИВОЙ КОНТАКТ С ПОЛОМ. След — вещь неподвижная; у каста ускорения не
   * было НИ ОДНОГО живого касания арены. Кольцо расходится СТУПЕНЯМИ (пять
   * щелчков за жизнь, а не разгон) и идёт за телом.
   */
  const ring = contactRing(P);
  ring.position.set(p0.x, 0.035, p0.z);
  vfx.spawnMesh(ring, S.ringLife, (o, u) => {
    const p = at();
    o.position.set(p.x, 0.035, p.z);
    o.scale.setScalar(Math.max(0.001, R * (0.6 + stepped(u, 5) * S.ringScale)));
    setFade(o, Math.min(1, u * 5) * (1 - u * u));
  });

  /* Венец стрелок: время вокруг кастера встало, и это видно твёрдым телом. */
  const items = [];
  for (let i = 0; i < S.needles; i++) {
    const a = (i / S.needles) * TAU + rng() * 0.2;
    const d = R * (0.95 + rng() * 0.3);
    items.push({
      x: p0.x + Math.sin(a) * d, z: p0.z + Math.cos(a) * d, v: i % 3, yaw: a,
      lx: Math.sin(a) * 0.22, lz: Math.cos(a) * 0.22,
      h: S.needleH * (0.8 + rng() * 0.5), w: 0.8 + rng() * 0.4,
      born: (i / S.needles) * 0.16,
    });
  }
  field(vfx, P, items, { key: 'self', life: LIVE + 0.6, releaseAt: LIVE, sink: 0.5, rng, shardN: 14, dustN: 6 });

  motes(vfx, P, { x: p0.x, z: p0.z, r: R * 1.2, hi: H * 2, n: S.motes, life: S.moteLife, rng });
  /* Вторая ФОРМА частицы: щепки с массой, застывшие на разлёте. */
  frozen(vfx, P, { x: p0.x, y: H, z: p0.z, n: S.slivers, radius: R * 0.6, speed: 3.2, up: 2.2, life: S.moteLife, size: 0.16, r: rng, shape: kit.SHAPE.shard });
  kit.burst(vfx, { x: p0.x, y: H, z: p0.z, radius: R * 0.35, endRadius: R * 1.05, life: 0.3, mode: 'time', colours: P, intensity: 0.8, displace: 0.14, flash: false });
  dust(vfx, P, { x: p0.x, y: 0.2, z: p0.z, n: 7, radius: R, r: rng });
  vfx.flashLight(p0.x, H, p0.z, P[1], 12, 0.35, R * 4);
  return true;
}

export function blink(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const S = kit.tune(e, {
    popLife: 0.25,     /* схлопывание и разворот пузыря, с */
    arrive: 0.1,       /* насколько конец опаздывает за стартом, с */
    bodyY: 0.55,       /* высота пузыря, доли роста тела */
    bubbleScale: 1.3,  /* радиус пузыря, доли радиуса тела */
    hoopLife: 0.4,     /* жизнь обручей на конце, с */
    hoopThick: 0.1,    /* ширина полосы обруча, м */
    trail: 8,          /* пылинок по следу, шт */
    trailLife: 0.6,    /* сколько они висят, с */
    chips: 16,         /* застывших обломков на конец, шт */
    chipLife: 0.9,     /* сколько они летят до полной остановки, с */
    decalRadius: 0.6,  /* радиус следа, м */
    decalHold: 1.0,    /* стойкость следа, с (проекция, а не остаток) */
    decalFade: 1.0,    /* затухание следа, с */
    decalRise: 0.15,   /* проявление следа, с */
    strength: 0.8,     /* сила удара прибытия на эталонной длине */
    refLen: 5,         /* эталонная длина скачка, м */
  });
  const R = (bs ? bs.r : 0.9) * S.bubbleScale, H = (bs ? bs.h : 2.0) * S.bodyY;
  const A = [e.x0, H, e.z0], B = [e.x1, H, e.z1];
  /* ПРОПУСК ВРЕМЕНИ: у старта пузырь размером с бойца схлопывается в точку с
     тиком, у конца — разворачивается из точки. */
  for (const [C, dirn] of [[A, -1], [B, 1]]) {
    const b = bubble(P, R);
    b.mesh.position.set(C[0], C[1], C[2]);
    const at = dirn > 0 ? S.arrive : 0;
    const POP = S.popLife;
    vfx.spawnMesh(b.mesh, POP + at, (o, u) => {
      const t = u * (POP + at);
      if (t < at) { b.set(0, 0.01); return; }
      const k = (t - at) / Math.max(0.001, POP * 0.8);
      b.set(1, R * (dirn > 0 ? Math.min(1, k) : Math.max(0.01, 1 - k)));
    });
    kit.decal(vfx, {
      type: 'time', x: C[0], z: C[2], radius: S.decalRadius, tint: P[2], seed: (seed % 9) + 1,
      hold: S.decalHold, fade: S.decalFade, rise: S.decalRise, at,
    });
    /*
     * ВЫТЕСНЕННОЕ ВЕЩЕСТВО. Прыжок был двумя пузырями и ничем больше: у льда
     * на каждом конце восемнадцать обломков и оболочка. Здесь обломки
     * вылетают и ОСТАНАВЛИВАЮТСЯ в воздухе — остаток пропущенного времени.
     */
    later(vfx, at, () => {
      kit.burst(vfx, { x: C[0], y: H, z: C[2], radius: 0.5, endRadius: 1.4, life: 0.3, mode: 'time', colours: P, intensity: 0.9, displace: 0.16, flash: false });
      frozen(vfx, P, { x: C[0], y: H * 0.8, z: C[2], n: S.chips, radius: 0.5, speed: 5, up: 3.4, life: S.chipLife, size: 0.2, r: rng });
      dust(vfx, P, { x: C[0], y: 0.35, z: C[2], n: 8, radius: 0.9, r: rng });
    });
  }
  /* Восемь пылинок ВИСЯТ по следу и гаснут — след пропущенного времени: не
     движение, а места, где боец был мгновение назад. */
  const n = S.trail;
  vfx.body.emit(n, (i, s) => {
    const f = (i + 0.5) / n;
    s.pos(A[0] + (B[0] - A[0]) * f, H + (rng() - 0.5) * 0.6, A[2] + (B[2] - A[2]) * f);
    s.vel(0, 0, 0); s.gravity(0, 0, 0);
    s.color(P[2], P[2]);
    s.life(vfx.now, S.trailLife, 0.09, kit.SHAPE.dot);
    s.ext(0, 1.0, 0, 0.15);
  });
  hoops(vfx, P, { x: B[0], y: H, z: B[2], r: R, life: S.hoopLife, thick: S.hoopThick });
  /* Прибытие бьёт по кадру целиком: свет, волна, толчок, вспышка, аберрация.
     Голая лампа не оставляла на камере ни следа — у времени не было НИ
     ОДНОГО эффекта, который камера чувствует как силу. Сила — от длины
     скачка, на эталонной длине она сегодняшняя. */
  const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
  const power = S.strength * clampN(len / Math.max(0.1, S.refLen), 0.6, 1.4);
  later(vfx, S.arrive, () => kit.impactKit(vfx, { x: B[0], z: B[2], radius: R * 1.5, colours: P, strength: power }));
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
  const S = kit.tune(e, {
    freezeLife: 0.25,  /* сколько держится стоп-кадр, с */
    bodyY: 0.55,       /* высота пузыря, доли роста тела */
    bubbleScale: 1.3,  /* радиус пузыря, доли радиуса тела */
    hoopScale: 1.1,    /* радиус обруча, доли радиуса пузыря */
    hoopLife: 0.3,     /* жизнь обруча, с */
    hoopThick: 0.1,    /* ширина полосы обруча, м */
    motes: 12,         /* висящих пылинок, шт */
    moteLife: 0.9,     /* сколько они висят, с */
    chips: 12,         /* застывших обломков, шт */
    chipLife: 0.7,     /* сколько они летят до остановки, с */
    burstRadius: 0.55, /* начальный радиус оболочки, м */
    burstEnd: 1.4,     /* конечный радиус оболочки, м */
    strength: 0.8,     /* сила удара по кадру */
    decalRadius: 0.7,  /* радиус следа, м */
    decalHold: 0.9,    /* стойкость следа, с (проекция, а не остаток) */
    decalFade: 1.2,    /* затухание следа, с */
    decalRise: 0.15,   /* проявление следа, с */
  });
  const R = (bs ? bs.r : 0.9) * S.bubbleScale, H = (bs ? bs.h : 2.0) * S.bodyY;

  /* УДАР ОБЯЗАН УДАРИТЬ. Раньше вся плоть попадания была четвертьсекундным
     пузырём и двенадцатью точками — единственный удар среди стихий, который
     не встряхивал кадр. Оболочка и ударный набор идут ПЕРВЫМИ, стоп-кадр
     защёлкивается поверх. */
  kit.burst(vfx, { x: cx, y: H * 1.9, z: cz, radius: S.burstRadius, endRadius: S.burstEnd, life: 0.34, mode: 'time', colours: P, intensity: 0.9, displace: 0.18, flash: false });
  kit.impactKit(vfx, { x: cx, z: cz, radius: R * 1.3, colours: P, strength: S.strength });

  const b = bubble(P, R);
  b.mesh.position.set(cx, H, cz);
  vfx.spawnMesh(b.mesh, S.freezeLife, (o, u) => b.set(u < 0.7 ? 1 : (1 - u) / 0.3, R * (0.7 + 0.3 * Math.min(1, u * 4))));
  hoops(vfx, P, { x: cx, y: H, z: cz, r: R * S.hoopScale, life: S.hoopLife, thick: S.hoopThick });

  /* Три населения вместо одного: щепки с массой, висящая пыль, осевшая
     взвесь. Одна форма частицы в одном размере — это и есть «дёшево». */
  frozen(vfx, P, { x: cx, y: H, z: cz, n: S.chips, radius: R * 0.7, speed: 4.2, up: 3, life: S.chipLife, size: 0.17, r: rng, shape: kit.SHAPE.shard });
  vfx.body.emit(S.motes, (i, s) => {
    const a = rng() * TAU, d = Math.sqrt(rng()) * R * 1.3;
    s.pos(cx + Math.sin(a) * d, 0.4 + rng() * H * 1.4, cz + Math.cos(a) * d);
    s.vel(0, 0, 0); s.gravity(0, -1.2, 0);
    s.color(P[2], P[2]);
    s.life(vfx.now, S.moteLife, 0.08, kit.SHAPE.dot);
    s.ext(0, 1.0, 0, 0.15);
  });
  dust(vfx, P, { x: cx, y: 0.3, z: cz, n: 8, radius: 0.8, r: rng });
  kit.decal(vfx, {
    type: 'time', x: cx, z: cz, radius: S.decalRadius, tint: P[2], seed: (seed % 9) + 1,
    hold: S.decalHold, fade: S.decalFade, rise: S.decalRise,
  });
  return true;
}

/** Одно тело — один статус (§P10): зона подкладывает запись каждые полсекунды. */
const STATUS = new Map();

export function status(vfx, e, P, ctx) {
  const who = e.who || 'orange';
  const S = kit.tune(e, {
    duration: EFFECTS[e.effect]?.duration ?? 1.5, /* длительность статуса, с */
    hoopThick: 0.1,   /* ширина полосы обруча над головой, м */
    tilt: Math.PI / 2, /* наклон обруча, рад */
    hoopScale: 1.3,   /* радиус обруча, доли радиуса тела */
    headY: 1.05,      /* высота обруча, доли роста тела */
    ringScale: 1.3,   /* радиус кольца под ногами, доли радиуса тела */
    ringFade: 0.85,   /* плотность кольца, доли */
    every: 0.6,       /* как часто подсыпается налёт, с */
    motes: 10,        /* пылинок в подсыпке, шт */
    moteLife: 0.8,    /* сколько они висят, с */
  });
  const dur = S.duration;
  const key = `${who}:${e.effect}`;
  const live = STATUS.get(key);
  if (live && live.until > vfx.now) { live.until = vfx.now + dur; return true; }
  const entry = { until: vfx.now + dur };
  STATUS.set(key, entry);

  const seed = seedOf(e);
  const rng = mulberry(seed);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(who) : null) || { x: e.x ?? 0, z: e.z ?? 0 };
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(who) : null;
  const R = (bs ? bs.r : 0.9) * S.hoopScale, H = (bs ? bs.h : 2.0);
  const p0 = at();
  const stopped = e.effect === 'stun';
  /* ОДИН обруч НАД ГОЛОВОЙ, идущий назад ступенями; при оглушении он стоит
     и мигает. Плюс рубашка пузыря на 0.35 и КОЛЬЦО ПОД НОГАМИ: с
     трансляционной камеры обруч над головой то и дело вне кадра или закрыт
     телом, и статус переставал читаться вовсе. */
  const TILT = S.tilt;
  const h = hoop(P, R, TILT, S.hoopThick);
  h.mesh.position.set(p0.x, H * S.headY, p0.z);
  const b = bubble(P, R * 1.1);
  b.mesh.position.set(p0.x, H * 0.55, p0.z);
  const ring = contactRing(P);
  ring.position.set(p0.x, 0.035, p0.z);
  ring.scale.setScalar(R * S.ringScale);
  const MAX = 60;
  let next = 0;
  const g = new THREE.Group();
  g.add(h.mesh, b.mesh, ring);
  vfx.spawnMesh(g, MAX, (o, u) => {
    const t = u * MAX;
    if (vfx.now > entry.until) {
      g.visible = false;
      if (STATUS.get(key) === entry) STATUS.delete(key);
      return;
    }
    g.visible = true;
    const p = at();
    h.mesh.position.set(p.x, H * S.headY, p.z);
    b.mesh.position.set(p.x, H * 0.55, p.z);
    const blink = stopped ? (Math.floor(t * 4) % 2 ? 0.25 : 1) : 1;
    h.set(blink, R);
    h.mesh.rotation.y = stopped ? 0 : -(stepped(t, 4)) * 0.8;
    /* Наклон переставляется КАЖДЫЙ кадр, поэтому он обязан браться из той же
       ручки, что и при сборке: иначе параметр молча ничего не делает. */
    h.mesh.rotation.z = TILT;
    b.set(0.35, R * 1.1);
    ring.position.set(p.x, 0.035, p.z);
    /* Кольцо под ногами — шкала, идущая НАЗАД ступенями по делению. */
    ring.rotation.y = -stepped(t, 4) * (TAU / 12);
    setFade(ring, S.ringFade);
    if (t >= next) {
      next = t + S.every;
      /* Налёт садится НА КАПСУЛУ, а не сыплется вокруг; последняя подсыпка
         не переживает сам статус — иначе пыль висит после того, как он снят. */
      const left = Math.max(0.2, entry.until - vfx.now);
      coat(vfx, P, { x: p.x, z: p.z, R: R * 0.85, H, n: S.motes, life: Math.min(S.moteLife, left), rng });
      dust(vfx, P, { x: p.x, y: H * 0.5, z: p.z, n: 3, radius: R * 0.85, size: 0.7, life: Math.min(1.2, left), r: rng });
    }
  });
  return true;
}

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null) || { x: e.x, z: e.z };
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const S = kit.tune(e, {
    windup: 0.4,      /* длина замаха, с (запись заряда несёт своё) */
    bodyY: 0.55,      /* высота сбора, доли роста тела */
    ringRadius: 2.2,  /* с чего начинают сходиться обручи, м */
    shrink: 0.5,      /* насколько они сходятся, доли начального радиуса */
    hoopThick: 0.1,   /* ширина полосы обруча, м */
    coreR: 0.55,      /* радиус ядра сбора к концу замаха, м */
    moteRadius: 2.0,  /* радиус облака висящей пыли, м */
    moteHeight: 2.0,  /* высота облака, м */
    motes: 24,        /* висящих пылинок, шт */
    inward: 26,       /* пылинок, идущих ВНУТРЬ, шт */
    needles: 6,       /* стрелок вокруг кастера, шт */
    needleH: 0.55,    /* рост стрелки, м */
    ringScale: 1.6,   /* радиус кольца под ногами, м */
  });
  const secs = Math.max(0.15, S.windup || 0.4);
  const p0 = at();
  const H = (bs ? bs.h : 2.0) * S.bodyY;
  const HR = S.ringRadius;

  /* Обручи СХОДЯТСЯ к кастеру ступенями и тикают всё чаще к концу замаха.
     Радиус правится ИЗ ИХ СОБСТВЕННОГО обхода: вторым обходом он затирал
     затухание, и кольца включались рывком. */
  hoops(vfx, P, {
    x: p0.x, y: H, z: p0.z, r: HR, life: secs, thick: S.hoopThick, follow: at,
    radiusAt: (u, i) => (HR - HR * S.shrink * stepped(u, 6)) * (0.86 + i * 0.09),
  });

  /*
   * ЯДРО СБОРА. У заряда была пустота в той точке, к которой всё сходится.
   * Ядро — СВОЙ пузырь, а не набор `kit.charge`: тот сыплет искры, а у
   * времени искр нет по определению стихии.
   */
  const core = bubble(P, 0.15);
  core.mesh.position.set(p0.x, H, p0.z);
  vfx.spawnMesh(core.mesh, secs, (o, u) => {
    const p = at();
    o.position.set(p.x, H, p.z);
    core.set(Math.min(1, u * 6) * (1 - u * u * 0.5), 0.15 + S.coreR * stepped(u, 6));
  });

  /* Поток ВНУТРЬ: пылинки рождаются на радиусе и приходят к ядру ровно к
     концу своей жизни — ускорение `−v/жизнь` тормозит их в точке сбора. */
  const born = vfx.now;
  vfx.body.emit(S.inward, (i, s) => {
    const a = rng() * TAU, d = rnd(HR * 0.6, HR, rng), oy = rnd(-0.5, 0.8, rng);
    const ox = Math.sin(a) * d, oz = Math.cos(a) * d;
    const life = rnd(secs * 0.5, secs * 0.95, rng);
    s.pos(p0.x + ox, H + oy, p0.z + oz);
    s.vel(-ox / life, -oy / life, -oz / life);
    s.gravity(0, 0, 0);
    s.color(P[2], P[1]);
    s.life(born + rng() * secs * 0.3, life, rnd(0.06, 0.12, rng), kit.SHAPE.dot);
    s.ext(0, 0.6, 0, 0.2);
  });

  /* Стрелки вокруг ног и кольцо контакта: замах СТОИТ на полу. */
  const items = [];
  for (let i = 0; i < S.needles; i++) {
    const a = (i / S.needles) * TAU + rng() * 0.25;
    items.push({
      x: p0.x + Math.sin(a) * 1.1, z: p0.z + Math.cos(a) * 1.1, v: i % 3, yaw: a,
      lx: Math.sin(a) * 0.2, lz: Math.cos(a) * 0.2,
      h: S.needleH * (0.8 + rng() * 0.5), w: 0.7 + rng() * 0.4,
      born: (i / S.needles) * secs * 0.4,
    });
  }
  field(vfx, P, items, { key: 'charge', life: secs + 0.45, releaseAt: secs, sink: 0.4, rng, shardN: 10, dustN: 4 });

  const ring = contactRing(P);
  ring.position.set(p0.x, 0.035, p0.z);
  vfx.spawnMesh(ring, secs, (o, u) => {
    const p = at();
    o.position.set(p.x, 0.035, p.z);
    o.scale.setScalar(Math.max(0.001, S.ringScale * (0.6 + stepped(u, 6) * 0.7)));
    setFade(o, Math.min(1, u * 4) * (1 - u * u));
  });
  motes(vfx, P, { x: p0.x, z: p0.z, r: S.moteRadius, hi: S.moteHeight, n: S.motes, life: secs, rng });
  return true;
}

/**
 * СТЕНА. Модуль обещал её в заголовке, но не отдавал — и запись доставалась
 * одной штатной чернильной плите (`vfx.js` рисует её как «модуль добавляет,
 * штатный рисует»: плита остаётся показанием коллизионной коробки и
 * утончается до 0.15, как только модуль вернул `true`).
 *
 * Форма — ОБОЛОЧКА, утопленная в пол, а не коробка: у коробки френель
 * постоянен на грань, и она читается тремя плоскими пластинами. Сверху по
 * гребню встают стрелки, под ней — живой циферблат: стена времени это не
 * преграда, а участок арены, где время не идёт.
 */
export function wall(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = kit.tune(e, {
    duration: 5,      /* жизнь стены, с (запись стены несёт свою) */
    w: 4,             /* ширина стены, м (полная, как в записи) */
    d: 1,             /* глубина стены, м (полная) */
    height: 2.2,      /* высота коробки, м */
    rise: 0.25,       /* подъём оболочки, с */
    drop: 0.4,        /* снятие оболочки, с */
    pad: 0.2,         /* насколько оболочка шире коробки, м */
    crest: 2.5,       /* стрелок на метр ширины */
    needleH: 0.85,    /* рост стрелки, м */
    release: 0.45,    /* оседание стрелок, с */
    dialScale: 0.6,   /* радиус циферблата, доли большей стороны */
    motes: 26,        /* висящих пылинок, шт */
    decalHold: null,  /* стойкость следа, с (null — ровно жизнь стены) */
    decalFade: 1.5,   /* затухание следа, с */
    decalRise: 0.3,   /* проявление следа, с */
  });
  const D = Math.max(0.6, S.duration || 5);
  const W = Math.max(0.6, S.w || 4), Dd = Math.max(0.5, S.d || 1);
  const HH = Math.max(0.5, (S.height || 2.2) * 0.5);

  const bm = bubbleMat(P);
  const shell = new THREE.Mesh(geo().bubble, bm);
  shell.position.set(e.x, 0, e.z);
  shell.scale.set(W / 2 + S.pad, HH, Dd / 2 + S.pad);
  shell.renderOrder = 7;
  shell.frustumCulled = false;
  vfx.spawnMesh(shell, D, (o, u) => {
    const t = u * D;
    /* Ставится и снимается СТУПЕНЯМИ: стена времени не тает, она щёлкает. */
    const on = t < S.rise ? Math.min(1, (Math.floor((t / S.rise) * 4) + 1) / 4) : 1;
    const off = t > D - S.drop ? clamp01(stepped((D - t) / S.drop, 4)) : 1;
    setFade(o, Math.min(on, off));
  });

  /* Гребень стрелок по верхней кромке: стена ЧАСОВАЯ, а не стеклянная. */
  const n = clampN(Math.round(W * S.crest), 5, 14);
  const items = [];
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    items.push({
      x: e.x + (f - 0.5) * W * 0.94, z: e.z + (rng() - 0.5) * Dd * 0.6, v: i % 3,
      yaw: (Math.floor(rng() * 12) / 12) * TAU,
      lx: (rng() - 0.5) * 0.14, lz: (rng() - 0.5) * 0.14,
      h: S.needleH * (0.8 + rng() * 0.6), w: 0.9 + rng() * 0.5,
      born: f * 0.12,
    });
  }
  field(vfx, P, items, {
    key: 'wall', life: D + S.release + 0.1, releaseAt: D - S.drop, sink: S.release, rng,
    shardN: 22, dustN: 10,
  });

  const RR = Math.max(W, Dd) * S.dialScale;
  dialAt(vfx, P, { x: e.x, z: e.z, radius: RR, life: D, paint: Math.min(1.2, D * 0.3), seed: (seed % 9) + 1 });
  kit.decal(vfx, {
    type: 'time', x: e.x, z: e.z, radius: RR, tint: P[2], seed: (seed % 9) + 1,
    hold: S.decalHold == null ? D : S.decalHold, fade: S.decalFade, rise: S.decalRise,
  });
  motes(vfx, P, { x: e.x, z: e.z, r: Math.max(W, Dd) * 0.5, hi: HH * 1.6, n: S.motes, life: D, rng });
  kit.burst(vfx, { x: e.x, y: HH * 0.6, z: e.z, radius: W * 0.2, endRadius: W * 0.5, life: 0.34, mode: 'time', colours: P, intensity: 0.7, displace: 0.14, flash: false });
  dust(vfx, P, { x: e.x, y: 0.4, z: e.z, n: 12, radius: W * 0.5, r: rng });
  vfx.flashLight(e.x, HH, e.z, P[1], 12, 0.4, Math.max(W, Dd) * 3);
  vfx.screen.shake(0.1);
  return true;
}
