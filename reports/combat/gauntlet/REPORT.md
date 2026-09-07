# Counter-panel re-pick for the three-second world (07.09)

Search: `reports/combat/gauntlet/pick.mjs` (pool = the panel's top kits from
`atombalance-panel-v5` plus hand-made archetypes; product field, blue vs orange
kit-stub pilots, 8 seeds mirrored; the chosen five verified at 20 seeds).
Raw results: `result.json`, `pairs.json`, `pick.log`.

Chosen five (installed in `src/skills/gauntlet.js`): mender · vaulter · leech ·
jailer · skirmisher.

Round-robin at 20 seeds (row beats column):

| | mender | vaulter | leech | jailer | skirmisher | worst |
|---|---|---|---|---|---|---|
| mender | · | 75% | 25% | 83% | 28% | 25% |
| vaulter | 25% | · | 55% | 59% | 43% | 25% |
| leech | 75% | 45% | · | 63% | 43% | 43% |
| jailer | 18% | 41% | 38% | · | 53% | 18% |
| skirmisher | 73% | 57% | 57% | 48% | · | 48% |

Styles 5 of 5 · 3-cycles 4 · best "worst" 47.5% · floor 17.5%.
Starter presets on the viability grid (worst result): keeper 0%, breaker 0%,
saboteur 50% → none dominant under `BASELINE.bestMin = 0.55`.

Gate: `node tools/checkgauntlet.mjs` — green (07.09).


---

## Full record of the search and verification (appended 07.09)

The section above was written when the five was installed; this section records the search that produced it and an independent re-measure + gate run. Nothing above was changed.

### Command lines

```
node reports/combat/gauntlet/pick.mjs --seeds=8 --verify=20 --top=16 --finalists=12   # search → pick.log, pairs.json, result.json
node tools/gauntletfield.mjs --rounds=20                                              # re-measure both fields → verify.log
node tools/checkgauntlet.mjs                                                          # the gate → verify.log
```

Pool usage: one league at a time, chunks of ≤ 1 000 matches. Search: 13 072 matches for the full 8-seed mirrored matrix (817 pairs incl. the three preset probes) + 1 920 to extend the 12 finalists to 20 seeds. Re-measure: 2 × 1 000. Gate: 600 + 3 × 40 viability fights. Cache: 14992 (blue, orange, seed) results, 0 errors. Seeds are the shared ladder 900 + s·7919, so the cache reproduces the gate (s < 12) and the baseline (s < 20) exactly, and the viability grid (8 fights, candidate on blue for even s) is read from the same cache.

### Criteria a five had to meet (at 8, 12 and 20 seeds)

- ≥ 4 styles by isDiverse (src/skills/gauntlet.js) — found 5 of 5 at every resolution
- ≥ 1 three-cycle (cyclesOf in tools/gauntletfield.mjs) — found 4
- no member with a worst result under 15 % — floor 17.5 % @20, 16.7 % @12, 18.8 % @8
- spread of worsts ≥ 20 pp (the gate's "field distinguishes") — 29–30 pp
- field ceiling (best member's worst) ≤ 80 % so a BASELINE exists strictly above it and under 87.5 % — 47.5 %
- every starter preset's worst on the viability grid ≤ 75 % (the next grid step, 87.5 %, can never sit under a reachable BASELINE) — 0 / 0 / 50 %
- every member legal (validateKit), compiling, with ≥ 1 damage/burn source; two sources preferred — 3 of the 5 carry two

Soft score: decisive cells, more cycles, five styles, a higher floor, more headroom under 87.5 %, two damage sources, different delivery shapes. Finalists were capped at two per family (four shared members).

### Candidate pool (38 kits + 3 preset probes), by mean win rate on the pool at 8 seeds

| # | id | source | dmg sources | mean | worst | best | kit |
|---:|---|---|---:|---:|---:|---:|---|
| 1 | warden | hand — sustain warden: shield+heal aura, damage beam, damage+heal bolt | 2 | 89.9% | 37.5% | 100.0% | self:shield+heal · beam:damage · bolt:damage+heal |
| 2 | silencer | hand — controller: silence+damage beam, stunning bolt with damage, heal aura | 2 | 88.1% | 6.3% | 100.0% | beam:silence+damage · bolt:stun+damage · self:heal |
| 3 | p224 | panel #224 96% | 1 | 85.3% | 18.8% | 100.0% | jump:wall+cleanse+heal · beam:silence · zone:damage+burn |
| 4 | stormcaller | hand — mortar/field zoner: damage+burn field, stunning mortar, healing blink | 2 | 78.8% | 12.5% | 100.0% | zone:damage+burn · lob:damage+stun · blink:heal |
| 5 | p10 | panel #10 91% | 2 | 77.0% | 0.0% | 100.0% | beam:burn+damage · zone:silence+stun+burn · self:boost/damage |
| 6 | p109 | panel #109 86% | 1 | 76.2% | 0.0% | 100.0% | bolt:silence+heal+stun · beam:damage+shield · lob:heal+shield |
| 7 | sniper | hand — beam kiter: damage bolt, damage+slowing beam, shield+cleanse aura | 2 | 75.1% | 0.0% | 100.0% | bolt:damage · beam:damage+weaken/speed · self:shield+cleanse |
| 8 | zoner | hand — mortar/field zoner: damage field, damage+knock mortar, burn+wall field | 3 | 74.0% | 15.6% | 100.0% | zone:damage · lob:damage+knock · zone:burn+wall |
| 9 | p122 | panel #122 93% | 2 | 71.5% | 0.0% | 100.0% | blink:cleanse+wall · bolt:damage+silence · zone:heal+damage |
| 10 | medic | hand — sustain warden: heal+shield blink, damage field, damage bolt | 2 | 69.8% | 0.0% | 100.0% | blink:heal+shield · zone:damage · bolt:damage |
| 11 | bombardier | hand — mortar/field zoner: damage mortar, damage+burn field, burn+pull mortar | 3 | 69.5% | 6.3% | 100.0% | lob:damage · zone:damage+burn · lob:burn+pull |
| 12 | p124 | panel #124 93% | 2 | 68.8% | 6.3% | 100.0% | lob:knock+damage · jump:boost/damage · zone:burn+wall |
| 13 | lancer | hand — beam kiter: beam and bolt damage, blink with a shield | 2 | 66.2% | 0.0% | 100.0% | beam:damage · bolt:damage · blink:shield |
| 14 | searer | hand — beam kiter: damage+burn beam, silencing bolt, cleansing blink | 1 | 63.0% | 0.0% | 100.0% | beam:damage+burn · bolt:silence · blink:cleanse |
| 15 | p79 | panel #79 81% | 2 | 60.8% | 0.0% | 100.0% | beam:knock · zone:burn+stun · lob:damage+wall+knock |
| 16 | duelist | hand — fan/lunge brawler: damage fan, damage bolt to close with, shield+heal blink | 2 | 59.5% | 0.0% | 100.0% | cone:damage · bolt:damage · blink:shield+heal |
| 17 | vaulter → **skirmisher** | hand — leaper: shield leap, damage fan, damage bolt | 2 | 57.6% | 0.0% | 100.0% | jump:shield · cone:damage · bolt:damage |
| 18 | p3 → **mender** | panel #3 98% | 2 | 56.0% | 0.0% | 100.0% | blink:heal+shield · zone:damage · lob:burn+pull+cleanse |
| 19 | p111 → **leech** | panel #111 90% | 1 | 54.7% | 0.0% | 100.0% | blink:cleanse+heal · bolt:heal+damage · bolt:cleanse+weaken/turn |
| 20 | mauler | hand — fan/lunge brawler: rooting fan, burning lunge, shield+heal aura | 2 | 53.0% | 0.0% | 100.0% | cone:damage+root · dash:damage+burn · self:shield+heal |
| 21 | p65 → **vaulter** | panel #65 96% | 1 | 49.5% | 0.0% | 100.0% | blink:heal · jump:heal+shield+wall · dash:burn+damage |
| 22 | p175 → **jailer** | panel #175 85% | 2 | 44.6% | 0.0% | 100.0% | lob:weaken+damage/vision · dash:cleanse+wall+knock · beam:stun+silence+burn |
| 23 | jailer | hand — controller: silence+damage fan, damage+blind bolt, root+damage lunge | 3 | 38.2% | 0.0% | 100.0% | cone:silence+damage · bolt:damage+blind · dash:root+damage |
| 24 | brawler | hand — fan/lunge brawler: damage+burn fan, damage lunge, shield aura | 2 | 36.2% | 0.0% | 100.0% | cone:damage+burn · dash:damage · self:shield |
| 25 | p97 | panel #97 85% | 2 | 36.1% | 0.0% | 100.0% | zone:pull+damage · dash:damage+cleanse · zone:heal |
| 26 | p30 | panel #30 81% | 1 | 36.0% | 0.0% | 100.0% | zone:silence+burn · cone:cleanse · jump:heal+cleanse |
| 27 | arsonist | hand — burn specialist: burn beam, damage+burn lunge, burn+knock field | 3 | 35.0% | 0.0% | 100.0% | beam:burn · dash:damage+burn · zone:burn+knock |
| 28 | p171 | panel #171 82% | 1 | 33.1% | 0.0% | 100.0% | bolt:damage+blind · blink:shield · zone:pull |
| 29 | pyro | hand — burn specialist: burn beam, burn+knock field, burn+pull mortar | 3 | 32.2% | 0.0% | 100.0% | beam:burn · zone:burn+knock · lob:burn+pull |
| 30 | old-lobber | old five (30.08) | 1 | 31.1% | 0.0% | 100.0% | lob:blind+wall · lob:wall · lob:damage |
| 31 | p38 | panel #38 83% | 2 | 30.7% | 0.0% | 100.0% | cone:silence+damage · dash:root+heal · bolt:damage |
| 32 | old-conjurer | old five (30.08) | 1 | 23.1% | 0.0% | 100.0% | zone:boost/range · blink:boost/vision · zone:heal+damage |
| 33 | old-striker | old five (30.08) | 1 | 22.4% | 0.0% | 100.0% | beam:cleanse+silence · blink:shield · lob:damage |
| 34 | p82 | panel #82 85% | 1 | 19.1% | 0.0% | 100.0% | zone:burn+knock · blink:heal · beam:boost/turn |
| 35 | controller | hand — controller: stun bolt, silence beam, one damage field | 1 | 14.5% | 0.0% | 100.0% | bolt:stun · beam:silence · zone:damage |
| 36 | old-warden | old five (30.08) | 1 | 13.1% | 0.0% | 100.0% | beam:heal+wall · blink:wall · bolt:cleanse+pull+damage |
| 37 | p231 | panel #231 82% | 1 | 10.5% | 0.0% | 100.0% | lob:blind · blink:cleanse+heal · zone:damage+blind |
| 38 | old-runner | old five (30.08) | 1 | 0.0% | 0.0% | 0.0% | dash:burn+weaken/range · zone:boost/cooldown · dash:boost/range |

Probes (never candidates): keeper = bolt:damage · blink:cleanse · self:heal; breaker = cone:damage+root · dash:damage · self:shield; saboteur = bolt:damage · lob:damage+blind · bolt:silence.

### Enumeration

501,942 fives scored offline at 8 seeds; 109 met every hard criterion. Why the rest failed (a five may fail several): fewer than 4 styles 320,655, no cycle 394,721, a punching bag under 15 % 501,710, spread under 20 pp 3,366, ceiling over 80 % 155,530, a preset over 75 % 15,840. The punching-bag criterion is the binding one: almost every kit in the pool has a 0 % cell against someone, so a five without one is rare (109 of ~500 000).

### Finalists (12) and their verification

| # | five | @8 cyc/sty/floor/best | @12 cyc/sty/floor/best | @20 cyc/sty/floor/best | presets' worst @8 | holds |
|---:|---|---|---|---|---:|---|
| 1 | p3, p65, p111, p175, vaulter | 4 / 5 / 18.8% / 43.8% | 4 / 5 / 16.7% / 45.8% | 4 / 5 / 17.5% / 47.5% | 50.0% | **yes** |
| 2 | p124, sniper, mauler, bombardier, medic | 4 / 5 / 18.8% / 43.8% | 4 / 5 / 12.5% / 33.3% | 5 / 5 / 10.0% / 40.0% | 12.5% | no |
| 3 | p124, p97, mauler, bombardier, zoner | 3 / 5 / 18.8% / 43.8% | 4 / 3 / 12.5% / 29.2% | 4 / 3 / 10.0% / 40.0% | 12.5% | no |
| 4 | p65, p111, lancer, mauler, bombardier | 4 / 5 / 18.8% / 43.8% | 4 / 3 / 20.8% / 37.5% | 4 / 3 / 20.0% / 37.5% | 12.5% | no |
| 5 | p97, p38, p171, p30, pyro | 4 / 5 / 18.8% / 43.8% | 4 / 5 / 12.5% / 41.7% | 4 / 3 / 10.0% / 45.0% | 75.0% | no |
| 6 | p97, p171, pyro, arsonist, old-conjurer | 4 / 5 / 18.8% / 43.8% | 4 / 5 / 12.5% / 35.4% | 3 / 5 / 10.0% / 37.5% | 75.0% | no |
| 7 | p122, p10, p79, sniper, medic | 3 / 5 / 18.8% / 43.8% | 3 / 5 / 16.7% / 45.8% | 3 / 5 / 13.8% / 42.5% | 25.0% | no |
| 8 | p10, p109, p79, sniper, medic | 3 / 5 / 18.8% / 43.8% | 4 / 5 / 16.7% / 45.8% | 2 / 5 / 13.8% / 40.0% | 25.0% | no |
| 9 | p65, p124, lancer, mauler, bombardier | 4 / 5 / 18.8% / 43.8% | 3 / 5 / 12.5% / 37.5% | 3 / 5 / 10.0% / 40.0% | 12.5% | no |
| 10 | p3, p65, p111, lancer, vaulter | 3 / 5 / 18.8% / 43.8% | 3 / 5 / 16.7% / 37.5% | 3 / 5 / 20.0% / 32.5% | 62.5% | no |
| 11 | p97, p82, p171, pyro, arsonist | 4 / 5 / 18.8% / 43.8% | 3 / 5 / 12.5% / 35.4% | 2 / 4 / 10.0% / 37.5% | 75.0% | no |
| 12 | p124, p122, lancer, searer, bombardier | 3 / 5 / 18.8% / 43.8% | 2 / 4 / 29.2% / 37.5% | 2 / 4 / 25.0% / 42.5% | 12.5% | no |

Exactly one finalist held at all three resolutions. The others lost a member under 15 % or a style when re-played at 12 or 20 seeds: the 8-seed grid (6.25 pp) is too coarse to trust on its own, which is why the 12 (gate) and 20 (baseline) resolutions were played before choosing.

### The chosen five, installed as GAUNTLET (order chosen among the 120 permutations: 5/5 styles at 8, 12 and 20 seeds)

| installed id | pool id | source | kit |
|---|---|---|---|
| **mender** | p3 | panel #3 98% | blink:heal+shield · zone:damage · lob:burn+pull+cleanse |
| **vaulter** | p65 | panel #65 96% | blink:heal · jump:heal+shield+wall · dash:burn+damage |
| **leech** | p111 | panel #111 90% | blink:cleanse+heal · bolt:heal+damage · bolt:cleanse+weaken/turn |
| **jailer** | p175 | panel #175 85% | lob:weaken+damage/vision · dash:cleanse+wall+knock · beam:stun+silence+burn |
| **skirmisher** | vaulter | hand | jump:shield · cone:damage · bolt:damage |

8 seeds × 2 sides (search resolution) (row beats column):

| | mender | vaulter | leech | jailer | skirmisher | worst |
|---|---:|---:|---:|---:|---:|---:|
| mender | · | 81% | 25% | 75% | 25% | 25% |
| vaulter | 19% | · | 56% | 56% | 38% | 19% |
| leech | 75% | 44% | · | 63% | 31% | 31% |
| jailer | 25% | 44% | 38% | · | 56% | 25% |
| skirmisher | 75% | 63% | 69% | 44% | · | 44% |

best worst 43.8% · floor 18.8% · spread 25 pp · styles 5/5 · cycles 4: mender→vaulter→leech, mender→jailer→skirmisher, vaulter→jailer→skirmisher, leech→jailer→skirmisher

12 seeds × 2 sides (gate resolution) (row beats column):

| | mender | vaulter | leech | jailer | skirmisher | worst |
|---|---:|---:|---:|---:|---:|---:|
| mender | · | 79% | 21% | 83% | 33% | 21% |
| vaulter | 21% | · | 58% | 56% | 38% | 21% |
| leech | 79% | 42% | · | 63% | 33% | 33% |
| jailer | 17% | 44% | 38% | · | 54% | 17% |
| skirmisher | 67% | 63% | 67% | 46% | · | 46% |

best worst 45.8% · floor 16.7% · spread 29 pp · styles 5/5 · cycles 4: mender→vaulter→leech, mender→jailer→skirmisher, vaulter→jailer→skirmisher, leech→jailer→skirmisher

20 seeds × 2 sides (baseline resolution) (row beats column):

| | mender | vaulter | leech | jailer | skirmisher | worst |
|---|---:|---:|---:|---:|---:|---:|
| mender | · | 75% | 25% | 83% | 28% | 25% |
| vaulter | 25% | · | 55% | 59% | 43% | 25% |
| leech | 75% | 45% | · | 63% | 43% | 43% |
| jailer | 18% | 41% | 38% | · | 53% | 18% |
| skirmisher | 73% | 57% | 57% | 48% | · | 48% |

best worst 47.5% · floor 17.5% · spread 30 pp · styles 5/5 · cycles 4: mender→vaulter→leech, mender→jailer→skirmisher, vaulter→jailer→skirmisher, leech→jailer→skirmisher

### Starter presets against the five, as viability() plays it (8 fights per opponent, alternating sides)

| preset | mender | vaulter | leech | jailer | skirmisher | worst | best | verdict at BASELINE.bestMin = 0.55 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| keeper | 50.0% | 50.0% | 25.0% | 62.5% | 0.0% | 0.0% | 62.5% | situational |
| breaker | 12.5% | 0.0% | 0.0% | 12.5% | 0.0% | 0.0% | 12.5% | weak |
| saboteur | 100.0% | 87.5% | 75.0% | 50.0% | 100.0% | 50.0% | 100.0% | situational |

The gate's own viability() run (isolate path, instrumented brains) reproduced these exactly: keeper situational 0.0 %, breaker weak 0.0 %, saboteur situational 50.0 %.

### BASELINE

The gate wants bestMin strictly above the field's best worst at 12 seeds (45.8 %), under 87.5 % (reachable on the 1/8 viability grid without a clean sweep), not under any preset's worst (50 %), with no member more than 12 pp above it, and a gap under 55 pp. 0.55 = the next 5-pp step above the 20-seed ceiling (47.5 %) with a sampling margin, not under saboteur's 50 %. On the 1/8 grid every value in [0.5, 0.625) is the same verdict — dominant needs 62.5 % against each of the five. medianMin 0.25 = the median of the five worsts at 20 seeds (25.0 %). Down from 0.85 / 0.13 (30.08): the gap the 30.08 note called a red flag has closed because the presets were probes in the search.

### Re-measure and gate, verbatim (verify.log)

```
=== node tools/gauntletfield.mjs --rounds=20 ===
  прогон убит сигналом SIGSEGV (баг worker_threads, не логика замера) — попытка 1 из 4
  повтор на 4 воркер(ах) — медленнее, зато без падения
  УПЛОЩЁННОЕ: симметричные тела, один пилот, кулдаун 8 (20 сидов ×2 стороны)
               mender vaulter   leech  jailer skirmis     худшее
  mender          ·       88%     40%     73%     10%      10%
  vaulter         13%     ·       30%     45%     40%      13%
  leech           60%     70%     ·       57%     50%      50%
  jailer          28%     55%     43%     ·       48%      28%
  skirmisher      90%     60%     50%     53%     ·        50%
  лучший «худший» = 50.0%   стилей 3 из 5  ← ОДНОРОДЕН
  циклов из трёх: 0  — ПОЛЕ ТРАНЗИТИВНО (лестница)
  ПРОДУКТОВОЕ: синяя сторона против оранжевой, свои мозги, кулдаун из цены (20 сидов ×2 стороны)
               mender vaulter   leech  jailer skirmis     худшее
  mender          ·       75%     25%     83%     28%      25%
  vaulter         25%     ·       55%     59%     43%      25%
  leech           75%     45%     ·       63%     43%      43%
  jailer          18%     41%     38%     ·       53%      18%
  skirmisher      73%     57%     57%     48%     ·        48%
  лучший «худший» = 47.5%   стилей 5 из 5
  циклов из трёх: 4  mender→vaulter→leech, mender→jailer→skirmisher, vaulter→jailer→skirmisher, leech→jailer→skirmisher
  разница порогов: -2.5 п.п. — столько стоит подмена прибора
=== field exit 0 ===
=== node tools/checkgauntlet.mjs ===
  ГЕЙТ ГАНТЛЕТА
  ✓ все пятеро законны  5 наборов
  ✓ гантлет разнороден: члены бьют разных  5 различных стилей из 5
  ✓ отсчёт выше поля  в поле 46%, отсчёт 55%
  ✓ и не оторван от поля  разрыв 9 п.п. — выше 35 отсчёт перестаёт быть достижимым
  ✓ стартовый набор «keeper» не объявлен дырой  situational, худший 0.0%
  ✓ стартовый набор «breaker» не объявлен дырой  weak, худший 0.0%
  ✓ стартовый набор «saboteur» не объявлен дырой  situational, худший 50.0%
  ✓ вердикт «доминирует» достижим на сетке viability  8 боёв на соперника → шаг 12.5 п.п., порог 55% → брать надо 63%, максимум без чистого прохода 88%
  ✓ никто из пятерых не отрывается от отсчёта  сильнейший держит 46% при отсчёте 55%
  ✓ поле различает: разброс «худших» достаточен  от 17% до 46%, разброс 29 п.п. при пороге 20
  ✓ поле нетранзитивно: есть цикл  mender→vaulter→leech, mender→jailer→skirmisher, vaulter→jailer→skirmisher, leech→jailer→skirmisher
  ✓ однородное поле ловится  все бьют одних и тех же → стилей 1
  ✓ идеальная лестница ловится  каждый бьёт всех ниже себя → стилей 3
  ✓ разнородное поле не ловится зря  камень-ножницы-бумага на пятерых → стилей 5
  ✓ уехавший отсчёт ловится  та же функция, что и выше, на подменённом числе
  ✓ точный отсчёт не ловится зря
  ✓ недостижимый порог ловится  порог 99% на этой сетке требует чистого прохода
  ✓ достижимый порог не ловится зря  порог 75% берётся 88%
  ✓ вердикт «доминирует» выпадает на векторе выше отсчёта
  ✓ и не выпадает на векторе ниже отсчёта
  ДЕРЖИТ
=== gate exit 0 ===
```

### Notes

- The first gauntletfield attempt died of the known worker_threads SIGSEGV; the supervisor (superviseSelf) re-ran it on 4 workers. Results are deterministic per (kit, kit, seed), so the retry changes nothing.
- The flattened field (one pilot, cooldown 8) reads this five as a ladder (3 styles, 0 cycles). Expected and irrelevant: the instrument is applied on the PRODUCT field (viability.js), and the five was picked there. The old five had the opposite problem.
- breaker now reads **weak** on the product path (best 12.5 % against the five). Not a gate criterion, but a product observation: the viability check will tell a player on the breaker starter set that it "loses to all five". keeper reads situational (0–62.5 %), saboteur situational (50–100 %).
- All five kits are kinetic, as in the panel league they came from. An element costs 0 and changes no number; the gauntlet is never rendered.
- Three of the five carry two damage sources (mender, jailer, skirmisher); vaulter and leech carry one (a burning lunge; a healing bolt). No five with five two-source members passed the hard criteria.
- The five and BASELINE were installed into src/skills/gauntlet.js at 09:07 by a concurrent session from this search's output (ids mender / vaulter / leech / jailer / skirmisher for pool ids p3 / p65 / p111 / p175 / vaulter); the verification above was run afterwards against that installed file and is green.
