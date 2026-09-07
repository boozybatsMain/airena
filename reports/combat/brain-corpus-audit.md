# Brain-corpus audit — what the minds in `data/airena.db` actually do

Date: 2026-09-07. Read-only audit; no source file edited, no server or worker pool started.

## 0. Scope and method

- Corpus: all 78 rows of `creature` (62 active = 36 player + 26 library, 16 retired). Every brain model present was covered:
  `google/gemini-3.7-flash:plain` ×29, `opus` ×13, `kit-stub` ×11, `z-ai/glm-5.3-flash:plain` ×5, `z-ai/glm-5.3-flash:think` ×5,
  `рукописный эталон` ×4, `sub:opus:plain` ×4, `sub:fable:plain` ×4, `haiku` ×2, `z-ai/glm-5.3:think` ×1.
- Read in full (59 brains): all 29 gemini, 8 opus (MARK-92, DECK-75, SEAM-70, PRESS-60, SPIRE-08, LINE-17, NEEDLE-42, WEDGE-40),
  all 4 sub:fable, 3 sub:opus, all 5 glm-flash:plain, all 5 glm-flash:think, OSKTUS-86, both haiku, 2 handwritten (CRUSHER/PRISM — the 4 rows are two identical files),
  and the two repo reference brains `brains/kit-stub/gorilla.js`, `brains/kit-stub/octopus.js` (the 11 kit-stub rows are copies of those two).
  The remaining 5 opus and 1 sub:opus rows were covered by the mechanical matrix + match statistics only.
- Mechanical pass over all 78 sources: `reports/combat/brain-corpus-audit-matrix.mjs` → `brain-corpus-audit-matrix.tsv`
  (verbs used, `api.use` argument shapes, perception fields read, event types handled, Cyrillic in `api.say`, literal `dist` comparisons).
- Empirical pass: `reports/combat/brain-corpus-audit-stats.mjs` → `brain-corpus-audit-stats.txt` — the last 150 ladder matches of every creature
  (`match.result_json`: `uses`, `hits`, `misses`, `verbs`, `faults`, `saidLines`, plus `refused` and `miss` reasons from the per-match log).
  "uses/match", "misses", "refused", "win%" below come from that file.
- Sim/prompt facts were checked against `src/core/sim.js`, `src/core/deliver.js`, `src/brain/prompt.js`, `src/brain/prelude.js`, `src/server/adapt.js`,
  `src/skills/compile.js`, `src/skills/registry.js` (line numbers as of audit time; `sim.js` was being edited concurrently by another agent).

Kit naming: creatures with `kit_active=1` (57 rows) fight with their grammar kit under names `k1..k3`; `kit_active=0` (21 rows: all 13 opus, 2 haiku,
gemini BOLIDE/ODIN, glm COURIER/RACE CHECK/SHARK, OSKTUS-86) fight with the §1 fixture (`laser/blink/jump` or `smash/charge/jump`) and were prompted for it.
Everything about the grammar direction (cooldowns ≤3 s, weights, aimed mortar) concerns the 57 kit brains; the 21 fixture brains matter only as a
model-intelligence baseline.

---

## 1. Headline findings

### F1. Not one model-written brain reads `p.self.kit`; every range, speed and cooldown is a literal
- 0 of 63 model-written brains reference `p.self.kit` / `p.enemy.kit`. Only the 11 kit-stub rows and the 4 handwritten rows do (matrix column `readsKit`).
- Average number of literal `dist <op> number` comparisons per brain: gemini 5.0, opus 5.2, sub:fable 8.0, sub:opus 5.8, glm 3.0–3.4.
- Literal projectile speeds: `V.lead(..., 22)` in 9 brains; DRAGONFLY uses `18`, ETCHER `dist / 27`, BLACK KITE `0.437 + dist / 17.861` for a 12 m/s lob.
- Literal enemy-cooldown tables copied from the prompt: THUNDER CLOCKMAKER `ECD = { k1: 10.6, k2: 10.833, k3: 12.4 }`, FOUNDRY FIST `CD = { k1: 11.733, k2: 12.4, k3: 6.333 }`,
  MINE HEDGEHOG `> 10.716`, `> 7.1`, opus `4.033 / 1.3 / 2.8`, SPIRE-08 `CD = { smash: 1.3, charge: 4.033, jump: 2.8 }`.
- Cause is documented in the prompt itself (`src/brain/prompt.js:532` `KIT_IS_NOT_YOURS`, and the comment above it): the paragraph naming `p.self.kit` was added after
  these brains were generated, and none was regenerated. Consequence for the new direction: **when cooldowns drop to ≤3 s and magnitudes are retuned, every one of these
  brains keeps reasoning against 7–16 s cooldowns and old damages; the enemy-cooldown gates (SPIRE-08, FOUNDRY FIST, MINE HEDGEHOG, THUNDER CLOCKMAKER, PRESS-60, LINE-17) become wrong by 3–5×.**

### F2. The adaptation tuner rewrites structural constants, not just thresholds
`src/server/adapt.js:47-60` (`findKnobs`) treats every numeric literal except 0/1/2 as a tunable knob; `twist` (line 88) multiplies it by 0.82/0.94/1.22; a candidate is accepted
at +4 wins of 100 (`MARGIN`, line 38). 11,316 tune attempts, 811 accepted across 47 creatures. Accepted twists traced in the `adaptation` table:
- DRAGONFLY: wall bound `24.4 → 29.768` (arena half is 20 — the −z wall repulsion can never fire), accepted "25 of 96 vs 3".
- RACE CHECK: `18.5 → 22.57` (wall bounce test `Math.abs(nz) > 22.57` never true).
- BARROW WARDEN: `p.tick % 61 → % 74.42` — `tick` is an integer, `=== 0` is now never true → the random strafe flip is dead.
- MINE HEDGEHOG: hp-fraction gate `0.97 → 1.183` (always true); chase clamp `15.58 → 12.776` (x-target clipped on one side).
- OSKTUS-86: clamp `14.188 → 11.634` → movement targets confined to `[-11.634, 18.407]`, asymmetric.
- ICE MAGE: hard-coded obstacle table twisted (`z: -2.46`, `hz: 4.27`, `x: 15.25`) — its own cover geometry is now wrong.
- GEAR HOPPER: loop bound `for (i = 0; i < 14 → 17.861)` with `/14` inside — 18 headings sweeping past 2π.
- VILE SHRIMP: "too close, back away" threshold `21.9 → 20.586` — it retreats at every distance under 20.6 m; the "too far" branch (`dist > 16`) is unreachable.
- SHARK/KILLER WASP/ARRESTER/ICEBREAKER/ICE MAGE: `3.5 → 4.27` (cone reach, wall pads, blink probes — whatever the 3.5 was).
The tuner cannot tell a tactical threshold from an arena coordinate, a loop bound, a modulus, or a physics constant. With ≤3 s cooldowns the "knobs" it should
be turning (cast gates, spacing) are exactly the ones that need re-derivation, and the noise floor (±5 of 100) is larger than MARGIN.

### F3. Dead bodies in the ladder
- `рукописный эталон` (CRUSHER, PRISM active library; ROCKFALL, FIRING retired): filter `if (k.trigger !== 'active') continue;` — the trigger axis was removed, `k.trigger`
  is `undefined`, so **no skill is ever used**. Last 150 matches each: `uses: {}`, damage dealt 0. Lifetime 260/8072 and 506/5776. They played **10,961 ladder matches
  in the last 7 days** as free wins. (`brains/kit-stub/gorilla.js` line ~93 documents exactly this bug being fixed in the stub; the DB copies were never refreshed.)
- glm-flash:think GLASS JELLYFISH (c_2653c932), ARMOR CRAB, ASH MOTH (retired, library): kit-active creatures whose brains call `laser/blink/dash`, `smash/charge/jump`, `blink` —
  every `api.use` is refused `unknown` (`sim.js:697`). 0 wins in 146/454/142 losses. ASH MOTH also calls `api.say` every thought once hp<60 (66 say lines/match).
- SPIRE-08 (opus, active library, 80 wins / 2894 losses, 2% in last 150): laser gate `enCd('smash') > 0.2` where `enCd` returns 0 until the enemy has used the skill in the
  last 1.3 s → laser fires 0.11×/match; 845 µs/think from 20×18 blink-landing probes + 24 kite candidates per thought.
- ASH WOLF (gemini, active library): 11% in last 150, 2018/6314 lifetime — no dodge, no ranged skill, boost-on-cooldown.

### F4. The mortar is never aimed
- `src/core/sim.js:946`: a lob reads its landing distance only from a **single** finite `a` with `b === null`. Across 78 brains there are 146 `api.use(name)` calls,
  **77 with a pair, 0 with a single number** (matrix `useArgs`). No brain in the DB can aim a lob.
- Every lob owner instead passes a *pair* it believes is a target point — absolute coordinates (BARROW SHADE `api.use('k3', aim.x, aim.z)`, BARROW WARDEN, GEAR HOPPER "pt mode",
  ICE MAGE, BILGE CRAB) or a relative vector (GEAR HOPPER "dir mode", THUNDER CLOCKMAKER) — all ignored; the lob lands at the enemy's distance along the caster's facing.
- Measured lob aim-miss rates (last 150 matches): GRAVEDIGGER 237 misses / 560 casts (42%), GEAR HOPPER 227/504 (45%), BLACK KITE 157/451 (35%), BARROW SHADE 155/472 (33%),
  BARROW WARDEN 125/524 (24%), kit-stub ASH/STORM 224/446 and 207/467 (≈47%). Even the balance instrument misses half its mortars.
- GEAR HOPPER's "switch aiming mode after 3 misses" and BARROW SHADE's random lead factor are elaborate logic acting on an argument the engine discards.

### F5. `api.ready` lies during silence and in the air; brains spam refused orders
- `sim.js:725-729`: `ready(name)` checks cooldown, `act === null`, stun, alive — **not silence, not airborne** — while `startSkill` refuses both (`sim.js:896-897`).
  Prompt (`prompt.js:947`) promises "true when api.use(name) would start".
- Consequence in the log: refused `silenced` per 150 matches — THUNDER CLOCKMAKER(opus) k1 154, STONE GOLEM(303e) k3 153, FOUNDRY FIST k1 116, STONE GOLEM(18e2) k1 110,
  BARROW WARDEN k1 102, VILE SHRIMP k2 85, FURNACE 130 total. Every brain that gates on `api.ready` (all but two) re-orders the same skill every thought for 2.2 s of silence.
- `p.self.silenced / blinded / rooted / shield / burning` and `p.enemy.shield / rooted / burning` exist (`sim.js:552-559`, `579-581`) but are **absent from the perception
  list in the prompt** (`prompt.js:795-890`); `refused.reason` list (`prompt.js:886`) omits `'silenced'`. Result: 0 model brains read any status flag; ASH AND ICE invents a root
  detector (`me.speed < 0.1 && (me.vx !== 0 || me.vz !== 0)` — impossible, `speed` is `|v|`).

### F6. The helper text still says nothing flies
`prompt.js:999` (`HELPERS`): "Nothing in this world flies: the beam is instantaneous and the charge is a body, so no skill has a projectile speed to pass here." This is emitted
to every kit brain whose kit contains a 22 m/s bolt or a 12 m/s lob. 15 brains use `V.lead` anyway (having read the speed from the kit table); the sentence contradicts the
kit tables two screens above it.

### F7. Grammar skill cards carry no "aim" line, so brains fire without facing
`skillBlock` (fixture) prints `aim: the beam leaves along your facing AT THE INSTANT IT FIRES`; `kitBlocks` (`prompt.js:733`) prints cooldown/cast/delivery/range/reach/effects
and nothing about heading, turn-rate scaling or the fact that `a,b` are ignored. Brains that order beams/bolts/zones with no heading gate: TOWER (beam+bolt, relies on standing
`faceAt`), HEAVY REACTOR, GRAVEDIGGER, BARROW, BLACK KITE, COLDSNAP (bolt), STONE GOLEM 303e (cone+zone), GLASS JELLYFISH (beam), SEAM-70/LENS-00 (fixture laser).
Measured cover/aim misses on beams fired by brains without a heading gate: SEAM-70 160 cover, OSKTUS-86 119, LENS-00 97+9, VILE SHRIMP 36, TOWER 28+56+26.
`p.enemy.visible` is described as "the same test the beam performs" (`prompt.js:852`) — it is centre-to-centre; the beam starts at the muzzle along the *facing*.

### F8. Language: 54 of 78 brains speak Russian on screen (40 of them active)
Cyrillic in `api.say`: gemini 26/29, kit-stub 11/11, sub:opus 4/4, sub:fable 4/4, handwritten 4/4, glm-think 3/5, glm-plain 2/5. Opus, haiku, OSKTUS say English or nothing.
The "English only" redesign (commit a33aa1c) did not reach the brains; the kit-stub reference itself says `'держи'`, `'горячо'`, `'нечем ответить'`.

### F9. Model-tier shape of the corpus
- Gemini (the bulk of player creatures) writes **stateless** brains: 0/29 use closure state or `api.remember`; 0/29 read `p.events`; ability choice is a fixed priority ladder;
  self-buffs/shields are cast on cooldown (BARROW k3 6.0/match, THUNDERSTRIKE k1 6.1, TOWER k2 5.6, LASER CUTTER k3 5.4, SALT BULL k3 5.5, ASH WOLF k2 5.3).
- Opus (fixture only) writes lane-geometry dodges, intercept iterations, 16–24-direction scored movement with cover bonuses, event-derived enemy cooldowns —
  and pays 6,000–11,000 `api.ray` calls per match; one of them (SPIRE-08) is logically inverted and useless.
- Sub:fable/sub:opus (grammar kits) are the only model brains that combine events + memory + projectile intercept math; all four fable and three sub:opus pass coordinates
  to `api.use` believing skills are point-targeted.
- GLM brains sit near the top of the ladder (STONE GOLEM ×2: 1599 at 60% and 1572 at 71% over their last 150) with the simplest logic: walk in, swing, shield on telegraph. Simple aggression wins under
  7–16 s cooldowns because nothing ranged fires often enough to punish it.

### F10. Time and burn are hard-coded against the current sudden-death clock
`p.t > 28` (BARROW SHADE), `p.t > 26 / > 44` (GLASS WASP), `p.t > 32` (STONE GOLEM), `p.timeLeft < 14 / < 12` (THUNDER CLOCKMAKER), `now > 26` (SPIRE-08, MARK-92 uses `burnStartsIn === 0`).
7 brains read `p.burn`; 1 reads `p.burnStartsIn`; 1 reads `p.timeLeft`. Changing `SUDDEN_DEATH_AT` silently strands the rest.

---

## 2. Per-brain records

Legend — **kit**: `delivery[effects:channel]` ×3 as `k1 k2 k3`; **lit**: hard-coded numbers that mirror kit facts; **lead**: target leading for bolt/lob; **dodge**: what it reacts to;
**cover**: use of `visible`/`los`/`pathTo`/`ray`/obstacles; **select**: how an ability is chosen; **dead**: abilities never or almost never used (empirical uses/match in parentheses);
**API**: wrong or wasteful API use; **status**: reaction to blind/silence/root; **mem**: state across thoughts; **say**: language; **stats**: last-150-match numbers; **win**: last 150.

### 2.1 google/gemini-3.7-flash:plain (29)

**THE RIFT** c_c4eb7da3-a72 — active, 1600, 5324 fights, win 68%. kit `bolt[damage+silence] blink[shield] zone[damage+pull]`. verbs move,moveTo,face,use,ready,say.
lit `dist <= 16.45` bolt, `<= 11.5` zone, band 4.426–10.188 (tuned), blink `dist > 15`. lead `V.lead(...,22)` + heading gate 0.25 rad. dodge: enemy projectiles closing within 10 m → blink
perpendicular; enemy bolt telegraph → blink; enemy zones → walk out. cover: `!visible → moveTo(enemy)` only. select: priority ladder (dodge-blink > engage-blink > bolt > zone).
dead: none (k1 3.2, k2 2.8, k3 3.5). API: fine. status: none. mem: none. say RU. stats: k1 313 hits / 43 cover / 14 aim; k3 zone 1394 ticks. No refused.

**GRAVEDIGGER** c_af623a2f-f7e — active, 1503, win 57%. kit `zone[burn+blind] lob[burn] self[shield+heal]`. lit `<= 13.425`, `<= 16.643`, `hp < max*0.918`, `hpMissing > 30`.
lead: none — lob and zone ordered with no heading gate and no lead. dodge: zones only. cover: `ray` to avoid backing into walls. select: heal when >30 hp missing or threatened; zone; lob.
dead: none by count. API: lob fired at enemy distance with stale facing → **237 aim misses / 560 lob casts (42%)**, 0 damage hits recorded (burn-only). status: none. mem none.
say RU (`p.tick % 74`). refused k3:silenced 55, k1:silenced 12.

**VILE SHRIMP** c_877bf4e7-bf1 — active, 1472, win 48%. kit `dash[damage] beam[damage] self[boost:speed]`. Written for fixture names with index fallbacks
(`me.skills.find(s => s==='laser'||s==='beam') || me.skills[1]`) — mapping matches by luck. lit `dist < 3.69`, `20.508`, `20.586` (tuned), wall test `|z| > 11.285` (tuned).
lead: none. dodge: enemy windup/dash phase → perpendicular chosen by two rays. cover: none. select: boost on cooldown (6.0/match), "defensive dash" when `dist < 3.69` —
**passes an away-direction pair to a dash; the engine ignores it and dashes along the facing, i.e. INTO the enemy** (154 hits: accidental offence). Movement: `dist < 20.586 → back away`
makes the approach branch unreachable. status none. mem none. say RU. refused k2:silenced 85, k3 20.

**ACID CUTTER** c_cdb90c01-ad9 — active, 1460, win 51%. kit `cone[weaken+burn:armor] beam[damage] dash[damage]`. lit `<= 3.25`, dash `3.0–11.786` (dash is 8 m), beam `2.46–28.681`.
gates 0.5/0.35/0.27 rad. lead none. dodge: enemy casting k2/k3 (no telegraph check) → strafe. cover: `!visible → moveTo`. select: priority cone > dash > beam. dead none (1.9/2.7/2.7).
API: fine. status none. mem none. say RU. stats k3 36 aim misses; k1 13 range misses. refused k1:silenced 39.

**MONOCYCLE CUTTER** c_a843173b-ea4 — active, 1451, win 50%. kit `beam[damage] dash[damage] cone[damage+knock]`. lead: manual `enemy + v*0.667` (beam served windup) and `v*0.246` (cone).
gates: cone `<= 4.912` (= true reach) 0.5 rad, dash `3–9.516` 0.25 rad + ray, beam `<= 23.5` 0.3 rad + ray along predicted line. dodge: enemy beam telegraph when enemy heading is within 0.3 rad
of us; enemy dash telegraph <9 m → sidestep (`dodgeDir.y || dodgeDir.z` typo, harmless). cover: `!visible → moveTo`. select: priority cone > dash > beam, all `!me.busy`.
dead none (2.6/2.6/2.0; 291/316/263 hits). say RU. Best-constructed gemini brain. refused silenced 28.

**KILLER WASP** c_280b5a22-908 — active, 1382, win 50%. kit `dash[damage+burn] blink[boost:speed] bolt[damage+weaken:speed]`. lead `V.lead(22)` + `api.los(lead)`. dodge: any enemy telegraph,
dist<5, or fast enemy <11 m → blink chosen among back/left/right rays. cover: `pathTo().points[0]` when far or hidden; ray-deflect movement. lit kite `desiredDist = 16.79`, wall buffer 4.27 (tuned),
dash `3.5–7.803`. select: priority blink > bolt > dash. dead-ish: **k1 dash 0.63/match** — the kite distance keeps it out of dash reach. say RU. refused k2:silenced 42.

**COLDSNAP** c_7ea987df-b0a — active, 1367, win 47%. kit `zone[damage+weaken:speed] bolt[root+weaken:armor] cone[damage]`. lead `V.lead(22)` → `faceAt`; bolt then ordered the same
thought with no heading gate (`dist <= 22`). cone `<= 4.148` 0.8 rad; zone `<= 12` no gate. uses `api.cooldown('k3')` to choose close/kite. dodge: zones; projectiles within 8 m → perpendicular.
cover none. select priority cone > bolt > zone. dead none. API: bolt fired before the turn completes → 22 aim + 42 cover misses. status none. mem none. say RU. refused k3:silenced 68, k1 16.

**ETCHER** c_1eb4e823-708 — active, 1353, win 40%. kit `bolt[burn+weaken:armor] zone[burn+weaken:armor] cone[damage]`. lead: facing by `dist/27` (wrong speed), gate by `V.lead(22)`.
Dead branch: `if (V.dist(myPos, leadK2) <= 10) api.use('k2'); else api.use('k2');`. dodge: zones (weighted push), projectiles (perpendicular distance test). cover none.
select: priority cone > zone > bolt inside `!me.busy`. Positioning wants 1.8–3.0 m (melee) with two ranged skills → bolt 22 cover + 15 aim misses. no say. status none.

**BOLIDE** c_61d1f99d-43f — active, 1331, **kit_active=0** (fixture laser/blink/jump), win 44%. `V.lead(...,0)` (no lead). dodge: smash telegraph <5.3 → jump/blink; charge → sidestep by
`p.tick % 2`, blink in dash phase. laser gate 1.0 rad (loose) → 67 cover misses. Blink escape scans rays over `-1.581..1.2` rad (tuned). Wall margins `-13.448`, `15.58`, `-16.4` (tuned, asymmetric).
say RU. laser 4.1/match 473 hits.

**FURNACE** c_04539cd5-46c — active, 1319, win 47%. kit `dash[burn] cone[damage+burn] zone[burn+weaken:armor]`. facing at `enemy + v*0.461`. zone with `los(castLead)` `<= 8`; cone `<= 3.2` no heading gate;
dash `2.5–9.664` + ray. dodge zones. cover: `pathTo().points[0]` pursuit. select priority zone > cone > dash. say RU. refused **k2 78, k1 21, k3 31 silenced** (130 — highest gemini).

**HEAVY REACTOR** c_86e14a3c-519 — active, 1273, win 46%. kit `zone[root] cone[burn] zone[damage]`. lit `<= 3.564`, `<= 12.019`. No heading gates. select priority root-zone > damage-zone > cone.
dodge zones. cover none. mem none. say RU. k3 zone 1200 ticks; k2 cone 14 range misses. refused k3:silenced 62.

**ASH WOLF** c_255ab41e-6cf — active library, 1270, **win 11%** (2018/6314 lifetime). kit `dash[damage+burn] self[boost:speed] cone[burn+silence]`. boost on cooldown (5.3/match).
cone `<= 3.2` 0.35 rad + los + `!airborne`; dash `3–7.6` ray along heading. No dodge, no ranged. dmg 93 dealt / 153 taken per match. say RU.

**BARROW** c_f9fb473a-187 — active, 1267, win 49%. kit `zone[pull+weaken:speed] zone[damage+root] self[shield]`. shield on cooldown (6.0/match, at full hp). zones ordered at `targetDist <= 16 / 12.005`
with a 0.57 s lead that cannot matter (zone lands along facing at `min(range, dist)`); no heading gate; `!me.busy`. dodge zones (weighted). idealDist 4.708 (tuned). say RU. k2 zone 1949 ticks. refused k1:silenced 48.

**THUNDERSTRIKE** c_e24810eb-c7c — active, 1241, win 44%. kit `self[boost:damage] beam[damage+stun] blink[shield]`. blink perpendicular on enemy k2 telegraph (side by `api.rand`); boost gate `dist <= 31`
(always) → 6.1/match; beam `<= 21.08` 0.3 rad; blink toward/away by hp ratio when hp<70 & dist>10. Burn-aware: runs when ahead. `moveTo` targets clamped to a tuned, asymmetric box (`z -16..13`).
say RU. beam 323 hits / 46 cover. refused k1:silenced 18.

**MANTIS REAPER** c_c764acde-f2f — active library, 1240, win 60%. kit `cone[damage] cone[damage+root] jump[boost:speed]`. jump vs enemy k1/k2 telegraph when enemy faces us & dist ≤3.8 (correct only because
the opponent it was written against had ground deliveries at k1/k2 — indices are baked in); jump also as "mobility" when far (freezes velocity 0.57 s). cones `<= 3.2` 0.45 rad + los. Chase. say RU.

**LASER CUTTER** c_bbf95643-d91 — active, 1232, win 51%. kit `beam[damage] beam[burn] self[boost:range]`. boost on cooldown (5.4/match). beams gate 0.15 rad, `<= 29`. dodge: enemy `phase === 'windup'` →
perpendicular chosen by rays. ray-deflect around obstacles. no say. 350 hits; 45+50 cover misses.

**MERCURY EEL** c_73fc47a4-2d5 — active library, 1230, win 40%. kit `blink[cleanse+boost:speed] bolt[damage+blind] dash[damage]`. `isSafe(pos)` over `p.arena.obstacles` + bounds (good). blink escape vs projectile <5 m,
enemy telegraph <9 m, dist<4.5. dash `3–7.8` 0.25 rad; bolt manual lead `×0.8` 0.3 rad. Kite 9–13; `moveTo(0,0)` near walls. say RU. **bolt 75 aim + 75 cover misses of 468 (32%)**; dash 20 airborne misses.

**TOWER** c_bee0fcba-180 — active library, 1210, win 51%. kit `beam[damage] self[boost:range] bolt[damage+knock]`. boost on cooldown (5.6/match). beam `<= 24`, bolt `<= 18` — **no heading gate, no lead**.
dodge: telegraph → perpendicular flipping every thought (`p.tick % 2`). Kite 12 m by `moveTo` clamped ±18. say RU every 60 ticks (15.9/match). beam 414 hits/28 cover; bolt 310/56 cover/26 aim.

**ASH AND ICE** c_15a339f3-1cd — active, 1205, win 45%. kit `cone[burn+damage] bolt[damage+root] self[cleanse+boost:speed]`. invented root detector (impossible condition). bolt `V.lead(22)` face+fire same thought
`<= 17` + los; cone `<= 3.008` (reach 4.9) → 31 range misses. projectile dodge (<12 m perpendicular). chase to 2.2 m. say RU. refused 50 silenced.

**SALT BULL** c_83089e56-e2f — active library, 1200, win 41%. kit `dash[damage+knock] cone[damage+stun] self[boost:armor]`. boost on cooldown and `return` (skips the attack that thought). cone `<= 3.6` 0.8 rad;
dash `3–7.8` 0.4 rad + ray. no dodge. say RU.

**GRIM HIGHLANDER** c_a6994a7b-c82 — active, 1189, win 50%. kit `dash[damage] cone[weaken:damage] zone[damage+knock]`. name mapping `skills.find(s => s==='charge'||s==='k1')` etc. — calls the zone "jump"
and uses it at 3–10.2 m (works by accident). Empty telegraph handler. cone `<= 3.204` 0.656 rad; dash `2.05–6.121` + ray. zone escape; `pathTo().direct`. say RU 8.9/match. k3 zone 1534 ticks. refused 20 silenced.

**BLACK KITE** c_7c8ffee4-b3b — active, 1181, win 50%. kit `jump[boost:speed] lob[damage+stun] dash[damage]`. lob lead `flightTime = 0.437 + dist/17.861` (tuned; lob is 12 m/s) → faces the lead point but
never passes the distance → **157 aim misses / 451 (35%)**. jump vs enemy k3/dash/windup <10 m, dist<2.87, or enemy stunned & far (as a speed buff). dash `2–7.5` + ray. kite band 8.54–16.669 (tuned). say RU.

**BILGE CRAB** c_b7a28147-337 — active library, 1180, win 69% (5627/1967 lifetime). kit `lob[wall] self[heal+shield] cone[damage]`. heal/shield when hp<max or dist<6 or telegraph (3.8/match). cone `<= 3.3` 0.7 rad.
wall: `api.use('k1', wallTarget.x, wallTarget.z)` absolute pair → ignored; wall lands at enemy distance (90 "aim" misses; wall still spawns). chase. say RU.

**DRAGONFLY** c_e8a4582b-3d4 — active, 1152, win 47%. kit `beam[damage] blink[cleanse] bolt[damage]`. name mapping by `s.includes('1')` → calls the BEAM "cone" and gates it at `dist <= 5.811` (k1 1.7/match);
**k2 blink never called (dead)**. `V.lead(18)` (wrong). wall repulsion bounds `-29.768`, `21.6`, `-24.4` (tuned) → never fires on z. manual obstacle repulsion. say RU.

**SLEDGEHAMMER** c_3aa2bb0f-f14 — active, 1151, win 49%. kit `dash[knock] cone[stun] cone[damage]`. `canHitCone <= 5.632` (reach 4.9) → 29+21 range misses; dash `2.871–13` (8 m) → **98 aim misses / 500**.
`V.lead` for movement with `me.maxSpeed` (one of 3 brains reading it). telegraph → strafe. `if (me.busy) return` before movement. say RU.

**ODIN** c_70986a43-271 — active, **kit_active=0**, win 43%. laser threat by enemy heading dot>0.7 → strafe + jump when `remaining < 0.25`. smash `<= 4.162` 0.9 rad; charge `5.4–19.29` (tuned; dash is 12 m) 0.3 rad.
say RU. charge 40 hits of 155 (74% whiff).

**CHRONOTHUNDER** c_c314eeb0-2b1 — retired, 1195. kit `zone[weaken:speed] beam[damage] bolt[damage+stun]`. projectile/zone/telegraph dodge vectors summed. bolt `V.lead(22)` `faceAt`+`use` in one thought → 54 aim + 59 cover misses.
`pathTo().points[0]`. desired 13.505. 33 µs/think. say RU.

**COLDSNAP (retired)** c_15f84e8a-0fb — 28 fights. kit `cone[damage+root] dash[damage] self[shield]`. shield when dist<12/burn/telegraph; dash ray; cone `<= 3.3`; enemy k1 telegraph <3 → strafe. no say.

**CHRONOMETER** c_3d990e92-7b6 — retired, 1175. kit `zone[weaken+damage:speed] blink[boost:speed] zone[root+damage]`. blink out of zones / gap-close >9.43; zones `<= 13.42 / 16.372` no gate. say RU. zones 1500/2040 ticks.

Gemini common denominators: `faceAt(enemy)` every thought then `use` when ready and in a literal band; no closure state; no `p.events`; comments name "Gorilla"/"Octopus" and
quote the generation-time opponent's body numbers (`// We are faster (6.92 m/s vs 5.8 m/s)`), i.e. the brain is specialised to one opponent and one kit.

### 2.2 opus (13, all fixture `laser/blink/jump` or `smash/charge/jump`, library)

**MARK-92** c_05721d7b-fff — win 24% (rating 1583 from training pairings). try/catch around the whole thought; closure state; enemy cooldown estimates (`4.033`, `1.3`) from `enemyStarted`;
charge lane math (along/cross, time-to-impact → blink when `tti < 0.42`); smash dodge blink/jump by `remaining`; laser gate `angErr < 1.15` (loose) + safety from estimated enemy cds; `bestDir` 16 rays scored
(7938 rays/match); `pathTo` when hidden; `burnStartsIn` awareness. English say. laser 2.9/match, 27 cover. refused laser:silenced 19.

**DECK-75** c_c40e5ef2-c39 — win 47%. Hard-coded `OBS` table (correct values); own `segAABB`; `chargeAim` 4-iteration intercept at 15 m/s; `pickDir` 24 directions with cover bonus and an enemy-turn model
(`2.1 rad/s × laserLeft`); strafe flips on `blocked`/`damaged`; committed-state handling (keeps facing the intercept during charge windup, creeps during smash). English say once.

**SEAM-70** c_04cc9eb0-595 — win 51%. `laneThreat`, `enemyCommitted`, blink candidate scoring, 24-direction movement scored with one ray each (**10,975 rays/match**), `api.rand` jitter after `blocked`.
Laser has **no heading gate** → 160 cover misses (most in corpus).

**PRESS-60** c_4bfb6d5b-6f3 — win 46%. `findCover` (3-point shadow test against the enemy muzzle), `steer` with ray deflection, `chargeIntercept`, smash acceptance widened by `asin(EN_R/pd)` exactly as the prompt
states; `MY_R = 1.25`, `EN_R = 1.0` literals; random strafe flips; 4 English lines.

**SPIRE-08** c_a0ccc3c9-76e — **win 2%**, 80/2894 lifetime. `enCd(s) = max(0, enemyUse[s] + CD[s] - now)` is 0 until the enemy uses the skill; laser gate requires `enCd('smash') > 0.2` → laser 0.11/match.
20 blink directions × 18 landing probes + 24 kite candidates per thought → 845 µs/think. English say.

**LINE-17** c_336cd583-4d0 — win 33%. `pickMoveDir` 14 rays per thought (7447/match); charge lane dodge with `enemyCommitted`; smash jump timed `0.1 < remaining < 0.45`; laser `err < 0.55` + `api.los(aim)`;
opportunistic blink when <4.6 and enemy charge estimated down.

**NEEDLE-42** c_e3d88cca-bb4 — win 50%. `chargeLock` from `enemyCommitted`/`chargeStopped`; 24-candidate blink; 19-ray `bestDir`; laser band 8.6–22; 6072 rays/match; `api.rand` side flips. English say.

**WEDGE-40** c_375283c7-637 — win 42%. `MEM` reset when `p.t` rewinds; `chooseDir` with hide weight and lateral-to-beam weight; `chargeSolution` 4 iterations; smash acceptance `aimAng < 1.55`; punishes laser
with smash/charge. no say.

**GRAIN-50 / SHAFT-50 / BOULDER-42 / RIDGE-50 / SOIL-33** (matrix+stats only): same family; laser 4.0/match (GRAIN), smash 2.6–2.8/match, charge 0.7–1.6/match; `api.cooldown` and `pathTo` used; English say ≤1–5 lines.

Opus commonalities: fixture literals (`4.033`, `1.3`, `15`, `7.5`, obstacle table); no `p.self.kit` (n/a — no kit); jump used only as a smash dodge; heavy `api.ray` budgets.

### 2.3 sub:fable:plain (4, grammar kits)

**BARROW SHADE** c_4109357b-a49 — active, 1196, win 53%. kit `zone[damage+pull] zone[weaken+pull:speed] lob[damage+weaken:speed]`. Predicts incoming lob impact from `pr.x + pr.vx * pr.left`
(only brain reading `.left`), escapes zones, strafes with radial correction. Combo: k2 pull-zone → k3 lob when anchored/slowed/busy; lob aim = lead `T = 0.55 + dist/12` × random 0.55–0.95, passed as
**absolute pair → ignored → 155 aim misses / 472 (33%)**. `lateGame = p.t > 28`. Ability gates literal (`< 11.3`, `< 15.2`, `< 13.786`). mem: closure. say RU.

**GEAR HOPPER** c_998fea28-c41 — active, 1147, win 46%. kit `jump[boost:speed] lob[damage] dash[damage+knock]`. `aimK2` 3-iteration lead ×0.538 + random spread → pair (pt or dir mode) **ignored → 227 aim misses / 504 (45%)**;
the miss-counting mode switch is a no-op. Jump vs enemy dash telegraph with lateral dir via ray (correct use); panic dash away when <3.2 — pair ignored, heading is toward enemy, so it dashes INTO the enemy;
finishing dash at hp≤21. `pickKitePoint` 18 `pathTo` calls per 0.37 s (981/match); loop bound tuned to 17.861. dead-ish: k3 0.67/match, k1 0.59/match. say RU.

**GLASS WASP** c_dc319c88-aee — active library, 1160, win 64%. kit `bolt[damage] beam[damage+knock] self[boost:speed]`. `k1Aim` two-pass lead with remaining wind-up; re-aims during its own wind-up via
`casting.remaining`; `bestCover` over obstacles with `pathTo().dist`; bolt dodge by closest-approach time; hide mode when ahead after 26 s, desperate after 44 s; readiness timestamps derived from `api.cooldown`
transitions (995 calls/match). Beam gate `< 21` (reach 27.6). say RU. Best grammar brain in the corpus by construction.

**THUNDER CLOCKMAKER (fable)** c_a4e2d394-5b4 — retired, 1258, win 54%. kit `zone[weaken+root:speed] beam[damage] bolt[damage+stun]`. `ECD` table typed from the prompt; aims during wind-up; stun→beam combo
via `dealt` event; zone/bolt/beam ordered with relative pairs (ignored, harmless since it also faces); dodge zones/projectiles/telegraph; hide mode with `pathTo` over obstacles (1796/match, 126 µs/think). say RU.

### 2.4 sub:opus:plain (4)

**BARROW WARDEN** c_35e1741f-274 — active, 1396, win 59%. kit `zone[damage+pull] lob[damage+weaken:speed] self[shield+boost:armor]`. `api.remember/recall` for say timer, last enemy cast, strafe sign.
lob `V.lead(12)` → absolute pair ignored → 125 aim misses / 524 (24%). Misreads `boost:armor` as "raises damage taken" → shield only on danger (2.8/match). Zone with lead ×0.6 pair ignored.
`p.tick % 74.42 === 0` never true (tuned) → strafe flips only on `blocked`. `pathTo` routing. burn-aware taunts. say RU. refused k1:silenced 102.

**MINE HEDGEHOG** c_8bb73425-8cd — active, 1244, win 47%. kit `zone[burn+damage] cone[damage+knock] self[shield+cleanse]`. remembers enemy skill times; typed `10.716`/`7.1` enemy cooldowns. Shield gates
`hpFrac < 1.183` (always) / `< 0.988`. cone gate `dist < 6.355` → **102 range misses**. zone `api.use('k1', px, pz)` ignored. chase clamp `x ≤ 12.776` (tuned). `pathTo().direct`. say RU. refused 78 silenced.

**FOUNDRY FIST** c_e4653a50-181 — active library, 1260, win 33%. kit `dash[damage+knock] cone[damage+stun] self[boost:damage]`. `CD` table typed; tracks enemy uses; handles own mid-cast; `steer` ray deflection
(739 rays/match); cone `≤3.05/3.3` 0.65 rad; dash `1.4–7.4` 0.32 rad + ray; boost when nothing else (4.8/match); evades k2 telegraph <5 (back) and k1 <10.5 (side by rays); hold 2.4/4.9 m.
Never looks at own hp (tactics card notes it). say RU. refused **k1:silenced 116**, k3 35.

**THUNDER CLOCKMAKER (opus)** c_c70e1e4a-f8a — retired, 1207, win 42%. kit `zone[weaken+root:speed] beam[damage] beam[damage+stun]` (stats only): k1 zone 1.2/match; refused k1:silenced 154, k3 22, k2 19; 112 µs/think.

### 2.5 z-ai/glm-5.3-flash:plain (5)

**STONE GOLEM** c_303e3387-581 — active, 1599 (#3 ladder), win 60%. kit `cone[damage+knock] zone[damage+root] self[shield+heal]`. Unused `const st = p.casting`; computes `V.lead` and discards it.
shield on enemy k1 windup <6.698 or hp<0.549 & dist<8; cone `d < 3.102` **no heading gate**; zone `2.684–10.832`; hunt after 32 s; zone escape; backs off during enemy k1 windup <3.385. no say.
refused **k3:silenced 153**, k2 23, k1 11.

**STONE GOLEM** c_18e20e72-6bb — active, 1572, **win 71%** (top). kit `cone[damage+knock] dash[damage] dash[damage+stun]`. `api.remember('edash')`, remembers `refused` (never read back). Uses `api.cooldown() <= 0`
instead of `ready` → refused k3:stunned 29. dash gates 0.25 rad + ray; cone 0.738 rad; `pathTo().points[1]`; enemy k1 telegraph <4.5 → random side. say RU. refused k1:silenced 110.

**ICE MAGE** c_ba1bb611-82e — active, 1109, win 43%. kit `bolt[damage+root] lob[wall] zone[root+damage]`. Two obstacle tables, one twisted by tuning; `pointInBlock` unused. bolt `V.lead(22)` + face + 0.4 rad gate then
`api.use('k1', aim.x, aim.z)` (pair ignored). zone `use('k3', lead)` ignored; wall lob at midpoint `use('k2', mid)` ignored → **142 aim misses**. Dodges non-arc projectiles with `dodgeUntil`; `safeSpot` 16 candidates;
orbit flip via `recall`. say RU.

**COURIER** c_cb22b5c1-9ef — active, **kit_active=0**, win 33%. laser 0.287 rad `≤ 20.041`; blink vs charge <9; `wantDist 12.398`; ray probe → `moveTo`; dead code (`cd`, empty smash block). no say.

**RACE CHECK** c_925ab5a2-cf1 — active, **kit_active=0**, win 37%. blink perpendicular vs charge <6.56; jump vs smash <3.496; laser gate **0.079 rad** (too tight) `≤ 30.512`; prefers 19.52 m (edge of reach);
wall bounce `> 22.57` (tuned, never). `st0` closure. no say.

### 2.6 z-ai/glm-5.3-flash:think (5)

**GLASS JELLYFISH** c_b53d1c3d-3d3 — active library, 1200, win 61%. kit `beam[damage] blink[cleanse] bolt[damage]`. mem object via `recall/remember` every thought; blink on `enemyStarted k1` with
`ev.windup <= 0.7` (only brain reading `windup`); blink direction = clamped absolute − self (correct); beam `< 23` **no heading gate**; bolt `V.lead(22)` → pair ignored and **no face toward the lead** →
65 aim + 58 cover misses; `E.busy && d < 9` → sidestep. say RU.

**SHARK** c_2249bd51-8c1 — active, kit_active=0, win 32%. `remember('lastSeen')`; **jumps to dodge the laser** (height is not consulted by the beam — a wasted 0.74 jumps/match); smash `≤ 4.225` 1.2 rad;
charge `4.6–15.8`. no say.

**GLASS JELLYFISH (retired)** c_2653c932-fff — kit `bolt[damage] self[shield+cleanse] dash[boost:speed]`; calls `laser/blink/dash`; `api.move(V.scale(...))` passes an object (ignored). 0 wins / 146.

**ASH MOTH** c_1632796b-2fd — retired; kit `cone[blind] dash[damage] self[boost:speed]`; the only attack call is `api.use('blink', …)` → never uses k1/k2; `api.say` every thought under 60 hp (66/match). 0 wins / 142.

**ARMOR CRAB** c_423a100a-a20 — retired; kit `dash[damage] zone[pull] self[shield+boost:armor]`; calls `smash/charge/jump` → 0 uses in 150 matches, 0 wins / 454; 1283 µs/think.

### 2.7 z-ai/glm-5.3:think (1)

**OSKTUS-86** c_4170a163-701 — active, kit_active=0, win 39%. `enemyCommitted`; blink perpendicular to the charge line; smash dodge blink/jump; laser aimed at `enemy + v * remaining`; 0.35 rad gate;
movement clamp `[-11.634, 18.407]` (tuned from ±14.188) → asymmetric confinement. no say. laser 5.0/match 511 hits / 119 cover.

### 2.8 haiku (2, fixture, library)

**LENS-00** c_ae4bc2aa-d58 — win 43%. laser `api.ready && enemy.visible` — no heading gate, no range gate → 97 cover + 9 aim misses; blink/jump on enemy windup; 70 µs/think for 30 lines.
**HAMMERBACK-00** c_2f990392-e68 — win 41%. charge to interrupt laser; smash `< 5.15`; charge 6–12; `stop()` under 6 m; `if (self.busy) return` before movement.

### 2.9 kit-stub (11 rows = `brains/kit-stub/gorilla.js` ×8, `octopus.js` ×3)

Reads `p.self.kit` and `p.enemy.kit`; `worth()` situational value per atom; jump only when `en.kit[en.casting.skill].kind ∈ {cone, zone, dash}`; handles `blinded`/`silenced`; stance from the skill it intends
to use; `api.use(best, en.x - me.x, en.z - me.z)` (pair, ignored); no heading gate beyond the standing `faceAt`. Ratings 1655/1583/1580/1513/1418 — three of the ladder's top six (ARRESTER 1655, STORM 1583, ICEBREAKER 1580, beside THE RIFT 1600, STONE GOLEM 1599, MARK-92 1583) are stub-piloted.
Empirical: ARRESTER 72% win; cone k1 range misses 40–47/150 (stance `far*0.45 + gap` vs reach); **ASH/STORM lob k3 224 and 207 aim misses / ~450 (≈47%)** — the balance instrument misses half its mortars.
say RU (`держи`, `горячо`, `нечем ответить`, `вижу вчерашний день`).

### 2.10 рукописный эталон (4 rows: CRUSHER, PRISM active library; ROCKFALL, FIRING retired)

Older stub: `if (k.trigger !== 'active') continue;` → no skill ever used (`uses: {}` over 150 matches, 0 damage). 10,961 ladder matches in the last 7 days. say RU.

---

## 3. Intelligence profiles per model (0–10)

| model | aim | dodge | distance | timing | adaptivity | robustness | evidence |
|---|---|---|---|---|---|---|---|
| gemini-3.7-flash:plain (29) | 5 | 4 | 4 | 3 | 1 | 6 | `V.lead(…,22)` in 10/29 with 0.25–0.4 rad gates (THE RIFT, KILLER WASP); 7 fire with no gate (TOWER, HEAVY REACTOR, GRAVEDIGGER). Dodge = "telegraph → perp strafe", zones, some projectile geometry (ETCHER `perpDist < radius+1.2`). Literal bands, several inverted by tuning (VILE SHRIMP `dist < 20.586 → back away`). Buffs/shields on cooldown at full hp (6/match). 0 brains use events or state. 0 faults, but no guards; adaptation-corrupted constants. |
| opus (13, fixture) | 8 | 8 | 7 | 6 | 5 | 6 | `chargeAim` iterations, lead by `casting.remaining` (DECK-75, WEDGE-40); lane math + `enemyCommitted` + scored blink (NEEDLE-42, SEAM-70); 24-direction scoring with cover (`pickDir hideW`); enemy-cd estimates from events; SPIRE-08 gate inverted (0.11 lasers/match, 2% win); 6–11k rays/match; hard-coded `OBS` tables. |
| sub:fable:plain (4) | 6 | 7 | 6 | 6 | 5 | 5 | Iterated leads (`aimK2`, `k1Aim` with wind-up); projectile impact from `pr.left` (BARROW SHADE), closest-approach dodge (GLASS WASP); zone→lob combos, punish windups; miss-driven mode switch (no-op); 126 µs/think, 1796 `pathTo`/match; tuned loop bound. All pass pairs to lob (ignored). |
| sub:opus:plain (4) | 5 | 4 | 5 | 5 | 5 | 5 | `V.lead(12)` for lob but pair ignored (24% miss); MINE HEDGEHOG cone at 6.36 m (102 range misses); shield gating exists; `remember` enemy uses; `tick % 74.42` dead; 100+ refused-while-silenced. |
| glm-5.3-flash:plain (5) | 4 | 4 | 4 | 4 | 3 | 4 | STONE GOLEM 303e no heading gate, unused vars; ICE MAGE lead but pair ignored, twisted obstacle table; COURIER dead code; `cooldown()<=0` instead of `ready` (29 refused:stunned); yet 71%/60% win by walking in. |
| glm-5.3-flash:think (5) | 4 | 4 | 4 | 3 | 3 | 2 | 3/5 brains dead (wrong names, `api.move(object)`); ASH MOTH say spam; SHARK jumps to dodge a beam; GLASS JELLYFISH bolt without facing the lead (65 aim misses). |
| glm-5.3:think (1, fixture) | 6 | 6 | 4 | 5 | 2 | 5 | aim by `remaining`; blink perpendicular to committed charge; asymmetric tuned clamp; no events beyond `enemyCommitted`. |
| haiku (2, fixture) | 3 | 3 | 4 | 3 | 0 | 6 | LENS-00 laser with no heading/range gate (106 misses); 30-line brains, no state. |
| kit-stub (11) | 3 | 5 | 5 | 6 | 0 | 8 | kit-agnostic; situational `worth`; jump only vs ground deliveries via `en.kit`; blinded/silenced handled; no heading gate; lob 47% aim miss; top of ladder anyway. |
| рукописный эталон (4) | 0 | 0 | 3 | 0 | 0 | 0 | never casts. |

---

## 4. Misuses that a FACT in the prompt could have prevented

Each item: the misuse (with offenders and measured cost) → the fact (a statement about the world, not advice).

1. **Pair arguments treated as a target point** for lob/zone/bolt/dash (BARROW SHADE, GEAR HOPPER, BARROW WARDEN, ICE MAGE, BILGE CRAB, MINE HEDGEHOG, THUNDER CLOCKMAKER, GLASS JELLYFISH, kit-stub; VILE SHRIMP/GEAR HOPPER "dash away" dashes into the enemy).
   → FACT: "`api.use(name, a, b)`: only two deliveries read the arguments. blink reads (a, b) as a direction. lob reads a **single** number `a` as the landing distance in metres; if two numbers are given it reads neither. Every other delivery ignores a and b and goes along your heading at the moment its wind-up ends." (`sim.js:946`; `prompt.js:939` currently says "a,b are the direction argument blink takes" and nothing about the others.)
2. **Firing beams/bolts/zones/cones before the body has turned** (TOWER, HEAVY REACTOR, GRAVEDIGGER, BARROW, COLDSNAP, CHRONOTHUNDER, STONE GOLEM 303e, GLASS JELLYFISH, SEAM-70, LENS-00; 100–160 cover/aim misses each).
   → FACT for every grammar card (as `skillBlock` already prints for the fixture): "aim: it leaves along your heading at the instant the wind-up ends, not when ordered; during the wind-up your turn rate is multiplied by `turnScale` (compile.js:161-162 computes `moveScale/turnScale` from wind-up and never prints them), so in a 0.34 s bolt wind-up you can turn at most 0.34 × turnRate × turnScale rad." Also: "`p.enemy.visible` is centre-to-centre; the beam starts `radius + 0.2` m ahead along your heading — `api.ray(sin(heading), cos(heading), reach)` is the beam's own test." (`prompt.js:852` claims they are the same test.)
3. **Ordering skills while silenced or airborne because `api.ready` said yes** (refused:silenced 100–154 per 150 matches for six brains).
   → FACT: "`api.ready` does not consult silence or height. `p.self.silenced` is true while a silence lasts (2.2 s); `p.self.airborne` while you are off the ground; an order given then is refused with reason `'silenced'` / `'airborne'`." Better: make `ready` truthful (`sim.js:729`) and add `'silenced'` to the documented reason list (`prompt.js:886`).
4. **Status flags never read** (0 model brains read `blinded/silenced/rooted/shield/burning`; ASH AND ICE invents an impossible root detector).
   → FACT: list them in the perception block exactly as `perceive` emits them (`sim.js:552-559`, `579-581`): `p.self.blinded .silenced .rooted .shield .burning`, `p.enemy.shield .rooted .burning`; "while blinded, p.enemy is the view from 30 ticks ago".
5. **Wrong or absent projectile lead** (ETCHER `dist/27`, DRAGONFLY `V.lead(18)`, BLACK KITE `dist/17.861`, GRAVEDIGGER/TOWER no lead; 32–45% aim misses).
   → FACT: delete `prompt.js:999` ("Nothing in this world flies") and state: "bolt speed and lob speed are `p.self.kit[name].speed`; a lob spends its wind-up plus `distance / speed` in the air; a body at top speed 5.8 m/s moves (windup + d/speed) × 5.8 m in that time."
6. **Lob ordered at the enemy's current distance while the enemy is moving radially** (every lob owner; 24–47% aim miss).
   → FACT (already half-present at `prompt.js:115` of the rendered prompt): "with no distance argument the lob comes down at the enemy's distance measured when the cast ends, along your heading — a target walking toward or away from you at v moves v × (d/speed) metres before it lands; the splash is r m."
7. **Enemy cooldowns typed as constants** (THUNDER CLOCKMAKER `ECD`, FOUNDRY FIST `CD`, MINE HEDGEHOG `10.716`, opus `4.033/1.3`).
   → FACT: "`p.enemy.kit[name].cooldown` is their live cooldown; it changes when their kit or the world's constants change; `enemyStarted` gives the moment a skill began." Both exist; only the first is stated, in a paragraph brains predate.
8. **Cone ordered beyond reach** (MINE HEDGEHOG `< 6.355`: 102 range misses; SLEDGEHAMMER `< 5.632`: 50; ASH AND ICE `<= 3.008` under-reach; kit-stub stance).
   → FACT is already printed (`reach 4.9 m between centres`); these brains typed a different number or the tuner moved it. The fix is F1 (read `p.self.kit[name].range + p.enemy.radius`), not more prose.
9. **Jump used against a beam** (SHARK 0.74 jumps/match vs laser wind-up; MANTIS REAPER/BLACK KITE jump as a chase buff).
   → FACT exists for the fixture (`height: not consulted`) but the grammar `jump` line names only the three deliveries it dodges. State the complement: "beam, bolt, lob, blink, self and jump are unaffected by height; a jump ordered against them costs the full airborne time with no effect."
10. **Boost/shield on cooldown at full hp** (BARROW, TOWER, THUNDERSTRIKE, LASER CUTTER, SALT BULL, ASH WOLF, VILE SHRIMP: 5–6 casts/match).
    → FACT: "shield absorbs up to 40 for 5 s and then vanishes unspent; boost multiplies a number by 1.35 for 5 s; a second cast while the first is running renews the timer, it does not stack." (`registry.js:381,387` durations are printed but the non-stacking/expiry rule is not.) Note: under ≤3 s cooldowns "on cooldown" becomes 100% uptime and the weight of self atoms must reflect that.
11. **Say spam** (ASH MOTH 66 lines/match, TOWER 16/match).
    → FACT: "a line stays above your body for SAY_SECONDS; each call writes one log line."
12. **Movement targets clamped to invented arena boxes** (`±17`, `±18.6`, `-19..15`, tuned `-11.634..18.407`, `29.768`).
    → FACT exists (`p.arena.half`); brains type it and the tuner twists it. Same fix as F2 (tuner must skip coordinates) — no prose helps a number the tuner rewrites.

---

## 5. Capabilities the brains never (or almost never) used, and why

| capability | brains using it (of 78) | why unused |
|---|---|---|
| `p.self.kit` / `p.enemy.kit` | 15 (all non-model) | paragraph added after generation; brains not regenerated (`prompt.js:532`) |
| lob distance argument `api.use(name, metres)` | 0 | added 04.09; prompt line exists only for lob kits; 0 single-number calls in corpus |
| `p.self.silenced/blinded/rooted/shield/burning`, `p.enemy.shield/rooted/burning` | 0 model, 15 stub | not in the perception list (`prompt.js:795-890`) |
| `refused` reason `'silenced'` | 0 | not in the documented reason list (`prompt.js:886`) |
| `p.arena.projectiles[].left` / `.arc` | 1 / 1 (BARROW SHADE, ICE MAGE) | listed but its use (impact point = `x + vx*left`) is not a stated fact for arcs |
| `p.arena.zones[].left` | 0 | listed; no brain reasons about zone expiry |
| `enemyStarted.windup` | 1 (GLASS JELLYFISH) | listed; models use `casting.telegraph` instead |
| `enemyCommitted` | 5 (opus ×4, OSKTUS) | fixture-only concept (charge); grammar dash has no commit event |
| `missed` event | 4 | GEAR HOPPER acts on it (uselessly); no fact says what a miss reason implies |
| `evaded`, `interruptedEnemy`, `landed`, `burning` events | 0 | no stated consequence |
| `chargeStopped`, `interrupted`, `knockback`, `contact`, `blinked` | 1–2 each | fixture-specific |
| `p.enemy.casting.remaining` | 9 | used by opus/fable/OSKTUS to aim at the end of the wind-up; gemini never |
| `p.enemy.heading` (is the enemy facing me?) | ~8 | MONOCYCLE, MANTIS, ODIN, opus; no fact says cones/beams/dashes leave along the ENEMY's heading |
| `p.self.turnRate` | 0 | printed in body block; the prompt never connects it to wind-up aiming (`turnScale` not printed for grammar skills) |
| `p.enemy.maxSpeed` / `p.self.maxSpeed` | 3 | bodies printed, but no fact links max speed to lead/escape maths |
| `api.pathTo().dist` | 4 | brains use `points[0]` only; "true walking length" is stated but not why it matters |
| `api.los(x,z)` | 14 | used mostly as `los(enemy)` duplicate of `visible` |
| `api.ray` | 29 | opus uses it as a movement sensor (6–11k/match); gemini rarely |
| `api.remember/recall` | 8 | rule 2 says "neither is better"; gemini never persists anything |
| `p.timeLeft`, `p.burnStartsIn` | 1, 1 | burn rule stated once; most brains hard-code seconds |
| `V.lead` | 15 | helper text says nothing flies (`prompt.js:999`) |
| jump as a ground-delivery dodge keyed on `en.kit[en.casting.skill].kind` | 11 stub, 0 model | the prompt states which deliveries pass under a jump but not that `p.enemy.kit[p.enemy.casting.skill].kind` names the incoming one |

---

## 6. Implications for the ≤3 s cooldown / weights direction

1. **Every kit brain in the DB must be regenerated**, not tuned: their cast gates, spacing bands, enemy-cooldown estimates, self-buff cadence and time constants encode 7–16 s cooldowns and the
   04.09-era magnitudes as literals. The kit-stub instrument is the only brain that survives a constants change unchanged.
2. **The tuner (`adapt.js`) must be restricted** to knobs it can identify (or switched off during retuning): with a +4/100 acceptance it has already accepted 811 twists including arena bounds, loop
   bounds, a tick modulus and an obstacle table. Under ≤3 s cooldowns the "reflex" thresholds change meaning again and the walk restarts from corrupted code.
3. **Weights measured with the current instrument under-value aimed deliveries**: the stub misses ~47% of lobs and ~25% of cones on range; a mortar weight derived from that measures the instrument.
   The stub needs (a) a heading gate matching each delivery's aim rule and (b) a single-number lob distance from `V.lead`-style prediction, before per-atom weights are measured.
4. **`api.ready` must include silence and height** (or the prompt must say it doesn't) before frequent cooldowns make silence the dominant control atom: at ≤3 s cooldowns a silenced brain will burn a
   refused order every thought and, with the "last order wins" rule, may also displace its movement/facing reasoning inside the same branch.
5. **Self atoms need duration-aware weights**: brains already cast shield/boost on cooldown; at 3 s cooldown vs 5 s duration that is permanent uptime, so `shield 40/5 s` and `boost 1.35×/5 s` are no longer
   burst tools but stats. The weight of `self[boost:*]` should be measured with the stub casting on cooldown, which is what real brains do.
6. **Prompt facts to add** are in §4 (1–7, 9, 10); the ones that change brain behaviour most, by measured miss counts, are: the `a,b` rule, the aim-along-heading line on every grammar card with `turnScale`,
   the status flags, and the lob distance/flight-time arithmetic.
7. **Dead bodies** (CRUSHER, PRISM; the three retired glm think brains if they are ever un-retired) should be removed from ladder scheduling — 10,961 free-win matches per week distort every rating
   the weights are later validated against.

---

## Appendix A — raw artefacts

- `reports/combat/brain-corpus-audit-matrix.tsv` — one row per brain: verbs, `useArgs` (none/single/pair), literal names, flags for every perception field/event, Cyrillic, literal dist counts.
- `reports/combat/brain-corpus-audit-stats.txt` — per creature over its last 150 ladder matches: win%, avg seconds, faults, say lines, damage dealt/taken, µs/think, uses per match per skill,
  hit counts, miss reasons, refused reasons, verb call counts.
- `reports/combat/brain-corpus-audit-matrix.mjs`, `brain-corpus-audit-stats.mjs` — the scripts (`node <script> <dir-of-dumped-brains>` / `node <script>` from repo root; `node:sqlite`, read-only).

## Appendix B — corpus counts used above

- `api.use` argument shapes: 146 no-argument, 0 single-number, 77 pair.
- `V.lead`: 15 brains (gemini 10, sub:opus 1, glm-plain 2, glm-think 2).
- Handle `p.events`: gemini 0/29; opus 11/13; fable 3/4; sub:opus 4/4; glm-plain 4/5; glm-think 3/5.
- Read `p.arena.projectiles`: 6 gemini, 3 fable, 1 sub:opus, 1 glm; `p.arena.zones`: 10 gemini, 11 stub, 2 fable, 3 sub:opus, 3 glm.
- `api.pathTo`: 4 gemini, 7 opus, 3 fable, 2 sub:opus, 1 glm; `api.ray`: 13 gemini, 9 opus, 3 fable, 1 sub:opus, 3 glm; `api.los`: 10 gemini, 3 opus, 2 fable, 2 glm (17).
- Any cross-thought state (`let`/`const` object beside `think`, or `api.remember`): gemini 0/29; opus 12/13; fable 4/4; sub:opus 4/4; glm 8/10; stub 11/11; haiku 0/2.
- Cyrillic `api.say`: 54/78 (40 active).
- Adaptation: 11,316 `tune` attempts, 811 accepted, 47 creatures; per model accepted — gemini 452, glm-plain 122, kit-stub 62, glm-5.3 53, sub:opus 52, sub:fable 46, glm-think 24.
