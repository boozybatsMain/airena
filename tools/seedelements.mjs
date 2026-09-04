#!/usr/bin/env node
/**
 * БОЙЦЫ ПОД КАЖДУЮ СТИХИЮ — НАСТОЯЩИМ КОНВЕЙЕРОМ, А НЕ РУКАМИ.
 *
 * ── зачем ещё один сид ─────────────────────────────────────────────────────
 *
 * `seedvfx.mjs` ставит демо-бойцов с ЯВНО ЗАПИСАННЫМ набором и рукописным
 * мозгом-заглушкой: он проверяет, что модуль эффектов рисует все свои формы.
 * Это проверка ВЬЮВЕРА, и она ничего не говорит про то, что случится, когда
 * существо той же стихии соберёт МОДЕЛЬ по описанию игрока.
 *
 * А заказ основателя 04.09 именно про это: «чтобы в следующий раз, как бы я
 * ни создавал существо, оно всегда генерировалось с правильными скиллами и
 * вело себя умно». Проверить такое можно только тем путём, которым ходит
 * игрок: описание → разбор моделью → набор → мозг → тело → живой бой. Здесь
 * этот путь и запускается, по одному описанию на стихию плюс смеси.
 *
 * ── что считается «правильными скиллами» ──────────────────────────────────
 *
 * Не «красивыми»: проверяемо. Инструмент печатает по каждому существу три
 * вещи и в них видно всё, что могло пойти не так:
 *
 *   1. ПОПАЛА ЛИ СТИХИЯ. Описание называет холод — сколько умений вышло на
 *      `frost`. Ноль значит, что словарь стихий модель не прочла (или что
 *      стихия не выпущена — с 04.09 выпущены девять из десяти (время закрыто)).
 *   2. ЗАКОНЕН ЛИ НАБОР ЦЕЛИКОМ, включая правило E1 (у времени не бывает
 *      луча) и `element_unreleased`. Конвейер чинит слот сам, но починка —
 *      это событие, а не норма, и она печатается словом «чинено».
 *   3. ЕСТЬ ЛИ ЧЕМ ЗАКОНЧИТЬ БОЙ (правило L2). Существо из трёх умений
 *      контроля не проигрывает — оно не заканчивает.
 *
 * ── деньги ────────────────────────────────────────────────────────────────
 *
 * Одно существо на `google/gemini-3.7-flash:plain` — $0.069 по замеру каталога
 * (тело $0.051 + мозг $0.018). Инструмент печатает потраченное после каждого
 * и останавливается на `--budget` (по умолчанию $2.50), потому что «кончились
 * деньги посреди прогона» — это не ошибка, которую надо ловить логами.
 *
 *   node --env-file-if-exists=.env tools/seedelements.mjs
 *   node --env-file-if-exists=.env tools/seedelements.mjs --only=gravity,frost
 *   node --env-file-if-exists=.env tools/seedelements.mjs --mixes --budget=1.5
 *   AIRENA_SUB_MODELS=1 node tools/seedelements.mjs --bundle=sub:opus:plain
 *   node tools/seedelements.mjs --dry
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { constantsVersion } from '../src/core/version.js';
import { create as createCreature } from '../src/server/creatures.js';
import { openDb } from '../src/server/db.js';
import { buildCatalog } from '../src/server/forge/models.js';
import { forgeCreature } from '../src/server/forge/pipeline.js';
import { ELEMENTS, damagingCount, validateKit } from '../src/skills/registry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  if (h) return h.slice(n.length + 3);
  return process.argv.includes(`--${n}`) ? true : d;
};

const DB_FILE = String(arg('db', process.env.AIRENA_DB || join(ROOT, 'data/airena.db')));
const BUNDLE = String(arg('bundle', 'google/gemini-3.7-flash:plain'));
const BUDGET = Number(arg('budget', 2.5));
const ONLY = String(arg('only', '') || '').split(',').filter(Boolean);
const DRY = !!arg('dry', false);
const WITH_MIXES = !!arg('mixes', false);

/*
 * ОПИСАНИЯ НЕ НАЗЫВАЮТ НИ ОДНОГО ИМЕНИ ИЗ ГРАММАТИКИ — И ЭТО ВЕСЬ СМЫСЛ.
 *
 * Написать «возьми element: gravity, delivery: zone» значит проверить, умеет
 * ли модель копировать. Проверяется другое: прочитает ли она ОБРАЗ и найдёт
 * ли под него стихию сама. Поэтому в тексте есть «тяжесть», «вес», «к земле»
 * — и нет слова gravity, нет слова zone, нет ни одного эффекта по имени.
 *
 * `want` — то, что мы ждём увидеть в наборе. Это ожидание прогона, а не
 * правило грамматики: модель имеет право взять чужую стихию, если так честнее
 * читается описание, и промах печатается как промах, а не как отказ.
 */
const ROSTER = [
  {
    el: 'gravity', rating: 1220,
    prompt: 'Курган: не бьёт, а придавливает. Всё, что рядом с ним, становится тяжелее и тянется к земле; он сам стоит как якорь и не сходит с места.',
  },
  {
    el: 'frost', rating: 1230,
    prompt: 'Стужа: выстуживает воздух вокруг себя, сковывает противника наледью и делает его хрупким. Дерётся холодом, а не силой.',
  },
  {
    el: 'ember', rating: 1240,
    prompt: 'Домна: раскалённая туша, от которой всё вокруг занимается. Подходит вплотную и оставляет противника гореть.',
  },
  {
    el: 'void', rating: 1210,
    prompt: 'Прореха: там, где он бьёт, ткань мира расходится. Отнимает у противника голос и волю отдавать команды, сам почти неосязаем.',
  },
  {
    el: 'arc', rating: 1250,
    prompt: 'Грозобой: копит заряд и разряжает его в прямую линию. Быстрый, лёгкий, держит дистанцию и бьёт первым.',
  },
  {
    el: 'acid', rating: 1200,
    prompt: 'Травильщик: плюётся едкой дрянью, которая разъедает броню и продолжает жечь. Всё, во что он попал, теряет защиту.',
  },
  {
    el: 'radiation', rating: 1190,
    prompt: 'Могильник: течёт заражением. Там, где он прошёл, воздух сыпется на противника и слепит его; сам он терпелив и живуч.',
  },
  /*
   * ВРЕМЕНИ ЗДЕСЬ БОЛЬШЕ НЕТ, И ЭТО НЕ ЗАБЫТАЯ СТРОКА.
   *
   * Стихия закрыта флагом `unreleased` по прямому заказу основателя («чтобы
   * времени вообще не было в скиллах, чтобы никто не мог создать время»).
   * Сид пришлось бы удалять в любом случае: словарь, который уходит модели,
   * времени больше не называет, а если модель угадает его сама, последний
   * рубеж кузницы подменит ВЕСЬ набор стартовым. То есть прогон этой строки
   * стоил бы живых денег и дал бы существо не той стихии — худший вид
   * молчаливого провала: сид отработал, счёт списан, проверено ничего.
   */
  {
    el: 'laser', rating: 1260,
    prompt: 'Резак: одна красная линия навылет. Ничего лишнего: точный дальний выстрел, тонкое тело, никакой брони.',
  },
  {
    el: 'kinetic', rating: 1215,
    prompt: 'Кувалда: чистая механика. Сшибает с ног, оглушает и добивает; ни огня, ни магии, только масса и удар.',
  },
];

/*
 * ПОДПИСКА — отдельный список, и он короткий НАРОЧНО.
 *
 * Заказ основателя: «в конце можешь попробовать Opus или Fable с подписки —
 * просто из любопытства, посмотреть, как эти модели думают». Любопытство
 * измеряется сравнением, а сравнивать можно только одинаковое: описания здесь
 * — те же два образа, что уже прошли через Gemini (тяжесть и смесь), чтобы
 * разница в наборе была разницей МОДЕЛИ, а не разницей задания.
 *
 *   AIRENA_SUB_MODELS=1 node tools/seedelements.mjs --sub --bundle=sub:opus:plain
 */
const SUBS = [
  { el: 'sub', rating: 1280, prompt: 'Курган: не бьёт, а придавливает. Всё, что рядом с ним, становится тяжелее и тянется к земле; он сам стоит как якорь и не сходит с места.' },
  { el: 'sub', rating: 1270, prompt: 'Часовщик-громовержец: замедляет всё вокруг себя и бьёт молнией по замедленному. Хрупкий, но всегда успевает первым.' },
];

/* СМЕСИ — вторая половина заказа: «потом попробуй смешать». Каждое описание
   называет ДВА образа, и интересно ровно то, разведёт ли модель их по разным
   умениям или свалит в одно. */
const MIXES = [
  { el: 'mix', rating: 1235, prompt: 'Пепел и наледь: одна рука жжёт, вторая выстуживает. Бьёт по очереди, чтобы противник не успевал привыкнуть ни к тому, ни к другому.' },
  { el: 'mix', rating: 1245, prompt: 'Тяжёлый реактор: придавливает противника к земле и тут же заражает придавленного. Медленный, огромный, живучий.' },
  { el: 'mix', rating: 1225, prompt: 'Кислотный резак: сначала снимает броню едкой струёй, потом прожигает насквозь тонким красным лучом.' },
  { el: 'mix', rating: 1205, prompt: 'Часовщик-громовержец: замедляет всё вокруг себя и бьёт молнией по замедленному. Хрупкий, но всегда успевает первым.' },
];

const WITH_SUBS = !!arg('sub', false);
const plan = (WITH_SUBS ? SUBS : [...ROSTER, ...(WITH_MIXES ? MIXES : [])])
  .filter((r) => !ONLY.length || ONLY.includes(r.el));

if (!process.env.OPENROUTER_API_KEY && !String(BUNDLE).startsWith('sub:')) {
  console.error('\n  OPENROUTER_API_KEY не задан — конвейер провалит каждую генерацию.');
  console.error('  запусти так:  node --env-file-if-exists=.env tools/seedelements.mjs\n');
  process.exit(1);
}

const cat = await buildCatalog();
const bundle = cat.bundles.find((b) => b.bundle === BUNDLE);
if (!bundle) {
  console.error(`\n  связки «${BUNDLE}» нет в каталоге. Доступны:`);
  for (const b of cat.bundles) console.error(`    ${b.bundle}  [${b.tier}]`);
  process.exit(1);
}

console.log('\n  БОЙЦЫ ПОД СТИХИИ — ЧЕРЕЗ КОНВЕЙЕР ИГРОКА\n');
console.log(`  база      ${DB_FILE}`);
console.log(`  связка    ${bundle.bundle}  [${bundle.tier}]  ~$${bundle.creatureUsd} за существо`);
console.log(`  бюджет    $${BUDGET.toFixed(2)}`);
console.log(`  сделать   ${plan.length}\n`);
for (const r of plan) console.log(`    ${r.el.padEnd(10)} ${r.prompt.slice(0, 72)}`);
if (DRY) { console.log('\n  --dry: ничего не сделано\n'); process.exit(0); }

const db = openDb(DB_FILE);
let spent = 0;
const made = [];

for (const r of plan) {
  if (spent + Number(bundle.creatureUsd || 0.1) > BUDGET) {
    console.log(`\n  СТОП по бюджету: потрачено $${spent.toFixed(3)} из $${BUDGET.toFixed(2)}\n`);
    break;
  }
  const t0 = Date.now();
  process.stdout.write(`\n  ${r.el.toUpperCase()}\n    `);
  let out;
  try {
    out = await forgeCreature({ prompt: r.prompt, bundle, catalog: cat, onStage: () => {} });
  } catch (e) {
    console.log(`провал: ${String(e.message).slice(0, 80)}`);
    spent += e.costUsd || 0;
    continue;
  }
  spent += out.costUsd || 0;
  if (!out.ok) { console.log(`провал: ${out.code} — ${out.message || ''}`); continue; }

  /*
   * ПЕРЕСЕВ ТЕМ ЖЕ ИМЕНЕМ — ЗАМЕНА, НЕ ДУБЛЬ (приём из `seedvfx.mjs`).
   * Прежний СПИСЫВАЕТСЯ, а не удаляется: на него ссылаются сыгранные бои.
   *
   * КРОМЕ ПРОГОНА ПОДПИСКИ. Он нарочно берёт ТЕ ЖЕ описания, что уже прошли
   * через Gemini, — сравнивать можно только одинаковое, — и списать первого
   * значило бы уничтожить ровно ту половину сравнения, ради которой прогон и
   * затевался. Поэтому там имя РАЗВОДИТСЯ пометкой семьи, а обе записи живут.
   */
  let name = out.name;
  const clash = () => db.prepare(
    `SELECT id, prompt FROM creature WHERE name = ? AND owner_id IS NULL AND state = 'active'`,
  ).all(name);
  /*
   * СПИСЫВАЕТСЯ ТОЛЬКО ТЁЗКА ПО ТОМУ ЖЕ ОПИСАНИЮ. Первая версия списывала по
   * ИМЕНИ, и это уже стоило одного бойца: смесь «кислотный резак» модель
   * назвала РЕЗАКОМ, и списанным оказался лазерный РЕЗАК из той же волны —
   * то есть прогон уничтожил половину собственного результата. Имя выбирает
   * модель, оно не ключ; ключ — описание, по которому существо сделано.
   */
  const mark = WITH_SUBS ? (bundle.bundle.split(':')[1] || 'sub').toUpperCase() : '';
  for (const row of clash()) {
    if (!WITH_SUBS && row.prompt === r.prompt) {
      db.prepare(`UPDATE creature SET state = 'retired', updated_at = ? WHERE id = ?`).run(Date.now(), row.id);
    }
  }
  if (clash().filter((row) => row.prompt !== r.prompt || WITH_SUBS).length) {
    name = `${name} ${mark || String(r.el).toUpperCase()}`.slice(0, 22);
  }

  const c = createCreature(db, {
    ownerId: null,
    name,
    archetype: out.archetype,
    bodyRef: out.bodyRef,
    bodySource: out.bodySource,
    bodySafe: out.bodySafe,
    bodyDraws: out.bodyDraws,
    kit: out.kit,
    brainSource: out.brainSource,
    brainModel: out.brainModel,
    constantsVersion: constantsVersion(),
    prompt: r.prompt,
    unfit: out.unfit,
    tacticsCard: out.tacticsCard,
    vfxIr: out.vfxIr,
    birthNote: out.note,
    size: out.size,
    kitActive: true,
    /* ИГРОВОЕ, а не библиотечное: боевой цикл сам подберёт ему соперника и
       выведет бой в трансляцию — это и есть «настоящий бой» из заказа. */
    isLibrary: false,
    rating: r.rating,
  });

  /* ── что получилось: три проверки из шапки ───────────────────────────── */
  const kit = out.kit || [];
  const els = kit.map((s) => s.element);
  /* У смеси и у прогона подписки «попадание» — это РАЗНООБРАЗИЕ (сколько
     разных стихий модель развела по умениям), а не совпадение с одной: ни
     `mix`, ни `sub` не имена стихий, и считать по ним «сколько умений вышло
     на стихию sub» — значит печатать ноль при безупречном наборе. */
  const byVariety = r.el === 'mix' || r.el === 'sub';
  const hit = byVariety ? new Set(els).size : els.filter((x) => x === r.el).length;
  const bad = validateKit(kit);
  const dmg = damagingCount(kit);
  const repaired = (out.unfit || []).filter((u) => /стихия заменена|не удалось собрать/.test(u.why || '')).length;

  made.push({ id: c.id, name: c.name, el: r.el, hit, bad: bad.length, dmg, kit });
  console.log(`${String(c.name).padEnd(20)} ${((Date.now() - t0) / 1000).toFixed(0)}с  $${spent.toFixed(3)}`);
  console.log(`    id ${c.id}`);
  for (const s of kit) {
    const e = ELEMENTS[s.element];
    console.log(`      ${String(s.delivery).padEnd(6)} ${s.effects.join('+').padEnd(22)} ${s.element}${e ? ` (${e.ru})` : ' — НЕТ ТАКОЙ'}`);
  }
  console.log(`    стихия ${byVariety ? `${hit} разных` : `${hit}/3 умений`}`
    + ` · грамматика ${bad.length ? `НАРУШЕНА (${bad.map((b) => b.code).join(',')})` : 'чиста'}`
    + ` · урона ${dmg}${dmg ? '' : ' — БОЙ НЕ ЗАКОНЧИТЬ'}`
    + (repaired ? ` · чинено слотов: ${repaired}` : ''));
}

console.log('\n  ИТОГ\n');
console.log(`  сделано ${made.length} из ${plan.length}, потрачено $${spent.toFixed(3)}`);
const missed = made.filter((m) => !m.hit);
const illegal = made.filter((m) => m.bad);
const toothless = made.filter((m) => !m.dmg);
console.log(`  стихия не попала: ${missed.length ? missed.map((m) => m.name).join(', ') : 'нет'}`);
console.log(`  грамматика нарушена: ${illegal.length ? illegal.map((m) => m.name).join(', ') : 'нет'}`);
console.log(`  нечем закончить бой: ${toothless.length ? toothless.map((m) => m.name).join(', ') : 'нет'}`);
console.log('\n  ссылки (дев-сервер 8787):');
for (const m of made) console.log(`    ${m.el.padEnd(10)} ${m.name.padEnd(20)} http://localhost:8787/#/creature/${m.id}`);
console.log('');
