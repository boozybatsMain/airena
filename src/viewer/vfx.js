/**
 * VFX уровня 1 — то, чем видно грамматику §8.
 *
 * Правило, которое здесь главное, и оно из реестра дословно: **variety the
 * player cannot see is not variety**. Четырнадцать атомов и восемь доставок
 * стоят ровно столько, сколько их различает зритель, и ни очком больше.
 *
 * READ KIT (§9.2) — неприкосновенная часть, и она разложена так:
 *   ДОСТАВКА задаёт СИЛУЭТ. Луч — цилиндр, конус — клин, болт — спрайт,
 *     лоб — дуга, зона — диск, рывок — лента, мигание — два кольца,
 *     self — оболочка. Силуэт не выбирается и не заменяется.
 *   ЭЛЕМЕНТ задаёт ПАЛИТРУ. Пять палитр, по одной на элемент, взяты из
 *     `src/skills/registry.js` — одного источника на сервер и на экран.
 *   ЭФФЕКТ задаёт ИМПАКТ. Что происходит в точке попадания.
 *
 * И правило §10.1, принуждаемое кодом: **эмиссия зарезервирована
 * исключительно за скиллами, телеграфами и импактами.** Тело не светится
 * никогда. Поэтому весь этот файл рисует в аддитивном блендинге, а тела —
 * нет, и палитры отсюда телу недоступны.
 *
 * Частицы — один инстансированный пул, как в референсе основателя
 * (`ParticleSystem.js`): интеграция движения аналитическая, в вершинном
 * шейдере, ноль аллокаций после конструктора. Идея оттуда, код — нет:
 * там сырой GLSL, а `WebGPURenderer` не рендерит `ShaderMaterial` в
 * принципе (§9.1). Здесь TSL, то есть одно и то же на обоих бэкендах.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';

import { ELEMENTS } from '/skills/registry.js';

/** Палитра элемента: три цвета, от ядра к краю. */
export function palette(element) {
  const p = (ELEMENTS[element] || ELEMENTS.kinetic).palette;
  return p.map((h) => new THREE.Color(h));
}

// ───────────────────────────────────────────────────────────────────────────
// пул частиц
// ───────────────────────────────────────────────────────────────────────────

const MAX_PARTICLES = 3000;

/**
 * Инстансированные квады с аналитическим движением.
 *
 * У каждой частицы семнадцать чисел: позиция, скорость, ускорение, цвет,
 * размер, время рождения, время жизни, вращение. Дальше её никто не трогает —
 * вершинный шейдер вычисляет, где она сейчас, из `t - born`. Это и есть
 * причина, по которой тысяча частиц стоит один вызов отрисовки и ноль
 * работы на процессоре: обновляется одно число на кадр, общее время.
 */
export class Particles {
  constructor(scene, { blending = THREE.AdditiveBlending, max = MAX_PARTICLES } = {}) {
    this.max = max;
    this.head = 0;
    this.time = TSL.uniform(0);

    const geo = new THREE.InstancedBufferGeometry();
    geo.instanceCount = max;
    /* Квад из двух треугольников — базовая геометрия, одна на все частицы. */
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;

    this.buf = {
      p0: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
      v0: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
      acc: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
      col: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
      /* x: born, y: life, z: size, w: spin */
      cfg: new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4),
    };
    for (const [k, a] of Object.entries(this.buf)) {
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(k, a);
    }
    /* Жизнь нулевой длины = частица не существует. Пул стартует пустым. */
    this.geo = geo;

    /*
     * Материал: `MeshBasicNodeMaterial` с ручным биллбордом, а НЕ
     * `SpriteNodeMaterial`.
     *
     * Спрайтовый материал считает позицию из матрицы объекта и своих
     * `scaleNode`/`rotationNode`; инстансный атрибут он в неё не подмешивает,
     * и три тысячи частиц сходятся в одну точку в начале координат. Проверено
     * вживую: данные в буферах верные, время идёт, меш в сцене — и ни одного
     * пикселя на экране.
     *
     * Здесь квад разворачивается к камере в ПРОСТРАНСТВЕ ВИДА: центр частицы
     * переводится модельно-видовой матрицей, а угол квада прибавляется уже
     * после неё, по осям экрана. Это тот же приём, что в референсе основателя,
     * только записанный узлами вместо сырого GLSL — `WebGPURenderer` не
     * рендерит `ShaderMaterial` в принципе (§9.1).
     */
    const { attribute, cameraProjectionMatrix, float, modelViewMatrix, positionLocal, uv, vec2, vec4 } = TSL;
    const t = this.time;
    const p0 = attribute('p0', 'vec3');
    const v0 = attribute('v0', 'vec3');
    const acc = attribute('acc', 'vec3');
    const col = attribute('col', 'vec3');
    const cfg = attribute('cfg', 'vec4');

    const age = t.sub(cfg.x);
    const life = cfg.y;
    /* `u` не клампится: он нужен и ОТРИЦАТЕЛЬНЫМ (частица ещё не родилась —
       так зона сыплет искры пачками в будущее), и больше единицы (умерла). */
    const u = age.div(life.max(float(0.0001)));
    const alive = u.greaterThanEqual(float(0)).and(u.lessThan(float(1)));
    const uc = u.clamp(0, 1);

    /* Аналитическая интеграция: p = p0 + v0·τ + ½a·τ². Ни одного шага, ни
       одной аллокации, ни одной строки работы на процессоре. */
    const tau = age.max(float(0));
    const pos = p0.add(v0.mul(tau)).add(acc.mul(tau).mul(tau).mul(0.5));

    /* Размер гаснет к концу жизни, но не в ноль: частица, схлопнувшаяся в
       точку, читается как артефакт, а не как затухание. Мёртвая — в ноль. */
    const size = cfg.z.mul(float(1).sub(uc.mul(0.5))).mul(alive.select(float(1), float(0)));

    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = blending;
    mat.side = THREE.DoubleSide;
    mat.vertexNode = cameraProjectionMatrix.mul(
      modelViewMatrix.mul(vec4(pos, 1)).add(vec4(positionLocal.xy.mul(size), 0, 0)),
    );
    mat.colorNode = col;
    /* Мягкий круг вместо квадрата — то, что отличает искру от пикселя. */
    const d = uv().sub(vec2(0.5, 0.5)).length();
    mat.opacityNode = float(1).sub(d.mul(2)).clamp(0, 1).pow(1.5)
      .mul(float(1).sub(uc).pow(1.3))
      .mul(alive.select(float(1), float(0)));

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    scene.add(this.mesh);
  }

  /** Продвинуть общее время. Единственное, что делается на кадр. */
  update(now) { this.time.value = now; }

  /**
   * Выпустить пачку. Кольцевая переработка: самая старая частица уступает
   * место, и ничего не аллоцируется — в этом весь смысл пула.
   */
  emit(n, fn) {
    const { p0, v0, acc, col, cfg } = this.buf;
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      /* Первым аргументом идёт НОМЕР В ПАЧКЕ (0..n-1), а не индекс в пуле.
         Вызывающему нужен именно он — разложить частицы по дуге, выбрать
         цвет, растянуть шлейф. Индекс в пуле — внутреннее дело кольца, и
         когда он торчал наружу, «частица номер i» оказывалась частицей
         номер 1380 и улетала за арену. */
      fn(k, {
        pos: (x, y, z) => { p0.array[i * 3] = x; p0.array[i * 3 + 1] = y; p0.array[i * 3 + 2] = z; },
        vel: (x, y, z) => { v0.array[i * 3] = x; v0.array[i * 3 + 1] = y; v0.array[i * 3 + 2] = z; },
        gravity: (x, y, z) => { acc.array[i * 3] = x; acc.array[i * 3 + 1] = y; acc.array[i * 3 + 2] = z; },
        color: (c) => { col.array[i * 3] = c.r; col.array[i * 3 + 1] = c.g; col.array[i * 3 + 2] = c.b; },
        life: (born, secs, size, spin = 0) => {
          cfg.array[i * 4] = born; cfg.array[i * 4 + 1] = secs;
          cfg.array[i * 4 + 2] = size; cfg.array[i * 4 + 3] = spin;
        },
      });
    }
    for (const a of [p0, v0, acc, col, cfg]) a.needsUpdate = true;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// силуэты доставок
// ───────────────────────────────────────────────────────────────────────────

const rnd = (a, b) => a + Math.random() * (b - a);

/** Разброс по конусу вокруг направления. */
function spread(dx, dz, angle) {
  const a = Math.atan2(dx, dz) + rnd(-angle, angle);
  return [Math.sin(a), Math.cos(a)];
}

/**
 * Слой эффектов: держит пул, знает палитры и рисует силуэт по доставке.
 *
 * ИНВАРИАНТ (§9): VFX никогда не влияет на симуляцию. Этот файл читает
 * `world.fx` и не пишет в него ни разу; прогон с отключённым рендером даёт
 * побитово тот же лог. Проверяемо и проверяется.
 */
export class Vfx {
  /**
   * ДВА пула, и это не роскошь, а следствие §10.1.
   *
   * Арена — белая платформа в мягкой тёмной пустоте. Аддитивный блендинг на
   * белом полу не добавляет ничего: белое плюс свет остаётся белым, и
   * половина эффектов, снятых над полом, оказалась невидимой при том, что
   * буферы были заполнены верно, а время шло. Проверено вживую.
   *
   * Поэтому:
   *   `body` — обычный блендинг, насыщенные цвета элемента. Он и есть
   *     эффект: его видно и на белом полу, и на тёмном фоне.
   *   `glow` — аддитивный, светлый край. Он добавляет свечение там, где
   *     фон тёмный, и честно ничего не делает там, где он белый.
   *
   * Эмиссия при этом по-прежнему только у скиллов, телеграфов и импактов —
   * тело не светится ни в одном из пулов.
   */
  constructor(scene, { spawnMesh } = {}) {
    this.scene = scene;
    this.body = new Particles(scene, { blending: THREE.NormalBlending });
    this.glow = new Particles(scene, { blending: THREE.AdditiveBlending });
    /* `add` — старое имя пула; оставлено как алиас на тело, чтобы вызовы
       читались одинаково: «выпустить искры», а не «выпустить в пул номер». */
    this.add = { emit: (n, fn) => { this.body.emit(n, fn); this.glow.emit(Math.ceil(n * 0.5), fn); } };
    this.spawnMesh = spawnMesh;
    this.now = 0;
  }

  update(now) { this.now = now; this.body.update(now); this.glow.update(now); }

  /** Одна запись из `world.fx`. Возвращает true, если нарисовала. */
  play(e, ctx) {
    const P = palette(e.element);
    switch (e.kind) {
      case 'beam': return this.beam(e, P, ctx);
      case 'cone': return this.cone(e, P, ctx);
      case 'bolt':
      case 'lob': return this.bolt(e, P, ctx);
      case 'zone': return this.zone(e, P, ctx);
      case 'dash': return this.dash(e, P, ctx);
      case 'blink': return this.blink(e, P, ctx);
      case 'self': return this.shell(e, P, ctx);
      case 'wall': return this.wall(e, P, ctx);
      case 'impact': return this.impact(e, P, ctx);
      case 'status': return this.status(e, P, ctx);
      default: return false;
    }
  }

  // ── луч: цилиндр + искры вдоль ствола ────────────────────────────────
  beam(e, P, ctx) {
    const a = new THREE.Vector3(e.x0, 1.15, e.z0);
    const b = new THREE.Vector3(e.x1, 1.15, e.z1);
    const len = a.distanceTo(b);
    if (len < 0.05) return false;
    const g = new THREE.CylinderGeometry(0.1, 0.1, len, 8, 1, true);
    g.translate(0, len / 2, 0);
    const core = new THREE.Mesh(g, basic(P[0], 0.95));
    core.position.copy(a);
    core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const glowG = new THREE.CylinderGeometry(0.36, 0.36, len, 8, 1, true);
    glowG.translate(0, len / 2, 0);
    const glow = new THREE.Mesh(glowG, basic(P[1], 0.2));
    core.add(glow);
    this.spawnMesh(core, 0.24, (o, u) => {
      o.material.opacity = 0.95 * (1 - u);
      glow.material.opacity = 0.2 * (1 - u) ** 2;
      o.scale.set(1 - u * 0.6, 1, 1 - u * 0.6);
    });
    /* Искры по стволу — то, что отличает выстрел от нарисованной палки. */
    /* Искры по стволу — то, что отличает выстрел от нарисованной палки.
       Разложены РАВНОМЕРНО по длине, а не случайно: случайная россыпь на
       двадцати четырёх метрах оставляет проплешины, и луч читается рваным. */
    const dir = b.clone().sub(a).normalize();
    const n = 34;
    this.add.emit(n, (i, s) => {
      const f = (i + rnd(-0.4, 0.4)) / n;
      s.pos(a.x + dir.x * len * f, 1.15 + rnd(-0.14, 0.14), a.z + dir.z * len * f);
      s.vel(rnd(-1.1, 1.1), rnd(0.6, 2.4), rnd(-1.1, 1.1));
      s.gravity(0, -3.4, 0);
      s.color(P[i % 2]);
      s.life(this.now, rnd(0.25, 0.5), rnd(0.22, 0.46));
    });
    if (e.hit) this.burst(e.x1, 1.1, e.z1, P, 26);
    return true;
  }

  // ── конус: клин из частиц, а не полигон ──────────────────────────────
  cone(e, P, ctx) {
    const n = 46;
    this.add.emit(n, (i, s) => {
      const [ux, uz] = spread(Math.sin(e.h), Math.cos(e.h), e.halfAngle);
      const d = rnd(0.4, e.range);
      s.pos(e.x, rnd(0.5, 1.4), e.z);
      s.vel(ux * d * 2.6, rnd(0.2, 0.9), uz * d * 2.6);
      s.gravity(0, -3.2, 0);
      s.color(P[i % 3]);
      s.life(this.now, rnd(0.26, 0.52), rnd(0.34, 0.72));
    });
    return true;
  }

  // ── снаряд: летящий спрайт со шлейфом ────────────────────────────────
  bolt(e, P, ctx) {
    const [ux, uz] = [Math.sin(e.h), Math.cos(e.h)];
    const secs = Math.min(e.range / (e.speed || 20), 1.6);
    const arc = e.kind === 'lob';
    /* Голова снаряда: одна крупная частица, летящая ровно так же, как летит
       сам снаряд в симуляции, — иначе попадание случается не там, где видно. */
    this.add.emit(1, (i, s) => {
      s.pos(e.x + ux * 0.7, arc ? 1.5 : 1.1, e.z + uz * 0.7);
      s.vel(ux * e.speed, arc ? 5.2 : 0, uz * e.speed);
      s.gravity(0, arc ? -7.5 : 0, 0);
      s.color(P[0]);
      s.life(this.now, secs, 1.15);
    });
    /* Шлейф — частицы, выпущенные вперёд с той же скоростью и меньшей жизнью:
       он тянется за головой сам, без хранения истории. */
    this.add.emit(22, (i, s) => {
      const f = i / 16;
      s.pos(e.x + ux * 0.7, arc ? 1.5 : 1.1, e.z + uz * 0.7);
      s.vel(ux * e.speed * (1 - f * 0.12) + rnd(-0.5, 0.5), (arc ? 5.2 : 0) + rnd(-0.3, 0.3), uz * e.speed * (1 - f * 0.12) + rnd(-0.5, 0.5));
      s.gravity(0, arc ? -7.5 : -0.6, 0);
      s.color(P[1 + (i % 2)]);
      s.life(this.now, secs * rnd(0.5, 0.95), rnd(0.30, 0.62));
    });
    return true;
  }

  // ── зона: диск на полу + столб искр ──────────────────────────────────
  zone(e, P, ctx) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(e.r * 0.92, e.r, 48),
      basic(P[1], 0.55),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(e.x, 0.03, e.z);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(e.r, 40), basic(P[2], 0.16));
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = -0.005;
    ring.add(fill);
    const life = e.duration || 3;
    this.spawnMesh(ring, life, (o, u) => {
      o.material.opacity = 0.55 * (1 - u * 0.6) * (0.75 + 0.25 * Math.sin(u * 40));
      fill.material.opacity = 0.16 * (1 - u);
    });
    /* Зона живёт секундами, и один залп искр на всю её жизнь читается как
       «мигнуло и погасло». Поэтому искры сыплются пачками по ходу. */
    for (let k = 0; k < Math.ceil(life * 4); k++) {
      const at = this.now + k * 0.25;
      this.add.emit(10, (i, s) => {
        const a = Math.random() * 7, rr = Math.sqrt(Math.random()) * e.r;
        s.pos(e.x + Math.sin(a) * rr, 0.05, e.z + Math.cos(a) * rr);
        s.vel(rnd(-0.2, 0.2), rnd(0.8, 2.1), rnd(-0.2, 0.2));
        s.gravity(0, -1.4, 0);
        s.color(P[i % 3]);
        s.life(at, rnd(0.4, 0.9), rnd(0.28, 0.58));
      });
    }
    return true;
  }

  // ── рывок: лента вдоль пути ──────────────────────────────────────────
  dash(e, P, ctx) {
    const a = new THREE.Vector3(e.x0, 0.9, e.z0);
    const b = new THREE.Vector3(e.x1, 0.9, e.z1);
    const len = a.distanceTo(b);
    if (len > 0.2) {
      const g = new THREE.PlaneGeometry(len, 1.5);
      const ribbon = new THREE.Mesh(g, basic(P[1], 0.4));
      ribbon.position.copy(a).lerp(b, 0.5);
      ribbon.lookAt(ribbon.position.clone().add(new THREE.Vector3(0, 1, 0)));
      ribbon.rotation.z = Math.atan2(b.x - a.x, b.z - a.z);
      ribbon.rotation.x = -Math.PI / 2;
      this.spawnMesh(ribbon, 0.3, (o, u) => { o.material.opacity = 0.4 * (1 - u) ** 1.5; });
    }
    this.add.emit(42, (i, s) => {
      const f = Math.random();
      s.pos(a.x + (b.x - a.x) * f, rnd(0.2, 1.5), a.z + (b.z - a.z) * f);
      s.vel(rnd(-1.2, 1.2), rnd(0.3, 1.4), rnd(-1.2, 1.2));
      s.gravity(0, -2.6, 0);
      s.color(P[i % 3]);
      s.life(this.now, rnd(0.25, 0.55), rnd(0.28, 0.58));
    });
    if (e.hit) this.burst(e.x1, 1.1, e.z1, P, 22);
    return true;
  }

  // ── мигание: два кольца, откуда и куда ───────────────────────────────
  blink(e, P, ctx) {
    for (const [x, z, grow] of [[e.x0, e.z0, 1], [e.x1, e.z1, -1]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.42, 32), basic(P[0], 0.9));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.06, z);
      this.spawnMesh(ring, 0.4, (o, u) => {
        const k = grow > 0 ? 1 + u * 2.6 : 3.6 - u * 2.6;
        o.scale.setScalar(k);
        o.material.opacity = 0.9 * (1 - u);
      });
    }
    this.add.emit(30, (i, s) => {
      const at = i < 12 ? [e.x0, e.z0] : [e.x1, e.z1];
      const a = Math.random() * 7;
      s.pos(at[0] + Math.sin(a) * 0.4, rnd(0.2, 1.6), at[1] + Math.cos(a) * 0.4);
      s.vel(Math.sin(a) * 2.2, rnd(0.6, 1.8), Math.cos(a) * 2.2);
      s.gravity(0, -3, 0);
      s.color(P[i % 3]);
      s.life(this.now, rnd(0.25, 0.5), rnd(0.24, 0.52));
    });
    return true;
  }

  // ── self: оболочка по силуэту тела ───────────────────────────────────
  shell(e, P, ctx) {
    const sph = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 12), basic(P[1], 0.3));
    sph.position.set(e.x, 1.0, e.z);
    this.spawnMesh(sph, 0.6, (o, u) => {
      o.scale.setScalar(0.7 + u * 0.8);
      o.material.opacity = 0.3 * (1 - u) ** 1.3;
    });
    this.add.emit(26, (i, s) => {
      const a = Math.random() * 7;
      s.pos(e.x + Math.sin(a) * 1.1, rnd(0.1, 0.4), e.z + Math.cos(a) * 1.1);
      s.vel(Math.sin(a) * 0.3, rnd(1.4, 2.8), Math.cos(a) * 0.3);
      s.gravity(0, -1.2, 0);
      s.color(P[i % 3]);
      s.life(this.now, rnd(0.4, 0.8), rnd(0.26, 0.52));
    });
    return true;
  }

  // ── стена: плита, вырастающая из пола ────────────────────────────────
  wall(e, P, ctx) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(e.w * 2, 2.2, e.d * 2),
      basic(P[1], 0.34),
    );
    box.position.set(e.x, 1.1, e.z);
    this.spawnMesh(box, 5, (o, u) => {
      const rise = Math.min(1, u * 12);
      o.scale.set(1, rise, 1);
      o.position.y = 1.1 * rise;
      o.material.opacity = 0.34 * (u > 0.85 ? (1 - u) / 0.15 : 1);
    });
    return true;
  }

  // ── импакт: вспышка в точке попадания ────────────────────────────────
  impact(e, P, ctx) {
    this.burst(e.x, 1.05, e.z, P, e.blocked ? 12 : 24);
    return true;
  }

  /** Статус на теле: короткая метка нужного цвета. */
  status(e, P, ctx) {
    const at = ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null;
    if (!at) return false;
    this.add.emit(20, (i, s) => {
      const a = Math.random() * 7;
      s.pos(at.x + Math.sin(a) * 0.6, rnd(0.3, 1.8), at.z + Math.cos(a) * 0.6);
      s.vel(rnd(-0.4, 0.4), e.effect === 'heal' ? rnd(1.2, 2.4) : rnd(-0.3, 0.9), rnd(-0.4, 0.4));
      s.gravity(0, e.effect === 'heal' ? 0.4 : -1.8, 0);
      s.color(P[i % 3]);
      s.life(this.now, rnd(0.35, 0.7), rnd(0.24, 0.50));
    });
    return true;
  }

  /** Общая вспышка: конус искр наружу плюс кольцо. */
  burst(x, y, z, P, n) {
    this.add.emit(n, (i, s) => {
      const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3);
      const speed = rnd(4, 11);
      s.pos(x, y, z);
      s.vel(Math.sin(a) * speed, rnd(2, 7), Math.cos(a) * speed);
      s.gravity(0, -14, 0);
      s.color(P[i % 3]);
      s.life(this.now, rnd(0.22, 0.5), rnd(0.30, 0.66));
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.34, 24), basic(P[0], 0.8));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.08, z);
    this.spawnMesh(ring, 0.28, (o, u) => {
      o.scale.setScalar(1 + u * 3.4);
      o.material.opacity = 0.8 * (1 - u) ** 1.6;
    });
  }
}

function basic(color, opacity) {
  const M = THREE.MeshBasicNodeMaterial || THREE.MeshBasicMaterial;
  return new M({
    color, transparent: true, opacity,
    side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
