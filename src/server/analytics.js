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

/** Закрытый словарь. Ключ — имя события, значение — что оно кормит. */
export const EVENTS = {
  // воронка первой сессии
  visit: { feeds: 'Посетитель → создал существо', props: ['ref', 'guest'] },
  fight_watched: { feeds: 'Матчей на DAU', props: ['matchId', 'seconds', 'completed'] },
  tactics_opened: { feeds: 'Посетитель → создал существо', props: ['matchId'] },
  create_opened: { feeds: 'Посетитель → создал существо', props: [] },
  create_submitted: { feeds: 'Посетитель → создал существо', props: ['bundle', 'archetype', 'promptChars'] },
  create_done: { feeds: 'Доля отклонённых генераций', props: ['jobId', 'ms', 'attempts', 'fallback'] },
  create_failed: { feeds: 'Доля отклонённых генераций', props: ['jobId', 'code'] },
  account_wall_shown: { feeds: 'Посетитель → создал существо', props: ['creatureId'] },
  account_claimed: { feeds: 'Посетитель → создал существо', props: ['moved'] },

  // цикл и удержание
  session_start: { feeds: 'D1 / D7 / D30', props: ['returning', 'awayMs'] },
  tab_view: { feeds: 'Матчей на DAU', props: ['tab'] },
  ladder_viewed: { feeds: 'Матчей на DAU', props: ['rank'] },
  creature_viewed: { feeds: 'Матчей на DAU', props: ['creatureId', 'mine'] },
  refactor_submitted: { feeds: 'Стоимость на MAU', props: ['creatureId', 'bundle'] },
  refactor_done: { feeds: 'Стоимость на MAU', props: ['creatureId', 'better'] },
  adaptation_shown: { feeds: 'D7', props: ['creatureId', 'kind'] },

  // предохранители — не продуктовые, но без них не видно, почему упала воронка
  limit_denied: { feeds: 'Стоимость на MAU', props: ['code'] },
  error_shown: { feeds: '—', props: ['code', 'screen'] },
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
    costPerMauUsd: mau ? spend / mau : null,
    dau, mau, visitors, creators,
    targets: TARGETS,
  };
}
