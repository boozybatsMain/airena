# Arena / ladder fixes — round 1 handoff (07.09.2026)

Lane: `src/server/arena-loop.js`, `ladder.js`, `creatures.js`, `db.js`, `tools/seed*.mjs`,
`tools/checkladder.mjs`, new `tools/checkfixtures.mjs`. Answers spectacle §0, §2c, findings
1 and 9; pace H1 and L4.

**Headline.** A third of the sides on the public ladder were a body that walked for the whole
fight and cast nothing, and a fight like that is indistinguishable from an honest loss — same
outcome, same length, same cause of death. Two causes, both fixed at the source. Replaying the
same 250 recent ladder pairings offline, with the same seeds, kits, builds and brains:

| | before | after |
|---|---|---|
| sides that never cast | **70 of 500 (14.0 %)** | **0 of 500** |
| zero-event double-KOs | **7** | **0** |
| casts per fighter per 10 s, median | 6.51 | 6.54 |
| casts per fighter per 10 s, p25 | 4.59 | 4.97 |

Nothing was deleted. No row was dropped, no table changed shape destructively, and the only
`UPDATE`s are the 21 tags and 4 seed brains listed below. Database snapshots were taken before
each write: `data/backup/airena-2026-09-07T04-22-40-466.db` and
`…T05-39-40-684.db` (`tools/backup.mjs --keep=0`, which adds and never rotates).

---

## 1. Schema changes

One migration, additive, appended to the end of `MIGRATIONS` in `src/server/db.js`
(index 13 → `user_version` 13), plus the matching `ensure()` line in the self-repair list:

```sql
ALTER TABLE creature ADD COLUMN reference_tag TEXT     -- nullable
```

`'octopus' | 'gorilla' | NULL`. NULL is meaningful and correct for a creature with a grammar
kit: it has no fixture and must not be given a fake one. A row whose tag was never inferred
does **not** fall back to the colour — it falls back to reading its own `brain_source`
(`refTagOf` below), so an unmigrated or unseeded database behaves correctly, just more slowly.

No change to `match`. The summary rides inside the existing `result_json` (§4).

---

## 2. Where the tag comes from, and how it reaches the sim

### `refTagOf(c)` / `inferReferenceTag(source)` — `src/server/arena-loop.js`

A third row-to-match-input converter beside `kitOf` and `buildOf`, for the same reason: a
quantity that belongs to the creature was being handed out by the side.

`inferReferenceTag` counts **only the verbs a mind hands to itself** — string literals passed
to `api.use(…)`, `api.ready(…)`, `api.cooldown(…)`. Substring matching on the source does not
work and was measured: all 21 live minds mention both sets, because they read the *enemy's*
skills out of perception (`enemyCasting.skill === 'charge'`) and write about them in comments.
By call site the split is clean — **21 of 21, no ambiguous case, no unclassified case.** A mind
that calls both halves or neither returns `null` and is never guessed at; `tools/seedfixtures.mjs`
prints such rows in a separate list instead of writing them.

### Core change (minimal, additive) — please review

Three edits, all in the concurrently-edited core. I re-read both files immediately before
editing and reformatted nothing.

- **`src/core/sim.js`** — `createWorld(seed, { …, referenceTag = null })`. After the existing
  `kits` block, a 12-line loop stamps `fighter.refTag` and re-seeds that fighter's cooldowns
  from `skillsOf(tag)`. It is skipped for a fighter that has a kit, and for an unknown tag.
- **`src/core/sim.js`** — `namesOf(f)` now reads
  `skillsOf(f.refTag || referenceTagOf(f.id))` instead of `skillsOf(referenceTagOf(f.id))`.
  This is the whole behavioural change; `referenceTagOf(side)` is untouched and still the
  fallback, so every existing caller keeps its current behaviour.
- **`src/core/match.js`** — `runMatch(brains, { …, referenceTag = null })`, forwarded to
  `createWorld`.

`REFERENCE_TAG_OF_SIDE` and `referenceTagOf` in `src/core/config.js` were **not** touched.

### Plumbing (my lane)

| file | change |
|---|---|
| `src/server/sandbox/index.js` | `runIsolated(…, { referenceTag })` → `workerData` |
| `src/server/sandbox/worker.js` | `workerData.referenceTag` → `runMatch` |
| `src/server/arena-loop.js` | `playMatch` passes `{ [aSlot]: refTagOf(a), [bSlot]: refTagOf(b) }`, and returns the same object on `r.referenceTag` |
| `src/server/live.js` | the broadcast run takes `matchRow.referenceTag`, else recomputes from the two creature rows — **without this the spectacle run would hand a kitless fighter the fixture by colour while the ranked run used its mind's, i.e. a different fight under the same match id** |
| `src/server/adapt.js` | `score()` takes `refTags` in the same shape as `kits`/`builds` (own value, opponent as a function of the row); `adaptOnce` and `duelBrains` pass it. In `duelBrains` the tag is computed **per source**, because a refactor compares two different minds and the model may have rewritten `laser` into `smash` |
| `src/server/creatures.js` | `create()` records the tag in the same INSERT as the brain; `refactor()` recomputes it (`CASE WHEN kit_active THEN NULL ELSE ? END`) |

---

## 3. Rows updated

Written by `node tools/seedfixtures.mjs` (dry-run first, snapshot taken automatically,
verified by read-back after the write). Both halves are idempotent.

### 3a. `reference_tag` — 21 rows, all `kit_active = 0`, all `state = 'active'`

Nothing else in the table has a non-NULL tag (57 kitted creatures remain NULL, as intended).

| id | name | tag | provenance | fights |
|---|---|---|---|---|
| `c_2d2c593e-838` | BOULDER-42 | gorilla | library | 12061 |
| `c_c40e5ef2-c39` | DECK-75 | gorilla | library | 11806 |
| `c_2f990392-e68` | HAMMERBACK-00 | gorilla | library | 4936 |
| `c_70986a43-271` | ODIN | gorilla | player `u_c4630b5c-249` | 14719 |
| `c_4bfb6d5b-6f3` | PRESS-60 | gorilla | library | 11879 |
| `c_a7d3cfba-205` | RIDGE-50 | gorilla | library | 11450 |
| `c_19ff07a7-841` | SHAFT-50 | gorilla | library | 11206 |
| `c_2249bd51-8c1` | SHARK | gorilla | player `u_0a736f38-178` | 14313 |
| `c_fe0d7767-89e` | SOIL-33 | gorilla | library | 12482 |
| `c_375283c7-637` | WEDGE-40 | gorilla | library | 11683 |
| `c_61d1f99d-43f` | BOLIDE | octopus | player `u_14342dfc-c7c` | 12822 |
| `c_cb22b5c1-9ef` | COURIER | octopus | player `u_3ed1f7b1-633` | 13420 |
| `c_736d9716-bef` | GRAIN-50 | octopus | library | 9278 |
| `c_ae4bc2aa-d58` | LENS-00 | octopus | library | 3558 |
| `c_336cd583-4d0` | LINE-17 | octopus | library | 5681 |
| `c_05721d7b-fff` | MARK-92 | octopus | library | 8221 |
| `c_e3d88cca-bb4` | NEEDLE-42 | octopus | library | 9502 |
| `c_4170a163-701` | OSKTUS-86 | octopus | player `u_92172d8e-f52` | 12354 |
| `c_925ab5a2-cf1` | RACE CHECK | octopus | (ownerless) | 12777 |
| `c_04cc9eb0-595` | SEAM-70 | octopus | library | 10175 |
| `c_a0ccc3c9-76e` | SPIRE-08 | octopus | library | 4469 |

11 octopus, 10 gorilla. Only the tag column and `updated_at` were written — rating, fights,
history, kit, body and brain are untouched. Six of these are **players' creatures**; the tag is
derived from their own minds and changes nothing they wrote.

### 3b. `brain_source` re-seeded — the four handwritten-reference rows

Spectacle finding 1b. All four gate their kit walk on `if (k.trigger !== 'active') continue;`
and `kitView()` stopped sending `trigger` (D102), so they discarded their whole kit every tick.
The checked-in file was fixed; the database copies were not.

Selected by **provenance, not by name**: `owner_id IS NULL` **and** `is_library = 1` **and**
`brain_model LIKE '%рукописн%'`. A player row cannot match, and if one ever did the tool prints
it under "не трогаю" instead of writing it. All four are project seeds; none was skipped.

| id | name | state | fights | brain sha256[0:12] before | after | source file |
|---|---|---|---|---|---|---|
| `c_a696c00e-b5a` | CRUSHER | active | 10113 | `339323fef7aa` | `963811c706c6` | `brains/kit-stub/gorilla.js` |
| `c_4a015fb3-c2e` | PRISM | active | 7835 | `a289ce15f975` | `ecd3d0a9bdcc` | `brains/kit-stub/octopus.js` |
| `c_3d616571-08f` | FIRING | retired | 683 | `a289ce15f975` | `ecd3d0a9bdcc` | `brains/kit-stub/octopus.js` |
| `c_4c466a69-0c8` | ROCKFALL | retired | 1089 | `339323fef7aa` | `963811c706c6` | `brains/kit-stub/gorilla.js` |

Which stub is which came from the row's own docstring (`сторона осьминога` / `сторона гориллы`),
so a creature stays the mind it was. The two files differ only in a comment and in one kiting
distance (`far * 0.7` vs `far * 0.45`) — both read their kit from perception and know no skill
name in advance.

Measured effect, `tools/checkfixtures.mjs`, casts per fight against the kit-stub:
**CRUSHER 0/0/0/0 → 15/27/15/24**, **PRISM 0/0/0/0 → 20/18/21/16**.

**One thing for the viewer/voice lane:** `brains/kit-stub/*.js` says its four quips in Russian
(`нечем ответить`, `горячо`, `вижу вчерашний день`, `держи`). Re-seeding verbatim keeps the DB
copy byte-identical to the file, which is the invariant worth having — but it does add Cyrillic
quips to two active ladder creatures, and `main.js:3690` blanks those (spectacle finding 8).
Translating the four strings in the **file** fixes both at once and is one commit in whoever
owns `brains/`.

---

## 4. Stored match summaries (pace L4, spectacle finding 9)

`src/server/arena-loop.js`. `playMatch` now writes

```js
result_json = { [aSlot]: …, [bSlot]: …, summary: { blue: {…}, orange: {…} }, log: keepLog(log) }
```

and **`summary` is computed from the FULL log, before `keepLog` touches it** — which is the
whole point: the old cap was why the database said 4.3–5.9 casts per 10 s where `spectate.mjs`
measured 8.7 on the same creatures.

### Shape — nine integers per side, `summariseLog(log, slots)`

Same event vocabulary as `reports/combat/spectate.mjs`. Attribution is by the log line's own
`who` field, never "by meaning":

| field | log lines | attributed to |
|---|---|---|
| `casts` | `use` | the caster |
| `hits` | `damage`, `ignite` | the dealer (a zone counts per tick — the log collapses a run, the counter does not) |
| `misses` | `miss`, `chargeMiss` | the shooter |
| `dodges` | `evade` (i-frames), plus the *other* side's `miss` with `reason: 'airborne'` | the body that dodged |
| `immune` | `immune` | the body whose own immunity refused the control (`effects.js:109` writes `who: to.id`) |
| `refused` | `refused` | the caster whose order the sim rejected (cooldown / silenced / unknown) |
| `interrupts` | `interrupt` | the interrupter (`sim.js:1195` writes `who: byId`) |
| `absorbed` | `absorbed` | the attacker whose hit a shield ate whole |
| `heals` | `heal` | the body that was healed (`effects.js:234` writes `who: to.id`) |

Live example from an end-to-end `playMatch`:

```json
"summary": {
  "blue":   {"casts":20,"hits":7,"misses":1,"dodges":3,"immune":0,"refused":0,"interrupts":0,"absorbed":0,"heals":0},
  "orange": {"casts":14,"hits":1,"misses":11,"dodges":0,"immune":0,"refused":0,"interrupts":0,"absorbed":0,"heals":0}
}
```

`summary` passes through `sideResult()` untouched (it is not a side name, so `sideKeys` leaves
it alone). Its inner keys are always current side names because it is only ever written, never
migrated; rows older than this change have no `summary` at all, and every reader must treat it
as optional.

### Log retention

`keepLog` now keeps **every event**, collapsing only runs of consecutive identical `damage`
ticks, capped at `LOG_BUDGET_BYTES = 15 KB` (`AIRENA_LOG_BUDGET` overrides).

- A run collapses only while nothing else happens: any event of another type closes all open
  runs, so two fields ticking against each other still collapse separately and correctly.
- **The first line of a run is left untouched** — same `t`, `amount`, `hp` — and the count
  arrives as extra fields `n`, `until`, `total`. A reader that does not know about `n` sees an
  ordinary damage line of one tick's size and cannot mislead a viewer with a summed number; a
  reader that does can print "×5". Nothing in `api.js`/`history.js` needs to change.
- Over budget, head and tail are trimmed (40 / 60, the tail favoured because the killing blow
  is at the end) by binary search, and every `say` line survives regardless (F11).

**Measured, 250 recent ladder pairings replayed in one process:**

| | |
|---|---|
| full log | median **3.2 KB**, p95 5.9 KB, max 7.9 KB |
| events per fight | median 49, p95 101, max 146 |
| fights trimmed at a 15 KB budget | **0 of 250** — the cap is insurance, not the daily rule |
| the old head-20 + tail-30 rule | lost at least one event in **98 of 250** fights, 8 events on average when it lost any |
| `result_json` before | mean **3.75 KB** (DB check on the last 500 live rows: 3.75 KB — agrees) |
| `result_json` after | mean **4.45 KB** |
| **growth per match** | **+0.70 KB (×1.19)**, of which 227 bytes is the summary itself |

At roughly one fight a second that is about **+60 MB a day** on top of the existing ~320 MB.
The growth is modest because the old rule already kept ~50 lines and the median fight has 49;
what is being bought is the middle of the long fights, which is where a fight is decided. There
is still no deletion policy for old matches (`tools/backup.mjs` header) — that decision now
arrives about a fifth sooner.

---

## 5. Gates

### New: `tools/checkfixtures.mjs` (registered in `tools/suite.mjs` after `checkladder`, and in the README gate table)

Every **active** creature that is `is_library = 1` **or** `kit_active = 0` (32 rows) fights the
kit-stub — carrying a real grammar kit, because the stub reads its skills from perception and
without a kit applies nothing — on **both colours**, over 2 seeds, in-process via `runMatch`.
Fewer than 3 casts in any of the four runs fails the gate. Both colours is not decoration: half
the ladder ran on the "wrong" one, and a single-colour check would have missed the entire defect.

`--falsify` stops passing the tag, so the fixture is handed out by colour again, and reproduces
the bug exactly: **every one of the 21 kitless creatures drops to 0 on one side and stays
healthy on the other.** Exit 1.

`--sizes` prints the full-log weight distribution against `LOG_BUDGET_BYTES`.

### `tools/checkladder.mjs` — pace read added

The existing Elo arithmetic is unchanged. A second section reads the newest ≤ 200 ladder /
training matches of `constantsVersion()` **that carry a summary** and asserts:

- casts per fighter per 10 s, **median ≥ 5**
- sides that never cast, **= 0**

Under 200 such rows it prints the numbers with `·` marks and does not fail — right after a
constants change, or right after this deploy, there are no rows and failing on that teaches
people to distrust gates. From 200 it is a gate. `--no-db` skips it entirely.

Exercised against synthetic databases: 200 healthy rows → exit 0; one dead side in the window →
exit 1; median 2.5 casts/10 s → exit 1; 40 rows → report only, exit 0. On the live database it
currently prints *"боёв версии c-5afb2e89 со сводкой в базе нет"* — correct, because summaries
begin with the next server restart, and because the current constants version has moved
(concurrent registry work) away from the `c-d3c58948` rows in the table.

### Results

| gate | result |
|---|---|
| `node tools/test.mjs` | ✓ 70 passed, 0 failed |
| `node tools/checkladder.mjs` | ✓ ДЕРЖИТ |
| `node tools/checkfixtures.mjs` | ✓ 30 of 32, 2 quarantined by name (below) |
| `node tools/checkfixtures.mjs --falsify` | ✓ exit 1 — reproduces the defect |
| `node tools/checkkits.mjs` | ✓ 78 creatures, 0 illegal |
| `node tools/checkisolate.mjs` | ✓ 25 attacks stopped, honest mind passes |
| `node tools/checkcadence.mjs` | ✓ |
| `node tools/checkboot.mjs` | ✓ |
| `node tools/checkgrammar.mjs` | ✓ |
| `node tools/checkbehaviour.mjs` | ✓ |

---

## 6. Double-KO zero-event fights — cause, and what is left

Cause, from the stored rows (1200 matches of `c-d3c58948`, 410 of 2400 sides never cast):

| dead sides | cause | fixed by |
|---|---|---|
| **335** | kitless creature on the "wrong" colour | task 1 — the tag |
| **61** | handwritten reference gated on `k.trigger` | task 2 — the re-seed |
| **12** | kitless creature on the *right* colour — see below | **not fixed; see below** |
| **2** | a kitted mind (`sub:opus:plain`) that happened to cast nothing | noise |

Every zero-event double-KO in the sample was two of these sides meeting each other. After the
fix, replaying the 250 newest pairings gives 0 dead sides and 0 zero-event double-KOs.

### What is left, and it is somebody else's lane

Two library minds stay mute for a **different** reason, and I did not touch them. They are
listed by id in `KNOWN_MUTE` in `tools/checkfixtures.mjs`, with the measurement, and **the list
fails the gate if one of them ever starts casting**, so the exception cannot outlive its cause.

- **SPIRE-08** (`c_a0ccc3c9-76e`, library, 4469 fights, 83 wins, rating 917). Fires its laser
  only when `enCd('smash') > 0.2`, i.e. only while an enemy `smash` used in the last 1.1 s is
  still cooling. A grammar kit has no `smash`, so the condition is never true: **0 casts on all
  four runs**, and 33 of its 35 most recent live ladder fights have zero casts.
- **LINE-17** (`c_336cd583-4d0`, library, 5681 fights). Fires only when `!chargeReady ||
  dist > 14.8`; an enemy without `charge` leaves `chargeReady` true forever, so the laser is
  restricted to long range — 1 cast on blue, 6 on orange.

Both are minds written against the reference fixture that freeze against a grammar kit. This is
the same family as spectacle finding 7 and pace L2 and it needs one of two human decisions:
**re-forge the mind** (forge lane), or **take the creature off the arena**. Note that
`tools/retire.mjs` cannot see either of them today — it selects `is_library = 1 AND
kit_active = 1`, and both are kitless. It also still reads the dropped `archetype` column.
I deliberately did not retire them: they are not among the rows my brief authorises me to update.

---

## 7. What I need from other lanes

1. **Core lane** — please sanity-check the three additive lines described in §2: the
   `referenceTag` option on `createWorld`/`runMatch`, and `namesOf` reading `f.refTag` first.
   `referenceTagOf(side)` is untouched and remains the fallback, so removing my option restores
   the old behaviour exactly.
2. **Core / viewer lane** — `result_json.summary` is now available on every new match, as nine
   integers per side, computed from the full log. Spectacle finding 2 asks for `immune`,
   `interrupt`, `absorbed`, `shieldBroke`, `heal` and `wall` to reach the feed and the recap:
   the counts are in the summary and the individual lines now survive `keepLog`, so
   `api.js:1636`'s `KEEP` list and `history.js`'s `beatText` can be extended without any further
   storage work. `summary` is **optional** — rows written before today do not have it.
3. **Viewer lane** — a collapsed damage run carries `n`, `until` and `total` alongside an
   otherwise ordinary `damage` line. Printing "×N" where `n > 1` is now possible; ignoring the
   fields is safe and prints one tick.
4. **Whoever owns `brains/`** — the four quips in `brains/kit-stub/*.js` are Russian, and two
   active ladder creatures now speak them (§3b).
5. **Forge / product lane** — SPIRE-08 and LINE-17 (§6).
6. **Lead** — the dev server has not been restarted, so it is still running the old
   `arena-loop.js`: the tag column is populated and the runtime falls back to `brain_source`
   anyway, but **summaries only start being written after a restart**, and until then
   `checkladder`'s pace section has nothing to read.

## 8. Files touched

| file | why |
|---|---|
| `src/core/sim.js` | `referenceTag` option on `createWorld`; `namesOf` reads `f.refTag` (3 additions, no reformatting) |
| `src/core/match.js` | `referenceTag` option forwarded |
| `src/server/db.js` | migration 13 + `ensure('creature','reference_tag','TEXT')` |
| `src/server/arena-loop.js` | `refTagOf` / `inferReferenceTag`; tag into the match; `summariseLog`; new `keepLog` + `collapseTicks` + `LOG_BUDGET_BYTES` |
| `src/server/creatures.js` | tag recorded on `create()` and `refactor()` |
| `src/server/live.js` | tag into the broadcast run |
| `src/server/adapt.js` | tag into the adaptation and refactor duels |
| `src/server/sandbox/index.js`, `worker.js` | tag across the isolate boundary |
| `tools/seedfixtures.mjs` | **new** — the write half; `--dry`, own snapshot, read-back verify |
| `tools/checkfixtures.mjs` | **new** — the gate; `--falsify`, `--sizes`, `--seeds`, `--min` |
| `tools/checkladder.mjs` | pace read from stored summaries; `--no-db` |
| `tools/suite.mjs` | `checkfixtures` registered after `checkladder` |
| `README.md` | gate-table rows for `checkfixtures` and `seedfixtures` (a duplicate `checkfixtures` in the tools list, added concurrently by another lane, was de-duplicated) |
