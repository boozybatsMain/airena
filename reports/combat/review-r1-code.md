# Engineering quality review — round 1 (code)

Reviewer: engineering quality, 07.09.2026. Scope: `src/core/{sim,deliver,effects,config}.js`,
`src/skills/{registry,compile}.js`, `src/brain/prompt.js`, `tools/{atombalance,bakeoff,sizebalance,
matchworker,matchpool,test}.mjs`, `brains/pilots/*.js`. Working tree at HEAD 8699fb6 + uncommitted
overhaul; note that `src/skills/compile.js` / `registry.js` changed on disk during the review (the
`tune()` overlay moved from the registry into compile.js — correct, the registry is served to the
browser), so line numbers for those two files are from the 08:54 state.

**Score: 68 / 100.** The simulation core is correct where it matters — same seed gives the same
log in-process and across processes with kits and pilots, all 50 invariants pass, `checkisolate`
holds 25 attacks, `checkprompt`/`checkgrammar`/`checkprices`/`checkkits`/`checkbehaviour` are green —
but two instruments are measuring a world that does not exist (a listed gate at 8 s cooldowns; the
league's "immune refusals" number is ~88 % a sim artefact), one prompt promise is broken
(`absorbed` on a partial hit), and the overhaul left ~250 lines of dead code and comments that
describe the pre-07.09 world as current. Fix the two HIGH and the `absorbed` bug and this is an 80+.

---

## How it was measured

```
node tools/test.mjs            → 50 passed, 0 failed (1.4 s)
node tools/checkisolate.mjs    → 25 attacks stopped, honest brain admitted
node tools/checkprompt.mjs     → prompt and config agree, 124 emitted values, 0 tactics
node tools/checkgrammar.mjs    → holds       node tools/checkprices.mjs → holds (r = 0.789)
node tools/checkkits.mjs       → 78 creatures legal   node tools/checkbehaviour.mjs → 40 claims ok
```

Probe script (`scratchpad/probe.mjs`, run twice as two processes):

| probe | result |
|---|---|
| rusher vs kiter, seed 777, two kits, two runs | log sha `b131fb12b13d88db` both times; identical across processes |
| controller vs rusher, seed 4242, `reset()` between | `d931a6a6c8b4c84a` both times |
| bolt 24 into shield 12 | `dealt {amount:12, enemyHp:168}` — **no `absorbed` field**; `shieldBroke` logged |
| one `zone:stun` cast on a standing body | **4 `immune` log lines, 4 `missed:immune` events** to the caster from ONE cast |
| controller(zone:stun) vs rusher, 4 seeds | 5.8 immune lines/game from 3.8 field casts |
| bake-off "caster" (Mortar dmg+blind, Field burn+root) vs brawler, 8 games | 139 immune lines from the field vs 18 from the mortar → **17.4/game are field re-ticks, 2.3/game are decisions** |
| `createNav` | 0.02 ms per graph — the wall rebuild is free |
| every `DELIVERIES[*].cooldown ≤ 3` | holds; `d.cooldown ?? cooldownPoints(...)` fallback unreachable |
| matchworker path for a job with no `cooldown` field, `real:false` (= sizebalance) | **k1/k2/k3 cooldown = 8 / 8 / 8** (registry: 2.2 / 2.0 / 3.0) |
| stun landing on a body mid-lunge | it travels 0.67 m more while stunned |

---

## Findings

### HIGH-1 — `tools/sizebalance.mjs` (a listed gate) measures bodies in an 8-second-cooldown world
`tools/sizebalance.mjs:233-242` builds jobs with `sym: true` and no `cooldown` field.
`tools/matchworker.mjs:151` keeps the legacy default `fixed = cooldown === undefined ? (real ? null : 8) : cooldown`,
so `compileKit(KIT, { size: null, fixedCooldown: 8 })` — measured: every ability at 8 s. The four
pilots read `k.cooldown` from perception and plan around 8 s. The gate `node tools/sizebalance.mjs --rounds=20`
therefore says nothing about the world the founder asked for; its verdict on hp-vs-radius pricing
(config.js "hp dearer, floor 120, 14 hp a point") was found on a cadence 2.7–4× slower than shipped.
`kitbalance.mjs` (lines 127, 404, 445) has the same hole. `atombalance` is safe only because it always
sends the key (`cooldown: COOLDOWN`, null by default).
**Fix:** flip the matchworker default to the registry (`fixed = cooldown === undefined ? null : cooldown`)
and delete the "8 s on the measuring path" paragraphs at `matchworker.mjs:131-150` and
`matchpool.mjs:180-185`; or, minimally, add `cooldown: null` to the job literal at `sizebalance.mjs:234`
and `kitbalance.mjs:127/129/404/405/445`. Then re-run sizebalance before trusting the body prices.

### HIGH-2 — a control atom on a field spams `immune` refusals every tick; the league's "immune/game" is mostly this
`compile.js:290` divides every duration by the zone share (`zk = 1.4/5 = 0.28`): `zone:stun` → 0.28 s,
`zone:root` → 0.42 s (measured). `effects.js:116` arms immunity for `duration + 3 s` on the first tick,
so ticks 2–5 of the SAME cast are refused at `effects.js:108-112`, each writing an `immune` log line
and an `emit(missed, reason:'immune')` to the caster. One cast → 4 refusals; the next cast 3.0 s later
still lands inside the window (3.0 < 0.42 + 3), so a re-placed control field lands its control once
per ~3.5 s for 0.42 s. Consequences: (a) the bake-off's `immune` metric (`bakeoff.mjs:563`,
`spectate.mjs:299`) counts these — for the "caster" creature 88 % of its 4 300–4 950 immune lines
(`league.md`, ~18/game) are field re-ticks, not a mind "casting controls into an immunity window";
the open question in the task brief is answered by the instrument, wrongly. (b) The prompt says
"a disc that catches nobody announces nothing" (`prompt.js:962`) but a disc that catches an immune
body announces `missed` four times, so a mind reading events will believe its field is missing.
(c) The panel priced stun/root/silence/blind negative partly on this.
**Fix (sim):** in `tickZones` (`deliver.js:609-612`) skip atoms whose class is immune WITHOUT logging
or emitting when the refusal is a re-tick of the zone that armed it (e.g. remember `z.controlled = true`
after the first tick and pass a `quiet` flag into `applyEffect`), or better: stop dividing CONTROL
durations by `zk` (COMBAT.md §4 already says "durations travel whole") and apply them on the first
tick only. **Fix (instrument):** in `bakeoff.mjs`/`spectate.mjs` count `immune` only when the
refusing skill is not a zone re-tick (log the `immune` line with a `tick: n` field and filter `tick > 1`).
Re-state the league table's `immune/game` column afterwards.

### MEDIUM-1 — `absorbed` is never reported on a hit that got THROUGH a shield (`src/core/sim.js:1417 → 1464`)
`const struck = amount` is declared inside the `if (skill !== 'arena') { … }` block (1408–1440);
line 1464 reads `typeof struck === 'number'` outside it, which is `'undefined'` for an undeclared
identifier, so `ate` is always `{}`. Measured: bolt 24 into shield 12 → `dealt {amount:12}` with no
`absorbed`. `prompt.js:1116-1118` promises `absorbed?` = "what a shield took" on both events;
`interactions()` line 917-918 says the same. `tools/test.mjs:589` only covers the fully-absorbed
branch (amount 0), so the gate is green.
**Fix:** hoist `let struck = amount;` above the block (line 1407); add a test "a hit that broke the
shield carries absorbed = shield" expecting `absorbed: 12, amount: 12`.

### MEDIUM-2 — dead code and comments that now lie (~250 lines)
- `compile.js:37-46, 82-86` — `COOLDOWN_PER_POINT`, `COOLDOWN_MIN`, `cooldownPoints()` and the
  fallback `d.cooldown ?? cooldownPoints(...) * COOLDOWN_PER_POINT` (line 161): unreachable, every
  delivery has `cooldown` (measured). Lines 48-80 and 124-143 explain a cost-derived cooldown as the
  live rule. **Fix:** `cooldown: fixedCooldown ?? d.cooldown`, delete the two constants and the
  function; keep the one paragraph at 145-157.
- `registry.js:262-281` derives the leap's cost 5 from `cooldownPoints × 0.9` (7.2 s / 9.9 s) —
  that arithmetic no longer exists. `registry.js:393-424` lists "damage 26→14, burn 5×3, heal 10,
  shield 20×2.5, boost ×1.3/×0.75 for 2.5 s, wall 3 s" while the table below reads 24 / 7×3 /
  16-cap-12 % / 12×2.5 / ×1.4 ×0.65 for 2.8 / 4 s. "STARTING values" is not a reader-safe label.
  **Fix:** replace the list with a pointer to `atombalance-panel-v5.md` or the current numbers.
- `registry.js:149-151` comment says "×1.25" above `power: 1.4`; `docs/COMBAT.md:70` says ×1.25,
  `COMBAT.md:135` says ×1.4. **Fix:** pick one; v5 was measured at 1.4, so fix the two comments.
- `prompt.js:599-641` `DELIVERY_LINE` and `673-689` `EFFECT_LINE` — "kept for the reference fixture
  and the tools that read the table by key": no consumer exists (`grep` finds only historical
  mentions in `checktactics.mjs` comments); the lob line still documents the pre-`{x,z}` world.
  **Fix:** delete both tables.
- `deliver.js:404` "щит по реестру держится 5 с (registry.js:332)" — shield is 2.5 s.
- `sim.js:568-569` `immuneList` doc says classes are `'hard'`/`'mind'`; they are `act/move/sense`.
- `matchpool.mjs:182-185`, `matchworker.mjs:120-150`, `atombalance.mjs:54-55` and the generated
  report line `atombalance.mjs:583` ("registry (cost-derived)") — all describe the old cooldown rule.
- `effects.js:147-148` duplicate key `by: srcId, by: srcId`.

### MEDIUM-3 — the kit half of the prompt bypasses the traced emitter
`prompt.js:35-50` promises every number goes through `q(label, value)` so `checkprompt` can prove
config→text and text→config. `kitBlocks`, `deliveryLine`, `effectLine`, `reachLine`, `interactions`
(lines 573-967) use `n()` — untraced. `checkprompt.mjs:357-383` renders the kit prompt but only
checks verb names. `checkbehaviour` measures 40 geometric claims, not the magnitudes, durations,
immune seconds or knock distances printed on the cards. So the guarantee the file's docstring
makes does not hold on the path every player creature takes.
**Fix:** thread a label into `n()` for the kit path (`q(\`kit.${name}.${field}\`, v)`) and add a
`tracePrompt(id, kits)` render to `checkprompt`, whitelisting `kit.*` labels; or extend
`checkbehaviour` with per-card magnitude/duration/immune claims.

### MEDIUM-4 — the pilot panel encodes the pre-07.09 numbers instead of reading `p.self.kit[...].magnitudes`
`rusher.js:26` `CTL_DUR = {stun 0.9, root 1.4, silence 2.2, blind 2.5}` (now 1.0/1.5/1.8/2.2),
`:35` share `[1,.75,.6]` (now `[1,.85,.7]`), `:201` shield `40`, `:205` heal `26`, `:259-261`
burn 4 s / shield 5 s / boost 5 s / range ×1.35; `controller.js:26-29` same fallbacks (used only
when `magnitudes` is absent — good); `kiter.js` never looks at magnitudes. The registry
(`registry.js:389-391`) says the panel is part of the instrument (D109) and must be re-run after any
pilot edit — but the pilots were never taught the new world, so heal (cap 16, 12 % of missing) is
valued by the rusher as "≈26 hp" and only cast with ≥23 hp missing (it then heals 4). None of the
three passes a point to a mortar or a field (rusher `:250` distance form, kiter `:253`, controller
`:314`), so the "mind aims" mechanic that the pricing is supposed to reflect is exercised by no pilot.
**Fix:** read `k.magnitudes[e].mag/.duration/.immune` in all three (the field exists for exactly
this), and have at least one pilot use `api.use(name, {x, z})` for lob/zone with a lead; re-run
`atombalance` afterwards (registry comment says so).

### LOW-1 — named constants exist but the call sites still use literals
`deliver.js:170,175` beam muzzle `+0.2` and margin `+0.4` (config has `BEAM_RADIUS`, sim.js:1228 uses
it); `prompt.js:757-774` reachLine uses `0.2/0.4/0.3/0.35` while `PROJECTILE_MUZZLE`,
`PROJECTILE_TOUCH`, `BEAM_RADIUS` are imported at line 61-64 and `config.js:314-324` says "the call
sites read them and the prompt quotes them". A tuning of either silently splits the grammar beam
from the fixture laser. **Fix:** replace the literals; add `BEAM_MUZZLE = 0.2` to config.

### LOW-2 — a stunned body keeps travelling its lunge
`moveStep` skips translation while dashing and `dashStepGeneric` never consults `me.stun`; measured
0.67 m of travel after a stun landed mid-lunge (the reference charge behaves the same). The prompt
says "Stunned: no movement" (`prompt.js:925`). Knock/pull impulses on a dashing body are likewise
discarded (`sim.js:1999`). **Fix:** either `endDash` on stun/knock in `dashStepGeneric` (and say so
on the card), or add "a lunge already travelling finishes its travel" to `interactions()`.

### LOW-3 — the sparring fixture violates the ≤ 3 s rule every mind is admitted against
`SKILLS.blink.cooldown 3.9`, `SKILLS.charge.cooldown 4.0` — presented to kitted minds via
`fixtureKitView` (`sim.js:406-436`) and used by `admit()` (`bakeoff.mjs:337`) and by ladder fights
against pre-grammar creatures. Not a code bug (§1 measurement base), but the founder's rule
"every cooldown ≤ 3 s" is false for a third of what a new mind fights. **Fix:** record the exception
in DESIGN.md or migrate the stub sparring partner to a compiled kit.

### LOW-4 — gate coverage gaps (`tools/test.mjs`)
No invariant that every `DELIVERIES[*].cooldown ≤ 3` (the headline rule; a registry edit to 5 s
passes every gate today); no partial-absorb test (MEDIUM-1 slipped through); determinism is tested
only on the fixture stubs (`test.mjs:124-130`) — add a kits+pilots pair; no test that an immunity
window EXPIRES (a stun after `duration + immune` lands); no test for a lunge passing under an
airborne body. Each is ≤ 15 lines in the `mech()` harness.

### LOW-5 — metric nits in `bakeoff.mjs`/`spectate.mjs`
`reachOf` (`bakeoff.mjs:413-421`) uses `range + me.radius` for beam/bolt/lob/cone; the true reach
(`prompt.js reachLine`, verified by `checkbehaviour`) is `muzzle + range + enemyR + margin` (beam),
`range + enemyR` (cone), `range + splash + enemyR` (lob) — `idle+in reach` is under-counted by
0.4–2.3 m. `atombalance.mjs:583` prints "registry (cost-derived)" in every report.

---

## What is right (so it is not re-litigated)
- Order of the tick (clocks → perceive → think → orders → acts → move → collide → projectiles/zones →
  burials) and the `yTick` snapshot for the three ground checks: consistent, and the airborne test
  in `dodgedInAir` reads one value for cone/zone/dash.
- Cooldown/stun/iframe microsecond floors (`sim.js:2198-2207`) match `servedCountdown` in the prompt.
- Dash travel arithmetic: 0.18 s wind-up → 12 dash steps × 0.667 m = 8.0 m; swept contact; airborne
  pass-under remembered as `overhead` so the miss reason is honest; `endDash` re-derives `total`.
- Aim point: `startSkill` sets `wantHeading` and remembers `at`; lob direction and distance both come
  from the point; zone clamped to range along the ray (test passes); blink stops at the point.
- Immunity by class, armed for `duration + immune` at application (so "a stun during a stun does not
  add" is true), checked before i-frames; `cleanse` deliberately leaves it.
- One field per ability, one wall per caster, `navDirty` rebuild (0.02 ms), temporary walls in
  perception with `until`/`by`.
- Deaths deferred to end of tick, alternating side order — mirror bias closed.
- `matchpool` restores result order by index; worker death is loud; `superviseSelf` only on signals.
- `atombalance` regression: centred ridge, CV R², bootstrap SE, rank-deficiency stated in the report.
