/**
 * Очередь генераций.
 *
 * Одна очередь на процесс, потому что лимит одновременных генераций (E3.2) —
 * это лимит, а не пожелание: если запускать по вызову API, «максимум четыре»
 * означает «максимум четыре в среднем».
 *
 * E5 держится здесь буквально: `spend` пишется ВСЕГДА (провайдер уже списал,
 * и дневной бюджет обязан это видеть), а `accepted` ставится только при
 * принятой генерации. Отклонённая валидатором генерация бесплатна для игрока
 * и видна нам — это два разных счётчика, и ни один не заменяет другой.
 */

import { randomUUID } from 'node:crypto';

import { buildOf, kitOf } from './arena-loop.js';
import { create as createCreature, refactor as applyRefactor } from './creatures.js';
import { LIMITS, recordSpend } from './limits.js';
import { record as trackEvent } from './analytics.js';
import { forgeCreature } from './forge/pipeline.js';

/**
 * Молчание, после которого задание считается брошенным.
 *
 * Не «сколько идёт генерация» — она может идти десять минут, и это нормально
 * (тело пишется минутами). Это «сколько задание не подавало признаков жизни».
 * Отметку ставит `heartbeat` раз в 10 секунд, значит минута — это шесть
 * пропущенных подряд: процесс мёртв, а не занят.
 */
const ABANDONED_MS = 60_000;

/** Как часто живое задание касается `updated_at`. */
const HEARTBEAT_MS = 10_000;

export class Jobs {
  constructor(db, ctx) {
    this.db = db;
    this.ctx = ctx;
    this.queue = [];
    this.running = 0;

    /*
     * ЗАВИСШИЕ ЗАДАНИЯ ЗАКРЫВАЮТСЯ ПРИ СТАРТЕ.
     *
     * Предохранитель E3.2 считает одновременные генерации по строкам в
     * состоянии `queued`/`running`. Процесс, упавший посреди генерации,
     * оставляет такую строку навсегда: никто её не завершит, потому что
     * завершать её было некому. Достаточно `maxConcurrent` падений за всё
     * время жизни игры — и генерация закрыта для ВСЕХ, без единого сообщения
     * о причине.
     *
     * Мы — единственный, кто мог их вести, и раз мы только что стартовали,
     * значит они не идут. Помечаем провалом с причиной, а не удаляем: игрок
     * имеет право увидеть, что его генерация оборвалась, и почему.
     */
    /*
     * ── БРОШЕННЫЕ, А НЕ ПРОСТО НЕЗАВЕРШЁННЫЕ ────────────────────────────
     *
     * Здесь стояло «все `queued`/`running` — провалить». Это верно ровно при
     * одном условии: на базу смотрит РОВНО ОДИН процесс. Условие ложно:
     * `data/airena.db` открывают и дев-сервер, и `tools/seed.mjs`, и
     * `tools/bodyinstall.mjs`, и любой второй `npm run dev` (порт занят —
     * `listen` берёт следующий и поднимается). Каждый такой подъём убивал
     * ЧУЖИЕ живые генерации: замерено — четыре задания на пятой минуте, три
     * из них с уже написанным телом.
     *
     * Живое задание теперь видно по отметке жизни: `run` касается
     * `updated_at` на каждой стадии, а долгие стадии (тело — минуты) стучат
     * отдельным таймером. Брошенным считается то, что молчит дольше
     * `ABANDONED_MS`. Ошибиться в эту сторону дёшево: задание, которое
     * действительно умерло, провалится на следующем подъёме.
     */
    const stuck = this.db.prepare(
      `SELECT id, kind, account_id FROM job
        WHERE state IN ('queued', 'running') AND updated_at < ?`,
    ).all(Date.now() - ABANDONED_MS);
    if (stuck.length) {
      const ids = stuck.map((j) => j.id);
      this.db.prepare(
        `UPDATE job SET state = 'failed', error_code = 'server_restarted',
                error_msg = 'сервер перезапустился во время генерации', updated_at = ?
         WHERE id IN (${ids.map(() => '?').join(',')})`,
      ).run(Date.now(), ...ids);
      /*
       * ПРАВО НА БЕСПЛАТНОЕ СУЩЕСТВО ВОЗВРАЩАЕТСЯ — так же, как на обычном
       * провале.
       *
       * F7 даёт игроку одно бесплатное существо за всю жизнь аккаунта, и
       * `POST /api/creature` забирает это право АТОМАРНО, до начала работы —
       * иначе шесть одновременных запросов создали бы шесть существ. Обычный
       * провал право возвращает (E5: за неудавшуюся генерацию не платят). А
       * обрыв по перезапуску возвращать было некому: процесс, который вернул
       * бы, и есть тот, который умер.
       *
       * Итог: единственный за всю жизнь бесплатный слот сгорал от нашего
       * `Ctrl+C`, и вернуть его игрок не мог ничем.
       */
      const back = this.db.prepare(
        'UPDATE account SET free_creature_used = 0 WHERE id = ? AND free_creature_used = 1',
      );
      let restored = 0;
      for (const j of stuck) {
        if (j.kind === 'create' && j.account_id) restored += back.run(j.account_id).changes;
      }
      this.staleClosed = stuck.length;
      this.staleRestored = restored;
    }

        this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.pump(), 400);
    this.timer.unref?.();
  }

  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  enqueue({ accountId, kind, bundle, creatureId = null, payload = {} }) {
    const id = `j_${randomUUID().slice(0, 12)}`;
    const now = Date.now();
    this.db.prepare(`INSERT INTO job (id, account_id, kind, state, stage, progress, creature_id,
        payload_json, created_at, updated_at) VALUES (?,?,?,'queued','в очереди',0,?,?,?,?)`)
      .run(id, accountId, kind, creatureId, JSON.stringify({ ...payload, bundle: bundle.bundle }), now, now);
    this.queue.push({ id, bundle });
    return this.db.prepare('SELECT * FROM job WHERE id = ?').get(id);
  }

  update(id, patch) {
    const cols = []; const vals = [];
    for (const [k, v] of Object.entries(patch)) { cols.push(`${k} = ?`); vals.push(v); }
    cols.push('updated_at = ?'); vals.push(Date.now());
    vals.push(id);
    this.db.prepare(`UPDATE job SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
  }

  pump() {
    this.reap();
    while (this.running < LIMITS.maxConcurrent && this.queue.length) {
      const item = this.queue.shift();
      this.running++;
      this.run(item).catch((e) => {
        /*
         * ПРАВО НА БЕСПЛАТНОЕ СУЩЕСТВО ВОЗВРАЩАЕТСЯ ПРИ ЛЮБОМ ПРОВАЛЕ.
         *
         * Возврат стоял только на честной ветке `out.ok === false` и на
         * подъёме процесса для заданий в `queued/running`. Если `run()`
         * БРОСАЛ — а трассы для этого были открыты, — задание помечалось
         * `failed`, флаг оставался поднятым, и стартовый возврат его уже не
         * видел: он смотрит только на незавершённые.
         *
         * Дальше — состояние без выхода, переживающее рестарт: аккаунт с
         * `free_creature_used = 1`, нулём существ и `429 free_used` навсегда.
         * F7 даёт это право один раз за жизнь, значит терять его нельзя ни
         * при каком исходе, кроме успеха. E5 говорит то же про деньги: за
         * неудачу не платят.
         *
         * Возврат условный (`AND free_creature_used = 1`) и по владельцу
         * задания — чужого права он не трогает.
         */
        this.update(item.id, { state: 'failed', error_code: 'internal', error_msg: String(e.message).slice(0, 200) });
        try {
          const row = this.db.prepare('SELECT account_id, kind FROM job WHERE id = ?').get(item.id);
          if (row && row.kind !== 'refactor' && row.account_id) {
            this.db.prepare(
              'UPDATE account SET free_creature_used = 0 WHERE id = ? AND free_creature_used = 1',
            ).run(row.account_id);
          }
        } catch { /* возврат права не имеет права уронить обработку отказа */ }
      }).finally(() => {
        this.running--;
        /* Отметка жизни снимается ЗДЕСЬ, а не в `run`: `run` может бросить в
           любой точке, а таймер, оставшийся на мёртвом задании, будет стучать
           в базу до конца процесса и держать задание «живым» вечно. */
        const beat = this.beats && this.beats.get(item.id);
        if (beat) { clearInterval(beat); this.beats.delete(item.id); }
      });
    }
  }

  /**
   * Подобрать задания, брошенные ЧУЖИМ упавшим процессом.
   *
   * Уборка на подъёме закрывает только те, что умерли ДО нашего старта. Если
   * второй процесс с той же базой упал уже после — его задание останется
   * `running` навсегда, и экран игрока будет вечно показывать «идёт
   * генерация». Раньше это было незаметно, потому что уборка валила всё
   * подряд; с отметкой жизни (D165) нужен отдельный проход.
   *
   * Свои задания не трогаются: `this.beats` знает, что мы ведём сами.
   */
  reap(now = Date.now()) {
    if (now - (this.reapedAt || 0) < ABANDONED_MS) return;
    this.reapedAt = now;
    const stale = this.db.prepare(
      `SELECT id, kind, account_id FROM job
        WHERE state IN ('queued', 'running') AND updated_at < ?`,
    ).all(now - ABANDONED_MS).filter((j) => !(this.beats && this.beats.has(j.id)));
    if (!stale.length) return;
    const ids = stale.map((j) => j.id);
    this.db.prepare(
      `UPDATE job SET state = 'failed', error_code = 'server_restarted',
              error_msg = 'сервер перезапустился во время генерации', updated_at = ?
       WHERE id IN (${ids.map(() => '?').join(',')})`,
    ).run(now, ...ids);
    const back = this.db.prepare(
      'UPDATE account SET free_creature_used = 0 WHERE id = ? AND free_creature_used = 1',
    );
    for (const j of stale) if (j.kind === 'create' && j.account_id) back.run(j.account_id);
  }

  async run({ id, bundle }) {
    const row = this.db.prepare('SELECT * FROM job WHERE id = ?').get(id);
    if (!row || row.state !== 'queued') return;
    /*
     * ОТМЕТКА ЖИЗНИ. Без неё «долгая стадия» и «мёртвый процесс» для
     * подъёма соседа выглядят одинаково: стадия тела идёт минутами и не
     * трогает строку ни разу.
     *
     * Таймер снимается в `finally` ниже — иначе он держит процесс живым и
     * стучит в базу по заданию, которое давно кончилось.
     */
    const beat = setInterval(() => {
      try { this.db.prepare('UPDATE job SET updated_at = ? WHERE id = ? AND state = ?').run(Date.now(), id, 'running'); } catch { /* база занята — стукнем в следующий раз */ }
    }, HEARTBEAT_MS);
    beat.unref?.();
    this.beats = this.beats || new Map();
    this.beats.set(id, beat);
    const payload = JSON.parse(row.payload_json || '{}');
    /* Код едет рядом с русской подписью: подпись — для человека, код — для
       экрана ожидания, которому нельзя разбирать прозу (см. миграцию в db.js). */
    const stage = (s, p) => this.update(id, {
      state: 'running', stage: STAGE_RU[s] || s, stage_code: s, progress: p,
    });
    stage('parse', 0.05);

    const started = Date.now();
    const out = await forgeCreature({
      prompt: payload.prompt || (row.kind === 'refactor' ? refactorPrompt(this.db, row.creature_id) : ''),
      bundle,
      catalog: this.ctx.catalog.current(),
      archetypeHint: row.kind === 'refactor' ? archetypeOf(this.db, row.creature_id) : payload.archetype,
      /* Рефактор меняет мозг, а не набор (F3): отдаём конвейеру существующий,
         иначе он разберёт промпт заново и напишет мозг под другие умения. */
      keepKit: row.kind === 'refactor' ? kitOfCreature(this.db, row.creature_id) : null,
      onStage: stage,
      /* Отказ тела — наш показатель, а не жалоба игрока: существо рождается и
         без тела, и без этой строки доля отказов не считается ничем. */
      onEvent: (name, props) => trackEvent(this.db, { name, accountId: row.account_id || null, props }),
    });

    /* Трата пишется в любом случае: провайдер списал независимо от того,
       понравился ли нам результат. `accepted` — про игрока, `usd` — про нас. */
    recordSpend(this.db, { accountId: row.account_id, jobId: id, usd: out.costUsd || 0, accepted: !!out.ok });
    this.update(id, { cost_usd: out.costUsd || 0, attempts: (row.attempts || 0) + 1 });

    if (!out.ok) {
      this.update(id, { state: 'failed', error_code: out.code, error_msg: out.message, progress: 1, stage: 'не получилось' });
      /* Право на бесплатное существо возвращается: E5 говорит, что за
         неудавшуюся генерацию игрок не платит, а единственная валюта, которой
         он тут платит, — это его единственная попытка. */
      if (row.kind === 'create' && row.account_id) {
        this.db.prepare('UPDATE account SET free_creature_used = 0 WHERE id = ?').run(row.account_id);
      }
      trackEvent(this.db, { name: 'create_failed', accountId: row.account_id, props: { jobId: id, code: out.code } });
      return;
    }

    if (row.kind === 'refactor') {
      await this.finishRefactor(row, out, id);
    } else {
      const c = createCreature(this.db, {
        ownerId: row.account_id,
        name: out.name, archetype: out.archetype, bodyRef: out.bodyRef,
        bodySource: out.bodySource, bodySafe: out.bodySafe, bodyDraws: out.bodyDraws,
        kit: out.kit, brainSource: out.brainSource, brainModel: out.brainModel,
        constantsVersion: out.constantsVersion, prompt: payload.prompt,
        unfit: out.unfit, tacticsCard: out.tacticsCard, vfxIr: out.vfxIr,
        /* §5.1: подмену и несобравшееся тело игрок обязан прочитать. */
        birthNote: out.note,
        size: out.size,
        /* Промпт этого мозга описывал именно этот набор — см. pipeline. */
        kitActive: true,
        season: this.ctx.kv.get('season', { n: 1 }).n,
      });
      /* Флаг уже поставлен атомарно на приёме запроса — см. api.js. */
      this.update(id, { state: 'done', creature_id: c.id, progress: 1, stage: 'готово' });
      trackEvent(this.db, {
        name: 'create_done', accountId: row.account_id,
        props: { jobId: id, ms: Date.now() - started, attempts: 1, fallback: out.note?.length ? 1 : 0 },
      });
    }
  }

  /**
   * D4 — рефактор проверяется ДО замены и откатывается при ухудшении.
   *
   * §7.2·3: «генерируем кандидата → прогоняем 200 матчей против действующего
   * мозга (14 секунд, $0) → показываем «61 из 100» → списываем только при
   * принятии». §7.1: заплатить и получить хуже — это «заплати, чтобы починить
   * наш баг» в момент максимального раздражения.
   */
  async finishRefactor(row, out, id) {
    const c = this.db.prepare('SELECT * FROM creature WHERE id = ?').get(row.creature_id);
    if (!c) { this.update(id, { state: 'failed', error_code: 'no_creature', error_msg: 'существо исчезло' }); return; }
    this.update(id, { stage: STAGE_RU.duel, progress: 0.95 });

    const score = await this.ctx.duel(out.brainSource, c.brain_source, c.archetype,
      { kit: kitOf(c), build: buildOf(c) });
    const better = score.candidate > score.incumbent;

    this.db.prepare(`INSERT INTO adaptation (id, creature_id, at, kind, summary, score_before, score_after, accepted)
                     VALUES (?,?,?,?,?,?,?,?)`).run(
      `a_${randomUUID().slice(0, 12)}`, c.id, Date.now(), 'refactor',
      better
        ? `Новый мозг выиграл ${score.candidate} из ${score.rounds} у прежнего — заменён.`
        : `Новый мозг выиграл ${score.candidate} из ${score.rounds} у прежнего — прежний оставлен.`,
      score.incumbent, score.candidate, better ? 1 : 0,
    );

    if (better) {
      applyRefactor(this.db, c.id, {
        brainSource: out.brainSource, brainModel: out.brainModel,
        constantsVersion: out.constantsVersion, tacticsCard: out.tacticsCard,
      });
    }
    this.update(id, {
      state: 'done', creature_id: c.id, progress: 1,
      stage: better ? 'мозг заменён' : 'прежний мозг оказался лучше',
    });
    trackEvent(this.db, { name: 'refactor_done', accountId: row.account_id, props: { creatureId: c.id, better: better ? 1 : 0 } });
  }
}

/** Что показывает экран ожидания. Спиннер запрещён (§10.3) — стадии настоящие. */
export const STAGE_RU = {
  parse: 'читаю описание',
  brain: 'модель пишет мозг',
  brain_retry: 'первая попытка не удалась, пробую ещё',
  /* Самая длинная стадия: тело рисуется дольше мозга в разы. */
  body: 'дорисовываю тело',
  /* Без этой строки экран ожидания на второй попытке тела показывал бы
     `body_retry` латиницей: `stage` падает на `STAGE_RU[s] || s`. */
  body_retry: 'тело не вышло с первого раза, рисую другой моделью',
  validate: 'проверяю мозг двумя пробными боями',
  duel: 'свожу новый мозг со старым, 200 боёв',
  card: 'записываю, как оно собирается драться',
  done: 'готово',
};

/** Набор существа как он лежит в базе — для рефактора (F3). */
const kitOfCreature = (db, id) => {
  const row = db.prepare('SELECT kit_json FROM creature WHERE id = ?').get(id);
  try { const k = JSON.parse(row?.kit_json || 'null'); return Array.isArray(k) && k.length ? k : null; }
  catch { return null; }
};
const archetypeOf = (db, id) => db.prepare('SELECT archetype FROM creature WHERE id = ?').get(id)?.archetype || 'octopus';
const refactorPrompt = (db, id) => db.prepare('SELECT prompt FROM creature WHERE id = ?').get(id)?.prompt || '';
