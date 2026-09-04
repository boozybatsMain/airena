#!/usr/bin/env node
/**
 * ПОСТАВИТЬ НАСТОЯЩИЙ БОЙ МЕЖДУ ДВУМЯ ИМЕНОВАННЫМИ СУЩЕСТВАМИ.
 *
 * ── зачем, если бои и так идут ────────────────────────────────────────────
 *
 * Боевой цикл сервера дерётся сам, примерно раз в минуту, и пару выбирает
 * подбор. Для витрины этого хватает, а для ПРИЁМКИ — нет: приёмке нужно
 * «покажи мне бой, в котором дрались гравитация и кислота», а подбор такого
 * не обещает. Ждать, пока нужная пара сойдётся случайно, — это не проверка,
 * это лотерея.
 *
 * Здесь ставится ровно та пара, которую назвали, тем же кодом, каким дерётся
 * сервер (`playMatch`): тот же изолят, тот же сид, та же запись в таблицу
 * `match`. Значит и ссылка `#/watch/<id>` показывает НАСТОЯЩИЙ бой, а не
 * инсценировку — повтор детерминирован, зритель видит то же, что записано.
 *
 * ── что печатает ──────────────────────────────────────────────────────────
 *
 * Ссылку на бой, исход, и — главное для приёмки визуала — СКОЛЬКО РАЗ КАЖДОЕ
 * УМЕНИЕ ПРИМЕНИЛОСЬ. Бой, в котором существо ни разу не воспользовалось
 * своей стихией, для приёмки визуала бесполезен, и это надо видеть сразу, а
 * не открыв ролик.
 *
 *   node tools/duel.mjs КУРГАН ТРАВИЛЬЩИК
 *   node tools/duel.mjs --all                 каждый с каждым из сидов стихий
 *   node tools/duel.mjs КУРГАН ТРАВИЛЬЩИК --seed=7 --rounds=3
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { constantsVersion } from '../src/core/version.js';
import { playMatch } from '../src/server/arena-loop.js';
import { openDb } from '../src/server/db.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  if (h) return h.slice(n.length + 3);
  return process.argv.includes(`--${n}`) ? true : d;
};
const DB_FILE = String(arg('db', process.env.AIRENA_DB || join(ROOT, 'data/airena.db')));
const ROUNDS = Number(arg('rounds', 1));
const SEED = Number(arg('seed', 1));
const BASE = String(arg('base', 'http://localhost:8787'));
const ALL = !!arg('all', false);
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const db = openDb(DB_FILE);
const find = (name) => db.prepare(
  `SELECT * FROM creature WHERE name = ? AND state = 'active' ORDER BY created_at DESC LIMIT 1`,
).get(name);

/*
 * СИД БОЯ ДЕТЕРМИНИРОВАН И ПЕЧАТАЕТСЯ. `playMatch` берёт сид из `rng()`, и с
 * `Math.random` бой невоспроизводим — то есть ссылку, которую мы кладём в
 * отчёт, нельзя было бы получить второй раз, если база потерялась. Здесь
 * стоит счётчик: `--seed=N` и номер круга дают ровно один и тот же бой.
 */
let tick = SEED;
const rng = () => { tick = (tick * 1103515245 + 12345) % 2147483648; return tick / 2147483648; };
const deps = { now: Date.now, rng, constantsVersion: constantsVersion() };

/**
 * Сколько раз каждое умение реально применилось — из журнала боя, И ЧЕМ ОНО
 * БЫЛО.
 *
 * Одних слотов `k1/k2/k3` мало: приёмке визуала нужен ответ на вопрос «а
 * стихию-то показали?», а слот про стихию не говорит ничего. Набор на момент
 * боя лежит в самой строке матча (`kits_json` — он пишется туда затем, чтобы
 * повтор показывал ТОТ бой), так что подпись берётся оттуда, а не из
 * нынешнего набора существа: существо могли перекроить после боя.
 */
function usage(row) {
  let res, kits;
  try { res = JSON.parse(row.result_json || '{}'); } catch { return {}; }
  try { kits = JSON.parse(row.kits_json || '{}'); } catch { kits = {}; }
  /* `kits_json` — это КАРТА по имени слота (`{k1: {...}}`), а не массив: её
     пишет `kitOf`, то есть `compileKit().defs`. Первая версия читала её
     массивом и молча возвращала имя слота — то есть печатала ровно то, от чего
     подпись должна была избавить. */
  const label = (who, skill) => {
    const d = kits[who] && kits[who][skill];
    if (!d) return String(skill);
    const el = d.element || (d.grammar && d.grammar.element) || '?';
    const kind = d.kind || (d.grammar && d.grammar.delivery) || String(skill);
    return `${kind}/${el}`;
  };
  const out = {};
  for (const e of res.log || []) {
    if (e && (e.type === 'cast' || e.type === 'use' || e.type === 'skill')) {
      /* И СЛОТ, И ПОДПИСЬ. Слот отвечает на «все ли три умения пошли в
         дело» (два умения набора бывают одной формы и одной стихии, и по
         подписи они сливаются в одно); подпись отвечает на «показали ли
         стихию». Ответы разные, и печатать надо оба. */
      const k = `${e.who || '?'}:${e.skill || e.name || '?'}=${label(e.who, e.skill || e.name || '?')}`;
      out[k] = (out[k] || 0) + 1;
    }
  }
  return out;
}

async function one(a, b) {
  const out = await playMatch(db, a, b, deps);
  if (out.error) { console.log(`  ${a.name} × ${b.name}: ОТКАЗ ИЗОЛЯТА — ${out.error} ${out.message || ''}`); return null; }
  const row = db.prepare('SELECT * FROM match WHERE id = ?').get(out.id);
  const win = row.winner === a.id ? a.name : row.winner === b.id ? b.name : 'ничья';
  const u = usage(row);
  console.log(`  ${String(a.name).padEnd(18)} × ${String(b.name).padEnd(18)} ${String(win).padEnd(18)} ${row.seconds.toFixed(1)} c  ${row.reason}`);
  console.log(`      ${BASE}/#/watch/${out.id}`);
  const used = Object.entries(u).map(([k, n]) => `${k}×${n}`).join(' ');
  console.log(`      умений применено: ${used || 'НИ ОДНОГО — для приёмки визуала бой пустой'}`);
  return { id: out.id, a: a.name, b: b.name, win, seconds: row.seconds, used: u };
}

const made = [];
if (ALL) {
  /* «Каждый с каждым» — по одному бою на пару, без зеркал: приёмке нужен
     ОДИН бой на пару, а не турнирная таблица. */
  const roster = db.prepare(
    `SELECT * FROM creature WHERE owner_id IS NULL AND is_library = 0 AND state = 'active' AND kit_active = 1
     ORDER BY created_at DESC LIMIT 20`,
  ).all();
  console.log(`\n  ДУЭЛИ: ${roster.length} бойцов, ${(roster.length * (roster.length - 1)) / 2} пар\n`);
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const r = await one(roster[i], roster[j]);
      if (r) made.push(r);
    }
  }
} else {
  if (names.length !== 2) {
    console.error('\n  нужно два имени:  node tools/duel.mjs КУРГАН ТРАВИЛЬЩИК   (или --all)\n');
    process.exit(1);
  }
  const [a, b] = names.map(find);
  if (!a || !b) { console.error(`  не нашёл: ${!a ? names[0] : names[1]}`); process.exit(1); }
  console.log(`\n  ДУЭЛЬ ${a.name} × ${b.name}, кругов ${ROUNDS}\n`);
  for (let k = 0; k < ROUNDS; k++) { const r = await one(a, b); if (r) made.push(r); }
}

console.log(`\n  боёв записано: ${made.length}\n`);
