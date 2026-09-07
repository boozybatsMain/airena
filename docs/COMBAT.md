# Combat & balance — the contract (07.09.2026)

The founder's direction, in one line: people come to WATCH two minds fight, and
the fight has to look like thinking — abilities used often and on purpose, not
two bodies walking while three tiles count down. This document is the binding
design for how abilities are priced, paced and measured after the 07.09
overhaul. `DESIGN.md` records the decisions; this file explains the world.

Everything numeric below is a TARGET or a MEASUREMENT. The registry
(`src/skills/registry.js`) is the only source of the live numbers; the balance
report in `reports/combat/` is the only source of the evidence behind them.

---

## 1. What was wrong, in numbers

Measured on the shipped world (`reports/combat/spectator-baseline-old-cooldowns.md`,
36 fights between the six top creatures):

| what a spectator was watching | before |
|---|---|
| ability cooldowns | 7–16 s, derived from the ability's price |
| casts per fighter per 10 s | 3.1 |
| fighter with no ability running | 84% of its time |
| … of which waiting with EVERY ability on cooldown | 60% |
| both fighters fully on cooldown at once | 56% of the fight |
| fights that reached the arena's burn | 36 of 36 |
| deaths dealt by the arena rather than by a hit | 34 of 36 |
| dodges (jump or blink under a hit) | 0.14 per fight |

The cooldown WAS the balance: a stronger ability was a rarer one. That is a
correct way to price a card game and a wrong way to run a spectator sport —
the cadence was set by the cooldowns (88% cooldown utilisation), not by the
minds, so nothing a mind did could make a fight look alive.

## 2. The new shape of an ability

An ability is still `delivery × 1–3 effects × (channel) × element`. What changed:

1. **Cooldown belongs to the delivery, never to the price.** Every shape has a
   rhythm of three seconds or less, counted from the step the order is applied
   (the wind-up and the recovery run inside it). The rule is absolute and it is
   held by a gate, not by a comment: `tools/test.mjs` fails if any delivery or
   any reference-fixture skill goes above 3.0 s. It reaches the fixture too —
   the sparring set a kitless creature fights on was brought under the ceiling
   on 07.09 (`blink` 3.9 → 3.0, `charge` 4.0 → 3.0, and `smash` re-scaled to
   33.6 damage at 2.0 s, `laser` to 24, so the fixture is the grammar's beam,
   fan and lunge in disguise rather than a fifth balance regime). Nothing turns
   a cooldown into more wall time either: **Weaken may not take the Cooldown
   channel**, because it slows the countdown rather than raising the number, so
   a 3 s tile took up to 4.6 s while the chip never read above 3.0. Boost keeps
   the channel — a countdown that runs faster cannot break a ceiling.

   | delivery | cooldown | wind-up · recover | aimed by | why this rhythm |
   |---|---|---|---|---|
   | fan (cone) | 2.0 s | 0.28 · 0.28 | facing | the close swing: fastest, must be in reach |
   | bolt | 2.2 s | 0.34 · 0.16 | facing | a shot that can be side-stepped |
   | leap (jump) | 3.0 s | 0.06 · air 0.55 · 0.16 | none | a dodge that costs the air time; the same rhythm as the other self shapes |
   | mortar (lob) | 2.6 s | 0.50 · 0.20 | point | must be aimed a second ahead |
   | beam | 3.0 s | 0.65 · 0.10 | facing | crosses the whole arena, needs a line |
   | field (zone) | 3.0 s | 0.45 · 0.25 | point | owns ground for 2.4 s |
   | lunge (dash) | 3.0 s | 0.30 · travel 0.40 · 0.26 | facing | 8 m of real travel at 20 m/s, dodgeable; the 0.30 s wind-up is above the 0.2 s interrupt floor, so a stun cancels it |
   | blink | 3.0 s | 0 · 0.18 | point | 6.5 m and 0.25 s of invulnerability |
   | aura (self) | 3.0 s | 0.30 · 0.18 | none | applies to the caster |

2. **Weight carries the balance.** Each piece (delivery, effect, channel) has
   a cost in points; a creature spends a budget on its three abilities. The
   costs are not argued: `tools/atombalance.mjs` measures the marginal win-rate
   value of every piece on a panel of four kit-agnostic pilots and re-prices so
   that value per point is flat (§5). An unbalanced hand-made set is allowed to
   exist — the budget is the ceiling, not a guarantee.

3. **The mind aims.** `api.use(name, { x, z })` names a point on the ground: a
   mortar and a field land ON it (clamped to range), a blink steps toward it,
   everything else turns toward it and fires along the facing at the strike.
   Both halves of an aim — direction AND distance — are read at the strike, so
   a mortar lands on its point however far the caster walked during the
   wind-up. The point is a LOCK for the length of that wind-up: a later
   `api.face` / `api.faceAt` does not replace it, and it ends at the strike. An
   aim point handed to a shape whose `aim` is `none` (an aura, a leap) turns
   the body not at all.
   The single-number mortar distance and the blink direction pair still work,
   and `p.self.kit[name].aim` says which of the three an ability is. A mortar
   lands `distance ÷ 18 m/s` seconds after the cast ends and touches nothing on
   the way — the harder shape to land is the one that pays best: the mortar's
   effects carry ×1.4, the lunge's ×1.15, the fan's ×1.4 (on damage and burn).
   (This line read ×1.25 while §4 below and `registry.js` read 1.4; 1.4 is what
   the panel measured and what the sim applies.)

4. **Control leaves immunity, by class.** Stun takes `act` and `move`, root
   `move`, silence `act`, blind `sense`. The window is armed the moment the
   control LANDS and runs for `duration + immune` seconds (registry: 3 s), so a
   body that is stunned already lists `act` and `move`. A second application
   inside the window is refused with `missed: immune`, and both minds read
   `p.self.immune` / `p.enemy.immune`. No price fixes a chain; only a rule
   does. Stun → silence and stun → root are refused; silence → root goes
   through (two different things to lose).

   **A field's control lands once per cast, per body.** A disc ticks five
   times, and applying the control on every tick meant applying it on the first
   and being refused four times by the immunity that first tick had armed — 88%
   of every refusal in the league was a disc refusing itself, and a mind reading
   its events was told its field was failing while it worked. The control lands
   on a body's first contact tick, at the registry's WHOLE duration (it is no
   longer divided by the disc's per-tick share); the later ticks of that cast do
   not attempt it, so they log nothing, announce nothing and draw nothing.
   Damage and burn keep ticking every half-second. A DIFFERENT cast landing a
   control on an armed class is still a decision and is still loud.

5. **One field per ability and one wall per caster.** A new cast replaces the
   old one, and the navigation graphs are rebuilt when a wall rises or falls,
   so `moveTo` routes around a wall instead of leaning on it. A wall stands for
   5 s — longer than any cooldown that can build it — and it is **cover you can
   shoot from**: the caster's own beam and bolt pass through its own wall, the
   enemy's are stopped by it, and both bodies and both navigators treat it as
   solid. A WORLD atom is built whether or not the delivery carrying it
   connected — on a bolt stopped by cover, a bolt that ran out of range and a
   mortar that landed on empty floor as much as on a beam, a fan, a lunge or a
   field.

6. **Impacts interrupt, and they stop a lunge.** A stun, a silence, a knock or
   a pull landing on a wind-up longer than 0.2 s cancels the cast and its
   cooldown is spent — for grammar abilities too (the old code only ever
   interrupted the two hardcoded reference skills). A stun, a knock or a pull
   that lands on a body already **travelling** a lunge ends the travel where it
   stands: the lunge goes straight to its recovery and the impulse then moves
   the body normally. Before this, a stunned lunge kept sliding and an impulse
   on a dashing body was discarded outright.

7. **Knock and pull are impulses** on the knockback slot, decaying at 9 m/s²
   whatever the body wants: 6 m/s moves a body 2.0 m, 6.5 m/s 2.35 m. They
   respect invulnerability like damage does.

8. **A heal is a share of the missing hp** — the registry's `share`, never less
   than its `floor` and never more than its `mag` (§4 has today's three
   numbers): it rewards the mind that heals when hurt and gives almost nothing
   to one that heals on cooldown. A shield expires before its own cooldown.

9. **Burn extends, never renews.** A fire landing on a burning body adds its
   own duration to what is still burning, capped at twice that duration, and
   takes the higher rate of the two. Renewal threw away every second still
   running when the next hit landed, which is why a fan of burn lost to a fan of
   damage 29 : 71. **Burn in a field is standing in fire**: the field's burn
   rate × 1.4 while inside, one second of afterburn after leaving, instead of a
   sixth of a spark — and a field's ticks renew rather than extend, because
   standing in fire is one fire.

10. **Everything is announced.** A hit the shield ate — whole or in part — is a
    `dealt` with `absorbed`, on both sides. An ability whose atoms carry no
    damage and no burn announces `dealt` with `amount: 0` and `landed`, the list
    of atom ids that actually took, so a control that connected reads differently
    from one that was refused. A body inside its i-frames is told `evaded` once
    per ability per tick and the attacker is told `missed: invulnerable` once,
    not once per effect. `api.ready` consults silence and the air; a silenced
    body may still cast an aura, blink or leap that carries a cleanse; perception
    carries `maxSpeed` live, every effect's compiled magnitude, a raised wall's
    `until`.

11. **A creature has exactly three abilities** (D160, D195). There is no free
    fourth verb: a compiled kit is the three the creature bought and nothing
    else, and leaving the ground is a **bought delivery** — the leap, priced by the panel (8 at v9),
    which a set takes only if it wants it. A free universal `hop` was appended
    to every kit for one day and reverted, because it made the kit four slots
    wide in everything a mind reads while the shop still sold three. What every
    kit can do without buying anything is **side-step**: walk across the line of
    a shot already in the air. That is why the pace metric counts a dodge as a
    leap or a blink under a hit **or** a side-step, and why a set carrying
    neither a leap nor a blink is not a defect. A fighter on the reference
    fixture keeps its own hardcoded `jump`.

12. **A fighter quips at most once every 4 seconds.** A line inside the window
    is dropped silently — no fault, no event, no budget charged. `api.say` was
    accepted fifteen times a second, and the stored ladder shows what that
    bought: 9.8 lines a match and 1.9 distinct lines per speaking fighter.

13. **Three seeds are three fights.** Both the spawn angle and the phase of the
    think clock are drawn from the match seed (the pair stays mirrored at the
    same distance). Determinism is untouched: the same seed is the same fight,
    bit for bit.

## 3. Pace targets (what "alive" means, measurably)

Measured by `reports/combat/spectate.mjs` on the ladder's top creatures and by
`tools/atombalance.mjs` on random legal kits with the pilot panel:

| metric | target | old world |
|---|---|---|
| median fight length | 20–35 s | 37 s |
| casts per fighter per 10 s | ≥ 6 | 3.1 |
| fighter with no ability running | ≤ 55% | 84% |
| … waiting with every ability on cooldown | ≤ 25% | 60% |
| both fully on cooldown at once | ≤ 25% | 56% |
| fights reaching the arena's burn | ≤ 35% | 100% |
| deaths dealt by the arena | ≤ 20% | 94% |
| hit rate of targeted shapes | 55–80% (a miss has to be possible) | 74% |
| dodges per fight (a leap or a blink under a hit, or a side-step: a bolt or a mortar that missed a body moving across its line faster than 2 m/s) | ≥ 1 | 0.14 |
| dead ability slots | ≤ 2% | 0.5% |

## 4. Magnitudes and weights at a three-second rhythm

With every ability usable ten times a fight, the old per-hit numbers (26 damage,
26 heal, 40 shield for 5 s) made sustain the dominant strategy: the first run of
the instrument at 3 s cooldowns priced heal and shield as the two most valuable
pieces in the grammar and the starter healer preset won 94% of its league. The
table below is what nine passes of the panel instrument settled on
(`reports/combat/atombalance-panel-v2…v9.md`; the registry is the source).
Passes v2–v5 were read by the wrong headline — cost ↔ value correlation,
which measures the price ORDER — and the fit carried the kit's total cost as
a feature, which is the exact sum of the other columns (D197). From v6 the
fit has no cost column and the headline is the per-point SPREAD (§5): a point
of budget should buy the same win rate wherever it is spent. By it the
weights moved from a spread of **1.73** (v5) to 1.46 (v6) → 1.30 (v7) → 1.21
(v8) → **1.11** (v9: 480 kits × 24 games, 11 520 matches), all in the 180 hp
world. Between v6 and v7 the five pieces that read as traps at the floor
price (root, knock, weaken, boost, mortar) were changed in magnitude, not
price (D200). D201 then gave every body 60 more hp for the product's pace,
and in that world the panel — four scripted pilots that kite and strafe —
stalls harder (83–87 % of its fights reach the burn clock, from 68 %): the
same pieces read **1.27** (v10b) and **1.30** (v11, the pass the shipped
prices were played at, after knock 10, weaken ×0.4 and burn 8 by magnitude).
The largest price move the instrument still proposes fell 5 → 7 → 3 points
(v9 → v10b → v11); it is NOT CONVERGED by its own rule, and the six pieces
it reads as traps in v11 (stun, blind, pull, boost, wall, vision) are all at
the floor of 1 — a magnitude question the next round owns, in a world where a
stalled fight is decided by hp fraction and a control contributes nothing to
it. Damage sits at the price ceiling of 10 and still buys +1.8 pp a point:
the one deliberate unflatness, because damage is a must-have (rule L2) and
its price is bounded by the budget, not by the instrument.
`tools/checkprices.mjs` binds to the newest pass and holds the spread as a
ratchet (≤ 1.35 in the 240 hp world; lower it when a pass earns it). The
panel's prices are relative worth; the product's pace is measured on minds
(§3, §7).

| piece | weight | magnitude at full share | rule |
|---|---|---|---|
| damage | 10 | 24 hp (fan ×1.4, mortar ×1.4, lunge ×1.15) | the shape's premium is on harm only |
| burn | 10 | 8 hp/s for 3 s | extends on re-application (cap 2×), never stacks; field: rate ×1.4 while inside, 1 s after, ticks renew |
| heal | 10 | 9% of missing hp, 4–12 | self-limiting; was 12% / 4–16 — the two-sustain mirror stalled (§3 of the review) |
| shield | 9 | 12 hp for 2.5 s | expires before its own cooldown; left at 12 — it already reads below the mean per point |
| stun | 1 | 1.0 s | act + move immunity 3 s after; cancels a wind-up |
| root | 2 | 2.2 s | move immunity 3 s after; longer than a mortar's flight at mid range, so a rooted body is a landing spot |
| silence | 3 | 1.8 s | act immunity 3 s after; cancels a wind-up |
| blind | 1 | 2.2 s of a 1 s-old enemy block | sense immunity 3 s after |
| knock / pull | 1 / 1 | 10.0 / 6.5 m/s impulse (≈ 5.5 / 2.35 m) | cancels a wind-up and ends a lunge; respects invulnerability |
| boost / weaken | 1 / 1 | ×1.6 for 4.0 s / ×0.4 for 2.8 s | replaces, never stacks |
| wall | 1 | 4 × 1 × 2.2 m for 5 s, 3.2 m ahead | one per caster; navigation knows it; transparent to its own caster's beam, bolt and line of sight — cover you shoot from behind (still −4.9 ± 1.6 on r1) |
| cleanse | 5 | removes fire, root, blind, silence, stun, weakens | castable through a silence on a self shape |
| deliveries | beam 4 · fan 2 · bolt 4 · mortar 2 · field 3 · lunge 2 · blink 7 · aura 4 · leap 6 | | |
| channels | speed 3 · turn 1 · damage 3 · armor 2 · cooldown 10 · range 1 · vision 1 | | |
| effect share | 1 / 0.85 / 0.7 on magnitudes only, counted over the magnitude-bearing atoms of the ability | | durations travel whole; a duration-only atom (stun, root, silence, blind, wall, cleanse) no longer taxes the damage it rides on — the +2 / +5 surcharge is its whole price |
| budgets | ability 28 · set 60 | | every stored set stays legal |

What the panel could not price was re-scaled instead: every control read
negative on the first pass at the old durations (0.8 s stun, 1.2 s root) — a
piece the pilots could not turn into a win at any price — so the durations grew
and the immunity window caps their uptime. The body economy moved with it:
kills now decide fights, so hp is dearer (floor 120, 14 hp a point) and a small
body cheaper (0.10 m a point). That left the body gate red (small body 37.5 %,
then 24 % once the pilots learned to land their hits), and the fix was not the
radius price — scanned 0.06…0.13 a point the small body stayed at 15–26 %,
because it cannot buy hp at all and every other body simply got smaller. The
axes are now hp floor 150 at 9 hp a point (top 300), radius floor 1.0 m at
0.10 a point, turning and jumping at weight 0.35: `tools/sizebalance.mjs
--rounds=20` worst deviation 6.9 points, `--rounds=40` 7.7, every body inside
the instrument's resolution (D199). No stored creature carries a build of its
own, so no stored body was re-priced; the default body costs 19.8 of 25.

## 5. How the weights are found

`tools/atombalance.mjs`:

1. Sample N random LEGAL kits (grammar rules, budgets), stratified so every
   piece appears often enough to be measured. A kit that carries no damage and
   no burn atom is rejected and re-drawn: it cannot take a hit point off
   anybody, so its league game would be decided by who was ahead at the bell,
   and a price found on such rows is a price for stalling. (The grammar's own
   L2 rule already bars them; the instrument asserts it rather than inheriting
   it from another file.)
2. League: each kit plays mirrored matches against random other kits, the SAME
   pilot on both sides so that only the kits differ, over a panel of four
   kit-agnostic pilots (`brains/kit-stub`, `brains/pilots/{rusher,kiter,controller}`)
   — a piece a rusher cannot use and a kiter can is priced by both. The pilots
   read the live numbers off `p.self.kit[name].magnitudes` and AIM the shapes
   that are aimed: the kiter and the controller lead a mortar and a field to
   where the enemy will be, the rusher places a field on where it is. A piece
   nobody points at is priced as worthless, and the mechanic the price is
   supposed to reflect would never be exercised.
3. Ridge regression of a kit's score on the counts of each delivery, effect and
   channel, the delivery×effect pairs and the effect-count surcharges, with
   bootstrap standard errors. There is **no `cost` feature**: total cost is an
   exact linear sum of the piece counts, so including it let ridge split every
   piece's value arbitrarily between "cost" and the piece while the re-price
   read only the piece half — four passes oscillated instead of settling. One
   delivery dummy is dropped with it (a kit always carries exactly three
   deliveries, so the nine counts are collinear with the intercept); the
   delivery block is re-centred to mean zero and its common LEVEL is stated as
   unidentifiable rather than parked on one piece. Effect and channel values
   are absolute.
4. Re-price: `cost_i ∝ value_i`, one scale for all thirty pieces so the sum of
   costs is preserved (the budget scale is a design decision, not a
   measurement), each price clamped to 1…10, optionally damped toward the
   current price when the loop is oscillating.
5. **The stop rule, and it is the exit status.** A pass is CONVERGED (exit 0)
   when both halves hold: no proposed price moves by more than one point, AND
   no piece is significantly negative (value < −2·se). Otherwise the report
   says NOT CONVERGED and the tool exits 2, so a pass cannot be recorded as
   done by a caller that only reads stdout. The second half cannot be fixed by
   pricing — a piece already at the floor of 1 that still reads −7 has no price
   left to lose — so it sends the work back to the MAGNITUDES (§4).
6. **The headline is value per point**, not the correlation between cost and
   value. Flat prices mean a point of budget buys the same win rate wherever it
   is spent, so the number to drive down is the SPREAD (sd) of value ÷ cost
   across the effects; corr(cost, value) says only that the ORDER is right, and
   it sat at 0.79–0.96 through four passes in which a point on damage bought
   ~3 pp and a point on root bought ~−3.6. `tools/checkprices.mjs` binds to the
   newest `reports/combat/atombalance-panel-*.json`, prints which file it bound
   to, and gates on sd ≤ 0.8 pp/pt across effects and zero significantly
   negative pieces.
7. **Every report opens with the population it measured**: mean and median
   fight length, the share of fights that reach the burn clock, what took the
   last hit point (an opponent's hit / an ability's fire / the arena's burn),
   the share of paid ability slots that never fired, and dodges per fight. A
   price found in fights the arena finished is a price for stalling, and the
   contract targets of §3 are printed beside each row so the reader can see it.
8. Report: the value table (value, ± se, significance, trap flag, target and
   proposed cost), the significant delivery×effect interactions, the
   pilot-agreement correlation, and a Nash-style summary of the top kits
   (monoculture flag).

Every measuring job now runs on **the registry's own cooldowns** — the schedule
the game is actually played on. The measuring path used to default to a fixed
8 s, which made the body league (`tools/sizebalance.mjs`, a listed gate) report
on a world nobody plays; a job that really wants one schedule for everybody
must now say so with a number.

This is the standard answer in the literature for composable systems —
win-rate regression to price components and a metagame check for dominant
strategies (`reports/combat/research-balancing.md`) — with one Airena-specific
term: the pilot panel, because the value of a piece that removes a decision is
the number of decisions the opponent was making.

## 6. The mind prompt

Unchanged policy: every line is a capability, a constraint with its reason, a
fact about the world, or the objective; no tactics. What the overhaul adds are
FACTS the minds were missing — projectile speeds exist and `V.lead` is for them,
the aim point, the immunity window, the one-field rule, the cooldown rhythm,
what the opponent sees of a wind-up — each measured by `tools/checkbehaviour.mjs`
and judged by `tools/checktactics.mjs`.

### 6.1 The document, as it now stands

`src/brain/prompt.js` renders in two forms. The **fixture** form describes the
five hardcoded skills the six reference minds in `brains/` were written
against. The **kit** form — what every player's creature reads — replaces the
two skill sections with cards built from the compiled kit, and adds three
things the fixture has not got: `HOW THE PIECES INTERACT`, the `p.self.kit` /
`p.enemy.kit` paragraphs, and the grammar's own event list. Render either with
`node reports/combat/renderprompt.mjs` (`reports/combat/prompt-rendered.txt`).

A kit card is a function of the compiled ability and of BOTH bodies, because
half its numbers are sums over two radii. It prints, in order: the served
cooldown; the cast as served phases;
what the speed and turn scales do from the order **to the end of the recovery**;
how the ability is aimed; the delivery in full; each geometric term on its own
line; the farthest centre-to-centre hit as the sum of those terms; and one line
per effect carrying that effect's compiled magnitude, duration and immunity
window. Timings are the SERVED figures — a phase ends on the first step at or
past its length — while `p.self.kit` serves the DECLARED ones, and the prompt
says so rather than leaving the reader to find the discrepancy.

### 6.2 What holds it true

Three gates, in layers.

`tools/checkprompt.mjs` runs the config↔text guarantee in both directions over
**both** forms: the fixture render and two kit renders (the same kits
`renderprompt.mjs` uses, plus a second pair that reaches the deliveries and
effects the first does not). Every number leaves the prompt through
`q(label, value)`, which records the pair and brackets the characters it
produced; kit numbers carry `kit.<own|enemy>.<slot>.<field>` labels, the side
being part of the label because one document prints two different kits. The
checker recomputes each expected value from the compiled def and from config,
with its own copy of the tick arithmetic, and then sweeps everything OUTSIDE
the brackets for numerals — so a figure typed into the card prose by hand
cannot reach a model. Until review r1 the kit half was outside this entirely:
59 card numbers went out through the untraced formatter (F7).

`tools/checkbehaviour.mjs` fires each ability in a controlled world and
measures what the card claims: reaches by binary search, the served wind-up and
the order-to-recovered total, the cooldown, the mortar's splash, the disc's
tick count, period and whole-disc totals for damage and for fire, the blink's
i-frames and distance, how far a knock and a pull actually move a body, how
long an immunity window keeps a class in `p.enemy.immune`, the heal's floor,
cap and share each probed where it alone decides, and the leap's phases.

`tools/checktactics.mjs` puts every segment of every form to a judge against
the four permitted categories, with planted tactics and real lines mixed into
each batch. Verdicts are committed, so the check is free until the prompt
changes.

### 6.3 Round-1 corrections

The reviewer's findings, and the facts that replaced them:

- An immunity is armed when the control **lands**, not when it ends: the window
  is `duration + immune` from that instant, a second copy of the same control
  inside it is refused rather than extending anything, and `p.self.immune` /
  `p.enemy.immune` list the classes for the whole window. Fire, shield, boost
  and weaken replace-or-extend; the four controls do not.
- A mortar and a disc aimed at a point land ON the point, direction and
  distance both read at the strike.
- An aim point is a lock for the whole wind-up; a later `api.face`/`api.faceAt`
  is ignored until the strike; a point handed to an `aim: 'none'` ability turns
  nothing.
- A wall is built on any miss, stands 5 s, is axis-aligned, and does not stop
  its own caster's beam or bolt.
- `evaded` arrives once per ability per step; a control-only hit announces
  `dealt` with `amount: 0` and `landed`.
- The recovery is slowed as much as the wind-up. Refusals are `airborne` in the
  air and `busy` during a crouch or a landing.
- Vocabulary: **leap** is the jump delivery an ability buys — a crouch, an
  airborne phase and a landing. The reference fixture's hardcoded `jump` is the
  only thing still called a hop, and only in its own prompt.

## 7. Evidence

### 7.1 Fix round 1 (07.09, after the round-1 reviews)

Everything below was measured on the tree with the round-1 fixes
(`reports/combat/fix-r1/*.md`), the v9 prices, budgets 28 / 60 and the hp
axis at 210…360 (D201).

**Pricing passes** (`reports/combat/atombalance-panel-v6…v11.md`): per-point
spread across the 14 effects 1.46 → 1.30 → 1.21 → **1.11** (v9, 480 kits ×
24 games, 180 hp world) and 1.27 → **1.30** (v10b, v11: 480 kits, 240 hp
world); largest proposed move 5 → 7 → 3 points; significant negatives in v11:
six, all moved to the floor of 1 (stun, blind, pull, boost; wall and vision
were there). Damage at the ceiling of 10 still +1.8 pp a point. The panel
population reaches the burn clock in 68 % (v9) → 83 % (v11) of its fights —
a pilot world, not the ladder (13 % in the minds' cross league).

**Extreme-kit duels** (`reports/combat/duels-v9.md`, the review's kits A–L,
four pilots, 6 seeds mirrored): three bare damage abilities (B, 40 points)
still beat the control-heavy kit (E, 33) 48–0 — a control cannot take a hit
point, and an equal-cost duel of harm against no harm is not the game's
question; +root now WINS (J vs K 24 %, was 64 %); fan-of-burn loses to
fan-of-damage 15 % (was 29 %); the sustain mirror C vs D is still 100 % burn
clock at 42 s (both kits can only lose to the arena — cleanse strips C's only
harm). The harm-max kit A costs 64, over the kit budget of 60.

**Bodies** (`tools/sizebalance.mjs --rounds=20`, real cooldowns): worst
deviation 10.3 pp (small 60.3 %, tanky 40.0 %), gate < 12 — green; before
the round it read 25.6 pp on the real cadence (the old gate had measured an
8 s world).

**Pace on minds.** Ladder six (`reports/combat/spectator-v9-prices.md`):
median 16.5 s (was 15.3 before the round, 12.7 before D201), 8.5 casts per
fighter per 10 s, 8 of 36 reach the burn clock, 33 of 36 end by a hit, hit
rate 91 % — three of the six are scripted kit-stubs and the rest Opus-plain
minds that do not dodge (0.03 dodges a match). Bake-off minds' cross league
(`reports/combat/review-r1/minds-cross.mjs`, 6 model families, 272 fights):
median **20.6 s**, 54 % inside 20–35 s, 13 % reach the burn clock, 78 % end
by a hit, 16 % by fire, 6 % by the arena; immune refusals on control-only
casts 0.00 a match.

**Gates**: `test.mjs` 70, `checkbehaviour` 67 claims, `checkprompt` (0
tactics), `checkgrammar`, `checkkits` (78 creatures legal), `checkprices`
(ratchet ≤ 1.2, no trap above the floor), `checkspec`, `checkdocs`,
`checkfixtures` (32 of 32 cast on both colours), `checkladder` (pace from
stored summaries: 0–1 dead sides of 400 — the one seen was a hand-written
reference mind flaking for a single fight; the kitless library creatures were
given their stored kits and rewritten minds after this reading).


- `reports/combat/spectator-baseline-old-cooldowns.md` — the old world.
- `reports/combat/spectator-baseline.md` — the same roster after the change.
- `reports/combat/atombalance-*.md` — every pricing run, with the command.
- `reports/combat/bakeoff/` — the model bake-off.
- `reports/combat/review-*.md` — reviewer rounds and scores.
