# atombalance — seed 51

## **NOT CONVERGED**

Largest price move proposed: **5 points** (settled means ≤ 1). Pieces significantly negative: **5** (settled means 0).

Still moving: burn 7→10, heal 6→9, jump 5→7, cleanse 2→7, silence 3→7, self 4→6, stun 3→1, beam 4→1, bolt 3→1, cone 3→1, dash 3→1, lob 3→1.

Traps — a point spent here loses fights, and the floor price of 1 cannot fix that: **root** (-3.3 ± 1.4 at cost 2), **knock** (-3.6 ± 1.5 at cost 2), **weaken** (-3.9 ± 1.4 at cost 2), **boost** (-4.5 ± 1.1 at cost 2), **lob** (-7.1 ± 2.0 at cost 3). These go back to the magnitudes, not to the price table.

**Value per point — -0.08 ± 1.46 pp/pt across the 14 effects (range -2.26 … +2.26).** Across all 30 pieces: -0.40 ± 1.49. This is the founder's flatness quantity: a point of budget should buy the same win rate wherever it is spent, so the number to drive down is the **sd**.

Secondary — corr(cost, value) = 0.785 over all pieces, 0.870 over effects. That is the price ORDER, not the price RATE; it can sit at 0.95 while a point on one piece buys three times what it buys on another.

Regression of kit win rate on grammar pieces. 240 random legal kits, 5760 matches (24 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: the registry's own — the schedule the game is played on. Ridge λ=1, 200 bootstrap resamples. Runtime 1083 s (league 1080 s on 1 workers).

Command: `node tools/atombalance.mjs --n=240 --games=24 --pilots=stub,rusher,kiter,controller --seed=51 --out=reports/combat/atombalance-panel-v6.md`

## Population health — the world these prices were measured in

A price found in fights the arena finished is a price for stalling, and a price found on kits whose slots never fired is a price for the slots that did. These rows say whether this pass measured fights or waits.

| | | contract (`docs/COMBAT.md` §3) |
|---|---|---|
| fight length, mean / median | 33.4 s / 35.7 s | median 20–35 s |
| reaching the burn clock (30 s) | 4344 of 5760 (75.4%) | ≤ 35% |
| decided by | arena 59% · hit 28% · fire 14% · mixed 0% | arena ≤ 20% |
| dead slots (a paid ability that never fired) | 2361 of 34560 (6.8%) | ≤ 2% |
| dodges per fight | 0.47 | ≥ 1 |
| harmless kits redrawn | 0 | — |

Every sampled kit carries at least one damage or burn atom, asserted here and not merely inherited from the grammar's L2 rule: a kit of three durations cannot take a hit point off anybody, so its league game would be decided by who was ahead at the bell. 0 such draws were rejected and re-drawn rather than scored (0 is the expected number while L2 stands).

"Decided by" is what took the last hit point — an opponent (`hit`), an ability's burn (`fire`), or the arena's own burn (`arena`); the sim logs all three as `kill`, and they are separated by matching the loser's `death` line against a `burned` / `burnedOut` line on the same tick. A dodge is an i-frame `evade` or a ground shape passing under an airborne body. A dead slot is an ability that never fired once; a kit is three abilities and all three are paid.

## Instrument health

| | |
|---|---|
| matches scored | 5760 of 5760 (0 errors) |
| draws | 133 (2.3%) |
| side balance (blue : orange wins) | 2791 : 2836 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 33.4 s |
| match length quartiles | p25 30.2 s · p50 35.7 s · p75 38.6 s |
| fights outliving the burn clock (30 s) | 4344 of 5760 (75.4%) |
| endings | kill 5627, double-ko 133 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 43 of 11520 |
| mean uses / hits per side per match | 24.9 / 3.5 |
| pilots actually used (sides) | controller 2964, kiter 2872, stub 2828, rusher 2856 |
| coverage | every effect and delivery in ≥ 12 kits (10 kits coverage-forced) |
| features | 130 (+ intercept): 8 deliveries (`beam` dropped as the baseline — the nine counts always sum to 3), 14 effects, 7 channels, n2, n3, 99 delivery×effect pairs seen in ≥ 2 kits. **No `cost` column** — it is an exact sum of the others (balance review H3) |
| fit | R² 0.869 in-sample, **0.582 cross-validated** (10-fold; 240 rows vs 130 features); cost alone: slope +1.54 pp per point, R² 0.293 |
| score spread across kits | mean 0.497, sd 0.214 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Effect and channel values are absolute. Delivery counts always sum to 3, so the delivery block is identified only up to a common level: `beam` is the baseline column and the nine delivery values are re-centred to mean zero, with standard errors bootstrapped through the re-centring. `target` = round(clamp(k·value, 1, 10)) with one k (1.766 points per pp) chosen so the costs sum to the current sum (92; achieved 92) — with --damp=1, `proposed` and `target` are the same number. A ● in `neg` marks a piece whose value is below −2·se: a trap, and no price in [1, 10] fixes it.

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | neg | target | proposed | Δ | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|:-:|---:|---:|---:|---:|---|
| effect | damage | 124 | 9 | +20.34 | 1.77 | ● |  | 10 | 10 | +1 | +2.26 |  |
| effect | burn | 141 | 7 | +6.72 | 1.85 | ● |  | 10 | 10 | +3 | +0.96 |  |
| effect | heal | 82 | 6 | +4.81 | 1.15 | ● |  | 9 | 9 | +3 | +0.80 |  |
| delivery | jump | 71 | 5 | +3.95 | 2.77 |  |  | 7 | 7 | +2 | +0.79 | significant only under stub |
| delivery | blink | 50 | 6 | +3.73 | 2.18 |  |  | 7 | 7 | +1 | +0.62 |  |
| effect | cleanse | 99 | 2 | +3.72 | 1.36 | ● |  | 7 | 7 | +5 | +1.86 | significant only under controller |
| effect | silence | 43 | 3 | +3.71 | 1.89 |  |  | 7 | 7 | +4 | +1.24 | significant only under rusher |
| delivery | self | 46 | 4 | +3.67 | 3.26 |  |  | 6 | 6 | +2 | +0.92 |  |
| effect | shield | 91 | 5 | +2.86 | 1.42 | ● |  | 5 | 5 | +0 | +0.57 |  |
| delivery | zone | 76 | 4 | +2.37 | 2.16 |  |  | 4 | 4 | +0 | +0.59 |  |
| channel | cooldown | 18 | 2 | +0.84 | 2.94 |  |  | 1 | 1 | -1 | +0.42 |  |
| channel | turn | 32 | 1 | +0.80 | 2.36 |  |  | 1 | 1 | +0 | +0.80 |  |
| channel | armor | 11 | 2 | +0.59 | 2.73 |  |  | 1 | 1 | -1 | +0.30 |  |
| effect | stun | 56 | 3 | +0.18 | 1.50 |  |  | 1 | 1 | -2 | +0.06 |  |
| effect | blind | 48 | 2 | +0.16 | 1.55 |  |  | 1 | 1 | -1 | +0.08 |  |
| delivery | beam *(baseline)* | 88 | 4 | +0.07 | 1.19 |  |  | 1 | 1 | -3 | +0.02 |  |
| delivery | bolt | 69 | 3 | -0.11 | 2.24 |  |  | 1 | 1 | -2 | -0.04 |  |
| effect | wall | 99 | 1 | -0.60 | 1.44 |  |  | 1 | 1 | +0 | -0.60 |  |
| effect | pull | 69 | 2 | -1.40 | 1.32 |  |  | 1 | 1 | -1 | -0.70 |  |
| channel | damage | 25 | 1 | -2.13 | 2.64 |  |  | 1 | 1 | +0 | -2.13 |  |
| channel | speed | 27 | 1 | -2.28 | 2.35 |  |  | 1 | 1 | +0 | -2.28 |  |
| channel | range | 27 | 1 | -2.34 | 2.86 |  |  | 1 | 1 | +0 | -2.34 |  |
| delivery | cone | 86 | 3 | -2.67 | 2.26 |  |  | 1 | 1 | -2 | -0.89 | significant only under stub |
| effect | root | 52 | 2 | -3.32 | 1.45 | ● | ● | 1 | 1 | -1 | -1.66 | significant only under controller |
| effect | knock | 54 | 2 | -3.64 | 1.51 | ● | ● | 1 | 1 | -1 | -1.82 | significant only under rusher |
| channel | vision | 14 | 1 | -3.89 | 2.28 |  |  | 1 | 1 | +0 | -3.89 |  |
| effect | weaken | 49 | 2 | -3.90 | 1.44 | ● | ● | 1 | 1 | -1 | -1.95 |  |
| delivery | dash | 83 | 3 | -3.95 | 2.21 |  |  | 1 | 1 | -2 | -1.32 |  |
| effect | boost | 93 | 2 | -4.52 | 1.15 | ● | ● | 1 | 1 | -1 | -2.26 |  |
| delivery | lob | 79 | 3 | -7.06 | 1.95 | ● | ● | 1 | 1 | -2 | -2.35 |  |

## Combination features

- `n2`: +5.48 pp per unit ± 1.01 (significant)
- `n3`: +9.82 pp per unit ± 1.38 (significant)
- kit cost, fitted alone (it is NOT a column of the main design): +1.54 pp per point, R² 0.293
- intercept: 23.5 ± 4.6 pp

## Delivery × effect interactions (13 significant of 99)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| beam×damage | 21 | +13.09 | 2.87 |
| zone×weaken | 7 | -11.37 | 3.61 |
| dash×burn | 25 | -11.28 | 2.69 |
| zone×burn | 21 | +9.96 | 3.04 |
| blink×heal | 18 | +7.97 | 2.69 |
| zone×pull | 12 | +6.65 | 3.22 |
| beam×knock | 11 | -6.55 | 2.93 |
| blink×shield | 14 | +6.43 | 2.67 |
| cone×burn | 21 | -6.38 | 2.48 |
| jump×cleanse | 26 | -6.12 | 2.61 |
| zone×damage | 18 | +5.76 | 2.78 |
| beam×pull | 12 | -5.66 | 2.60 |
| beam×burn | 25 | +5.54 | 2.70 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 237 | 0.200 |
| stub | kiter | 239 | 0.446 |
| stub | controller | 239 | 0.491 |
| rusher | kiter | 238 | 0.127 |
| rusher | controller | 238 | 0.244 |
| kiter | controller | 240 | 0.554 |

- stub: 239 kits, R² 0.685
- rusher: 238 kits, R² 0.766
- kiter: 240 kits, R² 0.773
- controller: 240 kits, R² 0.783

Pilot-dependent pieces: **jump** (significant only under stub); **cleanse** (significant only under controller); **silence** (significant only under rusher); **cone** (significant only under stub); **root** (significant only under controller); **knock** (significant only under rusher).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 98.3% | 58 | 56/2/0 | 49 | blink:cleanse+wall | bolt:damage+silence | zone:heal+damage |
| 2 | 91.7% | 60 | 55/0/5 | 46 | zone:damage | lob:burn+pull+cleanse | zone:shield+stun |
| 3 | 91.1% | 56 | 51/0/5 | 47 | bolt:damage+pull | dash:heal | jump:shield+heal+wall |
| 4 | 90.0% | 40 | 36/0/4 | 33 | bolt:wall+damage | zone:silence | jump:heal |
| 5 | 89.8% | 44 | 39/1/4 | 55 | blink:heal | jump:heal+shield+wall | dash:burn+damage |
| 6 | 88.6% | 44 | 39/0/5 | 56 | cone:boost+damage+pull/turn | blink:shield+heal | blink:shield+cleanse |
| 7 | 87.5% | 56 | 49/0/7 | 45 | bolt:burn+heal | beam:damage+wall | beam:knock+stun |
| 8 | 87.0% | 46 | 40/0/6 | 48 | bolt:damage+knock | jump:wall+heal | zone:boost+cleanse+silence/cooldown |
| 9 | 86.8% | 38 | 32/2/4 | 33 | bolt:pull | beam:silence+damage | bolt:cleanse+weaken/damage |
| 10 | 84.8% | 56 | 47/1/8 | 37 | lob:silence+damage | bolt:pull | beam:burn+blind |

Top 10% (24 kits) use 9 of 9 deliveries and 14 of 14 effects; most common delivery beam (16.7% of their ability slots), most common effect damage (17.6% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-panel-v6.json`
