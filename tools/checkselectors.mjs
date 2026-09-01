/**
 * Гейт: каждый селектор, который клиент передаёт в `h()`, обязан разбираться.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ ПРОВЕРКА. `h()` бросает на неразобранном селекторе, и бросает
 * во время построения экрана — то есть падает НЕ элемент, а весь экран.
 * Замерено на живом: `h('div.t-body#author', …)` не разбирался, потому что
 * регулярка требовала id строго перед классами, и экран разбора боя падал при
 * каждом открытии. Именно тот экран, который F11 назначил заменой закрытому
 * исходнику — главным доказательством, что бой написала нейросеть.
 *
 * `npm test` при этом был зелёным: ни один гейт не открывал экраны. Строковый
 * селектор — это код, который не проверяет ни компилятор, ни линтер, и
 * ошибиться в нём стоит ровно один символ.
 *
 * ЧТО ЭТО НЕ ЛОВИТ. Только литералы. Селектор, собранный из переменной, здесь
 * не виден — таких в клиенте нет, и если появятся, это отдельный разговор.
 * И это не замена проверке, что экран открывается: она глубже и дороже.
 *
 *   node tools/checkselectors.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Та же регулярка, что в `src/client/lib/dom.js`. Расхождение — тоже дефект. */
const SELECTOR = /^([a-z][a-z0-9]*)?((?:[#.][\w-]+)*)$/i;

/**
 * Литералы первого аргумента `h(...)` — включая шаблонные и вложенные.
 *
 * Регуляркой это не берётся: `h(`div.panel${lift ? `.lift` : ''}`)` содержит
 * шаблонную строку ВНУТРИ подстановки, и любой нежадный поиск обрывается на
 * первой внутренней кавычке. Поэтому разбор посимвольный со счётчиком глубины
 * `${}` — единственный способ прочитать такое правильно.
 *
 * Каждая подстановка заменяется на слово-заглушку: `button.btn.${kind}`
 * становится `button.btn.X`, и статический скелет проверяется целиком.
 * Чего это не ловит: подстановку, которая сама подставит мусор. Наблюдаемый
 * класс ошибок — опечатка в литерале, и он закрыт.
 */
function selectorsIn(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    /* Начало вызова `h(` с кавычкой любого вида. */
    if (!(src[i] === 'h' && src[i + 1] === '(' && !/[\w$.]/.test(src[i - 1] || ' '))) continue;
    let j = i + 2;
    while (j < src.length && /\s/.test(src[j])) j++;
    const q = src[j];
    if (q !== '"' && q !== "'" && q !== '`') continue;
    let k = j + 1; let depth = 0; let text = '';
    for (; k < src.length; k++) {
      const c = src[k];
      if (c === '\\') { text += c + (src[k + 1] || ''); k++; continue; }
      if (q === '`' && c === '$' && src[k + 1] === '{') { depth++; k++; text += 'X'; continue; }
      if (depth > 0) {
        if (c === '{') depth++;
        else if (c === '}') depth--;
        continue;                       /* внутренность подстановки не нужна */
      }
      if (c === q) break;
      if (c === '\n') break;           /* оборвалось — не селектор */
      text += c;
    }
    if (src[k] === q) out.push(text);
    i = k;
  }
  return out;
}

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const f = join(dir, name);
    if (statSync(f).isDirectory()) { out.push(...files(f)); continue; }
    if (f.endsWith('.js')) out.push(f);
  }
  return out;
}

/* Проверяем, что гейт и `h()` пользуются ОДНОЙ регуляркой: разойдутся — и
   гейт начнёт врать в любую сторону, а это хуже его отсутствия. */
const dom = readFileSync(join(ROOT, 'src/client/lib/dom.js'), 'utf8');
const inDom = dom.match(/spec2\.match\((\/[^\n]*?\/i)\)/);
const same = inDom && inDom[1] === SELECTOR.toString();

const bad = [];
let checked = 0;
for (const f of files(join(ROOT, 'src/client'))) {
  const src = readFileSync(f, 'utf8');
  for (const skel of selectorsIn(src)) {
    checked++;
    if (!SELECTOR.test(skel)) bad.push(`${relative(ROOT, f)}: скелет '${skel}'`);
  }
}

console.log(`\n  СЕЛЕКТОРЫ: ${checked} литералов в клиенте\n`);
if (!same) {
  console.log(`  ✗ регулярка гейта разошлась с той, что в dom.js — сверь их`);
  console.log(`      гейт:   ${SELECTOR}`);
  console.log(`      dom.js: ${inDom ? inDom[1] : 'не найдена'}`);
} else {
  console.log('  ✓ гейт и h() пользуются одной регуляркой');
}
if (bad.length) {
  console.log(`  ✗ не разбираются (экран упадёт целиком при открытии):`);
  for (const b of bad.slice(0, 10)) console.log(`      ${b}`);
} else {
  console.log(`  ✓ все ${checked} разбираются`);
}
console.log(`\n  ${bad.length || !same ? 'ПРОВАЛ' : 'ДЕРЖИТ'}\n`);
process.exitCode = (bad.length || !same) ? 1 : 0;
