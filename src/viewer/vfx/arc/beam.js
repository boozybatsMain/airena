/** Молния · луч: главный разряд */

import * as THREE from 'three';
import { clamp01, lerp, mulberry, rnd, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { TAU, clampN, env, onSphere, bodyAt } from './util.js';
import { boltField } from './field.js';
import { orb, halo, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs } from './common.js';

export function beam(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const A = [e.x0, 1.15, e.z0];
  const B = [e.x1, 1.1, e.z1];
  const dx = B[0] - A[0], dz = B[2] - A[2];
  const len = Math.hypot(dx, dz);
  if (len < 0.1) return false;
  const ux = dx / len, uz = dz / len;
  const sx = -uz, sz = ux;
  const dir = Math.atan2(dx, dz);

  /* Нитей — по длине: три на коротком, девять на длинном пучке. */
  const nFil = clampN(Math.round(2.5 + len * 0.42), 3, 9);
  /* Контакты с полом — по одному на ~1.3 м пути: дуги стекают с пучка. */
  const nGround = clampN(Math.round(len / 1.3), 2, 10);
  const contacts = [];
  for (let g = 0; g < nGround; g++) {
    const f = (g + 0.3 + rng() * 0.5) / nGround;
    const sidew = (g % 2 ? -1 : 1) * (0.8 + rng() * 1.6);
    const px = A[0] + ux * len * f, pz = A[2] + uz * len * f;
    contacts.push({
      f, top: [px, 1.15, pz], foot: [px + sx * sidew * 0.6, 0.05, pz + sz * sidew * 0.6],
      out: dir + Math.sign(sidew) * (1.1 + rng() * 0.7), len: 1.2 + rng() * 1.6, phase: 20 + g,
    });
  }

  const LIFE = 0.9, FULL = 0.52;
  const field = boltField(vfx, P, 1800);
  const strandsAt = (t, r) => {
    const k = env(t, FULL, LIFE);
    const n = Math.max(1, Math.round(nFil * (0.4 + 0.6 * k)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const hero = i < 2;
      out.push({
        a: A, b: B, width: hero ? 0.06 : 0.038, bright: hero ? 1 : 0.8 + r() * 0.2,
        jag: hero ? 0.07 : 0.11, branches: hero ? 3 : 2, minY: 0.08, phase: i, step: 0.3,
      });
    }
    const ng = Math.round(contacts.length * (0.5 + 0.5 * k));
    for (let g = 0; g < ng; g++) {
      const c = contacts[g];
      out.push({ a: c.top, b: c.foot, width: 0.04, bright: 0.85, jag: 0.16, branches: 1, minY: 0.05, phase: c.phase, u0: c.f, u1: c.f + 0.05 });
      out.push({ a: c.foot, b: [c.foot[0] + Math.sin(c.out) * c.len, 0.05, c.foot[2] + Math.cos(c.out) * c.len], floor: true, width: 0.045, bright: 0.85, jag: 0.28, branches: 2, phase: c.phase + 0.5, u0: c.f + 0.05, u1: c.f + 0.12 });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.045);
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    field.set({ fade: env(t, FULL, LIFE), hot, reach: clamp01(t / 0.06) + 0.001 });
  });
  rs.tick(0);

  /* Чехол по оси, выброс у руки, гроза у цели, веер дуг по полу вокруг цели. */
  halo(vfx, P, A, B, 0.5, 0.6);
  muzzle(vfx, P, { x: A[0], y: 1.15, z: A[2], dir, size: 0.9, r: rng });
  if (e.hit) {
    stormBurst(vfx, P, { x: B[0], y: 1.05, z: B[2], radius: 0.9, endRadius: 2.6, life: 0.5, intensity: 1.2 });
    radialArcs(vfx, P, seed, B[0], B[2], 7, 2.6, 0.45, 0.5);
  } else {
    stormBurst(vfx, P, { x: B[0], y: 0.9, z: B[2], radius: 0.5, endRadius: 1.5, life: 0.35, intensity: 0.9 });
    radialArcs(vfx, P, seed, B[0], B[2], 4, 1.8, 0.35, 0.4);
  }
  kit.impactKit(vfx, { x: B[0], z: B[2], y: 1.0, radius: 2.0, colours: P, strength: e.hit ? 1.4 : 0.9 });
  vfx.screen.aberration(0.7);
  vfx.flashLight(A[0], 1.4, A[2], P[1], 16, 0.3, 7);

  /* Следы: ожог у цели и под каждым контактом дуги с полом. */
  kit.decal(vfx, { type: 'arc', x: B[0], z: B[2], radius: 2.6, hold: 20, tint: P[1], seed: (seed % 7) + 1 });
  for (const c of contacts) kit.decal(vfx, { type: 'arc', x: c.foot[0], z: c.foot[2], radius: 1.0 + rng() * 0.5, hold: 20, tint: P[1], seed: (c.phase % 9) + 1 });

  arcSparks(vfx, P, { x: B[0], y: 1.0, z: B[2], n: 50, speed: 11, life: 0.5, r: rng });
  arcSparks(vfx, P, { x: A[0], y: 1.15, z: A[2], n: 16, speed: 6, life: 0.35, r: rng });
  for (const c of contacts) arcSparks(vfx, P, { x: c.foot[0], y: 0.1, z: c.foot[2], n: 9, speed: 5, life: 0.4, gravity: -6, at: vfx.now + rng() * 0.2, r: rng });
  /* Искры вдоль пучка, рождаются по ходу жизни — пучок сыплет, пока стоит. */
  const nAlong = clampN(Math.round(len * 6), 12, 70);
  vfx.add.emit(nAlong, (i, s) => {
    const f = rng();
    s.pos(A[0] + ux * len * f + rng() * 0.6 - 0.3, 1.15 + rng() * 0.6 - 0.3, A[2] + uz * len * f + rng() * 0.6 - 0.3);
    s.vel(rnd(-2, 2, rng), rnd(-1, 2.5, rng), rnd(-2, 2, rng));
    s.gravity(0, -7, 0);
    s.color(P[1], P[2]);
    s.life(vfx.now + rng() * FULL, rnd(0.25, 0.5, rng), rnd(0.1, 0.18, rng), kit.SHAPE.spark);
    s.ext(0, 0.3, 1, 1);
  });
  return true;
}
