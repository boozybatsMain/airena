#!/usr/bin/env node
/**
 * ГЕЙТ: НИ ОДНО ЖИВОЕ СУЩЕСТВО НЕ СТОИТ ВЕСЬ БОЙ.
 *
 *   node tools/checkfixtures.mjs
 *   node tools/checkfixtures.mjs --seeds 7,8 --min 3
 *   node tools/checkfixtures.mjs --sizes        напечатать вес полного лога
 *   node tools/checkfixtures.mjs --falsify      выдать фикстуру по цвету и показать, что гейт ловит
 *
 * ── ЧТО ЭТО ЛОВИТ ───────────────────────────────────────────────────────────
 *
 * Треть сторон публичной лестницы была телом, которое ходит и не применяет
 * ничего. Причин ровно две, и обе невидимы из результата боя — он выглядит
 * как обычное поражение:
 *
 *   1. Существу без грамматического набора эталонную фикстуру §1 выдавал
 *      ЦВЕТ стороны (`referenceTagOf(side)`), а цвет — чётность сида матча.
 *      Мозг написан против одного набора из двух и зовёт его имена руками:
 *      на «чужом» цвете `api.ready('laser')` навсегда false.
 *   2. Копии рукописного эталона в базе перебирают набор со строки
 *      `if (k.trigger !== 'active') continue;`, а `kitView()` поле `trigger`
 *      больше не шлёт — то есть отбрасывают ВЕСЬ набор, каждый тик.
 *
 * Оба случая чинятся однажды и ломаются молча. Значит нужен гейт, и он
 * задаёт единственный вопрос, на который у обоих один и тот же ответ:
 * КАЖДОЕ живое существо библиотеки и КАЖДОЕ живое существо без набора обязано
 * применить умение хотя бы `--min` раз против эталонного спарринга — НА ОБЕИХ
 * СТОРОНАХ и на каждом сиде. Обе стороны обязательны: половина боёв на
 * лестнице шла на «чужом» цвете, и проверка на одном цвете пропустила бы
 * ровно то, из-за чего гейт написан.
 *
 * Спарринг — `brains/kit-stub/` с настоящим набором из грамматики: без набора
 * этот мозг не применяет ничего (он читает свои умения из перцепции), и тогда
 * гейт мерил бы себя.
 *
 * Бои идут В ЭТОМ ПРОЦЕССЕ, через `runMatch`, а не через изолят: гейт мерит
 * симуляцию, а не стену A1 — её мерит `checkisolate`.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileBrain } from '../src/brain/host.js';
import { runMatch } from '../src/core/match.js';
import { compileKit } from '../src/skills/compile.js';
import { buildOf, kitOf, refTagOf, summariseLog, LOG_BUDGET_BYTES } from '../src/server/arena-loop.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.AIRENA_DB || join(ROOT, 'data/airena.db');

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`) || a === `--${n}`);
  if (!hit) return d;
  if (!hit.includes('=')) return true;
  return hit.slice(n.length + 3);
};
const SEEDS = String(arg('seeds', '1,2')).split(',').map(Number).filter(Number.isFinite);
const MIN = Number(arg('min', 3));
const SIZES = arg('sizes', false) === true;
const FALSIFY = arg('falsify', false) === true;

/*
 * Набор спарринга. Три доставки, три разных исхода, ничего экзотического:
 * его дело — дать эталонному мозгу что применять и по чему попадать, а не
 * выиграть. Тот же смысл, что у `idleKit` в `checkisolate.mjs`.
 */
const SPAR_KIT = compileKit([
  { delivery: 'bolt', effects: ['damage'], element: 'kinetic' },
  { delivery: 'cone', effects: ['damage'], element: 'kinetic' },
  { delivery: 'self', effects: ['shield'], element: 'frost' },
]).defs;

const STUB_SRC = {
  octopus: readFileSync(join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8'),
  gorilla: readFileSync(join(ROOT, 'brains/kit-stub/gorilla.js'), 'utf8'),
};

/*
 * ── ДВА МОЗГА, КОТОРЫЕ МОЛЧАТ НЕ ПО ЭТОЙ ПРИЧИНЕ ────────────────────────────
 *
 * Гейт ловит фикстуру, которой набор выдал цвет. Он попутно поймал другое —
 * и потому, что это ДРУГОЕ, оно стоит здесь поимённо, с замером, а не тихо
 * ослабленным порогом.
 *
 * Оба мозга написаны против эталонной фикстуры и держат в голове кулдауны
 * ЧУЖИХ `smash`/`charge`, которых у существа с грамматическим набором нет:
 *
 *   SPIRE-08  стреляет только при `enCd('smash') > 0.2`, то есть только
 *             когда враг применил `smash` в последние 1.1 с. Против набора
 *             из грамматики этого не случается никогда → 0 применений на
 *             всех четырёх прогонах. На живой лестнице: 33 боя из 35
 *             последних без единого применения, 83 победы из 4458.
 *   LINE-17   стреляет при `!chargeReady || dist > 14.8`; враг без `charge`
 *             держит `chargeReady` истинным, и лазер остаётся только на
 *             дальней дистанции → 1 применение на синей стороне.
 *
 * Это НЕ починится ни тегом, ни пересевом мозга из `brains/kit-stub`: мозг
 * исправен как программа и негоден как игрок. Решений два, и оба принимает
 * человек — переписать мозг (лейн кузницы) или увести существо с арены
 * (`tools/retire.mjs`, который сегодня смотрит только на `kit_active = 1` и
 * этих двоих не видит вовсе). До тех пор они здесь.
 *
 * СПИСОК САМ СЕБЯ ЧИСТИТ: существо, которое начало применять умения, роняет
 * гейт с требованием убрать запись. Иначе исключение переживёт свою причину и
 * станет дырой.
 */
const KNOWN_MUTE = new Map([
  /* 07.09: SPIRE-08 and LINE-17 were the two entries here — their minds fired
     only on the cooldown of an enemy smash/charge that a grammar kit never
     has. Their stored kits were activated and their minds rewritten
     (`tools/rethink.mjs`), so the list is empty; an entry survives here only
     while its cause does. */
]);

const db = new DatabaseSync(DB, { readOnly: true });

/*
 * ПОПУЛЯЦИЯ: всё, что зритель или игрок может встретить на арене.
 *
 *   is_library = 1   библиотека и витрина — то, что показывают гостю;
 *   kit_active = 0   любая фикстура, чей мозг зовёт захардкоженные имена, —
 *                    это она стоит в трети боёв лестницы.
 *
 * `state = 'active'` обязательно: у существа на покое нет боёв, и требовать
 * от него исправности значит чинить то, чего никто не увидит.
 */
const rows = db.prepare(`SELECT * FROM creature
  WHERE state = 'active' AND brain_source IS NOT NULL AND (is_library = 1 OR kit_active = 0)
  ORDER BY is_library DESC, kit_active DESC, name`).all();

console.log(`\n  ГЕЙТ ФИКСТУР — ${rows.length} живых существ библиотеки и лестницы`);
console.log(`  спарринг: brains/kit-stub с набором из грамматики; сиды ${SEEDS.join(',')}; порог ${MIN} применений на бой\n`);

const SIDES = ['blue', 'orange'];
const other = (s) => (s === 'blue' ? 'orange' : 'blue');
/* Какой ФАЙЛ спарринга ставить напротив. Это имя файла, а не свойство
   стороны: `checkgrammar` ставит осьминога синим, гориллу оранжевым, и здесь
   тот же порядок — так спарринг одинаков от прогона к прогону. */
const SPAR_FILE = { blue: 'octopus', orange: 'gorilla' };

const logBytes = [];
const failures = [];
const quarantined = [];
const table = [];

for (const c of rows) {
  const kit = kitOf(c);
  const build = buildOf(c);
  const tag = refTagOf(c);
  let brain;
  try { brain = compileBrain(c.brain_source, c.name); }
  catch (e) {
    failures.push(`${c.name} (${c.id}): мозг не компилируется — ${e.message}`);
    continue;
  }
  const row = { c, tag, kit: !!kit, casts: {}, worst: Infinity, faults: 0 };
  for (const side of SIDES) {
    const foe = other(side);
    const sparSide = FALSIFY ? null : side;
    for (const seed of SEEDS) {
      const spar = compileBrain(STUB_SRC[SPAR_FILE[foe]], 'spar');
      const out = runMatch({ [side]: brain, [foe]: spar }, {
        seed,
        kits: { [side]: kit, [foe]: SPAR_KIT },
        builds: { [side]: build, [foe]: null },
        /*
         * `--falsify` возвращает прежнее поведение: тег не передаётся вовсе,
         * и фикстуру снова раздаёт цвет. Гейт обязан на этом упасть — иначе
         * он не про то, ради чего написан.
         */
        ...(sparSide ? { referenceTag: { [side]: tag, [foe]: null } } : {}),
      });
      const sum = summariseLog(out.result.log, SIDES)[side];
      const key = `${side}#${seed}`;
      row.casts[key] = sum.casts;
      row.worst = Math.min(row.worst, sum.casts);
      row.faults += out.result[side]?.faults ?? 0;
      logBytes.push({ name: c.name, seed, side, bytes: Buffer.byteLength(JSON.stringify(out.result.log), 'utf8'), events: out.result.log.length });
    }
  }
  table.push(row);
  const line = `${c.name} (${c.id}, ${row.kit ? 'набор' : `фикстура ${row.tag || '—'}`}): `
    + `${Object.entries(row.casts).map(([k, v]) => `${k} ${v}`).join(', ')}`;
  row.known = KNOWN_MUTE.has(c.id);
  if (row.worst < MIN && !row.known) failures.push(line);
  if (row.worst < MIN && row.known) quarantined.push(`${line}\n      ${KNOWN_MUTE.get(c.id)}`);
  /* Запись, пережившая свою причину, — это дыра, а не поблажка. */
  if (row.worst >= MIN && row.known) {
    failures.push(`${c.name} (${c.id}) применяет ${row.worst} умений и больше не нуждается в исключении`
      + ' — убрать его из KNOWN_MUTE в tools/checkfixtures.mjs');
  }
}

const pad = (s, n) => String(s ?? '').padEnd(n);
const rpad = (s, n) => String(s ?? '').padStart(n);
console.log(`  ${pad('существо', 18)}${pad('набор', 10)}${SEEDS.flatMap((s) => SIDES.map((d) => rpad(`${d[0]}#${s}`, 7))).join('')}${rpad('min', 6)}  `);
for (const r of table.sort((a, b) => a.worst - b.worst)) {
  const cells = SEEDS.flatMap((s) => SIDES.map((d) => rpad(r.casts[`${d}#${s}`] ?? '—', 7))).join('');
  const mark = r.worst >= MIN ? '✓' : (r.known ? '!' : '✗');
  console.log(`  ${mark} ${pad(r.c.name, 16)}${pad(r.kit ? 'грамматика' : (r.tag || 'НЕТ ТЕГА'), 10)}${cells}${rpad(r.worst, 6)}`);
}

if (SIZES || failures.length === 0) {
  const b = logBytes.map((x) => x.bytes).sort((x, y) => x - y);
  const q = (p) => b[Math.min(b.length - 1, Math.floor(b.length * p))];
  const ev = logBytes.map((x) => x.events).sort((x, y) => x - y);
  console.log(`\n  полный лог боя: медиана ${(q(0.5) / 1024).toFixed(1)} КБ, p95 ${(q(0.95) / 1024).toFixed(1)} КБ, максимум ${(q(1) / 1024).toFixed(1)} КБ`
    + `  (событий: медиана ${ev[Math.floor(ev.length / 2)]}, максимум ${ev[ev.length - 1]})`);
  console.log(`  бюджет хранения ${(LOG_BUDGET_BYTES / 1024).toFixed(1)} КБ — обрезается ${b.filter((x) => x > LOG_BUDGET_BYTES).length} из ${b.length} боёв`);
}

console.log('');
if (quarantined.length) {
  console.log(`  ! ${quarantined.length} мозга молчат ПО ДРУГОЙ ПРИЧИНЕ и вынесены поимённо (см. KNOWN_MUTE):\n`);
  for (const q of quarantined) console.log(`    ${q}`);
  console.log('');
}
if (failures.length) {
  console.log(`  ✗ ${failures.length} существ не применяют ${MIN} умений в каждом бою:\n`);
  for (const f of failures) console.log(`    ${f}`);
  console.log('\n  Тело, которое ходит весь бой, — это не проигрыш, это неисправность:');
  console.log('  либо у фикстуры нет тега (node tools/seedfixtures.mjs), либо её мозг');
  console.log('  перебирает набор по полю, которого грамматика больше не шлёт.\n');
  db.close();
  process.exit(1);
}
console.log(`  ✓ ${table.length - quarantined.length} из ${table.length} применяют умения на обеих сторонах, на всех ${SEEDS.length} сидах`
  + `${quarantined.length ? `; ${quarantined.length} вынесены поимённо выше` : ''}\n`);
db.close();
process.exit(0);
