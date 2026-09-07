# Instruments — round-1 fix handoff

Lane: the measuring instruments. Everything below is a change to how Airena is
MEASURED, not to how it plays. The sim, the registry and the prices were being
changed in parallel by other lanes while this work ran; every number in here is
labelled with the tree it was measured on.

Tree: HEAD `8699fb6` + the uncommitted 07.09 overhaul, working copy of 07.09.

Files changed: `tools/matchworker.mjs`, `tools/matchpool.mjs`, `tools/sizebalance.mjs`,
`tools/kitbalance.mjs`, `tools/atombalance.mjs`, `tools/checkprices.mjs`,
`tools/bakeoff.mjs`, `reports/combat/spectate.mjs`, `brains/pilots/{rusher,kiter,controller}.js`,
`docs/COMBAT.md` §5 (and one sentence of §4).

---

## 1. The cooldown default — the measuring path now measures the real world

**Was** (`tools/matchworker.mjs`): `fixed = cooldown === undefined ? (real ? null : 8) : cooldown`.
A job that did not mention `cooldown` got **8 seconds on every ability** as long
as it was not the product path. `tools/sizebalance.mjs` — a listed gate — sends
exactly such jobs, so the body prices in `src/core/config.js` were found on a
cadence 2.7–4× slower than the one the game is played on, with all four pilots
planning around it.

**Now**: `fixed = cooldown === undefined ? null : cooldown` — absent means the
same as `null`, which means the registry's own cooldown. A league that really
wants one schedule for everybody has to say so with a number, in the job.

- the "8 s on the measuring path" paragraphs are gone from `matchworker.mjs`
  (~120–150) and `matchpool.mjs` (~180–185); the replacement paragraph says why
  the default flipped.
- `real` no longer implies anything about cooldowns; its doc in both files now
  says it enforces the legal kit size and nothing else.
- `sizebalance.mjs` and `kitbalance.mjs` jobs now carry an explicit
  `cooldown: null` (5 job literals in `kitbalance`, 1 in `sizebalance`), so the
  intent survives another change of the default.

### Result: `node tools/sizebalance.mjs --rounds=20` on the real cooldowns

400 fights, one brain and one kit on both sides, only the body differs, all
bodies 25 points. Instrument clean: identical bodies → 50.0%.

| body | hp | max speed | radius | win rate | was (8 s world) |
|---|---:|---:|---:|---:|---:|
| even | 178.3 | 5.33 | 1.38 | 56.3% | 57.5% |
| **tanky** | 236.7 | 5.33 | 1.80 | **75.6%** | 56.9% |
| **small** | 120.0 | 5.66 | 1.20 | **26.6%** | 37.5% |
| fast | 166.7 | 7.67 | 1.55 | 47.5% | 42.5% |
| agile | 180.0 | 4.20 | 1.37 | 44.1% | 55.6% |

**Worst deviation 25.6 pp against a 12 pp gate — RED, exit 1** (it was 12.5 pp
in the 8-second world, which is why the gate looked nearly-passing). Re-run
twenty minutes later, after the sim lane had landed more changes: even 55.3 ·
tanky 70.6 · small 23.8 · fast 53.4 · agile 46.9, worst deviation **26.3 pp**,
still red. The verdict is stable across the sim edits in flight; the exact
percentages are not, so re-run before pricing.
The real cadence roughly doubles the error and flips its shape: at ten casts a
fight, hp is worth far more than the 8-second measurement said, so the tanky
body runs away with it and the glass body cannot trade. **The body axis prices
in `src/core/config.js` (`BUILD_AXES`) need a re-price against this run, not
against D190's number.** `DESIGN.md` D190 ("worst body deviation 45 → 16
points") was recorded green on a red instrument in a world nobody plays.

---

## 2. `tools/atombalance.mjs` — the pricing regression

### 2.1 The `cost` feature is gone (balance review H3)

Kit cost is an EXACT linear sum of the piece counts. With it in the design
matrix, ridge's minimum-norm solution split every piece's value arbitrarily
between `cost` and the piece, and the re-price then read only the piece half —
which is why four passes oscillated (blink 5→4→5→6, root 5→3→3→2) instead of
settling, and why the cost-only slope rising 0.38 → 1.70 was being read as
progress.

- `cost` is no longer a column.
- One delivery dummy goes with it: a kit carries exactly three deliveries, so
  the nine delivery counts sum to a constant and are collinear with the
  intercept. The delivery appearing in the MOST kits is dropped as the baseline
  (best-measured, and deterministic from the sample); it is named in the report.
- The nine delivery values are re-centred to mean zero, and the re-centring
  happens INSIDE every bootstrap resample, so the baseline delivery gets an
  honest standard error instead of reading 0 by construction. Without that, the
  "no piece significantly negative" gate would have been blind to exactly one
  piece.
- Effect and channel values are absolute. The delivery block's common LEVEL is
  unidentifiable by construction and the report says so rather than parking it
  on one piece.
- `costOnly` (slope of win rate on kit cost) is still computed and printed —
  from its own one-column fit — so older reports stay readable.

### 2.2 The headline

**`value per point` = value (pp per unit) ÷ current cost, per piece. The
headline is its standard deviation across the 14 effects**, printed with the
mean and range:

> **Value per point — M ± SD pp/pt across the 14 effects (range … ).** Across
> all 30 pieces: M ± SD.

This is the founder's flatness quantity: a point of budget should buy the same
win rate wherever it is spent, so the number to drive down is the **sd**.

`corr(cost, value)` is printed one line below it, labelled as the secondary
reading it is: it measures the price ORDER, and it sat at 0.79–0.96 through four
passes in which a point on damage bought ~3 pp and a point on root bought ~−3.6.

The all-30-pieces spread is printed beside the effects one and is the looser
reading, because it carries the delivery block's arbitrary level.

### 2.3 Convergence verdict and exit codes

Printed FIRST in the report (as an `## **CONVERGED**` / `## **NOT CONVERGED**`
heading with the two numbers under it) and FIRST on the console.

| exit | meaning |
|---:|---|
| **0** | **CONVERGED** — no proposed price moves by more than one point **AND** no piece is significantly negative (`value < −2·se`). Also 0 for any `--dry` run, whatever it found. |
| **2** | **NOT CONVERGED** — one of those two conditions fails. The pass is real and the report is written; the prices are not settled. |
| 1 | the run itself failed (too few scored kits, a crash). |

The second half of the rule cannot be fixed by pricing — a piece already at the
floor of 1 that still reads −7 has no price left to lose — so a NOT CONVERGED
verdict caused by a trap sends the work back to the MAGNITUDES, and the report
says that in the sentence that lists the traps. The piece table gained a `neg`
column marking them, and the console prints `TRAP` on those rows.

A caller that only reads stdout can no longer record a red pass as done.

### 2.4 Re-price proposal

Kept as it was — `cost_i ∝ value_i` with one scale k bisected so the sum of the
proposed costs equals the sum of the current ones (the budget scale is a design
decision and a measurement may not move it), each price clamped to 1…10 — but
now derived from the ABSOLUTE coefficients.

New `--damp=D` (default 1 = unchanged behaviour) moves each price only part of
the way, `current + damp·(target − current)`, with k bisected on the damped sum
so a damped proposal is still budget-neutral. **The verdict is always judged on
the UNDAMPED target**, so turning damping up can never talk the gate into
passing. With `--damp=1` the `proposed` and `target` columns are the same number.

### 2.5 JSON shape — fields added, nothing renamed

`pieces[]` keeps `axis, id, currentCost, value, se, significant, proposedCost,
perPoint, kits, pilotNote` and gains `negative, targetCost, delta, baseline`.
New top-level keys: `verdict` (`converged, maxDelta, movers[], negatives[],
exitCode, dry`), `headline` (`perPointEffects, perPointAll, corrCostValue,
corrCostValueEffects`), `population` (see §3), `harmlessRejected`;
`fit` gains `baseDelivery`, `pricing` gains `damp`. Older reports stay readable.

### 2.6 `--dry`

New flag: a fast smoke run (defaults 40 kits × 6 games, 40 bootstraps; an
explicit `--n` / `--games` / `--boot` still wins). It prints the full report and
the verdict, labels the verdict ADVISORY, and **exits 0** whatever it finds,
because 40 kits cannot judge convergence.

---

## 3. Population health — printed at the TOP of every report

Every pricing report now opens with the world it measured in, with the
`docs/COMBAT.md` §3 contract target beside each row:

| row | definition | target |
|---|---|---|
| fight length, mean / median | seconds | median 20–35 s |
| reaching the burn clock | fights longer than `SUDDEN_DEATH_AT` | ≤ 35% |
| decided by | what took the last hit point: `hit` (an opponent) / `fire` (an ability's burn) / `arena` (the sudden-death burn). The sim logs all three as `kill`; they are separated by matching the loser's `death` line against a `burned` / `burnedOut` line within 0.05 s — the same rule `reports/combat/spectate.mjs` uses. | arena ≤ 20% |
| dead slots | paid abilities that never fired once, over paid abilities that could have. A `universal: true` slot (the free hop) is NOT counted: it is a body verb, and a fight that never needed it is not a fight with a dead ability. | ≤ 2% |
| dodges per fight | `evade` lines (i-frames swallowed a hit) + `miss` with reason `airborne` (a ground shape passed under an airborne body) | ≥ 1 |
| harmless kits redrawn | see below | — |

These come from a new `pace` object on every worker reply
(`tools/matchworker.mjs` → `paceOf()`, ~10 integers per match), documented in
`tools/matchpool.mjs`'s reply contract.

**Harmless kits.** Every sampled kit must carry at least one `damage` or `burn`
atom; a kit of three durations cannot take a hit point off anybody, so its
league game is decided by who was ahead at the bell and its row prices "who
survives a stall". Such draws are rejected and re-drawn, and the count is
printed. The count is normally **0**, because the grammar's own L2 rule
("nothing in the set takes health away") already bars them — the instrument
asserts it anyway rather than inheriting its population's most important
property from a rule in another file that could be relaxed without anyone
re-reading this one. The check runs BEFORE `validateKit` so the counter
attributes the draw honestly.

**Stale text fixed**: `atombalance.mjs` ~54–55 (the `--cooldown` flag doc) and
the generated report line ~583 no longer say "registry (cost-derived)"; the
rank-deficiency caveat in the header docstring now describes the design that
actually exists.

---

## 4. `tools/checkprices.mjs` — bound to the newest pass

The old gate correlated the registry's prices with a comment table copied from
the pass those prices were set from: 0.789 by construction, and it could not
fail on a balance regression. That half is kept (it is a real prose↔code bind).

Added: the gate now finds the **newest `reports/combat/atombalance-panel-*.json`
by mtime, PRINTS which file it bound to**, and asserts

1. **value per point across the effects has sd ≤ 0.8 pp/pt**, and
2. **no piece is significantly negative** (`value < −2·se`),

recomputing both from the pass's own `pieces[]` so it reads an old pass and a
new one the same way. If the pass carries a `verdict` block it echoes it.

### Current verdict — RED, and expected to be red

```
✓ bound to a pricing pass  reports/combat/atombalance-panel-v5.json
✓ the pass has a piece table  30 pieces
✗ value per point is flat across effects (sd ≤ 0.8 pp/pt)  sd 1.73, mean -1.10, over 14 effects
✗ no piece is significantly negative (value < −2·se)
    pull -4.1±1.3 @2, wall -4.2±1.2 @1, boost -4.4±1.2 @2, blind -4.4±1.2 @2,
    stun -4.5±1.5 @3, weaken -4.7±1.6 @2, dash -5.2±1.9 @3, root -7.4±1.3 @2
ПРОВАЛ: 2
```

**This is the correct reading of the v5 file, not a bug in the gate.** v5 was
run at the shipped prices with the old (cost-carrying) design, and it is the
pass the balance review scored 55/100. The gate goes green only when a v6 pass —
run after the sim's magnitude changes land — reports a flat per-point column and
no traps. The failure message names the command.

---

## 5. `docs/COMBAT.md` §5

Rewritten to describe the method as it now is: harmless kits excluded, pilots
that read live magnitudes and aim the aimed shapes, no `cost` feature and why,
the dropped delivery dummy and what stays relative, the convergence stop rule as
the exit status, the per-point spread as the headline with corr(cost, value)
demoted to secondary, and the population-health table at the top of every
report. A closing paragraph records that every measuring job now runs on the
registry's cooldowns.

One sentence of §4 was corrected because it stated the retired headline as
current ("the last pass reads cost ↔ value correlation 0.79 and 1.7 win-rate
points per point"); it now says those four passes were read by the wrong
headline and that v6 is the pass that judges the weights. **The §4 magnitude
table itself was not touched — it belongs to the balance lane.**

---
