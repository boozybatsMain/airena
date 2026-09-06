/**
 * Ability tiles — the circular icons under a creature's name.
 *
 * Reference: uikit.png "ABILITY ICONS" — a hairline circle on light glass,
 * one monoline glyph inside, a tracked uppercase name under it.
 *
 * TWO SOURCES, ONE SHAPE. The good icon is generated once per ability and
 * served as an image. It is not always there: a stand without a key, a
 * creature born before the forge existed, a slot that failed. So every tile
 * carries a second icon it can always draw — a procedural glyph built from
 * the two axes a player can actually see in the fight: HOW the ability is
 * delivered (the big shape, one silhouette family per delivery) and WHICH
 * element it wears (the colour of the stroke, and a small mark). A tile that
 * would otherwise be an empty circle is worse than a plain drawing, and the
 * fallback is deterministic, so the same ability is always the same picture.
 *
 * ONE TABLE, NOT TWO. The words are not written here. `src/skills/describe.js`
 * is the single place an ability is put into English, and the server mounts it
 * at `/skills/` (see `src/server/app.js`), so the browser imports the very
 * module the server answers with. A copy here would be a second copy of the
 * balance table — it would read "Damage 26" for as long as damage happened to
 * be 26, and quietly lie the day it changed. `describedKit()` calls the
 * server's own `abilitiesOf()`, so the fallback and the server's `abilities`
 * field are the same sentence.
 */
import { h } from '../lib/dom.js';
import { attachTooltip } from './tooltip.js';
import { DELIVERY_WORD, ELEMENT_WORD, abilitiesOf } from '../../skills/describe.js';

const API = () => (typeof window !== 'undefined' && window.__api) || '';

/* The naming axes (docs/REDESIGN.md §8.3) and the whole-kit describer,
   re-exported so a screen that needs the words — or the list — does not have
   to know where they live, and so there is exactly one door to them. */
export { DELIVERY_WORD, ELEMENT_WORD, abilitiesOf };

/*
 * A described kit, cached per array.
 *
 * Names are only unique against each other: `abilitiesOf()` compares the whole
 * list and adds the tie-breaker that turns two KINETIC LUNGEs into `KINETIC
 * LUNGE · DAMAGE` and `KINETIC LUNGE · STUN`. Describing one slot at a time
 * skips that comparison, and a creature with two of a shape then showed two
 * identical tiles with two identical sentences. So the fallback goes through
 * the whole list, always — and the list is remembered against the very array
 * it was built from, because a screen asks for slot 0, 1 and 2 in a row and
 * the third answer must be the same disambiguation as the first.
 */
const DESCRIBED = new WeakMap();

/** Every ability of a kit, in slot order, named against its siblings. */
export function describedKit(kit) {
  if (!Array.isArray(kit)) return [];
  let list = DESCRIBED.get(kit);
  if (!list) { list = abilitiesOf(kit); DESCRIBED.set(kit, list); }
  return list;
}

/** The server's description when it exists, ours when it does not. */
export function abilityAt(creature, slot) {
  const sent = creature?.abilities?.[slot];
  if (sent && sent.name) return sent;
  return describedKit(creature?.kit)[slot] || null;
}

/* ── the fight in words ──────────────────────────────────────────────────── */

/*
 * ONE VOCABULARY FOR THE WATCHED FIGHT AND THE REMEMBERED ONE.
 *
 * `screens/live.js` writes the feed while the fight is happening;
 * `screens/history.js` writes the beats once it is over. Both carried a
 * verbatim copy of the same three tables, and both files' comments named the
 * hoist as a note to the lead. Two copies of a verb table are exactly how one
 * fight ends up with two vocabularies depending on which screen the player
 * happens to be standing on — the drift `live.js`'s own header says it exists
 * to end. The tables live here because this module is already the single door
 * to the words an ability is made of (§8.3).
 */

/**
 * The five shapes the two hand-written reference fighters throw.
 *
 * They have no grammar entry, so the viewer labels their chips from a table of
 * bare verbs — SMASH, CHARGE — while every other creature's row is named from
 * the two axes. Their shapes are facts about the shapes, not about the balance
 * table, so naming them from the same axes costs nothing and makes one HUD row
 * speak one language.
 */
export const REFERENCE_ATOMS = Object.freeze({
  laser: { delivery: 'beam', element: 'laser' },
  blink: { delivery: 'blink', element: 'kinetic' },
  smash: { delivery: 'cone', element: 'kinetic' },
  charge: { delivery: 'dash', element: 'kinetic' },
  jump: { delivery: 'jump', element: 'kinetic' },
});

/** `{ laser: 'LASER BEAM', smash: 'KINETIC FAN', … }` — the five, named once. */
export const REFERENCE_NAMES = Object.freeze(Object.fromEntries(
  describedKit(Object.values(REFERENCE_ATOMS))
    .map((a, i) => [Object.keys(REFERENCE_ATOMS)[i], a.name])));

/**
 * The verb a delivery is written with, keyed by the last word of the name.
 *
 * `lands KINETIC LUNGE · DAMAGE for 26` is an identifier shouted into a machine
 * log; §6.6 asks for a sentence, and a sentence needs a verb that belongs to
 * the shape of the thing thrown. The three bare shape words at the end are the
 * ones the viewer still prints for the reference five.
 */
export const DELIVERY_VERB = Object.freeze({
  beam: 'burns', fan: 'sweeps', bolt: 'throws', mortar: 'lobs', field: 'drops',
  lunge: 'drives', blink: 'strikes with', aura: 'flares', leap: 'comes down with',
  laser: 'burns', smash: 'brings down', charge: 'runs in with',
});

/**
 * WHY A FIGHT ENDED — four codes from `src/core/sim.js`, one wording.
 *
 * §9.1 pins these four sentences and says the viewer's banner and the History
 * detail must read the same. There were three copies: `screens/live.js`,
 * `screens/history.js` and `src/viewer/main.js`. The viewer's is kept by
 * contract — it is its own page and cannot import a client module — and
 * `tools/checkfaults.mjs` is where the two are compared, the way it already
 * compares `OUR_FAULT`. The two CLIENT copies are not defensible, so this is
 * the one they import: the fight watched and the fight remembered end for the
 * same stated reason because it is the same string, not because two files were
 * kept in step by hand.
 */
export const REASON = Object.freeze({
  kill: 'knocked out',
  timeout: 'time ran out, more health left',
  'timeout-draw': 'time ran out, health even',
  'double-ko': 'both went down at once',
});

/** The article, chosen from the whole name: `AURA` takes "an", `VOID AURA` "a". */
export const aOrAn = (s) => (/^[aeiou]/i.test(String(s)) ? 'an ' : 'a ');

/** `kinetic lunge` → `drives`. A shape with no verb simply lands. */
export const verbFor = (name) =>
  DELIVERY_VERB[String(name || '').trim().split(/\s+/).pop().toLowerCase()] || 'lands';

/* ── the procedural glyph ────────────────────────────────────────────────── */

const INK = '#2E2E33';

/**
 * NINE DELIVERIES, NINE SILHOUETTES.
 *
 * How the ability is delivered — the big shape, drawn on a 64 grid with the
 * top-right corner left free for the satellite mark.
 *
 * The families are chosen so that the OUTLINE tells them apart before any
 * detail inside it does, at the 48 px the battle HUD draws them at and on a
 * phone: BEAM an emitter and a ray, FAN a wedge, BOLT a chevron, MORTAR a
 * dashed arc with a shell at the end of it, FIELD something dropped into a
 * dashed ring lying on the floor, LUNGE a barbed arrow, BLINK an arrow that
 * splits, AURA concentric rings standing around a body, LEAP a parabola
 * between two grounds.
 *
 * Five of them used not to be. BOLT was a filled disc with three trailing
 * scratches that read as nothing in particular; BLINK was two discs a player
 * took for FIELD; LEAP was two stacked chevrons, which is a "collapse" caret;
 * FIELD was true circles nobody could tell from AURA's, so the zone now lies
 * down in perspective and the aura stands up; and BEAM was three parallel
 * rules that read as a menu icon. LUNGE's plain open arrowhead, meanwhile, was
 * near enough to BLINK's that a kit holding both showed one picture twice —
 * which is the review's KINETIC LUNGE beside KINETIC LUNGE, drawn.
 *
 * MORTAR and LEAP are both arcs, so they are separated by what the arc is
 * made of rather than by its curvature, which no one can compare across two
 * tiles: a lobbed shell flies a DASHED trajectory and lands as a filled mass,
 * a leap is a solid path between the ground it leaves and the ground it takes.
 */
const DELIVERY_GLYPH = {
  beam: '<circle cx="10" cy="34" r="5"/><path d="M18 34h36"/>',
  cone: '<circle cx="10" cy="34" r="3.5"/><path d="M14 32.5L50 21M14 34h40M14 35.5L50 47"/><path d="M50 21a26 26 0 0 1 0 26"/>',
  bolt: '<path d="M18 22l12 12-12 12"/><path d="M34 18l16 16-16 16"/>',
  lob: '<path d="M9 51Q31 -1 53 45" stroke-dasharray="4 5.5"/><circle cx="53" cy="45" r="4.2" fill="#2E2E33" stroke="none"/><path d="M44 55h16"/>',
  zone: '<ellipse cx="31" cy="42" rx="20" ry="8.5" stroke-dasharray="4 5.5"/><path d="M31 16v14"/><path d="M24.5 24.5L31 31l6.5-6.5"/>',
  dash: '<path d="M6 34h30"/><path d="M52 34l-18-10 4 10-4 10z" fill="#2E2E33" stroke="none"/><path d="M4 24.5h9M4 43.5h9"/>',
  blink: '<path d="M7 35h15"/><path d="M22 35l17-11M22 35l17 13"/><path d="M39 24l-8 .1M39 24l-3.4 7.3M39 48l-8-.8M39 48l-2.8-7.5"/>',
  self: '<circle cx="30" cy="34" r="4.5" fill="#2E2E33" stroke="none"/><circle cx="30" cy="34" r="11"/><circle cx="30" cy="34" r="18" stroke-dasharray="3 6.5"/>',
  jump: '<path d="M10 53Q30 -13 50 53"/><path d="M4 53h14M42 53h14"/>',
};

/**
 * WHICH ELEMENT IT WEARS, IN THE STROKE ITSELF.
 *
 * The satellite mark says the element in a shape the size of a full stop; a
 * player reading three tiles under their creature reads the COLOUR of the line
 * first, and colour is the one channel a 48 px tile has left. So the delivery
 * shape is drawn in an ink that carries the element's hue.
 *
 * They are inks and not accents: each is the interface's own `--ink` carried
 * about a third of the way towards the element's colour, so the row still
 * reads as one drawn set on warm off-white — §1.7's quiet interface — and the
 * palest of them (FROST) measures 6.0:1 on the tile's disc and 5.3:1 on bare
 * `--sky`, against the 3:1 WCAG 1.4.11 asks of a 3 px graphic and the 4.5:1 it
 * asks of text. The palette's own coral and info could not carry this: `--accent`
 * on the same disc is 2.6:1. `kinetic` is plain ink — the grammar's neutral
 * element has no hue to carry, and it is much the commonest, so the coloured
 * ones read as saying something rather than as decoration.
 */
const ELEMENT_INK = {
  kinetic: INK,
  ember: '#7D4B43',
  frost: '#465C80',
  arc: '#574B78',
  void: '#3F394E',
  gravity: '#39465A',
  acid: '#4C6234',
  radiation: '#665A3C',
  laser: '#723D5B',
  time: '#4A4652',
};

/** The ink one ability's glyph is drawn in. Unknown elements stay neutral. */
const inkFor = (ability) => ELEMENT_INK[ability?.element] || INK;

/** `#7D4B43` → `[125, 75, 67]`, for the canvas that re-keys a generated icon. */
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/*
 * EVERY GLYPH THE SAME SIZE IN ITS CIRCLE.
 *
 * The shapes above are drawn where they read best on a 64 grid, and they are
 * not the same size: BEAM runs 47 units across and 18 down, LEAP is 36 by 28,
 * FIELD is a 32-unit disc. Painted into a fixed viewBox that is what the
 * player sees — one tile with a mark spanning three quarters of it and the
 * next with a speck in the middle, in the same row, under the same creature.
 * The generated icons had exactly this fault (a 20 % mark on a white sheet
 * beside a 60 % drawing) and it is what makes a set read as scraped rather
 * than drawn.
 *
 * So the viewBox is not fixed: it is the drawing's own ink box, re-centred and
 * padded to `SVG_MARGIN` — the same 12 % margin `reframeIcon` gives a
 * generated picture, so the two sources land on one optical size by
 * construction rather than by two numbers that have to be kept in step.
 *
 * These are PATH boxes; the stroke's half-width is added in code. The stroke
 * is scaled with the box, so a bigger drawing is not also a fatter one: the
 * rendered line stays exactly the 3/64 the kit's marks are drawn at.
 */
const DELIVERY_BOX = {
  beam: [5, 29, 54, 39],
  cone: [6.5, 21, 53.5, 47],
  bolt: [18, 18, 50, 50],
  lob: [9, 23.5, 60, 55],
  zone: [11, 16, 51, 50.5],
  dash: [4, 24, 52, 44],
  blink: [7, 24, 39, 48],
  self: [12, 16, 48, 52],
  jump: [4, 20, 56, 53],
};

/** Which element it wears — a small mark, drawn around its own origin. */
const ELEMENT_MARK = {
  kinetic: '<path d="M-7.4 5.6L0-7.6 7.4 5.6z"/>',
  ember: '<path d="M0-8.5c1.4 3.4 4.6 4.6 4.6 8.1a4.6 4.6 0 0 1-9.2 0C-4.6-3-1.4-4.6 0-8.5z"/>',
  frost: '<path d="M0-8.5V8.5M-7.4-4.2L7.4 4.2M-7.4 4.2L7.4-4.2"/>',
  arc: '<path d="M3.5-8.5L-4.5-1H1.5L-3 8.5"/>',
  void: '<circle r="7.5"/><circle r="3.2" fill="#2E2E33" stroke="none"/>',
  gravity: '<ellipse rx="8" ry="3.2"/><ellipse rx="8" ry="3.2" transform="rotate(60)"/><ellipse rx="8" ry="3.2" transform="rotate(120)"/>',
  acid: '<path d="M0-8.5C2.9-4 5.2-1.6 5.2 1A5.2 5.2 0 0 1-5.2 1C-5.2-1.6-2.9-4 0-8.5z"/><path d="M-8 6.5h2.6M5.4 6.5H8"/>',
  radiation: '<circle r="2.1" fill="#2E2E33" stroke="none"/><path d="M-3.4-5.2A6.6 6.6 0 0 1 3.4-5.2L0 .6z"/><path d="M-3.4-5.2A6.6 6.6 0 0 1 3.4-5.2L0 .6z" transform="rotate(120)"/><path d="M-3.4-5.2A6.6 6.6 0 0 1 3.4-5.2L0 .6z" transform="rotate(240)"/>',
  laser: '<path d="M-8.5 0h17"/><path d="M0-3.4L3.4 0 0 3.4-3.4 0z"/>',
  time: '<circle r="7.5"/><path d="M0-4.4V0.3l3.4 2.2"/>',
};

/**
 * WHEN TWO TILES WOULD BE THE SAME PICTURE.
 *
 * The satellite mark carries whatever tells this ability from its siblings.
 * Usually that is its element, and the element is what it draws. But a kit can
 * hold two abilities of the same element AND the same delivery — the review
 * found a creature wearing KINETIC LUNGE · DAMAGE and KINETIC LUNGE · STUN,
 * two tiles with one drawing between them, and a player who could see no
 * difference between two of their own three moves.
 *
 * In that case the element is the axis with nothing to say (both twins wear
 * it), so the mark stands down and the tie-breaker takes its place — the same
 * word `describe.js` had to add to the name, in the same corner, at the same
 * weight. The picture and the words then disagree about nothing.
 *
 * Keyed by the WORD rather than by the effect id, because the tie-breaker may
 * be an effect (DAMAGE), a channel (COOLDOWN) or, when nothing separates them
 * at all, a numeral — and a numeral has no picture, so those keep the element
 * and stay honest about being twins.
 */
const TIE_MARK = {
  DAMAGE: '<path d="M0-8.6L2.3-2.3 8.6 0 2.3 2.3 0 8.6-2.3 2.3-8.6 0-2.3-2.3z"/>',
  BURN: '<path d="M0-8.5c1.4 3.4 4.6 4.6 4.6 8.1a4.6 4.6 0 0 1-9.2 0C-4.6-3-1.4-4.6 0-8.5z"/>',
  KNOCK: '<path d="M-8.5 0h9"/><path d="M-3-4.6L1.6 0-3 4.6"/><path d="M5.6-7.4v14.8"/>',
  PULL: '<path d="M8.5 0h-9"/><path d="M3-4.6L-1.6 0 3 4.6"/><path d="M-5.6-7.4v14.8"/>',
  STUN: '<circle r="1.9" fill="#2E2E33" stroke="none"/><path d="M-6.2-4.6A7.6 7.6 0 0 1 6.2-4.6"/><path d="M-6.2 4.6A7.6 7.6 0 0 0 6.2 4.6"/>',
  ROOT: '<path d="M0-8.4v9.6"/><path d="M-5.6 7.4L0 1.2l5.6 6.2"/>',
  SHIELD: '<path d="M0-8.2l7 3v4.9c0 4.1-3.5 6.7-7 8.1-3.5-1.4-7-4-7-8.1v-4.9z"/>',
  HEAL: '<path d="M0-7.6v15.2M-7.6 0h15.2"/>',
  CLEANSE: '<path d="M-7.6 3.2A7.6 7.6 0 0 0 7.6 3.2"/><path d="M0-8.4v9.2"/><path d="M-3.8-4.6L0-8.4l3.8 3.8"/>',
  BLIND: '<path d="M-8.4 1.6A9.4 9.4 0 0 1 8.4 1.6"/><path d="M-6-6L6 6"/>',
  SILENCE: '<circle r="7.2"/><path d="M-5.1-5.1L5.1 5.1"/>',
  WALL: '<path d="M-8.4-4h16.8M-8.4 4h16.8"/><path d="M-2.6-8.4V-4M2.6 4v4.4"/>',
  BOOST: '<path d="M-6.4 1.6L0-4.8l6.4 6.4"/><path d="M-6.4 8L0 1.6 6.4 8"/>',
  WEAKEN: '<path d="M-6.4-1.6L0 4.8l6.4-6.4"/><path d="M-6.4-8L0-1.6 6.4-8"/>',
  SPEED: '<path d="M-8.4-3.4h12.6M-8.4 3.4h16.8"/>',
  TURNING: '<path d="M-6.6 4.2A7.8 7.8 0 1 1 6.6 4.2"/><path d="M3 2.2L6.9 4.6 9 .6"/>',
  ARMOR: '<path d="M0-8.2l7 3v4.9c0 4.1-3.5 6.7-7 8.1-3.5-1.4-7-4-7-8.1v-4.9z"/><path d="M-3.4-.6L-.6 2.2 4 -2.6"/>',
  COOLDOWN: '<circle r="7.4"/><path d="M0-4.4V.3l3.4 2.2"/>',
  RANGE: '<path d="M-8-5.4v10.8M8-5.4v10.8"/><path d="M-8 0h16"/>',
  VISION: '<path d="M-8.6 0S-5.2-5.2 0-5.2 8.6 0 8.6 0 5.2 5.2 0 5.2-8.6 0-8.6 0z"/><circle r="2.1" fill="#2E2E33" stroke="none"/>',
};

/** The word `describe.js` added after ` · `, if it added one. */
function tieWord(name) {
  const parts = String(name || '').split(' · ');
  return parts.length > 1 ? parts[parts.length - 1].trim().toUpperCase() : '';
}

/**
 * A monoline glyph for one ability, as a `data:` URI: ink on transparent, so
 * the tile's own glass shows through and the same drawing works on the light
 * creature screen and on the arena HUD.
 */
/* Nothing known about the shape at all — a tile drawn before its ability has
   arrived. A bolt would be an invention; a quiet dashed ring says the circle is
   real and its contents are not known yet. */
const UNKNOWN_GLYPH = '<circle cx="32" cy="34" r="15" stroke-dasharray="2.5 7.5"/>';
const UNKNOWN_BOX = [17, 19, 47, 49];

/*
 * The satellite mark's own square. The widest mark in either table reaches 8.8
 * units from its origin.
 *
 * It used to be drawn at .88 and dropped at (49.5, 14) — fifteen of the
 * drawing's sixty-four units, which is the review's "differ only by a ~6 px
 * superscript": on the reveal's 56 px tiles that is a five-pixel speck, and a
 * speck was the whole difference between two abilities of the same shape. Now
 * it is drawn at full size, a sixth of the tile, and reads as the second half
 * of the drawing rather than as a footnote on it — while the delivery shape
 * stays what the eye lands on first, being three times the size and in the
 * middle. Bigger than this and it starts colliding with the shapes that reach
 * into the top-right corner (the fan's arc, the aura's outer ring); the
 * corner is the mark's, and the drawings are laid out to leave it alone.
 */
const MARK_AT = [49.5, 14];
const MARK_SCALE = 1;
const MARK_REACH = 8.8 * MARK_SCALE;
const MARK_BOX = [
  MARK_AT[0] - MARK_REACH, MARK_AT[1] - MARK_REACH,
  MARK_AT[0] + MARK_REACH, MARK_AT[1] + MARK_REACH,
];

/* 3.0 on a 64 grid is the kit's weight: its LUNGE, BLOOD SCENT and CRUSH are
   bold monoline marks that survive a 36 px tile on a phone, and 2.6 read as a
   pencil sketch next to them. The element mark stays a step lighter so the
   delivery shape is still the thing the eye lands on first. */
const GLYPH_STROKE = 3;
const MARK_STROKE = 2.7;
/* The breathing room `reframeIcon` gives a generated picture, per side. */
const SVG_MARGIN = 0.12;

/** A box grown by half a stroke on every side — what the eye actually sees. */
const inked = ([x0, y0, x1, y1], half) => [x0 - half, y0 - half, x1 + half, y1 + half];

export function abilityFallbackSvg(ability = {}, size = 56) {
  const big = DELIVERY_GLYPH[ability?.delivery]
    || (ability?.delivery ? DELIVERY_GLYPH.bolt : UNKNOWN_GLYPH);
  const box = DELIVERY_BOX[ability?.delivery]
    || (ability?.delivery ? DELIVERY_BOX.bolt : UNKNOWN_BOX);
  /* The tie-breaker takes the corner when there is one, and then the corner is
     the axis that separates two twins — so it is drawn in plain ink, while an
     element mark wears the element's own colour like the shape does. */
  const tie = TIE_MARK[tieWord(ability?.name)];
  const mark = tie || ELEMENT_MARK[ability?.element];
  const ink = inkFor(ability);

  /* the whole drawing's extent: the delivery shape, plus the mark when one is
     drawn, each grown by the half-stroke that is painted outside its path */
  let [x0, y0, x1, y1] = inked(box, GLYPH_STROKE / 2);
  if (mark) {
    const [mx0, my0, mx1, my1] = inked(MARK_BOX, MARK_STROKE / 2);
    x0 = Math.min(x0, mx0); y0 = Math.min(y0, my0);
    x1 = Math.max(x1, mx1); y1 = Math.max(y1, my1);
  }
  const w = x1 - x0; const hgt = y1 - y0;
  /* a square viewBox — the tile is a circle and a stretched glyph inside one
     reads as a rendering fault — sized so the drawing's long side fills
     `1 - 2 × SVG_MARGIN` of it, with the short side centred in what is left */
  const side = Math.max(w, hgt) / (1 - 2 * SVG_MARGIN);
  const vx = x0 - (side - w) / 2;
  const vy = y0 - (side - hgt) / 2;
  /* the box grew, so the line grows with it and the rendered weight is the
     same 3/64 it has always been */
  const k = side / 64;
  const r = (n) => Math.round(n * 1000) / 1000;

  /* The paths carry `fill="#2E2E33"` on the solid parts of a shape (a filled
     arrowhead, a shell, a core), so a tinted group has to carry the tint into
     them as well — a coloured outline around a black core is two drawings. */
  const tinted = (paths, colour) => (colour === INK ? paths : paths.split(INK).join(colour));
  /* the group is scaled, and a scale multiplies the stroke with everything
     else: the width is divided back out so the mark stays one step lighter
     than the delivery shape however big the mark is drawn */
  const body = `<g stroke="${ink}" stroke-width="${r(GLYPH_STROKE * k)}">${tinted(big, ink)}</g>${
    mark
      ? `<g transform="translate(${MARK_AT[0]} ${MARK_AT[1]}) scale(${MARK_SCALE})"`
        + ` stroke="${tie ? INK : ink}" stroke-width="${r((MARK_STROKE * k) / MARK_SCALE)}">`
        + `${tinted(mark, tie ? INK : ink)}</g>`
      : ''}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r(vx)} ${r(vy)} ${r(side)} ${r(side)}"`
    + ` width="${size}" height="${size}"`
    + ` fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ── the tile ────────────────────────────────────────────────────────────── */

/*
 * IS THIS PICTURE A GLYPH, AND HOW BIG IS IT INSIDE ITS SQUARE?
 *
 * Two questions about a generated icon, answered from one reading of its
 * pixels, because they are asked together and the second one is why the first
 * one used to be so harsh.
 *
 * A generator does not always send back a mark. Over all 177 icons on the dev
 * stand: most are legible drawings, and a tail of three are a filled black bar,
 * a dark sliver and a near-blank sheet with a shield ghosted into one corner. A
 * circle with almost nothing in it is worse than the plain drawing this module
 * can always make, so a generated icon has to earn the tile.
 *
 * But a generator also does not agree with itself about SIZE. The median icon's
 * ink reaches barely half-way across the square it was drawn on, and across the
 * set that reach runs from 0.18 to 0.82 — which is why one tile's glyph filled
 * its circle while the two beside it were ten-pixel specks, and why a hand-made
 * set read as scraped stock art. The old test answered that by rejecting any
 * picture whose ink did not reach across its square, which threw away more than
 * half of a perfectly good icon set — every honest beam, every small centred
 * mark — because it could not tell "badly framed" from "not a drawing".
 *
 * So framing is fixed rather than punished (see `reframeIcon`), and what is
 * left to judge is the picture itself, measured on the box its own ink fills:
 *
 *   BLANK / SLAB   ink over the whole square. An empty sheet and a filled one.
 *   DUST           the box's long side. Under it there is nothing to enlarge.
 *   THIN           ink inside its own box. A speck and a lot of air.
 *   SOLID + FLAT   ink inside its own box, when the box is also a strip. A
 *                  black bar. Solid ink in a SQUARE box is a filled glyph — a
 *                  flame, an eclipse, a six-lobed flower — and stays.
 *
 * Measured, not guessed: on the stand these accept 174 of 177 and reject
 * exactly the three named above. The emptiest kept tile sits at 0.076 ink
 * inside its box against the rejected one's 0.057; the bar at 0.56 and 0.30
 * against the filled flower beside it at 0.54 and 0.78.
 *
 * What it cannot see is a picture of a numeral. That is the generator's prompt
 * to fix, not the browser's.
 *
 * It fails OPEN. A cross-origin icon taints the canvas and `getImageData`
 * throws; an old browser has no canvas at all. In both cases the icon is kept
 * unframed: this is a filter for known-bad pictures, not a licence to blank the
 * tile.
 *
 * `reframeIcon` is exported for the battle HUD, which paints its own tiles:
 * `screens/live.js` sets a background image on the viewer's `.cd` chips rather
 * than building an `abilityTile`, and one creature must not have legible icons
 * on its page and pale smudges on a white disc in its fight. That call has not
 * been made yet — the HUD still points CSS straight at the icon URL — and
 * until it is, or until the same trim happens at ingest in
 * `src/server/forge/icons.js`, the two sources are two weights in one row.
 */
const GRID = 128;        // the grid a picture is judged and framed on
const INK_LUM = 0.8;     // a pixel this much darker than the ground is ink
const BLANK = 0.004;     // ink over the square: under it the sheet is empty
const SLAB = 0.55;       // ink over the square: over it it is a filled block
const DUST = 0.16;       // the ink box's long side, as a fraction of the square
const THIN = 0.062;      // ink inside its own box: under it, a speck and air
const SOLID = 0.45;      // ink inside its own box, when the box is also…
const FLAT = 0.45;       // …flatter than this: together, a bar

/** One reading of a picture: how much ink, and the box it lives in. */
function measure(img) {
  if (!img.naturalWidth || !img.naturalHeight) return null;
  const c = document.createElement('canvas');
  c.width = GRID; c.height = GRID;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  /* white ground first: a transparent PNG would otherwise read as all ink */
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, GRID, GRID);
  ctx.drawImage(img, 0, 0, GRID, GRID);
  const px = ctx.getImageData(0, 0, GRID, GRID).data;
  let ink = 0; let x0 = GRID; let y0 = GRID; let x1 = -1; let y1 = -1;
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    if (lum > INK_LUM) continue;
    ink++;
    const x = p % GRID; const y = (p / GRID) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const cover = ink / (GRID * GRID);
  if (x1 < 0) return { cover: 0, x0: 0, y0: 0, x1: -1, y1: -1, bw: 0, bh: 0, aspect: 0, density: 0 };
  const bw = (x1 - x0 + 1) / GRID; const bh = (y1 - y0 + 1) / GRID;
  return {
    cover, x0, y0, x1, y1, bw, bh,
    aspect: Math.min(bw, bh) / Math.max(bw, bh),
    density: cover / (bw * bh),
  };
}

/** The verdict, from a reading. */
function judge(m) {
  if (m.cover < BLANK || m.cover > SLAB) return false;
  if (Math.max(m.bw, m.bh) < DUST) return false;
  if (m.density < THIN) return false;
  return !(m.density > SOLID && m.aspect < FLAT);
}

/*
 * ONE OPTICAL SIZE FOR A WHOLE ROW.
 *
 * The picture is cut out of its own margin and re-set on a fresh square with a
 * fixed one, keeping its aspect: whatever the generator framed, every tile then
 * shows a glyph of the same optical size, and three circles under one creature
 * read as a set. `MARGIN` is `SVG_MARGIN`'s twin on purpose — the drawing
 * builds the very same margin into its own viewBox — so a generated tile and a
 * drawn one are the same picture size once `fitGlyphBox` gives them the same
 * box.
 *
 * Re-framed at 256, comfortably over twice the largest tile the product draws,
 * so the enlargement is done once from the 512-pixel original rather than by
 * the compositor from a 64-pixel one.
 *
 * AND THE WHITE SHEET IS TAKEN AWAY WITH THE MARGIN. The generator returns ink
 * on an opaque white square, so the tile it filled was a white disc — while the
 * drawing beside it, in the very same row of the very same interface, was ink
 * on the tile's own glass. Two sources, two surfaces, and §2.3's "circles with
 * a `--glass-strong` fill" only true of one of them. A monoline drawing carries
 * everything it has in its DARKNESS, so the picture is re-keyed: how dark a
 * pixel is becomes how opaque it is, and what is left is the interface's own
 * ink on nothing. The white sheet goes, the JPEG's ringing around each stroke
 * goes with it, and generated and drawn tiles finally sit on one surface.
 *
 * This is the browser's half of it. The stored blob is still the raw picture,
 * so the battle HUD — which paints the icon as a CSS background straight from
 * its URL — is not helped: the same trim belongs at ingest in
 * `src/server/forge/icons.js`, and until it is there this at least keeps every
 * tile built through `abilityTile()` honest.
 */
const MARGIN = 0.12;   // the breathing room, per side — `SVG_MARGIN`'s twin
const OUT = 256;       // the re-framed square

/*
 * AND THE STROKE IS BROUGHT UP TO THE INTERFACE'S OWN WEIGHT.
 *
 * Re-keying darkness to opacity is only half a translation. The generator
 * draws with a mid-grey line — measured over the icons on the stand, most ink
 * sits between 0.55 and 0.85 luminance — so `1 − lum` handed the tile strokes
 * at a third of full ink, and the paper never quite went either: a 0.97 sheet
 * left a two-percent wash across the whole circle. Beside a procedural glyph
 * drawn in solid `--ink`, that is the pale-smudge-next-to-a-drawing the review
 * saw in the flagship capture.
 *
 * So the key is a RAMP with both ends nailed down: anything lighter than
 * `KEY_PAPER` is paper and goes to nothing, anything darker than `KEY_INK` is
 * ink and goes to full strength, and the span between them keeps the
 * antialiasing that stops the result looking cut out with scissors.
 *
 * Then it is thickened. A 3-pixel stroke inside a 256-pixel square is a fifth
 * of a pixel once the browser has squeezed that square into a 52-pixel glyph
 * box — full ink averaged down to a grey hairline, which is arithmetic and not
 * something contrast can fix. `BOLD` grows the covered area by two cells
 * before the downscale, so what survives it is about a pixel and a half: the
 * weight `abilityFallbackSvg` renders at. More than two closes the counters of
 * the smaller marks; less does not survive a phone.
 */
const KEY_PAPER = 0.90;   // lighter than this is the sheet
const KEY_INK = 0.55;     // darker than this is a stroke, at full strength
const BOLD = 2;           // cells of the OUT grid the coverage grows by

/**
 * Grow coverage by `r` cells, as two one-dimensional passes.
 *
 * A max filter, so a stroke gets wider and the paper around it stays paper —
 * a blur would have spread grey over the whole square instead.
 */
function thicken(a, n, r) {
  if (r < 1) return;
  const tmp = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const row = y * n;
    for (let x = 0; x < n; x++) {
      let m = 0;
      const lo = Math.max(0, x - r); const hi = Math.min(n - 1, x + r);
      for (let i = lo; i <= hi; i++) if (a[row + i] > m) m = a[row + i];
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      let m = 0;
      const lo = Math.max(0, y - r); const hi = Math.min(n - 1, y + r);
      for (let i = lo; i <= hi; i++) if (tmp[i * n + x] > m) m = tmp[i * n + x];
      a[y * n + x] = m;
    }
  }
}

function paint(img, m, rgb) {
  const W = img.naturalWidth; const H = img.naturalHeight;
  /* one grid cell of bleed on each side, so an antialiased stroke end is not
     shaved off by the coarseness of the grid the box was found on */
  const sx = Math.max(0, (m.x0 - 1) / GRID) * W;
  const sy = Math.max(0, (m.y0 - 1) / GRID) * H;
  const sw = Math.min(1, (m.x1 + 2) / GRID) * W - sx;
  const sh = Math.min(1, (m.y1 + 2) / GRID) * H - sy;
  if (!(sw > 0) || !(sh > 0)) return '';
  const c = document.createElement('canvas');
  c.width = OUT; c.height = OUT;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const box = OUT * (1 - 2 * MARGIN);
  const k = Math.min(box / sw, box / sh);
  const dw = sw * k; const dh = sh * k;
  ctx.drawImage(img, sx, sy, sw, sh, (OUT - dw) / 2, (OUT - dh) / 2, dw, dh);

  const id = ctx.getImageData(0, 0, OUT, OUT);
  const px = id.data;
  /* darkness → coverage, over the margin's untouched transparency */
  const cov = new Float32Array(OUT * OUT);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    if (!px[i + 3]) continue;
    const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255;
    cov[p] = Math.max(0, Math.min(1, (KEY_PAPER - lum) / (KEY_PAPER - KEY_INK)));
  }
  thicken(cov, OUT, BOLD);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2];
    px[i + 3] = Math.round(255 * cov[p]);
  }
  ctx.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * Judge and re-frame in one pass.
 *
 * `{ ok }` is whether the picture earned the tile; `src` is the re-framed
 * picture when there is one and `''` when the tile should keep what it has —
 * because the reading failed and the icon is being trusted, or because the
 * canvas would not paint.
 *
 * `ink` is the colour the surviving strokes are re-keyed to. It defaults to
 * the interface's ink and is the ability's element ink when the caller knows
 * one, so a generated row and a drawn row wear the same nine colours: the
 * re-key is already throwing the generator's grey away, and putting `--ink`
 * back rather than the element's would have made COLOUR the one thing that
 * betrays which of the two sources a tile came from.
 */
export function reframeIcon(img, ink = INK) {
  try {
    const m = measure(img);
    if (!m) return { ok: true, src: '' };
    if (!judge(m)) return { ok: false, src: '' };
    return { ok: true, src: paint(img, m, rgbOf(ink)) };
  } catch { return { ok: true, src: '' }; }
}

/*
 * A ROW THAT IS BUILT ONE TILE AT A TIME IS STILL A ROW.
 *
 * The group used to close the moment every tile it knew about had answered —
 * and the Birth reveal appends its three tiles one per 200 ms beat (§6.4), so
 * the first tile was a group of one, settled alone, and the reveal could show
 * one generated icon standing beside two procedural glyphs: the exact mixed
 * row the grouping exists to prevent. So a group stays open for a short window
 * after the last tile joined it, and every tile that arrives inside that window
 * re-opens it. `WAIT` is still the ceiling: an image that never loads and never
 * errors must not hold the row hostage, however many beats it is fed.
 */
const GROUPS = new Map();
const WAIT = 2500;
/* Comfortably over Birth's 200 ms beat and under a blink: a row assembled by a
   screen in one pass never waits for it, because its tiles are all in before
   the first icon comes back off the wire. */
const OPEN = 260;

const clock = () => (typeof performance === 'object' && performance ? performance.now() : Date.now());

function group(creatureId) {
  let g = GROUPS.get(creatureId);
  if (!g) {
    g = { shots: [], done: 0, ok: true, timer: 0, hold: 0, joined: clock() };
    GROUPS.set(creatureId, g);
    g.timer = setTimeout(() => settle(creatureId, true), WAIT);
  } else {
    g.joined = clock();
  }
  return g;
}

function settle(creatureId, forced = false) {
  const g = GROUPS.get(creatureId);
  if (!g) return;
  if (!forced) {
    if (g.done < g.shots.length) return;
    const left = g.joined + OPEN - clock();
    /* every tile has answered, but the row may not be finished being built */
    if (left > 0) { clearTimeout(g.hold); g.hold = setTimeout(() => settle(creatureId), left + 16); return; }
  }
  clearTimeout(g.timer);
  clearTimeout(g.hold);
  GROUPS.delete(creatureId);
  for (const shot of g.shots) {
    if (g.ok && shot.dataset.verdict === 'good') { shot.dataset.ok = '1'; cover(shot); }
    else shot.remove();
  }
}

/**
 * ONE BOX FOR BOTH PICTURES.
 *
 * `ui/components.css` gives the generated icon the WHOLE ring — `inset: 0`,
 * `object-fit: cover` — because it used to be ink on an opaque white square
 * and anything less made a white box inside a circle. A re-framed icon is not
 * that any more: `paint()` hands back a square of ink on nothing with a known
 * 12 % margin, which is the same thing `abilityFallbackSvg` builds. Left at
 * full bleed it therefore drew its glyph at 76 % of the circle while the
 * drawing beside it — inset 9 %, and carrying its own 12 % — drew at 62 %, and
 * a creature whose icons had arrived wore visibly heavier marks than one whose
 * had not. So a normalised icon is given the drawing's box, and the two
 * sources land on one optical size by arithmetic rather than by eye.
 *
 * Only when it IS normalised: a canvas that could not be read (tainted, or
 * absent) leaves the raw white-ground picture, and that one still has to fill
 * the circle or it is a white square sitting in one.
 */
function fitGlyphBox(shot) {
  shot.style.inset = '9%';
  shot.style.width = '82%';
  shot.style.height = '82%';
  shot.style.objectFit = 'contain';
  shot.style.borderRadius = '0';
}

/**
 * THE DRAWING STEPS BACK WHEN THE PICTURE ARRIVES.
 *
 * The glyph is painted under the icon and was left there on the reasoning that
 * an icon "lies on top, opaque". It did — until `paint()` started re-keying
 * darkness into opacity to get rid of the white sheet (see `reframeIcon`).
 * From then on the accepted icon was ink on NOTHING, the drawing underneath
 * showed straight through it, and every generated tile on the creature page
 * carried two pictures at once: a crisp vector arrow ruled across a blurred
 * raster spike. Two icon languages, not merely in one row but inside one
 * circle.
 *
 * So the floor is dismissed once the ceiling is real — on the same curve the
 * icon arrives on, which makes it a dissolve rather than a swap, and never
 * before, so there is still no frame with an empty circle in it. It is only
 * dimmed and not removed because `settle()` is the one place that decides, and
 * a node still in the tree is a node a later decision can still reach.
 */
function cover(shot) {
  const under = shot.parentNode && shot.parentNode.querySelector('img[data-kind="glyph"]');
  if (!under) return;
  under.style.transition = 'opacity var(--d-ui) var(--ease)';
  under.style.opacity = '0';
}

function verdict(creatureId, shot, good) {
  const g = GROUPS.get(creatureId);
  if (!g || shot.dataset.verdict) return;
  shot.dataset.verdict = good ? 'good' : 'bad';
  g.done++;
  if (!good) g.ok = false;
  settle(creatureId);
}

/**
 * THE NAME ON ONE LINE, THE TIE-BREAKER ON A QUIETER SECOND.
 *
 * The whole name — element AND delivery, §9.1 — is set on a single unbreakable
 * line small enough to hold it (the longest the grammar can build, `GRAVITY
 * MORTAR`, measures about 96 px at 9.5 px with .14em of tracking). Wrapping it
 * is what once left three captions on three different baselines, with the block
 * of type standing taller than the tiles it describes; the reference's captions
 * are LUNGE, BLOOD SCENT, CRUSH, one line each, and the row is quiet because
 * of it.
 *
 * Under it goes the `· DAMAGE` the grammar adds when — and only when — a kit
 * holds two abilities of the same shape and element (`abilitiesOf()` compares
 * the whole list; a suffix in the name IS the collision, which is why no tile
 * has to be told about its siblings). It used to be dropped here and left to
 * the tooltip, and the review found the consequence twice over: the specimen
 * page and the reveal showed KINETIC LUNGE beside KINETIC LUNGE, two of a
 * creature's three moves with one caption between them, while the HUD one
 * screen away named the same pair KINETIC LUNGE · DAMAGE and · STUN. §9.1
 * legislates the extra line precisely so those two places agree, and on a
 * phone the tooltip costs a tap the reveal never gives you.
 *
 * IT IS QUIETER BY SIZE AND WEIGHT, NOT BY COLOUR OR OPACITY. The caption sits
 * on the arena photograph on the creature page, where `ui/components.css`
 * darkens it to `--ink-soft` and gives it a halo to reach 4.9:1; dimming this
 * line to the .62 opacity the review asked for would put the one word that
 * tells two abilities apart at about 3:1 — quieter is only worth having while
 * it is still readable. A step down in size, a step down in weight and the
 * leading `·` are enough of a step back.
 *
 * BOTH LINES ARE ALWAYS RESERVED. A row where one tile carries a tie-breaker
 * and its neighbour does not would otherwise end on two baselines, which is
 * the ragged bottom edge this box exists to keep flat.
 *
 * The type is set here rather than in `ui/components.css` because the size and
 * the no-wrap are the two halves of one promise — a sheet that changed one
 * without the other would put the ragged row back.
 */
const LABEL_TYPE = { fontSize: '9.5px', letterSpacing: '.14em', whiteSpace: 'nowrap' };
/* `inherit`, so the tie-breaker follows the name's own alignment: the creature
   page stands its captions on the column's left edge (`ui/screens/creature.css`)
   and every other screen centres them under the circle. It is nested inside the
   name for the same reason — one rule to align, one colour to inherit. */
const TIE_TYPE = {
  display: 'block', marginTop: '1.5px', fontSize: '8.5px', fontWeight: '500',
  letterSpacing: '.16em', whiteSpace: 'nowrap', textAlign: 'inherit',
};

function abilityLabel(name) {
  const [head, ...rest] = String(name || '').split(' · ');
  const tie = rest.join(' · ').trim();
  return h('div.ability-name',
    /* two lines' worth, whether or not the second one is used */
    { style: { minHeight: '2.4em' } },
    h('span.ability-name-main', { style: LABEL_TYPE },
      head,
      tie ? h('span.ability-name-mark', { style: TIE_TYPE }, `· ${tie}`) : null));
}

/**
 * `ability` is `{ name, blurb, delivery, element, … }` — the server's
 * description or `describedKit()`'s. `label: true` writes the name under
 * the circle; the HUD does not, the creature screen does.
 */
export function abilityTile({ creatureId = null, slot = 0, ability = null, size = 56, label = false, side = null } = {}) {
  /*
   * THE DRAWING IS THE FLOOR, THE ICON IS THE CEILING.
   *
   * Both live in the tile at once. The procedural glyph is painted first and
   * stays while the generated icon is on the wire, and for ever if it never
   * arrives — so there is no empty circle at any point, and a tile's loading
   * state and its failure state are the same honest picture. The icon lies on
   * top and is revealed only once it has been looked at and found to be a
   * drawing; the drawing is dismissed on the same beat (`cover`), because a
   * re-framed icon is transparent and two pictures would otherwise share one
   * circle.
   */
  const glyph = h('img', {
    alt: '',
    dataset: { kind: 'glyph' },
    src: abilityFallbackSvg(ability || {}, size),
  });
  const layers = [glyph];

  let shot = null;
  if (creatureId) {
    shot = h('img', {
      alt: '',
      dataset: { kind: 'icon' },
      src: `${API()}/api/creature/${creatureId}/icon/${slot}`,
    });
    group(creatureId).shots.push(shot);
    shot.addEventListener('load', () => {
      /* our own re-framed picture coming back: it has already been judged */
      if (shot.dataset.norm === '1') return;
      /* Judged and re-framed while it is still invisible — the tile is revealed
         by `settle()`, not by this load — so a player never sees the swap. */
      const { ok, src } = reframeIcon(shot, inkFor(ability));
      if (src) { shot.dataset.norm = '1'; shot.src = src; fitGlyphBox(shot); }
      verdict(creatureId, shot, ok);
    });
    /* 404, a dead network, a broken blob — the drawing is already underneath */
    shot.addEventListener('error', () => {
      if (shot.dataset.norm === '1') { shot.remove(); return; }
      verdict(creatureId, shot, false);
    });
    layers.push(shot);
  }

  /* Whatever the tile is actually showing at the moment the card opens — the
     generated icon once it has earned the tile, the drawing until then. The
     tooltip repeats the picture rather than describing a different one. */
  const shown = () => (shot && shot.dataset.ok === '1' ? (shot.currentSrc || shot.src) : glyph.src);

  const name = ability?.name || 'Ability';
  const el = h('button.ability', {
    type: 'button',
    dataset: { slot: String(slot), ...(side ? { side } : {}) },
    'aria-label': ability?.blurb ? `${name}. ${ability.blurb}` : name,
  },
  h('div.ability-ring', ...layers),
  label ? abilityLabel(name) : null);

  /*
   * A CUSTOM PROPERTY IS NOT A STYLE PROPERTY.
   *
   * `h()` writes its `style` object with `Object.assign`, and a
   * `CSSStyleDeclaration` has no setter for a name it does not know: `--ab`
   * assigned that way lands on the JS object and never reaches CSS. The tile
   * then silently used `var(--ab, 56px)`'s fallback — so the creature page's
   * 64 px abilities (§6.5) were 56, the same size as the Birth reveal's, and
   * the one place the specimen's own moves are meant to be biggest was not.
   * `setProperty` is the only way in.
   */
  el.style.setProperty('--ab', `${size}px`);
  /*
   * FOCUS DOES NOT LAND UNDER THE TAB BAR.
   *
   * On a phone the chrome is a fixed 50 px bar plus the safe-area inset, and
   * the browser scrolls a newly focused control to the very bottom of the
   * viewport — which put the focused ability under it, circle and caption
   * both. A scroll margin is the browser's own answer to a fixed overlay; the
   * top figure clears the season chip for the same reason.
   */
  el.style.scrollMarginBlock = '104px calc(96px + env(safe-area-inset-bottom))';

  /* Below, not above: an ability row stands under the thing it belongs to —
     the stat tiles on the creature page, the name on the birth card — and a
     card opened upward lands on them. */
  attachTooltip(el, () => ({ title: name, body: ability?.blurb || '', icon: shown() }), { place: 'below' });
  return el;
}
