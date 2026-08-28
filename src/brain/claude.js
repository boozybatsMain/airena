/**
 * `claude -p` as a subprocess: the lane that actually writes the minds.
 *
 * ── the measured sharp edges ────────────────────────────────────────────────
 *
 *  - **`is_error` is the only trustworthy failure signal.** A revoked token
 *    comes back as `"subtype":"success"` with `"stop_reason":"stop_sequence"`.
 *    Reading `stop_reason` the way the HTTP wire does would turn a dead
 *    credential into a valid empty completion, and an empty completion here
 *    would look like "the model wrote nothing useful" rather than "nobody
 *    asked the model anything". So: `is_error` first, `api_error_status`
 *    second, `stop_reason` never.
 *
 *  - **The binary is not on PATH.** Measured on this machine: three installs,
 *    none reachable from a non-interactive login shell, because nvm does not
 *    initialise there. The path is configuration and it is absolute; a missing
 *    binary is a loud throw rather than a quiet empty answer.
 *
 *  - **A `claude` spawned from inside another Claude Code session inherits the
 *    parent's socket and hangs before printing a byte** — no stdout, no stderr,
 *    not even under --debug. Indistinguishable from a slow model from the
 *    outside. So the child gets a scrubbed environment.
 *
 *  - **Tools, skills, MCP and settings are all switched off.** Every one of
 *    them is a way for this machine's local configuration to change what a
 *    brain looks like, which would make a generation depend on who ran it.
 *
 *  - **`modelUsage` is a MAP and its first key is not the answer.** It is keyed
 *    by every model the CLI billed during the call, and the CLI bills its own
 *    background traffic — the conversation summariser, the title generator —
 *    against a small model. Taking `Object.keys(...)[0]` recorded
 *    `claude-haiku-4-5-20251001` for all 83 brains Opus actually wrote, which
 *    made the repository's own audit trail contradict its headline claim. The
 *    entry that generated the answer is the expensive one; `resolveModel`
 *    below picks it, and the whole map is persisted beside it so the choice can
 *    be re-litigated from the record instead of re-run.
 */

import { spawn } from 'node:child_process';

const STRIPPED = [
  'ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
  'CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'CLAUDE_AGENT_SDK_VERSION',
];

export const CLAUDE_BIN = process.env.AIRENA_CLAUDE_BIN
  || `${process.env.HOME}/.local/bin/claude`;

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

/**
 * The three families the `--model` aliases resolve to, from either an alias
 * (`opus`) or a full id (`claude-opus-4-5-20251101`). Null when neither
 * appears, which is itself worth recording rather than papering over.
 */
export function modelFamily(name) {
  const s = String(name || '').toLowerCase();
  for (const f of ['opus', 'sonnet', 'haiku']) if (s.includes(f)) return f;
  return null;
}

/**
 * Which entry of `modelUsage` actually produced the answer.
 *
 * Two signals, in order. `canonicalModel` (or the key, for older CLIs that omit
 * it) matching the family that was ASKED for is decisive — it is the only
 * signal that distinguishes "opus answered" from "opus was requested". Failing
 * that, the biggest `costUSD` wins: the generation is a long high-effort turn
 * and the CLI's own housekeeping is a few hundred tokens, so the gap is three
 * orders of magnitude and not a close call.
 *
 * @returns {{ model: string|null, by: string }} `by` records which signal was
 *   used, because a record that cannot say how it knows is not provenance.
 */
export function resolveModel(modelUsage, requested) {
  const entries = Object.entries(modelUsage || {});
  if (entries.length === 0) return { model: null, by: 'none' };
  const want = modelFamily(requested);
  if (want) {
    const hit = entries.filter(([key, u]) => modelFamily(u?.canonicalModel || key) === want);
    if (hit.length === 1) return { model: hit[0][1]?.canonicalModel || hit[0][0], by: 'family' };
    if (hit.length > 1) {
      hit.sort((a, b) => (b[1]?.costUSD || 0) - (a[1]?.costUSD || 0));
      return { model: hit[0][1]?.canonicalModel || hit[0][0], by: 'family+cost' };
    }
  }
  const sorted = entries.slice().sort((a, b) => (b[1]?.costUSD || 0) - (a[1]?.costUSD || 0));
  return { model: sorted[0][1]?.canonicalModel || sorted[0][0], by: 'cost' };
}

/**
 * One generation.
 *
 * @returns {Promise<{ text, costUsd, durationMs, model, modelResolvedBy,
 *   modelUsage, usage }>}
 */
export function askClaude({
  prompt,
  system,
  model = 'opus',
  effort = 'high',
  timeoutMs = 900_000,
  bin = CLAUDE_BIN,
  log = () => {},
}) {
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

  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv() });
    let out = '', err = '', settled = false;
    const done = (fn) => { if (settled) return; settled = true; clearTimeout(timer); fn(); };
    const timer = setTimeout(() => done(() => {
      child.kill('SIGKILL');
      reject(new Error(`claude exceeded ${timeoutMs} ms`));
    }), timeoutMs);

    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => done(() => reject(e)));
    child.on('close', (code) => done(() => {
      if (out.trim().length === 0) {
        reject(new Error(`claude produced no output (exit ${code}): ${err.slice(0, 400)}`));
        return;
      }
      let env;
      try { env = JSON.parse(out); } catch { reject(new Error('claude output was not JSON')); return; }
      if (env.is_error === true) {
        const status = typeof env.api_error_status === 'number' ? env.api_error_status : 0;
        reject(new Error(`claude error ${status}: ${String(env.result).slice(0, 300)}`));
        return;
      }
      const cost = typeof env.total_cost_usd === 'number' ? env.total_cost_usd : 0;
      const picked = resolveModel(env.modelUsage, model);
      log(`  ${model}/${effort}: ${((Date.now() - t0) / 1000).toFixed(1)}s, $${cost.toFixed(4)}`);
      resolve({
        text: typeof env.result === 'string' ? env.result : '',
        costUsd: cost,
        durationMs: Date.now() - t0,
        model: picked.model,
        modelResolvedBy: picked.by,
        // The whole map, not just the winner: a caller that disagrees with the
        // pick can re-derive it, and a caller that finds two families in here
        // learns something the single string cannot say.
        modelUsage: env.modelUsage || null,
        usage: env.usage || null,
      });
    }));
  });
}
