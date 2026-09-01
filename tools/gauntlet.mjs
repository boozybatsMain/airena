/**
 * Прогон набора через гантлет: не «сколько он даёт», а «против кого».
 *
 *   node tools/gauntlet.mjs                    сам гантлет друг против друга
 *   node tools/gauntlet.mjs --scan             поиск доминирующих связок
 *   node tools/gauntlet.mjs --rounds=8
 *
 * ── чем это отличается от лиги атомов ──────────────────────────────────────
 *
 * Лига атомов отвечает на вопрос «сколько стоит немота» и не может ответить:
 * доставки согласны лишь на 0.29, потому что сила живёт в СВЯЗКЕ, а не в
 * атоме. Гантлет отвечает на другой вопрос — тот, который на самом деле нужен:
 * **есть ли дыра**. Набор, выигрывающий у всех пятерых разных соперников,
 * выигрывает не ситуативно, и вот его надо чинить.
 *
 * Пороги и их смысл — в `src/skills/gauntlet.js` рядом с самим гантлетом.
 *
 * ── что такое `--scan` ─────────────────────────────────────────────────────
 *
 * Смена набора бесплатна и мгновенна (F10), то есть игроки — это
 * распределённый перебор по пространству наборов. Соревноваться с ними
 * знанием бессмысленно, надо соревноваться перебором: `--scan` собирает
 * случайные законные наборы и ищет среди них те, что бьют весь гантлет.
 * Найденное — не «баг конкретного атома», а связка, и чинить её надо
 * рычагами из D-решений, а не ценой одного атома.
 */

import { POOL_SIZE, closePool, runJobs, superviseSelf } from './matchpool.mjs';
import { BASELINE, GAUNTLET, isDiverse, readShape } from '../src/skills/gauntlet.js';
import { CHANNELS, DELIVERIES, EFFECTS, ELEMENTS, validateKit, validateSkill } from '../src/skills/registry.js';

superviseSelf('AIRENA_GAUNTLET_CHILD');

const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? Number(h.split('=')[1]) : d;
};
const ROUNDS = arg('rounds', 6);
const SCAN = process.argv.includes('--scan');
const HOW_MANY = arg('kits', 24);

/** Винрейты набора против каждого соперника гантлета. */
async function against(kit, label) {
  const jobs = []; const meta = [];
  for (let g = 0; g < GAUNTLET.length; g++) {
    for (let s = 0; s < ROUNDS; s++) {
      for (const flip of [false, true]) {
        jobs.push(flip
          ? { a: GAUNTLET[g].kit, b: kit, seed: 2000 + s, sym: false, real: true }
          : { a: kit, b: GAUNTLET[g].kit, seed: 2000 + s, sym: false, real: true });
        meta.push({ g, flip });
      }
    }
  }
  const out = await runJobs(jobs, label ? (d, t) => process.stdout.write(`\r  ${label}: ${d}/${t}   `) : null);
  if (label) process.stdout.write('\r');
  const score = GAUNTLET.map(() => ({ w: 0, n: 0 }));
  for (let i = 0; i < out.length; i++) {
    const m = meta[i]; const r = out[i];
    if (r === 'error') continue;
    score[m.g].n++;
    /* Кандидат — осьминог, когда flip=false, и горилла, когда true. */
    const mine = m.flip ? 'gorilla' : 'octopus';
    if (r === mine) score[m.g].w++;
    else if (r === null) score[m.g].w += 0.5;
  }
  return score.map((s) => (s.n ? s.w / s.n : NaN));
}

/** Случайный законный набор: три умения, в бюджете, без дублей. */
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

const line = (rates) => rates.map((r) => (Number.isFinite(r) ? `${(r * 100).toFixed(0).padStart(3)}%` : '  ?')).join(' ');
const heads = GAUNTLET.map((g) => g.id.slice(0, 4).padStart(4)).join(' ');

const t0 = Date.now();
console.log('\n  ГАНТЛЕТ: пятеро соперников, каждый со своим способом выиграть\n');
for (const g of GAUNTLET) console.log(`    ${g.id.padEnd(11)} ${g.ru.padEnd(24)} ${g.why}`);
console.log(`\n  ${ROUNDS} сидов на соперника и сторону.\n`);

if (!SCAN) {
  /*
   * ПРОВЕРКА ПРИБОРА — ПРО РАЗНОРОДНОСТЬ, А НЕ ПРО ОТСУТСТВИЕ СИЛЬНЕЙШЕГО.
   *
   * Сначала здесь стояло «никто не должен бить всех остальных», и проверка
   * падала на «живучем». Но сильнейший в поле — это нормально и даже нужно:
   * кандидата надо об кого-то испытывать. Ненормально, если все пятеро бьют
   * одних и тех же — тогда это не пять способов выиграть, а один в пяти
   * обличьях.
   *
   * Заодно печатается отсчёт (`BASELINE.bestMin`), от которого считается
   * вердикт «доминирует»: он обязан совпадать с тем, что записано в
   * `src/skills/gauntlet.js`, иначе вердикт врёт.
   */
  console.log(`  соперник     ${heads}   худший   форма`);
  const table = [];
  for (const g of GAUNTLET) {
    const rates = await against(g.kit, g.id);
    table.push(rates);
    const others = rates.filter((_, i) => GAUNTLET[i].id !== g.id);
    const min = Math.min(...others.filter(Number.isFinite));
    console.log(`  ${g.id.padEnd(11)} ${line(rates)}    ${(min * 100).toFixed(0).padStart(3)}%   ${readShape(others).verdict}`);
  }
  const mins = table.map((r, i) => Math.min(...r.filter((_, j) => j !== i).filter(Number.isFinite)));
  const bestMin = Math.max(...mins);
  const div = isDiverse(table);
  console.log(`\n  разнородность: ${div.unique} различных рисунков побед из ${div.of}`
    + (div.ok ? ' — гантлет разнороден' : ' — ВСЕ БЬЮТ ОДНИХ И ТЕХ ЖЕ, прибором мерить нельзя'));
  console.log(`  отсчёт «доминирует»: лучший из пятерых держит ${(bestMin * 100).toFixed(0)}% против худшего для него`
    + `; в gauntlet.js записано ${(BASELINE.bestMin * 100).toFixed(0)}%`);
  const drift = Math.abs(bestMin - BASELINE.bestMin) > 0.12;
  if (drift) console.log('  ОТСЧЁТ УЕХАЛ: поправь BASELINE.bestMin в src/skills/gauntlet.js, иначе вердикт врёт.');
  closePool();
  process.exit(div.ok && !drift ? 0 : 2);
}

/* ── поиск доминирующих связок ─────────────────────────────────────────── */
let seed = 424242;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const found = [];
console.log(`  ищу доминирующие связки среди ${HOW_MANY} случайных законных наборов\n`);
for (let i = 0; i < HOW_MANY; i++) {
  const kit = randomKit(rnd);
  if (!kit) continue;
  const rates = await against(kit, `набор ${i + 1}/${HOW_MANY}`);
  const shape = readShape(rates);
  const name = kit.map((k) => `${k.delivery}:${k.effects.join('+')}`).join(' | ');
  if (shape.verdict === 'dominant') {
    found.push({ name, rates, shape });
    console.log(`  ✗ ДОМИНИРУЕТ  ${line(rates)}  ${name}`);
  } else if (shape.verdict === 'weak') {
    console.log(`    слабый      ${line(rates)}  ${name}`);
  } else {
    console.log(`    ${shape.verdict.padEnd(11)} ${line(rates)}  ${name}`);
  }
}
console.log(found.length
  ? `\n  НАЙДЕНО ДОМИНИРУЮЩИХ: ${found.length} из ${HOW_MANY}. Это дыры, и чинить их надо рычагами за атомом,\n  а не ценой одного атома — см. D-решения про баланс.`
  : `\n  Доминирующих связок среди ${HOW_MANY} не нашлось.`);
console.log(`\n  ${Math.round((Date.now() - t0) / 1000)} с\n`);
closePool();
