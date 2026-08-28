/**
 * Стадия «думать» — отдельно от стадии «писать».
 *
 * ── зачем ────────────────────────────────────────────────────────────────────
 *
 * Замерено на `frame-oct` (Opus, домашний стиль, OpenRouter): из 50 452 выходных
 * токенов 28 906 ушло на размышление — 57% счёта. Раздумья и код делят один
 * кошелёк `max_tokens`, и потолок на раздумья провайдер НЕ исполняет: Sonnet,
 * которому дали 30 000, взял 50 817 и выдавил код вдвое. Поэтому цену за проход
 * нельзя запланировать: сколько модель надумает, столько отнимет у геометрии.
 *
 * Этот файл берёт первую половину и делает её отдельным вызовом. Модель думает
 * с полным усилием, но возвращает не код, а СПЕЦИФИКАЦИЮ — то же решение,
 * выложенное текстом.
 *
 * ── почему план обязан быть длинным ──────────────────────────────────────────
 *
 * Токены размышления живут внутри одного запроса и наружу не переносятся: во
 * второй вызов уедет только текст. Модель, которая продумает на 30 000 и выдаст
 * план на 100 токенов, сожжёт раздумья впустую — заплачено за всё, унесено сто
 * токенов. Поэтому объём спецификации здесь требование, а не пожелание, и
 * короткий ответ считается провалом стадии.
 *
 * ── на чём это экономит ──────────────────────────────────────────────────────
 *
 * Не на первом проходе: план добавляет свои выходные токены и повторный вход,
 * и один проход выходит дороже (~$1.65 против $1.39). Экономия на РЕМОНТАХ —
 * сейчас каждый ремонт думает заново с нуля, а по готовому плану думать не
 * нужно. Замерено: три прохода стоят $5.82; с разделением ожидается ~$3.41.
 *
 *   OPENROUTER_API_KEY=… node tools/plan.mjs "an armoured octopus" \
 *     --model=anthropic/claude-opus-5 --style=machine --slug=plan-oct
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const require = createRequire(path.join(repoRoot, 'package.json'));

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const prompt = process.argv[2];
if (!prompt || prompt.startsWith('--')) {
  console.error('usage: node tools/plan.mjs "<prompt>" [--model=…] [--style=machine] [--slug=…]');
  process.exit(1);
}
const MODEL = arg('model', 'anthropic/claude-opus-5');
const STYLE = arg('style', 'machine');
const SLUG = arg('slug', 'plan');
const MIN_CHARS = Number(arg('min', 6000));

const key = process.env.OPENROUTER_API_KEY;
if (!key) { console.error('нет OPENROUTER_API_KEY'); process.exit(1); }

/** Тот же пакет, что и у forge — стадия обязана видеть ровно тот же стиль. */
const esbuild = require('esbuild');
const bundle = await esbuild.build({
  entryPoints: [path.join(repoRoot, 'packages/forge/src/index.ts')],
  bundle: true, format: 'esm', platform: 'neutral', write: false,
});
const forge = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

/*
 * Инструкция стадии. Три вещи держатся вместе намеренно:
 *   - код ЗАПРЕЩЁН, иначе модель напишет тело и мы заплатим дважды;
 *   - объём задан снизу, иначе раздумья не переживут переход во второй вызов;
 *   - требуется конкретика в числах, потому что «сделать красиво» вторым
 *     вызовом не исполнить — ему нужны координаты, а не намерения.
 */
const PLAN_INSTRUCTION = `
────────────────

THIS TURN IS PLANNING ONLY. Do not write any code. No JavaScript, no build
function, no snippets. A single line of code makes this reply a failure.

Return a BUILD SPECIFICATION in prose and lists: the complete decision about
this creature, written out so that someone else could build it without asking
you a single question.

It must cover, concretely and with numbers wherever a number is possible:

  1. The subject read: what this creature IS, its silhouette from above and
     from three-quarters, its overall proportions and world-space extent.
  2. Every major section: name, rough dimensions, position, and what it is
     made of — shell, frame, or exposed machine.
  3. The stack inside each section: what fills the volume, so nothing is hollow.
  4. The shells over it: how many pieces, where they overlap, where the gaps
     are, and what shows through those gaps.
  5. The harness: how many runs, where each one starts and ends, and the exact
     route it travels on the OUTSIDE of the body.
  6. The hardware: what small parts go where, on which faces, and roughly how
     many.
  7. The palette: which colour goes on which part, by name.
  8. What is on the UPWARD-FACING surfaces specifically — this creature is seen
     from a camera 36 degrees above the horizon for the whole match, and that
     is the only view that matters.

Be exhaustive. This specification is the only thing that survives into the
build; anything you decide but do not write down is lost. Err long.`;

const messages = forge.buildMessages(prompt + PLAN_INSTRUCTION, STYLE);

const started = Date.now();
const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 64000,
    usage: { include: true },
    reasoning: { effort: 'high' },   /* думать разрешено в полную силу — в этом и смысл стадии */
    messages: [
      { role: 'system', content: messages.system },
      { role: 'user', content: messages.user },
    ],
  }),
});
const payload = await res.json();
const elapsedMs = Date.now() - started;

if (!res.ok || payload.error) {
  console.error(`ОШИБКА ${res.status}:`, JSON.stringify(payload.error ?? payload).slice(0, 300));
  process.exit(2);
}

const text = payload.choices?.[0]?.message?.content ?? '';
const u = payload.usage ?? {};
const think = u.completion_tokens_details?.reasoning_tokens ?? 0;
const planTokens = (u.completion_tokens ?? 0) - think;

await mkdir(path.join(repoRoot, 'plans'), { recursive: true });
await writeFile(path.join(repoRoot, 'plans', `${SLUG}.md`), text);
await writeFile(path.join(repoRoot, 'plans', `${SLUG}.json`), JSON.stringify({
  prompt, model: MODEL, style: STYLE,
  promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens,
  reasoningTokens: think, planTokens, planChars: text.length,
  costUsd: u.cost ?? null, elapsedMs, at: new Date().toISOString(),
}, null, 2));

/* Провал стадии — не ошибка запуска: это измерение, и оно означает, что
   раздумья не пережили переход и второй вызов запускать бессмысленно. */
const codeLeak = /```|function\s+build\s*\(|new THREE\./.test(text);
console.log(`план: ${SLUG}`);
console.log(`  ${Math.round(elapsedMs / 1000)} с · $${(u.cost ?? 0).toFixed(4)}`);
console.log(`  размышление ${think.toLocaleString('ru')} ток · сам план ${planTokens.toLocaleString('ru')} ток · ${text.length.toLocaleString('ru')} символов`);
console.log(`  доля раздумий в выходе: ${u.completion_tokens ? Math.round(think / u.completion_tokens * 100) : 0}%`);
if (codeLeak) console.log('  ⚠ в плане есть код — стадия просила только текст');
if (text.length < MIN_CHARS) console.log(`  ⚠ ПЛАН КОРОТКИЙ (< ${MIN_CHARS} символов) — раздумья не пережили переход`);
