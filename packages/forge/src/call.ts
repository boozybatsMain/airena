/**
 * The wire. One request, one reply, no ladder.
 *
 * `@autoage/fabricator`'s provider is a 3 254-line machine: retry tiers, JSON
 * repair, schema downgrade, scaffold coercion, degradation reporting, a local
 * compiler to fall back to. Every one of those exists because the *design
 * system* is hard to satisfy, and none of them applies here — there is no
 * schema to violate, so the only failure modes left are the network's own.
 *
 * So: no fallback compiler. A forge that quietly degrades to the deterministic
 * lane would answer the question this whole experiment asks ("what does the
 * model actually build?") with a body the model never saw. Failure here is
 * reported as failure.
 *
 * The key never leaves the caller's process. `forgeCreature` takes it as an
 * argument, this package reads no environment and holds no default, and the
 * browser reaches it through a dev-server route (`vite.config.ts`) rather than
 * holding one.
 */

import { extractBuildSource, extractGrowthSource, ForgeFormatError, type ExtractedCode } from './clean.js';
import { buildGrowthMessages, type GrowthContext } from './grow.js';
import { buildMessages, FORGE_SYSTEM } from './prompt.js';
import { STYLE_REFERENCE_PREAMBLE, type StyleReferenceImage } from './style.js';

export class ForgeCallError extends Error {
  readonly reason: string;
  readonly status: number | null;
  /**
   * Whatever code had arrived when the call failed.
   *
   * Present on `truncated`, and the reason that case is not just a thrown
   * string: a five-minute frontier call that dies at the token ceiling has
   * still produced most of a creature, and throwing it away means paying again
   * to find out what went wrong. The caller can write it out as evidence. It is
   * never rendered — incomplete source does not parse — so there is no path
   * where a partial creature is mistaken for a finished one.
   */
  readonly partial: string | null;
  constructor(reason: string, message: string, status: number | null = null, partial: string | null = null) {
    super(message);
    this.name = 'ForgeCallError';
    this.reason = reason;
    this.status = status;
    this.partial = partial;
  }
}

export interface ForgeRequest {
  /** The player's text. Sent verbatim as the user turn. */
  readonly prompt: string;
  /** OpenRouter model id, e.g. `anthropic/claude-opus-5`. The player's pick. */
  readonly model: string;
  readonly apiKey: string;
  /**
   * Ceiling on the completion, defaulting to `DEFAULT_MAX_TOKENS`.
   *
   * Measured, not guessed. The first live run of this lane — Opus 5, high
   * effort, "battle pirate ship" — spent six minutes and died `truncated` at
   * 32 000, because on this wire the ceiling covers **reasoning tokens as well
   * as output** and a frontier model on high effort will happily think past
   * that before writing a line. A too-low ceiling does not produce a smaller
   * creature; it produces no creature and a full bill.
   */
  readonly maxTokens?: number;
  /** Passed through where the route understands it. */
  readonly effort?: 'low' | 'medium' | 'high';
  /**
   * Жёсткий потолок на РАЗМЫШЛЕНИЕ, в токенах.
   *
   * `effort` — это пожелание, и модель вольна его трактовать: на каркасе,
   * который вдвое меньше готового тела, Opus всё равно продумал 28 906 токенов,
   * то есть 57% счёта. Размышление не сжимается вместе с задачей, поэтому
   * дробление на стадии само по себе денег не экономит — каждая стадия платит
   * за раздумья заново.
   *
   * Здесь задаётся число, а не настроение. Остаток `maxTokens` минус этот
   * потолок и есть то, что гарантированно останется на код.
   */
  readonly thinkTokens?: number;
  /**
   * House style id (`style.ts`). Appended to the system turn, never to the
   * user's words. Omitted means `'raw'` — the base instruction alone, which is
   * what every capture taken before styles existed was built under.
   */
  readonly style?: string;
  /**
   * Reference photographs of the house style, shown to the model.
   *
   * This is the strongest form of art direction the lane has: instead of my
   * description of the reference set, the builder looks at it. They ride in
   * their **own** turn, ahead of the player's, prefaced by
   * `STYLE_REFERENCE_PREAMBLE` — so the player's turn is still their sentence
   * and nothing else, and the images belong to the style rather than to them.
   *
   * The package cannot read a disk (it runs in a browser too), so whoever can
   * loads them and passes them in. Omit them and the call is text-only exactly
   * as before.
   */
  readonly styleImages?: readonly StyleReferenceImage[];
  /**
   * Present on a **growth** call: this is not a new creature, it is the next
   * stage of one that already exists (`grow.ts`).
   *
   * It rides on the same request rather than getting its own function on
   * purpose. Everything below this line — the stream, the keepalive handling,
   * the token ceiling, the repair ladder, the usage accounting, the truncation
   * rescue — is wire behaviour that a growth call needs identically, and a
   * second copy of it would be a second place for a five-minute call to die in
   * a way the first one already learned not to.
   */
  readonly growth?: GrowthContext;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly fetchImpl?: typeof fetch;
  /**
   * Called with each chunk of the completion as it arrives.
   *
   * Supplying one is free — the request streams either way (see
   * `forgeCreature`), so this is a tap on a stream that already exists rather
   * than a mode switch.
   */
  readonly onDelta?: (text: string) => void;
  /**
   * Run the extracted source and say what went wrong, or null if it is fine.
   *
   * The check lives at the caller because running a creature needs `three`, and
   * this package must never link a renderer — that is the same rule that keeps
   * it free of `sim-core`. What comes back is fed straight to the model as a
   * repair turn, so the string should read like a compiler talking: the error,
   * where it happened, and nothing else.
   *
   * Omit it and nothing changes: one call, one reply, exactly as before.
   */
  readonly verify?: (source: string) => Promise<VerifyFailure | string | null> | VerifyFailure | string | null;
  /**
   * How many times a failed build may be handed back. Default 2, so three calls
   * in the worst case.
   *
   * A repair turn is not a re-roll and does not soften what this lane measures.
   * It quotes the runtime error and asks again — the same ladder the brain lane
   * runs — and every failure it fed back is on `ForgeResult.repairs`, so a
   * creature that needed help is never mistaken for one that did not. The
   * measurement this protects is worth stating: without it, a creature is lost
   * to a one-word slip. Measured here — Opus 5 declared its root object under
   * one name and returned it under another (`return fairy` against a variable
   * called `root`), and a body that cost $0.45 and three and a half minutes
   * could not be built at all.
   */
  readonly repairAttempts?: number;
  /**
   * Показывать ли модели её собственное прошлое тело в ходе ремонта.
   *
   * По умолчанию да. `true` здесь возвращает прежнее поведение — ремонт
   * вслепую, от исходного промпта — и существует ровно ради замера «до/после»:
   * без него сравнить два протокола на одних сидах невозможно.
   */
  readonly blindRepair?: boolean;
  /**
   * Чинить только то, что НЕ СОБИРАЕТСЯ.
   *
   * Провалы бывают двух видов, и они не равноценны. Жёсткий — тело не
   * запускается: упало исключением, оборвалось на полуслове, в ответе нет
   * функции. Без повтора существа не будет вовсе. Мягкий — тело работает, но
   * аудит недоволен стилем.
   *
   * Замерено: `one-oct` вышел с ТРЕМЯ непринятыми претензиями аудита и оказался
   * лучшим телом дня, а `m-opu-oct` отработал три прохода за $5.82 и остался с
   * шестью. Претензии стиля плохо совпадают с тем, что выглядит хорошо, а
   * платим мы за каждый проход полную цену.
   *
   * С этим флагом бюджет ремонта тратится только на жёсткие провалы. Мягкие
   * записываются в `unresolved` и не стоят ничего.
   */
  readonly repairHardOnly?: boolean;
}

/**
 * What `verify` says went wrong, and whether it is worth losing the body over.
 *
 * The distinction is the difference between "this does not run" and "this runs
 * and breaks the house style", and conflating them was expensive: a style
 * violation that survived the repair budget threw `unbuildable` and discarded a
 * working creature along with the three requests that paid for it. A body that
 * builds is worth keeping even when it is not beautiful — the violations go on
 * the record instead, where they can be read, and the operator decides.
 *
 * A bare string stays a HARD failure, so every existing caller keeps its
 * meaning.
 */
export interface VerifyFailure {
  readonly message: string;
  /** True when the body runs and is merely wrong. Survives the budget. */
  readonly soft?: boolean;
}

export interface ForgeResult {
  readonly prompt: string;
  readonly model: string;
  /** What the model literally sent, before any repair. Kept for the record. */
  readonly reply: string;
  /** Callable source plus the list of liberties taken getting there. */
  readonly code: ExtractedCode;
  /**
   * What the creature cost **in total**, summed over every attempt.
   *
   * Summed and not the last call's, and that is a correction rather than a
   * nicety: a body that took two repair turns made three requests and was
   * billed for three, and reporting the last one understated a live run by
   * exactly 3x. Every price in `docs/FORGE.md` for a repaired body predates
   * this and is low by however many attempts it took.
   */
  readonly usage: ForgeUsage | null;
  /** How many requests were made. 1 unless something was handed back. */
  readonly attempts: number;
  /** Wall clock across every attempt. */
  readonly elapsedMs: number;
  /**
   * Every build failure that was handed back, in order. Empty means the first
   * reply ran.
   *
   * On the record rather than swallowed: a lane that measures unaided model
   * behaviour must never let a creature that took three tries look like one
   * that took one.
   */
  readonly repairs: readonly string[];
  /**
   * Style violations still standing when the repair budget ran out.
   *
   * Present only on a body that was **kept anyway**: it builds, it runs, and it
   * did not satisfy every rule. Empty or absent means nothing was left over.
   * On the record rather than swallowed — a creature that limped past the audit
   * must never be indistinguishable from one that passed it.
   */
  readonly unresolved: readonly string[];
}

/** What one creature cost, as reported by the route rather than derived. */
export interface ForgeUsage {
  readonly promptTokens: number;
  /** Includes `reasoningTokens` — this is the number that is billed. */
  readonly completionTokens: number;
  /** Thinking, billed at the output rate. 0 on models that do not reason. */
  readonly reasoningTokens: number;
  /** US dollars actually charged, or null if the route did not say. */
  readonly costUsd: number | null;
}

const DEFAULT_BASE_URL = 'https://openrouter.ai';

/**
 * 96 000, against Opus 5's 128 000 ceiling on this route. Sized so the thinking
 * and the code both fit with room to spare, because the cost of over-asking is
 * nothing — this is a ceiling, not an allocation, and the bill is for tokens
 * actually produced — while the cost of under-asking is the whole call.
 */
const DEFAULT_MAX_TOKENS = 96_000;

/**
 * Тридцать минут.
 *
 * Было 900 000 мс, и комментарий рядом уверял, что это десять минут — разошлись
 * и число, и его описание. Замерено на Opus, домашний стиль: один запрос
 * занимает 520, 537, 817, 842, 1024, 1036, 1107, 1125 секунд. **Половина
 * прогонов длиннее прежнего потолка**, и все они обрывались на полуслове уже
 * после того, как токены были сгенерированы и оплачены.
 *
 * Остальные модели сюда не упираются: Haiku 40 с, Gemini 185 с, Sonnet 711 с.
 * Стена задевала ровно одну модель — самую дорогую.
 */
const DEFAULT_TIMEOUT_MS = 1_800_000;

/** Effort is understood by the frontier tiers and rejected outright by Haiku. */
function supportsEffort(model: string): boolean {
  return model.indexOf('haiku') < 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The request body, split out so a test can assert the one property that
 * matters: that `messages` is exactly two turns and the user turn is the
 * player's string and nothing else.
 */
export function forgeRequestBody(
  req: ForgeRequest,
  repairs: readonly string[] = [],
  prior?: string,
): Record<string, unknown> {
  /*
   * Two shapes, one composer. A growth call swaps *which* pair of turns is
   * built and nothing else — same two roles, same order, same rule that the
   * system turn is a constant and the variable half is data in the user turn.
   * `req.growth` carries the style itself, so a stage is never told a different
   * style than the body it is extending.
   */
  const messages =
    req.growth === undefined
      ? buildMessages(req.prompt, req.style)
      : // `req.style` is the fallback, not the override: a growth context that
        // names a style was read off the parent's record and is the one the body
        // was actually born under. Without this line a caller that set `style`
        // at the top level and left it off the context would grow a raw part
        // onto a styled body and get no error about it.
        buildGrowthMessages({ ...req.growth, style: req.growth.style ?? req.style });
  /*
   * A repair turn is one extra user message, not a rewritten first one. The
   * player's sentence stays verbatim and first — `buildMessages` is still the
   * only thing that composes it — and the failure arrives after it, the way a
   * compiler error arrives after the source.
   */
  const turns: Array<{ role: string; content: unknown }> = [{ role: 'system', content: messages.system }];

  /*
   * The style's reference photographs, in their own turn, ahead of the player's.
   *
   * Its own turn and not the player's, because the images belong to the STYLE:
   * they are the same constant for every prompt, chosen by whoever picked the
   * style, and the player's turn has to stay their sentence and nothing else —
   * that is the property the whole lane rests on. It cannot be the *system* turn
   * either: on this wire only a user turn may carry image content.
   */
  if (req.styleImages !== undefined && req.styleImages.length > 0) {
    turns.push({
      role: 'user',
      content: [
        { type: 'text', text: STYLE_REFERENCE_PREAMBLE },
        ...req.styleImages.map((image) => ({
          type: 'image_url',
          image_url: { url: `data:${image.mediaType};base64,${image.base64}` },
        })),
      ],
    });
  }

  turns.push({ role: 'user', content: messages.user });

  if (repairs.length > 0) {
    /*
     * The body it actually sent, as its own assistant turn.
     *
     * Until this existed the repair turn said "keep everything that is already
     * right … send the whole build function again" to a model that had never
     * been shown what it wrote. There was nothing to keep: every repair was a
     * blind re-roll from the original prompt, which is why a repaired body
     * costs a full generation and why fixing one rule breaks another —
     * measured on Opus, the third pass put the accent colour back to 21% after
     * the second had brought it inside the rule.
     *
     * Sent as `assistant` rather than quoted inside the user turn because that
     * is what it is: the model's own previous answer, in the position the wire
     * reserves for it. Input tokens are a fifth the price of output on every
     * route here, so carrying the old body costs a fraction of regenerating it.
     */
    if (prior !== undefined && prior.length > 0) {
      turns.push({ role: 'assistant', content: prior });
    }
    /*
     * Only the LAST complaint when the body is shown. The earlier ones were
     * about bodies that no longer exist — quoting them at a model that can see
     * the current one invites it to fix faults that are already gone.
     */
    const said = prior !== undefined && prior.length > 0
      ? repairs[repairs.length - 1]
      : repairs.map((r, i) => (repairs.length > 1 ? `attempt ${i + 1}: ${r}` : r)).join('\n');
    turns.push({
      role: 'user',
      content: prior !== undefined && prior.length > 0
        ? `That body has a problem:\n\n${said}\n\nSend the corrected build function. `
          + 'Keep every part that is already right — same subject, same anatomy, same part names, '
          + 'same colours and proportions everywhere the complaint does not touch. Change only what '
          + 'is named above. Code only.'
        : 'Your previous reply did not run:\n\n' + said
          + '\n\nSend the whole build function again, fixed. Code only.',
    });
  }
  const body: Record<string, unknown> = {
    model: req.model,
    max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: turns,
  };
  const effort = req.effort ?? 'high';
  if (req.thinkTokens === 0) {
    /* Ноль — это не «мало», а «не надо»: решение уже принято в плане, и второй
       вызов только переносит его в геометрию. Выключение, в отличие от потолка,
       провайдер исполняет. */
    body.reasoning = { enabled: false };
  } else if (req.thinkTokens !== undefined && req.thinkTokens > 0) {
    /* Явный бюджет бьёт настроение: просим ровно столько и ни токеном больше. */
    body.reasoning = { max_tokens: req.thinkTokens };
  } else if (supportsEffort(req.model)) {
    body.reasoning = { effort };
  }
  body.stream = true;
  // OpenRouter only reports token counts on a stream when asked.
  body.stream_options = { include_usage: true };
  /*
   * Ask for the actual charge, not a token count to multiply by a price list.
   *
   * This matters more than instrumentation usually does: at Opus 5's $25 per
   * million output tokens, one creature is around $0.70 and a thousand players
   * is a four-figure line item. A per-creature price that is *measured* and
   * stored on the record is what turns "which model, at what effort" from an
   * argument into a table — and the price list moves, so deriving it here
   * would go stale silently.
   */
  body.usage = { include: true };
  return body;
}

function readUsage(payload: unknown): ForgeResult['usage'] {
  if (!isRecord(payload) || !isRecord(payload.usage)) return null;
  const u = payload.usage;
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

  /*
   * Reasoning tokens are pulled out separately because they are the whole cost
   * story. On the first live ship, 28 072 completion tokens carried roughly
   * 6 000 tokens of actual JavaScript — the other ~22 000 were thinking, billed
   * at the same output rate. Effort is therefore the largest single lever on
   * the bill, and it is only visible if this number is recorded.
   *
   * OpenRouter reports it nested under `completion_tokens_details`, and omits
   * the field entirely for models that do not reason; 0 is the honest default.
   */
  const details = isRecord(u.completion_tokens_details) ? u.completion_tokens_details : null;
  return {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    reasoningTokens: details ? num(details.reasoning_tokens) : 0,
    /** US dollars, as charged. `null` when the route did not report it. */
    costUsd: typeof u.cost === 'number' ? u.cost : null,
  };
}

/**
 * Reads one SSE event's `data:` payload into the accumulating completion.
 *
 * Split out from the loop below so the three shapes a single event can carry —
 * a content delta, a mid-stream error, a terminal `finish_reason` — are
 * distinguished in one readable place. `reasoning` deltas are deliberately
 * *not* accumulated: on a reasoning model they are the thinking, not the
 * answer, and appending them would put prose in the middle of the source file.
 */
interface StreamState {
  text: string;
  finishReason: string | null;
  usage: ForgeResult['usage'];
  /**
   * Bytes of *thinking* seen, and the number of frames the stream delivered.
   *
   * Neither is used for anything except explaining an empty completion, which
   * is a failure that really happens: a live Opus 5 high-effort run returned
   * nothing at all after several minutes. "The model returned nothing" is not a
   * complaint anyone can act on — it could be a dropped connection, a route
   * that answered with zero frames, or a model that thought for four minutes
   * and then stopped. These three numbers tell those apart in the error string,
   * which is the difference between retrying and investigating.
   */
  reasoningChars: number;
  frames: number;
}

function applyEvent(state: StreamState, payload: unknown, onDelta?: (text: string) => void): void {
  if (!isRecord(payload)) return;
  if (isRecord(payload.error)) {
    const msg = typeof payload.error.message === 'string' ? payload.error.message : 'upstream error';
    throw new ForgeCallError('upstream', msg);
  }
  const usage = readUsage(payload);
  if (usage !== null) state.usage = usage;

  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) return;
  const first: unknown = choices[0];
  if (!isRecord(first)) return;
  if (typeof first.finish_reason === 'string') state.finishReason = first.finish_reason;

  const delta = first.delta;
  if (!isRecord(delta)) return;
  // Counted, never accumulated: on a reasoning model this is the thinking, and
  // appending it would put prose in the middle of the source file.
  if (typeof delta.reasoning === 'string') state.reasoningChars += delta.reasoning.length;
  if (typeof delta.content === 'string' && delta.content !== '') {
    state.text += delta.content;
    if (onDelta) onDelta(delta.content);
  }
}

/**
 * Drains an OpenAI-style SSE body.
 *
 * Streaming is not an optimisation here, it is what makes the call *work*. A
 * high-effort frontier model can think for four or five minutes before the
 * first content token, and Node's `fetch` gives up on a silent socket after
 * five (undici's 300 s `headersTimeout`/`bodyTimeout`) — the first live run of
 * this lane died exactly there, with `network — terminated` and nothing to show
 * for the spend. A stream puts headers on the wire immediately and OpenRouter
 * keeps the connection warm with `: OPENROUTER PROCESSING` comment lines, so
 * the socket is never idle and the timeout never fires.
 */
async function readStream(
  res: Response,
  onDelta?: (text: string) => void,
): Promise<StreamState> {
  const body = res.body;
  if (!body) throw new ForgeCallError('bad_body', 'the route returned no stream');

  const state: StreamState = { text: '', finishReason: null, usage: null, reasoningChars: 0, frames: 0 };
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line, but every event this wire sends
    // is a single `data:` line, so splitting on newlines is both sufficient and
    // immune to \r\n.
    let nl = buffer.indexOf('\n');
    while (nl >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf('\n');

      if (line === '' || line.startsWith(':')) continue; // keepalive comment
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        state.frames++;
        applyEvent(state, JSON.parse(data) as unknown, onDelta);
      } catch (err) {
        if (err instanceof ForgeCallError) throw err;
        // A single unparseable frame is not worth losing a five-minute
        // generation over; the completion is reassembled from the rest.
      }
    }
  }

  if (state.finishReason === 'length') {
    throw new ForgeCallError(
      'truncated',
      `the creature hit max_tokens before it finished (${state.text.length} bytes of code written)`,
      null,
      state.text,
    );
  }
  if (state.finishReason === 'content_filter') {
    throw new ForgeCallError('refusal', 'the model declined this prompt');
  }
  return state;
}

/**
 * Prompt in, callable creature source out.
 *
 * `elapsedMs` is wall-clock and this is the only place in the lane that reads
 * it — it is a fact about the *request*, never an input to anything the model
 * builds, so nothing downstream becomes non-reproducible by its presence.
 */
async function oneCall(req: ForgeRequest, repairs: readonly string[], prior?: string): Promise<ForgeResult> {
  const doFetch = req.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
  if (typeof doFetch !== 'function') throw new ForgeCallError('no_fetch', 'this runtime has no fetch');
  if (req.apiKey.trim() === '') throw new ForgeCallError('no_key', 'no API key was supplied');

  const base = (req.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onOuterAbort = (): void => controller.abort();
  if (req.signal) {
    if (req.signal.aborted) controller.abort();
    else req.signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  const started = Date.now();
  try {
    const res = await doFetch(`${base}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        authorization: `Bearer ${req.apiKey}`,
        'HTTP-Referer': 'https://autoage.game',
        'X-Title': 'Autoage Forge',
      },
      body: JSON.stringify(forgeRequestBody(req, repairs, prior)),
      signal: controller.signal,
    });

    if (!res.ok) {
      // The body is usually the useful half of an OpenRouter 4xx — a model id
      // that does not exist, a route with no provider up — so it is carried
      // into the message rather than thrown away for a bare status code.
      const text = await res.text().catch(() => '');
      throw new ForgeCallError(
        'http_' + res.status,
        `${res.status} ${res.statusText}: ${text.slice(0, 400)}`,
        res.status,
      );
    }

    const stream = await readStream(res, req.onDelta);
    if (stream.text.trim() === '') {
      throw new ForgeCallError(
        'empty',
        `the model produced no code — ${stream.frames} stream frames, ` +
          `${stream.reasoningChars} characters of thinking, ` +
          `finish reason ${stream.finishReason ?? 'never reported'}`,
      );
    }

    /*
     * A growth delta declares `grow`, not `build`, and extracting it with the
     * build reader rejects a perfectly good reply as "no build function".
     *
     * Measured on the first live delta: the model was told that twice, and by
     * the third attempt it had bolted a dummy `build` onto the parcel purely to
     * get past us. Two of the three requests — two thirds of the bill — bought
     * nothing but a workaround for our own mistake.
     */
    const code = req.growth?.mode === 'delta'
      ? extractGrowthSource(stream.text)
      : extractBuildSource(stream.text);
    return {
      prompt: req.prompt,
      model: req.model,
      reply: stream.text,
      code,
      usage: stream.usage,
      repairs,
      unresolved: [],
      attempts: 1,
      elapsedMs: Date.now() - started,
    };
  } catch (err) {
    if (err instanceof ForgeCallError || err instanceof ForgeFormatError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ForgeCallError('timeout', 'the request was aborted or timed out');
    }
    throw new ForgeCallError('network', err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeout);
    if (req.signal) req.signal.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * One creature, with the build failures handed back rather than lost.
 *
 * Without `verify` this is one call and one reply, unchanged. With it, the
 * source is run before it is returned, and a body that threw gets its own error
 * quoted back to the model — the same repair ladder the brain lane runs, and
 * for the same reason: the failures this catches are one-word slips, not
 * failures of imagination, and losing a $0.45 creature to a misspelled variable
 * measures nothing except the absence of a retry.
 *
 * A `ForgeFormatError` — no `build` function anywhere in the reply — is a repair
 * turn too. It is the one failure `clean.ts` cannot fix by being tolerant, and
 * it is exactly the kind a model corrects on being told.
 */
export async function forgeCreature(req: ForgeRequest): Promise<ForgeResult> {
  const budget = Math.max(0, req.repairAttempts ?? 2);
  const repairs: string[] = [];

  /*
   * The running bill, across every attempt.
   *
   * A repair turn is a whole extra request at the same price, so a creature
   * that took three tries cost three times what its last call did. Returning
   * the last call's usage — which is what this did until the style audit made
   * repairs common — understates a live run by exactly that factor, in the one
   * number the whole cost model is built on.
   */
  let spent: ForgeUsage | null = null;
  let calls = 0;
  const startedAll = Date.now();
  /**
   * The best body seen so far — one that RUNS but broke a style rule.
   *
   * Held because a soft failure starts an *optional* repair, and an optional
   * call that fails must not cost the creature that was already in hand.
   * Measured, at the cost of a whole round: five bodies, high effort, the
   * house style; the first attempt on one of them came back working and
   * flagged `greebles-hidden`, the repair turn hit a 429 session limit, and
   * `forgeCreature` threw — discarding a twenty-one-minute body over a rule
   * the operator may well have accepted, and reporting it as `http_429` so it
   * read as a body that was never built.
   *
   * This is the same principle the out-of-budget branch below already states
   * ("throwing here would discard a working body … over a rule the operator
   * may well accept"), extended to the case that branch does not reach: the
   * budget was not spent, the *transport* failed.
   */
  let held: { result: ForgeResult; failure: string } | null = null;
  /* Тело прошлой попытки — то, что модель увидит своим ходом ассистента. */
  let prior: string | undefined;
  const bank = (usage: ForgeUsage | null): void => {
    calls++;
    if (usage === null) return;
    spent = spent === null
      ? usage
      : {
          promptTokens: spent.promptTokens + usage.promptTokens,
          completionTokens: spent.completionTokens + usage.completionTokens,
          reasoningTokens: spent.reasoningTokens + usage.reasoningTokens,
          // `null` means the route did not say; a partial total is still worth
          // more than dropping the halves it did report.
          costUsd: spent.costUsd === null && usage.costUsd === null
            ? null
            : (spent.costUsd ?? 0) + (usage.costUsd ?? 0),
        };
  };
  const settle = (result: ForgeResult): ForgeResult => ({
    ...result,
    usage: spent,
    attempts: calls,
    elapsedMs: Date.now() - startedAll,
    repairs,
  });

  for (let attempt = 0; ; attempt++) {
    let result: ForgeResult;
    try {
      result = await oneCall(req, repairs, req.blindRepair === true ? undefined : prior);
      bank(result.usage);
    } catch (err) {
      // A thrown attempt was still billed for whatever it produced; the route
      // reports usage only on a completed stream, so this counts the call.
      calls++;
      /*
       * A failed attempt with a working body already in hand is not a failed
       * creature. This is the *only* place that distinction can be made — by
       * the time the caller sees the exception, the earlier reply is gone.
       */
      if (held !== null) return { ...settle(held.result), unresolved: [held.failure, `the repair attempt failed: ${String((err as Error)?.message ?? err)}`] };
      const fixable = err instanceof ForgeFormatError && attempt < budget;
      if (!fixable) throw err;
      // Name the function it was actually asked for. Telling a delta call that
      // its `build` is missing is how the dummy `build` got written.
      const wanted = req.growth?.mode === 'delta' ? 'grow' : 'build';
      repairs.push(`no ${wanted} function in the reply (${(err as ForgeFormatError).reason})`);
      continue;
    }

    if (req.verify === undefined) return settle(result);
    const verdict = await req.verify(result.code.source);
    if (verdict === null) return settle(result);
    const failure = typeof verdict === 'string' ? { message: verdict, soft: false } : verdict;

    if (attempt >= budget) {
      /*
       * Out of budget. What happens next depends entirely on which kind of
       * failure this is, and getting it wrong costs a whole creature:
       *
       *   hard — it does not run. There is nothing to keep, so this throws and
       *          the caller writes out the partial as evidence.
       *   soft — it runs, and it breaks the house style. Throwing here would
       *          discard a working body and the three requests that paid for
       *          it, over a rule the operator may well accept. It is kept, and
       *          what it still gets wrong is recorded.
       */
      if (failure.soft === true) return { ...settle(result), unresolved: [failure.message] };
      throw new ForgeCallError(
        'unbuildable',
        `the creature still would not build after ${attempt + 1} attempt(s): ${failure.message}`,
        null,
        result.code.source,
      );
    }
    /*
     * Мягкий провал при `repairHardOnly` — не повод платить за ещё один проход:
     * тело работает, а претензия уходит в `unresolved`, где её видит оператор.
     */
    if (failure.soft === true && req.repairHardOnly === true) {
      return { ...settle(result), unresolved: [failure.message] };
    }
    // Keep it before asking for a better one. See `held`.
    if (failure.soft === true) held = { result, failure: failure.message };
    prior = result.code.source;
    repairs.push(failure.message);
  }
}

export { FORGE_SYSTEM };
