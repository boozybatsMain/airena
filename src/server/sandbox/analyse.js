/**
 * Статический анализ чужого мозга — первая из четырёх стен A1.
 *
 * A1 дословно: «статический анализ, отвергающий ЛЮБУЮ ЗАПИСЬ ЗА ПРЕДЕЛЫ `mem`».
 * Это сильнее, чем «запретить опасные имена»: мозг не должен уметь записать
 * ничего вообще, кроме своей памяти и своих локальных переменных. Список
 * запрещённых глобалей можно обойти (`globalThis['ev'+'al']`), а правило
 * «писать некуда» — нет: если единственный доступный приёмник записи это
 * `mem` и локальные `let`, то писать больше не во что.
 *
 * Разбор — acorn. Регулярками JavaScript не анализируется: `// eval(` и
 * `"eval("` неотличимы от кода без парсера, а анализ, который путает
 * комментарий с вызовом, ловит честных и пропускает подготовленных.
 *
 * ЧТО ЭТА СТЕНА НЕ ДЕЛАЕТ. Она не защита сама по себе — она делает
 * дальнейшие стены дешёвыми. Побег из неё останавливает изолят (стена 2),
 * бесконечный цикл — учёт топлива (стена 3), зависший нативный вызов —
 * таймаут потока (стена 4). Каждая из четырёх обязана держать одна.
 */

import { parse } from 'acorn';

/** Что мозгу доступно снаружи. Всё остальное — не существует. */
export const ALLOWED_GLOBALS = new Set([
  'Math', 'JSON', 'Number', 'String', 'Boolean', 'Array', 'Object',
  'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'undefined', 'NaN', 'Infinity',
  'Map', 'Set', 'Symbol', 'Error', 'TypeError', 'RangeError',
  /* То, что даёт мозгу сам хост: векторная математика прелюдии и консоль.
     Список обязан совпадать с `PRELUDE` в src/brain/host.js — иначе анализ
     отвергает эталонные мозги, а это признак не строгости, а рассинхрона.
     Проверяет `tools/checkisolate.mjs`. */
  'V', 'console',
  /* Служебное: счётчик топлива, который вставляет инструментатор. */
  '__fuel',
]);

/**
 * Имена, за которые отказ немедленный и с объяснением.
 * Список короткий намеренно: он для СООБЩЕНИЯ, а не для защиты — защиту
 * даёт правило «неизвестная глобаль запрещена».
 */
const NAMED = {
  eval: 'eval запрещён (N11)',
  Function: 'конструктор Function запрещён (N11)',
  require: 'модули мозгу недоступны',
  import: 'модули мозгу недоступны',
  process: 'процесс мозгу недоступен',
  globalThis: 'глобальный объект мозгу недоступен',
  global: 'глобальный объект мозгу недоступен',
  Reflect: 'Reflect позволяет обойти правило записи',
  Proxy: 'Proxy позволяет обойти правило записи',
  WebAssembly: 'WebAssembly мозгу недоступен',
  Atomics: 'разделяемая память мозгу недоступна',
  SharedArrayBuffer: 'разделяемая память мозгу недоступна',
  fetch: 'сеть мозгу недоступна',
  setTimeout: 'таймеры мозгу недоступны — мозг живёт внутри одного тика',
  setInterval: 'таймеры мозгу недоступны',
  queueMicrotask: 'очередь микрозадач мозгу недоступна',
  Promise: 'асинхронность мозгу недоступна: мысль занимает один тик',
  Date: 'часы мозгу недоступны — бой обязан быть повторяемым',
  performance: 'часы мозгу недоступны — бой обязан быть повторяемым',
};

/**
 * Разобрать и проверить. Возвращает { ok, problems[], ast } —
 * список, а не первую ошибку: чинить по одному сообщению за раз мучительно,
 * а мозг чинит модель, которой список видно целиком.
 */
export function analyse(source, { maxChars = 60000 } = {}) {
  const problems = [];
  if (typeof source !== 'string' || !source.trim()) {
    return { ok: false, problems: [{ code: 'empty', message: 'пустой исходник' }] };
  }
  if (source.length > maxChars) {
    return { ok: false, problems: [{ code: 'too_big', message: `исходник ${source.length} символов, потолок ${maxChars}` }] };
  }

  let ast;
  try {
    ast = parse(source, { ecmaVersion: 2022, sourceType: 'script', locations: true });
  } catch (e) {
    return { ok: false, problems: [{ code: 'syntax', message: `не разбирается: ${e.message}` }] };
  }

  /* Область видимости — чтобы отличить свою локальную `x` от глобальной. */
  const scopes = [new Set(ALLOWED_GLOBALS)];
  const declare = (name) => { if (name) scopes[scopes.length - 1].add(name); };
  const known = (name) => scopes.some((s) => s.has(name));

  const at = (node) => (node.loc ? `${node.loc.start.line}:${node.loc.start.column}` : '?');
  const bad = (code, message, node) => problems.push({ code, message, at: at(node) });

  /* Имена, объявленные паттерном: const {a, b:[c]} = ... */
  function declarePattern(p) {
    if (!p) return;
    switch (p.type) {
      case 'Identifier': declare(p.name); break;
      case 'ObjectPattern': for (const q of p.properties) declarePattern(q.value || q.argument); break;
      case 'ArrayPattern': for (const q of p.elements) declarePattern(q); break;
      case 'AssignmentPattern': declarePattern(p.left); break;
      case 'RestElement': declarePattern(p.argument); break;
      default: break;
    }
  }

  /** Куда пишет присваивание: имя корневого объекта цепочки. */
  function rootOf(node) {
    let n = node;
    while (n && (n.type === 'MemberExpression' || n.type === 'ChainExpression')) {
      n = n.type === 'ChainExpression' ? n.expression : n.object;
    }
    return n && n.type === 'Identifier' ? n.name : null;
  }

  /**
   * Разрешено ли писать в этот приёмник.
   *
   * Правило: писать можно в собственное локальное имя и в `mem` (и в то, что
   * из `mem` достали). Всё остальное — чужое: параметры перцепции, api,
   * глобали. Мозг, пишущий в `p.enemy.x`, не «настраивает переменную» —
   * он врёт следующему тику про мир.
   */
  function assignable(target) {
    if (!target) return true;
    if (target.type === 'Identifier') {
      /* Локальная переменная — да; неизвестное имя — это неявная глобаль. */
      if (!known(target.name)) { return 'unknown'; }
      return ALLOWED_GLOBALS.has(target.name) ? 'global' : true;
    }
    if (target.type === 'MemberExpression' || target.type === 'ChainExpression') {
      const root = rootOf(target);
      if (root === 'mem') return true;
      if (root && !known(root)) return 'unknown';
      if (root && ALLOWED_GLOBALS.has(root)) return 'global';
      /* Локальный объект — писать в его поля можно: он свой. */
      return true;
    }
    if (target.type === 'ObjectPattern' || target.type === 'ArrayPattern') return true;
    return true;
  }

  const walk = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;

    switch (node.type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        declare(node.id?.name);
        scopes.push(new Set());
        for (const p of node.params) declarePattern(p);
        walkChildren(node);
        scopes.pop();
        return;
      }
      case 'VariableDeclarator':
        declarePattern(node.id);
        break;
      case 'ClassDeclaration':
      case 'ClassExpression':
        declare(node.id?.name);
        break;
      case 'CatchClause':
        declarePattern(node.param);
        break;
      case 'Identifier': {
        /* Ссылка на неизвестную глобаль — отказ с объяснением, если имя
           знакомое, и общий отказ, если нет. */
        const isProp = parent && parent.type === 'MemberExpression' && parent.property === node && !parent.computed;
        const isKey = parent && parent.type === 'Property' && parent.key === node && !parent.computed;
        if (isProp || isKey) break;
        if (!known(node.name)) {
          if (NAMED[node.name]) bad('forbidden', NAMED[node.name], node);
          else bad('unknown_global', `неизвестное имя «${node.name}» — мозгу доступны только api, p, mem и стандартная математика`, node);
        }
        break;
      }
      case 'AssignmentExpression': {
        const verdict = assignable(node.left);
        if (verdict === 'global') bad('write_global', 'запись в глобальный объект запрещена (A1)', node);
        if (verdict === 'unknown') bad('write_unknown', 'запись в необъявленное имя — неявная глобаль запрещена (A1)', node);
        break;
      }
      case 'UpdateExpression': {
        const verdict = assignable(node.argument);
        if (verdict === 'global') bad('write_global', 'изменение глобального объекта запрещено (A1)', node);
        if (verdict === 'unknown') bad('write_unknown', 'изменение необъявленного имени запрещено (A1)', node);
        break;
      }
      case 'WithStatement':
        bad('with', 'with запрещён: он ломает анализ областей видимости', node);
        break;
      case 'ImportExpression':
      case 'ImportDeclaration':
        bad('import', 'модули мозгу недоступны', node);
        break;
      case 'LabeledStatement':
        declare(node.label?.name);
        break;
      case 'MemberExpression': {
        /* `constructor` — дорога к Function через любой объект. */
        if (!node.computed && node.property?.name === 'constructor') {
          bad('constructor', 'обращение к constructor запрещено: через него достаётся Function (N11)', node);
        }
        if (!node.computed && (node.property?.name === '__proto__' || node.property?.name === 'prototype')) {
          bad('proto', 'обращение к прототипу запрещено: через него правится чужое поведение', node);
        }
        break;
      }
      default: break;
    }
    walkChildren(node);
  };

  function walkChildren(node) {
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, node); }
      else if (v && typeof v.type === 'string') walk(v, node);
    }
  }

  /* Подъём деклараций верхнего уровня: мозг обычно объявляет tick ниже, чем
     на него ссылается, и это не нарушение. */
  hoist(ast, declare);
  walk(ast, null);

  return { ok: problems.length === 0, problems, ast };
}

function hoist(node, declare) {
  for (const st of node.body || []) {
    if (st.type === 'FunctionDeclaration') declare(st.id?.name);
    if (st.type === 'ClassDeclaration') declare(st.id?.name);
    if (st.type === 'VariableDeclaration') {
      for (const d of st.declarations) {
        if (d.id.type === 'Identifier') declare(d.id.name);
        else collect(d.id, declare);
      }
    }
  }
}

function collect(p, declare) {
  if (!p) return;
  if (p.type === 'Identifier') { declare(p.name); return; }
  if (p.type === 'ObjectPattern') for (const q of p.properties) collect(q.value || q.argument, declare);
  if (p.type === 'ArrayPattern') for (const q of p.elements) collect(q, declare);
  if (p.type === 'AssignmentPattern') collect(p.left, declare);
  if (p.type === 'RestElement') collect(p.argument, declare);
}
