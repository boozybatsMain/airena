# Review r1 — pace & ability use (07.09.2026)

Reviewer lane: pace and ability use, scored against `docs/COMBAT.md` §3.
Score: **62 / 100** (80 = ship). Verdict: **not ship yet** — the cadence half of
the founder's ask is delivered, the "every cooldown ≤ 3 s" and "hits decide
fights" halves are not delivered everywhere a spectator looks.

Everything below is measured, on the live working tree (HEAD 8699fb6, 10
modified files under `src/`). Four populations, because the contract names two
and the product has two more:

| population | what it is | how measured |
|---|---|---|
| **ladder six** | the six creatures the brief names, 12 pairs × seeds 1,2,3 = 36 fights | `node reports/combat/spectate.mjs --ids c_08afabcb-3de,… --pairs 12 --seeds 1,2,3 --out reports/combat/review-pace.md` → `reports/combat/review-pace.md` (byte-identical to `spectator-v5-prices.md`; same tree) |
| **live ladder** | every ladder fight the dev server played under the current constants (`c-d3c58948`), n = 607 at the last read | `reports/combat/review-r1/ladder-dist3.mjs` over `data/airena.db` (read-only) |
| **minds cross** | 17 admitted bake-off minds (Fable/Opus/Sonnet high, Fable plain, GLM 5.3 Flash, DeepSeek V4 Flash) × every pair × both sides, 272 fights | `reports/combat/review-r1/minds-cross.mjs` |
| **random kits × pilots** | 40 random legal kits (`validateKit`), each vs 2 random others, same pilot both sides, panel stub/rusher/kiter/controller, 320 fights — the population `tools/atombalance.mjs` prices on | `reports/combat/review-r1/panel-random-kits.mjs` (log: `panel-random-kits.log`) |

## 1. Scorecard against §3

| metric | target | ladder six | live ladder (607) | minds cross (272) | random kits × pilots (320) |
|---|---|---|---|---|---|
| median fight length | 20–35 s | **15.3 s** ✗ | **17.4 s** ✗ (62% under 20 s, 29% in band) | 24.3 s ✓ | **35.5 s** ✗ (edge) |
| casts per fighter per 10 s | ≥ 6 | 8.7 ✓ | n/a (stored log is capped, see L4) | 7.6 ✓ | 7.6 ✓ |
| fighter with no ability running | ≤ 55% | 56% ✗ (marginal) | — | 59% ✗ | 58% ✗ |
| … waiting with every ability on cooldown | ≤ 25% | 19% ✓ | — | 15% ✓ | 14% ✓ |
| both fully on cooldown at once | ≤ 25% | 22% ✓ | — | 14% ✓ | 15% ✓ |
| fights reaching the burn | ≤ 35% | 6% ✓ | 14% ✓ | **38%** ✗ (marginal) | **71%** ✗ |
| deaths dealt by the arena | ≤ 20% | 6% ✓ | 6% (+4% double-KO) ✓ | **25%** ✗ | **54%** ✗ |
| hit rate of targeted shapes | 55–80% | **89%** ✗ | — | league.md: 64–86% per mind | — |
| dodges per fight | ≥ 1 | **0.00** ✗ | — | **0.00** ✗ | 0.45 ✗ (rusher 1.01) |
| dead ability slots | ≤ 2% | 0.9% ✓ | — | league.md: 0–20% per mind | **6%** ✗ (kiter 13%) |
| every cooldown ≤ 3 s (founder) | all | ✓ | **✗ 313 of 607 fights (52%) show a 3.9 s or 4.0 s chip** | ✓ | chip number ✓, wall time **4.6 s** under weaken/cooldown ✗ |

What passed, and passed well: the cadence. Cooldown utilisation is 63–76%
per creature, a fighter casts every 1.1–1.3 s, "waiting with everything on
cooldown" fell from 60% to 14–19%, and on the live kitted ladder 86% of fights
end on an opponent's hit, 10% on fire from an ability, 4% on the arena. The
old world was 94% arena. That part of the overhaul is real.

## 2. Findings

### H1. Half of the live ladder still shows cooldowns above 3 s — the reference fixture was never brought under the rule
- `src/core/config.js:929` `blink.cooldown: 3.9`, `:972` `charge.cooldown: 4.0` (also `:943` `smash.cooldown: 1.3` with 35 damage, `:879` `laser` 2.2 s / 27 damage).
- `src/core/sim.js:183` hands `skillsOf(referenceTagOf(side))` to any fighter whose kit is null; `src/server/arena-loop.js:44` (`kitOf`) returns null for every `kit_active = 0` creature. The DB has 21 active kitless creatures (`creature` table, `state='active' AND kit_active=0`), and they are paired normally — `arena-loop.js:750–753` says so in words ("остаются на лестнице и дерутся с игроками").
- Measured: 313 of 607 current-version ladder fights (52%) have a fixture fighter (`ladder-dist3.mjs`: DECK-75 31 fights, PRESS-60 29, MARK-92 24, SOIL-33 23, ODIN 21 …). `src/viewer/main.js:6926` writes `cd.toFixed(1)` straight onto the chip, so the crowd reads "4.0" on the charge tile and "3.9" on the blink tile.
- The fixture is also priced in the old world: smash 35 hp / 1.3 s = 27 hp/s against the grammar fan's 33.6 / 2.0 s = 16.8 hp/s. It does not dominate (fixture side wins 31% of its 268 fixture-vs-kitted fights — the hand-written brains are weak), but it is an unmeasured hand-made set on the public ladder.
- **Fix:** (a) `config.js`: `blink.cooldown` 3.9 → 3.0, `charge.cooldown` 4.0 → 3.0, `jump.cooldown` 2.8 stays; `smash.damage` 35 → 24×1.4 = 33.6 at cooldown 2.0, `laser.damage` 27 → 24 — i.e. copy the registry's numbers so the fixture is the grammar's beam/fan/dash in disguise. (b) Better: at `kitOf` compile a real grammar kit for a kitless creature (`beam:damage | blink:shield | jump:cleanse` for octopus-tag, `cone:damage+knock | dash:damage+stun | jump:cleanse` for gorilla-tag — the same view `fixtureKitView` already presents to the enemy at `sim.js:405–415`) so the fixture disappears from the ladder without touching the six reference brains. (c) Add to `tools/test.mjs`: every `SKILLS[*].cooldown ≤ 3.0` and every compiled delivery cooldown ≤ 3.0.

### H2. Fights on the ladder are too short, and the distribution is bimodal
- Ladder six: median 15.3 s, range 8.3–37.1 s (`review-pace.md`). STONE GOLEM·18e2 (fan:damage+knock, lunge:damage, lunge:damage+stun) kills ARRESTER in 9.8 / 9.4 / 9.5 s and STONE GOLEM·303e in 8.6 / 8.3 / 8.4 s — under ten seconds, three seeds, near-identical.
- Live ladder: median 17.4 s, p25 13.6, p75 23.8; 62% of fights end under 20 s, 29% land in the 20–35 s band.
- The other mode: sustain mirrors stall — minds cross caster+caster median 36.6 s with 77% reaching the burn; brawler+caster 31.7 s / 54%; random kits × pilots median 35.5 s / 71%. Both bake-off sustain kits carry `Aura: shield+heal`: a 12 hp shield every 3 s is 4 hp/s of mitigation against a 16.8 hp/s fan, plus the heal.
- **Fix (two knobs, measured together):** raise the default body from hp 180 to ~210 (`config.js` default build; the hp floor 120 / 14 hp a point from D190 stays) so a burst kit needs ~11 s instead of 9; and cut sustain — `registry.js` shield 12 → 9 hp or 2.5 → 2.0 s, heal cap 16 → 12 — so a sustain mirror cannot out-heal the burn. Re-run `spectate.mjs` (ladder six) and `minds-cross.mjs` after each step; accept when both medians sit in 20–35 s and caster+caster burn share is under 35%.

### H3. Nobody dodges — 0.00 per fight for every LLM mind, and most kits cannot
- `league.md` "dodges/game" is 0.00 for all 28 minds; minds cross 0.00 over 272 fights; ladder six 0 over 36. Only the rusher pilot reaches the target (1.01).
- Cause 1: a dodge is `miss:airborne` or `evade` (`spectate.mjs:280–284`), which needs a leap or a blink in the kit AND a 0.25 s i-frame / 0.55 s air phase overlapping an impact. Five of the six ladder creatures carry neither; the target is unreachable for them by construction. The old world had a universal `jump` (`config.js:1070`, `owner: 'both'`) — the grammar made it a paid slot (leap 5 / blink 6 points).
- Cause 2: a side-step that makes a bolt miss is logged as `miss:aim` and counted as a miss, never as a dodge.
- **Fix:** (a) give every body the hop back as a fourth, free, universal slot (`jump`, 3.0 s, no effects — a body verb, not a kit piece) so every fight can contain a dodge and the prompt can state it as a fact; (b) in `spectate.mjs` and `tools/bakeoff.mjs` count a projectile `miss:aim` whose target had lateral speed > 2 m/s at impact as a side-step; (c) keep the ≥ 1 target only after (a) lands — until then it is measuring kit composition, not minds.

### M1. The population the pricing instrument measures on is decided by the arena, not by hits
- Random legal kits × pilot panel (the second population §3 names, and exactly what `tools/atombalance.mjs` prices on): median 35.5 s, 71% reach the burn, decided by arena 54% / fire 15% / hit 29%, dead slots 6%, dodges 0.45. `atombalance-panel-v5.md:14` agrees: mean match length 34.3 s.
- Consequence: the ridge regression's "value" of a piece is mostly "who leads on hp fraction at 30 s", i.e. sustain and avoidance, not kills — the v4/v5 prices were fitted in a regime the contract says fights must not be in. This is the deeper reason the ladder is bimodal (H2): a burst kit that kills in 9 s and a sustain kit that stalls to 36 s can both look "balanced" to the instrument.
- **Fix:** add burn share and decided-by (hit / fire / arena) to the instrument's health table (`tools/atombalance.mjs` ~447, `health.lengths` is already collected) and print them at the top of every panel report; score a kit's league game by damage margin at the earlier of death or 30 s instead of the final result, or reject sampled kits that carry no damage and no burn atom; re-run one pass and report whether the price vector moves.

### M2. Mind-vs-mind burn share (38%) and arena deaths (25%) miss the contract by a little — and it is the kits, not the minds
- Minds cross: brawler+kiter 18% burn / 54 of 60 by hit; kiter+kiter 40%; brawler+caster 54%; caster+caster 77%, 15 of 30 by the arena. Same minds, different kits — the burn share follows the sustain aura, not the model.
- The league's 30–60% is therefore not "minds are dumb"; it is two of three bake-off creatures holding shield+heal every 3 s. The fix is the sustain half of H2. Judged: **not a mind defect**, a magnitude defect.

### M3. A miss is not possible on a lunge; the ladder hit rate is 89%
- `review-pace.md` per ability: lunge:damage 97% (28/29), lunge:damage+stun **100%** (24/24), fan 87–92%, fields 83–95%, bolt 89–90%. Only the mortar (76%, aim 7) and the fan at range behave like shapes that can be dodged. Target band 55–80%.
- `registry.js:213–219`: dash windup 0.18 s, 8 m at 20 m/s — the opponent has 0.18 s of telegraph and a 1.5 m radius to escape from.
- **Fix:** dash windup 0.18 → 0.30 s (so a 5.8 m/s body can clear one radius), and either shrink the field radius 3.0 → 2.5 m (`registry.js:209`) or make the field's first tick land 0.2 s after placement; re-measure — accept when the ladder six hit rate is ≤ 80% and no single shape is above 92%.

### M4. A weaken on the cooldown channel keeps a 3 s tile on cooldown for 4.6 s
- `src/core/sim.js:2195` counts a cooldown down at `DT × channelMul(f, 'cooldown')`; weaken is ×0.65 for 2.8 s (`registry.js:455`) and re-applies. Measured with `cd-weaken2.mjs` (bolt:weaken/cooldown vs a plain kit, rusher both sides, 6 seeds): a 3 s aura still on cooldown **4.60 s** after the cast; 1587 of 11687 cooling ticks were later than cooldown + 1 tick. The chip's number never exceeds 3.0 (max seen 3.000) — it just counts slower, so the founder's rule breaks invisibly.
- **Fix:** disallow `channel: 'cooldown'` on `weaken` in `validateSkill` (`registry.js:775`; keep `boost:cooldown`), or apply the channel to the STARTING value of the next cooldown clamped to 3.0 s. The first is one line and keeps the promise absolute.

### L1. "Immune refusals ~9 per game" is a metric artefact, not a dumb-mind signal
- Minds cross: 17.0 immune events per match, of which **0.00** come from casts with no damage/burn atom. Every refusal is a control riding a damage cast (THE RIFT's bolt:damage+silence, 117 casts; fields of damage+root/pull) whose damage landed. `effects.js:107–110` refuses only the atom, never the cast.
- The genuine dumb signal is next to it: STONE GOLEM·18e2 asked to cast while silenced 95 times in 9 fights (`review-pace.md`, "refused silenced 95") — a mind that never consults `api.ready`.
- **Fix:** in `tools/bakeoff.mjs` count immune refusals only for casts carrying no damage/burn atom, and add a "refused: silenced/cooldown per game" column to the model table. Leave the immunity rule alone.

### L2. noAct 56–59% against ≤ 55% — marginal, and the actionable number is elsewhere
- Ladder six: noAct 56%, of which idle-with-something-ready 37%, idle with the enemy inside a ready shape's reach 13%; cooldown utilisation 69%. Minds leave 31% of allowed casts unused, mostly repositioning. Not a pace problem for a spectator; a fighter literally standing still is 2%.
- **Fix:** keep the target, and gate on "idle with enemy in reach" ≤ 10% instead (it is the one a viewer notices). No code change.

### L3. A rematch looks identical
- STONE GOLEM·18e2 vs ARRESTER 9.8 / 9.4 / 9.5 s, vs STONE GOLEM·303e 8.6 / 8.3 / 8.4 s across seeds 1–3; the seed barely moves the opening.
- **Fix:** derive the spawn angle and the first-think offset from the seed (`config.js:269` `SPAWN_RADIUS`, spawn placement in `sim.js`), so three seeds are three fights.

### L4. The live ladder cannot be measured from the database
- `src/server/arena-loop.js:297` `keepLog` stores every `say` plus the first 20 and last 30 events; a 17 s fight already has 40–90 `use` lines. Casts per 10 s, misses, dodges and immune counts from `match.result_json` are undercounts (the 4.3–5.9 casts/10 s the DB suggests is an artefact of the cap; the same creatures measure 8.7 in `spectate.mjs`). Length and death cause survive; nothing else does.
- **Fix:** store a per-side summary in `result_json` (`casts, hits, misses, dodges, immune, refused`) computed from the full log before trimming — a dozen integers — so `checkladder.mjs` can gate pace on real fights.

## 3. Answers to the two questions in the brief

**Are fights decided by hits, not by the arena?** On the live kitted ladder, yes: 86% hit, 10% fire (an ability's burn), 4% arena. On the curated ladder six, 33 of 36. Among LLM minds with the bake-off kits, 63% hit / 12% fire / 25% arena — the arena's share is all in sustain mirrors. On the population the pricing instrument uses, **no**: 54% arena. So the answer depends on the kit, which is the point of M1/H2.

**Do cooldown chips ever read above 3 s?** Yes, in two ways. Visibly, on 52% of live ladder fights, because the reference fixture's blink (3.9 s) and charge (4.0 s) were never brought under the rule (H1). Invisibly, under a weaken on the cooldown channel: the chip starts at 3.0 and takes up to 4.6 s to reach zero (M4). For grammar kits without that channel the tile never reads above 3.000 (max over 320 × 2 × 3 slots × every tick).

## 4. Method notes

- All runs single-process: `runMatch` from `src/core/match.js`, kits from `compileKit`, bodies `normalizeBuild`, brains `compileBrain`; no worker pool, no new server, DB opened read-only.
- Random kits: delivery uniform over the nine shapes, 1/2/3 effects at 0.5/0.35/0.15, channel uniform where needed, `validateSkill` + `validateKit`, seed 20260907; the atombalance sampler additionally forces coverage of rare pieces — the numbers above are the unforced draw.
- "Decided by": the loser's `death` tick matched against a `burned` (arena) or `burnedOut` (fire) line within 0.05 s, as in `spectate.mjs`.
- "Cast → ready" (M4): per tick, time since that slot's last `use` while the tile reads > 0; a re-cast resets the clock, so chained casts cannot inflate it.
- Scripts and the raw panel log: `reports/combat/review-r1/`.
