/**
 * The sentence the player reads names the ability the simulation fights with — gate.
 *
 *   node tools/checkdescribe.mjs
 *   node tools/checkdescribe.mjs --verbose
 *
 * ── WHY THIS GATE EXISTS ────────────────────────────────────────────────────
 *
 * Spectator review r1 (07.09, finding 4) measured seven abilities where the HUD
 * printed one number and the fight used another: a fan advertised at 24 that
 * hits for 33.6, a two-effect aura advertised at 12/16 that shields 10.2 and
 * heals up to 13.6, a field advertised at "24 damage" that deals 6.72 five
 * times. The cause was structural — `describe.js` read `EFFECTS[id]` raw and
 * never saw the effect share, the shape's premium or the field's division that
 * `compile.js` applies — and the repair is structural too: `describe.js` now
 * mirrors those three transformations.
 *
 * A MIRROR IS A SECOND COPY, AND A SECOND COPY DRIFTS. It cannot be replaced by
 * an import: `describe.js` is served to the browser (`src/client/ui/ability.js`
 * imports it, and the client ships as plain ES modules), while `compile.js`
 * reaches `src/core/config.js`, which reads the tuning overlay with `node:fs`.
 * So the copy stays and this gate holds it: every legal shape × effect
 * combination is compiled by the REAL compiler and compared, field by field,
 * against what the describer computes for the same entry. The day someone moves
 * a share, a premium or the field's period, this fails instead of a tooltip
 * quietly lying to every player.
 *
 * It also checks the two things about the copy that are not numbers:
 *
 *   — every effect in the registry has a phrase, so a new atom cannot be
 *     silently dropped from the sentence (the old table skipped anything it
 *     did not know, which reads as an ability that does less than it does);
 *   — every control's sentence names its duration AND its immunity, the one
 *     rule a spectator most needs and the one that appeared nowhere.
 */

import { DELIVERIES, EFFECTS } from '../src/skills/registry.js';
import { compileSkill } from '../src/skills/compile.js';
import { compiledEffects, describeAbility } from '../src/skills/describe.js';

const VERBOSE = process.argv.includes('--verbose');
let bad = 0;
const ok = (what, cond, note = '') => {
  if (!cond || VERBOSE) console.log(`  ${cond ? '✓' : '✗'} ${what}${note ? `  ${note}` : ''}`);
  if (!cond) bad++;
};

console.log('\n  THE PLAYER\'S SENTENCE AGAINST THE COMPILER\n');

/* Which atoms a shape may legally carry is the registry's business, and it is
   not this gate's business to re-derive it: anything the compiler rejects is
   simply not a case a player can ever be shown. */
const ATOMS = Object.keys(EFFECTS);
const SHAPES = Object.keys(DELIVERIES);

// ── 1. every compiled magnitude and duration is the one the sentence uses ──
{
  let cases = 0;
  const wrong = [];
  const pairs = [];
  for (let i = 0; i < ATOMS.length; i++) {
    pairs.push([ATOMS[i]]);
    for (let j = i + 1; j < ATOMS.length; j++) {
      pairs.push([ATOMS[i], ATOMS[j]]);
      /* One triple per pair is enough to exercise the third share (0.7)
         without turning the gate into 3 000 compiles. */
      if (j + 1 < ATOMS.length) pairs.push([ATOMS[i], ATOMS[j], ATOMS[j + 1]]);
    }
  }

  for (const delivery of SHAPES) {
    for (const effects of pairs) {
      const skill = { delivery, effects, element: 'kinetic', channel: 'damage' };
      const out = compileSkill(skill, 'k1');
      if (out.error) continue;                    /* not a shape a player can own */
      cases++;
      const mine = compiledEffects(delivery, effects);
      const theirs = out.def.effects;

      if (mine.list.length !== theirs.length) {
        wrong.push(`${delivery}:${effects.join('+')} — ${mine.list.length} effects vs ${theirs.length}`);
        continue;
      }
      for (let k = 0; k < theirs.length; k++) {
        const a = mine.list[k]; const b = theirs[k];
        if (a.id !== b.id) { wrong.push(`${delivery}:${effects.join('+')} — slot ${k} ${a.id} vs ${b.id}`); continue; }
        const same = (x, y) => (x == null && y == null) || Math.abs(Number(x) - Number(y)) < 1e-6;
        if (!same(a.mag, b.mag)) wrong.push(`${delivery}:${effects.join('+')} — ${a.id}.mag ${a.mag} vs ${b.mag}`);
        if (!same(a.duration, b.duration)) wrong.push(`${delivery}:${effects.join('+')} — ${a.id}.duration ${a.duration} vs ${b.duration}`);
        if (!same(a.immune ?? null, b.immune ?? null)) wrong.push(`${delivery}:${effects.join('+')} — ${a.id}.immune ${a.immune} vs ${b.immune}`);
      }
      const ticks = out.def.zoneTicks ?? null;
      if ((mine.ticks ?? null) !== ticks) {
        wrong.push(`${delivery}:${effects.join('+')} — ticks ${mine.ticks} vs ${ticks}`);
      }
    }
  }
  ok(`every compiled figure is the printed figure (${cases} abilities)`,
    wrong.length === 0, wrong.length ? `\n      ${wrong.slice(0, 8).join('\n      ')}` : `${cases} compiled`);
}

// ── 2. no atom falls out of the sentence ──────────────────────────────────
{
  const mute = [];
  for (const id of ATOMS) {
    const skill = { delivery: 'self', effects: [id], element: 'kinetic', channel: 'damage' };
    let out = compileSkill(skill, 'k1');
    if (out.error) {
      /* A self-only shape refuses the targeted atoms; give those a fan. */
      out = compileSkill({ ...skill, delivery: 'cone' }, 'k1');
    }
    if (out.error) continue;
    const a = describeAbility(out.def.grammar);
    /* The blurb is the shape sentence plus the effect sentence; an atom with
       no phrase leaves the second sentence missing entirely. */
    const shapeOnly = a.blurb.split('. ').length < 2;
    if (shapeOnly) mute.push(id);
  }
  ok(`every atom has a phrase (${ATOMS.length} atoms)`, mute.length === 0,
    mute.length ? `mute: ${mute.join(', ')}` : `${ATOMS.length} spoken`);
}

// ── 3. a control names its duration and the immunity behind it ────────────
{
  const missing = [];
  for (const id of ATOMS) {
    const e = EFFECTS[id];
    if (!e.immune) continue;
    const out = compileSkill({ delivery: 'cone', effects: [id], element: 'kinetic' }, 'k1');
    if (out.error) continue;
    const { blurb } = describeAbility(out.def.grammar);
    if (!/for [\d.]+ s/.test(blurb)) missing.push(`${id}: no duration`);
    if (!/then [\d.]+ s immune/.test(blurb)) missing.push(`${id}: no immunity`);
    if (VERBOSE) console.log(`      ${id}: ${blurb}`);
  }
  ok('every control states its length and its immunity', missing.length === 0,
    missing.join('; '));
}

console.log(bad ? `\n  ✗ ${bad} проверок не прошло\n` : '\n  ✓ всё сходится\n');
process.exit(bad ? 1 : 0);
