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

/**
 * @param o.busy  Set идентификаторов, которые сейчас ЗАНЯТЫ своим боем.
 *
 * Появился вместе с D161 (бои по кулдауну). До него подбор не спрашивал про
 * занятость вовсе: существо могло быть соперником в любом числе матчей
 * одновременно, потому что зачётный прогон мгновенный, а трансляция длится
 * пятьдесят секунд. Снаружи это читалось как телепортация — одно и то же
 * существо шло двумя боями сразу, и зритель видел произвольный из них.
 *
 * Множество передаётся, а не читается из базы: занятость — состояние ПРОЦЕССА
 * (сколько ещё идёт трансляция), и колонки под неё нет. Заводить колонку
 * значило бы, что упавший процесс оставляет половину лестницы вечно занятой.
 */
export function pickOpponent(db, creature, { now = Date.now(), rng = Math.random, busy = null } = {}) {
  const recent = db.prepare(`
    SELECT CASE WHEN a_id = ? THEN b_id ELSE a_id END AS other
    FROM match WHERE (a_id = ? OR b_id = ?) ORDER BY started_at DESC LIMIT 6
  `).all(creature.id, creature.id, creature.id).map((r) => r.other);

  /*
   * ДВА ПРОХОДА: сперва ищем чужой архетип во ВСЕХ окнах, и только потом
   * соглашаемся на своего.
   *
   * Предпочтение внутри одного окна эту работу не делает. Окна расширяются от
   * узкого к широкому, и узкое часто содержит только своих: подбор возвращал
   * своего немедленно, хотя чужой нашёлся бы окном шире. Замерено: 29%
   * подборов давали одинаковый архетип, то есть почти треть рейтинговых боёв
   * шла в чужом теле — осьминожий мозг в теле гориллы держит дистанцию, с
   * которой его умения не достают, и не наносит ничего.
   *
   * Второй проход обязателен и не является поблажкой: на пустой лестнице или
   * в маленьком сезоне чужого архетипа может не быть вовсе, а «нет боя» хуже,
   * чем «бой в чужом теле».
   */
  const scan = (wantOpposite, freshOnly) => {
    for (const w of WINDOWS) {
      const lo = w === Infinity ? -1e9 : creature.rating - w;
      const hi = w === Infinity ? 1e9 : creature.rating + w;
      const rows = db.prepare(`
        SELECT id, name, rating, fights, is_library, archetype
        FROM creature
        WHERE state = 'active' AND id != ? AND season = ?
          AND rating BETWEEN ? AND ?
          ${wantOpposite ? 'AND archetype != ?' : ''}
        ORDER BY abs(rating - ?) ASC
        LIMIT 24
      `).all(...(wantOpposite
        ? [creature.id, creature.season, lo, hi, creature.archetype, creature.rating]
        : [creature.id, creature.season, lo, hi, creature.rating]));
      /* Свежих соперников предпочитаем повторным: одно и то же существо шесть
         раз подряд читается как «игра сломалась», даже когда это честный подбор
         на пустой лестнице. */
      /* Занятые отсеиваются ЖЁСТКО: драться с тем, кто уже дерётся, нельзя. */
      const idle = busy ? rows.filter((r) => !busy.has(r.id)) : rows;
      const pool = freshOnly ? idle.filter((r) => !recent.includes(r.id)) : idle;
      if (pool.length) return pool[Math.floor(rng() * Math.min(pool.length, 8))];
    }
    return null;
  };

  /*
   * ── ЧЕТЫРЕ ПРОХОДА, И ПОРЯДОК В НИХ — ЭТО ДВА ПРЕДПОЧТЕНИЯ ПОДРЯД ────────
   *
   * Было два: «чужой архетип во всех окнах», потом «любой». Свежесть при этом
   * решалась ВНУТРИ окна — `fresh.length ? fresh : idle`, — то есть первое же
   * окно, где нашёлся хоть кто-нибудь, соглашалось на недавнего соперника, не
   * пробуя окно шире.
   *
   * Замерено на живой лестнице: у лидера (рейтинг 1566, дальше всех от
   * остальных) последние ДЕСЯТЬ боёв прошли с ОДНИМ И ТЕМ ЖЕ соперником.
   * Снаружи это читается как «игра сломалась», и основатель просил ровно
   * обратного: «оппоненты разные».
   *
   * Свежесть теперь такое же сквозное предпочтение, как архетип, и стоит
   * ВЫШЕ него: чужой архетип — это про качество боя, а десять боёв подряд с
   * одним существом — про то, идёт ли игра вообще.
   *
   * Последний проход по-прежнему соглашается на всё: «нет боя» хуже, чем
   * «бой с тем же самым», и на лестнице из двух существ выбора нет.
   */
  return scan(true, true) || scan(false, true) || scan(true, false) || scan(false, false);
}

/*
 * СКОЛЬКО СТРОК ОТДАВАТЬ.
 *
 * Лестница была доской ТОП-10 и ничем больше: `top` брал десять строк, `around`
 * — окно вокруг твоего существа, и всё. При сорока двух активных существах это
 * значило, что тридцать с лишним из них недостижимы из интерфейса ВООБЩЕ: у
 * страницы существа нет ни поиска, ни списка, а попасть на неё можно только
 * кликом по строке лестницы или по карточке из тройки «за кем следить».
 *
 * Обнаружилось это ровно там, где больнее: свежесозданное существо с нулём
 * побед стоит в середине таблицы, в тройку не попадает (она сортирует по
 * винрейту) — и посмотреть, что с ним не так, нельзя никак. Основатель об
 * этом и спросил.
 *
 * Потолок нужен: сегодня существ сорок, завтра тысячи, и «отдай всё» станет
 * запросом, который никто не заметит, пока он не начнёт занимать секунду.
 */
const TOP_DEFAULT = 10;
export const TOP_MAX = 200;

/**
 * Таблица строится ОТ ИГРОКА (§10.4): топ-10, окно вокруг своей строки,
 * процентиль. Аркадный столбик на тысячу строк запрещён как форма.
 */
export function ladderView(db, { creatureId = null, season = 1, windowSize = 4, topLimit = TOP_DEFAULT } = {}) {
  /*
   * ПРОЦЕНТИЛЬ СЧИТАЕТСЯ ПО ИГРОКАМ, А НЕ ПО ВСЕЙ ТАБЛИЦЕ.
   *
   * Знаменатель включал библиотечные существа. Их рейтинг ПОСТАВЛЕН для
   * калибровки и не двигается (см. `bump` в arena-loop.js), поэтому «сильнее
   * 73% существ» на две трети означало «сильнее наших собственных заглушек».
   * В базе сейчас 23 библиотечных из 30 активных — то есть цифра была почти
   * целиком про них.
   *
   * Призовая доска ниже эту границу уже проводит; процентиль обязан проводить
   * ту же. Одна и та же величина не может считаться по двум разным множествам
   * на одном экране.
   */
  /*
   * ДВА ЧИСЛА, ПОТОМУ ЧТО ДВА ВОПРОСА.
   *
   * `total` — сколько строк в таблице. Ровно по ним считается место, и в них
   * входят библиотечные: они стоят в топе и в окне «рядом с тобой», и место
   * обязано совпадать с тем, что игрок видит глазами.
   *
   * `players` — сколько существ ИГРОКОВ. По ним считается процентиль: рейтинг
   * библиотечных ПОСТАВЛЕН для калибровки и не двигается, и «сильнее 73%
   * существ» на две трети означало «сильнее наших заглушек».
   *
   * Сначала я просто сузил `total` — и получил экран, который сам себе
   * противоречит: «в лестнице 7 существ» над таблицей с местами до 22-го.
   * Одно число на два вопроса не отвечает; нужны оба, и каждое там, где оно
   * значит то, что написано.
   */
  const total = db.prepare(
    `SELECT count(*) AS n FROM creature WHERE state = 'active' AND season = ?`,
  ).get(season).n;
  const players = db.prepare(
    `SELECT count(*) AS n FROM creature WHERE state = 'active' AND season = ? AND is_library = 0`,
  ).get(season).n;

  const top = db.prepare(`
    SELECT id, name, rating, peak_rating, wins, losses, draws, fights, archetype, brain_model, owner_id, is_library
    FROM creature WHERE state = 'active' AND season = ?
    ORDER BY rating DESC, fights DESC, id ASC LIMIT ?
  `).all(season, Math.max(1, Math.min(TOP_MAX, topLimit))).map((r, i) => ({ ...row(r), rank: i + 1 }));

  /*
   * ПРИЗОВАЯ ДОСКА — ОТДЕЛЬНЫЙ СПИСОК, а не первые строки лестницы.
   *
   * Экран сезона брал `top[i]` и подписывал им i-е место в призовом фонде. В
   * `top` при этом стоят и наши калибровочные существа, чей рейтинг поставлен
   * при заселении и не двигается (D37): семь из десяти верхних строк — дом,
   * и приз доставался дому. Игра не может выдавать призы сама себе, и
   * показывать, что может, — тем более.
   *
   * Правило простое и живёт на сервере: в призах участвуют существа игроков.
   */
  const prizeBoard = db.prepare(`
    SELECT id, name, rating, peak_rating, wins, losses, draws, fights, archetype, brain_model, owner_id, is_library
    FROM creature WHERE state = 'active' AND season = ? AND is_library = 0
    ORDER BY rating DESC, fights DESC, id ASC LIMIT 10
  `).all(season).map((r, i) => ({ ...row(r), rank: i + 1 }));

  let me = null; let around = []; let percentile = null;
  if (creatureId) {
    const c = db.prepare(`SELECT * FROM creature WHERE id = ?`).get(creatureId);
    if (c) {
      /*
       * ПОРЯДОК ЗДЕСЬ ОБЯЗАН СОВПАДАТЬ С ПОРЯДКОМ В `top`.
       *
       * Топ сортировался по `rating DESC, fights DESC, id ASC`, а место
       * существа считалось только по рейтингу и id. При равном рейтинге эти
       * два ответа расходились, и на ОДНОМ экране одно и то же существо
       * стояло на двух разных местах: седьмым в таблице и «восьмым из 26» в
       * своей строке. «Где я» — единственная работа лестницы (§10.3), и два
       * ответа на этот вопрос хуже, чем ни одного.
       */
      const better = db.prepare(`
        SELECT count(*) AS n FROM creature
        WHERE state = 'active' AND season = ?
          AND (rating > ?
            OR (rating = ? AND fights > ?)
            OR (rating = ? AND fights = ? AND id < ?))
      `).get(season, c.rating, c.rating, c.fights, c.rating, c.fights, c.id).n;
      const rank = better + 1;
      /*
       * МЕСТО И ПРОЦЕНТИЛЬ ОТВЕЧАЮТ НА РАЗНЫЕ ВОПРОСЫ, И СЧИТАЮТСЯ ПО РАЗНОМУ.
       *
       * `rank` — строка в таблице, и он обязан совпадать с порядком `top`,
       * включая библиотечные (иначе на одном экране два ответа на «где я», см.
       * комментарий выше).
       *
       * `percentile` — «сильнее скольких существ», и это про ИГРОКОВ. Их
       * рейтинг зарабатывается, а библиотечным он ПОСТАВЛЕН и не двигается;
       * считать себя сильнее наших заглушек нечем гордиться, а в базе их
       * сейчас 23 из 30 активных — то есть цифра была почти целиком про них.
       *
       * Поэтому у процентиля свой числитель, а не `rank`.
       */
      const betterPlayers = db.prepare(`
        SELECT count(*) AS n FROM creature
        WHERE state = 'active' AND season = ? AND is_library = 0
          AND (rating > ?
            OR (rating = ? AND fights > ?)
            OR (rating = ? AND fights = ? AND id < ?))
      `).get(season, c.rating, c.rating, c.fights, c.rating, c.fights, c.id).n;
      /* «Сильнее 73% существ» вместо номера места — §10.4. При total<=1
         процент неопределён, и врать 100% нельзя. Библиотечное существо само
         в знаменатель не входит, поэтому и процентиля у него нет. */
      percentile = (!c.is_library && players > 1)
        ? Math.round(((players - (betterPlayers + 1)) / (players - 1)) * 100)
        : null;
      me = { ...row(c), rank };

      const above = db.prepare(`
        SELECT * FROM creature WHERE state = 'active' AND season = ?
          AND (rating > ?
            OR (rating = ? AND fights > ?)
            OR (rating = ? AND fights = ? AND id < ?))
        ORDER BY rating ASC, fights ASC, id DESC LIMIT ?
      `).all(season, c.rating, c.rating, c.fights, c.rating, c.fights, c.id, windowSize).reverse();
      const below = db.prepare(`
        SELECT * FROM creature WHERE state = 'active' AND season = ?
          AND (rating < ?
            OR (rating = ? AND fights < ?)
            OR (rating = ? AND fights = ? AND id > ?))
        ORDER BY rating DESC, fights DESC, id ASC LIMIT ?
      `).all(season, c.rating, c.rating, c.fights, c.rating, c.fights, c.id, windowSize);
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
  return { total, players, prizeBoard, top, me, around, percentile, season };
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
  /*
   * Рейтинг библиотечного существа НЕ ЗАРАБОТАН — он поставлен при заселении
   * и не двигается (см. `bump` в arena-loop.js: эталон, который дрейфует,
   * перестаёт быть эталоном). Рядом при этом стоит настоящий счёт боёв, и
   * получается строка «1450 · 201 бой · 0% побед» — два числа, которые
   * противоречат друг другу, и игрок читает первое как заработанное.
   *
   * Механику менять нельзя, она нужна ровно такой. Значит обязана меняться
   * подпись: экран говорит, что это отметка калибровки, а не место в
   * соревновании.
   */
  calibration: !!r.is_library,
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
