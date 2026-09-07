# Gates change-impact checklist — combat & balance overhaul (07.09)

Audit of every gate in `tools/suite.mjs` (and the off-suite tools that read the
same numbers) against six kinds of change:

- **(a)** EFFECTS / DELIVERIES / CHANNELS costs change
- **(b)** cooldown stops being cost-derived, becomes per-delivery
- **(c)** magnitudes / durations change (`mag`, `duration`, `range`, `splash`, zone share …)
- **(d)** prompt text changes (`src/brain/prompt.js`)
- **(e)** `api.use` gains an `{x, z}` aim form
- **(f)** `SKILL_BUDGET` / `KIT_BUDGET` change

Everything below was read from the tree on 07.09; line numbers are from that
tree. Nothing outside `reports/combat/` was edited by this audit.

---

## 0. State of the tree at audit time

`git status` (07.09, during milestone 1): modified `DESIGN.md`, `.gitignore`,
`src/core/deliver.js`, `src/core/effects.js`, `src/core/sim.js`,
`src/skills/compile.js`, `src/skills/registry.js`; untracked `AGENTS.md`,
`CLAUDE.md`, `reports/combat/`. The lead is already mid-way through (b) and (e):

- `src/skills/registry.js:112-265` — every delivery now carries `cooldown:`
  (beam 3.0, cone 1.8, bolt 2.2, lob 2.6, zone 3.0, dash 3.0, blink 3.0,
  self 3.0, jump 2.4). Costs unchanged (deliveries 3–5, effects 3–7, channels 2–4).
- `src/skills/compile.js:149-151` — `cooldown = max(COOLDOWN_MIN, d.cooldown ?? cooldownPoints(...) * COOLDOWN_PER_POINT)`;
  `COOLDOWN_PER_POINT`, `COOLDOWN_MIN`, `cooldownPoints()` and `fixedCooldown`
  still exist (fallback path, instruments).
- `src/core/sim.js`, `deliver.js`, `effects.js` (uncommitted) — `act.at` aim
  point for lob/zone/blink (`aimDir`), zone and wall replace the caster's
  previous one, `atom.immune` CC-immunity window, knock/pull interrupt casts.

Gates I ran on that tree (single-process only, no worker pool, no server):
`test` 34/34, `checkgrammar`, `checkprices`, `checkspec`, `checkkits`,
`checkprompt` (incl. `checktactics` + `checkdocs`), `checkbehaviour` (40 claims),
`checkvfx`, `checkisolate` — all green.

**Side effect to know about:** `checkprompt` → `checktactics` found 4 kit-prompt
segments whose text changed (the `cooldown … s` lines of the fixed kits now print
the per-delivery numbers), judged them with `sonnet/high` ($0.114) and appended
them to `tools/tactics-verdicts.json` (+24 lines, file now shows as modified).
That is the gate's documented behaviour; keep the file, commit it with the
overhaul. Expect the same on every cooldown/magnitude retune.

**Late addendum (same session):** `tools/test.mjs` grew from 34 to **42**
invariants on disk (+113 lines: mortar/field aimed at a point, field never
beyond range, stun refused inside the immunity window, perception names
`enemy.immune`, stun cancels a wind-up, one field / one wall per ability).
README binds "34 invariants" in two sentences (`checkdocs` claims
`the invariant count`), so `node tools/checkdocs.mjs` — and with it
`checkprompt` — is red until README says 42. The new `immune` perception array
is not yet in the prompt's §5 field list (`prompt.js:772-870`); `test.mjs`'s
"perception carries every field the prompt documents" is superset-safe, but the
rule of the prompt file ("a model cannot read what it has not been told exists")
and `checktactics` apply once it is written.

Stored-kit cooldowns before the lead's edit (cost-derived): min 6.3 s, median
9.9 s, mean 9.68 s, max 13.95 s across 234 abilities. After: min 1.8, median 3.0,
mean 2.65, max 3.0.

---

## 1. Suite map

`tools/suite.mjs` runs 33 gates in this order (`npm test`):

```
test · checkprompt · checkdocs · checkbehaviour · checkframing --dump · checkcamera --trail ·
checkcontrast · checkgrammar · checkprices · checkladder · checkvfx · checkdecay · checkgauntlet ·
checkcadence · sizebalance --rounds=20 · checkstages · checkspec · checkboot · checkisolate ·
checkidentity · checkimage · checkbody · checkbodyrace · checkfaults · checkfacade · checkforge ·
checkmodels · checkpose · checkselectors · checkscreens · checkscope · loadtest ·
falsify --controls --tags=u1,u2,u3,u4,u5,u6
```

Not in the suite but part of the change surface: `checkkits` (stored kits vs
prices), `checkstale` (informational, no exit code), `checktactics` and
`checkdocs` (run from inside `checkprompt`; `checkdocs` also has its own line),
`kitbalance`, `gauntletfield`, `gauntletpick` (the instruments that produced the
numbers the gates pin).

Sensitivity matrix (● breaks or must be updated · ○ re-verify / may drift · – untouched):

| gate | reads | (a) costs | (b) cooldown | (c) magnitudes | (d) prompt | (e) aim form | (f) budgets |
|---|---|---|---|---|---|---|---|
| test | compile, sim, config.SKILLS | ○ fixture kit | – | ● lob invariants | – | ● lob `api.use('k1', n)` | ○ |
| checkprompt | prompt (traced), SKILLS, compile | ○ fixture kits | ○ | ○ | ● | ● (verbs text) | ○ |
| checktactics (via checkprompt) | prompt text × 8 docs, claude | ○ | ● re-judge | ● re-judge | ● re-judge | ● re-judge | – |
| checkdocs (via checkprompt + own) | README, config, test.mjs, tools/ | – | – | ○ | – | – | – |
| checkbehaviour | prompt trace, sim, compile | ○ fixture kits | ● (hardcoded SKILLS only if touched) | ● reach lines | ● regex-parsed lines | ○ | ○ |
| checkframing / checkcamera | sim + brains trail | – | ○ | ○ | – | – | – |
| checkgrammar | registry, compile, sim, pipeline | ● | ○ | ○ | – | – | ● |
| checkprices | registry comment table | ● | – | – | – | – | – |
| checkladder | ladder.js only | – | – | – | – | – | – |
| checkvfx | registry, compile, sim, viewer | ● hostile kit 48/52 | ○ peak particles | ○ | – | – | ● |
| checkdecay | ELEMENTS, viewer vfx | – | – | ○ fixture durations | – | – | – |
| checkgauntlet | gauntlet.js, viability, presets | ● | ● | ● | – | ○ | ● |
| checkcadence | arena-loop, live, ladder | – | – | – | – | – | – |
| sizebalance | config BUILD_AXES, kit-stub pilot | ○ | ● | ● | – | – | – |
| checkspec | SPEC.md vs registry | ● | – | – | – | – | ○ readings |
| checkisolate | sandbox, compile | ○ fixture kit | ○ | ○ | – | – | ○ |
| checkforge | pipeline prompt, registry | – | – | – | – | – | – (ids only) |
| checkscope | bundle + server string literals | ○ new strings | – | – | – | – | ○ new strings |
| falsify --controls | sim, brains u1..u6 (hardcoded SKILLS) | – | – | – | – | – | – |
| checkkits (off-suite) | db creature.kit_json | ● | – | – | – | – | ● |
| checkstale (off-suite, no exit code) | brains/*.json vs SKILLS/BUILD_AXES | – | ● if SKILLS touched | – | – | – | – |
| others (contrast, stages, boot, identity, image, body, bodyrace, faults, facade, models, pose, selectors, screens, loadtest) | UI / infra | – | – | – | – | – | – |

---

## 2. Gate by gate

### 2.1 `tools/test.mjs` — 34 invariants (`node tools/test.mjs`)

Groups: arena (4), simulation (17), sandbox (10), wire (3). README binds the
count "34" twice (`checkdocs` claims `the invariant count`), so adding or
removing an `ok(` in this file requires editing README in two places.

Invariants that touch cooldown / cost / skills:

- `test.mjs:137-155` "a charge actually dashes" / "the dash reports its true speed" — hardcoded `SKILLS.charge.dashSpeed` (config.js:933 block). Untouched unless the §1 fixture skills change.
- `test.mjs:189-199` sudden death: `burnRate(SUDDEN_DEATH_AT ± …)`, "two fighters who do nothing are still killed", "well before the backstop clock" (`< 62 s`). Sensitive to `SUDDEN_DEATH_AT` (config.js:164, 30) / `SUDDEN_DEATH_RAMP` (0.015) if the new pace moves them.
- `test.mjs:203-219` blink landing — hardcoded `blink`.
- `test.mjs:239-317` the four lob invariants compile `[lob:damage, self:heal, bolt:damage]` (cost 31/52) and use the **numeric** aim form `api.use('k1', ask)`:
  - `shot(5, 12)` expects `damage 0, misses 1, no impact` → needs lob `range ≥ 12` and `splash + target radius < 7`.
  - `shot(5, null)` expects `aim ≈ 5` (default lands at enemy distance) and damage > 0.
  - impact point equals `fx.x1/z1`.
  - `shot(6, 15, ARENA_HALF-4)` clamps inside the arena.
  → (c): re-check if lob `range`/`splash` move. (e): keep the lone-number form working, or rewrite these four to the `{x,z}` form. The lead's in-progress `act.at` path coexists with `act.reach` (sim.js:843-960), so the numeric form still works today.
- `test.mjs:353-363` perception fields include `cooldowns`, `skills` — superset-safe; new fields (e.g. `immune`) do not fail it, but must be documented in the prompt (§5) or `checkbehaviour`'s kit-field check fails — see 2.4.

What does NOT live here: no test pins a derived cooldown value, so (b) alone
is invisible to `test.mjs`.

### 2.2 `tools/checkprompt.mjs` (+ `checktactics` + `checkdocs`)

Asserts, for `brainPrompt('blue'|'orange')` **without a kit** (the §1 fixture):

- config→text: emitted labels == whitelist `expected()` (`checkprompt.mjs:165-250`): body fields ×2 sides, `SKILL_FIELDS` for the 5 hardcoded skills incl. `cooldown` (served through `servedCountdown`), derived reach/half-angle numbers, obstacles, arena, tick/think, sudden death, fuel, limits.
- text→config: every numeral outside a `q()` bracket is a failure unless in `PROSE_NUMERALS` (`checkprompt.mjs:253-260`: rule numbers, `^2`, `Math.atan2`, `capped at 60`, bare `0`/`1`).
- `checkprompt.mjs:297-340` kit prompt (two fixed kits: `[jump:shield, beam:damage, zone:burn]` 33/52 and `[cone:damage+knock, bolt:burn, self:heal]` 38/52): the `skills` line names `k1..k3` and none of `laser|blink|smash|charge|jump`; each `\n${k}\n` block exists.
- then `checkTactics()` and `checkDocs()` failures are merged in.

Impact:
- (b)/(c) on the **grammar** do not touch the whitelist: kit blocks are rendered with `n()` not `q()` (`prompt.js:711-750`), so they are neither traced nor swept. The whitelist only cares about `SKILLS` (config.js:833-1060). If the overhaul also retunes the hardcoded five (laser 2.2 s, blink 3.9 s, smash 1.3 s, charge 4.0 s, jump 2.8 s cooldowns), the prompt updates itself and `checkprompt` stays green — but `constantsVersion` changes and `checkstale` flags every population (see §5).
- (d): any typed numeral in new prose fails the sweep; emit through `q(label, value)` and add the label to `expected()`, or add a narrowly-scoped `PROSE_NUMERALS` entry with a reason. New kit-block sentences are free of the sweep but not of `checktactics`.
- (e): `verbs()` (`prompt.js:893-960`) documents `api.use(name, a, b)` with the lob clause inserted only when the kit has a lob (`withLob`). The `{x,z}` form must be documented there as a capability (category 1). The clause is conditional so the no-kit prompt stays byte-identical (`tools/bracket.mjs` hashes it; `falsify.population()` groups by `promptHash`).
- `checkprompt.mjs:297` fixture kits must stay legal under new prices/budget (headroom 19 and 14 today).

### 2.3 `tools/checktactics.mjs` (runs inside `checkprompt`; `node tools/checktactics.mjs --show`)

- Segments 8 documents: the two no-kit prompts and three fixed kits × two sides
  (`checktactics.mjs:330-352`: `[cone:damage+knock, lob:burn, blink:cleanse]`,
  `[beam:damage, zone:weaken/speed, jump:shield]`, `[dash:stun, bolt:blind, self:heal]` — the third fails L2 in `validateKit` but `compileKit` only propagates `size|kit_budget|kit_dup`, so it compiles).
- Proves coverage (segments reconstruct the text), judges every unseen segment with `sonnet/high` (`AIRENA_JUDGE_MODEL/EFFORT`), 10 controls per batch, caches verdicts in `tools/tactics-verdicts.json` keyed by `sha256(RUBRIC_HASH + segment)`. Today: 319 segments, 0 tactics, rubric `a9a7dccdf1316489`.
- **Fails, does not skip**, if any segment is unjudged and `CLAUDE_BIN` (`AIRENA_CLAUDE_BIN` or `~/.local/bin/claude`, present on this machine) is missing, or the judge fails its controls.
- Every kit-block line carrying a number (`cooldown`, `cast`, `range`, `radius`, `splash`, `lasts`, `reach`, `effect … — mag, duration s`) is a segment. (b)/(c) therefore re-judge those lines on every retune (observed: 4 segments, $0.114). (d)/(e) re-judge whatever paragraph changed. Budget ~$0.03–0.06 per batch; whole prompt ≈ $0.15.
- `ACCEPTED = {}` (`checktactics.mjs:456`) is the only escape hatch; keep it empty.

### 2.4 `tools/checkbehaviour.mjs`

Measures on a controlled world and compares to the **prompt's own text**:

- Hardcoded five (`checkbehaviour.mjs:300-380`): reach (binary search), wind-up, cast+recovery, cooldown (`readyT - startT`, tolerance `ROUND = 0.0005`), damage, half-angles, dash distance, i-frames, stun. Labels come from `tracePrompt`, so these only move if `SKILLS` moves — then they must still agree with the served figures (they will, both read config).
- Kit reach (`checkbehaviour.mjs:395-470`): for `beam|cone|bolt|lob|zone|dash` compiles `[kind:damage, self:heal, blink:cleanse]` (29/52), parses the kit block's `reach` line with `/([\d.]+) m between the two centres/`, binary-searches the landing distance with tolerance `2e-3`, on equal and unequal bodies. → (c): any change to `range`, `splash`, `speed`, muzzle constants (0.2/0.4 beam, 0.3/0.35 bolt spelled out in `prompt.js:653-700` and `deliver.js`) must keep `reachLine()` arithmetic true. (d): rewording the reach sentence breaks the regex. (e): the probe fires `api.use(name)` with no argument; if a default aim changes (e.g. zone lands at aim point instead of enemy distance), the measured reach changes and the sentence must follow.
- Kit fields (`checkbehaviour.mjs:475-560`): the set of keys served by `kitView()` (sim.js:381-420, 17 today) must equal the set named in the §5 sentence `.kit … { … } and whichever of … its delivery` (`prompt.js:779-783`), parsed by regex. → any new perception field on a kit entry (e.g. `immune`, `aim`) requires editing that sentence.
- A fighter without a kit: `p.self.kit === null` and the no-kit prompt never says `.kit`.

### 2.5 `tools/checkgrammar.mjs`

1. prototype keys not in any axis table.
2. forged skills refused; `costOf` never NaN.
3. every legal skill under `SKILL_BUDGET` compiles to finite numbers (`cooldown` included) — enumerates all 9 × (14 + C(14,2) + C(14,3)) × channels.
4. **3b (`checkgrammar.mjs:165`)**: `want = { legal: 9243, maxCost: 32, at22: 2059, at24: 3488, three22: 322 }` reproduced by an honest enumeration (budget violations ignored, all other rules applied). The counters use literal `22`/`24` keys, not `SKILL_BUDGET`. → (a) and (f) **always** break this line; recompute with the same loop and update both the literal and the comment table at `registry.js:605-616` (`всего законных умений`, `самое дорогое`, the budget table with `← выбран`). If `SKILL_BUDGET` changes, the two literal keys must become the new budget and budget+2 (the reasoning "16 % three-effect at the chosen ceiling" needs re-deriving, not copying).
5. §4 world stays numeric after 18 matches — fill kits `[bolt:damage, self:heal, self:shield, lob:burn]` (each ≤ 12) must stay ≤ `SKILL_BUDGET`, and `compileKit([s, ...fill])` must stay ≤ `KIT_BUDGET`.
6. §5 perception has no `undefined` — kit `[self:wall, zone:damage, bolt:damage]` (31/52).
7. §6: palettes distinct (ΔE ≥ 10); every effect id has a `case '<id>'` in `src/viewer/vfx.js`; every effect has `vfx` words. → adding an effect needs a viewer case.
8. §7: every channel id appears as `channelMul(…'<id>'` in `sim.js|deliver.js|effects.js`. → removing/renaming the `cooldown` channel (CHANNELS 7) also hits `selfTest()` (`registry.js:851`, "7 channels"), `checkspec`, SPEC.md §8 line 679 and `history.js:274` MARK_WORD.
9. §8: `src/client/screens/create.js` holds no `KIT_PRESETS` copy.
10. §9: `3 × beam:damage+stun+blind` (84 points) must **fail** `compileKit` — if re-pricing ever brings 3 × 28 ≤ `KIT_BUDGET` this assertion flips; pick a heavier over-budget fixture if costs drop a lot.
11. §10 E1/unreleased: kit `[zone:pull+damage/gravity (17), self:boost/armor (10), cone:damage (11)]` must validate.

### 2.6 `tools/checkprices.mjs`

Parses `registry.js` comments: rows `^\s*\*\s{4,}([a-zа-яё]+)\s+(\d+)%` (the
14-row best-case table at `registry.js:314-327`, English names match because
of the `i` flag and `e.ru` is now English), the sentence `ранги отображены в
(\d+)…(\d+)` (must equal min/max of `EFFECTS[*].cost`, 3…7) and `Корреляция цены
с лучшим случаем (\d+(\.\d+)?)` (Pearson of cost vs best-case ≥ claimed − 0.02;
today 0.908 vs 0.91 — zero slack).

→ (a): every cost edit must be followed by a re-measure and a rewrite of the
three anchors. The prescribed instrument is `for v in bolt zone; do node
tools/kitbalance.mjs --atoms --via=$v; done` (registry comment; `kitbalance.mjs:232`
says `bolt lob zone` but `VIA` defaults to `['bolt','zone']`, lob is the base).
That instrument compiles with `fixedCooldown: 8` (`tools/matchworker.mjs:81`) —
a number chosen to be "the cooldown of a mid-price ability", which is no longer
true. Under per-delivery cooldowns the D71 loop (price → cooldown → measured
power) no longer exists, so the fixed cooldown should be dropped from
`matchworker.mjs` (and `compileSkill`'s `fixedCooldown` retired or documented as
unused) before the table is re-shot; otherwise the table is measured on a world
with 8 s cooldowns that nobody plays.

If the founder's "weights found by measurement" replaces the best-case table
with a regression from `tools/atombalance.mjs`, `checkprices` must be rewritten
to bind to that artefact (a JSON under `reports/combat/` or a comment block it
can parse) — the current gate cannot be satisfied by anything but the old table
shape.

### 2.7 `tools/checkspec.mjs`

Reads the **root** `SPEC.md` (not `docs/SPEC.md`, which differs):

- `Атомы стоят (\d+)–(\d+) очков` (SPEC.md:727) == min–max effect cost (3–7). Exactly one match required; the sentence carries an HTML comment explaining the history — keep the comment, change the digits. → (a).
- `**(\d+) мгновенно читаемых прочтений**` (SPEC.md:815) == `readingCount()` (654). `readingCount` walks single-effect skills through `validateSkill`, which includes the `budget` rule — with today's prices the costliest single-effect reading is 13, so (f) only matters if `SKILL_BUDGET` falls below ~13; (a) only if a single-effect skill exceeds the budget. Axis changes (deliveries/effects/E1 forms) change it.
- axis counts 9 / 14 / 7 / 9 released elements.

### 2.8 `tools/checkkits.mjs` (not in the suite — run by hand after every price edit)

Every stored `creature.kit_json` (78 creatures, all with kits) must pass
`validateSkill`, `costOf ≤ SKILL_BUDGET`, sum ≤ `KIT_BUDGET`, `compileKit`.
Exit 1 names the creatures; it never rewrites them.

Distribution today (`costOf` over all 78 kits, 234 abilities):

- kit totals: min 27, p25 31, median 36, p75 45, max 52, mean 37.8
- **6 kits at exactly 52/52**, 10 within 2 points, 14 within 4 points
- histogram: 27×2, 29×1, 30×15, 31×4, 32×8, 33×3, 34×3, 35×2, 36×8, 39×3, 40×2, 41×3, 42×2, 43×1, 45×3, 46×1, 47×3, 48×2, 49×2, 50×3, 51×1, 52×6
- ability costs: 7×19, 8×11, 9×22, 10×13, 11×62, 12×39, 14×1, 15×3, 16×5, 17×3, 18×23, 19×19, 20×10, 21×4 — none at 22, so `SKILL_BUDGET` has 1 point of slack for every stored ability, `KIT_BUDGET` has zero for six creatures.
- delivery usage: self 41, cone 43, zone 38, bolt 27, dash 26, beam 25, lob 16, blink 15, jump 3. Effects: damage 126, shield 28, burn 27, boost 23, knock 18, weaken 17, cleanse 14, root 12, stun 10, blind 9, silence 8, pull 6, heal 4, wall 2. Channels: speed 26, armor 8, damage 4, range 2.

Any upward price move on `damage`, `cone`, `zone`, `self`, `shield`, `burn`
breaks some of the six edge kits; the gate's own doctrine says the fix is a
decision (revert or a "your set no longer fits" screen), never a silent rewrite.
`src/server/forge/pipeline.js:521-528` already contains an over-budget repair
that drops effects — for **new** kits only.

### 2.9 `tools/checkgauntlet.mjs` (worker pool, ~1 min)

- all five `GAUNTLET` kits compile (`gauntlet.js:104-160`; costs 36/50/44/41/36 — `warden` has 2 points of headroom, `conjurer` 8).
- 12 seeds × both sides round-robin on the **product** field (`real: true`, cost-derived → now per-delivery cooldowns): `isDiverse` ≥ 4 of 5 win patterns; `BASELINE.bestMin` (0.85) > field's best-min and gap < 0.55; `spread of mins ≥ 0.2`; at least one cycle; no member's min exceeds `bestMin + 0.12`.
- each `KIT_PRESETS` (keeper 28, breaker 36, saboteur 39) is not `dominant` through `viability()` (40 rounds, isolate, kit-stub pilots).
- grid arithmetic for `dominant` reachability; negative controls.

The five were **found** by `tools/gauntletpick.mjs` on the old field (comment in
`gauntlet.js`: "кулдаун считается из цены умения"). (b)/(c)/(a) each change the
field; expect the five to collapse into a ladder → `isDiverse`/cycle assertions
red. Procedure: `node tools/gauntletfield.mjs --rounds=20` to see the new table;
if styles < 4 or no cycle, `node tools/gauntletpick.mjs --pool=90 --rounds=10
--tries=7`, replace `GAUNTLET`, re-measure `BASELINE.bestMin/medianMin/measuredAt`
(D109 — also required after any kit-stub pilot edit). `BASELINE.bestMin` must stay
above every preset's worst result and reachable on the 8-per-opponent grid
(`needFor` in the gate).

### 2.10 `tools/sizebalance.mjs --rounds=20` (worker pool, gate at 20 seeds)

Five equal-cost bodies from `BUILD_AXES` shares, same kit
`[bolt:damage, cone:damage, self:heal]` (31/52), kit-stub pilot both sides,
mirrored seeds. Asserts: bodies cost the same (else exit 2), identical bodies
give 50 % ± 5 (else exit 2), then **no body deviates ≥ 12 pp** from 50 %
(`DOMINATES = 0.12`). The header records that it went red before on the radius
axis. → (b)/(c) change the value of hp vs radius vs speed (faster casts make
small radius worth more, hp worth less); re-run at `--rounds=20` after the
economy lands and re-price `BUILD_AXES` in `config.js:703` if red — never the
gate threshold. `AIRENA_TUNING=cand.json` tries alternative axis prices.

### 2.11 `tools/checkvfx.mjs`

Grammar-facing assertions:

- `checkvfx.mjs:457-463` "hostile kit is legal": `3 × zone:wall(+damage|+burn|-)` compiled with `size: null` — **48/52 today, headroom 4**. Raising `zone`, `wall`, `damage` or `burn` by two points each on two abilities makes the fixture illegal and the gate red on its first line. Rebuild the fixture from whatever the worst-case per-tick emitter becomes.
- a real match (kit-stub × kit-stub, seed 11, `record: true`): `peak particles/s ≤ 900` (today 480 with 48 casts under 3 s cooldowns — twice the cast count of the old economy), `plays ≤ casts`, `meshes ≤ casts`, `flashes ≤ casts` where casts = `use` entries in the log. → shorter cooldowns raise casts per second; the 900 ceiling is absolute and is the one number here that (b) can push. The lead's "zone replaces the caster's previous zone / wall replaces wall" edits reduce concurrent emitters and help.
- everything else (IR grammar, decals, palette contrast) is untouched.

### 2.12 `tools/checkdecay.mjs`

Plays every VFX module form on a stubbed `Vfx` with fixed event records
(`checkdecay.mjs:373-384`: zone `duration: 3`, beam 1.2, self 5, wall 5,
status 4) and asserts tail ≤ `TAIL_MAX` (5 s, justified as "the longest legal
form — wall and shield, 5 s"), decal hold ≤ `DECAL_HOLD_MAX`, fade ≥ `FADE_MIN`.
→ (c): if `shield`/`wall` durations or zone `duration` change, update the fixture
records and the `TAIL_MAX` rationale in `src/viewer/vfx/kit.js` (README binds
`TAIL_MAX`/`FADE_MIN` digits via `checkdocs`). Nothing here reads the registry's
durations, so it will not fail by itself — it will measure a world that no
longer exists.

### 2.13 `tools/checkdocs.mjs` (own gate line + inside `checkprompt`)

15 bound claims (`checkdocs.mjs:117-260`), the digit sweep with `EXEMPT`,
tools-both-directions, paths, brain tags, query params. Relevant to the overhaul:

- "the invariant count" ×2 → `test.mjs` `ok(` count (34).
- "when the arena starts burning" → `SUDDEN_DEATH_AT`.
- "the wind-up rounding example" → `SKILLS.smash.windup` (0.28 → served 0.3).
- decay thresholds → `TAIL_MAX`, `FADE_MIN`.
- **tools both directions**: a new `tools/atombalance.mjs` (milestone 4) or any other new `.mjs` in `tools/` fails `checkdocs` until README names it (`tools/x.mjs` mention or bare name in the layout block). Conversely retiring `kitbalance.mjs` requires removing its README rows.
- the sweep: any new digit in README prose needs a claim or an `EXEMPT` entry (`--rounds=\d+` and `--samples=\d+` are exempt).
- README prose that goes stale but is **not** gate-bound: line 177 ("cooldowns derived from price"), 182, 194 ("Atom prices are a measurement … `kitbalance`"), `docs/HARDCODE.md:175` ("кулдаун 0.9 с за очко", budgets 22/52). Update by hand.
- `README.md --falsify` mutations (`checkdocs.mjs:300-330`) must still apply after edits — one of them anchors the sentence `so nothing ends on a\nclock.`.

### 2.14 `tools/checkcadence.mjs`

Schedule and broadcast layer only (`ArenaLoop`, `Live`, `pickOpponent`): rest
after a fight, busy/resting exclusion, fresh opponent across windows, throw
releases both, live-over-lingering, `mine`/`following`, queue class order,
result reading window, newcomer joins a young fight. Reads nothing from the
grammar. Untouched by (a)–(f). (It is named in the task list only because its
docstring uses the word "cooldown" for the 5 s rest.)

### 2.15 `tools/checkstale.mjs` (informational, not in the suite, no exit code)

Compares `brains/**/{octopus,gorilla}.json` → `constants.build` /
`constants.skills` / `buildBudget` against live `BUILD_AXES`, `SKILLS`,
`BUILD_BUDGET`. Populations recording `fighters` are reported STALE (archetype
era). The grammar is not compared at all (provenance records `skills: SKILLS`
only — `checkframing.mjs:437`, `brainforge.mjs`). → if the overhaul touches the
hardcoded five, every population prints STALE; nothing fails, but
`docs/EXPERIMENT.md` claims about `l`/`u` populations are then about another
world.

### 2.16 `tools/checkscope.mjs`

Static rules over the client bundle and over `SERVER_COPY` string literals
(`registry.js`, `api.js`, `limits.js`, `jobs.js`, `forge/pipeline.js`,
`adapt.js`, `creatures.js`, `worker.mjs`): no `token|kit|skill|model|LLM|API|price|pricing`
words, no `$<digit>`, no Cyrillic in player-visible strings; long model prompts
(`> 240 chars, > 4 lines`) are exempt. → new refusal strings in `registry.js`
(`validateSkill`/`validateKit` `ru:` fields — "the ability costs N points out of
M") must keep using "ability"/"set"/"points", never "skill"/"kit"/"price".
`src/brain/prompt.js` is not on either surface.

### 2.17 `tools/falsify.mjs --controls --tags=u1..u6`

Lockstep identity and self-vs-self controls on the `u` population against the
**hardcoded** fixture (no kits: `createWorld` without `kits`). Insensitive to the
grammar; sensitive only to `SKILLS`/config changes that make a brain fault.
Population membership requires `octopus.json`+`gorilla.json` with one
`promptHash`; the suite passes explicit `--tags`, so a changed prompt does not
break the gate (a bare `node tools/falsify.mjs` would refuse a mixed
`brains/`). `API_VERBS` (`falsify.mjs:787`) is a vocabulary list for diversity
scoring — add nothing for (e) unless a new verb name appears.

### 2.18 `tools/checkisolate.mjs`

Sandbox walls. Uses `compileKit([bolt:damage, cone:damage, self:heal])` as the
"kit is issued" fixture for `never_uses`/`never_hits`; admits a sample of
reference brains with a kit-stub sparring partner. Sensitive only through
fixture legality and through brains that stop hitting under the new numbers
(`never_hits` fires only if a brain used a skill and hit nothing in two probe
matches, `sandbox/index.js:226-233`).

### 2.19 `tools/checkforge.mjs`

Forge prompt names every element's form list from `grammar()`; unaffected by
costs. (a)/(f) do flow into the forge prompt text (`pipeline.js:316-327` prints
delivery/effect/channel costs and `g.budgets.skill/kit`) but no gate binds those
numbers — the prompt reads them live.

### 2.20 `checkframing` / `checkcamera`

Run a trail of real fights (brains from `brains/`, hardcoded skills) and
assert camera jerk 99th percentiles under `CEIL` (`checkcamera.mjs:150-160`).
Grammar-blind; a faster fight could raise the percentiles marginally — re-run,
recalibrate only with `--calibrate` evidence.

### 2.21 Gates that are untouched by (a)–(f)

`checkladder` (Elo arithmetic), `checkcontrast`, `checkstages`, `checkboot`,
`checkidentity`, `checkimage`, `checkbody`, `checkbodyrace`, `checkfaults`,
`checkfacade`, `checkmodels`, `checkpose`, `checkselectors`, `checkscreens`,
`loadtest`.

---

## 3. Fixture kits the gates depend on (costs under today's prices)

| where | kit | per-ability | total / 52 | headroom |
|---|---|---|---|---|
| test.mjs lob | lob:damage, self:heal, bolt:damage | 11, 9, 11 | 31 | 21 |
| checkgrammar §4 fill pool | bolt:damage, self:heal, self:shield, lob:burn | 11, 9, 7, 11 | (2 of 4 + probe) | ≥ 14 |
| checkgrammar §5 | self:wall, zone:damage, bolt:damage | 8, 12, 11 | 31 | 21 |
| checkgrammar §9 must FAIL | 3 × beam:damage+stun+blind | 28 ×3 | 84 | −32 |
| checkgrammar §10 | zone:pull+damage/gravity, self:boost·armor, cone:damage | 17, 10, 11 | 38 | 14 |
| checkprompt K0 / K1 | jump:shield, beam:damage, zone:burn / cone:damage+knock, bolt:burn, self:heal | 9,12,12 / 18,11,9 | 33 / 38 | 19 / 14 |
| checktactics K0–K2 | see 2.3 | 18,11,8 / 12,11,9 / 10,9,9 | 37 / 32 / 28 | 15 / 20 / 24 |
| checkbehaviour reach | kind:damage, self:heal, blink:cleanse | ≤12, 9, 8 | ≤ 29 | ≥ 23 |
| checkbehaviour kit fields | three kits, 2.4 | 32 / 31 / 29 | | ≥ 20 |
| **checkvfx hostile** | 3 × zone:wall(+damage/+burn/–), `size:null` | 19, 19, 10 | **48** | **4** |
| checkisolate idleKit, sizebalance KIT | bolt:damage, cone:damage, self:heal | 11, 11, 9 | 31 | 21 |
| kitbalance ATOM_BASE | lob:damage, cone:damage (+ tested atom) | 11, 11 (+≤22) | ≤ 44 | — |
| **GAUNTLET warden** | beam:heal+wall, blink:wall, bolt:cleanse+pull+damage | 18, 10, 22 | **50** | **2** |
| GAUNTLET conjurer | zone:boost·range, blink:boost·vision, zone:heal+damage | 11, 13, 20 | 44 | 8 |
| GAUNTLET striker / runner / lobber | | | 36 / 41 / 36 | 16 / 11 / 16 |
| KIT_PRESETS keeper / breaker / saboteur | | | 28 / 36 / 39 | 24 / 16 / 13 |

`warden`'s third ability is exactly 22 = `SKILL_BUDGET`: any +1 on `bolt`,
`cleanse`, `pull`, `damage` or the 3-effect surcharge makes `checkgauntlet` fail
on its first assertion.

---

## 4. `src/core/version.js` — what a change does to `constants_version`

`disclosed()` (`version.js:98-112`) hashes: `BUILD_AXES` + `BUILD_BUDGET`,
`SKILLS` (the hardcoded five), arena (half, wall height, obstacles), `TICK_HZ`,
`THINK_HZ`, `MATCH_SECONDS`, `SUDDEN_DEATH_AT`, `SUDDEN_DEATH_RAMP`.

- **DELIVERIES / EFFECTS / CHANNELS, costs, budgets, cooldown rule, ZONE_* are not in the hash.** The docstring argues this deliberately: a brain reads its kit's live numbers from `p.self.kit` (F10), so prices cannot misinform it. That argument was written for prices; it does not cover cooldowns/magnitudes/durations printed in the kit block and typed into brains (the prompt's own `KIT_IS_NOT_YOURS` paragraph exists because 61 of 77 brains hardcode `dist` thresholds). Decision needed: extend `disclosed()` with the grammar's disclosed parameters (deliveries' `cooldown/windup/recover/range/speed/radius/splash/distance/halfAngle/duration/iframes/airborne`, effects' `mag/duration`, `ZONE_TOTAL_SHARE/ZONE_PERIOD`, `AIRBORNE_DODGE_MIN`) so the overhaul bumps the version once; or leave it and record in DESIGN.md why brains written against 10 s cooldowns are considered current.
- Touching `SKILLS` (the fixture five), `SUDDEN_DEATH_AT` or `MATCH_SECONDS` bumps it regardless.
- What a bump does: `app.js:436` refuses **replays** of matches whose `constants_version` differs (`stale_constants`; 260 081 stored matches across three versions today: c-d3006474 214 481, c-8646029e 44 370, c-1b01b20c 1 230). `tools/shots.mjs:699-701` picks screenshot fights from the latest version only. `tools/seed.mjs:235` counts pairs on today's constants.
- What it does **not** do: the live loop never compares `creature.constants_version` — `arena-loop.js:244-250` only writes it into `match`; `ladder.pickOpponent` does not filter on it; `adapt.js:295-310` deliberately leaves it alone; `api.js:415/1406` and `creatures.js:284` expose it and the client bundle never reads `constantsVersion` (grep: no hits under `src/client`). Older creatures keep fighting.

---

## 5. Client cooldown display

- `src/viewer/main.js:6908-6926` — per frame, per fighter, per skill tile:
  `el.dataset.cd = cd > 0.001 ? cd.toFixed(1) : ''`, class `cool|ready`, text
  `label + seconds`; a dead fighter's chips are frozen. Source is the snapshot's
  `cd` map (`sim.js:2120`, `round3(me.cooldowns[k])`).
- `src/client/screens/live.js:1140-1196` `syncCd()` on a 110 ms tick: reads
  `data-cd`, self-calibrates a denominator `data-cdmax = max(seen)` while the tile
  is cool, writes `--cd-frac = n / max`, deletes `cdmax` when the tile reads 0,
  and marks `data-cdnew` on the first cool frame so the ring and the badge are
  written, not animated (`ui/hud.css:495-660`, `--cd-frac` registered with a
  130 ms transition; badge fade 220 ms).
- **No code assumes long cooldowns.** The only fragilities under ≤ 3 s: the
  110 ms sampler can miss the single 33 ms "ready" frame between two casts of a
  1.1–1.8 s ability, so `cdmax` is not reset — harmless because `max(cdmax, n)`
  is monotone per tile and every tile is one skill; a 130 ms transition on a
  1.8 s ring looks steppy at 110 ms sampling; the badge and ring flip every
  ~2–3 s, which is visually busier than designed. Demo values in
  `live.js:296-303` (`'3.2'`, `'1.4'`) and the fake HUD (`live.js:3893-3899`) are
  cosmetic.
- `src/client/ui/ability.js` tooltips print no cooldown/damage numbers; the
  history screen (`history.js:274/378`) only names the `cooldown` channel and the
  `refused: cooldown` beat. No client copy pins a cost or a budget
  (`kitCost` from `api.js:967/1099` is unread by the bundle).

---

## 6. Dev server and genex

- `tools/devrestart.sh`: kills whatever listens on 8787, starts
  `AIRENA_DEV=1 AIRENA_SUB_MODELS=1 nohup node --env-file-if-exists=.env src/server/app.js > /tmp/airena-dev.log 2>&1 &`,
  polls `/api/health` for 10 s. `constantsVersion()` is cached in-process, the
  arena loop's busy/rest maps are in memory — a restart is required after any
  registry/config change and it drops in-flight broadcasts. D182: only the lead
  restarts it; agents never start servers.
- genex CLI: bin name `genex` from `@genex-ai/cli` 0.3.2 in the npx cache
  (`~/.npm/_npx/bb8cc4ccf8f65eca/node_modules/@genex-ai/cli/dist/index.js`,
  package `bin: { genex: ./dist/index.js }`); five other cache dirs hold the older
  `@genex-ai/cli-demo`. `node …/dist/index.js --help` lists: `login create dev
  verify doctor render-check sync-skills sync-types link unlink balance
  hud-capabilities jobs place animate model splat npc weapon outfit texture
  skybox terrain-texture sfx help`. **No `preview`, `publish`, `promote`, `wait`
  or `rename` subcommand is present in that build**, although DESIGN.md
  (`genex preview`, `genex promote`) and `docs/DEPLOY.md:88` (`npx genex list`)
  record them being used. Either a newer `@genex-ai/cli` resolves on `npx genex`
  (network install) or the previewing path is different — verify with
  `npx genex --help` (needs network) before milestone 7 and record the exact
  version in DESIGN.md. Project identity: `.genex/project.json` (`slug: airena`,
  `dashboardOrigins: https://genex.games`, `playUrl: https://airena.genex.technology/`,
  status `published`) → the player's page is `https://genex.games/draft/airena`.

---

## 7. Ordered checklist

Do these in order; each line names the gate(s) it keeps green.

1. **Freeze the measurement rig before pricing.** Drop `fixedCooldown: 8` from
   `tools/matchworker.mjs:81` (or set it to the per-delivery value) so
   `kitbalance` measures the world players get; decide the fate of
   `COOLDOWN_PER_POINT`/`COOLDOWN_MIN`/`cooldownPoints` in `compile.js` (the
   `?? cooldownPoints` fallback is dead once every delivery has `cooldown`;
   `COOLDOWN_MIN` still clamps). Update D71 in `docs/DECISIONS.md` with a new
   decision rather than editing it.
2. **Per-delivery cooldowns (b)** — already on disk. Then: `node tools/test.mjs`,
   `node tools/checkgrammar.mjs` (all legal skills still finite), `node
   tools/checkprompt.mjs` (re-judges the changed kit `cooldown` lines — needs
   `~/.local/bin/claude`, ≈$0.1; commit `tools/tactics-verdicts.json`),
   `node tools/checkbehaviour.mjs`.
3. **Aim form (e)** — in progress in `sim.js`/`deliver.js`. Keep the lone-number
   lob form working or rewrite `test.mjs:239-317`; document the `{x,z}` form in
   `verbs()` (`prompt.js:893-960`) as a capability, conditional on the kit
   holding an aimable delivery so the no-kit prompt stays byte-identical
   (`bracket.mjs` hash, tactics cache); add any new `kitView` field to the §5
   `.kit` sentence (`prompt.js:779-783`) or `checkbehaviour` fails; add new
   `refused`/`missed` reasons (e.g. `immune`) to the events table in
   `perception()` (`prompt.js:855-870`) — untraced text, but `checktactics`
   judges it. Re-run `checkprompt`, `checkbehaviour`.
4. **Magnitudes/durations (c)** in `registry.js` EFFECTS and DELIVERIES.
   Then `checkbehaviour` (reach lines), `test.mjs` lob invariants (range 15 /
   splash), `checkdecay` fixtures (`checkdecay.mjs:373-384`) and the `TAIL_MAX`
   rationale in `viewer/vfx/kit.js` if shield/wall/zone durations move, README
   digits via `checkdocs`.
5. **Costs (a) and budgets (f)** — after `tools/atombalance.mjs` exists:
   - re-run the enumeration and update `checkgrammar.mjs:165` `want` + the
     comment table `registry.js:605-616` (new budget keys if `SKILL_BUDGET`
     moves);
   - re-shoot or replace the best-case table + `ранги отображены в X…Y` +
     `Корреляция … N` in `registry.js:300-372` (or rewrite `checkprices` to bind
     the new artefact);
   - `SPEC.md:727` `Атомы стоят X–Y очков`; `SPEC.md:815` readings if
     `readingCount()` moves;
   - `node tools/checkkits.mjs` — 6 creatures sit at 52/52, 14 within 4 points;
     decide (revert / migrate / "does not fit" screen), never rewrite kits;
   - check every fixture kit in §3 still compiles (`checkvfx` hostile kit has 4
     points of headroom, `GAUNTLET.warden` 2, its bolt exactly 22);
   - keep `checkgrammar §9` fixture over budget;
   - new registry strings: English, no `skill|kit|price` words (`checkscope`).
6. **Gauntlet & bodies** (worker pool, one league at a time — D182):
   `node tools/gauntletfield.mjs --rounds=20`; if < 4 styles or no cycle, re-pick
   with `gauntletpick.mjs`, replace `GAUNTLET`, re-measure `BASELINE`
   (`gauntlet.js:200-262`); then `node tools/checkgauntlet.mjs`. Then
   `node tools/sizebalance.mjs --rounds=20`; re-price `BUILD_AXES` if a body
   deviates ≥ 12 pp.
7. **Version**: decide whether `disclosed()` gains the grammar's disclosed
   parameters (recommended — brains type kit numbers into source). If yes,
   expect replays of all 260 k stored matches to refuse with `stale_constants`
   and `shots.mjs` to need fresh fights; the live ladder keeps running.
8. **Docs bound by gates**: README (`checkdocs` — name `tools/atombalance.mjs`,
   invariant count if `test.mjs` grows, sudden-death second if it moves, no loose
   digits), root `SPEC.md` (`checkspec`), `registry.js` comments (`checkprices`,
   `checkgrammar`). Docs not bound but stale: README rows 177/182/194,
   `docs/HARDCODE.md:175`, `docs/EXPERIMENT.md` skill table, D71 in DECISIONS.
9. **Prompt (d)** last, once numbers are final: every numeral through `q()` or a
   `PROSE_NUMERALS` entry; every changed paragraph is re-judged (`checktactics`,
   fails if `claude` is absent); `brainPrompt(id)` without kit stays
   byte-identical unless the change is meant for the §1 fixture too (then
   `bracket.mjs` and `falsify` populations become a new prompt generation).
10. **Full wall**: `npm test --log=reports/screens/ui/gates.log` after
    `tools/devrestart.sh` is not needed for the suite (no gate needs the
    server), but the dev server must be restarted before any capture
    (`tools/shots.mjs`, `tools/arenashot.mjs`) so it serves the new
    `constantsVersion()`.
11. **Preview**: verify which `genex` binary answers `npx genex --help` (the
    cached 0.3.2 has no `preview`), then `npx genex preview` →
    `https://genex.games/draft/airena`; record the CLI version and command in
    DESIGN.md.
