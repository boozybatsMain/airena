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
 * ── THE NUMBERS THE PLAYER READS ARE THE NUMBERS THE FIGHT USES ────────────
 *
 * This block is the answer to review finding 4 (07.09): the HUD printed the
 * registry's BASE magnitudes and the simulation fought with the COMPILED ones,
 * so a fan that hits for 33.6 was advertised at 24, a two-effect aura that
 * shields 10.2 and heals up to 13.6 said 12 and 16, and a field that deals 6.72
 * five times said "24 damage". Seven rows of the review's table, every one of
 * them wrong, on the tooltip, the creature page and the birth reveal at once.
 *
 * WHY THE MATH IS HERE AND NOT IMPORTED FROM `compile.js`, which owns it.
 * `describe.js` is served to the BROWSER — `src/client/ui/ability.js` imports
 * it, and the client is shipped as plain ES modules with no bundler — while
 * `compile.js` imports `src/core/config.js`, which reads the tuning overlay
 * with `node:fs`. Importing the compiler here would 404 the client's whole
 * module graph, which is a failure this repository has already had once
 * (`registry.js`, the same note).
 *
 * So the three transformations are mirrored, and ONLY the transformations: not
 * one magnitude is written here, every number still comes from the registry,
 * and a balance change still moves this text with it. The mirror is not trusted
 * on its word — `tools/checkprices.mjs` compiles each shape with the real
 * compiler and compares it to what these sentences print, so a divergence is a
 * failed gate rather than a wrong tooltip.
 *
 *   1. THE EFFECT SHARE. One at full strength, two at 0.85, three at 0.7 —
 *      counting only the effects that HAVE a magnitude, so a stun or a root
 *      does not tax the damage it rides on, and applied to magnitudes only:
 *      durations travel whole (compile.js, 07.09). A multiplier (`boost`,
 *      `weaken`) is moved TOWARD one instead of scaled.
 *   2. THE SHAPE'S PREMIUM. A premium on HARM: damage and burn only, so a
 *      knock carried by a fan is still a knock of the same 6 m/s.
 *   3. THE FIELD'S DIVISION. A field applies its atoms once per tick, so its
 *      per-tick MAGNITUDES are the whole cast divided by the tick count —
 *      except burn, which is a RATE scaled to the field's total share with a
 *      one-second tail, and except a control, which travels whole and lands
 *      once per cast.
 */
const EFFECT_SHARE = [1, 0.85, 0.7];
/* `ZONE_PERIOD` / `ZONE_TOTAL_SHARE` of `src/core/config.js`, which this file
   may not import (see above). They are the two numbers the mirror cannot read
   from the registry, and the gate compares against the real ones. */
const ZONE_PERIOD = 0.5;
const ZONE_TOTAL_SHARE = 1.4;

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * One ability's effects, with the magnitudes the simulation will actually use.
 *
 * Returns `{ list, ticks }`: the effects in slot order, and how many times a
 * field applies them (`null` for every other shape).
 */
export function compiledEffects(delivery, effects) {
  const d = DELIVERIES[delivery] || null;
  const ids = (effects || []).filter((id) => EFFECTS[id]);
  /* Only the atoms that HAVE a magnitude divide it — the compiler's
     `magBearing`. Counting all of them made a control tax the harm it rode
     on, which is what put every control atom below zero on the pricing panel. */
  const bearing = ids.filter((id) => EFFECTS[id].mag !== undefined && EFFECTS[id].mag !== null).length;
  const share = EFFECT_SHARE[Math.max(0, Math.min(bearing, 3) - 1)];
  const power = d && d.power !== undefined ? d.power : 1;

  const list = ids.map((id) => {
    const e = { ...EFFECTS[id], id };
    if (e.mag !== undefined && e.mag !== null) {
      const boost = (id === 'damage' || id === 'burn') ? power : 1;
      e.mag = (id === 'boost' || id === 'weaken')
        ? r3(1 + (e.mag - 1) * share)
        : r3(e.mag * share * boost);
    }
    return e;
  });

  let ticks = null;
  if (d && d.id === 'zone' && d.duration) {
    ticks = Math.max(1, Math.ceil(d.duration / ZONE_PERIOD));
    const zk = ZONE_TOTAL_SHARE / ticks;
    for (const e of list) {
      if (e.id === 'burn') { e.mag = r3(e.mag * ZONE_TOTAL_SHARE); e.duration = 1.0; continue; }
      if (e.mag !== undefined && e.mag !== null) {
        e.mag = (e.id === 'boost' || e.id === 'weaken')
          ? r3(1 + (e.mag - 1) * zk)
          : r3(e.mag * zk);
      }
      /* A CONTROL IN A FIELD TRAVELS WHOLE and lands once per cast — the
         compiler's rule since the fix that stopped a disc refusing itself.
         Only magnitudes are divided by the tick count; a duration has no such
         arithmetic. `immune` is how a control is recognised. */
      if (!e.immune && e.duration !== undefined && e.duration !== null) e.duration = r3(e.duration * zk);
    }
  }
  return { list, ticks };
}

/**
 * How each effect reads as a verb.
 *
 * `mag` and `duration` arrive COMPILED (see above), so the sentence is a fact
 * and not a claim.
 *
 * TWO THINGS THE OLD TABLE LEFT OUT AND A SPECTATOR CANNOT DO WITHOUT.
 *
 * HOW LONG A CONTROL LASTS. "Stuns" is not a fact, it is a category. A stun is
 * one second and a blind is 2.2, and on a three-second rhythm that difference
 * is the whole reason to prefer one ability over another.
 *
 * AND THE IMMUNITY BEHIND IT. Every control leaves three seconds during which
 * the same control cannot land again (`EFFECTS[x].immune`, applied in
 * `effects.js`). It is the single rule a spectator most needs in order to
 * understand why a second stun "did nothing" — 2.7 to 4.1 times a fight, the
 * review measured — and it appeared in no player-facing sentence anywhere in
 * the product.
 */
const EFFECT_PHRASE = {
  damage: (e, z) => `deals ${num(e.mag)} damage${z ? ' a tick' : ''}`,
  burn: (e, z) => (z
    ? `burns for ${num(e.mag)} a second (${num(e.duration)} s longer after you leave it)`
    : `burns for ${num(e.mag)} a second over ${num(e.duration)} s`),
  knock: () => 'knocks back',
  pull: () => 'pulls in',
  stun: (e, z) => control('stuns', e, z),
  root: (e, z) => control('roots', e, z),
  shield: (e) => `shields ${num(e.mag)} for ${num(e.duration)} s`,
  /* A heal is a share of the MISSING hp under a cap and over a floor (registry
     `share`, `floor`, `mag`). Printing the cap alone said "heals up to 16" about
     an ability that gives 4 to a fighter at full health — the number was true
     and the sentence was not. All three travel now: the share is what the
     ability is FOR, and it is the only one of the three a mind can act on. */
  heal: (e) => `heals ${num((e.share ?? 0) * 100)}% of the health it is missing`
    + `${e.floor !== undefined ? `, at least ${num(e.floor)}` : ''}`
    + `${e.mag !== undefined && e.mag !== null ? ` and at most ${num(e.mag)}` : ''}`,
  cleanse: () => 'cleanses',
  blind: (e, z) => control('blinds', e, z),
  silence: (e, z) => control('silences', e, z),
  wall: (e) => `raises a wall for ${num(e.duration)} s`,
  boost: (e) => `boosts by ×${num(e.mag)} for ${num(e.duration)} s`,
  weaken: (e) => `weakens by ×${num(e.mag)} for ${num(e.duration)} s`,
};

/**
 * `stuns` + `for 1 s, then 3 s immune` — the control's whole truth.
 *
 * `field` adds the one thing that is different inside a disc: the control is
 * applied ONCE per cast, on a body's first contact tick, and not on every tick
 * like the damage beside it. Without that clause the sentence and the tick
 * count in the next one would together promise five stuns.
 */
function control(verb, e, field) {
  let out = verb;
  if (e.duration !== undefined && e.duration !== null) out += ` for ${num(e.duration)} s`;
  if (e.immune) out += `${e.duration != null ? ',' : ''} then ${num(e.immune)} s immune`;
  if (field) out += ' (once per cast)';
  return out;
}

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
 * snapshot — and also a COMPILED definition, which carries the same entry under
 * `grammar`. Both go through the same arithmetic from the same registry, so a
 * tooltip on the battle HUD and the same ability on the creature page cannot
 * print different figures.
 */
export function describeAbility(skill) {
  const raw = skill && typeof skill === 'object' ? skill : {};
  /* A compiled definition keeps its grammar entry; anything else IS one. */
  const s = (raw.grammar && typeof raw.grammar === 'object') ? raw.grammar : raw;
  const delivery = typeof s.delivery === 'string' ? s.delivery
    : (typeof raw.kind === 'string' ? raw.kind : null);
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

  /*
   * THE COMPILED NUMBERS, NOT THE REGISTRY'S BASE ONES. See `compiledEffects`.
   */
  const { list, ticks } = compiledEffects(delivery, effects);
  const phrases = list.map((e) => {
    const make = EFFECT_PHRASE[e.id];
    return make ? make(e, !!ticks) : null;
  }).filter(Boolean);
  if (phrases.length) sentences.push(`${upperFirst(joinPhrases(phrases))}.`);

  /*
   * A FIELD'S FIGURES ARE PER TICK, AND SAYING SO IS HALF THE FACT.
   *
   * "Deals 6.72 damage" about an ability that deals 33.6 to anyone who stands
   * in it is as wrong as the 24 it replaced, in the other direction. The tick
   * count is what turns one number into the other, and it is also the shape's
   * whole tactical character: a field is answered by walking out of it.
   */
  if (ticks) {
    const dmg = list.find((e) => e.id === 'damage');
    const all = dmg && dmg.mag != null ? `, ${num(r3(dmg.mag * ticks))} damage in all` : '';
    const life = DELIVERIES[delivery]?.duration;
    sentences.push(`${ticks} ticks${life ? ` over ${num(life)} s` : ''}${all}.`);
  }

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
