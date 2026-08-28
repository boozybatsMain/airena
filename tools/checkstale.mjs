#!/usr/bin/env node
/**
 * Which brains were written against a world that no longer exists?
 *
 *   node tools/checkstale.mjs
 *
 * A generated brain reads its numbers out of the prompt and hard-codes some of
 * them — a cooldown it counts down itself, a range it compares against. Move a
 * constant afterwards and the program is not wrong, it is MISINFORMED, and the
 * difference shows up as a win rate rather than as an error. This prints the
 * diff per population so that "the octopus got worse" can be separated from
 * "the octopus was told something else".
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIGHTERS, SKILLS } from '../src/core/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const now = { fighters: FIGHTERS, skills: SKILLS };

const dirs = [
  join(ROOT, 'brains'),
  ...readdirSync(join(ROOT, 'reports')).filter((d) => d.startsWith('brains-')).map((d) => join(ROOT, 'reports', d)),
  ...(existsSync(join(ROOT, 'reports/archive'))
    ? readdirSync(join(ROOT, 'reports/archive')).filter((d) => d.startsWith('brains-')).map((d) => join(ROOT, 'reports/archive', d))
    : []),
];

let anyStale = false;
for (const base of dirs) {
  if (!existsSync(base)) continue;
  for (const tag of readdirSync(base).sort()) {
    const dir = join(base, tag);
    if (!statSync(dir).isDirectory()) continue;
    const diffs = new Set();
    let seen = 0, noRecord = 0;
    for (const id of ['octopus', 'gorilla']) {
      const p = join(dir, `${id}.json`);
      if (!existsSync(p)) continue;
      seen++;
      const rec = JSON.parse(readFileSync(p, 'utf8'));
      if (!rec.constants) { noRecord++; continue; }
      for (const section of ['fighters', 'skills']) {
        for (const [k, table] of Object.entries(rec.constants[section] || {})) {
          for (const [f, v] of Object.entries(table)) {
            const cur = now[section]?.[k]?.[f];
            if (typeof v === 'number' && cur !== v) diffs.add(`${section}.${k}.${f}: was ${v}, now ${cur}`);
          }
        }
      }
    }
    if (seen === 0) continue;
    const where = base.includes('reports')
      ? `${base.slice(base.indexOf('reports'))}/${tag}`
      : `brains/${tag}`;
    if (noRecord === seen) console.log(`  ${where.padEnd(34)} no constants recorded (generated before provenance was added)`);
    else if (diffs.size === 0) console.log(`  ${where.padEnd(34)} current`);
    else {
      anyStale = true;
      console.log(`  ${where.padEnd(34)} STALE — ${diffs.size} constant(s) moved since it was written:`);
      for (const d of [...diffs].sort()) console.log(`      ${d}`);
    }
  }
}
if (!anyStale) console.log('\nevery population with recorded provenance matches the current constants.');
