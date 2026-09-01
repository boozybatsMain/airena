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

/*
 * Этот файл проверяет НЕ ТОЛЬКО мозги.
 *
 * Тело существа — тоже код, написанный моделью по свободному тексту игрока,
 * и оно исполняется в браузере ЧУЖОГО человека, который просто смотрит бой.
 * Правила у тела другие (ему нужны THREE и TSL, не нужна память), но
 * рассуждение то же самое, и держать два экземпляра одной проверки — это
 * гарантированно получить два разных её поведения через месяц. Поэтому
 * список глобалей, список именованных отказов и имя входной функции —
 * параметры, а не константы. Значения по умолчанию — мозговые, так что все
 * старые вызовы `analyse(src)` работают как работали; это проверяет
 * `tools/checkisolate.mjs` своими двадцатью одной попыткой побега.
 *
 * Тело настраивает `src/server/sandbox/bodyrules.js`.
 */

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
  /* Служебное: счётчик топлива и проверка доступа по вычисляемому ключу —
     оба вставляет инструментатор. */
  '__fuel', '__idx',
]);

/**
 * Имена, за которые отказ немедленный и с объяснением.
 * Список короткий намеренно: он для СООБЩЕНИЯ, а не для защиты — защиту
 * даёт правило «неизвестная глобаль запрещена».
 */
/*
 * ЧЕРЕЗ `Object.create(null)`, и это ТРЕТИЙ раз, когда та же дыра.
 *
 * На обычном литерале `NAMED['constructor']` возвращает `Object` — истинное
 * значение, — и отказ печатался игроку как `forbidden: function Object() {
 * [native code] }`. То есть любое имя из прототипа превращалось в запрет с
 * бессмысленным текстом, а слово `constructor` встречается в каждом классе.
 *
 * До этого так же пробивался бюджет умений (§8) и так же проходил пресет
 * набора (`KIT_PRESETS`). Одна и та же ошибка трижды означает, что дело не в
 * невнимательности, а в литерале как таковом: таблица, по которой что-то
 * ПРОВЕРЯЮТ, не имеет права наследовать чужие ключи.
 */
const NAMED = Object.assign(Object.create(null), {
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
});

/**
 * Разобрать и проверить. Возвращает { ok, problems[], ast } —
 * список, а не первую ошибку: чинить по одному сообщению за раз мучительно,
 * а мозг чинит модель, которой список видно целиком.
 */
export function analyse(source, {
  maxChars = 60000,
  globals = ALLOWED_GLOBALS,
  named = NAMED,
  entry = 'think',
  /* Как называть в сообщениях то, что пришло снаружи. Мозгу приходят
     перцепция и api, телу — THREE и TSL, и текст отказа обязан говорить про
     то, что читатель действительно написал. */
  outsideRu = 'перцепция или api',
  vocabularyRu = 'api, p, mem и стандартная математика',
} = {}) {
  const problems = [];
  if (typeof source !== 'string' || !source.trim()) {
    return { ok: false, problems: [{ code: 'empty', message: 'пустой исходник' }] };
  }
  if (source.length > maxChars) {
    return { ok: false, problems: [{ code: 'too_big', message: `исходник ${source.length} символов, потолок ${maxChars}` }] };
  }

  /*
   * ОБЁРТКА МОДУЛЯ СНИМАЕТСЯ, А НЕ ОТВЕРГАЕТСЯ.
   *
   * Разбор идёт в режиме СКРИПТА, потому что `import` — это дверь наружу, и
   * её здесь быть не должно. Но модели пишут `import * as THREE from 'three'`
   * наверху и `export function build` внизу просто по привычке: так выглядит
   * любой файл three.js, который они видели. Системный промпт запрещает это
   * прямым текстом — дешёвая модель написала импорт ЧЕТЫРЕ РАЗА ИЗ ЧЕТЫРЁХ.
   *
   * И отвергалось оно с сообщением «не разбирается: 'import' and 'export' may
   * appear only with sourceType module» — то есть тело, в котором всё
   * остальное правильно, не доезжало до игрока из-за двух строк обёртки.
   * Именно это, а не качество кода, объясняет, почему сгенерированных тел в
   * базе почти нет.
   *
   * Человек-приёмщик в такой ситуации снимает обёртку и читает дальше.
   * Снимаем и мы — но именно снимаем, а не разрешаем:
   *
   *   объявления `import` ВЫРЕЗАЮТСЯ целиком. Если код на них опирался, имя
   *     станет неизвестным, и он честно упадёт на `unknown_global` — то есть
   *     доступ наружу по-прежнему невозможен, просто отказ теперь по делу;
   *   у `export` снимается только само слово, объявление остаётся;
   *   `import(...)` как ВЫРАЖЕНИЕ не трогается ничем: это динамическая
   *     загрузка, она запрещена по имени и останется запрещённой.
   *
   * Вырезанное заменяется пробелами той же длины: смещения всех остальных
   * узлов обязаны остаться прежними, потому что по ним же идёт разметка
   * топливом и указываются позиции в отказах.
   */
  /*
   * ОБЁРТКА CommonJS СНИМАЕТСЯ ТАК ЖЕ, КАК ОБЁРТКА МОДУЛЯ.
   *
   * Модели пишут `module.exports = build` по той же привычке, что и
   * `export function build`: так выглядит половина примеров, на которых они
   * учились. Отвергалось это как «запись в необъявленное имя» — то есть тело,
   * где всё остальное правильно, не доезжало из-за одной последней строки.
   *
   * Снимается ТОЛЬКО хвостовое присваивание экспорта и только целиком строкой.
   * `module` и `exports` остаются неизвестными именами везде, где встретятся
   * ещё раз: дверь наружу не открывается, убирается ровно бантик.
   */
  source = source.replace(
    /^[\t ]*(?:module\.exports|exports\.\w+)\s*=\s*[\w$]+\s*;?[\t ]*$/gm,
    (m) => ' '.repeat(m.length),
  );

  let ast;
  let unwrapped = false;
  try {
    ast = parse(source, { ecmaVersion: 2022, sourceType: 'script', locations: true });
  } catch (e) {
    const looksModule = /'import' and 'export' may appear only with|import|export/.test(e.message);
    let asModule = null;
    if (looksModule) {
      try { asModule = parse(source, { ecmaVersion: 2022, sourceType: 'module', locations: true }); }
      catch { asModule = null; }
    }
    if (!asModule) {
      return { ok: false, problems: [{ code: 'syntax', message: `не разбирается: ${e.message}` }] };
    }
    const blanks = [];
    for (const node of asModule.body) {
      if (node.type === 'ImportDeclaration') blanks.push([node.start, node.end]);
      else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
        /* `export function build(){}` → снимаем слово; `export { build }` →
           снимаем всю строку, объявления в ней нет. */
        if (node.declaration) blanks.push([node.start, node.declaration.start]);
        else blanks.push([node.start, node.end]);
      }
    }
    if (!blanks.length) {
      return { ok: false, problems: [{ code: 'syntax', message: `не разбирается: ${e.message}` }] };
    }
    const chars = [...source];
    for (const [a, b] of blanks) for (let i = a; i < b; i++) if (chars[i] !== '\n') chars[i] = ' ';
    source = chars.join('');
    unwrapped = true;
    try {
      ast = parse(source, { ecmaVersion: 2022, sourceType: 'script', locations: true });
    } catch (e2) {
      return { ok: false, problems: [{ code: 'syntax', message: `не разбирается и без обёртки модуля: ${e2.message}` }] };
    }
  }

  /* Область видимости — чтобы отличить свою локальную `x` от глобальной. */
  const scopes = [new Set(globals)];
  /*
   * ВТОРАЯ ПОЛКА КАЖДОЙ ОБЛАСТИ: имена, объявленные НИЖЕ по тексту.
   *
   * `let`, `const` и `class` язык поднимает, но до строки объявления держит во
   * временной мёртвой зоне. Из-за этого два совершенно разных случая выглядят
   * в разборе одинаково:
   *
   *     g.rotation.x = nope; let nope = 1;              // настоящая ошибка
   *     g.userData.pose = (s) => { g.y = BASE + s.t; }; const BASE = 0.5;   // законно
   *
   * Второе — самая обычная форма `pose`: функция СОЗДАЁТСЯ раньше, а ЗОВЁТСЯ
   * позже, когда `BASE` уже есть. Один раз я разменял первое на второе —
   * поднял всё подряд, — и гейт `checkbody` немедленно это поймал: разбор
   * перестал отличать ошибку от законного кода.
   *
   * Отличает их не порядок строк, а граница функции. Имя с этой полки видно
   * только оттуда, где между обращением и объявлением есть хотя бы одна
   * функция: `depth` глубже той, на которой полка заведена.
   */
  const deferred = [new Set()];
  const scopeDepth = [0];
  const declare = (name) => { if (name) scopes[scopes.length - 1].add(name); };
  const defer = (name) => { if (name) deferred[deferred.length - 1].add(name); };
  const known = (name) => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i].has(name)) return true;
      if (deferred[i].has(name) && depth > scopeDepth[i]) return true;
    }
    return false;
  };

  /*
   * Параметры — ЧУЖИЕ объекты, а не свои переменные.
   *
   * Локальная переменная создана мозгом, и писать в неё можно. Параметр
   * приходит снаружи: `p` — это перцепция, `api` — это дверь в мир. Мозг,
   * который пишет `p.enemy.hp = 0`, не настраивает переменную — он врёт
   * следующему тику про мир, и делает это внутри собственного процесса, где
   * никакая проверка исходов его не поймает. A1 говорит «любая запись за
   * пределы mem»; параметр за пределами mem по определению.
   *
   * Исключение ровно одно, и оно и есть `mem`: путь, начинающийся с
   * свойства `mem`, писать можно — это и есть память мозга.
   *
   * ВАЖНО, ЧЬИ параметры. Снаружи приходят только параметры `think` — то,
   * что даёт сим. Параметры собственных вспомогательных функций мозга это
   * его же значения, и `function clamp(x){ if (x>19.2) x=19.2; }` —
   * нормальный код, а не побег. Правило, не различавшее эти два случая,
   * отвергло тринадцать эталонных мозгов из пятидесяти девяти, и это был
   * признак не строгости, а неточности.
   */
  const params = new Set();

  /* Глубина вложенности функций: `think` снаружи — это только тот `think`,
     который объявлен на верхнем уровне. */
  let depth = 0;
  const at = (node) => (node.loc ? `${node.loc.start.line}:${node.loc.start.column}` : '?');
  const bad = (code, message, node) => problems.push({ code, message, at: at(node) });

  /* Параметры помечаются отдельно от локальных: писать в них нельзя. */
  function markParams(p) {
    if (!p) return;
    if (p.type === 'Identifier') { params.add(p.name); return; }
    if (p.type === 'ObjectPattern') for (const q of p.properties) markParams(q.value || q.argument);
    if (p.type === 'ArrayPattern') for (const q of p.elements) markParams(q);
    if (p.type === 'AssignmentPattern') markParams(p.left);
    if (p.type === 'RestElement') markParams(p.argument);
  }

  /* Имена, объявленные паттерном: const {a, b:[c]} = ... */
  function declarePattern(p, sink = declare) {
    if (!p) return;
    switch (p.type) {
      case 'Identifier': sink(p.name); break;
      case 'ObjectPattern': for (const q of p.properties) declarePattern(q.value || q.argument, sink); break;
      case 'ArrayPattern': for (const q of p.elements) declarePattern(q, sink); break;
      case 'AssignmentPattern': declarePattern(p.left, sink); break;
      case 'RestElement': declarePattern(p.argument, sink); break;
      default: break;
    }
  }

  /** Первое СТАТИЧЕСКОЕ свойство цепочки: у `p.mem.a.b` это `mem`. */
  function firstProp(node) {
    const chain = [];
    let n = node;
    while (n && (n.type === 'MemberExpression' || n.type === 'ChainExpression')) {
      if (n.type === 'ChainExpression') { n = n.expression; continue; }
      if (!n.computed && n.property?.type === 'Identifier') chain.unshift(n.property.name);
      else chain.unshift(null);
      n = n.object;
    }
    return chain[0];
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
      if (globals.has(target.name)) return 'global';
      if (params.has(target.name)) return 'param';
      return true;
    }
    if (target.type === 'MemberExpression' || target.type === 'ChainExpression') {
      const root = rootOf(target);
      if (root === 'mem') return true;
      if (root && !known(root)) return 'unknown';
      if (root && globals.has(root)) return 'global';
      if (root && params.has(root)) {
        /* `p.mem.foo = 1` — можно: это память. `p.enemy.hp = 0` — нельзя. */
        return firstProp(target) === 'mem' ? true : 'param';
      }
      /* Локальный объект — писать в его поля можно: он свой. */
      return true;
    }
    if (target.type === 'ObjectPattern' || target.type === 'ArrayPattern') return true;
    return true;
  }

  /*
   * ПОДЪЁМ ОБЪЯВЛЕНИЙ — ЧАСТЬ ЯЗЫКА, А НЕ ВОЛЬНОСТЬ АВТОРА.
   *
   * Обход шёл строго по тексту и объявлял имя функции в тот момент, когда до
   * него доходил. Значит любой вызов РАНЬШЕ текстового объявления —
   * совершенно законный JavaScript — получал «неизвестное имя»:
   *
   *     function build(T) {
   *       const m = new T.Mesh(makeGeo(T));   // ← отказ здесь
   *       function makeGeo(X) { ... }
   *     }
   *
   * Это не гипотетика: так написано пять тел из сорока двух в лабораторном
   * корпусе, и все пять валидны. Отказ выглядел как «модель написала плохой
   * код», хотя код был хороший, а плохой была стена. И бил он молча: тело не
   * собралось — существо получает тело архетипа.
   *
   * Поднимаются РОВНО ДВЕ вещи, потому что ровно они и поднимаются в языке:
   * имена `function`-объявлений и имена `var`. `let`, `const` и `class` живут
   * во временной мёртвой зоне — обращение к ним до объявления это настоящая
   * ошибка, и отказ на ней правильный.
   *
   * Внутрь вложенных функций подъём не идёт: у них своя область, и их имена
   * поднимутся, когда обход войдёт в них.
   */
  function hoistInto(node) {
    const seen = new Set();
    const scan = (n) => {
      if (!n || typeof n.type !== 'string' || seen.has(n)) return;
      seen.add(n);
      if (n.type === 'FunctionDeclaration') { declare(n.id?.name); return; }
      if (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') return;
      /* Класс — на вторую полку: `new Later()` до `class Later{}` это TDZ. */
      if (n.type === 'ClassDeclaration') { defer(n.id?.name); return; }
      if (n.type === 'ClassExpression') return;
      if (n.type === 'VariableDeclaration') {
        /*
         * `var` ПОДНИМАЕТСЯ НАСОВСЕМ, `let` И `const` — ТОЛЬКО ДЛЯ ЗАМЫКАНИЙ.
         *
         * Разница между ними — не придирка, а разница между законным кодом и
         * настоящей ошибкой; она разобрана у `deferred` выше. `var` виден с
         * начала функции по правилам языка, поэтому едет на обычную полку;
         * `let`, `const` и `class` — на вторую, откуда их достаёт только код
         * за границей функции.
         */
        for (const d of n.declarations) declarePattern(d.id, n.kind === 'var' ? declare : defer);
        return;
      }
      for (const k of Object.keys(n)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
        const v = n[k];
        if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') scan(c); }
        else if (v && typeof v.type === 'string') scan(v);
      }
    };
    scan(node);
  }

  const walk = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;

    switch (node.type) {
      case 'AwaitExpression':
        /*
         * ТЕЛО СИНХРОННО, И ЭТО НЕ ПРИДИРКА.
         *
         * `build` обязан вернуть группу, а не обещание: вьювер кладёт
         * результат в сцену сразу. `pose` зовётся шестьдесят раз в секунду из
         * кадрового цикла — асинхронность там означает, что поза применится
         * когда-нибудь потом, то есть не применится.
         *
         * Хуже: `await` уводит исполнение за пределы учёта топлива. Тело,
         * которое ждёт, не тратит шагов — и предел, считающий шаги, его не
         * останавливает.
         *
         * Раньше это ПРОХОДИЛО: ни статический разбор, ни проверка поз не
         * смотрели на асинхронность, и тело с `async` принималось, чтобы
         * сломаться в браузере зрителя.
         */
        bad('async', 'тело обязано быть синхронным: `await` недопустим', node);
        break;

      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        if (node.async) bad('async', 'тело обязано быть синхронным: `async` недопустим', node);
        declare(node.id?.name);
        scopes.push(new Set());
        deferred.push(new Set());
        const fromOutside = node.type === 'FunctionDeclaration' && node.id?.name === entry && depth === 0;
        depth++;
        scopeDepth.push(depth);
        for (const p of node.params) { declarePattern(p); if (fromOutside) markParams(p); }
        /* Сначала поднимаем, потом читаем: иначе вызов функции, объявленной
           ниже по тексту, читается как обращение к неизвестному имени. */
        hoistInto(node.body);
        walkChildren(node);
        depth--;
        scopes.pop();
        deferred.pop();
        scopeDepth.pop();
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
      case 'MetaProperty':
        /* `new.target` и `import.meta` — мета-свойства: их `meta` и `property`
           это НЕ имена переменных. Разбирать их как обращения к глобалям
           значит отвергать законный JavaScript. `import.meta` при этом
           остаётся запрещённым отдельно — по имени, ниже. */
        if (node.meta?.name === 'import') {
          bad('forbidden', 'import.meta телу недоступен', node);
        }
        return;

      case 'Identifier': {
        /* Ссылка на неизвестную глобаль — отказ с объяснением, если имя
           знакомое, и общий отказ, если нет. */
        /*
         * ИМЯ ЧЛЕНА — НЕ ИМЯ ПЕРЕМЕННОЙ, И ЭТО КАСАЕТСЯ КЛАССОВ ТОЖЕ.
         *
         * Выводились из-под проверки только `obj.prop` и ключ литерала. Ключи
         * членов класса — `MethodDefinition` и `PropertyDefinition` — не
         * выводились, и любой класс с методом получал «неизвестное имя m».
         * То есть стена отвергала совершенно законный JavaScript, а тело
         * молча заменялось телом архетипа: выглядело это как «модель написала
         * плохой код».
         *
         * Проверять надо было не «отказало ли», а «отказало ли по делу», —
         * ровно то правило, которое D70 уже вывела и которое здесь опять не
         * применили: положительного случая с классом в гейте не было вовсе.
         */
        const isProp = parent && parent.type === 'MemberExpression' && parent.property === node && !parent.computed;
        const isKey = parent && (parent.type === 'Property' || parent.type === 'MethodDefinition'
          || parent.type === 'PropertyDefinition') && parent.key === node && !parent.computed;
        if (isProp || isKey) break;
        if (!known(node.name)) {
          if (named[node.name]) bad('forbidden', named[node.name], node);
          else bad('unknown_global', `неизвестное имя «${node.name}» — доступны только ${vocabularyRu}`, node);
        }
        break;
      }
      case 'AssignmentExpression': {
        const verdict = assignable(node.left);
        if (verdict === 'global') bad('write_global', 'запись в глобальный объект запрещена (A1)', node);
        if (verdict === 'unknown') bad('write_unknown', 'запись в необъявленное имя — неявная глобаль запрещена (A1)', node);
        if (verdict === 'param') bad('write_param', `запись в то, что пришло снаружи (${outsideRu}), запрещена — писать можно только в свои переменные (A1)`, node);
        break;
      }
      case 'UpdateExpression': {
        const verdict = assignable(node.argument);
        if (verdict === 'global') bad('write_global', 'изменение глобального объекта запрещено (A1)', node);
        if (verdict === 'unknown') bad('write_unknown', 'изменение необъявленного имени запрещено (A1)', node);
        if (verdict === 'param') bad('write_param', `изменение того, что пришло снаружи (${outsideRu}), запрещено — писать можно только в свои переменные (A1)`, node);
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

  /* `source` наружу — это исходник ПОСЛЕ снятия обёртки модуля: дальше по
     цепочке идёт разметка топливом, и она обязана размечать ровно то, что
     разбиралось здесь, иначе она наткнётся на тот же `import`. */
  return { ok: problems.length === 0, problems, ast, source, unwrapped };
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
