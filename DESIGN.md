# Airena — design contract & build plan

The game is published on GENEX. This file is durable memory: what was asked,
what is being built now, what is still owed.

## Requested outcome (only the player changes it)

**A complete UI/UX redesign** (05.09.2026): every screen, colour, layout and
the client's business logic rebuilt from scratch against the founder's UX
direction and two reference images (a light, airy, glass-surfaced world; the
creature at the centre; LIVE · CREATURE · HISTORY · LADDER). The battle
rendering itself stays. Creature abilities are shown as generated icons with
tooltips, not as text. **Everything a player sees is English.**

The binding contract for the redesign is `docs/REDESIGN.md`. This file only
records decisions and status.

## Working mode

`focused change — combat mechanics & balance overhaul (07.09): fast cooldowns, per-atom weights found by measurement, smarter minds, model bake-off, reviewer loop to 80`

## Requested outcome — combat & balance overhaul (07.09, founder)

The founder's request, in its own terms: people come to WATCH battles between
different LLMs, and the creatures must visibly think — strategies and tactics,
not rushing in and idling on cooldowns. Therefore:

1. Stop balancing through cooldowns. Every ability refreshes fast (about 3 s at
   most). Balance lives in the WEIGHT of each puzzle piece (delivery, effect,
   channel) and in the budget a creature spends on its three abilities.
2. Weights are found by measurement: assemble ability combinations, fight them
   in test battles, see how often each wins, price accordingly. Research how
   others solved this; think it through. Fair, but an unbalanced hand-made set
   is allowed to exist.
3. Abilities must be interesting AND controllable by the mind (a mortar has to
   be aimed; the harder it is to land, the more it pays).
4. The mind prompt explains the world and the tools broadly, never dictates
   tactics — and still the minds must not be dumb.
5. Test the models (cheap ones via OpenRouter within $10; Claude via the
   subscription), watch fights as a real spectator would, and grade the result
   with reviewers on 0–100 metrics; loop until the reviewers give at least 80.
6. Ship the result to the draft (`genex preview`).

- **D186. Cooldown belongs to the delivery (07.09, founder).** No ability waits
  longer than 3 s; the rhythm is a per-delivery constant in the registry (fan
  2.0, bolt 2.2, mortar 2.6, the rest 3.0). Balance moved into WEIGHTS (costs)
  and magnitudes, measured by `tools/atombalance.mjs` on a four-pilot panel
  (`brains/kit-stub` + `brains/pilots/{rusher,kiter,controller}`) and
  re-priced in damped steps until value per point is flat. `docs/COMBAT.md`.
- **D187. The mind aims.** `api.use(name, {x, z})` is a point on the ground:
  mortar and field land on it, blink steps toward it, the rest turn toward it.
  Measured before: 76 of 222 `api.use` calls in the database passed a point as
  a pair and the sim read it as a direction or ignored it.
- **D188. Control leaves immunity by class.** Stun takes `act`+`move`, root
  `move`, silence `act`, blind `sense`; a control cannot land on a class that is
  immune (3 s after the previous one expires). No price fixes a chain.
- **D189. Impacts interrupt, impulses are impulses, sustain is a share.** Stun,
  silence, knock and pull cancel a wind-up over 0.2 s; knock/pull ride the
  knockback slot (2.0 / 2.35 m); a heal is 12% of missing hp (4–16); a shield
  is 12 hp for 2.5 s. Lunge travels (8 m at 20 m/s) and can be leapt over.
  One field per ability and one wall per caster; navigation routes round walls.
- **D190. Budgets 22 / 56 under the measured prices.** 18 would have matched
  the old "third effect is rare" share and broken 18 stored kits; 22 keeps
  every stored ability legal except one (MINE HEDGEHOG's field of burn+damage,
  23) — an over-budget kit falls back to the reference skills at match time,
  which the founder may prefer to a forced rewrite. Body: hp floor 120 at
  14 hp a point, small radius 0.10 m a point (`tools/sizebalance.mjs` on the
  panel: worst body deviation 45 → 16 points). *Corrected in fix round 1:*
  16 points was already over the 12-point gate, so this milestone was
  recorded green on a red instrument; the balance review re-measured it at
  12.5 (small body 37.5 %), and on the pilots as they are now the same axes
  read small 24 %, tanky 70 %. Superseded by D199.
- **D191. The prompt says what the world does, never what to do.** The grammar
  half was rewritten as facts (delivery and effect cards with real numbers,
  "how the pieces interact", the aim verb, the events the grammar emits);
  `checkprompt` re-judged 110 segments with zero tactics; the reference-fixture
  prompt is untouched.
- **D192. OpenRouter has no credit on the founder's key** (652 bought, 652.08
  used; the provider answers 402 for any request over ~49k tokens). The cheap
  bake-off therefore ran on GLM 5.3 Flash and DeepSeek V4 Flash with a 40k
  ceiling (≈ $0.02 spent) and on the provider's free-tier models; Kimi, Qwen,
  Gemini 3.8 and GLM 5.3 could not be bought. Claude Opus, Sonnet and Fable ran
  on the subscription. Rotating and topping up the key is the founder's action.
- **D194. The registry is served to the browser and imports nothing Node-only.**
  An import of `core/config.js` (node:fs) added to `src/skills/registry.js` for
  the tuning overlay took every client screen down ("connecting to the arena"
  forever); the overlay is now applied by the server-only `compile.js`, and a
  new invariant in `tools/test.mjs` refuses such an import.
- **D195. No fourth verb — D160 holds; a dodge is a bought shape or a
  side-step.** The round-1 reviewers measured 0.00 dodges per fight and a
  fixer briefly restored a free universal hop; that contradicts the founder's
  01.09 requirement recorded in D160 ("every creature has exactly three skills,
  the jump only if it chose it as one of them"), so it was reverted the same
  day before any price was measured on it. Instead the dodge metric now counts
  what the founder's design allows: a leap or a blink under a hit, AND a
  side-step (a projectile aimed at a body that moved across its line at more
  than 2 m/s), which every kit can do. The pace target reads "dodges ≥ 1 per
  fight" over that definition; a kit without a leap or a blink is not a defect.
- **D196. A field's control lands once per cast.** Control atoms on a disc
  applied every tick with a duration divided by five, armed a 3 s immunity on
  the first tick and were refused on ticks 2–5 — 72–88 % of every "immune"
  count in the league was a field refusing itself. Now a field's stun/root/
  silence/blind lands once per body per cast with its whole duration; damage
  and burn keep ticking; only a genuine refusal (a different cast) is loud.
- **D197. Prices are read from absolute coefficients, and a pass is done only
  when it converges.** The ridge fit carried the kit's total cost as a feature,
  which is the exact sum of the other columns; the split was arbitrary and the
  proposals oscillated (blink 5→4→5→6). The instrument now fits without it,
  prints value per point and its spread as the headline, and exits 2 with
  NOT CONVERGED while any piece is significantly negative or a price would
  move by more than one point. The share rule counts magnitude-bearing
  effects only, so a control riding a damage cast no longer taxes the damage.
- **D198. The fixture obeys the 3 s rule and fights as its own kind.** Blink 3.9
  → 3.0 s, charge 4.0 → 3.0 s, smash 33.6 at 2.0 s, laser 24 — the reference
  set is the grammar's beam/fan/lunge in disguise; a kitless creature carries
  its own `reference_tag` so the colour no longer decides which set it holds.
- **D199. The body gate is green on a measured axis set, and sustain is a
  smaller share.** (fix round 1, balance lens.) The review's radius re-price
  (0.10 → 0.13 m a point) was measured and rejected: cheaper radius shrinks
  every body that spends on it while the smallest is pinned at its floor —
  small 26 %, even 66 %. Scanned 0.06…0.13 the small body stayed at 15–26 %:
  it cannot buy hp at all, and 120 hp is glass no mobility pays for. What
  turned the gate green (`tools/sizebalance.mjs --rounds=20`: worst 6.9
  points, `--rounds=40`: 7.7, every body inside the 8-point resolution) is
  hp floor 150 at 9 hp a point (top still 300), radius floor 1.0 m (the
  small body is now 28 % narrower than the even one instead of 13 %), and
  turning/jumping at weight 0.35 instead of 0.5 (the agile body read 37–40 %
  at 0.5 with everyone else inside). No stored creature carries a build of
  its own — all 78 fight in the default body, which costs 19.8 of 25 — so no
  stored body is re-priced. Heal is 9 % of the missing hp, cap 12 (was 12 %,
  16): the two-sustain mirror of the review (C vs D) still reaches the burn
  clock in 100 % of fights at 42 s even at shield 9 and heal 7 % / 10, so
  that mirror is a structure, not a magnitude — D's cleanse strips C's only
  harm and D's field is stepped out of — and the shield was left at 12
  because it already read below the mean per point. Burn extends on
  re-application (cap 2×), the wall lasts 5 s and is transparent to its own
  caster's shots, the share rule counts magnitude-bearing effects only
  (D197); measured on the extreme-kit duels: adding a root to a bolt of
  damage now reads 46–48 % against the bare bolt (was 36 %), a fan of burn
  against a fan of damage 28 % (was 29 % — the fan premium multiplies a
  rate the cleanse and the target's own dodge still cap), three bare damage
  abilities against an equal-cost control kit still 100 %. The pricing pass
  on these numbers is `reports/combat/atombalance-panel-r1.md`. — literals beside a
  comparison, never loop bounds, arena clamps or lead speeds (the corpus audit
  found it had rewritten `±17` into `29.768`).

- **D200. Traps are fixed by magnitude, and the ability budget is 24.** The
  v6 pass (07.09, no cost feature) named five pieces a point cannot save at
  the floor of 1: root, knock, weaken, boost, lob. Each got a magnitude, not
  a price: root 1.5 → 2.2 s (longer than a mortar's flight at mid range, so a
  rooted body is a landing spot), knock 6 → 8 m/s (≈ 3.4 m), weaken ×0.65 →
  ×0.5, boost ×1.4 → ×1.6 and 2.8 → 4.0 s, mortar 12 → 18 m/s with a 2.2 m
  splash; with them the lunge wind-up 0.18 → 0.30 s (a body can clear one
  radius, and a stun now cancels it), the field radius 3.0 → 2.6 m and the
  beam wind-up 0.65 → 0.5 s (the most telegraphed shape was the panel's
  favourite dodge). v7 read two traps left (boost, beam) and a per-point
  spread of 1.30 (v5 1.73). The v7 proposal was applied at half damping;
  damage 10 and burn 10 put nine stored damage+burn abilities at 23–27 and
  one stored kit at 59, so the budgets are 28 / 60 (were 22 / 56) rather
  than breaking ten creatures; three 28-point abilities are 84, so the kit
  budget is the one that binds. The panel itself is a stall world (75 % of its fights reach the
  burn clock, four pilots that strafe and kite), unlike the ladder (8 %);
  its prices are read as relative worth, and the ladder's own pace is
  measured separately by `reports/combat/spectate.mjs`.

- **D201. Every body carries 60 more hp; the axis shifts, the budget does
  not.** At the settled prices the ladder six fought a median 12.7 s (target
  20–35) and the minds' cross league 18.6 s: 24 damage every 2–3 s on a
  180 hp body ends a fight in the time the camera takes to settle. The hp
  axis moved from 150…300 (default 180) to 210…360 (default 240) at the
  same 9 hp a point, so every stored body — all of them the default — costs
  exactly what it cost and gains a third more life; the panel prices were
  measured before the shift and are read as relative worth (D200).

- **D202. The gauntlet five and the starter presets were re-picked on the v9
  prices.** `reports/combat/gauntlet/pick.mjs` on the settled world: warden
  (pulling field · cleansing lunge · healing disc), spark (burning knocking
  field · healing blink · turn-boosting beam), pyro (three fires), cutter
  (beam · lunge · knocking fan, the ladder's own top shape) and golem (knocking
  fan · two lunges, one stunning): styles 5/5, two cycles at 20 seeds, best
  worst 50 %, floor 15 %. Baseline bestMin 0.75 / medianMin 0.325. The
  starter presets were re-composed so none reads as a hole or a hammer:
  breaker (fan damage+knock · lunge damage+stun · aura shield+heal) 0 % → even
  37.5 %; saboteur (bolt damage · mortar blind · fan silence) dominant 87.5 %
  → situational; keeper unchanged, situational 25 %.

- **D203. The body facade carries `THREE.TSL`.** The full screen capture of
  07.09 caught a render error on the live fight: TOWER's generated body calls
  `THREE.TSL.abs(n)`, the namespace's own name for the shader language the
  body already receives as `build(THREE, TSL)`'s second argument, and the
  frozen facade had no such key. The facade now carries it (`makeThree(THREE,
  TSL)`); a scan of all 56 active bodies finds no other `THREE.` member the
  facade lacks. `checkfacade`, `checkbody`, `checkbodyrace` green.

- **D204. Round 2 of the reviewer loop, and what it changed.** Scores:
  prompt 90, code 76, balance 73, pace 70, minds 58 (spectacle pending the
  ladder layout fix); `reports/combat/review-r2-*.md`. Acted on the same day:
  the pricing pass v10b on the v9 proposal at half damping with the two floor
  traps and burn moved by magnitude (knock 10 m/s, weaken ×0.4, burn 8 hp/s
  so a fan of fire equals a fan of damage in total); the four gates the
  suite had omitted (`checkkits`, `checktactics`, `checkstale`,
  `checkdescribe`) added to `tools/suite.mjs`; the leap's stale "price 5"
  prose corrected; the 13 remaining kitless library creatures given their
  stored kits (all legal) so the ladder stops carrying the pre-grammar
  fixture crowd; every ladder mind rewritten again on `sub:sonnet:high`
  (the bake-off's corrected league ranks Opus plain near the bottom of the
  Claude family and Fable high at the top — the founder asked to spare
  Fable's daily limit, so Sonnet high is the affordable step up; the command
  for a Fable pass is one flag away: `tools/rethink.mjs --bundle=sub:fable:high
  --force`). Open by design: the hit rate on the ladder six (90 %) and dodges
  (0.03/fight) are mind quality, not mechanics — every kit can side-step and a
  bought leap or blink dodges; the panel is a stall world by construction.

- **D205. The pricing loop stops at v11; the shipped prices are the ones v11
  was played at.** In the 240 hp world (D201) the pilot panel stalls harder
  (83 % of its fights reach the burn clock) and the same pieces read a spread
  of 1.27 (v10b) and 1.30 (v11) against 1.11 in the old world; the largest
  move the instrument still proposes fell 5 → 7 → 3 points. Six pieces read
  as traps in v11 and all six now sit at the floor of 1 (stun, blind, pull,
  boost moved there; wall and vision were there). Not converged by the
  instrument's own rule; the gate ratchets from the first reading of the new
  world (≤ 1.35). Further passes cost twenty minutes of CPU each and no
  tokens — the next round can continue from `reports/combat/
  atombalance-panel-v11.json` with the scratch applier's damping — but the
  remaining traps are all controls that contribute nothing to a fight the
  arena clock decides, so the lever is the panel's world (pilots that finish
  fights), not another price pass.

- **D206. Any creature can be watched from its page.** The founder asked
  (07.09) whether a creature reached from the ladder can be watched. It could
  not: the page offered "Watch live" only to the owner. The creature endpoint
  already sends the creature's last twenty fights and any stored fight replays
  under `#/watch/:id`, so the page now shows "Watch live" for anyone while the
  creature is the broadcast fight (`fightingNow` is sent for every creature)
  and "Watch last fight" otherwise.

## Build plan & status — combat & balance overhaul

Now: **milestone 6 — round 2 of the reviewer loop.** Round 1 scored balance 55,
pace 62, minds 52, prompt 64, spectacle 58, code 68 (`reports/combat/review-r1-*.md`).
The fix round is landed (`reports/combat/fix-r1/*.md`: mechanics, instruments,
pilots, ladder fixtures, prompt, admission gates, viewer; prices v6–v9, D195–D202)
and the ladder minds are being rewritten under the new admission rules; round 2
reviews on four lenses follow, then the gate wall, the preview and the report.

1. ✅ Research and audit (parallel): `reports/combat/{research-balancing,mechanics-audit,
   brain-corpus-audit,prompt-audit,gates-checklist,spectator-baseline*}.md`.
2. ✅ Design the new economy (`docs/COMBAT.md`, numbers to be settled by measurement): per-delivery cooldowns ≤ 3 s, per-atom weights,
   skill/kit budget, magnitudes, CC diminishing returns, aim-point control for
   mortar and field. Written in `docs/COMBAT.md` and in the registry.
3. ✅ Implement (mechanics, prompt, gates; `docs/COMBAT.md` §2 lists every rule) in `src/skills/registry.js`, `src/skills/compile.js`,
   `src/core/{sim,deliver,effects,config}.js`, `src/brain/prompt.js`; update
   every gate that pins the old numbers; keep `npm test` green.
4. ✅ Balance instrument: `tools/atombalance.mjs` (four passes; cost↔value 0.10 → 0.79) — random legal kits, a
   multi-pilot panel, regression of win rate on atoms, iterative re-pricing
   until value-per-point is flat. Report in `reports/combat/`.
5. ✅ Model bake-off: minds from GLM/DeepSeek (OpenRouter, the key had no credit —
   D192) and Claude Opus/Sonnet/Fable (subscription) on the same creatures;
   engagement metrics in `reports/combat/bakeoff/league.md`; prompt facts improved
   from what the minds got wrong (F1–F13, `reports/combat/fix-r1/prompt-handoff.md`).
6. ⏳ Reviewer loop: 0–100 on balance, ability use, mind intelligence,
   spectacle, prompt, code; fix and re-review until ≥ 80 on every metric.
7. ⏳ Preview push (`genex preview`) and the player's draft link.

Modules and parallelism (D182 still binds: agents never start servers or
browsers; leagues run one at a time on the worker pool):

| module | parallel? | why |
|---|---|---|
| research / audits | parallel | read-only, independent |
| registry + compile + sim changes | serial (lead) | one economy, one author |
| balance instrument | serial after 3 | needs the new sim |
| model bake-off | parallel per model | independent LLM calls, one league at the end |
| reviewers | parallel | independent lenses; fixes serial by file |


## Decisions

- **D176. The contract lives in one document.** `docs/REDESIGN.md` fixes the
  palette, type, layout, screen states, component signatures and the server
  fields; screens are built against it, not against each other.
- **D177. English only, no exceptions a player can see.** Server responses,
  stage names, deny reasons, the viewer's HUD strings, generated names, quips
  and tactics cards are English. Legacy rows may still carry Russian text; the
  client hides such strings (`latinOnly`) rather than show them. Legacy
  creature names were renamed in the databases (`tools/anglicize.mjs`).
- **D178. The battle is untouched; its environment is not.** `src/viewer/main.js`
  keeps camera, bodies, VFX and simulation. Its text was translated, one
  `data-cd` hook was added for the cooldown tiles, and the scene's night sky
  became the interface's sky tone — a dark band under a light interface was a
  leftover of the old theme, not a battle decision.
- **D179. The mind is identity, not infrastructure.** Models are shown as the
  creature's mind (provider mark + name, `quick`/`deep`), never as tokens,
  prices, temperatures or provider ids. `tools/checkscope.mjs` forbids that
  vocabulary in the player bundle.
- **D180. Ability icons are generated once and stored.** fal.ai `flux/schnell`
  draws a black-on-white monoline glyph per ability slot; the bytes live in the
  `icon` table and are served from `/api/creature/:id/icon/:slot`. Missing
  icons fall back to a procedural SVG so text never stands in for an icon.
  Names are deterministic (`ELEMENT + DELIVERY`, `src/skills/describe.js`).
- **D181. The viewer's canvas sits under every layer.** It is appended to
  `<body>`; `body > canvas { z-index: -1 }` and a transparent `#arena` keep it
  visible. The HUD is hidden and the viewer pauses under document screens
  (`#screen.doc`).
- **D182. Parallel agents never own the same file, and never own the machine.**
  The first build fan-out (eight agents, each with its own server and headless
  Chrome) exhausted 16 GB of RAM. Agents may run wide (nine reviewers, twelve
  fixers at once) because agents are cheap; browsers are not: agents never
  start servers, and every capture goes through `tools/shots.mjs` /
  `tools/arenashot.mjs`, which hold one machine-wide Chrome lock.
- **D184. Colour is ownership.** Blue is always the player's creature and
  orange always the opponent — on floor telegraphs, rings, plates, damage
  numbers, feed, panels, VS and result cards — and the player's panel is on
  the left, whatever slot the server assigned. Spectators keep slot colours.
  Supersedes REDESIGN.md §2.1's "colours never change with ownership"
  (founder, 06.09; `reports/arena/ARENA-AAA.md` §1).
- **D185. A quiet field in an AAA world.** The field keeps the brief's
  restraint; everything beyond it — full tiers, a deck ring with banners, a
  far pavilion, tower silhouettes in haze, planet and moon, mist, light
  shafts, dust — is built to the concept `reports/arena/aaa/a2.jpg` (with
  `a1.jpg` for the far layer). The renderer owns the picture: the HUD draws no
  full-viewport veil under any beat (founder, 06.09; ARENA-AAA.md §2).
- **D183. The standing is RATING.** One noun for one number, on tiles,
  columns, deltas and the chip alike; `tools/checkscope.mjs` §9.1 rejects MMR
  in player copy. Chosen because it is the word on the UI kit's tile and the
  word a person outside competitive games can read.

## Build plan & status

1. ✅ Contract (`docs/REDESIGN.md`), shell (`index.html`, `app.js`, store,
   tokens, base, components, chrome), fonts (Space Grotesk, Inter), the
   placeholder arena backdrop (`src/client/img/arena.jpg`, generated).
2. ✅ Screens: live (phases, VS, result, away recap, replay), create + mind
   picker, birth (waiting → reveal), creature (3D portrait), history + match
   detail, ladder (creatures · minds · season), worker, fatal.
3. ✅ Server: `rank`, `generation`, `creatures`, `world` in the session;
   `abilities` and `icons` on every creature card and on the `match`
   message; catalog as minds; icon generation, storage and backfill.
4. ✅ English sweep of server, pipeline prompts, viewer HUD strings; gates
   re-pointed (`checkstages`, `checkfaults`, `checkgrammar`, `checkcontrast`,
   `checkscope`, `checkprices`, `checkmodels`, `checkbody`, `checkselectors`).
5. ✅ `node tools/shots.mjs` captures every state (40 captures, clean console).
6. ✅ Review loop to 70: six lenses, two rounds — visual 72 · UX 78 · spec 85 ·
   copy 79 · code 78 · responsive 73.
7. ⏳ Review loop to 90: nine lenses (plus motion, combat legibility, first
   hour), four rounds, every area fixed in parallel. Plateau in the 72–85 band
   (round 4: visual 75 · UX 72 · spec 82 · motion 79 · copy 78 · responsive 82
   · combat 78 · code 72 · first hour 72). The lead then settled the churn by
   hand: vocabulary is RATING (never MMR) everywhere and the scope gate
   enforces it; generated ability glyphs are forced to ink-on-white; a
   generated body that throws at shader time is quarantined to the stock body
   once per match so the arena never blanks; the two first-fight fixtures
   exist. The remaining distance to 90 is mostly the arena picture — item 8.
8. ⏳ Arena redesign (founder, 06.09): four concept renders reviewed by five
   Fable lenses (`reports/arena/CONCEPT-VERDICTS.md`), one build brief
   (`reports/arena/ARENA-BRIEF.md`: "c1's place with c4's discipline") plus
   the founder's final-image requirements (`reports/arena/RENDER-QUALITY.md`).
   Built as `src/viewer/environment.js` on a stand page
   (`src/viewer/arena.html`, `tools/arenashot.mjs`), reviewed by six lenses,
   ported into `src/viewer/main.js` (`reports/arena/PORT-NOTES.md`): sunken
   field, plain cover, coping, notch, full post graph (GTAO, denoise, ACES,
   SMAA), quality tiers (chosen at boot, persisted), an establishing camera
   for the VS and result beats, ownership colour (D184) and the AAA world
   (D185): full tiers, deck ring with banners, pavilion, tower silhouettes,
   planet and moon, mist. Three Opus rounds on the arena: last scores
   engineering 78 · design 75 · ownership 69 · combat 69 · picture 68 ·
   world 58 (the lenses' bars moved every round; the lead stopped the loop
   at diminishing returns). Full gate suite green, build green, 105 UI
   states captured with a clean console.

## What a next pass should decide, not loop on

- **The stadium as a bowl, not a box** (curved tiers) — the single change the
  world lens keeps asking for; a geometry decision for `environment.js`.
- **Value structure of the world**: the picture lives in a 24 L window;
  deeper deck underside and haze bands would give it depth without objects.
- **The VS beat on phones**: one creature or two under the card.
- **A body that throws at shader time** (`.abs` on an undefined node in a
  generated body): now quarantined at runtime; refusing it at forge
  acceptance belongs to `src/server/forge/body.js`.
- **`src/viewer/main.js` has grown to ~7,300 lines** through agent rounds;
  a consolidation pass (governor, eviction, beats, marks) is due before the
  next feature.

## Open commitments

- **Founder actions after the combat overhaul (07.09):** the OpenRouter key has
  no credit (D192) — top it up or rotate it before the next cheap-model bake-off;
  decide what a creature whose stored set no longer fits the ability ceiling
  should show (today MINE HEDGEHOG's field of burn+damage costs 23 of 22 and the
  creature fights with the reference skills until its owner edits the set).
- The public backend at `207.154.234.71` still runs the old world; the draft
  carries the new one. Updating the public version means pulling the source,
  rebuilding with docker compose and re-priced icons are unaffected (the icons
  are per ability, not per number).


- ✅ **Published 07.09.** Backend `/opt/airena` at `207.154.234.71` pulled
  `a33aa1c`, rebuilt with docker compose, migrated to `user_version` 12,
  renamed its 23 creatures to English and drew 21 ability icons (`FAL_KEY`
  added to its `.env`); a backup was taken first (`/data/backup`). Client
  built with `AIRENA_API=https://207.154.234.71.sslip.io`, pushed with
  `genex preview` and made live with `genex promote`:
  https://airena.genex.technology (page https://genex.games/world/airena).
  `genex rollback --yes` returns players to the previous build.
- **The key in git history** (see earlier entries) is still the founder's
  action: rotate at openrouter.ai.
- Legacy brains still quip in Russian inside their source; the feed hides
  those quips. New creatures are asked for English.
- The arena backdrop is a placeholder image to be swapped for the real arena
  render when one exists.
