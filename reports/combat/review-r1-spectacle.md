# Spectator experience review — round 1 (07.09.2026, 09:05)

**Lens:** a person who opened the app to watch two minds fight. Is a fight legible and exciting? Would I watch another one?
**Score: 58 / 100.** 80 = ship. Verdict: **not yet** — the cadence overhaul landed (a fight is now ~6–8 casts per fighter per 10 s and ends by a killing blow four times in five), but a third of arena sides are broken fixtures that never cast, the mechanics that make a fight look like thinking (immunity, interrupts, absorbed hits, heals, walls) are invisible on screen, the ability copy on the HUD prints numbers the sim does not use, and 86 % of the minds' quips are silently dropped.

Everything below is measured, not guessed. Scripts and raw output live in the session scratchpad (`recon.mjs`, `resim.mjs`, `trace.mjs`, `pbp.txt`, `spectator-showcase.md`); the project's own instrument `reports/combat/spectate.mjs` was run once on the showcase pool.

---

## 0. What is playing right now (and why the stored logs cannot be read as-is)

- `GET /api/session` → `liveMatch` = a showcase broadcast (`training: true`), `constantsVersion c-d6eb49e8` at 08:53; `GET /api/health` → `c-d3c58948` from 08:54:08 onward. **The dev server was restarted at 08:54:08** (`ps`: `node --env-file-if-exists=.env src/server/app.js`), so the 11 285 ladder rows written between 04:38 and 08:54 are an older registry (compiled kits in `match.kits_json` carry damage 22.4 for a fan, stun 0.6 s, root 0.336 s, heal cap 15, shield 9 — pre-v5 numbers). Only the 361 ladder + 39 training rows after 08:54 are the current world. There is no `/api/live` route (`src/server/api.js:244–1433` lists none); the live state is `session.liveMatch`.
- **Stored logs are trimmed**: `src/server/arena-loop.js:297` `keepLog()` keeps every `say`, the first 20 and the last 30 other events. A 34 s fight loses its middle: in `m_ce748155-e00` hp jumps 170 → 38 across a 20 s window that contains only quips. Any "dead stretch" read from `result_json` is an artefact. I therefore **re-simulated** the newest ladder matches on the current tree with their stored seeds, kits, builds and brains (`runMatch`, same helpers as `spectate.mjs`). Outcomes reproduce the DB rows (winner identical, `seconds` = sim + 2.6 s curtain) except for brains that call `rand`/`remember`, whose replay is order-dependent — the timelines below are representative, not bit-exact.

## 1. Headline numbers, current world

Two windows of the 60 newest ladder matches (the ladder plays ~1 match/s, so the window moved between runs), plus the project's spectate instrument on the **showcase pool** — the nine library creatures a visitor can actually be shown (`arena-loop.js:742–800`: tier 1 = library ∧ grammar kit ∧ model brain: MANTIS REAPER, MERCURY EEL, TOWER, SALT BULL, BILGE CRAB, GLASS WASP, ASH WOLF, FOUNDRY FIST, GLASS JELLYFISH; 36 pairs × seeds 1,2 = 72 fights).

| metric | ladder 60 (run A, 09:01) | ladder 60 (run B, 09:05) | showcase pool 72 | contract target (COMBAT.md §3) |
|---|---|---|---|---|
| length median / mean | 13.5 / 17.8 s | 17.8 / 18.7 s | 15.8 / 17.8 s | 20–35 s |
| fights inside 15–30 s | 18/60 | 28/60 | — | — |
| fights under 10 s | 9/60 | 7/60 | min 8.3 s | — |
| casts / fighter / 10 s | 6.73 | 6.07 | 7.59 | ≥ 6 |
| cooldown utilisation | — | — | 60 % | — |
| hit rate (targeted + zone) | — | — | 82 % | 55–80 % |
| reached the 30 s burn | 8/60 (13 %) | 7/60 (12 %) | 9/72 (12.5 %) | ≤ 35 % |
| deaths dealt by the arena | 7/60 (12 %) | 6/60 (10 %) | 7/72 (10 %) | ≤ 20 % |
| ended by a hit | 49/60 | 47/60 | 63/72 | — |
| killing blow, mean / ≥ 12 hp | 27.9 hp / 43 of 49 | 26.3 hp / 41 of 47 | — | — |
| double-KO (both burn, nobody cast) | 5/60 | 2/60 | 0 | — |
| **sides that never cast** | **17 of 120** (30 fixture sides) | **20 of 120** (40 fixture sides) | 0 | dead slots ≤ 2 % |
| lead (hp) never changes hands | 29/60 | 35/60 | — | — |
| lead changes ≥ 3 | 22/60 | 13/60 | — | — |
| both fighters with no act, same tick | 45 % | 47 % | 43 % | ≤ 25 % |
| fighter idle with an ability READY | — | — | 49 % of its ticks | — |
| … idle with the enemy inside a ready shape's reach | — | — | 32 % | — |
| dodges (leap or blink under a hit) | 0.00 / match | 0.08 | 0.00 | ≥ 1 |
| immune refusals / match | 2.68 | 4.07 (80 % are field ticks) | 2.5 | open question |
| interrupts / match | 1.63 | 1.27 | — | — |
| longest stretch with no visible event, p50 / p90 | 2.6 / 10.3 s | 3.0 / 4.6 s | — | — |
| quips / match · Cyrillic share · distinct lines per speaking fighter | 9.8 · 86 % · 1.9 (361 DB rows) | | | |

Reading: the pace targets that the overhaul was about are met (cadence, burn share, arena deaths, killing blows). What is not met is what a spectator feels: 12–15 % of fights are over in under ten seconds, over half are one-way, nobody ever dodges, and one arena side in six is a body that walks for the whole fight.

## 2. Three fights, play by play (re-simulated on the current tree)

### 2a. TOWER vs THUNDERSTRIKE — `m_6e460f38-b12`, seed 949747451 — the good one (32.5 s, kill by hit)

TOWER (gemini-3.7-flash): `beam:damage 24` · `aura:boost ×1.4` · `bolt:damage 20.4 + knock`. THUNDERSTRIKE (sub:opus): `aura:boost` · `beam:damage 20.4 + stun 1 s` · `blink:shield 12`.

- 0.07 both open with a self buff; THUNDERSTRIKE blinks 2.5 m for a shield.
- 2.2 both fire beams at once, both blocked by cover (feed says "blocked by cover" — good).
- 3.1–4.2 TOWER's bolt misses (aim); THUNDERSTRIKE blinks 6.5 m. First 7 s: zero hp lost.
- 7.1 TOWER's beam lands 24; 7.9 bolt lands 20.4 — first exchange, 156 → 135.
- 11.2 THUNDERSTRIKE's beam lands 28.56 **and interrupts TOWER's buff** (feed shows nothing about the interrupt).
- 14.2 THUNDERSTRIKE's beam hits again, **stun refused — immune** (invisible on screen; the spectator sees a beam connect and a stun that doesn't happen).
- 17.2, 23.8 two more 28.56 beams, each interrupting a TOWER cast. Blue 180 → 66. THUNDERSTRIKE is winning on hp: 91 vs 66.
- 25.6–32.5 the turn: TOWER's bolt lands and **interrupts THUNDERSTRIKE's beam three casts in a row** (26.6, 29.4, 32.5) — every one of THUNDERSTRIKE's kill attempts is cut short by a 0.34 s bolt landing inside its 0.65 s wind-up. Shield absorbs 12 of each beam (shown as "12" hits — the feed prints the residual, never "shield took 12").
- 32.5 TOWER wins at 57 hp. Two lead changes, 7 blinks, 6 interrupts, one immune refusal.

Verdict: this is what the founder asked for — a mind aiming through cover, a buff-then-beam rhythm, a comeback decided by interrupt timing. **But the interrupts and the immune refusal, the two things that decided it, never reach the feed or the recap.** A viewer sees hp bars trade and a beam that "did nothing" at 14.2.

### 2b. BARROW vs GRAVEDIGGER — `m_7bd4f367-5df`, seed 91729229 — the pathological one (34.1 s, BARROW dies to the arena at 106 hp… on the other side)

BARROW (gemini): `field:pull + weaken` · `field:damage 5.7/tick + root 0.42 s` · `aura:shield`. GRAVEDIGGER (sub:opus): `field:burn 8.33 + blind 0.6 s` · `mortar:burn 9.8/s` · `aura:shield 10.2 + heal 13.6`.

- 1.7–3.1 BARROW drops root field, GRAVEDIGGER drops blind field. **From 2.6 s on, every tick of both fields is refused — "immune"**: 29 root refusals and 33 blind refusals in one fight, one every half second, because a field re-applies its control on every tick and the target's immunity from the FIRST tick lasts 3 s.
- Whole fight: BARROW hits 29 times for 1.2–5.7 (field ticks), GRAVEDIGGER lands **zero** damage hits — his mortar is interrupted by BARROW's pull field 6 times, his burn field ignites BARROW three times (burn damage is not a `damage` line), he heals 9 times for 4–10.
- 34.07 BARROW burns down in the closing arena at 0 hp while GRAVEDIGGER stands at 90. Lead never changed hands; the "winner" never connected a targeted hit.

Verdict: 62 refusals and 6 interrupts happened and **none of them is drawn or written anywhere**. To a spectator this is two bodies standing in coloured circles for 34 seconds, one slowly losing hp to fire, then the arena finishing it. The 30 s burn did its job (ended a stalemate); the immunity rule did its job (no chain-blind); the *presentation* shows neither.

### 2c. DRAGONFLY vs NEEDLE-42 — `m_3da7ed1c-adb`, seed 689736522 — the fixture fight (27 s)

DRAGONFLY (gemini): `beam` · `blink:cleanse` · `bolt:damage 24`. NEEDLE-42 (legacy "opus" library creature, `kit_active = 0`, fights with the reference skills).

- 2.7–27.0 DRAGONFLY casts its bolt eleven times (every 2.2 s), lands eight for 24 each, misses two (aim) and one (cover). It never touches its beam or blink.
- NEEDLE-42 casts **nothing** for 27 seconds. Both fighters have no act running 81 % of the fight.
- Same pool, `m_39d194c1-793` THUNDERSTRIKE vs SEAM-70: 26 casts against 0, and in the DB row the seed produced a 44 s double-KO (both burn) — one of five such zero-event double-KOs in run A. `m_f7eb9817-dac` PRISM vs RACE CHECK: **41.5 s, zero events, both die to the burn.**

Why (traced with `trace.mjs`): NEEDLE-42's brain is written for `laser`/`blink` (octopus set) but `src/core/config.js:1127` `REFERENCE_TAG_OF_SIDE = { blue: 'octopus', orange: 'gorilla' }` hands a fixture fighter the set **by side**; on orange it perceives `skills: ["smash","charge","jump"]`, `api.ready('laser')` is always false (`sim.js:811`), and it walks. That is why 13 of 23–27 legacy appearances cast nothing — exactly the ones on the "wrong" colour. PRISM/CRUSHER/FIRING/ROCKFALL (`рукописный эталон`, 3/3 zero-cast) fail differently: their DB `brain_source` still gates on `if (k.trigger !== 'active') continue;` while `kitView()` (`sim.js:438–497`) no longer sends `trigger`; the checked-in stub was fixed for this (`brains/kit-stub/gorilla.js:88`), the DB copies were not. These fixtures are excluded from the showcase's first tier (`arena-loop.js:786–791`), but they are one side in **a third of ladder fights** (40 of 120 sides in run B), they appear on the history and ladder screens, and every player's creature fights them.

## 3. The questions, answered

- **Back-and-forth?** Rarely. hp lead never changes hands in 48–58 % of fights; ≥ 3 lead changes in 22–37 %. Where both minds have a grammar kit (showcase pool) fights are closer, but "idle with a ready ability" is 49 % of a fighter's time and 32 % of the time the enemy is inside a ready shape's reach and nothing is thrown (spectate.mjs) — the minds, not the cooldowns, now set the cadence, and they leave 40 % of allowed casts on the table.
- **Controls and dodges visible?** Controls yes: `src/viewer/vfx.js:1929–2012` draws stun/root/blind/silence/shield marks. Dodges effectively do not exist: 0.00–0.08 per fight (target ≥ 1). Blinks (0.6–0.7/fight) are cast as shield carriers, not evasions (THUNDERSTRIKE blinks 0.75–6.5 m eight times, never under a hit). Leap-under-a-hit: 0.03/fight.
- **Do fights end by a decisive hit?** Yes — 78–88 % by a hit, killing blow ≈ 26–28 hp (a full beam or fan). The arena finishes 10–12 %, all of them stalemates like 2b or fixture double-KOs. The 30 s burn is working as designed on the live ladder (12–13 % reach it); the league's 30–60 % is a property of the bake-off's sustain-heavy kits (`Aura: Shield + Heal` on every caster/brawler), not of the ladder.
- **Is 15–30 s a good length?** Yes as a band, and the median (13.5–17.8 s) now sits at its bottom edge or below it; 12–15 % of fights end under 10 s, before the VS card's establishing shot has settled. The contract's 20–35 s target (COMBAT.md §3) is not met from below.
- **Dead stretches?** With full logs the p50 longest gap is 2.6–3.0 s — fine. The long ones (p90 4.6–10.3 s, 4–7 fights ≥ 6 s) are all fixture fights or the burn tail. The real dead time is different: **both fighters have no act 43–47 % of ticks** (target ≤ 25 %) — walking between casts, with cooldowns ready.
- **Immune refusals (~9/game in the league):** on the ladder 2.7–4.1/fight, and 80 % (194 of 244 in run B) are **field ticks**: one root/blind field cast produces up to 5 refusals. Counted per cast, roughly 45 % of control-carrying casts (≈ 100 of 215) land on an immune body. So the league number overstates stupidity (it counts ticks) and understates the design problem (a control field is refused on 4 of its 5 ticks by construction). Judgement: the rule is right; the *field* delivery of a control needs a decision, and the refusal must be visible.

## 4. HUD copy vs the mechanics (`src/skills/describe.js`)

`abilitiesOf()` is the one sentence the tooltip, creature page and reveal show (`src/client/ui/ability.js:902,933`). It reads `EFFECTS[id].mag` raw (`describe.js:119–135`) and ignores the delivery premium and the effect share that `compileKit` applies (`src/skills/compile.js:226–250`). On the current registry:

| ability (real library kit FOUNDRY FIST / synthetic) | HUD says | sim does |
|---|---|---|
| KINETIC LUNGE damage+knock | "Deals 24 damage and knocks back" | 23.46 dmg, 5.1 m/s |
| EMBER FAN damage+stun | "Deals 24 damage and stuns" | **28.56** dmg, stun 1 s → 3 s immunity |
| FROST AURA shield+heal | "Shields 12 and heals up to 16" | **10.2** for 2.5 s, heal cap **13.6** |
| EMBER FAN damage (single) | "Deals 24 damage" | **33.6** |
| ARC FIELD damage | "Deals 24 damage" | 6.72 per tick × 5 ticks |
| FROST FIELD burn+root | "Burns for 7 per second over 3 seconds and roots" | 8.33/s while inside, **1 s** after; root **0.42 s** per tick |
| any stun/root/silence/blind | "stuns" | 1.0 / 1.5 / 1.8 / 2.2 s and a 3 s immunity — never stated |

Heal cap and shield amount are the honest *base* numbers but wrong for any two-effect aura (share 0.85). Immunity — the single rule a spectator most needs to understand why a second stun "did nothing" — is absent from every player-facing sentence. `docs/COMBAT.md` itself disagrees with the registry: line 70 says the mortar's premium is ×1.25 (registry `lob.power: 1.4`, line 137 says ×1.4); line 93 says heal 15 %/5/20, line 137 says 12 %/4–16 (registry: 0.12/4/16).

## 5. What the feed and the recap actually say

Live feed (`src/viewer/main.js`): a line for a hit (`:2423`), a miss with reason (`:2398`, `MISS_RU :3613` — airborne/cover/range/aim) and a quip (`:3702`). **No line for**: an immune refusal, an interrupt, a hit the shield absorbed whole, a shield breaking, a heal, a wall, an ignite, a blink-dodge (`evade` reason `invulnerable` is not in `MISS_RU`). The post-fight recap keeps `say, damage, miss, blink, evade, interrupt, refused, death, chargeMiss, burned, landed` (`src/server/api.js:1636`) — `immune`, `absorbed`, `shieldBroke`, `heal`, `wall`, `ignite` are dropped there too. Quips: 9.8/match, **86 % Cyrillic, blanked by `main.js:3690`**; where English, 1.9 distinct lines per fighter repeated on every cast ("Charging up." × 12).

## 6. Findings

| # | sev | finding | evidence | fix |
|---|---|---|---|---|
| 1 | **high** | A third of arena sides are reference-skill fixtures and half of those never cast; five of 60 fights are 41 s zero-event double-KOs. | run A/B: 17–20 of 120 sides zero-cast; `config.js:1127–1131` assigns the set by colour; DB `рукописный эталон` brains gate on `k.trigger` that `kitView()` no longer sends (`sim.js:438–497`, contrast `brains/kit-stub/gorilla.js:88`). | (a) `referenceTagOf` must come from the creature (store a `reference_tag` per legacy row, inferred from the names its source calls: `laser`→octopus, `smash`→gorilla), never from the side; (b) re-seed the four `рукописный эталон` rows' `brain_source` from `brains/kit-stub/{octopus,gorilla}.js`; (c) add a gate `tools/checkfixtures.mjs`: every active library creature must cast ≥ 3 times against `kit-stub` on both colours. |
| 2 | **high** | The mechanics that decide fights are invisible: immune refusals (2.7–4.1/fight), interrupts (1.3–1.6), absorbed hits, shield breaks, heals, walls never reach the feed, the recap or a VFX. | §2a (three interrupts decide the fight, feed silent), §2b (62 refusals, nothing drawn); `main.js:2398/2423/3613`, `api.js:1636`; `effects.js:109–110` logs `immune` but pushes no `fx`. | Push an `fx` for `immune`, `interrupt`, `absorbed`, `shieldBroke`, `heal`, `wall` from `effects.js`/`sim.js`; draw a 0.4 s "IMMUNE" ring and a snapped cast-bar for interrupts in `vfx.js`; add feed lines ("· stun refused — immune", "· cut short", "· shield took 12", "· heals 10", "· wall") with collapse keys; extend `KEEP` in `beatsFrom` and `beatText` in `history.js:355–370`. |
| 3 | **high** | Control fields refuse themselves: a root/blind field re-applies every tick and is refused on 4 of its 5 ticks by the immunity it just caused; 80 % of all refusals are field ticks. | run B: zone 194 of 244 refusals; §2b 29 + 33 refusals in one fight. | Decide one: a field applies its control once per cast (on first contact) and only damage/burn per tick — or a field's control is refreshed, not re-applied, while the target stands inside. Then count `immune` once per cast in `tools/bakeoff.mjs` and `spectate.mjs` so the league's "9/game" becomes a per-decision number. |
| 4 | **medium** | HUD ability sentences print base numbers the sim never uses (fan 24 vs 33.6, two-effect aura 12/16 vs 10.2/13.6, field "24 damage" for 6.72×5) and never mention control durations or the 3 s immunity. | §4; `describe.js:119–135` reads `EFFECTS[id]` raw; `compile.js:226–250` applies share and power. | `describeAbility()` should describe the **compiled** ability: call `compileKit([skill])` (or accept a compiled def) and print `mag`/`duration` from it; add "for 1 s, then 3 s immune" to stun/root/silence/blind phrases and "for 2.5 s" to shield; fix `docs/COMBAT.md:70,93` to match the registry. Gate: `tools/checkprices.mjs` compares every printed number to the compiled kit. |
| 5 | **medium** | Nobody dodges: 0.00–0.08 dodges per fight against a target of ≥ 1; blinks are shield carriers. | run A/B, showcase spectate "dodges 0 airborne + 0 i-frame". | Not a price problem — a perception/prompt gap: the minds have `enemy.casting` and `iframes` but never time a blink under a wind-up. Add the fact to `prompt.js` (the 0.25 s window vs the 0.34–0.65 s wind-ups already in the cards), and put a `dodge` probe in `checkbehaviour.mjs`; measure again with the bake-off. |
| 6 | **medium** | Fights are short and one-way: median 13.5–17.8 s (target 20–35), 12–15 % under 10 s, lead never changes in 48–58 %. | table §1. | Raise the hp floor (120 → 150) or trim the fan/mortar premium and re-run `atombalance` + `sizebalance --rounds=20`; accept only when `spectate.mjs` on the showcase pool reads median ≥ 18 s and < 10 s fights ≤ 5 %. |
| 7 | **medium** | Minds idle with a ready ability 49 % of the time, 32 % with the enemy in reach; both fighters have no act 43–47 % of ticks (target ≤ 25 %). | showcase spectate; run A/B `both-idle`. | Spectator-side: nothing to draw here — it is mind quality. Add "idle-in-reach" to the bake-off admission probe and reject minds above 30 %; re-forge the library's six gemini creatures with the current prompt. |
| 8 | **low** | Quips: 86 % Cyrillic and blanked, the rest 1.9 distinct lines repeated per cast; the "proof a mind is fighting" is mute or spam. | 361 DB rows; `main.js:3690`; `setSay` pushes every alternation. | Re-forge library brains with the English prompt (or translate the stored quip strings once, server-side); collapse repeated quips with a key in `pushFeed`; cap quips at one per 4 s per fighter in the sim's `say`. |
| 9 | **low** | Stored logs are trimmed to head 20 + tail 30 + quips, so History's "what it thought" and any post-hoc audit cannot see the middle of a 30 s fight. | `arena-loop.js:297`. | Keep the full log (≈ 5–15 KB) or keep every non-repeat event and collapse only consecutive identical `damage` ticks. |

## 7. Score rationale

- Pace and decisiveness: 8/10 — cadence and killing blows are there.
- Legibility of mechanics: 3/10 — the immune/interrupt/shield/heal/wall layer is not on screen; the HUD numbers are wrong.
- Fairness of the show: 4/10 — one arena side in six is a broken fixture; zero-event double-KOs reach the ladder.
- Drama: 4/10 — no dodges, half the fights never change hands, a sixth end before the camera settles.
- Voice: 3/10 — quips blanked or repeated.

Would I watch another one? After TOWER vs THUNDERSTRIKE, yes — but I would not have understood why it ended the way it did. After BARROW vs GRAVEDIGGER or DRAGONFLY vs NEEDLE-42, no. **58.**
