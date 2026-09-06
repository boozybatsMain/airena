# Arena port — `src/viewer/main.js` takes the environment

The stand (`src/viewer/arena.html` + `src/viewer/environment.js`, STAND-NOTES
§4) is now what the game draws. `buildEnvironment`'s signature and return
shape were treated as fixed; environment.js and arena.html were not edited.
The module moved on while the port was being made (round 3 on disk at 09:35 —
wash vignette, `initialQuality`, `qualityGovernor`, a wall rule and a ring
rule); everything additive in it was taken, and the two rules that live in
occlusion code are listed under §7 rather than applied.

## 1. What changed in `main.js`, by block

| block | before | now |
|---|---|---|
| imports | — | `buildEnvironment, preTone, srgbToLin, REFLECT_LAYER, initialQuality, qualityGovernor` from `./environment.js` |
| the grade (`HAZE`, `HAZE_BURN`, `GROUND`, `GROUND_BURN`, `scene.background`, `scene.fog`) | 60 lines of constants and their history | deleted; the module sets background and fog. `const scene` and the camera stay, so `checkframing`'s second slice is unchanged |
| `renderer.shadowMap` | `enabled` + `PCFSoftShadowMap` | both lines kept; the module overwrites the type with `VSMShadowMap` at build |
| exposure | `toneMappingExposure` 0.90, `postU.exposure` 0.94 | `const ENV_EXPOSURE = 1.0`, read by the raster path, by `postU.exposure`, and passed as `exposure` to `buildEnvironment`; asserted once after `postU` is built (`throw` if they disagree) |
| the DOM vignette `#arena-vignette` | a radial gradient in `--ink` over the canvas | **deleted** (round 3 of the stand: "the port deletes main.js's radial-gradient element"). Nothing else referenced the id |
| the environment | — | after `renderer.init()`, before the post graph: `isWebGL`, `?quality=` pin, `initialQuality({ isWebGL, width, height })` (DPR-aware: > 2.6 MP of drawing buffer starts at `medium`), `buildEnvironment(THREE, TSL, { scene, renderer, camera, cfg, half, wallHeight, obstacles, quality, exposure: ENV_EXPOSURE })`, `window.__airenaQuality`, and `toned(hex)` = `preTone` → `THREE.Color` |
| post modules | one `import()` of BloomNode | one `Promise.all` of Bloom, GTAO, Denoise, SMAA, FXAA (all five whatever the tier — the tier can drop at run time) |
| the post graph | one inline `try` block | `buildPost(q)` (§2) + `applyPost(q)`: builds, swaps, disposes the old parts; on failure keeps the previous graph or, on the first build, leaves `post === null` (direct render, ACES on the raster). `setGlowEnabled(true)`, `__airenaBloom`, `__airenaPost` as before |
| `skyRamp`, `skyMat`, `sky`; hemisphere 0.45, ambient 0.58, key 5.0 at 15°, rim `0x8FB6F0`; `groundMap`, `floorMat`, `floor`; `apronMap`, `apron`; `grid` | ~490 lines | deleted — the dome, the rig, the floor, the plaza and the marks come from the module; no ambient, no blue rim |
| `SOLIDS` | walls and blocks built here with `surfaceMap`, wireframes, the coral props | the anchor `const SOLIDS = [];` kept, followed by DATA ONLY (four walls +z, −z, +x, −x, then the config blocks, `mats: []`), so `tools/checkframing.mjs`'s slice still evaluates in Node with no `env` |
| the binding | — | before `const GHOST_BODY`, outside every slice: length check + per-entry position assertion (`x, z, hx, hz`), then `SOLIDS[i].mats = env.solids[i].mats`; `updateOcclusion` unchanged — its `m.opacity = o.fade` now takes the alpha-scaled shadow with it |
| `COLOR` | `0x39c6d8` / `0xe0762b` | `{ blue: 0x6EA8FF, orange: 0xFF7A5C }` (`--info` / `--accent`) for the DOM (feed, damage numbers, result card — unchanged call sites), plus `SCENE_COLOR` = the same pre-toned, `WHITE`, and `MISS_COLOUR` = `toned(0x8a8f99)` for every material: telegraph ring disc + rim, cone, lane, zone disc, aim line (`telegraphMat` takes a `THREE.Color`), beam + glow + impact flash, blink tori, the cone flash, the ghost body + ring, and the i-frame swap (`.color.copy(v.inv ? WHITE : SCENE_COLOR[id])`) |
| `bodyFor` | — | `made.root.traverse(o => o.layers.enable(REFLECT_LAYER))` on every built body (stock at boot and generated at swap both go through it) — the floor mirrors bodies only |
| the precompile | — | after the stock bodies stand in the scene: `await scenePass.compileAsync(renderer)` (the pass's own target and MRT, `createRenderPipelineAsync`), the render target and MRT restored by hand if it throws. The first `post.render()` measured 3.1–3.2 s on the main thread before it (§5) |
| sudden death | `floorMat.color.lerpColors`, fog/background lerps, `skyMat.color` tint | `env.applySuddenDeath(heat)` |
| `window.airena` | — | `+ env, quality` |
| `drawFrame` | `drawHitFlash(); post.render()` | the banner rule (`env.banner.visible = camModes[camMode] === 'wide' \|\| !(frames.length && !decided)` — hidden while the orbit or top camera frames a fight, shown in `wide`, searching, VS and the result), `drawHitFlash()`, then `env.update(dt)` (after the hit-flash pass so its layer-3 render can never consume the frame's one shadow refresh), the governor tick (§3), then `post.render()`; a `drawn` counter (`window.__airenaDrawn`: frames drawn, first draw's start and cost) and a `firstDraw` mark into the shell's `__airenaMarks` from `bootLanded()` |
| the loop | the fps counter | unchanged; the tier logic lives in the governor (§3) |

Untouched: the camera section (`camModes` … `checkFraming`), `segSolid`,
`hiddenCount`, `updateOcclusion`, the VFX layer, the socket, the simulation
bridge. Every string is English; the SOLIDS slice and the loop slice evaluate
in `checkframing` exactly as before.

## 2. The post graph (`buildPost(q)`)

```
pass(scene, camera, { samples: isWebGL ? 0 : 4 })
  MRT: output, bloomIntensity, distort (+ normal: normalView on 'high')
  → heat distortion (distort.xy · z · postU.distort)          unchanged
  → chromatic aberration (R/B radial, ×0.011)                 unchanged
  → 'high': ao(depth, normal, camera) r 0.7 s 0.7 16 spp @0.5 → denoise r 4
            aoF = mix(ao, 1, glow) — the telegraphs are exempt; lit = colour × aoF
  → bloom(colour × glow, 0.9, 0.85, 0) in HDR                unchanged
  → hdr = lit + bloom × postU.bloom
  → toneMapping(ACES, postU.exposure = 1.0)
  → the WASH vignette: mix(mapped, srgbToLin(#F4EEE8), smoothstep(0.25, 1.35, r²·2.4) × 0.4),
    r measured from (0.5, 0.46); aberration/distortion stay centred at (0.5, 0.5)
  → hit flash (mix toward the element's colour)                unchanged
  → the victim's red silhouette (hitRT)                        unchanged
  → renderOutput → sRGB
  → ±0.5/255 hash dither (hash(px.x + px.y·4096))
  → smaa ('high', 'medium') | fxaa ('low')
```

`normal` is the 4th RGBA16F attachment = 32 B/sample, WebGPU's default
`maxColorAttachmentBytesPerSample`; a 5th output would fail validation. A
tier change builds a new scene pass (a new render target → a new render
context → every material recompiles against the new MRT layout by itself),
swaps `post`, and disposes the old pass, AO, denoise, bloom, AA and quad.

## 3. Tiers and the meter

| tier | AO | reflection | AA | shadow map | who starts here |
|---|---|---|---|---|---|
| high | GTAO + denoise | bodies only | SMAA | 2048 | WebGPU at ≤ 2.6 MP of drawing buffer |
| medium | — | — | SMAA | 2048 | WebGPU over 2.6 MP (a Retina laptop at DPR 2) |
| low | — | — | FXAA | 1024 | WebGL2, always |

The meter is the module's `qualityGovernor`: a rolling mean of the frame's
wall-clock delta over 120 frames after a 40-frame warm-up; two seconds under
45 fps → `medium`, under 30 → `low`; never up. It is ticked in `drawFrame`
next to `env.update`, never with a frame over 250 ms (a throttled tab is the
browser choosing not to draw) and never while `document.hidden`; it is HELD
while a fight is on the screen and released at the boundary, so a graph
rebuild never lands mid-fight. `onChange` → `env.setQuality(q)` +
`applyPost(q)`. `?quality=high|medium|low` pins the tier and switches the
governor off. `gov.msPerFrame` is exposed as `window.__airenaGov` and the
capture tool writes it beside every picture.

## 4. Gates

| gate | result |
|---|---|
| `node --check src/viewer/main.js` | ok |
| `node tools/checkboot.mjs` (with the `three/addons/` mapping) | 77 files; raw **4.48 MB of 6.00**, gzip **1.45 MB of 1.80**, 0.35 MB of headroom (before the port: 70 files, 4.35 / 1.39). The five post nodes add 0.13 MB raw / 0.06 MB gzip; SMAANode is the largest at 0.06 → 0.04 |
| `node tools/checkframing.mjs --dump=/tmp/airena-trail.json` | HOLDS — 18 matches, 2 aspects, 60 464 frames; worst \|ndc\| 0.879 (16:9) / 0.878 (4:3) inside 0.92 |
| `node tools/checkcamera.mjs --trail=/tmp/airena-trail.json` | HOLDS — 36 runs, 54 782 frames; dist / height / az within the ceilings |
| `node tools/checkvfx.mjs` | HOLDS (after the `core.js` guard, §7) |
| `node tools/checkfacade.mjs` | ok — 108 members, no path out of the facade |
| `node tools/checkscope.mjs` | holds — 68 bundle files, 0 violations (English copy, no Cyrillic in strings) |
| `node tools/checkdocs.mjs` | README and the repository agree (8 query parameters; `?quality=` is read by main.js and not documented, which the gate allows) |

## 5. Captures and what they measured

`node tools/shots.mjs --base=http://localhost:8787 --out=reports/screens/ui
--only=live-fighting,live-vs,live-result-win,live-result-loss,live-searching,live-visitor
--wait=9000 --db=data/airena.db` — round 2 (after the wash, the governor and
the precompile), headless Chrome, WebGPU, DPR 1:

| state | 1440×900 | 1280×720 (`-w`) | 390×844 (`-m`) | errors / overlaps / covered | tier | `rendererReady` |
|---|---|---|---|---|---|---|
| live-visitor | `live-visitor.png` | `-w` | `-m` | 0 / 0 / 0 | high | 3050 / 3046 / 2939 ms |
| live-searching | `live-searching.png` | `-w` | `-m` | 0 / 0 / 0 | high | 3063 / 3047 / 3002 |
| live-vs | `live-vs.png` | `-w` | `-m` | 0 / 0 / 0 | high | 2976 / 3062 / 3026 |
| live-fighting | `live-fighting.png` | `-w` | `-m` | 0 / 0 / 0 | high | 3053 / 3128 / 3011 |
| live-result-win | `live-result-win.png` | `-w` | `-m` | 0 / 0 / 0 | high | 3172 / 4292 / 2997 |
| live-result-loss | `live-result-loss.png` | `-w` | `-m` | 0 / 0 / 0 | high | 3080 / 3123 / 3027 |

All 18 in `reports/screens/ui/`, CLEAN. Looked at, every one: the sunken
pale field with the coping band and the notch stair over the far wall, the six
plain blocks (lit top, shaded flank, one long soft shadow each), the plaza and
the −x tier wing pale into haze at the top-left, a pale sky with no fog milk
on the field; the fighters are the darkest objects in every frame; the
telegraph rings are crisp `--info` / `--accent`; the HUD's names, bars and
tiles read on the bottom fifth and the feed glass on the right fifth. The
searching frames (boot camera) show the near wall and its notch at
bottom-centre, unfaded — the wall rule (§7). No console error in any capture;
the only red on the floor is the hit silhouette and the foe's ring.

`rendererReady` is the shell's mark for `import('/viewer/main.js')` resolving:
config, renderer init, environment (PMREM), the five post modules, the two
stock bodies AND the async precompile. Before the precompile it was 0.95–1.2 s
with a 3.1–3.2 s first draw on the main thread; now ~3.0 s with the scene's
pipelines already built when the first frame comes.

**Frame rate in these JSONs.** `fps.last` is 0 and `drawn.n` is 0 in every
one: the capture harness's Chrome (vsync on) does not tick the page's
animation loop on its own — the A/B against the pre-port `main.js` ticked 0
and 1 times in 9 s the same way — so the frame in each picture is the
screenshot's own BeginFrame and the counter had no second to count. The
honest number comes from the `--novsync` run (§5.1) and from the stand
(`reports/arena/stand.json`: high 10.7–12.2 ms/frame at 1440×900 on this
machine, 81–93 fps; medium 7.4 ms; low 7.0; WebGL2 low 8.6).

### 5.1 The no-vsync run (`reports/screens/fps/`)

`node tools/shots.mjs --novsync --only=live-fighting,live-searching --no-mobile
--no-laptop --wait=12000` — Chrome with `--disable-frame-rate-limit
--disable-gpu-vsync`, as `arenashot.mjs` runs. Both pictures drawn, 0 errors,
tier `high`, `rendererReady` 5400 / 6291 ms — and still `fps.last` 0,
`ticks` 0, `drawn.n` 0 at the probe: the page's animation loop does not run
on its own in `shots.mjs`'s targets whatever the vsync flags (the stand's
tool drives the same `openPage` but polls `__arenaReady` for 24 frames, which
is what keeps its page ticking). **So no capture JSON carries a live frame
rate for the game**; the flag stays (opt-in, harmless) and the numbers the
governor would see are the stand's: `high` 10.7–12.2 ms/frame (81–93 fps),
`medium` 7.4, `low` 7.0, WebGL2 8.6 at 1440×900 on this machine, with the
game adding two posed fighters and the VFX pools on top. The first draw's
main-thread cost, which the JSONs did measure before the precompile
(`drawn.firstMs` in the 20 s runs): 3121 and 3190 ms.

## 6. WebGL2 fallback (`reports/screens/webgl/`)

`--base="http://localhost:8787/?webgl=1&x="` (the router reads only the
hash, so a query before it is safe) `--only=live-fighting,live-searching
--no-mobile --no-laptop --wait=12000`:

| state | backend | tier | errors | `rendererReady` | picture |
|---|---|---|---|---|---|
| live-fighting | `webgl2 (forced)` | low | 0 | 3031 ms | drawn: the anchor camera over the pit, blocks, soft VSM shadows, the blue ring, the red hit silhouette; the post graph built (bloom + MRT + FXAA on WebGL2, `samples: 0`) |
| live-searching | `webgl2 (forced)` | low | 0 | 3005 ms | drawn: the boot camera, the same grade as `stand-default-webgl.png` — no AO, no reflection, FXAA edges, 1024 shadow map |

`initialQuality` returns `low` on the WebGL backend and the governor has
nothing below it to go to; `buildPost('low')` takes the FXAA branch and no
`normal` attachment.

## 7. Left, and what was found on the way

- **The wall rule and the ring rule (stand round 3, in `arena.html`'s
  comments) are NOT applied.** Both live inside `updateOcclusion`, which this
  port was told not to touch. The stand prescribes, verbatim: after
  `o.want = 1`, for `SOLIDS[0..3]`, `wallHidesField(camera.position, s) >= 1.5`
  → `o.want = FADE_TO` (the strip of floor a wall's top edge hides from an eye
  at height h: `WALL·d/(h − WALL) − 0.8`, d = the eye's distance outside the
  wall's outer face; the boot camera hides 1.6 m → fades, the fight camera
  −0.1 → not); and `ringHidden = SOLIDS.some(o => o.fade > 0.6 &&
  segSolid(camera.position, v.x, 0.05, v.z, o))` →
  `gh.ringMat.opacity = GHOST_RING · max(gh.on, ringOn)` with `ringOn` eased at
  16/5. `arena.html` photographs both under `?wallrule` and `?ghost=1`. From
  the boot camera (searching, VS, result) the near wall and its notch cut
  faces therefore still stand at bottom-centre in the captures, as the stand's
  `default` frame had them before the rule.
- **The VS-card camera.** The stand's `vs` preset now aims 2 m up so the
  planet's 4° disc clears the frame; the game has no VS camera of its own —
  the VS card lies over whatever the orbit or boot camera shows — so there is
  nothing to check until one exists.
- **`src/viewer/vfx/core.js`** (the stand's own round-2 change, `SafeMRT
  extends THREE.Node`) could not be imported under Node at all — `three`
  resolves to the core build there, where `Node` is undefined — and
  `checkvfx` and `checkdocs` died on the import. One guard,
  `extends (THREE.Node || Object)`, with a comment; nothing else in the file.
- **The capture harness ticks rAF on demand.** In `tools/shots.mjs`'s Chrome
  (vsync on, no frame-rate flags) the page's animation loop ran 0–2 times in
  20 s; the frame in every picture is the screenshot's own BeginFrame, and the
  fps beside a picture is therefore 0 unless the run passes `--novsync` (added,
  opt-in, the two flags `arenashot.mjs` uses). The first run's three black
  canvases (searching, VS, result-loss at the 9 s mark) were that frame
  arriving before the first draw had finished its 3.1 s of pipeline compiles;
  the async precompile (§1) is what closed it, and the A/B against the
  pre-port `main.js` (kept in the scratchpad) showed the old file drawing at
  9 s with a ~1.5 s first frame. `shots.mjs` now writes `fps`, `drawn`,
  `marks`, `backend`, `quality` and `msPerFrame` beside every picture so the
  next person can tell "not drawn yet" from "drawn wrong".
- **Sudden death** is the module's (`applySuddenDeath`); the game's ramp
  (`cfg.suddenDeathRamp`, heat over 0.16) is unchanged. Not photographed by a
  live state — `stand-low-heat.png` is the reference.
- **`hitU.colour`** (the red silhouette) and the shell's `#vfxflash` are not
  pre-toned: the flash is a mix in display space after the tone map, and the
  silhouette is a solid over everything.

## 8. Round 2 of the port — the viewer's findings in PORT-FINDINGS-R1 (`main.js` only)

Most of the file's findings were already closed by the pass on disk at 11:21,
and this note records that first so nobody re-does them: the HUD band with the
feet-and-head framing test (`hudBand`, `measureHud`, `bodyInBand`), the WALL
RULE and the RING RULE inside `updateOcclusion`, the async `applyPost` with
its own precompile (a tier drop is no longer a multi-second freeze), the
governor's 30 fps floor under the fight hold and its display-cadence
thresholds, `initialQuality` measured in CSS pixels, `WHITE = toned(0xffffff)`,
the drawn frame after a body quarantine, and the boot precompile moved past
every scene object. What this round added, all of it in `src/viewer/main.js`
and `tools/checkboot.mjs`:

### 8.1 The tier starts by measurement, and moves both ways

`initialQuality` still decides in CSS PIXELS — a 1440×900 Retina window starts
at `high`, which is the tier the stand was judged at and the one the founder's
own screen was being denied — and the drawing buffer now opens exactly one
gate at the far end: over **8.3 MP of real buffer** (`innerWidth · dpr ·
innerHeight · dpr`, dpr capped at 2 — a 2560×1440 window at DPR 2, a 4K one at
1.5) the page starts at `medium`. Below that the static rule cannot tell a
fast Retina GPU from a slow one, so it does not try: it starts and then
measures.

**The climb** (`tryPromote`, next to the governor). The governor only ever
demotes, by design; a cautious start therefore used to stand for the whole
session, and a phone or a 4K desktop never saw the AO seating or the floor's
reflection. The page now raises its own tier when four things hold at once:
at a boundary (never in a fight), the rolling 120-frame mean delta within 8 %
of the display's own cadence, the mean main-thread DRAW cost under half the
display period (the term that survives vsync — the delta alone reads 16.7 ms
whether or not there is headroom), for three continuous seconds. On a climb
the meter is rebuilt at the new tier (`qualityGovernor` refuses to raise its
own; a fresh one is the honest way to move it up) and the stats window is
reset — a mean spanning two graphs describes neither.

**The hysteresis.** Every demotion lowers a `ceiling` and the climb never goes
above it: a machine that was measured unable to hold `high` stays under it for
the session. So the pair can make at most one round trip per tier step, and a
machine sitting on the line settles instead of rebuilding the graph every five
seconds for ever.

### 8.2 The frame's cost, measured in the game — `window.__airenaStats`

`checkboot` weighs bytes and is green on bytes (1.47 MB of 1.80); nothing
measured what the frame costs once the arena is up. The page now keeps its own
rolling mean over the last 120 drawn frames of both numbers that are not the
same number: `msPerFrame` / `fps` (the wall-clock delta between draws — under
vsync a ceiling, not a cost) and `drawMs` (the main-thread cost of the draw
itself, which moves with the tier whether or not the display caps the rate),
plus `samples`, `frames`, `tier`, `displayHz`. Reported from 24 samples, so a
capture that ticked the page for a handful of frames still carries a number,
and reset on every tier change. `tools/shots.mjs` records
`__airenaGov.msPerFrame` today (21.9 ms at the VS beat, 28.8 ms in a fight, in
its headless Chrome); one line there — `stats: window.__airenaStats` — would
put the draw cost and the sample count beside every picture too.

### 8.3 The stand shot — `window.__airenaCam('stand' | 'auto')`

`establishingCamera` frames the PAIR, which is right for the result and wrong
for the VS beat: the card rises before the match's first snapshot, so the
bodies under it are the LAST fight's, and `live-vs.png` was a body cut by the
card's top edge over empty plaster — no wall, no blocks, no planet, at the
beat the site is most looked at.

So there is a second establishing shot, and it is the stand's `low` preset
verbatim (`arena.html` CAMS.low, photographed as `stand-low.png`): the eye at
(0, wallHeight + 8, 32), aimed at (0, 2.5, −8), fov 56. (The brief's "about
(0, 10, 30), fov 48" is this shot rounded; the stand's numbers are the ones
that were photographed, and at fov 50 the tier wings showed only as two chips
cut by the frame edges.)

It does not touch the solver. The auto camera keeps running into `camState`
every frame; `applyStandShot` only BLENDS the drawn eye toward the preset over
600 ms in and 600 ms out (smoothstep, so the move leaves and arrives at rest),
and `releaseStandShot` at the head of `frame()` gives the field of view back
before the solver reads it again — `camera.fov` is the only piece of the eye
`updateCamera` reads back, so that restore is the whole of what keeps the
solve unchanged. It runs AFTER the solve and BEFORE `updateOcclusion`, so the
wall rule fades the wall THIS eye looks over; and the framing assertion stands
down while the blend is up, as it does for a cut (`camCutAt`), because what it
grades is the fight's eye and this is not it. `checkframing` slices this file
and never asks for the shot: the trail is unchanged to the digit — worst
|ndc| 0.826 (16:9) and 0.863 (4:3), the same numbers as before the change.

Asked for by the shell (`window.__airenaCam('stand')`, `('auto')`), by
`?cam=stand` for a capture, and by the viewer itself on the VS beat
(`hudBand.vs`, from `data-card` / `data-phase`) and on any card beat with no
pair to stand over. `updateOcclusion` is now also called on the no-fight
branch of the loop (with an empty view), so the wall rule fades the near wall
for a fresh visitor's boot camera and for this shot — before, nothing asked
for the pass unless a fight was streaming.

Two things the first capture taught, both fixed:

- **The loop has a THIRD path.** With no frames and no match announced —
  which is exactly the VS beat in the capture harness — neither camera branch
  runs at all, so a blend that only stepped inside them stopped half way and
  left the eye hanging between the boot camera and the shot (measured against
  the preset's own arithmetic: the far wall's coping belongs at y 381 of 900
  and the near wall's at 779; the picture had the far wall at ~290 and no near
  coping at all). The blend now advances exactly once per frame, wherever the
  loop reaches it first (`standShot.done`, cleared by `releaseStandShot`).
- **The eye is put back whole**, not only its field of view: position,
  orientation, fov. On that third path nothing re-places the camera, so a
  blend with no pose to blend FROM would have converged onto the shot and
  never eased back out.

### 8.4 One more from the list

`buildPost`: the anti-aliasing is FXAA on `q === 'low' || isWebGL`, not on the
tier alone. `?webgl=1&quality=high` pinned a tier the WebGL2 graph does not
have — AO and the reflector drop by their own guards, but SMAA over a pass
with `samples: 0` was the one part of the documented degrade the pin could
still bypass.

### 8.5 `checkboot` says what the frame cost, not only what it weighed

The gate is still the weight — bytes are what we control and what a single
commit can ruin — but it now also READS what the captures measured and prints
it under the budget: the first draw's main-thread cost (the pipeline compiles)
and the page's own rolling frame cost, averaged over the 24 freshest capture
JSONs, with the date of the newest. A note, never a verdict: there may be no
captures at all in a fresh clone, they may be a month old, and they are shot
in a headless Chrome whose GPU is slower than a live one. Silence about it was
worse — "ten seconds to the first frame" is checked by that number, not by
megabytes.

### 8.6 What the captures show

`node tools/shots.mjs --only=live-fighting,live-vs,live-result-win,
live-searching,live-visitor --wait=9000`, 15 pictures, **CLEAN**: 0 console
errors, 0 overlaps, 0 text under a panel, every state ticked its 24 frames and
carries a frame cost (16.7–23.4 ms in the harness's headless Chrome, tier
`high`, backend webgpu).

- **live-vs** — the ARENA: the coral banner over the far wall, the four walls,
  blocks d and e, the planet's disc upper right, one fighter's ring on the
  floor under the card. Checked against the preset's own arithmetic rather
  than by eye: block d's top face belongs at x 583–857 / y 593 and block e's
  at x 149–279 / y 615 from (0, 12, 32) at fov 56, and that is where they are
  — the blend is at k = 1, the shot is the stand's.
- **live-fighting-w** — the fight, unchanged: both fighters whole inside the
  HUD's band, rings and plates clear, the near wall faded and the far wall's
  coping still drawing the boundary.
- **live-visitor** — two fighters mid-exchange, the block that would cover the
  blue one ghosted.
- **live-searching** — the orbit over the last fight's wreck (no card, so no
  stand shot).
- **live-result-win / live-fighting** (the harness caught the result card in
  both) — the arena behind the card, but under the veil the walls and blocks
  are barely above the paper. The veil, not the camera: the shot is the same
  one live-vs proves. Worth a look from whoever owns `live.css` — at the
  result the arena is 5 % of the frame's contrast.

### 8.7 Gates

`checkframing` (18 matches, 60,464 frames) HOLDS with the identical worst
|ndc| — 0.826 at 16:9 and 0.863 at 4:3, the same digits as before the change;
`checkcamera` on the same trail holds; `checkvfx`, `checkboot` (1.48 MB of
1.80 compressed, and now printing the measured 1.6 s first draw and 18 ms
frame under it) and `checkscope` hold.

## 9. Round 3 — the review's blockers, in `src/viewer/main.js` and `tools/checkboot.mjs`

Two files, nothing else touched. Everything below is measured on captures taken
after `sh tools/devrestart.sh`, in `reports/screens/ui/`. Round 3 ran alongside
a rewrite of `src/viewer/environment.js` (the stands, banks, decks, gates, four
pairs of banners and the skyline), so the last capture set is the game against
that world, not the one round 2 photographed.

### 9.1 The picture at a card beat

**The banner is gated on the FRAME, not on the fight.** `env.banner.visible`
read the VIEWER's match state (`frames.length > 0 && !decided`), and on a card
beat a fight is still streaming behind the card — so `inPlay` was true at
exactly the moment the rule's own comment says the banner should be shown, and
no VS or result capture had a single coral pixel of it. Now
`camModes[camMode] === 'wide' || !inPlay || standShot.k > 0 || hudBand.card`.
Measured on the re-shot `live-vs.png`: **7,712 saturated coral pixels** in the
banner band (x 480–960, y 200–340) against 0 before, and 1,192 in the
reviewer's own probe box (x 498–522 / y 245–320) against a bar of >800.

**Every card beat is the arena's unless the pair shot has earned it.**
`standShot.pair` was raised on every streaming frame, so at the result it was
always true and the beat always fell to the pair shot — which aims at the
pair's midpoint, which is the frame's centre, which is under the card. The flag
is now the establishing shot's own verdict (`pairReadable`, written at the end
of `establishingCamera`, cleared by the orbit): both bodies inside the band,
both clear of the card's rectangle, and at least one at least `TALL_WANT`
(0.34 ndc ≈ 150 px at 900, 285 on a phone) tall. `standShot.auto` is then
simply `hudBand.card && !standShot.pair`.

- The VS card is 877 px wide and leaves 0.32 ndc of clear frame above it — no
  pair fits, so the beat takes the **arena**: stands, walls, blocks, coping,
  banners.
- The result card is 420 px wide and leaves a clear half beside it, so the
  **winner-over-the-fallen** framing keeps the beat. Re-shot
  `live-result-win.png`: the winner stands at x 445–520, **290 px tall**,
  median L 71.5 with a darkest pixel at L 23.8, the fallen and its coral ring
  beside it, the whole stadium behind — against a frame that measured 187 dark
  pixels in total and all of them the footer.

**The card is a third band, and the solver can see it now.** `measureHud()`
measures `.ov-card` into `hudBand.cardRect` (ndc). `clearAim()` cuts the band
into four candidate regions — left of the card, right of it, above, below —
scores them by area with a nudge to the right (the nav rail owns the left
gutter) and returns the ndc point the subject should land on; `aimAt()` points
an eye so a given world point projects there, by offsetting the look target
along the eye's own right and up axes by `slant · tan(halfFov)` per unit of
ndc. It rotates rather than moves, so the arena stays where it is behind the
subject. **Only the establishing path reads any of this** — the fight camera
does not, and `checkframing`'s worst |ndc| is unchanged to the digit.

**And under a card the establishing shot closes in.** `want` is solved for SIZE
as well as width: the eye comes in until the taller body is `TALL_WANT` of the
frame, floored at 13 m. That is the push-in `main.js` documented and never
reached.

### 9.2 The portrait frame

`STAND_SHOT.fov` is a VERTICAL field of view, so at 390×844 the horizontal
field collapsed from 80.8° to 28°: the banner projected to ndc x −1.02 (off the
bezel) and the mobile card beats came back a blank cream page. `fitStandShot()`
holds the HORIZONTAL field instead — widen the fov until the frame carries the
angle it carries at 1.6, capped at 74°, then pull the eye back along its own
view line for what the cap could not buy, capped at 1.25× (pulling all the way
back turns the arena into a strip in the middle of a tall frame). Identity at
1.6, so no desktop framing moved.

That alone was not enough: in portrait the arena's own horizon projects to
y ≈ 375 of 844 and the card owns 165–578, so everything was still behind it.
`applyStandShot` now also tilts the aim down by `clamp((1.2 − aspect)·0.7, 0,
0.55)` — zero at 16:9, 0.52 on a phone, a third of it on a tablet. Re-shot
`live-vs-m.png` and `live-result-win-m.png`: the coping, the stands, **both
coral banners** and the fighters are in the band above the card, where the
reviewer measured 5.4 L of nothing.

### 9.3 The frame's own value

**GTAO is the stand's, verbatim.** radius 1.2, scale 1.6, thickness 1.5,
distanceExponent 1.5, 16 spp at half resolution, denoise radius 5, and the two
guards `arena.html` carries and this file did not: `aoTex.r.max(0.8)` (the
brief's umbra floor, ≈ −6.5 L at L 88) and a 62 → 80 m `smoothstep` fade on
`perspectiveDepthToViewZ`, which keeps the far architecture's noise tile out of
the pass. `arena.html` had measured this file's old r 0.7 / s 0.7 as "0.25
codes mean and −1 L at a block's foot — invisible at 1:1", and the shipped
capture confirmed it: flat to ±0.4 L stepping off a block. Now, on the re-shot
`live-fighting.png`, a column stepping off a block's foot reads
89.6 → 89.6 → 87.4 → **77.8** → 76.0 → 75.9 and holds — a real seat.

**The vignette stops lighting the corners.** `postU.vignette` 0.4 → **0.15**,
plus a separate `postU.edge` darkening term (0.12, a multiply so a corner keeps
its hue) outside r² = 0.55. At 0.4 the corners measured L 91.5–92.1 against a
centre floor of L 85.6 — the brightest region of the picture was its edge.
NOTE: the corners of the shipped captures are still above the centre, and it is
not this term: `#hud::before/::after` wash 440 px of the top and 380 px of the
bottom toward `--sky-2` at up to .84, which is most of the frame's edge.
`hud.css` is not one of my files — see 9.6.

**The fighters are in the brief's band.** ARENA-BRIEF §5 asks for the fighters
to be the darkest objects (≤ #8D7F73); they measured L 87.3 median, the floor's
own value, while also reaching L 3.4 in places — 50 L past the brief in the
other direction. `bandBody()` (called from `loadBody` once every material) is a
RANGE COMPRESSION in linear albedo luminance: `y · 0.31 + 0.020`, capped at
0.222, so #D8D2C6's 0.65 lands at L 54 (the ceiling), a mid #8D7F73 at L 35 and
#1E1D1B's 0.012 at L 17. Roughness takes a floor of 0.75 and metalness a
ceiling of 0.5, because an 0.12-rough panel under this key put the light back
at L 88 whatever its albedo. It runs on the NODE where a body writes one (every
generated body and both stock ones do) and on `.color` where it does not, once
per material, `?bodyband=0` to switch it off. Measured on the re-shot
`live-fighting.png`, the golem's box: p2 L 11.2, p25 30.4, median 61.2, darkest
pixel 6.0, and it is the only dark mass in the frame. It is still lifted by the
HUD veil above it (9.6).

**And the fighters keep a mark under them.** The ghost ring was drawn only when
something hid a fighter. `RING_ALWAYS` (0.35) is a floor under its opacity
while the body is alive, on the same body-sized circle in the side's own
colour; the occlusion boost rides on top unchanged. The measurement that forced
it: a hit's debris cluster was 100 × 65 px with 663 pixels under L 60 while the
fighter it came from was 68 × 55 with 355 — a 1v1 in which a viewer could not
count the creatures. `live-visitor.png` and `live-fighting-m.png` now show both
rings under both animals.

**The telegraph rim carries value, not only hue.** The coral ring measured
1.95:1 against the plaza and the blue 2.23:1 — thin in motion, gone in
greyscale. `RIM_COLOR` is the same two hues taken down in linear luminance to
Y 0.185, i.e. **3.0:1** against #DFD2C4 (#4E78B9 and #BE5943). The filled disc
keeps the bright colour: it is the identity, and it is 16 % opaque.

**Damage numbers left the chest.** The pill rose from 1.8 m to 4.0 m — torso
height on a 2 m stock body, mid-chest on the ~5 m generated ones — and its
`--glass-strong` surface is brighter than the floor, so it punched a white hole
through the one dark shape in the picture. It now spawns at
`body.top + 0.5 + u · 2.5`, the air the nameplate already owns.

### 9.4 Occlusion, the ghosts and the fire

- **The ring rule fades the block.** Only the ghost half had been ported: a
  block that hid a fighter's ring but fewer than two of three body samples
  stayed at full opacity in the game while the stand faded it to 0.35. The
  `.some(...)` is an indexed loop that does both jobs, before the `o.fade`
  integration so the new `want` is picked up the same frame. Blocks only
  (`i >= 4`); the walls have their own rule.
- **`updateOcclusion(EMPTY_VIEW)` decays instead of freezing.** The
  per-fighter branch was skipped entirely with no view, so `on`, `ringOn`,
  `visible` and `position` kept the last fight's final frame — and since the VS
  beat is now the arena's own portrait, a fighter that died behind a block left
  its lozenge drawn, depth test off, render order 999, over the establishing
  shot under the card.
- **Sudden death is released with the fight that lit it.**
  `env.applySuddenDeath(0)` is now part of the match-announced reset. It was
  called from one place, inside the fight branch, so a match that reached
  sudden death left the floor, fog, sky and reflection burnt through the result
  card, the searching beat and the next match's VS — the next fight announced
  over the previous fight's fire.
- **The i-frame shell is `WHITE`** (pre-toned), not a raw `0xffffff` that ACES
  maps to #E2E2E2. It was the one white in the file that had been missed.

### 9.5 The meter and the tiers

- **The head test reads the POSE.** `bodyInBand` projected the cached rest
  height; a mech in mid-air with its arms up overshoots it by a metre, which is
  how a phase subline came to be drawn through a head the test had just called
  framed. `bodies[id].top` is the vertical extent of the pose actually struck
  this frame (from the `spanY` pass the body loop already runs). Node has no
  pose, so `checkframing` keeps grading the cached height and its numbers do
  not move.
- **The band is re-measured on `transitionend` as well as on the 30-frame
  beat**: `.live-word` transitions its own font size over `--d-screen`, so the
  one measurement inside that second was taken against a block still growing.
- **The ceiling closes on the tier that FAILED**, not the tier landed on. The
  module picks its target from the measured rate, so `high` under 30 fps
  demotes straight to `low` — and setting the ceiling to `low` there barred
  `medium` for the session on no evidence at all, when `medium` costs 0.6 ms
  more than `low` and keeps SMAA and the 2048 map.
- **The cadence is only learned from frames that were not the bottleneck.**
  `refreshDt` is the shortest delta seen and the demotion lines are 75 %/50 %
  of that rate, so a machine whose fastest frame was 30 ms was read as a 33 Hz
  display and ran `high` at 30 fps for ever. It now folds a delta in only when
  `stats.drawMs < dtEnv · 600` — a 30 ms frame with 25 ms of drawing is a slow
  MACHINE, one with 2 ms of drawing is a slow DISPLAY — and it decays slowly
  and resets on `visibilitychange`, so one anomalous 6.1 ms delta can no longer
  pin the cadence at 164 Hz and kill the climb.
- **`?quality=<garbage>` no longer switches the whole system off.** The
  governor was built on the raw parameter's truthiness while the tier choice
  validated with `QUALITIES.includes`; `?quality=hgih` therefore ran with no
  demotion, no climb and `__airenaGov` null.
- **`window.__airenaGov` now also carries `drawMs`, `displayHz` and `tier`**
  (getters onto `window.__airenaStats`), so a tool that already reads
  `msPerFrame` gets the number that tells a vsync ceiling from a frame cost.
- **The exposure assertion asserts the two readers that can drift** — the
  raster's own exposure and the number the environment inverted through — in
  place of `postU.exposure.value !== ENV_EXPOSURE`, which was created from
  `ENV_EXPOSURE` sixteen lines above and was a tautology.
- **`tools/checkboot.mjs`** prints the measured `drawMs` beside the frame time
  and names every capture whose frame is over 33 ms (RENDER-QUALITY §7's floor)
  — a note, not a gate, because the captures are vsync-capped headless Chrome.

### 9.6 Not mine, found on the way

- **`src/client/ui/hud.css` — the veils are the picture.** `#hud::before` (440
  px, up to .84 toward `--sky-2`) and `#hud::after` (380 px) wash most of the
  frame's edge and the whole top third where the fighters stand. Every corner
  measurement in this round is theirs, not the post graph's, and the fighters'
  new albedo band is lifted back up by them: the golem's median is 61 L in the
  veil against a darkest pixel of 6. The post vignette is at 0.15 + 0.12 now
  and cannot go further without leaving the reference.
- **`src/viewer/vfx/*` — the debris and the auras still out-read the animals.**
  On `live-visitor.png` the blue shard trail spans x 60–700 and is the largest
  dark mass in the frame; on `live-vs-m.png` an amber ember fills the pair. The
  hooks in my file (`playFx`, the `bloomIntensity` MRT channel) can clamp a
  bloom mark but not an emitter's own value, lifetime or radius.
- **`src/viewer/environment.js` — `checkscope` is RED on it, 4 violations**,
  all the literal word "stripe" in new comments tripping the E6 payment-SDK
  rule (`environment.js:179, 190, 751, 843`). It was green before this round;
  `main.js` is clean. Whoever owns that file needs one word changed in four
  comments.
- **`src/viewer/environment.js` — `wing+x` is gone.** The MRT-normal override
  the stand runs on the tier wings is in `buildPost` and guarded, but the
  stands were rebuilt as banks and decks and no mesh carries that name, so it
  is a no-op today. The 62 → 80 m AO fade is what keeps the far architecture
  out of the pass now. Left in place, with the reason written next to it.
- **`tools/shots.mjs` — `window.__airenaStats` is never read.** Every JSON
  still writes `stats: null` and half of them `msPerFrame: null`, because the
  governor's own meter needs 160 frames and the harness ticks 24. The page's
  rolling mean reports from 24 samples and carries `drawMs` beside it; one line
  at the SIGNALS read would put a real frame cost beside every picture. The
  standing capture command also wants `--novsync` before any of these numbers
  can be compared with the stand's.
- **The horizon is still off the top of every fight frame** (the review's
  "the camera never lets the world into frame"). Lowering the fight solver's
  eye moves `checkframing`, so it is the lead's call; the establishing and card
  beats now carry the stadium, the banners and the sky, which is where the
  cheap half of that finding lands.

### 9.7 Gates

`node tools/checkframing.mjs --dump` HOLDS with the identical worst |ndc| —
**0.826** at 16:9 and **0.863** at 4:3, the same digits as rounds 1 and 2;
`checkcamera` on that trail holds; `checkvfx` holds; `checkboot` holds (1.50 MB
of 1.80 compressed). `checkscope` is red on four "stripe" hits in
`environment.js` and clean on both of my files.

---

## 10. Round 8 — ownership colour, and the world into the fight frame

`src/viewer/main.js` and `tools/checkboot.mjs` only. The founder's two
directives (`reports/arena/ARENA-AAA.md`) and the viewer half of
`reports/arena/FINISH-FINDINGS.json`.

### 10.1 Colour is ownership (directive 1)

**Blue is the player's creature, orange the opponent, on every surface this
file draws.** The implementation is deliberately NOT a second keying: every
drawing site in the viewer indexes by SLOT (`tele.blue`, `bodies.orange`,
`cfg.fighters[id]`), and a second axis beside that is how two colour systems
come to disagree in the same frame. So the slot stays the key and the three
colour TABLES are rewritten by role on every `match`:

```
HUE      = { own: 0x6EA8FF, foe: 0xFF7A5C }     // --info / --accent
HUE_RIM  = { own: 0x4E78B9, foe: 0xBE5943 }     // the value-carrying rim
sideRole = (id) => mineSide ? (id === mineSide ? 'own' : 'foe') : SLOT_ROLE[id]
```

`applySides()` (beside the name plates) then walks everything built once per
side and re-tints it IN PLACE — no rebuild, because three of those materials
are node materials and a node material rebuilt mid-session compiles a pipeline
in the frame the VS card is up:

- the ring's disc and its rim under each fighter, the aim line — `material.color.copy`;
- the cone, the lane and the zone disc — `telegraphMat`'s `colorNode` is
  replaced at construction by a per-side uniform (`SIDE_U`), so the shader is
  built once with the uniform already in it and a re-tint is one value write;
- the ghost body and ghost ring — already written from `SCENE_COLOR` every
  frame, so they follow for free;
- the name plate and a say-bubble that is still up (DOM `style.color`);
- everything created per event — beams, blink rings, cones, impact flashes,
  damage pills, feed names, the winner's line — reads `COLOR`/`SCENE_COLOR` at
  creation and is therefore correct by construction.

A spectator with no creature in the fight keeps SLOT colours (`SLOT_ROLE`).
Telling a stranger that one of two strangers is "theirs" is worse than an
arbitrary pair of hues.

Two signals go out with it. `window.__airenaSides` is `{ blue, orange, mine }`
where each hue carries `'own' | 'foe' | 'slot'`. `body[data-mine]` is written
**in the shape `screens/live.js` already writes it** — the slot when there is
one, the attribute REMOVED when there is not — because that stylesheet keys on
the attribute's presence and a `data-mine=""` would swap the panels for a
spectator. The module's own first call does not touch it at all: a `?ui=`
fixture states its own ownership and has no socket to be corrected by.

**Verified** by extracting the palette block and `applySides`'s loop out of
`main.js` and running them in Node against all three ownerships:

```
mine=null   | blue slot #6EA8FF rim #4E78B9 | orange slot #FF7A5C rim #BE5943
mine=blue   | blue slot #6EA8FF rim #4E78B9 | orange slot #FF7A5C rim #BE5943
mine=orange | blue slot #FF7A5C rim #BE5943 | orange slot #6EA8FF rim #4E78B9
```

— the node uniform, every registered raster material, both rims and the plate
all move together.

**And photographed in the swapped case.** `reports/screens/ui/live-fighting.png`
(this round) carries FIGHT #419544619, which the database names
`m_e1a94055-3a2`: the claimed creature STONE GOLEM is in the **ORANGE** slot
and HEAVY REACTOR in the blue one. Measured off the PNG, the most saturated
pixel of the player's ring is **#1B57D0** (sat 87 %) and of the opponent's mark
**#7B2D12** (sat 85 %) — the player blue, the opponent coral, with the slots
the other way round. The banner in the same frame is #F4725A, so the world's
one accent is still the world's.

Five other fights the harness caught had the creature in the blue slot, where
the mapping is the identity; the extraction above covers all three cases
deterministically, and this frame covers the one that matters by eye.

### 10.2 The world into the fight frame (finding 0, blocker)

The top of every fighting frame pointed BELOW the horizon: at orbit(π/4, 30)
the eye sat 15.4 m up aimed at 0.4 m, so nothing above y ≈ 9.5 m at the ring's
distance was in the picture — no deck roofline, no sky, no planet. Two numbers,
both named and both read by the band solve as well as by the servo:

- `BAND_PLACE` **0.36** — where in the HUD's free band the pair is placed, from
  its floor. It was the band's middle; the lower third gives the upper third to
  the arena's own horizon.
- `EYE_RISE` **0.32** (was 0.42) — the eye's height per metre of distance. 3 m
  lower at a 30 m shot, 1.8 m at the measured mean 18 m: about 5° of pitch, and
  a quieter camera besides, because the height servo follows the distance and a
  shallower coupling means a dolly moves the eye less.

Swept against both gates at 60 464 rendered frames per point. The pair is the
knee: `checkframing`'s worst |ndc| goes **0.826 → 0.694** (the shot is LOOSER
on the fighters, not tighter) and `checkcamera` reads height p99 **19.1** of 20
and dist p99 **175** of 200. The finding's own suggestion of 0.42 for the rise
FAILS the height ceiling at 21.7 — the lower placement makes the band solve
work the distance harder, and at the old coupling the height servo rode it.
Anyone touching the height servo must re-run both.

### 10.3 The boot pose (findings 26 and 36)

`(0, 26, 34)` → `(0, 1, 0)` failed twice over, and `arena.html`'s `default`
preset mirrors it, so it failed in both places.

- **It looked down.** 37° of pitch against a 23° half-frame put the top of the
  picture 14° below the horizon: the whole bank/deck/banner layer in the top 48
  px of 900 with both banners cut by the edge.
- **It looked down the sun's own axis.** The key flanks from (−x, +z); from an
  eye on +z every block's shadow lay behind its caster and the pit interior
  measured a flat 88.5 L to ±0.1.

Now **`camera.position.set(19, 16, 32.9)` → `lookAt(0, 3.6, 0)`**, fov
unchanged at 46. Ground radius 38 at 30° of azimuth: the eye stays 14 m outside
the wall, the top of frame comes to +4° of elevation, and the shadow direction
projects **0.97 across the frame** and 0.26 into it (it was 0.71/0.71). It is
also the direction the fight camera settles on (`CAM_ANCHOR`), so searching →
first fighting frame is a small move rather than a swing.

**`src/viewer/arena.html:200` still carries the old numbers** — mirroring them
is the stand's call, not mine.

### 10.4 The black frame (findings 8, 17, 22, 29 — all blockers)

`live-visitor.png` was #000000 across the arena with the HUD readable on top of
it, 30 draws in 14 s, one `TypeError: … reading 'abs'` behind every one. Three
things were wrong with the recovery and all three are fixed:

- **`directGrade()`** puts the raster path back before the fallback render —
  `setRenderTarget(null)`, `setMRT(null)`, ACES, the exposure, sRGB out. Without
  it the fallback drew into the failed pass's own target with no tone map,
  i.e. into nothing. (`PostProcessing.render()` saves and restores
  `renderer.toneMapping` itself, so leaving ACES on the raster is free.)
- **`dropPost(why)`** retires the graph after **eight** consecutive throws —
  not two: `quarantineBodies` answers with an ASYNC swap and a handful of
  frames can still meet the material that threw. It disposes the parts, turns
  the glow mark off AND strips the `mrtNode` already on the scene's materials,
  because a marked material under a pass without MRT compiles to an empty
  output struct and draws nothing — that would trade a black canvas for an
  empty one.
- **`window.__airenaDrawn` now carries `direct` and `blank`** — frames the
  raster path drew, and frames NOBODY drew. A capture could not tell a black
  canvas from a dark theme; now it can, and the harness should assert it.

Measured after: `live-visitor` at 1440×900 renders the arena, `errors: []`,
`drawn.n 34`. The `'abs'` throw still happens on some fights (it is a VFX node
builder, `src/viewer/vfx/*`) — the picture survives it now, and `blank` counts
how many frames the raster path could not save either (27 on
`live-visitor-m` in one run, because the offending material is in the SCENE and
`renderer.render` meets it too).

### 10.5 The first frame (finding 18, blocker) — 3 020 ms → 26 ms

The finding blames `swapBody` for the first draw's main-thread cost. **It is
not swapBody**, and this is the useful half of the round: a per-body
`compileAsync` was written, measured, and taken out again. It moved
`drawn.firstMs` not at all (2.6–4.3 s before and after) and it cost a race —
`PassNode.compileAsync` points the renderer at the pass's own target for the
length of its promise, so the draw must be held, and any deadline on that hold
is a frame drawn into a half-built pipeline (`TypeError: parameter 1 is not of
type 'GPURenderPipeline'` in `live-visitor-w`).

Where the time actually was: `precompilePass(scenePassNow)` compiles the render
objects the SCENE PASS draws. GTAO, its denoise, the bloom's whole mip chain
and SMAA are not render objects — they are the graph's own passes, and every
one of them was still being built synchronously inside the first
`post.render()`. **`await post.renderAsync()` once before the loop** builds
them with `createRenderPipelineAsync` in the GPU process instead.

```
drawn.firstMs, six live states   before 2621–4348 ms   after 21–30 ms
tools/checkboot.mjs "первый кадр"  before 3020 ms       after 26 ms
```

And the other half of the finding, the ~6 s before `rendererReady` that nothing
measured: `mark()` in `main.js` now stamps `viewerStart`, `rendererUp`,
`envBuilt`, `postBuilt`, `precompiled`, `postWarm` onto the shell's own clock,
and **`tools/checkboot.mjs` prints the split** — modules, device, scene, post
graph, precompile, warm — beside the weight. A note, not a gate, like the rest
of that block.

### 10.6 The rest of my area

- **The result beat keeps its subject (finding 30, blocker).** The stand-shot
  fallback is for "there is nothing to frame", not for "the two of them do not
  both fit beside the card". When `pairReadable` fails, `beatSubject` picks the
  winner (else whoever is standing, else the taller), the existing back-off
  loop re-solves for that one body and `soloReadable` decides the beat. Only if
  THAT fails does the arena portrait take it. `live-result-win.png` now carries
  the winner at (990–1080, 320–470), clear of the card.
- **The i-frame shell no longer survives into the result (finding 15).** It is
  `t.shell` in this file — a white wireframe sphere at radius × 1.45, drawn on
  `v.inv`, which is read from the last interpolated bracket and therefore froze
  standing on the plaza when a fighter died inside its own i-frames. Now gated
  on `v.alive && !decided` as well.
- **The ring rule tests the RING, not its centre (finding 33).** Six samples on
  the circumference plus the centre; any one behind an unfaded solid raises the
  ghost. A block covering half the circumference and missing the middle used to
  raise nothing, which is the hard seam through the mark and the leg in
  `live-fighting-w.png` at y=365 (sat 79 one side, 138 the other).
- **A body's albedo is clamped into the world's hue band (finding 12).** In
  `bandBody`, before the range compression: blue may not stand above the mean
  of red and green — the linear-space statement of `b* ≥ 0`. A cold grey lands
  on a neutral grey, a warm body is untouched, luminance moves by under 1 L.
  It belongs in the viewer because the forge will keep producing cold albedos.
- **The AO tuning is `RIG.ao`, read by both files (finding 20).** The comment
  here claimed "the stand's, verbatim" and was not: 1.2/1.5/62–80 against the
  stand's 1.5/1.0/52–68. Copying the numbers over would only reset the clock;
  `main.js` and `arena.html` now read the one exported block.
- **The tier boundary gets the DRAWING BUFFER (finding 28).** `initialQuality`
  is called with `dpr`, and the duplicate `bufferMP > 8.3` clause beside it is
  gone. Two copies of one boundary is how the boundary came to be in neither.
- **The climb's bar is a 60 Hz frame (finding 21).** `Math.max(1000 / 60, 1000 / hz)`:
  on a 120 Hz panel the old test asked for ≤ 4.17 ms of draw against a stand
  cost of 12.46, so the climb could never fire on the hardware §8.1 was written
  for.

### 10.7 Not mine, found on the way

- **`src/viewer/environment.js` — the floor reflection (findings 5 and 32).**
  The smear under a body and the L 62.6 ground stain are `RIG.reflection` /
  `reflectionCap` / `reflectionBlur`, not anything in `main.js`; the only lever
  here is which layer the bodies are on. Finding 5's "drop the reflector
  intensity to ≤ 0.06 and mask it to ~1.5 m" and 32's "reflectionCap 0.40 →
  ~0.22" both land in that file.
- **`src/viewer/environment.js` — the far tiers (finding 27).** `RIG.fogNear/
  fogFar` gated by camera mode is the cheap half; pulling the VS camera in is
  the expensive one and would move `applyStandShot`, which is composed for the
  banner and the planet.
- **`src/viewer/arena.html:200` — the `default` preset** still carries
  `(0, 26, 34) → (0, 1, 0)`. The game's boot pose is now `(19, 16, 32.9) →
  (0, 3.6, 0)` at fov 46 (§10.3); the stand and the game are the same camera by
  contract and are now out of step until that line moves.
- **`stand-near` (finding 7)** is `arena.html`'s own preset, not the orbit: the
  game's solver has both a horizontal fit (`need`, margin 5.5) and a band solve,
  and `checkframing` is green over 60 464 frames at worst |ndc| 0.694. The
  finding's "floor of ~17 m" would widen every melee shot and contradicts the
  kill push-in; if the stand wants that framing it is a stand preset change.
- **`src/viewer/vfx/*` — the `'abs'` throw is still live** (`live-vs-w`,
  `live-visitor*`). The viewer survives it now and counts the frames it costs
  (`__airenaDrawn.blank`), but the node builder that returns `undefined` is in
  that file family. The teal ice family (findings 16 and 34) is there too.
- **`src/viewer/index.html`** — the standalone viewer's own `#bar-oct` /
  `#bar-gor` colours are CSS on those ids and do NOT follow ownership. The
  product HUD does (`screens/live.js`, `markMine`); the dev page does not.
- **`tools/shots.mjs`** — a capture whose canvas centre is under L 5 should be a
  FAILED capture, and `window.__airenaDrawn.blank > 0` now says so directly.

### 10.8 Gates

`node tools/checkframing.mjs --dump=/tmp/airena-trail.json` HOLDS, worst |ndc|
**0.694** at 16:9 and **0.847** at 4:3 (was 0.826 / 0.863);
`node tools/checkcamera.mjs --trail=…` holds — dist p99 175 of 200, height p99
19.1 of 20, az p99 18.2 of 25; `node tools/checkvfx.mjs` holds;
`node tools/checkboot.mjs` holds at 1.54 MB of 1.80 compressed, and now prints
the split it could not before — modules 609 ms, device 7, scene 64, post graph
12, **precompile 4 209**, **graph warm 2 962** — which is where the next second
of F6 has to come from;
`node tools/checkscope.mjs` holds (the four "stripe" hits in `environment.js`
are gone).

## 11. Round 9 — the review's remaining blockers (`main.js`, `checkboot.mjs`)

Four fixers on disjoint files; mine were `src/viewer/main.js` and
`tools/checkboot.mjs`. Ownership colour (directive 1) was already in place from
round 8 — `applySides` re-tints the three colour tables by ROLE on every
`match` and walks every material built once per side — so this round is the
review's remaining findings against it, and the second directive's half that
lives in the camera.

### 11.1 The pitch cap — how the world got into a fighting frame (findings 30, 0, 15)

`live-fighting.png` carried 18 px of sky, 22 px of deck fascia and then tier
bank: no banner, no planet, no moon, no skyline anywhere in a fighting frame,
i.e. the whole AAA world switched off for exactly the beat the product is
watched on. Two causes, both here.

**(a) The banner's play rule is withdrawn.** `env.banner.visible = camModes[…]
=== 'wide' || !inPlay || standShot.k > 0 || hudBand.card` deleted the arena's
only accent for the length of every fight. It answered a frame-edge stub by
deleting the object. `env.banner.visible = true`, always; the founder's
addendum puts coral on "banners and the opponent" both.

**(b) The stub is a framing fault and is answered in the framing.** The first
attempt was the finding's own suggestion — floor the aim at the stand's 3.5 m —
and it is the wrong lever, which is worth recording because it is the obvious
one. `dropAt` places the pair inside whatever band `measureHud` reports, and on
the VISITOR's page, where the invitation card docks in the bottom column, the
band's centre is ABOVE the frame's, the drop is positive and the aim is
legitimately below the fighters' feet. Clamping it to 2.8 m there raised the
aim three metres, dropped the pair 0.22 ndc toward the band's floor, and the
band solve answered the only way it can: it backed the eye out to the 44 m cap.
The capture is unmistakable — the whole 40 m pit inside 66 % of the width, two
fighters 40 px tall.

So the cap goes where pitch lives, on the EYE: **`PITCH_MAX` 15°**, applied as
`eyeAt(dist, aim, cover) = max(wall + 1.2, min(2.8 + dist·(EYE_RISE + 0.2·cover),
aim + dist·tan 15°))`, read by the servo AND by the band solve's trial height.
The aim keeps the composition the band asked for; the eye comes down until the
shot is no steeper than 15°, and the frame's top edge rises by exactly the
angle the eye gave up. `EYE_RISE` stays **0.32** — round 8 swept two gates on
it and lowering it flattens every distance equally, which is not the question.

Swept over the same 60 464 rendered frames — worst |ndc| at 16:9 / 4:3, then
`checkcamera` height p99 and dist p99:

| cap | 16:9 | 4:3 | height p99 (of 20) | dist p99 (of 200) |
|---|---|---|---|---|
| none (round 8) | 0.694 | 0.847 | 19.1 | 175 |
| 20° | 0.770 | 0.868 | 10.2 | 162 |
| 18° | — | — | 8.6 | 146 |
| 16° | 0.847 | 0.860 | 7.0 | 134 |
| **15°** | **0.849** | **0.867** | **6.4** | **129** |
| 14° | 0.851 | 0.872 | 5.8 | 128 |

Everything holds; what moves is where the margin sits. The fighters give up
0.15 of `FRAME_EDGE`'s slack (0.85 against 0.92, still inside `FRAME_TARGET`'s
own 0.88) and the camera's smoothness gains three times that — the eye now
tracks an aim eased at rate 12 instead of a distance the rescue loop steps.
15° is where the world arrives and not a degree past it: the top of frame lands
at +8° of elevation, which at the far ring's 94 m puts the picture's edge above
20 m against the deck's 16.4 m roofline. 18° leaves it at 16.6 m — the roofline
exactly, i.e. clipped.

The horizon is now in a fighting frame BY CONSTRUCTION rather than by luck,
which is what finding 15's "reject a solve whose horizon falls above the top
edge" asked for: top-of-frame elevation is `23° − pitch ≥ 8°` at every distance
the orbit uses (the `cover` term can steepen it while a fighter is blocked, and
that is the eye deliberately climbing to see over a block).

### 11.2 The result beat keeps a creature in it (findings 25, 32, 13)

Two faults, one loop.

- **The retreat had no size cap.** The solo back-off grew the distance ×1.08 up
  to sixteen times to satisfy `bodyInBand`, and at 1440×900 the centred result
  card leaves side strips 0.58 ndc wide, so it ran to the cap almost every
  time. At that distance the subject is far under `TALL_WANT`, `soloReadable`
  refuses, and the beat falls through to the arena portrait — the wide arena
  the desktop result captures actually show. The band asked the eye to retreat
  and the size test refused the answer. The retreat now stops at `sizeCap()`,
  the distance where the body still subtends `TALL_WANT` (slant → ground by the
  same `sqrt(slant² − rise²)` the push-in above uses): past it there is no
  answer to find, only a smaller body.
- **The subject was the winner and only the winner.** On a LOSS the winner is
  the opponent, wherever the kill happened, and `live-result-loss.png` carried
  no pixel under L 70 beside the card at all. `beatSubject` is now
  `beatOrder` — winner, then whoever is standing, then the taller — and the
  solve is tried on each in turn from the same starting eye, keeping the first
  that `soloReadable` accepts. A fallen creature the reader can see is a better
  result screen than an empty plaza. If neither lands, the eye goes back where
  the pair solve left it so the arena portrait blends out of a composed frame.

The same size cap is what lets the VS beat frame its pair below the card
(finding 16): `clearAim` already returns the region under a card that rides in
the top third, and the retreat no longer walks past the size the region needs.

**Measured on the re-shot captures**, in the strip beside the card that the
review measured as empty (x 60–460, y 560–830 at 1440×900):

| | px under L 62 | px under L 70 | saturated mark px |
|---|---|---|---|
| `live-result-loss.png` | **4 925** | 6 706 | 4 876 |
| `live-result-win.png` | **8 096** | 12 531 | 2 864 |

against **zero** under L 62 before, and the reading's own bar of ≥ 2 000. Both
beats now carry two ringed bodies clear of the card. They sit low and left
rather than centred in the clear half — the strip is 0.58 ndc wide and that is
what finding 25's second half (docking the card to one side in
`src/client/ui/screens/live.css`) would buy.

### 11.3 A mark does not outlive the fight, and does not wear a body's hue

- **`restMarks()` (findings 40, 28, and the round's own 68).** `updateTelegraph`
  runs only from the streaming branch, so when `frames` ran out both telegraph
  groups kept the last streamed frame's visibility AND position: measured on
  `live-searching.png`, two rings on an empty plaza with the brighter of the two
  the FOE's — 762 saturated px at #D85143 with the one standing creature's feet
  inside it, against 123 px of blue lying empty in front. Between fights the
  frame said "orange" about the only creature on screen, and that creature is
  the player's. `restMarks` hides every skill shape, and the one body still on
  the floor keeps its own ring moved to where it actually stands, in the colour
  ownership gave it. WHICH body comes from `mineSide`, not from the last
  fight's geometry; with no `mineSide` (spectator, visitor) the plaza carries no
  mark at all. It hangs off `!occluded` in the loop's tail — the same flag that
  already means "no fight drew this frame".
- **The rim is a value sandwich (finding 26).** Ring pixels inside the foe's
  footprint measured median L 43.5 / S 0.46 against body pixels at L 42.4 /
  S 0.36 in the same hue family: the mark that says "enemy" was indistinguishable
  from the enemy, and the forge ships blue creatures, so the player's ring was
  next. Three concentric annuli now — `MARK_SHADE` #3A3430 (L 21.5) at
  0.76–0.84 R, the side's `RIM_COLOR` at 0.84–0.94, `MARK_EDGE` #F2ECE6
  (L 93.0, under the brief's #F4EEE8 ceiling) at 0.94–1.0. The OUTERMOST edge
  is still exactly the collision radius, because "the two rims meet when the
  solver starts pushing them apart" is the ring's other job. The ghost ring
  carries the identical sandwich: it is the mark that stands in for the real one
  over cover, so it cannot be the one place the mark is a single stroke. Neither
  neutral is side-tinted — they are the value contract, not the identity.
- **A faded solid still breaks a ring (findings 27, 33).** The circumference
  test skipped any solid already under `fade` 0.6, on the argument that a block
  at 0.24 shows the ring through it. It shows a WASHED one: the polar scan in
  `live-fighting-w.png` reads L 79.4–80.7 / S 0.16–0.19 on the arc crossing the
  faded face against L 51.4–54.8 / S 0.64–0.73 on the clean arc — 28 L and 0.55
  of saturation around one circle. The guard also made a limit cycle: a block
  faded past 0.6 stopped being tested, un-faded, was tested again. Every solid
  between the eye and the ring raises the ghost now, whatever its own opacity.
- **The damage pill names the fighter it stands on.** `playFx` calls
  `floatDamage(e.x, e.z, e.amount, e.who)` with the VICTIM (`src` one line
  below is `other(e.who)`), the pill is anchored over `bodies[who]`, and it was
  painted `COLOR[other]` — position and colour pointing at different creatures.
  Measured: a `−20` pill in `--info` blue over coral-ringed MARK-92. It is the
  victim's colour now, whose HP bar moves on the same frame; the dealer's hue
  goes out on `--from` and `data-from` for the HUD to draw as a caret, so the
  two facts occupy two marks instead of contradicting each other in one.
  **The `hud.css` rule that draws that caret is the HUD fixer's** — until it
  exists the property is inert, which is the harmless direction.
- **A body may not be as saturated as the mark that names its side** (the other
  half of 26). `bandBody`'s hue clamp gains `capAccent`: inside 0–25° / 335–360°
  and 200–250°, saturation is capped at 0.25 with hue and lightness untouched.
  **Raster materials only, deliberately** — a body whose colour is a graph would
  need a branchy hue test written in TSL and inserted into a model-written
  graph, which is the class of edit that produced the `reading 'abs'` blocker.
  Recorded as not done rather than done badly.

**Measured after, on the re-shot captures.** `live-fighting.png` (1440×900,
the player dealt the ORANGE slot — `drawn.sides {"blue":"own","orange":"foe",
"mine":"orange"}`, and its ring is BLUE):

| | mark | body | ΔE |
|---|---|---|---|
| foe | 884 px, Lab(54.5, 30.8, 23.9) | 1 499 px, Lab(36.7, 3.7, 9.0) | **35.7** |
| own | 588 px, Lab(61.7, 9.2, −43.9) | 24 551 px, Lab(19.3, 2.4, 7.6) | **67.0** |

against the reading's own bar of ΔE ≥ 25 inside a fighter's footprint. And on
the floor band of `live-searching.png` (y 320–860): **3** coral pixels at
S > 0.35 against **1 868** blue — the beat carries one ring and it is the
player's, where it carried 762 coral px around the player's own creature
against 123 blue.

### 11.4 The visitor's blank page — the diagnosis path is open (findings 34, 35, 12, 29)

`live-visitor.png` at 1440 and 1280 was `--sky` with the HUD floating on it,
`drawn.direct 1 / blank 1`, and four review rounds logged the same unactionable
one-liner. Both halves are answered.

- **The stack survives (35).** `fail(\`render: ${e.stack || e.message}\`)` is a
  trap: `e.stack`'s FIRST line is the message, and the capture harness keeps
  `String(e).split('\n')[0]`, so every frame of every trace was thrown away by
  construction. `where(e)` folds the top three frames onto the first line —
  message `@ frame <- frame <- frame`, trimmed of `at ` and of the origin. Used
  at all five reporting sites (`render`, `render loop`, `render draw`, `post
  unavailable`, and the two precompile warnings). **It worked on the first
  capture after the change**: `live-fighting-w.json`, `live-result-win-w.json`
  and `live-result-loss-m.json` now carry
  `render: parameter 1 is not of type 'GPURenderPipeline'. @ hw.setPipeline
  (/vendor/three.webgpu.min.js…) <- h <- p` — a named location, and a
  DIFFERENT throw from the `'abs'` one, i.e. a pipeline still compiling when
  the sync path reached it. The `'abs'` throw did not reproduce in this run.
**AND THE `'abs'` THROW IS NAMED, after four rounds of the same one-liner.**
The re-shot `live-visitor.json` carries, in full:

```
render: Cannot read properties of undefined (reading 'abs')
  @ eval (eval at buildBody (/viewer/loadbody.js:302:16), <anonymous>:36:66)
  <- Ni.call (/vendor/three.webgpu.min.js…) <- Ni…
```

So it is **not** in `src/viewer/vfx/*` — every guess so far has been. It is in a
GENERATED BODY'S OWN SOURCE: line 36, column 66 of the script `buildBody`
evaluates, reached from three's node system (`Ni.call`, a node's `setup`),
which is why it fires lazily inside a render and only on some matches. A
model-written material graph calls `.abs()` on a node that comes back
undefined. `quarantineBodies` is the right answer to it and already fires;
what the viewer owes it is a frame while the stock body arrives, which is the
next paragraph. The forge side — refusing a body whose graph cannot build —
belongs to whoever owns `src/server/forge/*` and `loadbody.js`.

- **The fallback can no longer present nothing (34).** From the second
  consecutive throw `evictBodies()` DETACHES both fighters from the scene
  rather than hiding them — a hidden root is out of the traversal but not out
  of the graph — and `dropPost` fires at **2** rather than 8, which is what its
  own docstring argued for all along and what the visitor evidence settles:
  eight consecutive throws are eight frames on a transparent canvas. The arm is
  released when `swapBody` lands a body, so a second bad material gets the same
  answer. The worst frame this can present is the arena with no fighters, which
  is a picture. The eviction is REVERSIBLE — the first frame that renders puts
  the fighters back, because not every repeated throw is a bad body and the
  `GPURenderPipeline` one passes on its own; `EVICT_MAX` 3 bounds the
  oscillation. **The polarity of that budget was wrong the first time and the
  next capture said so**: refusing to EVICT past three rounds left the throwing
  body in the scene for ever (`live-visitor.json`: `blank 47`, `direct 5`,
  4 of 24 driven frames). Refusing to RESTORE is the rule the budget was for.
  Worth recording because the wrong polarity reads exactly as reasonable.

### 11.4a What the honest meter immediately caught: the rebuild was never warmed

Turning the governor on (11.5) made the tier actually drop for the first time,
and the first capture with `quality: "medium"` in the sidecar came back BLACK
at 1440 on `live-result-win` and `live-visitor` — with
`Failed to execute 'setPipeline' … parameter 1 is not of type
'GPURenderPipeline'` beside it, which is the throw the stack change had just
made legible. The cause is a gap nobody could see before, because nobody had
ever seen a mid-session rebuild: `forced: 0` and `quality: "high"` in every
sidecar ever taken.

`applyPost` awaited `precompilePass(built.scenePass)`, which compiles the
render objects the scene pass DRAWS. GTAO, its denoise, the bloom mip chain
and SMAA are not render objects — they are the graph's own passes — and the
boot path warms those with `post.renderAsync()` for exactly that reason. The
rebuild had no equivalent, so every one of those pipelines was built lazily
inside the first `post.render()` through the new graph, with the encoder
already recording. **One await, the same one the boot path has had all along:**
`if (post && built.post.renderAsync) await built.post.renderAsync();`. And
`directGrade` now always sets a clear colour — the renderer's default is black,
and a fallback that clears to black is the blank page the whole path exists to
prevent.

### 11.4b …and then the demotion itself: a new pass is a new MRT layout

The warm above was necessary and not sufficient. The next capture set still
came back BLACK on every sidecar that read `quality: "medium"`
(`live-fighting`, `live-result-win`, `live-visitor` at 1440) and a picture on
every one that read `"high"` — a clean split, which is a mechanism and not
luck.

`high` writes four attachments (`output`, `bloomIntensity`, `distort`, and
`normal` for the AO); `medium` writes three. A material whose shader variant
was compiled under the four-attachment layout looks for `normal` in the new
pass's target, does not find it, and `MRTNode.setup` assembles an output struct
WGSL will not take: the command buffer is dropped and the frame draws NOTHING.
`buildPost`'s own comment beside `wingMat` names this exact case — "a merged
output with no `normal` attachment is a pipeline error — which is what a
high→medium demotion would otherwise leave behind" — and then guards ONE
material, which the environment rebuild has since removed from the scene, so
the guard has been a no-op and the case was live.

`applyPost` now invalidates every material's variant (`needsUpdate = true`
across the scene) before compiling the new pass, which is what a tier change
IS, and `compileAsync` then builds them in the GPU process instead of inside
the first frame. Nobody could have seen this before: the governor never
demoted, so the rebuild path had never run in a shipped session — `forced: 0`
in every sidecar ever taken.

### 11.4c …and the rebuild is quarantined, because it does not work

Neither fix closed it. The split in the capture set after both of them is
total and reproducible, across five states at three sizes:

| sidecar `quality` | picture | dark pixels | render throw |
|---|---|---|---|
| `high` (12 of 18) | yes | 0.0–2.2 % | none |
| `medium` (2) | BLACK | 62.9 % | 1 |
| `low` (2) | BLACK | 50.7–70.5 % | 1 |

So `TIER_REBUILD_OK = false`. A tier change still runs the ENVIRONMENT's half
(`env.setQuality` — shadow map, instancing, the atmosphere layers), which is
the larger part of the cost and is safe; the post graph keeps the tier it
built at boot. A build where there is no graph at all — the boot's own first
build, and a rebuild after `dropPost` — is still allowed through, because that
path is the one that works and is how every good frame in this repo was made.

**This is not a regression.** `forced: 0` and `quality: "high"` are in every
sidecar this repo has ever taken: the rebuild has never once run in a shipped
session, and what changed today is only that it became possible to SEE that it
would fail if it did. The meter stays honest — `starving` reads it, and every
sidecar now carries a real `msPerFrame` — and the ceiling and the climb still
record what the machine can hold. The remaining fault is inside three's node
cache (a variant compiled against the four-attachment layout surviving into a
three-attachment pass) and it wants a debugger session, not another capture
round. Whoever takes it: flip the constant, run
`node tools/shots.mjs --only=live-fighting` and read `dark %` and `quality` in
the sidecar — the test is two minutes long once you know where to look.

### 11.5 The meter has an opinion inside the window anyone watches (finding 36)

`quality: "high"`, `forced: 0` and `msPerFrame: null` in 8 of 21 fresh captures,
with `live-visitor.json` at 108 ms/frame under drive and the governor reporting
nothing about it. Two causes, both here:

- the module's defaults need `warmup 40 + fast 24 = 64` ticks before
  `gov.msPerFrame` is anything but null, and `tools/shots.mjs` drives 24 —
  `GOV_TUNE = { warmup: 10, fast: 10 }` gives it an answer at tick 20, inside
  both a capture and a viewer's first second, and still skips the
  pipeline-compile frames the warm-up exists for. The `starving` escape reads
  `gov.fps` too, so it was dead on any page drawing fewer than 64 frames;
- the tick's ceiling was 0.25 s, so the panic rule (3 consecutive dt > 0.1 s)
  could only ever see the 4–10 fps band and never a half-second frame.
  `document.hidden` already answers the throttled tab, so the ceiling is 2 s for
  the panic's sake and the value handed over is still clamped at 0.25 for the
  rolling mean's.

Measured after: `msPerFrame` is populated in every capture that drew
(16.7–73.6 ms), where it was null in a third of them before.

### 11.6 `tools/checkboot.mjs` — the two things a capture could not say

Still a справка and not a gate; the weight is the gate and it holds.

- **"кадры, которых никто не рисовал"** — the sidecars carry
  `drawn.direct` and `drawn.blank`, and on WebGPU a frame whose command buffer
  is never submitted presents a TRANSPARENT surface, so a broken page looks
  like a light theme in the PNG and only these two counters tell them apart.
  They are printed with the first error line, which now names a location.
  A capture that drew NOTHING used to be dropped from this table entirely
  (`if (!first && !per) continue`) — exactly the row worth reading.
- **"палитра сторон"** — `applySides` mirrors the resolved mapping onto
  `window.__airenaDrawn`, which `tools/shots.mjs` already spreads into every
  sidecar, so the role-to-hue answer is now recorded beside every live picture
  with no capture-side change. Finding 37 said the handle was read by nobody;
  it is read by every capture now. The check is the addendum's own rule — with
  a creature in the fight, blue is `own` and orange is `foe` whatever slot the
  server dealt; without one, both are `slot` — and it prints РАСХОДИТСЯ with the
  file name when a capture breaks it. First run after: 3 captures with a
  creature, in slot blue AND slot orange, none diverging.

### 11.7 Not mine, found on the way

- **`src/viewer/environment.js`** owns everything in findings 4, 5, 6, 7, 8, 9,
  10, 11, 14, 17a, 21, 22, 23, 24, 33 of the review list — the value structure
  beyond 2·HALF, the sky's dead band, the planet and moon, the far pavilion,
  the banners' hanging geometry, the megastructure's dissolve, the shafts, the
  motes, the key's azimuth, the coping's ceiling and the shadow's floor. The
  one I would name first is **the key's azimuth locked to the orbit** (14): the
  same block type reads 11.9 L under the floor on its shade side in
  `live-searching.png` and 0.29 L in `live-fighting-w.png`, so the geometry and
  the materials are right and only the sun-to-camera angle fails.
- **The SOLIDS fade compositing (17b, 18).** `updateOcclusion` sets
  `m.opacity = o.fade` and nothing else; making a faded pale block go to
  NOTHING over a pale floor rather than to grey is a multiply toward the fog
  colour, which is `environment.js`'s materials. The stippled silhouette at the
  fade boundary is the same file's `castShadowNode`/alpha path — there is no
  `alphaHash` or `alphaTest` on those materials, so it is not a dither this
  file sets.
- **`src/client/ui/hud.css`** — the damage pill's dealer caret. `main.js` sets
  `--from` and `data-from` on `.dmg`; the rule that draws a 6 px caret on the
  pill's leading edge is the HUD's.
- **`src/client/ui/screens/live.css`** — finding 25's second half, docking the
  result card to one side at ≥ 900 px so `clearAim` gets a true half-frame
  instead of a 0.58 strip. The size cap makes the current strip usable; a
  half-frame would make it comfortable.
- **`src/viewer/arena.html:200`** still carries the boot preset the game moved
  off in round 8, and now also the fight camera's pitch: `orbit()` has no cap
  and the game has 15°, so the stand no longer predicts the game's fighting
  frame. Mirroring is the stand's call.
- **`tools/checkcontrast.mjs` (finding 39)** — nothing asserts that the
  viewer's `HUE = { own: 0x6EA8FF, foe: 0xFF7A5C }` is the token's `--info` /
  `--accent`. Two lines there and the ownership palette is one source by
  construction.
- **`hudBand.vs` is written and read by nobody** (`main.js:6658`). It was the
  VS beat's own flag before `standShot.auto` took the decision. Harmless, dead.
- **`tools/shots.mjs`** — a session claim that another capture run is holding
  makes every state fall back to the visitor, and with four fixers capturing in
  parallel that is most runs. The claim is per-DB; a per-run creature (or a
  lock with a wait) would make parallel capture honest.

### 11.8 Gates

`node tools/checkframing.mjs --dump=/tmp/airena-trail.json` HOLDS — worst |ndc|
**0.849** at 16:9 and **0.867** at 4:3 against `FRAME_EDGE` 0.92;
`node tools/checkcamera.mjs --trail=…` holds — dist p99 **129** of 200, height
p99 **6.4** of 20, az p99 **22.4** of 25; `node tools/checkvfx.mjs` holds;
`node tools/checkboot.mjs` holds at 1.56 MB of 1.80 compressed;
`node tools/checkbody.mjs`, `node tools/checkgrammar.mjs` and
`node tools/checkdocs.mjs` hold. `node tools/checkscope.mjs` reports two
violations and **neither is mine**: `src/client/ui/screens/live.css:1277` and
`:1426` use the word "stripe" in comments, which E6's payment-rail rule
matches. It was green when I started.

And the capture set itself, which is the point of all of it — 18 live captures,
six states at three sizes, after the last change:

**zero render errors, zero `drawn.blank`, zero `drawn.direct`, and no capture
above 0.7 % dark pixels** (the worst before was 70.5 % on `live-visitor.png`).
The palette line in `checkboot` reads the ownership rule off the same set and
finds no capture that breaks it, in either slot.

## 12. Round 10 — the review's viewer blockers, graded on the picture (`main.js`)

Six items, each with a test I ran myself. Four of them were already standing in
the working tree when this pass opened and needed **evidence**, not code; two
needed a change. What follows is what each test actually returned, on the
15-capture set of 2026-09-07 00:4x (`reports/screens/ui/live-*`), every one of
which came back **`errs 0`, `drawn.blank 0`, `drawn.direct 0`, dark 0.00 %**
and with `drawn.sides` naming a real owner.

### 12.1 The hit flash carries VALUE, not a side — accepted

`hitU.colour` is `HIT_WASH` (`#F4EEE8` through `srgbToLin`, the world's
brightest colour) and **nothing in the tree ever writes it**: the only
references are its declaration and the one `TSL.mix` in the post graph.
`HIT_PEAK` is 0.35 over `HIT_SOLID .03 + HIT_FADE .09` — 120 ms, both sides,
one colour.

Measured, on eight captures: the largest connected mass of chroma > 40 in the
warm half of the wheel, anywhere in the arena band, is **888 px at 150 × 6,
fill 0.99** — a HUD bar — and the largest that is not a bar is **454 px at
34 × 42, fill 0.32**, an arc of a coral ring. The failure this replaces
measured 7 994 px at 88 × 190 with the interior filled, σ(L) 0.039. There is no
filled saturated mass over a silhouette in any capture, at any size.

### 12.2 A body occludes the mark under it — accepted

The ghost's ring sandwich is depth-tested at `renderOrder −1` (drawn first in
the transparent list, so cover composites over it and bodies write depth
against it) and `RING_ALWAYS` is 0. The comment in `updateOcclusion` still
described the old `depthTest: false` at 0.85 and now describes what the code
does.

Test: for every column of every capture, a run of ≤ 3 saturated pixels
(C > 25) with real body material (L < 45, C < 12) immediately above **and**
below it — the exact signature the review measured as "a 2 px stroke through
the middle of the darkest object". Across eight captures at three sizes:
**1 pixel**, at (666,602), C 27.7 — one antialiased edge, not a stroke. The
frames the finding was written against carried a continuous coral band at
L 50 C 47 across a shin, and a blue one across a flashed body.

### 12.3 The winner stands beside the card — changed, and accepted on the desktop

Two faults, both read straight off `__airenaDrawn.beat` (the record this file
writes so the verdict is not stuck inside one frame):

1. **The eye could only ever retreat.** `sizeCap` names the FARTHEST distance
   at which the subject still reaches `heroTall`, and the loop under it grows
   the distance by 8 % until `bodyInBand` holds — so a beat inheriting the
   fight camera's 17–26 m had no way to shorten it. Three consecutive card
   captures said so in one line each: `live-result-win` **tall 0.069 at dist
   26**, `live-result-loss` **0.26 at 17**, `live-vs` **0.248 at 20**, against
   a `want` of 0.467. Every one refused on SIZE and fell to the arena portrait.
   Now, and **only where there is a card to stand beside**, the eye takes the
   cap in one step and the distance is committed only if `soloReadable` keeps
   it.
2. **The cap and the verdict were asking different questions.** `sizeCap` used
   `heroTall()` always; `soloReadable` uses it only when `hudBand.cardRect`
   exists and `TALL_WANT` otherwise. So with no card the cap named a distance a
   third nearer than the verdict needs. Both now read `cardRect`.

Two shapes were tried and rejected on the gate rather than on taste. A
rate-limited push-in is a no-op: the solve restarts from `camState.dist` every
frame and the restore hands every metre back. Flooring that restore instead
makes the eye sit at `HERO_NEAR` through a beat it never wins, and
`checkframing` went from worst |ndc| 0.849/0.867 to **0.890 and 1.103** — a
fighter a fifth of a screen outside the picture in 20 replays. Committing the
approach unconditionally was worse again (0.955 / **1.273**, six replays). The
`cardRect` condition is what makes the trade the right one exactly once.

After: `live-vs` **tall 0.984**, `live-result-win` **0.994**, both `pair:
true`, both `lapped: false`. On the picture at 1440 × 900 the winner is a
**192 × 201 px** dark mass at x[732–923] against a card whose left edge is at
**x 948** — 201 px tall, 25 px clear, where the round before carried 39 px of
it. `live-vs` puts its subject BELOW the card (`box` y[−0.63, 0.36] under
`card` y1 0.42), which is the stacking answer.

**Not accepted at 390 × 844.** There the pair test passes before the solo hero
shot is reached, so the winner is photographed at ~95 px. The bar is 210 px
(`heroTall` on an 844-tall frame) and the phone does not meet it.

### 12.4 The tier is a tier all the way down — accepted

The graph is built once, at boot; `setTier` writes the tier to `localStorage`
and the next load takes the lower of that and the static guess; `applyPost`
publishes `window.__airenaPostTier`, which rides into every sidecar through
`__airenaDrawn`. The one thing missing was a way to ASK for a tier from the
harness: `tools/shots.mjs` builds `${BASE}/#${route}`, so a base carrying the
parameter arrives as `?quality=medium/`. The parameter is now read letters-only,
which costs nothing and makes the route work without a capture-side change.

    node tools/shots.mjs --base='http://localhost:8787/?quality=medium' --only=live-fighting
    node tools/shots.mjs --base='http://localhost:8787/?quality=low'    --only=live-fighting

| tier | `quality` | `drawn.postTier` | frames | direct | blank | dark |
|---|---|---|---|---|---|---|
| medium 1440×900 | medium | **medium** | 112 | 0 | 0 | 0.00 % |
| medium 1280×720 | medium | **medium** | 191 | 0 | 0 | 0.00 % |
| medium 390×844  | medium | **medium** | 209 | 0 | 0 | 0.00 % |
| low 1440×900    | low    | **low**    | 175 | 0 | 0 | 0.00 % |
| low 1280×720    | low    | **low**    | 230 | 0 | 0 | 0.00 % |
| low 390×844     | low    | **low**    | 238 | 0 | 0 | 0.07 % |

Mean pixel value 196–207 in all six. Before the rebuild was deleted, every
sidecar reading `medium` or `low` was a black canvas at 51–70 % dark; there was
no capture in this repo of a medium or a low post graph. There are six now, and
each one names its own tier twice.

### 12.5 The own-side fill is a lift, not a shadow — accepted

`HUE_FILL` is `#A9CBFF` / `#FF9F87` at `FILL_ALPHA` 0.34, on its own material
list (`fillMats`) that `applySides` rewrites with the other two.

Measured on the telegraph discs, against the floor 14–22 px outside the mark's
own box: `live-fighting` **L 84.2, C 13.8, Lab hue 304** against a floor of
89.9 — **5.7 L down**; `live-fighting-w` **L 78.3, C 22.8, hue 293** against
74.2 — 4.1 L **up**. The frames the finding measured read `#DACCCE` at hue 7.7
and `#C2B8C9` at hue 312.6, 8.5 L under their floors. The mark is blue-violet
and inside the 6 L the brief allows; nothing reads pink.

### 12.6 The spectator gets the same fight the owner does — accepted

`PAIR_TALL` 0.24 caps the band solve's retreat at the distance where the taller
body still subtends 12 % of the height, which is what stopped `live-visitor`
running to the 44 m ceiling. Two clean captures of the state:

* 296 × 155 px, **17.2 % of the frame height**, centroid x **0.627**
* 229 ×  94 px, **10.4 %**, centroid x **0.562**, both bodies inside
  ndc x **0.01 … 0.33**

against the failure's 193 × 90 px — 1.32 % of the frame — jammed at centroid
x 0.31 with the right 740 px empty. The pair is inside the middle 70 % of the
width in both.

### 12.7 Gates

`node tools/checkframing.mjs --dump=/tmp/airena-trail.json` **HOLDS** — worst
|ndc| **0.849** at 16:9 and **0.867** at 4:3 against `FRAME_EDGE` 0.92, both
unchanged by the camera work above (the harness has no card, so the beat's
approach is inert there by construction). `node tools/checkcamera.mjs
--trail=…` **holds** — dist p99 128.1 of 200, height 7.3 of 20, az 21.8 of 25.
`node tools/checkvfx.mjs` **holds**. `node tools/checkboot.mjs` **holds** at
1.60 MB of 1.80 compressed, with 3 of 24 captures under the 30-frame floor
(5 of 24 last round) on a machine running four agents. `node
tools/checkscope.mjs` **holds** — no violations at all this time; the
`environment.js` "stripe" comment that was the only one left has gone.

### 12.8 Not mine, found on the way

**The capture harness cannot hold an identity while a second agent is on the
machine, and it says so in the wrong words.** `tools/shots.mjs` claims the
capture creature by writing `creature.owner_id` and then asks the page who it
is. The write lands and the server sees it immediately — verified directly:
claiming the row to a curl session's account and re-reading `/api/session`
returns `creature c_18e20e72-6bb STONE GOLEM` on the next request. What fails
is the PAGE's identity: `localStorage.getItem('airena.session')` comes back
null on the boot page, so every subsequent request mints a fresh guest (34 new
`account` rows in one hour of this round), the re-check finds no creature, and
the run stamps every owner state `session: no creature claimed — the page still
reports no creature — another capture run may be holding it`. Another run
holding it is not what happened; the token never reached the page. Six
consecutive runs of five states were lost to this before one landed. The
session cookie is `SameSite=None; Secure` (`src/server/http.js:287`) and works
under `curl`, so the first place to look is whether headless Chrome is keeping
it across the pages of one profile — and the second is why `api.js`'s
`setToken` never fires on the boot page.

**Orphaned Chrome.** A killed capture run leaves its `--headless=new` Chrome
alive with `ppid 1`; two of them were holding 24 processes between them when
this pass started (54 Chrome processes on the machine, 30 after they were
cleared). Whatever kills a run should kill its browser, or the lock should
sweep orphans whose `airena-vfxshot-<pid>` parent is gone.
