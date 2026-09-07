# atombalance — seed 11

Regression of kit win rate on grammar pieces. 240 random legal kits, 5760 matches (24 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub. Cooldown: registry (cost-derived). Ridge λ=1, 200 bootstrap resamples. Runtime 240 s (league 240 s on 4 workers).

Command: `node tools/atombalance.mjs --n=240 --games=24 --pilots=stub --seed=11 --out=reports/combat/atombalance-stub-v2.md`

## Instrument health

| | |
|---|---|
| matches scored | 5760 of 5760 (0 errors) |
| draws | 56 (1.0%) |
| side balance (blue : orange wins) | 2838 : 2866 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 37.3 s |
| endings | kill 5704, double-ko 56 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 0 of 11520 |
| mean uses / hits per side per match | 28.3 / 5.1 |
| pilots actually used (sides) | stub 11520 |
| coverage | every effect and delivery in ≥ 12 kits (19 kits coverage-forced) |
| features | 132 (+ intercept): 9 deliveries, 14 effects, 7 channels, n2, n3, cost, 99 delivery×effect pairs seen in ≥ 2 kits |
| fit | R² 0.858 in-sample, **0.596 cross-validated** (10-fold; 240 rows vs 132 features); cost alone: slope +0.36 pp per point, R² 0.007 |
| score spread across kits | mean 0.500, sd 0.261 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Delivery counts always sum to 3 and total cost is an exact sum of the other features, so the design is rank-deficient by construction; ridge resolves it by the minimum-norm solution and delivery values are therefore relative to each other. `proposed` = round(clamp(k·value, 1, 10)) with one k (186.892 points per pp) chosen so the proposed costs sum to the current sum (128; achieved 87).

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | proposed | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|---:|---:|---|
| effect | damage | 126 | 7 | +21.40 | 1.94 | ● | 10 | +3.06 |  |
| effect | heal | 66 | 6 | +10.68 | 2.02 | ● | 10 | +1.78 |  |
| effect | burn | 139 | 7 | +8.25 | 2.14 | ● | 10 | +1.18 |  |
| delivery | self | 51 | 3 | +5.72 | 3.45 |  | 10 | +1.91 |  |
| delivery | lob | 93 | 4 | +4.82 | 2.58 |  | 9 | +1.21 |  |
| delivery | blink | 43 | 5 | +2.79 | 2.75 |  | 5 | +0.56 |  |
| effect | shield | 91 | 4 | +2.42 | 1.70 |  | 5 | +0.60 |  |
| delivery | jump | 52 | 5 | +2.19 | 3.21 |  | 4 | +0.44 |  |
| channel | cooldown | 20 | 3 | +0.94 | 2.56 |  | 2 | +0.31 |  |
| delivery | bolt | 72 | 4 | +0.82 | 2.33 |  | 2 | +0.20 |  |
| channel | range | 15 | 2 | +0.67 | 3.24 |  | 1 | +0.34 |  |
| effect | cleanse | 82 | 3 | -0.34 | 1.76 |  | 1 | -0.11 |  |
| delivery | beam | 81 | 5 | -0.62 | 2.44 |  | 1 | -0.12 |  |
| delivery | zone | 93 | 5 | -1.25 | 2.87 |  | 1 | -0.25 |  |
| channel | armor | 15 | 3 | -1.90 | 3.67 |  | 1 | -0.63 |  |
| channel | damage | 20 | 3 | -2.01 | 3.79 |  | 1 | -0.67 |  |
| channel | speed | 21 | 2 | -2.35 | 3.30 |  | 1 | -1.17 |  |
| effect | pull | 47 | 3 | -2.89 | 2.22 |  | 1 | -0.96 |  |
| channel | vision | 15 | 4 | -3.10 | 4.01 |  | 1 | -0.77 |  |
| effect | silence | 43 | 6 | -3.25 | 2.12 |  | 1 | -0.54 |  |
| effect | blind | 45 | 5 | -3.75 | 2.13 |  | 1 | -0.75 |  |
| channel | turn | 12 | 2 | -3.94 | 3.82 |  | 1 | -1.97 |  |
| effect | weaken | 38 | 4 | -4.05 | 1.90 | ● | 1 | -1.01 |  |
| delivery | dash | 77 | 4 | -4.44 | 2.10 | ● | 1 | -1.11 |  |
| effect | knock | 37 | 5 | -5.84 | 1.71 | ● | 1 | -1.17 |  |
| effect | stun | 37 | 6 | -6.26 | 2.25 | ● | 1 | -1.04 |  |
| effect | root | 36 | 5 | -7.06 | 2.59 | ● | 1 | -1.41 |  |
| effect | wall | 84 | 5 | -7.17 | 1.51 | ● | 1 | -1.43 |  |
| effect | boost | 70 | 4 | -7.63 | 1.65 | ● | 1 | -1.91 |  |
| delivery | cone | 82 | 4 | -10.02 | 2.41 | ● | 1 | -2.51 |  |

## Combination features

- `n2`: -1.57 pp per unit ± 2.65
- `n3`: -1.96 pp per unit ± 1.77
- `cost`: +0.62 pp per unit ± 0.39
- intercept: 16.4 ± 12.6 pp

## Delivery × effect interactions (15 significant of 99)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| zone×burn | 26 | +15.91 | 3.11 |
| bolt×damage | 21 | +12.18 | 3.07 |
| beam×damage | 19 | +11.84 | 3.50 |
| cone×cleanse | 6 | +11.32 | 3.21 |
| lob×silence | 10 | -11.06 | 3.61 |
| jump×cleanse | 17 | +10.58 | 3.50 |
| jump×boost | 16 | +9.93 | 3.96 |
| cone×damage | 21 | -9.80 | 2.91 |
| zone×damage | 27 | +9.44 | 3.32 |
| lob×knock | 7 | -8.55 | 4.20 |
| cone×burn | 24 | -8.36 | 3.78 |
| jump×heal | 10 | +8.11 | 3.96 |
| jump×shield | 22 | +7.94 | 3.64 |
| dash×burn | 25 | -6.92 | 3.04 |
| dash×damage | 19 | -6.82 | 3.27 |

## Pilot agreement

One pilot (stub): agreement cannot be measured. Every value above is that pilot's value.

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 100.0% | 50 | 50/0/0 | 40 | jump:shield | zone:heal+damage | bolt:burn |
| 2 | 100.0% | 48 | 48/0/0 | 43 | lob:burn | jump:boost/damage | jump:boost+heal/cooldown |
| 3 | 100.0% | 46 | 46/0/0 | 29 | lob:damage | jump:heal | self:shield |
| 4 | 100.0% | 40 | 40/0/0 | 49 | jump:heal+shield | zone:damage | beam:burn+silence |
| 5 | 97.9% | 48 | 47/0/1 | 52 | beam:shield+damage | cone:heal+burn | self:shield+heal |
| 6 | 96.3% | 54 | 52/0/2 | 43 | jump:shield+cleanse | zone:damage | self:boost+heal/speed |
| 7 | 95.2% | 42 | 40/0/2 | 44 | jump:boost+heal/armor | self:cleanse+shield | zone:burn |
| 8 | 93.5% | 46 | 43/0/3 | 37 | zone:damage | jump:shield+cleanse | cone:damage |
| 9 | 93.1% | 58 | 54/0/4 | 44 | self:shield+boost/damage | jump:heal+shield | lob:damage |
| 10 | 92.9% | 42 | 39/0/3 | 30 | lob:shield | lob:damage | dash:damage |

Top 10% (24 kits) use 8 of 9 deliveries and 13 of 14 effects; most common delivery jump (20.8% of their ability slots), most common effect damage (22.3% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-stub-v2.json`
