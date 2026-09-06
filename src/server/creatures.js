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
import { abilitiesOf } from '../skills/describe.js';
import { iconUrls, iconUrlsMany } from './forge/icons.js';

/**
 * ДВЕ СТОРОНЫ АРЕНЫ. ЭТО ЦВЕТА, И БОЛЬШЕ НИЧЕГО.
 *
 * Здесь стояло `ARCHETYPES = Object.keys(FIGHTERS)` — то есть «какие бывают
 * существа» выводилось из таблицы тел: два тела в конфиге, значит два вида
 * существ, и каждое новое существо наследовало одно из них целиком.
 *
 * Таблицы тел больше нет, и видов больше нет. Числа принадлежат существу
 * (`build_json`), и «как у гориллы» не значит ничего. Осталось ровно две
 * СТОРОНЫ арены: голубая и оранжевая. Сторона не несёт ни здоровья, ни
 * скорости, ни радиуса; она отвечает на вопрос «слева или справа» и каким
 * цветом рисовать, и на неё смотрит подбор соперника (`arena-loop.js`,
 * `ladder.js`), чтобы не сводить существо с самим собой по цвету.
 *
 * Поэтому и зовутся они теперь цветами. `octopus`/`gorilla` называли виды,
 * которых не существует, и всякий читатель делал из имени вывод о
 * характеристиках — тот самый вывод, ради устранения которого таблица тел и
 * снесена. Это единственное место, где список сторон записан словами.
 */
export const SIDES = ['blue', 'orange'];

/**
 * МОСТ ДЛЯ СТАРЫХ СТРОК. ТОЛЬКО ЧТЕНИЕ, ТОЛЬКО ИМЕНА.
 *
 * В таблице `match` лежат десятки тысяч строк, записанных прежними именами
 * сторон: `a_slot`/`b_slot`, ключи верхнего уровня в `result_json`,
 * `kits_json`, `builds_json`, `sizes_json` и поле `who` в каждой строке лога.
 * Переписывать их не будем: это история боёв, и миграция на десятки тысяч
 * строк ради двух слов дороже, чем стоит.
 *
 * Значит чтение обязано понимать оба имени. Понимает оно их ЗДЕСЬ и нигде
 * больше: один список, одна функция, одно место, откуда правку можно будет
 * снять, когда старых строк не останется. На новых именах она тождественна,
 * поэтому её безопасно ставить на любом пути чтения.
 *
 * ЗАПИСЬ через мост не ходит: в базу всегда уходит нынешнее имя.
 */
const LEGACY_SIDES = { octopus: 'blue', gorilla: 'orange' };

/** Имя стороны из базы → нынешнее. Незнакомое отдаётся как есть. */
/* `hasOwn`, а не просто `LEGACY_SIDES[v]`: значение приходит из TEXT-колонки и
   из разобранного JSON, то есть это строка, за которую никто не отвечает.
   `sideKey('constructor')` через прототип вернул бы функцию, и она поехала бы
   дальше как имя стороны. */
export const sideKey = (v) => (Object.hasOwn(LEGACY_SIDES, v) ? LEGACY_SIDES[v] : v);

/**
 * Тот же мост для объекта, ключи которого — стороны (`kits_json`,
 * `builds_json`, `sizes_json`). Значения не трогаются, посторонние ключи
 * переживают перекладку как есть.
 */
export function sideKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[sideKey(k)] = v;
  return out;
}

/**
 * `result_json` целиком.
 *
 * Имена сторон стоят в нём ДВАЖДЫ: в ключах верхнего уровня и в поле `who`
 * каждой строки лога. Перевести половину хуже, чем не переводить вовсе:
 * разбор боя сравнивает `e.who` с `a_slot`, и на переведённом слоте против
 * непереведённого лога сравнение перестало бы совпадать никогда — экран «что
 * оно думало» опустел бы молча, ровно как уже было один раз с `kind`/`type`.
 */
export function sideResult(result) {
  if (!result || typeof result !== 'object') return result;
  const out = sideKeys(result);
  if (Array.isArray(out.log)) {
    out.log = out.log.map((e) => (e && typeof e === 'object' && 'who' in e
      ? { ...e, who: sideKey(e.who) }
      : e));
  }
  return out;
}

/**
 * Публичная карточка существа. ЕДИНСТВЕННЫЙ способ отдать существо наружу.
 *
 * N19 запрещает отдавать исходник мозга куда-либо за пределы сервера — в API,
 * в снапшот, в лог, в экспорт, в поддержку. Функция построена так, что забыть
 * это нельзя: она перечисляет поля явно, а не вычитает лишние из строки.
 */
/*
 * One line about the BODY, in two words: the axis it paid most for and the one
 * it paid least for. Player-visible, therefore English (docs/REDESIGN.md §1).
 */
const BODY_WORDS = {
  hp: ['tough', 'fragile'],
  maxSpeed: ['fast', 'slow'],
  accel: ['quick off the mark', 'sluggish off the mark'],
  turnRate: ['nimble', 'ponderous'],
  radius: ['small', 'bulky'],
  jumpHeight: ['springy', 'earthbound'],
};

/** "small but fragile" — the body's most expensive axis and its cheapest. */
function bodyLine(buildJson) {
  let b = null;
  try { b = buildJson ? JSON.parse(buildJson) : null; } catch { b = null; }
  if (!b) return 'an ordinary body';
  const share = [];
  for (const [name, a] of Object.entries(BUILD_AXES)) {
    const v = Number(b[name]);
    if (!Number.isFinite(v)) continue;
    /* Доля пути по оси, от дешёвого конца к дорогому: сравнимо между осями с
       разными единицами, потому что считается в долях самой оси. */
    const span = (a.max - a.min) / a.per;
    share.push({ name, at: span ? axisCost(name, v) / ((a.weight ?? 1) * span) : 0.5 });
  }
  if (share.length < 2) return 'an ordinary body';
  share.sort((x, y) => y.at - x.at);
  const top = share[0]; const bot = share[share.length - 1];
  /* An even body should not be described by extremes: they would be invented. */
  if (top.at - bot.at < 0.2) return 'an even body';
  return `${BODY_WORDS[top.name][0]}, but ${BODY_WORDS[bot.name][1]}`;
}

/**
 * Which generation of its owner this creature is.
 *
 * 1-based, ordered by birth, counting EVERY creature the owner ever made —
 * retired ones included. A generation number that renumbered itself when an
 * older creature was retired would rewrite the player's own history: their
 * third creature would suddenly claim to be their second.
 *
 * Library creatures have no owner and no lineage, so they are always 01.
 */
export function generationOf(db, row) {
  if (!db || !row.owner_id || row.is_library) return 1;
  try {
    /* Count everything born before this one, plus this one. `id` breaks the tie
       for two creatures written in the same millisecond, exactly the way the
       ladder breaks a rating tie — a stable order beats a pretty one. */
    const n = db.prepare(`SELECT count(*) AS n FROM creature
      WHERE owner_id = ? AND (created_at < ? OR (created_at = ? AND id <= ?))`)
      .get(row.owner_id, row.created_at, row.created_at, row.id).n;
    return Math.max(1, n);
  } catch { return 1; }
}

/**
 * The generation number of MANY creatures, in one query.
 *
 * `generationOf` above is a `COUNT(*)` per creature, and the session already
 * calls it once per row of a lineage. The batch form asks the same question
 * once per OWNER — every creature that owner ever made, in birth order — and
 * numbers the whole line by walking it. Retired creatures are counted here for
 * the same reason they are counted there: a generation number that renumbered
 * itself when an older creature was retired would rewrite the player's history.
 *
 * Returns `id → generation`; ids it cannot place are simply absent, and the
 * caller falls back to `generationOf`.
 */
export function generationsOf(db, rows) {
  const out = new Map();
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (!db || !list.length) return out;
  const owners = [...new Set(list.filter((r) => r.owner_id && !r.is_library).map((r) => r.owner_id))];
  for (const r of list) if (!r.owner_id || r.is_library) out.set(r.id, 1);
  if (!owners.length) return out;
  try {
    /* Chunked for the same reason `iconUrlsMany` is: SQLite binds 999
       variables by default and a season has more owners than that. */
    for (let at = 0; at < owners.length; at += 400) {
      const part = owners.slice(at, at + 400);
      const all = db.prepare(`SELECT id, owner_id FROM creature
        WHERE owner_id IN (${part.map(() => '?').join(',')})
        ORDER BY owner_id, created_at, id`).all(...part);
      let owner = null; let n = 0;
      for (const c of all) {
        if (c.owner_id !== owner) { owner = c.owner_id; n = 0; }
        n += 1;
        out.set(c.id, n);
      }
    }
  } catch { return out; }
  return out;
}

/**
 * Many cards at once — the list form of `card()`.
 *
 * Two of the card's fields cost a query each (`icons`, `generation`), which is
 * nothing for one creature and two hundred round-trips for a hundred-row
 * ladder. This resolves both in two statements for the whole list and hands
 * each `card()` its own answer. Same output, exactly: a caller can swap
 * `rows.map((r) => card(r, o))` for `cards(rows, o)` and read nothing new.
 */
export function cards(rows, { viewerId = null, db = null } = {}) {
  const list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (!list.length) return [];
  const icons = iconUrlsMany(db, list.map((r) => r.id));
  const gens = generationsOf(db, list);
  return list.map((r) => card(r, {
    viewerId,
    db,
    icons: icons.get(r.id) || null,
    generation: gens.get(r.id) ?? null,
  }));
}

/**
 * The public card of a creature. THE ONLY way a creature leaves the server.
 *
 * `db` is optional and only three fields need it — generation, icons and
 * nothing else reads the database. A caller without one still gets a complete,
 * honest card: generation 01 and no icons, which is exactly what a creature
 * looks like before its glyphs are drawn.
 *
 * `icons` and `generation` are the two fields that cost a query. A caller
 * holding a LIST has already resolved both in one statement each (`cards()`
 * above) and passes them in; `null` means "ask the database yourself", which
 * is what every single-creature caller does.
 */
export function card(row, { viewerId = null, db = null, icons = null, generation = null } = {}) {
  if (!row) return null;
  const kit = safeJson(row.kit_json, []);
  /* Resolved once: the abilities below carry their own glyph, and the `icons`
     array is the same three strings under the name §8.2 gives them. */
  const slots = icons || iconUrls(db, row.id, 3);
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
    kit,
    /*
     * The abilities as the PLAYER reads them: a name, and one paragraph of
     * plain facts. `kit` above is the grammar's own four-axis record — the
     * client must never have to translate that itself, because the numbers it
     * would need (26 damage, 4 seconds of burn) live in the registry on the
     * server. See `src/skills/describe.js`.
     */
    /* Each ability carries the address of its own glyph, `null` where none has
       been drawn. A screen that has the ability has the picture — it does not
       have to know how an icon URL is spelled, and `null` lets it draw the
       procedural fallback without first asking the network for a 404. */
    abilities: abilitiesOf(kit).map((a) => ({ ...a, icon: slots[a.slot] ?? null })),
    /*
     * Three URLs or three nulls, one per ability slot. Null is a normal answer
     * — the glyph has not been drawn yet, or there is no key to draw it with —
     * and the client draws its procedural fallback instead of an empty box.
     */
    icons: slots,
    /* Which of the owner's creatures this is, counting from the first. */
    generation: generation ?? generationOf(db, row),
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
 * The name. The model writes it from the player's description, but there has to
 * be one WITHOUT the model too: generation can fail, and a creature with no
 * name is a dash in the ladder — a bug everyone sees.
 *
 * English syllables, because the name is the most player-visible string the
 * product has (docs/REDESIGN.md §1) and a fallback that came out in Cyrillic
 * would be hidden by `latinOnly()` on the client — leaving the dash we are
 * here to prevent.
 */
const SYLL_A = ['VER', 'KOR', 'NAL', 'TYR', 'OSK', 'DRA', 'GLEI', 'FAR', 'ZEN', 'MOR', 'HAL', 'PRE'];
const SYLL_B = ['TUS', 'NAX', 'VIR', 'DON', 'MAR', 'LEK', 'SIM', 'RAN', 'TAL', 'GOR', 'VEY', 'KAD'];

export function fallbackName(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const a = SYLL_A[(h >>> 3) % SYLL_A.length];
  const b = SYLL_B[(h >>> 11) % SYLL_B.length];
  const n = ((h >>> 19) % 89) + 10;
  return `${a}${b}-${n}`;
}

/** A name is acceptable if it reads in the ladder and imitates nobody. */
export function sanitizeName(raw, seedStr) {
  if (typeof raw !== 'string') return fallbackName(seedStr);
  const s = raw.trim().replace(/\s+/g, ' ').slice(0, 22);
  /* Letters, digits, hyphen and space. Anything else is either markup or an
     attempt to draw something in the ladder that does not belong there. */
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
   * Конвейер возвращает `bodyRef` со ссылкой на СТОКОВОЕ тело и оставляет
   * комментарий, что «`gen:` подставит слой хранения, когда у существа
   * появится id». Слой хранения этого не делал: он писал `bodyRef` как
   * пришёл. В результате существо со своим телом на 37 КБ, которое сервер
   * исправно отдавал по `/api/body/:id`, зритель рисовал стоковым — потому
   * что `body_ref` говорил `octopus`.
   *
   * `octopus` здесь — ИМЯ ФАЙЛА `bodies/octopus.js`, а не сторона и не вид:
   * стороны зовутся `blue` и `orange`, а стоковые тела лежат на диске под
   * своими старыми именами и переименовываются отдельно.
   *
   * Снаружи это выглядело так: игрок сделал существо, а на арене оно
   * неотличимо от библиотечных. Ровно это и было первым, что он сказал.
   *
   * Условие — наличие `bodySafe`, а не `bodySource`: зритель получает
   * проверенную колонку, и если её нет, показывать нечего и ссылка обязана
   * остаться стоковым телом (оно же и запасное).
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
 * WHILE YOU WERE AWAY — the recap card of §6.1, in one query each.
 *
 * A player who comes back after three days missed about four thousand fights.
 * Listing them is a wall; printing "1,180 rating" is nothing at all. So the
 * summary answers the three questions a returning owner actually has: where the
 * rating moved, how many times the creature re-learned, and which single fight
 * is worth watching.
 *
 * It is deliberately a summary and not a feed: the career itself is HISTORY,
 * one click away, and a recap that tries to be the history has to be dismissed
 * before the arena can be seen.
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

  /* One fight to watch: the largest rating swing, not the most recent one. The
     most recent fight is almost always an ordinary one, while a large swing is
     by definition the fight where something happened — an upset, a streak
     broken, a first win against someone far above. */
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
