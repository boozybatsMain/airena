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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

/** Стены, каждая из которых обязана держать одна. */
const WALL = { ANALYSE: 'анализ', ISOLATE: 'изолят', FUEL: 'топливо', TIMEOUT: 'таймаут' };

const ATTACKS = [
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
      const r = await runIsolated({ octopus: a.src, gorilla: sparring }, { seed: 5, timeoutMs: 8000 });
      const fuel = r.fuel?.octopus;
      const faults = r.result?.octopus?.faults ?? 0;
      if (fuel?.exhausted) { verdict = 'топливо'; detail = `потрачено ${fuel.spent} шагов`; }
      else if (faults > 0) { verdict = 'sim'; detail = `${faults} падений мысли`; }
      else { verdict = 'ПРОШЛА'; detail = 'мозг отработал без единого возражения'; }
    } catch (e) {
      verdict = e.code === 'timeout' ? 'таймаут' : 'изолят';
      detail = e.message;
    }
  }

  const wanted = a.expect || ({ [WALL.ANALYSE]: 'анализ', [WALL.FUEL]: 'топливо', [WALL.ISOLATE]: 'изолят', [WALL.TIMEOUT]: 'таймаут' })[a.wall];
  const ok = verdict !== 'ПРОШЛА';
  const exact = verdict === wanted;
  if (!ok) escaped++;
  else { held++; if (!exact) miscaught++; }

  const mark = !ok ? '✗ ВЫШЛА' : (exact ? '✓' : '~ поймана другой');
  console.log(`  ${a.name.padEnd(36)} ${String(a.wall).padEnd(10)} ${mark} ${exact ? '' : `(${verdict})`}`);
  if (VERBOSE || !ok) console.log(`      ${detail.slice(0, 130)}`);
}

/* Контроль: честный мозг обязан пройти все стены. */
const ctl = await admit(CONTROL, 'octopus', { sparring });
console.log('  ' + '─'.repeat(74));
console.log(`  контроль (честный мозг)              —          ${ctl.ok ? '✓ допущен' : '✗ ОТВЕРГНУТ'}`);
if (!ctl.ok) console.log(`      ${JSON.stringify(ctl.problems).slice(0, 200)}`);

/* И все эталонные мозги репозитория — тоже контроль, только большой. */
let refOk = 0; let refBad = 0;
for (const tag of readdirSync(join(ROOT, 'brains'))) {
  const dir = join(ROOT, 'brains', tag);
  if (!statSync(dir).isDirectory()) continue;
  for (const slot of ['octopus', 'gorilla']) {
    const f = join(dir, `${slot}.js`);
    if (!existsSync(f)) continue;
    const r = analyse(readFileSync(f, 'utf8'));
    if (r.ok) refOk++;
    else { refBad++; console.log(`  ✗ эталон ${tag}/${slot} отвергнут: ${r.problems[0].message.slice(0, 90)}`); }
  }
}
console.log(`  эталонные мозги репозитория          —          ${refBad === 0 ? `✓ ${refOk} из ${refOk}` : `✗ ${refBad} отвергнуто`}`);

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
