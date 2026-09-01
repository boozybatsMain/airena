/**
 * Аналитика с именованными задокументированными событиями (A7).
 *
 * A7 требует, чтобы она вышла ДО запуска и чтобы ни одно утверждение об
 * удержании или конверсии не делалось без неё. Отсюда две вещи, которых
 * обычно не делают и о которых потом жалеют:
 *
 *  1. СЛОВАРЬ СОБЫТИЙ ЗАКРЫТ. Событие, которого нет в `EVENTS`, отклоняется.
 *     Открытый словарь через полгода превращается в 400 имён, из которых 380
 *     написаны с опечаткой, и метрика §14 становится неизмеримой.
 *  2. У КАЖДОГО СОБЫТИЯ ЗАПИСАНО, КАКУЮ МЕТРИКУ §14 ОНО КОРМИТ. Событие, не
 *     кормящее ни одной метрики, — это данные, которые никто не прочтёт.
 */

/**
 * Закрытый словарь. Ключ — имя события, значение — что оно кормит.
 *
 * `server: true` значит «это событие пишет СЕРВЕР по факту, и от клиента оно
 * не принимается». Словарь был закрыт по именам и открыт по источнику:
 * `create_done` — событие рождения существа, числитель конверсии §14 —
 * принималось от кого угодно, и пять curl-ов сдвигали «посетитель → создал
 * существо» с 0.0165 до 0.0280. A7 запрещает утверждения об удержании без
 * аналитики; аналитика, которую может писать посторонний, — это не аналитика,
 * а поле для ввода.
 */
export const EVENTS = {
  // воронка первой сессии
  visit: { feeds: 'Посетитель → создал существо', props: ['ref', 'guest'] },
  fight_watched: { feeds: 'Матчей на DAU', props: ['matchId', 'seconds', 'completed'] },
  /* Разбор боя ОТКРЫТ — не «показана панель итога». Событие кормит проверку
     F11 «доказательство авторства доходит до игрока», и на панели итога оно
     срабатывало всегда, то есть измеряло единицу. */
  tactics_opened: { feeds: 'Посетитель → создал существо', props: ['matchId'] },
  /* Панель итога показана. Отдельное событие, потому что это другой вопрос:
     сколько людей досмотрело бой до конца. */
  result_shown: { feeds: 'Матчей на DAU', props: ['matchId'] },
  create_opened: { feeds: 'Посетитель → создал существо', props: [] },
  create_submitted: { feeds: 'Посетитель → создал существо', props: ['bundle', 'archetype', 'promptChars'] },
  create_done: { feeds: 'Доля отклонённых генераций', props: ['jobId', 'ms', 'attempts', 'fallback'], server: true },
  create_failed: { feeds: 'Доля отклонённых генераций', props: ['jobId', 'code'], server: true },
  /* Отказ ТЕЛА, отдельно от отказа генерации: тело может не собраться, а
     существо всё равно родится (D117). `whose` отвечает на вопрос основателя
     «чья вина» — молчала модель или написала код мимо стен. */
  body_rejected: { feeds: 'Доля отклонённых генераций', props: ['code', 'whose', 'tries', 'model'], server: true },
  account_wall_shown: { feeds: 'Посетитель → создал существо', props: ['creatureId'] },
  account_claimed: { feeds: 'Посетитель → создал существо', props: ['moved'] },

  // цикл и удержание
  session_start: { feeds: 'D1 / D7 / D30', props: ['returning', 'awayMs'] },
  tab_view: { feeds: 'Матчей на DAU', props: ['tab'] },
  ladder_viewed: { feeds: 'Матчей на DAU', props: ['rank'] },
  creature_viewed: { feeds: 'Матчей на DAU', props: ['creatureId', 'mine'] },
  refactor_submitted: { feeds: 'Стоимость на MAU', props: ['creatureId', 'bundle'], server: true },
  refactor_done: { feeds: 'Стоимость на MAU', props: ['creatureId', 'better'], server: true },
  adaptation_shown: { feeds: 'D7', props: ['creatureId', 'kind'] },

  // предохранители — не продуктовые, но без них не видно, почему упала воронка
  limit_denied: { feeds: 'Стоимость на MAU', props: ['code'], server: true },
  error_shown: { feeds: '—', props: ['code', 'screen'] },
  /* Тело сломалось В БРАУЗЕРЕ, уже после того как приёмка его пропустила.
     Единственный честный замер «существо видно»: всё остальное меряется на
     сервере, где нет ни настоящего рендерера, ни настоящего железа. Каждое
     такое событие — дыра в приёмке, а не невезение игрока. */
  body_broken: { feeds: 'Доля отклонённых генераций', props: ['ref', 'side', 'message'] },
};

const MAX_PROP_BYTES = 512;

export function record(db, { name, accountId = null, props = {}, now = Date.now() }) {
  const def = EVENTS[name];
  if (!def) return { ok: false, why: `событие "${name}" не в словаре` };
  const clean = {};
  for (const k of def.props) if (props[k] !== undefined) clean[k] = props[k];
  let json = JSON.stringify(clean);
  if (json.length > MAX_PROP_BYTES) json = json.slice(0, MAX_PROP_BYTES);
  db.prepare('INSERT INTO event (at, account_id, name, props_json) VALUES (?,?,?,?)')
    .run(now, accountId, name, json);
  return { ok: true };
}

/** Метрики §14, посчитанные из событий. Пороги — цели, а не прогнозы. */
export const TARGETS = {
  visitorToCreature: 0.25,
  d1: 0.25, d7: 0.10, d30: 0.06,
  matchesPerDau: 10,
  costPerMauUsd: 0.30,
};

export function metrics(db, { now = Date.now(), windowDays = 7 } = {}) {
  const since = now - windowDays * 864e5;
  const one = (sql, ...a) => db.prepare(sql).get(...a);

  const visitors = one(`SELECT count(DISTINCT account_id) AS n FROM event WHERE name='visit' AND at>=?`, since).n;
  const creators = one(`SELECT count(DISTINCT account_id) AS n FROM event WHERE name='create_done' AND at>=?`, since).n;
  const dau = one(`SELECT count(DISTINCT account_id) AS n FROM event WHERE at>=?`, now - 864e5).n;
  const watched = one(`SELECT count(*) AS n FROM event WHERE name='fight_watched' AND at>=?`, now - 864e5).n;
  const gens = one(`SELECT count(*) AS n, sum(CASE WHEN state='failed' THEN 1 ELSE 0 END) AS f FROM job WHERE created_at>=?`, since);
  const spend = one(`SELECT COALESCE(sum(usd),0) AS s FROM spend WHERE at>=?`, now - 30 * 864e5).s;
  const mau = one(`SELECT count(DISTINCT account_id) AS n FROM event WHERE at>=?`, now - 30 * 864e5).n;

  return {
    windowDays,
    visitorToCreature: visitors ? creators / visitors : null,
    matchesPerDau: dau ? watched / dau : null,
    rejectedShare: gens.n ? (gens.f || 0) / gens.n : null,
    /* Стоимость на пользователя — наша экономика, а не игровая метрика.
       Отдаётся только операторам; §14 её измеряет, но не публикует. */
    ...(process.env.AIRENA_OPS === '1' ? { costPerMauUsd: mau ? spend / mau : null } : {}),
    /*
     * ДОЛИ — НАРУЖУ, АБСОЛЮТНЫЕ ЧИСЛА — ВНУТРЬ.
     *
     * Ручка отдавала любому dau, mau, число посетителей и число создавших
     * существо. Доли выше говорят про игру («из десяти зашедших двое сделали
     * существо»), и публиковать их не жалко. Абсолютные счётчики говорят про
     * нас: сколько нас всего, растём мы или падаем, сколько стоит нас
     * догнать. Это ровно та же граница, которую `limits.publicStatus`
     * проводит по деньгам, и проведена она должна быть одинаково — иначе
     * закрытая ручка бессмысленна, пока соседняя открыта.
     */
    ...(process.env.AIRENA_OPS === '1' ? { dau, mau, visitors, creators } : {}),
        /* Цели §14 — тоже наши: они говорят, во сколько мы оцениваем игрока и
       какую конверсию считаем нормой. Наружу едут те, что про игру
       (бои, конверсия), денежная — только операторам. */
    targets: process.env.AIRENA_OPS === '1'
      ? TARGETS
      : Object.fromEntries(Object.entries(TARGETS).filter(([k]) => !/usd/i.test(k))),
  };
}
