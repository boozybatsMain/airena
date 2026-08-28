/**
 * @autoage/forge — the prompt goes to the model and the model builds the thing.
 *
 * One lane, four files, and the whole point is what is *absent* from them.
 *
 *   prompt.ts   the entire instruction — capability disclosure, calling
 *               convention, and what the deliverable is; nothing else
 *   anim.ts     the animation catalogue: every situation a body's `pose` will
 *               be driven through. One list, recited into the prompt and read
 *               by the bake, so the two cannot drift
 *   style.ts    the house style, as an *optional* block appended to that.
 *               Separate so the unstyled baseline stays runnable and every
 *               record can say which one it was built under
 *   grow.ts     the same creature, one stage later: the growth instruction and
 *               the lineage naming
 *   journal.ts  fake field journals — the pressure a growth call answers, in
 *               the shape the game's own biography rollup prints
 *   call.ts     one request, one reply, no retry ladder and no fallback
 *   clean.ts    finds the function in the reply and records every liberty taken
 *   review.ts   a cheap gate in front of the expensive call: classifies the
 *               player's prompt, and never rewrites it
 *   record.ts   what a generated creature is on disk
 *   audit.ts    the checklist enforced instead of requested: measures the body
 *               that came back and hands its style violations to the repair turn
 *   vet.ts      the door check every route serving a bake must run
 *   bake.ts     runs the build once and keeps only the result, so a viewer is
 *               never handed a stranger's code to execute
 *
 * This package deliberately does not depend on `@autoage/sim-core` or
 * `@autoage/fabricator`, and must not start to. The moment it can import a node
 * kind or a mass role, somebody will use one, and the experiment — *what does a
 * model build when nobody tells it how a body works?* — stops being measurable.
 *
 * See `docs/FORGE.md` for the standing comparison against the design-system
 * lane, and `prompt.ts`'s header for the rule about editing the instruction.
 */

export * from './prompt.js';
export * from './anim.js';
export * from './audit.js';
export * from './style.js';
export * from './grow.js';
export * from './journal.js';
export * from './bake.js';
export * from './clean.js';
export * from './call.js';
export * from './review.js';
export * from './record.js';
export * from './vet.js';
