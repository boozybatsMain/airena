# atombalance — seed 57

## **NOT CONVERGED**

Largest price move proposed: **3 points** (settled means ≤ 1). Pieces significantly negative: **6** (settled means 0).

Still moving: blink 7→10, jump 6→8, damage 3→5, silence 3→1, zone 3→1, self 4→1, beam 4→1, bolt 4→1.

Traps — a point spent here loses fights, and the floor price of 1 cannot fix that: **stun** (-2.0 ± 1.0 at cost 2), **blind** (-2.4 ± 1.0 at cost 2), **pull** (-2.7 ± 1.0 at cost 2), **wall** (-2.9 ± 0.8 at cost 1), **vision** (-4.1 ± 2.1 at cost 1), **boost** (-4.5 ± 1.4 at cost 2). These go back to the magnitudes, not to the price table.

**Value per point — -0.47 ± 1.30 pp/pt across the 14 effects (range -2.90 … +1.80).** Across all 30 pieces: -0.53 ± 1.40. This is the founder's flatness quantity: a point of budget should buy the same win rate wherever it is spent, so the number to drive down is the **sd**.

Secondary — corr(cost, value) = 0.857 over all pieces, 0.868 over effects. That is the price ORDER, not the price RATE; it can sit at 0.95 while a point on one piece buys three times what it buys on another.

Regression of kit win rate on grammar pieces. 480 random legal kits, 11520 matches (24 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: the registry's own — the schedule the game is played on. Ridge λ=1, 200 bootstrap resamples. Runtime 921 s (league 917 s on 4 workers).

Command: `node tools/atombalance.mjs --n=480 --games=24 --pilots=stub,rusher,kiter,controller --seed=57 --out=reports/combat/atombalance-panel-v11.md`

## Population health — the world these prices were measured in

A price found in fights the arena finished is a price for stalling, and a price found on kits whose slots never fired is a price for the slots that did. These rows say whether this pass measured fights or waits.

| | | contract (`docs/COMBAT.md` §3) |
|---|---|---|
| fight length, mean / median | 34.8 s / 36.5 s | median 20–35 s |
| reaching the burn clock (30 s) | 9604 of 11520 (83.4%) | ≤ 35% |
| decided by | arena 67% · hit 21% · fire 12% · mixed 0% | arena ≤ 20% |
| dead slots (a paid ability that never fired) | 5260 of 69120 (7.6%) | ≤ 2% |
| dodges per fight | 0.39 | ≥ 1 |
| harmless kits redrawn | 0 | — |

Every sampled kit carries at least one damage or burn atom, asserted here and not merely inherited from the grammar's L2 rule: a kit of three durations cannot take a hit point off anybody, so its league game would be decided by who was ahead at the bell. 0 such draws were rejected and re-drawn rather than scored (0 is the expected number while L2 stands).

"Decided by" is what took the last hit point — an opponent (`hit`), an ability's burn (`fire`), or the arena's own burn (`arena`); the sim logs all three as `kill`, and they are separated by matching the loser's `death` line against a `burned` / `burnedOut` line on the same tick. A dodge is an i-frame `evade` or a ground shape passing under an airborne body. A dead slot is an ability that never fired once; a kit is three abilities and all three are paid.

## Instrument health

| | |
|---|---|
| matches scored | 11520 of 11520 (0 errors) |
| draws | 189 (1.6%) |
| side balance (blue : orange wins) | 5668 : 5663 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 34.8 s |
| match length quartiles | p25 33.1 s · p50 36.5 s · p75 38.8 s |
| fights outliving the burn clock (30 s) | 9604 of 11520 (83.4%) |
| endings | kill 11331, double-ko 189 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 151 of 23040 |
| mean uses / hits per side per match | 25.3 / 4.5 |
| pilots actually used (sides) | stub 5828, rusher 5704, kiter 5744, controller 5764 |
| coverage | every effect and delivery in ≥ 24 kits (21 kits coverage-forced) |
| features | 130 (+ intercept): 8 deliveries (`lob` dropped as the baseline — the nine counts always sum to 3), 14 effects, 7 channels, n2, n3, 99 delivery×effect pairs seen in ≥ 2 kits. **No `cost` column** — it is an exact sum of the others (balance review H3) |
| fit | R² 0.810 in-sample, **0.667 cross-validated** (10-fold; 480 rows vs 130 features); cost alone: slope +1.02 pp per point, R² 0.221 |
| score spread across kits | mean 0.502, sd 0.204 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Effect and channel values are absolute. Delivery counts always sum to 3, so the delivery block is identified only up to a common level: `lob` is the baseline column and the nine delivery values are re-centred to mean zero, with standard errors bootstrapped through the re-centring. `target` = round(clamp(k·value, 1, 10)) with one k (2.219 points per pp) chosen so the costs sum to the current sum (115; achieved 99) — with --damp=1, `proposed` and `target` are the same number. A ● in `neg` marks a piece whose value is below −2·se: a trap, and no price in [1, 10] fixes it.

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | neg | target | proposed | Δ | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|:-:|---:|---:|---:|---:|---|
| effect | damage | 273 | 10 | +18.02 | 1.17 | ● |  | 10 | 10 | +0 | +1.80 |  |
| effect | burn | 263 | 10 | +9.68 | 1.17 | ● |  | 10 | 10 | +0 | +0.97 |  |
| delivery | blink | 91 | 7 | +6.74 | 2.02 | ● |  | 10 | 10 | +3 | +0.96 |  |
| channel | cooldown | 17 | 10 | +6.71 | 2.73 | ● |  | 10 | 10 | +0 | +0.67 |  |
| effect | heal | 176 | 10 | +6.69 | 0.98 | ● |  | 10 | 10 | +0 | +0.67 |  |
| effect | shield | 165 | 9 | +3.79 | 0.85 | ● |  | 8 | 8 | -1 | +0.42 |  |
| delivery | jump | 114 | 6 | +3.39 | 1.96 |  |  | 8 | 8 | +2 | +0.57 |  |
| channel | damage | 48 | 3 | +2.23 | 2.19 |  |  | 5 | 5 | +2 | +0.74 |  |
| effect | cleanse | 204 | 5 | +1.64 | 0.80 | ● |  | 4 | 4 | -1 | +0.33 | significant only under rusher |
| channel | speed | 34 | 3 | +1.62 | 2.15 |  |  | 4 | 4 | +1 | +0.54 |  |
| effect | silence | 104 | 3 | +0.54 | 1.03 |  |  | 1 | 1 | -2 | +0.18 |  |
| channel | armor | 36 | 2 | +0.06 | 2.49 |  |  | 1 | 1 | -1 | +0.03 |  |
| effect | knock | 110 | 1 | -0.09 | 1.04 |  |  | 1 | 1 | +0 | -0.09 |  |
| delivery | zone | 163 | 3 | -0.19 | 1.77 |  |  | 1 | 1 | -2 | -0.06 |  |
| delivery | lob *(baseline)* | 182 | 2 | -0.19 | 1.27 |  |  | 1 | 1 | -1 | -0.10 |  |
| delivery | self | 114 | 4 | -0.39 | 1.84 |  |  | 1 | 1 | -3 | -0.10 |  |
| channel | range | 46 | 1 | -0.98 | 2.19 |  |  | 1 | 1 | +0 | -0.98 |  |
| effect | weaken | 81 | 1 | -1.35 | 1.41 |  |  | 1 | 1 | +0 | -1.35 |  |
| effect | root | 104 | 2 | -1.53 | 0.84 |  |  | 1 | 1 | -1 | -0.77 | significant only under stub |
| delivery | beam | 160 | 4 | -1.62 | 1.56 |  |  | 1 | 1 | -3 | -0.40 |  |
| delivery | cone | 155 | 2 | -1.98 | 1.53 |  |  | 1 | 1 | -1 | -0.99 |  |
| effect | stun | 106 | 2 | -2.03 | 1.00 | ● | ● | 1 | 1 | -1 | -1.02 | significant only under rusher |
| effect | blind | 105 | 2 | -2.36 | 1.01 | ● | ● | 1 | 1 | -1 | -1.18 | significant only under rusher |
| effect | pull | 99 | 2 | -2.70 | 1.02 | ● | ● | 1 | 1 | -1 | -1.35 | significant only under controller |
| delivery | bolt | 149 | 4 | -2.86 | 1.69 |  |  | 1 | 1 | -3 | -0.71 |  |
| delivery | dash | 174 | 2 | -2.90 | 1.73 |  |  | 1 | 1 | -1 | -1.45 | significant only under kiter |
| effect | wall | 203 | 1 | -2.90 | 0.78 | ● | ● | 1 | 1 | +0 | -2.90 |  |
| channel | turn | 44 | 1 | -3.96 | 2.04 |  |  | 1 | 1 | +0 | -3.96 |  |
| channel | vision | 45 | 1 | -4.14 | 2.06 | ● | ● | 1 | 1 | +0 | -4.14 |  |
| effect | boost | 178 | 2 | -4.50 | 1.42 | ● | ● | 1 | 1 | -1 | -2.25 | significant only under stub |

## Combination features

- `n2`: +4.19 pp per unit ± 0.65 (significant)
- `n3`: +9.36 pp per unit ± 0.93 (significant)
- kit cost, fitted alone (it is NOT a column of the main design): +1.02 pp per point, R² 0.221
- intercept: 22.5 ± 4.3 pp

## Delivery × effect interactions (24 significant of 99)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| lob×damage | 53 | +17.70 | 1.63 |
| beam×damage | 42 | +13.87 | 1.98 |
| dash×damage | 47 | -13.53 | 1.82 |
| zone×burn | 55 | +11.38 | 1.86 |
| dash×burn | 50 | -11.37 | 2.23 |
| bolt×damage | 41 | +9.43 | 1.76 |
| cone×damage | 49 | -8.63 | 1.95 |
| lob×burn | 64 | +8.13 | 1.63 |
| bolt×boost | 16 | +7.93 | 2.67 |
| beam×burn | 40 | +7.91 | 2.07 |
| dash×shield | 17 | -7.41 | 3.23 |
| cone×heal | 18 | -7.37 | 2.14 |
| bolt×shield | 12 | +6.83 | 3.02 |
| cone×burn | 39 | -6.70 | 1.97 |
| cone×stun | 13 | -6.53 | 2.78 |
| bolt×pull | 15 | -6.19 | 2.72 |
| bolt×heal | 15 | +6.04 | 2.83 |
| blink×heal | 30 | +6.04 | 2.38 |
| bolt×weaken | 13 | +5.54 | 2.69 |
| dash×pull | 17 | +5.53 | 2.76 |
| beam×knock | 25 | -5.22 | 2.10 |
| bolt×silence | 20 | +4.76 | 2.34 |
| self×shield | 27 | +4.68 | 2.30 |
| jump×cleanse | 42 | +3.83 | 1.91 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 480 | 0.170 |
| stub | kiter | 479 | 0.410 |
| stub | controller | 478 | 0.598 |
| rusher | kiter | 479 | 0.003 |
| rusher | controller | 478 | 0.200 |
| kiter | controller | 477 | 0.464 |

- stub: 480 kits, R² 0.659
- rusher: 480 kits, R² 0.646
- kiter: 479 kits, R² 0.680
- controller: 478 kits, R² 0.691

Pilot-dependent pieces: **cleanse** (significant only under rusher); **root** (significant only under stub); **stun** (significant only under rusher); **blind** (significant only under rusher); **pull** (significant only under controller); **dash** (significant only under kiter); **boost** (significant only under stub).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 96.7% | 46 | 44/1/1 | 51 | beam:cleanse+damage | beam:silence+boost/range | beam:damage+root |
| 2 | 96.6% | 58 | 55/2/1 | 54 | beam:burn | lob:blind+damage+silence | zone:damage+boost/turn |
| 3 | 95.7% | 46 | 43/2/1 | 41 | beam:damage+wall | zone:wall+knock+heal | lob:stun |
| 4 | 95.2% | 42 | 40/0/2 | 56 | beam:damage+knock | lob:damage | jump:heal+shield |
| 5 | 92.1% | 38 | 35/0/3 | 33 | beam:damage | dash:cleanse | lob:damage |
| 6 | 90.0% | 50 | 45/0/5 | 53 | self:shield+wall | beam:damage | zone:heal+silence+stun |
| 7 | 88.9% | 54 | 48/0/6 | 57 | beam:weaken+burn/range | zone:damage | jump:wall+shield+cleanse |
| 8 | 88.6% | 44 | 39/0/5 | 40 | dash:knock | beam:damage+cleanse | lob:burn+root |
| 9 | 88.5% | 48 | 42/1/5 | 59 | zone:damage+wall | bolt:weaken+damage/armor | blink:heal+cleanse |
| 10 | 88.1% | 42 | 37/0/5 | 59 | beam:damage+pull | zone:wall+damage | self:cleanse+heal+wall |

Top 10% (48 kits) use 9 of 9 deliveries and 14 of 14 effects; most common delivery beam (20.8% of their ability slots), most common effect damage (20.2% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-panel-v11.json`
