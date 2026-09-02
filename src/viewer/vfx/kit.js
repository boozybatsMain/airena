/**
 * Ударный набор: то, из чего собирается любой каст независимо от элемента.
 *
 * Референсы основателя (Path of Exile 2, Elemental Sandbox) устроены одинаково
 * под капотом: сфера взрыва со смещением по шуму, ударная волна по полу,
 * след на полу, свет в точке удара, дым и обломки в пуле частиц, толчок
 * камеры и вспышка кадра. Элемент выбирает цвета, формы и тайминги — сам
 * словарь общий. Поэтому он здесь один раз, а не три.
 *
 * Два правила, которые дороже красоты:
 *   · РАЗМЕР — ПАРАМЕТР. Конус, зона, луч завтра меняют дальность, угол и
 *     радиус (решение основателя 02.09). Ни одна плотность не константа:
 *     число частиц, кристаллов, обломков считается от ПЛОЩАДИ следа через
 *     `footprint` и `countFor`. Эффект адаптируется, а не растягивается.
 *   · СЛЕД ОСТАЁТСЯ. Каждый удар оставляет декаль на полу на десятки секунд
 *     (`decal`): бой должен быть виден по арене, а не только по ленте.
 *
 * TSL, ни строки GLSL: одно и то же на WebGPU и WebGL2 (§9.1).
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import {
  TIME, basic, col, easeOutCubic, markGlow, markDistort, pooled, rnd, shared, withFade,
} from './core.js';

const {
  float, vec2, vec3, uv, uniform, mix, smoothstep, oneMinus, abs: tabs,
  mx_noise_float, mx_fractal_noise_float, positionLocal, normalLocal, normalView,
  positionViewDirection, positionWorld, attribute, sin: tsin, cos: tcos,
} = TSL;

/* ── след умения → площадь → плотность ─────────────────────────────────── */

/** Радиус луча из сима (`BEAM_RADIUS` в `config.js`); здесь только для площади. */
const BEAM_RADIUS = 0.4;
/** Радиус удара снаряда: у болта и навеса своего радиуса нет, есть точка. */
const IMPACT_RADIUS = 1.4;

/**
 * Геометрия следа по записи `world.fx`: где, какой площади, куда смотрит.
 * Всё, что считает плотность, читает площадь отсюда — и только отсюда.
 */
export function footprint(e, ctx = {}) {
  switch (e.kind) {
    case 'cone': {
      const range = e.range || 3.4, half = e.halfAngle || 0.96;
      return { x: e.x, z: e.z, dir: e.h || 0, range, half, radius: range, span: range, area: half * range * range };
    }
    case 'zone': {
      const r = e.r || 3;
      return { x: e.x, z: e.z, dir: 0, radius: r, span: r * 2, area: Math.PI * r * r };
    }
    case 'beam': case 'dash': {
      const len = Math.hypot((e.x1 ?? e.x0) - e.x0, (e.z1 ?? e.z0) - e.z0);
      return { x: e.x0, z: e.z0, x1: e.x1, z1: e.z1, dir: Math.atan2(e.x1 - e.x0, e.z1 - e.z0), len, radius: BEAM_RADIUS, span: len, area: len * BEAM_RADIUS * 2 };
    }
    case 'bolt': case 'lob': {
      const range = e.range || 10;
      return { x: e.x, z: e.z, dir: e.h || 0, range, x1: e.x + Math.sin(e.h) * range, z1: e.z + Math.cos(e.h) * range, radius: IMPACT_RADIUS, span: range, area: Math.PI * IMPACT_RADIUS * IMPACT_RADIUS };
    }
    case 'self': {
      const r = ctx.radius || 1.5;
      return { x: e.x, z: e.z, dir: 0, radius: r, span: r * 2, area: Math.PI * r * r };
    }
    default: {
      const r = 1.2;
      return { x: e.x ?? 0, z: e.z ?? 0, dir: e.h || 0, radius: r, span: r * 2, area: Math.PI * r * r };
    }
  }
}

/** Эталонные площади — от умений реестра по умолчанию. */
export const REF_AREA = { cone: 0.96 * 3.4 * 3.4, zone: Math.PI * 9, beam: 24 * BEAM_RADIUS * 2, impact: Math.PI * IMPACT_RADIUS * IMPACT_RADIUS, self: Math.PI * 2.25 };

/**
 * Плотность от площади: `base` частиц на эталонной площади → столько же на
 * квадратный метр на любой другой. Пол — треть базы (совсем маленький след
 * всё равно должен читаться), потолок — `cap` (пул конечен).
 */
export function countFor(base, area, refArea, cap = 900) {
  return Math.round(Math.min(cap, Math.max(base * 0.35, (base * area) / Math.max(0.01, refArea))));
}

/** Случайная точка в секторе конуса (равномерно по площади). */
export function inSector(fp, r = Math.random) {
  const a = fp.dir + (r() * 2 - 1) * fp.half;
  const d = Math.sqrt(r()) * fp.range;
  return [fp.x + Math.sin(a) * d, fp.z + Math.cos(a) * d, d, a];
}

/** Случайная точка в диске (равномерно по площади). */
export function inDisc(x, z, radius, r = Math.random) {
  const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
  return [x + Math.sin(a) * d, z + Math.cos(a) * d, d, a];
}

/* ── сфера взрыва ───────────────────────────────────────────────────────── */

let BURST_GEO = null;
function burstGeo() {
  if (!BURST_GEO) BURST_GEO = shared(new THREE.IcosahedronGeometry(1, 5));
  return BURST_GEO;
}

/**
 * Икосфера, вершины которой ходят по шуму вдоль нормалей, тело — плотный
 * огненный шар, а не прозрачная плёнка: цвет берётся из ШУМА (бело-горячее
 * ядро → жёлтое → оранжевое → тёмная сажа), обод по френелю темнеет и
 * рвётся, растворение по второму шуму к концу жизни. Обычный блендинг —
 * на белом полу аддитивная сфера была белым пятном, а взрыв обязан быть
 * плотнее фона. Ровно та вещь, которая в референсе делает взрыв взрывом.
 *
 * `flash` — отдельный аддитивный режим на первые доли секунды: чистый
 * бело-горячий шар для свечения, без тела.
 *
 * Материалы — кольцо на режим; у каждого свои униформы возраста и цветов,
 * поэтому шесть одновременных взрывов одного режима живут независимо.
 */
function burstMat(mode) {
  return pooled(`burst:${mode}`, () => {
    const additive = mode === 'flash' || mode === 'storm';
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const age = uniform(0), seed = uniform(0), displace = uniform(0.55), intensity = uniform(1);
    const cA = uniform(new THREE.Color(1, 1, 1)), cB = uniform(new THREE.Color(1, 0.6, 0.2)), cC = uniform(new THREE.Color(0.6, 0.1, 0.02));
    m.userData.u = { age, seed, displace, intensity, cA, cB, cC };

    /* Смещение по нормали: грубый fbm плюс «гребни» (|noise|), сила растёт с
       возрастом — шар рвётся, а не надувается. */
    const p = positionLocal.mul(1.7).add(seed);
    const n1 = mx_fractal_noise_float(p.add(vec3(0, TIME.mul(0.35), 0)), 3, 2.0, 0.55, 1);
    const n2 = tabs(mx_noise_float(p.mul(2.3).add(11.7)));
    const disp = n1.mul(0.6).add(n2.mul(0.5)).mul(displace).mul(age.mul(0.9).add(0.35));
    m.positionNode = positionLocal.add(normalLocal.mul(disp));

    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    /* Тело: шум в мировых-локальных координатах, дрейфует вверх — огонь
       течёт по шару, а не приклеен к нему. */
    const flow = mx_fractal_noise_float(positionLocal.mul(2.6).add(vec3(seed, TIME.mul(-0.9), 0)), 4, 2.1, 0.5, 1).mul(0.5).add(0.5);
    /* Растворение: пиксель живёт, пока его шум выше возраста. Порог идёт
       быстрее возраста (×1.25): к последней трети жизни шар уже рваный, а не
       плотный красный мяч, стоящий на теле до конца (снято на навесе огня). */
    const dn = mx_noise_float(positionLocal.mul(3.1).add(seed.mul(1.3))).mul(0.5).add(0.5);
    const gone = age.mul(1.12).sub(0.06);
    const keep = smoothstep(gone.sub(0.14), gone.add(0.05), dn.mul(0.85).add(flow.mul(0.15)));

    if (additive) {
      const body = mix(cA, cB, fres.mul(0.7).add(age.mul(0.3)).clamp(0, 1));
      m.colorNode = body;
      const alpha = fres.mul(0.5).add(0.5).mul(intensity).mul(oneMinus(age).pow(1.2)).mul(keep);
      m.opacityNode = alpha.clamp(0, 1);
      return markGlow(m, alpha.clamp(0, 1));
    }
    /* Жар = шум, сдвинутый возрастом вниз: молодой шар весь бело-жёлтый,
       старый — оранжево-чёрный с редкими горячими языками. */
    const heat = flow.mul(1.25).sub(age.mul(0.95)).add(fres.mul(-0.35)).clamp(0, 1);
    const hot = mix(cB, cA, smoothstep(float(0.55), float(0.95), heat));
    const body = mix(cC, hot, smoothstep(float(0.08), float(0.6), heat));
    /* Кант по френелю темнеет к саже: край шара — это уже дым. К концу
       жизни саже уходит и тело целиком. */
    const soot = cC.mul(0.35);
    const rimmed = mix(body, soot, fres.pow(1.8).mul(0.75).mul(age.mul(0.7).add(0.3)));
    m.colorNode = mix(rimmed, soot, age.pow(1.6).mul(0.8));
    const alpha = intensity.mul(oneMinus(age.pow(1.3)).pow(1.3)).mul(keep).mul(oneMinus(fres.pow(2.5).mul(0.55)));
    m.opacityNode = alpha.clamp(0, 1);
    /* В свечение уходит только ЖАР: сажа не светится. */
    return markGlow(m, smoothstep(float(0.35), float(0.9), heat).mul(alpha).mul(1.1).clamp(0, 1));
  });
}

/**
 * Взрыв. `radius` → `endRadius` за `life` секунд (замедляясь), цвета от ядра к
 * краю: `colours = [ядро, тело, край]`. `squash` прижимает к полу. С
 * `flash` (по умолчанию) в первые доли секунды сверху рисуется бело-горячий
 * аддитивный шар — свет удара, который видно и с трансляционной дистанции.
 */
export function burst(vfx, { x, y = 1.0, z, radius = 1.2, endRadius = null, life = 0.7, mode = 'fire', colours, displace = 0.55, intensity = 1, squash = 1, order = 9, flash = true }) {
  const m = burstMat(mode);
  const u = m.userData.u;
  u.seed.value = ((x * 3.7 + z * 5.1) % 7) + 1;
  u.displace.value = displace; u.intensity.value = intensity;
  if (colours) { u.cA.value.copy(colours[0]); u.cB.value.copy(colours[1]); u.cC.value.copy(colours[2] || colours[1]); }
  const mesh = new THREE.Mesh(burstGeo(), m);
  mesh.position.set(x, y, z);
  mesh.renderOrder = order;
  mesh.frustumCulled = false;
  const r1 = endRadius ?? radius * 2.1;
  const r0 = radius * 0.25;
  vfx.spawnMesh(mesh, life, (o, t) => {
    const r = r0 + (r1 - r0) * easeOutCubic(t);
    o.scale.set(r, r * squash, r);
    u.age.value = t;
  });
  if (flash && mode !== 'flash' && colours) {
    const fm = burstMat('flash');
    const fu = fm.userData.u;
    fu.seed.value = u.seed.value + 3; fu.displace.value = 0.3; fu.intensity.value = 1.6 * intensity;
    fu.cA.value.copy(colours[0]); fu.cB.value.copy(colours[1]); fu.cC.value.copy(colours[1]);
    const fl = new THREE.Mesh(burstGeo(), fm);
    fl.position.set(x, y, z);
    fl.renderOrder = order + 1;
    fl.frustumCulled = false;
    const fr1 = r1 * 0.85;
    vfx.spawnMesh(fl, Math.min(0.28, life * 0.45), (o, t) => {
      const r = r0 + (fr1 - r0) * easeOutCubic(t);
      o.scale.set(r, r * squash, r);
      fu.age.value = t;
    });
  }
  return mesh;
}

/* ── ударная волна по полу ──────────────────────────────────────────────── */

let SHOCK_GEO = null;
function shockGeo() {
  if (!SHOCK_GEO) {
    SHOCK_GEO = shared(new THREE.RingGeometry(0.5, 1, 80, 1));
    SHOCK_GEO.rotateX(-Math.PI / 2);
  }
  return SHOCK_GEO;
}

function shockMat(hot) {
  return pooled(hot ? 'shock:hot' : 'shock:dust', () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: hot ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const age = uniform(0), seed = uniform(0), intensity = uniform(1), colour = uniform(new THREE.Color(1, 0.8, 0.5));
    m.userData.u = { age, seed, intensity, colour };
    /* uv кольца — квадрат описанной окружности; радиус — расстояние до центра. */
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const d = q.length();
    const ang = TSL.atan(q.y, q.x);
    const rag = mx_fractal_noise_float(vec3(tcos(ang).mul(2.2), tsin(ang).mul(2.2), seed), 2, 2.0, 0.5, 1).mul(0.35).add(0.85);
    if (hot) {
      const band = smoothstep(float(0.62), float(0.8), d).mul(oneMinus(smoothstep(float(0.86), float(1.0), d)));
      m.colorNode = mix(colour, vec3(1, 1, 1), oneMinus(age).mul(0.5));
      const alpha = band.mul(rag).mul(oneMinus(age).pow(2.0)).mul(intensity);
      m.opacityNode = alpha.clamp(0, 1);
      return markGlow(m, alpha.clamp(0, 1));
    }
    /* ПЫЛЬ: широкая тёмная волна, поднятая ударом. Обычный блендинг —
       аддитивное кольцо на белом полу невидимо (замер выше по проекту). */
    const band = smoothstep(float(0.5), float(0.7), d).mul(oneMinus(smoothstep(float(0.8), float(1.0), d)));
    const grain = mx_noise_float(vec3(q.mul(6.0), seed.add(3))).mul(0.5).add(0.5);
    m.colorNode = mix(colour.mul(0.35), vec3(0.16, 0.14, 0.12), grain.mul(0.6).add(0.2));
    const alpha = band.mul(rag).mul(grain.mul(0.5).add(0.5)).mul(oneMinus(age).pow(1.3)).mul(intensity).mul(0.8);
    m.opacityNode = alpha.clamp(0, 1);
    return markGlow(m, float(0));
  });
}

/**
 * Ударная волна: пылевое кольцо, расширяющееся от `r0` до `radius` за
 * `life` секунд, и внутри — горячее светящееся, гаснущее вдвое быстрее.
 */
export function shockwave(vfx, { x, z, radius = 5, r0 = 0.6, life = 0.6, colour, intensity = 1, y = 0.06, dust = true }) {
  const make = (hot, lifeK, order) => {
    const m = shockMat(hot);
    const u = m.userData.u;
    u.seed.value = ((x * 1.3 + z * 2.9) % 5) + 1;
    u.intensity.value = intensity;
    if (colour) u.colour.value.copy(colour);
    const mesh = new THREE.Mesh(shockGeo(), m);
    mesh.position.set(x, y + (hot ? 0.01 : 0), z);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    vfx.spawnMesh(mesh, life * lifeK, (o, t) => {
      const r = r0 + (radius - r0) * easeOutCubic(t);
      o.scale.set(r, 1, r);
      u.age.value = t;
    });
    return mesh;
  };
  if (dust) make(false, 1.0, 5);
  return make(true, 0.55, 6);
}

/* ── следы на полу ──────────────────────────────────────────────────────── */

/**
 * Декали — инстансированное поле на тип: один материал, один вызов
 * отрисовки, возраст каждого следа считается в шейдере от часов. Стойкость —
 * секунды до начала затухания (`hold`), бюджет — `MAX_DECALS` на тип, кольцо:
 * самый старый след уступает место.
 *
 * Типы: `soot` — сажа; `scorch` — ожог с остывающими трещинами; `frost` —
 * иней с тёмными трещинами; `arc` — ветвистый электрический ожог;
 * `crater` — воронка кольцами; `laser` — оплавленное стекловидное пятно с
 * тёмным ободом и лучами (лазер плавит, а не жжёт: иней и ожог не подошли —
 * иней на белом полу невидим, у ожога горячие трещины). Все — плоские на
 * полу, обычный блендинг: сажа на белом столе обязана ТЕМНИТЬ, аддитивное
 * там невидимо.
 */
const MAX_DECALS = 28;
const DECAL_Y = { soot: 0.018, scorch: 0.022, frost: 0.026, arc: 0.030, crater: 0.014, laser: 0.028 };

class DecalField {
  constructor(scene, type, palette) {
    this.type = type;
    this.head = 0;
    const geo = new THREE.PlaneGeometry(2, 2);
    geo.rotateX(-Math.PI / 2);
    /* born, hold, fade, seed */
    this.cfg = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 4), 4);
    this.cfg.setUsage(THREE.DynamicDrawUsage);
    /* тон следа: три цвета от элемента, чтобы поле было одно на тип */
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 3), 3);
    this.tint.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('dcfg', this.cfg);
    geo.setAttribute('dtint', this.tint);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending });

    const cfg = attribute('dcfg', 'vec4');
    const tint = attribute('dtint', 'vec3');
    const age = TIME.sub(cfg.x);
    const hold = cfg.y, fadeS = cfg.z, seed = cfg.w;
    const born = age.greaterThanEqual(float(0));
    const k = oneMinus(age.sub(hold).div(fadeS.max(0.01))).clamp(0, 1);
    const life = born.select(k, float(0));
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const d = q.length();
    const p3 = vec3(q.mul(3.0), seed);

    let colour, alpha, glow = float(0);
    if (type === 'soot') {
      const edge = d.add(mx_fractal_noise_float(p3.mul(2.2), 3, 2.0, 0.5, 1).mul(0.42));
      const core = oneMinus(smoothstep(float(0.35), float(1.0), edge));
      const grain = mx_noise_float(p3.mul(9)).mul(0.5).add(0.5);
      colour = vec3(0.05, 0.045, 0.04).add(grain.mul(0.05));
      alpha = core.mul(grain.mul(0.4).add(0.7)).mul(0.86);
    } else if (type === 'scorch') {
      const edge = d.add(mx_fractal_noise_float(p3.mul(2.0), 3, 2.0, 0.5, 1).mul(0.38));
      const core = oneMinus(smoothstep(float(0.4), float(1.0), edge));
      const n = mx_noise_float(p3.mul(3.4).add(7.1));
      const cracks = oneMinus(smoothstep(float(0.0), float(0.075), tabs(n))).mul(core);
      /* трещины остывают за ~6 с: горячий цвет → тёмный */
      const heat = oneMinus(age.div(6.0)).clamp(0, 1).pow(1.6);
      const hot = mix(tint.mul(0.7), vec3(1, 0.62, 0.22), heat);
      colour = mix(vec3(0.06, 0.05, 0.045), hot, cracks.mul(heat.mul(0.9).add(0.1)));
      alpha = core.mul(0.88);
      glow = cracks.mul(heat).mul(0.9);
    } else if (type === 'frost') {
      const edge = d.add(mx_fractal_noise_float(p3.mul(2.4), 3, 2.0, 0.5, 1).mul(0.36));
      const core = oneMinus(smoothstep(float(0.5), float(1.0), edge));
      const rime = mx_fractal_noise_float(p3.mul(5.0).add(3.3), 3, 2.0, 0.5, 1).mul(0.5).add(0.5);
      const n = mx_noise_float(p3.mul(2.8).add(5.7));
      const cracks = oneMinus(smoothstep(float(0.0), float(0.05), tabs(n))).mul(core);
      /* иней светлый и ХОЛОДНЫЙ, трещины тёмные — щель это отсутствие света */
      colour = mix(mix(tint.mul(0.85), vec3(0.93, 0.98, 1.0), rime.mul(0.7)), vec3(0.04, 0.12, 0.16), cracks.mul(0.85));
      alpha = core.mul(rime.mul(0.5).add(0.45)).mul(0.9);
      glow = core.mul(rime).mul(0.18).add(cracks.mul(0.0));
    } else if (type === 'arc') {
      const core = oneMinus(smoothstep(float(0.25), float(1.0), d));
      const n = mx_noise_float(p3.mul(4.2).add(2.2));
      const n2 = mx_noise_float(p3.mul(7.7).add(9.9));
      const branches = oneMinus(smoothstep(float(0.0), float(0.05), tabs(n))).add(oneMinus(smoothstep(float(0.0), float(0.03), tabs(n2))).mul(0.6));
      const heat = oneMinus(age.div(2.5)).clamp(0, 1);
      colour = mix(vec3(0.05, 0.05, 0.06), mix(tint, vec3(1, 1, 1), heat.mul(0.6)), branches.mul(heat.mul(0.8).add(0.2)).clamp(0, 1));
      alpha = branches.clamp(0, 1).mul(core).mul(0.92);
      glow = branches.clamp(0, 1).mul(core).mul(heat);
    } else if (type === 'laser') {
      /* Стекло: почти круглое пятно, внутри светлое с зерном и лучами по
         оттенку элемента, по краю — ТЁМНЫЙ обод оплавления (он и держит
         след на белом полу); обод остывает ~1.5 с из оттенка в тёмный. */
      const edge = d.add(mx_fractal_noise_float(p3.mul(2.0), 2, 2.0, 0.5, 1).mul(0.12));
      const glass = oneMinus(smoothstep(float(0.5), float(0.92), edge));
      const halo = smoothstep(float(0.6), float(0.8), edge).mul(oneMinus(smoothstep(float(0.86), float(1.0), edge)));
      const grain = mx_noise_float(p3.mul(8.0).add(4.4)).mul(0.5).add(0.5);
      const ang = TSL.atan(q.y, q.x);
      const rays = smoothstep(float(0.62), float(0.9), mx_noise_float(vec3(tcos(ang).mul(3.5), tsin(ang).mul(3.5), seed.add(2))).mul(0.5).add(0.5)).mul(glass);
      const heat = oneMinus(age.div(1.5)).clamp(0, 1);
      const glassC = mix(mix(tint.mul(0.75), vec3(0.94, 0.96, 1.0), grain.mul(0.5)), tint.mul(0.55), rays.mul(0.7));
      const dark = mix(vec3(0.09, 0.09, 0.11), tint.mul(0.5), 0.35);
      colour = mix(glassC, mix(dark, tint, heat.mul(0.6)), halo.clamp(0, 1));
      alpha = glass.mul(grain.mul(0.3).add(0.4)).mul(0.6).add(rays.mul(0.25)).add(halo.mul(0.78)).clamp(0, 1);
      glow = halo.mul(heat).mul(0.5);
    } else {
      /* crater: тёмное кольцо с рваным краем и светлым отсыпанным валом */
      const edge = d.add(mx_fractal_noise_float(p3.mul(2.0), 2, 2.0, 0.5, 1).mul(0.25));
      const bowl = oneMinus(smoothstep(float(0.2), float(0.8), edge));
      const rim = smoothstep(float(0.6), float(0.78), edge).mul(oneMinus(smoothstep(float(0.85), float(1.0), edge)));
      colour = mix(vec3(0.11, 0.1, 0.09), vec3(0.6, 0.58, 0.54), rim);
      alpha = bowl.mul(0.75).add(rim.mul(0.55)).clamp(0, 1);
    }
    m.colorNode = colour;
    m.opacityNode = alpha.mul(life).clamp(0, 1);
    markGlow(m, glow.mul(life).clamp(0, 1));

    this.mesh = new THREE.InstancedMesh(geo, m, MAX_DECALS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.position.y = DECAL_Y[type] ?? 0.02;
    /* Все инстансы стартуют мёртвыми: масштаб ноль и рождение в далёком прошлом. */
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_DECALS; i++) { this.mesh.setMatrixAt(i, z); this.cfg.setXYZW(i, -1e6, 0, 1, 0); }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
    this.mat = new THREE.Matrix4();
  }

  place({ x, z, radius, rot, now, hold, fade, seed, tint }) {
    const i = this.head; this.head = (this.head + 1) % MAX_DECALS;
    this.mat.makeRotationY(rot).scale(new THREE.Vector3(radius, 1, radius)).setPosition(x, 0, z);
    this.mesh.setMatrixAt(i, this.mat);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cfg.setXYZW(i, now, hold, fade, seed);
    this.cfg.needsUpdate = true;
    this.tint.setXYZ(i, tint.r, tint.g, tint.b);
    this.tint.needsUpdate = true;
  }
}

const decalFields = new WeakMap();

/**
 * Оставить след. `hold` — секунды до начала затухания (по умолчанию 22),
 * `fade` — секунды затухания. Радиус — в метрах, как след умения.
 */
export function decal(vfx, { type = 'soot', x, z, radius = 2, rot = null, hold = 22, fade = 4, tint = null, seed = null }) {
  let fields = decalFields.get(vfx);
  if (!fields) { fields = {}; decalFields.set(vfx, fields); }
  if (!fields[type]) fields[type] = new DecalField(vfx.scene, type);
  fields[type].place({
    x, z, radius, rot: rot ?? ((x * 7.1 + z * 3.3) % 6.28), now: vfx.now, hold, fade,
    seed: seed ?? (((x * 2.3 + z * 1.7) % 9) + 1), tint: tint || new THREE.Color(0.5, 0.5, 0.5),
  });
}

/* ── марево ─────────────────────────────────────────────────────────────── */

/**
 * Прокси теплового искажения: биллборд, который ничего не рисует в цвет и
 * пишет в выход `distort` шумовое смещение. Пост-граф сдвигает по нему
 * картинку. На бэкенде без MRT — невидим и безвреден.
 */
function heatMat() {
  return pooled('heat', () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending });
    const fade = withFade(m);
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const mask = oneMinus(q.length()).clamp(0, 1).pow(1.4);
    const drift = vec3(uv().mul(3.0), TIME.mul(1.7));
    const ox = mx_noise_float(drift), oz = mx_noise_float(drift.add(vec3(4.1, 2.2, 0)));
    m.colorNode = vec3(0, 0, 0);
    m.opacityNode = float(0);
    markDistort(m, vec2(ox, oz), mask.mul(fade));
    /* Биллборд по осям экрана, как у частиц. */
    const { cameraProjectionMatrix, modelViewMatrix, vec4 } = TSL;
    m.vertexNode = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(0, 0, 0, 1)).add(vec4(positionLocal.xy, 0, 0)));
    return m;
  }, 8);
}

let HEAT_GEO = null;
/** Марево над точкой: `size` метров, `life` секунд, сила спадает к концу. */
export function heat(vfx, { x, y = 1.2, z, size = 3, life = 1.5, strength = 1 }) {
  if (!HEAT_GEO) HEAT_GEO = shared(new THREE.PlaneGeometry(1, 1));
  const m = heatMat();
  const mesh = new THREE.Mesh(HEAT_GEO, m);
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(size);
  mesh.renderOrder = 12;
  mesh.frustumCulled = false;
  vfx.spawnMesh(mesh, life, (o, t) => {
    o.material.userData.fade.value = strength * (1 - t) * (1 - t);
    o.scale.setScalar(size * (1 + t * 0.4));
  });
  return mesh;
}

/* ── рецепты частиц ─────────────────────────────────────────────────────── */

/** Формы частиц (см. `Particles`): индексы в `cfg.w`. */
export const SHAPE = { dot: 0, streak: 1, shard: 2, spark: 3, smoke: 4, chip: 5, flame: 6, ring: 7 };

/**
 * Дым: медленный подъём, рост, тёмный к светлому, обычный блендинг.
 * `dark` — цвет сажи, `lit` — цвет подсветки (огонь снизу).
 */
export function smoke(vfx, { x, y = 0.6, z, n = 40, radius = 1.2, dark, lit, rise = 2.2, life = 2.4, size = 1.1, at = null, spread = 1.0, r = Math.random }) {
  const born = at ?? vfx.now;
  vfx.body.emit(n, (i, s) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    s.pos(x + Math.sin(a) * d, y + r() * 0.4, z + Math.cos(a) * d);
    s.vel(Math.sin(a) * spread * rnd(0.3, 1.4, r), rnd(rise * 0.5, rise * 1.3, r), Math.cos(a) * spread * rnd(0.3, 1.4, r));
    s.gravity(rnd(-0.2, 0.2, r), rnd(-0.6, -0.2, r), rnd(-0.2, 0.2, r));
    s.color(lit || dark, dark);
    s.life(born + r() * 0.25, rnd(life * 0.6, life * 1.3, r), rnd(size * 0.6, size * 1.4, r), SHAPE.smoke);
    s.ext(rnd(-1.2, 1.2, r), 2.6, 0, 0.15);
  });
}

/** Угли: горячие штрихи вверх и в стороны, гаснут по цвету, падают. */
export function embers(vfx, { x, y = 0.8, z, n = 60, radius = 1.0, hot, cool, speed = 5, up = 5, life = 1.4, size = 0.16, at = null, r = Math.random }) {
  const born = at ?? vfx.now;
  vfx.add.emit(n, (i, s) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    s.pos(x + Math.sin(a) * d, y + r() * 0.5, z + Math.cos(a) * d);
    const v = rnd(speed * 0.3, speed, r);
    s.vel(Math.sin(a) * v, rnd(up * 0.4, up, r), Math.cos(a) * v);
    s.gravity(0, rnd(-9, -4, r), 0);
    s.color(hot, cool);
    s.life(born + r() * 0.15, rnd(life * 0.5, life * 1.4, r), rnd(size * 0.6, size * 1.5, r), SHAPE.streak);
    s.ext(0, 0.4, 1, 1);
  });
}

/** Обломки: угловатые, тяжёлые, крутятся, обычный блендинг. */
export function debris(vfx, { x, y = 0.5, z, n = 24, radius = 0.8, colour, glowColour = null, speed = 7, up = 7, life = 1.6, size = 0.28, at = null, r = Math.random }) {
  const born = at ?? vfx.now;
  vfx.body.emit(n, (i, s) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    s.pos(x + Math.sin(a) * d, y, z + Math.cos(a) * d);
    const v = rnd(speed * 0.3, speed, r);
    s.vel(Math.sin(a) * v, rnd(up * 0.5, up, r), Math.cos(a) * v);
    s.gravity(0, rnd(-16, -11, r), 0);
    s.color(glowColour || colour, colour);
    s.life(born, rnd(life * 0.7, life * 1.3, r), rnd(size * 0.6, size * 1.6, r), SHAPE.chip);
    s.ext(rnd(-9, 9, r), 0.9, 0, glowColour ? 0.5 : 0);
  });
}

/** Искры: быстрые, тонкие, вытянуты по скорости, светятся целиком. */
export function sparks(vfx, { x, y = 1.0, z, n = 50, colour, tail = null, speed = 9, life = 0.5, size = 0.12, gravity = -12, cone = null, at = null, r = Math.random }) {
  const born = at ?? vfx.now;
  vfx.add.emit(n, (i, s) => {
    let ux, uy, uz;
    if (cone) {
      const a = cone.dir + (r() * 2 - 1) * cone.half;
      ux = Math.sin(a); uz = Math.cos(a); uy = rnd(-0.2, 0.6, r);
    } else {
      const a = r() * Math.PI * 2, e = rnd(-0.3, 1, r);
      ux = Math.sin(a) * Math.cos(e); uz = Math.cos(a) * Math.cos(e); uy = Math.sin(e);
    }
    const v = rnd(speed * 0.3, speed, r);
    s.pos(x, y, z);
    s.vel(ux * v, uy * v, uz * v);
    s.gravity(0, gravity, 0);
    s.color(colour, tail || colour);
    s.life(born, rnd(life * 0.5, life * 1.5, r), rnd(size * 0.6, size * 1.4, r), SHAPE.spark);
    s.ext(0, 0.3, 1, 1);
  });
}

/** Туман / пар / пыль: крупные мягкие, медленные, обычный блендинг. */
export function mist(vfx, { x, y = 0.3, z, n = 24, radius = 1.5, colour, colour2 = null, life =1.8, size = 1.4, rise = 0.6, at = null, r = Math.random }) {
  const born = at ?? vfx.now;
  vfx.body.emit(n, (i, s) => {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    s.pos(x + Math.sin(a) * d, y + r() * 0.3, z + Math.cos(a) * d);
    s.vel(Math.sin(a) * rnd(0.2, 0.9, r), rnd(rise * 0.4, rise, r), Math.cos(a) * rnd(0.2, 0.9, r));
    s.gravity(0, -0.15, 0);
    s.color(colour, colour2 || colour);
    s.life(born + r() * 0.2, rnd(life * 0.7, life * 1.3, r), rnd(size * 0.6, size * 1.5, r), SHAPE.smoke);
    s.ext(rnd(-0.6, 0.6, r), 1.9, 0, 0.1);
  });
}

/* ── заряд и выброс ─────────────────────────────────────────────────────── */

/**
 * Заряд у кастера в замахе: сходящиеся к точке искры и растущее ядро.
 * Группа следует за телом (`ctx.bodyPos`), живёт ровно `secs`.
 */
export function charge(vfx, { who, x, z, y = 1.2, secs = 0.4, colours, mode = 'fire', ctx, n = 40, radius = 1.8 }) {
  const P = colours;
  const born = vfx.now;
  const core = burstMat(mode);
  core.userData.u.cA.value.copy(P[0]); core.userData.u.cB.value.copy(P[1]); core.userData.u.cC.value.copy(P[1]);
  core.userData.u.displace.value = 0.25; core.userData.u.intensity.value = 1.2;
  core.userData.u.seed.value = ((x * 2.1 + z * 4.3) % 7) + 1;
  const orb = new THREE.Mesh(burstGeo(), core);
  orb.frustumCulled = false;
  orb.renderOrder = 9;
  const g = new THREE.Group();
  g.add(orb);
  g.position.set(x, y, z);
  vfx.spawnMesh(g, secs, (o, t) => {
    const p = ctx && ctx.bodyPos ? ctx.bodyPos(who) : null;
    if (p) o.position.set(p.x, p.y + y, p.z);
    const r = 0.15 + 0.55 * t;
    orb.scale.setScalar(r);
    core.userData.u.age.value = 1 - t * 0.7;
  });
  /* Искры, летящие ВНУТРЬ: рождаются на радиусе и летят к ядру. */
  vfx.add.emit(n, (i, s) => {
    const a = Math.random() * Math.PI * 2, e = rnd(-0.4, 0.9);
    const d = rnd(radius * 0.5, radius);
    const ox = Math.sin(a) * Math.cos(e) * d, oy = Math.sin(e) * d, oz = Math.cos(a) * Math.cos(e) * d;
    const life = rnd(secs * 0.5, secs * 0.95);
    s.pos(x + ox, y + oy, z + oz);
    s.vel(-ox / life, -oy / life, -oz / life);
    s.gravity(0, 0, 0);
    s.color(P[1], P[0]);
    s.life(born + Math.random() * secs * 0.3, life, rnd(0.1, 0.2), SHAPE.spark);
    s.ext(0, 0.3, 1, 1);
  });
  return g;
}

/** Выброс при выходе: маленький взрыв у руки плюс искры вперёд. */
export function muzzle(vfx, { x, z, y = 1.2, dir = 0, colours, mode = 'fire', size = 0.9 }) {
  burst(vfx, { x, y, z, radius: size * 0.5, endRadius: size * 1.3, life: 0.32, mode, colours, displace: 0.4, intensity: 1.4 });
  sparks(vfx, { x, y, z, n: 26, colour: colours[0], tail: colours[1], speed: 10, life: 0.4, cone: { dir, half: 0.5 }, gravity: -6 });
}

/* ── удары по экрану ─────────────────────────────────────────────────────── */

/**
 * Один вызов на удар: свет, волна, толчок камеры, вспышка, аберрация.
 * Элемент даёт цвета и масштаб; всё остальное общее, чтобы удары разных
 * элементов били с одной силой на одинаковый размер.
 */
export function impactKit(vfx, { x, z, y = 1.0, radius = 2.5, colours, strength = 1, shock = true, light = true }) {
  const P = colours;
  if (light) vfx.flashLight(x, y + 0.6, z, P[1], 22 * strength, 0.35, radius * 5);
  if (shock) shockwave(vfx, { x, z, radius: radius * 2.2, life: 0.55, colour: P[1], intensity: 0.9 * strength });
  vfx.screen.shake(Math.min(1, 0.35 * strength + radius * 0.06));
  vfx.screen.flash(P[0], Math.min(0.5, 0.12 * strength));
  vfx.screen.aberration(Math.min(1, 0.5 * strength));
}

/** Аддитивный цвет — короткая ссылка для модулей. */
export { basic, col };
