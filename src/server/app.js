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
import { TICK_HZ } from '../core/config.js';
import { constantsVersion } from '../core/version.js';
import { adaptOnce, duelBrains } from './adapt.js';
import { buildRouter } from './api.js';
import { ArenaLoop, REST_MS } from './arena-loop.js';
import { sideKey, sideKeys, sideResult } from './creatures.js';
import { openDb, kv as makeKv } from './db.js';
import { buildCatalog, fallbackBundle } from './forge/models.js';
import { cookies, fail, json, serveStatic, crossSiteRefused } from './http.js';
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
  /*
   * Аддоны three — ОДИН файл, и он тут не для удобства.
   *
   * `PostProcessing` живёт в самой сборке, а узлы эффектов — в
   * `examples/jsm/tsl/display`. Bloom нужен потому, что аддитивное свечение
   * без него — это просто более яркие пиксели: два пула частиц в `vfx.js`
   * заведены ровно как обход этого (см. комментарий там). Своя реализация
   * значила бы 500 строк шейдерного кода рядом с проверенным UnrealBloom из
   * того же пакета, который уже лежит в vendor.
   *
   * Гейт объёма (`tools/checkscope.mjs`) обходит бандл по фактическим
   * ссылкам, поэтому монтирование папки не даёт «плюс сто файлов» — в бандл
   * попадает ровно то, что импортировано.
   */
  ['/vendor-addons/', join(ROOT, 'node_modules/three/examples/jsm')],
  ['/bodies/', join(ROOT, 'bodies')],
  /* Реестр грамматики — чистые данные, ни одного node-импорта. Экран берёт
     палитры элементов и русские имена атомов ОТТУДА ЖЕ, откуда сервер берёт
     цены: две копии палитры разошлись бы в первый же день. */
  ['/skills/', join(ROOT, 'src/skills')],
  ['/vfx/', join(ROOT, 'src/vfx')],
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
       Без неё первый бой новичка становится монетой (§16: 3.7% против 58.3%).
       Ключи приводятся к нынешним именам сторон: запись в `kv` сделана до
       переименования и лежит под старыми (мост — `sideKeys`). */
    trainingIds: (() => {
      const ids = kv.get('training', {}).ids;
      return ids ? sideKeys(ids) : null;
    })(),
    /* Замеренный винрейт пары (мозг, сторона) — тот, по которому партнёр и
       отобран. Экран показывает ЕГО, а не общее «слабее среднего»: у
       партнёра может быть 91% побед за всю жизнь против всей библиотеки, и
       тогда общее утверждение читается как ложь, хотя замер верен. */
    trainingRates: (() => {
      const picked = kv.get('training', {}).picked || {};
      const out = {};
      /* Тот же мост, что и у `trainingIds`: `picked` записан старыми именами
         сторон, а спрашивают его нынешними. */
      for (const [side, v] of Object.entries(picked)) if (v && typeof v.rate === 'number') out[sideKey(side)] = v.rate;
      return Object.keys(out).length ? out : null;
    })(),
  });
  const live = new Live(db, { compile: compileFor });

  const ctx = {
    db, kv, loop, live, catalog, root: ROOT, dev: DEV,
    /* `opts` доносит набор и РАЗМЕР действующего существа: дуэль двух мозгов
       обязана идти в той же игре, в которой существо живёт. */
    duel: (cand, inc, arch, opts = {}) => duelBrains(db, cand, inc, arch, opts),
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
    if (!a || !b) return;
    live.open(ev.match, { a, b, featured: !!ev.showcase, kind: ev.showcase ? 'showcase' : 'ranked' }).then((br) => {
      /*
       * Занятость уточняется по НАСТОЯЩЕЙ длине трансляции (D161).
       *
       * Резерв в `ArenaLoop` ставится от момента запуска зачётного прогона,
       * а показ начинается позже — после изолята и после второго прогона с
       * записью кадров. Разница до 2.5 секунд, и на ней существо уходило в
       * следующий бой, пока предыдущий ещё шёл на экране.
       */
      if (!br || !br.frames) {
        /*
         * Трансляция не открылась (насыщение, очередь, ошибка). Бойцов надо
         * освободить, иначе они простоят занятыми до верхней оценки —
         * пятьдесят секунд за бой, который никто не увидит.
         */
        const secs = Number(ev.match?.seconds) || 0;
        if (secs > 0) loop.holdUntil([ev.a, ev.b], Date.now() + secs * 1000);
        return;
      }
      /*
       * Здесь стоял ВТОРОЙ пересчёт занятости — по `frames.length / TICK_HZ`.
       * Он давал число, отличное от первого (`r.seconds` в `fightOnce`), и
       * отсчёт на карточке итога успевал откатиться назад: замерено
       * 4213 → 3114 → 4187 → 3096 мс. Обещание «через N» выполнялось, но
       * выглядело сломанным.
       *
       * Промежуточная оценка не нужна вовсе: первая уже равна длине матча, а
       * точный конец приходит событием `onFinish` ниже. Остаётся только
       * запомнить, кто дерётся, чтобы событию было кого освобождать.
       */
      br.fighters = [ev.a, ev.b];
    }).catch(() => {});
  });

  /*
   * ОТДЫХ НАЧИНАЕТСЯ, КОГДА ПОКАЗ КОНЧИЛСЯ, А НЕ КОГДА ПОСЧИТАЛИ.
   *
   * `holdUntil` выше ставит верхнюю оценку по `frames.length / TICK_HZ` —
   * по НОМИНАЛЬНЫМ тридцати кадрам. Настоящий темп 28.9–29.7 (таймер дрожит),
   * и на полном бое расхождение доходило до двух секунд НЕ В ТУ сторону:
   * резерв истекал раньше конца показа, и следующий бой начинался поверх
   * предыдущего.
   *
   * Момент известен точно — его знает `finish`. Пять секунд отдыха отсчитывает
   * `hold` от него.
   */
  live.onFinish((b) => {
    if (!b.fighters) return;
    loop.holdUntil(b.fighters, Date.now());
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
    /*
     * ВИТРИНА ЖДЁТ ОТДЫХ, А НЕ ЛИНГ (D161).
     *
     * Здесь стояло «идёт какая-нибудь трансляция — не запускаем», а
     * `describe()` возвращает трансляцию ещё двенадцать секунд после конца
     * боя, чтобы опоздавший увидел исход. То есть между витринными боями
     * зияло двенадцать секунд статичного пола — при том, что основатель
     * просил ровно обратного: бои по кулдауну.
     *
     * Теперь ждём столько же, сколько ждёт существо игрока: `REST_MS`.
     * Досмотреть исход всё ещё можно — трансляция не удаляется, она просто
     * перестаёт блокировать следующую.
     */
    const shown = live.describe();
    if (shown && !shown.over) return;
    if (shown && shown.over && (shown.overFor ?? 0) < REST_MS) return;
    if (showcasing) return;
    showcasing = true;
    /* Кого ждут подключённые гости — витрина показывает его, а не «кого-нибудь».
       Иначе выбор из тройки не значит ничего (см. `showcase`). */
    loop.showcase(undefined, { prefer: live.wanted?.() ?? null })
      .catch(() => {}).finally(() => { showcasing = false; });
  }, 1200);
  keepShowcase.unref?.();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = decodeURIComponent(url.pathname);
    req.query = Object.fromEntries(url.searchParams);

    const hit = router.match(req.method, path);
    if (hit) {
      /* Чужая страница не имеет права действовать от имени игрока — проверка
         стоит ОДНА на все мутирующие ручки, а не по одной в каждой (см.
         `crossSiteRefused`). Поштучно её однажды забыли бы добавить. */
      const cross = crossSiteRefused(req);
      if (cross) return fail(res, 403, cross.code, cross.message);
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

  /**
   * Совпадает ли источник соединения с нашим хостом.
   *
   * Отсутствие `Origin` — это НЕ браузер (curl, наш инструмент, тест), и такое
   * соединение допускается, но анонимно: куку у него не читают.
   */
  const sameSite = (req) => {
    const o = req.headers.origin;
    if (!o) return true;
    try { return new URL(o).host === req.headers.host; } catch { return false; }
  };

  /*
   * ОТКАЗ НА РУКОПОЖАТИИ, А НЕ ПОСЛЕ НЕГО.
   *
   * Первая версия проверяла источник внутри `connection` и закрывала сокет
   * кодом 1008. Работало — но чужая страница успевала получить событие
   * `open`, то есть узнать, что сервер жив и что путь верен. `verifyClient`
   * отвечает 401 до апгрейда: соединения не возникает вовсе.
   */
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: ({ req }, done) => (sameSite(req) ? done(true) : done(false, 401, 'cross-site')),
    /*
     * Из предложенных подпротоколов выбирается «airena» и только он.
     *
     * Клиент шлёт два: имя протокола и токен сессии (см. `connect` во
     * вьювере). Ответить надо ОДНИМ и обязательно из предложенных — иначе
     * браузер рвёт соединение сразу после рукопожатия. Отражать токен назад
     * нельзя тем более: он ушёл бы в заголовок ответа.
     */
    handleProtocols: (protocols) => (protocols.has('airena') ? 'airena' : false),
  });
  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') return;
    console.error(`  websocket: ${err.message}`);
  });

  wss.on('connection', (ws, req) => {
    /*
     * СОКЕТ ПРОВЕРЯЕТ ИСТОЧНИК ТАК ЖЕ, КАК HTTP.
     *
     * `crossSiteRefused` стоит на маршрутизаторе, и её собственный комментарий
     * обещает «одну проверку на все ручки — поштучно её однажды забыли бы
     * добавить». Забыли ровно здесь: CORS на WebSocket не распространяется,
     * кука обязана быть `SameSite=None` (F8), значит браузер приложит её к
     * рукопожатию С ЛЮБОЙ СТРАНИЦЫ.
     *
     * Что при этом утекало: сокет узнаёт сессию и первым же сообщением
     * отдаёт бой ЕГО существа. То есть чужая страница получала связку «этот
     * посетитель владеет существом X» — её нет ни в лестнице, ни в одном
     * публичном ответе, — и дальше читала его бои и слала `replay`.
     *
     * Проверяется мягко: соединение без `Origin` (наш же инструмент, тест,
     * не-браузер) допускается АНОНИМНО — кука игнорируется, показывается
     * витрина. Чужой `Origin` закрывает соединение сразу.
     */
    /* Чужой источник сюда не доходит — его отверг `verifyClient`. Соединение
       без `Origin` доходит, но сессию у него не читают: кука ставится
       браузером, а браузер `Origin` шлёт всегда. */
    const fromBrowser = !!req.headers.origin;
    const c = fromBrowser ? cookies(req) : {};
    /*
     * ТОКЕН ИЗ ПОДПРОТОКОЛА — ГЛАВНЫЙ ИСТОЧНИК, КУКА ЗАПАСНОЙ.
     *
     * D22 увёл сессию в `Authorization: Bearer`, потому что продукт живёт в
     * чужом iframe (F8) и куки там может не быть. Рукопожатие WebSocket из
     * браузера заголовков не принимает, поэтому сокет опознавался только
     * кукой — и в проде оставался анонимным: без «ТВОЁ», без «твой бой», без
     * перебивки «свой бой забирает экран». Клиент шлёт токен вторым
     * подпротоколом (`['airena', <token>]`); в строку запроса и в логи прокси
     * он при этом не попадает.
     */
    const proto = String(req.headers['sec-websocket-protocol'] || '')
      .split(',').map((x) => x.trim()).filter(Boolean);
    const fromProto = proto[0] === 'airena' && proto[1] ? proto[1] : null;
    const token = (fromBrowser ? (fromProto || bearer(req)) : null) || c.a;
    const acct = accountFromToken(db, token);
    const mine = acct
      ? db.prepare(`SELECT id FROM creature WHERE owner_id = ? AND state='active' ORDER BY created_at DESC LIMIT 1`).get(acct.id)
      : null;
    /* `owned: true` — существо найдено ПО ВЛАДЕЛЬЦУ, значит оно точно его.
       `accountId` едет рядом, чтобы команда `watch` могла проверить владение
       заново, не переоткрывая сокет. */
    const sub = live.attach(ws, { creatureId: mine?.id ?? null, dev: DEV, owned: !!mine, accountId: acct?.id ?? null });

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
        /*
         * ОДИН ПОВТОР НА СОКЕТ ЗА РАЗ, И НЕ ЧАЩЕ РАЗА В СЕКУНДУ.
         *
         * Повтор — самая дорогая команда сокета: она пересчитывает целый бой
         * в изоляте. Прислать её может кто угодно без сессии, и поток таких
         * команд клал арену для всех сразу. Ограничение стоит ЗДЕСЬ, а не
         * только в `live.open`, потому что дешевле отказать до работы.
         *
         * Экран шлёт повтор трижды с запасом (`askReplay`), поэтому окно
         * секундное, а не минутное: иначе честный клиент упрётся в свой же
         * ретрай.
         */
        const nowMs = Date.now();
        if (sub.replayBusy || (sub.replayAt && nowMs - sub.replayAt < 1000)) return;
        sub.replayAt = nowMs;
        sub.replayBusy = true;
        const m = db.prepare('SELECT * FROM match WHERE id = ?').get(msg.matchId);
        if (!m) { sub.replayBusy = false; ws.send(JSON.stringify({ type: 'error', message: 'такого боя нет' })); return; }
        if (m.constants_version !== constantsVersion()) {
          sub.replayBusy = false;
          ws.send(JSON.stringify({ type: 'error', code: 'stale_constants',
            message: 'этот бой шёл на других константах и точно не повторится' }));
          return;
        }
        const a = db.prepare('SELECT * FROM creature WHERE id = ?').get(m.a_id);
        const b = db.prepare('SELECT * FROM creature WHERE id = ?').get(m.b_id);
        if (!a || !b) { sub.replayBusy = false; ws.send(JSON.stringify({ type: 'error', message: 'участника боя больше нет' })); return; }
        live.open({
          /*
           * СТРОКА МАТЧА ЧИТАЕТСЯ ЧЕРЕЗ МОСТ ИМЁН СТОРОН.
           *
           * Здесь единственное место, где повтор поднимает старую строку из
           * базы, а дальше по ней идут изолят, метаданные трансляции и экран.
           * В базе десятки тысяч строк со слотами `octopus`/`gorilla`; они там
           * и останутся, поэтому имена приводятся к нынешним на входе, разом и
           * для слотов, и для всех снимков, которые этими слотами ключуются.
           * Перевести часть значило бы завести бой, у которого мозг сидит на
           * одной стороне, а набор лежит под другой.
           */
          id: m.id, seed: m.seed, aSlot: sideKey(m.a_slot), bSlot: sideKey(m.b_slot),
          winner: m.winner, reason: m.reason,
          result: m.result_json ? sideResult(JSON.parse(m.result_json)) : null,
          /* Снимок наборов на момент боя — см. миграцию 4 и live.open. */
          kits: m.kits_json ? sideKeys(JSON.parse(m.kits_json)) : null,
          /* И размеров: они меняют здоровье, радиус, скорость и силу удара,
             значит повтор без них — другой бой. Поле писалось и не читалось. */
          sizes: m.sizes_json ? sideKeys(JSON.parse(m.sizes_json)) : null,
          /* Вид матча: по нему трансляция решает, тренировочный он и был ли
             это бой со сломанным мозгом (D8). */
          kind: m.kind,
          /* Не путать с `kind` трансляции: у строки матча это ВИД БОЯ
             (`training`/`ladder`/`brain_fault`), а очередь спрашивает про
             ПРОИСХОЖДЕНИЕ запроса. Разные слова, одно имя — поэтому вид
             запроса передаётся вторым параметром, а не внутри строки. */
        }, { a, b, featured: false, kind: 'replay' }).then((bc) => {
          /*
           * Перематывать можно только СВОЮ трансляцию.
           *
           * `bc.at = 0` на общей трансляции отматывает бой всем, кто её
           * смотрит: один анонимный сокет мог держать арену на нулевой
           * секунде для всех остальных, повторяя запрос. Если матч уже идёт
           * и у него есть зрители — просто подключаемся к нему с текущего
           * места, как любой опоздавший (D14).
           */
          if (!bc) return;
          if (bc.watchers.size === 0) { bc.at = 0; bc.over = null; }
          /*
           * Подключаем к ЗАПРОШЕННОЙ трансляции, а не «куда придётся».
           *
           * Здесь стояло `sub.matchId = null; live.deliver(sub)`, а `deliver`
           * выбирает бой сам — по правилам витрины. То есть игрок открывал
           * ссылку на конкретный бой и получал тот, который сейчас идёт на
           * главной; замерено — пять запросов одного id, пять чужих боёв.
           * Ссылка на бой, показывающая другой бой, — это сломанная ссылка,
           * а на ней держится вся история про «поделись боем».
           */
          if (!live.attachTo(sub, m.id)) live.deliver(sub);
        }).catch(() => {}).finally(() => { sub.replayBusy = false; });
        return;
      }
      /*
       * `watch` БЕЗ id — это «покажи, что идёт», и он законен.
       *
       * Условие требовало строку, а `watch.js` на посадочной шлёт
       * `{ cmd: 'watch' }` без поля — то есть «подмена доигравшего боя живым»
       * не делала ничего ни разу. То же на клиенте, когда существо ушло на
       * покой или гость сбросил стартера: сокет молча оставался подписан на
       * прежнее существо.
       */
      if (msg.cmd === 'watch' && msg.creatureId == null) {
        /*
         * «Покажи, что идёт» НЕ ОТМЕНЯЕТ ПРИНАДЛЕЖНОСТЬ.
         *
         * Ровно это шлёт посадочная, когда ссылка на бой протухла. Первая
         * версия обнуляла и `creatureId`, и `owned`, а вернуть их было
         * некому: клиент шлёт `watch` с id только при СМЕНЕ существа, а оно
         * не менялось. Владелец, открывший мёртвую ссылку, до конца сессии
         * оставался анонимом — без «ТВОЁ», без «твой бой» и без перебивки
         * «свой бой забирает экран».
         *
         * Снимается только привязка к КОНКРЕТНОЙ трансляции.
         */
        sub.matchId = null; sub.pinned = false;
        live.deliver(sub);
        return;
      }
      if (msg.cmd === 'watch' && typeof msg.creatureId === 'string') {
        /*
         * «СЛЕЖУ ЗА» И «МОЁ» — РАЗНЫЕ ВЕЩИ, И ПУТАТЬ ИХ НЕЛЬЗЯ (D162).
         *
         * Клиент шлёт сюда и собственное существо, и выбранного гостем
         * СТАРТЕРА из библиотеки. Для выбора трансляции это одно и то же —
         * покажи бой вот этого существа. Для метки принадлежности («ТВОЁ» на
         * плите, «твой бой» под часами) — противоположные вещи: библиотечное
         * существо гостю не принадлежит, и назвать его своим значит соврать
         * ровно тому человеку, которому основатель просил показать, что бои
         * пока чужие.
         *
         * Владение проверяется по базе, а не по слову клиента: `owner_id`
         * знает только сервер.
         */
        sub.creatureId = msg.creatureId; sub.matchId = null; sub.pinned = false;
        const acct = sub.accountId || null;
        sub.owned = !!acct && !!db.prepare('SELECT 1 FROM creature WHERE id = ? AND owner_id = ?')
          .get(msg.creatureId, acct);
        live.deliver(sub);
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
  /* Дальше — дев-путь. Продакшен без настоящего ключа сюда не доходит:
     стартовая проверка ниже не даёт серверу подняться. */
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

/*
 * ПРОДАКШЕН БЕЗ НАСТОЯЩЕЙ ПРОВЕРКИ ЛИЧНОСТИ НЕ ПОДНИМАЕТСЯ.
 *
 * `verifyEmbedToken` вне дев-режима возвращает `null` всегда: подпись
 * платформы её публичным ключом ещё не реализована (E8 требует сначала
 * перечитать стенд GENEX). Комментарий там обещал «пока ключа нет, продакшен
 * не поднимается: см. проверку в конце файла» — а проверки в файле не было.
 *
 * Без неё продукт вставал в состояние без выхода, прикрытое ссылкой на
 * несуществующий гейт: `POST /api/session/claim` всегда `401`, значит игрок
 * навсегда гость, значит генерация недоступна НИКОМУ, а §14 меряет
 * «посетитель → создал существо» и получает ноль по устройству. И заметить
 * это можно было только пройдя воронку до конца на настоящем сервере.
 *
 * Громкий отказ на старте лучше тихого тупика в воронке: он случается у нас,
 * а не у игрока, и объясняет, что именно нужно сделать.
 */
function refuseToStartWithoutIdentity() {
  if (DEV) return;
  if (process.env.AIRENA_ALLOW_NO_IDENTITY === '1') {
    console.error('\n  ВНИМАНИЕ: личность игроков не проверяется (AIRENA_ALLOW_NO_IDENTITY=1).');
    console.error('  Аккаунт завести нельзя, генерация недоступна. Только для стенда.\n');
    return;
  }
  console.error('\n  Не поднимаюсь: личность игроков проверять нечем.\n');
  console.error('  Платформа подписывает токен своим ключом, а проверка подписи ещё не');
  console.error('  реализована (E8: сначала перечитать стенд GENEX). Пока её нет, стена');
  console.error('  аккаунта непроходима, и продукт работает вхолостую: гость доходит до');
  console.error('  «СОЗДАТЬ», упирается и уходит.\n');
  console.error('  Что делать:');
  console.error('    AIRENA_DEV=1 …                     — дев-режим, токен принимается как base64url');
  console.error('    AIRENA_ALLOW_NO_IDENTITY=1 …       — поднять всё равно (стенд без генерации)\n');
  process.exit(78);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refuseToStartWithoutIdentity();
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
