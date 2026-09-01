/**
 * Объём, принуждённый кодом — гейт по E6, N1, N7, N8, F4.
 *
 * §4.4 — это таблица из двадцати запретов, и каждый из них привлекательная
 * идея, к которой кодовая база дрейфует сама. Запрет, который никто не
 * проверяет, живёт ровно до первого агента, который «просто добавил кнопку»:
 * не по злому умыслу, а потому что кнопка выглядела уместной, а таблица
 * лежала в другом файле.
 *
 * Проверяется КЛИЕНТСКИЙ бандл — то, что видит игрок. Сервер имеет право
 * знать цену связки: он на неё считает бюджет (E3). Игрок не имеет права
 * увидеть ни одной, потому что E6 говорит «ни SKU, ни цен, ни подписки,
 * ни каталога, ни чекаута» — включая заглушку.
 *
 *   node tools/checkscope.mjs
 *   node tools/checkscope.mjs --verbose
 */

import { readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

/**
 * Что смотрим: РЕАЛЬНЫЙ бандл игрока, а не папку.
 *
 * «Папка src/viewer» — неверное определение: в ней лежит и дев-панель, и
 * дев-страница, которых в продукте нет. Но и «папка src/client» неверно с
 * другой стороны: продукт грузит `main.js` из вьювера, и запрет обязан
 * доставать туда. Поэтому обход идёт от страницы игрока по фактическим
 * ссылкам — тому, что браузер действительно скачает.
 */
const ENTRY = 'src/client/index.html';
const EXT = new Set(['.js', '.mjs', '.html', '.css']);

/** Куда ведут пути вида `/viewer/main.js`, `/ui/kit.css`. */
const MOUNTS = [
  ['/viewer/', 'src/viewer'],
  ['/skills/', 'src/skills'],
  ['/vendor/', 'node_modules/three/build'],
  ['/vendor-addons/', 'node_modules/three/examples/jsm'],
  ['/bodies/', 'bodies'],
  ['/assets/', 'preview/assets'],
  ['/fonts/', 'src/client/fonts'],
  ['/', 'src/client'],
];

/**
 * Ссылки, которые браузер выполнит: импорты, script src, link href.
 *
 * Динамический импорт ловится ВМЕСТЕ с шаблонной строкой: продукт грузит
 * вьювер как `import(\`/viewer/main.js${'$'}{v}\`)` — со штампом сборки в конце, —
 * и регулярка, требующая чистой строки, пропускала ровно тот файл, ради
 * которого гейт заходит во вьювер вообще. Берём статический ПРЕФИКС до
 * первой подстановки: путь в нём, а подстановка — версия.
 */
const LINK = /(?:from\s*['"`]([^'"`]+)['"`])|(?:import\s*\(\s*[`'"]([^`'"]*?)(?:\$\{[^}]*\})?[`'"])|(?:\bsrc\s*=\s*"([^"]+)")|(?:\bhref\s*=\s*"([^"]+)")|(?:@import\s+url\(([^)]+)\))/g;

function resolveRef(ref, fromFile) {
  const clean = ref.split('?')[0].split('#')[0];
  if (!clean || /^(https?:|data:|mailto:)/.test(clean)) return null;
  if (clean.startsWith('/')) {
    for (const [prefix, dir] of MOUNTS) {
      if (!clean.startsWith(prefix)) continue;
      return join(ROOT, dir, clean.slice(prefix.length));
    }
    return null;
  }
  return resolve(dirname(fromFile), clean);
}

/** Обход от страницы игрока. Вендорные модули не проверяются: они не наши. */
function bundle() {
  const seen = new Set();
  const queue = [join(ROOT, ENTRY)];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f) || !EXT.has(extname(f))) continue;
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    seen.add(f);
    if (relative(ROOT, f).startsWith('node_modules')) continue;
    for (const m of text.matchAll(LINK)) {
      const ref = m[1] || m[2] || m[3] || m[4] || m[5];
      const next = resolveRef(String(ref || '').replace(/['"]/g, ''), f);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen].filter((f) => !relative(ROOT, f).startsWith('node_modules'));
}

/**
 * Запреты. `why` — пункт ТЗ, `allow` — контексты, в которых совпадение
 * законно (например, слово «цена» в комментарии про то, почему цены нет).
 */
const RULES = [
  {
    id: 'E6/N1 цена',
    why: 'E6: ни SKU, ни цен, ни чекаута. N1: никакой affordance «купить»',
    re: /\$\s?\d|\d+\s?(?:руб|USD|EUR)\b|\bцена\b|\bстоимость\b|\bоплат|\bкупить\b|\bпокупк|\bчекаут|\bкорзин|\bподписк|\bприобрест/giu,
  },
  {
    id: 'E6 платёжный SDK',
    why: 'E6: платёжный рельс не строится',
    re: /\bcommerce\s*\.\s*(?:buy|getShop|consumeEntitlement)|\bstripe\b|\bstorekit\b|\bplayBilling\b|\bcheckout\b/gi,
  },
  {
    id: 'F4 слово «токен»',
    why: 'F4: слово «токен» запрещено в спецификации и в UI',
    re: /\bтокен/giu,
  },
  {
    id: 'N2 ставки',
    why: 'N2: ставки, тотализатор, банкролл, любая механика ставок на исход',
    re: /\bставк[аиуе]\b|\bпоставить на\b|\bтотализатор|\bкоэффициент[ыа]?\s+на\b/giu,
  },
  {
    id: 'N8 звук',
    why: 'N8: звука в v1 нет',
    re: /new\s+Audio\b|\bAudioContext\b|\.play\(\)\s*;|\bnew\s+Howl\b/g,
  },
  {
    id: 'N7 косметика',
    why: 'N7: скины, палитры, портреты, баннеры как товар',
    re: /\bскин[ыаоу]?\b|\bкосметик/giu,
  },
  {
    id: 'F11/N19 исходник мозга',
    why: 'F11: исходник мозга игрока не покидает сервер; N19 называет каждый путь',
    re: /brain_?[Ss]ource|\/api\/source\//g,
  },
  {
    id: 'A6 запрещённые affordance',
    why: 'A6: без window.open, alert, confirm, форм и клиентских загрузок',
    re: /\bwindow\.open\s*\(|(?<![\w.])alert\s*\(|(?<![\w.])confirm\s*\(|<form\b|\bdownload\b\s*=/gi,
  },
  {
    id: 'D21 жаргон в UI',
    why: 'D21: в интерфейсе «набор» и «умения», а не «кит» и «скиллы»',
    /* Только в строковых литералах кириллицей — имена переменных `kit`
       и `skills` в коде законны и нужны. */
    re: /['"`][^'"`]*\b(?:кит|скилл\w*)\b[^'"`]*['"`]/giu,
  },
];

/** Строки, которые ОБЪЯСНЯЮТ запрет, а не нарушают его. */
const EXEMPT = [
  /^\s*[/*]/,                       // комментарий
  /^\s*\*/,                         // продолжение блочного комментария
  /запрещ|нельзя|не строится|не показыва|не бывает|отсутств|N\d\b|E6\b|F4\b|F11\b|N19\b/iu,
];

/*
 * Вторая поверхность: РУССКИЕ строки сервера.
 *
 * Гейт, смотрящий только на клиент, пропускает половину копирайта: сообщения
 * об отказах, названия атомов грамматики и подписи стадий приезжают с сервера
 * и читаются игроком точно так же. Замерено: «кит не проходит правила» и
 * «два скилла в ките делают одно и то же» уезжали в браузер из
 * `src/skills/registry.js`, мимо проверки, которая формально была зелёной.
 *
 * Проверяются только правила КОПИРАЙТА (D21 и F4): в коде сервера `kit` и
 * `skills` как идентификаторы законны и нужны.
 */
const SERVER_COPY = ['src/skills/registry.js', 'src/server/api.js', 'src/server/limits.js',
  'src/server/jobs.js', 'src/server/forge/pipeline.js', 'src/server/adapt.js', 'src/server/creatures.js'];
const COPY_RULES = new Set(['D21 жаргон в UI', 'F4 слово «токен»']);

const FILES = bundle();

const hits = [];
for (const [surface, list] of [['bundle', FILES], ['server', SERVER_COPY.map((f) => join(ROOT, f))]]) {
  for (const f of list) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    for (const rule of RULES) {
      if (surface === 'server' && !COPY_RULES.has(rule.id)) continue;
      rule.re.lastIndex = 0;
      for (const m of text.matchAll(rule.re)) {
        const before = text.slice(0, m.index);
        const ln = before.split('\n').length;
        const line = lines[ln - 1] || '';
        if (EXEMPT.some((e) => e.test(line))) continue;
        hits.push({ file: relative(ROOT, f), line: ln, rule, match: m[0].trim(), text: line.trim() });
      }
    }
  }
}

console.log('\n  запрет                        нарушений');
console.log('  ' + '─'.repeat(60));
for (const rule of RULES) {
  const mine = hits.filter((h) => h.rule.id === rule.id);
  console.log(`  ${rule.id.padEnd(28)} ${mine.length ? `✗ ${mine.length}` : '✓ 0'}`);
  for (const h of (VERBOSE ? mine : mine.slice(0, 4))) {
    console.log(`      ${h.file}:${h.line}  «${h.match}»`);
    console.log(`        ${h.text.slice(0, 110)}`);
  }
  if (mine.length) console.log(`      → ${rule.why}`);
}

const n = FILES.length;
console.log('  ' + '─'.repeat(60));
if (VERBOSE) { console.log('\n  бандл игрока:'); for (const f of FILES) console.log(`    ${relative(ROOT, f)}`); }

/*
 * НАША БУХГАЛТЕРИЯ НЕ УЕЗЖАЕТ АНОНИМУ.
 *
 * `checkscope` смотрит бандл игрока на цены и покупки (E6, N1). Но деньги
 * утекали не через бандл, а через API: `/api/session`, `/api/limits` и
 * `/api/metrics` отдавали дневной бюджет, потрачено и остаток КОМУ УГОДНО.
 * Кроме того что это чужое дело, это подсказка тому, кто хочет выжечь
 * бюджет: видно, сколько осталось.
 *
 * Проверяется по ФОРМЕ ответа, а не по коду: сервер поднимается, три ручки
 * опрашиваются без сессии, и ни одно поле с `usd` в имени не имеет права
 * там оказаться. Под `AIRENA_OPS=1` — имеет, и это отдельный режим.
 */
async function checkMoneyLeak() {
  const { spawn } = await import('node:child_process');
  const port = 8900 + Math.floor(Math.random() * 90);
  const srv = spawn('node', [join(ROOT, 'src/server/app.js')], {
    env: { ...process.env, PORT: String(port), AIRENA_DEV: '1', AIRENA_OPS: '', OPENROUTER_API_KEY: 'x' },
    stdio: 'ignore',
  });
  const wait = async () => {
    for (let i = 0; i < 60; i++) {
      try { await fetch(`http://localhost:${port}/api/session`); return true; } catch { /* ещё поднимается */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };
  const found = [];
  try {
    if (!(await wait())) { srv.kill(); return ['сервер не поднялся — проверка пропущена']; }
    for (const ep of ['session', 'limits', 'metrics']) {
      const text = await (await fetch(`http://localhost:${port}/api/${ep}`)).text();
      for (const m2 of text.matchAll(/"([A-Za-z]*[Uu][Ss][Dd][A-Za-z]*)"\s*:/g)) {
        found.push(`/api/${ep} отдаёт ${m2[1]}`);
      }
    }
  } finally { srv.kill(); }
  return found;
}

const leaked = await checkMoneyLeak();
if (leaked.length) {
  console.log('\n  ДЕНЬГИ УТЕКАЮТ В API:');
  for (const l of leaked) console.log(`    ${l}`);
  process.exitCode = 1;
} else {
  console.log('  наша бухгалтерия анониму не видна: session, limits, metrics — без сумм');
}

console.log(`\n  ${hits.length ? `ОБЪЁМ ПРОБИТ — ${hits.length} нарушений`
  : `объём держится — ${n} файлов бандла и ${SERVER_COPY.length} файлов серверного копирайта, ни одного нарушения`}\n`);
process.exit(hits.length ? 1 : 0);
