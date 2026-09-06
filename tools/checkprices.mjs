/**
 * Цены атомов не разъехались с замером, которым они назначены — гейт.
 *
 * Таблица «лучшего случая» лежит комментарием в `src/skills/registry.js`: она
 * снята `tools/kitbalance.mjs --atoms` на 1260 боях, и по ней назначены цены.
 * Сам `kitbalance` в `npm test` не входит и входить не может — это минуты боёв,
 * — а значит цены не держит НИЧТО: поправил число в `EFFECTS`, и таблица рядом
 * стала описывать другую игру, молча.
 *
 * Этот гейт не перемеряет. Он делает то, что можно сделать за миллисекунды:
 * связывает прозу с кодом. Таблица разбирается из комментария, цены читаются из
 * живого `EFFECTS`, и проверяется три утверждения, каждое из которых записано в
 * том же комментарии как факт:
 *
 *   — в таблице ровно те атомы, что в реестре, и наоборот;
 *   — цены лежат в объявленном диапазоне;
 *   — корреляция цены с лучшим случаем не ниже объявленной.
 *
 * Если правка цен была осознанной, гейт напомнит переснять таблицу командой,
 * которая тут же и напечатана. Если неосознанной — остановит.
 *
 *   node tools/checkprices.mjs
 *   node tools/checkprices.mjs --verbose
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EFFECTS } from '../src/skills/registry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

let bad = 0;
const ok = (what, cond, note = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${what}${note ? `  ${note}` : ''}`);
  if (!cond) bad++;
};

console.log('\n  ЦЕНЫ АТОМОВ\n');

/* Строки вида ` *     урон              100%      97      100` из комментария. */
const src = readFileSync(join(ROOT, 'src/skills/registry.js'), 'utf8');
const table = new Map();
for (const m of src.matchAll(/^\s*\*\s{4,}([a-zа-яё]+)\s+(\d+)%/gim)) table.set(m[1], Number(m[2]));

ok('таблица «лучшего случая» находится в комментарии', table.size > 0, `${table.size} строк`);

const byRu = new Map(Object.values(EFFECTS).map((e) => [e.ru, e]));
const missing = [...byRu.keys()].filter((ru) => !table.has(ru));
const extra = [...table.keys()].filter((ru) => !byRu.has(ru));
ok('в таблице ровно те атомы, что в реестре', missing.length === 0 && extra.length === 0,
  missing.length || extra.length ? `нет в таблице: ${missing.join(', ') || '—'}; лишние: ${extra.join(', ') || '—'}` : `${byRu.size} атомов`);

const costs = [...byRu.values()].map((e) => e.cost);
const lo = Math.min(...costs); const hi = Math.max(...costs);
/* Диапазон объявлен в том же комментарии: «ранги отображены в 3…7». */
const said = /ранги отображены в (\d+)…(\d+)/.exec(src);
ok('диапазон цен совпадает с объявленным', said && lo === Number(said[1]) && hi === Number(said[2]),
  said ? `в коде ${lo}…${hi}, в комментарии ${said[1]}…${said[2]}` : 'в комментарии нет строки про диапазон');

const pairs = [...byRu.entries()].filter(([ru]) => table.has(ru)).map(([ru, e]) => [e.cost, table.get(ru)]);
let r = NaN;
if (pairs.length > 2) {
  const n = pairs.length;
  const mx = pairs.reduce((a, p) => a + p[0], 0) / n;
  const my = pairs.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  r = sxy / Math.sqrt(sxx * syy);
}
/* Комментарии переносятся по строкам, и утверждение может разорваться посередине
   («…с лучшим\n * случаем 0.91»). Ищем по тексту без разметки переноса. */
const flat = src.replace(/\n\s*\*\s?/g, ' ');
const claimed = /[Кк]орреляция цены с лучшим случаем (\d+(?:\.\d+)?)/.exec(flat);
const want = claimed ? Number(claimed[1]) : null;
ok('корреляция цены с замером не ниже объявленной', want !== null && r >= want - 0.02,
  want === null ? 'в комментарии нет строки про корреляцию'
    : `сейчас ${r.toFixed(3)}, объявлено ${want.toFixed(2)}`);

if (VERBOSE) {
  for (const [ru, e] of byRu) console.log(`      ${ru.padEnd(16)} цена ${e.cost}  лучший случай ${table.get(ru) ?? '—'}%`);
}

if (bad) {
  console.log('\n  Если цены менялись осознанно — таблицу надо ПЕРЕСНЯТЬ, а не поправить руками:');
  console.log('    for v in bolt zone; do node tools/kitbalance.mjs --atoms --via=$v; done');
}
console.log(bad ? `\n  ПРОВАЛ: ${bad}\n` : '\n  ДЕРЖИТ\n');
process.exit(bad ? 1 : 0);
