# AIRENA — UI/UX redesign contract

This document is the single source of truth for the redesigned client. Every
agent building a screen, a component, a server field or a gate reads this first
and builds against it. If code and this document disagree, this document wins
until it is amended here.

Status: **build in progress** (05.09.2026). Author of decisions: the lead.

---

## 0. The product in one paragraph

The player does not control a creature. They describe one, choose the AI model
that becomes its mind, release it into the arena and follow its autonomous
competitive career. Loop: **Create → Bring to life → Release → Watch → Learn →
Improve → Climb.** The creature is the centre of the product; the interface
exists around it.

## 1. Hard rules (non-negotiable)

1. **English only.** Every player-visible string — client, server responses,
   viewer HUD, worker CLI, generated names, quips, tactics cards, birth notes —
   is English. No Cyrillic anywhere a player can see it. Legacy database rows
   may still carry Russian text; the client hides such strings with
   `latinOnly()` (see §7.6) instead of showing them. New code and new comments
   are written in English.
2. **The battle rendering is untouched.** `src/viewer/main.js` keeps rendering
   the fight exactly as today. Only its *text* (HUD strings, feed lines,
   reasons) is translated, and one 3-line hook is added for cooldown chips
   (§5.3). No changes to camera, bodies, VFX, simulation.
3. **The viewer DOM contract is preserved** (§5.1). Ids and classes the viewer
   writes into must exist with the same structure. Styling is free.
4. **No AI-playground vocabulary.** Never show: token, temperature, provider
   id, API, inference, prompt-engineering terms, prices, dollars, budgets.
   Model identity is shown as the creature's *mind* (name + provider mark).
   Forbidden words in UI copy: `token`, `kit`, `skill` (say *abilities*),
   `LLM`, `API`, `$`. `tools/checkscope.mjs` enforces this.
5. **No fake progress.** Never a percentage, ETA or spinner during generation.
   Elapsed time and the server's named stage are allowed.
6. **One dominant thing per screen.** Create: prompt + mind. Birth: the
   creature being born. Live: the battle. Result: progression. Creature: the
   specimen. History: the career. Ladder: the competition.
7. **Quiet interface.** Empty space, typography, simple geometry, glass
   surfaces, selective colour. No borders-in-borders, no dashboards, no
   permanent information that the moment does not need.
8. **Continuous transitions.** create → birth → reveal → searching → VS →
   battle → result → searching is one uninterrupted experience with no
   `page → loading → page` cuts. Screens cross-fade over the persistent arena.
9. **No framework, no bundler.** Plain ES modules served as files, hash routes,
   the `h()` DOM helper. The build is a copy (`tools/build.mjs`).
10. **Budgets stay.** First-frame gzip budget (`tools/checkboot.mjs`) and the
    gates in `tools/suite.mjs` stay green; gates that pinned the old files are
    updated, not deleted (§9).

## 2. Visual system

### 2.1 Palette (from the UI kit reference — light, warm, desaturated)

```
--sky:      #EBE1D9   page ground (warm off-white)
--sky-2:    #F4EEE8   lighter ground for cards on cards
--sand:     #C9B8A7   soft fill, dividers, disabled
--stone:    #8D7F73   decorative lines, icons at rest
--muted:    #6B5F55   secondary text, labels (≥4.5:1 on --sky)
--ink:      #2E2E33   primary text ("Shadow")
--ink-2:    #1F1F24   headings on light glass

--accent:   #FF7A5C   coral: opponent side, defeat, danger, primary CTA glow
--success:  #7AD3A6   victory, positive delta
--info:     #6EA8FF   own side, links, selection
--warning:  #F4D06F   caution, small-sample notices

--glass:        rgba(255,255,255,.52)
--glass-strong: rgba(255,255,255,.74)
--glass-line:   rgba(255,255,255,.72)
--glass-dark:   rgba(46,46,51,.86)   tooltips, VS card core
--shade:        rgba(46,46,51,.10)   shadows

--side-own: var(--info)      --side-foe: var(--accent)
```

Side colours: the viewer draws the `blue` side's floor telegraphs in cyan and
the `orange` side's in orange. The HUD maps **blue → --info** and **orange →
--accent** so floor and panel agree. Whichever side is *mine* also gets the
"YOU" marker; colours never change with ownership.

Contrast: body text `--ink` on `--sky` ≥ 10:1; labels `--muted` on `--sky`
≥ 4.5:1; anything on `--glass` is checked over `--sky` (`tools/checkcontrast.mjs`).

### 2.2 Typography

Self-hosted, latin subsets only (`src/client/fonts/`):

- **Space Grotesk** (variable 300–700) — `--font-display`: wordmark, state
  words, headings, labels, numbers, buttons.
- **Inter** (variable 300–700) — `--font-body`: paragraphs, prompts, tooltips,
  table text.

Scale (`ui/tokens.css`):

```
--t-wordmark  18px / 500 / tracking .42em      A I R E N A
--t-state     clamp(34px, 4.6vw, 60px) / 300 / tracking .28em / uppercase   FIGHTING, SIGNAL ACQUIRED
--t-hero      clamp(28px, 3.4vw, 44px) / 500 / tracking .12em / uppercase   creature names
--t-title     20px / 500 / tracking .06em / uppercase
--t-label     11px / 500 / tracking .18em / uppercase / --muted
--t-num       22px / 500 / tabular-nums
--t-body      14px / 400 / 1.5 (Inter)
--t-small     12.5px / 400 (Inter)
```

Numbers always `font-variant-numeric: tabular-nums`, thousands separated by a
comma (`1,214`), deltas with a real minus sign (`−21`), ranks with `#`.

### 2.3 Surfaces, radii, shadow, motion

- Glass panel: `background: var(--glass); backdrop-filter: blur(18px)
  saturate(1.15); border: 1px solid var(--glass-line); border-radius: 14px;
  box-shadow: 0 12px 40px var(--shade)`.
- Radii: 14px panels, 10px cards/inputs, 8px chips, 999px pills, circles for
  icon tiles and rank badges.
- Buttons: primary = ink on a soft sky→info gradient with a 1px light border
  and an arrow glyph; secondary = glass; ghost = text + underline on hover.
- Motion: UI 220 ms, screen cross-fade 600 ms, reveal sequences 400–900 ms per
  beat; easing `cubic-bezier(.2,.7,.2,1)`; honour `prefers-reduced-motion`.
- Icon language: 1.5 px monoline, geometric, black on white (generated) or
  `--ink` strokes (inline SVG). Icon tiles are circles with `--glass-strong`
  fill and a hairline.

### 2.4 Backdrop

`src/client/img/arena.jpg` is the placeholder world image (generated; to be
replaced later). It is the ground behind every non-battle screen: Create,
Birth, Creature, History, Ladder, Worker, Fatal. On LIVE the real 3D arena is
the ground. The backdrop is applied by `#stage` (§4.2) with a light veil
(`linear-gradient` of `--sky` at .35→.65) so glass panels read.

## 3. Information architecture

Primary navigation: **LIVE · CREATURE · HISTORY · LADDER**.

| Route | Screen | Module | Ground |
|---|---|---|---|
| `#/live` | Live: my creature right now (default once a creature or a job exists) | `screens/live.js` | 3D arena |
| `#/watch/:matchId` | Replay of one match (LIVE in replay mode, no auto-advance) | `screens/live.js` | 3D arena |
| `#/create` | Create a creature (default for a visitor with no creature) | `screens/create.js` | 3D arena behind a veil |
| `#/birth/:jobId` | Generation: waiting → reveal → matchmaking | `screens/birth.js` | 3D arena behind a veil |
| `#/creature` · `#/creature/:id` | Specimen (mine / any) | `screens/creature.js` | backdrop |
| `#/history` · `#/history/:matchId` | Career and one match's detail | `screens/history.js` | backdrop |
| `#/ladder` · `#/ladder/minds` · `#/ladder/season` | Competition | `screens/ladder.js` | backdrop |
| `#/worker` | Colleague worker pairing (unlisted) | `screens/worker.js` | backdrop |
| fatal | Overlay when the renderer/network is dead | `screens/fatal.js` | — |

Aliases handled by `app.js`: `#/arena`→`#/live`, `#/new`→`#/create`,
`#/new/:id`→`#/birth/:id`, `#/tactics/:id`→`#/history/:id`,
`#/creature/me`→`#/creature`, `?m=<id>`→`#/watch/<id>`, path `/worker`→`#/worker`.

Default route: `#/live` when `session.creature` or `session.job` exists,
otherwise `#/create`. While a job is `queued`/`running`, navigating to
`#/live` or `#/create` redirects to `#/birth/:jobId` (the player can still open
Creature/History/Ladder).

## 4. Shell (owned by the lead — `index.html`, `app.js`, `ui/chrome.css`)

### 4.1 Chrome

- **Wordmark** top-left: `A I R E N A` + two-line tagline in `--t-label`
  ("LIVING MACHINES / ENDLESS BATTLES").
- **Nav rail** left, under the wordmark: four items with a dot indicator
  (filled = active) and labels LIVE / CREATURE / HISTORY / LADDER. CREATURE and
  HISTORY are shown but dimmed for a visitor with no creature (they open an
  empty state that points to Create).
- **Season chip** top-centre: `SEASON 01` · `12,843 CREATURES` · `18D 04H`
  (from `session.season` and `session.world`). Hidden below 900 px.
- **My chip** top-right: ability-free card with the creature's name, `#rank ·
  1,214 MMR ▲24` (delta since the player's last visit if known, else none);
  clicking opens `#/creature`. A visitor sees a `CREATE A CREATURE →` button
  there instead. Next to it: a small `+` (new creature / new generation) once a
  creature exists.
- **Mobile (< 900 px)**: the rail becomes a bottom tab bar with four icons +
  labels; wordmark shrinks to `AIRENA`; my chip collapses to name + MMR.

The chrome fades to 35 % opacity while a battle is in `fighting` phase and
returns on hover/touch — the fight is the content.

### 4.2 Layers (z-order, bottom → top)

```
#arena     the persistent viewer (canvas + #hud). Never unmounted.
#stage     backdrop image + veil. Shown on document screens, hidden on live.
#screen    the current screen's root. Cross-fades on route change.
#overlay   transient cards over everything: VS, result, away recap, fatal.
#chrome    wordmark, rail, chips.
#tip       the single tooltip element.
```

`body[data-screen]` carries the current screen id; `body[data-phase]` carries
the live phase (§6.1). CSS keys on those attributes; JS does not toggle ad-hoc
classes on `body`.

### 4.3 Store (`lib/store.js`)

```js
export const store = {
  session: null,          // GET /api/session
  route: null,            // { screen, args, path }
  live: { phase: 'connecting', match: null, frame: null, over: null, mode: 'live' },
  debug: null,            // ?ui=<state> forcing (see §10)
};
export function set(patch)              // shallow merge, then notify
export function on(key, fn)             // subscribe to 'session' | 'route' | 'live' | '*' → unsubscribe fn
export async function refreshSession()  // re-fetch /api/session, patch store, emit 'session'
```

`app.js` translates socket DOM events (`airena:match|frame|over|idle`) into
`store.live` updates so screens subscribe to the store, not to the socket.

## 5. Battle HUD (owned by B — `ui/hud.css`, `screens/live.js`)

### 5.1 Viewer DOM contract — keep exactly these nodes

```html
<div id="arena">
  <div id="vfxflash"></div>
  <div id="hud">
    <div class="bar-wrap" id="bar-oct">            <!-- side blue -->
      <div class="col">
        <div class="namerow"><div class="name">—</div><div class="sub" id="meta-oct">—</div></div>
        <div class="hprow"><div class="hp"><i style="width:100%"></i><b>— / —</b></div></div>
        <div class="cds"></div>
        <div class="sidetag" data-side="oct"></div>
      </div>
    </div>
    <div class="bar-wrap" id="bar-gor"> …same with meta-gor / data-side="gor"… </div>   <!-- side orange -->
    <div id="clock"><div class="t">0.0</div><div class="s">—</div><div class="byline"></div></div>
    <div id="feedwrap"><div id="feed"></div></div>
    <div id="banner"><div class="box"><div class="who"></div><div class="why"></div></div></div>
    <div id="netstate"></div>
  </div>
  <div id="boot"></div>
  <div id="devsockets" hidden aria-hidden="true"> …inert sockets main.js queries… </div>
</div>
```

What the viewer writes: `.name` (creature name), `#meta-*` (mind model id —
the shell re-renders it as a mind badge, see below), `.hp > i` width, `.hp > b`
text (`83 / 180`), `.cds` children (`<div class="cd ready|cool" data-skill="k1">label
3.2</div>`, rebuilt on every `match`), `#clock .t` (seconds), `#clock .s`
(status line), `#clock .byline`, `#feed` lines (prepended, `<span class="ft">`
timestamp first), `#banner` (`.on` on match end), floating `.plate`, `.saybubble`,
`.dmg` elements appended to `#hud`, `#boot` (shell removes `.off`).

`#banner` is hidden by CSS (`display:none !important`): the shell's result
card replaces it. `#clock .byline` is hidden too. The `mine` side gets
`.bar-wrap.mine` set by the shell on `match`.

### 5.2 Layout of the HUD (reference: screen.png)

- Both fighter panels sit at the **bottom**, left = blue, right = orange, each
  ~34 vw wide, no glass box — just the elements floating on the arena:
  name (`--t-hero` smaller: 22–26px), `#id · 1,214 MMR` line, a 6 px HP bar
  with rounded ends (own = --info gradient, foe = --accent gradient) and the
  numbers to the outside, then three **ability tiles** (§5.3).
- **Centre bottom** between the panels: `VS` in `--t-state` at 28px, the clock
  under it (`00:28`), and the `#clock .s` status line (sudden death etc.) in
  `--t-label`.
- **Top centre** (under the season chip): the **phase word** rendered by
  `live.js`, not by the viewer: `FIGHTING` / `SEARCHING FOR OPPONENT` /
  `NEXT FIGHT IN 8` / `WATCHING REPLAY`, with a second line `ARENA · FIGHT
  #16013462` in `--t-label` (§9.1: *fight*, never *match* — this line and the
  clock's status line stood in one frame naming one number two ways).
- The fight's number is printed **once**, here. `#clock .s` no longer repeats
  it: that line is the arena's own status and stays empty until sudden death.
- **Feed** (`#feedwrap`) right side, vertically centred, 300 px wide, glass,
  label `LIVE FEED`, newest line first, at most 6 visible, older lines fade
  via a mask. Each line: a 6 px dot coloured by side, text, faint timestamp.
  Collapsible with a small chevron; collapsed state remembered in
  `localStorage('airena.feed')`.
- Anything transient (damage numbers, plates, say-bubbles) stays as the viewer
  draws it; only their CSS is restyled (Inter 12px, ink on light glass pill).

### 5.3 Ability tiles in the HUD

The viewer rebuilds `.cd` chips on every `match` and rewrites their text every
frame. Two things make them icon tiles:

1. **One hook in `main.js`** (the only allowed edit there besides strings):
   right where `el.className = \`cd ${cool ? 'cool' : 'ready'}\`` and
   `el.textContent = …` are set, also set `el.dataset.cd = cd > 0.001 ?
   cd.toFixed(1) : ''`. Nothing else changes.
2. `live.js` on `store.live.match`: for each side, resolve the creature id
   (`match.ids[side]`) and the slot order (`Object.keys(match.kits[side])`),
   then for each `.cd[data-skill]` set `style.backgroundImage =
   url(/api/creature/<id>/icon/<slotIndex>)` (fall back to the procedural SVG
   data-URI from `ui/ability.js`) and attach the tooltip with the ability's
   title/blurb (from `match.abilities[side][slot]`, §8.3). CSS hides the text
   node (`font-size:0`) and shows `::after { content: attr(data-cd) }` as the
   cooldown seconds; `.cool` dims the tile to 45 % and draws a thin
   conic-gradient ring if `--cd-frac` is provided (optional).

Tiles are 48 px circles, 10 px apart, under the HP bar, with the ability's
short name under each in `--t-label` at 10px.

## 6. Screens

### 6.1 LIVE (`screens/live.js`) — phases

`store.live.phase` ∈ `connecting | idle | searching | vs | fighting | result | replay`.

| Phase | When | What is on screen |
|---|---|---|
| connecting | no socket message yet | `#boot` text `CONNECTING TO THE ARENA` + orbit animation |
| idle (visitor) | `idle` and no creature | showcase battle if any; floating glass card bottom-centre: `You are watching the arena.` + `CREATE A CREATURE →` |
| searching | my creature exists, not fighting (`session.fightingNow` false) | phase word `SEARCHING FOR OPPONENT`, orbit animation centre, countdown from `session.nextFightAt` (`NEXT FIGHT IN 8`), or `NO FREE OPPONENT — RETRYING` when `session.noOpponent` |
| vs | a `match` where `mine` is set arrived with `atSecond < 1.5` | VS card overlay for 2.4 s: both names, minds, `#rank · MMR`, big `VS`; then it dissolves into the battle |
| fighting | frames arriving | minimal HUD (§5.2); chrome dims |
| result | `over` arrived for my match | result card (§6.2) for 6 s or until `NEXT FIGHT IN 0`, then `searching` |
| replay | route `#/watch/:id` | HUD + phase word `WATCHING REPLAY`; a back button top-left under the wordmark; no auto-advance; at the end: a small card with `REPLAY OVER` + `WATCH AGAIN` + `BACK` |

Not my match (showcase while my creature rests): phase word `ARENA · LIVE`
and a small line `Your creature is resting · next fight in 12` (from the
session), no VS card, no result card — the viewer's own end state is enough.

**Away recap**: on first LIVE entry when `session.since?.fights > 0`, show an
overlay card first (`WHILE YOU WERE AWAY` / `18 FIGHTS` `11 WINS` /
`1,214 → 1,347 MMR` / `#782 → #391` / `CONTINUE →`), then continue into
whatever phase is current. Shown once per session (`sessionStorage`).

**First battle** (spec §3): no tutorial. The VS card and the phase words do the
teaching.

### 6.2 Result card

```
VICTORY | DEFEAT | DRAW        (state word; success / accent / muted)
+24 MMR                        (--t-hero, signed, coloured)
1,214 → 1,238                  (rating before → after)
#782 → #739                    (rank before → after; omit if unknown)
NEXT FIGHT IN 8                (from session.nextFightAt; counts down)
```

Before = `store.session.creature.{rating,rank}` captured when the match
started; after = the same fields after `refreshSession()` following `over`.
`over.deltas` gives the MMR change immediately, so the card never waits for
the network to show the first two lines. Training matches (`over.training`)
add the label `SPARRING · NOT RATED`. Faulted brains (`over.faulted`) add
`A MIND WENT SILENT · NOT RATED`.

### 6.3 CREATE (`screens/create.js`)

A single glass card, centred, max-width 720 px, over the veiled live arena:

```
CREATE A CREATURE                                   (--t-title)
[ textarea, 3 rows, placeholder: A heavy mechanical crocodile that becomes
  more aggressive when wounded ]                    counter 0 / 280 (bottom-right, --t-label)

CHOOSE ITS MIND                                     (--t-label)
[ mind card ] [ mind card ] [ mind card ] …        up to 5 featured (§8.5)
   Browse all minds ↓                               ghost button

                                     CREATE →       primary button (disabled until 3 chars)
```

- Mind card: provider mark (`ui/mind.js`), model name (`Gemini 3.7 Flash`),
  a tag line (`FRONTIER` for featured/frontier, `~3 MIN` wait when measured),
  selected state = info-coloured hairline + soft glow. If the model has two
  modes, the selected card shows a tiny segmented toggle `QUICK · DEEP` with
  the wait estimate under each; never the words "think/thinking/reasoning
  budget".
- Unavailable bundles are shown dimmed with the English reason in a tooltip
  (`Worker offline — open /worker`, `Coming when payments open`).
- `Browse all minds` opens a modal picker (`ui/mindpicker.js`): search field
  (autofocus), filter chips `ALL · FEATURED · <provider> …`, `RECENT` section
  (localStorage `airena.minds.recent`, max 4), then the full list grouped by
  provider. Selecting collapses back to the card row with the choice
  highlighted. Keyboard: `Esc` closes, arrows move, `Enter` picks.
- Draft prompt + mind persisted in `localStorage('airena.draft')` on input
  (debounced 500 ms); cleared when the creature is born.
- Deny reasons from the server (`createBlocked`, POST errors) render inline
  under the button in `--accent`, English (server sends English, §9).
- Submit → `POST /api/creature {prompt, bundle}` → `go('/birth/<jobId>')`.
- Visitor and owner use the same screen. An owner creating again sees a line
  under the title: `Generation 02 · your current creature keeps its record`.

### 6.4 BIRTH (`screens/birth.js`)

Phase A — waiting (job `queued`/`running`):

```
CREATING LIFE                     (--t-state)
        ◯                          orbit animation (ui/orbit.js, mode 'birth'), 260 px
     ◯  ●  ◯
GEMINI 3.7 FLASH                  (mind, --t-label + mark)
00:08                             (elapsed since job.createdAt, tabular)
“A heavy mechanical crocodile …”  (the prompt, Inter, muted, max 52ch)
writing its mind                  (server stage, lower-case, --t-small, muted; changes with stageCode)
```

No percentages. After 4 minutes add `Taking longer than usual — still
working.` After a second attempt (`job.attempts > 1`): `First attempt failed —
trying again (free).` Poll `GET /api/job/:id` every 1.5 s.

Phase B — reveal (job `done`): deliberately delayed. Sequence, each beat
awaits the previous:

1. `SIGNAL ACQUIRED` fades in (600 ms), orbit collapses to a point.
2. Portrait canvas appears as a **silhouette** (`portrait.silhouette(true)`), 700 ms.
3. A scan line sweeps top→bottom over the canvas (CSS), the silhouette turns
   into wireframe (`portrait.wire(true)`) then materialises
   (`wire(false); silhouette(false)`), 900 ms.
4. Name types in letter by letter (`--t-hero`), 500 ms.
5. `MIND · GEMINI 3.7 FLASH` fades in, 300 ms.
6. Three ability tiles appear left→right with their names, 3 × 200 ms.
7. Hold 1.2 s, then the whole card cross-fades into LIVE with
   `store.live.phase = 'searching'` (`go('/live')`). No confirmation button.

Failure (job `failed`): `IT DID NOT TAKE SHAPE` + the English reason + two
buttons `TRY AGAIN` (→ `/create`, draft restored) and `WATCH THE ARENA`
(→ `/live`). If `error` is one of `OUR_FAULT` codes add `This one is on us —
your daily allowance is untouched.`

### 6.5 CREATURE (`screens/creature.js`)

Two columns on the backdrop (stack under 900 px):

- Left 56 %: the **portrait** (`ui/portrait.js`, slow turn, own light rig)
  in a soft radial glow, min-height 60 vh. If the body cannot load, a large
  procedural silhouette from the creature's id.
- Right: name (`--t-hero`), line `GENERATION 01 · MIND ·` + mind badge;
  three **stat tiles** (`1,214 RATING ▲24` / `19 – 11 RECORD` / `#782 RANK`,
  win rate under record) as small glass tiles; **ABILITIES** row of three
  tiles (64 px) with names and tooltips; `CREATED FROM` + the prompt as a
  quotation; `HOW IT FIGHTS` + tactics card paragraph (only if `latinOnly`);
  birth note (if any) as a warning line; `unfit` phrases (`Not in the grammar:
  …`) as a muted line.
- If this is mine and I have more than one creature: a **GENERATIONS** strip
  under the name (chips `01 · 02 · 03`, retired ones dimmed) switching the view.
- Bottom-right ghost actions: `WATCH LIVE →` (mine) · `HISTORY →`.
- A visitor with no creature at `#/creature`: empty state `No creature yet` +
  `CREATE A CREATURE →`.

### 6.6 HISTORY (`screens/history.js`)

- Header line (`--t-label` + numbers): `32 BATTLES · 19 WINS · BEST RATING
  1,412 · +241 MMR` (mmr = rating − 1200 start; best = `peak`).
- List grouped by day (`TODAY`, `YESTERDAY`, `3 SEP`): rows
  `W  NEEDLE-79  [mind mark]  +24  #739` — outcome glyph in a 24 px circle
  (W success / L accent / D muted), opponent name, opponent's mind mark,
  signed delta, rating after. Training rows get a `SPARRING` chip. Rows are
  buttons.
- `GET /api/creature/:id/history?limit=100`; `LOAD MORE` appends.
- Clicking a row opens `#/history/:matchId`: a right-side glass **detail
  panel** (420 px, slides in; full-screen on mobile): `VICTORY · +24`,
  both fighters with minds, duration, reason (English), the **beats** list
  (`0:04  Needle-79 opens with a frost bolt`) from `GET /api/match/:id`, and
  `WATCH REPLAY →` (→ `/watch/:id`). `Esc`/`×` closes to `#/history`.
- Empty state (no fights yet): `The first fight is coming` + countdown.

### 6.7 LADDER (`screens/ladder.js`)

Segmented control `CREATURES · MINDS · SEASON` at the top.

- CREATURES: **podium** — top three as wide glass cards (rank badge circle
  coloured gold/silver/bronze tints, name, mind, rating, record, win rate);
  then rows 4…N (`#`, name, mind mark + name, rating, record, win rate) with
  the player's own row highlighted if it is in the list; `SHOW MORE` loads
  `?top=100`. Under the table the "around me" window (`around`) when I am
  outside the shown list.
  **Sticky footer** (always visible when I have a creature):
  `↑ 37   #782   CROCODILE   1,214   [ VIEW ]` where `↑37` is the rank change
  since last visit if known (`localStorage('airena.rank.last')`), else the
  percentile `STRONGER THAN 73%`.
- MINDS: table from `GET /api/models` — mind (mark + name), creatures,
  fights, win rate, avg rating; if `smallSample`, a `--warning` notice:
  `Small sample — needs 200 creatures, has 62`.
- SEASON: `SEASON 01` state word, `ENDS IN 18D 04H`, prize board rows.

### 6.8 WORKER (`screens/worker.js`) and FATAL (`screens/fatal.js`)

Worker: same three steps as today, English, one glass card, the code in
`--t-state`. Fatal: full-screen sky ground, `THE ARENA IS UNREACHABLE` /
`YOUR BROWSER CANNOT DRAW THE ARENA`, one `RELOAD` button, plain words.

## 7. Shared components (owned by D — `ui/ability.js`, `ui/tooltip.js`,
`ui/mind.js`, `ui/portrait.js`, `ui/orbit.js`, `ui/icons.js`; `lib/format.js`
is the lead's)

Signatures are the contract; every screen imports these.

```js
// ui/tooltip.js — one floating element (#tip), 180 ms fade, flips above/below
export function attachTooltip(el, content /* () => ({title, body}) | {title, body} */)
export function hideTooltip()

// ui/ability.js
export function abilityTile({ creatureId, slot, ability, size = 56, label = false, side = null })
  // → <button class="ability" data-slot> with <img> (src /api/creature/:id/icon/:slot),
  //   onerror → procedural SVG; label under it if asked; tooltip attached
export function abilityFallbackSvg(ability /* {delivery, element} */, size) // → data: URI

// ui/mind.js
export function mindInfo(modelId) // → { name: 'Gemini 3.7 Flash', provider: 'Google', mode: 'quick'|'deep'|null, key: 'google' }
export function mindMark(modelId, size = 20) // → inline SVG monogram element (geometric, not a trademark)
export function mindBadge(modelId, { mode = true } = {}) // → <span class="mind"> mark + name (+ mode)

// ui/orbit.js — canvas animation: 3 elliptical orbits, 5 dots, a scanning ring
export function orbit(canvas, { mode = 'search', seed = 1, color = '#2E2E33' } = {}) // → { stop(), collapse() }

// ui/portrait.js — small three.js scene rendering one body
export async function portrait(container, { creatureId = null, bodyRef = null, size = 1 }, { turn = true } = {})
  // → { destroy(), silhouette(on), wire(on), canvas }

// ui/icons.js
export function icon(name, size = 16) // names: search close arrow-right arrow-left arrow-up chevron-down play expand check plus dot live creature history ladder
```

`mindInfo` mapping (input → name / provider):
`google/gemini-3.7-flash[:mode]` → Gemini 3.7 Flash / Google;
`z-ai/glm-5.3-flash[:mode]`, `z-ai/glm-5.3[:mode]` → GLM 5.3 (Flash) / Z.ai;
`sub:opus:*`, `opus` → Claude Opus / Anthropic; `sub:fable:*`, `fable` →
Claude Fable / Anthropic; `sub:sonnet:*`, `sonnet` → Claude Sonnet;
`haiku` → Claude Haiku; `kit-stub`, `рукописный эталон`, anything with
"stub"/"reference" → Airena Reference / Airena; unknown → last path segment,
title-cased. Mode: `:plain` → quick, `:think`/`:high` → deep.

### 7.6 `latinOnly(s)` (`lib/format.js`)

Returns `s` if it contains no Cyrillic (`/[Ѐ-ӿ]/`), else `''`.
Screens use it on every string that may come from legacy data: tactics card,
birth note, unfit phrases, feed quips.

## 8. Server contract (owned by A — `src/server/api.js`, `creatures.js`,
`db.js`, new `src/server/forge/icons.js`, new `src/skills/describe.js`,
`tools/seedicons.mjs`)

### 8.1 `/api/session` additions

```
creature: card(...) + { rank, generation }
creatures: [{ id, name, generation, state, rating, createdAt }]   // all mine, newest first
world: { creatures /* active, non-library */, matchesToday }
season: { n, endsAt, prizeCoins }
```

### 8.2 `card()` additions (every creature payload)

```
generation: 1-based index among the owner's creatures by created_at
icons: [url|null, url|null, url|null]   // '/api/creature/<id>/icon/<slot>' when stored
abilities: [ { slot: 0, key: 'k1', name: 'EMBER BEAM', delivery: 'beam', effects: ['damage'],
               channel: null, element: 'ember', blurb: 'A straight beam that stops at the first
               obstacle. Deals 26 damage.' }, … ]
```

### 8.3 Ability naming — `src/skills/describe.js` (English, deterministic)

`name = ELEMENT_WORD[element] + ' ' + DELIVERY_WORD[delivery]`:

```
elements: kinetic KINETIC · ember EMBER · frost FROST · arc ARC · void VOID ·
          gravity GRAVITY · acid ACID · radiation RAD · laser LASER
deliveries: beam BEAM · cone FAN · bolt BOLT · lob MORTAR · zone FIELD ·
            dash LUNGE · blink BLINK · self AURA · jump LEAP
effects: damage Damage 26 · burn Burn 7/s for 4 s · knock Knockback · pull Pull ·
         stun Stun · root Root · shield Shield 40 · heal Heal 26 · cleanse Cleanse ·
         blind Blind · silence Silence · wall Wall · boost Boost ×1.35 · weaken Weaken ×0.7
channels: speed Speed · turn Turning · damage Damage · armor Armour · cooldown Cooldown ·
          range Range · vision Vision  (blurb suffix: "Channelled through <x>.")
```

`blurb` = delivery doc sentence (English, from the registry `doc` after §9) +
effect sentence(s) + optional channel sentence. `describeAbility(skill)` →
`{ name, blurb, …}`; `abilitiesOf(kitArray)` → array with `slot`/`key`.
`live.js` needs the same for both fighters: the `match` socket message gets
`abilities: { blue: [...], orange: [...] }` (A edits `live.js sendMatch` —
this is a data field, not rendering).

### 8.4 Icons — `src/server/forge/icons.js`

- Provider: fal.ai, model `fal-ai/flux/schnell`, sync endpoint
  `POST https://fal.run/fal-ai/flux/schnell`, header `Authorization: Key
  ${FAL_KEY}`, body `{ prompt, image_size: 'square', num_images: 1,
  num_inference_steps: 4, enable_safety_checker: false, seed }` → download
  `images[0].url` (jpeg, 512²). Env `FAL_KEY` (already in `.env`; add to
  `.env.example` with a comment). Without a key: no-op, icons stay null.
- Prompt template: `Flat minimalist game ability icon: a single centred
  glyph representing <name in words>, <delivery doc>, <effects>. Thin black
  monoline strokes on a pure white background, geometric, symmetrical,
  vector style, no text, no letters, no frame, no shading, no background
  objects.` Seed = FNV hash of `creatureId:slot` (reproducible).
- Storage: new table `icon (creature_id TEXT, slot INTEGER, mime TEXT,
  bytes BLOB, prompt TEXT, created_at INTEGER, PRIMARY KEY (creature_id, slot))`
  via a new `MIGRATIONS` entry in `db.js`.
- `ensureIcons(db, creatureId, { force = false })` — generates missing slots,
  concurrency 2 across the process, one retry, never throws (logs).
  Hooks: after `createCreature` in `jobs.js` (fire-and-forget); after
  `POST /api/creature/:id/kit` (force); lazily on `GET /api/creature/:id`
  and on `GET /api/session` when icons are missing and a key exists
  (debounced per creature, at most one in-flight).
- `GET /api/creature/:id/icon/:slot` → the blob with
  `cache-control: public, max-age=86400, immutable`; 404 if missing.
- `tools/seedicons.mjs [--all | --id=<id>] [--force]` — backfill; prints
  per-creature results. Run it on the local DB for the 62 active creatures
  so screenshots are real.
- `tools/anglicize.mjs` — renames legacy Russian creature names in the local
  DB from a JSON map (the agent writes the map with sensible English names,
  e.g. ЛЕДОКОЛ → ICEBREAKER, КАМЕННЫЙ ГОЛЕМ → STONE GOLEM); idempotent;
  prints the mapping. This is data hygiene for the dev stand, not a product
  feature.

### 8.5 `/api/catalog` shape (A) consumed by Create (C)

```
bundles: [{ id, model: 'google/gemini-3.7-flash', name: 'Gemini 3.7 Flash', provider: 'Google',
            mode: 'quick'|'deep', tier, featured: bool, waitSecs: number|null,
            available: bool, unavailableReason: string|null /* English */ }]
```

`featured` = the fastest available bundle per model family, at most 5.
Labels and reasons in English.

### 8.6 Everything else stays

`/api/ladder`, `/api/models`, `/api/match/:id`, `/api/creature/:id/history`,
`/api/job/:id`, `/api/starters`, worker endpoints: unchanged shapes, English
strings.

## 9. English sweep (owned by H)

Translate every player-visible string produced by the server or the viewer,
and re-point the gates that pinned Russian text or the deleted files:

- `src/skills/registry.js`: the `ru`, `doc`, `read` and `silhouette` values →
  English (keep the key names; `ru` now holds the English label — rename to
  `label` only if the sweep can do it project-wide with the gates green).
- `src/server/jobs.js` `STAGE_RU` (keep the export name, English values, e.g.
  `parse: 'reading the description'`, `brain: 'writing its mind'`, `body:
  'drawing the body'`, `validate: 'two trial fights'`, `duel: 'sparring the
  new mind against the old, 200 fights'`, `card: 'writing how it fights'`,
  `done: 'ready'`).
- `src/server/limits.js` `DENY` texts, `src/server/api.js` `fail(...)`
  messages, `creatures.js` (`bodyLine`, `beatsFrom`, reasons), `adapt.js`,
  `live.js`, `http.js`, `app.js`, `session.js`, `forge/models.js` think labels
  (`quick` / `deep`), `forge/pipeline.js`: the instructions that shape
  player-visible model output — creature `name` (English, 2–22 chars,
  uppercase), `SAY_RU` → ask for **English** quips, tactics-card prompt →
  English, `unfit` phrases → English; `src/worker/worker.mjs` CLI messages.
- `src/viewer/main.js`: `SKILL_RU`, `MISS_RU`, `REASON_RU`, `sideName`
  (`BLUE`/`ORANGE`), byline texts, sudden-death line (`SUDDEN DEATH · the
  arena burns both, −0.2%/s`), `match #`, banner `VICTORY`/`DRAW`, feed
  lines (`x3`, `dodged the leap`, …), `#boot` text, connection lost line.
  Add the `latinOnly` guard in `setSay` so legacy Russian quips are not
  echoed to the feed. Nothing else in the file changes.
- Gates: `tools/checkscope.mjs` copy rules → English forbidden words
  (`token`, `kit`, `skill`, `LLM`, `API`, `$`, `price`); `tools/checkstages.mjs`
  reads `src/client/screens/birth.js`; `tools/checkfaults.mjs` reads
  `OUR_FAULT` from `birth.js`; `tools/checkgrammar.mjs` §7b (client atom
  dictionary) is removed (the client no longer holds a copy) and §8 points at
  the new `create.js`; `tools/checkidentity.mjs` still reads `app.js`,
  `lib/platform.js`, `screens/create.js` — keep those names; `checkcontrast`
  reads `src/client/ui/tokens.css`; `checkdocs` needs README's tools list
  updated for new tools (`shots`, `seedicons`, `anglicize`).
- `docs/SCREENS.md` §1 (the language rule) is rewritten: English only.

### 9.1 Glossary — one word per thing, everywhere a player reads it

The product counts three things, and until this pass it had seven nouns for
them. These are the words. A screen, a server message, a viewer string, a feed
line and a tooltip that name the same object name it the same way; anything
else reads as several writers sharing one product.

| Thing | The word | Never | Where it is read |
|---|---|---|---|
| One bout between two creatures | **fight** (`Fight #16013462`, `Arena · fight #…`, `7,157 fights`, `18 fights · 11 wins`, `The first fight is coming`, `Next fight in 8`) | *match*, *battle*, *bout*, *duel* | live phase subline and result card, history header and rows, ladder columns, `/api/match/:id` errors |
| Making one creature (the daily allowance) | **generation** (`Today’s generations are used up.`, `This attempt used one of today’s generations.`, `Generation 02`, `There is no such generation.`) | *creation*, *attempt* (as a countable noun), *birth* (as a countable noun) | create deny lines, birth footnote, creature generations strip, `limits.js` `DENY`, `/api/job/:id` errors |
| Creatures made by players, as opposed to house creatures | **player creatures** (`62 creatures · 36 player creatures · Season 01`, `Player creatures`, `Only player creatures take prizes.`) | *from players*, *user creatures*, *real creatures* | ladder subhead, season tiles, prize-board footnotes |

Two words stay as they are because they name something else:

- **Match found** — the matchmaking *event* in the live feed, not the bout. It
  is the moment an opponent is picked; the thing that follows it is a fight.
- **Battles** — only inside the wordmark tagline `LIVING MACHINES / ENDLESS
  BATTLES` and the document title, which are brand copy from the reference.
  Nothing that counts uses it.

Why a fight ended — four codes from `src/core/sim.js`, one wording, shared by
the viewer banner (`REASON` in `src/viewer/main.js`) and the History detail
(`REASON` in `src/client/screens/history.js`). The two copies are kept
character for character; the viewer is its own page and cannot import the
client's module.

```
kill          knocked out
timeout       time ran out, more health left
timeout-draw  time ran out, health even
double-ko     both went down at once
```

An ability has exactly **one** name, `ELEMENT + DELIVERY` (§8.3): `EMBER BEAM`.
The reveal, the creature page, the History beats, the tooltip and the HUD tile
all say it — the tile stacks it on two lines (`white-space: pre-line`, §5.3)
rather than dropping the element word. The `· STUN` tie-breaker a kit with two
identical shapes needs is a quieter third line on the tile and a suffix in the
tooltip; it is never the name on its own.

## 10. Screenshot states (owned by G — `tools/shots.mjs`)

`node tools/shots.mjs --base=http://localhost:8787 --out=reports/screens/ui`
launches headless Chrome (`tools/vfxchrome.mjs` `launchChrome`) and captures,
at each of the three widths §12 accepts the product at — 1440×900
(`<state>.png`), 1280×720 (`<state>-w.png`) and 390×844 (`<state>-m.png`):

```
live-fighting        #/live                      (whatever is live)
live-searching       #/live?ui=searching
live-vs              #/live?ui=vs
live-result-win      #/live?ui=result-win
live-result-loss     #/live?ui=result-loss
live-away            #/live?ui=away
create               #/create
create-picker        #/create?ui=picker
birth-wait           #/birth/demo?ui=birth-wait
birth-reveal         #/birth/demo?ui=birth-reveal
creature             #/creature
history              #/history
history-detail       #/history?ui=detail
ladder               #/ladder
ladder-minds         #/ladder/minds
worker               #/worker
```

`?ui=<state>` is read once by `app.js` into `store.debug` (string). Screens
honour it by rendering the named state with **plausible fake data** (names
like NEEDLE-79, ratings, deltas) and freezing timers, so a capture is
deterministic. Debug states never persist anything.

## 11. File map and ownership

```
src/client/
  index.html                      lead
  app.js                          lead (router, store wiring, chrome, socket → store, debug)
  lib/api.js lib/platform.js      keep (English comments not required)
  lib/dom.js                      lead (h, mount, clear, $ — trimmed)
  lib/store.js lib/format.js      lead
  ui/tokens.css ui/base.css ui/components.css ui/chrome.css   lead
  ui/hud.css                      B
  ui/screens/live.css create.css birth.css creature.css history.css ladder.css worker.css   owner of the screen
  ui/tooltip.js ui/ability.js ui/mind.js ui/mindpicker.js ui/portrait.js ui/orbit.js ui/icons.js   D (mindpicker: C)
  screens/live.js                 B
  screens/create.js screens/birth.js   C
  screens/creature.js             D
  screens/history.js              E
  screens/ladder.js               F
  screens/worker.js screens/fatal.js   G
  fonts/ img/                     lead
src/server/…                      A (fields, icons), H (strings)
src/viewer/main.js                H (strings) + B (the one dataset hook)
tools/shots.mjs                   G
tools/seedicons.mjs tools/anglicize.mjs   A
docs/REDESIGN.md                  lead
```

Deleted: `screens/arena.js`, `wait.js`, `result.js`, `tactics.js`, `watch.js`,
`kit.js`, `ui/frames.js`, `ui/worn.js`, `ui/glyph.js`, `ui/app.css`,
`ui/kit.css`, `src/viewer/hud-skin.js` (the worn-frame skin), old fonts.

## 12. Acceptance

- Every state in §10 captured, no console errors, no overlapping text at
  1440×900 / 1280×720 / 390×844.
- `npm test` green (all gates in `tools/suite.mjs`).
- `node tools/build.mjs` produces a working `dist/`.
- Reviewers (visual fidelity vs. references, spec compliance, UX intuitiveness
  and engagement, code quality, responsiveness/accessibility) each score
  ≥ 70 / 100.
