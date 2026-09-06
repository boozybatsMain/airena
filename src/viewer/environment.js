/**
 * The arena as a place — c1's plaza with c4's discipline.
 *
 * Binding documents: `reports/arena/ARENA-BRIEF.md` (geometry, colours, light,
 * fog, sky, what must never happen) and `reports/arena/RENDER-QUALITY.md`
 * (the founder's final-image bar). This module builds EVERYTHING that is not a
 * fighter, a telegraph or an effect: the sunken field, the six cover blocks,
 * the plaza, the STAND (a four-sided ring of tiers under a cantilevered deck,
 * with radial aisles, two portals and eight coral banners), the megastructure
 * silhouette beyond it, the planet, the moon, the sky dome, the fog and the
 * whole lighting rig. `src/viewer/main.js` will call it once at boot and keeps
 * the returned `solids` list for its occlusion fade — the stand is NOT in it:
 * nothing beyond 2.25·HALF can ever come between a camera and a fighter.
 *
 * ── the three rules the geometry is built on ─────────────────────────────────
 *
 *  1. Gameplay geometry is `src/core/config.js` and never moves. The four
 *     collision walls stay boxes at ±HALF, 0.8 m thick and WALL_HEIGHT tall,
 *     centred exactly where `main.js` has always put them; the six obstacles
 *     are the config's boxes to the centimetre. Only their LOOK changes.
 *  2. The field is SUNK, not fenced. The plaza sits at y = WALL_HEIGHT, so the
 *     collision wall reads as the pit's retaining face and the boundary is
 *     legible at a glance without a rail, a line or a colour. This is why the
 *     plaza lives 2 cm above the wall tops: the wall box's outer 0.2 m of top
 *     face is covered by the plaza plane, the inner 0.6 m by the coping stone.
 *  3. Nothing on the floor but the marks and the telegraphs; nothing between
 *     camera and fighter that cannot fade; nothing loud behind a fighter. The
 *     only saturated things in a hundred metres are the coral banners, hung
 *     from the deck at ±15 m off each axis so a pair always FLANKS the
 *     fighting axis and none can stand on it, and the only accent besides
 *     them is the planet's soft limb.
 *
 * ── colour discipline ────────────────────────────────────────────────────────
 *
 * Lit surfaces carry the brief's albedos as `MeshStandardMaterial.color` and
 * the light does the rest. UNLIT surfaces — the sky dome, the fog, the
 * banners, the planet and the moon, the coping, the notch stair and the whole
 * stand — carry the brief's hexes as RENDERED values: `preTone()` inverts the ACES curve at the
 * exposure the page will grade at, so that after the post graph tone-maps the
 * frame those pixels land on the hex the brief names (the banner at #FF7A5C,
 * the coping at #F4EEE8), rather than on whatever a tone curve makes of them.
 * The fog colour is inverted the same way, so a fogged tier and the sky it
 * dissolves into meet at one value with no seam.
 *
 * The LIT albedos are the brief's hexes with their Lab chroma scaled by 1.4 at
 * the same L: ACES compresses chroma at L 85–90, and measured against the
 * chrome's `--sky` the first stand rendered every lit surface a step greyer
 * than the palette. The surfaces seen mostly in SHADE (pit faces, block
 * flanks) stay at × 1.0–1.1: at L 75 ACES compresses nothing, and × 1.4 there
 * made every shadow warmer than the sunlight. The hue is untouched (a ≤ 3,
 * b 7–11: warm, never pink, never blue); only the amount survives the tone
 * map now, and a shade keeps the ground's hue and loses only L, as it does on
 * the site (`--shade` over `--sky`).
 *
 * ── fill against key, and why the numbers look upside-down ───────────────────
 *
 * The brief wants the umbra no more than 13 % (Lab L) under the lit floor —
 * a linear ratio of ~0.75 — and a shadow that is "the only detail". A ratio
 * like that means direct light is about half of what lands on the floor and
 * the sky the other half, which is what a bright hazy plaza looks like (c1)
 * and the opposite of a studio rig. So the hemisphere is nearly as strong as
 * the sun here, and `shadow.intensity` lifts the umbra the last step. The
 * absolute scale is set so the floor lands at Lab L 88–90 with the post
 * graph's exposure at 1.0; only the ratios are design, the scale is exposure.
 *
 * ── API ──────────────────────────────────────────────────────────────────────
 *
 *   buildEnvironment(THREE, TSL, { scene, renderer, camera, cfg, half,
 *                                  wallHeight, obstacles, quality, exposure,
 *                                  shadowType })
 *     → { solids, floorMat, key, hemi, sky, banner, planet, group, reflector,
 *         update(dt, t), setQuality(q), applySuddenDeath(heat), dispose() }
 *
 *   banner   — a GROUP of the eight coral banners, not one plane: the port's
 *              play rule (`env.banner.visible = …`) still takes all of them
 *              at once, and there is no longer a reason to switch them off in
 *              a fight (see the stand, below).
 *
 *   solids   — [{ x, z, hx, hz, h, mats:[…], fade:1, want:1 }] in the exact
 *              shape `main.js`'s SOLIDS list has: four walls (mats = pit face,
 *              apron strip, that wall's coping band, and for the ±z walls the
 *              notch stair with its cut faces) then six blocks (mats = side +
 *              top). Every material in `mats` is built `transparent: true` so
 *              its `opacity` can be animated from the first frame without a
 *              pipeline rebuild. The six BLOCKS carry `castShadowNode =
 *              vec4(0, 0, 0, materialOpacity)`, so a block at opacity 0.35
 *              casts a 35 % shadow — the fade takes the shadow with it and
 *              never leaves a dark shape on the floor with no caster over it.
 *              The four WALLS cast a full shadow whatever their opacity: two
 *              walls' shadows overlap at the −x/+z corner, and a 0.24 caster
 *              written over a solid one under NoBlending REPLACED the solid
 *              wall's occlusion there with its own — a lit sawtooth wedge in
 *              the corner umbra whenever the near wall ghosted. A retaining
 *              wall one looks through still stands in the sun. (The coping
 *              is unlit and casts nothing; it only fades.)
 *   camera   — the camera the scene is rendered with. Needed for the floor
 *              reflection: the reflector's virtual camera is put on
 *              `REFLECT_LAYER` alone, so the floor mirrors ONLY what the page
 *              puts on that layer (the bodies — `root.traverse(o =>
 *              o.layers.enable(REFLECT_LAYER))`), never a pit face or a block.
 *              Without a camera no reflector is built.
 *   floorMat — the floor's material; `.color` is what sudden death lerps.
 *   quality  — 'high' | 'medium' | 'low': the planar reflection exists only on
 *              'high' (and never on the WebGL2 backend); the shadow map is
 *              2048 on high/medium and 1024 on low, and `setQuality` resizes
 *              it at run time (three's ShadowNode re-sizes the map on the next
 *              update).
 *   exposure — the exposure the page tone-maps at; unlit colours are inverted
 *              through it (see above). Default 1.0.
 *   shadowType — 'vsm' (default, the soft shadow) | 'pcf' | 'pcfsoft'. The
 *              module SETS `renderer.shadowMap.type` to match, because the
 *              rig's radius/bias/samples are tuned per filter and a page that
 *              left PCFSoft on would silently get the hard 4×4 kernel back.
 *
 *   update(dt) must be called once per frame BEFORE the render: it marks the
 *   shadow for exactly one refresh (so the reflector's nested pass cannot
 *   trigger a second one) and keeps the reflection's floor level in step with
 *   the background. A page that never calls it still gets shadows (autoUpdate
 *   stays on until the first call).
 */

// ---------------------------------------------------------------------------
// the palette — every hex in the brief, named once
// ---------------------------------------------------------------------------

export const ARENA_COLOURS = Object.freeze({
  /* Albedos of the LIT surfaces: the brief's hexes at the same L with Lab
     chroma × 1.4, so the rendered surface lands on the brief's target after
     ACES (see the header). The surfaces seen mostly in SHADE (the pit faces,
     the block flanks) carry the brief's hexes at × 1.0–1.1 instead: ACES
     compresses chroma at L 90 on a lit face, not at L 75 on a shaded one, and
     at × 1.4 every shade in the frame gained 4 b of chroma over the ground it
     stood on — tan beside the chrome's greige, the one amber in the picture. */
  /* ROUND-9 EXPOSURE. The review measured the lit floor at 87.6 on the stand
     and 84.8–87.5 in game against a contract of L 88–90, with nothing
     clipping anywhere in the frame (arena max L 95–98; every 254+ pixel is
     HUD), so the headroom was there and unspent. `ENV_EXPOSURE` is pinned at
     1.0 and would drag every pre-toned sky/fog/banner colour with it, so the
     lift is in the ALBEDO: L 82.47 → 83.35, ≈ +0.35 rendered, which puts the
     lit floor at 88.6 on `default` and inside the contract on every stand
     camera. The plaza and the block top go up with it so the ladder keeps
     its rungs (see below). */
  floor: 0xDECDBC,       // brief #E3D6C7 at × 1.15 lifted 0.9 L → renders ~L 88.6: under the plaza and the block tops by a readable step (c1/r3 make the field a deeper sand than the page); × 1.15 not 1.4 so the umbra, which shows the albedo's chroma uncompressed, stays within ~2 b of the lit floor
  /* The marks: inset square + centre cross. The brief's #C9B8A7 at 60 % was
     a 5.6 L step in albedo that ACES halved to ΔL 2.5 on the lit floor —
     the line vanished from the fight camera. #C6B39E at full strength is an
     8.5 L albedo step, ≈ 3.5–4 L rendered on the lit floor, ~4 in the umbra:
     a hairline that reads, never a band (3 px at most, see MARK_PX). */
  mark: 0xC6B39E,
  /* The pit face, split by which way it faces the key exactly as the block
     flanks are. At ONE albedo the lit faces rendered 87.6 — the lit floor's
     own value to a tenth, so a 4 m drop was announced by nothing but a 3 L
     AO smudge at the wall foot, and the brief's six-step ladder (coping >
     plaza > block top > floor > block side > pit face) collapsed into four
     with two ties. `pitSun` takes the −x/+z faces down to ≈ L 83 (4 L under
     the lit floor, 1.8 under a block's sun flank, so the order holds), and
     `pit` — the faces the key never reaches — keeps the brief's own hex at
     L 76.9, which is where the shade end of the ladder must stop (nothing
     under --sand but a fighter). One albedo could not do both: taking the
     lit face down by 4 L took the shaded one to 72.8, three under --sand. */
  pit: 0xDCCFC0,         // the brief's hex, × 1.0 (L 83.7): the SHADE faces, rendering ~L 77, b ≤ 11
  pitSun: 0xBFB5AA,      // the LIT faces (−x, +z), rendering ≈ L 83: under the floor by 4 L and under a block's sun flank by 1.8
  coping: 0xF4EEE8,      // UNLIT, pre-toned: the one band at plaza level, the frame's ceiling (lit, ACES compressed it onto the plaza's value)
  /* THE CAP IS A RUNG OF ITS OWN (round-9). At L 89.6 over a floor of 88.3
     the top face carried 1.3 L — inside the noise of the plaster grain, so
     a 3.2 m box read as a card lying on the ground from the establishing
     and VS framings. The lead's bar is a top ≥ 2 L OVER the floor and a
     flank ≥ 6 L UNDER it; c1's blocks are exactly that, a pale cap over a
     dark stone.
     ROUND-9b: #FFE6D0 rendered 90.8, and the FLOOR is not one number — the
     same lit plaster measures 87.0 at `floor-by-f` on `default` and 89.3 at
     `floor-by-d` on `vs`, because a low camera takes more of the floor's
     own specular. Against the top of that range the cap carried 1.5 L and
     the rung failed on the one framing the review measures. The cap is
     +0.7 L (renders ≈ 91.5), which is ≥ 2 L over the BRIGHTEST floor any
     stand camera reports and 3.5 over the darkest. It lands 0.3 UNDER the
     plaza rather than 1.0, and that boundary is never a silhouette without
     the coping (L 92.7) between the two: every sightline from inside the
     pit to the plaza crosses the pit's own rim. The red channel is at the
     top of the gamut, so the lift comes out of G and B — the cap reads a
     shade less amber than the field, which is what a sunlit cap does. */
  blockTop: 0xFFEFD9,    // renders ≈ L 91.5: ≥ 2 L over every lit floor the stand cameras measure, 0.3 under the plaza — and every top edge carries the scribe line, so the rung is not asked to do the silhouette on its own
  blockSide: 0xD8C8B6,   // brief #D6C7B6 at × 1.1: the SHADE flanks (+x, −z), rendering at --sand (L 75)
  /* The SUN flanks (−x, +z: N·L 0.57 against the floor's 0.60) at the same
     albedo rendered at the floor's own value (87.5 against 88.5) and cover
     had no top edge on its lit side — a block was a two-tone shape whose
     height read only from the shade face and the shadow. The brief orders
     top > floor > sun side > shade side (c4's three-value block); a lit
     vertical face lifts ~8 L over its albedo under this rig (key at N·L
     0.57 plus the hemisphere's ground term and the env: #CFBFAD, L 77.6,
     rendered 85.8), so albedo L 74.5 lands the sun flank ≈ L 82.5–83: a
     5–6 L step under the floor, 7–8 under the top, still 7 over the shade
     flank at --sand. `blockEdge` is not a colour but a MULTIPLIER (below):
     c1's blocks all carry a bright chamfer line along the top of every
     flank, and without one the flank's top end tied to the top face and the
     edge dissolved over the block's upper half. */
  /* ROUND-9, the blocker. At albedo L 77.44 the lit flank rendered 85.1 on
     `default` and 86.9 on `aaa` against a lit floor of 88.3/87.9 — a 2.5 L
     and a 1.0 L step, and from the establishing and VS orbits the blocks
     nearest the camera present NOTHING BUT sun flanks (the key is at
     −x/+z, the eye at +z), so a 3.2 m box was a flat white card with no
     shape at all. A lit vertical face lifts ~11 L over its albedo under
     this rig, so the step has to be bought in the ALBEDO and not in the
     light: L 77.44 → 68.85 lands the sun flank at ≈ L 80, which is 8.6 L
     under the floor (the lead's rule is ≥ 6, the previous review's ≥ 8 for
     at least one visible face — this passes both on the flank the camera
     cannot avoid) and still 4.6 L OVER the shade flank, so the block keeps
     three values. `c1.jpg` puts its block face 26 L under its floor; this
     is a third of the way there and the first version of it that reads.
     The pit's own lit face (83.2) now sits BETWEEN the two flanks: the
     brief's ladder reorders to coping > plaza > block top > floor > pit
     sun face > block sun flank > pit shade face > block shade flank, every
     rung ≥ 2 L, and the blocks are the darkest built thing in the field
     after the fighters — which is what the reference does. */
  blockSideSun: 0xABA89E,
  plaza: 0xFFF4DA,       // renders ≈ L 91.8 (a 1.5, b 4.6): 0.7 over the block tops it silhouettes, 2.6 under the coping. Lifted with the floor in round 9 so the cap stays under it; the red channel is at the top of the gamut, so the last of the lift comes out of b (the plaza reads a shade less amber against --sky #EBE1D9, and no rung was lost)
  grid: 0xE0CFBD,        // brief #DCD0C3; 4 m hairlines, faded by their own filter width (see plazaMat)
  /* THE STAND, unlit and pre-toned (ARENA-AAA §2). The bank's tread and
     riser are 2.8 L apart — a texture at 60–100 m, never a striping — and
     the whole ring sits UNDER the sky it stands against, which is where the
     horizon comes from: the deck's underside is 9.6 L under the sky at the
     roofline, its fascia 5.0, the radial aisles 6.7 under their own tread.
     The pale wings this replaces were the opposite (L 92.5 over an L 88.3
     haze) and delivered 2 L of banding. c1 and a2 both put the architecture
     a step under the sky and let the ground stay the bright plane. */
  /* ROUND-9b. Measured over the whole far bank in `stand-aaa.png` (34,709
     pixels, banners masked off by saturation) the trio read p25 78.2 /
     median 79.6 / p95 83.7 — a lightness step UNDER the 80–88 the lead set
     — and the fault was NOT in these hexes: the GTAO's distance fade had
     never fired (see `arena.html`), so a near-field effect was taking 3.5 L
     out of a bank 90 m away. With the fade fixed the same three hexes put
     the bank at ≈ 83 and the treads at 84.2, inside the band, and the ring
     keeps its 9 L of separation from the sky. They are unchanged. */
  tier: 0xDED3C9,        // the bank's treads, L 85.2 (renders ≈ 84.2 at 60–110 m)
  tierRiser: 0xD7CBC0,   // the bank's risers, L 82.4
  tierAisle: 0xD1C5BA,   // the radial aisles cut down the bank, L 80.2 — the vertical rhythm that gives the stand its scale (the GTAO takes 1–2 L out of the step creases they cross inside 62 m, so this is where --sand is)
  deckTop: 0xE5DCD2,     // the cantilevered upper deck's top face, L 88.2: the roofline, 3.9 L OVER the sky it cuts
  /* THE DECK IS THREE VALUES, NOT A GRADIENT (round-7). At fascia 78.4 /
     underside 80.1 the cantilever ran 83.6 → 77.8 as one soft ramp and the
     roof had no line: the founder's horizon event was a smudge. The fascia
     is now a HARD 3.5 L step under the top face — a lit edge seen against
     the sky — and the underside is the dark line the whole picture hangs
     from, 11.8 L under the fascia and the deepest non-fighter value in the
     world (ARENA-AAA §2 licenses exactly this darkness beyond the field:
     "a thin cantilevered upper deck ring with a shadow line and a faint
     underside light strip"). */
  deckFascia: 0xDCD2C7,  // its front face, L 84.7 — 3.5 L under the deck's top face, a step and not a ramp
  deckUnder: 0xBFB1A0,   // its underside and the band of bank it shades, L 72.9 — the frame's darkest non-fighter line and its horizon
  deckStrip: 0xD5C8B7,   // the light cove along the underside's leading edge, L 79.6: 6.7 L over the soffit it is cut into, never over the fascia
  /* THE MOUTHS ARE OPENINGS, NOT SWATCHES (round-8). At L 67.4 the concourse
     mouth measured L 61.5 on the capture against a bank riser of 77.4 — a
     15.9 L flat rectangle with no gradient across it, the largest hard-edged
     dark mass in the top half of every fighting frame and darker than a
     fighter's own body. The brief gives that rank to the fighters and the
     shade-side step is 8–10 L, so the pair now lands the mouth 8–10 L under
     its own riser, spends 2.5 L ACROSS the opening's depth (bright at the
     sill where a floor bounces, dark at the soffit) and carries a lit head
     over it (`vomLintel`): a hole with a lintel and a reveal, which is what
     a2's give scale with, rather than a swatch. */
  vomitory: 0xBFB1A3,    // the deep end of a portal or a concourse mouth, L 73.0 …
  vomitoryMouth: 0xC6B8A9, // … lifting to L 75.5 at its sill. A FLAT plane across the gap read as a blank screen at whatever value it was given; a five-metre box seen from inside — back wall, two converging side walls, a soffit — reads as a way in.
  vomLintel: 0xE0D4C9,   // the lit head over a concourse mouth, L 85.6 — 3.2 L over the riser it is cut into, the one thing that turns a dark rectangle into an opening
  mega: 0xB09E88,        // the megastructure silhouette beyond the stand (a1), drawn at 13–19 % alpha over the sky: L 65.6 on the haze's own hue (0xA99C90 was near-neutral and the band measured COOLER than the sky around it — a grey plate, not a distant building), so every layer lands 2.5–4 L under the sky beside it
  /* THE FAR PAVILION IS A SILHOUETTE, NOT A PLATE (round-9). At L 80.4/71.9
     the near slab measured 80.1 with a standard deviation of 0.48 against a
     haze of 82.2 and a sky of 86.3 immediately over its roofline — a flat
     fill whose top edge crossed 6.2 L in two pixels, and 0.07 LESS
     saturated than its surround, which is what made it read as a foreign
     grey plate. ARENA-AAA §2 and a1 ask for 60–90 % dissolved. The pair is
     6 L lighter and a step warmer, the mass carries a height ramp and a
     low-frequency mottle so it is not one value, and it THINS with depth
     on its own alpha (see `gateMat`), so no edge in it crosses 3 L. */
  gate: 0xE1D1BA,        // the far pavilion on −z (a2's gate): L 84.6 at its lit face …
  gateShade: 0xD1BFA7,   // … L 78.2 on the faces the key never reaches. It stands BEYOND the ring, is 25–40 % fogged and thins on its own alpha, so it is a silhouette with two values, never a building
  stairTread: 0xE6DDD3,  // the notch stair, UNLIT: tread L 88.6 …
  stairRiser: 0xDED3C8,  // … riser L 85.1. Lit, the same stair alternated 74.4 ↔ 90.1 — a 16 L band on the fighting axis, larger than the whole separation a fighter has from the floor
  /* THE BANNER IS THE WORLD'S WARM ACCENT, NOT THE OPPONENT'S (round-8, the
     founder's directive 1). At `--accent` #FF7A5C the sixteen banners were
     the same hue at the same chroma as the foe's ring, plate, panel and feed
     dot — and, being the only saturated objects in the world, they inverted
     the ownership balance the moment a camera pulled back: coral:blue ran
     5:1 on the VS beat and 50:1 on the win card, so the frame that says the
     player WON was overwhelmingly the loser's hue. ARENA-AAA §2 asks for a
     coral banner and §1 gives coral to the opponent; only one of them can
     hold at full chroma, and §1 is the blocker.
     The cloth is now a dusty terracotta: Lab C 24.0 against the accent's
     63.0 (38 %), Lab hue 48° against its 40°, dE 39.6 — and, measured the
     way the review counts a side colour, HSV S 0.335 under the 0.35 that
     makes a pixel "a side's saturated mark" and well under the 0.40 ceiling
     the world is held to. It stays the most chromatic thing in a hundred
     metres by a factor of 1.5 over the sky's horizon (C 16.3) and 3.3 over
     the bank (C 7.3), and it is 12 L under the riser it hangs against, so it
     reads by VALUE where it used to read by hue. Full-chroma #FF7A5C is left
     to the opponent's marks alone.
     Lab hue 58°, not 48°: at the redder end the same value and chroma read
     as a dusty ROSE against the cream — the pink cast §5 bans — because a
     red at L 70 with a third of the chroma is what pink is. Ten degrees
     toward the sun's own hue makes the identical measurements read as fired
     clay, and it moves the cloth further from the foe's 40° at no cost. */
  banner: 0xCDA288,      // L 69.9, C 23.1 (Lab hue 58°), HSV S 0.337 — the world's terracotta, never the foe's coral
  /* The planet, unlit: a soft body UNDER the sky it hangs in, as c1's is.
     15° across (round 9; 7.8 in round 5, 12 in round 8) and spending its
     whole range across the visible face — the terminator is a chord at
     0.71 R, so the ramp is spent ACROSS the disc and never on a rim. Its
     lower limb stays BEHIND the stand's roofline, which is what makes it
     read as distance rather than as a ball pasted on the sky. */
  /* Both bodies are on the SUN's hue (36°, the horizon's own): a grey ball
     in a warm sky is a hole whatever its value, and round 7 measured the
     planet at HSV S 0.108 against a sky at S 0.175 — less chromatic than
     the gradient behind it. The MOON keeps round 8's direction (it is over
     its sky, the one bright mark in the dome); the PLANET is now under its
     own, which is the next note. */
  /* ROUND-9: THE PLANET IS UNDER ITS SKY, WITH A LIMB RING. Round 8 put
     the pair OVER the gradient (face 88.2) on the argument that a2's
     planet is +4.8 L over its sky; measured, ours came out 0.2 L UNDER
     the sky beside it and 4.1 under the sky above it, so it read as a
     hole punched in the dome — the worst of both. The lead's contract
     settles it the other way: the core sits 3 L UNDER the sky beside it
     and the edge is drawn by a faint limb ring, which is a body seen
     against a bright hazy sky (c1's is exactly this). Rendered, with
     the 12 % haze mix and the −0.8 → 1.4 terminator: sunward third ≈ 86,
     centre ≈ 84.3 against a sky of 87.3 at its own elevation, lowest
     visible limb ≈ 78.5 — 9 L across the visible face — and the ring
     ≈ 2 L over whatever it rims. */
  /* ROUND-9b: THE RAMP WAS SPENT OFF THE DISC. Measured on the four
     captures that show the whole planet, the pair above rendered a core of
     85.0–85.7 against a sky of 84.6–86.0 — still 0.4 L OVER its own sky —
     and only 2.5–3.1 L from its lit third to its shaded one, because
     −0.8 → 1.4 is the ramp of a FULL sphere while the visible disc only
     spends kd 0.19 → 0.99 (the body hangs 46° off the anti-solar axis, so
     its own centre already reads 0.69). Two numbers follow from that
     geometry: the terminator is re-cut to −0.21 → 1.59, which is the same
     smoothstep centred on the disc's OWN centre with a half-width of 0.9 —
     f 0.13 at the shaded probe, 0.50 at the core, 0.74 at the lit one —
     and the pair is opened 1.5 L wider and dropped 3 L, so the core lands
     ≈ 82.0 (2.4–4.0 under the sky beside it on every stand camera), the
     lit third ≈ 84, the shaded third ≈ 77 (7 L across the face) and the
     limb ring ≈ 2.5 L over the core. Nothing in the sky is over the
     gradient now except the moon and that ring. */
  planetFace: 0xE7D4B8,  // L 85.8, hue 36° — the sunward third, ≈ 84 rendered: a shade UNDER the sky it hangs in
  planetLimb: 0xBCAD96,  // L 71.4 — the shaded third; the visible part of it lands ≈ 77 after the haze mix
  moonFace: 0xF6E8D3,    // the small moon (ARENA-AAA §2), upper-right of the planet: L 92.6 — the one mark in the sky that stands OVER its gradient …
  moonLimb: 0xE5D3B8,    // … to L 85.4, lit by the same sun
  /* fog = background. L 88.3 — 3 L UNDER the near plaza (91.3), so the ground
     has a far edge: the plaza runs down into the haze. The SKY's horizon is
     a separate colour now (`skyHorizon`, 2.5 L under this): at one hex the
     fogged ground was 2.1 L BRIGHTER than the sky it met and the ground
     plane evaporated — c1, c4 and r3 all keep the sky the brightest plane
     and the ground a step under it at the zenith but a step OVER it at the
     horizon. On the site's warm axis (a 1.4, b 7.1), not yellow-grey. */
  /* THE SKY CARRIES A HUE (round-7). At #E6DCD1 / #DFD5CB / #F4EEE8 the dome
     spanned 8.6 L at chroma 3.7–6.4 and every capture measured a chroma
     median of 7.2 against the target's 31.6: the world read as a grey
     model of itself. `stand-low-heat.png` proved the same geometry reads
     as a PLACE the moment the sky carries a hue, so the gradient now runs
     from a warm cream zenith (C 9.0) to an amber horizon (C 16.3) — a2's
     own ramp, at a tenth of its saturation, with the coral still the only
     thing in the frame past C 20. The order the references keep is
     untouched: the fogged ground (haze) stays 2.7 L OVER the sky it meets,
     so the plaza has a far edge; the roofline stands 3.9 L over the sky it
     cuts. Nothing clips: the zenith is L 92.4, under the coping's 94.4. */
  haze: 0xE7D8C2,        // fog = background, L 87.0 (C 12.8): 4.3 L under the near plaza — the ground runs down into the haze
  skyHorizon: 0xE2D0B4,  // the dome AT the horizon, L 84.3 (C 16.3): 2.7 under the fogged ground, 3.9 under the stand's roofline
  /* ROUND-9b: the ceiling is the FRAME's, not the dome's. The lead holds the
     sky to L 93; the dome's own zenith was 92.4 and passed, but the page's
     grade is a WASH toward #F4EEE8 (L 94.4) that reaches 0.4 at the far
     corner, so the top corners of every world camera measured 93.1 — the
     sky a viewer sees, 0.1 over the ceiling. The zenith comes down 0.8 L,
     which puts the washed corner at ≈ 92.3 and leaves the ramp out of the
     horizon at 7.3 L. Nothing else in the frame moves: the roofline still
     stands 4.4 L over the sky it cuts and the coping is still the ceiling. */
  zenith: 0xEFE6D6,      // L 91.6 (C 9.0) — 7.3 L over the horizon; washed, the frame's corner stays under the lead's 93
  below: 0xD8C3AC,       // the dome under the horizon, if the ground ever ends
  /* sudden death: where the floor and the haze go at heat 1. The floor stays
     pale (L ≈ 88 rendered) so the coral telegraph keeps ≥18 L over it; the
     ember is L 73 (was L 62), a tint the fogged plaza runs into rather than a
     belt it stops at. */
  floorBurn: 0xEFC4A3,
  hazeBurn: 0xD8A88E,
});

/** The layer the floor reflection sees. Bodies go on it; nothing else does. */
export const REFLECT_LAYER = 1;

// ---------------------------------------------------------------------------
// ACES, forwards and backwards — so unlit hexes render as themselves
// ---------------------------------------------------------------------------

/*
 * three's ACES filmic fit (`src/nodes/display/ToneMappingFunctions.js`):
 * v = c·exposure/0.6 → ACESInputMat → RRTAndODTFit → ACESOutputMat → clamp.
 * Both matrices below are written as ROWS of the linear map (out = M·in), the
 * way the reference GLSL applies them; a probe on the capture (the banner and
 * the horizon) confirms the orientation against the live renderer.
 */
const ACES_IN = [
  [0.59719, 0.35458, 0.04823],
  [0.07600, 0.90834, 0.01566],
  [0.02840, 0.13383, 0.83777],
];
const ACES_OUT = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];
const mulM = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
function invM(M) {
  const [[a, b, c], [d, e, f], [g, h, i]] = M;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
const ACES_IN_INV = invM(ACES_IN);
const ACES_OUT_INV = invM(ACES_OUT);
const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
/* The fit is a ratio of two quadratics; its inverse is the positive root. */
function fitInv(y) {
  const a = 0.983729 * y - 1, b = 0.4329510 * y - 0.0245786, c = 0.238081 * y + 0.000090537;
  const disc = Math.max(0, b * b - 4 * a * c);
  const r1 = (-b + Math.sqrt(disc)) / (2 * a), r2 = (-b - Math.sqrt(disc)) / (2 * a);
  return Math.max(r1, r2);
}
const srgbToLin = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const linToSrgb = (u) => (u <= 0.0031308 ? u * 12.92 : 1.055 * u ** (1 / 2.4) - 0.055);

/** The ACES tone map as three applies it, on a linear rgb triple. */
export function acesForward(rgb, exposure = 1) {
  const v = mulM(ACES_IN, rgb.map((c) => (c * exposure) / 0.6));
  return mulM(ACES_OUT, v.map(fit)).map((c) => Math.min(1, Math.max(0, c)));
}

/**
 * The linear colour that ACES at `exposure` turns INTO the given sRGB hex.
 * Returns a THREE.Color-compatible {r,g,b} in linear space. Used for every
 * unlit surface so the brief's hexes survive the grade — and, in the port,
 * for the telegraph and ghost colours (`main.js`'s COLOR map), which today
 * are fed raw and render lighter and greyer than their hex.
 */
export function preTone(hex, exposure = 1) {
  const s = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => srgbToLin(c / 255));
  const v = mulM(ACES_OUT_INV, s).map((c) => Math.min(0.999, Math.max(0, c)));
  let lin = mulM(ACES_IN_INV, v.map(fitInv)).map((c) => Math.max(0, (c * 0.6) / exposure));
  /* A saturated blue (`--info` #6EA8FF) has no exact pre-image: the analytic
     inverse wants r < 0 and b ≈ 5, and the clamps above turn it lavender
     (#A7A9FF). When the round trip misses by more than half a code, walk the
     nearest reachable colour instead — a bounded pattern search on the sRGB
     error, ~300 evaluations of the forward fit, once per colour at build. */
  const target = s.map(linToSrgb);
  const err = (c) => acesForward(c, exposure).map(linToSrgb).reduce((a, o, i) => a + (o - target[i]) ** 2, 0);
  let best = err(lin);
  if (best > (0.5 / 255) ** 2) {
    lin = lin.map((c) => Math.min(c, 4));
    best = err(lin);
    for (let step = 0.5; step > 1e-4;) {
      let moved = false;
      for (let i = 0; i < 3; i++) {
        for (const d of [step, -step]) {
          const c = lin.slice(); c[i] = Math.max(0, c[i] + d);
          const e = err(c);
          if (e < best) { best = e; lin = c; moved = true; }
        }
      }
      if (!moved) step /= 2;
    }
  }
  return { r: lin[0], g: lin[1], b: lin[2] };
}

/** Lab L of an sRGB triple (0..255), for the calibration probes. */
export function labL([r, g, b]) {
  const y = 0.2126 * srgbToLin(r / 255) + 0.7152 * srgbToLin(g / 255) + 0.0722 * srgbToLin(b / 255);
  const f = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
  return 116 * f - 16;
}
export { linToSrgb, srgbToLin };

// ---------------------------------------------------------------------------
// the rig — ratios are design, scale is exposure
// ---------------------------------------------------------------------------

export const RIG = Object.freeze({
  /* Key #FFF2E2 from (−0.57, 0.60, 0.57): 37° up, from the −x/+z quarter.
     `main.js` anchors its fight camera at azimuth π/4 (CAM_ANCHOR: the eye at
     +x/+z looking toward −x/−z), which puts this key exactly 90° to the
     camera's left — so in melee every block shows one lit flank and one
     shaded flank and the ~4 m shadows fall sideways and away (toward +x/−z),
     never under the fighters toward the eye. The boot camera (0, 26, 34) has
     it over its left shoulder; only the counter-anchor (3π/4) looks into it,
     and that frame is photographed on the stand as `counter`.
     #FFE3D0 (Lab a 6.7, b 12.8, hue 63°), not the brief's #FFF2E2 (a 1.7,
     b 9.3, hue 79°): the key is three quarters of the light a lit surface
     takes, so its hue is the lit ground's hue, and under the yellow #FFF2E2
     the plaza rendered at hue 76° (a 0.9, b 3.8) against the site's `--sky`
     #EBE1D9 at hue 68° (a 2.0, b 5.1) — a step yellow-grey, "putty" under
     the wordmark's warm greige. ACES compresses chroma ~4× at L 90, so a
     one-unit move in the rendered a needs ~5 in the key's; calibrated on
     the stand (`?key=`): with the plaza albedo at #F0DED2 this key lands the
     plaza on #EBE1D9 to the code (a 1.8, b 5.0) and the floor on #E5DBCF
     (target #E6DBCF, a 1.6, b 7.2), while every shade — umbra b 9.0, shade
     flank, pit face in shade — which the key never reaches, stays where it
     was. A warmer key and unchanged shade is also the physically right
     direction: the shade is the sky's, the light is the sun's. */
  keyColour: 0xFFE3D0,
  keyDir: [-0.57, 0.60, 0.57],
  key: 4.0,
  /* The sky, as fill: a shade COOLER than the key, never warmer. The ground
     term is what a vertical face in shade lives on, so it is the lever that
     keeps a block's shade flank at the value of `--sand`, while the sky term
     — the only fill an up-facing floor in shadow gets — is held down to put
     the umbra ~9 L under the lit floor: inside the brief's 13 %, and a shadow
     one can read. Both were warmer than the key in the first stand
     (#F4EEE8 / #FFFAF4 under a #FFF2E2 sun), and shade that is more orange
     than sunlight is the tell of a clay render; in c1/c4/r3 the shade is a
     step greyer than the light. #EEECEA / #F7F2ED keep the level and drop
     the hue toward neutral: the warm grade lives in the key alone, where lit
     surfaces show it. */
  hemiSky: 0xEEECEA,
  hemiGround: 0xF7F2ED,
  hemi: 0.64,
  /* Image-based light from a PMREM of the sky dome over a plaza-coloured
     ground. It carries much of the fill because it lights a vertical face
     almost as well as the floor, which is what keeps the block flanks and the
     pit faces out of the dark; the arena's own plaster takes it at 0.6 of
     what the bodies get. It is also what an umbra is made of, so it is kept
     low. Its gain (`ENV_GAIN`, below) is near-neutral for the same reason as
     the hemisphere: R/B 1.04, not the 1.17 that tinted every umbra. */
  env: 0.40,
  envSolids: 0.66,
  envGain: [1.62, 1.58, 1.52],
  /* The umbra keeps this much of the key: the ground bounce and sky wrap one
     directional light cannot model. Holds the shadow above #CFC2B3 now that
     the floor itself sits at L 88. */
  shadowIntensity: 0.89,
  /* Ortho half-extent of the shadow camera — the √2 rule. The key's azimuth
     is exactly 45°, so the field's half-extent along the shadow camera's
     x-axis is 20·√2 = 28.3 m and a wall corner's 20.8·√2 = 29.4 m, not 20:
     at ±24 the two diagonal corners of the field fell outside the map and
     three's `frustumTest.select(shadowNode, 1)` rendered them lit — a
     diagonal cut through the +z wall's shadow in the top-down frame. ±30
     covers the corners with margin: 34 texels a metre at 2048. */
  shadowBounds: 30,
  /* VSM: the one filter in three 0.180's WebGPU path whose softness follows
     `shadow.radius` (PCFSoft is a fixed 4×4 bilinear kernel, ~5 cm at this
     density, and the 17-tap PCF posterises past ±3 texels). The blur is
     `shadowSoft` metres either side of the edge, converted to texels for
     whatever map size the tier has, so the penumbra is the same width on every
     tier: ~0.4 m at the foot of a block, 8–10 px from the boot camera.
     `shadowNormalBiasTexels` is the receiver offset along its normal, in
     texels of the tier's map (so it is the same texels on every tier, which is
     what the artefact is made of): with the ±8 texel box blur, the foot of a
     lit face is the local depth maximum of its own neighbourhood (the face
     above and the floor in front are both closer to the key), Chebyshev gave
     p ≈ 0.25 there, and every crease wore a dotted hairline and every block
     foot a sawtooth. ~1.7 texels of normal offset plus `shadowBias` (a
     constant ~0.09 m of light depth) lift the sample out of its own blurred
     footprint — at a block's lit foot the kernel is half block, half floor,
     and the floor needs ~0.12 m to clear it; the whole-shadow shift is
     ~0.15 m at a shadow's far edge, under a 0.4 m penumbra, and nothing can
     detach at a foot because the caster stands over its own shaded side. */
  shadowType: 'vsm',
  /* 0.12 m, not 0.2: at the wider blur a thin caster (a leg, a banner's
     edge, the coping's 6 cm lip) lost its own shadow inside the VSM box,
     and a fighter's umbra reached ~15 px from the feet where a 1.8 m body
     under a 37° sun should throw ~2.4 m. The penumbra is still soft — 4 px
     from the boot camera — and the seating the reflection used to buy is
     now bought by the shadow, which is where the brief puts it. */
  shadowSoft: 0.12,
  shadowSamples: 16,
  shadowBias: -0.0007,          // ≈ 0.09 m over the 130 m near–far range: with the normal offset, ~0.12 m in light depth
  shadowNormalBiasTexels: 1.7,
  shadowMap: { high: 2048, medium: 2048, low: 1024 },
  /* The planar reflection's share of the floor. It mirrors ONLY the bodies
     (see REFLECT_LAYER) and only DARKENS — what the floor mirrors that is
     darker than the background seats it; nothing can lift the floor. Blurred
     by mip bias, CAPPED at `reflectionCap` (scene-linear, ≈ −5 L) so no
     stacking of reflection, AO and penumbra prints a silhouette at the feet,
     and RAMPED by camera height (`reflectionHeight`, metres): from a low
     three-quarter the mirror is a readable body under the ring — two shadows
     from one sun — so the VS card gets none and the fight camera the hint. */
  /* Committed, not hinted: at blur 3.5 / cap 0.25 the term under a body's
     feet measured −2 to −3 L — a brownish smudge that read as dirt on the
     plaster, a 'high'-tier pass spent on something no reviewer could see.
     At blur 1.2 / cap 0.40 / k 0.32 it is −5 to −6 L on lit floor directly
     under a body and −9 where it stacks with the body's own shadow, gone
     within a body-width — the depth cue the founder's reference carries
     much of its midtone mass in. It stops there rather than at the review's
     −8 on lit floor because RENDER-QUALITY §3 also says "the floor stays
     near-white — reflections are a hint, never a mirror" and the brief
     forbids reflections on the floor outright; −8 on the lit floor plus the
     shadow would put a body's feet at the umbra's own value. The ramp
     starts at 4 m so the establishing and VS cameras get a share too. */
  /* ROUND 7 takes it back to a hint. At 0.32 / cap 0.40 / blur 1.2 the term
     measured −8.6 L at a foot and was still −3 L a full body-height below
     it, printed as 5–6 px blocks at `resolutionScale` 0.35, and stacked
     with the body's own shadow to a ground stain at L 62.6 — as dark as a
     telegraph stroke (L 57–59), 25 L under the floor, where the arena's own
     block shadows are 12–16 under. RENDER-QUALITY §3 asks for "a hint,
     never a mirror" and the brief forbids floor reflections outright. At
     0.22 / cap 0.22 / blur 2.4 the term is ≤ −4 L on lit floor, the mip
     blur dissolves the blocks, and the stacked stain stays over L 70 — a
     depth cue with 11 L of clear air between it and the marks. */
  reflection: 0.22,
  reflectionBlur: 2.4,
  reflectionCap: 0.22,
  reflectionHeight: [4, 12],
  /* The fog starts BEYOND the stand's front row (40 m from the centre,
     55–75 m from a fight camera) rather than inside it. At 56/140 the ring
     was 25–50 % dissolved before it began and its deck line — the frame's
     only horizon event — measured 2 L against the sky; at 80/220 the ring
     is 0–15 % fogged and the deck's underside stands 9 L under the sky,
     while the field itself (≤ 60 m from every camera) is still 0 % fogged
     and the megastructure band beyond 120 m still dissolves. */
  fogNear: 80,
  fogFar: 260,
  /* Sudden death pulls the fog in and stretches it out: 45 → 260 m at heat
     1, so the plaza warms into the ember over the whole depth instead of
     stopping at a belt, and the field stays ≤ 12 % fogged. */
  burnFogNear: 45,
  burnFogFar: 260,
  /* THE AO IS THE STAND'S, AND IT LIVES HERE (round-7). `main.js` and
     `arena.html` each carried their own copy of the GTAO numbers and drifted
     apart — radius 1.2 vs 1.5, distanceExponent 1.5 vs 1.0, the distance
     fade 62–80 m vs 52–68 — while both files' comments claimed the tuning
     was shared "verbatim". Both now read `RIG.ao`, so the next change lands
     in the game by construction. `fadeFrom/fadeTo` are VIEW distances in
     metres: everything the AO is for (the bodies' feet, the block feet, the
     pit creases) is inside 50 m of every camera, and the stand begins at
     41 m of world radius — 60–110 m of view distance from every framing
     that shows it — because the GTAO's noise tile over a bank of 1 m steps
     prints vertical banding along it. */
  /* `distanceExponent` 2.0, not 1.0 (round-9): at 1.0 the occlusion barely
     attenuates with view depth, so every riser 60–110 m away took the same
     darkening a block base takes at 20 m and the `stand-game` minus
     `stand-game-noao` difference lit the whole tier bank up — per-riser
     detail put back into the one part of the picture RENDER-QUALITY §6 asks
     to keep soft. At 2.0 the term falls off as the square of the sample's
     depth difference, which, with the 48–62 m view fade below, leaves the
     bank to the fog and keeps the contact lines the AO exists for. */
  ao: {
    radius: 1.5, scale: 1.6, thickness: 1.5, distanceExponent: 2.0,
    floor: 0.8, samples: 16, resolutionScale: 0.5, denoiseRadius: 5,
    fadeFrom: 48, fadeTo: 62,
  },
  roughness: 0.92,
  /* A sub-2 % plaster grain on every lit solid, two octaves at 1.7 m and
     0.4 m (nothing finer: a 2 cm term would sit at the pixel frequency from
     the fight camera and crawl). The brief's "no texture" forbids patterns,
     not the imperfection that makes a matte plaster read as plaster rather
     than as a viewport clay; c4 and r3 both carry it. */
  grain: 0.012,
  grainRoughness: 0.04,
});

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

export function buildEnvironment(THREE, TSL, {
  scene, renderer, camera = null, cfg = null, half, wallHeight, obstacles,
  quality = 'high', exposure = 1.0, shadowType = RIG.shadowType,
} = {}) {
  const HALF = half ?? cfg?.arena?.half ?? 20;
  const WALL = wallHeight ?? cfg?.arena?.wallHeight ?? 4;
  const BLOCKS = obstacles ?? cfg?.arena?.obstacles ?? [];
  const C = ARENA_COLOURS;
  const isWebGL = !!(renderer?.backend?.isWebGLBackend);
  const pre = (hex) => { const c = preTone(hex, exposure); return new THREE.Color(c.r, c.g, c.b); };

  const {
    positionWorld, positionLocal, positionView, positionViewDirection, normalView, normalWorld, materialColor, reference,
    color, uniform, float, vec3, vec4, mix, smoothstep, abs, max, min, fract, fwidth, oneMinus,
    select, pow, mx_noise_float,
  } = TSL;

  const group = new THREE.Group();
  group.name = 'arena-environment';
  scene.add(group);

  const solids = [];
  const disposables = new Set();
  const track = (m) => { disposables.add(m); return m; };
  /* A faded solid casts a faded shadow: three 0.180 writes the caster's rgba
     into the shadow map and scales the shadow by that alpha (`mix(1, …,
     shadowIntensity · shadowColor.a)`), so `m.opacity = o.fade` in
     `updateOcclusion` takes the shadow down with the block — no snap, no
     dark quadrilateral with no caster over it. The alpha is read through a
     `reference` bound to THIS material: in the shadow pass the material being
     built is three's override, so `materialOpacity` there is the override's
     1.0, not the block's fade. */
  /* The plaster grain (RIG.grain): a multiplier around 1 from world position,
     so every solid shares one continuous mottle and a block's flank and the
     floor it stands on never show a seam. `grained(x)` is what every colour
     node in the module multiplies by; the marks and the grid mix over it. */
  const grain = (() => {
    if (!RIG.grain || typeof mx_noise_float !== 'function') return null;
    const P = positionWorld;
    return float(1.0)
      .add(mx_noise_float(P.mul(0.6)).mul(RIG.grain * 0.8))
      .add(mx_noise_float(P.mul(2.5)).mul(RIG.grain));
  })();
  const grained = (c) => (grain ? c.mul(grain) : c);
  const roughnessNode = grain
    ? float(RIG.roughness).add(mx_noise_float(positionWorld.mul(2.5)).mul(RIG.grainRoughness))
    : null;
  const std = (hex, extra = {}) => {
    const m = track(new THREE.MeshStandardNodeMaterial({
      color: hex, roughness: RIG.roughness, metalness: 0, ...extra,
    }));
    m.envMapIntensity = RIG.envSolids;
    if (grain) { m.colorNode = grained(materialColor); m.roughnessNode = roughnessNode; }
    if (extra.transparent) m.castShadowNode = vec4(0, 0, 0, reference('opacity', 'float', m));
    return m;
  };
  const addMesh = (geo, mat, { x = 0, y = 0, z = 0, cast = false, receive = true, ry = 0, rx = 0, order } = {}) => {
    track(geo);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = receive;
    if (order !== undefined) m.renderOrder = order;
    group.add(m);
    return m;
  };
  /* A flat shape in the x/z plane: points are [x, z]; the geometry is built in
     x/y and laid down with its normal up (rotation −90° about x maps shape y
     to world −z, so z is negated on the way in). */
  const flat = (outline, holes = []) => {
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
    return new THREE.ShapeGeometry(shape);
  };
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

  /* Plaza level. 2 cm above the wall tops so the plane covers them; the
     coping stands 6 cm proud of the wall and 4 cm proud of the plaza. */
  const PLAZA_Y = WALL + 0.02;
  const COPING_W = 0.6, COPING_H = 0.06;
  const APRON = 0.4 * HALF;            // the strip that fades with its wall
  const NOTCH_HALF = 0.1 * HALF;        // a 0.2·HALF notch, centred on ±z
  /* The notch stair: 4 m of trench at 45° (c4-steep, half the footprint on
     the axis), in TWELVE treads — a 0.335 m rise. Five treads over the same
     drop were 0.8 m risers: the one element that says people walk into the
     field, and no person could use it — a model-maker's stair, the giveaway
     of a game arena. Twelve reads as a stair from every camera (≈ 5 px a
     riser from the boot camera) and stays under a 0.35 m step. */
  const STEPS = 12, STEP_RUN = 4.0 / 12;
  const TRENCH = STEPS * STEP_RUN;

  /* THE STAND'S GEOMETRY, hoisted: the plaza carries the stand's shadow (see
     `plazaMat`), so the ring's distance and the deck's height must be known
     before the ground is built.
     RING_AT was 2.25·HALF (45 m). The plaza between the coping and the bank
     was then 24 m of empty ground — 135 scan rows of the boot capture, 15 %
     of the frame, in which over 80 % of every row measured L > 90 with
     nothing in it. At 2.05·HALF it is 20 m, still outside the brief's
     "nothing decorative inside 2·HALF", and the stand's own shadow now
     crosses half of what is left. */
  const RING_AT = 2.05 * HALF;
  const BANK_STEPS = 11, BANK_RISE = 1.0, BANK_RUN = 1.6;
  const BANK_BACK = RING_AT + BANK_STEPS * BANK_RUN;
  const DECK_IN = RING_AT + 12, DECK_OUT = RING_AT + 24;
  /* 10.6 m over the plaza, not 11.4, and the slab is 1.4 m deep: the banner
     hangs from 0.3 m under the deck's line, and at 11.4 its head was still
     1 % of the frame from the top edge in the `melee` framing (dist 20).
     The deeper slab is the horizon: a 1 m fascia at 60–80 m was three
     pixels. */
  const DECK_Y = PLAZA_Y + 10.6, DECK_H = 1.4;
  /* The key, normalised, as the shadow solver uses it (37° up, out of the
     −x/+z quarter), and the height of the wall that casts: bank plus deck. */
  const KEY_N = (() => { const v = RIG.keyDir, m = Math.hypot(...v); return v.map((c) => c / m); })();
  const STAND_H = DECK_Y + DECK_H - PLAZA_Y;

  /* One clock for the things that move: the banners' sway and the dust in
     the light. Everything else in the brief is still. */
  const clockU = uniform(0);

  // ── the field ──────────────────────────────────────────────────────────────

  /* The floor: one plane at y = 0 carrying nothing but the two marks — an
     inset square 0.1·HALF inside the walls and a 3 m centre cross, 6 cm wide,
     `C.mark` at full strength. Drawn in the shader from world position with derivative
     anti-aliasing, so the lines are crisp at any distance and never shimmer,
     and `materialColor` stays the base so sudden death can still lerp
     `floorMat.color`. Each line's half-width is the larger of 3 cm and
     `MARK_PX` pixels (`fwidth` of its own distance field is one pixel in
     metres): from the fight camera a 6 cm line is 1.2 px, and MSAA + SMAA
     averaged it to a quarter of its contrast — the "only thing on the
     floor" was not on the floor from the camera that matters (ΔL ≈ 1 at
     the cross). With a screen-space floor the core is never under ~3 px
     (MARK_PX 1.6 either side: at 1.1 the AA ramps still averaged the cross
     to ΔL 2.2 from the fight camera), so the hairline reads at ≥ 3 L from
     every camera, and from the top-down `high` frame the 6 cm still wins.
     c4 and r3 both draw the court line. */
  const MARK_PX = 1.6;
  const floorMat = track(new THREE.MeshStandardNodeMaterial({
    color: C.floor, roughness: RIG.roughness, metalness: 0,
  }));
  floorMat.envMapIntensity = RIG.envSolids;
  if (roughnessNode) floorMat.roughnessNode = roughnessNode;
  {
    const P = positionWorld.xz;
    const wWorld = float(0.03);                  // half of 6 cm
    const inset = float(HALF - 0.1 * HALF);
    const dSq = abs(max(abs(P.x), abs(P.y)).sub(inset));
    const aaSq = fwidth(dSq);
    const wSq = max(wWorld, aaSq.mul(MARK_PX));
    const square = oneMinus(smoothstep(wSq.sub(aaSq), wSq.add(aaSq), dSq));
    const ax = abs(P.x), az = abs(P.y);
    const aaX = fwidth(ax), aaZ = fwidth(az);
    const wX = max(wWorld, aaX.mul(MARK_PX)), wZ = max(wWorld, aaZ.mul(MARK_PX));
    const arm = float(1.5);
    const barAlongX = oneMinus(smoothstep(wZ.sub(aaZ), wZ.add(aaZ), az))
      .mul(oneMinus(smoothstep(arm.sub(aaX), arm.add(aaX), ax)));
    const barAlongZ = oneMinus(smoothstep(wX.sub(aaX), wX.add(aaX), ax))
      .mul(oneMinus(smoothstep(arm.sub(aaZ), arm.add(aaZ), az)));
    const mask = max(square, max(barAlongX, barAlongZ));
    floorMat.colorNode = mix(grained(materialColor), color(C.mark), mask);
  }
  const floor = addMesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), floorMat, { rx: -Math.PI / 2 });
  floor.name = 'floor';

  /* The plaza material: a 4 m hairline grid, drawn from world position so the
     ring and the four apron strips share one lattice. `transparent` only on
     the strips, which fade with their wall.
     THE LINE IS FADED BY ITS OWN FILTER WIDTH. `smoothstep(w−aa, w+aa, d)`
     alone keeps the line's core at full strength however wide `aa` grows, so
     at a grazing angle a 2.5 cm hairline became a metre-wide band at
     undiminished contrast: measured down x = 300 in the game frame, L 92.1 ↔
     85.8 on a 14 px pitch — a 6.8 L diagonal moiré across the top-left
     quadrant, directly under the wordmark, where the material intends ≤ 3 L.
     `cover = w / aa` (clamped to 1) is the standard analytic-grid fix: a
     line whose footprint has grown past its own width loses strength in
     proportion, which is what a real hairline does, and the band collapses
     to nothing while the resolved near-field line keeps its full 2.5 L —
     the "no shimmer on the grid" of RENDER-QUALITY §4, and the scale cue a
     grid nobody can see was not paying for. */
  const GRID_K = 0.85;
  /* THE STAND'S SHADOW, solved on the ground (round-7). Every tier, deck and
     gate mesh sets `castShadow = false` — they are outside the key's ±30 m
     frustum and putting them in would halve its texel density over the field
     — so a 16.4 m ring at 41 m threw nothing at all onto the plaza it stands
     on, and the band between the coping and the bank was the emptiest thing
     in the frame. The shadow of a straight wall on a flat ground under a
     directional light is an analytic strip: walk from the ground point toward
     the sun and ask at what height the ray crosses the wall's plane. Two of
     the four sides face the key (−x and +z), so two bands run inward across
     the plaza on the diagonal, exactly as they do in `aaa/a2.jpg`; the other
     two throw away from the field and are never seen. It is applied to the
     plaza's ALBEDO, not as a plane over it: a real shadow darkens what a
     surface reflects, so it tone-maps like the block shadows beside it, it
     keeps the grid and the seams under it, and it cannot touch the AO's
     normal buffer the way a multiply-blended overlay would. */
  /* 0.50 of the albedo, which is ~7 L on the rendered plaza (91 → 84): the
     same depth the field's own block shadows carry, and the number is a
     multiplier on scene-linear light that ACES's shoulder then compresses
     by roughly a power of 0.29 — 0.76 measured only −2.4 L. */
  const SHADOW_K = 0.50;
  const standShadow = (() => {
    const A = float(RING_AT);
    const Px = positionWorld.x, Pz = positionWorld.z;
    const soft = 2.4;                                   // the penumbra, in metres of the caster's height
    const band = (t, along) => {
      /* in shadow while the ray toward the sun is still under the wall's
         top, and only along the length the wall actually has */
      const h = t.mul(KEY_N[1]);
      return oneMinus(smoothstep(float(STAND_H - soft), float(STAND_H), h))
        .mul(smoothstep(0.0, 1.5, t))
        .mul(oneMinus(smoothstep(float(RING_AT - 3), float(RING_AT + 3), abs(along))));
    };
    const tX = Px.add(A).div(-KEY_N[0]);                // the wall on −x
    const tZ = A.sub(Pz).div(KEY_N[2]);                 // the wall on +z
    const mX = band(tX, Pz.add(tX.mul(KEY_N[2])));
    const mZ = band(tZ, Px.add(tZ.mul(KEY_N[0])));
    return max(mX, mZ);
  })();
  /* The plaza material: a 4 m hairline grid, drawn from world position so the
     ring and the four apron strips share one lattice. `transparent` only on
     the strips, which fade with their wall.
     THE LINE IS FADED BY ITS OWN FILTER WIDTH. `smoothstep(w−aa, w+aa, d)`
     alone keeps the line's core at full strength however wide `aa` grows, so
     at a grazing angle a 2.5 cm hairline became a metre-wide band at
     undiminished contrast: measured down x = 300 in the game frame, L 92.1 ↔
     85.8 on a 14 px pitch — a 6.8 L diagonal moiré across the top-left
     quadrant, directly under the wordmark, where the material intends ≤ 3 L.
     `cover = w / aa` (clamped to 1) is the standard analytic-grid fix: a
     line whose footprint has grown past its own width loses strength in
     proportion, which is what a real hairline does, and the band collapses
     to nothing while the resolved near-field line keeps its full 2.5 L —
     the "no shimmer on the grid" of RENDER-QUALITY §4, and the scale cue a
     grid nobody can see was not paying for.
     THE SEAMS (ARENA-AAA §2, "plaza seams and a coping light line"): a
     second lattice at 24 m and twice the width, so the plaza reads as laid
     slabs rather than as a plane with a fine net on it, and one recessed
     hairline 0.35 m outside the coping — the coping is already the frame's
     brightest band, and a shadow gap beside it is what turns a band into a
     LINE without adding a value over #F4EEE8. */
  const plazaMat = (transparent) => {
    const m = std(C.plaza, { transparent });
    const P = positionWorld.xz;
    const lattice = (pitch, w, k) => {
      const g = abs(fract(P.div(pitch)).sub(0.5)).mul(pitch);
      const d = min(g.x, g.y);
      const aa = max(fwidth(d), float(1e-4));
      const ww = float(w);
      return oneMinus(smoothstep(ww.sub(aa), ww.add(aa), d)).mul(k).mul(min(ww.div(aa), float(1.0)));
    };
    const fine = lattice(4.0, 0.025, GRID_K);
    const seam = lattice(24.0, 0.075, 0.9);
    const dCope = abs(max(abs(P.x), abs(P.y)).sub(float(HALF + COPING_W + 0.35)));
    const aaC = max(fwidth(dCope), float(1e-4));
    const wC = float(0.05);
    const recess = oneMinus(smoothstep(wC.sub(aaC), wC.add(aaC), dCope)).mul(min(wC.div(aaC), float(1.0)));
    /* the fine grid toward `grid` (−2.5 L), the 24 m slab seams and the
       coping's recess toward `pit` (−4 L): three widths, one lattice each,
       every one of them faded by its own filter width */
    const marked = mix(mix(mix(grained(materialColor), color(C.grid), fine), color(C.pit), seam),
      color(C.pit), recess.mul(0.55));
    m.colorNode = marked.mul(mix(float(1.0), float(SHADOW_K), standShadow));
    return m;
  };

  /* The notch stair, as one profile: five treads from the floor to the plaza,
     entirely outside the collision line. It casts and receives no shadow —
     lit by its own tread/riser shading only — because it stands on the
     fighting axis under the top-centre HUD, and the shadow wedge the wall
     threw across its treads was the loudest non-fighter shape in the frame. */
  const stairGeo = (() => {
    const rise = (WALL + 0.02) / STEPS;
    const prof = new THREE.Shape();
    prof.moveTo(0, 0);
    for (let i = 0; i < STEPS; i++) {
      prof.lineTo(i * STEP_RUN, (i + 1) * rise);
      prof.lineTo((i + 1) * STEP_RUN, (i + 1) * rise);
    }
    prof.lineTo(TRENCH, 0);
    prof.closePath();
    return track(new THREE.ExtrudeGeometry(prof, { depth: NOTCH_HALF * 2, bevelEnabled: false }));
  })();

  /* The pit faces: the collision boxes, rendered as retaining walls. The ±z
     walls are split around the notch; both halves share one material so the
     fade treats them as one wall, which they are. Each wall owns its coping
     band, its apron strip and (on ±z) its notch stair, all in `mats`, so
     when `updateOcclusion` fades the near wall nothing of it stays standing
     across a fighter — the other three copings keep drawing the boundary. */
  const wallDefs = [
    { x: 0, z: HALF + 0.4, sx: HALF * 2 + 1.6, sz: 0.8, side: '+z' },
    { x: 0, z: -HALF - 0.4, sx: HALF * 2 + 1.6, sz: 0.8, side: '-z' },
    { x: HALF + 0.4, z: 0, sx: 0.8, sz: HALF * 2 + 1.6, side: '+x' },
    { x: -HALF - 0.4, z: 0, sx: 0.8, sz: HALF * 2 + 1.6, side: '-x' },
  ];
  const copingInner = HALF - 0.01, copingOuter = HALF + COPING_W;
  const copingY = WALL + COPING_H / 2;
  /* A pit face's albedo by which way it faces the key — the same split the
     block flanks take, for the same reason: at one albedo a lit pit face and
     the lit floor rendered the same value to a tenth of an L. */
  const keyN = vec3(...RIG.keyDir).normalize();
  const pitColour = () => grained(mix(color(C.pit), color(C.pitSun), smoothstep(0.0, 0.3, normalWorld.dot(keyN))));
  for (const wd of wallDefs) {
    const pitMat = std(C.pit, { transparent: true });
    pitMat.colorNode = pitColour();
    /* A wall casts a FULL shadow whatever its fade (the header's note): the
       −x and +z walls' shadows overlap at the field's −x/+z corner, and when
       the near wall ghosted to 0.24 its alpha-scaled caster, written over
       the −x wall's under NoBlending, replaced a full occlusion with 24 % —
       a lit, sawtooth-edged wedge in the corner umbra (VSM's blur across the
       two footprints' boundary) and a dotted run along the ghosted wall's
       shadow edge. Which wall must win depends on which one fades, so no
       alpha in the map for walls at all; the blocks keep theirs (a block's
       0.35 shadow never overlaps a wall's). */
    pitMat.castShadowNode = vec4(0, 0, 0, 1);
    const alongZ = wd.sz > wd.sx;
    /* Only the walls on the light's side throw INTO the pit: the −x and +z
       walls (the key comes from −x/+z). The +x and −z walls' shadows fall on
       the non-receiving plaza and contributed nothing but a dotted hairline
       along their own lit foot (their footprint in the VSM map, blurred
       0.2 m across the crease). */
    const casts = RIG.keyDir[0] * wd.x > 0 || RIG.keyDir[2] * wd.z > 0;
    /* No pit face RECEIVES. Under VSM three draws every receiver into the
       moments map, so a lit face standing on the floor put its own depth
       into the floor's blur kernel along the crease — and the floor's into
       the face's — and Chebyshev printed a dotted hairline along the foot
       of every lit wall (the texel pattern of the moments map), which the
       receiver bias only halved. Out of the map, the crease is a crease.
       What is lost: a fighter's shadow on a wall it hugs, which the two lit
       faces could show and the two shaded faces (self-shadowed by N·L) never
       could; the wall's own umbra on the floor is untouched. */
    if (alongZ) {
      addMesh(new THREE.BoxGeometry(wd.sx, WALL, wd.sz), pitMat, { x: wd.x, y: WALL / 2, z: wd.z, cast: casts, receive: false });
    } else {
      const len = wd.sx / 2 - NOTCH_HALF;
      for (const s of [-1, 1]) {
        addMesh(new THREE.BoxGeometry(len, WALL, wd.sz), pitMat,
          { x: s * (NOTCH_HALF + len / 2), y: WALL / 2, z: wd.z, cast: casts, receive: false });
      }
    }
    /* The coping: one 0.6 m band of #F4EEE8 at plaza level, 6 cm proud, its
       inner face a centimetre over the pit so it never shares a plane with
       the wall it caps. Broken only at the two notches. UNLIT and pre-toned
       like the tier slab: it is the sunken card's edge, the lightest line in
       the frame, the 1 px `--glass-line` hairline every card on the site
       carries — and a lit plaster at albedo L 94 rendered 91 under ACES, the
       plaza's own value, so the card had no edge. It neither casts (a 6 cm
       ledge shades nothing) nor receives (a receiver is drawn into the VSM
       map, and this one printed its own 4 cm edge along the apron). */
    const copingMat = track(new THREE.MeshBasicMaterial({ color: pre(C.coping), transparent: true }));
    const sgn = wd.side.startsWith('+') ? 1 : -1;
    if (alongZ) {
      addMesh(new THREE.BoxGeometry(copingOuter - copingInner, COPING_H, copingOuter * 2), copingMat,
        { x: sgn * (copingInner + copingOuter) / 2, y: copingY, z: 0, receive: false });
    } else {
      const len = copingInner - NOTCH_HALF;
      for (const t of [-1, 1]) {
        addMesh(new THREE.BoxGeometry(len, COPING_H, copingOuter - copingInner), copingMat,
          { x: t * (NOTCH_HALF + len / 2), y: copingY, z: sgn * (copingInner + copingOuter) / 2, receive: false });
      }
    }
    /* The apron strip: plaza from the coping out to 0.4·HALF on this side. The
       ±z strips go around the stair trench. */
    const apronMat = plazaMat(true);
    let outline;
    const A0 = HALF + COPING_W, A1 = HALF + APRON;
    if (wd.side === '+x') outline = rect(A0, -A1, A1, A1);
    else if (wd.side === '-x') outline = rect(-A1, -A1, -A0, A1);
    else {
      const T = HALF + TRENCH;
      outline = [
        [-A0, sgn * A0], [-NOTCH_HALF, sgn * A0], [-NOTCH_HALF, sgn * T], [NOTCH_HALF, sgn * T],
        [NOTCH_HALF, sgn * A0], [A0, sgn * A0], [A0, sgn * A1], [-A0, sgn * A1],
      ];
      if (sgn < 0) outline.reverse();
    }
    addMesh(flat(outline), apronMat, { y: PLAZA_Y, rx: -Math.PI / 2, receive: false });
    const mats = [pitMat, apronMat, copingMat];
    if (!alongZ) {
      /* The notch: a 0.2·HALF stair down into the pit at the centre of each ±z
         wall — the coping's only break, and the one thing that says the field
         is a place people walk into. Local x is the run and local z the width;
         rotate so the run heads outward along ±z and the width spans
         x ∈ [−notch, notch]. The plaza's cut faces stand on either side. */
      /* THE STAIR IS UNLIT. Lit, its treads faced up and its risers faced
         ±z, so on the near wall the riser was a fully shaded vertical face
         and the tread a lit horizontal one: profiled down x = 520 in the
         game frame the notch alternated L 74.4 ↔ 90.1 on a 6 px pitch — a
         16 L band, larger than the entire separation a fighter has from
         the floor (7–9 L), sitting on the fighting axis directly behind the
         fighters. The brief forbids exactly that ("anything loud behind a
         fighter: seat striping"). Unlit, the tread and the riser are two
         pre-toned values 3.5 L apart: the notch still reads as an opening
         from every camera and carries no pattern. It fades with its wall on
         `opacity` as before. The cut faces beside it stay LIT pit faces, so
         the reveal keeps the wall's own light. */
      const stairMat = track(new THREE.MeshBasicNodeMaterial({ fog: true, transparent: true }));
      stairMat.colorNode = mix(color(pre(C.stairRiser)), color(pre(C.stairTread)), smoothstep(0.55, 0.9, normalWorld.y));
      const sideMat = std(C.pit, { transparent: true });
      sideMat.colorNode = pitColour();
      const st = new THREE.Mesh(stairGeo, stairMat);
      st.rotation.y = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
      st.position.set(sgn > 0 ? NOTCH_HALF : -NOTCH_HALF, 0, sgn * HALF);
      st.castShadow = false; st.receiveShadow = false;
      st.name = `stair${wd.side}`;
      group.add(st);
      const runLen = TRENCH - 0.8;
      for (const t of [-1, 1]) {
        addMesh(new THREE.BoxGeometry(0.3, PLAZA_Y, runLen), sideMat,
          { x: t * (NOTCH_HALF + 0.15), y: PLAZA_Y / 2, z: sgn * (HALF + 0.8 + runLen / 2), receive: false });
      }
      mats.push(stairMat, sideMat);
    }
    solids.push({ x: wd.x, z: wd.z, hx: wd.sx / 2, hz: wd.sz / 2, h: WALL, mats, fade: 1, want: 1 });
  }

  /* The six cover blocks: the config's boxes, plain — flat tops, sharp edges,
     no bevel, no paint, no wireframe. Read by lit top, sun flank, shade flank
     and shadow: THREE values (c4's block), the flank's albedo chosen by which
     way it faces the key — `blockSideSun` on the −x/+z faces (N·L +0.57),
     `blockSide` on the +x/−z faces (−0.57, self-shadowed, at --sand). One
     material per flank so `mats` stays [side, top] and the fade takes the
     block together.
     THE SCRIBE LINE, NOT A CHAMFER (round-9). Rounds 7–8 lifted the top
     0.20 m of every flank by ×1.5 — a BRIGHT chamfer, on the argument that
     c1's blocks catch the light along their top edge. With the sun flank
     now 8.6 L under the floor that lift landed the band back at the floor's
     own value and re-created, in a 4 px strip, exactly the failure the
     albedo change exists to remove. The edge is drawn the other way round
     instead: a DARK hairline scribed into the corner, `EDGE_W` metres of
     the flank under its top edge and the same width inside the top face's
     own perimeter, at `EDGE_K` of the surface's own colour. It is the one
     move that separates a block from whatever stands behind it whatever
     that is — the floor at 88.6, the plaza at 91.8, another block's flank —
     because it belongs to the block and not to the contrast between two
     surfaces. 0.05 m is 1.0 px from the establishing camera, 1.4 from the
     VS camera and 2.5 from melee: a line, never a band, and MSAA + SMAA
     leave it at ~40 % of its own depth at the far end, which is what a
     scribe looks like. The lift is worth −6 L on the corner: enough to
     read at 1 px, far too little to be a ruled line down the flank. */
  const EDGE_W = 0.05, EDGE_K = 0.80;
  for (const o of BLOCKS) {
    const side = std(C.blockSide, { transparent: true });
    const flank = mix(color(C.blockSide), color(C.blockSideSun), smoothstep(0.0, 0.3, normalWorld.dot(keyN)));
    /* the scribe on the flank: the top EDGE_W metres of the vertical face */
    const edge = smoothstep(float(o.h - EDGE_W * 1.9), float(o.h - EDGE_W * 0.6), positionWorld.y);
    side.colorNode = grained(flank.mul(mix(float(1.0), float(EDGE_K), edge)));
    const top = std(C.blockTop, { transparent: true });
    /* … and on the cap: the same width inside its own perimeter, so the
       line closes round the corner and the top face is bounded on every
       side the camera can see it from. `inset` is the distance to the
       nearest edge of the box, in metres. */
    const inset = min(
      float(o.hx).sub(abs(positionWorld.x.sub(o.x))),
      float(o.hz).sub(abs(positionWorld.z.sub(o.z))),
    );
    const capEdge = oneMinus(smoothstep(float(EDGE_W * 0.6), float(EDGE_W * 1.9), inset));
    top.colorNode = grained(color(C.blockTop).mul(mix(float(1.0), float(EDGE_K), capEdge)));
    const m = addMesh(new THREE.BoxGeometry(o.hx * 2, o.h, o.hz * 2), [side, side, top, side, side, side],
      { x: o.x, y: o.h / 2, z: o.z, cast: true });
    m.name = `block-${o.id ?? ''}`;
    solids.push({ x: o.x, z: o.z, hx: o.hx, hz: o.hz, h: o.h, mats: [side, top], fade: 1, want: 1 });
  }

  // ── the plaza and what stands on it ────────────────────────────────────────

  /* The plaza ring: from the apron's edge out to the fog and past it. 2.4 km
     across so its far edge is always below the frame from any camera the
     game uses, and the horizon is the fog, not a rim of ground. Neither the
     ring nor the apron strips receive shadows: nothing outside the pit ever
     casts on them (the walls are flush with the plaza, the tiers cast
     nothing, the bodies stay in the pit), and a receiver this size in the
     VSM map drew its own triangulation as a dotted hairline across the far
     plaza — a kilometre-long triangle's depth, interpolated twice, disagrees
     with itself along the shared edge by more than the shadow test forgives. */
  {
    const R = 1200, H = HALF + APRON;
    const ring = addMesh(flat(rect(-R, -R, R, R), [rect(-H, -H, H, H)]), plazaMat(false), { y: PLAZA_Y, rx: -Math.PI / 2, receive: false });
    ring.frustumCulled = false;
    ring.name = 'plaza';
  }

  /* Sudden death's heat, and the dome's horizon as a uniform (the fog colour),
     so sudden death can take the fog, the dome's horizon and the planet's
     haze to the same ember and the fogged plaza never shows a seam. (The
     wings do not use it: their ends fade on alpha, which needs no colour to
     match — see below.) */
  const heat = uniform(0);
  const heatTint = vec3(float(1), oneMinus(heat.mul(0.45)), oneMinus(heat.mul(0.65)));
  const horizonU = uniform(pre(C.haze));

  /* ── THE STAND (ARENA-AAA §2, target `reports/arena/aaa/a2.jpg`) ─────────
     A full ring of tiers on all four sides, a thin cantilevered upper deck
     with a shadow line and a light cove under it, radial aisles and
     concourse mouths for scale, a portal on each ±z axis, sixteen coral
     banners hung from the deck at a steady rhythm, a far pavilion on −z and
     three layers of pale megastructure dissolving in the haze beyond, with
     mist pooling at their feet, low sun shafts over the roofline and dust
     drifting in them. Everything here is UNLIT and pre-toned (a lit riser
     faces away from the key and comes out 13 L under its tread — the brief's
     "seat striping"), fogged with the plaza it stands on, outside the shadow
     frustum, and outside `solids`: nothing of the stand can ever come
     between a camera and a fighter, so nothing of it fades.

     THE VALUES ARE A STEP UNDER THE SKY, not over it, and now they SPEND the
     range ARENA-AAA opens beyond the field. The bank runs L 80–85, the deck
     top 88.2 against a horizon sky of 84.3, its fascia 84.7 and its
     underside 72.9 — an 11.8 L line under the cantilever that is the frame's
     horizon event and its darkest non-fighter value, with the concourse
     mouths at 67.4 under it. Round 6 put all of that between 76.9 and 88.2
     and measured 44–58 % of every capture flat to within 0.5 L over a
     36 px tile; the target's own histogram is 15.7 L of standard deviation.

     GEOMETRY. One unit-depth extruded staircase, scaled along its run: four
     sides at `RING_AT` = 2.05·HALF, 11 steps of 1.0 × 1.6 m = 11 m of bank
     over 17.6 m of depth, then a 12 m deck slab from `DECK_IN` to `DECK_OUT`
     whose leading edge cantilevers 5.6 m past the bank's own top with a
     3.9 m gap under it. The corners are the two crossing staircases' MAX —
     which is exactly a mitre — with the ±x pair lifted 3 cm so the coplanar
     treads along the diagonal cannot z-fight. The ±z sides open on the notch
     axis (`GATE_HALF`), and the deck runs on over the gap as its lintel: a
     portal with a dark throat at the back, which is a2's gate and the
     vomitory ARENA-AAA asks for. Top of the deck 16.4 m. */
  /* The coral, and the only saturated thing in a hundred metres. It takes
     the plaza's FOG (a fully unfogged accent at 70 m held its full chroma
     against a ground 30–50 % dissolved around it and read as a sticker on
     the picture rather than as cloth in the place), it is double sided, so
     a banner is coral from inside the ring and from the gate, and it is
     slightly translucent (ARENA-AAA §2), so the bank's rows show through
     the cloth the way they do in `a2.jpg`.
     THE SWAY. `update()` ticks one clock and the cloth leans out of its own
     plane on a 11-second period, 0.22 m at the foot and nothing at the head
     — under a tenth of the banner's width, which is a hang and not a flag.
     Its phase comes from the banner's own world position, so sixteen of them
     never move as one wiper. Nothing else in the arena moves. */
  /* IT FADES, IT DOES NOT MIX (round-8). `fog: true` ran the cloth's linear
     fog toward the ground colour, and a saturated warm mixed into a cream
     loses chroma far faster than it loses hue: one frame carried the same
     object at S 0.591, S 0.569 and S 0.271 — the third a pale rectangle
     nobody would call the same banner, and the brief's §5 bans exactly that
     pink cast. A colour that THINS keeps its hue; a colour that mixes with
     cream turns pink. So the cloth is out of the fog and its ALPHA carries
     the distance instead: full at the fog's near plane, down to a 0.62 floor
     at its far one, which is the aerial perspective the round-6 note wanted
     (a fully opaque accent at 70 m read as a sticker on the picture) at a
     twelfth of the chroma spread. Across a whole frame the sixteen banners
     now sit inside ±0.04 S of each other. */
  const bannerMat = track(new THREE.MeshBasicNodeMaterial({
    color: pre(C.banner), fog: false, side: THREE.DoubleSide, transparent: true, opacity: 0.93,
  }));
  {
    const d = positionView.length();
    const near = float(RIG.fogNear), far = float(RIG.fogFar);
    const thin = smoothstep(near, far, d);
    bannerMat.opacityNode = mix(float(0.93), float(0.62), thin);
  }
  const GATE_HALF = 6;
  /* Across the portal's own width the seating drops to five rows and the
     tunnel starts behind them, so the axis reads as a way IN — a low
     terrace, a dark mouth at its back, the deck running over it as a lintel
     — rather than as a hole in the ring with sky behind it, or as the flat
     grey slab a plane across the gap read as at any value. */
  const GATE_STEPS = 5;
  /* The radial aisles: a 1.4 m dark slot every 9 m along the bank, drawn in
     the material from the tangential world coordinate rather than as
     geometry (52 slots would be 52 draws) and faded by its own filter width
     the way the plaza grid is, so the rhythm never aliases at 110 m on the
     far side of the ring.
     THE MITRE (round-7 finding). The tangential coordinate used to be
     `select(|x| > |z|, z, x)` — ONE choice for the whole ring — so where the
     two crossing banks meet on the diagonal each side drew the other's
     slots and the corner wore a zigzag V nobody designed. The two candidate
     rhythms are now BLENDED across the diagonal and both are faded out
     within ~10 m of the mitre, so the corner carries plain treads, which is
     what a real bowl does where its two straights meet.
     THE CONCOURSE MOUTHS: a 3.6 m dark opening every second aisle, on the
     top rows under the deck — the vomitories ARENA-AAA asks for "rhythmically
     along the tiers for scale". They are the deepest value in the world
     after the deck's soffit, and they are what makes a bank of steps read as
     a building with people-sized ways into it. */
  const AISLE_PITCH = 9.0, AISLE_W = 1.4;
  const VOM_PITCH = 18.0, VOM_W = 3.6;
  const SIDES = [
    { ry: 0, n: [1, 0], t: [0, 1], lift: 0.03 },
    { ry: Math.PI, n: [-1, 0], t: [0, -1], lift: 0.03 },
    { ry: -Math.PI / 2, n: [0, 1], t: [-1, 0], lift: 0 },
    { ry: Math.PI / 2, n: [0, -1], t: [1, 0], lift: 0 },
  ];
  /* WHAT A DEMOTION ACTUALLY SHEDS (RENDER-QUALITY §7, round-8). Until now
     `setQuality` did two things — the shadow map's size and the floor
     reflector — so a tier taken because the frame was too expensive bought
     AO, a reflection and a smaller map and nothing of the AAA layer
     ARENA-AAA §2 had just added. These four are the layer's whole run-time
     cost outside the ring itself, they are single meshes, and none of them
     carries an inch of the field: the dust (700 instanced sprites with a
     three-term drift), the sun-shaft quad, the mist cylinder and the two
     farther megastructure shells. `medium` drops the first two, `low` the
     rest bar the 120 m skyline, which is the silhouette the horizon needs.
     It is `visible = false` per tier: no rebuild, no dispose, no pipeline
     churn when the governor changes its mind back. */
  const shed = { dust: null, shafts: null, mist: null, megaFar: [] };

  const banner = new THREE.Group();
  banner.name = 'banners';
  group.add(banner);
  {
    const Pw = positionWorld;
    const ax = abs(Pw.x), az = abs(Pw.z);
    const rr = max(ax, az);                               // the square ring's radial coordinate
    /* One rhythm, measured along a given world axis, faded by its own filter
       width so it never aliases on the far side of the ring. */
    const rhythm = (tt, pitch, width, phase) => {
      const g = abs(fract(tt.div(pitch).add(phase)).sub(0.5)).mul(pitch);
      const aa = max(fwidth(g), float(1e-4));
      const w = float(width * 0.5);
      return oneMinus(smoothstep(w.sub(aa), w.add(aa), g)).mul(min(w.div(aa), float(1.0)));
    };
    /* 0 on a ±z side (the tangent is x), 1 on a ±x side (the tangent is z);
       the 5 m ramp across the diagonal is the blend, and `mitre` takes both
       to nothing where the two straights actually cross. */
    const sideBlend = smoothstep(-2.5, 2.5, ax.sub(az));
    const mitre = oneMinus(smoothstep(float(RING_AT - 13), float(RING_AT - 4), min(ax, az)));
    const aisleMask = mix(rhythm(Pw.x, AISLE_PITCH, AISLE_W, 0.0), rhythm(Pw.z, AISLE_PITCH, AISLE_W, 0.0), sideBlend).mul(mitre);
    /* THE MOUTH'S HEAD AND SILL ARE LEVEL, not radial. Windowed on `rr` the
       opening climbed the stair with it and printed a dark zigzag; windowed
       on world HEIGHT it is a 4 m rectangle cut into the bank at the height
       a concourse would be, with only its jambs following the treads. */
    const vomBand = smoothstep(PLAZA_Y + 3.2, PLAZA_Y + 3.8, Pw.y)
      .mul(oneMinus(smoothstep(PLAZA_Y + 6.4, PLAZA_Y + 7.0, Pw.y)))
      .mul(oneMinus(smoothstep(DECK_IN - 1.5, DECK_IN + 0.5, rr)));
    /* … and only on the RISERS. Painted on the treads too, a mouth spanned
       whole steps and printed a stepped dent from a high camera — a hole in
       the geometry, not a way in. On the vertical faces alone it is a dark
       rectangle from every camera at seat height (which is every camera the
       game uses) and it disappears from directly overhead, exactly as a
       real vomitory does. */
    const onRiser = oneMinus(smoothstep(0.35, 0.75, normalWorld.y));
    const vomMask = mix(rhythm(Pw.x, VOM_PITCH, VOM_W, 0.5), rhythm(Pw.z, VOM_PITCH, VOM_W, 0.5), sideBlend)
      .mul(mitre).mul(vomBand).mul(onRiser);
    /* THE LIT HEAD (round-8). A flat dark rectangle is a swatch; an opening
       has a lintel over it and a reveal inside it. The head is a 0.5 m band
       of `vomLintel` immediately above the mouth, one metre wider than the
       jambs so it reads as a beam laid over them, and it lives on the same
       rhythm, so it can never appear where a mouth does not. The reveal is
       the 2.5 L fall from the sill to the soffit, below. */
    const lintelBand = smoothstep(PLAZA_Y + 6.9, PLAZA_Y + 7.1, Pw.y)
      .mul(oneMinus(smoothstep(PLAZA_Y + 7.4, PLAZA_Y + 7.6, Pw.y)))
      .mul(oneMinus(smoothstep(DECK_IN - 1.5, DECK_IN + 0.5, rr)));
    const lintelMask = mix(rhythm(Pw.x, VOM_PITCH, VOM_W + 1.0, 0.5), rhythm(Pw.z, VOM_PITCH, VOM_W + 1.0, 0.5), sideBlend)
      .mul(mitre).mul(lintelBand).mul(onRiser);
    /* 0 at the sill, 1 at the soffit: the light that reaches a concourse
       mouth comes off its own floor, so a real one is brightest at its
       bottom edge and darkest under its head. 2.5 L across the opening —
       enough that the eye reads depth, small enough that the mouth stays
       one value at 100 m. */
    const vomDepth = smoothstep(PLAZA_Y + 3.6, PLAZA_Y + 6.5, Pw.y);
    /* THE STAND'S OWN GRAIN (round-9b). The field's plaster grain (`grain`,
       0.6 and 2.5 cycles per metre) is a NEAR-field texture: at 90 m its
       finer octave is a third of a pixel and it would only alias, so the
       bank and the deck carried none — and until this round they did not
       need one, because the GTAO's broken distance fade was printing its
       own noise over the whole stand. With the fade fixed the architecture
       came out as flat paint: 39 % of the frame's 36-px tiles measured
       under 0.5 L of spread. This is the same idea at the stand's own
       scale — 0.22 and 0.9 cycles per metre, which is 14–80 px per period
       at every distance the ring is seen from, so it is a mottle and never
       a shimmer — at ±6.5 % of radiance, ≈ ±1 L. Plaster, not detail. */
    const standGrain = typeof mx_noise_float === 'function'
      ? float(1.0)
        .add(mx_noise_float(positionWorld.mul(0.22)).mul(0.040))
        .add(mx_noise_float(positionWorld.mul(0.90)).mul(0.025))
      : null;
    const stoned = (c) => (standGrain ? c.mul(standGrain) : c);
    const bankMat = track(new THREE.MeshBasicNodeMaterial({ fog: true }));
    {
      const tone = mix(color(pre(C.tierRiser)), color(pre(C.tier)), smoothstep(0.5, 0.9, normalWorld.y));
      const withAisles = mix(tone, color(pre(C.tierAisle)), aisleMask);
      /* The cantilever's shadow: the back rows lie under the deck, so they
         run into its underside value over 6.5 m. Unlit geometry takes no
         real shadow, and this band IS the deck's shadow line — the thing
         that makes a roof read as a roof from every camera inside the ring. */
      /* 6 m of ramp, not 9: at 9 the band swallowed eight of the eleven rows
         and the whole bank measured a median L 73 — the tiers are meant to
         hold L 80–88 and the shade is meant to be the top third of the bowl,
         which is where a2 puts it. */
      const shaded = mix(withAisles, color(pre(C.deckUnder)), smoothstep(DECK_IN - 6.0, DECK_IN - 0.5, rr));
      const headed = mix(shaded, color(pre(C.vomLintel)), lintelMask);
      const throat = mix(color(pre(C.vomitoryMouth)), color(pre(C.vomitory)), vomDepth);
      bankMat.colorNode = stoned(mix(headed, throat, vomMask)).mul(heatTint);
    }
    const deckMat = track(new THREE.MeshBasicNodeMaterial({ fog: true }));
    {
      /* THREE VALUES AND A COVE. The box's normals are ±1 or 0, so these
         ramps are steps: the underside at L 72.9, a 0.9 m light cove along
         its leading edge at 79.6 (ARENA-AAA's "faint underside light
         strip" — never brighter than the fascia, so it reads as light
         caught in a soffit and not as a lamp), the fascia at 84.7 and the
         top at 88.2 against the sky. */
      const rrD = max(abs(positionWorld.x), abs(positionWorld.z));
      const cove = smoothstep(DECK_IN - 0.2, DECK_IN + 0.3, rrD).mul(oneMinus(smoothstep(DECK_IN + 0.9, DECK_IN + 1.5, rrD)));
      const under = mix(color(pre(C.deckUnder)), color(pre(C.deckStrip)), cove);
      const lower = mix(under, color(pre(C.deckFascia)), smoothstep(-0.55, -0.15, normalWorld.y));
      deckMat.colorNode = stoned(mix(lower, color(pre(C.deckTop)), smoothstep(0.15, 0.55, normalWorld.y))).mul(heatTint);
    }
    /* The portal: a box open toward the field and seen from INSIDE (BackSide
       culls exactly the face the camera would look through), running from the
       terrace's top step back to the bank's rear line under the deck's own
       soffit. Its colour recedes with depth, so the tunnel darkens away from
       the mouth the way a real one does and the gap reads as an opening
       rather than as a rectangle of some value. */
    const GATE_MOUTH = RING_AT + GATE_STEPS * BANK_RUN;
    const vomMat = track(new THREE.MeshBasicNodeMaterial({ fog: true, side: THREE.BackSide }));
    {
      /* THE THROAT IS A PLACE, NOT A SCREEN. One value across the back wall
         read as a grey rectangle hung in the gap whatever the value was —
         the failure the flat plane had. Three cheap terms fix it: the depth
         gradient it already had, a fall with HEIGHT (a real tunnel is
         brighter near its floor, where the light bounces, and darkest in
         its soffit), and the concourse line the terrace's top step carries
         on into the tunnel — a 0.5 m band at the height the seating ends. */
      const depth = smoothstep(GATE_MOUTH, BANK_BACK, max(abs(positionWorld.x), abs(positionWorld.z)));
      const byDepth = mix(color(pre(C.vomitoryMouth)), color(pre(C.vomitory)), depth);
      const byHeight = mix(float(1.06), float(0.88), smoothstep(PLAZA_Y + 1.0, DECK_Y, positionWorld.y));
      const line = oneMinus(smoothstep(0.0, 0.55, abs(positionWorld.y.sub(PLAZA_Y + GATE_STEPS * BANK_RISE))));
      vomMat.colorNode = mix(byDepth.mul(byHeight), color(pre(C.vomitoryMouth)), line.mul(0.7)).mul(heatTint);
    }

    const prof = new THREE.Shape();
    prof.moveTo(0, 0);
    for (let i = 0; i < BANK_STEPS; i++) {
      prof.lineTo(i * BANK_RUN, (i + 1) * BANK_RISE);
      prof.lineTo((i + 1) * BANK_RUN, (i + 1) * BANK_RISE);
    }
    prof.lineTo(BANK_STEPS * BANK_RUN, 0);
    prof.closePath();
    const bankGeo = track(new THREE.ExtrudeGeometry(prof, { depth: 1, bevelEnabled: false }));
    const gprof = new THREE.Shape();
    gprof.moveTo(0, 0);
    for (let i = 0; i < GATE_STEPS; i++) {
      gprof.lineTo(i * BANK_RUN, (i + 1) * BANK_RISE);
      gprof.lineTo((i + 1) * BANK_RUN, (i + 1) * BANK_RISE);
    }
    gprof.lineTo(GATE_STEPS * BANK_RUN, 0);
    gprof.closePath();
    const gateBankGeo = track(new THREE.ExtrudeGeometry(gprof, { depth: 1, bevelEnabled: false }));
    const deckGeo = track(new THREE.BoxGeometry(DECK_OUT - DECK_IN, DECK_H, 1));
    const gateGeo = track(new THREE.BoxGeometry(GATE_HALF * 2, 8.5, BANK_BACK - GATE_MOUTH));
    const lintelGeo = track(new THREE.BoxGeometry(GATE_HALF * 2 + 0.6, 2.4, 1.8));
    /* THE BANNER, sized to the frame and not to the wall (round-7 blocker).
       At 3 × 11.3 m hung from `DECK_Y` its head was above the play cameras'
       ceiling in every fight framing and the capture showed two coral
       rectangles pinned to the top bezel with no hanging point — the exact
       read the round-5 plinth version was rejected for. It now hangs from
       0.3 m under the deck's line to 1.0 m over the plaza, so its head and
       the deck's leading edge project within a tenth of a degree of each
       other from every camera inside the ring (the banner is nearer and
       lower; over the eye, nearer is higher, and the two cancel) and the
       cloth reads as hung FROM the cantilever, while its foot is seated on
       the bank's first row. 4 × 10 segments so the sway is a curve. */
    const BANNER_TOP = DECK_Y - 0.3, BANNER_FOOT = PLAZA_Y + 1.0;
    const BANNER_H = BANNER_TOP - BANNER_FOOT;
    const bannerGeo = track(new THREE.PlaneGeometry(3.0, BANNER_H, 4, 10));
    /* THE SWAY, WRITTEN FOR AN INSTANCED CLOTH (round-8). three's node
       material assigns the instance matrix INTO `positionLocal` and only
       then evaluates `positionNode`, so inside this node `positionLocal` is
       already the instanced position in the group's space — and the group is
       the scene's identity, so it is the world position. Two consequences,
       both used here: the drop and the phase read world Y and world X+Z (no
       `modelWorldMatrix`, which on an `InstancedMesh` is the one matrix all
       sixteen share and would have swung the whole ring as one wiper), and
       the lean has to be turned into the cloth's own plane by hand — a
       banner on a ±x side hangs across z and leans along z, one on a ±z side
       the other way. `max(min(…))` rather than `clamp` so the node set this
       file destructures stays the node set it uses. */
    if (typeof TSL.sin === 'function') {
      const P = positionLocal;
      const drop = min(max(float(BANNER_TOP).sub(P.y).div(BANNER_H), float(0)), float(1)); // 0 at the head, 1 at the foot
      const phase = P.x.add(P.z).mul(0.09);
      const wave = TSL.sin(clockU.mul(0.55).add(phase).add(P.y.mul(0.20))).mul(drop.mul(drop)).mul(0.22);
      const lean = select(abs(P.x).greaterThan(abs(P.z)), vec3(0, 0, 1), vec3(1, 0, 0));
      bannerMat.positionNode = P.add(lean.mul(wave));
    }

    /* ONE DRAW A FAMILY (ARENA-AAA §2's budget, round-8). The ring used to be
       32 separate `Mesh` on shared geometry and shared material — six bank
       runs, four deck slabs, two portal throats, two terraces, two lintels
       and sixteen banners — every one of them `frustumCulled = false`, so
       thirty-two draws were submitted whatever the camera looked at. Each
       family differs only by a rotation, a one-axis scale and a translation,
       which is exactly what `setMatrixAt` carries, so they collapse to six
       `InstancedMesh` with no change to a single pixel: the shading nodes all
       read `positionWorld`/`normalWorld`, and three's instance node rewrites
       both before the material's own graph runs (its `transformNormal`
       divides by the column norms, so the banks' scaled extrusion axis keeps
       its normals). */
    const INST = { bank: [], deck: [], throat: [], terrace: [], lintel: [], banner: [] };
    const Q4 = new THREE.Quaternion();
    const E4 = new THREE.Euler(), V4 = new THREE.Vector3(), S4 = new THREE.Vector3();
    const place = (into, { x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1 }) => {
      E4.set(0, ry, 0);
      into.push(new THREE.Matrix4().compose(V4.set(x, y, z), Q4.setFromEuler(E4), S4.set(sx, sy, sz)));
    };
    const instance = (geo, mat, list, name, order) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = false; im.receiveShadow = false;
      im.frustumCulled = false;
      im.name = name;
      if (order !== undefined) im.renderOrder = order;
      /* an `InstancedMesh` owns a buffer a `Mesh` does not: `dispose()` frees
         the instance matrix, so it belongs in `disposables` with the
         geometry and the material */
      track(im);
      return im;
    };

    for (const sd of SIDES) {
      const onZ = sd.n[0] === 0;
      const runs = onZ ? [[-BANK_BACK, -GATE_HALF], [GATE_HALF, BANK_BACK]] : [[-BANK_BACK, BANK_BACK]];
      for (const [u0, u1] of runs) {
        place(INST.bank, {
          x: sd.n[0] * RING_AT + sd.t[0] * u0, y: PLAZA_Y + sd.lift, z: sd.n[1] * RING_AT + sd.t[1] * u0,
          ry: sd.ry, sz: u1 - u0,
        });
      }
      /* The deck runs the full side, over the gate as its lintel. */
      {
        const mid = (DECK_IN + DECK_OUT) / 2;
        place(INST.deck, {
          x: sd.n[0] * mid, y: DECK_Y + DECK_H / 2 + sd.lift, z: sd.n[1] * mid,
          ry: sd.ry, sz: DECK_OUT * 2,
        });
      }
      /* The portal's throat, so the gap is an opening and not a hole in the
         world with sky behind it, its terrace, and THE LINTEL: with the
         throat open to the deck's own height the gap read as a rectangle of
         some value hung in the ring — a screen, which is the failure a flat
         plane across the gap had. A 2.4 m beam across the top, carrying the
         deck's fascia value, turns it into a door in a wall: the opening is
         4.5 m of dark under a lit edge. */
      if (onZ) {
        place(INST.throat, { y: PLAZA_Y + 4.25, z: sd.n[1] * (GATE_MOUTH + BANK_BACK) / 2 });
        place(INST.terrace, {
          x: sd.t[0] * -GATE_HALF, y: PLAZA_Y, z: sd.n[1] * RING_AT + sd.t[1] * -GATE_HALF,
          ry: sd.ry, sz: GATE_HALF * 2,
        });
        place(INST.lintel, { y: PLAZA_Y + 8.5 + 1.2, z: sd.n[1] * (GATE_MOUTH + 0.9) });
      }
      /* FOUR BANNERS A SIDE at ±9 and ±27 m off each axis — sixteen around
         the ring, one every 18 m, which is a2's rhythm and the reason its
         stand reads as a stadium and not as a bank of steps. None stands ON
         a fighting axis (the ±z pair flanks the gate at ±9), none floats,
         and none is cut: they are 2.6° wide and 9.4° tall from the fight
         camera, ~40 px by 200. */
      for (const u of [-27, -9, 9, 27]) {
        const R = RING_AT + 1;
        place(INST.banner, {
          x: sd.n[0] * R + sd.t[0] * u, y: (BANNER_TOP + BANNER_FOOT) / 2, z: sd.n[1] * R + sd.t[1] * u,
          ry: sd.ry + Math.PI / 2,
        });
      }
    }
    for (const [geo, mat, list, name, parent] of [
      [bankGeo, bankMat, INST.bank, 'tier-bank', group],
      [deckGeo, deckMat, INST.deck, 'tier-deck', group],
      [gateGeo, vomMat, INST.throat, 'tier-gate', group],
      [gateBankGeo, bankMat, INST.terrace, 'tier-gate-terrace', group],
      [lintelGeo, deckMat, INST.lintel, 'tier-gate-lintel', group],
      [bannerGeo, bannerMat, INST.banner, 'banners', banner],
    ]) {
      const im = instance(geo, mat, list, name);
      if (im) parent.add(im);
    }
    /* The projection probe on the stand page reads the banners' placements
       off this list rather than off sixteen `matrixWorld`s. */
    banner.userData.placements = INST.banner;
    banner.userData.size = { w: 3.0, h: BANNER_H };

    /* THE PLAZA'S LOW ELEMENTS (ARENA-AAA §2: "seams, a coping light line, a
       few low sculptural elements — never taller than 0.5 m within 0.4·HALF
       of the wall"). Eight 0.42 m plinths of the plaza's own plaster on the
       band between the apron and the ring, which was 20 m of frame with
       nothing in it: they are LIT, they are inside the key's ±30 m shadow
       frustum, and each throws a 0.55 m shadow — the band's only detail,
       and the only thing in the picture that gives the plaza a size. Two
       fingers of the sun's own direction so they read as laid, not
       scattered. Nothing is over 0.5 m and nothing stands on a fighting
       axis, so nothing can come between a camera and a fighter (from the
       lowest camera the sight line clears the coping at 7 m). */
    {
      const H = 0.42;
      const plinthMat = std(C.plaza);
      const slabs = [
        [24.5, 6, -13, 0], [24.5, 6, 9, 0], [27.5, 2.6, -25, 0],
        [-24.5, 6, 15, 0], [-27.5, 2.6, -3, 0],
        [-13, 6, 24.5, 1], [11, 6, 24.5, 1], [-24, 3.2, -25.5, 1],
      ];
      /* They CAST NOTHING: the plaza is not a shadow receiver (a receiver
         that size printed its own triangulation as a dotted hairline in the
         VSM map), so a 0.42 m box's 0.55 m shadow would have nowhere to
         land — and putting eight boxes into the key's map for nothing is
         eight draws a frame. They read by their own two values, which at
         this height is all a 0.55 m shadow would have added. */
      for (const [x, len, z, along] of slabs) {
        const m = addMesh(new THREE.BoxGeometry(along ? len : 1.6, H, along ? 1.6 : len),
          plinthMat, { x, y: PLAZA_Y + H / 2, z, cast: false, receive: false });
        m.name = 'plaza-plinth';
      }
    }

    /* THE FAR PAVILION on −z (ARENA-AAA §2, a2's gate): a group of pale
       masses on the fighting axis 20 m BEHIND the stand's back line, so its
       feet are hidden by the deck and only its heads stand over the
       roofline — a far gate, not a building behind the fighters. Two
       values, split by which way a face turns to the key, exactly as the
       blocks are, and it is unlit so no ±13 L riser rhythm can appear on
       it. Nothing here is inside 2·HALF, nothing moves, and from the fight
       cameras it is 2–4 L under the sky it stands in. */
    {
      const gateMat = track(new THREE.MeshBasicNodeMaterial({ fog: true, transparent: true, depthWrite: false }));
      {
        const twoValue = mix(color(pre(C.gateShade)), color(pre(C.gate)),
          smoothstep(0.0, 0.35, normalWorld.dot(keyN)));
        /* A HEIGHT RAMP AND A MOTTLE, so the mass is not a fill. The review
           measured sd 0.48 over the near slab — a flat rectangle at 100 m.
           A real far building is palest where the mist stands at its foot
           and deepest at its head; ±1.2 % of low-frequency noise on top of
           that is the difference between a silhouette and a swatch. */
        const foot = oneMinus(smoothstep(float(PLAZA_Y + 2.0), float(PLAZA_Y + 22.0), positionWorld.y));
        const lifted = twoValue.mul(float(1.0).add(foot.mul(0.055)));
        const mottled = mx_noise_float === undefined || typeof mx_noise_float !== 'function'
          ? lifted : lifted.mul(float(1.0).add(mx_noise_float(positionWorld.mul(0.09)).mul(0.012)));
        gateMat.colorNode = mottled.mul(heatTint);
        /* AND IT THINS. Fog alone left it 20 % dissolved at this range, so
           its roofline crossed 6.2 L in two pixels against the sky. On its
           own alpha as well it is 45–60 % dissolved, no edge in it crosses
           3 L, and it still reads as the one mass on the fighting axis. */
        gateMat.opacityNode = mix(float(0.80), float(0.42),
          smoothstep(float(RIG.fogNear), float(RIG.fogFar), positionView.length()));
      }
      const Z = -(BANK_BACK + 20);
      const masses = [
        [0, 9.5, 26, 19, 9], [-17, 6.5, 8, 13, 7], [17, 6.5, 8, 13, 7],
        [-5.5, 13, 2.2, 26, 2.2], [5.5, 13, 2.2, 26, 2.2],
        [-11, 11, 1.8, 22, 1.8], [11, 11, 1.8, 22, 1.8],
      ];
      for (const [x, y, w, h, d] of masses) {
        const m = addMesh(new THREE.BoxGeometry(w, h, d), gateMat,
          { x, y: PLAZA_Y + y, z: Z, receive: false });
        m.castShadow = false;
        m.name = 'far-gate';
      }
    }

    /* THE MEGASTRUCTURE (a1): three open cylinders of pale skyline, 120 m,
       260 m and 430 m out, drawn as a silhouette alpha over the sky and
       66–86 % dissolved — never sharp, never lit, no geometry per tower.
       The skyline is a smooth field around the ring quantised into cells of
       varying width (so the towers have vertical edges and no two are the
       same), each cell's height from a second noise; one horizontal line at
       0.62 of a tower's height reads as the truss a1 hangs between them.
       Their feet sit under the stand's roofline from every camera, so no
       layer shows a base. Round 6 drew them at 15–26 % of an L 69.9 grey
       over an L 94.4 sky and every capture measured the band flat to 1.5 L:
       a silhouette that dissolves has to be a VALUE first. */
    /* ROUND-9. Three faults, all measurable. (1) The near layer at 0.34 of an
       L 65.6 grey landed 6.2 L under the haze beside it — a cardboard cut-out
       where a1 has a dissolve — while the far layer at 0.09 measured 0.02 L
       from its own sky, i.e. absent: the alphas are now 0.19 / 0.155 / 0.13,
       which puts every layer 2.5–4 L under its local sky, and each one thins
       further with its own fogged depth so the far side of a shell is paler
       than the near side of it. (2) `around.mul(30).floor()` is an
       UNFILTERED step, so every cell boundary was a hard vertical edge in
       screen space and the whole skyline wore 1–2 px staircase jaggies; the
       two cells either side of a boundary are now blended across one pixel
       of the cell coordinate's own `fwidth`, which is what antialiasing a
       procedural step means. (3) The truss sat at 0.62 of EVERY tower's own
       height, so thirty cells drew one ruled horizontal across the skyline;
       its height is now the cell's own `h01`, 0.46–0.76. */
    if (typeof mx_noise_float === 'function') {
      for (const [R, alpha, order, seed] of [[430, 0.13, -8, 11.0], [260, 0.155, -7, 5.0], [120, 0.19, -6, 2.0]]) {
        const m = track(new THREE.MeshBasicNodeMaterial({
          side: THREE.BackSide, fog: false, transparent: true, depthWrite: false,
        }));
        const P = positionWorld;
        const around = mx_noise_float(vec3(P.x, P.z, seed).mul(0.010));
        const cell = around.mul(30.0);
        const cellId = cell.floor();
        const f = cell.sub(cellId);
        const aa = max(fwidth(cell), float(1e-4));
        /* one cell's silhouette and its truss, as a function of the cell id */
        const tower = (id) => {
          const h01 = mx_noise_float(vec3(id.mul(3.13), id.mul(-1.77), seed)).mul(0.5).add(0.5);
          const top = float(R * 0.17).add(h01.mul(R * 0.15));
          const body = oneMinus(smoothstep(top.sub(2.5), top.add(2.5), P.y));
          const trussY = top.mul(float(0.46).add(h01.mul(0.30)));
          const truss = oneMinus(smoothstep(float(0.0), float(R * 0.012), abs(P.y.sub(trussY))));
          return body.mul(float(1.0).add(truss.mul(0.25)));
        };
        /* the neighbour across the nearest boundary, blended over one pixel:
           at the boundary itself the two towers weigh a half each, one pixel
           inside the cell its own silhouette is all that is left */
        const nb = select(f.lessThan(0.5), cellId.sub(1.0), cellId.add(1.0));
        const dEdge = min(f, oneMinus(f));
        const w = smoothstep(float(0.0), aa.mul(0.5), dEdge).mul(0.5).add(0.5);
        const silhouette = mix(tower(nb), tower(cellId), w);
        /* aerial perspective INSIDE the shell: the far wall of a 120 m
           cylinder is 240 m from a camera at its centre and the near wall
           120, and a1's layers pale with exactly that. */
        const thin = mix(float(1.0), float(0.68), smoothstep(float(RIG.fogNear), float(RIG.fogFar), positionView.length()));
        m.colorNode = color(pre(C.mega)).mul(heatTint);
        m.opacityNode = silhouette.mul(float(alpha)).mul(thin);
        const mesh = addMesh(new THREE.CylinderGeometry(R, R, R * 0.42, 96, 1, true), m,
          { y: R * 0.21, receive: false, order });
        mesh.frustumCulled = false;
        mesh.name = `megastructure-${R}`;
        if (R > 120) shed.megaFar.push(mesh);
      }
    }

    /* MIST, pooling beyond the walls (ARENA-AAA §2). One cylinder at 3.6·HALF
       — beyond the deck's outer edge, in front of the nearest megastructure
       — carrying a band of the sky's own horizon value that is dense at the
       plaza and gone by 9 m. It is what puts the stand's back line, the far
       pavilion's feet and the skyline's base into the same haze, and it is
       the only thing in the world allowed to lift a value: 0.42 at its
       densest, over a sky that is already the brightest plane. It cannot
       touch the field (it stands 72 m out and the fog inside it is the
       scene's own) and it takes the sudden-death tint with everything else. */
    {
      const R = 3.6 * HALF, H = 9.0;
      const m = track(new THREE.MeshBasicNodeMaterial({
        side: THREE.BackSide, fog: false, transparent: true, depthWrite: false,
      }));
      m.colorNode = mix(color(pre(C.haze)), color(pre(C.zenith)), 0.35).mul(heatTint);
      m.opacityNode = oneMinus(smoothstep(float(PLAZA_Y + 1.0), float(PLAZA_Y + H), positionWorld.y)).mul(0.42);
      const mesh = addMesh(new THREE.CylinderGeometry(R, R, H * 1.6, 64, 1, true), m,
        { y: PLAZA_Y + H * 0.3, receive: false, order: 2 });
      mesh.frustumCulled = false;
      mesh.name = 'mist';
      shed.mist = mesh;
    }

    /* SUN SHAFTS (ARENA-AAA §2, "long low sun shafts — cheap"). ONE quad,
       82 m out in the key's own quarter, standing in the vertical plane that
       contains the sun: three soft bands drawn ACROSS it at the sun's own
       37° pitch, so they read as light coming over the far roofline. It is
       behind the whole stand, so the ring occludes it wherever the ring is,
       and it never touches the plaza (the bands are gone below 11 m). The
       lift is ≤ 3 L over the sky it crosses and it cannot clip: the mix is
       toward L 97 at 0.20, and the sky under it is L 84–90. */
    {
      const m = track(new THREE.MeshBasicNodeMaterial({
        fog: false, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      /* the sun's direction inside the quad's own plane: 0.802 along its x,
         −0.597 up; `s` is the coordinate ACROSS the beam */
      const lx = positionLocal.x, ly = positionLocal.y;
      const s = lx.mul(0.5971).add(ly.mul(0.8021));
      const beam = (c, hw) => oneMinus(smoothstep(float(hw * 0.3), float(hw), abs(s.sub(c))));
      const bands = max(max(beam(-33, 9.0), beam(6, 13.0)), beam(36, 7.0));
      const height = smoothstep(float(11), float(19), positionWorld.y)
        .mul(oneMinus(smoothstep(float(40), float(54), positionWorld.y)));
      const ends = oneMinus(smoothstep(float(58), float(84), abs(lx)));
      m.colorNode = color(pre(0xFBF6EE)).mul(heatTint);
      m.opacityNode = bands.mul(height).mul(ends).mul(0.13);
      const mesh = addMesh(new THREE.PlaneGeometry(180, 76), m,
        { x: -58, y: 26, z: -58, ry: Math.PI / 4, receive: false, order: 1 });
      mesh.frustumCulled = false;
      mesh.name = 'sun-shafts';
      shed.shafts = mesh;
    }

    /* DUST IN THE LIGHT (ARENA-AAA §2). 700 billboarded motes in a shell
       from 1.3·HALF to 3.9·HALF and 1–15 m over the plaza — never over the
       field, so nothing of it can ever stand between a camera and a
       fighter — drifting on the same clock as the banners, ~2 px at the
       fight camera and 0.30 at their brightest. A `SpriteNodeMaterial` on an
       `InstancedMesh` is the documented sized-point path on the WebGPU
       backend (a `Points` primitive is one pixel there whatever the DPR).
       The whole thing is guarded: a backend that cannot build it loses the
       dust and keeps the arena. */
    try {
      /* WebGPU only. On the WebGL2 fallback three's node path put the
         instanced sprite's per-instance data into a VERTEX uniform block and
         the driver rejected it — "NodeBuffer … exceeds
         GL_MAX_UNIFORM_BLOCK_SIZE (16384)" — one shader error per boot on
         the one backend that can least afford the frame. The fallback is
         `low`: no AO, no reflection, and now no dust. */
      if (!isWebGL && typeof TSL.attribute === 'function' && THREE.SpriteNodeMaterial && typeof TSL.sin === 'function') {
        const N = 700;
        const seedRand = (() => { let x = 0x2F6E2B1; return () => ((x = (x * 1103515245 + 12345) & 0x7FFFFFFF) / 0x7FFFFFFF); })();
        const data = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) {
          const a = seedRand() * Math.PI * 2;
          /* 2.4·HALF, not 1.3 (round-9): the field's corner reaches 28.3 m
             and the shell started at 26, so from any elevated orbit its near
             arc projected straight over the pit and one mote was caught
             sitting on a cover block's flank in `stand-default.png`. At 48 m
             the whole cloud is outside the field's own diagonal with 20 m to
             spare, and ARENA-BRIEF §5's "nothing decorative inside 2·HALF"
             holds by construction rather than by measurement. */
          const r = 2.4 * HALF + seedRand() ** 0.7 * 1.5 * HALF;
          data[i * 4] = Math.cos(a) * r;
          data[i * 4 + 1] = PLAZA_Y + 1.0 + seedRand() ** 1.6 * 14;
          data[i * 4 + 2] = Math.sin(a) * r;
          data[i * 4 + 3] = seedRand() * 62.8;
        }
        const geo = track(new THREE.PlaneGeometry(1, 1));
        geo.setAttribute('mote', new THREE.InstancedBufferAttribute(data, 4));
        const m = track(new THREE.SpriteNodeMaterial({
          transparent: true, depthWrite: false, fog: false, sizeAttenuation: true,
        }));
        const mote = TSL.attribute('mote', 'vec4');
        const ph = mote.w;
        const drift = vec3(
          TSL.sin(clockU.mul(0.21).add(ph)).mul(0.9),
          TSL.sin(clockU.mul(0.13).add(ph.mul(1.7))).mul(0.7),
          TSL.sin(clockU.mul(0.17).add(ph.mul(0.6)).add(1.6)).mul(0.9),
        );
        m.positionNode = mote.xyz.add(drift);
        m.scaleNode = float(0.085);
        m.colorNode = color(pre(C.coping)).mul(heatTint);
        /* round, not square, and dimmer the higher it drifts — dust lives
           where the light and the ground are. The mask is read from `uv`,
           not from `positionLocal`: on the sprite path the local position IS
           the mote's centre (the quad's corners come from
           `positionGeometry`), so a length on it would measure the shell's
           radius and switch the whole cloud off. */
        const d = TSL.uv().sub(0.5).length();
        m.opacityNode = oneMinus(smoothstep(0.28, 0.5, d))
          .mul(oneMinus(smoothstep(float(PLAZA_Y + 6), float(PLAZA_Y + 15), mote.y)))
          .mul(0.30);
        const dust = new THREE.InstancedMesh(geo, m, N);
        /* `InstancedMesh` allocates its matrices as zeros; the sprite path
           never reads them, but three's instance node does. Identity. */
        const eye = new THREE.Matrix4();
        for (let i = 0; i < N; i++) dust.setMatrixAt(i, eye);
        dust.instanceMatrix.needsUpdate = true;
        dust.frustumCulled = false;
        dust.renderOrder = 1;
        dust.name = 'dust';
        shed.dust = dust;
        group.add(dust);
      }
    } catch (e) {
      console.warn(`environment: dust unavailable (${e.message})`);
    }
  }

  /* THE PLANET, 12° across (was 7.8), 30° right of −z and 5.5° up, with its
     lower limb BEHIND the stand's roofline from every camera that sees it —
     a planet in front of architecture reads as distance, a planet alone in
     an empty sky reads as a blob, and the round-5 disc read 1.7–2.0 L over
     more than half its face against the sky beside it: a lens smudge. It is
     a BODY UNDER THE SAME SUN: the key lights its upper-left and leaves its
     lower-right in shade, as c1's is. The terminator is a chord at 0.71 R
     (the disc stands 45° off the anti-solar direction) and its lower half is
     BEHIND the roofline, so `smoothstep(−0.25, 1.05, kd)` spends its ramp on
     the part of the disc a camera can actually see — 0.99 at the sub-solar
     point, 0.79 at the centre, 0.27 at the lowest visible edge, 0 well
     inside the hidden shade — and never draws a rim. At `smoothstep(−0.75,
     1.15)` the whole ramp was correct for the FULL sphere and the visible
     three quarters of it spanned 2.9 L. The pair under it is four times the old range
     (face L 84.7, limb L 74.0) and the aerial-perspective mix into the fog
     is HALVED, 0.25 → 0.12, so the gradient survives it: rendered, the
     sunward third lands ≈ 5 L under the sky beside it, the centre ≈ 6, the
     shaded limb ≈ 11–12 — 9 L across the disc, all of it a slow roll. A
     view-ray limb darkening of 5 % over the outer third rounds it and a
     silhouette fade over the outer 9 % of the radius keeps it edge-free.
     30° right of −z is where no scripted camera can centre it: the
     establishing and VS framings both look 7–13° right of the axis, so the
     disc lands in the upper-right third of both, where c1 has it. No
     texture, no depth write (the AO pass reads the far plane there and
     prints no grain on the limb); inside the dome (300 m), beyond the fog,
     which it ignores. */
  const PLANET_HAZE = 0.12;
  /* ROUND-9, the blocker. The disc measured L 84.0 at its core against a sky
     of 84.3 beside it and 88.1 above it — 0.2 L UNDER its own sky, i.e. a
     hole and not a body — with a 3.1 L dark band across its face where the
     nearest megastructure shell drew straight over it (both layers write no
     depth, and the shell was at renderOrder −1 against the planet's −2, so
     the near skyline composited last). Three moves. The mega shells go to
     −8/−7/−6 and the two bodies to −4/−3, so nothing beyond the stand can
     ever wash the disc again; the planet's elevation goes 5.5° → 8.5° and
     its half-angle 6.0° → 7.5°, which lifts it clear of the near towers'
     20–38 m band and puts a third of it in the top quarter of the frame
     that measured 2.1 L of range; and the pair is re-cut so the disc reads
     as a BODY UNDER ITS SKY — the lead's contract, a core 3 L under the sky
     beside it with a faint limb ring — instead of trying and failing to
     stand over it. */
  const SKY_AZ = 30, SKY_EL = 8.5;
  const planetMat = track(new THREE.MeshBasicNodeMaterial({ fog: false, transparent: true, depthWrite: false }));
  /* The two sky bodies share their shading: a soft terminator across the
     face, a view-ray limb roll, an optional limb ring and a silhouette fade,
     differing only in the pair of values, the ramp, the size and where they
     hang. */
  const skyBody = (mat, faceHex, limbHex, hazeK, {
    term = [-0.8, 1.4], fade = 0.12, ring = 0, tex = 0,
  } = {}) => {
    const face = color(pre(faceHex)), limb = color(pre(limbHex));
    /* The limb is measured against the VIEW RAY, not the camera axis: for a
       sphere 30° off-axis `normalView.z` is still ~0.45 at the silhouette,
       so a darkening on it came out one-sided. `dot(normal, toEye)` is 0 all
       the way round. */
    const nz = abs(normalView.dot(positionViewDirection));
    const kd = normalWorld.dot(vec3(...RIG.keyDir).normalize());
    /* THE TERMINATOR IS A CHORD, NOT A SEAM. At −0.45 → 1.15 the ramp was
       still steep enough that at 170 px across the disc it printed a hard
       vertical edge down the middle at 14× contrast; over −0.8 → 1.4 the
       same pair reads 0.91 at the sub-solar point, 0.77 at the centre and
       0.24 at the lowest visible edge — ~9 L across the visible face, all of
       it a roll. The moon takes a flatter ramp still (it is 3° wide: on that
       disc anything steeper leaves a lit fingernail and dissolves the rest). */
    const lit = mix(limb, face, smoothstep(term[0], term[1], kd));
    let body = lit.mul(mix(float(1.0), float(0.975), pow(oneMinus(nz), 1.6)));
    /* THE TEXTURE ARENA-AAA §2 ASKS FOR ("the large TEXTURED planet"): two
       octaves of low-frequency noise ON THE SURFACE NORMAL, ±1.4 L, so the
       face carries a slow mottle that survives the fog mix and never
       resolves into a pattern. */
    if (tex && typeof mx_noise_float === 'function') {
      body = body.mul(float(1.0)
        .add(mx_noise_float(normalWorld.mul(2.2)).mul(tex))
        .add(mx_noise_float(normalWorld.mul(5.3)).mul(tex * 0.5)));
    }
    /* THE LIMB RING. A body darker than its sky needs an edge that is not a
       cut: a faint brightening over the outer sixth of the radius lifts the
       rim over the core and makes the silhouette read as curvature. It is
       the only thing in the sky besides the moon that is brighter than the
       gradient.
       ROUND-9b: it was not reading. At `smoothstep(0.62, 0.30, nz)` the
       ring only reached full strength at r/R ≥ 0.954 — a two-pixel edge on
       an 81 px disc, and inside it the view-ray darkening below (−5 % at
       the silhouette) cancelled what was left: measured, the limb came in
       0.0 to −1.0 L against the core, i.e. no ring at all. The band is now
       nz 0.80 → 0.42 (r/R 0.60 → 0.907, so the whole outer tenth is at full
       strength and the ramp under it is a third of the radius), the lift
       0.16, and the view darkening is halved to 0.975 — it was doing the
       ring's job in the opposite direction. Rendered that is ≈ +1.9 L at
       0.9 R, which is a rim that reads at a glance and still cannot be
       mistaken for a rim LIGHT: the shaded limb keeps 5 L under the core
       with it. */
    if (ring) body = body.mul(mix(float(1.0), float(1.0 + ring), smoothstep(0.80, 0.42, nz)));
    mat.colorNode = mix(body.mul(heatTint), horizonU, hazeK);
    /* The silhouette fade is an ANTIALIAS, not a dissolve: at 0.42 it ate
       the outer 9 % of the radius — the whole limb ring — and left the moon
       a crescent. At 0.12 it is the outer 0.7 %, under a pixel at every
       framing, which is what a sphere's edge should cost. */
    mat.opacityNode = smoothstep(0.0, fade, nz);
  };
  const skyBall = (mat, azDeg, elDeg, halfAngle, dist, order, name) => {
    const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    const p = new THREE.Vector3(0, PLAZA_Y, 0).addScaledVector(dir, dist);
    const r = dist * Math.tan(THREE.MathUtils.degToRad(halfAngle));
    const m = addMesh(new THREE.SphereGeometry(r, 96, 64), mat, { x: p.x, y: p.y, z: p.z, receive: false, order });
    m.name = name;
    m.frustumCulled = false;
    return m;
  };
  /* `term` −0.21 → 1.59 (round-9b): the ramp centred on the DISC's own
     centre (kd 0.69, because the body hangs 46° off the anti-solar axis)
     with a half-width of 0.9, so the whole roll is spent between the two
     limbs a camera can see instead of on the sphere's hidden half. */
  skyBody(planetMat, C.planetFace, C.planetLimb, PLANET_HAZE, { term: [-0.21, 1.59], ring: 0.16, tex: 0.030 });
  const planet = skyBall(planetMat, SKY_AZ, SKY_EL, 7.5, 200, -3, 'planet');

  /* A small moon upper-right of the planet (ARENA-AAA §2), 2.4° across at
     44° / 12°: the second body a2 and c1 both carry, and the only thing in
     the sky that is not a gradient once the planet has gone behind the
     roofline. Beyond everything (250 m), so it draws first. */
  const moonMat = track(new THREE.MeshBasicNodeMaterial({ fog: false, transparent: true, depthWrite: false }));
  /* THE MOON IS A BODY TOO (round-8). It measured L 88.3 against a sky of
     90.0 — 1.7 L UNDER the gradient it hangs in, which is a hole, not a
     satellite. Three changes, all small: the pair is on the sun's hue at
     L 92.6 / 85.4 (the face is the brightest thing in the sky and still
     under the L 93.5 ceiling), its aerial-perspective mix drops 0.10 → 0.04
     so the haze stops eating the 3 L it has, and it sits at 10° rather than
     12°, where the dome's own ramp is a little over a lightness step
     darker. 3° across rather than 2.4 so the terminator is readable at all
     — a2's moon is a disc with a limb, not a dot. */
  skyBody(moonMat, C.moonFace, C.moonLimb, 0.04, { term: [-1.3, 1.7], fade: 0.10 });
  skyBall(moonMat, 38, 10, 1.8, 250, -4, 'moon');

  // ── sky, fog, light ────────────────────────────────────────────────────────

  /* The dome: a vertical gradient — #F4EEE8 zenith, `skyHorizon` at the
     horizon, #D8C3AC below — with no sun, no cloud, no texture. Drawn first,
     no depth, out of the fog. THE HORIZON IS NO LONGER THE FOG COLOUR. With
     one hex for fog, background and dome the ground plane evaporated: in the
     establishing frame the fogged plaza read 2.1 L BRIGHTER than the sky it
     met, with no discontinuity anywhere down the column, so the eye could
     not find the ground. `skyHorizon` sits 2.5 L UNDER the haze the ground
     fogs to, which is the order every reference keeps — the sky is the
     brightest plane overhead and the darkest at the horizon, the ground the
     other way round — and it is also what puts the stand's roofline 2.4 L
     over the sky it cuts. A BAND of that value holds the first ~2° over the
     horizon (`SKY_BAND`: the distant haze c1 and r3 both carry), then the
     gradient reaches the zenith by 23.6° of elevation (`SKY_ZENITH_AT`; 16°
     in rounds 7–8, 37° before that). That is an 8.1 L ramp out of the
     horizon and it is spent where the sky is actually SEEN. The
     sudden-death tint rides on it. */
  const SKY_R = 300;
  const skyMat = track(new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false,
  }));
  /* SKY_ZENITH_AT 0.40, not 0.28 (round-9). At 0.28 the ramp was spent by
     16.3° of elevation, and the top 250 px of the establishing frame —
     28 % of the picture — measured p5→p95 of 2.1 L at sd 0.64: one cream
     value where a2 carries a hue ramp. At 0.40 the same 8.1 L is spread
     to 23.6°, which puts ≈ 5 L of ramp in that band and leaves the first
     4° of sky — the part the roofline and the haze are measured against —
     within 0.4 L of where it was. */
  const SKY_ZENITH_AT = 0.40, SKY_BAND = 0.035;
  const skyGradient = (y) => {
    const low = color(pre(C.skyHorizon)).mul(heatTint);
    const above = mix(low, color(pre(C.zenith)).mul(heatTint), smoothstep(SKY_BAND, SKY_ZENITH_AT, y));
    const below = mix(color(pre(C.below)).mul(heatTint), low, smoothstep(-0.15, 0.0, y));
    return select(y.greaterThan(0.0), above, below);
  };
  skyMat.colorNode = skyGradient(positionLocal.y.div(SKY_R));
  const sky = addMesh(new THREE.SphereGeometry(SKY_R, 32, 48), skyMat, { receive: false, order: -1 });
  sky.frustumCulled = false;
  sky.name = 'sky';

  const HAZE_PRE = pre(C.haze), HAZE_BURN_PRE = pre(C.hazeBurn);
  const FLOOR = new THREE.Color(C.floor), FLOOR_BURN = new THREE.Color(C.floorBurn);
  const prevBackground = scene.background, prevFog = scene.fog, prevEnv = scene.environment;
  const prevEnvIntensity = scene.environmentIntensity;
  const prevShadowType = renderer.shadowMap.type;
  scene.background = HAZE_PRE.clone();
  scene.fog = new THREE.Fog(HAZE_PRE.clone(), RIG.fogNear, RIG.fogFar);

  /* The key. Its shadow map covers the field and the strip of plaza a wall
     can shade; the filter is set by `shadowType` (VSM by default — see RIG),
     the umbra lifted by `shadow.intensity` to the ground bounce the sun alone
     cannot give. The shadow camera carries a spare layer bit so that whoever
     triggers the shadow update — the scene camera or the reflector's virtual
     camera, which sees only REFLECT_LAYER — it renders every caster:
     three copies the rendering camera's layer mask onto a shadow camera that
     has only layer 0, and a bodies-only shadow map would drop every block's
     shadow for that frame. */
  const SHADOW_TYPES = { vsm: THREE.VSMShadowMap, pcf: THREE.PCFShadowMap, pcfsoft: THREE.PCFSoftShadowMap };
  if (SHADOW_TYPES[shadowType] === undefined) shadowType = RIG.shadowType;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = SHADOW_TYPES[shadowType];
  const key = new THREE.DirectionalLight(RIG.keyColour, RIG.key);
  key.position.set(...RIG.keyDir).normalize().multiplyScalar(80);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  const B = RIG.shadowBounds;
  key.shadow.camera.left = -B; key.shadow.camera.right = B;
  key.shadow.camera.top = B; key.shadow.camera.bottom = -B;
  key.shadow.camera.near = 20; key.shadow.camera.far = 150;
  key.shadow.camera.layers.enable(0);
  key.shadow.camera.layers.enable(31);
  key.shadow.intensity = RIG.shadowIntensity;
  group.add(key);
  group.add(key.target);
  /* The faded shadow needs the caster's alpha to REPLACE what is under it in
     the shadow map's colour buffer. Under VSM three also draws receivers into
     that map, so the floor's alpha 1 lies under a ghosted block's 0.35 and
     normal blending gives 0.35 + 0.65 · 1 = 1 — a full shadow under a block
     the eye can see through. The shadow pass's override material is three's
     own, one per light; with no blending it writes the rgba as given. */
  try {
    const shadowMat = TSL.getShadowMaterial?.(key);
    if (shadowMat) shadowMat.blending = THREE.NoBlending;
  } catch { /* an older three: the alpha fade degrades to a full shadow under VSM */ }
  function configureShadow(q) {
    const size = RIG.shadowMap[q] ?? RIG.shadowMap.medium;
    key.shadow.mapSize.set(size, size);
    const texelsPerMetre = size / (2 * B);
    if (shadowType === 'vsm') {
      key.shadow.radius = RIG.shadowSoft * texelsPerMetre;
      key.shadow.blurSamples = RIG.shadowSamples;
      key.shadow.bias = RIG.shadowBias;
      key.shadow.normalBias = RIG.shadowNormalBiasTexels / texelsPerMetre;
    } else if (shadowType === 'pcf') {
      key.shadow.radius = 3;
      key.shadow.bias = -0.0005;
      key.shadow.normalBias = 0.02;
    } else {
      key.shadow.radius = 1;
      key.shadow.bias = -0.0005;
      key.shadow.normalBias = 0.02;
    }
    key.shadow.needsUpdate = true;
  }

  /* The fill: the sky itself. No ambient, no rim, no point lights. */
  const hemi = new THREE.HemisphereLight(RIG.hemiSky, RIG.hemiGround, RIG.hemi);
  group.add(hemi);

  /* Image-based light: a PMREM of the same sky over a plaza-coloured ground,
     with a small bright disc where the key stands so glossy parts of a body
     catch one highlight that agrees with the shadows. Low, for material life;
     the arena's own plaster takes it at 0.6 of that. */
  let envRT = null;
  try {
    /* The env is LIGHT, not picture: it takes the brief's hexes as plain
       linear colours (a gain of 1.6 for level), never the ACES-inverted ones
       the dome shows — those are pre-saturated to survive the tone map once,
       and a surface lit by them and then tone-mapped comes out peach. */
    /* The gain sets the level (mean 1.57) and is near-neutral (R/B 1.04):
       the gentle warm grade RENDER-QUALITY asks for lives in the KEY, where
       lit surfaces show it — an env at R/B 1.17 was seen uncompressed by
       every umbra and shade flank, which came out more orange than the sun. */
    const ENV_GAIN = vec3(...RIG.envGain);
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 24, 32), new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide }));
    {
      const y = positionLocal.y.div(100);
      const above = mix(color(C.haze), color(C.zenith), smoothstep(SKY_BAND, SKY_ZENITH_AT, y));
      const below = mix(color(C.below), color(C.haze), smoothstep(-0.15, 0.0, y));
      envSky.material.colorNode = select(y.greaterThan(0.0), above, below).mul(ENV_GAIN);
    }
    envScene.add(envSky);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(100, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.plaza).multiply(new THREE.Color(...RIG.envGain)) }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3;
    envScene.add(ground);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.6, 7.9) }));
    sun.position.set(...RIG.keyDir).normalize().multiplyScalar(90);
    envScene.add(sun);
    const pmrem = new THREE.PMREMGenerator(renderer);
    envRT = pmrem.fromScene(envScene, 0.04, 0.1, 500);
    pmrem.dispose();
    envSky.geometry.dispose(); envSky.material.dispose();
    ground.geometry.dispose(); ground.material.dispose();
    sun.geometry.dispose(); sun.material.dispose();
    scene.environment = envRT.texture;
    scene.environmentIntensity = RIG.env;
  } catch (e) {
    console.warn(`environment: PMREM unavailable (${e.message}) — hemisphere only`);
    hemi.intensity = RIG.hemi + 0.5;
  }

  // ── the floor's reflection, by tier ────────────────────────────────────────

  /* A planar reflection of the BODIES in the floor. The reflector's virtual
     camera sees only REFLECT_LAYER, so the pass draws the two fighters
     against the background colour and nothing else — no pit face can print
     a band on the floor, and the pass costs two baked draws, not a scene.
     The floor takes `max(min(mirror − background, 0) × k, −cap)`: zero on
     open floor, negative under a mirrored body, so it can only darken, and
     never by more than the cap (≈ 5 L) whatever stacks on top of it.
     Rendered at 0.35 of the frame and sampled 3.5 mips down — at that blur
     no limb of a 300 px body survives as a shape, only a pool under the
     feet. `k` is ramped with camera height in `update()`: from a low
     three-quarter (the VS card) the same term printed a readable mirrored
     body with every tentacle resolved, a second shadow pointing the wrong
     way; from the fight camera at 15 m it is the founder's hint. 'high'
     only, WebGPU only, and only with a camera. */
  let refl = null;
  const reflLevel = uniform(HAZE_PRE.clone());
  const reflK = uniform(0);
  let heatT = 0;
  const reflectionGain = () => {
    const [lo, hi] = RIG.reflectionHeight;
    const h = camera ? THREE.MathUtils.smoothstep(camera.position.y, lo, hi) : 1;
    return RIG.reflection * h * (1 - 0.7 * heatT);
  };
  let currentQuality = null;
  /* The visibility budget (see `shed`): what a tier drops besides the shadow
     map and the reflector. `medium` loses the dust and the sun shafts,
     `low` the mist and the two farther skylines as well. */
  function applyBudget(q) {
    const keepAtmosphere = q === 'high';
    const keepDistance = q !== 'low';
    if (shed.dust) shed.dust.visible = keepAtmosphere;
    if (shed.shafts) shed.shafts.visible = keepAtmosphere;
    if (shed.mist) shed.mist.visible = keepDistance;
    for (const m of shed.megaFar) m.visible = keepDistance;
  }
  function setQuality(q) {
    if (q === currentQuality) return;
    currentQuality = q;
    configureShadow(q);
    applyBudget(q);
    const want = q === 'high' && !isWebGL && !!camera && typeof TSL.reflector === 'function';
    if (want && !refl) {
      refl = TSL.reflector({ resolutionScale: 0.35, bounces: false, generateMipmaps: true });
      refl.target.rotateX(-Math.PI / 2);
      refl.target.position.set(0, 0, 0);
      refl.target.name = 'floor-reflector';
      group.add(refl.target);
      /* ReflectorNode clones the camera once and keeps the clone in a WeakMap,
         so the layer mask set here sticks for the life of the reflector. */
      refl.reflector.getVirtualCamera(camera).layers.set(REFLECT_LAYER);
    }
    if (!want && refl) {
      group.remove(refl.target);
      refl.dispose?.();
      refl = null;
    }
    floorMat.emissiveNode = want
      ? max(min(refl.bias(RIG.reflectionBlur).rgb.sub(reflLevel), 0.0).mul(reflK), -RIG.reflectionCap)
      : null;
    floorMat.needsUpdate = true;
    reflK.value = reflectionGain();
  }
  setQuality(quality);

  // ── the rest of the API ────────────────────────────────────────────────────

  function applySuddenDeath(h) {
    const t = THREE.MathUtils.clamp(h, 0, 1);
    heatT = t;
    floorMat.color.lerpColors(FLOOR, FLOOR_BURN, t);
    scene.fog.color.lerpColors(HAZE_PRE, HAZE_BURN_PRE, t);
    /* The fog comes in and stretches out with the heat (RIG.burnFog*): the
       plaza dissolves into the ember over the whole distance instead of
       stopping at a belt under it. */
    scene.fog.near = THREE.MathUtils.lerp(RIG.fogNear, RIG.burnFogNear, t);
    scene.fog.far = THREE.MathUtils.lerp(RIG.fogFar, RIG.burnFogFar, t);
    scene.background.copy(scene.fog.color);
    horizonU.value.copy(scene.fog.color);
    reflLevel.value.copy(scene.fog.color);
    /* The reflection scales down with the floor: a mirrored body on an ember
       floor would otherwise print a second, darker ghost under the ring. */
    reflK.value = reflectionGain();
    heat.value = t;
  }

  let elapsed = 0;
  function update(dt = 0) {
    /* Nothing in the brief moves — no clouds, no flags, no lights — and that
       stillness is the point. What the hook does: one shadow refresh per
       frame, whichever camera renders first; the reflection's zero level
       kept on the background the reflector clears to; and the reflection's
       share following the camera's height (none from a low three-quarter,
       the hint from the fight camera). */
    elapsed += dt;
    clockU.value = elapsed;
    key.shadow.autoUpdate = false;
    key.shadow.needsUpdate = true;
    if (scene.background?.isColor) reflLevel.value.copy(scene.background);
    if (refl) reflK.value = reflectionGain();
  }

  function dispose() {
    scene.remove(group);
    floorMat.emissiveNode = null;
    if (refl) { group.remove(refl.target); refl.dispose?.(); refl = null; }
    key.dispose();
    for (const d of disposables) d.dispose?.();
    disposables.clear();
    envRT?.dispose();
    scene.background = prevBackground;
    scene.fog = prevFog;
    scene.environment = prevEnv;
    scene.environmentIntensity = prevEnvIntensity;
    renderer.shadowMap.type = prevShadowType;
  }

  return {
    solids, floorMat, key, hemi, sky, banner, planet, group,
    update, setQuality, applySuddenDeath, dispose,
    get reflector() { return refl; },
    get quality() { return currentQuality; },
    get shadowType() { return shadowType; },
    get elapsed() { return elapsed; },
  };
}

// ---------------------------------------------------------------------------
// quality auto-select (RENDER-QUALITY §7): the meter the port ticks each frame
// ---------------------------------------------------------------------------

/**
 * The starting tier for a backend and a drawing-buffer size: WebGL2 is `low`
 * (no AO, no reflector, FXAA), and over ~2.6 MP (1440×900 at DPR 1.5) the
 * 4-attachment MSAA-4× RGBA16F pass the `high` post graph needs is the
 * Retina cost that the medium graph avoids.
 */
export function initialQuality({ isWebGL = false, width = 1440, height = 900, dpr = 1 } = {}) {
  if (isWebGL) return 'low';
  /* THE RULE IS ABOUT THE DRAWING BUFFER, and the caller may pass either.
     `main.js` passed CSS pixels, where 1440×900 is 1.30 MP and the 'medium'
     branch could never fire, so a Retina laptop took the four-attachment
     MSAA-4× RGBA16F pass at 5.18 MP and 41 fps. Pass `dpr` (or pre-multiplied
     dimensions) and one function owns the boundary again. */
  return width * height * dpr * dpr > 2.6e6 ? 'medium' : 'high';
}

/**
 * A rolling frame-cost meter that only ever DEMOTES: `tick(dt)` with the
 * frame's wall-clock delta in seconds; after a warm-up it keeps the mean over
 * the last `window` frames, and when that mean has sat under `demote.medium`
 * fps for `holdSeconds` it calls `onChange('medium')`, under `demote.low`
 * → `onChange('low')`. It never promotes (a match must not flicker between
 * graphs), and `hold()` freezes it (call it while a match is running if the
 * page wants to defer a post-graph rebuild to the next boundary; the pending
 * tier is then reported by `pending` and applied on `release()`).
 *
 * The port: `const gov = qualityGovernor({ tier, onChange: (q) => { env.setQuality(q); rebuildPost(q); } })`
 * and `gov.tick(dt)` next to `env.update(dt)`. `gov.msPerFrame` is what
 * `window.airena.stats()` should report so the live captures carry it.
 */
export function qualityGovernor({
  tier = 'high', onChange = () => {}, window: win = 120, warmup = 40, holdSeconds = 2,
  demote = { medium: 45, low: 30 }, fast = 24, panicDt = 0.1, panicRun = 3,
} = {}) {
  const ORDER = ['high', 'medium', 'low'];
  const ring = new Float32Array(win);
  let n = 0, i = 0, sum = 0, under = 0, held = false, pending = null, panic = 0;
  const g = {
    get tier() { return tier; },
    get pending() { return pending; },
    /* `n` counts the warm-up ticks too, but only `n − warmup` of them are in
       `sum`: at `n >= win` the mean was divided by a full window while the
       ring held as few as `win − warmup` samples, so a steady 60 fps feed
       reported 90 fps at tick 120 and 72 at tick 140 and only told the truth
       at tick 160. Every capture carries this number, and `main.js` reads
       `gov.fps` for the `starving` escape — a genuinely 25 fps fight read as
       37 for the length of the window and kept the hold on. */
    /* THE FAST LANE. At `warmup + win` the meter needed 160 ticks before it
       had any opinion at all — 16 s at the 10 fps the result captures
       measured, plus the 2 s hold, so every real failure was over before the
       governor could speak and every slow capture reported `msPerFrame:
       null, forced: 0`. It now reports the mean over whatever is in the ring
       once `fast` samples are in (the same window the page's own stats use),
       and the demote test below runs on it. */
    get msPerFrame() {
      const k = Math.min(n - warmup, win);
      return k >= fast ? (sum / k) * 1000 : null;
    },
    get fps() { const ms = g.msPerFrame; return ms ? 1000 / ms : null; },
    hold() { held = true; },
    release() {
      held = false;
      if (pending) { const q = pending; pending = null; g.set(q); }
    },
    set(q) {
      if (!ORDER.includes(q) || ORDER.indexOf(q) <= ORDER.indexOf(tier)) return;
      if (held) { pending = q; return; }
      tier = q; under = 0;
      onChange(q);
    },
    tick(dt) {
      if (!(dt > 0)) return;
      /* THE PANIC RULE, before the warm-up and outside the hold: three
         frames in a row over 100 ms is not a drift, it is a stall (lazy
         pipeline compilation on a victory VFX, a body swapped mid-beat),
         and RENDER-QUALITY §7's floor is 30 fps, not "30 fps once the
         meter has 160 samples". One tier, immediately. */
      panic = dt > panicDt ? panic + 1 : 0;
      /* … but not out of the meter's own first frames: a governor built at
         the first match sees the boot's pipeline compilation as its first
         two or three deltas, and a demotion taken there can never be given
         back (this meter only goes down). */
      if (n >= 4 && panic >= panicRun) {
        panic = 0;
        const next = ORDER[Math.min(ORDER.length - 1, ORDER.indexOf(tier) + 1)];
        if (next !== tier) g.set(next);
      }
      if (n < warmup) { n++; return; }
      const k = n - warmup;
      if (k >= win) sum -= ring[i];
      ring[i] = dt; sum += dt; i = (i + 1) % win; n++;
      const have = Math.min(k + 1, win);
      if (have < fast) return;
      const fps = have / sum;
      const want = fps < demote.low ? 'low' : fps < demote.medium ? 'medium' : null;
      if (want && ORDER.indexOf(want) > ORDER.indexOf(tier)) {
        under += dt;
        if (under >= holdSeconds) g.set(want);
      } else under = 0;
    },
  };
  return g;
}
