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
import { FIGHTERS } from '../src/core/config.js';
import { runMatch } from '../src/core/match.js';
import { compileKit } from '../src/skills/compile.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * СИММЕТРИЧНАЯ АРЕНА — только для замера, никогда для игры.
 *
 * Тела в игре разные нарочно: у гориллы 205 здоровья и 5.35 скорости против
 * 155 и 4.22, и config.js объясняет на трёх страницах, почему именно так.
 * Но для замера НАБОРА это шум, и шум подавляющий: с одинаковым набором и
 * одинаковым мозгом горилла выигрывает 16 из 16. Значит, разница наборов
 * видна только там, где она перевешивает разницу тел, — а она почти нигде её
 * не перевешивает, и все атомы схлопываются в 0% и 100%. Ровно это и вышло
 * на двух первых прогонах.
 *
 * Поэтому на время замера обе стороны получают одно тело и один мозг.
 * Тогда единственное различие между бойцами — третье умение, и винрейт
 * говорит про него.
 *
 * Это мутация конфига в ПРОЦЕССЕ ВОРКЕРА и нигде больше: сервер, CI и
 * `tools/checkframing.mjs` этот файл не импортируют. Включается только по
 * флагу в задаче, и в шапке отчёта написано, что арена была симметричной, —
 * цифра, снятая на подменённом теле, обязана об этом говорить сама.
 */
const REAL_GORILLA = { ...FIGHTERS.gorilla };
const symmetrise = (on) => {
  Object.assign(FIGHTERS.gorilla, on
    ? { hp: FIGHTERS.octopus.hp, radius: FIGHTERS.octopus.radius, maxSpeed: FIGHTERS.octopus.maxSpeed,
      accel: FIGHTERS.octopus.accel, turnRate: FIGHTERS.octopus.turnRate, mass: FIGHTERS.octopus.mass,
      jumpHeight: FIGHTERS.octopus.jumpHeight }
    : REAL_GORILLA);
};

const OCT_SRC = readFileSync(join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8');
const brains = {
  octopus: compileBrain(OCT_SRC, 'octopus'),
  gorilla: compileBrain(readFileSync(join(ROOT, 'brains/kit-stub/gorilla.js'), 'utf8'), 'gorilla'),
};
/* Симметричная арена требует и одного пилота: два разных мозга — снова две
   переменные вместо одной. */
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
      symmetrise(!!m.job.sym);
      use.octopus.reset?.(); use.gorilla.reset?.();
      winner = runMatch(use, {
        seed: m.job.seed,
        kits: { octopus: a, gorilla: b },
        /* Размер — часть входа матча (см. `statsFor`): лига размеров задаёт
           его так же, как лига атомов задаёт наборы. */
        ...(m.job.sizes ? { sizes: m.job.sizes } : {}),
      }).result.winner;
    } catch { winner = 'error'; }
  }
  parentPort.postMessage({ i: m.i, winner });
});
