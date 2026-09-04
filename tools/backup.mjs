#!/usr/bin/env node
/**
 * СНИМОК БАЗЫ БЕЗ ОСТАНОВКИ СЕРВЕРА.
 *
 * ── ПОЧЕМУ НЕ `cp` ───────────────────────────────────────────────────────────
 *
 * База открыта в режиме WAL (`src/server/db.js`), и это значит, что часть
 * свежих страниц лежит НЕ в `airena.db`, а в `airena.db-wal`. Обычное
 * копирование файла даёт либо базу без последних матчей, либо — если сервер
 * писал прямо в этот момент — базу, которую SQLite при открытии назовёт
 * повреждённой. Оба исхода замечаешь ровно тогда, когда бэкап понадобился.
 *
 * `VACUUM INTO` делает снимок в рамках транзакции: он видит согласованное
 * состояние, дожидается своей очереди по `busy_timeout` и попутно сжимает
 * файл. Живому серверу он не мешает — писателя не блокирует надолго.
 *
 * ── СКОЛЬКО ЭТО ВЕСИТ ────────────────────────────────────────────────────────
 *
 * Замерено на рабочей базе: 120 067 матчей = 736 МБ, то есть около 5 КБ на
 * матч (`result_json` и `kits_json` — почти всё). Правила удаления старых
 * матчей в продукте нет, так что база растёт линейно с числом боёв: это надо
 * знать заранее, а не выяснять, когда кончится диск.
 *
 *   node tools/backup.mjs                          снимок рядом с базой
 *   node tools/backup.mjs --out=/backup --keep=7   и удалить всё, кроме семи
 *   node tools/backup.mjs --db=/data/airena.db
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
};

const DB = resolve(arg('db', process.env.AIRENA_DB || 'data/airena.db'));
const OUT = resolve(arg('out', join(dirname(DB), 'backup')));
const KEEP = Number(arg('keep', 7));

/* Имя снимка — время в UTC, отсортированное лексикографически. Двоеточий нет:
   они законны в ext4 и незаконны в половине мест, куда снимок потом уедет. */
const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
const dest = join(OUT, `airena-${stamp}.db`);

mkdirSync(OUT, { recursive: true });

let db;
try {
  db = new DatabaseSync(DB, { readOnly: true });
} catch (e) {
  console.error(`\n  не открыть базу ${DB}: ${e.message}\n`);
  process.exit(1);
}

/* Ждать своей очереди, а не падать: снимок снимается на живом сервере, и
   писатель в этот момент вполне может держать блокировку. */
db.exec('PRAGMA busy_timeout = 30000');

const started = process.hrtime.bigint();
try {
  /* Путь подставляется литералом, потому что `VACUUM INTO` не принимает
     параметр. Кавычки удваиваются — это единственная защита, которая тут
     возможна и которой достаточно: строку задаёт админ на своём же сервере. */
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
} catch (e) {
  console.error(`\n  снимок не снят: ${e.message}\n`);
  process.exit(1);
} finally {
  db.close();
}

const ms = Number(process.hrtime.bigint() - started) / 1e6;
const mb = statSync(dest).size / 1024 / 1024;
console.log(`\n  снимок: ${dest}`);
console.log(`  ${mb.toFixed(1)} МБ за ${(ms / 1000).toFixed(1)} с`);

/* Ротация. Удаляются ТОЛЬКО файлы этого формата имени: каталог снимков рано
   или поздно окажется общим с чем-нибудь ещё, и «удали самые старые файлы в
   папке» — это как раз тот бэкап, который однажды удалит не то. */
if (Number.isFinite(KEEP) && KEEP > 0) {
  const mine = readdirSync(OUT)
    .filter((f) => /^airena-\d{4}-\d{2}-\d{2}T[\d-]+\.db$/.test(f))
    .sort()
    .reverse();
  const doomed = mine.slice(KEEP);
  for (const f of doomed) rmSync(join(OUT, f), { force: true });
  console.log(`  храню ${Math.min(mine.length, KEEP)}, удалил ${doomed.length}\n`);
} else {
  console.log('');
}
