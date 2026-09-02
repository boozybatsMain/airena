# Lightning rework brief (Airena, `src/viewer/vfx/arc/`)

Repo: `/Users/boozybats/Public/Repos/work/Airena` (three.js r180, `WebGPURenderer` + TSL, WebGL2 fallback). Code comments and docs in this repo are in **Russian**; write your comments in Russian, in the same voice (explain the *why*, cite measurements).

## Goal

The founder judged the current lightning "very poor" and asked for **truly realistic lightning at Path of Exile 2 level**, reference = Storm Lance (`reports/vfx/reference/ref-storm-{120,380,800,1500}.png`; upscaled crops in this scratchpad: `ref-storm-*-crop.png`). The current frames are in `reports/vfx/arc-base/` (`arc-<kind>-t<moment>-<cam>.png`, moments 0.1/0.3/0.6 s, cams broadcast/low/top). Look at both before writing code.

## What the reference actually looks like (measured by eye, 1280×720 frames)

1. **The bolt is a cage, not a rope.** From a single point at the hand, ~12–20 filaments diverge into a tube-shaped bundle ~0.8–1.4 m across (cone: narrow at the hand, wide at the far end). Each filament is a jagged polyline with 0.3–0.6 m segments and sharp 30–60° kinks. Filaments **cross each other repeatedly**, converge and diverge, and are tied by short cross-links (rungs), so the bundle reads as a net of polygonal cells. Short stubs branch off and end in space. The far end (impact) is the densest and brightest: a white tangle.
2. **Line rendering.** Each filament: a ~2 px pure white HDR core, a 6–10 px saturated blue halo (≈#4d9bff → #1a5cff), a faint wide outer glow. Overlaps add up, so crossings and the impact tangle bloom white. Nothing is grey, nothing is pastel.
3. **Floor residue ("ground crackle").** Under and beside the whole path, a carpet of small (0.2–0.5 m) bright blue jagged marks and dots, spread ±1–1.5 m from the axis; densest under the far half. It appears with the bolt, outlives it (still visible as scattered dark-blue marks at 1.5 s), and fades last.
4. **Muzzle.** During the first ~300 ms a soft bluish-white sphere ~1.2 m across sits at the hand (cast orb), with a bright core where the bundle leaves it.
5. **Impact.** A big soft white cloud (~2.5 m) at the target, long thin white spikes (streak sparks 0.5–1.5 m long) flying radially, a thin expanding white ring on the floor, then residue.
6. **Sparks.** Long thin white-blue streaks fly out of the bundle sideways (velocity-stretched), plus small dots.
7. **Timing.** Emergence ≈ 100 ms (the bundle grows from the hand), full for ≈ 500 ms with the net re-drawn every 40–60 ms (restrike), decay ≈ 300 ms, residue ≈ 1.5 s total.

## Why the current one fails (see `reports/vfx/arc-base/arc-beam-*.png`)

- 3–9 nearly parallel strands, no crossings, no cells, no divergence: it reads as a few wavy lines.
- Too thin and too pale at 26 m: the jacket is semi-transparent, the core is not hot enough, halo is invisible on the white floor. Reads as light-blue smudge.
- Almost no floor residue; the "ground contacts" are a couple of thin lines.
- Muzzle and impact are weak blobs; no spikes, no ring that reads.

## Hard constraints (the codebase enforces most of these; break none)

- **TSL only, no GLSL, no `ShaderMaterial`** (§9.1): everything runs on WebGPU and WebGL2. Node materials: `THREE.MeshBasicNodeMaterial`, `vertexNode`, `colorNode`, `opacityNode`. Use `withFade` for fade (opacity field is ignored when `opacityNode` is set).
- **WebGPU pipeline limit: 8 vertex buffers.** The particle pool already uses one interleaved buffer for this reason. Instanced attributes: use one `InstancedInterleavedBuffer`.
- **Materials come from `pooled(key, make, ring)`** (`src/viewer/vfx/core.js`): a fresh node material costs 12–22 ms on the spawn frame. Never build a node material per cast. Geometry that is shared across casts must be marked with `shared()`; `updateFx` disposes everything else when the effect dies.
- **Bloom is selective by mask** (`markGlow(material, node)`), never by threshold: the floor must never bloom. HDR colours above 1.0 in the core are fine and expected (post graph blooms in HDR before ACES).
- **The arena floor is white** (`0xe9e6de`, HDR > 1 under the key light). Additive layers vanish on it. Anything that must read on the floor needs normal blending and a dark/saturated colour. The founder allows local darkening of the floor under effects (soot, burn), and every cast must leave a persistent floor decal (`kit.decal`, hold ~20 s; `arc` decal type exists; the ring is 28 per type, so a long trail of decals is not free).
- **Determinism (A2):** all randomness from `mulberry(seedOf(e))`; a replay must look the same. No `Math.random` in the module.
- **Size is a parameter:** densities come from `kit.footprint(e)` and `kit.countFor(base, area, refArea, cap)`, never constants. Ranges, angles and radii will change; the effect adapts, it does not stretch.
- **Public contract:** `arc.js` exports `cone zone self beam bolt lob impact charge` as `(vfx, e, P, ctx) => boolean`. `P` is `[highlight, body, deep]` = `['#eef8ff','#8ecbff','#0a5cff']`. `ctx.bodyPos(who)` may be null. Keep every delivery working (they share `field.js`/`common.js`).
- **Effect pool contract:** `vfx.spawnMesh(obj, life, (obj, u) => {})`, `u` = normalized age. Timings in seconds from `vfx.now`. `vfx.add.emit / vfx.body.emit / vfx.glow.emit` are the particle pools (see `Particles.emit` in `src/viewer/vfx.js`; shapes in `kit.SHAPE`, `s.ext(spin, endSize, stretchByVelocity, glowWeight)`).
- **Light pool is 4 `PointLight`s** (`vfx.flashLight`); never add lights to the scene.
- **`tools/checkscope.mjs`** scans code text for forbidden words: no prices, no "токен", no "скин", no `new Audio`, no `.play();`. Keep comments clean.
- **Frame budget:** the founder accepts dips to 20 fps at the peak, no lower. `window.__airenaSweep.stats().fps` is written into `index.json` of each capture as `fps`.
- No new npm dependencies.

## How to build and look (the only acceptance that counts)

Captures are taken in the **real combat scene** on real WebGPU by `tools/vfxshot.mjs` via headless Chrome. Always run captures through the lock wrapper so only one Chrome touches the GPU at a time (timing drifts otherwise; check `actual` vs `moment` in the produced `index.json` and re-shoot if a frame drifted > 0.08 s):

```
tools/vfxshot-lock.sh --port=<PORT> --el=arc --kind=beam --moments=0.1,0.3,0.6 --out=<ABS OUT DIR>
```

- `--kind=beam,cone,...` selects deliveries; `--cams=broadcast` restricts cameras; `--moments=...` picks seconds after cast. Broadcast (26 m) is the camera the viewer actually sees: judge there first.
- The tool needs a dev viewer serving *your* tree: `PORT=<PORT> node src/server/index.js > /tmp/viewer-<PORT>.log 2>&1 &` from your tree root, then `curl -s -o /dev/null -w '%{http_code}' http://localhost:<PORT>/` must be 200. If you work in a git worktree, `node_modules` is missing: `ln -s /Users/boozybats/Public/Repos/work/Airena/node_modules node_modules` first.
- Read the produced PNGs with the Read tool and compare against the reference. Iterate: code → capture → look. Do not stop at "it compiles". A change you did not look at is not done.
- Console errors are collected into `index.json` → `errors`; zero is the requirement.
- **Close moments are shot as separate casts.** `Page.captureScreenshot` costs ~0.3 s on WebGPU and delays the next queued moment of the same cast (0.06,0.15,0.3 landed at 0.06,0.43,0.78 on 02.09). Since 03.09 `vfxshot.mjs` groups `--moments` so that moments within one cast are ≥ `--gap` (0.45 s) apart and shoots one cast per group per camera; `index.json` lists the groups under `casts` and each shot carries its `cast` index. Effects are deterministic per cast, so frames from different casts agree. `--moments=0.06,0.12,0.38,0.8,1.5` therefore works in one command (three casts per camera).
- **Motion.** `tools/vfxlock.sh node tools/vfxclip.mjs --port=<PORT> --el=arc --kind=beam --cam=side --out=<DIR>` records one cast as a 60 fps screencast (mp4 via ffmpeg, animated webp via PIL) with `<name>.json` giving the cast offset inside the clip. Extract frames with `ffmpeg -ss <t> -i <mp4> -frames:v 1 f.png` to check restrike flicker, emergence and decay timing that stills cannot show. Same GPU lock as the stills.
- Syntax check: `node --check <file>`.

## Files

```
src/viewer/vfx/arc.js         entry: re-exports (do not change the export list)
src/viewer/vfx/arc/util.js    TAU, clampN, hex, env, onSphere, bodyAt
src/viewer/vfx/arc/field.js   the primitive: LAYER, boltMat/makeBoltMat, STRIDE, boltField, strandSegs
src/viewer/vfx/arc/common.js  orb, halo, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs
src/viewer/vfx/arc/beam.js cone.js zone.js self.js ball.js impact.js   deliveries
src/viewer/vfx/core.js kit.js  foundation and impact kit (read them; do not edit them unless told)
src/viewer/vfx.js              orchestrator: Vfx, Particles pools, palettes, stock silhouettes
src/viewer/vfx/ice.js fire.js  the two other modules (ice is the quality bar the founder accepted)
```
