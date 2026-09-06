# Arena — final-image requirements (founder, 06.09)

The arena is judged as a finished picture, not as geometry. The build must
deliver, in `src/viewer/main.js` (WebGPU renderer, TSL post pipeline already
present as `post`/`postU`, WebGL2 fallback present):

1. **Lighting rig.** Key + fill + rim tuned for bone-and-dark bodies on a
   near-white floor; a real image-based environment (PMREM from a procedural
   sky/room) so materials have specular life; hemisphere bounce in the sky
   and sand tones; shadow map ≥ 2048 with soft PCF, contact-hardening if cheap.
2. **Ambient occlusion.** Screen-space AO (GTAO node) at low radius so the
   blocks, walls and bodies seat on the floor; must not muddy the floor
   telegraph rings.
3. **Reflections.** A subtle planar reflection of the bodies and blocks in the
   floor (reflector node, low intensity, blurred/roughness-driven), or SSR if
   stable; the floor stays near-white — reflections are a hint, never a mirror.
4. **Antialiasing.** MSAA at renderer level where supported, plus a temporal
   or FXAA/SMAA pass in post for edges of the monoline grid, bodies and
   telegraph lines. No shimmer on the grid.
5. **Tone mapping and grade.** AgX or ACES with exposure tuned to the sky
   palette (#EBE1D9 ground reads as ground, not blown out); a gentle warm
   grade; selective bloom kept for VFX only; a soft vignette that matches the
   HUD's dimming; fog for depth beyond the walls.
6. **Depth and atmosphere.** Light mist beyond the field, distant tiers and
   the planet as soft, low-contrast shapes; the field itself always crisp.
7. **Quality tiers.** `high` (all of the above), `medium` (no SSR/AO, MSAA
   only), `low` (WebGL2 fallback: direct lighting + FXAA). Auto-select by
   device pixel ratio and measured FPS; never drop below 30 fps on a
   mid-range laptop; the first frame budget (`tools/checkboot.mjs`) holds.
8. **Evidence.** Every setting is judged from captures: `tools/shots.mjs`
   live states plus a dedicated arena stand page rendered from four camera
   angles, at 1440×900, compared against the concept renders by reviewers.
