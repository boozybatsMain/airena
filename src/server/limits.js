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

export const DENY = {
  budget_day: 'дневной бюджет генерации исчерпан',
  concurrent: 'слишком много генераций идёт прямо сейчас',
  account_day: 'на сегодня лимит генераций исчерпан',
  account_month: 'на этот месяц лимит генераций исчерпан',
  request_cost: 'эта модель не помещается в предохранитель по стоимости запроса',
  guest: 'гость не может создавать существо',
  free_used: 'бесплатное существо уже создано на этом аккаунте',
  internal: 'проверка лимитов не отработала',
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

export function accountJobs(db, accountId, now = Date.now()) {
  const d = db.prepare(`SELECT count(*) AS n FROM job WHERE account_id = ?
    AND state != 'failed' AND created_at >= ?`).get(accountId, dayStart(now)).n;
  const m = db.prepare(`SELECT count(*) AS n FROM job WHERE account_id = ?
    AND state != 'failed' AND created_at >= ?`).get(accountId, monthStart(now)).n;
  return { day: d, month: m };
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
    if (!account) return deny('guest');
    if (account.is_guest) return deny('guest');
    if (kind === 'create' && account.free_creature_used) {
      /* F7: одно бесплатное существо на аккаунт, пожизненно. Второе — это
         покупка, а покупок в v1 нет (E6), поэтому здесь честный отказ, а не
         кнопка «купить», которой не существует. */
      return deny('free_used');
    }

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
