# atombalance — seed 53

## **NOT CONVERGED**

Largest price move proposed: **7 points** (settled means ≤ 1). Pieces significantly negative: **5** (settled means 0).

Still moving: cooldown 6→10, jump 7→10, shield 7→10, heal 6→10, beam 3→10, blink 7→1, bolt 4→1, self 5→1, zone 3→1.

Traps — a point spent here loses fights, and the floor price of 1 cannot fix that: **root** (-3.6 ± 1.5 at cost 2), **weaken** (-3.8 ± 1.5 at cost 2), **pull** (-4.1 ± 1.4 at cost 2), **cone** (-4.4 ± 1.6 at cost 2), **armor** (-4.4 ± 1.9 at cost 2). These go back to the magnitudes, not to the price table.

**Value per point — -0.13 ± 1.21 pp/pt across the 14 effects (range -2.04 … +1.83).** Across all 30 pieces: -0.56 ± 1.58. This is the founder's flatness quantity: a point of budget should buy the same win rate wherever it is spent, so the number to drive down is the **sd**.

Secondary — corr(cost, value) = 0.811 over all pieces, 0.917 over effects. That is the price ORDER, not the price RATE; it can sit at 0.95 while a point on one piece buys three times what it buys on another.

Regression of kit win rate on grammar pieces. 240 random legal kits, 5760 matches (24 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: the registry's own — the schedule the game is played on. Ridge λ=1, 200 bootstrap resamples. Runtime 367 s (league 365 s on 8 workers).

Command: `node tools/atombalance.mjs --n=240 --games=24 --pilots=stub,rusher,kiter,controller --seed=53 --out=reports/combat/atombalance-panel-v8.md`

## Population health — the world these prices were measured in

A price found in fights the arena finished is a price for stalling, and a price found on kits whose slots never fired is a price for the slots that did. These rows say whether this pass measured fights or waits.

| | | contract (`docs/COMBAT.md` §3) |
|---|---|---|
| fight length, mean / median | 33.0 s / 35.4 s | median 20–35 s |
| reaching the burn clock (30 s) | 4215 of 5760 (73.2%) | ≤ 35% |
| decided by | arena 56% · hit 29% · fire 15% · mixed 0% | arena ≤ 20% |
| dead slots (a paid ability that never fired) | 2877 of 34560 (8.3%) | ≤ 2% |
| dodges per fight | 0.40 | ≥ 1 |
| harmless kits redrawn | 0 | — |

Every sampled kit carries at least one damage or burn atom, asserted here and not merely inherited from the grammar's L2 rule: a kit of three durations cannot take a hit point off anybody, so its league game would be decided by who was ahead at the bell. 0 such draws were rejected and re-drawn rather than scored (0 is the expected number while L2 stands).

"Decided by" is what took the last hit point — an opponent (`hit`), an ability's burn (`fire`), or the arena's own burn (`arena`); the sim logs all three as `kill`, and they are separated by matching the loser's `death` line against a `burned` / `burnedOut` line on the same tick. A dodge is an i-frame `evade` or a ground shape passing under an airborne body. A dead slot is an ability that never fired once; a kit is three abilities and all three are paid.

## Instrument health

| | |
|---|---|
| matches scored | 5760 of 5760 (0 errors) |
| draws | 101 (1.8%) |
| side balance (blue : orange wins) | 2830 : 2829 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 33.0 s |
| match length quartiles | p25 29.2 s · p50 35.4 s · p75 38.5 s |
| fights outliving the burn clock (30 s) | 4215 of 5760 (73.2%) |
| endings | kill 5659, double-ko 101 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 67 of 11520 |
| mean uses / hits per side per match | 23.8 / 3.7 |
| pilots actually used (sides) | kiter 2956, controller 2728, stub 2868, rusher 2968 |
| coverage | every effect and delivery in ≥ 12 kits (7 kits coverage-forced) |
| features | 130 (+ intercept): 8 deliveries (`lob` dropped as the baseline — the nine counts always sum to 3), 14 effects, 7 channels, n2, n3, 99 delivery×effect pairs seen in ≥ 2 kits. **No `cost` column** — it is an exact sum of the others (balance review H3) |
| fit | R² 0.916 in-sample, **0.729 cross-validated** (10-fold; 240 rows vs 130 features); cost alone: slope +1.59 pp per point, R² 0.341 |
| score spread across kits | mean 0.496, sd 0.224 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Effect and channel values are absolute. Delivery counts always sum to 3, so the delivery block is identified only up to a common level: `lob` is the baseline column and the nine delivery values are re-centred to mean zero, with standard errors bootstrapped through the re-centring. `target` = round(clamp(k·value, 1, 10)) with one k (2.190 points per pp) chosen so the costs sum to the current sum (99; achieved 97) — with --damp=1, `proposed` and `target` are the same number. A ● in `neg` marks a piece whose value is below −2·se: a trap, and no price in [1, 10] fixes it.

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | neg | target | proposed | Δ | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|:-:|---:|---:|---:|---:|---|
| effect | damage | 122 | 10 | +18.26 | 1.60 | ● |  | 10 | 10 | +0 | +1.83 |  |
| effect | burn | 137 | 9 | +9.45 | 1.67 | ● |  | 10 | 10 | +1 | +1.05 |  |
| channel | cooldown | 9 | 6 | +6.18 | 3.41 |  |  | 10 | 10 | +4 | +1.03 | significant only under rusher |
| delivery | jump | 54 | 7 | +6.02 | 2.14 | ● |  | 10 | 10 | +3 | +0.86 | significant only under controller |
| effect | shield | 79 | 7 | +5.60 | 1.27 | ● |  | 10 | 10 | +3 | +0.80 |  |
| effect | heal | 97 | 6 | +5.43 | 1.14 | ● |  | 10 | 10 | +4 | +0.90 |  |
| delivery | beam | 84 | 3 | +4.90 | 1.78 | ● |  | 10 | 10 | +7 | +1.63 | significant only under stub |
| effect | cleanse | 104 | 2 | +1.59 | 1.14 |  |  | 3 | 3 | +1 | +0.79 |  |
| delivery | lob *(baseline)* | 89 | 2 | +1.24 | 1.04 |  |  | 3 | 3 | +1 | +0.62 |  |
| effect | stun | 48 | 2 | +0.60 | 1.68 |  |  | 1 | 1 | -1 | +0.30 |  |
| effect | wall | 100 | 1 | +0.36 | 1.12 |  |  | 1 | 1 | +0 | +0.36 |  |
| channel | range | 27 | 1 | +0.31 | 2.31 |  |  | 1 | 1 | +0 | +0.31 |  |
| delivery | blink | 54 | 7 | -0.42 | 2.14 |  |  | 1 | 1 | -6 | -0.06 | significant only under controller |
| effect | blind | 60 | 2 | -0.55 | 1.33 |  |  | 1 | 1 | -1 | -0.28 |  |
| effect | knock | 50 | 2 | -0.80 | 1.31 |  |  | 1 | 1 | -1 | -0.40 |  |
| effect | silence | 51 | 2 | -0.95 | 1.29 |  |  | 1 | 1 | -1 | -0.48 |  |
| channel | damage | 19 | 1 | -1.01 | 2.50 |  |  | 1 | 1 | +0 | -1.01 |  |
| delivery | bolt | 80 | 4 | -1.10 | 1.50 |  |  | 1 | 1 | -3 | -0.28 |  |
| delivery | self | 56 | 5 | -1.74 | 2.13 |  |  | 1 | 1 | -4 | -0.35 |  |
| delivery | zone | 74 | 3 | -1.89 | 1.52 |  |  | 1 | 1 | -2 | -0.63 |  |
| effect | boost | 93 | 2 | -2.06 | 1.44 |  |  | 1 | 1 | -1 | -1.03 | significant only under stub |
| delivery | dash | 74 | 2 | -2.59 | 1.59 |  |  | 1 | 1 | -1 | -1.30 |  |
| channel | vision | 21 | 1 | -3.06 | 2.04 |  |  | 1 | 1 | +0 | -3.06 | significant only under rusher |
| channel | speed | 21 | 1 | -3.27 | 2.91 |  |  | 1 | 1 | +0 | -3.27 |  |
| effect | root | 49 | 2 | -3.55 | 1.52 | ● | ● | 1 | 1 | -1 | -1.78 |  |
| effect | weaken | 51 | 2 | -3.84 | 1.53 | ● | ● | 1 | 1 | -1 | -1.92 | significant only under rusher |
| effect | pull | 51 | 2 | -4.07 | 1.37 | ● | ● | 1 | 1 | -1 | -2.04 | significant only under kiter |
| delivery | cone | 83 | 2 | -4.41 | 1.58 | ● | ● | 1 | 1 | -1 | -2.21 |  |
| channel | armor | 30 | 2 | -4.41 | 1.88 | ● | ● | 1 | 1 | -1 | -2.21 |  |
| channel | turn | 19 | 1 | -4.97 | 2.52 |  |  | 1 | 1 | +0 | -4.97 |  |

## Combination features

- `n2`: +4.05 pp per unit ± 0.94 (significant)
- `n3`: +10.70 pp per unit ± 1.15 (significant)
- kit cost, fitted alone (it is NOT a column of the main design): +1.59 pp per point, R² 0.341
- intercept: 24.3 ± 4.1 pp

## Delivery × effect interactions (26 significant of 99)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| lob×damage | 21 | +12.64 | 2.49 |
| beam×heal | 5 | -12.29 | 4.04 |
| dash×damage | 14 | -12.15 | 2.43 |
| bolt×damage | 19 | +10.60 | 2.30 |
| blink×heal | 25 | +10.52 | 2.39 |
| beam×damage | 26 | +9.88 | 1.96 |
| dash×boost | 8 | -9.41 | 2.58 |
| zone×root | 6 | +9.07 | 3.72 |
| beam×wall | 2 | +8.09 | 3.74 |
| self×wall | 22 | +7.32 | 2.39 |
| cone×blind | 11 | -7.30 | 2.29 |
| lob×burn | 27 | +7.14 | 2.14 |
| bolt×boost | 12 | +6.79 | 3.05 |
| blink×boost | 15 | +6.67 | 2.71 |
| cone×burn | 25 | -6.61 | 2.28 |
| jump×wall | 19 | -6.31 | 2.06 |
| zone×blind | 9 | +6.14 | 2.31 |
| blink×shield | 13 | +6.13 | 2.33 |
| zone×burn | 20 | +6.00 | 2.19 |
| dash×burn | 25 | -5.95 | 2.32 |
| beam×root | 14 | -5.87 | 2.13 |
| jump×heal | 20 | +5.56 | 2.27 |
| beam×pull | 11 | -5.51 | 2.53 |
| zone×shield | 10 | -5.37 | 2.57 |
| bolt×burn | 22 | +5.08 | 2.46 |
| zone×heal | 7 | +5.02 | 2.33 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 239 | 0.271 |
| stub | kiter | 238 | 0.428 |
| stub | controller | 239 | 0.498 |
| rusher | kiter | 239 | 0.186 |
| rusher | controller | 240 | 0.423 |
| kiter | controller | 239 | 0.507 |

- stub: 239 kits, R² 0.787
- rusher: 240 kits, R² 0.794
- kiter: 239 kits, R² 0.765
- controller: 240 kits, R² 0.742

Pilot-dependent pieces: **cooldown** (significant only under rusher); **jump** (significant only under controller); **beam** (significant only under stub); **blink** (significant only under controller); **boost** (significant only under stub); **vision** (significant only under rusher); **weaken** (significant only under rusher); **pull** (significant only under kiter).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 98.2% | 56 | 55/0/1 | 54 | beam:damage+cleanse | self:boost+cleanse+heal/vision | lob:damage+knock |
| 2 | 95.7% | 46 | 44/0/2 | 55 | dash:stun+blind+burn | self:boost+wall/damage | beam:damage+burn |
| 3 | 94.0% | 50 | 47/0/3 | 47 | self:shield+wall | beam:damage | jump:heal+boost/armor |
| 4 | 93.5% | 46 | 43/0/3 | 46 | beam:damage | zone:boost+pull/armor | beam:shield+damage |
| 5 | 92.3% | 52 | 48/0/4 | 51 | lob:damage | blink:cleanse+heal | bolt:burn+shield |
| 6 | 91.7% | 36 | 33/0/3 | 29 | lob:pull | lob:damage | beam:damage |
| 7 | 90.7% | 54 | 48/2/4 | 51 | self:shield | blink:cleanse+heal+boost/speed | zone:root+burn |
| 8 | 90.6% | 64 | 58/0/6 | 55 | beam:blind+damage+stun | self:heal+shield | zone:damage |
| 9 | 90.4% | 52 | 47/0/5 | 45 | jump:heal | self:heal+cleanse | beam:damage+silence |
| 10 | 90.4% | 52 | 47/0/5 | 53 | lob:burn+damage | blink:heal | zone:damage+pull |

Top 10% (24 kits) use 9 of 9 deliveries and 14 of 14 effects; most common delivery beam (18.1% of their ability slots), most common effect damage (21.1% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-panel-v8.json`
