# Prompt audit — `src/brain/prompt.js` against the sim, for grammar kits

Date: 2026-09-07. Auditor: prompt-audit agent (milestone 1, research and audit).

Files read in full: `src/brain/prompt.js` (1174 lines), `src/core/deliver.js`, `src/core/effects.js`, `src/skills/compile.js`, `src/brain/prelude.js`; the relevant regions of `src/core/sim.js` (phases, `kitView`, `rememberEnemy`, `perceive`, `makeApi`, `applyOrders`, `startSkill`, `emit`, `interruptCast`, `damage`, `stepAct`, `moveStep`, `step`), `src/core/config.js` (physics, body axes, zone, airborne constants), `src/skills/registry.js` (tables and budgets), the headers of `tools/checktactics.mjs`, `tools/checkprompt.mjs`, `tools/checkbehaviour.mjs`, `brains/kit-stub/octopus.js`, and `DESIGN.md`'s build plan.

Artifacts produced (all under `reports/combat/`):

| file | what |
|---|---|
| `renderprompt.mjs` | renders `brainPrompt('blue', { own, enemy }, null)` for kit A (lob:damage · zone:burn · blink:cleanse) vs kit B (bolt:damage · cone:damage+knock · self:shield), and the orange side the other way round |
| `prompt-rendered.txt` | the blue prompt as handed to the model, with the compiled kit definitions printed above it |
| `prompt-rendered-orange.txt` | the orange prompt (bolt/cone/self as own kit) |
| `verify-prompt-claims.mjs` | single-process measurements (createWorld + step, stub brains) behind every "the world does X" claim below |
| `verify-prompt-claims.out.txt` | its output |

**The tree moved under the audit.** While this was being written the lead landed, uncommitted, in the working tree: per-delivery cooldowns in the registry (beam 3.0, cone 1.8, bolt 2.2, lob 2.6, zone 3.0, dash 3.0, blink 3.0, self 3.0, jump 2.4), `compile.js` reading `d.cooldown`, the aim-point argument `api.use(name, {x, z})` in `sim.js`/`deliver.js`, one field per ability per caster, blink-toward-point, `interruptCast` reading `defOf` (grammar abilities become interruptible), stun calling `deps.interrupt`, and `immune: 3.0` on stun/root/blind/silence with the immunity check in `effects.js`. `src/brain/prompt.js` is unchanged. Where HEAD and the working tree differ, both are named below as **HEAD** and **WT**. The measurements in `verify-prompt-claims.out.txt` were taken on the working tree at ~04:20 and show the WT behaviour for interrupts (§3, §4 of the output).

---

## 0. The shape of the problem in one paragraph

The prompt has two halves that were written at different times against different worlds. The §1 half (the hardcoded laser/blink/smash/charge/jump cards, `skillBlock`, `prompt.js:351-453`) is meticulous: served timings, muzzle offsets, surface rules, aim-at-strike, interrupt rules, height rules. The grammar half (`kitBlocks`, `DELIVERY_LINE`, `EFFECT_LINE`, `CHANNEL_LINE`, `prompt.js:534-751`) is a set of one-line glosses that never received the same treatment: its timings are one tick wrong for 7 of 9 deliveries, it prints a magnitude for exactly one of the 14 effects, it never states that aim is read at the strike, never gives the cone's angle, never gives the blink's invulnerability, never names the fields `p.self.blinded/silenced/rooted/shield/burning` that its own effect lines refer to, and the "nothing flies" paragraph in HELPERS is simply false for a bolt (22 m/s) or a lob (12 m/s). Every creature a player owns is prompted from the grammar half. The DB shows the result: of 78 kitted brains, 0 read `splash` or `halfAngle`, 0 pass a distance to a lob, 15 use `V.lead` in spite of being told there is nothing to lead, and only the 15 hand-written/stub brains read `blinded` or `silenced`.

---

## 1. Statements that are FALSE or misleading for grammar kits

Each item: where it is emitted, what it says, what the world does, evidence.

### 1.1 "Nothing in this world flies … no skill has a projectile speed to pass here" — FALSE
`prompt.js:972-978` (HELPERS, `V.lead`). Two of nine deliveries are projectiles: bolt at `speed: 22` (`registry.js:118`, compiled at `compile.js` into `def.speed`), lob at `speed: 12` (`registry.js:124`). `V.lead` (`prelude.js:40-58`) is the closed-form intercept for exactly these. The line is inherited from the §1 world and is printed to every grammar creature. Evidence: `prompt-rendered.txt` line 373 next to a kit card that says `speed 22 m/s` (line 174).

### 1.2 "Every duration in the tables below is the served one, so what you are told is what the world runs" — FALSE for kit cards
`prompt.js:223-226` (world section). `kitBlocks` (`prompt.js:715-717`) formats wind-up and recovery through `servedCountdown`, the countdown accumulator, not through the phase clock (`phaseClock`/`served`, `prompt.js:106-137`) that the docstring at `prompt.js:71-101` explains is the only correct one for phases. Two errors compound: (a) `servedCountdown` counts one extra tick whenever the duration is an exact multiple of a tick (float residue: 0.5 s → 16 ticks), and (b) the carry from the wind-up into the recovery is ignored. Measured (`verify-prompt-claims.out.txt` §1, phase-time semantics of `stepAct`):

| delivery | prompt says wind-up / recovery | world serves | wrong by |
|---|---|---|---|
| beam | 0.667 / 0.133 | 0.667 / 0.100 | recovery +1 tick |
| cone | 0.300 / 0.300 | 0.300 / 0.267 | recovery +1 tick |
| bolt | 0.367 / 0.167 | 0.367 / 0.133 | recovery +1 tick |
| lob | 0.533 / 0.233 | 0.500 / 0.200 | BOTH +1 tick |
| zone | 0.467 / 0.267 | 0.467 / 0.233 | recovery +1 tick |
| dash | 0.200 / 0.267 | 0.200 / 0.267 | ok |
| blink | — / 0.200 | — / 0.167 (5 busy ticks after the order tick) | recovery +1 tick |
| self | 0.333 / 0.200 | 0.300 / 0.200 | wind-up +1 tick |
| jump | 0.067 / 0.167, airborne 0.567 | 0.067 / 0.167 / 0.567 | ok |

0.033 s is 7 % of a lob wind-up and 11 % of a cone wind-up — the exact class of error the file's own docstring (`prompt.js:89-93`) says `checkbehaviour` was built to catch; `checkbehaviour.mjs` only checks the reach line for grammar kits (`tools/checkbehaviour.mjs:403-480`), not the cast line. The kit card is also outside `checkprompt`'s traced guarantee: `kitBlocks` uses `n()` not `q()` (`prompt.js:715-746`) and `tracePrompt` renders without kits (`prompt.js:1135-1147`), so no gate sees these numbers at all.

### 1.3 `api.use(name, a, b)` for a lob — the pair is a trap
`prompt.js:894-899, 916-917`: "a,b are the direction argument blink takes. For a lob, a is instead the DISTANCE in metres". The sim (`sim.js:~910`, HEAD and WT) reads `a` as the distance ONLY when `b` is null: `reach = (s.kind === 'lob' && Number.isFinite(a) && b === null) ? a : null`. `api.use('k1', 10, 0)` lands at the enemy's distance, not at 10 m (`verify` §2: `(10)` → 10 m, `(10, 0)` → 14 m, `(3, 4)` → 14 m). The prompt never says the pair form disables the distance. DB: 76 of 222 `api.use` calls in kitted brains pass a pair; 0 pass a single number; every mortar in the database has therefore always landed on the enemy's distance along the caster's facing with any lead thrown away — which is what the lead's WT comment in `sim.js` (`makeApi.use`) also reports. **WT** adds `api.use(name, {x, z})`; the prompt does not describe it yet.

### 1.4 Lob: "WHERE it lands is yours to name" — only the distance is; the bearing is your facing at the strike
`prompt.js:569`. HEAD: `deliver.js:225` — `dirOf(me.heading)` at resolve time; the requested number is a distance along the facing the body has when the wind-up ends. Not stated anywhere in the kit card (the hardcoded laser card has an `aim` line, `prompt.js:386`; the grammar cards have none). **WT**: with an aim point the mortar flies toward the point regardless of facing (`deliver.js` `aimDir`); without one, still along the facing.

### 1.5 Aim is read at the strike for every targeted grammar delivery — never stated
`skillBlock` says it for laser and smash (`prompt.js:386, 430`); `kitBlocks` says nothing. `resolveStrike` (`sim.js:1044-1054`) reads `me.heading` at the end of the wind-up for beam, cone, bolt, lob, zone, dash (`deliver.js:161, 180, 225, 295, 331`). Measured (`verify` §11): a bolt ordered while facing +X with `faceAt` on an enemy at +Z left along +Z — 90° of turning happened inside the 0.34 s wind-up (turn rate 7.5 × turnScale 0.796 gives 2.03 rad). A mind that believes the shot goes where it was pointing when it ordered is wrong in both directions.

### 1.6 "a wedge ahead of you, close in" — no angle, and the widening rule of the hardcoded smash does NOT apply
`DELIVERY_LINE.cone`, `prompt.js:536`; `kitBlocks` prints `range` but not `halfAngle` (`prompt.js:719-727`, no `halfAngle` branch). The compiled cone has `halfAngle: 0.96` rad = 55° each side (`registry.js:109`). `deliver.js:192-195` tests `acos(dot) <= halfAngle` against the target's CENTRE — unlike the hardcoded smash's `inCone`, which widens by `asin(r/d)` (documented at `prompt.js:409-429`). So a grammar cone is narrower than a reader of the smash card would assume, and its angle is never printed. `kitView` does expose `halfAngle` (`sim.js:~405`); 0 of 78 brains read it.

### 1.7 "blink — you are somewhere else immediately, untouchable while you move" — the invulnerability is a duration, and it is never printed
`DELIVERY_LINE.blink`, `prompt.js:572`. `deliver.js:369`: `me.iframes = max(iframes, def.iframes)` = 0.28 s (served 0.3) FROM LANDING, not "while you move" (the move is one tick). `kitBlocks` prints `distance` only; `kitView` does not carry `iframes` at all (`sim.js:kitView`), so the number is unreachable from perception too. Also undisclosed: velocity is cut to 30 % on arrival (`deliver.js:370`), and the landing is pulled back along the line until clear of blocks (`sim.js:1184-1200`; stated only on the hardcoded card, `prompt.js:403`).

### 1.8 "dash — you travel forward" — it is an instantaneous translation at the end of the wind-up
`DELIVERY_LINE.dash`, `prompt.js:571`. `deliver.js:330-361`: the hit test is a segment/circle test and `me.x += ux * travel` happens in the same call — the body teleports up to 8 m on the strike tick. There is no `dash` phase for grammar (`phasesOfDef`, `sim.js:80-101`, has only windup/recover). Perception clamps the reported velocity (`sim.js:~2035`), so the enemy sees a jump in position with no velocity to lead. The hardcoded charge card describes a 0.8 s dash at a speed; a reader generalises that wrongly.

### 1.9 "stun — the target cannot act at all while it lasts"
`EFFECT_LINE.stun`, `prompt.js:582`. **HEAD**: a cast already in its wind-up when the stun lands is NOT cancelled — nothing sets `act = null` except `interruptCast` (only reachable from the hardcoded smash/charge, `sim.js:1133, 1531`) and phase end (`sim.js:1416`); `stepAct` ignores `stun`. So under HEAD a stunned mind could not move or turn or start anything, but its running cast still landed. **WT**: `effects.js` stun calls `deps.interrupt` and `interruptCast` reads `defOf`, so a stun now cancels a wind-up longer than 0.2 s (`compile.js:153`, `interruptible: d.windup > 0.2`) and the cooldown is spent (`verify` §4: the lob mid-wind-up never fired). Either way the line is incomplete: it should say what a stun does to a cast in progress.

### 1.10 "knock — pushes what it hits away from you" (and pull) — no magnitude, wrong physics implied by the neighbouring card
`EFFECT_LINE.knock/pull`, `prompt.js:580-581`. `effects.js` knock/pull add `mag × 4` m/s to `to.vx/vz` — the CONTROL velocity — not to the knockback slot `kx/kz` that the hardcoded smash/charge use and that the smash card describes as "decaying at 9 m/s²" (`prompt.js:431`). The grammar impulse is drained by the target's own `accel` (24 m/s² by default) toward its desired velocity, or by `BRAKE_ACCEL` 30 when it has no move order (`sim.js:moveStep`). Measured (`verify` §3): a cone:knock (mag 4.08 after the cone's ×1.7 power) puts 15.3 m/s into `vz`, `kz` stays 0, a stationary default body travels 4.17 m. The mind is told neither the speed nor the distance, and no event is emitted for it (the `knockback` event at `sim.js:1532` fires only from the hardcoded charge).

### 1.11 "blind — … it is told that it is blinded" — told in a field the prompt never names
`EFFECT_LINE.blind`, `prompt.js:587`. The field is `p.self.blinded` (`sim.js:perceive`), absent from the perception section (`prompt.js:800-818`). Same for `silenced`, `rooted`, `shield`, `burning` on `p.self`, and `shield`, `rooted`, `burning` on `p.enemy`. DB: only the 15 stub/hand-written brains reference `blinded`; 0 model-written ones. Also unstated: the lag is `BLIND_LAG_TICKS` 30 = 1.0 s (`effects.js:25`, `sim.js:rememberEnemy`); it applies to the WHOLE enemy block including `dist` and `visible`; and it ramps up over the first second because the buffer serves the oldest thought it has (`verify` §7: first blinded thought 0.33 s old, steady state 1.0 s).

### 1.12 `CHANNEL_LINE.armor = 'damage taken'` under "boost multiplies one of your own numbers UP" — inverted
`prompt.js:590-597`. `sim.js:damage`: `amount /= max(0.25, channelMul(dst, 'armor'))`. A boost on armor (×1.35) means taking 74 % damage; a weaken on armor (×0.7) means taking 143 %. Read literally, the prompt says a boost on armor multiplies damage taken up.

### 1.13 `CHANNEL_LINE.vision = 'how far perception reaches'` — perception has no range
`prompt.js:597`. `sim.js:rememberEnemy`: boost on vision → `visible` is forced true (cover no longer hides); weaken on vision → the enemy block lags by `round(15 × (1 − mul))` thoughts. Neither is "how far".

### 1.14 Boost/weaken magnitudes, burn dps, heal amount, shield amount — never printed
`kitBlocks` prints a magnitude only for `damage` (`prompt.js:744`). The model is told "puts hp back" without 26, "absorbs damage" without 40, "sets on fire" without 7 hp/s, "multiplies … up" without ×1.35. `kitView` also carries only `damage` (`sim.js:kitView`), so after a kit swap the number is unknowable. Worse for zones: a zone:burn's per-tick fire is 1.867 hp/s for 1.067 s and, because a re-application renews rather than stacks, six ticks add up to 6.66 hp over 8 s (`verify` §5) against 41.6 for zone:damage — the prompt prints "burn … 1.067 s" for something that does one quarter of a single bolt hit. (Balance note for the lead, not a prompt matter: `compile.js` applies the zone share to both dps and duration, so a zone's burn total scales with share².)

### 1.15 `api.ready(name)` — "true when api.use(name) would start"
`prompt.js:924`. `sim.js:makeApi.ready`: `cooldown <= 0 && act === null && stun <= 0 && alive`. It does not check `silence` or `y > 0.01` (airborne), both of which `startSkill` refuses (`sim.js:~857-859`). A silenced or airborne mind gets `true` and then a `refused` event.

### 1.16 `refused` reasons list omits `'silenced'`
`prompt.js:862-863` lists `cooldown | busy | stunned | airborne | dead | unknown`; `startSkill` also refuses with `'silenced'` (`sim.js:~857`). The silence EFFECT_LINE mentions it (`prompt.js:588`) but the events section — where a mind looks up what a reason means — does not.

### 1.17 `{ type:'burning', rate, hp }` — "the arena is taking hp from you" — two events share the type and only one has `rate`
`prompt.js:861`. Arena: `sim.js:1329` `{burning, rate, hp}`. Fire status: `effects.js` `{burning, skill:'burn', hp}` — no `rate`, and it is an enemy's fire, not the arena. Fire damage bypasses `damage()` so it never produces a `damaged` event: the only trace of being on fire is `p.self.burning` (unlisted) and this event every 10 hp.

### 1.18 `interrupted`, `interruptedEnemy`, `knockback`, `chargeStopped`, `enemyCommitted` — never fire for grammar kits under HEAD
`prompt.js:857-865`. Emit sites: `interrupted/interruptedEnemy` only via `interruptCast` (`sim.js:1030-1031`), reached only from smash and charge and, under HEAD, `SKILLS[act.id]` is undefined for `k1..k3` so even those would not cancel a grammar cast; `knockback` `sim.js:1532` (charge only); `chargeStopped` `sim.js:1549`; `enemyCommitted` `sim.js:1383` (charge only). A grammar-vs-grammar fight — every player fight — never produces these five. **WT**: `interrupted/interruptedEnemy` now fire when a stun (and, per `verify` §3, a knock) lands on an interruptible wind-up; the other three remain hardcoded-only.

### 1.19 `missed` — "your skill landed on nothing" — not for a bolt, not for a zone
`prompt.js:850-851`. A bolt stopped by a block or expiring at range writes the log only (`deliver.js:504-520`), no event. A zone that catches nobody emits nothing. A lob that lands empty does emit (`deliver.js:482`). The section implies every miss is announced.

### 1.20 `p.enemy.casting.remaining` — counts to the end of the RECOVERY, not to the strike
`prompt.js:814-816` says `{ skill, phase, elapsed, remaining, total, telegraph }` without saying what `remaining` is until. `castView` (`sim.js:338-351`): `total` = wind-up + recovery (+ air), `remaining = total − elapsed`. The time to the strike is `p.enemy.kit[skill].windup − elapsed`. 42 of 78 brains read `casting.telegraph`; 9 read `remaining` — and those nine are timing dodges against the wrong number.

### 1.21 `.maxSpeed` in perception is the paper value while `.turnRate` is the live one
`prompt.js:811, 822`; `sim.js:perceive`: `turnRate: me.def.turnRate × channelMul(turn)`, `maxSpeed: me.def.maxSpeed`. A mind under a speed weaken (or a speed boost) sees no field change at all. Not a prompt lie by itself, but the effect lines "multiplies one of your own numbers" imply the number in perception moves. (Sim fix preferred: make `maxSpeed` live too.)

### 1.22 `p.arena.zones` — "discs … Standing in one applies whatever it carries" — the disc does not say what it carries
`prompt.js:836-839`; `sim.js:perceive` zones carry `{x, z, r, mine, left}` only. The mind can identify an enemy field only by matching the zone-kind ability in `p.enemy.kit` (1:1 once WT's one-field-per-ability rule lands). The prompt should say that.

### 1.23 "zone — a disc … a body that is in the air skips the ticks" — the tick period is stated only in the perception section, and the total is never stated
`prompt.js:570` says nothing about `ZONE_PERIOD` 0.5 s (`config.js:1121`) or the six ticks; `prompt.js:836-839` says "every half second" as a typed word, not a config value; the kit card prints per-tick damage (6.93 for zone:damage) and `ticks` is in `kitView` but not on the card. 0 of 78 brains read `ticks`.

### 1.24 "wall — a temporary block grows in front of you" — where and how big is unstated, and it lands even on a miss
`prompt.js:589`; `effects.js` wall: 3.2 m ahead along the facing (literal, unnamed in config), 4 × 1 m footprint oriented across the facing, 2.2 m high, `duration` 5 s (printed). `deliver.js:111-116`: WORLD atoms apply whether or not the delivery hit — a cone:wall that misses still builds the wall; a zone:wall builds it at placement, once. The wall appears in `p.arena.obstacles` and in `api.los/ray/pathTo`; a beam and a bolt stop at it, a lob and a zone do not.

### 1.25 Lob DELIVERY_LINE: "never nearer than your own radius plus the splash" — also never nearer to the arena edge than the splash
`prompt.js:569` says "never past the edge of the arena"; `deliver.js:95` clamps to `ARENA_HALF − splash` along the ray, and this clamp WINS over the near bound (`deliver.js:80-86`): a caster against a wall throwing into it drops the mortar at its own feet. Minor, but it is the one case where the stated lower bound is false.

### 1.26 `THE WORLD`: "the world moves twice between two of your thoughts" and order latency — true but incomplete for what the enemy sees
`prompt.js:220-221`. `step()` (`sim.js:1876-2068`): countdowns → `perceive` both → orders applied → statuses → acts → movement → collisions → projectiles → zones. Both perceptions are built before either side's orders are applied, so anything a mind does is seen by the other no earlier than the other's NEXT thought (2 ticks), and an `enemyStarted` emitted on tick N arrives in the enemy's `p.events` at tick N+2. Never stated; it is the latency every dodge is timed against.

---

## 2. Mechanics the sim has that the prompt never explains (grammar path)

Grouped; file:line is the sim, not the prompt.

**Cast timeline**
- Cooldown is set on the tick the order is accepted, before the wind-up (`sim.js:startSkill`, `me.cooldowns[name] = s.cooldown` before `me.act = …`); it counts down one tick per step at `DT × channelMul(cooldown)` (`sim.js:1917-1919`); measured 298 ticks = 9.933 s for a 9.9 s value (`verify` §6) — the card's "counted from the moment it starts" is right; that the wind-up and recovery are INSIDE it is not stated.
- Phase clock semantics (`sim.js:stepAct`): the ordering tick is the first tick of the wind-up; the strike resolves on the first tick at or past the wind-up; overshoot carries into recovery. `casting.phase` is `'windup'` until that tick and `'recover'` from it.
- `enemyStarted.windup` carries the CONFIG wind-up (`sim.js:959`, `round3(s.windup)`), not the served one.
- `casting.telegraph` is `!spent && windup > 0` (`sim.js:349`) — false for blink (no wind-up) and for jump (born spent, `sim.js:~944`), so a hop never telegraphs and a blink cannot be seen coming.
- A skill with a zero wind-up (blink) resolves on the ordering tick (`sim.js:~964`).

**Projectiles** (`deliver.js:220-291, 421-523`)
- Muzzle: both leave `radius + 0.3` ahead of the centre (literal, unnamed).
- Bolt: constant ground velocity `speed` along the facing at the strike; touches a body whose centre comes within `radius + 0.35` of it (literal); stopped by a block (silent to the caster); lives `range/speed` s, rounded up to ticks (the reach line covers this).
- Lob: constant ground velocity `speed` toward the spot; touches nothing in flight; life `(d − muzzle)/speed`; on expiry, the splash circle at the precomputed spot (`p.spot`) catches a body whose centre is within `splash + radius`; the spot is fixed at the strike, not tracked. In perception `{x, z, vx, vz, arc:true, left}` ⇒ landing point = `x + vx·left, z + vz·left` — derivable and never stated.
- The enemy sees YOUR projectiles too (`mine:false`), with `left`.

**Zones** (`deliver.js:293-327, 575-600`)
- Placed at `min(range, dist to enemy)` along the facing (HEAD) / at the aim point clamped to range (WT); ticks at `ZONE_PERIOD` 0.5 s starting on the placement tick (`nextTick: world.t`); catches centre within `r + radius`; `ceil(duration/period)` = 6 ticks; magnitudes are pre-divided by `ticks/ZONE_TOTAL_SHARE` (1.6 hits' worth over the full life, `config.js:1118`); per-tick statuses renew (burn: max dps, max until; stun: max; root: max until), so a zone:stun is a chain of 0.9 s stuns re-applied every 0.5 s — effectively continuous while inside. Airborne (`yTick > 0.35`) skips a tick. WT: a recast removes the caster's previous field of the same ability.

**Statuses** (`effects.js`, `sim.js:moveStep`, `startSkill`)
- stun: no movement, no turning, no starting; HEAD does not cancel a running cast, WT does (wind-up > 0.2 s); a second stun takes `max`, never adds.
- root: `speedMul` 0 → desired velocity 0 → brakes at 30 m/s²; turning and casting unaffected (`verify` §12: `api.use` while rooted refused only for busy/cooldown); knock/pull still move a rooted body.
- silence: `startSkill` refuses `'silenced'`; everything else works; `api.ready` still says true.
- blind: enemy block from a ring buffer, `BLIND_LAG_TICKS/THINK_EVERY` = 15 thoughts = 1.0 s; `p.self.blinded` true; ramps up over the first second.
- shield: `max(old, new)` not additive; `shieldUntil` max; absorbs after channels, before hp, for skill damage AND fire; the arena's burn ignores it (`sim.js:damage`, `skill !== 'arena'`; `sim.js:burn` writes hp directly).
- boost/weaken: `st.boost[channel] = {mul, until}` — a re-application REPLACES, no stacking; both expire at `until`; `channelMul` = boost × weaken.
- burn: dps `max`, until `max`; ticks every step; bypasses damage/armor channels; not a `damaged` event; every 10 hp a `burning` event with `skill:'burn'`.
- cleanse: clears burn, root, blind, silence, weaken (all channels), stun — not boost, not shield (correctly stated). WT: does not clear immunity timers.
- WT immunity: stun/root/blind/silence leave `duration + 3.0` s of immunity to the same effect; a re-application inside it is a `missed` with `reason:'immune', effect`.

**Damage pipeline** (`sim.js:damage`): i-frames → `missed invulnerable` / `evaded`; × caster `damage` channel; ÷ target `armor` channel (floor 0.25); shield absorbs; hp; death is deferred to the end of the tick so simultaneous kills are a draw. `amount` in events is rounded to 0.01.

**Movement** (`sim.js:moveStep`): acceleration toward the desired velocity at `accel`, braking at 30 m/s²; knockback slot `kx/kz` (hardcoded only) decays at 9 m/s²; grammar knock/pull go into `vx/vz`; `moveTo` arrives within 0.35 m of the last waypoint; `moveScale`/`turnScale` while casting (`compile.js:161-162`: `1 − windup·0.8` and `1 − windup·0.6`, clamped) — the kit card prints neither, `kitView` carries neither, though the hardcoded cards print both.

**Jump** (`sim.js:phasesOfDef, moveStep`): crouch 0.067 → air 0.567 (arc `4·h·u·(1−u)`, above 0.35 m for ~88 % of it) → landing 0.167; SELF atoms apply at the END OF THE CROUCH (take-off), not on landing; horizontal velocity frozen; nothing can be ordered (`refused airborne`); `landed` on the last air tick; beam/bolt/lob hit an airborne body normally.

**Blink** (`deliver.js:365-377`, `sim.js:blinkDestination`): direction from the pair or the facing (WT: toward a point, stopping at it); steps back 0.25 m at a time until clear of blocks; clamps to `ARENA_HALF − radius`; i-frames `max(existing, 0.28)`; velocity × 0.3; a `blinked {from, to, moved}` event.

**Perception**
- Fields on `p.self` not in the prompt: `blinded, silenced, rooted, shield, burning`. On `p.enemy`: `shield, rooted, burning`.
- `p.self.turnRate` live; `p.self.maxSpeed` paper. No field for boost/weaken on speed/damage/armor/cooldown/range.
- `p.events` is capped at 32 per thought (`sim.js:emit`; `verify` §10), oldest kept.
- The kit fields the prompt lists (`prompt.js:780-786`) match `kitView`; missing from `kitView` and therefore from the "live numbers" promise: `iframes`, `needsLos`, `moveScale`, `turnScale`, effect magnitudes other than damage, effect durations, `interruptible`.
- `p.enemy.kit` lets a mind resolve `p.enemy.casting.skill` into a delivery kind and numbers — stated nowhere (the stub pilot does exactly this, `brains/kit-stub/octopus.js:150-160`).

**Events: prompt list vs emit sites**

| event (prompt) | emits for grammar kits? | note |
|---|---|---|
| damaged / dealt | yes (`sim.js:1282-1283`) | not for fire ticks, not for arena burn |
| missed aim/cover/range/airborne/invulnerable | yes (`deliver.js:154, 482`, `sim.js:1233`) | bolt block/expiry and empty zones are silent; WT adds `immune` |
| evaded | yes | |
| blocked / contact | yes (`sim.js:1827, 1856`) | |
| blinked | yes | |
| landed | yes (jump only) | |
| knockback | **no** (charge only) | grammar knock/pull emit nothing |
| interrupted / interruptedEnemy | HEAD **no**; WT yes | |
| chargeStopped / enemyCommitted | **no** (charge only) | dead lines for every player creature |
| burning {rate, hp} | arena yes; fire emits `{skill:'burn', hp}` | two shapes, one type |
| refused | yes; `'silenced'` missing from the list | |
| enemyStarted {skill, windup} | yes | windup is the config value |

Nothing is emitted when: a status lands on you (stun/root/blind/silence/weaken/boost), your shield breaks (log only), you are healed (log only), a wall appears (it shows in `p.arena.obstacles`), an enemy zone starts ticking you (only `damaged` with the zone's skill id).

---

## 3. What a mind needs to know to be NOT dumb — facts, not tactics

Each is a category-3 fact (or a category-1 capability) that the prompt currently withholds and that a model cannot recover from the rest of the text. None tells the model what to do with it.

1. **The enemy sees your wind-up.** `p.enemy.casting.telegraph` is true from the tick after you order until the strike; `casting.skill` names the ability and `p.enemy.kit[skill]` gives its kind, wind-up, range, speed, splash. The same is true of you, seen from their side. [fact]
2. **When the strike lands, from their side**: at `kit[skill].windup − casting.elapsed` seconds; `remaining` counts to the end of the recovery. [fact]
3. **Latency**: perceptions are built before orders apply; the other side sees the consequence of your order at its next thought, two ticks later. [fact]
4. **Aim is read at the strike.** The facing at the end of the wind-up, or the aim point (WT), is what the beam/bolt/cone/dash/lob/zone use; a facing order given with the use order turns the body during the wind-up at `turnRate × turnScale`. [fact]
5. **A projectile takes time**: a bolt at `speed` reaches a body at distance d after ≈ `(d − radius − 0.3)/speed` s AFTER the strike; a lob comes down `(d − radius − 0.3)/speed` s after the strike, at the spot fixed at the strike. `V.lead(shooter, target, targetVel, speed)` gives the intercept for a thing released now; the release is `windup` seconds after the order. [fact + capability]
6. **A projectile in `p.arena.projectiles` tells you where it is going**: straight ones continue along `vx, vz` for `left` seconds and touch a centre within `radius + 0.35`; arc ones come down at `x + vx·left, z + vz·left` and strike `splash + radius` around that point. [fact]
7. **The cone is `halfAngle` each side of the facing at the strike, measured to your centre, reach `range + your radius`, floor only.** [fact]
8. **The cooldown clock starts at the order**, so with the cast inside it an ability is next usable `cooldown − (windup + recover)` after the recovery ends. Under WT this is 1.8–3.0 s per delivery. [fact; the arithmetic is borderline under the checktactics rubric — state the two facts and let the model add]
9. **What each status stops**: stun — moving, turning, starting (WT: also cancels a wind-up); root — moving only; silence — starting only; blind — the enemy block is 1 s old and says so in `p.self.blinded`; none of them stops a projectile already in flight or a zone already on the floor. [fact]
10. **Renewal, not stacking**: a second stun/root/silence/blind/burn/shield/boost/weaken of the same kind replaces or extends, never adds. WT: and after a control effect ends, the same effect cannot land again for 3 s (`missed immune`). [fact]
11. **Damage order**: your damage channel, their armor channel (a divisor), their shield, their hp; i-frames turn it into `evaded`; fire ignores channels but not shields; the arena's burn ignores shields. [fact]
12. **Knock/pull are a velocity, drained by the target's own acceleration**: `mag × 4` m/s; a stationary default body moves ≈ 4 m; a body that cannot steer (stunned, rooted) carries the full impulse. [fact]
13. **The jump**: nothing can be ordered from crouch to landing (`airborne + recover` ≈ 0.73 s); cone/zone/dash pass under it above 0.35 m; beam/bolt/lob do not; its SELF atoms apply at take-off. [fact]
14. **A field ticks every 0.5 s starting when it lands, six times, and re-applies its statuses on every tick; airborne skips a tick; leaving the disc ends it for you; it is visible to both sides in `p.arena.zones` with `left`.** [fact]
15. **`api.ready` does not consult silence or the air**; the refusal comes as an event on the next thought. [capability + fact]
16. **The events feed keeps 32 per thought; a bolt that hits a block says nothing; a wall lands even when the delivery that carried it missed.** [fact]
17. **`p.self.maxSpeed` is the paper number; `turnRate` is live; there is no field for a speed/damage/armor/cooldown/range boost or weaken on either body — only the effect's duration from the card and the tick you saw it applied (a `dealt`/`damaged` with that skill).** [fact — or fix the sim]
18. **The pair form of `api.use` is a direction; only a lone number is a mortar distance; WT: an object `{x, z}` is an aim point for every delivery.** [capability]
19. **Sudden death at 30 s burns a FRACTION of maximum hp**, so a shield does not slow it and a heal does. (The first half is already in the prompt; the shield/heal interaction is not.) [fact]
20. **Two bodies in contact push each other apart by mass; the heavier yields less** — already stated; add: a body pushed into a wall by knock/pull stops at the wall (`collide` kills the normal component). [fact]

---

## 4. Draft texts for the new regime

Assumptions: cooldown is a per-delivery constant ≤ 3 s (registry `cooldown`), `api.use(name, {x, z})` is the aim point (all deliveries turn toward it; lob/zone land on it clamped to range; blink goes toward it and stops at it), one field per ability per caster, stun/knock cancel wind-ups over 0.2 s, control effects leave a 3 s immunity. Every number is a placeholder to be emitted through `q()`/`n()` from config or the compiled def — none is to be typed. Each line is tagged with its category: [C]apability, [K] constraint with reason, [F]act, [O]bjective, [S]tructure. Wording keeps to the file's rule: no "should", no ranking, no derivation left for the reader beyond what the current world section already does.

### 4.1 New section — HOW THE PIECES INTERACT

To be inserted after the two skill sections and before WHAT YOU PERCEIVE. All numbers via `q()` with new labels (`interact.*`), or via the def when kit-specific.

```
HOW THE PIECES INTERACT

[S] One cast, in order.
[F] When your thought returns, the order is applied on that same step. The
    ability's cooldown starts on that step, before anything else happens; the
    wind-up and the recovery both run inside it.
[F] During the wind-up your body keeps moving at moveScale of its top speed and
    keeps turning at turnScale of its turn rate. (Both figures are printed on
    each card below.)
[F] The strike happens on the first step at or past the wind-up. Everything
    about where it goes is read at THAT instant — your facing, your aim point,
    the enemy's position for a field or a mortar with no aim point — and not
    at the instant you ordered it.
[F] The recovery follows. Nothing can be started until it ends; movement and
    turning continue at the card's scales.
[F] The wind-up is visible to your opponent: their p.enemy.casting.telegraph is
    true from their next thought until the strike, their casting.skill names
    the ability, and their p.enemy.kit[skill] holds its numbers. Yours shows
    you the same about them. casting.remaining counts down to the end of the
    RECOVERY; the strike lands when casting.elapsed reaches the wind-up.
[F] What either of you does is seen by the other no earlier than the other's
    next thought: perception is built for both before either side's orders are
    applied, and one thought is ${q('think.everyTicks', THINK_EVERY)} steps.

[S] Aiming.
[C] api.use(name, { x, z }) names a point on the ground. Your body turns toward
    it at your turn rate, as api.faceAt would. A beam, bolt, fan or lunge goes
    where the body points at the strike. A mortar and a field land ON the
    point, clamped to their range. A blink goes toward the point and stops
    there when it is nearer than the blink's distance.
[C] api.use(name) with no point uses your facing at the strike; a mortar and a
    field with no point land at the enemy's distance as it stands at the
    strike.
[F] The facing you have at the strike is the one you had at the order plus
    whatever turning the wind-up allowed: turn rate × turnScale × wind-up.

[S] Things in flight and on the floor.
[F] A bolt leaves ${n(me.radius + 0.3)} m ahead of your centre and flies at its
    speed along the facing at the strike. It connects with a body whose centre
    comes within ${n(you.radius + 0.35)} m of it, and a block or a wall ends
    it. In p.arena.projectiles it is {x, z, vx, vz, mine, arc:false, left},
    and it continues along vx, vz for left seconds.
[F] A mortar leaves from the same muzzle and flies at its speed toward the
    landing spot fixed at the strike. It touches nothing on the way — bodies,
    blocks or walls. In p.arena.projectiles it is {…, arc:true, left}, and it
    comes down at x + vx·left, z + vz·left, where its splash circle catches a
    body whose centre is within splash + that body's radius.
[F] A field ticks on the step it lands and every ${q('zone.period', ZONE_PERIOD)} s after that, ${n(def.zoneTicks)}
    times in all. Each tick applies every effect on the card, at the per-tick
    figure printed there, to a body whose centre is within the disc's radius
    plus its own radius at that instant. A body in the air on a tick is
    skipped for that tick. In p.arena.zones it is {x, z, r, mine, left}; which
    ability made it is not on the disc — the disc-shaped ability in that
    side's kit is the one it came from, and a side has at most one disc per
    ability on the floor: a new cast of the same ability removes the old disc.
[F] A wall grows ${q('wall.ahead', WALL_AHEAD)} m ahead of the caster's centre along the caster's facing,
    ${q('wall.width', …)} m wide across that facing, ${q('wall.depth', …)} m thick, for the seconds on the card. It
    appears in p.arena.obstacles and in api.los, api.ray and api.pathTo like
    any block. A wall carried by a delivery that misses is built anyway.

[S] What a hit does, in order.
[F] Damage passes through the attacker's damage channel, then the defender's
    armor channel (a divisor — a boost on armor means less gets through), then
    the defender's shield, then hp. A body inside its invulnerability window
    takes nothing and the attacker is told 'missed' with reason 'invulnerable'.
[F] Fire takes hp every step at its rate; it goes through a shield and ignores
    both channels; it announces itself as { type:'burning', skill:'burn', hp }
    every ${q('burn.eventEvery', 10)} hp and never as 'damaged'.
[F] The arena's burn from ${q('suddenDeath.at', SUDDEN_DEATH_AT)} s ignores shields and channels and is a
    fraction of MAXIMUM hp; a heal changes how long it takes, a shield does not.

[S] Statuses.
[F] Stunned: no movement, no turning, no new ability; a wind-up longer than
    ${q('interrupt.minWindup', 0.2)} s that is running when the stun lands is cancelled and its cooldown
    is spent. Rooted: no movement; turning and abilities work. Silenced: no
    new ability, refused with reason 'silenced'; everything else works.
    Blinded: your p.enemy block — position, velocity, dist, visible, casting —
    is the one from ${q('blind.lagSeconds', BLIND_LAG_TICKS / TICK_HZ)} s ago, and p.self.blinded is true.
[F] None of these touches a projectile already in flight, a disc already on
    the floor, or a wall.
[F] A second application of the same status replaces or extends the first:
    the longer time stands, the stronger fire stands, the larger shield
    stands. Nothing stacks. When a stun, root, silence or blindness ends, the
    same effect cannot land on that body again for ${q('immune.seconds', 3.0)} s; the caster is told
    'missed' with reason 'immune' and the effect's name.
[F] Knock and pull add ${n(mag * 4)} m/s to the target's velocity, away from or toward
    the caster. The target's own acceleration works against it from the next
    step; a body that cannot steer — stunned, rooted — carries it further; a
    body pushed into a wall or a block stops there.
[F] A boost or a weaken sets the channel's multiplier for its seconds and a new
    one on the same channel replaces it. p.self.turnRate shows the live turn
    rate; p.self.maxSpeed shows the unboosted figure. (If the sim is changed
    to serve live maxSpeed, drop the second clause.)
[F] Cleanse removes fire, root, blindness, silence, stun and every weaken; it
    does not remove a shield or a boost, and it does not shorten an immunity.

[S] Leaving the ground.
[F] A leap: a crouch of the card's wind-up, an airborne phase, a landing phase.
    Its own effects apply at take-off. From the crouch to the end of the
    landing no ability can be started (refused with 'airborne') and the
    horizontal velocity is the one you had at take-off. Above ${q('airborne.dodgeMin', AIRBORNE_DODGE_MIN)} m —
    most of the airborne phase — a fan, a disc tick and a lunge pass
    underneath; a beam, a bolt and a mortar hit exactly as on the ground.
    { type:'landed' } arrives on the step you touch down.
[F] A blink: the body is moved this step; it is invulnerable for the card's
    seconds counted from the landing; its velocity is cut to ${q('blink.velocityKeep', 0.3)} of what it
    was; the landing never ends inside a block — it is pulled back along the
    line until clear; it has no wind-up, so it never telegraphs.

[S] What is announced and what is not.
[F] p.events keeps at most ${q('events.max', 32)} entries between two thoughts.
[F] A bolt that hits a block or flies out of range announces nothing; a disc
    that catches nobody announces nothing; a mortar that lands on nobody
    announces 'missed' with reason 'aim'.
[F] No event marks a status landing on you: read p.self.stunned, rooted,
    silenced, blinded, burning, shield, invulnerable, and p.enemy.stunned,
    rooted, burning, shield, invulnerable.
```

`WALL_AHEAD`, the wall footprint, `0.35`/`0.3` muzzle constants, `0.2` interrupt threshold, `0.3` blink velocity keep, `32` events cap, `10` burning granularity are literals today (`effects.js`, `deliver.js`, `sim.js`, `compile.js`); they need names in `config.js` before `q()` can emit them.

### 4.2 Revised HELPERS

```
[S] WHAT IS ALREADY IN SCOPE
[C] V — plane vectors as plain { x, z } objects.  (list unchanged)
[C] V.lead(shooter, target, targetVel, speed)
      where a target moving at constant velocity will be when something
      released from shooter now and travelling at speed reaches it. Returns
      the target's own position when speed is 0.
[F]   It measures from shooter's centre and counts nothing that happens before
      the release: a bolt or a mortar is released at the strike, wind-up
      seconds after the order, from ${n(me.radius + 0.3)} m ahead of the centre.
[F] V.norm and V.toward return {x:0,z:0} for a zero-length input, and a zero
    vector passed to api.move is a full stop.
[K] Math is available in full except Math.random (rule 1 says why). console.log
    works and goes to a log nobody's fight depends on.
```

The sentence "Nothing in this world flies…" is deleted; it is only true of the §1 fixture and should live in `skillsFor`'s fixture branch if kept at all.

### 4.3 Revised DELIVERY_LINE (functions of the def and the two bodies; every number via `n()`)

```
[F] beam  a straight line from your muzzle along your facing at the strike; it
          stops at the first block, wall or body it meets. A body is hit when
          its surface enters the beam's margin. Height is not consulted.
[F] cone  a wedge from your centre, ${deg(d.halfAngle)} degrees either side of your
          facing at the strike, measured to the other body's CENTRE, reaching
          ${n(d.range)} m to its surface. It needs a clear centre-to-centre line
          and it sweeps the floor: a body above ${n(AIRBORNE_DODGE_MIN)} m takes
          nothing. Its effects carry the fan's ${n(d.power)}× to their magnitudes.
[F] bolt  a projectile released at the strike from ${n(me.radius+0.3)} m ahead of
          your centre, along your facing at the strike, at ${n(d.speed)} m/s for
          ${n(flight)} m. It connects with a body whose centre comes within
          ${n(you.radius+0.35)} m of it, a block or wall ends it silently, and
          it is visible to both sides in p.arena.projectiles.
[F] lob   a projectile released at the strike from the same muzzle, at
          ${n(d.speed)} m/s toward a landing spot fixed at the strike; it
          touches nothing on the way. Where it lands: the aim point you passed
          — api.use(name, {x, z}) — or a lone number api.use(name, metres) as
          a distance along your facing, or, with neither, the enemy's distance
          at the strike. The spot is clamped at the strike: not nearer than
          ${n(me.radius+d.splash)} m, not past ${n(d.range)} m, not nearer the
          arena's edge than ${n(d.splash)} m. On landing a circle of
          ${n(d.splash)} m catches a body whose centre is within that plus its
          radius; an empty circle is 'missed' with reason 'aim'. A pair of
          numbers is a direction, not a distance.
[F] zone  a disc of ${n(d.radius)} m placed at the strike — on your aim point
          clamped to ${n(d.range)} m, or with no point along your facing at the
          enemy's distance or ${n(d.range)} m, whichever is shorter. It works
          for ${n(d.duration)} s: on the step it lands and every ${n(ZONE_PERIOD)} s
          after, ${n(d.zoneTicks)} ticks in all, each applying the per-tick
          figures on this card to a body whose centre is within the disc plus
          its radius and which is not above ${n(AIRBORNE_DODGE_MIN)} m. A new
          cast removes your previous disc from this ability.
[F] dash  at the strike your body is moved ${n(d.distance)} m along your facing
          in one step — a block or wall shortens it — and a body whose centre
          lies within ${n(me.radius+you.radius)} m of that line and is not
          above ${n(AIRBORNE_DODGE_MIN)} m is hit. Its effects apply before
          the move, so a knock pushes along the lunge.
[F] blink your body is moved up to ${n(d.distance)} m this step — toward your
          aim point, stopping at it, or along the pair you pass, or along your
          facing — never ending inside a block. You are invulnerable for
          ${n(iframesServed)} s from the landing. Your velocity is cut to
          ${n(0.3)} of what it was. No wind-up, so no telegraph.
[F] self  at the strike its effects happen to you where you stand.
[F] jump  a crouch, ${n(airServed)} s in the air, a landing. Its effects apply
          at take-off. Nothing can be ordered from the crouch to the end of
          the landing; horizontal velocity is frozen at take-off; above
          ${n(AIRBORNE_DODGE_MIN)} m a fan, a disc tick and a lunge pass
          underneath and a beam, a bolt and a mortar do not.
```

`kitBlocks` must also print, per card: `moveScale`/`turnScale` during the wind-up, `halfAngle` for cones, `iframes` for blinks, `ticks` and the per-tick vs whole-life totals for zones, and served phase durations through a `servedDef(def)` built on `phaseClock` (fields `[windup, recover]`, `[null, recover]` for a zero wind-up, `[windup, airborne, recover]` for jump) — not through `servedCountdown`.

### 4.4 Revised EFFECT_LINE (magnitude and duration printed for every atom that has one; per-tick for zones)

```
[F] damage   takes ${n(mag)} hp off what it hits (per tick, for a disc)
[F] burn     sets what it hits on fire at ${n(mag)} hp per second for ${n(dur)} s;
             fire goes through shields and ignores channels; a second fire
             replaces the first with the longer time and the stronger rate,
             it does not add
[F] knock    adds ${n(mag*4)} m/s to the target's velocity, away from you
[F] pull     adds ${n(mag*4)} m/s to the target's velocity, toward you
[F] stun     for ${n(dur)} s the target cannot move, turn or start an ability,
             and a wind-up longer than ${n(0.2)} s that is running is cancelled
             with its cooldown spent; a stun during a stun does not add;
             ${n(immune)} s of immunity to stun follow it
[F] root     for ${n(dur)} s the target cannot move; it can turn and act; a knock
             or pull still moves it; ${n(immune)} s of immunity follow
[F] shield   ${n(mag)} hp of absorption before hp, for ${n(dur)} s, against
             ability damage and fire, not against the arena's burn; a second
             shield keeps the larger figure and the later time; visible as
             p.self.shield / p.enemy.shield
[F] heal     puts ${n(mag)} hp back, never above maximum
[F] cleanse  removes fire, root, blindness, silence, stun and every weaken from
             you; not a shield, not a boost, not an immunity
[F] blind    for ${n(dur)} s the target's p.enemy block is the one from
             ${n(BLIND_LAG)} s ago — position, velocity, dist, visible and
             casting alike — and its p.self.blinded is true; ${n(immune)} s of
             immunity follow
[F] silence  for ${n(dur)} s the target's api.use is refused with reason
             'silenced' (api.ready does not know about it); ${n(immune)} s of
             immunity follow
[F] wall     a block ${n(WALL_AHEAD)} m ahead of you along your facing, ${n(w)} m
             wide across it and ${n(d)} m thick, for ${n(dur)} s; it stops
             bodies, beams, bolts and lines of sight; a mortar and a disc pass
             over it; it is built even when the delivery carrying it misses
[F] boost    multiplies your own <channel> by ${n(mag)} for ${n(dur)} s; a new
             boost on the same channel replaces it
[F] weaken   multiplies the target's <channel> by ${n(mag)} for ${n(dur)} s; a
             new weaken on the same channel replaces it
```

### 4.5 Revised CHANNEL_LINE

```
[F] speed     top movement speed
[F] turn      turn rate (shown live in p.self.turnRate)
[F] damage    every hp figure your abilities deal, fire excepted
[F] armor     a divisor on every hp figure dealt to you, fire excepted — a
              multiplier above one means less gets through, below one more;
              never below ${n(0.25)}
[F] cooldown  how fast your cooldowns count down
[F] range     the range of your beam, fan, bolt, mortar and disc; not a lunge,
              not a blink
[F] vision    above one: p.enemy.visible is true even through cover; below one:
              your p.enemy block lags by that share of ${n(BLIND_LAG)} s
```

### 4.6 `api.use` in the verbs section

```
[C] api.use(name)            Order an ability along your facing at the strike.
[C] api.use(name, {x, z})    Order it AT a point on the ground: you turn toward
                             the point at your turn rate; a mortar and a disc
                             land on it (clamped to range); a blink goes toward
                             it and stops there; a beam, fan, bolt or lunge
                             goes where you point at the strike.
[C] api.use(name, metres)    Mortar only: the distance along your facing.
[C] api.use(name, dx, dz)    Blink only: a direction. For every other delivery
                             the pair is ignored and the ability goes along
                             your facing.
[F]                          The return value says only that the ORDER was
                             accepted … (unchanged) … refused there — on
                             cooldown, busy, stunned, silenced, off the ground.
[C] api.ready(name)          true when the cooldown is over, nothing of yours is
                             running, you are not stunned and you are alive.
                             It does not consult silence or the air; those
                             refusals arrive as events.
```

### 4.7 Perception and events additions

```
p.self   … .blinded .silenced .rooted .burning   true while the status holds
         .shield   hp of absorption left
p.enemy  … .shield .rooted .burning
p.arena.zones   which ability made a disc is not on the disc; the disc-shaped
                ability in that side's kit is the one, and a side keeps at
                most one disc per ability
events   { type:'refused', … reason: 'cooldown'|'busy'|'stunned'|'silenced'|'airborne'|'dead'|'unknown' }
         { type:'missed', skill, reason, effect? }  reason: 'aim'|'cover'|'range'|'airborne'|'invulnerable'|'immune'
         { type:'burning', rate, hp }        the arena
         { type:'burning', skill:'burn', hp } an enemy's fire
         { type:'interrupted', skill, by }    your wind-up was cancelled by a stun or knock
         { type:'interruptedEnemy', skill }   you cancelled theirs
         (drop knockback, chargeStopped, enemyCommitted from the grammar prompt;
          they are §1 fixture events)
         p.events keeps at most 32 entries between two thoughts.
```

---

## 5. Notes for the gates

1. `tools/checkprompt.mjs` never sees the kit card: `tracePrompt` renders without kits and `kitBlocks` uses `n()`. Either route the card through `q()` with `kit.<slot>.<field>` labels under a kit-aware trace, or add a `checkbehaviour` block that measures every grammar delivery's served wind-up/recovery (the existing block at `tools/checkbehaviour.mjs:403-480` measures reach only) and compares to the card. The one-tick errors in §1.2 would have failed either.
2. `prompt.js` `served()` is keyed by hardcoded names via `PHASE_FIELDS`; a `servedDef(def)` over `phaseClock` is needed for kits (`[windup, recover]`; `[null, recover]` when `windup === 0`; `[windup, airborne, recover]` for jump).
3. `tools/checktactics.mjs`'s category 0 includes "a sentence that pairs two facts and leaves only the addition". The interactions section above is written as separate facts to stay inside categories 1–3; the one line that does arithmetic ("next usable cooldown − (windup + recover) after the recovery") is deliberately NOT in the draft — the sudden-death paragraph already does that kind of arithmetic (`prompt.js:237`), so it is the lead's call whether the rubric tolerates it. `tools/tactics-verdicts.json` will re-judge every changed segment.
4. Literals that need names in `config.js` before the prompt can emit them: bolt/lob muzzle `0.3` and touch `0.35` (`deliver.js:231, 488`), beam muzzle `0.2` and `BEAM_RADIUS` (already named), wall offset `3.2` and footprint `[4, 1]` and height `2.2` (`effects.js`), blink velocity keep `0.3` (`deliver.js:370`), knock/pull ×4 (`effects.js`), events cap `32` (`sim.js:emit`), burning granularity `10`, interrupt threshold `0.2` (`compile.js:153`), `moveTo` arrival `0.35` (`sim.js:moveStep`).
5. `kitView` (`sim.js`) should carry what the card promises live: `iframes`, `moveScale`, `turnScale`, every effect's `mag` and `duration` (as `effects: [{id, mag, duration, channel}]` rather than a bare id list), `halfAngle` (present), `ticks` (present). Otherwise F10 ("a kit swap never needs a regenerated brain") holds only for damage.
6. `perceive` should serve `maxSpeed` live the way it serves `turnRate`, or the prompt must say it does not.
7. DB evidence for the bake-off (milestone 5) to re-measure after the prompt changes: of 78 kitted brains — `V.lead` 15, `casting.telegraph` 42, `projectiles` 11, `zones` 29, `p.self/enemy.kit` ~15 (mostly stub), `splash` 0, `halfAngle` 0, `refused` 4, `missed` 2, `blinded/silenced` 0 outside stub/hand-written; `api.use` shapes: 146 name-only, 0 name+distance, 76 name+pair.

---

## 6. Minor accuracy notes (not false, but loose)

- `prompt.js:831-833` "there is no p.enemy.cooldowns" — correct; the enemy's kit cooldown figures ARE disclosed in `p.enemy.kit[...].cooldown`, which is the addition `checktactics` deleted a hint about; leave as is.
- `prompt.js:864` `enemyStarted.windup` is the config wind-up; say "as declared" or emit the served one.
- `prompt.js:836-839` "every half second" is a typed number in prose that `checkprompt` tolerates because it is a word; under a kit-aware trace it needs `q('zone.period', ZONE_PERIOD)`.
- The `KIT_IS_NOT_YOURS` paragraph (`prompt.js:510-519`) is right and should stay; it needs the `kitView` completeness from §5.5 to be fully true.
- `DELIVERY_LINE.jump` says "Three deliveries travel along the floor — cone, zone and dash" — correct and should be repeated on the cone/zone/dash lines (done in §4.3), because a reader with no jump in either kit never sees the jump line.
- `DELIVERY_LINE.zone` "a body that is in the air skips the ticks it spends up there — one or two of them" — correct (0.567 s air over a 0.5 s period).
