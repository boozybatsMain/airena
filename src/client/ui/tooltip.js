/**
 * The one tooltip.
 *
 * Reference: uikit.png "TOOLTIP" — a dark glass card, a tracked uppercase
 * title, one sentence under it.
 *
 * ONE ELEMENT, SHARED. A tooltip per trigger means a positioned layer per
 * ability tile, per ladder row, per mind card — dozens of nodes the
 * compositor keeps alive so that at most one of them is ever visible.
 * `#tip` lives in index.html (§4.2); this module only writes into it.
 *
 * HOVER IS NOT ENOUGH. A phone has no hover, and the ability names are the
 * one place where the rules of a creature are written down. So: hover for the
 * mouse, focus for the keyboard, and a tap that toggles for touch.
 *
 * IT OPENS INTO EMPTY SPACE. A card always drawn above its trigger lands on
 * whatever is above the trigger — the ability row on the creature page sits
 * directly under the stat tiles, and the tooltip for KINETIC FAN covered the
 * record it was standing next to. So the trigger says which way it prefers,
 * the geometry decides whether that side has room, and the card falls back
 * through the other three rather than covering the thing it explains.
 *
 * It follows the page while it scrolls instead of staying behind — a tooltip
 * that detaches from its trigger points at the wrong thing. And it POINTS:
 * the card carries a notch on the edge that faces its trigger, because three
 * ability tiles ten pixels apart deserve to be told apart.
 *
 * IT CAN BE REACHED. WCAG 1.4.13 asks that a card raised by hover survive the
 * pointer moving onto it — a blurb three lines long is not readable otherwise.
 * So leaving the trigger schedules the close rather than performing it, and
 * arriving on the card cancels it. Esc still closes at once, and so does any
 * caller of `hideTooltip()`: a screen tearing down does not want a card that
 * outlives it by a tenth of a second.
 */
import { $ } from '../lib/dom.js';

const GAP = 10;    // between the trigger and the card
const EDGE = 8;    // keep this far from the viewport edge
/* `#tip`'s own fade, in `ui/base.css` and in §7. The two used to disagree —
   220 here against 180 in the sheet — so the words were wiped four frames
   after the card they belong to had finished leaving. */
const FADE = 180;
/* How long the card takes to travel between two neighbouring triggers. Shorter
   than the fade on purpose: the card is already legible while it moves, so the
   move should be over before the eye has finished reading the new title. */
const SLIDE = 160;
/* The pointer's grace period. Measured against the 10 px gap: at a hand's
   speed 120 ms is long enough to cross it and short enough that a card left
   behind on the way somewhere else is gone before it is noticed. */
const GRACE = 120;
/* How near the notch may come to a corner before the radius eats it. */
const NOTCH = 14;

/** trigger → content (an object, or a thunk that builds one on open). */
const HOLD = new WeakMap();
/** trigger → which side it wants: `'below'` or `'above'` (the default). */
const SIDE = new WeakMap();

let anchor = null;
let bound = false;
let wipe = 0;
let grace = 0;
/* Whether the card is currently allowed to travel rather than teleport. */
let gliding = false;

const tip = () => $('#tip');
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function contentOf(node) {
  const raw = HOLD.get(node);
  const v = typeof raw === 'function' ? raw() : raw;
  if (!v) return null;
  const title = v.title ? String(v.title) : '';
  const body = v.body ? String(v.body) : '';
  const icon = v.icon ? String(v.icon) : '';
  return (title || body) ? { title, body, icon } : null;
}

/**
 * The picture's disc, made once and then reused.
 *
 * `index.html` owns `#tip` and gives it a title and a body; the disc is this
 * module's own business, so this module builds it — as the FIRST child, which
 * is where the grid expects it (`ui/components.css`), and empty until a caller
 * actually hands over a picture.
 */
function iconSlot(el) {
  let slot = el.querySelector('.tip-icon');
  if (slot) return slot;
  slot = document.createElement('div');
  slot.className = 'tip-icon';
  slot.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.alt = '';
  slot.appendChild(img);
  el.insertBefore(slot, el.firstChild);
  return slot;
}

/**
 * THE TIE-BREAKER IS A SUFFIX, NOT PART OF THE NAME.
 *
 * A kit with two identical shapes makes the grammar write `KINETIC LUNGE ·
 * DAMAGE` and `KINETIC LUNGE · STUN` (§9.1). The ability's NAME is the first
 * half; the word after the dot only exists to tell it from its twin. The tile
 * under the circle carries it too, on a quieter line of its own
 * (`ui/ability.js` `abilityLabel`), and so does the HUD chip — so all three
 * places name an ability the same way and this card is not a disclosure but a
 * confirmation. It is set a step quieter here for the same reason it is there:
 * the card answers "what is this called" before "which of the two".
 *
 * Set inline because `#tip`'s own markup lives in `index.html` and its type in
 * `ui/base.css`: a third file for one span would be a rule nobody finds.
 */
function writeTitle(el, title) {
  el.textContent = '';
  if (!title) return;
  const [head, ...rest] = String(title).split(' · ');
  el.appendChild(document.createTextNode(head));
  if (!rest.length) return;
  const mark = document.createElement('span');
  mark.textContent = ` · ${rest.join(' · ')}`;
  /* .7, not less: the title is pure white on `--pane-dark`, and a suffix
     dimmed further than this drops under 4.5:1 at 12 px — quieter has to stay
     legible, or the one place the tie-breaker is written is the one place it
     cannot be read. */
  mark.style.opacity = '.7';
  mark.style.fontWeight = '500';
  el.appendChild(mark);
}

/*
 * A CARD THAT IS ALREADY OPEN MOVES; A CARD THAT IS OPENING ARRIVES.
 *
 * Three ability tiles sit ten pixels apart, and sliding the pointer from one to
 * the next re-ran `place()` on a card standing at full opacity: the dark panel
 * jumped sideways with no motion at all, which reads as two cards flickering
 * rather than as one card following the pointer. So the position is given a
 * transition — but only while the card is on and moving between triggers. The
 * first open must still land where it belongs instead of flying in from the
 * last trigger's corner, and scrolling must not leave the card lagging behind
 * the thing it points at, so both of those turn it off again.
 *
 * It is set inline rather than in the sheet because the sheet's own
 * `prefers-reduced-motion` rule carries `!important` and so still wins: a
 * player who asked for less motion gets the old teleport, which is what they
 * asked for.
 */
function setGlide(on) {
  if (on === gliding) return;
  const el = tip();
  if (!el) return;
  gliding = on;
  el.style.transition = on
    ? `opacity ${FADE}ms var(--ease), transform ${FADE}ms var(--ease),`
      + ` top ${SLIDE}ms var(--ease), left ${SLIDE}ms var(--ease)`
    : '';
}

/** Follow the page: the card keeps pointing at its trigger, without lag. */
function follow() {
  setGlide(false);
  place();
}

/**
 * The preferred side first, then the other three, then the preferred side
 * clamped into the viewport — a card that fits nowhere is still shown.
 */
function place() {
  const el = tip();
  if (!el || !anchor) return;
  if (!anchor.isConnected) { hideTooltip(); return; }
  const r = anchor.getBoundingClientRect();
  /* scrolled out of sight — there is nothing left to point at */
  if (r.bottom < -EDGE || r.top > innerHeight + EDGE) { hideTooltip(); return; }

  /* measured after the text is written: the card's height is its text's */
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  const midX = clamp(r.left + r.width / 2 - w / 2, EDGE, innerWidth - w - EDGE);
  const midY = clamp(r.top + r.height / 2 - hgt / 2, EDGE, innerHeight - hgt - EDGE);

  const below = { side: 'below', top: r.bottom + GAP, left: midX, fits: r.bottom + GAP + hgt <= innerHeight - EDGE };
  const above = { side: 'above', top: r.top - hgt - GAP, left: midX, fits: r.top - GAP - hgt >= EDGE };
  const right = { side: 'right', top: midY, left: r.right + GAP, fits: r.right + GAP + w <= innerWidth - EDGE };
  const left = { side: 'left', top: midY, left: r.left - GAP - w, fits: r.left - GAP - w >= EDGE };

  const order = SIDE.get(anchor) === 'below'
    ? [below, above, right, left]
    : [above, below, right, left];
  const pick = order.find((p) => p.fits) || order[0];

  const top = Math.round(clamp(pick.top, EDGE, innerHeight - hgt - EDGE));
  const lft = Math.round(clamp(pick.left, EDGE, innerWidth - w - EDGE));
  el.style.top = `${top}px`;
  el.style.left = `${lft}px`;

  /*
   * The notch aims at the trigger's centre, in the card's own coordinates, and
   * stops short of the corners — a diamond half-swallowed by a 10 px radius
   * reads as a rendering fault rather than as an arrow. When the card had to
   * be clamped so far that the trigger is no longer under any part of it, the
   * notch would be lying, so it is not drawn.
   */
  el.dataset.side = pick.side;
  const cx = r.left + r.width / 2 - lft;
  const cy = r.top + r.height / 2 - top;
  const aims = (pick.side === 'above' || pick.side === 'below')
    ? (cx > 0 && cx < w)
    : (cy > 0 && cy < hgt);
  el.style.setProperty('--tip-x', `${Math.round(clamp(cx, NOTCH, Math.max(NOTCH, w - NOTCH)))}px`);
  el.style.setProperty('--tip-y', `${Math.round(clamp(cy, NOTCH, Math.max(NOTCH, hgt - NOTCH)))}px`);
  el.classList.toggle('no-notch', !aims);
}

/* One set of window listeners for every trigger on the page, attached the
   first time a tooltip opens and never removed: they cost nothing while
   `anchor` is null and re-binding on every open is how leaks start. */
function bindWindow() {
  if (bound) return;
  bound = true;
  addEventListener('scroll', follow, { capture: true, passive: true });
  addEventListener('resize', follow, { passive: true });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTooltip(); });
  /* a tap somewhere else closes the one that a tap opened — but the card
     itself is now somewhere the pointer is allowed to be */
  addEventListener('pointerdown', (e) => {
    if (!anchor) return;
    if (anchor.contains(e.target) || tip()?.contains(e.target)) return;
    hideTooltip();
  }, true);
  /* The grace period, from the card's side: arriving cancels the close that
     leaving the trigger scheduled, and leaving the card closes it. */
  const el = tip();
  if (!el) return;
  el.addEventListener('pointerenter', () => clearTimeout(grace));
  el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') scheduleHide(); });
  /* A finger has nowhere else to put a tap: with the card now taking the
     pointer, tapping it used to do nothing at all and leave it standing. */
  el.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') hideTooltip(); });
}

/** Leaving a trigger asks for the close; arriving on the card takes it back. */
function scheduleHide() {
  clearTimeout(grace);
  grace = setTimeout(hideTooltip, GRACE);
}

function open(node) {
  const c = contentOf(node);
  const el = tip();
  if (!c || !el) return;
  /* standing open in front of a different trigger: this is a move, not an open */
  const moving = el.classList.contains('on') && anchor !== null && anchor !== node;
  clearTimeout(wipe);
  clearTimeout(grace);
  const slot = iconSlot(el);
  if (c.icon) { slot.firstChild.src = c.icon; el.dataset.icon = '1'; }
  else { slot.firstChild.removeAttribute('src'); delete el.dataset.icon; }
  writeTitle(el.querySelector('.tip-title'), c.title);
  const body = el.querySelector('.tip-body');
  body.textContent = c.body;
  body.hidden = !c.body;
  if (anchor && anchor !== node) anchor.removeAttribute('aria-describedby');
  anchor = node;
  /*
   * The card is announced by its trigger, not stumbled upon.
   *
   * `#tip` is `role="tooltip"`; a screen reader that meets it while browsing
   * needs to know whose tooltip it is, and needs it out of the tree the rest
   * of the time. A trigger that already carries the same sentence in its own
   * `aria-label` — every ability tile does — is skipped, or the blurb would
   * be read twice in a row.
   */
  el.removeAttribute('aria-hidden');
  if (!node.hasAttribute('aria-label')) node.setAttribute('aria-describedby', 'tip');
  bindWindow();
  setGlide(moving);
  place();
  el.classList.add('on');
}

/**
 * `content` is either `{ title, body }` or a function returning one — live
 * values (a cooldown, a rating) must be read when the card opens, not when
 * the trigger was built.
 *
 * `place` is where the card wants to be: `'below'` for anything that sits
 * under the content it describes (the ability rows), `'above'` otherwise.
 */
export function attachTooltip(el, content, { place: prefer = 'above' } = {}) {
  if (!el) return el;
  HOLD.set(el, content);
  SIDE.set(el, prefer);
  if (el.dataset.tip === 'on') return el;   // re-attach: content only
  el.dataset.tip = 'on';

  el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') open(el); });
  el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') scheduleHide(); });
  el.addEventListener('focus', () => open(el));
  el.addEventListener('blur', () => hideTooltip());
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    if (anchor === el) hideTooltip(); else open(el);
  });
  return el;
}

export function hideTooltip() {
  const el = tip();
  clearTimeout(grace);
  anchor?.removeAttribute('aria-describedby');
  anchor = null;
  if (!el) return;
  el.classList.remove('on');
  el.setAttribute('aria-hidden', 'true');
  /* the next card lands where it belongs instead of flying in from this one */
  setGlide(false);
  /* The words leave with the card, not before it: emptied on the same frame
     the fade starts, the card collapses to a dot on its way out. Emptied
     never, a screen reader finds the last trigger's sentence sitting in the
     page with nothing pointing at it. */
  clearTimeout(wipe);
  wipe = setTimeout(() => {
    if (anchor) return;                       // reopened while it was fading
    el.querySelector('.tip-title').textContent = '';
    const body = el.querySelector('.tip-body');
    body.textContent = '';
    body.hidden = true;
    const slot = el.querySelector('.tip-icon');
    if (slot) slot.firstChild.removeAttribute('src');
    delete el.dataset.icon;
  }, FADE);
}
