#!/usr/bin/env node
/**
 * Вывести из игры существ со стихией «время».
 *
 *   node tools/runs/retire-time.mjs            показать, кого выведет
 *   node tools/runs/retire-time.mjs --apply    вывести
 *   AIRENA_DB=data/vfx-stand.db node ...       другая база (стенд НЕ трогаем)
 *
 * ЗАЧЕМ. 04.09 флаг `unreleased` сняли сразу с пяти стихий, включая время;
 * заказа про время не было, а обратный был: «я просил отключить время — чтобы
 * времени вообще не было в скиллах, чтобы никто не мог создать время»
 * (основатель). Флаг вернули (`src/skills/registry.js`), и наружу время
 * больше не выдаётся — но четверо, кто успел родиться с ним, уже лежали в
 * `data/airena.db` и продолжали выходить в трансляцию: `arena-loop` берёт
 * бойцов по `state = 'active'`, а `validateKit` спрашивают только на HTTP.
 *
 * ЧТО ДЕЛАЕТСЯ, А ЧТО НЕТ. Ровно то же, что в `tools/retire.mjs`:
 * `state = 'retired'`, строкой, а не удалением. Бои, рейтинг и история
 * остаются — на них ссылаются ссылки на матчи и журнал; на счету четверых
 * 3951 бой на момент прогона, и стирать их значило бы порвать чужие ссылки
 * ради чистоты таблицы. Существо просто перестаёт выходить на арену.
 *
 * ВЫВЕДЕНЫ 04.09: ХРОНОМЕТР (c_3d990e92-7b6, 1093 боя, все три умения на
 * времени), ХРОНОГРОМ (c_c314eeb0-2b1, 1028), ЧАСОВЩИК-ГРОМОВЕРЖЕЦ
 * (c_c70e1e4a-f8a, 931) и ЧАСОВЩИК-ГРОМОВЕРЖЕЦ F (c_a4e2d394-5b4, 899) —
 * у последних трёх временем была одна зона из трёх умений. Повторный прогон
 * печатает «выводить некого»: это и есть проверка.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫМ СКРИПТОМ, А НЕ РУКАМИ В sqlite. Замер и правка, чей
 * способ снятия потерян, через месяц неотличимы от выдумки (`tools/runs`).
 * Здесь записано, ПО ЧЕМУ отбирали: по разобранному `kit_json`, а не по
 * `LIKE '%time%'` — под это «время» попадает любое имя и любой комментарий.
 */

import { openDb } from '../../src/server/db.js';

const APPLY = process.argv.includes('--apply');
const db = openDb(process.env.AIRENA_DB || 'data/airena.db');

const rows = db.prepare(`SELECT id, name, state, wins, losses, draws, fights, kit_json
                         FROM creature WHERE state = 'active'`).all();

const doomed = [];
for (const r of rows) {
  let kit = [];
  try { kit = JSON.parse(r.kit_json || '[]'); } catch { kit = []; }
  const slots = kit.map((s, i) => (s?.element === 'time' ? i + 1 : 0)).filter(Boolean);
  if (slots.length) doomed.push({ ...r, slots });
}

console.log(`\n  живых существ в базе: ${rows.length}; со стихией «время»: ${doomed.length}\n`);
for (const r of doomed) {
  console.log(`  ${r.id}  ${r.name.padEnd(24)} боёв ${String(r.fights).padStart(5)}`
    + `  побед ${String(r.wins).padStart(4)}  умения со временем: ${r.slots.join(', ')}`);
}
if (!doomed.length) { console.log('\n  выводить некого\n'); process.exit(0); }

if (!APPLY) {
  console.log(`\n  вывел бы ${doomed.length}; чтобы сделать: node tools/runs/retire-time.mjs --apply\n`);
  process.exit(0);
}

const stmt = db.prepare("UPDATE creature SET state = 'retired', updated_at = ? WHERE id = ?");
for (const r of doomed) stmt.run(Date.now(), r.id);
console.log(`\n  выведено из игры: ${doomed.map((r) => r.name).join(', ')}`);
console.log('  бои, рейтинг и история сохранены — существа просто не выходят на арену.\n');
