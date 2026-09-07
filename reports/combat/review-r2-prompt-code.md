# Review r2 — the mind prompt & engineering quality

Reviewer: round 2, 07.09.2026, working tree (uncommitted overhaul on top of HEAD 8699fb6).
Method: read `reports/combat/review-r1-{prompt,code}.md` and all seven `reports/combat/fix-r1/*.md`
handoffs, `DESIGN.md` D195–D203, `docs/COMBAT.md` §2/§6; ran every listed gate; read the full
rendered kit prompt (`reports/combat/prompt-rendered.txt`, 640 lines) against `src/core/{sim,deliver,
effects}.js` for each F1–F13 sentence; ran two independent scripted-world checks (F2's mortar-lead,
cross-process determinism); queried `data/airena.db` read-only against the live server (pid 99061,
`src/server/app.js`, already running — not started or restarted by this review).

**Score: prompt 90/100.** All thirteen round-1 findings are fixed, and each fix is backed by a
sentence I can point at in the rendered prompt AND a gate or dedicated invariant that measures it
(the kit path — F7's own gap — is now traced by `checkprompt`'s two kit renders and 27 new
`checkbehaviour` claims). Nothing I read contradicts the sim; `checktactics` still finds zero
tactics across 434 judged segments. The four points held back from a clean grade are all disclosed,
minor imprecisions the authors already flagged in the handoffs (a field's tick period reads 0.508 s
against a stated 0.5 s; two numbers — the fixture's beam-muzzle literal and the 32-character memory
key cut — are still typed in two places instead of one).

**Score: code 76/100.** Every HIGH and MEDIUM from round 1 is genuinely fixed and independently
re-verified here (`sizebalance` 10.3 pp against a 12 pp gate on real cooldowns; the field-immune
invariant with 0 immune lines from a disc's own ticks; `absorbed` on a partial shield hit; the pilot
panel reading live magnitudes). What holds it under the ship bar is one required gate that is
red right now on live data — `checkladder` finds 1 dead side of 400 on the current constants
version, contradicting `docs/COMBAT.md:461`'s own recorded "0 dead sides of 400" — plus a
maintenance gap (`tools/suite.mjs`'s "every gate, in order" list silently omits `checkkits`,
`checktactics`, `checkstale` and the brief's own `checkdescribe`) and one fresh stale-comment/doc
contradiction on the leap's price. None of these is structural — they are all narrow, diagnosable,
and roughly a day's work — but "gates that actually gate" is this lens's own bar, and one of the
required ones fails it as of this run.

---

## Round-1 prompt findings (F1–F13) — all fixed

| # | round-1 claim | status | evidence |
|---|---|---|---|
| F1 | immunity armed at landing, not at expiry; "longer time stands" was false | **fixed** | `prompt-rendered.txt:301-314` states the arm-at-landing rule and the refuse-not-extend rule exactly; `tools/test.mjs` "an immunity window expires and the next control lands" (line 621) and `checkbehaviour` "kit stun 'act' immunity window measured 4.000 s" both pass |
| F2 | mortar reads distance at the ORDER, direction at the strike — leads wrong | **fixed** | `prompt-rendered.txt:117,245-247` — direction AND distance both "read at the strike"; `tools/test.mjs:651-665` walks the caster during the wind-up and asserts the landing point is unmoved — passes |
| F3 | wall not raised on a bolt/mortar miss | **fixed** | `registry.js:651` (wall card) — "built whether or not the delivery carrying it connected"; `tools/test.mjs` "a wall is built even when the bolt carrying it misses" and "a caster shoots through its own wall and the enemy does not" both pass |
| F4 | `evaded` listed but unreachable on the grammar path | **fixed** | `prompt-rendered.txt:267-269,457-460` — "once for that ability on that step... not once per effect"; `effects.js:131-171` now emits it; test "a dodge is announced to the dodger, once for a two-effect ability" passes |
| F5 | control-only hit announces nothing to the caster | **fixed** | `prompt-rendered.txt:278-283,450-453` — `{type:'dealt', amount:0, landed}`; test "a hit that carries only a control still announces what landed" passes |
| F6 | an aim point is silently replaced by a later `faceAt` | **fixed** | `prompt-rendered.txt:240-243` — "a LOCK for the whole wind-up... ignored until the strike"; `sim.js:1111-1140` (`aimLock`); test "an aim point is not replaced by a later faceAt" passes |
| F7 | kit half of the prompt outside the `q()` number guarantee | **fixed** | `checkprompt.mjs` now traces four documents; live run: "blue/kits0 prompt (40816 chars, 175 emitted values)" and "blue/kits1 (41837 chars, 189)", both directions agreeing; `checkbehaviour` grew 40→67 claims, all new ones on the kit path (served wind-ups, cooldowns, field ticks/whole-disc, blink i-frames, knock/pull travel, immune window, heal floor/cap/share) |
| F8 | `V.lead`'s muzzle (0.3) didn't match the cards' `radius+0.3` | **fixed** | `prompt-rendered.txt:580-582` — "1.8 m ahead of your centre — your own radius plus the muzzle offset, the same figure the cards print"; independently recomputed: bolt reach 21.983 = 1.8 (muzzle) + 18.333 (flight) + 1.85 (touch), matches line 192 exactly |
| F9 | recovery not disclosed as slowed like the wind-up | **fixed** | every kit card: "for the whole act — the recovery is slowed as much as the wind-up" (e.g. line 115); repeated in HOW THE PIECES INTERACT line 220-222 |
| F10 | landing refusal wrongly called `airborne` | **fixed** | `prompt-rendered.txt:329-331` — "'airborne' while you are actually in the air, and... 'busy' during the crouch and the landing" |
| F11 | `p.self.kit` (declared) vs cards (served) discrepancy undisclosed | **fixed** | `prompt-rendered.txt:155-160,390-394` states the declared/served split and the one-step bound on both sides |
| F12 | memory limits & 64-order budget under-disclosed | **fixed** | `prompt-rendered.txt:530-535,547-552` — 48 keys, 32-char truncation, 4096-byte drop, and "not an exception to the count: each one spends an order" |
| F13 | knock/pull overstatement, wall not axis-aligned, burn-field total, bolt-vs-invuln, hop/leap vocabulary, no live enemy turnRate | **fixed** (all six sub-items) | "a shade under" language present (line 204); `registry.js:651` axis-aligned wording; whole-disc burn total at line 135 (29.4 hp); "consumes the shot" at line 189; only fixture-scoped `hop` remains outside the arena paragraph (checked: kit form says "leap" throughout, line 464 "your leap touched down"); "There is no p.enemy.turnRate either" at line 430 |

No new prompt-content finding. `checktactics.mjs`: 434/434 segments judged, 0 tactics (was 395/0 in
round 1 — the growth is the kit path now being judged too). `renderprompt.mjs` and `checkprompt.mjs`
both run clean; `checkdocs.mjs` green.

## Round-1 code findings — status

| # | round-1 finding | status | evidence |
|---|---|---|---|
| HIGH-1 | `sizebalance`/`kitbalance` measured bodies in a phantom 8 s-cooldown world | **fixed, reverified live** | `matchworker.mjs:147` `fixed = cooldown === undefined ? null : cooldown`; `sizebalance.mjs`/`kitbalance.mjs` jobs carry explicit `cooldown: null`; ran `node tools/sizebalance.mjs --rounds=20` myself: worst deviation **10.3 pp** against the 12 pp gate, exit 0 |
| HIGH-2 | a field's control atom spammed `immune` refusals on its own later ticks | **fixed, reverified** | `compile.js` no longer divides control durations by the zone share; `deliver.js` `tickZones` applies a control once per cast; `tools/test.mjs` "a field lands its control once per cast, at its whole duration" passes with **0** immune log lines from the cast's own ticks |
| MEDIUM-1 | `absorbed` never attached on a hit that went through (not fully absorbed by) a shield | **fixed** | `sim.js` hoisted `let struck` above the block; test "a hit that broke the shield carries what the shield took" asserts `amount:12, absorbed:12` and passes |
| MEDIUM-2 | ~250 lines of dead code / stale comments describing the pre-07.09 world | **mostly fixed; one new instance found** — see New Finding 3 | `COOLDOWN_PER_POINT`/`cooldownPoints()` deleted (`compile.js`); the ×1.25 vs 1.4 comment fixed (`registry.js:151`); shield-duration comment fixed to 2.5 s with a historical note (`deliver.js:455-456`); `immuneList` doc fixed (`sim.js:597-604`); duplicate `by: srcId` key gone (`effects.js`); `DELIVERY_LINE`/`EFFECT_LINE` deleted from `prompt.js`; matchworker/matchpool/atombalance "8 s" and "cost-derived" prose fixed |
| MEDIUM-3 | kit half of the prompt bypassed the traced emitter | **fixed** | same evidence as F7 above |
| MEDIUM-4 | pilot panel encoded pre-07.09 magnitudes instead of reading `p.self.kit[...].magnitudes` | **fixed** | `brains/pilots/{rusher,kiter,controller}.js` all read `k.magnitudes[id].mag/.duration/.immune` live (grepped and read); `controller.js`/`kiter.js` both call `api.use(best.name, {x,z})` with a lead for point-aimed abilities |
| LOW-1 | literals at beam-muzzle/margin call sites instead of named constants | **fixed** | `deliver.js:219,297,576` and `sim.js:1350` all read `BEAM_MUZZLE`/`PROJECTILE_MUZZLE`/`PROJECTILE_TOUCH` from `config.js` |
| LOW-2 | a stunned/shoved lunge kept travelling | **fixed** | `sim.js` `dashStepGeneric` now calls `endDash` on a stun or a knockback rise (mech-handoff rule 10); test "a stun ends a lunge where it stands" passes |
| LOW-3 | fixture skills (blink 3.9 s, charge 4.0 s) violated the ≤3 s rule the founder set | **fixed** | `checkbehaviour` measures blink/charge/laser/smash all ≤ 3.0 s; `test.mjs` "every reference-fixture cooldown is three seconds or less" passes |
| LOW-4 | no gate enforced the ≤3 s rule itself; no partial-absorb test; determinism untested on kits+pilots | **fixed** | `test.mjs` now asserts `DELIVERIES[*].cooldown ≤ 3` and `SKILLS[*].cooldown ≤ 3` directly (not just via `checkbehaviour`'s measurement), plus the partial-absorb test and a kits+pilots determinism pair |
| LOW-5 | `reachOf` in `bakeoff.mjs`/`spectate.mjs` under-counted true reach | **fixed** | `spectate.mjs:197-206` now matches the prompt's own reach formula term for term (muzzle, margin, touch) |

## New findings (round 2)

### N1 — MEDIUM/HIGH — `checkladder` is red right now, and `docs/COMBAT.md` states the opposite as fact
`node tools/checkladder.mjs` exits **1** on this tree: "✗ сторон, не применивших ничего 1 из 400"
(1 dead side of 400, over the newest 200 summarised ladder/training matches at the live constants
version `c-0c03af0b`). `docs/COMBAT.md:461` records, as evidence for round-1's fix, `` checkladder
(pace from stored summaries: 0 dead sides of 400) ``. Traced the dead side by querying
`data/airena.db` read-only: match `m_5f54af0a-20c` (10:12 UTC today), **SHAFT-50** (`c_19ff07a7-841`,
library, `kit_active:0`, correctly tagged `reference_tag:'gorilla'` by the round-1 fix) vs **ASH**
(`c_6ae13905-d20`, grammar kit beam+bolt+lob). SHAFT-50 made 522 `ready`/`faceAt`/`moveTo` calls and
zero `use` calls, took 244.9 damage and died. Its 19 other recent matches against the same opponent
cast fine (5–24 casts each) — this is an intermittent (~1-in-20 against this matchup) case of the
same failure family arena-handoff tracked as `KNOWN_MUTE` for SPIRE-08/LINE-17, except SHAFT-50 was
never added to that list and its cause was never diagnosed. **Fix:** diagnose SHAFT-50's `think()`
(smash/charge range-and-corridor conditions) against ASH's kiting pattern, or add it to
`tools/checkfixtures.mjs`'s `KNOWN_MUTE` with the measurement while it is investigated, and correct
`docs/COMBAT.md:461`'s claim in the meantime — it currently overstates a real, closed-loop gate.

### N2 — MEDIUM — `tools/suite.mjs` silently excludes four documented, currently-green gates
The suite's own docstring says "Every gate, in order" (line 3), but its `GATES` array (lines 68-80)
never runs `checkkits`, `checktactics`, `checkstale`, or `checkdescribe` — all four exist, are
documented in `README.md`'s tool roll-call, and all pass standalone (`checkkits`: 78/78 legal;
`checktactics`: 434/434 judged, 0 tactics; `checkstale`: green; `checkdescribe`: "всё сходится").
The task brief for this review specifically checks that `checkdescribe` is registered — it is not.
None of the fix-r1 handoffs mentions adding it to the suite, and nothing explains the other three
absences (`checktactics` costing money to run is a plausible reason; `checkkits` and `checkstale`
are free local checks with no stated reason to be left out). **Consequence:** a regression in kit
legality, tactics, staleness or the HUD-sentence mirror would not be caught by `node tools/suite.mjs`
even though the check that would catch it exists and is green today. **Fix:** add the four to
`GATES`, or state in the docstring which gates are deliberately excluded from the automated wall
and why.

### N3 — LOW/MEDIUM — the leap's price is documented as 5 in two places, contradicting the shipped 8
`src/skills/registry.js:292` sets `jump: { ..., cost: 8, ... }` (confirmed against
`reports/combat/atombalance-panel-v9.json`: `{"id":"jump","currentCost":8,...}`), and
`docs/COMBAT.md:240`'s own magnitude table agrees ("leap 8"). But the long rationale comment directly
above the `jump` entry (`registry.js:267,277,284`: "ЦЕНА 5 — И ЕЁ ОБОСНОВАНИЕ...", "Цена 5 остаётся,
и вот на чём она стоит теперь", "пять очков платят именно за него") and `docs/COMBAT.md:161`'s prose
("the leap, price 5") both still say 5. This is the `hop-revert-handoff`'s own edit (it set the price
rationale for cost 5 the day the free hop was reverted); a later balance pass (v6–v9, D200/D202) then
repriced the leap to 8 and updated the magnitude table but not this rationale comment or §2's prose —
an instance of exactly the "dead code that reads as live" pattern round 1 flagged (MEDIUM-2), newly
reintroduced by the interaction between two lanes. It is not mind-facing (a kit card never prints a
skill's point cost) so `checkprompt`/`checkdocs` do not catch it. **Fix:** rewrite the three comment
lines and `docs/COMBAT.md:161` to say 8 and to point at the v9 pass, the way the shield-duration and
`immuneList` comments already model doing when a number moves out from under a paragraph.

## Gate results (this run)

| gate | result |
|---|---|
| `node reports/combat/renderprompt.mjs` | wrote both renders, 40816 / 40818 chars |
| `node tools/checkprompt.mjs` | green — 4 documents traced both ways, 434/434 segments, 0 tactics |
| `node tools/checkbehaviour.mjs` | green — 67 claims measured |
| `node tools/checktactics.mjs` | green — 434/434, 0 tactics |
| `node tools/test.mjs` | green — 70 passed, 0 failed |
| `node tools/checkisolate.mjs` | green — 25 attacks stopped, honest brain admitted |
| `node tools/checkfixtures.mjs` | green — 32/32 cast on both colours, 2 seeds |
| `node tools/checkladder.mjs` | **red, exit 1** — see N1 |
| `node tools/checkprices.mjs` | green (exit 0) — sd 1.11 ≤ 1.2 ratchet, 0 pieces above the floor significantly negative; the pass itself still reads NOT CONVERGED (knock/weaken negative at the floor) — a known, documented open balance item (D200/D202), not a code defect |
| `node tools/checkgrammar.mjs` | green |
| `node tools/checkdocs.mjs` | green |
| `node tools/checkkits.mjs` | green — 78/78 legal (run manually; not in `suite.mjs`, see N2) |
| `node tools/sizebalance.mjs --rounds=20` | green — worst deviation 10.3 pp < 12 pp |
| determinism probe (rusher vs kiter, seed 777, kits, two separate `node` processes) | identical, sha `1bdd2de3b6a2a0a8`, 700 bytes each |
| grep for stale pre-07.09 comments (`COOLDOWN_PER_POINT`, hop/universal, "8 s" measuring path, "three verbs") | all remaining hits are either the fixture's own unchanged vocabulary or explanatory "this used to say X" notes — clean, except N3 |

## Three most important open items

1. **`checkladder` fails right now** (1 dead side of 400, SHAFT-50 vs ASH) and `docs/COMBAT.md:461`
   claims it holds at 0 — diagnose or quarantine SHAFT-50 and correct the doc (N1).
2. **`tools/suite.mjs` doesn't run `checkkits`, `checktactics`, `checkstale` or `checkdescribe`** —
   the "run everything" wall has four blind spots for gates that already exist and already pass (N2).
3. **The leap's price reads 5 in its own rationale comment and in `docs/COMBAT.md` §2**, while the
   code and the magnitude table both say 8 — a small, contained, but genuine lying comment (N3).
