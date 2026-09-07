# Balancing composable-ability systems with automated play — survey and a method for Airena

Date: 2026-09-07. Scope: milestone 1 of the combat & balance overhaul (DESIGN.md → "Requested outcome — combat & balance overhaul"). Read-only audit; no source edited, no server started, no worker-pool league run (D182). Match statistics below come from `data/airena.db` via single-process `sqlite3`/`node` reads.

Everything marked **[recommendation]** is a proposal for the lead, not a decision. Numbers derived from Airena's own code carry `file:line` references; numbers from outside carry a URL in §5.

---

## 0. Findings that matter most

1. **The current cost→cooldown coupling is the root of the "creatures idle" complaint and also the reason the existing price table cannot converge.** `src/skills/compile.js:35-36` sets `COOLDOWN_PER_POINT = 0.9`, `COOLDOWN_MIN = 1.1`; `cooldownPoints()` at `compile.js:71-75` is delivery cost + a share of atom cost, so `bolt:damage` (11 pts) waits 9.9 s, `self:heal` (9) 8.1 s, `cone:damage+stun` (13.75) 12.4 s. The file itself documents the measurement loop this creates (`compile.js:88-119`): raising a price lowers the measured strength, the next measurement asks to lower the price. `tools/matchworker.mjs` has to pin cooldown to 8 s to measure at all. Per-delivery constant cooldowns remove the loop by construction; then price can be measured.
2. **In the live database the median fight is 36 s, not ~22 s, and 47% of recent fights reach the arena burn.** 1,500 most recent matches (`constants_version c-d3006474`, ladder + training): seconds p25/p50/p75 = 26.0 / 36.3 / 40.1; 699/1500 contain a `burned` log event; a fighter uses a skill 8 times per fight at the median (p25 = 4), hits 60% of the time at the median, and deals 101 damage at the median against 180 hp. The 22 s figure matches the older `reports/tournament.txt` grid (mean 27 s) on hardcoded kits. The overhaul must set a time-to-kill target and retune magnitudes to hit it; fast cooldowns alone will overshoot (§3.1).
3. **The literature converges on one loop: sample → simulate with agents → regress outcomes on components → reprice under change limits → iterate**, with the well-known caveats that the agent defines what is measured (King, Hernandez et al., RuleSmith) and that cyclic structure must be separated from transitive strength before anything is priced (Balduzzi 2018/2019, Czarnecki 2020, Strang 2020). Airena already has half of this in `tools/kitbalance.mjs` (one-factor-at-a-time league with a "nothing" anchor, one pilot, symmetric bodies) and `src/skills/gauntlet.js` (a five-member counter-panel with a shape verdict). What is missing: a multi-pilot panel, random-kit sampling with interaction terms, a regression instead of a rank map, a zero-sum repricing rule, and a cycle-aware "no dominant strategy" metric (§3.2–3.4).
4. **Pricing cannot fix uptime.** With a 3 s cooldown and today's durations (`src/skills/registry.js:375-388`), silence (2.2 s) is up 73% of the time, blind (2.5 s) 83%, root (1.4 s) 47%, stun (0.9 s) 30% from ONE skill; burn (4 s), shield (5 s), boost/weaken (5/4 s), zone (3 s) and wall (5 s) become permanent. `self:heal` at 26 hp every 3 s (8.7 hp/s) out-sustains a single `bolt:damage` at the median 60% hit rate (5.2 dps). Every game surveyed that lets abilities cycle this fast bounds control effects structurally (WoW 100/50/25/immune, LoL 0.3 s floor + tenacity, Dota status resistance, Smite stack DR) and bounds sustain with an anti-heal rule (Overwatch's damage-role passive). Concrete rules in §3.3.
5. **"No dominant strategy" has standard, computable definitions**: maximum-entropy Nash support size and Nash-averaged scores (Balduzzi 2018), the cyclic fraction of the Helmholtz–Hodge decomposition of the logit win matrix (Strang 2020; the same decomposition Balduzzi uses to say when Elo is valid), RPS 3-cycle counts via `diag(A³)` (Sanjaya 2022), and Top-D diversity (number of kits within G points of the best, 2024 counter-table paper). Airena's `readShape`/`isDiverse` in `src/skills/gauntlet.js:239-337` are hand-rolled approximations of these; §3.4 gives the replacements and thresholds.
6. **Sample sizes** (derivation in §3.2.6): ±3 pp on a single kit's win rate needs ~1,070 independent games (~600–800 mirrored pairs with common seeds); a per-atom main effect at ±3 pp needs ~200–300 random kits × 16–32 games ≈ 5–7k matches per pilot per iteration (~30–45 min on the 8-worker pool at ~2 s/match); delivery×effect interaction terms come out at ±6 pp from the same run and need a targeted OFAT confirmation (~1k matches per flagged pair) for ±3 pp.

---

## 1. Airena as it stands (grounding for the recommendation)

### 1.1 The grammar and its economy

| thing | where | value |
|---|---|---|
| deliveries (9) and costs | `src/skills/registry.js:99-250` | beam 5, cone 4 (power 1.7), bolt 4, lob 4, zone 5, dash 4, blink 5, self 3, jump 5 |
| windup / recover | same | beam 0.65/0.10, cone 0.28/0.28, bolt 0.34/0.16, lob 0.50/0.20, zone 0.45/0.25, dash 0.18/0.26, blink 0/0.18, self 0.30/0.18, jump 0.06/… |
| effects (14) cost, magnitude, duration | `registry.js:375-388` | damage 7 (26), burn 7 (7 dps × 4 s), knock 5, pull 3, stun 6 (0.9 s), root 5 (1.4 s), shield 4 (40 × 5 s), heal 6 (26), cleanse 3, blind 5 (2.5 s), silence 6 (2.2 s), wall 5 (5 s), boost 4 (×1.35 × 5 s), weaken 4 (×0.7 × 4 s) |
| channels (7) | `registry.js:396-402` | speed 2, turn 2, damage 3, armor 3, cooldown 3, range 2, vision 4 |
| budgets | `registry.js:634,640` | SKILL_BUDGET 22, KIT_BUDGET 52, 3 skills |
| cost formula | `registry.js:648-662` | delivery + Σ effects + channel + combo surcharge |
| multi-effect share | `compile.js:171-190` | magnitudes × 1 / 0.75 / 0.6 for 1/2/3 effects; durations too |
| zone share | `compile.js:193-215`, `config.js:1118-1121` | ZONE_TOTAL_SHARE 1.6 spread over 6 ticks |
| cooldown | `compile.js:35-36, 71-75, 122-124` | max(1.1, (d.cost + Σ atom cost × share) × 0.9) s |
| bodies | `config.js:691-725` | BUILD_BUDGET 25; hp 60…300 (def 180), speed 3.0…8.6 (def 5.8), radius 1.2…1.8; per-axis measured `weight` |
| arena clock | `config.js:164-168` | SUDDEN_DEATH_AT 30 s, MATCH_SECONDS 50 |
| think rate | `config.js:78-81` | 30 Hz tick, brain thinks every 2 ticks (15 Hz) |

Cooldown is counted from the moment the skill starts (`sim.js:915`; the prompt says so at `src/brain/prompt.js:716`), so status uptime is exactly `duration / cooldown`.

### 1.2 How prices were found so far

`registry.js:305-373` documents the method: `tools/kitbalance.mjs --atoms` runs a round-robin among 15 kits that differ only in the third skill (14 atoms + "nothing"), one pilot (`brains/kit-stub/octopus.js`) on both sides, symmetric bodies, mirrored seeds, cooldown pinned at 8 s; per-delivery win rates (bolt, zone) are read, the best case per atom is rank-mapped into costs 3…7; correlation price↔best-case 0.91; blind/silence/wall get +1 "because the reference pilot cannot plan". `tools/checkprices.mjs` is a gate that only checks the comment and the registry still agree.

The file states its own limits (`kitbalance.mjs:205-215`): a flat atom price does not exist — the same atom measured 65% via bolt and 35% via zone (stun), 26% vs 61% (silence); "nothing" scores 30% via bolt and 15% via zone, so there is no single anchor either. This is precisely the interaction structure a regression with delivery×effect terms is built to estimate (§2.1, §3.2).

### 1.3 The counter-panel

`src/skills/gauntlet.js` keeps five kits found by search (`tools/gauntletpick.mjs`) so that they form ≥1 cycle on the product field; `readShape()` (`gauntlet.js:239-280`) classifies a candidate as dominant (min win rate over the five > 0.85), weak (max ≤ 0.25), situational (spread ≥ 0.3) or even; `isDiverse()` (`gauntlet.js:285-337`) requires ≥80% distinct win/loss patterns across the five. The header of the file already states the right target: "not equality, but the ABSENCE OF A DOMINANT STRATEGY", measured by the shape of the win-rate distribution across different opponents.

### 1.4 What the pilots actually do

`reports/falsify.txt` (six Opus-written brains, 40 rounds): removing perception channels changes the `move`/`face` intent 55–90% of the time but the `use` intent only 3–5%. The generated brains fire whatever is ready; the choice of WHEN to use a skill is almost never a function of what they see. That means (a) the kit-stub "ready-spam" pilot is representative of today's product pilot for the `use` channel, and (b) any "skill premium" the founder wants (a mortar that pays more because it is harder to land) will be invisible until the panel contains a pilot that actually aims. The mortar aim lever already exists: `api.use(name, metres)` with a single numeric argument (`sim.js:869-909`, clamp in `deliver.js:88-97`, prompt text `prompt.js:891-900`).

### 1.5 Live match statistics (1,500 most recent rows)

- outcomes: kill 1,421, double-ko 79; 699 (46.6%) contain an arena `burned` event, i.e. reached 30 s
- seconds p25/p50/p75: 26.0 / 36.3 / 40.1 (all 260k rows: p10 14.5, p50 35.1, p90 42.3)
- skill uses per fighter p25/p50/p75/p90: 4 / 8 / 10 / 12
- hit rate (hits/uses) p25/p50/p75: 0.33 / 0.60 / 1.00
- damage dealt per fighter p25/p50/p75: 24 / 101 / 173 (of 180 default hp)

Reading: at 7–16 s cooldowns a fighter gets ~8 casts in ~36 s; at the median hit rate that is ~5 hits ≈ 100–130 damage, short of a 180-hp kill, which is why half of the fights are decided in the burn. The pacing problem and the balance problem are the same problem: the ability cadence is too slow for the hp pool, and cadence is what the prices set.

---

## 2. Survey: how others balance composable / card / hero systems with automated play

### 2.1 Pricing components from outcome data (card games)

**The vanilla test.** Magic and Hearthstone designers evaluate a card against a "vanilla" baseline: a creature with no text is worth ~1 point of power and toughness per mana (Magic, accurate from two-drops to six-drops in Limited); Hearthstone's baseline is 1-mana 1/2 or 2/1, 2-mana 2/3 or 3/2, and a card that fails the test must carry text to justify its cost. The method is a *price anchor*: every ability is priced as a deviation from a text-free body of the same cost. Airena's equivalent anchor is `bolt:damage` (a plain projectile with plain damage) — kitbalance already uses "nothing" and `lob+cone damage` as anchors.

**Card win rates and their biases (17Lands / mtgds).** 17Lands publishes GP WR (in deck), OH WR (opening hand), GD WR (drawn later), GIH WR (in hand at all), GNS WR (not seen) and IWD (improvement when drawn). Two documented biases: *game-length bias* (cards in long games are seen more, so slow decks inflate their bombs) and *co-occurrence bias* (a strong card rides along with other strong cards). The fix used by the community is a match-level **logistic regression**: `win ~ intercept + player overall win rate + on-play + mulligans + Σ card strength coefficients + Σ synergy coefficient × pairwise synergy` — each card gets a coefficient that is its value *holding the rest of the deck and the pilot's skill constant*. This is the exact model shape recommended for Airena's atoms (§3.2.4): components as presence counts, pilot as a covariate, pairwise terms for synergy. The AAIA'2018 Hearthstone challenge winners used the same family (logistic regression ensembles with gradient-boosted trees over card-presence features).

**Hearthstone Arena "balance through science" (Blizzard).** Cards are bucketed by win rate and pick rate so that each draft offer has similar power; then (1) an ML model predicts win probability from deck contents, (2) a constrained optimisation adjusts per-card draft weights with **change limits (±30%) and a zero-sum constraint**, (3) weights are published (weight 2.0 appears twice as often as 1.0). Target is class win rate → 50%. The transferable part is the update rule: bounded, zero-sum steps against a fitted model, not free re-pricing.

**Riot Legends of Runeterra** publishes "may be broken" thresholds for archetypes: play rate > 15% and win rate > 55% at Platinum+.

### 2.2 Evaluating a population: Elo vs Nash averaging, transitive vs cyclic

**Balduzzi et al. 2018, "Re-evaluating evaluation" (NeurIPS).** Build `A = logit P` from the pairwise win matrix. Proposition 3: Elo ratings explain the data iff `curl(logit P) = 0`; Elo is the uniform average in logit space and "Elo's predictive failures are due to the cyclic component `rot(logit P)` that uniform averaging ignores". **Nash averaging**: play a two-player meta-game on the antisymmetric `A`; it has a unique maximum-entropy Nash equilibrium `p*`; the Nash average is `n = A·p*`. It is *clone-invariant* (adding a redundant copy of an agent moves no score: Example 1 shows a duplicated agent splits its Nash mass), so including many, weak, or duplicated opponents cannot bias it — the opposite of averaging over a hand-picked panel. Caveats: needs an LP per evaluation; can be sensitive to small win-rate changes; sparse matchup data must be handled. For rock-paper-scissors the maxent Nash is (⅓,⅓,⅓) — the honest answer "no one is best".

**Balduzzi et al. 2019, "Open-ended learning in symmetric zero-sum games" (ICML).** Every such game decomposes orthogonally into a *transitive* part `φ(v,w) = f(v) − f(w)` and a *cyclic* part. The *empirical gamescape* is the convex hull of the rows of the evaluation matrix; its dimension is `rank(A)` (Schur decomposition). *Effective diversity* `d(P) = pᵀ⌊A_P⌋₊ p` measures how much Nash-supported agents beat each other rather than how strong they are; the rectified Nash response trains each supported agent against the mixture it already beats ("amplify strengths, ignore weaknesses") to widen the gamescape. For balance: the cyclic component is the *content* of the game, the transitive component is what prices should flatten.

**Czarnecki et al. 2020, "Real world games look like spinning tops" (NeurIPS).** Definition 3, *Nash clustering*: `N₁ = supp(maxent Nash(P))`, then remove `N₁` and repeat on the remainder; Theorem 2: clusters are monotone in relative population performance. The cluster sizes rise then fall with skill — the cyclic dimension is widest in the middle, narrow at the top and bottom. Theorem 3: a training population that contains a full Nash cluster is guaranteed transitive improvement. Practical reading for Airena: the opponent panel must cover a whole cluster of the current meta (all the ways to win at roughly the same strength), not just the best kit, or the measurement has blind spots exactly where the cyclic structure lives.

**Sanjaya, Wang, Yang 2022, "Measuring the non-transitivity in chess".** With `A_ij = 1[i beats j]`, the number of RPS cycles through strategy `i` is `diag(A³)_i`. Over a billion games, cyclicity peaks at 1300–1700 Elo, exactly where the player histogram peaks and players "get stuck".

**Strang, Abbott, Thomas 2020, "The Network HHD" (Helmholtz–Hodge decomposition of tournaments).** Edge flow `f_ij = logit(p_ij)`; `r = argmin_{Σu=0} ‖Gu − f‖²`; `f_t = Gr` (transitive, arbitrage-free) and `f_c = f − f_t` (cyclic, favourite-free); scalar intransitivity `‖f_c‖ / ‖f‖`, continuous in the probabilities (a 0.99 cycle counts more than a 0.51 one), unlike Kendall/Slater counts that only see signs. This is the cheapest cycle-aware statistic to add to a league report: one least-squares solve.

**2024, "Identifying and clustering counter relationships of team compositions in PvP games" (arXiv 2408.17180).** A Bradley–Terry rating from a Siamese encoder captures the transitive part; the residual `actual − BT prediction` is the counter part; vector quantisation into M categories turns an N×N counter matrix into M×M (M from 3 to 81 across Hearthstone, Age of Empires II, League). Two balance metrics: **Top-D diversity** = number of compositions within a tolerated win-value gap G of the strongest ("with a 4% gap there are only 3 decks" in Hearthstone), and **Top-B balance** = number of non-dominated compositions across counter categories.

### 2.3 Restricted play (Jaffe et al. 2012, AIIDE best student paper)

Definition: for a restriction `R` (never play action `a`; must play `a` whenever available; random; greedy depth ≤ 1; support ≤ k mixed strategies; oblivious until round k; avoids certain end states; chooses a given start), the *balance measure* is the value of the game between the restricted agent `A_R` and an unrestricted agent that knows the restriction and exploits it. Their tool implements Omit-a, Prefer-a, Random, Greedy, Aggressive (avoids ties), Low/No-randomness, Player-1. On their card game Monsters Divided the readout was immediate: "Omit Green: 13.54%, Omit Blue: 7.44%, Omit Red: 7.83%" → Green is too weak (forbidding it hurts least); "Random: 8.04%" → random play too effective; "Omit Self×2/3: 47.41%" → a power card is nearly irrelevant; "Prefer Self×4/1: 3.83%" → a decoy that punishes naive play. They report saving "up to 20 phases of manual evaluation". Limitations they name: optimal agents (exact solvers) only, perfect-information discrete games, real-time games need hand-coded agents, and *execution difficulty is not modelled but "may be possible by measuring the frequency of successful execution"* — which is the mortar-aim question in Airena.

Transfer to Airena (§3.2.7): *Omit-atom leagues* (a random-kit league where atom `a` is banned) measure how essential an atom is to the field; *Prefer-atom* is the OFAT league kitbalance already runs; *restricted pilots* ("cannot aim the mortar", "fires whenever ready", "never uses CC during the enemy's wind-up") measure the skill premium of an atom or delivery, and that premium — not the naive value — is the reward the founder wants for hard-to-land abilities.

### 2.4 Automated playtesting and auto-balancing

- **Volz, Rudolph, Naujoks 2016 (GECCO), Top Trumps**: a multi-objective EA generates decks optimising simulation-based *fairness* and *excitement* objectives; generated decks match or beat published ones on those objectives. Precedent for treating "balance" as several objectives at once (Airena's `tools/balance.mjs` already scores fairness/spread/pacing/shape/decisiveness).
- **Isaksen, Gopstein, Nealen 2015 (FDG), "Exploring game space using survival analysis"**: parameterised Flappy Bird; a player model with precision, reaction time and actions-per-second; Monte-Carlo play; exponential survival fits of score histograms give each variant a difficulty. Precedent for a *parameterised pilot* whose skill knobs are explicit (the "skilled kit-stub" of §3.2.2).
- **Zook, Fruchter, Riedl 2014, "Automatic playtesting for game parameter tuning via active learning"**: Gaussian-process regression / classifiers with UCB, expected-improvement and entropy acquisition; peak accuracy at ~70 samples where random sampling never got there. Precedent for choosing *which* kits to simulate next rather than sampling uniformly.
- **Silva et al. 2019, "Evolving the Hearthstone meta"**: an EA searches card-attribute changes that move deck win rates toward 50%.
- **Hernandez, Denamganaï, Walker 2020, "Metagame autobalancing for competitive multiplayer games"**: designer specifies a *target response graph* (desired win-rate matrix, e.g. a cycle); TPE/Optuna minimises MSE between achieved and target graphs; MCTS agents (625 iterations) with reward hierarchies; **50 games per matchup per configuration**; cyclic target reached 9% aggregate error in 173 iterations of 20–25 min each (6-way parallel); "fair" target only 16%. Limitations named: compute, *non-human-like AI*, cost of building agents. This is the closest published analogue to what the founder asked for, and its 50-games-per-cell budget is the reference point for §3.2.6.
- **DeLaurentis et al. 2021 (IEEE CoG), microRTS**: bot self-play → ML model of win probability → SHAP attribution of imbalance to game features → iterate parameters. Precedent for attributing imbalance to components via a fitted model rather than by eye.
- **Bergdahl et al. 2020 (EA SEED)**: DRL agents raise test coverage, find exploits, test map difficulty in an FPS.
- **Gudmundsson et al. 2018 (King), "Human-like playtesting with deep learning"**: CNN trained on player data predicts the most human action; predicts level difficulty better than MCTS at a fraction of the compute; King's stated principle is *emulate, don't outperform* — bots are for outlier detection and pass-rate prediction, human tests remain for feel.
- **Ubisoft La Forge**: RL/imitation bots for balance and testing; "designers set parameters and have bots test balance overnight".
- **BBExplorer 2026 (arXiv 2608.28364)**: balance testing as *boundary discovery* under a finite simulation budget: probe ±each axis, **two-stage screening** (N_scr cheap runs on all candidates, N_full on the top-k), step-size decay; ~9k matches per 5-D path; re-evaluating boundary inputs under five other seeds moved win rate by +0.014 ± 0.027. Precedent for the screen-then-confirm budget split in §3.2.6.
- **RuleSmith 2026 (arXiv 2602.06232)**: LLM agents *play* (they do not tune); Bayesian optimisation over 12 parameters with loss `|w_E − 0.5| + |w_N − 0.5| + 0.5·w_D`, 16–64 games per iteration allocated by expected improvement, reaches 50 ± 5%; explicit caveat that LLM agents are imperfect proxies for humans. Relevant because Airena's product pilots *are* LLM-written programs.

### 2.5 Industry win-rate practice "at equal skill"

- **Riot, Champion Balance Framework (2019) and update (2020)**: four audiences (Average = below top 10%, Skilled = top 10%, Elite = top 0.5% after the update, Pro). OP thresholds: Average 54.5% win rate at or below the ~7% average ban rate, tightening to 52.5% at 5× ABR; Skilled 54% → 52%; Underpowered 49%; Elite: 45% ban rate, or 5% presence for UP; Pro: 90% presence in one patch or 80% across consecutive patches. The 2020 update tightened Average/Skilled OP bands by 0.5 pp to fight power creep and added a ban-rate-conditioned win-rate metric for Elite. Rationale stated: limit subjectivity; different audiences have different sensitivities.
- **Blizzard, Overwatch**: heroes kept in a 45–55% win-rate band; ban rate treated as a direct signal; data segmented "all ranks together and separately"; the metrics they use are *weighted usage rate* (normalised by role size) and *unmirrored/fractional win rate* (only games where one side had the hero, weighted by play time) to avoid the 50% convergence of mirrored picks. Season 9 kept time-to-kill constant on purpose while enlarging projectiles by raising everyone's hp ("about one more shot"), and added a damage-role passive that reduces healing on recently damaged targets (25% → 30%).
- **Valve/IceFrog**: balance around the pro scene and let the rest follow; patches change how the game is played, not only numbers.
- **Riot TFT**: weekly public meta reports grading balance by over/under-performers.

Common structure: (1) a band, not a point; (2) win rate *plus presence*, since a dominant option shows up as a ban or pick rate before it shows up as a win rate; (3) segment by skill because the same ability has different value in different hands; (4) the thing to nerf is what wins against everyone at the top segment.

### 2.6 Uptime and diminishing returns for crowd control

- **World of Warcraft**: per CC category (stun, silence, disarm, knockback, root, disorient, incapacitate) successive applications last 100% → 50% → 25% → immune; the window is 18 s counted from the *end* of the previous effect; knockbacks go immune after the first and reset after 10 s; PvP duration cap 6 s; Blizzard's stated intent is to reduce "the total amount of time that players are not in control of their characters".
- **League of Legends**: tenacity reduces CC duration; sources within a group stack multiplicatively, groups additively; capped at 100%; **no disable can be reduced below 0.3 s**; duration is fixed at application; airborne, drowsy, nearsight, stasis, suppression are excluded (they are the "guaranteed" CC that must stay reliable); forced actions override each other.
- **Dota 2**: status resistance reduces *duration only*, never strength; multiple sources stack multiplicatively with diminishing returns.
- **Smite 2**: only hard CC (stun, root, silence, taunt, mesmerize, polymorph, banish, disarm, displacement) triggers DR; each hard CC adds 2 stacks (displacement 4), each stack −10% duration, max 4 stacks (−40%), stacks last 6 s and refresh; some abilities ignore DR. Older Smite: −33% / −66%, 15 s window, floor 0.5 s.
- **Heroes of the Storm**: no DR; chain-CC is a standing community complaint.

Rule that survives every implementation: *uptime = duration / cooldown per category per target is bounded structurally*, with a floor so a CC is never a no-op and a category system so different atoms cannot bypass the bound by alternating.

### 2.7 Time-to-kill, DPS targets and pacing

- **Shooters**: low TTK (CS2, Siege: one burst) rewards positioning and information; high TTK (Halo, Apex) rewards tracking, movement and gives the defender a chance to answer — Apex players describe long TTK explicitly as what makes "getting hit first" survivable. Overwatch Season 9 treated TTK as the invariant to hold while changing accuracy and hp.
- **Fighting games**: 99-second timers, but a round between equal players typically lasts 20–45 s; *hitstop* (a few frozen frames on impact) exists to let the eye register a hit; readability is the design constraint the genre talks about most.
- **Spectator design**: League's top-down camera is cited as the readable esport; Overwatch is criticised for six simultaneous effect stacks; broadcast UI must survive 720p on a phone. Riot's "Building a Sport" lists the goals: competitively rigorous, strategically diverse, skill-based, entertaining, exciting to watch.
- **Auto battlers**: a planning phase of 30–60 s followed by an automatic fight; fights are short enough to be read in full.

Take-away for a game that is *watched*: fix the TTK band first (long enough to read a plan, short enough to end before the clock), then set hp and damage to hold it at the *observed* hit rate, and add an anti-sustain rule so healing cannot stretch fights past the band.

### 2.8 Cooldown norms in MOBAs and hero shooters, and why

Concrete numbers: League's Ezreal — Q 5.5 → 4.5 s (0.25 s cast), W 8 s, E (blink) 26 → 14 s, ultimate 120 → 90 s; Overwatch Tracer — Blink 3 s per charge with 3 charges; Genji — Swift Strike 8 s (reset on elimination); Dota basic abilities sit around 8–15 s at rank 1 and fall with rank, ultimates 60–120 s (Liquipedia/Fandom pages blocked the fetch; the Ezreal and Tracer numbers were verified). Riot's counterplay writing states the design reason: a cooldown is a *window* — the opponent needs a moment when the threat is down; combos that close the window without a drawback get changed, and Flash is tolerated because its cooldown is long.

Three tiers recur: **spammable** (3–6 s: the poke, the basic attack pattern; decisions every few seconds), **committal** (8–15 s: using it is a choice you live with; CC and escapes live here), **spectacle** (60+ s: ultimates). Escapes are always longer than the attacks they dodge (Ezreal E 14–26 s vs Q 4.5 s; Tracer's Recall 12 s vs Blink 3 s). Under the founder's "≤ ~3 s for everything", the second and third tiers must be rebuilt from other parameters — wind-up, recovery, charges, duration, minimum range — or the escape/attack ratio inverts and every attack is dodged (§3.3.5). That is what `registry.js:229-247` already found for the jump.

---

## 3. Recommendation for Airena

### 3.1 Order of operations — pacing before prices **[recommendation]**

Prices are meaningful only against a fixed cadence and a fixed hp pool. Proposed order:

1. **Per-delivery cooldowns as constants** in `DELIVERIES` (no cost term; `cooldownPoints` deleted). Example ladder to start the measurement from (to be measured, not shipped as truth): self 2.0, cone 2.5, bolt 2.5, beam 3.0, lob 3.0, zone 3.5, dash 3.0, blink 4.0, jump 4.0. This keeps everything within "about 3 s" while preserving the escape > attack ordering that §2.8 shows every reference game keeps.
2. **A TTK band**. Today: 180 hp, damage 26, 60% median hit rate. Three damage skills on 3 s cooldowns at 60% → 15.6 dps → ~12 s TTK, too fast to read; keeping "damage per cooldown-second" constant (26 × 3/9.9 ≈ 8 per hit) → ~5 dps → ~38 s TTK, into the burn. A middle setting of 12–15 damage per hit gives ~7–9 dps → **TTK 20–25 s at the median hit rate**, ending most fights before the 30 s burn (today 47% reach it). Whichever band the founder picks, the burn clock (`config.js:164`) and MATCH_SECONDS should be re-derived from it, not left.
3. **Uptime rules** (§3.3) — set before measurement, because a permanent buff or a 73% silence will otherwise dominate every league and the regression will "price" a bug.
4. Only then the pricing loop (§3.2).

### 3.2 The balancing loop (a)

#### 3.2.1 Sampling kits

Random legal kits (as `tools/gauntletpick.mjs:35-64` already generates) are the right population *if* the sample is balanced: with 14 atoms, 9 deliveries and the L1 legality table, uniform sampling under-represents expensive combinations and rare legal pairs. **[recommendation]** Generate kits by *stratified* sampling: iterate over legal (delivery, effect) pairs and keep drawing kits until every pair has appeared in at least `k = 12` kits (a balanced incomplete design in the DoE sense); add the vanilla anchors (`bolt:damage`, `lob:damage`, `cone:damage` with `self:heal`) and the current gauntlet five as fixed members so every iteration is comparable to the last. Expect 250–350 kits per iteration.

#### 3.2.2 The pilot panel

The agent defines what is measured (King; Hernandez; RuleSmith). One naive pilot gives a lower bound (kitbalance's own words). **[recommendation]** A fixed panel, pinned in `brains/panel/` and re-generated only when the api changes:

- `naive` — `brains/kit-stub/octopus.js` as is: fires when ready, kites by range. The floor.
- `skilled` — a second scripted kit-agnostic pilot with explicit skill knobs (Isaksen-style): aims the mortar with lead (`api.use(name, metres)`), holds hard CC for the enemy's wind-up (`p.enemy.casting.telegraph`), steps out of zones while firing, blinks only against telegraphed attacks. Knobs at 0 must reproduce `naive` exactly, which is the panel's self-test.
- 2–3 LLM-written kit-agnostic pilots from different model families (GLM, Gemini, Claude) produced once from the standard prompt with the kit read from `p.self.kit`, admitted through `viability`. These are the product proxy.

Both sides run the *same* pilot in a cell (the `twin` mode in `matchworker.mjs`), default bodies (`DEFAULT_BUILD`), mirrored seeds (`900 + s·7919`, both sides). The panel's own gate: identical kits must draw (kitbalance's `selftest`), and the `skilled` pilot must beat `naive` on the anchors by a margin that is reported, never assumed.

#### 3.2.3 League shape

A full N×N round robin over 300 kits is 45k pairs × seeds × pilots — too much. **[recommendation]** Kit-versus-field: every kit plays a fixed opponent field `O` of 16 (gauntlet five + 8 random kits from the previous iteration's Nash support + 3 anchors), `m = 2 seeds × 2 sides × 16 opponents = 64` games per kit per pilot, or 32 with one seed. The field is re-weighted by its own maximum-entropy Nash so redundant or weak members do not bias the average (Balduzzi's clone invariance is the reason to prefer this over a plain mean). A separate small round robin among the top 24 kits by Nash-averaged score feeds §3.4.

#### 3.2.4 The model

Match-level logistic regression, one row per game (kit `K`, pilot `π`, opponent `o`, side `s`, seed):

```
logit P(win) = α_π + η_s + ρ_o
             + Σ_a β_a · n_a(K)          # atom presence counts (0..3)
             + Σ_d γ_d · n_d(K)          # delivery counts
             + Σ_c δ_c · n_c(K)          # channel counts
             + Σ_(d,a) θ_da · n_da(K)    # delivery×effect pairs, ridge-penalised
             + ζ · cost(K)               # total points spent
```

`ρ_o` is the opponent's strength (its own Nash-averaged score from the field round robin), which is what turns "vs this field" into a transitive estimate. Report each coefficient as a marginal effect in win-rate points at the field mean. Fit per pilot and pooled; the *spread across pilots* is the skill premium (§3.2.7) and is printed next to the price the way kitbalance prints the spread across deliveries.

Why regression and not the current rank map: the rank map (`registry.js:363`) throws away the size of the differences and cannot separate an atom's value from the delivery that carried it in the test; kitbalance found stun at 65% via bolt and 35% via zone and had to average. The `θ_da` terms are that difference, estimated instead of averaged.

#### 3.2.5 Re-pricing rule

Bounded, zero-sum, anchored (Hearthstone Arena):

- price unit: `damage` on `bolt` stays at its price; every coefficient is expressed relative to it: `value_a = β_a / β_damage × cost_damage`
- step: `cost_a ← cost_a + clamp(round(value_a − cost_a), −1, +1)`, i.e. at most one point per atom per iteration (damped, to avoid the oscillation `compile.js:88-119` describes)
- zero-sum: `Σ cost_a` held constant so SKILL_BUDGET/KIT_BUDGET keep their meaning; if the sum drifts, rescale the budgets, never the anchor
- pairs: if `|θ_da|` exceeds 6 pp after ridge shrinkage and is confirmed by an OFAT run (§3.2.6), it becomes a *combination surcharge/discount* in `costOf` for that pair (the surcharge mechanism already exists at `registry.js:648-662`)
- deliveries and channels reprice the same way, with the same ±1 cap

Stopping rule: after controlling for cost, every atom/delivery/channel coefficient lies within ±3 pp; `ζ` (win rate per point spent) is within ±1 pp/point of zero; Nash-averaged scores of the top 24 kits within a 10 pp band. Expect 3–5 iterations; each is ~30–45 min per pilot on the pool.

#### 3.2.6 How many kits and matches (±3 pp)

Single win rate: `SE = √(p(1−p)/n)`; ±3 pp at 95% at p = 0.5 → n = (1.96/0.03)² × 0.25 ≈ **1,070 independent games**; ±5 pp → 385; ±10 pp → 96. Mirrored seeds with sides swapped (common random numbers) make the two games of a pair correlated and reduce the variance of a *difference* between kits; a 20–40% reduction is typical in the CRN literature, so ~650–850 mirrored pairs for the same precision on a comparison. Hernandez et al. used 50 games per cell for a coarse target; BBExplorer confirms boundary inputs with a second, larger batch — the same screen-then-confirm split is recommended here.

Per-atom main effect (what the price needs): `SE(β_a) ≈ √(σ² / (N · Var(n_a)))` with N kits, `σ² = 0.25/m + τ²` (binomial noise at m games per kit plus unexplained kit-level variance; τ ≈ 8 pp is a conservative guess until measured), `Var(n_a) ≈ 0.3` for stratified kits. For SE ≤ 1.5 pp (±3 pp at 95%):

| games per kit m | σ² | kits N | matches per pilot |
|---|---|---|---|
| 16 | 0.022 | ≈ 330 | ≈ 5,300 |
| 32 | 0.014 | ≈ 210 | ≈ 6,700 |
| 64 | 0.010 | ≈ 150 | ≈ 9,800 |

More kits with fewer games each is cheaper than fewer kits with more games because heterogeneity averages over N. At ~2 s per match (`tools/matchpool.mjs:5`) on 8 workers, 6,700 matches ≈ 30 min per pilot; a 4-pilot panel ≈ 2 h per iteration, or 1 h if only `naive` and `skilled` run every iteration and the LLM pilots only on the final pass.

Delivery×effect pairs: prevalence per kit ≈ 5–6 pair-slots over ~90 legal pairs, `Var ≈ 0.06`; with 300 kits × 32 games the pairs come out at ±6 pp — enough to *flag*; a flagged pair is confirmed by a kitbalance-style OFAT run (kit with pair vs kit without, mirrored, ~1,070 games → ±3 pp). ±3 pp on all pairs at once would need ~1,000 kits ≈ 30k matches per pilot — feasible overnight but not per iteration.

#### 3.2.7 Skill premium, restricted play and the mortar

The founder's rule "the harder it is to land, the more it pays" is a *ceiling* statement, not a *price* statement. **[recommendation]** Price every atom and delivery by the `naive` pilot's coefficient (the floor everyone gets), and verify with the `skilled` pilot that no atom's ceiling exceeds `floor + 15 pp` (a band to be tuned; Riot's OP margin at Elite is ~7 pp over a 50% base on a much larger population). The gap between floor and ceiling is printed per atom as its *skill premium*; the mortar should have a large one (its hit rate curve in `registry.js:150-175` already shows aim, not splash, decides hits), a self-heal should have almost none. Restricted-pilot leagues in Jaffe's sense make this exact: `skilled` with `aimLob = off` vs `on`, `holdCC = off` vs `on`. If the premium of an atom is near zero, it is not "controllable by the mind" and either its delivery needs an aim lever or the atom is a stat, not an ability.

Omit-atom leagues (ban atom `a` from every kit in the field) answer the other Jaffe question — how essential an atom is: a large drop in field-wide fight quality (double-ko rate, burn share) when `damage` is banned is expected; a large drop when `cleanse` is banned would mean CC is too strong, not that cleanse is.

#### 3.2.8 Intransitivity

The vs-field regression estimates the *transitive* part of strength — `ρ_o` and the Nash-weighted field make it so. The cyclic part is never priced:

1. Fit; take the residual matrix of the top-24 round robin (`logit p_ij − (r_i − r_j)`).
2. Compute the HHD cyclic fraction `c = ‖f_c‖/‖f‖`. **[recommendation]** Target band 0.2–0.4: below 0.15 the field is a ladder (one strength scalar explains everything, nothing counters anything); above 0.5 "strength" is not a scalar and prices mean little — usually a sign of an uptime bug or a degenerate matchup rather than healthy rock-paper-scissors.
3. Pairs with large residuals are *counters*: reported, never repriced. A kit that is strong against the whole field (high Nash-averaged score) is the only thing that gets cut — the existing `readShape` "dominant" verdict, made cycle-aware.
4. Bootstrap over seeds (resample the seed set, refit) to attach a confidence to every support-membership and cycle claim; a 3-cycle that appears in fewer than 80% of bootstrap refits is noise.

#### 3.2.9 Out-of-sample validation

After each reprice, a *product-field* pass: real creatures from `data/airena.db` with their own brains and bodies, tournament-grid style (`reports/tournament.txt` format), read against Riot-style bands: a kit is flagged if it wins > 55% against the whole grid *and* is in the Nash support with mass > 0.5 (win rate plus presence, §2.5). The LLM pilots' pass is the proxy for the founder's "watch as a spectator" check and is the place to apply the spectator metrics from the sibling baseline report.

### 3.3 Constraints pricing alone cannot fix (b)

All figures use current durations (`registry.js:375-388`) and a 3 s cooldown; uptime = duration / cooldown (`sim.js:915`).

1. **Status uptime rule**: for any timed atom, `duration ≤ 0.5 × cooldown of the carrying delivery` for buffs/debuffs (boost, weaken, shield, burn) and `≤ 0.35 ×` for hard CC (stun, root) and mind CC (blind, silence). Today: burn 4/3 = 133%, shield 5/3, boost 5/3, weaken 4/3, zone 3/3, wall 5/3 → *permanent*; silence 73%, blind 83%, root 47%, stun 30%. Either durations shrink to ~1.0–1.5 s or the atoms get charges/DR. A permanent boost is a body stat and competes with `BUILD_AXES`, not with abilities.
2. **CC diminishing returns**, per category per target, window sized to a 30 s fight: categories `hard = {stun, root}`, `mind = {blind, silence}`, `displace = {knock, pull}`; successive applications in a category last 100% → 50% → 25% → immune (WoW), window 6 s from the end of the last effect (Smite's 6 s, not WoW's 18 s — a fight is 30 s); floor 0.3 s (LoL); a new application never extends a running one (already true for stun at `effects.js:127-130`); displacement goes immune after the second application (WoW treats knockback strictest). Two different CC atoms in one kit (allowed: `kit_dup` only forbids identical skills, `registry.js:746`) otherwise chain to 60–100% uptime with everything at 3 s.
3. **Total CC budget**: independent of DR, a hard cap of *not more than 40% of any rolling 10 s window* of the target being stunned/rooted/silenced; excess applications convert to the floor duration. This is the "time not in control" bound Blizzard states as the intent.
4. **Sustain caps**: (a) healing on a target that took skill damage in the last 2 s is halved (Overwatch's damage-role passive, generalised); (b) total healing per fighter per fight ≤ 60% of max hp, further heals do nothing but still cost the cast; (c) a shield does not refresh while one is up (today `Math.max` at `effects.js:141-142` refreshes duration every 3 s → permanent 40-hp absorb, i.e. 13 absorb/s against ~8 dps → immune). With these, `self:heal` at 26 hp/3 s (8.7 hp/s) no longer out-sustains a single 60%-accuracy `bolt:damage` (5.2 dps) indefinitely.
5. **Escape cadence**: an escape's cooldown must exceed the shortest attack cooldown it dodges by ≥ 1.5× (Ezreal E vs Q; Tracer Recall vs Blink), or carry charges. Blink (0.28 s i-frames, `registry.js:189-193`) and jump (0.81 s airborne dodging cone/zone/dash, `registry.js:229-247`) at 3 s would answer every attack; the registry's own argument for jump price 5 collapses under flat cooldowns. Hence blink/jump at the top of the range (4 s) or one charge per 6 s.
6. **Single-instance world effects**: one zone and one wall per caster at a time (casting again removes the old); otherwise 3 s zones on 3 s cooldowns tile the arena and a 5 s wall every 3 s is a permanent maze. Zone duration must also stay below its cooldown (rule 1).
7. **Projectile minimum range and arming**: lob already refuses to land nearer than `radius + splash` (`deliver.js:88-97`); keep it and print it (the prompt does, `prompt.js:653-700`). Bolt needs no minimum range but the near-instant `beam` with 0.65 s wind-up must keep `needsLos` (`registry.js:101-105`) — kitbalance found beam+cone bases non-neutral (`kitbalance.mjs:85-105`) because whoever sees first wins; with 3 s cooldowns that first-sight advantage repeats ten times per fight.
8. **Damage floor for readability**: no hit below ~5% of default hp (9 damage) after share/zone division — a hit that cannot be seen cannot be judged by a spectator (§2.7 hitstop rationale). The share divisor (`compile.js:171-190`) at 0.6 on a retuned 13-damage atom yields 7.8, below the floor; the divisor or the floor must move.
9. **Kit composition rules** stay: at least one damage source (L2), no duplicate skills, combination surcharge; add **at most one hard-CC atom per kit** unless the DR system is in — the cheapest way to prevent chain-CC kits while the measurement is still running.

### 3.4 Measuring "no dominant strategy" (c)

Computed on the top-24 (by Nash-averaged score) round robin of §3.2.3, on the logit matrix `A`, with seed bootstrap (≥ 200 refits):

| metric | definition | source | proposed band **[recommendation]** |
|---|---|---|---|
| Nash support size `s` | `|supp(maxent Nash(A))|` | Balduzzi 2018, Czarnecki 2020 Def. 3 | `s ≥ 4` and max mass ≤ 0.35; support membership stable in ≥ 80% of bootstraps |
| Nash-averaged score spread | `max(A·p*) − min(A·p*)` over the support layer | Balduzzi 2018 | ≤ 10 pp inside the first Nash cluster |
| cyclic fraction `c` | `‖f − Gr‖ / ‖f‖`, `f = logit P`, `r` least squares | Strang 2020; Balduzzi 2018 Prop. 3 | 0.2 ≤ c ≤ 0.4 |
| RPS 3-cycles | `Σ diag(M³)/3`, `M_ij = 1[p_ij > 0.55]` (0.55 not 0.5 to ignore noise) | Sanjaya 2022 | ≥ 2 cycles among the top 8, each surviving ≥ 80% of bootstraps |
| Top-D diversity | number of kits within G = 5 pp of the best Nash-averaged score | arXiv 2408.17180 | ≥ 5 |
| dominance verdict | kit whose min win rate over the field > best-of-field's min (`readShape`, `gauntlet.js:253-260`) **and** Nash mass > 0.5 | gauntlet.js + Nash | zero such kits |
| ladder check | R² of the transitive fit `r_i − r_j` on `logit p_ij` | HHD | R² ≤ 0.85 (above it the field is a ladder) |

`isDiverse()`'s pattern-uniqueness test (`gauntlet.js:285-337`) is a discrete version of the cyclic fraction; it can stay as a gate but the report should print `c` and the cycle list, because the pattern test cannot tell a 0.51 cycle from a 0.99 one (Strang's argument against Kendall/Slater counts). The gauntlet five should be re-picked each iteration as the first Nash cluster of the top-24 matrix (Czarnecki Thm. 3: a field that contains a full cluster measures transitive strength correctly), replacing `gauntletpick.mjs`'s style-pattern merge with Nash clustering.

### 3.5 Instrument spec — `tools/atombalance.mjs` **[recommendation]**

Inputs: `--kits=300 --games=32 --pilots=naive,skilled --field=16 --seed=…`, optional `AIRENA_TUNING` candidate prices. Steps: stratified kit sampling with legality (`validateKit`) → field selection (gauntlet five + previous Nash support + anchors) → panel self-test (identical kits draw; skilled ≥ naive on anchors) → league on the pool (one league at a time, D182) with `fixedCooldown` removed (per-delivery constants) → per-game rows to `reports/combat/atombalance-<iter>.jsonl` → regression (a small IRLS logistic fit is ~80 lines, no dependency) → coefficient table with 95% CIs per pilot, skill premium column, flagged pairs → proposed price vector under the ±1/zero-sum rule → top-24 round robin → Nash/HHD/cycle report → `reports/combat/atombalance-<iter>.md`. Gate: `tools/checkprices.mjs` should read the last report's coefficient table instead of a comment, and fail when any atom's cost is more than one point from its measured value.

Runtime: ~6.7k matches per pilot per iteration ≈ 30 min on 8 workers; round robin 24² × 2 seeds × 2 sides ≈ 2.3k matches ≈ 10 min.

### 3.6 Risks and open questions

- **Pilot dependence is the whole game.** Every published system says so. The panel of §3.2.2 makes it explicit and prints the spread; it does not remove it. Prices set on `naive` may be wrong for a future generation of smarter LLM brains; the out-of-sample product pass (§3.2.9) is the tripwire, and re-pricing should be expected once per model generation, as Riot re-tunes per patch.
- **Interaction blow-up.** 9 × 14 pairs plus channels; the ridge penalty and the ±6 pp flag threshold keep the first passes honest, but a few three-way effects (zone × heal × boost) will only show up as kit-level residuals. Print the ten largest kit residuals every iteration.
- **Sudden death at 30 s** interacts with every sustain and CC rule: a stall kit is "balanced" only because the arena kills both. Measure burn share per kit; a kit whose fights reach the burn > 60% of the time is a pacing defect regardless of its win rate (Volz's "excitement" objective; `tools/balance.mjs` pacing/decisiveness axes).
- **The founder's ≤ 3 s everywhere** versus the escape-cadence rule (§3.3.5): a decision to record in DESIGN.md either way.
- **Nash equilibria are noisy on small matrices**; the bootstrap is not optional, and support membership should be reported as a frequency, never as a fact.

---

## 4. What to reuse from the repo unchanged

- `tools/matchpool.mjs` / `matchworker.mjs`: the deterministic pool, `twin` mode, mirrored seeds, `builds` per job. Only `fixedCooldown` becomes unnecessary once cooldown is a delivery constant.
- `kitbalance.mjs`'s selftest gate (identical kits must draw) and the ATOM_BASE neutrality table — as the panel self-test.
- `gauntlet.js` verdict vocabulary (dominant / weak / situational / even) — with the cycle-aware inputs of §3.4.
- `balance.mjs`'s multi-objective scoring (fairness, spread, pacing, shape, decisiveness) — as the fight-quality objective that runs beside the price regression.
- `viability.js`'s "can it finish a fight" check — as the admission test for panel pilots and sampled kits.

---

## 5. Sources

Evaluation, Nash averaging, cycles
- Balduzzi, Tuyls, Perolat, Graepel 2018, "Re-evaluating evaluation", NeurIPS — https://arxiv.org/abs/1806.02643 (PDF https://arxiv.org/pdf/1806.02643)
- Balduzzi et al. 2019, "Open-ended learning in symmetric zero-sum games", ICML — https://arxiv.org/abs/1901.08106 ; https://proceedings.mlr.press/v97/balduzzi19a.html
- Czarnecki et al. 2020, "Real world games look like spinning tops", NeurIPS — https://proceedings.neurips.cc/paper/2020/file/ca172e964907a97d5ebd876bfdd4adbd-Paper.pdf
- Sanjaya, Wang, Yang 2022, "Measuring the non-transitivity in chess" — https://arxiv.org/abs/2110.11737
- Strang, Abbott, Thomas 2020, "The Network HHD: quantifying cyclic competition in trait-performance models of tournaments" — https://arxiv.org/abs/2011.01825
- "Identifying and clustering counter relationships of team compositions in PvP games for efficient balance analysis" 2024 — https://arxiv.org/abs/2408.17180
- Gidel, IFT 6756 lecture notes on evaluation of multi-agent systems — https://gauthiergidel.github.io/ift_6756_gt_ml/notes/Lecture23.pdf

Restricted play and automated balancing
- Jaffe, Miller, Andersen, Liu, Karlin, Popović 2012, "Evaluating competitive game balance with restricted play", AIIDE — https://homes.cs.washington.edu/~zoran/jaffe2012ecg.pdf ; https://ojs.aaai.org/index.php/AIIDE/article/view/12513
- Volz, Rudolph, Naujoks 2016, "Demonstrating the feasibility of automatic game balancing", GECCO — https://dl.acm.org/doi/10.1145/2908812.2908913 ; https://arxiv.org/abs/1603.03795
- Isaksen, Gopstein, Nealen 2015, "Exploring game space using survival analysis", FDG — https://game.engineering.nyu.edu/projects/exploring-game-space/
- Zook, Fruchter, Riedl 2014, "Automatic playtesting for game parameter tuning via active learning" — https://arxiv.org/abs/1908.01417
- Silva et al. 2019, "Evolving the Hearthstone meta", IEEE CoG — https://arxiv.org/abs/1907.01623
- Hernandez, Denamganaï, Walker 2020, "Metagame autobalancing for competitive multiplayer games" — https://arxiv.org/abs/2006.04419
- DeLaurentis et al. 2021, "Toward automated game balance: a systematic engineering design approach", IEEE CoG — https://ieeexplore.ieee.org/abstract/document/9619032/
- Bergdahl, Gordillo, Tollmar, Gisslén 2020 (EA SEED), "Augmenting automated game testing with deep reinforcement learning" — https://arxiv.org/abs/2103.15819
- Gudmundsson et al. 2018 (King), "Human-like playtesting with deep learning", IEEE CIG — https://ieeexplore.ieee.org/document/8490442/ ; GDC "How King uses AI in Candy Crush" — https://gdcvault.com/play/1023858/How-King-Uses-AI-in
- Ubisoft La Forge, bots for balance/testing — https://www.ubisoft.com/en-us/studio/laforge/news/6cY2C5m3H5RkFAAsiPYpRh/talk-at-cedec-joshua-romoff-talks-about-how-we-can-build-efficient-player-bots-using-deep-reinforcement-learning
- "Where does balance break? Boundary discovery for game balance testing under a finite simulation budget" 2026 — https://arxiv.org/abs/2608.28364
- "RuleSmith: multi-agent LLMs for automated game balancing" 2026 — https://arxiv.org/abs/2602.06232
- Becker, Görlich 2020, "What is game balancing? An examination of concepts", ParadigmPlus — https://journals.itiud.org/index.php/paradigmplus/article/download/7/4
- "Seeding for success: skill and stochasticity in tabletop games" (mirrored seeds) — https://arxiv.org/abs/2503.02686 ; "When does pairing seeds reduce variance?" — https://arxiv.org/abs/2512.24145

Card-cost regression and the vanilla test
- mtgds 2022, "Knowledge and power: estimating adjusted win rate in Magic: the Gathering Limited" — https://mtgds.wordpress.com/2022/02/28/knowledge-and-power-estimating-adjusted-win-rate-in-magic-the-gathering-limited/
- 17Lands, "Using win rate data" — https://blog.17lands.com/posts/using-win-rate-data/ ; win-rate bias notes — https://github.com/mmiotti/17lands-notes/blob/main/WRBIAS.md
- Blizzard, "Developer insights: Arena balance through science" — https://hearthstone.blizzard.com/en-us/blog/22788308/
- "The vanilla test" (Magic) — https://blackdeckwins.tumblr.com/post/129568175299/the-vanilla-test ; Hearthstone vanilla test — https://www.hearthpwn.com/forums/hearthstone-general/general-discussion/235548-the-vanilla-test
- AAIA'2018 "Predicting win-rates of Hearthstone decks" — https://www.researchgate.net/publication/327893488_Predicting_Win-rates_of_Hearthstone_Decks_Models_and_Features_that_Won_AAIA'2018_Data_Mining_Challenge
- Legends of Runeterra thresholds — https://outof.games/news/2184-the-best-decks-by-winrate-and-playrate-in-legends-of-runeterra-riots-meta-snapshot/

Industry win-rate practice
- Riot, "/dev: Champion balance framework" 2019 — https://www.leagueoflegends.com/en-us/news/dev/dev-champion-balance-framework/ ; update — https://www.leagueoflegends.com/en-us/news/dev/dev-balance-framework-update/
- Blizzard Overwatch, "Weekly recall: the balancing act" — https://overwatch.blizzard.com/en-us/news/24214498/weekly-recall-the-balancing-act/ ; "OW2 PvP beta analysis" — https://overwatch.blizzard.com/en-us/news/23787377/overwatch-2-pvp-beta-analysis-how-data-and-community-feedback-inform-game-balance/ ; Season 9 TTK rationale — https://www.dexerto.com/overwatch/overwatch-2-devs-explain-massive-season-9-hp-overhaul-dps-buffs-to-nerf-healing-2521701/
- IceFrog balance philosophy — https://www.sportskeeda.com/esports/the-icefrog-mystery-how-dota-2-s-master-balance-kept-game-engaging-decade
- Riot TFT meta reports — https://www.yardbarker.com/video_games/articles/teamfight_tactics_set_16_monday_meta_report_by_riot_mortdog/s1_17458_43179846
- GDC "Building a sport: the design philosophy of League of Legends" — https://www.gdcvault.com/play/1021851/Building-a-Sport-The-Design
- Riot counterplay — https://www.leagueoflegends.com/en-us/news/dev/quick-gameplay-thoughts-may-14/

Crowd control and diminishing returns
- Warcraft Wiki, "Diminishing returns" — https://warcraft.wiki.gg/wiki/Diminishing_returns ; Maxroll — https://maxroll.gg/wow/resources/crowd-control-diminishing-returns
- League of Legends Wiki, "Tenacity" — https://wiki.leagueoflegends.com/en-us/Tenacity ; "Crowd control" — https://wiki.leagueoflegends.com/en-us/Crowd_control
- Dota 2 Wiki, "Status resistance" — https://dota2.fandom.com/wiki/Status_Resistance
- SMITE 2 Wiki, "Crowd control" — https://wiki.smite2.com/w/Crowd_Control ; Dignitas, "SMITE mechanics: diminishing returns" — https://dignitas.gg/articles/blogs/Smite/9452/smite-mechanics-diminishing-returns
- Heroes of the Storm forum on the absence of DR — https://us.forums.blizzard.com/en/heroes/t/unpopular-opinion-stun-needs-diminishing-return/46117

Time-to-kill, pacing, readability, cooldowns
- Salivity, "Time-to-kill in shooter game development" — https://salivity.github.io/game-development/article/time-to-kill-in-shooter-game-development
- Halopedia, "Time-to-kill" — https://www.halopedia.org/Time-to-kill ; Apex TTK discussion — https://alegends.gg/respawn-discusses-apex-legends-ttk-changes-and-the-rise-of-third-party-encounters/
- Street Fighter round timer — https://streetfighter.fandom.com/wiki/Round_Timer ; round-length discussion — https://steamcommunity.com/app/1364780/discussions/0/4522262398816711206/
- Infil fighting-game glossary, "Hitstop" — https://glossary.infil.net/?t=Hitstop ; CritPoints on hitstop — https://critpoints.net/2017/05/17/hitstophitfreezehitlaghitpausehitshit/
- Red Bull, "Spectating isn't easy" — https://www.redbull.com/my-en/spectating-esports-titles-accessibility
- League Wiki, Ezreal cooldowns — https://wiki.leagueoflegends.com/en-us/Ezreal/LoL ; Overwatch Tracer blink 3 s per charge — https://overwatch.fandom.com/wiki/Tracer ; Genji — https://overwatch.fandom.com/wiki/Genji ; Dota 2 cooldown mechanics — https://liquipedia.net/dota2/Cooldown
- Auto-battler round structure — https://en.wikipedia.org/wiki/Auto_battler
