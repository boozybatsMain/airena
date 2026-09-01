/**
 * Поставить существу тело из файла — дев-инструмент.
 *
 * Нужен для того, что иначе не проверяется без денег: весь путь тела от базы
 * до кадра (хранение → маршрут → затенённая сборка в браузере → подмена тела
 * на старте боя → позы). Генерация — только первый его шаг, и самый дорогой;
 * остальные пять к модели отношения не имеют и обязаны проверяться отдельно.
 *
 *   node tools/bodyinstall.mjs c_1234abcd forge/built-oct.js
 *   node tools/bodyinstall.mjs --list
 *   node tools/bodyinstall.mjs c_1234abcd --clear
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb } from '../src/server/db.js';
import { analyseBody } from '../src/server/sandbox/bodyrules.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/* Через `openDb`, а не через DatabaseSync напрямую: миграции живут там, и
   инструмент, открывающий базу в обход них, работает ровно до первой новой
   колонки — а колонки тела и есть новые. */
const db = openDb(join(ROOT, 'data/airena.db'));
const [who, what] = process.argv.slice(2);

if (!who || who === '--list') {
  const rows = db.prepare(`SELECT id, name, archetype, body_safe IS NOT NULL AS own
    FROM creature WHERE state = 'active' ORDER BY own DESC, rating DESC LIMIT 20`).all();
  console.log('\n  существо        имя             архетип   своё тело');
  for (const r of rows) {
    console.log(`  ${r.id}  ${String(r.name).padEnd(14)} ${r.archetype.padEnd(9)} ${r.own ? 'да' : '—'}`);
  }
  console.log('');
  process.exit(0);
}

if (what === '--clear') {
  db.prepare('UPDATE creature SET body_source = NULL, body_safe = NULL WHERE id = ?').run(who);
  console.log(`  ${who}: тело снято, существо снова носит тело архетипа`);
  process.exit(0);
}

const src = readFileSync(join(ROOT, what), 'utf8');
const a = analyseBody(src);
if (!a.ok) {
  console.log(`\n  ${what} не проходит стены:\n`);
  for (const p of a.problems.slice(0, 8)) console.log(`    ${p.message}${p.at ? ` @${p.at}` : ''}`);
  console.log('');
  process.exit(1);
}
const r = db.prepare('UPDATE creature SET body_source = ?, body_safe = ? WHERE id = ?').run(src, a.source, who);
if (!r.changes) { console.log(`  нет существа ${who}`); process.exit(1); }
console.log(`  ${who}: тело из ${what} — ${src.length} символов исходника, ${a.source.length} после разметки`);
