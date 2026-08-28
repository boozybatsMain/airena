/**
 * Walking around things.
 *
 * ── why this is a capability and not a hint ─────────────────────────────────
 *
 * The first stub match ended with both fighters pressed against the two centre
 * blocks for eighty-nine of ninety seconds, each holding a movement order that
 * pointed straight through a wall. That is not a bug in the collision code —
 * the bodies stopped exactly where they should have — it is what happens when
 * "where to go" and "how to get there" are the same question and the answer has
 * to come from a brain that was handed neither a map query nor a navigator.
 *
 * There were two honest ways out. Move the blocks off the spawn axis, which
 * hides the problem until the first brain decides to run behind cover. Or admit
 * that walking around a box is a MOTOR skill, not a tactical one, and put it in
 * the body where a body's other reflexes live.
 *
 * This file is the second. `api.move` remains raw steering with no help at all,
 * so a brain that wants to strafe, back away or hug a wall can. `api.moveTo`
 * and `api.pathTo` navigate. The brain still chooses every destination; nothing
 * here has an opinion about where a fighter should be.
 *
 * ── the method ──────────────────────────────────────────────────────────────
 *
 * Six convex boxes and four walls, so a visibility graph over the inflated
 * corners is both exact and tiny: at most twenty-four nodes, one pairwise
 * visibility matrix built once per radius, and a Dijkstra over it per query.
 * A grid would need smoothing afterwards to stop the walk looking like a
 * staircase; corner-to-corner segments are already the smoothed answer.
 */

import { clamp, dist2, segBox, segBoxes } from './geom.js';

/** How far outside a box its walkable corners sit. Room for the body plus slack. */
const CORNER_PAD = 0.35;
/** How much a box is inflated when testing whether a path segment is clear. */
const SIGHT_PAD = 0.15;
/** A start or goal is nudged out to here first, so it is never inside SIGHT_PAD. */
const FREE_PAD = 0.22;

/**
 * @param {Array} solids boxes, obstacles and walls alike
 * @param {number} half arena half-width
 * @param {number} radius the body this graph is for
 */
export function createNav(solids, half, radius) {
  const boxes = solids;
  const lim = half - radius - 0.05;
  const cornerInf = radius + CORNER_PAD;
  const sightInf = radius + SIGHT_PAD;
  const freeInf = radius + FREE_PAD;

  const insideFree = (x, z) => {
    for (const o of boxes) {
      if (Math.abs(x - o.x) < o.hx + freeInf && Math.abs(z - o.z) < o.hz + freeInf) return o;
    }
    return null;
  };

  /** Corners of every obstacle, inflated, clamped into the arena, deduped. */
  const nodes = [];
  const seen = new Set();
  for (const o of boxes) {
    if (o.wall) continue; // a wall's corners are outside the arena
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = clamp(o.x + sx * (o.hx + cornerInf), -lim, lim);
        const z = clamp(o.z + sz * (o.hz + cornerInf), -lim, lim);
        if (insideFree(x, z)) continue;
        const key = `${x.toFixed(2)}|${z.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        nodes.push({ x, z });
      }
    }
  }

  const clear = (ax, az, bx, bz) => {
    for (const o of boxes) if (segBox(ax, az, bx, bz, o, sightInf) >= 0) return false;
    return true;
  };

  /** Pairwise visibility, built once. n <= 24, so the matrix is free. */
  const n = nodes.length;
  const adj = [];
  for (let i = 0; i < n; i++) adj.push([]);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!clear(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z)) continue;
      const d = dist2(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z);
      adj[i].push({ j, d });
      adj[j].push({ j: i, d });
    }
  }

  /**
   * Push a point out to somewhere a body can legally stand.
   *
   * A body resting against a wall sits exactly `radius` from it, which is
   * inside `FREE_PAD`, which would make every visibility test from it fail and
   * leave the navigator reporting no route out of a corner. Nudging first costs
   * at most 22 cm of accuracy on a query and removes the whole class.
   */
  const nudge = (x, z) => {
    let px = clamp(x, -lim, lim), pz = clamp(z, -lim, lim);
    for (let k = 0; k < 4; k++) {
      const o = insideFree(px, pz);
      if (!o) break;
      const dxl = px - (o.x - o.hx - freeInf), dxr = (o.x + o.hx + freeInf) - px;
      const dzb = pz - (o.z - o.hz - freeInf), dzt = (o.z + o.hz + freeInf) - pz;
      const m = Math.min(dxl, dxr, dzb, dzt);
      if (m === dxl) px = o.x - o.hx - freeInf - 0.01;
      else if (m === dxr) px = o.x + o.hx + freeInf + 0.01;
      else if (m === dzb) pz = o.z - o.hz - freeInf - 0.01;
      else pz = o.z + o.hz + freeInf + 0.01;
      px = clamp(px, -lim, lim); pz = clamp(pz, -lim, lim);
    }
    return [px, pz];
  };

  /**
   * A route from A to B as a list of waypoints, or null when there is none.
   * The straight line is tried first and is the answer most of the time.
   *
   * The LAST waypoint is the nudged goal, not the raw one. Reporting the raw
   * one was a route this navigator had never checked and often could not walk:
   * `moveTo` the centre of block 'c' left the gorilla at (0.00, -7.55) with the
   * order still standing at t=2, t=6 and t=12, because `steer` failed its own
   * visibility test on the goal, fell back to the same unreachable point, and
   * `moveStep`'s 0.35 m arrival test could never fire. `moveTo(25, 25)` did the
   * same thing against the corner. An unreachable destination now resolves to
   * the nearest point a body of this radius can stand on, which is the answer
   * `path` was using to decide the route in the first place.
   */
  function path(ax, az, bx, bz) {
    const [sx, sz] = nudge(ax, az);
    const [gx, gz] = nudge(bx, bz);
    if (clear(sx, sz, gx, gz)) {
      return { points: [{ x: gx, z: gz }], dist: dist2(ax, az, gx, gz), direct: true };
    }

    const START = n, GOAL = n + 1;
    const px = [...nodes.map((v) => v.x), sx, gx];
    const pz = [...nodes.map((v) => v.z), sz, gz];
    const links = [];
    for (let i = 0; i < n + 2; i++) links.push([]);
    for (let i = 0; i < n; i++) for (const e of adj[i]) links[i].push(e);
    for (let i = 0; i < n; i++) {
      if (clear(sx, sz, px[i], pz[i])) {
        const d = dist2(sx, sz, px[i], pz[i]);
        links[START].push({ j: i, d });
      }
      if (clear(gx, gz, px[i], pz[i])) {
        const d = dist2(gx, gz, px[i], pz[i]);
        links[i].push({ j: GOAL, d });
      }
    }

    const N = n + 2;
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const done = new Uint8Array(N);
    dist[START] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === GOAL) break;
      done[u] = 1;
      for (const e of links[u]) {
        const nd = dist[u] + e.d;
        if (nd < dist[e.j]) { dist[e.j] = nd; prev[e.j] = u; }
      }
    }
    if (!Number.isFinite(dist[GOAL])) return null;

    const out = [];
    for (let cur = GOAL; cur !== -1 && cur !== START; cur = prev[cur]) {
      out.push({ x: px[cur], z: pz[cur] });
    }
    out.reverse();
    return { points: out, dist: dist[GOAL], direct: false };
  }

  /**
   * The direction to steer right now to follow a route to (bx,bz).
   *
   * String-pulled: the furthest waypoint still in plain sight is the one
   * steered at, so a body rounding a corner starts cutting the corner as soon
   * as it can see past it instead of walking to the corner marker and turning
   * on the spot.
   */
  function steer(ax, az, bx, bz) {
    const p = path(ax, az, bx, bz);
    if (!p) return null;
    const [sx, sz] = nudge(ax, az);
    let target = p.points[0];
    for (let i = p.points.length - 1; i >= 0; i--) {
      const w = p.points[i];
      if (clear(sx, sz, w.x, w.z)) { target = w; break; }
    }
    return { x: target.x, z: target.z, dist: p.dist, points: p.points, direct: p.direct };
  }

  return { path, steer, nodes, clear, nudge };
}
