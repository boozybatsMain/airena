/**
 * Убрать из витрины существ, которыми нельзя попасть.
 *
 *   node tools/retire.mjs            показать, кого бы убрал
 *   node tools/retire.mjs --apply    убрать
 *
 * ЗАЧЕМ. `viability` подключён к рождению (D80): библиотечное существо с
 * негодным набором больше не создаётся. Но правило применили только к
 * новоприбывшим, а те, кто УЖЕ лежит, остались — и продолжают попадать и в
 * витрину, и в спарринг-партнёры, и в стартовую тройку гостя.
 *
 * Цифры на момент написания: два библиотечных существа с нулём попаданий за
 * шесть пробных боёв и нулём побед за 683 и 1076 настоящих. Это ровно тот
 * случай, ради которого §7.3 и D80 писались: витрина не имеет права
 * показывать бой, в котором ничего не происходит.
 *
 * ЧТО ДЕЛАЕТСЯ, А ЧТО НЕТ. Существо не удаляется: `state = 'retired'`. Его
 * бои, рейтинг и история остаются — на них ссылаются ссылки на матчи и
 * журнал. Оно просто перестаёт выходить на арену.
 *
 * СУЩЕСТВА ИГРОКОВ НЕ ТРОГАЮТСЯ НИКОГДА. Отказать человеку в его замысле мы
 * не вправе (D80): он видит предупреждение и меняет набор бесплатно и
 * мгновенно. Правило про витрину — про нас.
 */

import { openDb } from '../src/server/db.js';
import { viability } from '../src/server/forge/viability.js';

const APPLY = process.argv.includes('--apply');
const db = openDb(process.env.AIRENA_DB || 'data/airena.db');

const rows = db.prepare(`SELECT id, name, kit_json, archetype, wins, losses, draws, fights
                         FROM creature
                         WHERE is_library = 1 AND state = 'active' AND kit_active = 1`).all();

console.log(`\n  библиотечных с боевым набором: ${rows.length}\n`);
const doomed = [];
for (const r of rows) {
  let kit = [];
  try { kit = JSON.parse(r.kit_json || '[]'); } catch { kit = []; }
  const v = await viability(kit, r.archetype);
  const line = `  ${r.name.padEnd(20)} побед ${String(r.wins).padStart(4)}/${String(r.fights).padStart(5)}`
    + `  → замер: попаданий ${String(v.hits).padStart(3)}, побед ${v.wins}/${v.rounds}`;
  if (v.ok) { console.log(`${line}   годен`); continue; }
  console.log(`${line}   ✗ ${v.why}`);
  doomed.push(r);
}

if (!doomed.length) { console.log('\n  негодных нет\n'); process.exit(0); }

if (!APPLY) {
  console.log(`\n  убрал бы ${doomed.length}; чтобы сделать: node tools/retire.mjs --apply\n`);
  process.exit(0);
}

const stmt = db.prepare("UPDATE creature SET state = 'retired', updated_at = ? WHERE id = ?");
for (const r of doomed) stmt.run(Date.now(), r.id);
console.log(`\n  убрано из витрины: ${doomed.map((r) => r.name).join(', ')}`);
console.log('  бои, рейтинг и история сохранены — существа просто не выходят на арену.\n');
