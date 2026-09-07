# atombalance — seed 41

Regression of kit win rate on grammar pieces. 240 random legal kits, 5760 matches (24 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: registry (cost-derived). Ridge λ=1, 200 bootstrap resamples. Runtime 181 s (league 180 s on 8 workers).

Command: `node tools/atombalance.mjs --n=240 --games=24 --pilots=stub,rusher,kiter,controller --seed=41 --out=reports/combat/atombalance-panel-v4.md`

## Instrument health

| | |
|---|---|
| matches scored | 5760 of 5760 (0 errors) |
| draws | 128 (2.2%) |
| side balance (blue : orange wins) | 2816 : 2816 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 34.2 s |
| endings | kill 5632, double-ko 128 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 77 of 11520 |
| mean uses / hits per side per match | 25.0 / 4.6 |
| pilots actually used (sides) | stub 2940, controller 3016, rusher 2812, kiter 2752 |
| coverage | every effect and delivery in ≥ 12 kits (14 kits coverage-forced) |
| features | 132 (+ intercept): 9 deliveries, 14 effects, 7 channels, n2, n3, cost, 99 delivery×effect pairs seen in ≥ 2 kits |
| fit | R² 0.880 in-sample, **0.608 cross-validated** (10-fold; 240 rows vs 132 features); cost alone: slope +1.28 pp per point, R² 0.143 |
| score spread across kits | mean 0.500, sd 0.218 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Delivery counts always sum to 3 and total cost is an exact sum of the other features, so the design is rank-deficient by construction; ridge resolves it by the minimum-norm solution and delivery values are therefore relative to each other. `proposed` = round(clamp(k·value, 1, 10)) with one k (235.481 points per pp) chosen so the proposed costs sum to the current sum (110; achieved 82).

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | proposed | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|---:|---:|---|
| effect | damage | 132 | 9 | +16.99 | 1.36 | ● | 10 | +1.89 |  |
| delivery | blink | 51 | 5 | +7.66 | 2.46 | ● | 10 | +1.53 | significant only under controller |
| effect | burn | 125 | 7 | +6.22 | 1.58 | ● | 10 | +0.89 |  |
| delivery | self | 67 | 3 | +5.05 | 2.25 | ● | 10 | +1.68 |  |
| delivery | jump | 55 | 5 | +3.31 | 2.35 |  | 8 | +0.66 |  |
| delivery | beam | 75 | 4 | +2.96 | 2.10 |  | 7 | +0.74 | significant only under kiter |
| effect | heal | 66 | 7 | +1.19 | 1.61 |  | 3 | +0.17 | significant only under stub |
| channel | speed | 19 | 1 | +0.71 | 2.66 |  | 2 | +0.71 |  |
| effect | pull | 51 | 2 | +0.34 | 1.56 |  | 1 | +0.17 | significant only under kiter |
| effect | shield | 85 | 5 | -0.15 | 1.33 |  | 1 | -0.03 |  |
| effect | cleanse | 110 | 3 | -0.40 | 1.30 |  | 1 | -0.13 |  |
| channel | cooldown | 20 | 3 | -1.53 | 2.79 |  | 1 | -0.51 |  |
| channel | turn | 20 | 1 | -1.78 | 2.80 |  | 1 | -1.78 |  |
| effect | stun | 45 | 4 | -1.86 | 1.56 |  | 1 | -0.47 | significant only under rusher |
| delivery | zone | 75 | 5 | -2.22 | 1.66 |  | 1 | -0.44 |  |
| delivery | dash | 91 | 4 | -2.55 | 1.99 |  | 1 | -0.64 | significant only under kiter |
| channel | armor | 15 | 3 | -2.55 | 2.47 |  | 1 | -0.85 | significant only under controller |
| channel | vision | 17 | 2 | -2.63 | 2.65 |  | 1 | -1.31 |  |
| effect | blind | 44 | 3 | -2.87 | 1.51 |  | 1 | -0.96 |  |
| delivery | bolt | 74 | 4 | -3.20 | 1.57 | ● | 1 | -0.80 |  |
| effect | weaken | 40 | 3 | -3.96 | 1.85 | ● | 1 | -1.32 | significant only under stub |
| channel | damage | 23 | 2 | -4.57 | 2.57 |  | 1 | -2.29 |  |
| delivery | lob | 78 | 4 | -4.98 | 1.90 | ● | 1 | -1.25 |  |
| effect | silence | 36 | 4 | -5.45 | 1.50 | ● | 1 | -1.36 | significant only under stub |
| effect | root | 41 | 3 | -5.73 | 1.68 | ● | 1 | -1.91 |  |
| delivery | cone | 86 | 4 | -6.04 | 1.88 | ● | 1 | -1.51 |  |
| channel | range | 17 | 1 | -6.43 | 2.64 | ● | 1 | -6.43 | significant only under controller |
| effect | wall | 93 | 2 | -6.75 | 1.26 | ● | 1 | -3.37 |  |
| effect | knock | 44 | 4 | -7.04 | 1.42 | ● | 1 | -1.76 | significant only under stub |
| effect | boost | 89 | 3 | -7.17 | 1.51 | ● | 1 | -2.39 |  |

## Combination features

- `n2`: -0.24 pp per unit ± 1.20
- `n3`: -8.20 pp per unit ± 1.13 (significant)
- `cost`: +1.47 pp per unit ± 0.18 (significant)
- intercept: -4.3 ± 5.9 pp

## Delivery × effect interactions (19 significant of 99)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| lob×damage | 26 | +10.84 | 2.27 |
| zone×heal | 5 | +10.76 | 3.70 |
| beam×heal | 9 | -9.50 | 3.89 |
| dash×burn | 22 | -9.25 | 2.62 |
| zone×silence | 5 | -9.17 | 3.63 |
| zone×burn | 14 | +9.00 | 2.93 |
| zone×pull | 13 | +8.82 | 3.16 |
| bolt×shield | 6 | +8.80 | 4.15 |
| dash×stun | 12 | -8.22 | 2.91 |
| dash×blind | 11 | -8.04 | 2.79 |
| cone×knock | 7 | -7.97 | 3.69 |
| cone×burn | 27 | -7.06 | 2.45 |
| jump×heal | 15 | +6.95 | 2.70 |
| beam×damage | 23 | +6.63 | 2.72 |
| lob×burn | 21 | +6.52 | 2.81 |
| self×shield | 19 | +6.32 | 2.77 |
| beam×boost | 10 | -6.30 | 2.76 |
| cone×heal | 4 | -6.16 | 3.07 |
| self×wall | 20 | -5.69 | 2.26 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 240 | 0.207 |
| stub | kiter | 240 | 0.437 |
| stub | controller | 240 | 0.585 |
| rusher | kiter | 240 | 0.048 |
| rusher | controller | 240 | 0.299 |
| kiter | controller | 240 | 0.544 |

- stub: 240 kits, R² 0.745
- rusher: 240 kits, R² 0.741
- kiter: 240 kits, R² 0.772
- controller: 240 kits, R² 0.799

Pilot-dependent pieces: **blink** (significant only under controller); **beam** (significant only under kiter); **heal** (significant only under stub); **pull** (significant only under kiter); **stun** (significant only under rusher); **dash** (significant only under kiter); **armor** (significant only under controller); **weaken** (significant only under stub); **silence** (significant only under stub); **range** (significant only under controller); **knock** (significant only under stub).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 98.0% | 50 | 49/0/1 | 51 | jump:shield+heal | zone:burn+shield | dash:damage |
| 2 | 93.8% | 48 | 45/0/3 | 46 | bolt:root+damage | self:boost+cleanse/armor | zone:damage |
| 3 | 93.8% | 48 | 45/0/3 | 51 | cone:pull+wall+stun | lob:pull+damage | jump:heal+cleanse |
| 4 | 92.9% | 42 | 39/0/3 | 31 | self:shield | beam:damage | jump:shield |
| 5 | 91.7% | 48 | 43/2/3 | 43 | lob:damage | bolt:pull+shield | beam:damage+wall |
| 6 | 91.4% | 58 | 53/0/5 | 42 | zone:pull | zone:wall+heal | beam:damage+weaken/range |
| 7 | 91.3% | 40 | 36/1/3 | 34 | beam:damage | dash:boost/speed | self:cleanse+shield |
| 8 | 90.5% | 42 | 38/0/4 | 42 | cone:damage | beam:damage | beam:blind+heal |
| 9 | 89.7% | 58 | 52/0/6 | 51 | bolt:damage+knock | blink:shield+cleanse | beam:burn+weaken/range |
| 10 | 89.1% | 46 | 40/2/4 | 39 | bolt:damage | bolt:burn+shield | dash:stun |

Top 10% (24 kits) use 9 of 9 deliveries and 14 of 14 effects; most common delivery zone (19.4% of their ability slots), most common effect damage (23.0% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-panel-v4.json`
