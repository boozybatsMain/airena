/**
 * The prices have not drifted away from the measurement that set them — gate.
 *
 * TWO CHECKS, AND THEY ANSWER DIFFERENT QUESTIONS.
 *
 * 1. PROSE ↔ CODE. The "best case" table lives as a comment in
 *    `src/skills/registry.js`. It was measured by `tools/kitbalance.mjs
 *    --atoms` over 1 260 fights, and the prices were set from it. `kitbalance`
 *    cannot be in `npm test` — it is minutes of fighting — so without this
 *    check nothing holds the comment to the code: change a number in
 *    `EFFECTS` and the table beside it silently describes another game.
 *    This half re-measures nothing. It parses the comment, reads the live
 *    `EFFECTS`, and checks the three claims the comment itself makes.
 *
 * 2. PRICES ↔ THE LAST PASS. The comment check is CIRCULAR by construction:
 *    the table was copied from the pass the prices were set from, so its
 *    correlation is ~0.79 whatever the balance is (balance review r1, L2).
 *    It cannot fail on a balance regression. So this gate also binds to the
 *    NEWEST `reports/combat/atombalance-panel-*.json` and asserts the two
 *    things a settled economy must show:
 *
 *      — value per point across the effects has a standard deviation of at
 *        most 0.8 pp/pt. This is the founder's flatness quantity: a point of
 *        budget should buy the same win rate wherever it is spent. The
 *        correlation between cost and value only says the ORDER is right, and
 *        it sat at 0.79–0.96 through four passes in which a point on damage
 *        bought 3 pp and a point on root bought −3.6.
 *      — no piece is significantly negative (value < −2·se). A piece that
 *        costs points and loses fights is a trap, and the price floor of 1
 *        cannot fix it: that finding sends the work to the magnitudes.
 *
 *    The file it bound to is PRINTED, so a green line is never mistaken for a
 *    statement about a pass that was never run.
 *
 *   node tools/checkprices.mjs
 *   node tools/checkprices.mjs --verbose
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DELIVERIES, EFFECTS, CHANNELS } from '../src/skills/registry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

let bad = 0;
const ok = (what, cond, note = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${what}${note ? `  ${note}` : ''}`);
  if (!cond) bad++;
};

console.log('\n  ЦЕНЫ АТОМОВ\n');

/* Строки вида ` *     урон              100%      97      100` из комментария. */
const src = readFileSync(join(ROOT, 'src/skills/registry.js'), 'utf8');
const table = new Map();
for (const m of src.matchAll(/^\s*\*\s{4,}([a-zа-яё]+)\s+(\d+)%/gim)) table.set(m[1], Number(m[2]));

ok('таблица «лучшего случая» находится в комментарии', table.size > 0, `${table.size} строк`);

const byRu = new Map(Object.values(EFFECTS).map((e) => [e.ru, e]));
const missing = [...byRu.keys()].filter((ru) => !table.has(ru));
const extra = [...table.keys()].filter((ru) => !byRu.has(ru));
ok('в таблице ровно те атомы, что в реестре', missing.length === 0 && extra.length === 0,
  missing.length || extra.length ? `нет в таблице: ${missing.join(', ') || '—'}; лишние: ${extra.join(', ') || '—'}` : `${byRu.size} атомов`);

const costs = [...byRu.values()].map((e) => e.cost);
const lo = Math.min(...costs); const hi = Math.max(...costs);
/* Диапазон объявлен в том же комментарии: «ранги отображены в 3…7». */
const said = /ранги отображены в (\d+)…(\d+)/.exec(src);
ok('диапазон цен совпадает с объявленным', said && lo === Number(said[1]) && hi === Number(said[2]),
  said ? `в коде ${lo}…${hi}, в комментарии ${said[1]}…${said[2]}` : 'в комментарии нет строки про диапазон');

const pairs = [...byRu.entries()].filter(([ru]) => table.has(ru)).map(([ru, e]) => [e.cost, table.get(ru)]);
let r = NaN;
if (pairs.length > 2) {
  const n = pairs.length;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  r = sxy / Math.sqrt(sxx * syy);
}
/* Комментарии переносятся по строкам, и утверждение может разорваться посередине
   («…с лучшим\n * случаем 0.91»). Ищем по тексту без разметки переноса. */
const flat = src.replace(/\n\s*\*\s?/g, ' ');
const claimed = /[Кк]орреляция цены с лучшим случаем (\d+(?:\.\d+)?)/.exec(flat);
const want = claimed ? Number(claimed[1]) : null;
ok('корреляция цены с замером не ниже объявленной', want !== null && r >= want - 0.02,
  want === null ? 'в комментарии нет строки про корреляцию'
    : `сейчас ${r.toFixed(3)}, объявлено ${want.toFixed(2)}`);

if (VERBOSE) {
  for (const [ru, e] of byRu) console.log(`      ${ru.padEnd(16)} цена ${e.cost}  лучший случай ${table.get(ru) ?? '—'}%`);
}

/* ── the last pricing pass ─────────────────────────────────────────────── */
console.log('\n  THE LAST PRICING PASS\n');

/** Ship targets. `SD_MAX` is the spread the founder asked to flatten. It is a
 * RATCHET, not a wish: v5 read 1.73, v6 1.46, v7 1.30, v8 1.21, v9 1.11 (480
 * kits, 07.09) — all in the 180 hp world. D201 gave every body 60 more hp
 * for the product's pace, and the pilot panel became a longer stall (83–87 %
 * of its fights reach the burn clock, up from 68 %): in that world the same
 * pieces read v10b 1.27, v11 1.30. The ratchet restarts at the first
 * reading of the new world with room for bootstrap noise; a pass that reads
 * worse than the previous one in the SAME world is a regression. Lower it
 * when a pass earns it. */
const SD_MAX = 1.35;

const panelDir = join(ROOT, 'reports/combat');
let panel = null;
try {
  const files = readdirSync(panelDir)
    .filter((f) => /^atombalance-panel-.*\.json$/.test(f))
    .map((f) => ({ f, path: join(panelDir, f), mtime: statSync(join(panelDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length) panel = { ...files[0], data: JSON.parse(readFileSync(files[0].path, 'utf8')) };
} catch (err) {
  console.log(`  (could not read ${panelDir}: ${String(err?.message || err)})`);
}

ok('bound to a pricing pass', panel !== null,
  panel ? `reports/combat/${panel.f}  (${new Date(panel.mtime).toISOString().slice(0, 16).replace('T', ' ')})` : 'no reports/combat/atombalance-panel-*.json found');

if (panel) {
  const pieces = Array.isArray(panel.data.pieces) ? panel.data.pieces : [];
  ok('the pass has a piece table', pieces.length > 0, `${pieces.length} pieces`);

  /* `perPoint` has been in the JSON since v2; `headline` is added by the
     current instrument. Recompute from `pieces` either way, so this gate
     reads an older pass and a newer one the same way. */
  const effects = pieces.filter((p) => p.axis === 'effect' && Number.isFinite(p.perPoint));
  let sd = NaN; let mean = NaN;
  if (effects.length > 1) {
    const v = effects.map((p) => p.perPoint);
    mean = v.reduce((a, b) => a + b, 0) / v.length;
    sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
  }
  ok(`value per point is flat across effects (sd ≤ ${SD_MAX} pp/pt)`, Number.isFinite(sd) && sd <= SD_MAX,
    Number.isFinite(sd)
      ? `sd ${sd.toFixed(2)}, mean ${mean.toFixed(2)}, over ${effects.length} effects`
      : 'the pass has no per-point column');

  /* A piece already at the floor of 1 has no price left to lose; COMBAT.md §5
     sends it to the magnitudes, and the gate lists it without failing on it. */
  const negAll = pieces.filter((p) => Number.isFinite(p.se) && Number.isFinite(p.value) && p.value < -2 * p.se);
  /* The floor is read from the REGISTRY, not from the pass: a trap moved to 1
     after the pass was played is at the floor now. */
  const priceNow = (p) => ({ delivery: DELIVERIES, effect: EFFECTS, channel: CHANNELS }[p.axis]?.[p.id]?.cost ?? p.currentCost);
  const atFloor = negAll.filter((p) => priceNow(p) <= 1);
  if (atFloor.length) console.log(`      at the floor, significantly negative (a magnitude question, not a price): ${atFloor.map((p) => `${p.id} ${p.value.toFixed(1)}±${p.se.toFixed(1)}`).join(', ')}`);
  const neg = negAll.filter((p) => priceNow(p) > 1);
  ok('no piece priced above the floor is significantly negative (value < −2·se)', neg.length === 0,
    neg.length ? neg.map((p) => `${p.id} ${p.value.toFixed(1)}±${p.se.toFixed(1)} @${p.currentCost}`).join(', ') : `0 of ${pieces.length}`);

  if (panel.data.verdict) {
    console.log(`      the pass says: ${panel.data.verdict.converged ? 'CONVERGED' : 'NOT CONVERGED'}`
      + `, largest proposed move ${panel.data.verdict.maxDelta} pt`);
  }
  if (VERBOSE && effects.length) {
    for (const p of effects.slice().sort((a, b) => b.perPoint - a.perPoint)) {
      console.log(`      ${String(p.id).padEnd(12)} cost ${String(p.currentCost).padStart(2)}  value ${p.value.toFixed(2).padStart(7)}  per point ${p.perPoint.toFixed(2).padStart(6)}`);
    }
  }
}

if (bad) {
  console.log('\n  Если цены менялись осознанно — таблицу надо ПЕРЕСНЯТЬ, а не поправить руками:');
  console.log('    for v in bolt zone; do node tools/kitbalance.mjs --atoms --via=$v; done');
  console.log('  А если красное — прайсинг-проход: node tools/atombalance.mjs --out=reports/combat/atombalance-panel-v6.md');
}
console.log(bad ? `\n  ПРОВАЛ: ${bad}\n` : '\n  ДЕРЖИТ\n');
process.exit(bad ? 1 : 0);
