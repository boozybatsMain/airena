/**
 * Inline monoline icons (a 1.4 px line on a 24-unit grid). `icon(name, size)`.
 */
import { svg } from '../lib/dom.js';

/*
 * THE LINE IS THE SAME WEIGHT AT EVERY SIZE.
 *
 * A stroke width is written in the grid's units, so one constant means the
 * DRAWN line thins as the icon shrinks: 1.5 on a 24 grid renders at 1.5 px in
 * a 24 px icon and at 0.88 px in the 14 px chevron beside a button's label —
 * a hairline that greys out and blurs while the 18 px rail icon next to it
 * stays solid. §2.3 asks for a 1.5 px monoline, which is a fact about the
 * PIXELS, not about the grid, so the width is compensated for the size the
 * icon is actually drawn at and every glyph in the interface carries one
 * weight.
 *
 * The floor keeps large icons from going spidery; the ceiling keeps a very
 * small one from closing its own counters up into a blot.
 */
export const strokeAt = (size, ink = 1.4) =>
  Math.round(Math.min(2.6, Math.max(ink, (ink * 24) / (size || 24))) * 100) / 100;

const P = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-up': '<path d="M6 15l6-6 6 6"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  expand: '<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  dot: '<circle cx="12" cy="12" r="3.5"/>',
  live: '<circle cx="12" cy="12" r="3"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  /* A beast in profile: an arched back on a ground line, three legs, a head.
     The old path was an outline with two dots for eyes that closed up into a
     smudge at 20 px — the size it is actually drawn at in the tab bar. */
  creature: '<path d="M3 15.4c1.6-5.2 4.6-7.6 7.4-7.6 2.4 0 4.4 1.4 5.7 3.6"/><path d="M3 15.4h13.6"/><path d="M5.6 15.4V19M10 15.4V19M14.4 15.4V19"/><circle cx="18.4" cy="9.4" r="2.4"/><path d="M20.2 7.7l1.6-1.4"/>',
  history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  /* The standings, not a literal ladder: three columns of different heights is
     what every leaderboard in the world already looks like. */
  ladder: '<path d="M3.5 20h17"/><path d="M5 20v-6h4v6M10 20V7.5h4V20M15 20v-8.5h4V20"/>',
  spark: '<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5"/>',
  external: '<path d="M14 5h5v5M19 5l-8 8M17 13v5H5V6h5"/>',
  bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  /* An hourglass, not a second clock: `history` is already the clock face, and
     two icons that differ by the angle of one hand are one icon. */
  wait: '<path d="M7 3.6h10M7 20.4h10"/><path d="M8.2 3.6v3.1c0 2.1 3.8 3.5 3.8 5.3s-3.8 3.2-3.8 5.3v3.1M15.8 3.6v3.1c0 2.1-3.8 3.5-3.8 5.3s3.8 3.2 3.8 5.3v3.1"/>',
  ring: '<circle cx="12" cy="12" r="8.5"/>',
  vs: '<path d="M4 6l4 12 4-12M14 17.5c1 .5 4 .8 4-1.5s-4-1.5-4-4 3-2 4-1.5"/>',
};

export function icon(name, size = 16, { stroke = 0 } = {}) {
  const d = P[name] || P.dot;
  const w = stroke || strokeAt(size);
  const el = svg(`<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);
  el.classList.add('ic', `ic-${name}`);
  return el;
}

