# Core mechanics — round-1 fixes, handoff

Lane: core mechanics. Files owned and touched: `src/core/{sim,deliver,effects,config}.js`,
`src/skills/{compile,registry}.js`, `tools/{test,checkbehaviour}.mjs`.
Also edited, minimally and listed below: `src/brain/prompt.js`, `tools/checkgrammar.mjs`,
`docs/COMBAT.md` §2, `README.md`.

Everything here is behaviour, and every rule below is held by an invariant in
`tools/test.mjs` (70 now, was 51).

---

## 1. Rules changed — old → new

| # | rule | old | new | where |
|---|---|---|---|---|
| 1 | a field's CONTROL atoms | applied every disc tick at `duration × zk` (stun 0.28 s, root 0.42 s), so ticks 2–5 were refused by the immunity tick 1 armed — 4 `immune` lines and 4 `missed` events per cast | applied ONCE per cast per body, on that body's first contact tick, at the registry's WHOLE duration. Later ticks of the same cast do not attempt the control: no log, no event, no fx. Damage/burn still tick every 0.5 s | `src/skills/compile.js:270` (durations no longer divided by `zk` when the atom has `immune`), `src/core/deliver.js:686-724` (`tickZones`, `z.controlled`), `src/core/deliver.js:391` (`controlled: null` on the zone) |
| 1b | a GENUINE immune refusal | log + `missed` event | log + `missed` event + `world.fx` record | `src/core/effects.js:113-129` |
| 2 | an aimed mortar's landing distance | read at the ORDER (`reach = hypot` stored on the act) while the direction was read at the STRIKE — landed 1.70 m past the point at walking pace | both halves read at the strike, as the field always did. The single-number form (`api.use(name, metres)`) is unchanged | `src/core/deliver.js:115-126` (`lobLanding`), `src/core/sim.js:1131-1152` (the stale `reach = hypot` is gone) |
| 3 | an aim point during a wind-up | a one-off facing order that the next thought's `api.faceAt` silently replaced | a LOCK: the body re-derives its heading from the point every tick of the wind-up, and `q.face`/`api.faceAt` are ignored until the strike (`act.spent`) | `src/core/sim.js:1111` (`aimLock` declared), `:1128-1140` (set), `:1195-1210` (carried on the act), `:986-988` (`applyOrders` respects it), `:1937-1943` (`moveStep` tracks it) |
| 3b | an aim point on an `aim: 'none'` shape (aura, leap, hop) | turned the body toward the point | turns the body not at all | `src/core/sim.js:1123-1136` (`aimMode`) |
| 4 | `absorbed` on a hit that went THROUGH a shield | never attached — `const struck` was declared inside a block the reader sat outside of, so `typeof struck` was `'undefined'` | `let struck` hoisted above the block and re-assigned after the channels; `dealt`/`damaged` carry `absorbed` on partial hits too | `src/core/sim.js:1538` and `:1551` |
| 5 | a targeted atom swallowed by i-frames | attacker got one `missed{invulnerable}` PER ATOM; the defender got nothing, and the grammar path wrote no `evade` log line at all | defender gets `evaded` ONCE per ability per tick, an `evade` log line and an fx; the attacker's `missed{invulnerable}` is deduped to once per ability per tick | `src/core/effects.js:131-171`; the fixture path in `src/core/sim.js:1509-1519` gained the matching fx |
| 6 | an ability whose atoms carry no damage/burn | announced nothing to the caster | announces `dealt` with `amount: 0` and `landed` once per body per tick, after its atoms apply. Refused controls are not in `landed` | `src/core/effects.js:404-451` (`applyAtoms`), called from every resolution site |
| 7a | WORLD atoms on a miss | applied on beam/cone/dash/zone, NOT on a blocked bolt, an out-of-range bolt or an empty-circle mortar | applied on all of them | `src/core/deliver.js:513-520`, `:596-600`, `:610-613` |
| 7b | `wall` duration | 4 s | 5 s | `src/skills/registry.js:461-471` |
| 7c | a wall against its own caster | blocked the caster's own beam and bolt (the wall grows 3.2 m ahead, i.e. exactly in the way) | the caster's own beam and bolt pass through its own wall (`o.by === casterId`); enemy shots stay blocked; movement and both navigators still treat it as solid | `src/core/deliver.js:128-152` (`shotSolids`), `:223` (beam), `:566` (bolt) |
| 8 | `interruptCast` | log line + two events | plus `world.fx` | `src/core/sim.js:1306` |
| 9 | burn on a burning body | RENEWED (`max(old.until, t + duration)`) — every second still burning was thrown away | EXTENDS: remaining += atom duration, capped at 2 × that duration, higher dps wins. A FIELD's ticks still renew (standing in fire is one fire, afterburn stays 1 s) | `src/core/effects.js:135-160` |
| 10 | a stunned or shoved lunge | kept travelling (0.67 m measured after a stun), and an impulse landing on a dashing body was discarded outright (`moveStep` skips the position integration during a dash) | `dashStepGeneric` ends the dash on `me.stun > 0` or on a rise in the knockback slot above what the body carried into the travel; the body is out of the dash phase on the next tick, so the impulse then moves it normally | `src/core/sim.js:1955-1990` (`shoved`, the early `endDash`), `:1612` (`act.kSeen` recorded when the heading locks), `:2018` (kept fresh each step) |
| 11 | `weaken` + `channel: 'cooldown'` | legal; slowed the countdown so a 3 s tile took up to 4.6 s of wall time while the chip never read above 3.0 | rejected by `validateSkill` with a readable message. `boost: cooldown` is untouched | `src/skills/registry.js:800-828` |
| 12 | reference fixture | `blink.cooldown` 3.9, `charge.cooldown` 4.0, `smash` 35 dmg / 1.3 s, `laser` 27 dmg | 3.0, 3.0, 33.6 dmg / 2.0 s, 24 dmg | `src/core/config.js:880, 929, 943-944, 972` |
| 13 | kit size at runtime | 3 abilities | 3 + a free universal `hop` (contract in §3). Stored kits, `validateKit`, `validateSkill` and every budget are unchanged | `src/skills/compile.js:317-362` |
| 14 | `api.say` | accepted on every thought (15/s) | accepted at most once per `SAY_EVERY` = 4.0 s per fighter; a line inside the window is dropped silently — no fault, no event, no budget charged | `src/core/config.js:240` (`SAY_EVERY`), `src/core/sim.js:998-1020` |
| 15 | the opening | spawn angle already seeded; the think grid always started at the same phase, so both minds met at the same phase of every wind-up in every seed | the think phase is drawn from the seed too (`streamFrom(seed, 'think')`), on its own stream. Both bodies stay mirrored at the same distance. Determinism holds in and across processes | `src/core/sim.js:291`, `:2415-2437` |

### Hygiene (code MEDIUM-2 / LOW-1)

- `src/skills/compile.js`: `COOLDOWN_PER_POINT`, `COOLDOWN_MIN`, `cooldownPoints()` and the
  `d.cooldown ?? …` fallback DELETED, along with the three paragraphs that described a
  cost-derived cooldown as the live rule. The line is now `cooldown: fixedCooldown ?? d.cooldown`
  (`compile.js:184`). Nothing outside the file imported the two constants.
  **Note for the instrument lanes:** `fixedCooldown` is no longer clamped to a 1.1 s floor.
- `src/skills/registry.js`: the "×1.25" comment above `power: 1.4` fixed (`:151`); the stale
  "STARTING values" list replaced by the shape of each rule plus a pointer to
  `atombalance-panel-v5.md` (`:400-446`); the leap's cost derivation, which quoted
  `cooldownPoints × 0.9`, rewritten against the world that exists (`:267-290`).
- `src/core/deliver.js:404`: the shield comment now says 2.5 s (it said 5 s).
- `src/core/sim.js`: `immuneList` doc now names `act`/`move`/`sense` (it named `'hard'`/`'mind'`).
- `src/core/effects.js`: the duplicate `by: srcId` key in the burn literal is gone.
- `config.js` gained `BEAM_MUZZLE = 0.2`; `deliver.js` and the fixture laser in `sim.js` now
  read `BEAM_MUZZLE`/`BEAM_RADIUS` instead of `0.2`/`0.4`, and `PROJECTILE_MUZZLE`/
  `PROJECTILE_TOUCH` were already named at their call sites.

---

## 2. Event and fx shapes introduced

Events (into `p.events`):

```js
// to the DEFENDER, once per ability per tick, when i-frames swallow a targeted atom
{ type: 'evaded', skill, by }                       // by = the caster's side id

// to the CASTER, once per body per tick, for an ability with no damage and no burn atom
{ type: 'dealt', skill, amount: 0, landed: [...], enemyHp }
```

`landed` holds the ids of the TARGETED atoms that actually took. A control refused by an
armed immunity is not in it, which is the point: the caster can tell "the root took" from
"the root was refused" without correlating two events. The event fires only when at least
one targeted atom landed; SELF and WORLD atoms are never announced as `dealt`.

**Decision:** `landed` is NOT added to the damaging `dealt` emitted by `damage()`. It is the
field that identifies the control-only shape of the event, and a second `dealt` on a damaging
hit would double every hit in every counter that reads the feed. A damaging `dealt` is
unchanged: `{ type: 'dealt', skill, amount, absorbed?, enemyHp }`.

The attacker's refusal on i-frames is unchanged in shape and now deduped:
`{ type: 'missed', skill, reason: 'invulnerable', effect }`, once per ability per tick
(it used to be once per atom).

New `world.fx` records — all carry `who` = the body the thing happened to, and `t` rounded
to 3 places, like every other record:

```js
{ kind: 'immune',     who, t, effect, by }        // a genuine refusal, i.e. a different cast
{ kind: 'evade',      who, t, skill, by }         // an i-frame dodge, grammar and fixture paths
{ kind: 'absorbed',   who, t, amount, by }        // what a shield took off a hit
{ kind: 'shieldBroke',who, t }                    // the shield ran out on this hit
{ kind: 'interrupt',  who, t, skill, by }         // who = the victim, skill = the cast that was cut
```

No existing `fx` kind changed shape. The `shieldBroke` and `evade` LOG lines are unchanged
and still there.

---

## 3. The hop contract, as implemented

`compileKit` appends one def after the three compiled abilities, only when at least one
ability compiled (so a fixture fighter, whose kit is null, never gets one):

```js
defs.hop = {
  id: 'hop', name: 'Hop', universal: true, cost: 0,
  generic: true, kind: 'jump', element: 'kinetic',
  palette: ELEMENTS.kinetic.palette, channel: null,
  grammar: { delivery: 'jump', effects: [], element: 'kinetic' },
  windup: 0.06, recover: 0.16, cooldown: 3,   // DELIVERIES.jump, verbatim
  airborne: 0.55, moveScale: 1, turnScale: 1,
  needsLos: false, interruptible: false,
  effects: [], aim: 'none',
}
```

- `names` is `['k1','k2','k3','hop']` — hop last, so `p.self.skills`, the prompt's skill list
  and any HUD tile order read the same way.
- `readable(def)` returns `def.name` when present, so hop renders as `Hop` rather than
  `Leap: ` with nothing after the colon.
- Exported for other lanes: `HOP_ID` (`'hop'`), `HOP_NAME` (`'Hop'`), `HOP_SKILL`
  (frozen `{ delivery: 'jump', effects: [], element: 'kinetic' }`) from `src/skills/compile.js`.
- `compileSkill(skill, id, { universal: true })` is the path that builds it: it skips
  `validateSkill` (an empty effect list is illegal for a purchase) and sets `cost: 0`.
  Everything else is the same code as any other ability, so it cannot drift from its delivery.
- `kitView` entry carries `universal: true` and `cost: 0`; **no other entry carries either
  field**, and a gate (`checkbehaviour`) holds that.
- `api.use('hop')` behaves as a jump (`aim: 'none'` — a point handed to it turns nothing),
  `api.ready('hop')` is truthful, `p.self.cooldowns.hop` exists and starts at 0.
- Stored kits are still exactly 3 abilities; `validateKit`, `SKILL_BUDGET`, `KIT_BUDGET` and
  `KIT_SIZE` are unchanged. The one new rule is that an ability whose `name` is `hop`
  (case-insensitive, trimmed) is rejected with a readable message.
- **Hop-name collision check (read-only, `data/airena.db`, `creature.kit_json`, 78 rows):
  0 collisions.** No stored ability carries a `name` key at all, so nothing existing is
  rejected by the new rule.

---

## 4. The weaken:cooldown branch taken

**Branch (a): `validateSkill` rejects it.**

Read-only check first (`data/airena.db`, `creature.kit_json`, all 78 rows): **0 abilities use
the `cooldown` channel at all**, with weaken or with boost. So nothing legal today stops
working. `validateSkill` now returns
`{ code: 'channel_weaken_cooldown', ru: 'Weaken cannot turn the Cooldown channel: it would
hold a tile past the three-second ceiling. Boost may.' }`. `boost: cooldown` is untouched —
a countdown that runs faster cannot break a ceiling.

`tools/checkkits.mjs` is green (78 creatures legal). The rule removes 552 abilities from the
grammar's legal enumeration (9 243 → 8 691), so the pinned table in
`tools/checkgrammar.mjs:165` and the matching comment in `registry.js` were re-counted; the
share of three-effect abilities, which is what the budget ceiling's argument rests on, did
not move (75% at 20, 78% at 22).

---

## 5. Prompt-facing facts (sentences that are TRUE in the new sim)

For the prompt lane. Each is measured by an invariant in `tools/test.mjs`.

1. A field applies its control ONCE per cast per body, on the first tick that body is inside
   it, for the control's whole duration — the disc's tick share divides magnitudes, never
   control durations. The disc's later ticks do not re-apply it and announce nothing.
2. A control refused by an armed immunity is always a DIFFERENT cast. The refusal is
   `missed{ reason: 'immune', effect }` to the caster.
3. A mortar or a field aimed at a point lands ON the point (clamped to range) whatever the
   caster did during the wind-up: direction and distance are both read at the strike.
4. An aim point holds for the whole wind-up. A later `api.face`/`api.faceAt` does not replace
   it; the lock ends at the strike. To change the aim, order the ability again.
5. An aim point handed to an ability whose `aim` is `'none'` turns the body not at all.
6. A hit that got through a shield reports `absorbed` — what the shield took — on both
   `dealt` and `damaged`, not only when the shield ate the hit whole.
7. An ability whose effects carry neither damage nor burn announces
   `{ type: 'dealt', skill, amount: 0, landed, enemyHp }` to the caster once per body per
   tick. `landed` lists the atoms that took; a refused control is absent from it.
8. A body inside its i-frames is told `{ type: 'evaded', skill, by }` — once per ability per
   tick, not once per effect. The attacker is told `missed{ reason: 'invulnerable' }` once,
   for the same ability, on the same tick.
9. A WORLD atom (a wall) is built whether or not the delivery carrying it connected — on a
   bolt stopped by cover, a bolt that ran out of range and a mortar that landed on empty
   floor as much as on a beam, a fan, a lunge or a field.
10. A wall stands for 5 s. Your own beam and your own bolt pass through the wall YOU built;
    the enemy's do not. Both bodies and both navigators treat it as solid.
11. A fire landing on a burning body EXTENDS it: the time still burning grows by the new
    fire's duration, capped at twice that duration, and the higher rate wins. A field's ticks
    renew instead, so standing in one is one fire with one second of afterburn.
12. A stun, a knock or a pull that lands on a body already TRAVELLING a lunge ends the
    travel where it stands; the impulse then moves the body normally.
13. Every fighter has a fourth verb, `hop`: the leap shape carrying nothing, cooldown 3.0 s,
    0.06 s crouch, 0.55 s airborne, 0.16 s landing, `aim: 'none'`, and it costs nothing. Its
    perception entry carries `universal: true` and `cost: 0`; the three abilities the creature
    bought carry neither field. It goes under a fan, a field and a lunge like any leap.
14. `api.say` is accepted at most once every 4.0 s (`SAY_EVERY`). A line inside the window is
    dropped silently: it is not a fault, it costs no order budget, and no event is emitted.
15. The spawn angle and the phase of the think clock both come from the match seed, so the
    first `p.tick` you see is 2 or 1 depending on the seed. The same seed is still the same
    fight, bit for bit.
16. Every ability in the world — grammar delivery and reference fixture alike — refreshes in
    3.0 s or less.

### Edits I made to `src/brain/prompt.js` (list, for the prompt lane to keep or rewrite)

Both were needed to keep a gate green.

1. `prompt.js:1023-1025` — `p.tick`: "the first value you ever see is `${q('think.firstTick',
   THINK_EVERY)}` or one less — the match seed decides which — and never zero". The `q()` call
   and its label are untouched, so `checkprompt` still traces it.
2. `prompt.js:995-1004` — the `.kit` perception paragraph now names `universal` and `cost`
   inside the field list and says they appear only on `hop`, because `checkbehaviour` fails
   when perception serves a kit field the prompt does not name. It also now says the kit is
   "the three your creature holds, and hop".

---

## 6. Gate results

| gate | result |
|---|---|
| `node tools/test.mjs` | **70 passed, 0 failed** (was 51; 19 new invariants) |
| `node tools/checkprompt.mjs` | green on its own checks — 124 emitted values agree both ways, kit verbs, 395 segments judged, tactics 0. See the note below on its README half |
| `node tools/checkbehaviour.mjs` | **green** — 40 claims measured |
| `node tools/checkgrammar.mjs` | **green** (pinned enumeration re-counted, see §4) |
| `node tools/checkkits.mjs` | **green** — 78 creatures legal |
| `node tools/checkisolate.mjs` | **green** — 25 attacks stopped |
| `node tools/checkspec.mjs` | **green** |
| `node tools/checkdocs.mjs` | see the note below |
| `node tools/checktactics.mjs` | **green** |
| `node tools/checkprices.mjs` | **red, and not from this lane** — it reads
  `reports/combat/atombalance-panel-v5.json` and fails on that pass's own numbers ("value per
  point flat", "no piece significantly negative": root −7.4, dash −5.2, weaken −4.7 …). That is
  balance H2/H3, an open item for the pricing lane, and this lane's magnitude re-scales (wall
  5 s, burn extends) are exactly what a v6 pass is supposed to re-measure |

**The two README-backed gates.** `checkprompt` and `checkdocs` share a README check and were
already red at the start of this session (`tools/rethink.mjs` unmentioned). I made them green,
and they went red again while I worked because another lane added a README row for
`tools/seedfixtures.mjs` containing `is_library = 1` — a number with no source, which is that
row's problem to fix, in that lane's file. My own README edits were three lines and nothing
else: the invariant count 51 → 70 in two places, and `checkdescribe · rethink` added to the
tools roll-call (I deliberately did NOT keep roll-call entries for `checkfixtures` and
`seedfixtures`, because that lane documented them in the table itself while I worked).

New invariants added to `tools/test.mjs`, group `grammar mechanics`: partial absorb; an
immunity window expiring; a field's control landing once per cast at whole duration; a mortar
landing on its point while the caster walks; an aim point surviving a later `faceAt`; the
`evaded` event with its dedupe; the control-only `dealt` with `landed`; a wall built on a bolt
miss; a caster shooting through its own wall while the enemy is blocked; burn extending under
its 2× cap; a lunge stopped by a stun; a lunge passing under an airborne body; hop present on
every compiled kit and absent from fixtures (three cases); the say cap; every fixture cooldown
≤ 3.0 s; every registry delivery cooldown ≤ 3.0 s; determinism on a kits + pilots pair
(`rusher` vs `kiter`, seed 90210, two runs, identical log). Cross-process determinism was
checked separately: `rusher` vs `kiter`, seed 777, two kits, log sha `ffa2fb07e9641fd1` in two
separate node processes.

---

## 7. Spectator numbers — the ladder six

```
node reports/combat/spectate.mjs \
  --ids c_08afabcb-3de,c_303e3387-581,c_c4eb7da3-a72,c_18e20e72-6bb,c_3fdf18d5-48c,c_f7ddf8fc-1df \
  --pairs 12 --seeds 1,2,3 \
  --out reports/combat/spectator-v6-mechanics.md --json reports/combat/spectator-v6-mechanics.json
```

36 matches, 12 matchups, seeds 1,2,3.

| metric | target (§3) | before (`review-pace.md`) | after (v6) |
|---|---|---|---|
| median fight length | 20–35 s | 15.3 s (mean 16.6) | **18.2 s** (mean 18.6) |
| casts per fighter per 10 s | ≥ 6 | 8.72 | **8.72** |
| hit rate of targeted shapes | 55–80% | 89% (715 judged) | **86%** (729 judged) |
| dodges per fight | ≥ 1 | **0.00** (0 airborne + 0 i-frame) | **0.97** (18 airborne + 1 i-frame + 16 side-step) |
| fights reaching the burn | ≤ 35% | 2 of 36 (6%) | 4 of 36 (11%) |
| deaths dealt by the arena | ≤ 20% | 2 of 36 (6%) | 3 of 36 (8%) |
| controls refused by immunity on a cast carrying no damage/burn | — | — | **0** (80 raw `immune` lines, all riding a landed damage cast) |
| burn share | — | 0 ignites (none of these six kits carries burn) | 0 ignites — same, structurally |

Reading it:

- **The dodge target is essentially met, and it is the hop that did it.** Three of the six
  creatures' minds pick the verb up from `p.self.skills` without being re-forged and cast it
  70 times across 36 matches (ARRESTER 33, STORM 19, ICEBREAKER 18), which is where the 18
  airborne dodges come from. The other 16 are side-steps, which `spectate.mjs` began counting
  in the other lane's change; the i-frame dodge is the `evade` line the grammar path could
  never write before.
- **Median length moved 15.3 → 18.2 s** without a single magnitude change to damage: the fan
  fixture came off 1.3 s, the mortar and the fields lost the free control re-ticks, and casts
  per 10 s did not move at all — so the extra three seconds are fights, not waiting.
- **Hit rate 89% → 86%**, still above the 55–80% band. The band is a magnitude/geometry
  question (pace M3: dash wind-up 0.18 s, field radius 3.0 m) and is not this lane's fix.
- **Dead ability slots rose** to 59 of 288 because three of the six minds never call `hop`, so
  its slot reads dead for them. That is a mind-quality signal now, not a missing mechanic.
- The burn share and arena-death rises (2→4 and 2→3 matches of 36) are inside the targets and
  inside the noise of 36 fights.
