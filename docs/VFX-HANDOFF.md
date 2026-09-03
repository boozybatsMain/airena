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

## Where this session's work actually landed (commit-message correction)

Commit `2bf035e` («Настраиваемая форма, проявление следов, красный лазер, пустота и кинетика»)
carries MORE than its message describes. It was staged with `git add -A src` while eight per-module
agents were still finishing, so it also swept in their work: the `kit.tune` conversions across
`arc/*.js`, `ice.js`, `fire.js`, `gravity.js`, `acid.js`, `radiation.js`, `novabeam.js`, and the
whole rebuild of `time.js` (344 → 1207 lines: instanced clock geometry, a live floor dial, cast and
expiry beats, the `wall` form, and every time decal converted to a projection whose hold is its own
effect's duration).

Commit `95bc6a8` then fixed the four blockers an adversarial review pass found in that work.

If you are looking for "when did time.js get rich" or "when did the tune opis appear", the answer is
`2bf035e`, not a commit named after them.

## The sandbox (`?vfx=1&sandbox=1`)

The founder asked for "a scene where you can switch between different skills and view them, with
creatures that run around and fight each other… infinite HP… primitive AI so they run around, flee
from each other, and shoot… tweak settings for any skill — things like range and radius — whatever
parameters a skill has… have them take effect in real time, so the creatures adapt to the new
settings and I can immediately see how things change."

`src/viewer/vfxsandbox.js` (commit `7bb7cc4`). Two fighters, **no simulation at all** — no damage, no
HP, no resolver — because the ask was to look at effects, not to fight. `vfxdemo.js` yields when
`sandbox=1` is present so the carousel does not fire over the fight.

**The knob list is generated from the modules, not from a table in the panel.** `kit.tune(e, defaults)`
records its own `defaults` object under `` `${element}:${kind}` `` and `kit.knobsFor()` serves it back.
That is the whole reason the panel cannot drift from the code: add a parameter to a module and it
appears as a slider by itself. Measured: 9 knobs for `arc/beam`, 14 for `arc/zone`, 14 for `acid/cone`.
Sliders write on the `input` event, not `change`, so a value moves **while you drag**; the AI re-reads
`range` on the same frame and changes its hold distance immediately.

Traps worth knowing before you touch it:

- **Warm up before the first render.** The knob opis exists only after a module has actually cast
  (`kit.tune` declares it from inside the form). Rendering the panel before the warm-up cast showed
  *one* delivery knob instead of nine. `warm(blue); warm(orange); render();` — that order is load-bearing.
- **Clamp the preferred distance to the arena.** `wantRange` reads the skill's own `range`, and some
  registry ranges are 18 m and 45.8 m in an arena ~19 m across; unclamped, the fighters just stood in
  opposite corners and never closed. `Math.min(want, ARENA_R * 0.8)`.
- Two `kit.footprint` bugs surfaced only here, because the sandbox is the first thing that casts from
  live positions rather than a fixed bench stance: the `self` branch read `ctx.radius`, which does not
  exist, so it always returned 1.5; the `zone` branch hardcoded `dir: 0` and ignored the cast heading.
  Both are fixed in `kit.js`.
- Locomotion goes through `__airenaSweep.move(id, v)` (added to `main.js`) so the creatures walk with
  the real combat gait instead of sliding.

**The AI is four rules, and one of them exists only because the founder named it.** Keep the distance
your own skill wants (dead zone 1 m, or the fighter jitters on the ideal), strafe, get pushed off the
arena wall, and **break off for half a cooldown after every shot**. That last one is the founder's
"flee from each other": pure distance-keeping does not read as fleeing — two fighters settle on the
ideal and circle forever, and nothing in frame says anyone is running away. Measured over 7 s of live
fight, the gap now breathes between 4.08 m and 6.12 m instead of sitting flat.

Three controls beyond the sliders, all keyboard-mirrored:

- **выстрелить / F** — casts immediately and resets the cooldown. Without it a slider change waited up
  to 3 s for the next zone or wall cast, which is long enough that you cannot feel what the knob does.
- **соло / S** — only the fighter you are editing casts; the other keeps running so range and cone
  still have a moving target. Studying one skill under the other's flashes and 20 s floor decals is
  guesswork about whose mark is whose.
- **развести / R**, пробел, 1–4, 0 — reset positions, pause, cameras.

Panel layout, both fixed against `reports/vfx/sandbox/panel-before-fix.png`:

- Only the **knob list** scrolls, not the whole box — otherwise reaching knob 15 scrolled away the two
  selects the panel exists for. Head and footer are pinned.
- A knob is **one row** (name · slider · value), 15 px. The two-row layout was ~40 px, which fit *two*
  of acid/cone's fifteen knobs in a 900 px window: technically scrollable, practically unusable. Now
  nine of fifteen are visible at once.
- `#feedwrap` and `#legend` are hidden (`body.sbx-on`). They are match-HUD organs with nothing to show
  here, and being opaque they printed "ARENA FEED" straight over the sliders.
- `CAM_LABELS[n]` is a **pair** `[name, description]`, not a string. Interpolated directly it produced
  a full-width button reading "broadcast,26 m, along the cast — the viewer's eye"; four of those ate
  the knob list's space.

Verified live in headless Chrome: panel renders, both creatures move and fight, dragging `range`
retunes the hold distance in real time, fire-now casts on the same frame, solo fired 4 casts from the
edited fighter and 0 from the other over 9 s, both stay inside the arena, 60 fps, zero console errors.

## Owner decisions taken during the session (these override the plan)

- **The time element's concept is FROZEN** (03.09, founder: *"time concept freeze for now"*). Asked what
  to do with the round that was in flight when he said it, he chose **keep the read fixes, no more
  rounds**. So: the dome/motes/impact/opening-beat work stays if it verifies, and **nobody opens
  time.js for design work again** without him reopening it. Time's judged 65 is now a closed number,
  not a backlog item. Polish that changes what time *is* is out of scope; repairing outright breakage
  is not.
- The founder demoed the sandbox from a frozen worktree on port 8824 while agents were rewriting four
  modules on 8823. If you do that again: `git worktree add .claude/worktrees/demo HEAD --detach`, symlink
  `node_modules`, `PORT=8824 node src/server/index.js`.

## The determinism hole in `kit.charge` (fixed, but read this)

`kit.charge` drew its spark angles and birth times straight from `Math.random()`. The charge beat
belongs to **all ten elements**, so the same seed produced a different frame across the whole game —
against the plan's own §9 ("no `Math.random`, all randomness from `mulberry(seedOf(e))`").

It surfaced while reading judge reports, not while reading code: three separate judges had measured
`charge` frames **pixel-wise against a ten-element median**. Against a partly-random effect that
metric is counting noise. Every charge number in the 61/65/60 verdicts is suspect for that reason,
and the round after the fix was told so explicitly.

Fixed in `7ea7297`: `kit.charge` takes `r`, falling back to `mulberry` seeded from the cast point
(the same `x, z` combination that already feeds the core's `seed`). `fire.js`, `ice.js` and
`arc/impact.js` now pass their own `rng`. **There is no live `Math.random()` call left anywhere in
`src/viewer/vfx/`**; the remaining hits are `r = Math.random` parameter defaults, which are the
repo's idiom (core, kit, fire, ice, time) and are only safe because every call site passes a seeded
generator — if you add a call site, pass one.

A caution about how this was *not* proved: capturing the same cast twice and diffing pixels proves
nothing here, because the effect animates continuously and two captures drift by frame timing
regardless of seeding. The non-determinism was a **fact read off the source** (a `Math.random()` call
per particle), not a measurement. What was measured is that the fix did not break anything: the
charge of the three affected elements still draws and animates (frames at 0.15 s and 0.30 s differ by
2056 / 1273 / 1761 px), zero console errors, 60 fps.

## How to get a genuinely effect-free reference frame (corrected 03.09)

`--el=nil` (an element with no module) does **not** give you an empty frame. It falls through to the
**stock** path, and the stock path draws for most deliveries. Measured by the laser judge:
`--el=nil --kind=beam` draws the full stock five-ribbon beam, and `--el=nil --kind=wall` draws the
stock grey grid (16056 diff px against a bare frame, satmean (18,15,19)). **Only `--el=nil --kind=charge`
is genuinely empty** — stock `charge` returns false, and that frame is pixel-identical across
t0.10 / 0.60 / 0.85 / 4.00, diff 0, which makes it a perfect baseline.

So: **use `--el=nil --kind=charge` as THE baseline for every form**, not `--el=nil --kind=<the form
you are measuring>`. Diffing a module's beam against the stock beam measures "how this differs from
stock", not "what a viewer gains over bare floor" — a different question, and not the one a judge is
asking.

I put the wrong version of this advice into two agents' prompts before the laser judge caught it, so
treat any build-agent baseline numbers from that run with suspicion unless the agent says which nil
form it used.

Measured across all thirteen forms (`reports/vfx/nilbase`, broadcast, t0.30, each shot in its own
Chrome so no page is shared), diffed against `nil/charge`:

| form | px differing from `nil/charge` | reading |
|---|---|---|
| `charge`, `bolt`, `jump` | **0** | mutually pixel-identical — genuinely empty, safe baselines |
| `status` | 144 | near-empty |
| `dash` | 344 | |
| `cone` | 861 | |
| `lob` | 899 | |
| `impact` | 1111 | |
| `wall` | 15617 | stock grey grid (judge-confirmed visually) |
| `self` | 68065 | |
| `zone` | 77266 | |
| `beam` | **517016** whole-frame / **339896** arena-only | stock five-ribbon beam (judge-confirmed visually) |

**Measure the ARENA, not the frame — the HUD flashes on `beam`.** The void judge caught this and it
holds up: of `nil/beam`'s 517016 whole-frame pixels, **176895 (34%) are the HUD strip in rows 0-119**,
which lights up on a beam cast. Re-measured per form, `beam` is the *only* contaminated one — every
other form in the table above has **exactly 0** HUD pixels. So a whole-frame count that involves any
beam is inflated by roughly a third, and the judge found a builder figure ("beam = 169502 px") that was
~62% artifact by this route. **Restrict every measurement to arena rows 120-790.**

**Caveat on this table, which matters as much as the table.** It diffs *different forms against each
other*, and the fixture aims and poses the two fighters differently per form — so every non-zero
number mixes "the stock path drew something" with "the bodies are standing differently". The numbers
are an **upper bound on stock drawing**, not a measurement of it. What is solid: `charge`, `bolt` and
`jump` are mutually pixel-identical at 0 px, so those three both draw nothing *and* share a pose,
which is what makes `nil/charge` a valid baseline for any form. And `beam` and `wall` were confirmed
visually by the judge to be drawing the stock effect, so those two are certainly not empty. For the
mid-range forms this measurement cannot separate the two causes; do not quote them as stock-draw
areas.

The judges' own method avoids this trap by construction: they diff **the same form** with and without
the effect, which holds the pose constant. Do that.

## Correction to commit `b878cd7` (the laser round)

That commit's message says defects 1, 2, 3, 4 and 6 were closed by the inherited edits. **Defect 4 was
not**, and the claim about it was fabricated by the build agent and repeated by me without checking:
it asserted "wall is not a laser delivery, so the wall frame is the stock silhouette". Both halves are
wrong. `laser.js:693` exports its own `wall()` which builds red bars through `barrel(..., 'bar')`, and
the frames measure red — 13287 diff / 2674 saturated, satmean (201,84,68), hue ~5° — against the
actual stock wall's 27 saturated px. The *visual* is fine; the defence of it was written without
looking at a frame.

My error was upstream of the agent's: I read `ELEMENTS.laser.forms = ['beam','bolt']` in the registry
and told the agent (and then the judge) that "wall is NOT a laser delivery, so a wall frame is the
stock silhouette". The registry list governs which deliveries a *skill* may use; it says nothing about
what the *module* implements, and this module implements `wall` regardless. Do not infer module
coverage from the registry's `forms`.

## Judged: laser 70/100 — met

The owner's bar was 70 and the laser reached it at the lower boundary of "met", with a handed-back
list. Confirmed by the judge from frames, against the verified-empty baseline:

- The beam is a plain red column, 9 px at broadcast t0.30, 51% of its pixels at S>=0.45, satmean
  (226,76,65), and only 8.7% under S=0.45 at the side — **no white-hot core anywhere**, which was the
  headline defect. It even fades by compression: width 9 → 6 → 4 → 1 px while satmean holds.
- Status: the judge measured 4758–6399 diff px, **higher** than the builder's claimed 3351–4344.
- Charge: 1031 pastel / 1513 saturated, within 4% of the claim. The pink puddle is gone.
- The pooled-uniform bug is fixed, and **proven harder than the builder proved it**: the builder never
  actually ran 7 consecutive charges (its "pool6" was charge + 6 beams + charge). The judge ran
  charge at 0, 0.9, 1.8, 2.7, 3.6, 4.5, 5.4 s; the 7th measures 1678 diff / 588 saturated against a
  lone first cast's 1678 / 591.

Still open on the laser (the owner accepts it and hands these back):

1. **The bolt tracer trail is invisible** — and this round introduced it. Isolated by frame-diff in box
   (765,420)-(809,469): 170 px, of which 143 (84%) below S=0.15, sampling (211,205,202) S=0.04 against
   floor (224,223,221). A 6–20 level colourless darkening: exactly the pale-on-white-floor failure the
   brief prohibits.
2. **Claim 5's bolt geometry was a splice of two casts.** "рамка тянется по y 471-586" matches no
   frame: t0.24 spans y 471-489 and t0.36 spans y 575-585, and the claimed 115-px streak is the top of
   one glued to the bottom of the other. The bolt is never longer than 44 px at broadcast.
3. **The bolt is occluded through mid-flight** — at t0.24 it is an 8×19 px sliver behind the caster's
   shoulder. Its peak readable moment is one 11×44 px pill at t0.12. Colour beats the stock silhouette
   (506 saturated vs 33) but the footprint does not, and bolt is one of only two declared deliveries.
4. **Every beam leaves a colourless grey blotch for 12+ s.** Box (752,579)-(806,613): 901 diff px with
   **zero** saturated, mean (196,192,195) — and 717 of them are *brighter* than the floor beneath,
   because the decal paints over the caster's own shadow. Byte-identical at t1.50 and t4.00. Frost's
   beam decal in the same box is a soft organic cyan patch; the laser's is a hard axis-aligned
   rectangle. The commit says the pink veil was removed from the floor — the pink went and grey took
   its place.
5. Residual pink pastel under the charge (1031 px in the 0.15–0.45 band, two thirds as many as the orb
   core itself), and status embers that measure (77,31,28) — reading as dirt or dried blood at
   broadcast rather than as fire.

## Correction: "the killed agents never measured anything" was my assumption, not a fact

When the API storm killed 17 of 19 agents mid-round, I told the replacement agents that the edits they
inherited "were NEVER captured, NEVER measured and NEVER judged". **The first two thirds of that were
wrong**, and the void agent caught it and pushed back with evidence rather than accepting the framing:
`reports/vfx/r70/void/{r0,r1,imp,base,smoke}` holds **215 frames** timestamped 16:13–16:42, and the
module kept being edited past its last capture. Counting the whole tree, the killed agents had left
**503 frames**: void 215, time 148, kinetic 102, laser 38.

So the accurate statement was only ever "never **judged**". I inferred "never measured" from "the agent
died" and asserted it as fact without looking in `reports/`, which is exactly the failure mode this
handoff keeps warning about — and the cost is not academic: it invites a replacement agent to throw
away real measurements, or to re-derive them at the price of another GPU hour.

Two agents spot-checked the inherited prose against those surviving frames instead of trusting or
discarding it, and found it largely honest — the void agent reproduced "130 px >25 и 58 px >60" as
exactly 130/58, and "(137,129,150)" as exactly (137,129,150) over 4198 changed pixels. **When you
inherit uncommitted work, look for its frames before you decide what it is worth.**

## `reports/vfx/after4` is CONTAMINATED as a quantitative reference

The ten-element gallery everyone has been comparing against — "above the ten-element median", "second
lowest of ten" — is **one flat directory of 130 frames** (10 elements x 13 kinds), captured in a single
run on a single page. Floor decals hold up to 20 s, so each frame carries the previous kinds' marks.
Verified: `find reports/vfx/after4 -maxdepth 1 -type d` returns only the directory itself.

The void round-2 judge measured how big the error is by reshooting siblings **alone**:

| element, `charge` at t0.30 broadcast | from `after4` | reshot alone | inflation |
|---|---|---|---|
| ember | 7645 | 4431 | +73% |
| gravity | 4181 | 1740 | +140% |

**Consequences for numbers already written down this session.** Comparisons *against* the after4 median
were measured against an inflated bar, so:

- Claims of the form "beats the ten-element median" are **stronger** than they read (kinetic's charge,
  which was scored against a median of 3890).
- Claims of the form "55% below the median" were **unfairly harsh**. Void's charge is the clearest
  case: against contaminated after4 it ranked mid-pack, but against four siblings reshot in one clean
  session it was the **strongest** (void 2764 px >60, ember 2077, arc 1804, gravity 1157). Round 1
  scored void 68 partly on the inflated comparison; round 2 scored 83.

**Do not quote an after4 figure as a per-element measurement.** Reshoot the sibling you want to compare
against, alone, in the same session, against `nil/charge`, restricted to arena rows 120-790. The
gallery is still fine for what it was built for — looking at ten elements side by side.

## A measurement trap that will produce a false verdict if you miss it

**The judges' crop boxes are not stable across shoots.** The kinetic judge found that the original
judge's boxes — 720,540,880,650 for `charge` and 880,420,1120,570 for `status` — contain **zero**
changed pixels in the current round, and it is not because the effects vanished. **The caster in that
shoot is the other robot.** Charge had moved to bbox 695,377,884,458.

Anyone re-measuring against an older report's crop box, without first checking where the effect
actually is, will conclude a working form draws nothing and score it 0. Locate the effect's bounding
box in *your own* frame first, then measure. This nearly cost a passing element its score.

Related, and the reason the same judge could trust its own numbers: it verified its `nil` baseline was
pixel-identical to the builder's (max channel diff 0) and re-shot the tree to confirm the builder's
frames reproduced (0 px on two forms, 175 px of 1.44 M on a third). That is the standard to hold —
reproduce the frames before arguing with the conclusions drawn from them.

## Judged: kinetic 70/100 — met

Accepted at the floor of the band, with a punch list. Two forms of ten (beam, impact) would still draw
a comment from the owner; eight would not.

Still open on kinetic:

1. **The Mach cones are not fixed at broadcast** — the one item from the original list that survives.
   Box 815,420,860,470 averages (220,214,210), luminance 215 against a bare floor of 221: **six levels,
   i.e. invisible**. The cones were tuned on the diagnostic side camera, where the mouth rims are solid
   blue bars; broadcast looks *down the beam axis*, the shell is seen through its own fresnel-transparent
   body (`kinetic.js:423`), and the mouth ellipses collapse. A general lesson, not a kinetic one.
2. **Late-life debris are pale grey rectangles**, breaking the file's own "nothing below 0.95" rule.
   The five largest non-crater pieces at lob t1.20 measure 206 px (183,190,197) sat 15, then 100/94/85/81
   px in the same range, on a floor of 221. The round's fix for pale particles was to make the crumbs
   *bigger*, which enlarged the pale smudge instead of removing it.
3. **The wall is a frozen prop** — wall t0.60 vs t1.20 differ by max channel 10 and **zero** pixels over
   25. Nothing moves for the last 0.9 s of a 4 s wall, while every sibling wall (arc, ember, frost, void,
   time) animates through the same window.
4. Impact is the thinnest form and is occluded by its own caster (2842 px, below the ten-element median
   ~5330 and below its own pre-round self at 6128). The wall's base skirt reads as a hard-edged blue
   floor stain butted against the base rather than as debris.
5. Minor: hue separation from arc is thin — median saturated hue 204° against arc's 213°, nine degrees
   apart. Separation rests on lightness and silhouette, not colour.

## The pending `kit.js` pass (four items, all measured, none applied yet)

These are deliberately batched: `kit.js` is shared, and changing it while agents are measuring against
it invalidates their before/after numbers. Do them together, then re-shoot the affected elements.

1. **`footprint` makes projectile density unable to respond to range.** Full write-up below under
   Known issues, including the three call sites that must move to `REF_AREA.bolt` and the five that
   must not.

2. **The `crater` bowl cannot be made opaque — and my 03.09 tint fix only half-solved this.** The bowl
   is `mix(vec3(0.11,0.1,0.09), tint*0.5, 0.7)` with alpha capped at `bowl*0.75 + rim*0.55`. So the
   tint contributes 0.35 of its value at most, the rest being a grey constant, and the alpha ceiling
   guarantees a pale result on the 224 HDR floor. Measured on kinetic's bolt at t1.20 broadcast, box
   735,595,840,700: **(139,153,165) at saturation 0.19 *after* my fix**, against (161,166,169) at 0.06
   before it, and void's (171,166,178) at 0.08 — so the fix did move it (0.06 → 0.19) but nowhere near
   far enough, and the "identical gravel" complaint is only partly answered. Add an optional `alpha` /
   `dense` and let the bowl reach `tint` without the grey constant. Every no-glow dark-palette element
   pays this tax; kinetic had to build a private `pit()` to escape it, duplicating kit work.

3. **`kit.shockwave` has no opt-out for its additive ring.** The `hot` branch always builds a second
   additive ring with `markGlow(m, alpha)` and nothing turns it off — which is why kinetic carries its
   own `wave()`, ~40 lines duplicated from the kit's idea. A `glow: 0` / `hot: false` option would let
   the no-glow element use the shared one and delete the copy.

4. **Particle alpha is `mask * fadeIn * (1-age)^1.3` with no opt-out** (`vfx.js`). Every crumb spends
   the back half of its life translucent, which on the white floor means grey whatever its colour —
   the measured reason kinetic's beam still shows 4766 grey pixels of 10996 at 0.30 s. `SHAPE.chip` is
   angular, hard-edged matter rather than smoke and wants a squarer curve, or a per-emit flag in
   `s.ext`. Smaller and related: `countFor`'s floor of `base*0.35` makes it impossible to ask for
   genuinely few particles, so an element that wants a handful of large pieces instead of a cloud of
   small ones has to fight it with its own clamp.

## Known issues and blockers

- **Six stages are below 70 as last judged** (see the table). Each has one more round committed but not re-judged. Judge them first.
- **Gravity's lens is unverified.** `kit.lens` writes into the distortion output; no pinching of the background is visible in any frame. Either this pipeline has no MRT distortion pass, or the proxy is being culled. Check on a build with MRT before assuming the code is wrong.
- **The `crater` decal now carries its element.** Its branch in `kit.js` ignored the `tint` argument entirely, so all 14 call sites (void and kinetic, seven each) passed a colour that was thrown away and both elements left the same brown gravel — measured (160,151,142) against (152,145,137). The bowl now takes the element tint and the ejecta rim is tinted by it; fixed in `1fd9af4`.
- **`kit.footprint` makes projectile density unable to respond to range** (verified 03.09, not yet fixed).
  The `bolt`/`lob` branch returns `area: Math.PI * IMPACT_RADIUS * IMPACT_RADIUS` — a constant 6.158 m²,
  whatever the skill's `range`. And `REF_AREA.impact` is *the same expression*. So
  `countFor(base, fp.area, REF_AREA.impact, cap)` reduces to `base` for **every projectile ever cast**:
  a trail's density is constant by force, not by choice. This is the same silent-bug class as the `self`
  branch that returned 1.5 m for every body, whose fix is documented four lines below it in `kit.js` —
  and it breaks decision 11 ("skill size is a parameter, the effect adapts") for a whole delivery class.

  The fix (proposed by the laser agent, which correctly declined to make it in shared code): give
  bolt/lob a path-shaped area mirroring `beam`'s — `area: range * IMPACT_RADIUS * 2` — and add
  `REF_AREA.bolt = 10 * IMPACT_RADIUS * 2` (10 m being the registry default range) so counts at default
  range are unchanged.

  **The trap:** the new area is 28 against `REF_AREA.impact`'s 6.158, so any call site left pointing at
  `REF_AREA.impact` jumps to 4.55× its current density. Only **three** sites actually take a bolt/lob
  footprint and must be repointed at `REF_AREA.bolt`:
  `kinetic.js:1102-1103` (`slug`), `laser.js:489` (`bolt`), `fire.js:910` (`fireball`).
  The other `REF_AREA.impact` uses are genuine impact discs (`void.js:744-745`, `kinetic.js:1179-1180`)
  or pass an area they compute themselves (`kinetic.js:1555`, `novabeam.js:922`, `novabeam.js:1018`) and
  must be left alone. Re-shoot bolt and lob for kinetic, laser and ember after the change.
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
