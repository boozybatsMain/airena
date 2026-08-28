# Airena — the experiment

**The question.** Can "the brain is written by an LLM" be a mechanism rather than a label?

That decomposes into three things you can measure, and one you cannot:

1. Does one model, given two different bodies and no tactics, write two different **programs** — or
   the same program with the nouns changed?
2. Are those programs **closed-loop on the opponent**, or fixed routines that happen to be running
   next to one?
3. Does **which** brain you got decide the fight, or do the constants decide it and the brain is
   decoration?
4. Is it any good to watch? — which is a judgement, and is left to the reviewers.

Everything below is measured. The numeric block at the bottom is regenerated from the artefacts by
`node tools/report.mjs`; nothing in it is typed by hand.

---

## How it was done

**The prompt is a dictionary, not a design.** `src/brain/prompt.js` may emit exactly four kinds of
line: a capability, a constraint *with its reason*, a fact about the world, and the objective —
which is one sentence long and says "kill your opponent, stay alive". No priorities, no rankings, no
worked strategies, no "it is usually better to". `node tools/checkprompt.mjs` enforces both halves
of that. The numbers are mechanised: the prompt reports every value it emitted, each one is compared
against live config, and everything outside those emissions is swept for stray numerals, so a number
cannot reach the model without passing through `config.js`. Durations are rounded on the way out,
towards the world rather than away from it — the sim's clock turns over on ticks, so a wind-up
declared at 0.28 s is served in 0.3 and the model is told 0.3; twelve of the eighteen disclosed
timings move that way, and `node tools/checkbehaviour.mjs` measures every one of them against the
running simulation.

The other half used to be a list of six tactical phrasings that must not appear, and it was
worthless — see below. It is now `node tools/checktactics.mjs`, which puts every segment of the
rendered prompt to a model against those four categories, with fabricated tactics and real lines
mixed into each batch so that a judge which cannot tell them apart fails the run rather than
blessing it.

**The generator is `claude -p`** on an OAuth subscription, with tools, skills, MCP and settings all
switched off so that a birth cannot depend on the local machine's configuration. Its answer is
stripped of any markdown fence and otherwise used unmodified.

**The validation ladder is a "does it run" gate, deliberately.** It checks that the source compiles,
that it defines `think` with arity 2, that it survives two whole matches against a hand-written
sparring partner without throwing on more than 2% of thoughts, that it issues at least one order,
that the body actually moves, and that it successfully starts at least one skill. It has no opinion
about tactics; a filter that rejected "bad" fighters would quietly select for whatever style the
person who wrote the filter imagined, and the result would measure that person.

**The population is six independent generations per fighter**, same prompt, same model, same effort.
One brain proves nothing about a generator: the interesting quantity is the spread.

Five populations were generated over the course of the work and all of them are kept — the shipping
one in `brains/`, the rest under `reports/brains-*`. They are not clutter. Each was written against
a different constant table, and `node tools/checkstale.mjs` prints exactly which numbers have moved
under each one since. The shipping population is the only one that reads `current`, and it is the
**held out** one: the constants were fitted against the population before it, and this one was
generated afterwards and measured with no further tuning.

---

## What the balance work found, and why it is reported here

The constants were not argued into place, they were searched. `tools/balance.mjs` samples a
constant space at random and then walks it by coordinate descent, scoring every candidate over the
full grid of a brain population — every octopus against every gorilla — on fairness, pacing, the
shape of the fight (a chase, not a hug), decisiveness, and whether every skill still earns its slot.
`tools/bake.mjs` writes a winner into `src/core/config.js` as literals and verifies by re-importing
the module that each one landed.

Four findings from that work are worth more than the numbers it produced.

**Brain quality dominates the constants, and this is the load-bearing result.**

The first search tuned against one generated pair until it sat at 52/48. Both brains were then
regenerated against those exact constants, and the same matchup went to 20/80. Nothing about the
world had changed; one of the two new programs was simply better than the one it replaced.

Scoring against a 3×3 grid of independent brains was the obvious fix and it was not enough. A later
pass tuned to 50% on three brains and measured 62% on all six of the same population — a subset is
not a proxy for a population either. Scoring on the full 6×6 fixed that and exposed the real
problem: constants tuned to 50% on one population, with a fresh population then generated against
those exact numbers, measured **92%**. The same numbers had measured **29%** on the population
before. Three populations, three answers, one world.

> **A win rate here is a joint property of the constants and the population.** That is not noise
> around a true value. It is the measurement this project exists to make, seen from the other side:
> if the brain did not matter, this could not happen.

The diagnosis is specific rather than mystical. Under equal top speeds the octopus's ability to hold
range is a function of how well its program kites, and nothing else — so a weak kiter loses badly
and a strong one is never caught. The constants were not "wrong" in either measurement; they were
being asked a question that has no population-independent answer.

Two further things were tried and both failed in instructive ways.

**Scoring against two populations and taking the worse of them** was abandoned because it was
measuring *staleness*, not robustness: the two populations had been generated against different
blink cooldowns, so one of them was being asked to fight under rules it had been told nothing about.
That is a real effect — `node tools/checkstale.mjs` exists to make it visible — but a minimax over
it would have split the difference between a brain that knows the rules and a brain that does not.

**Fitting to one population and testing out of sample** was the obvious remaining move, and it is
what produced the sharpest number in the project. The constants were fitted until that population's
6×6 grid sat at 52%. A fresh population was generated against those exact constants and measured
with no further tuning: **14%**. The fit had not found a fair world; it had found the constants that
make one particular set of six octopus programs win half the time, and those six turned out to be
unusually good kiters, so the constants that restrained them flattened an ordinary population.

What was shipped instead is a **bracket**. Two populations with opposite biases — the strong-kiter
one and the ordinary one — are measured under the same candidate, and the constants are chosen so
that one sits above 50% and the other below it, as close together as they can be driven.
`node tools/bracket.mjs` runs it and exits non-zero if the two ever end up on the same side of even.

At the shipped constants the bracket is **29% … 74%, mean 52%**, and a fresh population generated
against those constants afterwards — the one in `brains/`, the one you watch — landed at **38%**,
inside it. That is the whole claim: not "the game is 50/50", which the measurements do not support,
but "the fair constants are in this interval, and which end a given fight lands at depends on which
brains you drew". It is a wider statement than a single fitted number and it is the one the evidence
actually licenses.

**A dictionary with no pressure to engage has a stalemate attractor.** One generated octopus kited
beautifully, never committed, and took 82% of its matches to the clock at 83 seconds each. Under a
"highest hp fraction wins" rule that is a winning line, and a brain told only "kill your opponent
and survive" is entitled to notice that surviving alone can be enough. The fix was to the *world*,
not to the prompt: from 30 seconds the arena burns a rising fraction of both fighters' maximum hp
per second, so the tiebreak that used to be announced by a timer now happens on screen. After it,
nothing is decided on the clock.

**A mechanic the fighters cannot expect to reach is a mechanic they are right to ignore.** That
burn threshold was 45 seconds for most of this project. At 45 it was decorative: the median match
ends at 21s, only 6.3% of matches ever reached the burn, and *none* of the twelve brains in the `k`
population referenced `p.burnStartsIn` — though the prompt documents it twice. The five that read
their own health did so only behind `t > 47`, `t > 52`, or `timeLeft < 15`: correct play for a phase
that never arrived. Sweeping the threshold moved burn-entry from 6.3% to roughly a fifth of matches for two seconds of
mean pace and no measurable shift in balance (38% to 37% octopus), and the regenerated `l` population
duly moved its health branches off the clock and onto `p.burn > 0` and absolute hp — one dead branch
where there had been four.

**But that did not make health matter, and the falsification set said so.** The prediction was that
a reachable burn would make health behaviourally live, because during the burn the fighter ahead on
hp *fraction* wins by standing still. Freezing both fighters' health in perception still changes
intent 0.0% of the time for ten of the twelve brains, and 0.1% and 2.3% for the other two. The
prediction was wrong twice over: `hpFrozen` cannot see burn-gated logic at all, since freezing health
does not change `p.burn`, and freezing *both* fighters to full collapses `myFrac > hisFrac` to a
constant. The honest reading is that in a duel with no healing, no resources and no comeback rule,
health is a scoreboard rather than a decision input, and a brain that ignores it is not being dim.
Making health steer behaviour needs a mechanic, not a constant — and the obvious candidate,
out-of-combat regeneration, is precisely what would resurrect the stalemate attractor above.

**A tuning pass can expose a bug that was always there.** Raising the closing speed made
`tools/test.mjs` report 109 ticks of the two bodies interpenetrating in a single match. The
collision solver had always pushed bodies out of blocks, then apart from each other, then clamped
them inside the arena — three correct steps, any two of which can undo the third. A body pinned
against a wall was being clamped straight back into the body it had just been separated from. It had
been latent for the whole project and only became reachable when bodies met at speed near a wall.
The solver now iterates to convergence and hands a pinned body's share of the separation to the one
that can still move.

**A skill nobody can land is invisible to a fairness metric.** An early configuration produced a
charge that connected 6% of the time. No win-rate or pacing term noticed, because a useless skill
costs its owner nothing but a cooldown it was not going to spend. The score now carries an explicit
floor *and ceiling* on hit rate — a beam that lands 95% of the time is not an aim either, it is a
guarantee, and it leaves the other fighter with no reply to a cast except to already be behind a
wall.

---

## What the model discovered that nobody told it

The prompt states that a ground sweep passes underneath an airborne body. It does not suggest
hopping over one. Generated octopuses jump-dodge smashes several times a match.

The prompt states the charge's direction locks at the end of its wind-up, and that
`enemyCommitted` fires at that instant. It does not suggest blinking perpendicular to the lane.
Generated octopuses compute the dash corridor and blink sideways out of it.

The prompt lists `p.enemy` field by field and says explicitly that the opponent's cooldowns are not
among them. Generated gorillas *reconstruct* them — timing `enemyStarted` events against the
cooldown table they were given, and detecting a blink from a position jump larger than the octopus's
top speed could explain — and then refuse to charge while the blink is likely to be up.

None of these were in the prompt, none are in the validation ladder, and all of them can be read in
`brains/*/` beside the `.json` that records which model produced them, at what effort, on which
attempt, and — for the shipping population — the entire constant table it was told about.

The last one used to be the one this document dwelt on, and the claim was overstated. The sentence
in the prompt that withholds `p.enemy.cooldowns` ended, for the whole life of the `l` population,
"— you get { type:'enemyStarted', skill } the moment they begin one, **and you know the cooldowns
from the tables above**." That clause names both halves of the derivation and leaves only the
addition to be made, and 11 of the 12 brains in `brains/` make it. It is not a tactic in the sense
of telling anyone what to do with the answer — no brain was told to refuse a charge into a likely
blink, and refusing one is still the model's own idea — but "nothing in this repo suggested that"
was wrong, and the six-phrase grep that was supposed to catch such things contains none of those
words. The clause has been deleted, the check that could not see it has been replaced, and the
honest reading of the shipping population is that the *arithmetic* was pointed at and the *use* of
it was not. The next population will be the one that answers the stronger question.

---

## The three ways this could have been shown to be a label

Named before the measurements were taken, in `docs/SPEC.md` §9.3:

1. **Identical vocabularies across same-fighter brains** — one model writes one mind.
2. **A brain whose behaviour is unchanged when the opponent channel is cut** — the fight is
   choreography.
3. **A win rate flat across same-fighter brains** — the constants decide everything.

Results 0–3 below are the answers. Note what the second one is careful about: pinning `p.enemy`
alone would score a brain that steers off the *event feed* as blind, and that is the most
sophisticated shape available, so the three channels are ablated separately and reported separately.
Note what the third one is careful about: a spread is not evidence, so the null is tested by
permutation rather than compared to an eyeballed threshold.

---

## What this does not show

- **Nothing here is about whether the model is a good game designer.** It was handed a designed game
  and asked to play it.
- **The population is six.** Six is enough to reject a null about brain identity; it is not enough
  to characterise the generator's distribution. It is also, demonstrably, not enough to pin a win
  rate: the same constants measured 29% on one population and 92% on the next.
- **A balance number here is provisional by construction.** The shipping constants were fitted to
  one population and validated on one held-out population. A third would move them again, by an
  amount the tables below let you estimate. This is reported rather than smoothed away because it
  is the same fact the project set out to demonstrate.
- **`node:vm` is a crash guard, not a sandbox.** `src/brain/host.js` says so in its own header. The
  brains here are written by the operator's own subscription from the operator's own prompt.
- **The reviewers' scores are judgements**, and the visual half of the work is judged by eye. The
  numbers below constrain that judgement; they do not replace it.

---

<!-- MEASURED:BEGIN -->

## The generation lane, as it ran

| tag | fighter | model | attempts | accepted | chars | cost | wall |
|---|---|---|---|---|---|---|---|
| u1 | octopus | opus/high | 1 | yes | 6352 | $0.458 | 202 s |
| u1 | gorilla | opus/high | 1 | yes | 9002 | $0.406 | 207 s |
| u2 | octopus | opus/high | 1 | yes | 8066 | $0.463 | 205 s |
| u2 | gorilla | opus/high | 1 | yes | 7230 | $0.372 | 186 s |
| u3 | octopus | opus/high | 1 | yes | 6670 | $0.399 | 175 s |
| u3 | gorilla | opus/high | 1 | yes | 5800 | $0.344 | 140 s |
| u4 | octopus | opus/high | 1 | yes | 6679 | $0.493 | 244 s |
| u4 | gorilla | opus/high | 1 | yes | 7678 | $0.408 | 206 s |
| u5 | octopus | opus/high | 1 | yes | 7718 | $0.478 | 237 s |
| u5 | gorilla | opus/high | 1 | yes | 8879 | $0.397 | 196 s |
| u6 | octopus | opus/high | 1 | yes | 9463 | $0.405 | 204 s |
| u6 | gorilla | opus/high | 1 | yes | 7598 | $0.402 | 203 s |

**12 of 12 brains accepted**, 12 generator calls in total — every one on the first attempt, no repair turn used. Mean accepted source 7595 characters. Total $5.02 and 40 minutes of model time.

## Result 1 — the grid, and where this draw landed in the bracket

Octopus win rate. Row = which octopus brain, column = which gorilla brain.

| | u1 | u2 | u3 | u4 | u5 | u6 | stub | **mean** |
|---|---|---|---|---|---|---|---|---|
| **u1** | 18% | 16% | 48% | 12% | 28% | 42% | 16% | **26%** |
| **u2** | 18% | 16% | 30% | 22% | 16% | 50% | 42% | **28%** |
| **u3** | 70% | 74% | 80% | 88% | 72% | 96% | 68% | **78%** |
| **u4** | 50% | 72% | 68% | 42% | 48% | 56% | 48% | **55%** |
| **u5** | 36% | 68% | 68% | 70% | 50% | 72% | 62% | **61%** |
| **u6** | 26% | 78% | 76% | 42% | 36% | 68% | 48% | **53%** |
| **stub** | 0% | 14% | 2% | 0% | 0% | 2% | 8% | **4%** |

- **Octopus win rate: 51%**, averaged over the 6x6 generated grid. Read it with the bracket above in mind: the constants were chosen so that a strong-kiter population and an ordinary one sit either side of 50%, and this is one draw from the same generator.
- **Mind: the octopus brains span 53% of win rate and the gorilla brains 24%**, over an identical field of opponents and identical constants.
- Mean match **27.0 s**, **0%** decided on the clock, melee uptime **28%**.
- Hit rates: laser **80%**, smash **40%**, charge **25%**. Uses per match: laser 7.7, blink 5.1, jump 3.0, smash 5.2, charge 5.4.
- **0 brain faults across 2450 matches.** Nothing was hand-corrected; this is the source the model returned, run unmodified.

## Result 2 — the brains are closed-loop on the opponent

Each brain is run twice in lockstep inside one match. Instance A perceives the world and
drives the fight; instance B perceives an ablated copy and its orders are discarded. The
world is therefore identical for both, so the only thing that can make them disagree is the
removed channel. Figures are the extra fraction of thoughts whose *intent* changes, over and
above the identity control — a brain that ignores a channel scores zero on it.

The column that carries the spectacle claim is **cast hidden**: `p.enemy.casting` is the field that
says *what* the opponent is winding up and *how long* is left of it, so a brain scoring zero there
never dodges a wind-up, only a body. It is deliberately separated from **position pinned**, which is
the far easier signal and the one a brain gets for free by walking towards a number. `p.enemy.busy`
is left live in the cast-hidden run — it still says *that* something is happening — which makes that
column a lower bound rather than a flattering one.

| brain | control | opponent's cast hidden | opponent's position pinned | opponent events dropped | health frozen |
|---|---|---|---|---|---|
| octopus:u1 | 0.0% | **6.2%** | 83.7% | 3.6% | 0.0% |
| octopus:u2 | 0.0% | **13.2%** | 79.6% | 12.7% | 0.4% |
| octopus:u3 | 0.0% | **5.9%** | 82.4% | 0.0% | 0.0% |
| octopus:u4 | 0.0% | **11.8%** | 89.9% | 5.7% | 0.0% |
| octopus:u5 | 0.0% | **8.1%** | 86.5% | 0.1% | 0.0% |
| octopus:u6 | 0.0% | **8.0%** | 81.2% | 0.0% | 0.0% |
| gorilla:u1 | 0.0% | **1.8%** | 65.8% | 0.0% | 0.0% |
| gorilla:u2 | 0.0% | **5.3%** | 69.7% | 0.0% | 0.0% |
| gorilla:u3 | 0.0% | **4.2%** | 60.1% | 7.0% | 0.0% |
| gorilla:u4 | 0.0% | **7.5%** | 74.4% | 4.6% | 0.0% |
| gorilla:u5 | 0.0% | **1.2%** | 67.1% | 16.7% | 0.0% |
| gorilla:u6 | 0.0% | **14.0%** | 68.5% | 5.8% | 0.0% |

All 12 brains change what they do when the opponent's wind-up is hidden from them, on 1.2%–14.0% of thoughts, against an identity control of 0.0%. Pinning the opponent's position instead scores 60.1%–89.9%: much the larger effect, and much the cheaper one to have — a brain gets it by walking towards a number, where the telegraph column requires it to act on a threat that has not landed yet.

_Footnote — the earlier write-up published a single **enemy pinned** column, 60.6%–89.9%, which pinned
position and telegraph together. Pinning position ALONE reproduces it to within 1.9 points on every one
of the 12 brains, so that column measured the position channel and was never evidence about the
telegraph. It is kept measured here for continuity with the earlier figure, and superseded by the two
columns above._

## Result 0 — one model, one prompt, six different programs

Each pair of same-fighter brains is run in lockstep inside one match: one drives, the
other perceives the identical world and has its orders discarded. **Policy disagreement**
is how often two programs handed the same situation want different things — two copies of
one program score 0, which is what the control column checks. **Vocabulary overlap** is a
second, cheaper angle: which api verbs and perception fields each source mentions at all.

| fighter | control (self vs self) | policy disagreement (mean / closest pair) | vocabulary overlap (mean / worst) | source lengths |
|---|---|---|---|---|
| octopus | 0.0% | **59.5%** / 51.1% | 0.663 / 0.933 | 6353, 8067, 6671, 6680, 7719, 9464 chars |
| gorilla | 0.0% | **31.6%** / 21.2% | 0.729 / 0.864 | 9003, 7231, 5801, 7679, 8880, 7599 chars |

## Result 3 — the six programs are not interchangeable

The spread of win rates across same-fighter brains is tested against the null "the brain
labels are exchangeable", by permuting them over the pooled match outcomes within each
opponent column. A spread on its own is not evidence; five identical coins produce one.

Note what this does and does not establish. It rejects "these six are the same fighter", and
that is all. Six programs differing only in one hardcoded constant would also reject it, so
this is a floor under the claim, not the claim itself — Result 0 is what shows the six are
different *policies* rather than one policy with the numbers moved. The negative control
below is six labels bound to a single program, and it must fail to reject.

- **octopus**: u1 27%, u2 34%, u3 75%, u4 59%, u5 58%, u6 53% — spread **47.9 points** over 240 matches each, **p < 5.0e-5** (20000 permutations).
- **gorilla**: u1 60%, u2 45%, u3 35%, u4 57%, u5 62%, u6 35% — spread **27.1 points** over 240 matches each, **p < 5.0e-5** (20000 permutations).
- _negative control, one run scored for both sides: all 6 labels bound to `u1` on disjoint seed blocks — spread 7.9 points, p = 0.262, which does not reject, as it must not (the threshold is p ≥ 0.01)._

## The constants, as shipped

Arena 40 x 40 m with 6 blocks. Simulation 30 Hz, thought 15 Hz. Sudden death from 30 s at 0.015 of maximum hp per second per second; backstop clock 50 s.

| | octopus | gorilla |
|---|---|---|
| hp | 155 | 205 |
| radius | 1 | 1.25 |
| maxSpeed | 4.22 | 5.35 |
| accel | 26 | 22 |
| turnRate | 6 | 4 |
| mass | 1 | 2.2 |
| jumpHeight | 1.5 | 1.3 |

| skill | windup | airborne | dashSeconds | recover | cooldown | damage | range | distance | dashSpeed | halfAngle | knockback | stun | iframes | moveScale | turnScale |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| laser | 0.65 |  |  | 0.1 | 2.2 | 27 | 24 |  |  |  |  |  |  | 0.45 | 0.35 |
| blink | 0 |  |  | 0.18 | 3.9 |  |  | 7.5 |  |  |  |  | 0.28 | 1 | 1 |
| smash | 0.28 |  |  | 0.28 | 1.3 | 35 | 2.9 |  |  | 0.96 | 2 |  |  | 0.3 | 0.55 |
| charge | 0.28 |  | 0.8 | 0.35 | 4 | 30 |  |  | 15 |  | 6 | 0.4 |  | 0.2 | 0.85 |
| jump | 0.1 | 0.55 |  | 0.16 | 2.8 |  |  |  |  |  |  |  |  | 0.35 | 0.35 |

_Provenance of every number above:_
- `reports/tournament.json` — `u1,u2,u3,u4,u5,u6,stub` x 50 rounds = 2450 matches, written 2026-08-26T14:14:01.401Z (8 min before this block).
- `reports/falsify.json` — `u1,u2,u3,u4,u5,u6` x 40 rounds = 240 matches per brain, reactivity over 6 opponents each, controls PASSED, written 2026-08-26T14:21:41.451Z (0 min before this block).
- The simulation they were measured in: `src/core` and `src/brain` last changed 2026-08-26T13:51:32.719Z (`src/core/config.js`), before both artefacts above.
- Regenerated by `node tools/report.mjs` at 2026-08-26T14:21:41.543Z from those files and `src/core/config.js`.

<!-- PROVENANCE {"generatedAt":"2026-08-26T14:21:41.543Z","world":{"newestFile":"src/core/config.js","touchedAt":"2026-08-26T13:51:32.719Z"},"tournament":{"tags":["u1","u2","u3","u4","u5","u6","stub"],"rounds":50,"matches":2450,"writtenAt":"2026-08-26T14:14:01.401Z"},"falsify":{"tags":["u1","u2","u3","u4","u5","u6"],"rounds":40,"reactRounds":6,"matchesPerBrain":240,"controlsPassed":true,"writtenAt":"2026-08-26T14:21:41.451Z"}} -->

<!-- MEASURED:END -->
