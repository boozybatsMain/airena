/**
 * Running someone else's mind.
 *
 * ── what this is and is not ─────────────────────────────────────────────────
 *
 * `node:vm` is a guard against a crash, not against an attacker, and the honest
 * statement of what it buys is narrower than it looks. A context's globals are
 * fresh, so there is no `require`, no `process` and no `fetch` in SCOPE; a
 * runaway loop is cut by the per-call timeout; a throw is caught and turned
 * into a fact about the match. Those three are the whole of the guarantee.
 *
 * What it is NOT is a boundary. A host object carries the host realm on its
 * prototype chain, and `Function` reached that way compiles in the host with
 * the host's authority. `sim.js` cuts the prototypes off the `api` wrappers,
 * which closed `api.move.constructor('process.exit(3)')()`. It did not close
 * what those wrappers RETURN. While that was open, four routes were measured
 * on this code — each a three-line brain run through `runMatch`, each ending
 * the whole process rather than the thought. `guard` below shut all four; the
 * exit codes below are what they DID when they were found, not what they do
 * now. Re-run against this file each faults on every thought instead, 25 of
 * 25 thinks, the match finishing in 56-77 ms:
 *
 *     api.ray(1,0,10).constructor.constructor('return process')()    exit 3
 *     api.pathTo(0,0).points.constructor.constructor(…)()            exit 4
 *     api.recall('k').constructor.constructor(…)()                   exit 5
 *     catch (e) from an exhausted query budget — a HOST Error        exit 6
 *
 * So the boundary is drawn here, in the only file that knows there are two
 * realms. `guard` round-trips every object an api verb returns through the
 * CONTEXT's own `JSON.parse` and re-throws host errors as context errors, so
 * what reaches a brain is data wearing the brain's own prototypes and
 * `.constructor.constructor` leads back to the brain's own `Function`. All
 * four probes now report a fault and leave the process alive. The round trip
 * costs 0.45 us on the `ray` hit that dominates the count and 3.3 us on the
 * widest thing that crosses (a 24-waypoint path). Over the 25 672 thoughts of
 * an l1..l6 grid that is 4.1 us on a mean thought of 98 us, against 93.9 us
 * without it.
 *
 * Two holes of the same shape were open OUTSIDE the timed window, where
 * neither the timeout nor a `try` reaches:
 *
 *  - The catch block read `err.message` off whatever the brain threw. A getter
 *    that loops there took 7 903 ms against a THINK_TIMEOUT_MS of 60, and one
 *    that throws took the runner down mid-match. The message is now taken
 *    INSIDE the context, under its own timeout.
 *  - `context.__p = …` is an ordinary property write, so a brain that made
 *    `__p` an accessor ran its setter on the host's stack. The channel slots
 *    are defined non-configurable before any brain code runs, and every write
 *    to them is inside the try.
 *  - Worse, and not reachable from either of those: `node:vm` itself reads
 *    properties off a thrown value while it decorates it on the way out, and
 *    that read is not inside anybody's timeout. `throw new Proxy({}, { get() {
 *    while (true) {} } })` hung `runInContext` forever — at TOP LEVEL it hangs
 *    `compileBrain`, so three lines of brain wedge a tournament before the
 *    first tick. So nothing brain-realm is allowed to cross at all now: the
 *    wrapper and the runner each catch on their own side of the wall and hand
 *    back a STRING. Both probes fault in 1 ms and the process stays alive.
 *
 * None of that makes `node:vm` a sandbox and it is not meant to be read as
 * one: what closes a route is finding it first, and the ones nobody has
 * thought of are the ones that matter. The thing that would make the stronger
 * claim true is a `node:worker_threads` worker: a separate isolate with its
 * own heap and its own event loop, handed the perception over `postMessage`
 * and never handed a host object at all. A `process.exit` inside one kills the
 * worker, the host sees an `exit` event and scores the brain as faulted, and
 * the prototype chain leads nowhere because nothing structured-cloneable has a
 * host realm behind it. It costs a message hop per thought and the loss of a
 * synchronous `tick`, which is why it has not been done — not because it is
 * unnecessary. What has made that acceptable is that the brains come from your
 * own subscription and your own prompt.
 *
 * Two things are done anyway because they cost nothing and buy correctness
 * rather than security:
 *
 *  - **Perception crosses as JSON.** `p` is serialised in the host and parsed
 *    inside the context, so every object the brain touches belongs to the
 *    context's realm and `p.mem` is a snapshot rather than a live handle on the
 *    fighter's memory. Without that, a brain could keep state by writing to
 *    `p.mem` directly, which works, is invisible to `api.remember`, and would
 *    quietly break the replay. About 1 kB per thought — free at 15 Hz.
 *
 *  - **`Math.random` and `Date` are removed.** Not for safety: for
 *    reproducibility. A match must be replayable from `(seed, brainA, brainB)`
 *    and both of those read the wall clock. `api.rand()` is the seeded
 *    replacement and the prompt says so, with the reason attached — a ban
 *    without a reason makes a model write ES3 in case the runtime is ancient.
 */

import vm from 'node:vm';

import { COMPILE_TIMEOUT_MS, THINK_TIMEOUT_MS } from '../core/config.js';
import { FUEL_PER_THINK, IDX_SOURCE, instrument } from '../server/sandbox/instrument.js';

/**
 * Helpers compiled into the brain's own realm.
 *
 * The set is small on purpose. Every helper is arithmetic the model would
 * otherwise spend attention writing and get subtly wrong — normalising a zero
 * vector, wrapping an angle across PI — and none of them encodes a decision.
 * `V.lead` is the one that looks like tactics and is not: it is the closed-form
 * intercept of a point moving at constant velocity, the same answer the model
 * would derive itself, and withholding it only means half the brains get the
 * quadratic wrong.
 */
import { PRELUDE } from './prelude.js';


/** Lines a brain's `console.log` may leave behind in one match. */
const LOG_LIMIT = 200;

/**
 * The message of an error the HOST raised — a think timeout, or a write into
 * the context that failed. Never called on a brain-realm value: those are
 * caught and stringified inside the context before they can cross.
 */
function hostMessage(err) {
  try {
    const m = err && err.message;
    return (typeof m === 'string' ? m : String(err)).slice(0, 400);
  } catch {
    return 'the thought failed in a way that could not be described';
  }
}

export class BrainFault extends Error {
  constructor(stage, message) {
    super(message);
    this.stage = stage;
  }
}

/**
 * Compile one brain and hand back something the simulation can call.
 *
 * @param {string} source the model's own JavaScript, unmodified
 * @param {string} label who it belongs to, for error messages
 */
export function compileBrain(source, label = 'brain') {
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new BrainFault('compile', `${label}: empty source`);
  }

  const logs = [];
  const context = vm.createContext(Object.create(null), {
    name: label,
    codeGeneration: { strings: false, wasm: false },
  });

  /*
   * A console exists because models write one while thinking and a thrown
   * ReferenceError on the first tick would read as "the brain is broken" when
   * the brain is fine. Captured rather than printed: 1350 thoughts of debug
   * output would bury the match report.
   *
   * `__logs` and the three channel slots are DEFINED rather than assigned, and
   * defined before a line of brain source has run. `context.__p = …` is an
   * ordinary property write, so a brain that redefined `__p` as an accessor ran
   * its setter on the host's stack, outside the timeout and outside any try —
   * one `Object.defineProperty` at top level was measured taking the process
   * down. Non-configurable is the part a brain cannot argue with.
   */
  vm.runInContext(
    `Object.defineProperty(globalThis, '__logs', { value: [], writable: false, configurable: false });
     for (const k of ['__p', '__api', '__evalError', '__think', '__arity']) {
       Object.defineProperty(globalThis, k, { value: null, writable: true, configurable: false });
     }
     globalThis.console = {
       log: (...a) => { if (__logs.length < ${LOG_LIMIT}) __logs.push(a.map(String).join(' ')); },
     };
     console.info = console.warn = console.error = console.debug = console.log;
     Math.random = function () { throw new Error('Math.random is unavailable — use api.rand()'); };
     globalThis.Date = undefined;
     globalThis.performance = undefined;`,
    context,
  );

  /*
   * The two context-realm helpers the boundary is built out of, made before any
   * brain code runs and closed over the ORIGINAL `JSON.parse` and `Error` — a
   * brain that replaces either global afterwards changes nothing about what
   * crosses. Neither is left on `globalThis`, so neither is a name a brain can
   * shadow or a key `reset` has to preserve.
   */
  const marshal = vm.runInContext('((P) => (s) => P(s))(JSON.parse)', context);
  const raise = vm.runInContext('((E) => (m) => { throw new E(m); })(Error)', context);
  const logsRef = vm.runInContext('globalThis.__logs', context);

  /*
   * Every global that exists before the brain's first line, so `reset` can tell
   * the context's own furniture from anything the brain left lying about.
   */
  const baseNames = vm.runInContext(
    'JSON.stringify(Object.getOwnPropertyNames(globalThis))', context,
  );

  /**
   * One api verb, with the realm boundary drawn around it.
   *
   * Anything that is not a primitive goes through the CONTEXT's `JSON.parse`,
   * so the brain receives data carrying its own prototypes; `api.ray(…)`,
   * `api.pathTo(…)` and `api.recall(…)` each handed back a host object whose
   * `.constructor.constructor` is the host's `Function`, and each was measured
   * ending this process outright. A value the brain itself passed in — the
   * default of `api.recall` is the only one — is handed straight back by
   * reference, so a default object does not silently become a copy.
   *
   * The re-throw is the same hole in the other direction: running out of
   * perception budget raises a HOST `Error`, and `catch (e)` followed by
   * `e.constructor.constructor(…)()` was measured ending the process too.
   *
   * All of this runs inside `runner.runInContext`, which is what makes it
   * safe as well as affordable: the think timeout covers host frames called
   * from context code, so neither the stringify nor a brain-realm getter
   * reached through it can outlive the thought. 0.45 us for a `ray` hit,
   * 3.3 us for a 24-waypoint path, 4.1 us on a mean thought of 98 us — the six
   * objects a thought marshals on average are nearly all rays.
   */
  const guard = (fn) => {
    const w = (...a) => {
      let out;
      try {
        out = fn(...a);
      } catch (err) {
        let m;
        try { m = String((err && err.message) || err); } catch { m = 'an api call failed'; }
        raise(m);
        return undefined;
      }
      if (out === null) return null;
      const kind = typeof out;
      if (kind === 'function') return undefined;
      if (kind !== 'object') return out;
      for (const arg of a) if (arg === out) return out;
      try { return marshal(JSON.stringify(out)); } catch { return null; }
    };
    Object.setPrototypeOf(w, null);
    return w;
  };

  const guardApi = (api) => {
    if (api === null || typeof api !== 'object') return api;
    const safe = Object.create(null);
    for (const k of Object.keys(api)) {
      if (typeof api[k] === 'function') safe[k] = guard(api[k]);
    }
    return safe;
  };

  /*
   * The brain's own top-level throw is caught HERE, inside the context, and
   * left behind as a string. Letting it propagate out of `runInContext` was a
   * hang: `node:vm` reads properties off a thrown value as it decorates it, so
   * `throw new Proxy({}, { get() { while (true) {} } })` at top level wedged
   * `compileBrain` with no timeout anywhere above it.
   */
  /*
   * ТОПЛИВО, А НЕ ЧАСЫ. A1 требует «предел по инструкциям, не по времени», и
   * изолят это соблюдает; хост — не соблюдал, и цена оказалась выше, чем
   * «менее строгая проверка».
   *
   * Часы делают бой ЗАВИСЯЩИМ ОТ ЗАГРУЗКИ МАШИНЫ. Замерено: под нагрузкой
   * (load average 64) честный эталонный мозг не укладывался в 60 мс, получал
   * fault, и один и тот же сид давал разные бои — четыре расхождения из шести.
   * То есть A2, «бит-в-бит повторяемость как инвариант CI», держался ровно до
   * первой занятой машины. И это не только про тесты: через хост идут
   * `tools/arena.mjs`, `tools/balance.mjs` и весь замер баланса, так что любое
   * измерение проекта могло быть испорчено фоновой сборкой.
   *
   * Разметка та же, что у изолята (`sandbox/instrument.js`), и это важно
   * отдельно: `tools/checkisolate.mjs` требует, чтобы один и тот же бой,
   * прогнанный обоими путями, дал одинаковый лог. Пока размечал только
   * изолят, равенство держалось на том, что разметка ничего не меняет; теперь
   * оба пути размечены одинаково, и держаться ему больше не на чем.
   *
   * Часы остаются последним рубежом — от того, что разметка поймать не может
   * (геттер-ловушка на брошенном значении читается уже вне брейн-реалма), — но
   * порог поднят так, чтобы честный мозг не встречал его никогда.
   */
  let metered = source;
  let fuelPoints = 0;
  try {
    const out = instrument(source);
    metered = out.code;
    fuelPoints = out.points;
  } catch { /* не размечается — работаем как раньше, часы прикроют */ }

  let script;
  try {
    script = new vm.Script(
      `globalThis.__think = null;
       globalThis.__evalError = null;
       /* Счётчик живёт в ЗАМЫКАНИИ, а не на globalThis.
          Первая версия держала остаток глобальной переменной, и каждый вызов
          __fuel() шёл через перехватчик глобалей контекста node:vm —
          порядка десяти микросекунд на обращение. Двести тысяч шагов топлива
          при такой цене — это две секунды, то есть ровно тот потолок часов, от
          которого топливо и должно было избавить: вечный цикл снова ловили
          часы, а не топливо, и повторяемость снова зависела от машины.
          В замыкании обращение стоит наносекунды. */
       ${IDX_SOURCE}
       globalThis.__idx = __idx;
       globalThis.__fuel = (function () {
         let left = 0;
         const f = function () { if (--left < 0) throw new Error('brain ran out of fuel'); };
         f.fill = function (n) { left = n; };
         return f;
       })();
       try {
         globalThis.__think = (function () {
           "use strict";
           ${PRELUDE}
           ${metered}
           ;
           return typeof think === 'function' ? think : null;
         })();
       } catch (e) {
         try {
           const m = e && e.message;
           globalThis.__evalError = typeof m === 'string' ? m : String(e);
         } catch {
           globalThis.__evalError = 'the brain threw a value whose message could not be read';
         }
       }
       globalThis.__arity = globalThis.__think ? globalThis.__think.length : -1;`,
      { filename: `${label}.brain.js` },
    );
  } catch (err) {
    // Host-generated: V8 could not parse the source. Safe to read directly.
    throw new BrainFault('parse', `${label}: ${err.message}`);
  }

  try {
    script.runInContext(context, { timeout: COMPILE_TIMEOUT_MS });
  } catch (err) {
    throw new BrainFault('evaluate', `${label}: ${hostMessage(err)}`);
  }
  const evalError = vm.runInContext('globalThis.__evalError', context, { timeout: COMPILE_TIMEOUT_MS });
  if (typeof evalError === 'string') throw new BrainFault('evaluate', `${label}: ${evalError}`);

  // Timed like everything else that touches the context after brain source has
  // run: `__think` is an ordinary property and a getter on it would otherwise
  // loop here, outside every guard in this file.
  const think = vm.runInContext('globalThis.__think', context, { timeout: COMPILE_TIMEOUT_MS });
  if (typeof think !== 'function') {
    throw new BrainFault('shape', `${label}: no function named "think" was defined`);
  }
  const arity = vm.runInContext('globalThis.__arity', context, { timeout: COMPILE_TIMEOUT_MS });
  if (arity !== 2) {
    throw new BrainFault('shape', `${label}: think takes ${arity} parameter(s), it must take exactly 2 — think(p, api)`);
  }

  /*
   * One thought, with the brain's throw caught on the brain's own side.
   *
   * The old runner let it propagate and the catch block in `tick` read
   * `err.message` off it — after `runInContext` had returned, so outside the
   * timeout and outside any try. `throw { get message() { …loop… } }` measured
   * one thought at 7 903 ms against a THINK_TIMEOUT_MS of 60; `throw { get
   * message() { throw … } }` unwound past `step` and killed the runner; and a
   * looping Proxy hung `runInContext` itself, forever. Coercing inside the
   * context puts all three under the same 60 ms and returns a plain string,
   * which is the only thing that crosses.
   */
  const runner = new vm.Script(
    `(() => {
       globalThis.__fuel.fill(${FUEL_PER_THINK});
       try {
         globalThis.__think(JSON.parse(globalThis.__p), globalThis.__api);
         return null;
       } catch (e) {
         try { const m = e && e.message; return typeof m === 'string' ? m : String(e); }
         catch { return 'the brain threw a value whose message could not be read'; }
       }
     })()`,
    { filename: `${label}.tick.js` },
  );

  /**
   * Delete every global the brain has added since it was compiled.
   *
   * `reset` re-runs the wrapper, which re-declares the brain's own top-level
   * bindings, and that was read as a clean slate. It is not: a property written
   * to `globalThis` survives it, and `tournament.mjs` and `falsify.mjs` both
   * reset rather than recompile. Measured with a brain counting its thoughts
   * there and changing behaviour past 200 of them, one seed run three times:
   * 32.873 m, then 22.574 m, then 23.657 m over 364 ticks against 266. The
   * same seed, three answers, which is the one thing a seeded design may not
   * do. Deleting the additions gives 32.873 m three times.

   * Symbols are swept too. A brain cannot reach a symbol it did not make, but
   * `Symbol.for('s')` is a registry lookup and comes back the same across
   * resets, so a symbol key hides state exactly as well as a string one.
   */
  const CLEAN = new vm.Script(
    `(() => {
       const keep = new Set(${baseNames});
       for (const k of Object.getOwnPropertyNames(globalThis)) {
         if (!keep.has(k)) { try { delete globalThis[k]; } catch { /* non-configurable */ } }
       }
       for (const s of Object.getOwnPropertySymbols(globalThis)) {
         try { delete globalThis[s]; } catch { /* non-configurable */ }
       }
     })()`,
    { filename: `${label}.reset.js` },
  );

  let faults = 0;
  /**
   * Set when a brain does not survive its own reset — freezing `globalThis` is
   * enough. Every later thought is a fault instead of an exception in the host:
   * a broken brain is still a fact about the match.
   */
  let broken = null;

  return {
    label,
    source,
    /**
     * Put the mind back the way it started, without re-parsing it.
     *
     * A brain may declare state beside `think` and it persists for as long as
     * its context lives — correct within a match and poison across them, since
     * a brain that remembered the last fight would make round 40 depend on
     * round 1 and destroy the reproducibility the seeded design is built on.
     * The obvious answer is to recompile per match, and that is what the
     * tooling did until a balance sweep spent most of its wall clock parsing
     * the same seven kilobytes a thousand times. Re-running the already-parsed
     * script re-executes the wrapper, which re-declares every top-level
     * binding, and `CLEAN` above deletes everything the brain hung off
     * `globalThis` — together, the same clean slate as a fresh compile, at
     * 188 us against the 62 us the re-run alone cost, and against 1 029 us to
     * recompile the 6.5 kB of source from scratch.
     */
    reset() {
      faults = 0;
      broken = null;
      try {
        CLEAN.runInContext(context, { timeout: COMPILE_TIMEOUT_MS });
        script.runInContext(context, { timeout: COMPILE_TIMEOUT_MS });
        const e = vm.runInContext('globalThis.__evalError', context, { timeout: COMPILE_TIMEOUT_MS });
        if (typeof e === 'string') broken = `brain did not survive reset: ${e}`;
      } catch (err) {
        broken = `brain did not survive reset: ${hostMessage(err)}`;
      }
      try { logsRef.length = 0; } catch { /* a brain that froze its own log */ }
    },
    get logs() { return logsRef; },
    get faults() { return faults; },
    /**
     * One thought. Returns null on success, or `{ fault: true, error }` — the
     * shape `sim.step` reads. It never throws: a brain that throws is a fact
     * about the match, not an exception in the host.
     */
    tick(p, api) {
      if (broken) { faults++; return { fault: true, error: broken }; }
      const t0 = process.hrtime.bigint();
      let thrown = null;
      try {
        // Inside the try, both of them: a write into the context is ordinary
        // JavaScript and can fail, and a thought that cannot be delivered is a
        // fault like any other rather than an exception out of the tick.
        context.__p = JSON.stringify(p);
        context.__api = guardApi(api);
        thrown = runner.runInContext(context, { timeout: THINK_TIMEOUT_MS });
      } catch (err) {
        // Host-generated only: the runner catches everything brain-realm.
        faults++;
        return { fault: true, error: hostMessage(err) };
      } finally {
        try { context.__p = null; context.__api = null; } catch { /* unwritable channel */ }
      }
      if (typeof thrown === 'string') { faults++; return { fault: true, error: thrown.slice(0, 400) }; }
      return { micros: Number(process.hrtime.bigint() - t0) / 1000 };
    },
  };
}

/**
 * What a model actually returns versus what compiles.
 *
 * Every model wraps code in a fence at least sometimes, and a prompt line
 * saying "no markdown" moves that from always to sometimes rather than to
 * never. Stripping is one regex and removes a whole class of generation
 * failure, so it is done here rather than argued about in the prompt.
 */
export function extractSource(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  const fence = s.match(/```(?:javascript|js|jsx|ts)?\s*\n([\s\S]*?)```/);
  if (fence) s = fence[1];
  else s = s.replace(/^```(?:javascript|js|jsx|ts)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  // A leading prose paragraph before the first declaration is the other common
  // shape. Cut to the first line that could begin a program.
  const start = s.search(/^\s*(?:\/\/|\/\*|function\s|const\s|let\s|var\s|class\s|'use strict')/m);
  if (start > 0) s = s.slice(start);
  return s.trim();
}
