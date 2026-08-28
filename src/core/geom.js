/**
 * Ground-plane geometry. Everything in Airena happens on the X/Z plane at y=0;
 * `y` exists only as a hop height for the jump and never affects a hit test.
 *
 * Obstacles are axis-aligned boxes so that the two queries the fight is built
 * on stay exact and cheap: segment-vs-box (line of sight, and the laser) and
 * circle-vs-box (a body that must not walk through a wall). A rotated box would
 * cost nothing to draw and a great deal to get right in both, and the arena
 * gains nothing from one.
 */

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function len2(x, z) { return Math.sqrt(x * x + z * z); }
export function dist2(ax, az, bx, bz) { return len2(bx - ax, bz - az); }

/** Normalise, returning `[0,0]` for a zero vector — a zero order is a full stop. */
export function norm2(x, z) {
  const l = len2(x, z);
  return l < 1e-9 ? [0, 0] : [x / l, z / l];
}

/** Signed shortest angle from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Turn `from` toward `to` by at most `maxStep` radians. */
export function turnToward(from, to, maxStep) {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxStep) return to;
  return from + Math.sign(d) * maxStep;
}

/** Heading convention: 0 rad faces +Z; angles increase toward +X. */
export function headingOf(dx, dz) { return Math.atan2(dx, dz); }
export function dirOf(heading) { return [Math.sin(heading), Math.cos(heading)]; }

// ---------------------------------------------------------------------------
// segment vs axis-aligned box
// ---------------------------------------------------------------------------

/**
 * Slab test. Returns the entry parameter t in [0,1] along the segment, or -1.
 *
 * `pad` inflates the box, which is how the same routine serves both the laser
 * (pad 0 — the beam is a line) and a swept body radius.
 */
export function segBox(x0, z0, x1, z1, box, pad = 0) {
  const dx = x1 - x0, dz = z1 - z0;
  const minX = box.x - box.hx - pad, maxX = box.x + box.hx + pad;
  const minZ = box.z - box.hz - pad, maxZ = box.z + box.hz + pad;

  let t0 = 0, t1 = 1;

  if (Math.abs(dx) < 1e-9) {
    if (x0 < minX || x0 > maxX) return -1;
  } else {
    let a = (minX - x0) / dx, b = (maxX - x0) / dx;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }

  if (Math.abs(dz) < 1e-9) {
    if (z0 < minZ || z0 > maxZ) return -1;
  } else {
    let a = (minZ - z0) / dz, b = (maxZ - z0) / dz;
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }

  return t0;
}

/** The nearest box a segment meets, as `{ t, box }`, or null. */
export function segBoxes(x0, z0, x1, z1, boxes, pad = 0) {
  let best = null;
  for (const box of boxes) {
    const t = segBox(x0, z0, x1, z1, box, pad);
    if (t >= 0 && (best === null || t < best.t)) best = { t, box };
  }
  return best;
}

/**
 * Is B visible from A?
 *
 * Centre to centre, deliberately. Testing every silhouette point would let a
 * fighter shoot from behind cover with one shoulder showing, which reads as a
 * bug to anyone watching; centre-to-centre is the rule every arena shooter uses
 * and the one a viewer can predict from the picture.
 */
export function hasLos(ax, az, bx, bz, boxes) {
  return segBoxes(ax, az, bx, bz, boxes) === null;
}

// ---------------------------------------------------------------------------
// circle vs axis-aligned box
// ---------------------------------------------------------------------------

/**
 * Push a circle out of a box along the shortest escape, returning `[dx, dz]`.
 *
 * The centre-inside case is handled separately: the closest surface point is
 * the centre itself, so the direction has to come from the least-penetrated
 * axis instead. Without that branch a body that ends a tick inside a wall stays
 * there forever, which is the classic "creature stuck in geometry" bug.
 */
export function pushOutOfBox(cx, cz, r, box) {
  const minX = box.x - box.hx, maxX = box.x + box.hx;
  const minZ = box.z - box.hz, maxZ = box.z + box.hz;

  if (cx > minX && cx < maxX && cz > minZ && cz < maxZ) {
    const dl = cx - minX, dr = maxX - cx, db = cz - minZ, dt = maxZ - cz;
    const m = Math.min(dl, dr, db, dt);
    if (m === dl) return [-(dl + r), 0];
    if (m === dr) return [dr + r, 0];
    if (m === db) return [0, -(db + r)];
    return [0, dt + r];
  }

  const qx = clamp(cx, minX, maxX), qz = clamp(cz, minZ, maxZ);
  const dx = cx - qx, dz = cz - qz;
  const d = len2(dx, dz);
  if (d >= r) return [0, 0];
  if (d < 1e-9) return [0, r];
  const k = (r - d) / d;
  return [dx * k, dz * k];
}

/** Does a circle overlap a box at all? */
export function circleHitsBox(cx, cz, r, box) {
  const qx = clamp(cx, box.x - box.hx, box.x + box.hx);
  const qz = clamp(cz, box.z - box.hz, box.z + box.hz);
  const dx = cx - qx, dz = cz - qz;
  return dx * dx + dz * dz < r * r;
}

// ---------------------------------------------------------------------------
// segment vs circle — the laser, as a beam of finite width
// ---------------------------------------------------------------------------

/**
 * Where a segment (p0->p1) ENTERS a disc, as a parameter in [0,1], or -1.
 *
 * The beam carries a radius of its own (`BEAM_RADIUS`), added to the target's,
 * because a zero-width hitscan against a 0.9 m body at 20 m subtends 2.6° and
 * turns every shot into a coin flip on the last frame of the turn — which reads
 * as the weapon being broken rather than as the shooter being out of position.
 *
 * ── entry, not exit ─────────────────────────────────────────────────────────
 *
 * The old order tried `t1`, then `t2`, and only treated an origin inside the
 * disc as contact when the EXIT also fell outside the segment. So a muzzle
 * inside the target — which is every laser fired from closer than 2.85 m, and
 * 5.5% of the beams the shipping population fires — reported the far side of
 * the body as the hit parameter, and `resolveStrike` compares that against the
 * first solid: a block sitting behind the target beat a beam already passing
 * through it. Measured against block 'c' with line of sight TRUE, the gorilla
 * flush to its north face: 2.251 m miss:cover, 2.4 miss:cover, 2.6 miss:cover,
 * 2.8 miss:cover, 2.9 damage. The same pair on open ground connected at 2.251.
 *
 * Two other readers wanted the entry as well. The beam VFX draws to this
 * parameter, so 51 of 1 906 beams (2.7%) were drawn running out past the far
 * side of the body they had just hit; that is 0 now. And `dashStep` sweeps the
 * charge against the enemy's disc: from an overlap it used to step the gorilla
 * THROUGH the octopus to its far side before landing the blow.
 *
 * If the origin is inside, contact is at the origin: 0, not t2.
 */
export function segCircle(x0, z0, x1, z1, cx, cz, r) {
  const dx = x1 - x0, dz = z1 - z0;
  const fx = x0 - cx, fz = z0 - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return len2(fx, fz) <= r ? 0 : -1;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t1 < 0 && t2 >= 0) return 0; // the segment starts inside the disc
  return -1;
}

/** Is a point inside a cone of half-angle `half` about `heading`, within `range`? */
export function inCone(fromX, fromZ, heading, half, range, px, pz, targetR) {
  const dx = px - fromX, dz = pz - fromZ;
  const d = len2(dx, dz);
  if (d > range + targetR) return false;
  if (d < 1e-6) return true;
  const a = Math.atan2(dx, dz);
  // A body of radius r at distance d widens the arc it occupies by asin(r/d).
  const widen = d > targetR ? Math.asin(targetR / d) : Math.PI;
  return Math.abs(angleDelta(heading, a)) <= half + widen;
}
