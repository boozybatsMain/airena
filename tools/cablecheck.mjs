/**
 * Does the harness MOVE with the body?
 *
 * ## The defect
 *
 * A hose is rigid geometry — a `TubeGeometry` swept along a curve at build
 * time. It does not bend by itself, and nothing rebuilds it while the creature
 * moves: the baked payload records node transforms and nothing else, so a tube
 * regenerated inside the pose function would never be seen by a viewer at all.
 *
 * So a cable run parented to the body root stays exactly where it was drawn
 * while the limb it was drawn along swings out from under it. On a still
 * screenshot this is invisible. In motion it is the first thing anybody
 * notices: the wires come loose and float in the air on their own.
 *
 * Observed by the operator across nearly every body in rounds v5–v8, and
 * confirmed on disk — `pose()` did not so much as mention the harness on any of
 * `bench-v8-{gorilla,panther,toad,octopus}`.
 *
 * ## Why this is measured rather than asked for
 *
 * The directive already says a run must belong to one moving part and be split
 * at any joint it crosses. Prose in a 51 kB instruction gets satisficed — that
 * is the lesson of every round so far — and this particular failure is
 * *invisible in the still renders the graders score*, so nothing else in the
 * loop can catch it. A number can.
 *
 * ## The method
 *
 * Drive the body's own `pose` function through two situations — standing, then
 * running — and record which nodes actually moved. Then ask, for each tube run,
 * whether it or any ancestor is one of them. A body whose limbs move while its
 * cable does not has a harness that is going to come adrift.
 */

/** Nodes whose world matrix differs between standing and running. */
function movedNodes(root, THREE) {
  const pose = root.userData?.pose;
  if (typeof pose !== 'function') return null;

  const snap = () => {
    const m = new Map();
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      o.matrixWorld.decompose(p, q, s);
      m.set(o, [p.x, p.y, p.z, q.x, q.y, q.z, q.w]);
    });
    return m;
  };

  const base = { t: 0, dt: 1 / 60, speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0 };
  try {
    pose({ ...base });
  } catch {
    return null;
  }
  const still = snap();
  try {
    // A run, mid-stride: the situation where a limb is furthest from rest.
    pose({ ...base, t: 0.5, speed: 3, stride: 0.5 });
  } catch {
    return null;
  }
  const going = snap();

  const moved = new Set();
  for (const [node, a] of still) {
    const b = going.get(node);
    if (b === undefined) continue;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > 1e-4) { moved.add(node); break; }
    }
  }
  // Leave the body standing; a caller may measure something else next.
  try { pose({ ...base }); root.updateMatrixWorld(true); } catch { /* already reported */ }
  return moved;
}

/**
 * How far each node's world origin travelled between the two situations.
 *
 * The first version of this check asked "is any ancestor of this tube in the
 * moved set?", and every body on disk answered yes — because a pose function
 * that moves anything usually moves a high group, and then every node in the
 * tree trivially rides on something that moved. It measured nothing.
 *
 * The question that actually matters is comparative: **did this hose move as
 * much as the hardware around it?** A cable drawn down a thigh but parented to
 * the hips travels a fraction of what the thigh travels, and that gap is the
 * defect, in numbers.
 */
function displacements(root, THREE) {
  const pose = root.userData?.pose;
  if (typeof pose !== 'function') return null;

  const at = (s) => {
    const m = new Map();
    try { pose(s); } catch { return null; }
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      m.set(o, new THREE.Vector3().setFromMatrixPosition(o.matrixWorld));
    });
    return m;
  };

  const base = { t: 0, dt: 1 / 60, speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0 };
  const still = at({ ...base });
  if (still === null) return null;
  // A run, mid-stride: the situation where a limb is furthest from rest.
  const going = at({ ...base, t: 0.5, speed: 3, stride: 0.5 });
  if (going === null) return null;

  const moved = new Map();
  const rest = new Map();
  for (const [node, a] of still) {
    const b = going.get(node);
    if (b === undefined) continue;
    moved.set(node, a.distanceTo(b));
    rest.set(node, a);
  }
  try { pose({ ...base }); root.updateMatrixWorld(true); } catch { /* reported elsewhere */ }
  return { moved, rest };
}

/**
 * `{ tubes, stray, share, worst }`, or null when the question does not apply —
 * no pose function, no tubes, or a body that does not animate at all. Those are
 * other findings and this check must not double-report them.
 *
 * A tube counts as stray when the hardware immediately around it travels a real
 * distance and the tube itself barely follows. Both halves are needed: a hose on
 * a section that genuinely does not move is not a defect, and neither is one
 * that moves along with everything near it.
 */
export function findStrayCable(root, THREE) {
  const d = displacements(root, THREE);
  if (d === null) return null;

  const tubes = [];
  const solids = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.geometry.type === 'TubeGeometry') tubes.push(o);
    else solids.push(o);
  });
  if (tubes.length === 0 || solids.length === 0) return null;

  // Scale everything to the body, so a threshold means the same thing on a
  // 0.9-unit toad and a 5-unit tail.
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;
  const size = new THREE.Vector3();
  box.getSize(size);
  const extent = Math.max(size.x, size.y, size.z);
  if (!(extent > 0)) return null;

  // "Near" is a fraction of the body, not an absolute: the hardware a hose is
  // supposed to be strapped to is the hardware within arm's reach of it.
  const nearR = extent * 0.18;
  let stray = 0;
  let worst = null;

  for (const t of tubes) {
    const p = d.rest.get(t);
    const dt = d.moved.get(t);
    if (p === undefined || dt === undefined) continue;
    const near = [];
    for (const s of solids) {
      const q = d.rest.get(s);
      const ds = d.moved.get(s);
      if (q === undefined || ds === undefined) continue;
      if (q.distanceTo(p) <= nearR) near.push(ds);
    }
    if (near.length < 3) continue;
    near.sort((a, b) => a - b);
    const median = near[(near.length - 1) >> 1];
    // The neighbourhood has to be genuinely in motion before a still hose is a
    // complaint — 2% of the body's own size across a stride.
    if (median < extent * 0.02) continue;
    // And the hose has to be conspicuously left behind, not merely lagging.
    if (dt < median * 0.35) {
      stray++;
      const ratio = median > 0 ? dt / median : 0;
      if (worst === null || ratio < worst.ratio) worst = { name: t.name || '(unnamed)', ratio };
    }
  }
  if (stray === 0) return null;
  return { tubes: tubes.length, stray, share: stray / tubes.length, worst };
}

/**
 * The complaint, in the terms a fix needs.
 *
 * It names the count and the mechanism, because "the cables are wrong" is not
 * something anybody can act on and "seventeen of twenty runs travel a tenth of
 * what the hardware beside them travels" is.
 */
export function strayCableMessage(found) {
  const w = found.worst === null ? '' : ` The worst is "${found.worst.name}", which travels `
    + `${Math.round(found.worst.ratio * 100)}% of what the hardware around it travels.`;
  return `${found.stray} of this body's ${found.tubes} cable runs — ${Math.round(found.share * 100)}% of the harness — `
    + `barely move when the limbs they lie along do.${w} In motion the cable detaches from the body and floats in the `
    + 'air on its own, which is the first thing anyone notices on a creature that is actually walking. A hose is rigid '
    + 'geometry and nothing rebuilds it while the body moves, so this cannot be fixed in the pose function: it has to '
    + 'be fixed by PARENTING. Draw each run in the local space of the ONE part it belongs to and add it to that part. '
    + 'Where a run crosses a joint, split it into two runs — one parented each side — meeting inside a boot, clamp or '
    + 'port collar that hides the seam. Never span a joint with a single tube.';
}
