/**
 * The Claude Code CLI as a forge lane — a transport, not a provider.
 *
 * ## Why this exists beside `apps/server/src/world/claudeCli.ts`
 *
 * That file is the same trick for the *brain* lane and speaks the **Anthropic
 * Messages** wire. `packages/forge/src/call.ts` speaks the **OpenAI/OpenRouter**
 * wire — a different request shape, a different SSE frame, a different usage
 * block — so a shared implementation would be a shim with two of everything in
 * it. What is shared is the reasoning, and it is worth repeating in one line:
 * `forgeCreature` already funnels every request through one injectable
 * `fetchImpl`, so a lane is a function and nothing above it has to change. The
 * repair ladder, the style audit, the truncation rescue and the record writer
 * all come along unchanged.
 *
 * ## What it buys
 *
 * A forge call on OpenRouter is Opus at $25/M output, and a body takes three
 * attempts. On the logged-in CLI the marginal call costs subscription quota
 * rather than dollars, which is what makes an iterate-until-it-is-right loop
 * over the master prompt affordable at all: the whole point of this file is that
 * the number of attempts stops being a budget decision.
 *
 * ## The three things that would otherwise bite
 *
 *  - **`is_error` is the only trustworthy failure signal.** A 401 comes back as
 *    a *successful* JSON envelope with an error string inside it. Reading
 *    `stop_reason` the way the HTTP wire does turns a revoked token into a valid
 *    empty completion, and an empty completion here means a body silently built
 *    from nothing. Checked first, before anything else is read.
 *  - **A `claude` spawned from inside a Claude Code session inherits the
 *    parent's socket and hangs** before printing a byte. The child gets a
 *    scrubbed environment; the list is the same one `claudeCli.ts` measured.
 *  - **Images cannot ride inline.** The OpenRouter shape carries them as
 *    `data:` URLs in the message content; the CLI reads files. They are written
 *    to a scratch directory and referenced by path, with `Read` allowed and that
 *    directory added — so the model looks at exactly the bytes the HTTP lane
 *    would have sent, and `docs/style-refs/` is never handed to the child as a
 *    writable root.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * What the child is told when the caller said nothing — and it must be told
 * SOMETHING.
 *
 * This cost a whole round to find. `~/.claude/settings.json` on the author's
 * machine carries `"effortLevel": "xhigh"`, and a child left to its own devices
 * reads it. So five bodies were built at xhigh against a 39 kB instruction,
 * every one of them ran past forty minutes of thinking without writing a line of
 * geometry, and all five were killed by the deadline — while
 * `forge/<slug>.json` would have recorded `high`, because that is what
 * `forge.mjs` writes.
 *
 * Two things wrong with that and only one of them is the wall clock. **The
 * record would have been false.** A capture that says `high` and was built at
 * `xhigh` is not comparable with any other capture in `captures/forge/`, and
 * nothing on disk would have said so.
 *
 * Stripping `CLAUDE_CODE_EFFORT_LEVEL` from the environment is not enough,
 * because the setting is *config* rather than environment. The only fix is to
 * pass `--effort` on every call, so this is the value used when the request
 * carries none.
 */
const DEFAULT_EFFORT = 'high';

/** Environment the child must not inherit. See the header. */
const STRIPPED = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDECODE',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'CLAUDE_AGENT_SDK_VERSION',
];

function childEnv() {
  const env = { ...process.env };
  for (const key of STRIPPED) delete env[key];
  for (const key of Object.keys(env)) if (key.startsWith('CLAUDE_CODE_')) delete env[key];
  return env;
}

/**
 * `anthropic/claude-opus-5` -> `opus`.
 *
 * The alias rather than a pinned snapshot, for the reason `claudeCli.ts` gives:
 * this lane cannot promise a specific build, so a record stamped from it should
 * read as the family it actually got.
 */
export function cliModel(id) {
  const bare = String(id).includes('/') ? String(id).slice(String(id).indexOf('/') + 1) : String(id);
  const lower = bare.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('haiku')) return 'haiku';
  if (lower.includes('sonnet')) return 'sonnet';
  return bare;
}

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Flatten the OpenRouter `messages` array into the one prompt string the CLI
 * takes, writing any inline image out to `dir` and naming its path instead.
 *
 * The role labels are kept. A turn's role is information the model uses — the
 * repair turn only makes sense as something said *after* the reply it is about —
 * and collapsing three user turns into one paragraph loses the sequence that
 * `forgeRequestBody` was careful to build.
 */
/*
 * The CLI takes ONE prompt string, so a role can only survive as a written
 * label. The comment above claimed roles were kept; the code dropped them, and
 * an `assistant` turn — the model's own previous body, which the repair path
 * now sends — arrived as an unlabelled slab of code between two instructions.
 * On the HTTP lane the wire carries the role; here it has to be spelled.
 */
const ROLE_LABEL = {
  assistant: 'You previously replied with this:',
};

export async function flatten(messages, dir) {
  const parts = [];
  const images = [];
  for (const turn of messages) {
    if (turn.role === 'system') continue; // goes to --system-prompt
    const label = ROLE_LABEL[turn.role];
    if (typeof turn.content === 'string') {
      parts.push(label === undefined ? turn.content : `${label}\n\n${turn.content}`);
      continue;
    }
    if (!Array.isArray(turn.content)) continue;
    const chunk = [];
    for (const item of turn.content) {
      if (item?.type === 'text') chunk.push(item.text);
      else if (item?.type === 'image_url') {
        const url = String(item.image_url?.url ?? '');
        const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
        if (m === null) continue;
        const file = path.join(dir, `ref-${String(images.length).padStart(2, '0')}${MIME_EXT[m[1]] ?? '.png'}`);
        await writeFile(file, Buffer.from(m[2], 'base64'));
        images.push(file);
      }
    }
    if (images.length > 0 && chunk.length > 0) {
      chunk.push(
        '\nThe images are on this disk. Read every one of them before you build anything:\n'
        + images.map((f) => `  ${f}`).join('\n'),
      );
    }
    parts.push(label === undefined ? chunk.join('\n') : `${label}\n\n${chunk.join('\n')}`);
  }
  return { prompt: parts.filter((p) => p !== '').join('\n\n────────────────\n\n'), images };
}

/** One SSE frame in the shape `call.ts`'s reader expects. */
function frame(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * A `fetch` that runs `claude -p` instead of making a request.
 *
 * The reply is re-emitted as a synthetic SSE stream rather than streamed
 * incrementally: the CLI has finished by the time the first frame is written, so
 * the byte counter in `tools/forge.mjs` jumps from 0 to the whole body in one
 * step. That costs a progress bar and costs the result nothing.
 */
export function claudeCliFetch(opts = {}) {
  /*
   * The backstop, and it must sit ABOVE the caller's own deadline rather than
   * under it.
   *
   * `forgeCreature` aborts at `req.timeoutMs` and the resulting error names that
   * number, which is the one a person can act on. A shorter backstop in here
   * fires first and reports its own figure instead — measured: a round given 45
   * minutes died at 2 400 s, five times, with a message about a limit nobody had
   * set. So this is only the last resort for a caller that set no deadline at
   * all, and it is generous.
   */
  const timeoutMs = opts.timeoutMs ?? 90 * 60_000;
  const bin = opts.bin ?? 'claude';
  const log = opts.log ?? (() => {});

  return async function cliFetch(_url, init) {
    const body = JSON.parse(init?.body ?? '{}');
    const system = body.messages?.find((m) => m.role === 'system')?.content ?? '';
    const dir = await mkdtemp(path.join(tmpdir(), 'forge-cli-'));
    try {
      const { prompt, images } = await flatten(body.messages ?? [], dir);
      /*
       * Effort is passed through, and it is the single largest lever on how
       * long this lane takes.
       *
       * `forgeRequestBody` already carries the caller's choice as
       * `reasoning.effort` for the HTTP wire; the CLI takes the same idea as
       * `--effort`. Passing it rather than letting the child inherit whatever
       * the machine's config says matters twice over: the machine's default is
       * not knowable from here, and a body built at one effort is not
       * comparable with one built at another — the record says `high` either
       * way, and would be wrong.
       *
       * Measured with the house style and five photographs attached: at `high`
       * a body is twenty to thirty minutes, nearly all of it thinking against a
       * 39 kB instruction before a line of geometry is written.
       */
      const effort = typeof body.reasoning?.effort === 'string' ? body.reasoning.effort : DEFAULT_EFFORT;
      const args = [
        '-p',
        '--model', cliModel(body.model),
        '--system-prompt', String(system),
        '--output-format', 'json',
        '--permission-mode', 'bypassPermissions',
        ...(effort === null ? [] : ['--effort', effort]),
      ];
      /*
       * `--tools`, NOT `--allowedTools`. They are not two spellings of one flag
       * and the difference cost four rounds and most of a day.
       *
       *   --allowedTools   a PERMISSION allow-list. It says which tools may run
       *                    without asking. It does not remove anything.
       *   --tools          the AVAILABLE tool set. `''` is none, a list is
       *                    exactly those.
       *
       * The image branch passed `--allowedTools Read` and `--permission-mode
       * bypassPermissions`, which left the child holding the entire Claude Code
       * toolset with nothing to stop it. Measured with
       * `--output-format stream-json`: it read the five photographs, then ran
       * **Bash** — `mkdir -p /tmp/gor && cat > /tmp/gor/part1.js <<'EOF' …` —
       * writing the body to disk in chunks and running `node --check` on each,
       * behaving like an agent building a file rather than a generator
       * answering a prompt. Nothing ever reached stdout, so every call ran until
       * the deadline killed it: five subjects × four rounds, and one solo run
       * that went seventy minutes.
       *
       * This lane wants a *completion*, not an agent. `Read` is the only tool it
       * may have, and only when there are photographs to look at.
       */
      if (images.length > 0) {
        args.push('--tools', 'Read', '--add-dir', dir);
      } else {
        args.push('--tools', '');
      }
      /*
       * The prompt goes down STDIN, not as the trailing argument.
       *
       * `--add-dir`, `--allowedTools` and `--tools` are all declared variadic,
       * so a positional prompt after any of them is swallowed as one more value
       * and the CLI exits with *"Input must be provided either through stdin or
       * as a prompt argument"* — an error that names the thing you just passed.
       * stdin has no such ambiguity, and it also lifts the argv ceiling off a
       * prompt that carries five image paths and a repair transcript.
       */

      log(`  cli: claude -p --model ${cliModel(body.model)}${effort === null ? '' : ` --effort ${effort}`} (${images.length} image${images.length === 1 ? '' : 's'}, ${Math.round(String(system).length / 1024)} kB system)`);

      const out = await run(bin, args, timeoutMs, init?.signal, prompt);
      let envelope;
      try {
        envelope = JSON.parse(out);
      } catch {
        return jsonError(502, `the CLI did not return JSON: ${out.slice(0, 400)}`);
      }
      // `is_error` FIRST. See the header — nothing else in this envelope is
      // trustworthy when it is set.
      if (envelope.is_error === true || typeof envelope.api_error_status === 'number') {
        const msg = typeof envelope.result === 'string' ? envelope.result : 'the CLI reported an error';
        return jsonError(envelope.api_error_status ?? 502, msg);
      }
      const text = typeof envelope.result === 'string' ? envelope.result : '';
      const usage = envelope.usage ?? {};
      const stream =
        frame({ choices: [{ delta: { content: text }, finish_reason: null }] })
        + frame({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: usage.input_tokens ?? 0,
            completion_tokens: usage.output_tokens ?? 0,
            // The CLI reports no reasoning split, and 0 is the honest answer:
            // an invented number here would land on the record and be read as
            // measured. `total_cost_usd` is 0 on a subscription, which is true.
            completion_tokens_details: { reasoning_tokens: 0 },
            cost: typeof envelope.total_cost_usd === 'number' ? envelope.total_cost_usd : 0,
          },
        })
        + 'data: [DONE]\n\n';
      return new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  };
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function run(bin, args, timeoutMs, signal, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin ?? '');
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      fn(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error(`the CLI did not answer within ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);
    const onAbort = () => {
      child.kill('SIGKILL');
      finish(reject, new Error('aborted'));
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => finish(reject, err));
    child.on('close', (code) => {
      if (code === 0) finish(resolve, stdout);
      // A non-zero exit with usable JSON on stdout is still an answer — the CLI
      // exits non-zero on a refusal and prints the envelope anyway.
      else if (stdout.trim().startsWith('{')) finish(resolve, stdout);
      else finish(reject, new Error(`claude exited ${code}: ${stderr.slice(0, 500) || '(no stderr)'}`));
    });
  });
}
