/**
 * Running the model's code once, on the server, and keeping only the result.
 *
 * ── the hole this closes ─────────────────────────────────────────────────────
 *
 * `apps/client/src/forge/sandbox.ts` says it out loud: `new Function` is a
 * *scope*, not a sandbox. Shadowing `window` and `fetch` stops an accident and
 * stops an attacker for about four seconds, because
 * `({}).constructor.constructor('return globalThis')()` is a well-known escape.
 * That is acceptable for exactly one situation — you, on your machine, looking
 * at code a model wrote for a prompt you typed — and the forge studio is that
 * situation.
 *
 * The game is not. `CONCEPT.md` describes watching strangers' creatures, which
 * with a code-shipping lane means executing a stranger's model-authored
 * JavaScript in your browser: a cross-account code-execution hole with a nice
 * camera on it. The same header names the fix and prefers it — *"bake on the
 * server: run the code once at birth, serialise the resulting geometry and
 * materials, ship data to viewers and never the code"* — and adds the reason it
 * is the better of the two options: the cost of a creature is then paid once
 * rather than once per viewer.
 *
 * This file is that bake. Nothing downstream of it ever sees the model's source.
 *
 * ── why not glTF ─────────────────────────────────────────────────────────────
 *
 * Measured on the shipped corpus, `three`'s `GLTFExporter` carries geometry,
 * hierarchy and names correctly — and silently discards every node graph. A
 * `MeshStandardNodeMaterial` passes the exporter's `isMeshStandardMaterial`
 * check (the node material copies that brand off a real `MeshStandardMaterial`
 * during `setDefaultValues`), so the exporter writes the *scalar fallbacks
 * underneath* the graph and emits no warning at all. On one 385-mesh body that
 * produced 21 identical white-plastic materials with zero diagnostics.
 *
 * The corpus is not incidentally shaded, either: across five buildable
 * creatures there are 32 `colorNode`, 15 `positionNode`, 8 `emissiveNode` and 6
 * `roughnessNode` assignments. `positionNode` is vertex displacement, so a glTF
 * of one of these bodies is wrong about its **silhouette**, not merely its
 * colour. A format that loses the thing the lane exists to produce is not a
 * format this lane can use.
 *
 * So: the geometry is captured after the model has finished with it, the
 * hierarchy and names come across whole, the animation is sampled rather than
 * re-executed, and materials are captured as flat descriptions in a closed
 * vocabulary the client rebuilds. **The client compiles nothing the model
 * wrote.** A material property this file cannot express is lost, and losing it
 * is the price of not shipping code.
 *
 * ── how a node graph's colour gets here anyway ───────────────────────────────
 *
 * The paragraph above used to end at "lost otherwise", and that was measured to
 * mean: 11 of the ship's 15 materials and 7 of the fairy's 7 baked to pure
 * white, because a `colorNode` leaves `material.color` at its constructor
 * default. Roughness and metalness survived; the entire look did not.
 *
 * So the graph is *evaluated* — on a GPU, at bake time, in the same process
 * that already ran the model's `build()` — and only its answer is kept, as one
 * sRGB triple per vertex. `apps/client/src/forge/paint.ts` is that evaluation
 * and its header explains the rasteriser trick; this file is deliberately blind
 * to how the numbers were obtained and takes them through `BakeOptions.paint`
 * as plain arrays. Nothing about the graph itself reaches this file, and
 * therefore nothing about it can reach a viewer.
 *
 * A capture that turns out not to vary across a mesh is promoted back to a
 * material constant rather than shipped as ten thousand copies of one byte,
 * which is why the payload barely moved.
 *
 * ── what is deliberately not preserved ───────────────────────────────────────
 *
 * `userData.update` is a closure, and a closure cannot be serialised. It is
 * sampled into keyframes instead, which captures every transform it animates
 * and nothing else: a material a body animates over time freezes at t=0, and an
 * update that draws from `api.rand`-less `Math.random` freezes one roll of it.
 * Both are recorded in `BakedCreature.lost` rather than hidden, because a lane
 * whose whole purpose is measuring what models do unaided must not quietly
 * launder what they actually emitted.
 */

import { ANIMATIONS } from './anim.js';

/**
 * Structural types only — this module is generic over the three.js namespace it
 * is handed, exactly as `build(THREE, TSL)` is. Importing `three` here would put
 * a renderer in every consumer of a birth, and the server has no business
 * linking one.
 */
export interface BakeableObject {
  readonly type: string;
  readonly name: string;
  readonly children: readonly BakeableObject[];
  readonly userData: Record<string, unknown>;
  readonly position: { x: number; y: number; z: number };
  readonly quaternion: { x: number; y: number; z: number; w: number };
  readonly scale: { x: number; y: number; z: number };
  readonly visible: boolean;
  readonly isMesh?: boolean;
  readonly isLine?: boolean;
  readonly isPoints?: boolean;
  readonly isLight?: boolean;
  readonly geometry?: BakeableGeometry;
  readonly material?: unknown;
  traverse(fn: (o: BakeableObject) => void): void;
}

export interface BakeableGeometry {
  readonly type?: string;
  getIndex(): { array: ArrayLike<number>; count: number } | null;
  getAttribute(name: string): { array: ArrayLike<number>; itemSize: number; count: number } | undefined;
}

// ───────────────────────────────────────────────────────────── the baked shape

/** One node of the creature's tree. `parent` indexes back into the same array. */
export interface BakedNode {
  readonly name: string;
  /** -1 for the root. Always less than this node's own index: the array is a build order. */
  readonly parent: number;
  readonly pos: readonly [number, number, number];
  /** Quaternion, xyzw. */
  readonly rot: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
  readonly visible: boolean;
  /** Index into `BakedCreature.meshes`, or -1 for a pure transform node. */
  readonly mesh: number;
}

/**
 * Geometry, as the buffers the GPU wants.
 *
 * Base64 rather than raw arrays because this crosses a JSON wire and a snapshot
 * file, and a 49 000-triangle body written as a JSON array of floats is roughly
 * six times the size of the same numbers in base64.
 */
export interface BakedMesh {
  /** Float32, xyz per vertex. */
  readonly position: string;
  /** Float32, xyz per vertex. Absent when the model supplied none. */
  readonly normal: string | null;
  /** Float32, uv per vertex. Absent when the model supplied none. */
  readonly uv: string | null;
  /** Uint32, three per triangle. Absent for a non-indexed draw. */
  readonly index: string | null;
  readonly vertexCount: number;
  readonly triangleCount: number;
  /** Index into `BakedCreature.materials`. */
  readonly material: number;
  /** `mesh` | `line` | `points` — how the buffers are drawn. */
  readonly draw: 'mesh' | 'line' | 'points';
  /**
   * The material's `colorNode`, evaluated once per vertex: three **sRGB-encoded
   * bytes** per vertex, base64. Null when the material had no colour graph, or
   * when the graph turned out to be constant across this mesh and was promoted
   * into `BakedMaterial.color` instead.
   *
   * sRGB rather than linear because eight bits of *linear* light spends most of
   * its codes where nothing can see the difference and bands visibly in the
   * shadows; the transfer curve is the entire reason a byte is enough here. The
   * client decodes to linear on load — `linear = srgbToLinear(byte / 255)`.
   */
  readonly color: string | null;
  /**
   * The `emissiveNode` per vertex, same encoding, and a ratio rather than a
   * value: multiply by `BakedMaterial.emissiveScale` for the real radiance.
   * Emissives in this corpus run past 40× white and would otherwise all clip to
   * one dull grey.
   */
  readonly emissive: string | null;
  /**
   * `roughnessNode`, `metalnessNode` and `opacityNode` packed one per channel,
   * three bytes per vertex, base64. **Linear**, not sRGB — none of the three is
   * a colour. Null unless at least one of those slots was a graph that varied.
   */
  readonly surface: string | null;
}

/**
 * A material in a closed vocabulary.
 *
 * Every field here is a plain number or a small array, and the client rebuilds a
 * real material from them. There is no code path from a model's TSL graph to
 * anything executable on a viewer's machine — the graph's *contribution* is
 * captured, when it can be, by the texture bake, and lost otherwise.
 */
export interface BakedMaterial {
  readonly name: string;
  /**
   * Linear RGB, 0..1 — the base colour, or the multiplier on the per-vertex one
   * when `vertexColor` is set (in which case it is white, and the vertices carry
   * everything).
   */
  readonly color: readonly [number, number, number];
  readonly emissive: readonly [number, number, number];
  readonly roughness: number;
  readonly metalness: number;
  readonly opacity: number;
  readonly transparent: boolean;
  readonly doubleSided: boolean;
  /**
   * True when the source material carried a node graph this description could
   * not fully capture. Drives the honest-loss report rather than any rendering
   * decision.
   */
  readonly hadNodeGraph: boolean;
  /** Node slots the source material carried, e.g. `colorNode`. */
  readonly nodeSlots: readonly string[];
  /** Of those, the ones whose answer was read off the GPU and is carried here. */
  readonly capturedSlots: readonly string[];
  /** True when the meshes using this material carry `BakedMesh.color`. */
  readonly vertexColor: boolean;
  /** True when they carry `BakedMesh.emissive`. */
  readonly vertexEmissive: boolean;
  /** True when they carry `BakedMesh.surface`. */
  readonly vertexSurface: boolean;
  /**
   * What the emissive bytes are a ratio of. 1 for an ordinary material; larger
   * when the model wrote a graph that emits past white.
   */
  readonly emissiveScale: number;
}

/**
 * One mesh's captured shader answer, as `BakeOptions.paint` hands it over.
 *
 * Plain arrays and numbers by design: this file must not learn what a TSL node
 * is, and the capture must not learn what a bake is. Byte arrays are three per
 * vertex; `flat*` triples are the same quantity when it did not vary and can be
 * folded back into a material constant.
 */
export interface VertexPaint {
  /** sRGB bytes, 3 per vertex. */
  readonly color?: ArrayLike<number>;
  /** sRGB units 0..1, when `colorNode` was constant across the mesh. */
  readonly flatColor?: readonly [number, number, number];
  readonly emissive?: ArrayLike<number>;
  readonly flatEmissive?: readonly [number, number, number];
  /** What the emissive numbers are a ratio of. */
  readonly emissiveScale?: number;
  /** Linear bytes, 3 per vertex: roughness, metalness, opacity. */
  readonly surface?: ArrayLike<number>;
  readonly flatSurface?: readonly [number, number, number];
  /** Which node slots this record actually answers for. */
  readonly slots: readonly string[];
}

/**
 * One clip of the gait grid, and what situation it was sampled at.
 *
 * The viewer picks by `speed` and blends between neighbours; an `action` clip is
 * played once through instead. Keeping the sampling conditions on the clip
 * rather than in a convention means a viewer never has to guess what
 * `move-2` meant.
 */
export interface BakedNamedClip {
  readonly name: string;
  /** Body-lengths per second this was sampled at. Null for an action or overlay. */
  readonly speed: number | null;
  /** The action it plays, or null for locomotion and overlays. */
  readonly action: string | null;
  /**
   * The axis this clip is the DIFFERENCE along, or null.
   *
   * Present on the additive overlays (`turn-left`, `airborne`, `hurt` …). Such a
   * clip is not a pose — it is a pose *minus the standing pose*, and playing it
   * as if it were one puts the body in a stance it never had. See
   * `packages/forge/src/anim.ts` for why they are recorded this way, and
   * `forge/gait.ts` for what drives each.
   *
   * Optional so every payload baked before overlays existed still reads: absent
   * means "not an overlay", which is what those all are.
   */
  readonly overlay?: string | null;
  readonly clip: BakedClip;
}

/** One sampled transform track. Times are seconds from the loop's start. */
export interface BakedTrack {
  /** Index into `BakedCreature.nodes`. */
  readonly node: number;
  /** Flattened xyz triples, one per key. Empty when this node never translated. */
  readonly pos: readonly number[];
  /** Flattened xyzw quads. Empty when this node never rotated. */
  readonly rot: readonly number[];
  /** Flattened xyz triples. Empty when this node never scaled. */
  readonly scale: readonly number[];
}

export interface BakedClip {
  readonly duration: number;
  readonly times: readonly number[];
  readonly tracks: readonly BakedTrack[];
}

export interface BakedCreature {
  readonly version: 1;
  readonly nodes: readonly BakedNode[];
  readonly meshes: readonly BakedMesh[];
  readonly materials: readonly BakedMaterial[];
  /** Null when the model attached no `userData.update`. */
  readonly clip: BakedClip | null;
  /**
   * The gait grid, when the body carries `userData.pose`.
   *
   * A pose function is driven by the creature's *situation*, and a situation is
   * continuous — it cannot be sampled into one loop the way a clock-driven
   * `update` can. So it is sampled at a handful of points and the viewer blends
   * between them: six speeds of travel, four additive overlays, and one clip
   * per discrete action. `packages/forge/src/anim.ts` is the catalogue and the
   * only place the list is written down.
   *
   * Measured before this was built, on a 1 411-node gorilla: one clip is 54 kB
   * against an 8.42 MB body — six tenths of one per cent, and only seven of its
   * 1 411 nodes actually move. The whole grid is about six per cent. Animation
   * is not what makes a baked creature heavy; vertices are.
   *
   * **Optional**, and it has to be: every payload already baked and served
   * predates it, and a reader that assumed the field would throw on all of
   * them. Absent means "this body has no pose function", which is the same
   * thing a viewer does with an empty grid anyway.
   */
  readonly clips?: readonly BakedNamedClip[] | null;
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly stats: {
    readonly nodes: number;
    readonly named: number;
    readonly meshes: number;
    readonly triangles: number;
    readonly materials: number;
    readonly nodeMaterials: number;
    readonly maxDepth: number;
    /** Meshes whose material's graph was evaluated and kept. */
    readonly paintedMeshes: number;
    /** Raw bytes of per-vertex colour before base64. The capture's whole cost. */
    readonly paintBytes: number;
  };
  /** Everything the bake could not carry, named. Never empty silently. */
  readonly lost: readonly string[];
}

export class BakeError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'BakeError';
    this.reason = reason;
  }
}

// ─────────────────────────────────────────────────────────────────── the bake

/** Base64 for a typed array's bytes, without assuming a DOM or a Buffer. */
function encodeBytes(view: ArrayBufferView): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let binary = '';
  // Chunked because a 200 k-element spread overflows the call stack, and this
  // runs on bodies with a quarter of a million vertices.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  if (typeof btoa === 'function') return btoa(binary);
  // Node before the global `btoa` landed, and any runtime that dropped it.
  const B = (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } }).Buffer;
  if (B === undefined) throw new BakeError('no_base64', 'this runtime has neither btoa nor Buffer');
  return B.from(binary, 'binary').toString('base64');
}

function f32(src: ArrayLike<number>): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i];
  return out;
}

function num(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

/** A three.js `Color`-shaped value, or the fallback. */
function rgb(v: unknown, dflt: readonly [number, number, number]): [number, number, number] {
  if (typeof v !== 'object' || v === null) return [dflt[0], dflt[1], dflt[2]];
  const c = v as { r?: unknown; g?: unknown; b?: unknown };
  return [num(c.r, dflt[0]), num(c.g, dflt[1]), num(c.b, dflt[2])];
}

const NODE_SLOTS = [
  'colorNode', 'emissiveNode', 'positionNode', 'normalNode',
  'roughnessNode', 'metalnessNode', 'opacityNode',
] as const;

/**
 * sRGB byte -> linear unit.
 *
 * The capture spends its eight bits on the perceptual curve (see
 * `BakedMesh.color`); a material constant is documented as linear, so a promoted
 * flat colour has to come back across the same curve rather than be copied.
 */
function srgbToLinear(unit: number): number {
  const c = unit <= 0 ? 0 : unit >= 1 ? 1 : unit;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearTriple(srgb: readonly [number, number, number], scale = 1): [number, number, number] {
  return [srgbToLinear(srgb[0]) * scale, srgbToLinear(srgb[1]) * scale, srgbToLinear(srgb[2]) * scale];
}

function describeMaterial(
  raw: unknown,
  index: number,
  paint: VertexPaint | null,
): { baked: BakedMaterial; slots: string[] } {
  const m = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const slots: string[] = [];
  for (const slot of NODE_SLOTS) if (m[slot] !== undefined && m[slot] !== null) slots.push(slot);
  const name = typeof m.name === 'string' && m.name !== '' ? m.name : 'material_' + String(index);

  const captured = paint === null ? [] : slots.filter((s) => paint.slots.includes(s));
  const vertexColor = paint?.color !== undefined;
  const vertexEmissive = paint?.emissive !== undefined;
  const vertexSurface = paint?.surface !== undefined;
  const emissiveScale = num(paint?.emissiveScale, 1);
  const flatSurface = paint?.flatSurface;

  /*
   * A per-vertex channel leaves its material constant at *identity*, not at the
   * model's original value. The client multiplies the two, so a hull whose graph
   * says "brown" under a material whose forgotten default says "white" must not
   * come out brown-times-something-else once the vertices carry the brown.
   */
  const color: [number, number, number] = vertexColor
    ? [1, 1, 1]
    : paint?.flatColor !== undefined
      ? linearTriple(paint.flatColor)
      : rgb(m.color, [1, 1, 1]);
  const emissive: [number, number, number] = vertexEmissive
    ? [1, 1, 1]
    : paint?.flatEmissive !== undefined
      ? linearTriple(paint.flatEmissive, emissiveScale)
      : rgb(m.emissive, [0, 0, 0]);

  return {
    slots,
    baked: {
      name,
      color,
      emissive,
      roughness: vertexSurface ? 1 : (flatSurface?.[0] ?? num(m.roughness, 1)),
      metalness: vertexSurface ? 1 : (flatSurface?.[1] ?? num(m.metalness, 0)),
      opacity: vertexSurface ? 1 : (flatSurface?.[2] ?? num(m.opacity, 1)),
      transparent: m.transparent === true,
      // `side` 2 is THREE.DoubleSide. Compared numerically so this file needs no
      // three.js import to read a three.js enum.
      doubleSided: num(m.side, 0) === 2,
      hadNodeGraph: slots.length > 0,
      nodeSlots: slots,
      capturedSlots: captured,
      vertexColor,
      vertexEmissive,
      vertexSurface,
      emissiveScale,
    },
  };
}

/**
 * What makes two uses of the same source material *different* baked materials.
 *
 * One `MeshStandardNodeMaterial` shared by a hull and a rudder can read as one
 * flat brown on the first and a gradient on the second, because the graph is a
 * function of position and the two meshes are in different places. Splitting on
 * the capture's answer is what lets a constant result be promoted into a
 * material rather than shipped as ten thousand copies of one byte — the whole
 * payload saving lives here.
 */
function paintSignature(paint: VertexPaint | null): string {
  if (paint === null || paint.slots.length === 0) return '';
  const q = (t: readonly [number, number, number] | undefined): string =>
    t === undefined ? '-' : t.map((v) => Math.round(v * 255)).join('.');
  return [
    paint.color !== undefined ? 'cV' : 'c' + q(paint.flatColor),
    paint.emissive !== undefined ? 'eV' : 'e' + q(paint.flatEmissive),
    'k' + (paint.emissiveScale ?? 1).toFixed(4),
    paint.surface !== undefined ? 'sV' : 's' + q(paint.flatSurface),
  ].join('|');
}

function drawKindOf(o: BakeableObject): 'mesh' | 'line' | 'points' {
  if (o.isPoints === true) return 'points';
  if (o.isLine === true) return 'line';
  return 'mesh';
}

export interface BakeOptions {
  /**
   * How long a loop of the model's animation to sample, in seconds, and how
   * many keys to take across it.
   *
   * There is no way to ask a closure what its period is, so this is a choice
   * rather than a measurement, and `lost` says so. Six seconds at 20 Hz covers
   * the swell-and-roll motion the corpus actually animates without turning a
   * 500-node body's clip into the largest thing on the wire.
   */
  readonly clipSeconds?: number;
  readonly clipHz?: number;
  /** Hard ceiling on triangles. Over it, the bake refuses rather than ships. */
  readonly maxTriangles?: number;
  /**
   * The shader capture's answer for one mesh, or `null` for a mesh whose
   * material carried no graph (or whose graph would not evaluate).
   *
   * A function rather than a map so this file needs no key type and no identity
   * assumptions; `apps/client/src/forge/paint.ts` backs it with a `WeakMap` over
   * the very `Object3D`s being walked. Absent entirely, the bake behaves exactly
   * as it did before colour existed — flat constants and a loud `lost`.
   */
  readonly paint?: (mesh: BakeableObject) => VertexPaint | null;
  /**
   * Whatever the capture refused, could not do, or measured about its own
   * quality — in its own words, joined verbatim into `lost`. The bake cannot see
   * a GPU and must not invent or paraphrase these.
   */
  readonly paintNotes?: readonly string[];
}

const DEFAULT_CLIP_SECONDS = 6;
const DEFAULT_CLIP_HZ = 20;

/**
 * One built object in, one shippable creature out.
 *
 * The object must already have been produced by running the model's `build`.
 * Doing that is the caller's job precisely because it is the dangerous step:
 * this function is pure traversal and never evaluates anything.
 */
export function bakeCreature(root: BakeableObject, opts: BakeOptions = {}): BakedCreature {
  const lost: string[] = [];
  const nodes: BakedNode[] = [];
  const meshes: BakedMesh[] = [];
  const materials: BakedMaterial[] = [];
  // Source material -> its baked variants, keyed by what the capture said about
  // them. See `paintSignature`: one source material can bake to several.
  const materialIndex = new Map<unknown, Map<string, number>>();
  const objectIndex = new Map<BakeableObject, number>();
  /** Source materials already counted, so a split variant is not a second graph. */
  const graphsSeen = new Set<unknown>();
  /** Node slots nobody could capture, source material by source material. */
  const uncaptured = new Map<string, Set<string>>();

  let triangles = 0;
  let named = 0;
  let nodeMaterials = 0;
  let maxDepth = 0;
  let lights = 0;
  let paintedMeshes = 0;
  let paintBytes = 0;

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  const materialFor = (raw: unknown, paint: VertexPaint | null): number => {
    const key = Array.isArray(raw) ? raw[0] : raw;
    const signature = paintSignature(paint);
    let variants = materialIndex.get(key);
    if (variants === undefined) {
      variants = new Map<string, number>();
      materialIndex.set(key, variants);
    }
    const seen = variants.get(signature);
    if (seen !== undefined) return seen;

    const { baked, slots } = describeMaterial(key, materials.length, paint);
    if (slots.length > 0 && !graphsSeen.has(key)) {
      graphsSeen.add(key);
      nodeMaterials++;
      const missed = slots.filter((s) => !baked.capturedSlots.includes(s));
      if (missed.length > 0) {
        const at = uncaptured.get(baked.name) ?? new Set<string>();
        for (const slot of missed) at.add(slot);
        uncaptured.set(baked.name, at);
      }
    }
    if (Array.isArray(raw) && raw.length > 1) {
      lost.push('material "' + baked.name + '": ' + String(raw.length) + ' material groups collapsed to the first');
    }
    const at = materials.length;
    materials.push(baked);
    variants.set(signature, at);
    return at;
  };

  /** Three bytes per vertex, base64, or null when there is nothing to say. */
  const packVertexBytes = (src: ArrayLike<number> | undefined, vertices: number): string | null => {
    if (src === undefined) return null;
    const want = vertices * 3;
    const out = new Uint8Array(want);
    // A capture shorter than the mesh is a bug worth surviving rather than
    // throwing on: the tail stays at zero and the mismatch shows up as black,
    // which is visible, instead of as an exception that loses the whole body.
    for (let i = 0; i < want && i < src.length; i++) out[i] = src[i];
    paintBytes += want;
    return encodeBytes(out);
  };

  // Walk in tree order, so a node's parent is always already emitted and the
  // array is a build order the client can play back as an assembly.
  const walk = (o: BakeableObject, parent: number, depth: number): void => {
    if (depth > maxDepth) maxDepth = depth;

    if (o.isLight === true) {
      // The instruction forbids scenery, and a light is scenery that follows the
      // creature into every room it enters. Dropped rather than shipped, and
      // named so the refusal is visible in the record.
      lights++;
      return;
    }

    let mesh = -1;
    if (o.isMesh === true || o.isLine === true || o.isPoints === true) {
      const g = o.geometry;
      const pos = g?.getAttribute('position');
      if (g !== undefined && pos !== undefined && pos.count > 0) {
        const idx = g.getIndex();
        const nor = g.getAttribute('normal');
        const uv = g.getAttribute('uv');
        const tri = idx !== null ? idx.count / 3 : pos.count / 3;
        triangles += tri;
        // Bounds come off the untransformed positions plus the node's own
        // offset; a full world transform would need a matrix stack this file
        // deliberately does not build. The client recomputes exact bounds when
        // it assembles, and this figure is for the budget gate.
        for (let i = 0; i < pos.count; i++) {
          const x = pos.array[i * pos.itemSize] + o.position.x;
          const y = pos.array[i * pos.itemSize + 1] + o.position.y;
          const z = pos.array[i * pos.itemSize + 2] + o.position.z;
          if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
          if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
          if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
        }
        const paint = opts.paint?.(o) ?? null;
        if (paint !== null && paint.slots.length > 0) paintedMeshes++;
        mesh = meshes.length;
        meshes.push({
          position: encodeBytes(f32(pos.array)),
          normal: nor !== undefined ? encodeBytes(f32(nor.array)) : null,
          uv: uv !== undefined ? encodeBytes(f32(uv.array)) : null,
          index: idx !== null ? encodeBytes(Uint32Array.from(idx.array)) : null,
          vertexCount: pos.count,
          triangleCount: Math.round(tri),
          material: materialFor(o.material, paint),
          draw: drawKindOf(o),
          color: packVertexBytes(paint?.color, pos.count),
          emissive: packVertexBytes(paint?.emissive, pos.count),
          surface: packVertexBytes(paint?.surface, pos.count),
        });
      }
    }

    const at = nodes.length;
    if (o.name !== '') named++;
    nodes.push({
      name: o.name,
      parent,
      pos: [o.position.x, o.position.y, o.position.z],
      rot: [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w],
      scale: [o.scale.x, o.scale.y, o.scale.z],
      visible: o.visible,
      mesh,
    });
    objectIndex.set(o, at);
    for (const child of o.children) walk(child, at, depth + 1);
  };

  walk(root, -1, 0);

  if (nodes.length === 0) throw new BakeError('empty', 'the build returned an object with nothing in it');
  if (meshes.length === 0) throw new BakeError('no_geometry', 'the build produced no drawable geometry');
  const ceiling = opts.maxTriangles ?? Infinity;
  if (triangles > ceiling) {
    throw new BakeError(
      'over_budget',
      'the body is ' + String(Math.round(triangles)) + ' triangles against a ceiling of ' + String(ceiling),
    );
  }
  if (lights > 0) lost.push(String(lights) + ' light(s) inside the body — dropped, a creature does not carry its own lighting');

  reportPaint(lost, {
    capturing: opts.paint !== undefined,
    nodeMaterials,
    paintedMeshes,
    meshes: meshes.length,
    materials,
    uncaptured,
    notes: opts.paintNotes ?? [],
  });

  return {
    version: 1,
    nodes,
    meshes,
    materials,
    clip: sampleClip(root, objectIndex, opts, lost),
    clips: sampleGaitGrid(root, objectIndex, opts, lost),
    bounds: {
      min: Number.isFinite(min[0]) ? min : [0, 0, 0],
      max: Number.isFinite(max[0]) ? max : [0, 0, 0],
    },
    stats: {
      nodes: nodes.length,
      named,
      meshes: meshes.length,
      triangles: Math.round(triangles),
      materials: materials.length,
      nodeMaterials,
      maxDepth,
      paintedMeshes,
      paintBytes,
    },
    lost,
  };
}

/**
 * The colour capture's entry in the honesty channel.
 *
 * Split out because it is the part most likely to drift into a lie by omission:
 * "the colour is captured" is true and is not the whole truth, and the three
 * paragraphs below are the parts a reader would otherwise have to discover by
 * noticing a creature looks wrong. Every one of them names a class of graph that
 * the capture reads *incorrectly* rather than not at all, which is strictly
 * worse than a known gap and therefore has to be said first.
 */
function reportPaint(
  lost: string[],
  what: {
    capturing: boolean;
    nodeMaterials: number;
    paintedMeshes: number;
    meshes: number;
    materials: readonly BakedMaterial[];
    uncaptured: Map<string, Set<string>>;
    notes: readonly string[];
  },
): void {
  for (const note of what.notes) lost.push(note);

  if (!what.capturing) {
    if (what.nodeMaterials > 0) {
      lost.push(
        String(what.nodeMaterials) + ' material(s) carry a node graph and no shader capture ran — '
        + 'every one of them is flattened to its constants, which for a `colorNode` means white',
      );
    }
    return;
  }

  for (const [name, slots] of what.uncaptured) {
    lost.push(
      'material "' + name + '": node graph on ' + [...slots].join(', ')
      + ' — not captured, flattened to its constants',
    );
  }

  if (what.paintedMeshes === 0) return;

  const withVertexColour = what.materials.filter((m) => m.vertexColor).length;
  const promoted = what.materials.filter(
    (m) => m.capturedSlots.includes('colorNode') && !m.vertexColor,
  ).length;
  lost.push(
    'colour is a per-vertex sample of the model\'s shader, not the shader: '
    + String(what.paintedMeshes) + ' of ' + String(what.meshes) + ' meshes read on the GPU, '
    + String(withVertexColour) + ' baked material(s) carrying an RGB per vertex and '
    + String(promoted) + ' whose graph turned out constant and became a flat colour. '
    + 'Detail finer than the gap between two vertices — a checker, a thin stripe, a panel line — '
    + 'is averaged away and cannot be recovered from this record.',
  );
  lost.push(
    'a colour that depends on where the viewer stands is captured wrong, not merely frozen: '
    + '`positionView` and `positionViewDirection` are reconstructed from clip space, and the capture\'s '
    + 'clip space is a vertex-index grid rather than a camera. A fresnel written in world space '
    + '(`cameraPosition` against `positionWorld`) is captured, but from one fixed viewpoint, and will '
    + 'not follow a viewer\'s.',
  );
  lost.push(
    'a colour that depends on time is captured at t=0 — a material that pulses, scrolls or flickers '
    + 'ships as one instant of itself.',
  );
}

/**
 * Turn `userData.update` into keys by running it and watching what moves.
 *
 * This is the only part of the bake that executes anything the model wrote, and
 * it is why the bake belongs on a server rather than on a viewer: the closure
 * gets called here, in a process that is already running the model's code, and
 * never again anywhere else.
 */
/**
 * Sample one situation into a clip, by driving `pose` rather than a clock.
 *
 * The axis differs by what is being sampled, and that is the whole point:
 *
 *  - **locomotion** runs `stride` from 0 to 1, one full gait cycle, at a fixed
 *    speed. Sampling it against *time* would bake in whatever stride length the
 *    model happened to assume and put the skating straight back.
 *  - **an action** runs `phase` from 0 to 1, once through.
 *
 * Everything else about the extraction — dropping channels that never move,
 * the key count, the track shape — is `sampleClip`'s, reused rather than
 * reimplemented so the two can never disagree about what a track is.
 */
function samplePose(
  root: BakeableObject,
  objectIndex: Map<BakeableObject, number>,
  opts: BakeOptions,
  lost: string[],
  situation: { speed: number | null; action: string | null; turn?: number; grounded?: boolean; health?: number },
  baseline?: PoseBaseline,
): BakedClip | null {
  const pose = root.userData?.pose;
  if (typeof pose !== 'function') return null;
  const fn = pose as (s: Record<string, unknown>) => void;

  const seconds = opts.clipSeconds ?? DEFAULT_CLIP_SECONDS;
  const hz = opts.clipHz ?? DEFAULT_CLIP_HZ;
  const keys = Math.max(2, Math.round(seconds * hz));

  // A faster gait cycles faster. One second per cycle at a walk is close enough
  // for a baked loop, and the viewer rescales playback by its own speed anyway.
  const cycle = situation.speed === null || situation.speed <= 0 ? seconds : Math.max(0.35, 1 / Math.max(situation.speed, 0.2));
  const duration = situation.action === null ? cycle : Math.min(seconds, 0.8);
  const dt = duration / (keys - 1);

  const driver = (k: number): void => {
    const u = k / (keys - 1);
    fn({
      t: k * dt,
      dt,
      speed: situation.speed ?? 0,
      // No travel, no cycle. Running `stride` at a standstill makes a body
      // march on the spot, and makes the standing clip — which every other
      // clip is measured against — a moving target.
      stride: situation.action === null && (situation.speed ?? 0) > 0 ? u : 0,
      turn: situation.turn ?? 0,
      grounded: situation.grounded ?? true,
      // `die` is the one action whose whole point is the health ramp; every
      // other situation takes whatever the catalogue pinned, and 1 when it
      // pinned nothing.
      health: situation.action === 'die' ? Math.max(0, 1 - u) : (situation.health ?? 1),
      action: situation.action,
      phase: situation.action === null ? 0 : u,
    });
  };

  return sampleDriven(root, objectIndex, driver, keys, duration, lost, baseline);
}

/**
 * The whole grid, or null when the body has no `pose`.
 *
 * A clip that comes back empty is dropped rather than stored as an empty one:
 * a body that does not move when it is told it is sprinting has nothing to say
 * about sprinting, and an empty track list would make the viewer blend toward
 * a pose that does not exist.
 */
function sampleGaitGrid(
  root: BakeableObject,
  objectIndex: Map<BakeableObject, number>,
  opts: BakeOptions,
  lost: string[],
): BakedNamedClip[] | null {
  if (typeof root.userData?.pose !== 'function') return null;

  const out: BakedNamedClip[] = [];

  /*
   * The standing pose, read off EVERY node rather than off the standing clip's
   * tracks.
   *
   * Reading it from the clip looks equivalent and is not: a clip only carries
   * nodes that moved, so a part that is simply *held somewhere* while standing
   * — which is most of the body — would be absent from the baseline, and a
   * later clip holding it somewhere else would find nothing to differ from and
   * be dropped. That is the same stance-loss the baseline exists to prevent,
   * one level up.
   */
  const fn = root.userData?.pose as (s: Record<string, unknown>) => void;
  const baseline: PoseBaseline = new Map();
  try {
    fn({ t: 0, dt: 0, speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0 });
    root.traverse((o) => {
      const node = objectIndex.get(o);
      if (node === undefined) return;
      baseline.set(node, {
        pos: [o.position.x, o.position.y, o.position.z],
        rot: [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w],
        scale: [o.scale.x, o.scale.y, o.scale.z],
      });
    });
  } catch (err) {
    lost.push('the pose function threw while standing (' + String(err) + ') — no gait grid was sampled');
    return null;
  }

  /*
   * Put the body back in the standing pose before every sample.
   *
   * Without this a clip inherits whatever the previous one left behind: a pose
   * function that only writes a channel under one action leaves it wherever it
   * was, so `hit` sampled after `attack` comes back mid-strike. That makes a
   * clip depend on the ORDER the grid happened to be sampled in, which is the
   * kind of bug that shows up months later as "the flinch looks wrong on some
   * creatures".
   */
  const restore = (): void => {
    root.traverse((o) => {
      const node = objectIndex.get(o);
      const was = node === undefined ? undefined : baseline.get(node);
      if (was === undefined) return;
      // Fields, not `.set()`: `BakeableObject` is a structural type on purpose,
      // because this package must never link three.js. See the header.
      o.position.x = was.pos[0]; o.position.y = was.pos[1]; o.position.z = was.pos[2];
      o.quaternion.x = was.rot[0]; o.quaternion.y = was.rot[1];
      o.quaternion.z = was.rot[2]; o.quaternion.w = was.rot[3];
      o.scale.x = was.scale[0]; o.scale.y = was.scale[1]; o.scale.z = was.scale[2];
    });
  };

  /*
   * One loop over one catalogue (`anim.ts`), and the `stand` entry has to be
   * first: it is what `baseline` was read from, and every other clip below is
   * stored as the difference from it.
   *
   * The three kinds differ only in which fields of the situation get pinned and
   * in what the clip is labelled with — `samplePose` does not care, because a
   * situation is a situation. What DOES differ is the baseline argument: the
   * standing clip is sampled without one, so it carries its own absolute pose,
   * and everything after it is measured against it.
   */
  for (const entry of ANIMATIONS) {
    restore();
    const first = entry.name === 'stand';
    const clip = samplePose(
      root,
      objectIndex,
      opts,
      lost,
      {
        speed: entry.kind === 'action' ? 0 : (entry.at.speed ?? 0),
        action: entry.at.action ?? null,
        turn: entry.at.turn,
        grounded: entry.at.grounded,
        health: entry.at.health,
      },
      first ? undefined : baseline,
    );
    if (clip === null) continue;
    out.push({
      name: entry.name,
      speed: entry.kind === 'locomotion' ? (entry.at.speed ?? 0) : null,
      action: entry.kind === 'action' ? (entry.at.action ?? null) : null,
      overlay: entry.kind === 'overlay' ? entry.name : null,
      clip,
    });
  }

  // And leave the body standing, so `nodes` and `bounds` describe a creature at
  // rest rather than one frozen mid-flinch by whatever was sampled last.
  restore();

  if (out.length === 0) return null;
  lost.push(
    `the gait grid is sampled, not replayed: ${out.length} clips at `
    + `${String(opts.clipHz ?? DEFAULT_CLIP_HZ)} Hz, transforms only. Between them the viewer blends.`,
  );
  return out;
}


function sampleClip(
  root: BakeableObject,
  objectIndex: Map<BakeableObject, number>,
  opts: BakeOptions,
  lost: string[],
): BakedClip | null {
  const update = root.userData?.update;
  if (typeof update !== 'function') return null;
  const fn = update as (t: number, dt: number) => void;

  const seconds = opts.clipSeconds ?? DEFAULT_CLIP_SECONDS;
  const hz = opts.clipHz ?? DEFAULT_CLIP_HZ;
  const keys = Math.max(2, Math.round(seconds * hz));
  const dt = seconds / (keys - 1);

  return sampleDriven(root, objectIndex, (k) => fn(k * dt, dt), keys, seconds, lost);
}

/**
 * Walk a body through `keys` states and keep whatever moved.
 *
 * Split out of `sampleClip` when the gait grid arrived, because the two
 * samplers differ only in what they drive — a clock, or a situation — and every
 * hard-won detail below is common to both: the try/catch that keeps a clip that
 * threw halfway, the constant-channel drop that removes nine tracks in ten, and
 * the honesty note about what sampling loses.
 */
/**
 * Per-node values from the clip a grid is measured against. See `sampleDriven`.
 */
type PoseBaseline = Map<number, { pos: readonly number[]; rot: readonly number[]; scale: readonly number[] }>;

function sampleDriven(
  root: BakeableObject,
  objectIndex: Map<BakeableObject, number>,
  drive: (key: number) => void,
  keys: number,
  duration: number,
  lost: string[],
  baseline?: PoseBaseline,
): BakedClip | null {
  const tracked: BakeableObject[] = [];
  root.traverse((o) => {
    if (objectIndex.has(o)) tracked.push(o);
  });

  const times: number[] = [];
  const pos: number[][] = tracked.map(() => []);
  const rot: number[][] = tracked.map(() => []);
  const scl: number[][] = tracked.map(() => []);
  const step = duration / Math.max(1, keys - 1);

  for (let k = 0; k < keys; k++) {
    try {
      drive(k);
    } catch (err) {
      lost.push('the animation threw at key ' + String(k) + ' (' + String(err) + ') — frozen at the last good key');
      break;
    }
    times.push(k * step);
    for (let i = 0; i < tracked.length; i++) {
      const o = tracked[i];
      pos[i].push(o.position.x, o.position.y, o.position.z);
      rot[i].push(o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w);
      scl[i].push(o.scale.x, o.scale.y, o.scale.z);
    }
  }
  if (times.length < 2) return null;

  /*
   * A channel that never left its first value is normally worth no bytes — on
   * the measured corpus that drops roughly nine tracks in ten.
   *
   * **Unless it is constant at a DIFFERENT value from the baseline.** That case
   * is the whole reason the gait grid exists: a body that drops its spine to
   * run holds the spine there for the entire run clip, so the channel is
   * constant within the clip and would be dropped — losing exactly the stance
   * change the grid was sampled to capture. Found by a test that asserted a
   * walk and a sprint come back different and got two identical clips.
   */
  const constant = (values: number[], stride: number): boolean => {
    for (let i = stride; i < values.length; i++) {
      if (Math.abs(values[i] - values[i % stride]) > 1e-5) return false;
    }
    return true;
  };
  const matchesBaseline = (values: number[], stride: number, was: readonly number[] | undefined): boolean => {
    if (was === undefined) return true;
    for (let i = 0; i < stride; i++) if (Math.abs(values[i] - (was[i] ?? 0)) > 1e-5) return false;
    return true;
  };
  const droppable = (values: number[], stride: number, was: readonly number[] | undefined): boolean =>
    constant(values, stride) && matchesBaseline(values, stride, was);

  const tracks: BakedTrack[] = [];
  for (let i = 0; i < tracked.length; i++) {
    const node = objectIndex.get(tracked[i]);
    if (node === undefined) continue;
    const was = baseline?.get(node);
    const p = droppable(pos[i], 3, was?.pos) ? [] : pos[i];
    const r = droppable(rot[i], 4, was?.rot) ? [] : rot[i];
    const sc = droppable(scl[i], 3, was?.scale) ? [] : scl[i];
    if (p.length === 0 && r.length === 0 && sc.length === 0) continue;
    tracks.push({ node, pos: p, rot: r, scale: sc });
  }
  if (tracks.length === 0) return null;

  return { duration, times, tracks };
}
