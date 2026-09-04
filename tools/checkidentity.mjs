#!/usr/bin/env node
/**
 * ГЕЙТ ЛИЧНОСТИ: A4, и он про подделку, а не про вход.
 *
 * Проверка подписи — единственное место продукта, где «работает» и «безопасно»
 * не одно и то же. Живой токен платформы проходит через неё и на дырявой
 * реализации: чтобы увидеть дыру, надо принести ПОДДЕЛКУ, а подделку никто не
 * приносит случайно. Поэтому здесь их четырнадцать, и каждая — та, на которой
 * JWT ломают в реальной жизни.
 *
 * Ключи настоящей платформы для этого не нужны и не берутся: гейт заводит свою
 * пару Ed25519, поднимает свой набор ключей на localhost и подписывает ими всё,
 * что проверяет. То есть он меряет НАШУ проверку, а не доступность GENEX, и
 * зелёный цвет здесь не зависит от чужого сервера.
 *
 *   node tools/checkidentity.mjs
 */

import { createServer } from 'node:http';
import { generateKeyPairSync, randomUUID, sign as signBytes } from 'node:crypto';

const KID = 'test-key-1';
const SLUG = 'airena-test';
const PROJECT = 'proj_airena_test';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'EdDSA' };

/* Второй ключ — им подписывается токен с чужой подписью под нашим `kid`. */
const other = generateKeyPairSync('ed25519');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);

/** Как платформа: `aud: embed`, `scope: embed:play`, наша игра, 15 минут. */
function claims(over = {}) {
  return {
    sub: 'user_abc', sid: 'sess_abc', scope: 'embed:play', aud: 'embed',
    slug: SLUG, projectId: PROJECT, name: 'Игрок', channel: 'production',
    jti: randomUUID(), iat: now(), exp: now() + 900,
    ...over,
  };
}

function token({ head = {}, body = {}, key = privateKey, breakSig = false } = {}) {
  const h = b64({ alg: 'EdDSA', typ: 'JWT', kid: KID, ...head });
  const p = b64(claims(body));
  const s = signBytes(null, Buffer.from(`${h}.${p}`), key).toString('base64url');
  return `${h}.${p}.${breakSig ? `${s.slice(0, -2)}xy` : s}`;
}

/* Набор ключей на localhost — ровно той формы, что отдаёт платформа. */
const jwks = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ keys: [jwk] }));
});
await new Promise((r) => jwks.listen(0, r));
const JWKS_URL = `http://127.0.0.1:${jwks.address().port}/jwks`;

/**
 * Модуль читает окружение при загрузке, поэтому окружение ставится ДО импорта,
 * а второй набор переменных требует второго экземпляра модуля — отсюда
 * запрос в спецификаторе: он делает специфер другим, и ESM грузит модуль
 * заново вместо того, чтобы отдать закешированный.
 */
process.env.AIRENA_GENEX_JWKS = JWKS_URL;
process.env.AIRENA_GENEX_SLUG = SLUG;
process.env.AIRENA_GENEX_PROJECT = PROJECT;
const { verifyPlatformToken } = await import('../src/server/identity.js?case=bound');

const CASES = [
  {
    what: 'настоящий токен платформы проходит',
    token: () => token(),
    expect: 'pass',
    why: 'иначе гейт меряет не то: отказ всему подряд тоже «безопасен»',
  },
  {
    what: 'подпись подделана',
    token: () => token({ breakSig: true }),
    expect: 'signature',
    why: 'единственный отказ, ради которого всё остальное и написано',
  },
  {
    what: 'подписано чужим ключом под нашим kid',
    token: () => token({ key: other.privateKey }),
    expect: 'signature',
    why: 'совпадение `kid` не делает подпись нашей',
  },
  {
    what: 'alg: none',
    token: () => {
      const h = b64({ alg: 'none', typ: 'JWT', kid: KID });
      return `${h}.${b64(claims())}.`;
    },
    expect: 'shape',
    why: 'классическая дыра JWT: доверить полю alg в заголовке',
  },
  {
    what: 'alg подменён на HS256, подпись — HMAC открытым ключом',
    token: () => {
      const h = b64({ alg: 'HS256', typ: 'JWT', kid: KID });
      const p = b64(claims());
      return `${h}.${p}.${Buffer.from('whatever').toString('base64url')}`;
    },
    expect: 'alg',
    why: 'подмена схемы: открытый ключ превращается в «секрет» HMAC',
  },
  {
    what: 'тело переписано после подписи',
    token: () => {
      const t = token();
      const [h, , s] = t.split('.');
      return `${h}.${b64(claims({ sub: 'user_НЕ_ТОТ' }))}.${s}`;
    },
    expect: 'signature',
    why: 'ровно то, что делает страница, которой достался чужой токен',
  },
  {
    what: 'ключ неизвестен',
    token: () => token({ head: { kid: 'kid-которого-нет' } }),
    expect: 'kid',
    why: 'подделыватель ставит свой kid и ждёт, что мы сходим за ним в сеть',
  },
  {
    what: 'токен просрочен',
    token: () => token({ body: { iat: now() - 7200, exp: now() - 3600 } }),
    expect: 'expired',
    why: 'токен живёт пятнадцать минут; вечный токен — это не сессия',
  },
  {
    what: 'токен выписан будущим',
    token: () => token({ body: { iat: now() + 7200, exp: now() + 9000 } }),
    expect: 'future',
    why: 'сдвиг часов вперёд продлевает жизнь любому перехваченному токену',
  },
  {
    what: 'аудитория не embed',
    token: () => token({ body: { aud: 'api' } }),
    expect: 'aud',
    why: 'токен другого назначения той же платформы',
  },
  {
    what: 'это билет, а не сессия',
    token: () => token({ body: { scope: 'embed:ticket' } }),
    expect: 'scope',
    why: 'стенд платформы отказывает билету ровно так же (embed/verify.ts)',
  },
  {
    what: 'токен выписан для чужой игры',
    token: () => token({ body: { slug: 'sandstorm', projectId: 'proj_other' } }),
    expect: 'game',
    why: 'подпись валидна, игра чужая — вход чужого игрока, выглядящий своим',
  },
  {
    what: 'гость платформы',
    token: () => token({ body: { guest: true, sub: `guest:${randomUUID()}` } }),
    expect: 'guest',
    why: 'аккаунт на каждое открытие страницы и сожжённое бесплатное существо (F7)',
  },
  {
    what: 'сессия тестового канала',
    token: () => token({ body: { channel: 'staging' } }),
    expect: 'staging',
    why: 'тестовая сборка не пишет в живой рейтинг',
  },
];

let bad = 0;
console.log('\n  ГЕЙТ ЛИЧНОСТИ (A4)\n');
for (const c of CASES) {
  const why = {};
  const got = await verifyPlatformToken(c.token(), { detail: why });
  const code = got ? 'pass' : (why.code || 'без причины');
  const ok = code === c.expect;
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${c.what.padEnd(46)} ${code}${ok ? '' : `  ← ждали ${c.expect}`}`);
  if (!ok) console.log(`      → ${c.why}`);
}

/*
 * ТЕСТОВЫЙ КАНАЛ ПУСКАЕТСЯ ТОЛЬКО ПО РЕШЕНИЮ ЧЕЛОВЕКА.
 *
 * На превью платформа помечает КАЖДУЮ сессию как `staging` — замерено на живом
 * превью. Значит у переменной две обязанности, и обе надо проверить: закрытая
 * дверь остаётся закрытой (случай выше), а открытая пускает — иначе «включил и
 * не работает» выяснялось бы на стенде вручную.
 */
process.env.AIRENA_ACCEPT_STAGING = '1';
const staging = await import('../src/server/identity.js?case=staging');
{
  const why = {};
  const got = await staging.verifyPlatformToken(token({ body: { channel: 'staging' } }), { detail: why });
  const ok = !!got && got.sub === 'user_abc';
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${'с AIRENA_ACCEPT_STAGING превью пускается'.padEnd(46)} ${got ? 'pass' : why.code}`);
  if (!ok) console.log('      → тогда на превью нельзя проверить вход, ради которого превью и делают');
}
process.env.AIRENA_ACCEPT_STAGING = '';

/*
 * ПРИВЯЗКА К СВОЕЙ ИГРЕ ОБЯЗАТЕЛЬНА.
 *
 * Отдельным экземпляром модуля, потому что это про ДРУГОЕ окружение: сервер,
 * которому не сказали, какая игра его собственная, обязан отказывать всем — в
 * том числе идеально подписанному токену. Проверять это тем же экземпляром
 * нельзя: переменные прочитаны при загрузке.
 */
process.env.AIRENA_GENEX_SLUG = '';
process.env.AIRENA_GENEX_PROJECT = '';
const unbound = await import('../src/server/identity.js?case=unbound');
{
  const why = {};
  const got = await unbound.verifyPlatformToken(token(), { detail: why });
  const ok = !got && why.code === 'unbound';
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${'без привязки к игре не пускает никого'.padEnd(46)} ${got ? 'pass' : why.code}`);
  if (!ok) console.log('      → сервер без своей игры принимает токен любой чужой');
  const ready = unbound.identityReady();
  if (ready) { bad++; console.log('  ✗ identityReady() лжёт: привязки нет, а он говорит да'); }
  else console.log(`  ✓ ${'identityReady() без привязки — ложь'.padEnd(46)} ok`);
}

/*
 * ── И ТО ЖЕ САМОЕ ЧЕРЕЗ ЖИВОЙ СЕРВЕР ────────────────────────────────────────
 *
 * Всё выше меряет модуль. Но между модулем и игроком стоит маршрут, и там
 * возможен отказ, которого модульная проверка не увидит НИКОГДА: проверка
 * подписи асинхронная, а `if (!claim)` на забытом `await` получает Promise —
 * объект, всегда истинный, — и пропускает его дальше.
 *
 * ЗАМЕРЕНО, А НЕ ПРЕДПОЛОЖЕНО (04.09): `await` убран, гейт прогнан. Стена
 * перестаёт пускать ВСЕХ — 400 `no_sub` и на подделку, и на настоящий токен,
 * потому что `claimAccount` раскладывает Promise на `{sub, email}` и получает
 * `undefined`. То есть отказ не «дыра», а тупик в воронке: регистрация мертва,
 * §14 меряет «посетитель → создал существо» и получает ноль. Шестнадцать
 * проверок выше при этом остаются зелёными.
 *
 * Поэтому здесь поднимается настоящий продакшен-сервер (`AIRENA_PROD=1`) с
 * нашим набором ключей вместо платформенного, и в него стучатся и подделкой,
 * и настоящим токеном: одного отказа мало, нужен ещё и проход.
 */
const { spawn } = await import('node:child_process');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const { rmSync } = await import('node:fs');

const DB = join(tmpdir(), `airena-identity-${process.pid}.db`);
const PORT = 8940 + (process.pid % 50);
const srv = spawn(process.execPath, ['src/server/app.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    AIRENA_DB: DB,
    AIRENA_PROD: '1',
    AIRENA_SECRET: 'gate-secret-not-for-production-x',
    AIRENA_GENEX_JWKS: JWKS_URL,
    AIRENA_GENEX_SLUG: SLUG,
    AIRENA_GENEX_PROJECT: PROJECT,
    AIRENA_DEV: '',
    OPENROUTER_API_KEY: 'x',
  },
  stdio: 'ignore',
});

const base = `http://127.0.0.1:${PORT}`;
let up = false;
for (let i = 0; i < 80; i++) {
  try { await fetch(`${base}/api/health`); up = true; break; } catch { /* ещё поднимается */ }
  await new Promise((r) => setTimeout(r, 250));
}

if (!up) {
  bad++;
  console.log('\n  ✗ продакшен-сервер не поднялся — проверка маршрута пропущена');
} else {
  const claim = async (t) => {
    const res = await fetch(`${base}/api/session/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ embedToken: t }),
    });
    return res.status;
  };

  const ROUTE = [
    ['подделку стена аккаунта не пускает', await claim(token({ breakSig: true })), 401],
    ['чужую игру не пускает', await claim(token({ body: { slug: 'sandstorm', projectId: 'p2' } })), 401],
    ['гостя платформы не пускает', await claim(token({ body: { guest: true, sub: `guest:${randomUUID()}` } })), 401],
    ['дев-токен в продакшене не пускает', await claim(b64({ sub: 'dev_x', email: 'x@e.test' })), 401],
    ['настоящий токен заводит аккаунт', await claim(token()), 200],
  ];
  console.log('');
  for (const [what, got, want] of ROUTE) {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${what.padEnd(46)} ${got}${ok ? '' : `  ← ждали ${want}`}`);
  }
  if (ROUTE.every(([, got], i) => got === ROUTE[i][2])) {
    console.log('      (маршрут дождался проверки: без await стена не пускает никого — 400)');
  }
}

/*
 * ── И ПУТЬ ЗАГРУЗКИ: РУКОПОЖАТИЕ НАЧИНАЕТСЯ НА СТАРТЕ ────────────────────────
 *
 * Отказ, который всё это добавил, не поймала бы ни одна проверка выше. Сервер
 * был безупречен, маршрут дожидался, подделки отлетали — а игрок видел пустой
 * экран с «This game didn't finish starting», потому что обмен с платформой
 * запускался ПОЗДНО, по нажатию на стене.
 *
 * Причина в коде платформы (`genex-demo/apps/web/components/game-page/
 * GameFrame.tsx`): дашборд монтирует фрейм и заводит таймер на пятнадцать
 * секунд. Ноль сообщений протокола за это время — и он объявляет сборку
 * сломанной. Комментарий там: «живая игра шлёт `genex:embed:ready` ровно один
 * раз, на загрузке».
 *
 * Проверяется текстом, а не браузером, и это осознанно: playwright в этом
 * проекте намеренно не зависимость (см. шапку `checkframing`), браузерная
 * сверка живёт как ручная и записана в шапке `lib/platform.js` вместе с
 * замером. Здесь — форма, которая эту сверку делает возможной вообще.
 */
{
  const { readFileSync } = await import('node:fs');
  /*
   * КОММЕНТАРИИ СНИМАЮТСЯ, И ЭТО НЕ ПРИДИРКА.
   *
   * Первая версия искала вызов по всему тексту — и `// startPlatformIdentity();`
   * её устраивал. То есть ровно тот способ, которым вызов и выключают, гейт
   * считал за наличие. Замерено: закомментировал — набор остался зелёным.
   *
   * Снимаются блочные комментарии и строки, начинающиеся с `//` или `*`. Чего
   * это НЕ ловит: вызов, выключенный хвостовым комментарием в конце рабочей
   * строки. Такой формы в этом файле нет и заводить её незачем.
   */
  const decomment = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  const src = (f) => { try { return decomment(readFileSync(f, 'utf8')); } catch { return ''; } };
  const app = src('src/client/app.js');
  const wall = src('src/client/screens/wall.js');
  const platform = src('src/client/lib/platform.js');

  const SHAPE = [
    ['путь загрузки зовёт рукопожатие',
      /startPlatformIdentity\(\)/.test(app),
      'без этого дашборд ждёт пятнадцать секунд и рисует «didn\'t finish starting»'],
    ['и не ждёт его — кадр не платит за чужую сеть',
      !/await\s+startPlatformIdentity\s*\(/.test(app),
      'F6 меряет время до первого кадра; ожидание платформы уводит его за бюджет'],
    ['initEmbed зовётся ровно из одного места',
      /initEmbed\(/.test(platform) && !/initEmbed\(/.test(wall) && !/initEmbed\(/.test(app),
      'вторая точка входа разойдётся с первой в тот день, когда протокол сменится'],
  ];
  console.log('');
  for (const [what, ok, why] of SHAPE) {
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${what.padEnd(46)} ${ok ? 'ok' : 'НЕТ'}`);
    if (!ok) console.log(`      → ${why}`);
  }
}

srv.kill();
jwks.close();
for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) { try { rmSync(f, { force: true }); } catch { /* нечего убирать */ } }

const TOTAL = CASES.length + 3 + 5 + 3;
console.log(`\n  ${bad ? `ЛИЧНОСТЬ ПРОБИТА — ${bad} из ${TOTAL}` : `ДЕРЖИТ — ${TOTAL} проверок`}\n`);
process.exit(bad ? 1 : 0);
