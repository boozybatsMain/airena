/** Молния · self: ионизированное гало */

import * as THREE from 'three';
import { clamp01, lerp, mulberry, rnd, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { TAU, clampN, env, onSphere, bodyAt } from './util.js';
import { boltField } from './field.js';
import { orb, halo, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs } from './common.js';

export function self(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const LIFE = 2.4, R = 1.75, CY = 1.15;
  const nArc = 9;
  const arcs = [];
  for (let i = 0; i < nArc; i++) {
    arcs.push({ th: rng() * TAU, ph: (rng() - 0.5) * 2.2, w1: (rng() - 0.5) * 2.6, w2: (rng() - 0.5) * 1.2, span: 1.3 + rng() * 1.2, phase: i });
  }
  const nFeet = 5;
  const feet = [];
  for (let i = 0; i < nFeet; i++) feet.push({ a: (i / nFeet) * TAU + rng(), len: 1.4 + rng() * 1.4, phase: 20 + i });

  const field = boltField(vfx, P, 1200);
  const centre = () => {
    const p = bodyAt(ctx, e.who);
    return p ? [p.x, p.y + CY, p.z] : [e.x, CY, e.z];
  };
  const strandsAt = (t, g) => {
    const [x, y, z] = centre();
    const out = [];
    const k = t < 0.25 ? clamp01(t / 0.25) : env(t, LIFE - 0.45, LIFE);
    const n = Math.max(2, Math.round(nArc * k));
    const rr = R * (0.95 + 0.05 * Math.sin(t * 9));
    for (let i = 0; i < n; i++) {
      const a = arcs[i];
      const th = a.th + t * a.w1, ph = Math.sin(a.ph + t * a.w2) * 1.0;
      const th2 = th + a.span, ph2 = Math.sin(a.ph + 1.3 + t * a.w2 * 1.3) * 1.0;
      out.push({
        a: [x + Math.cos(ph) * Math.sin(th) * rr, y + Math.sin(ph) * rr * 0.8, z + Math.cos(ph) * Math.cos(th) * rr],
        b: [x + Math.cos(ph2) * Math.sin(th2) * rr, y + Math.sin(ph2) * rr * 0.8, z + Math.cos(ph2) * Math.cos(th2) * rr],
        width: i < 3 ? 0.055 : 0.04, bright: 0.95, jag: 0.16, branches: 2, minY: 0.06, phase: a.phase, step: 0.25,
      });
    }
    /* Дуги в пол: гало заземляется, ожог под телом — от них. */
    const nf = Math.round(nFeet * k);
    for (let i = 0; i < nf; i++) {
      const f = feet[i];
      const a = f.a + t * 0.6;
      out.push({ a: [x + Math.sin(a) * rr * 0.5, y - CY * 0.5, z + Math.cos(a) * rr * 0.5], b: [x + Math.sin(a) * (rr * 0.5 + f.len), 0.05, z + Math.cos(a) * (rr * 0.5 + f.len)], width: 0.045, bright: 0.85, jag: 0.2, branches: 2, minY: 0.05, phase: f.phase, step: 0.3 });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, 0.055);

  const sh = orb(P, R * 0.8, (seed % 5) + 1, 0.5);
  const [x0, y0, z0] = centre();
  sh.group.position.set(x0, y0, z0);
  const moveLight = heldLight(vfx, x0, y0, z0, P[1], 14, LIFE, 7);
  const g = new THREE.Group();
  g.add(field.group, sh.group);
  vfx.spawnMesh(g, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    const k = t < 0.25 ? clamp01(t / 0.25) : env(t, LIFE - 0.45, LIFE);
    field.set({ fade: k, hot, reach: 1 });
    const [x, y, z] = centre();
    sh.group.position.set(x, y, z);
    sh.set(k * 0.8, 0, R * 0.8 * (0.8 + 0.2 * k) * (1 + 0.03 * Math.sin(t * 13)));
    if (moveLight) moveLight(x, y, z);
    if (!o.userData.next || t >= o.userData.next) {
      o.userData.next = t + 0.3;
      if (t < LIFE - 0.5) arcSparks(vfx, P, { x, y, z, n: 10, speed: 5, life: 0.4, gravity: -5, r: rng });
    }
  });
  rs.tick(0);

  stormBurst(vfx, P, { x: x0, y: y0, z: z0, radius: 0.6, endRadius: R * 1.6, life: 0.4, intensity: 0.9 });
  radialArcs(vfx, P, seed, x0, z0, 6, 2.4, 0.4, 0.3);
  kit.decal(vfx, { type: 'arc', x: x0, z: z0, radius: 2.2, hold: 20, tint: P[1], seed: (seed % 7) + 1 });
  vfx.flashLight(x0, y0, z0, P[0], 20, 0.25, 8);
  vfx.screen.flash(P[0], 0.06);
  return true;
}
