/**
 * Единственное место, где Airena разговаривает с языковой моделью.
 *
 * Урок, записанный кровью в FINDINGS §1: «параметры вызова LLM должны жить в
 * одном общем месте, а не переписываться заново в каждом инструменте».
 * `tools/orbrain.mjs` писался отдельно, не унаследовал правило про бюджет
 * размышления и сжёг $0.96 и полчаса на пустые ответы. Поэтому у продакшена
 * ровно одна дверь, и она здесь.
 *
 * E4: всё идёт на собственном ключе с собственным потолком биллинга. Ничего
 * не генерируется через кредитный канал GENEX и ничто в продакшене не зовёт
 * локальный `claude` CLI.
 */

import { RETRY_THINK_BUDGET } from './models.js';

const URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Модели, которые ОТКАЗЫВАЮТСЯ выключать размышление.
 *
 * Замерено 29.08: `google/gemini-3.7-flash` на `reasoning:{enabled:false}`
 * отвечает `400 Reasoning is mandatory for this endpoint and cannot be
 * disabled.` Это ровно та же ловушка, что в FINDINGS §1, но с другой стороны:
 * там модель молчала без бюджета размышления, здесь она отказывается работать
 * с нулевым. Обе ломают генерацию целиком, и обе видны только из ответа.
 *
 * Поэтому «без размышления» здесь означает не «выключено», а «столько,
 * сколько провайдер разрешает минимально». Множество наполняется само, из
 * первого же отказа, и второй раунд-трип на ту же модель уже не тратится.
 */
const MANDATORY_REASONING = new Set();
/** Минимальный бюджет для тех, кому ноль нельзя. */
export const FLOOR_THINK_BUDGET = 256;

export const mandatesReasoning = (id) => MANDATORY_REASONING.has(id);

/** Стена по времени — защищает не деньги, а терпение игрока (§5.1, правило 2). */
export const WALL_MS = 180_000;

export class LlmError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

/**
 * Один запрос. Никаких умолчаний: `maxTokens` и `thinkBudget` обязательны.
 *
 * @param {object} o
 *   modelId      идентификатор OpenRouter
 *   messages     [{role, content}]
 *   maxTokens    общий потолок (размышление + код), вычислен из бюджета
 *   thinkBudget  бюджет размышления в токенах, 0 = выключено
 *   wallMs       стена по времени
 */
export async function callModel({
  modelId, messages, maxTokens, thinkBudget, wallMs = WALL_MS,
  apiKey = process.env.OPENROUTER_API_KEY, fetchImpl = fetch, signal = null,
}) {
  if (!apiKey) throw new LlmError('no_key', 'OPENROUTER_API_KEY не задан');
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    throw new LlmError('bad_call', 'maxTokens обязателен и вычисляется из бюджета, а не выбирается');
  }
  if (!Number.isFinite(thinkBudget) || thinkBudget < 0) {
    throw new LlmError('bad_call', 'thinkBudget обязателен и задаётся явно для каждой связки');
  }

  const body = {
    model: modelId,
    messages,
    max_tokens: maxTokens,
    usage: { include: true },
  };
  /*
   * `reasoning` в двух формах, потому что провайдеры принимают разные:
   * `enabled:false` исполняют Anthropic и Google, `max_tokens` — остальные.
   * Отправляем ту, что соответствует намерению, и не обе сразу.
   */
  const effectiveThink = thinkBudget > 0
    ? thinkBudget
    : (MANDATORY_REASONING.has(modelId) ? FLOOR_THINK_BUDGET : 0);
  body.reasoning = effectiveThink > 0
    ? { max_tokens: effectiveThink, exclude: true }
    : { enabled: false, exclude: true };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('wall')), wallMs);
  if (signal) signal.addEventListener('abort', () => ac.abort(signal.reason), { once: true });
  const started = Date.now();

  let res;
  try {
    res = await fetchImpl(URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'x-title': 'Airena',
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const wall = Date.now() - started >= wallMs - 50;
    throw new LlmError(wall ? 'wall' : 'network', wall
      ? `модель не ответила за ${Math.round(wallMs / 1000)} с`
      : `сеть: ${e.message}`, { elapsedMs: Date.now() - started });
  }
  clearTimeout(timer);

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    /* Провайдер требует размышления — запоминаем и переспрашиваем с полом.
       Один раз на модель: дальше `effectiveThink` подставит его сам. */
    if (res.status === 400 && /reasoning is mandatory/i.test(t) && effectiveThink === 0) {
      MANDATORY_REASONING.add(modelId);
      return callModel({
        modelId, messages, maxTokens, thinkBudget: FLOOR_THINK_BUDGET,
        wallMs, apiKey, fetchImpl, signal,
      });
    }
    throw new LlmError(res.status === 429 ? 'rate' : 'http',
      `openrouter ${res.status}: ${t.slice(0, 300)}`, { status: res.status });
  }

  const j = await res.json();
  const choice = j.choices?.[0];
  const text = choice?.message?.content ?? '';
  const usage = j.usage || {};
  const costUsd = Number(usage.cost ?? 0);
  const reasoningTokens = Number(usage.completion_tokens_details?.reasoning_tokens ?? 0);
  const outTokens = Number(usage.completion_tokens ?? 0);

  return {
    text,
    costUsd,
    elapsedMs: Date.now() - started,
    finishReason: choice?.finish_reason ?? null,
    usage: {
      in: Number(usage.prompt_tokens ?? 0),
      out: outTokens,
      reasoning: reasoningTokens,
      /* Доля размышления не порог и не фильтр (§5.1: порога не существует) —
         она телеметрия, по которой каталог замечает подорожавшую связку. */
      reasoningShare: outTokens ? reasoningTokens / outTokens : 0,
    },
    provider: j.provider ?? null,
    generationId: j.id ?? null,
  };
}

/**
 * Вызов с повтором по правилу 4: повтор с УРЕЗАННЫМ бюджетом размышления.
 * Замерено: спас все три модели, которые молчали (GLM 0 → 3 400 символов,
 * Kimi обрубок → 4 003, Qwen молчание → 5 494).
 *
 * E3.4 держит лимит попыток равным 2 — то есть первая и ровно один повтор.
 * `accept` решает, годится ли ответ; пустая строка не годится никогда.
 */
export async function callWithRepair({
  modelId, messages, maxTokens, thinkBudget,
  accept = (t) => t.trim().length > 0,
  attempts = 2, onAttempt = null, ...rest
}) {
  const tries = [];
  let budget = thinkBudget;
  for (let i = 0; i < attempts; i++) {
    let r; let error = null;
    try {
      r = await callModel({ modelId, messages, maxTokens, thinkBudget: budget, ...rest });
    } catch (e) {
      error = e;
      r = { text: '', costUsd: 0, elapsedMs: e.elapsedMs ?? 0, usage: { in: 0, out: 0, reasoning: 0, reasoningShare: 0 } };
    }
    const ok = !error && accept(r.text);
    tries.push({ attempt: i, thinkBudget: budget, ok, error: error?.code ?? null, costUsd: r.costUsd, elapsedMs: r.elapsedMs, chars: r.text.length });
    if (onAttempt) onAttempt(tries[tries.length - 1]);
    if (ok) return { ...r, tries, costUsd: tries.reduce((s, t) => s + t.costUsd, 0) };
    /* Урезаем размышление, а не наращиваем: провал почти всегда — зацикливание
       в размышлении, и больше бюджета его только удлиняет. */
    budget = budget > RETRY_THINK_BUDGET ? RETRY_THINK_BUDGET : 0;
  }
  const spent = tries.reduce((s, t) => s + t.costUsd, 0);
  throw new LlmError('rejected', 'модель не вернула годного ответа', { tries, costUsd: spent });
}

/** Достать блок кода из ответа, чем бы модель его ни обернула. */
export function extractCode(text) {
  const fence = /```(?:javascript|js)?\s*\n([\s\S]*?)```/g;
  const blocks = [...text.matchAll(fence)].map((m) => m[1].trim()).filter(Boolean);
  if (blocks.length) return blocks.sort((a, b) => b.length - a.length)[0];
  return text.trim();
}

/** Достать JSON-объект из ответа. */
export function extractJson(text) {
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/;
  const m = text.match(fence);
  const raw = m ? m[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new LlmError('bad_json', 'в ответе нет объекта JSON');
  return JSON.parse(raw.slice(start, end + 1));
}
