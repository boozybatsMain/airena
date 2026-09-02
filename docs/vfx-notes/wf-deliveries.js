export const meta = {
  name: 'lightning-deliveries',
  description: 'Rework the five remaining lightning deliveries on the new primitive, each in its own worktree, judged on captured frames',
  phases: [
    { title: 'Build', detail: 'cone, zone, self, ball (bolt+lob), impact+charge — one builder each' },
    { title: 'Judge', detail: 'two visual judges and one reviewer per delivery' },
  ],
}

const SCRATCH = '/private/tmp/claude-501/-Users-boozybats-Public-Repos-work-Airena/a378fd9a-0203-4e7c-8a06-c8cd814a8151/scratchpad'
const MAIN = '/Users/boozybats/Public/Repos/work/Airena'
const BRIEF = `${SCRATCH}/LIGHTNING-BRIEF.md`
const NOTES = `${SCRATCH}/PRIMITIVE-NOTES.md`
const SHOT = `${SCRATCH}/shot.sh`

const JOBS = [
  {
    key: 'cone', file: 'cone.js', port: 8834, kinds: 'cone', moments: '0.1,0.3,0.6,1.2',
    look: `CONE (range 3.4 m, half-angle 0.96 rad by default; size is a parameter). A fan of Storm-Lance bundles from the caster's hand: 4–9 short bundles (count from kit.countFor over the sector area) diverging across the sector, each a proper cage of crossing filaments (use the new primitive with a short length), tangles at their far ends on the floor, a floor crackle carpet over the whole sector densest at the far edge, a cast orb at the hand, impact clouds and spikes at 2–3 points on the far edge, a floor ring, persistent arc decals. Timeline like the beam: emergence 0.1 s, full 0.4 s with restrikes, decay, residue to ~1.2 s.`,
  },
  {
    key: 'zone', file: 'zone.js', port: 8835, kinds: 'zone', moments: '0.15,0.6,1.5,2.6',
    look: `ZONE (disc r = 3 m, duration 3 s by default; size is a parameter). A voltaic field, PoE2 style: first a thick sky strike (a vertical Storm-Lance cage from ~9 m above down to the centre, 0.25 s, with a white impact cloud, spikes and a floor ring), then for the duration: arcs crawling across the floor of the disc (many small bright crackles, restruck), 4–10 vertical cage bolts jumping between random floor points and ~3 m height (they relocate every ~0.4 s), rim arcs running around the edge, periodic smaller sky strikes on random points with rings, a pulsing orb at the centre, sparks; at the end a collapse: everything pulls to the centre and a final ring. The disc must read as dangerous ground on the WHITE floor (a normal-blended dark-blue field/decal under it, not only additive light). Persistent arc decal under the whole disc.`,
  },
  {
    key: 'self', file: 'self.js', port: 8836, kinds: 'self', moments: '0.1,0.4,1.2,2.2',
    look: `SELF (shield on the caster, 2.4 s, follows the body via ctx.bodyPos). An ionized halo: a translucent faceted sphere ~1.6 m radius around the body (Nova-orb style: grainy, bright rim, visible on the white floor via a dark fresnel rim, body visible through it), with 8–14 arcs crawling over its surface as proper cages (crossing filaments, restruck every 50 ms), grounding arcs from the sphere into the floor with small tangles where they land, floor crackle around the feet, sparks, a pulse every ~0.5 s. Ignition: a burst from the body, a floor ring; end: the sphere shatters into a last flash. Persistent arc decal under the body.`,
  },
  {
    key: 'ball', file: 'ball.js', port: 8837, kinds: 'bolt,lob', moments: '0.1,0.3,0.6,1.0',
    look: `BOLT and LOB (ball lightning, flies range/speed seconds, lob on a parabola). The head: a bright orb (white HDR core, blue plasma shell, ~0.55 m) inside a cage of arcs crawling over it, with a tail of 3–5 jagged arcs trailing 2–4 m behind, ground arcs licking the floor under it (with crackle residue along the path), a light that follows. Muzzle: cast orb at the hand and a spike burst. Landing: a full Storm-Lance impact: white cloud, tangle of filaments, radial spikes, floor ring, floor crackle carpet, persistent arc decal. The bolt frames at 26 m must show a head that reads as a ball of lightning, not a small blue dot.`,
  },
  {
    key: 'impact', file: 'impact.js', port: 8838, kinds: 'impact,charge', moments: '0.05,0.2,0.4,0.8',
    look: `IMPACT (elemental flash on the victim; the stock impact draws the atom signatures, this ADDS the lightning) and CHARGE (wind-up on the caster, lives e.windup seconds, follows the body). Impact: a tangle of crossing filaments wrapping the victim's body (~1.1 m radius), a small white cloud, radial spikes, sparks, floor crackle and a small floor ring, persistent arc decal; 0.4 s. Charge: arcs converging from a shrinking sphere onto the caster's hand as proper cages, a growing cast orb at the hand (kit.charge with mode 'storm' exists; make the orb actually visible: it was nearly invisible), sparks pulled inward, a floor crackle ring under the caster growing with the wind-up.`,
  },
]

const BUILD_SCHEMA = {
  type: 'object',
  required: ['worktree', 'patch', 'framesDir', 'iterations', 'fps', 'errors', 'summary', 'weaknesses', 'wantsCommon'],
  properties: {
    worktree: { type: 'string' },
    patch: { type: 'string', description: 'absolute path of the git patch with your full change' },
    framesDir: { type: 'string', description: 'absolute dir with the FINAL captures (three cameras, all moments)' },
    iterations: { type: 'integer' },
    fps: { type: 'number' },
    errors: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    weaknesses: { type: 'array', items: { type: 'string' } },
    wantsCommon: { type: 'array', items: { type: 'string' }, description: 'helpers you wrote locally that belong in common.js/kit.js' },
  },
}

const SCORE_SCHEMA = {
  type: 'object',
  required: ['scores', 'total', 'verdict', 'mustFix'],
  properties: {
    scores: {
      type: 'object',
      required: ['lightning', 'brightness', 'whiteFloor', 'grammar', 'residue', 'artifacts'],
      properties: {
        lightning: { type: 'number', description: '0-10: the arcs are proper cages of crossing filaments like the beam, not thin wavy lines' },
        brightness: { type: 'number', description: '0-10: white-hot cores, saturated blue halo, nothing pale or grey' },
        whiteFloor: { type: 'number', description: '0-10: reads on the white floor from the broadcast camera' },
        grammar: { type: 'number', description: '0-10: the moments tell the story described in the job' },
        residue: { type: 'number', description: '0-10: floor crackle and persistent decal' },
        artifacts: { type: 'number', description: '0-10: 10 = no gaps, clipping, hard rectangles, whiteout, popping' },
      },
    },
    total: { type: 'number' },
    verdict: { type: 'string' },
    mustFix: { type: 'array', items: { type: 'string' } },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['ok', 'issues'],
  properties: {
    ok: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'object', required: ['severity', 'file', 'text'], properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, file: { type: 'string' }, line: { type: 'integer' }, text: { type: 'string' } } } },
  },
}

function buildPrompt(j) {
  const out = `${SCRATCH}/deliv/${j.key}`
  return `You rework one lightning delivery of the Airena viewer on the NEW lightning primitive that just won a tournament. Read, in order: ${BRIEF} (goal, reference, constraints, capture procedure), ${NOTES} (the new primitive's API and the beam that uses it — the quality bar), then the reference frames ${MAIN}/reports/vfx/reference/ref-storm-380.png and -800 and the crops in ${SCRATCH}, then the winning beam frames listed in the notes, then the current frames of your delivery in ${MAIN}/reports/vfx/arc-base/ (arc-${j.key === 'ball' ? 'bolt' : j.key === 'impact' ? 'self' : j.key}-*.png; impact/charge have no baseline).

Your delivery: ${j.look}

You work in an isolated git worktree (run \`pwd\` and \`git rev-parse --show-toplevel\`; that is ROOT; never touch ${MAIN}). Setup: \`ln -s ${MAIN}/node_modules ROOT/node_modules\`; \`PORT=${j.port} node src/server/index.js > /tmp/viewer-${j.port}.log 2>&1 &\` from ROOT; verify \`curl -s -o /dev/null -w '%{http_code}' http://localhost:${j.port}/\` is 200. Read ROOT/src/viewer/vfx/arc/field.js, common.js, util.js, beam.js (the bar) and your file ROOT/src/viewer/vfx/arc/${j.file}; also core.js, kit.js and Particles in vfx.js.

Scope: ONLY ROOT/src/viewer/vfx/arc/${j.file}. Do not edit field.js, common.js, util.js, beam.js, kit.js, core.js, vfx.js (other builders work on them in parallel; a helper you need goes into your file and into the wantsCommon list of your result). Do not change the exports of your file.

Method: code → capture → look, at least four rounds. Capture: \`${SHOT} --port=${j.port} --el=arc --kind=${j.kinds} --moments=${j.moments} --out=${out}/r<N>\` (the wrapper serialises the GPU; check \`actual\` vs \`moment\` in index.json and re-shoot on drift > 0.08 s; \`--cams=broadcast\` for quick rounds). Read the PNGs; judge from the broadcast camera first. Final: \`${SHOT} --port=${j.port} --el=arc --kind=${j.kinds} --moments=${j.moments} --out=${out}/final\` with all three cameras, errors must be empty, fps in index.json must stay ≥ 20. Patch: \`cd ROOT && git add -N src/viewer/vfx && git diff > ${out}/final.patch\`. Do not commit. Stop the viewer: \`lsof -ti tcp:${j.port} | xargs kill\`.`
}

function judgePrompt(j, build, lens) {
  return `You are a visual judge for a VFX rework. Lens: ${lens}. The bar is Path of Exile 2 lightning; reference frames ${MAIN}/reports/vfx/reference/ref-storm-380.png, -800 (crops in ${SCRATCH}); brief ${BRIEF}; the accepted beam on the same primitive is described in ${NOTES} with paths to its frames — the delivery must be at that level. The job description the builder had: ${JSON.stringify(j.look)}. The old rejected frames: ${MAIN}/reports/vfx/arc-base/. Frames to judge: ${build.framesDir} (files arc-<kind>-t<moment>-<cam>.png for kinds ${j.kinds}, moments ${j.moments}, cams broadcast/low/top). Read ALL frames with the Read tool before scoring; broadcast (26 m) weighs double. Builder's summary: ${JSON.stringify(build.summary)}; its listed weaknesses: ${JSON.stringify(build.weaknesses)}. Score what you see, not what is described. Score each criterion 0–10, total max 60, and list concrete mustFix items naming the frame.`
}

function reviewPrompt(j, build) {
  return `Code review of a three.js r180 WebGPU/TSL effects change: patch ${build.patch}, worktree ${build.worktree}, file src/viewer/vfx/arc/${j.file} (read it in full there, plus field.js/common.js it calls). Rules: ${BRIEF} "Hard constraints". Check: TSL only; node materials only via pooled(); shared() geometry; no Math.random; densities through kit.footprint/countFor; timings via vfx.spawnMesh (no setTimeout/rAF); no lights added; no per-frame allocations that grow; nothing outside the one allowed file changed; exports unchanged; forbidden words absent; comments in Russian. Run \`node --check\` on the file and \`cd ${build.worktree} && node tools/checkscope.mjs\`. Estimate per-restrike CPU (segments × rate) and flag anything likely to drop below 20 fps with two simultaneous casts. ok=false only for blockers or several majors.`
}

const results = await pipeline(
  JOBS,
  (j) => agent(buildPrompt(j), { label: `build:${j.key}`, phase: 'Build', schema: BUILD_SCHEMA, effort: 'xhigh', isolation: 'worktree' }),
  async (build, j) => {
    if (!build) return null
    const [j1, j2, review] = await parallel([
      () => agent(judgePrompt(j, build, 'FIDELITY AND READABILITY — proper lightning cages, brightness, reads on the white floor'), { label: `judge:look:${j.key}`, phase: 'Judge', schema: SCORE_SCHEMA, effort: 'high' }),
      () => agent(judgePrompt(j, build, 'GRAMMAR, MOTION AND RESIDUE — the moments tell the story, residue and decal remain'), { label: `judge:grammar:${j.key}`, phase: 'Judge', schema: SCORE_SCHEMA, effort: 'high' }),
      () => agent(reviewPrompt(j, build), { label: `review:${j.key}`, phase: 'Judge', schema: REVIEW_SCHEMA, effort: 'high' }),
    ])
    const judges = [j1, j2].filter(Boolean)
    const mean = judges.length ? judges.reduce((s, x) => s + x.total, 0) / judges.length : 0
    log(`${j.key}: mean ${mean.toFixed(1)}/60, review ok=${review ? review.ok : 'n/a'}`)
    return { key: j.key, build, judges, review, mean }
  },
)

return results.filter(Boolean).map((r) => ({ key: r.key, mean: r.mean, worktree: r.build.worktree, patch: r.build.patch, framesDir: r.build.framesDir, fps: r.build.fps, errors: r.build.errors, weaknesses: r.build.weaknesses, wantsCommon: r.build.wantsCommon, review: r.review, judges: r.judges.map((j) => ({ total: j.total, scores: j.scores, verdict: j.verdict, mustFix: j.mustFix })) }))
