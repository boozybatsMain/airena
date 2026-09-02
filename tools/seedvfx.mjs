#!/usr/bin/env node
/**
 * Демо-существа для VFX: три элемента × два набора — шесть бойцов.
 *
 *   node tools/seedvfx.mjs              # добавить (или заменить по имени)
 *   node tools/seedvfx.mjs --el=frost   # один элемент
 *
 * Зачем отдельный скрипт, а не правка seed.mjs. Библиотека — измерительный
 * прибор (§16), её состав и пресеты завязаны на замеры; демо-боец прибором
 * не является и в библиотеку не идёт. Он заселяется КАК ИГРОВОЕ существо
 * (is_library = 0, state = active): боевой цикл сам подберёт ему соперника
 * из библиотеки и покажет бой в трансляции — ровно тот «настоящий бой»,
 * на котором принимается визуал.
 *
 * Почему два набора на элемент. Набор — ровно три умения (KIT_SIZE), а
 * элемент обязан показать пять доставок: клин, зону, оболочку, луч и
 * снаряд. Первый набор — контакт (конус, self, зона), второй — дистанция
 * (луч, болт, навес). Мозг — рукописный эталон kit-stub: он читает набор из
 * перцепции (F10) и пользуется каждым видом умения, то есть все силуэты
 * будут показаны без дрессировки. Набор проходит обычный `compileKit`: демо
 * не имеет права провозить в базу то, что не прошло бы у игрока.
 *
 * Элементы. Лёд, огонь и молния — приёмка визуала; пустота и кинетика сняты
 * с визуальной работы (решение основателя 02.09) и в демо-бои не идут.
 * Четыре новые стихии (гравитация, время, кислота, радиация) заданы ЯВНЫМИ
 * наборами через поле `kits`: у них закрытые списки форм (правило E1), и
 * общий шаблон «конус + себя + зона / луч + болт + навес» им не подходит —
 * у времени нет ни луча, ни снаряда вовсе.
 *
 * ПОКА ОСНОВАТЕЛЬ НЕ ПРИНЯЛ СТИХИЮ, сеять её надо в СТЕНДОВУЮ базу, а не в
 * боевую: заселённые существа активны, и боевой цикл выведет их в публичную
 * трансляцию.
 *
 *   AIRENA_DB=data/vfx-stand.db node tools/seedvfx.mjs --el=gravity
 *
 * и поднять вьюверы 8823/8830 с тем же `AIRENA_DB`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileKit } from '../src/skills/compile.js';
import { validateKit } from '../src/skills/registry.js';
import { constantsVersion } from '../src/core/version.js';
import { create as createCreature } from '../src/server/creatures.js';
import { openDb } from '../src/server/db.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DB_FILE = process.env.AIRENA_DB || join(ROOT, 'data/airena.db');
const only = (process.argv.find((a) => a.startsWith('--el=')) || '').slice(5);

/* Имя → тело чередуется, чтобы силуэты элементов не срослись с одной
   анатомией: у гориллы и осьминога разная высота, ширина и точка «руки». */
const ROSTER = [
  { el: 'frost', melee: 'ЛЕДОКОЛ', ranged: 'СТУЖА', body: 'gorilla', zone: 'damage', lob: 'damage' },
  { el: 'ember', melee: 'МАГМАРЬ', ranged: 'ПЕПЕЛ', body: 'octopus', zone: 'burn', lob: 'burn' },
  { el: 'arc', melee: 'РАЗРЯДНИК', ranged: 'ГРОЗА', body: 'gorilla', zone: 'damage', lob: 'damage' },

  /* Новые стихии: набор задан явно (форм-матрица docs/VFX-PLAN.md §6; по
     правилу L2 в наборе обязан быть один источник урона — можно чужой
     стихии, и это намеренно: время и гравитация существуют не ради урона). */
  { el: 'gravity', body: 'gorilla', kits: { 'ТЯЖЕСТЬ': [
    { delivery: 'zone', effects: ['pull', 'damage'], element: 'gravity' },
    { delivery: 'self', effects: ['boost'], channel: 'armor', element: 'gravity' },
    { delivery: 'cone', effects: ['damage'], element: 'kinetic' }] } },
  { el: 'gravity', body: 'octopus', kits: { 'ВОРОНКА': [
    { delivery: 'lob', effects: ['pull'], element: 'gravity' },
    { delivery: 'bolt', effects: ['damage'], element: 'kinetic' },
    { delivery: 'zone', effects: ['weaken'], channel: 'speed', element: 'gravity' }] } },
  { el: 'time', body: 'octopus', kits: { 'ХРОНОС': [
    { delivery: 'zone', effects: ['weaken'], channel: 'speed', element: 'time' },
    { delivery: 'self', effects: ['boost'], channel: 'speed', element: 'time' },
    { delivery: 'bolt', effects: ['damage'], element: 'kinetic' }] } },
  { el: 'acid', body: 'gorilla', kits: { 'ЩЁЛОЧЬ': [
    { delivery: 'cone', effects: ['burn'], element: 'acid' },
    { delivery: 'zone', effects: ['burn', 'weaken'], channel: 'armor', element: 'acid' },
    { delivery: 'self', effects: ['shield'], element: 'kinetic' }] } },
  { el: 'acid', body: 'octopus', kits: { 'КИСЛОТНИК': [
    { delivery: 'bolt', effects: ['damage'], element: 'acid' },
    { delivery: 'lob', effects: ['burn'], element: 'acid' },
    { delivery: 'beam', effects: ['damage'], element: 'kinetic' }] } },
  { el: 'radiation', body: 'gorilla', kits: { 'ИЗОТОП': [
    { delivery: 'zone', effects: ['burn', 'blind'], element: 'radiation' },
    { delivery: 'lob', effects: ['burn'], element: 'radiation' },
    { delivery: 'cone', effects: ['weaken'], channel: 'armor', element: 'radiation' }] } },
];

const kitsFor = (r) => r.kits || ({
  [r.melee]: [
    { delivery: 'cone', effects: ['damage'], element: r.el },
    { delivery: 'self', effects: ['shield'], element: r.el },
    { delivery: 'zone', effects: [r.zone], element: r.el },
  ],
  [r.ranged]: [
    { delivery: 'beam', effects: ['damage'], element: r.el },
    { delivery: 'bolt', effects: ['damage'], element: r.el },
    { delivery: 'lob', effects: [r.lob], element: r.el },
  ],
});

const db = openDb(DB_FILE);
let failed = false;

for (const r of ROSTER) {
  if (only && only !== r.el) continue;
  for (const [name, kit] of Object.entries(kitsFor(r))) {
    /*
     * Грамматика проверяется ЦЕЛИКОМ, а не только тем, что пробрасывает
     * `compileKit` (он отдаёт наружу лишь `size`, `kit_budget`, `kit_dup`).
     * Единственное исключение — `element_unreleased`: сид имеет право сеять
     * непринятую стихию в стендовую базу, игроку её всё равно не отдадут.
     */
    const illegal = validateKit(kit).filter((b) => b.code !== 'element_unreleased');
    if (illegal.length) {
      failed = true;
      console.error(name, '— набор не прошёл грамматику:');
      for (const b of illegal) console.error(' ·', b.ru || JSON.stringify(b));
      continue;
    }
    const out = compileKit(kit);
    if (out.problems.length) {
      failed = true;
      console.error(name, '— набор не прошёл грамматику:');
      for (const p of out.problems) console.error(' ·', JSON.stringify(p));
      continue;
    }
    /* Пересев тем же именем — замена, не дубль: демо гоняют много раз.
       Прежний НЕ удаляется, а списывается (`state = 'retired'`, как в
       `tools/retire.mjs`): на него ссылаются сыгранные бои, и DELETE
       упирается во внешний ключ. Списанный боец на арену не выходит. */
    for (const row of db.prepare(`SELECT id FROM creature WHERE name = ? AND owner_id IS NULL AND state = 'active'`).all(name)) {
      db.prepare(`UPDATE creature SET state = 'retired', updated_at = ? WHERE id = ?`).run(Date.now(), row.id);
      console.log('списан прежний', name, row.id);
    }
    const brainSource = readFileSync(join(ROOT, `brains/kit-stub/${r.body}.js`), 'utf8');
    const c = createCreature(db, {
      ownerId: null,
      name,
      bodyRef: r.body,
      kit,
      brainSource,
      brainModel: 'kit-stub',
      constantsVersion: constantsVersion(),
      prompt: null,
      unfit: [],
      isLibrary: false,
      kitActive: true,
    });
    console.log('заселён', name, c.id, '—', kit.map((s) => `${s.delivery}+${s.effects[0]}+${s.element}`).join(', '));
  }
}

/* Прежние демо пустоты и кинетики списываются: приёмка смотрит три элемента. */
for (const name of ['ПРОВАЛ', 'ТАРАН']) {
  for (const row of db.prepare(`SELECT id FROM creature WHERE name = ? AND owner_id IS NULL AND state = 'active'`).all(name)) {
    db.prepare(`UPDATE creature SET state = 'retired', updated_at = ? WHERE id = ?`).run(Date.now(), row.id);
    console.log('списан', name, row.id);
  }
}

process.exit(failed ? 1 : 0);
