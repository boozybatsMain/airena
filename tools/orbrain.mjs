/**
 * Генерация мозга через OpenRouter — эксперимент по стоимости.
 *
 *   OPENROUTER_API_KEY=... node tools/orbrain.mjs --model=anthropic/claude-sonnet-5
 *   OPENROUTER_API_KEY=... node tools/orbrain.mjs --model=google/gemini-3.7-flash --fighter=gorilla
 *
 * Берёт РОВНО тот же промпт, что и brainforge (`brainPrompt`), и шлёт его в
 * OpenRouter. Пишет `logs/or-<slug>.json` с честной стоимостью: `usage.include`
 * заставляет OpenRouter вернуть цену, которую он реально списал, — выводить её
 * из прайса самому нельзя, прайс двигается молча.
 *
 * Ответ НЕ валидируется здесь: цель замера — цена и время генерации,
 * а качество меряется отдельно, боями.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { brainPrompt, SYSTEM_PROMPT } from '../src/brain/prompt.js';

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const MODEL = arg('model', 'anthropic/claude-sonnet-5');
const FIGHTER = arg('fighter', 'octopus');
const REASONING = arg('reasoning', '');   // '' | low | medium | high
const THINK = Number(arg('think', 0));   // потолок токенов на размышление
const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) {
  console.error('нет OPENROUTER_API_KEY');
  process.exit(1);
}

const prompt = brainPrompt(FIGHTER);
const started = Date.now();

/* Будильник. Модель, которая ушла думать, наружу не отдаёт ничего до самого
   конца — «думает» и «зависла» снаружи неотличимы. GLM на этом просидел
   16 минут и вернул ноль символов. Пять минут — потолок: всё, что пишет код,
   а не размышляет о нём, укладывается в минуту-две. */
const LIMIT_MS = Number(arg('timeout', '300')) * 1000;
const bell = AbortSignal.timeout(LIMIT_MS);

let res, payload;
try {
res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  signal: bell,
  method: 'POST',
  headers: {
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    'X-Title': 'Airena cost probe',
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    max_tokens: 64000,
    usage: { include: true },
    /* CLI гоняет с effort=high, то есть с размышлением. Без него сравнение
       нечестное: размышление — это ~70% выходных токенов и почти вся цена. */
    /* max_tokens — общий кошелёк на размышление И на код. Модель, которой не
       сказали, сколько думать, тратит его весь на размышление и до кода не
       доходит: GLM выбрал 63 981 из 64 000 и вернул ноль символов. THINK
       ставит потолок отдельно на размышление, оставляя остаток под ответ. */
    ...(THINK ? { reasoning: { max_tokens: THINK } }
              : REASONING ? { reasoning: { effort: REASONING } } : {}),
  }),
});

/* Время считаем ПОСЛЕ разбора тела: fetch резолвится на заголовках,
   и замер до .json() показывает время до первого байта, а не генерации. */
  payload = await res.json();
} catch (e) {
  const secs = Math.round((Date.now() - started) / 1000);
  const bell_rang = e.name === 'TimeoutError' || e.name === 'AbortError';
  console.log(`${MODEL} ${FIGHTER}: ` + (bell_rang
    ? `⏱ СНЯТ по таймауту через ${secs} с — молчал дольше ${LIMIT_MS / 1000} с`
    : `✖ сорвался через ${secs} с — ${e.name}: ${e.message}`));
  /* Не ошибка прогона: «не уложился» — это и есть результат замера по модели.
     Цикл должен идти дальше, а не падать на первой упрямой модели. */
  process.exit(0);
}
const elapsedMs = Date.now() - started;

if (!res.ok || payload.error) {
  console.error(`ОШИБКА ${MODEL}/${FIGHTER}: ${res.status}`,
    JSON.stringify(payload.error ?? payload).slice(0, 300));
  process.exit(2);
}

const choice = payload.choices?.[0];
const text = choice?.message?.content ?? '';
/* 'length' = модель упёрлась в max_tokens и код оборван на полуслове.
   Файл при этом выглядит нормальным, поэтому причину пишем в запись. */
const finish = choice?.finish_reason ?? choice?.native_finish_reason ?? null;
const truncated = finish === 'length';
const u = payload.usage ?? {};
const rec = {
  model: MODEL,
  fighter: FIGHTER,
  reasoning: REASONING || 'off',
  promptChars: prompt.length,
  replyChars: text.length,
  promptTokens: u.prompt_tokens ?? null,
  completionTokens: u.completion_tokens ?? null,
  reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? null,
  costUsd: typeof u.cost === 'number' ? u.cost : null,
  finishReason: finish,
  truncated,
  elapsedMs,
  at: new Date().toISOString(),
};

const slug = `${MODEL.replace(/[^a-z0-9]+/gi, '-')}-${FIGHTER}${
  THINK ? '-think' + THINK : REASONING ? '-' + REASONING : '-plain'}`;
await mkdir(new URL('../logs/', import.meta.url), { recursive: true });
await writeFile(new URL(`../logs/or-${slug}.json`, import.meta.url),
  JSON.stringify(rec, null, 2));
await writeFile(new URL(`../logs/or-${slug}.js`, import.meta.url), text);

console.log(
  `${MODEL} ${FIGHTER} [${REASONING || 'без размышления'}]: $${(rec.costUsd ?? 0).toFixed(4)} · ` +
  `${Math.round(elapsedMs / 1000)}s · ${rec.replyChars} символов · ` +
  `выход ${rec.completionTokens} ток (из них размышление ${rec.reasoningTokens ?? '?'})` +
  (truncated ? '  ⚠ ОБРЕЗАН по лимиту — код неполный' : ''),
);
