/**
 * The mind picker — every mind the arena can give a creature, in one modal.
 *
 * Create shows a handful of featured minds as cards (docs/REDESIGN.md §6.3);
 * this is the rest of them. It is a modal and not a page on purpose: choosing
 * a mind is a detour inside writing a description, and a detour must return
 * the player to the sentence they were writing, not to a new screen.
 *
 * This file also owns the SHAPE of a mind, because two screens read it and a
 * second copy of the parsing would drift: `normalizeBundles()` accepts both
 * the catalog shape of §8.5 and the older one, and everything downstream sees
 * one object. The older shape carries a provider-prefixed label
 * (`Google: Gemini 3.7 Flash`) and a Russian denial reason; both are repaired
 * here so no screen has to know that two shapes ever existed.
 */

import { h, mount } from '../lib/dom.js';
import { latinOnly } from '../lib/format.js';
import { icon } from './icons.js';
import { mindInfo, mindMark } from './mind.js';

const RECENT_KEY = 'airena.minds.recent';
const MAX_RECENT = 4;

/* ── the shape ───────────────────────────────────────────────────────────── */

/**
 * `google/gemini-3.7-flash:think` → `google/gemini-3.7-flash`.
 *
 * Only the speed suffix comes off. Splitting on the first colon looked the
 * same on the two Z.ai families and quietly folded every subscription mind
 * into one: `sub:opus:think` and `sub:fable:plain` both became `sub`, so the
 * picker showed a single row called CLAUDE OPUS wearing Fable's wait and
 * Fable disappeared from the catalogue altogether.
 */
const MODE_SUFFIX = /:(plain|think|high|reason|none|low)$/i;
const modelOf = (b) => String(b.model || b.id || '').replace(MODE_SUFFIX, '');

/**
 * The family of a row that did not come from the catalogue.
 *
 * The standings table (`/api/models`) keys on the identifier a creature was
 * actually made with, speed suffix and all, so two rows there are one mind
 * here. Create needs the same collapse to hang a record on a card, and the
 * rule for doing it lives in exactly one place.
 */
export const familyOf = (row) => modelOf(row || {});

/**
 * Quick or deep — never the words the model vendors use.
 *
 * The mode lives in the identifier suffix in both catalog shapes; the newer
 * one also states it outright, and that one wins when it is there.
 */
function modeOf(b) {
  if (b.mode === 'quick' || b.mode === 'deep') return b.mode;
  const id = String(b.id || b.model || '');
  if (/:think|:high|:reason/i.test(id)) return 'deep';
  if (/:plain|:none|:low/i.test(id)) return 'quick';
  return null;
}

function nameOf(b) {
  if (b.name) return b.name;
  const label = latinOnly(String(b.label || ''));
  if (label.includes(':')) return label.slice(label.indexOf(':') + 1).trim();
  if (label) return label;
  return mindInfo(b.id || b.model).name;
}

function providerOf(b) {
  if (b.provider) return b.provider;
  const label = latinOnly(String(b.label || ''));
  if (label.includes(':')) return label.slice(0, label.indexOf(':')).trim();
  return mindInfo(b.id || b.model).provider;
}

/**
 * ONE STATE, ONE WORD, ONE SENTENCE.
 *
 * A mind that is out of reach used to wear four names on one screen and its
 * modal: `UNAVAILABLE` on the card, `1 RESTING` in the picker's header,
 * `Coming back soon.` on some rows, `Coming back soon — no colleague is
 * lending this mind right now.` on others, and a fifth wording under the
 * CREATE button when the server refused. Four of those describe the same
 * condition and one of them — "colleague" — is a word out of the operator's
 * vocabulary that no player has a model for; the worker page itself, two
 * clicks away, calls the same person "someone lending the game their own mind".
 *
 * The state word is **resting** (the header counts them, the card says it) and
 * the reason is this one sentence, everywhere it is read. `src/server/api.js`
 * (`dimReason`, the `worker_offline` refusal) says the same words; if one
 * moves, both move.
 */
export const NO_REASON = 'Coming back soon — nobody is sharing this mind right now.';

/**
 * Why a mind cannot be chosen — in English, always.
 *
 * The reason is the server's when the server speaks English; legacy rows are
 * Russian and `latinOnly` drops them, and a dimmed card with no reason is a
 * dead end. The fallback is derived from the tier, which is the only thing
 * that actually decides the answer.
 */
function reasonOf(b) {
  const given = latinOnly(String(b.unavailableReason || '')).trim();
  if (given) return given;
  /* Not "Worker offline — open /worker": a path is not copy, and `/worker` is
     an unlisted route (§3) that a normal player cannot act on. The instruction
     belongs to the handful of accounts on the worker list, and the server
     sends it to them; everyone else is told the true and useful half. */
  if (b.tier === 'paid') return 'Coming when payments open.';
  /* "Not available right now" is a closed door with no handle: it tells the
     player the state and nothing they can decide on. One clause of horizon
     turns the same dimmed card into a reason to come back. */
  return NO_REASON;
}

/** "~3 MIN" / "~1 MIN" / "" when nothing was measured. Never an invented number. */
export function waitLabel(secs) {
  const n = Number(secs);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n < 90 ? '~1 MIN' : `~${Math.round(n / 60)} MIN`;
}

/**
 * What one mind is offering right now, in one label: `QUICK · ~3 MIN`.
 *
 * Two surfaces read it — the card row on Create and the row in this picker —
 * and until it was one function they said the same thing in two shapes. A
 * player who compares the card to the list is comparing the catalogue, not two
 * dialects of it. The provider is the floor: a mind with neither a speed nor a
 * measured wait still has a maker.
 */
export function modeReadout(bundle, provider = '') {
  const parts = [];
  if (bundle?.mode) parts.push(MODE_WORD[bundle.mode]);
  const w = waitLabel(bundle?.waitSecs);
  if (w) parts.push(w);
  if (!parts.length && provider) parts.push(provider);
  return parts.join(' · ');
}

/**
 * One list of minds, whichever catalog shape arrived.
 *
 * `featured` is trusted when the server states it and computed when it does
 * not: the fastest available bundle per family, at most five (§8.5). An
 * unmeasured bundle never wins the family — nothing is known about it, and
 * putting the unknown ahead of the known is a guess shown as a fact.
 */
export function normalizeBundles(list) {
  const raw = (Array.isArray(list) ? list : []).filter(Boolean);
  const out = raw.map((b) => ({
    id: String(b.id ?? b.bundle ?? ''),
    model: modelOf(b),
    name: nameOf(b),
    provider: providerOf(b),
    mode: modeOf(b),
    tier: b.tier || null,
    waitSecs: Number.isFinite(Number(b.waitSecs ?? b.secs)) ? Number(b.waitSecs ?? b.secs) : null,
    available: b.available !== false,
    unavailableReason: b.available === false ? reasonOf(b) : null,
    featured: b.featured === true,
  })).filter((b) => b.id);

  if (raw.some((b) => typeof b.featured === 'boolean')) return out;

  const best = new Map();
  for (const b of out) {
    if (!b.available) continue;
    const cur = best.get(b.model);
    if (!cur) { best.set(b.model, b); continue; }
    if (faster(b, cur)) best.set(b.model, b);
  }
  const top = [...best.values()].sort((a, b) => rank(a) - rank(b)).slice(0, 5);
  for (const b of top) b.featured = true;
  return out;
}

const rank = (b) => (b.waitSecs == null ? 1e9 : b.waitSecs);
const faster = (a, b) => rank(a) < rank(b);

/**
 * Cards on Create are families, not bundles: `Gemini 3.7 Flash` is one mind
 * that can think quickly or deeply, and showing it twice would ask the player
 * to compare two rows that differ by a word they are not allowed to see.
 */
export function familiesOf(bundles) {
  const map = new Map();
  for (const b of bundles) {
    if (!map.has(b.model)) {
      map.set(b.model, { model: b.model, name: b.name, provider: b.provider, bundles: [], featured: false });
    }
    const f = map.get(b.model);
    f.bundles.push(b);
    f.featured = f.featured || b.featured;
  }
  for (const f of map.values()) {
    f.available = f.bundles.some((b) => b.available);
    f.pick = f.bundles.filter((b) => b.available).sort((a, b) => rank(a) - rank(b))[0] || f.bundles[0];
    /* quick before deep, so the toggle always reads left→right as short→long */
    f.bundles.sort((a, b) => (a.mode === 'deep' ? 1 : 0) - (b.mode === 'deep' ? 1 : 0));
  }
  return [...map.values()];
}

/**
 * The families Create puts on the card row: featured first.
 *
 * §6.3 allows up to five; Create asks for four. The row is 652 px wide inside
 * a 720 px card, so five cards are 120 px each — narrower than the two-line
 * mind name they have to hold — while four are 154 px and three are 209 px.
 * "Up to five" is a ceiling on how many minds are worth putting in front of
 * someone, not an instruction to fill the row past the point where the cards
 * stop being readable; the fifth mind is one click away in this picker.
 */
export function featuredFamilies(bundles, max = 5) {
  const all = familiesOf(bundles);
  const marked = all.filter((f) => f.featured);
  const rest = all.filter((f) => !f.featured);
  return [...marked, ...rest].slice(0, max);
}

/** The mind chosen when the player has not chosen: the fastest available one. */
export function defaultBundle(bundles) {
  const free = bundles.filter((b) => b.available);
  if (!free.length) return null;
  return free.slice().sort((a, b) => rank(a) - rank(b))[0];
}

/* ── recently used ───────────────────────────────────────────────────────── */

export function recentMinds() {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch { return []; }
}

export function rememberMind(id) {
  if (!id) return;
  try {
    const next = [id, ...recentMinds().filter((x) => x !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private mode: the list is a convenience, not state */ }
}

/* ── the modal ───────────────────────────────────────────────────────────── */

/**
 * One case for one word.
 *
 * The card's segmented toggle, the picker's readout and the creature page's
 * mind badge all name the same two things, and they used to name them in three
 * different cases (`QUICK`, `Quick`, `· QUICK`). A mode is a label in the sense
 * of §2.2 — `--t-label`, uppercase — so it is written that way at the source
 * and never re-cased by a screen.
 */
export const MODE_WORD = { quick: 'QUICK', deep: 'DEEP' };

/**
 * How much of the list may fade under the mask before it stops meaning "more".
 *
 * Deep enough that the row the panel cuts is unmistakably a cut row: at 26 px
 * the phone's last visible line was still solid enough to be read as the end
 * of the list, with the "more" tile sitting on top of it.
 */
const FADE = 34;

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

/**
 * A ROW THAT SCROLLS SIDEWAYS HAS TO LOOK CUT, NOT BROKEN.
 *
 * Two rows on this screen run off the right of a phone: the mind strip on the
 * create card and the filter chips in this panel. Both used to meet the edge
 * on a hard vertical — the second mind card sliced mid-body, the ANTHROPIC
 * chip printed as `A…` — which reads as a layout fault rather than as content
 * that continues. A constant mask was the first answer and it lies in the
 * other direction: a row of two chips that fits was still drawn fading out.
 *
 * So the fade is MEASURED, at both ends, the same way the picker's own list
 * does it vertically (`paintFade`). Nothing out of frame, nothing faded; a
 * row scrolled to its end loses the right fade and gains the left one. The
 * element keeps its own numbers in two custom properties and the stylesheet
 * decides whether to spend them, so this costs a desktop grid nothing.
 *
 * Returns `stop()`; the caller owns the teardown, because both callers can
 * outlive the row.
 */
export function edgeFade(el, { fade = 32 } = {}) {
  if (!el) return { paint() {}, stop() {} };
  const paint = () => {
    const left = el.scrollLeft;
    const right = Math.max(0, el.scrollWidth - el.clientWidth - left);
    el.style.setProperty('--fade-l', `${Math.min(fade, Math.max(0, left))}px`);
    el.style.setProperty('--fade-r', `${Math.min(fade, right)}px`);
  };
  el.addEventListener('scroll', paint, { passive: true });
  addEventListener('resize', paint);
  requestAnimationFrame(paint);
  return {
    paint,
    stop() {
      el.removeEventListener('scroll', paint);
      removeEventListener('resize', paint);
    },
  };
}

/**
 * Open the picker. Returns `{ close }`; `onPick` receives the chosen bundle
 * and the modal closes itself — which is why `onClose` exists: the caller that
 * did not close the modal is still holding a handle to it, and a handle to a
 * modal that is gone is a second `close()` waiting to happen. It fires exactly
 * once, whoever closed it.
 *
 * THE LIST IS FAMILIES, NOT BUNDLES. `Gemini 3.7 Flash` used to appear twice,
 * two rows apart, separated only by the words `Quick · ~3 MIN` and
 * `Deep · ~7 MIN` in 12 px grey — which reads as a duplicated row, not as one
 * mind with two speeds. The card row on Create had this right from the start
 * (§6.3: one card, a `QUICK · DEEP` toggle on it), and a picker that models
 * the same catalogue differently teaches the player two things about one
 * thing. So the picker collapses to one row per mind and carries the same
 * segmented control, right-aligned; the sub-line is that control's readout.
 */
export function openMindPicker({ bundles = [], selected = null, onPick = () => {}, onClose = () => {} } = {}) {
  /* Normalizing again is free and idempotent: the caller may pass either shape. */
  const list = normalizeBundles(bundles);
  const all = familiesOf(list);
  const providers = [...new Set(all.map((f) => f.provider))].filter(Boolean);
  const returnTo = document.activeElement;
  const uid = `mind-${Math.random().toString(36).slice(2, 8)}`;

  let filter = 'all';
  let query = '';
  let active = 0;
  let rows = [];

  /* Which speed each mind is currently offering. It starts on the chosen
     bundle where there is one and on the family's fastest otherwise, and the
     arrow keys move it without committing — the row is a readout of this map. */
  const mode = new Map();
  for (const f of all) {
    const sel = f.bundles.find((b) => b.id === selected);
    mode.set(f.model, (sel || f.pick)?.id || null);
  }
  const bundleOf = (f) => f.bundles.find((b) => b.id === mode.get(f.model)) || f.pick;

  const listEl = h('div.picker-list', { id: `${uid}-list`, role: 'listbox', 'aria-label': 'Minds' });
  const emptyEl = h('div.picker-empty');

  const input = h('input', {
    type: 'text', placeholder: 'Search minds', 'aria-label': 'Search minds',
    autocomplete: 'off', spellcheck: 'false',
    role: 'combobox', 'aria-expanded': 'true', 'aria-autocomplete': 'list',
    'aria-controls': `${uid}-list`,
    oninput: () => { query = input.value.trim().toLowerCase(); active = 0; paint(); },
  });

  const chips = h('div.picker-filters');
  const body = h('div.modal-body', listEl, emptyEl);
  /* The mask says "there is more below"; this says which way to go. Both are
     driven by the same measurement, so neither can lie about the other. */
  const moreHint = h('div.picker-more', { 'aria-hidden': 'true' }, icon('chevron-down', 14));

  /*
   * WHAT THE FILTER JUST DID, IN TWO WORDS.
   *
   * Six chips at the top of a modal are six presses with no stated consequence:
   * the list under them redraws, but a list that is longer than the panel looks
   * the same length whatever is in it, so ANTHROPIC and ALL were visually the
   * same panel. The count is the readout — it is how many minds the player is
   * looking at, it changes with every chip and every letter typed, and it is
   * the one number that says how big this catalogue actually is.
   */
  const countEl = h('div.t-label.picker-count', { role: 'status' });

  const card = h('div.modal.glass.strong.picker', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Choose its mind' },
    h('div.modal-head',
      h('div.picker-title', h('div.t-title', 'Choose its mind'), countEl),
      h('button.btn.icon.small.ghost', { type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('close', 18))),
    h('div.picker-search', h('div.search', icon('search'), input)),
    chips,
    body,
    moreHint);

  const veil = h('div.modal-veil.picker-veil', {
    onmousedown: (e) => { if (e.target === veil) close(); },
  }, card);

  (document.getElementById('overlay') || document.body).appendChild(veil);
  requestAnimationFrame(() => veil.classList.add('on'));

  /* Declared before the first paint: `paintChips` re-measures through it, and
     a `const` read from above its own line is a dead screen, not a missing
     fade. The chip rail scrolls on a phone, so it says so at whichever end
     there is more of it — see `edgeFade`. */
  const chipFade = edgeFade(chips);

  paintChips();
  paint();
  input.focus();
  addEventListener('keydown', onKey, true);
  body.addEventListener('scroll', paintFade, { passive: true });
  addEventListener('resize', paintFade);

  function paintChips() {
    mount(chips,
      chipFor('all', 'All'),
      all.some((f) => f.featured) ? chipFor('featured', 'Featured') : null,
      providers.map((p) => chipFor(`p:${p}`, p)));
    chipFade?.paint();
  }

  function chipFor(id, label) {
    return h('button.chip', {
      type: 'button', class: filter === id ? 'on' : '',
      'aria-pressed': filter === id ? 'true' : 'false',
      onclick: () => { filter = id; active = 0; paintChips(); paint(); },
    }, label);
  }

  function matches(f) {
    if (filter === 'featured' && !f.featured) return false;
    if (filter.startsWith('p:') && f.provider !== filter.slice(2)) return false;
    if (!query) return true;
    const hay = `${f.name} ${f.provider} ${f.bundles.map((b) => b.mode || '').join(' ')}`.toLowerCase();
    return hay.includes(query);
  }

  function paint() {
    const shown = all.filter(matches);
    rows = [];

    const recentIds = recentMinds();
    const recent = filter === 'all' && !query
      ? [...new Set(recentIds.map((id) => shown.find((f) => f.bundles.some((b) => b.id === id))).filter(Boolean))]
      : [];

    const groups = new Map();
    for (const f of shown) {
      if (!groups.has(f.provider)) groups.set(f.provider, []);
      groups.get(f.provider).push(f);
    }

    mount(listEl,
      recent.length ? section('Recent', recent) : null,
      [...groups.entries()].map(([provider, items]) => section(provider, items)));
    mount(emptyEl, shown.length ? null : h('div.empty',
      h('div.hd', 'No mind by that name'),
      h('div.t-small', 'Try a shorter word, or clear the filter.')));

    /* The subhead is the list's own length, and it says how many of those
       cannot be chosen right now — the dimmed rows are the reason a count and
       a list can disagree, and hiding that disagreement is what makes a
       filtered panel feel arbitrary. */
    const off = shown.filter((f) => !f.available).length;
    countEl.textContent = shown.length
      ? `${shown.length} ${shown.length === 1 ? 'mind' : 'minds'}${off ? ` · ${off} resting` : ''}`
      : 'Nothing here';

    if (active >= rows.length) active = Math.max(0, rows.length - 1);
    markActive();
    requestAnimationFrame(paintFade);
  }

  function section(title, items) {
    return h('div.picker-group', { role: 'group', 'aria-label': title },
      h('div.t-label.label-line', title),
      h('div.picker-rows', items.map((f) => row(f))));
  }

  /**
   * One mind, one row.
   *
   * The row is a `div` with `role="option"` rather than a button because it
   * carries the speed toggle, and a button inside a button is not a thing the
   * browser can express. Focus never leaves the search field (§6.3 asks for
   * arrows and Enter), so the row is reached through `aria-activedescendant`
   * and the toggle through the left/right arrows; the visible segment is the
   * pointer's way to the same two choices and is hidden from the reader, which
   * would otherwise hear each speed twice.
   */
  function row(f) {
    const b = bundleOf(f);
    const modes = f.bundles.filter((x) => x.mode);
    const showSeg = f.available && modes.length > 1;
    const on = f.bundles.some((x) => x.id === selected);
    const id = `${uid}-${rows.length}`;

    const el = h('div.mind-row', {
      id,
      role: 'option',
      class: `${on ? 'on' : ''} ${f.available ? '' : 'off'}`.trim(),
      'aria-selected': on ? 'true' : 'false',
      'aria-disabled': f.available ? null : 'true',
      'aria-label': labelOf(f, b),
      onclick: () => pick(bundleOf(f)),
      onmouseenter: () => { const i = rows.findIndex((r) => r.el === el); if (i >= 0) { active = i; markActive(); } },
    },
      h('span.mind-row-mark', mindMark(f.pick.id, 20)),
      h('span.mind-row-main',
        h('span.mind-row-name', f.name),
        h('span.mind-row-sub', { class: f.available ? '' : 'reason' }, subText(f, b))),
      /* The tail is a set of columns, not a queue: the speed toggle and the
         tick hold their width whether or not this mind has them, so FEATURED
         reads down the list as one column instead of stepping left and right
         with whatever the row happens to carry. On a phone the same three
         things drop to a second line under the name, where they have room. */
      h('div.mind-row-tail',
        /* A slot, not a chip: the tag column holds its width on every row, so
           FEATURED reads straight down the list and the rows that do not carry
           it do not pull the toggle beside them out of column. */
        h('span.mind-row-tag', f.featured && f.available ? h('span.chip.small', 'Featured') : null),
        /*
         * Spans, not buttons — and the reader's route to the speed is
         * elsewhere on purpose.
         *
         * `option` is a role with presentational children: a `<button>` put
         * inside one is erased from the accessibility tree, so a real control
         * here would be a control nobody can reach, which is worse than a
         * drawn one. The segment is therefore the POINTER's shortcut, with
         * ArrowLeft/ArrowRight as the hardware keyboard's.
         *
         * A phone screen-reader user has neither, and their route is the one
         * §6.3 already builds: pick the mind here, and the create card behind
         * this modal shows the same two speeds as real 44 px `<button>`s
         * (`.seg.mind-modes`, `screens/create.js`). The option's own name says
         * which speed is currently on offer and that there are two, so the
         * choice is announced before it is left to the card.
         */
        showSeg ? h('div.seg.mind-row-modes', modes.map((m) => h('span', {
          role: 'presentation', 'aria-hidden': 'true',
          dataset: { bundle: m.id },
          class: `${m.id === b.id ? 'on' : ''} ${m.available ? '' : 'off'}`.trim(),
          onclick: (e) => { e.stopPropagation(); pick(m); },
          onmouseenter: (e) => { e.stopPropagation(); setMode(f, m); },
        }, MODE_WORD[m.mode]))) : h('span.mind-row-slot'),
        h('span.mind-row-check', on ? icon('check', 16) : null)));

    if (f.available) rows.push({ el, family: f });
    return el;
  }

  /** The sub-line is what the segment currently says, in the label's case. */
  function subText(f, b) {
    if (!f.available) return f.pick.unavailableReason || NO_REASON;
    return modeReadout(b, f.provider);
  }

  /* A declaration, not a `const`: the first `paint()` runs above this line.
     A mind with two speeds says so, because the drawn segment beside it is
     presentational (see `row()`) and the choice is finished on the card. */
  function labelOf(f, b) {
    const two = f.available && f.bundles.filter((x) => x.mode && x.available).length > 1;
    return `${f.name} · ${f.provider} · ${subText(f, b)}${two ? ' · two speeds, chosen on the card' : ''}`;
  }

  /** Change the speed a row offers without choosing it. */
  function setMode(f, m) {
    if (!m?.available || mode.get(f.model) === m.id) return;
    mode.set(f.model, m.id);
    /* Every row of that mind, not the first: a mind in RECENT is also in its
       provider's group, and only one of the two would have followed. */
    for (const r of rows) if (r.family.model === f.model) refresh(r.el, f);
  }

  /* In place, not a repaint: the segment is under the pointer while it changes,
     and rebuilding the list would drop the row out from under the cursor. */
  function refresh(el, f) {
    const b = bundleOf(f);
    const sub = el.querySelector('.mind-row-sub');
    if (sub) sub.textContent = subText(f, b);
    el.setAttribute('aria-label', labelOf(f, b));
    for (const seg of el.querySelectorAll('.mind-row-modes > span')) {
      seg.classList.toggle('on', seg.dataset.bundle === b.id);
    }
  }

  function markActive() {
    rows.forEach((r, i) => r.el.classList.toggle('active', i === active));
    const cur = rows[active]?.el;
    if (cur) {
      input.setAttribute('aria-activedescendant', cur.id);
      cur.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  /**
   * How much of the list is out of sight, in pixels, at both ends.
   *
   * The fade is measured rather than constant: a list that ends exactly at the
   * panel's edge must not be drawn as if it continued, and a bottom row cut
   * flat by the panel must not be drawn as if it were the last one.
   */
  function paintFade() {
    const top = body.scrollTop;
    const bot = Math.max(0, body.scrollHeight - body.clientHeight - top);
    body.style.setProperty('--fade-top', `${Math.min(FADE, top)}px`);
    body.style.setProperty('--fade-bot', `${Math.min(FADE, bot)}px`);
    card.classList.toggle('more', bot > 2);
  }

  function pick(b) {
    if (!b || !b.available) return;
    rememberMind(b.id);
    close();
    onPick(b);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') { trapTab(e); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
      markActive();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const cur = rows[active];
      if (!cur) return;
      const modes = cur.family.bundles.filter((b) => b.mode && b.available);
      if (modes.length < 2) return;
      e.preventDefault();
      const i = modes.findIndex((b) => b.id === mode.get(cur.family.model));
      setMode(cur.family, modes[(i + (e.key === 'ArrowRight' ? 1 : modes.length - 1) + modes.length) % modes.length]);
      return;
    }
    if (e.key === 'Enter') {
      const cur = rows[active];
      if (!cur) return;
      e.preventDefault();
      pick(bundleOf(cur.family));
    }
  }

  /* A modal that lets Tab walk out of it is a modal only to the mouse: the
     next stop past the last row used to be the create screen behind the veil,
     which is inert, invisible and still focusable. */
  function trapTab(e) {
    /* `tabIndex >= 0` and not a `:not([tabindex="-1"])` selector: a native
       button is tabbable without carrying the attribute, and one that has been
       taken out of the order carries it. Only the DOM knows which is which. */
    const els = [...card.querySelectorAll(FOCUSABLE)]
      .filter((el) => el.tabIndex >= 0 && !el.disabled && (el.offsetWidth || el.offsetHeight));
    if (!els.length) return;
    const first = els[0];
    const last = els[els.length - 1];
    const cur = document.activeElement;
    if (!card.contains(cur)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
  }

  /**
   * Closing is idempotent, and it never chases focus onto a dead screen.
   *
   * Two calls used to be normal: `pick()` closes the modal and hands the choice
   * back, and the screen that opened it closes its handle again on the way out.
   * The second call re-ran the whole body — including the focus restore, whose
   * target is the BROWSE button of a screen the router is in the middle of
   * tearing down. Choosing a mind and immediately navigating away pulled the
   * page back to the screen that was leaving. One guard settles both: after the
   * first close there is nothing left to close, and `isConnected` refuses to
   * hand focus to a node that is no longer in the document.
   */
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', paintFade);
    body.removeEventListener('scroll', paintFade);
    chipFade.stop();
    veil.classList.remove('on');
    setTimeout(() => veil.remove(), 220);
    try { if (returnTo?.isConnected) returnTo.focus?.(); } catch { /* the opener may be gone */ }
    try { onClose(); } catch (e) { console.error(e); }
  }

  return { close };
}
