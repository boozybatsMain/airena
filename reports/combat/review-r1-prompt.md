# Review r1 — the mind prompt: truth, completeness, tactics

Reviewer: prompt truth & completeness (round 1), 07.09.2026, HEAD 8699fb6 + working tree.
Subject: `src/brain/prompt.js`, rendered by `node reports/combat/renderprompt.mjs`
(kit A lob/zone/blink vs kit B bolt/cone/self, default bodies → `reports/combat/prompt-rendered.txt`).
Verified against `src/core/{sim,deliver,effects,config}.js`, `src/skills/{registry,compile}.js`,
by reading and by controlled-world experiments (scratchpad `exp.mjs`, `exp2.mjs`; harness = `createWorld`
with compiled kits, blocks removed, bodies pinned, scripted `think`).

**Score: 64 / 100.** Verdict: not shippable as "true and complete" yet. The prompt is clean of tactics,
its api/perception inventory is complete, and every number the gates trace agrees with the sim — but two
mechanics the founder singled out (controls, the aimed mortar) are described falsely, one listed event
can never arrive on the grammar path, and the kit half of the prompt (the half every player creature
reads) is outside the mechanised number guarantee the file's own docstring promises.

## Gates

| gate | result |
|---|---|
| `node tools/checkprompt.mjs` | green: 124 emitted values agree both ways (fixture prompt only — see F7), kit prompt has its three verbs, 395 segments judged, tactics 0, docs ok |
| `node tools/checkbehaviour.mjs` | green: 40 claims measured (26 fixture timings/reach, 12 kit reaches, kit field count, null kit) |

## Claims verified (27), with where

| # | claim (rendered prompt) | source | how | verdict |
|---|---|---|---|---|
| 1 | think 15×/s, tick 30, first p.tick = 2 | config.js:78-81, sim.js:2161-2166,2224 | read | true |
| 2 | phases served on ticks; overshoot carries (0.45 → 0.467 etc.) | sim.js:1550-1608 `stepAct`, prompt.js:111-171 | read + E11 (strike 13 ticks after the order tick) | true |
| 3 | cooldown counted from the order step, cooldown channel speeds the countdown | sim.js:1071, 2192-2202 | read | true |
| 4 | laser/beam reach 27.6, cone 4.9, bolt 21.983, lob 18.3, zone 16.5, dash 11 (equal bodies) | checkbehaviour | measured by gate | true |
| 5 | bolt connects within radius+0.35; block/wall ends it silently; out of range silent | deliver.js:519-537 | read + E3 (bolt miss → no event) | true |
| 6 | mortar touches nothing in flight; splash + target radius; empty circle → `missed/aim`; near bound radius+splash; edge bound splash | deliver.js:97-104, 477-514 | read + E3 | true |
| 7 | disc: 5 ticks, first on the landing step, every 0.5 s, not above 0.35 m, one disc per ability | deliver.js:373-395, 597-616; compile.js zone block | E11: hits at 0.5,1.0,1.5,2.0,2.5 = 5 × 6.72 = 33.6 | true |
| 8 | blink to a point stops at it; velocity ×0.3; never inside a block; clamped by walls | deliver.js:416-431, sim.js:1350-1368 | read + E17 (3 m into a wall 3 m away) | true |
| 9 | wind-up > 0.2 s cancellable by stun/silence/knock/pull; `interrupted`/`interruptedEnemy` | compile.js:163, sim.js:1180-1200, effects.js knock/stun/silence | E16: fan (0.3) cancelled, lunge (0.2) not | true |
| 10 | heal = 12 % of missing, floor 4, cap 16, never above max | effects.js heal | E8: 178→+2, 100→+9.6, 20→+16 | true |
| 11 | knock/pull on the knockback slot, drag 9, ≈ v²/2a | effects.js knock, sim.js:2033-2040 | E9: 1.35 m measured vs "about 1.44" (0.4 m/s cut-off) | true, 6 % high |
| 12 | damage order: attacker damage channel → defender armor divisor → shield → hp; whole-shield hit → `dealt/damaged` amount 0 + absorbed | sim.js:1380-1470 | read | true |
| 13 | fire ticks per step through shield, ignores channels, `burning/burn` every 10 hp, never `damaged` | effects.js:tickStatus | E10 | true |
| 14 | arena burn ignores shield/channels, fraction of max hp; 0.015(t−30); kills from full at 41.547 | sim.js:1495-1520 | read + integral | true |
| 15 | invulnerable target: attacker `missed/invulnerable` (+effect) | effects.js:125, sim.js:1396 | E4 | true (but see F4) |
| 16 | silence refused with `silenced` except cleanse-carrying aura/blink/leap; `api.ready` mirrors every refusal | sim.js:808-818, 963-1001 | read | true |
| 17 | refused reasons: cooldown/busy/stunned/silenced/airborne/dead/unknown | sim.js:781, 984-1001 | read | complete |
| 18 | missed reasons: aim/cover/range/airborne/invulnerable/immune | deliver.js cone/beam/lob, sim.js:1702, effects.js:109-110,126 | read | complete |
| 19 | stun: no move, no turn, no cast; root: no move, turn/act/impulse work | sim.js:1913-1916, 1876, 2033-2049 | read | true |
| 20 | blind = whole enemy block from 1 s ago (BLIND_LAG 30 ticks / 2), `p.self.blinded` | sim.js:526-566 | read | true |
| 21 | vision > 1 → visible through cover; < 1 → lag | sim.js:546-556 | read | true |
| 22 | perception built for both before either's orders; `enemyStarted` on every use; `enemyCommitted` at dash lock | sim.js:2224-2286, 1117, 1570 | read | true |
| 23 | `p.enemy.kit` never null (fixture presented as beam/fan/lunge) | sim.js:655 | read | true |
| 24 | body block: accel 24 → 0.242 s, half turn 0.419 s, mass (r/1.1)³ = 2.536, spawn 31 m apart facing | sim.js:1995-2001, 1916, config.js:844-856, sim.js:147-164 | read | true |
| 25 | orders queued, last call wins; perception verbs separate 400 cap that throws | sim.js:717-745, 930-957 | read | true |
| 26 | a hit carrying ONLY controls/statuses (bolt:root) | effects.js (no emit for src on stun/root/blind/silence/burn/shield) | E13: caster hears nothing | prompt silent — F5 |
| 27 | no tactic leaks: grep for should/better/usually/prefer/avoid/keep/wait/punish/safe over the rendered prompt | prompt-rendered.txt | 2 hits, both non-tactical ("does not avoid anything", "Neither is better") | clean |

## Findings

### F1 — HIGH — the immunity window is armed when the control LANDS, not when it ends; "the longer time stands" is false for every control
- Prompt (prompt.js:934-940, rendered l. 315-322): "Nothing stacks. A second application of the same status replaces or extends the first: the longer time stands … When a control ends it leaves an immunity behind … for the seconds on the card." Card line for stun (prompt.js:656): "a stun during a stun does not add".
- Code: effects.js:108-118 — `arm()` sets `st.immune[c] = t + duration + immune` at APPLICATION, and line 108 refuses any control of an armed class while `immune[c] > t`. So the window is `duration + immune` seconds from the moment the control lands, and a second stun/root/silence/blind inside the control's own duration is REFUSED with `missed/immune`, never "extended".
- Measured (E1a): stun lands t=0.5; root ordered at t≈1.37 (still stunned) → `missed/immune/root`; `p.enemy.immune` = `act+move` on every thought from 0.533 to 4.467 while `p.enemy.stunned` is true. E12: stun on a running stun → `missed/immune/stun`, stun stays 30 ticks. E13: root then stun 0.5 s later → refused (`move`).
- Consequence, measured on the ladder: 650 immune refusals in 300 recent ladder games (2.17/game); 466 of them (72 %) are a FIELD refusing its own 2nd..5th tick on the body it just rooted/stunned (E1b: one zone:burn+root cast standing still = 4 `missed/immune` events). The bake-off's "immune/game 9" for casters (mortar:blind, field:root) is this shape, not a dumb mind. A mind that believes the prompt reads `p.enemy.immune=['act','move']` as "the stun is already over".
- Fix (prompt): replace the two sentences with the fact: "A control arms its immunity the moment it lands: from then until `duration + immune` seconds later, no control of those classes lands on that body — including a second copy of the same control, and including a disc's later ticks. `p.self.immune`/`p.enemy.immune` list the classes for the whole window, so while a body is stunned it already lists 'act' and 'move'. Fire, shield, boost, weaken replace/extend; stun, root, silence, blind do not — they are refused." Add to the events list: "the other effects on the same ability still land; only the control is refused." Fix (metric): count `immune` lines whose `by` is a disc tick separately, or not at all, in `tools/bakeoff.mjs:563` and `spectate.mjs`.

### F2 — HIGH — a mortar aimed at a point does NOT land on the point if the caster moves during the wind-up
- Prompt (prompt.js:583, 897-899, 1156): "toward a landing spot fixed at the strike … A mortar and a disc land ON the point, clamped to their range … everything about where it goes is read at THAT instant — your facing, your aim point".
- Code: sim.js:1068 stores `reach = Math.hypot(adx, adz)` — the DISTANCE to the point measured at the ORDER; deliver.js:98 uses that stale distance, while the direction is `aimDir(me, act.at)` from the caster's position at the STRIKE (deliver.js:279-281). The disc (deliver.js:373-378) recomputes `dist2(me, act.at)` at the strike and is exact.
- Measured (E2, point 10 m ahead, caster at 0.6 × 5.8 m/s): stationary → lands on the point; walking toward it → lands at z=11.699 (1.70 m PAST the point); walking away → z=8.301 (1.70 m short); walking sideways → 0.48 m off. The splash radius is 1.8 m: a correctly led shot on a target of radius 1.5 becomes a miss whenever the caster is closing or kiting, which is exactly when a mind aims.
- Fix (sim, one line): in `lobLanding`, when `act.at` is set use `dist2(me.x, me.z, act.at.x, act.at.z)` at the strike (as the zone does), and drop the `reach = hypot` at sim.js:1068. Then the prompt sentence becomes true. If the sim is not changed, the prompt must say "the distance is fixed at the order, the direction at the strike; a body that walks during the wind-up lands it that far off".

### F3 — MEDIUM — "a wall is built even when the delivery carrying it misses" is false for a bolt and a mortar
- Prompt (prompt.js:665): "it is built even when the delivery carrying it misses".
- Code: deliver.js:477-514 (lob miss) and :519-537 (bolt blocked / out of range) apply no atoms at all; only `resolveDelivery.land(false)` (beam/cone), `dashOver` and the zone placement apply WORLD atoms on a miss.
- Measured (E3): beam ✓, cone ✓, dash ✓, zone ✓, bolt ✗, lob ✗.
- Fix: either apply WORLD atoms in the bolt/lob miss branches (consistent with the sentence), or print the sentence per delivery: "on a beam, fan, lunge or disc it is built whether or not the delivery connects; on a bolt or a mortar only when it lands on a body".

### F4 — MEDIUM — `{ type:'evaded', skill, by }` is listed for kit minds but can never arrive from a grammar ability; the dodger gets NO event
- Prompt (prompt.js:1122): "`{ type:'evaded', skill, by }` something hit you during your i-frames".
- Code: effects.js:125-128 returns before `damage()` for every targeted atom when `to.iframes > 0`; the only `evaded` emit is sim.js:1400 inside `damage()`, reached only by the fixture laser/smash/charge. A two-effect ability produces two `missed/invulnerable` events for the attacker (E4: `damage` and `knock`), nothing for the defender.
- Measured: E4 (bolt:damage into 1 s of i-frames): orange events = [], blue = [`missed/invulnerable/damage`]. Ladder: 2 `evade` log lines in 300 games. `tools/bakeoff.mjs:610` and `spectate.mjs:289` count dodges from `evade` lines + `miss:airborne` — which is why every mind in the league reads "dodges/game 0.00"; a blink under a bolt is invisible to the metric.
- Fix: emit `evaded` (and log `evade`) once per ability in effects.js when the i-frame branch fires (dedupe per `def.id` per tick, like the impact push), then the prompt line is true; or delete the line from `eventsForKit` and say "your i-frames announce nothing to you; read p.self.invulnerable". Fix the dodge metric either way.

### F5 — MEDIUM — a hit that carries no damage announces nothing to the caster
- Prompt: `dealt` is "you hit them"; the "What is announced" paragraph (prompt.js:961-969) covers misses and statuses on YOU, not statuses landing on THEM.
- Code: only `damage()` emits `dealt`; stun/root/silence/blind/burn/shield/heal/boost/weaken/wall emit nothing to `src` (effects.js switch).
- Measured (E13): bolt:root connects → caster events = []; bolt:damage+root → `dealt` + `missed/immune/root`.
- Fix (prompt): "A hit whose effects carry no damage announces nothing to you: read p.enemy.stunned, rooted, burning, shield, immune on your next thought." Or (sim) emit `dealt` with `amount: 0` and the atom list for control-only hits.

### F6 — MEDIUM — an aim point on a facing delivery is a standing facing order that the mind's next `faceAt` silently replaces
- Prompt (prompt.js:1170-1176): "you turn toward the point at your turn rate, as api.faceAt would" — true, and therefore replaceable, but never said.
- Code: sim.js:1062-1066 sets `me.wantHeading`; applyOrders (sim.js:947) writes `q.face` every thought it is given.
- Measured (E7): bolt ordered at a 45° point, then `api.faceAt(enemy)` on later thoughts → bolt leaves at 0° (the enemy). Without the later faceAt → 45°. The common brain shape (faceAt(enemy) every thought + a led `use`) throws the lead away, silently. Also: an aura (aim 'none') ordered at a point still turns the body (E7c: heading → 90°).
- Fix (prompt, one sentence under Aiming): "The turn a point gives you is a facing order like any other: a later api.face / api.faceAt replaces it before the strike, and the shot goes where the newer order points." Or (sim) let the aim point win over `q.face` until the strike.

### F7 — MEDIUM (process) — the kit half of the prompt is outside the mechanised number guarantee
- prompt.js:35-50 promises "Every number goes out through q(label, value)… `tools/checkprompt.mjs` runs the guarantee in both directions". checkprompt.mjs:296-325 traces `brainPrompt(id)` WITHOUT kits (21 121 chars = the fixture prompt); the kit render at :344-377 is checked only for the `skills` line and block presence. The kit sections (prompt.js:573-1020: deliveryLine, effectLine, reachLine, kitBlocks, interactions) use `n()` 59 times and `q()` 0 times, so no kit-card number is traced and no stray numeral in that prose can be caught. `checkbehaviour` measures 12 kit reaches and the field count, nothing else on the kit path (no kit wind-ups, cooldowns, splash, zone ticks, iframes, impulse distances, immune windows).
- Fix: route kit numbers through `q()` with labels (`kit.<name>.<field>`), trace the kit render(s) in checkprompt, and add the kit timings/impulse/immune claims to checkbehaviour. Update the docstring until then.

### F8 — LOW/MEDIUM — the V.lead paragraph contradicts the card on the muzzle
- prompt.js:1272 prints "released … from 0.3 m ahead of your centre" (`PROJECTILE_MUZZLE`); the delivery cards (prompt.js:574,581,583) print `radius + 0.3` = "1.8 m ahead of your centre". The sim uses `me.def.radius + PROJECTILE_MUZZLE` (deliver.js:296). Two numbers for one fact in one document; the helper paragraph is the false one. Fix: print `n(me.radius + PROJECTILE_MUZZLE)` there too (helpers() needs the body passed in).

### F9 — LOW — the recovery is slowed as much as the wind-up; the prompt names only the wind-up
- Prompt: cards say "while casting … multiplied by"; interactions (prompt.js:877-879) "During the wind-up your body keeps moving at the card's share … The recovery follows: nothing can be started until it ends."
- Code: sim.js:1913-1916, 1978 scale by `defOf(me, me.act.id)` for the WHOLE act. Measured (E6, aura 0.76): speed 4.408 in wind-up AND recovery. Fix: "…and through the recovery" in both places.

### F10 — LOW — refusal during a leap's landing is `busy`, not `airborne`
- Prompt (prompt.js:593, 953): "From the crouch to the end of the landing no ability can be started (refused with reason 'airborne')". Code: sim.js:996-1000 tests `y > 0.01` before `act !== null`; y is 0 in the landing phase (sim.js:1935). Measured (E5): thoughts in `recover` → `refused/busy`. Fix: "(refused with reason 'airborne' while in the air, 'busy' during the crouch and the landing)".

### F11 — LOW — `p.self.kit` reports declared timings, the cards report served ones
- kitView (sim.js:449-452, 482) sends `windup: 0.34`, `iframes: 0.25`; the card says 0.367 s and 0.267 s. The prompt calls the kit "LIVE numbers … which is not necessarily the set the tables above were printed from" without saying the two differ by the tick rounding. Fix: one sentence: "kit timings are the declared figures; the world serves them rounded up to whole steps of 1/30 s, as the cards print them."

### F12 — LOW — memory limits and budget accounting are under-disclosed
- `api.remember`: value > 4096 bytes is dropped silently, key truncated to 32 chars (sim.js:870-886, config.js:226); `remember`/`forget` consume the 64-order budget (`budget()` at sim.js:870, 894) although the prompt calls them "the exception". Fix: state both.

### F13 — LOW — smaller truth gaps
- Knock/pull: "about v²/2a" overstates by the 0.4 m/s cut-off (E9: 1.35 vs 1.44); say "a shade under".
- Wall: the box is axis-aligned — it snaps to the nearer axis of the facing (effects.js `along = ux*ux > uz*uz`), not rotated with it; say so.
- Zone:burn — the "whole disc" total (prompt.js:851) is printed for damage only; a burn field standing still is rate × (2.0 + 1.0) s (E1b/E10 shape). Print it.
- A bolt is consumed by an invulnerable body (deliver.js:517 `continue` after applyEffect) — the shot is spent, not passed through.
- Vocabulary: kit perception still says "hop" (prompt.js:1032) where the cards say "leap"/"crouch".
- `p.enemy` has no `turnRate`, so a turn weaken on the enemy is invisible; the body block's static number is all the mind has (fine, but say "not live").

## What is right, for the record
The api and perception inventories match `makeApi`/`perceive` field for field (21 kit fields measured); the refusal and miss reason lists are complete; the served-duration model matches `stepAct` to the tick; the reach lines are exact by binary search; the damage order, shield, fire, arena burn, silence exception, blind lag, vision channel, interrupt threshold, heal share, zone tick schedule and blink clamp are all as stated. The text contains no tactics — 395 judged segments, and a manual sweep finds none.

## Scoring
80 = nothing false, nothing a mind needs missing, no tactic leaks. Two false descriptions of mechanics the founder named (controls: F1; the aimed mortar: F2) at −6 each; three medium omissions/falsehoods a mind will hit in most fights (F3–F6) at −2 to −3 each; the kit prompt not being under the number guarantee (F7) −2; the rest −1 in aggregate. **64.**

## Notes for the open questions
- "immune refusals ~9 per game": 72 % on the ladder are a disc's own later ticks (structural, E1b) and a mortar:blind's every-second cast (2.6 s cooldown inside a 5.2 s window) — the damage still lands, so casting is right. It is not a mind-quality signal until disc ticks are excluded.
- "dodges/game 0.00": cannot be anything else on the grammar path (F4) — the metric reads `evade` lines that only fixture skills write.
