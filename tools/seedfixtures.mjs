#!/usr/bin/env node
/**
 * ТА ЖЕ ЛЕСТНИЦА, НО ФИКСТУРЫ НА НЕЙ ДЕЙСТВИТЕЛЬНО ДЕРУТСЯ.
 *
 *   node tools/seedfixtures.mjs --dry      план, без единой записи
 *   node tools/seedfixtures.mjs            снять снимок базы и применить
 *   node tools/seedfixtures.mjs --no-backup
 *
 * Здесь ДВЕ починки одной болезни: треть сторон на публичной лестнице —
 * тело, которое ходит весь бой и не применяет ничего. Замерено по 1200
 * строкам текущей версии констант: 410 сторон из 2400 не применили ни одного
 * умения, и все двойные КО без единого события — это две такие стороны,
 * встретившиеся друг с другом.
 *
 * ── 1. ТЕГ ЭТАЛОННОГО НАБОРА (reference_tag) ────────────────────────────────
 *
 * Существо без грамматического набора дерётся фикстурой §1, и фикстур две:
 * `laser/blink/jump` и `smash/charge/jump`. Какая достанется, решал ЦВЕТ
 * стороны, а цвет — чётность сида матча, то есть монетка. Мозг же написан
 * ровно против одного набора и зовёт его имена руками; на «чужом» цвете
 * `api.ready('laser')` навсегда false, и туша ходит.
 *
 * Тег выводится ИЗ САМОГО МОЗГА и по одному признаку — какие имена мозг
 * отдаёт СЕБЕ через `api.use/ready/cooldown`. «Упоминается ли слово laser в
 * тексте» не годится и проверено: все 21 живых мозга упоминают оба набора,
 * потому что читают ЧУЖИЕ умения из перцепции и пишут о них в комментариях.
 * По вызовам разделение чистое: 21 из 21, без единого спорного.
 *
 * Мозг, зовущий обе половины или ни одной, НЕ ТРОГАЕТСЯ и печатается
 * отдельным списком: такой случай называет человек, а не эвристика.
 *
 * ── 2. РУКОПИСНЫЕ ЭТАЛОНЫ, КОТОРЫЕ НИЧЕГО НЕ КАСТУЮТ ────────────────────────
 *
 * Ось «триггер» снята (D102), и `kitView()` больше не шлёт поле `trigger`.
 * Копии рукописного эталона, лежащие в БД, по-прежнему начинают перебор
 * набора со строки `if (k.trigger !== 'active') continue;` — то есть
 * отбрасывают ВЕСЬ набор, каждый тик, всегда. Файл в `brains/kit-stub/`
 * починили, копии в базе — нет.
 *
 * Переписывается `brain_source` РОВНО у сидов проекта, и признаком служит не
 * имя, а происхождение: `owner_id IS NULL` (ничьё существо), `is_library = 1`
 * (эталон) и `brain_model` = «рукописный эталон». Строка игрока под эти
 * условия не попадает никогда, и если такая найдётся — она печатается в
 * список «не трогаю», а не чинится.
 *
 * Ничего не удаляется: рейтинг, бои, история, наборы и тела остаются как
 * есть, меняется одна колонка.
 */

import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inferReferenceTag } from '../src/server/arena-loop.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.AIRENA_DB || join(ROOT, 'data/airena.db');
const DRY = process.argv.includes('--dry');
const NO_BACKUP = process.argv.includes('--no-backup');

const sha = (s) => createHash('sha256').update(s || '', 'utf8').digest('hex').slice(0, 12);
const pad = (s, n) => String(s ?? '').padEnd(n);

/* Снимок ПЕРЕД записью, и `--keep=0` намеренно: ротация снимков удаляет
   файлы, а этот инструмент не удаляет ничего вообще. */
if (!DRY && !NO_BACKUP) {
  console.log('\n  снимок базы перед записью…');
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/backup.mjs'), `--db=${DB}`, '--keep=0'],
    { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('\n  снимок не снят — ничего не пишу.\n');
    process.exit(1);
  }
}

const db = new DatabaseSync(DB);

/* Колонки может не быть, если сервер этой базы ещё не поднимался после
   миграции. Дописываем её здесь тем же оператором, что и `db.js`: инструмент,
   который валится на «no such column», бесполезен ровно тогда, когда нужен. */
const hasCol = db.prepare('PRAGMA table_info(creature)').all().some((c) => c.name === 'reference_tag');
let haveCol = hasCol;
if (!hasCol) {
  if (DRY) { console.log('\n  колонки creature.reference_tag нет — прогон без --dry её создаст\n'); }
  else { db.exec('ALTER TABLE creature ADD COLUMN reference_tag TEXT'); haveCol = true; console.log('  создал колонку creature.reference_tag'); }
}

// ── 1. ТЕГИ ──────────────────────────────────────────────────────────────────

/* Колонка подставляется условно: на `--dry` её могло ещё не быть, и падать
   на «no such column» ровно в режиме «покажи план» — худшее из поведений. */
const kitless = db.prepare(`SELECT id, name, state, is_library, owner_id, fights, brain_source,
  ${haveCol ? 'reference_tag' : 'NULL AS reference_tag'}
  FROM creature WHERE kit_active = 0 AND brain_source IS NOT NULL ORDER BY state, name`).all();

const plan = [];
const unclear = [];
for (const c of kitless) {
  const tag = inferReferenceTag(c.brain_source);
  if (!tag) { unclear.push(c); continue; }
  if (c.reference_tag === tag) continue;
  plan.push({ ...c, tag });
}

console.log(`\n  ТЕГ ЭТАЛОННОГО НАБОРА — ${kitless.length} существ без грамматического набора\n`);
console.log(`  ${pad('id', 16)}${pad('имя', 16)}${pad('состояние', 11)}${pad('боёв', 8)}${pad('было', 10)}тег`);
for (const c of plan) {
  console.log(`  ${pad(c.id, 16)}${pad(c.name, 16)}${pad(c.state, 11)}${pad(c.fights, 8)}${pad(c.reference_tag ?? '—', 10)}${c.tag}`);
}
if (!plan.length) console.log('  всё уже проставлено');
if (unclear.length) {
  console.log(`\n  НЕ ТРОГАЮ — мозг зовёт обе половины или ни одной (${unclear.length}):`);
  for (const c of unclear) console.log(`    ${pad(c.id, 16)}${pad(c.name, 16)}${c.state}`);
}

// ── 2. РУКОПИСНЫЕ ЭТАЛОНЫ ────────────────────────────────────────────────────

/* Какой файл кому. Обе копии читают СВОЙ набор из перцепции и не знают ни
   одного имени умения заранее, поэтому «сторона» здесь — только дистанция
   кайта (0.7 против 0.45 самой длинной досягаемости). Берётся из шапки самой
   строки, чтобы существо осталось тем же, чем было. */
const STUBS = {
  octopus: readFileSync(join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8'),
  gorilla: readFileSync(join(ROOT, 'brains/kit-stub/gorilla.js'), 'utf8'),
};

const handwritten = db.prepare(`SELECT id, name, state, is_library, owner_id, prompt, fights, brain_model, brain_source
  FROM creature WHERE brain_model LIKE '%рукописн%' ORDER BY name`).all();

const reseed = [];
const skipped = [];
for (const c of handwritten) {
  /* ПРОИСХОЖДЕНИЕ, А НЕ ИМЯ. Строка игрока не переписывается ни при каких
     совпадениях названия модели. */
  if (c.owner_id !== null || !c.is_library) { skipped.push({ c, why: 'существо с владельцем — не сид проекта' }); continue; }
  const gorilla = /сторона гориллы|gorilla side/i.test(c.brain_source || '');
  const octopus = /сторона осьминога|octopus side/i.test(c.brain_source || '');
  if (gorilla === octopus) { skipped.push({ c, why: 'по шапке не понять, какой это эталон' }); continue; }
  const which = gorilla ? 'gorilla' : 'octopus';
  if (c.brain_source === STUBS[which]) { skipped.push({ c, why: 'уже совпадает с файлом' }); continue; }
  /* Тот самый признак, ради которого всё: перебор набора отбрасывается полем,
     которого грамматика больше не шлёт. */
  const gated = /\.trigger\s*!==\s*['"]active['"]/.test(c.brain_source || '');
  reseed.push({ c, which, gated });
}

console.log(`\n  РУКОПИСНЫЕ ЭТАЛОНЫ — ${handwritten.length} строк\n`);
console.log(`  ${pad('id', 16)}${pad('имя', 12)}${pad('состояние', 11)}${pad('боёв', 8)}${pad('было', 14)}${pad('станет', 14)}источник`);
for (const r of reseed) {
  console.log(`  ${pad(r.c.id, 16)}${pad(r.c.name, 12)}${pad(r.c.state, 11)}${pad(r.c.fights, 8)}${pad(sha(r.c.brain_source), 14)}${pad(sha(STUBS[r.which]), 14)}brains/kit-stub/${r.which}.js${r.gated ? '  (гейт по k.trigger)' : ''}`);
}
if (!reseed.length) console.log('  переписывать нечего');
if (skipped.length) {
  console.log('\n  НЕ ТРОГАЮ:');
  for (const s of skipped) console.log(`    ${pad(s.c.id, 16)}${pad(s.c.name, 12)}${s.why}`);
}

// ── ЗАПИСЬ ───────────────────────────────────────────────────────────────────

if (DRY) {
  console.log(`\n  --dry: не записано ничего (${plan.length} тегов, ${reseed.length} мозгов)\n`);
  db.close();
  process.exit(0);
}

const now = Date.now();
const setTag = db.prepare('UPDATE creature SET reference_tag = ?, updated_at = ? WHERE id = ?');
const setBrain = db.prepare('UPDATE creature SET brain_source = ?, updated_at = ? WHERE id = ?');
for (const c of plan) setTag.run(c.tag, now, c.id);
for (const r of reseed) setBrain.run(STUBS[r.which], now, r.c.id);

/* Проверка ПОСЛЕ записи, а не доверие оператору `UPDATE`: та же ошибка, что
   ловят миграции в `db.js`, — «выполнилось» и «получилось» разные вещи. */
let bad = 0;
for (const c of plan) {
  const got = db.prepare('SELECT reference_tag FROM creature WHERE id = ?').get(c.id);
  if (got?.reference_tag !== c.tag) { bad++; console.error(`  ✗ ${c.id}: тег не записался`); }
}
for (const r of reseed) {
  const got = db.prepare('SELECT brain_source FROM creature WHERE id = ?').get(r.c.id);
  if (got?.brain_source !== STUBS[r.which]) { bad++; console.error(`  ✗ ${r.c.id}: мозг не записался`); }
}

console.log(`\n  записано: ${plan.length} тегов, ${reseed.length} мозгов${bad ? `, НЕ ПРОШЛО ${bad}` : ''}\n`);
db.close();
process.exit(bad ? 1 : 0);
