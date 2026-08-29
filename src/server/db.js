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
       archetype     TEXT NOT NULL,
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
];

export function openDb(file = 'data/airena.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 4000');

  const at = db.prepare('PRAGMA user_version').get().user_version ?? 0;
  for (let v = at; v < MIGRATIONS.length; v++) {
    for (const stmt of MIGRATIONS[v]) db.exec(stmt);
    db.exec(`PRAGMA user_version = ${v + 1}`);
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
