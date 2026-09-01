/**
 * Учёт топлива — третья из четырёх стен A1.
 *
 * A1 дословно: «учёт топлива ПО ИНСТРУКЦИЯМ, а не по стенным часам». Разница
 * не в педантизме. Таймер по часам недетерминирован: один и тот же мозг на
 * загруженной машине думает дольше и обрывается раньше — то есть исход боя
 * начинает зависеть от нагрузки сервера, и A2 (побитовый детерминизм) падает
 * вместе с ним. Счётчик шагов даёт один и тот же обрыв на любой машине.
 *
 * Как считаем: в каждую точку, откуда управление может уйти назад или вглубь,
 * вставляется `__fuel()`. Этого достаточно, потому что бесконечное исполнение
 * без обратной дуги и без вызова невозможно:
 *   — тело каждого цикла (включая do/while и for-in/of);
 *   — вход в каждую функцию;
 *   — каждая ветвь условного выражения и каждый case;
 *   — каждое `return`, чтобы прямой длинный код тоже стоил.
 *
 * Вставка — сплайсом по позициям из AST, без генератора кода: генератор
 * переписал бы исходник целиком, а мозг игрока должен исполняться ровно тем,
 * что прошло анализ, плюс вставки.
 */

import { parse } from 'acorn';

/** Сколько шагов мозгу отпущено на одну мысль. */
export const FUEL_PER_THINK = 200_000;
/** Сколько на один компилирующий проход (объявления верхнего уровня). */
export const FUEL_PER_LOAD = 400_000;

const TICK = '__fuel();';

/**
 * Вставить учёт топлива. Возвращает { code, points } — сколько точек учёта
 * вставлено; ноль точек на непустом мозге означает, что вставлять было
 * некуда, и это подозрительно само по себе.
 */
function instrumentFuel(source) {
  const ast = parse(source, { ecmaVersion: 2022, sourceType: 'script', ranges: true });
  /** Позиции вставки: [индекс, текст]. Собираем, потом сплайсим с конца. */
  const cuts = [];

  const intoBody = (body) => {
    if (!body) return;
    if (body.type === 'BlockStatement') { cuts.push([body.start + 1, TICK]); return; }
    /* Однострочное тело: `while (x) f();` — оборачиваем в блок. */
    cuts.push([body.start, '{' + TICK]);
    cuts.push([body.end, '}']);
  };

  const walk = (node, parent = null) => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
        intoBody(node.body);
        break;
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        intoBody(node.body);
        break;
      case 'ArrowFunctionExpression':
        if (node.body.type === 'BlockStatement') intoBody(node.body);
        else {
          /* Стрелка-выражение: `(a) => a + 1` → `(a) => (__fuel(), a + 1)`.
             Скобки обязательны — без них запятая съест аргументы вызова. */
          cuts.push([node.body.start, '(__fuel(),']);
          cuts.push([node.body.end, ')']);
        }
        break;
      case 'SwitchCase':
        if (node.consequent.length) cuts.push([node.consequent[0].start, TICK]);
        break;
      case 'ConditionalExpression':
        cuts.push([node.consequent.start, '(__fuel(),']);
        cuts.push([node.consequent.end, ')']);
        cuts.push([node.alternate.start, '(__fuel(),']);
        cuts.push([node.alternate.end, ')']);
        break;
      case 'ReturnStatement':
        /*
         * ОБЯЗАТЕЛЬНО в блоке.
         *
         * `if (!me.alive) return;` при вставке «перед» превращается в
         * `if (!me.alive) __fuel();return;` — и `return` выходит из-под `if`,
         * то есть функция возвращается ВСЕГДА. Замерено: все шесть эталонных
         * мозгов молча переставали действовать, orders 0, faults 0, матч
         * кончался двойным КО от выгорания арены. Ни одной ошибки нигде.
         *
         * Блок вокруг `return` легален везде, где легален сам `return`, и
         * не меняет ни одной ветки.
         */
        cuts.push([node.start, '{' + TICK]);
        cuts.push([node.end, '}']);
        break;
      default: break;
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'range' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, node); }
      else if (v && typeof v.type === 'string') walk(v, node);
    }
  };
  walk(ast);

  /* С конца — иначе каждая вставка сдвигает все последующие позиции. При
     равных позициях порядок вставок между собой сохраняем стабильным. */
  cuts.sort((a, b) => (b[0] - a[0]) || 0);
  let code = source;
  /* Третий элемент — сколько символов заменить. Нужен для защиты доступа по
     вычисляемому ключу: там `[` и `]` заменяются на `,` и `)`. */
  for (const [at, text, drop = 0] of cuts) code = code.slice(0, at) + text + code.slice(at + drop);

  return { code, points: cuts.length };
}

/**
 * Имена, через которые достаётся конструктор Function, а с ним произвольный код.
 *
 * Один список на все три реалма — хост, изолят и браузер зрителя. Три копии
 * этого списка означали бы три разных списка через месяц, а разница между
 * ними — это дыра, которую никто не увидит, потому что каждая копия по
 * отдельности выглядит правильной.
 */
export const FORBIDDEN_KEYS = ['constructor', '__proto__', 'prototype'];

/**
 * Тело функции `__idx(o, k)` — доступ по вычисляемому ключу с проверкой.
 * Отдаётся строкой, потому что вставляется в три разных исполнителя.
 */
/*
 * КЛЮЧ ПРИВОДИТСЯ К СТРОКЕ ОДИН РАЗ, И ДОСТУП ИДЁТ ПО ЭТОЙ СТРОКЕ.
 *
 * Обе тонкости здесь — настоящие дыры, каждая проверена побегом.
 *
 * ПЕРВАЯ: `typeof k === 'string'` не ловит объект. Доступ к свойству приводит
 * ключ к строке САМ, поэтому `({})[{toString:()=>'constructor'}]` — это
 * `({}).constructor`, а проверка его пропускала: тип-то не строка. Значит
 * приводить обязаны мы, до сравнения, а не движок после него.
 *
 * ВТОРАЯ: приведя ключ, обращаться надо ПО ПРИВЕДЁННОМУ. Если написать
 * `String(k)` для проверки, а потом `o[k]` для доступа, `toString` вызовется
 * ВТОРОЙ раз — и ничто не мешает ему вернуть на второй раз другое значение:
 * первый раз 'x', второй 'constructor'. Классическая гонка проверки и
 * использования, и в один вызов она превращается в обход.
 *
 * Символы пропускаются как есть: символьный ключ не может совпасть ни с одним
 * из трёх имён, а `String(symbol)` бросает.
 */
export const IDX_SOURCE = `function __idx(o, k) {
  const key = typeof k === 'symbol' ? k : String(k);
  if (key === 'constructor' || key === '__proto__' || key === 'prototype') {
    throw new Error('доступ к ' + String(key) + ' запрещён');
  }
  return o[key];
}`;

/**
 * Безопасный `Object` — без отражения.
 *
 * ЗАЧЕМ. Запрет имени `constructor` и проверка доступа по вычисляемому ключу
 * закрывают два пути к конструктору `Function`. Третий идёт мимо обоих:
 *
 *     Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object), 'constructor').value
 *
 * Здесь `'constructor'` — АРГУМЕНТ, а не имя свойства: в дереве это строковый
 * литерал внутри вызова, и ни разбор имён, ни переписывание индексов его не
 * касаются. Тем же приёмом достаётся и `globalThis`, и всё, что на нём висит.
 *
 * Чинить это списком запрещённых методов бессмысленно — отражение в JS есть в
 * нескольких местах, и завтра найдут четвёртое. Поэтому `Object` заменяется
 * целиком: наружу торчит горсть методов, которые перебирают данные, и ни
 * одного, который ходит по прототипам или читает дескрипторы.
 *
 * Цена проверена: ни один эталонный мозг и ни одно рукописное тело не
 * обращается к `Object` ВООБЩЕ. Шим ничего не ломает и ничего не стоит.
 */
export const SAFE_OBJECT_KEYS = [
  'keys', 'values', 'entries', 'fromEntries', 'assign', 'freeze', 'isFrozen', 'is',
];

/** Собрать шим. Одна реализация на сервере; браузерная сверяется гейтом. */
export function safeObject() {
  const out = {};
  for (const k of SAFE_OBJECT_KEYS) out[k] = (...a) => Object[k](...a);
  return Object.freeze(out);
}

/** Ошибка исчерпания топлива — отличима от любой ошибки самого мозга. */
export const OUT_OF_FUEL = 'AIRENA_OUT_OF_FUEL';

/**
 * ВТОРОЙ ПРОХОД: доступ по вычисляемому ключу через проверку.
 *
 * Отдельным проходом, а не вместе с топливом, и это не аккуратность, а
 * необходимость. Обе правки вставляют текст по индексам исходника, и в местах,
 * где они совпадают — однострочное тело цикла, ветка тернарника, — порядок
 * вставок определял вложенность скобок. Он определялся порядком обхода дерева,
 * то есть случайно.

 * Результат был не «иногда некрасиво», а СЛОМАННЫЙ КОД:
 *
 *     for (let i = 0; i < 3; i++) __idx({__fuel();arm.tipLinks,i).rotation…
 *
 * Открывающая скобка блока попала внутрь вызова. Тело `БОЛИДА` — исправное,
 * разбирающееся — после разметки переставало разбираться вообще, и падало уже
 * на `build()`. Тот же инструментатор стоит на каждом мозге.
 *
 * Два прохода снимают весь класс: каждый работает по СВЕЖЕМУ разбору кода,
 * который уже валиден, и его вставки не могут пересечься с чужими. Цена —
 * один лишний разбор, и она несопоставима с ценой тихо испорченной программы.
 */
function instrumentIndex(source) {
  const ast = parse(source, { ecmaVersion: 2022, sourceType: 'script', ranges: true });
  const cuts = [];

  /*
   * ДОСТУП ПО ВЫЧИСЛЯЕМОМУ КЛЮЧУ ИДЁТ ЧЕРЕЗ ПРОВЕРКУ.
   *
   * Статический анализ отвергает `x.constructor` по имени — и этого мало,
   * потому что имя можно собрать: `({})['const'+'ructor']['const'+'ructor']`
   * даёт конструктор Function, а он даёт произвольный код. В мозге это
   * серверное выполнение кода внутри воркера; в теле — исполнение в браузере
   * ЗРИТЕЛЯ, у которого в этот момент лежит его сессия. Ни один разбор имён
   * этого не ловит и поймать не может: имени в исходнике нет.
   *
   * Поэтому проверка переносится на исполнение. `a[b]` становится
   * `__idx(a, b)`, и `__idx` отказывает, если ключ — одно из трёх имён,
   * ведущих к прототипной цепочке. Собранная строка от литерала при этом
   * ничем не отличается, и в том весь смысл.
   *
   * Запись (`a[b] = c`) не переписывается: цепочку к Function даёт ЧТЕНИЕ, а
   * запись в поле своего объекта кода не исполняет. Запись за пределы своего
   * при этом по-прежнему запрещена разбором.
   */
  const guardComputed = (node, parent) => {
    if (!node.computed || !node.property) return;
    /* Числовой литерал — обычный индекс массива, трогать незачем: он не может
       быть именем прототипного свойства, а горячие циклы платят за каждый
       лишний вызов. */
    if (node.property.type === 'Literal' && typeof node.property.value === 'number') return;
    /* Приёмник присваивания и оператор delete оставляем как есть. */
    if (parent && (
      (parent.type === 'AssignmentExpression' && parent.left === node)
      || (parent.type === 'UpdateExpression' && parent.argument === node)
      || (parent.type === 'UnaryExpression' && parent.operator === 'delete')
    )) return;
    const open = source.indexOf('[', node.object.end);
    if (open < 0 || open >= node.property.start) return;
    cuts.push([node.start, '__idx(']);
    cuts.push([open, ',', 1]);
    cuts.push([node.end - 1, ')', 1]);
  };

  const walk = (node, parent = null) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'MemberExpression') guardComputed(node, parent);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'range' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, node); }
      else if (v && typeof v.type === 'string') walk(v, node);
    }
  };
  walk(ast);

  cuts.sort((a, b) => (b[0] - a[0]) || 0);
  let code = source;
  for (const [at, text, drop = 0] of cuts) code = code.slice(0, at) + text + code.slice(at + drop);
  return { code, points: cuts.length };
}

/**
 * Разметка целиком: сперва топливо, потом защита индекса.
 *
 * Порядок важен ровно в одну сторону: топливо оборачивает однострочные тела в
 * блоки, и после него второму проходу достаётся код, где границы операторов
 * уже явные.
 */
export function instrument(source) {
  const fuel = instrumentFuel(source);
  const idx = instrumentIndex(fuel.code);
  return { code: idx.code, points: fuel.points + idx.points };
}
