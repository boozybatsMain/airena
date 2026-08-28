/**
 * What a forged creature is once it exists.
 *
 * A creature from this lane is two files under `forge/`:
 *
 *   forge/<slug>.js     the model's reply, verbatim, exactly as it arrived
 *   forge/<slug>.json   this record — prompt, model, notes, usage, timing
 *
 * The `.js` is untouched on purpose, fence and stray import and all. It is the
 * evidence. `extractBuildSource` runs at *load* time, in the studio and in the
 * screenshot harness alike, so what renders is always derived from what the
 * model actually sent — there is no step where a human-edited file could quietly
 * become the thing being judged.
 *
 * The slug is derived from the prompt, not from a clock, so re-forging the same
 * prompt with the same model overwrites its own record rather than growing a
 * directory of near-duplicates nobody can tell apart.
 */

import type { ForgeUsage } from './call.js';

export interface ForgeRecord {
  /** Schema marker, so an old record can be read or rejected on purpose. */
  readonly version: 1;
  /** Filename stem shared by the `.js` and this `.json`. */
  readonly slug: string;
  /** The player's text, verbatim. */
  readonly prompt: string;
  /** The model id as sent on the wire. */
  readonly model: string;
  /** ISO timestamp of the generation, for the record only. */
  readonly at: string;
  /** Which entry point the reply declared. */
  readonly entry: string;
  /** Every repair `extractBuildSource` had to make. Empty = the model complied exactly. */
  readonly notes: readonly string[];
  /** Tokens and the dollar charge, straight from the route. See `ForgeUsage`. */
  readonly usage: ForgeUsage | null;
  readonly elapsedMs: number;
  /** Bytes of the raw reply, the cheapest proxy for "how much creature is there". */
  readonly replyBytes: number;
  /**
   * House style id (`style.ts`), or absent on a record written before styles
   * existed — which is read as `'raw'`, because that is what those bodies were
   * actually told. Without this a capture cannot be compared to anything: two
   * bodies from the same prompt and the same model can differ entirely on this
   * one field, and no other field on the record would show it.
   */
  readonly style?: string;
  /**
   * Present only on a stage grown from another body (`grow.ts`). Absent means
   * this is a first build — a creature, not a stage of one.
   */
  readonly growth?: GrowthRecord;
}

/** Where one stage came from, and what it claims to have added. */
export interface GrowthRecord {
  /** Which stage this is. The bare slug is stage 1; `-s2` is stage 2. */
  readonly stage: number;
  /** The slug this stage was grown from — the previous stage, not the root. */
  readonly parent: string;
  /** The root of the lineage, so every stage of a creature can be found at once. */
  readonly root: string;
  /** Which field journal was sent, by id, or `'custom'` when it was hand-typed. */
  readonly journalId: string;
  /** The journal itself, verbatim. Kept so a stage can be re-read against its cause. */
  readonly journal: string;
  /** The model's own `// GROWTH:` line, or null when it did not write one. */
  readonly note: string | null;
}

/**
 * `battle pirate ship` -> `battle-pirate-ship`.
 *
 * Lowercase ASCII, hyphens, capped at 60 so a paragraph-long prompt still
 * produces a filename a person can type. A prompt that reduces to nothing —
 * emoji, CJK, punctuation — falls back to `creature`, which collides on purpose:
 * two unnameable prompts landing on one slug is better than a filename nobody
 * can reference in a bug report.
 */
export function slugify(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug === '' ? 'creature' : slug;
}
