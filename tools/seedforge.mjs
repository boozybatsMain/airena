/**
 * Заселить библиотеку СУЩЕСТВАМИ ГРАММАТИКИ — через конвейер, а не из `brains/`.
 *
 * ── ЗАЧЕМ, ЕСЛИ ЕСТЬ `seed.mjs` ───────────────────────────────────────────
 *
 * `seed.mjs` берёт мозги из репозитория. Все они написаны ПРОТИВ ЧЕТЫРЁХ
 * ЗАХАРДКОЖЕННЫХ УМЕНИЙ — это их ценность (на них измерены §1 и §16) и это же
 * их граница: такое существо не знает имён `k1..k3`, поэтому `kit_active` у
 * него ноль, а `kitOf` отдаёт `null`, и в бой оно выходит на архетипном наборе
 * вместе с бесплатным прыжком.
 *
 * После D160 это стало видно на экране. Основатель просил, чтобы у существа
 * было ровно три умения; у существа ИГРОКА их теперь три, а у соперника из
 * библиотеки — четыре, и одно из них ровно то, которое просили убрать.
 * Замерено 01.09: 21 из 27 активных существ дерутся без кита.
 *
 * Починить это переключением флага нельзя: мозг, которому выдали `k1..k3`
 * вместо `laser`, получает отказ на каждый вызов и стоит столбом. Значит
 * библиотеке нужны СВОИ существа грамматики, и сделать их может только тот же
 * конвейер, что делает существа игроков.
 *
 * ── ЧТО ЭТОТ ФАЙЛ НЕ ДЕЛАЕТ ──────────────────────────────────────────────
 *
 * Он ничего не удаляет. Измеренные тренировочные пары (`kv.training.ids`) и
 * калибровка §16 стоят на старой библиотеке, и сносить её ради вида — это
 * потерять замер ради картинки. Новые существа ДОБАВЛЯЮТСЯ; кого показывать
 * первым, решает витрина, у которой предпочтение по `kit_active` уже есть.
 *
 * КЛЮЧ. Конвейер ходит в OpenRouter на нашем ключе (E4), а инструмент — не
 * сервер и `.env` сам не читает. Без ключа каждая генерация падает мгновенно
 * и одинаково, поэтому проверка стоит первой строкой, а не в шестом отказе:
 *
 *   node --env-file-if-exists=.env tools/seedforge.mjs
 *
 *   node tools/seedforge.mjs                       шесть существ по умолчанию
 *   node tools/seedforge.mjs --n=3                 сколько сделать
 *   node tools/seedforge.mjs --bundle=<id>         какой связкой
 *   node tools/seedforge.mjs --dry                 показать план и выйти
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { constantsVersion } from '../src/core/version.js';
import { create as createCreature } from '../src/server/creatures.js';
import { openDb } from '../src/server/db.js';
import { buildCatalog } from '../src/server/forge/models.js';
import { forgeCreature } from '../src/server/forge/pipeline.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  if (h) return h.slice(n.length + 3);
  return process.argv.includes(`--${n}`) ? true : d;
};

const DB_FILE = String(arg('db', process.env.AIRENA_DB || join(ROOT, 'data/airena.db')));
const WANT = Number(arg('n', 6));
/* `--from=N` — начать не с первого описания: вторая волна не должна
   перегенерировать то, что уже стоит в библиотеке. */
const FROM = Number(arg('from', 0));
const DRY = !!arg('dry', false);
const BUNDLE = String(arg('bundle', 'z-ai/glm-5.3-flash:plain'));

/**
 * Описания — РАЗНЫЕ ПО ОСЯМ, а не по вкусу.
 *
 * Библиотека нужна игроку как набор непохожих соперников, и «непохожий» здесь
 * значит конкретное: другой архетип, другой размер, другой способ побеждать.
 * Поэтому список составлен так, чтобы модель почти наверняка развела их по
 * трём осям сразу — и чтобы среди них были и ближний бой, и дистанция, и
 * контроль, и живучесть.
 *
 * Стартовый рейтинг тоже разный: библиотека, вся стоящая на 1200, превращает
 * подбор по рейтингу в лотерею, а лестницу — в плоскость.
 */
const SEEDS = [
  { prompt: 'Богомол-косильщик: подпускает вплотную и рубит широким взмахом', rating: 1240 },
  { prompt: 'Дозорная башня: не сходит с места, бьёт точно и очень далеко', rating: 1210 },
  { prompt: 'Пепельный волк: гоняет по арене, поджигает и не даёт отдышаться', rating: 1270 },
  { prompt: 'Трюмный краб: прячется за укрытиями, ставит преграды и лечится', rating: 1180 },
  { prompt: 'Ртутный угорь: скользкий, мигает из-под удара, бьёт исподтишка', rating: 1230 },
  { prompt: 'Соляной бык: тяжёлый таран, сносит с ног и давит массой', rating: 1200 },
  { prompt: 'Стеклянный богомол: хрупкий, но бьёт первым и очень больно', rating: 1150 },
  { prompt: 'Болотный ткач: опутывает, слепит и вытягивает бой во времени', rating: 1190 },
  /*
   * ВТОРАЯ ВОЛНА — ПРОТИВ ПУСТОГО ЯРУСА, А НЕ РАДИ РАЗНООБРАЗИЯ.
   *
   * Витрина (`showcase.pick`) берёт соперников ярусами и первым ярусом хочет
   * «с набором и написан моделью». Замерено 01.09: в этом ярусе было три
   * осьминога и четыре гориллы на всю библиотеку. Двое заняты текущим боем —
   * и ярус пуст, выбор проваливается на следующий, где живёт выводок без
   * наборов. Отсюда обе жалобы основателя разом: «одни и те же два тела» и
   * «прыжок почти у всех» (существо без набора дерётся тройкой §1, где прыжок
   * бесплатный).
   *
   * Поэтому вторая волна не про новые идеи, а про ЁМКОСТЬ ЯРУСА, и она
   * поровну разложена по архетипам: пара подбирается осьминог против гориллы,
   * и перекос в одну сторону оставляет вторую пустой ровно так же.
   *
   * Про прыжок в описаниях нет ни слова НАРОЧНО. Основатель просил, чтобы
   * прыжок брался, только если модель сама так решила; подсказать его здесь
   * значило бы получить ответ, который мы сами и продиктовали.
   */
  /* лёгкие и дальнобойные — уходят в архетип octopus */
  { prompt: 'Стеклянная оса: крошечная, быстрая, жалит издали и не подпускает', rating: 1160 },
  { prompt: 'Пыльный шептун: сбивает прицел, гасит чужие команды и уходит', rating: 1220 },
  { prompt: 'Искровой змей: бьёт молнией по прямой, держит дальнюю дистанцию', rating: 1250 },
  { prompt: 'Солевой мираж: мигает с места на место и режет по одному', rating: 1200 },
  /* тяжёлые и ближние — уходят в архетип gorilla */
  { prompt: 'Литейный кулак: подходит вплотную, оглушает и добивает', rating: 1260 },
  { prompt: 'Ржавый вал: огромный, медленный, ставит преграды и держит центр', rating: 1170 },
  { prompt: 'Угольный медведь: поджигает всё вокруг себя и лечится от ожогов', rating: 1240 },
  { prompt: 'Костяной страж: не отходит от места, накрывает площадь и терпит', rating: 1190 },
];

if (!process.env.OPENROUTER_API_KEY) {
  console.error('\n  OPENROUTER_API_KEY не задан — конвейер провалит каждую генерацию.');
  console.error('  запусти так:  node --env-file-if-exists=.env tools/seedforge.mjs\n');
  process.exit(1);
}

const db = openDb(DB_FILE);
const cat = await buildCatalog();
const bundle = cat.bundles.find((b) => b.bundle === BUNDLE);
if (!bundle) {
  console.error(`  связки «${BUNDLE}» нет в каталоге. Доступны:`);
  for (const b of cat.bundles) console.error(`    ${b.bundle}  [${b.tier}]`);
  process.exit(1);
}

const already = db.prepare(
  "SELECT count(*) n FROM creature WHERE is_library = 1 AND kit_active = 1 AND state = 'active'",
).get().n;
const plan = SEEDS.slice(FROM, FROM + WANT);

console.log(`\n  ЗАСЕЛЕНИЕ БИБЛИОТЕКИ ГРАММАТИКОЙ\n`);
console.log(`  база      ${DB_FILE}`);
console.log(`  связка    ${bundle.bundle}  [${bundle.tier}]`);
console.log(`  уже есть  ${already} библиотечных существ с набором`);
console.log(`  сделать   ${plan.length}\n`);
for (const s of plan) console.log(`    ${String(s.rating).padStart(4)}  ${s.prompt}`);
if (DRY) { console.log('\n  --dry: ничего не сделано\n'); process.exit(0); }

/*
 * ПОСЛЕДОВАТЕЛЬНО, А НЕ ПАРАЛЛЕЛЬНО.
 *
 * Каждое существо — это пять вызовов модели и два прогона тела в изоляте.
 * Параллельный запуск шести штук упирается в лимит провайдера и в память
 * изолятов, а выигрыш по времени съедается повторами. Инструмент разовый,
 * и десять минут ожидания дешевле одного проваленного заселения.
 */
let made = 0;
for (const s of plan) {
  const t0 = Date.now();
  process.stdout.write(`  ${s.prompt.slice(0, 44).padEnd(46)}`);
  let out;
  try {
    out = await forgeCreature({
      prompt: s.prompt,
      bundle,
      catalog: cat,
      onStage: () => {},
    });
  } catch (e) {
    console.log(`провал: ${String(e.message).slice(0, 60)}`);
    continue;
  }
  if (!out.ok) { console.log(`провал: ${out.code}`); continue; }

  const c = createCreature(db, {
    ownerId: null,
    name: out.name,
    archetype: out.archetype,
    bodyRef: out.bodyRef,
    bodySource: out.bodySource,
    bodySafe: out.bodySafe,
    bodyDraws: out.bodyDraws,
    kit: out.kit,
    brainSource: out.brainSource,
    brainModel: out.brainModel,
    constantsVersion: constantsVersion(),
    prompt: s.prompt,
    unfit: out.unfit,
    tacticsCard: out.tacticsCard,
    vfxIr: out.vfxIr,
    birthNote: out.note,
    size: out.size,
    /* Мозг написан по промпту С НАБОРОМ — значит в бою он дерётся набором. */
    kitActive: true,
    /* Библиотечное: рейтинг не двигается (эталон, который дрейфует, перестаёт
       быть эталоном), но победы и поражения считаются. */
    isLibrary: true,
    rating: s.rating,
  });
  made++;
  const kit = out.kit.map((k) => `${k.delivery}·${k.effects.join('+')}`).join(' ');
  console.log(`${String(c.name).padEnd(20)} ${((Date.now() - t0) / 1000).toFixed(0)}с  ${kit}`);
}

console.log(`\n  готово: ${made} из ${plan.length}\n`);
