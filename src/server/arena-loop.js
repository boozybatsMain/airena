/**
 * Бои идут всегда.
 *
 * Q3 закрыт 28.08: существа дерутся непрерывно на сервере, примерно раз в
 * минуту, и офлайн игрока темп не меняет. Кран безопасен, потому что бой стоит
 * ~107 мс CPU и не трогает LLM.
 *
 * Здесь два разных прогона одного и того же матча, и их нельзя путать:
 *
 *  - ЗАЧЁТНЫЙ прогон — headless, мгновенный (70 мс), считает исход и двигает
 *    рейтинг. A3: результат, влияющий на ранг, считается на сервере из seed,
 *    покрытие 100%. Клиент никогда не авторитетен.
 *  - ЗРЕЛИЩНЫЙ прогон — тот же (seed, brains, constants_version), но кадры
 *    отдаются в сокет в реальном времени. Это ПОВТОР уже посчитанного боя, а
 *    не второй бой: детерминизм (A2) гарантирует, что зритель видит ровно то,
 *    что уже записано в таблицу.
 *
 * F5a: длительность боя держит сервер, один активный бой на аккаунт, награда
 * только за отыгранный целиком бой. Это, а не редкость наград, — основная
 * защита от накрутки.
 */

import { randomUUID } from 'node:crypto';

import { MATCH_SECONDS, TICK_HZ } from '../core/config.js';
import { runIsolated } from './sandbox/index.js';
import { clampRating, pickOpponent, rate } from './ladder.js';

/** Как часто существо выходит в бой. §6.2: «примерно раз в минуту». */
export const FIGHT_EVERY_MS = Number(process.env.AIRENA_FIGHT_EVERY_MS || 60_000);
/** Занавес перед боем — те же 2.6 с, что открывает живой сервер. */
export const CURTAIN = 2.6;
/** Раз во сколько боёв существо адаптируется (§6.2, ориентир ~10). */
export const ADAPT_EVERY = Number(process.env.AIRENA_ADAPT_EVERY || 10);

/**
 * Прогнать один зачётный матч и записать его.
 *
 * @param deps.compile  (creature) => brain  — компилятор мозга в изоляте
 * @param deps.now      часы, подменяемые в тестах
 */
/**
 * A1 буквально: мозг, написанный не текущим локальным игроком, исполняется
 * ТОЛЬКО в укреплённом изоляте. Каждый мозг на лестнице — чужой для каждого,
 * кто его смотрит, поэтому исключений здесь нет: и зачётный прогон, и
 * зрелищный идут за стеной.
 *
 * Функция асинхронна из-за этого, и это единственная причина. Изолят при
 * этом БЫСТРЕЕ пути через `node:vm`, который он заменил, — контекст vm
 * создаётся дороже, чем стоит переход через границу потока раз в матч.
 */
export async function playMatch(db, a, b, deps) {
  const { now = Date.now, rng = Math.random, constantsVersion } = deps;
  const seed = Math.floor(rng() * 1e9);
  const id = `m_${randomUUID().slice(0, 12)}`;
  const startedAt = now();

  /* Стороны арены зовутся octopus/gorilla исторически — это ИМЕНА СТОРОН
     (циан и оранж), а не виды. Существо занимает сторону по своему архетипу;
     когда оба одного архетипа, второй занимает противоположную сторону и
     дерётся её статами. Это записано здесь, потому что иначе следующий
     читатель решит, что арена умеет только осьминога против гориллы. */
  const aSlot = a.archetype === 'gorilla' ? 'gorilla' : 'octopus';
  const bSlot = aSlot === 'octopus' ? 'gorilla' : 'octopus';

  let result;
  try {
    const out = await runIsolated(
      { [aSlot]: a.brain_source, [bSlot]: b.brain_source },
      { seed, curtainSeconds: CURTAIN },
    );
    result = out.result;
    /* Мозг, съевший бюджет шагов, — это тот же брак, что и падающий: он не
       думал, он крутился. Записываем как отказ, а не как поражение. */
    for (const [slot, f] of Object.entries(out.fuel || {})) {
      if (f.exhausted) result.log.push({ t: result.seconds, type: 'brainDisabled', who: slot, reason: 'fuel' });
    }
  } catch (e) {
    return { error: e.code || 'isolate', message: e.message };
  }

  /*
   * D8 — мозг, выключившийся по FAULT_LIMIT, не двигает рейтинг.
   *
   * После 25 падений мозг выключается и туша доезжает до стены по последней
   * команде. У такого боя нет ни реплик say(), ни тактики — то есть нет ОБОИХ
   * доказательств, которыми F11 заменил закрытый исходник. Записать его как
   * поражение значит показать игроку поражение, которого не было: это наш
   * брак, а не его игра.
   */
  const faulted = (result.log || [])
    .filter((e) => e && e.type === 'brainDisabled')
    .map((e) => (e.who === aSlot ? a.id : b.id));

  const winnerSlot = result.winner;
  const score = winnerSlot === null ? 0.5 : (winnerSlot === aSlot ? 1 : 0);
  const d = faulted.length ? { a: 0, b: 0 } : rate(a.rating, b.rating, score, a.fights, b.fights);
  const aAfter = clampRating(a.rating + d.a);
  const bAfter = clampRating(b.rating + d.b);

  db.prepare(`INSERT INTO match
    (id, seed, a_id, b_id, a_slot, b_slot, winner, reason, seconds, constants_version,
     a_delta, b_delta, a_rating_after, b_rating_after, result_json, verified, started_at, ended_at, kind)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`).run(
    id, seed, a.id, b.id, aSlot, bSlot,
    winnerSlot === null ? null : (winnerSlot === aSlot ? a.id : b.id),
    result.reason, result.seconds, constantsVersion,
    d.a, d.b, aAfter, bAfter,
    JSON.stringify({ octopus: result.octopus, gorilla: result.gorilla, log: result.log?.slice(-40) ?? [] }),
    startedAt, now(), faulted.length ? 'brain_fault' : (b.is_library ? 'training' : 'ladder'),
  );

  bump(db, a, score, aAfter, now(), faulted.length > 0);
  bump(db, b, 1 - score, bAfter, now(), faulted.length > 0);

  return {
    id, seed, aSlot, bSlot,
    winner: winnerSlot === null ? null : (winnerSlot === aSlot ? a.id : b.id),
    reason: result.reason, seconds: result.seconds,
    deltas: { [a.id]: d.a, [b.id]: d.b },
    ratings: { [a.id]: aAfter, [b.id]: bAfter },
    faulted,
    ranked: faulted.length === 0,
    training: !!b.is_library || !!a.is_library,
    result,
  };
}

function bump(db, c, score, ratingAfter, at, faulted = false) {
  /* Незачётный бой считается как бой (счётчик наблюдений его видит), но не
     как победа или поражение: иначе журнал существа врёт о его силе. */
  if (faulted) {
    db.prepare('UPDATE creature SET fights = fights + 1, updated_at = ? WHERE id = ?').run(at, c.id);
    return;
  }
  const w = score === 1 ? 1 : 0, l = score === 0 ? 1 : 0, dr = score === 0.5 ? 1 : 0;
  /* Библиотечное существо не двигает свой РЕЙТИНГ: оно эталон, а эталон,
     который дрейфует, перестаёт быть эталоном — тренировочный соперник §7.3
     обязан всё время стоить одного и того же. Победы и поражения при этом
     считаются: без них в лестнице у всей библиотеки стоит «0% побед», и
     таблица врёт ровно про тех, по кому калибруется всё остальное. */
  const rating = c.is_library ? c.rating : ratingAfter;
  const peak = c.is_library ? c.peak_rating : ratingAfter;
  db.prepare(`UPDATE creature SET
      rating = ?, peak_rating = max(peak_rating, ?),
      wins = wins + ?, losses = losses + ?, draws = draws + ?, fights = fights + 1,
      updated_at = ? WHERE id = ?`)
    .run(rating, peak, w, l, dr, at, c.id);
}

/**
 * Планировщик. Один тик = «кому пора драться» и один матч на каждого.
 *
 * Существо дерётся, только если у него есть мозг и оно активно. Соперник —
 * из подбора; если лестница пуста, ставится библиотечное существо, и матч
 * помечается тренировочным (§7.3: открыто называем тренировочным, N4
 * запрещает подставной бой, поданный как настоящий).
 */
export class ArenaLoop {
  constructor(db, deps) {
    this.db = db;
    this.deps = deps;
    this.timer = null;
    this.due = new Map();       // creatureId -> следующий бой, мс
    this.listeners = new Set();
    this.lastByCreature = new Map();
    this.stats = { matches: 0, errors: 0, adaptations: 0 };
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const fn of this.listeners) { try { fn(ev); } catch { /* слушатель не роняет арену */ } } }

  start(everyMs = 1000) {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), everyMs);
    this.timer.unref?.();
  }

  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  /** Когда у этого существа следующий бой. Экран меню показывает этот таймер. */
  nextFightAt(creatureId) {
    return this.due.get(creatureId) ?? null;
  }

  tick(now = (this.deps.now || Date.now)()) {
    const rows = this.db.prepare(`
      SELECT * FROM creature WHERE state = 'active' AND brain_source IS NOT NULL AND is_library = 0
      ORDER BY updated_at ASC LIMIT 64
    `).all();

    for (const c of rows) {
      let at = this.due.get(c.id);
      if (at == null) {
        /* Разводим первые бои по фазе, иначе вся популяция дерётся в одну
           секунду каждую минуту — и профиль нагрузки становится пилой. */
        at = now + Math.floor(this.hash(c.id) % FIGHT_EVERY_MS);
        this.due.set(c.id, at);
        continue;
      }
      if (at > now) continue;
      this.due.set(c.id, now + FIGHT_EVERY_MS);
      /* Бои идут параллельно и не ждут друг друга: один медленный матч не
         должен задерживать всю популяцию. Ошибку глотать нельзя — она
         уезжает в счётчик и в событие. */
      this.fightOnce(c, now).catch((e) => {
        this.stats.errors++;
        this.emit({ type: 'match_error', creatureId: c.id, error: 'throw', message: e.message });
      });
    }
  }

  async fightOnce(c, now) {
    const opp = pickOpponent(this.db, c, { now, rng: this.deps.rng || Math.random })
      || this.library(c);
    if (!opp) return null;
    const b = this.db.prepare('SELECT * FROM creature WHERE id = ?').get(opp.id);
    if (!b || !b.brain_source) return null;

    const r = await playMatch(this.db, c, b, this.deps);
    if (r.error) {
      this.stats.errors++;
      this.emit({ type: 'match_error', creatureId: c.id, error: r.error, message: r.message });
      return null;
    }
    this.stats.matches++;
    this.lastByCreature.set(c.id, r);
    this.lastByCreature.set(b.id, r);
    this.emit({ type: 'match', match: r, a: c.id, b: b.id, training: !!b.is_library });

    const fights = c.fights + 1;
    if (this.deps.adapt && fights % ADAPT_EVERY === 0) {
      try {
        const ad = await this.deps.adapt(this.db, c.id);
        if (ad) { this.stats.adaptations++; this.emit({ type: 'adapt', creatureId: c.id, adaptation: ad }); }
      } catch (e) {
        this.emit({ type: 'adapt_error', creatureId: c.id, message: e.message });
      }
    }
    return r;
  }

  /**
   * Библиотечный соперник.
   *
   * Первый бой существа — тренировочный, и соперник в нём не «ближайший по
   * рейтингу», а ЗАМЕРЕННО слабый на нужной стороне. §16 печатает, почему
   * это разные вещи: рукописный `stub` берёт 3.7% как осьминог и 58.3% как
   * горилла, то есть «поставить stub» в половине случаев ставит соперника,
   * который выигрывает у новичка. Пара выбирается `tools/seed.mjs` замером
   * и лежит в `kv.training.ids`.
   *
   * N4 не нарушен: соперник играет в полную силу, его винрейт напечатан, и
   * экран называет бой тренировочным. Запрещена постановка, а не слабость.
   */
  library(c) {
    if (c.fights === 0 && this.deps.trainingIds) {
      const want = c.archetype === 'gorilla' ? 'octopus' : 'gorilla';
      const id = this.deps.trainingIds[want];
      if (id) {
        const row = this.db.prepare(`SELECT id FROM creature WHERE id = ? AND state = 'active'`).get(id);
        if (row) return row;
      }
    }
    return this.db.prepare(`
      SELECT id FROM creature WHERE is_library = 1 AND state = 'active' AND id != ?
        AND archetype != ?
      ORDER BY abs(rating - ?) ASC LIMIT 1
    `).get(c.id, c.archetype, c.rating) || null;
  }

  /**
   * Показательный бой между библиотечными существами.
   *
   * §10.5 отводит на «уже идёт бой» первые две секунды посадочной, а F6 —
   * десять секунд на первый кадр. Оба обещания рушатся, если арена пуста,
   * пока на лестнице нет ни одного живого существа: посетитель с клипа
   * приходит смотреть бой и видит статичный пол.
   *
   * Бой настоящий: те же мозги, тот же детерминизм, тот же зачётный прогон.
   * Он просто никому не двигает рейтинг — библиотечные существа его и так
   * не двигают (иначе эталон дрейфует и перестаёт быть эталоном).
   */
  async showcase(now = (this.deps.now || Date.now)()) {
    const rnd = this.deps.rng || Math.random;
    const pick = (arch) => {
      const rows = this.db.prepare(`SELECT * FROM creature WHERE is_library = 1 AND state='active'
        AND archetype = ? AND brain_source IS NOT NULL`).all(arch);
      return rows.length ? rows[Math.floor(rnd() * rows.length)] : null;
    };
    const a = pick('octopus'); const b = pick('gorilla');
    if (!a || !b) return null;
    const r = await playMatch(this.db, a, b, this.deps);
    if (r.error) { this.stats.errors++; return null; }
    this.stats.matches++;
    this.emit({ type: 'match', match: r, a: a.id, b: b.id, showcase: true, training: false });
    return r;
  }

  hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
}

/** Сколько секунд идёт живой показ боя, для экрана ожидания. */
export const SHOW_SECONDS = MATCH_SECONDS + CURTAIN;
export const TICKS_PER_SECOND = TICK_HZ;
