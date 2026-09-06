# Airena — design contract & build plan

The game is published on GENEX. This file is durable memory: what was asked,
what is being built now, what is still owed.

## Requested outcome (only the player changes it)

**A complete UI/UX redesign** (05.09.2026): every screen, colour, layout and
the client's business logic rebuilt from scratch against the founder's UX
direction and two reference images (a light, airy, glass-surfaced world; the
creature at the centre; LIVE · CREATURE · HISTORY · LADDER). The battle
rendering itself stays. Creature abilities are shown as generated icons with
tooltips, not as text. **Everything a player sees is English.**

The binding contract for the redesign is `docs/REDESIGN.md`. This file only
records decisions and status.

## Working mode

`redesign — delivered; arena world and ownership colour delivered; polish continues by decision, not by loop`

## Decisions

- **D176. The contract lives in one document.** `docs/REDESIGN.md` fixes the
  palette, type, layout, screen states, component signatures and the server
  fields; screens are built against it, not against each other.
- **D177. English only, no exceptions a player can see.** Server responses,
  stage names, deny reasons, the viewer's HUD strings, generated names, quips
  and tactics cards are English. Legacy rows may still carry Russian text; the
  client hides such strings (`latinOnly`) rather than show them. Legacy
  creature names were renamed in the databases (`tools/anglicize.mjs`).
- **D178. The battle is untouched; its environment is not.** `src/viewer/main.js`
  keeps camera, bodies, VFX and simulation. Its text was translated, one
  `data-cd` hook was added for the cooldown tiles, and the scene's night sky
  became the interface's sky tone — a dark band under a light interface was a
  leftover of the old theme, not a battle decision.
- **D179. The mind is identity, not infrastructure.** Models are shown as the
  creature's mind (provider mark + name, `quick`/`deep`), never as tokens,
  prices, temperatures or provider ids. `tools/checkscope.mjs` forbids that
  vocabulary in the player bundle.
- **D180. Ability icons are generated once and stored.** fal.ai `flux/schnell`
  draws a black-on-white monoline glyph per ability slot; the bytes live in the
  `icon` table and are served from `/api/creature/:id/icon/:slot`. Missing
  icons fall back to a procedural SVG so text never stands in for an icon.
  Names are deterministic (`ELEMENT + DELIVERY`, `src/skills/describe.js`).
- **D181. The viewer's canvas sits under every layer.** It is appended to
  `<body>`; `body > canvas { z-index: -1 }` and a transparent `#arena` keep it
  visible. The HUD is hidden and the viewer pauses under document screens
  (`#screen.doc`).
- **D182. Parallel agents never own the same file, and never own the machine.**
  The first build fan-out (eight agents, each with its own server and headless
  Chrome) exhausted 16 GB of RAM. Agents may run wide (nine reviewers, twelve
  fixers at once) because agents are cheap; browsers are not: agents never
  start servers, and every capture goes through `tools/shots.mjs` /
  `tools/arenashot.mjs`, which hold one machine-wide Chrome lock.
- **D184. Colour is ownership.** Blue is always the player's creature and
  orange always the opponent — on floor telegraphs, rings, plates, damage
  numbers, feed, panels, VS and result cards — and the player's panel is on
  the left, whatever slot the server assigned. Spectators keep slot colours.
  Supersedes REDESIGN.md §2.1's "colours never change with ownership"
  (founder, 06.09; `reports/arena/ARENA-AAA.md` §1).
- **D185. A quiet field in an AAA world.** The field keeps the brief's
  restraint; everything beyond it — full tiers, a deck ring with banners, a
  far pavilion, tower silhouettes in haze, planet and moon, mist, light
  shafts, dust — is built to the concept `reports/arena/aaa/a2.jpg` (with
  `a1.jpg` for the far layer). The renderer owns the picture: the HUD draws no
  full-viewport veil under any beat (founder, 06.09; ARENA-AAA.md §2).
- **D183. The standing is RATING.** One noun for one number, on tiles,
  columns, deltas and the chip alike; `tools/checkscope.mjs` §9.1 rejects MMR
  in player copy. Chosen because it is the word on the UI kit's tile and the
  word a person outside competitive games can read.

## Build plan & status

1. ✅ Contract (`docs/REDESIGN.md`), shell (`index.html`, `app.js`, store,
   tokens, base, components, chrome), fonts (Space Grotesk, Inter), the
   placeholder arena backdrop (`src/client/img/arena.jpg`, generated).
2. ✅ Screens: live (phases, VS, result, away recap, replay), create + mind
   picker, birth (waiting → reveal), creature (3D portrait), history + match
   detail, ladder (creatures · minds · season), worker, fatal.
3. ✅ Server: `rank`, `generation`, `creatures`, `world` in the session;
   `abilities` and `icons` on every creature card and on the `match`
   message; catalog as minds; icon generation, storage and backfill.
4. ✅ English sweep of server, pipeline prompts, viewer HUD strings; gates
   re-pointed (`checkstages`, `checkfaults`, `checkgrammar`, `checkcontrast`,
   `checkscope`, `checkprices`, `checkmodels`, `checkbody`, `checkselectors`).
5. ✅ `node tools/shots.mjs` captures every state (40 captures, clean console).
6. ✅ Review loop to 70: six lenses, two rounds — visual 72 · UX 78 · spec 85 ·
   copy 79 · code 78 · responsive 73.
7. ⏳ Review loop to 90: nine lenses (plus motion, combat legibility, first
   hour), four rounds, every area fixed in parallel. Plateau in the 72–85 band
   (round 4: visual 75 · UX 72 · spec 82 · motion 79 · copy 78 · responsive 82
   · combat 78 · code 72 · first hour 72). The lead then settled the churn by
   hand: vocabulary is RATING (never MMR) everywhere and the scope gate
   enforces it; generated ability glyphs are forced to ink-on-white; a
   generated body that throws at shader time is quarantined to the stock body
   once per match so the arena never blanks; the two first-fight fixtures
   exist. The remaining distance to 90 is mostly the arena picture — item 8.
8. ⏳ Arena redesign (founder, 06.09): four concept renders reviewed by five
   Fable lenses (`reports/arena/CONCEPT-VERDICTS.md`), one build brief
   (`reports/arena/ARENA-BRIEF.md`: "c1's place with c4's discipline") plus
   the founder's final-image requirements (`reports/arena/RENDER-QUALITY.md`).
   Built as `src/viewer/environment.js` on a stand page
   (`src/viewer/arena.html`, `tools/arenashot.mjs`), reviewed by six lenses,
   ported into `src/viewer/main.js` (`reports/arena/PORT-NOTES.md`): sunken
   field, plain cover, coping, notch, full post graph (GTAO, denoise, ACES,
   SMAA), quality tiers (chosen at boot, persisted), an establishing camera
   for the VS and result beats, ownership colour (D184) and the AAA world
   (D185): full tiers, deck ring with banners, pavilion, tower silhouettes,
   planet and moon, mist. Three Opus rounds on the arena: last scores
   engineering 78 · design 75 · ownership 69 · combat 69 · picture 68 ·
   world 58 (the lenses' bars moved every round; the lead stopped the loop
   at diminishing returns). Full gate suite green, build green, 105 UI
   states captured with a clean console.

## What a next pass should decide, not loop on

- **The stadium as a bowl, not a box** (curved tiers) — the single change the
  world lens keeps asking for; a geometry decision for `environment.js`.
- **Value structure of the world**: the picture lives in a 24 L window;
  deeper deck underside and haze bands would give it depth without objects.
- **The VS beat on phones**: one creature or two under the card.
- **A body that throws at shader time** (`.abs` on an undefined node in a
  generated body): now quarantined at runtime; refusing it at forge
  acceptance belongs to `src/server/forge/body.js`.
- **`src/viewer/main.js` has grown to ~7,300 lines** through agent rounds;
  a consolidation pass (governor, eviction, beats, marks) is due before the
  next feature.

## Open commitments

- **Production server not updated.** The backend at `207.154.234.71` still runs
  the old code and database; the icon migration (`user_version` 12) and
  `tools/anglicize.mjs` must run there on deploy.
- **The key in git history** (see earlier entries) is still the founder's
  action: rotate at openrouter.ai.
- Legacy brains still quip in Russian inside their source; the feed hides
  those quips. New creatures are asked for English.
- The arena backdrop is a placeholder image to be swapped for the real arena
  render when one exists.
