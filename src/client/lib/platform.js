/**
 * РУКОПОЖАТИЕ С ПЛАТФОРМОЙ. НАЧИНАЕТСЯ НА ЗАГРУЗКЕ, А НЕ У СТЕНЫ.
 *
 * ── ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ, ЧЕГО ЭТО СТОИЛО ──────────────────────────────────
 *
 * Сначала обмен жил внутри стены аккаунта и запускался по нажатию «СОХРАНИТЬ»:
 * рассуждение было про F6 — грузить чужой SDK до первого кадра значит платить
 * бюджетом первого кадра за экран, которого большинство не увидит.
 *
 * Рассуждение верное, вывод неверный, и вот чем это кончилось у игрока: пустой
 * экран, «This game didn't finish starting. It loaded, but never connected to
 * your Genex session». Причина — в коде платформы, `apps/web/components/
 * game-page/GameFrame.tsx`: дашборд монтирует фрейм и заводит таймер. Если игра
 * НЕ ПРИСЛАЛА НИ ОДНОГО сообщения протокола за пятнадцать секунд, он объявляет
 * сборку сломанной и рисует эту страницу поверх. Комментарий там же говорит
 * прямо: «живая игра шлёт `genex:embed:ready` ровно один раз, на загрузке».
 *
 * То есть отложить обмен нельзя вообще: молчание на старте — это не «мы ещё не
 * дошли до входа», это для платформы признак сборки без SDK.
 *
 * ── КАК ЭТО МИРИТСЯ С F6 ───────────────────────────────────────────────────
 *
 * Обмен НАЧИНАЕТСЯ на загрузке, но первый кадр его не ждёт: импорт
 * динамический, вызов без `await`, ошибки глотаются. То есть в критический
 * путь ложится ноль, а `ready` уходит вовремя. Замер `checkboot` от этого не
 * двигается — там считается то, что нужно ДО первого кадра, а этот модуль
 * нужен после.
 *
 * И оверлей SDK перестаёт быть ценой: пока личность не определилась, дашборд
 * и так держит СВОЙ экран загрузки поверх фрейма. Раньше мы прятались за
 * поздним стартом, а на деле просто заставляли родителя ждать впустую.
 *
 * ── БРАУЗЕРНАЯ СВЕРКА (04.09), ПОТОМУ ЧТО ТЕКСТ ЭТОГО НЕ ДОКАЖЕТ ────────────
 *
 * `playwright` в этом проекте намеренно не зависимость (шапка `checkframing`
 * объясняет почему), поэтому форму проверяет `tools/checkidentity.mjs`, а
 * поведение — сверка руками, и её результат записан здесь, а не в памяти.
 *
 * Стенд: сборка `dist` под раздатчиком, который впрыскивает `window.__GENEX__`
 * как воркер платформы, во фрейме страницы-сторожа, считающей время до первого
 * сообщения протокола. БЕЗ ЕДИНОГО КЛИКА:
 *
 *   `genex:embed:ready`  ушло через 137 мс   (бюджет дашборда — 15 000 мс)
 *
 * До правки не уходило вовсе, пока игрок не нажимал «СОХРАНИТЬ», и родитель
 * рисовал «This game didn't finish starting» поверх работающей игры.
 */

/* Больше собственного бюджета SDK (десять секунд на обмен) плюс запас на
   обмен билета. Уйти раньше — объявить платформу молчащей, пока она отвечает. */
const WAIT_MS = 15000;

/** `preview` раздаёт игру с `preview--<slug>`, `publish` — с `<slug>`. */
const PREVIEW_PREFIX = 'preview--';

let handshake = null;    // Promise<модуль SDK | null> — заводится один раз

/** Что впрыснул воркер платформы в `<head>` до модулей, либо `null`. */
export function platformEnv() {
  const env = typeof window !== 'undefined' ? window.__GENEX__ : null;
  if (!env || !env.apiUrl) return null;
  if (!Array.isArray(env.dashboardOrigins) || !env.dashboardOrigins.length) return null;
  return env;
}

/** Мы внутри фрейма платформы? Вне его SDK уводит страницу (см. `wall.js`). */
export const embedded = () => typeof window !== 'undefined' && window.parent !== window;

/**
 * Слаг нашей игры на платформе.
 *
 * Из адреса, а не из сборки: `genex rename` меняет слаг, не пересобирая бандл.
 * Префикс превью снимается — иначе на превью слаг читается как
 * `preview--airena`, имени, которого на платформе нет.
 */
export function gameSlug() {
  const meta = typeof document !== 'undefined' && document.querySelector('meta[name="genex-slug"]');
  const baked = meta && String(meta.content || '').trim();
  if (baked) return baked;
  const host = typeof location !== 'undefined' ? location.hostname : '';
  const first = host.includes('.') ? host.split('.')[0] : '';
  return first.startsWith(PREVIEW_PREFIX) ? first.slice(PREVIEW_PREFIX.length) : first;
}

/**
 * Начать обмен. Идемпотентно, ничего не ждёт, ничем не роняет загрузку.
 *
 * Зовётся из `app.js` на старте — ради пятнадцатисекундного таймера родителя —
 * и повторно из стены, если игрок дошёл туда раньше, чем модуль доехал.
 */
export function startPlatformIdentity() {
  if (handshake) return handshake;
  const env = platformEnv();
  if (!env || !embedded()) return null;

  handshake = import('@genex-ai/embed-sdk')
    .then((sdk) => {
      sdk.initEmbed({ slug: gameSlug(), apiUrl: env.apiUrl, dashboardOrigins: env.dashboardOrigins });
      return sdk;
    })
    .catch(() => null);
  return handshake;
}

/**
 * Личность от платформы: `{ token, reason }`.
 *
 * `reason` — не для игрока, а чтобы стена назвала устранимую причину и чтобы
 * §14 отличала «передумал» от «двери нет».
 */
export async function platformToken() {
  if (!platformEnv()) return { token: null, reason: 'no_platform' };
  if (!embedded()) return { token: null, reason: 'standalone' };

  const sdk = await (startPlatformIdentity() || Promise.resolve(null));
  if (!sdk) return { token: null, reason: 'sdk_failed' };

  const state = await new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; offAll(); resolve(v); } };
    const offs = [
      sdk.on('authenticated', () => finish('account')),
      sdk.on('guest', () => finish('guest')),
      sdk.on('blocked', () => finish('blocked')),
    ];
    const timer = setTimeout(() => finish('slow'), WAIT_MS);
    function offAll() { clearTimeout(timer); for (const off of offs) { try { off(); } catch { /* уже снят */ } } }
    /* Состояние обычно установлено ЗАДОЛГО до стены — обмен шёл всё время, пока
       игрок смотрел бой. Подписка на уже случившееся событие не сработает
       никогда, и без этой проверки стена ждала бы пятнадцать секунд впустую. */
    const already = sdk.getAuthState();
    if (already === 'authenticated') finish('account');
    else if (already === 'guest') finish('guest');
    else if (already === 'blocked') finish('blocked');
  });

  if (state !== 'account') return { token: null, reason: state };
  const token = sdk.getEmbedToken() || null;
  return { token, reason: token ? 'account' : 'no_token' };
}
