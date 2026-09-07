# atombalance — seed 56

## **NOT CONVERGED**

Largest price move proposed: **7 points** (settled means ≤ 1). Pieces significantly negative: **4** (settled means 0).

Still moving: shield 7→10, blink 6→9, cleanse 3→6, bolt 3→5, speed 1→4, jump 8→1, beam 4→1, self 4→1, zone 3→1, damage 4→1, armor 3→1.

Traps — a point spent here loses fights, and the floor price of 1 cannot fix that: **blind** (-2.2 ± 0.9 at cost 2), **root** (-2.2 ± 1.0 at cost 2), **pull** (-3.8 ± 0.9 at cost 2), **turn** (-5.8 ± 2.4 at cost 1). These go back to the magnitudes, not to the price table.

**Value per point — -0.34 ± 1.27 pp/pt across the 14 effects (range -3.00 … +1.65).** Across all 30 pieces: -0.34 ± 1.46. This is the founder's flatness quantity: a point of budget should buy the same win rate wherever it is spent, so the number to drive down is the **sd**.

Secondary — corr(cost, value) = 0.783 over all pieces, 0.902 over effects. That is the price ORDER, not the price RATE; it can sit at 0.95 while a point on one piece buys three times what it buys on another.

Regression of kit win rate on grammar pieces. 480 random legal kits, 11520 matches (24 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: the registry's own — the schedule the game is played on. Ridge λ=1, 200 bootstrap resamples. Runtime 1059 s (league 1054 s on 4 workers).

Command: `node tools/atombalance.mjs --n=480 --games=24 --pilots=stub,rusher,kiter,controller --seed=56 --out=reports/combat/atombalance-panel-v10b.md`

## Population health — the world these prices were measured in

A price found in fights the arena finished is a price for stalling, and a price found on kits whose slots never fired is a price for the slots that did. These rows say whether this pass measured fights or waits.

| | | contract (`docs/COMBAT.md` §3) |
|---|---|---|
| fight length, mean / median | 35.4 s / 36.8 s | median 20–35 s |
| reaching the burn clock (30 s) | 9997 of 11520 (86.8%) | ≤ 35% |
| decided by | arena 70% · hit 19% · fire 11% · mixed 0% | arena ≤ 20% |
| dead slots (a paid ability that never fired) | 5480 of 69120 (7.9%) | ≤ 2% |
| dodges per fight | 0.37 | ≥ 1 |
| harmless kits redrawn | 0 | — |

Every sampled kit carries at least one damage or burn atom, asserted here and not merely inherited from the grammar's L2 rule: a kit of three durations cannot take a hit point off anybody, so its league game would be decided by who was ahead at the bell. 0 such draws were rejected and re-drawn rather than scored (0 is the expected number while L2 stands).

"Decided by" is what took the last hit point — an opponent (`hit`), an ability's burn (`fire`), or the arena's own burn (`arena`); the sim logs all three as `kill`, and they are separated by matching the loser's `death` line against a `burned` / `burnedOut` line on the same tick. A dodge is an i-frame `evade` or a ground shape passing under an airborne body. A dead slot is an ability that never fired once; a kit is three abilities and all three are paid.

## Instrument health

| | |
|---|---|
| matches scored | 11520 of 11520 (0 errors) |
| draws | 204 (1.8%) |
| side balance (blue : orange wins) | 5657 : 5659 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 35.4 s |
| match length quartiles | p25 34.0 s · p50 36.8 s · p75 39.0 s |
| fights outliving the burn clock (30 s) | 9997 of 11520 (86.8%) |
| endings | kill 11316, double-ko 204 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 168 of 23040 |
| mean uses / hits per side per match | 25.9 / 3.9 |
| pilots actually used (sides) | stub 5496, kiter 5680, controller 5964, rusher 5900 |
| coverage | every effect and delivery in ≥ 24 kits (24 kits coverage-forced) |
| features | 130 (+ intercept): 8 deliveries (`bolt` dropped as the baseline — the nine counts always sum to 3), 14 effects, 7 channels, n2, n3, 99 delivery×effect pairs seen in ≥ 2 kits. **No `cost` column** — it is an exact sum of the others (balance review H3) |
| fit | R² 0.810 in-sample, **0.664 cross-validated** (10-fold; 480 rows vs 130 features); cost alone: slope +1.24 pp per point, R² 0.282 |
| score spread across kits | mean 0.497, sd 0.215 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Effect and channel values are absolute. Delivery counts always sum to 3, so the delivery block is identified only up to a common level: `bolt` is the baseline column and the nine delivery values are re-centred to mean zero, with standard errors bootstrapped through the re-centring. `target` = round(clamp(k·value, 1, 10)) with one k (2.426 points per pp) chosen so the costs sum to the current sum (109; achieved 97) — with --damp=1, `proposed` and `target` are the same number. A ● in `neg` marks a piece whose value is below −2·se: a trap, and no price in [1, 10] fixes it.

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | neg | target | proposed | Δ | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|:-:|---:|---:|---:|---:|---|
| effect | damage | 245 | 10 | +16.49 | 1.57 | ● |  | 10 | 10 | +0 | +1.65 |  |
| effect | burn | 276 | 10 | +8.97 | 1.53 | ● |  | 10 | 10 | +0 | +0.90 |  |
| effect | heal | 173 | 9 | +5.91 | 0.99 | ● |  | 10 | 10 | +1 | +0.66 |  |
| channel | cooldown | 24 | 9 | +4.89 | 2.96 |  |  | 10 | 10 | +1 | +0.54 |  |
| effect | shield | 166 | 7 | +4.14 | 0.82 | ● |  | 10 | 10 | +3 | +0.59 |  |
| delivery | blink | 103 | 6 | +3.66 | 2.30 |  |  | 9 | 9 | +3 | +0.61 | sign flips across pilots (stub -14.9, rusher +12.0) |
| effect | cleanse | 194 | 3 | +2.34 | 0.99 | ● |  | 6 | 6 | +3 | +0.78 | significant only under rusher |
| delivery | bolt *(baseline)* | 194 | 3 | +2.16 | 1.47 |  |  | 5 | 5 | +2 | +0.72 |  |
| channel | speed | 49 | 1 | +1.85 | 2.17 |  |  | 4 | 4 | +3 | +1.85 |  |
| effect | silence | 96 | 3 | +0.85 | 1.14 |  |  | 2 | 2 | -1 | +0.28 | significant only under rusher |
| delivery | lob | 149 | 2 | +0.80 | 1.78 |  |  | 2 | 2 | +0 | +0.40 |  |
| channel | vision | 48 | 1 | +0.50 | 2.41 |  |  | 1 | 1 | +0 | +0.50 | significant only under stub |
| effect | stun | 100 | 2 | +0.27 | 1.09 |  |  | 1 | 1 | -1 | +0.14 |  |
| delivery | jump | 101 | 8 | -0.32 | 2.24 |  |  | 1 | 1 | -7 | -0.04 | significant only under stub |
| delivery | beam | 155 | 4 | -0.53 | 1.94 |  |  | 1 | 1 | -3 | -0.13 | significant only under stub |
| channel | range | 41 | 1 | -0.60 | 2.32 |  |  | 1 | 1 | +0 | -0.60 |  |
| effect | wall | 213 | 1 | -0.64 | 0.85 |  |  | 1 | 1 | +0 | -0.64 | significant only under rusher |
| delivery | self | 109 | 4 | -0.65 | 1.97 |  |  | 1 | 1 | -3 | -0.16 |  |
| delivery | zone | 138 | 3 | -0.71 | 1.98 |  |  | 1 | 1 | -2 | -0.24 |  |
| channel | damage | 40 | 4 | -0.73 | 2.59 |  |  | 1 | 1 | -3 | -0.18 |  |
| effect | knock | 103 | 1 | -0.79 | 1.05 |  |  | 1 | 1 | +0 | -0.79 |  |
| delivery | cone | 161 | 2 | -1.24 | 1.66 |  |  | 1 | 1 | -1 | -0.62 | significant only under stub |
| effect | blind | 127 | 2 | -2.17 | 0.94 | ● | ● | 1 | 1 | -1 | -1.08 | significant only under stub |
| effect | root | 111 | 2 | -2.21 | 0.97 | ● | ● | 1 | 1 | -1 | -1.11 | significant only under rusher |
| channel | armor | 41 | 3 | -2.30 | 2.49 |  |  | 1 | 1 | -2 | -0.77 |  |
| effect | boost | 177 | 2 | -2.46 | 1.56 |  |  | 1 | 1 | -1 | -1.23 | significant only under controller |
| effect | weaken | 91 | 1 | -3.00 | 1.64 |  |  | 1 | 1 | +0 | -3.00 |  |
| delivery | dash | 163 | 2 | -3.16 | 1.94 |  |  | 1 | 1 | -1 | -1.58 |  |
| effect | pull | 102 | 2 | -3.83 | 0.95 | ● | ● | 1 | 1 | -1 | -1.91 |  |
| channel | turn | 36 | 1 | -5.80 | 2.41 | ● | ● | 1 | 1 | +0 | -5.80 | significant only under rusher |

## Combination features

- `n2`: +6.18 pp per unit ± 0.66 (significant)
- `n3`: +8.85 pp per unit ± 0.87 (significant)
- kit cost, fitted alone (it is NOT a column of the main design): +1.24 pp per point, R² 0.282
- intercept: 27.2 ± 4.7 pp

## Delivery × effect interactions (19 significant of 99)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| lob×damage | 46 | +15.94 | 2.20 |
| dash×burn | 45 | -14.07 | 2.02 |
| zone×burn | 46 | +11.75 | 2.04 |
| beam×damage | 38 | +10.53 | 1.92 |
| beam×burn | 41 | +9.65 | 1.96 |
| cone×burn | 52 | -8.98 | 1.90 |
| lob×burn | 34 | +8.95 | 2.21 |
| dash×damage | 44 | -8.08 | 2.27 |
| jump×heal | 32 | +7.50 | 2.13 |
| self×heal | 33 | +7.36 | 2.19 |
| self×shield | 34 | +7.18 | 2.04 |
| bolt×weaken | 17 | +6.53 | 2.81 |
| zone×root | 19 | +6.36 | 2.66 |
| zone×blind | 18 | +6.34 | 2.67 |
| cone×damage | 39 | -6.31 | 2.08 |
| beam×weaken | 16 | +6.17 | 2.93 |
| bolt×damage | 48 | +5.41 | 2.07 |
| cone×root | 27 | -5.23 | 2.35 |
| blink×shield | 35 | +4.57 | 2.23 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 478 | 0.195 |
| stub | kiter | 476 | 0.482 |
| stub | controller | 478 | 0.609 |
| rusher | kiter | 478 | 0.098 |
| rusher | controller | 480 | 0.303 |
| kiter | controller | 478 | 0.515 |

- stub: 478 kits, R² 0.694
- rusher: 480 kits, R² 0.710
- kiter: 478 kits, R² 0.677
- controller: 480 kits, R² 0.697

Pilot-dependent pieces: **blink** (sign flips across pilots (stub -14.9, rusher +12.0)); **cleanse** (significant only under rusher); **silence** (significant only under rusher); **vision** (significant only under stub); **jump** (significant only under stub); **beam** (significant only under stub); **wall** (significant only under rusher); **cone** (significant only under stub); **blind** (significant only under stub); **root** (significant only under rusher); **boost** (significant only under controller); **turn** (significant only under rusher).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 98.3% | 58 | 57/0/1 | 55 | blink:heal+wall | zone:blind+heal | bolt:damage+root+wall |
| 2 | 98.1% | 52 | 51/0/1 | 55 | beam:burn | lob:damage+blind | self:cleanse+boost+shield/damage |
| 3 | 94.0% | 50 | 47/0/3 | 44 | lob:damage | beam:wall+stun+burn | zone:shield |
| 4 | 91.7% | 48 | 44/0/4 | 55 | blink:boost/speed | self:cleanse+wall+shield | beam:damage+burn |
| 5 | 91.7% | 36 | 33/0/3 | 47 | beam:knock+stun+burn | blink:shield | lob:damage |
| 6 | 90.5% | 42 | 38/0/4 | 59 | zone:wall+boost+shield/speed | zone:damage+silence | jump:heal+cleanse |
| 7 | 90.0% | 50 | 45/0/5 | 40 | blink:heal | lob:damage | blink:shield |
| 8 | 89.7% | 58 | 52/0/6 | 48 | lob:wall+weaken/damage | zone:stun+burn+cleanse | lob:damage+wall |
| 9 | 88.9% | 54 | 47/2/5 | 42 | blink:wall+cleanse | lob:damage | jump:shield+wall |
| 10 | 88.6% | 44 | 39/0/5 | 54 | self:heal+shield+cleanse | self:boost/turn | beam:cleanse+damage |

Top 10% (48 kits) use 9 of 9 deliveries and 14 of 14 effects; most common delivery lob (20.1% of their ability slots), most common effect damage (15.4% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-panel-v10b.json`
