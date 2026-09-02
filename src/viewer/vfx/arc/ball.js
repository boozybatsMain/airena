/** Молния · болт и навес: шаровая молния */

import * as THREE from 'three';
import { clamp01, lerp, mulberry, rnd, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { TAU, clampN, env, onSphere, bodyAt } from './util.js';
import { boltField } from './field.js';
import { orb, halo, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs } from './common.js';

function ball(vfx, e, P, ctx, lob) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const ux = Math.sin(e.h), uz = Math.cos(e.h);
  const speed = e.speed || 20;
  const range = e.range || 10;
  const travel = Math.min(range / speed, 1.6);
  const flown = speed * travel;
  const S = [e.x + ux * 0.7, 1.1, e.z + uz * 0.7];
  const E = [S[0] + ux * flown, lob ? 0.25 : 1.1, S[2] + uz * flown];
  const apex = flown * 0.35;
  const at = (f) => {
    const y = lob ? lerp(S[1], E[1], f) + 4 * apex * f * (1 - f) : S[1];
    return [S[0] + ux * flown * f, y, S[2] + uz * flown * f];
  };
  const HR = 0.55;
  const HOLD = 0.55;
  const LIFE = travel + HOLD;

  /* Голова: шар с ползущими по нему дугами и шлейф дуг назад на несколько
     метров (локально: −z — назад по полёту). */
  const head = new THREE.Group();
  const sph = orb(P, HR, (seed % 5) + 1, 0.6);
  const onHead = boltField(vfx, P, 900);
  head.add(sph.group, onHead.group);
  const headStrands = (t, g) => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      out.push({ a: onSphere(g, HR * 1.1), b: onSphere(g, HR * 1.1), width: 0.04, bright: 0.95, jag: 0.25, branches: 1, phase: i, step: 0.2 });
    }
    const tailK = clamp01(t / 0.12);
    for (let i = 0; i < 4; i++) {
      const tl = (2.2 + g() * 2.0) * tailK;
      out.push({ a: [(g() - 0.5) * 0.4, (g() - 0.5) * 0.4, -HR * 0.5], b: [(g() - 0.5) * 1.4, (g() - 0.5) * 1.0, -tl], width: i === 0 ? 0.055 : 0.04, bright: 0.9, jag: 0.14, branches: 2, phase: 10 + i, step: 0.28 });
    }
    return out;
  };
  const rsHead = restriker(onHead, seed, headStrands, 0.04);

  /* Земля под шаром — в мировом поле; веер при посадке — отдельным полем. */
  const ground = boltField(vfx, P, 500);
  let headPos = at(0);
  const groundStrands = (t, g) => {
    const out = [];
    if (t >= travel) return out;
    const [x, y, z] = headPos;
    if (y < 2.4) {
      for (let i = 0; i < 3; i++) {
        const a = e.h + Math.PI / 2 + (g() < 0.5 ? Math.PI : 0) + (g() - 0.5) * 0.8;
        const d = 0.8 + g() * 1.5;
        out.push({ a: [x, y, z], b: [x + Math.sin(a) * d, 0.05, z + Math.cos(a) * d], width: 0.04, bright: 0.8, jag: 0.2, branches: 1, minY: 0.05, phase: 30 + i, step: 0.25 });
      }
    }
    return out;
  };
  const rsGround = restriker(ground, seed ^ 0x51, groundStrands, 0.045);

  const moveLight = heldLight(vfx, S[0], S[1], S[2], P[1], 14, LIFE, 8);
  const root = new THREE.Group();
  root.add(head, ground.group);
  const look = new THREE.Vector3();
  vfx.spawnMesh(root, LIFE, (o, u) => {
    const t = u * LIFE;
    const f = clamp01(t / travel);
    headPos = at(f);
    const hotG = rsGround.tick(t);
    ground.set({ fade: t < travel ? 1 : 0, hot: hotG, reach: 1 });
    if (t < travel) {
      const hot = rsHead.tick(t);
      onHead.set({ fade: 1, hot, reach: 1 });
      head.position.set(headPos[0], headPos[1], headPos[2]);
      const nx = at(Math.min(1, f + 0.02));
      look.set(nx[0], nx[1], nx[2]);
      head.lookAt(look);
      sph.set(1, 1, HR * (0.9 + 0.1 * Math.sin(t * 27)));
      if (moveLight) moveLight(headPos[0], headPos[1], headPos[2]);
    } else {
      head.visible = false;
      if (!o.userData.landed) {
        o.userData.landed = true;
        stormBurst(vfx, P, { x: E[0], y: Math.max(0.7, E[1]), z: E[2], radius: 0.8, endRadius: 2.6, life: 0.45, intensity: 1.3 });
        radialArcs(vfx, P, seed, E[0], E[2], 9, 2.8, HOLD, 0.5);
        kit.decal(vfx, { type: 'arc', x: E[0], z: E[2], radius: 2.4, hold: 20, tint: P[1], seed: (seed % 7) + 1 });
        kit.impactKit(vfx, { x: E[0], z: E[2], y: 0.9, radius: 2.0, colours: P, strength: 1.3 });
        vfx.screen.aberration(0.6);
        arcSparks(vfx, P, { x: E[0], y: 0.8, z: E[2], n: 50, speed: 10, life: 0.5, r: rng });
      }
    }
  });
  rsHead.tick(0); rsGround.tick(0);

  muzzle(vfx, P, { x: S[0], y: 1.1, z: S[2], dir: e.h, size: 0.8, r: rng });
  /* Шлейф искр рождается вдоль пути в будущем — по мере пролёта головы. */
  const nTrail = clampN(Math.round(flown * 9), 24, 110);
  vfx.add.emit(nTrail, (i, s) => {
    const f = rng();
    const [x, y, z] = at(f);
    s.pos(x + rng() * 0.5 - 0.25, y + rng() * 0.5 - 0.25, z + rng() * 0.5 - 0.25);
    s.vel(-ux * rnd(1, 3, rng) + rnd(-1.2, 1.2, rng), rnd(-0.5, 1.5, rng), -uz * rnd(1, 3, rng) + rnd(-1.2, 1.2, rng));
    s.gravity(0, -6, 0);
    s.color(P[1], P[2]);
    s.life(vfx.now + f * travel, rnd(0.3, 0.5, rng), rnd(0.1, 0.18, rng), kit.SHAPE.spark);
    s.ext(0, 0.3, 1, 1);
  });
  return true;
}

export function bolt(vfx, e, P, ctx) { return ball(vfx, e, P, ctx, false); }
export function lob(vfx, e, P, ctx) { return ball(vfx, e, P, ctx, true); }
