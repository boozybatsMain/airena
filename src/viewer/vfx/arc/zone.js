/** Молния · зона: вольтов столб */

import * as THREE from 'three';
import { clamp01, lerp, mulberry, rnd, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { BURN, BURN_AFTER, BURN_FADE, TAU, clampN, env, onSphere, bodyAt } from './util.js';
import { boltField } from './field.js';
import { orb, halo, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs } from './common.js';

export function zone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const r = fp.radius;
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения по умолчанию — сегодняшние: запись, не
     несущая поля, даёт прежний кадр (см. `kit.tune`). */
  const S = kit.tune(e, {
    duration: 3,       /* жизнь зоны, с */
    collapse: 0.32,    /* закрывающий беат, с (не длиннее четверти жизни) */
    fade: kit.FADE_MIN,/* уход огибающей столба, с (не короче пола слоя) */
    land: 0.12,        /* когда столб встаёт на пол, с */
    sky: 9.5,          /* высота, с которой падают разряды, м */
    strikeEvery: 0.3,  /* период ударов с неба, с */
    colH: 2.4,         /* высота колонн на эталонном радиусе, м */
    colVary: 2.0,      /* разброс высоты колонн, м */
    colRef: 3,         /* радиус, на котором колонны ровно `colH`, м */
    dir: e.h || 0,     /* курс кастера при постановке: куда смотрит веер щупалец, рад */
    burnRadius: 1.1,   /* большой ожог, доли радиуса диска */
    strikeBurn: 0.85,  /* ожог одного удара с неба, м */
    burnAfter: BURN_AFTER,  /* ожог переживает зону на столько, с */
    burnFade: BURN_FADE,    /* уход ожога, с */
  });
  const D = Math.max(0.8, S.duration);
  const cx = e.x, cz = e.z;
  const SKY = S.sky;
  const LAND = S.land;
  /* Закрывающий беат — ДОЛЯ жизни, а не константа. При D = 0.8 плоские 0.32 с
     съедали 40 % зоны, а расписание ударов (`t < D - COLLAPSE - 0.15`) не
     пускало в зону короче 0.92 с НИ ОДНОГО удара с неба. */
  const COLLAPSE = Math.min(S.collapse, D * 0.25);
  /*
   * УХОД — ОТДЕЛЬНОЕ ЧИСЛО, И ОНО ДЛИННЕЕ ЗАКРЫВАЮЩЕГО БЕАТА.
   *
   * Плотность столба ехала тем же `c`, что и схлопывание: `1 − c²` на
   * COLLAPSE = 0.32 с. Гейт затухания померил это на чистом прогоне и назвал
   * число: общая огибающая падала с половины пика до пяти процентов за
   * 0.15 с при поле слоя 0.18 (`tools/checkdecay.mjs`, `kit.FADE_MIN` × 0.3).
   * То есть зона гасла ВДВОЕ быстрее, чем разрешено, — ровно то «резко», от
   * которого основатель отказался 04.09.
   *
   * Беат и уход — разные вещи, и теперь это два числа. Беат остаётся 0.32 с:
   * это гроза, волна и толчок, ими зона и заканчивается. Уход — `kit.FADE_MIN`
   * (0.6 с), пол политики слоя, и он начинается раньше беата: столб успевает
   * потускнеть до половины к тому мигу, когда его сдёргивает волной.
   *
   * Потолок в половину жизни нужен зоне короче 1.2 с: отдать ей под уход
   * больше половины значило бы, что она вся — уход. Тот же порог стоит в
   * самом гейте («носитель живёт короче 1.2 с — это доля удара, а не
   * остаток»), так что ниже него зона всё равно не меряется.
   */
  const FADE = Math.min(Math.max(S.fade, COLLAPSE), D * 0.5);

  const nCol = clampN(kit.countFor(10, fp.area, kit.REF_AREA.zone, 28), 4, 28);
  const nRim = clampN(Math.round((TAU * r) / 1.4), 4, 20);
  const nTend = clampN(kit.countFor(7, fp.area, kit.REF_AREA.zone, 18), 3, 18);
  /* Высота колонн — ОТ РАДИУСА ДИСКА. Всё остальное здесь считается от
     `fp.radius` (кромка, свет, ожог, ударный набор, волна), и только силуэт
     столба — то, чем зона и читается, — стоял плоскими 2.4–4.4 м: на диске
     6 м он был ровно такой же, как на 1.5 м. Эталон 3 м — тот же радиус, что
     зашит в `kit.REF_AREA.zone`, так что на нём высота прежняя. */
  const hk = clampN(r / S.colRef, 0.6, 1.6);
  const cols = [];
  for (let i = 0; i < nCol; i++) cols.push({ h: (S.colH + rng() * S.colVary) * hk, phase: 100 + i, w: i < 3 ? 0.06 : 0.04 + rng() * 0.015 });
  const tend = [];
  /* Щупальца стелются от курса кастера: `h` в записи зоны — единственное,
     чем «направление зоны» вообще можно задать (сим пишет его с 03.09). */
  for (let i = 0; i < nTend; i++) tend.push({ phi: S.dir + (i / nTend) * TAU + rng() * 0.4, spin: (rng() - 0.5) * 0.9, phase: 200 + i });

  /* Удары с неба по случайным точкам диска, каждые ~0.34 с. */
  const strikes = [];
  for (let k = 0, t = 0.45 + rng() * 0.2; t < D - COLLAPSE - 0.15; k++, t += S.strikeEvery + rng() * 0.12) {
    const [x, z] = kit.inDisc(cx, cz, r * 0.85, rng);
    strikes.push({ t, x, z, fired: false, phase: 300 + k, until: t + 0.14 });
  }

  const field = boltField(vfx, P, 2600);
  const colBase = (i, t) => {
    /* Колонны переходят с места на место каждые полсекунды — сид от номера
       окна, чтобы место держалось между перестройками. */
    const win = Math.floor(t / 0.5);
    const g = mulberry((seed ^ Math.imul(i * 131 + win * 977 + 1, 0x85ebca6b)) >>> 0);
    const [x, z] = kit.inDisc(cx, cz, r * 0.85, g);
    return [x, z];
  };
  const strandsAt = (t, g) => {
    const out = [];
    if (t < 0.26) {
      for (let i = 0; i < 5; i++) {
        out.push({ a: [cx + (g() - 0.5) * 0.5, SKY, cz + (g() - 0.5) * 0.5], b: [cx, 0.1, cz], width: i === 0 ? 0.09 : 0.045, bright: 1, jag: 0.06, branches: 3, minY: 0.06, phase: i, step: 0.4 });
      }
    }
    if (t < LAND + 0.05 || t >= D) return out;
    const c = clamp01((t - (D - COLLAPSE)) / COLLAPSE);
    const shrink = 1 - c * 0.92;
    const to = (x, z) => [cx + (x - cx) * shrink, cz + (z - cz) * shrink];
    const kIn = clamp01((t - LAND) / 0.25);
    const ncol = Math.round(nCol * kIn);
    for (let i = 0; i < ncol; i++) {
      const cc = cols[i];
      const [bx, bz] = colBase(i, t);
      const [x0, z0] = to(bx, bz);
      const [x1, z1] = to(bx + (cx - bx) * 0.25, bz + (cz - bz) * 0.25);
      out.push({ a: [x0, 0.06, z0], b: [x1, cc.h * (1 - c * 0.5), z1], width: cc.w, bright: 0.95, jag: 0.12, branches: 2, minY: 0.05, phase: cc.phase, step: 0.3 });
    }
    const rr = r * shrink;
    for (let i = 0; i < nRim; i++) {
      const th = t * 1.1 + (i / nRim) * TAU;
      const th2 = th + (TAU / nRim) * 0.85;
      const y1 = 0.12 + g() * 0.5, y2 = 0.12 + g() * 0.5;
      out.push({ a: [cx + Math.sin(th) * rr, y1, cz + Math.cos(th) * rr], b: [cx + Math.sin(th2) * rr, y2, cz + Math.cos(th2) * rr], width: 0.045, bright: 0.9, jag: 0.22, branches: 1, minY: 0.05, phase: 400 + i, step: 0.3 });
    }
    for (let i = 0; i < nTend; i++) {
      const td = tend[i];
      const phi = td.phi + t * td.spin;
      out.push({ a: [cx, 0.07, cz], b: [cx + Math.sin(phi) * rr, 0.05, cz + Math.cos(phi) * rr], floor: true, width: 0.05, bright: 0.9, jag: 0.26, branches: 2, phase: td.phase, step: 0.3 });
    }
    for (const s of strikes) {
      if (t < s.t || t >= s.until) continue;
      /* Повторные удары падают с той же высоты, что и первый (0.79 от неё —
         они бьют чуть ниже): раньше `SKY` и 7.5 были двумя числами про одно
         и то же, и поднять столб значило развести их. */
      for (let i = 0; i < 3; i++) out.push({ a: [s.x + (g() - 0.5) * 0.3, SKY * 0.79, s.z + (g() - 0.5) * 0.3], b: [s.x, 0.08, s.z], width: i === 0 ? 0.075 : 0.04, bright: 1, jag: 0.06, branches: 2, minY: 0.06, phase: s.phase + i, step: 0.4 });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.05);
  const pulse = { next: 0.3 };
  const LIFE = D;
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    const c = clamp01((t - (D - COLLAPSE)) / COLLAPSE);
    /* Огибающая: доля оставшейся жизни к `FADE`, сглаженная тем же полиномом
       3t²−2t³, которым уходят следы на полу и яма статуса пустоты
       (`void.js`, ветка `status`). Ни излома производной на входе в уход, ни
       обрыва на выходе: замер гейта после правки — 0.22 с от половины пика
       до пяти процентов против прежних 0.15. `t < 0.26` из этой ветки ушло
       не потерей, а тождеством: пока столб падает с неба, `left` заведомо
       больше `FADE`, и огибающая и так равна единице. */
    const kf = clamp01((D - t) / FADE);
    field.set({ fade: kf * kf * (3 - 2 * kf), hot, reach: t < 0.26 ? clamp01(t / 0.09) + 0.001 : 1 });
    for (const s of strikes) {
      if (s.fired || t < s.t) continue;
      s.fired = true;
      stormBurst(vfx, P, { x: s.x, y: 0.45, z: s.z, radius: 0.4, endRadius: 1.3, life: 0.32, intensity: 1.0, squash: 0.7 });
      /* Выдержка удара с неба — ОСТАТОК зоны, а не вся её длительность:
         удар на 2.4 с просил `D + burnAfter` и гас на 8.3 с при зоне 3.0 с
         (хвост 5.3 с при потолке слоя 5.0, гейт его не видит — метка
         кладётся из хода формы). Теперь все ожоги зоны гаснут одновременно
         с большим диском. Тон — `BURN`, как у всей молнии: в `P[1]` ожог
         читался серой копотью (замер круга 2: 61,94,136 на белом полу), то
         есть почерком огня, а не разряда. */
      kit.decal(vfx, { type: 'arc', x: s.x, z: s.z, radius: S.strikeBurn, hold: Math.max(0, D - t) + S.burnAfter, fade: S.burnFade, tint: BURN, seed: (s.phase % 9) + 1 });
      vfx.flashLight(s.x, 1.2, s.z, P[0], 22, 0.25, 7);
      arcSparks(vfx, P, { x: s.x, y: 0.2, z: s.z, n: 24, speed: 7, life: 0.45, gravity: -7, r: rng });
      vfx.screen.shake(0.12);
    }
    /* Пульс света в центре, пока столб стоит. */
    if (t >= pulse.next && t < D - COLLAPSE) { pulse.next = t + 0.45; vfx.flashLight(cx, 1.6, cz, P[1], 16, 0.5, r * 3.5); }
  });
  rs.tick(0);

  /* Посадка: гроза, веер дуг, волна, большой ожог под всем диском. */
  stormBurst(vfx, P, { x: cx, y: 0.6, z: cz, radius: 0.7, endRadius: r * 0.9, life: 0.5, intensity: 1.2, squash: 0.75 });
  radialArcs(vfx, P, seed, cx, cz, 8, r * 1.1, 0.5, 0.35);
  /* Ожог — ОСТАТОК: переживает зону, но ровно на `burnAfter`. Прежние
     `20 + D` держали двадцать секунд минимум при любой настройке. Тон —
     `BURN`, а не `P[1]`: бледный `P[1]` даёт на белом полу серую копоть
     (замер круга 2: 61,94,136), и на кадре `arc-zone-t1_50-top` диск под
     живой зоной читался пыльным пятном, пока над ним горели синие щупальца. */
  kit.decal(vfx, { type: 'arc', x: cx, z: cz, radius: r * S.burnRadius, hold: D + S.burnAfter, fade: S.burnFade, tint: BURN, seed: (seed % 7) + 1 });
  kit.impactKit(vfx, { x: cx, z: cz, y: 0.8, radius: r * 0.6, colours: P, strength: 1.3 });
  vfx.screen.aberration(0.6);
  arcSparks(vfx, P, { x: cx, y: 0.3, z: cz, n: 56, speed: 9, life: 0.55, gravity: -7, at: vfx.now + LAND, r: rng });

  /* Треск: искры по диску пачками всю жизнь. */
  const nBatch = Math.ceil((D - COLLAPSE - 0.3) / 0.2);
  const perBatch = clampN(kit.countFor(8, fp.area, kit.REF_AREA.zone, 30), 4, 30);
  for (let k = 0; k < nBatch; k++) {
    const at = vfx.now + 0.3 + k * 0.2;
    vfx.add.emit(perBatch, (i, s) => {
      const [x, z] = kit.inDisc(cx, cz, r * 0.9, rng);
      s.pos(x, 0.08 + rng() * 0.5, z);
      s.vel(rnd(-1.5, 1.5, rng), rnd(1.5, 4.5, rng), rnd(-1.5, 1.5, rng));
      s.gravity(0, -6, 0);
      s.color(P[1], P[2]);
      s.life(at + rng() * 0.2, rnd(0.3, 0.6, rng), rnd(0.1, 0.17, rng), kit.SHAPE.spark);
      s.ext(0, 0.3, 1, 1);
    });
  }

  /* Схлопывание: гроза из центра, волна, толчок. */
  const tail = new THREE.Group();
  vfx.spawnMesh(tail, D, (o, u) => {
    if (!tail.userData.done && u * D >= D - COLLAPSE) {
      tail.userData.done = true;
      stormBurst(vfx, P, { x: cx, y: 0.9, z: cz, radius: r * 0.35, endRadius: r * 1.2, life: 0.45, intensity: 1.3 });
      radialArcs(vfx, P, seed ^ 0x77, cx, cz, 10, r * 1.3, 0.4, 0.4);
      kit.shockwave(vfx, { x: cx, z: cz, radius: r * 1.9, life: 0.5, colour: P[1], intensity: 1.0 });
      vfx.flashLight(cx, 1.5, cz, P[0], 30, 0.4, r * 4);
      vfx.screen.shake(0.5);
      vfx.screen.flash(P[0], 0.14);
      vfx.screen.aberration(0.6);
      arcSparks(vfx, P, { x: cx, y: 0.6, z: cz, n: 60, speed: 12, life: 0.5, gravity: -8, r: rng });
    }
  });
  return true;
}
