/**
 * Spectator-metrics baseline.
 *
 * What a person watching a fight actually sees: how long it lasts, how often
 * anybody casts, how much of the clock both bodies spend with nothing to do
 * because every ability is on cooldown, how far apart they stand, how many
 * hits are dodged, how many fights the arena has to finish by burning.
 *
 * Single process, no worker pool, no server, no browser. Re-run after the
 * cooldown/weights overhaul with the same arguments and diff the two reports.
 * The ladder keeps moving while the server runs, so "top N" is not a stable
 * set: the report prints the ids it used, and `--ids` replays exactly those.
 *
 *   node reports/combat/spectate.mjs                     top 6 creatures, 12 pairs, seeds 1..3
 *   node reports/combat/spectate.mjs --n 8 --seeds 5     top 8, seeds 1..5
 *   node reports/combat/spectate.mjs --seeds 11,23,42    explicit seeds
 *   node reports/combat/spectate.mjs --pairs 20          cap the number of matchups
 *   node reports/combat/spectate.mjs --ids c_a,c_b,c_c   these creatures, not the top of the ladder
 *   node reports/combat/spectate.mjs --out path.md --json path.json        (default: spectator-latest.md)
 *   node reports/combat/spectate.mjs --src /some/snapshot/src --label 'HEAD 8699fb6'   fight on another source tree
 *
 * Definitions (per fighter, per match, over every tick the fighter is alive
 * and the match is not over):
 *   noAct        act === null (not winding up, striking, dashing, airborne or recovering)
 *   idleReady    act === null AND at least one ability off cooldown        (the lead's definition)
 *   idleInRange  act === null AND a READY ability's TRUE reach (centre to centre,
 *                BOTH radii in it — `reachOf` below) already covers the enemy
 *   waitingCd    act === null AND every ability on cooldown                 ("standing around waiting")
 *   allCd        every ability on cooldown, whatever the body is doing
 *   stillNoAct   act === null AND speed < 0.3 m/s (literally standing)
 *   casts/10s    `use` log lines per 10 s of match
 *   cdUtil       casts ÷ casts the cooldowns alone would have allowed over the match length
 * Per cast (targeted deliveries and zones):
 *   hit          an `impact` fx (effects applied on the enemy) or a `damage`/`ignite` log line — shields included
 *   absorbed     hit, but no `damage` line: the shield ate all of it, the crowd saw nothing move
 *   miss         `miss` log line, with its reason (range / aim / cover / airborne)
 *   evade        `evade` log line (i-frames — reason 'invulnerable' on the caster's side)
 *   whiff        a zone that touched nobody before the bell
 * Per match:
 *   bothAllCd    both fighters have every ability on cooldown at the same tick
 *   far/brawl    centre distance > 12 m / < 4 m
 *   dodges       miss:airborne + evade + side-step (a bolt or mortar miss:aim
 *                whose target was crossing the shot line faster than 2 m/s)
 *   immune       `immune` lines on casts carrying NO damage and NO burn atom —
 *                a control riding a landed damage cast bought something; the
 *                raw count of every immune line is reported beside it
 *   refused      `refused` lines by the sim's own reason strings, with
 *                cooldown / silenced / busy / airborne broken out per game
 *   suddenDeath  match ran past SUDDEN_DEATH_AT
 *   decidedBy    what actually ended it: an opponent's hit, the arena's burn, fire, the clock
 */

import { DatabaseSync } from 'node:sqlite';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

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
const N = Number(arg('n', 6));
const PAIRS = Number(arg('pairs', 12));
const SEEDS = (() => {
  const s = String(arg('seeds', '3'));
  if (s.includes(',')) return s.split(',').map((x) => Number(x.trim())).filter(Number.isFinite);
  const k = Math.max(1, Number(s) || 3);
  return Array.from({ length: k }, (_, i) => i + 1);
})();
const IDS = arg('ids', null) ? String(arg('ids')).split(',').map((s) => s.trim()).filter(Boolean) : null;
const DB_FILE = String(arg('db', join(ROOT, 'data/airena.db')));
/*
 * Default output is `spectator-latest.md`, NOT `spectator-baseline.md`: the
 * baseline document is the frozen pre-overhaul measurement plus its
 * hand-written analysis, and a casual re-run must not overwrite it. Name a
 * run with `--out` (and `--json`) to keep it.
 */
const OUT_MD = String(arg('out', join(HERE, 'spectator-latest.md')));
const OUT_JSON = arg('json', null) ? String(arg('json')) : null;
const QUIET = !!arg('quiet', false);
const TITLE = String(arg('title', 'Spectator baseline — what a fight looks like from the stands'));

const FAR_M = Number(arg('far', 12));
const BRAWL_M = Number(arg('brawl', 4));
const STILL_MPS = 0.3;
const BUCKET_S = 5;

/*
 * `--src <dir>` — which source tree fights. Default: the live `src/`. The
 * baseline was measured on a `git archive HEAD src` snapshot while the
 * overhaul was landing uncommitted in the working tree, so that "before" and
 * "after" are two runs of one script over two trees, not one script over a
 * tree that changed between matches.
 */
const SRC = arg('src', null) ? resolve(String(arg('src'))) : join(ROOT, 'src');
const LABEL = arg('label', null) ? String(arg('label')) : null;
const mod = (p) => import(pathToFileURL(join(SRC, p)).href);
const { compileBrain } = await mod('brain/host.js');
const { runMatch } = await mod('core/match.js');
const { compileKit } = await mod('skills/compile.js');
const {
  BEAM_RADIUS, DT, MATCH_SECONDS, PROJECTILE_MUZZLE, PROJECTILE_TOUCH, SKILLS,
  SUDDEN_DEATH_AT, TICK_HZ, normalizeBuild,
} = await mod('core/config.js');
const { DAMAGING, DELIVERIES, EFFECTS } = await mod('skills/registry.js');
const git = (cmd) => { try { return execSync(`git -C ${JSON.stringify(ROOT)} ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return '?'; } };
const PROVENANCE = (() => {
  const head = git('rev-parse --short HEAD');
  const dirty = git('status --porcelain -- src').split('\n').filter(Boolean).length;
  const live = SRC === join(ROOT, 'src');
  return `${LABEL ? `${LABEL} — ` : ''}source ${live ? 'live working tree' : SRC} (HEAD ${head}${live ? `, ${dirty} modified file(s) under src/` : ''})`;
})();

// ── creatures ────────────────────────────────────────────────────────────────
const db = new DatabaseSync(DB_FILE, { readOnly: true });
const COLS = 'id, name, brain_model, rating, fights, wins, losses, draws, kit_json, build_json, brain_source';
let rows;
if (IDS) {
  const q = db.prepare(`SELECT ${COLS} FROM creature WHERE id = ?`);
  rows = IDS.map((id) => q.get(id)).filter(Boolean);
} else {
  rows = db.prepare(`SELECT ${COLS} FROM creature
    WHERE state = 'active' AND kit_active = 1 AND brain_source IS NOT NULL AND kit_json IS NOT NULL
    ORDER BY rating DESC LIMIT ?`).all(N);
}
db.close();
if (rows.length < 2) { console.error('need at least two creatures'); process.exit(1); }

const other = (id) => (id === 'blue' ? 'orange' : 'blue');
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const pct = (v) => `${(v * 100).toFixed(0)}%`;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
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
/** `src/core/config.js` — read by `deliver.js` at the release and touch tests. */
const BOLT_MUZZLE = PROJECTILE_MUZZLE, BOLT_TOUCH = PROJECTILE_TOUCH;
/** `src/core/config.js` BEAM_RADIUS — the beam's half-width in `deliver.js`. */
const BEAM_MARGIN = BEAM_RADIUS;
/** The one term with no name in the config: a bare 0.2 in `deliver.js`'s beam. */
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
 * and logging that as a wasted decision is what made this report read 9–18
 * "immune" a game (`review-r1-pace.md` L1: 0.00 of 17.0 per match were casts
 * with nothing but control on them). So an immune line counts only when the
 * refusing cast carries NO damage and NO burn atom — then, and only then, the
 * whole cast bought nothing. The raw count is kept and printed beside it.
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
/*
 * The refusals broken out by reason, in the order the columns print them.
 * These are the strings `startSkill` writes (`src/core/sim.js`), not names
 * invented here: the full set is unknown / dead / silenced / airborne /
 * stunned / busy / cooldown. The rest still show in the `refused` column.
 */
const REFUSAL_REASONS = ['cooldown', 'silenced', 'busy', 'airborne'];

const nameCount = {};
for (const r of rows) nameCount[r.name] = (nameCount[r.name] || 0) + 1;

const fighters = rows.map((r) => {
  let kitJson;
  try { kitJson = JSON.parse(r.kit_json); } catch { kitJson = null; }
  const kit = compileKit(kitJson || []);
  if (kit.problems.length) console.error(`  ! ${r.name} (${r.id}): kit does not compile: ${JSON.stringify(kit.problems)}`);
  let buildRaw = null;
  try { buildRaw = r.build_json ? JSON.parse(r.build_json) : null; } catch { buildRaw = null; }
  const build = normalizeBuild(buildRaw).build;
  let brain = null;
  try { brain = compileBrain(r.brain_source, `${r.name}`); } catch (e) {
    console.error(`  ! ${r.name} (${r.id}): brain does not compile: ${e.message}`);
  }
  const name = nameCount[r.name] > 1 ? `${r.name}·${r.id.slice(2, 6)}` : r.name;
  return {
    id: r.id, name, model: r.brain_model || '?', rating: r.rating,
    record: `${r.wins}-${r.losses}-${r.draws}`, hasBuild: !!buildRaw,
    kitJson, kit: kit.problems.length ? null : kit.defs, build, brain,
  };
}).filter((f) => f.kit && f.brain);

if (fighters.length < 2) { console.error('fewer than two creatures compile'); process.exit(1); }

// ── matchups: every pair among the chosen fighters, in ladder order, capped ──
const pairs = [];
for (let i = 0; i < fighters.length && pairs.length < PAIRS; i++) {
  for (let j = i + 1; j < fighters.length && pairs.length < PAIRS; j++) pairs.push([i, j]);
}

// ── one match ────────────────────────────────────────────────────────────────
function skillLabel(def) {
  const d = DELIVERIES[def.kind];
  return `${d?.ru || def.kind}: ${def.effects.map((e) => e.id).join('+')}`;
}

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
  /** Connected hits seen in the frame stream, per side and slot: [t, ...]. */
  const impacts = { blue: {}, orange: {} };
  /* One row per tick — where the two bodies were and how they were moving.
     The side-step test below needs it: a `miss` log line carries the time and
     nothing else, and the lateral speed that made the shot miss lives in the
     snapshot (`snapshot()` reports the smoothed rvx/rvz as vx/vz). */
  const frameAt = new Map();

  const onFrame = (s) => {
    frameAt.set(s.t.toFixed(3), {
      blue: { x: s.blue.x, z: s.blue.z, vx: s.blue.vx, vz: s.blue.vz },
      orange: { x: s.orange.x, z: s.orange.z, vx: s.orange.vx, vz: s.orange.vz },
    });
    for (const fx of s.fx) {
      if (fx.kind !== 'impact' || fx.blocked) continue;
      if (!fx.effects || !fx.effects.some(TARGETED_ATOM)) continue;
      (impacts[fx.who][fx.skill] ||= []).push(fx.t);
    }
    if (s.over) return;
    m.ticks++;
    const dx = s.blue.x - s.orange.x, dz = s.blue.z - s.orange.z;
    const dist = Math.hypot(dx, dz);
    m.distSum += dist;
    if (dist > FAR_M) m.far++;
    if (dist < BRAWL_M) m.brawl++;
    if (s.t >= SUDDEN_DEATH_AT) m.sdTicks++;
    const allCd = {};
    const noAct = {};
    for (const side of ['blue', 'orange']) {
      const f = s[side];
      const p = per[side];
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
  const log = result.log;
  const seconds = result.seconds;

  // ── events per slot, then one outcome per cast ──
  const events = { blue: {}, orange: {} };
  const casts = { blue: [], orange: [] };
  const refused = { blue: {}, orange: {} };
  const buckets = new Array(Math.ceil(MATCH_SECONDS / BUCKET_S)).fill(0);
  let firstHit = null, firstDamage = null, firstUse = null;
  let dodgesAir = 0, dodgesInv = 0, dodgesSide = 0, burnedOut = 0, arenaBurned = 0, heals = 0, walls = 0, ignites = 0, shieldsBroke = 0;
  /* Filtered (the cast carried no damage and no burn) and raw, side by side,
     so the change to the definition can be audited from the report itself. */
  let immune = 0, immuneRaw = 0;
  /* Dodges, credited to the body that made them, by the three ways to make one. */
  const dodgedAir = { blue: 0, orange: 0 };
  const dodgedInv = { blue: 0, orange: 0 };
  const dodgedSide = { blue: 0, orange: 0 };
  const immuneBy = { blue: 0, orange: 0 };
  const immuneRawBy = { blue: 0, orange: 0 };

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
    const def = kits[ev.who] ? kits[ev.who][ev.skill] : null;
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
        buckets[Math.min(buckets.length - 1, Math.floor(ev.t / BUCKET_S))]++;
        break;
      case 'damage':
        if (firstDamage === null) firstDamage = ev.t;
        push(ev.who, ev.skill, ev.t, 'damage');
        break;
      case 'ignite':
        ignites++;
        if (firstDamage === null) firstDamage = ev.t;
        push(ev.who, ev.skill, ev.t, 'hit');
        break;
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
      case 'refused':
        refused[ev.who][ev.reason] = (refused[ev.who][ev.reason] || 0) + 1;
        break;
      case 'heal': heals++; break;
      case 'wall': walls++; break;
      case 'shieldBroke': shieldsBroke++; break;
      case 'immune': {
        immuneRaw++;
        if (immuneRawBy[ev.by] !== undefined) immuneRawBy[ev.by]++;
        const def = kits[ev.by] ? kits[ev.by][ev.skill] : null;
        if (!carriesDamage(def, ev.skill)) {
          immune++;
          if (immuneBy[ev.by] !== undefined) immuneBy[ev.by]++;
        }
        break;
      }
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
  const hitTimes = [];
  for (const side of ['blue', 'orange']) for (const c of casts[side]) if (c.outcome === 'hit') hitTimes.push(c.t);
  firstHit = hitTimes.length ? Math.min(...hitTimes) : null;

  // ── what ended it ──
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
      const absorbed = mine.filter((c) => c.absorbed).length;
      const judged = hit + miss + evade + whiff;
      const maxCasts = Math.floor(seconds / def.cooldown) + 1;
      return {
        name: k, label: skillLabel(def), kind: def.kind, cooldown: r2(def.cooldown), cost: def.cost,
        uses: mine.length, hit, absorbed, miss, evade, whiff, pending, judged,
        hitRate: judged ? hit / judged : null,
        targeted: JUDGED_KIND(def.kind),
        maxCasts, dead: mine.length === 0,
        missReasons: mine.filter((c) => c.reason).reduce((acc, c) => { acc[c.reason] = (acc[c.reason] || 0) + 1; return acc; }, {}),
      };
    });
    const uses = casts[side].length;
    const maxCasts = abilities.reduce((s, x) => s + x.maxCasts, 0);
    const T = Math.max(1, p.aliveTicks);
    return {
      id: f.id, name: f.name, model: f.model, side,
      hpLeft: st.hpFrac, damageDealt: r1(st.damageDealt), faults: st.faults, thinks: st.thinks,
      casts: uses, castsPer10s: seconds > 0 ? uses / seconds * 10 : 0,
      cdUtil: maxCasts ? uses / maxCasts : 0,
      noAct: p.noAct / T, idleReady: p.idleReady / T, idleInRange: p.idleInRange / T, waitingCd: p.waitingCd / T,
      allCd: p.allCd / T, stillNoAct: p.stillNoAct / T,
      abilities, dead: abilities.filter((x) => x.dead).map((x) => x.name),
      refused: refused[side],
      /* Credited to the body that made them, and to the caster for immune. */
      dodges: dodgedAir[side] + dodgedInv[side] + dodgedSide[side],
      dodgesAir: dodgedAir[side], dodgesInv: dodgedInv[side], dodgesSide: dodgedSide[side],
      immune: immuneBy[side], immuneRaw: immuneRawBy[side],
    };
  });

  const T = Math.max(1, m.ticks);
  return {
    seed, aSide, seconds, ticks: result.ticks, winner: result.winner, reason: result.reason, decidedBy,
    winnerName: result.winner ? (result.winner === aSide ? a.name : b.name) : null,
    firstHit, firstDamage, firstUse,
    far: m.far / T, brawl: m.brawl / T, meanDist: m.distSum / T,
    bothAllCd: m.bothAllCd / T, bothNoAct: m.bothNoAct / T,
    suddenDeath: seconds > SUDDEN_DEATH_AT, sdFrac: m.sdTicks / T,
    dodgesAir, dodgesInv, dodgesSide, dodges: dodgesAir + dodgesInv + dodgesSide,
    burnedOut, arenaBurned, heals, walls, ignites, shieldsBroke, immune, immuneRaw,
    buckets,
    fighters: fighterRows,
  };
}

// ── run ──────────────────────────────────────────────────────────────────────
const t0 = Date.now();
const matches = [];
for (const [i, j] of pairs) {
  const a = fighters[i], b = fighters[j];
  SEEDS.forEach((seed, k) => {
    const aSide = k % 2 === 0 ? 'blue' : 'orange';
    let g;
    try { g = playMatch(a, b, seed, aSide); } catch (e) {
      console.error(`  ! ${a.name} vs ${b.name} seed ${seed}: ${e.message}`);
      return;
    }
    g.a = a.name; g.b = b.name; g.aId = a.id; g.bId = b.id;
    matches.push(g);
    if (!QUIET) {
      process.stdout.write(`  ${a.name.padEnd(18)} vs ${b.name.padEnd(18)} seed ${String(seed).padStart(3)}  ${String(g.seconds.toFixed(1)).padStart(5)}s  ${(g.winnerName || 'draw').padEnd(18)} ${g.reason}/${g.decidedBy}\n`);
    }
  });
}
const wall = Date.now() - t0;
if (!matches.length) { console.error('no match finished'); process.exit(1); }

// ── aggregates ───────────────────────────────────────────────────────────────
const allF = matches.flatMap((g) => g.fighters);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const withHit = matches.filter((g) => g.firstHit !== null);
const withDmg = matches.filter((g) => g.firstDamage !== null);
const agg = {
  matches: matches.length,
  seconds: { mean: mean(matches.map((g) => g.seconds)), median: median(matches.map((g) => g.seconds)), min: Math.min(...matches.map((g) => g.seconds)), max: Math.max(...matches.map((g) => g.seconds)) },
  firstHit: { mean: mean(withHit.map((g) => g.firstHit)), median: median(withHit.map((g) => g.firstHit)), none: matches.length - withHit.length },
  firstDamage: { mean: mean(withDmg.map((g) => g.firstDamage)), median: median(withDmg.map((g) => g.firstDamage)), none: matches.length - withDmg.length },
  firstUse: { mean: mean(matches.filter((g) => g.firstUse !== null).map((g) => g.firstUse)) },
  castsPer10s: { mean: mean(allF.map((f) => f.castsPer10s)), median: median(allF.map((f) => f.castsPer10s)) },
  castsPerFighter: { mean: mean(allF.map((f) => f.casts)), median: median(allF.map((f) => f.casts)) },
  cdUtil: mean(allF.map((f) => f.cdUtil)),
  noAct: mean(allF.map((f) => f.noAct)),
  idleReady: mean(allF.map((f) => f.idleReady)),
  idleInRange: mean(allF.map((f) => f.idleInRange)),
  waitingCd: mean(allF.map((f) => f.waitingCd)),
  allCd: mean(allF.map((f) => f.allCd)),
  stillNoAct: mean(allF.map((f) => f.stillNoAct)),
  bothAllCd: mean(matches.map((g) => g.bothAllCd)),
  bothNoAct: mean(matches.map((g) => g.bothNoAct)),
  far: mean(matches.map((g) => g.far)),
  brawl: mean(matches.map((g) => g.brawl)),
  meanDist: mean(matches.map((g) => g.meanDist)),
  suddenDeath: matches.filter((g) => g.suddenDeath).length,
  sdFrac: mean(matches.map((g) => g.sdFrac)),
  dodgesAir: sum(matches.map((g) => g.dodgesAir)),
  dodgesInv: sum(matches.map((g) => g.dodgesInv)),
  dodgesSide: sum(matches.map((g) => g.dodgesSide)),
  dodges: sum(matches.map((g) => g.dodges)),
  arenaBurned: sum(matches.map((g) => g.arenaBurned)),
  burnedOut: sum(matches.map((g) => g.burnedOut)),
  heals: sum(matches.map((g) => g.heals)),
  walls: sum(matches.map((g) => g.walls)),
  ignites: sum(matches.map((g) => g.ignites)),
  shieldsBroke: sum(matches.map((g) => g.shieldsBroke)),
  immune: sum(matches.map((g) => g.immune)),
  immuneRaw: sum(matches.map((g) => g.immuneRaw)),
  reasons: matches.reduce((acc, g) => { acc[g.reason] = (acc[g.reason] || 0) + 1; return acc; }, {}),
  decidedBy: matches.reduce((acc, g) => { acc[g.decidedBy] = (acc[g.decidedBy] || 0) + 1; return acc; }, {}),
  deadSlots: sum(allF.map((f) => f.dead.length)),
  slots: sum(allF.map((f) => f.abilities.length)),
  refused: allF.reduce((acc, f) => { for (const [k, v] of Object.entries(f.refused)) acc[k] = (acc[k] || 0) + v; return acc; }, {}),
  faults: sum(allF.map((f) => f.faults)),
  buckets: matches[0].buckets.map((_, i) => mean(matches.map((g) => g.buckets[i]))),
  bucketsAlive: matches[0].buckets.map((_, i) => matches.filter((g) => g.seconds > i * BUCKET_S).length),
};
const totalCasts = sum(allF.map((f) => f.casts));
const judged = allF.flatMap((f) => f.abilities).reduce((acc, x) => { acc.hit += x.hit; acc.absorbed += x.absorbed; acc.miss += x.miss; acc.evade += x.evade; acc.whiff += x.whiff; acc.pending += x.pending; acc.judged += x.judged; return acc; }, { hit: 0, absorbed: 0, miss: 0, evade: 0, whiff: 0, pending: 0, judged: 0 });
const missReasons = allF.flatMap((f) => f.abilities).reduce((acc, x) => { for (const [k, v] of Object.entries(x.missReasons)) acc[k] = (acc[k] || 0) + v; return acc; }, {});

// per-creature roll-up
const byCreature = new Map();
for (const f of allF) {
  if (!byCreature.has(f.id)) byCreature.set(f.id, { id: f.id, name: f.name, model: f.model, games: 0, wins: 0, draws: 0, casts: [], castsPer10s: [], cdUtil: [], noAct: [], idleReady: [], idleInRange: [], waitingCd: [], allCd: [], stillNoAct: [], abilities: {}, refused: {}, faults: 0,
    dodges: 0, dodgesAir: 0, dodgesInv: 0, dodgesSide: 0, immune: 0, immuneRaw: 0 });
  const c = byCreature.get(f.id);
  c.games++;
  for (const k of ['casts', 'castsPer10s', 'cdUtil', 'noAct', 'idleReady', 'idleInRange', 'waitingCd', 'allCd', 'stillNoAct']) c[k].push(f[k]);
  c.faults += f.faults;
  for (const k of ['dodges', 'dodgesAir', 'dodgesInv', 'dodgesSide', 'immune', 'immuneRaw']) c[k] += f[k];
  for (const [k, v] of Object.entries(f.refused)) c.refused[k] = (c.refused[k] || 0) + v;
  for (const ab of f.abilities) {
    const x = c.abilities[ab.name] || (c.abilities[ab.name] = { label: ab.label, kind: ab.kind, cooldown: ab.cooldown, cost: ab.cost, targeted: ab.targeted, uses: 0, hit: 0, absorbed: 0, miss: 0, evade: 0, whiff: 0, pending: 0, judged: 0, maxCasts: 0, deadGames: 0, missReasons: {} });
    for (const k of ['uses', 'hit', 'absorbed', 'miss', 'evade', 'whiff', 'pending', 'judged', 'maxCasts']) x[k] += ab[k];
    if (ab.dead) x.deadGames++;
    for (const [k, v] of Object.entries(ab.missReasons)) x.missReasons[k] = (x.missReasons[k] || 0) + v;
  }
}
for (const g of matches) {
  for (const f of g.fighters) {
    const c = byCreature.get(f.id);
    if (g.winner === null) c.draws++;
    else if (g.winner === f.side) c.wins++;
  }
}

// ── print ────────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
const fmtReasons = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ') || '—';
/** The four reasons of REFUSAL_REASONS as counts per fighter per game, in that order. */
const refusedPerGame = (map, fighterGames) => REFUSAL_REASONS
  .map((k) => ((map[k] || 0) / Math.max(1, fighterGames)).toFixed(2)).join(' / ');
const lines = [];
lines.push('');
lines.push(`  ${matches.length} matches, ${pairs.length} matchups, seeds ${SEEDS.join(',')}, ${(wall / 1000).toFixed(1)} s wall`);
lines.push(`  ${PROVENANCE}`);
lines.push('');
lines.push(`  ${pad('match', 46)} ${rpad('len', 6)} ${rpad('1st hit', 8)} ${rpad('casts', 6)} ${rpad('far', 5)} ${rpad('brawl', 6)} ${rpad('bothCd', 7)} ${rpad('dodge', 6)} ${rpad('SD', 3)}  result`);
for (const g of matches) {
  const c = sum(g.fighters.map((f) => f.casts));
  lines.push(`  ${pad(`${g.a} vs ${g.b} #${g.seed}`, 46)} ${rpad(g.seconds.toFixed(1), 6)} ${rpad(g.firstHit === null ? '—' : g.firstHit.toFixed(1), 8)} ${rpad(c, 6)} ${rpad(pct(g.far), 5)} ${rpad(pct(g.brawl), 6)} ${rpad(pct(g.bothAllCd), 7)} ${rpad(g.dodges, 6)} ${rpad(g.suddenDeath ? 'y' : '', 3)}  ${g.winnerName || 'draw'} (${g.decidedBy})`);
}
lines.push('');
lines.push(`  ${pad('creature', 20)} ${pad('model', 30)} ${rpad('W-D', 6)} ${rpad('casts', 6)} ${rpad('/10s', 5)} ${rpad('cdUtil', 7)} ${rpad('noAct', 6)} ${rpad('idleRdy', 8)} ${rpad('inRange', 8)} ${rpad('waitCd', 7)} ${rpad('allCd', 6)} ${rpad('still', 6)} ${rpad('dead', 5)} ${rpad('dodge', 5)} ${rpad('imm', 4)} ${rpad('flt', 4)}  refused/game cd/sil/busy/air`);
for (const c of byCreature.values()) {
  const dead = sum(Object.values(c.abilities).map((x) => x.deadGames));
  lines.push(`  ${pad(c.name, 20)} ${pad(c.model.slice(0, 30), 30)} ${rpad(`${c.wins}-${c.draws}`, 6)} ${rpad(mean(c.casts).toFixed(1), 6)} ${rpad(mean(c.castsPer10s).toFixed(1), 5)} ${rpad(pct(mean(c.cdUtil)), 7)} ${rpad(pct(mean(c.noAct)), 6)} ${rpad(pct(mean(c.idleReady)), 8)} ${rpad(pct(mean(c.idleInRange)), 8)} ${rpad(pct(mean(c.waitingCd)), 7)} ${rpad(pct(mean(c.allCd)), 6)} ${rpad(pct(mean(c.stillNoAct)), 6)} ${rpad(`${dead}/${c.games * Object.keys(c.abilities).length}`, 5)} ${rpad((c.dodges / c.games).toFixed(2), 5)} ${rpad((c.immune / c.games).toFixed(2), 4)} ${rpad(c.faults, 4)}  ${refusedPerGame(c.refused, c.games)}`);
}
lines.push('');
lines.push(`  ${pad('ability', 20)} ${pad('', 4)} ${pad('shape', 26)} ${rpad('cost', 4)} ${rpad('cd', 5)} ${rpad('uses', 5)} ${rpad('/game', 6)} ${rpad('max', 5)} ${rpad('hit', 5)} ${rpad('absrb', 5)} ${rpad('miss', 5)} ${rpad('dodge', 5)} ${rpad('rate', 5)} ${rpad('dead', 5)}  miss reasons`);
for (const c of byCreature.values()) {
  for (const [k, x] of Object.entries(c.abilities)) {
    const rate = x.targeted ? (x.judged ? pct(x.hit / x.judged) : '—') : 'self';
    lines.push(`  ${pad(c.name, 20)} ${pad(k, 4)} ${pad(x.label.slice(0, 26), 26)} ${rpad(x.cost, 4)} ${rpad(x.cooldown.toFixed(1), 5)} ${rpad(x.uses, 5)} ${rpad((x.uses / c.games).toFixed(1), 6)} ${rpad((x.maxCasts / c.games).toFixed(1), 5)} ${rpad(x.hit, 5)} ${rpad(x.absorbed, 5)} ${rpad(x.miss, 5)} ${rpad(x.evade, 5)} ${rpad(rate, 5)} ${rpad(`${x.deadGames}/${c.games}`, 5)}  ${fmtReasons(x.missReasons)}`);
  }
}
lines.push('');
lines.push('  overall');
lines.push(`    length            mean ${agg.seconds.mean.toFixed(1)} s, median ${agg.seconds.median.toFixed(1)} s, range ${agg.seconds.min.toFixed(1)}–${agg.seconds.max.toFixed(1)} s  (cap ${MATCH_SECONDS} s, burn from ${SUDDEN_DEATH_AT} s)`);
lines.push(`    first cast / hit  ${agg.firstUse.mean.toFixed(1)} s / ${agg.firstHit.mean.toFixed(1)} s (median hit ${agg.firstHit.median.toFixed(1)} s; first hp actually lost ${agg.firstDamage.mean.toFixed(1)} s mean, ${agg.firstDamage.median.toFixed(1)} s median)`);
lines.push(`    casts             ${agg.castsPerFighter.mean.toFixed(1)} per fighter per match, ${agg.castsPer10s.mean.toFixed(2)} per 10 s; cooldown utilisation ${pct(agg.cdUtil)}`);
lines.push(`    cast timeline     casts per match per ${BUCKET_S} s: ${agg.buckets.map((v, i) => `${i * BUCKET_S}s ${v.toFixed(1)}`).join(' | ')}`);
lines.push(`    cast outcomes     ${judged.hit} hit (${judged.absorbed} fully absorbed by a shield), ${judged.miss} miss, ${judged.evade} evaded, ${judged.whiff} empty zones, ${judged.pending} unresolved at the bell — of ${judged.judged} judged (${totalCasts} casts incl. self); hit rate ${judged.judged ? pct(judged.hit / judged.judged) : '—'}; miss reasons ${fmtReasons(missReasons)}`);
lines.push(`    dead slots        ${agg.deadSlots} of ${agg.slots} (ability never used in a match)`);
lines.push(`    no act            ${pct(agg.noAct)} of a fighter's ticks; idle with something ready ${pct(agg.idleReady)} (enemy inside a ready shape's reach ${pct(agg.idleInRange)}); waiting on cooldowns ${pct(agg.waitingCd)}; all on cooldown ${pct(agg.allCd)}; literally standing still ${pct(agg.stillNoAct)}`);
lines.push(`    both idle         both no act ${pct(agg.bothNoAct)}; both fully on cooldown ${pct(agg.bothAllCd)} of match ticks`);
lines.push(`    distance          mean ${agg.meanDist.toFixed(1)} m; > ${FAR_M} m ${pct(agg.far)}; < ${BRAWL_M} m ${pct(agg.brawl)}`);
lines.push(`    dodges            ${agg.dodgesAir} airborne + ${agg.dodgesInv} i-frame + ${agg.dodgesSide} side-step = ${agg.dodges} (${mean(matches.map((g) => g.dodges)).toFixed(2)} per match)`);
lines.push(`    sudden death      ${agg.suddenDeath} of ${matches.length} matches enter the burn; ${pct(agg.sdFrac)} of ticks under burn; ${agg.arenaBurned} fighters burned by the arena, ${agg.burnedOut} by fire`);
lines.push(`    results           ${fmtReasons(agg.reasons)}; decided by ${fmtReasons(agg.decidedBy)}`);
lines.push(`    shields / heals   ${agg.shieldsBroke} shields broken, ${agg.heals} heals, ${agg.walls} walls, ${agg.ignites} ignites, ${agg.immune} control-only casts shrugged off by immunity (${agg.immuneRaw} immune lines raw)`);
lines.push(`    refused orders    ${fmtReasons(agg.refused)}; per fighter per game ${refusedPerGame(agg.refused, allF.length)}; brain faults ${agg.faults}`);
lines.push('');
if (!QUIET) console.log(lines.join('\n'));

// ── markdown ─────────────────────────────────────────────────────────────────
const md = [];
md.push(`# ${TITLE}`);
md.push('');
md.push(`Generated by \`reports/combat/spectate.mjs\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} — ${matches.length} matches, ${pairs.length} matchups, seeds ${SEEDS.join(', ')}, single process, ${(wall / 1000).toFixed(1)} s wall.`);
md.push('');
md.push(`Source: ${PROVENANCE}.`);
md.push('');
md.push(`Re-run exactly this roster after the overhaul (live tree): \`node reports/combat/spectate.mjs --ids ${fighters.map((f) => f.id).join(',')} --pairs ${PAIRS} --seeds ${SEEDS.join(',')}\``);
md.push('');
md.push(`Constants at the time: MATCH_SECONDS ${MATCH_SECONDS}, SUDDEN_DEATH_AT ${SUDDEN_DEATH_AT}, TICK_HZ ${TICK_HZ}; far > ${FAR_M} m, brawl < ${BRAWL_M} m, still < ${STILL_MPS} m/s.`);
md.push('');
md.push('## Roster');
md.push('');
md.push('| creature | id | model | rating | ladder record | k1 | k2 | k3 | cooldowns (s) | kit cost | body |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const f of fighters) {
  const names = Object.keys(f.kit);
  const cells = names.map((k) => skillLabel(f.kit[k]));
  while (cells.length < 3) cells.push('—');
  const cds = names.map((k) => f.kit[k].cooldown.toFixed(1)).join(' / ');
  const cost = sum(names.map((k) => f.kit[k].cost));
  const body = `${f.hasBuild ? '' : 'default: '}hp ${Math.round(f.build.hp)}, ${f.build.maxSpeed} m/s, r ${f.build.radius}`;
  md.push(`| ${f.name} | ${f.id} | ${f.model} | ${Math.round(f.rating)} | ${f.record} | ${cells[0]} | ${cells[1]} | ${cells[2]} | ${cds} | ${cost} | ${body} |`);
}
md.push('');
md.push('## Headline numbers');
md.push('');
md.push('| metric | value |');
md.push('|---|---|');
md.push(`| match length | mean ${agg.seconds.mean.toFixed(1)} s, median ${agg.seconds.median.toFixed(1)} s, range ${agg.seconds.min.toFixed(1)}–${agg.seconds.max.toFixed(1)} s |`);
md.push(`| time to first cast | ${agg.firstUse.mean.toFixed(1)} s mean |`);
md.push(`| time to first connected hit (shielded or not) | ${agg.firstHit.mean.toFixed(1)} s mean, ${agg.firstHit.median.toFixed(1)} s median${agg.firstHit.none ? `, ${agg.firstHit.none} matches with no hit at all` : ''} |`);
md.push(`| time to first hp actually lost | ${agg.firstDamage.mean.toFixed(1)} s mean, ${agg.firstDamage.median.toFixed(1)} s median${agg.firstDamage.none ? `, ${agg.firstDamage.none} matches with none` : ''} |`);
md.push(`| casts per fighter per match | ${agg.castsPerFighter.mean.toFixed(1)} mean, ${agg.castsPerFighter.median.toFixed(1)} median |`);
md.push(`| casts per fighter per 10 s | ${agg.castsPer10s.mean.toFixed(2)} mean |`);
md.push(`| cooldown utilisation (casts ÷ casts the cooldowns would have allowed) | ${pct(agg.cdUtil)} |`);
md.push(`| casts per match by phase (${BUCKET_S} s buckets) | ${agg.buckets.map((v, i) => `${i * BUCKET_S}–${(i + 1) * BUCKET_S} s: ${v.toFixed(1)}`).join(' · ')} |`);
md.push(`| cast outcomes (targeted + zone) | ${judged.hit} hit (${judged.absorbed} of them fully absorbed by a shield), ${judged.miss} miss, ${judged.evade} evaded, ${judged.whiff} empty zones, ${judged.pending} unresolved at the bell — hit rate ${judged.judged ? pct(judged.hit / judged.judged) : '—'} of ${judged.judged} |`);
md.push(`| miss reasons | ${fmtReasons(missReasons)} |`);
md.push(`| dead ability slots (never used in a match) | ${agg.deadSlots} of ${agg.slots} |`);
md.push(`| fighter has no act running | ${pct(agg.noAct)} of its ticks |`);
md.push(`| … of which idle with at least one ability READY | ${pct(agg.idleReady)} |`);
md.push(`| … of which idle with the enemy inside a ready targeted shape's reach | ${pct(agg.idleInRange)} |`);
md.push(`| … of which waiting with EVERY ability on cooldown | ${pct(agg.waitingCd)} |`);
md.push(`| fighter has every ability on cooldown (any act) | ${pct(agg.allCd)} |`);
md.push(`| fighter literally standing still (no act, < ${STILL_MPS} m/s) | ${pct(agg.stillNoAct)} |`);
md.push(`| both fighters with no act at the same tick | ${pct(agg.bothNoAct)} |`);
md.push(`| both fighters fully on cooldown at the same tick | ${pct(agg.bothAllCd)} |`);
md.push(`| mean centre distance | ${agg.meanDist.toFixed(1)} m |`);
md.push(`| distance > ${FAR_M} m (kiting / stalling) | ${pct(agg.far)} of ticks |`);
md.push(`| distance < ${BRAWL_M} m (brawl) | ${pct(agg.brawl)} of ticks |`);
md.push(`| dodges | ${agg.dodgesAir} airborne + ${agg.dodgesInv} i-frame + ${agg.dodgesSide} side-step = ${agg.dodges} (${mean(matches.map((g) => g.dodges)).toFixed(2)} per match) |`);
md.push(`| sudden death | ${agg.suddenDeath} of ${matches.length} matches reach the burn; ${pct(agg.sdFrac)} of all ticks are under it; ${agg.arenaBurned} fighters killed by the arena, ${agg.burnedOut} by fire |`);
md.push(`| sim result reason | ${fmtReasons(agg.reasons)} |`);
md.push(`| what actually ended it | ${fmtReasons(agg.decidedBy)} |`);
md.push(`| shields broken / heals / walls / ignites | ${agg.shieldsBroke} / ${agg.heals} / ${agg.walls} / ${agg.ignites} |`);
md.push(`| controls refused by immunity, on casts carrying no damage and no burn | ${agg.immune} (${agg.immuneRaw} \`immune\` lines in total, whatever the cast carried) |`);
md.push(`| refused orders (brain asked, sim said no) | ${fmtReasons(agg.refused)} |`);
md.push(`| refused per fighter per game: ${REFUSAL_REASONS.join(' / ')} | ${refusedPerGame(agg.refused, allF.length)} |`);
md.push(`| brain faults | ${agg.faults} |`);
md.push('');
md.push('## Per match');
md.push('');
md.push('| match | seed | len s | 1st hit s | casts A / B | far | brawl | both-cd | both-idle | dodges | SD | result | ended by |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const g of matches) {
  md.push(`| ${g.a} vs ${g.b} | ${g.seed} | ${g.seconds.toFixed(1)} | ${g.firstHit === null ? '—' : g.firstHit.toFixed(1)} | ${g.fighters[0].casts} / ${g.fighters[1].casts} | ${pct(g.far)} | ${pct(g.brawl)} | ${pct(g.bothAllCd)} | ${pct(g.bothNoAct)} | ${g.dodges} | ${g.suddenDeath ? 'yes' : ''} | ${g.winnerName || 'draw'} (${g.reason}) | ${g.decidedBy} |`);
}
md.push('');
md.push('## Per creature');
md.push('');
md.push('| creature | model | games | W-D | casts/game | casts/10 s | cd util | no act | idle+ready | idle+in reach | waiting on cd | all on cd | standing still | dead slots | dodges/game (air + i-frame + side-step) | immune/game (raw) | refused/game: cooldown / silenced / busy / airborne | refused | faults |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const c of byCreature.values()) {
  const dead = sum(Object.values(c.abilities).map((x) => x.deadGames));
  md.push(`| ${c.name} | ${c.model} | ${c.games} | ${c.wins}-${c.draws} | ${mean(c.casts).toFixed(1)} | ${mean(c.castsPer10s).toFixed(2)} | ${pct(mean(c.cdUtil))} | ${pct(mean(c.noAct))} | ${pct(mean(c.idleReady))} | ${pct(mean(c.idleInRange))} | ${pct(mean(c.waitingCd))} | ${pct(mean(c.allCd))} | ${pct(mean(c.stillNoAct))} | ${dead}/${c.games * Object.keys(c.abilities).length} | ${(c.dodges / c.games).toFixed(2)} (${(c.dodgesAir / c.games).toFixed(2)} + ${(c.dodgesInv / c.games).toFixed(2)} + ${(c.dodgesSide / c.games).toFixed(2)}) | ${(c.immune / c.games).toFixed(2)} (${(c.immuneRaw / c.games).toFixed(2)}) | ${refusedPerGame(c.refused, c.games)} | ${fmtReasons(c.refused)} | ${c.faults} |`);
}
md.push('');
md.push('## Per ability');
md.push('');
md.push('`max/game` is how many casts the cooldown alone would have allowed over the match length; `uses/game ÷ max/game` is the cooldown utilisation. `rate` is hit ÷ (hit + miss + evaded + empty zone); `absorbed` counts hits whose damage was eaten whole by a shield (no hp moved). Self-targeted shapes have no hit to judge.');
md.push('');
md.push('| creature | slot | shape | cost | cd s | uses | uses/game | max/game | hit | absorbed | miss | evaded | rate | dead games | miss reasons |');
md.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const c of byCreature.values()) {
  for (const [k, x] of Object.entries(c.abilities)) {
    const rate = x.targeted ? (x.judged ? pct(x.hit / x.judged) : '—') : 'self';
    md.push(`| ${c.name} | ${k} | ${x.label} | ${x.cost} | ${x.cooldown.toFixed(1)} | ${x.uses} | ${(x.uses / c.games).toFixed(1)} | ${(x.maxCasts / c.games).toFixed(1)} | ${x.hit} | ${x.absorbed} | ${x.miss} | ${x.evade} | ${rate} | ${x.deadGames}/${c.games} | ${fmtReasons(x.missReasons)} |`);
  }
}
md.push('');
md.push('## Reading');
md.push('');
md.push(readingText());
md.push('');
md.push('## Method');
md.push('');
md.push('- Creatures: the top-rated `state=\'active\'`, `kit_active=1` rows of `data/airena.db` with a brain (or `--ids`); every pair among them in ladder order, capped by `--pairs`; each pair plays every seed, sides alternating per seed. Brains are compiled once with `compileBrain` (`src/brain/host.js`) and `reset()` before every match; kits with `compileKit` (`src/skills/compile.js`); bodies with `normalizeBuild(build_json)` (`src/core/config.js`) — every creature in the table has `build_json = NULL`, so all bodies are the default build.');
md.push('- Tick metrics come from `onFrame` snapshots (`snapshot(world)` in `src/core/sim.js`): `act`, `cd`, position and reported velocity per side, every tick until the bell. Event metrics come from `result.log` (`use`, `damage`, `ignite`, `miss`, `evade`, `refused`, `heal`, `wall`, `shieldBroke`, `burned`, `burnedOut`, `death`, `end`) and from `impact` entries in the frame\'s `fx` list, which are the only record of a hit that a shield absorbed whole (`damage()` in sim.js returns before logging when nothing got through).');
md.push('- A cast\'s outcome is the first of: `impact`/`damage`/`ignite` (hit), `miss` (with its reason), `evade` (i-frames) logged for that fighter and slot between the `use` and the slot\'s next `use`; a zone with no impact by the bell is an empty zone; self, blink and jump shapes are always "applied" and excluded from hit rates.');
md.push('- "Ended by": the sim reports `kill` whether the last hp was taken by an opponent or by the arena\'s burn; this report separates them by matching the loser\'s `death` line against a `burned` (arena) or `burnedOut` (fire) line on the same tick.');
md.push('- "Idle" counts only ticks the fighter is alive; the bell tick and the curtain are excluded.');
md.push(`- **Idle+in reach** uses the TRUE centre-to-centre reach, as \`src/brain/prompt.js\` prints it on the kit card and \`tools/checkbehaviour.mjs\` verifies it by binary search: beam \`own r + 0.2 + range + enemy r + 0.4\`, cone \`range + enemy r\`, bolt \`own r + 0.3 + flight + enemy r + 0.35\` (flight = range rounded up to whole ticks), mortar \`range + splash + enemy r\`, field \`range + radius + enemy r\`, lunge \`distance + own r + enemy r\`; aura, blink and leap have no hit distance and are not counted. Until 07.09 it read \`range + own radius\`, which under-counted the reach by 0.4–2.3 m.`);
md.push(`- **Dodges** are counted per log line and credited to the body that made them: \`miss\` with reason \`airborne\`, an \`evade\` line (blink i-frames), and a **side-step** — a bolt or mortar \`miss\` with reason \`aim\` whose target was crossing the caster→target line faster than ${SIDESTEP_MPS} m/s at the moment of the miss (the perpendicular component of its velocity, from that tick's own snapshot).`);
md.push('- **Immune** counts a refusal only when the refusing cast carries no damage and no burn atom (read from the caster\'s compiled kit, or from `SKILLS` for a fixture skill): a control riding a landed damage cast is not a wasted decision. Every `immune` line, filtered or not, is in the raw number beside it.');
md.push('');
mkdirSyncSafe(dirname(OUT_MD));
writeFileSync(OUT_MD, md.join('\n'));
if (OUT_JSON) {
  mkdirSyncSafe(dirname(OUT_JSON));
  writeFileSync(OUT_JSON, JSON.stringify({
    args: { n: N, pairs: PAIRS, seeds: SEEDS, ids: fighters.map((f) => f.id), src: SRC, provenance: PROVENANCE },
    constants: { MATCH_SECONDS, SUDDEN_DEATH_AT, TICK_HZ, FAR_M, BRAWL_M },
    agg, judged, missReasons,
    creatures: [...byCreature.values()].map((c) => ({ ...c, casts: mean(c.casts), castsPer10s: mean(c.castsPer10s), cdUtil: mean(c.cdUtil), noAct: mean(c.noAct), idleReady: mean(c.idleReady), idleInRange: mean(c.idleInRange), waitingCd: mean(c.waitingCd), allCd: mean(c.allCd), stillNoAct: mean(c.stillNoAct) })),
    matches,
  }, null, 1));
}
if (!QUIET) console.log(`  wrote ${OUT_MD}${OUT_JSON ? ` and ${OUT_JSON}` : ''}`);

function mkdirSyncSafe(dir) { try { mkdirSync(dir, { recursive: true }); } catch { /* exists */ } }

function readingText() {
  const p = [];
  const castsEach = agg.castsPerFighter.mean;
  const len = agg.seconds.median;
  const arena = agg.decidedBy.arena || 0;
  p.push(`A fighter has no ability running for **${pct(agg.noAct)}** of its time on the floor. Of that, **${pct(agg.waitingCd)}** is spent with every ability on cooldown — nothing it could do but walk — and **${pct(agg.idleReady)}** with at least one ability ready and not cast; in **${pct(agg.idleInRange)}** the enemy was inside the reach of a ready targeted shape and the mind still did not fire (waiting for a better angle, line of sight, or its own rule). Both fighters are fully on cooldown at the same moment for **${pct(agg.bothAllCd)}** of the match: nobody on the floor can do anything but move.`);
  p.push(`A median fight lasts **${len.toFixed(1)} s** and each fighter casts **${castsEach.toFixed(1)}** times in it, about **${agg.castsPer10s.mean.toFixed(1)} per 10 s** — one ability every ${(10 / Math.max(0.01, agg.castsPer10s.mean)).toFixed(1)} s. Cooldown utilisation is **${pct(agg.cdUtil)}**: the fighters cast that share of what the cooldowns would have allowed, so ${agg.cdUtil > 0.7 ? 'the cadence is set by the cooldowns, not by the minds — shorter cooldowns would translate almost directly into more casts.' : 'the cadence is NOT only the cooldowns: the minds leave a real share of allowed casts on the table, and shorter cooldowns alone will not fill it.'}`);
  p.push(`Of ${judged.judged} judged casts, ${pct(judged.judged ? judged.hit / judged.judged : 0)} connect, but ${judged.absorbed} of the ${judged.hit} connecting hits were eaten whole by a shield and moved no hp. ${agg.dodges} casts were dodged — ${agg.dodgesAir} under a leap, ${agg.dodgesInv} through blink i-frames, ${agg.dodgesSide} by stepping across the shot (${mean(matches.map((g) => g.dodges)).toFixed(2)} per match). ${agg.deadSlots} of ${agg.slots} ability slots were never used in their match.`);
  p.push(`The pair stands more than ${FAR_M} m apart for ${pct(agg.far)} of the match and inside ${BRAWL_M} m for ${pct(agg.brawl)}; mean distance ${agg.meanDist.toFixed(1)} m. ${agg.suddenDeath} of ${matches.length} fights reach the ${SUDDEN_DEATH_AT} s burn; ${arena} of them were ended by the arena's burn rather than by an opponent's hit (the sim logs both as \`kill\`).`);
  return p.join('\n\n');
}
