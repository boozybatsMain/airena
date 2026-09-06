/**
 * English, deterministic naming for a creature's abilities (docs/REDESIGN.md §8.3).
 *
 * The grammar names an ability by four axes — delivery, effects, channel,
 * element — and the player never sees any of them. What the player sees is a
 * NAME ("EMBER BEAM") and one short paragraph of plain facts ("A straight beam
 * that stops at the first obstacle. Deals 26 damage.").
 *
 * Two rules hold this file together.
 *
 * DETERMINISTIC. No model is called, ever. The same ability always produces the
 * same name and the same sentence, on the server, in the battle HUD and on the
 * creature page — three surfaces that would otherwise drift apart the first
 * time one of them was regenerated.
 *
 * THE NUMBERS COME FROM THE REGISTRY, THE WORDS LIVE HERE. Magnitudes and
 * durations are read from `EFFECTS`/`DELIVERIES` so a balance change moves the
 * text with it; a hand-written "26 damage" here would be a second copy of the
 * balance table, and it would be wrong the day damage changes. The English
 * wording is local because the registry's own labels serve the model prompt and
 * the internal report, not the player.
 */

import { CHANNELS, DELIVERIES, EFFECTS, ELEMENTS } from './registry.js';

/** Element half of the name. */
export const ELEMENT_WORD = {
  kinetic: 'KINETIC',
  ember: 'EMBER',
  frost: 'FROST',
  arc: 'ARC',
  void: 'VOID',
  gravity: 'GRAVITY',
  acid: 'ACID',
  radiation: 'RAD',
  laser: 'LASER',
  time: 'TIME',
};

/**
 * Delivery half of the name.
 *
 * Deliberately not a transliteration of the internal id: `cone` reads as a
 * geometry lesson and `lob` as nothing at all. FAN and MORTAR say what the
 * player will actually watch happen.
 */
export const DELIVERY_WORD = {
  beam: 'BEAM',
  cone: 'FAN',
  bolt: 'BOLT',
  lob: 'MORTAR',
  zone: 'FIELD',
  dash: 'LUNGE',
  blink: 'BLINK',
  self: 'AURA',
  jump: 'LEAP',
};

/**
 * First sentence of the blurb: what the shape does.
 *
 * Written here rather than read from `DELIVERIES[x].doc` on purpose. The
 * registry doc is an instruction to the model — it carries caveats the model
 * needs and the player does not ("goes along the ground, so it misses anyone
 * who left it"). This table is the player's sentence: one clause, no exceptions.
 */
export const DELIVERY_DOC = {
  beam: 'A straight beam that stops at the first obstacle.',
  cone: 'A wide, fast fan close to the ground.',
  bolt: 'A bolt that takes time to fly, so it can be stepped around.',
  lob: 'An arc that clears obstacles and bursts where it lands.',
  zone: 'A field on the floor that keeps working for a few seconds.',
  dash: 'A lunge forward that hits everything in its path.',
  blink: 'An instant step with a moment of invulnerability.',
  self: 'Held on the creature itself.',
  jump: 'A leap off the ground.',
};

/** Channel half of the optional third sentence. */
export const CHANNEL_WORD = {
  speed: 'speed',
  turn: 'turning',
  damage: 'damage',
  armor: 'armour',
  cooldown: 'cooldown',
  range: 'range',
  vision: 'vision',
};

/**
 * How each effect reads as ONE WORD.
 *
 * Not a second copy of the verb table below: this is the tie-breaker glued to a
 * name when two abilities of one kit land on the same two axes, and there it has
 * to be a noun the size of a label — "STUN", not "stuns".
 */
export const EFFECT_WORD = {
  damage: 'DAMAGE',
  burn: 'BURN',
  knock: 'KNOCK',
  pull: 'PULL',
  stun: 'STUN',
  root: 'ROOT',
  shield: 'SHIELD',
  heal: 'HEAL',
  cleanse: 'CLEANSE',
  blind: 'BLIND',
  silence: 'SILENCE',
  wall: 'WALL',
  boost: 'BOOST',
  weaken: 'WEAKEN',
};

/**
 * How each effect reads as a verb.
 *
 * `mag` and `duration` arrive from the registry, so the sentence is a fact and
 * not a claim. Effects whose magnitude is not a number the player can act on
 * (a knockback in metres, a stun in tenths of a second) are stated without one:
 * "and stuns" is the whole truth at the resolution the player reads at.
 */
const EFFECT_PHRASE = {
  damage: (e) => `deals ${num(e.mag)} damage`,
  burn: (e) => `burns for ${num(e.mag)} per second over ${num(e.duration)} seconds`,
  knock: () => 'knocks back',
  pull: () => 'pulls in',
  stun: () => 'stuns',
  root: () => 'roots',
  shield: (e) => `shields ${num(e.mag)}`,
  heal: (e) => `heals ${num(e.mag)}`,
  cleanse: () => 'cleanses',
  blind: () => 'blinds',
  silence: () => 'silences',
  wall: () => 'raises a wall',
  boost: (e) => `boosts by ×${num(e.mag)}`,
  weaken: (e) => `weakens by ×${num(e.mag)}`,
};

/** 26 → "26", 3.0 → "3", 1.35 → "1.35". No trailing zeros in player copy. */
function num(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100);
}

/**
 * "a" · "a and b" · "a, b, and c" — the shape English readers expect.
 *
 * TWO ITEMS TAKE NO COMMA. The pair used to read "Deals 26 damage, and knocks
 * back", and a comma before "and" in a two-item list is simply wrong — it is
 * the serial comma applied where there is no series. Every two-effect ability
 * in the product carries this sentence (creature page, HUD tooltip, birth
 * reveal), so the error was on screen three times per fight.
 */
function joinPhrases(list) {
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

const upperFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Unknown ids still have to read as something: SHIELD, LOB, ARC-9 all work. */
const fallbackWord = (id) => String(id || '').replace(/[^a-z0-9]+/gi, ' ').trim().toUpperCase();

/**
 * One ability, described.
 *
 * Accepts a raw grammar entry (`{ delivery, effects, channel, element }`) —
 * that is exactly the shape stored in `creature.kit_json` and in the match
 * snapshot, so callers never have to reshape anything.
 */
export function describeAbility(skill) {
  const s = skill && typeof skill === 'object' ? skill : {};
  const delivery = typeof s.delivery === 'string' ? s.delivery : null;
  const element = typeof s.element === 'string' ? s.element : null;
  const channel = typeof s.channel === 'string' && s.channel ? s.channel : null;
  const effects = Array.isArray(s.effects) ? s.effects.filter((e) => typeof e === 'string') : [];

  const elementWord = ELEMENT_WORD[element] || fallbackWord(element);
  const deliveryWord = DELIVERY_WORD[delivery] || fallbackWord(delivery);
  /* An ability with no element is legal (the element axis costs nothing and can
     be absent in legacy rows); the name then is just the shape. */
  const name = [elementWord, deliveryWord].filter(Boolean).join(' ') || 'ABILITY';

  const sentences = [];
  const doc = DELIVERY_DOC[delivery];
  if (doc) sentences.push(doc);

  const phrases = effects
    .map((id) => {
      const def = EFFECTS[id];
      const make = EFFECT_PHRASE[id];
      if (!def || !make) return null;
      return make(def);
    })
    .filter(Boolean);
  if (phrases.length) sentences.push(`${upperFirst(joinPhrases(phrases))}.`);

  if (channel && (CHANNEL_WORD[channel] || CHANNELS[channel])) {
    sentences.push(`Channelled through ${CHANNEL_WORD[channel] || channel}.`);
  }

  const d = DELIVERIES[delivery] || null;
  return {
    name,
    /* Short label under the tile in the battle HUD (§5.3): the shape alone,
       because the element is already the tile's colour. */
    short: deliveryWord || name,
    delivery,
    effects,
    channel,
    element,
    blurb: sentences.join(' '),
    /* Two facts the icon prompt and the tooltip both want, straight from the
       registry so they cannot drift: how far it reaches and how long it winds
       up. `null` where the shape has neither (an aura has no range). */
    range: d ? (d.range ?? d.distance ?? null) : null,
    windup: d ? (d.windup ?? null) : null,
  };
}

/**
 * Roman, because a trailing arabic numeral is eaten downstream.
 *
 * The battle HUD strips `/\s+\d+(\.\d+)?$/` off the label it reads, since the
 * viewer writes the cooldown into the same text node ("LUNGE 3.2"). A name
 * ending in " 2" would arrive on screen as "KINETIC LUNGE ·" — the separator
 * with nothing after it.
 */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/**
 * TWO ABILITIES OF ONE KIT MAY NOT SHARE A NAME.
 *
 * The name is element + shape, and nothing stops a kit from holding two
 * abilities on the same two axes — a lunge that stuns and a lunge that knocks
 * back are one honest kit, and both were called KINETIC LUNGE. The cost of that
 * is paid in the one place the player has to act on it: the two HUD tiles carry
 * the same label and the same tooltip, so when one comes off cooldown there is
 * no way to tell which. Fight beats read the same way — "lands KINETIC LUNGE
 * for 20" and "lands KINETIC LUNGE for 26" are two different abilities.
 *
 * The tie-breaker is the effect that only THIS slot has, because that is the
 * difference the player would name themselves. Failing that, the channel, then
 * the slot's own leading effect — "KINETIC LUNGE · DAMAGE" next to "KINETIC
 * LUNGE · STUN" is the plain one and the one that stuns, which is exactly the
 * distinction a player draws out loud, even though both do damage. A number is
 * the last resort and not the first: "LUNGE · II" tells the player nothing
 * except that we could not be bothered, so it is kept for the one case where
 * nothing else is true — two slots identical on every axis.
 */
function disambiguate(list) {
  const byName = new Map();
  for (const a of list) {
    const same = byName.get(a.name);
    if (same) same.push(a); else byName.set(a.name, [a]);
  }

  for (const group of byName.values()) {
    if (group.length < 2) continue;

    const marks = group.map((a) => {
      const others = group.filter((b) => b !== a);
      const only = a.effects.find((id) => EFFECT_WORD[id]
        && !others.some((b) => b.effects.includes(id)));
      if (only) return EFFECT_WORD[only];
      if (a.channel && !others.some((b) => b.channel === a.channel)) {
        return String(CHANNEL_WORD[a.channel] || a.channel).toUpperCase();
      }
      const first = a.effects.find((id) => EFFECT_WORD[id]);
      return first ? EFFECT_WORD[first] : null;
    });

    group.forEach((a, i) => {
      /* A mark that two slots of the group landed on is not a mark: it renames
         the collision instead of resolving it. Those fall through to the
         number, and only those. */
      const unique = marks[i] && marks.filter((m) => m === marks[i]).length === 1;
      const mark = unique ? marks[i] : (ROMAN[a.slot] || `#${a.slot + 1}`);
      a.name = `${a.name} · ${mark}`;
      /* The short label lives under a 36 px tile on a phone and holds one word.
         The shape word is the one thing the two tiles already agree on, so it
         is the word with nothing to say; the tie-breaker takes its place. */
      a.short = mark;
    });
  }
  return list;
}

/**
 * A whole kit, described, in slot order.
 *
 * `key` is the internal name the brain calls (`k1`, `k2`, `k3`) and the viewer
 * writes into `.cd[data-skill]`; the client matches tiles to abilities by it.
 * `slot` is the same thing as an index, which is what the icon URL uses.
 *
 * The kit is described as a WHOLE and not ability by ability, because names are
 * only unique against each other — see `disambiguate()`.
 */
export function abilitiesOf(kit) {
  const list = Array.isArray(kit) ? kit : [];
  return disambiguate(list.map((skill, i) => ({
    slot: i,
    key: `k${i + 1}`,
    ...describeAbility(skill),
  })));
}

/** Elements that exist in the grammar — used by callers that colour a tile. */
export const KNOWN_ELEMENTS = Object.keys(ELEMENTS);
