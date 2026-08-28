/**
 * The forge, from a terminal.
 *
 *   node tools/forge.mjs "battle pirate ship"
 *   node tools/forge.mjs "a jellyfish made of glass" --model=openai/gpt-5.6-sol
 *   node tools/forge.mjs "a wading bird" --style=machine
 *   node tools/forge.mjs --list
 *
 * Sends the prompt to the model with `@autoage/forge`'s instruction and nothing
 * else, and writes the reply to `forge/<slug>.js` beside a `forge/<slug>.json`
 * record. It does not render anything — `tools/forgeshot.mjs` does that, and the
 * split is deliberate: generation costs money and takes a minute, rendering is
 * free and instant, and tying them together would mean paying for a frontier
 * call every time a camera angle is wrong.
 *
 * The key comes from `.env` at the repo root (`OPENROUTER_API_KEY`), read here
 * and passed as an argument. `packages/forge` reads no environment.
 */

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { claudeCliFetch } from './lane-cli.mjs';
import { findNonFinite, nonFiniteMessage } from './nanscan.mjs';
import { findStrayCable, strayCableMessage } from './cablecheck.mjs';
import { sampleVisibility } from './visibility.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const outDir = path.join(repoRoot, 'forge');

/**
 * esbuild lives in `apps/server`'s dependencies, which is where the repo's only
 * other TS-from-node entry point already gets it. Resolving from that package
 * rather than adding a root dependency keeps the install graph as it is; the
 * alternative is `node --experimental-strip-types`, which cannot follow the
 * `./foo.js` -> `./foo.ts` specifiers this repo writes everywhere.
 */
const require = createRequire(path.join(repoRoot, 'package.json'));
const esbuild = require('esbuild');

/** Bundle `packages/forge` and import it, so the CLI and the app share one instruction. */
async function loadForge() {
  const built = await esbuild.build({
    entryPoints: [path.join(repoRoot, 'packages/forge/src/index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    write: false,
    logLevel: 'silent',
  });
  const code = built.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

/**
 * Runs the model's code once, here, so a body that cannot be built is handed
 * back to the model instead of written to disk as a corpse.
 *
 * `three` is resolved out of the repo root — Airena has one package.json, not a
 * declares it — `@autoage/forge` must never link a renderer, and this file is
 * the caller that can. If it cannot be resolved, verification is skipped rather
 * than fatal: forging without a GPU-less three is still a useful thing to do.
 *
 * What comes back is the raw error, unedited. It is going to a model that will
 * read it as a compiler message, and paraphrasing it would only lose the line
 * number.
 */
async function makeVerifier(forge) {
  let THREE;
  let TSL;
  try {
    const clientRequire = createRequire(path.join(repoRoot, 'package.json'));
    THREE = await import(pathToFileURL(clientRequire.resolve('three/webgpu')).href);
    TSL = await import(pathToFileURL(clientRequire.resolve('three/tsl')).href);
  } catch {
    console.log('  (three not resolvable — skipping the build check)');
    return undefined;
  }
  return (source) => {
    try {
      // `forge` is null when --noaudit was passed: the build check still runs,
      // the style audit does not. Kept because the audit spends money — a
      // violation is another full call — and a baseline run has to be able to
      // measure what the model does unaided.

      // `extractBuildSource` already returns a complete function *body* ending
      // in `return build(THREE, TSL);` (clean.ts:158). Wrapping it a second
      // time is not a no-op — it returns the built object where a function is
      // expected, and the error reads `build is not a function`, which sounds
      // like the model's fault and is not. Three Opus calls were spent proving
      // that.
      const object = new Function('THREE', 'TSL', source)(THREE, TSL);
      if (!object || typeof object.traverse !== 'function') {
        return 'build() returned ' + (object === undefined ? 'undefined' : typeof object)
          + ' rather than a THREE.Object3D.';
      }
      let meshes = 0;
      object.traverse((o) => { if (o.isMesh) meshes++; });
      if (meshes === 0) return 'build() returned an object with no meshes in it.';

      /*
       * NaN in a position attribute — a HARD failure, and one this check did not
       * used to catch. The scan and the message live in `tools/nanscan.mjs`,
       * which explains what it costs; they are there rather than here because
       * this file runs `main()` at import time and so cannot be tested.
       *
       * Not `soft`: unlike a style violation there is nothing here worth
       * keeping — the body is invisible.
       */
      const nonFinite = findNonFinite(object);
      if (nonFinite !== null) return nonFiniteMessage(nonFinite);

      /*
       * The style audit, on the body that actually came back.
       *
       * The prose checklist in the directive was ignored for nine consecutive
       * bodies — "at most a third accent" produced two thirds orange every
       * time. This measures instead of asking, and a violation goes back down
       * the same repair path an exception does. See `packages/forge/src/audit.ts`
       * for what it will and will not judge.
       */
      const audited = [];
      let namedParts = 0;
      object.traverse((o) => {
        if (o.name) namedParts++;
        if (!o.isMesh || !o.geometry) return;
        const index = o.geometry.getIndex ? o.geometry.getIndex() : null;
        const position = o.geometry.getAttribute ? o.geometry.getAttribute('position') : null;
        const triangles = index ? index.count / 3 : position ? position.count / 3 : 0;
        const material = Array.isArray(o.material) ? o.material[0] : o.material;
        const colour = material && material.color ? material.color : { r: 0.5, g: 0.5, b: 0.5 };
        const emissiveColour = material && material.emissive ? material.emissive : null;
        audited.push({
          geometry: o.geometry.type ?? 'BufferGeometry',
          // Primitive geometries keep the arguments they were built with, which
          // is the only way to see how thick a hose is without measuring mesh.
          radius: o.geometry.parameters?.radius,
          // `TubeGeometry` keeps the curve it was swept along, and the curve
          // knows its own length. This is the number a harness cannot fake.
          tubeLength: typeof o.geometry.parameters?.path?.getLength === 'function'
            ? o.geometry.parameters.path.getLength()
            : undefined,
          // World-space size, so a greeble is judged against this body rather
          // than against an absolute number that would be wrong at any other
          // scale. Cheap: the box is already computed per mesh below.
          extent: (() => {
            const b = new THREE.Box3().setFromObject(o);
            if (b.isEmpty()) return undefined;
            const v = new THREE.Vector3();
            b.getSize(v);
            return Math.max(v.x, v.y, v.z);
          })(),
          triangles,
          color: [colour.r, colour.g, colour.b],
          emissive: emissiveColour !== null
            && (emissiveColour.r > 0.02 || emissiveColour.g > 0.02 || emissiveColour.b > 0.02),
        });
      });
      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3();
      if (!box.isEmpty()) box.getSize(size);
      if (forge === null) return null;
      /*
       * What is actually SEEN, not just what was built. A body can carry a full
       * harness threaded under its armour and read as having none — see
       * `tools/visibility.mjs`. Costs a few thousand raycasts, i.e. tens of ms,
       * against a call that takes minutes and dollars.
       */
      const bodyExtent = Math.max(size.x, size.y, size.z);
      const visible = bodyExtent > 0 ? sampleVisibility(THREE, object, bodyExtent) : null;
      // Two audits: one on the geometry that came back, one on the source that
      // made it. The lattice is only visible in the second.
      const findings = [...forge.auditSource(source), ...forge.auditBody({ meshes: audited, size, namedParts, visible: visible ?? undefined })];
      /*
       * Does the harness move with the body?
       *
       * Not in `packages/forge/src/audit.ts` because it is not a property of the
       * geometry that came back — it is a property of the geometry AFTER the
       * body's own pose function has been run, twice, and compared. The audit
       * package takes a flat summary of meshes and deliberately never links a
       * renderer; this needs the live object and `three`, which is exactly what
       * this verifier already has and the package must not.
       *
       * It is a soft finding: the body runs, and a creature with a stiff harness
       * is still a creature. But it is the defect an operator noticed first on
       * every body in rounds v5-v8, and it is invisible in the still renders the
       * graders score — so nothing else in the loop can catch it.
       */
      /*
       * Деталь есть, но не с той стороны.
       *
       * Камера боя стоит под 36° (`src/viewer/main.js:52-54`), и это
       * единственный ракурс, который игрок видит постоянно. Оба тела первого
       * замера набрали приличную плотность мелких деталей и при этом имели
       * ГОЛЫЙ верх: одно вложило 22 тысячи треугольников в болты на щупальцах,
       * невидимые сверху, и оставило крышку пустым многоугольником.
       *
       * Правило намеренно узкое. Аудит этого файла держится принципа «число,
       * притворяющееся мерой вкуса, хуже отсутствия числа», поэтому здесь нет
       * порога «мало деталей сверху» — только однозначный случай: детали
       * построены, их видно в сумме по всем направлениям, и НИ ОДНОЙ не видно
       * с боевой высоты. Калибровать порог не на чем, а этот случай в
       * калибровке не нуждается.
       */
      if (visible !== null && visible.camera !== undefined && visible.camera.samples > 0
          && visible.greeble > 0 && visible.camera.greeble === 0) {
        const overall = (visible.greeble / visible.samples * 100).toFixed(1);
        console.log('  style: greebles-not-facing-camera');
        findings.push({
          rule: 'greebles-not-facing-camera',
          message:
            `This body has small hardware — ${overall}% of what the eight survey angles see is greeble — but `
            + 'NONE of it is visible from where the player actually watches the fight. The arena camera sits at '
            + '36 degrees above the horizon and never moves; the top surfaces and the upward-facing shoulders of '
            + 'this body are the only thing on screen for the whole match, and they are bare. Move the bolt heads, '
            + 'clamps, vents, hatches and panel joins onto the surfaces that face UP and UP-FORWARD. Detail that '
            + 'only reads from a side elevation is detail nobody is paying for.',
        });
      }

      const stray = findStrayCable(object, THREE);
      if (stray !== null) {
        console.log('  style: cable-stiff');
        findings.push({ rule: 'cable-stiff', message: strayCableMessage(stray) });
      }
      if (findings.length > 0) {
        for (const f of findings) console.log(`  style: ${f.rule}`);
      }
      const message = forge.auditFailureMessage(findings);
      // `soft`: the body runs. It is handed back while there is budget, and
      // KEPT when the budget is gone — a style violation must never discard a
      // working creature and the requests that paid for it.
      return message === null ? null : { message, soft: true };
    } catch (err) {
      return `${err && err.name ? err.name : 'Error'}: ${err && err.message ? err.message : String(err)}`;
    }
  };
}

/** `.env` at the repo root, parsed the boring way. Never printed. */
async function readEnvFile() {
  const file = path.join(repoRoot, '.env');
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

/**
 * The house style's reference photographs, if they are on this disk.
 *
 * **Off by default, and that is a measured decision rather than a default that
 * was never set.** The same directive was run twice on "panther", once with the
 * four photographs and once without:
 *
 *   with     41 680 prompt tokens   $2.38   551 meshes   956 s
 *   without  30 439 prompt tokens   $2.52   721 meshes  1071 s
 *
 * The pictures cost about 12 000 prompt tokens on **every attempt**, and since a
 * body usually takes three attempts that is 36 000 tokens of images per
 * creature. They did not pay for it: the price came out the same, because the
 * run without them spent its savings on thinking instead, and the body without
 * them was the better of the two — more parts, a visible harness, more small
 * hardware. Everything the images were originally added for — the dusty
 * low-reflection material — has since moved into the directive as swatches and
 * roughness numbers, which is where it can be argued with.
 *
 * `--images` turns them back on. Kept rather than deleted because the answer
 * above is one A/B on one subject, and the next person may want to re-run it.
 */
async function loadStyleImages(style, on, limit) {
  if (!on) return undefined;
  if (style !== 'machine') return undefined;
  const dir = path.join(repoRoot, 'docs/style-refs');
  if (!existsSync(dir)) return undefined;
  const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
  let files = (await readdir(dir)).filter((f) => types[path.extname(f).toLowerCase()]).sort();
  if (files.length === 0) return undefined;
  /*
   * `--maxrefs=N` keeps the first N, in name order, and the names are numbered
   * so that order is a deliberate one rather than whatever the filesystem says.
   *
   * It exists because the images are the largest single input to a call on the
   * CLI lane and the lane's binding constraint is time, not money — five
   * photographs is five `Read` round trips and about twelve thousand prompt
   * tokens on every attempt. Cutting to three is the first thing to try when a
   * round will not finish, and it must be recorded on the record when it is
   * done, because a body shown three references was told less than one shown
   * five.
   */
  if (Number.isFinite(limit) && limit > 0) files = files.slice(0, limit);
  const images = [];
  for (const file of files) {
    images.push({
      mediaType: types[path.extname(file).toLowerCase()],
      base64: (await readFile(path.join(dir, file))).toString('base64'),
    });
  }
  return images;
}

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq < 0) flags[arg.slice(2)] = true;
      else flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else rest.push(arg);
  }
  return { flags, prompt: rest.join(' ') };
}

async function list() {
  if (!existsSync(outDir)) {
    console.log('no creatures yet — forge/ does not exist');
    return;
  }
  // `index.json` is the *array* of these records, not one of them. Reading it
  // as a record yields `undefined` for every field and takes the listing down.
  const files = (await readdir(outDir)).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
  if (files.length === 0) {
    console.log('no creatures yet');
    return;
  }
  let total = 0;
  for (const file of files) {
    const rec = JSON.parse(await readFile(path.join(outDir, file), 'utf8'));
    const kb = (rec.replyBytes / 1024).toFixed(1);
    const cost = rec.usage?.costUsd;
    if (typeof cost === 'number') total += cost;
    const price = typeof cost === 'number' ? `$${cost.toFixed(3)}` : '     —';
    console.log(
      `${rec.slug.padEnd(34)} ${String(rec.model).padEnd(26)} ${kb.padStart(6)} kB ${price.padStart(7)}  ${rec.prompt}`,
    );
  }
  console.log(`${''.padEnd(34)} ${''.padEnd(26)} ${''.padStart(6)}    ${('$' + total.toFixed(3)).padStart(7)}  total`);
}

async function main() {
  const { flags, prompt } = parseArgs(process.argv.slice(2));
  if (flags.list) return list();

  if (prompt.trim() === '') {
    console.error('usage: node tools/forge.mjs "<prompt>" [--model=<id>] [--effort=high] [--style=machine]');
    console.error('       [--lane=cli] run through the logged-in claude CLI instead of OpenRouter');
    console.error('       [--noimages] send the directive without the reference photographs');
    console.error('       [--repairs=N] extra requests a failed build or style audit may buy (default 2)');
    console.error('       [--blind] repair without showing the model its own previous body (the old protocol)');
    console.error('       [--hardonly] spend the repair budget only on bodies that do not BUILD; style complaints are recorded, not fixed');
    console.error('       [--timeout=SEC] wall clock per request (default 1800 — Opus alone needs past 900)');
    console.error('       [--stage=frame] ask for the load-bearing frame only, with the finished creature declared');
    console.error('       [--think=N]  hard ceiling on reasoning tokens (effort is only a hint); 0 disables thinking');
    console.error('       [--plan=<file>] build from a written specification instead of deciding here');
    console.error('       [--maxtok=N] ceiling on the whole completion, thinking included');
    console.error('       [--budget=N] hard ceiling in DOLLARS; the token cap is derived from the live price list');
    console.error('       [--maxrefs=N] show only the first N reference photographs');
    process.exitCode = 1;
    return;
  }

  const env = { ...(await readEnvFile()), ...process.env };
  /*
   * Which wire this call goes down, and it is an ARGUMENT rather than a
   * property of the environment — the same rule `/admin/seed` follows for the
   * seeding child. `--lane=cli` runs the logged-in `claude` binary (subscription
   * quota, no key); anything else is OpenRouter and costs money. The lane lands
   * on the record, so "was this body free?" is answerable from disk.
   */
  const lane = flags.lane === 'cli' || flags.cli === true ? 'cli' : 'key';
  const apiKey = env.OPENROUTER_API_KEY;
  if (lane === 'key' && !apiKey) {
    console.error('no OPENROUTER_API_KEY in .env or the environment');
    console.error('  (or pass --lane=cli to go through the logged-in claude CLI instead)');
    process.exitCode = 1;
    return;
  }

  const forge = await loadForge();
  const model = typeof flags.model === 'string' ? flags.model : 'anthropic/claude-opus-5';
  const slug = typeof flags.slug === 'string' ? flags.slug : forge.slugify(prompt);
  /*
   * Стадийная выдача: каркас сейчас, детали потом.
   *
   * Смысл не в экономии токенов самой стадии, а в порядке проверок. Сейчас мы
   * платим за целое тело и только потом узнаём, что силуэт не читается или
   * верх пустой — а именно на этом тела проваливались у всех трёх ревьюеров.
   * Каркас стоит впятеро дешевле и ловит те же дефекты.
   *
   * КОНЕЧНАЯ ЦЕЛЬ ОБЪЯВЛЯЕТСЯ СРАЗУ. Модель, которой сказали «сделай
   * минимально», планирует минимально: не оставит зазоров между панцирями, не
   * заложит трасс под жгут, не продумает стыков — её об этом не просили. Тогда
   * детали пришлось бы навешивать на каркас, под них не рассчитанный. Поэтому
   * стадия просит каркас, но требует держать в голове всё, что придёт следом.
   */
  const STAGE_FRAME = `

────────────────

STAGING. This creature will be built in three passes, and this is the FIRST one.

The FINISHED creature — what you are ultimately building — is everything the
style above demands: fitted shells over a dark packed machine, the harness of
thick hoses and thin wire running OUTSIDE the armour from port to port, hundreds
of bolt heads and clamps and connectors on the outer faces, panel joins and
gaps with the machine showing through them.

RIGHT NOW return only the LOAD-BEARING FRAME: the masses, their proportions,
their placement, and the joints between them. Few primitives. No greebles, no
cable, no small hardware — those are passes two and three.

But build the frame FOR that finished creature, not as a thing complete in
itself:

  - leave the gaps between sections where the machine will show;
  - leave the ports, spine channels and clamp points the harness will run
    between, and put them where a hose could actually travel;
  - give every shell somewhere to bolt onto;
  - get the silhouette right from ABOVE and from three-quarters, because that
    is where this creature is looked at.

Name every part as if the finished body already existed. A frame that has no
room for what comes next is a failed frame, however clean it looks.`;
  /*
   * Жёсткий потолок в ДОЛЛАРАХ.
   *
   * Единственный рычаг, который провайдер исполняет — общий `max_tokens`
   * (проверено: Sonnet взял 62 406 из разрешённых 66 000, а вот потолок на
   * раздумья тот же Sonnet проигнорировал, взяв 50 817 вместо 30 000). Значит
   * бюджет задаётся так: берём цену модели из прайса OpenRouter, вычитаем
   * неизбежную оплату входа и переводим остаток в токены.
   *
   * Цена берётся с сервера, а не из таблицы в коде: прайс двигается молча, а
   * новая модель должна работать без правок здесь.
   */
  const budgetUsd = flags.budget ? Number(flags.budget) : null;
  let budgetCap = null;
  if (budgetUsd !== null) {
    const list = await fetch('https://openrouter.ai/api/v1/models')
      .then((r) => r.json()).catch(() => null);
    const entry = list?.data?.find((m) => m.id === model);
    if (entry === undefined) {
      console.error(`--budget: модели ${model} нет в прайсе OpenRouter`);
      process.exit(1);
    }
    const inPrice = Number(entry.pricing?.prompt ?? 0);
    const outPrice = Number(entry.pricing?.completion ?? 0);
    if (!(outPrice > 0)) {
      console.error(`--budget: у ${model} не указана цена выхода`);
      process.exit(1);
    }
    /* Вход мерим по факту инструкции: 4 символа на токен — грубо, но в нужную
       сторону, потому что переоценка входа оставляет запас, а не съедает его. */
    /* Размер инструкции берём у самого пакета — он же её и составляет. */
    const sys = forge.buildMessages(prompt, style).system;
    const inTokens = Math.ceil((sys.length + prompt.length) / 4) + 400;
    const inCost = inTokens * inPrice;
    budgetCap = Math.floor((budgetUsd - inCost) / outPrice);
    console.log(`  бюджет $${budgetUsd.toFixed(2)}: вход ~${inTokens.toLocaleString('ru')} ток = $${inCost.toFixed(3)}, `
      + `на выход остаётся ${budgetCap.toLocaleString('ru')} токенов`);
    if (budgetCap < 25000) {
      console.log('  ⚠ меньше 25 000 на выход — тело столько не занимает, ответ оборвётся на полуслове');
    }
  }

  const stageFrame = flags.stage === 'frame';
  /*
   * Сборка по готовой спецификации.
   *
   * Замерено: одиночный проход тратит 28 906 токенов на скрытое размышление —
   * 57% счёта, — и каждый ремонт думает заново с нуля. План выносит это решение
   * в текст один раз, и дальше думать не над чем: остаётся перенести написанное
   * в геометрию. Поэтому вместе с планом раздумья выключаются.
   */
  const planFile = typeof flags.plan === 'string' ? flags.plan : null;
  const planText = planFile ? await readFile(path.resolve(repoRoot, planFile), 'utf8') : null;
  const PLAN_PREFIX = `

────────────────

A BUILD SPECIFICATION for this creature has already been written and agreed. It
is below. Every decision in it is final: the sections, their dimensions and
positions, the materials, the harness routes, the hardware, the palette.

Your job this turn is to TRANSLATE it into the build function. Do not redesign
it, do not simplify it, do not substitute your own proportions or colours. Where
the specification gives a number, use that number. Where it names a part, name
the part that. Build everything it lists — the parts it describes are the body.

────────────────

`;
  const effectivePrompt = planText !== null ? prompt + PLAN_PREFIX + planText
    : stageFrame ? prompt + STAGE_FRAME : prompt;

  const style = typeof flags.style === 'string' ? flags.style : 'raw';
  if (!forge.FORGE_STYLES.some((s) => s.id === style)) {
    console.error(`no such style: ${style}`);
    console.error(`  available: ${forge.FORGE_STYLES.map((s) => s.id).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  /*
   * The slug is the prompt, so two models on one prompt land on one file and
   * the second silently destroys the first.
   *
   * Not hypothetical: "a fairy" was run on Sonnet and Opus minutes apart, and
   * the Sonnet body — 172 s and $0.18 — was gone before anyone looked at it.
   * The loss is silent, it costs real money, and it is discovered later by
   * reading a record that names a model the file did not come from.
   *
   * Refusing is the right default rather than folding the model into the slug:
   * the paths are in `docs/`, in `forgeshot.mjs` and in `captures/`, and moving
   * them to fix a footgun would break every one of those. `--slug` names a
   * different file, `--force` overwrites on purpose.
   */
  /*
   * `-s2` and up belong to the growth lane (`packages/forge/src/grow.ts`), and
   * `slugify` knows nothing about them: the prompt "battle pirate ship s2" lands
   * exactly on stage 2 of an existing lineage. Refused rather than renamed —
   * a creature quietly filed under a different name is a creature nobody finds
   * again.
   */
  if (forge.parseStageSlug(slug).stage !== 1) {
    console.error(`"${slug}" is the name of an evolution stage — that suffix belongs to the growth lane.`);
    console.error('  reword the prompt, or pass an explicit --slug=');
    process.exitCode = 1;
    return;
  }

  const existing = path.join(outDir, `${slug}.json`);
  if (existsSync(existing) && !flags.force) {
    const prev = JSON.parse(await readFile(existing, 'utf8'));
    const prevStyle = prev.style ?? 'raw';
    /*
     * Style is a second axis on the same slug, and it destroys the same way the
     * model axis does. The raw baseline is the thing `style.ts` promises stays
     * comparable, and `--style=machine` over a prompt already forged raw would
     * silently be the run that removed it.
     */
    if (prev.model !== model || prevStyle !== style) {
      const what = prev.model !== model ? `from ${prev.model}` : `in the ${prevStyle} style`;
      console.error(`forge/${slug}.js already holds a creature ${what}`);
      console.error(`  made ${prev.at}, ${prev.replyBytes} bytes`);
      console.error('refusing to overwrite it.');
      console.error(
        `  keep both:  --slug=${slug}-${prev.model !== model ? String(model).split('/').pop() : style}`,
      );
      console.error('  replace it: --force');
      process.exitCode = 1;
      return;
    }
  }

  /*
   * Reference images: ON by default for the `machine` style, off for `raw`.
   *
   * The reverse used to be true, and the A/B that decided it is quoted above
   * `loadStyleImages`. Two things have changed since. The pictures cost ~12 000
   * prompt tokens per attempt, and on `--lane=cli` prompt tokens are quota
   * rather than dollars — the measurement that made them not worth it was a
   * price measurement. And the reference set is no longer four images of the
   * same mood: it is the five bodies in `docs/style-refs/`, which the directive
   * is now written *against*, and the value split and the rust freckling in them
   * are things a paragraph describes far worse than a photograph shows.
   * `--noimages` turns them off, which is what re-runs the old A/B.
   */
  /*
   * Референсные фотографии по умолчанию ВЫКЛЮЧЕНЫ.
   *
   * Раньше домашний стиль включал их сам, и это стоило дважды: входными
   * токенами на каждой генерации и допуском — модель без зрения получает
   * `404: No endpoints found that support image input` и не может
   * сгенерировать тело вообще. Так отвалился GLM 5.3.
   *
   * Включаются только явным `--images`.
   */
  const wantImages = flags.images !== undefined ? Boolean(flags.images) : false;
  const styleImages = await loadStyleImages(style, wantImages, flags.maxrefs === undefined ? undefined : Number(flags.maxrefs));

  console.log(`forging "${prompt}"`);
  console.log(`  model  ${model}${lane === 'cli' ? '  (via the claude CLI — subscription quota)' : ''}`);
  console.log(`  out    forge/${slug}.js`);
  console.log(
    styleImages
      ? `  style  ${style} + ${styleImages.length} reference image${styleImages.length === 1 ? '' : 's'} (--images)`
      : `  style  ${style}`,
  );
  console.log('  …waiting on the model (this is one call, it can take a few minutes)');

  // A live byte counter, because the alternative is four silent minutes during
  // which a working call and a hung one look identical.
  let streamed = 0;
  const tick = () => {
    if (process.stdout.isTTY) process.stdout.write(`\r  …${streamed} bytes of code so far`);
  };

  let result;
  try {
    result = await forge.forgeCreature({
      prompt: effectivePrompt,
      model,
      apiKey: apiKey ?? 'cli-lane',
      blindRepair: flags.blind === true,
      repairHardOnly: flags.hardonly === true,
      ...(flags.timeout ? { timeoutMs: Number(flags.timeout) * 1000 } : {}),
      effort: typeof flags.effort === 'string' ? flags.effort : 'high',
      ...(flags.think !== undefined ? { thinkTokens: Number(flags.think) }
         : planText !== null ? { thinkTokens: 0 } : {}),
      ...(flags.maxtok ? { maxTokens: Number(flags.maxtok) }
         : budgetCap !== null ? { maxTokens: budgetCap } : {}),
      /*
       * `--style=machine` is the world's look; the default here is `raw`, the
       * base instruction alone. The CLI keeps the package's default rather than
       * the studio's on purpose: a record that says `raw` must always mean the
       * body really was told nothing, so the only place a style is applied
       * silently is nowhere. See `packages/forge/src/style.ts`.
       */
      style,
      styleImages,
      fetchImpl: lane === 'cli' ? claudeCliFetch({ log: (m) => console.log(m) }) : undefined,
      /*
       * 45 minutes an attempt on the CLI lane, against the package's 15.
       *
       * Measured on the brain lane and written up in CLAUDE.md: a real design
       * call through this subprocess takes 514 s, and the budget that used to
       * bind was 420. Cutting a body at fifteen minutes here would throw away a
       * creature that was two minutes from finishing, three times in a row, and
       * the only trace would be `aborted` in a log. Re-measured on the forge
       * lane with the house style and five reference photographs attached: a
       * body takes **22 to 30 minutes**, because the call is six turns (one
       * Read per photograph) before a line of geometry is written and then
       * fifty kilobytes of JavaScript. 30 minutes was cutting it at the wire.
       */
      timeoutMs: flags.timeout ? Number(flags.timeout) * 1000 : (lane === 'cli' ? 2_700_000 : undefined),
      maxTokens: flags.maxTokens ? Number(flags.maxTokens) : undefined,
      onDelta: (text) => {
        streamed += text.length;
        tick();
      },
      /*
       * How many extra requests a failed build or a style violation may buy.
       *
       * The package's default is 2 — three calls in the worst case. On the CLI
       * lane every call is quota rather than dollars, and a five-subject round
       * at three calls each is fifteen frontier generations against one session
       * limit. Measured: a round died mid-ladder with
       * `You've hit your session limit`, having produced nothing. `--repairs=1`
       * is the setting that makes a round fit; the body is kept either way now
       * (see `held` in `packages/forge/src/call.ts`).
       */
      repairAttempts: flags.repairs === undefined ? undefined : Number(flags.repairs),
      verify: flags.noaudit ? await makeVerifier(null) : await makeVerifier(forge),
    });
    if (process.stdout.isTTY) process.stdout.write('\n');
  } catch (err) {
    if (process.stdout.isTTY) process.stdout.write('\n');
    console.error(`\nforge failed: ${err.reason ?? 'error'} — ${err.message}`);
    // A call that failed still produced most of a creature and cost full price.
    // It is written where it can be read rather than lost with the exception.
    //
    // ── and it is NOT necessarily truncated ──────────────────────────────────
    //
    // This branch used to say "raise --maxTokens and try again" for every
    // partial, which is a guess dressed as a diagnosis, and it sent a day of
    // work down the wrong road: the v5 eagle was reported as truncated at 68 kB
    // and re-run with a bigger budget, when in fact its reply was COMPLETE —
    // it ended with a well-formed `return build(THREE, TSL);` — and threw at
    // build time on one dead line that passed a material where a geometry goes
    // (`new THREE.Mesh(material, undefined)` → three.js reads
    // `geometry.morphAttributes` → "Cannot convert undefined or null to
    // object"). Deleting that single line builds the body: 1929 meshes.
    //
    // The two failures have opposite fixes — a bigger token budget for the
    // first, a repair pass aimed at a named line for the second — so the tool
    // must not conflate them. Compiling the reply tells them apart for free:
    // `new Function` parses without executing, so a SyntaxError means the text
    // really did stop mid-statement, and a clean parse means the model finished
    // and the fault is in what it wrote.
    if (typeof err.partial === 'string' && err.partial !== '') {
      await mkdir(outDir, { recursive: true });
      const file = path.join(outDir, `${slug}.partial.js`);
      await writeFile(file, err.partial, 'utf8');

      let parseError = null;
      try {
        // eslint-disable-next-line no-new-func
        new Function('THREE', 'TSL', err.partial);
      } catch (syntax) {
        parseError = syntax;
      }

      if (parseError !== null) {
        console.error(
          `what it did write is in forge/${slug}.partial.js — it stopped mid-statement ` +
            `(${parseError.message}), so it really was cut off: raise --maxTokens and try again`,
        );
      } else {
        console.error(
          `what it did write is in forge/${slug}.partial.js — it parses clean, so the reply was ` +
            `COMPLETE and --maxTokens is not the problem: the fault is in the code it wrote. ` +
            `Run it to get a stack trace before re-forging.`,
        );
      }
    }
    process.exitCode = 1;
    return;
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${slug}.js`), result.reply, 'utf8');

  const record = {
    version: 1,
    slug,
    prompt: result.prompt,
    model: result.model,
    at: new Date().toISOString(),
    entry: result.code.entry,
    notes: result.code.notes,
    repairs: result.repairs ?? [],
    unresolved: result.unresolved ?? [],
    usage: result.usage,
    effort: typeof flags.effort === 'string' ? flags.effort : 'high',
    lane,
    style,
    // How many reference photographs this body was actually shown. A body told
    // less is not comparable with one told more, and nothing else on the record
    // would say so.
    styleImages: styleImages ? styleImages.length : 0,
    attempts: result.attempts ?? 1,
    elapsedMs: result.elapsedMs,
    replyBytes: Buffer.byteLength(result.reply, 'utf8'),
  };
  await writeFile(path.join(outDir, `${slug}.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8');

  // The index the studio page reads. Rewritten whole rather than appended to,
  // so a deleted creature disappears from the picker without a second command.
  const records = [];
  for (const file of (await readdir(outDir)).filter((f) => f.endsWith('.json') && f !== 'index.json')) {
    records.push(JSON.parse(await readFile(path.join(outDir, file), 'utf8')));
  }
  records.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
  await writeFile(path.join(outDir, 'index.json'), `${JSON.stringify(records, null, 2)}\n`, 'utf8');

  const sec = (result.elapsedMs / 1000).toFixed(1);
  console.log(`\ndone in ${sec}s — ${record.replyBytes} bytes of code, entry \`${result.code.entry}\``);
  if (result.usage) {
    const u = result.usage;
    // Reasoning is broken out because it is where the money goes: the first
    // live ship billed 28k output tokens for roughly 6k tokens of JavaScript.
    const share = u.completionTokens > 0 ? Math.round((u.reasoningTokens / u.completionTokens) * 100) : 0;
    console.log(
      `  tokens  ${u.completionTokens.toLocaleString('en-US')} out` +
        (u.reasoningTokens > 0 ? ` (${u.reasoningTokens.toLocaleString('en-US')} of it thinking — ${share}%)` : ''),
    );
    if (u.costUsd !== null) {
      const calls = result.attempts ?? 1;
      console.log(`  cost    $${u.costUsd.toFixed(4)}${calls > 1 ? `  (all ${calls} requests)` : ''}`);
    }
  }
  /*
   * Two different kinds of "repair", and conflating them printed "the model
   * complied exactly — no repairs" on a run that had just made three requests.
   *
   *   code.notes  liberties the LOADER took to make the reply callable —
   *               a stripped fence, a deleted import. Free, no extra call.
   *   repairs     whole extra requests, because the body would not build or
   *               broke the style audit. Each one is another full price.
   */
  if (result.code.notes.length > 0) {
    console.log('the loader had to repair the reply:');
    for (const note of result.code.notes) console.log(`  - ${note}`);
  }
  const leftover = result.unresolved ?? [];
  if (leftover.length > 0) {
    console.log('KEPT ANYWAY — the style audit was still unhappy when the budget ran out:');
    for (const u of leftover) {
      for (const line of u.split('\n').filter((l) => /^\s*\d+\./.test(l))) console.log(`  ${line.trim().slice(0, 150)}`);
    }
  }
  const handedBack = result.repairs ?? [];
  if (handedBack.length > 0) {
    console.log(`handed back ${handedBack.length} time(s) — ${result.attempts ?? '?'} requests in total:`);
    for (const r of handedBack) console.log(`  - ${r.split('\n')[0].slice(0, 120)}`);
  } else if (result.code.notes.length === 0) {
    console.log('first reply built and passed the style audit — one request');
  }
  console.log(`\nsee it:  http://localhost:5173/forge.html?creature=${slug}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
