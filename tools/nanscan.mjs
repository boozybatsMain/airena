/**
 * Does this body carry NaN vertices?
 *
 * Its own module for one reason: `tools/forge.mjs` calls `main()` at import
 * time, so nothing in it can be tested without running the CLI. This is the one
 * piece of that file worth a test, because the failure it catches is silent.
 *
 * ## The failure
 *
 * A body can build without throwing, report hundreds of meshes, pass the whole
 * style audit and be written to disk while carrying NaN in a position
 * attribute. Nothing downstream survives it — `computeBoundingBox` returns NaN,
 * the studio cannot frame the creature, the screenshot tool hangs with no error,
 * and in the world the merged bounds go NaN and the body is placed nowhere.
 *
 * Measured on `bench-v7-octopus`: 16 meshes affected, the first
 * `arm-0-core-13`, a `CylinderGeometry`. Twenty-four minutes and two attempts
 * spent producing a creature that cannot be looked at, and the only symptom was
 * a capture tool that never returned.
 *
 * The cause is almost always arithmetic on a value that was never set — a
 * radius, length or angle from an undefined field, or a division by zero while
 * sizing a primitive — which is why the report names a part and a geometry
 * kind rather than just a count. That is what somebody needs to find it.
 */

/**
 * `{ count, part, kind }`, or null when every vertex is finite.
 *
 * Structural: it takes anything with `traverse`, so it never links three.js —
 * the same rule `packages/forge/src/bake.ts` follows and for the same reason.
 * One non-finite value ends the scan of that mesh; the count is meshes
 * affected, not vertices, because "16 meshes" is actionable and "48 912
 * floats" is not.
 */
export function findNonFinite(object) {
  let count = 0;
  let part = null;
  let kind = null;
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry || typeof o.geometry.getAttribute !== 'function') return;
    const pos = o.geometry.getAttribute('position');
    if (!pos || !pos.array) return;
    const a = pos.array;
    for (let i = 0; i < a.length; i++) {
      if (Number.isFinite(a[i])) continue;
      count++;
      if (part === null) {
        part = o.name || '(unnamed)';
        kind = o.geometry.type ?? 'BufferGeometry';
      }
      return;
    }
  });
  return count === 0 ? null : { count, part, kind };
}

/** What the model is told. Names the part, because that is what it must find. */
export function nonFiniteMessage(found) {
  return `${found.count} mesh(es) in this body have NaN or Infinity in their position attribute — the first is `
    + `"${found.part}", a ${found.kind}. A body with NaN vertices has no bounding box, so it cannot be framed, `
    + 'photographed or placed in the world; it is invisible. This is almost always arithmetic on a value that was '
    + 'never set — a radius, length or angle computed from an undefined field, or a division by zero while sizing a '
    + 'primitive. Find where that geometry gets its dimensions and make every one of them a finite number.';
}
