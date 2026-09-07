/**
 * No text on top of text — the gate for §12's three widths.
 *
 * The fight HUD is three absolutely positioned blocks: the fighter panels are
 * pinned to the edges, the clock and its line stand in the middle. None of the
 * three knows the others exist, so "it fits" is a property of the WINDOW WIDTH
 * and not of the stylesheet, and it has to be checked at more than one.
 *
 * Found by measuring and not by looking: at 1280×720 the byline lay across a
 * cooldown tile (70×24 px) and the model id across the clock (112×16). At 1440
 * nothing overlaps at all, which is why nobody sees it on a work laptop, ever.
 *
 * ── THIS FILE USED TO EXIT ZERO WHATEVER HAPPENED ──────────────────────────
 *
 * It printed instructions and succeeded: it looked like a gate and was not
 * one. A review checked — `node tools/checklayout.mjs --url=http://localhost:9999`
 * against no server at all gave EXIT 0.
 *
 * So it was made honest in the other direction: it DEMANDED a probe result and
 * failed without one. Which is how it then spent three review rounds red. The
 * result was supposed to be pasted in by hand — open a browser, resize it six
 * times, run `PROBE` in the console, collect the answers into a JSON — and
 * nobody was ever going to do that twice. A gate whose evidence is a chore is
 * a gate that is permanently either red or stale, and §12's middle width went
 * unevidenced for exactly as long as this file demanded a favour.
 *
 * ── SO IT READS THE EVIDENCE THAT IS ALREADY BEING PRODUCED ────────────────
 *
 * `tools/shots.mjs` opens every screen state in headless Chrome at all three
 * of §12's widths and runs this file's own `PROBE` on each one, writing the
 * answer into `<state>[-w|-m].json` beside the picture. That is the same
 * measurement this gate wanted, taken by a machine, on every capture run, on
 * the tree it was run against. So the gate reads the capture directory:
 *
 *     node tools/shots.mjs --base=http://localhost:8787 --out=reports/screens/ui
 *     node tools/checklayout.mjs --shots=reports/screens/ui
 *
 * It judges what it finds and it also judges what it does NOT find: a
 * directory with no captures at one of the three widths fails, because the
 * acceptance criterion names three and a set of two is the state this gate was
 * red about in the first place.
 *
 * `--result=<file>` is still there for a hand-collected sweep over the wider
 * band (`SWEEP` below) — the widths a laptop actually opens the product at,
 * which no capture run walks. Both paths can be given at once.
 *
 * Not in `npm test`: the evidence comes from a real browser against a running
 * server, and `npm test` has to work on a bare machine.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** §12's three widths. A missing one is a failure, not a gap. */
const REQUIRED = [[1440, 900], [1280, 720], [390, 844]];

/**
 * The band a hand sweep should walk. §12 names three widths; a laptop opens
 * this product at any of these, and the collision above lived at 1280 because
 * that is where the HUD's three blocks first meet. Only checked when a
 * `--result=` file carries them.
 */
const SWEEP = [[1024, 768], [1200, 800], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]];

/*
 * The probe walks EVERY leaf text node of the HUD rather than a list of
 * selectors: a list misses exactly what nobody thought of. Two classes are
 * excluded, and both are named:
 *
 *   `.dmg` — the floating damage number. It is a world-space element that
 *     lives for a second: flying over text is its job.
 *   `.who` — the winner's plate. An animated slab that crosses the screen and
 *     leaves; in the settled state it is not there at all (measured: its
 *     rectangle is 0×0 the moment the animation ends).
 *
 * Everything else must not intersect in the SETTLED state — during the fight
 * and after it.
 */
const EXCLUDE = ['.dmg', '.who'];

/*
 * ── AND TEXT AT ZERO OPACITY IS NOT ON THE SCREEN ─────────────────────────
 *
 * The probe checked `visibility` and not opacity, and this interface hides by
 * opacity almost everywhere: the fighter panels fade out between fights
 * (`body[data-phase="searching"] .bar-wrap { opacity: 0 }`), the feed rests at
 * zero, `#boot` fades. All of it kept its layout box, so the probe went on
 * measuring words nobody could see — and reported them colliding with the
 * screen in front. Measured: `birth-failed-m` came back with six "overlaps",
 * every one of them a faded fighter panel behind the birth card, in a picture
 * where none of those words is visible at any zoom.
 *
 * A gate that cries at wallpaper is a gate people learn to read past, so the
 * walk now multiplies the opacity an element and its ancestors actually carry
 * and drops anything under a twentieth. It is the same judgement `visibility`
 * already got, made on the property this product hides things with.
 */
export const PROBE = `(() => {
  const skip = ${JSON.stringify(EXCLUDE)};
  const carried = (el) => {
    let o = 1;
    for (let x = el; x && x.nodeType === 1; x = x.parentElement) o *= Number(getComputedStyle(x).opacity);
    return o;
  };
  /*
   * A ROW SCROLLED OUT OF ITS OWN BOX IS NOT ON SCREEN.
   *
   * getBoundingClientRect answers where a node WOULD be, not where it is
   * painted: inside an overflow:auto list, the rows past the fold report
   * rectangles below the box, on top of whatever the box is standing above.
   * Measured on history-detail-w: the fight's last two beats -- clipped by
   * .beats { overflow-y: auto } and invisible in the picture -- were reported
   * as text lying on the "Show all 16" button under them, three findings on a
   * capture with nothing wrong in it. A gate that fails on a correct screen is
   * a gate people learn to ignore, so the clip is honoured: a box that scrolls
   * only owns the part of a row inside it.
   */
  const clipped = (e, r) => {
    for (let p = e.parentElement; p && p.nodeType === 1; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (!/auto|scroll|hidden|clip/.test(cs.overflowY + cs.overflowX)) continue;
      const b = p.getBoundingClientRect();
      const w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
      const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      /* Less than half the row inside its own clip: what the reader sees is a
         sliver or nothing, and it is not evidence of a collision. */
      if (!(w > 0 && h > 0) || w * h < r.width * r.height * 0.5) return true;
    }
    return false;
  };
  const walk = (n, out = []) => {
    for (const c of (n ? n.childNodes : [])) {
      if (c.nodeType === 3 && c.textContent.trim()) {
        const e = c.parentElement;
        const r = e.getBoundingClientRect();
        if (r.width > 4 && r.height > 4 && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden' && carried(e) > 0.05 && e.closest('[hidden], #devsockets') === null && !clipped(e, r)) out.push({ s: c.textContent.trim().slice(0, 16), r, e });
      } else if (c.nodeType === 1) walk(c, out);
    }
    return out;
  };
  const boxes = [...walk(document.querySelector('#hud')), ...walk(document.querySelector('#screen'))]
    .filter((x) => !skip.some((k) => x.e.closest(k)));
  const hit = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].e.contains(boxes[j].e) || boxes[j].e.contains(boxes[i].e)) continue;
      const a = boxes[i].r; const b = boxes[j].r;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 2 && h > 2) hit.push(boxes[i].s + ' × ' + boxes[j].s + ': ' + Math.round(w) + '×' + Math.round(h));
    }
  }
  return hit;
})()`;

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;

const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;
const key = ([w, h]) => `${w}x${h}`;

/**
 * Read a capture directory into `{ '1280x720': [{ state, overlaps, covered }] }`.
 *
 * Both findings are collected, because both are the same acceptance criterion
 * read twice: `overlaps` is the pairwise arithmetic this file's `PROBE`
 * returns, `covered` is `shots.mjs` asking the compositor which words are
 * standing under a solid panel. A line you cannot read is a line you cannot
 * read, whichever probe noticed.
 */
function fromShots(dir) {
  if (!existsSync(dir)) return { error: `${dir} does not exist — run tools/shots.mjs first` };
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'run.json');
  if (!files.length) return { error: `${dir} holds no capture JSON — run tools/shots.mjs first` };
  const at = {};
  const broken = [];
  for (const f of files.sort()) {
    let j;
    try { j = JSON.parse(readFileSync(join(dir, f), 'utf8')); }
    catch (e) { broken.push(`${f}: ${e.message}`); continue; }
    if (!j.size) { broken.push(`${f}: no size field — written by an older shots.mjs`); continue; }
    (at[j.size] ||= []).push({
      state: j.state || f.replace(/\.json$/, ''),
      overlaps: Array.isArray(j.overlaps) ? j.overlaps : [],
      covered: Array.isArray(j.covered) ? j.covered : [],
    });
  }
  return { at, broken };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const shots = arg('shots');
  const file = arg('result');
  console.log('\n  TEXT ON TEXT — §12, THREE WIDTHS\n');

  if (!shots && !file) {
    console.log('  Nothing to read. The short way:\n');
    console.log('    node tools/shots.mjs --base=http://localhost:8787 --out=reports/screens/ui');
    console.log('    node tools/checklayout.mjs --shots=reports/screens/ui\n');
    console.log('  The capture run opens every screen state at each of §12\'s widths and');
    console.log('  runs this file\'s own PROBE on each one, so the evidence this gate needs');
    console.log('  is a by-product of the evidence a review already asks for.\n');
    console.log('  A hand sweep is still accepted: run PROBE in the console at each width');
    console.log('  and pass {"1280x720": [], "1366x768": [], …} as --result=<file>.\n');
    console.log(`  Required: ${REQUIRED.map(key).join(', ')}`);
    console.log(`  Sweep:    ${SWEEP.map(key).join(', ')}\n`);
    console.log(RED('  FAILED: no probe result — there is nothing to check\n'));
    process.exit(1);
  }

  let bad = 0;

  if (shots) {
    const { at, broken, error } = fromShots(shots);
    if (error) { console.log(RED(`  FAILED: ${error}\n`)); process.exit(1); }
    for (const b of broken) { console.log(RED(`  ✗ ${b}`)); bad++; }
    console.log(`  ${shots}\n`);
    for (const w of REQUIRED) {
      const k = key(w);
      const rows = at[k];
      if (!rows?.length) {
        /* The whole reason this gate was written. Two widths out of three is
           the state §12 was already failing at, and silence about the third
           reads exactly like a pass. */
        console.log(RED(`  ✗ ${k.padEnd(9)} no capture at this width — shots.mjs must walk it`));
        bad++;
        continue;
      }
      const lapped = rows.filter((r) => r.overlaps.length);
      const buried = rows.filter((r) => r.covered.length);
      if (!lapped.length && !buried.length) {
        console.log(`  ✓ ${k.padEnd(9)} ${String(rows.length).padStart(2)} states, nothing on top of anything`);
        continue;
      }
      console.log(RED(`  ✗ ${k.padEnd(9)} ${String(rows.length).padStart(2)} states,`
        + ` ${lapped.length} with text on text, ${buried.length} with text under a panel`));
      for (const r of lapped.slice(0, 4)) console.log(RED(`      ${r.state}: ${r.overlaps[0]}`));
      for (const r of buried.slice(0, 4)) console.log(RED(`      ${r.state}: ${r.covered[0]}`));
      bad++;
    }
    /* Widths the run captured that §12 does not name are worth a line, not a
       verdict: somebody added a size and the gate should say it saw it. */
    const extra = Object.keys(at).filter((k) => !REQUIRED.some((w) => key(w) === k));
    if (extra.length) console.log(DIM(`\n  also captured: ${extra.map((k) => `${k} (${at[k].length})`).join(', ')}`));
  }

  if (file) {
    let data;
    try { data = JSON.parse(readFileSync(file, 'utf8')); }
    catch (e) { console.log(RED(`\n  FAILED: ${file} cannot be read — ${e.message}\n`)); process.exit(1); }
    console.log(`\n  ${file}\n`);
    for (const w of SWEEP) {
      const k = key(w);
      const got = data[k];
      /* A hand sweep is allowed to be partial — it is the wider band, not the
         acceptance criterion. What it may not do is claim a width it skipped. */
      if (got === undefined) { console.log(DIM(`  · ${k.padEnd(9)} not in this sweep`)); continue; }
      if (!Array.isArray(got)) { console.log(RED(`  ✗ ${k.padEnd(9)} not an array of findings`)); bad++; continue; }
      if (got.length) { console.log(RED(`  ✗ ${k.padEnd(9)} ${got.length} overlapping — ${got[0]}`)); bad++; continue; }
      console.log(`  ✓ ${k.padEnd(9)} nothing on top of anything`);
    }
  }

  console.log(bad ? RED(`\n  FAILED: ${bad}\n`) : '\n  HOLDS\n');
  process.exit(bad ? 1 : 0);
}
