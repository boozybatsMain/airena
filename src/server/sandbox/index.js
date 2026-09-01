/**
 * Хозяйская сторона изолята: допуск мозга и прогон матча за стеной.
 *
 * Четвёртая стена A1 живёт здесь: таймаут, который «не обходится одним
 * нативным вызовом». Поток убивают СНАРУЖИ (`worker.terminate()`), а не
 * просят изнутри остановиться — просьба внутрь застрявшего кода не доходит.
 *
 * `admit()` — единственная дверь, через которую мозг попадает в систему.
 * Она проверяет статически (стена 1) и прогоняет два пробных боя в изоляте:
 * мозг, который не пережил допуск, не сохраняется никуда, поэтому в БД по
 * определению нет ни одного мозга, не прошедшего все четыре стены.
 */

import { Worker } from 'node:worker_threads';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyse } from './analyse.js';
import { instrument, OUT_OF_FUEL } from './instrument.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, 'worker.js');

/** Стенные часы — ПОСЛЕДНЯЯ линия, а не первая: топливо ловит раньше и точнее. */
export const MATCH_TIMEOUT_MS = Number(process.env.AIRENA_MATCH_TIMEOUT_MS || 20_000);

/**
 * Ограничения потока. `codeRangeSizeMb` мал намеренно: мозгу негде и незачем
 * генерировать код, а маленький диапазон делает попытку заметной.
 */
export const LIMITS = {
  maxOldGenerationSizeMb: 96,
  maxYoungGenerationSizeMb: 16,
  codeRangeSizeMb: 8,
  stackSizeMb: 4,
};

export class IsolateError extends Error {
  constructor(code, message, extra = {}) { super(message); this.code = code; Object.assign(this, extra); }
}

/**
 * Прогнать матч в изоляте.
 *
 * @param {object} brains  { blue: source, orange: source } — уже допущенные
 * @param {object} opts    seed, record, curtainSeconds, timeoutMs
 */
export function runIsolated(brains, { seed = 1, seeds = null, kits = null, builds = null, record = false, curtainSeconds = 0, timeoutMs = MATCH_TIMEOUT_MS } = {}) {
  const prepared = {};
  for (const [slot, src] of Object.entries(brains)) {
    prepared[slot] = instrument(src).code;
  }

  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER, {
      /* `builds` едет наравне с `kits` и `seed`: это вход матча, от него
         зависят здоровье, радиус, скорость и масса. Забыть его — значит
         показать бой, которого не было. */
      workerData: { seed, seeds, brains: prepared, kits, builds, record, curtainSeconds },
      resourceLimits: LIMITS,
      /* Ни аргументов, ни переменных окружения, ни stdin: изолят не должен
         уметь прочитать ни ключ (E4: ключ Anthropic живёт в env хоста), ни
         путь, ни имя машины.
         `execArgv: []` — не косметика: поток наследует флаги родителя, и
         `--input-type=module`, безобидный у хоста, роняет воркер с
         «can only be used with string input». Изолят обязан стартовать
         одинаково независимо от того, как запущен хозяин. */
      argv: [], env: {}, execArgv: [], stdin: false,
    });

    let done = false;
    const finish = (fn, v) => {
      if (done) return; done = true;
      clearTimeout(timer);
      w.terminate().catch(() => {});
      fn(v);
    };

    /* Таймаут растёт с числом боёв в пачке: сотня боёв законно идёт дольше
       одного, и общий потолок, рассчитанный на один, убивал бы честную
       проверку адаптации. */
    const budget = seeds && seeds.length > 1 ? timeoutMs * Math.ceil(seeds.length / 4) : timeoutMs;
    const timer = setTimeout(() => {
      finish(reject, new IsolateError('timeout',
        `матч не завершился за ${Math.round(budget / 1000)} с — поток снят снаружи`));
    }, budget);

    w.on('message', (m) => {
      if (!m || !m.ok) {
        finish(reject, new IsolateError(m?.error || 'unknown', m?.message || 'изолят не отчитался', { slot: m?.slot }));
        return;
      }
      finish(resolve, m);
    });
    w.on('error', (e) => finish(reject, new IsolateError('worker', String(e && e.message))));
    w.on('exit', (code) => {
      if (!done) finish(reject, new IsolateError('exit', `изолят вышел с кодом ${code} и ничего не сказал`));
    });
  });
}

/**
 * Допуск мозга: четыре стены подряд, до единой записи в БД.
 *
 * Возвращает { ok, problems, probe } — `probe` это два пробных боя против
 * спарринг-партнёра, тот же смысл, что у `src/brain/validate.js`, но за стеной.
 */
export async function admit(source, slot, { sparring, kit = null, seeds = [11, 22, 33, 44] } = {}) {
  const stat = analyse(source);
  if (!stat.ok) return { ok: false, stage: 'analyse', problems: stat.problems };

  let ins;
  try { ins = instrument(source); }
  catch (e) { return { ok: false, stage: 'instrument', problems: [{ code: 'instrument', message: e.message }] }; }
  if (ins.points === 0) {
    return { ok: false, stage: 'instrument', problems: [{ code: 'no_fuel_points', message: 'некуда вставить учёт топлива — мозг не содержит ни функции, ни цикла' }] };
  }

  if (!sparring) return { ok: true, stage: 'analyse', problems: [], probe: null };

  /* Вторая сторона — просто «не эта». Сторон две, они равноправны, и никаких
     чисел за именем не стоит: важно лишь посадить спарринг напротив. */
  const other = slot === 'blue' ? 'orange' : 'blue';
  const probe = [];
  for (const seed of seeds) {
    try {
      const m = await runIsolated({ [slot]: source, [other]: sparring },
        { seed, kits: kit ? { [slot]: kit } : null });
      const fuel = m.fuel?.[slot];
      const me = m.result[slot] || {};
      const sum = (o) => (o && typeof o === 'object' ? Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0) : Number(o) || 0);
      probe.push({
        seed, winner: m.result.winner, seconds: m.result.seconds,
        faults: me.faults ?? 0, thinks: me.thinks ?? 0,
        orders: me.orders ?? 0,
        /* `uses` и `hits` — словари по имени умения; нас интересует сумма. */
        uses: sum(me.uses), hits: sum(me.hits),
        damageDealt: me.damageDealt ?? 0,
        fuelSpent: fuel?.spent ?? 0, fuelExhausted: !!fuel?.exhausted,
      });
    } catch (e) {
      return { ok: false, stage: 'probe', problems: [{ code: e.code || 'probe', message: e.message }], probe };
    }
  }

  /* Мозг, который падает на каждой мысли, компилируется и «выглядит
     исправным» — и приезжает нулём урона и стопроцентными поражениями.
     Замерено: DeepSeek/горилла, `Math.random` в детерминированном бою. */
  const faulty = probe.filter((r) => r.thinks > 0 && r.faults / r.thinks > 0.25);
  if (faulty.length) {
    return { ok: false, stage: 'probe', probe, problems: [{
      code: 'faults',
      message: `мозг падает на ${Math.round((faulty[0].faults / faulty[0].thinks) * 100)}% мыслей`,
    }] };
  }
  const starved = probe.filter((r) => r.fuelExhausted);
  if (starved.length) {
    return { ok: false, stage: 'probe', probe, problems: [{
      code: 'fuel',
      message: 'мозг исчерпал бюджет шагов внутри одной мысли — вероятен неограниченный цикл',
    }] };
  }
  /*
   * ПЯТАЯ СТЕНА: МОЗГ ОБЯЗАН ЧТО-ТО ДЕЛАТЬ.
   *
   * Четыре предыдущие проверяют, что он не сбежит, не зациклится, не упадёт и
   * не съест топливо. Ни одна не спрашивает, ИГРАЕТ ли он. Мозг, который
   * стоит на месте, проходит их все: он не падает, не зацикливается, никуда
   * не лезет — он просто ничего не делает.
   *
   * Замерено на трёх существах, собранных продуктовым путём и заселённых в
   * библиотеку: **ноль побед из 1754 боёв**, и в контрольном прогоне ноль
   * попаданий за четыре боя при 4–10 применениях умений. Те же наборы в руках
   * эталонного мозга дают около двадцати попаданий за четыре боя — то есть
   * наборы рабочие, а мозги нет.
   *
   * Видно это было и снаружи: 14% последних боёв кончались двойным КО БЕЗ
   * ЕДИНОГО ПОПАДАНИЯ — две фигуры ходят пятьдесят секунд и умирают от арены.
   * Показательный бой — первое, что видит человек.
   *
   * Порог — НОЛЬ, а не какой-то процент. Ставить планку по урону значило бы
   * решать за игрока, какая тактика достаточно хороша; ноль попаданий за оба
   * пробных боя — это не тактика, это неработающая программа.
   */
  const acted = probe.some((r) => r.orders > 0);
  if (!acted) {
    return { ok: false, stage: 'probe', probe, problems: [{
      code: 'idle',
      message: 'мозг не отдал ни одной команды за оба пробных боя — существо стояло бы на месте',
    }] };
  }
  /*
   * «Ни разу не попал» — отказ ТОЛЬКО если мозг стрелял.
   *
   * Первая версия отвергала за ноль попаданий безусловно, и выборка эталонов
   * это сразу поймала: `kit-stub`, отданный в пробу БЕЗ набора из грамматики,
   * не применяет ничего — он читает свои умения из перцепции, а их там нет.
   * Мозг исправен, конфигурация пробы неполна, и отвергать за это значит
   * наказывать за чужую ошибку.
   *
   * Различие простое и точное:
   *   применений НОЛЬ  — мозг не пробовал; это про пробу, а не про него;
   *   применений ЕСТЬ, попаданий ноль — мозг стреляет и не попадает НИ РАЗУ
   *     за два боя. Это не тактика, это неработающий прицел.
   *
   * Три существа из библиотеки, давшие ноль побед из 1754 боёв, попадают
   * ровно во второй случай: 4–10 применений, ноль попаданий.
   */
  const fired = probe.reduce((a, r) => a + r.uses, 0);
  const connected = probe.some((r) => r.hits > 0 || r.damageDealt > 0);

  /*
   * Набор ВЫДАН, а мозг им не воспользовался ни разу — это тоже отказ.
   *
   * Правило «стрелял и не попал» щели не закрывает: `БРОНЕКРАБ` за четыре боя
   * применил умения пять раз, и на паре сидов это ноль — то есть он проходил
   * проверку, ни разу не попытавшись атаковать. Существо с собранным набором,
   * которое за четыре боя не применило НИЧЕГО, не играет.
   *
   * Условие на выданный набор обязательно: `kit-stub` без набора не применяет
   * ничего законно — он читает умения из перцепции, а их там нет. Это про
   * пробу, а не про мозг.
   */
  if (kit && fired === 0) {
    return { ok: false, stage: 'probe', probe, problems: [{
      code: 'never_uses',
      message: 'мозгу выдан набор, и он не применил из него ни одного умения за все пробные бои',
    }] };
  }

  if (fired > 0 && !connected) {
    return { ok: false, stage: 'probe', probe, problems: [{
      code: 'never_hits',
      message: `мозг применил умения ${fired} раз и ни разу не попал за оба пробных боя`,
    }] };
  }

  return { ok: true, stage: 'probe', problems: [], probe };
}

export { OUT_OF_FUEL };
