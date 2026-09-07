# Review r2 — minds (MIND INTELLIGENCE lens)

Score: 58 / 100

Round 1's worst symptoms (blind instruments, faceAt eating every lead, idle-in-reach up to
74%, standing still up to 71%, say-spam, literal kit numbers, cover misses) are genuinely
fixed, and the four minds read as code this round (ASH AND ICE, BARROW WARDEN, MINE HEDGEHOG,
ASH WOLF — top-3 of the live ladder plus one library creature) all aim with `{x,z}` points, lead
a shot with `V.lead()`, gate a cast on `api.los()`, read `en.casting.telegraph` and status flags
(`me.rooted/burning/silenced`), and reposition with purpose (kiting distance that shrinks when
a burst is ready, retreat from `p.arena.zones` the enemy owns). That is real progress and it
shows in the numbers: idle-in-reach is now single digits to ~30% (was up to 74%), immune/dodge/
lead instrumentation is no longer structurally blind. But the thing this lens actually measures
— does the mind win by outplaying a simple script — is still failing at the population level:
across the 36 ladder minds just rewritten, the admission probe's own numbers average **1.5 of 4
wins (37.5%) against the same-kit scripted stub**, a bot whose own docstring calls it a
deliberately weak sparring partner a novice should beat; **11 of 36 (31%) win zero of four** and
are admitted only on the damage-share fallback. Replaying the current #1-rated ladder creature
(ASH AND ICE, rating 1661) over 3 opponents × 8 games confirms it: **0-8 vs the stub, 0-8 vs the
kiter pilot, only 7-1 vs the straight-in rusher** — the top of the entire leaderboard cannot beat
its own training partner. All four sampled minds together go **2 of 32 (6%) vs the kiter pilot**.
Not shippable at 80; it is a real step up from 52, held back by an ELO ladder that does not track
combat competence and by aiming that still does not survive contact with a target that changes
direction.

## Round-1 findings — status

| # | finding | status | measured now |
|---|---|---|---|
| 1 | Aimed mortar/bolt can't land on a dodging target; caster-vs-kiter → clock | **partly fixed** | Mortar-on-point (F2) gives 100% on-target vs the stub/rusher (BARROW WARDEN), but leading a target that changes velocity mid-flight is still **actively worse than no lead**: vs the kiter pilot its mortar hit rate collapses 100%→6%, mean landing error 4.7 m vs a no-lead 1.9 m. |
| 2 | Admission passes minds that lose every fight | **partly fixed, recurs at scale** | The 6 named 0%-vs-stub minds are gone, but 11/36 (31%) of the new cohort still win 0/4 vs the stub, admitted on the ≥40%-damage fallback; population mean is 1.5/4 wins (37.5%), below break-even against a bot built to be weak. |
| 3 | Lead usage unmeasured; `faceAt` erases the lock | **mechanics fixed, outcome still fails** | `aimLock` now survives a same-tick and later-tick `faceAt` (verified: 3/4 sampled minds call `api.faceAt(en.x,en.z)` on almost every tick, including the cast tick, with no visible harm to *other* deliveries). But for the #1-rated creature's bolt, **0 of 82 lead-needing casts landed nearer the true intercept than a direct shot** (3 opponents), mean error 15–26°, despite correct `V.lead()` calls at the kit's live speed. |
| 4 | `immune` column counts ticks, not decisions | **fixed** | `p.self/enemy.immuneLeft` shipped; league's `immune/game` now reads ≈0.00 everywhere with the raw count printed beside it, and my own harness confirms `immuneNoDamage: 0` in every sampled fight — no wasted control-only casts, matching the fix's own prediction. |
| 5 | Dodge column blind to side-steps | **fixed** | Side-step dodges now counted. Top-8-ladder spectate sample: 0.36→1.04 dodges/match (was 0.00); league per-model 0.3–1.6/game. |
| 6 | Standing still / idle-in-reach | **mostly fixed** | Admission-time idle-in-reach mean 17.8% (max 38%), still mean 5.7% (max 22%) across 36 minds — down from r1's up to 74%/71%. The #1 creature is the outlier at 20–27% still-share (inside the ≤40% gate, above the ≤25% r1 target). |
| 7 | Bolts/beams fired into blocks; `visible` prompt fact false | **improved** | Prompt fact corrected (visible = centre-to-centre; `ray`/`los` are the real tests). Cover misses now ~2% of judged casts in the top-8 spectate sample (11/536), down from up to 45% in r1. |
| 8 | Say spam | **fixed** | `SAY_EVERY`=4 s enforced sim-side; all 4 sampled minds say ≤1–2 lines per game. |
| 9 | Live ladder is stale corpus with dead/no-kit brains | **partly fixed, sharper problem now visible** | 36/62 active creatures rewritten; the other 26 include **5 kit-stub (non-LLM, scripted) creatures averaging rating 1308 — higher than the 36 rewritten LLM minds' average of 1187** — and 2 of them (STORM 1628, ASH 1575) sit inside the top 5 by rating. |
| 10 | Literal kit numbers copied into mind code | **fixed for this corpus** | New `literal_kit_number` static gate fires (proven during development on a fable-high admission); **0 of 36** rewritten minds trigger it now (grepped `reports/combat/rethink/*.json`). |

## New findings (round 2)

**[HIGH — mechanics/measurement] The rating ladder does not track combat competence.**
ASH AND ICE (#1 by rating, 1661, `sub:opus:plain`) loses every game to the same-kit scripted
stub and to the kiter pilot; its own admission record already showed 0/4 stub wins, passed only
on damage share. At the population level the 36 rewritten minds average a **losing** record
(37.5% win rate) against a bot documented as intentionally weak, yet several of them rank at the
top of a 62-creature ELO ladder built from mind-vs-mind play. The ladder rewards beating *other
LLM minds*, most of which share the same weaknesses, not tactical soundness. Fix: fold the
admission probe's `wins`/`damageShare` vs the stub into the creature's public rating as a
one-time floor/handicap, or seed periodic stub/pilot matches into the live ladder's own match
mix so ELO has a fixed, competent reference point.
File: `reports/combat/rethink/*.json` (`behaviour` field), `data/airena.db` (`creature.rating`).

**[HIGH — mechanics] Correctly-computed lead does not survive the windup.** `V.lead()` is
mathematically sound (closed-form intercept) and every sampled mind calls it with the kit's own
live speed, but measured release headings do not land closer to the true intercept than a
direct shot (0/82, see table row 3), and a mortar's lead becomes counterproductive the moment
the target changes velocity in flight. Two candidate mechanisms, not yet disambiguated: (a) a
residual aim-lock gap for some code shape not covered by the current fix, or (b) turn rate ×
windup duration is physically too small to complete a large lead correction before the strike,
so the body fires from wherever it was already facing. Fix: instrument `fx.h` (actual release
heading) against `act.at`-derived intended heading at order time for a few hundred casts; if (b),
either widen turn-during-cast or tell the prompt that "lead" only pays off inside a turn-rate
budget it can compute.
File: `src/core/sim.js:1111-1210` (aimLock), `src/brain/prelude.js:40-58` (`V.lead`).

**[MEDIUM — mechanics/world, largely unchanged from r1] Caster-vs-kiter still goes to the
clock.** BARROW WARDEN (zone+mortar+shield) and MINE HEDGEHOG (zone+cone+shield) both hit
**8/8 sudden death vs the kiter pilot** on their own kits — the same shape as r1's "6/6 for the
three best casters," now confirmed on two different kits post-fix. Only the melee/cone-hybrid
sample (ASH AND ICE, ASH WOLF) avoided it. This is a kit-archetype/world-pace question, not a
prompt-literacy one: these minds *do* read telegraphs and status, they just cannot force a
decision against a kiting target with their kit's tools.
File: `reports/combat/rethink/{c_35e1741f-274,c_8bb73425-8cd}.json`; harness re-run at
`/private/tmp/.../scratchpad/review-minds-db.mjs --minds=c_35e1741f-274,c_8bb73425-8cd --pilots=kiter --seeds=1,2,3,4`.

**[MEDIUM — measurement] The league's own "lead usage" column is still the flawed metric r1
named.** `tools/bakeoff.mjs:1154` still defines it as "share of casts >5° off the direct
bearing while the enemy moves" — exactly the definition r1 said "rewards wrong leads." The
correct analysis (shots that needed lead, aimed nearer the true intercept than the target) was
built for r1's own harness (`review-minds.mjs`'s `idealOff`/`towardIdeal`) and used above, but
was never wired into `tools/bakeoff.mjs`'s league output, so the founder-facing table still
can't show finding B.
File: `tools/bakeoff.mjs:1154` vs `reports/combat/review-r1-minds/review-minds.mjs` (`idealOff`).

**[MODEL CHOICE, not a bug — founder decision] All 36 ladder rewrites used `sub:opus:plain`
(Opus, low effort), which the bake-off's own corrected metrics rank near the bottom of the
Claude family.** Per-model league table: `sub:fable:high` 70% win-vs-pilots / 61% win-overall /
18% idle-in-reach; `sub:opus:high` 30% / 56% / 20%; `sub:sonnet:high` 27% / 61% / 12%;
`sub:fable:plain` 27% / 47% / 21%; **`sub:opus:plain` 13% / 55% / 18%** — beaten by every "high"
effort tier and by fable's own plain tier. (Caveat repeated from the brief: the league's minds
were forged *before* the prompt fixes, so these are relative, not absolute, numbers — but the
relative ordering across models is exactly what a bake-off is for.) Forge cost is the obvious
trade: opus:plain took 13–31 s/creature (36 in 13.7 min total) vs opus:high's 179–367 s. This is
squarely the founder's lever — worth at least trying `sub:fable:high` or `sub:opus:high` on the
top bracket of the ladder, where players actually look.
File: `reports/combat/bakeoff/league.md` (Per model table); `reports/combat/rethink/REPORT.md`.

**[LOW, unchanged from r1] `p.enemy.immune`/`immuneLeft` still unread.** None of the 4 sampled
minds read it. Low-impact today because none of their kits carry a pure-control ability where
the read would change a decision (confirmed: `immuneNoDamage: 0` in every sampled fight), but
the blind spot is the same one r1 flagged and no mind has started using the new field yet.

## What was run

- `node reports/combat/spectate.mjs --n 8 --seeds 1,2 --out .../r2-minds-spectate.md` — live
  ladder top 8, 24 matches. Surfaced the kit-stub finding (STORM, ASH) and gave the population
  idle/still/dodge/cover numbers cited above.
- `node tools/checkisolate.mjs` — **ДЕРЖИТ, 25/25 attacks stopped**, honest control admitted;
  sandbox isolation is not this lens's concern but is unbroken.
- `node:sqlite` read-only queries against `data/airena.db` (`creature` table: 62 active, 36
  `sub:opus:plain`, 11 `opus`, 5 `kit-stub`, rest mixed) for the rating/model breakdown, and to
  pull `brain_source`/`kit_json`/`build_json` for ASH AND ICE, BARROW WARDEN, MINE HEDGEHOG
  (top 3 by rating) and ASH WOLF (library).
- `reports/combat/review-r1-minds/review-minds.mjs`, copied to the scratchpad and adapted
  (only `loadMind()` changed, to read the four creatures above straight from the DB instead of
  `reports/combat/bakeoff/*.json`) and run vs `stub`/`kiter`/`rusher` over seeds 1–4, both
  sides (96 games) — source of the win-loss table, the lead/mortar-error numbers, and the
  immune/say/idle breakdowns quoted throughout.
- Read `reports/combat/rethink/REPORT.md` and all 36 `reports/combat/rethink/c_*.json`
  (`behaviour`/`warnings` fields) for the admission-probe population statistics.
- Read `reports/combat/bakeoff/league.md` in full for the per-model/per-mind corrected metrics.
- Did not run any forge (`tools/bakeoff.mjs forge`, `rethink` without `--dry`); no source,
  registry, or DB row was written.

## Three most important open items (for the closing message)

1. The live rating ladder does not select for tactical competence — its #1 creature and ~a
   third of the freshly-rewritten cohort lose to their own training-partner stub.
2. A mathematically correct lead still does not land better than no lead at all once a target
   changes direction — this is the same practical failure as r1's aiming finding, with the
   named root cause fixed and a new one (or the same one, unconfirmed) still open.
3. The ladder rewrite used the weakest Claude-family bundle in the bake-off's own comparison
   (`sub:opus:plain`, 13% win-vs-pilots vs `sub:fable:high`'s 70%) — a model-choice lever the
   founder controls directly, separate from any further prompt or mechanics work.
