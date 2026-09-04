#!/usr/bin/env node
/**
 * airena-worker — одалживает Airena вашу подписку Claude Code. По одному
 * заданию за раз, пока окно открыто; закрыли окно — одолжили ноль.
 *
 * ── ЧТО УХОДИТ С ВАШЕЙ МАШИНЫ ─────────────────────────────────────────────
 *
 * Только результат: текст ответа модели, число токенов, имя ответившей
 * модели, длительность и справочная цена, которую печатает сам CLI.
 *
 * ── ЧТО НЕ УХОДИТ НИКОГДА ─────────────────────────────────────────────────
 *
 * Ваши учётные данные Anthropic. Воркер не читает `~/.claude`, не открывает
 * keychain, не знает ни одного токена Anthropic и физически не может его
 * передать: единственное, что он умеет, — запустить бинарник `claude`, в
 * который вы уже вошли сами, и прочитать его stdout. Место ровно одно —
 * `spawn` в `runClaude` ниже, и туда уходит только текст задания.
 *
 * Модель запускается с `--tools ''`, `--strict-mcp-config`,
 * `--disable-slash-commands` и `--setting-sources ''`: у неё нет инструментов,
 * она не читает ваши файлы, не выполняет команд и не видит ваших настроек. Это
 * не вежливость к вам, а требование к серверу: генерация не должна зависеть от
 * того, на чьей машине она выполнилась.
 *
 * На диск воркер пишет один файл — `~/.airena-worker.json` с адресом сервера и
 * токеном ВОРКЕРА (не Anthropic), права 0600. Токен отзывается на сайте Airena
 * в один клик, файл можно удалить руками в любой момент.
 *
 * ── ЗАПУСК ────────────────────────────────────────────────────────────────
 *
 *   node worker.mjs            обычная работа
 *   node worker.mjs --pair     привязаться заново
 *   node worker.mjs --once     одно задание и выход (для проверки)
 *   node worker.mjs --help
 *
 * Зависимостей нет: только Node 18+ и его встроенные модули.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const DEFAULT_SERVER = 'https://airena.genex.technology';
const CONFIG_PATH = path.join(os.homedir(), '.airena-worker.json');

/*
 * Среда, которую НЕ наследует дочерний `claude`.
 *
 * Измерено и стоило вечера: `claude`, запущенный из-под другого `claude`,
 * наследует сокет родителя и виснет, не напечатав ни байта — ни stdout, ни
 * stderr, даже под --debug. Снаружи это неотличимо от медленной модели. Тот же
 * список живёт в `src/brain/claude.js`; здесь он повторён, потому что этот файл
 * коллеге отдаётся одним куском и не имеет права ничего импортировать.
 */
const STRIPPED = [
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
  'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_AGENT_SDK_VERSION',
];

// ── аргументы ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const flagValue = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`airena-worker — одалживает Airena вашу подписку Claude Code.

  node worker.mjs                 работать: ждать задания и выполнять их
  node worker.mjs --pair          привязаться к аккаунту Airena заново
  node worker.mjs --once          выполнить одно задание и выйти
  node worker.mjs --server <url>  другой сервер (по умолчанию ${DEFAULT_SERVER})
  node worker.mjs --help          эта справка

Переменные среды:
  AIRENA_SERVER       адрес сервера
  AIRENA_CLAUDE_BIN   путь к бинарнику claude, если он лежит не там, где обычно

С машины уходит только ответ модели и счётчик токенов. Учётные данные Anthropic
воркер не читает и не передаёт — он лишь запускает claude, в который вы вошли.
Остановка — Ctrl+C.`);
  process.exit(0);
}

const ONCE = hasFlag('--once');
const FORCE_PAIR = hasFlag('--pair');

// ── конфиг ──────────────────────────────────────────────────────────────────

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return null; }
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
  /* `mode` в writeFileSync действует только при СОЗДАНИИ файла: перепривязка
     поверх старого конфига оставила бы 0644 и токен, читаемый всей машиной. */
  fs.chmodSync(CONFIG_PATH, 0o600);
}

const cfg = readConfig();
/* Флаг сильнее среды, среда сильнее сохранённого: иначе `--server` на разовый
   запуск против тестового сервера молча уходил бы на боевой. */
const SERVER = String(flagValue('--server') || process.env.AIRENA_SERVER || cfg?.server || DEFAULT_SERVER)
  .replace(/\/+$/, '');

// ── HTTP ────────────────────────────────────────────────────────────────────

/** Токен протух — единственная ошибка, после которой продолжать бессмысленно. */
class DeadToken extends Error {}

async function api(route, { method = 'GET', body = null, token = null, timeoutMs = 15_000 } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(SERVER + route, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 401) throw new DeadToken('401');
  return res;
}

// ── печать статуса ──────────────────────────────────────────────────────────

const TTY = Boolean(process.stdout.isTTY);
let lastLen = 0;

/** Строка, которую перепишут следующей. В логе (не TTY) её просто нет. */
function transient(line) {
  if (!TTY) return;
  process.stdout.write(`\r${line.padEnd(lastLen)}`);
  lastLen = line.length;
}

/** Строка, которая остаётся в истории. */
function commit(line) {
  if (TTY) { process.stdout.write(`\r${line.padEnd(lastLen)}\n`); lastLen = 0; }
  else console.log(line);
}

const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const tokens = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/**
 * Короткая подпись задания для экрана.
 *
 * Сервер не присылает названия существа — оно рождается уже внутри ответа
 * модели. Первые 40 символов запроса — единственное, что есть до генерации, и
 * они нужны исключительно чтобы человек за ноутбуком видел, что идёт работа, а
 * не зависание. Никуда не отправляется.
 */
function label(prompt) {
  const flat = String(prompt || '').replace(/\s+/g, ' ').trim();
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : (flat || 'задание');
}

// ── привязка ────────────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function pair() {
  console.log(`
airena-worker ещё не привязан к аккаунту.

  1. откройте ${SERVER}/worker в браузере, где вы уже вошли в Airena
  2. там показан код из 6 символов
  3. введите его сюда
`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = await ask('код: ');
    /* Код читают с экрана и набирают руками: пробелы и дефис между группами —
       норма, а не ошибка ввода, и отвергать их значит спорить с человеком. */
    const code = String(raw).toUpperCase().replace(/[\s-]+/g, '');
    if (!code) { console.log('пусто — попробуйте ещё раз'); continue; }
    let res;
    try {
      res = await api('/api/worker/pair/claim', {
        method: 'POST',
        body: { code, hostname: os.hostname() },
      });
    } catch (e) {
      console.log(`сервер недоступен: ${String(e.message || e).slice(0, 120)}`);
      continue;
    }
    if (res.status === 404) {
      console.log(`код не подошёл${attempt < 3 ? ' — код живёт недолго, обновите страницу и возьмите новый' : ''}`);
      continue;
    }
    if (!res.ok) { console.log(`сервер ответил ${res.status}`); continue; }
    const data = await res.json();
    const name = data?.account?.name || 'аккаунт';
    /* Имя аккаунта хранится вместе с токеном не для сервера, а для шапки: без
       него каждый запуск начинался бы с лишнего похода на сервер только чтобы
       напечатать, чью подписку одалживает эта машина. */
    writeConfig({ server: SERVER, token: data.token, account: name });
    console.log(`✓ привязан как ${name}\n`);
    return { token: data.token, account: name };
  }
  console.log('три попытки — и всё. Запустите ещё раз, когда возьмёте свежий код.');
  process.exit(1);
}

// ── запуск claude ───────────────────────────────────────────────────────────

/**
 * Где лежит бинарник.
 *
 * На PATH его может не быть: под nvm неинтерактивный логин-шелл не
 * инициализируется, и три установленных копии оказываются недостижимы. Поэтому
 * сначала явная настройка, потом обычное место установки, и лишь потом PATH.
 */
const CLAUDE_BIN = process.env.AIRENA_CLAUDE_BIN
  || (fs.existsSync(path.join(os.homedir(), '.local/bin/claude'))
    ? path.join(os.homedir(), '.local/bin/claude')
    : 'claude');

const NO_CLAUDE = 'бинарник claude не найден. Установите Claude Code и войдите в него: '
  + 'npm i -g @anthropic-ai/claude-code && claude';

function childEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k.startsWith('CLAUDE_CODE_')) continue;
    if (STRIPPED.includes(k)) continue;
    env[k] = v;
  }
  return env;
}

const modelFamily = (name) => {
  const s = String(name || '').toLowerCase();
  for (const f of ['opus', 'sonnet', 'haiku', 'fable']) if (s.includes(f)) return f;
  return null;
};

/**
 * Какая модель ОТВЕТИЛА.
 *
 * `modelUsage` — это КАРТА, и первый её ключ не ответ: CLI записывает туда и
 * свой фоновый трафик (сводки, заголовки), выставленный на маленькую модель.
 * Взятый оттуда `Object.keys(...)[0]` однажды приписал haiku все 83 существа,
 * которые на самом деле писал Opus, — и отчётность начала противоречить сама
 * себе. Решает совпадение семьи с заказанной, а если её нет — цена: ответ стоит
 * на три порядка дороже служебной болтовни, это не близкий случай.
 */
function resolveModel(modelUsage, requested) {
  const entries = Object.entries(modelUsage || {});
  if (entries.length === 0) return null;
  const want = modelFamily(requested);
  const pick = (list) => list.slice().sort((a, b) => (b[1]?.costUSD || 0) - (a[1]?.costUSD || 0))[0];
  if (want) {
    const hit = entries.filter(([key, u]) => modelFamily(u?.canonicalModel || key) === want);
    if (hit.length) { const [k, u] = pick(hit); return u?.canonicalModel || k; }
  }
  const [k, u] = pick(entries);
  return u?.canonicalModel || k;
}

let child = null;

/**
 * Одна генерация. Не бросает: возвращает либо ответ, либо код отказа из трёх,
 * которые понимает сервер — `wall` (не уложились), `no_key` (нечем считать),
 * `http` (всё остальное).
 */
function runClaude({ prompt, system, model, effort, timeoutMs }) {
  const args = [
    '-p', prompt,
    '--output-format', 'json',
    '--no-session-persistence',
    '--model', model,
    '--effort', effort,
    '--tools', '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--setting-sources', '',
  ];
  if (system) args.push('--system-prompt', system);

  return new Promise((resolve) => {
    const t0 = Date.now();
    /* Аргументы массивом и без shell: текст задания приходит с сервера, и через
       строку шелла он был бы не текстом, а командой. */
    const proc = spawn(CLAUDE_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv() });
    child = proc;
    let out = '', err = '', settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child = null;
      resolve(result);
    };
    /* Стену держит клиент: сервер ждёт результат и не может отличить «модель
       думает» от «процесс завис», а SIGTERM зависший CLI не берёт. */
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      done({ ok: false, code: 'wall', message: `не уложился в ${Math.round(timeoutMs / 1000)} с`, durationMs: Date.now() - t0 });
    }, timeoutMs);

    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', (e) => done(e.code === 'ENOENT'
      ? { ok: false, code: 'no_key', message: NO_CLAUDE, durationMs: Date.now() - t0 }
      : { ok: false, code: 'http', message: String(e.message || e).slice(0, 300), durationMs: Date.now() - t0 }));
    proc.on('close', (code) => {
      const durationMs = Date.now() - t0;
      if (!out.trim()) {
        done({ ok: false, code: 'http', message: `claude ничего не напечатал (выход ${code}): ${err.slice(0, 200)}`, durationMs });
        return;
      }
      let env;
      try { env = JSON.parse(out); } catch {
        done({ ok: false, code: 'http', message: 'ответ claude не разобрался как JSON', durationMs });
        return;
      }
      /*
       * `is_error` — единственный надёжный признак отказа. Отозванный токен
       * приходит как `"subtype":"success"` со `"stop_reason":"stop_sequence"`,
       * и чтение `stop_reason` превратило бы мёртвую сессию в «модель ничего не
       * написала». Порядок: `is_error`, затем `api_error_status`, `stop_reason`
       * — никогда.
       */
      if (env.is_error === true) {
        const status = typeof env.api_error_status === 'number' ? env.api_error_status : 0;
        done({ ok: false, code: 'http', message: `claude ошибка ${status}: ${String(env.result).slice(0, 200)}`, durationMs });
        return;
      }
      const text = typeof env.result === 'string' ? env.result : '';
      if (!text.trim()) {
        done({ ok: false, code: 'http', message: 'claude вернул пустой ответ — возможно, локальная сессия истекла: запустите claude и войдите', durationMs });
        return;
      }
      done({
        ok: true,
        text,
        usage: {
          input_tokens: Number(env.usage?.input_tokens ?? 0),
          output_tokens: Number(env.usage?.output_tokens ?? 0),
        },
        model: resolveModel(env.modelUsage, model),
        costUsd: typeof env.total_cost_usd === 'number' ? env.total_cost_usd : 0,
        durationMs: typeof env.duration_ms === 'number' ? env.duration_ms : durationMs,
      });
    });
  });
}

// ── выключение ──────────────────────────────────────────────────────────────

let ticker = null;
let shuttingDown = false;

async function shutdown(token, exitCode) {
  /* Второй Ctrl+C — это «немедленно», а не «повтори прощание». */
  if (shuttingDown) process.exit(exitCode);
  shuttingDown = true;
  if (ticker) clearInterval(ticker);
  if (child) { try { child.kill('SIGKILL'); } catch { /* уже мёртв */ } }
  process.stdout.write('\n');
  if (token) {
    /* Три секунды и не больше: сервер и сам заметит пропажу воркера по
       таймауту, а ждать сети на Ctrl+C — верный способ выглядеть зависшим. */
    try { await api('/api/worker/bye', { method: 'POST', token, timeoutMs: 3000 }); } catch { /* и ладно */ }
  }
  console.log('воркер выключен');
  process.exit(exitCode);
}

// ── главный цикл ────────────────────────────────────────────────────────────

async function handle(job, token) {
  const t0 = Date.now();
  const head = `▸ «${label(job.prompt)}» · ${job.model}/${job.effort}`;
  if (TTY) {
    transient(`${head} · 0:00`);
    ticker = setInterval(() => transient(`${head} · ${mmss(Date.now() - t0)}`), 1000);
  } else {
    commit(head);
  }

  const r = await runClaude({
    prompt: job.prompt,
    system: job.system,
    model: job.model,
    effort: job.effort,
    timeoutMs: Number(job.timeoutMs) || 900_000,
  });

  if (ticker) { clearInterval(ticker); ticker = null; }
  if (shuttingDown) return;

  if (r.ok) {
    const total = r.usage.input_tokens + r.usage.output_tokens;
    commit(`✓ готово · ${mmss(Date.now() - t0)} · ${tokens(total)} токенов`);
  } else {
    /* no_key — это не сбой запроса, а сломанная установка: сервер получит отказ
       и уйдёт на другого воркера, а человеку за ноутбуком надо сказать вслух и
       целиком, а не обрезком в общей строке. */
    const tail = r.code === 'no_key' ? '' : ` · ${r.message.slice(0, 100)}`;
    commit(`✗ ошибка · ${r.code} · ${mmss(Date.now() - t0)}${tail}`);
    if (r.code === 'no_key') commit(`  ${NO_CLAUDE}`);
  }

  const body = r.ok
    ? {
      requestId: job.requestId,
      ok: true,
      text: r.text,
      usage: r.usage,
      model: r.model,
      costUsd: r.costUsd,
      durationMs: r.durationMs,
    }
    : { requestId: job.requestId, ok: false, code: r.code, message: r.message };
  /* Отчёт возвращается дольше, чем ходят опросы: сервер держит игрока в
     ожидании именно этого ответа, и потерять его на коротком таймауте значит
     потратить впустую всю генерацию. */
  await api('/api/worker/result', { method: 'POST', body, token, timeoutMs: 60_000 });
}

async function main() {
  let token = cfg?.token || null;
  let account = cfg?.account || null;
  if (!token || FORCE_PAIR) ({ token, account } = await pair());

  process.on('SIGINT', () => { shutdown(token, 0); });
  process.on('SIGTERM', () => { shutdown(token, 0); });

  const host = (() => { try { return new URL(SERVER).host; } catch { return SERVER; } })();
  console.log(`airena-worker${account ? ` · подключён как ${account}` : ''} · сервер ${host}`);

  let backoff = 1000;
  let waiting = false;

  while (!shuttingDown) {
    try {
      if (!waiting) { transient('ждёт задания…'); if (!TTY) commit('ждёт задания…'); waiting = true; }
      /*
       * 40 секунд против 25, которые сервер держит соединение. Если клиентский
       * таймаут окажется короче серверного, КАЖДЫЙ пустой опрос выглядит обрывом
       * сети, воркер уходит в откат и перестаёт брать задания вовсе.
       */
      const res = await api('/api/worker/next', { token, timeoutMs: 40_000 });
      backoff = 1000;
      if (res.status === 204) continue;      // заданий нет — спрашиваем снова
      if (!res.ok) throw new Error(`сервер ответил ${res.status}`);
      const job = await res.json();
      waiting = false;
      await handle(job, token);
      if (ONCE) return shutdown(token, 0);
    } catch (e) {
      if (e instanceof DeadToken) {
        commit('токен воркера больше не действует. Запустите с --pair и привяжитесь заново.');
        process.exit(1);
      }
      if (shuttingDown) return;
      /*
       * Сеть падает, ноутбук засыпает, сервер перезапускают — и ничего из этого
       * не повод гасить воркера, который человек запустил и ушёл. Откат растёт,
       * чтобы лежащий сервер не получал шквал, и упирается в 30 секунд, чтобы
       * вернувшийся получил воркера обратно быстро.
       */
      commit(`… связи нет (${String(e.message || e).slice(0, 80)}), повтор через ${Math.round(backoff / 1000)} с`);
      waiting = false;
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
    }
  }
}

main().catch((e) => {
  process.stdout.write('\n');
  console.error(`воркер упал: ${String(e?.stack || e)}`);
  process.exit(1);
});
