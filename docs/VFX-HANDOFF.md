# Handoff: Airena VFX rebuild (ice, fire, lightning on a shared impact kit)

Written 2026-09-02 at the end of the session that executed the founder's VFX decisions. Repo docs and code comments are in Russian; this handoff is in English. The founder's decisions themselves are recorded in `docs/VFX.md` §1 and `docs/DECISIONS.md` D171.

## Overview

The arena viewer (three.js r180, `WebGPURenderer` + TSL, WebGL2 fallback) draws skill effects for a fight between two LLM-written creatures. The founder judged the previous element effects bad except the ice, and asked for: ice kept and raised to the quality of the standalone stand, everything else removed, a shared cinematic "impact kit", then fire and lightning at Path of Exile 2 level, a composite post-processing graph, rebuilt camera shake, red hit flash, persistent floor marks, and acceptance by captured frames from the real combat scene. Effects must adapt to skill size (density from footprint area), never stretch.

Four commits on `main` carry the work: `9ee6da5` (ice-only foundation, kit, tools), `f742751` (three element modules, stands removed), `2c46f8b` (interactive stand), `32bffd3` (burn counts as a hit for the red flash).

## Work Completed

- **Removal.** All uncommitted ember/arc/void/kinetic effect code and the committed arc beam kink were deleted; stock delivery silhouettes remain as fallback for kinetic and void. The old battle ice (`iceWave/iceRain/iceDome`, `iceMat/domeMat/quartz`) was deleted from `src/viewer/vfx.js` after the ice module superseded it. Stands `preview/ice.html` and `preview/frost.html` were committed once for history (in `9ee6da5`) and then deleted; `/elements` stays.
- **LLM decoration layer (VFX IR) frozen.** `IR_DRAWS = false` in `src/viewer/main.js`. Validator, storage, forge prompt and gate `tools/checkvfx.mjs` are untouched and green.
- **Foundation.** `src/viewer/vfx/core.js` (glow mark with node masks, heat-distortion mark, `TIME`, fade uniform, `pooled()` material ring, `shared()` geometry, `mulberry`/`seedOf`). `src/viewer/vfx/kit.js` (`footprint`/`countFor`/`inSector`/`inDisc`, `burst` fireball with flash shell and modes fire/frost/flash/storm, `shockwave` dust + hot rings, `decal` persistent floor marks as one instanced field per type with a 28-per-type ring, `heat` shimmer proxy, `smoke/embers/debris/sparks/mist` recipes, `charge`/`muzzle`, `impactKit`). Particle pool rewritten onto one interleaved buffer (WebGPU's 8-vertex-buffer limit broke seven attributes), with second colour, spin, end size, velocity stretch, glow weight, eight shapes, 5000 per pool.
- **Element modules** `src/viewer/vfx/ice.js`, `fire.js`, `arc.js`, each exporting `cone zone self beam bolt lob impact charge` as `(vfx, e, P, ctx) => boolean`. `Vfx.play()` calls the module first; `impact` is additive (stock atom signatures still draw). See each module's header and the agent reports summarised under Known Issues.
- **Viewer** (`src/viewer/main.js`): composite post graph (HDR bloom before ACES, chromatic aberration, heat distortion from a third MRT target, vignette, in-shader flash; `?post=0` or `?bloom=0` disables; WebGL2 verified to render it); trauma camera shake with roll applied after the framing solver; red hit flash driven by `hit` and targeted `impact` events (not hp deltas: burn and sudden death drain hp every frame); light pool of four; `charge` records fired from the telegraph wind-up; sweep hooks `window.__airenaSweep` under `?vfx=1`.
- **Tools.** `tools/vfxshot.mjs` captures any cast in the real combat scene from three cameras at chosen moments on real WebGPU via headless Chrome over CDP (no new dependencies); `--watch=<match id> --url='http://localhost:8787/?vfx=1&sweep=1'` replays a product match from t=0 with the framing camera. `tools/seedvfx.mjs` seeds six demo creatures (two kits per element, contact and ranged), retiring old ones instead of deleting. `preview/vfx-gallery.html` at `/vfx?tags=before,after` on the preview server; the preview server now takes `PORT`.
- **Interactive stand.** `/elements` on the preview server: element links plus buttons for every delivery, WebGPU by default, no auto-cycle, right-drag orbit.
- **Docs.** `docs/VFX.md` (architecture and decisions), `SPEC.md` §9.2 and §10 amended, `docs/DECISIONS.md` D171, README tool table.
- **Evidence.** `reports/vfx/before` (270 frames of the old effects), `reports/vfx/after` (162 frames, zero errors, timing drift ≤ 0.04 s), `reports/vfx/reference` (founder's reference demo), replay captures `fight-fire-ice-a/b`, `fight-frost-arc`, `fight-ember`. `reports/vfx/` is git-ignored. A published review gallery exists at https://claude.ai/code/artifact/d8a56eb2-8b0e-4233-8faa-a4efe70fe463.
- **Gates.** All green at the last run: checkscreens, checkscope, checkgrammar, checkboot, checkvfx, checkdocs, checkspec, checkcontrast, checkframing, checkcamera. The full `npm test` suite (loadtest, falsify, sizebalance) was not run in this session.

## Work In Progress

- Nothing is half-edited; the tree is committed. The three modules were built by parallel agents under time pressure and each left a list of weaknesses (below); none of those was started.
- Lightning is the weakest of the three on screen and the founder said so explicitly. Its beam lives 0.5 s, so the 0.7 s and 1.6 s rows in the gallery undersell it, but the halo, ball head and mid-life frames were never verified by the agent because the machine was overloaded during its captures.

## Planned Work

1. Lightning rework toward the reference (`reports/vfx/reference/ref-storm-*.png`): thicker, longer, brighter filaments with a normal-blended jacket that survives the white floor; a real halo tube; a dense storm burst under the additive shell; re-shoot with `--moments=0.1,0.3,0.6`.
2. Ice projectile scale: `bolt` and `lob` read small at 26 m; the dome radius should come from real body size (`ctx.radius` is not passed by `main.js` today).
3. Fire smoke tint (brick-red haze under bloom at 1.6 s), and `kit.charge`'s orb being nearly invisible since the burst dissolve was sped up (agents want its own alpha curve).
4. Promote module-local helpers into the kit: `emitFlames/emitEmbers/emitSmoke/emitAsh` with a placement closure, `later()`, a light that follows a moving head, `shards()`, `motes()`, a crystal `field()` helper, `decal()` with a future timestamp, a dense `stormBurst`.
5. Re-route the frozen VFX IR through the new particle shapes and decals, then flip `IR_DRAWS` back on and keep `checkvfx` green.
6. Product replay console error (see Known Issues).
7. Run the full `npm test`, then a fresh `--tag=after` sweep and regenerate the gallery.

## Key Decisions & Reasoning

- Delivery owns footprint and timing; element owns the body of the effect inside it (SPEC §9.2 rewritten). Decoration may overspill the hitbox up to 2×; the damaging core matches the telegraph.
- Every density comes from `kit.footprint(e).area` through `kit.countFor` because skill ranges, angles and radii will change; the founder rejected stretching.
- Every cast leaves a persistent decal (hold ~20 s); the arena may visually change under effects.
- Burst bodies use normal blending with colour from noise; additive spheres were invisible white blobs on the white floor. Bloom stays selective by mask (`markGlow`), never by threshold, so the floor never blooms.
- Shake is a trauma model applied after the framing solver so `checkcamera` keeps judging the solver; the legacy `camState.shake` axis remains for the IR cap and the framing gate's prelude.
- Red hit flash is event-driven; hp deltas made burning bodies permanently red.
- The capture tool uses headless Chrome over CDP with `ws` (already a dependency) rather than adding Playwright to the repo; `--virtual-time-budget` must stay off (it blanks WebGPU).
- Seeder retires old demo creatures (`state = 'retired'`) because matches reference them and DELETE hits a foreign key.
- Agents worked in parallel in the main tree on disjoint files against one shared dev viewer; shared files (`vfx.js`, `kit.js`, `core.js`, `main.js`) were edited only by the coordinating session.

## Known Issues & Blockers

- Product replays (`--watch` on port 8787) log one console error, `TypeError: Cannot read properties of undefined (reading 'abs')` from a body script evaluated in `loadbody.js` during `NodeMaterial.setupOutput`; frames still render. It appeared after the modules landed (a replay of the same match earlier had zero errors) and was not diagnosed. Suspect a material rebuild path; check whether any module changes MRT layout or light count mid-fight.
- `tubeMat` in `vfx.js` pools by `` `tube:${P.join()}` ``, which joins `THREE.Color` objects to `[object Object]`, so every palette shares one ring (pre-existing, found by the arc agent).
- Pooled uniforms: a seventh simultaneous effect of one kind shares fade/age uniforms with the youngest (accepted ring cost; `MAT_RING = 6`, decals 28 per type).
- Bolt and lob visuals fly the full `range` even when the sim's hit lands earlier; the sim's `impact` record draws the real hit.
- WebGL2 was verified for the post graph and ice only; fire and lightning on WebGL2 are unverified (acceptable by decision, must not crash).
- `preview/elements.html` still runs its own bloom-only pipeline, so heat shimmer, aberration, shake and hit flash are only visible in the fight viewer.
- Capture timing drifts badly when several headless Chromes share the GPU; always check `actual` versus `moment` in `index.json` and run sweeps alone.
- `tools/vfxdemo.js` still lists five elements in its carousel; harmless.

## Important Context & Notes

- Servers: dev viewer `npm run viewer` (port 8823, `.claude/launch.json` name `viewer`); product `npm run dev` (8787, runs the arena loop that fights the demo creatures every ~60 s); preview `node preview/server.mjs` (8899, or `PORT=…`). The dev viewer's fights use hardcoded skills, so element effects only appear in product replays or on the stands.
- Fire-versus-ice replays the founder was pointed at: `m_ee13627f-623` (ПЕПЕЛ ranged fire vs ЛЕДОКОЛ contact ice) and `m_e2fe5ee4-efb` (МАГМАРЬ contact fire vs СТУЖА ranged ice); open as `http://localhost:8787/?m=<id>`.
- `tools/checkframing.mjs` slices `main.js` by exact text anchors (see its `SLICES`); do not rename or duplicate anchored lines. The frame loop head up to the bodies loop is part of a slice; new per-frame code was placed after `updateFx(now)` on purpose.
- `tools/checkscope.mjs` scans bundle text for forbidden words (prices, "токен", "скин", `new Audio`, `.play();`); keep comments clean.
- The three agents' full reports (with per-delivery descriptions and wish lists) are in this session's transcript; their substance is folded into this document and the module headers.
- Scratch helpers not in the repo: a gallery builder (Python, PIL) that embeds downscaled JPEGs into one HTML, and a one-off script that removed the old ice from `vfx.js`.

## Next Steps

1. Run `node tools/vfxshot.mjs --el=arc --tag=arc-check --moments=0.1,0.3,0.6` alone, look at all three cameras, and rework `arc.js` per Planned Work item 1 until the bolt reads thick and branching at 26 m.
2. Reproduce the replay console error with `node tools/vfxshot.mjs --watch=m_ee13627f-623 --url='http://localhost:8787/?vfx=1&sweep=1' --tag=err` and bisect by disabling modules in `MODULES` in `vfx.js`.
3. Pass body size into `ctx` from `main.js` (`bodies[who].length` is available) so the ice dome and fire crown scale with the fighter.
4. Fold the agents' local helpers into `kit.js`, then fix `tubeMat`'s pool key.
5. Run `npm test`, re-shoot `--tag=after`, rebuild the gallery, commit.
