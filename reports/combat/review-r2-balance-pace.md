# Review r2 — balance & fairness / pace & ability use (07.09.2026)

**Score: 73 / 100 — balance & fairness.** Not ship. The central complaint of
round 1 — a point of budget bought wildly different amounts of win rate
depending on where it was spent — is now demonstrably closer to true: the
per-point spread across effects fell 1.73 (v5) → 1.46 → 1.30 → 1.21 →
**1.11** (v9, reproduced live via `checkprices`), the share rule stopped
taxing control atoms riding a damage cast, and the body league gate is green
on a real run (worst deviation **10.3 pp**, reproduced this round). Two
pieces (knock, weaken) are still significant traps, both pinned at the price
floor and explicitly deferred to a magnitude pass rather than swept under the
rug. What keeps this under 80: the v9 pass that everything downstream is
built on is **NOT CONVERGED by its own stated rule** (still proposing moves
up to 5 points) yet is treated as final in `DESIGN.md`/`docs/COMBAT.md`; one
delivery×effect interaction (cone×burn) is still a large, unpriced trap and
made an equal-cost duel measurably *worse* than round 1; and the sustain
mirror (two heal+shield kits) still resolves 100% of the time on the arena's
clock, not on a hit, which the founder's brief names as the failure mode to
avoid.

**Score: 70 / 100 — pace & ability use.** Not ship. The founder's headline
ask — every cooldown ≤ 3 s, everywhere, including the reference fixture — is
now airtight and gate-enforced (`tools/test.mjs`, 70 invariants), and cadence
metrics that were red in round 1 (casts/10 s, cooldown utilisation, burn
clock and arena-death share among real minds) are now solidly green,
reproduced live this round (minds-cross: burn clock 10%, arena-decided 6%,
both far inside target, down from 38%/25%). Fight length moved from a median
of 12.7 s toward the 20–35 s band (16.5–20.5 s across four independently-run
populations this round) but still sits at or below the low edge more often
than inside it, and a sustain-mirror tail still stalls to the clock. The two
metrics that did **not** move at all despite a full fix round are hit rate
(90–91%, target 55–80%, was 89%) and dodges per fight (0.03–0.14, target ≥ 1,
was 0.00) — both measured fresh in this round on two independent seed sets
and one independent mind population, both essentially unchanged from round 1.

---

## 1. Round-1 findings — status

### Balance lens (`review-r1-balance.md` §8)

| # | finding (r1 severity) | status | measured this round |
|---|---|---|---|
| H1 | damage is a must-have; a control atom is taxed by riding on damage (high) | **fixed** | share rule now counts magnitude-bearing atoms only; v9: silence +0.68 pp/pt, cleanse +0.42, blind −0.10, stun −0.41 (was root −7.2 … dash −11.4 in r1) |
| H2 | 8 floor-priced traps; loop's stop rule unmet (high) | **partly** | v9: **2** significant negatives left (knock −2.51±0.99, weaken −3.47±1.50), both already at the floor of 1 and explicitly deferred to a magnitude pass, not a price pass |
| H3 | pricing diverges because `cost` is a design-matrix column (high) | **fixed** | cost + one delivery dummy dropped; spread now falls monotonically v6→v9 instead of oscillating (blink no longer 5→4→5→6); `checkprices` binds to the newest pass and prints it |
| H4 | body league gate red, D190 recorded green on a red instrument (high) | **fixed** | reproduced live: `sizebalance --rounds=20` worst deviation **10.3 pp** (small 60.3%, tanky 40.0%) < 12 pp gate |
| M1 | sustain mirrors stall to the burn clock (medium) | **open, by design** | duels-v9: C vs D still **100%** burn clock at 42 s; D199 calls this structural (D's cleanse strips C's only harm) rather than a magnitude the panel can fix |
| M2 | gauntlet baseline stale; re-picked pool is transitive (medium) | **fixed** | `checkgauntlet` green: cycle **warden→cutter→spark**, `warden→cutter→pyro`, `spark→golem→pyro`; baseline bestMin 0.75 (was 0.85 from the old world) |
| M3 | burn overpriced on close shapes, underpriced on fields (medium) | **partly, one regression** | cone×burn interaction still significant at **−8.08±1.98** (was −17.1); at equal cost, fan-burn vs fan-damage (H vs I, 37 vs 37) fell to **15%** — *worse* than round 1's 29% |
| L1 | mortar premium: code 1.4, comment 1.25 (low) | **fixed** | registry and `COMBAT.md` consistently read ×1.4 everywhere; the historical mismatch is kept only as an annotation |
| L2 | `checkprices` cannot fail on a balance regression (low) | **fixed** | gate now finds the newest `atombalance-panel-*.json` by mtime, prints which file, asserts sd ≤ ratchet and zero traps above the floor |
| L3 | immune refusals spend the cast (low/medium) | **open, low impact** | no pre-cast immunity check was added (`effects.js` still refuses post-strike); impact is now small because D196's field fix cut self-refusals — measured **0** wasted refusals from pure-control casts in every current population |

### Pace lens (`review-r1-pace.md` §2)

| # | finding (r1 severity) | status | measured this round |
|---|---|---|---|
| H1 | fixture cooldowns above 3 s on 52% of live ladder fights (high) | **fixed** | `config.js`: blink/charge 3.0/3.0 s, smash 33.6@2.0s, laser 24; `test.mjs` gates every delivery and fixture skill ≤ 3.0 s; `checkladder`'s live cast-rate check now reads real per-match summaries (median 6.49/10s, was capped) |
| H2 | fight length short and bimodal (high) | **partly** | hp axis 210…360 (D201); this round's own runs: ladder six median **16.5 s** (seeds 1-3) / **20.3 s** (seeds 4-6, this review), minds-cross median **20.5 s**, 50% in band, 46% under 20 s; the sustain tail still stalls (kiter+kiter 55% burn clock, median 31.4 s) — centre moved into the band, tails did not |
| H3 | 0.00 dodges per fight; most kits structurally cannot (high) | **open** | the free universal hop was correctly reverted (it violated the founder's own D160) and the metric honestly broadened to leap/blink **and** side-step; measured fresh this round: **0.03/match** (ladder six, both seed sets) and **0.14/match** (minds-cross) against a target of ≥ 1 — still an order of magnitude short |
| M1 | pricing population is decided by the arena, not hits (medium) | **open, disclosed** | v9 panel: 52% arena-decided, 67.6% reach the burn clock — essentially unchanged from round 1's comparable population (54%/71%); the suggested instrumentation (population-health header) landed, the suggested re-scoring did not |
| M2 | mind-vs-mind burn share (38%) and arena deaths (25%) (medium) | **fixed** | minds-cross, run live this round: burn clock **10%**, arena-decided **6%** — both comfortably inside target |
| M3 | hit rate too high; a miss must be possible (medium) | **open** | ladder six hit rate **90–91%** across both seed sets run this round (was 89%) — essentially unmoved despite dash wind-up 0.18→0.30 s and field radius 3.0→2.6 m, which were tuned for the pricing panel's trap fixes, not validated against this band |
| M4 | weaken on the cooldown channel holds a tile past 3 s invisibly (medium) | **fixed** | `validateSkill` rejects `channel_weaken_cooldown` (`registry.js:875`); boost:cooldown still legal |
| L1 | immune-refusal count is a metric artefact (low) | **fixed** | spectate/minds-cross already isolate refusals from casts with no damage/burn atom; measured 0.00 in every current run |
| L2 | noAct 56–59% vs ≤ 55%; gate on idle+in-reach instead (low) | **partly** | idle+in-reach now reported per creature (6–31%, most 13–24%); overall noAct still 57–59%, a marginal miss of the original number |
| L3 | a rematch looks identical across seeds (low) | **fixed** | spawn angle and think-phase now seed-derived; the same 12 matchups produced materially different lengths across this round's two independent seed sets |
| L4 | the live ladder cannot be measured from the trimmed DB log (low) | **fixed** | `result_json` now carries a full-log summary computed before `keepLog` trims it; `checkladder`'s cast-rate gate reads real numbers |

## 2. Re-statements — honest or not

**The dodge definition (D195).** Honest. The free fourth verb a round-1 fixer
added contradicted the founder's own D160 ("exactly three skills, the jump
only if chosen"); reverting it and broadening the metric to count a
side-step — which every kit, bought or not, can already do — is the correct
way to align a metric with what the design actually permits. Nothing was
hidden: the broadened metric still reports the same bad number this round
(0.03–0.14/match against a target of 1), so the redefinition did not launder
the finding, it only made the target reachable in principle. It is still
missed by an order of magnitude (see H3), and the current ladder-six roster
compounds this: five of the six reference creatures carry no leap or blink at
all, so the target is close to unreachable for them regardless of mind
quality — worth swapping in a roster that can actually exercise the metric.

**The pilot panel as a stall world (D200/COMBAT §4).** Honest, but the
tension it discloses is not resolved. It is stated at the top of every panel
report and in `COMBAT.md` itself, not buried, and it is cross-checked against
real-mind populations that look far healthier (10% burn clock, 6%
arena-decided vs the panel's 68%/52%). But the founder's flatness headline —
the number everyone quotes (1.11) — is still fitted on a population that is
majority decided by the clock, which is the opposite of "fights decided by
hits." Calling the resulting prices "relative worth" is fair labelling, not a
fix; M1's suggested remedy (score by damage margin at 30 s, or reject
kits that reliably stall) was never implemented, only the disclosure was.

**"An unbalanced kit doesn't win by default" (COMBAT §7.1, duels-v9).** Partly
honest. B (bare 3-damage, now 40 pts) still beats E (control-heavy, now 33
pts) 100–0, and the report dismisses this as "not the game's question"
because E carries only one damage ability and cannot take a hit point off
anyone else. That is defensible in principle — a kit that cannot deal damage
cannot win a hits-decided fight, in any pricing regime — but it was asserted,
not tested: no fairer proxy (a genuinely mixed, heavier-control-but-still-
threatening kit against a pure-damage kit at equal cost) was run to show the
claim holds outside this one dismissed extreme. The atom-level evidence (v9's
near-neutral control-piece values in realistic mixed kits) is the real
support for the claim; the duel itself proves less than the prose around it
suggests.

## 3. New findings

**N1 — the "final" pricing pass is NOT CONVERGED by its own rule (medium, balance).**
`atombalance-panel-v9.md`'s own header reads `## **NOT CONVERGED**`: the
largest proposed price move is 5 points (cooldown channel 8→10, blink 5→7,
damage channel 1→6, shield 9→5, armor 2→4, beam 5→1, bolt 3→1, self 4→1),
against the instrument's own settled-means-≤1 rule (D197). `checkprices`
passes anyway because its gate is coarser (sd ≤ 1.2 and no significant
negative above the floor) than the instrument's own convergence rule (no
piece move > 1 AND no significant negative at all). `DESIGN.md` D200 and
`docs/COMBAT.md` §4/§7.1 both call v9 "final evidence" without surfacing that
its own header disagrees — the exact "recorded as done on a number that says
otherwise" pattern round 1's H2 flagged, recurring one level up. **Fix:**
either run v10 with the outstanding moves applied (undamped, since damping
cannot be used to talk a NOT CONVERGED pass into looking settled per D197's
own rule) or change the prose in `COMBAT.md`/`DESIGN.md` to say "adopted
despite non-convergence, because the remaining moves are dominated by the two
floor traps" — which is arguably true, but currently unstated.

**N2 — raising burn's flat price made its worst delivery pairing relatively worse (medium, balance).**
Burn's per-effect price rose from 7 to the ceiling of 10 to flatten the
average, but the cone×burn interaction stayed a large, unpriced negative
(−17.1 in v5 → −8.08±1.98 in v9, still significant). The net effect on an
actual kit: the equal-cost fan-burn-vs-fan-damage duel (H vs I, 37 vs 37) got
*worse* for the burn side, 29% → 15%. The flat per-effect price is doing its
job on average; the delivery×effect table (23 of 99 pairs significant in v9)
is being measured and printed but not fed back into any price. **Fix:** price
the handful of interactions that stay ≥ ±8 pp across two consecutive passes
(cone×burn, dash×burn, dash×damage, dash×root, lob×damage, beam×damage) as a
small surcharge/discount in `costOf`, the way the effect-count surcharge
already works, and re-run one pass to see whether H vs I recovers.

**N3 — dead ability slots in the pricing population rose (low, balance).**
7.8% of paid slots never fired in the v9 panel (480 kits), against 6% in
round 1's comparable random-kit population and the contract's ≤ 2% target.
Plausibly a side effect of control atoms getting cheaper (more three-control
kits are sampled and some of their pieces are situational). Not urgent, but
worth a one-line breakdown of which pieces cluster in the dead-slot kits next
pass.

**N4 — hit rate and dodges are the two §3 metrics a full fix round did not move (medium, pace).**
Every other contract metric in `docs/COMBAT.md` §3 improved measurably this
round; hit rate (89% → 90–91%) and dodges (0.00 → 0.03–0.14) did not, on two
independently-run seed sets and a freshly-run minds-cross population. The
geometry changes that did land (dash wind-up, field radius) were driven by
the balance lane's trap-fixing and were never checked against this band as
their own acceptance test. **Fix:** treat 55–80% hit rate and ≥ 1 dodge/fight
as their own gate, independent of `atombalance`, and iterate the aim-shape
geometry (bolt/fan telegraph, not just dash/field) against it directly.

**N5 — one ladder-loose end, likely pre-existing.** `checkladder.mjs` reports
1 of 400 stored ladder sides with zero ability uses (was 6 before the hop
revert per `fix-r1/hop-revert-handoff.md`, attributed there to a fixture-brain
issue, not a kit or pricing one). Not re-investigated this round; low
severity, flagged for whichever lane owns `checkfixtures`.

## 4. Method

Every number above was reproduced live on the current tree (not read only
from prior reports): `node tools/checkprices.mjs`, `checkkits.mjs`,
`checkgauntlet.mjs`, `checkladder.mjs` (all above); `node
tools/sizebalance.mjs --rounds=20` (10.3 pp); `node reports/combat/spectate.mjs`
on the ladder six at seeds 4,5,6 (this review's own file, alongside the
existing seeds-1,2,3 report for comparison); `node
reports/combat/review-r1/minds-cross.mjs` on the six named model families at
depth 2 (272 matches). `atombalance-panel-v9.md`, `duels-v9.md`,
`spectator-v9-prices.md`, `gauntlet/pick-v9.log`, `docs/COMBAT.md` §2–§5/§7.1
and `DESIGN.md` D195–D203 were read in full. No source file, database row, or
gate was modified.
