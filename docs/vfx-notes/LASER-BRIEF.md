# Laser brief (Airena, stock `beam` delivery for elements without a module: kinetic, void)

Repo: `/Users/boozybats/Public/Repos/work/Airena` (three.js r180, `WebGPURenderer` + TSL, WebGL2 fallback). Code comments in this repo are in **Russian**; write yours in Russian, same voice (explain the *why*, cite measurements). Read `LIGHTNING-BRIEF.md` in this directory first: its "Hard constraints" and "How to build and look" sections apply verbatim here.

## Goal

The founder wants the laser at Path of Exile 2 level. Reference = Nova Beam from the founder's sandbox: `reports/vfx/reference/ref-nova-{150,450,900,1600}.png`, crops `ref-nova-900-crop.png`, `ref-nova-1600-crop.png` in this directory. Today the stock beam (`Vfx.beam` in `src/viewer/vfx.js`, `tubeMat`) is a 0.3 s translucent tube with a few sparks: see the baseline captures in `laser-base/` in this directory (`kinetic-beam-t0_10-broadcast.png`, t0_30, t0_70, t1_20, and the same for void and for the -low/-top cameras): a faint grey cord that is gone by 0.7 s.

## What the reference looks like (measured by eye)

1. **Cast orb.** A soft white faceted sphere ~1.2 m across at the hand (grainy, semi-transparent, bright core), present from the cast and while the beam fires (frames 150 and 450 ms show only the orb: a long charge before the beam).
2. **Beam body.** A translucent pale blue-white cylinder ~0.9 m in diameter from the orb to the target, brightest on its axis, with faint longitudinal streaks like lit fog; edges hazy.
3. **Helix ribbons.** 4–6 bright ribbons (white core, warm orange edges in the reference; use the palette here) spiralling around the tube at radius ~0.5–0.6 m, pitch ~1.5–2 m, ~10–14 px wide at the reference distance, strongly bloomed. They rotate and slide toward the target. Past the impact they unravel into loose curling whips 2–4 m long.
4. **Ring pulses.** Thin white rings (radius ~0.7–0.9 m) perpendicular to the axis, spaced ~0.6–0.8 m, travelling toward the target; thin bright line with a soft glow.
5. **Impact.** A large white translucent faceted dome/bell ~2.5 m across at the target with a bright core; ribbons splay out of it; long whips curl beyond.
6. **Floor.** A dense carpet of small cyan sparkle dots resting on the floor under the whole path, from caster to target, persisting after the beam.
7. **Duration.** Long: still at full power at 1.6 s. In Airena the sim resolves a beam instantly (`e.hit` says whether it connected, `x1,z1` is the end point), so the visual is a held burst: orb 0.15 s before the beam → beam ramps in 0.1 s → holds ~0.7 s (rings stream, helix rotates) → decays 0.3 s; dome at the target ~0.8 s; floor sparkle residue ~2 s.

## Palette mapping

`P = [highlight, body, deep]`: kinetic `['#d8e2ea','#9fb4c4','#5d7183']`, void `['#e6dcff','#a98cf0','#4b2f8c']`. Tube = whites (P[0]→P[1]); ribbons = HDR white core with P[1] edges; rings = white core; dome = P[0] with P[1] veins; floor sparkle = P[1]. The arena floor is WHITE: the tube, rings and ribbons need a normal-blended dark component (P[2], fresnel rim, jacket) to keep their shape where they cross the floor from the broadcast camera; additive layers give the glow on dark backgrounds and bodies. Look at how `src/viewer/vfx/arc/field.js` (after the lightning rework) and `src/viewer/vfx/ice.js` beam() handle this.

## Where the code goes

- New module `src/viewer/vfx/laser.js` exporting `beam(vfx, e, P, ctx) => boolean` with the same contract as the element modules. `Vfx.beam` in `src/viewer/vfx.js` is the stock fallback for elements without a module: make it call `laserFx.beam(...)` first and keep the old tube as the fallback if it returns false (this is the only edit in vfx.js). Do not change `MODULES` (kinetic and void keep stock silhouettes for the other deliveries by the founder's decision).
- Capture with the lock wrapper: `shot.sh --port=<PORT> --el=kinetic --kind=beam --moments=0.1,0.3,0.7,1.2 --out=<ABS OUT DIR>`; also run `--el=void` once at the end. The capture tool's `fxFor('beam')` sets `hit: true`.
- Every cast leaves a persistent floor decal (`kit.decal`); pick a type that fits (`scorch` for kinetic is wrong; a light `frost`-like glassy mark or `arc` with the palette tint reads as a laser burn; you may add a `laser` type to `kit.js` DecalField only if nothing fits — that is the one allowed kit edit and must keep the other types intact).
