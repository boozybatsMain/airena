# Review r1 — minds (recovered from the workflow journal)

Score: 52 / 100

{
 "score": 52,
 "verdict": "Not shippable as \"fights that look like thinking\". The prompt rewrite fixed API literacy (27/28 minds read p.self.kit vs 0/63 in the corpus; 22/28 aim with points vs 0; 0 refused orders and 0 faults in 168 matches; 7–9.5 casts per 10 s) but not judgement: 6 of 28 admitted minds lose 8-0 to the kit-stub on their own kit; the median mind idles 20–50 % of its in-reach time (worst 74 %) or stands still (up to 71 %); the aimed mortar lands 8–18 % vs a moving target for every mind (5–6 % for the pilot itself) and every caster-vs-kiter fight goes to the burn clock; correctly led bolts land 0–4 % against a projectile-reading pilot; only 3/28 minds read p.enemy.immune; and the league's \"lead usage\", \"dodges\" and \"immune\" columns do not measure decisions, so the ≥80 loop is steering on noise. One family (Fable high) produces fights a spectator would call thinking. Full review: /Users/boozybats/Public/Repos/work/Airena/reports/combat/review-r1-minds.md; harness, experiments and timelines in /Users/boozybats/Public/Repos/work/Airena/reports/combat/review-r1-minds/.",
 "findings": [
  {
   "severity": "high",
   "title": "Aimed mortar and led bolt cannot land on an opponent who looks; root expires before the shell arrives",
   "detail": "Mortar on-target vs the kiter pilot: opus-high 10 % (8/77), fable-high 18 %, opus-plain 8 %, deepseek 9 %, GLM 0 %, nemotron-ultra 9 %; the pilot's own mortar 5–6 %. Lead-factor sweep 0→1.0 gives 5–18 % (lead-experiment.mjs); world sweep (speed 18/24, splash 2.6, wind-up 0.3) gives 9–31 % with sudden death 7–8/8 in every variant (mortar-world.mjs). A correctly led 22 m/s bolt lands 2 of 58 / 0 of 46 vs the kiter pilot (faceat-override.mjs). Root 1.5 s (registry.js:444) < mortar latency 0.5 + d/12 s (registry.js:155) = 1.67 s at 14 m: 0–16 % of mortars come down on a pinned target, 0–25 % of those land. Caster-vs-kiter sudden death 6/6 for the three best casters; league 30–60 %.",
   "fix": "World levers (cap this score): root ≥ mortar latency at mid range (root 2.2 s or mortar 18–20 m/s); shrink the reaction window (report arcs in p.arena.projectiles only after apex, or a 0.6 s lingering splash); re-price with atombalance. Acceptance: mortar-world.mjs 'as shipped' ≥ 35 % on target vs the kiter pilot, caster-vs-kiter sudden death ≤ 35 %.",
   "file": "src/skills/registry.js:155,444; src/core/deliver.js:247-302"
  },
  {
   "severity": "high",
   "title": "Admission passes minds that lose every fight; the repair loop never reports behaviour",
   "detail": "Six admitted minds are 0 % vs the kit-stub on the same kit (league.md lines 88,93,199,211: sub-opus-plain/brawler, nemotron-super brawler and kiter (0-0-248 overall), GLM caster and kiter, nemotron-ultra caster). admit() requires only fired>0 && one hit in 4 probes (src/server/sandbox/index.js:209-236). Instrumented (why-idle.mjs): the Nemotron kiter sits 3.6–4.6 m from the rusher for 24 consecutive thoughts with ready(k1)=ready(k3)=true and orders nothing — its gates are dist > 8 / > 5 (kiter.js:55-57) and it blinks toward the enemy at < 4 m (line 60); idle-in-reach 68–74 %, nemotron-ultra caster 2.7 casts/10 s. callWithRepair (tools/bakeoff.mjs:279-304) repairs syntax only.",
   "fix": "Add probe gates vs the stub on the same kit: ≥1 win of 4 or damage ≥ 40 % of the stub's; idle-in-reach ≤ 40 %; still ≤ 40 %; on failure send the spectate.mjs per-fighter numbers back through callWithRepair before rejecting. Re-forge the six 0 % minds. Acceptance: no admitted mind < 25 % vs the stub.",
   "file": "src/server/sandbox/index.js:209-236; tools/bakeoff.mjs:279-304"
  },
  {
   "severity": "high",
   "title": "Aiming is neither learned nor measured: 'lead usage' rewards wrong leads and faceAt throws the lead away",
   "detail": "League lead usage (bakeoff.mjs:425,466) counts any shot > 5° off the direct bearing: GLM kiter scores 88–89 % while only 4–6 % of its bolts were nearer the true intercept (mean 22–46° from it); sonnet-high, minimax, nemotron-super 0 % toward the intercept; fable-high 4 % vs kiter (radial shots need no lead). Mechanism: api.use(name,{x,z}) sets the facing goal once (sim.js:1064) and any later api.faceAt overwrites it (sim.js:942); sub-sonnet-high/kiter.js:56-57 faces the enemy every non-casting thought. Controlled test: faceAt during the wind-up → 0 of 58 bolts aimed nearer the intercept; without → 4 of 46. The prompt (prompt.js:823, 1265-1274) never states that a later faceAt replaces the aim turn, nor that the target sees the bolt from release.",
   "fix": "(1) Replace the league column with 'shots needing >3° of lead aimed nearer the intercept than the target' + mean error from the intercept (implemented in review-r1-minds/review-minds.mjs, idealOff). (2) Sim: a faceAt within 1 m of the enemy during a point-aimed wind-up should not replace the aim — or state the fact after prompt.js:823. (3) Prompt fact beside V.lead: a bolt is visible from release for range ÷ speed seconds; a body at top speed moves maxSpeed × that.",
   "file": "tools/bakeoff.mjs:425-466; src/core/sim.js:942,1064; src/brain/prompt.js:823,1265"
  },
  {
   "severity": "medium",
   "title": "Immunity has no end time in perception and the 'immune' column counts field ticks, not decisions",
   "detail": "3/28 minds read p.enemy.immune; 45–79 of ~100 immune lines per 6 games were ordered while the class was already immune. But 100 % of the 1,900+ immune lines in 168 matches were on damage-carrying casts (no wasted cast), and effects.js:108-116 arms immunity at application so ticks 2–5 of a frost field log 'root shrugged off' while the target is still rooted (tl-opusplain-caster-kiter.txt: root lands 3.20, refused 3.67/4.17/4.67). prompt.js:934-936 states the opposite ('replaces or extends … the longer time stands'). The league's immune/game ≈ 9 is ~80 % re-ticks and riders.",
   "fix": "Add p.enemy.immuneLeft / p.self.immuneLeft {act,move,sense} seconds in perceive (sim.js ~660) and document it; fix prompt.js:934-936; in bakeoff.mjs:563 count only immune lines that were the cast's sole targeted effect and were ordered while immune already listed the class, excluding same-ability re-ticks inside the status.",
   "file": "src/core/effects.js:108-116; src/brain/prompt.js:934-936; tools/bakeoff.mjs:563"
  },
  {
   "severity": "medium",
   "title": "Dodge column is blind to every dodge that happens; ≥1 dodge/fight target unmeasurable as defined",
   "detail": "0.00 dodges/game for all 28 minds and 4 pilots over 3,920 league matches and 168 here because a dodge is an 'airborne' miss or i-frame evade (bakeoff.mjs:555,610; league.md:229) — no bake-off kit has a leap, blink i-frames are 0.267 s. Meanwhile the kiter pilot makes 32 of fable-high's 47 bolts miss (21 cover + 11 aim) by sidestepping and using blocks, and pilots step out of mortars in flight.",
   "fix": "Dodge = opponent's judged shot that missed (aim/cover) while this side moved > 2 m/s, turned > 40°, or blinked between release and landing; credit the dodger; keep airborne/i-frame as a sub-column; re-read COMBAT.md §3 against it.",
   "file": "tools/bakeoff.mjs:555,610; docs/COMBAT.md §3"
  },
  {
   "severity": "medium",
   "title": "Standing still, 3-metre walks and retreating brawlers",
   "detail": "sonnet-plain brawler still 43–71 % (api.stop() in fan reach, brawler.js:62; wins 6-0 by trading); sonnet-high kiter still 56 % vs rusher, mean 17.7 m vs kiter with 61 % idle-with-ready (moveTo 3 m hops then stop, kiter.js:66-85; beams at 22–27 m into blocks); fable-plain brawler idle-in-reach 49–51 % after backing off from every ranged wind-up (brawler.js:22 treats ek.range && !ek.distance as a cone; line 39 returns when busy; 2 lunges in 19 s); opus-plain brawler 45 %; nemotron-ultra caster retreats to the farthest corner at hp < 35 %. Pilots: still 0–15 %, idle-in-reach 2–12 %.",
   "fix": "Carry these numbers in the H2 repair message; add the world fact 'api.moveTo ends at the point and the body stands there until the next order; a standing body is hit by every judged shape at 100 %'. Acceptance: still ≤ 25 % and idle-in-reach ≤ 25 % for every admitted mind vs the stub.",
   "file": "reports/combat/bakeoff/sub-sonnet-plain/brawler.js:62; sub-sonnet-high/kiter.js:66-85; sub-fable-plain/brawler.js:22,39"
  },
  {
   "severity": "medium",
   "title": "Beams and bolts fired into blocks; prompt's 'visible is the same test the beam performs' is false",
   "detail": "Cover misses: fable-high kiter 21/47 bolts vs the kiter pilot, minimax 19/40 beams, nemotron-super 10/36, sonnet-high 9/40, GLM 10/26. Only 8/28 minds call api.los, 3/28 read obstacles. prompt.js:1059 claims visible equals the beam test; the beam starts 1.7 m ahead along the facing (deliver.js:170) and visible is centre-to-centre now (sim.js:662), so a lead point behind a block edge or a target stepping behind one during the 0.34–0.65 s wind-up is a 'cover' miss the mind was told could not happen.",
   "fix": "Replace prompt.js:1059 with the fact: visible is centre-to-centre at this instant; a beam/bolt tests the line from 1.7 m ahead along your facing at the strike — api.ray(V.fromHeading(heading), range) is that test, api.los(aimPoint) the test for a lead point. Add a per-mind 'cover misses' column to the league.",
   "file": "src/brain/prompt.js:1059; src/core/deliver.js:170; src/core/sim.js:662"
  },
  {
   "severity": "medium",
   "title": "Say spam over standing bodies",
   "detail": "sonnet-high brawler 354 lines in 6 games vs opus-high kiter (59/game, one api.say per cast at brawler.js:22-55); sonnet-plain brawler 158–167 per 6 games (27/game, 'Feel that?' on every dealt event, line 8); sonnet-high kiter 13–14/game. SAY_SECONDS is 3 (config.js:223) so the bubble is replaced every 0.25–0.4 s.",
   "fix": "Rate-limit in sim.js:954 — one line per 2 s, extra calls dropped and counted in stats.saySuppressed; state the limit in the prompt.",
   "file": "src/core/sim.js:954; src/core/config.js:223"
  },
  {
   "severity": "low",
   "title": "Live ladder is still the pre-overhaul corpus with two brains that never cast",
   "detail": "data/airena.db (read-only): 62 active creatures, newest created 2026-09-04 (before D186–D191); 27/62 read no kit; CRUSHER (10,066 fights) and PRISM (7,790) still active with the dead k.trigger filter; 1/62 reads immune; no bake-off mind is on the ladder. Last 300 ladder matches: 20.5 s mean, 13 % sudden death, 10 casts per fighter — a tamer world than the bake-off because most of these brains cast rarely.",
   "fix": "Retire CRUSHER/PRISM and the no-kit brains (corpus audit §6.1/§6.7, still open) and seed the ladder with the top bake-off minds so the founder watches the measured world.",
   "file": "data/airena.db (creature, match)"
  },
  {
   "severity": "low",
   "title": "Literal kit numbers persist in 24/28 minds",
   "detail": "sub-sonnet-plain/brawler.js:21-22 (canK2Range = 4.9, canK1Range = 11.183 copied from the card); deepseek…/caster.js:38-44 (dist < 14, dist < 16, / 12); opus-plain caster -18.1 clamp; GLM caster ideal = 11. KIT_IS_NOT_YOURS (prompt.js:537, emitted at :491) is printed two screens after the card's numbers.",
   "fix": "Static admission gate flagging any literal within 2 % of a printed kit figure (range, reach, wind-up, cooldown, speed), returned through the repair round.",
   "file": "src/brain/prompt.js:491,537; src/server/sandbox/index.js"
  }
 ],
 "evidence": "Read 14 minds across Opus/Sonnet/Fable (high+plain), GLM 5.3 Flash, DeepSeek V4 Flash, Nemotron super/ultra, MiniMax, plus a capability matrix over all 28 admitted minds; played 168 runMatch fights (14 minds × kiter/rusher pilots on the identical kit and body × seeds 1–3 × both sides) with a spectator harness measuring casts, hit/miss/cover reasons, refused and immune lines (with 'already immune when ordered' reconstructed from applied controls), idle-with-a-ready-shape-in-reach, standing-still share, telegraph response, bolt aim vs the true intercept, mortar landing error vs the enemy at touchdown and mortars on a pinned target; read nine full timelines (opus-plain caster, fable-plain brawler, GLM kiter, Nemotron kiter, sonnet-plain brawler, fable-high kiter, opus-high caster, sonnet-high kiter, fable-high caster vs fable-high kiter). Four controlled experiments: mortar lead-factor sweep (5–18 % on target regardless), mortar speed/splash/wind-up sweep on a private kit copy (best 31 %, sudden death 7–8/8 vs kiter), faceAt-during-wind-up vs not (0 % vs 9 % toward intercept; 2 and 0 bolts land of ~50), and an instrumented per-thought log proving the Nemotron kiter idles with ready(k1)=true at 3.6 m. Read the live ladder (300 matches, 62 active creatures) read-only. Compared with brain-corpus-audit §1/§3/§5: kit reads 0/63 → 27/28, point aiming 0 → 22/28, refused orders 100–154/150 matches → 0, faults → 0; projectiles/events/los unchanged or worse; immune 3/28. No repo file, registry, pilot, gauntlet or DB row was edited; scripts and raw outputs are in reports/combat/review-r1-minds/."
}