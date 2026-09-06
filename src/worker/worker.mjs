#!/usr/bin/env node
/**
 * airena-worker — lends Airena your Claude Code subscription. One task at a
 * time, for as long as this window is open; close the window and you lend
 * nothing.
 *
 * ── WHAT LEAVES YOUR MACHINE ──────────────────────────────────────────────
 *
 * The result only: the model's answer, its usage counters, the name of the
 * model that answered, how long it took and the reference cost the CLI itself
 * prints.
 *
 * ── WHAT NEVER LEAVES ─────────────────────────────────────────────────────
 *
 * Your Anthropic credentials. The worker does not read `~/.claude`, does not
 * open the keychain, knows no Anthropic secret and physically cannot pass one
 * on: the single thing it can do is start the `claude` binary you already
 * signed into yourself and read its stdout. There is exactly one such place —
 * `spawn` in `runClaude` below — and only the text of the task goes into it.
 *
 * The model is started with `--tools ''`, `--strict-mcp-config`,
 * `--disable-slash-commands` and `--setting-sources ''`: it has no tools, does
 * not read your files, runs no commands and does not see your settings. That
 * is not politeness towards you but a requirement on the server: a generation
 * must not depend on whose machine it ran on.
 *
 * The worker writes one file to disk — `~/.airena-worker.json`, holding the
 * server address and the WORKER's key (not Anthropic's), mode 0600. The key is
 * revoked on the Airena site in one click, and the file can be deleted by hand
 * at any moment.
 *
 * ── RUNNING IT ────────────────────────────────────────────────────────────
 *
 *   node worker.mjs            ordinary work
 *   node worker.mjs --pair     link to an account again
 *   node worker.mjs --once     one task, then exit (for a check)
 *   node worker.mjs --help
 *
 * No dependencies: Node 18+ and its built-in modules.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const DEFAULT_SERVER = 'https://airena.genex.technology';
const CONFIG_PATH = path.join(os.homedir(), '.airena-worker.json');

/*
 * The environment the child `claude` does NOT inherit.
 *
 * Measured, and it cost an evening: `claude` started from under another
 * `claude` inherits the parent's socket and hangs without printing a byte —
 * no stdout, no stderr, not even under --debug. From outside that is
 * indistinguishable from a slow model. The same list lives in
 * `src/brain/claude.js`; it is repeated here because this file is handed over
 * as one piece and has no right to import anything.
 */
const STRIPPED = [
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
  'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_AGENT_SDK_VERSION',
];

// ── arguments ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const flagValue = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`airena-worker — lends Airena your Claude Code subscription.

  node worker.mjs                 work: wait for tasks and run them
  node worker.mjs --pair          link to an Airena account again
  node worker.mjs --once          run one task and exit
  node worker.mjs --server <url>  another server (default ${DEFAULT_SERVER})
  node worker.mjs --help          this help

Environment:
  AIRENA_SERVER       server address
  AIRENA_CLAUDE_BIN   path to the claude binary, if it is not in the usual place

Only the model's answer and its usage counters leave this machine. The worker
neither reads nor sends your Anthropic credentials — it only starts the claude
you signed into. Stop it with Ctrl+C.`);
  process.exit(0);
}

const ONCE = hasFlag('--once');
const FORCE_PAIR = hasFlag('--pair');

// ── config ──────────────────────────────────────────────────────────────────

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return null; }
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
  /* `mode` in writeFileSync applies only when the file is CREATED: linking
     again over an old config would leave 0644 and a key the whole machine
     could read. */
  fs.chmodSync(CONFIG_PATH, 0o600);
}

const cfg = readConfig();
/* The flag beats the environment, the environment beats what was saved:
   otherwise a one-off `--server` aimed at a test server would silently go to
   the live one. */
const SERVER = String(flagValue('--server') || process.env.AIRENA_SERVER || cfg?.server || DEFAULT_SERVER)
  .replace(/\/+$/, '');

// ── HTTP ────────────────────────────────────────────────────────────────────

/** The key is dead — the one error after which carrying on is pointless. */
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

// ── status printing ─────────────────────────────────────────────────────────

const TTY = Boolean(process.stdout.isTTY);
let lastLen = 0;

/** A line the next one overwrites. In a log (not a TTY) it simply is not there. */
function transient(line) {
  if (!TTY) return;
  process.stdout.write(`\r${line.padEnd(lastLen)}`);
  lastLen = line.length;
}

/** A line that stays in the history. */
function commit(line) {
  if (TTY) { process.stdout.write(`\r${line.padEnd(lastLen)}\n`); lastLen = 0; }
  else console.log(line);
}

const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};


/**
 * A short caption for the task, for the screen.
 *
 * The server does not send a creature's name — it is born inside the model's
 * answer. The first 40 characters of the request are the only thing that
 * exists before the generation, and they are here purely so the person at the
 * laptop sees work rather than a freeze. Sent nowhere.
 */
function label(prompt) {
  const flat = String(prompt || '').replace(/\s+/g, ' ').trim();
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : (flat || 'task');
}

// ── linking ─────────────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function pair() {
  console.log(`
airena-worker is not linked to an account yet.

  1. open ${SERVER}/worker in the browser where you are already signed into Airena
  2. it shows a 6-character code
  3. type it in here
`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = await ask('code: ');
    /* The code is read off a screen and typed by hand: spaces and a dash
       between the groups are normal, not a mistake, and rejecting them is
       arguing with the person. */
    const code = String(raw).toUpperCase().replace(/[\s-]+/g, '');
    if (!code) { console.log('empty — try again'); continue; }
    let res;
    try {
      res = await api('/api/worker/pair/claim', {
        method: 'POST',
        body: { code, hostname: os.hostname() },
      });
    } catch (e) {
      console.log(`the server is unreachable: ${String(e.message || e).slice(0, 120)}`);
      continue;
    }
    if (res.status === 404) {
      console.log(`that code did not work${attempt < 3 ? ' — a code does not live long, refresh the page and take a new one' : ''}`);
      continue;
    }
    if (!res.ok) { console.log(`the server answered ${res.status}`); continue; }
    const data = await res.json();
    const name = data?.account?.name || 'account';
    /* The account name is stored next to the key not for the server but for
       the header line: without it every start would begin with an extra trip
       to the server just to print whose subscription this machine lends. */
    writeConfig({ server: SERVER, token: data.token, account: name });
    console.log(`✓ linked as ${name}\n`);
    return { token: data.token, account: name };
  }
  console.log('three tries is all. Run it again once you have a fresh code.');
  process.exit(1);
}

// ── starting claude ─────────────────────────────────────────────────────────

/**
 * Where the binary is.
 *
 * It may not be on PATH: under nvm a non-interactive login shell is not
 * initialised, and three installed copies become unreachable. So: the explicit
 * setting first, then the usual install location, and only then PATH.
 */
const CLAUDE_BIN = process.env.AIRENA_CLAUDE_BIN
  || (fs.existsSync(path.join(os.homedir(), '.local/bin/claude'))
    ? path.join(os.homedir(), '.local/bin/claude')
    : 'claude');

const NO_CLAUDE = 'the claude binary was not found. Install Claude Code and sign in: '
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
 * Which model ANSWERED.
 *
 * `modelUsage` is a MAP, and its first key is not the answer: the CLI also
 * records its own background traffic there (summaries, titles), pointed at a
 * small model. `Object.keys(...)[0]` once credited haiku with all 83 creatures
 * Opus had actually written, and the reporting started contradicting itself.
 * The decision goes to the family that matches the one asked for, and failing
 * that to cost: an answer is three orders of magnitude dearer than the
 * housekeeping chatter, so it is not a close call.
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
 * One generation. Never throws: it returns either the answer or one of the
 * three refusal codes the server understands — `wall` (did not finish in
 * time), `no_key` (nothing to run it with), `http` (everything else).
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
    /* Arguments as an array and no shell: the task text comes from the server,
       and through a shell string it would be a command rather than text. */
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
    /* The client holds the wall: the server is waiting for a result and cannot
       tell "the model is thinking" from "the process hung", and a hung CLI
       does not take SIGTERM. */
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      done({ ok: false, code: 'wall', message: `did not finish within ${Math.round(timeoutMs / 1000)} s`, durationMs: Date.now() - t0 });
    }, timeoutMs);

    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('error', (e) => done(e.code === 'ENOENT'
      ? { ok: false, code: 'no_key', message: NO_CLAUDE, durationMs: Date.now() - t0 }
      : { ok: false, code: 'http', message: String(e.message || e).slice(0, 300), durationMs: Date.now() - t0 }));
    proc.on('close', (code) => {
      const durationMs = Date.now() - t0;
      if (!out.trim()) {
        done({ ok: false, code: 'http', message: `claude printed nothing (exit ${code}): ${err.slice(0, 200)}`, durationMs });
        return;
      }
      let env;
      try { env = JSON.parse(out); } catch {
        done({ ok: false, code: 'http', message: "claude's answer did not parse as JSON", durationMs });
        return;
      }
      /*
       * `is_error` is the only reliable sign of a refusal. A revoked sign-in
       * arrives as `"subtype":"success"` with `"stop_reason":"stop_sequence"`,
       * and reading `stop_reason` would turn a dead session into "the model
       * wrote nothing". The order is `is_error`, then `api_error_status`, and
       * `stop_reason` never.
       */
      if (env.is_error === true) {
        const status = typeof env.api_error_status === 'number' ? env.api_error_status : 0;
        done({ ok: false, code: 'http', message: `claude error ${status}: ${String(env.result).slice(0, 200)}`, durationMs });
        return;
      }
      const text = typeof env.result === 'string' ? env.result : '';
      if (!text.trim()) {
        done({ ok: false, code: 'http', message: 'claude returned an empty answer — the local session may have expired: run claude and sign in', durationMs });
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

// ── shutting down ───────────────────────────────────────────────────────────

let ticker = null;
let shuttingDown = false;

async function shutdown(token, exitCode) {
  /* A second Ctrl+C means "now", not "say goodbye again". */
  if (shuttingDown) process.exit(exitCode);
  shuttingDown = true;
  if (ticker) clearInterval(ticker);
  if (child) { try { child.kill('SIGKILL'); } catch { /* already dead */ } }
  process.stdout.write('\n');
  if (token) {
    /* Three seconds and no more: the server notices a missing worker by
       timeout anyway, and waiting on the network at Ctrl+C is a sure way to
       look hung. */
    try { await api('/api/worker/bye', { method: 'POST', token, timeoutMs: 3000 }); } catch { /* never mind */ }
  }
  console.log('worker stopped');
  process.exit(exitCode);
}

// ── main loop ───────────────────────────────────────────────────────────────

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
    commit(`✓ done · ${mmss(Date.now() - t0)}`);
  } else {
    /* no_key is not a failed request but a broken installation: the server
       takes the refusal and moves to another worker, while the person at the
       laptop has to be told out loud and in full, not by a clipped tail. */
    const tail = r.code === 'no_key' ? '' : ` · ${r.message.slice(0, 100)}`;
    commit(`✗ failed · ${r.code} · ${mmss(Date.now() - t0)}${tail}`);
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
  /* The report takes longer to come back than a poll does: the server is
     keeping a player waiting for exactly this answer, and losing it to a short
     timeout means throwing the whole generation away. */
  await api('/api/worker/result', { method: 'POST', body, token, timeoutMs: 60_000 });
}

async function main() {
  let token = cfg?.token || null;
  let account = cfg?.account || null;
  if (!token || FORCE_PAIR) ({ token, account } = await pair());

  process.on('SIGINT', () => { shutdown(token, 0); });
  process.on('SIGTERM', () => { shutdown(token, 0); });

  const host = (() => { try { return new URL(SERVER).host; } catch { return SERVER; } })();
  console.log(`airena-worker${account ? ` · linked as ${account}` : ''} · server ${host}`);

  let backoff = 1000;
  let waiting = false;

  while (!shuttingDown) {
    try {
      if (!waiting) { transient('waiting for a task…'); if (!TTY) commit('waiting for a task…'); waiting = true; }
      /*
       * 40 seconds against the 25 the server holds the connection for. If the
       * client timeout is the shorter one, EVERY empty poll looks like a
       * dropped network, the worker backs off and stops taking tasks at all.
       */
      const res = await api('/api/worker/next', { token, timeoutMs: 40_000 });
      backoff = 1000;
      if (res.status === 204) continue;      // no tasks — ask again
      if (!res.ok) throw new Error(`the server answered ${res.status}`);
      const job = await res.json();
      waiting = false;
      await handle(job, token);
      if (ONCE) return shutdown(token, 0);
    } catch (e) {
      if (e instanceof DeadToken) {
        commit('this worker is no longer linked to your account. Run it with --pair to link it again.');
        process.exit(1);
      }
      if (shuttingDown) return;
      /*
       * The network drops, the laptop sleeps, the server is restarted — and
       * none of that is a reason to kill a worker somebody started and walked
       * away from. The backoff grows so a server that is down gets no squall,
       * and stops at 30 seconds so one that comes back gets its worker back
       * quickly.
       */
      commit(`… no connection (${String(e.message || e).slice(0, 80)}), retrying in ${Math.round(backoff / 1000)} s`);
      waiting = false;
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
    }
  }
}

main().catch((e) => {
  process.stdout.write('\n');
  console.error(`worker crashed: ${String(e?.stack || e)}`);
  process.exit(1);
});
