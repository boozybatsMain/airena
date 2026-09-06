# AIRENA arena — build brief

Direction: **c1's place with c4's discipline.** Geometry stays the game's (`src/core/config.js`: ARENA_HALF 20, WALL_HEIGHT 4, six OBSTACLES at h 3.2). HALF = 20 m.

## 1. The idea in three sentences

The field is a sunken square card in a bright, empty plaza: the 4 m collision wall becomes the pit's retaining face, so the boundary reads at a glance without a fence or a line. One warm matte plaster in the site's palette under a single low sun, shadows the only detail: six solid cover blocks read by lit top, shaded side and shadow, and the floor carries nothing but the telegraphs. Beyond, quiet and far: two tier wings in haze, one coral banner, one pale planet upper-right.

## 2. Layout

- **Walls**: collision boxes stay at ±HALF, rendered as the pit face with the plaza on top at y=4. **Coping**: one 0.6 m band at plaza level; a 0.2·HALF notch with steps at the centre of the ±z walls is its only break. Whichever wall (with its apron to 0.4·HALF) is between camera and field fades to the coping via the existing SOLIDS fade.
- **Cover**: exactly the six OBSTACLES from config, plain boxes: flat tops, sharp edges, no recess, bevel or paint; a block between camera and fighter fades to 35%.
- **Floor marks**: an inset square 0.1·HALF inside the walls and a 3 m centre cross, 6 cm wide. Nothing else.
- **Plaza**: flat at y=4 to 2.25·HALF, 4 m hairline grid at ≤4% contrast; nothing over 0.5 m within 0.4·HALF of the wall.
- **Tiers**: two wings on ±x only, from 2.25·HALF: 8 plain steps of 0.9×2.4 m, ~3·HALF long, no seats or lights; one plain slab per wing, 2·HALF×6×0.8 m, 12 m up. The ±z sides stay open plaza.
- **Banner**: one 1.6×6 m plane on the −z axis at 2.5·HALF. **Planet**: one sphere ~10° across, ~35° right of −z, lower limb ~6° above the tiers, fog:false.
- Nothing decorative inside 2·HALF, nothing above 17 m; add a low establishing framing (6 m high, 30 m out) for VS/intro/result.

## 3. Materials and colours

All solids MeshStandardMaterial, roughness 0.92, metalness 0, no envMap, varied by colour only.

- Floor #E3D6C7, rendering ~#E6DBCF (Lab L 88–90); marks #C9B8A7 at 60%.
- Pit face #DCCFC0 (lit ~#E4D8CA, shaded ~#CFC1B1); coping #F4EEE8.
- Blocks: top #EADFD2 (+3 L over floor), sun side #D6C7B6, shade side #C9B8A7 (−10 L).
- Plaza #EBE1D9, grid #DCD0C3; tiers and slabs #E8DDD0.
- Banner #FF7A5C, MeshBasicMaterial, fog:false; planet #E9E0D6 to a #D6C9BB limb.
- Shadow umbra never below #CFC2B3.

Value order: coping > plaza > block top > floor > block side > pit face; nothing darker than --sand except a fighter.

## 4. Light, sky, fog

- **Key**: one DirectionalLight #FFF2E2 from (−0.57, 0.60, 0.57): elevation 37°, over the default camera's left-rear, so a 3.2 m block throws ~4.2 m of soft shadow away from the viewer.
- **Fill**: HemisphereLight #F4EEE8/#C9B8A7 at 0.55. No ambient, bloom or point lights; remove the 0x8FB6F0 rim.
- **Fog**: background = fog = #E4D9CE; THREE.Fog(#E4D9CE, 56, 140): field ≤7% fogged, tiers 30–70%.
- **Sky**: dome, fog:false: #F4EEE8 zenith, #E4D9CE horizon, #D8C3AC below; no sun disc, clouds or texture.
- **Tone**: ACES, exposure so the floor lands at L 88–90 and nothing exceeds #F4EEE8.

## 5. What must never happen

- Anything between camera and fighter: near wall, apron and blocks fade; nothing tall near the wall; tiers, banner, planet beyond 2.25·HALF, off the fighting axis.
- Anything loud behind a fighter: seat striping, strip lights, masts, a second slab or planet, glare.
- Anything on the floor beyond the marks and telegraphs: no grid, rings, brackets, circuit lines or reflections.
- A second accent: coral only on the banner, blue only in own-side telegraphs and HUD; no amber, pink cast, blue-grey stone.
- Contrast loss under telegraphs: umbra ≤13% below floor so a coral zone never reads as shadow; fills 0.85–0.95 α, no white glow; fighters the darkest objects (≤#8D7F73); no white clipping under the HUD glass.

## 6. Image-generator prompt

Architectural visualisation, three-quarter aerial view: a square arena floor 40 m across sunk 4 m into a vast empty plaza of warm off-white matte plaster, plain pit faces, one pale coping band along the edge, the floor inside a slightly deeper matte sand with a hairline inset square and a small centre cross; six solid blocks 3.2 m tall (two slabs, two bars, two cubes) in the same plaster, flat tops a touch lighter than the floor, sides a step darker, sharp edges, soft warm shadows about 4 m long falling away to the right; one low warm sun from the upper left, no other lights; a notch with steps into the pit at the centre of the far edge; empty plaza for 25 m on every side, then left and right only two long low tiers of eight plain steps under one thin floating slab each, dissolving into warm haze; beyond the far plaza one tall thin coral banner (#FF7A5C); sky a smooth gradient from warm white to the haze at the horizon, no clouds; one pale matte planet upper right, a quarter of the frame height; minimalist, calm, No Man's Sky serenity meets Dezeen archviz; no people, text, flags or roof lights; nothing glossy, blue or dark; 16:9.
