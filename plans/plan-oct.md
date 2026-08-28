# BUILD SPECIFICATION — "ARMOURED OCTOPUS"

## 0. THE ONE QUALITY

**MASS AND POWER — a low, heavy, wide dome dragging itself on eight thick machine arms.**

Everything thickens. The mantle is a wide oblate armoured dome, not a bulb on a stick. Arm segments are as deep as they are wide. Every arm joint is an oversized barrel wider than the arm segments it joins. Suckers are machined discs, not dimples. The stance is splayed and planted, the mass slung low between the arms, the head (eye block) low and forward, overhanging.

Three-word version somebody would say: **"low, wide, gripping."**

---

## 1. THE SUBJECT READ

### 1.1 What it is

A common octopus, mechanised. NOT a squid (no fins, no long tapered tube, no tentacle pair). NOT a jellyfish. NOT a spider. The four facts that make an octopus an octopus and not something else, and which must survive every hardware decision:

1. **A single large sac-like mantle (the "head" bulb to a layman)** carried HIGH and BACK, oblate — wider than tall, longest along the body axis, the heaviest single mass on the animal.
2. **The eyes are NOT on the mantle** — they sit on a distinct pinched waist BELOW and FORWARD of the mantle, bulging sideways out of the head like two horizontal barrels on the sides of a narrow block. This is the single most-often-lost octopus fact and it is the whole recognition. The eye axis is transverse (looking left/right and slightly up), not forward like a face.
3. **Eight arms, radiating from a low central ring beneath and around the mouth**, thick at the base and tapering to fine tips, each arm roughly **2.2×** the mantle length, sucker rows on the ORAL (under/inner) side only.
4. **The arms are not equal and are not symmetric in function** — the front pair (arms L1/R1) are the longest and reach forward; the rear pair (L4/R4) are shortest and thickest, planted back like props. The web (interbrachial membrane) connects the arm bases for the first ~22% of their length.

Plus the mechanised read: the funnel/siphon — a visible, aimable **nozzle** protruding from the right-front of the mantle base, which is the `fire` weapon.

### 1.2 Silhouette from ABOVE (the camera's view, 36° down)

A **fat teardrop** — the mantle dome at the back, narrowing forward through the eye-waist, and then **eight arms radiating out** and curling: two forward, two forward-lateral, two lateral, two rear. From above you see: dome ridge running fore-aft, two eye barrels bulging out sideways at the widest point of the head, and the eight arms making a rough asterisk that is denser at the front. The overall top footprint is roughly circular, about 3.4 units across, dominated in the middle by the pale mantle dome.

From the black silhouette above: a big blob with eight tapering legs that are THICK at the blob and thin at the tips, curling, with two lumps on the sides of the narrow end. Nameable in one second.

### 1.3 Silhouette from THREE-QUARTERS

Low and squat. Mantle dome high at the back, sloping down and forward to the eye-waist; eye barrels sticking out sideways under the dome's brow; the whole body carried at about 0.55 units off the ground on the arch of the arm bases; arms bowing UP out of the body then DOWN to the ground, each planted on its coiled tip. The animal is much wider than it is tall.

### 1.4 World-space extent (units; 1 "body length" = 3.0, the mantle-tip-to-front-arm-base span, used for s.speed)

- Overall bounding box: **X (width) 3.6, Y (height) 1.55, Z (length) 4.6** including forward-reaching arms.
- Mantle: length (Z) **1.70**, width (X) **1.30**, height (Y) **0.95**. Centre at (0, 0.85, −0.55). Long axis tilted nose-down 12°.
- Eye-waist / head block: length **0.55**, width **0.70** (excluding eye barrels), height **0.50**. Centre at (0, 0.62, 0.42). With the eye barrels the head is **1.24** wide.
- Eye barrels: each Ø **0.30**, protruding **0.20** out from the head sides, axis transverse, tilted 20° up and 12° forward.
- Arm crown (the ring the arms mount to): Ø **0.86**, centre at (0, 0.42, 0.16), plane tilted 15° nose-down.
- Arm lengths along their own centreline: **front pair 3.30**, front-lateral **3.05**, lateral **2.80**, rear **2.35**.
- Arm base radius: front **0.155**, lateral **0.145**, rear **0.165**. Tip radius on all: **0.025**.
- Body-length for gait purposes: **3.0**.

### 1.5 Ratios written as numbers, to check the geometry against

- mantle length : arm length (front) = 1 : 1.94
- mantle width : mantle height = 1.37 : 1 (oblate — must read from the front)
- mantle width : head width incl. eyes = 1.30 : 1.24 (nearly equal — the head is NOT a thin stalk)
- neck (mantle-to-head gap) = **0.18 long**, i.e. **0.36 × head length** — well under the "one head" limit. There is effectively no neck; the head is a pinched waist, not a boom.
- torso (mantle) thickness vs thickest arm segment = 1.30 wide vs 0.33 wide = **3.9 : 1**. The mantle is unambiguously the thickest and widest mass from the front and from the top.
- rear arm base thickness : front arm base thickness = 1.06 : 1, and rear arm length : front arm length = 0.71 : 1 — the rear pair are visibly shorter and stubbier.

---

## 2. THE SPINE CURVE

One `CatmullRomCurve3` through the body, used to place the mantle segment stack and to orient it. Points, back to front:

1. (0, 0.66, −1.44) — mantle apex tip (rear)
2. (0, 0.94, −1.05)
3. (0.03, 1.02, −0.60) — mantle crown, highest point of the whole body, offset 0.03 to the right for the deliberate bias
4. (0.02, 0.92, −0.16)
5. (0, 0.72, 0.22) — the dip at the waist, behind the eyes
6. (0, 0.60, 0.50) — through the head block
7. (0, 0.50, 0.72) — mouth / beak, the front tip

The curve dips behind the crown, rises over the "shoulders" of the mantle where the arm crown mounts, and continues forward and down through the head without a kink. Bias: weight back and up (mantle), head off-axis low and forward. The right side of the crown sits 0.03 higher and 0.02 further out than the left — deliberate asymmetry carried by one bolt-on module (see §7.8).

---

## 3. HIERARCHY — every named node

Indentation = parenting. Origin location given where it matters. Everything listed is an `Object3D`/`Mesh` with a `.name`.

```
ROOT  "octopus"
├─ "mantle"                    origin (0,0.42,0.16) = the arm-crown centre, so the whole
│  │                            body can nod/heave about the crown
│  ├─ "mantleFrame"            (dark, structural)
│  │   ├─ "mantleRib1".."mantleRib7"          7 hoops
│  │   ├─ "mantleKeel"                       fore-aft I-beam under the ribs
│  │   ├─ "mantleSpineChain"                 chain run over 2 sprockets along the crown
│  │   ├─ "mantleSprocketFwd", "mantleSprocketAft"
│  │   ├─ "mantleGearStackL", "mantleGearStackR"   3-disc stacks at rib4
│  │   ├─ "mantleRamL", "mantleRamR", "mantleRamTop"  3 rams (barrel+rod+clevis+boot each)
│  │   ├─ "mantleBearingRaceAft"              the big race at the apex
│  │   ├─ "mantleTieRodL", "mantleTieRodR"
│  │   ├─ "mantleDuctL", "mantleDuctR"
│  │   ├─ "mantleBlock1".."mantleBlock5"      stacked machined segment blocks along keel
│  │   └─ "mantleTorsionBar"
│  ├─ "mantlePlateTopFwd"      shell
│  ├─ "mantlePlateTopMid"      shell (laps under TopFwd)
│  ├─ "mantlePlateTopAft"      shell (laps under TopMid)
│  ├─ "mantlePlateFlankL"      shell
│  ├─ "mantlePlateFlankR"      shell
│  ├─ "mantlePlateCheekL"      shell, small, laps over FlankL front edge
│  ├─ "mantlePlateCheekR"      shell
│  ├─ "mantleApexCap"          shell, partial sphere at the rear tip
│  ├─ "mantleDorsalRidge"      raised rib assembly along the crown
│  │   └─ "ridgeVane1".."ridgeVane9"          9 individual thin blades
│  ├─ "mantleHatch"            small hinged plate, top-right, visibly open 8°
│  ├─ "mantleAuxModule"        the asymmetric bolt-on, top-left-rear
│  ├─ "mantleGreebles"         (bolt rows, blanking plates, handles, ties)
│  ├─ "funnelBase"             origin (0.30,0.30,0.10)  — gimbal ring
│  │   └─ "funnel"             the siphon nozzle, aimable
│  │       ├─ "funnelBarrel", "funnelLipRing", "funnelValveBlock",
│  │          "funnelRamA", "funnelRamB", "funnelClamp1..3"
│  ├─ "gillPortL", "gillPortR"  vent grille assemblies at the mantle-base sides
│  ├─ "harnessMantle"           cable runs that live wholly on the mantle
│  │
│  ├─ "head"                   origin (0, 0.70, 0.20) = the waist joint, behind the eyes
│  │   ├─ "headFrameBlock"      dark faceted core, 4 volumes
│  │   ├─ "headBrowPlate"       shell, over the top, laps forward over the nose
│  │   ├─ "headNosePlate"       shell, the forward wedge, 3 planes
│  │   ├─ "headCheekPlateL"     shell
│  │   ├─ "headCheekPlateR"     shell
│  │   ├─ "headUnderPlate"      shell, the oral hood — HINGED, opens down
│  │   ├─ "headWaistBellows"    rubber boot over the waist joint
│  │   ├─ "headWaistRace"       bearing race, visible ring of bolt heads
│  │   ├─ "headRamL","headRamR" 2 rams driving the nod, mantle→head
│  │   ├─ "headGearL","headGearR" stepped gear pairs at the waist
│  │   ├─ "eyeTurretL"          origin at the barrel axis on the head side
│  │   │   ├─ "eyeBarrelL"      lathed stepped housing
│  │   │   ├─ "eyeBezelL"       machined bezel ring
│  │   │   ├─ "eyeBrowHoodL"    formed shell hood over the top of the lens
│  │   │   ├─ "eyeLensL"        DARK GLASS, recessed 0.045 behind the bezel
│  │   │   ├─ "eyeIrisRingL"    thin dark ring inside the bezel
│  │   │   ├─ "eyeLidPlateL"    a crescent shell shutter that rotates over the lens
│  │   │   ├─ "eyeRamL"         small ram from head block to turret
│  │   │   ├─ "eyeSlitVaneL1..3" 3 small blades below the lens (the slit pupil ranks)
│  │   │   └─ "eyeGreeblesL"    bolt ring, 2 fittings, cable boot
│  │   ├─ "eyeTurretR"          mirrored, same 10 children
│  │   ├─ "beakAssembly"        origin at the mouth, (0,0.46,0.62)
│  │   │   ├─ "beakUpper"       hinged plate, 2 planes + rolled lip
│  │   │   ├─ "beakLower"       hinged plate, opens 30°
│  │   │   ├─ "beakRam"         small ram driving the lower
│  │   │   ├─ "beakToothU1..4"  4 short tines on the upper
│  │   │   ├─ "beakToothL1..4"  4 on the lower
│  │   │   ├─ "radulaDrum"      a small ribbed roller inside, spins when eating
│  │   │   └─ "beakCollar"      the port collar where cables land
│  │   ├─ "sensorStalkA","sensorStalkB"  2 short antennae, top of the brow
│  │   └─ "harnessHead"         cable runs living wholly on the head
│  │
│  └─ "crown"                   origin (0,0.42,0.16) — the arm ring, child of mantle
│      ├─ "crownRing"           big bearing race, Ø0.86, ring of 16 bolt heads
│      ├─ "crownGearRing"       toothed inner ring
│      ├─ "crownHubPlate"        shell cap over the top of the ring
│      ├─ "crownUnderPlate"     shell under, around the beak collar
│      ├─ "webPanel1..8"        8 separate interbrachial membrane panels
│      │                        (each a formed shell spanning two adjacent arm bases)
│      └─ "armL1".."armL4", "armR1".."armR4"   8 arms (§6)
```

### 3.1 Part-count check — NUMBER 1 (leading end > any limb)

- **Leading end** (`head` + all descendants, excluding the arms): headFrameBlock counts as 4 volumes but 1 node; named nodes = head, headFrameBlock, headBrowPlate, headNosePlate, headCheekPlateL/R, headUnderPlate, headWaistBellows, headWaistRace, headRamL/R, headGearL/R, eyeTurretL/R (+10 children each = 20), beakAssembly (+ upper, lower, ram, 8 teeth, radula, collar = 12), 2 sensor stalks, harnessHead = **≈ 62 named parts.**
- **One arm** (the front arm, the most expensive limb): armLn root, 7 segments, 7 joint barrels, 7 rams, 1 chain run, 6 shells, 22 suckers, 1 tip coil, 1 hook, harness ×2 = **≈ 55 named parts.**

62 > 55. Requirement met, and by construction: whenever arm parts are added, two more must be added to the head.

---

## 4. SECTION BY SECTION — DIMENSIONS, POSITION, MATERIAL

### 4.1 MANTLE (the largest volume — built as a STACK, never one primitive)

Extent L1.70 × W1.30 × H0.95, centred (0, 0.85, −0.55), long axis pitched −12° (nose down), placed along the spine curve points 1–4.

**(a) The stack — what fills it, all DARK machine:**

- **`mantleRib1..7`** — 7 hoops, placed at curve parameters t = 0.05, 0.14, 0.24, 0.35, 0.46, 0.57, 0.68 along the spine, each oriented by the curve's tangent/normal. Each rib is a `TorusGeometry` flattened to 0.62× on Y (so the hoop is oblate like the mantle) with major radii running **0.30, 0.44, 0.56, 0.65, 0.63, 0.52, 0.36** — i.e. the volume swells at rib4 and narrows at both ends. Tube radius 0.035, 12 radial segs (faceted). Each rib carries **8 bolt heads** on its outer face and a **2-plane gusset** where it meets the keel. Visible joint between each pair: a short machined **spacer block** (0.09 × 0.07 × 0.05, faceted box, tapered) bridging rib n to rib n+1 at three clock positions (top, port-flank, starboard-flank) = 18 spacer blocks, each named `mantleSpacer1..18`.
- **`mantleKeel`** — an I-beam running the full 1.70 under the ribs, built from three extruded plates (web + 2 flanges), depth 0.06, height 0.14. This is the load path the arm crown bolts to.
- **`mantleBlock1..5`** — 5 stacked machined segment blocks sitting ON the keel inside the ribs, each 0.24 × 0.20 × 0.18, faceted, each with a recessed face and 4 bolts, scaling down 1.0, 1.0, 0.95, 0.85, 0.7 rearward. These fill the middle so you cannot see through the body.
- **`mantleSpineChain`** — a chain run of **34 links** (each link a small flattened faceted box 0.045 × 0.022 × 0.03 with a pin) following the spine curve from t=0.10 to t=0.62, passing over **`mantleSprocketAft`** (Ø0.16, 14 teeth as separate small boxes) at t=0.10 and **`mantleSprocketFwd`** (Ø0.20, 16 teeth) at t=0.62. This run sits in the trough between the dorsal ridge and the top plates and is **visible through the two gaps between the three top shells.**
- **`mantleGearStackL/R`** — at rib4, ±0.52 X, three concentric lathed discs Ø0.22/0.16/0.11, each stepped, plus a hub and a cover plate with a hole; teeth on the outer disc as 18 small boxes.
- **`mantleRamL/R`** — 2 rams from rib2 to rib6 along the flanks at ±0.44 X, y≈0.80: lathed barrel Ø0.075 × 0.42, polished rod Ø0.034 emerging 0.16, gland nut, **clevis** at the end pinned to a rib gusset, **rubber boot** (near-black, ribbed lathe) over the gland.
- **`mantleRamTop`** — 1 shorter ram along the crown, rib3→rib5, driving the dorsal ridge flex.
- **`mantleBearingRaceAft`** — the rear apex: a Ø0.34 stepped race with 12 bolt heads, the thing the apex cap bolts onto.
- **`mantleTieRodL/R`** — threaded rod Ø0.018, rib1→rib4, with two visible hex nuts each.
- **`mantleDuctL/R`** — corrugated ducting Ø0.09 (lathed with 9 ribs) from rib5 forward and down to the gill ports; **this is machine, not cable** — rigid, dark gunmetal, landing in a flanged port at each end.
- **`mantleTorsionBar`** — a transverse bar Ø0.026 across rib3, ending in two small splined collars bolted to the flank frame (it comes out somewhere and lands in a fitting at both ends).

**Four kinds of hardware in the gaps — NUMBER 2, tallied for the mantle:** gear stacks (2 assemblies, ~12% of gap fill), chain run over sprockets (1 run of 34 + 2 sprockets, ~22%), rams with visible rod/gland/boot (3, ~14%), bearing races (3, ~10%), stacked segment blocks + spacer blocks (23, ~24%), ducting (2, ~8%), threaded rod/torsion bar (3, ~6%), ribs/gussets (~4%). Six distinct kinds, largest is 24%. Passes.

**(b) The shells over the mantle — 8 pieces plus the apex cap. No piece covers a whole station.**

All shells are **bone white**, formed, with rolled lips, standing off the frame **0.035–0.05** on visible standoff pads (each shell has 3–4 named standoffs: small stepped cylinders with a bolt head).

1. **`mantlePlateTopFwd`** — partial cylinder around the spine curve at t 0.42→0.68, rTop 0.50 rBottom 0.66, thetaLength 130° (≈36% of the way round), open-ended, DoubleSide, then scaled 1.0/0.66/1.0 on Y so it is oblate to match the mantle. Cut with **two recessed slots** (Shape.holes route: built as an extruded formed plate instead where the vents are needed — see note) and given a **raised rib** down its centre and a **scalloped bite** out of its rear-left corner. Laps **over** TopMid by 0.07.
2. **`mantlePlateTopMid`** — same construction, t 0.22→0.44, thetaLength 145°, radii 0.60→0.68. Two vent slots, one small **bolt-on sub-plate** (0.20 × 0.14) on its top face, rolled lip both long edges. Laps over TopAft.
3. **`mantlePlateTopAft`** — t 0.04→0.24, thetaLength 120°, radii 0.34→0.60. One long vent, a rib, a bite out of the rear.
4. **`mantlePlateFlankL`** — a bent extruded plate (`ExtrudeGeometry` with `extrudePath` along a curve that follows the mantle's port flank from z=−1.20 to z=+0.05, dropping from y 0.90 to 0.55), depth 0.045, bevelled. Outline: a long leaf, wider in the middle, with a **notch** cut where the gill port is and three **vent slots** as Shape.holes. Its top edge tucks **under** TopMid/TopAft by 0.06 — so from the top you see the top plate lapping over the flank plate.
5. **`mantlePlateFlankR`** — mirrored, but with a differently-shaped notch (the funnel passes it) and only two vent slots. No two shells on the body share an outline: this one is 0.05 shorter and has one fewer slot.
6. **`mantlePlateCheekL`** — small formed plate, 0.30 × 0.24, over the front-lower corner of the port flank, lapping **over** FlankL's front edge. Carries the stencil marking "07".
7. **`mantlePlateCheekR`** — mirrored, carries a run of 5 hazard diagonals, 0.10 long total — the only hazard stripes on the body.
8. **`mantleApexCap`** — partial sphere, r 0.30, phiLength 210°, thetaLength 95°, scaled (1.0, 0.66, 1.35) so it is a nose-cone dome, bolted to `mantleBearingRaceAft`, with a ring of 12 bolt heads and a single small central blanking plate.

**The gaps, and what shows through them:** (i) between TopFwd and TopMid, a 0.055 band the full width of the crown — the spine chain and sprocketFwd show; (ii) between TopMid and TopAft, a 0.05 band — chain and mantleBlock2; (iii) between the top plates' lower edges and the flank plates' upper edges, a continuous 0.07 gap down both sides — ribs 2–6, the flank rams, the gear stacks, the tie rods; (iv) the whole mantle underside is **unshelled** — keel, blocks, ducting all exposed (only seen from low angles but must be right); (v) rear quarter between ApexCap and TopAft — the aft race and rib1.

**`mantleDorsalRidge`** — sits in the trough on the crown, ON TOP of the chain run, a dark frame spar 0.9 long carrying **`ridgeVane1..9`**: 9 individual thin metal blades, each an extruded shape 0.02 thick, heights **0.06, 0.09, 0.12, 0.14, 0.15, 0.13, 0.10, 0.07, 0.05** (rising then falling), each rotated 4° more than its neighbour about the spine, overlapping like roof tiles, forward one over the one behind. Bone white with worn-thin edges.

**`mantleHatch`** — 0.22 × 0.18 formed plate on the top-right of TopMid, hinged on two visible pins, standing open 8° so you can see the dark interior and a small junction block inside.

**`mantleAuxModule`** — the deliberate asymmetry: one bolt-on unit, top-LEFT-rear, a 0.26 × 0.18 × 0.14 faceted housing with a lathed cap, a vent grille of 6 slats, 6 bolts, and **one of the body's two emissive spots** — a 0.02 × 0.05 amber slot on its rear face.

**`gillPortL/R`** — at the mantle base sides, (±0.56, 0.50, −0.10): a flanged oval collar (lathe), a grille of **7 individual slats**, 8 bolt heads, and the mouth of `mantleDuctL/R` landing in it.

### 4.2 THE FUNNEL / SIPHON (the ranged weapon)

`funnelBase` at (0.30, 0.30, 0.10) — a gimbal ring Ø0.20 with two visible pivot pins and a ring of 8 bolts, bolted to the keel's forward flange and passing through a notch in the crown under-plate (a real fitting, not an intersection). `funnel` pivots in it: a lathed barrel, profile from Ø0.16 at the base stepping to Ø0.11, then flaring to a **rolled lip ring** Ø0.15 at the mouth, total length 0.40, pointing forward-right-down at rest (yaw +25°, pitch −20°). Two small rams (`funnelRamA/B`) run from the keel to clevises on the barrel — these are what aim it. `funnelValveBlock` is a faceted 0.10 cube on top with 4 bolts and a port. Three `funnelClamp` collars hold the hose that feeds it. Dark gunmetal barrel, bone-white rolled lip, near-black boot at the gimbal.

### 4.3 HEAD (the leading end — the densest section)

Origin at the waist (0, 0.70, 0.20). Extent 0.55 L × 0.70 W (1.24 with eyes) × 0.50 H, its centre 0.42 forward of the waist. **Neck length 0.18 = 0.36 head-lengths.** No boom.

**(a) `headFrameBlock` — four intersecting volumes, dark:**
- a wide flat **top plane** (0.62 × 0.34 × 0.08 tapered box) forming the brow shelf;
- two **angled cheeks** (each a 6-sided tapered cylinder laid on its side, 0.24 long, r 0.19→0.14, canted 22° out) — these are what the eye turrets bolt to;
- a **narrower underside wedge** (extruded 5-sided plate, 0.44 × 0.26, depth 0.16, dropping forward-down) carrying the beak collar;
- a hard **shoulder line** where the top plane meets the cheeks, expressed as a 0.02 step with a bolt row of 6.

**(b) Waist hardware, all visible:** `headWaistRace` — a Ø0.26 stepped bearing race with 14 bolt heads on its face, sitting in the pinch between mantle and head. `headWaistBellows` — a near-black ribbed lathe boot (7 ribs) filling the 0.18 gap, so nothing floats and the joint reads. `headGearL/R` — a stepped gear pair each side (Ø0.13 meshing Ø0.09, teeth as 14 + 10 small boxes). `headRamL/R` — two rams from mantle rib7 gussets down-forward to clevises on the head cheeks, barrel Ø0.055, rod Ø0.026, boot at each gland. These drive the nod.

**(c) Shells on the head — 5 pieces, bone white:**
- `headBrowPlate` — a formed partial cylinder (r 0.32→0.26, theta 150°) over the top plane, its front edge **lapping over** headNosePlate by 0.05, with a **raised centre rib**, two vent slots, and a **scalloped bite** over each eye so the eye hoods clear it.
- `headNosePlate` — an extruded 3-plane wedge (not a cone), 0.26 long, narrowing from 0.30 to 0.14 wide and dropping 0.10, bevelled, with a rolled lower lip and 4 bolts. This is the tapering front and it is **three planes, not one curve.**
- `headCheekPlateL/R` — formed partial cylinders wrapped on the cheek volumes, theta 120°, covering the OUTER-FORWARD third only so the gear pairs and the turret bases stay visible behind them. Each has one vent slot and a small bolt-on sub-plate.
- `headUnderPlate` — the oral hood: a formed shell (partial sphere, r 0.28, phiLength 170°, thetaLength 70°, scaled 1.0/0.7/1.2) under the head, **HINGED at its rear edge on two visible pins**, hanging 6° open at rest, opening 34° in `attack`/`eat`. Its inside face reads (DoubleSide) and shows the beak behind it.

**(d) `eyeTurretL/R` — 10 named parts each.** Axis transverse, tilted 20° up, 12° forward. Origin on the cheek face at (±0.31, 0.66, 0.36).
- `eyeBarrel` — lathed stepped housing, Ø0.30 at the base stepping down to Ø0.24, protruding 0.20, with a groove and 3 machined steps.
- `eyeBezel` — a machined ring, outer Ø0.26, inner Ø0.19, standing 0.02 proud, with 10 tiny bolt heads.
- `eyeBrowHood` — a formed shell hood, partial cylinder theta 110°, over the top half of the bezel, standing off 0.02, bone white, worn to metal on its leading edge.
- `eyeLens` — a shallow sphere-cap, Ø0.17, set **0.045 BACK** behind the bezel plane so the bezel and hood shade it. Near-black (#141312), metalness 0.1, roughness **0.06**. Not emissive. This is the only low-roughness part on the body besides its twin.
- `eyeIrisRing` — a thin dark ring (#1E1D1B) inside the bezel, 0.008 thick.
- `eyeLidPlate` — a crescent shell (a partial torus slice, bone white) on a visible pivot at the top of the barrel, rotating 0→70° down over the lens. Rest = 12° closed. This is the eye's "expression" and it moves in the pose function.
- `eyeSlitVane1..3` — 3 thin blades below the lens, 0.10/0.08/0.06 long, 0.012 thick, splayed, standing in for the horizontal slit pupil's shade.
- `eyeRam` — a small ram from the head cheek to a clevis on the barrel's underside, barrel Ø0.03, rod Ø0.014, boot.
- `eyeGreebles` — a ring of 8 bolts on the barrel base flange, 2 small junction fittings, and the port collar where `harnessHead` lands.

**(e) `beakAssembly`** — at (0, 0.46, 0.62), inside/behind the under-plate. `beakUpper` is two bevelled planes meeting at a ridge, 0.13 long, with a **rolled lip** and 4 tines (`beakToothU1..4`, each a small tapered 5-sided cone, lengths 0.045/0.055/0.055/0.045). `beakLower` mirrors it, hinged on a visible pin, driven by `beakRam` (barrel Ø0.026). `radulaDrum` is a Ø0.07 ribbed roller (11 ribs) on an axle between the jaws, and it **spins** during `eat`. `beakCollar` is a lathed flanged collar with 8 bolts where two cable runs land. **No accent colour anywhere on the head. No emissives on the head.**

**(f) `sensorStalkA/B`** — two short antennae, 0.10 and 0.075 long, Ø0.012, rising from the brow plate at (±0.09, top), each ending in a tiny lathed can with a bolt. They are the only stalks on the body and they are on the brow, not sprouting from the sides.

### 4.4 CROWN (the arm ring)

`crownRing` — a Ø0.86 bearing race, cross-section a stepped lathed profile 0.10 tall, with **16 bolt heads** on its upper face and 8 **arm sockets** (each a lathed cup Ø0.21, 0.06 deep, with a 6-bolt flange) at 45° intervals but ROTATED so the socket pattern is 0°/±48°/±97°/±143° in top-view azimuth measured from +Z — i.e. the arms are NOT evenly spaced; they crowd forward like a real octopus.

Socket azimuths (measured from +Z, positive = to the right/+X):
- R1 = +24°, L1 = −24° (front pair)
- R2 = +68°, L2 = −68°
- R3 = +115°, L3 = −115°
- R4 = +156°, L4 = −156° (rear pair)

`crownGearRing` — an inner toothed ring, 40 teeth as small boxes, meshing with a small pinion at the front (`crownPinion`, Ø0.09, with a shaft that lands in a bearing on the keel).
`crownHubPlate` — a bone-white shell cap covering the **forward 60%** of the ring's top, laps over the ring's outer lip, 3 vents, 8 bolts; the rear 40% of the ring is bare so the gear ring shows from above (this matters — it is on the camera-facing surface).
`crownUnderPlate` — a bone-white formed plate under the ring, around the beak collar, covering half the underside; the rest exposes the socket flanges and the pinion.
`webPanel1..8` — 8 separate interbrachial membrane panels, each a formed shell spanning the gap between two adjacent arm bases for the first 0.42 of arm length. Each is a curved extruded plate (curved in cross-section, thickness 0.025, bevelled), scalloped along its free edge, **rolled lip** on that edge, and pierced with 2 vent slots. Bone white on the outer face; the panels lap so the forward one covers the one behind at each junction. The four front webs are deeper (0.42) than the two rear webs (0.24) — matching the real animal, whose web is deepest between the front arms. Each web panel is parented to the LEFT-hand arm of its pair at that arm's first segment, so it swings with the limb and never floats — and its free edge overlaps the neighbouring arm without being attached to it.

---

## 5. THE ARMS — the eight limbs, in detail

### 5.1 Common construction

Each arm is a chain of **7 segments** (`seg1..seg7`), each segment's origin at the joint it pivots about, parented in series. Lengths and radii, as a fraction of that arm's total length L and base radius R:

| seg | length | rTop | rBottom |
|---|---|---|---|
| 1 | 0.19 L | 0.92 R | 1.00 R |
| 2 | 0.17 L | 0.80 R | 0.92 R |
| 3 | 0.16 L | 0.66 R | 0.80 R |
| 4 | 0.15 L | 0.52 R | 0.66 R |
| 5 | 0.13 L | 0.38 R | 0.52 R |
| 6 | 0.11 L | 0.24 R | 0.38 R |
| 7 | 0.09 L | 0.14 R | 0.24 R |

Each segment body is a **CylinderGeometry with 8 radial segments** (faceted machined stock) and the two radii different — so it tapers. **Cross-section is not round-flat:** each segment additionally carries a **dorsal spine strip** (a thin extruded plate 0.02 thick along its top) and a **flattened oral face** (a small extruded plate along its underside carrying the suckers), so the arm is a D-section, as deep as it is wide, never a pipe.

**At every joint (7 per arm, including the socket joint):** `armXn_barrel` — an oversized joint barrel, a lathed housing whose diameter is **1.30×** the segment radius at that station, with two machined steps, a **hinge pin** with a visible collar each side, a **ring of 6 bolt heads**, and a near-black **rubber boot** over the gap on the inboard side. The barrel being wider than the limb is what makes the arms read as heavy machinery.

**Actuation, per arm:**
- `armXn_ram` on segments 1–5 (5 rams): barrel Ø 0.30 R, polished rod, clevis pinned to the next segment's gusset, boot over the gland. On seg1 and seg2 the rams are DOUBLE (one each side) — so 7 rams total on the thick end of each arm.
- `armXn_chain` — **one chain run per arm**, 18 links, running along the DORSAL side from the crown socket over `armX_sprocketA` (Ø0.11 at the socket) and `armX_sprocketB` (Ø0.07 at joint 4), then terminating in a **turnbuckle fitting** on seg5. Links are small flattened faceted boxes, evenly spaced, following a CatmullRomCurve3 laid along the arm's rest curve **in seg1's local space up to joint 4, then a second run in seg4's local space** — split at the joint, meeting inside `armX_chainBoot`, a clamped collar. (No chain spans a joint as one rigid run.)
- `armXn_bearingRace` on joints 1, 3, 5 (3 per arm): a concentric stepped disc pair with a hub and a cover plate with a hole in it.
- `armX_gearStack` at the socket: 3 stacked discs Ø0.20/0.15/0.10 with 16 teeth on the outer.
- `armXn_tieRod` on segs 2 and 4: threaded rod with 2 hex nuts, ends landing in eyes on the gussets.

**Four kinds in the gaps, per arm:** joint barrels + bearing races (~26%), rams (~24%), chain run + sprockets (~22%), gear stack (~10%), tie rods + gussets + spacer blocks (~18%). Five kinds, none over 26%. Passes.

### 5.2 Suckers — the octopus's signature mechanism, built as a mechanism

**Suckers are the thing an octopus is known for and they are built as working hardware, not dimples.** On the ORAL (under/inner) face only, in a **biserial (two staggered rows)** arrangement — which is correct for *Octopus vulgaris* and is a recognition fact.

Per arm: **22 suckers**, `armXn_suckerA/B/...`, arranged 4+4 on seg1, 4 on seg2 (staggered), 3 on seg3, 3 on seg4, 2 on seg5, 1 on seg6, 1 on seg7. Diameters taper down the arm: **0.115, 0.108, 0.100, 0.092, 0.084, 0.076, 0.068, 0.060, 0.054, 0.048, 0.043, 0.038, 0.034, 0.030, 0.027, 0.024, 0.021, 0.019, 0.017, 0.015, 0.013, 0.011.**

Each sucker is **4 parts** (a "vacuum cup unit"), and it is the single most-repeated assembly on the body — build one properly and repeat with a transform:
1. `..._rim` — a lathed ring, bone white, with a rolled outer lip and a stepped inner seat.
2. `..._piston` — a small dark lathed plunger recessed inside the rim, set 0.4× the rim depth back so it is genuinely a cup.
3. `..._boot` — a near-black ribbed gasket (3 ribs) between rim and the arm's oral plate.
4. `..._port` — a tiny fitting on the arm side of the oral plate where the sucker's line enters. On the **6 largest suckers of each front arm only**, this port has a short visible hose stub (0.03) that lands in the arm's oral trunk line (§7.4) — so the suction plumbing reads.

That is **22 × 4 = 88 sucker parts per arm** — but they are the SMALL size class, tiny against the arm, and they are tidy: evenly spaced, equal within a rank, mirrored left/right. The largest sucker is 0.115 Ø against a 0.31-Ø arm — seasoning, not confetti.

**The `piston` on the 8 largest suckers of each arm retracts** in the pose function during `gather`, `deposit` and `attack`.

### 5.3 Arm tip — NUMBER 3 (digits: three links and a tip)

An octopus has no fingers; the equivalent structure is the **arm tip**, and it must be articulated, not a stump. `seg7` therefore ends in a **`armX_tipAssembly`** of **3 further links plus a tip**:
- `tipLink1` (0.055 long, r 0.026→0.020, with its own small barrel joint and a micro-ram Ø0.014),
- `tipLink2` (0.042, r 0.020→0.014, barrel joint),
- `tipLink3` (0.032, r 0.014→0.009, barrel joint),
- `tipClaw` — a small curved hook, 0.045 long, an extruded bevelled crescent with a machined bearing edge, bone white worn to metal at the point.

So every arm ends in a genuine 3-links-and-a-tip chain. The tip links curl tightly (each 40–55°) at rest, giving each arm the characteristic **coiled tip** — this is a major octopus recognition cue and it is visible from above.

### 5.4 Shells on the arms — 6 per arm

Bone white, formed partial cylinders taken from that arm's own radius at that station plus a 0.03 standoff, each with **thetaLength 120–190°** (a third to two thirds round), covering the DORSAL and outer-lateral aspect only. The oral face is never shelled (that is where the suckers are). Each shell:
- `armXn_shellA` on seg1: r 1.28R→1.18R, theta 175°, 0.19L long × 0.88 (so it stops short and the joint barrel shows), 3 vents, a raised rib, a rolled lip, a scalloped bite at the rear, laps **over** shellB.
- `..._shellB` on seg2: theta 165°, 2 vents, a bolt-on sub-plate.
- `..._shellC` on seg3: theta 150°, 1 vent, a rib.
- `..._shellD` on seg4: theta 140°, rolled lip, scalloped bite.
- `..._shellE` on seg5: theta 125°, small, plain but bevelled with a rolled lip.
- `..._shellF` on seg6: theta 115°, tiny.
- seg7 and the tip links are **unshelled** — bare machine, which makes the tips read as thin and mechanical.

Each shell sits on 3 named **standoff pads**. Adjacent shells lap: the proximal shell over the distal one by 0.03 (armour lapping "downstream" so the arm can curl without the plates jamming). Every shell's outline is different because its two radii and its theta differ.

**Gaps and what shows:** at every joint a 0.045–0.07 band of bare machine — the barrel, the bearing race, the boot; along the whole ventral-lateral line, the ram bodies and the chain run.

### 5.5 Per-arm differentiation (so they are not eight identical columns)

- **Front pair (L1/R1)**: L = 3.30, R = 0.155. **Longest, most shells (6), full 22 suckers, 7 rams, the only arms with the oral trunk hose and the sucker hose stubs.** These are the manipulators. Rest pose: reaching forward and out, seg1 raised 26° above horizontal then arching down, tips coiled up off the ground. **They do not bear weight at rest.**
- **Front-lateral pair (L2/R2)**: L = 3.05, R = 0.148. 6 shells, 20 suckers, 6 rams. Weight-bearing, planted forward-lateral, tips coiled on the ground.
- **Lateral pair (L3/R3)**: L = 2.80, R = 0.145. 5 shells, 18 suckers, 6 rams. The main props. Widest stance: tips at ±1.55 X.
- **Rear pair (L4/R4)**: L = 2.35, R = 0.165 — **shortest and THICKEST.** 5 shells but the heaviest ones (theta 190° on seg1), 16 suckers, 7 rams, and an extra **`armX_heelBlock`** on seg2's underside: a faceted skid block with a hard-wearing plate, because these are the arms that push. They are the drive arms.

This difference — long thin front pair, short fat rear pair — must be visible **from the front view** (front arms reach into frame, rear arms are stubby and splayed behind) **and from the top** (asterisk crowded forward).

---

## 6. THE STANCE / REST POSE (numbers)

Body root at origin, mantle crown at y 1.02. Crown ring at y 0.42. Arm segment 1 angles, measured as elevation above the crown plane at the socket, and the joint angles down the chain:

| arm | seg1 elev | seg2 | seg3 | seg4 | seg5 | seg6 | seg7 | tip links |
|---|---|---|---|---|---|---|---|---|
| L1/R1 | +26° | +6° | −16° | −30° | −34° | −22° | −6° | +38,+46,+52 (curl up) |
| L2/R2 | +16° | −4° | −26° | −38° | −30° | −12° | +4° | +30,+40,+48 |
| L3/R3 | +12° | −8° | −32° | −40° | −24° | −6° | +8° | +26,+36,+44 |
| L4/R4 | +8° | −14° | −36° | −38° | −18° | −2° | +10° | +22,+32,+40 |

Yaw splay is the socket azimuth plus a small outward bow at seg2–seg4 (6°, 4°, 2°) so the arms bow outward and then come back — an S in plan, never a straight radial spoke.

Ground contact: arms 2, 3, 4 (six arms) rest their seg5/seg6 underside and coiled tip on y=0. Arms 1 (front pair) hover, tips at y 0.12.

---

## 7. THE HARNESS — every run, with both ends and its route

**Rule obeyed throughout: a run belongs to ONE moving part, is drawn in that part's local space, and where it must cross a joint it is SPLIT at the joint into two runs meeting inside a boot/clamp/port collar.** Nothing is regenerated in the pose function.

Three gauges: **trunk** Ø0.030 (corrugated — a TubeGeometry along a curve, with a lathed corrugation look achieved by 11 small ring meshes clamped along it), **medium** Ø0.016 (smooth), **signal** Ø0.008 (thin wire; four of these gathered inside a clamp read as one bundle). Trunk : signal radius = 3.75 : 1.

All near-black #1E1D1B, roughness 0.9, metalness 0.

### 7.1 Runs on the mantle (`harnessMantle`) — 9 runs

1. **Dorsal trunk A** — from a flanged port on `mantleApexCap`'s base, forward along the port side of the dorsal trough, under three `clampD1..3` on rib gussets, into a port on `mantleGearStackL`'s cover plate. Sags 0.02 between clamps.
2. **Dorsal trunk B** — mirrored on the starboard side, apex port → `mantleGearStackR` cover plate, 3 clamps.
3. **Flank medium L** — port on rib2's gusset → down and forward along the gap between TopAft and FlankL → 4 clamps → into `gillPortL`'s collar. Loops proud of the body 0.05 at its middle, then comes back and lands.
4. **Flank medium R** — mirrored, → `gillPortR`.
5. **Signal bundle L** — 4 × Ø0.008 wires, gathered at both ends in `bundleClampL1/L2`, running from a small junction block under `mantlePlateCheekL` up to a port on the `mantleAuxModule`. Splits into 4 at the module end (visible fan of 4 into 4 tiny ports).
6. **Signal bundle R** — mirrored, cheekR junction → a blanking-plate port on rib5.
7. **Funnel feed trunk** — from a flanged port on the keel's forward flange, through `funnelClamp1`, over the gimbal, through `funnelClamp2/3`, into the `funnelValveBlock` port. This run is entirely in the mantle's local space up to the gimbal; **the portion on the funnel itself is a separate run** (`funnelFeedDistal`) parented to `funnel`, and the two meet inside `funnelClamp1`, which is a lathed collar that hides the seam.
8. **Hatch loom** — a short Ø0.016 run from inside `mantleHatch`'s interior junction block, out under the open hatch lip, into a port on TopMid's sub-plate. Both ends visible and landed.
9. **Aft cross-tie** — a Ø0.016 run across the top of rib1, port to starboard, both ends in small flanged ports, passing under one clamp at the centreline.

### 7.2 Runs on the head (`harnessHead`) — 6 runs

10. **Left eye feed** — from a port on the head cheek, up and around the back of `eyeBarrelL`, into `eyeGreeblesL`'s port collar. Entirely in `head` local space? No — the turret rotates, so: the run is **split** at the turret axis. `eyeFeedLProx` is parented to `head` and ends inside `eyeBootL` (a near-black ribbed boot around the turret base); `eyeFeedLDist` is parented to `eyeTurretL` and starts inside the same boot, ending at the turret's port collar.
11. **Right eye feed** — mirrored, same split, same boot.
12. **Beak feed** — from `beakCollar`'s port, back along the head's underside wedge, into a port on `crownUnderPlate`. Split at the waist: `beakFeedDist` on `head`, `beakFeedProx` on `mantle`, meeting inside `headWaistBellows`, which is the boot that hides the seam. (This is the one run that would otherwise span the neck.)
13. **Brow signal pair** — 2 × Ø0.008 from `sensorStalkA/B`'s bases down under `headBrowPlate`'s rear lip into a 2-hole junction block on the head frame. Short, fully on `head`.
14. **Cheek loop L** — Ø0.016, port on `headCheekPlateL`'s sub-plate → a proud 0.04 loop → port on the head frame's lower gusset. 2 clamps.
15. **Cheek loop R** — mirrored, deliberately 0.02 shorter (tidy but not slavish).

### 7.3 Runs at the crown — 4 runs

16–19. **Four crown distribution trunks** — from four flanged ports on the keel's underside, radiating over the crown ring's upper face (in `mantle`/`crown` local space), each landing in a **manifold block** at the 12, 3, 6, 9 o'clock positions of the ring. Each manifold has 2 outlet ports feeding the arms. Clamped twice each. These are what visually connect the mantle to the arm ring and they are on the top surface, so the camera sees them.

### 7.4 Runs on the arms — 2 per arm on the front pair, 1 per arm elsewhere = 12 runs

20–27. **Arm dorsal trunk, one per arm** (8 runs, but each SPLIT at joint 3 into two runs → 16 tube meshes). From the crown manifold's outlet port, along the arm's dorsal groove beside the chain run, under `clampA1/A2` on seg1–seg2, into `armX_midBoot` (a lathed collar at joint 3). Second half: out of `armX_midBoot`, along seg4–seg5, under `clampA3`, into a **blanking port on seg5's frame**. Proximal half parented to seg1, distal half to seg4. Both halves land in fittings at both ends.
28–29. **Oral trunk, front arms only** (2 runs, each split at joint 2 → 4 meshes). Ø0.030 corrugated along the oral face's centreline between the two sucker rows, from a port on `crownUnderPlate` to a manifold on seg3's oral plate. The 6 largest suckers' hose stubs land into this run's small tee fittings.

**Total tube runs in the harness: 9 + 6 + 4 + 16 + 4 = 39 tube meshes across 29 logical runs.** Every one has a visible port, collar or flange at BOTH ends. Nothing has a free end. Nothing sprouts from the head sides or waves in the air.

---

## 8. HARDWARE / GREEBLES — where and how many

Small size class only; each ≤ 1/50 of the body. All dark gunmetal or blued steel unless noted.

| item | where | count |
|---|---|---|
| Bolt heads (hex, Ø0.014–0.022, lathed, 6-sided) | every flange, race, shell edge, socket, rib: 8 per rib (56), 16 crown ring, 6 per arm socket (48), 6 per joint barrel (56×6=336), 10 per eye bezel (20), 12 apex, 14 waist race, 8 gill ports ×2, shell edges ~6 each on 8 mantle + 5 head + 44 arm shells | **≈ 900** |
| Standoff pads (stepped cylinder + bolt) under every shell | 3–4 per shell × 57 shells | **≈ 190** |
| Clamps (a saddle + 2 bolts) where a hose passes a frame member | as listed in §7 | **42** |
| Port collars / flanged fittings (lathed, with a lip) | both ends of 29 runs + 12 sucker stubs | **70** |
| Blanking plates (small bevelled extruded disc/rect with 4 bolts) | mantle top ×4, head ×2, crown ×2, arms ×1 each | **16** |
| Junction blocks (faceted box + 2 ports) | mantle ×3, head ×2, crown ×4, arm seg1 ×1 each | **17** |
| Hinge pins with collars | mantle hatch ×2, head under-plate ×2, beak ×2, eye lids ×2, every joint barrel ×2 (112) | **122** |
| Cable ties (a thin flat band around a hose) | 3 per trunk run | **36** |
| Grab handles (a bent Ø0.010 bar into 2 pads) | mantle top ×2, mantle flank ×2, crown ×1 | **5** |
| Vent grilles (individual slats, not a texture) | gill ports 7 slats ×2, aux module 6, mantle top plates 3×2, crown hub 3, head brow 2 | **≈ 34 slats** |
| Sprocket teeth / gear teeth (small boxes) | mantle 30, gear stacks 36, crown gear ring 40, arm gear stacks 128, head gears 24, beak radula 11 ribs | **≈ 270** |
| Chain links | mantle 34, arms 18×8 = 144 | **178** |
| Sucker units (4 parts each) | 22/20/18/16 per arm as spec'd → 154 suckers | **616 parts** |
| Ridge vanes / web panels / eye slit vanes / arm tip claws | 9 + 8 + 6 + 8 | **31** |
| Stencilled markings (painted, geometry-free, in the shader as a masked region — or a thin decal plate) | "07" on cheekL, a triangle on mantlePlateTopMid, a 3-digit serial on mantlePlateFlankR, hazard diagonals on cheekR | **4 total** |
| Emissive spots | aux module amber slot; one cyan status port on the crown's rear manifold | **exactly 2** |

Repetition is TIDY: bolt rows evenly spaced and equal, left and right matching, hoses parallel and combed. Deliberate asymmetry is exactly two units: `mantleAuxModule` (top-left-rear) and `mantleHatch` (top-right) — placed on purpose, not scattered.

---

## 9. PALETTE — part by part

**Materials (4+, all MeshStandardNodeMaterial / MeshPhysicalNodeMaterial):**

- **MAT_SHELL** — painted shell. base `#D8D2C6`, metalness **0.12**, roughness **0.60**. Used on: all 8 mantle plates, apex cap, ridge vanes, dorsal ridge, hatch, crown hub plate, crown under plate, all 8 web panels, head brow/nose/cheek/under plates, eye brow hoods, eye lid plates, all 44 arm shells, sucker rims, arm tip claws, funnel lip ring, beak upper/lower outer faces.
- **MAT_SHELL_SHADOW** — `#C9C2B4`, same finish. Used on: inside faces of DoubleSide shells, web panel undersides, crown under plate, mantle underside plates. (Distinguishes the inner surfaces so DoubleSide shells read.)
- **MAT_SHELL_WORN** — `#B5AC9C`, metalness 0.15, roughness 0.66. Used on: the shells on the rear arms' seg1 (the ones that scrape), the heel blocks' top plate, the crown ring's hub plate rim, mantle plate leading edges via the shader mask rather than a separate material where possible.
- **MAT_MACHINE** — gunmetal `#55524C`, metalness **0.82**, roughness **0.55**. Used on: all ribs, keel, blocks, spacer blocks, arm segment bodies, joint barrels, head frame block, eye barrels, crown ring, funnel barrel, sprockets, gear discs, ducting.
- **MAT_MACHINE_BRIGHT** — `#6B665E`, metalness 0.85, roughness **0.45**. Used on: machined faces — polished ram rods, bearing race faces, cover plates, hub faces, sucker pistons, radula drum, gear tooth faces, hinge pins.
- **MAT_STEEL_BLUED** — `#3E3A34`, metalness 0.78, roughness 0.62. Used on: recesses, vent interiors, the insides of gaps, ram barrels, chain links, threaded rod, tie rods, torsion bar, bolt heads.
- **MAT_BRONZE_WORN** — `#4A4238`, metalness 0.80, roughness 0.68. Used on: contact surfaces — sucker seats, joint barrel wear rings, heel block skid faces, the crown gear ring's teeth, the beak tines' bases. Reads as oiled/worn.
- **MAT_RUBBER** — `#1E1D1B`, metalness **0.0**, roughness **0.92**. Used on: all 39 hose meshes, all boots and bellows, gaskets, sucker boots, cable ties, the waist bellows.
- **MAT_LENS** — `#141312`, metalness **0.10**, roughness **0.07**, a faint clearcoat. Used ONLY on: `eyeLensL`, `eyeLensR`. Two parts. Nothing else on the body goes below roughness 0.45.
- **MAT_ACCENT_RUST** — `#C2521E`, metalness **0.08**, roughness 0.62. Used on exactly **3 plates**: `mantleHatch`'s outer face, the `mantleAuxModule`'s front panel, and `crownHubPlate`'s single small bolt-on sub-plate. That is roughly **1.5% of visible surface.**
- **MAT_ACCENT_RED** — `#A8231C`. Used on exactly **1 part**: a 0.05 × 0.02 tab on the funnel valve block (the arming flag). Total accent ≤ 2% of surface.
- **NO ACCENT ANYWHERE ON THE HEAD.** No accent on any eye part, brow, nose, cheek, beak, tooth, or sensor stalk. Confirmed by the list above.

**Surface tally:** bone white shells ≈ 50% of visible area (mantle top and flanks, web, arm dorsal shells — the big areas), dark machine ≈ 41% (every gap, every joint, the whole underside, the arm oral faces, the frame), near-black cable/boots ≈ 7%, accent ≈ 2%.

---

## 10. THE SHADER (TSL) — wear, driven off form, no lattices

One shared wear function, parameterised per material, applied via `.colorNode` and `.roughnessNode`. **No `fract(positionLocal * f)` panel lines anywhere. No `step(k, hash(floor(pos*f)))` speckle anywhere.**

Inputs: `positionLocal`, `normalLocal`, plus per-mesh uniforms `uPartCentre` (vec3), `uPartRadius` (float), `uBaseColour`, `uWearAmount`.

1. **Smooth value noise at 3 octaves** — implemented as a hash-and-smooth-interpolate (`smoothstep` between lattice hashes) so it is CONTINUOUS, not blocky; frequencies 3.0 / 7.5 / 19.0 with amplitudes 1.0 / 0.5 / 0.25, in the part's LOCAL space and divided by `uPartRadius` so the noise scale is consistent in world terms across parts of different sizes. Result `n` in 0..1, irregular in both blob size and spacing.
2. **Edge mask** — `edge = 1 - smoothstep(0.55, 1.0, length((positionLocal - uPartCentre) / uPartRadius))` inverted, i.e. **high near the part's outer boundary**, falling to ~0 by 55% of the radius. Combined with a facing term `pow(1 - abs(dot(normalLocal, nearestAxis)), 2)` approximated by `pow(oneMinus(abs(normalLocal.y)), 1.5)` on horizontal-plate parts, so corners and rims get the most. **Chipping = `step(0.62, n * (0.35 + edge))`** → bare metal `#6B665E` blended in. Plate CENTRES stay clean because `edge` is ~0 there and the noise alone never crosses the threshold.
3. **Rust bleeding DOWNWARD from fasteners and seams** — a second field: take the local Y **below** the part's top, `drip = clamp((uPartCentre.y + uPartRadius*0.5 - positionLocal.y) / (uPartRadius*1.2), 0, 1)`, multiply by a **vertically-stretched** noise sample (frequencies 9.0 in X/Z but 1.6 in Y, so the noise elongates into streaks that run with gravity, not with the surface). Mask by `edge*0.6 + 0.4`. Blend toward `#4A4238` then a touch of `#C2521E` at only 25% strength at the streak cores. Streak strength peaks 0.12–0.35 of the plate's height below its top edge and fades.
4. **Grime in recesses and crevices** — darken by up to 0.30 where `normalLocal.y < 0` AND the noise's low octave is high: `crev = smoothstep(0.0, -0.6, normalLocal.y) * smoothstep(0.35, 0.8, nLow)`. Multiplies base toward `#3E3A34`. Also applied unmasked-by-normal inside vent slots and behind shell lips (those regions get a uniform-crevice boost via a per-mesh `uCrevice` uniform set at build time for interior meshes).
5. **Dust on upward faces** — `up = clamp(normalLocal.y, 0, 1)`; lighten base by `mix(0, 0.07, up*0.8)` toward `#C9C2B4`, and **raise roughness** by `up * 0.16` (so top faces read matte and dusty, side faces less). Roughness is additionally raised by `crev * 0.15` in the recesses. Roughness never drops below **0.30** on any body panel (clamped), and the two lens meshes bypass the whole wear shader.
6. **Paint worn thin at high points** — on shells only: `high = pow(clamp(dot(normalLocal, normalize(vec3(0,1,0.35))),0,1), 3)`; mix base toward `#B5AC9C` by `high * 0.35 * uWearAmount`. This is what makes the white read as painted metal on the top surfaces the camera sees.
7. **Markings** — 4 total, each a small analytic mask in the part's local UV (a triangle via 3 half-plane tests; a numeral via a couple of box tests; hazard diagonals via `step(0.5, fract((u+v)*6.0))` **confined to a 0.10 × 0.03 rectangle by a box mask** so it cannot become a lattice over the body). Painted in `#3E3A34` on the white plate, and eroded by the chip mask so the stencil is worn.
8. **Emissive** — `.emissiveNode` only on the 2 named emissive meshes: aux module slot `#C2521E`-ish amber at intensity 1.6, crown manifold status port cyan at 1.2, each a 0.02 × 0.05 rectangle. Everything else `emissiveNode` unset.

---

## 11. THE UPWARD-FACING SURFACES — the only view that matters

Camera is fixed at **36° above horizon**. Everything below is on the top, and it is where the design budget goes.

**On the mantle top (the largest area on screen):**
- Three overlapping top plates with **two visible lap seams** running across the body, the forward plate over the one behind, each seam showing a 0.05 band of the **spine chain run and its two sprockets** in the trough beneath.
- The **dorsal ridge** with its 9 individual overlapping blades rising and falling along the crown — the strongest top-view feature, and the thing that says "armoured" from above.
- A **raised centre rib** on each top plate, plus **2 vent slots per plate** (recessed, with dark interiors and individual slats where they're big enough).
- **Bolt rows** along every plate border: a row of 8 down each long edge of each top plate, evenly spaced, plus 12 around the apex cap.
- **`mantleHatch`** standing 8° open, top-right, showing dark interior + junction block + its short loom. Rust-orange outer face — one of only three accent plates.
- **`mantleAuxModule`**, top-left-rear: a faceted housing, 6-slat vent grille, rust-orange front panel, and the amber emissive slot.
- **Two grab handles** on the top plates, bent bars into pads.
- Two of the four **crown distribution trunk hoses** are routed across the top of the crown ring where the camera sees them, with their clamps and manifold blocks.
- Stencils: a small triangle on TopMid, a serial on the starboard flank's upper edge (just catches the 36° view).
- Wear: dust and worn-thin paint concentrated exactly here, streaks running down off the plate edges and off every bolt row.

**On the head top:**
- `headBrowPlate` with its centre rib, 2 vents, scalloped bites over the eyes, and its front edge lapping over the nose wedge — a clear, readable step.
- The **two eye brow hoods** standing proud, each with its bezel ring, bolt ring, and the **dark lens visible below and outboard**, set back and shaded — from 36° above you look slightly INTO the lenses, which is exactly why they must be recessed dark glass and not lamps.
- Two short sensor stalks and the brow signal wire pair.
- The waist race's 14-bolt face and the bellows, visible in the gap between mantle and head from above.

**On the arms (all eight, radiating — a huge share of the top-view area):**
- The **dorsal shells**, each stopping short of its joint so you see a band of joint barrel, bearing race and boot at every one of the 56 joints from above. This repeated white-plate / dark-barrel / white-plate rhythm down every arm is the top-view signature of the whole creature.
- Each arm's **chain run** and **sprockets** run along the dorsal groove beside the shells and are visible from above along their whole length.
- Each arm's **dorsal trunk hose**, clamped, with its mid-boot at joint 3 — visible from above.
- **Raised ribs** and vent slots on the seg1 and seg2 shells (the biggest arm shells).
- Bolt rows down each shell's edges.
- The **coiled tips** — three articulated links and a claw, curled up — are read from above as eight small spirals, which is a strong octopus cue.
- The **8 web panels** between the arm bases, scalloped and lapped, forming a pale wheel around the crown from above, with the crown gear ring showing through the rear 40%.

**What is deliberately NOT invested in:** the mantle underside (keel, blocks, ducting — correct and solid, but plain), the oral faces of the rear arms, side-elevation-only detail.

---

## 12. THE POSE FUNCTION — full behavioural spec

`object.userData.pose = (s) => {…}` writes the WHOLE pose every call from the rest pose outward. No accumulation. Internal helper: `armPose(arm, params)` sets the 7 segment rotations, the tip links, the shells' standoff (no), the sucker pistons, and the eye lids.

### 12.1 The gait decision

**An octopus on land does not walk on legs — it CRAWLS.** The gait is:
- **The two rear arms (L4/R4) are the drive** — they push in alternating strokes.
- **The four middle arms (L2/R2, L3/R3) are the stance/support**, moving in a **metachronal wave** — a travelling wave of stepping that passes from rear to front around the crown, so at any moment 3 or 4 arms are planted. This is the correct octopus crawl and it looks like nothing else.
- **The front two arms (L1/R1) reach and probe**, feeling ahead, not weight-bearing at low speed. At high speed they get thrown forward and pull.
- The mantle **heaves** — it rises and falls once per stride and pitches nose-down as the body is dragged forward.

Per-arm phase offsets in the metachronal wave (fraction of `s.stride`): R4 = 0.00, L4 = 0.50, R3 = 0.14, L3 = 0.64, R2 = 0.28, L2 = 0.78, R1 = 0.42, L1 = 0.92. (Left/right in antiphase, rear-to-front wave.)

Each arm's own cycle from its local phase `p = fract(stride + offset)`:
- **p 0.00–0.55 = STANCE**: the tip is planted; seg1 sweeps backward through `−strideArc/2 → +strideArc/2` (in the arm's own yaw), the mid joints straighten by `pull` to drag the body forward, the tip stays coiled and gripping, and the **sucker pistons on that arm extend** (grip).
- **p 0.55–1.00 = SWING**: the arm lifts (seg2/seg3 flex up by `lift`), yaws forward, and the tip uncoils then re-coils as it re-plants. Sucker pistons **retract** during swing (0.4 of rim depth).

### 12.2 Speed samples — what CHANGES at each

| | speed 0 | 0.5 | 1 | 2 | 3 | 6 |
|---|---|---|---|---|---|---|
| gait | idle | creep (gathered) | crawl | **crawl→haul: front pair join in, become weight-bearing** | haul | sprint-haul |
| mantle height y | 0.42 | **0.34** (lower) | 0.42 | 0.47 | 0.52 | **0.56** (extended, body lifted and flat) |
| mantle pitch | −12° | −16° (gathered, nose down) | −13° | −10° | −7° | **−4°** (flat, in line) |
| head pitch (extra) | +2° scan | −8° (low, stalking) | −4° | −2° | 0° | **+4°** (in line with the spine) |
| strideArc (seg1 yaw sweep) | 0 | **±16°** (short ground, long in time) | ±22° | ±28° | ±33° | **±40°** |
| lift (swing height) | 0 | 8° | 14° | 20° | 26° | **34°** |
| pull (mid-joint straightening) | 0 | 6° | 12° | 20° | 28° | **38°** |
| splay (outward yaw) | 0 | +5° (gathered in… no: −4°, arms tucked) | 0 | −3° | −6° | **−10°** (arms pulled in toward the axis, streamlined) |
| front pair L1/R1 | probing, hovering | slow sweep, hovering | slow sweep, hovering | **planted, pulling, phase 0.42/0.92** | pulling hard | thrown far forward each cycle, tips at z +2.1 |
| duty factor (fraction planted) | — | 0.72 | 0.62 | 0.55 | 0.48 | **0.40** (suspension: sometimes only 2 arms down) |
| tip curl | full coil | full coil | coil | looser | looser | **loosest**, tips trailing |
| funnel | idle, slight sway | — | — | pitched back 8° | back 14° | **back 22°, thrusting** (jet-assisted) |
| dorsal ridge vanes | flat | flat | flat | +4° each | +7° | **+11° raised** (flared) |
| mantle "breathe" | ±0.012 scale on X/Z at 0.55 Hz | ×0.7 | ×0.5 | ×0.4 | ×0.3 | ×0.2 |

**Speed 0 (stand) idle hardware, all off `s.t`, none of it off stride:**
- Mantle scale breathes ±1.2% on X and Z (the mantle inflating/deflating — an octopus's actual respiration) at 0.55 Hz; the two gill ports' slat groups counter-rotate 3° with it.
- A slow weight shift: crown yaws ±1.4° and rolls ±1.0° over an 11-second period, and the mantle's y drops 0.012 on the loaded side.
- The head yaws ±11° and pitches ±5° scanning, at 0.13 Hz with a slight hold at the extremes (shaped with smoothstep, not a sine).
- Each eye turret independently tracks: turret roll ±7°, and the eye **lid plates** blink — a 0.11 s closure every 3.4 s (left) and 4.1 s (right), never together.
- Arm tips: each of the 8 tips slowly uncurls and recurls with its own phase (`sin(s.t*0.4 + i*0.9)` × 9°) — the arms are never still, which is the single most important idle read for this creature.
- Two front arms drift ±0.05 in yaw, feeling the air.
- The funnel sways ±3° in yaw.

### 12.3 Overlays (written as differences added onto the gait)

- **turn-left (`s.turn = −1`)**: mantle **rolls −11°** (banks into the turn) and yaws −7° at the crown; head yaws **−26°** and rolls −8°; the left eye turret rolls −10°, the right +4°. Left-side arms (L1–L4) shorten their stance — `strideArc × 0.55`, mid joints flexed +9° more (tucked, pivot arms); right-side arms lengthen — `strideArc × 1.35`, `pull × 1.3` (they reach and drag around). The rear-left arm plants and holds as the pivot (its swing phase is suppressed 60%). The funnel yaws −18°. Dorsal ridge vanes yaw −6°. Web panels on the left compress 6% in scale.
- **turn-right**: exact mirror.
- **airborne (`s.grounded = false`)**: **no stepping at all** — the stride input is ignored for the arms. This creature is a swimmer, so airborne = **jetting**: mantle pitches nose-**up** +8°, the **eight arms trail straight back** in a tight cone (all seg1 yaw pulled to within 22° of the −Z axis, all joints straightened to within 6° of each other, tips uncoiled to 12°), the **web panels close** into a bell (scale 0.9 on the spanning axis, rotated inward 14°), the **funnel swings fully forward-down** and pitches to −38° (thrusting backwards, i.e. mouth of the nozzle pointing forward-under) with its rams extended, the **mantle contracts** on X/Z by 6% in a 2.4 Hz pulse (jet pumping) and the gill port slats snap shut. Head pitches in line, +6°. Eye lids open wide (0°). Tips flutter ±5° at 3 Hz. This is unmistakably a jetting octopus and unmistakably not walking.
- **hurt (`s.health = 0.2`)**: added as difference. The **left side favours**: mantle rolls +7° (away from the left), drops 0.05 in y, and pitches −5°. Head sags **−17° pitch** and yaws −9° left. Left eye lid plate **60% closed** and stays there; right 15%. The **left-front arm (L1) hangs dead** — all its joints go limp: seg1 elevation −12°, joints 2–6 each −24° with a 0.9 Hz droop wobble of ±3°, tip uncoiled to 8° and dragging on the ground; it contributes nothing to the gait. `L2`'s stride amplitude ×0.5. The dorsal ridge vanes drop to −4° (flattened). One shudder: a 0.02 twitch on the mantle at 1.7 Hz. Sucker pistons on the left half only 60% extended.

### 12.4 Actions — all 16, driven by `s.phase`

Each is described as key poses at phases; interpolate with smoothstep between them. All return toward standing at phase 1 except `die` and `sleep`.

**`attack`** — the strike is the **two front arms plus the beak**. 0.00–0.25 wind-up: mantle rears back and up (+0.10 y, pitch +14°), the two front arms **coil back and up** high over the head (seg1 elev to +54°, mid joints flexed to a tight S, tips coiled hard), the six rear arms plant wide and brace (splay +12°, heel blocks down), the under-plate hinges open 18°, beak lower opens 12°. 0.25–0.50 **commit**: the front arms **whip forward and down** through the front — seg1 elev to −20°, all joints extending in a whip that travels distal-ward with a 0.06-phase lag per joint (so the whip cracks), tips uncoil fully to snatch, sucker pistons slam to full extend; mantle drives forward +0.16 z and pitch −22°; head thrusts +0.07 z; **beak lower opens 34°, tines forward**; the four support arms pull the body in. 0.50–0.72 **hold and crush**: front arms curl inward toward the beak (joints flexing 30°), beak closes hard (lower to 2°), radula drum spins 3 turns, under-plate closes to 4°. 0.72–1.00 recovery back toward the gait, with a slight overshoot of −4° pitch at 0.9.

**`fire`** — the funnel jet. Distinct from attack: **the body stays put.** 0.00–0.35 **aim**: mantle steadies (breathing suppressed to 20%), yaws to face 0, pitch −6°; the **funnel swings out and up** on its gimbal to point forward (+22° pitch toward +Z, yaw to 0) and both funnel rams extend visibly; the head lowers 8° to clear the line of fire; both eye turrets converge (roll inward 9°) and the lids open fully; all eight arms brace, planting wide, splay +8°, and go STILL. 0.35–0.45 **charge**: mantle scale contracts 5% on X/Z over 0.1 phase, gill slats close, dorsal vanes rise 8°. 0.45–0.55 **release**: mantle snaps in 11% on X/Z in 2 frames, the funnel's valve block tab flicks, the funnel lip ring pushes forward 0.02. 0.55–0.78 **recoil absorbed**: mantle pushes back −0.10 z and up +0.04, pitch +9°; the two rear arms take it (their joints flex 16°, heel blocks bite); the funnel barrel kicks back 0.03 along its own axis, rods retracting, then settles; head pitches +6°. 0.78–1.00 settle, mantle re-inflates in a smooth 0.22-phase ramp, arms release brace.

**`hit`** — must read in 0.25 s. 0.00–0.14 **sharp flinch**: mantle recoils −0.13 z, rolls +13°, pitch +11°, yaws +6°; head snaps −22° pitch and +14° yaw (away); both eye lids slam to 75% closed; all eight arm seg1s snap up 15° and the mid joints flex 20° (the whole animal balls up 12%: crown scale 0.94); the dorsal vanes flare +14°; web panels contract 8%. 0.14–0.42 **overshoot the other way** by 35% of the flinch. 0.42–1.00 damped settle: two decaying oscillations toward standing, amplitudes 0.30 and 0.10, plus the lids reopening over 0.3.

**`block`** — brace. Weight back and down: mantle drops **−0.12 y**, moves **−0.10 z**, pitch **+18°** so the thick apex-and-crown mass presents up-forward, and the head **tucks down and back behind the crown** (pitch −30°, z −0.06) with the under-plate closed tight (0°) and both eye lids 55° closed. The **two front arms and two front-lateral arms fold up into a shield** across the front: seg1 elev +40°, seg2 −10°, seg3 −45°, seg4 −55° — a tight bracket of overlapping dorsal shells facing +Z, tips coiled hard and locked; the **web panels between them stretch across** the gap (they are parented to the arms so they follow). The **web panels are the shield surface** — this is the correct octopus answer and it uses geometry that already exists. The four rear arms plant maximally wide (splay +18°) and low, joints flexed, heel blocks driven into the ground. All sucker pistons fully extended (gripping). Held for phases 0.15–0.85, eased in and out. Dorsal vanes fully raised +16°.

**`gather`** — reach down and take. 0.00–0.30 **descend**: mantle drops 0.20 y, pitch −24°, moves +0.08 z; the six rear arms splay and flex to lower the body; head pitches −26° looking down; both front arms extend forward-down, seg1 elev −8°, joints unfurling, tips uncoiling from 40° to 6°. 0.30–0.50 **close on it**: the front arm tips and the last 3 segments **coil around** the object (joints 5, 6, 7 and all 3 tip links flex to 55–70°), sucker pistons on those segments slam to full extend one after another distal-to-proximal over 0.08 phase (a visible grip wave down the arm), under-plate opens 14°. 0.50–0.80 **lift**: mantle rises to 0.05 above standing, pitch +8°; the front arms fold up and back toward the beak, elbows (joints 2–3) drawing the load in to z +0.35, y 0.55; the other six take the load (joints flex 10°). 0.80–1.00 settle to standing carrying it, front arms held curled and forward at elev +18°, tips clenched — this is the residual carry pose.

**`deposit`** — the reverse, and slower (all timings 1.4× longer, no snap anywhere). 0.00–0.22 lean forward, mantle pitch −10°. 0.22–0.55 the front arms **extend down and forward**, unfolding smoothly, joints 2–3 opening, taking the load to the ground at z +0.75, y 0.06. 0.55–0.72 **release**: sucker pistons retract in a wave proximal-to-distal (opposite direction to gather), tip links uncurl from 65° to 10° over 0.12 phase, held. 0.72–1.00 the arms withdraw, mantle rises and pitches back to −13°, front arms return to the probing rest pose. Head watches it the whole way (pitch −20° until 0.8, then up).

**`eat`** — **cycles 3 times.** Baseline: mantle down 0.14 y, pitch −20°, head pitch −30° (head down to the source at z +0.6, y 0.10), under-plate hinged open 26°, the four front arms curled inward under the head making a feeding basket (joints 4–6 flexed 45°, tips coiled at the mouth). Then 3 cycles of `c = fract(s.phase * 3)`:
- c 0–0.35: beak lower opens 30°, radula drum spins forward 1.2 turns, the two front arm tips push inward 0.03 toward the beak.
- c 0.35–0.7: beak closes to 3°, a small crush judder (mantle y −0.012 twice), head pitches an extra −4°.
- c 0.7–1.0: beak part-opens 10°, head lifts 3°, drum reverses 0.3 turn, the tips withdraw and re-coil.
Overlaid: the mantle breathes at 2× normal rate; the gill slats pulse; the eye lids at 40% closed (the "eating" squint); the four rear arms hold planted and still.

**`drink`** — slower, stiller, held. 0.00–0.30 head and body **down** to the source: mantle y −0.18, pitch −26°, head pitch −38°, front arms brace on the ground either side of the mouth (they PLANT — seg1 elev −16°, tips flat at y 0.02, sucker pistons extended), under-plate open 12°, beak open only 8°. 0.30–0.78 **HELD dead still** — the only motion is the mantle breathing at 0.5× rate and a slow 0.7 Hz swallow ripple travelling up the head and into the mantle (a 0.008 scale bump moving from head z 0.5 to mantle z −0.5); the radula drum turns slowly and continuously; eye lids 65% closed. 0.78–1.00 head lifts smoothly, beak closes, body returns, one small head shake at 0.94 (yaw ±4°).

**`jump`** — for this body a jump is a **jet launch off the arms.** 0.00–0.35 **crouch and load**: mantle drops to y 0.24, pitch −18°; **all eight arms coil like springs** — seg1 elev drops to −6°, joints 2–4 flex to a tight Z (35°, −50°, 40°), tips gripping hard, sucker pistons full extend; the mantle **inflates** (scale +7% X/Z over 0.35 — filling with water); web panels expand 5%; dorsal vanes flatten to 0. 0.35–0.72 **extension**: every arm joint straightens in a distal-to-proximal wave over 0.2 phase, driving down and back, seg1 elev to +30°; mantle **rises to y 0.72 and pitches +16° nose-up**; the funnel snaps to −40° and its rams extend (jetting down-back); mantle contracts 9%. 0.72–1.00 **committed and reaching**: mantle at y 0.78, arms streaming back and down, the two front arms **reaching forward and up** (elev +46°, uncoiled to 14°) for the arrival; tips open. It ends here — the `airborne` overlay takes over.

**`land`** — 0.00–0.22 **reach**: arms all swing forward and down to meet the ground, seg1 elev −14°, joints extending, tips uncoiling to 8° and splayed wide (splay +16°), mantle pitch +6°, head up +10°, lids open. 0.22–0.42 **contact and compress**: mantle drives down to y **0.20** (deep compression, 0.22 below standing), pitch −8°; every arm joint flexes to absorb, joint2 +26°, joint3 −44°, joint4 +38°; the dorsal ridge vanes slam flat; web panels squash 9%; sucker pistons all extend at 0.26 (the grip on landing); head pitches −16° with a 0.03 z overshoot. 0.42–0.72 **push back up**: arms extend, mantle rises through y 0.46 (a 0.04 overshoot above standing at 0.62) and settles. 0.72–1.00 settle to standing exactly, with a decaying ±0.012 y bounce.

**`signal`** — the display, and for an octopus that is **flaring the web and standing tall.** 0.00–0.20 **gather**: mantle drops 0.06, arms draw in slightly, breathing stops. 0.20–0.45 **rise and open**: mantle climbs to y **0.68** (0.26 above standing) and pitches +22° nose-up, presenting the pale mantle top at the viewer; **all eight arms sweep outward and upward** — seg1 elev to +38°, splay to +26°, joints straightening — so the **8 web panels spread into a full flared bell** (this is the signature display and it is why the web is 8 separate panels); the **dorsal ridge vanes rise to +22° and fan out 8° each** in a travelling wave from rear to front; the **funnel flares forward and up** +30°; the head rears back, pitch +18°, both eye lids snap fully open and the turrets roll out 12° (eyes wide and staring); the beak opens 24° and the under-plate hinges to 30°; the gill port slats open fully; the mantle inflates +9% X/Z. 0.45–0.72 **HOLD** — a slow 1.1 Hz tremor of ±2° through the arm tips and ±0.008 in mantle scale, so the hold is alive; the vane wave keeps travelling. 0.72–1.00 **come back down**, easing, arms folding in, mantle settling, lids returning to 12°, beak closing, vanes flattening.

**`sleep`** — ends where it ends and stays. 0.00–0.35 **lower**: mantle sinks from 0.42 to **0.18 y**, pitch −6°; all arms flex and take the weight lower, splay +12°. 0.35–0.70 **fold**: the eight arms curl inward and over the body one after another in the metachronal order (each takes 0.10 of phase) — seg1 elev +22°, joints 2–5 flexing to 40/−55/45/−35 so each arm makes a tight coil laid AROUND and OVER the mantle's lower flanks; the two front arms fold last and cover the head; the **web panels close over the crown**; the tips coil to 70°. 0.70–0.90 **shut down**: mantle down to y **0.13**, pitch −4°; head tucks fully under (pitch −40°, y −0.05); both eye lids close to **95%**; dorsal vanes flatten to −6°; funnel folds down flat against the flank (pitch −52°, yaw +40°); gill slats mostly closed; sucker pistons all retract. 0.90–1.00 go still: motion decays to a residual 0.28 Hz breath of ±0.5% mantle scale and nothing else. **The last frame is the resting pose and it holds.**

**`wake`** — ends exactly on standing. 0.00–0.18 **first stir**: one eye lid cracks to 55% then 30%; the mantle breath deepens to ±1.5%; two arm tips uncurl 12°; nothing else moves. 0.18–0.42 **the push**: the four rear arms unfold and plant, joints extending, sucker pistons extending in sequence; the mantle lifts from y 0.13 to 0.30 with a visible strain (pitch −16°, i.e. nose down as it heaves up); the head untucks to pitch −12°. 0.42–0.72 the front four arms unfold and plant, web panels opening, mantle rising to y 0.46 (a 0.04 overshoot); the funnel swings back to its rest gimbal angle; both lids to 0% (wide) briefly at 0.6. 0.72–1.00 **settle**: mantle to exactly y 0.42, pitch −12°; all arms to the exact rest table in §6; lids to 12%; one head shake (yaw ±6°) at 0.86; on the last frame every value equals the standing pose so there is no pop.

**`die`** — goes down and STAYS down. `s.health` also runs 1→0 and is ignored (the phase drives it). 0.00–0.12 **the hit registers**: mantle rears, pitch +16°, y +0.06, all arms snap out rigid (splay +20°, joints straightening), dorsal vanes flare +18°, lids wide, beak open 20° — a last spasm. 0.12–0.34 **collapse**: strength goes out from the front backward — the front two arms buckle first (joints going limp to −30/−15/−25, tips uncoiling and dragging), then the laterals at 0.20, then the rears at 0.28; the mantle **falls** to y 0.16 with a slight overshoot to 0.13, **rolls +26°** onto its left flank, pitch −10°, yaws +9°. 0.34–0.55 **the flop**: head hangs (pitch −44°, roll +14°), under-plate hangs open 22°, beak hangs open 14°, funnel droops to −48° and swings loose ±6° with a decaying wobble; each arm's joints go to their limp values with independent 1.3–2.1 Hz decaying wobbles of ±4° so they settle at different times; sucker pistons all retract; the web panels sag (rotated 12° down). 0.55–0.80 **last twitches**: two decaying 0.020 spasms in the mantle scale, one arm (R3) twitches 9° at 0.62 and again 4° at 0.71, both eye lids close to 88% at 0.66 and stay. 0.80–1.00 **still**: mantle rests at y **0.15, roll +26°, pitch −10°**; all eight arms limp and splayed on the ground, tips uncoiled to 6°, three of them crossed over each other; dorsal vanes flat at −8°; breathing gone entirely — zero motion on the last frame. **The last frame is a wreck on the ground.**

**`evolve`** — braces, opens along its seams, holds, closes. 0.00–0.22 **brace**: all eight arms plant wide and lock (splay +14°, joints flexed, all sucker pistons full extend), mantle drops 0.06 and pitches −4°, head tucks −10°, everything goes rigid (breathing stops), a 12 Hz ±0.004 tremor of effort in the mantle scale. 0.22–0.48 **open along the seams** — this is the money shot and it uses the shell hierarchy: the **three mantle top plates lift and separate** on their standoffs (TopFwd +0.055 y and +0.04 z, TopMid +0.045 y, TopAft +0.035 y and −0.03 z, each also rotating 7–11° about its own outer edge so it hinges open like a hood), revealing the **spine chain, sprockets, blocks and ribs** beneath, lit by nothing but their own dark metal; the **two flank plates swing out** 14° on their front edges; the **apex cap slides back 0.05**; the **dorsal ridge vanes rise to +26° and splay 10° each**; the **head brow plate lifts 0.03 and 9°**, the **cheek plates swing out 12°**, the **under-plate drops 30°**; **every arm's seg1 and seg2 shells lift 0.02 and rotate 8° outward** (all 16 of them, in a wave rear-to-front over 0.1 phase) showing the joint barrels and chain runs; the **web panels tilt up 16°**; the mantle **inflates 8%**; the two emissives brighten ×2.2. 0.48–0.70 **HOLD at the top** — everything open, a 2.6 Hz ±0.006 strain tremor through the whole body, the arms trembling ±3° at the tips, the chain runs' visible links shifting 0.01 along their paths (the mechanism working). 0.70–0.94 **close down**, in the reverse wave — arm shells first, then flanks, then the top plates settling one under the next with the laps re-seating, vanes flattening, brow dropping, mantle deflating — and **it closes harder than it opened**: at 0.90 everything is 0.006 below its rest standoff (clamped tight) before easing back. 0.94–1.00 exactly standing.

### 12.5 `userData.update`

Also provided, as a small fallback: a 0.28 Hz mantle breath and a slow arm-tip curl, so a build with no situation driver still shows life. It writes only the mantle scale and the 8 tip-link rotations, and `pose` overwrites both whenever it is called.

---

## 13. FINAL CHECKS AGAINST THE NINE NUMBERS

1. **Leading end > any limb** — head 62 named parts vs richest arm 55. ✔
2. **Four kinds in the gaps, none > 25%** — mantle: 6 kinds, max 24%. Arms: 5 kinds, max 26% (joint barrels+races; reduce shell count by one on the rear arms if needed to bring it to 24%). Repeated hoses are counted as harness, not as gap mechanism. ✔
3. **Every digit three links and a tip** — all 8 arm tips are tipLink1/2/3 + tipClaw. ✔
4. **Zero saturated accent** except 3 rust plates + 1 red tab ≈ 2% of surface, **none on the head**. ✔
5. **Neck ≤ one head long** — 0.18 vs head length 0.55. ✔
6. **Torso thickest and widest** — mantle 1.30 W × 0.95 H vs thickest arm 0.33. Reads from front and top. ✔
7. **Shells curved and overlapping** — every shell is a partial cylinder, partial sphere, or path-extruded plate; 57 shells, all lapped with a stated direction. ✔
8. **Every cable moves with its part** — 29 logical runs, all local, split at 6 joints into boot/collar meetings, 39 tube meshes, nothing regenerated in `pose`. ✔
9. **Wear on edges** — edge mask × noise for chipping, gravity-stretched streaks below fasteners, crevice grime, clean plate centres, dust on upward normals. ✔

Rule Zero: from the black silhouette above — a wide pale dome, two side-bulging eye lumps on the narrow end, eight thick-to-thin curling arms crowded forward. **Octopus, in one second.**