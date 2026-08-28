/**
 * Growth — the same creature, one stage later.
 *
 * ── what this lane is for ────────────────────────────────────────────────────
 *
 * `CONCEPT.md` and `docs/PLAN.md` describe evolution as the thing that makes a
 * creature *yours*: it lives, the world presses on it, and at a threshold the
 * whole record is re-read and the body answers. `apps/server/src/evolution` owns
 * the machinery of that — trigger, budget, harness, swap — and
 * `packages/fabricator/src/evolve` owns the genome rewrite. Neither of them can
 * answer the question this file exists for, which is a rendering question and a
 * product one:
 *
 *   **when a body grows a part, does it still look like the same creature?**
 *
 * A stage that comes back as a different animal is not evolution, it is a
 * re-roll with extra steps, and a player who watched their creature for three
 * days will read it as a bug. A stage that comes back visually identical is
 * worse — it is money spent on nothing. The whole value is in the narrow band
 * between those, and the only way to know a model can hold that band is to run
 * it and look at the two bodies side by side, which is what `evolve.html` does.
 *
 * ── the shape of the call ────────────────────────────────────────────────────
 *
 * One call, the same wire as a first build (`call.ts` — same stream, same repair
 * ladder, same usage accounting). What changes is the turns:
 *
 *   system   growth rules + the same parts rule + the same house style + the
 *            same API disclosure and calling convention as a first build. The
 *            constants are *imported*, not restated, so a stage is never told
 *            something the first build was not.
 *   user     the creature's own prompt, which stage this is, the field journal,
 *            and the current build function in full.
 *
 * The journal is the only thing that varies with the creature's life, and it is
 * data in the user turn, exactly where the player's sentence goes on a first
 * build. Nothing about the journal is read on its way to the wire — no
 * classifier, no summariser, no "the model seems to need reach" hint. If the
 * stage does not follow from the journal, that is the measurement, and it is the
 * measurement this page exists to take.
 */

import { extractBuildText } from './clean.js';
import { FORGE_CONVENTION, FORGE_PARTS, FORGE_SCOPE, type ForgeMessages } from './prompt.js';
import { styleDirective } from './style.js';

/**
 * The growth instruction.
 *
 * Every paragraph is here to stop one specific failure that a model asked to
 * "evolve this" will otherwise produce, and they are worth naming because each
 * one is a product bug rather than a taste preference:
 *
 *  - **the re-roll** — it rebuilds the creature from the prompt and the result
 *    is a different animal. Answered by "everything else must survive" and by
 *    handing over the source rather than the description.
 *  - **the redesign** — it improves six things at once, so nothing is
 *    attributable and the next stage has nothing left to answer. Answered by
 *    "one change".
 *  - **the invisible stage** — it adjusts a radius and calls it evolution.
 *    Answered by "visible from across the room, in the silhouette".
 *  - **the decoration** — it adds a spike because spikes look evolved. Answered
 *    by making the journal the only permitted cause, and by asking for the
 *    causal sentence in the first line, which is very hard to write for a change
 *    that has no cause.
 */
export const GROW_SYSTEM = `You are growing an existing creature by exactly one stage.

You are given the creature's own description, the build function that is its body
today, and a field journal: what the world did to it since the last stage. The
journal is the ONLY reason anything about this body may change.

Read the journal for pressure. What kept hurting it, what it kept failing to
reach, what it kept doing and paying for, what the ground and the air did to it.
Pick the ONE pressure that dominates and answer that one.

ONE CHANGE. Exactly one of:
  - grow a new named part, attached to an existing part;
  - replace one named part with a heavier, longer, lighter or differently-jointed
    version of itself;
  - add a working mechanism to an existing part that changes what it can do.
Not three. A stage that touches everything is a redesign, and a redesign is not
an evolution.

IT MUST BE VISIBLE. The change has to read from across the room, in the
silhouette, without a caption. A radius nudged by ten per cent is not a stage.

EVERYTHING ELSE SURVIVES, EXACTLY. Every part that already exists keeps its name,
its parent, its position, its proportions and its materials. Somebody putting the
two bodies side by side must see the same creature with one thing different — not
a cousin of it, not a cleaned-up version of it. Do not rename, do not reorganise,
do not "improve" anything you were not asked to change.

NEW HARDWARE IS NEWER HARDWARE. It is the same machine extended: same base metal,
same accent colour, same wear language — but the new part is visibly less worn
than what it grew out of, and the joint where it meets the old body shows recent
work. It was fitted, not born.

IF IT MOVES, IT KEEPS MOVING. If the body carries userData.update, keep it and
extend it so the new part is driven too. A new limb that hangs dead while the
rest of the creature works is a bug, not a stage.

Reply with the WHOLE build function again — complete, runnable, self-contained.
Not a diff, not a patch, not "…rest unchanged".

Begin the reply with exactly one line, before any code:
// GROWTH: <the new or changed part's .name> — <one sentence: what it does, and
which line of the journal made it necessary>`;

/**
 * The **delta** instruction: build one part, say where it bolts on, touch
 * nothing else.
 *
 * ── why this exists beside `GROW_SYSTEM` ─────────────────────────────────────
 *
 * The whole-body rewrite works — measured across a three-stage lineage, 210 and
 * then 231 parts kept, zero lost — but it pays for one new part by regenerating
 * the entire creature, and it does not survive contact with how the game
 * actually ships bodies:
 *
 *  - **Cost grows with age.** Stage 2 of the salamander resent 11 kB to add a
 *    launcher; stage 10 would resend a body several times that, every time.
 *  - **Spectators are sent data, not code.** `bakeCreature` serialises the
 *    geometry and the gateway serves that; the model source never leaves the
 *    birthing browser. A rewritten body means re-baking and re-shipping
 *    megabytes to everyone watching. A delta is a small parcel.
 *  - **The game already works part-wise in the other direction.** Organs are
 *    shot off by name. Growing by name makes the two operations symmetrical.
 *  - **Nothing can be lost.** Under a rewrite, "keep everything" is a request
 *    checked afterwards by a diff. Here the old body is not in the reply at
 *    all, so there is nothing to lose.
 *
 * What it gives up is the thing the rewrite was good at: a model that sees the
 * whole body can place a part by eye. So the delta call still *receives* the
 * whole body as context — it just does not return it.
 */
export const GROW_DELTA_SYSTEM = `You are growing ONE NEW PART onto a creature that already exists.

You are given the creature's description, the build function that is its body
today, and a field journal: what the world did to it since the last stage. The
journal is the ONLY reason anything grows.

Read the journal for pressure — what kept hurting it, what it kept failing to
reach, what the ground and the air did to it — pick the ONE pressure that
dominates, and answer that one with a single part.

YOU ARE NOT REBUILDING THE BODY. Do not re-emit it, do not improve it, do not
touch it. The body is context so that your part fits: read it for the name of
the part you will attach to, for its size and orientation, for the materials and
colours already in use, and for the scale everything is built at.

WHAT TO RETURN — a function called grow, and nothing else:

grow(THREE, TSL, host) {
  // \`host\` is the creature, already built. Look things up on it:
  //   const anchor = host.getObjectByName('spineSeg0');
  // Measure it if you need to — a THREE.Box3().setFromObject(anchor) tells you
  // how big the thing you are bolting to actually is.
  const part = new THREE.Group();
  part.name = 'dorsalLauncher';        // required, and unique on this body
  // ...build it...
  return { attachTo: 'spineSeg0', object: part };
}

RULES FOR THE PART:

  - \`attachTo\` MUST name a part that exists on the body you were shown. Read the
    names out of the source; do not invent one.
  - The returned object's transform is LOCAL TO THAT ANCHOR. The anchor's own
    position and rotation already apply — place your part relative to it, at the
    joint or face where it would really be bolted.
  - Give it a .name nothing on the body already uses, and name every meaningful
    piece inside it too. The game severs organs by name.
  - Build it at the same scale, in the same style, out of the same materials and
    colours as the body around it — but visibly LESS WORN than what it grew out
    of, and with recent work at the seam where it meets the old body.
  - It has to be visible from outside. A part buried under existing armour is a
    part nobody will ever know grew.

IF IT MOVES: set object.userData.update = (t, dt) => { ... } on the part you
return. It is called every frame alongside the body's own.

Reply with code only — no prose, no markdown fences — beginning with exactly one
line before the code:
// GROWTH: <the part's .name> — <one sentence: what it does, and which line of
the journal made it necessary>`;

/** Everything the growth call is told about one creature at one moment. */
export interface GrowthContext {
  /** The creature's original prompt — what it is, in the player's own words. */
  readonly subject: string;
  /** The build function as it stands. The model's previous reply, verbatim. */
  readonly source: string;
  /** The field journal. See `journal.ts` for the shape and why it is numbers. */
  readonly journal: string;
  /** Which stage is being grown. 2 is the first growth of a stage-1 body. */
  readonly stage: number;
  /** House style id. The same one the body was first built under — see below. */
  readonly style?: string;
  /** Every earlier stage's `// GROWTH:` line, oldest first. May be empty. */
  readonly history?: readonly string[];
  /**
   * `'whole'` rewrites the body; `'delta'` returns one part and where it bolts
   * on. Defaults to `'whole'` so nothing that exists changes meaning.
   */
  readonly mode?: GrowthMode;
  /**
   * The parcels already grown onto `source`, oldest first.
   *
   * Under the delta scheme `source` is the **stage-1 body**, and a stage-3 call
   * has to see stage 2 as well — otherwise it is shown a creature that does not
   * exist any more, and it may attach to a name that has since been covered, or
   * grow a second version of something already there. Sending the parcels
   * separately rather than pasting them into the body keeps each one legible as
   * what it is: a part, and where it went.
   */
  readonly priorDeltas?: readonly { readonly stage: number; readonly source: string }[];
}

/**
 * The growth system turn.
 *
 * Assembled in the order a reader would want it: what you are doing, how the
 * body must come apart, what the world looks like, what you may call, and how to
 * answer. The style block sits where it sits on a first build, so a stage is
 * told about the house style in the same words the body it is extending was.
 *
 * The style is a caller's choice and should be the style the creature was *born*
 * under — `evolve.html` reads it off the parent's record rather than off a
 * picker, because a body built raw and grown in the house style would produce a
 * new part that does not match the thing it is bolted to, and that mismatch
 * would look like a model failure rather than the operator error it is.
 */
export type GrowthMode = 'whole' | 'delta';

export function growthSystem(style?: string, mode: GrowthMode = 'whole'): string {
  if (mode === 'delta') {
    // The parts rule and the API disclosure still apply — a delta is built with
    // the same tools and must come apart the same way. The style goes last,
    // exactly where a first build puts it.
    return `${GROW_DELTA_SYSTEM}

${FORGE_PARTS}

${FORGE_SCOPE}${styleDirective(style ?? 'raw')}`;
  }
  // The style goes last, which is exactly where `buildMessages` puts it on a
  // first build (`FORGE_SYSTEM + directive`). Same block, same position, so a
  // stage cannot be told the house style in a different voice — or, more to the
  // point, in a different order — from the body it is extending.
  return `${GROW_SYSTEM}

${FORGE_PARTS}

${FORGE_SCOPE}

${FORGE_CONVENTION}${styleDirective(style ?? 'raw')}`;
}

/**
 * The user turn: the creature, its life, and its body. Data only.
 *
 * The source goes last and unfenced. Last because it is by far the longest thing
 * here and a model reads the instruction it was given most recently; unfenced
 * because the reply is asked to be unfenced, and a fenced input reliably
 * produces a fenced output that `clean.ts` then has to strip and record as a
 * repair — a note that would read as the model being sloppy when it was being
 * consistent.
 */
export function growthUser(ctx: GrowthContext): string {
  const history = (ctx.history ?? []).filter((line) => line.trim() !== '');
  const past =
    history.length === 0
      ? ''
      : `\nWhat earlier stages already grew, oldest first — do not repeat any of these:\n${history
          .map((line) => `  ${line.trim()}`)
          .join('\n')}\n`;

  return `THE CREATURE
${ctx.subject.trim()}

This is stage ${ctx.stage}. It has survived ${ctx.stage - 1} stage${ctx.stage === 2 ? '' : 's'} already.
${past}
THE FIELD JOURNAL
${ctx.journal.trim()}

ITS BODY AS IT STANDS
${bodyForGrowth(ctx.source)}${grownSoFar(ctx)}`;
}

/**
 * The parcels already on the body, rendered for the user turn.
 *
 * Kept as separate labelled blocks rather than pasted into the body, because
 * that is what they are on disk and what the next one will be: the model is
 * looking at a base plus a chain, and flattening it would hide both the order
 * and the fact that each parcel names its own anchor.
 */
function grownSoFar(ctx: GrowthContext): string {
  const prior = ctx.priorDeltas ?? [];
  if (prior.length === 0) return '';
  return `\n\nPARTS ALREADY GROWN ONTO IT, IN ORDER — these are on the body now, and their
names are taken. Do not grow another one of any of them, and do not attach
somewhere one of them has since covered.
${prior
    .map((d) => `\n--- stage ${d.stage} ---\n${bodyForGrowth(d.source)}`)
    .join('\n')}`;
}

export function buildGrowthMessages(ctx: GrowthContext): ForgeMessages {
  return { system: growthSystem(ctx.style, ctx.mode ?? 'whole'), user: growthUser(ctx) };
}

/**
 * The `// GROWTH:` line, pulled out of the raw reply.
 *
 * Read from the **raw** reply rather than from the extracted source, because
 * `clean.ts` keeps only the largest fenced block and a model that writes the
 * line above its fence would lose it. Returns null when the model did not write
 * one — that is a fact worth showing rather than papering over, since a stage
 * that cannot state its own cause in a sentence usually did not have one.
 *
 * It takes the **first** match, which is only safe because `bodyForGrowth`
 * strips these lines out of the parent before it is sent. Without that, stage 3
 * is handed a body whose first line is stage 2's note, echoes it, and the record
 * ends up attributing stage 2's cause to stage 3.
 */
export function readGrowthNote(reply: string): string | null {
  const m = /^[ \t]*\/\/[ \t]*GROWTH:[ \t]*(.+)$/im.exec(reply);
  if (m === null) return null;
  const note = m[1].trim();
  return note === '' ? null : note;
}

/**
 * A parent creature's stored reply, made fit to show to a model.
 *
 * Two things are removed and both are removals of *our own* protocol rather
 * than edits to the creature:
 *
 *  - the markdown fence and any stray `import`/`export`, via `extractBuildText`
 *    — `forge/<slug>.js` is the reply verbatim by design, so a body can arrive
 *    fenced, and a fenced input reliably produces a fenced output;
 *  - every `// GROWTH:` line, because on a stage-2-or-later parent the first
 *    line of the file is the *previous* stage's note. It is already supplied
 *    properly as `history`, and leaving it in the body invites the model to
 *    carry it forward as its own.
 *
 * A reply this cannot parse at all (`ForgeFormatError`) is passed through
 * untouched: the growth call is going to fail either way, and the failure should
 * name the parent rather than this function.
 */
export function bodyForGrowth(reply: string): string {
  let text: string;
  try {
    text = extractBuildText(reply).text;
  } catch {
    text = reply;
  }
  return text
    .split('\n')
    .filter((line) => !/^[ \t]*\/\/[ \t]*GROWTH:/i.test(line))
    .join('\n')
    .trim();
}

/**
 * `venomancer` + stage 3 -> `venomancer-s3`.
 *
 * A suffix rather than a directory, so a lineage sorts together in the same flat
 * `forge/` listing every other tool already reads, and so `forgeshot.mjs` and
 * `/forge.html?creature=` reach a stage with no changes at all. Stage 1 keeps
 * the bare slug: the first body is the creature, not a stage of it, and renaming
 * it would orphan every capture already on disk.
 */
export function stageSlug(baseSlug: string, stage: number): string {
  return stage <= 1 ? baseSlug : `${baseSlug}-s${stage}`;
}

/**
 * The inverse. `venomancer-s3` -> `{ base: 'venomancer', stage: 3 }`.
 *
 * Deliberately strict about the suffix — `-s3` and not `-s03` or `-stage3` —
 * because a loose reader would claim `ship-s5-high` as stage 5 of `ship` and
 * silently graft two unrelated creatures into one lineage.
 */
export function parseStageSlug(slug: string): { base: string; stage: number } {
  const m = /^(.*)-s([2-9]|[1-9][0-9]+)$/.exec(slug);
  return m === null ? { base: slug, stage: 1 } : { base: m[1], stage: Number(m[2]) };
}
