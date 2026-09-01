/**
 * Поле гантлета — в ДВУХ разных приборах, потому что их два.
 *
 * `BASELINE.bestMin` — порог, по которому набор объявляется дырой. Он был
 * снят на «уплощённой» арене: симметричные тела, один пилот на обе стороны и
 * кулдаун 8 у всех. Так и надо мерить ЦЕНЫ АТОМОВ: там сравниваются атомы, и
 * всё остальное обязано быть одинаковым.
 *
 * Но применяется этот порог в `viability.js` — на продуктовом пути, где
 * осьминог дерётся с гориллой, у каждого свой мозг, а кулдаун считается из
 * цены умения. Это ДРУГОЕ поле, и число, снятое на первом, не имеет силы на
 * втором: порог, откалиброванный одним прибором и применённый другим, меряет
 * не то, что обещает.
 *
 * Здесь оба поля снимаются одной командой и печатаются рядом.
 *
 *   node tools/gauntletfield.mjs --rounds=8
 */

import { GAUNTLET, isDiverse } from '../src/skills/gauntlet.js';
import { closePool, runJobs, superviseSelf } from './matchpool.mjs';

superviseSelf('AIRENA_FIELD_CHILD');

const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? Number(h.split('=')[1]) : d;
};
const ROUNDS = arg('rounds', 8);

/** Таблица «кто у кого берёт», в заданных условиях. */
async function field({ real, sym, label }) {
  const jobs = []; const meta = [];
  for (let i = 0; i < GAUNTLET.length; i++) {
    for (let j = 0; j < GAUNTLET.length; j++) {
      for (let s = 0; s < ROUNDS; s++) {
        for (const flip of [false, true]) {
          jobs.push({
            a: flip ? GAUNTLET[j].kit : GAUNTLET[i].kit,
            b: flip ? GAUNTLET[i].kit : GAUNTLET[j].kit,
            seed: 900 + s * 7919, sym, real,
          });
          meta.push({ i, j, flip });
        }
      }
    }
  }
  const out = await runJobs(jobs, (d, t) => process.stdout.write(`\r  ${label}: ${d}/${t}   `));
  process.stdout.write('\r' + ' '.repeat(40) + '\r');
  const score = GAUNTLET.map(() => GAUNTLET.map(() => ({ w: 0, n: 0 })));
  for (let k = 0; k < out.length; k++) {
    const m = meta[k]; const r = out[k];
    if (r === 'error') continue;
    const cell = score[m.i][m.j];
    cell.n++;
    const mine = m.flip ? 'gorilla' : 'octopus';
    if (r === mine) cell.w++;
    else if (r === null) cell.w += 0.5;
  }
  return score.map((row) => row.map((c) => (c.n ? c.w / c.n : NaN)));
}

/* Циклы из трёх: единственная форма, в которой «нет доминирующей стратегии»
   является свойством ПОЛЯ, а не удачей выборки. Транзитивное поле — лестница. */
function cyclesOf(t) {
  const beats = (i, j) => Number.isFinite(t[i][j]) && t[i][j] > 0.5;
  const out = [];
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      for (let k = i + 1; k < t.length; k++) {
        if (j !== k && beats(i, j) && beats(j, k) && beats(k, i)) out.push([i, j, k]);
      }
    }
  }
  return out;
}

function report(name, table) {
  const mins = table.map((row, i) => Math.min(...row.filter((_, j) => j !== i).filter(Number.isFinite)));
  const bestMin = Math.max(...mins);
  const div = isDiverse(table);
  console.log(`\n  ${name}`);
  console.log(`  ${''.padEnd(11)}${GAUNTLET.map((g) => g.id.slice(0, 7).padStart(8)).join('')}     худшее`);
  for (let i = 0; i < table.length; i++) {
    const cells = table[i].map((v, j) => (i === j ? '     ·  ' : `${(v * 100).toFixed(0).padStart(7)}%`)).join('');
    console.log(`  ${GAUNTLET[i].id.padEnd(11)}${cells}   ${(mins[i] * 100).toFixed(0).padStart(5)}%`);
  }
  const cyc = cyclesOf(table);
  console.log(`  лучший «худший» = ${(bestMin * 100).toFixed(1)}%   стилей ${div.unique} из ${div.of}${div.ok ? '' : '  ← ОДНОРОДЕН'}`);
  console.log(`  циклов из трёх: ${cyc.length}${cyc.length ? '  ' + cyc.map(([i, j, k]) => `${GAUNTLET[i].id}→${GAUNTLET[j].id}→${GAUNTLET[k].id}`).join(', ') : '  — ПОЛЕ ТРАНЗИТИВНО (лестница)'}`);
  return { bestMin, div };
}

const flat = await field({ real: false, sym: true, label: 'уплощённое поле' });
const prod = await field({ real: true, sym: false, label: 'продуктовое поле' });
const a = report(`УПЛОЩЁННОЕ: симметричные тела, один пилот, кулдаун 8 (${ROUNDS} сидов ×2 стороны)`, flat);
const b = report(`ПРОДУКТОВОЕ: осьминог против гориллы, свои мозги, кулдаун из цены (${ROUNDS} сидов ×2 стороны)`, prod);
console.log(`\n  разница порогов: ${((b.bestMin - a.bestMin) * 100).toFixed(1)} п.п. — столько стоит подмена прибора\n`);
closePool();
