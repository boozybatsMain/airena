#!/usr/bin/env node
/**
 * Which brains were written against a world that no longer exists?
 *
 *   node tools/checkstale.mjs
 *
 * A generated brain reads its numbers out of the prompt and hard-codes some of
 * them — a cooldown it counts down itself, a range it compares against. Move a
 * constant afterwards and the program is not wrong, it is MISINFORMED, and the
 * difference shows up as a win rate rather than as an error. This prints the
 * diff per population so that "the octopus got worse" can be separated from
 * "the octopus was told something else".
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILD_AXES, BUILD_BUDGET, SKILLS } from '../src/core/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/*
 * ЧТО СРАВНИВАЕТСЯ: ОСИ ТЕЛОСЛОЖЕНИЯ И УМЕНИЯ.
 *
 * Здесь стояла секция `fighters` — две записи архетипов, из которых боец
 * наследовал тело целиком. Записей больше нет: числа тела принадлежат
 * существу, а `BUILD_AXES` задаёт только границы и цену осей, `BUILD_BUDGET` —
 * потолок трат. Сравнивать поэтому надо их: сдвиг границы или цены меняет мир
 * ровно так же, как раньше его менял сдвиг здоровья гориллы.
 *
 * Мозг, у которого в провенансе записан `fighters`, писался против мира, где
 * тело выдавалось стороной арены. Это не «сдвинулась константа» — это «исчезла
 * таблица», и такая популяция помечается отдельной строкой, а не сотней
 * расхождений, каждое из которых говорит одно и то же.
 */
const now = { build: BUILD_AXES, skills: SKILLS };

const dirs = [
  join(ROOT, 'brains'),
  ...readdirSync(join(ROOT, 'reports')).filter((d) => d.startsWith('brains-')).map((d) => join(ROOT, 'reports', d)),
  ...(existsSync(join(ROOT, 'reports/archive'))
    ? readdirSync(join(ROOT, 'reports/archive')).filter((d) => d.startsWith('brains-')).map((d) => join(ROOT, 'reports/archive', d))
    : []),
];

let anyStale = false;
for (const base of dirs) {
  if (!existsSync(base)) continue;
  for (const tag of readdirSync(base).sort()) {
    const dir = join(base, tag);
    if (!statSync(dir).isDirectory()) continue;
    const diffs = new Set();
    let seen = 0, noRecord = 0, archetypes = 0;
    for (const id of ['octopus', 'gorilla']) {
      const p = join(dir, `${id}.json`);
      if (!existsSync(p)) continue;
      seen++;
      const rec = JSON.parse(readFileSync(p, 'utf8'));
      if (!rec.constants) { noRecord++; continue; }
      if (rec.constants.fighters) { archetypes++; continue; }
      /* Потолок трат — скаляр, а не таблица, и обходом секций он не ловится.
         Он при этом важнее любой отдельной оси: сдвинули потолок — сдвинулись
         ВСЕ законные тела разом. */
      if (typeof rec.constants.buildBudget === 'number' && rec.constants.buildBudget !== BUILD_BUDGET) {
        diffs.add(`buildBudget: was ${rec.constants.buildBudget}, now ${BUILD_BUDGET}`);
      }
      for (const section of ['build', 'skills']) {
        for (const [k, table] of Object.entries(rec.constants[section] || {})) {
          for (const [f, v] of Object.entries(table)) {
            const cur = now[section]?.[k]?.[f];
            if (typeof v === 'number' && cur !== v) diffs.add(`${section}.${k}.${f}: was ${v}, now ${cur}`);
          }
        }
      }
    }
    if (seen === 0) continue;
    const where = base.includes('reports')
      ? `${base.slice(base.indexOf('reports'))}/${tag}`
      : `brains/${tag}`;
    if (noRecord === seen) console.log(`  ${where.padEnd(34)} no constants recorded (generated before provenance was added)`);
    else if (archetypes) {
      anyStale = true;
      console.log(`  ${where.padEnd(34)} STALE — written against the ARCHETYPE bodies, and there are none:`);
      console.log('      its provenance records FIGHTERS.octopus / FIGHTERS.gorilla, two tables that no longer exist.');
      console.log('      A body is now the creature\'s own (BUILD_AXES within BUILD_BUDGET) and is inherited from nobody.');
    } else if (diffs.size === 0) console.log(`  ${where.padEnd(34)} current`);
    else {
      anyStale = true;
      console.log(`  ${where.padEnd(34)} STALE — ${diffs.size} constant(s) moved since it was written:`);
      for (const d of [...diffs].sort()) console.log(`      ${d}`);
    }
  }
}
if (!anyStale) console.log('\nevery population with recorded provenance matches the current constants.');
