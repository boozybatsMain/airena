#!/usr/bin/env node
/**
 * Ask Claude for a mind, check it, keep it.
 *
 *   node tools/brainforge.mjs --fighter=octopus --model=opus --effort=high
 *   node tools/brainforge.mjs --all --tag=v1
 *
 * Writes `brains/<tag>/<fighter>.js` and a sibling `.json` recording exactly
 * how it was made — model, effort, prompt hash, attempts, what failed, cost,
 * wall clock. The `.json` is the thing that makes a later comparison between
 * two brains mean something; without it "the octopus got smarter" is a story.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIGHTERS, SKILLS, ARENA_HALF, MATCH_SECONDS, SUDDEN_DEATH_AT, SUDDEN_DEATH_RAMP, TICK_HZ, THINK_HZ } from '../src/core/config.js';
import { askClaude, modelFamily } from '../src/brain/claude.js';
import { extractSource } from '../src/brain/host.js';
import { brainPrompt, repairPrompt, SYSTEM_PROMPT } from '../src/brain/prompt.js';
import { validate } from '../src/brain/validate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, dflt) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  return process.argv.includes(`--${name}`) ? true : dflt;
}

const MODEL = String(arg('model', 'opus'));
const EFFORT = String(arg('effort', 'high'));
const TAG = String(arg('tag', 'v1'));
const REPAIRS = Number(arg('repairs', 2));

async function forge(id) {
  const prompt = brainPrompt(id);
  const hash = createHash('sha256').update(prompt).digest('hex').slice(0, 12);
  const record = {
    fighter: id, model: MODEL, effort: EFFORT, tag: TAG,
    promptHash: hash, promptChars: prompt.length,
    generatedAt: new Date().toISOString(),
    /*
     * The world this mind was told about, frozen beside it.
     *
     * The constants move between tuning passes and the brains do not, so
     * "which numbers was this program written against" is a question anyone
     * reading a population later will need answered — and `promptHash` alone
     * answers it only if you still have the prompt that produced it. Storing
     * the table makes a stale brain visible instead of merely suspected.
     */
    constants: {
      arenaHalf: ARENA_HALF, matchSeconds: MATCH_SECONDS,
      suddenDeathAt: SUDDEN_DEATH_AT, suddenDeathRamp: SUDDEN_DEATH_RAMP,
      tickHz: TICK_HZ, thinkHz: THINK_HZ,
      fighters: JSON.parse(JSON.stringify(FIGHTERS)),
      skills: JSON.parse(JSON.stringify(SKILLS)),
    },
    attempts: [], costUsd: 0, wallMs: 0,
  };

  let source = null;
  let lastSource = '';
  let failure = null;

  for (let attempt = 0; attempt <= REPAIRS; attempt++) {
    const ask = attempt === 0 ? prompt : repairPrompt(id, lastSource, failure);
    process.stdout.write(`  ${id} attempt ${attempt + 1}/${REPAIRS + 1} (${MODEL}/${EFFORT})…\n`);
    let reply;
    try {
      reply = await askClaude({ prompt: ask, system: SYSTEM_PROMPT, model: MODEL, effort: EFFORT, log: (l) => process.stdout.write(`${l}\n`) });
    } catch (err) {
      record.attempts.push({ attempt, transport: String(err.message) });
      failure = `The generator itself failed: ${err.message}`;
      continue;
    }
    record.costUsd += reply.costUsd;
    record.wallMs += reply.durationMs;
    lastSource = extractSource(reply.text);
    const v = validate(lastSource, id);
    record.attempts.push({
      attempt,
      chars: lastSource.length,
      ok: v.ok,
      stage: v.stage,
      problems: v.problems,
      metrics: v.metrics || null,
      costUsd: reply.costUsd,
      durationMs: reply.durationMs,
      resolvedModel: reply.model,
      resolvedModelBy: reply.modelResolvedBy,
      /*
       * The raw evidence for `resolvedModel`, not a re-derivation of it.
       *
       * `resolvedModel` used to be read off the first key of this map, which is
       * the CLI's own background traffic, so every record in the repository
       * named a model that had not written a line of the brain beside it — and
       * nothing stored made that recoverable. Keeping the map and the token
       * counts means the next person to doubt the claim can check it instead of
       * regenerating the population.
       */
      modelUsage: reply.modelUsage,
      usage: reply.usage,
    });
    /*
     * A provenance guard, not a retry.
     *
     * If the model that answered is not the family that was asked for, every
     * number this run produces is attached to the wrong name, and continuing
     * would write that name into `brains/<tag>/`. Loud and terminal: the record
     * is flushed first so the evidence for the mismatch survives the throw.
     */
    const asked = modelFamily(MODEL), got = modelFamily(reply.model);
    if (asked && got !== asked) {
      record.provenanceError = `asked for "${MODEL}" (${asked}); modelUsage resolved to "${reply.model}"`;
      flush(id, null, record);
      throw new Error(`brainforge: ${record.provenanceError}. Refusing to file this as a ${MODEL} brain.`);
    }
    if (v.ok) {
      source = lastSource;
      record.accepted = { attempt, metrics: v.metrics };
      console.log(`  ${id}: accepted on attempt ${attempt + 1} (${lastSource.length} chars)`);
      break;
    }
    console.log(`  ${id}: rejected at "${v.stage}" — ${v.problems[0]}`);
    failure = v.report;
  }

  if (!source) {
    record.accepted = null;
    console.log(`  ${id}: NOT ACCEPTED after ${REPAIRS + 1} attempts`);
  }

  flush(id, source, record);
  return record;
}

/** The brain and the story of how it was made, side by side on disk. */
function flush(id, source, record) {
  const dir = resolve(ROOT, 'brains', TAG);
  mkdirSync(dir, { recursive: true });
  if (source) writeFileSync(resolve(dir, `${id}.js`), `${source}\n`);
  writeFileSync(resolve(dir, `${id}.json`), `${JSON.stringify(record, null, 2)}\n`);
}

const wanted = arg('all', false)
  ? ['octopus', 'gorilla']
  : [String(arg('fighter', 'octopus'))];

console.log(`brainforge: ${wanted.join(', ')} — ${MODEL}/${EFFORT}, tag "${TAG}"`);
const t0 = Date.now();
const out = [];
for (const id of wanted) out.push(await forge(id));
const cost = out.reduce((a, r) => a + r.costUsd, 0);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s, $${cost.toFixed(3)}`);
console.log(out.map((r) => `  ${r.fighter}: ${r.accepted ? 'ok' : 'FAILED'}`).join('\n'));
