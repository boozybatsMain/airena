/**
 * Экраны обязаны собираться — гейт, которого не было.
 *
 * `npm test` был зелёным ровно в тот день, когда `/new` не открывался вовсе:
 * из `kit.js` убрали объявление `t` вместе с осью триггеров, а два обращения к
 * нему остались. `describe()` и `costLocal()` падали на `t is not defined`, а с
 * ними — экран набора, карточка существа и экран создания. Экран создания это
 * ЕДИНСТВЕННЫЙ путь к генерации, то есть к требованию основателя номер один.
 *
 * Ни один из двадцати четырёх гейтов этого не видел, потому что ни один не
 * исполнял клиентский код. Дыра была не в коде, а в наборе приборов.
 *
 * ── ПОЧЕМУ РАЗБОР, А НЕ БРАУЗЕР ────────────────────────────────────────────
 *
 * Браузер поймал бы это лучше, но в зависимостях проекта лежат `three` и `ws`,
 * и заводить `jsdom` или `playwright` ради одной проверки — это плата, которую
 * платят все и всегда. Свободная переменная видна СТАТИЧЕСКИ: у неё нет ни
 * объявления, ни параметра, ни импорта, ни места в списке того, что даёт
 * браузер. Именно это здесь и ищется — тем же `acorn`, которым разбираются
 * чужие тела.
 *
 * Чего этот гейт НЕ ловит: опечатку в имени поля, неверный порядок вызовов,
 * пустой список, `undefined` в разметке. Он ловит один класс — обращение к
 * имени, которого нет, — и именно этот класс уронил продуктовый путь.
 *
 *   node tools/checkscreens.mjs
 *   node tools/checkscreens.mjs --verbose
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const { parse } = createRequire(join(ROOT, 'package.json'))('acorn');

/* Что даёт браузер. Список короткий нарочно: чем он длиннее, тем больше
   опечаток он пропускает, а всё редкое лучше прочитать через `globalThis`. */
const BROWSER = new Set([
  'window', 'document', 'navigator', 'location', 'history', 'localStorage',
  'sessionStorage', 'fetch', 'WebSocket', 'Headers', 'Request', 'Response',
  'URL', 'URLSearchParams', 'FormData', 'Blob', 'File', 'FileReader',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'CustomEvent',
  'Event', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver',
  'performance', 'console', 'alert', 'confirm', 'crypto', 'atob', 'btoa',
  'innerWidth', 'innerHeight', 'devicePixelRatio', 'matchMedia', 'getComputedStyle',
  'Image', 'Audio', 'Worker', 'AbortController', 'TextEncoder', 'TextDecoder',
  'structuredClone', 'reportError', 'scrollTo', 'open', 'close', 'DOMParser',
  'HTMLElement', 'SVGElement', 'Node', 'NodeList', 'Element', 'CanvasRenderingContext2D',
  'EventTarget', 'AbortSignal', 'BroadcastChannel', 'IdleDeadline',
  'GPUShaderStage', 'ImageData', 'OffscreenCanvas', 'IntersectionObserverEntry',
]);
const JS = new Set([
  'globalThis', 'undefined', 'NaN', 'Infinity', 'Object', 'Array', 'String',
  'Number', 'Boolean', 'Symbol', 'BigInt', 'Math', 'JSON', 'Date', 'RegExp',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Proxy', 'Reflect', 'Error',
  'TypeError', 'RangeError', 'SyntaxError', 'EvalError', 'ReferenceError',
  'Function', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
  'decodeURIComponent', 'encodeURI', 'decodeURI', 'ArrayBuffer', 'DataView',
  'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array',
  'Intl', 'arguments', 'Iterator', 'AggregateError', 'FinalizationRegistry', 'WeakRef',
]);

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Имена, объявленные узлом-паттерном. */
function names(p, into) {
  if (!p) return;
  switch (p.type) {
    case 'Identifier': into.add(p.name); break;
    case 'ObjectPattern': for (const q of p.properties) names(q.value || q.argument, into); break;
    case 'ArrayPattern': for (const q of p.elements) names(q, into); break;
    case 'AssignmentPattern': names(p.left, into); break;
    case 'RestElement': names(p.argument, into); break;
    case 'Property': names(p.value, into); break;
    default: break;
  }
}

/** Свободные имена файла: то, что читается и нигде не объявлено. */
function freeNames(src) {
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const scopes = [new Set()];
  const free = [];
  const declared = (n) => scopes.some((s) => s.has(n));
  const declare = (n) => n && scopes[scopes.length - 1].add(n);

  /* Подъём: всё, что объявлено в области, видно во всей области. Иначе вызов
     функции выше её объявления читался бы как свободное имя — законный JS,
     на который этот гейт не имеет права ругаться. */
  const hoist = (body, into) => {
    const walk = (n) => {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') { into.add(n.id?.name); return; }
      if (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'ClassExpression') return;
      if (n.type === 'VariableDeclaration') { for (const d of n.declarations) names(d.id, into); return; }
      if (n.type === 'ImportDeclaration') { for (const sp of n.specifiers) into.add(sp.local.name); return; }
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v.type === 'string') walk(v);
      }
    };
    (Array.isArray(body) ? body : [body]).forEach(walk);
  };

  hoist(ast.body, scopes[0]);

  const visit = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        const s = new Set(['this', 'arguments']);
        declare(node.id?.name);
        for (const p of node.params) names(p, s);
        if (node.body.type === 'BlockStatement') hoist(node.body.body, s);
        scopes.push(s);
        for (const p of node.params) visit(p, node);
        visit(node.body, node);
        scopes.pop();
        return;
      }
      case 'ClassDeclaration': case 'ClassExpression': declare(node.id?.name); break;
      case 'CatchClause': {
        const s = new Set();
        names(node.param, s);
        hoist(node.body.body, s);
        scopes.push(s);
        visit(node.body, node);
        scopes.pop();
        return;
      }
      case 'BlockStatement': {
        const s = new Set();
        hoist(node.body, s);
        scopes.push(s);
        for (const st of node.body) visit(st, node);
        scopes.pop();
        return;
      }
      case 'MemberExpression':
        visit(node.object, node);
        if (node.computed) visit(node.property, node);
        return;
      case 'Property':
        if (node.computed) visit(node.key, node);
        visit(node.value, node);
        return;
      case 'MethodDefinition': case 'PropertyDefinition':
        if (node.computed) visit(node.key, node);
        visit(node.value, node);
        return;
      case 'ImportDeclaration': case 'ExportSpecifier': case 'ImportSpecifier':
      case 'ImportDefaultSpecifier': case 'ImportNamespaceSpecifier': case 'MetaProperty':
        return;
      case 'LabeledStatement': visit(node.body, node); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'Identifier':
        if (parent?.type === 'ExportSpecifier') return;
        if (!declared(node.name) && !BROWSER.has(node.name) && !JS.has(node.name)) {
          free.push({ name: node.name, line: node.loc.start.line });
        }
        return;
      default: break;
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => visit(c, node));
      else if (v && typeof v.type === 'string') visit(v, node);
    }
  };

  visit(ast, null);
  return free;
}

let bad = 0;
/*
 * `pwn-source.js` — НЕ экран, а образец побега: он нарочно обращается к
 * `__fuel`, который вставляет инструментатор, и в браузер как есть не едет.
 * Исключение названо здесь, а не спрятано в списке глобалей: расширять список
 * ради одного файла значит ослабить гейт для всех остальных.
 */
const SKIP = new Set(['src/viewer/pwn-source.js']);
const targets = [...files(join(ROOT, 'src/client')), ...files(join(ROOT, 'src/viewer'))]
  .filter((f) => !SKIP.has(relative(ROOT, f)));
console.log(`\n  ГЕЙТ КЛИЕНТСКИХ ЭКРАНОВ\n\n  файлов: ${targets.length}\n`);
for (const f of targets) {
  const rel = relative(ROOT, f);
  let free;
  try { free = freeNames(readFileSync(f, 'utf8')); }
  catch (e) { console.log(`  ✗ ${rel}: не разбирается — ${e.message}`); bad++; continue; }
  const uniq = [...new Map(free.map((x) => [x.name + x.line, x])).values()];
  if (uniq.length) {
    bad++;
    console.log(`  ✗ ${rel}`);
    for (const x of uniq.slice(0, 8)) console.log(`      строка ${x.line}: имя «${x.name}» нигде не объявлено`);
  } else if (VERBOSE) {
    console.log(`  ✓ ${rel}`);
  }
}
if (!bad) console.log(`  ✓ во всех ${targets.length} файлах каждое имя объявлено, импортировано или даётся браузером`);
console.log(bad ? `\n  ПРОВАЛ: ${bad}\n` : '\n  ДЕРЖИТ\n');
process.exit(bad ? 1 : 0);
