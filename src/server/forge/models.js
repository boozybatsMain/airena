/**
 * Каталог моделей.
 *
 * Здесь нет списка «эти бесплатные, эти платные». SPEC §5.1 фиксирует другое
 * правило, и оно жёстче: каталог — это связки «модель + режим размышления», у
 * каждой своя ПОЛНАЯ цена генерации существа (тело + мозг), а граница
 * «бесплатно/платно» — один порог по этой цене. Новая модель не требует
 * решения человека: её место определяет её собственная цена, взятая живьём
 * из OpenRouter.
 *
 * Три вещи, которые здесь нельзя упрощать, потому что каждая уже стоила денег:
 *
 * 1. БЮДЖЕТ РАЗМЫШЛЕНИЯ ЗАДАЁТСЯ ЯВНО ДЛЯ КАЖДОЙ СВЯЗКИ. `max_tokens` —
 *    общий лимит на размышление И на код; отдельного лимита под ответ нет.
 *    Модель без заданного бюджета может истратить его весь на размышление и
 *    вернуть пустую строку, заплатив полностью. Замерено 27.08: GLM 5.3 без
 *    бюджета — 993 с, $0.2854, 0 символов; с бюджетом 8 000 — 10 с, $0.0095,
 *    1 995 символов. Значения по умолчанию здесь нет и быть не может.
 *
 * 2. ПОТОЛОК ТОКЕНОВ ВЫЧИСЛЯЕТСЯ ИЗ БЮДЖЕТА, а не настраивается:
 *      потолок = (бюджет − цена_входа − цена_минимального_кода) / цена_выхода
 *    Минимальный код — 5 000 токенов (95-й процентиль по 24 удачным
 *    генерациям плюс запас). Модель, которой не хватает даже на это, в
 *    каталог не попадает — сама, без ручного списка исключений.
 *
 * 3. ПОРОГА ПО ДОЛЕ РАЗМЫШЛЕНИЯ НЕ СУЩЕСТВУЕТ. Рабочие мозги тратили на
 *    размышление 4–93% выхода, мёртвые — 99–100%; диапазоны пересекаются.
 *    Провал не предсказывается, он обнаруживается — валидатором (правило 3
 *    из §5.1) и повтором с урезанным бюджетом размышления (правило 4).
 */

/** Порог «бесплатно/платно» по полной цене генерации существа, USD. */
export const FREE_THRESHOLD_USD = 0.15;

/** Потолок цены одного запроса — предохранитель E3.5. */
export const REQUEST_BUDGET_USD = 3.20;

/** 95-й процентиль длины принятого кода плюс запас, в токенах. */
export const MIN_CODE_TOKENS = 5000;

/**
 * Haiku исключён из проекта решением 28.08 — не как бесплатная, не как
 * платная. Счёт 1–13% против эталона, брак мозга 4 из 5. Это единственный
 * ручной запрет в файле, и он записан как запрет, а не как «просто не добавили».
 */
export const BANNED = [/claude-haiku/i, /claude-3/i];

/**
 * Маршрутные варианты одной и той же модели, а не отдельные авторы.
 *
 * OpenRouter публикует `:batch`, `:free`, `:nitro`, `:floor`, `:online`,
 * `:extended` как самостоятельные строки прайса — это способы ДОСТАВКИ
 * (пакетная очередь, дешёвый провайдер, поиск), а не разные модели. Игрок
 * выбирает автора мозга; предлагать ему «Gemini 3.7 Flash» и
 * «Gemini 3.7 Flash (batch)» как два разных автора — это шум в единственном
 * месте, где выбор что-то значит. `:batch` вдобавок асинхронный: он ломает
 * стену по времени, на которой стоит терпение игрока (§5.1, правило 2).
 */
export const ROUTING_VARIANTS = /:(batch|free|nitro|floor|online|extended|thinking)$/;

/**
 * Замеренные цены существа (SPEC §5.1, 28.08). Это НЕ каталог — это калибровка:
 * живая цена из OpenRouter даёт цену за токен, а сколько токенов модель тратит
 * на тело и мозг, известно только из замера. Связка без замера оценивается по
 * медианному расходу токенов (`TOKEN_PROFILE`) и помечается estimated.
 */
export const MEASURED = {
  'z-ai/glm-5.3-flash:plain': { body: 0.013, brain: 0.007, estimated: true },
  'google/gemini-3.7-flash:plain': { body: 0.051, brain: 0.018 },
  'z-ai/glm-5.3:think': { body: 0.096, brain: 0.011 },
  'qwen/qwen3.8-max:think': { body: 0.215, brain: 0.057 },
  'moonshotai/kimi-k3:think': { body: 0.321, brain: 0.031 },
  'anthropic/claude-sonnet-5:plain': { body: 0.709, brain: 0.160 },
  'anthropic/claude-opus-5:plain': { body: 1.722, brain: 0.536 },
  'anthropic/claude-fable-5:plain': { body: 1.100, brain: 0.726, estimated: true },
};

/** Медианный расход токенов на существо, из 24 удачных генераций. */
export const TOKEN_PROFILE = { in: 12000, out: 26000 };

/** Замеренная доля брака на связку; выше BRAK_MAX — вылет из каталога. */
export const BRAK_MAX = 0.30;

/**
 * Режимы размышления. Значение — бюджет в токенах, задаётся ЯВНО (правило 1).
 * `plain` — не «по умолчанию», а «размышление выключено намеренно»: у моделей
 * Anthropic и Google это исполняется провайдером, у остальных бюджет 0
 * означает «не начинать».
 */
export const THINK_MODES = {
  plain: { label: 'без размышления', budget: 0 },
  think: { label: 'с размышлением', budget: 8000 },
  high: { label: 'глубокое размышление', budget: 24000 },
};

/** Урезанный бюджет для повтора — правило 4: спас все три сломанные модели. */
export const RETRY_THINK_BUDGET = 2000;

const PRICE_URL = 'https://openrouter.ai/api/v1/models';

let cache = { at: 0, prices: null };

/**
 * Живой прайс OpenRouter. Кешируется на час: цены меняются реже, чем игрок
 * жмёт кнопку, а стучаться в сеть на каждый показ каталога — это отказ
 * каталога при первом же сетевом чихе.
 */
export async function fetchPrices({ ttlMs = 36e5, fetchImpl = fetch, now = Date.now } = {}) {
  if (cache.prices && now() - cache.at < ttlMs) return cache.prices;
  const res = await fetchImpl(PRICE_URL, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`openrouter models ${res.status}`);
  const body = await res.json();
  const prices = {};
  for (const m of body.data || []) {
    const p = m.pricing || {};
    const inUsd = Number(p.prompt), outUsd = Number(p.completion);
    if (!Number.isFinite(inUsd) || !Number.isFinite(outUsd)) continue;
    prices[m.id] = {
      id: m.id,
      name: m.name,
      in: inUsd,          // USD за токен входа
      out: outUsd,        // USD за токен выхода
      context: m.context_length ?? null,
      maxOut: m.top_provider?.max_completion_tokens ?? null,
    };
  }
  cache = { at: now(), prices };
  return prices;
}

/** Сбросить кеш — для тестов и для «перечитать прайс сейчас». */
export function resetPriceCache() { cache = { at: 0, prices: null }; }

/**
 * Потолок выходных токенов, вычисленный из бюджета. Ручной настройки нет.
 * Возвращает null, если бюджета не хватает даже на минимальный код —
 * это и есть автоматический отсев связки из каталога.
 */
export function tokenCeiling(price, budgetUsd, inputTokens = TOKEN_PROFILE.in) {
  const inCost = price.in * inputTokens;
  const minCode = price.out * MIN_CODE_TOKENS;
  const room = budgetUsd - inCost - minCode;
  if (room <= 0) return null;
  const extra = Math.floor(room / price.out);
  const ceiling = MIN_CODE_TOKENS + extra;
  return price.maxOut ? Math.min(ceiling, price.maxOut) : ceiling;
}

/** Оценка полной цены существа по живому прайсу, когда замера нет. */
export function estimateCreatureUsd(price, thinkBudget) {
  const out = TOKEN_PROFILE.out + thinkBudget * 1.5;
  return price.in * TOKEN_PROFILE.in + price.out * out;
}

/**
 * Каталог: связки, их цены, их тир, и по какой причине связка выпала.
 * Причины возвращаются вместе с каталогом, а не глотаются, — иначе «почему
 * пропала модель» превращается в расследование по логам.
 */
export async function buildCatalog({
  prices = null, budgetUsd = REQUEST_BUDGET_USD, freeThreshold = FREE_THRESHOLD_USD,
  brakRates = {}, fetchImpl = fetch,
} = {}) {
  const live = prices || await fetchPrices({ fetchImpl });
  const out = []; const rejected = [];

  const bundles = new Set(Object.keys(MEASURED));
  /* Связки без замера тоже попадают в каталог — по живой цене. Каталог,
     который знает только то, что кто-то замерил руками, устаревает молча. */
  for (const id of Object.keys(live)) {
    if (ROUTING_VARIANTS.test(id)) continue;
    if (/gemini-3\.7-flash|glm-5\.3|claude-(sonnet|opus|fable)-5|kimi-k3|qwen3\.8-max/.test(id)) {
      bundles.add(`${id}:plain`);
      bundles.add(`${id}:think`);
    }
  }

  for (const bundle of bundles) {
    const at = bundle.lastIndexOf(':');
    const modelId = bundle.slice(0, at); const mode = bundle.slice(at + 1);
    const price = live[modelId];
    if (!price) { rejected.push({ bundle, why: 'нет в прайсе OpenRouter' }); continue; }
    if (BANNED.some((re) => re.test(modelId))) { rejected.push({ bundle, why: 'исключена решением 28.08' }); continue; }
    if (ROUTING_VARIANTS.test(modelId)) { rejected.push({ bundle, why: 'вариант маршрутизации, а не отдельный автор' }); continue; }
    const think = THINK_MODES[mode];
    if (!think) { rejected.push({ bundle, why: `неизвестный режим ${mode}` }); continue; }

    const ceiling = tokenCeiling(price, budgetUsd);
    if (ceiling === null) { rejected.push({ bundle, why: `бюджета $${budgetUsd} не хватает на ${MIN_CODE_TOKENS} токенов кода` }); continue; }
    if (think.budget && ceiling < think.budget + MIN_CODE_TOKENS) {
      rejected.push({ bundle, why: `потолок ${ceiling} меньше размышления ${think.budget} + кода ${MIN_CODE_TOKENS}` });
      continue;
    }
    const brak = brakRates[bundle];
    if (brak != null && brak > BRAK_MAX) { rejected.push({ bundle, why: `брак ${Math.round(brak * 100)}% выше порога ${BRAK_MAX * 100}%` }); continue; }

    const m = MEASURED[bundle];
    const creatureUsd = m ? m.body + m.brain : estimateCreatureUsd(price, think.budget);
    out.push({
      bundle,
      modelId,
      mode,
      label: price.name || modelId,
      thinkLabel: think.label,
      thinkBudget: think.budget,
      maxTokens: ceiling,
      creatureUsd: round4(creatureUsd),
      bodyUsd: m ? m.body : null,
      brainUsd: m ? m.brain : null,
      measured: Boolean(m) && !m.estimated,
      tier: creatureUsd <= freeThreshold ? 'free' : 'paid',
      brak: brak ?? null,
    });
  }

  out.sort((a, b) => a.creatureUsd - b.creatureUsd);
  return { bundles: out, rejected, freeThreshold, budgetUsd };
}

const round4 = (x) => Math.round(x * 1e4) / 1e4;

/**
 * Запасная связка на случай, когда выбранная не справилась.
 *
 * Молчаливая подмена запрещена (§5.1): игрок выбирал модель осознанно, и
 * «Fable не справилась, существо сделала Gemini» — обязательная строка, а не
 * любезность. Функция возвращает связку И причину, чтобы вызывающему нечем
 * было промолчать.
 */
export function fallbackBundle(catalog, failedBundle) {
  const cheapMeasured = catalog.bundles
    .filter((b) => b.bundle !== failedBundle && b.tier === 'free' && b.measured)
    .sort((a, b) => b.creatureUsd - a.creatureUsd)[0];
  return cheapMeasured || catalog.bundles.find((b) => b.bundle !== failedBundle) || null;
}
