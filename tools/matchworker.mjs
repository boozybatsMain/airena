/**
 * Воркер пула: собирает набор, гоняет бой, отдаёт победителя.
 *
 * Мозги компилируются один раз на воркер и сбрасываются перед каждым боем
 * (`reset`) — ровно так же, как это делает изолят на проде. Если не
 * сбрасывать, состояние прошлого боя течёт в следующий и замер перестаёт
 * зависеть только от сида.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parentPort } from 'node:worker_threads';

import { compileBrain } from '../src/brain/host.js';
import { runMatch } from '../src/core/match.js';
import { compileKit } from '../src/skills/compile.js';

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
const OCT_SRC = readFileSync(join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8');
const brains = {
  octopus: compileBrain(OCT_SRC, 'octopus'),
  gorilla: compileBrain(readFileSync(join(ROOT, 'brains/kit-stub/gorilla.js'), 'utf8'), 'gorilla'),
};
/* Один пилот на обе стороны — вторая половина `sym`, см. шапку выше. */
const twin = { octopus: brains.octopus, gorilla: compileBrain(OCT_SRC, 'gorilla') };

const cache = new Map();
/**
 * @param {object[]} kit
 * @param {boolean} real ПРОДУКТОВЫЕ условия: кулдаун считается из цены умения,
 *   как у игрока, а не фиксируется. Нужно там, где замеряется не сила атома, а
 *   поле, в котором игрок реально играет, — см. `tools/gauntletfield.mjs`.
 */
const defsOf = (kit, real = false) => {
  const key = `${real ? 'R' : 'F'}${JSON.stringify(kit)}`;
  if (!cache.has(key)) {
    /* `size: null` — набор из одного или двух умений: лига сравнивает
       «набор с этим атомом» с «набором без него», и запрет на два умения
       вместо трёх здесь мешал бы мерить, а не защищал. Бюджет и запрет
       дублей при этом действуют. */
    /*
     * КУЛДАУН ФИКСИРОВАН НА ВРЕМЯ ЗАМЕРА — иначе прибор мерит сам себя.
     *
     * Кулдаун умения считается из его цены. Лига атомов ставит третьим
     * умением ровно испытуемый атом, значит без фиксации она мерит «силу,
     * делённую на цену»: подняли цену по замеру — упала измеренная сила —
     * следующий замер требует опустить обратно. Ровно это и случилось с
     * таблицей в реестре: после правки цен она перестала воспроизводиться.
     *
     * 8 секунд — кулдаун умения средней цены при текущих константах. Число
     * не важно, важно, что оно ОДНО для всех участников лиги: сравниваются
     * атомы, а не расписания.
     */
    const c = real ? compileKit(kit) : compileKit(kit, { size: null, fixedCooldown: 8 });
    cache.set(key, c.problems.length ? null : c.defs);
  }
  return cache.get(key);
};

parentPort.on('message', (m) => {
  /* `stop` больше не приходит: родитель завершает воркер сам (`terminate`).
     Ветка оставлена на случай старого вызова и НЕ закрывает порт изнутри —
     именно это закрытие и роняло процесс. */
  if (m.stop) return;
  const a = defsOf(m.job.a, !!m.job.real); const b = defsOf(m.job.b, !!m.job.real);
  let winner = 'error';
  if (a && b) {
    try {
      const use = m.job.sym ? twin : brains;
      use.octopus.reset?.(); use.gorilla.reset?.();
      winner = runMatch(use, {
        seed: m.job.seed,
        kits: { octopus: a, gorilla: b },
        /* Телосложение — часть ВХОДА матча (см. `statsOf`), наравне с сидом и
           наборами: лига телосложений задаёт его так же, как лига атомов
           задаёт наборы. Не передали — обе стороны выходят в `DEFAULT_BUILD`,
           и тела равны. */
        ...(m.job.builds ? { builds: m.job.builds } : {}),
      }).result.winner;
    } catch { winner = 'error'; }
  }
  parentPort.postMessage({ i: m.i, winner });
});
