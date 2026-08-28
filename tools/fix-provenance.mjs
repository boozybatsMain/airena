#!/usr/bin/env node
/**
 * One-off: repair `resolvedModel` in every stored generation record.
 *
 *   node tools/fix-provenance.mjs --dry     # list what would change
 *   node tools/fix-provenance.mjs
 *
 * ── why this file exists and is committed ───────────────────────────────────
 *
 * `src/brain/claude.js` read the resolved model as `Object.keys(modelUsage)[0]`.
 * `modelUsage` is keyed by every model the CLI billed during the call, and the
 * CLI bills its own background traffic against a small model, so the first key
 * was the housekeeping model and not the one that wrote the brain. Every record
 * ever written by `brainforge` — 83 attempts across `brains/**` and
 * `reports/**` — therefore claimed `claude-haiku-4-5-20251001` for work
 * requested from, paid for at the rate of, and (on the cost evidence) performed
 * by Opus.
 *
 * The bug is fixed forward. This is the backward half, and it is a repair of an
 * audit trail, which is the one kind of edit that must never be silent. Hence a
 * committed script rather than a shell one-liner: the change is reproducible,
 * the rule it applies is legible, and re-running it is a no-op.
 *
 * ── the rule ────────────────────────────────────────────────────────────────
 *
 * Where the record persisted `modelUsage`, the correct value is derived from it
 * with the same `resolveModel` the live path now uses. Nothing written before
 * the fix persisted `modelUsage`, so in practice every historical attempt falls
 * to the second branch: the wrong string is replaced by an explicit unknown and
 * the original is preserved beside it.
 *
 * It is NOT replaced by "claude-opus-…". The requested alias is `opus` and the
 * cost per attempt (~$0.41 for ~3 minutes at high effort) is Opus-shaped, but
 * an alias is not a snapshot id, and writing a plausible id into a provenance
 * field is the same class of error as the bug being fixed — a claim the record
 * cannot support. Recovering the true ids means regenerating the population.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveModel } from '../src/brain/claude.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

const UNKNOWN = 'unknown (not recorded)';
const NOTE = 'Was read off the first key of `modelUsage`, which is the CLI\'s own '
  + 'background traffic and not the model that answered. The envelope was not kept, so the '
  + 'true snapshot id is unrecoverable from this record; the requested alias is in `model`. '
  + 'See tools/fix-provenance.mjs.';

function* jsonFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* jsonFiles(p);
    else if (e.isFile() && e.name.endsWith('.json')) yield p;
  }
}

let files = 0, attempts = 0, derived = 0, marked = 0, already = 0;
for (const root of ['brains', 'reports']) {
  const base = join(ROOT, root);
  try { statSync(base); } catch { continue; }
  for (const file of jsonFiles(base)) {
    let rec;
    try { rec = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    // Only brainforge records: everything else under reports/ is measurement output.
    if (!rec || !Array.isArray(rec.attempts)) continue;
    let touched = false;
    for (const a of rec.attempts) {
      if (!a || !('resolvedModel' in a)) continue;
      attempts++;
      if (a.resolvedModelWas !== undefined) { already++; continue; }
      const picked = resolveModel(a.modelUsage, rec.model);
      if (picked.model) {
        if (picked.model === a.resolvedModel) continue;
        a.resolvedModelWas = a.resolvedModel;
        a.resolvedModel = picked.model;
        a.resolvedModelBy = picked.by;
        derived++;
      } else {
        a.resolvedModelWas = a.resolvedModel;
        a.resolvedModel = UNKNOWN;
        a.resolvedModelBy = 'none';
        a.resolvedModelNote = NOTE;
        marked++;
      }
      touched = true;
    }
    if (!touched) continue;
    files++;
    if (!DRY) writeFileSync(file, `${JSON.stringify(rec, null, 2)}\n`);
    console.log(`  ${DRY ? 'would fix' : 'fixed'} ${relative(ROOT, file)}`);
  }
}

console.log(`\n${DRY ? 'dry run — ' : ''}${attempts} attempt records seen across ${files} file(s) changed`);
console.log(`  ${derived} corrected from a persisted modelUsage map`);
console.log(`  ${marked} replaced with "${UNKNOWN}" because no envelope was stored`);
console.log(`  ${already} already repaired, left alone\n`);
