# Handoff: lightning and laser finished, four new elements, every form per element

Written 03.09.2026 at the end of the session that worked `docs/VFX-PLAN.md` from §8.1 to the end of Part D. Repo docs and code comments are Russian; this handoff, the plan and the notes in `docs/vfx-notes/` are English.

**The work order was `docs/VFX-PLAN.md`. It is now largely executed.** This file says what was built, what each stage measured, what independent judges scored it, and — honestly — what is still below the bar.

## Overview

The founder's two structural verdicts are answered and the missing forms exist:

1. **"The bolt is a chunk that flies with the lightning inside it."** Rewritten. The discharge now stands in space whole from the hand to the end and only a sliding window of it is lit; the head advances at the projectile's speed and the tail leaves the hand behind. Measured: at 0.15 s the hand box holds 117 hot pixels, at 0.35 s **zero**, while the floor keeps the wake. The discharge also ends *where the projectile ended* — `vfx.flight` links the sim's launch record to its impact record (§7.2).
2. **"The shield is decorated, not built — loose sticks glued on at random."** Rewritten. Filaments are random walks **on the shell's surface** (`surfaceSegs`): every node is projected back onto the ellipsoid and every turn is a Rodrigues rotation about the local normal, so no stroke leaves the surface and none crosses the interior. Cells persist between restrikes — measured node drift **0.038 m** against 0.23 m (worst 1.23 m) for the plan's first sketch. The same primitive now carries impact, status, charge and the wall.
3. **"Show me dash, blink, jump and wall per element."** Lightning, frost and ember each got all five (with status). Kinetic and void keep stock silhouettes, but those were repainted for the white floor (§7.8).
4. **Four new elements** — gravity, time, acid, radiation — exist as modules, registry entries, decals, seeds and gates, all `unreleased`.

Nine elements × thirteen forms = **117 frames, zero console errors**, in one sweep: `reports/vfx/after3/`. Review gallery: `reports/vfx/gallery/index.html`.

## Judged scores (independent judges, frames against the written spec, 0–100)

| stage | what | score | note |
|---|---|---|---|
| A0 | primitive additions (`tail`, `lift`, `surfaceSegs`, `BURN`) | — | verified numerically, `docs/vfx-notes/t-surface.mjs` |
| A1 | lightning beam | 45 → 47 → **58** | three rounds; the "diamond lattice" defect is fixed, the jacket is opaque |
| A2/A3 | bolt and lob | **63** | the founder's verdict is lifted (rule 1 scored 78, branching 85, bundle 85, wake 90) |
| A4 | shield | 46 → **64** | round 4 built (even lattice coverage, shallow grounding with crackle) but not re-judged |
| A5/A7/A8 | cone, impact, charge | — | not judged; verified by eye and by smoke run |
| A9 | dash, blink, jump, wall | **64** | round 2 built (blink span, even wall lattice) but not re-judged |
| B | laser | — | round 3 built (pool budget, ribbon variety, narrow core) but not re-judged |
| C | frost and ember, five forms each | 60 → **68** | round 3 built (wall fire height, body smoulder) but not re-judged |
| D1 | gravity | 61 → **28** → round 4 built | see "the gravity lesson" below |
| D2 | time | **76** | passes |
| D3 | acid | **76** | passes |
| D4 | radiation | 43 → **61** | round 3 built (no dome on status, longer impact, bigger canister) but not re-judged |

The 70 threshold is met by time and acid; the shield, part C and the bolt sit at 63–68. Everything else has had at least one more round built against its judge's list; those rounds were not re-judged before the session ended, so **treat every score above as the score of the round BEFORE the last commit**.

### The gravity lesson (worth reading before touching any element)

Gravity went **down** from 61 to 28 on a re-judge. The cause was a real bug in reasoning, not judge noise: the identity asks for "a near-black core with a thin pale rim", and I gave the shell a `fres^4.5` rim. On a body-sized sphere that exponent covers a **wide crescent** in screen space — and against a dark background (the cover boxes, the fighter's own dark hull) a near-black fill at 50 % alpha does nothing at all, so the only thing left is the pale crescent. The effect read as a glossy glass dome: the exact opposite of the intent.

**The rule that follows: on this arena, dark elements can only be carried by the WHITE FLOOR.** A dark overlay over a dark body is invisible by construction. Round 4 narrowed the rim to `fres^11`, **removed the shell from `status` entirely**, and moved the whole "weighed down" read onto floor rings that follow the body plus dust falling twice as often. That is the same lesson as P3, applied in the other direction.

**And a second rule the judges taught twice: a translucent sphere around a fighter reads as a SHIELD, whatever colour it is.** Radiation's "sickness" used a body-scaled dome and was scored as a kind confusion ("this is the language of a shield ability"); gravity's "weighed down" had exactly the same problem. Both now carry their status with particles on the capsule and marks on the floor, and the shell stays a cast-only signature.

**A third, measured:** picking a filament's start point uniformly inside the bounding box and projecting it outward is *not* uniform on a sphere — the diagonals get up to 40 % more density, which is why the shield's lattice bunched into one octant. Measured on 200 000 points across 24 equal-area sectors (`docs/vfx-notes/t-startlaw.mjs`): box law min/max **0.712** and worst sector **+11.2 %** over expected; sphere law **0.963** and **+1.8 %**.

## What was built, by part

- **A0 · primitives.** `tail` uniform (the lit window; `tail ≤ 0` means "all lit", so beam/cone/zone are untouched), `lift(t)` (the lob's parabola), `surfaceSegs` (lattices woven on an ellipsoid, cells persistent), `BURN` moved to `arc/util.js`. `docs/vfx-notes/PRIMITIVE-NOTES.md` §2 refreshed with the measurements. `metrics.py` gained a `navy` mode: the `path` threshold (`b ≥ 140`) does not see cooled residue at all — measured median of the 1.5 s carpet is (38, 57, 118), of which the old threshold kept 123 pixels out of 2543.
- **A1 · beam.** Four rounds. The regular chain-link lattice both judges named came from `bundleSegs` forcing *every* link sideways; links are now bimodal (straight runs, then sharp 31–58° turns), each filament has its own turn character and its own grid phase, and there are fewer, fatter filaments (6–12 at core 0.032 m, not 8–18 at 0.025). Jacket tail 0.8 at `mask^1.7`, same width. Acceptance: 0.38 s **993 hot / 2534 deep-blue** (thresholds 300/1400), 0.80 s **836 / 2243** (400/1900), residue by sixths `[475, 507, 625, 735, 542, 447]`, min/max **0.61** (threshold 0.40).
- **A2/A3 · bolt and lob.** Rewritten as above. A lob always lands (the sim sends no impact for a miss, and a thrown discharge that just stops is not a lob). Three endings: hit, blocked by cover, miss.
- **A4 · shield.** Rewritten as above. Two beats: the `self` record draws the cast and collapses by filament count; the lasting cage is opened by `status: shield`, which carries the duration (§7.7, §P10). Measured 5566 deep-blue in a 220×260 box at 1.0 s (threshold 900).
- **A5/A7/A8.** Cone: discharges are small bundles that grow one by one; crawls became glyph carpets. Impact: the discharge crawls over the **victim's capsule**, chosen by distance to the hit point (`who` is the caster, and SELF-atom impacts land at the caster). A live shield intercepts: the discharge runs on the cage and flares from the hit point. Charge: strands end **on the caster's surface** and crawl over it for the last third.
- **A9 + §7.3 + §7.8.** Dash, blink, jump, wall for lightning; `jump` and `wall` became "module adds, stock draws"; stock silhouettes got a normal-blended dark layer under the additive one.
- **B · laser.** The reviewer's major is fixed: one beam claimed ~3400 of 5000 body-pool slots (68 % per cast, and three simultaneous beams are normal); now ~26 %, density recovered by chip size. The DNA braid is broken into three kinds of ribbon (a nearly straight core, counter-winding ones, wraps with wide parameter spreads). Core narrowed 0.7 → 0.35 of the half-width with the jacket to 3.4: measured deep-blue **4320** against 1534, hot 1050 against 3066 — the ribbon stopped being bleached.
- **C · frost and ember.** Five forms each, on their own primitives. Ice wall is a hemisphere sunk into the floor (a box has constant fresnel per face and reads as three flat plates).
- **D · four elements.** Registry (`forms` per element, rule `E1`, `unreleased` + `releasedElements()`, `element_unreleased` at the HTTP edge, `readingCount` by enumeration — still 495), kit additions (`lens`, sector `shockwave`, decal `at`, four decal types), four modules, six seed creatures into **`data/vfx-stand.db`**, and gates in `checkgrammar`/`checkforge`/`checkspec`. The forge prompt now names the closed form lists and, on an `E1`-only violation, keeps the player's skill and swaps its element to kinetic instead of substituting a preset.

## Known issues and blockers

- **Six stages are below 70 as last judged** (see the table). Each has one more round committed but not re-judged. Judge them first.
- **Gravity's lens is unverified.** `kit.lens` writes into the distortion output; no pinching of the background is visible in any frame. Either this pipeline has no MRT distortion pass, or the proxy is being culled. Check on a build with MRT before assuming the code is wrong.
- **Captures pollute each other.** The capture tool reuses one page across kinds and decals hold 20 s, so a form's frames can contain another form's floor marks. One judge mistook leftover soot for a jump's landing. Either clear decals between kinds or shoot one kind per page.
- **The broadcast camera looks along the cast** (both fighters and the camera are on the same diagonal), so on `beam`/`bolt` frames the far fighter hides behind the near one and the effect is foreshortened into a column. This is deliberate (the plan calls broadcast "26 m along the cast"), but judges read it as a defect every time; tell them, or move the fixture's fighters off the camera diagonal.
- **Radiation has no beam.** It is the plan's phase-2 form and is deliberately absent from `forms` and from the module.
- Everything from the earlier handoffs still stands: the replay console error in `loadbody.js`, the `tubeMat` pool key, pooled-uniform sharing at the seventh simultaneous effect, WebGL2 unverified for fire/lightning/laser, `preview/elements.html`'s bloom-only pipeline.

## Next steps

1. **Re-judge the six stages** whose last round was not scored: shield, beam, A9 forms, laser, part C, gravity, radiation. The frames are `reports/vfx/{a4-self/i4, a1-r5/i1, a9/i3, b-laser/i3, c/i2+i3, d-grav/i5, d-ar/rad3}`.
2. Show the founder `reports/vfx/gallery/index.html` and get his verdict on the four new elements. **Releasing any of them edits frozen `SPEC.md` lines and needs his written ok** (plan §7.5 step 11); until then they stay `unreleased` and seeded only into `data/vfx-stand.db`.
3. Open questions for the founder are unchanged (plan §4): a "kinetic" beam distinct from the laser; a real travel phase for the grammar dash; `pull` toward a zone centre so gravity's well reads as a well.

## Important context

- Servers: dev viewer `PORT=8823 node src/server/index.js`, founder's stand `cd .claude/worktrees/stand && PORT=8830 node src/server/index.js`, preview `node preview/server.mjs` (8899).
- Capture: `tools/vfxshot-lock.sh` (stills), `tools/vfxclip.mjs` (motion — a discharge that flies as a chunk is invisible in stills), **`tools/vfxseq.mjs` (new)** for sequences of records with delays: bolt + the impact of the same pair, `self` + `status: shield`. Metrics: `docs/vfx-notes/metrics.py` (`box`, `path`, `navy`, `extent`, `crop`).
- A full sweep of 9 elements × 13 forms takes ~25 minutes and exceeds a 10-minute command timeout; run it in the background.
- `reports/vfx/` is git-ignored; frames, clips and the gallery live only on this machine.
