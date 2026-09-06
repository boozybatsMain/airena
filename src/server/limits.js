/**
 * Шесть лимитов E3. Все серверные, все fail-CLOSED.
 *
 * N12 запрещает открывать кнопку генерации без всех шести. Это не «шесть
 * настроек» — это шесть отдельных отказов, и у каждого свой код, чтобы экран
 * мог сказать игроку правду, а не «что-то пошло не так».
 *
 * FAIL-CLOSED — здесь буквально. Предохранитель GENEX открывается при отказе
 * ($500/день, `credits/defaults.ts:172`); наш обязан закрываться (SPEC §16).
 * Поэтому любая ошибка внутри проверки — это отказ в генерации, а не проход:
 * `check()` обёрнут в try/catch, и catch возвращает deny.
 *
 *   1. глобальный дневной бюджет в USD
 *   2. максимум одновременных генераций
 *   3. счётчики генераций на аккаунт в день и в месяц
 *   4. лимит попыток = 2
 *   5. предохранитель по стоимости одного запроса
 *   6. синтетический нагрузочный тест: 10 000 приходов за час не превышают
 *      дневной бюджет  →  tools/loadtest.mjs, релизный гейт
 */

import { REQUEST_BUDGET_USD } from './forge/models.js';

export const LIMITS = {
  /** 1. Дневной бюджет всей игры. */
  dailyBudgetUsd: Number(process.env.AIRENA_DAILY_USD || 25),
  /** 2. Сколько генераций может идти одновременно. */
  maxConcurrent: Number(process.env.AIRENA_MAX_CONCURRENT || 4),
  /** 3. На аккаунт: в день и в месяц. */
  perAccountPerDay: Number(process.env.AIRENA_ACCT_DAY || 3),
  perAccountPerMonth: Number(process.env.AIRENA_ACCT_MONTH || 20),
  /** 4. Попыток на одну генерацию. */
  maxAttempts: 2,
  /** 5. Предохранитель по стоимости одного запроса. */
  requestBudgetUsd: REQUEST_BUDGET_USD,
};

/*
 * ONE VOICE FOR ONE REFUSAL.
 *
 * These eight strings are player copy: they travel out of `/api/creature` and
 * `/api/session` and land inside the CREATE card. The screen keeps its own
 * map (`DENY_TEXT` in `src/client/screens/create.js`) for the codes it can
 * name from the code alone, and falls back to THIS string for anything the
 * map does not hold. While these were lower-case sentence fragments — «you
 * have used your creations for today» — that fallback printed a fragment in
 * the middle of a card written in capitalised sentences, and the same refusal
 * had two voices depending on which path it took.
 *
 * So the wording here IS the wording there, character for character. Change
 * one and change the other.
 *
 * TWO RULES THE EIGHT ARE HELD TO, both learned by breaking them.
 *
 * 1. THE PLAYER'S NOUNS ONLY. A refusal is the worst possible place to teach
 *    vocabulary, and it is the likeliest place to leak ours: `request_cost`
 *    said a mind was "too heavy for one request", and a request is a thing
 *    this product never shows anybody. The unit it does count, everywhere from
 *    the create card to the birth footnote, is the **generation** (§9.1).
 *
 * 2. A REFUSAL SAYS WHAT HAPPENS NEXT. `budget_day`, `account_day` and
 *    `concurrent` name a time; `request_cost` names an action. `guest` and
 *    `free_used` used to name only themselves — "This account cannot create a
 *    creature." is a closed door with no handle drawn on it, in a product
 *    whose entire proposition is on the other side. Every line below now ends
 *    on a door: a clock, a choice, or a sign-in.
 */
export const DENY = {
  budget_day: 'No more creatures today — the arena has spent its daily allowance. It opens again at 00:00 UTC.',
  concurrent: 'Too many creatures are being made right now. Try again in a minute.',
  account_day: 'Today’s generations are used up. The next one opens at 00:00 UTC.',
  account_month: 'This month’s generations are used up.',
  request_cost: 'This mind is too heavy for one generation. Choose another one.',
  guest: 'You are watching as a guest. Sign in to create a creature.',
  free_used: 'This account has used its free creature. More open when payments do.',
  internal: 'The safety check did not answer. We do not start a generation we are not sure we can finish.',
};

export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const monthKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 7);

/** Сколько уже потрачено сегодня — по ВСЕМ попыткам, включая отклонённые. */
export function spentToday(db, now = Date.now()) {
  const r = db.prepare('SELECT COALESCE(sum(usd), 0) AS s FROM spend WHERE day = ?').get(dayKey(now));
  return r.s;
}

export function runningJobs(db) {
  return db.prepare(`SELECT count(*) AS n FROM job WHERE state IN ('queued','running')`).get().n;
}

/** Коды, за которые отвечаем мы, а не игрок и не модель. */
/*
 * Коды, за которые отвечаем МЫ, а не игрок: попытка с таким кодом не
 * списывается с его суточного лимита.
 *
 * `no_key`, `network`, `wall` добавлены после замера: конвейер превращал их в
 * `brain_failed`, и сервер без ключа съедал игроку три попытки из трёх, ни
 * разу не сходив к модели. Причина теперь доезжает сюда неискажённой (см.
 * `ourFault` в forge/pipeline.js).
 */
export const OUR_FAULT = ['server_restarted', 'internal', 'no_catalog', 'no_creature',
  'no_key', 'network', 'wall',
  /*
   * `http` и `rate` — ТОЖЕ МЫ, и это выяснилось дорого.
   *
   * Конвейер давно относит их к своим (`OUR_CODES` в forge/pipeline.js), а
   * этот список — нет, и два списка в двух файлах называли один и тот же код
   * противоположно. Ровно про такое расхождение предупреждает комментарий над
   * `OUR_CODES`; оно всё равно случилось, потому что предупреждение — не гейт.
   *
   * Цена расхождения замерена 01.09: на ключе OpenRouter кончились деньги, и
   * провайдер стал отвечать `402 … you can only afford 453 tokens`. Это
   * приезжает как `http`, то есть «модель ответила, ответ не годится», —
   * значит попытка списывалась с трёх суточных, хотя модель не прочла ни
   * одного токена промпта. Восемь заселений подряд легли именно так.
   *
   * Кончившийся счёт, лимит провайдера и его пятисотка — это состояние НАШЕЙ
   * инфраструктуры. Игрок не может ни повлиять на них, ни узнать о них: он
   * видит «не получилось, попробуй ещё» и теряет попытку за нашу поломку.
   */
  'http', 'rate'];
const OUR_FAULT_SQL = `(${OUR_FAULT.map((c) => `'${c}'`).join(', ')})`;

export function accountJobs(db, accountId, now = Date.now()) {
  /*
   * ПОПЫТКА СЧИТАЕТСЯ, ЕСЛИ ОНА СТОИЛА ДЕНЕГ.
   *
   * Раньше условие было `state != 'failed'`, и это смешивало два разных счёта.
   * E5 говорит «игрок не платит за отклонённую генерацию» — это про его
   * право на бесплатное существо. Предохранитель E3.3 говорит другое: сколько
   * раз в сутки один аккаунт может ЗАПУСТИТЬ модель. Провайдер берёт деньги за
   * попытку, а не за успех, и неудача расходует наш бюджет ровно так же.
   *
   * Замерено: при `perAccountPerDay = 3` двенадцать последовательных запросов
   * с одного аккаунта прошли все двенадцать — каждый упал, каждый стал
   * невидимым для счётчика, и предохранителя фактически не было.
   *
   * Условие идёт за ФАКТОМ ОБРАЩЕНИЯ К МОДЕЛИ, а не за суммой. Первая правка
   * привязала его к «списано больше нуля», и это предохранитель, который
   * ломается наружу: провал, стоивший по прайсу ноль (или не посчитанный,
   * или списанный провайдером позже), становится невидимым, и лимит в три
   * генерации в сутки перестаёт существовать для того, у кого они падают.
   * Деньги — плохой признак попытки: их считает третья сторона.
   *
   * `attempts` растёт ровно тогда, когда пайплайн отработал, то есть когда
   * запрос к модели был. Задание, упавшее ДО обращения (нет каталога, отказ
   * лимита), остаётся с нулём и не считается — это наша поломка, а не попытка
   * игрока, и E5 запрещает брать за неё.
   */
  /*
   * НАШИ ПОЛОМКИ НЕ СЧИТАЮТСЯ, даже если дошли до модели.
   *
   * `attempts > 0` — правильный признак «запрос к модели был», и на нём стоит
   * счёт. Но часть провалов происходит по нашей вине: сервер перезапустился,
   * каталог не поднялся, внутренняя ошибка. Считать их попытками игрока значит
   * запирать аккаунт за нашу неисправность — трёх наших падений хватает, чтобы
   * новый аккаунт остался без генераций на сутки.
   *
   * Провал МОДЕЛИ (`brain_failed`, `body_failed`, `rejected`) — попытка: она
   * стоила денег и была ответом на то, что попросил игрок.
   */
  const q = (from) => db.prepare(`SELECT count(*) AS n FROM job j
    WHERE j.account_id = ? AND j.created_at >= ?
      AND (j.state != 'failed'
        OR (j.attempts > 0 AND (j.error_code IS NULL OR j.error_code NOT IN ${OUR_FAULT_SQL})))`)
    .get(accountId, from).n;
  return { day: q(dayStart(now)), month: q(monthStart(now)) };
}

const dayStart = (t) => Date.parse(`${dayKey(t)}T00:00:00.000Z`);
const monthStart = (t) => Date.parse(`${monthKey(t)}-01T00:00:00.000Z`);

/**
 * Можно ли начать генерацию.
 *
 * @returns {{ok: true, headroomUsd: number} | {ok: false, code: string, message: string, retryAt?: number}}
 */
export function check(db, { account, bundle, kind = 'create', limits = LIMITS, now = Date.now() }) {
  try {
    /*
     * ГОСТЬ СОЗДАЁТ НАРАВНЕ С АККАУНТОМ — РЕШЕНИЕ ОСНОВАТЕЛЯ (05.09).
     *
     * Здесь стояли два отказа: `guest` и `free_used`. Первый требовал завести
     * аккаунт до генерации, второй давал одно существо на аккаунт пожизненно
     * (F7). Оба сняты по прямому требованию: игрок пишет промпт, жмёт
     * «создать» и получает генерацию, без стены и без второго экрана.
     *
     * ЧТО ОСТАЛОСЬ СТОРОЖИТЬ ДЕНЬГИ, и это не формальность: единственным
     * барьером теперь работают четыре лимита ниже — дневной бюджет всей игры,
     * одновременность, счётчики на аккаунт в день и в месяц. Гостевая запись
     * — тоже строка в `account`, так что счётчики к ней применяются; но новая
     * такая строка заводится очисткой хранилища браузера, поэтому НАСТОЯЩИЙ
     * потолок здесь один — дневной бюджет. Он и есть то, что нельзя трогать.
     */
    if (!account) return deny('guest');

    const spent = spentToday(db, now);
    const worst = bundle ? bundle.creatureUsd * limits.maxAttempts : limits.requestBudgetUsd;
    if (spent + worst > limits.dailyBudgetUsd) {
      return { ...deny('budget_day'), retryAt: dayStart(now) + 864e5, spentUsd: round2(spent) };
    }

    if (runningJobs(db) >= limits.maxConcurrent) return deny('concurrent');

    const a = accountJobs(db, account.id, now);
    if (a.day >= limits.perAccountPerDay) return { ...deny('account_day'), retryAt: dayStart(now) + 864e5 };
    if (a.month >= limits.perAccountPerMonth) return { ...deny('account_month'), retryAt: monthStart(now) + 32 * 864e5 };

    if (bundle && bundle.creatureUsd > limits.requestBudgetUsd) return deny('request_cost');

    return { ok: true, headroomUsd: round2(limits.dailyBudgetUsd - spent) };
  } catch (e) {
    /* Fail-closed: проверка, которая упала, — это отказ. Молчаливый проход
       здесь стоит ровно столько, сколько успеет списать очередь. */
    return { ok: false, code: 'internal', message: DENY.internal, detail: e.message };
  }
}

const deny = (code) => ({ ok: false, code, message: DENY[code] });
const round2 = (x) => Math.round(x * 100) / 100;

/** Записать трату. E5: списывается только за ПРИНЯТУЮ генерацию — но в
 *  дневной бюджет попадает всё, что провайдер выставил, включая отклонённое.
 *  Это два разных счётчика, и путать их значит либо разорить нас, либо
 *  наказать игрока за наш брак. */
export function recordSpend(db, { accountId, jobId, usd, accepted, now = Date.now() }) {
  db.prepare(`INSERT INTO spend (account_id, job_id, day, month, usd, accepted, at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(accountId ?? null, jobId ?? null, dayKey(now), monthKey(now), usd, accepted ? 1 : 0, now);
}

/** Состояние предохранителей — для админского экрана и для нагрузочного теста. */
/**
 * То, что можно показать КОМУ УГОДНО.
 *
 * `status()` ниже — операторская сводка: дневной бюджет, потрачено, остаток,
 * потолок на запрос. Она уезжала в `/api/session` и `/api/limits`, то есть
 * любой анонимный запрос читал нашу бухгалтерию: сколько мы тратим в сутки,
 * сколько уже потратили и сколько осталось. Это не только чужое дело — это
 * ещё и подсказка тому, кто хочет выжечь бюджет: видно, сколько осталось.
 *
 * Экрану из всего этого нужен ОДИН флаг: можно ли сейчас генерировать. Он и
 * едет, вместе с причиной и временем, когда откроется снова — без сумм.
 */
export function publicStatus(db, { limits = LIMITS, now = Date.now() } = {}) {
  const spent = spentToday(db, now);
  const open = spent < limits.dailyBudgetUsd;
  return {
    open,
    /* Почему закрыто — кодом, чтобы экран показал свой текст, а не наш. */
    reason: open ? null : 'budget_day',
    /* Когда откроется: сутки считаются по UTC, как и весь бюджет. */
    resetsAt: open ? null : dayStart(now) + 864e5,
    /* Лимиты аккаунта — это правила игры, а не наши расходы: их знать можно. */
    perAccountPerDay: limits.perAccountPerDay,
    perAccountPerMonth: limits.perAccountPerMonth,
  };
}

/** Операторская сводка. НАРУЖУ НЕ ОТДАЁТСЯ — см. `publicStatus`. */
export function status(db, { limits = LIMITS, now = Date.now() } = {}) {
  const spent = spentToday(db, now);
  return {
    day: dayKey(now),
    spentUsd: round2(spent),
    dailyBudgetUsd: limits.dailyBudgetUsd,
    headroomUsd: round2(limits.dailyBudgetUsd - spent),
    running: runningJobs(db),
    maxConcurrent: limits.maxConcurrent,
    maxAttempts: limits.maxAttempts,
    requestBudgetUsd: limits.requestBudgetUsd,
    perAccountPerDay: limits.perAccountPerDay,
    perAccountPerMonth: limits.perAccountPerMonth,
    open: spent < limits.dailyBudgetUsd,
  };
}
