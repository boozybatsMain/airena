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
import { abilitiesOf } from '../skills/describe.js';
import { grammar, validateKit, costOf } from '../skills/registry.js';
import { EVENTS, record as trackEvent, metrics } from './analytics.js';
import { REST_MS, buildOf } from './arena-loop.js';
import { card, cards, generationOf, generationsOf, history, refactor as applyRefactor, sideKey, sideResult, sinceSummary } from './creatures.js';
import { ensureIcons, ensureIconsSoon, readIcon } from './forge/icons.js';
import { viability } from './forge/viability.js';
import { Router, cookies, fail, json, readJson, setCookie } from './http.js';
import { ladderView, modelTable, rankOf } from './ladder.js';
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

/*
 * THE AWAY RECAP HAS TO SURVIVE THE SECOND FETCH.
 *
 * `since` is computed from `account.last_seen_at`, and reading the session is
 * what MOVES `last_seen_at`. So the recap of §6.1 existed in exactly one
 * response and vanished from every one after it — while the client fetches the
 * session at boot, again the moment the account is linked, and every twenty
 * seconds after that. A player back from three days away could lose the whole
 * "WHILE YOU WERE AWAY" card to a race they cannot see and we cannot reproduce.
 *
 * A short memory fixes it without a migration and without lying: the summary is
 * of a real absence, and for a minute and a half every request about that
 * absence gets the same answer. The client decides whether to show it (once per
 * session, `sessionStorage`); the server's job is only to stop the fact from
 * evaporating between two fetches a hundred milliseconds apart.
 *
 * Per process and bounded: entries expire, and the map is swept whenever it
 * grows past a size no real stand reaches.
 */
const AWAY_HOLD_MS = 90e3;
const AWAY_MAX = 500;
const awayHeld = new Map();

/**
 * The recap for this account, or `null`.
 *
 * `wasAway` is true only on the request that first notices the gap, because
 * that same request has already moved `last_seen_at`. Held answers expire on
 * their own — a stale entry that outlived its window is deleted rather than
 * returned, so the card cannot reappear an hour later over a running fight.
 */
function heldSince(accountId, wasAway, compute) {
  const now = Date.now();
  const hit = awayHeld.get(accountId);
  if (hit) {
    if (now - hit.at < AWAY_HOLD_MS) return hit.value;
    awayHeld.delete(accountId);
  }
  if (!wasAway) return null;
  if (awayHeld.size >= AWAY_MAX) {
    for (const [k, v] of awayHeld) if (now - v.at >= AWAY_HOLD_MS) awayHeld.delete(k);
  }
  const value = compute();
  awayHeld.set(accountId, { at: now, value });
  return value;
}

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
    return String(a?.id || 'account').slice(0, 12);
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
     * Draw the missing ability glyphs, later, without holding this up.
     *
     * The session is the first thing every client asks for and the thing it
     * re-asks every twenty seconds, which makes it both the earliest moment we
     * know a creature exists and the worst possible place to wait on an image
     * service. `ensureIconsSoon` returns nothing on purpose: there is no handle
     * here to await, and the debounce inside it (one attempt in flight, none
     * for ten minutes after a failure) is what keeps a polled route from
     * turning into a generation loop.
     */
    if (mine) ensureIconsSoon(db, mine.id, safe(mine.kit_json));
    /*
     * The limit state is asked with THE SAME question `POST /api/creature`
     * asks, or the button on screen and the server's answer part ways. The
     * bundle is the cheapest free one: that is what a player creates with when
     * they have chosen nothing, and it is what the daily allowance is counted
     * against.
     */
    const cheap = catalog.cheapestFree?.() ?? null;
    /* Computed for EVERYONE, guests included: since 05.09 a guest creates on
       equal terms, so a guest is owed the same refusal before the press rather
       than after it. */
    const limitState = cheap
      ? limits.check(db, { account: acct, bundle: cheap, kind: 'create' })
      : null;

    json(res, {
      guest: !!acct.is_guest,
      accountId: acct.id,
      /* A stand with no platform behind it: the client may offer the dev
         sign-in. See the file header. */
      dev: DEV,
      /* A guest creates on the same terms as an account (05.09) — see
         `limits.check`. */
      canCreate: (!limitState || limitState.ok),
      /*
       * `canCreate` ANSWERS THE BUTTON'S QUESTION, not half of it.
       *
       * It used to look only at "is this a guest" and "is the free creature
       * spent", and stayed `true` while the arena's daily allowance was gone or
       * the account's own count for the day was used up. The button lit, the
       * server refused: a stranger wrote their first sentence, pressed CREATE
       * and was told something we already knew before they started typing.
       */
      /* Neither "guest" nor "the free creature is used" blocks any more
         (05.09): what is left are the money refusals, and those are still
         visible BEFORE the press. The screen turns the code into a sentence;
         the sentences themselves live in `limits.js` `DENY`. */
      createBlocked: (limitState && !limitState.ok ? limitState.code : null),
      /*
       * `rank` RIDES ALONG WITH THE CREATURE, and it is one query.
       *
       * The chip in the top-right corner reads `#782 · 1,214 RATING`, and the
       * session is the only thing it reads. Without this field the shell would
       * have to fetch the whole ladder — top ten, prize board, the window
       * around you — to print one number, on every screen, every twenty
       * seconds. `rankOf` is that number and nothing else, ordered exactly the
       * way the ladder orders it (see `ladder.js`).
       */
      creature: mine
        ? { ...card(mine, { viewerId: acct.id, db }), rank: rankOf(db, mine.id) }
        : null,
      /*
       * EVERY CREATURE THIS ACCOUNT EVER MADE, newest first.
       *
       * `creature` above is the current one — the newest active — and for a
       * long time that was all the product admitted to. But creating again no
       * longer replaces anything: the older creature keeps its record and keeps
       * fighting on the ladder. A player with three generations who is shown
       * one of them is being told the other two are gone.
       *
       * Deliberately thin: the generations strip needs a name, a number and a
       * rating, and full cards for a lineage of six would be six kits, six
       * prompts and six tactics cards on a route that is polled every twenty
       * seconds.
       */
      creatures: (() => {
        const line = db.prepare(`SELECT id, name, state, rating, created_at, is_library, owner_id
                                 FROM creature WHERE owner_id = ? ORDER BY created_at DESC`)
          .all(acct.id);
        /* One grouped walk of the lineage instead of a `COUNT(*)` per row, on
           a route that is polled every twenty seconds by every open tab. */
        const gens = generationsOf(db, line);
        return line.map((c) => ({
          id: c.id,
          name: c.name,
          generation: gens.get(c.id) ?? generationOf(db, c),
          state: c.state,
          rating: Math.round(c.rating),
          createdAt: c.created_at,
        }));
      })(),
      /*
       * THE WORLD, in the two numbers the season chip prints.
       *
       * `creatures` counts creatures with an owner: our own calibration
       * library is furniture, and counting it would tell the player the arena
       * is twice as populated as it is. `matchesToday` is the pulse — proof
       * that the arena runs whether or not anyone is watching.
       */
      world: {
        creatures: db.prepare(`SELECT count(*) AS n FROM creature
                               WHERE state = 'active' AND is_library = 0`).get().n,
        matchesToday: db.prepare('SELECT count(*) AS n FROM match WHERE ended_at >= ?')
          .get(Date.now() - (Date.now() % 86400e3)).n,
      },
      job: activeJob ? jobView(activeJob) : null,
      nextFightAt: mine ? loop.nextFightAt(mine.id) : null,
      /*
       * THE COUNTDOWN ALSO GOES OUT AS A DURATION (D161).
       *
       * `nextFightAt` is the SERVER's clock. The client used to subtract its
       * own `Date.now()` from it, which is the difference between two clocks
       * that were never the same one: a phone a minute fast printed `NEXT
       * FIGHT IN 01:03` where the fight was five seconds away. That was a
       * detail while the timer sat on a waiting screen; on the result card it
       * is the closing line, and the closing line cannot be wrong.
       *
       * `nextFightIn` is milliseconds FROM THIS RESPONSE. The client turns it
       * into a local deadline the moment it arrives and counts down on its own
       * clock, which is always in agreement with itself.
       */
      /*
       * WHILE THE FIGHT RUNS THERE IS NO COUNTDOWN — there is `fightingNow`.
       *
       * The slot is reserved against the UPPER estimate of a fight's length
       * and corrected to the real one only once the fight has been simulated.
       * Inside that window `nextFightAt` reads "now plus fifty-odd seconds",
       * and a session caught in it printed `NEXT FIGHT IN 58` — over a battle
       * already on screen, for up to the twenty seconds until the client asks
       * again.
       *
       * While the creature is in the arena the honest answer is not a number:
       * it is that the creature is fighting.
       */
      nextFightIn: mine && !fightingNow(loop, mine.id) && loop.nextFightAt(mine.id)
        ? Math.max(0, loop.nextFightAt(mine.id) - Date.now()) : null,
      /* Is this creature in a fight right now — what separates "fighting" from
         "resting", and therefore which words the live screen is allowed to use. */
      fightingNow: mine ? fightingNow(loop, mine.id) : false,
      /*
       * NO FREE OPPONENT — and the screen has to say so in words.
       *
       * Matchmaking can come back empty: every creature near this rating is
       * already in a fight. Without this flag the countdown simply restarted,
       * over and over, and a player watching an empty arena was told a fight
       * was eight seconds away for as long as they kept watching. `SEARCHING`
       * that never resolves is indistinguishable from a broken page.
       */
      noOpponent: mine ? (loop.starvedAt?.(mine.id) ?? false) : false,
      /* How long a rest lasts — the denominator of the client's countdown ring.
         The number lives on the server (`REST_MS`), and a client holding its own
         copy would disagree with it the first time the pace is tuned. */
      restMs: REST_MS,
      liveMatch: ctx.live.describe(),
      /* §8.1: `{ n, endsAt, prizeCoins }` — the season chip in the chrome and
         the SEASON tab of the ladder both read this one row, so the countdown
         at the top of the page and the one inside the ladder cannot drift. */
      season,
      constantsVersion: constantsVersion(),
      /*
       * WHAT HAPPENED WHILE YOU WERE AWAY (§6.1), or `null` for a player who
       * never left.
       *
       * Half an hour is the threshold because the arena fights on its own: come
       * back after three days and the creature has had thousands of fights, and
       * a career that moved that far without you is the story of the session.
       * Come back after five minutes and there is nothing to recap.
       *
       * `null` also when the gap was long but empty — an overlay card
       * announcing "0 FIGHTS" is worse than no card at all, and a summary
       * object holding a zero is a promise the screen then has to check twice.
       * `heldSince` keeps whichever answer this is for ninety seconds (see it
       * above) so a second fetch cannot take the card away.
       */
      since: mine
        ? heldSince(acct.id, away > 30 * 60e3, () => {
          const sum = sinceSummary(db, mine.id, acct.last_seen_at);
          return sum && sum.fights > 0 ? sum : null;
        })
        : null,
      limits: limits.publicStatus(db),
    });
  });

  /** Стена аккаунта. Токен GENEX проверяет платформа; мы получаем sub и почту. */
  r.post('/api/session/claim', async (req, res) => {
    const acct = who(req, res);
    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'The request could not be read.'); }
    /* `await` обязателен: проверка подписи ходит за ключами платформы
       (`identity.js`), то есть асинхронна. Без него сюда приезжает Promise —
       объект, и `if (!claim)` его пропускает; дальше `claimAccount`
       раскладывает его на `{sub, email}`, получает `undefined` и отвечает
       `no_sub`. Замерено гейтом: стена перестаёт пускать ВООБЩЕ никого —
       400 и на подделку, и на настоящий токен. `tools/checkidentity.mjs`. */
    const claim = await ctx.verifyEmbedToken(body.embedToken);
    if (!claim) return fail(res, 401, 'bad_token', 'The platform did not confirm who you are.');
    const out = claimAccount(db, acct.is_guest ? acct.id : null, claim);
    if (out.error) return fail(res, 400, out.error, 'The account could not be linked.');
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
    /* Three cards, and `cards()` resolves the two query-bearing fields —
       glyph URLs and generation numbers — once for the list rather than once
       per creature. Same payload, two statements instead of six. */
    json(res, cards(out, { db }));
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

  /**
   * A mind's name and the mark next to it, from the catalogue label.
   *
   * The label arrives as the model directory writes it — "Google: Gemini 3.7
   * Flash" — and the screen needs the two halves apart: the provider becomes a
   * small geometric mark, the name becomes the card's title. Splitting on the
   * client would put a parser for someone else's format in the browser; when
   * the format changes it changes here, once.
   *
   * A label without a colon still has to work, so the provider falls back to
   * the family prefix of the model id (`z-ai/glm-5.3-flash` → Z.ai).
   */
  const PROVIDER_NAMES = {
    'z-ai': 'Z.ai', google: 'Google', anthropic: 'Anthropic',
    openai: 'OpenAI', meta: 'Meta', mistralai: 'Mistral', qwen: 'Qwen',
    deepseek: 'DeepSeek', airena: 'Airena',
  };
  function mindName(b) {
    const label = String(b.label || b.modelId || '').trim();
    const at = label.indexOf(':');
    if (at > 0) {
      return { provider: label.slice(0, at).trim(), name: label.slice(at + 1).trim() };
    }
    const family = String(b.modelId || '').split('/')[0].toLowerCase();
    const provider = PROVIDER_NAMES[family]
      || (family ? family[0].toUpperCase() + family.slice(1) : 'Airena');
    return { provider, name: label || provider };
  }

  /**
   * Two modes, and the words for them are the player's, not the industry's.
   *
   * A bundle's suffix says how much the mind is allowed to deliberate before it
   * writes. §1.4 forbids the vocabulary that usually names this — thinking
   * budgets, reasoning effort — so the axis is stated as what the player
   * actually trades: a QUICK mind answers sooner, a DEEP one takes longer.
   */
  const modeOf = (b) => (b.mode === 'plain' ? 'quick' : 'deep');

  /**
   * Why a dimmed mind cannot be chosen — and, first, WHO is being told.
   *
   * `Worker offline — open /worker` used to stand here. It is an operator's
   * sentence: an internal noun and a raw route, and it was reasoned about as if
   * only operators would read it. They are not the readers. The accounts on the
   * hub list are ordinary players who happen to be able to lend the game a
   * mind, and this string is what the create card's tooltip and the picker row
   * printed for them — `reasonOf()` in `ui/mindpicker.js` prefers the server's
   * `unavailableReason` over the screen's own wording whenever there is one, so
   * the last developer speech in the main flow won every time it appeared.
   *
   * The condition it describes is real and worth saying; the vocabulary is not.
   * A mind nobody is sharing is RESTING, and the whole product says so with one
   * sentence — `NO_REASON` in `ui/mindpicker.js`, character for character the
   * string below. If one moves, both move.
   *
   * The instruction survives where it can be carried out: the worker page,
   * which is the only screen whose reader is standing next to the machine.
   *
   * `null` is not a gap in the payload — §8.5 types this field `string|null` —
   * but it is now only reachable off the catalog route: a sub bundle is not
   * shown at all to an account off the list (D175, the filter below).
   *
   * The paid tier keeps its sentence for everyone, because there it IS the
   * player's: payments opening is a thing that happens to them.
   */
  const NO_MIND_REASON = 'Coming back soon — nobody is sharing this mind right now.';
  const dimReason = (b, acct) => {
    if (b.tier !== 'sub') return 'Coming when payments open';
    return ctx.hub?.allows(acct) ? NO_MIND_REASON : null;
  };

  r.get('/api/catalog', (req, res) => {
    const acct = seen(req, res);
    const cat = catalog.current();
    /*
     * ── SUBSCRIPTION BUNDLES ARE NOT SHOWN TO EVERYONE (D175) ─────────────
     *
     * An account off the list does not see them AT ALL — not greyed out, not
     * at all. A greyed row is a promise that it will open one day, and for a
     * channel opened by the founder name by name that promise is false. For an
     * allowed account with its worker switched off the row stays: there the
     * promise is true, and there is exactly one thing to do about it.
     */
    const visible = cat.bundles.filter((b) => b.tier !== 'sub' || ctx.hub?.allows(acct));
    const bundles = visible.map((b) => {
      const { provider, name } = mindName(b);
      const available = b.tier === 'sub' ? subReady(acct) : OPEN_TIERS.has(b.tier);
      return {
        id: b.bundle,
        /* The family, so the screen can group two modes of one mind together. */
        model: b.modelId,
        name,
        provider,
        mode: modeOf(b),
        tier: b.tier,
        featured: false,
        /*
         * How long the wait is. Seconds are not money and the player both needs
         * and benefits from knowing them: waiting is what they mistake for a
         * broken page. `null` means this mind has never been measured, and the
         * screen says nothing rather than inventing a number.
         */
        waitSecs: b.secs ?? null,
        available,
        /* §2.2: real money does not enter the platform yet. A subscription
           costs the player nothing and is therefore open (D164) — but only
           while there is someone to carry it out (D175). */
        unavailableReason: available ? null : dimReason(b, acct),
      };
    });

    /*
     * FEATURED = THE FASTEST AVAILABLE BUNDLE OF EACH MIND, AT MOST FIVE.
     *
     * One card per mind, not one per mode: showing Gemini twice, once quick and
     * once deep, turns a choice between minds into a choice between settings.
     * The chosen card carries the mode toggle itself (§6.3).
     *
     * Fastest, not cheapest. The catalogue is sorted by price, and the create
     * screen used to take the first available row — so the default was the
     * cheapest bundle, which is also the slowest. The player pressed CREATE and
     * went away for ten minutes without ever having chosen that.
     *
     * An unmeasured wait sorts last: a mind we have never timed is not a
     * defensible recommendation for someone's first creature.
     */
    const wait = (b) => (b.waitSecs == null ? Infinity : b.waitSecs);
    const best = new Map();
    for (const b of bundles) {
      if (!b.available) continue;
      const cur = best.get(b.model);
      if (!cur || wait(b) < wait(cur)) best.set(b.model, b);
    }
    [...best.values()].sort((x, y) => wait(x) - wait(y)).slice(0, 5)
      .forEach((b) => { b.featured = true; });

    json(res, {
      /* Not one number in dollars anywhere below. What the screen gets is the
         name, the wait and the reason it cannot be chosen — everything it
         needs, and everything it is allowed to know (E6, N1). */
      bundles,
      canCreate: true,
      /* The same fact the dimmed cards carry (`Coming when payments open`) and
         the same noun the refusals use, said once for the row as a whole. */
      note: bundles.some((b) => !b.available && b.tier !== 'sub')
        ? 'More minds open when payments do.' : null,
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
    if (!account) { fail(res, 401, 'bad_token', 'This worker is no longer linked — pair it again.'); return null; }
    /* Допуск перепроверяется НА КАЖДОМ запросе, а не только при привязке:
       основатель убирает аккаунт из списка правкой переменной, и токен,
       выданный вчера, обязан перестать работать сегодня. */
    if (!ctx.hub.allows(account)) { fail(res, 403, 'not_allowed', 'This account is no longer on the list.'); return null; }
    return { token, account };
  }

  /** Код привязки для экрана. Только допущенным. */
  r.post('/api/worker/pair/start', (req, res) => {
    const acct = who(req, res);
    if (!ctx.hub?.allows(acct)) {
      return fail(res, 403, 'not_allowed', 'This account is not on the list of those who can run a worker.');
    }
    json(res, ctx.hub.startPairing(acct.id));
  });

  /** Обмен кода на токен. Без авторизации — кодом и авторизуется. */
  r.post('/api/worker/pair/claim', async (req, res) => {
    let body;
    try { body = await readJson(req); } catch { body = {}; }
    const got = ctx.hub?.claimPairing(body.code, body.hostname);
    if (!got) return fail(res, 404, 'bad_code', 'The code did not match or has expired.');
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
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'The answer could not be read.'); }
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
    if (!existsSync(p)) return fail(res, 404, 'no_worker', 'The worker program has not been built.');
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
    if (!row || !row.body_safe) return fail(res, 404, 'no_body', 'This creature has no body of its own.');

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

  /**
   * One ability glyph.
   *
   * Public, like the body and for the same reason: the icon is drawn in the
   * battle HUD of a fight that anyone can watch, so hiding it would only break
   * the viewer. There is nothing of the mind in a picture of a cone.
   *
   * CACHING, AND WHY THE ADDRESS CARRIES A VERSION.
   *
   * Abilities change — free and instantly (F10) — and `POST /api/creature/:id/kit`
   * redraws all three glyphs at the same three addresses. The old header said
   * `max-age=86400, immutable`, and `immutable` is a promise that the bytes at
   * this URL will never change: the owner who had just rewritten their
   * abilities kept looking at pictures of the old ones for a day, with no
   * reload that could reach them. This comment argued exactly that against a
   * year, and then made the same promise with a smaller number on it.
   *
   * So the promise is made true instead of being withdrawn. `iconUrls()` now
   * stamps `?v=<created_at>` on every address it hands out — `card().icons`,
   * `card().abilities[].icon` and the live message's `abilities[side][].icon`
   * all carry it — so a redrawn glyph IS a new address, and a request that
   * quotes the current version gets the year and the word, because for that
   * address both are finally honest.
   *
   * An address WITHOUT a version is one somebody spelled out of an id and a
   * slot, and nothing about it can say when the picture behind it changed. It
   * gets a minute of freshness and a day of `stale-while-revalidate`: the tile
   * still paints instantly from cache, the browser checks behind it, and the
   * `ETag` makes that check a 304 rather than a second download of a jpeg that
   * has not moved. A day of silence on that lane was the bug; a minute is not.
   */
  r.get('/api/creature/:id/icon/:slot', (req, res) => {
    const slotIndex = Number(req.params.slot);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 15) {
      return fail(res, 404, 'no_icon', 'There is no such ability.');
    }
    const row = readIcon(db, req.params.id, slotIndex);
    if (!row) return fail(res, 404, 'no_icon', 'This ability has no picture yet.');

    const version = String(row.created_at || 0);
    const etag = `"${slotIndex}-${version}"`;
    let asked = null;
    try { asked = new URL(req.url, 'http://x').searchParams.get('v'); } catch { asked = null; }
    const cache = asked === version
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=60, stale-while-revalidate=86400';

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag, 'cache-control': cache });
      return res.end();
    }
    res.writeHead(200, {
      'content-type': row.mime || 'image/jpeg',
      'content-length': row.bytes.length,
      etag,
      'cache-control': cache,
    });
    res.end(Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes));
  });

  // ── существо ───────────────────────────────────────────────────────────
  r.get('/api/creature/:id', (req, res) => {
    const acct = seen(req, res);
    const row = db.prepare('SELECT * FROM creature WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'no_creature', 'There is no such creature.');
    const c = card(row, { viewerId: acct.id, db });
    /* Same lazy hook as the session, for the creature page of somebody who
       arrived by a direct link and has no session of their own here. */
    ensureIconsSoon(db, row.id, c.kit);
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
      /* Any creature, not only the viewer's own: a visitor who arrived from
         the ladder can watch it live if it is in the broadcast right now,
         and its last recorded fight otherwise (the page links `#/watch/`). */
      fightingNow: fightingNow(loop, row.id),
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
    if (!row) return fail(res, 404, 'no_creature', 'There is no such creature.');
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
    if (!row) return fail(res, 404, 'no_creature', 'There is no such creature.');
    if (row.owner_id !== acct.id) return fail(res, 403, 'not_yours', 'This creature is not yours.');

    const last = kitChecks.get(acct.id) || 0;
    if (Date.now() - last < 3000) return fail(res, 429, 'too_often', 'A check is already running — wait a second.');
    kitChecks.set(acct.id, Date.now());
    if (kitChecks.size > 512) kitChecks.clear();

    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'The request could not be read.'); }
    const bad = validateKit(body.kit);
    if (bad.length) return fail(res, 422, 'bad_kit', 'These abilities do not pass the rules.', { violations: bad });

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
      fail(res, 503, 'check_failed', 'The check did not start — you can apply them anyway.');
    }
  });

  /** Смена кита — бесплатна, мгновенна, детерминирована (D3, §7.2·2, F10). */
  r.post('/api/creature/:id/kit', async (req, res) => {
    const acct = who(req, res);
    const row = db.prepare('SELECT * FROM creature WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'no_creature', 'There is no such creature.');
    if (row.owner_id !== acct.id) return fail(res, 403, 'not_yours', 'This creature is not yours.');
    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'The request could not be read.'); }

    /* Бюджет пересчитывается ЗАНОВО на сервере: цифры, присланные клиентом
       или моделью, не авторитетны (§8). */
    const bad = validateKit(body.kit);
    if (bad.length) return fail(res, 422, 'bad_kit', 'These abilities do not pass the rules.', { violations: bad });

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
    /*
     * THE GLYPHS ARE REDRAWN, ALL THREE, FOR THE SAME REASON THE DECORATION IS
     * DROPPED ABOVE.
     *
     * An icon is a picture of one specific ability. After a change the old
     * picture is not merely stale, it is wrong — a flame where the creature now
     * carries frost — and a wrong picture in the battle HUD is worse than the
     * plain procedural shape the client falls back to. `force` regenerates
     * every slot rather than the changed ones because the slots are addressed
     * by index and the whole set moves when one ability is inserted.
     *
     * Fire-and-forget: the answer to "change my abilities" is instant and free
     * (F10, D3), and it does not wait on an image service.
     */
    ensureIcons(db, row.id, { force: true }).catch(() => {});
    json(res, { ok: true, kit: body.kit, cost: body.kit.map(costOf) });
  });

  // ── генерация ──────────────────────────────────────────────────────────
  r.post('/api/creature', async (req, res) => {
    const acct = who(req, res);
    let body;
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'The request could not be read.'); }

    const bundle = catalog.find(body.bundle);
    if (!bundle) return fail(res, 400, 'no_bundle', 'There is no such mind to choose from.');
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
    /* The screen's own sentence for `short_prompt`, character for character
       (`DENY_TEXT` in `screens/create.js`). It answers the same press, and a
       refusal that changes its wording depending on whether the client or the
       server said it is two products talking over each other. */
    if (prompt.length < 3) return fail(res, 422, 'short_prompt', 'Write one sentence — that is enough.');

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
        fail(res, 403, 'not_allowed', 'This mind is not available on this account.', { bundle: bundle.bundle });
        return true;
      }
      if (!ctx.hub.isOnline(acct.id)) {
        /*
         * The player's sentence, not the operator's — and the SAME sentence the
         * dimmed card and the picker row already carried, because this is the
         * same condition read a second later. It answers a press of CREATE and
         * renders inline under the button (§6.3); "start it and try again" is
         * an instruction to go and run a process, which nobody reading that
         * line is in a position to do. The machine-readable half is unchanged:
         * `worker_offline` still tells the operator's own screen which door is
         * shut.
         */
        fail(res, 409, 'worker_offline', NO_MIND_REASON, { bundle: bundle.bundle });
        return true;
      }
      return false;
    }
    if (OPEN_TIERS.has(bundle.tier)) return false;
    /* Again the screen's own sentence (`not_free` in `DENY_TEXT`): the dimmed
       card already said `Coming when payments open`, and the line under the
       button has to be the same fact stated the same way. */
    fail(res, 402, 'not_free', 'Payments are not open yet, so this mind cannot be used.', { bundle: bundle.bundle });
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
      return fail(res, 404, 'no_refactor', 'Rewriting a creature’s mind is not open in this version.');
    }
    const acct = who(req, res);
    const row = db.prepare('SELECT * FROM creature WHERE id = ?').get(req.params.id);
    if (!row) return fail(res, 404, 'no_creature', 'There is no such creature.');
    if (row.owner_id !== acct.id) return fail(res, 403, 'not_yours', 'This creature is not yours.');
    let body;
    try { body = await readJson(req); } catch { body = {}; }
    const bundle = catalog.find(body.bundle) || catalog.cheapestFree();
    if (!bundle) return fail(res, 503, 'no_catalog', 'No minds are available right now.');
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
    if (!j) return fail(res, 404, 'no_job', 'There is no such generation.');
    if (j.account_id && j.account_id !== acct.id) return fail(res, 403, 'not_yours', 'This generation is not yours.');
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
    if (!m) return fail(res, 404, 'no_match', 'There is no such fight.');
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
    try { body = await readJson(req); } catch { return fail(res, 400, 'bad_body', 'The request could not be read.'); }
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
        'The mind of a creature is closed: only the six reference minds of the repository are open.');
    }
    const p = join(root, 'brains', tag, `${file}.js`);
    if (!existsSync(p)) return fail(res, 404, 'no_brain', 'There is no such reference mind.');
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(readFileSync(p, 'utf8'));
  });

  return r;
}

const side = (m, k) => {
  const raw = safe(m[`${k}_kit`]);
  return {
    /* `slot` приводится к нынешнему имени: в старых строках он записан прежним,
       и клиент, сравнивающий его с ключами кадра, промахнулся бы мимо обоих. */
    id: m[`${k}_id`], name: m[`${k}_name`], slot: sideKey(m[`${k}_slot`]),
    model: m[`${k}_model`], kit: raw, tacticsCard: m[`${k}_card`],
    /*
     * THE NAMED ABILITIES TRAVEL WITH THE FIGHTER (§8.2).
     *
     * The raw grammar alone was enough for a name — element word plus shape
     * word — and the fight detail built one itself. It could not build a
     * unique one: two abilities of a kit may share both axes, and the beats
     * then read "lands KINETIC LUNGE for 20" and "lands KINETIC LUNGE for 26"
     * for two different slots. Uniqueness is a property of the kit as a whole,
     * so it can only be decided where the whole kit is — here, once, the same
     * way the creature page and the battle HUD decide it.
     */
    abilities: abilitiesOf(raw),
    delta: Math.round(m[`${k}_delta`] * 10) / 10,
    ratingAfter: Math.round(m[`${k}_rating_after`] ?? 0),
  };
};

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
  const base = { laser: 'beam', blink: 'blink', smash: 'smash', charge: 'charge', jump: 'leap' };
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
  /*
   * WHO ACTED IS AN IDENTITY, AND ONLY THIS FUNCTION STILL KNOWS IT.
   *
   * The log speaks sides — `who: 'blue'` — and this loop used to replace that
   * with a NAME, throwing the identity away on the way out. Names are not
   * unique: two creatures may carry the same generated one (the dev ladder
   * holds two STONE GOLEMs), and the retelling downstream then cannot say
   * which of them lunged. It loses both things at once — the ability set to
   * read `k1` against, and the side to colour the line with — so six beats
   * come out as "STONE GOLEM lands a hit" in one ink.
   *
   * The side is already here and costs nothing to carry, so the beat carries
   * the fighter's id and its side beside the name. Both are unambiguous by
   * construction; the name stays because it is what the sentence prints.
   *
   * BOTH sides of the comparison go through the bridge, and that is not
   * belt-and-braces: a row's slot and a log line's `who` can come from
   * different eras (an old row whose log `sideResult` has already translated).
   * Normalising one side only would compare today's name with yesterday's —
   * zero matches, and the whole retelling would silently move to the other
   * fighter.
   */
  const actor = (slot) => {
    const key = sideKey(slot);
    const first = key === sideKey(m.a_slot);
    return { who: first ? m.a_name : m.b_name, whoId: first ? m.a_id : m.b_id, whoSide: key };
  };
  /*
   * THE RULES THAT DECIDED THE FIGHT BELONG IN THE RETELLING TOO.
   *
   * Five types were dropped here — `immune`, `absorbed`, `shieldBroke`,
   * `heal`, `wall` — and the spectator review of 07.09 found the cost of that
   * twice over. In TOWER vs THUNDERSTRIKE the fight turned on three interrupts
   * and one refused stun, and the retelling could show the interrupts and not
   * the refusal. In BARROW vs GRAVEDIGGER the winner landed no targeted hit at
   * all: it healed nine times and stood inside a field that was refused
   * sixty-two times, and the panel had nothing to say about a 34-second fight.
   * A retelling that keeps only the hits tells the story of a fight that did
   * not happen.
   */
  const KEEP = new Set(['say', 'damage', 'miss', 'blink', 'evade', 'interrupt', 'refused',
    'death', 'chargeMiss', 'burned', 'landed', 'immune', 'absorbed', 'shieldBroke',
    'heal', 'wall']);
  for (const e of log) {
    if (!e || typeof e !== 'object' || !KEEP.has(e.type)) continue;
    /*
     * WHOSE LINE IS IT. Most records name the fighter that ACTED, and the
     * sentence is about that fighter. Two do not: an absorbed hit is written
     * by the attacker but is a fact about the shield that ate it, and it reads
     * as one ("SALT BULL takes 12 on the shield"). The subject is normalised
     * here so `beatText` never has to know which way round a type was written.
     */
    const subject = e.type === 'absorbed' && e.target ? e.target : e.who;
    const base = { t: e.t, ...actor(subject), type: e.type };
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
    else {
      out.push({
        ...base,
        skill: e.skill ?? null,
        reason: e.reason ?? null,
        /* The atom a refusal refused, and the number a heal or a shield moved:
           without them the line is "is immune" and "heals", which is a category
           and not a fact. */
        ...(e.effect !== undefined ? { effect: e.effect } : {}),
        ...(e.amount !== undefined ? { amount: e.amount } : {}),
      });
    }
  }
  /* Реплики держатся всегда: их мало, и они — то, ради чего экран есть.
     Подряд идущие одинаковые схлопываются: мозг, повторивший строку на двух
     соседних мыслях, сказал её один раз — а две одинаковые строки в разборе
     читаются как сбой показа. */
  const says = out.filter((b) => b.type === 'say')
    .filter((b, i, all) => !(i && all[i - 1].whoSide === b.whoSide && all[i - 1].text === b.text && b.t - all[i - 1].t < 3.2));
  /*
   * A RULE THAT FIRES EVERY HALF SECOND IS ONE BEAT, NOT TWELVE.
   *
   * The retelling keeps forty lines, and a single field of burn writes a heal
   * or a refusal on every tick a body stands in it — BARROW vs GRAVEDIGGER put
   * sixty-two refusals into a 34-second fight. Unfolded, those forty lines are
   * one mechanic repeating and the fight is not in them at all. Consecutive
   * repeats of the same rule, by the same fighter, about the same thing, inside
   * four seconds, collapse into the first — the same rule the feed applies
   * live, for the same reason.
   */
  const NOISY = new Set(['immune', 'absorbed', 'heal', 'wall', 'refused']);
  const others = out.filter((b) => b.type !== 'say').filter((b, i, all) => {
    if (!NOISY.has(b.type)) return true;
    const prev = all[i - 1];
    return !(prev && prev.type === b.type && prev.whoSide === b.whoSide
      && (prev.effect ?? null) === (b.effect ?? null) && b.t - prev.t < 4);
  });
  return [...says, ...others.slice(0, 40)].sort((a, b) => a.t - b.t);
}
