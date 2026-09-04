#!/usr/bin/env node
/**
 * СБОРКА КЛИЕНТА В `dist/` — то, что можно отдать чужому раздатчику статики.
 *
 * Зачем она вообще появилась. До неё клиент существовал только как «то, что
 * раздаёт наш сервер»: страница, модули, three.js из `node_modules` — всё
 * приезжало маунтами `src/server/app.js`. Пока хост один, это правильно и
 * стоит ноль. Но GENEX раздаёт ТОЛЬКО статику (§12: платформа не даёт
 * серверный compute), а бэкенд Airena стоит отдельно — и `genex preview`
 * заливает ровно каталог `dist/`. Каталога не было, значит залить было нечего.
 *
 * ── ПОЧЕМУ КОПИРОВАНИЕ, А НЕ БАНДЛЕР ───────────────────────────────────────
 *
 * A6 просит сборку Vite, и когда-нибудь она тут будет. Сегодня она не купила
 * бы ничего: клиент — это ES-модули с картой импортов, three.js приезжает уже
 * собранным (`three.webgpu.min.js`), а порядок загрузки в `index.html`
 * выверен под F6 руками и с объяснением на каждую строку. Бандлер этот порядок
 * бы переписал, и первая же правка стоила бы того замера. Поэтому здесь обход
 * по ФАКТИЧЕСКИМ ссылкам и копирование — ровно то, что скачает браузер, и
 * ничего сверх.
 *
 * Обход — тот же, что у гейта объёма (`tools/checkscope.mjs`): один способ
 * ответить на вопрос «что такое бандл игрока», а не два расходящихся. Разница
 * одна: гейт в `node_modules` не заходит (там не наш код), а сборке вендорные
 * файлы нужны физически, поэтому по ним она идёт — но только по относительным
 * импортам, чтобы не выискивать ссылки регуляркой в минифицированном мегабайте.
 *
 *   node tools/build.mjs
 *   node tools/build.mjs --api=https://airena.example.com   # адрес бэкенда
 *   node tools/build.mjs --out=dist --verbose
 *
 * `--api` подставляется в `<meta name="airena-backend">`. Пусто — свой хост,
 * то есть прежнее поведение; `?api=` в адресе перебивает и то и другое.
 */

import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildStamp, stampHtml } from '../src/server/stamp.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
};
const VERBOSE = process.argv.includes('--verbose');
const OUT = resolve(ROOT, arg('out', 'dist'));
const API = String(arg('api', process.env.AIRENA_API || '')).trim().replace(/\/+$/, '');
/* Слаг игры на платформе. Обычно не нужен — страница выводит его из адреса, —
   но на своём домене выводить не из чего, и тогда его вписывают сюда. */
const SLUG = String(arg('slug', process.env.AIRENA_GENEX_SLUG || '')).trim();

if (API && !/^https?:\/\/[^/]+$/.test(API)) {
  console.error(`\n  --api должен быть абсолютным адресом без пути: получено «${API}»\n`);
  process.exit(2);
}

const ENTRY = '/';                       // URL страницы игрока
const TEXT = new Set(['.js', '.mjs', '.html', '.css']);

/** URL-префикс → каталог на диске. Порядок важен: `/` ловит всё, что осталось. */
const MOUNTS = [
  ['/viewer/', 'src/viewer'],
  ['/skills/', 'src/skills'],
  ['/vfx/', 'src/vfx'],
  ['/vendor/', 'node_modules/three/build'],
  ['/vendor-addons/', 'node_modules/three/examples/jsm'],
  ['/vendor-genex/', 'node_modules/@genex-ai/embed-sdk/dist'],
  ['/bodies/', 'bodies'],
  ['/assets/', 'preview/assets'],
  ['/fonts/', 'src/client/fonts'],
  ['/', 'src/client'],
];

/**
 * Ссылки, которые браузер выполнит.
 *
 * Динамический импорт ловится ВМЕСТЕ с шаблонной строкой: продукт грузит
 * вьювер как `import(`/viewer/main.js${v}`)` — со штампом сборки в конце. Берём
 * статический префикс до первой подстановки; в нём путь, а подстановка — версия.
 */
const LINK = /(?:from\s*['"`]([^'"`]+)['"`])|(?:import\s*\(\s*[`'"]([^`'"]*?)(?:\$\{[^}]*\})?[`'"])|(?:\bsrc\s*=\s*"([^"]+)")|(?:\bhref\s*=\s*"([^"]+)")|(?:\burl\(\s*['"]?([^'")]+)['"]?\s*\))/g;

/** В минифицированном вендоре ищем только настоящие импорты — и только свои. */
const VENDOR_LINK = /(?:from|import)\s*['"](\.[^'"]+)['"]/g;

/**
 * Карта импортов читается ИЗ СТРАНИЦЫ, а не переписывается сюда.
 *
 * Второй экземпляр карты разошёлся бы с первым в тот день, когда three.js
 * поменяет имя файла, и сборка молча не положила бы в `dist` тот единственный
 * модуль, который грузится по голому имени.
 */
function importMap(html) {
  const m = html.match(/<script\s+type="importmap"\s*>([\s\S]*?)<\/script>/i);
  if (!m) return {};
  try { return JSON.parse(m[1]).imports || {}; } catch { return {}; }
}

/** URL → файл на диске, либо `null`, если такого маунта нет. */
function toFile(url) {
  for (const [prefix, dir] of MOUNTS) {
    if (!url.startsWith(prefix)) continue;
    const rest = url.slice(prefix.length);
    return join(ROOT, dir, rest === '' ? 'index.html' : rest);
  }
  return null;
}

/** Разрешить ссылку из файла в URL. `null` — внешняя или не наша. */
function toUrl(ref, fromUrl, map) {
  let clean = String(ref || '').split('?')[0].split('#')[0].trim();
  if (!clean || /^(https?:|data:|mailto:|blob:)/.test(clean)) return null;

  if (!clean.startsWith('/') && !clean.startsWith('.')) {
    /* Голое имя модуля — только через карту импортов. */
    if (map[clean]) clean = map[clean];
    else {
      const pre = Object.keys(map).filter((k) => k.endsWith('/')).find((k) => clean.startsWith(k));
      if (!pre) return null;
      clean = map[pre] + clean.slice(pre.length);
    }
  }
  if (clean.startsWith('/')) return clean;

  const base = fromUrl.endsWith('/') ? fromUrl : fromUrl.replace(/[^/]*$/, '');
  const parts = (base + clean).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') { out.pop(); continue; }
    out.push(p);
  }
  return `/${out.join('/')}`;
}

/**
 * Что грузится динамически и потому не видно ни одной регулярке.
 *
 * Тела бойцов берутся ПО ИМЕНИ (`/bodies/${ref}.js` во вьювере): статически
 * там нет ни одной ссылки, а без файла бой рисует пустой пол. Список короткий
 * и лежит рядом с каталогом — если он разъедется, это заметит первый же бой.
 */
const EXTRA = ['/bodies/octopus.js', '/bodies/gorilla.js'];

function bundle() {
  const entryFile = toFile(ENTRY);
  const html = readFileSync(entryFile, 'utf8');
  const map = importMap(html);

  const seen = new Map();                       // url → файл на диске
  const missing = [];
  const queue = [ENTRY, ...EXTRA];

  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    const file = toFile(url);
    if (!file) continue;
    let stat;
    try { stat = statSync(file); } catch { missing.push(url); continue; }
    if (!stat.isFile()) { missing.push(url); continue; }
    seen.set(url, file);

    const ext = extname(file);
    if (!TEXT.has(ext)) continue;
    const text = readFileSync(file, 'utf8');
    /* Любой маунт вендора: `/vendor/`, `/vendor-addons/`, `/vendor-genex/`.
       В минифицированном чужом коде общая регулярка ссылок находит `src=` и
       `href=` внутри строк и уводит обход в несуществующие файлы. */
    const vendor = url.startsWith('/vendor');
    for (const m of text.matchAll(vendor ? VENDOR_LINK : LINK)) {
      const ref = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5];
      const next = toUrl(ref, url, map);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return { files: seen, missing };
}

const { files, missing } = bundle();

/* Ссылка, которая никуда не ведёт, — это не «почти собралось». В браузере она
   станет 404 на модуль, то есть чёрным экраном без единой понятной строки. */
if (missing.length) {
  console.error('\n  ССЫЛКИ В НИКУДА — сборка остановлена:');
  for (const m of missing) console.error(`    ${m}`);
  console.error('');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });

const stamp = buildStamp(ROOT, false);
let bytes = 0;
for (const [url, file] of files) {
  const rel = url === '/' ? 'index.html' : url.replace(/^\//, '');
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });

  if (url === ENTRY) {
    /* Страница — единственный файл, который правится: в неё уезжает адрес
       бэкенда и штамп сборки, которым помечена вся остальная статика. */
    const html = readFileSync(file, 'utf8')
      .replace(/<meta name="airena-backend" content="[^"]*">/,
        `<meta name="airena-backend" content="${API}">`)
      .replace(/<meta name="genex-slug" content="[^"]*">/,
        `<meta name="genex-slug" content="${SLUG}">`);
    const body = stampHtml(html, stamp);
    writeFileSync(dest, body);
    bytes += Buffer.byteLength(body);
  } else {
    copyFileSync(file, dest);
    bytes += statSync(file).size;
  }
  if (VERBOSE) console.log(`    ${url}`);
}

const n = files.size;
console.log(`\n  собрано в ${relative(ROOT, OUT)}/: ${n} файлов, ${(bytes / 1024 / 1024).toFixed(1)} МБ`);
console.log(`  бэкенд: ${API || 'свой хост (относительные /api/…)'}`);
console.log(`  слаг: ${SLUG || 'из адреса страницы'}`);
console.log(`  штамп: ${stamp}`);

/* A6 держит бандл в двухстах файлах. Гейт стоит здесь, а не только в
   `checkscope`, потому что нарушают его именно сборкой: «положу на всякий
   случай всю папку» — это одна строка и плюс сто файлов. */
if (n > 200) {
  console.error(`\n  A6 ПРОБИТ: ${n} файлов бандла при пределе 200\n`);
  process.exit(1);
}
console.log('  A6: предел 200 файлов не пробит\n');
