# atombalance — seed 51

Regression of kit win rate on grammar pieces. 240 random legal kits, 5760 matches (24 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: registry (cost-derived). Ridge λ=1, 200 bootstrap resamples. Runtime 182 s (league 181 s on 8 workers).

Command: `node tools/atombalance.mjs --n=240 --games=24 --pilots=stub,rusher,kiter,controller --seed=51 --out=reports/combat/atombalance-panel-v5.md`

## Instrument health

| | |
|---|---|
| matches scored | 5760 of 5760 (0 errors) |
| draws | 91 (1.6%) |
| side balance (blue : orange wins) | 2829 : 2840 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 34.3 s |
| endings | kill 5669, double-ko 91 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 42 of 11520 |
| mean uses / hits per side per match | 25.8 / 3.4 |
| pilots actually used (sides) | rusher 2892, kiter 2828, controller 2988, stub 2812 |
| coverage | every effect and delivery in ≥ 12 kits (11 kits coverage-forced) |
| features | 131 (+ intercept): 9 deliveries, 14 effects, 7 channels, n2, n3, cost, 98 delivery×effect pairs seen in ≥ 2 kits |
| fit | R² 0.891 in-sample, **0.641 cross-validated** (10-fold; 240 rows vs 131 features); cost alone: slope +1.70 pp per point, R² 0.320 |
| score spread across kits | mean 0.501, sd 0.214 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Delivery counts always sum to 3 and total cost is an exact sum of the other features, so the design is rank-deficient by construction; ridge resolves it by the minimum-norm solution and delivery values are therefore relative to each other. `proposed` = round(clamp(k·value, 1, 10)) with one k (350.040 points per pp) chosen so the proposed costs sum to the current sum (92; achieved 92).

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | proposed | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|---:|---:|---|
| effect | damage | 123 | 9 | +10.54 | 1.34 | ● | 10 | +1.17 |  |
| delivery | blink | 55 | 6 | +2.64 | 1.74 |  | 9 | +0.44 | significant only under stub |
| delivery | bolt | 74 | 3 | +2.54 | 2.25 |  | 9 | +0.85 |  |
| delivery | cone | 73 | 3 | +2.49 | 2.31 |  | 9 | +0.83 | significant only under rusher |
| channel | armor | 7 | 2 | +2.43 | 4.40 |  | 9 | +1.21 |  |
| effect | heal | 87 | 6 | +2.14 | 1.55 |  | 7 | +0.36 |  |
| effect | cleanse | 100 | 2 | +1.62 | 1.23 |  | 6 | +0.81 | significant only under stub |
| effect | knock | 51 | 2 | +1.45 | 1.53 |  | 5 | +0.73 |  |
| effect | shield | 88 | 5 | +1.01 | 1.56 |  | 4 | +0.20 |  |
| delivery | lob | 79 | 3 | +0.98 | 1.84 |  | 3 | +0.33 | significant only under rusher |
| channel | damage | 27 | 1 | +0.44 | 2.33 |  | 2 | +0.44 | significant only under stub |
| effect | burn | 144 | 7 | +0.38 | 1.49 |  | 1 | +0.05 |  |
| delivery | jump | 71 | 5 | +0.17 | 2.35 |  | 1 | +0.03 |  |
| delivery | self | 51 | 4 | +0.07 | 2.34 |  | 1 | +0.02 |  |
| delivery | zone | 77 | 4 | -0.52 | 1.86 |  | 1 | -0.13 |  |
| channel | vision | 14 | 1 | -0.97 | 2.78 |  | 1 | -0.97 |  |
| effect | silence | 40 | 3 | -1.39 | 1.64 |  | 1 | -0.46 | significant only under rusher |
| channel | cooldown | 17 | 2 | -1.74 | 2.36 |  | 1 | -0.87 | significant only under stub |
| channel | range | 27 | 1 | -2.37 | 2.55 |  | 1 | -2.37 |  |
| delivery | beam | 85 | 4 | -3.18 | 1.61 |  | 1 | -0.80 | significant only under rusher |
| channel | speed | 26 | 1 | -3.27 | 2.53 |  | 1 | -3.27 |  |
| channel | turn | 30 | 1 | -3.61 | 2.56 |  | 1 | -3.61 |  |
| effect | pull | 63 | 2 | -4.10 | 1.30 | ● | 1 | -2.05 |  |
| effect | wall | 92 | 1 | -4.18 | 1.24 | ● | 1 | -4.18 |  |
| effect | boost | 89 | 2 | -4.40 | 1.18 | ● | 1 | -2.20 |  |
| effect | blind | 50 | 2 | -4.41 | 1.16 | ● | 1 | -2.21 | significant only under rusher |
| effect | stun | 56 | 3 | -4.54 | 1.52 | ● | 1 | -1.51 |  |
| effect | weaken | 51 | 2 | -4.70 | 1.60 | ● | 1 | -2.35 | significant only under rusher |
| delivery | dash | 83 | 3 | -5.19 | 1.92 | ● | 1 | -1.73 |  |
| effect | root | 46 | 2 | -7.38 | 1.31 | ● | 1 | -3.69 |  |

## Combination features

- `n2`: -2.02 pp per unit ± 1.04
- `n3`: -7.97 pp per unit ± 0.96 (significant)
- `cost`: +1.88 pp per unit ± 0.15 (significant)
- intercept: -8.9 ± 5.0 pp

## Delivery × effect interactions (12 significant of 98)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| cone×burn | 19 | -17.08 | 2.55 |
| zone×burn | 29 | +12.88 | 2.31 |
| beam×damage | 21 | +10.61 | 2.40 |
| cone×damage | 31 | -9.17 | 2.57 |
| bolt×damage | 17 | +7.69 | 2.39 |
| beam×burn | 25 | +7.55 | 2.40 |
| lob×weaken | 5 | +7.26 | 3.15 |
| lob×stun | 9 | -6.75 | 2.94 |
| blink×heal | 21 | +6.25 | 2.56 |
| bolt×wall | 11 | +5.34 | 2.60 |
| dash×burn | 27 | -5.27 | 2.35 |
| blink×wall | 19 | -5.02 | 2.38 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 239 | 0.229 |
| stub | kiter | 238 | 0.524 |
| stub | controller | 239 | 0.547 |
| rusher | kiter | 239 | 0.141 |
| rusher | controller | 240 | 0.361 |
| kiter | controller | 239 | 0.561 |

- stub: 239 kits, R² 0.798
- rusher: 240 kits, R² 0.777
- kiter: 239 kits, R² 0.777
- controller: 240 kits, R² 0.756

Pilot-dependent pieces: **blink** (significant only under stub); **cone** (significant only under rusher); **cleanse** (significant only under stub); **lob** (significant only under rusher); **damage** (significant only under stub); **silence** (significant only under rusher); **cooldown** (significant only under stub); **beam** (significant only under rusher); **blind** (significant only under rusher); **weaken** (significant only under rusher).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 97.7% | 44 | 43/0/1 | 51 | blink:heal+shield | zone:damage | lob:burn+pull+cleanse |
| 2 | 96.2% | 52 | 50/0/2 | 48 | jump:wall+cleanse+heal | beam:silence | zone:damage+burn |
| 3 | 95.7% | 46 | 44/0/2 | 55 | blink:heal | jump:heal+shield+wall | dash:burn+damage |
| 4 | 93.1% | 58 | 54/0/4 | 38 | lob:knock+damage | jump:boost/damage | zone:burn+wall |
| 5 | 92.9% | 42 | 39/0/3 | 49 | blink:cleanse+wall | bolt:damage+silence | zone:heal+damage |
| 6 | 91.2% | 34 | 31/0/3 | 51 | beam:burn+damage | zone:silence+stun+burn | self:boost/damage |
| 7 | 90.0% | 50 | 45/0/5 | 46 | blink:cleanse+heal | bolt:heal+damage | bolt:cleanse+weaken/turn |
| 8 | 85.7% | 42 | 36/0/6 | 56 | bolt:silence+heal+stun | beam:damage+shield | lob:heal+shield |
| 9 | 84.8% | 46 | 39/0/7 | 43 | zone:pull+damage | dash:damage+cleanse | zone:heal |
| 10 | 84.6% | 52 | 44/0/8 | 34 | zone:burn+knock | blink:heal | beam:boost/turn |

Top 10% (24 kits) use 9 of 9 deliveries and 14 of 14 effects; most common delivery zone (19.4% of their ability slots), most common effect damage (17.3% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-panel-v5.json`
