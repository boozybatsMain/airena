> **How to read this document.**
>
> This is not the code's specification — it is a *review artefact*. It was produced part-way
> through the project by a nine-agent design panel that read the repo as it stood, measured it,
> and argued with itself; the numbered "critique dispositions" in §0.2 are that argument's
> record. Several of its findings were real defects and were fixed (the dash reporting zero
> velocity, the buried corpse, the shared order/query budget, the frozen death animation); a few
> of its claims were wrong and are marked as such in its own table.
>
> **It has not been updated since.** Every constant in it predates the final balance search, so
> where it disagrees with `src/core/config.js`, the config is right and this is history. It is
> kept because the reasoning is worth more than the numbers, and because a document that shows
> what was believed at the time is the only honest way to show what changed.

---

I have complete ground truth. Writing the spec.

---

# Airena — THE SPEC

**Status:** contract document. Supersedes the four area designs and their critiques.
**Substrate:** the existing repo at `/Users/boozybats/Public/Repos/work/Airena`, pinned at config fingerprint `05f9dffd03bd1693`.
**Verification:** every claim below marked *(measured)* was executed against that repo during this synthesis. Claims marked *(derived)* follow from code by construction.

---

## 0. Preamble: what the four designs got wrong, and the two rules that resolve them

### 0.1 The governing fact

**Airena is not greenfield.** The repo contains a running simulator (`src/core/`, 1 700 lines), a sandbox host, a generated prompt, a headless runner with engagement metrics, a WebGPU viewer, a `claude -p` lane, hand-written stub brains, and one completed generation (`brains/v1/`). *(measured: 5 836 lines across 21 source files; `node tools/arena.mjs --rounds=200` completes in 6.4 s.)*

The **mechanics** and **viewer** designs were written as if only `bodies/*.js` existed. Every constant, wire-format field, arena layout and skill timing they propose is therefore fiction — not wrong reasoning, but reasoning applied to a world that does not exist. The **api** and **prompt** critiques caught this; their own designs made the same error in the other direction.

**Resolution rule #1 — the substrate wins.** `src/core/config.js` is the single runtime authority for every gameplay number. This document's constants table (§2) is a snapshot of it plus the constants this spec *adds*. Where a design proposed a different number, the design is discarded and only its *reasoning* is harvested. Where a design proposed a different *mechanism*, §0.3 adjudicates.

**Resolution rule #2 — measured beats argued.** Four of the six load-bearing disputes were settled by running the code, not by reading the arguments. Those settlements are binding.

### 0.2 Critique dispositions

Only findings that changed the spec are listed. "Wrong" findings get one line, as required.

| # | Finding | Disposition |
|---|---|---|
| mech‑1 | Gorilla dominance makes kiting unreachable | **Take (direction), reject (numbers).** *(measured)* gorilla won 85–100 % of every pairing under the pre‑existing config; the arithmetic was about a fictional config. See §9.2. |
| mech‑2 | Single baked `yOffset` buries corpses | **Take.** *(measured)* gorilla `die@phase 1` reaches min.y **−1.674 m** post‑scale against a rest‑measured lift of −0.014 m. §8.5. |
| mech‑3 | "Longest free lane is 11 m" is false | **Take.** *(measured)* longest obstacle‑free lane in the *real* arena is **47.3 m** with octopus clearance — longer than the arena is wide. Geometry is not a stalemate defence. §10.3. |
| mech‑5 | Assertion set unsatisfiable given resolution order | **Take.** §3.7 states only invariants the order can guarantee, and assertions log rather than abort. |
| mech‑6 | Fault handler injects tactics | **Take.** No fallback AI, ever. §5.7. |
| mech‑9 | Charge whiff has no cost | **Take (diagnosis), reject (fix).** *(measured)* charge fails **106/125 times by wall contact**, and a `minRange` gate made the fight *worse* (v1 octopus 5 %→0 %, melee uptime 57 %→68 %) because the gorilla simply walks in and smashes. §4.5. |
| mech‑15 | `node:vm` timeout cannot be enforced | **Wrong for this repo** — `host.js` re‑enters via `script.runInContext(ctx,{timeout})`; *(measured)* a `while(true)` brain faults after **27 ms** and the match survives. |
| api‑1/2 | Design's `p.rules` table is a second source of truth with fight‑breaking numbers | **Take.** Table deleted; `p.rules` is defined in §5.2 as a *projection* of `config.js`. |
| api‑3 | Banning pathfinding causes an 89/90‑s stalemate | **Take.** `nav.js` stays. Walking round a box is a motor skill. §5.3. |
| api‑4/5 | Yaw convention and `V.perp` handedness | **Take.** One convention, stated once (§3.2); `V.perp` documented as "a quarter turn", never as a named side. |
| api‑8 | Order budget silently corrupts *perception* verbs | **Take.** Split budgets, §5.3. |
| api‑9 | `p.timeLeft` and the hp‑fraction tiebreak must be disclosed | **Take.** Already in `perceive()`; §6 makes the prompt state the tiebreak. |
| api‑10 | R1 "spectator parity" is violated by the design's own next section | **Take.** R1 deleted. §5.1 keeps the workable rule. |
| api‑11 | Cutting `jump` removes real content | **Take.** *(measured)* the v1 octopus jump‑dodges **3.4 smashes per match** — an emergent discovery, and the best evidence in the project that the brains think. |
| api‑14 | Split arbitration (`use` first‑wins, `move` last‑wins) is unguessable | **Take.** Last‑wins uniformly. §5.3. |
| prompt‑2 | `vm` context leaves `Date`/`Math.random`/`eval` live | **Wrong for this repo** — *(measured)* `Date` is `undefined`, `Math.random` throws, `eval`/`Function` raise `EvalError`; the critique probed a bare context, not `host.js`. |
| prompt‑3 | Per‑tick timeout unenforceable | **Wrong** — same measurement as mech‑15. |
| prompt‑11 | Degenerate control matchup invalidates metric 8 | **Take.** Balance the *control* pair before interpreting any brain metric. §9.2. |
| prompt‑12 | n = 20 sits below its own noise floor | **Take.** n ≥ 200 for any win‑rate claim (SE 3.5 %). §9.1. |
| prompt‑13 | Prompt RULE 2 lies about top‑level state | **Take.** *(measured)* `let counter=0` outside `think` persists and increments across ticks with **no fault raised**. RULE 2 rewritten, §6.3. |
| prompt‑19 | L6 "must use both skills" is a tactic | **Take.** Never gate on skill usage. §7.3. |
| prompt‑25 | Documented‑but‑dead config fields | **Take.** *(measured)* `SEPARATION_STIFFNESS`, `IDLE_SPEED`, `bodyLength`, `role`, `SKILLS[*].pose`, `SKILLS[*].blurb`, `SKILLS[*].aimAtStrike` have **zero** non‑config references. §2.9. |
| view‑1/12 | Viewer hardcodes stale skill/arena numbers | **Wrong for the shipped viewer** — it already reads `/api/config` and draws `cfg.arena.obstacles` verbatim. |
| view‑5 | Death animation never streamed | **Already fixed in‑repo** during this synthesis (`curtainSeconds: 2.6`). Spec keeps it, §8.7. |
| view‑9 | `snapshot.v` is unusable for interpolation | **Take, and escalated.** *(measured)* during the dash the snapshot reports **|v| = 0.000 while the body moves at 15.0 m/s**. This breaks the viewer *and* perception. §3.4, §8.4. |
| view‑16 | `posedNodes` count is wrong | **Take.** Never hardcode the set; discover it at load. §8.6. |
| view‑17 | `OMEGA_REF` disconnected from turn rate | **Already correct in the shipped viewer** (it divides by `cfg.fighters[id].turnRate`). |
| view‑19 | Camera orbits continuously during a kite | **Take.** §8.8 adds an azimuth anchor. |

### 0.3 The four genuine cross‑area contradictions, resolved

**C1 — Tick and think rate.** Mechanics: 30/6 Hz. API: 20/10 Hz. Repo: **30/15 Hz**.
*Resolved: 30/15.* The mechanics case for 6 Hz is that LLM brains flip‑flop on hard thresholds — but its own text concedes "smoothness does not come from the think rate; it comes from the acceleration limit", and the repo has acceleration limits (22–26 m/s²). 15 Hz is free: *(measured)* median think cost **48–136 µs** against a 25 ms budget, i.e. 0.2–0.5 % of budget. *(The ceiling is now `THINK_TIMEOUT_MS = 60`; the headroom argument only got stronger.)* Halving the rate would only halve the reaction quality of every brain for no gain.

**C2 — Obstacle primitive.** API: cylinders ("local steering never wedges"). Repo: **axis‑aligned boxes**.
*Resolved: boxes.* `geom.js` (`segBox`/`pushOutOfBox`) and `nav.js` (a visibility graph over *box corners*) are built on them end‑to‑end; cylinders would discard both. The wedging the cylinder proposal solves is already solved better by the navigator, and *(measured)* the layout's 180° rotational symmetry — the only fairness property that matters — holds exactly.

**C3 — Interrupts.** API design: *any* damage interrupts a cast, on the argument that this "creates the entire kiting incentive". Repo: **only a charge impact interrupts**.
*Resolved: charge‑only.* The api critique measured the universal rule producing a melee lock (octopus output → 0, win rate 0/200). Charge‑only interrupt is the telegraphed, counterable version: it has a 0.34 s wind‑up the target can see in `p.events` and a commit event when the direction locks. A rule whose effect is "the losing fighter stops being able to act" is a degenerate equilibrium, not an incentive.

**C4 — Who owns balance.** Mechanics proposes a hand‑driven knob table; the repo has a scoring search (`tools/balance.mjs`) that optimises fairness + pacing + shape + decisiveness simultaneously against **two** brain pairs.
*Resolved: the search owns balance, the stubs are the control.* §9.2 gives the measured justification, which is decisive: the generated brains hard‑code numbers from their own prompt, so tuning against them tunes the constants to compensate for two particular programs.

---

## 1. Overview and file layout

Airena runs one 1v1 match between an **octopus** (ranged: `laser`, `blink`) and a **gorilla** (melee: `smash`, `charge`); both also have `jump`. Both minds are JavaScript written by `claude -p` from a prompt generated out of the constants table, executed in `node:vm`. A match is reproducible from `(seed, brainOctopus, brainGorilla)`.

```
config.js ──► prompt.js ──► claude -p ──► validate.js ──► brains/<tag>/*.js
     │                                                          │
     └──► sim.js ◄── host.js (node:vm) ◄───────────────────────┘
              │
              ├──► tools/arena.mjs   (headless, N rounds, metrics)
              ├──► tools/balance.mjs (search over config, scored)
              └──► server/index.js ──ws──► viewer/main.js (WebGPU)
```

| Path | Role | Status |
|---|---|---|
| `bodies/{gorilla,octopus}.js` | art assets, `build(THREE,TSL)→Object3D` with `userData.pose(s)` | frozen, never edited |
| `src/core/config.js` | **the only home of a gameplay constant**; tuning overlay | exists; §2.9 removes dead fields |
| `src/core/geom.js` | XZ primitives: `segBox`, `segCircle`, `pushOutOfBox`, `inCone`, heading | exists, unchanged |
| `src/core/nav.js` | visibility graph + string‑pulled steering, one per body radius | exists, unchanged |
| `src/core/rng.js` | `mulberry32` + `streamFrom(seed, name)` named streams | exists, unchanged |
| `src/core/sim.js` | world, tick, skills, perception, api | exists; §3.4 + §4.5 changes |
| `src/core/match.js` | one fight, shared by runner/validator/server | exists, unchanged |
| `src/brain/host.js` | `node:vm` compile + timed tick + `extractSource` | exists, unchanged |
| `src/brain/prompt.js` | generated instruction | exists; §6 changes |
| `src/brain/validate.js` | the acceptance ladder | exists; §7.3 changes |
| `src/brain/claude.js` | `claude -p` subprocess | exists, unchanged |
| `src/server/index.js` | static + `/api/config` + `/ws` | exists; §8.2 adds one mount, §8.3 one field |
| `src/viewer/main.js` | WebGPU viewer + sim→pose bridge | exists; §8 rewrites the bridge |
| `tools/arena.mjs` | headless runner, balance + execution + engagement metrics | exists; §9.3 adds fields |
| `tools/balance.mjs` | scored search over the constant space | exists, unchanged |
| `tools/brainforge.mjs` | generation lane + provenance `.json` | exists; §7.4 adds the staleness gate |
| `tools/checkprompt.mjs` | asserts no numeral in the prompt is absent from config | exists. *(That description was true of the version this spec read and is the exact failure the tool later documented: searching a document for a numeral proves nothing. It now renders through a tagged emitter and checks both directions, and it runs `checktactics` and `checkdocs` behind itself.)* |
| `brains/stub/*.js` | hand‑written control pair | exists; **never edited during tuning** |
| `brains/<tag>/*.js + .json` | generated brains + provenance | `v1` exists but is **stale** (§7.4) |

---

## 2. Constants

Every number in Airena appears exactly once, here. `src/core/config.js` is the runtime authority; this table is its contract. Values are pinned at fingerprint `05f9dffd03bd1693`. Rows marked **NEW** are constants this spec promotes out of magic literals; rows marked **DELETE** are dead and must be removed.

### 2.1 Time and sandbox

| Name | Value | Unit | Why |
|---|---|---|---|
| `TICK_HZ` | 30 | Hz | A 15 m/s dash moves 0.50 m/tick here and 1.00 m at 15 Hz; 1 m is enough to step over a body. |
| `DT` | 1/30 | s | Derived from `TICK_HZ`. |
| `THINK_EVERY` | 2 | ticks | 67 ms of reaction latency is already faster than a person. |
| `THINK_HZ` | 15 | Hz | Derived. *(measured)* costs 48–136 µs/think — 0.5 % of budget. |
| `MATCH_SECONDS` | 90 | s | Cap. *(measured)* 0.0 % of matches reach it. |
| `CURTAIN_SECONDS` | 2.6 | s | World keeps stepping after the result so the 3 s `die` pose actually plays. Headless passes 0. |
| `THINK_TIMEOUT_MS` | 25 | ms | *(measured)* an infinite loop faults at 27 ms and the match continues. |
| `COMPILE_TIMEOUT_MS` | 2000 | ms | Happens once. |
| `FAULT_LIMIT` | 25 | consecutive faults | Then the mind is switched off; the body coasts. Bounded and loud. |
| `MAX_ORDERS_PER_THINK` | 16 | order calls | **CHANGED** from 64‑for‑everything. Only mutating verbs count. |
| `MAX_QUERIES_PER_THINK` | 512 | query calls | **NEW.** *(measured)* the v1 octopus issues **27.9 `ray` calls per think**; under a shared 64‑cap its senses would start returning falsehoods. |
| `SAY_MAX_CHARS` | 90 | characters | Ticker width. |
| `SAY_SECONDS` | 3.0 | s | Minimum dwell of one line. |
| `MEM_MAX_KEYS` | 48 | keys | |
| `MEM_MAX_VALUE_BYTES` | 4096 | bytes | One value, JSON‑encoded. |
| `EVENT_CAP` | 32 | events/think | **NEW** (was a literal). A brain can silently lose events past this; it must be disclosed. |
| `LOG_LIMIT` | 200 | lines/match | `console.log` capture. |

### 2.2 Arena

| Name | Value | Unit | Why |
|---|---|---|---|
| `ARENA_HALF` | 20 | m | 40×40. Spawn separation 31 m exceeds laser range, so the match opens with an approach. |
| `WALL_HEIGHT` | 4 | m | Visual only; LOS is 2‑D. |
| `SPAWN_RADIUS` | 15.5 | m | Spawns are diametric, at a seed‑drawn angle, rotated until both ends are clear. |
| `OBSTACLE_HEIGHT` | 3.2 | m | All six. Visual only; taller than both bodies so a 2‑D LOS rule looks honest. |
| `OBSTACLES` | see below | m | Six axis‑aligned boxes, `{x, z, hx, hz}`. |

```
a (−7.0, −3.0) hx 1.2 hz 3.5      d ( 0.0,  10.0) hx 3.6 hz 1.2
b ( 7.0,  3.0) hx 1.2 hz 3.5      e (−12.5, 11.0) hx 1.6 hz 1.6
c ( 0.0, −10.0) hx 3.6 hz 1.2     f ( 12.5, −11.0) hx 1.6 hz 1.6
```

*(measured)* The set is exactly 180°‑rotationally symmetric about the origin — every block maps onto another and the two spawns map onto each other. Coverage 88.6 m² = **5.54 %**. Random‑pair LOS is broken **55.0 %** of the time.

### 2.3 Shared physics

| Name | Value | Unit | Why |
|---|---|---|---|
| `BEAM_RADIUS` | 0.4 | m | A zero‑width ray on a 1 m body at 20 m subtends 2.9°; a miss then reads as a broken weapon, not bad positioning. |
| `BRAKE_ACCEL` | 30 | m/s² | Coast‑to‑rest when no order stands. Higher than either `accel` so stopping is decisive. |
| `KNOCKBACK_DRAG` | 9 | m/s² | A 6 m/s charge impulse resolves in 0.67 s — long enough to read as a shove. |
| `KNOCKBACK_MIN` | 0.4 | m/s | Below this the impulse is dropped, so it cannot dribble forever. |
| `SMASH_AIRBORNE_MAX` | 0.35 | m | **NEW** (was a literal). A body above this when the cone lands takes nothing. This is the jump‑dodge and it must be disclosed. |
| `BEAM_ORIGIN_OFFSET` | 0.20 | m | **NEW.** Beam starts at `radius + this` so it never originates inside the shooter. |
| `BLINK_STEP` | 0.25 | m | **NEW.** Destination walks back toward origin in these steps until clear. |
| `BLINK_CLEARANCE` | 0.05 | m | **NEW.** Slack against a box face and the arena edge. |
| `BLINK_VELOCITY_KEEP` | 0.30 | fraction | **NEW.** Velocity retained through a teleport, so arrival is not a full‑speed slide. |
| `AIRBORNE_EPSILON` | 0.01 | m | **NEW.** `y` above which a body counts as off the ground. |
| `ARRIVE_RADIUS` | 0.35 | m | **NEW.** A `moveTo` order clears within this of its point. |
| `RAY_DEFAULT` | 30 | m | **NEW.** `api.ray` default length. |
| `RAY_MAX` | 60 | m | **NEW.** Cap; exceeds the 56.6 m diagonal. |
| `NAV_CORNER_PAD` | 0.35 | m | **NEW.** How far outside a box its graph corners sit. |
| `NAV_SIGHT_PAD` | 0.15 | m | **NEW.** Box inflation when testing a path segment. |
| `NAV_FREE_PAD` | 0.22 | m | **NEW.** Start/goal nudged out to here first. |

### 2.4 Fighters

| Field | Octopus | Gorilla | Unit | Why |
|---|---|---|---|---|
| `hp` | 140 | 220 | hit points | Asymmetric pools; the ratio is a balance output, not an argument. |
| `radius` | 1.00 | 1.25 | m | Collision cylinder. Gameplay number — **not** the render silhouette (§8.3). |
| `maxSpeed` | 4.9 | 5.2 | m/s | The gorilla is faster by 0.3 m/s. Near‑parity plus a gap‑closer is how the genre makes a chase a chase. |
| `accel` | 26 | 22 | m/s² | The octopus changes direction faster; the gorilla carries momentum. This is what launders 15 Hz decisions into continuous motion. |
| `turnRate` | 6.0 | 4.0 | rad/s | The octopus out‑turns the gorilla 1.5×; circling functions without one word of advice. |
| `mass` | 1.0 | 2.2 | ratio | Heavier body yields less on contact. The gorilla shoulders the octopus around. |
| `jumpHeight` | 1.5 | 1.3 | m | Apex of the hop arc. |
| `skills` | `laser, blink` | `smash, charge` | — | Plus `jump` for both, from `skillsOf()`. |

### 2.5 Skills

| Field | `laser` | `blink` | `smash` | `charge` | `jump` | Unit |
|---|---|---|---|---|---|---|
| `owner` | octopus | octopus | gorilla | gorilla | both | — |
| `windup` | 0.55 | 0.0 | 0.28 | 0.34 | 0.10 | s |
| `airborne` | — | — | — | — | 0.55 | s |
| `dashSeconds` | — | — | — | 0.80 | — | s |
| `recover` | 0.10 | 0.18 | 0.28 | 0.35 | 0.16 | s |
| `cooldown` | 2.0 | 3.5 | 1.1 | 4.5 | 1.6 | s |
| `damage` | 27 | — | 30 | 34 | — | hp |
| `range` | 24 | — | 2.5 | — | — | m |
| `distance` | — | 7.5 | — | — | — | m |
| `dashSpeed` | — | — | — | 15 | — | m/s |
| `halfAngle` | — | — | 0.96 | — | — | rad (55°) |
| `knockback` | — | — | 2.0 | 6.0 | — | m/s |
| `stun` | — | — | — | 0.40 | — | s |
| `iframes` | — | 0.28 | — | — | — | s |
| `moveScale` | 0.30 | 1.0 | 0.30 | 0.20 | 0.35 | × top speed |
| `turnScale` | 0.55 | 1.0 | 0.55 | 0.85 | 0.35 | × turn rate |
| `interruptible` | true | false | true | false | false | — |

Why the shape: every skill is a state machine of `windup` (committed, telegraphed, nothing has happened) → strike → `recover` (committed, effect spent). Every one is telegraphed because **the counterplay is the spectacle** — a hit with no wind-up is arbitrary, not exciting.

> *(Annotation, added later. Beyond the values having moved: no duration in this table is the one a
> fighter experiences. `stepAct` advances a phase clock one tick at a time and ends the phase on the
> first tick at or past its length, carrying the overshoot into the phase after it, and cooldown,
> `iframes` and `stun` count down one tick per step until they cross zero. At 30 Hz that makes a
> declared 0.28 s wind-up 0.3 s of wind-up and — because of the carry — a declared 0.28 s recovery
> 0.267 s of recovery; measured against config as of this annotation, twelve of the eighteen
> disclosed timings differ from their declared value. The brain prompt now emits the served figure
> rather than the declared one, and `tools/checkbehaviour.mjs` measures each of them. Read this table
> as the designer's knobs, not as the clock.)*

### 2.6 Viewer and pose bridge

| Name | Octopus | Gorilla | Unit | Why |
|---|---|---|---|---|
| `WORLD_SCALE` | 0.88 | 1.45 | ratio | **NEW.** Chosen for silhouette parity (1.95 m / 1.97 m tall). *(measured)* the shipped rule — scale footprint to collision diameter — produces a **1.01 m octopus beside a 1.83 m gorilla**, because the octopus's footprint is arm‑span (3.94 raw units) while its collider describes its mantle. |
| `GAIT_LENGTH` | 1.35 | 1.45 | m | **NEW.** Divisor turning m/s into body‑lengths/s. *(measured)* the shipped rule uses the scaled AABB, giving the gorilla a ceiling of **2.45 bl/s** — below its own gallop onset of 2.6, so it *never* reaches its gallop or sprint animation. These values put top speed at 3.63 / 3.59 bl/s and a charge at the clamp. |
| `STRIDE_BASE` | 0.336 | 0.404 | m/cycle | **NEW, provisional.** Metres of travel per gait cycle at `speed`=0. Set by the calibration test in §8.5. |
| `STRIDE_SLOPE` | −0.086 | +0.070 | m/cycle per bl/s | **NEW, provisional.** Octopus sweep shortens with speed (the wave tightens before lift‑off); gorilla's lengthens. |
| `STRIDE_FLOOR` | 0.192 | — | m/cycle | **NEW.** Lower clamp on the octopus fit. |
| `CADENCE_MAX` | 5.0 | 7.0 | Hz | **NEW.** Ceiling on gait frequency; above it, contact slip is accepted rather than strobing. |
| `SPEED_CLAMP` | 6 | 6 | bl/s | Both bodies' top band. The octopus does **not** clamp internally — the bridge must. |

| Name | Value | Unit | Why |
|---|---|---|---|
| `SNAP_DELAY` | 2 | ticks (0.0667 s) | One tick to guarantee a future snapshot exists, one for jitter. |
| `TURN_TAU` | 0.12 | s | Low‑pass on rendered yaw rate. Shorter flickers the lean; longer banks after the turn. |
| `SPEED_TAU` | 0.10 | s | Low‑pass on gait speed, so a knockback step does not pop the band. |
| `BLEND_SECONDS` | 0.12 | s | Pose crossfade; 0.05 into `hit`, 0.20 into `die`. |
| `HIT_POSE_SECONDS` | 0.34 | s | Minimum on‑screen flinch, so burst damage cannot flicker. |
| `GROUND_BINS` | 16 | phase bins | Resolution of the per‑action ground‑clamp table. |

### 2.7 Generation lane

| Name | Value | Unit | Why |
|---|---|---|---|
| `MODEL` | `opus` | alias | Alias not a snapshot; this lane cannot promise one. |
| `EFFORT` | `high` | — | Always passed explicitly so the provenance stamp is true by construction, never inherited. |
| `CLAUDE_TIMEOUT_MS` | 900 000 | ms | Backstop above every orchestrator budget, so the layer that fired is identifiable. |
| `REPAIRS` | 2 | turns | Hard cap. |
| `VALIDATE_SEEDS` | `[11, 22]` | — | Two full matches vs the opposite stub. |
| `FAULT_RATE_GATE` | 0.02 | fraction of thinks | Above this, reject. |
| `MOVED_GATE` | 3 | m over two matches | Below this, the body is not being driven. |
| `THINK_MICROS_GATE` | 4000 | µs mean | 16 % of the 25 ms ceiling of the day; the ceiling is now 60 ms. |

### 2.8 Derived quantities

Computed, never typed. Listed so §6's generator can emit them and §9 can assert them.

| Quantity | Formula | Value |
|---|---|---|
| Spawn separation | `2 · SPAWN_RADIUS` | 31.0 m |
| Arena diagonal | `2·ARENA_HALF·√2` | 56.6 m |
| Smash reach, centre‑to‑centre | `smash.range + attacker.radius + target.radius` | **4.75 m** |
| Smash effective half‑angle at reach | `halfAngle + asin(target.radius / d)` | 55° + 12.2° = 67.2° |
| Charge travel | `dashSpeed · dashSeconds` | 12.0 m |
| Laser max hit distance | `radius + BEAM_ORIGIN_OFFSET + range + target.radius + BEAM_RADIUS` | 26.85 m |
| Octopus 0→top speed | `maxSpeed / accel` | 0.188 s |
| Gorilla 0→top speed | `maxSpeed / accel` | 0.236 s |
| Octopus half‑turn | `π / turnRate` | 0.524 s |
| Gorilla half‑turn | `π / turnRate` | 0.785 s |
| Skill total committed time | `windup + airborne + dashSeconds + recover` | laser 0.65, blink 0.18, smash 0.56, charge 1.49, jump 0.81 s |

**The balance identity** — the one number the whole matchup rests on, stated so it can be re‑derived rather than guessed:

```
netClosingRate = (gorilla.maxSpeed − octopus.maxSpeed)          =  +0.30 m/s
               − (blink.distance / blink.cooldown)              =  −2.14 m/s
               + (laser.windup · (1−laser.moveScale) · octopus.maxSpeed) / laser.cooldown
                                                                =  +0.94 m/s
               = −0.90 m/s      (negative ⇒ the octopus gains ground)
```

*(measured)* consistent with mean gap 10.0 m and melee uptime 25.5 % on the control pair.

### 2.9 Constants to delete

*(measured: zero non‑config references each.)* `SEPARATION_STIFFNESS` (collision is positional mass‑weighted separation, not a spring), `IDLE_SPEED`, `FIGHTERS[*].bodyLength` (the viewer measures its own; §2.6 replaces it with `GAIT_LENGTH`), `FIGHTERS[*].role`, `SKILLS[*].pose` (the viewer switches on skill id; `charge.pose:'move-6'` names a clip **no body implements**), `SKILLS[*].blurb`, `SKILLS[*].aimAtStrike` (behaviour is hardcoded in `resolveStrike`).

`SKILLS[*].needsLos` is **kept but demoted**: it is read only by `tools/arena.mjs` for the `losDiscipline` metric and gates nothing in the sim. It must be commented as such, and §6 must not describe it as a precondition.

---

## 3. Simulation

### 3.1 Tick order

Fixed. Deviating changes results.

```
 1  tick++, t = tick·DT, fx cleared
 2  clocks       cooldowns, stun, i-frames, say expiry           [both, in world.order]
 3  perceive     BOTH perceptions built from the SAME pre-think state
 4  think        both brains run against that frozen snapshot
 5  orders       queued orders applied                            [both, in world.order]
 6  acts         skill state machines advance; strikes resolve    [both, in world.order]
 7  move         turn servo, jump arc, accel/brake, knockback decay, integrate
 8  collide      obstacles+walls per body, then body-vs-body, then clamp
 9  resolve      deaths, timeout, curtain
10  snapshot
```

Steps 3–4 are split from 5 deliberately: if one brain acted and the other then perceived the result, the second would react 33 ms sooner **every tick** — a bias invisible in a replay and decisive over 200 matches. `world.order = ['octopus','gorilla']` is fixed, which is what makes simultaneous events deterministic.

Steps 6–8 run per fighter in `world.order`. Walls resolve inside step 8 *after* body‑vs‑body, then both bodies are re‑clamped, which guarantees the only invariant worth asserting: nothing ends a tick outside the arena.

### 3.2 Conventions

Stated once; everything downstream depends on it.

```
Ground is the X/Z plane. +Y is up. Units: metres, seconds, radians, hit points.
Heading 0 faces +Z and increases toward +X.
    headingOf(dx, dz) = Math.atan2(dx, dz)
    dirOf(h)          = [Math.sin(h), Math.cos(h)]
Renderer: root.rotation.y = heading   (both bodies face +Z; no fixup)
```

A signed angle is wrapped to `(−π, π]`. `V.perp` is documented as "rotated a quarter turn" and **never** as a named side — under this convention the left/right naming is a coin‑flip that half of generated brains will get backwards, and a `say("kiting left")` that contradicts the picture is worse than no name at all.

### 3.3 Locomotion

A brain sets a *standing* order — a direction (`move`) or a point (`moveTo`) — and a *standing* facing (`face`/`faceAt`). Orders persist until replaced; there is no TTL and no per‑tick re‑issue. A brain that has an off tick keeps running its plan, which is also what a real fighter does.

```
desired = dir · maxSpeed · moveScale(current act)
rate    = (desired == 0) ? BRAKE_ACCEL : accel
v      += clampedStepToward(desired, rate · DT)
heading = turnToward(heading, wantHeading, turnRate · turnScale(current act) · DT)
pos    += (v + knockback) · DT
```

Facing and movement are **independent** and uncoupled — a body walks one way while pointing another at no speed penalty. This is a deliberate departure from the mechanics design's "facing gate": that gate existed to solve a moonwalk problem, and §8.4 solves it in the bridge instead, with signed stride, at zero gameplay cost.

`moveTo` is steered through `nav.js` (string‑pulled: the furthest visible waypoint is the target, so a body cuts a corner as soon as it can see past it). `move` is raw steering with no help at all. **Walking around a box is a motor skill, not a tactical one** — §0.3/C2. Knockback decays independently of control, so a knocked body drifts while its brain steers, which is what makes an impact feel like one.

### 3.4 The dash, and the velocity bug that must be fixed

**Defect (measured).** During `charge`'s dash phase, `dashStep` sets `me.vx = me.vz = 0` and integrates position directly. `snapshot()` and `perceive()` therefore both report **|v| = 0.000 while the body travels at 15.0 m/s**. Consequences, both live:

- the viewer computes gait speed from reported velocity → the gorilla plays its **standing pose while sliding 12 m at 15 m/s**, the single most spectacular move in the game rendered as a statue on a conveyor belt;
- `p.enemy.vx/vz` read zero, so any brain using velocity to predict a charging gorilla — including `V.lead`, which the prompt offers — sees it as **stationary**.

**Fix.** Keep the internal `vx/vz = 0` (it is what stops the accel integrator fighting the dash), but expose the true velocity. Add to the fighter a derived `reportedVel`, set each tick as `(pos − prevPos)/DT`, and have both `snapshot()` and `perceive()` publish that instead of `vx + kx`. One field, computed in one place, and it repairs the viewer and perception together.

**Second defect (derived).** `moveStep` turns `heading` throughout the dash at `turnScale 0.85 × turnRate 4.0 = 3.4 rad/s`, while `dashStep` travels along `act.dx/dz` frozen at the end of the wind‑up. Over an 0.80 s dash the heading can rotate up to 2.72 rad = **156° away from the direction of travel**. *(measured: a nonzero divergence in a low‑lateral case.)* The prompt already tells the model the direction "cannot be changed after" the wind‑up, so the body should not appear to change it either.

**Fix.** Turning is suppressed during the `dash` phase only — heading is pinned to `act.dx/dz`. This costs no balance (the travel direction was already frozen), makes the prompt's sentence literally true, and removes the divergence by construction. It is preferred over the alternative — letting travel follow heading — because *(measured)* making the dash steerable raises `charge` hit rate from 23 % to 38 % but costs the octopus **17 points of win rate** (50.5 % → 33.0 %), i.e. it is a balance change wearing a bug fix's clothes. See §4.5.

### 3.5 Collision

Everything is a circle in XZ against an axis‑aligned box, or circle against circle.

```
per fighter, in world.order:
  for each solid (6 obstacles + 4 walls):
      push out along the shortest escape;
      remove only the INTO-surface component of v and of knockback  → slide, not stop
      if dashing: end the dash
      emit one `blocked` event per tick if the push exceeded 0.02 m
  clamp |x|,|z| ≤ ARENA_HALF − radius
then once:
  body vs body: separate along the centre line, split by mass
      (share_a = mass_b/(mass_a+mass_b));  re-clamp both;  emit `contact` to both
```

The centre‑inside‑box branch is load‑bearing: the closest surface point of a box to a centre inside it is the centre itself, so the escape direction must come from the least‑penetrated axis instead. Without it a body shoved into a wall by a 6 m/s knockback stays there forever.

Mass split is 0.31/0.69 — the gorilla absorbs less of every separation and shoulders the octopus around. Neither brain is told this; both can discover it.

**Tunnelling (derived).** Max instantaneous speed is 15 m/s → 0.50 m/tick. Smallest obstacle half‑extent is 1.2 m and smallest radius 1.0 m, so guaranteed overlap depth is 2.2 m — a **4.4× margin**. Discrete collision cannot tunnel. Two events are still swept because they are one‑shot and consequential: charge contact (capsule from `prevPos` to `pos` vs the target circle) and the blink destination.

### 3.6 Line of sight

2‑D, centre to centre, against all ten solids. Obstacle *height* has no mechanical meaning — this is a planar world and the blocks are drawn taller than both bodies purely so the rule looks honest.

Centre‑to‑centre is deliberate: testing silhouette points would let a fighter shoot from behind cover with one shoulder showing, which reads as a bug to anyone watching.

Three separate tests exist and must not be conflated. §6 discloses all three:

| Test | Origin | Width | Used by |
|---|---|---|---|
| `p.enemy.visible`, `api.los` | your centre | zero | perception |
| `api.ray` | your centre | zero | perception |
| the beam | `centre + heading·(radius + BEAM_ORIGIN_OFFSET)` | `BEAM_RADIUS` + target radius | `laser` resolution |

So `visible === true` does **not** imply the beam connects, and `false` does not imply it is blocked. This difference is real and must be stated, not hidden.

### 3.7 Determinism, and the invariants worth asserting

One entropy source: `mulberry32`, with `streamFrom(seed, name)` giving each consumer an FNV‑hashed named stream so one fighter drawing more numbers cannot shift the other's. `Math.random` and `Date` are removed from the brain realm (§5.7). Fixed iteration order everywhere.

A match is reproducible from `(seed, brainOctopus, brainGorilla)` **on one V8 build**. Two honest caveats, stated rather than argued away: `Math.sin/cos/atan2` are not bit‑specified by ECMAScript; and a wall‑clock `THINK_TIMEOUT_MS` means a match containing a timeout is only replayable if the fault ticks are recorded and replayed as forced faults. The match record therefore stores `{tick, kind}` for every fault.

**Assertions** (dev, per tick). They **log and dump `(seed, tick, state)`; they do not abort** unless `--strict`. One pin must not destroy a 200‑round run.

```
isFinite on every position and velocity component
|pos.x| ≤ ARENA_HALF − radius   and   |pos.z| ≤ ARENA_HALF − radius
y ≥ 0        and        0 ≤ hp ≤ maxHp
no body overlapping any obstacle AABB by more than 0.01 m
rendered min.y ≥ −0.01 m in world space          (§8.5 — catches every sinking bug)
```

Deliberately **not** asserted: `dist(A,B) ≥ radiusA + radiusB`. Wall‑pinning makes it false by design — a gorilla holding an octopus against a wall is a feature — so it is reported as a soft metric (`maxPairOverlap`, flag above 0.15 m) instead of an abort.

---

## 4. Skills

### 4.1 The shared state machine

A skill is a script of named phases, each with a duration and a flag for whether the effect resolves on the way out.

```
laser   [windup 0.55 → STRIKE] [recover 0.10]
blink   [strike  0.00 → STRIKE] [recover 0.18]
smash   [windup 0.28 → STRIKE] [recover 0.28]
charge  [windup 0.34] [dash 0.80, strikes on contact] [recover 0.35]
jump    [windup 0.10] [air 0.55] [recover 0.16]
```

> *(Annotation, added later. This script is right and its durations are not: each phase is served in
> whole ticks and hands its overshoot to the next one — see the note under §2.5. The reaction-budget
> derivations further down are unaffected in direction, and one of them gets safer: §4.4's jump-over-
> smash argument reads a 0.28 s smash wind-up, which the world serves in 0.3 s.)*

Rules that hold for all five:

- **The act slot is single‑occupancy.** `startSkill` refuses while any act runs, while stunned, while on cooldown, and while off the ground. A refusal is **free** — no cooldown, no time, no animation, and it never touches the standing move order. The most probable mistake an average brain makes must be harmless, not paralysing.
- **The cooldown starts when the skill starts**, not when it ends.
- **Aim is read at the strike, not at the order.** The caster keeps turning at `turnRate · turnScale` through the wind‑up and the target keeps dodging, so the exchange is decided by who was better at the last instant rather than by who clicked first. This is the mechanic that makes a wind‑up a two‑sided telegraph, and it is the spectacle thesis of the whole project.
- **A zero‑length first phase resolves on the tick it was ordered** (this is `blink`, and it is why blink has no telegraph).
- Starting a skill emits `enemyStarted {skill, windup}` to the *opponent*. That is the telegraph, delivered as data.

### 4.2 `laser` — octopus

Cast `windup` 0.55 s, then a hitscan beam along the heading **at the instant of release**, then `recover` 0.10 s. During the cast, top speed × `moveScale` 0.30 (1.47 m/s — a visible shuffle, not a root) and turn rate × `turnScale` 0.55 (3.3 rad/s, still six times what tracking a crossing target at 10 m requires).

Geometry: a segment from `centre + heading·(radius + BEAM_ORIGIN_OFFSET)` of length `range`. It stops at the first solid; it connects if the target circle inflated by `BEAM_RADIUS` is met before that solid.

**Line of sight is not a precondition.** The call succeeds and the cooldown is spent regardless; a block simply eats the beam and the miss is reported as `missed {skill:'laser', reason:'cover'}`. Rejecting a cast for something the brain could have known would be fair; wasting one for something it could not is a bad-looking bug; *losing* one to an opponent's visible counter-play is the best-looking moment in the match. §6 states this exactly, and does not use the word "required".

Interruptible: a charge impact cancels it, the cooldown is already spent, and `interrupted {skill, by:'charge'}` is emitted.

*(measured, control pair)* used 7.8×/match, hit rate 94.6 %. The octopus's problem has never been accuracy; it is uptime and survival.

### 4.3 `blink` — octopus

Instant. `distance` 7.5 m along a direction the brain passes in (`api.use('blink', dx, dz)`, unnormalised; with no argument, along the heading). `iframes` 0.28 s from arrival. `recover` 0.18 s during which nothing else can start.

**It crosses solids; it never ends inside one.** The destination walks back toward the origin in `BLINK_STEP` increments until the circle is clear by `BLINK_CLEARANCE`, which also handles the arena edge without a second rule. A teleport that refuses to cross a wall is a worse escape than a sprint, so this one crosses — but being *stopped short* is a legible, self‑inflicted consequence, and it is reported: `blinked {from, to, moved}` carries the distance actually achieved.

Velocity is scaled by `BLINK_VELOCITY_KEEP` through the teleport, so arrival is not a full‑speed slide.

Not interruptible; nothing can interrupt an instant.

### 4.4 `smash` — gorilla

`windup` 0.28 s → cone → `recover` 0.28 s. During the wind‑up, speed × 0.30 (1.56 m/s) and turn × 0.55. A fully rooted swing means the octopus walks out of the cone every single time and melee never lands; a slowly advancing swing lands.

Connects when **all** of:

```
dist(centres) ≤ smash.range + attacker.radius + target.radius              (= 4.75 m)
|angleDelta(heading, bearing)| ≤ halfAngle + asin(target.radius / dist)    (= 55° + up to 12.2°)
target.y ≤ SMASH_AIRBORNE_MAX                                             (= 0.35 m)
target.iframes ≤ 0
```

**The reach formula is an invariant, not an accident**, and §9.4 requires a unit test that sweeps the boundary. *(measured)* the shipped prompt says the cone reaches "`range` m past your own radius", which a model reads as 3.75 m; the truth is 4.75 m. A 1 m error in the single most lethal band is exactly the class of prompt lie this project exists to prevent. §6 fixes the wording to name all three radii.

The airborne clause is the jump‑dodge (§4.6). Knockback 2.0 m/s. Interruptible by a charge impact.

*(measured, control pair)* used 4.0×/match, hit rate 77.0 %.

### 4.5 `charge` — gorilla

`windup` 0.34 s during which speed × 0.20 and turn × 0.85 — **the heading at the end of the wind‑up is the travel direction and is then locked**, and `enemyCommitted {skill:'charge'}` fires at that instant. Then `dash`: 15 m/s for up to 0.80 s, i.e. 12.0 m. Then `recover` 0.35 s.

Terminates on: enemy contact (swept), obstacle or wall contact, or time. On enemy contact: 34 damage, 6.0 m/s knockback, 0.40 s stun, and it **cancels an interruptible cast**. Not interruptible itself.

**Do not add a minimum range, and do not make the dash steerable.** Both were tested:

| variant | control‑pair octopus win | charge hit rate | melee uptime |
|---|---|---|---|
| as specified | **50.5 %** | **23 %** | **25.5 %** |
| dash steerable at 0.39 turnScale | 33.0 % | 38 % | — |
| dash steerable at 0.85 turnScale | 30.5 % | 39 % | — |
| `minRange` 5.0 m (older config) | 0 % *(v1 pair)* | 2 % | 68 % |

*(all measured, n=200 except the minRange row at n=40.)* Steering is a 17‑point power swing, not a fix. The range gate is worse than useless: denied its charge, the gorilla simply walks into smash range, and **smash — not charge — is the gorilla's win condition.** Under the pinned config the charge hits 23 %, above the 15 % dead‑skill threshold, and needs no intervention.

The whiff cost question — *(measured)* 106 of 125 charges ended on a wall under the older config, at no cost beyond the cooldown — remains **open**, with a named experiment in §9.5. It is not asserted here because it has not been measured under the current numbers.

### 4.6 `jump` — both

`windup` 0.10 s → `air` 0.55 s → `recover` 0.16 s, cooldown 1.6 s. The arc is `y = 4·jumpHeight·u·(1−u)` over the airborne phase. **Horizontal velocity is frozen at take‑off and cannot be steered**, so a jump is never a movement upgrade and no brain can degenerate into bunny‑hopping. Nothing can be started while off the ground.

Its payoff is exactly one thing and it is real: `SMASH_AIRBORNE_MAX` means a ground sweep passes underneath. Reaction budget *(derived)*: `enemyStarted {skill:'smash', windup:0.28}` arrives, think latency ≤ 0.067 s, jump wind‑up 0.10 s → airborne at ≈0.17 s < 0.28 s. It works.

**Keep it.** *(measured)* the generated octopus jumps 3.8×/match and produces `smash:airborne 3.4` misses per match — it discovered the dodge from the rules alone, with nothing in the prompt suggesting it. That is the single best piece of evidence in the project that the LLM‑vs‑LLM idea is realised, and the api design's proposal to cut the verb would have deleted it.

---

## 5. Brain contract

```js
function think(p, api) { /* … */ }   // return value ignored, by contract
```

### 5.1 The rule that governs what is exposed

The api design's "spectator parity" is dropped: it was violated by its own next section. The workable rule, which this spec adopts:

> **Every enemy field must correspond to something the pose or the position makes visible; every self field may be exact. Nothing named after a tactic exists.**

Under it `enemy.casting.{skill, phase, telegraph}` survives (it is animation), `enemy.cooldowns` does not (invisible, and exposing it turns perfect timing into frame‑perfect robotics rather than intelligence), and derived arithmetic over visible positions — `dist`, `visible` — survives because a watcher can compute it too.

The api may never contain `kiteVector()`, `safeSpot()`, `bestCover()`, `threatMap`, or any field whose *name* states a tactic. **Smuggling strategy into a helper is the same violation as writing it in the prompt, and harder for a reviewer to spot.**

### 5.2 Perception `p`

Built fresh per think, crossed into the vm realm as JSON — so every object the brain touches belongs to its own realm, `p.mem` is a snapshot rather than a live handle, and a brain cannot keep hidden state by writing to `p`. About 1 kB per thought; free at 15 Hz. All scalars rounded to 3 decimals.

```
p.t          s since the match began
p.dt         s between two thoughts (= THINK_EVERY/TICK_HZ)
p.tick       simulation step count
p.timeLeft   s before the match is decided on hp fraction

p.self
  id  x  z  y                      position; y > 0 only during a hop
  vx  vz  speed                    TRUE velocity, dash included (§3.4)
  heading                          radians
  hp  maxHp  radius  maxSpeed  turnRate
  alive  airborne  stunned  invulnerable  busy
  casting    null | { skill, phase, elapsed, remaining, total, telegraph }
             phase ∈ 'windup'|'strike'|'dash'|'air'|'recover'
             telegraph = the effect has not landed yet
  cooldowns  { name: seconds, 0 = ready }
  skills     names accepted by api.use

p.enemy      every p.self field that describes a body, minus cooldowns, plus
  dist       centre-to-centre
  visible    centre-to-centre LOS — see §3.6, this is NOT the beam's test

p.arena
  half       ARENA_HALF
  obstacles  [{ x, z, hx, hz }]

p.events     what happened to you since your last thought, oldest first, capped
             at EVENT_CAP; p.eventsDropped counts the overflow
p.mem        read-only snapshot of api.remember; writing to it does nothing
```

`p.rules` is **not** a hand‑written table. It is defined as a mechanical projection of `config.js` — the same projection the prompt generator consumes (§6.4) — so there is no second copy to drift.

**Deliberately absent, with reasons:** enemy cooldowns and memory (§5.1); `projectiles` (nothing is ever in flight — the laser is hitscan and the charge is a body; a permanently empty array teaches a false world model and invites dead dodge code); fog of war (the camera always shows both).

### 5.3 Verbs

Two classes with **separate budgets** — `MAX_ORDERS_PER_THINK` for mutating verbs, `MAX_QUERIES_PER_THINK` for pure ones. A shared cap is a live defect: *(measured)* the generated octopus issues 27.9 `ray` calls per think, and under one 64‑cap its `los()` starts returning `false` and its `ready()` starts returning `false` — **the brain's senses begin lying to it precisely because it thought carefully.** Query exhaustion must raise a fault, never return a plausible falsehood.

```
ORDERS (budget MAX_ORDERS_PER_THINK)
  api.move(dx, dz)      raw steering, no avoidance; {0,0} is a full stop
  api.moveTo(x, z)      routed around blocks; clears within ARRIVE_RADIUS
  api.stop()
  api.face(dx, dz)      standing facing order
  api.faceAt(x, z)
  api.use(name, a, b)   a,b is blink's direction argument
  api.say(text)         SAY_MAX_CHARS, SAY_SECONDS dwell, no mechanical effect
  api.remember(k, v)    JSON-serialisable; MEM_MAX_KEYS × MEM_MAX_VALUE_BYTES
  api.forget(k)

QUERIES (budget MAX_QUERIES_PER_THINK, pure)
  api.ready(name)       cooldown clear AND no act AND not stunned AND alive
  api.cooldown(name)    seconds, 0 = ready
  api.los(x, z)
  api.ray(dx, dz, max)  { hit, dist, x, z }; max capped at RAY_MAX, default RAY_DEFAULT
  api.pathTo(x, z)      { dist, direct, points[] } — true walking length, or null
  api.rand()            seeded per match per fighter
  api.recall(k, dflt)
```

**Arbitration: last call wins, uniformly, for every verb.** The api design's split rule — first‑wins for `use`, last‑wins for `move` — is rejected: it is unguessable from outside and roughly half of generated brains will get it backwards. Last‑wins also matches the shape an LLM writes most often, a general default at the top refined by later branches.

**`api.use` returns `true` for a successfully *queued* order, not a successfully *started* skill.** Orders queue and apply in step 5; `startSkill` can still refuse. This is the highest‑probability misreading in the api and §6 states it explicitly.

**Refusals must be instrumented.** `startSkill` currently refuses silently, which makes the "is it deciding or hoping" metric uncomputable. It must push `{type:'refused', who, skill, reason}` into the world log **and** emit it to the acting fighter's own `p.events`, with `reason ∈ {busy, cooldown, stunned, airborne, dead}`. An unexplained no‑op reads to a model as a broken engine; telling it is one line and it is the difference between a brain that adapts and one that loops on camera forever.

### 5.4 Memory

`api.remember/recall/forget`, enforced at write time, JSON‑safe by construction, cleared per match, surfaced read‑only as `p.mem`. It is what the HUD shows, what the match record dumps, and what a post‑mortem reads.

**Top‑level state also persists and is writable.** *(measured)* `let counter = 0` beside `think` increments across ticks with no fault. It is deterministic (same code + same seed + same inputs ⇒ same state) and replay is by re‑simulation, not state restoration, so closures do not break replays. §6.3 rewrites the prompt to say this truthfully instead of forbidding it.

### 5.5 Events

An event exists **iff** the state snapshot cannot convey it, or it could begin and end between two thoughts. Anything the snapshot already shows is not an event — there is no `cooldownReady`, no `hpChanged`. A diluted feed is an ignored feed.

```
damaged   { skill, amount, hp, from:{x,z} }     dealt      { skill, amount, enemyHp }
missed    { skill, reason }                     evaded     { skill, by }
  reason ∈ 'aim'|'cover'|'range'|'airborne'|'invulnerable'
refused   { skill, reason }        NEW, §5.3     blocked    { by:'wall'|'obstacle' }
contact   { }                                   knockback  { by }
blinked   { from, to, moved }                   landed     { }
interrupted { skill, by }                       interruptedEnemy { skill }
chargeStopped { reason }                        enemyStarted { skill, windup }
enemyCommitted { skill }
```

`missed.reason` is the highest‑value entry: each value implies a different correction, and **none of those corrections appears anywhere in the prompt**. The brain is shown the lesson; it is never told it. Likewise `damaged.from` turns "I am taking damage" into "he is on my left", and it is the only thing that makes a knockback comprehensible rather than a physics glitch.

### 5.6 Helpers

`V`, compiled into the brain's own realm: `add sub scale lerp len dist dot norm toward away perp rot heading fromHeading angleTo clamp lead`. Plain `{x, z}` objects, zero‑safe.

The set is small on purpose: each entry is arithmetic the model would otherwise get subtly wrong, and none encodes a decision. `V.lead` looks like tactics and is not — it is the closed‑form intercept of a point at constant velocity, the same answer the model would derive, and withholding it only means half the brains get the quadratic wrong. `V.perp` is described as "rotated a quarter turn" (§3.2).

### 5.7 Failure handling

**The host degrades the brain; it never replaces it.** There is no fallback AI, no sensible default action, no smoothing‑over. A fallback would make a broken brain look competent and the project's entire premise — *an LLM wrote this* — unfalsifiable. The mechanics design's crash handler (`if (dist < 4) move(away) else move(toward)`) is a complete distance‑thresholded engagement policy and is rejected outright.

| Failure | Response |
|---|---|
| compile/parse/shape error | brain never enters the arena; the forge reports it |
| throw during a thought | fault counted, orders for that thought discarded, standing orders keep running |
| timeout (`THINK_TIMEOUT_MS`) | identical *(measured: fires at 27 ms)* |
| garbage return value | ignored by contract |
| non‑finite argument | order rejected at the boundary; a `NaN` position is the worst‑looking possible bug and must be impossible by construction |
| order budget exceeded | further orders dropped |
| query budget exceeded | **fault**, never a falsehood (§5.3) |
| `FAULT_LIMIT` consecutive faults | brain switched off for the match; the body coasts; HUD says so |

The sandbox is a guard against a crash, not against an attacker — `api` is a bag of host functions and a determined caller reaches the host realm through a prototype. Saying that out loud is the cheap part. What *is* enforced, *(all measured)*: `Date` is `undefined`, `Math.random` throws with a message naming `api.rand()`, `eval` and `new Function` raise `EvalError` (`codeGeneration:{strings:false}`), and `require`/`process`/`fetch`/`setTimeout` are absent. `globalThis` and a capturing `console` exist deliberately.

---

## 6. The brain prompt

### 6.1 The editing rule

Every emitted line is exactly one of: **(1)** a capability, **(2)** a constraint with its reason, **(3)** a fact about the world, **(4)** the objective. Nothing else. No tactics, no priorities, no rankings, no "it is usually better to…". If a sentence does the model's thinking for it, it is not in one of the four categories and it does not belong.

The reason is not decoration: a ban without a reason makes the model infer an ancient runtime and write ES3.

### 6.2 Section order

Contract → goal → constraints → machine behaviour → reference. Anything the model must *act* on sits above the reference material.

| # | Section | Cat | Source |
|---|---|---|---|
| 1 | identity line | 3 | `FIGHTERS[id].name` |
| 2 | `SHAPE` | 2 | written |
| 3 | `THE OBJECTIVE` | 4 | written — **moved up** from last |
| 4 | `THE WORLD` | 3 | generated from `ARENA_*`, `OBSTACLES`, `TICK_HZ`, `SPAWN_RADIUS`, `MATCH_SECONDS` |
| 5 | `YOUR BODY` | 1+3 | `FIGHTERS[id]` |
| 6 | `YOUR SKILLS` | 1 | `SKILLS` filtered by owner + `jump` |
| 7 | `YOUR OPPONENT'S BODY` | 3 | `FIGHTERS[other]` |
| 8 | `YOUR OPPONENT'S SKILLS` | 3 | symmetric disclosure |
| 9 | `WHAT YOU PERCEIVE` | 1 | `PERCEPTION_SCHEMA` |
| 10 | `WHAT YOU CAN DO` | 1 | `API_VERBS` |
| 11 | `WHAT IS ALREADY IN SCOPE` | 1 | the `V` table |
| 12 | `THE RULES` | 2 | written |

**Full symmetric disclosure of the opponent is a fact about the world, not a tactic**, and it is the single highest‑leverage section for the standard the brief sets: an octopus that does not know a charge covers 12 m in 0.80 s cannot make a spacing decision, and a fight where neither side can make a spacing decision looks like two robots colliding. Withholding it does not make the model think harder; it makes it think blind, and pushes the outcome back onto the constants.

The objective moves to position 3 because every section after it is read in its light: a capability list read without a goal is a reference manual; read with one it is a menu.

### 6.3 Verbatim text

**`THE OBJECTIVE`** — paste‑ready.

```
THE OBJECTIVE

Kill your opponent. Stay alive.

That is the whole of it, and it is one job rather than two that trade against
each other.

The two numbers it is made of, because an objective with no field behind it is
one nothing can act on:

- p.enemy.hp runs from its start value down to zero. Driving it to zero is the
  only way this match is won.
- p.self.hp runs the same way, and at zero this mind stops being called. Nothing
  in the arena restores it — there is no healing, no regeneration, no pickup and
  no rest. Every point taken is taken for the rest of the match.

If neither reaches zero before the clock runs out, the fighter holding the
larger FRACTION of its own starting hp wins; exactly equal fractions is a draw.

Nothing above tells you how, and nothing above is a recommendation: it is an
inventory of what exists, what it costs and what the world does. How you fight
is yours.
```

The hp‑fraction tiebreak is disclosed because it is true and because hiding it suppresses correct endgame play. Disclosing a win condition is category 3; telling anyone what to do about it would be a tactic, and no sentence does.

**`THE RULES`** — paste‑ready. Rule 2 is rewritten; the shipped text asserts the opposite of what the host does.

```
THE RULES

ONE. NO Math.random AND NO Date.
   Both throw. The reason is not safety, it is replay: a match must be
   reproducible from the seed and the two minds, so that two hundred rounds can
   be run headless and mean something, and so a fight can be watched again
   exactly as it happened. Both of those read a clock this world does not have.
   api.rand() is the seeded replacement and is as random as you need.
   eval and new Function are also unavailable, for the same reason.

TWO. STATE BESIDE think PERSISTS, AND IS YOURS.
   Variables and functions declared beside think are kept and are writable. A
   counter you increment or a cache you fill survives between thoughts and is
   fully deterministic, because the same seed and the same inputs reproduce it
   exactly. api.remember and api.recall exist alongside it and do something a
   closure cannot: what you store there is what the viewer displays, what the
   match record keeps, and what anyone reading the fight afterwards can see.

THREE. A THOUGHT HAS A FIXED TIME BUDGET.
   Overrunning aborts that thought: no orders are issued, your standing orders
   keep running, and the fault is counted. That is far more time than any
   ordinary decision needs; it is a guard against an accidental infinite loop,
   not a budget you have to husband.

FOUR. A THROWN ERROR COSTS YOU THAT THOUGHT, NOT THE MATCH.
   Your standing orders keep running and the next thought is attempted. After
   enough consecutive faults the mind is switched off for the rest of the fight
   and the body coasts on whatever it was last told.

DIALECT: modern JavaScript. const, let, arrow functions, template literals,
for-of, destructuring, classes, and the array methods all work. Rule ONE is
about two names, not about the language.
```

Rule numbers are words, not digits, so §6.5's digit test needs no exemption list.

### 6.4 The generation rule

> An emitter iterates `Object.entries(record)` and renders each key through `FIELD_DOC[key]`. **It never names a field in its own source.** A key present in a record with no `FIELD_DOC` entry **throws at build time.** Adding a field to `config.js` therefore cannot fail to add a line to the prompt — the build stops until someone writes the line.

`FIELD_DOC` and `UNITS` live **inside `config.js`**, so the throw has one file to guard. `YOUR SKILLS` and `YOUR OPPONENT'S SKILLS` use the identical emitter with one different header line — never a second template.

Six sentences are *relational* — they involve two records, so they cannot be emitted per field. They are the only hand‑written generated text, they are each derived from §2.8, and they are listed here in full:

1. **Smash reach.** `"connects when the distance between your centre and theirs is at most ${smash.range} + your radius + their radius"`, with the arithmetic shown for this pairing. *(The shipped wording understates this by 1 m; §4.4.)*
2. **Cone widening.** `"a body of radius r at distance d widens the arc it occupies by asin(r/d)"`.
3. **Charge reach.** `"${dashSpeed} m/s for up to ${dashSeconds} s, so up to ${dashSpeed×dashSeconds} m — measured against a target that is not moving away from you"`.
4. **Beam origin.** `"the beam leaves ${radius + BEAM_ORIGIN_OFFSET} m in front of your centre and is ${BEAM_RADIUS} m thick, so p.enemy.visible and whether the beam connects are not the same test"`.
5. **`use` return value.** `"api.use returns true when the order was accepted into the queue, not when the skill started; a skill can still be refused when the queue is applied, and a refusal arrives as a 'refused' event on your next thought"`.
6. **Jump and the ground sweep.** `"a body more than ${SMASH_AIRBORNE_MAX} m off the ground when a ground sweep lands takes nothing from it"`.

Each is a mechanism. None says what to do about it. **That is the boundary: state what the world does; never state what to do about it.** "Moving through your own cast costs you speed" is a fact; "so turn before you retreat" is a tactic — omit it.

### 6.5 The anti‑drift layers

1. **One number, one home.** `config.js` is the only file permitted a gameplay constant. §2.9 removes the dead ones; §2.3 promotes the magic literals that a brain can perceive or exploit.
2. **The prompt is emitted, not typed.** Sections 4–11 have no prose source.
3. **The digit test.** Strip every `${…}` from each hand‑written template's static parts and assert the remainder matches `/^[^0-9]*$/`. Every digit reaching the model is then an interpolation of a table value, by construction.
4. **Five sync tests.** `api-sync` (bound verbs ≡ documented verbs); `perception-sync` (paths in a real `p` ≡ schema, over a **scripted coverage scenario** that forces both fighters mid‑cast, a damage event, an interrupt, a blink, a miss and a landing — a one‑tick flatten cannot see `casting`, `events` or `cooldowns`); `fielddoc-sync` (every record key has `FIELD_DOC` and `UNITS`); `liveness-sync` (**every** `SKILLS`/`FIGHTERS` key appears as an identifier somewhere in `src/core/*.js`, or the build fails — this is the test that would have caught `aimAtStrike`, `pose` and `bodyLength`); `determinism` (the same `(seed, brains)` twice, tick logs byte‑compared).
5. **The provenance gate.** §7.4.

---

## 7. The generation lane

### 7.1 Invocation

```js
spawn(CLAUDE_BIN_ABSOLUTE, [
  '-p', brainPrompt(id),
  '--system-prompt', SYSTEM_PROMPT,
  '--model', MODEL, '--effort', EFFORT,
  '--output-format', 'json',
  '--no-session-persistence',
  '--tools', '',            // "" disables; --allowedTools is an allow-list and permits
  '--strict-mcp-config', '--disable-slash-commands',
  '--setting-sources', '',  // excludes user/project/local settings FILES
], { stdio: ['ignore','pipe','pipe'], env: scrubbed })
```

- **The binary path is absolute and is configuration.** Three installs on this machine, none reachable from a non‑interactive login shell because nvm does not initialise there. `ENOENT` from a bare `'claude'` degrades silently into "the model returned nothing".
- **`--effort` is always passed**, never inherited — so the value stamped into the provenance record is true by construction rather than by inference about flag precedence. `--setting-sources ''` and `--effort` are belt‑and‑braces, and that is the honest framing; the two are not alternatives.
- **Never `--bare`.** Its own help states Anthropic auth becomes strictly `ANTHROPIC_API_KEY`/`apiKeyHelper` and OAuth and keychain are never read — on a subscription that is an instant 401 wearing a success envelope.
- **Scrub the environment**: drop `ANTHROPIC_*`, `CLAUDECODE`, `CLAUDE_PID`, `CLAUDE_EFFORT`, `CLAUDE_AGENT_SDK_VERSION`, and everything `CLAUDE_CODE_*`. A `claude` spawned inside another Claude Code session inherits the parent's socket and hangs before printing a byte — indistinguishable from a slow model. `stdin` is `'ignore'` for the same class of reason.
- `--system-prompt-file` exists in 2.1.245 and is the better channel for a large prompt (no ARG_MAX exposure, and the file is the artefact you were going to stamp anyway). `--max-turns` does not exist.

### 7.2 Reading the envelope

Order is not negotiable: spawn error → `no_binary`; empty stdout → `no_output` with `stderr.slice(0,400)`; JSON parse failure → `bad_envelope`; **`env.is_error === true` → failure**, with `api_error_status` and `result`; then `env.result` as the text.

**`is_error` is the only trustworthy signal.** A revoked token returns exit code 0, `"subtype":"success"`, `"stop_reason":"stop_sequence"` and an empty result. `stop_reason` is never read on this lane.

`extractSource` then strips fences (models wrap despite the instruction; a prompt line moves that from always to sometimes, not to never) and cuts any leading prose to the first line that could begin a program.

### 7.3 The validation ladder

Cheapest first; the first failure is the repair subject.

| rung | check | quoted back on failure |
|---|---|---|
| compile | `new vm.Script` parses | the `SyntaxError`, the line, ±3 lines |
| shape | `think` exists and takes 2 parameters | observed typeof/arity + the `SHAPE` block verbatim |
| crash | two full matches vs the opposite **stub** at `VALIDATE_SEEDS` complete | the host error |
| faults | fault rate ≤ `FAULT_RATE_GATE` | count, rate, and the first error message |
| orders | at least one api order across both matches | "it issued no api order at all" |
| motion | body travelled ≥ `MOVED_GATE` | the distance |
| skills | at least one skill *started* across both matches | "it never successfully started a single skill" |
| cost | mean think ≤ `THINK_MICROS_GATE` | the measured mean |

**A rung must be cheap and must catch real breakage. It must never be a taste check.** Two rules follow, and they are the ones that protect the experiment:

- **Never gate on which skill was used.** "This brain must use blink" is a strategic directive, and the model's cheapest repair for it is an unconditional `if (api.ready('blink')) api.use('blink')` — which is exactly the cooldown‑spam the metrics exist to punish. **Such a rung manufactures the pathology the metrics detect.** The `skills` rung above requires *a* skill, never a *particular* one.
- **Never gate on outcome.** A win‑rate floor is the pressure that eventually pushes tactics into the prompt. Losing to the stub is reported, never rejected.

**Repair discipline.** At most `REPAIRS` turns. A repair message contains exactly three things: the failed rung's name, the machine output verbatim, and the relevant sentence copied out of the prompt. **No diagnosis, no suggestion, no sentence beginning "you should".** A repair that says "check line of sight before firing" is tactics through the back door; it would invalidate every measurement in §9 while leaving the artefact looking better.

The task line (`-p`'s first line) is the one un‑audited text channel in the lane and the highest‑risk surface for leakage — one adjective ("write a *cautious* kiter") contaminates everything and is invisible to the digit test, all five sync tests and the provenance stamp. It is therefore fixed verbatim and stamped into the record: `You are the mind of the ${name}. Your opponent is the ${otherName}.`

### 7.4 Provenance, and the staleness gate

`brains/<tag>/<fighter>.json` records `{fighter, model, effort, tag, promptHash, promptChars, generatedAt, attempts[], accepted, costUsd, wallMs}`.

**`tools/arena.mjs`, `tools/balance.mjs` and the server must refuse to load a brain whose `promptHash` differs from `sha256(brainPrompt(id))` today**, unless `--stale-ok`, which stamps every result row `stale: true`.

This is not hypothetical. *(measured, during this synthesis)*:

```
octopus  promptHash at generation: 0716c1e83365 | current: 10811f34f738  ***STALE***
gorilla  promptHash at generation: cc77a0180d11 | current: 200b40de4ce6  ***STALE***
```

Both shipped `v1` brains were written against a world that no longer exists. They hard‑code numbers they were told, and those numbers moved. **This is the exact failure `config.js`'s own docstring was written to prevent, arriving through the one door left open**, and §9.2 shows it is currently producing a 41‑point win‑rate artefact. A hash comparison at load turns it from an invisible loss into a startup error.

`promptHash` is used rather than a table hash because, by §6.5 layers 1–2, every table change reaches the prompt — so the prompt text is a strictly stronger invariant *and* it is the thing the model actually saw. One hash, one meaning.

---

## 8. The viewer

### 8.1 What is already right

The shipped viewer reads `/api/config` and draws obstacles, wall height and skill timings from it; it interpolates between snapshots with a delay; it lerps headings the short way round; it derives `turn` by dividing the rendered yaw rate by `cfg.fighters[id].turnRate`; and it accumulates `stride` by **signed** distance so a backing‑away body backpedals instead of moonwalking. None of that changes. The viewer critique's claims that it hardcodes stale numbers or uses a disconnected `OMEGA_REF` are **wrong about the shipped file**.

### 8.2 Loading

Import map, no bundler. The server mounts `node_modules/three/build` at `/vendor/`, so:

```
"three":        "/vendor/three.webgpu.js"
"three/webgpu": "/vendor/three.webgpu.js"     ← must be the SAME file, or two module
"three/tsl":    "/vendor/three.tsl.js"           instances and instanceof starts failing
"three/addons/":"/addons/"                    ← NEW mount: node_modules/three/examples/jsm
```

`three.tsl.js` begins `import { TSL } from 'three/webgpu'` — a bare specifier — so the `three/webgpu` entry is mandatory. **Map `three` at `three.webgpu.js`, never `three.module.js`**: the bodies test `THREE.MeshStandardNodeMaterial`, which exists only in the WebGPU build, and without it both fall back to flat untextured plastic that *works*, which is why it goes unnoticed. Assert `THREE.MeshStandardNodeMaterial` at startup.

The `/addons/` mount is new and required: *(measured)* `examples/jsm` is present in `node_modules` but reachable at no URL, so `RoomEnvironment` — which §8.9 makes mandatory — cannot currently load.

`await renderer.init()` explicitly: the WebGPU→WebGL2 fallback happens inside it and nowhere else, and skipping it means you cannot report which backend you got. Then `await renderer.compileAsync(scene, camera)` before the first frame — 17 + 28 node materials, several with three‑octave fBm, otherwise stall 300–800 ms on frame 1.

### 8.3 Scale, and the silhouette bug

**Defect (measured).** The shipped rule scales each body until its horizontal footprint equals its collision diameter. Applied to the art it produces a **1.01 m octopus beside a 1.83 m gorilla** — because the octopus's footprint is its 3.94‑unit arm span while its collider describes its 1.12‑unit mantle. In the source art the octopus is the *taller* of the two (2.22 vs 1.36 units). The rule inverts the silhouette relationship.

**Fix.** Decouple the two numbers, which is what games do — hitboxes rarely match silhouettes.

- `WORLD_SCALE` is a spectacle constant, set for parity: octopus 0.88 (1.95 m tall), gorilla 1.45 (1.97 m). The octopus's arms then overhang its collider by 0.73 m per side; that is correct and deliberate — arms are limbs, not hull, and the mechanics design's observation that "the arm splay is not collidable" is right.
- The collider is drawn as the **contact shadow** (§8.9), so the true footprint stays readable and the overhang cannot be mistaken for a collision bug.

### 8.4 Gait

```
speed  = clamp(|reportedVel| / GAIT_LENGTH, 0, SPEED_CLAMP)     low-passed at SPEED_TAU
stride += signedDistance / strideMetres(speed)                  frozen when airborne
         where signedDistance = dot(Δpos, forward)
               strideMetres(sp) = max(STRIDE_FLOOR,
                                      STRIDE_BASE + STRIDE_SLOPE·sp)   ⌈ floored by
                                                     |v| / CADENCE_MAX ⌋
turn   = clamp(yawRate / turnRate, −1, 1)                        low-passed at TURN_TAU
```

`speed` must come from `reportedVel` (§3.4), **not** from `snapshot.vx/vz` as shipped. Without that fix the gorilla plays its standing pose through a 15 m/s charge.

`GAIT_LENGTH` is a dedicated constant, not the measured AABB. *(measured)* the shipped divisor caps the gorilla at **2.45 bl/s**, below its own gallop onset of 2.6, so the most expensive locomotion content in the art — gallop and flat sprint — is unreachable at any speed. With `GAIT_LENGTH` the bands land: gorilla walk 1.4, top speed 3.59 (gallop 0.41 + flat 0.25), charge 10.3 → clamped to full sprint, which *is* the charge and needs no bespoke animation. Octopus reposition 1.1 (crawl), top speed 3.63 (full jet + 0.21 fast) — **it crawls when it repositions and jets when it flees**, and that read falls straight out of the constants.

The octopus does **not** clamp `speed` internally (`Math.max(0, …)` only). The bridge must.

`stride` freezes across a teleport (gate on the `blinked` event) — a 7.5 m position jump would otherwise spin the legs a full cycle — and `speed` carries forward one frame across the same event rather than being finite‑differenced, or the octopus plays one frame of full sprint at 225 m/s.

Two known asymmetries between the bodies, to be stated rather than discovered:

- **The gorilla's `pose()` gates its entire locomotion block behind `if (!action)`.** With any action set, the legs freeze while the root keeps translating — so it advances 0.44 m through a smash wind‑up with rigid legs. The octopus composites locomotion additively and does not have this. Mitigation: for the gorilla only, when an action is playing and `|v| > IDLE`, call `pose()` twice (once with the action, once with `action:null` plus speed/stride) and blend the resulting joint transforms, legs from the locomotion pass. `pose()` is stateless and costs ~0.01 ms, so two passes are affordable.
- **Knockback moonwalk.** Speed derived from `|Δpos|` is unsigned, so a body flung backwards at 6 m/s plays a full forward gait while sliding backwards. Project onto facing: when `dot(v, forward) < 0`, scale `speed` by that dot (or zero it) and let the `hit` pose carry the motion.

### 8.5 Grounding

**Defect (measured).** The shipped viewer lifts each root by a constant `−box.min.y` sampled at the **rest pose**. Across the actual pose space:

| body | worst min.y | at | rest‑derived lift | net |
|---|---|---|---|---|
| gorilla | **−1.674 m** | `die` @ phase 1 | +0.014 | **buried 1.66 m** |
| octopus | −0.588 m | `die` @ phase 1 | +0.089 | **buried 0.50 m** |

The gorilla is buried deeper than it is tall, and it happens at `die` — which holds forever, under a kill cam, at the exact moment a reviewer forms a score.

**Fix.** Build a ground table at load: sample `Box3.min.y` over 16 phase bins × every action × 8 speed bins (~180 evaluations, 80–100 ms, run behind the loading screen), then per frame `root.position.y = max(simY, −sample(action, phase, speed))`. **Clamp upward only** — the jump legitimately leaves the ground and the octopus legitimately rides above it, and pulling down would cancel both.

Add `rendered min.y ≥ −0.01 m` to §3.7's assertion set. It is a stronger invariant than any currently listed and it kills this class permanently.

Calibrate `STRIDE_BASE`/`STRIDE_SLOPE` with the marker test: drop a 0.2 m marker at the toe's world position every frame while the toe is in the lowest quartile of its travel. Drifting streak ⇒ wrong divisor; tight cluster ⇒ done.

### 8.6 Pose blending

`pose()` is stateless and rewrites every joint from a rest snapshot each call, so a crossfade is two calls and a lerp over the moving‑node set. Discover that set at load by diffing joint transforms across a probe sweep — **never hardcode it**; the viewer design's count of 58/101 is wrong (the true sets are larger), and merging or blending on a short set silently freezes real joints, a bug that reads as "the art is a bit stiff" and is very hard to trace.

### 8.7 Actions and the curtain

Actions are driven from `snapshot.act` + `actPhase` + `phase`, remapped per skill so the visual wind‑up occupies the same wall time as the mechanical one — when the gorilla's arms are over its head the cone has not landed, and when they come down it has. Charge maps to `block` during wind‑up, locomotion at clamped speed during the dash, `land` during recovery. `die` holds at phase 1; the gorilla's idle oscillators run unconditionally, so its pose clock must be **frozen at death** or the corpse keeps breathing and looking around.

The curtain (`CURTAIN_SECONDS`) keeps the world stepping after the result so the 3 s `die` pose actually plays — without it exactly one snapshot ever carries `act:'die'`, at phase ≈0.011, and every fight ends with a fighter standing bolt upright at 0 hp. **Already fixed in‑repo during this synthesis.**

Two events must be rendered that currently are not, and both are the *best* moments the sim produces:

- **`evaded`** — a laser that geometrically connects during i‑frames pushes a `beam` fx with `hit:true` and then deals nothing. Drawn naively that is a beam terminating on a chest with no damage, which reads as a bug, while the actual event — a well‑timed blink dodge — is invisible. Draw a white deflection burst and an EVADED tag, using `snapshot.inv`.
- **`missed{reason:'airborne'}`** — the jump‑dodge, *(measured)* 3.4× per match. The cone decal must visibly pass **under** the airborne body.

The cone decal is built from `SKILLS.smash.halfAngle` and the §2.8 reach formula — including the target's radius — or it is drawn a metre short and manufactures the exact confusion it exists to remove.

### 8.8 Camera

Sit on the perpendicular bisector of the pair so both bodies are in profile and the gap between them is the widest thing on screen — that gap *is* the fight. Two corrections to the shipped rule:

- **Anchor the azimuth.** The perpendicular is rigidly tied to the pair's axis, and a kite *is* the octopus circling the gorilla, so the axis sweeps 360° and the camera sweeps with it; damping lags it, it does not stop it. Blend `camDir` toward a fixed arena azimuth as separation shrinks, so melee is shot from a stable side and the obstacles stay put in frame.
- **On occlusion, orbit sideways toward a clear azimuth**, never dolly in. Six 3.2 m blocks at an 18–28° elevation will otherwise trigger constantly and pump the shot in and out.

Roll is always zero. Distance is sized to the **pair**, not to the arena — from far enough to hold the whole floor a fighter is twenty pixels and its wind‑up is invisible.

### 8.9 Lighting

`scene.environment` from `RoomEnvironment` via `PMREMGenerator` is **mandatory**: both bodies are metallic up to 0.86 and with no IBL that integrates to near‑black, which is the single largest "why does it look terrible" cause. Add a cool rim light — on a light floor it is the whole trick for separating two silhouettes from the ground. Re‑fit the key light's orthographic shadow frustum to the pair every frame; a fixed 40 m frustum wastes 90 % of the map.

Contact shadow per body: one radial‑gradient quad at the collider radius, shrinking and fading with height. One draw call each, it does more for grounding than the shadow map, and it is what makes §8.3's arm overhang read as arms rather than as a collision bug.

---

## 9. Measurement

### 9.1 The runner

`node tools/arena.mjs --rounds=N --tag=<t>` or `--octopus=<t> --gorilla=<t>`, seeds `1000+round`. Three sections, because one good‑looking fight proves nothing:

- **BALANCE** — win rate, draws, length distribution, timeout rate. This is what the constants are tuned against.
- **EXECUTION** — per‑skill uses, hit rate, miss reasons, ready‑and‑idle, faults, think cost, distance.
- **ENGAGEMENT** — the question the project is about. Two entries are built specifically to catch a fake: `telegraphResponse` (of all windows in which the opponent was visibly winding up, in how many did this brain change intent — a fixed routine scores its own base rate) and `enemyCorrelation` (mean dot of chosen move direction with the direction away from the opponent — a brain ignoring the opponent scores ~0 no matter how much it moves; it cannot be faked by moving a lot).

**n ≥ 200 for any win‑rate claim.** SE at n=200 is 3.5 %; at n=20 it is 11 % and the day is spent chasing noise. A 5‑point difference needs n=400.

Fields to add: `chargeOutcome {hit, wall, evaded, timeout}` (§4.5's diagnosis was only possible by reconstructing this from the log), `refused` counts by reason (§5.3), `maxPairOverlap` (§3.7), and `stale` on every row whose brain failed the §7.4 hash check.

### 9.2 The measured state, and how balance is owned

*(all measured at config fingerprint `05f9dffd03bd1693`, n=200 per cell)*

| octopus | gorilla | octopus win | median | melee uptime | timeouts |
|---|---|---|---|---|---|
| **stub** | **stub** | **50.5 %** | 17.6 s | 25.5 % | 0.0 % |
| v1 | v1 | 9.0 % | — | — | 0.0 % |

The control pair is balanced. The generated pair reads 9 % — **and that number measures staleness, not balance**: both v1 brains fail the §7.4 prompt‑hash check, so they are fighting a world they were told the wrong rules for. The stubs assume almost nothing numeric, which is precisely what a control is for.

This is the whole justification for the ownership rule:

> **Balance is tuned against the stubs, at n ≥ 200, and validated across the full cross‑matrix. Generated brains get a vote in the score but never the deciding one, and a stale brain gets no vote at all.**

Tuning against the generated pair tunes the constants to compensate for two particular programs, which is not a property of the game and does not survive the next generation. `tools/balance.mjs` already implements this weighting (0.6 stub / 0.4 generated) and scores fairness + pacing + shape + decisiveness + dead‑skills together, because a 50/50 win rate is trivially achievable by making both fighters harmless and a fight nobody can lose is not a fight.

**The cross‑matrix is mandatory before any conclusion.** *(measured, older config)* the four cells spanned 5 %–57 % — an enormous brain‑attributable spread that a mirror‑match number alone would have hidden completely. It is also the project's best result: **the brains, not the constants, decide these fights.**

Immediate consequence: **regenerate `brains/v1` against the current prompt before interpreting any brain metric.** Then re‑run the matrix.

### 9.3 The falsification set

Three results would kill the concept, each cheap and each measurable before the viewer is finished:

1. **Verb/field vocabulary identical across same‑fighter brains** — one model writes one mind, and "LLM‑written brains" is a label on a constant. *(Currently: verb‑profile similarity between the two fighters is 0.341–0.514, i.e. clearly distinct.)*
2. **A brain's trajectory unchanged when the opponent channel is frozen** — the brains are open loops and the fight is choreography. Pin `p.enemy`, drop every opponent‑sourced event, and freeze `p.self.hp`, then report the three sensitivities separately; pinning `p.enemy` alone would score a purely event‑driven brain as blind, which is the most sophisticated shape available.
3. **Win rate flat across same‑fighter brains** — the constants decide every match and the brain is decoration. Test the null directly with a permutation test over brain identity and report the p‑value, never the raw spread: at n=20 the expected range of five identical brains is ~26 points, so a 15‑point bar is satisfied by the null hypothesis.

### 9.4 Required unit tests

Beyond §6.5's five sync tests: a smash‑reach boundary sweep asserting `connects ⟺ dist ≤ range + rA + rB` (this number is otherwise a coincidence of a formula stated in no document); a spawn assertion that both fighters face each other at t=0; the determinism byte‑compare; and a startup self‑test that injects a `while(true){}` brain and asserts the match survives with a timeout counted — that is the one failure mode invisible to watching, and a 200‑round sweep that silently hangs on round 137 costs more than everything else combined.

### 9.5 Open experiments

Named, unmeasured, and not asserted anywhere above:

- **Charge whiff cost.** Under the older config 106 of 125 charges ended on a wall at no cost beyond the cooldown. Test self‑damage and/or a short stun on wall contact under the current numbers, scoring on `chargeOutcome` and win rate.
- **Pacing.** Control‑pair median is 17.6 s against a 22–45 s target band. Test a uniform hp scale.
- **Melee uptime on generated brains.** The control pair holds 25.5 %; the (stale) generated pair sat at 55 %. Re‑measure after regeneration before treating it as a constants problem — it may be a brain policy, in which case the honest response is to report it, not to tune it away.

---

## 10. Risks and mitigations

**10.1 The prompt lies to the model.** The highest‑severity failure in the project and the only one that is currently *live*: RULE 2 asserts the opposite of what the host does, and both shipped brains are hash‑stale. Mitigation: §6.3 rewrite, §6.5's five layers, §7.4's load‑time refusal. Nobody sees a bug; they see a bad brain — which is why structure, not discipline, has to solve it.

**10.2 The constants decide the fight, not the brains.** PLAN.md's own stated fear. Mitigation: the cross‑matrix (§9.2), stub‑weighted tuning, and falsification test 3. *Current evidence is reassuring* — a 5 %–57 % spread across pairings — but it is confounded by staleness and must be re‑measured.

**10.3 Stalemate.** Two defences that were claimed and do not exist: arena geometry *(measured: the longest obstacle‑free lane is 47.3 m, longer than the arena is wide)*, and the assumption that wall‑sliding suffices *(the recorded first stub match ended with both fighters pressed against the centre blocks for 89 of 90 seconds)*. The defences that **do** exist: `nav.js`; the hp‑fraction timeout, which makes pure evasion losing for whoever is behind; and `p.timeLeft`, which lets a brain see the clock. *(measured: 0.0 % timeouts across every run in this synthesis.)* Detection: `timeoutRate`, plus an obstacle‑proximity dwell metric with a ceiling and an arena‑coverage metric with a floor — "high range discipline + high obstacle dwell + low first‑blood" is the pillar‑dance signature, and every existing intelligence metric would score it as excellent.

**10.4 The sim→pose bridge.** Where the concept fails quietly: the sim is correct and it still looks broken. Six named defects, five of them measured, all specified in §8: the zero‑velocity dash, the inverted silhouette scale, the unreachable gallop, the buried corpse, the gorilla's action‑gated locomotion, the knockback moonwalk. Mitigation: §3.7's rendered‑`min.y` assertion, the marker calibration, and the rule that the viewer **never runs the sim** — it interpolates snapshots only, or replay is a lie.

**10.5 A verb that silently no‑ops.** `startSkill` refuses silently and `api.use` returns true for a queued order; a brain that cannot tell its call failed loops on it forever, on camera. Mitigation: §5.3's `refused` event, delivered to the brain as well as the log, and the §6.4 sentence stating what the return value means.

**10.6 Perception that lies under load.** A shared 64‑call budget turns `los()` into `false` and `ready()` into `false` for a brain that thinks carefully — *(measured)* the generated octopus issues 27.9 `ray` calls per think. Mitigation: split budgets, and query exhaustion raises a fault rather than returning a value.

**10.7 Tactics leaking in.** Four doors: the prompt (guarded by §6.1 and the digit test), the api surface (guarded by §5.1's naming rule), the repair turn (guarded by §7.3's three‑things‑only rule), and the task line (guarded by fixing it verbatim and stamping it). The fifth door is a fallback AI, which §5.7 closes permanently.

**10.8 Concurrent edits.** This spec was written while `sim.js`, `config.js` and `prompt.js` were being edited by another session — the control‑pair win rate moved from 15 % to 50.5 % mid‑measurement. Mitigation: every measurement is pinned to a config fingerprint, and `tools/balance.mjs` already applies candidate tunings through `AIRENA_TUNING` rather than by editing source, so sweeps never race the working tree. Any number in §9 must be re‑taken if the fingerprint moves.

---

### Appendix — measurement provenance

All figures marked *(measured)* were produced against `/Users/boozybats/Public/Repos/work/Airena` at config fingerprint `05f9dffd03bd1693`, via `tools/arena.mjs` at n = 200 unless stated, plus five scratch harnesses (targeted balance sweep, charge‑outcome reconstruction, dash‑steering variants on a patched copy, sandbox surface probe, body/pose‑space measurement). Scratch copies were used for every experiment requiring a code change; **the repository working tree was not modified by this synthesis.** Scratch artefacts are at `/private/tmp/claude-501/-Users-boozybats-Public-Repos-work-Airena/af40a22a-6715-42de-92f9-4745e99a7601/scratchpad/`.