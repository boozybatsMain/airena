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
  ARENA_HALF, DEFAULT_BUILD, MATCH_SECONDS, OBSTACLES, SKILLS,
  SUDDEN_DEATH_AT, SUDDEN_DEATH_RAMP, THINK_HZ, TICK_HZ, WALL_HEIGHT,
  skillsOf, statsOf,
} from '../core/config.js';
import { constantsVersion } from '../core/version.js';
import { grammar, validateKit, costOf } from '../skills/registry.js';
import { EVENTS, record as trackEvent, metrics } from './analytics.js';
import { REST_MS, buildOf } from './arena-loop.js';
import { card, history, refactor as applyRefactor, sideKey, sideResult, sinceSummary } from './creatures.js';
import { viability } from './forge/viability.js';
import { Router, cookies, fail, json, readJson, setCookie } from './http.js';
import { ladderView, modelTable } from './ladder.js';
import * as limits from './limits.js';

/*
 * Дев-режим ОБЪЯВЛЯЕТСЯ КЛИЕНТУ, а не угадывается им.
 *
 * Стена аккаунта берёт личность у платформы через postMessage. На локальном
 * стенде платформы нет, и вместо неё сервер принимает base64url-токен — но
 * знал об этом только адрес: клиент предлагал дев-токен, лишь увидев `?dev=1`
 * в строке запроса. Открыв localhost без этого хвоста, разработчик упирался в
 * «страница открыта не внутри платформы» — сообщение, которое на стенде
 * называет неверную причину и не говорит, что делать. Замерено на живом
 * сервере: `POST /api/session/claim` с дев-токеном отвечает 200 и заводит
 * аккаунт — то есть сервер был готов всё это время, а мешал только адрес.
 *
 * Признак отдаёт сервер, потому что только он знает правду: в продакшене
 * `AIRENA_DEV` не выставлен, поле приезжает `false`, и никакой хвост в адресе
 * дев-вход не включит. Раньше `?dev=1` был не защитой, а лишь вторым условием
 * поверх серверного — сервер и тогда решал сам.
 */
/* Режим один на весь сервер и объяснён в `mode.js`: дев-стенд — это
   ОТСУТСТВИЕ `AIRENA_SECRET`, а не выставленная переменная. */
import { DEV } from './mode.js';
import { accountFromToken, claimAccount, ensureGuest } from './session.js';
import { compileKit, readable } from '../skills/compile.js';

/** Мозги, чей исходник читаем: научный артефакт §1 (F11, единственное исключение). */
const OPEN_BRAIN_TAGS = /^(u[1-6]|stub)$/;

/**
 * СТОРОНА → ФАЙЛ ЭТАЛОННОГО МОЗГА. ЭТО ДВЕ РАЗНЫЕ ВЕЩИ, И ИМЕНА У НИХ РАЗНЫЕ.
 *
 * Стороны арены зовутся `blue` и `orange` — это цвета, и больше ничего.
 * Эталонные мозги §1 лежат в `brains/<tag>/octopus.js` и `.../gorilla.js`, а
 * их умения записаны в `REFERENCE_SKILLS` под теми же тегами. Это ФИКСТУРА
 * замера: под этими именами напечатаны числа §1 и §16, и переименование
 * сдвинуло бы не код, а опубликованный результат.
 *
 * Поэтому связь между стороной и фикстурой записана здесь явно, одной
 * строкой, вместо того чтобы «работать сама» из-за совпадения имён — именно
 * такое совпадение и позволяло годами читать сторону как вид.
 */
const REF_BRAIN = { blue: 'octopus', orange: 'gorilla' };

/**
 * ВРЕМЕННЫЙ МОСТ: одна и та же запись под обеими сторонами.
 *
 * `FIGHTERS` больше нет — тела принадлежат существам, общей таблицы тел в мире
 * не существует. Но `src/viewer/main.js` читает `cfg.fighters[side]` в двух
 * десятках мест: радиус кругов, конусов и теней, скорость поворота для
 * сглаживания, список чипов кулдаунов. Ключи там — СТОРОНЫ, голубая и
 * оранжевая, и с переименованием они стали называться тем, чем являются.
 *
 * Обе стороны получают ОДНУ И ТУ ЖЕ копию `DEFAULT_BUILD`. Соврать одинаково
 * обеим честнее двух других вариантов: уронить экран на
 * `cfg.fighters[id].radius` от `undefined` или оставить одной из сторон числа
 * записи, которой больше не существует ни для кого.
 *
 * Настоящие числа бойца приезжают в кадрах матча, а не отсюда. Здесь остаётся
 * только то, по чему вьюер строит геометрию ДО начала боя.
 *
 * Такой же мост живёт в `src/server/index.js` — дев-сервер отдаёт тому же
 * вьюеру тот же `/api/config`.
 */
const sideBridge = (side) => ({
  id: side,
  name: side,
  ...statsOf(DEFAULT_BUILD),
  /* Без `jump`: вьюер сам дописывает его к списку чипов. */
  skills: skillsOf(REF_BRAIN[side]).filter((s) => s !== 'jump'),
});

export const SIM_CONFIG = {
  arena: { half: ARENA_HALF, wallHeight: WALL_HEIGHT, obstacles: OBSTACLES },
  /* Телосложение по умолчанию — то, что получает существо, о теле которого
     ничего не сказано. Не архетип: наследоваться от него некому. */
  defaultBuild: DEFAULT_BUILD,
  fighters: { blue: sideBridge('blue'), orange: sideBridge('orange') },
  skills: SKILLS,
  tickHz: TICK_HZ,
  thinkHz: THINK_HZ,
  matchSeconds: MATCH_SECONDS,
  suddenDeathAt: SUDDEN_DEATH_AT,
  suddenDeathRamp: SUDDEN_DEATH_RAMP,
};

/** Идёт ли бой этого существа прямо сейчас (D161). Одна дверь на два ответа. */
const fightingNow = (loop, id) => (loop.busyAt?.(id) ?? 0) > Date.now();

export function buildRouter(ctx) {
  const { db, loop, jobs, catalog, root } = ctx;
  const r = new Router();

  // ── кто это ────────────────────────────────────────────────────────────
  /** Сессия заводится молча: гость — не помеха, а первая половина воронки. */
  /*
   * АККАУНТ ЗАВОДИТСЯ, КОГДА ОН НУЖЕН, А НЕ НА КАЖДЫЙ ЗАПРОС.
   *
   * `who` вставлял строку в `account` и событие `visit` на любой запрос без
   * куки. Его зовут `/api/ladder`, `/api/catalog`, `/api/creature/:id`,
   * `/api/config` — то есть сорок обращений `curl` давали сорок «посетителей».
   * Замерено: `/api/metrics` показывала `visitorToCreature` 0.0184 до и
   * 0.0166 после сорока curl-ов, при том что не приходило ни одного человека.
   *
   * Это ломало сразу две вещи. Метрику §14 «посетитель → создал существо»,
   * знаменатель которой оказался числом HTTP-запросов без куки. И запись в
   * базу без единой проверки — любой может лить строки в `account`.
   *
   * Теперь читающие ручки узнают, кто пришёл, и НЕ заводят никого, если
   * пришли без сессии: им возвращается гость-однодневка, живущий один запрос.
   * Заводят настоящий аккаунт только те, кому нужна память между запросами:
   * `/api/session` (с неё начинается любая сессия клиента) и всё, что пишет.
   */
  const EPHEMERAL = { id: null, is_guest: 1, free_creature_used: 0, ephemeral: true };

  function who(req, res, { create = true } = {}) {
    const c = cookies(req);
    /* D22: заголовок авторитетнее куки. Кука — запасной путь для собственного
       домена; внутри iframe GENEX её может не быть вовсе. */
    const h = req.headers.authorization;
    const bearer = h && h.startsWith('Bearer ') ? h.slice(7) : null;
    let acct = accountFromToken(db, bearer || c.a);
    if (!acct) {
      if (!create) return EPHEMERAL;
      const g = ensureGuest(db, bearer || c.a);
      acct = g.account;
      setCookie(res, 'a', g.token);
      /* Клиент кладёт этот токен в localStorage и дальше шлёт заголовком. */
      res.setHeader('x-airena-session', g.token);
      if (g.fresh) trackEvent(db, { name: 'visit', accountId: acct.id, props: { guest: true } });
    }
    return acct;
  }
  /** Читающая ручка: узнать, кто пришёл, но никого не заводить. */
  const seen = (req, res) => who(req, res, { create: false });

  /**
   * Как назвать аккаунт вслух.
   *
   * Нужно ровно в одном месте — строке «подключён как …» в терминале коллеги.
   * Берётся локальная часть почты, а не сама почта: заголовок висит в
   * терминале, который коллега показывает на созвонах и в скриншотах, и
   * печатать там чужой адрес целиком незачем.
   */
  const accountName = (a) => {
    const mail = String(a?.email_norm || '');
    if (mail.includes('@')) return mail.slice(0, mail.indexOf('@'));
    return String(a?.id || 'аккаунт').slice(0, 12);
  };
  ctx.who = who;

  /**
   * Какие тиры игроку доступны.
   *
   * `free` — дешёвые связки на нашем ключе. `sub` — подписка (D164): она тоже
   * не берёт с игрока денег и вообще не ходит через OpenRouter, значит запрет
   * §2.2 «реальные деньги в платформу пока не заходят» к ней не относится.
   * Включается только на машине, где есть локальная сессия `claude`, — без
   * `AIRENA_SUB_MODELS=1` таких связок нет в каталоге вовсе.
   */
  const OPEN_TIERS = new Set(['free', 'sub']);

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
    /*
     * Состояние лимитов спрашивается ТЕМ ЖЕ вопросом, что и при создании, —
     * иначе кнопка на экране и решение сервера расходятся. Связка берётся
     * самая дешёвая бесплатная: именно ей игрок и создаёт, если ничего не
     * выбрал, и по ней же считается дневной бюджет.
     */
    const cheap = catalog.cheapestFree?.() ?? null;
    /* Считается ВСЕМ, включая гостя: с 05.09 он создаёт наравне, значит и
       денежные отказы обязан видеть заранее, а не узнавать их нажатием. */
    const limitState = cheap
      ? limits.check(db, { account: acct, bundle: cheap, kind: 'create' })
      : null;

    json(res, {
      guest: !!acct.is_guest,
      accountId: acct.id,
      /* Стенд без платформы: клиент вправе предложить дев-вход. См. шапку. */
      dev: DEV,
      /* Гость создаёт наравне с аккаунтом (05.09) — см. `limits.check`. */
      canCreate: (!limitState || limitState.ok),
      /* D1: гость не запускает генерацию. Причина отдаётся кодом, чтобы экран
         показал стену аккаунта, а не общую ошибку. */
      /*
       * `canCreate` ОТВЕЧАЕТ НА ВОПРОС КНОПКИ, а не на половину вопроса.
       *
       * Он смотрел только на гостя и на израсходованное бесплатное существо —
       * и оставался `true`, когда дневной бюджет игры исчерпан или суточный
       * лимит аккаунта выбран. Кнопка горела, сервер её глушил: игрок писал
       * строку, жал «создать» и получал отказ, который можно было показать
       * заранее.
       */
      /* Гость и «бесплатное уже создано» больше не блокируют (05.09): остаются
         только денежные отказы, и их по-прежнему видно ДО нажатия. */
      createBlocked: (limitState && !limitState.ok ? limitState.code : null),
      creature: mine ? card(mine, { viewerId: acct.id }) : null,
      job: activeJob ? jobView(activeJob) : null,
      nextFightAt: mine ? loop.nextFightAt(mine.id) : null,
      /*
       * ОТСЧЁТ ОТДАЁТСЯ И ОТНОСИТЕЛЬНЫМ ЧИСЛОМ (D161).
       *
       * `nextFightAt` — это часы СЕРВЕРА. Клиент вычитал из него свой
       * `Date.now()`, то есть показывал разницу двух разных часов: телефон,
       * убежавший на минуту, печатал «следующий бой через 01:03» там, где
       * до боя пять секунд. Пока таймер висел на экране ожидания, это было
       * незаметно; на экране итога он стал главной строкой, и врать ему нельзя.
       *
       * `nextFightIn` — миллисекунды ОТ ЭТОГО ОТВЕТА. Клиент превращает их в
       * свою локальную отметку в момент получения, и дальше считает по
       * собственным часам, которые сами с собой согласованы всегда.
       */
      /*
       * ПОКА БОЙ ИДЁТ, ОТСЧЁТА НЕТ — есть `fightingNow`.
       *
       * Резерв ставится по ВЕРХНЕЙ оценке длительности и уточняется настоящей
       * только после прогона. В это окно `nextFightAt` равен «сейчас плюс
       * пятьдесят с лишним секунд», и сессия, попавшая в него, печатала
       * «следующий бой через 58 секунд» — а арена перечитывает сессию раз в
       * двадцать секунд, так что число висело на экране до двадцати секунд.
       *
       * Пока существо на арене, правильный ответ не число, а «оно дерётся».
       */
      nextFightIn: mine && !fightingNow(loop, mine.id) && loop.nextFightAt(mine.id)
        ? Math.max(0, loop.nextFightAt(mine.id) - Date.now()) : null,
      /* Идёт ли бой этого существа прямо сейчас — отличает «дерётся» от «отдыхает». */
      fightingNow: mine ? fightingNow(loop, mine.id) : false,
      /* Свободного соперника не нашлось: экран обязан сказать это словами. */
      noOpponent: mine ? (loop.starvedAt?.(mine.id) ?? false) : false,
      /* Длина отдыха — знаменатель шкалы на клиенте. Число живёт на сервере
         (REST_MS), и клиент, который держал бы собственную копию, разошёлся
         бы с ним при первой же правке темпа. */
      restMs: REST_MS,
      liveMatch: ctx.live.describe(),
      season,
      constantsVersion: constantsVersion(),
      since: mine && away > 30 * 60e3 ? sinceSummary(db, mine.id, acct.last_seen_at) : null,
      limits: limits.publicStatus(db),
    });
  });

  /** Стена аккаунта. Токен GENEX проверяет платформа; мы получаем sub и почту. */
  r.post('/api/session/claim', async (req, res) => {
    const acct = who(req, res);
    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'не удалось прочитать запрос'); }
    /* `await` обязателен: проверка подписи ходит за ключами платформы
       (`identity.js`), то есть асинхронна. Без него сюда приезжает Promise —
       объект, и `if (!claim)` его пропускает; дальше `claimAccount`
       раскладывает его на `{sub, email}`, получает `undefined` и отвечает
       `no_sub`. Замерено гейтом: стена перестаёт пускать ВООБЩЕ никого —
       400 и на подделку, и на настоящий токен. `tools/checkidentity.mjs`. */
    const claim = await ctx.verifyEmbedToken(body.embedToken);
    if (!claim) return fail(res, 401, 'bad_token', 'платформа не подтвердила личность');
    const out = claimAccount(db, acct.is_guest ? acct.id : null, claim);
    if (out.error) return fail(res, 400, out.error, 'не удалось привязать аккаунт');
    setCookie(res, 'a', out.token, { days: 180 });
    res.setHeader('x-airena-session', out.token);
    trackEvent(db, { name: 'account_claimed', accountId: out.account.id, props: { moved: out.moved } });
    json(res, { ok: true, accountId: out.account.id, moved: out.moved });
  });

  // ── стартовые существа: гость ВЫБИРАЕТ, а не получает (D2) ─────────────
  /**
   * Три существа, из которых выбирает гость (D2).
   *
   * Сортировка по рейтингу здесь была неверной по той же причине, по которой
   * она неверна в лестнице: у библиотечных существ рейтинг ПОСТАВЛЕН при
   * заселении и не двигается, так что «первые три по рейтингу» — это первые
   * три по случайному числу, записанному когда-то. Гостю выдавались существа
   * с нулём побед из двух сотен боёв — и это первое, что он получал в игре.
   *
   * Правильный порядок для СТАРТЁРА — не сила, а показательность:
   *   1) собран набор из грамматики — иначе гость не увидит §8 вообще;
   *   2) мозг написан моделью — иначе он не увидит и тезиса продукта;
   *   3) настоящий счёт побед, а не поставленное число.
   * Разные НАБОРЫ среди троих — чтобы выбор был выбором, а не оттенком.
   */
  r.get('/api/starters', (req, res) => {
    const all = db.prepare(`SELECT * FROM creature WHERE is_library = 1 AND state = 'active'
                            AND brain_source IS NOT NULL`).all();
    const winrate = (c) => (c.fights ? c.wins / c.fights : 0);
    const score = (c) => (c.kit_active ? 4 : 0)
      + (c.brain_model && !/рукописн/i.test(c.brain_model) ? 2 : 0)
      + winrate(c);
    /*
     * Существо, которое не выигрывает, не может быть стартовым.
     *
     * Первая версия этого порядка выдала гостю набор из трёх, где у одного
     * ноль побед из двухсот боёв. Гость не знает, что это калибровочный
     * эталон, специально стоящий слабым (§7.3), — он видит существо, которое
     * ему предлагают, и оно не выигрывает никогда.
     *
     * Порог мягкий: если подходящих меньше трёх, добираем из остальных —
     * пустой экран хуже неудачного третьего.
     */
    const decent = all.filter((c) => !c.fights || winrate(c) >= 0.25);
    const ranked = (decent.length >= 3 ? decent : all).sort((a, b) => score(b) - score(a));
    /*
     * ВТОРАЯ И ТРЕТЬЯ КАРТОЧКИ ВЫБИРАЮТСЯ ПО НЕПОХОЖЕСТИ, А НЕ ПО РЕЙТИНГУ.
     *
     * Первые две брались «по одной на архетип». Архетипов больше нет — есть
     * две СТОРОНЫ арены, и они не говорят о существе ничего: сторона не несёт
     * ни здоровья, ни скорости, ни набора. Разложить троих по цветам значило
     * бы обещать гостю разницу, которой в карточке нет, и одновременно
     * выбрасывать по-настоящему непохожее существо только за то, что оно
     * дерётся с той же стороны.
     *
     * Поэтому непохожесть теперь решает всё, кроме первой карточки: первая —
     * лучшая по показательности, каждая следующая — та, чей набор дальше всего
     * от уже выбранных. Похожесть считается по долям общих пар
     * «доставка+эффекты». Рейтинг решает только при равной непохожести — среди
     * неотличимых он всё равно ничего не решает для гостя.
     */
    const sig = (c) => {
      let kit = [];
      try { kit = JSON.parse(c.kit_json || '[]'); } catch { kit = []; }
      return new Set(kit.map((k) => `${k.delivery}:${(k.effects || []).join('+')}`));
    };
    const overlap = (a, b) => {
      if (!a.size || !b.size) return 0;
      let n = 0;
      for (const x of a) if (b.has(x)) n++;
      return n / Math.max(a.size, b.size);
    };
    /* Подпись набора считается по разу на существо: `sig` разбирает JSON, а
       ниже он спрашивается на каждом шаге отбора у каждого кандидата. */
    const sigs = new Map(ranked.map((c) => [c, sig(c)]));
    const out = ranked.slice(0, 1);
    while (out.length < 3 && out.length < ranked.length) {
      const near = (c) => Math.max(0, ...out.map((x) => overlap(sigs.get(c), sigs.get(x))));
      const rest = ranked.filter((c) => !out.includes(c));
      rest.sort((a, b) => {
        const da = near(a); const dbb = near(b);
        return da === dbb ? score(b) - score(a) : da - dbb;
      });
      out.push(rest[0]);
    }
    json(res, out.map((x) => card(x)));
  });

  // ── каталог моделей: тир, но НИКОГДА не сумма (D11) ────────────────────
  /**
   * Готов ли канал подписки ЛИЧНО ДЛЯ ЭТОГО аккаунта (D172, D175).
   *
   * Два условия, и оба обязательны. Аккаунт в списке допущенных — иначе связка
   * вообще не его. И его воркер прямо сейчас на связи — иначе кнопка гарантированно
   * повиснет, а кнопка, которая заведомо не сработает, хуже отсутствующей.
   */
  const subReady = (acct) => Boolean(ctx.hub?.allows(acct) && ctx.hub.isOnline(acct.id));

  r.get('/api/catalog', (req, res) => {
    const acct = seen(req, res);
    const cat = catalog.current();
    json(res, {
      /* Здесь нет ни одного числа в долларах. Тир, ярлык и причина блокировки —
         всё, что нужно экрану, и всё, что ему разрешено знать. */
      /*
       * ── СВЯЗКИ ПОДПИСКИ ВИДЯТ НЕ ВСЕ (D175) ────────────────────────────
       *
       * Аккаунт вне списка допущенных не видит их ВОВСЕ — не серыми, а никак.
       * Серая строка — это обещание «когда-нибудь откроется», и для канала,
       * который открывается решением основателя поимённо, это обещание ложное.
       * Для допущенного, но с выключенным воркером, строка остаётся: там
       * обещание правдивое, и делать нужно ровно одно — запустить программу.
       */
      bundles: cat.bundles.filter((b) => b.tier !== 'sub' || ctx.hub?.allows(acct)).map((b) => ({
        id: b.bundle,
        label: b.label,
        think: b.thinkLabel,
        tier: b.tier,
        measured: b.measured,
        /* Сколько ждать. Секунды — не деньги, их игроку знать и нужно, и
           полезно: именно ожидание он принимает за поломку. `null` — связка
           не замерена, и экран честно молчит вместо выдумки. */
        secs: b.secs ?? null,
        available: b.tier === 'sub' ? subReady(acct) : OPEN_TIERS.has(b.tier),
        /* §2.2: реальные деньги в платформу пока не заходят вообще. Подписка
           денег игрока не трогает и потому доступна (D164) — но только когда
           есть кому её выполнить (D175). */
        unavailableReason: b.tier === 'sub'
          ? (subReady(acct) ? null : 'воркер не запущен — открой /worker')
          : (OPEN_TIERS.has(b.tier) ? null : 'платежи платформы ещё не включены'),
      })),
      canCreate: true,
      note: cat.bundles.some((b) => b.tier === 'paid')
        ? 'Платные авторы появятся, когда платформа включит платежи.' : null,
    });
  });

  /*
   * ══ ВОРКЕР КОЛЛЕГИ ═══════════════════════════════════════════════════════
   *
   * Пять ручек, и ни одна из них не принимает учётных данных Anthropic — это
   * не упущение, а предмет всей конструкции (см. шапку `forge/worker.js`).
   * Единственный секрет здесь свой: токен воркера, выданный Airena, дающий
   * право забирать задания СВОЕГО аккаунта и больше ничего.
   *
   * Авторизация воркера намеренно отдельна от `who`: сессия игрока живёт в
   * куке и заголовке `x-airena-session`, воркер — по своему токену. Свести их
   * значило бы дать программе, живущей на чужом ноутбуке месяцами, права
   * браузерной сессии.
   */
  function workerAuth(req, res) {
    const h = req.headers.authorization;
    const token = h && h.startsWith('Bearer ') ? h.slice(7) : null;
    const account = token ? ctx.hub?.accountByToken(token) : null;
    /* Токен есть, аккаунта нет — токен отозван или аккаунт удалён. 401, чтобы
       воркер сказал коллеге «привяжись заново», а не молчал в бэкоффе. */
    if (!account) { fail(res, 401, 'bad_token', 'токен воркера недействителен'); return null; }
    /* Допуск перепроверяется НА КАЖДОМ запросе, а не только при привязке:
       основатель убирает аккаунт из списка правкой переменной, и токен,
       выданный вчера, обязан перестать работать сегодня. */
    if (!ctx.hub.allows(account)) { fail(res, 403, 'not_allowed', 'аккаунт больше не в списке'); return null; }
    return { token, account };
  }

  /** Код привязки для экрана. Только допущенным. */
  r.post('/api/worker/pair/start', (req, res) => {
    const acct = who(req, res);
    if (!ctx.hub?.allows(acct)) {
      return fail(res, 403, 'not_allowed', 'этот аккаунт не в списке тех, кто может запускать воркер');
    }
    json(res, ctx.hub.startPairing(acct.id));
  });

  /** Обмен кода на токен. Без авторизации — кодом и авторизуется. */
  r.post('/api/worker/pair/claim', async (req, res) => {
    let body;
    try { body = await readJson(req); } catch { body = {}; }
    const got = ctx.hub?.claimPairing(body.code, body.hostname);
    if (!got) return fail(res, 404, 'bad_code', 'код не подошёл или истёк');
    const a = db.prepare('SELECT * FROM account WHERE id = ?').get(got.accountId);
    json(res, { token: got.token, account: { name: accountName(a) } });
  });

  /** Длинный опрос: дай задание. 204 — пусто, спрашивай снова. */
  r.get('/api/worker/next', async (req, res) => {
    const w = workerAuth(req, res);
    if (!w) return;
    const job = await ctx.hub.next({
      accountId: w.account.id,
      hostname: String(req.headers['x-worker-host'] || ''),
    });
    if (!job) { res.writeHead(204); res.end(); return; }
    json(res, job);
  });

  /** Воркер принёс ответ или отказ. */
  r.post('/api/worker/result', async (req, res) => {
    const w = workerAuth(req, res);
    if (!w) return;
    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'не удалось прочитать ответ'); }
    const ok = ctx.hub.deliver({ accountId: w.account.id, requestId: body.requestId, body });
    /* Неизвестный `requestId` — не ошибка воркера: задание могло умереть по
       стене, пока он считал. Отвечаем 204 и здесь: пусть идёт за следующим. */
    res.writeHead(ok ? 204 : 204); res.end();
  });

  /** Воркер выключается. */
  r.post('/api/worker/bye', (req, res) => {
    const w = workerAuth(req, res);
    if (!w) return;
    ctx.hub.bye(w.account.id);
    res.writeHead(204); res.end();
  });

  /**
   * Сам воркер, файлом.
   *
   * Отдаётся с сервера игры, а не из репозитория: коллеге незачем клонировать
   * игру, чтобы одолжить ей подписку, а нам незачем давать ему доступ к
   * репозиторию ради одного файла. Читается с диска на каждый запрос — файл
   * маленький, а кеш означал бы, что после деплоя качается старая версия.
   */
  r.get('/worker.mjs', (req, res) => {
    const p = join(root, 'src/worker/worker.mjs');
    if (!existsSync(p)) return fail(res, 404, 'no_worker', 'воркер не собран');
    const src = readFileSync(p);
    res.writeHead(200, {
      'content-type': 'text/javascript; charset=utf-8',
      'content-disposition': 'attachment; filename="airena-worker.mjs"',
      'cache-control': 'no-store',
    });
    res.end(src);
  });

  /**
   * Тело существа — код, который рисует зритель.
   *
   * Отдаётся `body_safe`, а НЕ `body_source`: наружу уезжает только то, что
   * прошло разбор и разметку топливом (`sandbox/bodyrules.js`). Разница
   * между двумя колонками здесь и есть вся защита, поэтому колонка названа
   * так, чтобы перепутать их было трудно.
   *
   * Открыто без сессии и без проверки владельца — намеренно. Тело видно
   * всем, кто смотрит бой, то есть по определению посторонним; прятать его
   * бессмысленно, а требовать сессию — значит сломать зрителя. Это ровно
   * обратный случай мозгу: исходник мозга не покидает сервер никогда (N19),
   * потому что в нём тактика, за которую игрок платил. В теле — картинка.
   *
   * Без расширения `.js` в пути: роутер сопоставляет сегменты целиком, и
   * `:id.js` связал бы параметр с именем «id.js». Тип содержимого задаётся
   * заголовком, и браузеру этого достаточно.
   */
  r.get('/api/body/:id', (req, res) => {
    const row = db.prepare('SELECT body_safe, body_draws FROM creature WHERE id = ?').get(req.params.id);
    if (!row || !row.body_safe) return fail(res, 404, 'no_body', 'у этого существа нет своего тела');

    /*
     * ── ПОТОЛОК ЦЕНЫ ПОКАЗА — ПРАВИЛО ПРИЁМКИ, А НЕ ВЫДАЧИ ────────────────
     *
     * Цена считается на приёмке (`forgeBody` уже строит тело, чтобы проверить
     * позу) и лежит в `body_draws`. Здесь она НЕ проверяется, и это решение, а
     * не забывчивость.
     *
     * Я поставил тут отказ 404 (по `DRAW_MAX`) и замерил, чего он стоит: 13 из 24 живых
     * существ — включая первое, четвёртое и восьмое места лестницы — перестали
     * показывать своё тело и вышли в теле архетипа. Это половина населения,
     * потерявшая внешность.
     *
     * А ради чего — неизвестно. `DRAW_MAX` выведен от нашего эталона
     * («полтора осьминога»), и связь с кадрами в секунду НЕ ЗАМЕРЕНА: в этой
     * среде браузерная панель скрыта и рендерер не работает (D127). То есть
     * достоверный вред менялся на предполагаемую пользу.
     *
     * Правильное место потолка — приёмка, где отказ ничего не стоит: модель
     * получает причину и пробует снова, а игрок узнаёт об этом только если не
     * вышло совсем. Так он и стоит. Тела, принятые до появления правила,
     * отдаются; их цена известна, записана и печатается `tools/bodysize.mjs`.
     *
     * Когда появится замер кадров, это решение надо пересмотреть — но с
     * числом, а не с догадкой.
     */
    res.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      /* Тело неизменяемо по F2: новое существо — новый id. Значит его можно
         кэшировать навсегда, и зритель платит за тысячу строк один раз. */
      'cache-control': 'public, max-age=31536000, immutable',
    });
    res.end(row.body_safe);
  });

  // ── существо ───────────────────────────────────────────────────────────
  r.get('/api/creature/:id', (req, res) => {
    const acct = seen(req, res);
    const row = db.prepare('SELECT * FROM creature WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'no_creature', 'такого существа нет');
    const c = card(row, { viewerId: acct.id });
    const view = ladderView(db, { creatureId: row.id, season: row.season });
    /* Сколько раз существо пробовало себя переписать. Нужно и шкале
       наблюдений, и журналу — считается один раз. */
    const adaptTries = db.prepare('SELECT count(*) AS n FROM adaptation WHERE creature_id = ?').get(row.id).n;
    trackEvent(db, { name: 'creature_viewed', accountId: acct.id, props: { creatureId: row.id, mine: c.isMine } });
    json(res, {
      creature: c,
      rank: view.me?.rank ?? null,
      percentile: view.percentile,
      /* Знаменатель процентиля — экран обязан его назвать (D83). */
      players: view.players,
      total: view.total,
      top100: view.me ? view.me.rank <= 100 : false,
      history: history(db, row.id, 20),
      /*
       * ОКНО ОТДАЁТ ТОЛЬКО ПРИНЯТЫЕ, а числа приходят отдельно.
       *
       * Запрос брал последние 12 попыток подряд, а экран рисовал из них
       * только принятые и по остатку считал «сколько отклонено». На существе
       * с 53 отклонёнными это давало «ещё 4 кандидата проверены»: окно
       * усечено, а вычитание об этом не знало. Заодно окно тратилось на
       * строки, которые всё равно выбрасываются.
       *
       * Теперь окно — это ровно то, что рисуется, а счёт берётся из
       * `adaptTries` и `creature.adaptations`, то есть из полной таблицы.
       */
      /*
       * ЖУРНАЛ — ТОЛЬКО ВЛАДЕЛЬЦУ.
       *
       * Экран и так рисует его только своему (`creature.js`), но ручка
       * отдавала журнал любому, кто знает id, — а id виден в лестнице и в
       * ссылке на бой. Строки журнала описывают, КАК устроен чужой мозг:
       * даже без абсолютных чисел это направление и величина каждой правки.
       * Проверка на клиенте — не проверка.
       */
      adaptations: c.isMine
        ? db.prepare(`SELECT id, at, kind, summary, score_before, score_after, accepted
                      FROM adaptation WHERE creature_id = ? AND accepted = 1
                      ORDER BY at DESC LIMIT 12`).all(row.id)
        : [],
      kitCost: c.kit.map(costOf),
      nextFightAt: loop.nextFightAt(row.id),
      /*
       * Те же три поля, что и в `/api/session`, и по той же причине.
       *
       * Экран существа считал остаток по СЫРОМУ `nextFightAt` — то есть по
       * часам сервера — и печатал его в формате mm:ss. Оба дефекта тут те же:
       * расхождение часов телефона превращало «через 5 секунд» в минуту, а
       * «00:05» на пятисекундной паузе читается как пять минут.
       */
      nextFightIn: !fightingNow(loop, row.id) && loop.nextFightAt(row.id)
        ? Math.max(0, loop.nextFightAt(row.id) - Date.now()) : null,
      fightingNow: fightingNow(loop, row.id),
      /* Свободного соперника не нашлось на прошлой попытке. Это не ошибка, а
         состояние маленькой лестницы, и молчать о нём нельзя: экран обещает
         бой через пять секунд и не даёт его. */
      noOpponent: loop.starvedAt?.(row.id) ?? false,
      restMs: REST_MS,
      /* D17: наблюдения — шкала до следующей адаптации, не валюта (N3). */
      observations: observationsOf(row, adaptTries),
      /* Сколько раз существо пробовало себя переписать и сколько оставило.
         Ноль принятых — это отбор, а не поломка, и без второй цифры это
         не читается. */
      adaptTries,
    });
  });

  r.get('/api/creature/:id/history', (req, res) => {
    const row = db.prepare('SELECT id FROM creature WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'no_creature', 'такого существа нет');
    json(res, history(db, row.id, /* Потолок обязателен: отрицательное значение SQLite читает как «без лимита»,
       и один анонимный запрос отдавал 436 КБ с базы в 12 тысяч матчей. */
      Math.max(1, Math.min(100, Number(req.query?.limit) || 40))));
  });

  /**
   * ПРОВЕРИТЬ НАБОР БОЕМ — до того, как применить.
   *
   * §7.2·3 запрещает «продавать непроверенный жребий» и объясняет, чем:
   * симуляция в 327× делает верификацию бесплатной, поэтому показывать
   * результат ДО решения не роскошь, а обязанность. Для мозга это уже
   * работает (дуэль кандидата с действующим), для набора — не работало: игрок
   * менял умения вслепую и узнавал результат из лестницы через час.
   *
   * Считается тем же `viability`, что и на рождении: сорок боёв эталонным
   * мозгом против эталонного набора. Это НИЖНЯЯ ГРАНИЦА и она такой и
   * называется на экране — «может ли этот набор вообще попадать», а не «силён
   * ли он». Силу меряет лига, и она стоит минуты.
   *
   * Только владельцу и не чаще раза в три секунды: двадцать боёв это около двух секунд
   * процессорного времени, и открывать их анониму без ограничений — значит
   * подарить способ занять сервер.
   */
  const kitChecks = new Map();
  r.post('/api/creature/:id/kit/check', async (req, res) => {
    const acct = who(req, res);
    const row = db.prepare('SELECT * FROM creature WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'no_creature', 'такого существа нет');
    if (row.owner_id !== acct.id) return fail(res, 403, 'not_yours', 'это не твоё существо');

    const last = kitChecks.get(acct.id) || 0;
    if (Date.now() - last < 3000) return fail(res, 429, 'too_often', 'проверка идёт, подожди секунду');
    kitChecks.set(acct.id, Date.now());
    if (kitChecks.size > 512) kitChecks.clear();

    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'не удалось прочитать запрос'); }
    const bad = validateKit(body.kit);
    if (bad.length) return fail(res, 422, 'bad_kit', 'набор не проходит правила', { violations: bad });

    try {
      const v = await viability(body.kit, { build: buildOf(row) });
      json(res, {
        ok: v.ok, hits: v.hits, wins: v.wins, rounds: v.rounds, why: v.why,
        /* Форма важнее среднего: «бьёт всех» и «бьёт одних» — разные ответы,
           и игрок имеет право знать, который из них про его набор. */
        verdict: v.shape?.verdict ?? null,
        verdictRu: v.shape?.ru ?? null,
        rates: v.rates ?? null,
      });
    } catch (e) {
      /* Проверка — удобство, а не право: её отказ ничего не ломает. */
      fail(res, 503, 'check_failed', 'проверка не запустилась — можно применить и так');
    }
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
    if (bad.length) return fail(res, 422, 'bad_kit', 'набор не проходит правила', { violations: bad });

    /*
     * СМЕНА НАБОРА СНИМАЕТ ДЕКОРАЦИЮ.
     *
     * VFX-IR ключуется по имени умения (`k1`/`k2`/`k3`), а набор меняется
     * мгновенно и бесплатно (F10, D3). Значит декорация, сочинённая моделью
     * под «снаряд: урон, пустота», после смены играла над «конус:
     * урон+обездвиживание, кинетика»: read-kit честно переключался на новый
     * силуэт и палитру, а декорация продолжала рассказывать про прежнее
     * умение. Две половины одного эффекта говорили про разные вещи.
     *
     * Снимается ЦЕЛИКОМ, а не по изменившимся ключам: промпт декорации просит
     * «пусть она говорит про то, что умение делает», и связь между тремя
     * умениями там тоже есть. Существо возвращается к read-kit — это законное
     * состояние, так выглядели все существа до появления уровня 1.
     */
    db.prepare('UPDATE creature SET kit_json = ?, vfx_json = NULL, updated_at = ? WHERE id = ?')
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
    /* E6: покупок в v1 нет ни в каком виде, включая заглушку. Отказ честный
       и объясняет причину, а не предлагает несуществующую кнопку. Правило —
       общее, см. `paidRefused` ниже. */
    if (paidRefused(res, bundle, acct)) return;
    const gate = limits.check(db, { account: acct, bundle, kind: 'create' });
    if (!gate.ok) {
      trackEvent(db, { name: 'limit_denied', accountId: acct.id, props: { code: gate.code } });
      return fail(res, gate.code === 'guest' ? 401 : 429, gate.code, gate.message, { retryAt: gate.retryAt });
    }

    const prompt = String(body.prompt || '').slice(0, 400).trim();
    if (prompt.length < 3) return fail(res, 422, 'short_prompt', 'опиши существо хотя бы несколькими словами');

    /*
     * F7 СНЯТО (05.09, решение основателя).
     *
     * Здесь стоял атомарный `UPDATE ... WHERE free_creature_used = 0` — он
     * закрывал «одно бесплатное существо на аккаунт, пожизненно», и он же
     * отбивал второе нажатие «создать» кодом `free_used`. Требование было
     * прямым: промпт, кнопка, генерация — и так каждый раз.
     *
     * ЧТО ТЕПЕРЬ ОГРАНИЧИВАЕТ ЧИСЛО СУЩЕСТВ: счётчики на аккаунт из E3 —
     * `AIRENA_ACCT_DAY` (по умолчанию три в сутки) и `AIRENA_ACCT_MONTH`, плюс
     * общий дневной бюджет игры. Это денежные лимиты, они остались нетронутыми.
     *
     * ПОБОЧНОЕ СЛЕДСТВИЕ, которое стоит знать: «моё существо» продукт берёт как
     * САМОЕ СВЕЖЕЕ активное у владельца. Значит второе созданное вытесняет
     * первое с экрана — старое не удаляется и продолжает драться на лестнице,
     * но показывается новое.
     *
     * Колонка `free_creature_used` оставлена: её пишет перенос существ при
     * привязке аккаунта, и сносить её отдельной миграцией здесь незачем.
     */

    /*
     * ОТ КЛИЕНТА ПРИЕЗЖАЕТ ОПИСАНИЕ, И БОЛЬШЕ НИЧЕГО.
     *
     * Здесь принималось поле `archetype`: клиент называл «осьминог» или
     * «горилла», сервер сверял имя со списком и передавал его конвейеру как
     * подсказку. Это был последний вход, через который снаружи выбирали
     * ХАРАКТЕРИСТИКИ — имя архетипа тянуло за собой готовую запись здоровья,
     * скорости, радиуса и умений.
     *
     * Записей больше нет. Тело существа — это его телосложение, оно следует из
     * описания и оплачивается очками (`BUILD_AXES`, `BUILD_BUDGET`), а сторона
     * арены не даёт ни одного числа. Так что выбирать здесь стало нечего:
     * поле осталось бы формой без содержания, а список имён — вторым местом,
     * где живут имена сторон (первое и единственное — `SIDES`
     * в `creatures.js`).
     *
     * Урок, ради которого стояла сверка, никуда не делся и записан там же, где
     * ему место: всё, что приезжает от клиента, приводится к известному виду.
     * `prompt` выше — строка, обрезанная по длине; ничего другого этот
     * маршрут от клиента и не берёт.
     */
    const job = jobs.enqueue({
      accountId: acct.id, kind: 'create', bundle,
      payload: { prompt },
    });
    /* `archetype` в событии больше не шлётся: словарь `analytics.js` берёт
       только объявленные свойства, а несуществующее просто не доедет. */
    trackEvent(db, { name: 'create_submitted', accountId: acct.id,
      props: { bundle: bundle.bundle, promptChars: prompt.length } });
    json(res, jobView(job), 202);
  });

  /**
   * Платные связки недоступны, и проверка — ОДНА на все входы.
   *
   * E6: в v1 выручка нулевая, платежей нет, каталог платных связок существует
   * только как витрина будущего. Отказ стоял в `POST /api/creature` и не стоял
   * в `POST /api/creature/:id/refactor`: бесплатный аккаунт спокойно ставил в
   * очередь рефактор на Opus по $2.26 за вызов, просто назвав связку в теле
   * запроса. Деньги настоящие, счёт наш.
   *
   * Дело не в том, что забыли строчку, а в том, что правило жило в обработчике.
   * Обработчиков становится больше; правило одно.
   */
  function paidRefused(res, bundle, acct = null) {
    if (!bundle) return false;
    /*
     * ── ВТОРАЯ ГРАНИЦА, И ОНА ЖЁСТЧЕ ДЕНЕЖНОЙ (D172) ──────────────────────
     *
     * Связку `sub:` может назвать КТО УГОДНО: `catalog.find(body.bundle)`
     * читает строку из тела запроса, и до этой проверки ничто не спрашивало,
     * чья это подписка. Прошедший дальше посторонний игрок уехал бы считаться
     * на подписку коллеги — то есть ровно «intermediate usage on end users'
     * behalf», запрещённое Anthropic дословно.
     *
     * Проверка стоит ЗДЕСЬ, в общем месте, по той же причине, по которой сюда
     * переехал денежный отказ: обработчиков становится больше, правило одно.
     * Ровно на этой ошибке отказ уже один раз стоял в `POST /api/creature` и
     * не стоял в рефакторе.
     */
    if (bundle.tier === 'sub') {
      if (!ctx.hub?.allows(acct)) {
        fail(res, 403, 'not_allowed', 'этот автор мозга доступен не на этом аккаунте', { bundle: bundle.bundle });
        return true;
      }
      if (!ctx.hub.isOnline(acct.id)) {
        fail(res, 409, 'worker_offline', 'воркер не запущен — запусти его и повтори', { bundle: bundle.bundle });
        return true;
      }
      return false;
    }
    if (OPEN_TIERS.has(bundle.tier)) return false;
    fail(res, 402, 'not_free', 'платежи платформы ещё не включены', { bundle: bundle.bundle });
    return true;
  }

  /*
   * ФЛАГ `AIRENA_REFACTOR`, ПО УМОЛЧАНИЮ ВЫКЛЮЧЕН — D19 и §15 Q1.
   *
   * Q1 закрыт дословно: «LLM-рефакторы не строятся и не продаются в v1».
   * D19 записал, что серверный шов построен и ЗАКРЫТ флагом. Флага не
   * существовало ни в одной строке кода: ручка принимала запросы от любого
   * аккаунта и ставила в очередь платную генерацию. Решение, записанное и не
   * реализованное, — это не решение, а намерение, и отличить одно от другого
   * можно было только запросом.
   */
  const REFACTOR_ON = process.env.AIRENA_REFACTOR === '1';

  r.post('/api/creature/:id/refactor', async (req, res) => {
    if (!REFACTOR_ON) {
      return fail(res, 404, 'no_refactor', 'улучшение существа моделью в этой версии не включено');
    }
    const acct = who(req, res);
    const row = db.prepare('SELECT * FROM creature WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'no_creature', 'такого существа нет');
    if (row.owner_id !== acct.id) return fail(res, 403, 'not_yours', 'это не твоё существо');
    let body;
    try { body = await readJson(req); } catch { body = {}; }
    const bundle = catalog.find(body.bundle) || catalog.cheapestFree();
    if (!bundle) return fail(res, 503, 'no_catalog', 'каталог моделей недоступен');
    if (paidRefused(res, bundle, acct)) return;
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
    const acct = seen(req, res);
    const j = db.prepare('SELECT * FROM job WHERE id = ?').get(req.params.id);
    if (!j) return fail(res, 404, 'no_job', 'такой генерации нет');
    if (j.account_id && j.account_id !== acct.id) return fail(res, 403, 'not_yours', 'это не твоя генерация');
    json(res, jobView(j));
  });

  // ── лестница и таблицы ─────────────────────────────────────────────────
  r.get('/api/ladder', (req, res) => {
    const acct = seen(req, res);
    const mine = db.prepare(`SELECT id, season FROM creature WHERE owner_id = ? AND state='active'
                             ORDER BY created_at DESC LIMIT 1`).get(acct.id);
    const season = ctx.kv.get('season', { n: 1 });
    /* `?top=` — сколько строк таблицы отдать. Экран просит десять, а по кнопке
       «показать всех» — столько, сколько есть. Потолок и пол ставит `ladderView`. */
    const asked = Number(new URL(req.url, 'http://x').searchParams.get('top'));
    const view = ladderView(db, {
      creatureId: mine?.id ?? null,
      season: mine?.season ?? season.n,
      ...(Number.isFinite(asked) && asked > 0 ? { topLimit: asked } : {}),
    });
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
    /* Строка матча может быть любой давности: слоты и ключи `result_json` в
       старых записаны прежними именами сторон. Мост — в `creatures.js`. */
    const result = m.result_json ? sideResult(JSON.parse(m.result_json)) : null;
    json(res, {
      id: m.id, seed: m.seed, at: m.ended_at, seconds: m.seconds,
      winner: m.winner, reason: m.reason, kind: m.kind,
      constantsVersion: m.constants_version,
      a: side(m, 'a'), b: side(m, 'b'),
      /* D5: разбор боя собирается детерминированно из лога, без вызова LLM. */
      beats: result ? beatsFrom(result.log || [], m) : [],
      /*
       * ЧЕЛОВЕЧЕСКИЕ ИМЕНА УМЕНИЙ.
       *
       * Внутри умения из грамматики зовутся `k1`, `k2`, `k3` — короткие
       * стабильные имена, которые мозг вызывает в бою. Разбор боя брал их
       * из лога и печатал как есть, и игрок читал «ОБЖИГ — k1 закрыт
       * укрытием». F11 закрыл исходник мозга и назвал карточку разбора его
       * заменой — доказательством, что бой написала нейросеть; служебный
       * идентификатор в этом доказательстве — как машинный код в титрах.
       *
       * Клиент сам подставить не может: имя зависит от НАБОРА конкретного
       * существа в конкретном бою, а набор живёт на сервере.
       */
      skills: skillNames(db, m),
      stats: result ? { blue: result.blue, orange: result.orange } : null,
    });
  });

  // ── аналитика (A7) ─────────────────────────────────────────────────────
  /*
   * АНАЛИТИКА ПРИНИМАЕТ ТОЛЬКО ТО, ЧТО МОЖЕТ ЗНАТЬ КЛИЕНТ.
   *
   * Две дыры разом, и обе били в §14.
   *
   * ЗНАМЕНАТЕЛЬ. Ручка звала `who()` с заведением аккаунта, хотя аккаунт ей не
   * нужен: двадцать безымянных POST давали двадцать «посетителей». D77 закрыл
   * это на читающих ручках и пропустил пишущую.
   *
   * ЧИСЛИТЕЛЬ. Словарь событий закрыт по ИМЕНАМ, но не по источнику, и
   * `create_done` — событие, которое пишет сервер по факту рождения
   * существа, — принималось от кого угодно. Пять curl-ов сдвинули
   * «посетитель → создал существо» с 0.0165 до 0.0280.
   *
   * A7 запрещает утверждения об удержании без аналитики. Аналитика, которую
   * может писать посторонний, — это не аналитика, а поле для ввода.
   */
  /* Список выводится из словаря, а не пишется рядом: второй список
     разошёлся бы с первым в тот день, когда добавят событие. */
  const CLIENT_EVENTS = new Set(
    Object.entries(EVENTS).filter(([, def]) => !def.server).map(([name]) => name),
  );
  r.post('/api/events', async (req, res) => {
    const acct = seen(req, res);
    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'не удалось прочитать запрос'); }
    const list = Array.isArray(body.events) ? body.events.slice(0, 32) : [];
    let ok = 0;
    let refused = 0;
    for (const e of list) {
      if (!CLIENT_EVENTS.has(e?.name)) { refused++; continue; }
      if (trackEvent(db, { name: e.name, accountId: acct.id, props: e.props || {} }).ok) ok++;
    }
    json(res, { accepted: ok, of: list.length, refused });
  });

  r.get('/api/metrics', (req, res) => json(res, metrics(db)));
  /*
   * ПРЕДОХРАНИТЕЛИ: наружу — состояние, операторам — суммы.
   *
   * Эта ручка отдавала полную сводку любому: дневной бюджет, потрачено,
   * остаток. Кроме того что это чужое дело, это ещё и подсказка тому, кто
   * хочет выжечь бюджет — видно, сколько осталось. Суммы теперь только под
   * `AIRENA_OPS=1`, и это не «скрыли», а «разделили»: экрану нужен один флаг.
   */
  r.get('/api/limits', (req, res) => json(res,
    process.env.AIRENA_OPS === '1' ? limits.status(db) : limits.publicStatus(db)));
  /*
   * ЗДОРОВЬЕ — ЭТО «ЖИВ ЛИ», А НЕ «СКОЛЬКО НАС».
   *
   * Ручка отдавала любому число существ, число матчей за всю историю и
   * статистику цикла. D63 ровно эти величины закрыл на `/api/metrics` —
   * абсолютные счётчики говорят про НАС: сколько нас, растём мы или падаем,
   * сколько стоит нас догнать. И собственный аргумент D63 звучал так:
   * «закрытая ручка бессмысленна, пока соседняя открыта». Соседняя была
   * открыта.
   *
   * Наружу остаётся то, ради чего проверку здоровья и зовут: поднят ли
   * сервер и на каких константах — второе нужно клиенту, чтобы понять, что
   * бой по старой ссылке точно не повторится (A2).
   */
  r.get('/api/health', (req, res) => json(res, {
    ok: true,
    constantsVersion: constantsVersion(),
    ...(process.env.AIRENA_OPS === '1' ? {
      creatures: db.prepare(`SELECT count(*) AS n FROM creature WHERE state='active'`).get().n,
      matches: db.prepare('SELECT count(*) AS n FROM match').get().n,
      loop: loop.stats,
      /* Потерянные трансляции — единственный отказ, который иначе не оставляет
         следа нигде: бой сыгран, рейтинг сдвинут, показать его некому. Раньше
         `open()` возвращал `null`, вызывающий глотал, и «зачётный бой никто не
         увидел» было невидимо изнутри (замер ревью: 44 из 56 под нагрузкой). */
      broadcastsDropped: ctx.live?.dropped ?? null,
    } : {}),
  }));

  /* Дев-режим: список тегов для выпадающих списков вьювера. В продакшене
     маршрута нет — не «скрыт», а не зарегистрирован. */
  if (ctx.dev) {
    r.get('/api/brains', (req, res) => {
      const dir = join(root, 'brains');
      if (!existsSync(dir)) return json(res, []);
      /* Имена файлов — фикстурные (`REF_BRAIN`), ключи ответа — стороны. */
      const tags = readdirSync(dir).filter((d) => OPEN_BRAIN_TAGS.test(d)
        && existsSync(join(dir, d, `${REF_BRAIN.blue}.js`)) && existsSync(join(dir, d, `${REF_BRAIN.orange}.js`)));
      json(res, tags.map((tag) => ({ tag, blue: null, orange: null, has: { blue: true, orange: true } })));
    });
  }

  // ── научный артефакт: шесть эталонных мозгов остаются читаемыми (F11) ──
  r.get('/api/source/:tag/:id', (req, res) => {
    const { tag, id } = req.params;
    /* `id` приезжает СТОРОНОЙ (`blue`/`orange`), а файл фикстуры называется
       иначе — см. `REF_BRAIN`. Прежние имена принимаются тоже: ссылки на
       исходник эталона разошлись по документации и по репозиторию, и ломать
       их переименованием сторон не за что. */
    const file = Object.hasOwn(REF_BRAIN, id) ? REF_BRAIN[id]
      : (Object.values(REF_BRAIN).includes(id) ? id : null);
    if (!OPEN_BRAIN_TAGS.test(tag) || !file) {
      /* Не 404, а 403 с причиной: молчаливый 404 читается как «сломалось»,
         а здесь работает правило, и правило стоит назвать. */
      return fail(res, 403, 'brain_closed',
        'исходник мозга закрыт: открыты только шесть эталонных мозгов репозитория');
    }
    const p = join(root, 'brains', tag, `${file}.js`);
    if (!existsSync(p)) return fail(res, 404, 'no_brain', 'такого мозга нет');
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(readFileSync(p, 'utf8'));
  });

  return r;
}

const side = (m, k) => ({
  /* `slot` приводится к нынешнему имени: в старых строках он записан прежним,
     и клиент, сравнивающий его с ключами кадра, промахнулся бы мимо обоих. */
  id: m[`${k}_id`], name: m[`${k}_name`], slot: sideKey(m[`${k}_slot`]),
  model: m[`${k}_model`], kit: safe(m[`${k}_kit`]), tacticsCard: m[`${k}_card`],
  delta: Math.round(m[`${k}_delta`] * 10) / 10,
  ratingAfter: Math.round(m[`${k}_rating_after`] ?? 0),
});

const safe = (s) => { try { return JSON.parse(s); } catch { return []; } };

export function jobView(j) {
  return {
    id: j.id, kind: j.kind, state: j.state, stage: j.stage, stageCode: j.stage_code || null,
    progress: j.progress, creatureId: j.creature_id,
    error: j.error_code, errorMessage: j.error_msg,
    attempts: j.attempts, createdAt: j.created_at,
  };
}

/** Шкала наблюдений: сколько до следующей адаптации (D17, §7.2а). */
/**
 * Имена умений обоих бойцов этого боя: `k1` -> «снаряд: урон».
 *
 * Четыре захардкоженных умения тоже здесь, чтобы у клиента был ОДИН источник
 * и он не держал собственный словарь, который разойдётся с реестром.
 */
export function skillNames(db, m) {
  /*
   * ИМЕНА РАЗДЕЛЕНЫ ПО СТОРОНАМ, А НЕ СВАЛЕНЫ В ОДИН СЛОВАРЬ.
   *
   * У обоих бойцов умения зовутся `k1..k3`, и плоская таблица означала, что
   * цикл по сторонам ПЕРЕЗАПИСЫВАЕТ имена первой стороны именами второй.
   * Разбор боя печатал игроку человеческое название умения ПРОТИВНИКА под
   * его собственным `k1` — ровно тот дефект, ради которого функция и заведена,
   * этажом выше.
   *
   * Общий словарь остаётся под ключом `all` для старых читателей и для
   * четырёх захардкоженных имён, которые у обеих сторон значат одно и то же.
   */
  const base = { laser: 'луч', blink: 'рывок', smash: 'удар', charge: 'разгон', jump: 'прыжок' };
  const out = { ...base, bySide: {} };
  for (const slot of ['a', 'b']) {
    const id = m[`${slot}_id`] ?? m[`${slot}Id`];
    if (!id) continue;
    const side = sideKey(m[`${slot}_slot`] ?? m[`${slot}Slot`] ?? slot);
    out.bySide[side] = { ...base };
    const row = db.prepare('SELECT kit_json, kit_active FROM creature WHERE id = ?').get(id);
    if (!row || !row.kit_active) continue;
    let kit;
    try { kit = JSON.parse(row.kit_json); } catch { continue; }
    const built = compileKit(Array.isArray(kit) ? kit : []);
    if (built.problems.length) continue;
    for (const [name, def] of Object.entries(built.defs)) {
      out.bySide[side][name] = readable(def);
      /* Плоская запись остаётся только для имён, которых нет у второй
         стороны; совпавшие `k1..k3` в ней больше не значат ничего, и клиент
         обязан читать `bySide`. */
      if (out[name] === undefined) out[name] = readable(def);
    }
  }
  return out;
}

export function observationsOf(row, tries = null) {
  /*
   * ШКАЛА ПОКАЗЫВАЕТ ТО, ЧТО НА САМОМ ДЕЛЕ РЕШАЕТ, — БОИ ДО СЛЕДУЮЩЕЙ ПОПЫТКИ.
   *
   * ── чем она была и почему это не работало ─────────────────────────────────
   *
   * Она моделировала БЮДЖЕТ НАБЛЮДЕНИЙ: «заработано минус потрачено», где
   * заработок — бои (поражение вдвое), а трата — принятые адаптации по десять.
   * Красивая модель, которой в коде нет: `arena-loop.js` запускает адаптацию
   * ПО СЧЁТЧИКУ БОЁВ (`fights % ADAPT_EVERY === 0`) и ни на какие наблюдения
   * не смотрит.
   *
   * Расхождение модели с механикой давало ровно то, что даёт всякое такое
   * расхождение, — вечную единицу. Заработок рос примерно полторы единицы за
   * бой, трата — по десять за ПРИНЯТУЮ адаптацию, а принимается одна из
   * двадцати. Замерено на живом существе: 1236 боёв, 73 попытки, 3 принято —
   * шкала показывала «полно» с седьмого боя и до конца жизни, а панель итога
   * после каждого поражения обещала «сейчас существо перепишет себя».
   * Обещание, которое сбывается раз в двести боёв.
   *
   * Списывать по попыткам, а не по принятым, — половина правды: расхождение
   * уменьшается, но остаётся, потому что модель всё равно не та.
   *
   * ── что она показывает теперь ─────────────────────────────────────────────
   *
   * Ровно условие запуска: сколько боёв прошло с последней попытки из
   * `ADAPT_EVERY`. Это настоящий механизм, поэтому шкала не может разойтись с
   * ним — она и есть он.
   *
   * Что при этом ЧЕСТНО ТЕРЯЕТСЯ: «поражение даёт вдвое больше материала»
   * (§7.2а) шкалой больше не показывается, потому что механика этого не
   * делает. Показывать неработающее правило хуже, чем не показывать
   * работающее: первое — обещание, второе — умолчание.
   *
   * Библиотечные существа не адаптируются никогда: у них нет владельца, и
   * переписывать им тактику не для кого. Для них шкала не «полная», а
   * ОТСУТСТВУЮЩАЯ, и честный ответ — null.
   */
  if (row.is_library) return null;

  const every = Number(process.env.AIRENA_ADAPT_EVERY || 10);
  const done = Math.floor((row.fights || 0) / every) * every;
  const have = Math.max(0, (row.fights || 0) - done);

  return {
    have,
    need: every,
    frac: every ? Math.min(1, have / every) : 0,
    /* «Полно» = СЛЕДУЮЩИЙ бой запускает попытку. Не «вот-вот станет лучше»:
       попытка принимается, только если выигрывает у старого, а это одна из
       двадцати. Порог на единицу раньше кратного, а не ровно в нём: ровно в
       кратном шкала стоит один тик и игрок её не видит. */
    full: every > 0 && have >= every - 1,
    /* Сколько раз уже пробовало — чтобы «ноль принятых» читалось как отбор,
       а не как поломка. Считает вызывающий: это count(*) по таблице. */
    tries: Number.isFinite(tries) ? tries : null,
  };
}

/**
 * Разбор боя из лога — детерминированный, без единого вызова LLM (D5).
 * Берём то, что в бою действительно произошло, а не пересказ.
 */
export function beatsFrom(log, m) {
  /*
   * Поле называется `type`, а не `kind`.
   *
   * `sim.js` пишет `world.log.push({ t, type, who, ... })`. Читатель,
   * искавший `e.kind`, находил ноль совпадений при полном логе и отдавал
   * пустой разбор — то есть экран «что оно думало», на котором держится
   * доказательство F11, был пуст всегда и молча. Ошибка не падала: пустой
   * массив это законный ответ.
   */
  const out = [];
  /* ОБЕ стороны сравнения — через мост, и это не перестраховка: слот строки и
     `who` строки лога могут прийти из разных эпох (строка старая, лог уже
     переведён `sideResult`). Перевести одну сторону сравнения значило бы
     сверять нынешнее имя со старым — совпадений ноль, и весь разбор боя молча
     уехал бы на второго бойца. */
  const name = (slot) => (sideKey(slot) === sideKey(m.a_slot) ? m.a_name : m.b_name);
  const KEEP = new Set(['say', 'damage', 'miss', 'blink', 'evade', 'interrupt', 'refused', 'death', 'chargeMiss', 'burned', 'landed']);
  for (const e of log) {
    if (!e || typeof e !== 'object' || !KEEP.has(e.type)) continue;
    const base = { t: e.t, who: name(e.who), type: e.type };
    if (e.type === 'say') out.push({ ...base, text: e.text });
    else if (e.type === 'damage') out.push({ ...base, type: 'hit', skill: e.skill, amount: e.amount });
    /*
     * Причина промаха НЕ ВЫБРАСЫВАЕТСЯ. Раньше в тип переводилось только
     * укрытие, а всё остальное схлопывалось в «мимо» — включая `airborne`,
     * то есть единственное свидетельство, что прыжок сработал. Экран «что оно
     * думало» — место, куда игрок приходит именно за объяснением, и там
     * места сколько угодно.
     */
    else if (e.type === 'miss') {
      out.push({
        ...base,
        type: e.reason === 'cover' ? 'blocked' : (e.reason === 'airborne' ? 'dodged' : 'miss'),
        skill: e.skill,
        reason: e.reason ?? null,
      });
    }
    else out.push({ ...base, skill: e.skill ?? null, reason: e.reason ?? null });
  }
  /* Реплики держатся всегда: их мало, и они — то, ради чего экран есть.
     Подряд идущие одинаковые схлопываются: мозг, повторивший строку на двух
     соседних мыслях, сказал её один раз — а две одинаковые строки в разборе
     читаются как сбой показа. */
  const says = out.filter((b) => b.type === 'say')
    .filter((b, i, all) => !(i && all[i - 1].who === b.who && all[i - 1].text === b.text && b.t - all[i - 1].t < 3.2));
  const others = out.filter((b) => b.type !== 'say');
  return [...says, ...others.slice(0, 40)].sort((a, b) => a.t - b.t);
}
