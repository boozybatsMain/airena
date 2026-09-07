/**
 * Пул процессов для массовых замеров боя.
 *
 * Зачем. Один бой в симуляции идёт около двух секунд, и это нормально: 1800
 * тиков, два мозга, снаряды и зоны. Но замер баланса — это не один бой, а
 * турнир: четырнадцать атомов друг против друга зеркально — уже больше
 * тысячи боёв, то есть больше получаса в один поток. За полчаса на цикл
 * баланс не правят, его бросают. Поэтому бои раскладываются по воркерам.
 *
 * Детерминизм не страдает: у каждого боя свой сид, воркер не делит с
 * другими ни состояния, ни времени, результат зависит только от (набор,
 * набор, сид). Порядок ответов восстанавливается по индексу задачи, а не по
 * порядку прихода, — иначе параллелизм протёк бы в цифры.
 */

import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const POOL_SIZE = Number(process.env.POOL_SIZE)
  || Math.max(1, Math.min(10, availableParallelism() - 2));

/**
 * @param {Array<{a: object[], b: object[], seed: number}>} jobs
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<Array<'blue'|'orange'|null|'error'>>}
 */
/*
 * ПУЛ ОДИН НА ПРОЦЕСС, а не по одному на вызов.
 *
 * Раньше каждый `runJobs` поднимал свои восемь воркеров и убивал их в конце.
 * На одном вызове это работало; на втором и третьем подряд node падал с
 * SIGSEGV — молча, без стека, унося весь прогон. Замерено: лига пресетов
 * (один вызов) шла чисто шесть раз из шести, лига атомов (проверка прибора
 * плюс сама лига — два вызова) падала.
 *
 * Возни с диагностикой это не стоит: воркеры одинаковые, работа у них
 * одинаковая, и поднимать их заново на каждую лигу незачем. Один пул на
 * процесс убирает и падение, и лишнюю секунду на старте каждой лиги.
 *
 * Пул держит событийный цикл, пока жив, поэтому вызывающий обязан закрыть его
 * (`closePool`) — иначе процесс не завершится. `unref` тут был бы хуже: он
 * позволяет ноде выйти посреди недосчитанной лиги, и вместо ответа получаешь
 * пустой вывод и нулевой код.
 */
let pool = null;
let restarts = 0;
const MAX_RESTARTS = 40;

/**
 * Every task's `done` receives the worker's WHOLE reply (see the shape in
 * `runJobsFull`), and a bout the pool itself had to give up on gets a reply of
 * the same shape — so the two entry points differ only in what they keep.
 */
const errorResult = (why) => ({ winner: 'error', seconds: null, reason: 'pool', error: why, blue: null, orange: null });

/** Воркер умер: его бой — ошибка, сам он выбывает, на замену встаёт новый. */
function lost(w, why) {
  if (w.__dead) return;
  w.__dead = true;
  const done = w.__job;
  w.__job = null;
  if (!pool) return;
  pool.workers = pool.workers.filter((x) => x !== w);
  pool.idle = pool.idle.filter((x) => x !== w);
  if (process.env.POOL_DEBUG) console.error(`\n  воркер выбыл (${why}), занят: ${w.__label || 'нет'}`);
  if (done) {
    console.error(`\n  воркер умер (${why}) на бою ${w.__label || '?'} — бой засчитан ошибкой`);
    done(errorResult(`worker lost: ${why}`));
  }
  const want = pool.want;
  if (restarts < MAX_RESTARTS && pool.queue.length) { restarts++; ensurePool(want); }
  else if (!pool.workers.length && pool.queue.length) {
    console.error('  все воркеры мертвы, добить очередь нечем');
    for (const t of pool.queue.splice(0)) t.done(errorResult('no workers left'));
  }
  pump();
}

function ensurePool(want) {
  if (!pool) pool = { workers: [], idle: [], queue: [], want };
  pool.want = Math.max(pool.want, want);
  if (pool.workers.length >= want) return pool;
  while (pool.workers.length < want) {
    const w = new Worker(join(ROOT, 'tools/matchworker.mjs'), { argv: [], execArgv: [] });
    w.on('message', (m) => {
      const done = w.__job;
      w.__job = null;
      if (done) done(m);
      pool.idle.push(w);
      pump();
    });
    w.on('error', (e) => { lost(w, `ошибка: ${e?.message || e}`); });
    /*
     * СМЕРТЬ ВОРКЕРА — СОБЫТИЕ, А НЕ ТИШИНА.
     *
     * Без этого обработчика прогон выглядел так: лига доходит до 75 боёв из
     * 1260 и процесс завершается кодом 0, напечатав только шапку. Никакой
     * ошибки, никакой таблицы — и легко принять пустой вывод за «замер не
     * нашёл разницы». На деле воркеры умирали один за другим, а пул этого не
     * видел; когда умер последний, держать событийный цикл стало нечему, и
     * нода честно вышла с нулём.
     *
     * Теперь смерть воркера видна, бой, на котором он умер, помечается
     * ошибкой (повторять его нельзя — он убьёт и следующего), а на его место
     * поднимается новый. Лимит перезапусков не даёт зациклиться.
     */
    w.on('exit', (code) => lost(w, `выход с кодом ${code}`));
    pool.workers.push(w);
    pool.idle.push(w);
  }
  return pool;
}

function pump() {
  if (!pool) return;
  while (pool.queue.length && pool.idle.length) {
    const w = pool.idle.pop();
    const task = pool.queue.shift();
    w.__job = task.done;
    w.postMessage({ i: 0, job: task.job });
  }
}

/**
 * @param {Array<{a: object[], b: object[], seed: number, sym?: boolean}>} jobs
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<Array<'blue'|'orange'|null|'error'>>}
 */
/**
 * Надзиратель над собственным процессом: перезапуск при смерти от СИГНАЛА.
 *
 * Пул воркеров изредка уносит весь процесс SIGSEGV — без стека, без
 * исключения, посреди работы. Замерено: тот же движок в одном потоке проходит
 * тысячу боёв чисто, в восьми воркерах падает примерно на одном прогоне из
 * двух. Причина в worker_threads этой сборки ноды, а не в правилах боя.
 *
 * Опасность не в падении, а в том, КАК оно выглядит: прогон печатает шапку и
 * молча заканчивается, и это неотличимо от «прибор ничего не нашёл».
 *
 * Перезапуск — ТОЛЬКО на сигнал. Обычный ненулевой код пробрасывается как
 * есть: гейт обязан оставаться гейтом. Каждая следующая попытка берёт вдвое
 * меньше воркеров, последняя считает в один — медленно, зато это разница
 * между «замер есть» и «замера нет».
 *
 * Живёт здесь, а не в каждом инструменте: копия этого кода уже была в
 * `kitbalance.mjs`, и `sizebalance.mjs` без неё падал тем же способом.
 *
 * @param {string} envFlag имя переменной-метки, чтобы дочерний процесс не
 *   надзирал сам за собой
 * @returns {boolean} true — это дочерний процесс, продолжай считать
 */
export function superviseSelf(envFlag = 'AIRENA_POOL_CHILD') {
  if (process.env[envFlag]) return true;
  const MAX = 4;
  const sizes = [null, 4, 2, 1];
  for (let attempt = 1; attempt <= MAX; attempt++) {
    const size = sizes[attempt - 1];
    if (size) console.error(`  повтор на ${size} воркер(ах) — медленнее, зато без падения\n`);
    const r = spawnSync(process.execPath, process.argv.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, [envFlag]: '1', ...(size ? { POOL_SIZE: String(size) } : {}) },
    });
    if (!r.signal && r.status === 0) process.exit(0);
    if (!r.signal) process.exit(r.status ?? 1);
    console.error(`\n  прогон убит сигналом ${r.signal} (баг worker_threads,`
      + ` не логика замера) — попытка ${attempt} из ${MAX}\n`);
  }
  console.error('  замер не удалось довести до конца за четыре попытки.\n');
  process.exit(3);
  return false;
}

/**
 * Run every job and resolve to the workers' full replies, in job order.
 *
 * A job is `{ a, b, seed }` plus any of:
 *   sym      one pilot on both sides (the stub twin) instead of octopus/gorilla
 *   real     the product path: the legal kit size is enforced (cooldowns come
 *            from the registry with or without it)
 *   cooldown number → fixed cooldown (seconds) for every ability of BOTH kits;
 *            null (or absent) → the registry's own cooldown, i.e. the schedule
 *            the game is actually played on
 *   pilots   { blue: name, orange: name } — 'stub' or a file under brains/pilots/
 *   builds   { blue, orange } body numbers (see tools/sizebalance.mjs)
 *
 * A reply is
 *   { winner: 'blue'|'orange'|null|'error', seconds, reason,
 *     pace: { decided: 'hit'|'fire'|'arena'|<sim reason>, dodges, deadSlots, slots },
 *     blue: { uses, hits, misses, damageDealt, faults }, orange: {…},
 *     pilots?: { blue, orange } (the pilots actually used),
 *     pilot_missing?: string[], problems?: [{ code, name, error? }], error?: string }
 *
 * `runJobs` (below) is the older contract and keeps only `winner`; the tools
 * built on it are untouched. New instruments read the whole reply here.
 *
 * @param {Array<object>} jobs
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<Array<object>>}
 */
export function runJobsFull(jobs, onProgress) {
  if (!jobs.length) return Promise.resolve([]);
  ensurePool(Math.min(POOL_SIZE, jobs.length));
  const out = new Array(jobs.length);
  let done = 0;
  return new Promise((res) => {
    jobs.forEach((job, i) => {
      pool.queue.push({
        job,
        label: `сид ${job.seed}`,
        done: (result) => {
          out[i] = result;
          done++;
          if (onProgress && done % 25 === 0) onProgress(done, jobs.length);
          if (done === jobs.length) res(out);
        },
      });
    });
    pump();
  });
}

/**
 * @param {Array<{a: object[], b: object[], seed: number, sym?: boolean}>} jobs
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<Array<'blue'|'orange'|null|'error'>>}
 */
export function runJobs(jobs, onProgress) {
  return runJobsFull(jobs, onProgress).then((rs) => rs.map((r) => (r && 'winner' in r ? r.winner : 'error')));
}

/** Закрыть пул. Нужен только тому, кто хочет завершиться немедленно. */
export function closePool() {
  if (!pool) return;
  for (const w of pool.workers) w.terminate();
  pool = null;
}


