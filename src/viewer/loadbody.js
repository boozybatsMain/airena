/**
 * Третья стена: сборка тела в браузере зрителя.
 *
 * Тело собирается через `new Function`. Это не оговорка и не лень — N11
 * запрещает `new Function` для ЧУЖОГО МОЗГА, и запрещает по делу: мозг можно
 * увезти в изолят, потому что он обменивается с миром числами. Тело числами
 * не обменивается — оно обязано вернуть живой граф объектов three.js с
 * материалами, шейдерами и буферами, привязанными к тому самому контексту
 * WebGPU, который держит вкладка. Через `postMessage` такое не проходит,
 * и воркер тут не инструмент, а иллюзия инструмента.
 *
 * Поэтому защита строится не на «не исполнять», а на «исполнять в пустой
 * комнате»:
 *
 *   — на сервере (`src/server/sandbox/bodyrules.js`) тело уже разобрано
 *     деревом, и неизвестная глобаль в нём — отказ. До браузера доезжает
 *     только то, что говорит на языке из списка;
 *   — там же в него вставлен учёт топлива, и вечный цикл в теле роняет
 *     тело, а не вкладку;
 *   — здесь каждое опасное имя ЗАТЕНЕНО параметром со значением undefined.
 *     Даже если анализ когда-нибудь пропустит `fetch`, внутри тела `fetch`
 *     это `undefined`, и обращение к нему — исключение, а не запрос.
 *
 * Ни одна из трёх стен не была бы достаточной сама по себе. Первая — это
 * разбор чужого кода, а разборы ошибаются. Вторая ловит только зацикливание.
 * Третья затеняет по списку, а список чего-нибудь да не знает. Вместе они
 * требуют трёх независимых ошибок сразу.
 */

/**
 * Имена, которых внутри тела не существует.
 *
 * Список нарочно шире серверного: там он определяет, что ПРОПУСТИТЬ, здесь —
 * что ПОГАСИТЬ, и цена лишнего имени здесь ноль. `eval` и `arguments` в него
 * не входят: в строгом режиме их нельзя объявить параметром, и оба уже
 * закрыты анализом.
 */
export const SHADOWED = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'navigator',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore',
  'document', 'window', 'globalThis', 'self', 'top', 'parent', 'frames', 'opener',
  'location', 'history', 'screen', 'origin',
  'Worker', 'SharedWorker', 'ServiceWorker', 'importScripts', 'require', 'module', 'exports',
  'Function', 'Reflect', 'Proxy', 'WebAssembly', 'SharedArrayBuffer', 'Atomics',
  'Image', 'Audio', 'Request', 'Response', 'Headers', 'Blob', 'File', 'FileReader',
  'URL', 'URLSearchParams', 'FormData', 'Notification', 'crypto',
  'setTimeout', 'setInterval', 'setImmediate', 'requestAnimationFrame', 'requestIdleCallback',
  'queueMicrotask', 'Promise', 'Date', 'performance', 'process', 'postMessage',
  'alert', 'confirm', 'prompt', 'open', 'print', 'structuredClone',
  'addEventListener', 'removeEventListener', 'dispatchEvent',
];

/**
 * Доступ по вычисляемому ключу — с проверкой.
 *
 * Разметка на сервере переписала каждое `a[b]` в `__idx(a, b)`, потому что
 * статический разбор имён бессилен против собранной строки:
 * `({})['const'+'ructor']['const'+'ructor']` даёт конструктор Function, а он —
 * произвольный код в браузере ЗРИТЕЛЯ, у которого в этот момент лежит его
 * сессия. Здесь эта проверка исполняется.
 *
 * В браузере это ЕДИНСТВЕННЫЙ способ закрыть цепочку: погасить
 * `Function.prototype.constructor` нельзя — прототипы общие со всей
 * страницей, и мы сломали бы приложение вокруг.
 */
/**
 * Безопасный `Object` — без отражения.
 *
 * Список методов обязан совпадать с `SAFE_OBJECT_KEYS` в
 * `src/server/sandbox/instrument.js`; сверяет `tools/checkbody.mjs`. Две
 * реализации существуют потому, что серверный модуль в браузер не отдаётся, а
 * не потому, что правила разные.
 *
 * Закрывает третий путь к конструктору `Function`:
 * `Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object),'constructor')`
 * — здесь `'constructor'` аргумент, а не имя свойства, и ни разбор имён, ни
 * переписывание индексов его не видят. В браузере это кража сессии зрителя.
 */
export const SAFE_OBJECT_KEYS = [
  'keys', 'values', 'entries', 'fromEntries', 'assign', 'freeze', 'isFrozen', 'is',
];

export function makeSafeObject() {
  const out = {};
  for (const k of SAFE_OBJECT_KEYS) out[k] = (...a) => Object[k](...a);
  return Object.freeze(out);
}

/**
 * ЧТО ТЕЛУ РАЗРЕШЕНО БРАТЬ ИЗ THREE.
 *
 * ЗАЧЕМ ЭТО ПОЯВИЛОСЬ. Затенение имён закрывает `window`, `document`, `fetch` —
 * всё, что тело могло бы назвать по имени. Но `THREE` мы отдаём телу САМИ, и
 * через него ведёт дорога наружу:
 *
 *     new THREE.ImageLoader().load('data:,').ownerDocument.defaultView
 *
 * `ImageLoader` создаёт настоящий DOM-элемент, у элемента есть документ, у
 * документа — окно, а в окне `localStorage` зрителя и `Function`. Проверено
 * живьём: тело проходило все три стены и уносило сессию человека, который
 * просто смотрел чужой бой.
 *
 * Это общее свойство, а не частный промах: если дать доступ к объекту, дан
 * доступ ко всему, что из него достижимо. Значит давать надо не namespace, а
 * ФАСАД.
 *
 * ЧТО В СПИСКЕ. Он не придуман, а измерен: 71 исходник тел (рукописные,
 * лабораторные из `forge/` и все, что носят существа) обращается ровно к
 * 34 членам THREE — геометрия, материалы, математика, контейнеры. Ни одного
 * загрузчика, ни одного рендерера, ни одной работы с изображениями. Список
 * ниже — эти 34 плюс безопасные соседи тех же семейств, чтобы честное тело не
 * упиралось в стену на первой же непривычной форме.
 *
 * ЧЕГО В НЁМ НЕТ И НЕ БУДЕТ: `*Loader` (создают DOM и сеть), `WebGL*`
 * (создают канвас), `Texture`/`Image*` (тянут ресурсы), `Cache`, `Audio*`,
 * `Clock` (часы — детерминизм). Добавление в список — осознанное решение, а
 * не следствие того, что чья-то генерация упала.
 */
export const THREE_ALLOWED = [
  /* контейнеры и объекты сцены */
  'Object3D', 'Group', 'Mesh', 'InstancedMesh', 'Points', 'Line', 'LineSegments', 'LineLoop',
  /*
   * Скелет и спрайт — добавлены 30.08 по замеру, а не по просьбе.
   *
   * Инструкция обещает модели «every geometry, every material», и модель,
   * которая рисует зверя, естественно тянется к костям: без `Bone`/`Skeleton`/
   * `SkinnedMesh` конечность гнётся только вручную через вложенные `Group`, а
   * `Sprite` — единственный способ дать глазу или искре смотреть на камеру.
   * Отказ на этих четырёх именах выглядел для модели как «three сломан».
   *
   * Право на добавление доказано, а не предположено: `tools/checkfacade.mjs`
   * обходит весь достижимый граф от фасада и ищет путь к globalThis, DOM,
   * сети, процессу и Function. С этими именами путей по-прежнему ноль.
   *
   * `Texture` в списке НЕ появился и не появится: `Skeleton` заводит себе
   * `DataTexture` сам, внутри three, и это его дело — а дать телу право
   * создать текстуру значит дать право тянуть ресурс.
   */
  'Bone', 'Skeleton', 'SkinnedMesh', 'Sprite',
  /* геометрия */
  'BufferGeometry', 'BoxGeometry', 'SphereGeometry', 'CylinderGeometry', 'ConeGeometry',
  'TorusGeometry', 'TorusKnotGeometry', 'PlaneGeometry', 'CircleGeometry', 'RingGeometry',
  'CapsuleGeometry', 'LatheGeometry', 'TubeGeometry', 'ExtrudeGeometry', 'ShapeGeometry',
  'PolyhedronGeometry', 'IcosahedronGeometry', 'OctahedronGeometry', 'TetrahedronGeometry',
  'DodecahedronGeometry', 'EdgesGeometry', 'WireframeGeometry',
  /* атрибуты буферов */
  'BufferAttribute', 'Float32BufferAttribute', 'Uint16BufferAttribute', 'Uint32BufferAttribute',
  'Int32BufferAttribute', 'Uint8BufferAttribute', 'InstancedBufferAttribute',
  /* материалы */
  'Material', 'MeshBasicMaterial', 'MeshStandardMaterial', 'MeshPhysicalMaterial',
  'MeshPhongMaterial', 'MeshLambertMaterial', 'MeshNormalMaterial', 'MeshDepthMaterial',
  'MeshMatcapMaterial', 'MeshToonMaterial', 'LineBasicMaterial', 'LineDashedMaterial',
  'PointsMaterial', 'SpriteMaterial', 'NodeMaterial', 'MeshStandardNodeMaterial', 'MeshBasicNodeMaterial',
  'MeshPhysicalNodeMaterial', 'LineBasicNodeMaterial', 'PointsNodeMaterial', 'SpriteNodeMaterial',
  /* математика и кривые */
  'Vector2', 'Vector3', 'Vector4', 'Euler', 'Quaternion', 'Matrix3', 'Matrix4', 'Color',
  'MathUtils', 'Box2', 'Box3', 'Sphere', 'Plane', 'Ray', 'Triangle', 'Spherical', 'Cylindrical',
  'Curve', 'CurvePath', 'Path', 'Shape', 'ShapePath',
  'CatmullRomCurve3', 'QuadraticBezierCurve3', 'CubicBezierCurve3', 'LineCurve3', 'EllipseCurve',
  'QuadraticBezierCurve', 'CubicBezierCurve', 'LineCurve', 'SplineCurve', 'ArcCurve',
  /* константы: стороны, смешивание, порядок вращений */
  'FrontSide', 'BackSide', 'DoubleSide', 'NormalBlending', 'AdditiveBlending', 'SubtractiveBlending',
  'MultiplyBlending', 'NoBlending', 'AddEquation', 'SrcAlphaFactor', 'OneMinusSrcAlphaFactor',
  'LinearSRGBColorSpace', 'SRGBColorSpace', 'NoColorSpace',
];

/**
 * Фасад над THREE: только разрешённые члены, ничего больше.
 *
 * Свойства копируются, а не проксируются: прокси на namespace оставляет путь
 * к оригиналу через собственные ловушки и усложняет ровно то, что должно быть
 * очевидным. Здесь всё видно списком.
 */
export function makeThree(THREE) {
  const out = {};
  for (const k of THREE_ALLOWED) if (k in THREE) out[k] = THREE[k];
  return Object.freeze(out);
}

export function makeIdx() {
  return function __idx(o, k) {
    /* Ключ приводится к строке ДО сравнения и доступ идёт по приведённому —
       разбор обеих причин в `IDX_SOURCE` (src/server/sandbox/instrument.js). */
    const key = typeof k === 'symbol' ? k : String(k);
    if (key === 'constructor' || key === '__proto__' || key === 'prototype') {
      const e = new Error(`тело обратилось к ${String(key)}`);
      e.code = 'body_forbidden_key';
      throw e;
    }
    return o[key];
  };

}

/**
 * ПАМЯТЬ — ОТДЕЛЬНЫЙ ПРЕДЕЛ, ТОПЛИВО ЕЁ НЕ МЕРИТ.
 *
 * Топливо считает ИНСТРУКЦИИ. Одна инструкция может стоить двести мегабайт:
 *
 *     const big = new Float32Array(50_000_000);
 *
 * — топлива потрачено единица, памяти вкладки нет. А цикл на сто тысяч
 * итераций по мегабайту тратит сто тысяч единиц топлива из сорока миллионов
 * и четыреста гигабайт памяти. Вечный цикл мы ловим, а вот это — нет.
 *
 * Пределы выведены из замера, а не назначены: самое тяжёлое из настоящих тел —
 * сгенерированное, 3373 геометрии и 9.2 МБ; рукописные 2.3 и 4.5 МБ. Потолок
 * готовой сцены в 48 МБ даёт пятикратный запас честному телу и останавливает
 * то, что вкладку роняет. Потолок выделений выше — 96 МБ: во время сборки
 * бывает временный расход, и наказывать за него нельзя.
 *
 * Две проверки, потому что дыры две:
 *   СЧЁТЧИК ВЫДЕЛЕНИЙ ловит цикл — он считает по мере расходования;
 *   РЕВИЗИЯ СЦЕНЫ ловит одну огромную геометрию, созданную внутри THREE
 *     (`new THREE.SphereGeometry(1, 5000, 5000)`), где массивы выделяет сам
 *     three.js своей ссылкой на конструктор, мимо нашей.
 */
export const MEM_ALLOC_BUDGET = 96 * 1024 * 1024;
export const MEM_SCENE_BUDGET = 48 * 1024 * 1024;

/** Типизированные массивы с учётом байтов. */
const TYPED = ['Float32Array', 'Float64Array', 'Int8Array', 'Int16Array', 'Int32Array',
  'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'ArrayBuffer'];

function makeTyped(charge) {
  const out = {};
  for (const name of TYPED) {
    const Real = globalThis[name];
    if (!Real) continue;
    const Wrapped = function (...a) {
      /* Байты считаются по ЗАПРОШЕННОМУ размеру, до выделения: считать после
         значит сперва выделить, а именно этого мы и не хотим. */
      const n = typeof a[0] === 'number' ? a[0] : 0;
      const per = name === 'ArrayBuffer' ? 1 : (Real.BYTES_PER_ELEMENT || 1);
      charge(n * per);
      return new Real(...a);
    };
    /* Статика и прототип — чтобы `Float32Array.from` и `instanceof` работали. */
    for (const k of Object.getOwnPropertyNames(Real)) {
      if (k === 'length' || k === 'name' || k === 'prototype') continue;
      try { Wrapped[k] = Real[k]; } catch { /* неперезаписываемое */ }
    }
    Wrapped.prototype = Real.prototype;
    out[name] = Wrapped;
  }
  return out;
}

/** Сколько байт геометрии в готовой сцене. */
function sceneBytes(root) {
  let b = 0; const seen = new Set();
  root.traverse?.((o) => {
    const g = o.geometry;
    if (!g || seen.has(g)) return;
    seen.add(g);
    for (const a of Object.values(g.attributes || {})) b += a?.array?.byteLength || 0;
    if (g.index) b += g.index.array?.byteLength || 0;
  });
  return b;
}

export const FUEL_BUILD = 40_000_000;
export const FUEL_POSE = 400_000;

/**
 * Собрать тело из исходника.
 *
 * `trusted: true` — для двух наших рукописных тел: они не размечены топливом,
 * и требовать от них счётчик значило бы размечать и их тоже без причины.
 * Затенение при этом остаётся: оно ничего им не стоит.
 *
 * @returns {THREE.Object3D} корень с `userData.pose(s)`
 */
export function buildBody(THREE, TSL, source, { trusted = false } = {}) {
  let fuel = 0;
  let cap = FUEL_BUILD;
  const __fuel = () => {
    if (++fuel > cap) {
      const e = new Error('тело зациклилось и остановлено');
      e.code = 'body_fuel';
      throw e;
    }
  };

  /* `"use strict"` обязателен: в нестрогом режиме присваивание необъявленному
     имени создаёт глобаль, а это ровно та дыра, которую закрывает анализ, —
     и было бы глупо оставить её открытой на последнем шаге. */
  /* Учёт памяти: см. MEM_ALLOC_BUDGET выше. */
  let allocated = 0;
  const charge = (n) => {
    if (!(n > 0)) return;
    allocated += n;
    if (allocated > MEM_ALLOC_BUDGET) {
      const e = new Error(`тело запросило больше ${Math.round(MEM_ALLOC_BUDGET / 1048576)} МБ памяти`);
      e.code = 'body_memory';
      throw e;
    }
  };
  const typed = trusted ? {} : makeTyped(charge);
  const typedNames = Object.keys(typed);

  const make = new Function(
    ...SHADOWED, ...typedNames, 'Object', 'THREE', 'TSL', '__fuel', '__idx',
    `"use strict";\n${source}\n;return build(THREE, TSL);`,
  );
  /* Телу уезжает ФАСАД, а не сам namespace: см. THREE_ALLOWED выше. */
  const root = make(
    ...SHADOWED.map(() => undefined),
    ...typedNames.map((k) => typed[k]),
    makeSafeObject(), makeThree(THREE), TSL, __fuel, makeIdx(),
  );
  if (!root || !root.isObject3D) throw new Error('build() вернул не объект сцены');

  /*
   * Ревизия готовой сцены: одна огромная геометрия выделяется ВНУТРИ three.js
   * своей ссылкой на конструктор и счётчиком выше не видна.
   */
  if (!trusted) {
    const b = sceneBytes(root);
    if (b > MEM_SCENE_BUDGET) {
      const e = new Error(`геометрия тела ${Math.round(b / 1048576)} МБ, потолок ${Math.round(MEM_SCENE_BUDGET / 1048576)} МБ`);
      e.code = 'body_memory';
      throw e;
    }
  }

  /*
   * Поза — тоже чужой код, и он зовётся шестьдесят раз в секунду. Бюджет на
   * кадр отдельный и сбрасывается перед каждым вызовом: иначе тело, честно
   * тратящее топливо кадр за кадром, через минуту «зациклится».
   *
   * Если поза упала — она гасится навсегда, а тело остаётся стоять. Зритель
   * увидит неподвижное существо, а не чёрный экран и не исключение в каждом
   * кадре до конца боя.
   */
  const inner = root.userData.pose;
  if (typeof inner === 'function' && !trusted) {
    let dead = false;
    root.userData.pose = (s) => {
      if (dead) return;
      fuel = 0; cap = FUEL_POSE;
      try { inner(s); } catch (e) { dead = true; root.userData.poseFailed = e.message || String(e); }
    };
  }
  return root;
}
