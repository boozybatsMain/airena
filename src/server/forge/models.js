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
 * КТО ВООБЩЕ ДОПУСКАЕТСЯ В КАТАЛОГ — решение основателя 30.08.
 *
 * Дословно: «клод модели юзай через подписку, а через опэнроутер гемини, глм
 * флэш». То есть OpenRouter обслуживает две семьи, а Claude в продуктовом пути
 * не участвует вовсе — он приходит подпиской, за периметром этого файла.
 *
 * Замер, который за этим стоит (цена одного существа, живой прайс 30.08):
 *
 *     z-ai/glm-5.3-flash        $0.010 — $0.020
 *     google/gemini-3.7-flash   $0.069 — $0.152
 *     anthropic/claude-sonnet-5 $0.404 — $0.869
 *     anthropic/claude-opus-5   $1.010 — $2.258
 *
 * И это цена УДАЧНОЙ генерации. В ревью одно тело на `claude-opus-5-fast`
 * стоило $5.35 за три попытки и не вернуло ничего: все пять отказов на
 * платных связках были обрывами длинного ответа. При этом обе разрешённые
 * семьи дали 100% успеха на живом замере.
 *
 * Список — БЕЛЫЙ, а не чёрный, и это осознанно: OpenRouter добавляет модели
 * сам, и чёрный список пропустил бы каждую новую дорогую по умолчанию.
 * Добавить семью — одна строка и решение основателя.
 */
export const ALLOWED = [
  /^google\/gemini-3\.7-flash$/, /^z-ai\/glm-5\.3-flash$/,
  /* 07.09, the founder's words: «add models as free for now to game from
     openRouter: glm, glm flash, kimi, opus, fable 5.1, astra». Six more
     authors, each the current flagship of its family on the live price list
     (`curl https://openrouter.ai/api/v1/models`): GLM 5.3, Kimi K3, Claude
     Opus 5, Claude Fable 5.1, GPT-6 Astra. They are FREE FOR NOW — see
     `FREE_FOR_NOW` below — which means the founder's OpenRouter key pays for
     every creature made on them (a Fable 5.1 creature is ≈ $1.4, Opus 5 and
     Astra ≈ $0.7–1.4, Kimi K3 ≈ $0.4, GLM 5.3 ≈ $0.13 at the 07.09 prices),
     so the key needs credit (D192) or the forge answers 402. */
  /^z-ai\/glm-5\.3$/, /^moonshotai\/kimi-k3$/, /^anthropic\/claude-opus-5$/,
  /^anthropic\/claude-fable-5\.1$/, /^openai\/gpt-6-astra$/,
];

/**
 * Minds the founder opened for free while payments are shut (07.09). A bundle
 * on one of these authors is tier `free` whatever its price — the price still
 * travels in `creatureUsd` so the founder's own dashboard can read what a
 * creature cost. Take an author out of this set and it becomes `paid` again
 * on the next catalogue build; nothing else changes.
 */
export const FREE_FOR_NOW = new Set([
  'z-ai/glm-5.3', 'z-ai/glm-5.3-flash', 'moonshotai/kimi-k3',
  'anthropic/claude-opus-5', 'anthropic/claude-fable-5.1', 'openai/gpt-6-astra',
]);

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
  /*
   * `secs` — ЗАМЕР СЕРВЕРНОГО ПУТИ ТЕЛА 31.08, одно описание «Грозный армян».
   * Не скорость ответа в чате: тело — это программа на three.js, и в неё
   * уходят десятки тысяч токенов. Число нужно, чтобы умолчание выбиралось по
   * времени, а не по цене (D157), и чтобы игрок видел ожидание до нажатия.
   *
   *   google/gemini-3.7-flash:plain   206 с, две попытки, $0.1236
   *   z-ai/glm-5.3-flash:think        436 с, одна попытка, $0.0064
   *
   * Целиком существо (разбор + мозг + тело + проверка + карточка) на Gemini
   * вышло за 94 с — то есть подпись «~3 мин» обещает с запасом, и это
   * правильная сторона ошибки.
   */
  'google/gemini-3.7-flash:plain': { body: 0.051, brain: 0.018, secs: 206 },
  'z-ai/glm-5.3-flash:think': { body: 0.0064, brain: 0.007, secs: 436, estimated: true },
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
/* The labels are what the player reads on a mind card (docs/REDESIGN.md §6.3):
   two words only — `quick` and `deep`. The internal depth is told apart by the
   mode key, not by the label. */
export const THINK_MODES = {
  plain: { label: 'quick', budget: 0 },
  think: { label: 'deep', budget: 8000 },
  high: { label: 'deep', budget: 24000 },
};

/** Урезанный бюджет для повтора — правило 4: спас все три сломанные модели. */
export const RETRY_THINK_BUDGET = 2000;

import { subscriptionBundles } from './subscription.js';

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
    if (ALLOWED.some((re) => re.test(id))) {
      bundles.add(`${id}:plain`);
      bundles.add(`${id}:think`);
    }
  }

  for (const bundle of bundles) {
    const at = bundle.lastIndexOf(':');
    const modelId = bundle.slice(0, at); const mode = bundle.slice(at + 1);
    const price = live[modelId];
    if (!price) { rejected.push({ bundle, why: 'not listed by the provider' }); continue; }
    if (BANNED.some((re) => re.test(modelId))) { rejected.push({ bundle, why: 'excluded by the decision of 28.08' }); continue; }
    /* Белый список действует и на замеренные связки: `MEASURED` — это
       калибровка цен, а не разрешение на работу. */
    if (!ALLOWED.some((re) => re.test(modelId))) { rejected.push({ bundle, why: 'not on the allow list (decision of 30.08)' }); continue; }
    if (ROUTING_VARIANTS.test(modelId)) { rejected.push({ bundle, why: 'a routing variant, not an author of its own' }); continue; }
    const think = THINK_MODES[mode];
    if (!think) { rejected.push({ bundle, why: `unknown mode ${mode}` }); continue; }

    const ceiling = tokenCeiling(price, budgetUsd);
    if (ceiling === null) { rejected.push({ bundle, why: `an allowance of ${budgetUsd} USD does not cover ${MIN_CODE_TOKENS} tokens of code` }); continue; }
    if (think.budget && ceiling < think.budget + MIN_CODE_TOKENS) {
      rejected.push({ bundle, why: `a ceiling of ${ceiling} is below thinking ${think.budget} plus code ${MIN_CODE_TOKENS}` });
      continue;
    }
    const brak = brakRates[bundle];
    if (brak != null && brak > BRAK_MAX) { rejected.push({ bundle, why: `a failure rate of ${Math.round(brak * 100)}% is above the ${BRAK_MAX * 100}% threshold` }); continue; }

    const m = MEASURED[bundle];
    const creatureUsd = m ? m.body + m.brain : estimateCreatureUsd(price, think.budget);
    /*
     * ВРЕМЯ — ОТДЕЛЬНАЯ ВЕЛИЧИНА, И ОНО ВАЖНЕЕ ЦЕНЫ НА ПЕРВОМ СУЩЕСТВЕ.
     *
     * Каталог сортируется по цене, клиент брал первый доступный — и умолчанием
     * оказывалась самая дешёвая связка, она же самая долгая. Игрок нажимал
     * «Создать» и уходил ждать десять минут, ни разу не выбрав это сам.
     *
     * Цена и время не связаны: дешевле — обычно медленнее, потому что дешёвые
     * связки берут размышлением и переделками. Значит время надо возить рядом
     * с ценой, а не выводить из неё.
     */
    const secs = m && m.secs != null ? m.secs : null;
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
      secs,
      measured: Boolean(m) && !m.estimated,
      tier: creatureUsd <= freeThreshold || FREE_FOR_NOW.has(modelId) ? 'free' : 'paid',
      freeForNow: FREE_FOR_NOW.has(modelId) && creatureUsd > freeThreshold,
      brak: brak ?? null,
    });
  }

  /*
   * ── СВЯЗКИ ПОДПИСКИ ДОБАВЛЯЮТСЯ ПОСЛЕ, А НЕ ВНУТРИ ЦИКЛА (D164) ─────────
   *
   * Весь цикл выше строится ОТ ЖИВОГО ПРАЙСА OpenRouter: цена за токен,
   * потолок из бюджета, тир по порогу. У подписки нет ни одного из этих
   * чисел — она оплачена помесячно, — и провести её через тот же цикл значило
   * бы выдумать ей цену за токен, чтобы получить потолок, который CLI всё
   * равно не принимает.
   *
   * Поэтому они приходят готовым списком и своим тиром `sub`. Список пуст,
   * пока на машине не выставлен `AIRENA_SUB_MODELS=1`: `claude` — локальный
   * бинарник с локальной сессией OAuth, и на чужом сервере его нет.
   */
  const subs = subscriptionBundles();
  out.sort((a, b) => a.creatureUsd - b.creatureUsd);
  return { bundles: [...out, ...subs], rejected, freeThreshold, budgetUsd };
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
/*
 * ── ОТКАТ НЕ ПЕРЕСЕКАЕТ ГРАНИЦУ КАНАЛА (D174, D172) ────────────────────────
 *
 * Здесь стоял один общий список, и он тёк в обе стороны — обе дорого.
 *
 * ВНИЗ. Сорвавшийся `sub:` откатывался на «самую дорогую замеренную
 * бесплатную» связку, то есть на `google/gemini-3.7-flash:plain`. «Бесплатная»
 * здесь — ярлык тира, а не ноль: $0.069 за существо с ключа OpenRouter.
 * Канал, заведённый ровно для того, чтобы не тратить с ключа, доплачивал с
 * ключа каждый раз, когда спотыкался, и молча.
 *
 * ВВЕРХ, и это хуже. Второй ветки — `catalog.bundles.find(b => b.bundle !==
 * failedBundle)` — не касался ни один фильтр. Сорвавшийся Gemini ПУБЛИЧНОГО
 * игрока мог откатиться на `sub:` и уехать считаться на подписку коллеги. Это
 * ровно «intermediate usage on end users' behalf» — запрещённая схема,
 * собранная автоматически, из запасного пути, который никто не читал.
 *
 * Поэтому откат теперь ищет замену ВНУТРИ того же канала и возвращает `null`,
 * если её нет. Честный отказ здесь дешевле удачной подмены: подмена стоит либо
 * денег, либо нарушения.
 */
const isSub = (b) => String(b?.bundle || '').startsWith('sub:');

export function fallbackBundle(catalog, failedBundle) {
  const sameChannel = catalog.bundles.filter(
    (b) => b.bundle !== failedBundle && isSub(b) === failedBundle.startsWith('sub:'),
  );
  /* Среди бесплатных замеренных берётся САМАЯ ДОРОГАЯ — то есть самая
     способная из тех, что ничего не стоят. Сортировка убывающая намеренно;
     прежнее имя `cheapMeasured` описывало обратное и врало. */
  const bestMeasured = sameChannel
    .filter((b) => b.tier === 'free' && b.measured)
    .sort((a, b) => b.creatureUsd - a.creatureUsd)[0];
  return bestMeasured || sameChannel[0] || null;
}
