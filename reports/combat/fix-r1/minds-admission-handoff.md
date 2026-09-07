# Minds admission — round-1 fixes, handoff

Lane: admission and its repair loop. Touched: `src/server/sandbox/{index,analyse,worker}.js`,
`src/server/forge/pipeline.js`, `tools/{bakeoff,rethink}.mjs`, `src/core/sim.js`,
`src/brain/prompt.js`, `tools/checkbehaviour.mjs`, `tools/checkisolate.mjs` (one comment only).

## Admission rule (`admit()`, sandbox/index.js)
Sparring now fights the candidate's OWN kit: `kits: { [slot]: kit, [other]: kit }` (was
`{ [slot]: kit }` — the sparring side sat on the hardcoded smash/charge/jump fixture even with a
real kit in play, i.e. it was **not** already on the same kit). That needs a kit-aware sparring
script, so `pipeline.js`, `bakeoff.mjs`, `rethink.mjs` now read `brains/kit-stub/{gorilla,
octopus}.js`, not `brains/stub/*.js` (calls abilities by fixture name, goes silent on a kit).

Sixth wall, gated on `kit` being given (same principle as the existing `never_uses` check —
without a kit the stub itself applies nothing, so the gate would measure the probe, not the
mind). Over the four trial fights: (a) ≥1 win of 4 OR damage ≥ 40% of the stub's; (b)
idle-in-reach ≤ 40% of alive ticks — no act running, a READY ability's true reach covers the
enemy (`reachOf`, copied with a comment from `reports/combat/spectate.mjs` into `worker.js`,
since the isolate wall means only the worker sees per-tick state); (c) still ≤ 40% of alive
ticks; (d) ≥3 casts/fight average. `report.behaviour = {wins, damageShare, idleInReach, still,
casts}` and `report.warnings` ride every return from the probe stage on, pass or fail, with a
readable Russian `reason` on failure (matching the file's existing messages).

## Repair loop (`bakeoff.mjs`, `rethink.mjs`)
One extra turn, same conversation, before giving up on a `behaviour` rejection: "Your mind just
ran 4 trial fights against a scripted opponent holding your exact same kit. Measured: it idled
... 60% of the time it was alive; ..." — only the failed measures, facts only. Re-admits once;
keeps the original rejection if the repair doesn't clear it.

## Perception + prompt facts
`p.self.immuneLeft`/`p.enemy.immuneLeft` = `{act, move, sense}` seconds left, 0 if not armed;
documented beside `.immune`. `api.moveTo`: confirmed true in `moveStep` (arrival brakes to a
stop, `moveTarget` cleared) and now stated. `.visible` no longer claims to be "the same test the
beam performs" — centre-to-centre, this instant; a beam/bolt tests radius+muzzle ahead along
facing, at the strike; `api.ray`/`api.los` named as the facing/point tests. A bolt is confirmed
listed in `p.arena.projectiles` from release (`deliver.js`), now stated. `checkprompt.mjs`: 0
tactics, 434/434 segments judged.

## Static gate (`analyse.js`, §5)
New `warnings[]`, never touches `ok`: a numeric literal in a comparison within 2% of a figure on
the SAME kit's own card (range, reach, wind-up, cooldown, speed, splash) is flagged
`literal_kit_number` — seen live below.

## Re-admission
`sub-opus-plain/brawler.js` (league.md's 0%-vs-stub row): **admitted**, not rejected —
`{wins:0, damageShare:0.74, idleInReach:0.24, still:0.12, casts:10.5}` (checked on its own build
and over 16 seeds too — same story). It never wins, but trades 70-80% of the stub's damage every
fight: a real, losing fight, not an idle or a whiff, which is exactly what the "≥40% damage"
fallback is for. It does not reproduce league.md's 0%, because that column is a win RATE over an
8-game, both-sides sample the 4-seed probe doesn't see. A mind the gate DOES reject:
`nvidia-nemotron-3-ultra.../caster.js` — `{wins:0, damageShare:0.35, idleInReach:0.60,
still:0.27, casts:3.75}`, on both damage and idle-in-reach, matching the review's idle finding.

`sub-fable-high/brawler.js`: **admitted** — `{wins:4, damageShare:2.11, idleInReach:0.12,
still:0.11, casts:13.75}` — plus three `literal_kit_number` warnings on its own k1/k3 numbers.

## Gates
`test.mjs` 70/70 · `checkbehaviour.mjs` 67/67 (3 new immuneLeft claims) · `checkisolate.mjs`
holds (25/25 attacks, honest control admitted, sample shows no false new-wall rejections) ·
`checkforge.mjs` holds · `checkprompt.mjs` 0 tactics — all green.
