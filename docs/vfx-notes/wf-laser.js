export const meta = {
  name: 'laser-beam',
  description: 'Build the laser (stock beam for kinetic and void) to Nova Beam level in a worktree, judged on captured frames, up to two rounds',
  phases: [
    { title: 'Build', detail: 'one builder per round in a worktree with its own dev viewer' },
    { title: 'Judge', detail: 'two visual judges and a reviewer per round' },
  ],
}

const SCRATCH = '/private/tmp/claude-501/-Users-boozybats-Public-Repos-work-Airena/a378fd9a-0203-4e7c-8a06-c8cd814a8151/scratchpad'
const MAIN = '/Users/boozybats/Public/Repos/work/Airena'
const BRIEF = `${SCRATCH}/LASER-BRIEF.md`
const LBRIEF = `${SCRATCH}/LIGHTNING-BRIEF.md`
const SHOT = `${SCRATCH}/shot.sh`
const MAX_ROUNDS = 2
const PASS = 44

const BUILD_SCHEMA = {
  type: 'object',
  required: ['worktree', 'patch', 'framesDir', 'voidFramesDir', 'iterations', 'fps', 'errors', 'summary', 'weaknesses'],
  properties: {
    worktree: { type: 'string' },
    patch: { type: 'string', description: 'absolute path of the git patch with the full change (new files included)' },
    framesDir: { type: 'string', description: 'absolute dir with the FINAL kinetic captures (four cameras, moments 0.1,0.3,0.7,1.2)' },
    voidFramesDir: { type: 'string', description: 'absolute dir with the void captures (broadcast and side, moments 0.3,0.7)' },
    iterations: { type: 'integer' },
    fps: { type: 'number' },
    errors: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    weaknesses: { type: 'array', items: { type: 'string' } },
  },
}

const SCORE_SCHEMA = {
  type: 'object',
  required: ['scores', 'total', 'verdict', 'mustFix'],
  properties: {
    scores: {
      type: 'object',
      required: ['structure', 'brightness', 'whiteFloor', 'grammar', 'residue', 'artifacts'],
      properties: {
        structure: { type: 'number', description: '0-10: cast orb, translucent tube, 4–6 helix ribbons, travelling ring pulses, dome at the target, whips past it — like Nova Beam' },
        brightness: { type: 'number', description: '0-10: HDR white ribbon cores that bloom, luminous tube, nothing pale or grey' },
        whiteFloor: { type: 'number', description: '0-10: tube, ribbons and rings keep shape and colour over the white floor from broadcast and side' },
        grammar: { type: 'number', description: '0-10: 0.1 orb, 0.3 beam at power with rings streaming, 0.7 still at power, 1.2 decaying with the dome and floor sparkle left' },
        residue: { type: 'number', description: '0-10: floor sparkle carpet under the path and a persistent decal' },
        artifacts: { type: 'number', description: '0-10: 10 = no gaps, hard edges, popping, whiteout, ribbons seen as flat strips' },
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

function buildPrompt(round, port, prev, feedback) {
  const out = `${SCRATCH}/laser/r${round}`
  return `You build the laser of the Airena viewer: the stock beam delivery for elements without an effect module (kinetic, void), to Path of Exile 2 level, reference Nova Beam. Read first: ${BRIEF} (goal, measured reference, palette mapping, where the code goes) and ${LBRIEF} (its "Hard constraints" and "How to build and look" apply verbatim). Then look at the reference frames ${MAIN}/reports/vfx/reference/ref-nova-150.png, -450, -900, -1600 and the crops ${SCRATCH}/ref-nova-900-crop.png, ref-nova-1600-crop.png, and at the current baseline ${SCRATCH}/laser-base/kinetic-beam-t0_10-broadcast.png (and t0_30, t0_70; -low, -top).

You work in an isolated git worktree (run \`pwd\` and \`git rev-parse --show-toplevel\`; that is ROOT; never touch ${MAIN}). Setup: \`ln -s ${MAIN}/node_modules ROOT/node_modules\`; ${prev ? `apply the previous round's work first: \`cd ROOT && git apply ${prev}\` (it adds src/viewer/vfx/laser.js and edits vfx.js); ` : ''}\`PORT=${port} node src/server/index.js > /tmp/viewer-${port}.log 2>&1 &\` from ROOT; verify \`curl -s -o /dev/null -w '%{http_code}' http://localhost:${port}/\` is 200. Read ROOT/src/viewer/vfx/core.js, kit.js, the Particles class and Vfx.beam/tubeMat in ROOT/src/viewer/vfx.js, and ROOT/src/viewer/vfx/arc/field.js + common.js + beam.js (the lightning that just passed a tournament: how it renders HDR cores, jackets on the white floor, cast orb, impact cloud, floor ring, floor marks — reuse its ideas, and you may import helpers from arc/ if they are generic; do not edit arc/).

${feedback ? `Previous round's judges said:\n${feedback}\nFix every item in order of severity without regressing what passed.` : ''}

Scope: new ROOT/src/viewer/vfx/laser.js exporting beam(vfx, e, P, ctx) => boolean; one edit in ROOT/src/viewer/vfx.js so Vfx.beam tries laserFx.beam first and falls back to the old tube on false. Nothing else changes (kit.js only if a decal type is truly needed, see the brief). Ice, fire and lightning beams must be untouched (they never reach Vfx.beam).

Method: code → capture → look, at least four rounds. Capture: \`${SHOT} --port=${port} --el=kinetic --kind=beam --moments=0.1,0.3,0.7,1.2 --out=${out}/r<N>\` (the wrapper serialises the GPU; check \`actual\` vs \`moment\` in index.json and re-shoot on drift > 0.08 s; \`--cams=broadcast,side\` for quick rounds). Cameras: broadcast (26 m, almost along the beam), side (26 m, perpendicular — judge the helix and rings here), low, top. Read the PNGs; crop with python3 + PIL to check ribbon widths and ring visibility. Final: \`${SHOT} --port=${port} --el=kinetic --kind=beam --moments=0.1,0.3,0.7,1.2 --out=${out}/final\` (four cameras) and \`${SHOT} --port=${port} --el=void --kind=beam --cams=broadcast,side --moments=0.3,0.7 --out=${out}/void\`; errors empty, fps ≥ 20. Patch: \`cd ROOT && git add -N src/viewer && git diff > ${out}/final.patch\`. Do not commit. Stop the viewer: \`lsof -ti tcp:${port} | xargs kill\`.`
}

function judgePrompt(round, build, lens) {
  return `You are a visual judge. Lens: ${lens}. Goal: a laser beam at Path of Exile 2 level; reference Nova Beam ${MAIN}/reports/vfx/reference/ref-nova-150.png, -450, -900, -1600 and crops ${SCRATCH}/ref-nova-900-crop.png, ref-nova-1600-crop.png; the measured description and palette mapping are in ${BRIEF}. The rejected baseline: ${SCRATCH}/laser-base/ (kinetic-beam-*.png) — anything not clearly better scores under 4. Frames (round ${round}): ${build.framesDir} — kinetic-beam-t0_10-<cam>.png, t0_30, t0_70, t1_20 for cams broadcast, side, low, top; void: ${build.voidFramesDir}. Read ALL of them with the Read tool before scoring; crop/zoom with python3 + PIL when in doubt. Broadcast and side weigh double. Builder's summary: ${JSON.stringify(build.summary)}; weaknesses it listed: ${JSON.stringify(build.weaknesses)}. Score what you see, 0–10 per criterion, total max 60; mustFix ordered by impact, naming frames.`
}

function reviewPrompt(build) {
  return `Code review of a three.js r180 WebGPU/TSL effects change: patch ${build.patch}, worktree ${build.worktree}; read src/viewer/vfx/laser.js in full and the diff of src/viewer/vfx.js there. Rules: ${LBRIEF} "Hard constraints". Check: TSL only; node materials only via pooled(); shared() geometry; no Math.random (use mulberry(seedOf(e))); densities via kit.footprint/countFor; timing via vfx.spawnMesh; no lights added; the Vfx.beam edit falls back correctly and never breaks ice/fire/lightning beams; no other file changed; forbidden words absent; comments in Russian. Run \`node --check\` on both files and \`cd ${build.worktree} && node tools/checkscope.mjs\` and \`node tools/checkgrammar.mjs\` (node_modules symlinked). Estimate per-frame cost and flag anything below 20 fps with two beams. ok=false only for blockers or several majors.`
}

let feedback = ''
let prev = null
let last = null
for (let round = 1; round <= MAX_ROUNDS; round++) {
  const port = 8840 + round
  phase('Build')
  const build = await agent(buildPrompt(round, port, prev, feedback), { label: `build:laser:r${round}`, phase: 'Build', schema: BUILD_SCHEMA, effort: 'xhigh', isolation: 'worktree' })
  if (!build) { log(`round ${round}: builder returned nothing`); break }
  phase('Judge')
  const [j1, j2, review] = await parallel([
    () => agent(judgePrompt(round, build, 'STRUCTURE AND BRIGHTNESS — orb, tube, helix ribbons, ring pulses, dome, whips, HDR cores'), { label: `judge:structure:r${round}`, phase: 'Judge', schema: SCORE_SCHEMA, effort: 'high' }),
    () => agent(judgePrompt(round, build, 'READABILITY, GRAMMAR AND RESIDUE — reads on the white floor at 26 m, the four moments tell the story, floor sparkle and decal remain'), { label: `judge:grammar:r${round}`, phase: 'Judge', schema: SCORE_SCHEMA, effort: 'high' }),
    () => agent(reviewPrompt(build), { label: `review:laser:r${round}`, phase: 'Judge', schema: REVIEW_SCHEMA, effort: 'high' }),
  ])
  const judges = [j1, j2].filter(Boolean)
  const mean = judges.length ? judges.reduce((s, j) => s + j.total, 0) / judges.length : 0
  const blockers = review ? review.issues.filter((i) => i.severity === 'blocker') : []
  log(`laser round ${round}: mean ${mean.toFixed(1)}/60 (${judges.map((j) => j.total).join('/')}), blockers ${blockers.length}, fps ${build.fps}`)
  last = { round, build, judges, review, mean }
  prev = build.patch
  if (mean >= PASS && blockers.length === 0) break
  feedback = judges.map((j, i) => `Judge ${i + 1} (${j.total}/60, ${JSON.stringify(j.scores)}): ${j.verdict}\n  must fix: ${j.mustFix.map((m, k) => `(${k + 1}) ${m}`).join(' ')}`).join('\n\n')
  if (review && review.issues.length) feedback += `\n\nCode review (ok=${review.ok}): ${review.issues.map((i) => `[${i.severity}] ${i.file}${i.line ? ':' + i.line : ''} ${i.text}`).join(' | ')}`
}

return last ? { round: last.round, mean: last.mean, passed: last.mean >= PASS, patch: last.build.patch, worktree: last.build.worktree, framesDir: last.build.framesDir, voidFramesDir: last.build.voidFramesDir, fps: last.build.fps, errors: last.build.errors, summary: last.build.summary, weaknesses: last.build.weaknesses, judges: last.judges.map((j) => ({ total: j.total, scores: j.scores, verdict: j.verdict, mustFix: j.mustFix })), review: last.review } : { error: 'no round completed' }
