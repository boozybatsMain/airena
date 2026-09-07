/**
 * Воркер пула: собирает набор, гоняет бой, отдаёт победителя.
 *
 * Мозги компилируются один раз на воркер и сбрасываются перед каждым боем
 * (`reset`) — ровно так же, как это делает изолят на проде. Если не
 * сбрасывать, состояние прошлого боя течёт в следующий и замер перестаёт
 * зависеть только от сида.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parentPort } from 'node:worker_threads';

import { compileBrain } from '../src/brain/host.js';
import { runMatch } from '../src/core/match.js';
import { compileKit } from '../src/skills/compile.js';
import { KIT_SIZE } from '../src/skills/registry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * СИММЕТРИЧНАЯ АРЕНА — только для замера, никогда для игры.
 *
 * Замеряя НАБОР, надо убрать всё остальное. Пока стороны различались телом,
 * разница наборов была видна только там, где она перевешивала разницу тел, —
 * а она почти нигде её не перевешивала, и все атомы схлопывались в 0% и 100%.
 * Ровно это и вышло на двух первых прогонах: с одинаковым набором и одинаковым
 * мозгом одна сторона выигрывала 16 из 16.
 *
 * ── ТЕЛА БОЛЬШЕ НЕ ПОДМЕНЯЮТСЯ: ПОДМЕНЯТЬ НЕЧЕГО ──────────────────────────
 *
 * Здесь стояла мутация `FIGHTERS.gorilla` — тело гориллы на время замера
 * переписывалось телом осьминога, поле за полем. Двух записей архетипов
 * больше нет: тело принадлежит существу, а матч без `builds` выдаёт ОБЕИМ
 * сторонам `DEFAULT_BUILD`. То есть симметрия тел теперь не достигается, а
 * выполняется по построению, и мутировать конфиг в процессе воркера незачем.
 *
 * От флага `sym` осталась ровно вторая половина — ОДИН ПИЛОТ на обе стороны
 * (`twin` ниже): два разных мозга это снова две переменные вместо одной.
 *
 * Кому нужны РАЗНЫЕ тела (лига телосложений, `tools/sizebalance.mjs`), тот
 * кладёт их в задачу полем `builds` — так же, как кладёт наборы и сид.
 */
/* `brains/kit-stub/octopus.js` и `.../gorilla.js` — ФАЙЛЫ эталонных пилотов,
   их имена свои и к сторонам отношения не имеют. Стороны арены — цвета. */
const BLUE_SRC = readFileSync(join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8');
const brains = {
  blue: compileBrain(BLUE_SRC, 'blue'),
  orange: compileBrain(readFileSync(join(ROOT, 'brains/kit-stub/gorilla.js'), 'utf8'), 'orange'),
};
/* Один пилот на обе стороны — вторая половина `sym`, см. шапку выше. */
const twin = { blue: brains.blue, orange: compileBrain(BLUE_SRC, 'orange') };

/*
 * PILOT PANEL — a job may name the brain for each side (`pilots: { blue, orange }`).
 *
 * The balance instruments started with ONE pilot, the kit-stub, and every
 * number they produced was a number about that pilot: an ability the stub
 * never plans around (a wall, a pull into a zone) reads as worthless. The
 * regression instrument (`tools/atombalance.mjs`) therefore plays the same
 * league under several hand-written pilots and asks whether they agree.
 *
 * Names: `stub` is `brains/kit-stub/octopus.js` (today's default); any other
 * name is `brains/pilots/<name>.js`. Sources are read once per worker and
 * compiled once per (name, side) — a brain is bound to its side at compile
 * time, and compiling costs a vm context. A name whose file does not exist
 * falls back to the stub and is reported as `pilot_missing`, so a run started
 * before a pilot lands still completes and the report says which rows are
 * really stub rows. A file that fails to compile is treated the same way and
 * reported as `pilot_broken` with the message.
 */
const STUB = 'stub';
const pilotSources = new Map();
const pilotBrains = new Map();
function pilotSource(name) {
  if (!pilotSources.has(name)) {
    let src = null, problem = null;
    if (name === STUB) src = BLUE_SRC;
    else {
      const file = join(ROOT, 'brains/pilots', `${name}.js`);
      if (/^[\w.-]+$/.test(name) && existsSync(file)) src = readFileSync(file, 'utf8');
      else problem = 'pilot_missing';
    }
    pilotSources.set(name, { src, problem });
  }
  return pilotSources.get(name);
}
/** @returns {{ brain: object, used: string, problem: null|{code: string, name: string, error?: string} }} */
function pilotBrain(name, side) {
  const key = `${name}\u0000${side}`;
  if (!pilotBrains.has(key)) {
    const { src, problem } = pilotSource(name);
    let out;
    /* The stub is already compiled for both sides (`twin`): reuse, do not
       spend a second vm context on the same source. */
    if (name === STUB) out = { brain: twin[side], used: STUB, problem: null };
    else if (src === null) {
      out = { brain: pilotBrain(STUB, side).brain, used: STUB, problem: { code: problem, name } };
    } else {
      try {
        out = { brain: compileBrain(src, side), used: name, problem: null };
      } catch (err) {
        out = {
          brain: twin[side],
          used: STUB,
          problem: { code: 'pilot_broken', name, error: String(err?.message || err) },
        };
      }
    }
    pilotBrains.set(key, out);
  }
  return pilotBrains.get(key);
}

const cache = new Map();
/**
 * @param {object[]} kit
 * @param {boolean} real ПРОДУКТОВЫЕ условия: набор обязан быть законного
 *   размера, как у игрока. Кулдаун теперь и без этого флага берётся из
 *   реестра — расписание, по которому в игру реально играют, — так что `real`
 *   отвечает ровно за размер набора. См. `tools/gauntletfield.mjs`.
 */
const defsOf = (kit, real = false, cooldown = undefined) => {
  const key = `${real ? 'R' : 'F'}${cooldown === undefined ? '' : `@${cooldown}`}${JSON.stringify(kit)}`;
  if (!cache.has(key)) {
    /* `size: null` — набор из одного или двух умений: лига сравнивает
       «набор с этим атомом» с «набором без него», и запрет на два умения
       вместо трёх здесь мешал бы мерить, а не защищал. Бюджет и запрет
       дублей при этом действуют. */
    /*
     * `cooldown` (job field, optional) overrides the schedule for BOTH kits:
     * a number is a fixed cooldown in seconds for every ability, `null` is the
     * registry's own cooldown. ABSENT MEANS THE SAME AS null — the registry.
     *
     * It used to mean 8 s on the measuring path, and that made the listed body
     * gate (`tools/sizebalance.mjs`) report on a world nobody plays: every
     * ability at 8 s instead of the registry's 2.0–3.0 s, four pilots planning
     * around that cadence. A measurement whose default differs from the game
     * is a measurement of the instrument. The registry is the default now; a
     * league that really wants one schedule for everybody says so with a
     * number, and says it in the job.
     *
     * The product path additionally enforces the kit size; the measuring path
     * keeps `size: null` (see above).
     */
    const fixed = cooldown === undefined ? null : cooldown;
    const c = compileKit(kit, { size: real ? KIT_SIZE : null, fixedCooldown: fixed });
    cache.set(key, c.problems.length ? null : c.defs);
  }
  return cache.get(key);
};

/** Per-skill maps (`uses`, `hits`, `misses`) folded into one number each. */
const total = (m) => Object.values(m || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const sideOf = (x) => ({
  uses: total(x.uses), hits: total(x.hits), misses: total(x.misses),
  damageDealt: Math.round((x.damageDealt || 0) * 100) / 100, faults: x.faults || 0,
});

/**
 * POPULATION HEALTH — a handful of integers per match, so an instrument can
 * say WHAT WORLD it measured in and not only who won.
 *
 * A price found in fights the arena finished is a price for stalling, and a
 * price found on kits whose third slot never fired is a price for two slots.
 * The pricing pass prints these at the top of every report; they cost one
 * pass over the log and about ten numbers on the wire.
 *
 *   decided   what actually took the last hit point: 'hit' (an opponent),
 *             'fire' (an ability's burn), 'arena' (the sudden-death burn),
 *             or the sim's own reason when nobody died ('timeout', …).
 *             The sim logs every death as `kill`; the loser's `death` line is
 *             matched against a `burned` / `burnedOut` line on the same tick
 *             (0.05 s), the same rule `reports/combat/spectate.mjs` uses.
 *   dodges    `evade` lines (i-frames swallowed a hit) + `miss:airborne`
 *             (a ground shape passed under a body in its air phase).
 *   deadSlots slots that never fired once, over slots that could have. Only
 *             PAID slots are counted; the filter for a free universal slot is
 *             kept as a guard, and today no such slot exists (D160/D195).
 *
 * @param {object} r `summarise()` result — needs `.log`, `.reason`, `.winner`
 * @param {object|null} defsBlue compiled kit of the blue side, `{ name: def }`
 * @param {object|null} defsOrange the same for orange
 */
function paceOf(r, defsBlue, defsOrange) {
  const deathAt = { blue: null, orange: null };
  const burnedAt = { blue: null, orange: null };
  const fireAt = { blue: null, orange: null };
  let dodges = 0;
  for (const ev of r.log || []) {
    switch (ev.type) {
      case 'death': deathAt[ev.who] = ev.t; break;
      case 'burned': burnedAt[ev.who] = ev.t; break;
      case 'burnedOut': fireAt[ev.who] = ev.t; break;
      case 'evade': dodges++; break;
      case 'miss': if (ev.reason === 'airborne') dodges++; break;
      default: break;
    }
  }
  const causeOf = (side) => {
    const d = deathAt[side];
    if (d === null) return 'hit';
    if (burnedAt[side] !== null && Math.abs(burnedAt[side] - d) < 0.05) return 'arena';
    if (fireAt[side] !== null && Math.abs(fireAt[side] - d) < 0.05) return 'fire';
    return 'hit';
  };
  let decided;
  if (r.reason === 'kill') decided = causeOf(r.winner === 'blue' ? 'orange' : 'blue');
  else if (r.reason === 'double-ko') decided = causeOf('blue') === causeOf('orange') ? causeOf('blue') : 'mixed';
  else decided = r.reason || 'unknown';

  /* Paid slots only — see the note above. No free slot exists today. */
  const slotsOf = (defs) => (defs ? Object.entries(defs).filter(([, d]) => d && d.universal !== true).map(([n]) => n) : []);
  let dead = 0, slots = 0;
  for (const [side, defs] of [['blue', defsBlue], ['orange', defsOrange]]) {
    const used = r[side]?.uses || {};
    for (const n of slotsOf(defs)) { slots++; if (!used[n]) dead++; }
  }
  return { decided, dodges, deadSlots: dead, slots };
}

parentPort.on('message', (m) => {
  /* `stop` больше не приходит: родитель завершает воркер сам (`terminate`).
     Ветка оставлена на случай старого вызова и НЕ закрывает порт изнутри —
     именно это закрытие и роняло процесс. */
  if (m.stop) return;
  const job = m.job;
  const cd = 'cooldown' in job ? (job.cooldown === null ? null : Number(job.cooldown)) : undefined;
  const a = defsOf(job.a, !!job.real, cd); const b = defsOf(job.b, !!job.real, cd);
  /*
   * The reply is compact on purpose: the pool relays thousands of these and
   * `runJobs` keeps only `winner`. `runJobsFull` keeps the whole object, which
   * is enough for a balance instrument (points, length, ending, activity,
   * faults) and small enough that a 6 000-match league stays in memory.
   */
  const out = { i: m.i, winner: 'error', seconds: null, reason: null, blue: null, orange: null };
  if (!a || !b) out.reason = 'kit_rejected';
  else {
    try {
      let use;
      if (job.pilots) {
        const pb = pilotBrain(String(job.pilots.blue ?? STUB), 'blue');
        const po = pilotBrain(String(job.pilots.orange ?? STUB), 'orange');
        use = { blue: pb.brain, orange: po.brain };
        out.pilots = { blue: pb.used, orange: po.used };
        const problems = [pb.problem, po.problem].filter(Boolean);
        if (problems.length) out.problems = problems;
        if (problems.some((p) => p.code === 'pilot_missing')) out.pilot_missing = problems.filter((p) => p.code === 'pilot_missing').map((p) => p.name);
      } else {
        use = job.sym ? twin : brains;
      }
      use.blue.reset?.(); use.orange.reset?.();
      const r = runMatch(use, {
        seed: job.seed,
        kits: { blue: a, orange: b },
        /* Телосложение — часть ВХОДА матча (см. `statsOf`), наравне с сидом и
           наборами: лига телосложений задаёт его так же, как лига атомов
           задаёт наборы. Не передали — обе стороны выходят в `DEFAULT_BUILD`,
           и тела равны. */
        ...(job.builds ? { builds: job.builds } : {}),
      }).result;
      out.winner = r.winner;
      out.seconds = r.seconds;
      out.reason = r.reason ?? null;
      out.pace = paceOf(r, a, b);
      out.blue = sideOf(r.blue);
      out.orange = sideOf(r.orange);
    } catch (err) {
      out.winner = 'error';
      out.reason = 'exception';
      out.error = String(err?.message || err);
    }
  }
  parentPort.postMessage(out);
});
