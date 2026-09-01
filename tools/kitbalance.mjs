/**
 * Баланс наборов умений — замер, а не мнение.
 *
 * ПРОБЛЕМА, РАДИ КОТОРОЙ ЭТОТ ФАЙЛ СУЩЕСТВУЕТ. Балансировать умение по
 * исходам боёв нельзя, если по разные стороны стоят разные МОЗГИ: акула с
 * базукой выигрывает десять из десяти на умной модели, базуке режут кулдаун,
 * и теперь на умной модели пять из пяти — а на глупой те же пять из десяти,
 * потому что глупая и так не попадала. Порезали не базуку, а разницу между
 * моделями.
 *
 * РЕШЕНИЕ — три ограничения, каждое убирает одну переменную.
 *
 *   1. ОДИН МОЗГ по обе стороны: `brains/kit-stub`, который читает свой набор
 *      из перцепции (F10) и не знает ни одного имени умения заранее. Пилот
 *      сокращается. Это строже, чем «мерить на дешёвой модели»: там пилот всё
 *      ещё шумит, здесь его нет вовсе. И это бесплатно и детерминировано.
 *
 *   2. ОДНО ТЕЛО по обе стороны (симметричная арена, см. matchworker.mjs).
 *      Тела в игре разные нарочно, но для замера НАБОРА это шум, и шум
 *      подавляющий: с одинаковым набором и одинаковым мозгом горилла берёт
 *      24 из 24. Пока тело в уравнении, видна только та разница наборов,
 *      которая перевешивает разницу тел, — то есть почти никакая.
 *
 *   3. ЛИГА, а не эталон. Первая версия сравнивала каждый атом с одним
 *      контрольным набором и получила двенадцать нулей из четырнадцати: это
 *      измерение контрольного набора, а не атомов. Здесь каждый играет с
 *      каждым, и отдельным участником в лиге стоит ПУСТО — набор без третьего
 *      умения. Он даёт абсолютную привязку: «сколько атом добавляет к ничему»,
 *      а не только «кто кого».
 *
 * ПРОВЕРКА САМОГО ПРИБОРА. Одинаковые наборы на симметричной арене обязаны
 * давать ничью. Это первое, что печатает прогон: прибор, у которого есть
 * собственный перекос, меряет себя.
 *
 * ЧЕГО ЭТОТ ЗАМЕР НЕ ГОВОРИТ. Он меряет набор в руках ровного исполнителя.
 * Умение, которое требует плана — поставить стену и увести за неё, — здесь
 * недооценено, потому что kit-stub планов не строит. Это нижняя граница силы
 * набора, а не её оценка, и так и написано в отчёте.
 *
 *   node tools/kitbalance.mjs                 всё сразу
 *   node tools/kitbalance.mjs --atoms         лига четырнадцати эффектов
 *   node tools/kitbalance.mjs --deliveries    лига девяти доставок
 *   node tools/kitbalance.mjs --presets       стартовые наборы друг против друга
 *   node tools/kitbalance.mjs --rounds=8      сидов на пару и сторону
 */

import { POOL_SIZE, closePool, runJobs, superviseSelf } from './matchpool.mjs';

/* Надзиратель общий для всех приборов на пуле — см. `superviseSelf`. */
superviseSelf('KITBALANCE_CHILD');


import { DELIVERIES, EFFECTS, SELF_ALLOWED, costOf, validateSkill } from '../src/skills/registry.js';
import { KIT_PRESETS } from '../src/server/forge/pipeline.js';

const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  if (h) return h.slice(n.length + 3);
  return process.argv.includes(`--${n}`) ? true : d;
};
const ROUNDS = Number(arg('rounds', 6));
/*
 * `--real` — замер на НАСТОЯЩИХ телах и настоящих мозгах сторон.
 *
 * Симметричная арена нужна, чтобы мерить грамматику: она убирает тело и
 * пилота и оставляет один набор. Но у неё есть цена, и её надо назвать.
 * При равных скоростях ближний бой невозможно НАВЯЗАТЬ: тот, кто держит
 * дистанцию, держит её вечно, и любая короткая форма меряется как слабая
 * независимо от своей силы. В настоящей игре тела разные нарочно — горилла
 * и быстрее, и толще, потому что она и есть ближнее тело.
 *
 * Поэтому у прибора два режима. Симметричный отвечает «сколько стоит этот
 * набор сам по себе», настоящий — «что из этого получит игрок». Стартовые
 * наборы правильно смотреть во втором: игрок получает именно их, вместе с
 * телом.
 */
const REAL = !!arg('real', false);

const pct = (x) => (x === null ? '  —  ' : `${(x * 100).toFixed(1)}%`.padStart(6));
const bar = (x) => (x === null ? '' : '█'.repeat(Math.round(x * 26)).padEnd(26, '·'));
const skill = (delivery, effects, extra) => ({ delivery, effects, element: 'kinetic', ...extra });

/*
 * ОСНОВЫ ЛИГ — ОДНИМ МЕСТОМ, потому что их проверяет прибор.
 *
 * Проверка нейтральности гоняла `снаряд+конус`, а лига атомов давно мерила на
 * `луч+конус`: гейт свидетельствовал о наборе, которым никто не пользуется.
 * Проверка, тестирующая не то, что измеряют, — это не проверка, а её вид.
 */
/*
 * Основа лиги атомов — НАВЕС+КОНУС, и это выбрано замером, а не удобством.
 *
 * Требований к ней два: она обязана быть нейтральной (одинаковые наборы на
 * симметричной арене дают ничью) и обязана оставлять свободной ту доставку, на
 * которой испытывается атом.
 *
 * Прошлая основа, `луч+конус`, второе требование выполняла, а первое — нет:
 * 15 ничьих из 24. Луч бьёт мгновенно на всю арену, и кому первому откроется
 * линия взгляда, тот и выиграл; у летящего снаряда эта разница усредняется.
 * То есть таблица атомов, записанная в реестр, была снята перекошенным
 * прибором.
 *
 * Замерено по шести кандидатам (24 боя каждый):
 *     снаряд+конус 24/24 ✓   навес+конус 24/24 ✓   снаряд+навес 24/24 ✓
 *     навес+рывок  24/24 ✓   конус+рывок 20/24 ✗   луч+конус    15/24 ✗
 *
 * Взят `навес+конус`: нейтрален и оставляет свободными снаряд и зону — две
 * доставки, на которых атом и испытывается.
 */
export const ATOM_BASE = [skill('lob', ['damage']), skill('cone', ['damage'])];
export const DELIVERY_SUPPORT = [skill('self', ['heal'], { element: 'frost' })];

/**
 * Круговая лига: каждый участник против каждого, зеркально.
 *
 * Ничья — половина очка, а не выброшенный бой. Выбросить ничьи значило бы
 * записать «набор, который никого не может добить» в невиданные, тогда как
 * это про него самое главное.
 */
async function league(entries, label) {
  const jobs = [];
  const meta = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      for (let s = 0; s < ROUNDS; s++) {
        const seed = 900 + s * 7919;
        jobs.push({ a: entries[i].kit, b: entries[j].kit, seed, sym: !REAL });
        meta.push([i, j]);
        jobs.push({ a: entries[j].kit, b: entries[i].kit, seed, sym: !REAL });
        meta.push([j, i]);
      }
    }
  }
  process.stdout.write(`  ${label}: ${jobs.length} боёв на ${POOL_SIZE} воркерах`);
  const t = Date.now();
  const res = await runJobs(jobs, (d, n) => process.stdout.write(`\r  ${label}: ${d}/${n} боёв   `));
  const score = entries.map(() => ({ pts: 0, played: 0, errors: 0 }));
  for (let k = 0; k < res.length; k++) {
    const [oct, gor] = meta[k];
    /* Ошибка сборки принадлежит ОБОИМ участникам пары: сказать «не собрался
       осьминог» там, где не собрался соперник, — это назвать пострадавшим
       того, кто цел. Первая версия так и делала и печатала список из
       пятнадцати имён на одну сломанную сборку. */
    if (res[k] === 'error') { score[oct].errors++; score[gor].errors++; continue; }
    score[oct].played++; score[gor].played++;
    if (res[k] === 'octopus') score[oct].pts += 1;
    else if (res[k] === 'gorilla') score[gor].pts += 1;
    else { score[oct].pts += 0.5; score[gor].pts += 0.5; }
  }
  process.stdout.write(`\r  ${label}: ${jobs.length} боёв за ${Math.round((Date.now() - t) / 1000)} с      \n\n`);
  return entries.map((e, i) => ({
    ...e,
    rate: score[i].played ? score[i].pts / score[i].played : null,
    errors: score[i].errors,
  }));
}

/** Корреляция Пирсона «цена ↔ сила» по участникам, у которых есть цена. */
function priceFit(rows) {
  const r = rows.filter((o) => o.rate !== null && o.cost !== null);
  if (r.length < 3) return 0;
  const mx = r.reduce((s, o) => s + o.cost, 0) / r.length;
  const my = r.reduce((s, o) => s + o.rate, 0) / r.length;
  let num = 0; let dx = 0; let dy = 0;
  for (const o of r) { num += (o.cost - mx) * (o.rate - my); dx += (o.cost - mx) ** 2; dy += (o.rate - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

function table(rows, title) {
  console.log(`  ${title}`);
  const anchor = rows.find((o) => o.cost === null);
  const a = anchor && anchor.rate !== null ? anchor.rate : null;
  for (const o of rows) {
    let mark = '';
    if (o.cost === null) mark = ' ← привязка';
    else if (a !== null && o.rate !== null) {
      if (o.rate < a - 0.02) mark = ' ← ХУЖЕ, ЧЕМ НИЧЕГО';
      else if (o.rate < a + 0.06) mark = ' ← почти ничего не даёт';
    }
    console.log(`  ${o.label.padEnd(28)} ${(o.cost === null ? ' —' : String(o.cost)).padStart(3)}  ${pct(o.rate)}  ${bar(o.rate)}${mark}`);
  }
  const rates = rows.map((o) => o.rate).filter((x) => x !== null);
  console.log(`\n  разброс: ${((Math.max(...rates) - Math.min(...rates)) * 100).toFixed(1)} п.п.`);
  const fit = priceFit(rows);
  console.log(`  корреляция «цена ↔ сила»: ${fit.toFixed(2)}  ${fit > 0.35 ? '— цена что-то значит'
    : (fit < 0 ? '— ДОРОГОЕ СЛАБЕЕ ДЕШЁВОГО, прайс не защищается' : '— цена почти ни о чём не говорит')}`);
  /* Не собравшимся считается тот, у кого НЕ ОСТАЛОСЬ сыгранных боёв: если
     участник сыграл со всеми кроме одного, сломан тот один, а не он. */
  const bad = rows.filter((o) => o.rate === null);
  if (bad.length) console.log(`  не собрались: ${bad.map((o) => o.label).join(', ')}`);
  return { rows, fit };
}

// ───────────────────────────────────────────────────────────────────────────

/**
 * Лига эффектов. Общая основа — снаряд с уроном и конус с уроном; различается
 * ровно третье умение. Участник «ничего» играет теми же двумя.
 */
async function atoms() {
  /*
   * Атом меряется на НЕСКОЛЬКИХ доставках, а не на одной.
   *
   * Первые прогоны ставили испытуемый атом на снаряд и получали один
   * порядок; та же лига на навесе дала другой — ослепление уехало с
   * четвёртого места на предпоследнее, отброс с последнего на второе.
   * Это не шум: атом действует через форму, которая его несёт, и «сила
   * ослепления» без указания доставки — величина, которой нет.
   *
   * Отсюда следствие, которое стоит признать вслух: ПЛОСКОЙ ЦЕНЫ АТОМА,
   * КОТОРАЯ БЫЛА БЫ ВЕРНА, НЕ СУЩЕСТВУЕТ. Есть средняя по формам, и есть
   * разброс вокруг неё. Цена ставится по средней, а разброс печатается
   * рядом, чтобы читатель видел, насколько она приблизительна.
   *
   * Основа взята на луче и конусе, чтобы все три испытательные доставки
   * (снаряд, навес, зона) оставались свободными: два одинаковых умения в
   * наборе запрещены, и совпадение испытуемого с основой ломало бы замер.
   */
  const BASE = ATOM_BASE;
  /*
   * Одна форма за прогон, а не три подряд.
   *
   * Три лиги в одном процессе — это три пула воркеров, создаваемых и
   * убиваемых друг за другом, и на третьей node падал с SIGSEGV (код 139),
   * молча и без вывода: буфер stdout терялся вместе с процессом, и прогон
   * выглядел как «зависло». Разделение по процессам стоит одной строки в
   * shell и снимает целый класс отказов, который иначе пришлось бы искать
   * в чужом рантайме.
   *
   *   for v in bolt lob zone; do node tools/kitbalance.mjs --atoms --via=$v; done
   *
   * Без `--via` берутся все три — так удобнее для одного быстрого взгляда,
   * и так же падает; поэтому в README записан цикл, а не голая команда.
   */
  /* `lob` больше не испытательная доставка — он в основе (см. ATOM_BASE). */
  const VIA = arg('via', null) ? [arg('via', null)] : ['bolt', 'zone'];

  const perDelivery = [];
  for (const via of VIA) {
    const entries = [{ key: '-', label: '— ничего (2 умения) —', cost: null, kit: BASE }];
    for (const id of Object.keys(EFFECTS)) {
      const ch = EFFECTS[id].needsChannel ? 'speed' : null;
      let one = null;
      for (const delivery of [via, 'self']) {
        const one2 = skill(delivery, [id], ch ? { channel: ch } : null);
        if (!validateSkill(one2).length) { one = one2; break; }
      }
      if (!one) continue;
      entries.push({
        key: id,
        label: `${EFFECTS[id].ru} (${id})`,
        cost: costOf(one),
        kit: [...BASE, one],
      });
    }
    perDelivery.push({ via, rows: await league(entries, `АТОМЫ через «${DELIVERIES[via].ru}»`) });
  }

  /*
   * Лига без разрешения — это НЕ ДАННЫЕ, и печатать её таблицей нельзя.
   *
   * Замер через зону дал ровно 50% всем пятнадцати участникам: эталонный мозг
   * из зон выходит, значит зона в его руках не делает ничего, значит все пары
   * сыграли вничью. Строка «все атомы одинаковы» тут означает «прибор ничего
   * не увидел», а не «атомы равны». Прошлая версия печатала такие нули в
   * общую таблицу наравне с настоящими измерениями и усредняла их с ними.
   */
  for (const d of perDelivery) {
    const rates = d.rows.map((r) => r.rate).filter((x) => x !== null);
    const spread = rates.length ? Math.max(...rates) - Math.min(...rates) : 0;
    d.blind = spread < 0.02;
    if (d.blind) {
      console.log(`  через «${DELIVERIES[d.via].ru}»: разброс ${(spread * 100).toFixed(1)} п.п. —`
        + ' прибор ничего не различил, эта лига в среднее НЕ ВХОДИТ');
    }
  }
  const useful = perDelivery.filter((d) => !d.blind);
  if (!useful.length) {
    console.log('\n  Ни одна лига атомов ничего не различила — измерять нечего.\n');
    return { rows: [], fit: 0 };
  }

  /* Сведение: средняя по формам и разброс между ними. */
  const byKey = new Map();
  for (const { via, rows } of useful) {
    for (const r of rows) {
      if (r.rate === null) continue;
      if (!byKey.has(r.key)) byKey.set(r.key, { ...r, seen: [] });
      byKey.get(r.key).seen.push({ via, rate: r.rate, cost: r.cost });
    }
  }
  const rows = [...byKey.values()].map((o) => {
    const rates = o.seen.map((x) => x.rate);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    return {
      ...o,
      rate: mean,
      /* Цена берётся с той формы, где атом законен; у `self`-атомов она одна
         и та же, у остальных различается только ценой самой доставки. */
      cost: o.cost,
      spread: rates.length > 1 ? Math.max(...rates) - Math.min(...rates) : 0,
      errors: 0,
    };
  });
  rows.sort((x, y) => (y.rate ?? 0) - (x.rate ?? 0));
  /* Заголовок берёт основу из ATOM_BASE, а не пишет её словами: основу
     меняли, а подпись осталась прежней, и таблица месяц уверяла, что снята
     на «луч+конус», хотя снималась на другом. Подпись, которую надо
     помнить обновлять, рано или поздно врёт. */
  const baseRu = ATOM_BASE.map((k) => DELIVERIES[k.delivery].ru).join('+');
  const out = table(rows, `третье умение к «${baseRu} урона» через ${VIA.map((v) => DELIVERIES[v].ru).join(', ')}\n`);
  /* Машиночитаемая строка — чтобы три прогона можно было склеить. */
  console.log(`\n  СВОДКА ${VIA.join('+')} ${JSON.stringify(rows.map((o) => [o.key, o.cost, +(o.rate).toFixed(4)]))}`);
  const wobbly = rows.filter((o) => o.spread > 0.25).sort((a, b) => b.spread - a.spread);
  if (wobbly.length) {
    console.log('\n  сильнее всего зависят от формы (значит их цена — компромисс, а не закон):');
    for (const o of wobbly.slice(0, 5)) {
      console.log(`    ${o.label.padEnd(26)} разброс ${(o.spread * 100).toFixed(0)} п.п.  `
        + o.seen.map((x) => `${DELIVERIES[x.via].ru} ${(x.rate * 100).toFixed(0)}%`).join(' · '));
    }
  }
  return out;
}

/** Лига доставок: одна форма с уроном, чтобы мерить форму, а не начинку. */
async function deliveries() {
  const SUPPORT = DELIVERY_SUPPORT;
  const entries = [{ key: '-', label: '— ничего (1 умение) —', cost: null, kit: SUPPORT }];
  for (const id of Object.keys(DELIVERIES)) {
    /*
     * SELF-класс носит УЖЕ ТРИ доставки — `self`, `blink` и `jump` (D160), —
     * и L1 не пускает на них урон. Развилка по имени `self` отправляла
     * `blink:damage` и `jump:damage` в `validateSkill`, тот их честно
     * отвергал, и обе доставки молча выпадали из лиги: прибор мерил шесть
     * форм из девяти и не говорил об этом. Спрашиваем класс.
     */
    const eff = DELIVERIES[id].klass === 'self' && !SELF_ALLOWED.has('damage') ? 'shield' : 'damage';
    const one = skill(id, [eff]);
    if (validateSkill(one).length) continue;
    entries.push({
      key: id,
      label: `${DELIVERIES[id].ru} (${id})${eff === 'shield' ? ' · щит' : ''}`,
      cost: costOf(one),
      kit: [one, ...SUPPORT],
    });
  }
  const rows = await league(entries, 'ДОСТАВКИ');
  rows.sort((x, y) => (y.rate ?? 0) - (x.rate ?? 0));
  return table(rows, 'форма с уроном + лечение на себя — круговая лига\n');
}

/**
 * Стартовые наборы: не грамматика, а то, что реально попадает игроку.
 *
 * Меряются НА СВОИХ ТЕЛАХ. У каждого пресета есть архетип (см. KIT_PRESETS),
 * и это часть замысла: ближний набор на лёгком дальнобойном теле не может
 * навязать ближний бой, и его винрейт тогда говорит про тело, а не про
 * набор. Пара с разными архетипами играет ровно одну ориентацию — ту, в
 * которой оба стоят на своём; пара с одинаковыми играет зеркально, как
 * обычно.
 */
async function presets() {
  const names = Object.keys(KIT_PRESETS);
  const entries = names.map((n) => ({
    key: n,
    label: `${n} (${KIT_PRESETS[n].archetype === 'gorilla' ? 'горилла' : 'осьминог'})`,
    cost: KIT_PRESETS[n].kit.reduce((s, k) => s + costOf(k), 0),
    kit: KIT_PRESETS[n].kit,
    arch: KIT_PRESETS[n].archetype || 'octopus',
  }));

  /*
   * У ПРЕСЕТОВ СВОЙ РАЗМЕР ВЫБОРКИ, и он больше общего.
   *
   * Участников трое, значит пар три, значит при общем ROUNDS = 6 вся лига —
   * восемнадцать боёв. На такой выборке одна случайная серия переворачивает
   * порядок: тот же прогон при 6 и при 20 сидах печатал ПРОТИВОПОЛОЖНЫЕ
   * выводы про один и тот же набор. Отчёт, который меняет знак от размера
   * выборки и не говорит об этом, — не замер.
   *
   * Число сидов на пару выведено из числа пар: чем меньше пар, тем больше
   * сидов нужно, чтобы лига весила столько же.
   */
  const PRESET_MIN_FIGHTS = 240;
  const pairs = (entries.length * (entries.length - 1)) / 2;
  const rounds = Math.max(ROUNDS, Math.ceil(PRESET_MIN_FIGHTS / Math.max(1, pairs * 2)));
  if (rounds > ROUNDS) {
    console.log(`  (сидов на пару поднято с ${ROUNDS} до ${rounds}: трёх участников`
      + ` мало, чтобы ${ROUNDS} сидов дали устойчивый порядок)`);
  }

  const jobs = []; const meta = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const A = entries[i]; const B = entries[j];
      for (let s2 = 0; s2 < rounds; s2++) {
        const seed = 900 + s2 * 7919;
        if (A.arch !== B.arch) {
          /* Каждый на своём теле — ровно одна ориентация. */
          const oct = A.arch === 'octopus' ? i : j;
          const gor = A.arch === 'octopus' ? j : i;
          jobs.push({ a: entries[oct].kit, b: entries[gor].kit, seed, sym: false });
          meta.push([oct, gor]);
        } else {
          jobs.push({ a: A.kit, b: B.kit, seed, sym: false }); meta.push([i, j]);
          jobs.push({ a: B.kit, b: A.kit, seed, sym: false }); meta.push([j, i]);
        }
      }
    }
  }
  process.stdout.write(`  ПРЕСЕТЫ: ${jobs.length} боёв на ${POOL_SIZE} воркерах`);
  const res = await runJobs(jobs, (d, n) => process.stdout.write(`\r  ПРЕСЕТЫ: ${d}/${n} боёв   `));
  const score = entries.map(() => ({ pts: 0, played: 0 }));
  for (let k = 0; k < res.length; k++) {
    const [oct, gor] = meta[k];
    if (res[k] === 'error') continue;
    score[oct].played++; score[gor].played++;
    if (res[k] === 'octopus') score[oct].pts += 1;
    else if (res[k] === 'gorilla') score[gor].pts += 1;
    else { score[oct].pts += 0.5; score[gor].pts += 0.5; }
  }
  process.stdout.write(`\r  ПРЕСЕТЫ: ${jobs.length} боёв, каждый на своём теле      \n\n`);
  const rows = entries.map((e, i) => ({ ...e, rate: score[i].played ? score[i].pts / score[i].played : null }));
  rows.sort((x, y) => (y.rate ?? 0) - (x.rate ?? 0));
  console.log('  стартовые наборы — круговая лига\n');
  for (const o of rows) console.log(`  ${o.label.padEnd(26)} ${String(o.cost).padStart(3)}  ${pct(o.rate)}  ${bar(o.rate)}`);
  const rates = rows.map((o) => o.rate).filter((x) => x !== null);
  const spread = Math.max(...rates) - Math.min(...rates);
  console.log(`\n  разброс: ${(spread * 100).toFixed(1)} п.п.  ${spread > 0.3
    ? '— СЛИШКОМ МНОГО: выбор стартового набора решает бой за игрока'
    : '— приемлемо: выбор влияет, но не решает'}`);
  return { rows, spread };
}

/** Проверка прибора: одинаковые наборы обязаны давать ничью. */
async function selftest() {
  /*
   * Проверяются ВСЕ основы, на которых прибор потом меряет, а не одна
   * произвольная. Каждая обязана быть нейтральной: одинаковые наборы на
   * симметричной арене дают ничью, иначе разница винрейтов в лиге измеряет
   * перекос основы, а не третье умение.
   */
  const bases = [['лига атомов', ATOM_BASE], ['лига доставок', DELIVERY_SUPPORT]];
  const jobs = [];
  const owner = [];
  for (const [label, B] of bases) {
    for (let i = 0; i < 12; i++) { jobs.push({ a: B, b: B, seed: 900 + i * 7919, sym: !REAL }); owner.push(label); }
  }
  const r = await runJobs(jobs);
  const per = new Map();
  for (let i = 0; i < r.length; i++) {
    const k = owner[i];
    if (!per.has(k)) per.set(k, { draws: 0, n: 0 });
    const v = per.get(k); v.n++; if (r[i] === null) v.draws++;
  }
  const draws = r.filter((w) => w === null).length;
  if (REAL) {
    /* На настоящих телах ничья не обязана быть: тела разные, и в этом смысл
       режима. Печатаем как показание, а не как приговор. */
    const gor = r.filter((w) => w === 'gorilla').length;
    console.log(`  прибор (настоящие тела): одинаковые наборы → горилла ${gor}/${r.length}, ничьих ${draws}`);
    return true;
  }
  for (const [label, v] of per) {
    console.log(`  прибор · ${label.padEnd(14)} одинаковые наборы → ${v.draws}/${v.n} ничьих ${v.draws === v.n
      ? '— перекоса нет' : '— ПЕРЕКОС, цифрам этой лиги верить нельзя'}`);
  }
  return draws === r.length;
}

// ───────────────────────────────────────────────────────────────────────────

const t0 = Date.now();
console.log(REAL
  ? '\n  НАСТОЯЩИЕ тела и настоящие стороны: так набор попадает к игроку.'
  : '\n  Обе стороны играет один мозг (brains/kit-stub) на симметричной арене:');
console.log(REAL
  ? '  Разница тел в цифрах ЕСТЬ — она часть того, что игрок получит.'
  : '  тело и пилот сокращены, различается только набор.');
console.log(`  ${ROUNDS} сидов на пару и сторону. Цифры — нижняя граница силы набора.\n`);
/*
 * Проверка прибора — ГЕЙТ, а не строчка в шапке.
 *
 * Первая версия печатала «ПЕРЕКОС, цифрам ниже верить нельзя» и тут же
 * печатала все цифры, и выходила с кодом 0. Отчёт, который сам себя объявил
 * недостоверным и всё равно опубликовал таблицу, хуже отсутствующего: его
 * прочитают, а предупреждение в шапке пролистают. Цифры, снятые кривым
 * прибором, не должны существовать.
 */
if (!await selftest()) {
  console.log('\n  Прибор показывает собственный перекос — замер не проводится.');
  console.log('  Чинить надо прибор (одинаковые наборы обязаны давать ничью),');
  console.log('  а не читать таблицу с оговоркой.\n');
  closePool();
  process.exit(2);
}
console.log('');

if (arg('atoms', false)) await atoms();
else if (arg('deliveries', false)) await deliveries();
else if (arg('presets', false)) await presets();
else { await atoms(); console.log(''); await deliveries(); console.log(''); await presets(); }

console.log(`\n  ${Math.round((Date.now() - t0) / 1000)} с\n`);
/* Пул держит событийный цикл: без этого процесс не завершится. */
closePool();
