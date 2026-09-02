export const meta = {
  name: 'lightning-polish',
  description: 'Graft the tournament losers\' best ideas onto the winning lightning beam and fix the judges\' list, in rounds until the judges pass it',
  phases: [
    { title: 'Build', detail: 'one builder in the main tree, capture-and-look rounds' },
    { title: 'Judge', detail: 'three visual judges and a reviewer per round' },
  ],
}

const SCRATCH = '/private/tmp/claude-501/-Users-boozybats-Public-Repos-work-Airena/a378fd9a-0203-4e7c-8a06-c8cd814a8151/scratchpad'
const MAIN = '/Users/boozybats/Public/Repos/work/Airena'
const BRIEF = `${SCRATCH}/LIGHTNING-BRIEF.md`
const SHOT = `${SCRATCH}/shot.sh`
const PORT = 8823
const RENDERING_WT = `${MAIN}/.claude/worktrees/wf_81e34f69-b73-2`
const TOPOLOGY_WT = `${MAIN}/.claude/worktrees/wf_81e34f69-b73-1`
const MAX_ROUNDS = 3
const PASS = 46

const GRAFTS = args && args.grafts ? args.grafts : []
const MUST_FIX = args && args.mustFix ? args.mustFix : []
const DECISION = args && args.reason ? args.reason : ''

const BUILD_SCHEMA = {
  type: 'object',
  required: ['framesDir', 'iterations', 'fps', 'errors', 'summary', 'weaknesses', 'notesWritten'],
  properties: {
    framesDir: { type: 'string', description: 'absolute dir with the FINAL captures of this round (four cameras, moments 0.06,0.15,0.3,0.6,1.2)' },
    iterations: { type: 'integer' },
    fps: { type: 'number' },
    errors: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string', description: 'what changed this round, 10–20 sentences with numbers' },
    weaknesses: { type: 'array', items: { type: 'string' } },
    notesWritten: { type: 'boolean', description: 'PRIMITIVE-NOTES.md in the scratchpad is up to date with the current API' },
  },
}

const SCORE_SCHEMA = {
  type: 'object',
  required: ['scores', 'total', 'verdict', 'mustFix'],
  properties: {
    scores: {
      type: 'object',
      required: ['bundle', 'brightness', 'whiteFloor', 'grammar', 'residue', 'artifacts'],
      properties: {
        bundle: { type: 'number', description: '0-10: thick braided cage of many crossing filaments with divergence and cells, like the reference, from the side and low cameras' },
        brightness: { type: 'number', description: '0-10: white-hot cores, crossings bloom white, saturated blue halo, nothing pale or grey' },
        whiteFloor: { type: 'number', description: '0-10: keeps shape and colour over the white floor from broadcast and side cameras' },
        grammar: { type: 'number', description: '0-10: cast orb, emergence at 0.06/0.15, impact cloud + spikes + floor ring at 0.3, bare bolt at 0.6' },
        residue: { type: 'number', description: '0-10: dense blue crackle carpet along the whole path at 1.2 s, cooled to dark blue, no grey dirt' },
        artifacts: { type: 'number', description: '0-10: 10 = no gaps, flat ribbons edge-on, clipping, hard rectangles, grey balloons, whiteout' },
      },
    },
    total: { type: 'number' },
    verdict: { type: 'string', description: '5–10 sentences naming frames' },
    mustFix: { type: 'array', items: { type: 'string' }, description: 'concrete, ordered, each naming the frame and the code place if you can' },
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

function buildPrompt(round, feedback) {
  const out = `${SCRATCH}/polish/r${round}`
  const first = round === 1
  return `You are polishing the lightning beam of the Airena viewer to Path of Exile 2 level. Work DIRECTLY in ${MAIN} (no worktree; a dev viewer already serves this tree on port ${PORT}; captures load the page fresh, so saved files are live). Do not commit.

Read first: ${BRIEF} (goal, measured reference, constraints, capture procedure), the reference frames ${MAIN}/reports/vfx/reference/ref-storm-120.png, -380, -800, -1500 and crops ${SCRATCH}/ref-storm-800-crop.png, ref-storm-380-crop.png, ref-storm-120-crop.png. Then the current code: ${MAIN}/src/viewer/vfx/arc/field.js, common.js, beam.js, util.js (this is the tournament winner "grammar"), plus core.js, kit.js and the Particles class in ${MAIN}/src/viewer/vfx.js.

${first ? `The tournament judge's comparison of the three builds: ${JSON.stringify(DECISION)}

GRAFTS to take from the two losing builds (their full trees are readable: rendering at ${RENDERING_WT}/src/viewer/vfx/arc/, topology at ${TOPOLOGY_WT}/src/viewer/vfx/arc/; their patches: ${SCRATCH}/tourney/rendering/final.patch and ${SCRATCH}/tourney/topology/final.patch; their frames: ${SCRATCH}/tourney/rendering/final and ${SCRATCH}/tourney/topology/final; the winner's frames: ${SCRATCH}/tourney/grammar/final):
${GRAFTS.map((g, i) => `${i + 1}. ${g}`).join('\n')}

MUST FIX (from the same judge):
${MUST_FIX.map((m, i) => `${i + 1}. ${m}`).join('\n')}` : `Previous round's judges (three lenses) said:
${feedback}
Fix every item they listed, in their order of severity, without regressing what already passed.`}

Method: code → capture → look, at least four rounds this session. Capture: \`${SHOT} --port=${PORT} --el=arc --kind=beam --moments=0.06,0.15,0.3,0.6,1.2 --out=${out}/r<N>\` (the wrapper serialises the GPU; check \`actual\` vs \`moment\` in index.json and re-shoot on drift > 0.08 s; use \`--cams=broadcast,side\` for quick rounds). The capture tool now has FOUR cameras: broadcast (26 m, along the beam — this is what the viewer sees most), side (26 m, perpendicular to the beam — judge the bundle shape here), low (15 m), top. Read the PNGs; zoom by cropping with python3 + PIL; count hot pixels and deep-blue pixels in the bundle box if the judge asked for numbers.

Keep the other deliveries (cone/zone/self/ball/impact) importing valid names and drawing without console errors; adapt their calls minimally if an API changes. Do not edit core.js, kit.js, vfx.js, main.js.

Final for this round: \`${SHOT} --port=${PORT} --el=arc --kind=beam --moments=0.06,0.15,0.3,0.6,1.2 --out=${out}/final\` (all four cameras), then the smoke run \`${SHOT} --port=${PORT} --el=arc --kind=cone,zone,self,bolt,lob --cams=broadcast --moments=0.3 --out=${out}/others\` with errors empty. Then write/refresh ${SCRATCH}/PRIMITIVE-NOTES.md: the API of field.js and common.js (every exported function, its options and what it draws, with the numbers that matter: widths in metres, restrike interval, hot ranges, how to make floor crackle marks, how to make a tangle, how to make spikes readable on the white floor, the cast orb, the impact cloud, the floor ring), the beam timeline as the quality bar, and the paths of this round's final frames. Other builders will rework the other deliveries from those notes alone.`
}

function judgePrompt(round, build, lens) {
  return `You are a visual judge. Lens: ${lens}. Goal: lightning at Path of Exile 2 level; reference Storm Lance ${MAIN}/reports/vfx/reference/ref-storm-120.png, -380, -800, -1500 and crops ${SCRATCH}/ref-storm-800-crop.png, ref-storm-380-crop.png; the measured description is in ${BRIEF}. The rejected old version: ${MAIN}/reports/vfx/arc-base/arc-beam-*.png (anything not clearly better scores under 4). The tournament round it is being polished from: ${SCRATCH}/tourney/grammar/final (score it higher only if it is visibly better than that).

Frames to judge (round ${round}): ${build.framesDir} — files arc-beam-t0_06-<cam>.png, t0_15, t0_30, t0_60, t1_20 for cams broadcast, side, low, top (index.json has actual timings; fps=${build.fps}). Read ALL twenty frames with the Read tool before scoring; crop/zoom with python3 + PIL when in doubt. Broadcast and side (both 26 m) weigh double. Builder's summary: ${JSON.stringify(build.summary)}; its listed weaknesses: ${JSON.stringify(build.weaknesses)}. Score what you see. 0–10 per criterion, total max 60. Be harsh and specific; the mustFix list must be actionable and ordered by impact.`
}

function reviewPrompt(build) {
  return `Code review of src/viewer/vfx/arc/field.js, common.js, beam.js, util.js in ${MAIN} (read them in full; compare with \`git diff HEAD -- src/viewer/vfx/arc\`). Rules: ${BRIEF} "Hard constraints". Check: TSL only; node materials only via pooled(); shared() geometry; no Math.random; densities via kit.footprint/countFor; timing via vfx.spawnMesh; no lights added; no growing per-frame allocations; the other deliveries (cone.js, zone.js, self.js, ball.js, impact.js) still import valid names and call the current API; exports of arc.js unchanged; forbidden words absent; comments in Russian. Run \`node --check\` on every file in src/viewer/vfx/arc and \`cd ${MAIN} && node tools/checkscope.mjs\`. Estimate per-restrike CPU (segments × rate) and layered overdraw; flag anything that could drop below 20 fps with three simultaneous beams. ok=false only for blockers or several majors.`
}

let feedback = ''
let last = null
for (let round = 1; round <= MAX_ROUNDS; round++) {
  phase('Build')
  const build = await agent(buildPrompt(round, feedback), { label: `build:r${round}`, phase: 'Build', schema: BUILD_SCHEMA, effort: 'xhigh' })
  if (!build) { log(`round ${round}: builder returned nothing`); break }
  phase('Judge')
  const [j1, j2, j3, review] = await parallel([
    () => agent(judgePrompt(round, build, 'FIDELITY — the bundle from side/low: a thick braided cage of many crossing filaments, cells, divergence, white-hot crossings'), { label: `judge:fidelity:r${round}`, phase: 'Judge', schema: SCORE_SCHEMA, effort: 'high' }),
    () => agent(judgePrompt(round, build, 'READABILITY — from broadcast and side over the white floor: visible as lightning at a glance, saturated, not pale; spikes, ring and marks findable without a crop'), { label: `judge:readability:r${round}`, phase: 'Judge', schema: SCORE_SCHEMA, effort: 'high' }),
    () => agent(judgePrompt(round, build, 'GRAMMAR AND RESIDUE — the five moments tell the story: cast orb, emergence, impact cloud/spikes/ring, bare bolt, dark-blue crackle carpet along the whole path'), { label: `judge:grammar:r${round}`, phase: 'Judge', schema: SCORE_SCHEMA, effort: 'high' }),
    () => agent(reviewPrompt(build), { label: `review:r${round}`, phase: 'Judge', schema: REVIEW_SCHEMA, effort: 'high' }),
  ])
  const judges = [j1, j2, j3].filter(Boolean)
  const mean = judges.length ? judges.reduce((s, j) => s + j.total, 0) / judges.length : 0
  const blockers = review ? review.issues.filter((i) => i.severity === 'blocker') : []
  log(`round ${round}: mean ${mean.toFixed(1)}/60 (${judges.map((j) => j.total).join('/')}), blockers ${blockers.length}, fps ${build.fps}`)
  last = { round, build, judges, review, mean }
  if (mean >= PASS && blockers.length === 0) break
  feedback = judges.map((j, i) => `Judge ${i + 1} (${j.total}/60, scores ${JSON.stringify(j.scores)}): ${j.verdict}\n  must fix: ${j.mustFix.map((m, k) => `(${k + 1}) ${m}`).join(' ')}`).join('\n\n')
  if (review && review.issues.length) feedback += `\n\nCode review (ok=${review.ok}): ${review.issues.map((i) => `[${i.severity}] ${i.file}${i.line ? ':' + i.line : ''} ${i.text}`).join(' | ')}`
}

return last ? { round: last.round, mean: last.mean, passed: last.mean >= PASS, framesDir: last.build.framesDir, fps: last.build.fps, errors: last.build.errors, summary: last.build.summary, weaknesses: last.build.weaknesses, judges: last.judges.map((j) => ({ total: j.total, scores: j.scores, verdict: j.verdict, mustFix: j.mustFix })), review: last.review } : { error: 'no round completed' }
