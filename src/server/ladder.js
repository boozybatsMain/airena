/**
 * Лестница: рейтинг, подбор соперника, таблицы.
 *
 * F5 требует, чтобы один матч двигал рейтинг понемногу, «как в шахматах», а не
 * решал его. Отсюда Эло с маленьким K: разброс генератора — 37 процентных
 * пунктов (§1), и рейтинг, который верит одному матчу, измеряет этот разброс,
 * а не силу.
 *
 * N15 запрещает показывать одиночный матч как результат рейтинга. Здесь это
 * держится структурно: `rate()` возвращает дельту, а экран боя показывает её
 * как «+3», а не как «новое место».
 */

/**
 * K-фактор. 12 при 1 бое/мин — это 0.2 рейтинга в секунду в худшем случае,
 * то есть примерно 170 боёв, чтобы пройти путь от старта до плато. При K=32
 * (шахматный дефолт) то же плато достигается за 60 боёв, и лестница из
 * измерения силы превращается в измерение того, кто раньше зашёл.
 *
 * Первые 20 боёв — период калибровки с утроенным K: существо, которое сильнее
 * старта, не должно ползти к своему месту сутки.
 */
export const K_BASE = 12;
export const K_PLACEMENT = 36;
export const PLACEMENT_FIGHTS = 20;
export const START_RATING = 1200;
/** Ниже этого рейтинг не падает: дно лестницы — не наказание, а полка. */
export const FLOOR_RATING = 600;

export function kFactor(fights) {
  return fights < PLACEMENT_FIGHTS ? K_PLACEMENT : K_BASE;
}

export function expectedScore(ra, rb) {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

/**
 * @param {number} ra рейтинг A
 * @param {number} rb рейтинг B
 * @param {number} score 1 победа A, 0.5 ничья, 0 победа B
 * @returns {{a: number, b: number}} дельты
 */
export function rate(ra, rb, score, fightsA = 999, fightsB = 999) {
  const ea = expectedScore(ra, rb);
  const da = kFactor(fightsA) * (score - ea);
  const db = kFactor(fightsB) * ((1 - score) - (1 - ea));
  return { a: round2(da), b: round2(db) };
}

const round2 = (x) => Math.round(x * 100) / 100;

export const clampRating = (r) => Math.max(FLOOR_RATING, round2(r));

/**
 * Подбор соперника.
 *
 * Окно расширяется, пока кто-нибудь не найдётся: узкое окно даёт честный
 * матч, но на пустой лестнице даёт ноль соперников — а существо, которое
 * «ищет бой» и не находит, ломает весь цикл §6.2. Поэтому последний шаг
 * окна — вся лестница, и если и там пусто, вызывающий ставит библиотечного
 * соперника.
 *
 * Свежее существо (меньше PLACEMENT_FIGHTS боёв) первым соперником получает
 * тренировочного — §7.3, и он открыто помечен таковым.
 */
export const WINDOWS = [60, 140, 300, 700, Infinity];

export function pickOpponent(db, creature, { now = Date.now(), rng = Math.random } = {}) {
  const recent = db.prepare(`
    SELECT CASE WHEN a_id = ? THEN b_id ELSE a_id END AS other
    FROM match WHERE (a_id = ? OR b_id = ?) ORDER BY started_at DESC LIMIT 6
  `).all(creature.id, creature.id, creature.id).map((r) => r.other);

  for (const w of WINDOWS) {
    const lo = w === Infinity ? -1e9 : creature.rating - w;
    const hi = w === Infinity ? 1e9 : creature.rating + w;
    const rows = db.prepare(`
      SELECT id, name, rating, fights, is_library, archetype
      FROM creature
      WHERE state = 'active' AND id != ? AND season = ?
        AND rating BETWEEN ? AND ?
      ORDER BY abs(rating - ?) ASC
      LIMIT 24
    `).all(creature.id, creature.season, lo, hi, creature.rating);
    /* Свежих соперников предпочитаем повторным: одно и то же существо шесть
       раз подряд читается как «игра сломалась», даже когда это честный подбор
       на пустой лестнице. */
    const fresh = rows.filter((r) => !recent.includes(r.id));
    const pool = fresh.length ? fresh : rows;
    if (pool.length) return pool[Math.floor(rng() * Math.min(pool.length, 8))];
  }
  return null;
}

/**
 * Таблица строится ОТ ИГРОКА (§10.4): топ-10, окно вокруг своей строки,
 * процентиль. Аркадный столбик на тысячу строк запрещён как форма.
 */
export function ladderView(db, { creatureId = null, season = 1, windowSize = 4 } = {}) {
  const total = db.prepare(
    `SELECT count(*) AS n FROM creature WHERE state = 'active' AND season = ?`,
  ).get(season).n;

  const top = db.prepare(`
    SELECT id, name, rating, peak_rating, wins, losses, draws, fights, archetype, brain_model, owner_id, is_library
    FROM creature WHERE state = 'active' AND season = ?
    ORDER BY rating DESC, fights DESC, id ASC LIMIT 10
  `).all(season).map((r, i) => ({ ...row(r), rank: i + 1 }));

  let me = null; let around = []; let percentile = null;
  if (creatureId) {
    const c = db.prepare(`SELECT * FROM creature WHERE id = ?`).get(creatureId);
    if (c) {
      const better = db.prepare(`
        SELECT count(*) AS n FROM creature
        WHERE state = 'active' AND season = ? AND (rating > ? OR (rating = ? AND id < ?))
      `).get(season, c.rating, c.rating, c.id).n;
      const rank = better + 1;
      /* «Сильнее 73% существ» вместо номера места — §10.4. При total<=1
         процент неопределён, и врать 100% нельзя. */
      percentile = total > 1 ? Math.round(((total - rank) / (total - 1)) * 100) : null;
      me = { ...row(c), rank };

      const above = db.prepare(`
        SELECT * FROM creature WHERE state = 'active' AND season = ?
          AND (rating > ? OR (rating = ? AND id < ?))
        ORDER BY rating ASC, id DESC LIMIT ?
      `).all(season, c.rating, c.rating, c.id, windowSize).reverse();
      const below = db.prepare(`
        SELECT * FROM creature WHERE state = 'active' AND season = ?
          AND (rating < ? OR (rating = ? AND id > ?))
        ORDER BY rating DESC, id ASC LIMIT ?
      `).all(season, c.rating, c.rating, c.id, windowSize);
      around = [
        ...above.map((r, i) => ({ ...row(r), rank: rank - above.length + i })),
        { ...me, isMe: true },
        ...below.map((r, i) => ({ ...row(r), rank: rank + i + 1 })),
      ];
      /* Личный счёт против каждого соседа — §10.4 требует именно его, а не
         только рейтинг: «кто это и как я с ним играю» читается за один взгляд. */
      for (const n of around) {
        if (n.id === c.id) continue;
        n.head2head = headToHead(db, c.id, n.id);
      }
    }
  }
  return { total, top, me, around, percentile, season };
}

export function headToHead(db, aId, bId) {
  const r = db.prepare(`
    SELECT
      sum(CASE WHEN winner = ? THEN 1 ELSE 0 END) AS w,
      sum(CASE WHEN winner = ? THEN 1 ELSE 0 END) AS l,
      sum(CASE WHEN winner IS NULL THEN 1 ELSE 0 END) AS d,
      count(*) AS n
    FROM match
    WHERE ended_at IS NOT NULL AND ((a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?))
  `).get(aId, bId, aId, bId, bId, aId);
  return { w: r.w || 0, l: r.l || 0, d: r.d || 0, n: r.n || 0 };
}

const row = (r) => ({
  id: r.id,
  name: r.name,
  rating: Math.round(r.rating),
  peak: Math.round(r.peak_rating),
  wins: r.wins, losses: r.losses, draws: r.draws, fights: r.fights,
  archetype: r.archetype,
  model: r.brain_model,
  isLibrary: !!r.is_library,
  winrate: r.fights ? Math.round((r.wins / r.fights) * 100) : null,
});

/**
 * Таблица моделей — «какая нейросеть сильнее» (§10.4).
 *
 * Осмысленна от ~200 существ; ниже этого отдаём пометку о малой выборке, а не
 * прячем таблицу: спрятанная таблица читается как «мы не знаем», а помеченная —
 * как «мы знаем, сколько именно знаем».
 */
export const MODEL_TABLE_MIN = 200;

export function modelTable(db, season = 1) {
  const rows = db.prepare(`
    SELECT brain_model AS model, count(*) AS creatures,
           sum(wins) AS wins, sum(losses) AS losses, sum(draws) AS draws,
           sum(fights) AS fights, avg(rating) AS avg_rating
    FROM creature
    WHERE state = 'active' AND season = ? AND brain_model IS NOT NULL AND is_library = 0
    GROUP BY brain_model ORDER BY avg_rating DESC
  `).all(season);
  const total = rows.reduce((s, r) => s + r.creatures, 0);
  return {
    smallSample: total < MODEL_TABLE_MIN,
    need: MODEL_TABLE_MIN,
    have: total,
    rows: rows.map((r) => ({
      model: r.model,
      creatures: r.creatures,
      fights: r.fights,
      winrate: r.fights ? Math.round((r.wins / r.fights) * 100) : null,
      avgRating: Math.round(r.avg_rating),
    })),
  };
}
