# atombalance — seed 52

## **NOT CONVERGED**

Largest price move proposed: **8 points** (settled means ≤ 1). Pieces significantly negative: **2** (settled means 0).

Still moving: burn 7→10, cooldown 2→10, jump 5→9, blink 6→8, shield 5→8, silence 3→1, lob 3→1, stun 3→1, cone 3→1, zone 4→1, dash 3→1, beam 4→1.

Traps — a point spent here loses fights, and the floor price of 1 cannot fix that: **boost** (-4.8 ± 1.4 at cost 2), **beam** (-7.4 ± 2.3 at cost 4). These go back to the magnitudes, not to the price table.

**Value per point — -0.13 ± 1.30 pp/pt across the 14 effects (range -2.39 … +2.17).** Across all 30 pieces: -0.27 ± 1.72. This is the founder's flatness quantity: a point of budget should buy the same win rate wherever it is spent, so the number to drive down is the **sd**.

Secondary — corr(cost, value) = 0.721 over all pieces, 0.935 over effects. That is the price ORDER, not the price RATE; it can sit at 0.95 while a point on one piece buys three times what it buys on another.

Regression of kit win rate on grammar pieces. 240 random legal kits, 5760 matches (24 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: the registry's own — the schedule the game is played on. Ridge λ=1, 200 bootstrap resamples. Runtime 386 s (league 382 s on 8 workers).

Command: `node tools/atombalance.mjs --n=240 --games=24 --pilots=stub,rusher,kiter,controller --seed=52 --out=reports/combat/atombalance-panel-v7.md`

## Population health — the world these prices were measured in

A price found in fights the arena finished is a price for stalling, and a price found on kits whose slots never fired is a price for the slots that did. These rows say whether this pass measured fights or waits.

| | | contract (`docs/COMBAT.md` §3) |
|---|---|---|
| fight length, mean / median | 33.3 s / 35.5 s | median 20–35 s |
| reaching the burn clock (30 s) | 4344 of 5760 (75.4%) | ≤ 35% |
| decided by | arena 59% · hit 28% · fire 13% · mixed 0% | arena ≤ 20% |
| dead slots (a paid ability that never fired) | 2894 of 34560 (8.4%) | ≤ 2% |
| dodges per fight | 0.38 | ≥ 1 |
| harmless kits redrawn | 0 | — |

Every sampled kit carries at least one damage or burn atom, asserted here and not merely inherited from the grammar's L2 rule: a kit of three durations cannot take a hit point off anybody, so its league game would be decided by who was ahead at the bell. 0 such draws were rejected and re-drawn rather than scored (0 is the expected number while L2 stands).

"Decided by" is what took the last hit point — an opponent (`hit`), an ability's burn (`fire`), or the arena's own burn (`arena`); the sim logs all three as `kill`, and they are separated by matching the loser's `death` line against a `burned` / `burnedOut` line on the same tick. A dodge is an i-frame `evade` or a ground shape passing under an airborne body. A dead slot is an ability that never fired once; a kit is three abilities and all three are paid.

## Instrument health

| | |
|---|---|
| matches scored | 5760 of 5760 (0 errors) |
| draws | 101 (1.8%) |
| side balance (blue : orange wins) | 2865 : 2794 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 33.3 s |
| match length quartiles | p25 30.2 s · p50 35.5 s · p75 38.4 s |
| fights outliving the burn clock (30 s) | 4344 of 5760 (75.4%) |
| endings | kill 5659, double-ko 101 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 66 of 11520 |
| mean uses / hits per side per match | 24.2 / 3.8 |
| pilots actually used (sides) | stub 2752, kiter 2812, rusher 3048, controller 2908 |
| coverage | every effect and delivery in ≥ 12 kits (17 kits coverage-forced) |
| features | 130 (+ intercept): 8 deliveries (`cone` dropped as the baseline — the nine counts always sum to 3), 14 effects, 7 channels, n2, n3, 99 delivery×effect pairs seen in ≥ 2 kits. **No `cost` column** — it is an exact sum of the others (balance review H3) |
| fit | R² 0.855 in-sample, **0.539 cross-validated** (10-fold; 240 rows vs 130 features); cost alone: slope +1.49 pp per point, R² 0.256 |
| score spread across kits | mean 0.500, sd 0.206 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Effect and channel values are absolute. Delivery counts always sum to 3, so the delivery block is identified only up to a common level: `cone` is the baseline column and the nine delivery values are re-centred to mean zero, with standard errors bootstrapped through the re-centring. `target` = round(clamp(k·value, 1, 10)) with one k (1.523 points per pp) chosen so the costs sum to the current sum (92; achieved 92) — with --damp=1, `proposed` and `target` are the same number. A ● in `neg` marks a piece whose value is below −2·se: a trap, and no price in [1, 10] fixes it.

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | neg | target | proposed | Δ | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|:-:|---:|---:|---:|---:|---|
| effect | damage | 127 | 9 | +19.49 | 2.03 | ● |  | 10 | 10 | +1 | +2.17 |  |
| effect | burn | 129 | 7 | +9.25 | 2.16 | ● |  | 10 | 10 | +3 | +1.32 |  |
| channel | cooldown | 13 | 2 | +9.24 | 3.28 | ● |  | 10 | 10 | +8 | +4.62 |  |
| delivery | jump | 58 | 5 | +5.58 | 2.72 | ● |  | 9 | 9 | +4 | +1.12 |  |
| delivery | blink | 46 | 6 | +5.28 | 2.93 |  |  | 8 | 8 | +2 | +0.88 |  |
| effect | shield | 91 | 5 | +5.01 | 1.19 | ● |  | 8 | 8 | +3 | +1.00 |  |
| effect | heal | 78 | 6 | +3.88 | 1.58 | ● |  | 6 | 6 | +0 | +0.65 | significant only under rusher |
| delivery | self | 67 | 4 | +2.96 | 2.62 |  |  | 5 | 5 | +1 | +0.74 | significant only under controller |
| delivery | bolt | 79 | 3 | +2.61 | 2.22 |  |  | 4 | 4 | +1 | +0.87 | significant only under controller |
| channel | armor | 18 | 2 | +1.25 | 2.85 |  |  | 2 | 2 | +0 | +0.62 |  |
| effect | cleanse | 95 | 2 | +0.95 | 1.35 |  |  | 1 | 1 | -1 | +0.47 | significant only under rusher |
| effect | silence | 50 | 3 | +0.80 | 1.58 |  |  | 1 | 1 | -2 | +0.27 |  |
| effect | blind | 50 | 2 | +0.64 | 1.65 |  |  | 1 | 1 | -1 | +0.32 |  |
| delivery | lob | 66 | 3 | -0.29 | 2.01 |  |  | 1 | 1 | -2 | -0.10 |  |
| effect | stun | 58 | 3 | -0.34 | 1.83 |  |  | 1 | 1 | -2 | -0.11 |  |
| channel | speed | 26 | 1 | -0.36 | 2.67 |  |  | 1 | 1 | +0 | -0.36 |  |
| channel | turn | 25 | 1 | -0.89 | 2.25 |  |  | 1 | 1 | +0 | -0.89 |  |
| effect | pull | 49 | 2 | -1.07 | 1.74 |  |  | 1 | 1 | -1 | -0.53 | significant only under rusher |
| channel | vision | 23 | 1 | -1.08 | 2.35 |  |  | 1 | 1 | +0 | -1.08 |  |
| effect | knock | 66 | 2 | -1.39 | 1.70 |  |  | 1 | 1 | -1 | -0.70 |  |
| delivery | cone *(baseline)* | 94 | 3 | -1.51 | 1.19 |  |  | 1 | 1 | -2 | -0.50 |  |
| effect | root | 50 | 2 | -1.83 | 1.85 |  |  | 1 | 1 | -1 | -0.92 | significant only under rusher |
| effect | weaken | 42 | 2 | -2.01 | 1.71 |  |  | 1 | 1 | -1 | -1.00 |  |
| effect | wall | 89 | 1 | -2.38 | 1.31 |  |  | 1 | 1 | +0 | -2.38 |  |
| delivery | zone | 87 | 4 | -2.96 | 2.05 |  |  | 1 | 1 | -3 | -0.74 |  |
| channel | range | 24 | 1 | -3.95 | 2.57 |  |  | 1 | 1 | +0 | -3.95 |  |
| channel | damage | 23 | 1 | -4.10 | 3.11 |  |  | 1 | 1 | +0 | -4.10 |  |
| delivery | dash | 78 | 3 | -4.28 | 2.18 |  |  | 1 | 1 | -2 | -1.43 |  |
| effect | boost | 95 | 2 | -4.77 | 1.42 | ● | ● | 1 | 1 | -1 | -2.39 |  |
| delivery | beam | 88 | 4 | -7.38 | 2.33 | ● | ● | 1 | 1 | -3 | -1.84 | sign flips across pilots (stub -10.4, rusher -11.8, kiter +8.9) |

## Combination features

- `n2`: +5.61 pp per unit ± 1.03 (significant)
- `n3`: +10.31 pp per unit ± 1.37 (significant)
- kit cost, fitted alone (it is NOT a column of the main design): +1.49 pp per point, R² 0.256
- intercept: 18.8 ± 4.4 pp

## Delivery × effect interactions (19 significant of 99)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| beam×damage | 23 | +15.55 | 3.05 |
| lob×damage | 15 | +13.58 | 3.19 |
| cone×burn | 23 | -13.23 | 2.68 |
| zone×burn | 19 | +11.81 | 2.99 |
| dash×damage | 21 | -10.55 | 3.26 |
| cone×heal | 6 | -10.41 | 3.24 |
| bolt×blind | 5 | +9.90 | 3.35 |
| lob×burn | 21 | +9.51 | 3.20 |
| zone×heal | 12 | +9.00 | 3.90 |
| lob×cleanse | 6 | -8.95 | 4.09 |
| bolt×pull | 7 | -8.85 | 3.68 |
| beam×wall | 11 | +8.73 | 3.36 |
| beam×burn | 27 | +8.42 | 2.94 |
| cone×blind | 14 | -8.29 | 3.00 |
| cone×damage | 30 | -7.97 | 2.40 |
| bolt×shield | 8 | +7.89 | 3.53 |
| zone×pull | 14 | +7.80 | 3.02 |
| bolt×damage | 21 | +7.42 | 2.48 |
| dash×burn | 22 | -6.40 | 2.53 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 239 | 0.185 |
| stub | kiter | 239 | 0.443 |
| stub | controller | 240 | 0.541 |
| rusher | kiter | 238 | -0.056 |
| rusher | controller | 239 | 0.236 |
| kiter | controller | 239 | 0.538 |

- stub: 240 kits, R² 0.763
- rusher: 239 kits, R² 0.838
- kiter: 239 kits, R² 0.735
- controller: 240 kits, R² 0.776

Pilot-dependent pieces: **heal** (significant only under rusher); **self** (significant only under controller); **bolt** (significant only under controller); **cleanse** (significant only under rusher); **pull** (significant only under rusher); **root** (significant only under rusher); **beam** (sign flips across pilots (stub -10.4, rusher -11.8, kiter +8.9)).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 100.0% | 42 | 42/0/0 | 48 | zone:pull+silence | beam:damage+shield | jump:boost+heal/cooldown |
| 2 | 97.5% | 40 | 39/0/1 | 55 | self:heal+cleanse+wall | zone:heal+damage | beam:burn+stun |
| 3 | 92.3% | 52 | 48/0/4 | 50 | cone:boost+heal/speed | bolt:weaken+damage/armor | bolt:damage+boost/armor |
| 4 | 92.3% | 52 | 48/0/4 | 50 | beam:burn | lob:damage+burn | jump:wall+shield+cleanse |
| 5 | 91.7% | 48 | 44/0/4 | 40 | lob:damage+cleanse | blink:cleanse+heal | lob:root+wall |
| 6 | 91.7% | 48 | 44/0/4 | 53 | zone:cleanse+stun+heal | beam:burn | beam:damage+burn |
| 7 | 90.6% | 32 | 28/2/2 | 48 | beam:silence+damage | blink:cleanse | zone:damage+knock+blind |
| 8 | 89.6% | 48 | 43/0/5 | 50 | self:heal+shield | beam:burn+silence+stun | blink:cleanse+wall |
| 9 | 87.0% | 46 | 40/0/6 | 46 | lob:burn | zone:root+damage+blind | dash:burn+root |
| 10 | 86.4% | 44 | 38/0/6 | 41 | beam:damage | self:heal+cleanse+shield | cone:stun |

Top 10% (24 kits) use 9 of 9 deliveries and 14 of 14 effects; most common delivery beam (22.2% of their ability slots), most common effect damage (19.3% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-panel-v7.json`
