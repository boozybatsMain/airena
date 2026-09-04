/**
 * Молния · общие кусочки доставок: шар грозы и чехол, ЗАВЕСА СТЕНЫ (плита
 * ионизированного воздуха в коллизионной коробке), перестройщик,
 * ползущие дуги, гроза, искры, выброс у руки, ведомый свет, веер дуг,
 * ОБЛАКО (шар каста у руки — обычный блендинг; облако удара — аддитивное),
 * горячее ядро, ШИПЫ удара (две копии: белая в свечение, синяя в тело),
 * кольцо по полу метровой ширины.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { TIME, clamp01, col, easeOutCubic, markGlow, mulberry, pooled, shared, withFade } from '../core.js';
import * as kit from '../kit.js';
import { TAU, hex, env } from './util.js';
import { boltField } from './field.js';

const {
  float, vec2, vec3, uv, uniform, mix, smoothstep, oneMinus, abs: tabs,
  positionLocal, normalLocal, normalView, positionViewDirection, mx_noise_float, mx_fractal_noise_float,
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
let RING_GEO = null;
function ringGeo() {
  if (!RING_GEO) {
    /* Внутренний радиус 0.3, а не 0.86: полоса кольца задаётся в метрах и
       при малом радиусе занимает до 60 % диска. */
    RING_GEO = shared(new THREE.RingGeometry(0.3, 1, 96, 1));
    RING_GEO.rotateX(-Math.PI / 2);
  }
  return RING_GEO;
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

/* ── облако: шар каста у руки и облако удара ───────────────────────────── */

/**
 * Мягкое бело-голубое облако (эталон: шар ~1.2 м у руки в первые 300 мс и
 * облако ~2.5 м в точке удара). ДВА МЕША: аддитивное тело с HDR-белой
 * серединой и — под ним — ОБОД ОБЫЧНЫМ БЛЕНДИНГОМ, глубоко-синий по
 * френелю (`rimMat`). Аддитивное тело никогда не темнее фона (прежний
 * шар обычным блендингом с белым 1.15 при прозрачности 0.6 выходил темнее
 * HDR-пола — серый воздушный шар, замер r2), но аддитивный синий на белом
 * полу — сиреневый кант, а не синий, и медиана шара равнялась медиане пола
 * (225,224,229) против (224,223,221): шар с трансляции не читался (замер
 * r2.1). Теперь середина HDR ≥ 2.4 (поверх пола 1.1 это > 3 — белее 248 по
 * ACES) с долей 0.5 в bloom, а обод — непрозрачный синий по силуэту: на
 * белом полу синее кольцо, над тёмным телом — синий обод и белое ядро.
 *
 * `impact` (облако удара) ложится на ТЁМНОЕ тело жертвы: пик прозрачности
 * 0.8 и спад ~тело² к краю (при теле^1.3 облако на 0.3–0.4 с прятало
 * жертву целиком, замер r2); середина (2.2,2.3,2.6) — белое пятно, а не
 * серо-голубой призрак (107,108,139) над спиной меха (замер r2.1). Сквозь
 * него видны клубок и шипы (они рисуются позже по порядку).
 */
function cloudMat(P, kind = 'orb') {
  return pooled(`arc:cloud:${kind}:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending,
    });
    const fade = withFade(m);
    const seed = uniform(0), hotK = uniform(1), dense = uniform(1);
    m.userData.u = { fade, seed, hotK, dense };
    const n1 = mx_fractal_noise_float(normalLocal.mul(2.2).add(vec3(seed, TIME.mul(1.2), 0)), 3, 2.0, 0.5, 1);
    m.positionNode = positionLocal.add(normalLocal.mul(n1.mul(0.16)));
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    const body = oneMinus(fres);
    const mottle = mx_noise_float(normalLocal.mul(3.5).add(vec3(TIME.mul(2.0), seed, 0))).mul(0.5).add(0.5);
    if (kind === 'impact') {
      /* Белая масса шире (тело^1.2 в цвете, ^1.7 в прозрачности): при ^2 с
         трансляции облако было синим пузырём с белым пятнышком на спине
         меха (замер r2.2 i1), у эталона — белая масса с мягким краем. */
      const white = vec3(2.2, 2.3, 2.6);
      m.colorNode = mix(col(P[2]).mul(1.3), white, body.pow(1.2).mul(hotK).clamp(0, 1));
      const alpha = body.pow(1.7).mul(mottle.mul(0.3).add(0.7)).mul(0.85).mul(dense).mul(fade).clamp(0, 1);
      m.opacityNode = alpha;
      return markGlow(m, body.pow(1.7).mul(alpha).mul(0.45).clamp(0, 1));
    }
    const white = vec3(2.4, 2.6, 3.2);
    m.colorNode = mix(col(P[2]).mul(1.6), white, body.pow(1.2).mul(hotK).clamp(0, 1));
    /* Тело полупрозрачно (сквозь шар видна рука); синий обод — отдельный
       меш обычным блендингом, здесь лишь слабое аддитивное слагаемое по
       френелю для тёмного фона. */
    const alpha = body.pow(2.4).mul(mottle.mul(0.3).add(0.7)).mul(0.9).add(fres.pow(2.5).mul(0.15)).mul(dense).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.5).clamp(0, 1));
  }, 6);
}

/**
 * Обод облака: тот же шар с тем же шумовым смещением, ОБЫЧНЫЙ блендинг,
 * глубоко-синий (0.03,0.2,1.1) по френелю (`fres`^2.2 у шара, ^1.8 у
 * облака удара — обод шире, ≥ 0.15 м с 26 м), непрозрачность до 0.75 на
 * силуэте. Это он держит силуэт на белом полу: аддитивному там нечего
 * добавить. Рисуется под аддитивным телом (порядок 7 < 8).
 */
function rimMat(P, kind = 'orb') {
  return pooled(`arc:rim:${kind}:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    const seed = uniform(0);
    m.userData.u = { fade, seed };
    const n1 = mx_fractal_noise_float(normalLocal.mul(2.2).add(vec3(seed, TIME.mul(1.2), 0)), 3, 2.0, 0.5, 1);
    m.positionNode = positionLocal.add(normalLocal.mul(n1.mul(0.16)));
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    /* Обод — ПОЛОСА по френелю, а не степень: на сфере френель^1.6 выше
       0.5 только на внешних 4 % радиуса (1 px с 26 м), и обод тонул под
       аддитивным телом (i1–i2). smoothstep(0.25, 0.75) — обод от 80 % радиуса
       к краю (≈ 0.12 м у шара, 0.2 м у облака удара). */
    const rim = kind === 'impact' ? smoothstep(float(0.2), float(0.7), fres) : smoothstep(float(0.25), float(0.75), fres);
    m.colorNode = mix(vec3(0.03, 0.2, 1.1), col(P[1]).mul(0.6), rim.mul(0.12));
    const alpha = rim.mul(kind === 'impact' ? 0.6 : 0.8).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.12));
  }, 6);
}

/**
 * Облако с собственной жизнью: с момента `at` растёт от `r0` до `r1` за
 * `grow` секунд (замедляясь), держится до `hold`, гаснет к `life`. Время —
 * секунды от каста; `squash` прижимает к полу; `kind` — `orb` (шар каста)
 * или `impact` (облако удара), см. `cloudMat`; `additive: true` — старое имя
 * режима удара. Возвращает меш.
 */
function cloud(vfx, P, { x, y, z, at = 0, r0 = 0.3, r1 = 1.0, grow = 0.2, hold = 0.4, life = 0.7, squash = 1, seed = 1, hot = 1, dense = 1, additive = false, kind = null }) {
  const k0 = kind || (additive ? 'impact' : 'orb');
  const m = cloudMat(P, k0);
  const u = m.userData.u;
  u.seed.value = seed; u.hotK.value = hot; u.dense.value = dense;
  const rm = rimMat(P, k0);
  rm.userData.u.seed.value = seed;
  const body = new THREE.Mesh(orbGeo(), m);
  const rim = new THREE.Mesh(orbGeo(), rm);
  body.renderOrder = 8; rim.renderOrder = 7;
  body.frustumCulled = rim.frustumCulled = false;
  rim.scale.setScalar(0.985);
  const g = new THREE.Group();
  g.add(rim, body);
  g.position.set(x, y, z);
  g.scale.setScalar(0.001);
  vfx.spawnMesh(g, life, (o, k) => {
    const t = k * life - at;
    if (t < 0) { o.scale.setScalar(0.001); u.fade.value = 0; rm.userData.u.fade.value = 0; return; }
    const r = r0 + (r1 - r0) * easeOutCubic(clamp01(t / grow));
    o.scale.set(r, r * squash, r);
    const tail = life - at - (hold - at);
    const f = t < hold - at ? 1 : Math.max(0, 1 - (t - (hold - at)) / Math.max(0.01, tail)) ** 1.3;
    u.fade.value = f; rm.userData.u.fade.value = f;
  });
  return g;
}

/** Горячее ядро: аддитивный HDR-белый шарик с френелевым спадом — ядро шара каста, где из него выходит пучок. */
function hotMat(P) {
  return pooled(`arc:hot:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending });
    const fade = withFade(m);
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    const body = oneMinus(fres).pow(1.6);
    m.colorNode = mix(col(P[1]), vec3(1.5, 1.55, 1.7), body);
    const alpha = body.mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, alpha.mul(0.7));
  }, 6);
}

function hotCore(vfx, P, { x, y, z, r = 0.2, life = 0.4, at = 0, hold = 0.3 }) {
  const mesh = new THREE.Mesh(orbGeo(), hotMat(P));
  mesh.position.set(x, y, z);
  mesh.renderOrder = 11;
  mesh.frustumCulled = false;
  const fade = mesh.material.userData.fade;
  vfx.spawnMesh(mesh, life, (o, k) => {
    const t = k * life;
    const on = t >= at ? 1 : 0;
    const f = t < hold ? 1 : Math.max(0, 1 - (t - hold) / Math.max(0.01, life - hold));
    fade.value = on * f;
    o.scale.setScalar(Math.max(0.001, r * (0.9 + 0.1 * Math.sin(t * 40))));
  });
  return mesh;
}

/* ── шипы удара и кольцо по полу ───────────────────────────────────────── */

/**
 * Шипы: длинные тонкие бело-голубые штрихи, летящие из точки (эталон:
 * 0.5–1.5 м, десятки штук в момент удара; и вбок из пучка). Форма — штрих,
 * вытянутый по скорости: при 13 м/с квад длиной ~1.4 м и толщиной ~8 см.
 * Без тяжести по умолчанию — это свет, а не осколки.
 *
 * ДВЕ КОПИИ одной траектории: белая в пуле свечения (на тёмном теле и
 * стенах — белый шип с bloom) и глубоко-синяя (0.05,0.25,0.9 → 0.7·P[2]) в
 * обычном пуле — на белом полу белое невидимо, а синий штрих читается.
 * Один аддитивный выброс с трансляции не существовал вовсе (замер турнира:
 * шипы были видны только на гранях блоков). Синяя копия в пуле частиц
 * гаснет от рождения ((1−u)^1.3 в шейдере пула) и на белом полу с
 * трансляции всё равно бледнеет (замер r2); `blue: false` отключает её —
 * луч рисует синие штрихи сегментами поля (`streakItems`), непрозрачными
 * первую половину жизни. Функция возвращает список траекторий для этого.
 *
 * Направление: по умолчанию — во все стороны с подъёмом ±`up` рад; `dir`
 * (+ `half`) — веер вокруг азимута; `side: [ux, uz]` — перпендикулярно оси
 * пучка (боковые штрихи, подъём ±`up`); `flat` 0..1 прижимает к горизонту
 * (веер по полу). `len` — длина штриха-сегмента в метрах (0.8–1.5 у удара).
 */
function spikes(vfx, P, { x, y, z, n = 40, speed = 13, life = 0.32, size = 0.26, at = null, r, up = 0.55, dir = null, half = Math.PI, side = null, flat = 0, gravity = 0, spread = 0, blue = true, len = [0.8, 1.5], phase = 300 }) {
  const born = at ?? vfx.now;
  const list = [];
  for (let i = 0; i < n; i++) {
    let vx, vy, vz;
    if (side) {
      const [ux, uz] = side;
      const sgn = r() < 0.5 ? -1 : 1;
      const e = (r() * 2 - 1) * up;
      vx = -uz * sgn * Math.cos(e) + ux * (r() - 0.5) * 0.6; vz = ux * sgn * Math.cos(e) + uz * (r() - 0.5) * 0.6; vy = Math.sin(e);
    } else {
      const a = dir == null ? r() * TAU : dir + (r() * 2 - 1) * half;
      const e = (r() * 2 - 1) * up * (1 - flat);
      const ce = Math.cos(e);
      vx = Math.sin(a) * ce; vy = Math.sin(e); vz = Math.cos(a) * ce;
    }
    const v = speed * (0.6 + r() * 0.8);
    list.push({
      x: x + (r() - 0.5) * spread, y: y + (r() - 0.5) * spread, z: z + (r() - 0.5) * spread,
      vx: vx * v, vy: vy * v, vz: vz * v, gy: gravity,
      born: born + r() * 0.03, life: life * (0.6 + r() * 0.8), size: size * (0.6 + r() * 0.8),
      len: len[0] + r() * (len[1] - len[0]), wk: 0.8 + r() * 0.5, phase: phase + i,
    });
  }
  const white = new THREE.Color(0.9, 0.95, 1.0);
  const blueC = new THREE.Color(0.05, 0.25, 0.9), tailB = P[2].clone().multiplyScalar(0.7);
  const fill = (c1, c2, glow, sizeK) => (i, s) => {
    const k = list[i];
    s.pos(k.x, k.y, k.z);
    s.vel(k.vx, k.vy, k.vz);
    s.gravity(0, gravity, 0);
    s.color(c1, c2);
    s.life(k.born, k.life, k.size * sizeK, kit.SHAPE.streak);
    s.ext(0, 0.35, 1, glow);
  };
  vfx.glow.emit(n, fill(white, P[1], 1, 1));
  if (blue) vfx.body.emit(n, fill(blueC, tailB, 0.4, 1.0));
  return list;
}

/**
 * Штрихи как СЕГМЕНТЫ ПОЛЯ: для каждой траектории из `spikes` на момент
 * `now` (часы `vfx.now`) кладёт в `out` ломаную из двух точек — хвост и
 * голова штриха, — без ядра (яркость отрицательная: сплошной глубоко-синий
 * штрих, прямые концы), длиной `len` (растёт первые 30 % жизни), шириной
 * `width` (0.006 → рубашка 0.042 м, ~1.7 px с трансляции). Модуль яркости
 * — 1 первые 70 % жизни (штрих непрозрачен и насыщен), потом линейно
 * в ноль. Пул частиц так не умеет: там прозрачность падает от рождения, и
 * синий штрих на белом полу с трансляции не читался (замер r2). Голова не
 * ниже 0.03 м над полом. `u` = 2 — ФЛАГ ШТРИХА для материала: штрих,
 * летящий вдоль взгляда (проекция короче 0.4–0.65 длины), гаснет, а не
 * стоит столбиком (замер r2.1: 4–5 вертикальных обрубков у кольца прицела
 * с бокового глаза). Поле рисует всё при `reach` ≥ 1, так что `u` > 1
 * ничего не прячет.
 */
function streakItems(list, now, out, { width = 0.006 } = {}) {
  for (const k of list) {
    const age = now - k.born;
    if (age < 0 || age >= k.life) continue;
    const f = age / k.life;
    /* Насыщенный 70 % жизни, потом ОСТЫВАЕТ (модуль 1 → 0.62 — тёмно-синий,
       но непрозрачный) и гаснет только в последних 6 %: полупрозрачный
       синий штрих на белом полу читался серо-сиреневым бруском (замер r2.2
       i4 с верхнего глаза); при остывании с половины жизни большинство
       штрихов в кадре было тёмными (i3). Тонкий штрих, исчезающий за 15 мс,
       на 60 к/с не читается как хлопок. */
    const env = f < 0.7 ? 1 : f < 0.94 ? 1 - ((f - 0.7) / 0.24) * 0.38 : 0.62 * (1 - (f - 0.94) / 0.06);
    const vy = k.vy + k.gy * age;
    const hx = k.x + k.vx * age, hy = Math.max(0.03, k.y + k.vy * age + 0.5 * k.gy * age * age), hz = k.z + k.vz * age;
    const vl = Math.hypot(k.vx, vy, k.vz) || 1;
    const len = k.len * Math.min(1, 0.25 + f / 0.3);
    out.push({
      pts: [[hx - (k.vx / vl) * len, Math.max(0.03, hy - (vy / vl) * len), hz - (k.vz / vl) * len], [hx, hy, hz]],
      width: width * k.wk, bright: -Math.max(0.01, env), phase: k.phase, u0: 2, u1: 2,
    });
  }
}

/**
 * Кольцо по полу от удара: полоса ФИКСИРОВАННОЙ ширины в метрах (`thick`,
 * 0.18 м; ширина в uv делится на радиус, так что не тает при росте),
 * расходится от `r0` до `r1`. ОДНА глубоко-синяя линия (0.03,0.2,1.1)
 * обычным блендингом, непрозрачность 0.95, и в её середине белая HDR-жила
 * (2.0,2.2,2.8) шириной ±20 % полосы ≈ 0.036 м — полтора пикселя с 26 м —
 * с долей 0.4 в bloom: жила цветёт поверх синего, а не режет полосу надвое.
 * Прежняя жила ±35 % (0.05 м = 2 px) на белом полу исчезала, и два синих
 * канта по 2 px читались двумя параллельными бледно-сиреневыми линиями
 * (172,176,214) с трансляции и с верхнего глаза (замер r2.1); полоса
 * 0.3 м — двумя концентрическими (замер r2); полоса 0.07 радиуса с краем
 * `band^0.3` с 26 м была призраком (замер турнира).
 */
function ringMat(P) {
  return pooled(`arc:ring:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending });
    const fade = withFade(m);
    const wid = uniform(0.1);
    m.userData.u = { fade, wid };
    const q = uv().sub(vec2(0.5, 0.5)).mul(2);
    const d = q.length();
    /* Расстояние от середины полосы в долях полуширины: 0 — жила, 1 — край. */
    const dd = d.sub(oneMinus(wid.mul(0.5))).abs().div(wid.mul(0.5).max(1e-4));
    const band = oneMinus(smoothstep(float(0.72), float(1.0), dd));
    const core = oneMinus(smoothstep(float(0.0), float(0.2), dd));
    const ang = TSL.atan(q.y, q.x);
    const rag = mx_noise_float(vec3(TSL.cos(ang).mul(3.0), TSL.sin(ang).mul(3.0), 0.5)).mul(0.2).add(0.88);
    /* Жила (2.0,2.2,2.8) с долей 0.4 в bloom: при (3.0,3.2,3.6) и 0.9 её
       свечение растекалось на всю полосу — с трансляции на 0.12 с кольцо
       снова было синей-белой-синей, на 0.38 — бледным (замер r2.2 i2). */
    m.colorNode = mix(vec3(0.02, 0.15, 1.0), vec3(2.0, 2.2, 2.8), core);
    const alpha = band.mul(rag).mul(0.95).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, core.mul(alpha).mul(0.4));
  }, 4);
}

function floorRing(vfx, P, { x, z, r0 = 0.4, r1 = 3.0, life = 0.5, at = 0, y = 0.07, thick = 0.18 }) {
  const mesh = new THREE.Mesh(ringGeo(), ringMat(P));
  mesh.position.set(x, y, z);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.scale.setScalar(0.001);
  const u = mesh.material.userData.u;
  const total = at + life;
  vfx.spawnMesh(mesh, total, (o, k) => {
    const t = k * total - at;
    if (t < 0) { u.fade.value = 0; return; }
    const q = clamp01(t / life);
    const r = r0 + (r1 - r0) * easeOutCubic(q);
    o.scale.set(r, 1, r);
    u.wid.value = Math.min(0.6, thick / Math.max(0.05, r));
    /* Держится в полную силу первую половину, потом гаснет: кольцо должно
       быть найдено с 26 м без кропа, а не тлеть. */
    u.fade.value = q < 0.5 ? 1 : (1 - (q - 0.5) / 0.5) ** 0.8;
  });
  return mesh;
}

/* ── завеса стены ──────────────────────────────────────────────────────── */

let SLAB_GEO = null;
function slabGeo() {
  if (!SLAB_GEO) SLAB_GEO = shared(new THREE.BoxGeometry(1, 1, 1));
  return SLAB_GEO;
}

/**
 * ЗАВЕСА: ионизированный объём внутри коллизионной коробки стены.
 *
 * Почему объём, а не одни нити. Судья контактных форм снял `arc-wall` и две
 * соседние стены с той же камеры в тот же момент: у мороза и кинетики —
 * «плотные объёмы в рост бойца», у молнии — «почти прозрачная бледно-лиловая
 * панель по колено, по ней ползают белые нити». Панель эта не наша: штатная
 * плита `vfx.js` под элементной стеной стоит на 0.15 непрозрачности — она
 * ПОКАЗАНИЕ КОРОБКИ, а не стена. Реестр обещает «вырастающую плиту»
 * (`registry.js`, wall), и держать её было нечем: двенадцать блуждающих
 * нитей на эллипсоиде — это изгородь, сквозь которую видно всё.
 *
 * Что здесь. Тело коробки обычным блендингом (аддитивное на белом полу не
 * существует, §10.1), заряд ПОЛЗЁТ ВВЕРХ по местной высоте (шум, снесённый
 * часами), френелевый кант держит рёбра, верхняя треть светлее — у плиты
 * читается кромка. Прозрачность нарочно неполная (ровное тело 0.30, до
 * единицы добирают только прожилки и кант): стена обязана читаться преградой,
 * но боец за ней не должен пропадать — за залитый объём, в котором кастера
 * нет, в том же круге забраковали купол гравитации. Замер: доля арены на
 * 0.40 c выросла с 1.02 % до 1.82 % (трансляция) — это полоса соседей
 * (мороз 1.73 %, кинетика 1.40 %), а не выше их.
 */
function veilMat(P) {
  return pooled(`arc:veil:${hex(P)}`, () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.NormalBlending,
    });
    const fade = withFade(m);
    const seed = uniform(0);
    m.userData.u = { fade, seed };
    const fres = oneMinus(tabs(TSL.dot(normalView, positionViewDirection))).clamp(0, 1);
    /* Заряд ползёт ВВЕРХ: шум по местной высоте, снесённый временем. */
    const climb = mx_fractal_noise_float(vec3(
      positionLocal.x.mul(6.0).add(seed),
      positionLocal.y.mul(11.0).sub(TIME.mul(1.7)),
      positionLocal.z.mul(3.0),
    ), 3, 2.0, 0.5, 1);
    const veins = oneMinus(smoothstep(float(0.0), float(0.10), tabs(climb)));
    /* Кромка: верхняя треть плиты светлее — у стены видно, докуда она. */
    const crown = smoothstep(float(0.16), float(0.5), positionLocal.y);
    m.colorNode = mix(col(P[2]), col(P[1]), veins.mul(0.6).add(fres.mul(0.3)).add(crown.mul(0.22)).clamp(0, 1));
    const alpha = float(0.30).add(veins.mul(0.45)).add(fres.pow(1.6).mul(0.35)).add(crown.mul(0.12)).mul(fade).clamp(0, 1);
    m.opacityNode = alpha;
    return markGlow(m, veins.mul(0.45).mul(fade).clamp(0, 1));
  }, 4);
}

/** Плита завесы: меш и ручка `set(fade, x, y, z, w, h, d)`. */
function veil(P, seed) {
  const mesh = new THREE.Mesh(slabGeo(), veilMat(P));
  /* Порядок 6 — ПЕРЕД всеми слоями поля разрядов (рубашка 7, ядро 10,
     свечение 11, см. `LAYER` в `field.js`): нити бегут ПО плите, а не под
     ней, и равенство порядков не решает это молча в чью-то пользу. */
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.material.userData.u.seed.value = seed;
  return {
    mesh,
    set(fade, x, y, z, w, h, d) {
      mesh.material.userData.u.fade.value = fade;
      mesh.position.set(x, y, z);
      mesh.scale.set(Math.max(0.001, w), Math.max(0.001, h), Math.max(0.001, d));
    },
  };
}

/* ── перестройщик ──────────────────────────────────────────────────────── */

/**
 * Перестройщик: держит таймер перестроек и вспышку. `strandsAt(t, rng)`
 * отдаёт список элементов поля на этот момент, `interval` — секунды между
 * перестройками (число или функция от времени: луч перестраивается реже,
 * когда гаснет). `tick(t)` возвращает вспышку 0..1: единица в момент
 * перестройки, ноль через `flash` секунд — в шейдере ядро в полтора раза
 * ярче, рубашка на треть шире; видимый удар на каждом перестроении.
 */
function restriker(field, seed, strandsAt, interval = 0.045, flash = 0.035) {
  let strike = 0, next = 0, hotAt = -1;
  const gen = () => mulberry((seed ^ Math.imul(strike + 1, 0x9e3779b1)) >>> 0);
  return {
    tick(t) {
      if (t >= next) {
        strike++;
        const r = gen();
        field.write(strandsAt(t, r), r);
        hotAt = t;
        const iv = typeof interval === 'function' ? interval(t) : interval;
        next = t + iv * (0.7 + r() * 0.6);
      }
      return Math.max(0, 1 - (t - hotAt) / flash);
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
      out.push({ a: [x, y0, z], b: [x + Math.sin(rd.a) * rd.len, 0.05, z + Math.cos(rd.a) * rd.len], floor: true, floorTop: 0.55, width: 0.04, bright: 0.95, jag: 0.26, branches: 2, phase: rd.phase, step: 0.3 });
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

export {
  orb, halo, veil, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs,
  cloud, hotCore, spikes, streakItems, floorRing,
};
