/**
 * Фасад THREE не должен вести наружу — гейт по A1.
 *
 * `THREE_ALLOWED` (`src/viewer/loadbody.js`) — список из ста с лишним имён, и
 * каждое из них однажды кто-то захочет дополнить: «модель попросила Bone»,
 * «без Sprite не рисуется». Комментарий над списком говорит, что добавление —
 * осознанное решение. Осознанное решение требует ДОКАЗАТЕЛЬСТВА, а не веры в
 * то, что класс выглядит безобидным.
 *
 * Что проверяется: от замороженного фасада обходится весь достижимый граф
 * объектов — свойства, прототипы, статические поля — и ищется хоть один путь
 * к тому, чем чужой код может выйти из песочницы: `globalThis`, `window`,
 * `document`, узел DOM, `fetch`, `process`, `Function` как конструктор,
 * `eval`, `import`. Один найденный путь печатается целиком: не «небезопасно»,
 * а `THREE.Foo.prototype.bar.baz → window`.
 *
 * Обход идёт по классам, а не по экземплярам: экземпляр появится в браузере, а
 * класс лежит в списке уже сейчас, и escape в прототипе — это escape.
 *
 *   node tools/checkfacade.mjs
 *   node tools/checkfacade.mjs --verbose
 */

import * as THREE from 'three/webgpu';
import { makeThree, THREE_ALLOWED } from '../src/viewer/loadbody.js';

const VERBOSE = process.argv.includes('--verbose');

/*
 * ── ЧЕМ НЕЛЬЗЯ ВЛАДЕТЬ ─────────────────────────────────────────────────────
 *
 * Сначала здесь были только ЗНАЧЕНИЯ: `mark(globalThis.document)`,
 * `mark(globalThis.window)`, `mark(globalThis.XMLHttpRequest)`. Довод был
 * «имя можно переназвать, ссылку — нет», и он верен. Но гейт выполняется в
 * NODE, где ни `document`, ни `window`, ни `XMLHttpRequest`, ни `Worker` не
 * существуют вовсе: четыре метки из двенадцати молча становились
 * `mark(undefined)` и не искали ничего.
 *
 * Замерено ревью: с `ImageLoader`, `TextureLoader`, `FileLoader` и `Cache`,
 * дописанными в `THREE_ALLOWED`, гейт печатал «ГОДЕН» — то есть пропускал
 * ровно тот побег, который `loadbody.js` описывает как случившийся живьём.
 * `checkbody.mjs` его ловил, а этот — нет, и при этом в `loadbody.js` на него
 * ссылались как на ДОКАЗАТЕЛЬСТВО права расширить фасад. Доказательства не
 * было.
 *
 * Теперь проверяется и то и другое: значения (там, где они есть) И ИМЕНА —
 * потому что в браузере фасад достанется коду, у которого `document` есть, а
 * у гейта его нет. Имя ищется по конструктору и по строке класса, чтобы
 * `ImageLoader` не проехал под видом безымянной функции.
 */
const FORBIDDEN = new Map();
const mark = (v, why) => { if (v !== undefined && v !== null) FORBIDDEN.set(v, why); };
mark(globalThis, 'globalThis');
mark(globalThis.process, 'process');
mark(globalThis.fetch, 'fetch');
mark(globalThis.eval, 'eval');
mark(Function, 'Function');
mark(globalThis.WebAssembly, 'WebAssembly');
mark(Reflect, 'Reflect');
mark(globalThis.require, 'require');

/*
 * Имена, которых в фасаде быть не может, даже если в Node их значения нет.
 * Список отвечает на вопрос «что чужой код сможет достать В БРАУЗЕРЕ»:
 * загрузчики создают сеть и DOM, текстуры и изображения тянут ресурс, кэш
 * переживает вкладку, часы ломают детерминизм, рендерер даёт канвас.
 */
const BAD_NAME = [
  /^[A-Z]\w*Loader$/, /^Cache$/, /^[A-Z]\w*Texture$/, /^Image\w*$/, /^Video\w*$/,
  /^Audio\w*$/, /^WebGL\w*$/, /^WebGPU\w*$/, /^[A-Z]\w*Renderer$/, /^Clock$/,
  /^FileReader$/, /^XMLHttpRequest$/, /^Worker$/, /^Document$/, /^Window$/,
];
/*
 * Имя берётся у КЛАССА, а не у любой функции: методы вроде
 * `Skeleton.prototype.computeBoneTexture` содержат «Texture» в названии и не
 * являются текстурой. Отсюда заглавная буква в каждом образце — класс, а не
 * метод, — и требование прототипа у функции.
 */
const nameOf = (v) => {
  if (typeof v === 'function') return (v.prototype && v.name) || '';
  if (v && typeof v === 'object') return v.constructor?.name || '';
  return '';
};

const facade = makeThree(THREE);

/* Достижимо ИЗ ЛЮБОГО кода и потому не считается утечкой: чужой код и так
   пишет `Object`, `Array`, `Promise` — их наличие в графе ничего не открывает. */
const BASELINE = new Set([Object, Object.prototype, Array, Array.prototype, Function.prototype,
  String, String.prototype, Number, Number.prototype, Boolean, Boolean.prototype,
  Symbol, Symbol.prototype, Promise, Promise.prototype, Math, JSON, Map, Map.prototype,
  Set, Set.prototype, WeakMap, WeakMap.prototype, WeakSet, WeakSet.prototype,
  Error, Error.prototype, TypeError, RangeError, ArrayBuffer, ArrayBuffer.prototype,
  Float32Array, Uint32Array, Uint16Array, Uint8Array, Int32Array, Int16Array, Int8Array,
  Uint8ClampedArray, Float64Array, DataView]);

const seen = new Set();
const leaks = [];
let nodes = 0;

const LIMIT = 400_000;
function walk(value, path, depth) {
  if (nodes > LIMIT || depth > 8) return;
  if (value === null || value === undefined) return;
  const t = typeof value;
  if (t !== 'object' && t !== 'function') return;

  if (FORBIDDEN.has(value)) { leaks.push(`${path} → ${FORBIDDEN.get(value)}`); return; }
  const nm = nameOf(value);
  if (nm && BAD_NAME.some((re) => re.test(nm))) { leaks.push(`${path} → ${nm}`); return; }
  if (BASELINE.has(value)) return;
  if (seen.has(value)) return;
  seen.add(value);
  nodes++;

  let keys;
  try { keys = Reflect.ownKeys(value); } catch { return; }
  for (const k of keys) {
    if (typeof k === 'symbol') continue;
    /* Геттеры не дёргаются: у three они считают матрицы и могут бросить, а
       предъявить надо путь, а не значение. Дескриптор виден и без вызова. */
    let d;
    try { d = Reflect.getOwnPropertyDescriptor(value, k); } catch { continue; }
    if (!d) continue;
    if (d.get) { walk(d.get, `${path}.get ${k}`, depth + 1); continue; }
    walk(d.value, `${path}.${k}`, depth + 1);
  }
  try { walk(Reflect.getPrototypeOf(value), `${path}.__proto__`, depth + 1); } catch { /* пусто */ }
}

/* Сперва — по именам в самом списке: `TextureLoader` мог бы и не иметь путей
   наружу внутри Node, но в браузере он сам и есть путь наружу. */
for (const name of THREE_ALLOWED) {
  if (BAD_NAME.some((re) => re.test(name))) leaks.push(`THREE_ALLOWED содержит ${name}`);
}
for (const name of Object.keys(facade)) walk(facade[name], `THREE.${name}`, 0);

const missing = THREE_ALLOWED.filter((k) => !(k in THREE));
console.log(`фасад: ${Object.keys(facade).length} членов, обойдено ${nodes} объектов, глубина 8`);
if (missing.length) console.log(`в списке, но нет в three: ${missing.join(', ')}`);
if (VERBOSE) console.log(`заморожен: ${Object.isFrozen(facade)}`);

if (leaks.length) {
  console.log(`\nПРОВАЛ: путей наружу ${leaks.length}`);
  for (const l of leaks.slice(0, 20)) console.log(`  ${l}`);
  process.exit(1);
}
if (!Object.isFrozen(facade)) { console.log('\nПРОВАЛ: фасад не заморожен'); process.exit(1); }
console.log('ГОДЕН: ни одного пути к globalThis, DOM, сети, процессу или Function');
