/** Молния · удар на жертве и заряд на кастере */

import * as THREE from 'three';
import { clamp01, lerp, mulberry, rnd, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { TAU, clampN, env, onSphere, bodyAt } from './util.js';
import { boltField } from './field.js';
import { orb, halo, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs } from './common.js';

export function impact(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const victim = bodyAt(ctx, e.who === 'blue' ? 'orange' : 'blue');
  const cx = victim ? victim.x : e.x, cz = victim ? victim.z : e.z;
  const cy = (victim ? victim.y : 0) + 1.1;

  if (e.blocked) {
    stormBurst(vfx, P, { x: e.x, y: 1.0, z: e.z, radius: 0.4, endRadius: 1.1, life: 0.3, intensity: 0.9 });
    arcSparks(vfx, P, { x: e.x, y: 1.0, z: e.z, n: 18, speed: 7, life: 0.35, r: rng });
    return true;
  }

  const LIFE = 0.4;
  const field = boltField(vfx, P, 700);
  const strandsAt = (t, g) => {
    const out = [];
    const k = env(t, 0.22, LIFE);
    const n = Math.max(2, Math.round(7 * k));
    for (let i = 0; i < n; i++) {
      const a = onSphere(g, 1.15), b = onSphere(g, 1.15);
      out.push({ a: [cx + a[0], cy + a[1] * 0.9, cz + a[2]], b: [cx + b[0], cy + b[1] * 0.9, cz + b[2]], width: 0.05, bright: 0.95, jag: 0.22, branches: 1, minY: 0.06, phase: i, step: 0.22 });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.04);
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    field.set({ fade: env(t, 0.22, LIFE), hot, reach: 1 });
  });
  rs.tick(0);

  stormBurst(vfx, P, { x: e.x, y: 1.0, z: e.z, radius: 0.6, endRadius: 2.0, life: 0.42, intensity: 1.1 });
  radialArcs(vfx, P, seed, e.x, e.z, 6, 2.4, 0.4, 0.5);
  kit.decal(vfx, { type: 'arc', x: e.x, z: e.z, radius: 1.6, hold: 20, tint: P[1], seed: (seed % 9) + 1 });
  kit.impactKit(vfx, { x: e.x, z: e.z, y: 1.0, radius: 1.5, colours: P, strength: 0.9 });
  arcSparks(vfx, P, { x: e.x, y: 1.0, z: e.z, n: 36, speed: 9, life: 0.45, r: rng });
  return true;
}

/* ── заряд: дуги сходятся на кастере ───────────────────────────────────── */

export function charge(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const secs = Math.max(0.15, e.windup || 0.4);
  const CY = 1.2;
  const centre = () => {
    const p = bodyAt(ctx, e.who);
    return p ? [p.x, p.y + CY, p.z] : [e.x, CY, e.z];
  };
  kit.charge(vfx, { who: e.who, x: e.x, z: e.z, y: CY, secs, colours: [P[1], P[2], P[2]], mode: 'storm', ctx, n: 30, radius: 2.2 });

  const field = boltField(vfx, P, 800);
  const strandsAt = (t, g) => {
    const [x, y, z] = centre();
    const k = clamp01(t / secs);
    const n = 3 + Math.round(6 * k);
    const R = 2.6 - 1.1 * k;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p = onSphere(g, R);
      out.push({ a: [x + p[0], Math.max(0.08, y + p[1] * 0.8), z + p[2]], b: [x, y, z], width: 0.035 + 0.025 * k, bright: 0.75 + 0.25 * k, jag: 0.18, branches: 1, minY: 0.06, phase: i, step: 0.25 });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.055);
  vfx.spawnMesh(field.group, secs, (o, u) => {
    const t = u * secs;
    const hot = rs.tick(t);
    field.set({ fade: clamp01(t / 0.1) * (0.6 + 0.4 * u), hot, reach: 1 });
  });
  rs.tick(0);
  const [x0, y0, z0] = centre();
  vfx.flashLight(x0, y0, z0, P[1], 8, secs, 5);
  arcSparks(vfx, P, { x: x0, y: y0, z: z0, n: 10, speed: 3, life: 0.3, gravity: -3, at: vfx.now + secs * 0.5, r: rng });
  return true;
}
