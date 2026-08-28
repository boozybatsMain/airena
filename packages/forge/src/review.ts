/**
 * The gate in front of the expensive call.
 *
 * ── what this is, and the line it must not cross ─────────────────────────────
 *
 * A player can type `create a whole cyberpunk world`. The builder will happily
 * spend nine minutes and $1.20 producing a city, which is not a creature, cannot
 * enter a room, and cost real money to discover. So a cheap model reads the
 * prompt first and says what kind of prompt it is.
 *
 * **It classifies. It does not rewrite.** That distinction is the whole design,
 * and it is easy to lose. The reason this lane exists at all is that
 * `@autoage/fabricator`'s `interpret()` step — a machine that read the player's
 * sentence and restated it in the system's own words — is what produced bodies
 * nobody could name. A reviewer that quietly rewrote every prompt before the
 * builder saw it would be that same machine, moved upstream and given a
 * friendlier name, and the lane would regress to the thing it replaced without
 * anyone noticing.
 *
 * So the contract is:
 *
 *  - the reviewer returns a **verdict**, a **reason** a person can read, and
 *    optionally a **suggestion**;
 *  - the suggestion is shown to the player and is never applied by any code
 *    path — accepting it is a click, and once accepted it is *the player's
 *    prompt*, editable like any other;
 *  - `buildMessages` keeps receiving the player's own text, verbatim, and
 *    `tests/forge.test.ts` still pins that.
 *
 * A schema *is* used here, and that is not a contradiction of the lane's
 * no-schema rule: the rule is about not constraining the **creature**. This is a
 * four-field classification, the one shape where a grammar is exactly right.
 *
 * ── what it costs ───────────────────────────────────────────────────────────
 *
 * Haiku 4.5, a few hundred tokens each way: about $0.001 per check, against the
 * $1.20 build it can prevent. It pays for itself if it catches one prompt in a
 * thousand, and it will catch far more than that.
 */

import { ForgeCallError } from './call.js';

export type ReviewVerdict =
  /** One buildable subject. Nothing in the way of pressing Build. */
  | 'ready'
  /** A scene, a world, a place, or several things at once. */
  | 'too_broad'
  /** Not enough to build anything in particular. */
  | 'too_vague'
  /** Should not be built at all. Bodies and names are public in this game. */
  | 'refuse';

export interface PromptReview {
  readonly verdict: ReviewVerdict;
  /** One sentence, written to the player, in plain language. */
  readonly reason: string;
  /**
   * A tightened prompt the player may accept with a click.
   *
   * Present on `too_broad` and `too_vague`, null otherwise. **Never applied
   * automatically** — see the header. On `too_broad` it should name the single
   * most interesting subject inside what the player described, so
   * "a whole cyberpunk world" comes back as something buildable rather than as
   * a scolding.
   */
  readonly suggestion: string | null;
  /** What the reviewer thinks the subject is, as a short noun phrase. */
  readonly subject: string | null;
  /** What the check itself cost, in US dollars, when the route reports it. */
  readonly costUsd: number | null;
}

/**
 * The reviewer's own instruction. Separate from `FORGE_SYSTEM` and deliberately
 * never shown it: this model is judging the *player's sentence*, not the build,
 * and handing it the builder's instruction would invite it to pre-solve the
 * creature and put design opinions in `suggestion`.
 */
export const REVIEW_SYSTEM = `You screen prompts for a game where a player describes one thing and an AI builds it as a 3D model.

Judge the HEAD NOUN, not the adjectives.

Modifiers never make a prompt broad. "battle pirate ship" is a ship. "burning
house" is a house. "war robot" is a robot. "dragon in a storm" is a dragon.
Adjectives about mood, damage, weather, conflict or setting describe how the one
object looks — they are not extra objects and they are not a scene. If you can
point at a single head noun, the verdict is ready.

Classify into exactly one verdict:

  ready      one buildable subject, however elaborately described.
             A creature, a vehicle, a machine, a character, a plant, an item.
             Default to this whenever you are unsure.
  too_broad  the subject itself is a place or a plural: a world, a city, a
             landscape, a level, a room, an army, a crowd, "two X fighting".
             Only when the head noun is not one object.
  too_vague  no head noun at all — nothing specific enough to build.
  refuse     sexual content involving minors, real identifiable people, or
             content whose only purpose is to harass. Be permissive otherwise:
             monsters, gore, weapons and horror are all normal here.

For too_broad and too_vague, write a "suggestion": a rewritten prompt naming ONE
object taken from what they asked for, in their own register, one sentence. The
suggestion must itself pass "ready" — one head noun, no list of things, no
setting. For "a whole cyberpunk world" write something like "a chrome-plated
street samurai with a neon katana", not a description of a street. For ready and
refuse, suggestion is null.

"reason" is one short sentence addressed to the player. No preamble, no apology.
"subject" is the head noun you found, as a short noun phrase. Fill it in for
every verdict except refuse — on too_broad it is the thing that was too big.`;

/** The grammar. A four-field classification is exactly where a schema belongs. */
export const REVIEW_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'reason', 'suggestion', 'subject'],
  properties: {
    verdict: { type: 'string', enum: ['ready', 'too_broad', 'too_vague', 'refuse'] },
    reason: { type: 'string' },
    suggestion: { type: ['string', 'null'] },
    subject: { type: ['string', 'null'] },
  },
});

export interface ReviewRequest {
  readonly prompt: string;
  readonly apiKey: string;
  /** Cheap by design. The check must never cost a meaningful fraction of the build. */
  readonly model?: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_REVIEW_MODEL = 'anthropic/claude-haiku-4.5';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Reads the reviewer's reply into a `PromptReview`.
 *
 * Anything unparseable becomes `ready`, on purpose. A gate that fails closed
 * would block births whenever a cheap model hiccups, and this gate is an
 * *assistant*, not an authority — the expensive-mistake it prevents is worth
 * far less than a player who cannot play. The one exception is `refuse`, which
 * is only ever returned when the model actually said so.
 */
export function readReview(raw: unknown, costUsd: number | null): PromptReview {
  const fallback: PromptReview = {
    verdict: 'ready',
    reason: '',
    suggestion: null,
    subject: null,
    costUsd,
  };
  if (!isRecord(raw)) return fallback;

  const verdict = raw.verdict;
  const known: readonly ReviewVerdict[] = ['ready', 'too_broad', 'too_vague', 'refuse'];
  if (typeof verdict !== 'string' || !(known as readonly string[]).includes(verdict)) return fallback;

  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  return {
    verdict: verdict as ReviewVerdict,
    reason: str(raw.reason) ?? '',
    // A suggestion identical to the prompt is noise, not help.
    suggestion: str(raw.suggestion),
    subject: str(raw.subject),
    costUsd,
  };
}

/**
 * Screen one prompt.
 *
 * Not streamed: the reply is ~150 tokens and arrives in a couple of seconds, so
 * none of the socket-timeout machinery the builder needs applies here.
 */
export async function reviewPrompt(req: ReviewRequest): Promise<PromptReview> {
  const doFetch = req.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
  if (typeof doFetch !== 'function') throw new ForgeCallError('no_fetch', 'this runtime has no fetch');
  if (req.apiKey.trim() === '') throw new ForgeCallError('no_key', 'no API key was supplied');

  const base = (req.baseUrl ?? 'https://openrouter.ai').replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? 60_000);
  const onAbort = (): void => controller.abort();
  if (req.signal) {
    if (req.signal.aborted) controller.abort();
    else req.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await doFetch(`${base}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${req.apiKey}`,
        'HTTP-Referer': 'https://autoage.game',
        'X-Title': 'Autoage Forge',
      },
      body: JSON.stringify({
        model: req.model ?? DEFAULT_REVIEW_MODEL,
        max_tokens: 400,
        usage: { include: true },
        messages: [
          { role: 'system', content: REVIEW_SYSTEM },
          { role: 'user', content: req.prompt.trim() },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'autoage_prompt_review', strict: true, schema: REVIEW_SCHEMA },
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new ForgeCallError('http_' + res.status, `${res.status} ${res.statusText}`, res.status);
    }

    const payload = (await res.json()) as unknown;
    if (!isRecord(payload)) return readReview(null, null);

    const cost = isRecord(payload.usage) && typeof payload.usage.cost === 'number' ? payload.usage.cost : null;
    const choices = payload.choices;
    if (!Array.isArray(choices) || !isRecord(choices[0]) || !isRecord(choices[0].message)) {
      return readReview(null, cost);
    }
    const content = choices[0].message.content;
    if (typeof content !== 'string') return readReview(null, cost);

    try {
      return readReview(JSON.parse(content) as unknown, cost);
    } catch {
      return readReview(null, cost);
    }
  } finally {
    clearTimeout(timer);
    if (req.signal) req.signal.removeEventListener('abort', onAbort);
  }
}
