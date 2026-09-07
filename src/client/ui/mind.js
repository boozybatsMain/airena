/**
 * The creature's mind.
 *
 * A model identifier is a routing string — a vendor, a slug, a suffix nobody
 * outside the build reads. The player is not shown routing: they are shown
 * WHOSE MIND their creature carries, as a name and a mark (docs/REDESIGN.md
 * §7). One mapping, one set of marks, used by Create, Creature, Live, History
 * and Ladder alike, so a mind looks the same everywhere it appears.
 *
 * The marks are geometric monograms drawn here, not vendor logos: a logo is
 * someone else's property and a claim we have no right to make. An open G, a Z
 * in a diamond, an A with its crossbar, a square Q, a crescent — enough to tell
 * the minds apart at 20 px, and nothing more.
 */
import { h, svg } from '../lib/dom.js';
import { strokeAt } from './icons.js';

/**
 * `google/gemini-3.7-flash:plain` → what a player is told.
 *
 * Mode: `:plain` is the quick answer, `:think` / `:high` the slow one. Never
 * the words the vendor uses for it — the player is choosing a temperament,
 * not configuring an inference budget.
 */
/** Legacy model ids of the reference brain, lower-cased, as stored. */
const REFERENCE = new Set(['рукописный эталон', 'kit-stub', 'stub', 'reference']);

export function mindInfo(modelId) {
  const s = String(modelId || '').trim();
  const mode = /:think\b|:high\b/i.test(s) ? 'deep' : (/:plain\b/i.test(s) ? 'quick' : null);
  const named = (name, provider, key) => ({ name, provider, key, mode });

  /*
   * NOTHING IS NOT A NAME. A missing model id used to fall through to
   * "Airena Reference" — a real, specific mind — and the HUD, the VS card, the
   * creature page, the ladder and the history rows all stated it as fact for
   * creatures whose mind the server had simply not sent (`meta.<side> = null`).
   * An interface may say it does not know; it may not invent. Callers that
   * render a badge drop it entirely (see `mindBadge`); callers that need a
   * word get one that is honest.
   */
  if (!s) return { name: 'Unknown mind', provider: '', key: 'other', mode: null };
  /*
   * The hand-written reference mind, and every legacy spelling of it.
   *
   * The exact keys come first because they are what the database actually
   * holds — `рукописный эталон` is the model id of the reference brain on
   * rows older than the English sweep, and it reached the HUD verbatim
   * (§1.1). The pattern behind them catches the spellings we have not seen:
   * anything with "stub", "reference" or the Russian stem.
   */
  if (REFERENCE.has(s.toLowerCase())) return { ...named('Airena Reference', 'Airena', 'airena'), mode: null };
  if (/\bstub\b|reference|эталон/i.test(s)) return { ...named('Airena Reference', 'Airena', 'airena'), mode: null };

  if (/gemini/i.test(s)) {
    const m = s.match(/gemini-?([\d.]+)?/i);
    const ver = m && m[1] ? ` ${m[1]}` : '';
    return named(`Gemini${ver}${/flash/i.test(s) ? ' Flash' : ''}`, 'Google', 'google');
  }
  if (/glm/i.test(s)) {
    const m = s.match(/glm-?([\d.]+)?/i);
    const ver = m && m[1] ? ` ${m[1]}` : '';
    return named(`GLM${ver}${/flash/i.test(s) ? ' Flash' : ''}`, 'Z.ai', 'zai');
  }
  /* Both are in the price table (`src/server/forge/models.js`) and both fell
     through to the generic branch, which spelled them `Qwen3.8 Max` / `qwen`
     and `Kimi K3` / `moonshotai` — a routing string with the slashes taken
     out. A mind the player is asked to choose deserves its own name and its
     own mark, like the other four. */
  if (/qwen/i.test(s)) {
    /* The family name repeats in the path (`qwen/qwen3.8-max`), and the first
       one carries no version — so the digits are required, not optional, and
       the match walks on to the segment that has them. */
    const m = s.match(/qwen-?(\d[\d.]*)/i);
    const ver = m && m[1] ? ` ${m[1]}` : '';
    return named(`Qwen${ver}${/max/i.test(s) ? ' Max' : ''}`, 'Alibaba', 'qwen');
  }
  if (/kimi|moonshot/i.test(s)) {
    const m = s.match(/kimi-?(k[\d.]+)?/i);
    const ver = m && m[1] ? ` ${m[1].toUpperCase()}` : '';
    return named(`Kimi${ver}`, 'Moonshot AI', 'moonshot');
  }
  /* OpenAI's flagship joined the catalogue 07.09 (`openai/gpt-6-astra`). */
  if (/astra|gpt-?6/i.test(s)) return named('GPT-6 Astra', 'OpenAI', 'openai');
  if (/opus/i.test(s)) return named('Claude Opus', 'Anthropic', 'anthropic');
  if (/fable/i.test(s)) return named('Claude Fable', 'Anthropic', 'anthropic');
  if (/sonnet/i.test(s)) return named('Claude Sonnet', 'Anthropic', 'anthropic');
  if (/haiku/i.test(s)) return named('Claude Haiku', 'Anthropic', 'anthropic');

  /* Unknown mind: the last segment, made readable. Better a plain name than
     a raw routing string with colons in the middle of the page. */
  const last = s.split('/').pop().split(':')[0].replace(/[-_]+/g, ' ').trim();
  const name = last.replace(/\b[a-z]/g, (c) => c.toUpperCase()) || 'Unknown mind';
  const provider = s.includes('/') ? s.split('/')[0].replace(/[-_]+/g, ' ') : '';
  return named(name, provider, 'other');
}

/*
 * EIGHT MARKS, EIGHT SILHOUETTES.
 *
 * They are read at 20 px, in a line of text, next to each other on the Create
 * screen — so the thing that has to differ first is the OUTLINE, before any
 * detail inside it: an open circle, a diamond, a triangle, a rounded square, a
 * crescent, a closed ring, a hexagon. Two of them used to be a circle with
 * something small added, and two more were a stack of chevrons that read as a
 * download arrow.
 *
 * Inside the outline is a monogram where the mind has an obvious letter and a
 * plain geometric mark where it does not. Still not a logo: a letter drawn on
 * a 24 grid in the interface's own line weight is a monogram, and a monogram
 * is a name written down, not a trademark borrowed.
 */
const MARK = {
  /* G: an arc left open at the right, with the bar turning into the centre. */
  google: '<path d="M17.7 8.7A6.6 6.6 0 1 0 18.6 12H13.2"/>',
  zai: '<path d="M12 3.6L20.4 12 12 20.4 3.6 12z"/><path d="M8.8 9.4h6.4l-6.4 5.2h6.4"/>',
  anthropic: '<path d="M5.4 19.2L12 4.8l6.6 14.4"/><path d="M8.6 13.6h6.8"/>',
  /* A square Q: the tail leaves through the corner it is drawn over. */
  qwen: '<rect x="5.6" y="5.6" width="12.8" height="12.8" rx="3.4"/><path d="M13.6 13.6l4.4 4.4"/>',
  moonshot: '<path d="M15.6 4.4a7.7 7.7 0 1 0 4.2 6.9 6.1 6.1 0 0 1-4.2-6.9z"/>',
  /* A knot: a ring with a bar through it, the interface's line weight. */
  openai: '<circle cx="12" cy="12" r="7.4"/><path d="M7.2 15.2l9.6-6.4M7.2 8.8l9.6 6.4"/>',
  /* The product's own orbit: a closed ring around a solid centre. */
  airena: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>',
  other: '<path d="M12 3.6l7.3 4.2v8.4L12 20.4l-7.3-4.2V7.8z"/><path d="M9 12h6"/>',
};

/** A 20 px monogram. Inherits `currentColor`, so it sits in a line of text. */
export function mindMark(modelId, size = 20) {
  const key = mindInfo(modelId).key;
  /* The same optical rule the icon set follows, so a mind's mark and the
     chevron beside it are one line weight (`ui/icons.js`). */
  return svg(`<svg class="mind-mark" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"`
    + ` stroke="currentColor" stroke-width="${strokeAt(size, 1.5)}" stroke-linecap="round" stroke-linejoin="round"`
    + ` aria-hidden="true">${MARK[key] || MARK.other}</svg>`);
}

/**
 * Mark + name (+ mode) on one line — the shape every screen shows a mind in.
 *
 * Returns nothing when there is no id: an empty badge is a line of layout the
 * eye still reads as a claim, and `h()`/`mount()` drop a null child, so every
 * caller already handles the absence by simply not drawing it.
 */
export function mindBadge(modelId, { mode = true } = {}) {
  if (!String(modelId || '').trim()) return null;
  const i = mindInfo(modelId);
  return h('span.mind',
    mindMark(modelId),
    h('span.mind-name', i.name),
    mode && i.mode ? h('span.mind-mode', `· ${i.mode}`) : null);
}
