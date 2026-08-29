/**
 * Продуктовый сервер Airena.
 *
 * Собирает вместе всё остальное: БД, сессию, лимиты, лестницу, арену-цикл,
 * очередь генераций, живой показ и статику клиента. Дев-сервер вьювера
 * (`src/server/index.js`) остаётся отдельно и в продуктовый бандл не входит —
 * §7 спецификации экранов: дев-обвязка на продуктовой поверхности означает,
 * что посетитель читает исходник мозга на посадочной, а свой — уже не может.
 *
 * Запуск: `npm run serve`. Порт берётся с 8787 и идёт вверх, если занят.
 */

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocketServer } from 'ws';

import { compileBrain } from '../brain/host.js';
import { constantsVersion } from '../core/version.js';
import { adaptOnce, duelBrains } from './adapt.js';
import { buildRouter } from './api.js';
import { ArenaLoop } from './arena-loop.js';
import { openDb, kv as makeKv } from './db.js';
import { buildCatalog, fallbackBundle } from './forge/models.js';
import { cookies, fail, json, serveStatic } from './http.js';
import { Jobs } from './jobs.js';
import { Live } from './live.js';
import { buildStamp, stampHtml } from './stamp.js';
import { accountFromToken } from './session.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT || 8787);
const DEV = process.env.AIRENA_DEV === '1';

/** Что клиенту разрешено доставать по HTTP. */
const MOUNTS = [
  ['/vendor/', join(ROOT, 'node_modules/three/build')],
  ['/bodies/', join(ROOT, 'bodies')],
  ['/assets/', join(ROOT, 'preview/assets')],
  ['/fonts/', join(ROOT, 'src/client/fonts')],
  ['/viewer/', join(ROOT, 'src/viewer')],
  ['/', join(ROOT, 'src/client')],
];

/**
 * Компилятор мозга для матча.
 *
 * A1 требует изолята вместо `node:vm` для ЧУЖОГО мозга. Здесь одна дверь, и
 * подменить её — это одна строка: `src/server/sandbox.js` реализует изолят,
 * а до его включения дверь ведёт в существующий host.js. Дверь заведена
 * заранее намеренно: когда в матче окажется мозг игрока, менять придётся
 * ровно этот вызов, а не двенадцать мест.
 */
export function compileFor(creature, slot) {
  return compileBrain(creature.brain_source, `${creature.id}:${slot}`);
}

export function createApp({ dbFile = process.env.AIRENA_DB || join(ROOT, 'data/airena.db') } = {}) {
  const db = openDb(dbFile);
  const kv = makeKv(db);
  if (!kv.get('season')) {
    kv.set('season', { n: 1, startedAt: Date.now(), endsAt: null, prizeCoins: 4500, prizes: [1500, 1000, 600, 200, 200, 200, 200, 200, 200, 200] });
  }

  const catalog = makeCatalog();
  const loop = new ArenaLoop(db, {
    compile: compileFor,
    constantsVersion: constantsVersion(),
    adapt: (d, id) => adaptOnce(d, id),   // async: цикл ждёт её через .catch
    /* Замеренная тренировочная пара по сторонам — её считает tools/seed.mjs.
       Без неё первый бой новичка становится монетой (§16: 3.7% против 58.3%). */
    trainingIds: kv.get('training', {}).ids || null,
  });
  const live = new Live(db, { compile: compileFor });

  const ctx = {
    db, kv, loop, live, catalog, root: ROOT, dev: DEV,
    duel: (cand, inc, arch) => duelBrains(db, cand, inc, arch),
    verifyEmbedToken,
  };
  const jobs = new Jobs(db, ctx);
  ctx.jobs = jobs;

  const router = buildRouter({ ...ctx, jobs });

  /* Сыгранный матч сразу открывается трансляцией: «вошёл посреди боя —
     попадает сразу на арену» (§6.2) работает только если бой уже идёт. */
  loop.on((ev) => {
    if (ev.type !== 'match') return;
    const a = db.prepare('SELECT * FROM creature WHERE id = ?').get(ev.a);
    const b = db.prepare('SELECT * FROM creature WHERE id = ?').get(ev.b);
    if (a && b) live.open(ev.match, { a, b, featured: !!ev.showcase }).catch(() => {});
  });

  /*
   * Витрина никогда не пустеет.
   *
   * §10.5 отводит на «уже идёт бой» первые две секунды посадочной. Пока на
   * лестнице нет живых существ — а на старте их нет ни одного, — единственный
   * способ выполнить это обещание — гонять настоящие бои библиотечных существ
   * между собой. Проверка идёт раз в секунду и стоит один запрос к карте
   * трансляций.
   */
  let showcasing = false;
  const keepShowcase = setInterval(() => {
    /* Гонится ВСЕГДА, а не только когда кто-то смотрит. Иначе первый
       посетитель ждёт: сокет подключается после того, как загрузился весь
       three.js, и только тогда начинает считаться бой. §10.5 отводит на
       «уже идёт бой» две секунды; ждать их после загрузки рендерера
       значит не выполнить обещание ровно у того, ради кого оно давалось.
       Один прогон — 70 мс CPU, и держать витрину тёплой дешевле, чем
       объяснять пустой пол. */
    if (live.describe()) return;
    if (showcasing) return;
    showcasing = true;
    loop.showcase().catch(() => {}).finally(() => { showcasing = false; });
  }, 1200);
  keepShowcase.unref?.();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = decodeURIComponent(url.pathname);
    req.query = Object.fromEntries(url.searchParams);

    const hit = router.match(req.method, path);
    if (hit) {
      req.params = hit.params;
      try { await hit.handler(req, res); }
      catch (e) {
        console.error(`  ${req.method} ${path}: ${e.stack}`);
        if (!res.headersSent) fail(res, 500, 'internal', 'сервер не справился');
      }
      return;
    }

    if (path.startsWith('/api/')) return fail(res, 404, 'no_route', 'нет такого маршрута');

    /* Хеш-роуты (A3): любой путь без расширения — это клиент, и он сам
       разберётся по хешу. Отдаём index.html, а не 404. */
    const wantsPage = path === '/' || !/\.[a-z0-9]+$/i.test(path);
    if (wantsPage) return sendIndex(res);
    if (serveStatic(req, res, MOUNTS, path)) return;
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('нет такого файла');
  });

  /**
   * index.html отдаётся проштампованным: все свои ссылки получают `?v=`.
   * Это единственный файл, который нельзя кешировать, и единственный, который
   * решает, будут ли кешироваться остальные.
   */
  function sendIndex(res) {
    const v = buildStamp(ROOT, DEV);
    let html;
    try { html = readFileSync(join(ROOT, 'src/client/index.html'), 'utf8'); }
    catch { res.writeHead(500); return res.end('нет index.html'); }
    const body = stampHtml(html, v);
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      /* `no-cache` означает «перепроверь», и браузер перепроверяет — но не
         всегда: без ETag память вкладки отдаёт старый HTML, а вместе с ним
         старый штамп, и вся схема с версиями молча выключается. В дев-режиме
         это стоило часа поиска несуществующих багов. */
      'cache-control': DEV ? 'no-store' : 'no-cache',
      'content-length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') return;
    console.error(`  websocket: ${err.message}`);
  });

  wss.on('connection', (ws, req) => {
    const c = cookies(req);
    const token = bearer(req) || c.a;
    const acct = accountFromToken(db, token);
    const mine = acct
      ? db.prepare(`SELECT id FROM creature WHERE owner_id = ? AND state='active' ORDER BY created_at DESC LIMIT 1`).get(acct.id)
      : null;
    const sub = live.attach(ws, { creatureId: mine?.id ?? null, dev: DEV });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      /*
       * A16: повтор принимает ТОЛЬКО серверный match_id. Сервер сам достаёт
       * seed, оба мозга и constants_version. Брать личность мозга от клиента —
       * это нарушение A3 и F11 ровно в тот момент, когда мозги станут
       * принадлежать игрокам.
       */
      if (msg.cmd === 'replay' && typeof msg.matchId === 'string') {
        const m = db.prepare('SELECT * FROM match WHERE id = ?').get(msg.matchId);
        if (!m) { ws.send(JSON.stringify({ type: 'error', message: 'такого боя нет' })); return; }
        if (m.constants_version !== constantsVersion()) {
          ws.send(JSON.stringify({ type: 'error', code: 'stale_constants',
            message: 'этот бой шёл на других константах и точно не повторится' }));
          return;
        }
        const a = db.prepare('SELECT * FROM creature WHERE id = ?').get(m.a_id);
        const b = db.prepare('SELECT * FROM creature WHERE id = ?').get(m.b_id);
        if (!a || !b) { ws.send(JSON.stringify({ type: 'error', message: 'участника боя больше нет' })); return; }
        live.open({
          id: m.id, seed: m.seed, aSlot: m.a_slot, bSlot: m.b_slot,
          winner: m.winner, reason: m.reason,
          result: m.result_json ? JSON.parse(m.result_json) : null,
        }, { a, b, featured: false }).then((bc) => {
          if (bc) { sub.matchId = null; bc.at = 0; bc.over = null; live.deliver(sub); }
        }).catch(() => {});
        return;
      }
      if (msg.cmd === 'watch' && typeof msg.creatureId === 'string') {
        sub.creatureId = msg.creatureId; sub.matchId = null; live.deliver(sub);
      }
    });
  });

  return { db, kv, server, loop, live, jobs, catalog, ctx };
}

const bearer = (req) => {
  const h = req.headers.authorization;
  return h && h.startsWith('Bearer ') ? h.slice(7) : null;
};

/**
 * Каталог моделей, обновляемый живым прайсом.
 *
 * Не падаем, если OpenRouter недоступен: каталог держит последний удачный
 * снимок. Пустой каталог — это неработающая кнопка «создать», и объяснить её
 * игроку нечем.
 */
function makeCatalog() {
  let snapshot = { bundles: [], rejected: [], freeThreshold: 0.15, budgetUsd: 3.2, at: 0 };
  let refreshing = null;

  const refresh = async () => {
    if (refreshing) return refreshing;
    refreshing = buildCatalog()
      .then((c) => { snapshot = { ...c, at: Date.now() }; return c; })
      .catch((e) => { console.error(`  каталог моделей: ${e.message}`); return snapshot; })
      .finally(() => { refreshing = null; });
    return refreshing;
  };

  return {
    refresh,
    current: () => snapshot,
    find: (id) => snapshot.bundles.find((b) => b.bundle === id) || null,
    cheapestFree: () => snapshot.bundles.find((b) => b.tier === 'free') || null,
    fallback: (id) => fallbackBundle(snapshot, id),
  };
}

/**
 * Проверка embedToken GENEX.
 *
 * Личность даёт платформа (A4). До подключения стенда токен принимается в
 * дев-режиме как `{sub, email}` в base64url — и это записано здесь, а не
 * забыто: E8 требует перечитать со стенда всякое число и всякий контракт,
 * взятый из кода GENEX, до реализации.
 */
export function verifyEmbedToken(token) {
  if (typeof token !== 'string' || !token) return null;
  if (process.env.AIRENA_GENEX_PUBKEY) {
    /* TODO(E8): подпись платформы проверяется её публичным ключом. Стенд
       ещё не перечитан, ключа нет — и пока его нет, продакшен не поднимается:
       см. проверку в конце файла. */
    return null;
  }
  if (!DEV) return null;
  try {
    const p = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    return p.sub ? { sub: String(p.sub), email: p.email ? String(p.email) : null } : null;
  } catch { return null; }
}

/** Порт занят — берём следующий, а не роняем стек ревьюеру в лицо. */
function listen(server, port, attemptsLeft = 12) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`  ${port} занят, пробую ${port + 1}`);
      listen(server, port + 1, attemptsLeft - 1);
      return;
    }
    throw err;
  });
  server.listen(port);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  await app.catalog.refresh();
  app.loop.start(1000);
  app.live.start();
  app.jobs.start();
  setInterval(() => app.catalog.refresh(), 36e5).unref?.();

  app.server.once('listening', () => {
    const { port } = app.server.address();
    const cat = app.catalog.current();
    console.log(`\n  airena   http://localhost:${port}${DEV ? '   (дев-режим)' : ''}`);
    console.log(`  константы ${constantsVersion()}`);
    console.log(`  каталог  ${cat.bundles.filter((b) => b.tier === 'free').length} бесплатных, ${cat.bundles.filter((b) => b.tier === 'paid').length} платных связок`);
    const n = app.db.prepare(`SELECT count(*) AS n FROM creature WHERE state='active'`).get().n;
    console.log(`  существ  ${n}${n ? '' : '  — пусто, запусти: node tools/seed.mjs'}\n`);
  });
  listen(app.server, PORT);
}
