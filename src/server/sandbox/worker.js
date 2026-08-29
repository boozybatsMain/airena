/**
 * Изолят: весь матч целиком, внутри отдельного потока.
 *
 * Ключевое решение архитектуры — гонять ЦЕЛЫЙ МАТЧ, а не отдельную мысль.
 * Мысль на границе потока стоит round-trip: 15 Гц × два мозга × 50 с — это
 * полторы тысячи переходов на бой, то есть в разы дороже самого боя. Матч
 * же — чистая функция `(seed, brainA, brainB, constants_version)` (F5, A2),
 * и её целиком можно унести за стену: наружу выходит результат, внутрь не
 * входит ничего, кроме исходников и сида.
 *
 * Четыре стены A1, и вот где каждая:
 *   1. СТАТИЧЕСКИЙ АНАЛИЗ — `analyse.js`, на стороне хоста, до запуска.
 *   2. ИЗОЛЯТ — этот файл: отдельный поток, `resourceLimits`, ни DOM, ни
 *      `require`. Исходник мозга загружается модулем через `data:`-URL —
 *      не `eval`, не `new Function`, не `node:vm` (N11 запрещает все три).
 *   3. ТОПЛИВО ПО ИНСТРУКЦИЯМ — `instrument.js` вставил `__fuel()`; счётчик
 *      живёт здесь и не зависит от стенных часов, то есть от нагрузки машины.
 *   4. ТАЙМАУТ ПОТОКА — на стороне хоста, `worker.terminate()`. Он не
 *      обходится одним нативным вызовом: поток убивают снаружи, а не просят
 *      изнутри остановиться.
 */

import { parentPort, workerData } from 'node:worker_threads';

import { PRELUDE } from '../../brain/prelude.js';
import { runMatch } from '../../core/match.js';
import { FUEL_PER_LOAD, FUEL_PER_THINK, OUT_OF_FUEL } from './instrument.js';

/**
 * Векторная прелюдия — ИЗ ЕДИНОГО ИСТОЧНИКА, а не переписанная от руки.
 *
 * Рукописная копия уже разошлась однажды: `angleTo` в прелюдии принимает
 * heading и вектор, а копия принимала два вектора. Мозги не падали, не
 * жаловались и промахивались все до одного — матч кончался ничьёй на исходе
 * времени, и это выглядело как «изолят почему-то слабее». Поэтому объект
 * строится из того же текста, который хост инжектит в свой контекст.
 *
 * Построение — импортом модуля из `data:`-URL, тем же механизмом, что и сам
 * мозг. Это не `eval` и не `new Function` (N11 запрещает оба): у модуля своя
 * область видимости, и он не видит ничего из этого файла.
 */
async function buildPrelude() {
  const src = `${PRELUDE}\nexport { V };`;
  const url = `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`;
  const mod = await import(url);
  return mod.V;
}

/**
 * Загрузка мозга модулем из `data:`-URL.
 *
 * Это не обход запрета N11, а его соблюдение: `eval`, `new Function` и
 * `node:vm` дают коду доступ к области видимости вызывающего и к реалму
 * хоста. Импорт модуля не даёт ни того, ни другого: модуль получает пустую
 * область, свои собственные `import`ы запрещены анализом, а всё, что ему
 * нужно снаружи, приходит аргументами функции-обёртки.
 */
async function loadBrain(instrumented, label, fuel, V) {
  const wrapped = `export default function build(V, console, __fuel) {
  "use strict";
  ${instrumented}
  ;
  return typeof think === 'function' ? think : null;
}`;
  const url = `data:text/javascript;base64,${Buffer.from(wrapped, 'utf8').toString('base64')}`;
  let mod;
  try {
    mod = await import(url);
  } catch (e) {
    throw new Error(`${label}: мозг не загрузился — ${e.message}`);
  }
  const logs = [];
  const quiet = {
    log: (...a) => { if (logs.length < 40) logs.push(a.map(String).join(' ')); },
  };
  quiet.info = quiet.warn = quiet.error = quiet.debug = quiet.log;

  /*
   * `build` — фабрика, и это ровно та же семантика, что у `reset()` хоста:
   * «re-runs the wrapper, which re-declares the brain's own top-level».
   * Верхнеуровневые `let` мозга создаются заново на каждый вызов, поэтому
   * состояние прошлого боя не переезжает в следующий. Без этого пачка боёв
   * в одном потоке давала другие логи, чем те же бои по одному, — и это не
   * «изолят другой», а «изолят помнит прошлый матч».
   */
  const build = () => {
    fuel.left = FUEL_PER_LOAD;
    const t = mod.default(V, quiet, fuel.tick);
    if (typeof t !== 'function') throw new Error(`${label}: функция think не объявлена`);
    return t;
  };
  return { build, think: build(), logs };
}

/** Счётчик топлива. Бросает СВОЮ ошибку, отличимую от ошибок мозга. */
function makeFuel() {
  const f = { left: 0, spent: 0, exhausted: false };
  f.tick = () => {
    f.spent++;
    if (--f.left <= 0) { f.exhausted = true; throw new Error(OUT_OF_FUEL); }
  };
  return f;
}

/**
 * `Math.random` в изоляте не существует.
 *
 * Хост закрывал её в своём vm-контексте, изолят — нет, и мозг доставал её
 * деструктуризацией: `const {random} = Math`. Статический анализ этого не
 * видит и видеть не должен — `Math` разрешён, `random` его поле. А бой,
 * зависящий от неё, перестаёт воспроизводиться из сида, то есть падает A2
 * и вместе с ним вся серверная верификация A3.
 *
 * Сим сюда не заглядывает: он берёт числа из собственного потока, засеянного
 * сидом матча (`api.rand`), и `Math.random` ему не нужна ни разу.
 */
function sealRandom() {
  const boom = function random() {
    throw new Error('Math.random недоступна — бой обязан воспроизводиться из сида; используй api.rand()');
  };
  Object.defineProperty(Math, 'random', { value: boom, writable: false, configurable: false });
}

async function main() {
  const { seed, seeds, brains, curtainSeconds, record } = workerData;
  sealRandom();
  const V = await buildPrelude();
  const fuels = {};
  const ready = {};
  const faults = {};

  for (const [slot, src] of Object.entries(brains)) {
    const fuel = makeFuel();
    fuels[slot] = fuel;
    try {
      ready[slot] = await loadBrain(src, slot, fuel, V);
    } catch (e) {
      parentPort.postMessage({ ok: false, error: 'load', slot, message: e.message });
      return;
    }
  }

  const wrapped = {};
  for (const [slot, r] of Object.entries(ready)) {
    wrapped[slot] = {
      logs: r.logs,
      tick(p, api) {
        /* Топливо выдаётся ПОМЫСЛЬНО: мозг, потративший всё на одном тике,
           не забирает бюджет у следующего. Это же делает обрыв локальным —
           один фолт вместо мёртвого бойца. */
        fuels[slot].left = FUEL_PER_THINK;
        /* `micros` — телеметрия по стенным часам, и она ЕДИНСТВЕННОЕ поле
           результата, которое не детерминировано. Определяющим считается
           `result.log`; именно его сравнивают проверки A2. Возвращаем в той
           же форме, что и хост, чтобы поле значило одно и то же на обоих
           путях, а не «ноль, потому что забыли». */
        const t0 = performance.now();
        r.think(p, api);
        return { micros: (performance.now() - t0) * 1000 };
      },
      reset() { r.think = r.build(); r.logs.length = 0; },
    };
  }

  /*
   * Пачка сидов в одном запуске.
   *
   * Проверка адаптации гоняет сотню боёв (§7.2·3), и поднимать поток на
   * каждый — это 100 × ~30 мс на старт вместо одного. Мозги загружаются
   * один раз, состояние между боями не переносится: сим создаёт мир заново,
   * а замыкание мозга живёт между матчами ровно так же, как у хоста между
   * `reset()`, — то есть одинаково на обоих путях.
   */
  const list = Array.isArray(seeds) && seeds.length ? seeds : [seed];
  const results = [];
  let out = null;
  try {
    for (const s of list) {
      for (const w of Object.values(wrapped)) w.reset();
      out = runMatch(wrapped, { seed: s, record: !!record, curtainSeconds: curtainSeconds || 0 });
      results.push(out.result);
    }
  } catch (e) {
    parentPort.postMessage({ ok: false, error: 'run', message: String(e && e.message) });
    return;
  }

  parentPort.postMessage({
    ok: true,
    result: results[results.length - 1],
    results,
    frames: record ? out.frames : null,
    fuel: Object.fromEntries(Object.entries(fuels).map(([k, f]) => [k, { spent: f.spent, exhausted: f.exhausted }])),
    logs: Object.fromEntries(Object.entries(ready).map(([k, r]) => [k, r.logs.slice(-20)])),
    faults,
  });
}

main().catch((e) => {
  parentPort.postMessage({ ok: false, error: 'internal', message: String(e && e.message) });
});
