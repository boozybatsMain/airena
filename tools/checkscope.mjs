/**
 * The scope, enforced by code — the gate for E6, N1, N7, N8, F4 and, since the
 * redesign, for the words the product is allowed to use.
 *
 * §4.4 is a table of twenty bans, and every one of them is an attractive idea
 * the codebase drifts towards on its own. A ban nobody checks lasts exactly
 * until the first agent who "just added a button" — not out of malice, but
 * because the button looked right and the table was in another file.
 *
 * What is read is the CLIENT BUNDLE: what a player actually downloads. The
 * server is entitled to know what a bundle costs — it budgets against that
 * (E3). The player is entitled to see none of it, because E6 says "no SKU, no
 * prices, no subscription, no catalogue, no checkout", a placeholder included.
 * The server files that WRITE copy are read too (see `SERVER_COPY`), because
 * half of what a player reads is written there.
 *
 * The prose in this file is in two languages and the split is deliberate: the
 * paragraphs recording what the ban rules cost when they were absent were
 * written before the English sweep and are the tree's own history, while every
 * line the gate PRINTS, and everything written since, is English. The Russian
 * alternatives inside the patterns are load-bearing — they are what catches
 * Russian copy in the source.
 *
 *   node tools/checkscope.mjs
 *   node tools/checkscope.mjs --verbose
 */

import { readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

/**
 * WHAT IS READ IS THE REAL BUNDLE, NOT A FOLDER.
 *
 * "The src/viewer folder" is the wrong definition: it also holds the dev panel
 * and the dev page, which are not in the product. "The src/client folder" is
 * wrong from the other side: the product loads `main.js` out of the viewer,
 * and the ban has to reach in there. So the walk starts at the player's page
 * and follows the real references — what the browser will actually fetch.
 */
const ENTRY = 'src/client/index.html';
const EXT = new Set(['.js', '.mjs', '.html', '.css']);

/** Where paths of the form `/viewer/main.js`, `/ui/kit.css` land on disk. */
const MOUNTS = [
  ['/viewer/', 'src/viewer'],
  ['/skills/', 'src/skills'],
  ['/vendor/', 'node_modules/three/build'],
  ['/vendor-addons/', 'node_modules/three/examples/jsm'],
  ['/vendor-genex/', 'node_modules/@genex-ai/embed-sdk/dist'],
  ['/bodies/', 'bodies'],
  ['/assets/', 'preview/assets'],
  ['/fonts/', 'src/client/fonts'],
  ['/', 'src/client'],
];

/**
 * The references the browser will follow: imports, script src, link href.
 *
 * A dynamic import is caught TOGETHER with its template literal: the product
 * loads the viewer as `import(\`/viewer/main.js${'$'}{v}\`)`, with the build stamp
 * on the end, and a pattern demanding a clean string skipped precisely the file
 * the gate walks into the viewer for. What is taken is the static PREFIX up to
 * the first substitution: the path is in it, and the substitution is a version.
 */
const LINK = /(?:from\s*['"`]([^'"`]+)['"`])|(?:import\s*\(\s*[`'"]([^`'"]*?)(?:\$\{[^}]*\})?[`'"])|(?:\bsrc\s*=\s*"([^"]+)")|(?:\bhref\s*=\s*"([^"]+)")|(?:@import\s+url\(([^)]+)\))/g;

function resolveRef(ref, fromFile) {
  const clean = ref.split('?')[0].split('#')[0];
  if (!clean || /^(https?:|data:|mailto:)/.test(clean)) return null;
  if (clean.startsWith('/')) {
    for (const [prefix, dir] of MOUNTS) {
      if (!clean.startsWith(prefix)) continue;
      return join(ROOT, dir, clean.slice(prefix.length));
    }
    return null;
  }
  return resolve(dirname(fromFile), clean);
}

/** The walk from the player's page. Vendor modules are not read: not ours. */
function bundle() {
  const seen = new Set();
  const queue = [join(ROOT, ENTRY)];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f) || !EXT.has(extname(f))) continue;
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    seen.add(f);
    if (relative(ROOT, f).startsWith('node_modules')) continue;
    for (const m of text.matchAll(LINK)) {
      const ref = m[1] || m[2] || m[3] || m[4] || m[5];
      const next = resolveRef(String(ref || '').replace(/['"]/g, ''), f);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen].filter((f) => !relative(ROOT, f).startsWith('node_modules'));
}

/**
 * The bans. `why` names the clause of the spec; `allow` names the contexts in
 * which a match is legitimate (the word "price", say, inside a comment about
 * why there is no price).
 */
const RULES = [
  /*
   * ── AND THESE THREE WENT GREEN WHEN THE LANGUAGE CHANGED ──────────────────
   *
   * The next three patterns were written against a Russian product and were
   * left alone by the English sweep, which is the same failure as §9.1's
   * `match #`: a rule that catches nothing because the thing it was watching
   * for is now spelled another way. `купить` was banned and `Buy` was not;
   * `ставка` was banned and `place a bet` was not; `скин` was banned and
   * `skin pack` was not. Every one of the twenty bans in §4.4 is an idea the
   * codebase drifts towards on its own, and after the sweep three of them had
   * nothing standing in the way.
   *
   * The English half is deliberately narrower than the Russian half, because
   * these rules read RAW TEXT and this repository is full of English words
   * that are not copy: `skin` is a skinned mesh, `odds` is a probability in a
   * simulation comment, `price` is the body grammar's own arithmetic (§8.3 of
   * SPEC), and `subscription` is the worker feature — a colleague lending
   * theirs is the product, not a purchase. So the English side names the
   * SHAPES a purchase takes and not the nouns it is built from.
   */
  {
    id: 'E6/N1 a price',
    why: 'E6: no SKU, no prices, no checkout. N1: no “buy” affordance of any kind',
    re: /\$\s?\d|\d+\s?(?:руб|USD|EUR)\b|\bцена\b|\bстоимость\b|\bоплат|\bкупить\b|\bпокупк|\bчекаут|\bкорзин|\bподписк|\bприобрест|\bbuy\s+(?:now|it|this|more|credits?|coins?)\b|\bpurchase|\badd to (?:cart|basket)\b|\bshopping cart\b|\bpaywall\b|\bupgrade to (?:pro|premium|plus)\b|\bper month\b|\bfree trial\b/giu,
  },
  {
    id: 'E6 a payment SDK',
    why: 'E6: no payment rail is built',
    re: /\bcommerce\s*\.\s*(?:buy|getShop|consumeEntitlement)|\bstripe\b|\bstorekit\b|\bplayBilling\b|\bcheckout\b/gi,
  },
  {
    id: 'N2 betting',
    why: 'N2: no betting, no odds, no bankroll — no wagering on an outcome',
    re: /\bставк[аиуе]\b|\bпоставить на\b|\bтотализатор|\bкоэффициент[ыа]?\s+на\b|\bplace (?:a )?bets?\b|\bbet on\b|\bbetting\b|\bwagers?\b|\bbankroll\b|\bpayout odds\b/giu,
  },
  {
    id: 'N8 sound',
    why: 'N8: v1 has no sound',
    re: /new\s+Audio\b|\bAudioContext\b|\.play\(\)\s*;|\bnew\s+Howl\b/g,
  },
  {
    id: 'N7 cosmetics',
    why: 'N7: no skins, palettes, portraits or banners sold as goods',
    re: /\bскин[ыаоу]?\b|\bкосметик|\bcosmetics?\b|\bskin (?:shop|store|pack|bundle)\b|\bbanner pack\b/giu,
  },
  {
    id: 'F11/N19 a path to a brain',
    why: 'F11: a player’s brain source never leaves the server; N19 names every path',
    re: /brain_?[Ss]ource|\/api\/source\//g,
  },
  {
    id: 'A6 a forbidden affordance',
    why: 'A6: no window.open, alert, confirm, forms or client-side downloads',
    re: /\bwindow\.open\s*\(|(?<![\w.])alert\s*\(|(?<![\w.])confirm\s*\(|<form\b|\bdownload\b\s*=/gi,
  },
  /*
   * ── COPY RULES: what the player is allowed to read ───────────────────────
   *
   * These three run over STRING LITERALS, not over raw lines, and they run on
   * both surfaces (bundle and SERVER_COPY). `token`, `kit`, `skill` and `api`
   * are legitimate — necessary — identifiers, keys, route segments and module
   * specifiers all over this codebase; the ban in docs/REDESIGN.md §1.4 is on
   * the words a PLAYER READS. A rule keyed on raw text cannot tell the two
   * apart and would either scream on every `import … from './lib/api.js'` or,
   * as the Russian-only rules it replaces did, pass while the product shipped
   * the words in English. `literals()` below does the telling: it drops
   * comments and regex bodies, empties out `${…}` (an interpolated
   * `skill.delivery` is code, not copy), and `isCode()` drops paths, CSS
   * selectors and bare lowercase keys such as `kit-stub`.
   */
  {
    id: 'F4/D21 words in copy',
    why: '§1.4: the player never reads token, kit, skill, model, LLM, API or a price — the words are abilities, minds, allowance',
    /*
     * `model` joined this list after it was measured coming back: the worker
     * screen shipped "The model stays yours" and "lending the game their own
     * model" through a green gate, because the list named every playground
     * word except the one §1.4 spends a whole sentence on ("Model identity is
     * shown as the creature's *mind*"). A ban nobody checks lasts until the
     * next agent who writes the obvious sentence.
     */
    lit: /\b(?:tokens?|kits?|skills?|models?|LLMs?|APIs?|prices?|pricing)\b/i,
    /*
     * Named exemptions, each one narrow enough that rewording the string it
     * covers brings the rule straight back:
     *   · the viewer's own self-test, read by a developer with the console
     *     open and by nobody else (`src/viewer/main.js`);
     *   · `api.say()`, the name of a function the MODEL writes against in the
     *     brain-authoring prompt — the player is not in that conversation;
     *   · the body grammar's cost formula, which is arithmetic in points.
     *     §1.4 bans money in front of the player, not the grammar's sums.
     */
    /*
     *   · `--model`, an argv flag of the `claude` CLI the worker spawns. It is
     *     the vendor's flag name, not a word anyone reads: the worker prints
     *     the mind's NAME and never this.
     */
    allow: /^drawn towards .*skill goes to|\bapi\.(?:say|use|move|face|ready)\(|\bprice = \(|^--model$/,
    /*
     * A model prompt is not interface copy. Three thousand characters over
     * fifty lines is an instruction to a model; a line of UI copy is a phrase.
     * Without this the rule reports the grammar's own vocabulary back at us
     * forever and someone eventually deletes the rule instead of the word.
     */
    notCopy: (s) => s.length > 240 && s.split('\n').length > 4,
  },
  {
    id: 'E6/F4 money in copy',
    why: '§1.4 and E6: no dollars, no prices, no budgets in front of the player',
    lit: /\$\s?\d/,
  },
  {
    id: '§1.1 cyrillic in copy',
    why: '§1.1: every player-visible string is English — client, server, viewer HUD, worker CLI',
    lit: /[Ѐ-ӿ]/,
    /*
     * Only where §9 says player copy lives. The VFX grammar (`src/vfx/ir.js`)
     * and the body loader talk to the developer and to the model, never to the
     * player, and pulling them in would drown the rule that matters.
     */
    where: /^(?:src\/client\/|src\/server\/|src\/skills\/|src\/worker\/|src\/viewer\/main\.js)/,
    /* Not copy: the model id of the legacy reference brain, which `mindInfo`
       has to RECOGNISE to render it as "Airena Reference" (§7). */
    allow: /^рукописный эталон$/,
  },
  /*
   * §9.1 — ONE WORD PER THING.
   *
   * The product counts three things: a bout between two creatures, a making of
   * one creature out of the daily allowance, and the creatures players made as
   * opposed to the house's. Before §9.1 it had seven nouns for them, and the
   * cost was not pedantic: one frame of the live screen printed `ARENA · MATCH
   * #232998750` above the arena and `FIGHT #232998750` under the clock — the
   * same number under two words, which reads as two products sharing a screen.
   * The away recap counted `18 BATTLES` three lines above a link that said
   * `SEE THE FIGHTS`. The ladder subhead said `36 FROM PLAYERS` 150 px under a
   * chip that said `36 PLAYER CREATURES`.
   *
   * A glossary nobody checks is a preference, and every one of those strings
   * was written by someone who had read the glossary. This is the rule.
   *
   * ── AND THE PATTERN IS THE WORD, NOT THE SHAPE ────────────────────────────
   *
   * It used to be `match #` — the shape the bout is always written in — so that
   * `Match found`, the one use §9.1 keeps, would never be reported. That let
   * the whole rest of the noun through: `no such match`, `18 matches`, `watch
   * the match`, `the match is over`. A glossary rule that only catches the word
   * next to a hash is a rule about hashes.
   *
   * So the rule is the noun, and the two uses §9.1 keeps are named exemptions
   * instead — each narrow enough that a string drifting away from it comes
   * straight back into the rule:
   *
   *   · `Match found` — the matchmaking EVENT, not the bout that follows. The
   *     moment an opponent is picked; the thing after it is a fight.
   *   · the VERB, which §9.1 says nothing about and which the product needs:
   *     `The code did not match or has expired.` is the worker screen refusing
   *     a pairing code, and no glossary asks for `did not fight`. A lookbehind
   *     for the auxiliaries a verb follows (`did not`, `does not`, `must`,
   *     `to`) keeps the rule on the noun, where §9.1 put it.
   *   · `LIVING MACHINES / ENDLESS BATTLES` — the wordmark's tagline and the
   *     document `<title>`, brand copy lifted from the reference. It counts
   *     nothing, which is the whole test: every banned noun above counts
   *     something.
   *
   * The identifiers need no exemption and must not get one: `matchId`,
   * `matchMedia` and `m.matchId` carry a word character where `\b` needs a
   * boundary, so the noun never matches inside them. The rule reads copy; the
   * code goes on saying `match` for the row in the database, which is right —
   * `fight` is what a player reads, not what a column is called.
   *
   * ── AND THE FOURTH THING THE PRODUCT COUNTS ───────────────────────────────
   *
   * A creature's standing. §9.1 was written for the three nouns above and left
   * this one out, and the cost was the same defect one row further down: the
   * ladder set `RATING` at the head of a column of numbers and, three hundred
   * and eighty pixels below it, a sticky footer reading `1,531 MMR` for the
   * player's own figure in that same column. The career header wrote `BEST
   * RATING 1,864 · +337 MMR` — one sentence, one quantity, two nouns. The
   * chrome chip said `1,536 MMR` above a creature page whose stat tile said
   * `RATING`. Thirty-seven strings said MMR while six said Rating, and a
   * stranger had to work out that the two words name one number before any of
   * the numbers could mean anything.
   *
   * `RATING` wins because it is the word in the UI kit, the word already on
   * every tile and column header, and the word a person outside competitive
   * games can read. It is the noun for the standing AND the unit on a change to
   * it (`+24 RATING`): a delta is measured in the thing it moves, and inventing
   * a second word for the change was how the pair got in.
   *
   * The identifier is untouched, as with `match`: `ratingDrift`, `c.rating` and
   * the `mmr` column of a table are code. The rule reads copy.
   */
  {
    id: '§9.1 glossary',
    why: '§9.1: a bout is a fight, the daily allowance counts generations, creatures made by players are player creatures, and a creature\'s standing is its RATING — never MMR',
    lit: /(?<!\b(?:did|does|do|to|must|should|shall|will|would|can|could|may|might|not)\s)\bmatch(?:es)?\b|\bbattles?\b|\bbouts?\b|\bduels?\b|\bfrom players\b|\bcreations?\b|\bMMR\b/i,
    where: /^(?:src\/client\/|src\/server\/|src\/skills\/|src\/worker\/|src\/viewer\/main\.js)/,
    allow: /^match found\b|^(?:endless battles|AIRENA — living machines, endless battles)$/i,
  },
  /*
   * ONE DIALECT.
   *
   * The product writes colour, behaviour, metres and "Channelled"; a single
   * ability blurb said "Channelled through armor." A dialect slip is invisible
   * to whoever writes one string and unmistakable to whoever reads two, which
   * is every player who opens a creature page after a fight.
   *
   * Scoped to the two surfaces that hold player copy — the client bundle and
   * the ability grammar. A CSS property, a canvas `color` option and
   * `THREE.Color` are the platform's spelling, not ours, and `isCode()` cannot
   * tell a style string from a sentence.
   */
  {
    id: 'one dialect',
    why: 'player copy is British: colour, behaviour, armour, metres — never color, behavior, armor, meters',
    lit: /\b(?:armors?|colors?|behaviors?|meters?|centers?|centered|defense|offense|gray|honor|favorite|neighbor|maneuver)\b/i,
    where: /^(?:src\/client\/|src\/skills\/|src\/server\/|src\/worker\/|src\/viewer\/main\.js)/,
    /* Not copy: an inline-style selector and the `style="color:#…"` fragments
       the feed builds — the CSS property is spelled by CSS, not by us. */
    allow: /style\s*[*^$~|]?=|color\s*:\s*#|\bstyle="color/,
  },
];

/**
 * ── THE GATE'S OWN FIXTURES ────────────────────────────────────────────────
 *
 * Every one of these rules is a regex somebody will narrow. It is the cheapest
 * repair in the world — a string trips the gate, the string looks innocent, the
 * pattern grows a qualifier, the gate goes green — and the two times it has
 * happened here it cost a review round each. `F4/D21` was written without
 * `model` and shipped "The model stays yours". `§9.1` was written as `match #`
 * so that `Match found` would survive, and shipped every other use of the noun.
 *
 * Both are invisible in a passing run: a rule that catches nothing and a rule
 * that catches nothing BECAUSE IT CANNOT print the same green tick. So each
 * copy rule carries the strings it must catch and the strings it must let
 * through, and they are checked on every run, before the bundle is read. A
 * narrowed rule now fails the gate that narrowing was meant to quiet.
 *
 * The list is the defects as they actually shipped, not invented examples.
 */
const FIXTURES = [
  ['§9.1 glossary', 1, 'ARENA · MATCH #232998750'],
  ['§9.1 glossary', 1, '18 BATTLES'],
  ['§9.1 glossary', 1, 'There is no such match.'],
  ['§9.1 glossary', 1, 'Watch the match'],
  ['§9.1 glossary', 1, '36 FROM PLAYERS'],
  ['§9.1 glossary', 1, 'Today’s creations are used up.'],
  ['§9.1 glossary', 1, 'Replay this bout'],
  ['§9.1 glossary', 1, 'A duel is coming'],
  ['§9.1 glossary', 0, 'Match found · Needle-79'],
  ['§9.1 glossary', 0, 'Endless battles'],
  ['§9.1 glossary', 0, 'The code did not match or has expired.'],
  ['§9.1 glossary', 0, 'SELECT count(*) AS n FROM match WHERE ended_at >= ?'],
  ['§9.1 glossary', 0, 'ARENA · FIGHT #232998750'],
  ['§9.1 glossary', 0, 'Only player creatures take prizes.'],
  ['§9.1 glossary', 1, '1,531 MMR'],
  ['§9.1 glossary', 1, 'BEST RATING 1,864 · +337 MMR'],
  ['§9.1 glossary', 1, 'MMR gained'],
  ['§9.1 glossary', 0, '1,531 RATING'],
  ['§9.1 glossary', 0, 'Scanning 62 creatures near 1,586 rating'],
  ['F4/D21 words in copy', 1, 'The model stays yours'],
  ['F4/D21 words in copy', 1, 'Three skills, one kit'],
  ['F4/D21 words in copy', 0, 'CHOOSE ITS MIND'],
  ['F4/D21 words in copy', 0, 'Three abilities, one mind'],
  ['E6/F4 money in copy', 1, 'A generation costs $2'],
  ['E6/F4 money in copy', 0, 'Today’s generations are used up.'],
  ['§1.1 cyrillic in copy', 1, 'Бой окончен'],
  ['§1.1 cyrillic in copy', 0, 'The fight is over'],
  ['one dialect', 1, 'Channelled through armor.'],
  ['one dialect', 0, 'Channelled through armour.'],
  ['E6/N1 a price', 1, 'BUY MORE CREDITS'],
  ['E6/N1 a price', 1, 'Add to cart'],
  ['E6/N1 a price', 1, 'Upgrade to Pro'],
  ['E6/N1 a price', 0, 'Today’s generations are used up.'],
  ['E6/N1 a price', 0, 'const price = cost * scale;'],
  ['E6 a payment SDK', 1, 'stripe.checkout(session)'],
  ['N2 betting', 1, 'Place a bet on this fight'],
  ['N2 betting', 0, 'the odds of a draw are low'],
  ['N7 cosmetics', 1, 'A new skin pack is out'],
  ['N7 cosmetics', 0, 'new THREE.SkinnedMesh(geometry, material)'],
  ['N8 sound', 1, 'const ctx = new AudioContext();'],
  ['F11/N19 a path to a brain', 1, 'fetch("/api/source/u1/octopus")'],
  ['A6 a forbidden affordance', 1, 'window.open(url)'],
  ['A6 a forbidden affordance', 0, 'el.addEventListener("click", go)'],
];

/**
 * Does this one line break this rule? The one place that decides — the walk
 * below and the fixtures above ask it the same question, so a fixture cannot
 * pass a rule the bundle walk would have failed.
 *
 * The two kinds of rule are judged the way the walk judges them: a copy rule
 * reads a string literal and answers to its own `allow`; a raw rule reads a
 * line of source and answers to the shared `EXEMPT` list.
 */
function violates(rule, text) {
  if (rule.re) {
    rule.re.lastIndex = 0;
    return rule.re.test(text) && !EXEMPT.some((e) => e.test(text));
  }
  if (!rule.lit.test(text)) return false;
  if (isCode(text) && !/[Ѐ-ӿ]/.test(text)) return false;
  if (rule.allow?.test(text) || rule.notCopy?.(text)) return false;
  return true;
}

/**
 * The string literals of a source file: `{ text, line }`, comments and regex
 * bodies dropped, `${…}` blanked out.
 *
 * A quote-to-quote regex cannot do this. It pairs the closing quote of one
 * literal with the opening quote of the next (`{ who: 'A', skill: 'laser' }`
 * reads as the literal `', skill: '`), it walks into comments, and it cannot
 * see that the only `skill` in a template sits inside `${…}`. Measured on this
 * bundle the regex reported 130 matches, of which 3 were real.
 */
function literals(text, html = false) {
  if (html) text = text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  const out = [];
  const n = text.length;
  let i = 0, line = 1, prev = '';
  while (i < n) {
    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) { if (text[i] === '\n') line++; i++; }
      i += 2; continue;
    }
    /* A regex literal — `/['"`]/` inside this very file would otherwise open a
       string that never closes. Where a regex may start is the usual rule:
       after an operator or an opening bracket, never after a value. */
    if (c === '/' && /^[(,=:[!&|?{};+\-*%~^]?$/.test(prev)) {
      i++;
      let cls = false;
      while (i < n && text[i] !== '\n') {
        const d = text[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '[') cls = true;
        else if (d === ']') cls = false;
        else if (d === '/' && !cls) { i++; break; }
        i++;
      }
      prev = '/'; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c, at = line;
      let s = '';
      i++;
      while (i < n) {
        const d = text[i];
        if (d === '\\') { s += ' '; i += 2; continue; }
        if (q === '`' && d === '$' && text[i + 1] === '{') {
          let depth = 1;
          i += 2;
          while (i < n && depth) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') depth--;
            else if (text[i] === '\n') line++;
            i++;
          }
          s += ' '; continue;
        }
        if (d === q) { i++; break; }
        if (d === '\n') { line++; if (q !== '`') break; }
        s += d; i++;
      }
      out.push({ text: s, line: at });
      prev = 'x'; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

/**
 * A literal no player reads: a path, URL or module specifier, a CSS selector,
 * a SQL statement, or a bare lowercase key (`api`, `kit-stub`, `k1`, `laser`).
 * Copy is prose — capitals, spaces, punctuation — and none of the shapes below
 * survives a sentence. Whitespace is squeezed out first, because `${…}` left a
 * blank behind and `/api/creature/${id}/icon/${slot}` is still a path.
 *
 * The cost of the bare-key shape is that a one-word all-lowercase label would
 * slip through; the product has none — every label in §2.2 is uppercase or
 * sentence case.
 */
function isCode(s) {
  const c = s.replace(/\s+/g, '');
  const P = '[\\w.~@:%+?&=-]';
  if (new RegExp(`^${P}*(?:/${P}*)+$`).test(c)) return true;          // path, URL, specifier
  if (new RegExp(`^(?:url\\(["']?${P}*(?:/${P}*)*["']?\\),?)+$`).test(c)) return true;  // CSS url() value
  if (/^[.#[][\w.#[\]=~^$*|-]*$/.test(c)) return true;               // CSS selector, attribute
  /*
   * SQL IS CODE THAT HAPPENS TO BE SPELLED IN ENGLISH.
   *
   * `SELECT count(*) AS n FROM match WHERE ended_at >= ?` is a table name and
   * four keywords; a rule reading it as copy reports the schema at us forever,
   * and the schema is exactly where the product's nouns are allowed to differ
   * from the player's — the row is a `match`, the word a player reads is
   * *fight* (§9.1). Both halves are required so that a sentence opening with
   * one of these words ("Create a creature", "Set its mind") stays copy.
   */
  if (/^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE\s+(?:TABLE|INDEX|UNIQUE)|ALTER|DROP|PRAGMA|WITH|BEGIN|COMMIT)\b/i.test(s)
    && /\b(?:FROM|INTO|SET|TABLE|INDEX|VALUES|WHERE|JOIN)\b/i.test(s)) return true;
  /*
   * A BARE KEY IS ONE WORD, and the test has to be made on the string as
   * written, not on the squeezed one.
   *
   * Squeezing whitespace out first — needed by the three path shapes above,
   * where `${…}` left a blank behind — turned every lower-case sentence into a
   * key: `the mind did not come together even on the fallback model` squeezes
   * to `themindidnotcometogethereven…`, which is `^[a-z][a-z0-9_.:-]*$` to the
   * letter. That is not a corner case; it is the exact shape of the server's
   * refusal copy, and it is how `model` and a page of Russian-turned-English
   * fragments travelled to the player through a green gate. Whitespace, or a
   * blanked `${…}`, means prose.
   */
  if (/^[a-z][a-z0-9_.:-]*$/.test(s.trim())) return true;            // bare key
  return false;
}

/**
 * Lines that EXPLAIN a ban rather than break it. Only the rules that read raw
 * text use this — the copy rules read literals, where a comment cannot reach.
 *
 * The Russian alternatives stay: the ban comments written before the English
 * sweep are still in the tree, and a rule that starts reporting them would be
 * reporting the documentation of itself.
 */
const EXEMPT = [
  /^\s*[/*]/,                       // a comment
  /^\s*\*/,                         // the continuation of a block comment
  /\b(?:forbidden|never|not allowed|banned|no such thing)\b/i,
  /запрещ|нельзя|не строится|не показыва|не бывает|отсутств|N\d\b|E6\b|F4\b|F11\b|N19\b/iu,
];

/*
 * THE SECOND SURFACE: THE COPY THE SERVER WRITES.
 *
 * A gate that reads only the client misses half the copy a player sees: the
 * refusal messages, the names of the grammar's atoms and the stage captions
 * all arrive from the server and are read exactly the same way. Measured: two
 * refusal strings travelled from `src/skills/registry.js` into the browser
 * past a check that was formally green.
 *
 * Only the COPY rules are applied here. In server code `kit` and `skills` are
 * legitimate identifiers and are needed.
 *
 * `src/worker/worker.mjs` is here because the worker's CLI is read by a
 * player — a colleague lending their subscription — and docs/REDESIGN.md §9
 * names it in the English sweep. It is not reachable from the page, so the
 * bundle walk above never saw it and the gate was green over a Russian CLI.
 * `src/client/lib/api.js` needs no entry: the walk reaches it from `app.js`.
 */
const SERVER_COPY = ['src/skills/registry.js', 'src/server/api.js', 'src/server/limits.js',
  'src/server/jobs.js', 'src/server/forge/pipeline.js', 'src/server/adapt.js', 'src/server/creatures.js',
  'src/worker/worker.mjs'];
const COPY_RULES = new Set(RULES.filter((r) => r.lit).map((r) => r.id));

/* The fixtures first: a rule that cannot catch its own defect has nothing to
   say about the bundle behind it. */
const byId = new Map(RULES.map((r) => [r.id, r]));
const broken = [];
for (const [id, want, text] of FIXTURES) {
  const rule = byId.get(id);
  if (!rule) { broken.push(`no rule «${id}» — the fixture names a rule that was renamed or deleted`); continue; }
  const got = violates(rule, text) ? 1 : 0;
  if (got !== want) broken.push(`${id}: «${text}» — ${want ? 'must be caught and is not' : 'must pass and is caught'}`);
}
if (broken.length) {
  console.log('\n  THE GATE ITSELF IS WRONG — a rule no longer catches what it was written for:');
  for (const b of broken) console.log(`    ${b}`);
  console.log(`\n  ${broken.length} of ${FIXTURES.length} fixtures fail. Fix the rule, not the fixture.\n`);
  process.exit(1);
}

const FILES = bundle();

const hits = [];
for (const [surface, list] of [['bundle', FILES], ['server', SERVER_COPY.map((f) => join(ROOT, f))]]) {
  for (const f of list) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    const rel = relative(ROOT, f);
    const lines = text.split('\n');
    let lits = null;
    for (const rule of RULES) {
      if (surface === 'server' && !COPY_RULES.has(rule.id)) continue;
      /* Copy rules read literals; the rest read raw text. A literal carries no
         comment and no regex body, so the line-based EXEMPT does not apply to
         them — a rule's own `allow` is the only way past. */
      if (rule.lit) {
        if (rule.where && !rule.where.test(rel)) continue;
        lits ??= literals(text, extname(f) === '.html');
        for (const lit of lits) {
          if (!violates(rule, lit.text)) continue;
          hits.push({ file: rel, line: lit.line, rule, match: lit.text.split('\n')[0].slice(0, 70), text: (lines[lit.line - 1] || '').trim() });
        }
        continue;
      }
      rule.re.lastIndex = 0;
      for (const m of text.matchAll(rule.re)) {
        const before = text.slice(0, m.index);
        const ln = before.split('\n').length;
        const line = lines[ln - 1] || '';
        if (EXEMPT.some((e) => e.test(line))) continue;
        hits.push({ file: rel, line: ln, rule, match: m[0].trim(), text: line.trim() });
      }
    }
  }
}

console.log('\n  forbidden                     violations');
console.log('  ' + '─'.repeat(60));
for (const rule of RULES) {
  const mine = hits.filter((h) => h.rule.id === rule.id);
  console.log(`  ${rule.id.padEnd(28)} ${mine.length ? `✗ ${mine.length}` : '✓ 0'}`);
  for (const h of (VERBOSE ? mine : mine.slice(0, 4))) {
    console.log(`      ${h.file}:${h.line}  «${h.match}»`);
    console.log(`        ${h.text.slice(0, 110)}`);
  }
  if (mine.length) console.log(`      → ${rule.why}`);
}

const n = FILES.length;
console.log('  ' + '─'.repeat(60));
if (VERBOSE) { console.log('\n  the player\u2019s bundle:'); for (const f of FILES) console.log(`    ${relative(ROOT, f)}`); }

/*
 * OUR ACCOUNTING DOES NOT TRAVEL TO A STRANGER.
 *
 * `checkscope` reads the player's bundle for prices and purchases (E6, N1).
 * But the money was leaking through the API and not through the bundle:
 * `/api/session`, `/api/limits` and `/api/metrics` handed the daily budget,
 * the spend and the remainder to ANYONE. Besides being nobody else's business,
 * it is a hint to whoever wants to burn the budget: they can see what is left.
 *
 * Checked on the SHAPE of the answer and not on the code: the server is
 * raised, three endpoints are asked without a session, and no field with `usd`
 * in its name has any business being there. Under `AIRENA_OPS=1` it has, and
 * that is a separate mode.
 */
async function checkMoneyLeak() {
  const { spawn } = await import('node:child_process');
  const port = 8900 + Math.floor(Math.random() * 90);
  const srv = spawn('node', [join(ROOT, 'src/server/app.js')], {
    env: { ...process.env, PORT: String(port), AIRENA_DEV: '1', AIRENA_OPS: '', OPENROUTER_API_KEY: 'x' },
    stdio: 'ignore',
  });
  const wait = async () => {
    for (let i = 0; i < 60; i++) {
      try { await fetch(`http://localhost:${port}/api/session`); return true; } catch { /* still coming up */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };
  const found = [];
  try {
    if (!(await wait())) { srv.kill(); return ['the server never came up — this check was skipped']; }
    for (const ep of ['session', 'limits', 'metrics']) {
      const text = await (await fetch(`http://localhost:${port}/api/${ep}`)).text();
      for (const m2 of text.matchAll(/"([A-Za-z]*[Uu][Ss][Dd][A-Za-z]*)"\s*:/g)) {
        found.push(`/api/${ep} hands out ${m2[1]}`);
      }
    }
  } finally { srv.kill(); }
  return found;
}

const leaked = await checkMoneyLeak();
if (leaked.length) {
  console.log('\n  MONEY IS LEAKING THROUGH THE API:');
  for (const l of leaked) console.log(`    ${l}`);
  process.exitCode = 1;
} else {
  console.log('  our accounting is invisible to a stranger: session, limits, metrics carry no sums');
}

console.log(`\n  ${hits.length ? `SCOPE BREACHED — ${hits.length} violations`
  : `scope holds — ${n} bundle files and ${SERVER_COPY.length} server copy files, not one violation`}\n`);
process.exit(hits.length ? 1 : 0);
