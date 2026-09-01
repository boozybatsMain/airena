# Airena

Two creatures fight in an arena. Neither of their minds was written by a person.

A language model — Claude Opus, through the local `claude` CLI on an OAuth
subscription — is handed a dictionary of what its body can do, what the world
does, and one sentence about what it is for. Whatever JavaScript it sends back
is the fighter's entire brain, run unmodified in a `node:vm` context at 15 Hz
when a tool runs it, and behind a hardened isolate that does not trust it when
a player can reach it. Nothing in this repo tells it how to fight.

```bash
npm install
node tools/seed.mjs                          # stock the ladder, measure the sparring pairs
npm run dev                                  # the game, with the dev account path open
npm test                                     # 30 invariants, then every gate in order

npm run viewer                               # the bare battle viewer, no product around it
node tools/brainforge.mjs --all --tag=mine   # ask Claude for two new minds (7 min, $0.84 a pair)
node tools/arena.mjs --rounds=200 --tag=mine # and measure them
```

The server prints its own URL and walks up from 8787 if that port is busy; the
bare viewer does the same.

---

## What it is trying to prove

That "the brain is written by an LLM" can be a real mechanism rather than a
label — that the minds come out *different from each other*, *reactive to an
opponent*, and *decisive of the outcome*. All three are measured rather than
asserted; see [docs/EXPERIMENT.md](docs/EXPERIMENT.md).

The fighters are asymmetric on purpose. The **octopus** is a ranged kiter with a
cast-time beam and a blink; the **gorilla** is a bruiser with a cone smash and a
committed charge. The interesting question is not who wins — it is whether a
model, told only what exists, discovers kiting, line-of-sight breaking, dodging
a telegraph, and baiting a cooldown. It does.

Balance here is stated as a **range**, not a number, and that is a finding
rather than a hedge: six generated brains are not a generator, and the same
constants have measured 29% and 92% on two draws from it. `node tools/bracket.mjs`
runs the two populations that bookend the shipped constants and checks they
still sit either side of even. Where the two ends sit *today* is printed by that
command and deliberately not copied onto this page; the pair above is the
historical measurement that made a range the honest form of the claim.

## The layout

```
src/core/      the world: config, geometry, navigation, the 30 Hz step, constants version
src/brain/     the prompt, the prelude, the claude lane, validation, the legacy vm host
src/skills/    the skill grammar: five closed axes, prices, the one legality rule
src/server/    the backend: sqlite, sessions, the six limits, the ladder, the arena
               loop, the live socket, the generation queue, simulation adaptation
src/server/sandbox/  A1's walls: static analysis, isolate, fuel, timeout
src/client/    the game: shell, screens, the shared kit, the self-hosted faces
src/viewer/    three.js WebGPU: the arena, the two bodies, the telegraphs, selective
               bloom, and body.html — a dev page that shows one creature's body
               from four angles
src/vfx/       ir.js: the closed grammar of model-authored decoration, and the
               canonicaliser that rebuilds every stored effect from known parts only
packages/      forge — the body instruction, compiled from TypeScript in memory
forge/         bodies written during lab runs, kept as evidence rather than as art
bodies/        gorilla.js, octopus.js — finished art, build(THREE, TSL)
brains/        one directory per generation; each .js has a .json beside it
tools/         arena · bake · balance · bench · bodyinstall · bracket · brainforge ·
               cablecheck · checkbehaviour · checkbody · checkboot · checkdocs ·
               checkforgebody · checkframing · checkgrammar · checkisolate ·
               checkkits · checkpose · checkprompt · checkscope · checkselectors ·
               checkstale · checktactics · falsify · fix-provenance · forge ·
               bodysize · checkbodyrace · checkcadence · checkcamera · checkcontrast ·
               checkfaults ·
               checkfacade · checkforge · checkgauntlet · checkladder ·
               checklayout · checkmodels · checkprices · checkscreens ·
               checkspec · checkstages · checkvfx ·
               gauntletfield · gauntletpick ·
               gauntlet ·
               kitbalance · lane-cli · loadtest · matchpool ·
               matchworker ·
               nanscan · orbrain · plan · report · retire · seed · seedlive ·
               seedforge · sizebalance · suite · test ·
               tournament · visibility          (runs/ — разовые прогоны)
docs/          shots/ (visual evidence) · EXPERIMENT.md (the results) · DECISIONS.md (what the spec left open,
               and why each was decided that way) · SCREENS.md (the screen build order) ·
               the look brief in `docs/` (what the founder asked of the look, and
               what it collided with)
```

## The pieces that carry the weight

**`src/core/config.js`** is the only place a gameplay number exists. The brain
prompt is *generated* from it, and `node tools/checkprompt.mjs` fails if any
disclosed constant is missing from the emitted text. A prompt that lies is worse
than no prompt: the model believes it, writes against it, and the creature dies
of the difference. Durations are the one thing the prompt rounds, and it rounds
them *towards* the world: the sim's clock only turns over on ticks, so a wind-up
declared at 0.28 s is served in 0.3 and 0.3 is what the model is told.

**`src/brain/prompt.js`** may contain exactly four kinds of line — a capability,
a constraint *with its reason*, a fact about the world, and the objective. No
tactics, no priorities, no "it is usually better to". The whole experiment is
whether a model handed a dictionary writes a fighter; a prompt that whispers the
answer measures nothing. `node tools/checktactics.mjs` puts every segment of the
rendered prompt to a model against those four categories, with planted tactics
and real lines mixed into each batch so that a judge which cannot tell them
apart fails the run instead of blessing it. Verdicts are committed, so the check
is free until the prompt changes.

**`src/core/nav.js`** exists because the first stub match ended with both
fighters pressed against a block for eighty-nine of ninety seconds. Walking
round a box is a motor skill, not a tactical one, so it lives in the body:
`api.move` is raw steering with no help at all, `api.moveTo` navigates.

**`src/brain/host.js`** is `node:vm` plus a per-thought timeout. It is a guard
against a crash, not against an attacker, and the file says so. Nothing a
player can reach runs through it any more.

**`src/server/sandbox/`** is what does. A1 asks for four walls and this is
them: static analysis on an acorn AST that refuses every write outside `mem`
and every name the brain was not given; a worker thread that loads the brain
as a module from a `data:` URL — not `eval`, not `new Function`, not
`node:vm`, each of which N11 names; fuel counted *in instructions*, so the
cut-off falls in the same place on a loaded machine as on an idle one; and a
timeout that kills the thread from outside rather than asking it to stop.

The whole match crosses the wall at once rather than one thought at a time. A
match is a pure function of its seed, so it can. Two things follow, and
`node tools/checkisolate.mjs` prints both rather than this page quoting them:
the isolate is *faster* than the `node:vm` path it replaced, and every match
log it produces is bit-identical to the one that path produced. The second is
what matters — A2 is an invariant, and a sandbox that changed outcomes would
have broken it while looking like a security improvement.

## Commands

| | |
|---|---|
| `npm test` | the gate list in `tools/suite.mjs`, in order; on failure it names the gate and prints the exact command to repeat it. Not every gate in the table below is in it, and the ones that are not say so in their own row: two need a browser with a visible window (`checklayout`, and the frame count), and `bracket` needs two populations copied into `brains/` first |
| `node tools/test.mjs` | 30 invariants — determinism, collision, sandbox, wire |
| `node tools/checkprompt.mjs` | the prompt and the config still agree — and it runs the tactics judge |
| `node tools/checkbehaviour.mjs` | the world does what the prompt says: every reach, cone and timing, measured |
| `node tools/checktactics.mjs` | every line of the prompt is a capability, a constraint with its reason, a fact or the objective |
| `node tools/checkdocs.mjs` | every tag, number, path, command and query parameter quoted on this page still exists. `--falsify` breaks this page twelve ways in memory and proves each one is caught |
| `node tools/brainforge.mjs --all --tag=x` | generate and validate two brains |
| `node tools/arena.mjs --rounds=200 --tag=x` | balance, execution and engagement metrics |
| `node tools/tournament.mjs --rounds=60` | every octopus against every gorilla |
| `node tools/bracket.mjs` | the balance claim: two populations either side of even. Exits non-zero if it breaks |
| `node tools/falsify.mjs` | program diversity + reactivity ablation + permutation test |
| `node tools/checkstale.mjs` | which populations were written against constants that have since moved |
| `node tools/checkframing.mjs` | replays seeded matches through the viewer's own camera solve, headless, and fails if a live fighter ever leaves the frame |
| `node tools/checkcamera.mjs` | framing proves a fighter is IN the shot, which is a different question from whether the shot is pleasant. A camera can hold both fighters perfectly and still lurch. This reads the same replay dump the framing gate produces and takes the second difference of the camera's own state — dolly, height, azimuth — because jerk is what the eye reads as a jolt. It judges the ninety-ninth percentile and prints the tail without judging it: the tail belongs to the game, not the camera, since a blink moves a fighter most of a shot-width in one tick and the eye has to answer in that same frame or lose him. It is what caught the azimuth having no speed limit at all |
| `node tools/checkcontrast.mjs` | "make it light" is not six numbers changed. The palette was chosen against a dark page, and secondary text that reads at seven to one on near-black becomes grey on pale grey — a break invisible in the screenshot of whoever made it, because the eye fills in text it already knows. So the pairs are checked against WCAG AA — the ordinary ratio for body text, the relaxed one for the large display type — with the tokens read out of `kit.css` rather than copied. The two fighter colours are also checked against each other, at the same ΔE threshold the skill elements already use |
| `node tools/checklayout.mjs` | the fight HUD is three absolutely positioned blocks — fighter cards pinned to the edges, clock and byline centred — and none of the three knows about the others, so "it fits" is a property of the window width rather than of the stylesheet. On a wide screen nothing overlaps, which is why nobody sees it on a work laptop; a step narrower the byline sat on a cooldown tile and the model id sat on the clock, both measured by comparing rectangles rather than by looking. This file carries the probe and the widths, and says plainly that it needs a real browser: the engine computes layout, and no amount of reading CSS can stand in for it |
| `node tools/checkisolate.mjs` | every escape attempt in the file, run against the sandbox, plus the controls: an honest brain and every reference brain in `brains/` must still pass — and the same match, run both ways, must produce the same log |
| `node tools/checkscope.mjs` | walks the player's real bundle from `index.html` and fails on a price, a purchase word, the word "токен", a bet, sound, or any path to a brain source |
| `node tools/loadtest.mjs` | an hour of arrivals, each on a fresh account so the per-account limits never help, must not breach the daily budget — and it prints what the same hour costs with the fuses removed |
| `node tools/seed.mjs` | stock the ladder from every population whose constants are current, and measure which (brain, side) pairs are weak enough to spar a newcomer |
| `node tools/kitbalance.mjs` | balance of the §8 kits, measured with **one hand-written brain on both sides** so the pilot cancels out and the numbers are about the kit. `--atoms` and `--deliveries` isolate one axis at a time |
| `node tools/checkprices.mjs` | the atom prices were assigned from a measured table of best cases, and that table lives as a comment beside them. The league that produced it is minutes of fights, so it cannot run on every commit — which left the prices held by nothing at all: change a number and the table beside it silently starts describing a different game. This does not re-measure. It binds the prose to the code in milliseconds: the same atoms on both sides, the price range as stated, and the correlation between price and measured strength no lower than claimed. Raise one atom's price without re-measuring and it goes red, and prints the command that re-measures |
| `node tools/checkboot.mjs` | F6's gate. The promise is a first frame in ten seconds; what this measures is the WEIGHT of the critical path — the bytes a browser must fetch and parse before it can draw — because weight is the part we control and the part one commit can ruin. Bodies, fonts and dev tools are excluded on purpose: none of them stands between the player and the first frame. `--list` shows what each file costs |
| `node tools/checkgrammar.mjs` | the §8 gate. Prototype keys are not part of the grammar; a skill whose price cannot be computed is refused rather than waved through; every legal skill in the grammar compiles to finite numbers; and after a match with every delivery, no solid in the world is missing its half-extents and no perception field is `undefined`. Both of the defects it was written for — `wall` writing `w`/`d` where the arena reads `hx`/`hz`, and `TRIGGERS['constructor']` making `costOf` return `NaN` — pass every other check in this table |
| `node tools/checkvfx.mjs` | the VFX level the spec picks is the only generated layer that runs in a **bystander's** browser — someone who opened a link to watch a fight that is not theirs. So this asserts three things and not whether it looks good: that no accepted decoration can touch the read-kit (checked by sweeping every field name the canonicaliser lets out, not by trusting that I remembered), that no accepted decoration can outspend the frame budget (three individually-legal layers must not add up past it), and that every legal combination of parts draws without throwing — the spec's "worst case is a boring effect, not a black screen", which is only provable by enumeration. It also plays a deliberately stale decoration, the kind the database can hold after the limits change, and asserts the viewer clamps it rather than trusting what it stored. `--falsify` breaks nine rules |
| `node tools/checkfaults.mjs` | whether a failed generation is the player's fault or ours is decided twice, in two files that did not know about each other: the pipeline chooses whether to blame the model, and the limiter chooses whether to spend one of the player's three daily attempts. One list said a provider error was ours; the other said it was the player's. So an exhausted billing account — the provider answering that it can afford four hundred tokens of a twenty-thousand-token prompt — burned real attempts while the waiting screen said the model had answered. This asserts that every code the pipeline calls ours is also free for the player, names the expensive ones one by one because deleting them looks like tidying, and checks the two lists were reconciled rather than merged |
| `node tools/checkbodyrace.mjs` | a fighter's body is loaded asynchronously for both sides at once, from one loop, with no await between them. The guard against a stale load was written per-viewer instead of per-side, so the second call's counter invalidated the first side's finished body and the left fighter silently kept whatever body was already on screen — the stock archetype. Nothing in the arena reports this: the fight is correct, the name is correct, only the shape is somebody else's, and no other gate ever runs two swaps at the same time. So this one does, and it asserts both halves of the bargain — that a shared counter loses a body and a per-side counter does not, that re-requesting the SAME side still lets the newest answer win, and that a build failure falls back to the archetype instead of leaving the previous opponent's body standing there |
| `node tools/checkcadence.mjs` | the two newest mechanics — fights on a five-second cooldown, and "whose fight is this" — live entirely in process memory: two maps on the scheduler and one on the broadcast layer. Nothing on disk to diff, nothing on screen to assert, and the first review wave found five confirmed defects in them, including the one that turned the founder's five seconds into twelve. So this asserts five statements with a stubbed clock and an in-memory database: that both fighters are held until the SHOW ends and free exactly one rest later, that a resting creature is not offered as an opponent (not just a fighting one), that a throw releases BOTH sides rather than stranding the opponent for a minute, that a live broadcast is always preferred over one that is merely lingering for late viewers, and that "yours" and "the one you follow" produce different fields for owner, guest-with-starter and anonymous. No network, no isolate, no fixtures |
| `node tools/checkgauntlet.mjs` | the gauntlet can declare itself broken, and for a while it did — while still answering the player on screen, because it was not in `npm test` and nothing stopped it. This runs the field against itself and asserts two things: that its members beat DIFFERENT opponents (all beating the same ones would make the shape meaningless), and that the baseline the "dominant" verdict is measured against still matches the field. Having a strongest member is not an error — a candidate has to be tested against someone, and with a planless reference brain the strongest strategy is sustain, which is a measured fact about the game. What is an error is a verdict that can never fire, and that is asserted too |
| `node tools/gauntlet.mjs` | balancing a kit against one reference opponent answers the wrong question: every fixed opponent has holes, so the number tells you how well the kit exploits THOSE holes. This runs a candidate against five deliberately different opponents — rush, kite, survive, deny, and a plain all-rounder — and reads the SHAPE rather than the mean. Beats all five: a dominant kit, and the thing to cut. Beats some and loses to others: a strategy with a counter, which is content, not a bug. Loses to all: weak, and the player should be told in a number. `--scan` searches random legal kits for dominant ones, because a free kit editor makes players a distributed search over the same space and the tool has to search too |
| `node tools/gauntletfield.mjs` | the same five opponents, measured on two different arenas side by side. The flattened one — identical bodies, one pilot, one cooldown for everybody — is how you measure atoms, because there everything except the atom is held still. The product one is where the verdict is actually used: octopus against gorilla, each with its own brain, cooldowns derived from price. A threshold calibrated on the first and applied to the second measures something other than what it promises, and this prints both so the gap is a number rather than an assumption |
| `node tools/gauntletpick.mjs` | the five opponents are not designed, they are found. The designed five read beautifully — rusher, kiter, turtle, controller, allround — and on the product field they collapsed into a pecking order: one beat everybody, one beat nobody, two distinct styles out of five. A candidate tested against a pecking order gets a place in a queue, and the whole point of a gauntlet is to get a shape instead. So random legal kits play each other on the field that matters, kits with the same win pattern collapse into one style, and the quintet with the most distinct styles wins — the one in use has a genuine cycle in it, which is what "no dominant strategy" looks like when it is a measurement rather than a hope |
| `node tools/seedforge.mjs` | the library is seeded from `brains/`, and every mind in there is written against the hardcoded skills — that is what makes it worth keeping (the tournament and the calibration are measured on it) and it is also its limit: such a creature does not know the names a generated kit uses, so it fights on the archetype set with a free jump on top. After the jump became a grammar delivery, a player's creature carries exactly three verbs and its library opponent carries four, one of them the very verb the founder asked to take away, and most of the live ladder was in that state. A flag cannot fix it: a mind handed kit names instead of `laser` is refused on every call and stands still. So the library needs its own grammar creatures, and only the same pipeline that makes players' creatures can make them. This adds, never deletes: the measured training pairs and the appendix calibration stand on the old library, and tearing it down for looks would trade a measurement for a picture |
| `node tools/sizebalance.mjs` | body size became a real axis — the model picks it, and it moves hp, collider radius, speed and mass — so the question is whether any size wins for free. Same shape as the atom league: one archetype, one brain, one kit on both sides, only the size differs, and equal sizes must draw before any number is printed. It caught the first guess immediately (the smallest size took nearly every fight) and it caught two bugs in the arena rather than in the exponents: navigation graphs were built for the archetype's base radius rather than the fighter's own, and the reference brain kept its distances in metres instead of in its own radii. What it cannot do is prove fairness to a point — it returns the same number for two different exponents, so the threshold is stated as bounded dominance, not equality, and the reason is written down |
| `node tools/retire.mjs` | the viability gate stops a creature that cannot land a hit from entering the library — but it was applied to arrivals only, and the ones already lying there kept turning up in the showcase, in the starter three a guest picks from, and as sparring partners. This measures every library creature against the same reference brain and retires the ones that land nothing. It found exactly two, both with zero wins across hundreds of real fights, and left alone a creature with zero wins in the probe that wins most of its real ones — it lands hits, so its kit is fine and its brain is the problem, which is a different diagnosis. Nothing is deleted: fights, rating and history stay, the creature just stops going out |
| `node tools/checkspec.mjs` | the spec is frozen, so its DECISIONS are not ours to touch — but the numbers DERIVED from those decisions go stale silently. Two had: the stated range of atom costs, which the measured prices had outgrown at both ends, and the count of instantly readable readings, a figure a decision had already corrected two decisions earlier without the correction reaching the spec. Both are load-bearing — they are the arithmetic behind picking VFX level one and the skill budget. Each claim is anchored to its SENTENCE and must match exactly once, so a reworded sentence fails as loudly as a stale number. Numbers with no source in the code — a provider's price per generation, say — are deliberately not checked, and that is written down so nobody later "fixes" them against an invented source |
| `node tools/checkstages.mjs` | the wait screen owns the longest minutes of a first session, and it matched the server's Russian stage label with its own regexes. One missed: the client looked for one word order, the server wrote another, so the rail slid **backwards** on the longest stage and sat there for minutes — the game telling the player things were going worse than they were, exactly where they decide whether to wait. Both strings are valid Russian; no test looked at either; you could only see it by sitting through a real generation. So the stage now travels as a code, and this asserts that every server stage has a step, that no step waits for a stage the server never sends, and that the rail only ever moves forward. `--falsify` replays the original mismatch |
| `node tools/checkladder.mjs` | on live data the correlation between rating and winning came out near zero-point-two, and that number admits two opposite readings: Elo is misconfigured, or the ladder is simply young. This settles it by giving forty creatures a known true strength and measuring how many fights the rating needs to recover their order. It also refuted the fix it was written to justify — picking an opponent at random inside a window scores the same as picking the nearest, so the slow convergence is the narrow spread of the generator, not the matchmaking. And it moved the guard on the K-factor off the correlation, which turns out to be insensitive to it, and onto the size of a single step, which is what F5 actually asks for. `--falsify` breaks both the blind control and the step |
| `node tools/checkselectors.mjs` | `h('div.t-body#author')` threw on every open of the tactics screen, because `h()` accepted an id only before the classes and nothing checked the other order. A selector is a string: it is not type-checked, not linted, and wrong only at the moment the screen opens. This walks every `h()` call in the client — nested template literals included — and fails on any selector the real parser cannot read. It also asserts the gate's own regex is byte-identical to the one in `dom.js`, so the check cannot drift away from the thing it checks |
| `node tools/checkscreens.mjs` | the suite was green on a day the create screen did not open at all. Removing the trigger axis took the declaration of `t` out of `kit.js` and left two reads of it behind, so `describe()` and `costLocal()` threw, and with them the kit screen, the creature card and `/new` — which is the only route to generation there is. Not one gate saw it, because not one gate ran client code: the hole was in the instruments, not the source. This resolves every identifier in `src/client` and `src/viewer` against its declarations, its imports and a deliberately short list of what the browser provides. It catches one class of fault — a name that is not there — and that is the class which took out the product path |
| `node tools/checkpose.mjs` | the body has to MOVE, not just build. `build()` is called once and its failure is obvious; `pose()` is called sixty times a second from the render loop, where a throw is swallowed on purpose so one bad body cannot flood a fight with exceptions. That silence is right in a fight and useless at acceptance — a creature that never moves looks exactly like one that does until you look. This looks: every body, every situation the `pose(s)` contract names, plus a check that the pose CHANGES something. It found two shipped bodies whose poses threw, one of them only when the creature was hurt or dying |
| `node tools/checkbody.mjs` | the body gate. A generated body is the only code a model writes that runs in a **stranger's** browser, so both halves are asserted: our two hand-written bodies still pass, and seventeen escapes — session theft by `fetch`, by `sendBeacon`, by image URL, `eval`, `new Function` through `constructor`, timers instead of `pose()` — are all stopped. It also checks that the browser's shadow list covers every name the analyser refuses |
| *(inside `checkbody`)* | the static-merge pass in `src/viewer/bake.js` has to be invisible, and that is what is asserted: same triangle count, and a floor placement that agrees to the last bit. It earned every one of those assertions. Merging by material alone made the gorilla's shadow-side parts vanish from the merge because her material reads a vertex attribute nobody else has; merging into one box per anchor made the creature hover above its own shadow, because one box grows under rotation where many small ones do not; and disposing the originals would have broken the two hundred and thirty-nine geometries she shares between meshes |
| `node tools/checkfacade.mjs` | the body never gets the `three` namespace — it gets a frozen facade of named members, because whoever holds an object holds everything reachable from it. This walks the whole reachable graph from that facade — properties, getters, prototypes, statics — hunting a path to `globalThis`, `document`, `fetch`, `process` or `Function`, and prints the path in full if it finds one. It exists so that adding a name to the list is a proved decision and not a hopeful one: `Bone`, `Skeleton`, `SkinnedMesh` and `Sprite` were added under it |
| `node tools/checkforge.mjs` | the instruction the model is given is TypeScript, bundled at the moment of the first generation and nowhere else, so a typo in it is invisible to the linter, invisible to the suite, and visible only to the player who pressed create. That is not hypothetical: one edited paragraph put a backtick inside a template literal, and body generation went from fifteen out of fifteen to nothing at all, on every model at once, with no gate noticing. This bundles the package the way the server does, and checks the instruction is still an instruction — and that every three.js name it promises is a name the facade actually hands over |
| `node tools/checkmodels.mjs` | the catalogue is built from OpenRouter's live price list, so "we never added that model" guarantees nothing: it arrives on its own, and it arrives expensive. One creature costs a cent or two on the two families the founder allows and up to two dollars and a quarter on the ones he does not — and that is the price of a generation that *works*; one that failed cost five dollars thirty-five. So the list is a whitelist, and this gate holds it, against a fabricated price list rather than the network, so it tests the rule instead of testing whether the machine is online |
| `node tools/bodysize.mjs` | *(instrument, not a gate — it reports and always exits zero)* how big a generated body actually comes out, and what it costs to draw. The viewer scales a body until its horizontal footprint IS the collision diameter, so the model's own metres mean nothing and the ratio of height to footprint means everything. This measures that ratio over every body in the database, and it is where the acceptance thresholds come from: a body is refused as a pancake below 0.12 and as a needle above 6 — deliberately outside anything measured, because a gate our own reference body fails is measuring itself. It also counts meshes and triangles, because every mesh is a draw call and two bodies are on screen at once: our own octopus is the yardstick the acceptance ceiling is set from, and the heaviest body in the database costs three times it |
| `node tools/checkkits.mjs` | every **stored** kit must still be legal under the current prices. Atom prices are a measurement, not a constant (see `kitbalance`), and raising one silently makes every creature that sat near the budget unplayable — the server recomputes the budget before a match (A3), so it would surface when a player pressed "fight". This names them beforehand, and deliberately cannot fix them: rewriting a player's kit is taking their choice away |
| `node tools/matchpool.mjs` | worker pool behind the balance leagues; `tools/matchworker.mjs` is the worker. A round-robin is far more fights than one process finishes while anyone is still waiting, and balance work that takes that long per iteration gets abandoned rather than done. The worker also holds the **symmetric arena** used only for measuring: same body and same brain on both sides, so the only difference left is the kit |
| `node tools/checkforgebody.mjs "<prompt>"` | the body path end to end, through the **product** code rather than the lab tool: the player's words go to the model with `packages/forge`'s instruction, the reply goes through A1-for-bodies, and what comes back is the pair the database stores — what the model wrote, and what a stranger's browser is allowed to run. `--dry` prints the call without making it |
| `node tools/seedlive.mjs` | stock the library through the **product** path — `forgeCreature`, so body and brain are generated exactly as a player's would be, and the result is marked library. `tools/seed.mjs` fills the library from `brains/`, which is right for a sparring partner and wrong for a shop window: the library is also what a guest is shown first, and creatures with a hand-written brain cannot show the one claim the product makes |
| `node tools/bodyinstall.mjs <creature> <file>` | put a body from a file on a creature — a dev tool for the five steps of the body path that generation does not cover: storage, the route, the shadowed build in the browser, the swap at the start of a fight, and the poses |
| `node tools/balance.mjs --samples=40 --rounds=10` | search the constants against the whole population |
| `node tools/bake.mjs --dry reports/balance-search.json` | show what a search winner would change in config.js |
| `node tools/bake.mjs reports/balance-search.json` | and write it. **This invalidates every shipped brain** — they were generated against the old numbers, and `checkstale` will say so afterwards |
| `node tools/fix-provenance.mjs --dry` | re-derive `resolvedModel` in every stored generation record |
| `node tools/report.mjs` | regenerate the measured half of docs/EXPERIMENT.md |
| `npm run dev` | **the stand — this is the one to run locally.** It sets `AIRENA_DEV`, which makes the server accept a local identity, so the account wall can be passed without the platform; the client learns this from `/api/session` and offers the dev login by itself, so the plain URL the server prints is enough and no query string is needed. It also sets `AIRENA_SUB_MODELS`, which adds the subscription bundles — they reach Opus and Fable through the local `claude` OAuth session instead of a billed key, and that is the only generation path that still works when the OpenRouter balance is empty |
| `npm run serve` | the same server WITHOUT the dev identity. It refuses to start unless the platform key is configured or `AIRENA_ALLOW_NO_IDENTITY` is set — deliberately, because a stand where nobody can pass the account wall measures a funnel that has no exit |
| `npm run viewer` | the viewer; it prints its URL |

## What is in `brains/`

| | |
|---|---|
| `u1` … `u6` | the shipping population — six independent generations per fighter, same prompt, same model. Each `.js` has a `.json` beside it recording model, effort, attempts, cost, time, and the entire constant table it was told about. It was generated *after* the constants were settled, so `node tools/checkstale.mjs` should report it `current`. |
| `stub` | two hand-written reference brains. Not generated; used as a sparring partner in the validation ladder and as a control in the metrics. |
| `probe-*` | 11 hand-written **degeneracy probes** — deliberate attempts to find a boring winning line, plus one-sided diagnostics written during review to isolate one skill. 4 of them are complete pairs and appear in the viewer's dropdown; the other 7 carry one fighter only and are run against a shipped brain or the stub, which is why the server filters them out — a half-populated tag is a fight that fails to start for a reason the viewer cannot explain. All are excluded from population averages on purpose. |
| `reports/brains-h`, `reports/brains-i` | the two populations that bracket the shipped constants — one an unusually strong set of kiters, one ordinary. Copy either into `brains/` and run the tournament to see the range for yourself; the balance claim in [docs/EXPERIMENT.md](docs/EXPERIMENT.md) depends on you being able to. |
| `reports/archive/brains-*` | earlier populations from before the final rules. `node tools/checkstale.mjs` prints which constants have moved under each. |

## Watching

Click either fighter's name to read the program that model wrote. Red ground is
a wind-up you can still dodge; the thin bright line is where the beam will
leave, trimmed where a block stops it; a white shell is invulnerability. Each
fighter carries its own health bar and, while it is casting, a cast bar over its
head, so the fight can be read without looking at the corners. Cover between the
camera and a fighter fades to a wireframe and the hidden body is drawn as a flat
coloured silhouette, so neither creature is ever simply gone.
From 30 seconds the arena starts burning both fighters, so nothing ends on a
clock.

Space fights, `c` cycles the camera, and the two dropdowns pick which brains
fight. A match is a pure function of `(seed, octopus brain, gorilla brain)`, so
typing a seed replays a fight exactly — the seed of whatever you are watching is
printed under the clock, and `?seed=123456` opens straight into it. `?webgl=1`
takes the WebGL2 path instead of WebGPU. `?shots=1&n=12&oct=u1&gor=u2` writes a
match between two named tags to `reports/screens/` as PNGs; `oct` and `gor` are
read in that capture mode only, because everywhere else the dropdowns own the
choice.

---

*Every tag, number, path, command and query parameter on this page is asserted
against the live repository by `node tools/checkdocs.mjs`, which `npm test`
runs. A number here that has no source is a failure, not a typo waiting to be
found — and `node tools/checkdocs.mjs --falsify` shows that claim being earned,
by breaking this page twelve ways and catching all twelve.*
