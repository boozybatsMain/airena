# VFX plan: finish lightning and laser, then gravity, time, acid, radiation

Written 03.09.2026 for the next agent, after the founder reviewed the demo of the current lightning and laser (`docs/VFX-HANDOFF.md` has the history up to that demo), and revised the same day after four independent reviews against the code. This file is the work order. Read it top to bottom once, then work it in the order of §8. Repo docs and code comments are Russian; this plan and `docs/vfx-notes/` are English. Write your code comments in Russian, in the voice of the existing files (explain the *why*, cite measurements).

The founder's verdict on the 03.09 demo, in his words, compressed:

1. **The lightning bolt is wrong in kind, not in degree.** Today it is a chunk, a region in which lightning is rendered, and the chunk flies forward with the lightning inside it. Real lightning has a fixed origin. It does not fly as a whole; its branches extend forward on their own. To make a bolt, keep the origin fixed, let the discharge propagate forward, and let the tail end fade behind it.
2. **The shield is decorated, not built.** It reuses the lightning primitive as loose sticks glued on at random. Arcs must be woven into the shield's own surface. "This issue appears in many places."
3. **He wants to see dash, blink, jump and wall interact with each element**, not only the seven forms the modules draw today.
4. **Four new elements: radiation, gravity, acid, time.** Not every element needs every form. A time element may have no laser, no projectile and no damage at all; gravity may exist only for pull. Think about what each element is for; most of them exist to create diverse effects, not damage.
5. **Everything built follows one approach**: polished, visually thought through, judged in the real scene at broadcast distance.

Order of work: **A** lightning to done → **B** laser and void to done → **C** dash, blink, jump, wall, status per element → **D** the four new elements. Do not start D before A and B pass their acceptance.

---

## 0. Read this first

### 0.1 The loop (never skip a step)

1. Read the form's specification in this file, then `docs/vfx-notes/LIGHTNING-BRIEF.md` (goal, measured reference, hard constraints, capture procedure) and `docs/vfx-notes/PRIMITIVE-NOTES.md` (the lightning primitive's API with the numbers behind it, refreshed after every lightning round). For the laser also `docs/vfx-notes/LASER-BRIEF.md`.
2. Change code for **one form at a time**.
3. Capture in the real combat scene: `tools/vfxshot-lock.sh --port=8823 --el=<element> --kind=<form> --moments=<seconds> --cams=side,broadcast --out=$PWD/reports/vfx/<element>-<form>/i<N>`. The tool splits close moments into separate casts by itself (see 0.3); still check `actual` against `moment` in the produced `index.json` and re-shoot if a frame drifted more than 0.08 s.
4. Look at every PNG with the Read tool. Crop and zoom with `python3 docs/vfx-notes/metrics.py crop <png> x0,y0,x1,y1 4 out.png`. Count pixels where this plan gives a number.
5. Write down what is wrong against the specification, fix, and repeat. Four capture-and-look iterations per form is the minimum; the beam took eleven.
6. Final for the form: all four cameras, then the smoke run of every form of that element (`--kind=cone,zone,self,beam,bolt,lob,impact,charge,dash,blink,jump,wall,status --cams=broadcast --moments=0.3`) with `errors` empty in `index.json` **and the console read** (a thrown error inside a module is swallowed by `Vfx.play` as a `console.warn` and the stock silhouette draws instead — the stand tag then still says "stock"; `index.json` → `errors` catches only errors, so read the browser console after the first cast of every form), then `node --check` on every file you touched, `node tools/checkscope.mjs`, and a commit (Russian message, the convention of the previous sessions: one commit per finished form, e.g. `Молния: болт — разряд с неподвижным началом`).

A change you did not look at is not done. "It compiles" is not a state of the work.

### 0.2 What "done" means for a form (the checklist you fill before committing)

- [ ] Reads at a glance as the element and the form from **broadcast** (26 m along the cast, the camera viewers see) and from **side** (26 m across it). Not pale, not grey, not a smudge.
- [ ] Keeps its shape and colour over the **white floor**: every stroke that must read on the floor has a normal-blended saturated jacket (the element's *floor colour*, §2 P3) under any white core.
- [ ] Follows the **grammar of a cast** (§2 P4): charge/muzzle → travel → impact → hold → decay → residue, or the specification says which beats this form skips and why.
- [ ] Obeys **P1** (fixed origin, propagation) and **P2** (woven into the surface it lives on). Freeze any frame and check both.
- [ ] Leaves a **persistent floor mark** (`kit.decal`, hold ~20 s) in the element's decal colour; no neutral grey pixels in it.
- [ ] Is **size-parametric**: counts come from `kit.footprint(e, ctx)` and `kit.countFor(base, fp.area, kit.REF_AREA.<form>, cap)`, body sizes from `ctx.bodyShape(who)` (§7.1), never constants; the same code drawn with `range`/`r`/`len` halved or doubled still reads.
- [ ] Is **deterministic**: all randomness from `mulberry(seedOf(e))`; two casts with the same record look the same.
- [ ] **60 fps** in `index.json` of the final capture, never below 20 with three simultaneous casts (cast it three times in a row on the stand and read the fps in the panel footer); zero console errors and no `console.warn('vfx', …)`.
- [ ] The **other forms of the element still draw** (smoke run) and the other elements are untouched.
- [ ] Notes refreshed: what changed and the measured numbers, in the module's header comment and, for the lightning primitive, in `PRIMITIVE-NOTES.md`.

### 0.3 Tools

| What | Command | Notes |
|---|---|---|
| Dev viewer (main tree) | `PORT=8823 node src/server/index.js > /tmp/viewer-8823.log 2>&1 &` | Captures load the page fresh, saved files are live. `curl -s -o /dev/null -w '%{http_code}' http://localhost:8823/` must print 200. |
| Founder's stand | `http://localhost:8830/?vfx=1&stand=1` | Served from the worktree `.claude/worktrees/stand` (`cd .claude/worktrees/stand && PORT=8830 node src/server/index.js`; also `.claude/launch.json` → `stand`). One button per form per element, tags saying who draws it, four cameras, real scene, a "Bolt + hit" button that sends the sim's impact record 0.4 s after the bolt. **One-time, after the tooling commit of §8.1:** `git -C .claude/worktrees/stand checkout -- . && git -C .claude/worktrees/stand clean -f src/viewer && git -C .claude/worktrees/stand checkout -f --detach main` (the worktree carries local copies of the tooling until then; keep its `node_modules` symlink). **After each finished form:** `git -C .claude/worktrees/stand checkout -f --detach main`, so the founder sees the committed state, never a half-edited tree. If port 8830 is taken: `lsof -ti tcp:8830 \| xargs kill`. |
| Stills | `tools/vfxshot-lock.sh --port=<PORT> --el=<el> --kind=<form> --moments=0.06,0.12,0.38,0.8,1.5 --out=<abs dir>` | Runs under a GPU lock (one headless Chrome at a time). Moments closer than 0.45 s are shot as separate casts automatically (`casts` in `index.json`). Cameras `broadcast,side,low,top`; `--cams=` restricts. |
| Motion | `tools/vfxlock.sh node tools/vfxclip.mjs --port=<PORT> --el=<el> --kind=<form> --cam=side --secs=2.4 --out=<abs dir>` | One cast as a 60 fps screencast → mp4 (ffmpeg) and animated webp (PIL); `<name>.json` has `castOffsetInClip` (call it `lead`). `ffmpeg -ss <lead + t> -i <mp4> -frames:v 1 f.png` extracts the frame at `t` seconds after the cast. |
| Pixel counts | `python3 docs/vfx-notes/metrics.py box <png> x0,y0,x1,y1` → `hot` (≥248 all channels), `blue60` (judges' deep-blue), `satPx`; `... path <png> hx,hy tx,ty half` → blue marks per sixth of a segment; `... extent <png> hx,hy tx,ty half` → reach fraction | Written for lightning; for other elements use `satPx` with your own hue thresholds, and write the thresholds in the module header. |
| Gates | `node tools/checkscope.mjs` (forbidden words in the player bundle), `node tools/checkgrammar.mjs` (palettes ΔE ≥ 10, every atom has an impact signature, evil inputs), `node tools/checkspec.mjs` (numbers in the root `SPEC.md` against the code), `npm test` (runs them all, `tools/suite.mjs`) | Run all four before any commit that touches `src/skills/registry.js`, `kit.js`, `vfx.js`, `effects.js` or `main.js`. |
| Reference frames | `reports/vfx/reference/ref-storm-{120,380,800,1500}.png`, `ref-nova-{150,450,900,1600}.png`, crops in `reports/vfx/reference-crops/` | Storm Lance and Nova Beam from the founder's sandbox, Path of Exile 2 level. There is no reference for the new elements: this plan is their reference. |
| Demo page of 03.09 | `reports/vfx/storm-nova-bench.html` (open through `node preview/server.mjs` → `http://localhost:8899/reports/vfx/storm-nova-bench.html`) | Reference vs current at matching moments, clips, the defect lists. The founder reads this format well; rebuild one per checkpoint (§8). |

Ports: 8823 main viewer, 8830 founder's stand, 8840–8849 free for worktree viewers, 8899 preview. `lsof -ti tcp:<port> | xargs kill` frees a port.

### 0.4 Hard constraints (all enforced by the codebase; the full list with reasons is in `LIGHTNING-BRIEF.md` "Hard constraints")

TSL only, no GLSL, no `ShaderMaterial`. Node materials only via `pooled(key, make, ring)`; a fresh node material costs 12–22 ms on the spawn frame. Shared geometry marked `shared()`. One `InstancedInterleavedBuffer` per instanced field (WebGPU allows 8 vertex buffers). Bloom only by `markGlow(material, mask)`, never by threshold; **the floor must never bloom**. The floor is white and HDR-bright: additive layers vanish on it. No `Math.random`; `mulberry(seedOf(e))`. Densities from `kit.footprint(e, ctx)` (gives `area`, `len`, `radius`, `dir`) and `kit.countFor(base, area, kit.REF_AREA.<cone|zone|beam|impact|self>, cap)` (`kit.js:74`; there is no `REF`). Four pooled lights — `LIGHT_POOL = 4` in `vfx.js` is the source of truth (the constructor comment still says two and is stale); `vfx.flashLight` is round-robin over them with quadratic decay, so a "held" light must be re-flashed every ~0.3 s (`heldLight` in `arc/common.js` only repositions it); never add lights. No new npm dependencies. `tools/checkscope.mjs` clean. Module contract `(vfx, e, P, ctx) => boolean`; `P = [highlight, body, deep]` colours from the registry palette; `ctx.bodyPos(who)` and `ctx.bodyShape(who)` (§7.1) may be null.

### 0.5 Rules for you

- Copy the proven recipes before inventing: `arc/beam.js` (after round 2) is the quality bar for lightning, `ice.js` for a shell and a beam, `fire.js` for smoke, embers and heat haze, `kit.js` for bursts, shockwaves, decals, sparks. Every new element in §6 is specified in terms of these. Never import one element module from another (copy the 20 lines instead); the arc files are being edited by the lightning rounds.
- Do not change a shared file (`vfx.js`, `kit.js`, `core.js`, `main.js`, `src/core/effects.js`, `src/skills/registry.js`, the tools) except exactly as §7 says. Those edits are small and listed with their code.
- When a look is wrong and you do not know why, do not guess three times: capture the side and low cameras, crop at 4×, and compare with the numbers in the specification (widths in metres, alpha, colour). Most "it looks weak" problems are a jacket that is too transparent or a core that is not HDR.
- The plan's prose sometimes says "polish" or "reads": the number next to it is the acceptance, the word is only the direction. Where a number is missing, take the nearest one from the same form of the beam (`PRIMITIVE-NOTES.md`) and write in the module header which one you took.
- Keep a change log in the module header: date, what changed, the measured number that justified it.
- Report honestly in `docs/VFX-HANDOFF.md` at the end of every session: what passed which check, what did not, with paths to frames.

---

## 1. State at handoff (03.09)

### 1.1 What draws what today

Forms are the `kind` of a `world.fx` record (`src/core/deliver.js`, `effects.js`); the viewer dispatches them in `Vfx.play` (`src/viewer/vfx.js`): element module first, then the stock silhouette. `drawnBy(element, kind)` in `vfx.js` tells which; the stand shows it on every button.

| form | ru | arc (lightning) | kinetic / void | frost / ember |
|---|---|---|---|---|
| beam | луч | module `arc/beam.js` (round 2 done or in progress, see 1.2) | **laser** `laser.js` (round 2, see 1.2), old tube as fallback | module |
| cone | конус | module `arc/cone.js` | stock | module |
| zone | зона | module `arc/zone.js` | stock | module |
| self | щит | module `arc/self.js` — **rejected: glued sticks** | stock shell | module (ice dome is the accepted quality bar) |
| bolt | болт | module `arc/ball.js` — **rejected: flying chunk** | stock | module |
| lob | навес | module `arc/ball.js` — same defect | stock | module |
| impact | удар | module adds a flash, stock draws the atom signature | stock | module + stock |
| charge | заряд | module `arc/impact.js` | nothing | module |
| dash, blink, jump, wall, status | рывок, блинк, прыжок, стена, статус | stock only | stock only | stock only |

Stock silhouettes (`vfx.js`: `dash` ribbon + sparks, `blink` two rings, `shell` sphere, `hop` dust ring + shadow, `wall` translucent plate, `status` per-atom signatures) are placeholders from before the VFX rework. The jump **shadow** is not an effect and must stay black for every element (it shows height; see the comment in `Vfx.hop`).

Two sim facts every form design must respect (found by the reviewers of this plan; do not design against them):

- **Dash and blink records play when the body is already at the end point.** `deliver.js` resolves a grammar dash inside one tick (atoms land, `me.x += ux·travel`, the record is written); `phasesOfDef` in `sim.js` gives grammar skills only wind-up and recover, no travel phase; the viewer interpolates between adjacent 1/30 s frames. The 15 m/s "dashSpeed" in `config.js` belongs to the hard-coded gorilla `charge`, which never writes a `dash` record. On the stand the body never moves at all. Every dash trail is therefore time-driven from the start point; nothing follows the body.
- **`pull` pulls toward the caster**, never toward a zone centre or an impact point (`effects.js`: `dx = src.x − to.x`), and a zone re-applies its atoms every 0.5 s (`ZONE_PERIOD`, `config.js`) pushing a fresh `impact` and fresh `status` records each time.

### 1.2 Quality today, measured

- Lightning beam before round 2: judged 34/38/40 of 60. Demo frames `reports/vfx/demo-arc/` (moments 0.12/0.38/0.8/1.5 s, four cameras), clips `reports/vfx/clips/arc-beam-{side,broadcast}.mp4`.
- Laser before round 2: judged 32/34 of 60. Demo frames `reports/vfx/demo-laser/`, `demo-void/`, clips `reports/vfx/clips/kinetic-beam-*.mp4`.
- **Round 2** of both was run on 03.09 by two judged loops (lightning: builder in the main tree + three visual judges + code reviewer per round, pass 46/60; laser: builder in a worktree + two judges + reviewer, pass 44/60). Where they ended is on disk, not in the handoff at HEAD: the last `reports/vfx/r2-arc/r<N>/` and `reports/vfx/r2-laser/r<N>/` that contain **both** `final/index.json` and `final.patch` (a directory with only `i<k>/` iterations is a round still running or interrupted; at the time of writing that is `r2-arc/r1` and `r2-laser/r1`, with `r2-laser/r2` in progress in `.claude/worktrees/wf_e58ec4ef-bbb-5`) — `final/` frames with `index.json`, `final.patch`, `others/` smoke frames, `clips/`, and for lightning the refreshed `docs/vfx-notes/PRIMITIVE-NOTES.md` (header: which round, its frames; §1: the measured column counts; §5: the timeline and what is done). Round 2.1 of the beam measured `hot 314 / blue60 1410` at 0.38 s and `581 / 2028` at 0.8 s in the column box, at 60 fps with no errors. `docs/VFX-HANDOFF.md` is refreshed at the end of the 03.09 session with the final scores; if it still says "the polish loop was stopped before round 2", trust the `r<N>` directories.
- Everything else (cone, zone, self, bolt, lob, impact, charge for arc; every stock form) has only been smoke-tested for console errors, never judged.

### 1.3 Uncommitted work at the time of writing (see §8.1 for the exact commits)

Tooling: `tools/vfxchrome.mjs`, `tools/vfxclip.mjs`, `tools/vfxlock.sh` (generic GPU lock; `vfxshot-lock.sh` delegates to it), `tools/vfxshot.mjs` (moment grouping into casts), `src/viewer/vfxfixture.js` (fighters' positions, four cameras, one `fxFor(kind, element, opts)` for every form; the single source for the capture tool and the stand), `src/viewer/vfxstand.js`, `drawnBy()` in `vfx.js`, the `stand` script tag in `src/viewer/index.html`, `vfxdemo.js` yields to the stand, `.claude/launch.json` → `stand`, `docs/vfx-notes/LIGHTNING-BRIEF.md` (capture notes), `docs/vfx-notes/polish.sh`, this plan. Lightning round 2 edits: `src/viewer/vfx/arc/{beam,common,field}.js` and `docs/vfx-notes/PRIMITIVE-NOTES.md`. Laser round 2: a patch under `reports/vfx/r2-laser/r<N>/final.patch` (it edits `laser.js` and the `laser` branch of `kit.js`'s `DecalField`), also as uncommitted changes in the loop's worktrees `.claude/worktrees/wf_e58ec4ef-bbb-<N>` (`r1/final.patch` is byte-identical to the diff of `wf_e58ec4ef-bbb-1` and applies to main; a later worktree carries the next round's unfinished diff — use only a round with a `final.patch`).

---

## 2. Principles (test every form against each one)

**P1 · Fixed origin, propagation.** Energy comes from a place and extends from it; nothing is carried as a finished chunk. A lightning bolt keeps its origin at the hand and grows toward the target; what the eye sees moving is the *lit window* sliding along a discharge that is fixed in space, with the tail fading behind the head. A dash's origin is the start point; a lobbed discharge climbs its own arc. Thrown *objects* (an acid flask, a gravity core, a canister) are not energy and may travel. *Test:* freeze any frame of a travelling effect and point at the source; the path from the source to the head must be there or visibly fading, and nothing of the effect must be "inside a moving box".

**P2 · Woven, not glued.** An effect that lives on a surface follows that surface. Arcs on a shield are geodesics on the shell, tangent to it, forming a lattice with cells **that persist between restrikes**; arcs on a victim crawl over the body's capsule; a wall's discharges live between its faces; a fence follows its circle. Nothing sticks out radially at random. *Test:* on the side camera every stroke on the shell is tangent to it; none crosses the interior; the cells are polygons; two frames 0.1 s apart show the same cells.

**P3 · The white floor.** The arena floor is `0xe9e6de` and brighter than 1.0 under the key light. Additive layers are invisible on it. Every element defines a **floor colour**: a dark, saturated, normal-blended colour that carries the shape on the floor (lightning jacket `P[2]·0.85`; lightning decals `BURN = (0, 0.45, 1.5)` — the round-2 beam measured that `P[2]` decals read as grey soot (61,94,136) and HDR blue does not; laser: darkened `P[2]`; the new elements: §6.1). White cores are HDR (≥ 2.5 in every channel) with a hard edge, drawn on top of the jacket, so pixels are either white or the floor colour, never pale. Anything that must read on the floor is emitted twice: white or `P[0]` into `vfx.glow` (bodies, walls), floor colour into `vfx.body` (see `spikes` in `arc/common.js`). A rim at 0.6–0.7 alpha in a light colour over the floor is pale and fails.

**P4 · Grammar of a cast.** charge (on the caster, in the wind-up) → muzzle (at `e.t`) → travel → impact → hold → decay → residue → persistent decal. Every form has the beats that make sense for it and the specification names the rest. Timings are seconds from the cast through `vfx.spawnMesh(obj, life, (obj, u) => ...)`.

**P5 · Size is a parameter; the replay is identical; materials are pooled.** `kit.footprint`/`kit.countFor` for every count, `ctx.bodyShape` for every body size; `mulberry(seedOf(e))` for every random number; `pooled()` for every node material; TSL only.

**P6 · A form exists only if it means something for the element.** §6 gives each new element a forms matrix of **deliveries**; deliveries not in it are refused by the grammar (§7.5). `impact`, `status`, `charge` and `wall` are not deliveries: `impact` comes with every hit, `status` with every status atom, `wall` through the `wall` atom on `self`/`zone`, and they reach every element. So every module ships `status` and at least the palette pass of `wall`; the stock silhouette draws whatever the module does not, in the element's palette.

**P7 · Judged by pixels at 26 m.** Broadcast and side cameras weigh double. Pale, grey, and "readable only in a crop" fail. Where this plan gives a count, the count is the acceptance; where it gives a box, use that box.

**P8 · The body is never hidden for more than half a second at the peak.** Ghost silhouettes and damage numbers draw over everything. An impact cloud at 0.7–0.9 alpha with radial falloff, never a solid ball over the victim.

**P9 · Residue is the last thing to fade and it is in the floor colour.** Reference: Storm Lance at 1.5 s is a fine, dense carpet of navy specks hugging the path; nothing grey, nothing letter-sized.

**P10 · One body, one status effect, one instance.** The sim pushes a `status` record on *every* application: a zone re-pushes burn/stun/root/blind/silence/boost/weaken every 0.5 s, and a `self`+`shield` cast pushes a `self` record and a `status: shield` record at the same `t`. Each module keeps `const STATUS = new Map()` keyed `${e.who}:${e.effect}`: on a record, if an entry is alive, set `entry.until = vfx.now + duration` and return `true` (spawn nothing); otherwise spawn the effect with a `spawnMesh(group, maxLife, …)` loop that hides the group once `vfx.now > entry.until` and deletes the entry. `duration = e.duration ?? EFFECTS[e.effect]?.duration ?? 1.5` (§7.7 adds `duration` to the records; registry: burn 4, stun 0.9, root 1.4, shield 5, blind 2.5, silence 2.2, boost 5, weaken 4; heal and cleanse carry no duration on the record and none in `EFFECTS` → one-shots of 0.6 s). Import: `import { EFFECTS } from '../../skills/registry.js'` from `src/viewer/vfx/<element>.js`, `'../../../skills/registry.js'` from `src/viewer/vfx/arc/*.js` (`vfx.js` itself uses `'../skills/registry.js'`); the depth matters because `tools/checkvfx.mjs` imports `vfx.js` in Node, where `..` is not clamped, and a wrong path breaks the whole viewer at load — `curl` the page and read the console after the edit. The `self` record draws only the *cast beat*; the lasting shell is opened by the `status` record that carries the duration.

---

## 3. Part A — Lightning (arc), form by form

The primitive: `src/viewer/vfx/arc/field.js` (`boltField`, `bundleSegs`, `strandSegs`, `polySegs`, `glyphSegs`, `crackleSegs`, three-layer ribbon material with uniforms `fade, hot, reach, cool`) and `arc/common.js` (`cloud` with `kind: 'orb' | 'impact'`, `hotCore`, `spikes`, `floorRing`, `restriker`, `stormBurst`, `arcSparks`, `muzzle`, `heldLight`, `radialArcs`, `orb` (always solid + shell; `set(fade, fill, r)` with `fill 0` = rim only), `halo`). Read `PRIMITIVE-NOTES.md` first; the API below is the one after round 2.1 and the notes win where they differ. Two facts about the material that shape everything below: `field.set({...})` destructures with defaults (`fade 1, hot 0, reach 1, cool 0`), so **always pass `hot: rs.tick(t)` or the restrike flash is zeroed**; and the emergence law fades every segment whose `u` lies within a window (0.18; 0.04 for the leader filament, `phase < 0.5`) below `reach`, so **nothing placed at `u ≈ reach` ever draws** (this is why the bolt's head is a second field, A2).

### A0 · Primitive additions (do these first, they serve every form below)

1. **`tail` uniform.** In `makeBoltMat`: `const hot = uniform(0), reach = uniform(1), cool = uniform(0), tail = uniform(0); m.userData.u = { fade, hot, reach, cool, tail };` then `const onTail = select(tail.lessThanEqual(0), float(1), smoothstep(tail, tail.add(0.08), cfg.w)); const base = fade.mul(on).mul(keep).mul(onTail);` — `keep` (the round-2.1 rule that hides a streak flying along the view axis) stays; `onTail` is only multiplied in. In `boltField.set`: `set({ fade = 1, hot = 0, reach = 1, cool = 0, tail = 0 })` and `u.tail.value = tail`. Default 0 = everything lit, so nothing else changes.
2. **`lift(t)` option** in `bundleSegs`: a function added to the y of every node at path fraction `t` (the lob's parabola). One line in `at(t, p, q)`: `... + (s.lift ? s.lift(t) : 0) ...`. `bundleSegs.at` already interpolates y linearly from `a.y` to `b.y` (`uy·L·t`), so `lift` is only the parabola.
3. **`surfaceSegs(s, rng, put)`**: filaments as random walks *on an ellipsoid surface* (shield, victim, wall). Item `{ surface: true, c: [x,y,z], r, ry, rz = r, n, links, link, width, bright, phase, rungs, offset = 0.03, seed, start = null, spin = 0, t = 0, minY = 0.06 }`. Guards first: `if (!(r > 0.2) || !(ry > 0.2) || !(rz > 0.2)) return;` (the projection divides by them). **Cells must persist:** per-filament generators `gi = mulberry((s.seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0)` choose the start point (or `start`), the initial heading and the zig-zag signs; the per-restrike `rng` only jitters every node by ±0.04 m and flips 25 % of the zig-zag signs; the initial heading angle gets `+ spin·t`. Per link: turn the heading by ±(50°–110°) around the local normal (side flips with probability 0.75), step `link·(0.7..1.3)`, re-project: `q = ((p − c) / (r, ry, rz)); q = normalize(q)·(1 + offset); p = c + q·(r, ry, rz)`, `y = max(minY, y)`. `links` 4–8. Rungs between filament nodes closer than `0.35·r`, mid-kink, width ×0.6 (reuse the rung code of `bundleSegs`), recomputed every strike (they may flicker; the cells do not). Add to `field.write`'s dispatch (`else if (s.surface) surfaceSegs(s, r, put)`). Helpers in `arc/util.js`:

```js
/* Касательная к поверхности в точке с нормалью nrm: случайный вектор минус его проекция на нормаль. */
export function tangent(rng, nrm) {
  let vx = rng() * 2 - 1, vy = rng() * 2 - 1, vz = rng() * 2 - 1;
  const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
  const nx = nrm[0] / nl, ny = nrm[1] / nl, nz = nrm[2] / nl;
  const d = vx * nx + vy * ny + vz * nz;
  vx -= nx * d; vy -= ny * d; vz -= nz * d;
  const l = Math.hypot(vx, vy, vz) || 1;
  return [vx / l, vy / l, vz / l];
}
/* Поворот Родрига вектора v вокруг оси nrm на угол a. */
export function rotateAroundNormal(v, nrm, a) {
  const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
  const nx = nrm[0] / nl, ny = nrm[1] / nl, nz = nrm[2] / nl;
  const c = Math.cos(a), s = Math.sin(a), d = (1 - c) * (v[0] * nx + v[1] * ny + v[2] * nz);
  return [v[0] * c + (ny * v[2] - nz * v[1]) * s + nx * d,
          v[1] * c + (nz * v[0] - nx * v[2]) * s + ny * d,
          v[2] * c + (nx * v[1] - ny * v[0]) * s + nz * d];
}
```
   The local normal at `p` on the ellipsoid is `((p − c) / (r², ry², rz²))` normalised.
4. **`BURN`** moves from `arc/beam.js` to `arc/util.js` (`export const BURN = new THREE.Color(0.0, 0.45, 1.5)`); every arc decal below uses `tint: BURN`.
5. **The free field** (used by A2, A3, A9 dash): a second `boltField` with `set({ reach: 1, tail: 0, hot })` for everything that must not obey the window — the head knot and its branches, and the floor glyph trail — rewritten every restrike; see A2. A field costs one of six pooled material sets per palette (`boltMat`, ring 6): keep ≤ 2 fields per cast. If the three-cast test of §0.2 shows a bolt's lit window jumping to another cast's, raise the ring to `pooled(…, 9)` in `boltMat` (one number in `field.js`, allowed) and write the measurement in `PRIMITIVE-NOTES.md` §2.

Write these with the same comment voice as `field.js` and add them to `PRIMITIVE-NOTES.md` §2 with their numbers.

### A1 · Beam (round 2)

The list the round-2 loop worked from (judges' order): bundle silhouette (jacket ~3–4× core with soft falloff, floor visible between cells, widths scale with the cone), kink character (0.3–0.6 m straight links, 30–60° turns, one sub-kink level), emergence (full length by ~0.10 s, ragged front, one bright leader), cast orb (additive HDR bluish-white with a blue rim, never grey), impact cloud (0.7–0.9 alpha, target visible), spikes and side streaks readable on the floor, residue cooling from 0.6–0.7 s to navy with small dense marks near the axis, floor ring as a thin white core with a ≤ 0.15 m blue edge, no grey decal dirt, brightness ramp along the path, hold full power to ~0.9 s.

Acceptance: at 0.38 s broadcast column box (740,395)–(850,505): `hot > 300` and `blue60 ≥ 1400`; at 0.8 s the same box `hot > 400` and `blue60 ≥ 1900` (round 2.1 measured 314/1410 and 581/2028; **do not raise `blue60` by widening the jacket** — `LAYER.jacket` stays at 4.0 with the soft profile: the old "2000 at 0.3 s" was measured on the fused sleeve the judges rejected). From the side the bundle shows separate filaments with floor between them; at 1.5 s the residue counts per sixth of the path from the top camera are all > 150 and no sixth is below 40 % of the max; the judges' mean ≥ 46/60. The remaining work is the items of this list that `PRIMITIVE-NOTES.md` §5 does not mark as measured and done, plus the last round's `mustFix` if `docs/VFX-HANDOFF.md` lists it (the judges' lists lived in the loop's scratchpad; if the handoff has none, do not look for one).

### A2 · Bolt — rewrite (P1)

Today (`arc/ball.js`): an orb with arcs on it flies from the hand along `e.h` for `range`, with a strand trail behind it and ground arcs under it. Delete that design.

**Design.** A discharge fixed in space from the hand `S` to the end `E`, regenerated every restrike, of which only a sliding window is lit; a separate head field draws the leader tip and its branches.

- Records: `{ kind: 'bolt', x, z, h, range, speed }` from the sim (`range` already includes the `range` channel multiplier). `S = [x + ux·0.7, 1.1, z + uz·0.7]`, `E = [S.x + ux·range, 1.1, S.z + uz·range]`, `len = range`, `travel = range / speed` (no cap: the sim's projectile lives exactly that long, `deliver.js` `life: range / speed`), `head(t) = clamp01(t / travel)`.
- Lit window: `W = clamp(0.22·speed, 3, 6)` metres; `tail(t) = max(0, head(t) − W / len)`. Every frame: `field.set({ fade: 1, hot: rs.tick(t), reach: head + 0.001, tail })`. The origin at the hand is lit for the first `W / speed` seconds, then the tail leaves it (the founder's "tail end fades away").
- Bundle: `{ bundle: true, a: S, b: E, n: clamp(round(4 + len·0.5), 6, 10), r0: 0.05, r1: 0.35, step: 0.4, width: 0.021, heroes: 2, rungs: 0.6, stubs: 0.5, tangle: 0, bend: 0.03 }`; restrike 45 ms with the hot flash; the whole polyline changes every restrike but only the window is visible, so the eye reads a living discharge crawling forward. Main field `boltField(vfx, P, 700)` (bundle ≈ 300 + rungs and stubs ≈ 40 + tangle).
- **Free field** (`headF = boltField(vfx, P, 1100)`, `headF.set({ reach: 1, tail: 0, hot: rsHead.tick(t) })` every frame): its restriker rewrites, every 45 ms, `[...leaderStrands, knot, ...marks alive now]`. Leader strands from `H = S + dir·len·head(t)`: 2–3 `{ a: H, b: H + rot(dir, ±(30°..60°) in the horizontal plane)·(0.5..1.2) + [0, (rng − 0.5)·0.6, 0], width: 0.018, bright: 0.9, jag: 0.2, branches: 1, minY: 0.1, phase: 500 + i }` ending in space; a knot `{ bundle: true, a: H − dir·0.4, b: H + dir·0.15, n: 4, r0: 0.05, r1: 0.12, width: 0.021, bright: 1.15, tangle: 0, phase: 0 }` (`phase 0` only marks the hero filament for `bundleSegs`; the leader front and tip boost of `makeBoltMat` are off in this field because `reach = 1` — the knot's brightness comes from four overlapping filaments, `bright 1.15` and the hot flash). On arrival (`head ≥ 1`) the knot becomes the impact tangle (`tangle: 1` for two restrikes) and the field dies with the main one.
- Muzzle: `cloud(vfx, P, { x: S.x, y: 1.1, z: S.z, kind: 'orb', r0: 0.2, r1: 0.45, grow: 0.06, hold: 0.10, life: 0.22, seed })`, `hotCore r 0.15 life 0.25`, 12 `kit.sparks` in a cone, `flashLight 12` for 0.2 s.
- Floor: glyph marks live in the **free field** (the main field's `tail` window would hide every mark behind the tail): precompute `count = clamp(round(14·len), 30, 160)` marks with `f = rng` uniform along the path, lateral ±0.6 m, `born = f·travel + 0.02`, `life 0.6–1.0 s`, own `g = mulberry(seed ^ (i + 1))` (the shape persists between rewrites, as `beam.js` does with `rng: g`); each restrike pushes the marks with `t ≥ born && t < born + life` as `{ glyph: true, x, z, y: 0.05, dot, links, len, dir, width: 0.0055, bright: −(1 − 0.4·(t − born)/life), phase: 700 + i, rng: g, u: 1 }` (`bright` magnitude 1.0 → 0.6 is fresh → navy, §1 of the notes). This trail on the floor is the bolt's wake.
- Light: `heldLight(vfx, H[0], 1.2, H[2], P[1], 10, 0.4, 7)` moved to the head each frame, re-called every 0.3 s.
- Impact (§7.2 tells the bolt where and when it hit; `state.hit = { x, z, t, blocked }`): `tangle` on the free field's knot, `spikes` 40 (white+blue), `floorRing 0.3 → 2.2 m` in 0.4 s, `arcSparks` 24, `flashLight 24` 0.35 s, `shake 0.3`, `aberration 0.4`, `kit.decal({ type: 'arc', radius: 1.2, tint: BURN })`. Then the window collapses head-ward in 0.2 s (`tail → head`) and both fields die.
- Blocked (`hit.blocked`: the projectile hit cover): the window collapses at the cover point with a half-strength knot (`tangle 0.5`, 12 spikes), no floor ring, no decal, no shake — the look of `arc/impact.js`'s `e.blocked` branch.
- Miss (no impact record before `travel`): the head reaches `E`; no tangle; the window collapses the same way. Energy that hit nothing just stops. Field life `travel + 0.5`.

Acceptance (all from the clip and the top camera; write the boxes you used in `ball.js`'s header): (1) `tools/vfxlock.sh node tools/vfxclip.mjs --port=8823 --el=arc --kind=bolt --cam=side --secs=1.2 --out=$PWD/reports/vfx/arc-bolt/clip`; extract the frames at 0.15 s and 0.35 s after the cast (`lead` from the clip's `.json`). (2) On the 0.15 s frame the muzzle cloud marks the hand: take a 120×120 px box around it. (3) `metrics.py box <0.15 frame> <box>` → `hot > 20`; `metrics.py box <0.35 frame> <box>` → `hot == 0` and `blue60 > 150` (fixture bolt, 9.2 m at 22 m/s: at 0.35 s head 0.84, tail 0.31 — the origin is dark, the floor trail remains). (4) side frame at 0.25 s, crop 4× around the head: at least two strokes leave the head at 30–60° and end in space. (5) `metrics.py extent <top png at 0.35 s> 690,270 880,600 60` → max reach ≥ 0.8. (6) In the clip nothing but the head advances. Test hits on the stand with "Bolt + hit".

### A3 · Lob — the same discharge over an arc

Records `{ kind: 'lob', x, z, h, range, speed }` (`arc: true` in the sim: flies over cover). `S = [x + ux·0.7, 1.1, z + uz·0.7]`, `E = [S.x + ux·len, 0.25, S.z + uz·len]` (the landing point is on the floor; `bundleSegs` interpolates y from 1.1 to 0.25 by itself), `travel = range / speed`, `apex = 0.35·len`, **`lift(t) = 4·apex·t·(1 − t)` and nothing else**, `minY 0.08`. Same bundle, window, head field and muzzle as A2 with `lift`. The head climbs from the hand, arcs over, and comes down onto the landing point; the strike-down is the natural end of the parabola. Landing (a lob always lands; the sim's impact record arrives at `travel`): `tangle` on the head field, `stormBurst` radius 0.6 → 2.2, `radialArcs` 8 of 2.4 m for 0.45 s, `floorRing 0.3 → 2.6`, decal `arc` 1.4 m `tint: BURN`, `impactKit` strength 1.1, `shake 0.35`. No floor trail while the head is above 1.5 m; below that the A2 marks.

### A4 · Self — rewrite (P2): the shield is a lattice on a shell

Today (`arc/self.js`): nine great-circle strands between random points near a sphere plus five strands to the floor, on a translucent orb. Delete the strand law; keep the orb and the light.

**Two records, two beats.** The `self` record (`{ kind: 'self', who, t, skill, element, x, z }`, no effects, no duration) draws only the **cast beat**: 0.25 s grow of the shell and a 2 → n lattice ramp, then, unless a shield entry was opened, a collapse by count over 0.4 s — a discharge, not a shield (a `self: heal` or `self: boost` on an arc skill must not get a cage). The lasting shield is opened by the `status` record with `effect === 'shield'` and the arc element (pushed on the same tick by `effects.js`, with `duration` after §7.7): `SHIELDS.set(who, { until: vfx.now + duration, … })` and the lattice holds until `until` (P10), decay 0.5 s by count, shell fades last.

**Design.**
- Size from the body via §7.1 only (`ctx.radius` does not exist; no caller sets it): `const bs = ctx && ctx.bodyShape ? ctx.bodyShape(e.who) : null; const br = bs ? bs.r : 0.9, h = bs ? bs.h : 2.0; const r = br·1.25 + 0.35, ry = h·0.62;` centre `y = ry`. Follows `ctx.bodyPos(who)` every frame (the shield is attached to the body; P1 is about energy, not attachment).
- Shell: `const sh = orb(P, r, seed, 0.5)`; each frame `sh.set(k, 0, r)` (`fill 0` = only the fresnel rim of the normal-blended solid mesh and the additive shell at `shellK 0.5`) and `sh.group.scale.set(r, ry, r)` after it (`orb.set` scales uniformly).
- Lattice: `surfaceSegs` with `c = [x, ry, z]`, `r`, `ry`, `n = clamp(round(6 + 4·r), 8, 14)`, `links 5–8`, `link 0.3`, `width 0.021`, `rungs 1.0`, `offset 0.03`, `seed`, `spin 0.4` (rad/s; pass `t`), restrike every 55 ms with the hot flash. Cells must be visible polygons from the side camera and persist between restrikes (the per-filament seeds do that).
- Grounding: 2–3 strands leave the shell **tangentially at the equator**: two `strandSegs` per grounding — equator point → `p + tangent·0.5` (horizontal, `jag 0.15`), then that point → a floor point 0.8–1.6 m out (`floor: true`), `phase 600 + i` on both so they flicker together — and ground into a glyph carpet ring under the rim (`crackleSegs` along the rim circle, 24–40 marks, lives 0.8–1.4 s, re-seeded every 0.5 s).
- Sparks: 8 `arcSparks` every 0.3 s from random lattice nodes while the shield lives.
- Hit flare: when `impact` lands on a shielded body (`arc/impact.js` checks `SHIELDS`), add for 0.2 s three filaments radiating **over the surface** from the hit point (`surfaceSegs` with `start = hitPoint`, `n 3`, `links 4`) and `hot = 1`; the shell rim brightens ×1.5 for 0.3 s.
- Decal: `arc` radius `r·1.1` `tint: BURN` under the body at the cast, plus the crackle ring.

Acceptance: side camera at 1.0 s after a `self` + `status: shield` pair (on the stand: cast `self`, then `status` with `shield`): every stroke on the shell is tangent to it and the lattice shows ≥ 12 closed cells; nothing radial; body visible through the lattice; two frames 0.11 s apart (from the clip) show the same cell polygons; broadcast: the shield reads as a blue cage around the fighter, `blue60 > 900` in a 220×260 box around the body; the shell rim visible on the floor side (dark blue) and on the dark wall side (light blue).

### A5 · Cone — polish, keep the design

Fan of 5–9 discharges from the hand to points on the far arc plus floor crawls in the sector (`arc/cone.js`). P1 holds (origin at the hand). Changes: the discharges **propagate** (per-strand `u0/u1` and `reach` 0 → 1 in 0.08 s, so they grow from the hand rather than appear whole); each discharge is a small bundle (`n 3, r1 0.18, width 0.021`) rather than two overlapped strands (the two-strand trick reads as a double line at 26 m); crawls become glyph carpets (`crackleSegs` in the sector, `n = kit.countFor(60, fp.area, kit.REF_AREA.cone, 160)`, lives 0.6–1.1 s, cooling by `bright`), not thick 0.045 strands; storm bursts at the far edge stay; decals: one `arc` of `range·0.55` `tint: BURN`, never `P[1]` (grey dirt).

### A6 · Zone — polish, keep the design

Sky strikes into a disc, a rim fence, tendrils, columns (`arc/zone.js`). P1 holds (origin in the sky). Changes:

- An **anvil** above the disc for the duration: `cloud(vfx, P, { x: cx, y: 5.5, z: cz, at: 0, r0: r·0.4, r1: r·0.9, grow: 0.3, hold: D − 0.3, life: D, squash: 0.35, seed, hot: 0, dense: 0.6, kind: 'impact' })` — with `hot: 0` the impact kind is pure `P[2]·1.3` additive, which reads on the dark ceiling (there is no colour parameter).
- Strikes grow by geometry, not by `reach` (one uniform per field cannot serve strikes that fire at different times): at each restrike write the strike's three strands from `a = [sx ± 0.15, 7.5, sz ± 0.15]` to `b = [sx, max(0.08, 7.5 − 7.42·k), sz]` with `k = clamp01((t − s.t) / 0.06)`, `u0 0, u1 1` (restrike 45–50 ms → the strike is drawn once half-grown and once full); each leaves a tangle knot + `floorRing 0.2 → 1.4` + a glyph disc at the foot; `reach` stays 1 after 0.26 s.
- The fence is **one closed polyline** (`polySegs`, item `{ pts, width, bright, phase, u0, u1 }`): 48 points `th = i/48·TAU + t·1.1`, `rr = r·shrink·(1 + (g() − 0.5)·0.12)`, `y = 0.1 + g()·0.4`, `[cx + sin(th)·rr, y, cz + cos(th)·rr]`, with `pts[48] = pts[0]`; `width 0.021, bright 0.95, phase 400`; plus 4 rungs per restrike between points `i` and `i + 2` (mid-kink ±0.2 m, width ×0.6) so it reads woven. Never call `surfaceSegs` with `ry = 0`.
- Columns thin to `width 0.021`; tendrils become glyph carpets on the floor; decals `tint: BURN`; strike decals radius 0.7.

### A7 · Impact — woven over the victim (P2)

Today: seven strands between random points on a 1.15 m sphere around the victim. The body to draw on is the **body nearest to `(e.x, e.z)`** — `e.who` is the caster, and SELF-atom impacts (heal, shield, cleanse, boost) arrive at the caster's own position (`pushImpact` in `deliver.js`): `const cand = ['blue', 'orange'].map((id) => ctx.bodyShape ? ctx.bodyShape(id) : null).filter(Boolean); const bs = cand.sort((a, b) => Math.hypot(a.x − e.x, a.z − e.z) − Math.hypot(b.x − e.x, b.z − e.z))[0];`; if `bs` is null or farther than 2 m, draw a plain sphere of r 1.15 at `(e.x, 1.1, e.z)` as today. Replace the strands with `surfaceSegs` on that capsule (`c = [bs.x, bs.h·0.5, bs.z]`, `r = bs.r·1.1`, `ry = bs.h·0.55`, `n 5–7, links 3–5, link 0.22, width 0.021, offset 0.04, seed`), 0.4 s life, restrike 40 ms (cells persist ~10 restrikes), plus the flash (`stormBurst` r 0.6 → 2.0), `spikes` 24, decal `arc` 1.2 `tint: BURN`, `impactKit`. `blocked` case unchanged. If that body is shielded (A4 `SHIELDS`), draw on the shield instead of the body and flare it.

### A8 · Charge — gathering, woven

Keep `kit.charge` (storm mode) and the converging strands, but the strands end **on the caster's body surface** (project the end point onto the capsule from §7.1, not the centre) and crawl over it for the last 30 % of the wind-up (`surfaceSegs`, `n 3`, `links 3`); add a hand orb `cloud kind 'orb' r1 0.3` for the last 0.15 s that becomes the beam's cast orb or the bolt's muzzle. Light 8 → 14 over the wind-up (re-flashed every 0.3 s).

### A9 · Stock forms for lightning (P1/P2 apply)

- **Dash** `{ x0, z0, x1, z1, hit }`. Sim fact first (§1.1): the body is already at `E` when the record plays and never moves on the stand. **Never derive the head from the body.** `S = [x0, 0.9, z0]`, `E = [x1, 0.9, z1]`, `len = fp.len` (`kit.footprint`), `T = clamp(len / 22, 0.18, 0.4)` s (22 m/s reads as a lunge), `head(t) = clamp01(t / T)`, `tail(t) = max(0, head − 4 / len)`; bundle fixed `S → E` `{ n 6, r0 0.05, r1 0.3, step 0.4, width 0.021, heroes 1, rungs 0.5, stubs 0.3, tangle 0, bend 0.03 }`, restrike 45 ms, `field.set({ fade: 1, hot, reach: head + 0.001, tail })`; the A2 head field at `S + dir·len·head`. Muzzle burst at `S` at t = 0 (`stormBurst` 0.4 → 1.2, `flashLight 12` 0.2 s); the origin stays lit while `tail = 0`, then fades behind the head. Floor glyph trail born as the head passes (A2 rule); 6 `arcSparks` per restrike from the head point; `heldLight` on the head; when `hit`, at `t = T` an impact at `E` (`stormBurst` 0.5 → 1.6, `spikes` 24, decal `arc` 1.0 `tint: BURN`); the window collapses head-ward over 0.2 s after the sweep; field life `T + 0.45`. The body standing at `E` while the discharge arrives is acceptable: the discharge is the dash's trace, not its vehicle. Acceptance: side camera at `T/2`: lit bundle from ~`S` to mid-path with a dark origin behind the tail; the same frame on the stand (body static at `S`) shows the discharge crossing to `E`.
- **Blink** `{ x0, z0, x1, z1 }` (the body is already at `E`): at `S` a discharge into the floor: 6 strands from a capsule at `S` (§7.1 size of the caster) to floor points within 1.2 m, 0.12 s, a glyph disc; one **instant discharge** from `S` to `E` (a bundle `n 5, r1 0.25`, two restrikes, 90 ms, lit whole: a teleport is instantaneous, so P1's window is the whole path); at `E` the reverse: 6 strands from floor points converging onto the body surface for 0.15 s, a ring `floorRing 0.2 → 1.6`, `flashLight 18`. Two decals `arc` 0.8 at `S` and `E` `tint: BURN`. Total 0.35 s.
- **Jump** `{ x, z, h, height, duration }`: take-off: 4 strands from the capsule bottom to the floor for 0.12 s and a glyph ring; in the air nothing (the body carries no charge; P1); landing at `duration`: `stormBurst` r 0.5 → 1.8, `radialArcs` 6 of 2.0 m for 0.35 s, `floorRing 0.2 → 2.0`, decal 1.0 `tint: BURN`, `shake 0.2`. The stock black shadow keeps drawing: §7.3 makes `Vfx.play` treat `jump` like `impact` (module adds, stock draws) and `hop` skips only its coloured ring and dust when `e.__elemental`. The module never calls the stock and never draws a shadow.
- **Wall** `{ x, z, w, d, duration }`: an electric fence inside the box `w × 2.2 × d`: two vertical hero discharges at the ends (`x ± w/2`), a woven lattice between them (`surfaceSegs` on a flattened ellipsoid `c = [x, 1.1, z]`, `r = w/2, ry = 1.1, rz = Math.max(0.25, d/2)` (the `surfaceSegs` guard returns for `rz ≤ 0.2`), `seed`), restrike 80 ms (the wall lives 5 s; 45 ms would cost too much CPU for that long), `n = clamp(round(w·1.5), 4, 10)`, hot flashes; a glyph carpet along the base ±0.4 m re-seeded every 0.5 s; the stock plate stays underneath at 0.15 alpha in `P[2]` (§7.8 `inkMat`; it is the collision box viewers must read; §7.3 lets the module draw over it). Rise 0.15 s, fall 0.3 s at the end.
- **Status** `{ who, t, effect, element, duration }` (`who` is the target; P10 map): `burn`/`stun`/`root`/`blind`/`silence`/`weaken` on an arc skill → **electrified body**: `surfaceSegs` on the target's capsule (§7.1), `n 3, links 4, seed`, bursts of 0.15 s every 0.4 s for the duration, 6 sparks per burst, no decal. `shield` on the caster opens the A4 lattice (the `self` beat already drew the cast); `heal`/`cleanse`/`boost` on the caster: the same bursts at a lower rate (every 0.8 s) in `P[1]`, 0.6 s for the one-shots.

---

## 4. Part B — Laser (kinetic, void)

The stock beam of elements without a module is `src/viewer/vfx/laser.js`; `Vfx.beam` calls it first and falls back to the old tube. Reference Nova Beam, brief `LASER-BRIEF.md`. Round 2 worked the judges' list: true HDR white cores with bloom (ribbons, orb), a glassy translucent bell for the dome (not a wire cage with hoops), per-ribbon amplitude/phase/width with depth ordering and 2–3× wider ribbons (reference 10–14 px at 35 px/m ≈ 0.35 m with halo), continuous ring strokes (not beaded), a soft cylindrical tube with a dark rim, bright whips 2–4 m, a dense saturated floor sparkle carpet, no hazy disc on the target before the beam, hold ~1.2 s full / ~1.5 s off, a glassy `laser` decal with a bright centre, and a contrast pair derived from `P` (jackets and rims from darkened `P[2]`, cores HDR white) because kinetic's palette is grey on grey.

Acceptance: side camera at 0.45 s `hot > 400` in the beam box (560,380)–(1060,520); from broadcast the beam reads as a beam over the white floor; void looks like the same effect in purple; judges' mean ≥ 44/60. The remaining work is the last round's `mustFix` (handoff / `reports/vfx/r2-laser/r<N>/`).

**Void and kinetic pass on the stock forms** (after the laser passes; recipe in §7.8): void has no module and, by the founder's decision of 02.09, keeps stock silhouettes. Make them read on the white floor in the element's colours with the `inkMat` edits of §7.8 (cone, zone, shell, dash, blink, wall, bolt/lob sprites). These are palette fixes, not designs; the designs for these forms are Part C.

**Open questions for the founder** (write them in the handoff; do not decide alone):
- Kinetic means physical impact, yet its beam is the laser. A "kinetic" beam (a railgun: a shock line, dust, no glow) would be a new form spec, not a change to the laser.
- Whether the grammar dash should get a real travel phase in the sim (`phasesOfDef` + a dodge window, D160) is a sim and balance decision — the VFX draws the trace either way.
- Whether `pull` from a zone or lob should pull toward the zone centre instead of the caster (one line in `effects.js`, balance unknown: `node tools/kitbalance.mjs`); gravity's well reads as a well only if it does (§6.2).

---

## 5. Part C — Dash, blink, jump, wall and status per element

The founder wants to see these forms per element. Arc's designs are in A9. For **frost** and **ember**, add the forms to `ice.js` and `fire.js` on their existing primitives (they already have the seven forms). Sim facts of §1.1 apply: dash and blink records play with the body already at `E`; every trail is time-driven from `S` (`born = f·T`, `T = clamp(len / 22, 0.18, 0.4)`), nothing follows the body. One-line briefs; write the full spec in the module header before coding, in the same shape as A9, with the same numbers where the brief gives none:

| form | frost | ember |
|---|---|---|
| dash | a rime trail on the floor from `S` to `E` (P1: origin `S`), crystals rising along the passed part (`ice.js` beam's crystal items with `born = f·T`), frost mist, a shatter burst at `E` on hit | a fire trail: embers and low flames along the passed part (`fire.js` cone's flame material, `born = f·T`), `soot` decal strip, a scorch burst at `E` on hit |
| blink | at `S` a frost burst (`kit.burst` mode frost r 0.5 → 1.4), 18 `kit.debris` shards in `P[1]`/`P[0]` and a rime ring decal 0.8; at `E` a cold flash, frost mist and a rime ring — no statue (the module has no body mesh) | at `S` a puff of soot and embers, at `E` a flame burst; `soot` decals at both |
| jump | take-off rime ring; landing: a frost shockwave (`kit.shockwave`) and a crystal ring | landing: a fire shockwave, embers, `scorch` decal; take-off: a small flame puff under the feet |
| wall | an ice wall: `geo().dome` (a full sphere; ice `self` sinks it into the floor) placed at `y = 0` so its lower half is under the floor, scaled `(w/2 + 0.2, 1.1, d/2 + 0.2)`, `DoubleSide` so the fresnel rim exists (a box has constant fresnel per face and reads as three flat plates); cracks on hits and melt as in `self` | a wall of fire: flame material on the box's faces, heat haze above (`kit.heat`), embers rising, `soot` strip decal |
| status | rime on the body (surface particles on the §7.1 capsule in `frost` mode), P10 map | smoulder on the body: copy the stock `burn` signature (`Vfx.status`, `case 'burn'`) into `fire.js` and rebuild it on the §7.1 capsule; the stock one stays for kinetic and void; P10 map |

Kinetic and void keep stock (Part B's palette pass). Order inside Part C: arc first (A9), then frost, then ember.

---

## 6. Part D — The new elements

### 6.0 What an element is in this codebase

An element is a per-**skill** attribute (`skill.element` in `src/skills/registry.js`), cost 0, visual only: it sets the palette and which module draws the forms; `def.element` travels through `compile.js`, `deliver.js`, `effects.js` and `live.js` end to end. A kit is three skills and may mix elements, so a creature can carry a *time* zone that slows and a *kinetic* bolt that damages. The viability rule L2 (`DAMAGING = {damage, burn}`, `MIN_DAMAGING_SKILLS = 1`) is checked by `validateKit` — the HTTP path (`api.js`) — and **not** by `compileKit` (`compile.js` forwards only `size`/`kit_budget`/`kit_dup`); seeds must call `validateKit(kit)` themselves and fail on any code except `element_unreleased` (§7.5). Therefore **a time element that deals no damage is legal today** — no sim rule changes for any of the four elements. What changes: the registry (palette, forms, release flag), the viewer (module + decals + palette pass), the seeds, the gates, the forge prompt (§7.5).

Meaning is carried by the atoms already in `EFFECTS`: `pull` (gravity), `weaken`+`channel: 'speed'`/`stun`/`silence` (time), `burn`/`weaken`+`channel: 'armor'` (acid), `burn`/`blind`/`weaken` (radiation), `damage` where the element hits at all. In kit syntax a channelled atom is `{ effects: ['weaken'], channel: 'speed' }` — there is no `weaken:speed` token. The element's job is to make those atoms look like what they are.

### 6.1 Palettes (verified 03.09 with `checkgrammar`'s ΔE formula; every pair ≥ 21.7, threshold 10)

| element | id | ru | palette `[highlight, body, deep]` | floor colour (P3), ΔE from the floor | worst neighbour |
|---|---|---|---|---|---|
| gravity | `gravity` | гравитация | `#eef0f4`, `#6f7a8c`, `#141821` | near-black `P[2]` (the event horizon), 83.8 | kinetic, ΔE 21.7 |
| time | `time` | время | `#fff4e4`, `#d4b48a`, `#4a2c10` (sepia; brass `#e6c76a`/`#7a5a1e` was 20.1 from radiation and both are yellow with a floor disc as the hero form) | dark umber `P[2]`, 73.6 | radiation, ΔE 24.8 |
| acid | `acid` | кислота | `#f4ffb0`, `#9ee83a`, `#3d7a12` | bottle green `P[2]`, 72.2 | radiation, ΔE 34.1 |
| radiation | `radiation` | радиация | `#fffbe0`, `#ffe14a`, `#4b4f18` | dark olive `P[2]`, 65.6; the hazard yellow `P[1]` is the glow on bodies and walls only | time, ΔE 24.8 |

`read` strings for the registry: gravity "тяжесть и притяжение", time "замедление времени", acid "разъедание", radiation "заражение".

### 6.2 Gravity — weight and pull

**Identity.** Something heavy and dark that bends the space around it: a near-black core with a thin pale rim (an event horizon), a lens that pinches the picture behind it, dust that falls straight down and settles, debris that sinks, concentric compression rings pressed into the floor — WEIGHT. It is silent, slow, inevitable; nothing about it sparkles. The only bright thing is the rim.

**Sim truth (do not design against it).** `pull` accelerates the victim toward the **caster's** current position (§1.1), never toward the well, and a zone re-applies it every 0.5 s with an `impact` record each time. Therefore: everything that shows *motion of matter toward something* — convergence streaks, dragged dust — points at the caster's body (`ctx.bodyPos(e.who)`, sampled each frame), and it is drawn on the **impact** beat (the frame in which the viewer sees the yank); the well itself (core, rim, floor rings, decal, lens) marks the zone's area and is static and symmetric; nothing streams toward the well's centre. If the founder wants a well that pulls toward its own centre, that is the sim change in Part B's open questions.

**Forms offered** (`forms: ['zone', 'self', 'lob']` in the registry; `impact`, `status`, `charge`, `wall` reach it anyway, §P6): zone (a well), self (mass), lob (a dropped mass), impact (the crush), status (weighed down), charge, wall (palette pass only).

**Signature primitives** (`src/viewer/vfx/gravity.js`, pooled): `wellMat` — a normal-blended sphere: centre `vec3(0.02, 0.02, 0.03)` alpha 0.95, fresnel rim `P[0]` alpha rising to 1 at the silhouette with a hairline HDR white `(2.2, 2.2, 2.4)` at `fres^8`, bloom on the rim only; `kit.lens` (§7.4) — a distortion proxy whose offset is radial toward the centre; `ringsMat` — a flat disc on the floor with 5–8 concentric dark lines whose spacing tightens toward the centre and which rotate slowly (TSL `sin(d·k − TIME·0.6)`), normal blend `P[2]`; **falling dust**: `vfx.body.emit` dots in `P[2]` born at 1.5–2.5 m, gravity −9, life until the floor; **debris**: 6–12 `kit.debris` chips lifted 0.3–0.8 m that sink.

**Specs.**
- *Zone* `{ x, z, r, duration }` (pull, weaken speed, damage): 0–0.25 s the disc darkens (decal `grav` §7.4 fades in), the core drops from 4 m to 1.2 m above the centre (a black sphere r 0.35 → 0.7 with the rim), `kit.lens` size `r·2.2` strength 1 for the duration; falling dust `kit.countFor(120, fp.area, kit.REF_AREA.zone, 400)` re-emitted every 0.3 s; the floor rings tighten for the duration; at the end (last 0.35 s) the core collapses to zero, one outward `kit.shockwave` in `P[0]` low intensity, the lens releases (strength → 0 over 0.3 s), the decal holds 20 s. No light calls.
- *Impact* (pull / damage / knock): a 0.3 s crush on the nearest body (A7 rule for which body): 30 body-pool dots from a 1.4 m ring falling onto the body, a `kit.lens` 1.6 m for 0.3 s, a dark flash (a 0.6 m black sphere with rim at 1.0 shrinking to 0 in 0.25 s), floor rings decal 0.9 m; with `pull` also **convergence streaks** from the victim toward the caster: 16 `kit.SHAPE.streak` particles in `P[2]` (body pool) and 8 in `P[0]` (glow pool) from the victim's position with velocity toward `ctx.bodyPos(e.who)`, life 0.35 s.
- *Self* (boost armor "mass"): the `self` record draws the cast beat (0.6 s: rim shell 0.3 → 1.0, one ring on the floor); the `status: boost` record opens (P10) a thin rim-only shell (`wellMat` with the centre alpha 0.15, so the body stays visible), floor rings decal under the body that follows it, falling dust every 0.5 s, `kit.lens` 0.6 strength around the body, for the duration; no light.
- *Status* (weaken speed "weighed down"): dust falling straight down around the target (12 dots per second, gravity −9), a small rings decal that follows the body, rim shell at 0.4, for the duration (P10).
- *Charge*: dust within 2 m starts sinking to the floor around the caster for the wind-up, the core forms in the hand (0.1 → 0.35 m).
- *Lob*: the core (0.35 m black sphere with rim) travels the parabola (a thrown object: P1 does not apply), a faint lens around it, lands as a 1.6 s mini-well (the zone recipe at `r 1.6`, `duration 1.6`; the sim's `pull` still points at the caster).
- *Wall*: §7.8 palette pass only.

**Decal** `grav` (§7.4): concentric dark rings, spacing tightening inward, a slightly darker centre, tint `P[2]`, no glow, radius `r·1.1`.

### 6.3 Time — slowed and skipped time

**Identity.** Sepia, precise, still. A bubble whose inside looks like a photograph: dust motes hang in the air, a few thin hoops (clock rings) turn at different rates and one ticks backwards in steps, the rim of the bubble is a dark umber jacket with a hairline hot core and a refractive edge, the floor under it carries a faint clock face in dark lines. Everything ticks: brightness steps at 2 Hz rather than pulsing. No fire, no sparks, no damage look. On the white floor the element is its **dark** lines, not its pale ones.

**Forms offered** (`forms: ['zone', 'self', 'blink']`; plus impact, status, charge, wall by P6): zone (a bubble of slow time), self (haste), blink (a time skip), impact (a freeze), status (slowed), charge, wall (palette pass).

**Signature primitives** (`src/viewer/vfx/time.js`): `bubbleMat` — a normal-blended sphere: interior tint `P[0]` at alpha 0.06 (desaturates what is behind), rim jacket `P[2]·0.9` alpha 0.85 rising to 1 at the silhouette with the HDR hairline `(2.4, 2.2, 1.8)` at `fres^7`, `markDistort` on the rim with offset `normalize(q)·0.35·fres^2` (a lens edge), and a `tick = step(fract(TIME·2), 0.5)` term that adds 0.25 to the rim alpha; the `P[1]` tint lives only in a second additive layer (reads on walls and bodies); `hoopMat(P)` — **copy** `ringMat` from `arc/common.js` into `time.js` (key `time:hoop`, core `vec3(2.4, 2.2, 1.8)` (an HDR hairline, never `P[1]`, which is pale tan), edge `col(P[2])`; never import from `arc/`), each hoop a copy of `ringGeo` (`RingGeometry(0.3, 1, 96)` then `rotateX(−π/2)`; the band is the uniform `wid` = metres / radius, so the geometry must cover the inner radius), `mesh.scale.setScalar(r)`, tilted after scaling, and every frame `u.wid.value = thick / r` with `thick 0.10` (0.12 when `r ≥ 3`) — as `floorRing` does; tilts 90°/35°/−60° so at least one faces the broadcast camera, rotating at 0.5, −0.2 (in 0.15 s steps: `floor(t·6)/6`), 0.9 rad/s; **motes**: `vfx.body.emit` dots in `P[2]` size 0.05 with `vel(0,0,0)` and life = the bubble's life, plus 30 % in `vfx.glow` in `P[0]`.

**Specs.**
- *Zone* `{ x, z, r, duration }` (weaken speed, stun, silence, damage): bubble grows 0.2 s (`easeOutBack`), stands for `duration`, collapses in 0.15 s with one bright tick; hoops inside at `r·0.6`; motes `kit.countFor(80, fp.area, kit.REF_AREA.zone, 260)` hanging at 0.2–2.2 m; the floor decal `time` (a clock face: a ring and 12 tick marks as 0.06 m lines at alpha 0.9 in `P[2]`, a hairline hand) fades in 0.3 s and holds 20 s; light: `heldLight` in `P[0]` intensity 6, re-flashed every 0.3 s (the pool is round-robin; theft by an impact is accepted).
- *Self* (boost speed / cooldown, cleanse): the `self` record draws the cast beat (hoops appear for 0.6 s); `status: boost` opens (P10) the hoops around the caster's body at `r 1.3` turning fast (3 rad/s, forward), motes streaming **past** the body backwards along its heading (`yaw` from `ctx.bodyShape(e.who)`, velocity −2 m/s along it), the rim shell at alpha 0.3; a small clock decal under the body that follows it.
- *Status* (weaken speed, stun, silence, blind): one hoop over the target's head turning in 0.25 s steps backward, motes hanging around the body, the rim shell at 0.35; for `stun` the hoop stops and blinks; P10.
- *Blink* (time skip; the body is already at `E`): at `S` a bubble of the caster's size appears for 0.1 s and collapses to a point with a tick; at `E` the reverse; a trail of 8 hanging motes between `S` and `E` that fade in 0.6 s; clock decals at both ends 0.6 m.
- *Impact* (stun "freeze frame", damage): a 0.25 s bubble on the nearest body with the hoop and a bright tick, then a burst of 12 motes that hang for 0.8 s and drop.
- *Charge*: hoops gather around the caster, ticking faster as the wind-up ends.

Acceptance: broadcast at 0.5 s of a zone: `satPx` of the umber hue > 400 in a 220×260 box around the zone (say the threshold in the notes); zero rim pixels paler than the floor.

**Decal** `time` (§7.4): a ring with 12 tick marks and a hairline hand, lines 0.06 m wide at alpha 0.9 in `P[2]`, no glow; radius as the form.

### 6.4 Acid — corrosion

**Identity.** Liquid, glossy, sickly yellow-green. Jets and sprays of droplets that land as glossy puddles with a dark wet rim, bubbles rising and popping, thin yellow-green fumes, drips running off a corroded body with fizz where they land. Bright where the liquid is thick, dark at the wet edge (the floor colour), never sparkly.

**Forms offered** (`forms: ['cone', 'lob', 'zone', 'bolt']`; plus impact, status, charge, wall): cone (a spray), lob (a flask), zone (a pool), bolt (a jet), impact (a splash), status (corroding), charge, wall (palette pass).

**Signature primitives** (`src/viewer/vfx/acid.js` + `kit.js`): **droplets**: `kit.SHAPE.streak` particles stretched by velocity in `P[1]` (glow pool) and `P[2]` (body pool), gravity −9; for each droplet compute its landing `t_land = (vy + sqrt(vy² + 2·9·y0)) / 9` and landing point; **the puddle carpet is particles, not decals** (the decal ring is 28 per type; a cone would evict its own pool): the body pool fades every particle from birth (`(1 − u)^1.3`), so a long-lived dot goes pale: each dot lives `1.4 + rng()·0.4` s and the module **re-emits the whole landing list every 0.7 s** until the hold (6–10 s) ends: `let next = 0; vfx.spawnMesh(new THREE.Group(), hold, (o, u) => { const t = u·hold; if (t >= next) { for (const l of landed) if (t >= l.t_land) emitDot(l); next = t + 0.7; } })` with `emitDot = (l) => vfx.body.emit(1, (i, s) => { s.pos(l.x, 0.04, l.z); s.vel(0, 0, 0); s.gravity(0, 0, 0); s.color(P[1], P[2].clone().multiplyScalar(0.8)); s.life(vfx.now, 1.4 + rng()·0.4, 0.2 + rng()·0.15, kit.SHAPE.dot); s.ext(0, 1.0, 0, 0.1); })` — alpha never drops below ~0.55 and the last emission fades as the puddle dries (acceptance: broadcast at 3.0 s after an acid cone, `satPx` of the `P[2]` hue in the far half of the sector ≥ 60 % of its value at 0.8 s; write both boxes in `acid.js`); **decals** are for ≤ 3 puddles per cast through `kit.decal({ type: 'acid', at: t_land })` (§7.4 adds `at`), the pool decal placed first so the carpet cannot evict it; **fizz**: `kit.SHAPE.dot` in `P[0]` size 0.05–0.09, rising 0.6 m/s, life 0.3–0.6 s, popping (endSize 0), from the same landing list; **fumes**: `kit.smoke` with `dark = P[2]·0.6`, `lit = P[1]`, rise 1.2, size 0.6, life 1.4; **`flaskMat`**: copy `wellMat`'s structure from §6.2 into `acid.js` (`P[1]` interior, a white specular dot); never import `gravity.js`.

**Specs.**
- *Cone* (burn, weaken armor, damage): from the hand a 0.35 s spray: droplets `kit.countFor(160, fp.area, kit.REF_AREA.cone, 420)` at 9–13 m/s in the sector, elevation 5–20°, each landing as a carpet dot (above) with fizz; fumes over the sector for 1.2 s; decals: one `acid` of `range·0.5` at 60 % range plus two 0.5 m satellites at ±0.5·half (three, placed first); the hand drips for 0.5 s after; `flashLight` `P[1]` 8 for 0.3 s.
- *Bolt* (damage, burn): P1: a **jet** — droplets emitted continuously from the hand for 0.25 s at `speed` along `h` (not one blob): the stream is the discharge; each droplet lands (miss) as a carpet dot or splashes on the victim (hit via §7.2): a splash of 24 droplets radially, fizz 30, one `acid` decal 0.8 m under the victim, drips on the body for 1.5 s.
- *Lob* (burn, damage): a glass flask (0.25 m `flaskMat` sphere) on the parabola with a droplet trail (a thrown object); landing: 40 droplets in a 2 m disc (carpet dots), one `acid` decal 1.6 m, fizz 60, fumes for 2 s, `shake 0.15`.
- *Zone* (burn, weaken armor): a pool `r`: one `acid` decal `r·1.05` at once, 20 bubbles per second rising and popping over the pool, fumes, the rim bubbling brighter; at the end nothing collapses: the pool just stops bubbling and the decal holds.
- *Impact* (burn/damage): a splash on the nearest body's surface: 16 droplets, fizz **on the capsule surface** (§7.1; particles born on the surface, P2), drips falling off the body for 1.2 s, one `acid` decal 0.7 m under it.
- *Status* (burn = corroding, weaken armor): drips every 0.3 s from random points on the target's capsule, fizz where they land, a carpet dot that follows the body, fumes 2 per second; P10.
- *Charge*: the hand drips; a carpet dot grows under it.
- *Wall*: §7.8 palette pass.

**Decal** `acid` (§7.4): a glossy puddle — outline broken by `mx_noise_float(vec3(q.mul(3.5), seed))` at threshold 0.45 so no puddle is a disc; a dark wet rim in `P[2]` at alpha 0.95 over the outer 18 % of the radius (the floor colour, P3); an inner body `mix(P[2]·0.7, P[1], 0.55)` at alpha 0.85; one HDR specular streak `(2.6, 2.8, 2.4)` 0.08·radius wide along `rot` in one quadrant; `glow` = the streak × 0.3 and nothing else; tint `P[2]`; radius as the form; `DECAL_Y` 0.020 so drips and later marks lie on it.

### 6.5 Radiation — contamination

**Identity.** A glow that should not be there: hazard yellow pulsing at ~1.5 Hz on bodies and walls, a shimmer (low distortion), and the Geiger crackle — tiny flecks popping at random in the contaminated volume, dense where it is strong; on the white floor the crackle is **dark olive specks** popping (the floor colour), on bodies bright ones. Contaminated floor keeps glowing after everything else is gone. Irradiated bodies carry a yellow fresnel sheen and flecks. No liquid, no arcs, no flames.

**Forms offered** (`forms: ['zone', 'lob', 'cone', 'beam']`; plus impact, status, charge, wall): zone (fallout), lob (a canister), cone (a pulse), impact, status (sickness), charge; **beam** is a second-phase form (a thin shimmering ray with flecks along it; build it last, after the other five pass; it reuses the laser's ring/ribbon field with one thin ribbon and no helix); wall (palette pass).

**Signature primitives** (`src/viewer/vfx/radiation.js` + `kit.js`): **flecks** are emitted twice like `spikes`: glow pool `P[0]` size 0.05 (bodies, walls) and body pool `P[2]` size 0.09–0.13, life 0.08–0.16 s, `vel 0`, `s.ext(0, 0, 0, 0)`, born uniformly over a window (`born = now + rng·window`) in the volume — this is the Geiger counter and the element's most recognisable trait; density `kit.countFor(400, fp.area, kit.REF_AREA.zone, 900)` per second at a zone's peak; **glow dome**: a normal-blended sphere with a `P[2]·0.8` rim jacket alpha 0.8 under an additive `P[1]` rim (alpha 0.6, bloom 0.4 on the rim only), interior `P[1]` alpha `0.08 + 0.06·sin(TIME·9.4)`, `markDistort` noise at 0.25 strength (the shimmer); **sheen** on a body: the dome scaled to the body capsule (§7.1) at 0.35 alpha with flecks on the surface; **fume**: `kit.smoke` in `P[2]`/`P[1]`, thin (size 0.5), slow (rise 0.8).

**Specs.**
- *Zone* (burn, blind, weaken, damage): fallout: the `rad` decal (§7.4: `P[1]` blotches on a `P[2]` ground, glow ≤ 0.2 on blotch edges only, the pulse in colour `P[1]` ↔ `P[1]·0.6` by `sin(TIME·9.4)`, never in bloom, radius `r·1.1`) fades in over 0.3 s and **holds 20 s glowing**; a glow dome `r·0.9` × 1.4 m high (squash 0.45) for the duration; flecks at the peak density across the disc and up to 1.5 m; fumes 3 per second; `heldLight` `P[1]` 10 re-flashed every 0.3 s for the duration; at the end the dome fades in 0.4 s, the flecks thin over 1 s, the decal stays.
- *Lob* (burn, blind): a canister (0.3 m capsule, `P[2]` with a `P[1]` band; a thrown object) on the parabola trailing 4 flecks per 0.1 s; landing: a yellow flash (`kit.burst` mode `air` in `P`), then the zone recipe at `r 1.8` for 1.6 s.
- *Cone* (blind, weaken, damage): a pulse: a sector-shaped wavefront (`kit.shockwave` with `dir`/`half`, §7.4) travelling `range` in 0.25 s, flecks born along the front, a shimmer over the sector, sheen on anyone hit (via impact), a `rad` decal `range·0.4` at 60 % range holding 20 s.
- *Impact* (damage/burn/blind): a yellow flash 0.4 → 1.4 m (`kit.burst` air mode), 60 flecks in 0.3 s around the nearest body, the sheen for 0.6 s.
- *Status* (burn = sickness, blind, weaken): the sheen on the target's body for the duration with 12 flecks per second on its surface and a fume every 0.5 s; for `blind` the sheen brightens around the head; P10.
- *Charge*: flecks gather at the hand, the hand's glow dome grows 0.1 → 0.4 m, the light pulses.
- *Beam* (phase 2): one ribbon `width 0.03` HDR white core with a `P[2]` jacket, flecks along the beam at 40 per second, a shimmer tube, a `rad` decal 1.2 m at the target, held 0.8 s.
- *Wall*: §7.8 palette pass.

Acceptance: broadcast at 0.5 s of a zone: ≥ 60 dark-olive specks (`satPx` of the `P[2]` hue, ≤ 4 px each) inside the disc.

### 6.6 Seed creatures for the four elements (`tools/seedvfx.mjs`)

`ROSTER` entries there are `{ el, melee, ranged, body, zone, lob }` expanded by `kitsFor` into fixed kits, and there is no `weaken:speed` syntax. Extend the entries with an explicit `kits` map and make `kitsFor` honour it — `const kitsFor = (r) => r.kits || ({ /* the existing body */ });` — then append:

```js
/* Новые стихии: набор задан явно (форм-матрица docs/VFX-PLAN.md §6; L2 — один урон в наборе, можно чужой стихии). */
{ el: 'gravity', body: 'gorilla', kits: { 'ТЯЖЕСТЬ': [
  { delivery: 'zone', effects: ['pull', 'damage'], element: 'gravity' },
  { delivery: 'self', effects: ['boost'], channel: 'armor', element: 'gravity' },
  { delivery: 'cone', effects: ['damage'], element: 'kinetic' } ] } },
{ el: 'gravity', body: 'octopus', kits: { 'ВОРОНКА': [
  { delivery: 'lob', effects: ['pull'], element: 'gravity' },
  { delivery: 'bolt', effects: ['damage'], element: 'kinetic' },
  { delivery: 'zone', effects: ['weaken'], channel: 'speed', element: 'gravity' } ] } },
{ el: 'time', body: 'octopus', kits: { 'ХРОНОС': [
  { delivery: 'zone', effects: ['weaken'], channel: 'speed', element: 'time' },
  { delivery: 'self', effects: ['boost'], channel: 'speed', element: 'time' },
  { delivery: 'bolt', effects: ['damage'], element: 'kinetic' } ] } },
{ el: 'acid', body: 'gorilla', kits: { 'ЩЁЛОЧЬ': [
  { delivery: 'cone', effects: ['burn'], element: 'acid' },
  { delivery: 'zone', effects: ['burn', 'weaken'], channel: 'armor', element: 'acid' },
  { delivery: 'self', effects: ['shield'], element: 'kinetic' } ] } },
{ el: 'acid', body: 'octopus', kits: { 'КИСЛОТНИК': [
  { delivery: 'bolt', effects: ['damage'], element: 'acid' },
  { delivery: 'lob', effects: ['burn'], element: 'acid' },
  { delivery: 'beam', effects: ['damage'], element: 'kinetic' } ] } },
{ el: 'radiation', body: 'gorilla', kits: { 'ИЗОТОП': [
  { delivery: 'zone', effects: ['burn', 'blind'], element: 'radiation' },
  { delivery: 'lob', effects: ['burn'], element: 'radiation' },
  { delivery: 'cone', effects: ['weaken'], channel: 'armor', element: 'radiation' } ] } },
```

All six pass `validateKit` today with the element swapped for an existing one (costs 38/29/31/39/34/41 of 52) and respect the delivery whitelists of §6.2–6.5. Update the script's header comment ("Элементов три" → the current list); leave its retire loop alone. Before `compileKit(kit)` in the loop add the §6.0 rule: `const bad = validateKit(kit).filter((b) => b.code !== 'element_unreleased'); if (bad.length) throw new Error(\`${name}: ${bad.map((b) => b.ru).join('; ')}\`);` with `import { validateKit } from '../src/skills/registry.js'`. Seeds need the registry entry to exist (`unreleased` is enough). **Until the founder accepts an element, seed into a stand database, not `data/airena.db`:** `AIRENA_DB=data/vfx-stand.db node tools/seedvfx.mjs --el=gravity` (the script honours `AIRENA_DB`) and run the 8823/8830 viewers with the same `AIRENA_DB`; seeded creatures are active and the match cycle puts them into the public broadcast. Seed the real database only in the release step.

---

## 7. Part E — Shared changes (the only edits allowed outside the modules; do them exactly like this)

### 7.1 `main.js`: `ctx.bodyShape(who)`

Both `vfx.play(...)` calls pass `{ bodyPos }`. Define one context after `bodies` and pass it to both:

```js
/* Один контекст на оба вызова vfx.play — определить после `bodies`. */
const FX_CTX = {
  bodyPos: (who) => (bodies[who] ? bodies[who].root.position : null),
  /* Капсула тела для эффектов на его поверхности (щит, удар, статус).
     `footprint` — размер СЫРОЙ модели ДО масштаба (`bodyFor`), радиус
     коллайдера в метрах = footprint·scale/2 = cfg.fighters[kind].radius·k;
     `height` меряется ПОСЛЕ масштаба, то есть уже в метрах. Модуль без
     капсулы рисует шар. */
  bodyShape: (who) => {
    const b = bodies[who]; if (!b) return null;
    const p = b.root.position;
    return { x: p.x, y: p.y, z: p.z, r: Math.max(0.5, b.footprint * b.scale * 0.5), h: Math.max(0.8, b.height || 2.0), yaw: b.root.rotation.y };
  },
};
```

`bodyFor` returns `{ root, inner, length, height, scale, footprint, meshes }`; never use `footprint` alone (raw model units, e.g. 3.94 for the octopus). `__airenaSweep.cast` → `playFx` reuses the first `vfx.play`, so the stand and the capture tool need nothing else.

### 7.2 `vfx.js`: projectiles learn where they hit

The sim writes the `bolt`/`lob` record at launch; on a hit `pushImpact` (`deliver.js`) writes an `impact` at the victim for TARGETED atoms and a second one at the **caster** for SELF-class atoms (`bolt: heal` is legal); on cover it writes `{ kind: 'impact', …, blocked: true }`. Add to `Vfx`:

```js
/* Живые снаряды по (who, skill): удар той же пары сообщает им точку и
   момент попадания, чтобы разряд болта кончался там, где кончился снаряд,
   а не на полной дальности (замер 02.09: болт летел всю дальность). */
this.flights = new Map();
flight(who, skill, state) { this.flights.set(`${who}:${skill}`, state); }
```

In `play()`, before the module dispatch:

```js
if (e.kind === 'impact') {
  const f = this.flights.get(`${e.who}:${e.skill}`);
  /* Удар SELF-атомов пишется у КАСТЕРА (`pushImpact`): он не место попадания снаряда. */
  const atTarget = e.blocked || (e.effects || []).some((id) => EFFECTS[id]?.klass !== 'self');
  if (f && atTarget) { f.hit = { x: e.x, z: e.z, t: this.now, blocked: !!e.blocked }; this.flights.delete(`${e.who}:${e.skill}`); }
}
```

with `import { ELEMENTS, EFFECTS } from '../skills/registry.js'`. A projectile form registers `vfx.flight(e.who, e.skill, state)` at its start, checks `state.hit` each frame and deletes the entry when it dies. The fixture's `impact` record already has `who = caster` (as `deliver.js` writes it) and the stand's "Bolt + hit" button sends the impact 0.4 s after the bolt with the same `skill`.

### 7.3 `vfx.js`: `jump` and `wall` become "module adds, stock draws"

In `play()`, extend the impact exception: `if (e.kind === 'impact' || e.kind === 'jump' || e.kind === 'wall') { if (drew) e.__elemental = true; } else if (drew) return true;` and in `hop`/`wall` skip the element-coloured part when `e.__elemental` (the black shadow and the collision plate always draw; the plate at 0.15 alpha under an elemental wall, §7.8). Update the comment above `MODULES` and `drawnBy()` (`'module+stock'` for these kinds too).

### 7.4 `kit.js`: decals, `at`, lens, shockwave sector

- `DecalField` branches `grav`, `time`, `acid`, `rad` as described in §6 (each ≤ 20 lines in the style of `laser`); `DECAL_Y`: `grav: 0.021, time: 0.023, acid: 0.020, rad: 0.025` (existing: crater 0.014, soot 0.018, scorch 0.022, frost 0.026, laser 0.028, arc 0.030; acid below frost/arc/laser so later marks lie on the puddle).
- `decal(vfx, { …, at = 0 })` → `place({ …, now: vfx.now + at, … })`: the shader already treats a future `born` as invisible (`born.select(k, 0)`); nothing else changes.
- `lens(vfx, { x, y, z, size, life, strength })`: copy `heatMat`/`heat` into `lensMat`/`lens` with `pooled('lens', …)`, the offset toward the centre — `const mask = oneMinus(q.length()).clamp(0, 1).pow(1.5); markDistort(m, q.negate().mul(mask), mask.mul(fade));` (once; Appendix A is the same code) — and **without `heat`'s fade from birth**: `fade = strength·(t < life − 0.3 ? 1 : (life − t) / 0.3)`, held for the duration and released in 0.3 s.
- `shockwave` gets optional `dir` (world heading in radians, as `e.h`) and `half` (radians): add `half = uniform(Math.PI)` to `shockMat`'s `userData.u`; in both branches multiply alpha by `step(tcos(half), tcos(ang))` — `step(edge, x)`, edge first, whole ring when `half = π`. In `shockwave()`, inside `make()` before `spawnMesh`: `if (dir != null) mesh.rotation.y = dir − Math.PI / 2;` on both meshes (dust and hot). Why −π/2: uv angle 0 of `shockGeo` is local +x (`RingGeometry` uv; `rotateX(−π/2)` sends local y to world −z), a world heading `h` points at `(sin h, cos h)` as in `Vfx.cone`, and a Y-rotation θ carries local +x to `(cos θ, −sin θ)`, so θ = h − π/2. Do not map the heading inside the shader. Test on the stand with `cone` radiation: the wavefront must lie inside the wedge drawn by the stock `Vfx.cone`; if it lies 90° off, the sign above is what you got wrong.

### 7.5 `src/skills/registry.js` and its readers: elements, forms, release

The registry and its gates pin **five** elements in four places, `grammar()` serves the raw table to the model that writes creatures (`/api/grammar`, `src/server/api.js`; forge prompt `src/server/forge/pipeline.js`), and `tools/gauntlet*.mjs` pick random elements from the whole table. Adding an element without these edits turns `npm test` red and offers the element to creature generation before it exists. Do all of this in one commit, then `node tools/checkgrammar.mjs && node tools/checkspec.mjs && npm test` must be green before and after:

1. **Entries.** `gravity: { id: 'gravity', ru: 'гравитация', cost: 0, palette: ['#eef0f4', '#6f7a8c', '#141821'], read: 'тяжесть и притяжение', forms: ['zone', 'self', 'lob'], unreleased: true }` (time `['zone', 'self', 'blink']`, acid `['cone', 'lob', 'zone', 'bolt']`, radiation `['zone', 'lob', 'cone']` — append `'beam'` in the commit that ships the phase-2 beam of §6.5; palettes from §6.1). `forms` holds **delivery ids only** (a subset of `beam cone bolt lob zone dash blink self jump`); the five existing elements get `forms: Object.keys(DELIVERIES)`.
2. **Release helper**, after `ELEMENTS`:
```js
/** Стихии, отданные наружу. `unreleased: true` — модуль ещё не принят (docs/VFX-PLAN.md §7.5): стихия есть для сидов и стенда, но модели, клиенту и счёту прочтений не показывается. */
export function releasedElements() {
  return table(Object.fromEntries(Object.entries(ELEMENTS).filter(([, e]) => !e.unreleased)));
}
```
3. **E1 in `validateSkill`** (after the element check; must not throw on evil input — `checkgrammar` feeds `delivery: '__proto__'`):
```js
/* E1 — стихия бывает не всякой доставкой (решение основателя 03.09: «не каждой стихии нужны все формы»). Только при законной доставке: при незаконной `DELIVERIES[...]` — undefined. */
const d0 = DELIVERIES[skill.delivery];
const el = ELEMENTS[skill.element];
if (d0 && el && Array.isArray(el.forms) && !el.forms.includes(skill.delivery)) {
  bad.push({ code: 'E1', ru: `«${el.ru}» не бывает «${d0.ru}»: у этой стихии только ${el.forms.map((f) => DELIVERIES[f]?.ru || f).join(', ')}` });
}
```
   Update the header comment of `registry.js` (it says L1 is the only legality rule): "Второе правило — E1 (docs/VFX-PLAN.md §7.5, 03.09): `ELEMENTS[x].forms` — закрытый список доставок стихии."
4. **Unreleased at the HTTP edge**, in `validateKit` after the per-skill loop (a kit rule on purpose: `compileKit` forwards only `size`/`kit_budget`/`kit_dup`, so seeds and reading from the database keep compiling):
```js
/* Нерелизная стихия (docs/VFX-PLAN.md §7.5): игроку не отдаётся. */
kit.forEach((s, i) => { const el = ELEMENTS[s?.element]; if (el?.unreleased) bad.push({ code: 'element_unreleased', slot: i, ru: `стихия «${el.ru}» ещё не выпущена` }); });
```
5. **`readingCount()`**: enumerate per released element instead of multiplying (E1 makes elements non-orthogonal):
```js
export function readingCount() {
  let n = 0;
  for (const el of Object.keys(releasedElements())) for (const d of Object.keys(DELIVERIES)) for (const e of Object.keys(EFFECTS)) {
    const chs = EFFECTS[e].needsChannel ? Object.keys(CHANNELS) : [null];
    if (chs.some((ch) => !validateSkill({ delivery: d, effects: [e], element: el, ...(ch ? { channel: ch } : {}) }).length)) n++;
  }
  return n;
}
```
   With five released elements this still returns 495 (verify with `node -e "import('./src/skills/registry.js').then(m => console.log(m.readingCount()))"`).
6. **`grammar()`**: `elements: releasedElements()`. **`selfTest()`**: `if (Object.keys(releasedElements()).length !== 5) errs.push('выпущенных элементов должно быть 5')` and `for (const [id, e] of Object.entries(ELEMENTS)) if (e.forms && e.forms.some((f) => !DELIVERIES[f])) errs.push(\`элемент ${id}: forms называет несуществующую доставку\`);`.
7. **`tools/checkspec.mjs`**: import `releasedElements` and compare `Object.keys(releasedElements()).length === 5`, with the note "нерелизные стихии (docs/VFX-PLAN.md §7.5) в ТЗ не входят, пока основатель не примет модуль". It reads the **root** `SPEC.md` (`docs/SPEC.md` is a stale copy) and binds its "**495 мгновенно читаемых прочтений**" sentence to `readingCount()`.
8. **`tools/gauntlet.mjs` and `tools/gauntletpick.mjs`**: `const el = Object.keys(releasedElements());`.
9. **`tools/checkgrammar.mjs`**: add to the evil list `{ delivery: '__proto__', effects: ['damage'], element: 'time' }`, a positive case `ok('E1: время не бывает лучом', validateSkill({ delivery: 'beam', effects: ['damage'], element: 'time' }).some((b) => b.code === 'E1'))`, and "every offered form of an element with a module has a module function", guarded so the gate stays green before the module file exists: `const NEW = new Set(['gravity', 'time', 'acid', 'radiation']); for (const [id, e] of Object.entries(ELEMENTS)) { if (!NEW.has(id) || !Array.isArray(e.forms)) continue; let mod = null; try { mod = await import(\`../src/viewer/vfx/${id}.js\`); } catch { continue; /* модуль ещё не написан */ } for (const f of e.forms) ok(\`${id}: форма ${f} есть в модуле\`, typeof mod[f] === 'function'); }`.
10. **Forge prompt and repair** (`src/server/forge/pipeline.js`; otherwise E1 makes the forge silently replace a player's "time laser" with a kinetic preset): the element line becomes ``${Object.values(g.elements).map((x) => `${x.id} (${x.ru}${Array.isArray(x.forms) && x.forms.length < Object.keys(g.deliveries).length ? `; только доставки ${x.forms.join('/')}` : ''})`).join(', ')}``; in the repair loop, when every violation of a slot is `E1`, keep the slot and swap its element to `kinetic` with `repaired.push({ slot: i, why: \`${bad[0].ru} — стихия заменена на кинетику\` })` instead of the preset fallback. The gate for it is **not** `tools/checkprompt.mjs` (that one gates the brain prompt through a label whitelist; do not touch it): export the forge prompt builder from `pipeline.js` (the function that emits the `ЭЛЕМЕНТЫ (цена 0, только вид)` line, `parseUserPrompt(g)`) and add to `tools/checkforge.mjs`: `const g = grammar(); const txt = parseUserPrompt(g); for (const el of Object.values(g.elements)) if (Array.isArray(el.forms) && el.forms.length < Object.keys(g.deliveries).length) ok(\`промпт кузницы называет формы «${el.ru}»\`, txt.includes(\`${el.id} (${el.ru}; только доставки \`));` — vacuously green until such an element is released; falsify it once by clearing `forms` on one element.
11. **Release** (per element, after the founder accepts it on the stand): drop `unreleased`, bump the `5` in `selfTest` and `checkspec`, and edit the three frozen lines of the root `SPEC.md` — the ELEMENT row of §8 (`kinetic, ember, frost, arc, void · кандидат acid — открыт`), the readings sentence (495 → the new `readingCount()`), and "пять элементов" — **which is a ТЗ decision: never without the founder's written ok in the handoff.** Until then every new element stays `unreleased: true` and the gates stay at five.

### 7.6 `vfx.js`: `MODULES`

`const MODULES = { frost: iceFx, ember: fireFx, arc: arcFx, gravity: gravityFx, time: timeFx, acid: acidFx, radiation: radiationFx };` with the imports; `palette()` already reads the registry. The stand reads `ELEMENTS` from the registry, so new elements appear on it without edits.

### 7.7 `src/core/effects.js`: status records carry their duration

Every `fx.push({ kind: 'status', … })` in `src/core/effects.js` — burn, stun, root, shield, heal, cleanse, blind, silence, boost, weaken (all ten pushes exist; add none) — gets `...(atom.duration != null ? { duration: round3(atom.duration) } : {})`. `atom.duration` is the compiled, share- and tick-scaled value (`compile.js`) and is `null` for heal and cleanse, so those records carry no `duration` and P10 falls to its 0.6 s one-shot (`round3(null)` would be 0, and `??` passes 0 through — do not write `duration: round3(atom.duration)` unconditionally). The sim writes fx, VFX reads: the §9 invariant is untouched; records gain a field, no test changes. `src/viewer/vfxfixture.js` `fxFor('status')` gets `duration: 4`.

### 7.8 `vfx.js`: stock palette pass (Part B, and the wall plate of A9)

Add a helper next to `basic`: `const inkMat = (c, opacity) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.NormalBlending });` (plain materials, no node graph, not pooled). Edits: `cone` and `zone` — a second mesh with `inkMat(P[2], 0.35)` scaled ×1.02 under the additive one; `shell` — an `inkMat(P[2], 0.25)` sphere under the additive one; `dash` ribbon — `inkMat(P[2].clone().multiplyScalar(0.6), 0.5)`; `blink` rings — `inkMat(P[2], 0.9)` ring plus the existing white ring at ×0.6 width; `wall` — the box is `inkMat(P[2], e.__elemental ? 0.15 : 0.25)` (the 0.34 additive `P[1]` plate is gone) **and** in its `spawnMesh` callback the `0.34 *` becomes the same `(e.__elemental ? 0.15 : 0.25) *` (the opacity is re-set there every frame); `bolt`/`lob` sprites — `s.color(P[2], P[2])` in `this.body`. Kinetic: the same with `P[2].clone().multiplyScalar(0.8)`. Nothing else in `vfx.js` changes.

---

## 8. Order of work, checkpoints, what to report

### 8.1 Start state (do this first, exactly)

1. Make sure no round-2 loop is still writing: `pgrep -fl vfxshot; ls "${TMPDIR:-/tmp}/airena-vfxshot.lock" 2>/dev/null; lsof -ti tcp:8840-8849` must all be empty (a worktree viewer on 8840–8849 means a builder may still be alive — kill nothing, wait), and `git diff --stat` must be identical five minutes apart before step 3. Never add `forge/creature.*` (unrelated to this work).
2. Read the last `reports/vfx/r2-arc/r<N>/` and `reports/vfx/r2-laser/r<N>/` that contain **both** `final/index.json` and `final.patch` (at the time of writing `r1` for both; a directory with only `i<k>/` is a round that was still running or was interrupted), the header and §5 of `PRIMITIVE-NOTES.md`, and the handoff for the scores; the handoff at HEAD may predate round 2.
3. **Commit by name, never `-A`**, in this order (skip a step if the handoff says it was already committed):
```
git add .claude/launch.json src/viewer/index.html src/viewer/vfxdemo.js src/viewer/vfxfixture.js src/viewer/vfxstand.js src/viewer/vfx.js tools/vfxchrome.mjs tools/vfxclip.mjs tools/vfxlock.sh tools/vfxshot-lock.sh tools/vfxshot.mjs docs/vfx-notes/polish.sh docs/vfx-notes/LIGHTNING-BRIEF.md docs/VFX-PLAN.md docs/VFX-HANDOFF.md
git commit -m "Инструменты 03.09: стенд, стойка, ролики, замок GPU, группировка моментов, план"
git add src/viewer/vfx/arc/beam.js src/viewer/vfx/arc/common.js src/viewer/vfx/arc/field.js docs/vfx-notes/PRIMITIVE-NOTES.md
git commit -m "Молния: луч — круг 2 по списку судей (кадры reports/vfx/r2-arc/r<N>/final)"
```
   (`src/viewer/vfx.js` in the first commit carries only `drawnBy`; if the lightning loop also touched it, `git add -p` and take only that hunk.)
4. Laser round 2 into main, `<N>` = the last round with a `final.patch` (step 2): `git apply --check reports/vfx/r2-laser/r<N>/final.patch && git apply reports/vfx/r2-laser/r<N>/final.patch` (it edits `laser.js` and the `laser` branch of `kit.js`'s `DecalField` — merge only that branch and `DECAL_Y`, nothing else in `kit.js`), `node --check src/viewer/vfx/laser.js src/viewer/vfx/kit.js`, then `tools/vfxshot-lock.sh --port=8823 --el=kinetic,void --kind=beam --cams=broadcast,side --moments=0.45 --out=$PWD/reports/vfx/laser-r2-check` with `errors` empty, then `git commit -am "Лазер: круг 2 по списку судей (патч reports/vfx/r2-laser/r<N>/final.patch)"`.
5. Reset the stand worktree (§0.3, one-time command) and restart its viewer.

### 8.2 Order

1. **A0** primitive additions → **A1** beam to acceptance (the items not marked done in `PRIMITIVE-NOTES.md` §5 plus the last `mustFix`) → **A2** bolt → **A3** lob → **A4** self (with §7.1 and §7.7 first) → **A7** impact → **A5** cone → **A6** zone → **A8** charge → **A9** dash, blink, jump, wall, status (with §7.3). Checkpoint after A4: rebuild the demo page with the four lightning forms and refresh the stand worktree; the founder looks.
2. **B** laser to acceptance → §7.8 palette pass for void and kinetic. Checkpoint: demo page with kinetic and void.
3. **C** frost and ember stock forms.
4. **D** in this order: **gravity** (fewest new primitives: lens + decal + falling dust), **time** (bubble + hoops + motes), **acid** (droplets + carpet), **radiation** (flecks + dome + fume + the phase-2 beam). For each: registry entry with `unreleased: true` and all of §7.5 → module with the forms in the matrix order (zone first, it is the hero form of all four) → `status` and the wall palette pass → seeds into the stand database → gates → acceptance on the stand and the demo page → the founder's ok → release (§7.5 step 11) → seeds into the real database. Checkpoint after each element.
5. Full sweep (`tools/vfxshot-lock.sh --el=frost,ember,arc,void,kinetic,gravity,time,acid,radiation --kind=beam,cone,zone,self,bolt,lob,impact,charge,dash,blink,jump,wall,status --out=$PWD/reports/vfx/after3`), the gallery, `npm test`, handoff.

Time budget per form, from the 02–03.09 sessions: one form = one to three hours of capture-and-look; a rewrite (bolt, self) = four to six; an element = a day. Do not spend more than two iterations on a look that does not converge without going back to the spec and the reference; write down what you tried.

Report after every form in `docs/VFX-HANDOFF.md`: the form, the commit, the final frames' path, the checklist of 0.2 with each box honestly ticked or not, the numbers you measured, and what you left undone.

---

## Appendix A — Pseudo-code for the new primitives

```js
// field.js — surfaceSegs: seeded random walks on an ellipsoid (r, ry, rz) around c
function surfaceSegs(s, rng, put) {
  const [cx, cy, cz] = s.c, r = s.r, ry = s.ry ?? r, rz = s.rz ?? r, off = s.offset ?? 0.03;
  if (!(r > 0.2) || !(ry > 0.2) || !(rz > 0.2)) return;                 // the projection divides by them
  const n = s.n ?? 10, links = s.links ?? 6, link = s.link ?? 0.3, minY = s.minY ?? 0.06;
  const width = s.width ?? 0.021, bright = s.bright ?? 1, phase = s.phase ?? 0, spin = (s.spin ?? 0) * (s.t ?? 0);
  const proj = (p) => {                                                  // back onto the shell, `off` above it
    let qx = (p[0] - cx) / r, qy = (p[1] - cy) / ry, qz = (p[2] - cz) / rz;
    const l = Math.hypot(qx, qy, qz) || 1; qx /= l; qy /= l; qz /= l;
    return [cx + qx * r * (1 + off), Math.max(minY, cy + qy * ry * (1 + off)), cz + qz * rz * (1 + off)];
  };
  const normal = (p) => [(p[0] - cx) / (r * r), (p[1] - cy) / (ry * ry), (p[2] - cz) / (rz * rz)];
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const gi = mulberry(((s.seed ?? 1) ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);   // per-filament: cells persist
    let p = s.start ? proj(s.start) : proj([cx + (gi() - 0.5) * 2 * r, cy + (gi() - 0.5) * 2 * ry, cz + (gi() - 0.5) * 2 * rz]);
    let hd = rotateAroundNormal(tangent(gi, normal(p)), normal(p), spin);
    let zig = gi() < 0.5 ? -1 : 1;
    const pts = [p];
    for (let k = 0; k < links; k++) {
      const step = link * (0.7 + gi() * 0.6);
      const q = proj([p[0] + hd[0] * step + (rng() - 0.5) * 0.08, p[1] + hd[1] * step + (rng() - 0.5) * 0.08, p[2] + hd[2] * step + (rng() - 0.5) * 0.08]);
      put(p[0], p[1], p[2], q[0], q[1], q[2], width, bright, phase + i, 1);
      pts.push(q); p = q;
      if (gi() < 0.75) zig = -zig;
      if (rng() < 0.25) zig = -zig;                                      // per-restrike life: a quarter of the turns flip
      hd = rotateAroundNormal(hd, normal(p), zig * (0.9 + gi() * 1.0));  // 50–110°
    }
    nodes.push(pts);
  }
  // rungs between nearby nodes of different filaments: the rung code of bundleSegs with d < 0.35·r, recomputed each strike
}
```

```js
// a propagating discharge (bolt, lob, dash): the field is fixed, the window slides; the head is its own field
const head = clamp01(t / travel), tail = Math.max(0, head - W / len);
field.set({ fade: 1, hot: rs.tick(t), reach: head + 0.001, tail });      // always pass hot
headF.set({ reach: 1, tail: 0, hot: rsHead.tick(t) });                   // rewritten from H = S + dir·len·head each restrike
```

```js
// kit.js — lens: radial distortion toward the centre (gravity)
const q = uv().sub(vec2(0.5, 0.5)).mul(2);
const mask = oneMinus(q.length()).clamp(0, 1).pow(1.5);
markDistort(m, q.negate().mul(mask), mask.mul(fade));
```

## Appendix B — Forms matrix

Deliveries (refusable by the grammar, §7.5):

| | beam | cone | zone | self | bolt | lob | dash | blink | jump |
|---|---|---|---|---|---|---|---|---|---|
| arc | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| frost, ember | ● | ● | ● | ● | ● | ● | C | C | C |
| kinetic, void | laser | stock | stock | stock | stock | stock | stock | stock | stock |
| gravity | – | – | ● | ● | – | ● | – | – | – |
| time | – | – | ● | ● | – | – | – | ● | – |
| acid | – | ● | ● | – | ● | ● | – | – | – |
| radiation | ●² | ● | ● | – | – | ● | – | – | – |

Viewer kinds (reach every element; the module draws or the stock silhouette does, in the element's palette):

| | impact | charge | status | wall |
|---|---|---|---|---|
| arc | module + stock | module | ● (A9) | ● (A9) over the plate |
| frost, ember | module + stock | module | C | C |
| kinetic, void | stock | – | stock | stock (palette pass) |
| gravity, time, acid, radiation | ● | ● | ● | stock plate, palette pass |

● module draws it · C Part C · – not offered · ●² phase 2 (radiation's `forms` gets `'beam'` only in the commit that ships it).
