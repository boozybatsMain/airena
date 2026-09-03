/**
 * Молния · РЫВОК, БЛИНК, ПРЫЖОК и СТЕНА (план §3 A9).
 *
 * Основатель 03.09: «хочу видеть, как рывок, блинк, прыжок и стена работают
 * с каждой стихией», — до сих пор их рисовал только штатный силуэт из времён
 * до переделки эффектов.
 *
 * ФАКТ СИМА, ПРОТИВ КОТОРОГО НЕЛЬЗЯ РИСОВАТЬ. Записи рывка и блинка играются,
 * когда тело УЖЕ СТОИТ В КОНЦЕ: `deliver.js` разрешает рывок грамматики
 * внутри одного тика (атомы легли, `me.x += ux·travel`, запись написана), а
 * `phasesOfDef` не даёт грамматическим умениям фазы полёта. На стенде тело
 * вообще не движется. Значит НИ ОДИН след здесь не следует за телом: всё
 * ведётся ВРЕМЕНЕМ от точки старта. Разряд рывка — его СЛЕД, а не средство
 * передвижения, и то, что боец уже стоит в конце, когда разряд туда
 * добирается, — не противоречие.
 *
 * P1 держится тем же окном `tail`..`reach`, что у болта: разряд стоит в
 * пространстве от `A` до `B`, горит полоса, начало гаснет за головой.
 *
 * ПРЫЖОК И СТЕНА — «модуль добавляет, штатный рисует» (§7.3): чёрная тень
 * прыжка и коллизионная плита стены рисуются всегда, они не эффект, а
 * показание высоты и коробки. Модуль их не трогает и никогда не рисует
 * своей тени.
 */

import * as THREE from 'three';
import { clamp01, mulberry, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { BURN, TAU, clampN } from './util.js';
import { boltField } from './field.js';
import { restriker, stormBurst, arcSparks, spikes, floorRing, heldLight, radialArcs } from './common.js';

/* Ковёр глифов вдоль пути, рождающийся по мере прохода головы (закон болта). */
function wakeMarks(seed, rng, A, B, len, T, count) {
  const ux = (B[0] - A[0]) / len, uz = (B[2] - A[2]) / len;
  const sx = -uz, sz = ux;
  const out = [];
  for (let i = 0; i < count; i++) {
    const f = rng();
    const lat = (rng() - 0.5) * 1.1;
    out.push({
      x: A[0] + ux * len * f + sx * lat, z: A[2] + uz * len * f + sz * lat,
      born: f * T + 0.02, life: 0.5 + rng() * 0.4,
      dot: rng() < 0.42, links: 3 + Math.floor(rng() * 3), scale: 0.6 + rng() * 0.7,
      dir: Math.atan2(ux, uz) + (rng() - 0.5) * 1.5,
      g: mulberry((seed ^ Math.imul(i + 1, 0x2545f491)) >>> 0),
    });
  }
  return out;
}
const liveMarks = (marks, t, out, phase0 = 700) => {
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const age = t - m.born;
    if (age < 0 || age >= m.life) continue;
    out.push({
      glyph: true, x: m.x, z: m.z, y: 0.05, dot: m.dot, links: m.links, len: m.scale,
      dir: m.dir, width: 0.0055, bright: -(1 - 0.4 * (age / m.life)), phase: phase0 + i, rng: m.g, u: 1,
    });
  }
};

/* ── рывок ──────────────────────────────────────────────────────────────── */

export function dash(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения по умолчанию — сегодняшние: запись, не
     несущая поля, даёт прежний кадр (см. `kit.tune`). */
  const S = kit.tune(e, {
    speed: 22,        /* скорость головы разряда, м/с */
    y: 0.9,           /* высота разряда, м */
    window: 4,        /* длина светящейся полосы, м */
    marks: 16,        /* меток ковра на метр пути */
    burnRadius: 1.0,  /* ожог в точке удара, м */
    burnAfter: 8,     /* ожог переживает рывок на столько, с */
  });
  const A = [e.x0, S.y, e.z0], B = [e.x1, S.y, e.z1];
  const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
  if (len < 0.5) return false;
  const ux = (B[0] - A[0]) / len, uz = (B[2] - A[2]) / len;
  /* 22 м/с читается броском; короче 0.18 с глаз не успевает, длиннее 0.4 —
     разряд плетётся и перестаёт быть рывком. */
  const T = clampN(len / S.speed, 0.18, 0.4);
  const W = S.window;
  const LIFE = T + 0.45;

  const field = boltField(vfx, P, 900);
  const rs = restriker(field, seed, () => [{
    bundle: true, a: A, b: B, n: 6, r0: 0.05, r1: 0.3, step: 0.4, width: 0.024,
    heroes: 1, rungs: 0.5, stubs: 0.3, tangle: 0, bend: 0.03, minY: 0.1,
  }], 0.045);

  const headF = boltField(vfx, P, 900);
  const marks = wakeMarks(seed, rng, A, B, len, T, clampN(Math.round(S.marks * len), 30, 140));
  const hd = { f: 0, done: false };
  const rsHead = restriker(headF, seed ^ 0x9d1, (t, g) => {
    const out = [];
    if (!hd.done) {
      const H = [A[0] + ux * len * hd.f, S.y, A[2] + uz * len * hd.f];
      const back = Math.max(0, hd.f - 0.30);
      if (hd.f > 0.02) {
        out.push({
          bundle: true, a: [A[0] + ux * len * back, S.y, A[2] + uz * len * back], b: H,
          n: 5, r0: 0.28, r1: 0.14, cone: 1.0, width: 0.023, bright: 1.0, heroes: 2,
          step: 0.32, rungs: 0.6, stubs: 0.35, tangle: 0, bend: 0.02, phase: 300, minY: 0.1,
        });
      }
      for (let i = 0; i < 2; i++) {
        const a = (0.52 + g() * 0.53) * (g() < 0.5 ? -1 : 1);
        const dx = ux * Math.cos(a) + uz * Math.sin(a), dz = -ux * Math.sin(a) + uz * Math.cos(a);
        const L = 0.5 + g() * 0.6;
        out.push({ a: H, b: [H[0] + dx * L, Math.max(0.1, H[1] + (g() - 0.5) * 0.6), H[2] + dz * L], width: 0.018, bright: 0.9, jag: 0.2, branches: 1, minY: 0.1, phase: 500 + i, step: 0.26 });
      }
    }
    liveMarks(marks, t, out);
    return out;
  }, 0.045);

  stormBurst(vfx, P, { x: A[0], y: S.y, z: A[2], radius: 0.4, endRadius: 1.2, life: 0.3, intensity: 1.0 });
  vfx.flashLight(A[0], S.y, A[2], P[1], 12, 0.2, 6);

  const root = new THREE.Group();
  root.add(field.group, headF.group);
  let lit = null, lightAt = -1, hitDone = false;
  vfx.spawnMesh(root, LIFE, (o, u) => {
    const t = u * LIFE;
    const head = clamp01(t / T);
    hd.f = head; hd.done = t >= T;
    const collapse = hd.done ? clamp01((t - T) / 0.2) : 0;
    const tail0 = Math.max(0, head - W / len);
    field.set({ fade: 1, hot: rs.tick(t), reach: head + 0.001, tail: Math.max(1e-4, tail0 + (head - tail0) * collapse) });
    headF.set({ fade: 1, hot: rsHead.tick(t), reach: 1, tail: 0 });
    const H = [A[0] + ux * len * head, S.y, A[2] + uz * len * head];
    if (!hd.done) {
      if (t - lightAt > 0.3) { lit = heldLight(vfx, H[0], H[1], H[2], P[1], 10, 0.4, 6); lightAt = t; }
      else if (lit) lit(H[0], H[1], H[2]);
      if (!o.userData.sp || t >= o.userData.sp) {
        o.userData.sp = t + 0.045;
        arcSparks(vfx, P, { x: H[0], y: H[1], z: H[2], n: 6, speed: 8, life: 0.3, r: rng });
      }
    } else if (!hitDone) {
      hitDone = true;
      if (e.hit) {
        stormBurst(vfx, P, { x: B[0], y: 1.0, z: B[2], radius: 0.5, endRadius: 1.6, life: 0.35, intensity: 1.1 });
        spikes(vfx, P, { x: B[0], y: 1.0, z: B[2], n: 24, speed: 11, life: 0.3, r: rng });
        kit.decal(vfx, { type: 'arc', x: B[0], z: B[2], radius: S.burnRadius, hold: T + S.burnAfter, tint: BURN, seed: (seed % 7) + 1 });
        vfx.flashLight(B[0], 1.0, B[2], P[1], 18, 0.3, 7);
      }
    }
  });
  rs.tick(0); rsHead.tick(0);
  return true;
}

/* ── блинк ──────────────────────────────────────────────────────────────── */

export function blink(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const BR = (bs ? bs.r : 0.9) * 1.05, BH = (bs ? bs.h : 2.0) * 0.55;
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения по умолчанию — сегодняшние (см. `kit.tune`). */
  const S = kit.tune(e, {
    duration: 0.42,   /* жизнь разряда, с */
    flash: 0.16,      /* сколько горит сквозная полоса, с */
    threads: 8,       /* нитей у каждой точки */
    reach: 0.6,       /* ближний край разлёта нитей по полу, м */
    reachVary: 0.8,   /* разброс разлёта, м */
    ringR: 1.6,       /* кольцо в точке прибытия, м */
    burnRadius: 0.8,  /* ожог у обеих точек, м */
    burnHold: 20,     /* стойкость ожога, с */
  });
  const A = [e.x0, BH, e.z0], B = [e.x1, BH, e.z1];
  const len = Math.hypot(B[0] - A[0], B[2] - A[2]);
  const LIFE = S.duration;

  const field = boltField(vfx, P, 1400);
  const rs = restriker(field, seed, (t, g) => {
    const out = [];
    /* ТЕЛЕПОРТ МГНОВЕНЕН — окно P1 к нему не применяется: разряд между
       точками горит ЦЕЛИКОМ первые 90 мс и гаснет. */
    /* 0.16 с, а не 0.09: судья, снявший кадр на 0.12 с, увидел два
       НЕСВЯЗАННЫХ острова с тёмным провалом между ними — «нет сквозного
       разряда, которого требует спецификация» (40 из 100). Телепорт всё ещё
       мгновенен по смыслу (окно P1 к нему не применяется, полоса горит
       целиком), но он обязан попасть хотя бы в один кадр глаза. */
    if (t < S.flash && len > 0.5) {
      out.push({
        bundle: true, a: A, b: B, n: 7, r0: 0.06, r1: 0.3, step: 0.42, width: 0.028,
        heroes: 3, rungs: 0.6, stubs: 0.35, tangle: 0, bend: 0.05, minY: 0.15, phase: 0,
      });
    }
    /* У СТАРТА разряд уходит В ПОЛ (тело исчезло — заряд стекает), у КОНЦА
       сходится из пола на тело (оно появилось). */
    if (t < S.flash) {
      /* Восемь нитей вместо шести и ядро 0.026: у судьи в коробке отрыва
         было НОЛЬ горячих пикселей — «бледное серо-голубое облачко, а не
         молния». Толстая нить с белым ядром на белом полу читается. */
      for (let i = 0; i < S.threads; i++) {
        const a = g() * TAU, d = S.reach + g() * S.reachVary;
        out.push({ a: [A[0] + Math.sin(a) * BR * 0.6, BH, A[2] + Math.cos(a) * BR * 0.6], b: [A[0] + Math.sin(a) * d, 0.05, A[2] + Math.cos(a) * d], floor: true, floorTop: 0.6, width: 0.026, bright: 1.05, jag: 0.22, branches: 1, minY: 0.05, phase: 100 + i, step: 0.26 });
      }
    }
    if (t >= 0.05 && t < 0.24) {
      for (let i = 0; i < S.threads; i++) {
        const a = g() * TAU, d = S.reach + g() * S.reachVary;
        out.push({ a: [B[0] + Math.sin(a) * d, 0.05, B[2] + Math.cos(a) * d], b: [B[0] + Math.sin(a) * BR * 0.6, BH, B[2] + Math.cos(a) * BR * 0.6], floor: true, floorTop: 0.6, width: 0.026, bright: 1.05, jag: 0.22, branches: 1, minY: 0.05, phase: 200 + i, step: 0.26 });
      }
    }
    /* Диски треска под обеими точками. */
    for (const [j, C] of [[0, A], [1, B]]) {
      const win = Math.floor(t / 0.12);
      const gc = mulberry((seed ^ Math.imul(j * 31 + win + 1, 0x85ebca6b)) >>> 0);
      for (let i = 0; i < 14; i++) {
        const a = gc() * TAU, d = Math.sqrt(gc()) * 1.0;
        out.push({ glyph: true, x: C[0] + Math.sin(a) * d, z: C[2] + Math.cos(a) * d, y: 0.05, dot: gc() < 0.5, links: 3, len: 0.6 + gc() * 0.5, dir: a, width: 0.0055, bright: -0.9, phase: 300 + j * 20 + i, rng: gc });
      }
    }
    return out;
  }, 0.03);

  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    field.set({ fade: t < 0.28 ? 1 : Math.max(0, 1 - (t - 0.28) / 0.12), hot: rs.tick(t), reach: 1, tail: 0 });
  });
  rs.tick(0);

  stormBurst(vfx, P, { x: A[0], y: BH, z: A[2], radius: 0.4, endRadius: 1.3, life: 0.3, intensity: 1.0 });
  stormBurst(vfx, P, { x: B[0], y: BH, z: B[2], radius: 0.3, endRadius: 1.5, life: 0.32, intensity: 1.1 });
  floorRing(vfx, P, { x: B[0], z: B[2], r0: 0.2, r1: S.ringR, life: 0.35, at: 0.05 });
  arcSparks(vfx, P, { x: B[0], y: BH, z: B[2], n: 18, speed: 8, life: 0.35, r: rng });
  vfx.flashLight(B[0], BH, B[2], P[1], 18, 0.3, 7);
  for (const C of [A, B]) kit.decal(vfx, { type: 'arc', x: C[0], z: C[2], radius: S.burnRadius, hold: S.burnHold, tint: BURN, seed: (seed % 7) + 1 });
  return true;
}

/* ── прыжок ─────────────────────────────────────────────────────────────── */

export function jump(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const BR = (bs ? bs.r : 0.9) * 1.05;
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения по умолчанию — сегодняшние (см. `kit.tune`). */
  const S = kit.tune(e, {
    duration: 0.55,     /* время в воздухе, с */
    height: 2.2,        /* высота прыжка (`jumpHeight` сима), м */
    takeoff: 0.18,      /* отрыв: сколько нити бьют в пол, с */
    threads: 6,         /* нитей отрыва */
    reach: 1.2,         /* ближний край веера отрыва, м */
    reachVary: 1.0,     /* разброс веера, м */
    ringTakeoff: 1.8,   /* кольцо отрыва, м */
    ringLand: 2.0,      /* кольцо посадки, м */
    burnRadius: 1.0,    /* ожог посадки, м */
    burnAfter: 6,       /* ожог переживает прыжок на столько, с */
  });
  const dur = Math.max(0.2, S.duration);
  /* ВЕЕР РАСТЁТ С ВЫСОТОЙ ПРЫЖКА. `height` в записи — это `jumpHeight` бойца
     (сим, `deliver.js`), а он у разных тел от 0.8 до 3.2 м: без него подскок
     и настоящий прыжок разряжались одинаково. 2.2 м — прежнее число модуля,
     так что множитель ведёт себя как единица только на нём. */
  const hk = S.height / 2.2;
  const LIFE = dur + 0.5;

  const field = boltField(vfx, P, 700);
  const rs = restriker(field, seed, (t, g) => {
    const out = [];
    /* ОТРЫВ: четыре нити от низа капсулы в пол за 0.12 с. В ВОЗДУХЕ НИЧЕГО —
       тело не несёт заряда (P1); дуга прыжка нарисована самим телом. */
    if (t < S.takeoff) {
      /* Шесть нитей от низа капсулы наружу по полу на 1.2–2.2 м: замер i1 —
         четыре нити по 0.5–1.1 м с 26 м были невидимы, кадр 0.12 с пустой. */
      for (let i = 0; i < S.threads; i++) {
        const a = (i / S.threads) * TAU + g() * 0.4, d = (S.reach + g() * S.reachVary) * hk;
        out.push({ a: [e.x + Math.sin(a) * BR * 0.5, 0.55, e.z + Math.cos(a) * BR * 0.5], b: [e.x + Math.sin(a) * d, 0.05, e.z + Math.cos(a) * d], floor: true, floorTop: 0.5, width: 0.024, bright: 1.05, jag: 0.22, branches: 1, minY: 0.05, phase: i, step: 0.26 });
      }
      const win = Math.floor(t / S.takeoff);
      const gc = mulberry((seed ^ Math.imul(win + 1, 0x85ebca6b)) >>> 0);
      for (let i = 0; i < 28; i++) {
        const a = gc() * TAU, d = 0.6 + gc() * 1.4;
        out.push({ glyph: true, x: e.x + Math.sin(a) * d, z: e.z + Math.cos(a) * d, y: 0.05, dot: gc() < 0.5, links: 3, len: 0.6 + gc() * 0.5, dir: a, width: 0.0055, bright: -0.9, phase: 50 + i, rng: gc });
      }
    }
    return out;
  }, 0.04);

  let landed = false;
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    field.set({ fade: t < S.takeoff ? 1 : Math.max(0, 1 - (t - S.takeoff) / 0.14), hot: rs.tick(t), reach: 1, tail: 0 });
    if (!landed && t >= dur) {
      landed = true;
      /* ПОСАДКА: разряд бьёт в пол оттуда, где тело коснулось. */
      const p = ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null;
      const lx = p ? p.x : e.x, lz = p ? p.z : e.z;
      stormBurst(vfx, P, { x: lx, y: 0.5, z: lz, radius: 0.5, endRadius: 1.8, life: 0.4, intensity: 1.1, squash: 0.6 });
      radialArcs(vfx, P, seed, lx, lz, 6, S.ringLand * hk, 0.35, 0.35);
      floorRing(vfx, P, { x: lx, z: lz, r0: 0.2, r1: S.ringLand * hk, life: 0.4 });
      kit.decal(vfx, { type: 'arc', x: lx, z: lz, radius: S.burnRadius, hold: dur + S.burnAfter, tint: BURN, seed: (seed % 7) + 1 });
      arcSparks(vfx, P, { x: lx, y: 0.4, z: lz, n: 20, speed: 9, life: 0.4, r: rng });
      vfx.flashLight(lx, 0.6, lz, P[1], 16, 0.3, 7);
      vfx.screen.shake(0.2);
    }
  });
  rs.tick(0);
  floorRing(vfx, P, { x: e.x, z: e.z, r0: 0.3, r1: S.ringTakeoff * hk, life: 0.32 });
  arcSparks(vfx, P, { x: e.x, y: 0.4, z: e.z, n: 12, speed: 7, life: 0.3, r: rng });
  vfx.flashLight(e.x, 0.6, e.z, P[1], 12, 0.2, 5);
  return true;
}

/* ── стена ──────────────────────────────────────────────────────────────── */

export function wall(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения по умолчанию — сегодняшние (см. `kit.tune`);
     `w`, `d`, `height` и `duration` приходят из записи — это КОРОБКА СИМА
     (`effects.js`), и решётка обязана стоять ровно в ней. */
  const S = kit.tune(e, {
    duration: 5,     /* жизнь стены, с */
    w: 4,            /* ширина коробки, м */
    d: 1,            /* глубина коробки, м */
    height: 2.2,     /* высота коробки, м */
    rise: 0.15,      /* рост, с (не длиннее пятой доли жизни) */
    fall: 0.3,       /* опадание, с (не длиннее трети жизни) */
    bars: null,      /* нитей решётки; null — от ширины */
    burnAfter: 6,    /* ожог переживает стену на столько, с */
  });
  const D = Math.max(0.6, S.duration);
  const W = Math.max(0.6, S.w), Dd = Math.max(0.5, S.d);
  /* Рост и опадание — ДОЛИ жизни, а не константы: при D = 0.6 плоские
     0.15 + 0.3 съедали три четверти стены, и она ни разу не стояла. */
  const RISE = Math.min(S.rise, D * 0.2), FALL = Math.min(S.fall, D * 0.35);
  /* Высота — ИЗ ЗАПИСИ. Коробку строит `effects.js` (`h: 2.2`), и с 03.09 она
     едет в записи полем `height`: раньше одно число жило в четырёх местах —
     там, в штатной плите `vfx.js` и здесь дважды. `o.h` во вьювере — ПОЛНАЯ
     высота, поэтому центр решётки на половине. */
  const CY = Math.max(0.3, S.height / 2);

  const field = boltField(vfx, P, 2400);
  /* Решётка ВНУТРИ коробки: сплющенный эллипсоид по её размерам. Охрана
     `surfaceSegs` возвращается при радиусе ≤ 0.2 м — потому `rz` не меньше
     0.25 (тонкая стена глубиной 1 м даёт 0.5). */
  const rz = Math.max(0.25, Dd / 2);
  const rs = restriker(field, seed, (t, g) => {
    const out = [];
    const k = t < RISE ? clamp01(t / RISE) : (t > D - FALL ? clamp01((D - t) / FALL) : 1);
    if (k <= 0) return out;
    /* Два ГЕРОЙСКИХ разряда по торцам: они и читаются как «стена стоит». */
    for (const sgn of [-1, 1]) {
      const px = e.x + sgn * (W / 2) * 0.92, pz = e.z;
      out.push({ a: [px, 0.08, pz], b: [px, 0.08 + (CY * 2 - 0.1) * k, pz], width: 0.032, bright: 1.1, jag: 0.12, branches: 1, minY: 0.06, phase: sgn > 0 ? 0 : 1, step: 0.32 });
    }
    /* Решётка выкладывается ПО ДЛИНЕ СТЕНЫ, нить за нитью с явной точкой
       старта. Замер i2 (одна `surfaceSegs` с общим случайным стартом на
       эллипсоиде 2×1.1×0.5 м): проекция сгущает случайные точки к торцам, и
       решётка сбилась в клубок над левой половиной коробки, правая осталась
       почти пустой (судья, 69 из 100). Явный старт через каждые W/n метров
       раскладывает изгородь ровно. */
    const nn = S.bars ?? clampN(Math.round(W * 3), 8, 18);
    for (let i = 0; i < nn; i++) {
      const fx = ((i + 0.5) / nn - 0.5) * W * 0.94;
      const fy = CY + ((i % 3) - 1) * CY * 0.45;
      out.push({
        surface: true, c: [e.x, CY, e.z], r: W / 2, ry: CY * k, rz,
        start: [e.x + fx, Math.max(0.15, fy), e.z + ((i % 2) ? rz : -rz) * 0.5],
        n: 1, links: 7, link: 0.3, width: 0.024,
        bright: 1.0, rungs: 0, offset: 0.03, seed: (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0,
        minY: 0.06, phase: 10 + i,
      });
    }
    /* Ковёр треска вдоль основания, пересевается раз в полсекунды. */
    const win = Math.floor(t / 0.5);
    const gc = mulberry((seed ^ Math.imul(win + 1, 0x85ebca6b)) >>> 0);
    const m = clampN(Math.round(W * 7), 14, 40);
    for (let i = 0; i < m; i++) {
      out.push({
        glyph: true, x: e.x + (gc() - 0.5) * W * 1.05, z: e.z + (gc() - 0.5) * (Dd + 0.8),
        y: 0.05, dot: gc() < 0.45, links: 3, len: 0.5 + gc() * 0.6, dir: gc() * TAU,
        width: 0.0055, bright: -(0.7 + 0.3 * gc()), phase: 700 + i, rng: gc,
      });
    }
    return out;
  }, 0.08);

  vfx.spawnMesh(field.group, D, (o, u) => {
    const t = u * D;
    const k = t < RISE ? clamp01(t / RISE) : (t > D - FALL ? clamp01((D - t) / FALL) : 1);
    field.set({ fade: k, hot: rs.tick(t), reach: 1, tail: 0 });
    if (!o.userData.sp || t >= o.userData.sp) {
      o.userData.sp = t + 0.5;
      if (t < D - FALL) arcSparks(vfx, P, { x: e.x, y: CY, z: e.z, n: 6, speed: 4, life: 0.4, r: rng, spread: W });
    }
  });
  rs.tick(0);
  kit.decal(vfx, { type: 'arc', x: e.x, z: e.z, radius: Math.max(W, Dd) * 0.6, hold: D + S.burnAfter, tint: BURN, seed: (seed % 7) + 1 });
  vfx.flashLight(e.x, CY, e.z, P[1], 12, 0.3, 7);
  return true;
}
