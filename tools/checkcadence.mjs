/**
 * Гейт темпа боёв и принадлежности — D161 и D162.
 *
 * ПОЧЕМУ ОН НУЖЕН. Обе механики видны только на экране и обе держатся на
 * состоянии, живущем в памяти процесса: карты `busyUntil`/`due` у цикла и
 * `broadcasts`/`sockets` у трансляции. Ни одного гейта на них не было, и
 * первая же волна ревью нашла в них пять подтверждённых дефектов — включая
 * тот, из-за которого обещанные основателем пять секунд превращались в
 * двенадцать. В проекте, где правило без гейта не правило, это неприемлемо.
 *
 * ЧТО ПРОВЕРЯЕТСЯ. Пять утверждений, каждое — прямая формулировка требования:
 *
 *   1. После боя оба участника заняты до конца показа, а следующий бой
 *      возможен ровно через REST_MS после него.
 *   2. Занятый и ОТДЫХАЮЩИЙ не берутся в соперники.
 *   3. Исключение в бою освобождает ОБОИХ, а не только инициатора.
 *   4. Показ предпочитает ИДУЩУЮ трансляцию доигравшей.
 *   5. Метка принадлежности `mine` ставится только владельцу, `following` —
 *      тому, кто следит за чужим существом.
 *   6. В очереди трансляций класс важнее порядка прихода, а повтор в неё
 *      не встаёт вовсе.
 *   7. Итог боя успевают прочитать: зритель не переводится с доигравшего боя
 *      раньше окна чтения.
 *   8. Новичок попадает к НАЧАЛУ боя, а не в середину чужой драки.
 *
 * Часы подменяются, сеть не нужна, база — в памяти.
 *
 *   node tools/checkcadence.mjs
 */

import { DatabaseSync } from 'node:sqlite';

import { ArenaLoop, REST_MS, MAX_MATCH_MS } from '../src/server/arena-loop.js';
import { Live } from '../src/server/live.js';
import { pickOpponent } from '../src/server/ladder.js';

let bad = 0;
const ok = (what, cond, note = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${what}${note ? `  ${note}` : ''}`);
  if (!cond) bad++;
};

console.log('\n  ГЕЙТ ТЕМПА БОЁВ (D161) И ПРИНАДЛЕЖНОСТИ (D162)\n');

// ── стенд: цикл с подменёнными часами и без настоящих матчей ──────────────
/**
 * `playMatch` здесь не зовётся: гейт про РАСПИСАНИЕ, а не про симуляцию.
 * Проверяются ровно те методы, которыми расписание и живёт.
 */
function loopStand() {
  const db = new DatabaseSync(':memory:');
  let clock = 1_000_000;
  const loop = new ArenaLoop(db, { now: () => clock });
  return { loop, tick: (ms) => { clock += ms; }, at: () => clock };
}

// ── 1. занятость и отдых считаются от КОНЦА боя ───────────────────────────
{
  const { loop, tick, at } = loopStand();
  const end = at() + 12_000;
  loop.hold('a', end);
  loop.hold('b', end);

  ok('во время боя оба заняты',
    loop.busyAt('a') === end && loop.busyAt('b') === end);
  ok('следующий бой — ровно через отдых после конца показа',
    loop.nextFightAt('a') === end + REST_MS,
    `${loop.nextFightAt('a') - end} мс, ожидалось ${REST_MS}`);

  tick(12_001);
  ok('после конца показа боец больше не «в бою»', loop.busyAt('a') < at());
  ok('но и не свободен: идут пять секунд отдыха', loop.busySet().has('a'));
  tick(REST_MS);
  ok('после отдыха свободен', !loop.busySet().has('a'));
}

// ── 2. подбор соперника не берёт ни занятых, ни отдыхающих ────────────────
{
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE creature (id TEXT PRIMARY KEY, name TEXT, rating REAL, fights INT,
             is_library INT, archetype TEXT, state TEXT, season INT)`);
  db.exec(`CREATE TABLE match (a_id TEXT, b_id TEXT, started_at INT)`);
  const add = (id, arch) => db.prepare(
    `INSERT INTO creature VALUES (?,?,1200,10,0,?,'active',1)`).run(id, id, arch);
  add('me', 'octopus');
  add('free', 'gorilla');
  add('busy', 'gorilla');

  const me = { id: 'me', rating: 1200, season: 1, archetype: 'octopus' };
  const picks = new Set();
  for (let i = 0; i < 40; i++) {
    const p = pickOpponent(db, me, { rng: () => i / 40, busy: new Set(['busy']) });
    if (p) picks.add(p.id);
  }
  ok('подбор ни разу не вернул занятого', !picks.has('busy'),
    `выбраны: ${[...picks].join(', ') || '—'}`);
  ok('свободный при этом находится', picks.has('free'));
}

// ── 2b. свежий соперник ищется во ВСЕХ окнах, а не только в первом ────────
{
  /*
   * Замер на живой лестнице: у лидера (рейтинг далеко от остальных) последние
   * ДЕСЯТЬ боёв прошли с одним и тем же существом. Причина была в порядке
   * предпочтений: свежесть решалась внутри окна, и первое окно с хоть
   * кем-нибудь соглашалось на недавнего, не пробуя окно шире.
   */
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE creature (id TEXT PRIMARY KEY, name TEXT, rating REAL, fights INT,
             is_library INT, archetype TEXT, state TEXT, season INT)`);
  db.exec(`CREATE TABLE match (a_id TEXT, b_id TEXT, started_at INT)`);
  const add = (id, arch, rating) => db.prepare(
    `INSERT INTO creature VALUES (?,?,?,10,0,?,'active',1)`).run(id, id, rating, arch);
  add('leader', 'octopus', 1560);
  add('near', 'gorilla', 1500);   // близко по рейтингу — и уже надоел
  add('far', 'gorilla', 1180);    // далеко, но новый
  /* Шесть последних боёв — все с `near`: ровно то состояние, в котором
     подбор раньше залипал. */
  for (let i = 0; i < 6; i++) db.prepare('INSERT INTO match VALUES (?,?,?)').run('leader', 'near', i);

  const me = { id: 'leader', rating: 1560, season: 1, archetype: 'octopus' };
  const got = new Set();
  for (let i = 0; i < 20; i++) {
    const p = pickOpponent(db, me, { rng: () => i / 20 });
    if (p) got.add(p.id);
  }
  ok('надоевший сосед уступает свежему из дальнего окна',
    got.has('far') && !got.has('near'), `выбраны: ${[...got].join(', ') || '—'}`);
}

// ── 3. исключение освобождает обоих ───────────────────────────────────────
{
  const { loop, at } = loopStand();
  /* Ровно та последовательность, которую делает `fightOnce`: резерв на себя,
     резерв на соперника, запись пары — и падение до записи результата. */
  loop.hold('me', at() + MAX_MATCH_MS);
  loop.hold('opp', at() + MAX_MATCH_MS);
  loop.held.set('me', 'opp');

  /* Тот же код, что стоит в `.catch` тика. */
  loop.hold('me', at());
  const partner = loop.held.get('me');
  if (partner) { loop.hold(partner, at()); loop.held.delete('me'); }

  ok('после исключения инициатор свободен через отдых',
    loop.nextFightAt('me') === at() + REST_MS);
  ok('и СОПЕРНИК тоже, а не через минуту',
    loop.nextFightAt('opp') === at() + REST_MS,
    `осталось ${Math.round((loop.nextFightAt('opp') - at()) / 1000)} с`);
}

// ── 4. показ предпочитает идущую трансляцию доигравшей ────────────────────
{
  /* Настоящий `Live`, но без базы и без изолята: `pick` смотрит только на
     карту трансляций, и подделывать её честнее, чем гонять матч. */
  const live = new Live(null, { now: () => 1000 });
  const mk = (id, over, ids) => ({
    id, over: over ? { at: 0 } : null,
    result: { aSlot: 'octopus', bSlot: 'gorilla' },
    meta: { octopus: { id: ids[0] }, gorilla: { id: ids[1] } },
    frames: [{}], at: 0, watchers: new Set(),
  });
  /* Порядок вставки: доигравшая ПЕРВОЙ — ровно тот случай, в котором прежний
     перебор возвращал мёртвую трансляцию все двенадцать секунд линга. */
  live.broadcasts.set('old', mk('old', true, ['mine', 'x']));
  live.broadcasts.set('new', mk('new', false, ['mine', 'y']));

  const sub = { creatureId: 'mine', owned: true, alive: true, matchId: null };
  ok('свой ИДУЩИЙ бой предпочитается своему доигравшему',
    live.pick(sub)?.id === 'new', `выбрано «${live.pick(sub)?.id}»`);
  ok('ownBroadcast не возвращает доигравший',
    live.ownBroadcast(sub)?.id === 'new');

  live.broadcasts.delete('new');
  ok('когда идущего нет — отдаётся доигравший, а не пустота',
    live.pick(sub)?.id === 'old');
}

// ── 5. «твоё» и «следишь» — разные вещи ───────────────────────────────────
{
  const live = new Live(null, { now: () => 1000 });
  const b = {
    id: 'm', over: null, seed: 1, at: 0, frames: [{ t: 0 }],
    result: { aSlot: 'octopus', bSlot: 'gorilla' },
    meta: { octopus: { id: 'c1', name: 'A', size: 1, model: 'm' },
      gorilla: { id: 'c2', name: 'B', size: 1, model: 'm' } },
    watchers: new Set(), training: false, kits: null, bodies: null,
  };
  live.broadcasts.set('m', b);

  const sent = [];
  const mkSub = (creatureId, owned) => ({
    creatureId, owned, alive: true, matchId: null, cursor: 0,
    ws: { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) },
  });

  live.sendMatch(mkSub('c1', true), b);
  const owner = sent.find((m) => m.type === 'match');
  ok('владельцу приходит mine с его стороной',
    owner?.mine === 'octopus' && owner?.following === null,
    `mine=${owner?.mine} following=${owner?.following}`);

  sent.length = 0;
  live.sendMatch(mkSub('c2', false), b);
  const guest = sent.find((m) => m.type === 'match');
  ok('гостю со стартером приходит following, а не mine',
    guest?.mine === null && guest?.following === 'gorilla',
    `mine=${guest?.mine} following=${guest?.following}`);

  sent.length = 0;
  live.sendMatch(mkSub(null, false), b);
  const anon = sent.find((m) => m.type === 'match');
  ok('анониму не приходит ни того, ни другого',
    anon?.mine === null && anon?.following === null);
}

// ── 6. очередь трансляций: класс важнее порядка прихода ───────────────────
{
  /*
   * Замер ревью: тридцать сокетов, шлющих повтор раз в секунду, утопили 44
   * зачётных боя из 56. Причина была в приоритете — повтор и рейтинговый бой
   * лежали в одном классе, а порядок был обратным (LIFO).
   */
  const live = new Live(null, { now: () => 1000 });
  live.opening = new Set(['a', 'b', 'c', 'd', 'e', 'f']);   // все слоты заняты
  const put = (id, kind) => live.open(
    { id, aSlot: 'octopus', bSlot: 'gorilla' },
    { a: { id: 'x' }, b: { id: 'y' }, kind },
  );
  put('r1', 'ranked'); put('s1', 'showcase'); put('r2', 'ranked'); put('s2', 'showcase');
  const order = live.queue.map((q) => q.matchRow.id);
  ok('зачётные бои стоят впереди витринных', order.slice(0, 2).every((id) => id.startsWith('r')),
    `очередь: ${order.join(', ')}`);
  ok('внутри класса порядок прихода сохранён', order[0] === 'r1' && order[1] === 'r2',
    `очередь: ${order.join(', ')}`);

  const before = live.queue.length;
  put('p1', 'replay');
  ok('повтор в очередь не встаёт вовсе', live.queue.length === before && live.dropped.replay === 1);
}

// ── 7. итог боя успевают прочитать ────────────────────────────────────────
{
  /*
   * Замер ревью: между `over` и следующим `match` на анонимном сокете
   * проходило 0.000 с в 54 переходах из 54 — карточка итога создавалась и
   * уничтожалась в одном кадре, а это единственная точка конверсии гостя.
   */
  let clock = 100_000;
  const live = new Live(null, { now: () => clock });
  const sent = [];
  const mk = (id, over, at) => ({
    id, over: over ? { at: over } : null, seed: 1, at, frames: [{ t: 0 }],
    result: { aSlot: 'octopus', bSlot: 'gorilla' },
    meta: { octopus: { id: `${id}o` }, gorilla: { id: `${id}g` } },
    watchers: new Set(), training: false, kits: null, bodies: null,
  });
  const done = mk('done', clock, 5);
  const live2 = mk('live', 0, 1);
  live.broadcasts.set('done', done);
  live.broadcasts.set('live', live2);
  const sub = {
    creatureId: null, owned: false, alive: true, matchId: 'done', cursor: 0, pinned: false,
    ws: { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) },
  };
  live.sockets.add(sub);
  done.watchers.add(sub);

  live.pump();
  ok('сразу после конца зритель остаётся на итоге', sub.matchId === 'done');
  clock += 4_600;
  live.pump();
  ok('через окно чтения — переводится на идущий бой', sub.matchId === 'live',
    `matchId=${sub.matchId}`);
}

// ── 8. новичок попадает к НАЧАЛУ боя, а не в середину ─────────────────────
{
  const live = new Live(null, { now: () => 1000 });
  const mk = (id, at) => ({
    id, over: null, at, frames: [{}],
    result: { aSlot: 'octopus', bSlot: 'gorilla' },
    meta: { octopus: { id: `${id}o` }, gorilla: { id: `${id}g` } },
    watchers: new Set(),
  });
  live.broadcasts.set('old', mk('old', 900));    // 30-я секунда
  live.broadcasts.set('fresh', mk('fresh', 12)); // только началась
  const sub = { creatureId: null, owned: false, alive: true, matchId: null };
  ok('из двух идущих выбирается самый молодой', live.pick(sub)?.id === 'fresh',
    `выбрано «${live.pick(sub)?.id}»`);
}

console.log(bad ? `\n  ПРОВАЛ: ${bad}\n` : '\n  ДЕРЖИТ\n');
process.exit(bad ? 1 : 0);
