/**
 * Ability icons — one generated glyph per ability slot (docs/REDESIGN.md §8.4).
 *
 * THE PROBLEM THIS SOLVES. An ability is four axes deep — delivery, effects,
 * channel, element — and the battle HUD has 48 pixels to say which of three
 * the creature just fired. Words do not fit there and a procedural SVG says
 * only "a cone" or "a beam"; it cannot say "a cone that burns". So the glyph is
 * drawn once, per creature, per slot, and cached forever.
 *
 * WHY IT NEVER THROWS. Icons are decoration on a product that works without
 * them: the client falls back to `abilityFallbackSvg()` the moment a URL 404s.
 * A failed image call must therefore be a log line, never a broken page and
 * never a failed creature. Every path below ends in a boolean, and the caller
 * is free to ignore it — `jobs.js` calls this fire-and-forget on a dynamic
 * import precisely so a missing module cannot break a birth.
 *
 * WHY GENERATION IS DEBOUNCED. Two hooks are lazy (`GET /api/creature/:id`,
 * `GET /api/session`), and both are polled: the arena screen re-reads the
 * session every twenty seconds. Without a guard, one creature whose generation
 * keeps failing would issue an image call every twenty seconds forever. So:
 * one attempt in flight per creature, and no second attempt for ten minutes.
 */

import { abilitiesOf } from '../../skills/describe.js';

/** fal.ai's synchronous endpoint: request in, image URL out, no polling. */
const ENDPOINT = 'https://fal.run/fal-ai/flux/schnell';

/** Two at a time across the whole process — see `slot()` below. */
const CONCURRENCY = 2;

/** How long a creature waits before a second attempt after a failed one. */
const RETRY_AFTER_MS = 10 * 60e3;

const GEN_TIMEOUT_MS = 90e3;
const FETCH_TIMEOUT_MS = 30e3;

/** One attempt in flight per creature; a second caller joins the first. */
const inFlight = new Map();
/** When we last tried this creature, successfully or not. */
const attemptedAt = new Map();

/**
 * How many creatures the debounce remembers at once.
 *
 * `inFlight` empties itself in a `finally`; this one does not, and it is
 * written on every run from a path that `/api/session` polls every twenty
 * seconds per client. Unpruned it holds one entry for every creature the
 * process has ever looked at — small per entry, unbounded over a week of
 * uptime, which is the shape of a leak rather than its size.
 *
 * Five thousand is chosen to be far above any real working set: the debounce
 * only has to cover ten minutes, and ten minutes of one server never touches
 * five thousand distinct creatures.
 */
const ATTEMPT_MEMORY = 5000;

/**
 * Forget creatures whose debounce has already expired.
 *
 * An expired entry answers no question — `Date.now() - last < RETRY_AFTER_MS`
 * is false for it either way — so dropping it changes nothing a caller can
 * observe. If even that leaves the map over the limit (five thousand distinct
 * creatures inside ten minutes, i.e. a backfill), the oldest half goes too:
 * forgetting costs one extra image attempt, remembering costs the process.
 */
function pruneAttempts(now = Date.now()) {
  for (const [id, at] of attemptedAt) {
    if (now - at >= RETRY_AFTER_MS) attemptedAt.delete(id);
  }
  if (attemptedAt.size <= ATTEMPT_MEMORY) return;
  const byAge = [...attemptedAt.entries()].sort((a, b) => a[1] - b[1]);
  for (const [id] of byAge.slice(0, attemptedAt.size - Math.floor(ATTEMPT_MEMORY / 2))) {
    attemptedAt.delete(id);
  }
}

/**
 * A process-wide gate of two.
 *
 * Not a queue library and not a per-call limit: the point is that a backfill of
 * 62 creatures and a live birth share the SAME two lanes, so the backfill
 * cannot starve a player who is watching a progress screen right now.
 */
let running = 0;
const waiting = [];
function slot() {
  if (running < CONCURRENCY) { running++; return Promise.resolve(); }
  return new Promise((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

/** FNV-1a. The seed has to be reproducible, not cryptographic. */
export function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * WHAT THE GLYPH IS A PICTURE OF: the shape, first.
 *
 * The first prompt put the ability's NAME first — "frost fan", "frost field" —
 * and the model drew a snowflake both times. Measured on the first batch: two
 * of the three tiles of one creature were the same picture, because the element
 * is the loud half of the name and the delivery is the quiet half. Three tiles
 * that look alike are worse than no tiles: the player cannot tell which of
 * their abilities just came off cooldown.
 *
 * So the delivery leads and is described as a DRAWING, not as a term. "A wide
 * triangular fan spreading from a point" is something a model can put on a
 * canvas; "cone" is a word it has to interpret, and it interprets it as the
 * subject matter around it.
 */
const DELIVERY_GLYPH = {
  beam: 'a long straight ray fired from one point and stopping against a flat barrier',
  cone: 'a wide triangular fan spreading out from a single point',
  bolt: 'a single pointed projectile in flight with short motion lines behind it',
  lob: 'a high arcing trajectory falling into a small circular impact mark',
  zone: 'a flat circle lying on the ground, seen at an angle, with a marked rim',
  dash: 'a forward charge arrow with speed lines trailing behind it',
  blink: 'two empty circles joined by a dashed line, one fading',
  self: 'a rounded protective shell enclosing a small central core',
  jump: 'an upward leaping arc rising off a ground line',
};

/** The element is a MOTIF laid over the shape, never the subject of the icon. */
const ELEMENT_MOTIF = {
  kinetic: 'blunt angular impact facets',
  ember: 'small flame tongues',
  frost: 'sharp ice crystal spikes',
  arc: 'jagged lightning forks',
  void: 'a dark hollow core',
  gravity: 'concentric inward rings',
  acid: 'dripping corrosive droplets',
  radiation: 'a three-bladed hazard trefoil',
  laser: 'a thin focused beam line',
  time: 'clock hands',
};

/** What the ability DOES, as something drawable. */
const EFFECT_MOTIF = {
  damage: 'an impact burst',
  burn: 'trailing flames',
  knock: 'an outward shockwave',
  pull: 'inward arrows',
  stun: 'a ring of small stars',
  root: 'shackles at the base',
  shield: 'a shield outline',
  heal: 'rising sparks',
  cleanse: 'a clearing swirl',
  blind: 'a struck-through eye',
  silence: 'a struck-through sound wave',
  wall: 'a solid upright slab',
  boost: 'an upward chevron',
  weaken: 'a downward chevron',
};

/**
 * The prompt.
 *
 * Every clause after the subject is there because its absence produced a
 * specific wrong picture: without "pure white background" the model paints a
 * dark fantasy plate, without "no text" it letters the icon, without "no frame"
 * it draws a decorative border that eats the 48 pixels the glyph needs, without
 * "monoline" it shades — a shaded glyph at tile size is a grey smudge — and
 * without "monochrome" it tints the strokes navy, which reads as a colour
 * choice the interface never made.
 */
export function promptFor(ability) {
  const shape = DELIVERY_GLYPH[ability?.delivery]
    || `a single centred symbol for ${String(ability?.name || 'an ability').toLowerCase()}`;
  const motif = ELEMENT_MOTIF[ability?.element];
  const effects = (ability?.effects || []).map((e) => EFFECT_MOTIF[e]).filter(Boolean);

  const bits = [shape];
  if (motif) bits.push(`marked with ${motif}`);
  if (effects.length) bits.push(`showing ${effects.slice(0, 2).join(' and ')}`);

  /* "Small, with a generous margin" is not decoration advice: the tile is 48
     pixels and the glyph is drawn at 512, so anything that touches the edges of
     the canvas touches the edges of the tile and loses its silhouette. The
     first batch came back with one glyph filling the frame and its neighbour
     occupying a third of it — side by side in the HUD they read as two
     different weights of interface, not two abilities. */
  return `Flat minimalist game ability icon: a single centred glyph of ${bits.join(', ')}. `
    + 'Pure black monoline strokes of uniform thin weight on a pure white background, '
    + 'monochrome, no colour, small centred glyph with a generous empty white margin, '
    + 'geometric, symmetrical, vector style, no text, no letters, no frame, no shading, '
    + 'no drop shadow, no background objects.';
}

/** One image. Returns `{ mime, bytes }` or null; never throws. */
async function generate(prompt, seed, key) {
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt,
        image_size: 'square',
        num_images: 1,
        num_inference_steps: 4,
        enable_safety_checker: false,
        seed,
      }),
      signal: AbortSignal.timeout(GEN_TIMEOUT_MS),
    });
  } catch (e) {
    console.warn(`  icon: the image service did not answer (${e?.name || 'error'})`);
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`  icon: the image service refused with ${res.status} ${text.slice(0, 160)}`);
    return null;
  }
  let body;
  try { body = await res.json(); } catch { return null; }
  const image = Array.isArray(body?.images) ? body.images[0] : null;
  if (!image?.url) {
    console.warn('  icon: the answer carried no image');
    return null;
  }
  let file;
  try {
    file = await fetch(image.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (e) {
    console.warn(`  icon: could not download the image (${e?.name || 'error'})`);
    return null;
  }
  if (!file.ok) {
    console.warn(`  icon: could not download the image, ${file.status}`);
    return null;
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!buf.length) return null;
  const mime = file.headers.get('content-type')?.split(';')[0]
    || image.content_type
    || 'image/jpeg';
  return { mime, bytes: buf };
}

/**
 * Which slots already have a glyph, and when each was drawn.
 *
 * The timestamp is not bookkeeping: it is the version in the public URL. An
 * ability set changes for free and instantly (F10), the glyphs are redrawn
 * under the same three addresses, and a browser that cached yesterday's
 * pictures for a day would show the owner a flame where the creature now
 * carries frost. `?v=<created_at>` makes the address move with the picture.
 */
function storedSlots(db, creatureId) {
  const out = new Map();
  for (const r of db.prepare('SELECT slot, created_at FROM icon WHERE creature_id = ?').all(creatureId)) {
    out.set(r.slot, r.created_at || 0);
  }
  return out;
}

/** True when this creature has at least one ability without a glyph. */
export function iconsMissing(db, creatureId, kit) {
  const list = Array.isArray(kit) ? kit : [];
  if (!list.length) return false;
  const have = storedSlots(db, creatureId);
  return list.some((_, i) => !have.has(i));
}

/** One creature's slot URLs, built from a `slot → created_at` map. */
const urlsFrom = (creatureId, have, count) => Array.from({ length: count }, (_, i) => (have.has(i)
  ? `/api/creature/${creatureId}/icon/${i}?v=${have.get(i) || 0}`
  : null));

/** Public URLs for a creature's three slots — null where nothing is stored. */
export function iconUrls(db, creatureId, count = 3) {
  let have;
  try { have = storedSlots(db, creatureId); } catch { return new Array(count).fill(null); }
  return urlsFrom(creatureId, have, count);
}

/**
 * The same, for many creatures, in ONE query.
 *
 * `card()` is the only way a creature leaves the server, and it is mapped over
 * lists: three starters today, a hundred ladder rows the moment somebody asks
 * for one. Per-creature `iconUrls()` there is a hundred round-trips for a
 * field that is three strings wide. Callers with a list pass the result of
 * this into `card({ icons })` and pay for one statement.
 *
 * Chunked at 400 ids because SQLite's default limit on bound variables is 999
 * and a season's ladder is longer than that.
 */
export function iconUrlsMany(db, ids, count = 3) {
  const out = new Map();
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
  for (const id of list) out.set(id, new Array(count).fill(null));
  if (!db || !list.length) return out;
  try {
    for (let at = 0; at < list.length; at += 400) {
      const part = list.slice(at, at + 400);
      const rows = db.prepare(`SELECT creature_id, slot, created_at FROM icon
        WHERE creature_id IN (${part.map(() => '?').join(',')})`).all(...part);
      const have = new Map();
      for (const r of rows) {
        if (!have.has(r.creature_id)) have.set(r.creature_id, new Map());
        have.get(r.creature_id).set(r.slot, r.created_at || 0);
      }
      for (const id of part) out.set(id, urlsFrom(id, have.get(id) || new Map(), count));
    }
  } catch { /* no table yet — every creature keeps its three nulls */ }
  return out;
}

/** The stored blob, or null. `created_at` comes back as the picture's version. */
export function readIcon(db, creatureId, slotIndex) {
  try {
    return db.prepare('SELECT mime, bytes, created_at FROM icon WHERE creature_id = ? AND slot = ?')
      .get(creatureId, slotIndex) ?? null;
  } catch { return null; }
}

/**
 * Generate the glyphs this creature is missing.
 *
 * `force` regenerates every slot — that is what a changed ability set means:
 * the old glyph now describes an ability the creature no longer has, which is
 * worse than no glyph at all.
 *
 * Returns `{ made, failed, skipped }`. Never throws, for any reason, including
 * a missing table, a missing creature and a missing key.
 */
export async function ensureIcons(db, creatureId, { force = false } = {}) {
  const key = process.env.FAL_KEY;
  if (!key) return { made: 0, failed: 0, skipped: 'no key' };
  if (!db || !creatureId) return { made: 0, failed: 0, skipped: 'no creature' };

  const pending = inFlight.get(creatureId);
  if (pending) return pending;

  const last = attemptedAt.get(creatureId) || 0;
  if (!force && Date.now() - last < RETRY_AFTER_MS) {
    return { made: 0, failed: 0, skipped: 'tried recently' };
  }

  const run = (async () => {
    attemptedAt.set(creatureId, Date.now());
    if (attemptedAt.size > ATTEMPT_MEMORY) pruneAttempts();
    let row;
    try {
      row = db.prepare('SELECT id, kit_json FROM creature WHERE id = ?').get(creatureId);
    } catch { return { made: 0, failed: 0, skipped: 'no creature' }; }
    if (!row) return { made: 0, failed: 0, skipped: 'no creature' };

    let kit = [];
    try { kit = JSON.parse(row.kit_json || '[]'); } catch { kit = []; }
    const abilities = abilitiesOf(kit);
    if (!abilities.length) return { made: 0, failed: 0, skipped: 'no abilities' };

    let have;
    try { have = storedSlots(db, creatureId); } catch { return { made: 0, failed: 0, skipped: 'no table' }; }
    const todo = abilities.filter((a) => force || !have.has(a.slot));
    if (!todo.length) return { made: 0, failed: 0, skipped: 'all present' };

    const write = db.prepare(`INSERT INTO icon (creature_id, slot, mime, bytes, prompt, created_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(creature_id, slot) DO UPDATE SET
         mime = excluded.mime, bytes = excluded.bytes,
         prompt = excluded.prompt, created_at = excluded.created_at`);

    let made = 0; let failed = 0;
    await Promise.all(todo.map(async (ability) => {
      await slot();
      try {
        const prompt = promptFor(ability);
        const seed = seedOf(`${creatureId}:${ability.slot}`);
        /* One retry, and it moves the seed: asking the same model for the same
           seed twice is asking the same question twice. A refusal is usually
           about the picture, not about the network. */
        let out = await generate(prompt, seed, key);
        if (!out) out = await generate(prompt, (seed ^ 0x9e3779b9) >>> 0, key);
        if (!out) { failed++; return; }
        write.run(creatureId, ability.slot, out.mime, out.bytes, prompt, Date.now());
        made++;
      } catch (e) {
        failed++;
        console.warn(`  icon: slot ${ability.slot} of ${creatureId} failed — ${e?.message || e}`);
      } finally {
        release();
      }
    }));
    return { made, failed, skipped: null };
  })().catch((e) => {
    console.warn(`  icon: ${creatureId} failed entirely — ${e?.message || e}`);
    return { made: 0, failed: 0, skipped: 'error' };
  }).finally(() => {
    inFlight.delete(creatureId);
  });

  inFlight.set(creatureId, run);
  return run;
}

/**
 * The lazy hook, in one call the read paths can make without thinking.
 *
 * Fire-and-forget by construction: it returns nothing, so no handler can be
 * tempted to await an image call inside a request that has to answer now.
 */
export function ensureIconsSoon(db, creatureId, kit) {
  if (!process.env.FAL_KEY || !creatureId) return;
  try {
    if (!iconsMissing(db, creatureId, kit)) return;
  } catch { return; }
  ensureIcons(db, creatureId).catch(() => {});
}
