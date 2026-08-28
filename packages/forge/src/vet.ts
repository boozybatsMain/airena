/**
 * The door check: is this payload *data*?
 *
 * ── why this is a package function and not a route's private helper ──────────
 *
 * `apps/client/src/forge/sandbox.ts` states the rule this file enforces:
 * `new Function` is a scope, not a sandbox, so running model-authored code is
 * acceptable in exactly one situation — you, on your machine, looking at code a
 * model wrote for a prompt you typed. Everybody else must receive **data**.
 *
 * That is a property of the payload, and a property nobody enforces is a
 * property that decays. It used to be enforced in one place (`bake-dev.ts`, the
 * dev-only route serving `captures/bake/`), which was enough while a bake could
 * only ever come off this developer's disk. It cannot any more: a birth now
 * uploads a bake that a *player's* browser produced, and that payload is served
 * to every spectator in the room. Two doors, one check — so the check moved
 * here, and both doors import it.
 *
 * The scan is deliberately the same one `tests/forgebake.test.ts` runs on
 * `bakeCreature`'s output. Two independent checks of one security property is
 * the point: the test covers the producer, this covers the wire, and a payload
 * that reached the wire by some other route — an upload, say — is exactly the
 * case the test cannot see.
 */

/**
 * Anything that could be executed, or that names a shading language.
 *
 * Blunt on purpose, and only safe to be this blunt because the buffers are
 * checked by alphabet first and then taken out of the text (see `BASE64_ONLY`).
 */
export const EXECUTABLE = /function|=>|isNode|evaluate|shader|wgsl|glsl/i;

/** The honesty prose is *about* shaders, so it is held only to "not callable". */
export const CALLABLE = /=>|\bnew Function\b|\beval\(/;

/**
 * Base64, and nothing else. `A-Z a-z 0-9 + /` with at most two `=` of padding.
 *
 * This is the **stronger** of the two checks and the reason the one above can be
 * as blunt as it is. A `BakedMesh`'s buffers are megabytes of base64, and a
 * case-insensitive four-letter regex over megabytes of near-random characters is
 * a coin flip: the first bake this was pointed at, `ship-opus5-med-v2`, was
 * refused because the letters `wGSl` occur by chance inside its vertex
 * positions. Scanning a buffer for English was never the right question. The
 * right question is "is this only base64", and a string in this alphabet cannot
 * be a script, a shader or a graph — it is a number array with a different
 * spelling, and `assemble.ts` does nothing with it but hand it to `atob` and a
 * typed-array constructor.
 */
export const BASE64_ONLY = /^[A-Za-z0-9+/]*={0,2}$/;

/** The `BakedMesh` fields that are opaque bytes rather than text. */
export const BUFFER_FIELDS = ['position', 'normal', 'uv', 'index', 'color', 'emissive', 'surface'];

/**
 * A ceiling on one uploaded body.
 *
 * Measured: the bakes in `captures/bake/` run 0.85–2.5 MB, and the largest thing
 * the forge has produced (a 24 000-triangle pirate ship with per-vertex colour
 * on every mesh) is 2.5 MB. 12 MB is five times the worst case observed, which
 * leaves room for a genuinely enormous creature and still refuses a body whose
 * only purpose is to fill a disk. Only the upload door applies it — a file
 * already on this machine's disk was put there deliberately.
 */
export const MAX_BAKE_BYTES = 12 * 1024 * 1024;

/**
 * The same ceiling, for a file that is **already on this machine's disk**.
 *
 * The paragraph above says outright that "only the upload door applies it — a
 * file already on this machine's disk was put there deliberately", and then the
 * code applied it everywhere anyway, because the ceiling lived inside the vet
 * rather than at the door. That gap had a visible cost: `gorilla-pose`, one of
 * the fifty-two models in `captures/bake/`, is 12 805 491 bytes — 0.3 MB over —
 * and every read door in the repo refused to serve it. A model somebody paid
 * for, on disk, refused by an *upload* guard.
 *
 * So the ceiling is now the door's argument. An upload keeps 12 MB, because an
 * upload is a stranger's bytes and the number is five times the worst case the
 * forge has ever produced. A read of a local file gets this one, which exists
 * only to refuse something absurd — every other check in this file, and they
 * are the ones that carry the safety claim, still runs unchanged.
 */
export const LOCAL_BAKE_BYTES = 64 * 1024 * 1024;

export type VetVerdict =
  | { readonly ok: true; readonly stats: VetStats }
  | { readonly ok: false; readonly why: string };

/** What the door counted on the way past. Small, and safe to log or serve. */
export interface VetStats {
  readonly meshes: number;
  readonly triangles: number;
  readonly materials: number;
  readonly nodes: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Parse, scan, and say yes or why not.
 *
 * The parse is not decoration: it is what makes the scan meaningful. A regex
 * over raw bytes would also match a comment or a stray string in a file that is
 * not a `BakedCreature` at all, and — more to the point — a file that failed to
 * parse would be passed through as-is and blow up in the client's `JSON.parse`.
 *
 * Takes the **text**, not a parsed object, because the text is what is going to
 * be stored and served. Vetting a parsed copy and shipping the original is a
 * check on a different value than the one that travels.
 *
 * `maxBytes` is the *door's* ceiling and defaults to the upload one. A door
 * reading a file off its own disk passes `LOCAL_BAKE_BYTES`; nothing else about
 * the check changes, and no door may skip it entirely.
 */
export function vetBakedText(text: string, maxBytes: number = MAX_BAKE_BYTES): VetVerdict {
  if (text.length > maxBytes) {
    return { ok: false, why: `${text.length} bytes — over the ${maxBytes} byte ceiling for one body` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, why: 'not JSON' };
  }
  if (!isRecord(parsed)) return { ok: false, why: 'not a baked creature' };
  const record = parsed;
  if (record.version !== 1) return { ok: false, why: `unknown bake version ${String(record.version)}` };

  /*
   * The buffers are checked by alphabet and then taken out of the text scan.
   *
   * Both halves matter. Checking them proves a mesh's bytes are *only* base64,
   * which no script or shader source can be; removing them stops the blunt
   * English scan below from flipping a coin over four megabytes of near-random
   * letters, which is a false refusal of a perfectly safe body.
   */
  const meshes = Array.isArray(record.meshes) ? (record.meshes as unknown[]) : [];
  const scannable: Array<Record<string, unknown>> = [];
  for (let i = 0; i < meshes.length; i++) {
    const raw = meshes[i];
    if (!isRecord(raw)) return { ok: false, why: `mesh ${i} is not an object` };
    const mesh: Record<string, unknown> = { ...raw };
    for (const field of BUFFER_FIELDS) {
      const value = mesh[field];
      if (value === null || value === undefined) continue;
      if (typeof value !== 'string' || !BASE64_ONLY.test(value)) {
        return { ok: false, why: `mesh ${i}.${field} is not base64 — refusing to serve it as geometry` };
      }
      // Replaced by its length, so the scan still sees the *shape* of the mesh
      // record and would still catch a field somebody added beside the buffers.
      mesh[field] = value.length;
    }
    scannable.push(mesh);
  }

  // `lost` is prose written for a person and has to say the words "shader" and
  // "evaluate" to explain what the capture could not carry. Scanning it would
  // fail the guard on its own honesty channel, so it is split off and held to
  // the one rule that matters for English: nothing callable inside a sentence.
  const { lost, meshes: _buffers, ...rest } = record;
  const dataText = JSON.stringify({ ...rest, meshes: scannable });
  const hit = EXECUTABLE.exec(dataText);
  if (hit !== null) {
    return { ok: false, why: `a data field matched ${JSON.stringify(hit[0])} — refusing to serve model code` };
  }
  if (lost !== undefined && CALLABLE.test(JSON.stringify(lost))) {
    return { ok: false, why: 'the loss report carries a callable fragment' };
  }

  const stats = isRecord(record.stats) ? record.stats : {};
  const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    ok: true,
    stats: {
      meshes: meshes.length,
      triangles: count(stats.triangles),
      materials: Array.isArray(record.materials) ? record.materials.length : 0,
      nodes: Array.isArray(record.nodes) ? record.nodes.length : 0,
    },
  };
}
