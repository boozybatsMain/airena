/**
 * Хранилище Airena.
 *
 * `node:sqlite` из стандартной библиотеки Node 24 — не «пока не завели
 * настоящую БД», а решение: A6 держит бандл в пределах 200 файлов, а каждая
 * внешняя зависимость в бэкенде, который считает деньги и рейтинг, — это ещё
 * одна поверхность, которую надо аудировать. Файл БД лежит рядом с репозиторием
 * и переживает перезапуск; тесты открывают ':memory:'.
 *
 * Схема пишется здесь целиком и мигрируется вперёд по `user_version`. Откатов
 * нет намеренно: сезон — это граница, на которой меняются константы (F9), и
 * миграция вниз означала бы, что рейтинг посчитан по двум разным правилам.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Каждая миграция — массив утверждений. Индекс = целевой user_version. */
const MIGRATIONS = [
  // 0 -> 1: аккаунты, существа, матчи, лестница, лимиты, аналитика.
  [
    `CREATE TABLE account (
       id            TEXT PRIMARY KEY,
       genex_sub     TEXT UNIQUE,
       email_norm    TEXT UNIQUE,
       created_at    INTEGER NOT NULL,
       last_seen_at  INTEGER NOT NULL,
       is_guest      INTEGER NOT NULL DEFAULT 0,
       free_creature_used INTEGER NOT NULL DEFAULT 0
     )`,
    `CREATE TABLE creature (
       id            TEXT PRIMARY KEY,
       owner_id      TEXT REFERENCES account(id),
       name          TEXT NOT NULL,
       body_ref      TEXT NOT NULL,
       kit_json      TEXT NOT NULL,
       brain_source  TEXT,
       brain_model   TEXT,
       constants_version TEXT NOT NULL,
       prompt        TEXT,
       unfit_json    TEXT NOT NULL DEFAULT '[]',
       rating        REAL NOT NULL DEFAULT 1200,
       peak_rating   REAL NOT NULL DEFAULT 1200,
       wins          INTEGER NOT NULL DEFAULT 0,
       losses        INTEGER NOT NULL DEFAULT 0,
       draws         INTEGER NOT NULL DEFAULT 0,
       fights        INTEGER NOT NULL DEFAULT 0,
       adaptations   INTEGER NOT NULL DEFAULT 0,
       tactics_card  TEXT,
       state         TEXT NOT NULL DEFAULT 'active',
       is_library    INTEGER NOT NULL DEFAULT 0,
       created_at    INTEGER NOT NULL,
       updated_at    INTEGER NOT NULL,
       season        INTEGER NOT NULL DEFAULT 1
     )`,
    `CREATE INDEX creature_rating ON creature(state, is_library, rating DESC)`,
    `CREATE INDEX creature_owner ON creature(owner_id)`,
    /*
     * `a_slot`/`b_slot` — СТОРОНА АРЕНЫ, голубая или оранжевая.
     *
     * В колонке лежат значения двух эпох: десятки тысяч старых строк с
     * прежними именами сторон и всё, что записано после переименования, — с
     * нынешними. Миграции данных здесь нет и не будет: это история боёв,
     * переписывать её ради двух слов дороже, чем стоит, а рейтинг и исход в
     * этих строках от имени стороны не зависят.
     *
     * Отвечает за это ЧТЕНИЕ: `sideKey`/`sideKeys`/`sideResult` в
     * `creatures.js` приводят старое имя к нынешнему на каждом пути, где
     * строка матча поднимается из базы. Тем же мостом читаются `result_json`,
     * `kits_json`, `builds_json` и `sizes_json` — они ключуются этими же
     * именами.
     */
    `CREATE TABLE match (
       id            TEXT PRIMARY KEY,
       seed          INTEGER NOT NULL,
       a_id          TEXT NOT NULL,
       b_id          TEXT NOT NULL,
       a_slot        TEXT NOT NULL,
       b_slot        TEXT NOT NULL,
       winner        TEXT,
       reason        TEXT,
       seconds       REAL,
       constants_version TEXT NOT NULL,
       a_delta       REAL NOT NULL DEFAULT 0,
       b_delta       REAL NOT NULL DEFAULT 0,
       a_rating_after REAL,
       b_rating_after REAL,
       result_json   TEXT,
       verified      INTEGER NOT NULL DEFAULT 0,
       started_at    INTEGER NOT NULL,
       ended_at      INTEGER,
       kind          TEXT NOT NULL DEFAULT 'ladder'
     )`,
    `CREATE INDEX match_a ON match(a_id, started_at DESC)`,
    `CREATE INDEX match_b ON match(b_id, started_at DESC)`,
    `CREATE TABLE adaptation (
       id            TEXT PRIMARY KEY,
       creature_id   TEXT NOT NULL REFERENCES creature(id),
       at            INTEGER NOT NULL,
       kind          TEXT NOT NULL,
       summary       TEXT NOT NULL,
       before_json   TEXT,
       after_json    TEXT,
       score_before  REAL,
       score_after   REAL,
       accepted      INTEGER NOT NULL DEFAULT 1
     )`,
    `CREATE INDEX adaptation_creature ON adaptation(creature_id, at DESC)`,
    `CREATE TABLE job (
       id            TEXT PRIMARY KEY,
       account_id    TEXT,
       kind          TEXT NOT NULL,
       state         TEXT NOT NULL,
       stage         TEXT,
       progress      REAL NOT NULL DEFAULT 0,
       creature_id   TEXT,
       payload_json  TEXT,
       error_code    TEXT,
       error_msg     TEXT,
       cost_usd      REAL NOT NULL DEFAULT 0,
       attempts      INTEGER NOT NULL DEFAULT 0,
       created_at    INTEGER NOT NULL,
       updated_at    INTEGER NOT NULL
     )`,
    `CREATE INDEX job_account ON job(account_id, created_at DESC)`,
    `CREATE TABLE spend (
       id            INTEGER PRIMARY KEY AUTOINCREMENT,
       account_id    TEXT,
       job_id        TEXT,
       day           TEXT NOT NULL,
       month         TEXT NOT NULL,
       usd           REAL NOT NULL,
       accepted      INTEGER NOT NULL,
       at            INTEGER NOT NULL
     )`,
    `CREATE INDEX spend_day ON spend(day)`,
    `CREATE INDEX spend_account_day ON spend(account_id, day)`,
    `CREATE TABLE event (
       id            INTEGER PRIMARY KEY AUTOINCREMENT,
       at            INTEGER NOT NULL,
       account_id    TEXT,
       name          TEXT NOT NULL,
       props_json    TEXT
     )`,
    `CREATE INDEX event_name ON event(name, at)`,
    `CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
  ],
  /*
   * 1 -> 2: знает ли мозг свой набор умений.
   *
   * Грамматика §8 пришла позже эталонных мозгов. Мозг, написанный против
   * четырёх захардкоженных умений, не умеет назвать `k1` — он будет звать
   * `laser`, получать отказ `unknown` и стоять. Выдать ему набор из
   * грамматики значит не «дать умения», а «отобрать все».
   *
   * Флаг честнее, чем догадка по дате: он говорит про КОНКРЕТНЫЙ мозг, а не
   * про эпоху. Мозг, сгенерированный по промпту с китом, ставит 1; мозг,
   * взятый из brains/ при заселении, остаётся 0 и дерётся эталонным набором.
   */
  [
    `ALTER TABLE creature ADD COLUMN kit_active INTEGER NOT NULL DEFAULT 0`,
  ],

  /*
   * Тело существа как ИСХОДНИК, а не как ссылка на файл.
   *
   * `body_ref` был ссылкой на один из двух наших файлов, и этого хватало,
   * пока тела было два. Сгенерированное тело — тысяча строк кода, у которых
   * нет и не будет файла на диске: они принадлежат конкретному существу
   * (F2: новое существо — новый body_ref) и живут ровно столько, сколько оно.
   *
   * Хранится ДВА варианта, и это не дублирование.
   *   body_source — то, что написала модель. Это то, что показывают автору,
   *     это то, что уходит на ремонт следующей генерации, и это то, что
   *     переживёт смену правил допуска.
   *   body_safe — тот же код после разбора и разметки топливом
   *     (`sandbox/bodyrules.js`). Только он уезжает в браузер.
   * Пересобирать body_safe из body_source на каждый запрос значило бы
   * разбирать тысячу строк акорном на каждого зрителя каждого боя.
   *
   * Пустые оба — существо носит тело архетипа, как все, кто был до.
   */
  [
    `ALTER TABLE creature ADD COLUMN body_source TEXT`,
    `ALTER TABLE creature ADD COLUMN body_safe TEXT`,
  ],

  /*
   * СНИМОК НАБОРОВ НА МОМЕНТ БОЯ.
   *
   * Повтор боя пересобирался из ТЕКУЩЕЙ строки существа. Набор при этом
   * меняется бесплатно и мгновенно (D3, §7.2·2) — то есть между боем и его
   * просмотром игрок мог поменять умения одним кликом, и повтор показывал
   * другой бой: другие умения, другой исход, другая длительность. Рядом при
   * этом стоял записанный результат и записанная дельта рейтинга, которые
   * повтору противоречили.
   *
   * A3 требует, чтобы сервер пересчитывал результат из сида. Пересчёт честен
   * ровно настолько, насколько неизменны ВХОДЫ, и набор — такой же вход, как
   * сид. Поэтому он хранится вместе с матчем.
   *
   * Старые матчи остаются с NULL и продолжают повторяться по текущей строке —
   * иначе их пришлось бы объявить непросматриваемыми задним числом.
   */
  [
    `ALTER TABLE match ADD COLUMN kits_json TEXT`,
  ],
  /*
   * VFX уровня 1: декорация, написанная моделью (§9.2).
   *
   * Отдельная колонка, а не поле внутри `kit_json`, по двум причинам. Набор
   * умений — вход симуляции, и его снимок хранится вместе с матчем ради
   * побитового повтора (A2); VFX на симуляцию не влияет НИКОГДА, и подмешать
   * его к входу значило бы сделать вид, что влияет. Вторая: набор игрок
   * меняет свободно и мгновенно (F10), а декорация пишется один раз на
   * рождении — у них разная жизнь.
   *
   * NULL значит «декорации нет» и это законное состояние: read-kit рисуется
   * всегда, и существо без IR выглядит ровно как выглядели все до этой
   * колонки.
   */
  [
    `ALTER TABLE creature ADD COLUMN vfx_json TEXT`,
  ],
  /*
   * КОД СТАДИИ, А НЕ ТОЛЬКО ЕЁ РУССКОЕ ИМЯ.
   *
   * Сервер писал в `stage` готовую русскую строку («модель пишет мозг»), а
   * экран ожидания сопоставлял её своими регекспами. Одна из них не совпала:
   * клиент искал `/мозг пишет/`, сервер писал «модель пишет мозг» — порядок
   * слов другой. Полоса прогресса на САМОЙ ДЛИННОЙ стадии откатывалась назад
   * на шаг и стояла там несколько минут, то есть ровно в окне наибольшего
   * отвала игра показывала, что дела идут хуже.
   *
   * Чинить регексп бессмысленно: следующая формулировка сломает его снова, а
   * заметит это игрок. Код стадии — то, что не зависит от формулировки.
   */
  [
    `ALTER TABLE job ADD COLUMN stage_code TEXT`,
  ],
  /*
   * ЧТО ПОШЛО НЕ ТАК ПРИ РОЖДЕНИИ — ИГРОКУ, А НЕ ТОЛЬКО В АНАЛИТИКУ.
   *
   * §5.1 запрещает молчаливую подмену: если существо сделала не та модель,
   * которую выбрал игрок, или тело не собралось и существо носит тело
   * архетипа, — это надо сказать. Конвейер такие строки честно собирал и
   * возвращал, а дальше они попадали ровно в одно место: в поле `fallback: 1`
   * события аналитики. Игрок не узнавал ничего.
   *
   * Колонка, а не поле в `job`: заметка описывает СУЩЕСТВО и живёт столько же,
   * сколько оно. Задание удаляется вместе с историей генераций, а «носит тело
   * архетипа» остаётся правдой всё время, пока существо носит это тело.
   */
  [
    `ALTER TABLE creature ADD COLUMN birth_note TEXT`,
  ],
  /*
   * ОСЬ «ТРИГГЕР» СНЯТА — поле вычищается из сохранённых наборов.
   *
   * Умение больше не решает, когда ему сработать: его всегда вызывает мозг
   * (см. комментарий в `src/skills/registry.js`). Компиляция лишнее поле
   * игнорирует, то есть данные и так совместимы, — но мёртвое поле в базе
   * через полгода прочитают как живое.
   *
   * `json_remove` есть в SQLite с 3.9; если его нет, миграция упадёт громко,
   * и это правильнее, чем оставить половину строк вычищенными.
   */
  [
    `UPDATE creature SET kit_json = (
       SELECT json_group_array(json_remove(value, '$.trigger'))
       FROM json_each(creature.kit_json)
     ) WHERE kit_json IS NOT NULL AND kit_json LIKE '%trigger%'`,
    /*
     * Снимок наборов матча: `json_remove` тут не годится — это ВЛОЖЕННЫЙ
     * объект вида {"<сторона>": {"k1": {...}}}, и путь к полю зависит от
     * имён умений. (Строки той поры ключуются прежними именами сторон —
     * `octopus`/`gorilla`; на чтении их переводит `sideKey` в `creatures.js`,
     * а сама миграция имён не касается.)
     *
     * Раньше здесь стояла замена ОДНОГО литерала `"trigger":"active",` — то
     * есть `on_low_hp`, `on_enemy_cast` и обратный порядок ключей оставались
     * в базе. Половина чистки хуже отсутствия: поле выглядит вычищенным.
     *
     * Теперь снимаются все пять значений в обоих положениях (с запятой до и
     * после). Поле мёртвое: компиляция его не читает, и повтор старых матчей
     * от этого не меняется.
     */
    `UPDATE match SET kits_json = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(kits_json, '"trigger":"active",', ''), ',"trigger":"active"', ''), '"trigger":"on_hit_taken",', ''), ',"trigger":"on_hit_taken"', ''), '"trigger":"on_hit_dealt",', ''), ',"trigger":"on_hit_dealt"', ''), '"trigger":"on_low_hp",', ''), ',"trigger":"on_low_hp"', ''), '"trigger":"on_enemy_cast",', ''), ',"trigger":"on_enemy_cast"', '')
       WHERE kits_json IS NOT NULL AND kits_json LIKE '%trigger%'`,
  ],
  /*
   * РАЗМЕР СУЩЕСТВА — часть его характеристик, а не картинки.
   *
   * Решение основателя (30.08): размер выбирает модель в диапазоне вдвое, и у
   * него есть цена — мелкий теряет здоровье, но быстрее и по нему труднее
   * попасть (см. `statsFor` в core/config.js).
   *
   * NULL значит «единица» — так выглядят все существа, рождённые до этого
   * решения, и менять их задним числом нельзя: их рейтинг заработан при
   * прежних характеристиках.
   */
  [
    `ALTER TABLE creature ADD COLUMN size REAL`,
    /* Размер обоих на момент боя — тем же правилом, что и наборы: он вход
       матча, значит без него повтор не побитовый (A2). */
    `ALTER TABLE match ADD COLUMN sizes_json TEXT`,
    /* Телосложение вместо архетипа: у существа свои числа, у матча — те,
       которыми дрались. Старые колонки остаются пустыми и не читаются: сносить
       их миграцией дороже, чем игнорировать. */
    `ALTER TABLE creature ADD COLUMN build_json TEXT`,
    `ALTER TABLE match ADD COLUMN builds_json TEXT`,
  ],
  /*
   * НОВЫЙ ШАГ ДОБАВЛЯЕТСЯ В КОНЕЦ, а не в середину.
   *
   * Версия схемы здесь — это ИНДЕКС в этом списке. Шаг, вставленный между
   * существующими, у уже обновлённых баз не выполнится никогда: их версия уже
   * больше. Ровно это я и сделал с `body_draws` — и `ensure` громко про это
   * сказал: «миграции разошлись с кодом». Самопочинка спасла, но правило
   * простое, и стоит оно ноль: только в конец.
   */
  [
    /* Цена показа тела — число вызовов отрисовки. Считается лениво, при первой
       выдаче тела браузеру, и запоминается: строить тело на каждый запрос
       дорого, а не строить нельзя — потолок появился позже самих тел. */
    `ALTER TABLE creature ADD COLUMN body_draws INTEGER`,
  ],
  /*
   * Токен воркера коллеги (D173).
   *
   * Здесь НЕТ и не будет колонки под токен Anthropic: учётные данные Claude не
   * покидают машину коллеги, и хранить их нам прямо запрещено. `token` —
   * СВОЙ секрет, выданный Airena, дающий право забирать задания своего
   * аккаунта и больше ничего.
   *
   * Лежит в базе, а не в памяти, ровно по одной причине: токен хранит тот, кто
   * НЕ перезапускается. Держи мы его в памяти, каждый деплой молча отвязывал
   * бы всех коллег, и узнали бы они об этом не сообщением, а пропавшей кнопкой.
   *
   * `ON DELETE CASCADE` — потому что слияние гостя в аккаунт удаляет строку
   * гостя, и токен, переживший свой аккаунт, это право забирать задания,
   * которых больше некому принадлежать.
   */
  [
    `CREATE TABLE worker_token (
       token         TEXT PRIMARY KEY,
       account_id    TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
       hostname      TEXT,
       created_at    INTEGER NOT NULL,
       last_seen_at  INTEGER NOT NULL
     )`,
    `CREATE INDEX worker_token_account ON worker_token(account_id)`,
  ],

  /*
   * ── ABILITY ICONS (docs/REDESIGN.md §8.4) ───────────────────────────────
   *
   * One generated glyph per ability slot, stored as bytes next to the creature
   * it belongs to.
   *
   * IN THE DATABASE, NOT ON DISK, and that is the whole point of the row. An
   * icon is derived data with a cost: it takes a paid image call to make and it
   * is meaningless without the creature it describes. Files in a directory
   * would outlive their creature, would not travel with `tools/backup.mjs`, and
   * would need a second cleanup path that nobody would ever write. A row is
   * deleted by the same cascade that deletes everything else.
   *
   * The primary key is `(creature_id, slot)` so regenerating a slot REPLACES
   * it: the ability changed, the old glyph is a lie, and two rows for one slot
   * would leave the reader guessing which is current.
   *
   * `prompt` is kept because it is the only record of what was asked for. When
   * a batch comes back photographic instead of monoline, the fix starts by
   * reading what we actually sent, not by guessing at the template.
   */
  [
    `CREATE TABLE icon (
       creature_id   TEXT NOT NULL REFERENCES creature(id) ON DELETE CASCADE,
       slot          INTEGER NOT NULL,
       mime          TEXT NOT NULL,
       bytes         BLOB NOT NULL,
       prompt        TEXT,
       created_at    INTEGER NOT NULL,
       PRIMARY KEY (creature_id, slot)
     )`,
  ],

  /*
   * ── WHICH REFERENCE SET A KITLESS MIND WAS WRITTEN AGAINST ──────────────
   *
   * A creature with `kit_active = 0` has no grammar kit, so the sim hands it
   * the §1 fixture: `laser/blink/jump` or `smash/charge/jump`. Which of the
   * two it got was decided by the ARENA COLOUR (`referenceTagOf(side)` in
   * `src/core/config.js`), and the colour is the parity of the match seed —
   * that is, a coin flip. Its mind, meanwhile, was written against exactly one
   * of the two sets and calls those names by hand.
   *
   * So on half its fights a kitless creature perceived skills it had never
   * heard of, `api.ready('laser')` answered false forever, and it walked for
   * the whole match. Measured on 1200 live ladder rows: 335 of 2400 sides
   * never cast for this reason, and every zero-event double-KO on the ladder
   * is two such sides meeting each other.
   *
   * The tag is a property of the MIND, so it belongs on the creature's row.
   * Nullable on purpose: a creature with a grammar kit does not have one and
   * must not be given a fake, and a row whose tag was never inferred falls
   * back to reading its own `brain_source` at match time (`refTagOf` in
   * `arena-loop.js`) rather than to the colour.
   *
   * It travels with the fixture: when the hardcoded skills go, this goes.
   */
  [
    `ALTER TABLE creature ADD COLUMN reference_tag TEXT`,
  ],
  /*
   * 07.09, measured on a dev ladder of 296 000 matches (1.9 GB): every
   * `/api/session` counted today's matches with a full scan of `match`
   * (280 ms), and a creature's history ran the OR of two indexes into a
   * temporary sort (780 ms). SQLite is synchronous on the main thread, so
   * each of those held the 30 Hz broadcast pump for as long as it ran —
   * "the server lags". `ended_at` gets its own index for the day count and
   * the since-summary; the per-side indexes on `ended_at` serve the
   * history's ORDER BY without a temp b-tree.
   */
  [
    `CREATE INDEX match_ended ON match(ended_at)`,
    `CREATE INDEX match_a_ended ON match(a_id, ended_at DESC)`,
    `CREATE INDEX match_b_ended ON match(b_id, ended_at DESC)`,
  ],
  /*
   * An hour later, measured: the two per-side `ended_at` indexes made the
   * planner pick them for every `(a_id = ? OR b_id = ?) … ORDER BY
   * started_at DESC LIMIT n` query — the ladder's pairing window among them —
   * and then sort the creature's whole history in a temporary b-tree: 7.7 s
   * per call on the dev ladder, on the main thread, on every pairing tick;
   * localhost stopped answering. `match_a` / `match_b` (side, started_at
   * DESC) walk those queries in index order. The two indexes go; the plain
   * `match_ended` stays for the day count.
   */
  [
    `DROP INDEX IF EXISTS match_a_ended`,
    `DROP INDEX IF EXISTS match_b_ended`,
  ],
];

export function openDb(file = 'data/airena.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 4000');

  const at = db.prepare('PRAGMA user_version').get().user_version ?? 0;
  /*
   * МИГРАЦИИ ТОЛЬКО ДОПИСЫВАЮТСЯ В КОНЕЦ, И ЭТО НЕ СТИЛЬ.
   *
   * Версия — это ИНДЕКС в массиве. Вставленный в середину элемент сдвигает
   * все следующие, и база, уже прошедшая часть списка, новую вставку молча
   * пропускает: она считает, что версия выше.
   *
   * Поймано на живой базе: колонка `size` была добавлена в середину, версия
   * там уже была пройдена, `ALTER TABLE` не выполнился — и сервер поднялся,
   * а запрос упал на «no such column». Молча, потому что миграции не
   * проверяют, что получилось.
   */
  for (let v = at; v < MIGRATIONS.length; v++) {
    for (const stmt of MIGRATIONS[v]) {
      try {
        db.exec(stmt);
      } catch (e) {
        /*
         * «Колонка уже есть» — не ошибка, а след самопочинки.
         *
         * `ensure` ниже дописывает недостающие колонки в базы, чью версию
         * миграция обогнала. После этого шаг, добавленный в конец списка,
         * встречает свою колонку уже на месте и падает на `duplicate column
         * name`. Поймано на живой базе сразу после того, как я перенёс
         * `body_draws` из середины списка в конец — то есть на правильном
         * действии.
         *
         * Пропускается ТОЛЬКО этот случай и только для `ADD COLUMN`: любая
         * другая ошибка миграции по-прежнему роняет запуск, потому что база с
         * наполовину применённой схемой хуже упавшего сервера.
         */
        const dup = /duplicate column name/i.test(String(e.message)) && /ADD COLUMN/i.test(stmt);
        if (!dup) throw e;
      }
    }
    db.exec(`PRAGMA user_version = ${v + 1}`);
  }

  /*
   * ПОСЛЕДНЯЯ ПРОВЕРКА: СХЕМА ТАКАЯ, КАК ОБЕЩАНО.
   *
   * Номер версии говорит, сколько миграций ПРОБЕЖАЛО, и ничего не говорит о
   * том, что получилось. Достаточно один раз вставить миграцию в середину
   * списка — и база, уже прошедшая этот номер, пропустит её молча.
   *
   * Так и случилось: колонка `size` не появилась, сервер поднялся как ни в
   * чём не бывало, а первый же запрос упал на «no such column» — то есть
   * ошибка вылезла у игрока, а не при старте.
   *
   * Здесь схема проверяется по факту и недостающие колонки досоздаются. Это
   * не замена миграциям: они по-прежнему единственный способ менять схему.
   * Это страховка от рассинхронизации, и она обязана быть громкой — что
   * именно досоздали, печатается.
   */
  const ensure = (table, column, type) => {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (has) return null;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    return `${table}.${column}`;
  };
  /**
   * Снести колонку, если она ещё есть.
   *
   * Симметрична `ensure` и так же идемпотентна: нет колонки — нечего делать.
   * Отдельная функция, а не строка в списке миграций, потому что список
   * миграций исполняется один раз на новой базе, а это надо делать и на
   * старой, где колонка уже стоит.
   */
  /**
   * The same safety net, one level up: a whole TABLE that should exist.
   *
   * `ensure` covers a migration that added a column and was skipped. A
   * migration that added a table can be skipped exactly the same way — the
   * version is already past it — and then every read of that table throws "no
   * such table" at the first request instead of at startup. Idempotent by
   * construction: the statement carries its own IF NOT EXISTS.
   */
  const ensureTable = (table, ddl) => {
    const has = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name=?").get(table).n;
    if (has) return null;
    db.exec(ddl);
    return `table ${table}`;
  };
  const dropColumn = (table, column) => {
    const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
    if (!has) return null;
    db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
    return `${table}.${column} dropped`;
  };
  const repaired = [
    ensure('creature', 'size', 'REAL'),
    ensure('creature', 'body_draws', 'INTEGER'),
    ensure('creature', 'birth_note', 'TEXT'),
    ensure('creature', 'vfx_json', 'TEXT'),
    ensure('match', 'sizes_json', 'TEXT'),
    ensure('creature', 'build_json', 'TEXT'),
    ensure('match', 'builds_json', 'TEXT'),
    /*
     * ── КОЛОНКА ВИДА СНОСИТСЯ, А НЕ ЗАБЫВАЕТСЯ ──────────────────────────────
     *
     * Требование основателя: «никаких архетипов». Оставить колонку и
     * перестать её читать — это не «нет архетипов», это «архетипы есть, но мы
     * договорились не смотреть»; следующий читатель схемы решит иначе, и
     * особенно уверенно решит модель, которой эту схему покажут.
     *
     * `DROP COLUMN` в SQLite есть с 3.35, а NOT NULL со старой колонки иначе
     * не снять вовсе. Данные в ней ничего не значат: существа из прошлого
     * мира дерутся телом по умолчанию, а новые пишут своё телосложение.
     */
    dropColumn('creature', 'archetype'),
    ensure('match', 'kits_json', 'TEXT'),
    ensure('creature', 'reference_tag', 'TEXT'),
    ensure('job', 'stage_code', 'TEXT'),
    ensureTable('icon', `CREATE TABLE IF NOT EXISTS icon (
       creature_id   TEXT NOT NULL REFERENCES creature(id) ON DELETE CASCADE,
       slot          INTEGER NOT NULL,
       mime          TEXT NOT NULL,
       bytes         BLOB NOT NULL,
       prompt        TEXT,
       created_at    INTEGER NOT NULL,
       PRIMARY KEY (creature_id, slot)
     )`),
  ].filter(Boolean);
  /*
   * ТА ЖЕ СТРАХОВКА, НО ДЛЯ ДАННЫХ.
   *
   * Снятая ось «триггер» (D102) чистится миграцией — а миграция, вставленная
   * в середину списка, на уже мигрированной базе не выполняется: версия выше.
   * Ровно это и произошло: в снимках матчей осталось поле, которого в
   * грамматике больше нет.
   *
   * Условие `LIKE '%trigger%'` делает чистку идемпотентной и бесплатной:
   * после первого прохода она не находит ни строки.
   */
  const dirty = db.prepare("SELECT count(*) AS n FROM match WHERE kits_json LIKE '%trigger%'").get().n;
  if (dirty) {
    db.exec(`UPDATE match SET kits_json = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(kits_json, '"trigger":"active",', ''), ',"trigger":"active"', ''), '"trigger":"on_hit_taken",', ''), ',"trigger":"on_hit_taken"', ''), '"trigger":"on_hit_dealt",', ''), ',"trigger":"on_hit_dealt"', ''), '"trigger":"on_low_hp",', ''), ',"trigger":"on_low_hp"', ''), '"trigger":"on_enemy_cast",', ''), ',"trigger":"on_enemy_cast"', '')
             WHERE kits_json IS NOT NULL AND kits_json LIKE '%trigger%'`);
    console.warn(`  cleared the dead trigger field out of ${dirty} match snapshots`);
  }

  if (repaired.length) {
    console.warn(`  the schema was incomplete, created: ${repaired.join(', ')}`);
    console.warn('  that means the migrations drifted from the code — check the order in MIGRATIONS.');
  }
  return db;
}

/** Ключ-значение поверх той же БД — сезон, курсоры, флаги. */
export function kv(db) {
  const get = db.prepare('SELECT v FROM kv WHERE k = ?');
  const set = db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v');
  return {
    get(k, dflt = null) {
      const row = get.get(k);
      if (!row) return dflt;
      try { return JSON.parse(row.v); } catch { return dflt; }
    },
    set(k, v) { set.run(k, JSON.stringify(v)); },
  };
}
