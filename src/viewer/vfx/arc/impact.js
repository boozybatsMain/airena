/**
 * Молния · УДАР НА ЖЕРТВЕ и ЗАРЯД НА КАСТЕРЕ (план §3 A7/A8, принцип P2).
 *
 * Прежний удар — семь нитей между случайными точками шара радиуса 1.15 м
 * вокруг жертвы: те же «палки, приклеенные наугад», за которые забракован
 * щит. Теперь разряд ползёт ПО КАПСУЛЕ ТЕЛА (`surfaceSegs`, A0.3): каждый
 * штрих лежит на поверхности, клетки держатся все ~10 перестроек жизни удара.
 *
 * ЧЬЁ ЭТО ТЕЛО. `e.who` — КАСТЕР, а не жертва (`pushImpact` в `deliver.js`
 * пишет `who` кастера), и удар SELF-атомов (лечение, щит, очищение,
 * усиление) прилетает в позицию САМОГО кастера. Значит тело выбирается по
 * расстоянию до точки удара, а не по `who`. Тела дальше 2 м — значит удара
 * по телу не было (укрытие, промах): рисуем шар, как раньше.
 *
 * ЩИТ ПЕРЕХВАТЫВАЕТ УДАР: если у тела жива решётка (`self.js`), разряд
 * ползёт по НЕЙ, а не по телу, и решётка вспыхивает от места попадания.
 *
 * Заряд (A8): сходящиеся нити кончаются НА ПОВЕРХНОСТИ тела кастера, а
 * последнюю треть замаха ползут по ней; в руке набухает шар, который
 * становится выбросом луча или болта.
 */

import * as THREE from 'three';
import { clamp01, mulberry, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { BURN, BURN_FADE, BURN_HOLD, clampN, env, onSphere, bodyAt } from './util.js';
import { boltField } from './field.js';
import { restriker, cloud, stormBurst, arcSparks, spikes, radialArcs } from './common.js';
import { shieldOf } from './self.js';

/**
 * Тело, по которому бить: ближайшее к точке удара из двух, но не дальше 2 м.
 * `null` — бить не по кому, рисуем шар в точке.
 */
function victimShape(e, ctx, reach) {
  if (!ctx || !ctx.bodyShape) return null;
  const cand = ['blue', 'orange'].map((id) => {
    const b = ctx.bodyShape(id);
    return b ? { id, ...b } : null;
  }).filter(Boolean);
  if (!cand.length) return null;
  cand.sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
  const best = cand[0];
  return Math.hypot(best.x - e.x, best.z - e.z) > reach ? null : best;
}

export function impact(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения по умолчанию — сегодняшние (см. `kit.tune`). */
  const S = kit.tune(e, {
    duration: 0.4,     /* жизнь разряда по телу, с */
    full: 0.22,        /* полная сила, с */
    reach: 2,          /* дальше этого тело считается непричастным, м */
    y: 1.1,            /* высота шара, когда бить не по кому, м */
    blastR: 2.0,       /* гроза удара, м */
    arcLen: 2.4,       /* веер дуг по полу, м */
    kitR: 1.5,         /* ударный набор, м */
    burnRadius: 1.2,   /* ожог, м */
    burnHold: BURN_HOLD,  /* выдержка ожога, с (метка рождается в конце разряда) */
    burnFade: BURN_FADE,  /* уход ожога, с */
  });
  const victim = bodyAt(ctx, e.who === 'blue' ? 'orange' : 'blue');
  const cx = victim ? victim.x : e.x, cz = victim ? victim.z : e.z;
  const cy = (victim ? victim.y : 0) + S.y;

  if (e.blocked) {
    stormBurst(vfx, P, { x: e.x, y: 1.0, z: e.z, radius: 0.4, endRadius: 1.1, life: 0.3, intensity: 0.9 });
    arcSparks(vfx, P, { x: e.x, y: 1.0, z: e.z, n: 18, speed: 7, life: 0.35, r: rng });
    return true;
  }

  const LIFE = S.duration;
  const bs = victimShape(e, ctx, S.reach);
  /* Щит перехватывает: разряд ползёт по решётке, и она вспыхивает. */
  const sh = bs ? shieldOf(bs.id) : null;
  const surf = sh
    ? { c: [bs.x, sh.st.ry, bs.z], r: sh.st.r, ry: sh.st.ry, off: 0.035 }
    : bs
      ? { c: [bs.x, bs.h * 0.5, bs.z], r: bs.r * 1.1, ry: bs.h * 0.55, off: 0.04 }
      : null;
  if (sh) { sh.st.flare.until = vfx.now + 0.2; sh.st.flare.x = e.x; sh.st.flare.y = surf.c[1] + surf.ry * 0.4; sh.st.flare.z = e.z; }

  const field = boltField(vfx, P, 700);
  const strandsAt = (t, g) => {
    const out = [];
    const k = env(t, S.full, LIFE);
    if (k <= 0) return out;
    if (surf) {
      /* ПО ПОВЕРХНОСТИ: клетки держатся всю жизнь удара (~10 перестроек). */
      out.push({
        surface: true, c: surf.c, r: surf.r, ry: surf.ry,
        n: clampN(Math.round(4 + 2 * surf.r), 5, 7), links: 3 + Math.floor(g() * 3), link: 0.22,
        width: 0.021, bright: 0.95 * (0.6 + 0.4 * k), rungs: 0.8, offset: surf.off,
        seed, minY: 0.06, phase: 0,
      });
    } else {
      /* Тела нет (укрытие, промах): шар в точке, как раньше. */
      const n = Math.max(2, Math.round(7 * k));
      for (let i = 0; i < n; i++) {
        const a = onSphere(g, 1.15), b = onSphere(g, 1.15);
        out.push({ a: [cx + a[0], cy + a[1] * 0.9, cz + a[2]], b: [cx + b[0], cy + b[1] * 0.9, cz + b[2]], width: 0.03, bright: 0.95, jag: 0.22, branches: 1, minY: 0.06, phase: i, step: 0.22 });
      }
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.04);
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    field.set({ fade: env(t, S.full, LIFE), hot, reach: 1, tail: 0 });
  });
  rs.tick(0);

  stormBurst(vfx, P, { x: e.x, y: 1.0, z: e.z, radius: 0.6, endRadius: S.blastR, life: 0.42, intensity: 1.1 });
  spikes(vfx, P, { x: e.x, y: 1.0, z: e.z, n: 24, speed: 9, life: 0.3, r: rng });
  radialArcs(vfx, P, seed, e.x, e.z, 6, S.arcLen, 0.4, 0.5);
  kit.decal(vfx, { type: 'arc', x: e.x, z: e.z, radius: S.burnRadius, hold: S.burnHold, fade: S.burnFade, tint: BURN, seed: (seed % 9) + 1 });
  kit.impactKit(vfx, { x: e.x, z: e.z, y: 1.0, radius: S.kitR, colours: P, strength: 0.9 });
  arcSparks(vfx, P, { x: e.x, y: 1.0, z: e.z, n: 36, speed: 9, life: 0.45, r: rng });
  return true;
}

/* ── заряд: дуги сходятся на кастере ───────────────────────────────────── */

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения по умолчанию — сегодняшние (см. `kit.tune`). */
  const S = kit.tune(e, {
    windup: 0.4,     /* замах, с */
    y: 1.2,          /* высота, на которой собирается заряд, м */
    reach: 2.6,      /* откуда приходят нити в начале замаха, м */
    close: 1.1,      /* на сколько круг стягивается к концу замаха, м */
    threads: 3,      /* нитей в начале (к концу +6) */
    dots: 30,        /* крошек в круге сбора */
    radius: 2.2,     /* радиус круга сбора, м */
    orbAt: 0.15,     /* за сколько до конца загорается шар в руке, с */
    orbReach: 0.7,   /* вынос шара от тела, м */
  });
  const secs = Math.max(0.15, S.windup);
  const CY = S.y;
  const centre = () => {
    const p = bodyAt(ctx, e.who);
    return p ? [p.x, p.y + CY, p.z] : [e.x, CY, e.z];
  };
  kit.charge(vfx, { who: e.who, x: e.x, z: e.z, y: CY, secs, colours: [P[1], P[2], P[2]], mode: 'storm', ctx, n: S.dots, radius: S.radius, r: rng });

  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null;
  const BR = (bs ? bs.r : 0.9) * 1.1, BH = (bs ? bs.h : 2.0) * 0.55;
  const field = boltField(vfx, P, 800);
  const strandsAt = (t, g) => {
    const [x, y, z] = centre();
    const k = clamp01(t / secs);
    const n = S.threads + Math.round(6 * k);
    const R = S.reach - S.close * k;
    const out = [];
    /* Нити кончаются НА ПОВЕРХНОСТИ тела, а не в его центре: точка на
       капсуле в направлении прихода нити (P2 — энергия садится на тело, а
       не протыкает его). */
    for (let i = 0; i < n; i++) {
      const p = onSphere(g, R);
      const l = Math.hypot(p[0], p[1] * 0.8, p[2]) || 1;
      const b = [x + (p[0] / l) * BR, Math.max(0.1, BH + ((p[1] * 0.8) / l) * BH), z + (p[2] / l) * BR];
      out.push({ a: [x + p[0], Math.max(0.08, y + p[1] * 0.8), z + p[2]], b, width: 0.028 + 0.012 * k, bright: 0.75 + 0.25 * k, jag: 0.18, branches: 1, minY: 0.06, phase: i, step: 0.25 });
    }
    /* Последняя треть замаха: заряд ползёт ПО ТЕЛУ. */
    if (k > 0.7) {
      out.push({
        surface: true, c: [x, BH, z], r: BR, ry: BH, n: 3, links: 3, link: 0.22,
        width: 0.019, bright: 1.0, rungs: 0.4, offset: 0.04, seed, minY: 0.06, phase: 40,
      });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.055);
  let lightAt = -1;
  vfx.spawnMesh(field.group, secs, (o, u) => {
    const t = u * secs;
    const hot = rs.tick(t);
    field.set({ fade: clamp01(t / 0.1) * (0.6 + 0.4 * u), hot, reach: 1, tail: 0 });
    if (t - lightAt > 0.3) { const [lx, ly, lz] = centre(); vfx.flashLight(lx, ly, lz, P[1], 8 + 6 * u, 0.4, 5); lightAt = t; }
  });
  rs.tick(0);
  const [x0, y0, z0] = centre();
  /* Шар в руке на последние 0.15 с — он и становится выбросом луча или
     болта: у каста должно быть НАЧАЛО, а не мгновенное появление. */
  const dir = e.h ?? 0;
  cloud(vfx, P, {
    x: x0 + Math.sin(dir) * S.orbReach, y: 1.1, z: z0 + Math.cos(dir) * S.orbReach,
    at: Math.max(0, secs - S.orbAt), kind: 'orb', r0: 0.1, r1: 0.3, grow: 0.12, hold: 0.03, life: 0.18, seed: (seed % 5) + 1,
  });
  /* Свет 8 → 14 по замаху, возобновляемый: пул круговой, вспышка гаснет
     квадратично за ~0.3 с. */
  vfx.flashLight(x0, y0, z0, P[1], 8, secs, 5);
  arcSparks(vfx, P, { x: x0, y: y0, z: z0, n: 10, speed: 3, life: 0.3, gravity: -3, at: vfx.now + secs * 0.5, r: rng });
  return true;
}
