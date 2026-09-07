# Mechanics audit under the ≤ 3 s cooldown regime

Date: 2026-09-07. Audited tree: HEAD `8699fb6` plus the working-tree edits that
landed WHILE this audit ran (see §0.2). Method: full read of
`src/skills/registry.js`, `src/skills/compile.js`, `src/core/{sim,deliver,effects,config}.js`,
the kit/verb sections of `src/brain/prompt.js`, `src/skills/gauntlet.js`,
`brains/kit-stub/*.js`; SQL over `data/airena.db`; and a single-process
measurement harness (`createWorld`/`step` driven directly, plain-object pilots,
`compileKit({ fixedCooldown })`) — copies in `reports/combat/mechanics-audit-harness/`.
Every number below labelled "measured" comes from that harness or from the DB;
everything else is arithmetic on the registry constants.

Line numbers refer to HEAD unless marked (wt) = working tree at 04:10–04:20.

---

## 0. Frame: what the fight is today, and what changed under my feet

### 0.1 The DB says the fight is already LONGER than the brief assumes

`match` rows under the current constants version `c-d3006474` (214,572 matches,
kits present):

| metric | value |
|---|---|
| mean length | 32.3 s |
| p25 / p50 / p75 (last 3 days, 174,989 matches) | 26.0 / **36.3** / 40.1 s |
| matches running past `SUDDEN_DEATH_AT` = 30 s | **135,873 / 214,572 = 63 %** |
| ending by `double-ko` (both burned) | 12,781 (6 %), mean 43.8 s |
| casts per second per side (200 latest ladder matches, median) | **0.27** |
| hits per second per side (median) | **0.13** (≈ 48 % of casts land) |

The "~22 s median" in the brief and in `config.js:105` comes from the
octopus/gorilla era. Under the shipped grammar the median fight reaches the
arena burn: sudden death is the ORDINARY state, and 6 % of fights end with the
arena killing both. A fighter casts once every 3.7 s and lands a hit every 7.7 s.
Any target of "25–40 s with ~1 cast/s each" is therefore a 3–4× cadence increase
into a world whose closing mechanic already fires in most fights; `SUDDEN_DEATH_AT`
must be re-derived after the rescale (§9, R13).

### 0.2 In-flight edits observed during the audit (working tree, uncommitted)

While reading, `git diff` grew to 263 insertions across `registry.js`,
`compile.js`, `sim.js`, `deliver.js`, `effects.js`, `DESIGN.md`. What they do
(verified by re-running the harness against the tree):

| edit | file:line (wt) | effect on this audit |
|---|---|---|
| per-delivery `cooldown` (beam 3.0, cone 1.8, bolt 2.2, lob 2.6, zone 3.0, dash 3.0, blink 3.0, self 3.0, jump 2.4); `compile.js` uses `d.cooldown ?? cost-derived` | registry.js:114–261, compile.js:151 | symmetric 3-damage duel: 33.0 s → **9.9 s** (measured) |
| `immune: 3.0` on stun/root/blind/silence; `applyEffect` refuses the same control while `st.immune[id] > t`, logs `immune`, emits `missed/immune` | registry.js:400–406, effects.js:84–93, compile.js:172 | silence lock 81 % → **31 %**, stun chain 66 % → **22 %** (measured) |
| `interruptCast` reads `defOf` instead of `SKILLS[...]`; stun and knock atoms call `deps.interrupt` | sim.js:1081–1092, effects.js:135,155, sim.js:2232 | grammar wind-ups are now cancellable (13 interrupts / 8 matches measured) |
| `api.use(name, {x, z})` aim point → `wantHeading` + `act.at`; lob and zone land ON the point (clamped to range), blink goes toward it and stops there | sim.js:702–722, 946–969, deliver.js:54–60, 238–241, 311–324, 402–408 | closes the argument-semantics hole of §7, except for numeric pairs |
| one zone per ability per caster (new cast replaces); one wall per ability per caster | deliver.js:326–333, effects.js:243–248 | 3 zone abilities still give 3 concurrent zones; 3 wall abilities still give 3 walls (measured maxZones 3, maxWalls 3) |
| `p.self.immune` / `p.enemy.immune` lists in perception | sim.js:495–503, 557, 582 | prompt.js not yet updated (§7.4) |

The rest of this document states HEAD behaviour first and marks what the in-flight
edit changes, so the lead can see what is closed and what is still open.

---

## 1. The cast-time budget: how often a body can physically cast

`phasesOfDef` (sim.js:97–108): every grammar ability is `windup → (strike) → recover`,
one act slot, no queueing (`startSkill` refuses `busy`, sim.js:866). Cooldown is
set at cast START (sim.js:912), so the idle gap = cooldown − act length.

| delivery | windup | recover | act total | moveScale during cast (compile.js:161) | turnScale (compile.js:162) | max turn during wind-up at turnRate 7.5 |
|---|---|---|---|---|---|---|
| beam | 0.65 | 0.10 | 0.75 | 0.48 | 0.61 | 3.0 rad |
| cone | 0.28 | 0.28 | 0.56 | 0.78 | 0.83 | 1.7 rad |
| bolt | 0.34 | 0.16 | 0.50 | 0.73 | 0.80 | 2.0 rad |
| lob | 0.50 | 0.20 | 0.70 | 0.60 | 0.70 | 2.6 rad |
| zone | 0.45 | 0.25 | 0.70 | 0.64 | 0.73 | 2.5 rad |
| dash | 0.18 | 0.26 | 0.44 | 0.86 | 0.89 | **1.2 rad** |
| blink | 0 | 0.18 | 0.18 | 1 | 1 | — |
| self | 0.30 | 0.18 | 0.48 | 0.76 | 0.82 | 1.8 rad |
| jump | 0.06 | 0.16 (+0.55 air) | 0.77 | 1 | 1 | — |

Consequences at the new cadence:

- A kit of beam+bolt+cone at 3.0/2.2/1.8 s is committed 0.75+0.5+0.56 = 1.81 s
  per 3 s if it casts everything on cooldown: **60 % busy**, moving at ~65 % of
  top speed on average. Measured busy fraction in the harness: 40–73 % depending on
  kit (E1, E11). Positioning and kiting get materially harder simply because the
  body is always inside a cast — this is a hidden nerf to mobile play that no
  per-atom weight expresses.
- Kit-wide cast ceiling ≈ 1/3.0 + 1/2.2 + 1/1.8 = 1.34 casts/s; with real minds
  positioning between casts expect **0.7–0.9 casts/s** (DB minds today use 77 % of
  their cooldown-limited ceiling).
- `dash` turns at most 1.2 rad during its wind-up: a lunge ordered more than ~70°
  off the current facing goes the wrong way. With the aim-point API this needs
  either a longer wind-up or a heading snap at the end of the wind-up (§7.3).

---

## 2. Effects at a 2–3 s cadence

Constants: `EFFECTS` registry.js:388–409; share for 1/2/3 effects on one ability
= 1 / 0.75 / 0.6 applied to magnitude AND duration (compile.js:186–208); delivery
`power` (cone 1.7) multiplies magnitude only; zone divides both by ticks/1.6
(compile.js:229–243: 6 ticks → ×0.267 per tick).

Notation: CD = the cooldown the ability actually has; "(wt)" = in-flight
per-delivery cooldown.

### 2.1 Hard control

| effect | duration | uptime, 1 ability at CD 3 | at CD 2.2 (bolt, wt) | 2 abilities carrying it | in-flight immunity 3.0 s: ceiling per ability | sim facts |
|---|---|---|---|---|---|---|
| stun | 0.9 s | 30 % | 41 % | 60 % (three: 90 %) | 0.9/(0.9+3.0) = **23 %** | non-extending (`Math.max`, effects.js:150); blocks `startSkill`, movement (sim.js:1674) and turning (sim.js:1632); does NOT cancel a wind-up already running at HEAD (measured E8) — (wt) the stun ATOM landing now interrupts; a stun set by any other path still does not |
| root | 1.4 s | 47 % | 64 % | 93 % | 1.4/4.4 = **32 %** | `speedMul` = 0 (sim.js:1607); turning and casting allowed |
| silence | 2.2 s | 73 % | 100 % | 100 % | 2.2/5.2 = **42 %** | refuses ALL abilities incl. self/blink/cleanse (sim.js:863) — cleanse cannot answer it |
| blind | 2.5 s | 83 % | 100 % | 100 % | 2.5/5.5 = **45 %** | perception lag 30 ticks = 1 s (sim.js:430–492); brain is told `blinded` |

Measured (E3/E4, 8 seeds, 100 %-hit stationary duel, CD 3): two silence abilities
→ **81–93 % silence uptime**, victim casts 0.11–0.26/s; three stun abilities → 66 %
stun uptime; two root → 63 %; two blind → 85 %. Re-measured against the in-flight
immunity: silence **31 %**, stun **22 %**, stun+damage combos 14 %.

Rotation across DIFFERENT controls is not covered by per-id immunity: measured
`[beam:stun, bolt:silence, lob:root]` (wt) → stun 14 % + silence 30 % + root 21 %
uptime simultaneously on the same victim; act-lock (stun ∪ silence) ≈ 44 %. The
kit does no damage so it still loses, but a `stun+damage / silence+damage` pair
wins 6/2 with 41 % act-lock (E15). Class-level DR is needed (§9, R1).

### 2.2 Sustain

| effect | magnitude | per second at CD 3 | at CD 3 for `self` (wt) | vs incoming 26/hit at CD 3 (8.7 dps) / bolt CD 2.2 (11.8 dps) | sim facts |
|---|---|---|---|---|---|
| heal | 26 | 8.7 hp/s | 8.7 hp/s | cancels one damage ability exactly; 180 hp needs > 8.7 dps to move | flat, capped at maxHp (effects.js:173); no falloff |
| shield | 40 for 5 s | up to 13.3 hp/s absorbed | 13.3 | **absorbs 100 % of one damage ability** (40 > 26, refreshed before it is spent) | non-additive `Math.max` (effects.js:166), refresh extends; absorbed damage is not counted as a hit (sim.js `damage`: `if (amount <= 1e-6) return;` before `hits`/`damageDealt`) |
| heal + shield on one `self` (share 0.75) | 19.5 + 30 | 16.5 hp/s | | needs two damage abilities at 100 % hit to break even | |

Measured:
- E14: `beam:damage` every 3 s vs `self:shield` every 3 s, 30 s, 100 % hit → **0.0
  damage reached hp**.
- E2: `[beam:dmg, self:heal, self:shield]` vs `[beam, bolt, cone :damage]` → **8/0**
  wins, shield up 60 % of the time, healed 69, took 72 total over 20 s.
- E2 mirror sustain vs sustain → 7/8 draws at 44 s (arena burns both), 0 damage
  landed on either side the whole fight.
- Same kit under the in-flight per-delivery cooldowns: still **8/0** (E5, exp5).

Verdict: at any cooldown ≤ 40/26 × CD_damage ≈ 4.6 s, one shield ability nullifies
one damage ability; heal alone equals one damage ability. This is the largest
remaining degenerate loop and it is NOT touched by the in-flight edits.

### 2.3 Damage over time and impulses

| effect | registry | at CD 3 | sim facts |
|---|---|---|---|
| burn | 7 dps × 4 s = 28 | refresh every 3 s → **permanent 7 dps** = 21 per 3 s (0.8 of a damage hit), cannot miss once applied, ignores armor/damage channels (sim.js:1197–1200), eaten by shield (effects.js:264) | refresh = `max(dps)`, `max(until)` (effects.js:104–106): never stacks, never double-ticks — correct rule, keep |
| knock | mag 2.4 → **+9.6 m/s added to CONTROL velocity `vx/vz`** (effects.js:131) | | NOT the knockback channel: `kx/kz`/`KNOCKBACK_DRAG` (config.js:314) are untouched; the move integrator (sim.js:1697–1702) pulls `vx` back to the desired velocity at `accel` (12–36 m/s²) or `BRAKE_ACCEL` 30 |
| pull | mag 3.0 → +12 m/s toward caster | | same path |

Measured peak displacement vs a control body (E7b):

| effect | target standing | walking toward caster, accel 12/24/36 | walking away, accel 12/24/36 |
|---|---|---|---|
| knock 9.6 m/s | 1.30 m | 3.68 / 1.76 / 1.28 m | 0 / 0 / 0 m (the body is already at top speed away; the integrator clips) |
| pull 12 m/s | 2.20 m | 3.29 / 2.49 / 2.05 m | 5.80 / 2.80 / 2.05 m |

So the displacement of a knock is a function of the VICTIM's `accel` stat (a
3× spread), a knock on a fleeing body does nothing, and a pull on a fleeing
low-accel body is a 5.8 m yank. Neither interrupts at HEAD (interrupt lives only in
hardcoded smash/charge, sim.js:1133/1531); (wt) knock interrupts, pull does not
(inconsistent). Recommendation §9 R8: route both through `kx/kz` so the impulse is
a property of the hit, not of the victim's build.

### 2.4 Buffs

| effect | registry | at CD 3 | fact |
|---|---|---|---|
| boost | ×1.35 for 5 s | **permanent** (5 > 3) | `boost(cooldown)` ×1.35 makes every ability ~2.2 s and re-buffs itself: measured 96–97 % uptime, 1.30 casts/s, 8/0 wins in 8.6 s (E11, exp5) |
| weaken | ×0.7 for 4 s | **permanent** on any target hit every ≤ 4 s | measured 95 % uptime; `weaken(speed)` 0.7 on a body = a 30 % permanent slow; armor weaken divides incoming by max(0.25, mul) (sim.js:1201) |
| cleanse | removes burn/root/blind/silence/weaken, sets `stun = 0` | 1 per 3 s | **cannot be cast while stunned or silenced** (`startSkill` refuses before the act, sim.js:863–865), so the two effects the prompt says it removes (`prompt.js:591` "removes … silence, stun") are exactly the two it can never remove. Prompt rule 1 violation. Blink-carried cleanse (10 kits in DB) has the same limit |
| wall | 4×1×2.2, 5 s, 3.2 m ahead of caster, lands on miss too (WORLD class, deliver.js:123) | 5/3 = 1.67 walls permanently from one ability; 3 wall abilities → measured **4 concurrent walls** (HEAD), 3 (wt) | `nav.js:46` builds the route graph ONCE from static `SOLIDS`; `moveTo` never sees a temporary wall and walks into it (pinned). Measured wall league: hits/s 0.01 both sides, 5/8 fights stalemate to 41 s |

### 2.5 Zone (delivery, but it is where effects stack)

`zone`: radius 3.0 (+ target radius → 4.5 m effective), duration 3.0, 6 ticks at
0.5 s, per-tick magnitude ×0.267 (`ZONE_TOTAL_SHARE 1.6 / 6`, compile.js:229–243).

| zone atom | per tick | while inside | note |
|---|---|---|---|
| damage | 6.93 | 13.9 dps | 1.6 hits if you stand the whole 3 s |
| burn | 1.87 dps × 1.07 s | refreshes each tick → 1.87 dps permanent while inside + 1 s | weak |
| stun | 0.24 s | 48 % stun uptime AND stun freezes movement → the victim crawls out at ~1.5 m/s average; measured 32 % stun uptime, 65 % time-in-zone (HEAD); with immunity (wt): one 0.24 s stun per 3.24 s, 6 % uptime | |
| root | 0.373 s | lapses between ticks (period 0.5) → 75 % while inside; measured 51 % root uptime HEAD, 9 % wt | |
| silence | 0.587 s | continuous while inside | measured 41 % HEAD |
| blind | 0.667 s | continuous | |
| pull | 0.8 → 3.2 m/s per tick | ~0.2 m per tick, ~0.4 m/s average inward drift vs 5.8 m/s walking | negligible |
| knock | 0.64 → 2.6 m/s per tick outward | pushes the victim OUT of the zone | self-defeating |
| shield/heal/boost (SELF on WORLD delivery) | applied to the caster only on ticks that hit the enemy (deliver.js:590–593 → `applyEffect` → `to = src`) | a zone:heal heals you only while the ENEMY stands in it | counter-intuitive; the gauntlet's `conjurer` (`zone: heal+damage`) relies on it |

Stacking: at HEAD zones are independent objects; one ability at CD 3 with 3 s
duration and 0.45 s wind-up covers 85 % of the time; two zone abilities = a
permanent overlapping field; three → measured max 3 concurrent, victim inside
71–77 % of the fight. (wt) one-per-ability cap → still 3 with three zone abilities.

---

## 3. Deliveries at a 2–3 s cadence

| delivery | HEAD cost / windup / recover / range | key numbers at CD 3 (wt CD) | what it means |
|---|---|---|---|
| beam | 5 / 0.65 / 0.10 / 24, LOS, instant | 26 dmg per 3.0 s = 8.7 dps; 24 m + muzzle + radius + 0.4 = 27.6 m centre-to-centre | the only instant hitscan; 81 % hit rate on the hardcoded laser (config.js:851); at ≤ 3 s it out-damages everything that has to travel |
| cone | 4 / 0.28 / 0.28 / 3.4, power 1.7, ground | 44.2 dmg per 1.8 s (wt) = **24.6 dps** at ≤ 4.9 m | at CD 1.8 the cone is the highest dps in the grammar by 2×; jump-dodgeable (0.28 wind-up vs 0.16 reaction) |
| bolt | 4 / 0.34 / 0.16 / 18, speed 22, blocked by solids | 26 per 2.2 s (wt) = 11.8 dps; flight 0.82 s at max range; hit disc radius+0.35 = 1.85 m | a perpendicular strafer at 5.8 m/s moves 4.75 m in flight → miss without lead; measured 71 % (led) / 86 % (unled, at 10 m) vs a 5.8 m/s strafer (E10b) — 22 m/s is fast enough that lead barely matters inside 12 m |
| lob | 4 / 0.5 / 0.2 / 15, speed 12, splash 1.8, flies over everything | flight up to 1.25 s + 0.5 wind-up = **1.75 s** of lead; splash + radius = 3.3 m; min range radius+splash = 3.3 m | a target moving > 3.3/1.75 = 1.9 m/s in any non-radial direction is out of the circle unless led; measured 57 % vs a 5.8 m/s strafer with NO argument, 29 % with a metres argument (E10; see §7.2) |
| zone | 5 / 0.45 / 0.25 / 12, r 3.0, 3 s | see §2.5 | lands along facing at min(range, enemy distance) — no placement control at HEAD; (wt) aim point |
| dash | 4 / 0.18 / 0.26 / 8.0, ground | 8 m + own radius + target radius sweep, every 3 s | **instantaneous translation**: `me.x += ux*travel` in `resolveDelivery` (deliver.js:366) — measured z: 0.0 → 7.3 in ONE tick (E13). It is a blink with a hit line and a 0.18 s telegraph; the only dodge window is the wind-up (jump 0.06+0.033+0.067 think = 0.16 < 0.18, barely) |
| blink | 5 / 0 / 0.18 / 7.5 m, 0.28 s i-frames | 7.5 m every 3 s ≈ dash parity; i-frames 9 % uptime | with `self:boost(speed)` permanent (×1.35 → 7.8 m/s) a kiter with blink cannot be caught by walking (5.8) and only matched by dash; kit `[bolt:dmg, blink, self:boost(speed)]` measured 97 % boost uptime |
| self | 3 / 0.30 / 0.18 | see §2.2 | |
| jump | 5 / 0.06 / 0.16 / 0.55 airborne (≈ 0.48 above 0.35 m) | 20 % airborne at CD 2.4 (wt); 0.77 s of no orders per jump | self-limiting; fine |

Fight-length baseline (E1, symmetric `[beam, bolt, cone]:damage` at 100 % hit,
hold 9 m so the cone never fires):

| cooldown | length | casts/s | busy |
|---|---|---|---|
| HEAD derived (9.9–10.8 s) | 33.0 s | 0.21 | 12 % |
| fixed 3 | 10.9 s | 0.65 | 40 % |
| (wt) per-delivery | 9.9 s | 0.71 | 42 % |
| fixed 2 | 7.9 s | 0.90 | 55 % |
| fixed 3, hp 300 | 15.4 s | | |
| fixed 3, hp 60 | 4.8 s | | |

At 100 % hit and today's magnitudes, 180 hp lasts 10 s. Real minds land ~48 % of
casts (DB), and half their casts are not damage. The rescale factor therefore
depends on the hit rate the aim-point API and the bake-off minds actually
achieve (§10.3 gives the formula).

---

## 4. Degenerate loops, ranked

| # | loop | HEAD measurement | in-flight status | needs (§9) |
|---|---|---|---|---|
| L1 | **Shield wall**: one `self:shield` nullifies one damage ability (40 ≥ 26 per cycle) | 0 damage through in 30 s (E14); sustain kit 8/0; mirror 44 s draws | **open** | R2 |
| L2 | **Infinite heal**: 8.7 hp/s = one damage ability | with shield: 8/0, healed 69–106 | **open** | R3 |
| L3 | **Perma-silence** with two silence abilities | 81–93 % uptime, victim casts 0.11/s | 31 % (immunity) | R1 (class DR) |
| L4 | **Stun chain** | 66 % (3 abilities), 38 % (stun+dmg ×2) | 22 % / 14 % | R1 |
| L5 | Root / blind chains | 63 % / 85 % | ≈ 30 / 45 % ceiling | R1 |
| L6 | **Control rotation** stun→silence→root | — | 44 % act-lock + 35 % move-lock with 3 abilities (E15) | R1 |
| L7 | **Permanent field** | 3 zones, victim inside 77 % | 3 zones (one per ability) | R4 |
| L8 | **Wall maze** + static nav | 4 walls, 41 s stalemates 5/8, hits/s 0.01 | 3 walls, same stalemate | R5 + nav rebuild |
| L9 | **Permanent boost / weaken** (5 s and 4 s > CD) | 96–97 % uptime; cooldown boost → 1.30 casts/s, 8/0 in 8.6 s | **open** | R6 |
| L10 | **Uncatchable kiter** (blink 7.5 m / 3 s + permanent speed boost) | blink parity with dash; walk speed 5.8 vs boosted 7.8 | open | R6, R10 |
| L11 | Zone:stun pin (stun freezes movement so the victim cannot leave the field) | 32 % stun uptime, 65 % in zone | 6 % (immunity) | closed by R1 |
| L12 | Burn permanence | 7 dps forever at any cadence ≤ 4 s | acceptable (non-stacking); rescale with damage | R7 |
| L13 | Cleanse cannot answer stun/silence; prompt says it does | — | open | R12 |
| L14 | Cone dps at CD 1.8 (24.6 dps) | — | (wt) introduces it | delivery table §10.1 |

---

## 5. Interrupts and stun vs a running cast

HEAD:
- `interruptCast` (sim.js:1023–1035) looked up `SKILLS[act.id]` — the hardcoded
  table — so for `k1..k3` the lookup was `undefined` and returned false. The
  `interruptible: d.windup > 0.2` flag from compile.js:139 was therefore dead for
  every player creature. Only the hardcoded smash/charge ever called it.
- Grammar `stun`, `knock`, `pull` never called it.
- A stun/silence/root status placed on a body mid-wind-up does NOT stop the cast:
  measured E8, beam ordered at 0.3 s, status applied at 0.2 s into the wind-up →
  damage still landed for all three. `stepAct` (sim.js:1361–1416) has no stun
  gate; `resolveStrike` has none either.

In-flight (wt): `defOf` in `interruptCast`, `deps.interrupt` wired, called from the
stun and knock atoms when `to !== src`. Measured 13 interrupts over 8 matches of
`bolt:stun` vs a beam caster. Remaining gaps:

1. `pull` does not interrupt while `knock` does (effects.js:139–145 wt). Both are
   impulses; make them agree (either both or neither).
2. `silence` does not cancel a running wind-up. Silence is the anti-caster tool;
   without cancel it is strictly weaker than stun (which also freezes movement).
   Recommend: silence cancels a wind-up in progress (not recover), same door.
3. Interruptible set = windup > 0.2 → beam, cone, bolt, lob, zone, **self** (0.30).
   A `self:heal` can be knocked out of. Reasonable at 3 s cooldowns; state it in
   the prompt kit block (a fact about the world).
4. The cooldown is spent at cast start (sim.js:912) and an interrupt does not
   refund. At 3 s that is the right price; document it.
5. `interruptCast` requires `!act.spent` — a stun landing during `recover` does
   nothing extra; correct.
6. Stun on an airborne body: `moveStep` freezes horizontal velocity anyway; the
   jump completes; correct.

---

## 6. Perception facts that affect control play

- `arena.obstacles` (sim.js:585–587) serialises `{x, z, hx, hz}` only: a mind
  cannot tell a temporary wall from a block and is never told `until`. Add
  `temporary`/`until`.
- `p.self.kit[k].cooldown` etc. are live; `immune` is added (wt) but not yet in
  `prompt.js perception()` — `tools/checkprompt.mjs` will flag it.
- Absorbed damage is invisible to the hitter: `damage()` returns before `dealt`
  is emitted when the shield ate everything (sim.js:1205–1215). The hitter gets
  neither `dealt` nor `missed`. Emit `dealt` with `absorbed: n` so a mind can see
  the shield working (also fixes the balance instrument's `hits` under-count).

---

## 7. `api.use(name, a, b)` argument semantics

### 7.1 What HEAD does per delivery

`makeApi.use` (sim.js:672–689): `q.use = { name, a: fin(a) ? a : null, b: fin(b) ? b : null }`.
`startSkill` (sim.js:843–911): `dx,dz` default to the facing; only two readers:

| delivery | `api.use(k)` | `api.use(k, a, b)` (pair) | `api.use(k, a)` (one number) |
|---|---|---|---|
| blink | along facing | **direction** `norm2(a, b)` relative to the caster (sim.js:872–875) | ignored → facing |
| lob | lands at the enemy's distance at strike time, along facing (deliver.js:88–97) | **ignored** (b !== null → reach null, sim.js:911) → same as no args | **metres** along facing, clamped [radius+splash, range, arena edge] at landing |
| zone | along facing at min(range, enemy distance) | **ignored** | ignored |
| beam, cone, bolt, dash, self, jump | facing | **ignored** | ignored |

Measured:
- E9: caster at (−15, 0) calls `api.use('k1', 10, 5)` meaning "go to (10, 5)" →
  lands at (−8.29, 3.35) = 7.5 m along `norm(10, 5)`; toward the point would be
  (−7.65, 1.47). A blink aimed at an absolute point goes in the direction of that
  point FROM THE ORIGIN.
- E10c: zone with `api.use('k1', 4, 4)` → centre (0, 7.3); args ignored.
- E10: lob vs a 5.8 m/s strafer at 10 m: pair (absolute lead point) 57 % = no
  argument 57 %; metres-with-lead **29 %** — the single-number API is worse than
  nothing, because the distance is along a facing that is still turning during the
  0.5 s wind-up while the number was computed for the lead point's bearing.

### 7.2 What the DB brains actually pass

Census over 78 creatures (186 `api.use` calls):

| shape | count | reading at HEAD |
|---|---|---|
| `api.use('kN')` / hardcoded names, no args | 127 | fine |
| relative pair `en.x - me.x, en.z - me.z` (kit-stub, 15 DB brains) | ~25 | direction if blink, else ignored — harmless since they `faceAt` first |
| **absolute point as a pair** — `a.x, a.z`, `tp.x, tp.z`, `dest.x, dest.z`, `mid.x, mid.z`, `wallTarget.x, wallTarget.z`, `aim.x, aim.z`, `lead.x, lead.z` | ≥ 12 | blink: wrong direction; lob/zone/others: silently dropped |
| single number | **0** | — |

Example `c_35e1741f-274` BARROW WARDEN (`[zone:damage+pull, lob:damage+weaken(speed), self:shield+boost(armor)]`):
`api.use('k2', a.x, a.z)` with `a = V.lead(...)` — the lead is discarded, the mortar
lands at the enemy's current distance along the facing; `api.use('k1', a.x, a.z)`
for the zone — discarded, the field lands on the enemy's current position. The
mind believes it is leading and is never told otherwise (no event distinguishes
"argument ignored").

### 7.3 Proposed unambiguous aim API (the in-flight edit implements most of it)

```
api.use(name)                 → along facing; lob/zone at the enemy's distance   (unchanged)
api.use(name, { x, z })       → AIM POINT (absolute, ground plane):
    beam / bolt / cone        face the point (wantHeading); the strike uses the facing at strike time
    lob                       land ON the point, clamped to [radius+splash, range], arena edge     (wt: done)
    zone                      place the disc ON the point, clamped to range                        (wt: done)
    dash                      face the point; heading LOCKED at the end of the wind-up (like charge); travel min(distance, dist to point)
    blink                     toward the point, stop at it if nearer than distance                (wt: done)
    self / jump               ignored
api.use(name, dx, dz)         → DIRECTION for EVERY delivery (today only blink): sets wantHeading = heading(dx, dz),
                                lob/zone at the enemy's distance along it. Keeps every existing pair call meaningful.
api.use(name, metres)         → keep for lob only, documented as "along your facing"; prefer the point form
```

Rules the sim must add for this to be honest:
- The prompt must state the turn budget: "the body turns at turnRate × turnScale
  during the wind-up; order the facing on the thought before, or the cast fires
  where the body is pointing when the wind-up ends" (a fact line, not a tactic).
- `dash` needs a heading lock at the end of the wind-up and a travel phase
  (§9 R9) so the aim point means something.
- The refusal/miss events must say when a point was clamped: emit `aimClamped`
  ({ asked, landed }) on lob/zone/blink so a mind that asked for 14 m and got 12
  learns it.
- Reject `{x, z}` with non-finite fields as `refused/aim`, not silently as "along
  facing" (wt: `at = null` silently).

### 7.4 What the in-flight edit still lacks

- Numeric pairs remain "direction for blink, nothing for the other eight"; the
  12+ absolute-pair brains stay wrong. Adopt "pair = direction for all" (above).
- `prompt.js verbs()` line 916 still says "a,b are the direction argument blink
  takes" and `DELIVERY_LINE.lob` (prompt.js:569) still documents the metres form;
  `perception()` lacks `immune`; `checkprompt`/`checktactics` must be re-run.
- `kitView` (sim.js:400–470) does not expose whether an ability accepts a point;
  add `aim: 'point' | 'direction' | 'none'` per kit entry so the mind can branch
  without re-reading the prompt.

---

## 8. Magnitude rescale for 25–40 s fights at ~1 cast/s

Arithmetic, not opinion, with the assumptions written down:

```
target fight T = 30 s, hp 180 (default), sustain returns 25 % of damage
gross damage needed per side ≈ 180 × 1.25 = 225 hp
casts/s c = 0.8 (ceiling 1.34, minds position between casts)
damaging share s = 0.6 (two of three abilities carry damage or burn)
hit rate h = ?           → per-hit damage D = 225 / (T × c × s × h) = 15.6 / h
    h = 0.50 (today)     D ≈ 31   → 26 is already about right
    h = 0.65 (aim point) D ≈ 24
    h = 0.80 (smart)     D ≈ 19
```

The rescale is a function of the hit rate the new minds achieve; the stationary
100 %-hit duel (10 s) is the floor, not the target. Recommendation: hold `damage`
at 26 for the first bake-off, make FIGHT LENGTH and CASTS/S first-class objectives
in `tools/atombalance.mjs`, then scale `damage`, `burn`, cone `power` by the
measured `15.6 / h`. What must move regardless of `h`:

| atom | HEAD | proposed base (3 s cadence) | reason |
|---|---|---|---|
| shield | 40 / 5 s | **12 / 2.5 s** (≈ 0.45 hit, expires before the next cast) | L1: must not absorb a whole cycle of one damage ability |
| heal | 26 flat | **max(5, 0.15 × missing hp), cap 20** | L2: self-limiting, rewards timing; at 90 missing → 13.5 per 3 s = 4.5 hp/s < one damage ability |
| burn | 7 dps × 4 s | 4.5 dps × 4 s (18 total ≈ 0.7 hit), non-stacking | permanent at any cadence; keep below a hit |
| stun | 0.9 s | 0.8 s, immune 3.0 (ceiling 21 %) | |
| root | 1.4 s | 1.2 s, immune 3.0 (29 %) | |
| silence | 2.2 s | **1.6 s**, immune 3.0 (35 %), cancels wind-ups | |
| blind | 2.5 s | 2.0 s, immune 3.0 (40 %) | perception lag 1 s already makes it strong |
| knock | +9.6 m/s on `vx` | 6 m/s on `kx` (drag 9 → 2.0 m, build-independent) | §2.3 |
| pull | +12 m/s on `vx` | 6.5 m/s on `kx` (→ 2.3 m) | |
| boost | ×1.35 / 5 s | ×1.30 / **2.4 s** (80 % max uptime); cooldown channel capped ×1.25 | L9 |
| weaken | ×0.7 / 4 s | ×0.75 / **2.4 s** | L9 |
| wall | 5 s, 1 per ability | 4 s, **1 per caster** total | L8 |
| cleanse | as is | cost 3 → 2; prompt corrected (does not remove stun/silence) | L13 |
| damage | 26 | 26 until `h` is measured, then 15.6 / h | §8 |

Zone: keep per-tick share but `duration 2.4 s` (< CD 3.0 → 80 % ceiling from one
ability), `ZONE_TOTAL_SHARE 1.4`, max **2 zones per caster**.

---

## 9. Rules the sim needs that pricing cannot provide

R1 **Control diminishing returns (beyond per-id immunity).** Keep the in-flight
per-id immunity (3.0 s). Add class DR on the TARGET:
```
classes: ACT = {stun, silence}   MOVE = {stun, root}   SENSE = {blind}
on applying control c of class X at t:
  if lastExpiry[X] > t − 1.0  (another control of X active or expired < 1 s ago):
      streak[X] += 1; duration ×= [1, 0.5, 0.25][min(streak, 2)]; if streak ≥ 3 → refuse 'immune'
  else streak[X] = 0
  lastExpiry[X] = max(lastExpiry[X], t + duration)
  streak resets when 4 s pass with no control of X
```
Ceiling: act-lock ≤ ~40 % of any 10 s window even with three different controls.
Zone ticks count as applications (immunity already limits them). Report the
scaled duration in the `status` fx record so the viewer draws the real length.

R2 **Shield cap.** Non-additive (keep), magnitude ≤ 0.5 of a base hit, duration
< its cooldown, and `damage()` must emit `dealt {amount:0, absorbed}` so the
hitter and the instrument see it.

R3 **Heal falloff.** Percentage of missing hp with a floor and a cap (above), OR a
per-match healing budget of 60 % maxHp. Percentage-of-missing is simpler and
self-explaining in one prompt line.

R4 **Zone cap.** One per ability (wt) AND at most 2 live zones per caster; a
third cast replaces the oldest. Duration < cooldown.

R5 **Wall cap + navigation.** One wall per caster; `nav` must include temporary
solids: rebuild `world.nav[side]` on wall add/expire (cheap: two graphs, ≤ 2
walls) or make `steer` test `world.solids` for the next waypoint segment. Without
this `moveTo` (the verb the prompt recommends over raw `move`) pins a body on
every wall it meets.

R6 **Buff duration < cooldown.** Boost/weaken 2.4 s at CD 3; `channelMul('cooldown')`
clamped to [0.6, 1.25]; `speed` boost clamped so boosted speed ≤ `BUILD_AXES.maxSpeed.max`.

R7 **Burn stacking rule.** Keep refresh-not-stack (effects.js:104–106); cap
`dps` at the largest single source; burn is absorbed by shield (keep).

R8 **Impulses through the knockback channel.** `knock`/`pull` add to `kx/kz`
(drag `KNOCKBACK_DRAG`), not `vx/vz`; both interrupt; both respect i-frames
(today `applyEffect` for knock/pull ignores `iframes` — a blinking body is
knocked; `damage()` checks `dst.iframes` but the impulse atoms do not).

R9 **Dash as travel, not teleport.** A `dash` phase at 18–20 m/s (0.4–0.45 s for
8 m) with heading locked at the end of the wind-up, contact test per tick (as
`dashStep`), jump-dodgeable during travel, stopped by solids. Today's one-tick
translation is undodgeable and unreadable.

R10 **Blink at 3 s.** Either distance 6.0 m or i-frames 0.20 s; and blink must not
reset `kx/kz` for free (today `vx *= 0.3`, deliver.js:410).

R11 **Silence cancels a wind-up** (through `interruptCast`), and `startSkill`
allows a SELF-only `cleanse` ability while silenced (or the prompt stops claiming
cleanse removes silence/stun).

R12 **Prompt truth fixes**: `EFFECT_LINE.cleanse` (prompt.js:591), `verbs()`
`api.use` line (916), `DELIVERY_LINE.lob` (569), `perception()` `immune`,
`kitView.aim`, obstacle `until`.

R13 **Sudden death re-derivation.** After the rescale, sweep `SUDDEN_DEATH_AT`
so ~25 % of fights reach the burn (config.js:113–155 gives the method); at
today's 63 % the arena, not a mind, decides most fights.

R14 **Instrument corrections** for `tools/atombalance.mjs`: count absorbed hits
as hits; report fight length, casts/s, hits/s, control uptime and time-in-zone
per kit (the harness in `mechanics-audit-harness/` already computes these);
never use a 100 %-hit stationary pilot as the only pilot (it makes shield look
like a wall and every projectile look like a beam).

---

## 10. Proposed tables

### 10.1 Delivery → cooldown, wind-up, recover, range, magnitude multiplier, aim

| delivery | cooldown | windup | recover | range / distance | power | aim form | notes |
|---|---|---|---|---|---|---|---|
| beam | 3.0 | 0.55 | 0.10 | 22 | 1.00 | direction / point→face | instant, LOS; interruptible |
| bolt | 2.2 | 0.30 | 0.15 | 18, speed 24 | 1.00 | direction / point→face | dodgeable; blocked by solids |
| cone | 2.0 | 0.28 | 0.28 | 3.4, half-angle 0.96 | **1.40** (from 1.7) | direction / point→face | at 1.8 s and ×1.7 the cone was 24.6 dps; at 2.0 s and ×1.4 it is 18.2 dps, still the highest by design (you paid the approach) |
| lob | 2.6 | 0.50 | 0.20 | 15, speed 12, splash 1.8 | **1.25** | **point** (lands on it) | hardest to land, pays; no direct-hit in flight |
| zone | 3.0 | 0.45 | 0.25 | 12, r 3.0, **duration 2.4**, 5 ticks | share 1.4 | **point** (disc on it) | 1 per ability, ≤ 2 per caster |
| dash | 3.0 | 0.18 | 0.26 | 8 m at 20 m/s (0.4 s travel) | 1.15 | point / direction, heading locked at wind-up end | ground; jump-dodgeable in travel |
| blink | 3.0 | 0 | 0.18 | 6.5 m, i-frames 0.25 | — | point (stop at it) / direction | |
| self | 3.0 | 0.30 | 0.18 | — | 1.00 | none | interruptible |
| jump | 2.4 | 0.06 | 0.16 | air 0.55 | — | none | |

### 10.2 Effect → base magnitude / duration at a 3 s cadence

| effect | magnitude | duration | immunity (per id) | class for DR |
|---|---|---|---|---|
| damage | 26 (rescale by 15.6 / h after the bake-off) | — | — | — |
| burn | 4.5 dps | 4 s, refresh not stack | — | — |
| knock | 6 m/s on `kx` (≈ 2.0 m) | — | — | interrupts |
| pull | 6.5 m/s on `kx` toward caster (≈ 2.3 m) | — | — | interrupts |
| stun | — | 0.8 s | 3.0 s | ACT + MOVE |
| root | — | 1.2 s | 3.0 s | MOVE |
| silence | — | 1.6 s | 3.0 s | ACT; cancels wind-up |
| blind | — | 2.0 s | 3.0 s | SENSE |
| shield | 12 | 2.5 s, non-additive | — | — |
| heal | max(5, 0.15 × missing), cap 20 | — | — | — |
| cleanse | removes burn/root/blind/weaken (+ silence/stun only if castable) | — | — | — |
| wall | 4 × 1 × 2.2 | 4 s, 1 per caster | — | nav rebuild |
| boost | ×1.30 (cooldown channel ×1.25 max) | 2.4 s | — | — |
| weaken | ×0.75 | 2.4 s | — | — |

Share for 2/3 effects on one ability stays 0.75/0.6 on magnitude and duration;
immunity is NOT divided (wt compile.js:168–172 already does this — correct).

### 10.3 DR rule, stated once

Per-id immunity 3.0 s after expiry (wt) + class DR (R1): the second control of the
same class landing within 1 s of the previous one's expiry lasts half, the third a
quarter, the fourth is refused with `missed/immune`; the streak clears after 4 s
without a control of that class. Zone ticks are applications. Immune windows and
the current streak are visible in perception (`immune` list — add `dr: {ACT, MOVE, SENSE}`).

---

## 11. File:line index of every defect named

| id | where | what |
|---|---|---|
| D1 | sim.js:1027 (HEAD) | `interruptCast` reads `SKILLS[act.id]`; grammar abilities never interruptible — fixed (wt) via `defOf` |
| D2 | compile.js:139 | `interruptible` flag computed, unread at HEAD |
| D3 | effects.js:131–145 | knock/pull add to `vx/vz`; displacement depends on victim `accel`; no i-frame check; no `KNOCKBACK_DRAG` |
| D4 | effects.js:166–167 | shield `max` + refresh → 100 % absorption of one damage ability at CD ≤ 4.6 s |
| D5 | effects.js:173 | flat heal 26 = one damage ability at CD 3 |
| D6 | effects.js:221–227 (HEAD) | boost/weaken 5 s / 4 s > 3 s cooldown → permanent |
| D7 | deliver.js:298–326 (HEAD) | zone lands along facing only; zones stack unbounded (wt: one per ability) |
| D8 | deliver.js:366 | dash is a one-tick translation |
| D9 | deliver.js:88–97, sim.js:911 | lob pair args discarded; single number = metres along a turning facing (29 % vs 57 %) |
| D10 | sim.js:872–875 | blink pair = direction; absolute points misread |
| D11 | nav.js:46 | route graph built once from static `SOLIDS`; temporary walls invisible to `moveTo` |
| D12 | effects.js:166–217 (HEAD) | walls unbounded (wt: one per ability, still one per ability × 3) |
| D13 | sim.js:863–865 + prompt.js:591 | cleanse cannot be cast while stunned/silenced; prompt says it removes both |
| D14 | sim.js:1205–1215 | fully absorbed hit emits no `dealt`, counts no hit |
| D15 | sim.js:585–587 | obstacles in perception carry no `temporary`/`until` |
| D16 | prompt.js:916, 569 | `api.use` docs describe pair-for-blink and metres-for-lob only; no point form; no `immune` |
| D17 | config.js:105, compile.js:31–33 | "median 22 s / 25.8 s" prose is stale; DB median is 36.3 s, 63 % of fights burn |
| D18 | registry.js:120 + 388 (wt) | cone at CD 1.8 with power 1.7 = 24.6 dps, 2× any other delivery |
| D19 | effects.js:139–145 (wt) | pull does not interrupt while knock does |
| D20 | sim.js:702–722 (wt) | `{x, z}` with bad fields silently becomes "along facing" |

---

## Appendix A — harness

`reports/combat/mechanics-audit-harness/` holds `harness.mjs` (world driver, spammer
pilot, per-tick probes for stun/silence/root/blind/shield/boost/zone/wall/busy
uptime) and `exp1..exp5.mjs` (the experiments quoted as E1–E15). All import the
repo by absolute path and run in one process:
`node reports/combat/mechanics-audit-harness/exp1.mjs`. The pilot hits 100 % in a
stationary duel by construction; it is a floor-finder, not a balance instrument.

## Appendix B — raw results (8 seeds each unless stated)

```
E1  DMG3 mirror   derived: t=33.0 casts/s 0.21 | CD3: t=10.9 0.65 | CD2: t=7.9 0.90 | wt: t=9.9 0.71 | hp300 CD3: 15.4 | hp60 CD3: 4.8
E2  [beam:dmg, self:heal, self:shield] vs DMG3 (CD3)      8/0  t=20.5  shield 60%  healed 69  took 72
    [beam:dmg, self:heal+shield, blink:shield] vs DMG3    7/1  t=20.1
    sustain mirror bolt vs beam                           1/0/7 draws t=44.4  0 damage landed  shield 98%
    (wt) [bolt:dmg, self:heal, self:shield] vs DMG3       8/0  t=20.1  healed 106
E3  [bolt:sil, lob:sil, beam:dmg] vs [beam, bolt, self:cleanse]   silence 81%  victim 0.26 casts/s  (wt: 31%, 0/8)
    [beam:sil+dmg, bolt:sil, self:shield] vs DMG3                  silence 93%  victim 0.11 casts/s  8/0
E4  3×stun 66% (wt 22%) | stun+dmg ×2 38% (wt 14%) | 2×root 63% | 2×blind 85%
E5  [zone:dmg, zone:burn, zone:root]  maxZones 3  inZone 77%  root 51%  (wt: 3, 71%, 9%)
    [zone:stun, zone:dmg, beam:dmg]   stun 32% inZone 65% (wt: 6%, 47%)
    [zone:silence, zone:dmg, beam:dmg] silence 41% inZone 53%
E6  [self:wall, beam:wall+dmg, bolt:wall] vs DMG3   maxWalls 4 (wt 3)  t=41.2  draws 5/8  hits/s 0.01
E7b knock standing 1.30 m; walking-toward accel 12/24/36: 3.68/1.76/1.28; walking-away 0
    pull  standing 2.20 m; toward 3.29/2.49/2.05; away 5.80/2.80/2.05
E8  stun / silence / root placed 0.2 s into a 0.65 s beam wind-up → beam still lands (0 interrupts)
E9  blink (-15,0) use(10,5) → (-8.29, 3.35)   [direction], point would be (-7.65, 1.47)
E10 lob vs 5.8 m/s strafer @10 m: pair 57%  metres 29%  none 57%
E10b bolt vs same: lead 71%  no-lead 86%
E10c zone use(4,4) from (0,0) facing (0,8) → centre (0, 7.3)
E11 [self:boost(cooldown), beam, bolt] vs DMG3   boost 97%  1.31 casts/s  8/0 t=8.7  (wt: 96%, 1.30, 8/0 t=8.6)
    [beam:weaken(speed), bolt, blink:shield] vs melee  weaken 95% uptime
E12 kiter [bolt, blink:cleanse, self:boost(speed)] vs melee [dash, cone:dmg+knock, self:shield]  0/8, kiter dealt 0 (shield absorbed everything)
E13 dash: z 0.0 → 7.3 in one tick
E14 beam:damage / 3 s vs self:shield / 3 s, 30 s → 0.0 damage reached hp
E15 (wt) [beam:stun, bolt:silence, lob:root] vs DMG3  stun 14% sil 30% root 21%  0/8
    (wt) [beam:sil+dmg, bolt:stun+dmg, self:heal] vs [beam, bolt, self:heal]  6/2  sil 27% stun 14%
```
