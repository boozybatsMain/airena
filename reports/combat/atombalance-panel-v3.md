# atombalance — seed 31

Regression of kit win rate on grammar pieces. 240 random legal kits, 5760 matches (24 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: registry (cost-derived). Ridge λ=1, 200 bootstrap resamples. Runtime 256 s (league 255 s on 8 workers).

Command: `node tools/atombalance.mjs --n=240 --games=24 --pilots=stub,rusher,kiter,controller --seed=31 --out=reports/combat/atombalance-panel-v3.md`

## Instrument health

| | |
|---|---|
| matches scored | 5760 of 5760 (0 errors) |
| draws | 121 (2.1%) |
| side balance (blue : orange wins) | 2803 : 2836 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 35.4 s |
| endings | kill 5639, double-ko 121 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 59 of 11520 |
| mean uses / hits per side per match | 26.5 / 4.2 |
| pilots actually used (sides) | controller 2872, kiter 2828, rusher 2868, stub 2952 |
| coverage | every effect and delivery in ≥ 12 kits (15 kits coverage-forced) |
| features | 132 (+ intercept): 9 deliveries, 14 effects, 7 channels, n2, n3, cost, 99 delivery×effect pairs seen in ≥ 2 kits |
| fit | R² 0.869 in-sample, **0.594 cross-validated** (10-fold; 240 rows vs 132 features); cost alone: slope +0.91 pp per point, R² 0.074 |
| score spread across kits | mean 0.500, sd 0.211 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Delivery counts always sum to 3 and total cost is an exact sum of the other features, so the design is rank-deficient by construction; ridge resolves it by the minimum-norm solution and delivery values are therefore relative to each other. `proposed` = round(clamp(k·value, 1, 10)) with one k (252.241 points per pp) chosen so the proposed costs sum to the current sum (111; achieved 92).

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | proposed | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|---:|---:|---|
| effect | damage | 122 | 8 | +15.86 | 1.46 | ● | 10 | +1.98 |  |
| delivery | blink | 58 | 4 | +7.30 | 2.49 | ● | 10 | +1.83 |  |
| delivery | zone | 74 | 4 | +5.04 | 1.80 | ● | 10 | +1.26 | significant only under controller |
| effect | burn | 141 | 6 | +5.00 | 1.77 | ● | 10 | +0.83 | significant only under kiter |
| effect | heal | 66 | 8 | +4.50 | 1.57 | ● | 10 | +0.56 |  |
| effect | shield | 81 | 5 | +3.07 | 1.44 | ● | 8 | +0.61 | significant only under rusher |
| effect | cleanse | 102 | 2 | +2.49 | 1.43 |  | 6 | +1.24 | significant only under stub |
| delivery | bolt | 87 | 4 | +1.95 | 1.66 |  | 5 | +0.49 |  |
| effect | pull | 48 | 2 | +0.60 | 1.62 |  | 2 | +0.30 |  |
| channel | damage | 24 | 2 | +0.26 | 2.75 |  | 1 | +0.13 |  |
| effect | silence | 43 | 4 | -0.31 | 1.83 |  | 1 | -0.08 |  |
| channel | speed | 11 | 1 | -0.33 | 3.72 |  | 1 | -0.33 |  |
| delivery | lob | 76 | 4 | -0.71 | 1.92 |  | 1 | -0.18 |  |
| delivery | beam | 78 | 4 | -0.91 | 1.87 |  | 1 | -0.23 | sign flips across pilots (rusher -7.2, kiter +5.5) |
| delivery | cone | 85 | 4 | -1.03 | 2.10 |  | 1 | -0.26 | sign flips across pilots (rusher +7.7, controller -8.7) |
| channel | turn | 24 | 1 | -1.43 | 2.44 |  | 1 | -1.43 |  |
| effect | root | 47 | 3 | -1.47 | 1.41 |  | 1 | -0.49 |  |
| delivery | jump | 51 | 6 | -1.65 | 2.41 |  | 1 | -0.27 |  |
| channel | vision | 17 | 2 | -1.96 | 2.82 |  | 1 | -0.98 |  |
| channel | cooldown | 20 | 4 | -2.66 | 2.64 |  | 1 | -0.66 | significant only under stub |
| effect | knock | 45 | 4 | -2.71 | 1.41 |  | 1 | -0.68 |  |
| channel | range | 22 | 1 | -2.76 | 2.48 |  | 1 | -2.76 |  |
| channel | armor | 12 | 4 | -3.31 | 2.75 |  | 1 | -0.83 |  |
| delivery | self | 48 | 4 | -3.74 | 2.48 |  | 1 | -0.93 | significant only under rusher |
| delivery | dash | 84 | 4 | -6.25 | 1.73 | ● | 1 | -1.56 | significant only under kiter |
| effect | blind | 44 | 3 | -6.72 | 1.67 | ● | 1 | -2.24 |  |
| effect | wall | 93 | 3 | -7.43 | 1.43 | ● | 1 | -2.48 |  |
| effect | stun | 44 | 4 | -8.22 | 1.83 | ● | 1 | -2.05 |  |
| effect | weaken | 40 | 3 | -8.42 | 1.47 | ● | 1 | -2.81 |  |
| effect | boost | 83 | 3 | -9.50 | 1.75 | ● | 1 | -3.17 |  |

## Combination features

- `n2`: -1.33 pp per unit ± 1.15
- `n3`: -5.97 pp per unit ± 1.26 (significant)
- `cost`: +1.21 pp per unit ± 0.20 (significant)
- intercept: 4.0 ± 6.8 pp

## Delivery × effect interactions (20 significant of 99)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| zone×burn | 15 | +10.80 | 4.01 |
| beam×damage | 13 | +10.66 | 2.42 |
| zone×pull | 8 | +10.64 | 3.86 |
| cone×burn | 29 | -10.38 | 2.18 |
| zone×heal | 7 | +10.15 | 3.07 |
| bolt×damage | 24 | +9.87 | 2.45 |
| zone×silence | 2 | -9.64 | 3.53 |
| cone×damage | 22 | -9.47 | 2.81 |
| lob×shield | 4 | -9.43 | 3.47 |
| cone×heal | 6 | -8.48 | 3.42 |
| cone×blind | 7 | +8.45 | 3.13 |
| beam×burn | 26 | +8.40 | 2.23 |
| dash×knock | 7 | -8.18 | 2.70 |
| lob×silence | 7 | +8.00 | 3.06 |
| self×shield | 15 | +7.99 | 3.14 |
| zone×stun | 8 | -7.41 | 3.53 |
| self×heal | 15 | +7.19 | 3.05 |
| dash×burn | 26 | -6.84 | 2.30 |
| zone×cleanse | 13 | -6.67 | 2.88 |
| beam×pull | 4 | -6.33 | 2.93 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 239 | 0.255 |
| stub | kiter | 239 | 0.422 |
| stub | controller | 239 | 0.525 |
| rusher | kiter | 240 | 0.113 |
| rusher | controller | 240 | 0.260 |
| kiter | controller | 240 | 0.553 |

- stub: 239 kits, R² 0.703
- rusher: 240 kits, R² 0.808
- kiter: 240 kits, R² 0.783
- controller: 240 kits, R² 0.741

Pilot-dependent pieces: **zone** (significant only under controller); **burn** (significant only under kiter); **shield** (significant only under rusher); **cleanse** (significant only under stub); **beam** (sign flips across pilots (rusher -7.2, kiter +5.5)); **cone** (sign flips across pilots (rusher +7.7, controller -8.7)); **cooldown** (significant only under stub); **self** (significant only under rusher); **dash** (significant only under kiter).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 95.8% | 48 | 46/0/2 | 39 | self:wall | zone:pull+damage | self:cleanse+heal |
| 2 | 93.2% | 44 | 41/0/3 | 39 | cone:silence+root | zone:damage | blink:wall+shield |
| 3 | 91.3% | 46 | 42/0/4 | 34 | blink:heal | zone:burn | cone:damage |
| 4 | 89.7% | 58 | 52/0/6 | 46 | bolt:damage+root | zone:heal+stun | zone:cleanse+wall |
| 5 | 87.5% | 40 | 35/0/5 | 51 | zone:wall+burn | self:shield+heal | dash:pull+cleanse+stun |
| 6 | 87.5% | 40 | 35/0/5 | 38 | zone:burn | self:heal | dash:heal+pull |
| 7 | 86.1% | 36 | 31/0/5 | 34 | cone:shield+wall | zone:damage | cone:silence |
| 8 | 86.0% | 50 | 43/0/7 | 40 | zone:pull | lob:burn+wall | blink:shield+heal |
| 9 | 85.4% | 48 | 41/0/7 | 26 | bolt:damage | bolt:silence | blink:cleanse |
| 10 | 85.0% | 60 | 51/0/9 | 49 | cone:knock+blind+stun | blink:heal | bolt:root+damage |

Top 10% (24 kits) use 9 of 9 deliveries and 14 of 14 effects; most common delivery zone (16.7% of their ability slots), most common effect damage (15.7% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-panel-v3.json`
