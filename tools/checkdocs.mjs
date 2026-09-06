#!/usr/bin/env node
/**
 * README.md, held to the same standard as the brain prompt.
 *
 *   node tools/checkdocs.mjs
 *
 * The prompt cannot go stale, because `tools/checkprompt.mjs` makes it emit
 * every number through a tagged emitter and then sweeps the prose for anything
 * that did not come out of one. README was the one document still exempt from
 * that rule, and a literal cold read found four failures at once:
 *
 *   it named the shipping population `j1 … j6`; `ls brains/` says `l1 … l6`,
 *   and `/api/source/j1/octopus` answers `{"error":"not_found"}`.
 *
 *   it said the arena starts burning at 45 seconds. `SUDDEN_DEATH_AT` has been
 *   26 since the sweep that moved it, and the banner is on screen at t=26.4.
 *
 *   it gave `?seed=123456&oct=j1&gor=j2` as a worked example. `oct` and `gor`
 *   are read at `src/viewer/main.js` only inside `if (params.get('shots'))`, so
 *   even with real tags that URL silently ignores both of them.
 *
 *   it listed two degeneracy probes; `brains/` holds eleven, seven of which
 *   carry one fighter and are filtered out of the viewer's dropdown.
 *
 * None of the four is a typo. Each is a number or a name that was true when it
 * was typed and was never bound to anything afterwards.
 *
 * ── the shape of the check, which is checkprompt's ──────────────────────────
 *
 * BOUND CLAIMS, in both directions. Each entry below is a regex that anchors a
 * number to the sentence that makes the claim, plus where that number really
 * lives. The regex must match exactly once — so deleting or rewording the
 * sentence fails as loudly as a stale number — and every captured group must
 * equal the live value. Anchoring is the whole point: `checkprompt`'s own
 * header records that searching a document for a numeral proves nothing,
 * because "26" occurs in a document about a world made of small numbers
 * wherever you look. What is asserted here is that THIS sentence carries it.
 *
 * THE SWEEP, which is the direction that catches what nobody thought to list.
 * Every character consumed by a bound claim or by one of the exemptions is
 * blanked, and then the whole file is scanned for a surviving digit. A number
 * typed into README that has no source is a failure by construction, whether
 * or not anyone remembered to write a claim for it.
 *
 * NAMES, TOO. Every `node tools/x.mjs` must exist; every tool in `tools/` must
 * be named; every path and markdown link must resolve; every brain tag offered
 * as a playable example must have both fighters, which is the same test
 * `src/server/index.js` applies before putting a tag in the dropdown; and every
 * `?param=` must actually be read by the viewer.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKILLS, SUDDEN_DEATH_AT, THINK_HZ, TICK_HZ } from '../src/core/config.js';
import { ASPECT_MAX, ASPECT_MIN } from '../src/server/forge/body.js';
import { FADE_MIN, TAIL_MAX } from '../src/viewer/vfx/kit.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/**
 * The page as it is on disk. `checkDocs` takes it as an argument so `--falsify`
 * can hand it a mutated copy; nothing here ever writes to it.
 */
const README_ON_DISK = read('README.md');

/** The prompt's formatter, so a decimal reads the same in both documents. */
const n = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000));

// ---------------------------------------------------------------------------
// what the repository currently is
// ---------------------------------------------------------------------------

const dirsIn = (p) => (existsSync(join(ROOT, p))
  ? readdirSync(join(ROOT, p)).filter((d) => statSync(join(ROOT, p, d)).isDirectory()).sort()
  : []);

const brainDirs = dirsIn('brains');
/** Both fighters, which is exactly `brainTags()` in the server. */
const playable = brainDirs.filter((d) => existsSync(join(ROOT, 'brains', d, 'octopus.js'))
  && existsSync(join(ROOT, 'brains', d, 'gorilla.js')));
/** A population is a letter and a number; `stub` and `probe-*` are not. */
const populations = brainDirs.filter((d) => /^[a-z]\d+$/.test(d));
const probes = brainDirs.filter((d) => d.startsWith('probe-'));
const probePairs = probes.filter((d) => playable.includes(d));

const tools = readdirSync(join(ROOT, 'tools')).filter((f) => f.endsWith('.mjs')).sort();

/** How many invariants `tools/test.mjs` actually asserts. */
const invariants = (read('tools/test.mjs').match(/\n {2}ok\(/g) || []).length;

/** The port the server starts its walk from. */
const basePort = read('src/server/index.js').match(/const PORT = Number\(process\.env\.PORT \|\| (\d+)\)/)?.[1]
  // Named rather than left undefined: a comparison against `undefined` reports
  // "README says 8787, the repository says undefined", which sends a reader to
  // the wrong file.
  ?? '<src/server/index.js no longer declares a default PORT>';

/**
 * Query parameters the client reads, whatever it does with them.
 *
 * ALL THREE SURFACES, NOT ONE. This used to name `src/viewer/main.js` alone,
 * which was true right up to the day a parameter was read by THE PAGE ITSELF:
 * `?api=` is parsed in `index.html` before a module loads, because otherwise
 * the viewer would not know the backend's address. The gate called the
 * documentation a liar about a parameter that is read and works.
 *
 * The third is the shell. `?ui=<state>` is how every screenshot state in the
 * redesign is reached — `app.js` reads it once per navigation into
 * `store.debug` — and it is the parameter this page documents most.
 *
 * The check is not weakened by either: a parameter must still be read by CODE.
 * The client's code simply lives in three files.
 */
const viewerParams = new Set(
  ['src/viewer/main.js', 'src/client/index.html', 'src/client/app.js'].flatMap((f) => [
    ...[...read(f).matchAll(/params\.get\('([a-z]+)'\)/g)].map((m) => m[1]),
    ...[...read(f).matchAll(/URLSearchParams\(location\.search\)\.get\('([a-z]+)'\)/g)].map((m) => m[1]),
  ]),
);

/**
 * A wind-up is the first phase of its act, so its served length is a plain
 * ceiling — no carry has accumulated yet. The general case, phases that inherit
 * the previous phase's overshoot, lives in `src/brain/prompt.js`; README only
 * quotes this one as the illustration, so only this one is derived here.
 */
const servedWindup = (skill) => Math.ceil(SKILLS[skill].windup * TICK_HZ) / TICK_HZ;

// ---------------------------------------------------------------------------
// the bound claims
// ---------------------------------------------------------------------------

/**
 * @type {{what: string, re: RegExp, want: () => string[]}[]}
 *   `re` must match README exactly once. Its capture groups, in order, must
 *   equal `want()`. Both halves matter: a claim whose regex stops matching is
 *   a sentence that was rewritten out from under its evidence, and that is the
 *   failure mode this file exists for as much as a stale number is.
 */
const CLAIMS = [
  {
    what: 'the decay gate thresholds, in the commands table',
    re: /the tail may not exceed (\d+) s after the form ends\*\*, a decal may not ask for more hold than the layer's own clamp, and it may not fade in under ([\d.]+) s/,
    want: () => [String(TAIL_MAX), String(FADE_MIN)],
  },
  {
    what: 'the body aspect thresholds, in the commands table',
    re: /refused as a pancake below ([\d.]+) and as a needle above (\d+)/,
    want: () => [String(ASPECT_MIN), String(ASPECT_MAX)],
  },
  {
    what: 'the brain think rate',
    re: /run unmodified in a `node:vm` context at (\d+) Hz/,
    want: () => [String(THINK_HZ)],
  },
  {
    what: 'the simulation rate, in the layout block',
    re: /the (\d+) Hz step/,
    want: () => [String(TICK_HZ)],
  },
  {
    what: 'the invariant count, in the quickstart',
    re: /npm test {2,}# (\d+) invariants/,
    want: () => [String(invariants)],
  },
  {
    what: 'the invariant count, in the commands table',
    re: /\| `node tools\/test\.mjs` \| (\d+) invariants/,
    want: () => [String(invariants)],
  },
  {
    what: 'the port the server walks up from',
    re: /walks up from (\d+) if that port is busy/,
    want: () => [basePort],
  },
  {
    what: 'the two draws that make balance a range',
    re: /have measured (\d+)% and (\d+)% on two draws/,
    // Mirrored, not looked up: this pair is a historical measurement of two
    // populations that no longer decide anything, and its root is the docstring
    // of the tool built because of it. Two documents disagreeing about it is
    // the failure that matters, and that is what this catches.
    want: () => {
      // Unwrapped first: the sentence lives in a block comment and the two
      // numbers sit either side of a line break and a ' * ' continuation.
      const flat = read('tools/bracket.mjs').replace(/\n\s*\*\s?/g, ' ').replace(/\s+/g, ' ');
      const m = flat.match(/measured (\d+)% on one population and (\d+)% on the next/);
      return m ? [m[1], m[2]] : ['<tools/bracket.mjs no longer states it>'];
    },
  },
  {
    what: 'the wind-up rounding example',
    re: /a wind-up\s+declared at ([\d.]+) s is served in ([\d.]+) and \2 is what the model is told/,
    want: () => [n(SKILLS.smash.windup), n(servedWindup('smash'))],
  },
  {
    what: 'when the arena starts burning',
    re: /From (\d+) seconds the arena starts\s+burning both fighters/,
    want: () => [String(SUDDEN_DEATH_AT)],
  },
  {
    what: 'the shipping population',
    re: /\| `([a-z])(\d+)` … `\1(\d+)` \| the shipping population/,
    // The letter and both ends of the range, against what is on disk. A
    // population added or renamed without touching this row fails here, which
    // is the specific rot that put `j1 … j6` in front of a reader for a
    // directory called `l1`.
    want: () => {
      if (!populations.length) return ['<no population in brains/>', '', ''];
      const letter = populations[0][0];
      const idx = populations.map((p) => Number(p.slice(1))).sort((a, b) => a - b);
      return [letter, String(idx[0]), String(idx[idx.length - 1])];
    },
  },
  {
    what: 'what a generation costs',
    re: /ask Claude for two new minds \((\d+) min, \$([\d.]+) a pair\)/,
    // Not an estimate: the mean of what the shipping population actually cost,
    // read out of the provenance beside each brain. The spread is $0.39 to
    // $0.84 a pair, which is why the sentence says what it cost rather than
    // what it will cost.
    want: () => {
      let usd = 0, ms = 0, k = 0;
      for (const t of populations) {
        for (const id of ['octopus', 'gorilla']) {
          const p = join(ROOT, 'brains', t, `${id}.json`);
          if (!existsSync(p)) continue;
          const j = JSON.parse(readFileSync(p, 'utf8'));
          usd += j.costUsd || 0; ms += j.wallMs || 0; k++;
        }
      }
      if (!k) return ['<no provenance in brains/>', ''];
      const pairs = k / 2;
      return [String(Math.round(ms / 60000 / pairs)), (usd / pairs).toFixed(2)];
    },
  },
  {
    /*
     * The three widths §12 accepts the product at, against the size matrix the
     * capture tool actually walks. The set shipped two of them for three
     * review rounds while every document said three, which is the exact rot a
     * bound claim exists to catch: a width dropped from `shots.mjs`, or added
     * to it, now has to be said here in the same breath.
     */
    what: 'the widths the capture run walks, in the screenshot section',
    re: /the product at: (\d+)×(\d+) as `<state>\.png`, (\d+)×(\d+) as `<state>-w\.png` and\s+(\d+)×(\d+) as `<state>-m\.png`/,
    want: () => {
      const src = read('tools/shots.mjs');
      const one = (name) => {
        const m = src.match(new RegExp(`const ${name} = \\{ w: (\\d+), h: (\\d+)`));
        return m ? [m[1], m[2]] : [`<tools/shots.mjs has no ${name}>`, ''];
      };
      return [...one('DESKTOP'), ...one('LAPTOP'), ...one('PHONE')];
    },
  },
  {
    what: 'the probe count',
    re: /(\d+) hand-written \*\*degeneracy probes\*\*/,
    want: () => [String(probes.length)],
  },
  {
    what: 'how many probes are complete pairs',
    re: /(\d+) of them are complete pairs and appear in the viewer's dropdown; the other (\d+) carry one fighter only/,
    want: () => [String(probePairs.length), String(probes.length - probePairs.length)],
  },
];

/**
 * Digits README may carry without a source, each with the reason it is not a
 * fact about this repository.
 *
 * As short as it can be made and no shorter — every entry is a hole in the
 * sweep. Note what is NOT here: any bare integer or decimal in prose. Those are
 * the shape a claim about the world takes, and one appearing loose is exactly
 * what the sweep exists to find.
 */
const EXEMPT = [
  [/--rounds=\d+/g, 'an example argument, not a setting: the tools default without it'],
  [/--samples=\d+/g, 'the same'],

  [/\?seed=\d+/g, 'an example seed; every integer is a legal one'],
  [/&n=\d+/g, 'how many frames the capture mode writes; its own default is in src/viewer/main.js'],
  [/\?webgl=1|\?shots=1/g, 'the flag value that turns a query parameter on'],
  [/[?&](?:oct|gor)=[A-Za-z0-9-]+/g, 'a brain tag; checked as a tag against brains/ below, not as a number'],
  [/WebGL2/g, 'the name of a graphics API, the way Math.atan2 is the name of a function'],
  /*
   * Cryptographic algorithm and curve names — the same case as WebGL2, and
   * it arrived with the identity gate: `Ed25519` is what the platform's key
   * set calls its curve and `HS256` is the scheme a forged header swaps to.
   * Rewriting them without digits would not make the sentence more sourced,
   * only less true — there is no other name for either.
   */
  [/\b(?:Ed25519|EdDSA|X25519|HS\d{3}|RS\d{3}|PS\d{3}|ES\d{3}|SHA-?\d{1,3})\b/g,
    'the name of a signature scheme or curve, not a measurement'],
  [/0 hp/g, 'zero'],

  /*
   * Clause names out of SPEC.md — A1, N11, E3, F5a, §8.1.
   *
   * These are identifiers, not measurements: `N11` names a row in the table of
   * bans the way `nav.js` names a file. The sweep's rule is "a number in prose
   * is a claim about the world"; a clause name claims nothing about the world,
   * it points at a paragraph. The pattern is deliberately narrow — a letter
   * from the five section prefixes, digits, an optional lowercase suffix, and
   * a word boundary — so that `A1` is exempt and `A 1` or `at 15` is not.
   */
  [/(?<![A-Za-z\d])(?:§\s?)?[FEAN]\d{1,2}[a-z]?\b/g, 'a clause name in SPEC.md, not a measurement'],
  [/§\s?\d+(?:\.\d+)*[а-яa-z]?\b/gu, 'a section number in SPEC.md'],
];

// ---------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------

export function checkDocs({ text = README_ON_DISK } = {}) {
  const README = text;
  const lines = [];
  const failures = [];
  const fail = (m) => failures.push(m);

  // ── bound claims ─────────────────────────────────────────────────────────
  let masked = README;
  for (const c of CLAIMS) {
    const all = [...README.matchAll(new RegExp(c.re.source, `${c.re.flags.replace('g', '')}g`))];
    if (all.length === 0) { fail(`README no longer contains the sentence that states ${c.what}`); continue; }
    if (all.length > 1) { fail(`${c.what}: matched ${all.length} places in README; the claim is meant to be stated once`); continue; }
    const got = all[0].slice(1);
    const want = c.want();
    if (got.length !== want.length || got.some((g, i) => g !== want[i])) {
      fail(`${c.what}: README says ${JSON.stringify(got)}, the repository says ${JSON.stringify(want)}`);
    }
    masked = masked.replace(all[0][0], all[0][0].replace(/\d/g, '#'));
  }
  lines.push(`${CLAIMS.length} claims bound to the live repository`);

  // ── the sweep ────────────────────────────────────────────────────────────
  for (const [re] of EXEMPT) masked = masked.replace(re, (m) => m.replace(/\d/g, '#'));
  for (const line of masked.split('\n')) {
    if (/\d/.test(line)) fail(`a number in README with no source: ${line.trim()}`);
  }

  // ── tools, both directions ───────────────────────────────────────────────
  const named = new Set([...README.matchAll(/tools\/([a-z-]+)\.mjs/g)].map((m) => `${m[1]}.mjs`));
  for (const t of named) {
    if (!tools.includes(t)) fail(`README names tools/${t}, which does not exist`);
  }
  // The layout block lists tools by bare name; accept either spelling.
  const layout = README.slice(README.indexOf('tools/         '), README.indexOf('docs/          '));
  for (const t of tools) {
    const bare = t.replace(/\.mjs$/, '');
    if (named.has(t) || new RegExp(`\\b${bare}\\b`).test(layout)) continue;
    fail(`tools/${t} exists and README never mentions it`);
  }
  lines.push(`${tools.length} tools on disk, all named`);

  // ── paths and links ──────────────────────────────────────────────────────
  const paths = new Set([
    ...[...README.matchAll(/`((?:src|tools|docs|bodies|brains|reports)\/[A-Za-z0-9_./-]*)`/g)].map((m) => m[1]),
    ...[...README.matchAll(/\]\(([A-Za-z0-9_./-]+)\)/g)].map((m) => m[1]),
  ]);
  for (const p of paths) {
    const clean = p.replace(/\/$/, '').replace(/\*$/, '');
    if (clean.endsWith('-*')) continue; // a glob over archived populations
    if (!existsSync(join(ROOT, clean))) fail(`README points at ${p}, which is not in the repository`);
  }
  lines.push(`${paths.size} paths and links resolve`);

  // ── brain tags offered as examples ───────────────────────────────────────
  const tagged = [...README.matchAll(/[?&](?:oct|gor)=([A-Za-z0-9-]+)/g)].map((m) => m[1]);
  for (const t of tagged) {
    if (playable.includes(t)) continue;
    fail(brainDirs.includes(t)
      ? `README offers ?oct/gor=${t}, but brains/${t} is missing a fighter, so the server filters it out of the dropdown`
      : `README offers ?oct/gor=${t}, and brains/${t} does not exist`);
  }
  lines.push(`${tagged.length} example brain tags, all playable; ${playable.length} of ${brainDirs.length} tags in brains/ are`);

  // ── query parameters ─────────────────────────────────────────────────────
  const used = new Set([...README.matchAll(/[?&]([a-z]+)=/g)].map((m) => m[1]));
  for (const p of used) {
    if (!viewerParams.has(p)) fail(`README documents ?${p}=, which neither src/viewer/main.js nor src/client/index.html reads`);
  }
  lines.push(`${used.size} query parameters, all read by the client`);

  return { lines, failures };
}

// ---------------------------------------------------------------------------

/**
 * Twelve edits to README that must each be caught.
 *
 * A checker that has never been shown to fail is not evidence, and this one
 * would have passed a blank README on the day it was written — every claim it
 * makes is about a sentence that was there. The first, second, third and sixth
 * entries are the four defects a reviewer found by cold-reading the page; the
 * rest are the shapes those four could have taken instead. All twelve are run
 * against an in-memory copy, so `--falsify` never writes to disk.
 *
 * A mutation that fails to APPLY is a failure too: it means the sentence it
 * edits is gone, which is exactly what the claim behind it should already have
 * reported.
 */
/** Bumps every digit in the first match, so no mutation hard-codes a live value. */
const bump = (re) => (t) => t.replace(re, (m) => m.replace(/\d+/, (d) => String(Number(d) + 1)));

/** A tag in brains/ that the server filters out, or a name that is not there at all. */
const halfTag = brainDirs.find((d) => !playable.includes(d)) || 'no-such-tag';

const MUTATIONS = [
  ['the population is named for the wrong letter',
    (t) => t.replace(/\| `([a-z])(\d+)` … `\1(\d+)` \|/, (m, a, b, c) => `| \`z${b}\` … \`z${c}\` |`)],
  ['sudden death is quoted at the wrong second', bump(/From \d+ seconds the arena starts/)],
  ['a worked URL names tags that do not exist',
    (t) => t.replace(/oct=[A-Za-z0-9-]+&gor=[A-Za-z0-9-]+/, 'oct=no-such-tag&gor=also-not-here')],
  ['a worked URL names a tag with only one fighter',
    (t) => t.replace(/oct=[A-Za-z0-9-]+&/, `oct=${halfTag}&`)],
  ['a query parameter the viewer never reads', (t) => t.replace(/\?webgl=1/, '?slowmo=1')],
  ['the probe count is wrong', bump(/\d+ hand-written \*\*degeneracy probes\*\*/)],
  /*
   * Якорь пишется по ПЕРЕНЕСЁННОМУ тексту, а не по тому, как фраза читается.
   *
   * Строка «so nothing ends on a clock.» в README разорвана переносом, и
   * мутация, искавшая её целиком, молча не применялась: отчёт печатал
   * NOT APPLIED, счёт показывал 11 из 12, а страница обещала двенадцать.
   * Проверка, которая не проверяет и об этом говорит, — лучше молчащей, но
   * хуже работающей.
   */
  ['a hand-typed number with no source',
    (t) => t.replace('so nothing ends on a\nclock.', 'so nothing ends on a\nclock. A match lasts 21 seconds on average.')],
  ['the invariant count drifts', bump(/# \d+ invariants/)],
  ['the think rate drifts', bump(/context at \d+ Hz/)],
  ['the generation cost drifts', bump(/\(\d+ min, \$[\d.]+ a pair\)/)],
  ['a path that is not in the repository', (t) => t.replace('src/core/nav.js', 'src/core/navigation.js')],
  ['the rounding example rounds the wrong way',
    (t) => t.replace(/is served in ([\d.]+) and \1 is/, 'is served in 9.9 and 9.9 is')],
];

function falsify() {
  let missed = 0;
  // The control on the control: a page that already fails would make every
  // mutation below look caught, which is precisely the shape of self-flattery
  // this whole file was written to remove.
  const base = checkDocs().failures;
  if (base.length) {
    console.error('  README does not pass unmutated, so nothing below is evidence:');
    for (const f of base) console.error(`    ${f.split('\n')[0]}`);
    return MUTATIONS.length;
  }
  for (const [name, mutate] of MUTATIONS) {
    const text = mutate(README_ON_DISK);
    if (text === README_ON_DISK) { console.error(`  NOT APPLIED  ${name} — the sentence it edits is gone`); missed++; continue; }
    const { failures } = checkDocs({ text });
    if (failures.length === 0) { console.error(`  MISSED       ${name}`); missed++; continue; }
    console.log(`  caught       ${name.padEnd(46)} ${failures[0].split('\n')[0].slice(0, 78)}`);
  }
  return missed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--falsify')) {
    const missed = falsify();
    console.log(missed === 0
      ? `\nall ${MUTATIONS.length} mutations caught; README untouched on disk.`
      : `\n${missed} of ${MUTATIONS.length} mutations got past the checker.`);
    process.exit(missed === 0 ? 0 : 1);
  }
  const { lines, failures } = checkDocs();
  for (const l of lines) console.log(l);
  if (failures.length === 0) console.log('README and the repository agree.');
  else {
    for (const f of failures) console.error(`  ${f}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
}
