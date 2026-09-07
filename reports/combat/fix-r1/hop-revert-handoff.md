# The free `hop` is gone — D160 holds again (07.09.2026)

Lane: revert of one feature only. Earlier today a fixer appended a free,
universal fourth verb `hop` to every compiled grammar kit (its own comments
called it "D195"). That contradicts the founder's requirement recorded in
`docs/DECISIONS.md` **D160** — *every creature has exactly three skills; the
jump only if the creature itself chose it as one of them*. D160 holds. The hop
is removed from the sim, the grammar, the prompt, the gates and the docs.
`DESIGN.md` **D195** already records the reversal and the replacement dodge
metric (leap/blink dodges **and** side-steps; a kit without a leap or a blink
is not a defect). Nothing else from today was touched.

Not touched, on purpose: `src/viewer/**` and `src/skills/describe.js` (another
lane owns them — both were already clean by the time this ran), `brains/pilots/*`,
and the `universal` filters in `tools/atombalance.mjs`, `tools/bakeoff.mjs`,
`tools/matchworker.mjs`, `reports/combat/spectate.mjs` (harmless when no such
slot exists; only their prose was corrected). No prices and no magnitudes moved.

---

## 1. Files and lines changed

### The behaviour

| file | line (after) | what |
|---|---|---|
| `src/skills/compile.js` | 66 | `compileSkill(skill, id, { fixedCooldown })` — the `universal` option is gone, and `validateSkill` is unconditional again |
| `src/skills/compile.js` | 71 | `const cost = costOf(skill)` — no `universal ? 0 : …` |
| `src/skills/compile.js` | ~76 | the `...(universal ? { universal: true, name: HOP_NAME } : {})` spread removed from the compiled def |
| `src/skills/compile.js` | 316 | the whole `── THE UNIVERSAL HOP (D195) ──` block and the `if (Object.keys(defs).length) { … defs[HOP_ID] = hop.def }` append replaced by a short D160 note. `compileKit` returns exactly the stored abilities |
| `src/skills/compile.js` | (deleted) | exports `HOP_ID`, `HOP_NAME`, `HOP_SKILL` |
| `src/skills/compile.js` | 334 | `readable()` — the `if (def.name) return def.name` special case removed; back to `delivery: effects` for every ability |
| `src/core/sim.js` | 513 | `kitView` — the `...(d.universal ? { universal: true, cost: 0 } : {})` entry and its D195 comment removed. No kit entry carries `universal` or `cost` any more |
| `src/skills/registry.js` | 284 | the leap's price rationale no longer rests on "everyone has a free hop"; the five points are what a dodge costs |
| `src/skills/registry.js` | ~866 (deleted) | `validateSkill`'s rejection of a stored ability named `hop` (`code: 'name_hop'`) and its comment. No price or magnitude was touched — `constantsVersion()` is unchanged (`c-abd0b479`) |

`src/core/sim.js`'s `namesOf` docstring needed no edit: it still says D160 —
a kitted creature has exactly three verbs — which is true again.

### The prompt

Every change below is in the **kit** half. The reference-fixture prompt keeps
its historical vocabulary (its hardcoded skill really is `kind: 'hop'`).

| line (after) | what |
|---|---|
| 548 | `KIT_IS_NOT_YOURS`: "the three your creature bought, **plus hop**" → "…, **and there is no fourth**" (paragraph re-wrapped) |
| 786 | `kitBlocks`: the `slot — universal …` card line and its D195 comment removed |
| 901 | "an aura, a leap, **hop**" → "an aura, a leap" |
| 979 | "A hop and a leap are the same shape…" → "A leap is one shape in three parts…" |
| 1028 | `.kit` field list: no "and hop, the verb every fighter has for free", and `universal, cost` dropped from the entry shape |
| 1050 | enemy `.kit`: "for their three and their hop" → "for their three" |
| 1099 | `.busy`: "the crouch and the landing of a **hop or a leap**" → "…of a **jump**" (this paragraph is shared by both prompt forms, so it takes the neutral word) |
| 1189 | kit events: `{ type:'landed' }` "your hop or leap touched down" → "your leap touched down" |
| 1151 | **unchanged** — the fixture's own event list still reads "your hop finished", exactly as before today |
| 242, 340–351 | **unchanged** — pre-existing fixture text (arena "nothing but a hop", the body block's "hop height"). `canHop` now correctly hides the "hop height" line from a kit that did not buy a leap |

Rendered prompts regenerated: `node reports/combat/renderprompt.mjs` →
`reports/combat/prompt-rendered.txt` (40 102 chars) and
`prompt-rendered-orange.txt` (40 104). The only `hop` left in either is the
arena paragraph.

### The gates

| file | line | what |
|---|---|---|
| `tools/test.mjs` | 799–823 | the three hop invariants replaced by the **D160 gate**: (a) a compiled kit is exactly the abilities bought — `names.length === kit.length`, names `k1..k3`; (b) no entry of `p.self.kit` carries `universal` or `cost`, and `cooldowns` has the same three keys; (c) a verb the creature did not buy (`api.use('hop')`) is refused as `unknown` and never runs. **Still 70 invariants**, so README's "70 invariants" needs no change |
| `tools/checkbehaviour.mjs` | 54 | header: "the free hop's three phases and cooldown" → "the leap's three phases" |
| `tools/checkbehaviour.mjs` | 395–403 | the fixture-jump block's local variable renamed `hop` → `j` (it measures `skills.jump.*`; the name was the only `hop` left in the file) |
| `tools/checkbehaviour.mjs` | 709 | set comment: "плюс прыжок и hop" → "включая купленный прыжок" |
| `tools/checkbehaviour.mjs` | ~757 (deleted) | the four `kit.own.hop.*` timing claims. Claim count **68 → 64**; README prints no count for this gate, only prose (fixed, see below) |
| `tools/checkprompt.mjs` | 152–158, 369 | `body.<side>.jumpHeight` is now required only from a side whose kit carries a `jump` delivery — the same `canHop` test the prompt uses. Without this the gate failed with `body.own.jumpHeight = 2 is never emitted` for the (correct) kits that bought no leap. No `kit.*.hop.*` whitelist existed |

### The prose

| file | line | what |
|---|---|---|
| `docs/COMBAT.md` | 159–169 | §2 rule 11 rewritten: **a creature has exactly three abilities**; a leap is a bought delivery (price 5); every kit can side-step; the pace metric counts leap/blink dodges **and** side-steps; a kit with neither leap nor blink is not a defect |
| `docs/COMBAT.md` | 333 | §6.1 card order: the "universal marker if the verb is `hop`" line dropped |
| `docs/COMBAT.md` | 366 | §6.2: "the free hop's phases" → "the leap's phases" |
| `docs/COMBAT.md` | 393–395 | §6.3 vocabulary: only **leap** survives; the fixture's hardcoded jump is the one thing still called a hop |
| `README.md` | 145 | the `checkbehaviour` row: "the free hop's phases" → "the leap's phases" |
| `tools/matchworker.mjs` | 179, 213 | comments no longer claim a free universal slot exists; the `d.universal !== true` filter is kept as a guard |
| `tools/bakeoff.mjs` | 464, 1092 | comment + report prose: "including the free universal hop" / "(aura, blink, leap, the free hop)" → without it |
| `tools/atombalance.mjs` | 856 | report prose: "the free universal verb is not counted" → "a kit is three abilities and all three are paid" |
| `reports/combat/spectate.mjs` | 195 | the same `reachOf` comment (comment only — the file's dodge metric already counts side-steps and was not touched) |

---

## 2. Every `hop` / `universal` that remains, and why

`grep -rn "hop\b\|universal\|HOP_" src/core src/skills src/brain tools/*.mjs docs/COMBAT.md`

**Pre-existing fixture vocabulary — identical to git HEAD, do not change:**

- `src/core/config.js:1150` — `jump: { kind: 'hop' }`. The reference fixture's
  hardcoded jump. Six brains in `brains/` are written against it.
- `src/core/config.js:1119` — "The gorilla's hop keeps its take-off velocity".
- `src/core/geom.js:3`, `src/core/sim.js:60, 1190, 2120, 2131` — comments about
  that same fixture jump (all byte-identical to HEAD).
- `src/brain/prompt.js:242` (arena: "nothing but a hop ever leaves the ground"),
  `:340–351` (`canHop` and the body block's "hop height" line),
  `:1151` (fixture events: "your hop finished").
- `src/brain/host.js:67` ("a message hop"), `src/client/screens/live.js` ("one-hop
  repair"), `src/server/forge/pipeline.js:751` (a word-match regex) — unrelated
  English.

**New, and correct:**

- `src/core/sim.js:1129` — `s.kind === 'jump' || s.kind === 'hop'` in `aimMode`.
  This is today's fix 3b (an aim point on an `aim: 'none'` shape turns nothing);
  the `'hop'` arm is the **fixture's** skill kind, and removing it would make an
  aim point swing the fixture's body during a jump. Its comment says "an aura or
  a leap" and never mentions a free verb.
- `tools/checkprompt.mjs:158, 366` — the reason `jumpHeight` is conditional.
- `tools/test.mjs:799–821` — the D160 gate names `hop` as the verb that must be
  refused, which is the point of the gate.
- `tools/matchworker.mjs:214`, and the `universal` filters left in
  `atombalance.mjs` / `bakeoff.mjs` — inert guards over a field nothing sets.
- `src/skills/compile.js:320`, `docs/COMBAT.md:162–164, 395` — one sentence each
  recording that the free verb existed for a day and was reverted, so the next
  reader does not re-add it. `DESIGN.md` D195 says the same.
- `tools/tactics-verdicts.json:3324` — a cached judge verdict for the deleted hop
  card. A stale cache row costs nothing and re-judging is billable; left as is.
- `tools/checkscope.mjs:138, 153` — the grep matches `shop` inside a regex.

Nothing in `src/viewer/**`, `src/client/**` or `src/skills/describe.js` mentions
`hop` or `universal` any more: the other lane had already cleaned them, and
`node tools/checkdescribe.mjs` is green (no dangling `HOP_SKILL`/`HOP_NAME`
import survives).

---

## 3. Gates

| gate | result |
|---|---|
| `node tools/test.mjs` | **70 passed, 0 failed** |
| `node tools/checkprompt.mjs` | **green** — prompt and config agree in both directions, fixture and kit; "a kit creature is told about its own three verbs and no others"; 426/426 segments judged, tactics 0 |
| `node tools/checkbehaviour.mjs` | **green** — 64 claims measured (was 68; the four hop timings are gone) |
| `node tools/checkdocs.mjs` | **green** — README and the repository agree |
| `node tools/checkgrammar.mjs` | **green** (ДЕРЖИТ) |
| `node tools/checkkits.mjs` | **green** — 78 stored kits legal, 0 illegal |
| `node tools/checkisolate.mjs` | **green** — 25 attacks stopped |
| `node tools/checkspec.mjs` | **green** (ДЕРЖИТ) |
| `node tools/checkfixtures.mjs` | **green** — 30 of 32 cast on both sides across both seeds |
| `node tools/checkladder.mjs` | **exit 1 — pre-existing, not this change** (below) |

Also run, unasked, because they touch the same files: `checkdescribe` green,
`checkscope` green, `checkstale` green. `checkprices` fails on two assertions
about `reports/combat/atombalance-panel-v5.json` (value-per-point spread and
negative pieces) — that is D197's known non-convergence, bound to a stored
pricing pass, and no price was touched here.

### Why `checkladder` is not this change

Its ladder arithmetic passes (`node tools/checkladder.mjs --no-db` → **ДЕРЖИТ**).
The single failure is in `paceFromDb()`, a section added earlier today that reads
**recorded** matches out of `data/airena.db`:

```
✓ применений на бойца на 10 с   медиана 6.44, порог 5
✗ сторон, не применивших ничего  6 из 400
```

Those 400 sides come from 200 stored `match` rows (`constants_version`
`c-abd0b479`, unchanged by this revert — the query still matches all 200), and
no source file this change touched is imported by `checkladder.mjs` (it imports
only `node:sqlite`, `node:fs/path/url`, `src/core/version.js` and
`src/server/ladder.js`). None of the 200 stored summaries mentions `hop` at all.
The gate itself points at `checkfixtures`, which is green and names the two
fixture-brained sides that never cast — a fixture-brain issue, not a kit one.

---

## 4. Spectate — the ladder six without the hop

The ids in the request were not the ladder six; `reports/combat/review-r1-pace.md`
§0 points at `reports/combat/review-pace.md`, whose roster is **ARRESTER
`c_08afabcb-3de`, STONE GOLEM·303e `c_303e3387-581`, THE RIFT `c_c4eb7da3-a72`,
STONE GOLEM·18e2 `c_18e20e72-6bb`, ICEBREAKER `c_3fdf18d5-48c`, STORM
`c_f7ddf8fc-1df`** — the same six `spectator-v5-prices.md` and
`spectator-v6-mechanics.md` use. That roster was run, as instructed:

```
node reports/combat/spectate.mjs \
  --ids c_08afabcb-3de,c_303e3387-581,c_c4eb7da3-a72,c_18e20e72-6bb,c_3fdf18d5-48c,c_f7ddf8fc-1df \
  --pairs 12 --seeds 1,2,3 --out reports/combat/spectator-v6b-nohop.md
```

36 matches, 12 matchups, seeds 1/2/3.

| metric | value | §3 target |
|---|---|---|
| **median fight length** | **16.2 s** (mean 17.6, range 9.3–37.1) | 20–35 s ✗ |
| **casts per fighter per 10 s** | **8.26** (14.3 per match; cooldown utilisation 65%) | ≥ 6 ✓ |
| **hit rate** (targeted + zone) | **88%** — 608 hit of 690 judged, 14 of them absorbed whole by a shield; 55 miss (range 13, cover 22, aim 20), 27 empty zones | 55–80% ✗ |
| **dodges** | **13 total = 0 airborne + 2 i-frame + 11 side-step**, **0.36 per match** | ≥ 1 ✗ |
| **burn share** | **3 of 36 matches (8%)** reach the burn; 1% of all ticks under it; 3 fighters killed by the arena, 0 by fire | ≤ 35% ✓ |

Supporting figures: 34 kills + 2 double-KOs, decided by hit 31 / arena 3;
dead slots 7 of 216; no-act 59%; both-fully-on-cooldown 16%; 0 brain faults,
0 refused orders.

Reading it: the dodge count is now **0.36 per match and not 0.00**, and every
one of those dodges is something a kit already owned — two through blink
i-frames, eleven by stepping across a shot. The `≥ 1 per fight` target is still
missed, and that is a mind-quality and kit-composition finding to answer inside
D160 (buy a leap, buy a blink, move across the line), not a reason to hand every
body a free verb. Length, hit rate and the dodge target were all already failing
in `review-r1-pace.md` before the hop existed; the hop was never measured against
a price, so nothing in this table is a regression it caused.

Full report: `reports/combat/spectator-v6b-nohop.md`.
