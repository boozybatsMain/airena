/**
 * bakeoff — forge minds for the SAME creatures with many models, then measure
 * how intelligently each model's minds fight.
 *
 * Two subcommands.
 *
 *   node --env-file-if-exists=.env tools/bakeoff.mjs forge \
 *       --models=google/gemini-3.7-flash:plain,z-ai/glm-5.3-flash:think,sub:opus:plain \
 *       --creatures=reports/combat/bakeoff/creatures.json \
 *       [--out=reports/combat/bakeoff] [--budget=6] [--request-budget=3.2] [--force] [--dry]
 *
 *     For every (model, creature) pair: compile the creature's kit, ask the
 *     model for a mind with the production prompt (`forgeBrain`, the same
 *     `callWithRepair` door the server uses), then run the production
 *     admission (`admit`: static analysis, fuel instrumentation, four trial
 *     fights against the hand-written sparring stub). Writes
 *
 *       <out>/<model-slug>/<creature-id>.js     the mind's source
 *       <out>/<model-slug>/<creature-id>.json   model, creature (kit + build),
 *                                               costUsd, elapsedMs, tries, usage,
 *                                               admitted, stage, problems, probe,
 *                                               promptHash (sha256 of the prompt)
 *
 *     A pair whose .js already exists is skipped unless --force. A running
 *     OpenRouter spend is printed after every pair and the run stops opening
 *     new OpenRouter pairs once it passes --budget (USD, default 6); `sub:`
 *     pairs cost 0 and keep going. `--dry` prints the plan and writes nothing.
 *
 *     Model ids are bundle ids: an OpenRouter model id plus `:plain`, `:think`
 *     or `:high` (the think mode of THINK_MODES — 0 / 8 000 / 24 000 reasoning
 *     tokens), or a subscription bundle `sub:<opus|sonnet|fable>:<plain|think|high>`
 *     (effort low / medium / high through the local `claude` binary — needs
 *     AIRENA_SUB_MODELS=1). OpenRouter prices are fetched live and the token
 *     ceiling is derived from --request-budget exactly as the catalog does; the
 *     catalog's ALLOWED whitelist is deliberately NOT applied here.
 *
 *   node tools/bakeoff.mjs league [--out=reports/combat/bakeoff] [--seeds=4] \
 *       [--pilots=stub,kiter,rusher,controller] [--creatures=...] [--quiet]
 *
 *     Loads every admitted mind under --out and plays, in this process:
 *       (a) every mind against every other mind — on different creatures and
 *           on the same creature (a mirror: same kit, two authors) — each
 *           pairing on both sides over --seeds seeds, each mind with ITS
 *           creature's kit and body;
 *       (b) every mind against each pilot of the panel, the pilot holding the
 *           SAME kit and body — a yardstick: does the model's mind beat a
 *           scripted mind with identical equipment?
 *     Metrics follow reports/combat/spectate.mjs (its per-match logic is
 *     copied here, and the two files are kept in step) — including the three
 *     re-defined on 07.09: `immune` counts only a refusal on a cast carrying
 *     no damage and no burn (raw count printed beside it), `dodges` adds the
 *     side-step (a projectile missing a target that crossed its line faster
 *     than 2 m/s) to the airborne and i-frame ones, and `idle+in reach` uses
 *     the true centre-to-centre reach — plus two of this tool's own:
 *       telegraph response — of the opponent's wind-up windows, the share in
 *           which this mind changed its movement (direction > 40°, or a stop /
 *           start) or started an ability inside the window;
 *       lead usage — of its bolt/mortar casts fired while the enemy moved
 *           faster than 2 m/s, the share aimed more than 5° off the direct
 *           bearing to the enemy (a bolt flies along the caster's heading; a
 *           mortar toward its landing point).
 *     Writes <out>/league.md (per-model table sorted by win rate vs pilots,
 *     per-mind table, per-creature cross table) and <out>/league.json.
 *
 * Nothing here touches the database or the server.
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileBrain, extractSource } from '../src/brain/host.js';
import {
  BEAM_RADIUS, BUILD_BUDGET, DT, MATCH_SECONDS, PROJECTILE_MUZZLE, PROJECTILE_TOUCH, SKILLS,
  SUDDEN_DEATH_AT, TICK_HZ, normalizeBuild,
} from '../src/core/config.js';
import { runMatch } from '../src/core/match.js';
import {
  MEASURED, MIN_CODE_TOKENS, REQUEST_BUDGET_USD, ROUTING_VARIANTS, THINK_MODES, TOKEN_PROFILE,
  estimateCreatureUsd, fetchPrices, tokenCeiling,
} from '../src/server/forge/models.js';
import { SUB_EFFORT, SUB_FAMILIES, SUB_PREFIX, subChannelOpen } from '../src/server/forge/subscription.js';
import { compileKit } from '../src/skills/compile.js';
import { DAMAGING, DELIVERIES, EFFECTS, KIT_BUDGET, costOf, describe, validateKit } from '../src/skills/registry.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DEFAULT_OUT = join(ROOT, 'reports/combat/bakeoff');
const DEFAULT_CREATURES = join(DEFAULT_OUT, 'creatures.json');

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const SUB = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  if (i >= 0) return true;
  return def;
};
/** `--max-tokens=N` — cap every OpenRouter request's ceiling (see resolveBundles). */
const MAX_TOKENS_CAP = Number(arg('max-tokens', 0));
const OUT = resolve(String(arg('out', DEFAULT_OUT)));
const CREATURES_FILE = resolve(String(arg('creatures', DEFAULT_CREATURES)));
const QUIET = !!arg('quiet', false);

// ── small helpers ────────────────────────────────────────────────────────────
const other = (id) => (id === 'blue' ? 'orange' : 'blue');
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const pct = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(0)}%`);
const fix = (v, n = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toFixed(n));
const usd = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toFixed(4)}`);
const say = (...a) => { if (!QUIET) console.log(...a); };
const slug = (id) => String(id).toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const mkdirp = (dir) => { try { mkdirSync(dir, { recursive: true }); } catch { /* exists */ } };
const wrapAngle = (a) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
const git = (cmd) => { try { return execSync(`git -C ${JSON.stringify(ROOT)} ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return '?'; } };

/** The model's share of a creature's price: brain ÷ (body + brain) over the measured bundles. */
const BRAIN_SHARE = (() => {
  const rows = Object.values(MEASURED).filter((m) => m.body && m.brain);
  return rows.length ? r3(mean(rows.map((m) => m.brain / (m.body + m.brain)))) : 0.3;
})();

// ── creatures ────────────────────────────────────────────────────────────────
function loadCreatures(file, { required = true } = {}) {
  if (!existsSync(file)) {
    if (required) { console.error(`creatures file not found: ${file}`); process.exit(1); }
    return [];
  }
  let list;
  try { list = JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
    console.error(`creatures file does not parse: ${e.message}`); process.exit(1);
  }
  if (!Array.isArray(list)) { console.error('creatures file must hold an array'); process.exit(1); }
  const out = [];
  for (const c of list) {
    if (!c || typeof c.id !== 'string' || !/^[\w.-]+$/.test(c.id)) { console.error(`  ! creature without a legal id skipped: ${JSON.stringify(c).slice(0, 80)}`); continue; }
    const bad = validateKit(c.kit);
    if (bad.length) { console.error(`  ! ${c.id}: kit is not legal: ${bad.map((b) => b.ru).join('; ')}`); continue; }
    const compiled = compileKit(c.kit);
    if (compiled.problems.length) { console.error(`  ! ${c.id}: kit does not compile: ${JSON.stringify(compiled.problems)}`); continue; }
    const nb = normalizeBuild(c.build);
    if (nb.squeezed) console.error(`  ! ${c.id}: body over ${BUILD_BUDGET} points, squeezed by ${nb.squeezed}`);
    out.push({
      id: c.id, prompt: String(c.prompt || ''), kit: c.kit, build: nb.build, buildCost: nb.cost,
      kitCost: sum(c.kit.map(costOf)), defs: compiled.defs,
    });
  }
  return out;
}

// ── bundles ──────────────────────────────────────────────────────────────────
/**
 * One bundle per id, built the way `buildCatalog` builds its rows — live
 * price, ceiling from the request budget, think budget from the mode — but
 * without the ALLOWED whitelist: the bake-off exists to look outside it.
 */
function resolveBundles(ids, { prices, budgetUsd }) {
  const bundles = []; const rejected = [];
  for (const id of ids) {
    if (id.startsWith(SUB_PREFIX)) {
      const [, family, mode] = id.split(':');
      const f = SUB_FAMILIES[family];
      if (!f) { rejected.push({ bundle: id, why: `unknown subscription family "${family}" (${Object.keys(SUB_FAMILIES).join(', ')})` }); continue; }
      const effort = SUB_EFFORT[mode];
      if (!effort) { rejected.push({ bundle: id, why: `unknown mode "${mode}" (${Object.keys(SUB_EFFORT).join(', ')})` }); continue; }
      bundles.push({
        bundle: id, modelId: `${SUB_PREFIX}${family}`, mode, channel: 'sub',
        label: f.label, thinkLabel: { plain: 'quick', think: 'deep', high: 'deep' }[mode], thinkBudget: 0,
        maxTokens: 64_000, effort, creatureUsd: 0, estBrainUsd: 0, measuredBrain: false,
        tier: 'sub', price: null,
      });
      continue;
    }
    const at = id.lastIndexOf(':');
    if (at <= 0) { rejected.push({ bundle: id, why: 'no think mode — append :plain, :think or :high' }); continue; }
    const modelId = id.slice(0, at); const mode = id.slice(at + 1);
    const think = THINK_MODES[mode];
    if (!think) { rejected.push({ bundle: id, why: `unknown mode "${mode}" (${Object.keys(THINK_MODES).join(', ')})` }); continue; }
    if (ROUTING_VARIANTS.test(modelId)) console.error(`  ! ${id}: a routing variant of a model, not an author of its own — kept, but read its rows as the base model's`);
    const price = prices ? prices[modelId] : null;
    if (prices && !price) { rejected.push({ bundle: id, why: 'not listed by the provider' }); continue; }
    let ceiling = null;
    if (price) {
      ceiling = tokenCeiling(price, budgetUsd);
      /* `--max-tokens` caps the ceiling: OpenRouter refuses a request whose
         max_tokens the account cannot afford (402), and a free model has no
         price to derive a ceiling from at all. */
      if (Number.isFinite(MAX_TOKENS_CAP) && MAX_TOKENS_CAP > 0) ceiling = Math.min(ceiling ?? MAX_TOKENS_CAP, MAX_TOKENS_CAP);
      if (!Number.isFinite(ceiling)) ceiling = MAX_TOKENS_CAP > 0 ? MAX_TOKENS_CAP : 64000;
      if (ceiling === null) { rejected.push({ bundle: id, why: `an allowance of ${budgetUsd} USD does not cover ${MIN_CODE_TOKENS} tokens of code` }); continue; }
      if (think.budget && ceiling < think.budget + MIN_CODE_TOKENS) {
        rejected.push({ bundle: id, why: `a ceiling of ${ceiling} is below thinking ${think.budget} plus code ${MIN_CODE_TOKENS}` });
        continue;
      }
    }
    const m = MEASURED[id];
    const creatureUsd = price ? (m ? m.body + m.brain : estimateCreatureUsd(price, think.budget)) : null;
    const estBrainUsd = price ? (m?.brain ?? estimateCreatureUsd(price, think.budget) * BRAIN_SHARE) : null;
    bundles.push({
      bundle: id, modelId, mode, channel: 'openrouter',
      label: price?.name || modelId, thinkLabel: think.label, thinkBudget: think.budget,
      maxTokens: ceiling, creatureUsd: creatureUsd === null ? null : r4(creatureUsd),
      estBrainUsd: estBrainUsd === null ? null : r4(estBrainUsd), measuredBrain: !!m?.brain,
      tier: 'bakeoff', price: price ? { in: price.in, out: price.out, maxOut: price.maxOut ?? null, context: price.context ?? null } : null,
    });
  }
  return { bundles, rejected };
}

/*
 * ── THE REPAIR TURN ON A BEHAVIOUR REJECTION (D191 §2) ──────────────────────
 *
 * `admit()`'s sixth wall (`sandbox/index.js`) measures whether the mind won,
 * stayed clear of idling with a ready ability in reach, kept moving and cast
 * — and a failure there used to go straight to rejection, exactly like a
 * syntax error. `review-r1-minds.md`, "the repair loop never reports
 * behaviour": `callWithRepair` retries a malformed answer, but nothing ever
 * told the model IT LOST EVERY FIGHT. These numbers are facts about how the
 * mind played its own trial fights, not a verdict — which is exactly the
 * kind of thing one more turn can fix. Facts only, no tactics, and it picks
 * only the measures that actually failed their threshold.
 */
function behaviourRepairMessage(behaviour, fights) {
  const lines = [`Your mind just ran ${fights} trial fights against a scripted opponent holding your exact same kit. Measured:`];
  if (behaviour.wins < 1 && behaviour.damageShare < 0.4) {
    lines.push(`it won ${behaviour.wins} of ${fights} of those fights and dealt ${pct(behaviour.damageShare)} of the opponent's damage;`);
  }
  if (behaviour.idleInReach > 0.4) lines.push(`it idled — no action running, a ready ability already in reach of the enemy — ${pct(behaviour.idleInReach)} of the time it was alive;`);
  if (behaviour.still > 0.4) lines.push(`it stood still, under 0.3 m/s with no action running, ${pct(behaviour.still)} of the time it was alive;`);
  if (behaviour.casts < 3) lines.push(`it cast an ability ${behaviour.casts.toFixed(1)} times per fight on average.`);
  return lines.join(' ');
}

// ── forge ────────────────────────────────────────────────────────────────────
async function forge() {
  const ids = String(arg('models', '')).split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) { console.error('forge: --models is required (comma list of bundle ids)'); process.exit(1); }
  const DRY = !!arg('dry', false);
  const FORCE = !!arg('force', false);
  const BUDGET = Number(arg('budget', 6));
  const REQUEST_BUDGET = Number(arg('request-budget', REQUEST_BUDGET_USD));
  const creatures = loadCreatures(CREATURES_FILE);
  if (!creatures.length) { console.error('forge: no legal creatures'); process.exit(1); }

  const wantsOpenRouter = ids.some((id) => !id.startsWith(SUB_PREFIX));
  let prices = null; let priceNote = 'no OpenRouter bundle asked for';
  if (wantsOpenRouter) {
    try { prices = await fetchPrices(); priceNote = `live OpenRouter prices, ${Object.keys(prices).length} models`; }
    catch (e) { priceNote = `OpenRouter price list unavailable (${e.message})`; }
  }
  const { bundles, rejected } = resolveBundles(ids, { prices, budgetUsd: REQUEST_BUDGET });
  const subOpen = subChannelOpen();

  console.log('');
  console.log(`  bakeoff forge${DRY ? ' — DRY RUN, nothing is written' : ''}`);
  console.log(`  ${priceNote}; request ceiling ${REQUEST_BUDGET} USD per call; run budget ${BUDGET} USD (OpenRouter only)`);
  console.log(`  out: ${OUT}`);
  console.log('');
  console.log('  creatures');
  for (const c of creatures) {
    console.log(`    ${c.id.padEnd(10)} kit ${String(c.kitCost).padStart(2)}/${KIT_BUDGET}  body ${c.buildCost}/${BUILD_BUDGET}  ${c.kit.map(describe).join(' | ')}`);
  }
  console.log('');
  console.log('  models');
  for (const b of bundles) {
    const est = b.channel === 'sub' ? 'subscription, $0' : (b.estBrainUsd === null ? 'price unknown' : `≈ ${usd(b.estBrainUsd)} per mind${b.measuredBrain ? ' (measured)' : ` (est.: ${Math.round(BRAIN_SHARE * 100)}% of the creature profile ${TOKEN_PROFILE.in}/${TOKEN_PROFILE.out} tokens)`}`);
    const cap = b.channel === 'sub' ? `effort ${b.effort}` : `maxTokens ${b.maxTokens ?? '?'}, think ${b.thinkBudget}`;
    console.log(`    ${b.bundle.padEnd(36)} ${b.label.padEnd(28)} ${cap.padEnd(30)} ${est}`);
  }
  for (const r of rejected) console.log(`    ${r.bundle.padEnd(36)} REJECTED — ${r.why}`);
  if (bundles.some((b) => b.channel === 'sub') && !subOpen) {
    console.log('    ! subscription bundles need AIRENA_SUB_MODELS=1 and the local `claude` binary — they will fail with no_key as things stand');
  }
  if (wantsOpenRouter && !process.env.OPENROUTER_API_KEY && !DRY) {
    console.log('    ! OPENROUTER_API_KEY is not set — run with `node --env-file-if-exists=.env tools/bakeoff.mjs …`');
  }

  // the plan
  const plan = [];
  for (const b of bundles) for (const c of creatures) {
    const base = join(OUT, slug(b.bundle), c.id);
    const exists = existsSync(`${base}.js`);
    plan.push({ bundle: b, creature: c, base, skip: exists && !FORCE });
  }
  const todo = plan.filter((p) => !p.skip);
  const estTotal = sum(todo.filter((p) => p.bundle.channel === 'openrouter').map((p) => p.bundle.estBrainUsd || 0));
  const unknown = todo.filter((p) => p.bundle.channel === 'openrouter' && p.bundle.estBrainUsd === null).length;
  console.log('');
  console.log(`  plan: ${bundles.length} models × ${creatures.length} creatures = ${plan.length} pairs, ${todo.length} to forge (${plan.length - todo.length} already on disk${FORCE ? ', --force' : ''})`);
  console.log(`  estimated OpenRouter spend ≈ ${usd(estTotal)}${unknown ? ` plus ${unknown} pair(s) of unknown price` : ''}; the run stops opening OpenRouter pairs past ${usd(BUDGET)}`);
  console.log(`  note: one call is capped at ${REQUEST_BUDGET} USD by its token ceiling and a pair may take two attempts, so a single pair can overshoot the estimate`);
  for (const p of plan) console.log(`    ${p.skip ? 'skip ' : 'forge'}  ${p.bundle.bundle.padEnd(36)} ${p.creature.id.padEnd(10)} ${p.bundle.channel === 'sub' ? '$0' : usd(p.bundle.estBrainUsd)}`);
  console.log('');
  if (DRY) return;
  if (!todo.length) { console.log('  nothing to forge'); return; }

  /* Imported only now: pipeline.js reads the stub brains and pulls the body
     forge in with it, and the sandbox spawns isolates — none of that is
     needed to print a plan. */
  const [{ forgeBrain }, { admit }, { callWithRepair }] = await Promise.all([
    import('../src/server/forge/pipeline.js'),
    import('../src/server/sandbox/index.js'),
    import('../src/server/forge/llm.js'),
  ]);
  /* The candidate sits on `blue` and spars against the hand-written gorilla
     stub, exactly as `forgeCreature` does (CANDIDATE_SIDE / SPARRING.blue).
     `brains/kit-stub/`, not `brains/stub/` (D191 §1): `admit()` now hands the
     sparring side the CANDIDATE'S OWN kit, and the plain stub calls its
     abilities by fixture names (`smash`, `charge`) that do not exist on a
     grammar kit; `kit-stub` reads its skills from perception instead. */
  const CANDIDATE_SIDE = 'blue';
  const SPARRING = readFileSync(join(ROOT, 'brains/kit-stub/gorilla.js'), 'utf8');

  let spent = 0; let stopped = false;
  const t0 = Date.now();
  for (const p of todo) {
    const { bundle: b, creature: c, base } = p;
    if (b.channel === 'openrouter' && spent >= BUDGET) {
      if (!stopped) { console.log(`\n  OpenRouter spend ${usd(spent)} is past the run budget ${usd(BUDGET)} — no more OpenRouter pairs are opened`); stopped = true; }
      console.log(`    skipped (budget)  ${b.bundle}  ${c.id}`);
      continue;
    }
    if (b.channel === 'openrouter' && b.maxTokens === null) { console.log(`    skipped (no price) ${b.bundle}  ${c.id}`); continue; }
    mkdirp(dirname(base));
    console.log(`\n  ${b.bundle}  ×  ${c.id}`);
    let captured = null; let lastRaw = null;
    const call = async (o) => {
      captured = o.messages;
      const r = await callWithRepair(o);
      lastRaw = r;
      return r;
    };
    const onAttempt = (t) => console.log(`    attempt ${t.attempt + 1}: ${t.ok ? 'accepted' : `rejected${t.error ? ` (${t.error})` : ''}`}, ${t.chars} chars, ${usd(t.costUsd)}, ${(t.elapsedMs / 1000).toFixed(0)} s, think ${t.thinkBudget}`);
    const started = Date.now();
    const record = {
      model: b.bundle, modelId: b.modelId, mode: b.mode, channel: b.channel, label: b.label,
      thinkBudget: b.thinkBudget, maxTokens: b.maxTokens, effort: b.effort ?? null,
      creature: { id: c.id, prompt: c.prompt, kit: c.kit, build: c.build },
      generatedAt: new Date().toISOString(),
    };
    let brain = null;
    try {
      brain = await forgeBrain({ bundle: b, kit: c.defs, call, onAttempt, builds: { own: c.build, enemy: null } });
    } catch (e) {
      const cost = e.costUsd || 0;
      if (b.channel === 'openrouter') spent += cost;
      Object.assign(record, {
        admitted: false, stage: 'forge', costUsd: r4(cost), elapsedMs: Date.now() - started,
        tries: e.tries || null, usage: null, problems: [{ code: e.code || 'error', message: String(e.message || e).slice(0, 400), cause: e.cause ? String(e.cause.message || e.cause).slice(0, 400) : null }],
        promptHash: captured ? sha256(promptText(captured)) : null, promptChars: captured ? promptText(captured).length : null,
      });
      writeFileSync(`${base}.json`, JSON.stringify(record, null, 2));
      console.log(`    FAILED: ${e.code || 'error'} — ${String(e.message || e).slice(0, 160)}${e.cause ? ` — cause: ${String(e.cause.message || e.cause).slice(0, 300)}` : ''}`);
      console.log(`    OpenRouter spend this run: ${usd(spent)} of ${usd(BUDGET)}`);
      continue;
    }
    const elapsedMs = Date.now() - started;
    if (b.channel === 'openrouter') spent += brain.costUsd || 0;
    writeFileSync(`${base}.js`, brain.source);
    console.log(`    source ${brain.source.length} chars in ${(elapsedMs / 1000).toFixed(0)} s, ${usd(brain.costUsd)}${lastRaw?.referenceUsd ? ` (reference ${usd(lastRaw.referenceUsd)})` : ''} — admitting…`);
    let v;
    try { v = await admit(brain.source, CANDIDATE_SIDE, { sparring: SPARRING, kit: c.defs }); }
    catch (e) { v = { ok: false, stage: 'admit', problems: [{ code: e.code || 'admit', message: String(e.message || e).slice(0, 400) }], probe: null }; }

    /* One repair turn on a behaviour rejection, before giving up — D191 §2. */
    let repairCostUsd = 0;
    if (!v.ok && v.problems?.[0]?.code === 'behaviour' && v.behaviour && captured) {
      const repairText = behaviourRepairMessage(v.behaviour, (v.probe || []).length);
      console.log(`    behaviour rejection — one repair turn: ${repairText}`);
      try {
        const r2 = await callWithRepair({
          modelId: b.modelId, effort: b.effort, maxTokens: b.maxTokens, thinkBudget: b.thinkBudget,
          messages: [...captured, { role: 'user', content: repairText }],
          accept: (t) => { try { return extractSource(t).length > 200; } catch { return false; } },
          attempts: 1,
        });
        repairCostUsd = r2.costUsd || 0;
        const repairedSource = extractSource(r2.text);
        let v2;
        try { v2 = await admit(repairedSource, CANDIDATE_SIDE, { sparring: SPARRING, kit: c.defs }); }
        catch (e) { v2 = { ok: false, stage: 'admit', problems: [{ code: e.code || 'admit', message: String(e.message || e).slice(0, 400) }], probe: null }; }
        record.repair = {
          attempted: true, message: repairText, costUsd: r4(repairCostUsd),
          admitted: !!v2.ok, problems: v2.ok ? [] : (v2.problems || []),
        };
        if (v2.ok) { brain = { ...brain, source: repairedSource }; v = v2; writeFileSync(`${base}.js`, brain.source); }
      } catch (e) {
        record.repair = { attempted: true, message: repairText, costUsd: r4(repairCostUsd), admitted: false, error: String(e.message || e).slice(0, 300) };
      }
      if (b.channel === 'openrouter') spent += repairCostUsd;
    }

    Object.assign(record, {
      admitted: !!v.ok, stage: v.stage, problems: v.problems || [], probe: v.probe || null, behaviour: v.behaviour || null,
      costUsd: r4((brain.costUsd || 0) + repairCostUsd), referenceUsd: lastRaw?.referenceUsd ?? null, elapsedMs,
      tries: brain.tries || null, usage: brain.usage || null,
      resolvedModel: lastRaw?.resolvedModel ?? null, provider: lastRaw?.provider ?? null,
      sourceChars: brain.source.length,
      promptHash: captured ? sha256(promptText(captured)) : null, promptChars: captured ? promptText(captured).length : null,
    });
    writeFileSync(`${base}.json`, JSON.stringify(record, null, 2));
    if (v.ok) {
      const pr = v.probe || [];
      console.log(`    ADMITTED — ${pr.length} trial fights, won ${pr.filter((r) => r.winner === CANDIDATE_SIDE).length}, hits ${sum(pr.map((r) => r.hits))}, faults ${sum(pr.map((r) => r.faults))}`);
    } else {
      console.log(`    REJECTED at ${v.stage}: ${(v.problems || []).map((x) => `${x.code}: ${x.message}`).join('; ').slice(0, 200)}`);
    }
    console.log(`    OpenRouter spend this run: ${usd(spent)} of ${usd(BUDGET)}`);
  }
  console.log(`\n  done in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min; OpenRouter spend ${usd(spent)}. Next: node tools/bakeoff.mjs league --out=${OUT}\n`);
}

const promptText = (messages) => messages.map((m) => `[${m.role}]\n${m.content}`).join('\n\n');

// ── league: loading ──────────────────────────────────────────────────────────
function loadMinds(creatures) {
  const byId = new Map(creatures.map((c) => [c.id, c]));
  const minds = []; const dropped = [];
  if (!existsSync(OUT)) return { minds, dropped };
  for (const dir of readdirSync(OUT).sort()) {
    const full = join(OUT, dir);
    let st; try { st = statSync(full); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const f of readdirSync(full).sort()) {
      if (!f.endsWith('.json')) continue;
      const jsonPath = join(full, f);
      const jsPath = join(full, `${f.slice(0, -5)}.js`);
      let rec; try { rec = JSON.parse(readFileSync(jsonPath, 'utf8')); } catch (e) { dropped.push({ dir, file: f, why: `json does not parse: ${e.message}` }); continue; }
      const model = String(rec.model || dir);
      const creatureId = String(rec.creature?.id || f.slice(0, -5));
      if (rec.admitted !== true) { dropped.push({ dir, file: f, model, creatureId, why: `not admitted (${rec.stage || '?'}: ${(rec.problems || []).map((p) => p.code).join(',') || '—'})` }); continue; }
      if (!existsSync(jsPath)) { dropped.push({ dir, file: f, model, creatureId, why: 'no .js beside the record' }); continue; }
      const kitJson = rec.creature?.kit || rec.kit || byId.get(creatureId)?.kit;
      const buildRaw = rec.creature?.build || rec.build || byId.get(creatureId)?.build;
      if (!kitJson) { dropped.push({ dir, file: f, model, creatureId, why: 'no kit in the record and no such creature in the creatures file' }); continue; }
      const compiled = compileKit(kitJson);
      if (compiled.problems.length) { dropped.push({ dir, file: f, model, creatureId, why: `kit does not compile: ${JSON.stringify(compiled.problems).slice(0, 120)}` }); continue; }
      const source = readFileSync(jsPath, 'utf8');
      const key = `${dir}/${creatureId}`;
      let brain;
      try { brain = compileBrain(source, key); } catch (e) { dropped.push({ dir, file: f, model, creatureId, why: `brain does not compile: ${e.message}` }); continue; }
      minds.push({
        key, name: key, model, modelSlug: dir, creatureId, isPilot: false,
        kitJson, kit: compiled.defs, build: normalizeBuild(buildRaw).build, brain, source,
        record: { costUsd: rec.costUsd ?? null, elapsedMs: rec.elapsedMs ?? null, tries: Array.isArray(rec.tries) ? rec.tries.length : null, sourceChars: rec.sourceChars ?? source.length, promptHash: rec.promptHash ?? null },
      });
    }
  }
  return { minds, dropped };
}

function loadPilots(names) {
  const out = [];
  for (const name of names) {
    const file = name === 'stub' ? join(ROOT, 'brains/kit-stub/octopus.js') : join(ROOT, 'brains/pilots', `${name}.js`);
    if (!/^[\w.-]+$/.test(name) || !existsSync(file)) { console.error(`  ! pilot "${name}" not found (${file}) — skipped`); continue; }
    try { out.push({ name, brain: compileBrain(readFileSync(file, 'utf8'), `pilot:${name}`) }); }
    catch (e) { console.error(`  ! pilot "${name}" does not compile: ${e.message} — skipped`); }
  }
  return out;
}

// ── league: one match (spectate.mjs logic, plus telegraph response and lead) ──
const FAR_M = 12, BRAWL_M = 4, STILL_MPS = 0.3;
const TARGETED_ATOM = (id) => EFFECTS[id]?.klass === 'targeted';
const JUDGED_KIND = (kind) => DELIVERIES[kind]?.klass === 'targeted' || kind === 'zone';
/*
 * ── THE TRUE REACH, CENTRE TO CENTRE ────────────────────────────────────────
 *
 * This used to read `def.range + me.radius` for beam/bolt/lob/cone, which is
 * neither of the two numbers that exist: the caster's radius is not part of a
 * cone's reach at all, and the ENEMY's radius is part of every shape's, because
 * every delivery connects on the target's SURFACE. `review-r1-code.md` LOW-5
 * measured the error at 0.4–2.3 m, all of it under-counting "idle in reach".
 *
 * The rule below is `reachLine` in `src/brain/prompt.js` — the same arithmetic
 * the mind is told in its kit card, and the one `tools/checkbehaviour.mjs`
 * verifies by binary search against real hits (three body pairs, 18 probes,
 * agreeing to the third decimal). Terms, and where each number comes from:
 *
 *   beam   me.r + BEAM_MUZZLE + range + you.r + BEAM_RADIUS
 *   cone   range + you.r                       (own radius is NOT in it: the
 *                                               wedge is measured from centre)
 *   bolt   me.r + PROJECTILE_MUZZLE + flight + you.r + PROJECTILE_TOUCH
 *   lob    range + splash + you.r
 *   zone   range + radius + you.r
 *   dash   distance + me.r + you.r
 *
 * `flight` is the bolt's range rounded UP to whole ticks, because the world
 * subtracts one tick of life at a time (`tickProjectiles`): the default bolt
 * (range 18, speed 22) actually travels 18.33 m. That is the only place this
 * differs from the plain `muzzle + range + enemyR + touch`, and it differs by
 * less than one tick of flight.
 */
/** `src/core/config.js` — read by `deliver.js:247` (release) and `:507` (touch). */
const BOLT_MUZZLE = PROJECTILE_MUZZLE, BOLT_TOUCH = PROJECTILE_TOUCH;
/** `src/core/config.js` BEAM_RADIUS — the beam's half-width at `deliver.js:175`. */
const BEAM_MARGIN = BEAM_RADIUS;
/** The one term with no name in the config: a bare 0.2 at `deliver.js:170`. */
const BEAM_MUZZLE = 0.2;
/** How far a bolt really flies: its range rounded up to whole ticks of DT. */
const boltFlight = (def) => (def.speed ? Math.ceil((def.range / def.speed) / DT - 1e-9) * def.speed * DT : def.range);
/**
 * Centre-to-centre reach of a compiled ability — the enemy's radius INCLUDED.
 *
 * @param {object} def  compiled ability (`compileKit`)
 * @param {object} me   the caster's build (radius)
 * @param {object} you  the target's build (radius)
 * @returns {?number} metres, or null for a shape with no hit distance
 *   (`self`, `blink`, `jump` — the leap included).
 */
const reachOf = (def, me, you) => {
  switch (def.kind) {
    case 'beam': return me.radius + BEAM_MUZZLE + def.range + you.radius + BEAM_MARGIN;
    case 'cone': return def.range + you.radius;
    case 'bolt': return me.radius + BOLT_MUZZLE + boltFlight(def) + you.radius + BOLT_TOUCH;
    case 'lob': return def.range + def.splash + you.radius;
    case 'zone': return def.range + def.radius + you.radius;
    case 'dash': return def.distance + me.radius + you.radius;
    default: return null;
  }
};

/*
 * ── WHAT COUNTS AS AN IMMUNE REFUSAL ───────────────────────────────────────
 *
 * `effects.js` refuses the ATOM, never the cast: a bolt of damage+silence
 * whose silence lands inside an immunity window still delivered its damage,
 * and logging that as a wasted decision is what made the league read 9–18
 * "immune" a game (`review-r1-pace.md` L1: 0.00 of 17.0 per match were casts
 * with nothing but control on them). So an immune line counts only when the
 * refusing cast carries NO damage and NO burn atom — then, and only then, the
 * whole cast bought nothing.
 *
 * The atoms come from the CASTER's compiled kit (`by` + `skill` on the line).
 * A fixture skill has no kit entry; the hardcoded five carry their damage as a
 * plain field (`SKILLS.laser.damage` and friends), so that is what is read.
 */
const carriesDamage = (def, skill) => {
  if (def) return def.effects.some((e) => DAMAGING.has(e.id));
  const fixture = SKILLS[skill];
  return !!(fixture && (fixture.damage > 0 || fixture.burn > 0));
};

/** Deliveries that put a projectile in the air — the only ones a side-step can dodge. */
const PROJECTILE_KIND = (kind) => kind === 'bolt' || kind === 'lob';
/** A dodge by side-step: this much of the target's speed across the shot line. */
const SIDESTEP_MPS = 2;
/** Telegraph response: a window shorter than this had no thought in it (THINK_EVERY = 2 ticks). */
const MIN_WINDOW_TICKS = 3;
const TURN_RAD = (40 * Math.PI) / 180;
const LEAD_RAD = (5 * Math.PI) / 180;
const LEAD_MIN_SPEED = 2;
const MOVING = 0.8;

function playMatch(a, b, seed, aSide) {
  const bSide = other(aSide);
  const brains = { [aSide]: a.brain, [bSide]: b.brain };
  const kits = { [aSide]: a.kit, [bSide]: b.kit };
  const builds = { [aSide]: a.build, [bSide]: b.build };
  a.brain.reset(); b.brain.reset();

  const per = {};
  for (const side of ['blue', 'orange']) {
    per[side] = { aliveTicks: 0, noAct: 0, idleReady: 0, idleInRange: 0, waitingCd: 0, allCd: 0, stillNoAct: 0 };
  }
  const m = { ticks: 0, far: 0, brawl: 0, bothAllCd: 0, bothNoAct: 0, distSum: 0, sdTicks: 0 };
  const impacts = { blue: {}, orange: {} };
  /* One row per tick — where the two bodies were and how they were moving.
     The side-step test below needs it: a `miss` log line carries the time and
     nothing else, and the lateral speed that made the shot miss lives in the
     snapshot (`snapshot()` reports the smoothed rvx/rvz as vx/vz). */
  const frameAt = new Map();
  /* This tool's own two: wind-up windows of the opponent, and aimed shots. */
  const tg = { blue: { open: null, windows: [] }, orange: { open: null, windows: [] } };
  const lead = { blue: { casts: 0, led: 0 }, orange: { casts: 0, led: 0 } };

  const closeWindow = (side, s) => {
    const w = tg[side].open;
    if (!w) return;
    tg[side].open = null;
    if (w.ticks < MIN_WINDOW_TICKS) return;
    w.t1 = s ? s.t : w.tLast;
    tg[side].windows.push(w);
  };

  const onFrame = (s) => {
    frameAt.set(s.t.toFixed(3), {
      blue: { x: s.blue.x, z: s.blue.z, vx: s.blue.vx, vz: s.blue.vz },
      orange: { x: s.orange.x, z: s.orange.z, vx: s.orange.vx, vz: s.orange.vz },
    });
    for (const fx of s.fx) {
      if (fx.kind === 'impact' && !fx.blocked && fx.effects && fx.effects.some(TARGETED_ATOM)) {
        (impacts[fx.who][fx.skill] ||= []).push(fx.t);
      }
      if ((fx.kind === 'bolt' || fx.kind === 'lob') && lead[fx.who]) {
        const en = s[other(fx.who)];
        if (!en || Math.hypot(en.vx, en.vz) <= LEAD_MIN_SPEED) continue;
        const bearing = Math.atan2(en.x - fx.x, en.z - fx.z);
        const aim = fx.kind === 'lob' && fx.x1 !== undefined ? Math.atan2(fx.x1 - fx.x, fx.z1 - fx.z) : fx.h;
        lead[fx.who].casts++;
        if (Math.abs(wrapAngle(aim - bearing)) > LEAD_RAD) lead[fx.who].led++;
      }
    }
    if (s.over) { closeWindow('blue', s); closeWindow('orange', s); return; }
    m.ticks++;
    const dx = s.blue.x - s.orange.x, dz = s.blue.z - s.orange.z;
    const dist = Math.hypot(dx, dz);
    m.distSum += dist;
    if (dist > FAR_M) m.far++;
    if (dist < BRAWL_M) m.brawl++;
    if (s.t >= SUDDEN_DEATH_AT) m.sdTicks++;
    const allCd = {}; const noAct = {};
    for (const side of ['blue', 'orange']) {
      const f = s[side];
      const p = per[side];
      // telegraph windows: the OPPONENT is winding up
      const opp = s[other(side)];
      const inWindup = opp.alive && opp.act !== null && opp.actPhase === 'windup';
      const w = tg[side].open;
      if (inWindup && f.alive) {
        if (!w || w.act !== opp.act || w.tickLast !== s.tick - 1) {
          closeWindow(side, s);
          tg[side].open = { act: opp.act, t0: s.t, tLast: s.t, tickLast: s.tick, ticks: 1, v0: [f.vx, f.vz], act0: f.act, moved: false };
        } else {
          w.tickLast = s.tick; w.tLast = s.t; w.ticks++;
          if (!w.moved) {
            const sp0 = Math.hypot(w.v0[0], w.v0[1]), sp = Math.hypot(f.vx, f.vz);
            if (sp0 > MOVING && sp > MOVING) {
              const turn = Math.abs(wrapAngle(Math.atan2(f.vx, f.vz) - Math.atan2(w.v0[0], w.v0[1])));
              if (turn > TURN_RAD) w.moved = true;
            } else if ((sp0 > MOVING && sp < STILL_MPS) || (sp0 < STILL_MPS && sp > MOVING)) w.moved = true;
          }
        }
      } else if (w) closeWindow(side, s);

      if (!f.alive) continue;
      p.aliveTicks++;
      const kit = kits[side];
      const me = builds[side];
      const you = builds[other(side)];
      const cds = Object.entries(f.cd);
      const anyReady = cds.some(([, c]) => c <= 0);
      const everyCd = cds.length > 0 && cds.every(([, c]) => c > 0);
      allCd[side] = everyCd;
      noAct[side] = f.act === null;
      if (everyCd) p.allCd++;
      if (f.act === null) {
        p.noAct++;
        if (anyReady) p.idleReady++;
        if (everyCd) p.waitingCd++;
        if (Math.hypot(f.vx, f.vz) < STILL_MPS) p.stillNoAct++;
        /* Idle in reach: no act running and a READY ability whose true reach
           (both radii included) already covers the enemy — the one idling
           number a viewer notices (`review-r1-pace.md` L2). */
        if (cds.some(([k, c]) => {
          if (c > 0) return false;
          const def = kit[k];
          if (!def) return false;
          const reach = reachOf(def, me, you);
          return reach !== null && dist <= reach;
        })) p.idleInRange++;
      }
    }
    if (allCd.blue && allCd.orange) m.bothAllCd++;
    if (noAct.blue && noAct.orange) m.bothNoAct++;
  };

  const { result } = runMatch(brains, { seed, kits, builds, record: false, onFrame });
  closeWindow('blue', null); closeWindow('orange', null);
  const log = result.log;
  const seconds = result.seconds;

  const events = { blue: {}, orange: {} };
  const casts = { blue: [], orange: [] };
  const refused = { blue: {}, orange: {} };
  /* Filtered (the cast carried no damage and no burn) and raw, side by side,
     so the change to the definition can be audited from the report itself. */
  const immuneBy = { blue: 0, orange: 0 };
  const immuneRawBy = { blue: 0, orange: 0 };
  /* Dodges, credited to the body that made them, by the three ways to make one. */
  const dodgedAir = { blue: 0, orange: 0 };
  const dodgedInv = { blue: 0, orange: 0 };
  const dodgedSide = { blue: 0, orange: 0 };
  let firstHit = null, firstUse = null;
  let dodgesAir = 0, dodgesInv = 0, dodgesSide = 0, arenaBurned = 0, burnedOut = 0;

  /*
   * A SIDE-STEP: a projectile that missed because the target moved across it.
   *
   * `review-r1-pace.md` H3(b) — a body that steps out of a bolt's line is doing
   * exactly what a dodge is, and the sim can only log it as `miss:aim`. So the
   * miss is re-read against the tick it happened on: the component of the
   * target's velocity PERPENDICULAR to the caster→target line at that moment
   * (|v × û|, the cross product with the unit line). Faster than SIDESTEP_MPS
   * across the line and the body stepped out of the shot; anything slower is a
   * shot that was simply aimed badly.
   */
  const sideStepped = (ev) => {
    const def = kits[ev.who]?.[ev.skill];
    if (!def || !PROJECTILE_KIND(def.kind)) return false;
    const fr = frameAt.get(ev.t.toFixed(3));
    if (!fr) return false;
    const shooter = fr[ev.who], target = fr[other(ev.who)];
    const dx = target.x - shooter.x, dz = target.z - shooter.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return false;
    return Math.abs((target.vx * dz - target.vz * dx) / len) > SIDESTEP_MPS;
  };
  const burnedAt = { blue: null, orange: null };
  const fireAt = { blue: null, orange: null };
  const deathAt = { blue: null, orange: null };
  const push = (who, skill, t, kind, reason = null) => (events[who][skill] ||= []).push({ t, kind, reason });
  for (const [who, slots] of Object.entries(impacts)) {
    for (const [skill, ts] of Object.entries(slots)) for (const t of ts) push(who, skill, t, 'hit');
  }
  for (const ev of log) {
    switch (ev.type) {
      case 'use':
        if (firstUse === null) firstUse = ev.t;
        casts[ev.who].push({ who: ev.who, skill: ev.skill, t: ev.t });
        break;
      case 'damage': push(ev.who, ev.skill, ev.t, 'damage'); break;
      case 'ignite': push(ev.who, ev.skill, ev.t, 'hit'); break;
      case 'miss':
        /* `who` on a miss line is the CASTER, so the dodger is the other side. */
        if (ev.reason === 'airborne') { dodgesAir++; dodgedAir[other(ev.who)]++; }
        else if (ev.reason === 'aim' && sideStepped(ev)) { dodgesSide++; dodgedSide[other(ev.who)]++; }
        push(ev.who, ev.skill, ev.t, 'miss', ev.reason);
        break;
      case 'evade':
        /* `who` on an evade line is the DEFENDER (`sim.js`) — already the side
           that dodged; the cast belongs to the other one. */
        dodgesInv++; dodgedInv[ev.who]++;
        push(other(ev.who), ev.skill, ev.t, 'evade', 'invulnerable');
        break;
      case 'refused': refused[ev.who][ev.reason] = (refused[ev.who][ev.reason] || 0) + 1; break;
      case 'immune':
        if (immuneRawBy[ev.by] === undefined) break;
        immuneRawBy[ev.by]++;
        if (!carriesDamage(kits[ev.by] ? kits[ev.by][ev.skill] : null, ev.skill)) immuneBy[ev.by]++;
        break;
      case 'burnedOut': burnedOut++; fireAt[ev.who] = ev.t; break;
      case 'burned': arenaBurned++; burnedAt[ev.who] = ev.t; break;
      case 'death': deathAt[ev.who] = ev.t; break;
      default: break;
    }
  }
  for (const side of ['blue', 'orange']) {
    for (const slot of Object.values(events[side])) slot.sort((x, y) => x.t - y.t);
    const list = casts[side];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const def = kits[side][c.skill];
      c.kind = def ? def.kind : c.skill;
      c.judged = def ? JUDGED_KIND(def.kind) : true;
      const next = list.slice(i + 1).find((x) => x.skill === c.skill);
      const until = next ? next.t : Infinity;
      const evs = (events[side][c.skill] || []).filter((e) => e.t >= c.t && e.t < until);
      const hit = evs.find((e) => e.kind === 'hit');
      const dmg = evs.find((e) => e.kind === 'damage');
      const miss = evs.find((e) => e.kind === 'miss');
      const evade = evs.find((e) => e.kind === 'evade');
      const first = [hit, dmg, miss, evade].filter(Boolean).sort((x, y) => x.t - y.t)[0];
      if (!c.judged) { c.outcome = 'applied'; continue; }
      if (!first) { c.outcome = c.kind === 'zone' ? 'whiff' : 'pending'; continue; }
      if (first.kind === 'miss') { c.outcome = 'miss'; c.reason = first.reason; continue; }
      if (first.kind === 'evade') { c.outcome = 'evade'; c.reason = 'invulnerable'; continue; }
      c.outcome = 'hit';
      const hasDamageAtom = def && def.effects.some((e) => e.id === 'damage');
      c.absorbed = hasDamageAtom && !dmg;
      if (firstHit === null || first.t < firstHit) firstHit = first.t;
    }
  }

  const causeOf = (side) => {
    if (deathAt[side] === null) return null;
    if (burnedAt[side] !== null && Math.abs(burnedAt[side] - deathAt[side]) < 0.05) return 'arena';
    if (fireAt[side] !== null && Math.abs(fireAt[side] - deathAt[side]) < 0.05) return 'fire';
    return 'hit';
  };
  let decidedBy;
  if (result.reason === 'kill') decidedBy = causeOf(other(result.winner));
  else if (result.reason === 'double-ko') decidedBy = `double:${causeOf('blue')}+${causeOf('orange')}`;
  else decidedBy = result.reason;

  /* Dodges are credited to the side that made them, and there are three ways
     to make one: passing under a shot in the air, swallowing it in a blink's
     i-frames, or stepping across a projectile's line. Counted per LOG LINE
     above (a field refused four ticks in a row is four dodged ticks, and the
     `evade` line is the defender's own). */
  const dodgedBy = (side) => dodgedAir[side] + dodgedInv[side] + dodgedSide[side];

  const sideOf = (f) => (f === a ? aSide : bSide);
  const fighterRows = [a, b].map((f) => {
    const side = sideOf(f);
    const p = per[side];
    const st = result[side];
    const names = Object.keys(f.kit);
    const abilities = names.map((k) => {
      const def = f.kit[k];
      const mine = casts[side].filter((c) => c.skill === k);
      const count = (o) => mine.filter((c) => c.outcome === o).length;
      const hit = count('hit'), miss = count('miss'), evade = count('evade'), whiff = count('whiff'), pending = count('pending');
      const judged = hit + miss + evade + whiff;
      const maxCasts = Math.floor(seconds / def.cooldown) + 1;
      return { name: k, kind: def.kind, uses: mine.length, hit, miss, evade, whiff, pending, judged, maxCasts, dead: mine.length === 0, targeted: JUDGED_KIND(def.kind) };
    });
    const uses = casts[side].length;
    const maxCasts = abilities.reduce((s, x) => s + x.maxCasts, 0);
    const T = Math.max(1, p.aliveTicks);
    const windows = tg[side].windows;
    const responded = windows.filter((w) => w.moved || casts[side].some((c) => c.t >= w.t0 && c.t <= w.t1 + 0.001)).length;
    return {
      key: f.key, side, isPilot: !!f.isPilot,
      win: result.winner === side, draw: result.winner === null,
      hpLeft: st.hpFrac, damageDealt: r1(st.damageDealt), faults: st.faults, thinks: st.thinks,
      casts: uses, castsPer10s: seconds > 0 ? uses / seconds * 10 : 0,
      cdUtil: maxCasts ? uses / maxCasts : 0,
      hit: sum(abilities.map((x) => x.hit)), judged: sum(abilities.map((x) => x.judged)),
      noAct: p.noAct / T, idleReady: p.idleReady / T, idleInRange: p.idleInRange / T, waitingCd: p.waitingCd / T,
      allCd: p.allCd / T, stillNoAct: p.stillNoAct / T,
      slots: abilities.length, dead: abilities.filter((x) => x.dead).length,
      dodges: dodgedBy(side), dodgesAir: dodgedAir[side], dodgesInv: dodgedInv[side], dodgesSide: dodgedSide[side],
      immune: immuneBy[side], immuneRaw: immuneRawBy[side], silenced: refused[side].silenced || 0,
      refused: refused[side],
      telegraphWindows: windows.length, telegraphResponded: responded,
      leadCasts: lead[side].casts, leadLed: lead[side].led,
    };
  });

  const T = Math.max(1, m.ticks);
  return {
    seed, aSide, seconds, ticks: result.ticks, winner: result.winner, reason: result.reason, decidedBy,
    firstHit, firstUse,
    far: m.far / T, brawl: m.brawl / T, meanDist: m.distSum / T,
    bothAllCd: m.bothAllCd / T, bothNoAct: m.bothNoAct / T,
    suddenDeath: seconds > SUDDEN_DEATH_AT, sdFrac: m.sdTicks / T,
    dodgesAir, dodgesInv, dodgesSide, arenaBurned, burnedOut,
    fighters: fighterRows,
  };
}

// ── league: aggregation ──────────────────────────────────────────────────────
/*
 * The refusals broken out by reason, in the order the column prints them.
 *
 * These are the strings `startSkill` writes (`src/core/sim.js`), not names
 * invented here: the full set is unknown / dead / silenced / airborne /
 * stunned / busy / cooldown, and the four below are the ones a mind is
 * responsible for — it asked for something its own state already forbade.
 * The others stay in the `refused` map and in the per-mind row.
 */
const REFUSAL_REASONS = ['cooldown', 'silenced', 'busy', 'airborne'];

function newAgg() {
  return {
    games: 0, wins: 0, draws: 0, losses: 0,
    vsPilots: { games: 0, wins: 0, draws: 0 }, vsMinds: { games: 0, wins: 0, draws: 0 },
    byPilot: {},
    faults: 0, thinks: 0, castsPer10s: [], cdUtil: [], hit: 0, judged: 0, dead: 0, slots: 0,
    noAct: [], idleReady: [], idleInRange: [], waitingCd: [], stillNoAct: [],
    dodges: 0, dodgesAir: 0, dodgesInv: 0, dodgesSide: 0,
    immune: 0, immuneRaw: 0, silenced: 0, refused: {},
    meanDist: [], suddenDeath: 0, seconds: [], damageDealt: [], hpLeft: [],
    telegraphWindows: 0, telegraphResponded: 0, leadCasts: 0, leadLed: 0,
    decidedBy: {},
  };
}

function feed(agg, f, g, opponent) {
  agg.games++;
  if (f.win) agg.wins++; else if (f.draw) agg.draws++; else agg.losses++;
  const bucket = opponent.isPilot ? agg.vsPilots : agg.vsMinds;
  bucket.games++; if (f.win) bucket.wins++; else if (f.draw) bucket.draws++;
  if (opponent.isPilot) {
    const bp = agg.byPilot[opponent.pilotName] ||= { games: 0, wins: 0, draws: 0 };
    bp.games++; if (f.win) bp.wins++; else if (f.draw) bp.draws++;
  }
  agg.faults += f.faults; agg.thinks += f.thinks;
  agg.castsPer10s.push(f.castsPer10s); agg.cdUtil.push(f.cdUtil);
  agg.hit += f.hit; agg.judged += f.judged; agg.dead += f.dead; agg.slots += f.slots;
  for (const k of ['noAct', 'idleReady', 'idleInRange', 'waitingCd', 'stillNoAct']) agg[k].push(f[k]);
  agg.dodges += f.dodges; agg.dodgesAir += f.dodgesAir; agg.dodgesInv += f.dodgesInv; agg.dodgesSide += f.dodgesSide;
  agg.immune += f.immune; agg.immuneRaw += f.immuneRaw; agg.silenced += f.silenced;
  for (const [k, v] of Object.entries(f.refused)) agg.refused[k] = (agg.refused[k] || 0) + v;
  agg.meanDist.push(g.meanDist); if (g.suddenDeath) agg.suddenDeath++; agg.seconds.push(g.seconds);
  agg.damageDealt.push(f.damageDealt); agg.hpLeft.push(f.hpLeft);
  agg.telegraphWindows += f.telegraphWindows; agg.telegraphResponded += f.telegraphResponded;
  agg.leadCasts += f.leadCasts; agg.leadLed += f.leadLed;
  agg.decidedBy[g.decidedBy] = (agg.decidedBy[g.decidedBy] || 0) + 1;
}

function finish(agg) {
  const rate = (b) => (b.games ? b.wins / b.games : null);
  const score = (b) => (b.games ? (b.wins + 0.5 * b.draws) / b.games : null);
  const g = Math.max(1, agg.games);
  return {
    games: agg.games, wins: agg.wins, draws: agg.draws, losses: agg.losses,
    winRate: rate(agg), score: score(agg),
    winRateVsPilots: rate(agg.vsPilots), scoreVsPilots: score(agg.vsPilots), gamesVsPilots: agg.vsPilots.games,
    winRateVsMinds: rate(agg.vsMinds), scoreVsMinds: score(agg.vsMinds), gamesVsMinds: agg.vsMinds.games,
    byPilot: Object.fromEntries(Object.entries(agg.byPilot).map(([k, b]) => [k, { games: b.games, winRate: rate(b), score: score(b) }])),
    faults: agg.faults, faultsPerGame: agg.faults / g, faultShare: agg.thinks ? agg.faults / agg.thinks : 0,
    castsPer10s: mean(agg.castsPer10s), cdUtil: mean(agg.cdUtil),
    hitRate: agg.judged ? agg.hit / agg.judged : null, hits: agg.hit, judged: agg.judged,
    deadSlots: agg.slots ? agg.dead / agg.slots : null, dead: agg.dead, slots: agg.slots,
    noAct: mean(agg.noAct), idleReady: mean(agg.idleReady), idleInRange: mean(agg.idleInRange), waitingCd: mean(agg.waitingCd), stillNoAct: mean(agg.stillNoAct),
    dodgesPerGame: agg.dodges / g, dodges: agg.dodges,
    dodgesAirPerGame: agg.dodgesAir / g, dodgesInvPerGame: agg.dodgesInv / g, dodgesSidePerGame: agg.dodgesSide / g,
    dodgesAir: agg.dodgesAir, dodgesInv: agg.dodgesInv, dodgesSide: agg.dodgesSide,
    immunePerGame: agg.immune / g, immune: agg.immune,
    immuneRawPerGame: agg.immuneRaw / g, immuneRaw: agg.immuneRaw,
    silencedPerGame: agg.silenced / g, silenced: agg.silenced, refused: agg.refused,
    refusedPerGame: Object.fromEntries(REFUSAL_REASONS.map((r) => [r, (agg.refused[r] || 0) / g])),
    meanDist: mean(agg.meanDist), suddenDeathShare: agg.suddenDeath / g, meanSeconds: mean(agg.seconds),
    damageDealt: mean(agg.damageDealt), hpLeft: mean(agg.hpLeft),
    telegraphResponse: agg.telegraphWindows ? agg.telegraphResponded / agg.telegraphWindows : null, telegraphWindows: agg.telegraphWindows,
    leadUsage: agg.leadCasts ? agg.leadLed / agg.leadCasts : null, leadCasts: agg.leadCasts,
    decidedBy: agg.decidedBy,
  };
}

/** Unweighted mean over a model's minds (one per creature); null metrics are skipped. */
function averageRows(rows) {
  const out = {};
  const numeric = ['winRate', 'score', 'winRateVsPilots', 'scoreVsPilots', 'winRateVsMinds', 'scoreVsMinds', 'faultsPerGame', 'faultShare', 'castsPer10s', 'cdUtil', 'hitRate', 'deadSlots', 'noAct', 'idleReady', 'idleInRange', 'waitingCd', 'stillNoAct', 'dodgesPerGame', 'dodgesAirPerGame', 'dodgesInvPerGame', 'dodgesSidePerGame', 'immunePerGame', 'immuneRawPerGame', 'silencedPerGame', 'meanDist', 'suddenDeathShare', 'meanSeconds', 'damageDealt', 'hpLeft', 'telegraphResponse', 'leadUsage'];
  for (const k of numeric) {
    const xs = rows.map((r) => r[k]).filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
    out[k] = xs.length ? mean(xs) : null;
  }
  for (const k of ['games', 'wins', 'draws', 'losses', 'gamesVsPilots', 'gamesVsMinds', 'faults', 'dodges', 'dodgesAir', 'dodgesInv', 'dodgesSide', 'immune', 'immuneRaw', 'silenced', 'telegraphWindows', 'leadCasts', 'hits', 'judged', 'dead', 'slots']) out[k] = sum(rows.map((r) => r[k] || 0));
  /* Per-reason refusals: the rate is averaged over the model's minds like every
     other per-game number, the raw counts are summed like every other count. */
  out.refusedPerGame = Object.fromEntries(REFUSAL_REASONS.map((r) => [r, mean(rows.map((x) => x.refusedPerGame?.[r] ?? 0))]));
  out.refused = rows.reduce((acc, r) => { for (const [k, v] of Object.entries(r.refused || {})) acc[k] = (acc[k] || 0) + v; return acc; }, {});
  return out;
}

// ── league ───────────────────────────────────────────────────────────────────
async function league() {
  const SEEDS = (() => {
    const s = String(arg('seeds', '4'));
    if (s.includes(',')) return s.split(',').map((x) => Number(x.trim())).filter(Number.isFinite);
    const k = Math.max(1, Number(s) || 4);
    return Array.from({ length: k }, (_, i) => i + 1);
  })();
  const PILOT_NAMES = String(arg('pilots', 'stub,kiter,rusher,controller')).split(',').map((s) => s.trim()).filter(Boolean);
  const creatures = loadCreatures(CREATURES_FILE, { required: false });
  const { minds, dropped } = loadMinds(creatures);
  const OUT_MD = join(OUT, 'league.md');
  const OUT_JSON = join(OUT, 'league.json');

  console.log('');
  console.log(`  bakeoff league — ${OUT}`);
  for (const d of dropped) console.log(`    not loaded: ${d.dir}/${d.file} — ${d.why}`);
  if (!minds.length) {
    console.log(`  no admitted minds under ${OUT}${dropped.length ? '' : ' (nothing there at all)'} — run \`node --env-file-if-exists=.env tools/bakeoff.mjs forge --models=… --creatures=${CREATURES_FILE}\` first`);
    console.log('');
    return;
  }
  const pilots = loadPilots(PILOT_NAMES);
  console.log(`  ${minds.length} admitted mind(s) from ${new Set(minds.map((x) => x.model)).size} model(s) on ${new Set(minds.map((x) => x.creatureId)).size} creature(s); pilots ${pilots.map((p) => p.name).join(', ') || 'none'}; seeds ${SEEDS.join(',')}`);
  for (const x of minds) console.log(`    ${x.key.padEnd(44)} ${x.model}`);

  // schedule
  const jobs = [];
  for (let i = 0; i < minds.length; i++) {
    for (let j = i + 1; j < minds.length; j++) {
      for (const seed of SEEDS) {
        jobs.push({ a: minds[i], b: minds[j], seed, aSide: 'blue', kind: minds[i].creatureId === minds[j].creatureId ? 'mirror' : 'cross' });
        jobs.push({ a: minds[i], b: minds[j], seed, aSide: 'orange', kind: minds[i].creatureId === minds[j].creatureId ? 'mirror' : 'cross' });
      }
    }
  }
  for (const x of minds) {
    for (const p of pilots) {
      const twin = { key: `pilot:${p.name}`, name: `pilot:${p.name}`, isPilot: true, pilotName: p.name, kit: x.kit, build: x.build, brain: p.brain, creatureId: x.creatureId };
      for (const seed of SEEDS) {
        jobs.push({ a: x, b: twin, seed, aSide: 'blue', kind: 'pilot' });
        jobs.push({ a: x, b: twin, seed, aSide: 'orange', kind: 'pilot' });
      }
    }
  }
  console.log(`  ${jobs.length} matches: ${jobs.filter((j) => j.kind === 'cross').length} cross, ${jobs.filter((j) => j.kind === 'mirror').length} mirror, ${jobs.filter((j) => j.kind === 'pilot').length} vs pilots`);

  const t0 = Date.now();
  const matches = [];
  const aggs = new Map(minds.map((x) => [x.key, newAgg()]));
  const pilotAggs = new Map();
  let errors = 0;
  jobs.forEach((job, n) => {
    let g;
    try { g = playMatch(job.a, job.b, job.seed, job.aSide); } catch (e) {
      errors++;
      console.error(`  ! ${job.a.key} vs ${job.b.key} seed ${job.seed} (${job.aSide}): ${e.message}`);
      return;
    }
    const [fa, fb] = g.fighters;
    feed(aggs.get(job.a.key), fa, g, job.b);
    if (!job.b.isPilot) feed(aggs.get(job.b.key), fb, g, job.a);
    else {
      const pk = `${job.b.pilotName}|${job.a.key}`;
      if (!pilotAggs.has(pk)) pilotAggs.set(pk, newAgg());
      feed(pilotAggs.get(pk), fb, g, { ...job.a, isPilot: false });
    }
    matches.push({
      kind: job.kind, a: job.a.key, b: job.b.key, seed: job.seed, aSide: job.aSide,
      winner: g.winner === null ? null : (g.winner === job.aSide ? job.a.key : job.b.key),
      reason: g.reason, decidedBy: g.decidedBy, seconds: g.seconds, meanDist: r1(g.meanDist),
      firstHit: g.firstHit, suddenDeath: g.suddenDeath,
      casts: [fa.casts, fb.casts], hits: [fa.hit, fb.hit], faults: [fa.faults, fb.faults],
      dodges: [fa.dodges, fb.dodges], telegraph: [[fa.telegraphResponded, fa.telegraphWindows], [fb.telegraphResponded, fb.telegraphWindows]],
      lead: [[fa.leadLed, fa.leadCasts], [fb.leadLed, fb.leadCasts]],
    });
    if (!QUIET && ((n + 1) % 25 === 0 || n + 1 === jobs.length)) {
      process.stdout.write(`\r  ${n + 1}/${jobs.length} matches, ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
    }
  });
  const wall = Date.now() - t0;
  if (!QUIET) process.stdout.write('\n');
  if (!matches.length) { console.log('  no match finished'); return; }

  // per mind, per model, per creature
  const perMind = minds.map((x) => ({
    key: x.key, model: x.model, modelSlug: x.modelSlug, creatureId: x.creatureId, record: x.record,
    ...finish(aggs.get(x.key)),
  }));
  const models = [...new Set(minds.map((x) => x.model))];
  const perModel = models.map((model) => {
    const rows = perMind.filter((r) => r.model === model);
    return { model, modelSlug: rows[0].modelSlug, minds: rows.length, creatures: rows.map((r) => r.creatureId), ...averageRows(rows) };
  });
  const byPilotsThenAll = (p, q) => (q.winRateVsPilots ?? -1) - (p.winRateVsPilots ?? -1) || (q.scoreVsPilots ?? -1) - (p.scoreVsPilots ?? -1) || (q.winRate ?? -1) - (p.winRate ?? -1);
  perModel.sort(byPilotsThenAll);
  const creatureIds = [...new Set(minds.map((x) => x.creatureId))];
  const perCreature = creatureIds.map((cid) => {
    const rows = perMind.filter((r) => r.creatureId === cid).sort(byPilotsThenAll);
    return { creatureId: cid, best: rows[0]?.model ?? null, rows: rows.map((r) => ({ model: r.model, winRateVsPilots: r.winRateVsPilots, winRate: r.winRate, score: r.score, hitRate: r.hitRate, telegraphResponse: r.telegraphResponse, leadUsage: r.leadUsage })) };
  });
  const pilotRows = [...pilotAggs.entries()].map(([pk, agg]) => { const [pilot, mind] = pk.split('|'); return { pilot, vsMind: mind, ...finish(agg) }; });

  // console
  const pad = (s, n) => String(s).padEnd(n);
  const rp = (s, n) => String(s).padStart(n);
  /** `total (air + i-frame + side-step)` — the three ways a dodge is made. */
  const dodgeCell = (r) => `${fix(r.dodgesPerGame, 2)} (${fix(r.dodgesAirPerGame, 2)} + ${fix(r.dodgesInvPerGame, 2)} + ${fix(r.dodgesSidePerGame, 2)})`;
  /** The four refusal reasons of the column head, per game, in that order. */
  const refusedCell = (r) => REFUSAL_REASONS.map((k) => fix(r.refusedPerGame?.[k] ?? 0, 2)).join(' / ');
  console.log('');
  console.log(`  ${matches.length} matches in ${(wall / 1000).toFixed(1)} s${errors ? `, ${errors} errored` : ''}`);
  console.log('');
  console.log(`  ${pad('model', 36)} ${rp('minds', 5)} ${rp('vsPil', 6)} ${rp('vsMind', 6)} ${rp('win', 5)} ${rp('hit', 5)} ${rp('cst/10', 6)} ${rp('cdUtil', 6)} ${rp('idleRng', 7)} ${rp('dead', 5)} ${rp('dodge', 5)} ${rp('tele', 5)} ${rp('lead', 5)} ${rp('flt/g', 6)} ${rp('dist', 5)} ${rp('SD', 4)} ${rp('len', 5)}`);
  for (const r of perModel) {
    console.log(`  ${pad(r.model.slice(0, 36), 36)} ${rp(r.minds, 5)} ${rp(pct(r.winRateVsPilots), 6)} ${rp(pct(r.winRateVsMinds), 6)} ${rp(pct(r.winRate), 5)} ${rp(pct(r.hitRate), 5)} ${rp(fix(r.castsPer10s, 2), 6)} ${rp(pct(r.cdUtil), 6)} ${rp(pct(r.idleInRange), 7)} ${rp(pct(r.deadSlots), 5)} ${rp(fix(r.dodgesPerGame, 2), 5)} ${rp(pct(r.telegraphResponse), 5)} ${rp(pct(r.leadUsage), 5)} ${rp(fix(r.faultsPerGame, 2), 6)} ${rp(fix(r.meanDist, 1), 5)} ${rp(pct(r.suddenDeathShare), 4)} ${rp(fix(r.meanSeconds, 1), 5)}`);
  }
  console.log('');
  console.log(`  ${pad('mind', 44)} ${rp('games', 5)} ${rp('W-D-L', 9)} ${rp('vsPil', 6)} ${rp('vsMind', 6)} ${rp('hit', 5)} ${rp('tele', 5)} ${rp('lead', 5)} ${rp('flt', 4)}`);
  for (const r of perMind.slice().sort(byPilotsThenAll)) {
    console.log(`  ${pad(r.key.slice(0, 44), 44)} ${rp(r.games, 5)} ${rp(`${r.wins}-${r.draws}-${r.losses}`, 9)} ${rp(pct(r.winRateVsPilots), 6)} ${rp(pct(r.winRateVsMinds), 6)} ${rp(pct(r.hitRate), 5)} ${rp(pct(r.telegraphResponse), 5)} ${rp(pct(r.leadUsage), 5)} ${rp(r.faults, 4)}`);
  }
  console.log('');

  // markdown
  const head = git('rev-parse --short HEAD');
  const md = [];
  md.push('# Model bake-off — league');
  md.push('');
  md.push(`Generated by \`tools/bakeoff.mjs league\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} (HEAD ${head}) — ${minds.length} admitted minds from ${models.length} model(s) on ${creatureIds.length} creature(s); ${matches.length} matches (${matches.filter((g) => g.kind === 'cross').length} cross-creature, ${matches.filter((g) => g.kind === 'mirror').length} mirror, ${matches.filter((g) => g.kind === 'pilot').length} vs pilots), seeds ${SEEDS.join(', ')}, both sides per seed, single process, ${(wall / 1000).toFixed(1)} s wall.`);
  md.push('');
  md.push(`Pilots: ${pilots.map((p) => `\`${p.name}\``).join(', ') || 'none'}. Constants: MATCH_SECONDS ${MATCH_SECONDS}, SUDDEN_DEATH_AT ${SUDDEN_DEATH_AT}, TICK_HZ ${TICK_HZ}.`);
  md.push('');
  md.push(`Re-run: \`node tools/bakeoff.mjs league --out=${OUT} --seeds=${SEEDS.join(',')} --pilots=${PILOT_NAMES.join(',')}\``);
  md.push('');
  md.push('## Minds');
  md.push('');
  md.push('| model | creature | kit | cost | forge time | tries | source chars |');
  md.push('|---|---|---|---|---|---|---|');
  for (const x of minds) {
    md.push(`| ${x.model} | ${x.creatureId} | ${x.kitJson.map(describe).join(' · ')} | ${x.record.costUsd === null ? '—' : usd(x.record.costUsd)} | ${x.record.elapsedMs === null ? '—' : `${(x.record.elapsedMs / 1000).toFixed(0)} s`} | ${x.record.tries ?? '—'} | ${x.record.sourceChars} |`);
  }
  if (dropped.length) {
    md.push('');
    md.push('Not in the league: ' + dropped.map((d) => `\`${d.dir}/${d.file}\` (${d.why})`).join('; ') + '.');
  }
  md.push('');
  md.push('## Per model');
  md.push('');
  md.push('Averaged over the model\'s minds (one per creature, unweighted); sorted by win rate against the pilot panel. `vs pilots` is the yardstick — a scripted mind holding the identical kit and body.');
  md.push('');
  md.push('| model | minds | win vs pilots | score vs pilots | win vs minds | win overall | hit rate | casts/10 s | cd util | idle+in reach | dead slots | dodges/game (air + i-frame + side-step) | telegraph resp. | lead usage | faults/game | immune/game (raw) | refused/game: cooldown / silenced / busy / airborne | mean dist m | sudden death | mean len s |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of perModel) {
    md.push(`| ${r.model} | ${r.minds} | ${pct(r.winRateVsPilots)} | ${pct(r.scoreVsPilots)} | ${pct(r.winRateVsMinds)} | ${pct(r.winRate)} | ${pct(r.hitRate)} | ${fix(r.castsPer10s, 2)} | ${pct(r.cdUtil)} | ${pct(r.idleInRange)} | ${pct(r.deadSlots)} | ${dodgeCell(r)} | ${pct(r.telegraphResponse)} | ${pct(r.leadUsage)} | ${fix(r.faultsPerGame, 2)} | ${fix(r.immunePerGame, 2)} (${fix(r.immuneRawPerGame, 2)}) | ${refusedCell(r)} | ${fix(r.meanDist, 1)} | ${pct(r.suddenDeathShare)} | ${fix(r.meanSeconds, 1)} |`);
  }
  md.push('');
  md.push('## Per mind');
  md.push('');
  md.push('| mind | model | creature | games | W-D-L | win vs pilots | ' + pilots.map((p) => `vs ${p.name}`).join(' | ') + (pilots.length ? ' | ' : '') + 'win vs minds | hit rate | casts/10 s | cd util | idle+in reach | dead slots | dodges/game (air + i-frame + side-step) | telegraph resp. | lead usage | faults | immune (raw) | refused/game: cooldown / silenced / busy / airborne | mean dist m | sudden death | mean len s | dmg dealt/game |');
  md.push('|---|---|---|---|---|---|' + pilots.map(() => '---|').join('') + '---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of perMind.slice().sort(byPilotsThenAll)) {
    md.push(`| ${r.key} | ${r.model} | ${r.creatureId} | ${r.games} | ${r.wins}-${r.draws}-${r.losses} | ${pct(r.winRateVsPilots)} | ${pilots.map((p) => pct(r.byPilot[p.name]?.winRate)).join(' | ')}${pilots.length ? ' | ' : ''}${pct(r.winRateVsMinds)} | ${pct(r.hitRate)} | ${fix(r.castsPer10s, 2)} | ${pct(r.cdUtil)} | ${pct(r.idleInRange)} | ${r.dead}/${r.slots} | ${dodgeCell(r)} | ${pct(r.telegraphResponse)} (${r.telegraphWindows}) | ${pct(r.leadUsage)} (${r.leadCasts}) | ${r.faults} | ${r.immune} (${r.immuneRaw}) | ${refusedCell(r)} | ${fix(r.meanDist, 1)} | ${pct(r.suddenDeathShare)} | ${fix(r.meanSeconds, 1)} | ${fix(r.damageDealt, 1)} |`);
  }
  md.push('');
  md.push('## Per creature');
  md.push('');
  md.push('Which model made the best mind for which creature — win rate vs pilots (win rate overall in brackets); the best per row in bold.');
  md.push('');
  md.push('| creature | ' + models.map((mo) => mo).join(' | ') + ' | best |');
  md.push('|---|' + models.map(() => '---|').join('') + '---|');
  for (const c of perCreature) {
    const cells = models.map((mo) => {
      const r = c.rows.find((x) => x.model === mo);
      if (!r) return '—';
      const cell = `${pct(r.winRateVsPilots)} (${pct(r.winRate)})`;
      return mo === c.best ? `**${cell}**` : cell;
    });
    md.push(`| ${c.creatureId} | ${cells.join(' | ')} | ${c.best ?? '—'} |`);
  }
  if (pilotRows.length) {
    md.push('');
    md.push('## The pilots, for reference');
    md.push('');
    md.push('The same numbers for the pilot holding each mind\'s kit and body against that mind — so a mind\'s row above can be read against what a scripted hand did with the very same equipment.');
    md.push('');
    md.push('| pilot | vs mind | games | W-D-L | hit rate | casts/10 s | idle+in reach | dodges/game | telegraph resp. | lead usage |');
    md.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const r of pilotRows.sort((p, q) => p.pilot.localeCompare(q.pilot) || p.vsMind.localeCompare(q.vsMind))) {
      md.push(`| ${r.pilot} | ${r.vsMind} | ${r.games} | ${r.wins}-${r.draws}-${r.losses} | ${pct(r.hitRate)} | ${fix(r.castsPer10s, 2)} | ${pct(r.idleInRange)} | ${fix(r.dodgesPerGame, 2)} | ${pct(r.telegraphResponse)} | ${pct(r.leadUsage)} |`);
    }
  }
  md.push('');
  md.push('## Definitions');
  md.push('');
  md.push('- **win vs pilots / vs minds / overall** — wins ÷ games (draws count as neither); **score** counts a draw as half. Every pairing is played on both sides of the arena for every seed.');
  md.push('- **hit rate** — connected casts ÷ judged casts (targeted shapes and fields; self, blink and leap are not judged), as in `reports/combat/spectate.mjs`: a connected cast is an `impact` fx with a targeted atom or a `damage`/`ignite` line between the `use` and the slot\'s next `use`; a `miss` line (with its reason) or an `evade` line is a miss.');
  md.push('- **casts/10 s**, **cd util** (casts ÷ what the cooldowns alone would have allowed), **dead slots** (abilities never used in a match), **mean dist**, **sudden death** (share of matches that ran past the burn), **mean len** — all as spectate.mjs computes them.');
  md.push('- **idle+in reach** — the share of a fighter\'s ALIVE ticks with no act running while at least one READY ability\'s TRUE reach already covered the enemy. The reach is centre to centre with BOTH radii in it, exactly as `src/brain/prompt.js` prints it on the kit card and `tools/checkbehaviour.mjs` verifies it by binary search: beam `own r + 0.2 + range + enemy r + 0.4`, cone `range + enemy r`, bolt `own r + 0.3 + flight + enemy r + 0.35` (flight = range rounded up to whole ticks), mortar `range + splash + enemy r`, field `range + radius + enemy r`, lunge `distance + own r + enemy r`; shapes with no hit distance (aura, blink, leap) are not counted. Until 07.09 this column used `range + own radius`, which under-counted it by 0.4–2.3 m of reach.');
  md.push(`- **dodges/game** — three ways to make one, credited to the body that made it and printed as \`total (air + i-frame + side-step)\`: a \`miss\` line with reason \`airborne\` (the shot passed under a leap), an \`evade\` line (blink i-frames swallowed it), and a **side-step** — a bolt or mortar \`miss\` with reason \`aim\` where the target was crossing the shot line faster than ${SIDESTEP_MPS} m/s at the moment of the miss (the component of its velocity perpendicular to the caster→target line, from the tick's own snapshot). Counted per log line.`);
  md.push('- **immune (raw)** — `immune` log lines whose `by` is this side and whose ability carries NO damage and NO burn atom: a control riding a landed damage cast is not a wasted decision, and the raw count beside it is every `immune` line, filtered or not, so the two definitions can be read against each other. The atoms come from the caster\'s compiled kit; a fixture skill is read from `SKILLS` in `src/core/config.js` and one with damage counts as damage.');
  md.push('- **refused/game** — `refused` log lines by reason, in the sim\'s own strings (`startSkill` in `src/core/sim.js`): `cooldown` (the tile had not come back), `silenced`, `busy` (an act was already running), `airborne`. The rarer `stunned` / `dead` / `unknown` stay in `league.json`.');
  md.push(`- **telegraph resp.** — of the opponent\'s wind-up windows (ticks where the opponent\'s \`actPhase\` is \`windup\`, at least ${MIN_WINDOW_TICKS} ticks long so there was a thought inside it), the share in which this mind turned its velocity by more than ${Math.round((TURN_RAD * 180) / Math.PI)}°, stopped or started moving, or started an ability inside the window. Read it next to dodges: a mind that circles fast registers as responding to long wind-ups whether it noticed them or not. The window count is in brackets in the per-mind table.`);
  md.push(`- **lead usage** — of this mind\'s bolt and mortar casts fired while the enemy was moving faster than ${LEAD_MIN_SPEED} m/s, the share whose aim was more than ${Math.round((LEAD_RAD * 180) / Math.PI)}° off the direct bearing to the enemy at that tick (a bolt flies along the caster\'s heading, the fx record\'s \`h\`; a mortar toward its landing point \`x1/z1\`). "—" means the kit has no bolt or mortar, or the enemy never moved while one was fired. The cast count is in brackets.`);
  md.push('- **faults/game** — thoughts that threw or timed out.');
  md.push('');
  md.push('## Method');
  md.push('');
  md.push(`- Minds: every \`<out>/<model>/<creature>.json\` with \`admitted: true\` and a \`.js\` beside it; the kit and body come from the record (falling back to \`${CREATURES_FILE}\`). Brains are compiled once with \`compileBrain\` and \`reset()\` before every match; kits with \`compileKit\`; bodies with \`normalizeBuild\`.`);
  md.push('- (a) every pair of minds, cross-creature and mirror alike, each mind with its own creature\'s kit and body; (b) every mind against each pilot of the panel holding the SAME kit and body. Each pairing is played on both sides for every seed. Single process, `runMatch` from `src/core/match.js`.');
  md.push('- Tick metrics come from `onFrame` snapshots; event metrics from `result.log` and from `impact`/`bolt`/`lob` entries in the frame\'s `fx` list.');
  md.push('');
  mkdirp(OUT);
  writeFileSync(OUT_MD, md.join('\n'));
  writeFileSync(OUT_JSON, JSON.stringify({
    args: { out: OUT, seeds: SEEDS, pilots: pilots.map((p) => p.name), creatures: CREATURES_FILE, head },
    constants: { MATCH_SECONDS, SUDDEN_DEATH_AT, TICK_HZ, FAR_M, BRAWL_M, MIN_WINDOW_TICKS, turnDeg: (TURN_RAD * 180) / Math.PI, leadDeg: (LEAD_RAD * 180) / Math.PI, leadMinSpeed: LEAD_MIN_SPEED },
    minds: minds.map((x) => ({ key: x.key, model: x.model, modelSlug: x.modelSlug, creatureId: x.creatureId, kit: x.kitJson, build: x.build, record: x.record })),
    dropped,
    perModel, perMind, perCreature, pilots: pilotRows,
    matches,
  }, null, 1));
  console.log(`  wrote ${OUT_MD} and ${OUT_JSON}\n`);
}

// ── main ─────────────────────────────────────────────────────────────────────
if (SUB === 'forge') await forge();
else if (SUB === 'league') await league();
else {
  console.error('usage:\n  node --env-file-if-exists=.env tools/bakeoff.mjs forge --models=<a,b,…> --creatures=<file> [--out=dir] [--budget=6] [--request-budget=3.2] [--force] [--dry]\n  node tools/bakeoff.mjs league [--out=dir] [--seeds=4] [--pilots=stub,kiter,rusher,controller] [--creatures=<file>] [--quiet]');
  process.exit(SUB ? 1 : 0);
}
