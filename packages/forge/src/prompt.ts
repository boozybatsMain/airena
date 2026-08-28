/**
 * The instruction. All of it. This file is the whole design system.
 *
 * ── why this file is nine lines of prose and not nine hundred ────────────────
 *
 * The other lane (`@autoage/fabricator`) hands the model a vocabulary: node
 * kinds, an angle ladder, a radius ladder, a mass-role table, a power budget, a
 * JSON schema with `strict: true` compiled into the decoder. It is a large,
 * careful, well-tested machine, and the body it produces is not the thing the
 * player asked for. `docs/TRACEABILITY.md` records the verdict in the only terms
 * that matter: no carapace and no claw on the crab, no hull on the ship, a wolf
 * in two disconnected pieces. Every check in the repo passes on a body nobody
 * can name.
 *
 * The hypothesis this lane tests is that the vocabulary *is* the defect — that
 * a model asked to express "battle pirate ship" in eleven node kinds will spend
 * its whole budget satisfying the grammar, and a model handed a real graphics
 * API and left alone will just build a ship. The first live run said yes: Opus 5
 * returned a ship anyone would name on sight (`docs/TRACEABILITY.md`).
 *
 * ── the three categories, and the rule for editing this file ─────────────────
 *
 * Every line below is exactly one of:
 *
 *  1. **What is in scope** — a model cannot call an API it has not been told
 *     exists.
 *  2. **What shape to reply in** — the runtime has to be able to call it. This
 *     is where the animation catalogue (`anim.ts`) rides, and it is the largest
 *     single block in the file. It is category 2 and not guidance: those are
 *     the exact situations the bake DRIVES the body's `pose` through, so a body
 *     not told about one is a body recorded standing still for it. What that
 *     block must never do is say what the parts look like — it describes
 *     motion, conditionally ("a flier beats or sets its wings"), and never
 *     anatomy. `tests/anim.test.ts` holds that line.
 *  3. **What the deliverable is** — the body alone, built so it can be taken
 *     apart. Both halves are load-bearing product requirements rather than
 *     taste. The first came from the first live capture: asked for a creature
 *     with no constraints, Opus 5 returned a *diorama* — a 900-unit ocean and
 *     an 860-unit sky around a 37-unit ship, 85 % of the triangles scenery — and
 *     a room holding twelve creatures that each brought their own ocean is not
 *     a room. The second is what the game already does to bodies: organs are
 *     shot off exactly where the laser hits and evolution grows new ones, so a
 *     body welded into one mesh cannot be severed and cannot grow.
 *
 * What still never goes in: anatomy, silhouette, proportion, colour, palette,
 * style, symmetry, materials, part counts, or what a creature is. Not one word.
 * If a body comes out of here unrecognisable, that is a fact about the model,
 * and it is the fact this lane exists to measure. Adding a hint to fix a bad
 * ship destroys the measurement — hints go in a later pass with a number
 * attached, never here on a hunch.
 *
 * Before adding a line, say which of the three categories it is in. If it is
 * none of them, it is design guidance, and it belongs somewhere a shipping
 * decision can be argued with rather than stapled to every creature every
 * player will ever make.
 *
 * ── where the design guidance went ───────────────────────────────────────────
 *
 * `style.ts`. The game does need one visual language — a room holding twelve
 * creatures that arrived in twelve unrelated art styles is a gallery, not a
 * world — and that requirement only fights this file if the style is written
 * *into* it. It is not. A style is a fixed block appended to the system turn,
 * named on the record, and switchable to `'raw'`, which sends this file's text
 * alone and byte-identical. So the baseline stays runnable, every capture taken
 * before styles existed stays comparable, and "was this body told how to look?"
 * is answerable from the record rather than from the git history of a prompt.
 */

import { animBrief } from './anim.js';
import { styleDirective } from './style.js';

/**
 * The deliverable, category 3: a body that comes apart.
 *
 * Split out as its own constant because the **growth** call needs it word for
 * word (`grow.ts`) — a stage that welds its new part onto the parent mesh has
 * destroyed the property the first stage was asked for, and the only way two
 * instructions cannot drift apart on that is for there to be one of them.
 */
export const FORGE_PARTS = `Build it so it can be taken apart and worked on afterwards:
  - every meaningful part is its own Object3D with a .name — limbs, plates, heads,
    masts, jaws, whatever this thing turns out to have;
  - parts are parented into a hierarchy, so detaching one takes everything that
    hangs off it with it, and a new part can be attached anywhere;
  - each part's origin sits at the joint it would pivot about, so it can be
    animated later without moving anything else.`;

/**
 * Category 1, in full: what exists. Shared with the growth call for the same
 * reason as above — a model cannot call an API it has not been told about, and
 * two copies of this list is two chances for one of them to go stale against
 * three.js.
 */
export const FORGE_SCOPE = `You are writing JavaScript that runs in a browser against three.js r185 (WebGPU build).

Already imported and in scope — do not write import statements:
  THREE  the three.js namespace: every geometry (Box, Sphere, Cylinder, Cone, Torus,
         Lathe, Extrude, Shape, Tube, Capsule, Ring, Plane, Polyhedron,
         BufferGeometry), every material, Mesh, Group, Points, Line, Object3D,
         Vector3, Quaternion, Euler, Matrix4, Color, Curve, CatmullRomCurve3.
  TSL    the three/tsl namespace, for node shaders: Fn, vec2, vec3, vec4, float,
         uv, positionLocal, positionWorld, normalLocal, normalWorld, cameraPosition,
         time, sin, cos, abs, pow, mix, smoothstep, step, fract, floor, dot, cross,
         normalize, length, min, max, clamp, oneMinus, mul, add, sub, div, uniform,
         attribute, varying, If, Loop. Attach them to any NodeMaterial via
         .colorNode / .emissiveNode / .positionNode / .normalNode / .roughnessNode /
         .metalnessNode / .opacityNode.`;

/** Category 2: the shape the runtime can call. Also shared with the growth call. */
export const FORGE_CONVENTION = `Reply with code only. No prose, no markdown fences. Exactly this shape:

function build(THREE, TSL) {
  // whatever you want
  return object;   // any THREE.Object3D
}

Build it facing +Z. +X is its right, +Y is up. Whatever this thing's front is —
a face, a prow, the end that goes first — points down +Z.

IT HAS TO MOVE. Set object.userData.pose — a single function, called with the
creature's SITUATION rather than with a clock, and the only animation this body
will ever have:

  object.userData.pose = (s) => { ... }

    s.speed     how fast it is travelling, in its OWN body-lengths per second.
                0 is standing still. Around 1 is a walk. 6 is flat out.
    s.stride    0..1 and looping, advanced by DISTANCE TRAVELLED, not by time.
                Drive the gait cycle off this and the feet cannot skate.
    s.turn      -1..1, how hard it is turning; negative is left.
    s.grounded  false while it is off the ground.
    s.health    1 whole, 0 dead.
    s.action    null, or one of the action names listed below.
    s.phase     0..1 through that action.
    s.t, s.dt   seconds since start and since the last frame, for idle motion.

It writes .position / .quaternion / .rotation / .scale on the named parts you
built. That is why each part's origin has to sit at the joint it pivots about —
a part whose origin is somewhere else cannot be rotated without swinging the
body. Write the WHOLE pose every call, from the rest pose outward; do not
accumulate onto last frame's values, because the situations below are driven in
an order you do not control.

**Decide the gait yourself.** Nobody will tell you which animation to play — you
are the only one who knows how this body moves, whether it walks on two limbs
and runs on four, whether it has limbs at all, whether it swims or hovers or
drags itself. Read the numbers, choose the motion, change the stance with them.

${animBrief()}

object.userData.update = (t, dt) => { ... } also exists — a clock, not a
situation — and it is the fallback for a thing with no way of moving at all: a
drifting mote, a machine that only spins. If the thing you built has a body, it
wants pose, and a body that has only update is a statue sliding across the
ground at walking speed.`;

/**
 * `FORGE_SYSTEM` is the entire system prompt for a first build. The player's own
 * text goes in the user turn, verbatim, on its own, and `buildMessages` is the
 * only thing that ever assembles the pair — so "did we send anything else?" is a
 * question with a one-function answer.
 *
 * It is assembled from the three constants above rather than written out, and
 * the assembled string is **byte-identical** to the literal it replaced —
 * `tests/forge.test.ts` pins that, because every capture in `captures/forge/`
 * and every number in `docs/FORGE.md` was measured against those exact bytes.
 */
export const FORGE_SYSTEM = `Build exactly what the prompt describes, from scratch. Use primitives and shaders.

Build that one thing and nothing else. No ground, no sky, no water, no horizon, no
base, pedestal, backdrop or scenery of any kind. If it is not part of the thing
itself, do not build it.

Do not reinterpret the subject. If the prompt says a ship, build a ship — not a
ship that is secretly an animal. Whatever the prompt names is what it is.

${FORGE_PARTS}

${FORGE_SCOPE}

${FORGE_CONVENTION}`;

/** Model turns, ready for any OpenAI-compatible or Anthropic-shaped wire. */
export interface ForgeMessages {
  readonly system: string;
  readonly user: string;
}

/**
 * The player's prompt, untouched, plus the instruction above. Nothing is
 * prepended, appended, restated, classified, or expanded — `interpret()` in the
 * other lane does all of that and this lane exists to not.
 *
 * The trim is the one liberty taken, and only because a trailing newline in a
 * textarea is not something a player meant to say.
 *
 * `style` appends the house style (`style.ts`) to the **system** turn and never
 * touches the user turn. It defaults to `'raw'` — the base instruction alone —
 * so this function's unadorned behaviour is exactly what it was before styles
 * existed, and a caller that wants the world's look asks for it out loud. The
 * appended text is a fixed constant chosen by whoever pressed Submit; nothing
 * about it is derived from the prompt, so the system turn stays invariant across
 * prompts, which is the property the lane's contract rests on.
 */
export function buildMessages(playerPrompt: string, style?: string): ForgeMessages {
  const directive = styleDirective(style ?? 'raw');
  return { system: FORGE_SYSTEM + directive, user: playerPrompt.trim() };
}
