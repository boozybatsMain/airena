/**
 * Заселить лестницу библиотечными существами — и ЗАМЕРИТЬ, кто из них годится
 * в тренировочные.
 *
 * Второе важнее первого. §7.3 предлагает поставить `stub` первым соперником,
 * потому что он измеренно слаб: 3.7% как осьминог. Приложение §16 печатает и
 * вторую половину замера — **58.3% как горилла**, — и она означает, что
 * «поставить stub» в половине случаев ставит соперника, который выигрывает
 * у новичка. Тренировочным должна быть не программа, а ПАРА (программа,
 * сторона), и годность пары — замер, а не мнение.
 *
 * Материал берётся из ВСЕХ популяций репозитория, чьи константы совпадают с
 * сегодняшними (F9: мозг, написанный против других чисел, не дезинформирован,
 * а просто играет в другую игру). Шести эталонных мозгов не хватает: на них
 * между 10% и 50% по стороне осьминога зияет дыра, и тренировочной пары для
 * гориллы игрока просто нет.
 *
 *   node tools/seed.mjs                 # заселить и замерить
 *   node tools/seed.mjs --rounds=40     # плотнее замер
 *   node tools/seed.mjs --reset         # снести библиотеку и заселить заново
 *   node tools/seed.mjs --keep=16       # сколько пар оставить в библиотеке
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileBrain } from '../src/brain/host.js';
import { FIGHTERS, SKILLS } from '../src/core/config.js';
import { runMatch } from '../src/core/match.js';
import { constantsVersion } from '../src/core/version.js';
import { KIT_PRESETS } from '../src/server/forge/pipeline.js';
import { create as createCreature } from '../src/server/creatures.js';
import { openDb, kv as makeKv } from '../src/server/db.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  if (h) return h.slice(n.length + 3);
  return process.argv.includes(`--${n}`) ? true : d;
};

const ROUNDS = Number(arg('rounds', 24));
const KEEP = Number(arg('keep', 16));
const DB_FILE = String(arg('db', process.env.AIRENA_DB || join(ROOT, 'data/airena.db')));

/**
 * Коридор тренировочной пары.
 *
 * Верх — 42%: выше этого «тренировочный» соперник выигрывает у новичка чаще,
 * чем каждый второй раз, и обещание §7.3 «игрок выигрывает и знает почему»
 * перестаёт выполняться.
 *
 * Низ — 5%, а не 25%, и это не поблажка: §7.3 прямо называет 3.7% приемлемым
 * и объясняет, почему («настоящий слабый противник», открыто помеченный).
 * Слабость тренировочного соперника — это его работа, а не его брак. N4
 * запрещает не слабость, а ПОСТАНОВКУ: соперник играет в полную силу, его
 * винрейт замерен и напечатан, и на экране он назван тренировочным.
 */
export const TRAINING_BAND = [0.05, 0.42];

/** Имена библиотечных бойцов. Латиницы в них нет — это продуктовая поверхность. */
const NAMES = {
  octopus: ['ЛИНЗА', 'ШПИЛЬ', 'ЧЕРТА', 'ИГЛА', 'ЗЕРНО', 'СТЫК', 'МЕТКА', 'ПРОСВЕТ', 'НИТЬ', 'СКОБА', 'ГРАНЬ', 'ЩЕЛЬ', 'ОСЬ', 'ЛУЧИНА', 'ПРОРЕЗЬ', 'КРОМКА'],
  gorilla: ['ОБУХ', 'ГРУНТ', 'КЛИН', 'ВАЛ', 'КРЯЖ', 'ПРЕСС', 'КОЛОДА', 'ГЛЫБА', 'ТАРАН', 'КУВАЛДА', 'ОТВАЛ', 'СВАЯ', 'ЧУРБАН', 'БАБА', 'ЯДРО', 'КАТОК'],
};
const PRESETS = ['keeper', 'breaker', 'saboteur'];

/** Каталоги, где лежат популяции. */
const POOLS = [join(ROOT, 'brains'), ...readdirSync(join(ROOT, 'reports'))
  .filter((d) => d.startsWith('brains-'))
  .map((d) => join(ROOT, 'reports', d))];

/**
 * Мозг «текущий», если записанные при генерации константы совпадают с
 * сегодняшними. Та же проверка, что делает `tools/checkstale.mjs`, — но нам
 * нужен ответ да/нет, а не отчёт.
 */
function isCurrent(dir, id) {
  const p = join(dir, `${id}.json`);
  if (!existsSync(p)) return false;
  let rec;
  try { rec = JSON.parse(readFileSync(p, 'utf8')); } catch { return false; }
  if (!rec.constants) return false;
  const now = { fighters: FIGHTERS, skills: SKILLS };
  for (const section of ['fighters', 'skills']) {
    for (const [k, table] of Object.entries(rec.constants[section] || {})) {
      for (const [f, v] of Object.entries(table)) {
        const cur = now[section]?.[k]?.[f];
        if (typeof v === 'number' && typeof cur === 'number') {
          if (Math.abs(v - cur) > 1e-9) return false;
        } else if (JSON.stringify(v) !== JSON.stringify(cur)) return false;
      }
    }
  }
  return true;
}

/** Все пары (тег, сторона), пригодные к бою на сегодняшних константах. */
function discover() {
  const found = [];
  for (const pool of POOLS) {
    if (!existsSync(pool)) continue;
    for (const tag of readdirSync(pool).sort()) {
      const dir = join(pool, tag);
      if (!statSync(dir).isDirectory()) continue;
      const label = pool.endsWith('brains') ? tag : `${pool.split('/').pop()}/${tag}`;
      for (const slot of ['octopus', 'gorilla']) {
        const js = join(dir, `${slot}.js`);
        if (!existsSync(js)) continue;
        /* `stub` — рукописный эталон без .json; §7.3 называет его прямо, и он
           входит независимо от провенанса. Остальные — только текущие. */
        if (tag !== 'stub' && !isCurrent(dir, slot)) continue;
        found.push({ tag: label, dir, slot, file: js });
      }
    }
  }
  return found;
}

const modelOf = (dir, slot, tag) => {
  const p = join(dir, `${slot}.json`);
  if (!existsSync(p)) return tag.endsWith('stub') ? 'рукописный эталон' : 'эталон репозитория';
  try { return JSON.parse(readFileSync(p, 'utf8')).model || 'эталон репозитория'; }
  catch { return 'эталон репозитория'; }
};

/**
 * Замер: винрейт каждой пары против ФИКСИРОВАННОЙ панели соперников на
 * фиксированных сидах. Панель одна для всех — иначе меряется расписание.
 */
function measure(pairs, rounds) {
  const byId = { octopus: [], gorilla: [] };
  for (const p of pairs) {
    try { byId[p.slot].push({ ...p, brain: compileBrain(readFileSync(p.file, 'utf8'), p.slot) }); }
    catch (e) { console.log(`  ! ${p.tag}/${p.slot}: ${e.message.slice(0, 60)}`); }
  }
  /* Панель — шесть эталонных мозгов u1..u6: они и есть популяция, против
     которой печатались все цифры §1 и §16. */
  const panel = {
    octopus: byId.octopus.filter((x) => /^u[1-6]$/.test(x.tag)),
    gorilla: byId.gorilla.filter((x) => /^u[1-6]$/.test(x.tag)),
  };
  if (!panel.octopus.length || !panel.gorilla.length) throw new Error('нет эталонной панели u1..u6');

  const out = [];
  for (const slot of ['octopus', 'gorilla']) {
    const foes = panel[slot === 'octopus' ? 'gorilla' : 'octopus'];
    for (const me of byId[slot]) {
      let wins = 0; let played = 0;
      for (let i = 0; i < rounds; i++) {
        const foe = foes[i % foes.length];
        if (foe.tag === me.tag) continue;
        me.brain.reset?.(); foe.brain.reset?.();
        let r;
        try { r = runMatch({ [slot]: me.brain, [foe.slot]: foe.brain }, { seed: 5000 + i * 104729 }); }
        catch { continue; }
        played++;
        if (r.result.winner === slot) wins++;
      }
      out.push({ ...me, brain: undefined, wins, played, rate: played ? wins / played : null });
    }
  }
  return out;
}

function main() {
  const db = openDb(DB_FILE);
  const kv = makeKv(db);
  if (!kv.get('season')) {
    kv.set('season', { n: 1, startedAt: Date.now(), endsAt: null, prizeCoins: 4500,
      prizes: [1500, 1000, 600, 200, 200, 200, 200, 200, 200, 200] });
  }
  const season = kv.get('season').n;

  if (arg('reset', false)) {
    db.exec(`DELETE FROM match WHERE a_id IN (SELECT id FROM creature WHERE is_library=1)
                                  OR b_id IN (SELECT id FROM creature WHERE is_library=1)`);
    db.exec('DELETE FROM adaptation WHERE creature_id IN (SELECT id FROM creature WHERE is_library=1)');
    db.exec('DELETE FROM creature WHERE is_library = 1');
    console.log('  библиотека снесена');
  }

  const pairs = discover();
  console.log(`\n  нашлось ${pairs.length} пар на сегодняшних константах (${constantsVersion()})`);
  console.log(`  замер по ${ROUNDS} боёв против эталонной панели u1..u6…`);
  const t0 = Date.now();
  const rows = measure(pairs, ROUNDS).filter((r) => r.played > 0).sort((a, b) => a.rate - b.rate);
  console.log(`  ${Math.round((Date.now() - t0) / 1000)} с, ${rows.length} пар замерено\n`);

  const training = {};
  for (const slot of ['octopus', 'gorilla']) {
    const band = rows.filter((r) => r.slot === slot
      && r.rate >= TRAINING_BAND[0] && r.rate <= TRAINING_BAND[1]);
    /* Берём ВЕРХ коридора: самый сильный из тех, кого новичок ещё обыгрывает.
       Низ коридора даёт победу, которая ничего не показывает. */
    training[slot] = band.length ? { tag: band[band.length - 1].tag, rate: round3(band[band.length - 1].rate) } : null;
  }

  console.log('  тренировочный соперник по сторонам:');
  for (const slot of ['octopus', 'gorilla']) {
    const t = training[slot];
    console.log(`    ${slot.padEnd(9)} ${t ? `${t.tag} — ${(t.rate * 100).toFixed(1)}%` : 'НЕТ ПАРЫ В КОРИДОРЕ'}`);
  }

  const have = db.prepare('SELECT count(*) AS n FROM creature WHERE is_library = 1').get().n;
  if (have) {
    kv.set('training', { band: TRAINING_BAND, at: Date.now(), rounds: ROUNDS, picked: training });
    console.log(`\n  уже есть ${have} библиотечных существ, заселять не буду (--reset чтобы пересобрать)\n`);
    return;
  }

  /* Библиотека должна ПОКРЫВАТЬ диапазон силы, а не быть его верхушкой:
     подбор соперника ищет по рейтингу, и лестница из одних чемпионов даёт
     новичку чемпиона. Берём равномерно по отсортированному списку. */
  const pick = { octopus: spread(rows.filter((r) => r.slot === 'octopus'), Math.ceil(KEEP / 2)),
    gorilla: spread(rows.filter((r) => r.slot === 'gorilla'), Math.floor(KEEP / 2)) };
  const trainingIds = {};

  let made = 0;
  for (const slot of ['octopus', 'gorilla']) {
    const chosen = [...pick[slot]];
    /* Тренировочная пара обязана попасть в библиотеку, даже если равномерная
       выборка её не взяла. */
    const t = training[slot];
    if (t && !chosen.some((r) => r.tag === t.tag)) {
      const row = rows.find((r) => r.slot === slot && r.tag === t.tag);
      if (row) chosen.push(row);
    }
    chosen.forEach((r, i) => {
      const name = `${NAMES[slot][i % NAMES[slot].length]}-${String(Math.round(r.rate * 100)).padStart(2, '0')}`;
      const c = createCreature(db, {
        ownerId: null,
        name,
        archetype: slot,
        bodyRef: slot,
        kit: KIT_PRESETS[PRESETS[i % PRESETS.length]].kit,
        brainSource: readFileSync(r.file, 'utf8'),
        brainModel: modelOf(r.dir, slot, r.tag),
        constantsVersion: constantsVersion(),
        prompt: null,
        unfit: [],
        isLibrary: true,
        season,
        /* Рейтинг из замера: лестница, где все библиотечные стоят в 1200,
           даёт новичку случайного соперника вместо подходящего. */
        rating: Math.round(850 + r.rate * 800),
        tacticsCard: null,
      });
      if (t && r.tag === t.tag) trainingIds[slot] = c.id;
      made++;
    });
  }

  kv.set('training', { band: TRAINING_BAND, at: Date.now(), rounds: ROUNDS, picked: training, ids: trainingIds });
  console.log(`\n  заселено ${made} библиотечных существ, рейтинг ${db.prepare('SELECT min(rating) AS a, max(rating) AS b FROM creature WHERE is_library=1').get().a}–${db.prepare('SELECT max(rating) AS b FROM creature WHERE is_library=1').get().b}\n`);
}

/** Равномерная выборка n элементов из отсортированного списка, с краями. */
function spread(list, n) {
  if (list.length <= n) return list;
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.round((i * (list.length - 1)) / (n - 1))]);
  return [...new Set(out)];
}

const round3 = (x) => Math.round(x * 1000) / 1000;

main();
