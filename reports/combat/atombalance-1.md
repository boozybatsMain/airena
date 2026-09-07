# atombalance — seed 1

Regression of kit win rate on grammar pieces. 60 random legal kits, 480 matches (8 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub. Cooldown: 3 s fixed for every ability. Ridge λ=1, 200 bootstrap resamples. Runtime 14 s (league 13 s on 8 workers).

Command: `node tools/atombalance.mjs --n=60 --games=8 --pilots=stub --cooldown=3 --seed=1`

## Instrument health

| | |
|---|---|
| matches scored | 480 of 480 (0 errors) |
| draws | 13 (2.7%) |
| side balance (blue : orange wins) | 230 : 237 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 34.9 s |
| endings | kill 467, double-ko 13 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 0 of 960 |
| mean uses / hits per side per match | 24.3 / 4.0 |
| pilots actually used (sides) | stub 960 |
| coverage | every effect and delivery in ≥ 3 kits (4 kits coverage-forced) |
| features | 94 (+ intercept): 9 deliveries, 14 effects, 7 channels, n2, n3, cost, 61 delivery×effect pairs seen in ≥ 2 kits |
| fit | R² 0.963 in-sample, **0.380 cross-validated** (10-fold; 60 rows vs 94 features — MORE FEATURES THAN ROWS, raise --n); cost alone: slope +0.59 pp per point, R² 0.016 |
| score spread across kits | mean 0.489, sd 0.285 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Delivery counts always sum to 3 and total cost is an exact sum of the other features, so the design is rank-deficient by construction; ridge resolves it by the minimum-norm solution and delivery values are therefore relative to each other. `proposed` = round(clamp(k·value, 1, 10)) with one k (177.129 points per pp) chosen so the proposed costs sum to the current sum (128; achieved 128).

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | proposed | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|---:|---:|---|
| effect | heal | 25 | 6 | +11.42 | 3.30 | ● | 10 | +1.90 |  |
| effect | shield | 26 | 4 | +8.46 | 3.35 | ● | 10 | +2.11 |  |
| channel | vision | 3 | 4 | +7.50 | 3.70 | ● | 10 | +1.88 |  |
| effect | damage | 37 | 7 | +7.03 | 2.55 | ● | 10 | +1.00 |  |
| channel | turn | 4 | 2 | +6.99 | 3.19 | ● | 10 | +3.50 |  |
| effect | weaken | 9 | 4 | +6.96 | 3.14 | ● | 10 | +1.74 |  |
| delivery | self | 14 | 3 | +6.59 | 2.98 | ● | 10 | +2.20 |  |
| delivery | jump | 8 | 5 | +5.47 | 3.10 |  | 10 | +1.09 |  |
| delivery | beam | 21 | 5 | +4.47 | 2.65 |  | 8 | +0.89 |  |
| channel | damage | 5 | 3 | +3.14 | 4.27 |  | 6 | +1.05 |  |
| delivery | blink | 16 | 5 | +2.61 | 3.00 |  | 5 | +0.52 |  |
| delivery | lob | 23 | 4 | +2.54 | 3.48 |  | 5 | +0.64 |  |
| effect | pull | 7 | 3 | +2.31 | 2.92 |  | 4 | +0.77 |  |
| effect | silence | 13 | 6 | +1.86 | 3.08 |  | 3 | +0.31 |  |
| effect | burn | 31 | 7 | +0.94 | 2.52 |  | 2 | +0.13 |  |
| channel | range | 5 | 2 | +0.03 | 3.51 |  | 1 | +0.02 |  |
| effect | stun | 12 | 6 | -1.20 | 2.68 |  | 1 | -0.20 |  |
| delivery | cone | 13 | 4 | -1.27 | 2.59 |  | 1 | -0.32 |  |
| channel | armor | 4 | 3 | -3.93 | 2.40 |  | 1 | -1.31 |  |
| effect | cleanse | 17 | 3 | -4.14 | 3.43 |  | 1 | -1.38 |  |
| effect | wall | 17 | 5 | -4.18 | 3.02 |  | 1 | -0.84 |  |
| delivery | bolt | 27 | 4 | -4.37 | 2.92 |  | 1 | -1.09 |  |
| channel | cooldown | 3 | 3 | -4.46 | 2.67 |  | 1 | -1.49 |  |
| delivery | zone | 19 | 5 | -5.58 | 2.90 |  | 1 | -1.12 |  |
| effect | knock | 8 | 5 | -6.45 | 4.58 |  | 1 | -1.29 |  |
| effect | boost | 17 | 4 | -6.87 | 2.65 | ● | 1 | -1.72 |  |
| effect | blind | 7 | 5 | -7.55 | 3.90 |  | 1 | -1.51 |  |
| channel | speed | 6 | 2 | -9.19 | 3.03 | ● | 1 | -4.60 |  |
| delivery | dash | 15 | 4 | -10.46 | 3.21 | ● | 1 | -2.61 |  |
| effect | root | 10 | 5 | -13.07 | 4.28 | ● | 1 | -2.61 |  |

## Combination features

- `n2`: -2.09 pp per unit ± 3.02
- `n3`: -1.20 pp per unit ± 1.41
- `cost`: +0.83 pp per unit ± 0.47
- intercept: 13.4 ± 18.3 pp

## Delivery × effect interactions (23 significant of 61)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| lob×weaken | 2 | +16.49 | 4.28 |
| beam×damage | 7 | +13.88 | 3.42 |
| dash×burn | 7 | -13.32 | 3.61 |
| zone×blind | 2 | -12.51 | 3.48 |
| zone×damage | 8 | +12.27 | 2.94 |
| self×boost | 2 | +10.91 | 3.31 |
| lob×damage | 9 | -10.39 | 3.03 |
| jump×heal | 3 | +9.52 | 3.19 |
| bolt×root | 2 | +9.45 | 3.27 |
| cone×damage | 5 | -9.39 | 2.52 |
| bolt×cleanse | 2 | -9.38 | 2.92 |
| self×heal | 5 | +8.86 | 3.67 |
| cone×boost | 4 | -8.75 | 2.86 |
| lob×boost | 2 | -8.54 | 2.81 |
| lob×burn | 5 | +8.45 | 3.71 |
| self×cleanse | 7 | -8.13 | 3.99 |
| dash×knock | 2 | -8.12 | 3.15 |
| beam×shield | 3 | -7.64 | 3.12 |
| jump×shield | 4 | +7.48 | 2.82 |
| bolt×weaken | 4 | -6.94 | 2.87 |
| bolt×shield | 5 | +6.25 | 2.93 |
| cone×burn | 3 | -5.39 | 2.39 |
| dash×boost | 2 | -4.48 | 1.81 |

## Pilot agreement

One pilot (stub): agreement cannot be measured. Every value above is that pilot's value.

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 100.0% | 20 | 20/0/0 | 38 | self:heal+wall | beam:damage | blink:wall |
| 2 | 91.7% | 18 | 16/1/1 | 31 | lob:stun | self:heal | beam:damage |
| 3 | 91.7% | 12 | 10/2/0 | 51 | jump:cleanse+shield+wall | bolt:damage | zone:shield+damage |
| 4 | 90.9% | 22 | 20/0/2 | 37 | lob:wall | self:shield | lob:damage+weaken/vision |
| 5 | 90.0% | 20 | 18/0/2 | 40 | beam:damage | jump:heal | cone:wall+stun |
| 6 | 90.0% | 20 | 18/0/2 | 39 | jump:boost+shield/speed | jump:heal | lob:burn |
| 7 | 88.9% | 18 | 16/0/2 | 51 | self:wall+cleanse | zone:burn+damage | blink:shield+heal |
| 8 | 87.5% | 16 | 14/0/2 | 45 | jump:heal+wall | bolt:damage | lob:pull+burn |
| 9 | 81.3% | 16 | 13/0/3 | 40 | beam:stun+silence | beam:damage | cone:knock |
| 10 | 80.0% | 20 | 16/0/4 | 44 | lob:weaken/range | bolt:shield+blind | beam:knock+burn |

Top 10% (6 kits) use 8 of 9 deliveries and 9 of 14 effects; most common delivery lob (22.2% of their ability slots), most common effect damage (24.0% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-1.json`
