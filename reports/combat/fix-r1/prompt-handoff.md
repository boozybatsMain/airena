# The mind prompt — round-1 fixes, handoff

Lane: the prompt. Files owned and touched: `src/brain/prompt.js`,
`tools/{checkprompt,checktactics,checkbehaviour}.mjs`, `reports/combat/renderprompt.mjs`,
`docs/COMBAT.md` §6, two README gate rows (`checkprompt`, `checkbehaviour`).
`tools/checkdocs.mjs` was read and not changed. `tools/tactics-verdicts.json` is rewritten by
the gate, as designed.

Render: `node reports/combat/renderprompt.mjs` →
`reports/combat/prompt-rendered.txt` (blue, kit A vs kit B) and `prompt-rendered-orange.txt`.
Both regenerated.

---

## 1. Every finding, and the sentence that answers it

Quotes are from the rendered kit prompt unless marked otherwise.

### F1 — the immunity window is armed when the control LANDS

The whole "Nothing stacks" paragraph was split in two. The first half now covers only
the things that really do replace or extend:

> Nothing stacks, and controls do not even queue. A second fire on a burning body adds its
> own length to the time still burning, up to twice that length, and the higher rate wins —
> except a disc's own ticks, which renew their fire rather than lengthening it. A second
> shield keeps the larger figure and the later time. A boost or a weaken on a channel
> replaces the one that was there.

The second half is the fix:

> The four controls — stun, root, silence, blind — are different. A control arms an immunity
> the moment it LANDS, not when it ends: from that instant until its duration plus the card's
> immune seconds have passed, no control of those classes lands on that body at all. That
> includes a second copy of the same control, and it includes a control from any other ability
> of either side. A stun arms 'act' and 'move'; a root arms 'move'; a silence arms 'act'; a
> blind arms 'sense'. p.self.immune and p.enemy.immune list the classes in force for the WHOLE
> window, so a body that is stunned right now already lists 'act' and 'move' and will keep
> listing them after the stun has worn off. A control refused this way is a 'missed' with
> reason 'immune' and the effect's name, and it is always a different cast: a disc applies the
> control it carries once per cast per body, on the first step that body is inside it, and its
> later ticks do not try again. The rest of the ability is unaffected — damage, fire, an
> impulse, a wall and every self effect on that same cast still land.

The card says the same in its own terms, with the window as one number (mech §5 #1, #2):

> `effect stun` — for 1 s the target cannot move, turn or start an ability, a cancellable
> wind-up it lands on is cancelled with its cooldown spent, and a lunge it lands on stops
> travelling; it arms 'act' and 'move' immunity from the moment it lands until 4 s later —
> that is the 1 s plus 3 s — so a second stun inside it is refused, not added

and the disc's own delivery line carries the once-per-cast rule:

> Damage and fire tick; a control the disc carries is applied ONCE per cast per body, on the
> first tick that body is inside it, for the whole duration on this card — the later ticks do
> not attempt it and announce nothing.

`p.self.immune` in perception gained the same fact:

> A class appears the moment the control lands and stays for the control's duration plus its
> immune seconds, so it is listed while the control is still running

Measured by `checkbehaviour`: **kit stun 'act' immunity window — measured 4.000 s, prompt
says 4** (probed through `p.enemy.immune`, not through a re-cast; see §3).

### F2 — mortar / field land on the point

Card (mortar), one sentence instead of two:

> a projectile released at the strike from 1.8 m ahead of your centre, at 12 m/s, toward a
> landing spot whose direction AND distance are both read at the strike, from where you stand
> then, whatever the wind-up took you through

Card (field):

> a disc of 3 m placed where the strike reads it, from where you stand then and not where you
> ordered it

And in HOW THE PIECES INTERACT:

> A mortar and a disc land ON the point, clamped to their range — the point is read at the
> strike, from where you stand then, so walking through the wind-up does not move it.

### F3 — a wall on any miss, 5 s, own shots pass

> `effect wall` — a block 3.2 m ahead of you along your facing, 4 m wide, 1 m thick and 2.2 m
> tall, for 5 s. The box is axis-aligned and does not rotate with you: it snaps to whichever of
> X and Z your facing is nearer, so the width lies across that axis and the thickness along it.
> It stops bodies, lunges, lines of sight and the ENEMY's beams and bolts; your own beam and
> your own bolt pass through it; a mortar and a disc pass over it. It is built whether or not
> the delivery carrying it connected — a bolt stopped by cover, a bolt that ran out of range and
> a mortar that landed on empty floor raise it as surely as a hit does. You keep at most one
> wall standing — a new one replaces it, whichever ability built it; it appears in
> p.arena.obstacles with 'until' and 'by'

The beam and bolt cards say it from the other side, because a fighter may face a wall it did
not build: "A wall YOU raised does not stop it; a wall they raised does" (beam) and "A block,
an arena wall or a wall THEY raised ends it … a wall you raised yourself does not stop it"
(bolt).

### F4 — `evaded` once per ability

Event list:

> `{ type:'evaded', skill, by }` — an ability of theirs reached you inside your invulnerability
> window and did nothing. Once per ability per step, not once per effect; by is the side that cast

and in HOW THE PIECES INTERACT:

> A body inside its invulnerability window takes nothing: it is told { type:'evaded', skill, by }
> once for that ability on that step — once, not once per effect — and the attacker is told
> 'missed' with reason 'invulnerable', also once.

### F5 — control-only `dealt{ amount: 0, landed }`

Event list:

> `{ type:'dealt', skill, amount:0, landed, enemyHp }` — an ability of yours carrying neither
> damage nor fire connected; landed lists the effects that took, a refused control is absent
> from it. Once per body per step

and a paragraph of its own in HOW THE PIECES INTERACT:

> An ability whose effects carry neither damage nor fire still tells you it connected:
> { type:'dealt', skill, amount: 0, landed, enemyHp } arrives once per body per step, and
> 'landed' lists the ids of the effects that actually took. A control refused by an armed
> immunity is NOT in that list, so the event tells "the root took" from "the root was refused"
> on its own. A damaging ability does not send this one — its 'dealt' carries the real amount
> and no 'landed'.

### F6 — the aim lock

> Aiming. api.use(name, { x, z }) names a point on the ground. An aim point is a LOCK for the
> whole wind-up: your body re-derives its heading from the point on every step of the wind-up,
> and api.face or api.faceAt called on a later thought is ignored until the strike. To aim
> somewhere else, order the ability again. The lock ends at the strike. […] An ability whose aim
> is 'none' — an aura, a leap, hop — turns you not at all when a point is handed to it.

Each card's `aim` row carries the short form ("…and it holds for the whole wind-up"), the
`aim: 'none'` row says "none — a point handed to it turns you not at all and changes nothing",
and `api.use(name, {x, z})` in the verb list repeats the lock and the `'none'` case.

### F7 — the kit half is now inside the number guarantee

See §2. The file's docstring was rewritten to promise what is now true.

### F8 — one muzzle number

`V.lead` now takes the body and prints the same figure the cards print:

> are released at the strike, wind-up seconds after the order, from 1.8 m ahead of your centre —
> your own radius plus the muzzle offset, the same figure the cards print; a beam has none.

The same unification was applied to the bolt's touch radius, which the cards printed as a sum
(`their radius + 0.35`) and HOW THE PIECES INTERACT printed as the bare constant: both now
print `1.85 m`, labelled `projectile.touchFromCentre`.

### F9 — the recovery is slowed too

Card row, now phase-aware because two deliveries drive the body themselves:

> `while casting` — your top speed is multiplied by 0.6 and your turn rate by 0.7 **for the
> whole act — the recovery is slowed as much as the wind-up**; a stun, a silence or an impulse
> that lands during the wind-up cancels it, and the cooldown is already spent

A lunge reads "through the wind-up and through the recovery; during the travel you neither
steer nor turn"; a leap or hop reads "through the crouch and through the landing; in the air
your velocity is the one you took off with". HOW THE PIECES INTERACT opens with the same fact.

### F10 — `busy` vs `airborne`

> From the crouch to the end of the landing no ability can be started — refused with reason
> 'airborne' while you are actually in the air, and with reason 'busy' during the crouch and
> the landing, because on both of those you are still on the ground

`p.self.busy` also says "the crouch and the landing of a hop or a leap included". The jump
delivery card no longer claims `'airborne'` for the whole shape.

### F11 — declared vs served

> Their windup, recover and cooldown are the DECLARED figures — the ones the ability was
> compiled with — while the cards above print the SERVED ones, which is what the world runs:
> a phase ends on the first step at or past its length, and a countdown is subtracted one step
> at a time until it crosses zero. The two never differ by a whole step of the world's clock,
> and the served figure is the one a fighter experiences.

Repeated in the `.kit` perception entry ("windup, recover and cooldown are the DECLARED
figures, not the served ones the cards print").

### F12 — memory limits and budget accounting

> `api.remember(key, value)` — Store anything JSON can hold. 48 keys, and a key longer than 32
> characters is cut to its first 32 — two long keys with the same opening are one key. A value
> whose JSON runs past 4096 characters, or that JSON cannot hold, is dropped in silence, and so
> is a new key once the 48 are full.

and:

> remember and forget are the exception to the queue — they write through the instant you call
> them, so one thought can store several keys and read them back immediately — but they are not
> an exception to the count: each one spends an order like any other. 64 orders are honoured per
> thought; the rest are dropped. recall spends a perception call, not an order.

(This paragraph is shared with the fixture form, so the fixture prompt changed here too.)

### F13 — the smaller gaps

- **knock/pull**: "an impulse of 5.1 m/s on what it hits, away from you, added to whatever
  impulse it already carries and decaying at 9 m/s² — **a shade under 1.44 m of travel** whatever
  the body weighs or wants — the impulse is dropped to zero the moment it decays below 0.4 m/s,
  and the world moves the body in whole steps". `KNOCKBACK_MIN` is now disclosed
  (`physics.knockbackMin`) so the reason is a number and not an adjective.
- **wall box**: axis-aligned, quoted under F3.
- **burn field total**: a second `whole disc` row, which used to exist for damage only —
  "a body that stands in it from the first tick to the last burns for 3 s — 2 s from the first
  tick to the last, plus the 1 s that last tick renews — and loses 29.4 hp to the fire".
  The span is `(ticks − 1) × ZONE_PERIOD`, not the disc's own duration; measured at 29.4 hp.
- **a bolt is consumed by an invulnerable body**: on the bolt card ("a body inside its
  invulnerability window consumes the shot rather than letting it through") and in HOW THE
  PIECES INTERACT ("A bolt is spent on such a body rather than passing through it").
- **hop vs leap**: settled and used consistently. **hop** is the free universal verb literally
  named `hop`; **leap** is the jump delivery an ability buys. "A hop and a leap are the same
  shape: a crouch, an airborne phase, a landing." `{ type:'landed' }` reads "your hop or leap
  touched down"; `p.self.y` reads "> 0 only while you are off the ground"; the world section
  reads "nothing but a hop or a leap ever leaves the ground".
- **no live `p.enemy.turnRate`** (kit form only, since the fixture has no channels):
  "There is no p.enemy.turnRate either: their maxSpeed is live and carries whatever boost or
  weaken is on their speed channel, but their turn rate reaches you only as the static figure in
  their body block above, so a weaken on their turn channel never shows in perception."

### The mech-handoff §5 facts not covered by a finding

- **#1/#2 field controls once per cast** — quoted under F1.
- **#12 a lunge stops on a stun or an impulse** — on the lunge card ("A stun landing on you, or
  an impulse arriving on top of what you carried into the travel, ends the travel where you
  stand — and the impulse then moves you normally"), on the stun/knock/pull effect rows, and in
  the Statuses and Impulses paragraphs.
- **#13 the hop card** — `hop` renders as a fourth card, marked:
  "`slot` — universal — every fighter carries this verb, no budget pays for it and no set can
  decline it. In perception its entry is the only one with universal: true and cost 0", followed
  by its cooldown 3 s, cast 0.067 s → 0.167 s, airborne 0.567 s, `aim: none`. All through
  `q()`/`n()` under `kit.<side>.hop.*`. `KIT_IS_NOT_YOURS` now opens "The cards above are the
  verbs you are holding as this is written: the three your creature bought, plus hop."
- **#14 the say cap** — `SAY_EVERY` disclosed twice, on `api.say` and in "What is announced":
  "api.say is accepted at most once every 4 s: a line inside that window is dropped in silence,
  costs no order and raises no event."
- **#15 the seeded first tick** — the mech lane's edit kept verbatim.
- **#16 the 3 s ceiling** — "No ability in this world, bought or free, has a cooldown longer
  than 3 s." The number is `max(DELIVERIES[*].cooldown)` put through the same countdown
  accumulator as any cooldown, under `kit.cooldownCeiling`.

### The spectator reviewer's row 5 (dodge-window facts)

No tactic was added. What a mind needs to compute a dodge window is now all present and all
measured: the blink's i-frames and the hop's airborne phase on their cards; every ability's
served wind-up on its card; `p.enemy.casting` with `phase`, `elapsed`, `remaining` and
`telegraph`, plus the sentence "casting.remaining counts down to the end of the RECOVERY; the
strike lands when casting.elapsed reaches the ability's wind-up"; `p.enemy.kit[skill].windup`
with the declared/served caveat (F11); and the threshold a ground delivery passes under
(0.35 m) on every ground card. The prompt does not say what to do with any of it.

---

## 2. The `q()` label scheme for kits

`kit.<own|enemy>.<slot>.<field>` — the side is part of the label because one document prints
two different kits and `k1` means a different ability on each side. `<slot>` is the runtime
name `api.use` takes (`k1`, `k2`, `k3`, `hop`).

| field | what it is |
|---|---|
| `cooldown` `windup` `recover` `airborne` | served timings (phase clock / countdown) |
| `travelSeconds` | a lunge's travel, `distance / dashSpeed` |
| `moveScale` `turnScale` | the card's shares |
| `range` `radius` `distance` `speed` `dashSpeed` `splash` `duration` `zoneTicks` `iframes` `halfAngleDeg` | the def's own fields, formatted as the card prints them |
| `muzzle` | `own radius + BEAM_MUZZLE` or `+ PROJECTILE_MUZZLE` |
| `touch` | `their radius + PROJECTILE_TOUCH` |
| `nearBound` | a mortar's near limit, `own radius + splash` |
| `sweepWidth` | a lunge's hit width, `own radius + theirs` |
| `flight` | a bolt's range rounded up to whole steps |
| `reach` | the farthest centre-to-centre hit, the sum of the terms above it |
| `wholeDisc` `wholeDiscBurn` `burnSeconds` `tickSpan` | a field's totals |
| `effect.<id>.mag` `.duration` `.immune` `.window` `.travel` `.sharePct` `.floor` `.width` `.thickness` | per-effect, `window` = `duration + immune` |

World constants that only the kit form prints got labels of their own: `think.every`,
`events.max`, `burn.eventEvery`, `blind.lagSeconds`, `interrupt.minWindup`,
`airborne.dodgeMin`, `zone.period`, `blink.velocityKeep`, `projectile.touchFromCentre`,
`projectile.muzzleFromCentre`, `physics.knockbackMin`, `wall.ahead`, `wall.height`,
`kit.cooldownCeiling`. Two more are shared with the fixture form: `say.every`,
`mem.maxKeyChars`, `mem.maxValueBytes`.

`tracePrompt(id, kits, builds)` now passes its arguments through, so a kit render can be
traced at all. `tools/checkprompt.mjs` runs both directions over four documents — `blue`,
`orange`, and two kit pairs — and `expected(kits)` builds a different whitelist per form:
the shared half always, the fixture's five skills when there is no kit, and `kitExpected()`
from the compiled defs when there is. Every kit expectation is recomputed there from the def
and from config, with the file's own copy of the tick arithmetic, exactly as the fixture's
reach and cone already were.

The first kit pair is the one `renderprompt.mjs` uses, deliberately: the document a reviewer
reads by eye is the document the gate checks. The second pair reaches the deliveries and
effects the first does not (beam, lunge, leap, wall, stun, heal, blind, boost, weaken).

One new hole in the text→config sweep: `\bk[1-9]\b`, "the kit's slot names, k1..k3 —
identifiers api.use takes, not quantities". It is as narrow as the naming scheme.

**Two numbers still typed in two places, each with the same reason the beam's muzzle already
had:** `BEAM_MUZZLE`'s literal twin `0.2` in the fixture's `skillBlock` (unchanged, and
`checkprompt` writes it out too), and `32` for the memory key truncation, which is
`k.slice(0, 32)` at three call sites in `sim.js` with no name in config. Both are written out
in the emitter and in the checker rather than imported from one of them.

---

## 3. Claims added to `checkbehaviour`

40 claims before, **68 now**. New, all on the compiled-kit path, all read by label from the
emitter rather than parsed out of prose:

| claim | how it is measured |
|---|---|
| served wind-up, per delivery (beam, mortar, leap) | ticks from the order to the first non-`windup` phase |
| order-to-recovered total, per delivery | ticks until the act is gone, against the sum of the printed phases |
| cooldown, per delivery | ticks until `cooldowns[name] <= 0` |
| hop: wind-up, airborne, crouch-to-landed, cooldown | the same four, on the free verb |
| leap airborne | ticks in phase `air` |
| field tick count, period and whole-disc damage | separate hp drops on the target, their spacing, their sum |
| burn field: whole-disc hp and seconds alight | hp lost and first-to-last tick span + one fire duration |
| mortar splash | binary search on the target's offset from a NAMED landing point |
| blink i-frames and distance | ticks with `iframes > 0`; displacement |
| knock and pull travel | the target's displacement, asserted to be **at most** the printed ceiling and at least 85 % of it — the card promises "a shade under", so the gate checks an inequality, not an equality |
| stun immunity window | time from the class appearing in `p.enemy.immune` to its disappearing |
| heal floor, cap and share | three probes, each at an hp where that term alone decides (the floor probe is taken where the cap at maximum hp does not bite) |

Not added, and why: an airborne-dodge probe (a ground delivery passing under a body in the
air) is already an invariant in `tools/test.mjs` from the mechanics lane, and duplicating it
here would measure the same thing twice.

Measured values worth recording: knock travel 1.890 m against a printed ceiling of 2 m; pull
2.233 against 2.35; field tick period 0.508 s against 0.5 (one step of the world's clock);
burn field 29.4 hp over 3.0 s; stun window exactly 4.000 s.

---

## 4. Hygiene

- `DELIVERY_LINE` (63 lines) and `EFFECT_LINE` (16 lines) deleted. Grepped first over `src`,
  `tools`, `docs`, `reports`, `packages`, `forge`, `brains`: the only references outside
  `prompt.js` were prose in `tools/checktactics.mjs` (updated) and in three finished reports,
  which are records of a past state and were left alone.
- The `prompt.js` docstring now states the guarantee it actually has, naming both forms and
  the `kit.<side>.<slot>.<field>` scheme.
- The `checkbehaviour.mjs` docstring gained a section listing what it measures on the kit path.
- `docs/COMBAT.md` §6 rewritten: §6.1 the document as it now stands, §6.2 the three gates that
  hold it true, §6.3 the round-1 corrections. No other section touched.
- README: the `checkprompt` and `checkbehaviour` rows now describe both forms of the document
  and the kit claims. The invariant count is **70** in both places it appears and is correct —
  `node tools/test.mjs` prints "70 passed, 0 failed". No other README count comes from a gate
  of mine. The `seedfixtures` row was left exactly as the other lane wrote it.

---

## 5. Gate results

| gate | result |
|---|---|
| `node tools/checkprompt.mjs` | **its own checks green** — 129 emitted values on each fixture render, 197 and 210 on the two kit renders, both directions agreeing on all four; the kit-verbs check green; tactics 0. **Exit 1 for one reason only, and it is not this lane's:** the README row for `tools/seedfixtures.mjs` contains `is_library = 1`, a number with no source, which `checkdocs` (run from inside `checkprompt`) rejects. That row belongs to the fixtures lane and was left untouched. |
| `node tools/checkdocs.mjs` | **same single failure, same row.** Everything else green: 15 claims bound, 88 tools named, 24 paths resolve, 8 query parameters read. |
| `node tools/checkbehaviour.mjs` | **green — 68 claims measured** (was 40) |
| `node tools/checktactics.mjs` | **green — 430 segments across 8 prompts, tactics 0** (capability 118, constraint+reason 14, world fact 260, objective 1, structure 37). Judged in three small batches over the session, ~$0.25 total; every batch passed all ten planted controls. |
| `node tools/test.mjs` | **green — 70 passed, 0 failed** |
| `node tools/checkspec.mjs` | **green — ДЕРЖИТ** |

To confirm the two red gates are red for that one row and nothing else:
`node tools/checkdocs.mjs 2>&1 | grep 'a number in README'` prints exactly one line, the
`seedfixtures` row.

---

## 6. The forge check

```
AIRENA_SUB_MODELS=1 node --env-file-if-exists=.env tools/rethink.mjs \
  --bundle=sub:opus:plain --limit=1 --force --only=c_255ab41e-6cf
```

`ASH WOLF` (library, rating 1270, kit `Lunge: Damage+Burn · Aura: Boost/Speed · Fan:
Burn+Silence`). Result: **REWRITTEN — admitted, won 0/4, hits 3, faults 0, 1389 chars, 71 s**,
one attempt, no repair turn. `reports/combat/rethink/c_255ab41e-6cf.json` records
`admitted: true`, `stage: "probe"`, `problems: []`, and **`faults: 0` in all four trial
fights** (8–10 `api.use` calls each, fuel never exhausted).

The mind uses `api.use` **with an aim point twice**, once of them fed by `V.lead`:

```js
api.use('k3', { x: en.x, z: en.z });
…
const aim = V.lead(me, en, { x: en.vx, z: en.vz }, 20);
api.use('k1', { x: aim.x, z: aim.z });
```

It also reads `en.casting.telegraph` to side-step a telegraphed lunge. It does **not** call
`hop` — worth noting for the mind-quality lane, since the requirement was "an aim point **or**
`hop`" and the aim point is what it took.

The previous mind is preserved at
`reports/combat/rethink/c_255ab41e-6cf.before.0fa00619.js`; `REPORT.md` in that directory was
rewritten by the tool as designed. Rating, kit, build, name and body untouched
(`kitUntouched: true`, `buildUntouched: true`, `nameUntouched: true`).

---

## 7. Length

| render | before | after |
|---|--:|--:|
| fixture (`brainPrompt('blue')`) | 21 185 | 21 967 |
| kit A vs kit B (`prompt-rendered.txt`) | 35 353 | 42 965 |

There is no length assertion anywhere in `checkprompt` — the character count is printed, not
judged — so nothing was violated, but the kit document is 22 % longer and the reason is that
it now says a great deal more that is true. Redundancy was trimmed rather than facts: the
aim-lock clause on each card was cut to five words because the full statement lives once in
HOW THE PIECES INTERACT; the mortar's and the field's "read at the strike" sentences were
merged into the clause that already said it; the leap card's refusal row was deleted because
the same rule is stated in the Leaving the ground paragraph, which every kit reader gets. That
recovered about 800 characters. Trimming further would have to remove facts.

---

## 8. Things I could not state truthfully, and one stale comment

Nothing in the sim contradicted a sentence I needed. Three notes for the other lanes:

1. **`namesOf` in `src/core/sim.js` still says «у существа с китом их РОВНО ТРИ»** in its
   docstring, which stopped being true when `compileKit` began appending `hop`. Behaviour is
   correct (`p.self.skills` reads `k1, k2, k3, hop`); only the comment is stale. Not my file.

2. **A field's tick period measures 0.508 s, not 0.500.** The disc's schedule is driven off the
   world's clock and drifts by one step over five ticks. The prompt prints the config figure
   (`every 0.5 s after`), which is what the schedule is derived from, and `checkbehaviour`
   forgives one step. If the mechanics lane ever wants the printed number to be exact to the
   step, the fix belongs in `tickZones`, not in the text.

3. **`p.enemy` has no live `turnRate`** (`perceive` sends a live `maxSpeed` for the enemy and no
   turn rate at all), so a `weaken` on the `turn` channel is invisible to the other side while a
   `weaken` on `speed` is visible. The prompt now says so rather than leaving the asymmetry to
   be discovered. If that asymmetry is not intended, it is a one-line addition to `perceive` and
   a one-paragraph deletion here.

Also worth flagging, though it is not a falsehood: the hop card prints "your top speed is
multiplied by 1 and your turn rate by 1", because `DELIVERIES.jump` scales neither. The
fixture half of this file omits scale rows that are 1.0 on the argument that a sentence saying
nothing is worse than silence; the kit half prints them uniformly, so that the interrupt clause
on the same row is never missing. If that trade should be made the other way, it is one
condition in `kitBlocks` and one matching condition in `kitExpected`.
