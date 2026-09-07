/**
 * CREATURE — the specimen (docs/REDESIGN.md §6.5).
 *
 * The one dominant thing here is the creature itself: the portrait takes the
 * left half of the page and everything else is a caption to it. Numbers are
 * three tiles, not a dashboard; the abilities are three icons, not a table;
 * the words the player typed are quoted back to them, because that sentence
 * is the only part of the creature they actually wrote.
 *
 * Two audiences, one screen. Mine: a record to be proud of and a way back to
 * the fight. Someone else's, opened from the ladder or from a match: the same
 * page minus the private parts. `isMine` decides, never the caller.
 */
import { h, mount, svg, empty } from '../lib/dom.js';
import { get } from '../lib/api.js';
import { num, signed, rank as rankStr, latinOnly, plural } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { abilityTile, abilityAt } from '../ui/ability.js';
import { mindBadge } from '../ui/mind.js';
import { portrait } from '../ui/portrait.js';
import { attachTooltip, hideTooltip } from '../ui/tooltip.js';

let shown = null;      // the live portrait, standing on the screen the player is on
let stage = null;      // the screen element that portrait is drawn into
let token = 0;         // navigation guard: a slow body must not land on a new screen
let falling = null;    // { p, el } — a portrait fading out with the screen it belongs to
let fallTimer = null;

/**
 * THE PAGE IS PAINTED BEFORE THE CREATURE IS FETCHED.
 *
 * `enter()` used to await `GET /api/creature/:id` before its first `mount`,
 * and the shell reveals an incoming screen on its first child (`app.js`) — so
 * the whole navigation stalled on that request: the rail dot flipped to
 * CREATURE, the ground flipped to the backdrop, the arena stopped drawing, and
 * the screen the player was leaving sat frozen over the new ground until the
 * answer came back. That is the `page → wait → page` cut §1.8 forbids, on one
 * of the four primary nav items.
 *
 * So the shape of the page goes up first — the stage with the id-derived
 * silhouette (the id is known before any request), a name bar, three stat
 * tiles, three ability circles and the foot — and the caption column is
 * replaced when the creature lands. `history.js` and `ladder.js` do the same
 * thing for the same reason.
 */
export async function enter(root, args, ctx) {
  const mine = ctx.store.session?.creature || null;
  const id = (args?.id && args.id !== 'me') ? args.id : (mine?.id || null);
  const turn = ++token;
  stage = root;

  if (!id) { mount(root, page(noCreature())); return; }

  const figure = h('div.creature-figure');
  const capSkel = waitingCaption();
  const footSkel = waitingFoot();
  mount(root, page(h('div.creature-grid', figure, capSkel, footSkel)));
  const holder = raiseStage(figure, id);

  let data;
  try {
    data = await get(`/api/creature/${id}`);
  } catch (e) {
    if (e?.code === 'offline') throw e;
    if (turn !== token) return;
    mount(root, page(empty(
      'This creature is gone',
      'It may have been retired, or the address is wrong.',
      h('a.btn', { href: '#/ladder' }, 'Open the ladder', icon('arrow-right')))));
    return;
  }
  if (turn !== token) return;

  const c = data.creature;
  capSkel.replaceWith(caption(c, data, ctx));
  footSkel.replaceWith(actions(c, data));

  /*
   * The stage is the dominant element of the screen and it was silent: a bare
   * `<canvas>` with a class on it, and a procedural silhouette marked
   * `aria-hidden`. Whichever of the two is standing, the box carries the name
   * of the animal it is showing — and hands the label over to the canvas the
   * moment the real body arrives, so the creature is never announced twice.
   */
  const name = String(c.name || '').trim() || 'The creature';
  holder.setAttribute('aria-label', `${name} — an outline, while its body is drawn.`);

  /*
   * DELIBERATELY NOT AWAITED. The body is fetched, parsed behind three walls
   * and handed to a second renderer — seconds, not milliseconds. The
   * silhouette raised above covers the gap and stays for good if the body
   * cannot be built at all. The navigation token, not an await, is what keeps
   * a slow body off a screen the player has already left.
   */
  portrait(holder, {
    creatureId: c.id,
    bodyRef: c.bodyRef,
    size: c.size || 1,
    label: `${name} — its body, seen in the round.`,
  }, { turn: true })
    .then((p) => {
      if (turn !== token) { p.destroy?.(); return; }
      if (!p.ok) {
        holder.setAttribute('aria-label', `${name} — an outline; its body could not be drawn.`);
        p.destroy?.();
        return;
      }
      holder.querySelector('.silhouette')?.remove();
      holder.removeAttribute('role');
      holder.removeAttribute('aria-label');
      holder.classList.add('live');
      shown = p;
      stage = root;
    })
    .catch((e) => console.error(e));
}

/*
 * THREE LAYERS, BOTTOM UP: the light, the ground, the body.
 *
 * The glow and the contact shadow are painted BEFORE the stage because the
 * renderer's canvas is transparent — a shadow appended after it would lie on
 * top of the creature's feet instead of under them. Together they are what
 * stops the body reading as a cut-out pasted onto a photograph: light behind
 * it, a soft ellipse where it meets the floor.
 */
function raiseStage(figure, id) {
  const holder = h('div.portrait-stage', {
    role: 'img',
    'aria-label': 'The creature — an outline, while its body is drawn.',
  }, silhouetteSvg(id));
  figure.appendChild(h('div.portrait-glow'));
  figure.appendChild(h('div.portrait-shadow'));
  figure.appendChild(holder);
  return holder;
}

/**
 * The shape of the caption before there is a caption.
 *
 * Not a spinner and not a blank column: the same blocks in the same places, so
 * the page does not change layout when the words arrive — the name bar, the
 * three tiles on their own three columns, the three ability circles on their
 * own pitch, and two paragraphs' worth of the sections underneath. It is
 * hidden from screen readers, which have nothing to gain from a description of
 * furniture that is about to be replaced.
 */
function waitingCaption() {
  const abilitySkel = () => h('div.sk-ability', h('div.skel.sk-ring'), h('div.skel.sk-abname'));
  const sect = (...body) => h('div.sect', h('div.skel.sk-label'), ...body);
  return h('div.creature-side.is-waiting', { 'aria-hidden': 'true' },
    h('header.creature-head', h('div.skel.sk-name'), h('div.skel.sk-line')),
    h('div.tiles.creature-stats', [0, 1, 2].map(() => h('div.skel.sk-tile'))),
    sect(h('div.ability-row', [0, 1, 2].map(abilitySkel))),
    sect(h('div.skel.sk-para')),
    sect(h('div.skel.sk-para.tall')));
}

function waitingFoot() {
  return h('div.creature-next.is-waiting', { 'aria-hidden': 'true' },
    h('div.skel.sk-why'),
    h('div.creature-actions',
      h('div.skel.sk-btn'), h('div.skel.sk-btn'), h('div.skel.sk-btn.wide')));
}

/**
 * THE PORTRAIT FADES WITH THE PAGE IT IS ON — IT DOES NOT GO FIRST.
 *
 * `leave()` runs at frame zero of a route change: `app.js` calls it before the
 * incoming element even exists, and `.leaving` (a 620 ms cross-fade) is added
 * later still. Destroying the renderer here therefore blanked the largest
 * thing on the screen — the left 56 % and 62 vh of this page — and only then
 * faded the words around the hole out. The player saw the creature vanish, and
 * a moment later saw the page it had been standing on go.
 *
 * So `leave()` only stops the screen from acting (the navigation token, the
 * tooltip); the body is handed to `falling` and put down when the page it
 * belongs to is actually gone. `dispose()` is the screen contract's hook for
 * that moment and the shell should call it; until it does, `watchFall()` waits
 * for the element to leave the document, which is the same instant by another
 * clock. Whichever arrives first, the portrait is destroyed exactly once.
 */
export function leave() {
  token++;
  hideTooltip();
  fell();                                   // an older portrait still fading has had its time
  if (shown) { falling = { p: shown, el: stage }; watchFall(); }
  shown = null;
  stage = null;
}

/** The screen contract's late hook: the element is off the page, put the body down. */
export function dispose() { fell(); }

function fell() {
  if (fallTimer) { clearTimeout(fallTimer); fallTimer = null; }
  const going = falling;
  falling = null;
  if (!going) return;
  try { going.p.destroy(); } catch (e) { console.error(e); }
}

/*
 * A renderer is not something to leave running on a guess. The element's own
 * removal is the signal; the four-second cap is there because a shell that
 * never removes it (a screen re-entered from the browser's back button, a
 * cross-fade interrupted mid-way) must not leak a WebGPU context either.
 */
function watchFall() {
  const at = Date.now();
  const tick = () => {
    if (!falling) return;
    if (!falling.el || !falling.el.isConnected || Date.now() - at > 4000) { fell(); return; }
    fallTimer = setTimeout(tick, 120);
  };
  fallTimer = setTimeout(tick, 140);
}

/* ── page furniture ──────────────────────────────────────────────────────── */

const page = (...kids) => h('div.doc.creature-doc', h('div.doc-inner', ...kids));

const noCreature = () => empty(
  'No creature yet',
  'Describe one, choose the mind that will drive it, and let it into the arena.',
  h('a.btn.primary', { href: '#/create' }, 'Create a creature', icon('arrow-right')),
  icon('creature', 22));

/* ── the right column ────────────────────────────────────────────────────── */

function caption(c, data, ctx) {
  const list = Array.isArray(ctx.store.session?.creatures) ? ctx.store.session.creatures : null;
  const idx = list ? list.findIndex((x) => x.id === c.id) : -1;
  const gen = c.generation ?? (idx >= 0 ? (list[idx].generation ?? list.length - idx) : (c.isMine ? 1 : null));

  const notes = (Array.isArray(c.birthNote) ? c.birthNote : [])
    .map((n) => latinOnly(n?.message || '')).filter(Boolean);
  const unfit = (Array.isArray(c.unfit) ? c.unfit : [])
    .map((u) => latinOnly(u?.phrase || '')).filter(Boolean);

  return h('div.creature-side',
    h('header.creature-head',
      h('h1.t-hero.creature-name', c.name || '—'),
      /* The label and the badge are ONE word, and they break as one. Left as
         two siblings on a wrapping flex row, a phone put `GENERATION 01  MIND`
         on the first line and the badge on the second, which orphans the word
         MIND at the end of a line with the dot it belongs to lost — the label
         reads as a heading for nothing. Below 900 px the label goes entirely
         (`ui/screens/creature.css`): the mark and the model name are the whole
         sentence, and the line then fits across a 390 px screen. */
      h('div.creature-line',
        gen ? h('span.t-label', `Generation ${String(gen).padStart(2, '0')}`) : null,
        gen ? h('span.sep') : null,
        h('span.mind-unit', h('span.t-label.mind-word', 'Mind'), mindBadge(c.model))),
      generations(list, c, ctx)),

    stats(c, data, ctx),

    section('Abilities', h('div.ability-row', abilities(c))),

    section('Created from', authorship(c)),

    section('How it fights', fightingStyle(c)),

    notes.length ? h('div.stack.gap2.sect', notes.map((m) => h('div.note.warning', m))) : null,

    unfit.length ? h('div.unfit.t-small',
      `Left out: ${unfit.join(' · ')} — the arena has no move like ${unfit.length > 1 ? 'those' : 'that'}.`) : null);
}

const section = (label, body) => h('div.sect',
  h('div.label-line', h('span.t-label', label)), body);

/**
 * THE TWO AUTHORSHIP BLOCKS ARE NEVER DROPPED.
 *
 * The sentence the player typed is the only part of the creature they wrote
 * with their own hands, and the tactics card is the arena's answer to it —
 * together they are the whole claim this screen makes. Both used to be gated
 * on `latinOnly()` (§7.6), which returns '' for every creature born before the
 * product spoke English: on the development stand that is most of the ladder,
 * so the screen whose job is "the specimen" said nothing at all about what the
 * specimen is, and the bottom half of the page was empty. A missing sentence
 * is a fact about the creature, and a fact is printed, not hidden — with the
 * reason, because "not kept" and "kept in another language" are two different
 * stories and the player can act on only one of them.
 */
function authorship(c) {
  const said = latinOnly(c.prompt);
  if (said) return h('blockquote.quote', `“${said}”`);
  return h('p.t-body.muted.said-nothing', String(c.prompt || '').trim()
    ? 'Described in an earlier language, before the arena spoke English.'
    : 'Its description was not kept.');
}

function fightingStyle(c) {
  const card = latinOnly(c.tacticsCard);
  if (card) return h('div.tactics', card.split(/\n{2,}/).map((par) => h('p.t-body', par)));
  return h('p.t-body.muted.said-nothing', String(c.tacticsCard || '').trim()
    ? 'Its notes were written in an earlier language, before the arena spoke English.'
    : 'It has not written down how it fights yet.');
}

/**
 * How big a stat value may be drawn.
 *
 * A tile is one of three EQUAL columns of the caption — a grid, not three
 * boxes each as wide as its own contents — so the record, the longest value
 * the product prints anywhere, gets a third of the column and no more. Most
 * values are short
 * ("1,573", "#6"); a record is not: one with six thousand fights behind it
 * reads "4,682 – 1,674", thirteen characters where five were budgeted, and at
 * the number size it runs straight out of its own tile. The type steps down
 * instead. Character count is a fair measure of width here because the face is
 * tabular: every digit is exactly as wide as every other.
 */
function fitValue(text) {
  const n = String(text).length;
  if (n >= 12) return 'xs';
  if (n >= 9) return 'sm';
  return null;
}

function stats(c, data, ctx) {
  /*
   * The rating carries its drift since the player's last visit (§6.5) — the
   * same number the chip in the chrome shows, from the same field, because two
   * places disagreeing about "how am I doing" is worse than one place not
   * saying. Only on my own creature: `session.since` is about me, and printing
   * it beside a stranger's rating would be a lie about whose it is.
   */
  const drift = c.isMine ? Math.round(ctx?.store?.session?.since?.ratingDrift || 0) : 0;
  const rating = h('div.tile',
    h('div.v',
      h('span', num(c.rating)),
      drift ? h('span.d', { class: drift < 0 ? 'down' : '' }, signed(drift)) : null),
    h('div.k', 'Rating'),
    h('div.sub', c.peak ? `Peak ${num(c.peak)}` : ' '));

  /* Win rate under the record, and nothing else on that line: the draws used
     to ride along with it, and on a column this narrow they wrapped the tile
     onto a second line while its two neighbours stayed on one. They are in the
     tooltip, where a number nobody came for belongs.
   *
   * A BARE PAIR, AS THE KIT SETS IT. The two numbers carried a W and an L for
   * a round, to stop "4,930 – 1,808" reading as a second rating and a third.
   * Set at half the number's size they hung off the digits' baseline and, with
   * one glyph a capital and the other reading as lower case at that size, they
   * were the first thing the eye caught in a row whose subject is the numbers.
   * The kit's own STAT BLOCK (uikit.png) writes the record as `19 – 11` with
   * nothing after it, and §6.5 does the same; what actually disambiguates the
   * tile is the line under it — `72% win rate` — which no rating tile carries,
   * plus the label RECORD directly beneath. */
  const digits = `${num(c.wins)} – ${num(c.losses)}`;
  const fit = fitValue(digits);
  const record = h('div.tile',
    h('div.v.v-record', fit ? { dataset: { fit } } : null,
      h('span.n', num(c.wins)),
      h('span.dash', '–'),
      h('span.n', num(c.losses))),
    h('div.k', 'Record'),
    h('div.sub', c.fights ? `${c.winrate}% win rate` : 'No fights yet'));

  /* A tooltip that only a pointer can open is a tooltip half the readers never
     see. `attachTooltip` already opens on focus — the tile only has to be
     reachable, and a stat tile is a piece of text with more text behind it, so
     it takes a tab stop rather than a button's role. */
  if (c.fights) {
    record.tabIndex = 0;
    attachTooltip(record, {
      title: 'Record',
      body: `${plural(c.wins, 'win')}, ${plural(c.losses, 'loss', 'losses')}`
        + `${c.draws ? ` and ${plural(c.draws, 'draw')}` : ''} in ${plural(c.fights, 'fight')}.`,
    });
  }

  /* "Stronger than 91%" is sixteen characters in a tile a hundred and fifty
     wide: it wrapped to two lines and took the bottom of its own tile with it,
     so the three tiles read as a ragged row where the kit's STAT BLOCK is a
     clean grid. `Top 9%` is the same fact in six characters — the long
     sentence is still there, in the tooltip, where a reader who wants the
     denominator can find it. Floored at 1: nobody is in the top 0 %. */
  const top = data.percentile != null ? Math.max(1, 100 - Math.round(data.percentile)) : null;
  const rank = h('div.tile',
    h('div.v', data.rank != null ? rankStr(data.rank) : '—'),
    h('div.k', 'Rank'),
    h('div.sub', top != null ? `Top ${top}%` : ' '));

  if (data.percentile != null && data.players) {
    rank.tabIndex = 0;
    attachTooltip(rank, {
      title: 'Rank',
      body: `Stronger than ${data.percentile}% of ${num(data.players)} players who have a creature in the arena. `
        + `${num(data.total)} creatures are fighting this season.`,
    });
  }
  return h('div.tiles.creature-stats', rating, record, rank);
}

/**
 * Three tiles, always three: a creature whose abilities failed to compile
 * still HAS three slots, and an empty circle says that more honestly than a
 * missing row.
 */
function abilities(c) {
  const count = Math.max(3, c.abilities?.length || 0, c.kit?.length || 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = abilityAt(c, i);
    if (!a) continue;
    /* When the server has told us there is no icon for this slot, do not ask
       for one: a 404 per tile per visit is a request that can never succeed. */
    const hasIcon = Array.isArray(c.icons) ? !!c.icons[i] : true;
    /* The caption — the ability's full name and, when a kit holds two moves of
       the same shape, the tie-breaker under it (§9.1) — is `ui/ability.js`'s:
       the size and the no-wrap are two halves of one promise and belong with
       the markup. All this row asks of it is the column's own left edge. */
    out.push(abilityTile({ creatureId: hasIcon ? c.id : null, slot: i, ability: a, size: 64, label: true }));
  }
  return out.length ? out : h('div.t-small.muted', 'This creature fights with the reference abilities.');
}

/** The player's own line of creatures: 01 · 02 · 03, retired ones dimmed. */
function generations(list, c, ctx) {
  if (!list || list.length < 2 || !c.isMine) return null;
  return h('div.gens',
    h('span.t-label', 'Generations'),
    list.slice().reverse().map((g, i) => h('button.chip.gen', {
      type: 'button',
      class: `${g.id === c.id ? 'on' : ''} ${g.state === 'retired' ? 'dim' : ''}`.trim(),
      onclick: () => ctx.go(`/creature/${g.id}`),
    }, String(g.generation ?? i + 1).padStart(2, '0'))));
}

/**
 * THE FOOT OF THE PAGE IS THE NEXT MOVE.
 *
 * The loop the product states is Create → Release → Watch → Learn → Improve →
 * Climb, and Improve had no affordance anywhere a returning player would look:
 * the only door to a new generation was an unlabelled `+` in the chrome whose
 * meaning lived in a title attribute. So the screen that shows how a creature
 * fought ends with the button that acts on it — a real primary, on the same
 * rule as the two ghosts that lead back to the fight and to the record.
 *
 * IT SPANS BOTH COLUMNS. Kept at the end of the caption column it was pushed
 * off the bottom of a 900 px window by the tactics card, which is exactly the
 * text a player reads before deciding to try again — the one place the button
 * must not be missing from. Across the foot of the grid it sits under the
 * portrait as well, on one rule, at the height the reference puts its own
 * bottom bar; and the copy and the buttons then fit on a single line.
 *
 * Only on my own creature. On a stranger's, the row leads to the ladder, and
 * offering to "improve" someone else's animal would be nonsense.
 */
function actions(c, data) {
  return h('div.creature-next',
    c.isMine
      ? h('p.t-small.next-why', 'Learn from its fights, then describe a sharper one.')
      : null,
    h('div.creature-actions',
      /* Anyone can watch any creature: live while it is the broadcast fight,
         otherwise its last recorded fight replays under `#/watch/:id`
         (the creature endpoint sends `history` for every creature). */
      data.fightingNow
        ? h('a.btn.ghost', { href: '#/live' }, h('span.livedot'), 'Watch live', icon('arrow-right'))
        : (data.history?.[0]?.id
          ? h('a.btn.ghost', { href: `#/watch/${data.history[0].id}` }, 'Watch last fight', icon('arrow-right'))
          : (c.isMine ? h('a.btn.ghost', { href: '#/live' }, 'Watch live', icon('arrow-right')) : null)),
      c.isMine
        ? h('a.btn.ghost', { href: '#/history' }, 'History', icon('arrow-right'))
        : h('a.btn.ghost', { href: '#/ladder' }, 'Ladder', icon('arrow-right')),
      c.isMine
        ? h('a.btn.primary.next-gen', { href: '#/create' }, 'New generation', icon('arrow-right'))
        : null));
}

/* ── the stand-in body ───────────────────────────────────────────────────── */

/**
 * A silhouette built from the creature's id — shown while the real body is
 * being fetched and built, and kept if it cannot be. Not a placeholder box:
 * the shape has a head, a spine and legs, so the page reads as a creature
 * page from the first frame, and two different creatures never share one.
 */
function silhouetteSvg(id) {
  let hsh = 2166136261;
  for (let i = 0; i < String(id).length; i++) {
    hsh ^= String(id).charCodeAt(i);
    hsh = Math.imul(hsh, 16777619);
  }
  const pick = (shift, span, min = 0) => min + ((hsh >>> shift) % span);

  const legs = 2 + pick(3, 3) * 2;               // 2, 4 or 6
  const tilt = (pick(7, 15) - 7) / 60;           // a slight lean
  const headR = 8 + pick(11, 5);
  const tailX = 6 + pick(15, 14);
  const bodyR = 13 + pick(19, 5);

  const feet = [];
  for (let i = 0; i < legs; i++) {
    const x = 32 + (i / Math.max(1, legs - 1)) * 40;
    const drop = 76 + ((i % 2) ? 2 : -2);
    feet.push(`<path d="M${x} 56 L${x - 3 + (i % 3)} ${(drop + 56) / 2} L${x + 2} ${drop}"/>`);
  }

  return svg(`<svg class="silhouette" viewBox="0 0 110 96" width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <g transform="rotate(${(tilt * 180 / Math.PI).toFixed(2)} 55 52)">
      <ellipse cx="55" cy="48" rx="${bodyR + 12}" ry="${bodyR}" fill="currentColor"/>
      <circle cx="${82 + headR / 3}" cy="${40 - headR / 4}" r="${headR}" fill="currentColor"/>
      <path d="M70 44 L${80 + headR / 3} ${40 - headR / 4}" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>
      <path d="M34 46 Q${tailX + 6} ${34 - tailX / 3} ${tailX} ${52 - tailX / 2}"
        fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      <g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
        ${feet.join('')}
      </g>
    </g>
    <ellipse cx="55" cy="84" rx="34" ry="4.5" fill="currentColor" opacity=".28"/>
  </svg>`);
}
