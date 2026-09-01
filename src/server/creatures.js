/**
 * Существо: то, что игрок называет «моё».
 *
 * F2 фиксирует состав: `{creature_id, body_ref, brain_source, kit, name,
 * constants_version, ladder_history}`. F3 фиксирует, что РЕФАКТОР меняет
 * только `brain_source` и `constants_version` — id, тело, имя, кит и история
 * лестницы переживают его по определению. Это не деталь реализации: игрок
 * рефакторит, чтобы его существо стало лучше, а не чтобы получить чужое.
 *
 * F11 закрывает исходник мозга. Здесь это держится одним правилом: наружу
 * ходит только `card()`, и `brain_source` в неё не попадает никогда. Ни один
 * ответ API не собирается из строки БД напрямую.
 */

import { BUILD_AXES, axisCost } from '../core/config.js';
import { randomUUID } from 'node:crypto';

/**
 * ДВА ИМЕНИ СТОРОН АРЕНЫ. НЕ ВИДЫ И НЕ АРХЕТИПЫ.
 *
 * Здесь стояло `ARCHETYPES = Object.keys(FIGHTERS)` — то есть «какие бывают
 * существа» выводилось из таблицы тел: два тела в конфиге, значит два вида
 * существ, и каждое новое существо наследовало одно из них целиком.
 *
 * Таблицы тел больше нет. Наследовать не от кого: числа принадлежат существу
 * (`build_json`), и «как у гориллы» не значит ничего. То, что осталось от
 * прежних двух имён, — ровно две СТОРОНЫ арены: голубая и оранжевая. Сторона
 * не несёт ни здоровья, ни скорости, ни радиуса; она отвечает на вопрос
 * «слева или справа», и на неё смотрит подбор соперника (`arena-loop.js`,
 * `ladder.js`), чтобы не сводить существо с самим собой по цвету.
 *
 * Имена пока прежние, и это ВРЕМЕННО: переименование сторон — отдельный шаг,
 * и делать его вместе с удалением архетипов значило бы менять две вещи разом
 * и не знать потом, какая из них сломала подбор. Когда шаг дойдёт, менять
 * придётся эту строку, колонку `creature.archetype` и цвета вьюера — и это
 * единственное место, где список имён записан словами.
 */
export const SIDES = ['octopus', 'gorilla'];

/**
 * Публичная карточка существа. ЕДИНСТВЕННЫЙ способ отдать существо наружу.
 *
 * N19 запрещает отдавать исходник мозга куда-либо за пределы сервера — в API,
 * в снапшот, в лог, в экспорт, в поддержку. Функция построена так, что забыть
 * это нельзя: она перечисляет поля явно, а не вычитает лишние из строки.
 */
const BODY_RU = {
  hp: ['живучее', 'хрупкое'],
  maxSpeed: ['быстрое', 'медленное'],
  accel: ['резкое', 'вялое на разгоне'],
  turnRate: ['вёрткое', 'неповоротливое'],
  radius: ['мелкое', 'крупное'],
  jumpHeight: ['прыгучее', 'низкое в прыжке'],
};

/** «мелкое, но хрупкое» — самая дорогая ось тела и самая дешёвая. */
function bodyLine(buildJson) {
  let b = null;
  try { b = buildJson ? JSON.parse(buildJson) : null; } catch { b = null; }
  if (!b) return 'тело обычное';
  const share = [];
  for (const [name, a] of Object.entries(BUILD_AXES)) {
    const v = Number(b[name]);
    if (!Number.isFinite(v)) continue;
    /* Доля пути по оси, от дешёвого конца к дорогому: сравнимо между осями с
       разными единицами, потому что считается в долях самой оси. */
    const span = (a.max - a.min) / a.per;
    share.push({ name, at: span ? axisCost(name, v) / ((a.weight ?? 1) * span) : 0.5 });
  }
  if (share.length < 2) return 'тело обычное';
  share.sort((x, y) => y.at - x.at);
  const top = share[0]; const bot = share[share.length - 1];
  /* Ровное тело незачем описывать крайностями: они будут выдуманными. */
  if (top.at - bot.at < 0.2) return 'тело ровное';
  return `${BODY_RU[top.name][0]}, но ${BODY_RU[bot.name][1]}`;
}

export function card(row, { viewerId = null } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    /*
     * ── ОДНА СТРОКА ПРО ТЕЛО, А НЕ ПРО ВИД ──────────────────────────────────
     *
     * Здесь отдавался `archetype`, и экран выбора печатал по нему «тяжёлое,
     * ближний бой» — то есть существу, названному игроком «стеклянная
     * медуза», приписывалась чужая характеристика. Видов нет; вместо них
     * называется то, за что существо ЗАПЛАТИЛО: самая дорогая его ось и самая
     * дешёвая. Две крайности честнее шести чисел — карточка отвечает на
     * «чем оно отличается», а не показывает таблицу.
     *
     * Считает сервер, потому что цены и границы осей живут здесь: клиент,
     * знающий их, был бы второй копией экономики.
     */
    bodyLine: bodyLine(row.build_json),
    bodyRef: row.body_ref,
    kit: safeJson(row.kit_json, []),
    unfit: safeJson(row.unfit_json, []),
    model: row.brain_model,
    constantsVersion: row.constants_version,
    prompt: row.prompt,
    rating: Math.round(row.rating),
    peak: Math.round(row.peak_rating),
    wins: row.wins, losses: row.losses, draws: row.draws,
    fights: row.fights,
    winrate: row.fights ? Math.round((row.wins / row.fights) * 100) : null,
    adaptations: row.adaptations,
    tacticsCard: row.tactics_card,
    state: row.state,
    isLibrary: !!row.is_library,
    isMine: viewerId != null && row.owner_id === viewerId,
    size: row.size ?? 1,
    /* Телосложение — свои числа существа. Карточка показывает их как есть:
       наследовать не от кого, и «как у гориллы» больше не значит ничего. */
    build: (() => { try { return row.build_json ? JSON.parse(row.build_json) : null; } catch { return null; } })(),
    /* Что пошло не так при рождении. Наружу едет всем: «носит тело архетипа»
       — это про то, что зритель видит на арене, а не тайна владельца. */
    birthNote: (() => { try { return JSON.parse(row.birth_note || 'null'); } catch { return null; } })(),
    hasBrain: !!row.brain_source,
    /* Дерётся ли существо своим набором или эталонным. Экран обязан это
       сказать: набор, которым существо не пользуется, — это ложь в самом
       заметном месте страницы. */
    kitActive: !!row.kit_active,
    createdAt: row.created_at,
    season: row.season,
  };
}

const safeJson = (s, dflt) => { try { return JSON.parse(s); } catch { return dflt; } };

/**
 * Имя. Генерируется из промпта игрока моделью вместе с китом, но должно быть
 * и без модели: генерация может упасть, а существо без имени — это строка «—»
 * в таблице лидеров, то есть баг, который видят все.
 */
const SYLL_A = ['ВЕР', 'КОР', 'НАЛ', 'ТИР', 'ОСК', 'ДРА', 'ГЛЕЙ', 'ФАР', 'ЗЕН', 'МОР', 'ХАЛ', 'ПРЕ'];
const SYLL_B = ['ТУС', 'НАКС', 'ВИР', 'ДОН', 'МАР', 'ЛЕК', 'СИМ', 'РАН', 'ТАЛ', 'ГОР', 'ВЕЙ', 'КАД'];

export function fallbackName(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = SYLL_A[(h >>> 3) % SYLL_A.length];
  const b = SYLL_B[(h >>> 11) % SYLL_B.length];
  const n = ((h >>> 19) % 89) + 10;
  return `${a}${b}-${n}`;
}

/** Имя допустимо, если оно читается в таблице и не притворяется чужим. */
export function sanitizeName(raw, seedStr) {
  if (typeof raw !== 'string') return fallbackName(seedStr);
  const s = raw.trim().replace(/\s+/g, ' ').slice(0, 22);
  /* Разрешаем буквы, цифры, дефис и пробел. Всё остальное — это либо разметка,
     либо попытка нарисовать в таблице лидеров то, чего там быть не должно. */
  if (!/^[\p{L}\p{N} '\-]{2,22}$/u.test(s)) return fallbackName(seedStr);
  return s.toUpperCase();
}

export function create(db, {
  ownerId, name, bodyRef, kit, brainSource, brainModel,
  constantsVersion, prompt, unfit = [], isLibrary = false, season = 1,
  rating = 1200, tacticsCard = null, kitActive = false, now = Date.now(),
  /* Тело: исходник модели и его обезвреженный вариант. Оба или ни одного —
     `body_safe` без `body_source` означало бы, что показать игроку его
     собственное тело мы уже не можем. */
  bodySource = null, bodySafe = null, bodyDraws = null,
  /* VFX-IR: декорация умений, написанная моделью (§9.2). Пишется только
     проверенной — `canonicalIr` уже отсеяла всё, что не прошло грамматику
     частей, — и null здесь законен: read-kit рисуется в любом случае. */
  vfxIr = null,
  /* Что пошло не так при рождении (§5.1): подмена модели, несобравшееся тело.
     Пустой массив и null — одно и то же: «всё как заказано». */
  birthNote = null,
  /*
   * Размер: 0.75…1.5, единица — как раньше. На БОЙ он больше не влияет.
   *
   * Раньше это была единственная своя ось существа: `statsFor(archetype, size)`
   * растягивала числа архетипа показателями степени. Ни функции, ни архетипа
   * больше нет — боевые числа целиком приходят из телосложения (`build`,
   * `statsOf`), включая радиус, который прежде был производной размера.
   *
   * Колонка осталась внешней величиной: вьюер масштабирует ею меш тела
   * (`live.js` отдаёт `sizes` в кадре матча). То есть теперь это про то, каким
   * существо ВЫГЛЯДИТ, а не про то, как оно дерётся.
   */
  size = null,
  /* Телосложение — свои числа существа, уже нормализованные конвейером.
     Пишется одной вставкой с `brain_source`: «против какого тела написан этот
     мозг» должно читаться из той же строки, что и сам мозг. */
  build = null,
}) {
  const id = `c_${randomUUID().slice(0, 12)}`;
  /*
   * ССЫЛКА НА СВОЁ ТЕЛО СТАВИТСЯ ЗДЕСЬ — И ТОЛЬКО ЗДЕСЬ.
   *
   * Конвейер возвращает `bodyRef: archetype` и оставляет комментарий, что
   * «`gen:` подставит слой хранения, когда у существа появится id». Слой
   * хранения этого не делал: он писал `bodyRef` как пришёл. В результате
   * существо со своим телом на 37 КБ, которое сервер исправно отдавал по
   * `/api/body/:id`, зритель рисовал СТОКОВЫМ телом архетипа — потому что
   * `body_ref` говорил `octopus`.
   *
   * Снаружи это выглядело так: игрок сделал существо, а на арене оно
   * неотличимо от библиотечных. Ровно это и было первым, что он сказал.
   *
   * Условие — наличие `bodySafe`, а не `bodySource`: зритель получает
   * проверенную колонку, и если её нет, показывать нечего и ссылка обязана
   * остаться архетипом (он же и запасное тело).
   */
  const refToStore = bodySafe ? `gen:${id}` : bodyRef;
  db.prepare(`INSERT INTO creature
    (id, owner_id, name, body_ref, kit_json, brain_source, brain_model,
     constants_version, prompt, unfit_json, rating, peak_rating, tactics_card,
     is_library, created_at, updated_at, season, kit_active, body_source, body_safe, body_draws, vfx_json, birth_note, size, build_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, ownerId ?? null, name, refToStore, JSON.stringify(kit),
    brainSource ?? null, brainModel ?? null, constantsVersion, prompt ?? null,
    JSON.stringify(unfit), rating, rating, tacticsCard,
    isLibrary ? 1 : 0, now, now, season, kitActive ? 1 : 0,
    bodySafe ? bodySource : null, bodySafe || null, bodySafe ? bodyDraws : null,
    vfxIr ? JSON.stringify(vfxIr) : null,
    birthNote && birthNote.length ? JSON.stringify(birthNote) : null,
    Number.isFinite(size) ? size : null,
    build ? JSON.stringify(build) : null,
  );
  return db.prepare('SELECT * FROM creature WHERE id = ?').get(id);
}

/**
 * Рефактор. F3 буквально: меняются `brain_source` и `constants_version`,
 * плюс карточка тактики (она описывает новый мозг). Всё остальное живёт.
 *
 * Рейтинг НЕ сбрасывается. Соблазн сбросить сильный — «новый мозг, новый
 * старт», — но лестница тогда перестаёт что-либо значить: игрок с деньгами
 * может фармить свежий рейтинг, а история существа (`ladder_history`, F3)
 * обязана пережить рефактор.
 */
export function refactor(db, id, { brainSource, brainModel, constantsVersion, tacticsCard, now = Date.now() }) {
  db.prepare(`UPDATE creature SET brain_source = ?, brain_model = ?, constants_version = ?,
              tactics_card = COALESCE(?, tactics_card), updated_at = ? WHERE id = ?`)
    .run(brainSource, brainModel, constantsVersion, tacticsCard, now, id);
  return db.prepare('SELECT * FROM creature WHERE id = ?').get(id);
}

/** История лестницы: последние бои существа, уже развёрнутые для экрана. */
export function history(db, id, limit = 20) {
  const rows = db.prepare(`
    SELECT m.*, ca.name AS a_name, cb.name AS b_name
    FROM match m
    JOIN creature ca ON ca.id = m.a_id
    JOIN creature cb ON cb.id = m.b_id
    WHERE (m.a_id = ? OR m.b_id = ?) AND m.ended_at IS NOT NULL
    ORDER BY m.started_at DESC LIMIT ?
  `).all(id, id, limit);
  return rows.map((m) => {
    const mine = m.a_id === id;
    return {
      id: m.id,
      seed: m.seed,
      at: m.ended_at,
      opponent: { id: mine ? m.b_id : m.a_id, name: mine ? m.b_name : m.a_name },
      outcome: m.winner === null ? 'draw' : (m.winner === id ? 'win' : 'loss'),
      reason: m.reason,
      seconds: m.seconds,
      delta: Math.round((mine ? m.a_delta : m.b_delta) * 10) / 10,
      ratingAfter: Math.round(mine ? m.a_rating_after : m.b_rating_after),
      training: m.kind === 'training',
    };
  });
}

/**
 * Сводка «что было, пока тебя не было».
 *
 * Игрок, зашедший через три дня, пропустил ~4000 боёв. Показать их списком —
 * значит показать стену; показать только «рейтинг 1180» — значит не показать
 * ничего. Поэтому сводка отвечает на три вопроса: куда сдвинулся рейтинг,
 * сколько раз существо переучилось, и один бой, который стоит посмотреть.
 */
export function sinceSummary(db, id, sinceMs) {
  const agg = db.prepare(`
    SELECT count(*) AS n,
      sum(CASE WHEN winner = ? THEN 1 ELSE 0 END) AS w,
      sum(CASE WHEN winner IS NOT NULL AND winner != ? THEN 1 ELSE 0 END) AS l,
      sum(CASE WHEN winner IS NULL THEN 1 ELSE 0 END) AS d,
      sum(CASE WHEN a_id = ? THEN a_delta ELSE b_delta END) AS drift
    FROM match WHERE (a_id = ? OR b_id = ?) AND ended_at >= ?
  `).get(id, id, id, id, id, sinceMs);

  const adapts = db.prepare(
    `SELECT count(*) AS n FROM adaptation WHERE creature_id = ? AND at >= ? AND accepted = 1`,
  ).get(id, sinceMs).n;

  /* Один бой на посмотреть — самый крупный сдвиг рейтинга. Не «последний»:
     последний почти всегда скучный, а крупный сдвиг — это тот, где что-то
     случилось. */
  const highlight = db.prepare(`
    SELECT id, seed, started_at FROM match
    WHERE (a_id = ? OR b_id = ?) AND ended_at >= ?
    ORDER BY abs(CASE WHEN a_id = ? THEN a_delta ELSE b_delta END) DESC LIMIT 1
  `).get(id, id, sinceMs, id);

  return {
    fights: agg.n || 0,
    wins: agg.w || 0,
    losses: agg.l || 0,
    draws: agg.d || 0,
    ratingDrift: Math.round((agg.drift || 0) * 10) / 10,
    adaptations: adapts,
    highlightMatchId: highlight?.id ?? null,
  };
}
