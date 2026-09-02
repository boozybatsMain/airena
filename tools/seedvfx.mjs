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
 * Элементов три, а не пять: пустота и кинетика сняты с визуальной работы
 * (решение основателя 02.09) и в демо-бои не идут, чтобы приёмка смотрела
 * только на лёд, огонь и молнию.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileKit } from '../src/skills/compile.js';
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
];

const kitsFor = (r) => ({
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
    const out = compileKit(kit);
    if (out.problems.length) {
      failed = true;
      console.error(name, '— набор не прошёл грамматику:');
      for (const p of out.problems) console.error(' ·', JSON.stringify(p));
      continue;
    }
    /* Пересев тем же именем — замена, не дубль: демо гоняют много раз. */
    for (const row of db.prepare('SELECT id FROM creature WHERE name = ? AND owner_id IS NULL').all(name)) {
      db.prepare('DELETE FROM creature WHERE id = ?').run(row.id);
      console.log('снят прежний', name, row.id);
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

/* Прежние демо пустоты и кинетики снимаются: приёмка смотрит три элемента. */
for (const name of ['ПРОВАЛ', 'ТАРАН']) {
  for (const row of db.prepare('SELECT id FROM creature WHERE name = ? AND owner_id IS NULL').all(name)) {
    db.prepare('DELETE FROM creature WHERE id = ?').run(row.id);
    console.log('снят', name, row.id);
  }
}

process.exit(failed ? 1 : 0);
