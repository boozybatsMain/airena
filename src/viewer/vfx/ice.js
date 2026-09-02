/**
 * Лёд: cone · zone · self · beam · bolt · lob · impact · charge.
 *
 * Эталон — стенд /frost (решение основателя 02.09, docs/VFX.md §1.1): щит с
 * трещинами от ударов и шаттером на третьем, дождь со столбом света, полный
 * кристаллический фронт. Здесь то же самое, но параметризованное СЛЕДОМ
 * доставки: плотность кристаллов, осколков и пара считается от площади через
 * `kit.footprint`/`kit.countFor` (решение 11 — размер умения параметр, эффект
 * адаптируется, а не растягивается). Ледяная полоса стенда и ледяной клин
 * боя — одна система с разным следом.
 *
 * Правила, которые здесь принуждены и которые дороже красоты:
 *   · в свечение уходит МАСКА (кант, вершина, горячая середина скола), а не
 *     материал целиком — помеченный целиком лёд на белом полу стирается в
 *     белую кляксу (замер стенда /ice);
 *   · трещины ТЁМНЫЕ: разлом — это щель, отсутствие света;
 *   · прозрачности (transmission) нет: она показывает белый пол сквозь лёд,
 *     и честная физика даёт ровный белый. Вместо неё слои: глубина по высоте,
 *     френелевый кант, прожилки по мировым координатам, иней у основания;
 *   · материалы — из кольца `pooled` по ключу на систему (волна, дождь, купол,
 *     копьё, снаряд): новый узловой материал — это 12–22 мс на кадре спавна;
 *   · всё случайное — от `mulberry(seedOf(e))`: повтор боя выглядит так же (A2);
 *   · каждый каст оставляет след на полу (`kit.decal` типа `frost`).
 *
 * TSL, ни строки GLSL (§9.1).
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import {
  TIME, clamp01, col, easeOutBack, markGlow, mulberry, pooled, rnd, seedOf, setFade, shared, withFade,
} from './core.js';
import * as kit from './kit.js';

const {
  float, vec3, uv, uniform, mix, smoothstep, oneMinus, abs: tabs, max: tmax,
  atan: tatan, length: tlen, dot: tdot, mx_noise_float, mx_fractal_noise_float,
  positionGeometry, positionWorld, normalView, normalWorld, positionViewDirection, cameraPosition,
} = TSL;

export const READY = true;

/* ── цвета сверх трёх ступеней палитры (решение 7: нейтральные разрешены) ── */

/** Щель трещины: глубокий сине-зелёный, почти чёрный. */
const GAP = vec3(0.03, 0.16, 0.20);
/** Морозный пар: светлый, чуть холодный — на белом полу он тает в фон сам. */
const MIST = new THREE.Color(0.84, 0.93, 0.95);
/** Плотная вуаль ПЕРЕД кристаллами: холоднее, чтобы не выбеливать их. */
const MIST2 = new THREE.Color(0.58, 0.8, 0.85);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** Атомы, которые доставка кладёт НА КАСТЕРА: их удар не бьёт по его куполу. */
const SELF_ATOMS = new Set(['shield', 'heal', 'cleanse', 'boost']);

/*
 * ── ГЕОМЕТРИЯ ───────────────────────────────────────────────────────────────
 *
 * Кварц из GeometryPainterThreeJS (MIT): шестигранная призма, у которой
 * дрожит КОЛОННА грани (угол и радиус выбираются один раз на грань — рёбра
 * остаются прямыми), лёгкое сужение, пирамидальное завершение со сдвинутой
 * вершиной. Неиндексированная, плоские нормали: жёсткие грани и есть то, что
 * читается как «кристалл». Высота 1, основание в y=0.
 */
function makeQuartz(rng, slim = 1, shaft = null) {
  const sides = 6;
  const baseR = (0.16 + rng() * 0.1) * slim;
  const shaftH = shaft ?? (0.55 + rng() * 0.2);
  const taper = 0.78 + rng() * 0.16;
  const apex = new THREE.Vector3((rng() - 0.5) * 0.14 * slim, 1, (rng() - 0.5) * 0.14 * slim);

  const angles = [], radii = [];
  for (let i = 0; i < sides; i++) {
    angles.push(((i + (rng() - 0.5) * 0.34) / sides) * Math.PI * 2);
    radii.push(baseR * (0.8 + rng() * 0.4));
  }
  const lower = [], upper = [];
  for (let i = 0; i < sides; i++) {
    const c = Math.cos(angles[i]), s = Math.sin(angles[i]);
    lower.push(new THREE.Vector3(c * radii[i], 0, s * radii[i]));
    upper.push(new THREE.Vector3(c * radii[i] * taper, shaftH, s * radii[i] * taper));
  }
  const pos = [];
  const push = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  /* Крошечная вершина ПОД основанием закрывает наклонённые кристаллы снизу. */
  const bottom = new THREE.Vector3(0, -0.02, 0);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    push(lower[i], upper[i], upper[j]);
    push(lower[i], upper[j], lower[j]);
    push(upper[i], apex, upper[j]);
    push(lower[j], bottom, lower[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* Геометрии делятся всеми кастами (`shared`: `updateFx` их не утилизирует);
   лениво — чтобы не платить на страницах, где льда не будет. */
let GEO = null;
function geo() {
  if (!GEO) {
    const r = mulberry(0xc0ffee);
    GEO = {
      /* Три формы кварца на весь бой; разнообразие внутри формы дают
         прожилки по мировым координатам в материале. */
      q: [shared(makeQuartz(r)), shared(makeQuartz(r)), shared(makeQuartz(r))],
      /* Узкий длинный — сосулька и наконечник снаряда. */
      lance: shared(makeQuartz(r, 0.5, 0.78)),
      slab: shared(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)),
      dome: shared(new THREE.SphereGeometry(1, 48, 32)),
      ring: shared(new THREE.RingGeometry(0.55, 1.0, 72).rotateX(-Math.PI / 2)),
      disc: shared(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2)),
      column: shared(new THREE.CylinderGeometry(1, 1, 1, 48, 1, true)),
    };
  }
  return GEO;
}

/*
 * ── МАТЕРИАЛЫ ──────────────────────────────────────────────────────────────
 */

/**
 * Плотное тело льда — со стенда /frost, выверено против белого пола. Четыре
 * слоя: глубина по высоте, френелевый кант, прожилки шумом по мировым
 * координатам, иней у основания; медленно ползущая «толща» внутри. Высота
 * берётся из `positionGeometry` (до инстансной матрицы), поэтому градиент
 * идёт от основания к вершине у кристалла любого роста.
 *
 * `grow` — вспышка канта в момент роста (стенд: uGrow), `fade` — гаснет
 * свечение при оседании. Оба — униформы, общие на кольцо ключа.
 */
function crystalMat(key, P) {
  return pooled(`ice:${key}`, () => {
    const m = new THREE.MeshStandardNodeMaterial({ metalness: 0.05, roughness: 0.2 });
    const fade = withFade(m);
    const grow = uniform(1);
    m.userData.grow = grow;

    const h = positionGeometry.y.clamp(0, 1);
    const fres = oneMinus(tabs(tdot(normalView, positionViewDirection))).pow(2.1).clamp(0, 1);
    const veins = mx_fractal_noise_float(positionWorld.mul(2.4), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const cracks = smoothstep(float(0.46), float(0.54), veins);
    const inner = mx_fractal_noise_float(positionWorld.mul(1.1).add(vec3(0, TIME.mul(0.08), 0)), 2, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const rime = oneMinus(smoothstep(float(0.0), float(0.28), h));

    const body = mix(col(P[2]), col(P[1]), h.pow(0.8).mul(0.5).add(inner.mul(0.2)).clamp(0, 1));
    const withVeins = mix(body, col(P[0]), cracks.mul(0.28));
    const withRime = mix(withVeins, col(P[0]).mul(0.86), rime.mul(0.4));
    /* 0.42 подобрано против БЕЛОГО пола: перетянутый френель стирает
       кристалл в белый. Тёмный фон прощает всё, белый не прощает ничего. */
    const tinted = mix(withRime, col(P[0]), fres.mul(0.3));
    m.colorNode = tinted.mul(h.mul(0.3).add(0.7));

    const flare = fres.pow(1.6).mul(0.85).add(h.pow(4.0).mul(0.4)).mul(grow.mul(0.5).add(0.5));
    m.emissiveNode = col(P[0]).mul(flare.mul(fade).mul(0.9));
    /* В bloom уходит ТА ЖЕ маска, что светится, — иначе белая клякса. */
    return markGlow(m, flare.mul(fade).clamp(0, 1));
  });
}

/**
 * Плита-наледь под клином конуса: сектор с рваным краем, фронт разлома,
 * ветвящиеся ТЁМНЫЕ трещины двух масштабов, мутная наледь. Шум считается в
 * метрах (`span`), поэтому густота трещин не зависит от дальности умения.
 */
function slabMat(P) {
  return pooled('ice:slab', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const fade = withFade(m);
    const front = uniform(0), half = uniform(0.96), span = uniform(3.4), seed = uniform(0), reach = uniform(0.625);
    m.userData.u = { front, half, span, seed, reach };

    const q = uv().mul(2).sub(1);                      // y — вперёд по касту, x — поперёк
    const r = q.length();                              // 0..1, край сектора на 0.91
    const ang = tatan(q.x, q.y).abs();
    const P3 = vec3(q.mul(span).mul(1.1), seed);       // метры
    /* Наледь ВЫПЛЁСКИВАЕТСЯ за сектор (решение 8: декорация до ~2× хитбокса):
       за настоящим краем (`reach`) она рвётся шумом и редеет к полутора
       дальностям, по углу — на четверть радиана за грань клина. */
    const wob = mx_fractal_noise_float(P3.mul(1.3), 3, 2.0, 0.5, 1).mul(0.1);
    const inR = oneMinus(smoothstep(reach.mul(0.92), reach.mul(1.5), r.add(wob.mul(2.5))));
    const inA = oneMinus(smoothstep(half.sub(0.06), half.add(0.32), ang.add(wob.mul(3.0))))
      .mul(smoothstep(float(0.02), float(0.1), r));
    const edge = inR.mul(inA);
    const frontM = oneMinus(smoothstep(front, front.add(0.07), r));

    const n1 = mx_fractal_noise_float(P3.mul(0.42).add(11.0), 4, 2.0, 0.55, 1);
    const ridge = oneMinus(smoothstep(float(0.0), float(0.11), tabs(n1)));
    const n2 = mx_fractal_noise_float(P3.mul(1.15).add(3.0), 3, 2.0, 0.5, 1);
    const hair = oneMinus(smoothstep(float(0.0), float(0.05), tabs(n2))).mul(0.62);
    const crack = tmax(ridge, hair).mul(edge).mul(frontM);
    const grain = mx_fractal_noise_float(P3.mul(2.2).add(21.0), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const ice = edge.mul(frontM).mul(grain.mul(0.5).add(0.5)).mul(oneMinus(smoothstep(reach.mul(0.9), reach.mul(1.5), r)).mul(0.5).add(0.5));

    /* Трещина на белом полу — ТЁМНАЯ; горячей остаётся только середина скола. */
    const core = oneMinus(smoothstep(float(0.55), float(1.0), crack));
    const hot = smoothstep(float(0.82), float(1.0), crack);
    const slabIce = mix(col(P[2]), col(P[1]), grain.mul(0.55));
    m.colorNode = mix(mix(slabIce, GAP, oneMinus(core).mul(0.92)), col(P[0]), hot.mul(0.75));
    m.opacityNode = ice.mul(0.82).add(crack.mul(0.95)).mul(fade).clamp(0, 1);
    return markGlow(m, hot.mul(fade).clamp(0, 1));
  });
}

/**
 * Наледь зоны: диск, который проявляется ДЫРЧАТО по шуму от ударов сосулек
 * (`reveal`), а не включается простынёй; тот же тёмный разлом, что у плиты.
 */
function zoneDiscMat(P) {
  return pooled('ice:zonedisc', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const fade = withFade(m);
    const reveal = uniform(0), span = uniform(3), seed = uniform(0);
    m.userData.u = { reveal, span, seed };
    const q = uv().mul(2).sub(1);
    const r = q.length();
    const P3 = vec3(q.mul(span), seed);
    const wob = mx_fractal_noise_float(P3.mul(1.1), 3, 2.0, 0.5, 1).mul(0.06);
    const edge = oneMinus(smoothstep(float(0.84), float(0.98), r.add(wob)));
    const grain = mx_fractal_noise_float(P3.mul(1.6).add(31.0), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const show = smoothstep(grain.sub(0.14), grain, reveal);
    const n1 = mx_fractal_noise_float(P3.mul(0.45).add(17.0), 4, 2.0, 0.55, 1);
    const crack = oneMinus(smoothstep(float(0.0), float(0.11), tabs(n1))).mul(edge).mul(show);
    const hot = smoothstep(float(0.8), float(1.0), crack);
    const iceCol = mix(col(P[2]), col(P[1]), grain.mul(0.55));
    m.colorNode = mix(mix(iceCol, GAP, crack.mul(0.9)), col(P[0]), hot.mul(0.7));
    m.opacityNode = edge.mul(show).mul(grain.mul(0.4).add(0.45)).add(crack.mul(0.5)).mul(fade).clamp(0, 1);
    return markGlow(m, hot.mul(fade).clamp(0, 1));
  });
}

/**
 * Столб холодного света над зоной. С трансляционной камеры диск на полу мал,
 * а «что-то сыплется откуда-то» не читается вовсе; вертикальный объём
 * отвечает на оба вопроса — ОТКУДА и КУДА. uv.y цилиндра: 0 внизу, 1 вверху.
 */
function columnMat(P) {
  return pooled('ice:column', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const fade = withFade(m);
    const flow = mx_noise_float(vec3(uv().x.mul(9), uv().y.mul(2).sub(TIME.mul(0.35)), 0)).mul(0.3).add(0.7);
    /* Силуэт цилиндра гаснет к краю — столб читается объёмом, а не трубой. */
    const facing = tabs(tdot(normalView, positionViewDirection)).pow(0.9);
    m.colorNode = mix(col(P[1]), col(P[0]), oneMinus(uv().y).pow(2.0).mul(0.5));
    m.opacityNode = oneMinus(uv().y).pow(1.4).mul(0.3).mul(flow).mul(facing).mul(fade);
    return markGlow(m, oneMinus(uv().y).pow(2.0).mul(0.6).mul(facing).mul(fade));
  });
}

/**
 * Купол щита — со стенда /frost: вся плотность на канте (френель) и в
 * ползущих прожилках, тело видно СКВОЗЬ. Удары: волна по поверхности от
 * точки попадания (`hitDir`/`hitAge`) и трещины, раскрывающиеся дырчато по
 * второму шуму от удара к удару (`crack`). Трещины тёмные.
 */
function domeMat(P) {
  return pooled('ice:dome', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const fade = withFade(m);
    const crack = uniform(0), hitDir = uniform(new THREE.Vector3(0, 1, 0)), hitAge = uniform(1);
    m.userData.u = { crack, hitDir, hitAge };

    const n = normalWorld;
    const fres = oneMinus(tabs(tdot(normalView, positionViewDirection))).pow(2.0).clamp(0, 1);
    const drift = vec3(0, TIME.mul(0.05), TIME.mul(0.03));
    const v1 = mx_fractal_noise_float(n.mul(3.0).add(drift), 3, 2.0, 0.5, 1);
    const vein = oneMinus(smoothstep(float(0.0), float(0.07), tabs(v1)));

    const cellN = mx_noise_float(n.mul(1.6).add(vec3(31, 31, 31))).mul(0.5).add(0.5);
    const reveal = smoothstep(cellN.sub(0.12), cellN, crack);
    const c1 = mx_fractal_noise_float(n.mul(5.0).add(vec3(13, 13, 13)), 4, 2.0, 0.55, 1);
    const crackLine = oneMinus(smoothstep(float(0.0), float(0.05), tabs(c1))).mul(reveal);

    /* Волна удара: хордовое расстояние до точки попадания на единичной сфере. */
    const dd = tlen(n.sub(hitDir));
    const ring = oneMinus(smoothstep(float(0.0), float(0.14), tabs(dd.sub(hitAge.mul(2.0))))).mul(oneMinus(hitAge));

    const base = mix(mix(col(P[2]), col(P[1]), fres.mul(0.8).add(0.1)), GAP, crackLine.mul(0.85));
    m.colorNode = mix(base, col(P[0]), vein.mul(0.35).add(ring).clamp(0, 1));
    m.opacityNode = fres.pow(1.2).mul(0.6).add(0.1)
      .add(vein.mul(0.28)).add(crackLine.mul(0.65)).add(ring.mul(0.7))
      .mul(fade).clamp(0, 1);
    return markGlow(m, fres.mul(0.3).add(vein.mul(0.35)).add(ring).mul(fade).clamp(0, 1));
  });
}

/** Кольцо инея на полу: контакт купола с полом, след заряда. */
function rimeRingMat(P) {
  return pooled('ice:rimering', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const fade = withFade(m);
    const q = uv().mul(2).sub(1);
    const d = q.length();
    const grain = mx_fractal_noise_float(vec3(q.mul(5.0), 7.0), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const wob = mx_noise_float(vec3(q.mul(3.0), 2.0)).mul(0.05);
    const band = smoothstep(float(0.58), float(0.8), d).mul(oneMinus(smoothstep(float(0.93), float(1.0), d.add(wob))));
    const lip = smoothstep(float(0.9), float(0.96), d).mul(oneMinus(smoothstep(float(0.97), float(1.0), d)));
    const n1 = mx_noise_float(vec3(q.mul(6.0), 5.0));
    const crack = oneMinus(smoothstep(float(0.0), float(0.06), tabs(n1))).mul(band);
    m.colorNode = mix(mix(col(P[1]), vec3(0.94, 0.99, 1.0), grain.mul(0.6)), GAP, crack.mul(0.8)).add(lip.mul(0.3));
    m.opacityNode = band.mul(grain.mul(0.5).add(0.45)).add(lip.mul(0.6)).mul(fade).clamp(0, 1);
    return markGlow(m, lip.mul(fade).mul(0.8));
  });
}

/**
 * Ядро ледяного копья: тонкая труба, слоистость считается по тому, насколько
 * поверхность повёрнута к камере (тот же приём, что у трубы луча в vfx.js),
 * иней пятнами по стволу, рябь бежит к цели. Обычный блендинг: на белом
 * полу аддитивный шнур был бы белым у любого элемента.
 */
function lanceMat(P) {
  return pooled('ice:lance', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const fade = withFade(m);
    const span = uniform(10);
    m.userData.u = { span };
    const V = cameraPosition.sub(positionWorld).normalize();
    const facing = normalWorld.dot(V).abs().clamp(0, 1);
    const core = facing.pow(1.5);
    const hot = smoothstep(float(0.93), float(1.0), facing).mul(0.6);
    const along = uv().y.mul(span);
    const flow = mx_noise_float(vec3(along.mul(1.2), TIME.mul(-3.0), 0)).mul(0.3).add(0.85);
    const rime = mx_fractal_noise_float(vec3(uv().x.mul(6.0), along.mul(1.4), 7.0), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
    const frosted = smoothstep(float(0.5), float(0.7), rime);
    const body = mix(mix(col(P[2]), col(P[1]), core), col(P[0]), hot);
    m.colorNode = mix(body, vec3(0.95, 0.99, 1.0), frosted.mul(0.45));
    m.opacityNode = core.mul(flow).add(frosted.mul(0.25)).clamp(0, 1).mul(fade);
    return markGlow(m, core.mul(fade).mul(0.9));
  });
}

/** Аддитивная оболочка — общий материал, чтобы не собирать конвейер на каст. */
function sheathMat(P, key, opacity) {
  return pooled(`ice:sheath:${key}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const fade = withFade(m);
    const fres = oneMinus(tabs(tdot(normalView, positionViewDirection))).pow(1.5);
    m.colorNode = col(P[1]);
    m.opacityNode = fres.mul(opacity).mul(fade);
    return markGlow(m, fres.mul(fade).mul(0.6));
  });
}

/*
 * ── ЧАСТИЦЫ: осколки, пар, взвесь ──────────────────────────────────────────
 */

/** Осколки льда: угловатые, тяжёлые, крутятся; в оба пула (тело + свечение). */
function shards(vfx, P, { x, y = 0.4, z, n = 20, radius = 0.3, speed = 4, up = 4, life = 0.8, size = 0.16, at = null, r = Math.random, dir = null }) {
  const born = at ?? vfx.now;
  vfx.add.emit(n, (i, s) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    s.pos(x + Math.sin(a) * d, y + r() * 0.5, z + Math.cos(a) * d);
    const v = rnd(speed * 0.3, speed, r);
    const bx = dir ? dir[0] * speed * 0.6 : 0, bz = dir ? dir[1] * speed * 0.6 : 0;
    s.vel(Math.sin(a) * v + bx, rnd(up * 0.4, up, r), Math.cos(a) * v + bz);
    s.gravity(0, rnd(-13, -9, r), 0);
    s.color(i % 3 === 0 ? P[0] : P[1], P[2]);
    s.life(born + r() * 0.05, rnd(life * 0.6, life * 1.4, r), rnd(size * 0.6, size * 1.5, r), kit.SHAPE.shard);
    s.ext(rnd(-9, 9, r), 0.7, 0, 0.8);
  });
}

/** Морозный пар: цвет элемента, тающий в светлый. */
function frostMist(vfx, P, o) {
  kit.mist(vfx, { colour: P[1], colour2: MIST, life: 1.6, size: 1.1, rise: 0.7, ...o });
}

/** Светящаяся взвесь: мелкие точки в аддитивный пул. */
function motes(vfx, P, { x, y, z, n = 6, radius = 1, at = null, r = Math.random, rise = 0.5, life = 0.9, size = 0.12, spread = 0.8 }) {
  const born = at ?? vfx.now;
  vfx.glow.emit(n, (i, s) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    s.pos(x + Math.sin(a) * d, y + r() * 0.4, z + Math.cos(a) * d);
    s.vel(rnd(-spread, spread, r), rnd(rise * 0.5, rise * 1.3, r), rnd(-spread, spread, r));
    s.gravity(0, -0.4, 0);
    s.color(P[0], P[1]);
    s.life(born + r() * 0.1, rnd(life * 0.6, life * 1.4, r), rnd(size * 0.6, size * 1.4, r), kit.SHAPE.dot);
    s.ext(0, 0.4, 0, 1);
  });
}

/*
 * ── ПОЛЕ КРИСТАЛЛОВ ────────────────────────────────────────────────────────
 *
 * Общая механика конуса, копья, дождя и снаряда: инстансы по трём формам,
 * упругий рост easeOutBack из-под пола, стойка, ШАТТЕР (осколки из тел
 * кристаллов, пар, вспышка) и оседание в пол. Инстансы хранят ПАРАМЕТРЫ, а
 * матрицы пересобираются каждый кадр — приём GeometryPainter: фаза живая, а
 * буферы не пересоздаются.
 *
 * Элемент списка: { x, z, yaw, lx, lz (наклон оси, мировой), h, w, born
 * (секунды от каста), v (форма) }. Ориентация — сначала поворот вокруг своей
 * оси, потом наклон оси к `(lx, 1, lz)`: наклон читается в мировых осях, и
 * стена у дальнего края честно ложится ОТ кастера.
 */
function field(vfx, P, items, { key, life, shatterAt = null, sink = 0.7, growEnd = null, rng = Math.random, shardN = 0, mistN = 0, hooks = [], onFrame = null }) {
  const G = geo().q;
  const buckets = [[], [], []];
  for (const c of items) {
    if (c.fx == null) { c.fx = (rng() - 0.5) * 1.2; c.fz = (rng() - 0.5) * 1.2; }
    buckets[(c.v ?? 0) % 3].push(c);
  }
  const mat = crystalMat(key, P);
  const group = new THREE.Group();
  const meshes = buckets.map((list, v) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(G[v], mat, list.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = true;
    im.frustumCulled = false;
    group.add(im);
    return im;
  });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), QY = new THREE.Quaternion(),
    UP = new THREE.Vector3(), S = new THREE.Vector3(), Pp = new THREE.Vector3();

  const layout = (t) => {
    const s = shatterAt == null ? 0 : clamp01((t - shatterAt) / sink);
    /* Лопается — короткий распух, потом оседание: не «выключился». */
    const pop = s > 0 && s < 0.15 ? 1 + Math.sin((s / 0.15) * Math.PI) * 0.07 : 1;
    for (let v = 0; v < 3; v++) {
      const im = meshes[v];
      if (!im) continue;
      const list = buckets[v];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const a = clamp01((t - c.born) / 0.22);
        const g = (a <= 0 ? 0 : easeOutBack(a)) * pop;
        UP.set(c.lx + s * c.fx, 1, c.lz + s * c.fz).normalize();
        Q.setFromUnitVectors(Y_AXIS, UP);
        QY.setFromAxisAngle(Y_AXIS, c.yaw);
        Q.multiply(QY);
        const wk = c.w * g * (1 - s * 0.45);
        S.set(wk, Math.max(0.001, c.h * g * (1 - s * 0.3)), wk);
        Pp.set(c.x, -0.12 * c.h * (1 - a) - c.h * s * s, c.z);
        M.compose(Pp, Q, S);
        im.setMatrixAt(i, M);
      }
      im.instanceMatrix.needsUpdate = true;
    }
    return s;
  };
  layout(0);

  let shattered = false;
  const pending = hooks.slice();
  vfx.spawnMesh(group, life, (o, u) => {
    const t = u * life;
    const s = layout(t);
    mat.userData.fade.value = 1 - s;
    mat.userData.grow.value = growEnd == null ? 1 : clamp01(1 - (t - growEnd) / 0.5);
    for (let i = pending.length - 1; i >= 0; i--) {
      if (t >= pending[i].at) { const hk = pending[i]; pending.splice(i, 1); hk.fn(t); }
    }
    if (shatterAt != null && !shattered && t >= shatterAt) {
      shattered = true;
      shatterFx(vfx, P, items, rng, shardN, mistN);
    }
    if (onFrame) onFrame(t);
  });
  return group;
}

/** Шаттер поля: осколки из тел кристаллов, пар от оснований, вспышка. */
function shatterFx(vfx, P, items, rng, shardN, mistN) {
  if (!items.length) return;
  let cx = 0, cz = 0;
  for (const c of items) { cx += c.x; cz += c.z; }
  cx /= items.length; cz /= items.length;
  vfx.add.emit(shardN, (i, s) => {
    const c = items[Math.floor(rng() * items.length)];
    const a = rng() * Math.PI * 2;
    const y = rnd(0.1, 0.95, rng) * c.h;
    s.pos(c.x + Math.sin(a) * c.w * 0.2, y, c.z + Math.cos(a) * c.w * 0.2);
    const v = rnd(1.5, 4.5, rng);
    s.vel(Math.sin(a) * v + c.lx * 2.5, rnd(2.5, 6.5, rng), Math.cos(a) * v + c.lz * 2.5);
    s.gravity(0, rnd(-12, -8, rng), 0);
    s.color(i % 3 === 0 ? P[0] : P[1], P[2]);
    s.life(vfx.now + rng() * 0.08, rnd(0.6, 1.2, rng), rnd(0.16, 0.36, rng), kit.SHAPE.shard);
    s.ext(rnd(-9, 9, rng), 0.7, 0, 0.8);
  });
  vfx.body.emit(mistN, (i, s) => {
    const c = items[Math.floor(rng() * items.length)];
    s.pos(c.x, rnd(0.2, 0.6, rng), c.z);
    s.vel(rnd(-0.6, 0.6, rng), rnd(0.5, 1.2, rng), rnd(-0.6, 0.6, rng));
    s.gravity(0, -0.2, 0);
    s.color(P[1], MIST);
    s.life(vfx.now + rng() * 0.1, rnd(1.0, 1.8, rng), rnd(0.7, 1.4, rng), kit.SHAPE.smoke);
    s.ext(rnd(-0.6, 0.6, rng), 1.9, 0, 0.1);
  });
  vfx.flashLight(cx, 1.2, cz, P[0], 14, 0.3, 8);
  vfx.screen.shake(0.12);
}

/*
 * ══ КОНУС · ЛЕДЯНАЯ ВОЛНА ══════════════════════════════════════════════════
 *
 * Разлом идёт от кастера к дальнему краю сектора; за фронтом из пола
 * выходят кристаллы (крупнее к краю), у дальней дуги — стена клинков,
 * лежащая ОТ кастера. Плита-наледь с тёмными трещинами под всем сектором,
 * пар и осколки вдоль фронта, взрыв и ударный набор у дальнего края. Стоит
 * ~1.6 с и ЛОПАЕТСЯ: осколки, пар, кристаллы оседают в пол. След — иней.
 */
export function cone(vfx, e, P, ctx) {
  const fp = kit.footprint(e, ctx);
  const range = fp.range, half = fp.half, area = fp.area;
  if (range < 0.5) return false;
  const rng = mulberry(seedOf(e) ^ 0x1ce);
  const dx = Math.sin(fp.dir), dz = Math.cos(fp.dir);
  /* Вектор «вбок» в сторону растущего угла: положительный угол уводит к нему. */
  const sx = dz, sz = -dx;
  const REF = kit.REF_AREA.cone;

  /* Фронт идёт ~17 м/с на стенде; здесь — не короче трети секунды, чтобы
     его можно было прочитать и на клине в три метра. */
  const TRAVEL = clamp(0.22 + range * 0.045, 0.3, 0.75);
  const SHATTER = TRAVEL + 1.55, SINK = 0.75, LIFE = SHATTER + SINK + 0.1;
  const dMin = Math.min(1.3, range * 0.3);   // не из-под собственного тела

  const items = [];
  const nField = kit.countFor(52, area, REF, 260);
  for (let i = 0; i < nField; i++) {
    let d = 0, a = 0, x = 0, z = 0;
    for (let k = 0; k < 8 && d < dMin; k++) [x, z, d, a] = kit.inSector(fp, rng);
    const t = d / range, side = Math.sign(a - fp.dir) || 1;
    items.push({
      x, z, v: i % 3, yaw: rng() * Math.PI * 2,
      lx: dx * (0.05 + 0.2 * t) + sx * side * (0.08 + 0.25 * t) + (rng() - 0.5) * 0.14,
      lz: dz * (0.05 + 0.2 * t) + sz * side * (0.08 + 0.25 * t) + (rng() - 0.5) * 0.14,
      h: (0.55 + rng() * 1.35) * (0.5 + 0.95 * t),
      w: 0.6 + rng() * 0.7,
      born: t * TRAVEL + rng() * 0.04,
    });
  }
  /* Стена у дальней дуги — плотность на метр дуги, как на стенде. */
  const arcLen = 2 * half * range;
  const nWall = Math.max(6, Math.round(arcLen * 7.5));
  const wallRow = (n, dk, dj, hk, hj, bk, wk) => {
    for (let i = 0; i < n; i++) {
      const u = ((i + rng() * 0.6) / n - 0.5) * 2;
      const a = fp.dir + u * half * 0.96;
      const ax = Math.sin(a), az = Math.cos(a);
      const d = range * (dk + rng() * dj);
      items.push({
        x: e.x + ax * d, z: e.z + az * d, v: i % 3, yaw: rng() * Math.PI * 2,
        lx: ax * (0.25 + rng() * 0.25) + sx * u * 0.3 + (rng() - 0.5) * 0.1,
        lz: az * (0.25 + rng() * 0.25) + sz * u * 0.3 + (rng() - 0.5) * 0.1,
        h: (hk + rng() * hj) * (1 - Math.abs(u) * 0.3),
        w: wk + rng() * 0.7,
        born: TRAVEL * (bk + rng() * 0.1),
      });
    }
  };
  wallRow(nWall, 0.92, 0.2, 2.5, 1.0, 0.88, 0.95);
  wallRow(Math.round(nWall * 0.5), 0.74, 0.12, 1.4, 1.0, 0.72, 0.85);
  /* Герои: три клинка под четыре метра в середине дуги — то, что видно с
     трансляционной дистанции даже у короткого клина. */
  for (const u of [-0.38, 0.02, 0.4]) {
    const a = fp.dir + (u + (rng() - 0.5) * 0.1) * half * 0.9;
    const ax = Math.sin(a), az = Math.cos(a);
    const d = range * (1.0 + rng() * 0.12);
    items.push({
      x: e.x + ax * d, z: e.z + az * d, v: Math.floor(rng() * 3), yaw: rng() * Math.PI * 2,
      lx: ax * (0.2 + rng() * 0.2) + sx * u * 0.2, lz: az * (0.2 + rng() * 0.2) + sz * u * 0.2,
      h: 3.6 + rng() * 0.6, w: 1.25 + rng() * 0.35, born: TRAVEL * (0.9 + rng() * 0.08),
    });
  }

  /* Плита-наледь: фронт разлома бежит по ней до дальнего края. */
  const slab = new THREE.Mesh(geo().slab, slabMat(P));
  const su = slab.material.userData.u;
  su.half.value = half; su.span.value = range; su.seed.value = Math.floor(rng() * 9); su.front.value = 0;
  su.reach.value = 1 / 1.6;
  slab.scale.set(range * 1.6, 1, range * 1.6);
  slab.position.set(e.x, 0.032, e.z);
  slab.rotation.y = fp.dir + Math.PI;
  slab.renderOrder = 3;
  slab.frustumCulled = false;
  const SLAB_LIFE = SHATTER + SINK + 1.4;
  vfx.spawnMesh(slab, SLAB_LIFE, (o, u) => {
    const t = u * SLAB_LIFE;
    su.front.value = clamp01(t / (TRAVEL * 1.15)) * 0.96;
    setFade(o, t > SHATTER + SINK ? clamp01(1 - (t - SHATTER - SINK) / 1.2) : 1);
  });

  /* Стойкий след: иней с тёмными трещинами по сектору (решение 7). */
  kit.decal(vfx, { type: 'frost', x: e.x + dx * range * 0.55, z: e.z + dz * range * 0.55, radius: range * 0.75, tint: P[1], hold: 20 });
  if (half > 0.45) {
    for (const sgn of [-1, 1]) {
      const a = fp.dir + sgn * half * 0.6, d = range * 0.85;
      kit.decal(vfx, { type: 'frost', x: e.x + Math.sin(a) * d, z: e.z + Math.cos(a) * d, radius: range * 0.6, tint: P[1], hold: 20 });
    }
  }

  /* Пар и осколки вдоль фронта — пачками в будущее по ходу разлома. */
  const nMist = kit.countFor(60, area, REF, 300), nShard = kit.countFor(48, area, REF, 260);
  const B = 6;
  for (let k = 0; k < B; k++) {
    const f = (k + 0.5) / B;
    const d = dMin + f * (range - dMin);
    const at = vfx.now + f * TRAVEL;
    vfx.body.emit(Math.ceil(nMist / B), (i, s) => {
      const a = fp.dir + (rng() * 2 - 1) * half;
      s.pos(e.x + Math.sin(a) * d, rnd(0.1, 0.5, rng), e.z + Math.cos(a) * d);
      s.vel(dx * 1.4 + rnd(-0.6, 0.6, rng), rnd(0.6, 1.4, rng), dz * 1.4 + rnd(-0.6, 0.6, rng));
      s.gravity(0, -0.25, 0);
      s.color(P[1], MIST2);
      s.life(at + rng() * 0.05, rnd(1.4, 2.4, rng), rnd(0.9, 1.7, rng), kit.SHAPE.smoke);
      s.ext(rnd(-0.6, 0.6, rng), 2.2, 0, 0.1);
    });
    vfx.add.emit(Math.ceil(nShard / B), (i, s) => {
      const a = fp.dir + (rng() * 2 - 1) * half;
      s.pos(e.x + Math.sin(a) * d, rnd(0.05, 0.3, rng), e.z + Math.cos(a) * d);
      s.vel(dx * 1.5 + rnd(-1.5, 1.5, rng), rnd(2, 5, rng), dz * 1.5 + rnd(-1.5, 1.5, rng));
      s.gravity(0, -9, 0);
      s.color(i % 3 === 0 ? P[0] : P[1], P[2]);
      s.life(at + rng() * 0.05, rnd(0.5, 0.9, rng), rnd(0.12, 0.28, rng), kit.SHAPE.shard);
      s.ext(rnd(-8, 8, rng), 0.7, 0, 0.8);
    });
  }

  /* Выброс у кастера, удар у дальнего края — когда фронт дошёл. */
  kit.muzzle(vfx, { x: e.x + dx * 1.0, z: e.z + dz * 1.0, y: 1.2, dir: fp.dir, colours: P, mode: 'frost', size: 0.9 });
  const tipX = e.x + dx * range, tipZ = e.z + dz * range;
  const hooks = [{
    at: TRAVEL,
    fn: () => {
      kit.burst(vfx, { x: tipX, y: 1.1, z: tipZ, radius: 0.4 + range * 0.2, endRadius: 1.0 + range * 0.45, life: 0.65, mode: 'frost', colours: P, squash: 0.8, intensity: 1.1 });
      shards(vfx, P, { x: tipX, y: 0.5, z: tipZ, n: kit.countFor(44, area, REF, 220), radius: range * 0.4, speed: 6, up: 6, life: 0.9, size: 0.22, r: rng });
      kit.impactKit(vfx, { x: tipX, z: tipZ, radius: 0.8 + range * 0.35, colours: P, strength: 1.25 });
      /* Вуаль пара за стеной: расползается наружу за сектор. */
      const nVeil = kit.countFor(26, area, REF, 140);
      vfx.body.emit(nVeil, (i, s) => {
        const a = fp.dir + (rng() * 2 - 1) * (half + 0.2);
        const d = range * (0.8 + rng() * 0.5);
        s.pos(e.x + Math.sin(a) * d, rnd(0.2, 1.2, rng), e.z + Math.cos(a) * d);
        s.vel(Math.sin(a) * rnd(0.6, 1.4, rng), rnd(0.3, 0.9, rng), Math.cos(a) * rnd(0.6, 1.4, rng));
        s.gravity(0, -0.15, 0);
        s.color(P[1], MIST2);
        s.life(vfx.now + rng() * 0.15, rnd(1.6, 2.8, rng), rnd(1.0, 1.9, rng), kit.SHAPE.smoke);
        s.ext(rnd(-0.5, 0.5, rng), 2.0, 0, 0.1);
      });
    },
  }];

  field(vfx, P, items, {
    key: 'wave', life: LIFE, shatterAt: SHATTER, sink: SINK, growEnd: TRAVEL, rng, hooks,
    shardN: kit.countFor(170, area, REF, 700), mistN: kit.countFor(40, area, REF, 160),
  });
  return true;
}

/*
 * ══ ЗОНА · ЛЕДЯНОЙ ДОЖДЬ ═══════════════════════════════════════════════════
 *
 * Сосульки с девяти метров всю жизнь зоны (число — от площади), в местах
 * ударов растут наросты, осколки и мелкие следы; столб холодного света над
 * диском, пар по полу, наледь диска проявляется от ударов. В конце наросты
 * лопаются и оседают, на полу остаётся большой иней.
 */
export function zone(vfx, e, P, ctx) {
  const fp = kit.footprint(e, ctx);
  const R = fp.radius, area = fp.area, D = Math.max(1.2, e.duration || 3);
  const REF = kit.REF_AREA.zone;
  const rng = mulberry(seedOf(e) ^ 0xa1d);
  const N = kit.countFor(26, area, REF, 140);
  const H = 9;

  const items = [];
  const spreadT = Math.max(0.5, D - 0.7);
  for (let i = 0; i < N; i++) {
    const [x, z] = kit.inDisc(e.x, e.z, Math.max(0.3, R - 0.35), rng);
    const delay = (i / N) * spreadT + rng() * (spreadT / N);
    const fall = 0.36 + rng() * 0.1;
    items.push({
      x, z, v: i % 3, yaw: rng() * Math.PI * 2, lx: (rng() - 0.5) * 0.5, lz: (rng() - 0.5) * 0.5,
      h: 1.2 + rng() * 1.5, w: 0.8 + rng() * 0.7, born: delay + fall,
      delay, fall, len: 2.0 + rng() * 1.3, hit: false,
    });
  }

  /* Сосульки: узкий кварц остриём ВНИЗ. Поворот на π вокруг X переводит
     вершину (y=1) в y=−1: origin инстанса — это ХВОСТ, остриё ниже на длину. */
  const drops = new THREE.InstancedMesh(geo().lance, crystalMat('rain', P), N);
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  drops.frustumCulled = false;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(),
    S = new THREE.Vector3(), Pp = new THREE.Vector3();
  let revealed = 0;
  const hitFx = (i, d) => {
    shards(vfx, P, { x: d.x, y: 0.25, z: d.z, n: 9, radius: 0.2, speed: 3.5, up: 3.5, life: 0.7, size: 0.15, r: rng });
    motes(vfx, P, { x: d.x, y: 0.3, z: d.z, n: 4, radius: 0.4, r: rng, rise: 1.2 });
    /* Следы — не на каждый удар: бюджет декалей общий на бой. */
    if (i % 3 === 0) kit.decal(vfx, { type: 'frost', x: d.x, z: d.z, radius: 0.85, tint: P[1], hold: 14 });
    if (i % 4 === 0) { vfx.flashLight(d.x, 1.0, d.z, P[1], 16, 0.2, 6); vfx.screen.shake(0.06); }
  };
  const DROPS_LIFE = D + 0.6;
  vfx.spawnMesh(drops, DROPS_LIFE, (o, u) => {
    const t = u * DROPS_LIFE;
    let seen = 0;
    for (let i = 0; i < N; i++) {
      const d = items[i];
      const ft = (t - d.delay) / d.fall;
      const falling = ft > 0 && ft < 1;
      const k = falling ? 1 : 0;
      const fc = clamp01(ft);
      const stretch = 1.45 - 0.45 * fc;
      E.set(Math.PI, d.yaw, 0.06);
      Q.setFromEuler(E);
      S.set(1.0 * k, Math.max(0.001, d.len * stretch * k), 1.0 * k);
      Pp.set(d.x, H * (1 - fc * fc) + d.len * stretch, d.z);
      M.compose(Pp, Q, S);
      o.setMatrixAt(i, M);
      if (ft >= 1) { seen++; if (!d.hit) { d.hit = true; hitFx(i, d); } }
    }
    o.instanceMatrix.needsUpdate = true;
    revealed = seen / N;
  });

  /* Наросты: рождаются ударом, лопаются в конце зоны. */
  field(vfx, P, items, {
    key: 'rain', life: D + 0.9, shatterAt: D + 0.02, sink: 0.7, growEnd: D, rng,
    shardN: kit.countFor(80, area, REF, 400), mistN: kit.countFor(20, area, REF, 100),
    hooks: [{ at: D, fn: () => kit.decal(vfx, { type: 'frost', x: e.x, z: e.z, radius: R * 1.05, tint: P[1], hold: 20 }) }],
  });

  /* Столб света. */
  const column = new THREE.Mesh(geo().column, columnMat(P));
  column.scale.set(R * 0.96, 9.5, R * 0.96);
  column.position.set(e.x, 4.75, e.z);
  column.renderOrder = 1;
  column.frustumCulled = false;
  const core = new THREE.Mesh(geo().column, column.material);
  core.scale.set(0.45, 1, 0.45);
  core.renderOrder = 1;
  column.add(core);
  const CL = D + 0.5;
  vfx.spawnMesh(column, CL, (o, u) => {
    const t = u * CL;
    setFade(o, Math.min(clamp01(t / 0.3), clamp01((CL - t) / 0.6)));
  });

  /* Наледь диска. */
  const disc = new THREE.Mesh(geo().disc, zoneDiscMat(P));
  const du = disc.material.userData.u;
  du.span.value = R; du.seed.value = Math.floor(rng() * 9); du.reveal.value = 0;
  disc.scale.set(R * 1.08, 1, R * 1.08);
  disc.position.set(e.x, 0.034, e.z);
  disc.renderOrder = 3;
  disc.frustumCulled = false;
  const DL = D + 1.1;
  vfx.spawnMesh(disc, DL, (o, u) => {
    const t = u * DL;
    du.reveal.value = Math.max(du.reveal.value, revealed * 0.9 + 0.1);
    setFade(o, t > D + 0.1 ? clamp01(1 - (t - D - 0.1) / 1.0) : 1);
  });

  /* Пар по полу и взвесь у устья — пачками на всю жизнь зоны. */
  const nb = Math.ceil(D / 0.35);
  const per = Math.max(2, kit.countFor(5, area, REF, 40));
  for (let k = 0; k < nb; k++) {
    const at = vfx.now + k * 0.35;
    frostMist(vfx, P, { x: e.x, y: 0.25, z: e.z, n: per, radius: R * 0.9, at, r: rng, size: 1.0, rise: 0.5 });
    motes(vfx, P, { x: e.x, y: 9.0, z: e.z, n: 3, radius: R * 0.7, at, r: rng, rise: -0.6, life: 0.7, size: 0.16 });
  }
  vfx.flashLight(e.x, 3.5, e.z, P[1], 10, 0.5, R * 3);
  return true;
}

/*
 * ══ SELF · ЛЕДЯНОЙ КУПОЛ ═══════════════════════════════════════════════════
 *
 * Купол вокруг кастера, ходит за телом (`ctx.bodyPos`), радиус от тела.
 * Живёт шесть секунд: доживёт — тает; УДАРЫ (записи `impact` у этого тела)
 * кладут трещины, третий — разносит купол осколками. Состояние по `who`
 * живёт в модуле, чтобы удар нашёл свой купол.
 */
const DOMES = new Map();

function domeNear(x, z, notWho) {
  let best = null, bestD = Infinity;
  for (const st of DOMES.values()) {
    if (!st.alive || st.shattered) continue;
    if (notWho && st.who === notWho) continue;
    const d = Math.hypot(x - st.x, z - st.z);
    if (d <= st.R + 0.9 && d < bestD) { best = st; bestD = d; }
  }
  return best;
}

function crackDome(vfx, st, x, z, P) {
  if (!st.alive || st.shattered) return false;
  const ddx = x - st.x, ddz = z - st.z;
  const len = Math.hypot(ddx, ddz) || 1;
  /* Точка удара на куполе: со стороны удара, чуть выше экватора. */
  const dir = new THREE.Vector3(ddx / len, 0.3 + (st.hits % 3) * 0.15, ddz / len).normalize();
  st.u.hitDir.value.copy(dir);
  st.hitAt = vfx.now;
  st.u.crack.value = Math.min(1, st.u.crack.value + 0.36);
  st.hits++;
  const px = st.x + dir.x * st.R, py = st.CY + dir.y * st.R, pz = st.z + dir.z * st.R;
  shards(vfx, P, { x: px, y: py - 0.2, z: pz, n: 24, radius: 0.3, speed: 3.5, up: 2.5, life: 0.8, size: 0.17 });
  kit.burst(vfx, { x: px, y: py, z: pz, radius: 0.3, endRadius: 0.9, life: 0.35, mode: 'frost', colours: P, intensity: 0.9, displace: 0.4 });
  vfx.flashLight(px, py, pz, P[0], 18, 0.25, 7);
  vfx.screen.shake(0.1);
  if (st.hits >= 3) { st.ended = true; st.shattered = true; st.endAt = vfx.now + 0.12; }
  return true;
}

function domeShatterFx(vfx, st, P) {
  const { x, z, R, CY } = st;
  vfx.add.emit(96, (i, s) => {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
    const rxz = Math.sqrt(1 - u * u);
    const d = [rxz * Math.cos(a), u, rxz * Math.sin(a)];
    s.pos(x + d[0] * R, Math.max(0.15, CY + d[1] * R), z + d[2] * R);
    s.vel(d[0] * 4.4, Math.abs(d[1]) * 2.6 + 0.8, d[2] * 4.4);
    s.gravity(0, -11, 0);
    s.color(i % 3 === 0 ? P[0] : P[1], P[2]);
    s.life(vfx.now, rnd(0.6, 1.2), rnd(0.12, 0.3), kit.SHAPE.shard);
    s.ext(rnd(-9, 9), 0.7, 0, 0.8);
  });
  kit.burst(vfx, { x, y: CY, z, radius: R * 0.45, endRadius: R * 1.35, life: 0.5, mode: 'frost', colours: P, intensity: 0.9, displace: 0.5 });
  frostMist(vfx, P, { x, y: 0.3, z, n: 22, radius: R * 0.9, size: 1.2, rise: 0.8 });
  kit.decal(vfx, { type: 'frost', x, z, radius: st.RR * 1.15, tint: P[1], hold: 18 });
  kit.impactKit(vfx, { x, z, y: CY, radius: R * 0.8, colours: P, strength: 0.8 });
}

export function self(vfx, e, P, ctx) {
  const who = e.who || 'blue';
  const old = DOMES.get(who);
  if (old) { old.alive = false; old.group.visible = false; }

  const R = ctx && ctx.radius ? ctx.radius * 1.35 + 0.8 : 2.4;
  const CY = R * 0.42;
  /* Кольцо контакта — сечение сферы полом, а не декоративная константа. */
  const RR = Math.sqrt(Math.max(0.2, R * R - CY * CY));
  const LIFE = 6.0, MELT = 0.7;

  const mat = domeMat(P);
  const u = mat.userData.u;
  u.crack.value = 0; u.hitAge.value = 1;
  const dome = new THREE.Mesh(geo().dome, mat);
  dome.renderOrder = 4;
  dome.frustumCulled = false;
  const ring = new THREE.Mesh(geo().ring, rimeRingMat(P));
  ring.renderOrder = 3;
  ring.frustumCulled = false;
  const group = new THREE.Group();
  group.add(dome, ring);

  const st = {
    who, group, R, CY, RR, u, hits: 0, born: vfx.now, x: e.x, z: e.z,
    ended: false, endAt: 0, shattered: false, burstDone: false, hitAt: -9, alive: true, nextMist: vfx.now,
  };
  DOMES.set(who, st);

  kit.burst(vfx, { x: e.x, y: CY, z: e.z, radius: R * 0.3, endRadius: R * 0.95, life: 0.45, mode: 'frost', colours: P, intensity: 0.8, displace: 0.35 });
  frostMist(vfx, P, { x: e.x, y: 0.2, z: e.z, n: 16, radius: RR, size: 1.0, rise: 0.6 });
  vfx.flashLight(e.x, CY, e.z, P[1], 14, 0.4, R * 3);

  vfx.spawnMesh(group, LIFE + MELT + 0.2, () => {
    const now = vfx.now, t = now - st.born;
    const p = ctx && ctx.bodyPos ? ctx.bodyPos(who) : null;
    st.x = p ? p.x : e.x; st.z = p ? p.z : e.z;
    if (!st.alive) return;
    const born = clamp01(t / 0.4);
    const grow = born <= 0 ? 0 : easeOutBack(born);
    if (!st.ended && t >= LIFE) { st.ended = true; st.endAt = now; }
    const melt = st.ended && !st.shattered ? clamp01(1 - (now - st.endAt) / MELT) : 1;
    const gone = st.shattered ? clamp01(1 - (now - st.endAt) / 0.14) : 1;
    setFade(dome, born * melt * gone);
    setFade(ring, born * melt * gone);
    dome.position.set(st.x, CY, st.z);
    /* Разбитый купол не сжимается, а лопается: короткий распух и в ноль. */
    const pop = st.shattered ? 1 + (1 - gone) * 0.1 : 1;
    dome.scale.setScalar(Math.max(0.001, R * grow * pop * (st.shattered ? gone : 0.75 + melt * 0.25)));
    ring.position.set(st.x, 0.035, st.z);
    ring.scale.setScalar(Math.max(0.001, RR * grow * (0.8 + melt * 0.2) * gone));
    if (st.hitAt >= 0) u.hitAge.value = clamp01((now - st.hitAt) / 0.45);
    if (st.shattered && !st.burstDone && now >= st.endAt) { st.burstDone = true; domeShatterFx(vfx, st, P); }
    /* Морозная взвесь сползает по куполу, пока он жив. */
    if (!st.ended && now >= st.nextMist) {
      st.nextMist = now + 0.22;
      const a = Math.random() * Math.PI * 2;
      vfx.glow.emit(2, (i, s) => {
        const b = a + i * 2.1;
        s.pos(st.x + Math.cos(b) * RR * 0.96, 0.3 + Math.random() * 0.9, st.z + Math.sin(b) * RR * 0.96);
        s.vel(-Math.sin(b) * 1.2, 0.2, Math.cos(b) * 1.2);
        s.gravity(0, -0.3, 0);
        s.color(P[0], P[1]);
        s.life(now, rnd(0.7, 1.2), rnd(0.06, 0.12), kit.SHAPE.dot);
        s.ext(0, 0.4, 0, 1);
      });
      vfx.body.emit(1, (i, s) => {
        s.pos(st.x + Math.cos(a) * RR * 0.7, 0.15, st.z + Math.sin(a) * RR * 0.7);
        s.vel(Math.cos(a) * 0.5, 0.35, Math.sin(a) * 0.5);
        s.gravity(0, -0.1, 0);
        s.color(P[1], MIST);
        s.life(now, rnd(1.2, 1.8), rnd(0.7, 1.1), kit.SHAPE.smoke);
        s.ext(rnd(-0.5, 0.5), 1.8, 0, 0.1);
      });
    }
    if (st.ended && now - st.endAt > (st.shattered ? 0.25 : MELT)) {
      st.alive = false;
      group.visible = false;
      if (DOMES.get(who) === st) DOMES.delete(who);
    }
  });
  return true;
}

/*
 * ══ ЛУЧ · ЛЕДЯНОЕ КОПЬЁ ════════════════════════════════════════════════════
 *
 * Фронт разлома бежит от кастера к цели, за ним по полосе встают кристаллы
 * (число — от длины), ядро копья — тонкая труба с инеем, гаснет; у цели —
 * взрыв, осколки, куст кристаллов, след, ударный набор. Полоса стоит ~1.5 с
 * и лопается.
 */
export function beam(vfx, e, P, ctx) {
  const fp = kit.footprint(e, ctx);
  const len = fp.len;
  if (!(len > 0.3)) return false;
  const rng = mulberry(seedOf(e) ^ 0xbea);
  const dx = (e.x1 - e.x0) / len, dz = (e.z1 - e.z0) / len;
  const sx = dz, sz = -dx;
  const REF = kit.REF_AREA.beam;
  const TRAVEL = clamp(len / 30, 0.14, 0.6);
  const SHATTER = TRAVEL + 1.5, SINK = 0.7, LIFE = SHATTER + SINK + 0.1;

  const items = [];
  const n = kit.countFor(120, fp.area, REF, 400);
  for (let i = 0; i < n; i++) {
    const f = (i + rng() * 0.9) / n;
    const d = 0.3 + f * (len - 0.6);
    const lat = (rng() - 0.5) * 2 * (0.4 + 0.7 * f);
    const side = Math.sign(lat) || 1;
    items.push({
      x: e.x0 + dx * d + sx * lat, z: e.z0 + dz * d + sz * lat, v: i % 3, yaw: rng() * Math.PI * 2,
      lx: dx * 0.1 + sx * side * (0.15 + rng() * 0.3) + (rng() - 0.5) * 0.1,
      lz: dz * 0.1 + sz * side * (0.15 + rng() * 0.3) + (rng() - 0.5) * 0.1,
      h: (0.8 + rng() * 1.4) * (0.6 + 0.7 * f), w: 0.55 + rng() * 0.55,
      born: f * TRAVEL + rng() * 0.03,
    });
  }
  if (e.hit) {
    /* Куст у цели: кристаллы ложатся ОТ точки удара. */
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2, d = 0.35 + Math.sqrt(rng()) * 0.9;
      items.push({
        x: e.x1 + Math.sin(a) * d, z: e.z1 + Math.cos(a) * d, v: i % 3, yaw: rng() * Math.PI * 2,
        lx: Math.sin(a) * (0.3 + rng() * 0.3), lz: Math.cos(a) * (0.3 + rng() * 0.3),
        h: 1.5 + rng() * 1.6, w: 0.8 + rng() * 0.6, born: TRAVEL + rng() * 0.06,
      });
    }
  }

  /* Ядро копья. */
  const g = new THREE.CylinderGeometry(0.27, 0.27, len, 12, 1, true);
  g.translate(0, len / 2, 0);
  const core = new THREE.Mesh(g, lanceMat(P));
  core.material.userData.u.span.value = len;
  core.position.set(e.x0, 1.15, e.z0);
  core.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3(dx, 0, dz));
  const sheathG = new THREE.CylinderGeometry(0.7, 0.7, len, 10, 1, true);
  sheathG.translate(0, len / 2, 0);
  const sheath = new THREE.Mesh(sheathG, sheathMat(P, 'beam', 0.35));
  core.add(sheath);
  core.renderOrder = 6;
  core.frustumCulled = false;
  const CORE_LIFE = TRAVEL + 0.45;
  vfx.spawnMesh(core, CORE_LIFE, (o, u) => {
    const t = u * CORE_LIFE;
    /* Копьё летит: ствол раскрывается по длине вместе с фронтом. */
    const reach = clamp01(t / TRAVEL);
    const k = t < TRAVEL ? 1 : clamp01(1 - (t - TRAVEL) / 0.45);
    setFade(o, k);
    setFade(sheath, k);
    o.scale.set(0.4 + k * 0.6, Math.max(0.001, reach), 0.4 + k * 0.6);
  });

  /* Пар и осколки вдоль фронта. */
  const B = Math.max(4, Math.round(len / 1.5));
  const nMist = kit.countFor(50, fp.area, REF, 200), nShard = kit.countFor(70, fp.area, REF, 280);
  for (let k = 0; k < B; k++) {
    const f = (k + 0.5) / B, d = 0.3 + f * (len - 0.6);
    const at = vfx.now + f * TRAVEL;
    const px = e.x0 + dx * d, pz = e.z0 + dz * d;
    frostMist(vfx, P, { x: px, y: 0.2, z: pz, n: Math.ceil(nMist / B), radius: 0.6, at, r: rng, size: 0.8, rise: 0.9 });
    shards(vfx, P, { x: px, y: 0.2, z: pz, n: Math.ceil(nShard / B), radius: 0.5, speed: 2.5, up: 4.5, life: 0.7, size: 0.15, at, r: rng, dir: [dx, dz] });
  }

  kit.muzzle(vfx, { x: e.x0 + dx * 0.4, z: e.z0 + dz * 0.4, y: 1.15, dir: fp.dir, colours: P, mode: 'frost', size: 0.8 });
  const hooks = [{
    at: TRAVEL,
    fn: () => {
      if (e.hit) {
        kit.burst(vfx, { x: e.x1, y: 1.0, z: e.z1, radius: 0.8, endRadius: 2.2, life: 0.6, mode: 'frost', colours: P, intensity: 1.1 });
        shards(vfx, P, { x: e.x1, y: 0.6, z: e.z1, n: 48, radius: 0.6, speed: 6, up: 6, life: 0.9, size: 0.22, r: rng });
        frostMist(vfx, P, { x: e.x1, y: 0.3, z: e.z1, n: 18, radius: 1.6, r: rng, size: 1.5 });
        kit.decal(vfx, { type: 'frost', x: e.x1, z: e.z1, radius: 1.8, tint: P[1], hold: 20 });
        kit.impactKit(vfx, { x: e.x1, z: e.z1, radius: 2.0, colours: P, strength: 1.2 });
      } else {
        frostMist(vfx, P, { x: e.x1, y: 0.3, z: e.z1, n: 8, radius: 0.8, r: rng });
        vfx.flashLight(e.x1, 1.0, e.z1, P[1], 10, 0.2, 6);
      }
    },
  }];
  field(vfx, P, items, {
    key: 'lance', life: LIFE, shatterAt: SHATTER, sink: SINK, growEnd: TRAVEL, rng, hooks,
    shardN: kit.countFor(150, fp.area, REF, 560), mistN: kit.countFor(30, fp.area, REF, 120),
  });
  return true;
}

/*
 * ══ БОЛТ / НАВЕС · ЛЕДЯНОЙ ОСКОЛОК ═════════════════════════════════════════
 *
 * Крупный вращающийся кварц летит `range` за `range/speed` секунд (навес — по
 * параболе с вершиной ~0.35·range), за ним пар и крошка, с ним свет. В точке
 * прибытия — взрыв, куст кристаллов, осколки, след, ударный набор.
 */
function projectile(vfx, e, P, ctx, arc) {
  const range = e.range || 10, speed = e.speed || 20;
  const travel = clamp(range / speed, 0.15, 2.5);
  const rng = mulberry(seedOf(e) ^ (arc ? 0x10b : 0xb01));
  const dx = Math.sin(e.h || 0), dz = Math.cos(e.h || 0);
  const x0 = e.x + dx * 0.9, z0 = e.z + dz * 0.9;
  const y0 = arc ? 1.5 : 1.2, apex = range * 0.35;
  const x1 = e.x + dx * range, z1 = e.z + dz * range;
  const posAt = (f) => [
    x0 + dx * (range - 0.9) * f,
    arc ? y0 * (1 - f) + 0.35 * f + apex * 4 * f * (1 - f) : 1.2,
    z0 + dz * (range - 0.9) * f,
  ];

  const head = new THREE.Group();
  const tip = new THREE.Mesh(geo().lance, crystalMat('bolt', P));
  tip.scale.set(0.9, 2.6, 0.9);
  tip.position.y = -1.3;
  tip.castShadow = true;
  const spin = new THREE.Group();
  spin.add(tip);
  head.add(spin);
  const halo = new THREE.Mesh(geo().dome, sheathMat(P, 'bolt', 0.5));
  halo.scale.setScalar(0.85);
  head.add(halo);
  head.frustumCulled = false;
  const [hx, hy, hz] = posAt(0);
  head.position.set(hx, hy, hz);

  /* Свет летит с осколком: один источник из пула держится на пике, пока
     снаряд в воздухе, и отпускается при ударе. */
  const light = vfx.lights ? vfx.lights[vfx.lightHead % vfx.lights.length] : null;
  vfx.flashLight(hx, hy, hz, P[1], 14, travel + 0.3, 7);

  const TAN = new THREE.Vector3();
  let landed = false;
  const HEAD_LIFE = travel + 0.6;
  vfx.spawnMesh(head, HEAD_LIFE, (o, u) => {
    const t = u * HEAD_LIFE;
    const f = clamp01(t / travel);
    const [px, py, pz] = posAt(f);
    o.position.set(px, py, pz);
    const [qx, qy, qz] = posAt(Math.min(1, f + 0.02));
    TAN.set(qx - px, qy - py, qz - pz);
    if (TAN.lengthSq() > 1e-6) o.quaternion.setFromUnitVectors(Y_AXIS, TAN.normalize());
    spin.rotation.y = t * 14;
    if (light && !landed) { light.position.set(px, py, pz); light.userData.born = vfx.now; }
    if (!landed && t >= travel) {
      landed = true;
      o.visible = false;
      if (light) light.userData.born = vfx.now - 0.05;
      landing(vfx, e, P, x1, z1, arc ? 0.35 : 1.0, rng);
    }
  });

  /* Шлейф: пачки в будущее вдоль пути — тянется сам, без истории. */
  const steps = Math.ceil(travel * 28);
  for (let k = 0; k < steps; k++) {
    const f = k / steps, at = vfx.now + f * travel;
    const [px, py, pz] = posAt(f);
    vfx.body.emit(2, (i, s) => {
      s.pos(px + rnd(-0.15, 0.15, rng), py + rnd(-0.15, 0.15, rng), pz + rnd(-0.15, 0.15, rng));
      s.vel(rnd(-0.4, 0.4, rng), rnd(0.1, 0.5, rng), rnd(-0.4, 0.4, rng));
      s.gravity(0, -0.3, 0);
      s.color(P[1], MIST);
      s.life(at, rnd(0.5, 0.9, rng), rnd(0.35, 0.65, rng), kit.SHAPE.smoke);
      s.ext(rnd(-1, 1, rng), 1.8, 0, 0.1);
    });
    vfx.add.emit(1, (i, s) => {
      s.pos(px, py, pz);
      s.vel(rnd(-1.2, 1.2, rng) - dx * 1.5, rnd(-0.5, 1.2, rng), rnd(-1.2, 1.2, rng) - dz * 1.5);
      s.gravity(0, -7, 0);
      s.color(P[0], P[1]);
      s.life(at, rnd(0.3, 0.6, rng), rnd(0.08, 0.16, rng), kit.SHAPE.shard);
      s.ext(rnd(-8, 8, rng), 0.6, 0, 0.9);
    });
  }
  kit.muzzle(vfx, { x: x0, z: z0, y: y0, dir: e.h || 0, colours: P, mode: 'frost', size: 0.7 });
  return true;
}

/** Прибытие снаряда: взрыв, куст кристаллов, осколки, след, ударный набор. */
function landing(vfx, e, P, x, z, y, rng) {
  kit.burst(vfx, { x, y: Math.max(0.8, y), z, radius: 0.8, endRadius: 2.1, life: 0.6, mode: 'frost', colours: P, squash: 0.85, intensity: 1.1 });
  shards(vfx, P, { x, y: 0.4, z, n: 44, radius: 0.6, speed: 6, up: 6, life: 0.9, size: 0.22, r: rng });
  frostMist(vfx, P, { x, y: 0.3, z, n: 16, radius: 1.5, r: rng, size: 1.4 });
  kit.decal(vfx, { type: 'frost', x, z, radius: 1.7, tint: P[1], hold: 20 });
  kit.impactKit(vfx, { x, z, radius: 2.0, colours: P, strength: 1.15 });
  const items = [];
  for (let i = 0; i < 11; i++) {
    const a = rng() * Math.PI * 2, d = 0.25 + Math.sqrt(rng()) * 1.15;
    items.push({
      x: x + Math.sin(a) * d, z: z + Math.cos(a) * d, v: i % 3, yaw: rng() * Math.PI * 2,
      lx: Math.sin(a) * (0.3 + rng() * 0.3), lz: Math.cos(a) * (0.3 + rng() * 0.3),
      h: 1.2 + rng() * 1.5, w: 0.7 + rng() * 0.6, born: 0.02 + rng() * 0.08,
    });
  }
  field(vfx, P, items, { key: 'cluster', life: 2.4, shatterAt: 1.65, sink: 0.65, growEnd: 0.1, rng, shardN: 60, mistN: 14 });
}

export function bolt(vfx, e, P, ctx) { return projectile(vfx, e, P, ctx, false); }
export function lob(vfx, e, P, ctx) { return projectile(vfx, e, P, ctx, true); }

/*
 * ══ УДАР ═══════════════════════════════════════════════════════════════════
 *
 * Элементная вспышка попадания: взрыв, осколки, пар, иней, ударный набор.
 * Подписи атомов рисует штатный `impact` оркестратора поверх. Если удар
 * пришёлся по телу под куполом — купол трещит (третий раз — лопается);
 * атомы класса SELF (щит, лечение) на кастере его купол не бьют.
 */
export function impact(vfx, e, P, ctx) {
  const x = e.x, z = e.z;
  const selfOnly = Array.isArray(e.effects) && e.effects.length > 0 && e.effects.every((id) => SELF_ATOMS.has(id));
  const dome = selfOnly ? null : (domeNear(x, z, e.who) || (e.blocked ? domeNear(x, z, null) : null));
  if (dome) crackDome(vfx, dome, x, z, P);
  if (e.blocked) {
    if (!dome) {
      kit.burst(vfx, { x, y: 1.05, z, radius: 0.3, endRadius: 0.8, life: 0.3, mode: 'frost', colours: P, intensity: 0.8 });
      shards(vfx, P, { x, y: 0.9, z, n: 10, speed: 3, up: 3, life: 0.6, size: 0.14 });
    }
    return true;
  }
  kit.burst(vfx, { x, y: 1.05, z, radius: 0.55, endRadius: 1.4, life: 0.5, mode: 'frost', colours: P });
  shards(vfx, P, { x, y: 0.9, z, n: 24, speed: 4.5, up: 4, life: 0.75, size: 0.17 });
  frostMist(vfx, P, { x, y: 0.3, z, n: 8, radius: 0.8, life: 1.3, size: 0.9, rise: 0.5 });
  kit.decal(vfx, { type: 'frost', x, z, radius: 1.05, tint: P[1], hold: 16 });
  kit.impactKit(vfx, { x, z, radius: 1.3, colours: P, strength: 0.8 });
  return true;
}

/*
 * ══ ЗАРЯД ══════════════════════════════════════════════════════════════════
 *
 * Морозное дыхание собирается на кастере в замахе ровно `windup` секунд:
 * сходящийся пар, ядро набора, кольцо инея под ногами. Следует за телом.
 * Выброс при выходе рисуют cone/beam/bolt/lob сами (`kit.muzzle`).
 */
export function charge(vfx, e, P, ctx) {
  const secs = Math.max(0.2, e.windup || 0.5);
  const who = e.who;
  kit.charge(vfx, { who, x: e.x, z: e.z, y: 1.3, secs, colours: P, mode: 'frost', ctx, n: 36, radius: 2.0 });
  const born = vfx.now;
  vfx.body.emit(28, (i, s) => {
    const a = Math.random() * Math.PI * 2, r = rnd(1.6, 2.6);
    const ox = Math.sin(a) * r, oz = Math.cos(a) * r, oy = rnd(-0.6, 0.9);
    const life = rnd(secs * 0.55, secs * 0.95);
    s.pos(e.x + ox, 1.3 + oy, e.z + oz);
    s.vel(-ox / life, -oy / life, -oz / life);
    s.gravity(0, 0, 0);
    s.color(P[1], MIST);
    s.life(born + Math.random() * secs * 0.3, life, rnd(0.35, 0.7), kit.SHAPE.smoke);
    s.ext(rnd(-1, 1), 0.5, 0, 0.1);
  });
  const ring = new THREE.Mesh(geo().ring, rimeRingMat(P));
  ring.position.set(e.x, 0.035, e.z);
  ring.renderOrder = 3;
  ring.frustumCulled = false;
  vfx.spawnMesh(ring, secs, (o, u) => {
    const p = ctx && ctx.bodyPos ? ctx.bodyPos(who) : null;
    if (p) { o.position.x = p.x; o.position.z = p.z; }
    o.scale.setScalar(0.6 + u * 1.4);
    setFade(o, Math.min(1, u * 4) * (1 - u * u));
  });
  return true;
}

/*
 * ── РЫВОК, БЛИНК, ПРЫЖОК, СТЕНА, СТАТУС (план §5, часть C) ────────────────
 *
 * Основатель просил видеть эти формы у каждой стихии; до сих пор их рисовал
 * штатный силуэт из времён до переделки эффектов.
 *
 * ФАКТ СИМА: записи рывка и блинка играются, когда тело УЖЕ СТОИТ В КОНЦЕ
 * (`deliver.js` разрешает рывок внутри одного тика, `phasesOfDef` не даёт
 * грамматическим умениям фазы полёта, на стенде тело не движется вовсе).
 * Поэтому ни один след здесь не следует за телом: всё рождается ВРЕМЕНЕМ от
 * точки старта — `born = f·T`, где `f` — доля пути.
 *
 * ПРЫЖОК И СТЕНА — «модуль добавляет, штатный рисует» (§7.3): чёрная тень
 * прыжка и коллизионная плита стены рисуются всегда, они не эффект.
 */

/** Скорость рывка: 22 м/с читается броском (то же число, что у молнии). */
const DASH_T = (len) => clamp(len / 22, 0.18, 0.4);

export function dash(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const S = [e.x0, e.z0], E = [e.x1, e.z1];
  const len = Math.hypot(E[0] - S[0], E[1] - S[1]);
  if (len < 0.5) return false;
  const T = DASH_T(len);
  const ux = (E[0] - S[0]) / len, uz = (E[1] - S[1]) / len;
  const sx = -uz, sz = ux;

  /* ИНЕЕВЫЙ СЛЕД: кристаллы поднимаются вдоль ПРОЙДЕННОЙ части — `born` от
     доли пути, а не все сразу. Это и есть «origin S» принципа P1: лента
     нарастает от начала, а не летит следом за телом. */
  const n = clamp(Math.round(len * 5), 10, 40);
  const items = [];
  for (let i = 0; i < n; i++) {
    const f = (i + rng() * 0.6) / n;
    const lat = (rng() - 0.5) * 1.3;
    items.push({
      x: S[0] + ux * len * f + sx * lat, z: S[1] + uz * len * f + sz * lat,
      yaw: rng() * Math.PI * 2, lx: (rng() - 0.5) * 0.5, lz: (rng() - 0.5) * 0.5,
      h: 0.35 + rng() * 0.5, w: 0.1 + rng() * 0.1, born: f * T, v: i % 3,
    });
  }
  field(vfx, P, items, { key: 'dash', life: T + 1.1, shatterAt: T + 0.5, sink: 0.6, rng, shardN: 12, mistN: 8 });
  frostMist(vfx, P, { x: (S[0] + E[0]) / 2, y: 0.5, z: (S[1] + E[1]) / 2, n: 16, radius: len * 0.5, r: rng });
  kit.decal(vfx, { type: 'frost', x: (S[0] + E[0]) / 2, z: (S[1] + E[1]) / 2, radius: len * 0.45, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
  if (e.hit) {
    shards(vfx, P, { x: E[0], y: 0.9, z: E[1], n: 22, radius: 0.5, speed: 6, up: 6, life: 0.9, at: vfx.now + T, r: rng });
    frostMist(vfx, P, { x: E[0], y: 0.9, z: E[1], n: 12, radius: 1.2, at: vfx.now + T, r: rng });
    vfx.flashLight(E[0], 1.0, E[1], P[1], 14, 0.3, 6);
  }
  return true;
}

export function blink(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  for (const [x, z, at] of [[e.x0, e.z0, 0], [e.x1, e.z1, 0.08]]) {
    /* Морозный выброс, осколки и иней — БЕЗ статуи: у модуля нет сетки тела,
       и лепить её из кристаллов значило бы поставить рядом с бойцом чужой
       силуэт. */
    kit.burst(vfx, { x, y: 1.0, z, radius: 0.5, endRadius: 1.4, life: 0.4, mode: 'frost', colours: [P[0], P[1], P[2]], intensity: 1.0, at });
    kit.debris(vfx, { x, y: 0.8, z, n: 18, radius: 0.6, colour: P[1], glowColour: P[0], speed: 6, up: 6, life: 1.0, size: 0.2, at: vfx.now + at, r: rng });
    frostMist(vfx, P, { x, y: 0.7, z, n: 14, radius: 1.0, at: vfx.now + at, r: rng });
    kit.decal(vfx, { type: 'frost', x, z, radius: 0.8, hold: 20, tint: P[2], seed: (seed % 9) + 1, at });
  }
  vfx.flashLight(e.x1, 1.0, e.z1, P[0], 16, 0.3, 6);
  return true;
}

export function jump(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const dur = Math.max(0.2, e.duration || 0.55);
  /* Отрыв — иневое кольцо; в воздухе НИЧЕГО; посадка — морозная волна и
     венец кристаллов. */
  kit.decal(vfx, { type: 'frost', x: e.x, z: e.z, radius: 1.0, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
  frostMist(vfx, P, { x: e.x, y: 0.3, z: e.z, n: 12, radius: 0.9, r: rng });
  vfx.spawnMesh(new THREE.Group(), dur + 1.2, (o, u) => {
    if (o.userData.done || u * (dur + 1.2) < dur) return;
    o.userData.done = true;
    const p = ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null;
    const lx = p ? p.x : e.x, lz = p ? p.z : e.z;
    kit.shockwave(vfx, { x: lx, z: lz, radius: 2.6, r0: 0.3, life: 0.5, colour: P[1], intensity: 1.1 });
    const items = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rng() * 0.4, d = 1.0 + rng() * 0.6;
      items.push({
        x: lx + Math.sin(a) * d, z: lz + Math.cos(a) * d, yaw: a,
        lx: Math.sin(a) * 0.4, lz: Math.cos(a) * 0.4,
        h: 0.5 + rng() * 0.5, w: 0.12 + rng() * 0.1, born: rng() * 0.06, v: i % 3,
      });
    }
    field(vfx, P, items, { key: 'jump', life: 1.1, shatterAt: 0.55, sink: 0.55, rng, shardN: 16, mistN: 10 });
    kit.decal(vfx, { type: 'frost', x: lx, z: lz, radius: 1.6, hold: 20, tint: P[2], seed: ((seed + 3) % 9) + 1 });
    vfx.flashLight(lx, 0.8, lz, P[1], 14, 0.3, 7);
    vfx.screen.shake(0.2);
  });
  return true;
}

export function wall(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const D = Math.max(0.6, e.duration || 5);
  const W = Math.max(0.6, e.w || 4), Dd = Math.max(0.5, e.d || 1);
  /*
   * ЛЕДЯНАЯ СТЕНА — ПОЛУСФЕРА, УТОПЛЕННАЯ В ПОЛ, а не коробка. У коробки
   * френель постоянен на грань, и она читается тремя плоскими пластинами;
   * `dome` (полная сфера, `DoubleSide` в `domeMat`) даёт кромку по силуэту,
   * как у щита `self`, — и это тот же материал, который основатель принял.
   */
  const dome = new THREE.Mesh(geo().dome, domeMat(P));
  dome.position.set(e.x, 0, e.z);
  dome.scale.set(W / 2 + 0.2, 1.1, Dd / 2 + 0.2);
  dome.renderOrder = 7;
  dome.frustumCulled = false;
  vfx.spawnMesh(dome, D, (o, u) => {
    const t = u * D;
    setFade(o, t < 0.2 ? t / 0.2 : (t > D - 0.4 ? Math.max(0, (D - t) / 0.4) : 1));
  });
  /* Гребень сосулек по верхней кромке — стена ЛЕДЯНАЯ, а не стеклянная. */
  const n = clamp(Math.round(W * 2.5), 5, 14);
  const items = [];
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    items.push({
      x: e.x + (f - 0.5) * W * 0.94, z: e.z + (rng() - 0.5) * Dd * 0.6,
      yaw: rng() * Math.PI * 2, lx: (rng() - 0.5) * 0.3, lz: (rng() - 0.5) * 0.3,
      h: 0.9 + rng() * 0.7, w: 0.14 + rng() * 0.12, born: f * 0.12, v: i % 3,
    });
  }
  field(vfx, P, items, { key: 'wall', life: D, shatterAt: D - 0.4, sink: 0.4, rng, shardN: 18, mistN: 10 });
  kit.decal(vfx, { type: 'frost', x: e.x, z: e.z, radius: Math.max(W, Dd) * 0.6, hold: 20, tint: P[2], seed: (seed % 9) + 1 });
  frostMist(vfx, P, { x: e.x, y: 0.4, z: e.z, n: 16, radius: W * 0.5, r: rng });
  return true;
}

/** Одно тело — один статус (§P10): зона подкладывает запись каждые 0.5 с. */
const ICE_STATUS = new Map();

export function status(vfx, e, P, ctx) {
  const who = e.who || 'orange';
  const dur = e.duration ?? 1.5;
  const key = `${who}:${e.effect}`;
  const live = ICE_STATUS.get(key);
  if (live && live.until > vfx.now) { live.until = vfx.now + dur; return true; }
  const entry = { until: vfx.now + dur };
  ICE_STATUS.set(key, entry);

  const seed = seedOf(e);
  const rng = mulberry(seed);
  const at = () => (ctx && ctx.bodyPos ? ctx.bodyPos(who) : null) || { x: e.x ?? 0, z: e.z ?? 0 };
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(who) : null;
  const R = (bs ? bs.r : 0.9) * 1.05, H = (bs ? bs.h : 2.0);
  /* ИНЕЙ НА ТЕЛЕ: частицы рождаются НА КАПСУЛЕ (§7.1) и висят на ней — это
     налёт, а не облако вокруг. Плюс кольцо инея под ногами, идущее за телом. */
  const MAX = 60;
  let next = 0;
  const ring = new THREE.Mesh(geo().ring, rimeRingMat(P));
  ring.position.set(at().x, 0.035, at().z);
  ring.renderOrder = 3;
  ring.frustumCulled = false;
  vfx.spawnMesh(ring, MAX, (o, u) => {
    const t = u * MAX;
    const alive = vfx.now <= entry.until;
    if (!alive) { o.visible = false; if (ICE_STATUS.get(key) === entry) ICE_STATUS.delete(key); return; }
    o.visible = true;
    const p = at();
    o.position.set(p.x, 0.035, p.z);
    o.scale.setScalar(R * 1.3);
    setFade(o, 0.85);
    if (t >= next) {
      next = t + 0.35;
      vfx.glow.emit(10, (i, s) => {
        const a = rng() * Math.PI * 2, hh = rng();
        s.pos(p.x + Math.sin(a) * R, 0.15 + hh * H, p.z + Math.cos(a) * R);
        s.vel(0, 0.1, 0); s.gravity(0, 0, 0);
        s.color(P[0], P[1]);
        s.life(vfx.now, 0.5, 0.07 + rng() * 0.05, kit.SHAPE.dot);
        s.ext(0, 0.5, 0, 0.6);
      });
      frostMist(vfx, P, { x: p.x, y: H * 0.5, z: p.z, n: 3, radius: R, r: rng });
    }
  });
  return true;
}
