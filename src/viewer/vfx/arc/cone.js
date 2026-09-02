/** Молния · конус: веер разрядов */

import * as THREE from 'three';
import { clamp01, lerp, mulberry, rnd, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { TAU, clampN, env, onSphere, bodyAt } from './util.js';
import { boltField } from './field.js';
import { orb, halo, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs } from './common.js';

export function cone(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const { range, half } = fp;
  const dir = fp.dir;
  const ux = Math.sin(dir), uz = Math.cos(dir);
  const src = [e.x + ux * 0.6, 1.2, e.z + uz * 0.6];

  const nBolt = clampN(kit.countFor(5, fp.area, kit.REF_AREA.cone, 12), 3, 9);
  const targets = [];
  for (let i = 0; i < nBolt; i++) {
    const a = dir + (-1 + (2 * (i + 0.5)) / nBolt) * half * 0.92 + (rng() - 0.5) * (half / nBolt);
    const d = range * (0.9 + rng() * 0.25);
    targets.push({ p: [e.x + Math.sin(a) * d, 0.1, e.z + Math.cos(a) * d], a, phase: i });
  }
  const nCrawl = clampN(kit.countFor(14, fp.area, kit.REF_AREA.cone, 34), 6, 34);
  const crawls = [];
  for (let i = 0; i < nCrawl; i++) {
    const [x, z, d, a] = kit.inSector({ ...fp, range: range * 1.05 }, rng);
    crawls.push({ x, z, dir: a, len: 0.8 + rng() * 1.4 + d * 0.15, phase: 40 + i });
  }

  const LIFE = 0.8, FULL = 0.45;
  const field = boltField(vfx, P, 1800);
  const strandsAt = (t, r) => {
    const k = env(t, FULL, LIFE);
    const out = [];
    const nb = Math.max(1, Math.round(nBolt * (0.5 + 0.5 * k)));
    for (let i = 0; i < nb; i++) {
      const tg = targets[i];
      out.push({ a: src, b: tg.p, width: 0.055, bright: 1, jag: 0.1, branches: 3, minY: 0.06, phase: tg.phase, step: 0.28 });
      out.push({ a: src, b: tg.p, width: 0.035, bright: 0.8, jag: 0.15, branches: 2, minY: 0.06, phase: tg.phase + 0.5, step: 0.28 });
    }
    const nc = Math.round(crawls.length * (0.4 + 0.6 * k));
    for (let i = 0; i < nc; i++) {
      const c = crawls[i];
      out.push(crawl(c.x, c.z, c.dir, c.len, r, c.phase, 0.045));
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.045);
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    field.set({ fade: env(t, FULL, LIFE), hot, reach: clamp01(t / 0.07) + 0.001 });
  });
  rs.tick(0);

  muzzle(vfx, P, { x: src[0], y: 1.2, z: src[2], dir, size: 1.1, r: rng });
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
  kit.decal(vfx, { type: 'arc', x: e.x + ux * range * 0.55, z: e.z + uz * range * 0.55, radius: range * 0.7, hold: 20, tint: P[1], seed: (seed % 7) + 1 });
  if (half > 0.6) {
    for (const sgn of [-1, 1]) {
      const a = dir + sgn * half * 0.6;
      kit.decal(vfx, { type: 'arc', x: e.x + Math.sin(a) * range * 0.8, z: e.z + Math.cos(a) * range * 0.8, radius: range * 0.4, hold: 20, tint: P[1], seed: ((seed + sgn) % 9) + 1 });
    }
  }
  arcSparks(vfx, P, { x: src[0], y: 1.1, z: src[2], n: 44, speed: 13, life: 0.5, cone: { dir, half }, gravity: -8, r: rng });
  for (const tg of targets) arcSparks(vfx, P, { x: tg.p[0], y: 0.2, z: tg.p[2], n: 9, speed: 5, life: 0.4, gravity: -6, at: vfx.now + 0.05 + rng() * 0.15, r: rng });
  return true;
}
