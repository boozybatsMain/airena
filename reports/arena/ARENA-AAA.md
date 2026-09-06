# Arena — addendum (founder, 06.09): a world around a quiet field

Two directives, both binding on top of `ARENA-BRIEF.md` and `RENDER-QUALITY.md`.

## 1. Colour is ownership, not slot

**Blue is the player's creature. Orange is the opponent. Always.**

- The viewer currently colours by match slot (`blue`/`orange`). When the
  match message carries `mine`, the palette follows ownership: the player's
  side renders in `--info` (#6EA8FF, pre-toned) and the opponent's in
  `--accent` (#FF7A5C) — floor telegraphs, rings, cast plates, say-bubbles,
  damage numbers, feed name colours, VFX tints that derive from the side
  colour. A spectator with no creature keeps slot colours (blue = first slot,
  orange = second).
- Materials created once per side are re-tinted on every `match` (no
  rebuild): keep references and call `material.color.set(...)`.
- The HUD mirrors: the player's panel is on the **left** and blue, the
  opponent's on the **right** and orange, whatever slot the server assigned
  (`body[data-mine="orange"]` swaps the two `.bar-wrap` positions and their
  colour classes; VS and result cards, the feed dots and the away recap
  follow). The `YOU` marker stays.
- `docs/REDESIGN.md` §2.1 ("colours never change with ownership") is
  superseded by this note.

## 2. The field stays minimal; the world becomes AAA

The field (floor, cover blocks, coping, notch) keeps every rule of the brief:
nothing on the floor but marks and telegraphs, no clutter inside 2·HALF, the
fighters the darkest objects. **Beyond the field the arena must feel like a
built place, not a void.** Targets, all in the warm palette with coral as the
only accent, all beyond 2·HALF and lower than the orbiting camera:

- **Stadium**: a full ring of tiers on all four sides (segmented, with the
  stair notch axes open), not two wings; a thin cantilevered **upper deck**
  ring with a shadow line and a faint underside light strip; vomitories
  (dark openings) rhythmically along the tiers for scale.
- **Banners**: four tall thin coral banners at the axes (the only saturated
  objects), slightly translucent, with a slow cloth sway if cheap.
- **Beyond**: pale megastructure silhouettes — towers, arches, a ring —
  far behind the stadium, 60–90 % dissolved in haze, layered for depth.
- **Sky**: the large textured planet with a soft terminator upper-right, a
  small moon, a smooth warm gradient, no clipping to white.
- **Atmosphere**: light mist pooling beyond the walls, long low sun shafts
  (cheap: additive planes or a screen-space god-ray pass at low intensity),
  drifting dust motes (a small GPU particle system) in the light.
- **Plaza**: seams, coping light line, a few low sculptural elements (never
  taller than 0.5 m within 0.4·HALF of the wall).
- **Final image** (RENDER-QUALITY.md): environment map, soft shadows, AO,
  subtle floor reflections, antialiasing, tone and grade, vignette — the
  richness must read as light and depth, not as objects.
- **Budget**: instanced geometry for tiers/deck/towers; ≥ 30 fps on a
  mid-range laptop at `medium`; the first-frame budget holds
  (`tools/checkboot.mjs`).

Concept targets for the world (generated 06.09, chosen by the lead):

- **`reports/arena/aaa/a2.jpg` is the primary target**: a full ring of tiers,
  a thin upper deck ring carrying tall coral banners at a steady rhythm, the
  huge pale planet with a soft terminator behind the far stand, a small moon
  upper-right, a far gate/pavilion on the −z axis, warm haze. Ignore the
  people in it (the world is empty of people) and the orange floor patches
  (the plaza stays off-white).
- **`a1.jpg`** contributes the layer beyond the stadium: pale megastructure
  towers and trusses far behind the deck, dissolving in haze — at most a
  silhouette layer, never sharp.
- **`a3.jpg`** is rejected: the flag forest and the portal are clutter.
- `reports/arena/c1.jpg` remains the reference for the field itself.
