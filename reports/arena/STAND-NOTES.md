# Arena stand — notes for the port (round 9b, after the AAA review's stand items)

Built against `reports/arena/ARENA-BRIEF.md`, `reports/arena/RENDER-QUALITY.md`
and the binding addendum `reports/arena/ARENA-AAA.md` (primary target
`reports/arena/aaa/a2.jpg`, with `a1.jpg` for the layer beyond the stadium and
`c1.jpg` still the reference for the field itself). Captured by
`tools/arenashot.mjs` at 1440×900 (DPR 1, plus two DPR 2 shots), headless
Chrome with vsync and the frame-rate limit OFF, WebGPU with the WebGL2
fallback exercised twice. Evidence: `reports/arena/stand-*.png` (27 captures
plus six tagged diagnostics) and `reports/arena/stand.json` — **27/27 `ok`,
0 console errors, 0 GPU errors, `all checks passed`**, 33–121 fps.

> **A plain `node tools/arenashot.mjs` reproduces every capture here.** Under
> four agents working the same machine, roughly one page in five failed to
> reach `__arenaReady` inside the tool's 60 s poll and had to be re-shot with
> `--only=…`; every such page came back with an EMPTY `errors` array, so this
> is contention for one GPU, not a fault in the module. If a run reports
> `NOT READY`, re-shoot those ids — do not read the stale PNG under them.

**Round 9b is a measurement round: two blockers, and the instrument that
found them.** The review's two stand blockers — cover with no shape from the
establishing and VS framings, and a planet that read as a hole in its own sky
— are answered in §8.-2, and so is the fault under half of the numbers in
this file: `arena.html`'s GTAO distance fade **had never fired**, because
`TSL.cameraNear`/`cameraFar` inside a post graph are the post quad's camera,
not the scene's. A near-field seating effect was being applied at full
strength to the whole frame, out to the megastructure and the planet. Every
world-point probe now carries the raycast identity of its own pixel
(`hit` / `alpha` / `occluded`), so a probe that fell through onto another
surface, or measured a block the ring rule had ghosted to 0.35, is reported
as a skip instead of failing the world for a value the world never drew.
**`src/viewer/main.js` carries the same broken fade line — see §8.-2's last
paragraph; it is the one thing the port must take from this round.**

**Round 7 put the world in the frame; round 8 gave the world back to the
player.** The review's two blockers on this file were both the same object:
the sixteen banners were painted `--accent` #FF7A5C, so the only saturated
things in a hundred metres carried the OPPONENT's colour, and every beat that
pulled the camera back told the player the room belonged to the enemy —
coral:blue ran 5:1 on the VS card and 50:1 on the win card. ARENA-AAA §2 asks
for coral banners and §1 gives coral to the opponent; §1 is the blocker, so
the cloth moved. What is new:

- **The banner is the world's terracotta, not the foe's coral** (#CDA288,
  L 69.9, Lab C 23.1 at hue 58°, HSV S 0.337). Measured across 97 banner
  probes in 30 captures its saturation never exceeds **0.347** — under the
  0.35 that makes a pixel "a side's mark" in the review's own count and under
  the 0.40 ceiling the world is held to — while `--accent` keeps S 0.64 for
  the opponent alone. dE(banner, accent) = 41.9.
- **It fades, it does not mix.** `bannerMat` is out of the fog and its ALPHA
  carries the distance instead (0.93 → 0.62 across the fog's own near/far).
  One frame used to carry the same cloth at S 0.591, 0.569 and 0.271 — the
  third a pale pink; the sixteen now sit inside **±0.02 S and ±0.5° of hue**
  of each other in a single frame.
- **The sky bodies are bodies.** The planet's lit limb measures L 88.1 at
  S 0.186 against a sky of L 83.8 / S 0.175 — **+4.3 L and +0.011 S over the
  gradient it hangs in** (it was +1.3 L and LESS chromatic), with a 5 L roll
  to its shaded side over a wider terminator. The moon is L 92.3–92.6 against
  an L 89.3 sky (+3.2, under the L 93.5 ceiling), 3° across, with a 7 L limb.
- **The concourse mouths are openings.** A flat L 61.5 rectangle 15.9 L under
  its bank is now L 67.9–73 — **8–10 L under its own riser** — with a 2.5 L
  reveal down its depth and a lit head over it. `stand-game.png` carries
  **zero pixels under L 64 above the coping line**.
- **`aaa` — the frame the directive is measured on.** An eleventh camera at
  DECK HEIGHT looking ACROSS the bowl (`a2.jpg`'s own viewpoint, not `world`'s
  view down into the pit): the ring on all four sides, the cantilever with
  nine whole banners hanging off it, the portal, the far pavilion, the towers
  in haze and BOTH sky bodies in one picture. It did not exist before.
- **A demotion now sheds the world, not just the post.** `setQuality` drops
  the dust and the sun shafts at `medium` and the mist and the two farther
  skylines at `low` — `visible = false` on four single meshes, no rebuild.
  `medium` measures 9.3–11.2 ms (89–107 fps), three times the §2 budget.
- **32 draws became 6.** The bank, the deck, the two portal throats, their
  terraces, their lintels and the sixteen banners are six `InstancedMesh`;
  the shading nodes read `positionWorld`/`normalWorld` and did not move a
  pixel (`tier-tread-z`, `deck-under-z`, `far-gate` identical to round 7's
  probes to 0.1 L).

Round 5's list (the third review) is in §9's tail; the fourth and fifth
reviews' findings that live in `environment.js` / `arena.html` are answered
in §8, the finish review's in §8.0, round 8's in §8.-1, and the AAA review's
stand items — rounds 9 and 9b — in §8.-2.

## 1. Files

| file | what |
|---|---|
| `src/viewer/environment.js` | the module — everything that is not a fighter, a telegraph or an effect; also exports `initialQuality` and `qualityGovernor` (RENDER-QUALITY §7) |
| `src/viewer/arena.html` | the stand page: environment + two stock bodies + two telegraph rings + the post graph; ELEVEN cameras (`aaa` is new — see below), three tiers, the game's MRT under `?glow=1`, the two play rules, the shimmer pair. The AO's numbers come from `RIG.ao` now, not from a second copy in this file |
| `tools/arenashot.mjs` | static server + one headless Chrome under the machine-wide shots lock; 27 captures + `stand.json`, with per-shot checks — the BANNER assertion (every banner of all sixteen projected through all eleven presets: no head off frame, no foot off frame, ≥ 1 whole, and 40 px of sky over every head in the eight cameras the product shows a world in), the BLOCK rule (a lit flank ≥ 6 L under the floor beside it, a shade flank ≥ 8, a cap ≥ 2 over, measured only on blocks the frame actually drew solid), the PLANET rule (core 2–4.5 L under its own sky, face ≥ 6 L, limb ring ≥ 0.8, and no megastructure compositing over the disc) and the WORLD bands (tiers 80–88, deck underside 72–78, sky ≤ 93). Every world-point probe carries `hit`/`alpha`/`occluded` from the page's raycast, and a probe that is occluded, faded or landed on another object is a printed SKIP, never a silent pass |
| `stand-game.png` | **the frame players watch**: `camState` az π/4, dist 30, **height 13.0, aimed 3.5 m over the pair's midpoint** — the ring, the cantilever, five whole banners (coral bbox y 85–600) and ~60 px of sky are all in play framing; rings ghosted over cover when hidden (§4) |
| `stand-aaa.png`, `stand-aaa-medium.png`, `stand-aaa-low.png` | **the frame ARENA-AAA §2 is judged on** (new, round 8): (0, 14.2, 47) → (13, 6, −46) at fov 60 — 0.4 m under the near deck's soffit, pitched 5° down and yawed 8° right. `world` and `vs` both look DOWN into the pit (the pit and plaza take 55–60 % of the frame and the whole stadium is a band across the top third); `a2.jpg`'s eye is at deck height looking ACROSS the bowl, which is what this is. Nine whole banners, no head or foot cut, the planet at x ≈ 1020 and the moon at x ≈ 1250. Shot on all three tiers so the visibility budget (§7) is photographed, not asserted |
| `stand-world.png` | the round-7 AAA judgement frame: (0, 33, 60) → (0, 5, −14) at fov 55, a2's own viewpoint — the full ring, the deck, twelve banners, the gate pavilion, the skyline, the planet, the moon and the field in the lower middle. No game camera uses it |
| `stand-game-jitter.png` | the same frame projected 0.37 px to the right — the shimmer pair (§5) |
| `stand-game-banner.png` | identical to `stand-game.png` now that the banners are a play element; kept so the file set does not change under the lead |
| `stand-game-fade.png` | `?fade=1` on the game camera: near wall + apron + coping + stair at 0.24, block d at 0.35, block d's shadow at 35 % |
| `stand-game-glow.png` | `?glow=1`: the game's MRT (`bloomIntensity`, `distort`, `normal`) with the rings glow-marked — 0 GPU errors |
| `stand-game-medium.png`, `stand-game-low.png` | the fight frame on the two lower tiers, each with its shimmer number |
| `stand-melee.png`, `stand-near.png` | the same azimuth at dist 20 (height 11.2) and dist 13 (8.3) — the clamped melee range |
| `stand-counter.png` | az 3π/4, dist 30 — the one azimuth that looks INTO the key: every visible flank in shade, shadows toward the eye; cube f hides 2 of the gorilla's 3 samples, so the body rule ghosts it to 0.24 and the ring is drawn over the ghost (§4) |
| `stand-far.png` | az 0, dist 34 (height 17.1) — the far end of the orbit; the near wall fades by the rule; block b hides only the orange ring, so the ring rule fades it to 0.35 with the ring over it (§4) |
| `stand-default.png`, `stand-high.png`, `stand-low.png`, `stand-vs.png` | the brief's own comparisons: boot camera **(0, 17, 38) → (0, 4, −6)**; c4's near top-down; the establishing shot, now (−3, 13, 34) → (4.5, 4, −10) at fov 56; the VS card, now (−4, 7.5, 25) → (2.4, 3.2, −2) at fov 46. Both establishing framings swing 7–13° toward +x so the planet lands in the upper-right third (§8) |
| `stand-default-noao.png`, `stand-game-noao.png`, `stand-game-aoonly.png` | the boot and fight frames with `?ao=0` — the exact twins for the AO diff in §8 — and the fight frame's AO term alone (`?ao=2`); `stand-noao.json` / `stand-aoonly.json` carry their probes. All three re-shot against the round-8 code — the round-7 copies still held the OLD banner and a reviewer counting coral across `reports/arena/*.png` would have measured 9,364 saturated pixels on a superseded tree |
| `stand-game-norefl.png` | the fight frame with `?refl=0` — the twin for the floor-reflection diff (§8), `stand-norefl.json` beside it |
| `stand-low-fade.png`, `stand-low-heat.png` | `?fade=1` (block d as well) and sudden death (`?heat=1`) from the establishing camera |
| `stand-default-medium.png`, `stand-default-low.png`, `stand-default-webgl.png`, `stand-default-webgl-fade.png` | the tiers, the WebGL2 fallback, and the alpha-scaled shadow fade on the WebGL2 backend (asserted: block d's umbra lifts ≥ 35 %) |
| `stand-default-dpr2.png`, `stand-default-medium-dpr2.png` | 2880×1800 — the Retina cost (§6) |

## 2. What the module builds

`buildEnvironment(THREE, TSL, { scene, renderer, camera, cfg, half, wallHeight, obstacles, quality = 'high', exposure = 1.0, shadowType = 'vsm' })`

Geometry (gameplay boxes untouched — walls at ±HALF, 0.8 thick, WALL tall; the
six config obstacles to the centimetre):

- **Sunken field.** Floor plane at y = 0 with only the marks: an inset square
  0.1·HALF inside the walls and a 3 m centre cross, 6 cm wide, #C6B39E at
  full strength, drawn in the shader from world position with derivative
  anti-aliasing and a SCREEN-SPACE FLOOR on the half-width (`MARK_PX` 1.6 px:
  `max(0.03 m, 1.6 · fwidth)`), so the core is never under ~3 px — from the
  fight camera a 6 cm line was 1.2 px and MSAA + SMAA averaged the brief's
  #C9B8A7 at 60 % to ΔL 1; ACES also halves any albedo step at L 88, so the
  mark is the darker hex at 100 %: ΔL 3.9 at the cross from game, high,
  default and near, 3.1 on the far run of the square (§8). Pit
  faces = the four collision boxes; the ±z walls are split around the notch
  (one material per wall). **The pit face is split by which way it faces the
  key**, exactly as the block flanks are: `pitSun` #BFB5AA on the −x/+z faces
  and the brief's own #DCCFC0 on the faces the key never reaches. At ONE
  albedo the lit faces rendered 87.6 — the lit floor's own value to a tenth
  of an L, so a 4 m drop was announced by nothing but a 3 L AO smudge at the
  wall foot. One albedo could not do both: taking the lit face down 4 L took
  the shaded one to 72.8, three under `--sand`. Now lit 83.4, shaded 77.7. Only the two walls on the light's side (−x, +z)
  CAST — the other two threw onto the non-receiving plaza and contributed
  nothing but a hairline — and NO pit face receives (§2, shadows). Coping: a
  0.6 m band, 6 cm proud, inner face 1 cm over the pit, one material per wall
  in that wall's `mats` — now UNLIT and pre-toned (`MeshBasicMaterial`,
  #F4EEE8, fog on), neither casting nor receiving: it is the sunken card's
  edge, the lightest line in the frame, the site's `--glass-line` hairline in
  the world; lit, ACES compressed an L 94 albedo onto the plaza's own value and
  the card had no edge. Plaza at y = WALL + 0.02. Notch: 0.2·HALF wide, TWELVE
  treads of 0.333 m (rise 0.335 m; the same 4 m trench at 45°, c4-steep — half
  the footprint on the axis; five treads over that drop were 0.8 m risers no
  person could climb, a model-maker's stair), cast/receive no shadow; stair
  and **the stair is UNLIT** (`MeshBasicNodeMaterial`, still `transparent`
  so it fades with its wall): tread #E6DDD3 (L 88.6) over riser #DED3C8
  (85.1) by `normalWorld.y`. Lit, its treads faced up and its risers faced
  ±z, so on the near wall the riser was a fully shaded vertical face and the
  tread a lit horizontal one: profiled down x = 520 in the game frame the
  notch alternated **L 74.4 ↔ 90.1 on a 6 px pitch — a 16 L stripe, larger
  than the entire separation a fighter has from the floor (7–9 L)**, sitting
  on the fighting axis directly behind the fighters, which is the brief's
  "anything loud behind a fighter: seat striping" by another name. Unlit it
  measures **3.1 L peak-to-peak** (82.0 ↔ 85.1 down x = 724 in `default`) and
  still reads as an opening from every camera. The cut faces beside it stay
  LIT pit faces, so the reveal keeps the wall's own light.
- **Cover.** Six plain boxes, side / top, no edges, no wire — THREE values:
  the side material's `colorNode` picks `blockSideSun` (#C6B5A2) on the faces
  toward the key (−x, +z: `smoothstep(0, 0.3, normalWorld · keyDir)`) and
  `blockSide` (#D8C8B6) on the faces away from it, so `mats` stays
  `[side, top]`: **top 89.6 > floor 88.0 > sun flank 85.1 > shade flank
  76.0**. Plus a **CHAMFER**: the top `EDGE_H` 0.20 m of every flank is
  multiplied by `EDGE_K` 1.38, a lift of the flank's OWN colour, so the line
  is bright on the sun side and modest on the shade side the way a real
  chamfer catches light. c1's blocks all carry one, and without it the
  flank's own gradient (albedo, plus the AO's −2.3 L over its lower half) ran
  from the top face's value at the top to L 80.9 at the foot — a 9 L ramp
  down one flat vertical face whose upper end was TIED to the top it was
  meant to be separated from, so the edge dissolved over the block's upper
  half. Measured: on the shade flank 89.6 → **81.3** → 76.0 (a +5.3 L band
  ~6 px wide); on the sun flank 89.6 → **88.6** → 85.1 (+3.5 L). They cast
  and receive.
- **Plaza.** #FEE9D6 albedo, renders **L 91.3–91.4** (a 1.7, b 5.5) — a step
  lighter than the site's `--sky` #EBE1D9 (ΔE ≈ 1.5), which the value ladder
  needed: at 90.1 the plaza and a block top were 1.4 L apart and a block top
  vanished into the plaza behind it. It is the rung with nothing over it but
  the coping, and the albedo is at the ceiling of what this key can light
  (raw linear red 0.994). To 1.2 km. The 4 m hairline grid is **faded by its
  own filter width** — `cover = min(w / fwidth(d), 1)` on top of the usual
  `smoothstep(w − aa, w + aa)`. Without it the line's core keeps full
  strength however wide `aa` grows, so at a grazing angle a 2.5 cm hairline
  became a metre-wide band at undiminished contrast: profiled down x = 300 in
  the boot frame, L 92.1 ↔ 85.8 on a 14 px pitch — a **6.8 L diagonal moiré**
  across the top-left quadrant, directly under the wordmark, where the
  material intends ≤ 3 L. With the coverage fade that column is flat to 0.3 L
  and the near-field line still dips ~2 L (RENDER-QUALITY §4, "no shimmer on
  the grid"; the review's "a plane of lines nobody can see" is answered the
  other way round — the line now exists exactly where it can be resolved).
  Four apron strips to 0.4·HALF, one per wall, `transparent: true`. Neither
  receives.
- **The stand (ARENA-AAA §2).** A four-sided RING at `RING_AT` = **2.05·HALF
  (41 m)**, segmented on the ±z notch axes. Per side: a bank of **11 steps of
  1.0 × 1.6 m** (11 m of seating over 17.6 m of depth, back line at 58.6 m)
  built from ONE unit-depth extruded staircase scaled along its run, and a
  **cantilevered upper deck** — a 12 m slab from `DECK_IN` 53 to `DECK_OUT`
  65 at y 14.62–16.02, so its leading edge hangs 5.6 m past the bank's own
  top with a 3.6 m gap under it. Round 7 pulled the ring in 4 m (the plaza
  band between the coping and the bank was 24 m of frame with nothing in it)
  and dropped the deck 0.8 m while thickening it 1.0 → 1.4 m: at 1 m the
  fascia was three pixels at 60–80 m, and at the old height the banner heads
  were still 1 % of the frame from the top edge in the `melee` framing.
  The corners are the two crossing staircases' MAX, which is exactly a mitre;
  the ±x pair is lifted 3 cm so the coplanar treads along the diagonal cannot
  z-fight. **Radial aisles** are drawn in the bank's material rather than as
  geometry — a 1.4 m dark slot every 9 m on the tangential world coordinate,
  faded by its own filter width the way the plaza grid is, so 52 slots cost
  nothing and never alias at 110 m on the far side of the ring.
  **THE MITRE (finish-review finding).** The tangential coordinate used to be
  `select(|x| > |z|, z, x)` — ONE choice for the whole ring — so where the two
  crossing banks meet on the diagonal each side drew the OTHER's slots and the
  corner wore a zigzag V nobody designed (plainly visible at 4× contrast in
  round 6's `stand-vs.png`, x 830–1440). The two candidate rhythms are now
  blended across a 5 m ramp on |x| − |z| and both fade to zero within ~10 m of
  the mitre (`smoothstep(RING_AT − 13, RING_AT − 4, min(|x|, |z|))`), so the
  corner carries plain treads — which is what a real bowl does where its two
  straights meet.
  **CONCOURSE MOUTHS** (the vomitories ARENA-AAA asks for "rhythmically along
  the tiers for scale"). A 3.6 m opening every 18 m — every second aisle,
  interleaved with the banners so no two rhythms land on each other — cut
  into the bank between 3.2 m and 6.4 m over the plaza. **An opening, not a
  swatch** (round-8, §8.-1/4+7): a 2.5 L reveal down its depth from
  `C.vomitoryMouth` #C6B8A9 at the sill to `C.vomitory` #BFB1A3 at the soffit
  — a real mouth is brightest where its own floor bounces the light — and a
  0.5 m **lit head** of `C.vomLintel` #E0D4C9 immediately above it, a metre
  wider than the jambs, on the same rhythm so it can never appear where a
  mouth does not. Rendered it lands **L 67.9–73, 8–10 L under its own riser**,
  where the flat #B0A294 fill rendered a single L 61.5 and 15.9 L under it —
  the largest hard-edged dark mass in the top half of every fighting frame,
  and darker than a fighter. The head and the sill are windowed on world
  HEIGHT, not on the radial coordinate: windowed radially a mouth climbed the
  stair with it and printed a dark zigzag. They are painted on the RISERS
  only, so from every camera at seat height they are openings and from
  directly overhead they disappear, as a real vomitory does.
  Each ±z side opens for `GATE_HALF` 6 m either side of the axis: a **5-step
  terrace** across the gap, a **portal** behind it — a box seen from INSIDE
  (`side: BackSide` culls exactly the face the camera looks through: back
  wall, two converging side walls, a soffit), 8.5 m tall — a **2.4 m lintel**
  across its head carrying the deck's fascia value, and the deck running over
  the whole gap. Open to the deck's own height the throat still read as a
  rectangle of some value hung in the ring, i.e. as a screen; under a lit beam
  it is a door in a wall. Inside, three cheap terms: the depth gradient
  (mouth #C6B9A9 → back #B0A294), a fall with height (×1.06 at the floor,
  ×0.88 at the soffit — a real tunnel is brightest where the light bounces),
  and the terrace's top step carried on into the tunnel as a 0.5 m concourse
  line.
  Everything is UNLIT, pre-toned and fogged (`MeshBasicNodeMaterial`), casts
  and receives nothing, is outside `solids` and outside the shadow frustum:
  nothing of the stand can ever come between a camera and a fighter, so
  nothing of it fades. Lit, a riser faces away from the key and comes out
  13 L under its tread — the brief's "seat striping".
  **The values are a step UNDER the sky, and round 7 spends the range the
  addendum opens beyond the field**: tread #DED3C9 (L 85.2) over riser
  #D7CBC0 (82.4), aisle #D1C5BA (80.2), the deck's top #E5DCD2 (88.2), its
  fascia **#DCD2C7 (84.7 — a hard 3.5 L step under the top face, not a
  ramp)**, its underside **#BFB1A0 (72.9)** and a 0.9 m light cove along the
  underside's leading edge at #D5C8B7 (79.6). The band of bank under the
  cantilever runs into the underside value over 6 m (`smoothstep(DECK_IN − 6,
  DECK_IN − 0.5)`): unlit geometry takes no real shadow, and that band IS the
  deck's shadow line — the frame's horizon event and its darkest non-fighter
  value. At a 9 m ramp it swallowed eight of the eleven rows and the whole
  bank measured a median L 73; at 6 m the tiers hold **79.3–85.1** across the
  five judged cameras and the shade is the top third of the bowl, where a2
  puts it. Measured at the roofline: fascia 84.7–86.5 against a sky of
  84.3–85.9, underside 67.8–74.
- **The plaza's low elements** (ARENA-AAA §2, "a few low sculptural elements —
  never taller than 0.5 m within 0.4·HALF of the wall"). Eight 0.42 m plinths
  of the plaza's own plaster on the 20 m band between the apron and the ring,
  1.6 m wide and 2.6–6 m long, laid on the two axes. LIT, so each carries the
  key's two values (top 91, shade flank 79.2); they cast nothing, because the
  plaza is not a shadow receiver (a receiver that size printed its own
  triangulation as a dotted hairline in the VSM map) and a 0.42 m box's 0.55 m
  shadow would have nowhere to land. Nothing is over 0.5 m and nothing stands
  on a fighting axis, so nothing can come between a camera and a fighter: from
  the lowest camera (`vs`, eye 7.5 m) the sight line to a fighter clears the
  coping at 7.3 m.
- **The stand's shadow on the plaza** (finish-review finding: "135 scan rows,
  15 % of frame height, in which over 80 % of the row is L > 90 — a
  featureless white strip … the stand casts nothing onto it"). Every tier,
  deck and gate mesh sets `castShadow = false` — they are outside the key's
  ±30 m frustum, and putting a 16 m ring at 41 m into it would halve the
  texel density over the field — so the shadow is SOLVED instead, in the
  plaza's albedo: walk from the ground point toward the sun and ask at what
  height the ray crosses the wall's plane. Two of the four sides face the key
  (−x and +z), so two 11.8 m bands run inward across the plaza on the
  diagonal, exactly as they do in a2; the other two throw away from the field
  and are never seen. `SHADOW_K` 0.50 of the albedo = **−8 L rendered**
  (plaza 91.0 → 82.9), the same depth the field's own block shadows carry;
  the number is a multiplier on scene-linear light that ACES's shoulder then
  compresses by roughly a power of 0.29 (0.76 measured only −2.4 L). It is
  applied to the albedo, not as a plane over it: it tone-maps like the block
  shadows beside it, it keeps the grid and the seams under it, and it cannot
  touch the AO's normal buffer the way a multiply-blended overlay would.
- **The far pavilion on −z** (a2's gate). Seven pale masses — a 26 × 19 m
  block, two wings and four fins to 26 m — on the fighting axis 20 m behind
  the stand's back line, so their feet are hidden by the deck and only their
  heads stand over the roofline. Unlit, two values split by which way a face
  turns to the key (#D2C6B8 / #BDB0A2), fogged: measured 80.6–85.4 against a
  sky of 84.3–90.6 — a silhouette with a shape, never a building.
- **Megastructure (a1).** THREE open-ended cylinders at 120 m, 260 m and
  430 m, `BackSide`, no depth write, drawn as a silhouette ALPHA over the sky
  at 34 %, 16 % and 9 % — never sharp, never lit, no geometry per tower. The
  skyline is a smooth `mx_noise_float` field around the ring quantised into
  cells of varying width (so towers have vertical edges and no two are the
  same), each cell's height from a second noise, plus one horizontal band at
  0.62 of each tower's own height — the truss a1 hangs between them, and the
  only thing that keeps a skyline from reading as a comb. Tops run 0.17 R to
  0.32 R and the feet sit under the stand's roofline from every camera, so no
  layer shows a base. Round 6 drew two layers of an L 69.9 grey at 15–26 %
  over an L 94.4 sky and measured the band flat to 1.5 L: a silhouette that
  dissolves has to be a VALUE first, so the colour is now #A99C90 (L 65.1)
  and the near layer lands 5–6 L under the sky, the middle 2–3, the far under
  1.5.
- **Banners** — SIXTEEN, 3.0 × 10.1 m, four a side at ±9 and ±27 m off each
  axis (one every 18 m, which is a2's rhythm and the reason its stand reads
  as a stadium and not as a bank of steps), hung at `RING_AT + 1` (42 m) from
  0.3 m under the deck's leading line (y 14.32) down to the bank's first row
  (y 5.02), turned to face the field, `MeshBasicNodeMaterial`, **`fog: true`,
  `opacity: 0.93`** (ARENA-AAA's "slightly translucent": the rows show
  through the cloth as they do in a2), 4 × 10 segments so the sway is a curve.
  **THE HEAD IS THE POINT** (finish-review blocker: "two orange rectangles
  pinned to the bezel"). At 11.3 m hung from `DECK_Y` the head was above the
  play cameras' ceiling in every fight framing; at 10.1 m hung from 0.3 m
  under the deck it projects within a tenth of a degree of the cantilever's
  own leading edge from every camera inside the ring — the banner is nearer
  and lower, and over the eye nearer is higher, so the two cancel — while its
  foot is seated on the bank's first row. Measured coral bounding boxes:
  `default` y 175–593, `game` y 85–600, `default-dpr2` y 350–1187 (175 CSS
  px), `vs` 159, `low` 255, `world` 292, `counter` 86, `far` 112 — the lead's
  40 px rule holds in all of them; only `melee` (dist 20, where the whole
  ring is cut) reads 25 px, and `near` (dist 13) is exempt by the same
  argument. `__arenaBanners()` projects all sixteen (off the group's `userData.placements`, since they are one `InstancedMesh` now) through all eleven presets on
  every capture and `tools/arenashot.mjs` fails the shot if a head or a foot
  leaves the frame, if no banner is whole, or if a head has under 40 px of sky
  in the eight cameras the product shows a world in.
  **THE SWAY.** `update()` ticks one clock (`clockU`) and the cloth leans out
  of its own plane on an 11-second period, 0.22 m at the foot and nothing at
  the head — under a tenth of the banner's width, a hang and not a flag. The
  phase comes from each banner's own world position, so sixteen of them never
  move as one wiper — read from `positionLocal` AFTER three's instance node
  has written the instance matrix into it, not from `modelWorldMatrix`, which
  on an `InstancedMesh` is the one matrix all sixteen share (§8.-1/10).
  Nothing else in the arena moves.
- **Mist, shafts and dust** (ARENA-AAA §2's atmosphere). **Mist**: one
  cylinder at 3.6·HALF (72 m — beyond the deck's outer edge, in front of the
  nearest skyline layer) carrying a band of the horizon's own value, 0.42 at
  the plaza and gone by 9 m; it is what puts the stand's back line, the
  pavilion's feet and the skyline's base into one haze, and it is the only
  thing in the world allowed to LIFT a value. **Sun shafts**: ONE quad, 82 m
  out in the key's own quarter, standing in the vertical plane that contains
  the sun, with three soft bands drawn across it at the sun's own 37° pitch;
  it is behind the whole stand, so the ring occludes it wherever the ring is,
  it is gone below 11 m so it never touches the plaza, and the lift is ≤ 3 L
  over the sky it crosses (a mix toward L 97 at 0.13 — it cannot clip).
  **All three, plus the two farther skyline shells, are what a demotion now
  sheds** (§7's visibility budget): dust and shafts at `medium`, mist and the
  260 m / 430 m skylines at `low`.
  **Dust**: 700 billboarded motes (`SpriteNodeMaterial` on an `InstancedMesh`
  — a `Points` primitive is one pixel on WebGPU whatever the DPR) in a shell
  from 1.3·HALF to 3.9·HALF and 1–15 m over the plaza, never over the field,
  drifting on the same clock, ~2 px at the fight camera at 0.30 opacity, round
  rather than square (the mask is read from `uv`, since on the sprite path
  `positionLocal` IS the mote's centre). WebGPU only: on the WebGL2 fallback
  three's node path put the per-instance data into a VERTEX uniform block and
  the driver rejected it — one shader error per boot on the one backend that
  can least afford it. The whole block is guarded; a backend that cannot build
  it loses the dust and keeps the arena.
- **Planet** **12° across** (was 7.8), 30° right of −z and 5.5° up, 96 × 64
  sphere at 200 m, no depth write, lit by the KEY: `normalWorld · keyDir`
  mixes limb **#D9C6AA (L 80.8, S 0.217)** to face **#EDDBC0 (L 88.2, S 0.190,
  hue 36°)** over `smoothstep(−0.45, 1.15)`, the disc then mixed **0.12** into
  the horizon's haze, rounded by a 5 % view-ray limb darkening and cut off by
  an opacity ramp over the outer ~9 % of the radius so the silhouette has no
  polygon edge.
  **IT IS A BODY IN THE SKY, NOT A HOLE IN IT** (round-8, §8.-1/6). The
  round-7 pair (face L 84.7 / limb 74.0, on a near-neutral hue) rendered its
  lit limb **+1.3 L over the sky beside it and LESS chromatic than it** — a
  grey ball with a hard edge, where a2's planet is +4.8 L and +0.02 S over its
  own sky. The pair is on the SUN's hue now and over its sky, and the
  terminator's ramp widened from (−0.25, 1.05) so the range is spent across
  the whole disc rather than over the visible three quarters of it. The terminator is a chord at 0.71 R (the disc stands 45° off
  the anti-solar direction), so the ramp is spent ACROSS the face and never
  draws a rim. **Its lower limb is behind the stand's roofline** in both
  framings that see it — a planet in front of architecture reads as distance,
  a planet alone in an empty sky reads as a blob. 30° is where no scripted
  camera can centre it: at 26° the VS camera's own 37.6° azimuth put the disc
  at x 590 of 1440, dead centre of the top edge, which is exactly where the
  brief says it must not be. Measured in `low`: the lit limb reads **L 88.1 at
  S 0.186 against a sky of L 83.8 / S 0.175 — +4.3 L and +0.011 S**, and its
  shaded side L 83.1, a 5.0 L roll with no rim anywhere on it.
- **Moon** **3° across at 44° / 10°** (was 2.4° at 12°), 250 m, the same
  shading with its aerial mix at **0.04** rather than 0.10, so the haze stops
  eating the little contrast it has: face **#F6E8D3 (L 92.6)**, limb
  **#E5D3B8 (L 85.4)**. Measured in `low`: **L 92.3–92.6 against an L 89.3
  sky (+3.2)** with its shaded edge at 85.4 — a disc with a limb, where the
  round-7 moon read 1.7 L UNDER its sky. It stops at +3.2 rather than the
  review's +4 because the brief's ceiling is the coping's L 94.4 and the sky
  at its own elevation is already 89.3: a decorative object does not get the
  top of the world's value ladder (ARENA-AAA §2).
- **Sky dome** 300 m, `fog: false`, no depth: **#F2E8D8 zenith (L 92.4,
  chroma 9.0)**, **`skyHorizon` #E2D0B4 (L 84.3, chroma 16.3)** at the
  horizon, #D8C3AC below; a BAND of the horizon value holds the first ~2°
  (`SKY_BAND` 0.035), then the gradient reaches the zenith by 16° of
  elevation — an **8.1 L ramp**. **THE SKY CARRIES A HUE** (finish-review
  finding: "all nine captures measured a chroma median of 7.2 against the
  target's 31.6 … the world reads as a grey model of itself"; `stand-low-heat`
  already proved the same geometry reads as a PLACE the moment the sky has a
  colour). The ramp is a2's own — a warm cream overhead to an amber horizon —
  at about a tenth of its saturation, and the coral is still the only thing
  in the frame past chroma 20. Nothing clips: the zenith is 2 L under the
  coping's 94.4, which the brief makes the frame's ceiling.
  **THE HORIZON IS STILL NOT THE FOG COLOUR.** With one hex for fog,
  background and dome the ground plane evaporated: in the establishing frame
  the fogged plaza read 2.1 L BRIGHTER than the sky it met, so the eye could
  not find the ground. `skyHorizon` sits **2.7 L UNDER** the haze the ground
  fogs to — the order every reference keeps, the sky brightest overhead and
  darkest at the horizon, the ground the other way round — and it is what
  puts the roofline 3.9 L OVER the sky it cuts. The sudden-death tint rides
  on it (`stand-low-heat.png`).
- **Fog / background** **#E7D8C2 (L 87.0, chroma 12.8)** — 4.3 L UNDER the
  near plaza's 91.3 and 5.4 under the zenith, so the ground has a far edge:
  the plaza runs down into the haze and the sky lifts out of it. (At the
  round-5 #EDE4DB, L 91.1, plaza, fog and horizon were one value from the
  coping to the top of the frame and the field was a card in a void.)
  **`THREE.Fog(80, 260)`** — the fog starts BEYOND the stand's front row
  rather than inside it. At 56/140 the ring was 25–50 % dissolved before it
  began and its deck line — the frame's only horizon event — measured 2 L
  against the sky; `fogFar` went 220 → 260 this round on the finish review's
  note that the far tiers wash out at the establishing range. The field
  itself (≤ 60 m from every camera) is 0 % fogged, the ring 0–5 %, and the
  megastructure band beyond 120 m still dissolves to 1–6 L. Under sudden
  death the fog goes to 45 → 260 m (`RIG.burnFogNear/Far`) and its colour to
  #D8A88E (L 73), so the plaza warms into the ember over the whole depth
  instead of stopping at a belt and the field stays ≤ 12 % fogged.
- **Grain.** Every lit solid (floor, pit, blocks, plaza, stair) multiplies its
  albedo by a ±2 % two-octave `mx_noise_float` at 1.7 m and 0.4 m, and its
  roughness by ±0.04 at 0.4 m: a matte plaster is honest because it is not
  perfect (c4, r3 both carry it). Nothing finer — a 2 cm octave would sit at
  the pixel frequency from the fight camera and crawl. Probes move < 0.3 L.

**Palette.** Lit albedos at chroma × 1.4 where the surface is seen lit
(block top #EEDECC, plaza #F0DED2 — tilted a step red with the key, see the
rig, mark #C6B39E, grid #E0CFBD); the surfaces
seen mostly in SHADE at × 1.0–1.15, because ACES compresses chroma at L 90 on
a lit face and not at L 75 on a shaded one, and at × 1.4 every shade in the
frame gained 4 b over the ground it stood on — tan beside the chrome's greige,
the one amber in the picture: pit #DCCFC0 (the brief's hex), block side
#D8C8B6 (× 1.1), floor #DACBBA (× 1.15, and 3.7 L darker than before, so the
field sits a readable step under the plaza and the block tops, as c1/r3 make
it). Unlit colours (dome, fog, coping, the notch stair, the whole stand,
the banners, the planet, the moon, the megastructure, the telegraph rings) are
pre-inverted through `preTone()` and land on their hex.

**Lighting rig** (`RIG`):

- Key #FFE3D0 × 4.0 from (−0.57, 0.60, 0.57), 37° up, 90° to the left of
  `main.js`'s `CAM_ANCHOR` — the only warm light in the rig. Not the brief's
  #FFF2E2 (Lab hue 79°): the key is three quarters of the light a lit
  surface takes, so its hue is the lit ground's hue, and under the yellow
  key the plaza rendered at hue 76° (a 0.9, b 3.8) beside the site's `--sky`
  #EBE1D9 at 68° (a 2.0, b 5.1) — putty under the wordmark's greige. ACES
  compresses chroma ~4× at L 90, so the key had to move ~5 units in a for
  one in the picture; #FFE3D0 (a 6.7, b 12.8, hue 63°) was calibrated on the
  stand (`?key=`, `?plaza=`) with the plaza albedo at #F0DED2: plaza
  #EBE1D9 exactly (a 1.8, b 5.0), floor #E5DBCF (target #E6DBCF; a 1.6,
  b 7.2), and every shade the key never reaches unchanged (umbra b 9.0,
  shade flank #C6B6A4, pit face in shade 76.9).
- Fill `HemisphereLight` #EEECEA / #F7F2ED × 0.64 — a shade COOLER than the
  key, never warmer (it was #F4EEE8 / #FFFAF4 under a #FFF2E2 sun, and shade
  more orange than sunlight is the tell of a clay render). The ground term is
  what a vertical face in shade lives on; the sky term is the only fill an
  up-facing floor in shadow gets.
- Image-based light: PMREM of the same sky, `scene.environmentIntensity`
  0.40, arena materials at `envMapIntensity` 0.66, bodies at 1.0; the gain is
  (1.62, 1.58, 1.52) — the same level as before (mean 1.57), R/B 1.04 instead
  of 1.17. The warm grade lives in the key alone, where lit surfaces show it.
- **Shadows: VSM**, map 2048 (1024 on `low`), ortho **±30 m** — the √2 rule:
  the key's azimuth is exactly 45°, so the field's half-extent along the
  shadow camera's x-axis is 20·√2 = 28.3 m and a wall corner's 29.4 m; at ±24
  the two diagonal corners fell outside the map and three's `frustumTest`
  rendered them lit (a diagonal cut through the +z wall's shadow in the
  top-down frame — `high` row y=870 now reads L 82.6–83.6 continuously to the
  +x wall's foot). 34 texels/m at 2048; blur `shadowSoft` 0.2 m either side of
  the edge in texels of the tier's map (6.8 at 2048, 3.4 at 1024: the same
  penumbra on every tier); 16 samples; `shadow.intensity` 0.89.
  **Bias −0.0007 (≈ 0.09 m of light depth) and normalBias 1.7 texels (0.05 m
  at 2048, 0.10 m at 1024)**, and **no pit face receives**: under VSM three
  draws every receiver into the moments map, so at a lit face's foot the
  floor's blur kernel held the face's depth and the face's the floor's, and
  Chebyshev printed a dotted hairline (the moments map's texel pattern) along
  the foot of every lit wall and a sawtooth at every block foot. The biases
  lift a receiver out of its own blurred footprint (a block's lit foot needs
  ~0.12 m: the kernel there is half block, half floor); the pit faces are
  simply out of the map (lost: a fighter's shadow on a wall it hugs, which
  the two shaded faces never showed anyway). Measured: the far-wall foot
  column in `default-medium` (no AO) is flat at 88.1–88.5 (was a 2-px dip to
  81); the +x crease row is flat (was −8 L); a block's lit foot in `near` is a
  straight edge; the whole-shadow shift is ~0.15 m at a shadow's far edge,
  under the 0.4 m penumbra, and no umbra detaches at a foot (`high` crop: the
  cube's shadow starts at its shaded foot).
- **Faded BLOCKS cast faded shadows** (`castShadowNode` = the material's own
  `reference('opacity')`, shadow material at `NoBlending`); the four WALLS
  cast a full shadow whatever their fade (`pitMat.castShadowNode =
  vec4(0, 0, 0, 1)`): the −x and +z walls' shadows overlap at the field's
  −x/+z corner, and when the near wall ghosted to 0.24 its alpha-scaled
  caster, written over the −x wall's under NoBlending, replaced a full
  occlusion with 24 % — a lit sawtooth wedge in the corner umbra and a
  dotted run along the ghosted wall's shadow edge in default / default-low /
  default-webgl. Which wall must win depends on which one fades, so no alpha
  in the map for walls at all; a retaining wall one looks through still
  stands in the sun (the bottom band of `default` shows the near wall's
  3.75 m shadow at full under the 0.24 coping — identical with `?wallrule=0`,
  diff 0.00 over the strip). The coping, unlit, casts nothing and only fades.
- The shadow camera carries layer 31 (the reflector's virtual camera sees only
  REFLECT_LAYER). `update(dt)` makes exactly one shadow refresh per frame.

**Floor reflection** (`high`, WebGPU, needs `camera`): `TSL.reflector` of
the BODIES only, 0.35 of the frame, mipmapped, sampled **1.2** mips down (was
3.5). The floor takes `max(min(mirror − background, 0) × k, −0.40)`: zero on
open floor, negative under a body, and `k = 0.32 · smoothstep(4, 12,
camera.y) · (1 − 0.7·heat)`, updated in `update()`. **Committed, not
hinted**: at blur 3.5 / cap 0.25 the term measured −2 to −3 L under a body's
feet — a brownish smudge that read as dirt on the plaster, a `high`-tier pass
(a 0.35-scale render and a WeakMap'd virtual camera per frame) spent on
something no reviewer could see. Measured against its exact twin
(`?refl=0`, `stand-game-norefl.png`): **−5 to −6 L directly under a body's
feet on lit floor, 0.00 on open floor and 0.00 on the far plaza**, gone within
about a body-width and deeper where it stacks with the body's own shadow.
The ramp starts at 4 m so the establishing and VS cameras get a share too
(0.41 of it at 7.5 m). RENDER-QUALITY §3 asks for it and the
founder's own reference carries much of its midtone mass in it; the brief's
"no reflections on the floor" is about a mirror, and this cannot print a
limb.

## 3. API

```js
const env = buildEnvironment(THREE, TSL, { scene, renderer, camera, cfg,
  half: HALF, wallHeight: cfg.arena.wallHeight, obstacles: cfg.arena.obstacles,
  quality: 'high', exposure: 1.0 });           // shadowType: 'vsm' | 'pcf' | 'pcfsoft'

env.solids      // [{ x, z, hx, hz, h, mats:[…], fade:1, want:1 }] — the SOLIDS shape
env.floorMat    // MeshStandardNodeMaterial; `.color` is what sudden death lerps
env.key, env.hemi, env.sky, env.banner (a GROUP holding ONE InstancedMesh of sixteen banners;
                                        .userData.placements / .size for a projection probe), env.planet, env.group
env.reflector   // the ReflectorNode on `high`, else null
env.update(dt, t)          // ONCE PER FRAME, before the render (one shadow refresh; reflection level and height ramp)
env.setQuality('high'|'medium'|'low')  // reflector on/off (disposed when off), shadow map 2048/1024,
                                       // AND the world's visibility budget: dust + sun shafts off at
                                       // 'medium', mist + the 260/430 m skylines off at 'low' (§7)
env.applySuddenDeath(heat) // 0..1: floor → #EFC4A3, fog/background → #D8A88E, fog 70/210 → 40/250, sky/planet/moon/megastructure tinted, reflection × (1 − 0.7·heat)
env.dispose()              // floorMat.emissiveNode cleared, reflector and shadow map disposed, scene state AND renderer.shadowMap.type restored

initialQuality({ isWebGL, width, height })   // 'low' on WebGL2; 'medium' over 2.6 MP; else 'high'
qualityGovernor({ tier, onChange, window: 120, warmup: 40, holdSeconds: 2, demote: { medium: 45, low: 30 } })
  // .tick(dt) each frame; only ever demotes; .hold()/.release() defer a change to a match boundary;
  // .msPerFrame / .fps for window.airena.stats()
```

`solids` has ten entries: four walls (`mats = [pitFace, apronStrip, coping]`,
the ±z walls also `stair, cutFaces`) then six blocks (`mats = [side, top]`),
all `transparent: true`, so `main.js`'s `updateOcclusion` (`o.fade`, `o.want`,
`m.opacity = o.fade`) works unchanged and takes the shadows with it.

Also exported: `ARENA_COLOURS`, `RIG`, `REFLECT_LAYER`, `preTone`,
`acesForward`, `labL`, `srgbToLin`, `linToSrgb`.

## 4. What the port replaces in `src/viewer/main.js`

The line numbers are those of the reviewed main.js; the three slice regions
`tools/checkframing.mjs` evaluates in Node WITHOUT `env` are the scene slice
(69–136), `const SOLIDS = [];` → `function segSolid(` (1257–1481, which
contains `loadBody`), and the camera slice `const camModes` → `function
poseAction` (3926–4572) plus the `frame()` slice (4794–4829). Nothing that
names `env` or `REFLECT_LAYER` may land inside them.

| lines | today | port |
|---|---|---|
| 116–125 | `HAZE`, `HAZE_BURN`, `GROUND`, `GROUND_BURN`, `scene.background`, `scene.fog` | delete the ten lines whole (the scene slice must carry no dangling names); the module sets background + fog |
| 146+ | after `renderer.init()` | `const ENV_EXPOSURE = 1.0; let tier = initialQuality({ isWebGL, width, height })` (drawing-buffer size) and `const env = buildEnvironment(THREE, TSL, { …, exposure: ENV_EXPOSURE, quality: tier })` — after `init()` (PMREM), never inside 69–136, before the post graph |
| 150–151 | `renderer.shadowMap.enabled/type = PCFSoftShadowMap` | keep; change the comment to "overwritten by buildEnvironment (VSM); dispose() restores it" |
| 163 (`toneMappingExposure` 0.90), 310 (`postU.exposure` 0.94) | | **`ENV_EXPOSURE` in both**, then `if (postU.exposure.value !== ENV_EXPOSURE) throw new Error('exposure drift')` once after the graph builds — at 0.94 every pre-toned colour (banner, coping, haze, planet, rings) lands ~6 % under its hex and the fog drops below the plaza |
| 213–216 | the DOM vignette element and its rule | **delete** — the vignette is a wash in the post graph (§5); a darkening under the HUD's own wash cancelled at the top and bottom and survived at the flanks as a bow-tie |
| 313, 363–366 | `vignette: TSL.uniform(0.38)`, `hdr` with the bloom add | `vignette: TSL.uniform(0.4)`; `const aoF = wantAO ? TSL.mix(aoTex.r, TSL.float(1), glow) : TSL.float(1); const lit = colour.mul(aoF); const bloomPass = bloom(colour.mul(glow), 0.9, 0.85, 0); const hdr = lit.add(bloomPass.rgb.mul(postU.bloom));` — AO on the lit colour BEFORE the bloom add, so the VFX glow under a body is not darkened by the floor's contact AO; then the wash (§5) after the tone map: `const vigC = uvN.sub(vec2(0.5, 0.46)); const wash = smoothstep(0.25, 1.35, vigC.dot(vigC).mul(2.4)).mul(postU.vignette); graded = mix(mapped.rgb, vec3(srgbToLin(0xF4/255), srgbToLin(0xEE/255), srgbToLin(0xE8/255)), wash)`; `centred` stays (0.5, 0.5) for aberration/distortion; after `renderOutput` the ±0.5/255 hash dither, then `smaa(srgb)` (`fxaa` on low) |
| 324 | `TSL.pass(scene, camera)` | `mrtSpec.normal = TSL.normalView` only when `tier === 'high' && !isWebGL` (a 4th RGBA16F attachment is exactly WebGPU's 32 B/sample default; never a 5th); `aoTex = denoise(ao(depth, normal, camera).getTextureNode(), depth, normal, camera)` with **radius 1.5, scale 1.6, thickness 1.5, distanceExponent 1.0**, 16 samples, `resolutionScale = 0.5`, denoise radius 5; then `const viewDist = perspectiveDepthToViewZ(depth.sample(uv).r, cameraNear, cameraFar).negate(); aoF = mix(aoTex.r.max(0.8), 1, smoothstep(52, 68, viewDist))` — a FLOOR of 0.8 (−20 % linear ≈ −6.5 L at L 88, so no crease falls through the brief's umbra). Round 6 widened radius 1.2 → 1.5 and flattened distanceExponent 1.5 → 1.0: at the tighter pair a foot's contact band was 8–16 px at 30 m and one of the two bodies did not seat on its near side at all (0.0 L under the blue creature). **The `wing+x` MRT override is GONE with the wings** — `env.group.getObjectByName('wing+x')` now returns undefined, so `main.js:521` is a silent no-op and should be deleted; the stand's bank and deck write depth and take the AO normally |
| 323 | `await import(BloomNode)` | one `Promise.all` for bloom, smaa/fxaa and (on `high`) ao + denoise, so the fetches overlap; `tools/checkboot.mjs` `resolveRef`: `if (clean.startsWith('three/addons/')) return join(ROOT, 'node_modules/three/examples/jsm', clean.slice(13))` so those modules are on the path it weighs (first frame: high 5.2–5.5 s, medium 3.1–3.4 s, low 3.1 s here) |
| 434–480, 587–659, 682–733, 757–812, 860–878, 939–1088, 1142–1242 | sky, the four lights, floor, apron, grid, wall loop, block loop | delete (see the SOLIDS note below); `const floorMat = env.floorMat` |
| 1882 | `scene.add(root)` for live bodies | `for (const root of live) if (root.parent !== scene) { root.traverse((o) => o.layers.enable(REFLECT_LAYER)); scene.add(root); }` — OUTSIDE every slice (inside `loadBody` it would be a ReferenceError under checkframing; or write the literal `o.layers.enable(1 /* REFLECT_LAYER */)` in loadBody's own traverse at 1420) |
| 1924 `COLOR`, 2526–2692, 2585, 2807, 2865 | raw hexes | `COLOR = { blue: 0x6EA8FF, orange: 0xFF7A5C }`; every THREE.Color built from it via `const c = preTone(COLOR[id], ENV_EXPOSURE); new THREE.Color(c.r, c.g, c.b)`; the DOM uses of `COLOR[..].toString(16)` (2416, 3311–3414, 3677) stay raw |
| 2172 `updateOcclusion`, after `o.want = 1` | | **the wall rule** (brief §2): for `SOLIDS[0..3]`, `d` = the eye's distance outside that wall's outer face (`eye.z − (HALF + 0.8)` for +z, `−eye.z − (HALF + 0.8)` for −z, likewise x); `if (eye.y > WALL && d > 0 && WALL * d / (eye.y − WALL) − 0.8 >= 1.5) o.want = FADE_TO` — the wall hides ≥ 1.5 m of floor; the 14/3.5 easing smooths it. Presets: default hides 1.6 m → fades, low 4.8, far 2.8; game −0.1 → no; high −0.5 → no; melee/near/counter/vs → no. `arena.html` has the same test (`wallHidesField`) |
| 2189 | `gh.ringMat.opacity = GHOST_RING * gh.on` | **the ring rule**: for each `SOLIDS[i]` with `o.fade > 0.6 && segSolid(camera.position, v.x, 0.05, v.z, o)`: `if (i >= 4) o.want = Math.min(o.want, 0.35)` (brief §2: a block between camera and fighter fades to 35 % — never a ring painted on a solid block's top, which read as the fighter standing on the block) and `ringHidden = true`; ease `ringOn` toward it at the same 16/5 rates; `gh.ringMat.opacity = GHOST_RING * Math.max(gh.on, ringOn)` — the ghost ring (depthTest off) is what shows the ring over a ghosted block, since blocks write depth; the body lozenge stays on the 3-sample rule. `arena.html ?ghost=1` does the same, and the stand now also runs the 3-sample body rule (`SAMPLE_HEIGHTS`, ≥ 2 hits → FADE_TO) so every capture is the game's state: `far` (block b hides only the ring → 0.35 + ghost ring), `low` (block b hides 3 of 3 → 0.24 + ghost), `counter` (cube f 2 of 3 → 0.24 + ghost) |
| 2801, before `const GHOST_BODY` | | bind the materials: `env.solids.forEach((s, i) => { if (s.x !== SOLIDS[i].x \|\| s.z !== SOLIDS[i].z \|\| s.hx !== SOLIDS[i].hx) throw new Error('solid ' + i + ' moved'); SOLIDS[i].mats = s.mats; })` |
| 4950, after `updateOcclusion(view, dt);` | | **DELETE the banner rule.** `env.banner` is now a Group holding ONE `InstancedMesh` of sixteen banners hung from the deck ring at ±9 and ±27 m off each axis: none stands on a fighting axis, none can float (its foot is seated on the bank's first row) and none is ever cut with its foot off the frame — the three reasons the rule existed. Leaving `env.banner.visible = …` in place still works (it takes all sixteen at once) but it switches the world's warm accent off for every frame a player sees, which the fifth review named as a blocker. Since round 8 the cloth is a terracotta well outside the opponent's hue and chroma, so there is no ownership argument for hiding it either |
| between 5066 (`if (covered && !pendingShot) { bootLanded(); return; }`) and 5068 (`drawHitFlash()`) | | `env.update(dt); gov.tick(dt);` with the loop's own `dt` (4796). Verified safe with the hit-flash double render: `hitMat` is an unlit override, so no ShadowNode update runs in that pass |
| 4973–4978 | `floorMat.color.lerpColors(...)`, fog/background/sky burn | `env.applySuddenDeath(heat)` |
| 2283 `window.airena.stats()` | | add `msPerFrame: gov.msPerFrame, tier` so `tools/shots.mjs` captures carry the cost |
| quality | | `const gov = qualityGovernor({ tier, onChange: (q) => { env.setQuality(q); rebuildPost(q); } })` — `rebuildPost` disposes the old `PostProcessing` and builds the graph without `normal`/GTAO/denoise on `medium`, with `fxaa` on `low`; `gov.hold()` while a match is under way and < 5 s from its end, `gov.release()` at the boundary (else accept one hitch); it never promotes within a match |

**SOLIDS and `tools/checkframing.mjs`.** Keep the `const SOLIDS = [];` anchor
and the slice data-only:

```js
const SOLIDS = [];
for (const [x, z, sx, sz] of [[0, HALF + 0.4, HALF * 2 + 1.6, 0.8], [0, -HALF - 0.4, HALF * 2 + 1.6, 0.8], [HALF + 0.4, 0, 0.8, HALF * 2 + 1.6], [-HALF - 0.4, 0, 0.8, HALF * 2 + 1.6]])
  SOLIDS.push({ x, z, hx: sx / 2, hz: sz / 2, h: cfg.arena.wallHeight, mats: [], fade: 1, want: 1 });
for (const o of cfg.arena.obstacles) SOLIDS.push({ x: o.x, z: o.z, hx: o.hx, hz: o.hz, h: o.h, mats: [], fade: 1, want: 1 });
```

The module builds walls in the same order (+z, −z, +x, −x) then the config
blocks. Run `node tools/checkframing.mjs` after the port. `tools/shots.mjs`:
add the `?fade=1`-equivalent live state so the WebGL2 alpha-scaled fade is
photographed there as `stand-default-webgl-fade.png` is here.

## 5. The post graph (as the stand runs it)

```
pass(scene, camera, { samples: 4 })           MSAA 4× MRT: output + normalView (+ bloomIntensity, distort under ?glow=1)
  → ao(depth, normal, camera)                 GTAO radius 1.5, scale 1.6, thickness 1.5, distanceExponent 1.0, 16 samples, at 0.5 resolution
  → denoise(ao, depth, normal, camera)        radius 5
  → aoF = mix(max(ao, 0.8), 1, smoothstep(52, 68, viewDist))   a floor of 0.8 and a fade over 52–68 m of view depth
  → hdr = colour.rgb × mix(aoF, 1, glow)      the telegraphs are exempt
  → toneMapping(ACES, exposure 1.0, hdr)
  → mix(mapped, --sky-2, wash)                the WASH vignette: 0 inside a third of the frame, 0.4 at the far corner
  → renderOutput(vec4(rgb, 1))                sRGB
  → + hash(px) dither, ±0.5/255
  → smaa(...)                                  (fxaa on `low`)
```

**The wash.** The built HUD (hud.css `#hud::before/::after`) dims the top
440 px and the bottom 380 px by washing toward rgba(244,238,232) at .84/.9,
and c1's edges go lighter into haze. Stacked with a darkening vignette the top
and bottom cancelled and the flanks kept the darkening — a bow-tie nothing
else on the site has, with the frame's darkest non-fighter ink along the nav
rail's column. Now the corners go the way the HUD goes: a plaza corner reads
L 92 (+1 over the plaza), a shaded pit face at the frame's edge ≥ L 79 (was
66), the centre is untouched, and a fighter at the edge stands on a lighter
ground. No DOM vignette.

**The shimmer pair.** `?jitter=0.37` projects the frame 0.37 px to the right
(`camera.setViewOffset`); `window.__arenaJitter(px)` renders two consecutive
frames, unjittered and jittered, reads both back inside the frame and reports
the mean |Δ| in 8-bit codes over the plaza with its hairlines (u 0.70–1.0,
v 0–0.14) and the open floor (u 0.42–0.70, v 0.78–0.95) — regions with no
body, because the bodies breathe with `t`. A 3 px diagnostic confirmed the
offset shifts the image (a shift search between the pair minimises at +3 px).
Measured: **0.02 mean, 0.3 p99** on high, medium and low alike — a third of a
pixel moves the grid by a third of its own contrast, nothing crawls.

## 6. Cost, measured with vsync and the frame-rate limit off (M2 Pro, headless)

> **Round 8's run was taken with three other agents on the same machine**, so
> every number below is 2–8 ms slower than round 7's on the same code paths
> (high was 11.5–12.2 ms then, 14.1–20.2 now). Read the RATIOS between the
> tiers, not the absolutes, and re-measure on a quiet machine before treating
> any of them as a budget.

| capture | ms/frame | fps | notes |
|---|---|---|---|
| high, 1440×900 | 14.1–20.2 | 47–74 | 17 cameras; CPU-bound (post + bodies-only reflector). The two slowest are `low-heat` (sudden death, the fog stretched to 260 m) and `aaa` (the deck-height frame: the widest lens and the most of the ring on screen) |
| medium, 1440×900 | 9.3–11.2 | 89–107 | no AO, no reflector, **no dust, no sun shafts** |
| low, 1440×900 | 8.5–10.8 | 93–116 | FXAA, 1024 map, **no mist, one skyline instead of three** |
| WebGL2 (low), 1440×900 | 12.5–13.6 | 69–76 | VSM works on the WebGL2 backend; the alpha-scaled fade too (asserted) |
| high, 2880×1800 (DPR 2) | 23.1 | 42 | |
| medium, 2880×1800 | 13.5 | 74 | |

First frame: 4.1–9.2 s across all 27 (the same contention). The grain (two 3D
noise evaluations per lit fragment) is inside the noise of these numbers.

**Draw calls.** The ring is six `InstancedMesh` (bank ×6, deck ×4, throat ×2,
terrace ×2, lintel ×2, banner ×16 = 32 objects) rather than thirty-two
`Mesh`, all still `frustumCulled = false` because the wide framings see most
of the ring anyway and the CPU cost of culling four boxes is not worth the
branch. ARENA-AAA §2 asks for instanced tiers/deck/towers by name; the towers
were already better than instanced (three open cylinders with the skyline in
the shader — no geometry per tower).

## 7. Quality tiers

| tier | shadow map | filter | MSAA | AO | reflection | world layer | AA | backend |
|---|---|---|---|---|---|---|---|---|
| high | 2048 | VSM ±6.8 texels (0.2 m) | 4× | GTAO r 1.5 s 1.6 @0.5 + denoise r 5, floor 0.8, fade 48–62 m | bodies only, 0.35 res, mip 2.4, ×0.22 by camera height, cap 0.22 (≈ 4 L) | everything | SMAA | WebGPU |
| medium | 2048 | VSM ±6.8 | 4× | — | — | **no dust, no sun shafts** | SMAA | WebGPU |
| low | 1024 | VSM ±3.4 (same 0.2 m) | — | — | — | **also no mist; only the 120 m skyline** | FXAA | WebGPU or WebGL2 (forced on WebGL2) |

**The visibility budget (round 8).** `setQuality` used to do exactly two
things — `configureShadow(q)` and the floor reflector — so a demotion taken
because the frame was too expensive bought AO, a reflection and a smaller map
and NOTHING of the AAA layer ARENA-AAA §2 had just added: the 700-mote dust,
the sun-shaft quad, the mist cylinder and three 96-segment megastructure
shells were built once and drawn identically at every tier. They are four
single meshes tracked in `shed`, so the budget is `mesh.visible = false` per
tier — no rebuild, no dispose, nothing to pay back when the governor changes
its mind. `stand-aaa.png` / `-medium` / `-low` photograph the three states
side by side: at `low` the world still holds (the ring, the planet, the moon,
the nearest skyline and the far pavilion are all there) and loses only its
atmosphere, which is the right thing to lose first.

`initialQuality` picks the tier (WebGL2 → low; > 2.6 MP → medium); the
`qualityGovernor` demotes on measured fps (< 45 for 2 s → medium, < 30 →
low) and never promotes; `?auto=1` ticks it on the stand. All three tiers
render the same grade.

## 8.-2 Round 9 + 9b — the AAA review's stand items, item by item

Numbers from `reports/arena/stand.json` (27/27 `ok`, 0 console errors, 0 GPU
errors, `all checks passed`) and from region reads on the PNGs beside it.
Round 9 and round 9b are one pass over the same seven items; where round 9's
first answer measured wrong, round 9b says so and gives the second.

### The instrument first: a probe now says WHAT IT HIT

Three rounds of "the sun flank is 3.9 L under the floor" were not a shading
fault at all. A probe is a world point projected to a pixel and read back, so
a point the camera cannot see reports whatever stands in front of it, and a
point on a block the ring rule has faded reports a blend of the block and the
floor behind it. Both were happening on the exact three cameras the review
measured:

- On `vs` the `block-b-sunx` point fell behind a cap and read **90.8** — a
  block TOP reported as a "sun flank".
- On `default`, `vs`, `aaa` and `low` block b is **ghosted to 0.24–0.35** by
  the ring rule (`stats.blockFade`), because a telegraph ring passes behind
  it. Its faces were being measured through 65–76 % of the floor: 84.1
  instead of the 80.3 the block actually paints.

`runProbe` in `arena.html` now raycasts the scene along each world-point
probe's own pixel and reports `hit` (the first surface's name), `alpha` (that
surface's opacity after the play rules) and `occluded` (the first hit is more
than 5 cm nearer than the point asked for). Frame points (`u`, `v`) get the
same treatment, where `hit: null` is the answer "nothing along this pixel but
the dome" — which is how a sky probe proves it sampled sky and not a
roofline. `stats.blockFade` publishes the six blocks' opacities and
`stats.skyOrder` the render order of both sky bodies and all three
megastructure shells. `CHECKS.blocks`, `CHECKS.planet` and the new
`CHECKS.world` in `tools/arenashot.mjs` read all of it: a probe that is
occluded, faded or landed on another object is a **skip, printed by name**,
and the block rule then insists that at least two SOLID blocks were measured
on the six framings it is about, so the skips can never quietly empty it.

### Blocker — cover has no shape from the establishing and VS cameras

Two rungs, both bought in the albedo (a lit vertical face lifts ~11 L over
its own albedo under this rig, so light could not buy either):

- **The sun flank.** `blockSideSun` #C9BEAD (L 77.44) → **#ABA89E** (L 68.85).
  The lit flank renders **80.3**, and it is the flank the establishing orbits
  cannot avoid — the key is at −x/+z and the eye at +z, so the blocks nearest
  camera present nothing else.
- **The cap.** `blockTop` #FFE6D0 (renders 90.8) → **#FFEFD9** (renders
  **91.5**). The floor is not one number — the same lit plaster measures 86.9
  at `floor-by-f` on `default` and 89.3 at `floor-by-d` on `vs`, because a low
  camera takes more of its specular — and against the top of that range the
  old cap carried 1.5 L. The red channel is at the top of the gamut, so the
  lift comes out of G and B; the cap reads a shade less amber than the field,
  which is what a sunlit cap does. It lands 0.3 under the plaza rather than
  1.0, and that pair is never a silhouette without the coping (92.7–94.1)
  between them: every sightline from inside the pit to the plaza crosses the
  pit's own rim.
- **The scribe line stays** (`EDGE_W` 0.05 m at `EDGE_K` 0.80, −6 L on the
  corner): 1.0 px from the establishing camera, 1.4 from VS, 2.5 from melee.

Measured on the round-9b captures, every solid block against **the lit floor
immediately beside it**:

| shot | lit flank − floor | cap − floor |
|---|---|---|
| `stand-default` | −7.7, −7.3, −7.3 | +3.6, +4.4 |
| `stand-vs` | −9.0 | +2.0 |
| `stand-aaa` | −7.4 (and −24.9 in shadow) | +3.6 |
| `stand-game` | −8.0, −8.3 | +3.3, +2.3, +3.0 |
| `stand-low` | −7.7, −6.9, −8.1 | +3.3, +3.4 |
| `stand-world` | −7.3, −7.0, −7.3, −7.4 | +3.7, +3.7, +4.0 |

The lead's bar is a flank ≥ 6 L under the floor and a cap ≥ 2 L over it: the
worst flank is **6.9** and the worst cap **+2.0** (`vs`, block d, against the
brightest floor any stand camera reports). The shade flank is unchanged and
still 8–17 L under its floor, so the block keeps three values, and the pit's
own lit face (83.0–83.4) now sits between the two flanks — the ladder reads
coping > plaza > cap > floor > pit sun face > block sun flank > pit shade
face > block shade flank, every rung ≥ 2 L.

**Ghosted blocks are reported, not measured.** On `default`, `vs`, `aaa` and
`low`, block b is at 0.24–0.35 and the check prints `block b ghosted to 0.35
by the ring rule` beside the numbers it did use. Its faces read 84.1–85.2
there, which is the ring rule working, not the block's albedo: with the block
solid the same face is 80.3 in `stand-game` and `stand-world`. A reviewer
measuring that block by eye is measuring the ghost.

### Blocker — the planet did not separate from its sky

Round 8 hung the pair OVER the gradient; measured, it came out 0.2 L UNDER
the sky beside it and 4.1 under the sky above it — a hole. Round 9 turned it
the other way (the lead's contract: a core 3 L under the sky, a faint limb
ring) and still measured **+0.4 L over its own sky with 2.5–3.1 L across the
face**, because the terminator's ramp was spent off the disc: −0.8 → 1.4 is
the ramp of a FULL sphere, while the visible disc only spends kd 0.19 → 0.99
(the body hangs 46° off the anti-solar axis, so its own centre already reads
0.69). Round 9b:

- **The pair**: `planetFace` **#E7D4B8** (L 85.8), `planetLimb` **#BCAD96**
  (L 71.4) — 1.5 L wider and 3 L down.
- **The terminator**: `term` **−0.21 → 1.59** — the same smoothstep centred on
  the disc's own centre with a half-width of 0.9.
- **The limb ring**: it was not reading at all (0.0 to −1.0 L against the
  core). At `smoothstep(0.62, 0.30, nz)` it only reached full strength at
  r/R ≥ 0.954 — two pixels on an 81 px disc — and the view-ray darkening
  (−5 % at the silhouette) cancelled what was left. Now `smoothstep(0.80,
  0.42, nz)` at **0.16**, with the view darkening halved to 0.975.
- **Nothing composites over its face**: the three megastructure shells are at
  renderOrder −8 / −7 / −6 against the planet's −3 and the moon's −4, and
  `stats.skyOrder` publishes all five so the rule is checked on the tree
  rather than on a crop.

| shot | core | sky beside it | lit third | shaded third | span | limb − core |
|---|---|---|---|---|---|---|
| `stand-aaa` | 81.9 | 84.6 (−2.7) | 84.7 | 77.6 | 7.1 | +1.7 |
| `stand-vs` | 81.9 | 84.2 (−2.3) | 85.0 | 76.6 | 8.4 | +1.0 |
| `stand-low` | 81.9 | 84.2 (−2.3) | 84.7 | 73.3 | 11.4 | +1.4 |
| `stand-world` | 82.9 | 84.9 (−2.0) | 85.4 | 77.1 | 8.3 | +1.0 |

The rule the tool asserts is core 2–4.5 L under the sky, a face spanning
≥ 6 L and a limb ≥ 0.8 L over the core; the sky it is judged against is the
**brighter** of the two samples at the disc's own elevation, because the near
roofline and the mist can only put something darker into one of them (on
`low` the right-hand sample lands on a tower and reads 1.1 L under the left).

**`stand-default` is exempt and says so.** A 15° disc hung at 8.5° cannot be
whole in a camera pitched 16° down with a 25° half-fov: it runs off the top
edge, and what is left sits in the corner where the page's grade (a WASH
toward #F4EEE8, 0.4 at the far corner) lifts the darker of two neighbouring
values more than the lighter one and closes the gap the rule measures — 84.3
against 85.6 there, 81.9 against 84.6 on the four cameras that frame the
whole body. The check detects the cut from the disc's own projected radius
and stands down.

### Major — the GTAO's distance fade had never fired

`arena.html`'s AO block fades the term out over view depths 48 → 62 m, and
`RIG.ao.fadeFrom/fadeTo` have carried those numbers since round 7. The fade
computed its depth with `TSL.perspectiveDepthToViewZ(depth, TSL.cameraNear,
TSL.cameraFar)` — and inside a post graph `cameraNear`/`cameraFar` resolve to
**the post-processing quad's own orthographic camera** (near 0, far 1), for
which that function is identically 0. `aoFade` was `smoothstep(48, 62, 0)` =
0 at every pixel: the GTAO was applied at FULL strength to the whole frame.

Measured `?ao=0` against the same frame, before the fix:

| surface | distance | AO cost |
|---|---|---|
| tier bank (`tier-tread-z`, `aaa`) | ~90 m | **−3.5 L** |
| deck soffit (`deck-under-z`, `aaa`) | ~90 m | **−4.6 L** |
| deck soffit (`vs`) | ~85 m | **−5.5 L** |
| the −z banners | ~90 m | **−5.6 to −6.1 L** |
| the planet's limb | 200 m | −1.4 L |

The fix is two uniforms read from the camera this pass renders. After it, the
AO term alone (`?ao=2`, `stand-game-aoonly.png`) reads **254.9 / 255 mean on
the far bank** (it was 244.7 with a minimum of 231) and **247.9 with a
minimum of 231 at a near block's base** — the near field keeps every contact
line it had. The tier band's per-column standard deviation is now **2.71 with
AO and 2.71 without it**: the bank's rhythm is its own geometry, and the
review's "corduroy on architecture 100 m away" is gone. In the field the AO
still does its work: pit shade face +4.7 to +5.1 L, block shade flanks +5.0,
a body's seating +1.8.

### Major — the world's value structure

With the fade fixed the bank came out as flat paint, so the stand got the
grain the field always had, at its own scale: `standGrain`, 0.22 and 0.9
cycles per metre (14–80 px per period at every distance the ring is seen
from, so it is a mottle and never a shimmer) at ±6.5 % of radiance ≈ ±1 L,
on the bank and the deck. The lead's bands, measured on the round-9b set:

| band | target | measured |
|---|---|---|
| tiers | 80–88 | **82.7–84.5** (`tier-tread`, `tier-tread-z`, five cameras) |
| deck underside | 72–78 | **73.3–77.4** (`deck-under-z`, `aaa`/`vs`/`low`) |
| horizon haze | ≈ 84 | `skyHorizon` L 84.3; the fogged ground meets it at 87.0 |
| sky | ≤ 93 | dome 91.6 at the zenith, **92.6–92.7 at the frame's corners** |

The sky's ceiling is the FRAME's, not the dome's: at zenith L 92.4 the washed
corners of every world camera measured 93.1 — the sky a viewer sees, 0.1 over
the lead's line — so `zenith` #F2E8D8 → **#EFE6D6** (L 91.6). The ramp out of
the horizon is 7.3 L, the roofline still stands over the sky it cuts, and the
coping (93.0–94.1) is still the frame's ceiling.

Two probes were also moved onto the surfaces they name: `deck-under-z` to
y = `DECK_Y` (it was 7 cm under the soffit, and at 90 m half a pixel was
enough to report the bank behind the cantilever), and `deck-fascia-z` onto
the fascia's own plane at rr = `DECK_IN` (it was 2.4 m behind it).

### Major — the lit floor against the 88–90 contract (the one still short)

Round 9 lifted `C.floor` #DACBBA → **#DECDBC** (albedo L 82.47 → 83.35). The
lit floor now reads **88.0–88.6** at `floor-lit` and 86.9–89.3 across the
seven lit-floor probes, a median of ≈ 88.0 — the contract's lower edge, where
the review measured 86.9–87.6. **The last 0.5 L is held by the cap rung, and
the two cannot both be had at this ladder.** On `vs` the brightest floor any
stand camera reports is `floor-by-d` at 89.3 and the cap over it renders
91.3: +2.0, exactly the lead's minimum. A further +0.5 on the floor puts that
at +1.5 and re-opens the blocker, and the cap cannot follow, because it is
0.3 under the plaza (91.8) and the plaza's red channel is already at the top
of the gamut — lifting it further takes the amber out of the one warm plane
the ground has. Closing this properly means moving the plaza, the coping and
the cap together by ~0.7 L, which is a change to the top three rungs of the
brief's own ladder and wants the lead's word. It is the only stand item of
this review left open.

### Major — the far layer read as cardboard on one side and nothing on the other

Round 9's answer, verified in 9b on `stand-world.png`: the three
megastructure shells are at alpha 0.19 / 0.155 / 0.13 and each thins further
with its own fogged depth, and `C.mega` moved from the near-neutral #A99C90
to **#B09E88**, the haze's own hue. Measured: the mega band L **86.6** at
S 0.166 against the sky over it at 88.2 / S 0.146 — **1.6 L under it and
MORE chromatic**, where the review measured a band 0.07 less saturated than
its surround. The far pavilion reads **85.3 against a sky of 87.3** (2.0 L),
its roofline falls 85.6 → 84.6 over 30 px, and across the whole far band the
99th percentile vertical step is **0.36 L/px**. The only steps over 3 L/px in
the band are the planet's own shaded limb at x 1215–1235, which is a body's
silhouette and not a cut-out.

### The two the lead asked to keep

- **The plaza's dead band** (round 7's item) still holds:
  `plaza-in-stand-shadow` **82.9–83.3** against `plaza-lit-band` **91.5–91.8**
  — an 8.5 L shadow of the stand across the band, with the slab seams, the
  recessed hairline and the eight plinths under it.
- **The chevrons across the mitred corners** are still gone: the per-side
  aisle rhythms blend across the diagonal and fade out within 10 m of the
  mitre. Measured over the corner crop of `stand-world.png` (x 20–400,
  y 300–520, banners masked off), the bank runs p5 74.1 / median 82.9 /
  p95 89.6 and only **22 of 380 columns** sit 4 L or more under the region's
  median — the deck's shade band and one concourse mouth, not a rhythm. What
  the corner does carry is the nested step L's of a mitred bank, which is
  the geometry and not a pattern laid over it.
- **Chroma**: the frame's Lab chroma median is **9.5** on `stand-world` and
  8.4 on `stand-game`, the sky's 13.1, the gate's 15.6, the megastructure's
  13.6 — every far layer is now at least as chromatic as the sky it hangs
  in, which was the review's complaint about a "foreign grey plate". The
  banner measures L 73.5 at C 17.2 / **S 0.256** in the fight frame against
  the foe's ring at C 51.4 / S 0.552, and **0.33 % of `stand-game` and
  0.03 % of `stand-world` is over S 0.35** — in a stand capture the only
  saturated marks are the two telegraph rings, which is the ownership rule
  of ARENA-AAA §1.

### What the port must take from this round

**`src/viewer/main.js` has the same broken AO fade.** Whatever it computes
its `viewDist` from, if it reads `TSL.cameraNear`/`cameraFar` inside the post
graph the fade is dead there too, and the game is rendering the whole world
under a near-field ambient-occlusion pass — a 3.5–6 L cost on the tier bank,
the deck and the banners in every fighting frame, and the source of the
"corduroy" the review measured on the live captures. The fix is two lines:

```js
const camNearU = TSL.uniform(camera.near), camFarU = TSL.uniform(camera.far);
const viewDist = TSL.perspectiveDepthToViewZ(depth.sample(uvN).r, camNearU, camFarU).negate();
```

Everything else this round is inside `environment.js` (four albedos, one
terminator, one limb ring, one grain) and arrives with the module.

## 8.-1 Round 8 — the AAA / ownership review, item by item

Every number below is from `reports/arena/stand.json` (27/27 `ok`, 0 console
errors, 0 GPU errors, all checks passed) or from a pixel read on the PNG
beside it. The review's own measures are used, including its definition of
"saturated": **HSV** saturation, `(max − min) / max`, and a pixel counts as a
side's mark at `S > 0.35` with `hue < 25°`.

### 1 + 3 (blockers) — the arena's banners were the opponent's colour

Measured then: banner #FC8367 → Lab (68.0, 43.7, 36.1), hue 11.3°, S 0.591;
the foe's accent #FF7A5C → Lab (66.5, 48.4, 40.3), hue 11.0°, S 0.639. **dE
6.5 and the same hue to a third of a degree** — the same object, and the only
saturated one in the world, so the ownership balance inverted the moment a
camera pulled back.

`C.banner` is now **#CDA288**: L 69.9, Lab C 23.1 (37 % of the accent's 63.0)
at Lab hue 58° (the accent's is 40°), HSV S 0.337, **dE 41.9**. Verified:

| measure | asked | measured |
|---|---|---|
| dE(banner, `--accent`) | ≥ 22 | **41.9** |
| any environment pixel over HSV S 0.40 | none | **max 0.347** over 97 banner probes in 30 captures |
| banner counted as a side's mark (S > 0.35) | never | **never** — 0.347 is the worst case, at the foot of a banner hung against the deck's dark soffit |
| coral : blue on an establishing beat | < 3 : 1 | `stand-low` **0.80 : 1** (323 / 403), `stand-world` 1.50 : 1, `stand-aaa` 0.90 : 1, `stand-default` 1.24 : 1, `stand-vs` 0.56 : 1 |
| the fighting beats must not move | — | `stand-game` 3.5 : 1, and its coral bbox is the two telegraph rings (x 289–1089, y 221–600, inside the pit); the banners contribute zero pixels to it at any framing |

`stand-counter.png` (11.75 : 1) and `stand-low-heat.png` (152 : 1) are the two
exceptions and neither is the banners: the counter azimuth hides most of the
blue ring behind cover while the orange one is drawn over its ghost, and
sudden death takes the whole world to ember by design.

**Why not the reviews' two literal targets.** Finding 1 asked for "≥ 12 L
darker" than the accent (L ≈ 54) and finding 3 for "L 76 / S 0.34"; they are
irreconcilable, and the first is also barred by the brief — ARENA-BRIEF §3
orders "nothing darker than `--sand` except a fighter", and a banner at L 54
would be the darkest thing in the world after the two creatures, on sixteen
large rectangles. The cloth sits between them at L 69.9: 12 L under the riser
it hangs against (so it reads by VALUE, which is what it lost when it lost
its chroma), 3.4 L over the foe's marks, and out of the mark band on every
measure both findings gave.

**And it is clay, not rose.** The first pass landed at Lab hue 48° and read as
dusty pink against the cream — the cast §5 bans, because a red at L 70 with a
third of the chroma is what pink is. Ten degrees toward the sun's own hue
makes the identical L/C/S read as fired clay and moves it further from the
foe's 40° at no cost.

### 5 (major) — one banner, three chromas, one of them pink

`bannerMat` was `fog: true, opacity: 0.93`, and linear fog toward the ground
colour takes a saturated warm through pink on its way to cream: one frame
carried the same cloth at S 0.591, S 0.569 and S 0.271 (#F7C3B4, a salmon
rectangle). The material is now `fog: false` and its ALPHA carries the
distance instead — `mix(0.93, 0.62, smoothstep(fogNear, fogFar, |positionView|))`.
A colour that thins keeps its hue; a colour that mixes with cream turns pink.

Measured on one frame (`stand-low.png`, four banners across the ring at
x 285 / 700 / 1150 / 1350): **S 0.288–0.328, hue 23° at all four, L 69.7–72.7**
— inside ±0.02 S and ±0.5° of hue where the ask was ±0.10 and ±6°. Across all
30 captures the same probe set spans S 0.213–0.347 and hue 21–24°; the L
spread (65.7–77.9) is the alpha doing its job, since a thinning cloth takes
the value of whatever it hangs against.

Three probes were added to `tools/arenashot.mjs` for this — `banner-near`,
`banner-side`, `banner-far` — so the spread is a number in `stand.json`
rather than something a reviewer has to pick out of pixels.

### 6 (major) — the planet and the moon read as holes in the sky

Then: the planet's lit limb L 85.1 / S 0.108 against a sky of L 83.8 / S 0.175
— **+1.3 L and LESS chromatic than the gradient behind it**; the moon L 88.3
against a sky of L 90.0, i.e. 1.7 L UNDER it. `a2.jpg` inverts both (its
planet is +4.8 L and +0.02 S over its sky).

Both bodies moved onto the sun's own hue (36°) and over their sky:

| | then | now | sky beside it | asked |
|---|---|---|---|---|
| planet, lit limb | L 85.1 S 0.108 | **L 88.1 S 0.186 h 37°** | L 83.8 S 0.175 | L 88–90, hue 34–38, S 0.16–0.20, +4 to +6 L |
| planet, shaded side | L 79.8 (−5.3 from lit) | **L 83.1 (−5.0 from lit)** | | ~6 L under the lit side |
| moon, lit | L 88.3 (−1.7 from sky) | **L 92.3–92.6 (+3.2)** | L 89.3 | over its sky, under the L 93.5 ceiling |
| moon, shaded edge | — | **L 85.4 (−7 from lit)** | | a limb, not a dot |

The terminator's ramp widened from `smoothstep(−0.25, 1.05)` to
`(−0.45, 1.15)` so the pair's range is spent across the disc rather than over
the visible three quarters of it, the moon's aerial-perspective mix dropped
0.10 → 0.04, it sits at 10° of elevation instead of 12° (where the dome's own
ramp is a lightness step darker) and it is 3° across instead of 2.4.

The moon's +3.2 L is short of the +4 the finding asked for and stops there on
purpose: the sky at its elevation is L 89.3 and the brief's ceiling is L 93.5
(`--sky-2` #F4EEE8, the coping's value), so +4 would have put a decorative
object at the top of the world's value ladder. It reads as a body now because
it has a limb, which is what it was missing.

### 4 + 7 (minor) — the vomitories read as swatches, not openings

Then: a concourse mouth at flat L 61.5 (standard deviation ~0 across the
patch) against a bank riser of L 77.4 — **15.9 L**, the largest hard-edged
dark mass in the top half of every fighting frame, and darker than a
fighter's own body, which is the rank the brief gives the fighters.

Three changes, all in the bank's colour node (a real 0.25 m recess would be
geometry on fifty-odd openings; these read the same at 60–110 m and cost
nothing):

- `C.vomitory` L 67.4 → **73.0** and `C.vomitoryMouth` 75.8 → **75.5**, so the
  mouth lands the brief's shade-side step under its own riser rather than a
  hole.
- A **2.5 L reveal** down the opening's depth (`vomDepth`, bright at the sill
  where a floor bounces, dark under the soffit) instead of a flat fill.
- A **lit head**: `C.vomLintel` (L 85.6, 3.2 L over the riser) in a 0.5 m band
  immediately above the mouth, one metre wider than the jambs, on the same
  rhythm so it can never appear where a mouth does not.

Measured on `stand-low.png` at the same pixel the review read: **L 68.2
against its bank at L 77.8 — 9.6 L**, inside the 8–10 asked. Column scans
through three mouths in `stand-game.png` run 67.9 → 73 inside the opening with
the lintel at 79.7–84.1 over them. The review's own assertion —
*no non-fighter patch of > 2,000 px under L 64 above the coping line* — passes
with **zero pixels under L 64 above the coping** in `stand-game.png`.

The portal throats on the ±z axes take the same pair, so their depth gradient
went from L 62–78 to L 68–78: still a tunnel, no longer a hole.

### 2 (minor) — no capture frames the world the way `a2` does

True: `world` (0, 33, 60) and `vs` both look DOWN into the pit, and `high` has
no world in it at all. `a2.jpg`'s eye is at DECK height looking ACROSS the
bowl. `CAMS.aaa` is that frame: **(0, 14.2, 47) → (13, 6.0, −46) at fov 60** —
0.4 m under the near deck's soffit at 2.35·HALF on +z, pitched 5.0° down and
yawed 8.0° right.

What one capture now carries: the bank on all four sides (the ±x pair sweeps
in from both frame edges), the cantilever and its shadow line as a band at
41–52 % of frame height, **nine whole banners** (`stand.json` →
`stats.banners['aaa-count']` = `{shown: 9, whole: 9, headOff: 0, headTight: 0,
footOff: 0}`), the −z portal and the far pavilion just left of centre, the
megastructure dissolving in haze, the planet at x ≈ 1020 and the moon at
x ≈ 1250, and the field in the lower third. `aaa` is in the shot list on all
three tiers and in the banner assertion's TIGHT set.

It is a judgement frame, not a game camera — nothing in the port uses it, the
same as `world`. Its one honest weakness is that our bowl stands at 2.05·HALF
from a 20 m field where a2's tiers come to the touchline, so the stand band is
104 px where a2's is a third of the frame; bringing the ring closer is barred
by the brief ("nothing decorative inside 2·HALF") and a longer lens buys the
band by giving up the wrap, which is the part of a2 that says *ring*.

**Do not read round 7's "dead frame" metric on this camera.** That measure —
scan rows in which over 80 % of the row is L > 90 — was written for the GROUND
band between the coping and the bank, and `stand-default` is at 1.2 % of frame
height by it, `stand-game` at 0.0 %. On `aaa` it reads 27.9 %, and every one
of those rows is a single band, y 0–250: the SKY above the skyline, which
ARENA-BRIEF §4 requires to be "a smooth gradient … no clouds" and which the
same rule caps at L 93. The 19.2 % flat-tile fraction is the same 250 rows.
A deck-height camera puts 41 % of its frame in sky; that is what looking
across a bowl looks like, and it is the one place in this world where flat is
the specification.

### 9 (major) — `setQuality` shed almost none of the new world

Correct, and fixed: see §7's visibility budget. `medium` measures **9.3–11.2
ms (89–107 fps)** and `low` **8.5–10.8 ms (93–116)** against `high`'s 14.1–20.2
on a contended machine — three times ARENA-AAA §2's ≥ 30 fps floor at
`medium`, and `stand-aaa-medium.png` / `stand-aaa-low.png` photograph what
each tier actually gives up.

### 10 (minor) — the tiers, deck and banners were not instanced

Fixed: 32 `Mesh` → **six `InstancedMesh`** (§6). Two notes for whoever touches
this next:

- three's node material assigns the instance matrix INTO `positionLocal` and
  only then evaluates the material's `positionNode`, so inside the banner's
  sway node `positionLocal` is already the instanced position in the group's
  space — which, the group being the scene's identity, is the world position.
  The drop and the phase therefore read world Y and world X+Z (a
  `modelWorldMatrix` on an `InstancedMesh` is the one matrix all sixteen
  share, and would have swung the whole ring as one wiper), and the lean is
  turned into the cloth's own plane by hand from `|x| > |z|`.
- `arena.html`'s `__arenaBanners` probe no longer walks `env.banner.children`.
  The group publishes `userData.placements` (the sixteen matrices) and
  `userData.size`, and the probe projects those. `main.js` only ever touches
  `env.banner.visible`, which is unaffected.

Pixel-identical: `tier-tread-z` 80.3 / 79.3, `deck-under-z` 70.1 / 67.8 and
`far-gate` 80.8 in `low` and `vs` before and after the change.

### Verified in the game, not only on the stand

`sh tools/devrestart.sh` then two states through `tools/shots.mjs` at three
widths (the run stamped itself FAILED — another agent's capture held the
session's creature — but the RENDER is the render, and the arena, the HUD's
sides and the marks are all in the frame). Counting the review's own coral
(HSV S > 0.35, hue < 25°) against its blue, below the page's own header:

| beat | the review measured | now |
|---|---|---|
| `live-vs` | 5.1 : 1 (5,719 / 1,112) | **0.92 : 1** (1,095 / 1,191) |
| `live-vs-w` | 6.2 : 1 | **0.86 : 1** (965 / 1,122) |
| `live-fighting` | 0.5 : 1 (must not move) | **1.15 : 1** (3,304 / 2,868) |
| `live-fighting-w` | 0.3–1.0 : 1 | **0.53 : 1** (1,114 / 2,120) |

The banners in those frames measure S 0.293–0.322 at hue 22–23°, so they
contribute ZERO pixels to the coral count at any camera. `live-vs-m` still
reads 4.7 : 1 and every coral cluster in it is the capture-failure stamp's own
red antialiasing (#CB8D7A at (200,175), S 0.399, hue 14) plus the VS card —
HUD surfaces, not the world; whoever owns the card should re-count it on a
clean run.

### 8 (major) — the captures do not carry the numbers the code says

`tools/shots.mjs` is not this file's; the finding is reported on to whoever
owns it. `tools/arenashot.mjs` already reads `window.__arenaStats` in full
(backend, tier, dpr, msPerFrame, fps, post chain, wall fades, banner
projections, GPU errors) and every capture on disk carries them.

## 8.0 Round 7 — the finish review, item by item (this file's items)

Every number below is from `reports/arena/stand.json` (24/24 `ok`, 0 console
errors, 0 GPU errors, all checks passed) or from a region read on the PNG
beside it.

**Blocker — "the world that gives scale is outside the frame in every fighting
camera"** (`stand-game` top 145 px spanning 12.9 L of corduroy; the deck, the
sky, the planet and the moon in no play framing). Closed from BOTH ends. The
camera: `orbit()` now aims at y 3.5 with height 2.8 + 0.34·dist, so at dist 30
the eye is 13.0 m and looks 17.6° down — the top of frame is +5.4° instead of
−3.6°, and everything under y = 13 + 0.095·d is in play framing. The world:
the ring came in to 41 m and the deck down to 14.62–16.02 m. Measured in the
new `stand-game.png`: the bank, the cantilever, its shadow line, five whole
banners, the far pavilion and ~60 px of sky are all in the fight frame; the
tier band (y 80–240) reads L 65–91 where it read 78.5–91.4.

**Blocker — "the coral banners are cut by the top frame edge"**: coral bbox
y-min is now 175 px in `default`, 85 in `game` and 350 (175 CSS) in
`default-dpr2`, against the lead's 40 px floor; `vs` 159, `low` 255, `world`
292, `counter` 86, `far` 112. Sixteen banners, 3 × 10.1 m, hung 0.3 m under
the deck's line with the foot on the bank's first row (§2). Asserted on every
capture by `__arenaBanners()` + `tools/arenashot.mjs`, which now reads TWO
thresholds — the hanging point in frame at all, and 40 px of sky over it —
and fails the shot on either in the eight cameras that show a world.

**Blocker — "arenashot still shoots the five play cameras with
`PLAY = { banner: '0' }`"**: `PLAY` is deleted, and so is the page's
`?banner=0` branch. `stand-game.png` carries 36,893 coral pixels; `melee`
37,434; `counter` 41,526; `far` 25,788. `main.js`'s `env.banner.visible = …`
is the last copy of the rule and should go with them.

**Blocker — `checkscope` RED on four comments in `environment.js`**: the word
is gone from lines 139, 179, 191, 757 and 851 (it described banding in every
case). `node tools/checkscope.mjs` → "scope holds — 69 bundle files and 8
server copy files, not one violation".

**Major — "value and chroma collapse against the chosen target"** (44.4–58.0 %
of every capture flat to within 0.5 L on a 36 px tile; chroma median 7.2).
The sky now runs L 92.4 chroma 9.0 → L 84.3 chroma 16.3, the deck is three
values and a cove instead of one ramp (88.2 / 84.7 / 72.9 + 79.6), the
concourse mouths are 67.4 and the skyline 65.1. Measured over the whole frame:

| capture | flat < 0.5 L | flat < 1 L | L p1 / p50 / p99 | mean sat |
|---|---|---|---|---|
| `stand-game` | **4.4 %** | 26.5 % | 65.6 / 85.1 / 94.4 | 13.9 % |
| `stand-world` | **0.0 %** | 3.3 % | 69.2 / 85.7 / 92.4 | 13.7 % |
| `stand-low` | **5.9 %** | 16.1 % | 67.3 / 87.3 / 93.4 | 13.0 % |
| `stand-vs` | **8.0 %** | 28.5 % | 64.2 / 85.3 / 92.7 | 13.5 % |
| `stand-default` | **2.4 %** | 12.9 % | 67.1 / 85.5 / 91.8 | 13.5 % |

(Round 6: 44.4–58.0 % under 0.5 L and 49.5–66.6 % under 1 L.) The lead's
value targets hold: tiers **79.3–85.1**, deck underside **67.8–74.0**,
horizon haze **84.3–85.9**, sky never over **92.4** — and nothing in the world
is darker than a fighter's own darkest value except the concourse throats,
which ARENA-AAA names.

**Major — "the plaza band is dead frame"**: the ring came in from 45 to 41 m,
the stand's shadow is solved on the plaza (−8 L, two 11.8 m bands on the
diagonal), the plaza carries 24 m slab seams over its 4 m grid and a recessed
hairline 0.35 m outside the coping, and eight 0.42 m plinths stand on the
band. `plaza-in-stand-shadow` (−34, 4.02, 6) reads **82.9** against
`plaza-lit-band` (30, 4.02, −30) at **91.0**.

**Major — "the radial aisles read as chevrons across the mitred corners"**:
per-side rhythms blended across the diagonal and faded out within 10 m of the
mitre (§2). The corner crop of `stand-world.png` (x 0–420, y 280–560 at 2×)
carries plain treads.

**Major — "fighters are not seated: the floor reflection outruns the cast
shadow, and it is visibly blocky"** and **"the fighter's own ground stain is
as dark as a telegraph ring"**. `RIG`: `reflection` 0.32 → **0.22**,
`reflectionCap` 0.40 → **0.22**, `reflectionBlur` 1.2 → **2.4**, and
`shadowSoft` 0.2 → **0.12** so a thin caster survives the VSM box blur and
the seating is bought by the shadow, where the brief puts it. Measured under
the blue creature in `stand-game.png`: the stain's p5 is **74.8** and the
clean floor beside it 87.6 — a −13 L cue, where round 6 measured −25 L and
the telegraph strokes it stands beside are L 57–59. The mirrored torso no
longer resolves at `resolutionScale` 0.35.

**Major — "`qualityGovernor` cannot enforce §7 inside the window a viewer
actually watches"** (`msPerFrame` null until 160 ticks; every slow capture
proved it fired never). Two changes, both in `environment.js`: `msPerFrame`
now reports the mean over `min(n − warmup, win)` samples once **24** are in
the ring, and the demote test runs on that; and a **panic rule** — three
consecutive ticks over 100 ms demote one tier immediately, before the warm-up
and outside the hold, but never inside the meter's own first four frames (a
governor built at the first match sees the boot's pipeline compilation as its
first deltas, and this meter only goes down). Verified in node: three 0.4 s
ticks at construction are ignored; three 0.2 s ticks after four good frames
demote to `medium` at once; 70 ticks at 50 fps report `msPerFrame` 20.00 with
the tier held.

**Major — "the documented DPR tier boundary can never fire"**: `initialQuality`
takes an optional **`dpr`** and tests `width · height · dpr²`, so one function
owns the rule. `initialQuality({ width: 1440, height: 900, dpr: 2 })` →
`'medium'`, `dpr: 1` → `'high'`. **The port must pass it** (`main.js:380`).

**Major — "`main.js`'s GTAO is no longer the stand's"** (radius 1.2 vs 1.5,
distanceExponent 1.5 vs 1.0, fade 62–80 vs 52–68, both files claiming
"verbatim"). The tuning is now **`RIG.ao`** — radius, scale, thickness,
distanceExponent, floor, samples, resolutionScale, denoiseRadius, fadeFrom,
fadeTo — and `arena.html` reads it. **`main.js` must read the same block**;
until it does the two frames are still graded differently. The fade came in to
**48–62 m** this round because the ring is 4 m closer and the GTAO's noise
tile over a bank of 1 m steps bands along it.

**Major — "the far tiers wash out in the game"**: `RIG.fogFar` 220 → **260**.
(The rest of that finding is the HUD's full-viewport scrim, which is not this
file's.)

**Minor, found here**: the WebGL2 fallback threw one shader error per boot
("NodeBuffer … exceeds GL_MAX_UNIFORM_BLOCK_SIZE") once the dust was added —
the instanced sprite's per-instance data went into a VERTEX uniform block.
Dust is WebGPU-only now and `default-webgl` is back to 0 errors.

### Cost after round 7 (1440 × 900, M2 Pro, headless, vsync and the frame-rate limit off)

| tier | ms/frame | fps |
|---|---|---|
| high, `game` / `world` / `vs` / `low` / `default` | 12.0–12.2 | 82–85 |
| medium, `game` / `default` | 7.2–7.9 | 110–120 |
| low, `game` / `default` | 7.3–7.4 | 121–125 |
| WebGL2 `low` | 8.7–10.0 | 98–115 |
| high at DPR 2 | 14.8 | 58 |
| medium at DPR 2 | 8.3 | 109 |

The world costs about 0.4 ms of the high tier's frame: sixteen banners, three
skyline shells, one mist shell, one shaft quad, eight plinths, seven pavilion
masses and one 700-instance dust mesh, all single-draw or instanced, none of
it in the shadow map. Shimmer (the 0.37 px pair): plaza **0.07**, floor
**0.05** mean codes at `high`, 0.06 / 0.04 at `medium` — the check fails at 4.

## 8. Measured (Lab from `stand.json` and region reads on the PNGs) — round 6

Every number is from the round-6 full capture: 23 shots, all `ok`, **0 console
errors, 0 device-level GPU errors, all checks passed**, taken with
`node tools/arenashot.mjs --extra=banner=1` (see the note at the top).

### The value ladder — the brief's six steps, re-spaced

Vertical scan down x = 900 in `stand-default.png` (plaza → coping → pit face →
floor), which is the fifth review's own test:

| rung | L | step to the next |
|---|---|---|
| coping | 94.4 | 3.0 |
| plaza | 91.4 | 1.8 |
| block top | 89.6 | 1.6 |
| floor, lit | 88.0 (centre 87.6) | 2.9 |
| block, sun flank | 85.1 | 1.7 |
| pit face, lit | 83.4 | 5.7 |
| pit face, shaded | 77.7 | 1.7 |
| block, shade flank | 76.0 | — |

**No two adjacent rungs are closer than 1.5 L.** Round 5 had four steps with
two ties and one inversion: plaza = block top to 0.0 L, floor = lit pit face
to 0.0 L, and the block flank 2.0 L DARKER than the pit face it is supposed to
sit above. The three moves: `pitSun` #BFB5AA on the pit faces the key reaches
(one albedo could not hold both ends — taking the lit face down 4 L took the
shaded one to 72.8, three under `--sand`); the plaza up 1.3 L to #FEE9D6
(rendering 91.4, ΔE ≈ 1.5 from the site's `--sky` — the ladder needed the
room and the plaza is the rung with nothing over it); `blockTop` down 0.4 and
`blockSideSun` up 1.8. The umbra holds at **78.8** (brief: never below
#CFC2B3, L 78.9) and nothing but a fighter is under `--sand`.

The 4 m drop now reads without a line: down that column the pit face is flat
at 83.4 for 45 px, the GTAO puts a crease at its foot (79.4), and the floor
comes back at 87.6.

### The stand, the horizon and the sky

| read | measured | target |
|---|---|---|
| `low` col x = 250: sky → roofline → deck → bank | 85.9 (y 215) → 83.4 (242) → **fascia 78.4** (245–251) → **crease 75.5–76.9** (254–290) | the deck's fascia is what meets the sky (its top face is above every eye inside the ring): **7.5 L** under the sky 25 px over the line, **5.0 L** across the join itself, and the crease under the cantilever another 2.5 below that — the fifth review asked for ≥ 6 L and measured 2.31 L over the whole top 150 px |
| `game` col x = 200 (the bank at the top of the fight frame) | treads 83.8–85.5, risers 78.5–81.6, aisles/deck-shadow band 77.4–80.2, over y 8–130 px | the top 17 % of the frame the game spends the most time in was a featureless warm plane; it is now 122 px of stepped, aisled architecture |
| megastructure (`low`, 400 × 180) vs the sky over it | 90.0 against 93.4 | a1's layer at 60–90 % dissolved: two planes at 1–3 L, never sharp |
| planet (`low`) | the visible disc runs **86.8** (top limb, col x = 980 y 155) → 82.6 (centre) → **80.5** (lowest visible, row y = 190 x 1050); sky 91.4 above it, 88.6 to its left, 87.7 to its right | **12° across** (was 7.8, ~200 px), **6.3 L of gradient across the visible face** (round 5: 1.4), **4.6 L under its sky at the sunward limb and 7.2 at the lowest visible edge** (round 5: 1.7–2.0 L over more than half the face — a lens smudge). Its lower-right limb, where the terminator's remaining 6 L sits, is behind the stand's roofline by design; the ramp is fitted to the part a camera can see (`smoothstep(−0.25, 1.05, kd)`) |
| moon (`low`, 1230 × 105) | 88.6 against a sky of ~92 | ARENA-AAA §2's second body |
| banner | **#FF7A5C to the code** at the rendered pixel | `--accent` exactly (round 5 measured #F96B51) |
| sky top (`low`) | #F4EEE8, 94.4 | ≤ #F4EEE8, no clipping |

### The frame is no longer one tone

40 × 40 px tiles varying by under 1.5 L, and the share of the frame within
±1.5 L of the modal value:

| capture | featureless tiles | within ±1.5 L of the mode | **L 78–86 band** | p5–p95 |
|---|---|---|---|---|
| `low` | **21.8 %** (was 56.8) | 25.0 % | **36.5 %** | 77–94 |
| `vs` | **32.1 %** (was 65.1) | 29.7 % | **42.6 %** | 77–94 |
| `melee` | 37.1 % | 27.6 % | 36.7 % | 76–92 |
| `counter` | 33.2 % (was 56.8) | 37.7 % | 27.7 % | 76–92 |
| `far` | 34.2 % | 37.8 % | 37.3 % | 78–91 |
| `game` | 35.2 % (was 46.9) | 37.4 % | 33.0 % | 76–92 |
| `default` | 36.7 % | 34.8 % | 31.3 % | 79–92 |
| `high` | 41.5 % | 34.4 % | 23.4 % | 79–92 |
| `near` | 47.0 % | 32.1 % | 37.5 % | 76–90 |

Round 5 had **0.0 %** in L 78–86: between the block shade at 74.9 and the
floor at 87.6 there was 13 L of empty ladder that no surface in the world
landed on. The stand, its aisles, the deck's shadow line, the portals and the
re-spaced pit face fill it; it is now the second-largest mass in every frame
after the plaza and the floor.

Two of the review's targets are NOT met and cannot be, inside the brief:

- **"under 30 % within ±1.5 L of the mode"** holds in `low`, `vs` and
  `melee` and not in the fight/boot framings (34–38 %). The mode is L 88 —
  the lit floor — and the brief allows nothing on the floor but the marks and
  the telegraphs. In `game` the floor and the plaza are 60 % of the frame by
  themselves.
- **"p5–p95 of at least 25 L"** cannot exist while the brief caps the frame
  at #F4EEE8 (94.4) and forbids anything under `--sand` (75.0) except a
  fighter: 19.4 L is the whole ladder. Measured 17–18 L, with the fighters
  (0.1–1.5 % of pixels) below it.

### Saturation: the coral is in the play frames now

Pixels over Lab chroma 25, all with the banners on: `game` 0.75 %, `melee`
0.32 %, `near` 0.50 %, `counter` 0.77 %, `far` 0.87 %, `low` 1.11 %, `vs`
1.35 %. Round 5, with `banner: '0'`, measured 0.23–1.08 % and **every one of
those pixels was a telegraph ring** — the place had no accent, no mark and no
colour of its own during a fight. The banner assertion (`__arenaStats.banners`,
in every capture, for every camera preset):

| camera | banners in frame | top / bottom (fraction of frame height) | width | verdict |
|---|---|---|---|---|
| `low` | 3 | 0.27 / 0.46, 0.28 / 0.42, 0.28 / 0.42 | 31–39 px | **whole** |
| `vs` | 2 | 0.17 / 0.38, 0.19 / 0.37 | 43, **52 px** | **whole** (the review asked for ≥ 40 px in the VS frame) |
| `game` | 2 | −0.09 / 0.12 | 42, 44 px | foot in frame, top clipped by the same edge the whole stand is clipped by |
| `melee` | 2 | −0.24 / 0.03 | 52, 55 px | foot in frame |
| `counter` | 2 | −0.09 / 0.12 | 41 px | foot in frame |
| `far` | 2 | −0.05 / 0.15 | 43 px | foot in frame |
| `default` | 2 | −0.15 / 0.05 | 43 px | foot in frame |
| `near`, `high` | 2 | wholly above the frame | | those two cameras look down 40–62°; nothing over 6 m is in either |

No camera shows a banner whose FOOT is off the frame — that was the round-5
failure (a coral bar from y = 0 to y ≈ 70 with a sand plinth hanging in open
sky 120 px above the horizon).

### The loud textures are gone

| read | round 5 | round 6 |
|---|---|---|
| notch stair, col x = 724 in `default` | **16 L** peak-to-peak on a 6 px pitch (74.4 ↔ 90.1), on the fighting axis behind the fighters | **3.1 L** (82.0 ↔ 85.1) — unlit, two pre-toned values; still reads as an opening from every camera |
| plaza grid, col x = 300 y 50–140 in `default` | **6.8 L** on a 14 px pitch — a diagonal moiré across the top-left quadrant, under the wordmark | **0.3 L** (91.4–91.7): flat. The near-field line still dips ~2 L where a hairline can be resolved |
| shimmer pair, 0.37 px, all three tiers | 0.02 mean | 0.00–0.17 mean, p99 ≤ 2.3 codes (≤ 1.5 is the bar) |

### Cover: three values and a chamfer

| read | measured |
|---|---|
| top / sun flank / shade flank | 89.6 / 85.1 / 76.0 — **4.5 L** between the top and the lit flank (round 5: 0.0 in `game`, `vs`, `counter`, where the probe and the region both read the top's own value) |
| chamfer, shade flank (`melee` col x = 850) | 89.6 → **83.8** → 76.0: a +7.8 L band ~8 px wide along the top of the flank |
| chamfer, sun flank (`default` col x = 700) | 89.6 → **90.3** → 88.6 → 85.1: **+0.7 L over the top face** and +5.2 over the flank, over ~4 px |
| floor marks, cross in `game` | core **84.0–84.3** against a floor of 87.6–88.0 — ΔL **3.6–3.9** |

### GTAO: everything seats, nothing muddies

Diff of `stand-default.png` against its exact twin `stand-default-noao.png`
(`?ao=0`), floor pixels only:

| read | round 5 | round 6 |
|---|---|---|
| +z bar's lit foot (col x = 700) | −3.1 L peak, back to 0 in 16 px | **−3.7 L peak over 40 px** |
| cube's foot (col x = 300) | −1.4 L peak, gone in 8 px | **−3.7 L peak over 44 px** |
| under the orange quadruped's feet | −2.4 to −4.2 | **−4.7** |
| under the blue creature, near side (540, 500–535) | **0.00 / −0.3 — it did not seat at all** | **−2.3** |
| open floor / far plaza | 0.00 | **0.00 / 0.00** |

`radius` 1.2 → **1.5** and `distanceExponent` 1.5 → **1.0**; the 0.8 floor is
unchanged, so no crease can fall through the brief's umbra.

### The floor reflection, committed

Diff against its exact twin `stand-game-norefl.png` (`?refl=0`), floor pixels
only: **−5.1 to −6.1 L directly under the gorilla's feet** (p0.1 of the whole
frame's clean floor: −6.2), **0.00 on the open floor and 0.00 on the far
plaza**, gone within about a body-width, and deeper where it stacks with the
body's own shadow. Round 5 measured −2 to −3 L — a brownish smudge that read
as dirt on the plaster, a `high`-tier pass no reviewer could see.
`reflectionBlur` 3.5 → **1.2**, `reflectionCap` 0.25 → **0.40**, `reflection`
0.15 → **0.32**, height ramp [6, 16] → **[4, 12]** so the establishing and VS
cameras get 0.4 of it.

It stops at −6 rather than the review's −8 on LIT floor because two binding
documents pull the other way: RENDER-QUALITY §3 says "the floor stays
near-white — reflections are a hint, never a mirror", and the brief lists
reflections under what must never be on the floor at all. −8 on the lit floor
plus the body's own shadow would put a fighter's feet at the umbra's own
value (78.8). `RIG.reflection` is the one constant to raise if the founder
wants more: the term is linear in it, so 0.32 → 0.45 buys about another 2 L
and the 0.40 cap holds the worst case at ≈ −10 L.

### `qualityGovernor.msPerFrame` was lying for 40 ticks

`get msPerFrame() { return n >= win ? … }` counted the warm-up ticks in `n`
but not in `sum`, so the mean was divided by a full window while the ring held
as few as `win − warmup` samples: on a steady 60 fps feed it reported 90 fps
at tick 120, 72 at tick 140 and the truth only at tick 160. It is now
`n >= warmup + win`. This is the number `tools/shots.mjs` writes beside every
live capture, `tools/checkboot.mjs` falls back to, and `main.js` reads as
`gov.fps` for the `starving` escape — a genuinely 25 fps fight read as 37 for
the length of the window and kept the demotion hold on.

### Cost (1440 × 900, M2 Pro, headless, vsync and the frame-rate limit off)

high **11.1–12.2 ms** · medium 6.8–7.5 · low 6.8–7.1 · WebGL2 8.8 ·
high DPR 2 16.1 · medium DPR 2 7.7. The stand is *cheaper* than the two wings
it replaces (round 5: high 12.9–15.6 ms): 160 m of transparent extrusion × 2
with an alpha ramp and no depth write cost more than a closed opaque ring
with its aisles drawn in the shader. All 23 shots, all three tiers and both
backends render the same grade with no console or GPU errors.

### The fifth review's list, item by item

The numbering is the review's own (22 items over four lenses; the ones that
live in `src/viewer/main.js`, `tools/shots.mjs` or `tools/arenashot.mjs` are
listed above as still open).

1. **Notch stair is the loudest texture in the frame** (major) — the stair is
   UNLIT: 16 L → **3.1 L** peak-to-peak, measured down x = 724 in `default`.
2. **The VS frame is empty cream; the planet is absent; the banner is not in
   frame** (major) — the establishing frame now carries the stand's roofline,
   two coral banners at 43 and 52 px, the portal, the megastructure and a 12°
   planet 5–7 L under its sky. Featureless tiles 65.1 % → **32.1 %**; the
   L 78–86 band 0 % → **42.6 %**.
3. **The plaza grid aliases into 6.8 L diagonal bands under the wordmark**
   (major) — the analytic coverage fade: **0.3 L** down the same column.
4. **The floor reflection does not read** (minor) — committed: **−5 to −6 L**
   under a body's feet on lit floor against its `?refl=0` twin (round 5: −2 to
   −3), 0.00 on open floor and on the far plaza. Short of the review's −8 for
   the reason given in §8.
5. **`qualityGovernor.msPerFrame` under-reports for 40 ticks** (minor) —
   fixed (`n >= warmup + win`).
6. **The AAA world does not exist** (blocker) — built: a four-sided ring at
   2.25·HALF, a cantilevered deck with a shadow line, radial aisles, two
   portals with tunnels, eight banners, two megastructure layers, a moon.
7. **The six-step value order collapses into four with two ties and one
   inversion** (blocker) — re-spaced; no two adjacent rungs closer than 1.5 L
   (the table at the top of this section).
8. **There is no horizon** (major) — the sky's horizon is its own colour,
   2.5 L UNDER the fogged ground, and the stand's roofline carries the line:
   fascia 78.4 against a sky of 83.4–85.9.
9. **No lit top edge on any block** (major) — a chamfer on the top 0.20 m of
   every flank: +5.3 L on the shade side, +4.2 on the sun side, over a
   flank/top step that is now 4.5 L instead of 0.0.
10. **The frame is one tone** (major) — L 78–86 went from 0.0 % to 23–43 %;
    featureless tiles from 46.9–65.1 % to 21.8–47.0 %. The two targets that
    cannot be met inside the brief are named above.
11. **AO seating is thin and inconsistent** (minor) — radius 1.5,
    distanceExponent 1.0: the cube's foot −1.4 L over 8 px → **−3.7 over
    44 px**, the blue creature's near side 0.0 → **−2.5**, open floor 0.00.
12. **The banner reads as a decal and is missing from four of five captures**
    (minor) — eight banners hung from the deck, fogged with the plaza, in
    every framing, rendering **#FF7A5C to the code**.
13. **The tier wings are under their own target and have no mass** (minor) —
    superseded: the wings are gone.
14. **The planet lands dead centre of the top edge in `stand-vs`** (minor) —
    30° right of −z with both establishing cameras swung 7–13° toward +x: the
    disc sits at x ≈ 1030–1080 of 1440 in `low` and `vs`.
15. **No world above the wall line in any play framing** (blocker) — the bank
    fills y 8–130 px of the fight frame with treads, risers and aisles.
16. **The only saturated object is switched off for every frame a player
    sees** (blocker) — answered in the geometry (eight banners, none on a
    fighting axis, whole in `low`/`vs`, foot-in-frame everywhere else); the
    `PLAY = { banner: '0' }` escape itself is the lead's file and is called
    out at the top of this document and below.
17. **The banner is cut by the top frame edge and its base floats**
    (blocker) — no banner in any preset has its foot off the frame, asserted
    in `__arenaStats.banners` for every camera in every capture; the plinth
    is gone.
18. **The planet is under the threshold at which it reads as a body**
    (major) — 7.8° → 12°, haze 0.25 → 0.12, terminator re-fitted to the
    VISIBLE part of the disc, lower limb behind the roofline.
19. **The wings fail the file's own earning test** (major) — deleted.
20. **The establishing frame is the emptiest capture in the set** (major) —
    `vs` featureless tiles 65.1 % → 32.1 %, with the far stand on the −z
    axis, a banner pair flanking the fighting axis at 43 and 52 px, the
    planet behind the roofline and two megastructure layers.
21. **A cover block is sliced by the right frame edge in `stand-melee`**
    (minor) — NOT fixed; named below as a deliberate decision.
22. **The plaza grid is below visibility** (minor) — the coverage fade keeps
    the line at ~2 L exactly where it can be resolved and removes it where it
    cannot, which is what a hairline does.

### Still open for the LEAD (not this file's, after round 7)

0. **`src/viewer/main.js`: the GTAO distance fade is dead there too**
   (round-9b, the one urgent item). `TSL.cameraNear`/`cameraFar` inside a
   post graph are the post quad's camera, not the scene's, so
   `perspectiveDepthToViewZ` returns 0 and `smoothstep(48, 62, 0)` fades
   nothing: the near-field AO is applied at full strength to the whole
   frame. On the stand that cost the tier bank 3.5 L, the deck's soffit 4.6
   and the far banners 5.6–6.1, and it reached the planet at 200 m. Two
   uniforms read from the scene camera fix it — see §8.-2's last paragraph.
1. **`src/viewer/main.js`'s camera solver must mirror `arena.html`'s.** This
   is the one hard dependency of round 7. `orbit()` on the stand is now
   `height = 2.8 + dist · 0.34`, `look` y **3.5** (was 0.42 / 0.4), and the
   boot camera is **(0, 17, 38) → (0, 4, −6)** at fov 46 (was (0, 26, 34) →
   (0, 1, 0)). Until `main.js` carries the same two numbers, the game and the
   stand photograph two different worlds and the finish review's first
   blocker is only half closed: the deck, the banners and the sky stay
   outside every fighting frame in the product.
2. **`src/viewer/main.js`: delete the banner rule.** `env.banner.visible =
   camModes[camMode] === 'wide' || …` switches the world's only accent off
   for every frame a player sees. Sixteen banners hang under the deck ring;
   none stands on a fighting axis, none floats, none is cut. `env.banner` is
   still a `Group`, so the line works if kept — it should not be.
3. **`src/viewer/main.js`: read `RIG.ao`.** The AO block (radius 1.5, scale
   1.6, thickness 1.5, distanceExponent 1.0, floor 0.8, 16 spp, 0.5 scale,
   denoise 5, fade 48–62 m) is exported so one file owns it. `main.js` still
   has its own copy at 1.2 / 1.5 / 62–80 and a comment claiming it is the
   stand's "verbatim".
4. **`src/viewer/main.js:380`: pass the drawing buffer to `initialQuality`.**
   It takes `dpr` now: `initialQuality({ isWebGL, width: innerWidth, height:
   innerHeight, dpr: dprNow })`, and the separate `bufferMP > 8.3` clause can
   go.
5. **`src/viewer/main.js:529`: `env.group.getObjectByName('wing+x')`** returns
   undefined since round 6 — a silent no-op. Delete it.
6. **The GTAO still doubles the notch stair's tread rhythm on `high`.** The
   stand's own fix (the AO's distance fade) cannot reach it: the notch is
   25 m from the fight camera, inside the AO's full-strength band, and its
   0.335 m treads self-occlude. Measured 7.2 L peak-to-peak with AO against
   3.8 L without, on a ~7 px pitch, on the −z fighting axis. It needs a
   height/world gate on the AO term in the post graph (both files) or a
   flat ramp with drawn nosings in place of the twelve-tread extrusion —
   the second is this file's and can be done next round if the lead wants it.
7. **`tools/shots.mjs`**: add `stats: window.__airenaStats` to the probe, so
   the live captures carry `main.js`'s own meter beside the governor's.
8. **The two Engineering findings of the third review** are still the port's
   and still not done: `precompileScene()` before `setAnimationLoop`, and
   `if (rebuilding) return;` in `drawFrame`. The finish review re-raised both
   (`swapBody` compiling inside the first `post.render()`; the 10–21 fps
   result beats).
9. A cover block is still sliced by the right frame edge in `stand-melee.png`
   and both fighters are cut in `stand-near.png` — inherent to a free orbit
   camera at dist 13–20 (the game can stand anywhere). The finish review's fix
   for `near` (a horizontal fit in the orbit solver, floor ~17 m) is the
   port's.

## 9. Decisions, and the findings answered (rounds 2–5, as a record)

> Kept as history. Round 6 supersedes several of these: the **plinth** is gone
> with the single banner (finding 17 of the fifth review), the **tier wings**
> and their alpha end-fade are gone with the whole ±x-only idea, the
> **reflection** is committed rather than a hint, the fog is 70/210 not
> 56/140, the sky's horizon is no longer the fog colour, and the notch
> stair's tread/riser mix is unlit. Everything else below still stands.

- **Shade cooler than the light.** Two things made every shadow more orange
  than the sun: albedos at chroma × 1.4 on surfaces that are seen in shade
  (where ACES compresses nothing) and a fill warmer than the key (the
  hemisphere pair and an env gain at R/B 1.17). Both are gone; the warm grade
  lives in the key alone. The umbra's b sits 2.5 over the lit floor's, not 4
  (an umbra shows the albedo's own chroma uncompressed; taking the floor lower
  than × 1.15 would grey the lit field under the plaza).
- **The coping unlit.** The one place the "lit surfaces are lit" rule loses
  to the picture: a lit L 94 albedo renders 91 under ACES and the sunken card
  had no edge. Pre-toned it is #F4EEE8 exactly and the frame has its ceiling.
- **The stair as steps.** Three lenses asked for the notch to read as a cut
  with steps, one for its stripes to vanish; treads at the plaza's value over
  risers at the pit's is a 4 L step — a texture, not a tower — and the same
  step that separates a block's top from its flank, so it is the one
  vocabulary. The 4 m trench halves its footprint on the axis.
- **No mast, a plinth.** The brief lists masts under what must never stand
  behind a fighter; a `--sand` foot grounds the flag without a second accent.
- **The VS pitch.** The planet's top limb was 30 px outside the VS frame; the
  fix is a smaller disc (7.8°), a lower elevation (1.3°) and the VS camera
  aimed 2 m up (not 2° down — pitching down lifts the disc further out).
  `main.js`'s real VS-card camera must be checked the same way.
- **The reflection stays, capped and ramped.** RENDER-QUALITY §3 asks for a
  hint; one lens preferred none. It is none from a low camera and a −3 L pool
  from the fight camera, and it can never print a limb (mip 3.5, cap 5 L).
- **The two play rules on the stand.** The near wall's fade and the ghost
  ring are the game's conditions, so every capture runs with them (`walls`
  and `ghost` in the console summary); `?wallrule=0` photographs without.
- **The −x wing** enters the fight frame's top-left as one pale stepped
  silhouette (std 1.2); c1 has it, and it is the wordmark's ground.

Findings, by number:

1 shade chroma (pit #DCCFC0, block side × 1.1, env gain R/B 1.04; block shade
b 10.2, pit shaded L 77.2 b 9.1, umbra b 8.7, a ≤ 2.1) · 2 coping unlit
(94.4, +3.5 over the plaza) · 3 wash vignette, DOM vignette deleted (corners
92, centre unchanged) · 4 stair (superseded by 14/31: steps must read; the
treads at the plaza's value take the tower out of the notch) · 5/23/30 plinth
(foot 84.9 under a plaza at 90.9; no mast) · 6/11/33 planet (7.8°, az 26°,
el 1.3°, VS aimed 2 m up; whole in both, 28/35 px) · 7/16/28 tiers unlit
(tread/riser 2.6 L; wing std 1.2; stub gone) · 8/15/19/27 reflection (0.15,
mip 3.5, cap 5 L, height ramp: vs none) · 9 wall rule (default/low/far fade
the near wall; bottom-band min 84 from 66/73) · 10 ring rule (`?ghost=1`;
far/low/counter show the ring over cover) · 12 superseded by 3 (edge pit
face ≥ 79) · 13/18/29 VSM (bias −0.0007, normalBias 1.7 texels, pit faces
non-receiving, only −x/+z walls cast; foot and crease flat in medium, block
feet straight) · 14/31 stair mix (treads plaza, risers pit; 4 L step on every
tier) · 17 shimmer pair (0.02 codes, all tiers) · 20 fill cooler than the
key (hemi #EEECEA/#F7F2ED × 0.64, env gain (1.62, 1.58, 1.52)) · 21 planet lit
by the key (upper-left lit, lower-right L 84) · 22 grain (± 2 %, two octaves,
no 2 cm term — it would crawl; probes < 0.3 L) · 24 slab REMOVED in round 4
(invisible in every capture; the wing's steps give the scale) · 25/34
sudden-death fog 30/200, ember L 73 (the plaza runs 90 → 73 continuously,
and since round 5 the wings dissolve on alpha, so no end cap stands in it) ·
26 STEP_RUN 0.8 superseded (twelve treads, 0.335 m); the
reveals stay pit/plaza (a darker reveal is more amber) and the stair still
receives no shadow (nothing casts on it now that the far wall does not) · 32
floor #DACBBA, intensity 0.89 (floor 88.5–88.8, umbra 79.0) · 35 the slab's
"floating plank" was in fact the banner's plinth left standing after
`banner=0`; parented, it is gone from game and far, and the slab itself went
with round 4 (24) · 36 ±30 m (corner shadow continuous; probe
`floor-shadow-corner` at (17, 0, 17.5) reads 83.6 in `high` — the umbra under
the corner wash — where the ±24 map rendered it lit at 89.6) · 37 port recipe corrected (§4:
REFLECT_LAYER at 1882, banner rule after `updateOcclusion`, `env.update`
between 5066 and 5068) · 38 `initialQuality` + `qualityGovernor` exported,
`?auto=1` on the stand, wiring in §4 · 39 exposure 1.0 in both places +
assert (§4) · 40 merge order (AO before the bloom add), wash, dither (§4) ·
41 `env.update` placement (§4) · 42 `default-webgl-fade` captured and
asserted (floor-shadow-d 88.1 ≥ 86) · 43 checkboot `resolveRef` +
`Promise.all` (§4, port note) · 44 `dispose()` restores
`renderer.shadowMap.type`; the RIG comment carries the √2 rule.
