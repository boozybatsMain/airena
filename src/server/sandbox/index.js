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
export function runIsolated(brains, { seed = 1, seeds = null, kits = null, builds = null, referenceTag = null, record = false, curtainSeconds = 0, timeoutMs = MATCH_TIMEOUT_MS } = {}) {
  const prepared = {};
  for (const [slot, src] of Object.entries(brains)) {
    prepared[slot] = instrument(src).code;
  }

  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER, {
      /* `builds` едет наравне с `kits` и `seed`: это вход матча, от него
         зависят здоровье, радиус, скорость и масса. Забыть его — значит
         показать бой, которого не было. */
      /* `referenceTag` едет по той же причине, что `kits` и `builds`: боец без
         кита дерётся набором, который выбрал ЕГО МОЗГ, а не цвет стороны. */
      workerData: { seed, seeds, brains: prepared, kits, builds, referenceTag, record, curtainSeconds },
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
 * Возвращает { ok, problems, probe, behaviour, warnings } — `probe` это
 * четыре пробных боя против спарринг-партнёра на ОДНОМ И ТОМ ЖЕ ките (D191
 * §1), тот же смысл, что у `src/brain/validate.js`, но за стеной. `behaviour`
 * несёт измеренные числа (wins, damageShare, idleInReach, still, casts) вне
 * зависимости от исхода — `tools/bakeoff.mjs` и `tools/rethink.mjs` шлют их
 * назад модели одним ремонтным ходом до отказа (D191 §2). `warnings` — гейт
 * D191 §5, литералы кита в сравнениях мозга: он никогда не роняет `ok`.
 */
export async function admit(source, slot, { sparring, kit = null, seeds = [11, 22, 33, 44] } = {}) {
  const stat = analyse(source, { kit });
  if (!stat.ok) return { ok: false, stage: 'analyse', problems: stat.problems, warnings: stat.warnings || [] };

  let ins;
  try { ins = instrument(source); }
  catch (e) { return { ok: false, stage: 'instrument', problems: [{ code: 'instrument', message: e.message }] }; }
  if (ins.points === 0) {
    return { ok: false, stage: 'instrument', problems: [{ code: 'no_fuel_points', message: 'некуда вставить учёт топлива — мозг не содержит ни функции, ни цикла' }] };
  }

  if (!sparring) return { ok: true, stage: 'analyse', problems: [], probe: null, warnings: stat.warnings || [] };

  /* Вторая сторона — просто «не эта». Сторон две, они равноправны, и никаких
     чисел за именем не стоит: важно лишь посадить спарринг напротив. */
  const other = slot === 'blue' ? 'orange' : 'blue';
  const probe = [];
  for (const seed of seeds) {
    try {
      const m = await runIsolated({ [slot]: source, [other]: sparring },
        {
          seed,
          /*
           * СПАРРИНГ ДЕРЁТСЯ ТЕМ ЖЕ КИТОМ, ЧТО И КАНДИДАТ (D191 §1).
           *
           * До этой строки кит уезжал только кандидату (`{ [slot]: kit }`):
           * противоположная сторона оставалась на захардкоженной фикстуре
           * (`smash`/`charge`/`jump`), то есть «спарринг на том же ките» было
           * неправдой — сравнивались мозг с реальным набором и мозг с чужим,
           * не имеющим отношения к делу. Тот же кит на обеих сторонах — это и
           * есть требование «на ОДНОМ И ТОМ ЖЕ ките»; сам спарринг-партнёр
           * обязан при этом читать умения из перцепции (`brains/kit-stub/`),
           * а не звать их по именам фикстуры — см. правку в
           * `src/server/forge/pipeline.js`, `tools/bakeoff.mjs`,
           * `tools/rethink.mjs`, которые выбирают файл спарринга.
           */
          kits: kit ? { [slot]: kit, [other]: kit } : null,
        });
      const fuel = m.fuel?.[slot];
      const me = m.result[slot] || {};
      const stub = m.result[other] || {};
      const sum = (o) => (o && typeof o === 'object' ? Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0) : Number(o) || 0);
      probe.push({
        seed, winner: m.result.winner, seconds: m.result.seconds,
        faults: me.faults ?? 0, thinks: me.thinks ?? 0,
        orders: me.orders ?? 0,
        /* `uses` и `hits` — словари по имени умения; нас интересует сумма. */
        uses: sum(me.uses), hits: sum(me.hits),
        damageDealt: me.damageDealt ?? 0,
        /* Урон СПАРРИНГА — для «damage ≥ 40% чужого» (D191 §1). */
        stubDamageDealt: stub.damageDealt ?? 0,
        /* `behavior` — из воркера (`worker.js`): живые тики, и из них те, где
           нет активного действия и готовое умение уже достаёт до врага
           (`reachOf`, копия из `reports/combat/spectate.mjs`), и те, где тело
           буквально стоит. Пусто, если воркер их не считал (кит не выдан). */
        aliveTicks: me.behavior?.aliveTicks ?? 0,
        idleInReachTicks: me.behavior?.idleInReachTicks ?? 0,
        stillTicks: me.behavior?.stillTicks ?? 0,
        fuelSpent: fuel?.spent ?? 0, fuelExhausted: !!fuel?.exhausted,
      });
    } catch (e) {
      return { ok: false, stage: 'probe', problems: [{ code: e.code || 'probe', message: e.message }], probe, warnings: stat.warnings || [] };
    }
  }

  /* Мозг, который падает на каждой мысли, компилируется и «выглядит
     исправным» — и приезжает нулём урона и стопроцентными поражениями.
     Замерено: DeepSeek/горилла, `Math.random` в детерминированном бою. */
  const faulty = probe.filter((r) => r.thinks > 0 && r.faults / r.thinks > 0.25);
  if (faulty.length) {
    return { ok: false, stage: 'probe', probe, warnings: stat.warnings || [], problems: [{
      code: 'faults',
      message: `мозг падает на ${Math.round((faulty[0].faults / faulty[0].thinks) * 100)}% мыслей`,
    }] };
  }
  const starved = probe.filter((r) => r.fuelExhausted);
  if (starved.length) {
    return { ok: false, stage: 'probe', probe, warnings: stat.warnings || [], problems: [{
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
    return { ok: false, stage: 'probe', probe, warnings: stat.warnings || [], problems: [{
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
    return { ok: false, stage: 'probe', probe, warnings: stat.warnings || [], problems: [{
      code: 'never_uses',
      message: 'мозгу выдан набор, и он не применил из него ни одного умения за все пробные бои',
    }] };
  }

  if (fired > 0 && !connected) {
    return { ok: false, stage: 'probe', probe, warnings: stat.warnings || [], problems: [{
      code: 'never_hits',
      message: `мозг применил умения ${fired} раз и ни разу не попал за оба пробных боя`,
    }] };
  }

  /*
   * ШЕСТАЯ СТЕНА: ПОБЕДА, ПРИСУТСТВИЕ, ДВИЖЕНИЕ (D191 §1).
   *
   * `review-r1-minds.md`, «Admission passes minds that lose every fight»:
   * шесть допущенных мозгов дают 0% против спарринга на своём же ките, и
   * стены выше это пропускают — они спрашивают только «стрелял ли» и «попал
   * ли хоть раз», а не «играл ли достаточно, чтобы вообще иметь шанс».
   * Дальше — то же самое, числом, по всем четырём пробным боям сразу:
   *
   *   wins / damageShare  хоть одна победа из четырёх, или урон не меньше
   *                       40% урона спарринга — мозг, который ни разу не
   *                       выигрывает и почти не наносит урона, не играет;
   *   idleInReach         доля живых тиков, где действие не идёт и ГОТОВОЕ
   *                       умение уже достаёт до врага (`reachOf`, та же
   *                       арифметика, что в карточке кита) — мозг с оружием
   *                       в руках, который просто не стреляет;
   *   still               доля живых тиков буквально стоя (< 0.3 м/с) без
   *                       активного действия — та же метрика, что у
   *                       `reports/combat/spectate.mjs` `stillNoAct`;
   *   casts               применений умений в среднем за бой — мозг,
   *                       который жмёт кнопку раз в двадцать секунд, не
   *                       ведёт бой, даже если формально не бездействует.
   *
   * Пороги — 40% и 3 каста — не подбирались под конкретный мозг: это ровно
   * числа, которые просил ревью, и именно они уходят в ремонтный ход
   * (`tools/bakeoff.mjs`, `tools/rethink.mjs`, D191 §2) до отказа.
   *
   * ГЕЙТ СЧИТАЕТСЯ, ТОЛЬКО КОГДА ПРОБЕ ВЫДАН КИТ — тот же принцип, что у
   * `never_uses` выше. Без кита спарринг (`kit-stub`) сам не применяет
   * ничего: он читает умения из перцепции, а их там нет, — и это про пробу,
   * а не про мозг. `casts`/`wins`/`damageShare` в этом случае измеряют
   * неполную конфигурацию, а не существо, а `checkisolate.mjs` держит на
   * этом пути собственный контрольный мозг без кита.
   */
  const aliveTicks = probe.reduce((a, r) => a + r.aliveTicks, 0);
  const idleInReachTicks = probe.reduce((a, r) => a + r.idleInReachTicks, 0);
  const stillTicks = probe.reduce((a, r) => a + r.stillTicks, 0);
  const totalDamage = probe.reduce((a, r) => a + r.damageDealt, 0);
  const totalStubDamage = probe.reduce((a, r) => a + r.stubDamageDealt, 0);
  const wins = probe.filter((r) => r.winner === slot).length;
  const idleInReach = aliveTicks ? idleInReachTicks / aliveTicks : 0;
  const still = aliveTicks ? stillTicks / aliveTicks : 0;
  /* Урон спарринга — ноль лишь когда сам спарринг неисправен или бой кончился
     мгновенно; в этом случае любой урон кандидата уже ≥ 40% от нуля. */
  const damageShare = totalStubDamage > 0 ? totalDamage / totalStubDamage : (totalDamage > 0 ? Infinity : 0);
  const casts = probe.length ? fired / probe.length : 0;
  const pct = (x) => `${Math.round(Math.min(x, 9.99) * 100)}%`;
  const behaviour = {
    wins, damageShare: Number.isFinite(damageShare) ? Math.round(damageShare * 1000) / 1000 : damageShare,
    idleInReach: Math.round(idleInReach * 1000) / 1000,
    still: Math.round(still * 1000) / 1000,
    casts: Math.round(casts * 100) / 100,
  };

  const failed = [];
  if (kit) {
    if (wins < 1 && damageShare < 0.4) {
      failed.push(`проиграл все ${probe.length} из ${probe.length} боёв спаррингу на своём же ките и нанёс лишь ${pct(damageShare)} от его урона`);
    }
    if (idleInReach > 0.4) failed.push(`простоял с готовым умением в досягаемости врага ${pct(idleInReach)} живого времени`);
    if (still > 0.4) failed.push(`простоял на месте (< 0.3 м/с, без действия) ${pct(still)} живого времени`);
    if (casts < 3) failed.push(`применял умения в среднем ${casts.toFixed(1)} раза за бой`);
  }

  if (failed.length) {
    return { ok: false, stage: 'probe', probe, behaviour, warnings: stat.warnings || [], problems: [{
      code: 'behaviour',
      message: `мозг ${failed.join('; ')}`,
    }] };
  }

  return { ok: true, stage: 'probe', problems: [], probe, behaviour, warnings: stat.warnings || [] };
}

export { OUT_OF_FUEL };
