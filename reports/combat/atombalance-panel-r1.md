# atombalance — seed 71

## **NOT CONVERGED**

Largest price move proposed: **6 points** (settled means ≤ 1). Pieces significantly negative: **5** (settled means 0).

Still moving: blink 6→10, burn 7→10, shield 5→9, vision 1→7, range 1→5, zone 4→1, self 4→1, jump 5→1, silence 3→1, beam 4→1, lob 3→1, dash 3→1.

Traps — a point spent here loses fights, and the floor price of 1 cannot fix that: **lob** (-2.7 ± 0.9 at cost 3), **boost** (-3.7 ± 1.6 at cost 2), **weaken** (-4.6 ± 2.0 at cost 2), **wall** (-4.9 ± 1.6 at cost 1), **dash** (-7.0 ± 2.3 at cost 3). These go back to the magnitudes, not to the price table.

**Value per point — -0.53 ± 1.84 pp/pt across the 14 effects (range -4.89 … +2.46).** Across all 30 pieces: -0.31 ± 2.01. This is the founder's flatness quantity: a point of budget should buy the same win rate wherever it is spent, so the number to drive down is the **sd**.

Secondary — corr(cost, value) = 0.723 over all pieces, 0.907 over effects. That is the price ORDER, not the price RATE; it can sit at 0.95 while a point on one piece buys three times what it buys on another.

Regression of kit win rate on grammar pieces. 160 random legal kits, 2560 matches (16 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: the registry's own — the schedule the game is played on. Ridge λ=1, 200 bootstrap resamples. Runtime 562 s (league 559 s on 2 workers).

Command: `node tools/atombalance.mjs --n=160 --games=16 --pilots=stub,rusher,kiter,controller --seed=71 --out=reports/combat/atombalance-panel-r1.md`

## Population health — the world these prices were measured in

A price found in fights the arena finished is a price for stalling, and a price found on kits whose slots never fired is a price for the slots that did. These rows say whether this pass measured fights or waits.

| | | contract (`docs/COMBAT.md` §3) |
|---|---|---|
| fight length, mean / median | 33.5 s / 35.9 s | median 20–35 s |
| reaching the burn clock (30 s) | 1961 of 2560 (76.6%) | ≤ 35% |
| decided by | arena 59% · hit 26% · fire 15% · mixed 0% | arena ≤ 20% |
| dead slots (a paid ability that never fired) | 1049 of 15360 (6.8%) | ≤ 2% |
| dodges per fight | 0.48 | ≥ 1 |
| harmless kits redrawn | 0 | — |

Every sampled kit carries at least one damage or burn atom, asserted here and not merely inherited from the grammar's L2 rule: a kit of three durations cannot take a hit point off anybody, so its league game would be decided by who was ahead at the bell. 0 such draws were rejected and re-drawn rather than scored (0 is the expected number while L2 stands).

"Decided by" is what took the last hit point — an opponent (`hit`), an ability's burn (`fire`), or the arena's own burn (`arena`); the sim logs all three as `kill`, and they are separated by matching the loser's `death` line against a `burned` / `burnedOut` line on the same tick. A dodge is an i-frame `evade` or a ground shape passing under an airborne body. A dead slot is a paid ability that never fired once; the free universal verb is not counted.

## Instrument health

| | |
|---|---|
| matches scored | 2560 of 2560 (0 errors) |
| draws | 39 (1.5%) |
| side balance (blue : orange wins) | 1264 : 1257 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 33.5 s |
| match length quartiles | p25 30.7 s · p50 35.9 s · p75 38.8 s |
| fights outliving the burn clock (30 s) | 1961 of 2560 (76.6%) |
| endings | kill 2521, double-ko 39 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 29 of 5120 |
| mean uses / hits per side per match | 24.6 / 4.0 |
| pilots actually used (sides) | stub 1356, rusher 1336, kiter 1164, controller 1264 |
| coverage | every effect and delivery in ≥ 8 kits (7 kits coverage-forced) |
| features | 129 (+ intercept): 8 deliveries (`lob` dropped as the baseline — the nine counts always sum to 3), 14 effects, 7 channels, n2, n3, 98 delivery×effect pairs seen in ≥ 2 kits. **No `cost` column** — it is an exact sum of the others (balance review H3) |
| fit | R² 0.904 in-sample, **0.545 cross-validated** (10-fold; 160 rows vs 129 features); cost alone: slope +1.44 pp per point, R² 0.228 |
| score spread across kits | mean 0.503, sd 0.225 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Effect and channel values are absolute. Delivery counts always sum to 3, so the delivery block is identified only up to a common level: `lob` is the baseline column and the nine delivery values are re-centred to mean zero, with standard errors bootstrapped through the re-centring. `target` = round(clamp(k·value, 1, 10)) with one k (1.809 points per pp) chosen so the costs sum to the current sum (92; achieved 91) — with --damp=1, `proposed` and `target` are the same number. A ● in `neg` marks a piece whose value is below −2·se: a trap, and no price in [1, 10] fixes it.

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | neg | target | proposed | Δ | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|:-:|---:|---:|---:|---:|---|
| effect | damage | 75 | 9 | +22.11 | 2.05 | ● |  | 10 | 10 | +1 | +2.46 |  |
| delivery | blink | 34 | 6 | +8.00 | 2.44 | ● |  | 10 | 10 | +4 | +1.33 |  |
| effect | burn | 106 | 7 | +6.19 | 2.47 | ● |  | 10 | 10 | +3 | +0.88 |  |
| effect | shield | 67 | 5 | +5.08 | 1.89 | ● |  | 9 | 9 | +4 | +1.02 | significant only under controller |
| channel | vision | 19 | 1 | +3.88 | 2.78 |  |  | 7 | 7 | +6 | +3.88 |  |
| effect | heal | 61 | 6 | +3.63 | 1.94 |  |  | 7 | 7 | +1 | +0.60 | significant only under controller |
| channel | range | 17 | 1 | +2.63 | 3.03 |  |  | 5 | 5 | +4 | +2.63 |  |
| delivery | bolt | 40 | 3 | +2.21 | 2.56 |  |  | 4 | 4 | +1 | +0.74 | significant only under controller |
| delivery | cone | 50 | 3 | +1.81 | 2.38 |  |  | 3 | 3 | +0 | +0.60 | significant only under controller |
| effect | stun | 36 | 3 | +1.59 | 1.91 |  |  | 3 | 3 | +0 | +0.53 |  |
| channel | armor | 16 | 2 | +1.44 | 2.52 |  |  | 3 | 3 | +1 | +0.72 |  |
| effect | cleanse | 64 | 2 | +1.38 | 2.10 |  |  | 2 | 2 | +0 | +0.69 |  |
| channel | speed | 9 | 1 | +0.43 | 2.58 |  |  | 1 | 1 | +0 | +0.43 |  |
| delivery | zone | 53 | 4 | +0.38 | 1.85 |  |  | 1 | 1 | -3 | +0.09 |  |
| delivery | self | 35 | 4 | -0.02 | 3.47 |  |  | 1 | 1 | -3 | -0.01 | significant only under controller |
| effect | blind | 34 | 2 | -0.17 | 2.19 |  |  | 1 | 1 | -1 | -0.09 |  |
| delivery | jump | 43 | 5 | -0.77 | 2.48 |  |  | 1 | 1 | -4 | -0.15 |  |
| channel | damage | 13 | 1 | -1.35 | 2.81 |  |  | 1 | 1 | +0 | -1.35 |  |
| effect | knock | 29 | 2 | -1.42 | 1.70 |  |  | 1 | 1 | -1 | -0.71 |  |
| effect | silence | 37 | 3 | -1.49 | 2.78 |  |  | 1 | 1 | -2 | -0.50 | significant only under kiter |
| channel | cooldown | 8 | 2 | -1.65 | 3.14 |  |  | 1 | 1 | -1 | -0.83 |  |
| delivery | beam | 55 | 4 | -1.86 | 2.32 |  |  | 1 | 1 | -3 | -0.47 | significant only under rusher |
| effect | pull | 33 | 2 | -2.45 | 1.89 |  |  | 1 | 1 | -1 | -1.22 |  |
| delivery | lob *(baseline)* | 62 | 3 | -2.70 | 0.89 | ● | ● | 1 | 1 | -2 | -0.90 |  |
| effect | boost | 60 | 2 | -3.66 | 1.62 | ● | ● | 1 | 1 | -1 | -1.83 | significant only under rusher |
| effect | root | 41 | 2 | -4.15 | 2.38 |  |  | 1 | 1 | -1 | -2.08 |  |
| effect | weaken | 31 | 2 | -4.55 | 2.02 | ● | ● | 1 | 1 | -1 | -2.28 | significant only under kiter |
| effect | wall | 68 | 1 | -4.89 | 1.59 | ● | ● | 1 | 1 | +0 | -4.89 |  |
| channel | turn | 14 | 1 | -6.16 | 3.24 |  |  | 1 | 1 | +0 | -6.16 |  |
| delivery | dash | 61 | 3 | -7.04 | 2.34 | ● | ● | 1 | 1 | -2 | -2.35 |  |

## Combination features

- `n2`: +1.42 pp per unit ± 1.33
- `n3`: +7.89 pp per unit ± 1.61 (significant)
- kit cost, fitted alone (it is NOT a column of the main design): +1.44 pp per point, R² 0.228
- intercept: 21.1 ± 4.4 pp

## Delivery × effect interactions (20 significant of 98)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| beam×damage | 14 | +18.72 | 3.63 |
| zone×burn | 21 | +17.17 | 3.05 |
| cone×burn | 18 | -13.72 | 3.25 |
| self×heal | 16 | +11.19 | 3.36 |
| lob×stun | 4 | +10.05 | 3.93 |
| bolt×root | 2 | -9.21 | 4.05 |
| bolt×boost | 3 | -9.20 | 2.92 |
| lob×root | 10 | +8.79 | 2.79 |
| blink×boost | 11 | +8.78 | 2.98 |
| zone×knock | 3 | +8.22 | 3.44 |
| beam×cleanse | 4 | +8.20 | 3.29 |
| zone×pull | 5 | +8.19 | 3.64 |
| dash×boost | 6 | -7.94 | 3.63 |
| lob×knock | 6 | -7.89 | 3.51 |
| cone×shield | 13 | -7.79 | 3.36 |
| jump×shield | 17 | +7.76 | 3.16 |
| cone×heal | 3 | -7.72 | 3.22 |
| blink×shield | 11 | +7.21 | 3.09 |
| dash×stun | 8 | -6.67 | 2.45 |
| beam×heal | 7 | -5.88 | 2.81 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 159 | 0.251 |
| stub | kiter | 156 | 0.312 |
| stub | controller | 159 | 0.490 |
| rusher | kiter | 155 | 0.004 |
| rusher | controller | 158 | 0.262 |
| kiter | controller | 155 | 0.368 |

- stub: 160 kits, R² 0.800
- rusher: 159 kits, R² 0.836
- kiter: 156 kits, R² 0.856
- controller: 159 kits, R² 0.823

Pilot-dependent pieces: **shield** (significant only under controller); **heal** (significant only under controller); **bolt** (significant only under controller); **cone** (significant only under controller); **self** (significant only under controller); **silence** (significant only under kiter); **beam** (significant only under rusher); **boost** (significant only under rusher); **weaken** (significant only under kiter).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 100.0% | 28 | 28/0/0 | 55 | blink:shield+cleanse+wall | zone:silence+burn+wall | jump:heal+boost/turn |
| 2 | 94.2% | 26 | 24/1/1 | 42 | bolt:weaken/range | dash:damage+burn | zone:burn+pull |
| 3 | 92.9% | 28 | 26/0/2 | 43 | self:heal+boost/cooldown | dash:damage | blink:cleanse+shield |
| 4 | 92.3% | 26 | 24/0/2 | 41 | jump:cleanse+wall+heal | beam:root+damage | dash:cleanse |
| 5 | 91.7% | 24 | 22/0/2 | 37 | lob:cleanse+root+boost/speed | beam:blind+damage | bolt:pull |
| 6 | 88.5% | 26 | 23/0/3 | 43 | blink:shield | zone:damage+boost/vision | lob:root+burn |
| 7 | 87.5% | 32 | 28/0/4 | 45 | blink:heal | dash:shield+cleanse | zone:stun+burn+cleanse |
| 8 | 86.8% | 38 | 33/0/5 | 46 | dash:damage+wall | jump:cleanse+shield | blink:boost+heal/damage |
| 9 | 86.7% | 30 | 26/0/4 | 36 | jump:cleanse | zone:burn+weaken/armor | bolt:damage |
| 10 | 86.7% | 30 | 26/0/4 | 48 | blink:shield | dash:burn+damage | bolt:damage+knock |

Top 10% (16 kits) use 9 of 9 deliveries and 14 of 14 effects; most common delivery blink (22.9% of their ability slots), most common effect damage (18.8% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-panel-r1.json`
