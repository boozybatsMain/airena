# Review r1 — balance & fairness (07.09.2026)

**Score: 55 / 100. Verdict: NOT SHIP.** The price ORDER is right and the budgets are sound, but the price RATE is not flat: a point spent on damage buys ~3 pp of win rate, a point on heal ~1.6, on shield ~0.9, and a point on any of eight control/utility pieces buys a loss. At equal cost, three bare damage abilities beat a control kit 48–0 on all four pilots; the live ladder's top four are all three-harm kits, two of them piloted by the scripted kit-stub above every LLM mind. The body league gate is red and the counter-panel is a ladder with zero cycles. An unbalanced hand-made kit does not merely exist — it wins by default.

Everything below was measured on the tree at HEAD 8699fb6 + working changes, 07.09, single process except one pool run (`sizebalance`). Scratch scripts: `duels.mjs`, `ladder.mjs`, `harm.mjs` in the session scratchpad; the duel kits and seeds are listed in §3 so the run is reproducible with `runMatch`.

---

## 1. What I ran

| what | command / source | result |
|---|---|---|
| stored kits | `node tools/checkkits.mjs` | 78 creatures, 0 illegal, 0 without a kit — green |
| price prose ↔ code | `node tools/checkprices.mjs` | green (0.789 vs declared 0.79) — but see L2, the gate is circular |
| grammar | `node tools/checkgrammar.mjs` | green |
| body league (the one pool run) | `node tools/sizebalance.mjs --rounds=20` | **RED**, exit 1 — small body 37.5% (§5) |
| pricing passes | `reports/combat/atombalance-panel-v2…v5.{md,json}` re-read; my own regression on the v5 kits without the `cost` feature (§2) | v5 was run AT the shipped prices, so its per-point column is the honest flatness reading |
| extreme-kit duels | 15 pairs × 4 pilots × 6 seeds × 2 sides = 720 matches, `runMatch`, default bodies, registry cooldowns (§3) | |
| live ladder | `data/airena.db`: 41 active creatures with > 50 fights, last 2 000 ladder matches (§4) | |
| gauntlet | `src/skills/gauntlet.js`, `tools/checkgauntlet.mjs`, `reports/combat/gauntletpick.log` — read only, another agent is re-picking (§6) | |

---

## 2. Value per point — the economy is ordered, not flat

`atombalance` fits win rate on piece counts **plus a `cost` feature**, and its own report says the design is rank-deficient by construction (cost is an exact sum of the other features; `tools/atombalance.mjs:250,267`). Ridge then splits every piece's value arbitrarily between "cost" and the piece, and the re-price reads only the piece half. That is why the four passes never converged (§2.2). To read the absolute value of a piece, I refit the v5 league (240 kits, 5 760 matches, `atombalance-panel-v5.json`) on deliveries + effects + channels + n2 + n3 with NO cost feature (ridge 0.5, 200 bootstraps):

| piece | cost | value pp/unit (cost included) | ± se | pp per point |
|---|---:|---:|---:|---:|
| damage | 9 | **+26.8** ● | 1.7 | **+2.98** |
| burn | 7 | +12.8 ● | 1.5 | +1.83 |
| heal | 6 | +9.8 ● | 1.1 | +1.63 |
| blink | 6 | +8.9 ● | 1.6 | +1.49 |
| zone | 4 | +5.6 ● | 1.2 | +1.40 |
| shield | 5 | +4.6 ● | 1.3 | +0.91 |
| jump | 5 | +4.1 ● | 1.6 | +0.81 |
| silence | 3 | +2.1 | 1.8 | +0.70 |
| cleanse | 2 | +1.0 | 1.3 | +0.51 |
| bolt / beam / lob | 3 / 4 / 3 | +0.4 / −0.2 / −0.4 | ~1.2 | ≈ 0 |
| knock | 2 | −0.3 | 1.9 | −0.14 |
| pull | 2 | −2.3 | 1.4 | −1.16 |
| boost | 2 | −2.9 ● | 1.3 | −1.47 |
| stun | 3 | −3.1 | 1.7 | −1.03 |
| weaken | 2 | −3.5 ● | 1.7 | −1.74 |
| blind | 2 | −4.3 ● | 1.5 | −2.16 |
| root | 2 | **−7.2** ● | 1.5 | **−3.57** |
| wall | 1 | **−7.3** ● | 1.4 | **−7.32** |
| cone | 3 | −9.0 ● | 1.6 | −2.99 |
| dash | 3 | **−11.4** ● | 1.3 | −3.79 |

- corr(cost, value) over the 14 effects = **0.956** — the ORDER of prices is right. That is what the "0.79" in `docs/COMBAT.md:129` and `src/skills/registry.js` (comment above `EFFECTS`) actually measures. It is not flatness.
- Per-point value across effects: mean −0.7, **sd 2.5**, range −7.3 … +3.0. Ship target (80) needs the spread within measurement noise, roughly sd ≤ 0.5 pp/pt.
- The same picture in the instrument's own v5 columns (`atombalance-panel-v5.md`, "value per point now"): +1.17 (damage) … −4.18 (wall), 8 pieces significantly negative, exactly one significantly positive.

### 2.1 Must-have and traps

- **Damage is a must-have.** Top decile of v5 (24 kits): damage in 20, heal in 17, blink in 8 (vs 1 in the bottom decile). Kits with two harm abilities score 65.1% vs 47.2% with one (240 kits; the sampler never draws three because the budget bars it below 37 points and the draw is 35% / 15% multi-effect). Nash top-10: harm in 10/10, heal in 8/10.
- **Traps (significantly negative at floor or one above):** root (2), wall (1), blind (2), weaken (2), boost (2), pull (2), stun (3), and the dash / cone deliveries (3). These are not artefacts of one seed — every one of them was cut in every pass and stayed negative (§2.2). `docs/COMBAT.md` §5 step 4 says the loop stops only when "no piece has a significant negative value"; that stop rule is not met, and the registry comment re-labels the failure as a feature ("negative value of control is a property of three slots").
- The registry's explanation is half right and names the mechanism: a control added to a damage ability cuts the damage to 0.85 / 0.7 (`src/skills/compile.js:226`), so the control's price is really "2 points + 15% of your damage". The fix is in the share rule, not in the price floor (H1 below).

### 2.2 The pricing loop diverged

| | v2 | v3 | v4 | v5 |
|---|---:|---:|---:|---:|
| cost-only slope (pp / point) | 0.38 | 0.91 | 1.28 | 1.70 |
| per-point sd across 30 pieces (instrument's column) | 1.11 | 1.34 | 1.63 | 1.56 |
| significant negative pieces | 8 | 6 | 10 | 8 |
| re-price scale k (points per pp) | 282 | 252 | 235 | **350** |
| proposal | — | — | — | five pieces at 9–10, twenty-five at 1 |

Prices oscillate rather than settle: blink 5→4→5→6, self 3→4→3→4, zone 5→4→5→4, heal 6→8→7→6. Root went 5→3→3→2 and read −6.0, −1.5, −5.7, −7.4. The cost slope rising is presented as progress ("0.4 → 1.7 pp per point", `COMBAT.md` §4); it is the opposite: a steeper cost slope with the same pieces means the win rate is being explained by *how many* points a kit spends, which is only good when every point buys the same amount — and §2 shows it does not.

---

## 3. Extreme-kit duels (720 matches)

Same pilot on both sides, seeds 11/22/33/44/55/66 mirrored, default bodies, registry cooldowns. Kits (kinetic element):

- **A harm-max 55**: bolt damage+burn · beam damage+burn · lob damage
- **B 3dmg-cheap 37**: bolt damage · beam damage · lob damage (= the ladder's STORM)
- **C sustain-burn 45**: self heal+shield · jump shield+heal · bolt burn
- **D sustain+zone 46**: self heal+shield · blink heal+cleanse · zone damage (≈ v5 Nash #1)
- **E control-heavy 37**: cone stun+root+silence · lob blind+knock · bolt damage
- **F control+dmg 50**: bolt damage+stun · zone damage+root · lob damage+blind
- **H fan-burn 32 / I fan-dmg 34**: cone burn vs cone damage, rest identical (bolt damage, self heal)
- **J no-root 35 / K with-root 39**: bolt damage vs bolt damage+root, rest identical (zone damage, self heal)
- **L keeper 30**: the `keeper` preset (bolt damage · blink cleanse · self heal)

| pair (win % of the first) | mean | stub | rusher | kiter | controller | mean len | burn clock |
|---|---:|---:|---:|---:|---:|---:|---:|
| **B 3dmg 37 vs E control 37 (equal cost)** | **100%** | 100 | 100 | 100 | 100 | 18.5 s | 13% |
| A harm-max 55 vs E control 37 | 100% | 100 | 100 | 100 | 100 | 14.2 s | 4% |
| E control 37 vs F control+dmg 50 | 0% | 0 | 0 | 0 | 0 | 20.1 s | 27% |
| A harm-max 55 vs B 3dmg 37 (+18 pts) | 94% | 100 | 83 | 92 | 100 | 16.0 s | 10% |
| A harm-max 55 vs C sustain-burn 45 | 90% | 100 | 100 | 92 | 67 | 28.9 s | 60% |
| A harm-max 55 vs F control+dmg 50 | 73% | 83 | 42 | 92 | 75 | 14.5 s | 4% |
| A harm-max 55 vs D sustain+zone 46 | 65% | 100 | 100 | **8** | 50 | 25.5 s | 44% |
| B 3dmg 37 vs D sustain+zone 46 | 50% | 83 | 83 | 25 | 8 | 26.4 s | 48% |
| D sustain+zone 46 vs F control+dmg 50 | 56% | 0 | 25 | 100 | 100 | 27.5 s | 50% |
| **C sustain 45 vs D sustain 46 (mirror of styles)** | 30% | 100 | 0 | 8 | 13 | **42.4 s** | **100%** |
| **J no-root 35 vs K with-root 39** | **64%** | 67 | 63 | 58 | 67 | 26.4 s | 38% |
| **H fan-burn 32 vs I fan-dmg 34** | **29%** | 42 | 0 | 50 | 25 | 24.6 s | 29% |
| L keeper 30 vs A harm-max 55 | 19% | 0 | 0 | 17 | 58 | 22.7 s | 38% |
| L keeper 30 vs D sustain+zone 46 | **0%** | 0 | 0 | 0 | 0 | 38.2 s | 100% |
| B 3dmg 37 vs L keeper 30 | 71% | 100 | 100 | 75 | 8 | 23.0 s | 35% |

Reading:
- **Equal cost, 48–0.** Three bare damage abilities beat a control-heavy kit of the same 37 points on every pilot, including the controller pilot written to use controls. Control+damage (F, 50 pts) beats pure control 48–0 too. "Control" as a style does not exist at these prices.
- **Points buy wins, but only harm points.** A (55) over B (37): +18 points of burn = +44 pp. J vs K: +4 points of root = **−14 pp**, on every pilot. H vs I: a 10-point fan of burn loses to a 12-point fan of damage by 21 pp (cone×burn is −17 pp in v5, the largest interaction in the table).
- **Real rock-paper-scissors exists, but only under a pilot who can use the kit.** A vs D flips from 100% (stub, rusher) to 8% (kiter); D vs F from 0% (stub) to 100% (kiter, controller). That is good news for the design and bad news for the pricing: the pieces that carry the counter-play are the ones priced at the floor.
- **Sustain mirrors stall.** C vs D: 100% of fights reach the 30 s burn, mean 42 s; keeper vs D: 0% and 100% burn clock. Two sustain kits cannot finish each other — the arena finishes them. That is the same shape the founder called dead, one economy later (`COMBAT.md` §1).

---

## 4. The live ladder agrees

`data/airena.db`, 41 active creatures with > 50 fights (`ladder.mjs`, `harm.mjs`):

| rating | creature | mind | kit | cost |
|---:|---|---|---|---:|
| 1698 | ASH | **kit-stub** | beam damage · bolt damage · lob burn | 35 |
| 1631 | MONOCYCLE CUTTER | opus | beam damage · dash damage · cone damage+knock | 41 |
| 1626 | STONE GOLEM | opus | cone damage+knock · dash damage · dash damage+stun | 45 |
| 1590 | STORM | **kit-stub** | beam damage · bolt damage · lob damage | 37 |
| … | | | | |
| 1095 | ICE MAGE | glm flash | bolt damage+root · lob wall · zone root+damage | 37 |
| 1126 | HEAVY REACTOR | gemini flash | zone root · cone burn · zone damage | 29 |
| 1141 | SLEDGEHAMMER | gemini flash | dash knock · cone stun · cone damage | 23 |

- Mean rating by number of harm abilities: 1 → 1219 (n=4), 2 → 1285 (n=30), **3 → 1488 (n=7)**.
- corr(kit cost, rating) = 0.45, slope 11.8 rating/pt — cost matters, as it should.
- The scripted kit-stub holding three damage deliveries (ASH, STORM) out-rates every LLM mind in the library. A hand-made "three damage" kit wins by default, with no mind behind it.
- Burn clock on the ladder: 27% of the last 2 000 ladder matches reach 30 s (mean 24.2 s) — under the 35% target, because most stored kits are damage-heavy (damage appears 126 times in 234 stored abilities, heal 4 times). The bake-off's 30–60% comes from its three fixed creatures all carrying an Aura shield+heal or Blink cleanse+shield: that is the sustain mirror of §3, not a mind problem.

---

## 5. Body league — gate red

`node tools/sizebalance.mjs --rounds=20` (400 fights, instrument clean at 50.0% on identical bodies):

| body (25 pts) | hp | speed | radius | win rate |
|---|---:|---:|---:|---:|
| even | 178 | 5.33 | 1.38 | 57.5% |
| tanky | 237 | 5.33 | 1.80 | 56.9% |
| **small** | 120 | 5.66 | 1.20 | **37.5% — "loses just like that"** |
| fast | 167 | 7.67 | 1.55 | 42.5% |
| agile | 180 | 4.20 | 1.37 | 55.6% |

Worst deviation 12.5 pp against the strict 12 pp gate (`tools/sizebalance.mjs:190`); exit 1. Even and tanky sit 7 pp above half (above the 8 pp resolution only just). The 07.09 radius re-price (`src/core/config.js:777`, 0.06 → 0.10 m a point) over-corrected: the glass body went from 85% to 37.5%. `DESIGN.md` D190 records "worst body deviation 45 → 16 points" as done — 16 was already over the 12 pp gate, so the milestone was recorded green on a red instrument.

---

## 6. Gauntlet — a ladder, and a stale baseline

Read only (another agent owns the re-pick):
- `BASELINE.bestMin = 0.85, measuredAt '30.08'` (`src/skills/gauntlet.js:227–230`) is from the cost-derived-cooldown world; every number in the file header table was measured before 07.09.
- The re-pick in flight (`reports/combat/gauntletpick.log`): 7 candidate fives from random legal kits, **0 cycles in all 7**, 2–4 styles of 5, and every candidate carries a punching bag (candidate #1's row "Fan weaken · Fan burn · Fan wall+heal+blind" loses 0% to all four). Its "best worst" is 50%, not the 0.85 in code. `checkgauntlet`'s "field is non-transitive: a cycle exists" check will stay red on any of these fives.
- Cause: random legal kits are 78% three-effect and priced by a floor that makes controls free, so a random five is a ladder ordered by how much damage each carries — the same ordering as §3 and §4. The pool cannot yield a cycle until the pieces that would carry a counter (control, wall, blind) are worth their points.

---

## 7. What is fine

- **Budgets bind sensibly.** The dearest harm kit is 55 of 56 (A); a 56-point kit is a real choice (three 22-point abilities would be 66). Stored kits run 23–51 (median 36), none over budget, and `checkkits` is green for all 78. The +2 / +5 combination surcharge (`registry.js:765–766`) is not double-punishing: without the cost feature, n3 reads +10.4 ± 1.4, i.e. three effects are not a trap in themselves.
- **Instrument health**: 0 faults, 0 errors, mirrored pairings, side balance 2 829 : 2 840, every piece in ≥ 12 kits, cv-R² 0.64 on 240 rows. The report is honest about its own rank deficiency.
- **No monoculture by the decile flag**: the top 10% uses 9/9 deliveries and 14/14 effects; no piece over half the slots. (The flag is too coarse to catch "damage in 20 of 24", but it is not lying.)
- **Counter-play is real under a capable pilot** (§3: A vs D, D vs F flip by 90 pp between pilots). The grammar has the depth; the prices hide it.
- **Ladder burn clock 27%** on the current damage-heavy population is under the target.

---

## 8. Findings and fixes

### H1 — Damage is a must-have; a control atom costs "2 points + 15% of your damage" (high)
`src/skills/compile.js:226` shares magnitudes 1 / 0.85 / 0.7 by the *number of effects*, so any duration-only atom (stun, root, silence, blind, wall, cleanse) taxes the harm it rides on. That is the mechanism behind root −7.2, J vs K 64/36 and the registry's "controls displace damage" note. **Fix:** count the share by the number of *magnitude-bearing* effects (`e.mag !== null`) — bolt damage+root keeps 24 damage and a full root; damage+burn still shares. Keep the +2 / +5 points surcharge as the price of "one hit, two things". Then re-run the panel (v6). Expected: root/stun/silence/blind/wall move toward zero or positive without touching their durations.

### H2 — Eight floor-priced traps; the loop's stop rule is unmet (high)
Root −7.4 ± 1.3 at cost 2, wall −4.2 ± 1.2 at cost 1, blind/weaken/boost/pull −4.1 … −4.7 at cost 2, stun −4.5 at 3, dash −5.2 at 3 (`atombalance-panel-v5.md`), each negative in all four passes. `COMBAT.md` §5 step 4 requires re-scaling any piece that no price can fix and repeating; it was done once (durations) and then the loop was declared settled. **Fix:** after H1, any piece still significantly negative gets a magnitude change, not a price change: burn on a fast delivery *extends* the remaining time (cap 2 × duration) instead of renewing (cone×burn −17.1, dash×burn −5.3, H vs I 29%); wall lasts 5 s and blocks projectiles for the caster's own bolt/lob as cover it can shoot over (today it is −7.3 at cost 1 — a piece that cannot be priced below 1 and is still a loss). Make `atombalance` print **NOT CONVERGED** and exit 2 while any significant negative remains, so a pass cannot be recorded as done.

### H3 — The pricing instrument diverges because `cost` is in the design matrix (high)
`tools/atombalance.mjs:250,267` regress on piece counts *and* their exact linear sum; ridge splits each piece's value arbitrarily and the re-price uses only the piece half, so proposals swing (k 282 → 350; v5 proposes 9–10 for five pieces and 1 for twenty-five) and prices oscillate (blink 5→4→5→6). **Fix:** drop `cost` (and one delivery dummy) from the fit; price on the absolute coefficients (the table in §2 is that fit); add a convergence criterion — max |Δcost| ≤ 1 between passes and no significant negative — and run v6/v7. Replace the "0.79 correlation" headline in `COMBAT.md:129` and the registry comment with the per-point spread, which is the quantity the founder asked to flatten.

### H4 — Body league gate red; D190 recorded a red number as done (high)
Small body 37.5% (−12.5 pp, gate 12, `tools/sizebalance.mjs:190`), even 57.5%, tanky 56.9%. **Fix:** `src/core/config.js:777` radius `per` 0.10 → 0.13 (the smallest body costs ~4.6 instead of 6) or hp `per` 14 → 16; re-run `--rounds=20` until the worst deviation is under 12 and both hp-heavy bodies are inside the 8 pp resolution; correct D190 in `DESIGN.md` to say the gate was red at 16 and is red at 12.5.

### M1 — Sustain mirrors stall to the burn clock (medium)
C vs D 100% burn clock at 42 s; keeper vs D 0% and 100% burn clock; bake-off casters 42–62% sudden death (target ≤ 35%, `COMBAT.md` §3). A heal+shield aura at 0.85 share yields up to 13.6 + 10.2 hp per 3 s ≈ 7.9 hp/s — one sustain slot cancels one bolt of damage (24 × ~0.75 / 2.2 s ≈ 8.2 dps). **Fix:** `registry.js:447` heal `share` 0.12 → 0.09 with `mag` 16 → 12, or `registry.js:443` shield 12 → 9; re-run the C vs D mirror and `spectate.mjs` on the bake-off casters; target burn clock ≤ 35% in a sustain mirror. Do this after H1, because H1 raises the value of the damage that sustain competes with.

### M2 — Gauntlet baseline is from the old world and the new pool is transitive (medium)
`gauntlet.js:227–230` bestMin 0.85 measured 30.08; the re-pick finds 0 cycles in 7 tries with a 0%-row in every five. **Fix:** seed the pick pool with the ladder's top 20 real kits, the three presets and the six archetypes of §3 rather than random legal kits; reject any five in which a row's best result is under 25%; re-pick and re-measure bestMin on ≥ 20 seeds only after H1–H3 land — a five picked on today's prices will be a ladder whatever the picker does.

### M3 — Burn is overpriced on close shapes and underpriced on fields (medium)
Burn +0.4 ± 1.5 at cost 7 (per-point +0.05); in the bottom decile 21/24 kits carry it; cone×burn −17.1 ± 2.5, zone×burn +12.9 ± 2.3, beam×burn +7.6. Renewal (never stacking) throws away two thirds of every 3 s burn cast from a 2.0 s fan, while the ×1.4 fan premium multiplies a rate the renewal caps. **Fix:** extend-not-renew (H2), or price the delivery×effect pair in `costOf` for the three pairs whose interaction exceeds twice its standard error in two consecutive passes.

### L1 — Mortar premium: code 1.4, own comment 1.25 (low)
`registry.js:151–153`: comment "×1.25", value `power: 1.4`; `docs/COMBAT.md:70` says 1.25, `:135` says 1.4. **Fix:** pick one and pin it in `checkbehaviour` / `checkdocs`.

### L2 — `checkprices` cannot fail on a balance regression (low)
It correlates registry prices with a comment table that was copied from the pass the prices were set from (0.789 by construction). **Fix:** read the newest `atombalance-panel-*.json`, assert the per-point sd ≤ 0.5 and zero significant negatives, and print the pass file it bound to.

### L3 — Immune refusals spend the cast (low here, medium for the mind lane)
`src/core/effects.js:107–110` emits `missed: immune` after the cast resolved, so its cooldown and its share of the ability are spent. The bake-off's ~9 refusals a game (up to 4 956 for one mind) mean production minds get even less from control atoms than the pilots, which check `p.enemy.immune`, measure. **Rule-level option:** `api.ready(name)` false and `api.use` refused before the wind-up when every class the ability's controls take is immune and the ability carries nothing else; a refused order costs nothing.

---

## 9. Score

80 means: no piece dominates, cost tracks value within noise, a hand-made unbalanced kit can exist but does not win by default. Against that:

- cost tracks value in order (r 0.96) but not in rate (per-point 3.0 / 1.6 / 0.9 / ≤ 0 — sd 2.5 pp/pt), −15
- damage is a must-have and three-harm is the ladder's whole top; equal-cost control loses 48–0; the kit-stub with three damage deliveries out-rates every LLM mind — the unbalanced hand-made kit wins by default, −15
- eight pieces are traps at the floor and the loop's own stop rule is unmet, −8
- body gate red, −4; gauntlet transitive with a stale baseline, −3
- credit: budgets sound, stored kits safe, instrument honest and reproducible, genuine counter-play under capable pilots, ladder burn clock 27%.

**55.** Fix H1 + H3 and run v6; if the per-point spread compresses to sd ≤ 0.8 and root/stun/wall read ≥ 0, this review's next round starts near 75.
