# atombalance — seed 21

Regression of kit win rate on grammar pieces. 240 random legal kits, 5760 matches (24 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: registry (cost-derived). Ridge λ=1, 200 bootstrap resamples. Runtime 204 s (league 203 s on 8 workers).

Command: `node tools/atombalance.mjs --n=240 --games=24 --pilots=stub,rusher,kiter,controller --seed=21 --out=reports/combat/atombalance-panel-v2.md`

## Instrument health

| | |
|---|---|
| matches scored | 5760 of 5760 (0 errors) |
| draws | 145 (2.5%) |
| side balance (blue : orange wins) | 2787 : 2828 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 37.4 s |
| endings | kill 5615, double-ko 145 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 83 of 11520 |
| mean uses / hits per side per match | 27.9 / 4.9 |
| pilots actually used (sides) | rusher 2968, controller 2892, kiter 2824, stub 2836 |
| coverage | every effect and delivery in ≥ 12 kits (18 kits coverage-forced) |
| features | 132 (+ intercept): 9 deliveries, 14 effects, 7 channels, n2, n3, cost, 99 delivery×effect pairs seen in ≥ 2 kits |
| fit | R² 0.881 in-sample, **0.647 cross-validated** (10-fold; 240 rows vs 132 features); cost alone: slope +0.38 pp per point, R² 0.009 |
| score spread across kits | mean 0.501, sd 0.228 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Delivery counts always sum to 3 and total cost is an exact sum of the other features, so the design is rank-deficient by construction; ridge resolves it by the minimum-norm solution and delivery values are therefore relative to each other. `proposed` = round(clamp(k·value, 1, 10)) with one k (281.730 points per pp) chosen so the proposed costs sum to the current sum (128; achieved 97).

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | proposed | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|---:|---:|---|
| effect | damage | 122 | 7 | +14.20 | 2.08 | ● | 10 | +2.03 |  |
| effect | heal | 72 | 6 | +12.92 | 1.41 | ● | 10 | +2.15 |  |
| delivery | jump | 45 | 5 | +5.57 | 2.03 | ● | 10 | +1.11 |  |
| effect | shield | 75 | 4 | +4.68 | 1.39 | ● | 10 | +1.17 |  |
| channel | cooldown | 15 | 3 | +3.76 | 2.82 |  | 10 | +1.25 |  |
| channel | armor | 15 | 3 | +3.36 | 2.58 |  | 9 | +1.12 |  |
| effect | burn | 133 | 7 | +3.18 | 1.92 |  | 9 | +0.45 | significant only under controller |
| delivery | self | 51 | 3 | +2.47 | 2.23 |  | 7 | +0.82 | significant only under rusher |
| delivery | bolt | 73 | 4 | +0.38 | 1.93 |  | 1 | +0.10 |  |
| channel | turn | 10 | 2 | -0.14 | 2.44 |  | 1 | -0.07 |  |
| effect | knock | 47 | 5 | -0.26 | 1.80 |  | 1 | -0.05 |  |
| delivery | cone | 76 | 4 | -0.45 | 2.08 |  | 1 | -0.11 |  |
| delivery | blink | 66 | 5 | -0.45 | 2.67 |  | 1 | -0.09 | sign flips across pilots (kiter -11.6, controller +8.9) |
| effect | pull | 47 | 3 | -0.64 | 1.64 |  | 1 | -0.21 |  |
| effect | silence | 40 | 6 | -0.84 | 1.76 |  | 1 | -0.14 |  |
| delivery | dash | 93 | 4 | -0.85 | 1.74 |  | 1 | -0.21 |  |
| delivery | zone | 94 | 5 | -1.58 | 2.14 |  | 1 | -0.32 |  |
| delivery | lob | 83 | 4 | -2.25 | 1.82 |  | 1 | -0.56 | significant only under controller |
| channel | range | 17 | 2 | -2.33 | 2.78 |  | 1 | -1.16 |  |
| effect | cleanse | 88 | 3 | -2.72 | 1.33 | ● | 1 | -0.91 |  |
| delivery | beam | 78 | 5 | -2.85 | 1.92 |  | 1 | -0.57 |  |
| channel | damage | 16 | 3 | -3.07 | 2.61 |  | 1 | -1.02 |  |
| effect | stun | 47 | 6 | -4.80 | 1.72 | ● | 1 | -0.80 |  |
| effect | boost | 72 | 4 | -5.12 | 1.44 | ● | 1 | -1.28 |  |
| effect | blind | 44 | 5 | -5.39 | 1.77 | ● | 1 | -1.08 | significant only under kiter |
| effect | weaken | 24 | 4 | -5.58 | 1.94 | ● | 1 | -1.40 |  |
| channel | speed | 16 | 2 | -5.61 | 2.99 |  | 1 | -2.80 |  |
| effect | root | 51 | 5 | -6.01 | 1.54 | ● | 1 | -1.20 |  |
| effect | wall | 89 | 5 | -6.50 | 1.23 | ● | 1 | -1.30 |  |
| channel | vision | 13 | 4 | -6.67 | 2.31 | ● | 1 | -1.67 | significant only under controller |

## Combination features

- `n2`: +0.72 pp per unit ± 2.08
- `n3`: -1.80 pp per unit ± 1.45
- `cost`: +0.32 pp per unit ± 0.29
- intercept: 30.5 ± 9.4 pp

## Delivery × effect interactions (25 significant of 99)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| zone×burn | 29 | +19.98 | 2.92 |
| zone×heal | 8 | +12.87 | 3.39 |
| blink×heal | 8 | +11.62 | 3.07 |
| dash×burn | 17 | -11.52 | 2.85 |
| lob×blind | 6 | -11.20 | 3.43 |
| bolt×cleanse | 9 | -10.71 | 4.09 |
| cone×damage | 14 | -10.69 | 2.98 |
| bolt×damage | 15 | +10.51 | 3.27 |
| cone×burn | 21 | -10.50 | 2.73 |
| blink×shield | 17 | +9.85 | 3.29 |
| zone×knock | 9 | +9.80 | 4.30 |
| zone×damage | 21 | +9.69 | 2.88 |
| dash×heal | 9 | -9.00 | 3.12 |
| cone×heal | 8 | -8.73 | 3.77 |
| beam×damage | 22 | +8.69 | 2.55 |
| jump×wall | 15 | -8.38 | 2.74 |
| dash×silence | 8 | -8.35 | 3.22 |
| bolt×weaken | 3 | -8.26 | 3.75 |
| dash×weaken | 4 | -7.51 | 3.24 |
| dash×boost | 7 | -7.13 | 3.35 |
| beam×wall | 8 | +7.05 | 3.31 |
| bolt×shield | 8 | +6.65 | 3.26 |
| self×heal | 14 | +6.64 | 3.22 |
| cone×shield | 10 | -6.46 | 3.17 |
| beam×burn | 25 | +5.48 | 2.54 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 240 | 0.307 |
| stub | kiter | 240 | 0.537 |
| stub | controller | 240 | 0.577 |
| rusher | kiter | 240 | 0.190 |
| rusher | controller | 240 | 0.329 |
| kiter | controller | 240 | 0.602 |

- stub: 240 kits, R² 0.743
- rusher: 240 kits, R² 0.763
- kiter: 240 kits, R² 0.783
- controller: 240 kits, R² 0.807

Pilot-dependent pieces: **burn** (significant only under controller); **self** (significant only under rusher); **blink** (sign flips across pilots (kiter -11.6, controller +8.9)); **lob** (significant only under controller); **blind** (significant only under kiter); **vision** (significant only under controller).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 100.0% | 50 | 50/0/0 | 37 | self:heal+cleanse | zone:burn | jump:heal |
| 2 | 100.0% | 40 | 40/0/0 | 41 | zone:burn | blink:shield | jump:heal+boost/cooldown |
| 3 | 99.0% | 48 | 47/1/0 | 34 | blink:cleanse | self:heal+shield | bolt:damage |
| 4 | 95.2% | 42 | 40/0/2 | 42 | cone:damage | zone:heal+pull | self:heal+shield |
| 5 | 95.0% | 40 | 38/0/2 | 47 | zone:heal+knock | lob:stun | zone:damage+root |
| 6 | 94.0% | 50 | 47/0/3 | 51 | jump:heal+shield | bolt:pull+damage | lob:knock+boost/damage |
| 7 | 91.3% | 46 | 42/0/4 | 43 | zone:shield+heal | dash:pull+heal | bolt:burn |
| 8 | 91.3% | 46 | 42/0/4 | 40 | lob:pull+cleanse | jump:heal+cleanse | beam:damage |
| 9 | 91.3% | 46 | 42/0/4 | 47 | beam:burn+wall | lob:heal | self:heal+boost/damage |
| 10 | 90.5% | 42 | 38/0/4 | 41 | jump:heal | zone:wall+burn | bolt:damage |

Top 10% (24 kits) use 9 of 9 deliveries and 14 of 14 effects; most common delivery zone (25.0% of their ability slots), most common effect heal (20.4% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-panel-v2.json`
