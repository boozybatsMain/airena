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
import {
  BEAM_MUZZLE, BEAM_RADIUS, DEFAULT_BUILD, DT, PROJECTILE_MUZZLE, PROJECTILE_TOUCH, statsOf,
} from '../../core/config.js';
import { FUEL_PER_LOAD, FUEL_PER_THINK, OUT_OF_FUEL, safeObject } from './instrument.js';

/*
 * ── BEHAVIOUR, MEASURED INSIDE THE WALL (D191 §1) ───────────────────────────
 *
 * `admit()` needs to know, per side, how much of a fighter's alive time went
 * by with no act running and a READY ability already in reach of the enemy,
 * and how much of it the body stood still — the numbers `review-r1-minds.md`
 * asked admission to gate on. Both need a per-tick look at the match, and a
 * trial fight runs inside this worker, behind the wall; nothing but the final
 * `result` crosses back out. So the counting happens HERE, via `runMatch`'s
 * own `onFrame`, and only the three small numbers per side leave the thread.
 *
 * `reachOf` is `reports/combat/spectate.mjs`'s function of the same name,
 * copied rather than imported (that file opens the live DB at import time,
 * which has no business happening inside a sandboxed worker): the true
 * centre-to-centre reach of a compiled ability, both radii included.
 */
const boltFlight = (def) => (def.speed
  ? Math.ceil((def.range / def.speed) / DT - 1e-9) * def.speed * DT : def.range);
const reachOf = (def, me, you) => {
  switch (def.kind) {
    case 'beam': return me.radius + BEAM_MUZZLE + def.range + you.radius + BEAM_RADIUS;
    case 'cone': return def.range + you.radius;
    case 'bolt': return me.radius + PROJECTILE_MUZZLE + boltFlight(def) + you.radius + PROJECTILE_TOUCH;
    case 'lob': return def.range + def.splash + you.radius;
    case 'zone': return def.range + def.radius + you.radius;
    case 'dash': return def.distance + me.radius + you.radius;
    default: return null;
  }
};
const STILL_MPS = 0.3;
const otherSide = (side) => (side === 'blue' ? 'orange' : 'blue');

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
/* Безопасный `Object` — см. safeObject() в instrument.js. */
const SAFE_OBJECT = safeObject();

/* Одна реализация на процесс: см. IDX_SOURCE в instrument.js — там же
   разобрано, почему ключ приводится к строке до сравнения и почему доступ
   идёт по приведённому значению. */
const IDX = (o, k) => {
  const key = typeof k === 'symbol' ? k : String(k);
  if (key === 'constructor' || key === '__proto__' || key === 'prototype') {
    throw new Error(`доступ к ${String(key)} запрещён`);
  }
  return o[key];
};

async function loadBrain(instrumented, label, fuel, V) {
  /*
   * ЗАТЕНЕНИЕ ОПАСНЫХ ИМЁН ПАРАМЕТРАМИ — та же техника, что в браузере.
   *
   * Мозг грузится модулем в реалм воркера, где `Object`, `Function` и
   * `globalThis` настоящие. Разбор имён их запрещает, но отражение обходит
   * разбор: `Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Object),
   * 'constructor').value` — это конструктор `Function`, а в воркере он даёт
   * настоящий `process`. На хосте тот же приём упирается в
   * `codeGeneration: { strings: false }` у `node:vm`; у воркера такой стены
   * нет, и это единственное место, где она нужна.
   *
   * `Object` подменяется шимом без отражения, остальные — undefined.
   */
  const wrapped = `export default function build(
    V, console, __fuel, __idx, __safeObject,
    Object, Function, Reflect, Proxy, globalThis, process, require, module,
    WebAssembly, SharedArrayBuffer, Atomics, eval_
  ) {
  "use strict";
  Object = __safeObject;
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
    /* `__idx` — проверка доступа по вычисляемому ключу; см. instrument.js.
       Без неё разбор имён обходится собранной строкой, и мозг получает
       конструктор Function, то есть выполнение кода прямо в воркере. */
    const t = mod.default(V, quiet, fuel.tick, IDX, SAFE_OBJECT);
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
  const { seed, seeds, brains, kits, builds, referenceTag, curtainSeconds, record } = workerData;
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
  /* Radii for `reachOf` — from the same builds the match itself runs on, the
     arena's default body on whichever side (or both) admission never passes
     one for. */
  const radiusOf = {
    blue: statsOf(builds?.blue || DEFAULT_BUILD).radius,
    orange: statsOf(builds?.orange || DEFAULT_BUILD).radius,
  };
  try {
    for (const s of list) {
      for (const w of Object.values(wrapped)) w.reset();
      /* Reset per seed, not per worker: `seeds` can carry a batch, and each
         seed's fight gets its own numbers. */
      const behaviour = {
        blue: { aliveTicks: 0, idleInReachTicks: 0, stillTicks: 0 },
        orange: { aliveTicks: 0, idleInReachTicks: 0, stillTicks: 0 },
      };
      /* Only worth watching when at least one side carries a real kit — a
         fixture-only fight has no `reachOf` to check against. */
      const onFrame = kits ? (snap) => {
        if (snap.over) return;
        for (const side of ['blue', 'orange']) {
          const f = snap[side];
          if (!f.alive) continue;
          const acc = behaviour[side];
          acc.aliveTicks++;
          if (f.act !== null) continue;
          const kit = kits[side];
          if (kit) {
            const you = snap[otherSide(side)];
            const dist = Math.hypot(f.x - you.x, f.z - you.z);
            const inReach = Object.entries(f.cd).some(([k, c]) => {
              if (c > 0) return false;
              const def = kit[k];
              if (!def) return false;
              const reach = reachOf(def, { radius: radiusOf[side] }, { radius: radiusOf[otherSide(side)] });
              return reach !== null && dist <= reach;
            });
            if (inReach) acc.idleInReachTicks++;
          }
          if (Math.hypot(f.vx, f.vz) < STILL_MPS) acc.stillTicks++;
        }
      } : null;
      out = runMatch(wrapped, { seed: s, record: !!record, curtainSeconds: curtainSeconds || 0, kits, builds, referenceTag, onFrame });
      if (kits) { out.result.blue.behavior = behaviour.blue; out.result.orange.behavior = behaviour.orange; }
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
