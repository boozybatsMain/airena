export const meta = {
  name: 'lightning-tournament',
  description: 'Three independent reworks of the lightning primitive and beam, judged on captured frames against the PoE2 reference',
  phases: [
    { title: 'Build', detail: 'three contestants, each in its own worktree with its own dev viewer' },
    { title: 'Judge', detail: 'visual judges score frames against the reference; a reviewer checks constraints' },
    { title: 'Decide', detail: 'one comparative judge picks the winner and lists ideas to graft' },
  ],
}

const SCRATCH = '/private/tmp/claude-501/-Users-boozybats-Public-Repos-work-Airena/a378fd9a-0203-4e7c-8a06-c8cd814a8151/scratchpad'
const MAIN = '/Users/boozybats/Public/Repos/work/Airena'
const BRIEF = `${SCRATCH}/LIGHTNING-BRIEF.md`
const SHOT = `${SCRATCH}/shot.sh`

const CONTESTANTS = [
  {
    key: 'topology', port: 8831,
    angle: `LEAD WITH TOPOLOGY. Your first and biggest investment is the bundle generator in field.js: a cage/net of 12–20 filaments diverging from one point at the hand into a tube 0.8–1.4 m across at the far end, jagged polylines with 0.3–0.6 m segments and sharp kinks, filaments that repeatedly cross and re-converge, short cross-links (rungs) between neighbouring filaments, stubs that end in space, a dense white tangle at the impact. Think about how to generate it deterministically and cheaply on every restrike (every 40–60 ms), e.g. a shared "envelope" spine with per-filament lateral noise, then rungs between nearby points. Then make the rendering (widths, HDR core, jacket on the white floor) and the cast grammar (muzzle orb, impact cloud/spikes/ring, floor crackle residue) good enough that the beam frames read like the reference at 26 m.`,
  },
  {
    key: 'rendering', port: 8832,
    angle: `LEAD WITH RENDERING. Your first and biggest investment is what a filament looks like on screen at the broadcast distance (26 m, ~66 px per metre at 1600 px wide): a ~2 px pure white HDR core (colour above 1.0 so the selective bloom carries it), a 6–10 px saturated blue halo, and a jacket that keeps the shape and colour on the WHITE floor (normal blending, deep saturated blue, nearly opaque where it matters). Measure it: capture, zoom into the PNG with the Read tool, count pixels. Then the floor crackle carpet (small bright blue jagged marks under and beside the path, normal-blended so they read on white, glowing cores, outliving the bolt), velocity-stretched white spike sparks, the muzzle orb and the impact cloud. Then improve the bundle topology (many filaments, crossings, rungs, divergence) so there is something worth rendering.`,
  },
  {
    key: 'grammar', port: 8833,
    angle: `LEAD WITH THE CAST GRAMMAR AND MOTION. Your first and biggest investment is the whole life of the cast as a timeline that reads at 0.1 / 0.3 / 0.6 / 1.2 s from the broadcast camera: a soft bluish-white cast orb at the hand (first ~300 ms), the bundle emerging from it over ~100 ms, a full-power phase of ~500 ms where the net is redrawn every 40–60 ms with a visible hot flash on each restrike, the impact: a big soft white cloud, long thin white spikes flying radially, a thin expanding white floor ring, then decay of the bundle over ~300 ms into a floor residue of scattered blue crackle marks that lasts ~1.5 s and fades last. Build the bundle topology (many diverging, crossing filaments with rungs) and the rendering (HDR core, halo, jacket on white) in service of that timeline, and make sure every one of the four moments looks like a still from the reference and not like an empty floor or a smudge.`,
  },
]

const BUILD_SCHEMA = {
  type: 'object',
  required: ['worktree', 'patch', 'framesDir', 'iterations', 'fps', 'errors', 'summary', 'weaknesses', 'otherDeliveriesOk'],
  properties: {
    worktree: { type: 'string', description: 'absolute path of the worktree you built in' },
    patch: { type: 'string', description: 'absolute path of the git patch file with your full change' },
    framesDir: { type: 'string', description: 'absolute dir with the FINAL captures (all three cameras, moments 0.1,0.3,0.6,1.2)' },
    iterations: { type: 'integer', description: 'how many capture-and-look rounds you did' },
    fps: { type: 'number', description: 'fps reported in the final index.json' },
    errors: { type: 'array', items: { type: 'string' }, description: 'console errors from the final index.json (must be empty)' },
    summary: { type: 'string', description: 'what you built, in 10–20 sentences: geometry, materials, timeline, numbers' },
    weaknesses: { type: 'array', items: { type: 'string' }, description: 'what you know is still weak' },
    otherDeliveriesOk: { type: 'boolean', description: 'cone/zone/self/bolt/lob/impact still draw without console errors' },
  },
}

const SCORE_SCHEMA = {
  type: 'object',
  required: ['scores', 'total', 'verdict', 'strongest', 'weakest'],
  properties: {
    scores: {
      type: 'object',
      required: ['bundle', 'brightness', 'whiteFloor', 'grammar', 'residue', 'artifacts'],
      properties: {
        bundle: { type: 'number', description: '0-10: thick braided cage of many crossing filaments with divergence, like the reference' },
        brightness: { type: 'number', description: '0-10: white-hot core, saturated blue halo, crossings bloom white, nothing pale or grey' },
        whiteFloor: { type: 'number', description: '0-10: the bolt keeps shape and colour where it crosses the white floor from the broadcast camera' },
        grammar: { type: 'number', description: '0-10: cast orb at the hand, emergence, impact cloud + spikes + floor ring read at 0.1/0.3/0.6' },
        residue: { type: 'number', description: '0-10: dense floor crackle carpet along the path that outlives the bolt (1.2 s frame)' },
        artifacts: { type: 'number', description: '0-10: 10 = no visible artifacts (gaps, flat ribbons seen edge-on, clipping through floor, hard rectangles, over-bloom whiteout)' },
      },
    },
    total: { type: 'number' },
    verdict: { type: 'string', description: '5–10 sentences: what reads like the reference, what does not, per camera' },
    strongest: { type: 'string', description: 'the single best idea in this contestant, worth grafting' },
    weakest: { type: 'string', description: 'the single worst problem' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['ok', 'issues'],
  properties: {
    ok: { type: 'boolean', description: 'true if the patch can be merged as is' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'file', 'text'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          text: { type: 'string' },
        },
      },
    },
  },
}

const DECIDE_SCHEMA = {
  type: 'object',
  required: ['winner', 'ranking', 'reason', 'grafts', 'mustFix'],
  properties: {
    winner: { type: 'string', enum: ['topology', 'rendering', 'grammar'] },
    ranking: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string', description: '10–15 sentences comparing the three on the same moments and cameras' },
    grafts: { type: 'array', items: { type: 'string' }, description: 'concrete ideas from the losers to graft onto the winner, each with the contestant name and where in its code it lives' },
    mustFix: { type: 'array', items: { type: 'string' }, description: 'what the winner still must fix before it is at reference level' },
  },
}

function buildPrompt(c) {
  const out = `${SCRATCH}/tourney/${c.key}`
  return `You are one of three contestants reworking the lightning effect of the Airena viewer. Read the brief first: ${BRIEF} — it has the goal, the measured reference description, the constraints and the capture procedure. Then look at the reference frames (${MAIN}/reports/vfx/reference/ref-storm-120.png, -380, -800, -1500 and the crops ${SCRATCH}/ref-storm-800-crop.png, ref-storm-380-crop.png, ref-storm-120-crop.png) and at the current frames in ${MAIN}/reports/vfx/arc-base/ (arc-beam-t0_10-broadcast.png, t0_30, t0_60, plus -low and -top).

Your angle: ${c.angle}

You work in an isolated git worktree (run \`pwd\` and \`git rev-parse --show-toplevel\` first; that is ROOT; never touch ${MAIN}). Setup, in order:
1. \`ln -s ${MAIN}/node_modules ROOT/node_modules\`
2. \`PORT=${c.port} node src/server/index.js > /tmp/viewer-${c.port}.log 2>&1 &\` from ROOT, then verify \`curl -s -o /dev/null -w '%{http_code}' http://localhost:${c.port}/\` prints 200.
3. Read ROOT/src/viewer/vfx/arc/field.js, common.js, beam.js, util.js, and ROOT/src/viewer/vfx/core.js, kit.js, and the Particles class in ROOT/src/viewer/vfx.js. Skim ice.js beam() to see how a module that the founder accepted handles the white floor.

Scope: the primitive (field.js), the shared pieces (common.js) and the beam delivery (beam.js); util.js if needed. Other deliveries (cone/zone/self/ball/impact) share field.js and common.js: keep their calls working (adapt them minimally if you change an API; a broken import or a thrown error in any of them is a fail). Do not edit core.js, kit.js, vfx.js, main.js. Do not change the export list of arc.js.

Method: code → capture → look, at least four rounds. Capture with \`${SHOT} --port=${c.port} --el=arc --kind=beam --moments=0.1,0.3,0.6 --out=${out}/r<N>\` (the wrapper serialises the GPU; a run takes ~1 min; check \`actual\` vs \`moment\` in index.json and re-shoot if drift > 0.08 s). Read the PNGs and compare with the reference: broadcast camera first, it is the one the viewer sees. Use \`--cams=broadcast\` for quick rounds. Zoom into details by cropping with python3 + PIL if needed (available). Judge honestly: if it still looks like a few pale wavy lines, it is not done.

Final: \`${SHOT} --port=${c.port} --el=arc --kind=beam --moments=0.1,0.3,0.6,1.2 --out=${out}/final\` (all three cameras), then a smoke run of the other deliveries: \`${SHOT} --port=${c.port} --el=arc --kind=cone,zone,self,bolt,lob --cams=broadcast --moments=0.3 --out=${out}/others\` and confirm errors is empty in its index.json. Then write your patch: \`cd ROOT && git add -N src/viewer/vfx && git diff > ${out}/final.patch\` (must include new files). Do not commit. Stop the viewer at the end: \`pkill -f "PORT=${c.port}" ; lsof -ti tcp:${c.port} | xargs kill\`.

Return the structured result. Your text is not read by a human; the frames and the patch are what gets judged.`
}

function judgePrompt(c, build, lens) {
  return `You are a visual judge for a VFX tournament. Scoring lens: ${lens}. The goal is lightning at Path of Exile 2 quality; the reference is Storm Lance: ${MAIN}/reports/vfx/reference/ref-storm-120.png, ref-storm-380.png, ref-storm-800.png, ref-storm-1500.png (and crops ${SCRATCH}/ref-storm-800-crop.png, ref-storm-380-crop.png). The brief with the measured reference description is ${BRIEF} (read the section "What the reference actually looks like"). The old, rejected version is in ${MAIN}/reports/vfx/arc-base/ (arc-beam-*.png) — anything not clearly better than that scores below 4.

Contestant "${c.key}" frames: ${build.framesDir} (files arc-beam-t0_10-broadcast.png, t0_30, t0_60, t1_20 and the same for -low and -top; index.json has actual timings and fps=${build.fps}). Read ALL twelve frames with the Read tool (plus the reference) before scoring; you may crop/zoom with python3 + PIL. The contestant says: ${JSON.stringify(build.summary)}. Its own listed weaknesses: ${JSON.stringify(build.weaknesses)}. Do not trust the description; score what you see. Broadcast camera (26 m) weighs double: it is what the viewer actually sees.

Score each criterion 0–10 and sum into total (max 60). Be harsh and specific: name the frame and what is wrong.`
}

function reviewPrompt(c, build) {
  return `You are a code reviewer for a three.js r180 WebGPU/TSL effects module. Review the patch ${build.patch} (worktree at ${build.worktree}; read the changed files there in full: src/viewer/vfx/arc/field.js, common.js, beam.js, util.js). The rules are in ${BRIEF} under "Hard constraints". Check specifically: TSL only (no GLSL strings, no ShaderMaterial); node materials created only through pooled() and never per cast; shared() on geometry reused across casts; no Math.random anywhere in the module; densities through kit.footprint/countFor; one interleaved instanced buffer (WebGPU 8-vertex-buffer limit); no scene lights added; uniforms per material updated per frame not per cast leak; no unbounded arrays or per-frame allocations that would grow; no timers (setTimeout/requestAnimationFrame) — timing must go through vfx.spawnMesh updates; the export list of arc.js unchanged; other deliveries still importing valid names; no forbidden words (prices, "токен", "скин", new Audio, ".play();"); comments in Russian. Run \`node --check\` on each changed file and \`cd ${build.worktree} && node tools/checkscope.mjs\` (node_modules is symlinked there) and report failures. Also estimate per-restrike CPU cost (segments written × restrike rate) and GPU overdraw (layers × width × segments) and flag anything that could drop below 20 fps with three simultaneous casts. Return ok=false only for blockers or several majors.`
}

/* ── Build, then judge each contestant as soon as it is done ────────────── */

const results = await pipeline(
  CONTESTANTS,
  (c) => agent(buildPrompt(c), { label: `build:${c.key}`, phase: 'Build', schema: BUILD_SCHEMA, effort: 'xhigh', isolation: 'worktree' }),
  async (build, c) => {
    if (!build) return null
    const [j1, j2, j3, review] = await parallel([
      () => agent(judgePrompt(c, build, 'FIDELITY — does the bolt look like the reference bundle: a thick braided cage of many crossing filaments, white-hot crossings, saturated blue halo'), { label: `judge:fidelity:${c.key}`, phase: 'Judge', schema: SCORE_SCHEMA, effort: 'high' }),
      () => agent(judgePrompt(c, build, 'READABILITY — does it read on the white arena floor from the broadcast camera and from the top camera; is it visible as lightning at a glance, not a smudge'), { label: `judge:readability:${c.key}`, phase: 'Judge', schema: SCORE_SCHEMA, effort: 'high' }),
      () => agent(judgePrompt(c, build, 'GRAMMAR AND MOTION — do the four moments tell the story: cast orb, emergence, full power with impact cloud/spikes/ring, decay into floor residue'), { label: `judge:grammar:${c.key}`, phase: 'Judge', schema: SCORE_SCHEMA, effort: 'high' }),
      () => agent(reviewPrompt(c, build), { label: `review:${c.key}`, phase: 'Judge', schema: REVIEW_SCHEMA, effort: 'high' }),
    ])
    const judges = [j1, j2, j3].filter(Boolean)
    const mean = judges.length ? judges.reduce((s, j) => s + j.total, 0) / judges.length : 0
    log(`${c.key}: mean ${mean.toFixed(1)}/60 over ${judges.length} judges, review ok=${review ? review.ok : 'n/a'}`)
    return { key: c.key, build, judges, review, mean }
  },
)

const done = results.filter(Boolean)
if (!done.length) return { error: 'no contestant finished' }

/* ── One comparative judge sees all finals side by side ─────────────────── */

phase('Decide')
const table = done.map((r) => `- ${r.key}: frames ${r.build.framesDir}, patch ${r.build.patch}, mean judge score ${r.mean.toFixed(1)}/60; judges said: ${r.judges.map((j) => j.verdict).join(' | ')}; review ok=${r.review ? r.review.ok : 'n/a'}, blockers: ${r.review ? JSON.stringify(r.review.issues.filter((i) => i.severity === 'blocker')) : 'n/a'}`).join('\n')
const decision = await agent(`You decide a VFX tournament: three reworks of the same lightning beam, each captured from the same three cameras at the same four moments (0.1, 0.3, 0.6, 1.2 s). Reference: Path of Exile 2 Storm Lance, ${MAIN}/reports/vfx/reference/ref-storm-120.png, -380, -800, -1500 (crops in ${SCRATCH}). Brief: ${BRIEF}.

Contestants:
${table}

Read, for every contestant, at least arc-beam-t0_30-broadcast.png, arc-beam-t0_60-broadcast.png, arc-beam-t0_10-broadcast.png, arc-beam-t1_20-broadcast.png, arc-beam-t0_30-low.png and arc-beam-t0_30-top.png, side by side with the reference, before deciding. Compare the SAME moment and camera across contestants. Pick the winner by what is on screen from the broadcast camera, then by the other cameras, then by the reviews (a blocker in the review is a real cost but a fixable one; a pale smudge is not). List concrete grafts: ideas in the losers that beat the winner on some criterion, naming the contestant and the code location (read their patches). List what the winner must still fix.`, { label: 'decide', phase: 'Decide', schema: DECIDE_SCHEMA, effort: 'xhigh' })

return { decision, contestants: done.map((r) => ({ key: r.key, mean: r.mean, worktree: r.build.worktree, patch: r.build.patch, framesDir: r.build.framesDir, fps: r.build.fps, errors: r.build.errors, othersOk: r.build.otherDeliveriesOk, weaknesses: r.build.weaknesses, review: r.review, judges: r.judges.map((j) => ({ total: j.total, scores: j.scores, strongest: j.strongest, weakest: j.weakest })) })) }
