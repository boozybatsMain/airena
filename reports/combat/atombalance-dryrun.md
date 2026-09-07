# atombalance — seed 7

Regression of kit win rate on grammar pieces. 80 random legal kits, 800 matches (10 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: 3 s fixed for every ability. Ridge λ=1, 200 bootstrap resamples. Runtime 31 s (league 30 s on 8 workers).

Command: `node tools/atombalance.mjs --n=80 --games=10 --pilots=stub,rusher,kiter,controller --cooldown=3 --seed=7 --out=/Users/boozybats/Public/Repos/work/Airena/reports/combat/atombalance-dryrun.md`

## Instrument health

| | |
|---|---|
| matches scored | 800 of 800 (0 errors) |
| draws | 14 (1.8%) |
| side balance (blue : orange wins) | 395 : 391 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 38.0 s |
| endings | kill 786, double-ko 14 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 12 of 1600 |
| mean uses / hits per side per match | 26.5 / 5.4 |
| pilots actually used (sides) | controller 404, kiter 488, rusher 336, stub 372 |
| coverage | every effect and delivery in ≥ 4 kits (6 kits coverage-forced) |
| features | 109 (+ intercept): 9 deliveries, 14 effects, 7 channels, n2, n3, cost, 76 delivery×effect pairs seen in ≥ 2 kits |
| fit | R² 0.919 in-sample, **-0.069 cross-validated** (10-fold; 80 rows vs 109 features — MORE FEATURES THAN ROWS, raise --n); cost alone: slope +0.88 pp per point, R² 0.044 |
| score spread across kits | mean 0.504, sd 0.265 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Delivery counts always sum to 3 and total cost is an exact sum of the other features, so the design is rank-deficient by construction; ridge resolves it by the minimum-norm solution and delivery values are therefore relative to each other. `proposed` = round(clamp(k·value, 1, 10)) with one k (189.795 points per pp) chosen so the proposed costs sum to the current sum (128; achieved 128).

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | proposed | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|---:|---:|---|
| effect | damage | 42 | 7 | +12.13 | 3.23 | ● | 10 | +1.73 |  |
| effect | heal | 34 | 6 | +11.13 | 2.75 | ● | 10 | +1.85 |  |
| delivery | self | 15 | 3 | +8.77 | 3.13 | ● | 10 | +2.92 | significant only under kiter |
| delivery | zone | 25 | 5 | +7.22 | 3.12 | ● | 10 | +1.44 | significant only under kiter |
| delivery | blink | 22 | 5 | +6.86 | 3.64 |  | 10 | +1.37 | significant only under rusher |
| effect | burn | 47 | 7 | +6.79 | 3.36 | ● | 10 | +0.97 |  |
| effect | shield | 22 | 4 | +5.07 | 2.31 | ● | 10 | +1.27 | significant only under stub |
| channel | range | 6 | 2 | +5.01 | 3.50 |  | 10 | +2.50 | significant only under stub |
| delivery | beam | 22 | 5 | +4.62 | 2.68 |  | 9 | +0.92 | significant only under kiter |
| effect | knock | 8 | 5 | +4.24 | 3.58 |  | 8 | +0.85 |  |
| channel | cooldown | 7 | 3 | +3.21 | 4.19 |  | 6 | +1.07 | significant only under controller |
| channel | speed | 4 | 2 | +2.47 | 3.98 |  | 5 | +1.24 |  |
| delivery | jump | 21 | 5 | +1.38 | 2.55 |  | 3 | +0.28 | significant only under controller |
| effect | silence | 11 | 6 | -0.18 | 3.88 |  | 1 | -0.03 |  |
| effect | cleanse | 35 | 3 | -0.62 | 2.93 |  | 1 | -0.21 |  |
| effect | pull | 11 | 3 | -1.95 | 4.30 |  | 1 | -0.65 | significant only under stub |
| effect | stun | 17 | 6 | -2.72 | 2.96 |  | 1 | -0.45 |  |
| effect | blind | 11 | 5 | -2.88 | 2.90 |  | 1 | -0.58 |  |
| channel | vision | 4 | 4 | -3.46 | 3.29 |  | 1 | -0.86 | sign flips across pilots (stub -14.4, controller +12.8) |
| channel | turn | 7 | 2 | -5.00 | 5.07 |  | 1 | -2.50 |  |
| effect | wall | 34 | 5 | -5.13 | 3.10 |  | 1 | -1.03 |  |
| delivery | cone | 28 | 4 | -5.24 | 2.54 | ● | 1 | -1.31 |  |
| delivery | bolt | 27 | 4 | -6.32 | 2.87 | ● | 1 | -1.58 | significant only under kiter |
| channel | damage | 3 | 3 | -6.72 | 3.57 |  | 1 | -2.24 |  |
| delivery | lob | 27 | 4 | -8.49 | 2.83 | ● | 1 | -2.12 | significant only under kiter |
| effect | root | 10 | 5 | -8.53 | 3.97 | ● | 1 | -1.71 | sign flips across pilots (stub -19.8, rusher -21.5, kiter +8.7) |
| delivery | dash | 26 | 4 | -8.79 | 3.30 | ● | 1 | -2.20 | significant only under kiter |
| effect | boost | 22 | 4 | -10.26 | 3.06 | ● | 1 | -2.57 | significant only under rusher |
| effect | weaken | 14 | 4 | -10.51 | 3.84 | ● | 1 | -2.63 | significant only under stub |
| channel | armor | 5 | 3 | -11.16 | 4.82 | ● | 1 | -3.72 | significant only under rusher |

## Combination features

- `n2`: -3.82 pp per unit ± 2.77
- `n3`: +0.20 pp per unit ± 1.38
- `cost`: +1.60 pp per unit ± 0.41 (significant)
- intercept: -16.0 ± 14.3 pp

## Delivery × effect interactions (15 significant of 76)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| bolt×root | 2 | -14.60 | 5.30 |
| zone×burn | 8 | +13.57 | 3.29 |
| cone×pull | 3 | +13.16 | 3.69 |
| bolt×damage | 6 | +11.73 | 5.07 |
| cone×cleanse | 4 | -11.45 | 3.00 |
| dash×wall | 3 | +11.31 | 5.00 |
| lob×boost | 2 | -10.73 | 3.06 |
| self×heal | 6 | +10.09 | 3.19 |
| lob×blind | 3 | +9.39 | 3.55 |
| dash×blind | 2 | -8.29 | 3.03 |
| cone×burn | 8 | -7.22 | 3.21 |
| cone×root | 2 | -7.05 | 2.85 |
| lob×shield | 2 | +6.91 | 3.15 |
| dash×heal | 4 | -5.31 | 2.49 |
| beam×shield | 2 | +4.70 | 2.24 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 63 | 0.227 |
| stub | kiter | 73 | 0.528 |
| stub | controller | 66 | 0.429 |
| rusher | kiter | 67 | 0.256 |
| rusher | controller | 62 | 0.284 |
| kiter | controller | 70 | 0.495 |

- stub: 74 kits, R² 0.924
- rusher: 69 kits, R² 0.912
- kiter: 78 kits, R² 0.916
- controller: 72 kits, R² 0.933

Pilot-dependent pieces: **self** (significant only under kiter); **zone** (significant only under kiter); **blink** (significant only under rusher); **shield** (significant only under stub); **range** (significant only under stub); **beam** (significant only under kiter); **cooldown** (significant only under controller); **jump** (significant only under controller); **pull** (significant only under stub); **vision** (sign flips across pilots (stub -14.4, controller +12.8)); **bolt** (significant only under kiter); **lob** (significant only under kiter); **root** (sign flips across pilots (stub -19.8, rusher -21.5, kiter +8.7)); **dash** (significant only under kiter); **boost** (significant only under rusher); **weaken** (significant only under stub); **armor** (significant only under rusher).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 100.0% | 18 | 18/0/0 | 44 | zone:damage | blink:cleanse+heal | lob:blind+wall |
| 2 | 100.0% | 18 | 18/0/0 | 32 | beam:damage | self:cleanse | self:heal+cleanse |
| 3 | 100.0% | 16 | 16/0/0 | 33 | self:shield+cleanse | zone:damage | self:heal |
| 4 | 95.8% | 24 | 23/0/1 | 48 | self:heal | beam:boost+burn/damage | jump:heal+wall |
| 5 | 95.0% | 20 | 19/0/1 | 47 | blink:boost+shield/speed | jump:heal+wall | beam:burn |
| 6 | 93.8% | 16 | 15/0/1 | 39 | cone:damage | blink:boost+cleanse/cooldown | blink:heal |
| 7 | 90.9% | 22 | 20/0/2 | 50 | cone:blind+knock | zone:heal+damage | self:wall+shield |
| 8 | 90.9% | 22 | 20/0/2 | 45 | blink:wall+heal | zone:damage | blink:cleanse+wall |
| 9 | 83.3% | 12 | 10/0/2 | 48 | dash:weaken+wall/range | zone:burn | bolt:stun+damage |
| 10 | 83.3% | 12 | 10/0/2 | 46 | dash:burn+wall | jump:boost+shield/turn | blink:heal |

Top 10% (8 kits) use 7 of 9 deliveries and 9 of 14 effects; most common delivery blink (25.0% of their ability slots), most common effect heal (23.7% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-dryrun.json`
