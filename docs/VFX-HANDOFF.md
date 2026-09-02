# Handoff: lightning rework (tournament + polish) and first laser pass

Written 2026-09-03 at the end of the session that took over `docs/VFX-HANDOFF.md` from 2026-09-02 (founder's brief: "lightning is very poor, make truly realistic lightning at Path of Exile 2 level, then the laser"). The session stopped on the account's session limit in the middle of the second polish round; everything below is committed. Repo docs and code comments are Russian; this handoff and the notes in `docs/vfx-notes/` are English.

## Overview

The lightning module was split into files, rebuilt three times in parallel by independent agents, judged on captured frames against the Storm Lance reference, merged from the winner with grafts from the losers, and polished one round further. The stock beam for elements without a module (kinetic, void) got a first Nova-Beam-style laser. Both are clearly better than what the founder rejected and both are still short of the reference; the judges' ordered fix lists are below and in the notes.

Commits on `main`, in order:

- `603686d` `arc.js` split into `src/viewer/vfx/arc/{util,field,common,beam,cone,zone,self,ball,impact}.js`; no behaviour change; `arc.js` is the re-export entry.
- `b1ef086` tournament winner ("grammar") merged as the new primitive + beam; capture tool gets a fourth camera `side`.
- `8165420` polish round 1: grafts from the two losing builds plus the first fix list (judged 34/38/40 of 60 vs 34 for the base).
- (this session's last commit) laser first pass (`src/viewer/vfx/laser.js`, hook in `Vfx.beam`, `laser` decal type in `kit.js`), notes, lock wrapper, this handoff.

## Work completed

- **Module split.** `arc.js` re-exports `cone zone self beam bolt lob impact charge`; the body lives in `arc/`. Reason: several agents edit the module in parallel; a 1000-line file was a guaranteed conflict.
- **Lightning primitive (`arc/field.js`)** after tournament + polish: one instanced ribbon buffer drawn in three layers (normal-blend deep-blue jacket that carries the shape on the white floor, additive glow for dark backgrounds, HDR white core `(3.5,3.7,4.1)` with a hard edge). Bundle generator: filaments diverge from the hand in a cone (0.05 → 0.8 m radius on 9 m) by a transverse random walk with direction memory and wall reflection, rungs between neighbours, stubs, an early-ending fraction, a tangle at the impact; self-similar kinks at every subdivision level; restrike every 40–60 ms with a hot flash. Negative `bright` draws marks without the white core; a `cool` uniform turns the jacket navy and switches the core off (residue cooling). Generators for floor glyphs and a crackle carpet. Full API map with the numbers and why: `docs/vfx-notes/PRIMITIVE-NOTES.md`.
- **Beam (`arc/beam.js`)** timeline: cast orb at the hand, emergence with a bright leader, ~0.5 s at power, impact cloud (additive, HDR white), radial spikes emitted twice (white into the glow pool, deep blue into the body pool so they exist over the white floor), floor ring of fixed 0.3 m band, decay by filament count (saturation holds), glyph residue along the whole path living 1.0–1.7 s, persistent `arc` decals tinted `P[2]`.
- **Measured** (broadcast camera, column box (740,395)–(850,505), 0.3 s): hot pixels 0 → 1249, deep-blue pixels 1576 → 2045; blue marks per sixth of the path at 1.2 s from the top camera `[58,173,184,213,971,1044]` vs `[0,1,0,19,136,299]` for the tournament base. 60 fps in every capture, zero console errors, `checkscope` clean, the other deliveries draw without errors (`reports/vfx/arc-polish-r1-others/`).
- **Laser (`src/viewer/vfx/laser.js`)**, first pass, judged 32/34 of 60 against a baseline that was an invisible 0.3 s cord: faceted cast orb, fresnel tube with scrolling streaks, 4–6 helix ribbons unravelling into whips past the impact, travelling rings, faceted impact dome, floor sparkle carpet, held lights, a new `laser` decal type in `kit.js` (`DecalField`; other types untouched). `Vfx.beam` in `vfx.js` tries `laserFx.beam` first inside try/catch and keeps the old tube as the fallback. Void renders the same effect in purple. Smoke capture after merging: kinetic, frost and arc beams at 60 fps, zero errors.
- **Capture tool.** `tools/vfxshot.mjs` has a fourth camera `side` (26 m, perpendicular to the cast): from `broadcast` the fixture's beam runs almost along the view axis and collapses into a column, so bundle shape cannot be judged there. `tools/vfxshot-lock.sh` runs the tool under an atomic `mkdir` lock (parallel headless Chromes drift each other's moments by 0.1–0.5 s; measured).
- **Notes and scripts for the next agent**, `docs/vfx-notes/`: `LIGHTNING-BRIEF.md` (goal, measured reference, all hard constraints, capture procedure), `LASER-BRIEF.md`, `PRIMITIVE-NOTES.md`, `metrics.py` (hot/blue pixel counts in a box; reproduces the judges' numbers), `polish.sh` (captures five moments as three casts, see "capture timing" below), and the four Workflow scripts used this session (`wf-tournament.js`, `wf-polish.js`, `wf-laser.js`, `wf-deliveries.js`; paths inside point at a session scratchpad and must be re-pointed).
- **Evidence** (git-ignored, on disk): `reports/vfx/arc-base` (frames before this session, 0.1/0.3/0.6 s), `arc-tourney-{topology,rendering,grammar}` (the three contestants), `arc-polish-r1` (current lightning beam, four cameras × 0.06/0.15/0.3/0.6/1.2 s), `laser-base`, `laser-r1`, `laser-r1-void`, `reference-crops` (upscaled crops of the reference frames).

## Work in progress

- Nothing half-edited; the tree is committed. The polish loop was stopped by the session limit before round 2 started; the laser loop likewise. The judges' round-1 fix lists are the exact next work.

## Planned work (in order)

1. **Lightning beam, polish round 2** (judges' list, ordered by impact; all in `arc/field.js`, `common.js`, `beam.js`):
   - Bundle silhouette: the 6.5× jacket fuses the filaments into one hard-edged blue sleeve ("fishnet stocking"). Cut the jacket to ~3–4× the core with a soft outer falloff so each filament keeps its own halo and white floor shows between cells; scale widths with the cone (near-point at the hand, ~1.2 m envelope at the far end).
   - Kink character: fewer, longer straight segments (0.3–0.6 m on 9 m) with hard 30–60° turns, at most one sub-kink level; cells must be polygons, not wavy loops.
   - Emergence tip: at 0.06 s the bolt ends in a flat wall; end each filament at a different fraction, fade the last 15–20 % individually, one bright leader point.
   - Cast orb: reads as a grey balloon (median darker than the floor); make it additive HDR bluish-white with a saturated blue rim, ~1.2 m, never neutral, never darker than the floor.
   - Impact cloud: hides 88 % of the victim at 0.3 s; peak ~0.7–0.9 with radial soft falloff, deep-blue edge, spikes and tangle visible through it.
   - Spikes and side streaks: still invisible over the white floor from broadcast; body-pool copies must be deep saturated blue (~(0.05,0.25,0.9)), normal blending, alpha 1.0 for the first half of life, ~0.03 m wide, 0.8–1.5 m long; constrain side streaks to ±35° of the floor plane (a vertical "flagpole" streak stands at the aim-ring centre at 0.3 s).
   - Residue: start cooling at 0.6–0.7 s so 1.2 s is navy (reference residue ≈ (25,58,96)); birth glyphs at full saturation and fade alpha only (they fade in lilac now); vary glyph scale 0.1–0.5 m with 3–6 links and dots, oriented along the path; raise near-hand density to ≥ 40 % of the far half; cap glyph jacket at ~0.012 m or 0.1× link length with a hairline white core.
   - Floor ring: thin bloomed white HDR core with a ≤ 0.15 m deep-blue edge, no interior fill, no second concentric line.
   - Grey dirt: the persistent `arc` decal (`kit.js`) speckle reads as soot under both fighters in every late frame; restyle it as a dark-blue burn (no neutral pixels) or replace with 2–4 glyph shapes per decal, radius ≤ 1.0 m, delayed to ~0.9 s.
   - Brightness gradient is inverted: the hand end is a solid white rope, the impact end is the most open; ramp filament density and hero brightness along the path.
   - Capture hygiene: pre-warm pooled node materials with a throwaway cast before the timed cast (the 0.06 frame shows ~55–65 % of the path instead of ~40 % because materials compile on the spawn frame).
2. **Other lightning deliveries** on the finished primitive: `docs/vfx-notes/wf-deliveries.js` is written for it (five builders in worktrees on their own viewer ports, two judges + reviewer each). It reads `PRIMITIVE-NOTES.md`; refresh that file after round 2 first. Per-delivery targets are in the script's `JOBS`.
3. **Laser round 2** (judges' list): ribbon cores and orb core must reach true white with a bloom halo (ribbon cores top out at ~241 on a 224 floor; zero white pixels in the orb); impact dome is a geodesic cage with the target visible inside and two coplanar hoops ("Saturn"), needs a glassy translucent bell with a hot core; ribbons are a phase-locked coil spring, need per-ribbon amplitude/phase/width and depth ordering; rings are beaded double lines at segment joints, need one continuous stroke with a white core; tube is a flat slab with a hard top edge from the low camera; whips are thin and pale; floor sparkle is ~100 grey specks, needs a dense carpet of bright `P[1]` dots; the target already has a hazy disc at 0.1 s before the beam fires; hold the beam to ~1.2 s full / ~1.5 s off; the `laser` decal reads as a shadow smudge, needs a glassy bright centre. The reviewer flagged the `kit.js` edit as out of scope of its instructions only; the brief allowed it.
4. Then the items carried over from the previous handoff: ice projectile scale (`ctx.radius` from `main.js`), fire smoke tint, `kit.charge` orb visibility, promoting module-local helpers into the kit, `tubeMat` pool key, `IR_DRAWS`, the product replay console error, full `npm test`, a fresh `--tag=after` sweep and the gallery.

## Key decisions and reasoning

- **Tournament instead of one rewrite.** Three agents rebuilt the primitive + beam from three angles (topology, rendering, cast grammar) in isolated worktrees with their own dev viewers; three visual judges per build scored twelve frames each against the reference; a fourth agent decided. Winner "grammar" (34/60) on brightness, muzzle and residue; "rendering" had the best net structure (its random walk in a tube was grafted); "topology" gave core-less marks, the `cool` uniform, the additive impact orb and count-based decay. All patches are in `reports/vfx/arc-tourney-*` and the losers' worktrees (see below).
- **Judging is by pixels, not prose.** Judges counted hot (≥248) and deep-blue (b−r ≥ 60) pixels in fixed boxes and blue marks per sixth of the path; `docs/vfx-notes/metrics.py` reproduces the numbers. Builders were told a change they did not look at is not done.
- **White floor rules** still hold: the shape is carried by a normal-blended deep-blue jacket, white is HDR in a hard-edged core so pixels are white-or-blue rather than pale, additive layers exist only for dark backgrounds, and every streak that must read over the floor is emitted twice (white into the glow pool, blue into the body pool).
- **Capture timing.** `Page.captureScreenshot` costs ~0.3 s on WebGPU and delays the next queued moment: one cast shot at 0.06/0.15/0.3 lands at 0.06/0.43/0.78. `polish.sh` therefore shoots five moments as three casts (0.06+0.6, 0.15+1.2, 0.3) and merges the `index.json`; effects are deterministic per cast so the frames agree. A better fix is inside `tools/vfxshot.mjs`: one cast per moment, or a pre-warm cast before the timed one.
- **Laser = the stock beam.** The founder's decision kept stock silhouettes for kinetic and void; the "laser" is that stock beam (`Vfx.beam`) rebuilt on the Nova Beam reference in its own module with the old tube as the fallback. `MODULES` is unchanged.
- **Commits at milestones** so a session cut by the limit never loses judged work.

## Known issues and blockers

- Lightning and laser are both below reference level; scores 34/38/40 and 32/34 of 60. The fix lists above are the judges' verbatim priorities.
- The worktrees created by the Workflow tool are still present and locked: `.claude/worktrees/wf_81e34f69-b73-{1,2,3}` (topology, rendering, grammar), `wf_d018df97-6ff-{1,2}` (laser rounds; round 2 never ran). Four older worktrees from earlier sessions (`dazzling-goodall`, `distracted-banach`, `intelligent-jennings`, `sharp-bohr`) predate this work. `git worktree prune` or `git worktree remove --force` once the patches in `reports/vfx/arc-tourney-*` are no longer needed.
- Dev viewers started by agents were stopped; if a port in 8831–8842 is busy, `lsof -ti tcp:<port> | xargs kill`.
- The first cast of each effect per page compiles its pooled node materials (12–22 ms each); the laser adds ~7 materials. Unchanged class of stall from before.
- Everything from the previous handoff's list still stands: replay console error (`loadbody.js`, `reading 'abs'`), `tubeMat` pool key, pooled-uniform sharing at the seventh simultaneous effect, bolt/lob flying full range, WebGL2 unverified for fire/lightning/laser, `preview/elements.html` bloom-only pipeline, capture drift under GPU sharing, `tools/vfxdemo.js` carousel.

## Important context and notes

- Servers: dev viewer `PORT=8823 node src/server/index.js` (the capture tool's default port); product `npm run dev` (8787); preview `node preview/server.mjs` (8899, `/elements` stand draws with the combat code).
- Capture: `tools/vfxshot-lock.sh --port=8823 --el=arc --kind=beam --moments=0.06,0.15,0.3,0.6,1.2 --out=reports/vfx/<tag>`; cameras `broadcast,side,low,top` (`--cams=` to restrict). Always check `actual` against `moment` in `index.json`. Fixture: blue at (−3.5,−1.5) casts at orange at (3,5); `broadcast` looks almost along that line, `side` across it.
- Agents worked in worktrees with `node_modules` symlinked from the main tree and their own viewer port; shared files (`kit.js`, `core.js`, `vfx.js`, `main.js`) were edited only by the coordinating session or, for the laser decal, with explicit permission in the brief.
- The Workflow scripts in `docs/vfx-notes/` reference a session scratchpad (`/private/tmp/claude-501/.../scratchpad`); replace `SCRATCH`, `SHOT` and the reference-crop paths with repo paths (`reports/vfx/reference-crops`, `tools/vfxshot-lock.sh`) before reuse.
- `reports/vfx/` is git-ignored; the frames listed under Evidence live only on this machine.

## Next steps

1. Start the viewer on 8823, read `docs/vfx-notes/PRIMITIVE-NOTES.md`, shoot `arc beam` with `polish.sh` or the lock wrapper, and work the lightning round-2 list above until three judges (or your own pixel counts) pass it; commit.
2. Refresh `PRIMITIVE-NOTES.md`, then run the deliveries workflow (or do cone, zone, self, ball, impact+charge by hand from its `JOBS` text) and merge the patches.
3. Laser round 2 from its list; commit.
4. Full `--el=arc,kinetic,void` sweep with `--tag=after2`, gallery, `npm test`, then the carried-over items.
