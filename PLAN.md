# Airena — concept plan

> Recovered from the Claude Code session transcript
> `~/.claude/projects/-Users-boozybats-Public-Repos-work-Airena/277395ff-971d-4e03-add3-0f26d6fd17c1.jsonl`
> (25 August 2026, 13:37–13:46). The planning conversation was held in Russian and ended
> on the offer to write it into this file; this document is the English rendering of it.
> The verbatim Russian original is still in that transcript if a wording ever needs checking.

---

## 1. The brief

Planning stage only. We need a minimal — an absolutely most-minimal — concept that shows how well
this is going to work.

There is an arena: just a white square, a plain plane. On one side stands an LLM-generated creature,
on the other side another one. The creatures have skills — melee hits, shots, AOE and so on. Two
simple skills each.

The first is a ranged fighter: something robot-like that fires a laser, and can jump or teleport.
The second is melee: runs fast, hits up close.

An LLM writes the creatures' brains, and that logic runs in a V8 isolate on the server. At this stage
the brains may be written ahead of time. The LLM has to know what the core is — the set of base
functions: `move`, `scan`, `raycast`, enemy lookup, jump, shoot. Everything essential for surviving
and for making the fight interesting to watch.

The LLM gets that set of functions and one single objective — kill the opponent and survive. That's
all. Whatever it writes is what we run.

`../autoage` is an existing project with a lot of relevant ideas in it: how skills are assembled, how
the brain works, plus already-generated creatures and generation over OAuth on the Claude
subscription. The fighters are gorilla V8 and octopus V8.

No balance work yet. The end result: a flat, completely empty arena with two creatures on opposite
sides. The octopus fires a laser, jumps, teleports. The gorilla runs fast and hits in melee. The
gorilla charges straight in trying to kill; the octopus runs, kites and shoots. And they can actually
kill each other. That is the whole thing to verify.

---

## 2. Decisions taken

| question | decision |
|---|---|
| Which model writes the brains (the Gemini CLI is not installed on this machine) | **Claude only, no Gemini.** The model-vs-model comparison is dropped; what gets tested instead is "one model, two fighters, two prompts — does it write two different brains" |
| Sandbox: `isolated-vm` / `node:vm` / QuickJS | **`node:vm` plus a timeout.** Zero dependencies, ~120 lines, works today; a guard against a crash, not against an attacker |
| Relationship to Autoage | **None.** Airena is written from scratch; the only real dependency is three.js. The two bodies move over as **art assets** — those files import nothing from Autoage, only three.js and TSL |

---

## 3. The plan

### What the decisions changed

**No link to Autoage.** What we take from it is *decisions*, not code: the `think(p, api)` contract,
the idea that a pose is a function of the situation rather than the name of a clip, the
"vocabulary, not tactics" rule for the prompt, and the already-documented sharp edges of `claude -p`.

One clarification so we don't drift apart: **the two bodies are assets, not software.**
`bench-v8-gorilla.js` and `bench-v8-octopus.js` are self-contained `build(THREE, TSL)` functions.
Two files move over as art; all the code around them is ours. *(Open question: if the bodies should
be generated from scratch instead, that changes S0.)*

**Claude only.** What remains is the thing actually worth measuring: one model, two fighters, two
prompts — does it write two different brains? That is measurable structurally: which verbs and which
perception fields each source actually touches. If both brains come out the same, that is a result,
and a bad one.

**node:vm**, and it simplifies more than it looks:

- **No fuel system at all.** In Autoage, fuel is a *gameplay* budget tied to the ability ladder.
  Airena has no ladder, and a hung brain is handled by the timeout. That removes an entire subsystem
  along with its source instrumentation.
- **No trigonometry table.** `T.sin/cos/atan2` existed because the code ran on two engines (QuickJS
  and V8) and the last bits disagreed. We have one V8 — on the server and in headless alike. So
  `Math` is allowed in full, except `Math.random` and `Date`: those two break reproducibility, not
  portability. We tell the model this **with the reason** — a ban without a reason makes it write ES3.
- **Objects pass through as-is.** Same heap, no `ExternalCopy` per tick, perception is built as an
  ordinary object literal.

Being honest about the boundary: `node:vm` is protection against a crash, not against an adversary.
From inside the context you can reach the host realm through the prototype of anything we hand in.
So we pass only freshly built flat data plus an api object of bound functions, and we don't pretend
this is a sandbox for someone else's code. For a concept where the code is written by your own
subscription from your own prompt, that level is exactly right.

### Layout

```
packages/core/       the arena: types, 20 Hz step, skills, perceive, apply, rng
packages/brain/      host.ts — vm.createContext, compilation, a tick with a timeout
apps/server/         match.ts (the match), ws.ts (snapshots), cli.ts (headless)
apps/viewer/         vite + three/webgpu: the plane, two bodies, HUD
bodies/              gorilla.js, octopus.js        # assets
brains/              gorilla.js, octopus.js + .json recording the generation
tools/               brainforge.mjs, arena.mjs
```

### Simulation

A 40×40 square at y=0, spawns at (0,0,±15). 20 Hz step, the brain thinks on every 4th one (5 Hz), a
move order lives for 12 steps. Seed → mulberry32; no `Date` and no `Math.random` anywhere. A match is
reproducible from `(seed, brainA, brainB)`.

**Core, for both:** `move`, `face`, `aim`, `jump`, `sprint`, `ready(skill)`, `use(skill)`, `ray`,
`rand`, `remember/recall`, `say`.

**Perception:** `self {pos,vel,yaw,hp,grounded,stamina,casting,cooldowns}`,
`enemy {pos,vel,dist,hp,radius,action}`, `projectiles`, `hits`, `arena`, `t/dt/mem`. No fog of war —
the concept is about fighting, not about searching.

### Skills — two each, plus the core

| fighter | skill | what it does | pose |
|---|---|---|---|
| Octopus | `laser` | 0.35 s cast, hitscan, 12 damage, 1.2 s cooldown, 18 m, needs line of sight | `fire` |
| Octopus | `blink` | 6 m teleport along `aim`, 4 s cooldown, 0.15 s of i-frames | `signal` |
| Gorilla | `smash` | 2.8 m / 100° cone, 26 damage, 0.3 s wind-up, 1.0 s cooldown | `attack` |
| Gorilla | `charge` | 12 m/s dash for 0.6 s, 18 damage plus knockback on contact, 5 s cooldown | `move-6` |

Gorilla 5.5 m/s / 220 hp, octopus 3.8 m/s / 140 hp. Both can jump.

### The sim→pose bridge

This is where the concept falls apart quietly, so it is spelled out. Both bodies implement all 15
one-shot actions and locomotion at six speeds — verified: `attack/fire/hit/jump/land/die/block/signal`
are present in both files. Per frame the client computes `speed = |vel| / bodyLength` (length via
`Box3` at load time); `stride` accumulates **by distance travelled, not by time** — otherwise the feet
skate; `turn` comes from smoothed angular velocity; `action/phase` come from server events. Positions
are interpolated between snapshots.

### The brain prompt

Five sections, ours, but following the Autoage principle: *a vocabulary, not a design.* Every line is
either a capability, or a constraint with its reason, or a fact about the world. No tactics, no
priorities, no "usually it's better to…". The brain has one goal: **kill your opponent and survive.**
Both fighters' numbers are generated from `skills.ts` and never retyped by hand — otherwise the prompt
lies one day, the model believes it, and a fighter dies of the discrepancy.

### How we know it works

Three artefacts, because one good-looking fight proves nothing: with asymmetric skills the outcome is
decided by the constants, not by the brains.

1. Live viewing in a browser tab.
2. `node tools/arena.mjs --rounds=100` — headless: win rate, match length, brain faults, a use counter
   per skill. If the gorilla takes 100/100 in 6 seconds, that shows up in 20 seconds instead of an
   hour of watching.
3. A replay of any of those fights in the viewer.

### Stages

- **S0** — set up the repo, drop in the two bodies, write the loader (`new Function` with
  `window/document/fetch` shadowed, measurement via `Box3`) and see the gorilla and the octopus simply
  **stand there and breathe** on the white square. An hour of work, and it tests the most fragile
  assumption in the plan.
- **S1** — core plus server plus viewer, with the brains being two hand-written ~20-line stubs. Two
  robots move and kill each other. **This already answers most of the question**, because what is
  being tested is the sim→pose→spectacle chain, not the quality of the LLM.
- **S2** — the stubs move into `vm`: timeout, faults, action limit, replay, headless runner.
- **S3** — `claude -p` writes both brains. We compare them against each other and against the stubs.
- **S4** — camera, HUD, a `say()` ticker, recording.

The order is this way because S0 and S1 can kill the concept cheaply, whereas S3 is the most expensive
stage and an entirely pointless one if S1 already looks bad.

---

## Appendix A. What Autoage gave us

Part of the first draft was superseded by the decisions in section 2; what survives is reference
material.

**The bodies are already written and proven.** `bench-v8-gorilla.js` (764 lines, Opus 5, 58 min) and
`bench-v8-octopus.js` (1009 lines). Both rendered from 7 angles in `captures/bench/v8/`. The contract:
`build(THREE, TSL) → THREE.Object3D` with `root.userData.pose(s)`.

**The key finding:** both bodies implement all 15 one-shot actions from the `anim.ts` catalogue —
`attack`, `fire`, `hit`, `block`, `jump`, `land`, `die`, `signal` … plus locomotion at 6 speeds
(0…6 body lengths per second) and the `turn-left/right`, `airborne`, `hurt` overlays. So the arena
**needs to draw nothing extra**: `fire` already covers the laser, `attack` the gorilla's hit,
`jump`/`land`/`airborne` the jump, and `die` ends with a body on the ground.

**The loader** — `apps/client/src/forge/sandbox.ts`, ~200 lines.

**The brain contract** — `packages/fabricator/src/brainPrompt.ts`: `think(p, api)`, the `V` and `T`
helpers, three rules, fuel, memory via `remember/recall`. It also holds an expensively bought
conclusion that applies directly here: "told what it can do and not what it is for, a model writes a
fighter."

**The LLM lane** — `tools/lane-cli.mjs` and `apps/server/src/world/claudeCli.ts`: `claude -p` as a
subprocess on the subscription. The sharp edges are already documented: `--tools ''` (not
`--allowedTools` — an allow-list permits, it does not restrict), `--effort` is mandatory, clear the
`CLAUDE_CODE_*` environment, and `is_error` is the only reliable failure signal.

**What we don't take:** the bake pipeline (GLB, clip sampling, colouring), the genome, the ability
ladder, the economy, the disc world, evolution, and the QuickJS host with its scaffolding. That is
~20k lines and the concept needs none of it. Consequence: **without bake**, a body is assembled
straight in the browser from `build()`.

---

## Open questions

The conversation ended here, on the line "or we can go over the skill numbers first — that is the one
place where I was guessing." So two things are still open:

1. **The skill numbers** — damage, cooldowns, HP, speeds. They are guessed, not derived.
2. **Whether to regenerate the bodies** instead of moving the two existing files over.
