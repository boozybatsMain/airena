#!/usr/bin/env node
/**
 * ОБРАЗ ВЕЗЁТ ВСЁ, ЧТО СЕРВЕР ПРОСИТ С ДИСКА.
 *
 * ── ОТКАЗ, РАДИ КОТОРОГО ЭТОТ ГЕЙТ НАПИСАН (05.09, прод) ────────────────────
 *
 * Игрок написал «мощный крокодил», заплатил, дождался — и получил осьминога.
 * Задание при этом закрылось УСПЕШНО: `state: done`, ошибок нет, $0.018 списано.
 * В заметке рождения лежало:
 *
 *     Build failed with 1 error:
 *     error: Could not resolve "/app/packages/forge/src/index.ts"
 *
 * Dockerfile копировал `src`, `tools`, `bodies`, `brains` — и не копировал
 * `packages/`, где живёт грамматика тела. Конвейер поймал отказ, надел стоковое
 * тело и пошёл дальше (D117: существо рождается даже если тело не собралось), а
 * в телеметрию ушло `body_rejected` — то есть след был, но только после того,
 * как за генерацию заплатили.
 *
 * ── ПОЧЕМУ ИМЕННО ТАК, А НЕ СПИСКОМ ─────────────────────────────────────────
 *
 * Список «что положить в образ» разошёлся бы с кодом на первой же новой
 * зависимости от диска — ровно так он и разошёлся. Поэтому здесь не список, а
 * ВЫВОД: пути вынимаются из самих исходников (`join(ROOT, '…')`) и сверяются с
 * тем, что кладёт Dockerfile. Появится новый `join(ROOT, 'что-то')` — гейт
 * потребует его положить, ничего не зная про то, зачем он.
 *
 *   node tools/checkimage.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Файлы сервера — только они исполняются в контейнере. */
function serverFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) serverFiles(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const SOURCES = [
  ...serverFiles(join(ROOT, 'src/server')),
  join(ROOT, 'src/skills/registry.js'),
  join(ROOT, 'src/skills/compile.js'),
];

/* `join(ROOT, 'что-то/…')` — единственная форма, которой сервер трогает диск. */
const ROOTPATH = /join\(\s*ROOT\s*,\s*'([^']+)'/g;

const wanted = new Map();          // корневой каталог → где просят
for (const f of SOURCES) {
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  for (const m of text.matchAll(ROOTPATH)) {
    const top = m[1].split('/')[0];
    if (!top || top.startsWith('.')) continue;
    if (!wanted.has(top)) wanted.set(top, []);
    wanted.get(top).push(f.slice(ROOT.length + 1));
  }
}

/**
 * Что образ создаёт сам, а не копирует.
 *
 * `data` — том с базой, монтируется снаружи. `reports` — пустой каталог,
 * который `seed` только перечисляет. `node_modules` и `package.json` кладёт
 * отдельная стадия сборки. Всё это в Dockerfile есть, просто не как `COPY`.
 */
const PROVIDED_OTHERWISE = new Set(['data', 'reports', 'node_modules', 'package.json']);

/**
 * Каталоги, которые сервер трогает ТОЛЬКО на дев-поверхности.
 *
 * `preview/assets` монтируется на `/assets/`, но бандл игрока туда не ходит —
 * это картинки дев-страницы вьювера (`checkscope` обходит бандл по фактическим
 * ссылкам и `/assets/` в нём не находит). Класть 5.7 МБ в продакшен-образ ради
 * страницы, которой в продакшене нет, незачем.
 */
const DEV_ONLY = new Set(['preview']);

const dockerfile = readFileSync(join(ROOT, 'Dockerfile'), 'utf8');
const copied = new Set(
  [...dockerfile.matchAll(/^COPY\s+(?:--from=\S+\s+)?(\S+)\s+\S+$/gm)]
    .map((m) => m[1].replace(/^\.?\//, '').split('/')[0]),
);

const missing = [];
for (const [top, where] of wanted) {
  if (PROVIDED_OTHERWISE.has(top) || DEV_ONLY.has(top) || copied.has(top)) continue;
  if (!existsSync(join(ROOT, top))) continue;   // путь необязательный, его и нет
  missing.push({ top, where: [...new Set(where)] });
}

console.log('\n  ОБРАЗ ПРОТИВ ТОГО, ЧТО ПРОСИТ СЕРВЕР\n');
for (const [top] of [...wanted].sort()) {
  const state = PROVIDED_OTHERWISE.has(top) ? 'создаётся в образе'
    : DEV_ONLY.has(top) ? 'только дев-поверхность'
      : copied.has(top) ? 'COPY есть'
        : 'НЕ КОПИРУЕТСЯ';
  console.log(`  ${missing.some((m) => m.top === top) ? '✗' : '✓'} ${top.padEnd(16)} ${state}`);
}

if (missing.length) {
  console.log('\n  ЧЕГО НЕ ХВАТИТ В КОНТЕЙНЕРЕ:');
  for (const m of missing) {
    console.log(`    ${m.top}  — просят: ${m.where.slice(0, 3).join(', ')}`);
  }
  console.log('\n  Отказ будет МОЛЧАЛИВЫМ: конвейер ловит его, ставит запасное и');
  console.log('  закрывает задание успешно. Игрок платит и получает не то.\n');
  process.exit(1);
}

/* И сама точка входа грамматики тела — та, на которой всё сломалось. */
const FORGE_ENTRY = 'packages/forge/src/index.ts';
if (!existsSync(join(ROOT, FORGE_ENTRY))) {
  console.log(`\n  НЕТ ${FORGE_ENTRY} — тело не соберётся ни на одной модели\n`);
  process.exit(1);
}
const kb = Math.round(statSync(join(ROOT, FORGE_ENTRY)).size / 1024);
console.log(`\n  точка входа грамматики тела на месте: ${FORGE_ENTRY} (${kb} КБ)`);
console.log(`  образ везёт всё, что сервер просит с диска — ${wanted.size} корневых путей\n`);
