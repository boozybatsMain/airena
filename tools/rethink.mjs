/**
 * rethink — rewrite the MIND of every ladder creature for the 07.09 world and
 * keep everything else it owns.
 *
 *   AIRENA_SUB_MODELS=1 node --env-file-if-exists=.env tools/rethink.mjs \
 *       [--bundle=sub:opus:plain] [--only=id1,id2] [--limit=N] [--dry] [--force] [--report]
 *
 * Why this exists. The ability grammar, the cooldowns and the mind prompt were
 * overhauled on 07.09 (docs/COMBAT.md, DESIGN.md D186–D193). Every mind on the
 * local ladder was written against the old numbers — measured: 61 of 77
 * kitted brains compare `dist` with a copied constant — so the ladder is
 * fought by programs that believe in a world that no longer exists. The
 * product already has the exact door for this: the REFACTOR (F3) changes
 * `brain_source`, `brain_model`, `constants_version` and the tactics card, and
 * nothing else. This tool walks that door for the whole ladder.
 *
 * What it does, per creature, in rating order:
 *
 *   1. selects `state='active' AND kit_active=1 AND brain_source IS NOT NULL`
 *      whose `brain_model` is neither the kit stub nor a hand-written pilot;
 *   2. compiles the creature's OWN kit (`compileKit`) and its OWN body
 *      (`normalizeBuild`; a null `build_json` is the default body, exactly as
 *      the simulation reads it);
 *   3. asks the bundle for a mind with the production prompt (`forgeBrain`,
 *      the same `callWithRepair` door the server uses);
 *   4. runs the production admission (`admit`: static analysis, fuel
 *      instrumentation, four trial fights against the hand-written gorilla
 *      stub — the candidate on `blue`, as in `forgeCreature`);
 *   5. if admitted: writes the tactics card (`tacticsCard`) and applies
 *      `refactor(db, id, {...})` with `brainModel` = the bundle id and
 *      `constantsVersion` = `constantsVersion()`. Rating, history, kit, build,
 *      name and body are untouched by construction (creatures.js).
 *      If rejected: the creature keeps its old mind and the reason is recorded.
 *
 * Reports go to reports/combat/rethink/:
 *
 *   <id>.json        before/after model and constants version, admitted,
 *                    stage, problems, probe (the four trial fights), elapsed,
 *                    tries, usage, prompt hash
 *   <id>.before.js   the mind that was replaced — the undo for this row
 *   <id>.js          the candidate the model wrote (admitted or not)
 *   REPORT.md        one table over every <id>.json, rewritten at the end
 *
 * A creature whose <id>.json already says `admitted: true` is skipped unless
 * --force, so a run that was cut short can simply be run again. A creature
 * whose constants_version is already the current one is skipped too: it was
 * born or refactored in this world and has nothing to rethink.
 *
 * Subscription bundles only. OpenRouter has no credit on the founder's key
 * (D192) and a bake-off is not what this is; `sub:<opus|fable|sonnet>:<plain|
 * think|high>` through the local `claude` binary, which needs
 * AIRENA_SUB_MODELS=1. Nothing here costs money by the meter.
 *
 * Concurrency: the dev server keeps fighting on the same database (WAL); each
 * refactor is one UPDATE under `busy_timeout`, and the arena loop reads
 * `brain_source` per match, so a rewritten mind fights from its next match.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractSource } from '../src/brain/host.js';
import { BUILD_BUDGET, normalizeBuild } from '../src/core/config.js';
import { constantsVersion } from '../src/core/version.js';
import { openDb } from '../src/server/db.js';
import { refactor } from '../src/server/creatures.js';
import { SUB_EFFORT, SUB_FAMILIES, SUB_PREFIX, subChannelOpen } from '../src/server/forge/subscription.js';
import { compileKit } from '../src/skills/compile.js';
import { KIT_BUDGET, costOf, describe, validateKit } from '../src/skills/registry.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'reports/combat/rethink');
const DB_FILE = join(ROOT, 'data/airena.db');
/* `brains/kit-stub/`, not `brains/stub/` (D191 §1): `admit()` now hands the
   sparring side the CANDIDATE'S OWN kit, and the plain stub calls abilities
   by fixture names (`smash`, `charge`) that a grammar kit does not have;
   `kit-stub` reads its skills from perception instead. */
const SPARRING_FILE = join(ROOT, 'brains/kit-stub/gorilla.js');

/** Minds that are not the product's: the kit stub and the hand-written pilots. */
const NOT_A_MODEL = ['kit-stub', 'рукописный эталон'];
/** The candidate sits on `blue` and spars the gorilla stub, exactly as `forgeCreature` does. */
const CANDIDATE_SIDE = 'blue';

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  if (i >= 0) return true;
  return def;
};
const BUNDLE_ID = String(arg('bundle', 'sub:opus:plain'));
const ONLY = String(arg('only', '')).split(',').map((s) => s.trim()).filter(Boolean);
const LIMIT = Number(arg('limit', 0)) || 0;
const DRY = !!arg('dry', false);
const FORCE = !!arg('force', false);
/** `--report` rebuilds REPORT.md from the <id>.json files and asks nothing of anyone. */
const REPORT_ONLY = !!arg('report', false);

// ── helpers ──────────────────────────────────────────────────────────────────
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const mkdirp = (dir) => { try { mkdirSync(dir, { recursive: true }); } catch { /* exists */ } };
const secs = (ms) => `${(ms / 1000).toFixed(0)} s`;
const promptText = (messages) => messages.map((m) => `[${m.role}]\n${m.content}`).join('\n\n');
const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const parseJson = (s, dflt) => { try { const v = JSON.parse(s); return v ?? dflt; } catch { return dflt; } };
const cell = (s) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * One bundle, built the way `tools/bakeoff.mjs` builds a subscription row —
 * effort from the mode, no think budget, no price — and nothing else: an
 * OpenRouter id is refused here rather than resolved (D192).
 */
function resolveBundle(id) {
  if (!id.startsWith(SUB_PREFIX)) {
    throw new Error(`"${id}" is not a subscription bundle — this tool speaks only sub:<opus|fable|sonnet>:<plain|think|high> (OpenRouter has no credit, D192)`);
  }
  const [, family, mode] = id.split(':');
  const f = SUB_FAMILIES[family];
  if (!f) throw new Error(`unknown subscription family "${family}" (${Object.keys(SUB_FAMILIES).join(', ')})`);
  const effort = SUB_EFFORT[mode];
  if (!effort) throw new Error(`unknown mode "${mode}" (${Object.keys(SUB_EFFORT).join(', ')})`);
  return {
    bundle: id, modelId: `${SUB_PREFIX}${family}`, mode, channel: 'sub',
    label: f.label, thinkLabel: { plain: 'quick', think: 'deep', high: 'deep' }[mode], thinkBudget: 0,
    maxTokens: 64_000, effort, creatureUsd: 0, estBrainUsd: 0, measuredBrain: false,
    tier: 'sub', price: null,
  };
}

// ── plan ─────────────────────────────────────────────────────────────────────
function loadCandidates(db) {
  const rows = db.prepare(`
    SELECT id, name, owner_id, is_library, rating, fights, wins, losses, draws,
           brain_model, constants_version, kit_json, build_json, tactics_card,
           length(brain_source) AS source_chars
    FROM creature
    WHERE state = 'active' AND kit_active = 1 AND brain_source IS NOT NULL
      AND brain_model NOT IN (${NOT_A_MODEL.map(() => '?').join(',')})
    ORDER BY rating DESC, id
  `).all(...NOT_A_MODEL);
  const current = constantsVersion();
  const plan = [];
  for (const r of rows) {
    if (ONLY.length && !ONLY.includes(r.id)) continue;
    const item = { row: r, skip: null, kit: null, defs: null, build: null, kitCost: null, buildCost: null };
    const prior = readJson(join(OUT, `${r.id}.json`));
    if (prior?.admitted === true && !FORCE) item.skip = `done (${prior.after?.model || prior.model || 'rewritten'}, ${new Date(prior.generatedAt).toISOString().slice(0, 16)})`;
    else if (r.constants_version === current && !FORCE) item.skip = `current (${r.brain_model} already carries ${current})`;
    item.prior = prior;

    const kit = parseJson(r.kit_json, null);
    if (!Array.isArray(kit) || !kit.length) { item.skip = item.skip || 'no kit in kit_json'; item.kitProblem = 'no kit'; }
    else {
      const bad = validateKit(kit);
      const compiled = bad.length ? { defs: null, problems: bad } : compileKit(kit);
      if (compiled.problems.length) {
        item.kitProblem = JSON.stringify(compiled.problems).slice(0, 200);
        item.skip = item.skip || `kit does not compile: ${item.kitProblem}`;
      } else {
        item.kit = kit; item.defs = compiled.defs; item.kitCost = sum(kit.map(costOf));
      }
    }
    const nb = normalizeBuild(parseJson(r.build_json, null));
    item.build = nb.build; item.buildCost = nb.cost; item.squeezed = nb.squeezed;
    plan.push(item);
  }
  return plan;
}

/*
 * ── THE REPAIR TURN ON A BEHAVIOUR REJECTION (D191 §2) ──────────────────────
 *
 * Same door bakeoff.mjs uses (`forgeBrain`'s `callWithRepair`), same reason:
 * `admit()`'s sixth wall (`sandbox/index.js`) measures whether the mind won,
 * idled with a ready ability in reach, stood still or barely cast, and a
 * failure there went straight to a kept-old-mind rejection — same as a
 * syntax error would. `review-r1-minds.md`, "the repair loop never reports
 * behaviour": these are facts about the trial fights just played, not a
 * verdict, and one more turn is exactly the tool for a fact the model has
 * not seen yet. Facts only, no tactics, and only the measures that actually
 * failed their threshold.
 */
const pct = (v) => `${Math.round(Math.min(v, 9.99) * 100)}%`;
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

// ── one creature ─────────────────────────────────────────────────────────────
async function rethinkOne(db, item, bundle, tools) {
  const { forgeBrain, tacticsCard, admit, callWithRepair, sparring } = tools;
  const r = item.row;
  const started = Date.now();
  const record = {
    id: r.id, name: r.name, rating: Math.round(r.rating), fights: r.fights, isLibrary: !!r.is_library,
    bundle: bundle.bundle, modelId: bundle.modelId, effort: bundle.effort,
    before: { model: r.brain_model, constantsVersion: r.constants_version, sourceChars: r.source_chars, tacticsCard: r.tactics_card },
    after: null,
    kit: item.kit, kitCost: item.kitCost, build: item.build, buildCost: item.buildCost,
    admitted: false, applied: false, stage: null, problems: [], probe: null,
    elapsedMs: null, forgeMs: null, admitMs: null, cardMs: null,
    tries: null, usage: null, referenceUsd: null, resolvedModel: null, sourceChars: null, promptHash: null,
    generatedAt: new Date().toISOString(),
    /* A retried rejection keeps its earlier verdicts: the file is the record. */
    previous: item.prior
      ? [...(item.prior.previous || []), { generatedAt: item.prior.generatedAt, admitted: item.prior.admitted, stage: item.prior.stage, problems: item.prior.problems }]
      : [],
  };
  const save = () => {
    record.elapsedMs = Date.now() - started;
    writeFileSync(join(OUT, `${r.id}.json`), JSON.stringify(record, null, 2));
  };

  /* The undo, written BEFORE anything is asked of the model: the old mind on
     disk beside the report, and its checksum in the record. */
  const oldSource = db.prepare('SELECT brain_source FROM creature WHERE id = ?').get(r.id)?.brain_source;
  if (typeof oldSource !== 'string') {
    record.stage = 'select'; record.problems = [{ code: 'gone', message: 'the creature has no brain_source any more' }];
    save(); return record;
  }
  record.before.sourceSha = sha256(oldSource);
  /* `<id>.before.js` is the FIRST mind this tool ever replaced for the row —
     the one from the old world — and is never overwritten: a forced re-run
     replaces a mind this tool wrote, and that one is parked under its own
     checksum so the original undo survives. */
  const beforeFile = join(OUT, `${r.id}.before.js`);
  if (!existsSync(beforeFile)) writeFileSync(beforeFile, oldSource);
  else if (readFileSync(beforeFile, 'utf8') !== oldSource) {
    const parked = join(OUT, `${r.id}.before.${record.before.sourceSha.slice(0, 8)}.js`);
    if (!existsSync(parked)) writeFileSync(parked, oldSource);
    record.before.file = parked;
  }

  // 3. the mind
  let captured = null; let lastRaw = null;
  const call = async (o) => {
    captured = o.messages;
    const out = await callWithRepair(o);
    lastRaw = out;
    return out;
  };
  const notes = [];
  const onAttempt = (t) => { if (!t.ok) notes.push(`attempt ${t.attempt + 1} rejected${t.error ? ` (${t.error})` : ''}, ${t.chars} chars, ${secs(t.elapsedMs)}`); };
  let brain;
  const tForge = Date.now();
  try {
    brain = await forgeBrain({ bundle, kit: item.defs, call, onAttempt, builds: { own: item.build, enemy: null } });
  } catch (e) {
    record.forgeMs = Date.now() - tForge;
    record.stage = 'forge';
    record.tries = e.tries || null;
    record.problems = [{ code: e.code || 'error', message: String(e.message || e).slice(0, 400), cause: e.cause ? String(e.cause.message || e.cause).slice(0, 400) : null }];
    record.promptHash = captured ? sha256(promptText(captured)) : null;
    save(); return { ...record, notes };
  }
  record.forgeMs = Date.now() - tForge;
  record.tries = brain.tries || null; record.usage = brain.usage || null;
  record.referenceUsd = lastRaw?.referenceUsd ?? null; record.resolvedModel = lastRaw?.resolvedModel ?? null;
  record.sourceChars = brain.source.length;
  record.promptHash = captured ? sha256(promptText(captured)) : null;
  record.candidateSha = sha256(brain.source);
  writeFileSync(join(OUT, `${r.id}.js`), brain.source);

  // 4. admission
  const tAdmit = Date.now();
  let v;
  try { v = await admit(brain.source, CANDIDATE_SIDE, { sparring, kit: item.defs }); }
  catch (e) { v = { ok: false, stage: 'admit', problems: [{ code: e.code || 'admit', message: String(e.message || e).slice(0, 400) }], probe: null }; }

  /* One repair turn on a behaviour rejection, before the old mind is kept —
     D191 §2, the same door as `forgeBrain`'s own `callWithRepair`. */
  if (!v.ok && v.problems?.[0]?.code === 'behaviour' && v.behaviour && captured) {
    const repairText = behaviourRepairMessage(v.behaviour, (v.probe || []).length);
    notes.push(`behaviour rejection — one repair turn: ${repairText}`);
    try {
      const r2 = await callWithRepair({
        modelId: bundle.modelId, effort: bundle.effort, maxTokens: bundle.maxTokens, thinkBudget: bundle.thinkBudget,
        messages: [...captured, { role: 'user', content: repairText }],
        accept: (t) => { try { return extractSource(t).length > 200; } catch { return false; } },
        attempts: 1,
      });
      const repairedSource = extractSource(r2.text);
      let v2;
      try { v2 = await admit(repairedSource, CANDIDATE_SIDE, { sparring, kit: item.defs }); }
      catch (e) { v2 = { ok: false, stage: 'admit', problems: [{ code: e.code || 'admit', message: String(e.message || e).slice(0, 400) }], probe: null }; }
      record.repair = {
        attempted: true, message: repairText, costUsd: r2.costUsd || 0,
        admitted: !!v2.ok, problems: v2.ok ? [] : (v2.problems || []),
      };
      if (v2.ok) {
        brain = { ...brain, source: repairedSource };
        v = v2;
        writeFileSync(join(OUT, `${r.id}.js`), brain.source);
        record.candidateSha = sha256(brain.source);
        record.sourceChars = brain.source.length;
      }
    } catch (e) {
      record.repair = { attempted: true, message: repairText, costUsd: 0, admitted: false, error: String(e.message || e).slice(0, 300) };
    }
  }

  record.admitMs = Date.now() - tAdmit;
  record.admitted = !!v.ok; record.stage = v.stage; record.problems = v.problems || []; record.probe = v.probe || null; record.behaviour = v.behaviour || null;
  if (!v.ok) { save(); return { ...record, notes }; }

  // 5. the card, then the refactor — F3: mind, model, version, card; nothing else
  const tCard = Date.now();
  const cardOut = await tacticsCard({ source: brain.source, bundle, call });
  record.cardMs = Date.now() - tCard;
  record.card = cardOut.text;
  if (!cardOut.text) notes.push('no tactics card (the old one is kept)');

  const after = refactor(db, r.id, {
    brainSource: brain.source, brainModel: bundle.bundle,
    constantsVersion: constantsVersion(), tacticsCard: cardOut.text,
  });
  /* `after` is read back from the row, not assumed: the record says what the
     database says. */
  record.applied = after?.brain_source === brain.source && after?.brain_model === bundle.bundle;
  record.after = {
    model: after?.brain_model ?? null, constantsVersion: after?.constants_version ?? null,
    sourceChars: after?.brain_source?.length ?? null, tacticsCard: after?.tactics_card ?? null,
    rating: after ? Math.round(after.rating) : null, fights: after?.fights ?? null,
    kitUntouched: after?.kit_json === r.kit_json, buildUntouched: after?.build_json === r.build_json, nameUntouched: after?.name === r.name,
  };
  if (!record.applied) { record.problems = [{ code: 'apply', message: 'refactor() did not land — the row does not carry the new mind' }]; }
  save();
  return { ...record, notes };
}

// ── report ───────────────────────────────────────────────────────────────────
function writeReport({ bundle, runElapsedMs, runCounts, commands }) {
  const recs = readdirSync(OUT).filter((f) => f.endsWith('.json')).map((f) => readJson(join(OUT, f))).filter((x) => x && x.id);
  recs.sort((a, b) => (b.rating - a.rating) || a.id.localeCompare(b.id));
  const won = (p) => (p || []).filter((x) => x.winner === CANDIDATE_SIDE).length;
  const hits = (p) => sum((p || []).map((x) => x.hits || 0));
  const rewritten = recs.filter((x) => x.applied);
  const rejected = recs.filter((x) => !x.applied);
  const byReason = {};
  for (const x of rejected) {
    const k = `${x.stage || '?'}: ${(x.problems || []).map((p) => p.code).join(',') || '—'}`;
    byReason[k] = (byReason[k] || 0) + 1;
  }
  const lines = [];
  lines.push('# Rethink — minds rewritten for the 07.09 world, kits kept');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} · bundle \`${bundle.bundle}\` (${bundle.label}, effort ${bundle.effort}) · constants now \`${constantsVersion()}\``);
  lines.push('');
  lines.push(`Per creature: compile its own kit and body → \`forgeBrain\` with the production prompt → \`admit\` (static analysis, fuel, four trial fights vs the gorilla stub on \`blue\`) → \`tacticsCard\` → \`refactor()\` (F3: mind, model, constants version, card; rating, history, kit, build, name and body untouched). A rejected mind leaves its creature exactly as it was; the replaced mind of every rewritten creature is beside its report as \`<id>.before.js\`.`);
  lines.push('');
  const thisRun = runElapsedMs > 0 ? ` · this run: ${runCounts.done} rewritten, ${runCounts.rejected} rejected, ${runCounts.skipped} skipped, ${(runElapsedMs / 60000).toFixed(1)} min wall` : '';
  const redone = recs.filter((x) => x.previous?.length);
  lines.push(`**${rewritten.length} rewritten, ${rejected.length} rejected** over ${recs.length} creatures with a report${thisRun} · model time in all reports ${(sum(recs.map((x) => x.elapsedMs || 0)) / 60000).toFixed(1)} min${redone.length ? ` · ${redone.length} re-done with --force (${redone.map((x) => `${x.name} → ${x.bundle}`).join(', ')})` : ''}`);
  if (rejected.length) {
    lines.push('');
    lines.push('Rejections by reason: ' + Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} × \`${k}\``).join(', '));
  }
  lines.push('');
  lines.push('| # | creature | rating | old model | new model | admitted | trial fights won / hits | elapsed |');
  lines.push('|--:|---|--:|---|---|---|---|--:|');
  recs.forEach((x, i) => {
    const p = x.probe;
    const trial = p ? `${won(p)} / ${p.length} won · ${hits(p)} hits` : '—';
    const adm = x.applied ? 'yes' : (x.admitted ? 'yes, not applied' : `no — ${x.stage || '?'}: ${(x.problems || []).map((q) => q.code).join(', ') || '?'}`);
    lines.push(`| ${i + 1} | ${cell(x.name)} \`${x.id}\`${x.isLibrary ? ' (library)' : ''} | ${x.rating} | ${cell(x.before?.model)} \`${cell(x.before?.constantsVersion)}\` | ${x.applied ? `${cell(x.after?.model)} \`${cell(x.after?.constantsVersion)}\`` : 'kept'} | ${cell(adm)} | ${trial} | ${x.elapsedMs != null ? secs(x.elapsedMs) : '—'} |`);
  });
  if (rejected.length) {
    lines.push('');
    lines.push('## Rejected — why');
    lines.push('');
    for (const x of rejected) {
      const why = (x.problems || []).map((q) => `${q.code}: ${q.message}`).join('; ') || '—';
      const p = x.probe;
      lines.push(`- **${cell(x.name)}** \`${x.id}\` — at \`${x.stage || '?'}\`: ${cell(why)}${p ? ` (trial fights: won ${won(p)}/${p.length}, hits ${hits(p)}, uses ${sum(p.map((q) => q.uses || 0))}, faults ${sum(p.map((q) => q.faults || 0))})` : ''}${x.previous?.length ? ` · earlier: ${x.previous.map((h) => `${h.stage}:${(h.problems || []).map((q) => q.code).join(',')}`).join(' → ')}` : ''}`);
    }
  }
  lines.push('');
  lines.push('## How to run');
  lines.push('');
  lines.push('```');
  for (const c of commands) lines.push(c);
  lines.push('```');
  lines.push('');
  lines.push('A creature whose report says `admitted: true` is skipped on the next run unless `--force`; a rejected one is tried again. `--dry` prints the plan and writes nothing. To undo one creature, write `<id>.before.js` back with `refactor()` and the model/version from `before` in its report.');
  lines.push('');
  writeFileSync(join(OUT, 'REPORT.md'), lines.join('\n'));
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  let bundle;
  try { bundle = resolveBundle(BUNDLE_ID); } catch (e) { console.error(`\n  ${e.message}\n`); process.exit(1); }
  const subOpen = subChannelOpen();
  if (REPORT_ONLY) {
    if (!existsSync(OUT)) { console.error(`\n  nothing to report: ${OUT} does not exist\n`); process.exit(1); }
    writeReport({ bundle, runElapsedMs: 0, runCounts: { done: 0, rejected: 0, skipped: 0 }, commands: [
      `AIRENA_SUB_MODELS=1 node --env-file-if-exists=.env tools/rethink.mjs --bundle=${bundle.bundle}`,
      'node --env-file-if-exists=.env tools/rethink.mjs --dry            # the plan only',
      'node --env-file-if-exists=.env tools/rethink.mjs --report         # rebuild REPORT.md from the reports on disk',
      'AIRENA_SUB_MODELS=1 node --env-file-if-exists=.env tools/rethink.mjs --only=c_xxx --force   # redo one',
    ] });
    console.log(`\n  REPORT.md rebuilt from ${readdirSync(OUT).filter((f) => f.endsWith('.json')).length} report(s) → ${join(OUT, 'REPORT.md')}\n`);
    return;
  }
  const db = openDb(DB_FILE);
  const current = constantsVersion();

  const plan = loadCandidates(db);
  let todo = plan.filter((p) => !p.skip);
  if (LIMIT > 0) todo = todo.slice(0, LIMIT);
  const todoIds = new Set(todo.map((p) => p.row.id));

  console.log('');
  console.log(`  rethink${DRY ? ' — DRY RUN, nothing is asked and nothing is written' : ''}`);
  console.log(`  bundle ${bundle.bundle} (${bundle.label}, effort ${bundle.effort}) · constants now ${current} · db ${DB_FILE}`);
  console.log(`  out ${OUT}`);
  console.log('');
  console.log(`  plan: ${plan.length} candidate(s)${ONLY.length ? ` of --only=${ONLY.join(',')}` : ''}, ${todo.length} to rethink, ${plan.length - todo.length} skipped${FORCE ? ' (--force)' : ''}${LIMIT ? `, --limit=${LIMIT}` : ''}`);
  for (const p of plan) {
    const r = p.row;
    const what = todoIds.has(r.id) ? 'rethink' : `skip   `;
    const why = todoIds.has(r.id) ? '' : `  — ${p.skip || `beyond --limit=${LIMIT}`}`;
    const kitLine = p.kit ? `kit ${String(p.kitCost).padStart(2)}/${KIT_BUDGET} body ${p.buildCost}/${BUILD_BUDGET}${p.squeezed ? ` (squeezed ${p.squeezed})` : ''}  ${p.kit.map(describe).join(' | ')}` : `kit: ${p.kitProblem}`;
    console.log(`    ${what}  ${String(Math.round(r.rating)).padStart(4)}  ${r.id}  ${String(r.name).padEnd(18)} ${String(r.brain_model).padEnd(30)} ${r.constants_version}${r.is_library ? '  library' : ''}${why}`);
    if (todoIds.has(r.id)) console.log(`              ${kitLine}`);
  }
  console.log('');
  if (DRY) { db.close(); return; }
  if (!todo.length) { console.log('  nothing to rethink'); db.close(); return; }
  if (!subOpen) {
    console.error('  ! the subscription channel is off — run with AIRENA_SUB_MODELS=1 and the local `claude` binary (src/brain/claude.js CLAUDE_BIN)\n');
    db.close(); process.exit(1);
  }

  mkdirp(OUT);
  /* Imported only now: pipeline.js reads the stub brains and pulls the body
     forge in with it, and the sandbox spawns isolates — none of that is
     needed to print a plan. */
  const [{ forgeBrain, tacticsCard }, { admit }, { callWithRepair }] = await Promise.all([
    import('../src/server/forge/pipeline.js'),
    import('../src/server/sandbox/index.js'),
    import('../src/server/forge/llm.js'),
  ]);
  const tools = { forgeBrain, tacticsCard, admit, callWithRepair, sparring: readFileSync(SPARRING_FILE, 'utf8') };

  const t0 = Date.now();
  const counts = { done: 0, rejected: 0, skipped: plan.length - todo.length };
  let n = 0;
  for (const item of todo) {
    n += 1;
    const r = item.row;
    const head = `  [${String(n).padStart(2)}/${todo.length}] ${String(r.name).padEnd(18)} ${r.id}  ${String(Math.round(r.rating)).padStart(4)}  ${r.brain_model} → ${bundle.bundle}`;
    /* One line per creature. On a terminal the line is opened now and finished
       in place; in a captured log it is printed once, complete. */
    const tty = !!process.stdout.isTTY;
    if (tty) process.stdout.write(`${head}  …`);
    let rec;
    try { rec = await rethinkOne(db, item, bundle, tools); }
    catch (e) {
      /* Nothing outside the model call and the admission is expected to throw;
         if something does, the creature is left alone and the run goes on. */
      rec = { applied: false, admitted: false, stage: 'tool', problems: [{ code: e.code || 'tool', message: String(e.message || e).slice(0, 400) }], elapsedMs: 0, notes: [] };
      try {
        writeFileSync(join(OUT, `${r.id}.json`), JSON.stringify({
          id: r.id, name: r.name, rating: Math.round(r.rating), bundle: bundle.bundle,
          before: { model: r.brain_model, constantsVersion: r.constants_version }, after: null,
          admitted: false, applied: false, stage: 'tool', problems: rec.problems, probe: null, elapsedMs: 0,
          generatedAt: new Date().toISOString(),
        }, null, 2));
      } catch { /* the console line still says what happened */ }
    }
    const p = rec.probe || [];
    let tail;
    if (rec.applied) {
      counts.done += 1;
      tail = `REWRITTEN  won ${p.filter((x) => x.winner === CANDIDATE_SIDE).length}/${p.length}, hits ${sum(p.map((x) => x.hits || 0))}, faults ${sum(p.map((x) => x.faults || 0))}  ${rec.sourceChars} chars  ${secs(rec.elapsedMs)}${rec.card ? '' : '  (no card)'}`;
    } else {
      counts.rejected += 1;
      const why = (rec.problems || []).map((x) => `${x.code}: ${x.message}`).join('; ').slice(0, 220);
      tail = `${rec.admitted ? 'NOT APPLIED' : 'REJECTED'} at ${rec.stage || '?'}: ${why}${p.length ? `  (won ${p.filter((x) => x.winner === CANDIDATE_SIDE).length}/${p.length}, hits ${sum(p.map((x) => x.hits || 0))}, uses ${sum(p.map((x) => x.uses || 0))})` : ''}  ${secs(rec.elapsedMs || 0)}`;
    }
    process.stdout.write(`${tty ? '\r' : ''}${head}  ${tail}${rec.notes?.length ? `  [${rec.notes.join('; ')}]` : ''}\n`);
  }
  const runElapsedMs = Date.now() - t0;
  const commands = [
    `AIRENA_SUB_MODELS=1 node --env-file-if-exists=.env tools/rethink.mjs --bundle=${bundle.bundle}${ONLY.length ? ` --only=${ONLY.join(',')}` : ''}${LIMIT ? ` --limit=${LIMIT}` : ''}${FORCE ? ' --force' : ''}`,
    'node --env-file-if-exists=.env tools/rethink.mjs --dry            # the plan only',
    'AIRENA_SUB_MODELS=1 node --env-file-if-exists=.env tools/rethink.mjs --only=c_xxx --force   # redo one',
  ];
  writeReport({ bundle, runElapsedMs, runCounts: counts, commands });
  console.log('');
  console.log(`  done: ${counts.done} rewritten, ${counts.rejected} rejected, ${counts.skipped} skipped in ${(runElapsedMs / 60000).toFixed(1)} min → ${join(OUT, 'REPORT.md')}`);
  console.log('');
  db.close();
}

main().catch((e) => { console.error(`\n  rethink failed: ${e.stack || e}\n`); process.exit(1); });
