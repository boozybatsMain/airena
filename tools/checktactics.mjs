#!/usr/bin/env node
/**
 * The editing rule, enforced by something that can read.
 *
 *   node tools/checktactics.mjs            # judge, print, exit non-zero on a leak
 *   node tools/checktactics.mjs --show     # print every verdict, not just the failures
 *
 * `src/brain/prompt.js` promises that every line it emits is one of four
 * things: a CAPABILITY, a CONSTRAINT WITH ITS REASON, a FACT ABOUT THE WORLD,
 * or THE OBJECTIVE. That promise is the whole experiment — a model handed a
 * dictionary either writes a fighter or it does not, and a prompt that whispers
 * the answer measures nothing.
 *
 * ── why the grep had to go ──────────────────────────────────────────────────
 *
 * It was six substrings: 'you should', 'it is usually', 'the best way',
 * 'we recommend', 'try to keep', 'remember to'. That check has never fired and
 * cannot usefully fire. The same file that hosts it already demolishes this
 * class of test for the NUMBERS — "finding a numeral somewhere in a document is
 * no evidence that the sentence you care about contains it" — and then applies
 * `String.includes` to the harder problem. A hint does not have to contain any
 * of six English phrases. Two that were in the shipping prompt and matched none
 * of them:
 *
 *   "and you know the cooldowns from the tables above", one clause after the
 *   sentence that says the opponent's cooldowns are deliberately withheld. It
 *   names both halves of a derivation and leaves the model to do the addition;
 *   11 of the 12 shipping brains implement exactly that derivation, and
 *   `docs/EXPERIMENT.md` used to call it a thing "nothing in this repo
 *   suggested". It is deleted.
 *
 *   `V.lead(shooter, target, targetVel, speed)` — a closed-form intercept
 *   solver, listed as a helper in a world where the beam is hitscan. It is a
 *   capability and it is disclosed because it is genuinely in scope, so it
 *   stays; what it is NOT is invisible to a checker any more.
 *
 * ── what this does instead ──────────────────────────────────────────────────
 *
 * Every segment of the rendered prompt is put to a model with the editing rule
 * and the whole prompt as context, and comes back classified. A segment that is
 * none of the permitted kinds fails the run and is printed with the clause that
 * did it.
 *
 * Three things stop that from being a vibe:
 *
 *   COVERAGE IS PROVED, not assumed. The segments are asserted to reconstruct
 *   the prompt character for character once whitespace and rule lines are
 *   removed. Nothing can slip past by not being in a segment — the same
 *   guarantee `checkprompt`'s bracket sweep gives for numerals.
 *
 *   THE JUDGE IS CONTROLLED on every call. Four fabricated tactics and four
 *   real lines are shuffled into each batch, indistinguishable from the rest.
 *   If the judge passes a planted tactic or flags a plain capability, the run
 *   fails and nothing is written: a judge that cannot tell them apart has not
 *   produced evidence. This is the check `tools/falsify.mjs` was criticised for
 *   printing rather than asserting.
 *
 *   THE VERDICTS ARE COMMITTED, in `tools/tactics-verdicts.json`, keyed by a
 *   hash of the segment and of the rubric. So `npm test` pays nothing while the
 *   prompt is unchanged, an edited line is re-judged and only that line is, and
 *   a reader can see what was ruled about every sentence in the prompt without
 *   spending a token. Deleting the file re-judges everything (~$0.15).
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { askClaude, CLAUDE_BIN } from '../src/brain/claude.js';
import { brainPrompt } from '../src/brain/prompt.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STORE = join(ROOT, 'tools/tactics-verdicts.json');

/** Cheap and sharp beats deep here; both are overridable for a re-litigation. */
const MODEL = process.env.AIRENA_JUDGE_MODEL || 'sonnet';
const EFFORT = process.env.AIRENA_JUDGE_EFFORT || 'high';
/** Small enough that one bad answer costs little, large enough to be 3 calls. */
const BATCH = 80;

// ---------------------------------------------------------------------------
// the rubric
// ---------------------------------------------------------------------------

/**
 * The categories, as the prompt's own docstring states them, plus one.
 *
 * Category 5 is the honest hole. A heading, a code fence line, a bare label:
 * they assert nothing about the world and belong to none of the four, and a
 * rubric that had to call `THE WORLD` a "fact" would be teaching the judge to
 * stretch. It is listed explicitly for the same reason `checkprompt`'s
 * PROSE_NUMERALS lists its exemptions one at a time with a reason each.
 */
const CATEGORIES = `1 = A CAPABILITY. A verb, a field, a helper, an argument, the shape of an
    answer — something that exists and can be called or read. A model cannot
    call what it has not been told exists.
2 = A CONSTRAINT WITH ITS REASON. A ban or a limit, together with why it is
    there. The reason is required: a bare ban makes the model guess at the
    world it implies.
3 = A FACT ABOUT THE WORLD. A radius, a rate, a timing, a damage number, a
    geometry rule, what an event means, what happens when two things touch.
4 = THE OBJECTIVE. What the creature is for.
5 = STRUCTURE. A section heading, a bare label, a separator, a line of the
    answer's own skeleton. Asserts nothing.
0 = NONE OF THE ABOVE — and this is the one that matters. A tactic, a
    priority, a ranking, a recommendation, a worked strategy, a heuristic, a
    hint at a derivation, an "it is usually better to", a sentence that pairs
    two facts and leaves only the addition to be done. Anything that does any
    part of the model's thinking for it.`;

const RUBRIC = `You are auditing the instruction handed to a language model that must write,
from scratch and with no further help, the entire mind of a fighting creature.

The instruction is meant to be a DICTIONARY, not a design. The experiment it
serves is whether a model given only what exists will discover how to fight. A
single sentence of advice invalidates it, so the audit is strict in one
direction only: when a segment could be read either as a plain fact or as a
nudge, it is a nudge.

Classify each numbered segment as exactly one of:

${CATEGORIES}

Judge the segment as it reads IN PLACE, using the full instruction supplied
above for context — the same words can be a fact in one section and a hint
beside another sentence. Do not reward a segment for being true; a tactic can
be perfectly true. Do not punish a segment for being detailed; an exact number
is category 3 no matter how useful it is.

Answer with a JSON array and nothing else. One object per segment, in order:
{"i": <index>, "c": <category>} — and for c=0 only, also "q": the exact clause
that fails, and "why": one short sentence.`;

const RUBRIC_HASH = createHash('sha256').update(`${RUBRIC}\n${CATEGORIES}`).digest('hex').slice(0, 16);

// ---------------------------------------------------------------------------
// the controls
// ---------------------------------------------------------------------------

/**
 * Ten lines whose verdicts are known, mixed into every batch.
 *
 * The decoys are written in the voice of the prompt, quoting its real constants
 * and its real vocabulary, because a decoy that reads like a decoy measures
 * nothing. The honest lines are lifted from the prompt itself, one per
 * category, so a judge that has started calling everything a tactic fails too.
 * Only the DIRECTION is asserted for the honest ones — anything but 0 — because
 * which of the five a line belongs to is genuinely arguable and the judge
 * disagreeing with a label is not the failure this file is about.
 *
 * ── the last two are a pair, and they are why this works ────────────────────
 *
 * They are the same paragraph of the real prompt with and without the clause
 * "and you know the cooldowns from the tables above", which was in the shipping
 * prompt for the whole project and which the six-phrase grep could not see.
 * Measured: put that paragraph in a batch of 88, and in a batch of 10, and
 * sonnet/high called it a fact both times. Put its clean twin beside it and
 * sonnet/high, opus/low and opus/high all called it a tactic and all three
 * quoted exactly the offending clause. The judge is far better at "which of
 * these two is the hint" than at "is this a hint", so the pair is not only a
 * control on the judge's competence — it is the contrast that makes the rest of
 * the batch legible to it, and it goes in every call for that reason.
 */
const CONTROLS = [
  { want: 0, text: 'Hold the gorilla at more than 5.15 m and it cannot reach you with the smash, so that is the distance to keep.' },
  { want: 0, text: 'It is usually better to spend the blink on the charge than on the beam, because the charge is the one that stuns.' },
  { want: 0, text: 'A good opening is to walk a block between yourself and the octopus while its laser is off cooldown.' },
  { want: 0, text: 'Watch p.enemy.casting: when the phase is windup and the skill is charge, you have the wind-up to get out of the lane.' },
  { want: 1, text: 'api.stop()              Drop the movement order.' },
  { want: 2, text: 'NO Math.random AND NO Date. Both throw. The reason is not safety, it is replay: a match must be reproducible from the seed and the two brains.' },
  { want: 3, text: 'A block stops a body and stops a line of sight. Nothing sees or shoots through one, and nothing walks through one. The walls do the same.' },
  { want: 4, text: 'Kill your opponent. Stay alive.' },
  { want: 3, text: "That is the whole list. In particular there is no p.enemy.cooldowns: what they have ready is not given to you. Every use of a skill by either side is announced — you get { type:'enemyStarted', skill } the moment they begin one." },
  { want: 0, text: "That is the whole list. In particular there is no p.enemy.cooldowns: what they have ready is not given to you. Every use of a skill by either side is announced — you get { type:'enemyStarted', skill } the moment they begin one, and you know the cooldowns from the tables above." },
];

// ---------------------------------------------------------------------------
// segmenting
// ---------------------------------------------------------------------------

/**
 * The prompt, cut into the units a verdict is about.
 *
 * An indented line is a table row and stands alone; the tables are the bulk of
 * the prompt and each row is a self-contained claim. Everything else is
 * unwrapped back into the paragraph it was written as, because the line breaks
 * are typography and a judge shown half a sentence is being asked a different
 * question. Paragraphs are not split further into sentences: the rubric asks
 * for the offending CLAUSE, so a hint inside a long paragraph is still caught
 * and still named, and the surrounding sentences are exactly the context that
 * decides whether a clause is a fact or a nudge.
 */
export function segments(text) {
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(para.join(' ').trim()); para = []; } };
  for (const line of text.split('\n')) {
    if (line.trim() === '' || /^-{3,}$/.test(line.trim())) { flush(); continue; }
    if (/^\s/.test(line)) { flush(); out.push(line.trim()); continue; }
    para.push(line.trim());
  }
  flush();
  return out;
}

/**
 * That the segments ARE the prompt.
 *
 * Strip whitespace and the rule lines from both sides and demand equality. A
 * segmenter that dropped a line — or a future one that decided some section was
 * not worth judging — would otherwise leave a hole exactly where a hint would
 * be least visible, and the run would still report every segment clean.
 */
function proveCoverage(text, segs) {
  const got = segs.join('').replace(/\s+/g, '');
  const want = text.replace(/^-{3,}$/gm, '').replace(/\s+/g, '');
  if (got === want) return null;
  for (let i = 0; i < Math.max(got.length, want.length); i++) {
    if (got[i] !== want[i]) return `segments do not reconstruct the prompt; they diverge at character ${i}: `
      + `${JSON.stringify(want.slice(i, i + 60))} is not covered`;
  }
  return 'segments do not reconstruct the prompt';
}

const keyOf = (text) => createHash('sha256').update(`${RUBRIC_HASH}\n${text}`).digest('hex').slice(0, 24);

// ---------------------------------------------------------------------------
// the judge
// ---------------------------------------------------------------------------

function parseVerdicts(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('[');
  const b = t.lastIndexOf(']');
  if (a < 0 || b < a) throw new Error(`the judge did not answer with a JSON array: ${t.slice(0, 200)}`);
  return JSON.parse(t.slice(a, b + 1));
}

/**
 * One batch: the whole prompt as context, then the numbered segments.
 *
 * The controls are interleaved at a fixed stride rather than appended, so they
 * sit among the real segments in the numbering the judge sees. The stride comes
 * out of the batch size and nothing else, so re-running the same batch asks the
 * same question. A batch smaller than the control set puts them all at the end,
 * which is harmless: nothing in the text says which lines are controls.
 */
async function judgeBatch({ context, batch, index, log }) {
  /*
   * Positions are recorded as the list is built and never recovered by looking
   * the text up again: five of the ten controls are lifted verbatim from the
   * prompt, so a search would find the real segment's slot instead of the
   * control's and the control would silently check the wrong verdict.
   */
  const mixed = [];
  const control = [];
  const real = [];
  const stride = Math.max(1, Math.floor((batch.length + 1) / (CONTROLS.length + 1)));
  let c = 0;
  for (let i = 0; i < batch.length; i++) {
    if (c < CONTROLS.length && i > 0 && i % stride === 0) {
      control.push({ at: mixed.length, want: CONTROLS[c].want, text: CONTROLS[c].text });
      mixed.push(CONTROLS[c].text);
      c++;
    }
    real.push({ at: mixed.length, seg: batch[i] });
    mixed.push(batch[i].text);
  }
  for (; c < CONTROLS.length; c++) {
    control.push({ at: mixed.length, want: CONTROLS[c].want, text: CONTROLS[c].text });
    mixed.push(CONTROLS[c].text);
  }

  const numbered = mixed.map((t, i) => `[${i}] ${t}`).join('\n');
  const answer = await askClaude({
    system: RUBRIC,
    prompt: `Here is the whole instruction, for context:\n\n<<<INSTRUCTION\n${context}\nINSTRUCTION>>>\n\n`
      + `Classify these ${mixed.length} segments of it. Answer with the JSON array only.\n\n${numbered}`,
    model: MODEL,
    effort: EFFORT,
    timeoutMs: 600_000,
    log,
  });

  const raw = parseVerdicts(answer.text);
  const byIndex = new Map();
  for (const v of raw) {
    if (typeof v?.i !== 'number' || typeof v?.c !== 'number') continue;
    byIndex.set(v.i, v);
  }
  if (byIndex.size !== mixed.length) {
    throw new Error(`the judge ruled on ${byIndex.size} of ${mixed.length} segments in batch ${index}`);
  }

  const wrong = control.filter((k) => {
    const c2 = byIndex.get(k.at)?.c;
    return k.want === 0 ? c2 !== 0 : c2 === 0;
  });

  return {
    control: { total: control.length, wrong, cost: answer.costUsd, model: answer.model },
    verdicts: real.map(({ at, seg }) => ({ seg, v: byIndex.get(at) })),
    byIndex,
  };
}

// ---------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------

function loadStore() {
  if (!existsSync(STORE)) return { rubric: RUBRIC_HASH, verdicts: {} };
  const j = JSON.parse(readFileSync(STORE, 'utf8'));
  // A changed rubric is a changed question; old answers to it are not answers.
  if (j.rubric !== RUBRIC_HASH) return { rubric: RUBRIC_HASH, verdicts: {} };
  return j;
}

/**
 * КАЖДЫЙ ПРОМПТ, КОТОРЫЙ КОМУ-ТО ВЫДАЮТ, — А НЕ ТОЛЬКО ЭТАЛОННЫЙ.
 *
 * Судили здесь ровно `brainPrompt(id)`, то есть форму БЕЗ НАБОРА: стенд §1, на
 * котором дерутся шесть эталонных мозгов. Все существа игроков получают другую
 * форму — с карточками умений грамматики, — и её не читал никто. Обещание при
 * этом было записано, в `src/brain/prompt.js` над `kitBlocks`, дословно:
 * «`checktactics` sweeps this text too, and a tactical hint here would fail it
 * exactly as it would anywhere else». Не sweeps. Строки `DELIVERY_LINE`,
 * `EFFECT_LINE` и абзац про смену набора шли к моделям неаудированными.
 *
 * Наборы — ФИКСИРОВАННЫЕ и перечислены здесь, а не собираются случайно: ключ
 * вердикта считается от текста сегмента, и набор, меняющийся от прогона к
 * прогону, перевыносил бы приговор каждому запуску заново. Два набора берут
 * все девять доставок, потому что тактическая подсказка в `DELIVERY_LINE`
 * доехала бы до модели через любую из них.
 *
 * `where` остаётся тем же: имя документа, в контексте которого сегмент судят.
 * Сегмент, общий для формы с набором и без, судится ОДИН раз — и это верно, а
 * не экономия: рубрика просит судить строку на её месте, а место у неё одно.
 */
async function documents() {
  const { compileKit } = await import('../src/skills/compile.js');
  const KITS = [
    [{ delivery: 'cone', effects: ['damage', 'knock'], element: 'kinetic' },
      { delivery: 'lob', effects: ['burn'], element: 'ember' },
      { delivery: 'blink', effects: ['cleanse'], element: 'void' }],
    [{ delivery: 'beam', effects: ['damage'], element: 'arc' },
      { delivery: 'zone', effects: ['weaken'], element: 'acid', channel: 'speed' },
      { delivery: 'jump', effects: ['shield'], element: 'frost' }],
    [{ delivery: 'dash', effects: ['stun'], element: 'kinetic' },
      { delivery: 'bolt', effects: ['blind'], element: 'void' },
      { delivery: 'self', effects: ['heal'], element: 'frost' }],
  ];
  const out = [];
  for (const id of ['blue', 'orange']) out.push([id, brainPrompt(id)]);
  for (const [i, grammar] of KITS.entries()) {
    const built = compileKit(grammar);
    if (built.problems.length) throw new Error(`kit ${i} does not compile: ${JSON.stringify(built.problems)}`);
    for (const id of ['blue', 'orange']) {
      out.push([`${id}/kit${i}`, brainPrompt(id, { own: built.defs, enemy: built.defs })]);
    }
  }
  return out;
}

/**
 * @returns {Promise<{ lines: string[], failures: string[] }>} so the caller
 *   decides what a failure means. `tools/checkprompt.mjs` runs this as its
 *   third direction, which is how it reaches `npm test` without a fourth
 *   command in package.json.
 */
export async function checkTactics({ show = false, log = () => {} } = {}) {
  const lines = [];
  const failures = [];

  const texts = new Map(); // segment text -> the fighter prompts it appears in
  const contexts = {};
  for (const [id, text] of await documents()) {
    contexts[id] = text;
    const segs = segments(text);
    const gap = proveCoverage(text, segs);
    if (gap) failures.push(`${id}: ${gap}`);
    for (const s of segs) {
      if (!texts.has(s)) texts.set(s, []);
      texts.get(s).push(id);
    }
  }
  if (failures.length) return { lines, failures };

  const store = loadStore();
  const all = [...texts.entries()].map(([text, where]) => ({ text, where, key: keyOf(text) }));
  const todo = all.filter((s) => !store.verdicts[s.key]);
  lines.push(`${all.length} segments across ${Object.keys(contexts).length} prompts, ${all.length - todo.length} already judged`);

  if (todo.length) {
    if (!existsSync(CLAUDE_BIN)) {
      failures.push(`${todo.length} segment(s) of the prompt have never been judged and the claude binary is not at `
        + `${CLAUDE_BIN}. The tactics check is the prompt's central guarantee; it is not skipped quietly. `
        + `Set AIRENA_CLAUDE_BIN, or restore tools/tactics-verdicts.json from the last commit that had it.`);
      return { lines, failures };
    }
    /*
     * Batched per fighter, not across them. The two prompts differ only in
     * which body is "yours", but a segment must be judged against the document
     * it appears in — "the same words can be a fact in one section and a hint
     * beside another sentence" is the rubric's own instruction, and a segment
     * shown with the wrong context is being asked a question about a document
     * it is not in.
     */
    let spent = 0, batchNo = 0;
    for (const id of Object.keys(contexts)) {
      const mine = todo.filter((s) => s.where.includes(id) && !s.done);
      for (let i = 0; i < mine.length; i += BATCH) {
        const batch = mine.slice(i, i + BATCH);
        let r;
        try {
          r = await judgeBatch({ context: contexts[id], batch, index: batchNo, log });
        } catch (e) {
          // A judge that could not be reached has not cleared the prompt. The
          // whole point of this file is that silence is not a pass.
          failures.push(`the tactics judge did not answer on batch ${batchNo}: ${e.message}`);
          return { lines, failures };
        }
        spent += r.control.cost;
        if (r.control.wrong.length) {
          failures.push(`the judge failed its own controls on batch ${batchNo}: `
            + r.control.wrong.map((k) => `"${k.text.slice(0, 60)}…" wanted ${k.want}, got ${r.byIndex.get(k.at)?.c}`).join('; ')
            + ' — nothing from this batch was recorded.');
          return { lines, failures };
        }
        lines.push(`  batch ${batchNo} (${id}): ${batch.length} segments + ${r.control.total} controls, all controls correct`);
        for (const { seg, v } of r.verdicts) {
          seg.done = true;
          store.verdicts[seg.key] = {
            c: v.c, text: seg.text, model: r.control.model, rubric: RUBRIC_HASH,
            ...(v.c === 0 ? { q: v.q ?? null, why: v.why ?? null } : {}),
          };
        }
        batchNo++;
      }
    }
    writeFileSync(STORE, `${JSON.stringify(store, null, 1)}\n`);
    lines.push(`  judged ${todo.length} segment(s) for $${spent.toFixed(3)}; verdicts written to tools/tactics-verdicts.json`);
  }

  const tally = [0, 0, 0, 0, 0, 0];
  for (const s of all) {
    const v = store.verdicts[s.key];
    if (!v) { failures.push(`no verdict was recorded for: ${JSON.stringify(s.text.slice(0, 80))}`); continue; }
    tally[v.c] = (tally[v.c] || 0) + 1;
    if (show) lines.push(`  [${v.c}] ${s.text.slice(0, 96)}`);
    if (v.c !== 0) continue;
    const excuse = ACCEPTED[s.key];
    if (excuse) { lines.push(`  accepted despite the judge: ${s.text.slice(0, 60)}… — ${excuse}`); continue; }
    failures.push(`a segment that is none of the four kinds: ${JSON.stringify(s.text.slice(0, 160))}\n`
      + `      the clause: ${JSON.stringify(v.q)}\n      why: ${v.why}`);
  }
  lines.push(`  capability ${tally[1]}, constraint+reason ${tally[2]}, world fact ${tally[3]}, `
    + `objective ${tally[4]}, structure ${tally[5]}, tactics ${tally[0]}`);
  return { lines, failures };
}

/**
 * Segments the judge calls a tactic and the project keeps anyway, each with the
 * reason. Empty is the healthy state, and a growing list is the smell this
 * whole file exists to make visible: an entry here is a decision, made once, in
 * writing, rather than a phrase that happened not to be in a grep.
 */
const ACCEPTED = {};

// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
  const { lines, failures } = await checkTactics({
    show: process.argv.includes('--show'),
    log: (m) => console.log(m),
  });
  for (const l of lines) console.log(l);
  if (failures.length === 0) console.log('every line of the prompt is a capability, a constraint with its reason, a fact, or the objective.');
  else {
    for (const f of failures) console.error(`  ${f}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
}
