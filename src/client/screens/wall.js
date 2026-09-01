/**
 * Стена аккаунта.
 *
 * 10.2.2 фиксирует, где она стоит: на «сохранить это существо», после первого
 * боя, а не до генерации. D1 уточняет одну деталь — «своё» начинается на
 * кнопке «Создать», потому что генерация стоит живые деньги, а гостевой
 * аккаунт заводится бесконечно. Всё остальное из §10.5 сохраняется: бой,
 * карточка тактики, реплики — всё это гость получает ДО стены.
 *
 * Чего здесь нет: второго оффера, апсейла модели, своей формы и своего
 * пароля (A6 запрещает формы на встроенной поверхности; личность даёт
 * платформа — A4), кнопки «пропустить», которая тихо выбрасывает существо.
 */

import { post, track } from '../lib/api.js';
import { h, mount, clear } from '../lib/dom.js';
import { paintFrames } from '../ui/frames.js';

export async function enter(root, args, ctx) {
  root.className = 'on veil';
  document.body.classList.add('overlay');

  const s = ctx.state.session;
  if (s && !s.guest) { ctx.go('/creature/me'); return; }

  const status = h('div');
  const lostFirst = ctx.state.over && ctx.state.session?.creature
    && ctx.state.over.winner
    && ctx.state.match?.ids?.[ctx.state.over.winner] !== ctx.state.session.creature.id;

  mount(root, h('div.overlay-card.ask',
    h('div.panel.lift', { dataset: { frame: JSON.stringify({ seed: 89 }) } },
      h('div.bg'), h('div.fr'),
      h('div.in',
        h('div.hcut', 'СОХРАНИТЬ СУЩЕСТВО'),
        h('div.t-body', { style: { margin: '12px 0 4px', maxWidth: '50ch' } },
          lostFirst
            ? 'Существо проиграло первый бой и записало наблюдение. Дальше оно дерётся без тебя — если его сохранить.'
            : 'Оно будет драться раз в минуту и улучшаться само — даже когда вкладка закрыта. Без аккаунта своё существо не создаётся.'),
        h('div.t-sub', { style: { marginTop: '10px' } },
          'Аккаунт — тот же, что на платформе. Своих паролей у нас нет и не будет.'),
        status,
        h('div.row', { style: { marginTop: '24px' } },
          h('button.btn.primary', { onclick: claim }, 'СОХРАНИТЬ'),
          h('button.btn.ghost.big', { onclick: () => history.back() }, 'НЕ СЕЙЧАС'))))));
  paintFrames(root);
  track('account_wall_shown', {});

  async function claim() {
    clear(status);
    status.appendChild(h('div.t-sub', { style: { marginTop: '14px' } }, 'ждём ответа платформы'));
    status.appendChild(h('div.skel', { style: { height: '14px', marginTop: '8px' } }));

    /* Токен даёт платформа. На собственном домене её нет, и здесь честнее
       сказать это словами, чем показать форму, которой у нас быть не должно. */
    const onDevStand = !!ctx.state.session?.dev;
    const token = await platformToken(onDevStand);
    if (!token) {
      clear(status);
      /*
       * ПРИЧИНА НАЗЫВАЕТСЯ ТА, КОТОРУЮ ЧИТАЮЩИЙ МОЖЕТ УСТРАНИТЬ.
       *
       * Один и тот же текст стоял на обоих стендах, и на дев-стенде он звал
       * «открыть на платформе» — то есть предлагал разработчику сделать
       * единственное, чего тот сделать не может, и умалчивал единственное,
       * что работает. Цена этой строки — вопрос основателя «почему я СНОВА
       * не могу потестить создание существа», заданный не в первый раз.
       *
       * На дев-стенде остаться без токена можно ровно по одной причине:
       * `devToken` упал на хранилище (приватное окно роняет геттер, и `catch`
       * это глотает). Про неё и говорим.
       */
      status.appendChild(h('div.t-body', { style: { marginTop: '14px', color: 'var(--gor)' } },
        onDevStand
          ? 'Дев-стенд не смог собрать локальную личность: браузер не отдал хранилище. '
            + 'Обычно это приватное окно с запретом на данные сайта — разреши их или открой обычное окно.'
          : 'Здесь войти не получится: страница открыта не внутри платформы. '
            + 'Открой Airena на платформе — существо ждёт по этой же ссылке.'));
      /*
       * Отказ на стене ОБЯЗАН попадать в замер.
       *
       * Писалось только `account_wall_shown`, и поэтому «игрок передумал» и
       * «игроку сказали, что двери нет» были в воронке одним и тем же
       * событием. §14 меряет «посетитель → создал существо»; без этой строки
       * провал метрики не атрибутируется вообще ни к чему.
       */
      track('account_wall_failed', { reason: onDevStand ? 'dev_storage' : 'no_platform' });
      return;
    }
    try {
      await post('/api/session/claim', { embedToken: token });
      await ctx.refreshSession();
      track('account_claimed', {});
      /* Игрок пришёл сюда из создания и что-то уже написал — возвращаем его
         туда, а не на страницу существа, которого ещё нет. */
      let hasDraft = false;
      try { hasDraft = !!JSON.parse(localStorage.getItem('airena.draft') || 'null')?.prompt; } catch { hasDraft = false; }
      ctx.go(hasDraft ? '/new' : '/creature/me');
    } catch (e) {
      clear(status);
      status.appendChild(h('div.t-body', { style: { marginTop: '14px', color: 'var(--bad)' } },
        e.code === 'bad_token'
          ? 'Платформа не подтвердила личность. Это не твоя ошибка — попробуй ещё раз.'
          : (e.message || 'Не получилось сохранить.')));
    }
  }
}

/**
 * Спросить токен у родительского фрейма.
 *
 * `window.open` запрещён (A6), песочница не даёт ни попапов, ни форм
 * (10.2.3) — остаётся postMessage к платформе. Ждём недолго: платформа,
 * которая не ответила за секунду, скорее всего не слушает вовсе.
 */
function platformToken(serverIsDev) {
  /* Дев-путь проверяется ПЕРВЫМ. Иначе внутри любого фрейма — а превью и
     сам GENEX это фреймы — мы сначала 1.2 секунды ждём платформу, которой
     на стенде нет, и только потом вспоминаем про дев-токен. */
  const dev = devToken(serverIsDev);
  if (dev) return Promise.resolve(dev);
  if (window.parent === window) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = setTimeout(() => { removeEventListener('message', on); resolve(null); }, 1200);
    const on = (e) => {
      if (!e.data || e.data.type !== 'genex:embedToken') return;
      clearTimeout(t); removeEventListener('message', on);
      resolve(e.data.token || null);
    };
    addEventListener('message', on);
    try { window.parent.postMessage({ type: 'genex:requestEmbedToken' }, '*'); }
    catch { clearTimeout(t); removeEventListener('message', on); resolve(null); }
  });
}

/**
 * Дев-режим: сервер принимает base64url {sub,email}. В продакшене — null.
 *
 * Условие пришло от СЕРВЕРА (`/api/session` отдаёт `dev`), а не от адреса.
 * `?dev=1` оставлен как ручной рычаг — он пригодится, когда сессия ещё не
 * загружена, — но больше не обязателен: на стенде разработчик открывает
 * localhost без хвоста и всё равно входит. Защиту это не ослабляет, потому
 * что решает по-прежнему сервер: без `AIRENA_DEV=1` он и раньше отвечал на
 * такой токен отказом, а теперь ещё и не признаётся клиенту.
 */
function devToken(serverIsDev) {
  try {
    if (!serverIsDev && !/[?&]dev=1/.test(location.search)) return null;
    const sub = localStorage.getItem('airena.devsub')
      || (() => { const v = `dev_${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem('airena.devsub', v); return v; })();
    return btoa(JSON.stringify({ sub, email: `${sub}@example.test` }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch { return null; }
}

export function leave() { document.body.classList.remove('overlay'); }
