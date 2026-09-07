# atombalance — seed 54

## **NOT CONVERGED**

Largest price move proposed: **5 points** (settled means ≤ 1). Pieces significantly negative: **2** (settled means 0).

Still moving: cooldown 8→10, blink 5→7, damage 1→6, shield 9→5, armor 2→4, beam 5→1, bolt 3→1, self 4→1.

Traps — a point spent here loses fights, and the floor price of 1 cannot fix that: **knock** (-2.5 ± 1.0 at cost 2), **weaken** (-3.5 ± 1.5 at cost 2). These go back to the magnitudes, not to the price table.

**Value per point — -0.25 ± 1.11 pp/pt across the 14 effects (range -1.75 … +2.04).** Across all 30 pieces: -0.23 ± 1.34. This is the founder's flatness quantity: a point of budget should buy the same win rate wherever it is spent, so the number to drive down is the **sd**.

Secondary — corr(cost, value) = 0.766 over all pieces, 0.804 over effects. That is the price ORDER, not the price RATE; it can sit at 0.95 while a point on one piece buys three times what it buys on another.

Regression of kit win rate on grammar pieces. 480 random legal kits, 11520 matches (24 per kit as the home side, mirrored pairings, same pilot on both sides), pilots: stub, rusher, kiter, controller. Cooldown: the registry's own — the schedule the game is played on. Ridge λ=1, 200 bootstrap resamples. Runtime 1306 s (league 1301 s on 2 workers).

Command: `node tools/atombalance.mjs --n=480 --games=24 --pilots=stub,rusher,kiter,controller --seed=54 --out=reports/combat/atombalance-panel-v9.md`

## Population health — the world these prices were measured in

A price found in fights the arena finished is a price for stalling, and a price found on kits whose slots never fired is a price for the slots that did. These rows say whether this pass measured fights or waits.

| | | contract (`docs/COMBAT.md` §3) |
|---|---|---|
| fight length, mean / median | 31.9 s / 34.5 s | median 20–35 s |
| reaching the burn clock (30 s) | 7786 of 11520 (67.6%) | ≤ 35% |
| decided by | arena 52% · hit 35% · fire 14% | arena ≤ 20% |
| dead slots (a paid ability that never fired) | 5379 of 69120 (7.8%) | ≤ 2% |
| dodges per fight | 0.41 | ≥ 1 |
| harmless kits redrawn | 0 | — |

Every sampled kit carries at least one damage or burn atom, asserted here and not merely inherited from the grammar's L2 rule: a kit of three durations cannot take a hit point off anybody, so its league game would be decided by who was ahead at the bell. 0 such draws were rejected and re-drawn rather than scored (0 is the expected number while L2 stands).

"Decided by" is what took the last hit point — an opponent (`hit`), an ability's burn (`fire`), or the arena's own burn (`arena`); the sim logs all three as `kill`, and they are separated by matching the loser's `death` line against a `burned` / `burnedOut` line on the same tick. A dodge is an i-frame `evade` or a ground shape passing under an airborne body. A dead slot is an ability that never fired once; a kit is three abilities and all three are paid.

## Instrument health

| | |
|---|---|
| matches scored | 11520 of 11520 (0 errors) |
| draws | 184 (1.6%) |
| side balance (blue : orange wins) | 5643 : 5693 — mirrored pairings, so a lopsided ratio is a side bias of the arena, not of a kit |
| mean match length | 31.9 s |
| match length quartiles | p25 26.7 s · p50 34.5 s · p75 37.9 s |
| fights outliving the burn clock (30 s) | 7786 of 11520 (67.6%) |
| endings | kill 11336, double-ko 184 |
| brain faults (must be 0) | 0 |
| sides with zero ability uses | 155 of 23040 |
| mean uses / hits per side per match | 23.4 / 3.8 |
| pilots actually used (sides) | controller 5688, kiter 5780, stub 5676, rusher 5896 |
| coverage | every effect and delivery in ≥ 24 kits (35 kits coverage-forced) |
| features | 130 (+ intercept): 8 deliveries (`dash` dropped as the baseline — the nine counts always sum to 3), 14 effects, 7 channels, n2, n3, 99 delivery×effect pairs seen in ≥ 2 kits. **No `cost` column** — it is an exact sum of the others (balance review H3) |
| fit | R² 0.816 in-sample, **0.685 cross-validated** (10-fold; 480 rows vs 130 features); cost alone: slope +1.09 pp per point, R² 0.210 |
| score spread across kits | mean 0.502, sd 0.218 |

Reading the numbers: `value` is the change in a kit's win rate, in percentage points, from carrying one more unit of the piece (one more ability with that delivery / effect / channel), everything else held. Effect and channel values are absolute. Delivery counts always sum to 3, so the delivery block is identified only up to a common level: `dash` is the baseline column and the nine delivery values are re-centred to mean zero, with standard errors bootstrapped through the re-centring. `target` = round(clamp(k·value, 1, 10)) with one k (1.958 points per pp) chosen so the costs sum to the current sum (106; achieved 93) — with --damp=1, `proposed` and `target` are the same number. A ● in `neg` marks a piece whose value is below −2·se: a trap, and no price in [1, 10] fixes it.

## Pieces — value and proposed cost

| axis | piece | kits | cost now | value (pp/unit) | ± se | sig | neg | target | proposed | Δ | value per point now | pilot note |
|---|---|---:|---:|---:|---:|:-:|:-:|---:|---:|---:|---:|---|
| effect | damage | 278 | 10 | +20.43 | 1.07 | ● |  | 10 | 10 | +0 | +2.04 |  |
| channel | cooldown | 31 | 8 | +7.90 | 2.73 | ● |  | 10 | 10 | +2 | +0.99 |  |
| effect | burn | 255 | 10 | +7.52 | 0.97 | ● |  | 10 | 10 | +0 | +0.75 |  |
| effect | heal | 183 | 8 | +4.39 | 0.84 | ● |  | 9 | 9 | +1 | +0.55 |  |
| delivery | jump | 91 | 8 | +3.67 | 2.49 |  |  | 7 | 7 | -1 | +0.46 |  |
| delivery | blink | 106 | 5 | +3.57 | 2.16 |  |  | 7 | 7 | +2 | +0.71 |  |
| channel | damage | 47 | 1 | +3.21 | 2.37 |  |  | 6 | 6 | +5 | +3.21 |  |
| effect | shield | 177 | 9 | +2.67 | 0.99 | ● |  | 5 | 5 | -4 | +0.30 | significant only under controller |
| channel | armor | 41 | 2 | +2.24 | 2.35 |  |  | 4 | 4 | +2 | +1.12 |  |
| effect | silence | 121 | 2 | +1.35 | 0.99 |  |  | 3 | 3 | +1 | +0.68 | sign flips across pilots (kiter -3.7, controller +3.5) |
| effect | cleanse | 178 | 3 | +1.26 | 0.93 |  |  | 2 | 2 | -1 | +0.42 |  |
| delivery | zone | 134 | 3 | +0.95 | 2.04 |  |  | 2 | 2 | -1 | +0.32 | significant only under rusher |
| delivery | beam | 155 | 5 | +0.54 | 1.71 |  |  | 1 | 1 | -4 | +0.11 |  |
| delivery | lob | 162 | 2 | +0.04 | 1.81 |  |  | 1 | 1 | -1 | +0.02 |  |
| channel | vision | 29 | 1 | -0.12 | 2.57 |  |  | 1 | 1 | +0 | -0.12 |  |
| effect | blind | 96 | 2 | -0.21 | 0.98 |  |  | 1 | 1 | -1 | -0.10 | significant only under kiter |
| effect | stun | 111 | 2 | -0.81 | 1.09 |  |  | 1 | 1 | -1 | -0.41 |  |
| channel | range | 54 | 1 | -0.96 | 2.24 |  |  | 1 | 1 | +0 | -0.96 |  |
| effect | pull | 108 | 2 | -1.28 | 1.20 |  |  | 1 | 1 | -1 | -0.64 |  |
| delivery | bolt | 150 | 3 | -1.53 | 1.94 |  |  | 1 | 1 | -2 | -0.51 |  |
| effect | wall | 190 | 1 | -1.75 | 1.01 |  |  | 1 | 1 | +0 | -1.75 | significant only under rusher |
| channel | speed | 44 | 1 | -1.88 | 2.44 |  |  | 1 | 1 | +0 | -1.88 |  |
| effect | root | 100 | 2 | -1.88 | 0.99 |  |  | 1 | 1 | -1 | -0.94 |  |
| delivery | dash *(baseline)* | 183 | 2 | -1.98 | 1.32 |  |  | 1 | 1 | -1 | -0.99 |  |
| delivery | self | 116 | 4 | -2.10 | 2.41 |  |  | 1 | 1 | -3 | -0.52 |  |
| effect | knock | 117 | 2 | -2.51 | 0.99 | ● | ● | 1 | 1 | -1 | -1.25 |  |
| effect | boost | 173 | 2 | -2.84 | 1.65 |  |  | 1 | 1 | -1 | -1.42 |  |
| delivery | cone | 180 | 2 | -3.14 | 1.75 |  |  | 1 | 1 | -1 | -1.57 |  |
| effect | weaken | 94 | 2 | -3.47 | 1.50 | ● | ● | 1 | 1 | -1 | -1.73 |  |
| channel | turn | 39 | 1 | -3.85 | 2.28 |  |  | 1 | 1 | +0 | -3.85 |  |

## Combination features

- `n2`: +4.19 pp per unit ± 0.70 (significant)
- `n3`: +9.33 pp per unit ± 0.92 (significant)
- kit cost, fitted alone (it is NOT a column of the main design): +1.09 pp per point, R² 0.210
- intercept: 15.6 ± 4.4 pp

## Delivery × effect interactions (23 significant of 99)

| pair | kits | coef (pp) | ± se |
|---|---:|---:|---:|
| lob×damage | 57 | +15.15 | 1.57 |
| beam×damage | 53 | +13.53 | 1.86 |
| dash×burn | 55 | -10.21 | 1.64 |
| dash×damage | 53 | -9.13 | 1.78 |
| dash×root | 26 | -8.73 | 2.37 |
| zone×burn | 35 | +8.64 | 2.08 |
| self×heal | 38 | +8.41 | 2.55 |
| bolt×damage | 48 | +8.19 | 2.03 |
| cone×burn | 47 | -8.08 | 1.98 |
| zone×root | 16 | +8.05 | 2.58 |
| bolt×cleanse | 18 | +8.04 | 2.67 |
| cone×boost | 22 | -7.92 | 3.17 |
| self×boost | 37 | +7.21 | 2.20 |
| beam×burn | 40 | +6.89 | 1.93 |
| zone×knock | 17 | +6.28 | 2.95 |
| lob×burn | 50 | +6.18 | 2.01 |
| dash×heal | 17 | -5.78 | 2.55 |
| blink×shield | 38 | +5.70 | 2.12 |
| blink×heal | 30 | +5.67 | 2.42 |
| self×shield | 42 | +5.25 | 2.24 |
| lob×pull | 18 | -5.05 | 2.49 |
| cone×wall | 16 | +4.84 | 2.09 |
| zone×weaken | 14 | -4.77 | 2.37 |

## Pilot agreement

| pilot A | pilot B | kits in common | r (per-kit score) |
|---|---|---:|---:|
| stub | rusher | 476 | 0.231 |
| stub | kiter | 477 | 0.393 |
| stub | controller | 476 | 0.558 |
| rusher | kiter | 479 | 0.055 |
| rusher | controller | 478 | 0.340 |
| kiter | controller | 479 | 0.471 |

- stub: 477 kits, R² 0.683
- rusher: 479 kits, R² 0.661
- kiter: 480 kits, R² 0.688
- controller: 479 kits, R² 0.677

Pilot-dependent pieces: **shield** (significant only under controller); **silence** (sign flips across pilots (kiter -3.7, controller +3.5)); **zone** (significant only under rusher); **blind** (significant only under kiter); **wall** (significant only under rusher).

## Nash-style summary

| # | score | games | W/D/L | cost | kit |
|---:|---:|---:|---|---:|---|
| 1 | 97.2% | 36 | 35/0/1 | 47 | beam:damage | blink:shield | jump:boost/cooldown |
| 2 | 95.7% | 46 | 44/0/2 | 50 | blink:wall+cleanse | zone:knock+burn+blind | zone:blind+damage |
| 3 | 93.2% | 44 | 41/0/3 | 52 | zone:burn+heal | zone:damage | lob:blind+damage |
| 4 | 92.9% | 56 | 52/0/4 | 57 | self:shield+wall+cleanse | lob:damage+burn | beam:knock+stun |
| 5 | 92.6% | 54 | 50/0/4 | 57 | bolt:silence+damage | self:heal+boost+wall/cooldown | dash:burn |
| 6 | 91.2% | 34 | 31/0/3 | 60 | self:boost+heal/cooldown | zone:damage | blink:cleanse+shield+wall |
| 7 | 90.0% | 40 | 36/0/4 | 46 | self:wall+cleanse+boost/armor | dash:cleanse+damage | lob:damage |
| 8 | 89.5% | 38 | 34/0/4 | 51 | jump:cleanse | beam:damage+shield | dash:heal+stun |
| 9 | 89.3% | 56 | 50/0/6 | 59 | beam:damage+stun | bolt:shield | bolt:wall+damage+shield |
| 10 | 89.1% | 46 | 39/4/3 | 49 | lob:burn | lob:damage+blind | dash:root+damage+blind |

Top 10% (48 kits) use 9 of 9 deliveries and 14 of 14 effects; most common delivery zone (17.4% of their ability slots), most common effect damage (21.2% of their effect slots). Monoculture flag: **no** (raised when the decile uses under half the deliveries or effects, or one piece holds over half the slots).

JSON with every row: `reports/combat/atombalance-panel-v9.json`
