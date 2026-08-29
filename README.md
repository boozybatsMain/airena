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
npm test                                     # 30 invariants, then five agreements

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
src/viewer/    three.js WebGPU: the arena, the two bodies, the telegraphs
bodies/        gorilla.js, octopus.js — finished art, build(THREE, TSL)
brains/        one directory per generation; each .js has a .json beside it
tools/         arena · bake · balance · bench · bracket · brainforge · cablecheck ·
               checkbehaviour · checkdocs · checkframing · checkisolate · checkprompt ·
               checkscope · checkstale · checktactics · falsify · fix-provenance ·
               forge · lane-cli · loadtest · nanscan · orbrain · plan · report ·
               seed · test · tournament · visibility
docs/          EXPERIMENT.md (the results) · DECISIONS.md (what the spec left open,
               and why each was decided that way) · SCREENS.md (the screen build order)
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
| `node tools/checkisolate.mjs` | every escape attempt in the file, run against the sandbox, plus the controls: an honest brain and every reference brain in `brains/` must still pass — and the same match, run both ways, must produce the same log |
| `node tools/checkscope.mjs` | walks the player's real bundle from `index.html` and fails on a price, a purchase word, the word "токен", a bet, sound, or any path to a brain source |
| `node tools/loadtest.mjs` | an hour of arrivals, each on a fresh account so the per-account limits never help, must not breach the daily budget — and it prints what the same hour costs with the fuses removed |
| `node tools/seed.mjs` | stock the ladder from every population whose constants are current, and measure which (brain, side) pairs are weak enough to spar a newcomer |
| `node tools/balance.mjs --samples=40 --rounds=10` | search the constants against the whole population |
| `node tools/bake.mjs --dry reports/balance-search.json` | show what a search winner would change in config.js |
| `node tools/bake.mjs reports/balance-search.json` | and write it. **This invalidates every shipped brain** — they were generated against the old numbers, and `checkstale` will say so afterwards |
| `node tools/fix-provenance.mjs --dry` | re-derive `resolvedModel` in every stored generation record |
| `node tools/report.mjs` | regenerate the measured half of docs/EXPERIMENT.md |
| `npm run serve` | the viewer; it prints its URL |

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
