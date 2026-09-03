/**
 * Молния · КОНУС: веер разрядов (план §3 A5 — полировка, замысел прежний).
 *
 * P1 держится сам: начало у руки, разряды расходятся из неё. Что изменилось
 * против сборки 02.09:
 *   · разряды ПРОРАСТАЮТ поштучно (`u0/u1` своё у каждого) за 0.08 с, а не
 *     появляются целыми: у веера тоже есть начало;
 *   · каждый разряд — маленький ПУЧОК (3 нити, труба 0.18 м), а не две
 *     наложенные нити: с 26 м пара нитей читалась двойной линией;
 *   · ползущие дуги 0.045 м заменены КОВРОМ ГЛИФОВ по сектору: толстая дуга
 *     на полу — «макаронина», крошка — след разряда (эталон Storm Lance);
 *   · ожоги в тоне `BURN`, а не `P[1]` (замер круга 2: `P[1]` даёт серую
 *     копоть 61,94,136 на белом полу).
 */

import { clamp01, mulberry, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { BURN, clampN, env } from './util.js';
import { boltField } from './field.js';
import { restriker, stormBurst, arcSparks, muzzle } from './common.js';

export function cone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const { range, half } = fp;
  const dir = fp.dir;
  const ux = Math.sin(dir), uz = Math.cos(dir);
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения по умолчанию — сегодняшние: запись, не
     несущая поля, даёт прежний кадр (см. `kit.tune`). Дальность и раскрытие
     идут из записи через `footprint` — их крутит сим, а не картинка. */
  const S = kit.tune(e, {
    duration: 0.8,     /* жизнь веера, с */
    full: 0.45,        /* полная сила, с */
    bolts: null,       /* число разрядов; null — от площади следа */
    spread: 0.92,      /* доля раскрытия, занятая разрядами */
    reach: 1,          /* дальность разрядов, доли `range` */
    grow: 0.08,        /* прорастание разряда из руки, с */
    y: 1.2,            /* высота руки, м */
    burnRadius: 0.55,  /* ожог: доли дальности — и радиус, и вынос центра */
    burnHold: 20,      /* стойкость ожога, с */
  });
  const src = [e.x + ux * 0.6, S.y, e.z + uz * 0.6];

  const nBolt = S.bolts ?? clampN(kit.countFor(5, fp.area, kit.REF_AREA.cone, 12), 3, 9);
  const targets = [];
  for (let i = 0; i < nBolt; i++) {
    const a = dir + (-1 + (2 * (i + 0.5)) / nBolt) * half * S.spread + (rng() - 0.5) * (half / nBolt);
    const d = range * S.reach * (0.9 + rng() * 0.25);
    targets.push({ p: [e.x + Math.sin(a) * d, 0.1, e.z + Math.cos(a) * d], a, phase: i });
  }
  /* Ковёр глифов по сектору: у каждой метки свои сид, рождение и жизнь —
     ковёр стоит на месте и остывает, а не мигает новым узором. */
  const nMark = clampN(kit.countFor(60, fp.area, kit.REF_AREA.cone, 160), 30, 160);
  const marks = [];
  for (let i = 0; i < nMark; i++) {
    const [x, z, d, a] = kit.inSector({ ...fp, range: range * 1.05 }, rng);
    marks.push({
      x, z, dir: a + (rng() - 0.5) * 1.4, u: clamp01(d / range),
      born: 0.02 + (d / range) * 0.06 + Math.pow(rng(), 2) * 0.2,
      life: 0.6 + rng() * 0.5, dot: rng() < 0.45, links: 3 + Math.floor(rng() * 3),
      len: 0.5 + rng() * 0.7, phase: 40 + i,
      g: mulberry((seed ^ Math.imul(i + 1, 0x27d4eb2f)) >>> 0),
    });
  }

  const LIFE = S.duration, FULL = S.full;
  const field = boltField(vfx, P, 2200);
  const strandsAt = (t, r) => {
    const k = env(t, FULL, LIFE);
    const out = [];
    const nb = Math.max(1, Math.round(nBolt * (0.5 + 0.5 * k)));
    /* Каждый разряд — свой маленький пучок; прорастает из руки за 0.08 с. */
    for (let i = 0; i < nb; i++) {
      const tg = targets[i];
      const grow = clamp01((t - i * 0.008) / S.grow);
      if (grow <= 0) continue;
      out.push({
        bundle: true, a: src, b: tg.p, n: 3, r0: 0.03, r1: 0.18, step: 0.32,
        width: 0.021, bright: 1, heroes: 1, rungs: 0.4, stubs: 0.35, tangle: 0.4,
        bend: 0.03, minY: 0.06, phase: tg.phase, u0: 0, u1: grow,
      });
    }
    for (const m of marks) {
      const age = (t - m.born) / m.life;
      if (age < 0 || age >= 1) continue;
      const envl = age < 0.85 ? 1 : 1 - (age - 0.85) / 0.15;
      out.push({
        glyph: true, x: m.x, z: m.z, y: 0.05, dot: m.dot, links: m.links, len: m.len,
        dir: m.dir, width: 0.0055, bright: -(0.6 + 0.4 * (1 - age)) * envl,
        phase: m.phase, u: m.u, rng: m.g,
      });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.045);
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    field.set({ fade: env(t, FULL, LIFE), hot, reach: clamp01(t / 0.07) + 0.001, tail: 0 });
  });
  rs.tick(0);

  muzzle(vfx, P, { x: src[0], y: S.y, z: src[2], dir, size: 1.1, r: rng });
  /* Гроза у дальнего края — по одной на ~0.8 рад раскрытия. */
  const nBurst = clampN(Math.round((half * 2) / 0.8), 1, 3);
  for (let i = 0; i < nBurst; i++) {
    const a = dir + (nBurst === 1 ? 0 : (-1 + (2 * (i + 0.5)) / nBurst) * half * 0.7);
    const d = range * 0.9;
    stormBurst(vfx, P, { x: e.x + Math.sin(a) * d, y: 0.6, z: e.z + Math.cos(a) * d, radius: 0.6, endRadius: 1.9, life: 0.45, intensity: 1.1, squash: 0.7 });
  }
  const cx = e.x + ux * range * 0.6, cz = e.z + uz * range * 0.6;
  kit.impactKit(vfx, { x: cx, z: cz, y: 0.8, radius: range * 0.5, colours: P, strength: 1.2 });
  vfx.screen.aberration(0.5);

  /* Ожог размером с сектор плюс два поменьше по краям широкого веера. */
  kit.decal(vfx, { type: 'arc', x: e.x + ux * range * S.burnRadius, z: e.z + uz * range * S.burnRadius, radius: range * S.burnRadius, hold: S.burnHold, tint: BURN, seed: (seed % 7) + 1 });
  arcSparks(vfx, P, { x: src[0], y: 1.1, z: src[2], n: 44, speed: 13, life: 0.5, cone: { dir, half }, gravity: -8, r: rng });
  for (const tg of targets) arcSparks(vfx, P, { x: tg.p[0], y: 0.2, z: tg.p[2], n: 9, speed: 5, life: 0.4, gravity: -6, at: vfx.now + 0.05 + rng() * 0.15, r: rng });
  return true;
}
