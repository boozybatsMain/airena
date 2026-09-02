# Lightning primitive — API notes for builders (Airena, `src/viewer/vfx/arc/`)

Written 02.09 after the polish round on the beam (`beam.js`). The beam is the quality bar; every
other delivery (cone, zone, self, ball, impact) is to be rebuilt on the same two files and these
numbers. Code comments in the repo are Russian and explain the *why* with measurements; this file
is the English map of the API.

Files: `field.js` (the primitive: materials, instanced segments, generators), `common.js`
(cast orb, impact cloud, spikes, floor ring, restriker, sparks, helpers), `util.js` (TAU, clampN,
hex, env, onSphere, bodyAt). Do not edit `core.js`, `kit.js`, `vfx.js`, `main.js`.

Final frames of this round (four cameras, moments 0.06 / 0.15 / 0.3 / 0.6 / 1.2):
`reports/vfx/arc-polish-r1/`
(`index.json` there lists `actual` per frame and the capture caveats). Smoke frames of the other
deliveries: `reports/vfx/arc-polish-r1-others/`. Reference: `reports/vfx/reference/ref-storm-*.png`.

---

## 1. How one filament looks on screen (the rendering contract)

Everything lightning is drawn as **ribbon segments** in one instanced buffer, rendered three times:

| layer  | half-width           | blend    | order | colour / role |
|--------|----------------------|----------|-------|---------------|
| jacket | `6.5 × width`        | normal   | 7     | saturated blue `P[2]·0.8` at the edge, slightly lighter under a core; alpha 0.95 in the inner 55 % of the width, soft rim. **This is what reads on the white floor.** Cools to navy `(0.02,0.05,0.28)` by `cool·0.85`. Bloom 0.08·(1−cool). |
| glow   | `9.0 × width`        | additive | 9     | wide soft `P[2]→P[1]` halo, alpha ≤ 0.15. Only visible on dark bodies/walls; on the white floor it does nothing. Bloom 0.1. Off when cooled. |
| core   | `1.0 × width`        | normal   | 10    | HDR white `(3.5,3.7,4.1)` with a **hard edge** (`smoothstep(0.15,0.7,mask)`), bloom **0.15**. Drawn on top, so the white sits on blue, not on the white floor. Off for negative `bright` and when cooled. |

`width` is the **core half-width in metres**. Beam filaments use 0.021 (≈ 2 px core, ≈ 11 px jacket
at 26 m broadcast, 41 px/m); floor glyphs use 0.006 (≈ 1.5 px jacket line); floor rays 0.02;
`radialArcs` 0.04 (thick, for short-lived fans).

Why these numbers (measured on the broadcast camera, column box (740,395)–(850,505) at 0.3 s):

- ACES tonemapping maps HDR 1.7 → 243/255 and 3.5 → 251. A "hot" (≥248 in all channels) pixel
  must come from the core colour itself; bloom is only a small helper. Core bloom 0.3 or more turns
  the whole column white (r4: 1465 hot but only 1701 deep-blue pixels); 0.15 keeps the cores as
  threads.
- Soft core edges (`mask^0.9`) put half-alpha white over the jacket and make pale pixels that count
  as neither white nor blue (r3: 116 hot / 1831 blue). The hard edge gives white-or-blue.
- The judge's "deep-blue" count equals `b−r ≥ 60, r ≤ 200, b ≥ 120` (grammar 0.6 s: 2239 vs the
  judge's 2247). Target for the beam column at 0.3 s: **hot > 300 and deep-blue > 2000**.

Per-segment attribute `scfg = (width, bright, phase, u)`:

- `bright` — magnitude scales all layers; **sign selects the core**: negative = no white core
  (floor marks: solid blue strokes, not blue rings with white centres).
- `phase` — flicker seed (25 Hz noise on the core only; jackets do not flicker).
- `u` — fraction along the path; segments with `u > reach` are not drawn (emergence), and
  segments with `u` within 0.18 below `reach` burn 2× (leader tip).

Material uniforms via `field.set({fade, hot, reach, cool})`:

- `fade` 0..1 global alpha (use only for the last ~15 % of a life; alpha fading on the white floor
  reads as pastel — decay by *count* instead, see §4).
- `hot` 0..1 restrike flash: core ×(0.95+0.4·hot), jacket and glow 35 % wider.
- `reach` 0..1 growth front (emergence 0.05→0.16 s in the beam).
- `cool` 0..1: jacket → navy, core and glow → off. Beam ramps 0.9→1.4 s.

Materials are pooled by `boltMat(layer, P)` (ring 8 per layer). A fresh page compiles each new
node material on the spawn frame (12–22 ms each); see capture caveats in §6.

---

## 2. `field.js` exports

```
LAYER, STRIDE, boltMat(layer, P), boltField(vfx, P, maxSeg = 1400),
strandSegs, polySegs, bundleSegs, glyphSegs, crackleSegs
```

### `boltField(vfx, P, maxSeg)` → `{ group, write(items, rng), set({...}), count() }`

One instanced geometry + three meshes (`group`, add via `vfx.spawnMesh(field.group, life, cb)`).
`write(items, rng)` rewrites all segments; each item picks its generator by shape:

| item shape | generator | what it draws |
|---|---|---|
| `{a, b, ...}` | `strandSegs` | one jagged filament with optional branches |
| `{pts: [[x,y,z],...]}` | `polySegs` | explicit polyline |
| `{bundle: true, a, b, ...}` | `bundleSegs` | the cage bundle (main bolt) |
| `{glyph: true, x, z, ...}` | `glyphSegs` | one floor crackle mark |
| `{crackle: true, a, b, ...}` | `crackleSegs` | a carpet of marks along a→b |

An item may carry its own `rng` (deterministic per-mark shape between restrikes); otherwise the
restriker's generator is used. Budget: `maxSeg` instances — beam uses 2400 (≈ 450 bundle segments
at n 15 / 9 m, plus ≤ 260 marks × ≤ 4 links, plus rays).

### `strandSegs(s, rng, put, depth)` — one filament

`{a, b, width, bright=1, jag=0.12, kink=0.36, step=0.32, branches=0, floor, floorY=0.05,
floorTop=0.4, minY, phase, u0=0, u1=1}`

Midpoint-displacement polyline between `a` and `b`. **Self-similar kink**: at every level the
displacement is `min(jag·L, kink·segmentLength)` — with kink 0.36 every segment turns 30–40°
whatever its scale (the old "big bow + fine ripple" law produced rounded worms). `levels` =
`round(log2(L/step))` clamped 1..5. `branches` 1–3 spawn child strands at 20–40°, 0.2–0.45 L long,
width ×0.6, bright ×0.75. `floor: true` clamps y into `[floorY, floorTop]` and damps vertical
offsets (floor rays). Used for: impact floor rays (`width 0.02, jag 0.28, branches 2, step 0.26,
floorTop 0.5`), `radialArcs`, `crawl`.

### `bundleSegs(s, rng, put)` — the cage bundle

`{a, b, n=12, step=0.42, r0=0.05, r1=0.6, minY=0.08, width=0.03, bright=1, phase=0, u0, u1,
wander=1, turn=2.4, heroes=3, bend=0.04, rungs=1.0, stubs=0.5, tangle=1}`

- `n` filaments start at the single point `a` and walk inside a cone of radius
  `R(t) = r0 + (r1−r0)·t^0.9` (beam: r0 0.05, r1 = clamp(0.3+0.055·len, 0.45, 0.8), width 0.021).
- Node law is a **transverse random walk with direction memory**: per node `ang += (rng−0.5)·turn`,
  jump `step·(0.5..1.0)·wander`; if the walk leaves the tube it is pulled back to 75–100 % of R and
  the heading turns 90° (reflection). This is what gives crossings and readable polygonal cells at
  26 m (the sinusoidal law gave combed hair).
- A third of the filaments end early at 78–98 % (ragged far end); the rest converge to 30 % R at
  the target.
- `heroes` filaments are width ×1.35 / bright 1, the others ×0.8–1.0 / 0.8–1.0.
- `rungs` per step (fractional allowed): a kinked cross-link between two filament nodes 0.12–1.0 m
  apart, width ×0.6, bright ×0.85.
- `stubs`: fraction of filaments that get one 0.3–0.8 m stub at 35–65° ending in space, width ×0.55.
- `tangle` 0..1: `round(n·0.7·tangle)` short 2–3-link strands inside a sphere of `0.95·r1` at the
  target (the white knot). Beam: `tangle = hit ? k : 0.4k`.
- `bend`: the whole bundle bows once in a random direction by `bend·L·(0.5..1.5)`.

### `glyphSegs(s, rng, put)` — one floor crackle mark

`{x, z, y=0.05, dot=false, links=2..4, len=1, dir, width=0.006, bright=−0.9, phase, u}`

2–4 links of `(0.12..0.28)·len` m with 50–120° turns → L/V/Z glyphs like ref-storm-800; `dot`
draws a 0.02–0.06 m dot at width ×1.5. Default `bright` is negative (no core). Put `y` at 0.05: the
ribbon faces the camera, and at 0.006 width its lower half stays above the floor.

### `crackleSegs(s, rng, put)` — carpet of glyphs along a→b

`{a, b, n=30, spread=1.2, y=0.05, width=0.006, bright=−0.9, phase, u0, u1}`

Positions `f = rng^0.55` (denser at the far end), lateral `±spread·(0.35+0.65f)`, 30 % dots,
width jittered ×0.7–1.3, `u = u0 + (u1−u0)·f` so the carpet appears with `reach`. One-shot carpet
for deliveries that do not need per-mark lives (fan, zone, impact); the beam manages marks itself
(see §4).

---

## 3. `common.js` exports

```
orb, halo, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs,
cloud, hotCore, spikes, floorRing
```

### `restriker(field, seed, strandsAt, interval = 0.045, flash = 0.035)` → `{ tick(t) }`

Calls `field.write(strandsAt(t, rng), rng)` every `interval·(0.7..1.3)` s (`interval` may be a
function of `t`: beam uses 0.045 full, 0.07 decaying, 0.11 residue) with a fresh `mulberry` per
strike; `tick` returns the flash 1→0 over `flash` seconds — pass it as `hot`. Call `rs.tick(0)`
right after creating it so the first frame is not empty. Restrike interval 40–60 ms is the
reference; the residue marks keep shape through restrikes by carrying their own `rng`
(`mulberry(markSeed ^ floor(t/0.12))`, i.e. they change every 120 ms, not every strike).

### `cloud(vfx, P, {x,y,z, at=0, r0=0.3, r1=1.0, grow=0.2, hold=0.4, life=0.7, squash=1, seed=1, hot=1, dense=1, additive=false})`

Noise-displaced sphere. Times are **absolute seconds from the cast**: grows r0→r1 over `grow`
from `at`, full until `hold`, fades to zero at `life`.

- **Cast orb at the hand** (`additive:false`): normal blending, white `(1.15,1.2,1.3)` centre,
  light-blue → deep-blue fresnel rim (the rim is what makes a white ball readable on the white
  floor), bloom 0.35. Beam: `r0 0.25, r1 0.68, grow 0.07, hold 0.3, life 0.44, dense 1.35` (normal blend, bloom 0.35) plus
  `hotCore` where the bundle leaves it. Matches ref-storm-120 from the low camera.
- **Impact cloud** (`additive:true`): additive HDR white `(1.6,1.7,1.9)` with a soft light-blue
  falloff and **no fresnel rim** (a rim made it a snow globe), alpha `body^1.3`, bloom 0.2.
  Additive over the dark victim only brightens — a normal-blended cloud at partial alpha over a
  dark body is grey. It is invisible over the white floor, which is fine: the tangle and the
  crackle are there. Beam: `at 0.16, r0 0.35, r1 1.25, grow 0.16, hold 0.36, life 0.56,
  squash 0.85, hot 1.0` — gone before 0.6 s so the 0.6 frame shows the bare bolt in the target.

### `hotCore(vfx, P, {x,y,z, r=0.2, life=0.4, at=0, hold=0.3})`

Additive HDR white `(1.5,1.55,1.7)` sphere with fresnel falloff, bloom 0.7, 10 % pulsing. The
bright spot where the bundle exits the cast orb.

### `spikes(vfx, P, {x,y,z, n=40, speed=13, life=0.32, size=0.26, at, r, up=0.55, dir, half=π, side, flat=0, gravity=0, spread=0})`

Velocity-stretched streaks (`kit.SHAPE.streak`, `ext(0,0.35,1,glow)`), **one trajectory list
emitted twice**: white `(0.9,0.95,1.0)→P[1]` into `vfx.glow` (reads on bodies and walls) and deep
blue `(0.08,0.4,1.0)→0.7·P[2]` into `vfx.body` (reads on the white floor; glow share 0.4). A single
additive emit does not exist on the floor from the broadcast camera. Directions: default radial
with elevation ±`up` rad; `dir`+`half` a fan around an azimuth; `side:[ux,uz]` perpendicular to a
bundle axis; `flat` 0..1 squeezes toward the horizon. Beam: 90 at 15 m/s life 0.36 size 0.3 at
impact, plus 18 slower upward ones 50 ms later. `r` must be the cast's `mulberry` (determinism).

Side streaks along a bundle (beam.js): precompute `nAlong = clamp(12·len, 24, 140)` trajectories
born uniformly over the full phase, emit white into `vfx.glow` and blue into `vfx.body` with the
same list (`vfx.add.emit` is NOT enough — it copies the same white colour into both pools).

### `floorRing(vfx, P, {x, z, r0=0.4, r1=3.0, life=0.5, at=0, y=0.07, thick=0.3})`

Ring of **fixed width in metres** (uniform `wid = thick/r`, hard inner edge, soft outer 12 %):
deep blue `P[2]·0.75` at alpha 0.95 with a hairline white core (`core^6`, bloom 0.4·core). Holds
full alpha for the first half of `life`, then fades. Findable at 26 m at 0.3 m width; 0.2 m with a
wide white centre was a lilac ghost. Expands `r0→r1` with easeOutCubic; beam: 0.4→3.0 m in 0.5 s
from 0.16.

### Others (unchanged behaviour)

- `orb(P, radius, seed, shellK)` → `{group, set(fade, fill, r)}`: storm ball — normal-blended
  `solid` sphere with plasma veins under an additive `shell`; `fill` 1 = full ball (ball
  lightning), 0 = rim only (halo around a body).
- `halo(vfx, P, a, b, radius, life)`: normal-blended ionised tube along an axis (fresnel edge,
  streaks running toward `b`).
- `crawl(x, z, dir, len, rng, phase, width=0.04, bright=0.85)`: returns a floor strand item
  (`jag 0.28, branches 2`) — now kinked by default.
- `stormBurst`, `arcSparks`, `muzzle`, `heldLight` — kit wrappers (burst in `air`+`storm` modes,
  blue sparks, hand burst, movable pooled light).
- `radialArcs(vfx, P, seed, x, z, n, len, life, y0=0.3)`: its own field + restriker, `n` floor rays
  of `len·(0.7..1.3)` from a point, alive for `life` (envelope `env(t, 0.45·life, life)`).

---

## 4. Recipes (what the beam does; copy these)

**Bundle at full power** — `{bundle:true, a, b, n, r0:0.05, r1, step:0.4, width:0.021, bright:1,
minY:0.1, rungs:0.5+0.8k, stubs:0.2+0.4k, tangle:(hit?1:0.4)·k, bend:0.04}` with
`n = round(nFil·k^0.8)`, `nFil = clamp(round(6+len), 8, 22)`, `r1 = clamp(0.3+0.055·len, 0.45, 0.8)`.

**Decay by count, not brightness** — `k = 1` until `T.full` (0.7 s), then linear to 0 at `T.decay`
(1.0 s); filaments drop out with `k^0.8`, the survivors stay at `bright 1`; alpha fade only in the
last 15 % (`bright = k<0.15 ? k/0.15 : 1`). A half-transparent net on the white floor is a pale
ghost; fewer full-colour filaments keep saturation (topology's proof at 0.6 s).

**Floor crackle marks with individual lives** — `nMark = clamp(22·len, 50, 260)` marks: 25 % in a
2 m disc around the target, the rest along the path with `f = rng^0.6` (denser far), lateral
`±1.5 m` (`sign(s)·|s|^1.4·1.5`). Each mark: `born = 0.05 + 0.08f + rng^2.2·0.9` (appears with the
reach, tail up to ~1 s), **`life = 1.0 + 0.7·rng` independent of `f`** (near-hand marks used to die
first and left the near half empty by 1.2 s), `dot` 33 %, `links 2–4`, `len 0.8–1.4`, own seed. Per
restrike push `{glyph:true, x, z, y:0.05, dot, links, len, dir: dir+(g()−0.5)·0.6, width:0.006,
bright: −(0.8..1.0)·envl, phase, u:f, rng:g}` with `g = mulberry(seed ^ imul(floor(t/0.12)+1, …))`
and `envl` = ramp 8 % in, hold, ramp 12 % out. Then `cool = clamp01((t−0.9)/0.5)` on the field so
that by 1.2 s the marks are dark blue and by 1.4 s navy (ref-storm-1500). Measured at 1.2 s from
the top camera per sixth hand→target (band ±70 px): grammar `[0,1,0,19,136,299]` → now
`[53,147,163,183,888,956]`.

**Tangle** — part of `bundleSegs` (`tangle` option); for a standalone knot at a point push a
`bundle` with a short `a→b` (≥ 0.2 m) and `tangle 1`, or several `{pts}` 2–3-link strands inside a
sphere with `bright 1.05`.

**Impact** (at `T.out1` = 0.16 s): additive `cloud` (above), `spikes` ×2, `floorRing`, 7 floor rays
via `strandSegs` for 0.5 s (`env(tr, 0.22, 0.5)`), `arcSparks` 40, `flashLight` 30 for 0.4 s,
`screen.shake 0.45`, `screen.flash 0.05` (more veils the frame), `aberration 0.6`, and the
persistent decal `kit.decal({type:'arc', radius: hit?1.6:1.1, hold:20, tint:P[2]})` — **tint P[2]
and radius ≤ 1.6**: the old grey `P[1]` speckle at 2.4 m read as dirt under every late frame. Two
smaller path decals (radius 0.8–1.1, tint P[2]) at 42 % and 72 % of the path.

**Muzzle** — `cloud` (solid) + `hotCore` + `flashLight 16` + 18 `kit.sparks` in a cone.

---

## 5. Beam timeline = the quality bar (seconds from cast)

```
0.00–0.30  cast orb at the hand (~1.3 m, white with blue rim), hot core where the bundle exits; gone by 0.44
0.05–0.16  emergence: bundle grows hand→target via `reach`, leader tip 2× bright
0.16       impact: additive white cloud, 90+18 spikes (white+blue), ring 0.4→3 m / 0.5 s,
           7 floor rays, light, shake, decal (blue, 1.6 m)
0.16–0.70  full power: restrike every 45 ms (×0.7–1.3), hot flash 35 ms; side streaks (white+blue) all along
0.36/0.56  cloud holds / is gone — 0.6 s shows the bare bolt hitting the target
0.70–1.00  decay by filament count (n ~ k^0.8), restrike every 70 ms
0.90–1.40  cool: jackets to navy, cores off (marks only; the bundle is gone by 1.0)
0.05–1.90  crackle carpet: 50–260 glyphs, lives 1.0–1.7 s each, fade in the last 12 %, field fade in the last 0.35 s
```

Measured on the final frames (broadcast, column box (740,395)–(850,505); targets hot > 300 and
deep-blue > 2000 at 0.3 s): 0.15 s hot 808 / blue 1280; **0.3 s hot 1249 / blue 2045**; 0.6 s hot 747 /
blue 1875 (cloud gone, bare bolt in the target); 1.2 s hot 0 / blue 766 (residue only). Grammar (the
tournament winner) had 0 hot at every moment and blue 2027 / 2239 at 0.3 / 0.6. Residue at 1.2 s per
sixth hand→target (top camera, band ±70 px): `[58,173,184,213,971,1044]` vs grammar
`[0,1,0,19,136,299]`. Emergence from the top at the 0.06 frame: bolt pixels per tenth of the path
`[139,495,560,564,894,152,0,…]` — the bundle stops at ~55 % with the bright leader (frame lag, §6).
60 fps, zero console errors, on all final frames and on the smoke run of cone/zone/self/bolt/lob.

---

## 6. Capturing and measuring

- Capture only through the lock wrapper:
  `tools/vfxshot-lock.sh --port=8823 --el=arc --kind=beam --cams=broadcast,side --moments=... --out=<abs>`.
  Cameras: `broadcast` (26 m along the beam — judge here first), `side` (26 m across — bundle
  shape), `low` (15 m), `top`.
- **Do not put close moments in one run.** `Page.captureScreenshot` costs ~0.3 s on WebGPU and the
  next queued moment inherits the delay (one cast with 0.06,0.15,0.3 drifted to 0.06,0.43,0.78).
  `docs/vfx-notes/polish.sh <name> [cams|all]` shoots (0.06,0.6), (0.15,1.2) and (0.3) as three casts
  with retries and merges them into `polish/r1/<name>/` with a note in `index.json`.
- The **first presented frame after a cast lags ~0.04–0.06 s** because the pooled node materials
  compile on the spawn frame in a fresh page (12–22 ms each; the ring of 8 is empty). The 0.06
  frame therefore shows the effect at ≈ 0.10–0.12 s: bundle at 45–65 % of the path with the bright
  leader. This is a capture artefact, not an effect-clock offset — `spawnFx` and `frame()` share
  `performance.now()`.
- Metrics: `python3 docs/vfx-notes/metrics.py box <png> 740,395,850,505` (hot, blue60 = judge's
  deep-blue, satPx), `... path <png> 690,270 880,600 70` (top camera, blue marks per sixth
  hand→target), `... extent <png> 690,270 880,600 60` (reach fraction from the top),
  `... crop <png> x0,y0,x1,y1 scale out.png`.
