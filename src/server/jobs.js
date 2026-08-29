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

import { create as createCreature, refactor as applyRefactor } from './creatures.js';
import { LIMITS, recordSpend } from './limits.js';
import { record as trackEvent } from './analytics.js';
import { forgeCreature } from './forge/pipeline.js';

export class Jobs {
  constructor(db, ctx) {
    this.db = db;
    this.ctx = ctx;
    this.queue = [];
    this.running = 0;
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
    while (this.running < LIMITS.maxConcurrent && this.queue.length) {
      const item = this.queue.shift();
      this.running++;
      this.run(item).catch((e) => {
        this.update(item.id, { state: 'failed', error_code: 'internal', error_msg: String(e.message).slice(0, 200) });
      }).finally(() => { this.running--; });
    }
  }

  async run({ id, bundle }) {
    const row = this.db.prepare('SELECT * FROM job WHERE id = ?').get(id);
    if (!row || row.state !== 'queued') return;
    const payload = JSON.parse(row.payload_json || '{}');
    const stage = (s, p) => this.update(id, { state: 'running', stage: STAGE_RU[s] || s, progress: p });
    stage('parse', 0.05);

    const started = Date.now();
    const out = await forgeCreature({
      prompt: payload.prompt || (row.kind === 'refactor' ? refactorPrompt(this.db, row.creature_id) : ''),
      bundle,
      catalog: this.ctx.catalog.current(),
      kitPreset: payload.kitPreset,
      archetypeHint: row.kind === 'refactor' ? archetypeOf(this.db, row.creature_id) : payload.archetype,
      onStage: stage,
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
        kit: out.kit, brainSource: out.brainSource, brainModel: out.brainModel,
        constantsVersion: out.constantsVersion, prompt: payload.prompt,
        unfit: out.unfit, tacticsCard: out.tacticsCard,
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

    const score = await this.ctx.duel(out.brainSource, c.brain_source, c.archetype);
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
  validate: 'проверяю мозг двумя пробными боями',
  duel: 'свожу новый мозг со старым, 200 боёв',
  card: 'записываю, как оно собирается драться',
  done: 'готово',
};

const archetypeOf = (db, id) => db.prepare('SELECT archetype FROM creature WHERE id = ?').get(id)?.archetype || 'octopus';
const refactorPrompt = (db, id) => db.prepare('SELECT prompt FROM creature WHERE id = ?').get(id)?.prompt || '';
