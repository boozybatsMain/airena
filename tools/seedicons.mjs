#!/usr/bin/env node
/**
 * Backfill ability icons (docs/REDESIGN.md §8.4).
 *
 * Icons are drawn lazily in the product — the first player who opens a creature
 * pays for the glyphs it is missing. That is right for one new creature and
 * wrong for a stand with sixty of them: the first screenshot, the first review
 * and the first demo would all show procedural fallbacks, and nobody would ever
 * see what the design actually looks like.
 *
 * So the same function the server calls is called here in a loop. Not a second
 * implementation: `ensureIcons` owns the prompt, the retry, the concurrency and
 * the storage, and this file owns only the list and the printing.
 *
 *   node tools/seedicons.mjs --all              # every active creature
 *   node tools/seedicons.mjs --id=c_18e20e72-6bb
 *   node tools/seedicons.mjs --all --force      # redraw what already exists
 *   AIRENA_DB=path/to.db node tools/seedicons.mjs --all
 *
 * Needs FAL_KEY in the environment (`--env-file-if-exists=.env` or a shell
 * export). Without it the run stops before touching the database and says so.
 */

import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb } from '../src/server/db.js';
import { ensureIcons } from '../src/server/forge/icons.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (name, dflt = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

const DB_FILE = arg('db', process.env.AIRENA_DB || join(ROOT, 'data/airena.db'));
const ONE = arg('id');
const ALL = has('--all');
const FORCE = has('--force');

if (!ONE && !ALL) {
  console.error('usage: node tools/seedicons.mjs [--all | --id=<creature id>] [--force]');
  process.exit(2);
}
if (!process.env.FAL_KEY) {
  console.error('FAL_KEY is not set — nothing to draw with.');
  console.error('run with:  node --env-file-if-exists=.env tools/seedicons.mjs --all');
  process.exit(2);
}

const db = openDb(DB_FILE);

/*
 * Only creatures that fight with their OWN abilities.
 *
 * A creature with `kit_active = 0` fights with the reference set: drawing
 * glyphs for the abilities in its row would produce three pictures of three
 * things it never does. The card would then be wrong in the most visible place
 * on the page, which is exactly the failure the icons exist to fix.
 */
const rows = ONE
  ? db.prepare('SELECT id, name, kit_json FROM creature WHERE id = ?').all(ONE)
  : db.prepare(`SELECT id, name, kit_json FROM creature
                WHERE state = 'active' AND kit_active = 1
                ORDER BY is_library ASC, created_at DESC`).all();

if (!rows.length) {
  console.log('nothing to do — no creature matched.');
  process.exit(0);
}

console.log(`icons: ${rows.length} creature(s) in ${DB_FILE}${FORCE ? ' (redrawing everything)' : ''}`);

let made = 0; let failed = 0; let skipped = 0; let done = 0;
const started = Date.now();

/*
 * Two lanes here as well, and they are the SAME two lanes: `ensureIcons` holds
 * a process-wide gate of two, so running four creatures at once here would not
 * make four calls — it would only queue them. Two is written on both sides so
 * the loop reads honestly.
 */
async function work(queue) {
  for (;;) {
    const row = queue.shift();
    if (!row) return;
    const out = await ensureIcons(db, row.id, { force: FORCE });
    made += out.made; failed += out.failed;
    if (out.skipped) skipped++;
    done++;
    const note = out.skipped ? out.skipped : `${out.made} drawn${out.failed ? `, ${out.failed} failed` : ''}`;
    console.log(`  [${String(done).padStart(3)}/${rows.length}] ${row.name.padEnd(22)} ${note}`);
  }
}

const queue = [...rows];
await Promise.all([work(queue), work(queue)]);

const secs = Math.round((Date.now() - started) / 1000);
console.log(`icons: ${made} drawn, ${failed} failed, ${skipped} creature(s) skipped, ${secs}s`);
const stored = db.prepare('SELECT count(*) AS n FROM icon').get().n;
console.log(`icons: ${stored} stored in total`);
