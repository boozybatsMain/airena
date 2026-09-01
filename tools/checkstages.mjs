/**
 * Гейт экрана ожидания: рельс стадий не расходится с сервером.
 *
 *   node tools/checkstages.mjs
 *   node tools/checkstages.mjs --falsify
 *
 * ЗАЧЕМ. Экран ожидания занимает 60–180 секунд первой сессии — самое длинное
 * окно и окно наибольшего отвала (§10.3). Он сопоставлял русскую подпись
 * сервера своими регекспами, и один промахнулся: клиент искал «мозг пишет»,
 * сервер писал «модель пишет мозг». Рельс на САМОЙ ДЛИННОЙ стадии откатывался
 * на шаг назад и стоял там минуты — игра показывала, что дела идут хуже, чем
 * идут, ровно там, где человек решает, ждать ли.
 *
 * Ошибка не ловится ничем: обе строки валидны, обе по-русски, тест на них не
 * смотрит, а увидеть можно только досидев до конца настоящей генерации.
 * Поэтому проверка тут, и она про КОДЫ: у каждой стадии сервера обязан быть
 * свой шаг на экране, и наоборот.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STAGE_RU } from '../src/server/jobs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FALSIFY = process.argv.includes('--falsify');
let bad = 0;
const ok = (name, pass, note) => {
  console.log(`  ${pass ? '✓' : '✗'} ${name}${note ? `  ${note}` : ''}`);
  if (!pass) bad++;
};

/** Достать список шагов из `wait.js`, разобрав литерал STAGES. */
function clientStages(src) {
  const m = src.match(/const STAGES = \[([\s\S]*?)\n\];/);
  if (!m) return null;
  const out = [];
  for (const row of m[1].matchAll(/\[\s*'([^']*)'\s*,\s*\[([^\]]*)\]/g)) {
    out.push({ ru: row[1], codes: [...row[2].matchAll(/'([^']+)'/g)].map((x) => x[1]) });
  }
  return out;
}

const src = readFileSync(join(ROOT, 'src/client/screens/wait.js'), 'utf8');
const stages = clientStages(src);

console.log('\n  ГЕЙТ ЭКРАНА ОЖИДАНИЯ\n');
ok('рельс стадий разбирается', !!stages && stages.length > 0, `${stages?.length ?? 0} шагов`);

if (stages) {
  const clientCodes = new Set(stages.flatMap((s) => s.codes));
  const serverCodes = Object.keys(STAGE_RU);

  /*
   * ── СНАЧАЛА: ЧТО СЕРВЕР ВООБЩЕ ШЛЁТ ───────────────────────────────────────
   *
   * Гейт сравнивал рельс со СЛОВАРЁМ `STAGE_RU`, а не с местами, где стадия
   * действительно отправляется. Между ними может быть расхождение, и оно
   * случилось в ту же волну, что этот комментарий: `pipeline.js` начал слать
   * `onStage('body_retry')`, в словаре ключа не было, и `jobs.js` отдавал
   * игроку сырое `body_retry` латиницей — а рельс, не зная кода, откатывался
   * на первый шаг. На самой длинной стадии генерации.
   *
   * Гейт при этом был зелёным: обе стороны, которые он сравнивал, о новой
   * стадии не знали. Проверка, слепая к источнику события, проверяет
   * согласие двух копий, а не правду.
   */
  const emitted = [...readFileSync(join(ROOT, 'src/server/forge/pipeline.js'), 'utf8')
    .matchAll(/onStage\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
  const uniqEmitted = [...new Set(emitted)];
  const noRu = uniqEmitted.filter((c) => !serverCodes.includes(c));
  ok('у каждой отправляемой стадии есть подпись', noRu.length === 0,
    noRu.length ? `без подписи: ${noRu.join(', ')}` : `${uniqEmitted.length} стадий шлёт конвейер`);
  const noRail = uniqEmitted.filter((c) => !clientCodes.has(c));
  ok('каждая отправляемая стадия попадает на шаг рельса', noRail.length === 0,
    noRail.length ? `не на рельсе: ${noRail.join(', ')}` : `${uniqEmitted.length} стадий`);

  /* `queued` — состояние задания, а не стадия работы: сервер его в STAGE_RU
     не держит, но рельс обязан с него начинаться. */
  const unknown = [...clientCodes].filter((c) => c !== 'queued' && !serverCodes.includes(c));
  ok('клиент не ждёт стадий, которых сервер не шлёт', unknown.length === 0,
    unknown.length ? unknown.join(', ') : `${clientCodes.size} кодов`);

  const unshown = serverCodes.filter((c) => !clientCodes.has(c));
  ok('каждая стадия сервера попадает на свой шаг', unshown.length === 0,
    unshown.length ? `не показаны: ${unshown.join(', ')}` : `${serverCodes.length} стадий`);

  /*
   * ГЛАВНОЕ: РЕЛЬС ИДЁТ ТОЛЬКО ВПЕРЁД.
   *
   * Порядок кодов на экране обязан совпадать с порядком, в котором сервер их
   * проходит. Именно это и сломалось: шаг находился не тот, и полоса ехала
   * назад. Порядок сервера берётся из `STAGE_RU` — он объявлен в том порядке,
   * в котором стадии случаются.
   */
  const serverOrder = serverCodes;
  const clientOrder = stages.flatMap((s, i) => s.codes.map((c) => [c, i]));
  let monotone = true; let last = -1; const back = [];
  for (const c of serverOrder) {
    const row = clientOrder.find(([code]) => code === c);
    if (!row) continue;
    if (row[1] < last) { monotone = false; back.push(c); }
    last = Math.max(last, row[1]);
  }
  ok('рельс идёт только вперёд', monotone,
    monotone ? `${serverOrder.length} стадий по порядку` : `назад на: ${back.join(', ')}`);

  /*
   * Запасной путь по прозе обязан работать для КАЖДОЙ подписи сервера:
   * задания, начатые до появления колонки `stage_code`, кода не имеют.
   */
  const reRows = [...src.matchAll(/\[\s*'[^']*'\s*,\s*\[[^\]]*\]\s*,\s*(\/[^/]+\/)\]/g)]
    .map((m2, i) => ({ i, re: new RegExp(m2[1].slice(1, -1)) }));
  const missed = [];
  for (const [code, ru] of Object.entries(STAGE_RU)) {
    const wantedStep = stages.findIndex((s) => s.codes.includes(code));
    const gotStep = reRows.findIndex((r) => r.re.test(ru));
    if (gotStep !== wantedStep) missed.push(`${code} («${ru}») → шаг ${gotStep}, а нужен ${wantedStep}`);
  }
  ok('запасной разбор по подписи ведёт на тот же шаг', missed.length === 0,
    missed.length ? missed.join('; ') : `${Object.keys(STAGE_RU).length} подписей`);
}

if (FALSIFY) {
  console.log('\n  --falsify: возвращаем ту самую поломку\n');
  /* Ровно та строка, что стояла в коде и промахивалась. */
  const broken = /мозг пишет|попытк/;
  ok('старый регексп не находил «модель пишет мозг»', !broken.test(STAGE_RU.brain),
    `подпись сервера: «${STAGE_RU.brain}»`);
  const shuffled = clientStages(src.replace("['тело рисуется', ['body']", "['тело рисуется', ['parse']"));
  const codes = new Set(shuffled.flatMap((s) => s.codes));
  ok('гейт заметил бы пропавшую стадию', !codes.has('body'), 'body исчез из рельса');
}

// ── два списка «наша поломка» не расходятся ───────────────────────────────
{
  /*
   * `OUR_FAULT` живёт в двух местах: сервер считает по нему суточный лимит,
   * экран ожидания — пишет по нему «дневной лимит не тронут». Клиент не может
   * импортировать серверный модуль (тот тянет базу), поэтому копия
   * неизбежна — а всякая копия однажды расходится молча, и разойдётся она в
   * сторону «игроку сказали, что лимит цел, а он списан».
   */
  const { OUR_FAULT } = await import('../src/server/limits.js');
  const src = readFileSync(join(ROOT, 'src/client/screens/wait.js'), 'utf8');
  const m = src.match(/const OUR_FAULT = \[([\s\S]*?)\];/);
  const client = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : null;
  ok('список «наша поломка» одинаков на сервере и в клиенте',
    !!client && client.join(',') === OUR_FAULT.join(','),
    client ? `${client.length} против ${OUR_FAULT.length}` : 'список не найден в wait.js');
}

console.log(bad ? `\n  ПРОВАЛ: ${bad}\n` : '\n  ДЕРЖИТ\n');
process.exit(bad ? 1 : 0);
