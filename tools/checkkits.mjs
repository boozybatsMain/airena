/**
 * Гейт: каждый СОХРАНЁННЫЙ набор обязан быть законен по текущей грамматике.
 *
 * Зачем это отдельный инструмент. Цены атомов — не константа, а результат
 * замера: `tools/kitbalance.mjs` показывает, что лечение сильнее всех, цену
 * поднимают, и в этот момент каждое уже созданное существо, чей набор стоял
 * впритык к бюджету, становится НЕЗАКОННЫМ. Сервер пересчитывает бюджет перед
 * допуском к матчу (A3), то есть узнает об этом в худший момент — когда игрок
 * нажал «в бой». Существо просто перестанет драться, и никто не свяжет это с
 * правкой прайса, сделанной три дня назад.
 *
 * Поэтому связь делается здесь и заранее: правка цены обязана сопровождаться
 * прогоном этого файла, и он называет поимённо тех, кого сломал.
 *
 *   node tools/checkkits.mjs
 *
 * Чинить автоматически он не умеет и не должен: молча переписать набор игрока —
 * это отобрать у него выбор. Правильных выходов два, и оба принимает человек:
 * вернуть цену обратно или показать игроку экран «набор больше не проходит по
 * бюджету, вот что изменилось». Инструмент называет пострадавших, решение — не
 * его дело.
 */

import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileKit } from '../src/skills/compile.js';
import { KIT_BUDGET, SKILL_BUDGET, costOf, validateSkill } from '../src/skills/registry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const db = new DatabaseSync(join(ROOT, 'data/airena.db'));

const rows = db.prepare('SELECT id, name, kit_json FROM creature').all();
console.log(`\n  ${rows.length} существ, бюджет: умение ≤ ${SKILL_BUDGET}, набор ≤ ${KIT_BUDGET}\n`);

let bad = 0; let empty = 0;
for (const r of rows) {
  let kit;
  try { kit = JSON.parse(r.kit_json); } catch { kit = null; }
  if (!Array.isArray(kit) || !kit.length) { empty++; continue; }

  const problems = [];
  let total = 0;
  for (const s of kit) {
    const c = costOf(s);
    total += c;
    const v = validateSkill(s);
    if (v.length) problems.push(`${s.delivery}:${(s.effects || []).join('+')} — ${v[0]}`);
    else if (c > SKILL_BUDGET) problems.push(`${s.delivery}:${(s.effects || []).join('+')} — ${c} > ${SKILL_BUDGET}`);
  }
  if (total > KIT_BUDGET) problems.push(`набор ${total} > ${KIT_BUDGET}`);
  const built = compileKit(kit);
  if (built.problems.length) problems.push(...built.problems);

  if (problems.length) {
    bad++;
    console.log(`  ✗ ${String(r.id).padEnd(10)} ${(r.name || '—').padEnd(18)} ${problems.join('; ')}`);
  }
}

console.log(`\n  без набора: ${empty}  ·  незаконных: ${bad}`);
if (bad) {
  console.log('  ПРАВКА ЦЕН СЛОМАЛА СУЩЕСТВ: до матча они не доживут — сервер');
  console.log('  пересчитывает бюджет перед допуском (A3). Вернуть цену или');
  console.log('  показать этим игрокам, что именно изменилось.\n');
  process.exitCode = 1;
} else {
  console.log('  все сохранённые наборы законны по текущему прайсу\n');
}
db.close();
