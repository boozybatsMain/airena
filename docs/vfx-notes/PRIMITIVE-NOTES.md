# Lightning primitive — API notes for builders (Airena, `src/viewer/vfx/arc/`)

Written 02.09 after the polish round on the beam (`beam.js`), refreshed 03.09 after round 2.1
(the judges' eleven-item list: silhouette, kinks, emergence, orb, cloud, spikes, residue, ring,
dirt, gradient, hold). The beam is the quality bar; every other delivery (cone, zone, self, ball,
impact) is to be rebuilt on the same two files and these numbers. Code comments in the repo are
Russian and explain the *why* with measurements; this file is the English map of the API.

Files: `field.js` (the primitive: materials, instanced segments, generators), `common.js`
(cast orb, impact cloud, spikes, streak segments, floor ring, restriker, sparks, helpers),
`util.js` (TAU, clampN, hex, env, onSphere, bodyAt). Do not edit `core.js`, `kit.js`, `vfx.js`,
`main.js`.

Final frames of round 2.1 (four cameras, moments 0.06 / 0.12 / 0.38 / 0.8 / 1.5):
`reports/vfx/r2-arc/r1/final/` (`index.json`: fps 60, errors empty, no drift > 0.01 s). The five
capture-and-look iterations are `reports/vfx/r2-arc/r1/i1…i5`, the 60 fps clips (broadcast, side)
`reports/vfx/r2-arc/r1/clips/`, the smoke frames of the other deliveries
`reports/vfx/r2-arc/r1/others/`. Previous round: `reports/vfx/arc-polish-r1/`. Reference:
`reports/vfx/reference/ref-storm-*.png`.

---

## 1. How one filament looks on screen (the rendering contract)

Everything lightning is drawn as **ribbon segments** in one instanced buffer, rendered three times:

| layer  | half-width    | blend    | order | colour / role |
|--------|---------------|----------|-------|---------------|
| jacket | `4.0 × width` | normal   | 7     | saturated blue `P[2]·0.85` at the edge, lighter under a core. **Two cross profiles by the sign of `bright`** (§ below): cored filaments are opaque only within ±1.8 cores (mask > 0.55) and fall off as `mask^2.2` to the edge — each filament keeps its own halo and floor shows between cells; coreless marks/streaks are solid from 45 % of the mask (their opaque zone would be 0.4 px otherwise). Cools to navy `(0.02,0.05,0.28)`. Bloom 0.08·live. |
| glow   | `6.0 × width` | additive | 9     | wide soft `P[2]→P[1]` halo, alpha ≤ 0.10, no leader boost (additive blue on the white floor is a lilac cant). Only visible on dark bodies/walls. Off when cooled. |
| core   | `1.0 × width` | normal   | 10    | HDR white `(3.5,3.7,4.1)`, hard edge (`smoothstep(0.15,0.7,mask)`), bloom 0.15. Flicker depth 15 % (`0.85..1.0`), restrike flash ×1.3. Off for negative `bright` and when cooled. |

`width` is the **core half-width in metres**. Beam filaments use 0.025 (2 px core, ~3.7 px opaque
blue, soft halo to ~8 px at 26 m broadcast, 41 px/m); floor glyphs 0.0055 (~1.6 px solid line);
streak segments 0.005–0.006; floor rays 0.025; `radialArcs` 0.04.

Why these numbers (broadcast camera, column box (740,395)–(850,505)):

- ACES maps HDR 1.7 → 243/255 and 3.5 → 251: a "hot" pixel (≥ 248 in all channels) must come from
  the core colour at alpha ≥ ~0.9. **Core alpha must not carry the brightness gradient**: with
  `ramp` 0.55 mid-path cores sat at alpha 0.72 → (245,247,250), and the column was white only in
  frames that caught a restrike flash (725 hot in a flash frame vs 66–204 between flashes, r2).
  Now `ramp` 0.85, non-hero brightness 0.92–1.0, flash ×1.3, flicker 0.85–1.0.
- Jacket 6.5× with a hard edge (r1) and 4× hard from 30 % of the mask (r2 start) fused 15
  filaments in a 1.6 m tube into a smooth blue sleeve ("fishnet stocking"). Opaque ±1 core
  (r2 i1) read as wire: 168 hot / 1018 deep-blue. ±1.6–1.8 cores with the soft tail keeps the
  cells readable from the side and gives 314 hot / 1410 deep-blue at 0.38 s, 581 / 2028 at 0.8 s.
- The judge's "deep-blue" count is `b−r ≥ 60, r ≤ 200, b ≥ 120`. The old target of 2000 at 0.3 s
  was measured on the fused sleeve; without the sleeve the column holds 1400–2000 depending on
  the restrike.

Per-segment attribute `scfg = (width, bright, phase, u)`:

- `bright` — magnitude scales all layers; **sign selects the core**: negative = no white core,
  straight ends (floor marks, streaks). **For coreless segments the magnitude above 0.6 is the
  segment's own heat**: 1.0 = fresh saturated blue, 0.6 = cooled to navy; below 0.6 is alpha
  fade (`sat = smoothstep(0, 0.6, |bright|)`). So every mark cools on its own clock.
- `phase` — flicker seed (25 Hz noise on the core only). **`phase < 0.5` marks the leader
  filament** (hero 0 of a bundle with `phase: 0`): during emergence it alone has a sharp front
  (4 % window) and a ×2.2 core / ×1.3 jacket tip in the 12 % behind the front; every other
  segment fades over the last 18 % of `u` before `reach` — a ragged front with one bright point.
- `u` — fraction along the path; segments with `u > reach` are not drawn.

Material uniforms via `field.set({fade, hot, reach, cool})`:

- `fade` 0..1 global alpha (use only for the last ~15 % of a life; alpha fading on the white floor
  reads as pastel — decay by *count* instead, see §4).
- `hot` 0..1 restrike flash: core ×(1+0.3·hot), jacket and glow 25 % wider.
- `reach` 0..1 growth front (emergence 0.02→0.10 s in the beam).
- `cool` 0..1: jacket → navy, core and glow → off; cored segments take 30 % of it. Beam sets it
  only after the bundle is dead (1.15→1.4 s); the marks cool by their own `bright`.

Materials are pooled by `boltMat(layer, P)` (ring 6 per layer). `boltField(vfx, P, maxSeg,
{mats})` can reuse another field's material set (same uniforms, own geometry and write cadence).

---

## 2. `field.js` exports

```
LAYER, STRIDE, boltMat(layer, P), boltField(vfx, P, maxSeg = 1400, opts = {}),
strandSegs, polySegs, bundleSegs, surfaceSegs, glyphSegs, crackleSegs
```

### `boltField(vfx, P, maxSeg, opts)` → `{ group, mats, write(items, rng), set({...}), count() }`

One instanced geometry + three meshes (`group`, add via `vfx.spawnMesh(field.group, life, cb)`).
`opts.mats` — reuse the three materials of another field of the same cast (the beam's spike
field: written every frame, shares `reach/hot/cool/fade` with the bundle field, takes no second
slot from the ring). `write(items, rng)` rewrites all segments; each item picks its generator:

| item shape | generator | what it draws |
|---|---|---|
| `{a, b, ...}` | `strandSegs` | one jagged filament with optional branches |
| `{pts: [[x,y,z],...]}` | `polySegs` | explicit polyline (streak segments use two points) |
| `{bundle: true, a, b, ...}` | `bundleSegs` | the cage bundle (main bolt) |
| `{surface: true, c, r, ry, ...}` | `surfaceSegs` | a lattice woven on an ellipsoid (shield, victim, wall) |
| `{glyph: true, x, z, ...}` | `glyphSegs` | one floor crackle mark |
| `{crackle: true, a, b, ...}` | `crackleSegs` | a carpet of marks along a→b |

An item may carry its own `rng`. Budget: beam uses 3000 for the main field (≈ 300–350 bundle
segments at n 14 / 9 m, ≤ 560 marks × 1–6 links, rays) and 320 for the spike field.

### `set({ fade = 1, hot = 0, reach = 1, cool = 0, tail = 0 })` — the uniforms

`fade` overall, `hot` restrike flash (1 at the restrike, 0 ~35 ms later), `reach` the fraction of
the path the discharge has grown to (≥ 1 = all lit), `cool` 0..1 cooling of the whole field.

**`tail` (03.09, A0.1) — the lower edge of the lit window.** The discharge stands in space whole;
only the band `tail`..`reach` of `u` is lit, feathered over 0.08 of the path (0.7 m on a 9 m bolt;
a hard cut read as a chopped stick from the side camera). `tail ≤ 0` switches the window off, so
beam / cone / zone / the head field are unchanged by default. This is what makes a bolt a bolt
under P1: the origin at the hand is lit while `tail = 0`, then the tail leaves it behind the head.
**Always pass `hot: rs.tick(t)` in the same `set` call** — the destructuring defaults zero every
field you omit.

### `surfaceSegs(s, rng, put)` — a lattice woven on an ellipsoid (03.09, A0.3)

`{surface: true, c: [x,y,z], r, ry = r, rz = r, n = 10, links = 6, link = 0.3, width = 0.021,
bright = 1, phase = 0, rungs = 1.0, offset = 0.03, seed, start = null, spin = 0, t = 0,
minY = 0.06, u = 1}`. Filaments are random walks **on the shell**: every node is projected back
onto the ellipsoid and lifted `offset` above it, and each turn is a Rodrigues rotation of 50–110°
around the local normal, so no stroke leaves the surface (P2). Guard: returns for any radius
≤ 0.2 m (the projection divides by them; a flat wall with `ry = 0` would NaN the whole buffer).

**Cells persist between restrikes and that is the point.** Each filament has its own generator
`gi = mulberry(seed ^ (i+1)·0x9e3779b1)` that fixes the start point, the initial heading, the link
lengths and the zig-zag signs — the cell is a function of the filament's seed. The restrike `rng`
only jitters each node by ±0.04 m **after** the walk, and rebuilds the rungs.

*Measured 03.09 (`docs/vfx-notes/t-surface.mjs`, shell r 1.475 / ry 1.24, n 12, links 6, two restrikes):*
feeding the restrike `rng` back into the walk (flipping a quarter of the zig-zag signs, the first
sketch of the plan) drifted nodes **0.23 m on average and 1.23 m worst case** — a new web every
45 ms. With the walk deterministic and the jitter applied afterwards: **0.038 m mean, 0.092 m
worst**. Zero NaN, zero segment midpoints diving under 0.86 of the shell radius, and the flat
guard writes nothing.

`start` forces every filament to begin at one point (the shield's hit flare). `spin` (rad/s, needs
`t`) turns the initial heading so the lattice rotates without changing its cells.

### `strandSegs(s, rng, put, depth)` — one filament (unchanged)

`{a, b, width, bright=1, jag=0.12, kink=0.36, step=0.32, branches=0, floor, floorY=0.05,
floorTop=0.4, minY, phase, u0=0, u1=1}` — midpoint-displacement polyline, self-similar kink
(30–40° at every level), branches at 20–40°. Used for impact floor rays (`width 0.025, jag 0.28,
branches 2, step 0.26, floorTop 0.5`), `radialArcs`, `crawl`, cone/zone/self/ball/impact strands.

### `bundleSegs(s, rng, put)` — the cage bundle

**`lift(t)` (03.09, A0.2)**: an optional function added to the y of every node at path fraction
`t` — the lob's parabola. `at(t, p, q)` already interpolates y linearly from `a.y` to `b.y`, so
`lift` carries only the arc over that line (`lift(t) = 4·apex·t·(1 − t)`).

`{a, b, n=12, step=0.5, r0=0.03, r1=0.6, cone=0.8, minY=0.08, width=0.03, bright=1, phase=0,
u0, u1, wander=1, turn=0.9, heroes=3, taper=0.6, ramp=0.85, roots=round(0.45·n), subkink=0.35,
bend=0.04, rungs=1.0, stubs=0.5, tangle=1}`

- **Density ramps along the path**: only `roots` filaments (≈ 45 % of `n`) leave the hand; the
  rest branch off a parent's node at 8–55 % of the path and run to the target. On 9 m with n 14:
  6 filaments at the hand, 7 at 30 %, 12 at 60 %. Before this all 15 started at one point and
  the first third was a white rope (gradient inverted, r2 list item 10).
- Cone `R(t) = r0 + (r1−r0)·t^0.8` (beam: r0 0.03, r1 = clamp(0.25+0.04·len, 0.4, 0.62) →
  1.2 m envelope at the far end of 9 m; ~0.6 m at a third). `t^1.35` kept the first third inside
  0.25 m.
- Node law: zigzag around a slowly turning drift in the cross-section; transverse jump
  0.3–0.6·step per step along → 40–60° kinks, **straight links 0.35–0.65 m** (grid `K = L/step`
  with ±30 % jitter). **One sub-kink level**: `subkink` share of links get one mid-point offset
  of 8–18 % of the link length; nothing finer. Wall reflection keeps the walk inside the tube.
- Width `taper + (1−taper)·t`, core brightness `ramp + (1−ramp)·t`; heroes ×1.1 (+0.35·t) and
  bright 1.05, others 0.75–0.95 / 0.92–1.0. A third of the filaments end at 78–98 %.
- `u` for `reach`: hero 0 exact (`ust` 1), others stretched ×1.0–1.3 so filaments end at
  different fractions during emergence.
- `rungs` per step between filaments alive at that step (0.12–1.0 m apart, kinked, width ×0.6);
  `stubs` share of filaments get one 0.3–0.8 m stub outward from the far half; `tangle`:
  `round(n·1.2·tangle)` 3–4-link strands in a sphere `0.8·r1` at the target, bright 1.15.

### `glyphSegs(s, rng, put)` — one floor crackle mark

`{x, z, y=0.05, dot=false, links=3..6, len=1, dir, arc=false, width=0.0055, bright=−1.0, phase, u}`

Links of `(0.03..0.09)·len` m with 45–110° alternating turns → 0.1–0.5 m crumbs at `len`
0.5–1.5; `arc` — 5–7 links of 0.10–0.20·len with 20–50° turns; `dot` — a 0.02–0.05·len dot at
width ×1.4. Coreless, solid (hard profile), heat in `|bright|`. The old 2–4 links of 0.07–0.20 m
read as letter-sized shapes from broadcast (r2 list item 7).

### `crackleSegs(s, rng, put)` — carpet of glyphs along a→b

`{a, b, n=30, spread=1.0, y=0.05, width=0.0055, bright=−1.0, phase, u0, u1}` — `f = rng^0.8`,
lateral `±spread·(0.35+0.65f)`, 40 % dots, 20 % arcs along the axis, scale 0.7–1.5, `u` from `f`.
One-shot carpet for deliveries without per-mark lives.

---

## 3. `common.js` exports

```
orb, halo, restriker, crawl, stormBurst, arcSparks, muzzle, heldLight, radialArcs,
cloud, hotCore, spikes, streakItems, floorRing
```

### `restriker(field, seed, strandsAt, interval = 0.045, flash = 0.035)` → `{ tick(t) }`

Unchanged: `field.write(strandsAt(t, rng), rng)` every `interval·(0.7..1.3)` s (`interval` may
be a function of `t`: beam 0.045 full, 0.07 decaying, 0.11 residue); `tick` returns the flash
1→0 over `flash` s — pass it as `hot`. Call `rs.tick(0)` right after creating it.

### `cloud(vfx, P, {x,y,z, at=0, r0=0.3, r1=1.0, grow=0.2, hold=0.4, life=0.7, squash=1, seed=1, hot=1, dense=1, kind='orb'|'impact', additive})`

Noise-displaced sphere, **both kinds additive** (times are absolute seconds from the cast):

- `orb` (cast orb at the hand): HDR bluish-white centre `(1.25,1.45,1.9)`, **saturated blue
  fresnel rim `1.6·P[2]`** as a separate alpha term (`fres^2.5·0.55`), body alpha `body^1.4·0.8`,
  bloom 0.35. The old normal-blended white 1.15 at alpha 0.6 sat *darker* than the HDR floor —
  a grey balloon. Additive is never darker than the floor and the rim keeps it blue. Beam: `r0
  0.25, r1 0.6, grow 0.07, hold 0.3, life 0.42, dense 1.2` (~1.2 m) plus `hotCore`.
- `impact` (cloud at the target): white `(1.7,1.8,2.0)` centre, **deep-blue edge `1.3·P[2]`**,
  peak alpha 0.85 with `body^2` radial falloff — the victim, tangle and spikes stay readable
  through it (with `body^1.3` it hid the victim at 0.3–0.4 s). Beam: `at 0.10, r0 0.35, r1 1.15,
  grow 0.16, hold 0.34, life 0.55, squash 0.85`.

`additive: true` still selects `impact` (old name).

### `hotCore(vfx, P, {x,y,z, r=0.2, life=0.4, at=0, hold=0.3})` — unchanged

Additive HDR white `(1.5,1.55,1.7)` sphere, bloom 0.7, where the bundle leaves the orb.

### `spikes(vfx, P, {x,y,z, n=40, speed=13, life=0.32, size=0.26, at, r, up=0.55, dir, half=π, side, flat=0, gravity=0, spread=0, blue=true, len=[0.8,1.5], phase=300})` → trajectory list

Builds `n` trajectories (`{x,y,z, vx,vy,vz, gy, born, life, size, len, wk, phase}`), emits the
**white copy** into `vfx.glow` (streak shape, reads on bodies and walls) and, if `blue`, a deep
blue `(0.05,0.25,0.9)→0.7·P[2]` copy into `vfx.body`. The pool's alpha law `(1−u)^1.3` fades a
streak from birth, so on the white floor from broadcast the blue copy was invisible: the beam
passes `blue: false` and draws the blue copies as field segments with `streakItems`. `side:
[ux,uz]` gives streaks perpendicular to an axis with elevation ±`up`.

### `streakItems(list, now, out, {width=0.006})`

For every live trajectory at `now` (`vfx.now` clock) pushes a two-point `{pts}` item: head at
`p + v·age` (y ≥ 0.03), tail `len·min(1, 0.25+f/0.3)` behind along the velocity, `bright =
−env` where `env` is **1 for the first half of the life** then linear to 0 (solid saturated
blue, straight ends), width ×`wk`. Beam: impact spikes 60 (30 on a miss) at 9 m/s, life 0.26,
0.5–1.0 m (15 m/s × 0.32 s put 1.5 m strokes 5 m from the victim, scratches over the whole
arena); side streaks `clamp(12·len, 24, 140)` born over the full phase, elevation ±0.4 rad,
3–7 m/s, gravity −2, 0.5–1.2 m, dots for every third. The spike field is written **every
frame** (`sfield.write(items)` in the spawnMesh callback), not on restrikes.

### `floorRing(vfx, P, {x, z, r0=0.4, r1=3.0, life=0.5, at=0, y=0.07, thick=0.15})`

**One line**: band of fixed width `thick` m (uv width `thick/r`), white HDR core `(3.0,3.2,3.6)`
in the middle ±35 % of the band (≈ 0.05 m, bloom 0.6) with deep-blue `0.7·P[2]` edges to the
band's soft border (≤ 0.05 m each side), alpha 0.92, no interior fill. The 0.3 m band with a
thin white core read from the top as two concentric lines. Holds full alpha for the first half
of `life`, then fades; expands `r0→r1` with easeOutCubic.

### Others (unchanged behaviour)

`orb`, `halo`, `crawl`, `stormBurst`, `arcSparks`, `muzzle`, `heldLight`, `radialArcs` — see the
02.09 notes; all still import and draw (smoke run 03.09: cone, zone, self, bolt, lob at 0.3 s,
zero errors).

---

## 4. Recipes (what the beam does; copy these)

**Bundle at full power** — `{bundle:true, a, b, n, r0:0.03, r1, step:0.5, width:0.025, bright:1,
minY:0.1, phase:0, rungs:0.5+0.8k, stubs:0.2+0.4k, tangle:(hit?1:0.4)·k, bend:0.04}` with
`n = round(nFil·k^0.8)`, `nFil = clamp(round(6+0.9·len), 8, 18)`, `r1 = clamp(0.25+0.04·len,
0.4, 0.62)`. `phase: 0` makes hero 0 the emergence leader.

**Decay by count, not brightness** — `k = 1` until `T.full` (0.9 s), then linear to 0 at
`T.decay` (1.15 s); filaments drop out with `k^0.8`, survivors stay at `bright 1`; alpha only in
the last 15 %.

**Floor crackle marks with individual lives** — `nMark = clamp(65·len, 100, 560)`: 25 % in a
1.5 m disc at the target (`f = 1`), 15 % in a 1.2 m disc at the hand (`f = 0.02`), the rest along
the path with `f = rng^0.9` (near-uniform), lateral `sign(s)·|s|^1.6·0.9` m. Each mark: `born =
0.03 + 0.07f + rng^2.5·0.7`, `life = min(1.1 + 0.85·rng, LIFE−born−0.05)`, `coolAt = max(0.65,
born+0.25)`, `dot` 50 %, `links 3–6`, `len 0.5–1.2`, `dir = axis ± 0.8`, own seed. Per restrike
push `{glyph:true, x, z, y:0.05, dot, links, len, dir: dir+(g()−0.5)·0.6, width:0.0055,
bright: −(0.6+0.4·heat)·envl, phase, u:f, rng:g}` with `heat = 1 − clamp01((t−coolAt)/0.45)`,
`envl` = 8 % in / hold / 15 % out, `g = mulberry(seed ^ imul(floor(t/0.12)+1, …))`. The field's
`cool` uniform ramps only at 1.15→1.4 s (whatever is left goes navy).

**Impact** (at `T.out1` = 0.10 s): `cloud` kind `impact`, `spikes` (white copies, `blue:false`)
+ `streakItems` into the spike field, `floorRing` thick 0.15, 7 floor rays via `strandSegs` for
0.5 s (`env(tr, 0.22, 0.5)`), `arcSparks` 40, `flashLight` 30 for 0.4 s, `screen.shake 0.45`,
`screen.flash 0.05`, `aberration 0.25` (0.6 painted the 0.06–0.12 frames lilac).

**Decal** at `T.decal` = 0.9 s (under the carpet, not before it): `kit.decal({type:'arc', radius:
hit?1.0:0.7, hold:20, tint: BURN, seed})` plus one of radius 0.7 at 50 % of the path when len
> 4 m. `BURN = (0.0, 0.45, 1.5)` HDR: the `arc` decal shader mixes its neutral dark base with
`0.2–0.32·tint` once cooled (2.5 s); with `P[2]` that is steel grey (61,94,136) — soot under
both fighters in every late frame — with the HDR tint (50,122,196). A true dark-blue burn with no
neutral pixels needs `kit.js`.

**Muzzle** — `cloud` kind `orb` + `hotCore` + `flashLight 16` + 18 `kit.sparks` in a cone;
`aberration 0.15` at cast.

---

## 5. Beam timeline = the quality bar (seconds from cast)

```
0.00–0.30  cast orb at the hand (~1.2 m, additive bluish-white, saturated blue rim), hot core; gone by 0.42
0.02–0.10  emergence: bundle grows hand→target via `reach`; filaments end at different fractions
           (u stretch ×1.0–1.3) and fade over their last 18 %, one bright leader point (hero 0)
0.10       impact: additive cloud (peak 0.85, blue edge, victim visible), 60 spikes (white glow
           copies + deep-blue field segments), ring 0.4→3 m / 0.5 s as one thin white line with
           blue edges, 7 floor rays, light, shake, aberration 0.25
0.10–0.90  full power: restrike every 45 ms (×0.7–1.3), flash 35 ms; side streaks ±0.4 rad all along
0.34/0.55  cloud holds / is gone
0.90       decal (blue HDR tint, radius ≤ 1.0)
0.90–1.15  decay by filament count (n ~ k^0.8), restrike every 70 ms
1.15–1.40  cool: whatever is left goes navy (bundle is gone by 1.15)
0.03–2.10  crackle carpet: 100–560 tiny glyphs, lives 1.1–1.95 s, each cooling to navy from
           max(0.65 s, birth + 0.25 s) over 0.45 s; field fade in the last 0.35 s
```

Measured on the final frames (broadcast, column box (740,395)–(850,505)): 0.06 s hot 719 /
deep-blue 1372; 0.12 s 401 / 1175; **0.38 s 314 / 1410**; **0.80 s 581 / 2028** (full power held);
1.5 s 0 / 507 (residue only). Round-2 start (demo-arc) was 671 / 1068 at 0.38 s with the fused
sleeve and 213 / 1288 at 0.8 s with the bundle already thinning. Residue per sixth hand→target
(top camera, band ±70 px): 0.8 s `[795,662,163,370,937,983]`, **1.5 s `[251,315,108,206,312,352]`**
vs `[5,118,96,137,409,318]` at the start of the round; the third sixth sits under the orange
aim ring of the scene, which hides marks from the metric. Emergence from the top in the 0.06
frame (≈ 0.10 s effect time with the capture lag): bolt pixels per tenth
`[307,358,359,421,405,611,782,759,649,329]`, reach 1.00 — the reference spans the full path at
120 ms. The 60 fps clip shows the orb at ~0.02 s, the leader at ~0.04–0.06, the bolt at ~55 %
with a ragged front at ~0.08, full span with the impact flash at 0.12; each restrike redraws the
whole lattice, no dropouts. 60 fps, zero console errors, on all final frames and on the smoke
run of cone/zone/self/bolt/lob.

Known weaknesses after this round: deep-blue in the 0.38 s column is 1400–2000 (the 2000 target
was set on the sleeve; the far half of the bundle still tends to fuse from the side at 4× jacket);
the residue sixth under the aim ring is 108; the `arc` decal keeps a neutral dark base in its
shader (mitigated by the HDR tint, small radius and late placement, not restyled); coreless marks
have no hairline white core (sub-pixel at 26 m); side streaks flying toward the side camera
project as short vertical stubs (geometry, not elevation); the impact rays and orb still take a
slight lilac cast in the 0.12 frame from the remaining aberration.

---

## 6. Capturing and measuring

- Capture only through the lock wrapper:
  `tools/vfxshot-lock.sh --port=8823 --el=arc --kind=beam --cams=broadcast,side --moments=0.06,0.12,0.38,0.8,1.5 --out=<abs>`.
  The tool splits close moments into separate casts (`index.json` → `casts`); still check
  `actual` against `moment` and re-shoot on drift > 0.08 s. Cameras: `broadcast` (26 m along the
  beam — judge here first), `side` (26 m across — bundle shape), `low` (15 m), `top` (residue).
- The fixture casts with `t = 0`, so the bundle shape at a given restrike index is deterministic;
  what varies between captures is whether the frame lands in a restrike flash (`hot`) and the
  25 Hz core flicker — both were narrowed this round so the numbers move by tens, not hundreds.
- The **first presented frame after a cast lags ~0.04–0.06 s** (pooled node materials compile on
  the spawn frame in a fresh page). The 0.06 frame therefore shows the effect at ≈ 0.10 s.
- Metrics: `python3 docs/vfx-notes/metrics.py box <png> 740,395,850,505` (hot, blue60 = judge's
  deep-blue, satPx), `... path <png> 690,270 880,600 70` (top camera, blue marks per sixth
  hand→target), `... extent <png> 690,270 880,600 60` (reach fraction from the top),
  `... crop <png> x0,y0,x1,y1 scale out.png`.
- Motion: `tools/vfxlock.sh node tools/vfxclip.mjs --port=8823 --el=arc --kind=beam --cam=side
  --fps=60 --cw=1600 --out=<abs>` → mp4/webp; `ffmpeg -ss <cast+t> -i <mp4> -frames:v 1 f.png`.
  The screencast delivers ~25 unique frames/s as JPEG — good for timing and restrike checks,
  useless for the pixel metrics (thin lines lose their "hot" pixels to chroma subsampling).
