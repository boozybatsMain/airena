/**
 * Все маршруты Airena.
 *
 * Три правила, которым подчинён каждый обработчик ниже:
 *
 *  A3 — результат, влияющий на ранг, считается на сервере из seed. Клиент
 *       не сообщает исходов вообще: у него нет ни одного маршрута, который
 *       принимал бы результат боя.
 *  F11/N19 — исходник мозга игрока не покидает сервер. Наружу ходит только
 *       `card()`; `brain_source` не читается ни одним ответом. Единственное
 *       исключение — шесть эталонных мозгов репозитория и `stub`: это научный
 *       артефакт docs/EXPERIMENT.md, а не конкурентная поверхность.
 *  E6/N1 — ни цены, ни валюты, ни кнопки покупки. Каталог отдаёт ТИР
 *       («бесплатно» / «платно»), а не сумму; сумма не пересекает границу
 *       процесса. Это проверяет tools/checkscope.mjs.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  ARENA_HALF, FIGHTERS, MATCH_SECONDS, OBSTACLES, SKILLS,
  SUDDEN_DEATH_AT, SUDDEN_DEATH_RAMP, THINK_HZ, TICK_HZ, WALL_HEIGHT,
} from '../core/config.js';
import { constantsVersion } from '../core/version.js';
import { grammar, validateKit, costOf } from '../skills/registry.js';
import { record as trackEvent, metrics } from './analytics.js';
import { card, history, refactor as applyRefactor, sinceSummary } from './creatures.js';
import { Router, cookies, fail, json, readJson, setCookie } from './http.js';
import { ladderView, modelTable } from './ladder.js';
import * as limits from './limits.js';
import { accountFromToken, claimAccount, ensureGuest } from './session.js';

/** Мозги, чей исходник читаем: научный артефакт §1 (F11, единственное исключение). */
const OPEN_BRAIN_TAGS = /^(u[1-6]|stub)$/;

export const SIM_CONFIG = {
  arena: { half: ARENA_HALF, wallHeight: WALL_HEIGHT, obstacles: OBSTACLES },
  fighters: FIGHTERS,
  skills: SKILLS,
  tickHz: TICK_HZ,
  thinkHz: THINK_HZ,
  matchSeconds: MATCH_SECONDS,
  suddenDeathAt: SUDDEN_DEATH_AT,
  suddenDeathRamp: SUDDEN_DEATH_RAMP,
};

export function buildRouter(ctx) {
  const { db, loop, jobs, catalog, root } = ctx;
  const r = new Router();

  // ── кто это ────────────────────────────────────────────────────────────
  /** Сессия заводится молча: гость — не помеха, а первая половина воронки. */
  function who(req, res) {
    const c = cookies(req);
    /* D22: заголовок авторитетнее куки. Кука — запасной путь для собственного
       домена; внутри iframe GENEX её может не быть вовсе. */
    const h = req.headers.authorization;
    const bearer = h && h.startsWith('Bearer ') ? h.slice(7) : null;
    let acct = accountFromToken(db, bearer || c.a);
    if (!acct) {
      const g = ensureGuest(db, bearer || c.a);
      acct = g.account;
      setCookie(res, 'a', g.token);
      /* Клиент кладёт этот токен в localStorage и дальше шлёт заголовком. */
      res.setHeader('x-airena-session', g.token);
      if (g.fresh) trackEvent(db, { name: 'visit', accountId: acct.id, props: { guest: true } });
    }
    return acct;
  }
  ctx.who = who;

  r.get('/api/config', (req, res) => json(res, SIM_CONFIG));
  r.get('/api/grammar', (req, res) => json(res, grammar()));

  r.get('/api/session', (req, res) => {
    const acct = who(req, res);
    const mine = db.prepare(`SELECT * FROM creature WHERE owner_id = ? AND state = 'active'
                             ORDER BY created_at DESC LIMIT 1`).get(acct.id);
    const activeJob = db.prepare(`SELECT * FROM job WHERE account_id = ? AND state IN ('queued','running')
                                  ORDER BY created_at DESC LIMIT 1`).get(acct.id);
    const season = ctx.kv.get('season', { n: 1, endsAt: null, prizeCoins: 4500 });
    const away = acct.last_seen_at ? Date.now() - acct.last_seen_at : 0;

    json(res, {
      guest: !!acct.is_guest,
      accountId: acct.id,
      canCreate: !acct.is_guest && !acct.free_creature_used,
      /* D1: гость не запускает генерацию. Причина отдаётся кодом, чтобы экран
         показал стену аккаунта, а не общую ошибку. */
      createBlocked: acct.is_guest ? 'guest' : (acct.free_creature_used ? 'free_used' : null),
      creature: mine ? card(mine, { viewerId: acct.id }) : null,
      job: activeJob ? jobView(activeJob) : null,
      nextFightAt: mine ? loop.nextFightAt(mine.id) : null,
      liveMatch: ctx.live.describe(),
      season,
      constantsVersion: constantsVersion(),
      since: mine && away > 30 * 60e3 ? sinceSummary(db, mine.id, acct.last_seen_at) : null,
      limits: limits.status(db),
    });
  });

  /** Стена аккаунта. Токен GENEX проверяет платформа; мы получаем sub и почту. */
  r.post('/api/session/claim', async (req, res) => {
    const acct = who(req, res);
    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'не удалось прочитать запрос'); }
    const claim = ctx.verifyEmbedToken(body.embedToken);
    if (!claim) return fail(res, 401, 'bad_token', 'платформа не подтвердила личность');
    const out = claimAccount(db, acct.is_guest ? acct.id : null, claim);
    if (out.error) return fail(res, 400, out.error, 'не удалось привязать аккаунт');
    setCookie(res, 'a', out.token, { days: 180 });
    res.setHeader('x-airena-session', out.token);
    trackEvent(db, { name: 'account_claimed', accountId: out.account.id, props: { moved: out.moved } });
    json(res, { ok: true, accountId: out.account.id, moved: out.moved });
  });

  // ── стартовые существа: гость ВЫБИРАЕТ, а не получает (D2) ─────────────
  r.get('/api/starters', (req, res) => {
    const rows = db.prepare(`SELECT * FROM creature WHERE is_library = 1 AND state = 'active'
                             ORDER BY rating DESC LIMIT 3`).all();
    json(res, rows.map((x) => card(x)));
  });

  // ── каталог моделей: тир, но НИКОГДА не сумма (D11) ────────────────────
  r.get('/api/catalog', (req, res) => {
    const acct = who(req, res);
    const cat = catalog.current();
    json(res, {
      /* Здесь нет ни одного числа в долларах. Тир, ярлык и причина блокировки —
         всё, что нужно экрану, и всё, что ему разрешено знать. */
      bundles: cat.bundles.map((b) => ({
        id: b.bundle,
        label: b.label,
        think: b.thinkLabel,
        tier: b.tier,
        measured: b.measured,
        available: b.tier === 'free',
        /* §2.2: реальные деньги в платформу пока не заходят вообще. */
        unavailableReason: b.tier === 'free' ? null : 'платежи платформы ещё не включены',
      })),
      canCreate: !acct.is_guest && !acct.free_creature_used,
      note: cat.bundles.some((b) => b.tier === 'paid')
        ? 'Платные авторы появятся, когда платформа включит платежи.' : null,
    });
  });

  // ── существо ───────────────────────────────────────────────────────────
  r.get('/api/creature/:id', (req, res) => {
    const acct = who(req, res);
    const row = db.prepare('SELECT * FROM creature WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'no_creature', 'такого существа нет');
    const c = card(row, { viewerId: acct.id });
    const view = ladderView(db, { creatureId: row.id, season: row.season });
    trackEvent(db, { name: 'creature_viewed', accountId: acct.id, props: { creatureId: row.id, mine: c.isMine } });
    json(res, {
      creature: c,
      rank: view.me?.rank ?? null,
      percentile: view.percentile,
      total: view.total,
      top100: view.me ? view.me.rank <= 100 : false,
      history: history(db, row.id, 20),
      adaptations: db.prepare(`SELECT id, at, kind, summary, score_before, score_after, accepted
                               FROM adaptation WHERE creature_id = ? ORDER BY at DESC LIMIT 12`).all(row.id),
      kitCost: c.kit.map(costOf),
      nextFightAt: loop.nextFightAt(row.id),
      /* D17: наблюдения — шкала до следующей адаптации, не валюта (N3). */
      observations: observationsOf(row),
    });
  });

  r.get('/api/creature/:id/history', (req, res) => {
    const row = db.prepare('SELECT id FROM creature WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'no_creature', 'такого существа нет');
    json(res, history(db, row.id, Number(req.query?.limit) || 40));
  });

  /** Смена кита — бесплатна, мгновенна, детерминирована (D3, §7.2·2, F10). */
  r.post('/api/creature/:id/kit', async (req, res) => {
    const acct = who(req, res);
    const row = db.prepare('SELECT * FROM creature WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'no_creature', 'такого существа нет');
    if (row.owner_id !== acct.id) return fail(res, 403, 'not_yours', 'это не твоё существо');
    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'не удалось прочитать запрос'); }

    /* Бюджет пересчитывается ЗАНОВО на сервере: цифры, присланные клиентом
       или моделью, не авторитетны (§8). */
    const bad = validateKit(body.kit);
    if (bad.length) return fail(res, 422, 'bad_kit', 'кит не проходит правила', { violations: bad });

    db.prepare('UPDATE creature SET kit_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(body.kit), Date.now(), row.id);
    json(res, { ok: true, kit: body.kit, cost: body.kit.map(costOf) });
  });

  // ── генерация ──────────────────────────────────────────────────────────
  r.post('/api/creature', async (req, res) => {
    const acct = who(req, res);
    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'не удалось прочитать запрос'); }

    const bundle = catalog.find(body.bundle);
    if (!bundle) return fail(res, 400, 'no_bundle', 'такой модели нет в каталоге');
    if (bundle.tier !== 'free') {
      /* E6: покупок в v1 нет ни в каком виде, включая заглушку. Отказ честный
         и объясняет причину, а не предлагает несуществующую кнопку. */
      return fail(res, 402, 'not_free', 'платежи платформы ещё не включены', { bundle: bundle.bundle });
    }
    const gate = limits.check(db, { account: acct, bundle, kind: 'create' });
    if (!gate.ok) {
      trackEvent(db, { name: 'limit_denied', accountId: acct.id, props: { code: gate.code } });
      return fail(res, gate.code === 'guest' ? 401 : 429, gate.code, gate.message, { retryAt: gate.retryAt });
    }

    const prompt = String(body.prompt || '').slice(0, 400).trim();
    if (prompt.length < 3) return fail(res, 422, 'short_prompt', 'опиши существо хотя бы несколькими словами');

    const job = jobs.enqueue({
      accountId: acct.id, kind: 'create', bundle,
      payload: { prompt, archetype: body.archetype || null, kitPreset: body.kitPreset || null },
    });
    trackEvent(db, { name: 'create_submitted', accountId: acct.id,
      props: { bundle: bundle.bundle, archetype: body.archetype, promptChars: prompt.length } });
    json(res, jobView(job), 202);
  });

  r.post('/api/creature/:id/refactor', async (req, res) => {
    const acct = who(req, res);
    const row = db.prepare('SELECT * FROM creature WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'no_creature', 'такого существа нет');
    if (row.owner_id !== acct.id) return fail(res, 403, 'not_yours', 'это не твоё существо');
    let body;
    try { body = await readJson(req); } catch { body = {}; }
    const bundle = catalog.find(body.bundle) || catalog.cheapestFree();
    if (!bundle) return fail(res, 503, 'no_catalog', 'каталог моделей недоступен');
    const gate = limits.check(db, { account: acct, bundle, kind: 'refactor' });
    if (!gate.ok) {
      trackEvent(db, { name: 'limit_denied', accountId: acct.id, props: { code: gate.code } });
      return fail(res, 429, gate.code, gate.message, { retryAt: gate.retryAt });
    }
    const job = jobs.enqueue({ accountId: acct.id, kind: 'refactor', bundle, creatureId: row.id, payload: {} });
    trackEvent(db, { name: 'refactor_submitted', accountId: acct.id, props: { creatureId: row.id, bundle: bundle.bundle } });
    json(res, jobView(job), 202);
  });

  r.get('/api/job/:id', (req, res) => {
    const acct = who(req, res);
    const j = db.prepare('SELECT * FROM job WHERE id = ?').get(req.params.id);
    if (!j) return fail(res, 404, 'no_job', 'такой генерации нет');
    if (j.account_id && j.account_id !== acct.id) return fail(res, 403, 'not_yours', 'это не твоя генерация');
    json(res, jobView(j));
  });

  // ── лестница и таблицы ─────────────────────────────────────────────────
  r.get('/api/ladder', (req, res) => {
    const acct = who(req, res);
    const mine = db.prepare(`SELECT id, season FROM creature WHERE owner_id = ? AND state='active'
                             ORDER BY created_at DESC LIMIT 1`).get(acct.id);
    const season = ctx.kv.get('season', { n: 1 });
    const view = ladderView(db, { creatureId: mine?.id ?? null, season: mine?.season ?? season.n });
    trackEvent(db, { name: 'ladder_viewed', accountId: acct.id, props: { rank: view.me?.rank ?? null } });
    json(res, { ...view, seasonMeta: season });
  });

  r.get('/api/models', (req, res) => {
    const season = ctx.kv.get('season', { n: 1 });
    json(res, modelTable(db, season.n));
  });

  // ── матч ───────────────────────────────────────────────────────────────
  r.get('/api/match/:id', (req, res) => {
    const m = db.prepare(`SELECT m.*, ca.name AS a_name, cb.name AS b_name,
                                 ca.kit_json AS a_kit, cb.kit_json AS b_kit,
                                 ca.tactics_card AS a_card, cb.tactics_card AS b_card,
                                 ca.brain_model AS a_model, cb.brain_model AS b_model
                          FROM match m
                          JOIN creature ca ON ca.id = m.a_id
                          JOIN creature cb ON cb.id = m.b_id
                          WHERE m.id = ?`).get(req.params.id);
    if (!m) return fail(res, 404, 'no_match', 'такого боя нет');
    const result = m.result_json ? JSON.parse(m.result_json) : null;
    json(res, {
      id: m.id, seed: m.seed, at: m.ended_at, seconds: m.seconds,
      winner: m.winner, reason: m.reason, kind: m.kind,
      constantsVersion: m.constants_version,
      a: side(m, 'a'), b: side(m, 'b'),
      /* D5: разбор боя собирается детерминированно из лога, без вызова LLM. */
      beats: result ? beatsFrom(result.log || [], m) : [],
      stats: result ? { octopus: result.octopus, gorilla: result.gorilla } : null,
    });
  });

  // ── аналитика (A7) ─────────────────────────────────────────────────────
  r.post('/api/events', async (req, res) => {
    const acct = who(req, res);
    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'не удалось прочитать запрос'); }
    const list = Array.isArray(body.events) ? body.events.slice(0, 32) : [];
    let ok = 0;
    for (const e of list) if (trackEvent(db, { name: e.name, accountId: acct.id, props: e.props || {} }).ok) ok++;
    json(res, { accepted: ok, of: list.length });
  });

  r.get('/api/metrics', (req, res) => json(res, metrics(db)));
  r.get('/api/limits', (req, res) => json(res, limits.status(db)));
  r.get('/api/health', (req, res) => json(res, {
    ok: true, constantsVersion: constantsVersion(),
    creatures: db.prepare(`SELECT count(*) AS n FROM creature WHERE state='active'`).get().n,
    matches: db.prepare('SELECT count(*) AS n FROM match').get().n,
    loop: loop.stats,
  }));

  /* Дев-режим: список тегов для выпадающих списков вьювера. В продакшене
     маршрута нет — не «скрыт», а не зарегистрирован. */
  if (ctx.dev) {
    r.get('/api/brains', (req, res) => {
      const dir = join(root, 'brains');
      if (!existsSync(dir)) return json(res, []);
      const tags = readdirSync(dir).filter((d) => OPEN_BRAIN_TAGS.test(d)
        && existsSync(join(dir, d, 'octopus.js')) && existsSync(join(dir, d, 'gorilla.js')));
      json(res, tags.map((tag) => ({ tag, octopus: null, gorilla: null, has: { octopus: true, gorilla: true } })));
    });
  }

  // ── научный артефакт: шесть эталонных мозгов остаются читаемыми (F11) ──
  r.get('/api/source/:tag/:id', (req, res) => {
    const { tag, id } = req.params;
    if (!OPEN_BRAIN_TAGS.test(tag) || !/^(octopus|gorilla)$/.test(id)) {
      /* Не 404, а 403 с причиной: молчаливый 404 читается как «сломалось»,
         а здесь работает правило, и правило стоит назвать. */
      return fail(res, 403, 'brain_closed',
        'исходник мозга закрыт: открыты только шесть эталонных мозгов репозитория');
    }
    const p = join(root, 'brains', tag, `${id}.js`);
    if (!existsSync(p)) return fail(res, 404, 'no_brain', 'такого мозга нет');
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(readFileSync(p, 'utf8'));
  });

  return r;
}

const side = (m, k) => ({
  id: m[`${k}_id`], name: m[`${k}_name`], slot: m[`${k}_slot`],
  model: m[`${k}_model`], kit: safe(m[`${k}_kit`]), tacticsCard: m[`${k}_card`],
  delta: Math.round(m[`${k}_delta`] * 10) / 10,
  ratingAfter: Math.round(m[`${k}_rating_after`] ?? 0),
});

const safe = (s) => { try { return JSON.parse(s); } catch { return []; } };

export function jobView(j) {
  return {
    id: j.id, kind: j.kind, state: j.state, stage: j.stage,
    progress: j.progress, creatureId: j.creature_id,
    error: j.error_code, errorMessage: j.error_msg,
    attempts: j.attempts, createdAt: j.created_at,
  };
}

/** Шкала наблюдений: сколько до следующей адаптации (D17, §7.2а). */
export function observationsOf(row) {
  const OBS_PER_ADAPT = 10;
  /* Поражение даёт вдвое больше материала — §7.2а буквально: «Существо с
     десятью поражениями адаптируется лучше, чем с десятью победами». */
  const earned = row.wins + row.draws + row.losses * 2;
  const spent = row.adaptations * OBS_PER_ADAPT;
  const have = Math.max(0, earned - spent);
  return { have, need: OBS_PER_ADAPT, frac: Math.min(1, have / OBS_PER_ADAPT) };
}

/**
 * Разбор боя из лога — детерминированный, без единого вызова LLM (D5).
 * Берём то, что в бою действительно произошло, а не пересказ.
 */
export function beatsFrom(log, m) {
  const out = [];
  const name = (slot) => (slot === m.a_slot ? m.a_name : m.b_name);
  for (const e of log) {
    if (!e || typeof e !== 'object') continue;
    if (e.kind === 'say') out.push({ t: e.t, who: name(e.who), type: 'say', text: e.text });
    else if (e.kind === 'hit') out.push({ t: e.t, who: name(e.who), type: 'hit', skill: e.skill, amount: e.amount });
    else if (e.kind === 'blocked') out.push({ t: e.t, who: name(e.who), type: 'blocked', skill: e.skill });
    else if (e.kind === 'miss') out.push({ t: e.t, who: name(e.who), type: 'miss', skill: e.skill });
  }
  return out.slice(-60);
}
