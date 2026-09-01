/**
 * Второй транспорт генерации: ПОДПИСКА, а не оплата за токены.
 *
 * ── ТРЕБОВАНИЕ ОСНОВАТЕЛЯ (01.09), дословно ───────────────────────────────
 *
 *   «попробуй создать существ через Opus и через Fable, но обязательно через
 *    подписку на oauth. Ни в коем случае не гоняй ничего дорогого через
 *    OpenRouter. На OpenRouter лимит 6 долларов.»
 *
 * ── ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ ВЕТКА В `llm.js` ──────────────────────
 *
 * Транспорты различаются НЕ адресом, а тем, чем платят и чем измеряют:
 *
 *                  OpenRouter (`llm.js`)        подписка (этот файл)
 *   деньги         свой ключ, потолок $3.20     подписка, потолка в долларах нет
 *   бюджет         `maxTokens` вычисляется      его нет вовсе: `claude -p` не
 *                  из цены за токен             принимает потолок ответа
 *   размышление    `reasoning.max_tokens`       `--effort`, три ступени
 *   отказ          HTTP-код                     `is_error` в JSON конверта
 *
 * Свести их в один вызов значило бы завести в `callModel` четыре развилки по
 * каждому из этих полей и потерять правило §5.1 «бюджет размышления задаётся
 * явно для каждой связки» — потому что для подписки его задать нечем.
 *
 * ── ЧТО ЭТО НЕ ОТМЕНЯЕТ ───────────────────────────────────────────────────
 *
 * E4 говорит: «всё идёт на собственном ключе с собственным потолком биллинга;
 * ничего не генерируется через кредитный канал GENEX». Подписка — это тоже
 * собственный счёт основателя, а не кредитный канал платформы, так что E4 не
 * нарушен. Но это счёт КОНКРЕТНОЙ МАШИНЫ: `claude` — локальный бинарник с
 * локальной сессией OAuth, и на чужом сервере его нет. Поэтому канал не
 * включается сам: без `AIRENA_SUB_MODELS=1` его связок нет в каталоге вовсе,
 * и игрок их не увидит.
 *
 * ── ОСТРЫЕ УГЛЫ УНАСЛЕДОВАНЫ ЦЕЛИКОМ ──────────────────────────────────────
 *
 * Они все перечислены в шапке `src/brain/claude.js` и стоили времени: `claude`
 * из-под другого `claude` виснет без единого байта (среда чистится), отозванный
 * токен приходит как «успех», `modelUsage` — карта, и первый её ключ не ответ.
 * Здесь ничего из этого не переписано — вызывается тот же `askClaude`.
 */

import { askClaude, CLAUDE_BIN } from '../../brain/claude.js';
import { LlmError } from './llm.js';

/** Включён ли канал на этой машине. Без него связок нет в каталоге. */
export const SUB_ENABLED = process.env.AIRENA_SUB_MODELS === '1';

/** Префикс идентификатора связки. `sub:opus:high` — семья и усилие. */
export const SUB_PREFIX = 'sub:';

/** Это связка подписки? Одна проверка на весь сервер. */
export const isSubscription = (modelId) => typeof modelId === 'string' && modelId.startsWith(SUB_PREFIX);

/**
 * Семьи, которые основатель назвал. Список белый и короткий по той же причине,
 * что и `ALLOWED` в каталоге: «добавить семью — одна строка и решение
 * основателя», а чёрный список пропустил бы каждую новую по умолчанию.
 *
 * `secs` — грубая оценка полного прохода (разбор, мозг, тело, карточка, VFX).
 * Она нужна не для цены, а чтобы игрок видел ожидание ДО нажатия: тело — это
 * программа на three.js в десятки тысяч токенов, и на любой модели это минуты.
 */
export const SUB_FAMILIES = {
  opus: { label: 'Claude Opus (подписка)', model: 'opus', secs: 420, listed: true },
  fable: { label: 'Claude Fable (подписка)', model: 'fable', secs: 300, listed: true },
  /* Sonnet работает, но в каталоге не показывается: основатель назвал две
     семьи, а экран выбора — это место, где каждая лишняя кнопка стоит
     внимания. Связка остаётся вызываемой по имени (`sub:sonnet:plain`) для
     инструментов и замеров. */
  sonnet: { label: 'Claude Sonnet (подписка)', model: 'sonnet', secs: 240, listed: false },
};

/**
 * Усилие вместо бюджета размышления.
 *
 * У `claude -p` нет потолка на ответ и нет числа токенов размышления — есть
 * `--effort` из трёх ступеней. Раскладка сделана так, чтобы имена режимов
 * совпали с `THINK_MODES` каталога и игрок видел одну и ту же подпись на обоих
 * каналах.
 */
export const SUB_EFFORT = { plain: 'low', think: 'medium', high: 'high' };

/**
 * Какие режимы попадают В КАТАЛОГ.
 *
 * Три режима на три семьи — это девять кнопок в экране выбора, где до них
 * было четыре. Разница между `low` и `medium` на глаз не читается, а между
 * `low` и `high` читается: одна пишет быстро, другая долго и тщательнее.
 * Показываются края, середина остаётся вызываемой по имени.
 */
export const SUB_LISTED_MODES = ['plain', 'high'];

/**
 * Связки подписки для каталога.
 *
 * Цена НЕ считается и не показывается: подписка — это фиксированный месячный
 * счёт, и приписать существу долю от него значит выдумать число. `creatureUsd`
 * равен нулю, а тир свой — `sub`, чтобы правило «платные связки игроку
 * недоступны» не пришлось ослаблять для одного случая.
 */
export function subscriptionBundles() {
  if (!SUB_ENABLED) return [];
  const out = [];
  for (const [key, f] of Object.entries(SUB_FAMILIES)) {
    if (!f.listed) continue;
    for (const mode of SUB_LISTED_MODES) {
      const effort = SUB_EFFORT[mode];
      out.push({
        bundle: `${SUB_PREFIX}${key}:${mode}`,
        modelId: `${SUB_PREFIX}${key}`,
        mode,
        label: f.label,
        thinkLabel: { plain: 'без размышления', think: 'с размышлением', high: 'глубокое размышление' }[mode],
        thinkBudget: 0,
        /* Потолок ответа у CLI не задаётся. Число здесь — не настройка, а
           обязательное поле каталога; `callSubscription` его игнорирует. */
        maxTokens: 64_000,
        creatureUsd: 0,
        bodyUsd: null,
        brainUsd: null,
        secs: mode === 'plain' ? f.secs : Math.round(f.secs * 1.4),
        measured: false,
        tier: 'sub',
        brak: null,
        effort,
      });
    }
  }
  return out;
}

/**
 * Один запрос к подписке. Возвращает ТУ ЖЕ ФОРМУ, что `callModel`.
 *
 * Одинаковая форма — не вежливость: `callWithRepair` читает `finishReason`,
 * `costUsd`, `usage` и `text`, и ветка «а если это подписка» в нём означала бы
 * два разных правила повтора для одной и той же задачи.
 *
 * `messages` схлопываются в системный промпт плюс один пользовательский:
 * `claude -p` принимает ровно это. Многоходовой диалог сюда не приезжает —
 * `callWithRepair` дописывает подсказку отдельным сообщением, и она честно
 * склеивается в тот же пользовательский ход.
 */
export async function callSubscription({
  modelId, messages, effort = 'high', signal = null, timeoutMs = 1_800_000,
}) {
  const key = String(modelId).slice(SUB_PREFIX.length);
  const family = SUB_FAMILIES[key];
  if (!family) throw new LlmError('bad_call', `неизвестная семья подписки: ${key}`);
  if (!SUB_ENABLED) throw new LlmError('no_key', 'канал подписки выключен (AIRENA_SUB_MODELS)');

  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const user = messages.filter((m) => m.role !== 'system').map((m) => m.content).join('\n\n');
  if (!user.trim()) throw new LlmError('bad_call', 'пустой пользовательский ход');

  const started = Date.now();
  let r;
  try {
    r = await askClaude({
      prompt: user,
      system: system || undefined,
      model: family.model,
      effort,
      timeoutMs,
      bin: CLAUDE_BIN,
    });
  } catch (e) {
    /*
     * Классификация ошибки по тексту — единственный способ: у CLI нет кодов.
     * Различаются три случая, и они требуют разного: стена по времени —
     * подождать, отсутствие бинарника — сказать вслух, всё остальное — повтор.
     */
    const msg = String(e.message || e);
    const code = /exceeded \d+ ms/.test(msg) ? 'wall'
      : (/ENOENT|no output/i.test(msg) ? 'no_key' : 'http');
    throw new LlmError(code, `подписка: ${msg.slice(0, 300)}`, { elapsedMs: Date.now() - started });
  }
  if (signal?.aborted) throw new LlmError('wall', 'отменено');

  const inTok = Number(r.usage?.input_tokens ?? 0);
  const outTok = Number(r.usage?.output_tokens ?? 0);
  return {
    text: r.text || '',
    /*
     * `costUsd` от CLI — это СПРАВОЧНАЯ цена токенов, а не списание: подписка
     * уже оплачена. Ноль здесь честнее: бюджет запроса (`REQUEST_BUDGET_USD`)
     * считает деньги, которые уходят с ключа, и подписка их не тратит.
     * Настоящее число остаётся в телеметрии — по нему видно, сколько бы это
     * стоило по счётчику.
     */
    costUsd: 0,
    referenceUsd: r.costUsd ?? 0,
    elapsedMs: r.durationMs ?? (Date.now() - started),
    /* Обрыва по потолку у CLI не бывает: потолка нет. */
    finishReason: 'stop',
    usage: {
      in: inTok,
      out: outTok,
      reasoning: 0,
      reasoningShare: 0,
    },
    provider: 'claude-cli',
    /* Какая модель ОТВЕТИЛА, а не какую просили: `resolveModel` разбирает
       карту `modelUsage`, где рядом лежит фоновый трафик самого CLI. */
    generationId: r.model ?? null,
    resolvedModel: r.model ?? null,
    resolvedBy: r.modelResolvedBy ?? null,
  };
}
