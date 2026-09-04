/**
 * ЛИЧНОСТЬ ИГРОКА: ПОДПИСЬ ПЛАТФОРМЫ, ПРОВЕРЕННАЯ НАМИ.
 *
 * A4 говорит: личность даёт GENEX. Игра получает `embedToken` и обязана
 * убедиться, что его выписала платформа, а не страница, на которой игра
 * открыта. До этого файла проверки не было вовсе: `verifyEmbedToken` вне
 * дев-режима возвращал `null` всегда, и продакшен честно отказывался
 * стартовать, потому что стена аккаунта была непроходима.
 *
 * ── ЧТО ПРОЧИТАНО НА СТЕНДЕ (E8) ────────────────────────────────────────────
 *
 * E8 требует перечитать контракт у платформы, а не додумать. Прочитано:
 *
 *   `genex-demo/apps/api/src/embed/verify.ts` — как платформа проверяет свой
 *     же токен: `aud === 'embed'` И `scope === 'embed:play'`. Билет
 *     (`embed:ticket`) не проходит никогда, поэтому перехваченный билет не
 *     работает как сессия;
 *   `genex-demo/apps/api/src/embed/routes.ts` — что кладётся в токен при
 *     выпуске: `sub`, `sid`, `scope`, `channel`, `aud`, `slug`, `projectId`,
 *     `name`, `jti`; у гостевого — ещё `guest: true` и `sub` вида
 *     `guest:<uuid>`;
 *   `genex-demo/apps/api/src/auth.ts` — срок жизни 15 минут, аудитория
 *     `embed`, подпись плагином `jwt()` с ключами из JWKS.
 *
 * И проверено на живой платформе, а не только в исходниках: набор ключей
 * лежит открыто по `https://api.genex.games/api/auth/jwks` и отдаёт один ключ
 * `EdDSA` на кривой `Ed25519`. Такую подпись проверяет штатный `node:crypto` —
 * ни одной новой зависимости, что важно ровно по той же причине, по которой
 * база лежит в `node:sqlite`: бэкенд, считающий деньги и рейтинг, не берёт
 * лишнюю поверхность для аудита.
 *
 * ── ЧЕГО НЕТ, И ПОЧЕМУ ЭТО ЧЕСТНЕЕ, ЧЕМ ВЫДУМАТЬ ───────────────────────────
 *
 * `iss` не проверяется по умолчанию. Настоящего токена в руках не было, а
 * значение `iss` — это `BETTER_AUTH_URL` продакшена, которого в стенде нет.
 * E8 прямо запрещает выдавать дефолт кода за факт продакшена, поэтому проверка
 * есть, но включается переменной: увидели живой токен — вписали. Доверие при
 * этом не висит в воздухе: якорь — сам адрес JWKS по TLS.
 */

import { createPublicKey, verify as verifySignature } from 'node:crypto';

/** Где платформа держит открытые ключи. Якорь доверия — этот адрес по TLS. */
export const JWKS_URL = process.env.AIRENA_GENEX_JWKS
  || 'https://api.genex.games/api/auth/jwks';

/**
 * НАША ИГРА НА ПЛАТФОРМЕ. БЕЗ ЭТОГО ПРОВЕРКА БЕССМЫСЛЕННА.
 *
 * Токен выписан ДЛЯ ОДНОЙ игры (`slug`, `projectId` в претензиях). Проверить
 * подпись и не проверить, чья это игра, значит принять токен ЛЮБОЙ игры на
 * платформе: чужая игра выписывает своему игроку валидную подпись, тот несёт
 * её сюда — и заводит у нас аккаунт. Поэтому привязка обязательна, а не
 * желательна: без неё `identityReady()` ложно, и продакшен не поднимается.
 */
export const OUR_SLUG = String(process.env.AIRENA_GENEX_SLUG || '').trim();
export const OUR_PROJECT = String(process.env.AIRENA_GENEX_PROJECT || '').trim();

/** Необязательная привязка к издателю. Пусто = не проверяем (см. шапку). */
export const OUR_ISS = String(process.env.AIRENA_GENEX_ISS || '').trim();

/**
 * ПУСКАТЬ ЛИ СЕССИИ ТЕСТОВОГО КАНАЛА.
 *
 * Платформа помечает каналом каждую сессию, и у неё две ветки: `production` —
 * опубликованная игра, `staging` — превью (`genex preview`). Замерено на живом
 * превью: воркер впрыскивает `channel: "staging"`, то есть НА ПРЕВЬЮ ВСЕ ТОКЕНЫ
 * ТЕСТОВЫЕ.
 *
 * По умолчанию отказываем — тем же доводом, что и платформа: тестовая сборка не
 * пишет в живой рейтинг. Но у превью-стенда своя база и свой бэкенд, и там
 * запрет означал бы «на превью нельзя проверить вход», то есть нельзя проверить
 * ровно то, ради чего превью и делают. Поэтому дверь есть, она закрыта, и
 * открывается решением человека, а не формой токена.
 */
export const ACCEPT_STAGING = process.env.AIRENA_ACCEPT_STAGING === '1';

/** Готовы ли проверять личность по-настоящему. */
export const identityReady = () => !!(OUR_SLUG || OUR_PROJECT);

/* Часы у нас и у платформы расходятся всегда. Минута — обычный допуск для
   JWT; больше означало бы принимать протухший токен, меньше — ломаться на
   исправном сервере с плывущим временем. */
const SKEW_S = 60;

/* Токен платформы — сотни байт. Всё, что сильно больше, разбирать незачем:
   это либо не наш формат, либо попытка занять процессор разбором JSON. */
const MAX_TOKEN_BYTES = 8192;

/* Как часто перечитывается набор ключей в спокойном режиме. */
const JWKS_TTL_MS = 10 * 60_000;

/*
 * И КАК ЧАСТО — ПО НЕИЗВЕСТНОМУ `kid`.
 *
 * Ротация ключа выглядит как токен с `kid`, которого у нас нет, и правильная
 * реакция — сходить за свежим набором. Но ровно это же выглядит как подделка
 * со случайным `kid`, и без нижней границы каждая такая подделка отправляла бы
 * нас в сеть: бесплатный способ занять сервер запросами наружу. Раз в минуту —
 * достаточно быстро для ротации и бесполезно как рычаг.
 */
const JWKS_MIN_REFETCH_MS = 60_000;

/** Сколько ждём платформу. Больше — держим соединение игрока зря. */
const JWKS_TIMEOUT_MS = 5000;

let cache = { at: 0, keys: new Map(), tried: 0 };
let inflight = null;

/** Причины отказа. С кодом, потому что «не пустил» без причины не чинится. */
export const REFUSED = {
  shape: 'токен не похож на подписанный платформой',
  header: 'заголовок токена не читается',
  alg: 'подпись не того типа, что выписывает платформа',
  kid: 'ключ подписи неизвестен',
  signature: 'подпись не сходится',
  payload: 'претензии токена не читаются',
  aud: 'токен выписан не для встроенной игры',
  scope: 'это не сессия игры',
  expired: 'токен просрочен',
  future: 'токен выписан будущим',
  iss: 'токен выписан не тем издателем',
  game: 'токен выписан для другой игры',
  guest: 'платформа прислала гостя, а не аккаунт',
  staging: 'сессия тестового канала',
  sub: 'в токене нет игрока',
  unbound: 'сервер не знает, какая игра его собственная',
};

const b64json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/**
 * Набор ключей платформы.
 *
 * Отказ сети НЕ чистит кеш: платформа, недоступная тридцать секунд, не должна
 * разлогинивать всех, у кого токен подписан ключом, который мы уже знаем.
 */
async function keys({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.keys.size && now - cache.at < JWKS_TTL_MS) return cache.keys;
  if (force && now - cache.tried < JWKS_MIN_REFETCH_MS) return cache.keys;
  if (inflight) return inflight;

  cache.tried = now;
  inflight = (async () => {
    const stop = AbortSignal.timeout(JWKS_TIMEOUT_MS);
    const res = await fetch(JWKS_URL, { signal: stop, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`JWKS ${res.status}`);
    const body = await res.json();
    const next = new Map();
    for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
      /*
       * ТИП КЛЮЧА БЕРЁТСЯ ИЗ КЛЮЧА, А НЕ ИЗ ТОКЕНА.
       *
       * Классическая дыра JWT: доверять полю `alg` в заголовке токена. Тогда
       * подделыватель ставит `alg: "none"` или подменяет схему на такую, где
       * открытый ключ становится секретом. Здесь наоборот: что за ключ —
       * решает НАБОР, а заголовок токена обязан с ним совпасть.
       */
      if (jwk?.kty !== 'OKP' || jwk?.crv !== 'Ed25519' || typeof jwk?.kid !== 'string') continue;
      if (jwk.alg && jwk.alg !== 'EdDSA') continue;
      try { next.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' })); }
      catch { /* один битый ключ не отменяет остальные */ }
    }
    if (next.size) cache = { at: Date.now(), keys: next, tried: cache.tried };
    return cache.keys;
  })().catch((e) => {
    console.error(`  ключи платформы не прочитаны (${JWKS_URL}): ${e.message}`);
    return cache.keys;
  }).finally(() => { inflight = null; });

  return inflight;
}

/** Прогреть набор ключей на старте, чтобы первый игрок не ждал сеть. */
export const warmKeys = () => keys().then(() => cache.keys.size);

/**
 * Проверить `embedToken` платформы.
 *
 * Возвращает `{ sub, email, name }` или `null`. Причина отказа — вторым
 * значением через `detail`, наружу игроку она не уезжает: экрану хватает
 * «платформа не подтвердила личность», а нам нужна строка в логе.
 */
export async function verifyPlatformToken(token, { detail = null } = {}) {
  const say = (code) => { if (detail) detail.code = code; return null; };

  if (!identityReady()) return say('unbound');
  if (typeof token !== 'string' || !token || Buffer.byteLength(token) > MAX_TOKEN_BYTES) {
    return say('shape');
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) return say('shape');
  const [h, p, s] = parts;

  let head;
  try { head = b64json(h); } catch { return say('header'); }
  if (head?.alg !== 'EdDSA') return say('alg');
  if (head.typ && head.typ !== 'JWT') return say('header');
  if (typeof head.kid !== 'string' || !head.kid) return say('kid');

  let key = (await keys()).get(head.kid);
  /* Неизвестный ключ — это в первую очередь ротация, и только потом подделка.
     Один поход за свежим набором, не чаще раза в минуту (см. константу). */
  if (!key) key = (await keys({ force: true })).get(head.kid);
  if (!key) return say('kid');

  let ok = false;
  try {
    ok = verifySignature(null, Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'));
  } catch { ok = false; }
  if (!ok) return say('signature');

  let claims;
  try { claims = b64json(p); } catch { return say('payload'); }
  if (!claims || typeof claims !== 'object') return say('payload');

  /* Дальше — только претензии. Подпись уже сошлась, значит всё это написала
     платформа; вопрос лишь в том, нам ли она это написала и не поздно ли. */
  if (claims.aud !== 'embed') return say('aud');
  if (claims.scope !== 'embed:play') return say('scope');

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_S < now) return say('expired');
  if (typeof claims.nbf === 'number' && claims.nbf - SKEW_S > now) return say('future');
  if (typeof claims.iat === 'number' && claims.iat - SKEW_S > now) return say('future');

  if (OUR_ISS && claims.iss !== OUR_ISS) return say('iss');

  /* ЧЬЯ ЭТО ИГРА. Совпасть должно то, что мы знаем: слаг, идентификатор или
     оба. Незаданное не проверяется, но хотя бы одно задано всегда — иначе
     `identityReady()` ложно и сюда не попасть. */
  if (OUR_SLUG && claims.slug !== OUR_SLUG) return say('game');
  if (OUR_PROJECT && claims.projectId !== OUR_PROJECT) return say('game');

  /*
   * ГОСТЬ ПЛАТФОРМЫ — НЕ АККАУНТ, И ЭТО НЕ ПРИДИРКА.
   *
   * У гостевого токена `sub` вида `guest:<uuid>`, новый на каждую сессию
   * (`embed/routes.ts`). Пустить его в `claimAccount` значит заводить по
   * аккаунту на каждое открытие страницы — с записью в `genex_sub UNIQUE`,
   * с сожжённым пожизненным бесплатным существом (F7) и с лестницей,
   * засыпанной одноразовыми владельцами. Гость платформы остаётся гостем
   * Airena: у нас для этого свой режим, и он работает.
   */
  if (claims.guest === true || String(claims.sub || '').startsWith('guest:')) return say('guest');

  /* Тестовый канал не пишет в живой рейтинг — ровно та же позиция, что у
     платформы: staging-сессии она отказывает, а не изолирует. На превью-стенде
     со своей базой это снимается переменной (см. `ACCEPT_STAGING`). */
  if (claims.channel === 'staging' && !ACCEPT_STAGING) return say('staging');

  if (typeof claims.sub !== 'string' || !claims.sub) return say('sub');

  /* Почты в токене платформы нет — там `name`. `claimAccount` это принимает:
     аккаунт находится по `genex_sub`, а `email_norm` остаётся пустым. */
  return {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    name: typeof claims.name === 'string' ? claims.name : null,
  };
}
