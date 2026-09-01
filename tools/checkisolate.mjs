/**
 * Красная команда против изолята — релизный гейт A1.
 *
 * A1 называет изолят блокером релиза для каждой мультиплеерной поверхности,
 * а «red-team не выходит из изолята» — гейтом выхода этапа 2. Этот файл и есть
 * та красная команда: набор мозгов, каждый из которых пытается выйти наружу
 * своим способом, и утверждение, что ни один не вышел.
 *
 * Правило проверки: побег считается ПОЙМАННЫМ, только если его остановила
 * стена, а не случайность. Мозг, который не собрался из-за опечатки, ничего
 * не доказывает — поэтому у каждой атаки записано, КАКАЯ стена обязана её
 * остановить, и проверяется именно она.
 *
 *   node tools/checkisolate.mjs
 *   node tools/checkisolate.mjs --verbose
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyse } from '../src/server/sandbox/analyse.js';
import { instrument } from '../src/server/sandbox/instrument.js';
import { admit, runIsolated } from '../src/server/sandbox/index.js';
import { PRELUDE } from '../src/brain/prelude.js';
import { compileKit } from '../src/skills/compile.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

/** Стены, каждая из которых обязана держать одна. */
/*
 * Стен теперь пять, и пятая появилась не от избытка усердия.
 *
 * GUARD — это переписывание доступа по вычисляемому ключу. Отдаётся она как
 * `sim`, и это точное слово: проверка живёт ВНУТРИ мозга, вставленная в его
 * же код, и её отказ приходит наружу обычным падением мысли — тем же путём,
 * что и любая ошибка самого мозга. Отдельной стены снаружи у неё нет, и в
 * этом её сила: обойти её можно только не исполняя собственный код.
 * (`instrument.js`). Она нужна там, где АНАЛИЗ бессилен по своей природе:
 * имени `constructor` в исходнике может не быть вовсе, оно собирается на
 * исполнении из двух половинок. Обход дерева не видит того, чего в дереве
 * нет, и никакое усиление списка имён это не чинит.
 */
const WALL = { ANALYSE: 'анализ', GUARD: 'sim', ISOLATE: 'изолят', FUEL: 'топливо', TIMEOUT: 'таймаут' };

const ATTACKS = [
  /* Собранное имя: `constructor` в исходнике не встречается ни разу, поэтому
     разбор имён его не видит и увидеть не может. Ловит переписывание доступа
     по вычисляемому ключу (`instrument.js`). Если этот тест когда-нибудь
     покажет «прошло», это значит, что мозг получил конструктор Function, то
     есть выполнение произвольного кода прямо в воркере. */
  { wall: WALL.GUARD, name: 'конструктор через собранное имя',
    src: `function think(p,api){ const k='const'+'ructor'; const F=({})[k][k]; F('return process')().exit(0); }` },
  { wall: WALL.GUARD, name: 'конструктор через строковый литерал',
    src: `function think(p,api){ const F=({})['constructor']['constructor']; F('return process')().exit(0); }` },
  /* Отражение: 'constructor' здесь АРГУМЕНТ вызова, а не имя свойства, и
     обе предыдущие стены его не видят. Держит подмена самого `Object` шимом
     без отражения — в обёртке воркера. Если это когда-нибудь покажет
     «прошла», значит мозг получил настоящий `process` на нашем сервере. */
  { wall: WALL.GUARD, name: 'конструктор через отражение',
    src: `function think(p,api){ const D=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object),'constructor'); D.value('return process')().exit(0); }` },
  /* Этот вариант ловится РАНЬШЕ — статическим разбором: имя `constructor`
     здесь написано как свойство, и список имён его видит. Держат обе стены,
     ожидаем первую. */
  { wall: WALL.ANALYSE, name: 'прототип функции через отражение',
    src: `function think(p,api){ const F=Object.getPrototypeOf(function(){}).constructor; F('return process')().exit(0); }` },

  { wall: WALL.ANALYSE, name: 'прямой eval',
    src: `function think(p,api){ eval('1+1'); }` },
  { wall: WALL.ANALYSE, name: 'Function через constructor',
    src: `function think(p,api){ const f=(()=>{}).constructor('return 1'); f(); }` },
  { wall: WALL.ANALYSE, name: 'globalThis',
    src: `function think(p,api){ globalThis.stolen = 1; }` },
  { wall: WALL.ANALYSE, name: 'process.env',
    src: `function think(p,api){ api.say(String(process.env.OPENROUTER_API_KEY)); }` },
  { wall: WALL.ANALYSE, name: 'require',
    src: `function think(p,api){ const fs = require('node:fs'); api.say(String(fs)); }` },
  { wall: WALL.ANALYSE, name: 'динамический импорт',
    src: `function think(p,api){ import('node:fs').then(m=>api.say('!')); }` },
  { wall: WALL.ANALYSE, name: 'неявная глобаль',
    src: `function think(p,api){ leaked = p.self.hp; }` },
  { wall: WALL.ANALYSE, name: 'запись в перцепцию противника',
    src: `function think(p,api){ p.enemy.hp = 0; }` },
  { wall: WALL.ANALYSE, name: 'правка прототипа Object',
    src: `function think(p,api){ const o={}; o.__proto__.stolen = 1; }` },
  { wall: WALL.ANALYSE, name: 'Reflect',
    src: `function think(p,api){ Reflect.set(p, 'x', 1); }` },
  { wall: WALL.ANALYSE, name: 'Proxy вокруг api',
    src: `function think(p,api){ const q = new Proxy(api, {}); q.say('hi'); }` },
  { wall: WALL.ANALYSE, name: 'Date — недетерминированные часы',
    src: `function think(p,api){ if (Date.now() % 2) api.say('чёт'); }` },
  { wall: WALL.ANALYSE, name: 'Math.random через деструктуризацию',
    src: `function think(p,api){ const {random} = Math; if (random() > 0.5) api.say('!'); }`,
    /* Ловит НЕ анализ: `Math` разрешён, `random` — его поле, и видеть тут
       нечего. Ловит изолят: он запечатывает Math.random в своём потоке.
       Атака оставлена, чтобы проверка честно показывала границу. */
    expect: 'sim' },
  { wall: WALL.ANALYSE, name: 'setTimeout',
    src: `function think(p,api){ setTimeout(()=>{}, 0); }` },
  { wall: WALL.ANALYSE, name: 'with',
    src: `function think(p,api){ with (p) { api.say(String(self.hp)); } }` },
  { wall: WALL.ANALYSE, name: 'слишком длинный исходник',
    src: `function think(p,api){ api.say('x'); }\n// ${'п'.repeat(70000)}` },

  { wall: WALL.FUEL, name: 'бесконечный while',
    src: `function think(p,api){ while(true){} }` },
  /* Стек кончается раньше топлива — ловит сим, считая это падением мысли.
     Записано как есть: гейт показывает, ЧТО именно держит, а не что хотелось. */
  { wall: WALL.FUEL, name: 'бесконечная рекурсия',
    src: `function boom(n){ return boom(n+1); }\nfunction think(p,api){ boom(0); }`, expect: 'sim' },
  { wall: WALL.FUEL, name: 'вложенные циклы на миллиард',
    src: `function think(p,api){ let s=0; for(let i=0;i<40000;i++) for(let j=0;j<40000;j++) s+=1; api.say(String(s)); }` },
  { wall: WALL.FUEL, name: 'бесконечный do-while без блока',
    src: `function think(p,api){ let n=0; do n++; while(n>=0); }` },

  /* Топливо кончается раньше памяти — и это правильный порядок: обрыв по
     шагам детерминирован, обрыв по памяти зависит от машины. */
  { wall: WALL.ISOLATE, name: 'память: раздувание массива',
    src: `function think(p,api){ const a=[]; for(let i=0;i<1e7;i++) a.push({x:i,y:i,z:i}); }`, expect: 'топливо' },
];

/** Мозг, который обязан ПРОЙТИ — иначе проверка ловит всех подряд. */
const CONTROL = `
let last = 0;
function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;
  if (en && en.visible && api.ready('laser')) { api.faceAt(en.x, en.z); api.use('laser'); last = p.t; }
  else api.moveTo(0, 0);
  if (p.t - last > 5) api.say('жду');
}`;

/*
 * СТОРОНА -> ИМЯ ФАЙЛА. Стороны арены зовутся цветами (`blue`, `orange`);
 * файлы эталонной фикстуры §1 на диске так и лежат — `octopus.js` и
 * `gorilla.js`. Пока имена совпадали, одно значение делало обе работы; теперь
 * перевод стоит явно, по одной таблице в каждую сторону.
 */
const REF_FILE = { blue: 'octopus', orange: 'gorilla' };
const SIDE_OF_FILE = { octopus: 'blue', gorilla: 'orange' };

const sparring = readFileSync(join(ROOT, 'brains/stub/gorilla.js'), 'utf8');

let held = 0; let escaped = 0; let miscaught = 0;

console.log('\n  атака                                стена      исход');
console.log('  ' + '─'.repeat(74));

for (const a of ATTACKS) {
  const stat = analyse(a.src);
  let verdict = null; let detail = '';

  if (!stat.ok) {
    verdict = 'анализ';
    detail = stat.problems[0].message;
  } else {
    /* Анализ пропустил — значит держать обязана следующая стена. */
    try {
      const r = await runIsolated({ blue: a.src, orange: sparring }, {
        seed: 5,
        /*
         * Щедро — потому что здесь важно НЕ «за сколько», а «какой стеной».
         *
         * При 8 секундах на загруженной машине первым срабатывал таймаут, и
         * девять атак из двадцати пяти отчитывались как «поймана другой
         * стеной»: гейт мерил соседей по процессору, а не устройство защиты.
         * Таймаут остаётся последним рубежом — от атаки, которую не держит
         * ничто, — и его порог должен быть заведомо недостижим для тех, у
         * кого есть своя стена.
         */
        timeoutMs: 60000,
      });
      const fuel = r.fuel?.blue;
      const faults = r.result?.blue?.faults ?? 0;
      if (fuel?.exhausted) { verdict = 'топливо'; detail = `потрачено ${fuel.spent} шагов`; }
      else if (faults > 0) { verdict = 'sim'; detail = `${faults} падений мысли`; }
      else { verdict = 'ПРОШЛА'; detail = 'мозг отработал без единого возражения'; }
    } catch (e) {
      verdict = e.code === 'timeout' ? 'таймаут' : 'изолят';
      detail = e.message;
    }
  }

  const wanted = a.expect || ({
    [WALL.ANALYSE]: 'анализ', [WALL.FUEL]: 'топливо', [WALL.ISOLATE]: 'изолят',
    [WALL.TIMEOUT]: 'таймаут',
    /* Проверка доступа по ключу отдаётся падением мысли — она живёт внутри
       мозга, и другого пути наружу у неё нет. */
    [WALL.GUARD]: 'sim',
  })[a.wall];
  const ok = verdict !== 'ПРОШЛА';
  const exact = verdict === wanted;
  if (!ok) escaped++;
  else { held++; if (!exact) miscaught++; }

  const mark = !ok ? '✗ ВЫШЛА' : (exact ? '✓' : '~ поймана другой');
  console.log(`  ${a.name.padEnd(36)} ${String(a.wall).padEnd(10)} ${mark} ${exact ? '' : `(${verdict})`}`);
  if (VERBOSE || !ok) console.log(`      ${detail.slice(0, 130)}`);
}

/* Контроль: честный мозг обязан пройти все стены. */
const ctl = await admit(CONTROL, 'blue', { sparring });
console.log('  ' + '─'.repeat(74));
console.log(`  контроль (честный мозг)              —          ${ctl.ok ? '✓ допущен' : '✗ ОТВЕРГНУТ'}`);
if (!ctl.ok) console.log(`      ${JSON.stringify(ctl.problems).slice(0, 200)}`);

/* И все эталонные мозги репозитория — тоже контроль, только большой. */
let refOk = 0; let refBad = 0; const refFiles = [];
for (const tag of readdirSync(join(ROOT, 'brains'))) {
  const dir = join(ROOT, 'brains', tag);
  if (!statSync(dir).isDirectory()) continue;
  /* Здесь перебираются ФАЙЛЫ на диске, а не стороны: у популяции §1 два файла
     и зовутся они так. Сторона, на которую файл потом сажают, берётся из
     `SIDE_OF_FILE` — это две разные вещи. */
  for (const file of ['octopus', 'gorilla']) {
    const f = join(dir, `${file}.js`);
    if (!existsSync(f)) continue;
    const r = analyse(readFileSync(f, 'utf8'));
    if (r.ok) { refOk++; refFiles.push([`${tag}/${file}`, SIDE_OF_FILE[file], f]); }
    else { refBad++; console.log(`  ✗ эталон ${tag}/${file} отвергнут: ${r.problems[0].message.slice(0, 90)}`); }
  }
}
console.log(`  эталонные мозги репозитория          —          ${refBad === 0 ? `✓ ${refOk} из ${refOk} (разбор)` : `✗ ${refBad} отвергнуто`}`);

/*
 * ПОЛНЫЙ ДОПУСК НА ВЫБОРКЕ ЭТАЛОНОВ.
 *
 * Строка выше проверяет только РАЗБОР — то есть первую стену из пяти. Пока
 * стен было четыре и все статические, этого хватало. Пятая («мозг обязан
 * что-то делать») работает боем, и её ложное срабатывание отвергало бы
 * честный мозг молча: он бы просто перестал создаваться.
 *
 * Гонять боями все шестьдесят один — минуты; берём выборку, но берём её
 * ДЕТЕРМИНИРОВАННО (каждый восьмой), чтобы гейт не гулял от прогона к
 * прогону.
 */
/* `probe-*` — нарочно плохие мозги: они существуют, чтобы мерить ими, а не
   чтобы жить в игре. Отказ допуска для них — правильный ответ, но не повод
   ронять гейт. */
const sample = refFiles.filter(([n]) => !n.startsWith('probe-')).filter((_, i) => i % 8 === 0);
let admitOk = 0; const admitNew = []; const admitOld = [];
/*
 * Проверяются НОВЫЕ стены отдельно от старых, и это не поблажка.
 *
 * Стены «мозг бездействует» появились последними, и вопрос к выборке ровно
 * один: не отвергают ли они честный мозг. Отказ по старым стенам — например
 * `faults` у мозга, который падает на четверти мыслей, — это они делают свою
 * работу, и мозг такой в репозитории действительно есть. Смешивать два ответа
 * значит либо ослабить новую проверку, либо объявить регрессией то, что было
 * верно годом раньше.
 */
const NEW_WALLS = new Set(['idle', 'never_uses', 'never_hits']);
for (const [name, slot, f] of sample) {
  const other = slot === 'blue' ? 'orange' : 'blue';
  /* Слева сторона, справа имя файла — перевод обязателен. */
  const spar = readFileSync(join(ROOT, `brains/kit-stub/${REF_FILE[other]}.js`), 'utf8');
  const r = await admit(readFileSync(f, 'utf8'), slot, { sparring: spar });
  if (r.ok) admitOk++;
  else if (NEW_WALLS.has(r.problems[0].code)) admitNew.push(`${name}: ${r.problems[0].code}`);
  else admitOld.push(`${name}: ${r.problems[0].code}`);
}
console.log(`  выборка эталонов: новые стены        —          ${admitNew.length === 0
  ? `✓ ни один из ${sample.length} не отвергнут ими` : `✗ ${admitNew.join(', ')}`}`);
if (admitOld.length) {
  console.log(`      (старыми стенами отвергнуты, это их работа: ${admitOld.join(', ')})`);
}
if (admitNew.length) process.exitCode = 1;

/*
 * И обратный контроль: мозг, который НИЧЕГО не делает, обязан быть отвергнут.
 *
 * Он проходит все четыре старые стены — не падает, не зациклен, никуда не
 * лезет. Именно так три существа, собранные продуктовым путём, доехали до
 * библиотеки и дали ноль побед из 1754 боёв.
 */
const idleBrains = [
  ['мозг, который ничего не делает', 'function think(p, api) { }'],
  ['мозг, который только смотрит', 'function think(p, api) { if (p.enemy) api.faceAt(p.enemy.x, p.enemy.z); }'],
  ['мозг, который ходит и не бьёт', 'function think(p, api) { if (p.enemy) { api.faceAt(p.enemy.x, p.enemy.z); api.moveTo(p.enemy.x, p.enemy.z); } }'],
];
/*
 * Набор ВЫДАЁТСЯ — как в проде.
 *
 * Без набора «ничего не применил» законно: `kit-stub` читает умения из
 * перцепции, и без них ему нечего применять. Стена `never_uses` намеренно
 * срабатывает только когда набор выдан, поэтому и проверять её надо так же.
 */
const idleKit = compileKit([
  { delivery: 'bolt', effects: ['damage'], element: 'kinetic' },
  { delivery: 'cone', effects: ['damage'], element: 'kinetic' },
  { delivery: 'self', effects: ['heal'], element: 'frost' },
]).defs;
const slipped = [];
for (const [name, src] of idleBrains) {
  const r = await admit(src, 'blue', { sparring, kit: idleKit });
  if (r.ok) slipped.push(name);
}
console.log(`  бездействующий мозг отвергается      —          ${slipped.length === 0
  ? `✓ ${idleBrains.length} из ${idleBrains.length}` : `✗ ПРОШЛИ: ${slipped.join(', ')}`}`);
if (slipped.length) process.exitCode = 1;

/* Прелюдия и список разрешённых имён обязаны совпадать. */
const preludeNames = [...PRELUDE.matchAll(/^const ([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]);
const { ALLOWED_GLOBALS } = await import('../src/server/sandbox/analyse.js');
const missing = preludeNames.filter((n) => !ALLOWED_GLOBALS.has(n));
console.log(`  прелюдия против списка имён          —          ${missing.length ? `✗ не хватает ${missing.join(', ')}` : '✓ совпадают'}`);

/* Инструментатор не меняет семантику — десять безблочных конструкций. */
const SEM = [
  ['if без блока + return', 'function f(a){ if(!a) return 1; return 2; } out=f(0);', 1],
  ['if/else без блоков', 'function f(a){ if(a) return 1; else return 2; } out=f(0);', 2],
  ['while без блока', 'function f(){ let n=0; while(n<3) n++; return n; } out=f();', 3],
  ['for без блока', 'function f(){ let s=0; for(let i=0;i<4;i++) s+=i; return s; } out=f();', 6],
  ['for-of без блока', 'function f(){ let s=0; for(const x of [1,2,3]) s+=x; return s; } out=f();', 6],
  ['стрелка-выражение', 'const g=(x)=>x*2; function f(){ return g(21); } out=f();', 42],
  ['тернарник', 'function f(a){ return a ? 10 : 20; } out=f(0);', 20],
  ['switch', 'function f(a){ switch(a){ case 1: return 11; default: return 99; } } out=f(1);', 11],
  ['label + continue', 'function f(){ let s=0; outer: for(let i=0;i<3;i++){ for(let j=0;j<3;j++){ if(j>0) continue outer; s++; } } return s; } out=f();', 3],
  ['do-while без блока', 'function f(){ let n=0; do n++; while(n<2); return n; } out=f();', 2],
];
let semBad = 0;
for (const [name, src, want] of SEM) {
  const run = async (code) => {
    const mod = `let out; let __fuel=()=>{};\n${code}\nexport default out;`;
    try { return (await import(`data:text/javascript;base64,${Buffer.from(mod, 'utf8').toString('base64')}`)).default; }
    catch (e) { return `ERR:${e.message}`; }
  };
  const a = await run(src); const b = await run(instrument(src).code);
  if (a !== want || b !== want) { semBad++; console.log(`  ✗ вставка меняет семантику: ${name} — ${a} → ${b}, ждали ${want}`); }
}
console.log(`  вставка топлива не меняет смысл      —          ${semBad ? `✗ ${semBad} из ${SEM.length}` : `✓ ${SEM.length} из ${SEM.length}`}`);

const fail = escaped > 0 || !ctl.ok || refBad > 0 || missing.length > 0 || semBad > 0;
console.log('\n  ' + (fail
  ? `ПРОБИТ — вышло ${escaped}, контроль ${ctl.ok ? 'цел' : 'сломан'}`
  : `ДЕРЖИТ — ${held} атак остановлено, честный мозг проходит${miscaught ? `, ${miscaught} поймано не той стеной` : ''}`) + '\n');
process.exit(fail ? 1 : 0);
