/**
 * Подобрать гантлет, который остаётся РАЗНОРОДНЫМ на продуктовом поле.
 *
 * Нынешние пятеро выбраны по замыслу — «сближается», «держит дистанцию»,
 * «переживает», «не даёт применить», «середняк» — и проверены на уплощённой
 * арене, где тела одинаковы, пилот один и кулдаун у всех восемь. Там они
 * действительно разные.
 *
 * На продуктовом поле — осьминог против гориллы, свои мозги, кулдаун из цены —
 * они схлопываются в ЛЕСТНИЦУ: `turtle` бьёт всех, `controller` не бьёт
 * никого, между ними один порядок силы. Замерено `tools/gauntletfield.mjs`:
 * стилей 2 из 5. Кандидат, испытанный об лестницу, получает не форму, а место
 * в очереди — а весь смысл гантлета в форме.
 *
 * Здесь пятеро не придумываются, а ИЩУТСЯ. Случайные законные наборы играют
 * против общих пробников, кандидаты со схожим рисунком побед сливаются в один
 * стиль, из разных стилей берётся по представителю, и найденная пятёрка
 * проверяется round-robin'ом на том самом поле, для которого она нужна.
 *
 *   node tools/gauntletpick.mjs --pool=40 --rounds=6
 */

import { isDiverse } from '../src/skills/gauntlet.js';
import { CHANNELS, DELIVERIES, EFFECTS, ELEMENTS, describe, validateKit, validateSkill } from '../src/skills/registry.js';
import { closePool, runJobs, superviseSelf } from './matchpool.mjs';

superviseSelf('AIRENA_PICK_CHILD');

const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? Number(h.split('=')[1]) : d;
};
const POOL = arg('pool', 40);
const ROUNDS = arg('rounds', 6);

/* Один и тот же поток случайности при одном сиде: пятёрка обязана
   воспроизводиться той же командой, иначе её нельзя проверить. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function randomKit(rnd) {
  const dl = Object.keys(DELIVERIES); const ef = Object.keys(EFFECTS);
  const ch = Object.keys(CHANNELS); const el = Object.keys(ELEMENTS);
  for (let tries = 0; tries < 400; tries++) {
    const kit = [];
    for (let i = 0; i < 3; i++) {
      for (let t = 0; t < 60; t++) {
        const n = 1 + Math.floor(rnd() * 3);
        const eff = [];
        while (eff.length < n) {
          const e = ef[Math.floor(rnd() * ef.length)];
          if (!eff.includes(e)) eff.push(e);
        }
        const needs = eff.some((e) => EFFECTS[e].needsChannel);
        const s = {
          delivery: dl[Math.floor(rnd() * dl.length)],
          effects: eff,
          element: el[Math.floor(rnd() * el.length)],
          ...(needs ? { channel: ch[Math.floor(rnd() * ch.length)] } : {}),
        };
        if (!validateSkill(s).length) { kit.push(s); break; }
      }
    }
    if (kit.length === 3 && !validateKit(kit).length) return kit;
  }
  return null;
}

/** Винрейты каждого набора против каждого пробника, на ПРОДУКТОВОМ поле. */
async function versus(kits, probes, label) {
  const jobs = []; const meta = [];
  for (let i = 0; i < kits.length; i++) {
    for (let p = 0; p < probes.length; p++) {
      for (let s = 0; s < ROUNDS; s++) {
        for (const flip of [false, true]) {
          jobs.push({
            a: flip ? probes[p] : kits[i], b: flip ? kits[i] : probes[p],
            seed: 900 + s * 7919, sym: false, real: true,
          });
          meta.push({ i, p, flip });
        }
      }
    }
  }
  const out = await runJobs(jobs, (d, t) => process.stdout.write(`\r  ${label}: ${d}/${t}   `));
  process.stdout.write(`\r${' '.repeat(46)}\r`);
  const score = kits.map(() => probes.map(() => ({ w: 0, n: 0 })));
  for (let k = 0; k < out.length; k++) {
    const m = meta[k]; const r = out[k];
    if (r === 'error') continue;
    const c = score[m.i][m.p];
    c.n++;
    const mine = m.flip ? 'gorilla' : 'octopus';
    if (r === mine) c.w++;
    else if (r === null) c.w += 0.5;
  }
  return score.map((row) => row.map((c) => (c.n ? c.w / c.n : NaN)));
}

const rnd = rng(20260830);
const pool = [];
while (pool.length < POOL) { const k = randomKit(rnd); if (k) pool.push(k); }
console.log(`\n  пул: ${pool.length} случайных законных наборов, ${ROUNDS} сидов ×2 стороны, продуктовые условия\n`);

/*
 * ПРОБНИКИ ЗАМОРОЖЕНЫ, иначе команда не воспроизводит собственный результат.
 *
 * Здесь стояло `GAUNTLET.map(g => g.kit)` — текущая пятёрка. Но найденная
 * пятёрка ЗАМЕНЯЕТ текущую, значит на следующий день та же команда с тем же
 * сидом мерит другими пробниками и печатает другое. Инструмент, чей
 * документированный вызов не повторяет свой же ответ, документирует ложь.
 *
 * Это ровно те пятеро, которыми поиск пользовался, когда нашёл нынешний
 * гантлет: промежуточная пятёрка (навесной / лучевой / зонный / помеха /
 * рывковый), которая сама была найдена поиском и оказалась лестницей. Она
 * заморожена не потому, что хороша, а потому что была ПРИБОРОМ в тот раз, и
 * без неё документированная команда не повторит свой ответ.
 *
 * Я успел заморозить здесь не ту пятёрку — самую первую, придуманную по
 * замыслу, — и это была та же ошибка в новой обёртке: правдоподобная,
 * непроверенная и ломающая ровно то, что чинилась.
 *
 * Менять их незачем: работа пробников не быть эталоном, а различать кандидатов
 * между собой.
 */
const probes = [
  [{ delivery: 'lob', effects: ['wall'], element: 'ember' },
    { delivery: 'lob', effects: ['damage'], element: 'void' },
    { delivery: 'lob', effects: ['burn', 'silence'], element: 'frost' }],
  [{ delivery: 'beam', effects: ['damage'], element: 'void' },
    { delivery: 'zone', effects: ['shield', 'cleanse'], element: 'kinetic' },
    { delivery: 'beam', effects: ['shield', 'weaken'], element: 'arc', channel: 'damage' }],
  [{ delivery: 'zone', effects: ['stun', 'heal'], element: 'frost' },
    { delivery: 'zone', effects: ['damage'], element: 'arc' },
    { delivery: 'zone', effects: ['boost'], element: 'frost', channel: 'armor' }],
  [{ delivery: 'bolt', effects: ['cleanse'], element: 'ember' },
    { delivery: 'cone', effects: ['burn'], element: 'kinetic' },
    { delivery: 'beam', effects: ['silence'], element: 'arc' }],
  [{ delivery: 'dash', effects: ['shield', 'heal'], element: 'frost' },
    { delivery: 'beam', effects: ['wall'], element: 'void' },
    { delivery: 'dash', effects: ['damage', 'stun'], element: 'void' }],
];

const rates = await versus(pool, probes, 'против пробников');

/*
 * Стиль — это РИСУНОК побед против общих пробников, а не близость чисел.
 * Два набора одного стиля бьют одних и тех же и сливают одним и тем же;
 * насколько уверенно — уже вопрос силы, а не способа выиграть.
 */
const styleOf = (r) => r.map((v) => (!Number.isFinite(v) ? '?' : (v > 0.55 ? '1' : (v < 0.45 ? '0' : '=')))).join('');
const byStyle = new Map();
for (let i = 0; i < pool.length; i++) {
  const s = styleOf(rates[i]);
  if (!byStyle.has(s)) byStyle.set(s, []);
  byStyle.get(s).push(i);
}
console.log(`  различных стилей в пуле: ${byStyle.size}`);
for (const [s, ix] of [...byStyle.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`    ${s}  ×${String(ix.length).padStart(2)}`);
}

/*
 * ── СНАЧАЛА СИЛА, ПОТОМ РАЗНООБРАЗИЕ ──────────────────────────────────────
 *
 * Первая версия брала представителем стиля самого «среднего» — того, чей
 * винрейт ближе к половине. Звучит разумно и оказалось ошибкой: пул случайный,
 * а случайный законный набор слаб, поэтому «средний из слабых» — просто
 * слабый. Найденная так пятёрка честно давала циклы и стили, и при этом ЛЮБОЙ
 * приличный набор брал у неё 63–88%: три умения с уроном — 75%, эталонная
 * форма «урон+урон+лечение» — 88%. Прибор, у которого потолок ниже обычного
 * игрока, меряет не силу кандидата, а слабость поля.
 *
 * Поэтому представитель стиля теперь — САМЫЙ СИЛЬНЫЙ в этом стиле, а не самый
 * средний. Разнообразие берётся тем, что стили разные; сила — тем, что внутри
 * стиля берётся лучший.
 */
const power = (i) => rates[i].filter(Number.isFinite).reduce((a, b) => a + b, 0) / rates[i].length;
const mid = (i) => -power(i);
const reps = [...byStyle.values()].map((ix) => ix.slice().sort((a, b) => power(b) - power(a))[0]);
console.log(`\n  представителей стилей: ${reps.length}`);
if (reps.length < 5) {
  console.log('  МАЛО СТИЛЕЙ: увеличь --pool. Пятёрку не из чего собрать.');
  closePool();
  process.exit(2);
}

/*
 * ПЯТЁРКА ПРОВЕРЯЕТСЯ, А НЕ УГАДЫВАЕТСЯ.
 *
 * Рисунок против пробников — это подсказка, а не ответ: пробники сами
 * лестница, и «разные против лестницы» не значит «разные между собой».
 * Поэтому строится несколько кандидатов-пятёрок (жадно, от разных начал), и
 * каждая ИГРАЕТ round-robin на продуктовом поле. Выбирается по цели, а не по
 * первому успеху:
 *
 *   1. больше различных стилей — ради этого всё и делается;
 *   2. никто не бьёт всех: пятёрка с чемпионом снова становится лестницей;
 *   3. каждый бьёт хоть кого-то: мешок для битья ничего не различает;
 *   4. при равенстве — тот, у кого «лучший худший» ниже: поле ровнее.
 */
const dist = (a, b) => styleOf(rates[a]).split('').filter((c, k) => c !== styleOf(rates[b])[k]).length;
const greedyFrom = (seed) => {
  const chosen = [seed];
  while (chosen.length < 5) {
    let best = null; let bestD = -1;
    for (const r of reps) {
      if (chosen.includes(r)) continue;
      const d = Math.min(...chosen.map((c) => dist(r, c)));
      if (d > bestD) { bestD = d; best = r; }
    }
    if (best === null) break;
    chosen.push(best);
  }
  return chosen;
};

/*
 * ЦИКЛ — ГЛАВНОЕ ТРЕБОВАНИЕ, А НЕ ПРИЯТНЫЙ ПОБОЧНЫЙ ЭФФЕКТ.
 *
 * Первая версия ранжировала по числу стилей и напечатала пятёрку с циклом на
 * шести сидах. На двенадцати цикла не оказалось: поле транзитивно, порядок
 * силы зонный > лучевой > рывковый > навесной > помеха. То есть найденное
 * «камень-ножницы-бумага» было шумом шести сидов, а я успел записать его в
 * комментарий как факт.
 *
 * Транзитивное поле — это лестница, пусть и с пятью разными рисунками побед.
 * Кандидат об неё меряется местом в очереди. Цикл — единственная форма, в
 * которой «нет доминирующей стратегии» является свойством ПОЛЯ, а не удачей
 * замера, поэтому теперь он требуется, а не приветствуется.
 */
const cycles = (t) => {
  const beats = (i, j) => Number.isFinite(t[i][j]) && t[i][j] > 0.5;
  const out = [];
  for (let i = 0; i < t.length; i++) {
    for (let j = 0; j < t.length; j++) {
      for (let k = 0; k < t.length; k++) {
        if (i !== j && j !== k && k !== i && i < j && i < k && beats(i, j) && beats(j, k) && beats(k, i)) out.push([i, j, k]);
      }
    }
  }
  return out;
};

const starts = reps.slice().sort((a, b) => mid(a) - mid(b)).slice(0, Number(arg('tries', 4)));
let winner = null;
for (const [n, st] of starts.entries()) {
  const cand = greedyFrom(st);
  if (cand.length < 5) continue;
  const t = await versus(cand.map((i) => pool[i]), cand.map((i) => pool[i]), `кандидат ${n + 1}/${starts.length}`);
  const d = isDiverse(t);
  const mn = t.map((row, i) => Math.min(...row.filter((_, j) => j !== i).filter(Number.isFinite)));
  const mx = t.map((row, i) => Math.max(...row.filter((_, j) => j !== i).filter(Number.isFinite)));
  const dominator = mn.some((v) => v > 0.5);
  const punchbag = mx.some((v) => v <= 0.5);
  const cyc = cycles(t);
  const bm = Math.max(...mn);
  console.log(`  кандидат ${n + 1}: циклов ${cyc.length}, стилей ${d.unique}/5, лучший «худший» ${(bm * 100).toFixed(0)}%`
    + `${dominator ? ', ЕСТЬ ЧЕМПИОН' : ''}${punchbag ? ', ЕСТЬ МЕШОК ДЛЯ БИТЬЯ' : ''}`);
  const key = [cyc.length ? 1 : 0, cyc.length, d.unique, punchbag ? 0 : 1, -bm];
  if (!winner || key.some((v, i) => v > winner.key[i] && key.slice(0, i).every((w, j) => w === winner.key[j]))) {
    winner = { key, chosen: cand, table: t, div: d, mins: mn, bestMin: bm };
  }
}
if (!winner) { console.log('  ПЯТЁРКУ СОБРАТЬ НЕ УДАЛОСЬ'); closePool(); process.exit(2); }
const { chosen, table, div, mins, bestMin } = winner;

console.log(`\n  НАЙДЕННАЯ ПЯТЁРКА, round-robin на продуктовом поле\n`);
console.log(`  ${''.padEnd(4)}${chosen.map((_, j) => `#${j}`.padStart(8)).join('')}     худшее`);
for (let i = 0; i < table.length; i++) {
  const cells = table[i].map((v, j) => (i === j ? '     ·  ' : `${(v * 100).toFixed(0).padStart(7)}%`)).join('');
  console.log(`  #${i}  ${cells}   ${(mins[i] * 100).toFixed(0).padStart(5)}%`);
}
const cyc = cycles(table);
console.log(`\n  стилей ${div.unique} из ${div.of}${div.ok ? ' — РАЗНОРОДЕН' : ' — однороден, пятёрка не годится'}`);
console.log(`  циклов из трёх: ${cyc.length}${cyc.length ? '  ' + cyc.map(([i, j, k]) => `#${i}→#${j}→#${k}`).join(', ') : '  — ПОЛЕ ТРАНЗИТИВНО, это лестница'}`);
console.log(`  лучший «худший» = ${(bestMin * 100).toFixed(1)}%  ← это и есть BASELINE.bestMin для продуктового поля\n`);
for (let i = 0; i < chosen.length; i++) {
  console.log(`  #${i}  ${pool[chosen[i]].map((s) => describe(s)).join('  |  ')}`);
}
console.log(`\n  JSON пятёрки:\n${JSON.stringify(chosen.map((i) => pool[i]))}\n`);
closePool();
process.exit(div.ok && cyc.length ? 0 : 2);
