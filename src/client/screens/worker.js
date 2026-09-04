/**
 * Воркер на чужом ноутбуке — страница спаривания.
 *
 * Существо собирает настоящая модель, и за каждый вызов кто-то платит живыми
 * деньгами. Воркер — маленькая программа, которую доверенный человек запускает
 * У СЕБЯ: генерация идёт на его подписке Claude, а не на сервере игры. Сервер
 * в этой схеме только отдаёт задание и принимает готовый текст.
 *
 * Весь экран существует ради шести знаков. Поэтому здесь нет ни формы, ни
 * настроек, ни выбора: три команды, которые надо выполнить, и код, который
 * программа спросит. Всё остальное — объяснение, зачем это вообще.
 *
 * Чего здесь нет нарочно: подложки под кодом. Код набран крупно и стоит на
 * пустом месте с одной линией под ним — коробка вокруг цифр не добавляет им
 * ни читаемости, ни веса, а отнимает и то и другое.
 */

import { post, track } from '../lib/api.js';
import { h, mount, clear, waitLabel } from '../lib/dom.js';
import { claimSilently } from '../lib/platform.js';
import { paintFrames } from '../ui/frames.js';

/**
 * Три шага — ровно те, что человек выполняет у себя в терминале.
 *
 * Команды даются целиком и копируются одной кнопкой: пересказ команды словами
 * («скачай воркер с сайта») — это приглашение ошибиться в имени файла и
 * потерять полчаса на выяснение, почему `node` ругается на несуществующий
 * путь.
 */
const STEPS = [
  ['Поставь Claude Code и войди в него', 'claude'],
  ['Скачай воркер', 'curl -fsSL https://airena.genex.technology/worker.mjs -o airena-worker.mjs'],
  ['Запусти', 'node airena-worker.mjs'],
];

/* Отсчёт жизни кода и подписи «скопировано», которые надо вернуть назад.
   Живут на модуле, а не в замыкании: `leave()` — экспорт файла, и снимать
   таймеры ему больше неоткуда. Так же устроены `wait` и `arena`. */
let tick = null;
const timers = new Set();

function later(fn, ms) {
  const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
  timers.add(t);
  return t;
}

function stop() {
  if (tick) { clearInterval(tick); tick = null; }
  for (const t of timers) clearTimeout(t);
  timers.clear();
}

export async function enter(root, args, ctx) {
  root.className = 'on veil';
  document.body.classList.add('overlay');

  /* Сюда едет либо код с отсчётом, либо честный ответ, почему кода нет. */
  const box = h('div');

  mount(root, h('div.overlay-card',
    h('div.panel.lift', { dataset: { frame: JSON.stringify({ seed: 57 }) } },
      h('div.bg'), h('div.fr'),
      h('div.in',
        h('div.hcut', 'ВОРКЕР НА СВОЁМ НОУТБУКЕ'),
        h('div.t-body', { style: { margin: '10px 0 2px' } },
          'Воркер — маленькая программа, которая крутится на твоём ноутбуке и берёт '
          + 'сборку существ на себя. Модель при этом твоя: работает подписка Claude, '
          + 'в которую ты уже вошёл, а не ключ сервера.'),

        h('div.section',
          h('div.hcut', 'ТРИ ШАГА'),
          STEPS.map(([title, cmd], i) => step(i + 1, title, cmd)),
          h('div.t-sub', { style: { marginTop: '18px' } },
            /*
             * «НИЖЕ», А НЕ «ВЫШЕ».
             *
             * Порядок на экране повторяет порядок в терминале: поставил,
             * скачал, запустил — и вот тут программа спрашивает код. Значит
             * код стоит ПОД шагами, и указатель обязан смотреть туда же,
             * куда поедет взгляд. Строчка «введи тот, что выше» под текстом,
             * над которым никакого кода нет, — это отправить человека искать.
             */
            'Программа спросит код — введи тот, что ниже.')),

        h('div.section', h('div.hcut', 'КОД'), box),

        h('div.t-sub', {
          style: {
            marginTop: '26px', borderLeft: '2px solid rgba(127, 210, 226, .22)',
            paddingLeft: '14px', lineHeight: '1.55',
          },
        },
        'Доступ к Claude остаётся на ноутбуке: Airena не видит и не хранит ни логина, '
        + 'ни ключа, ни токена. Программа только запускает `claude`, в который ты уже '
        + 'вошёл у себя, и присылает обратно готовый текст — ничего больше.'),

        h('div.row', { style: { marginTop: '26px' } },
          h('button.btn.primary', { onclick: () => history.back() }, 'ГОТОВО'))))));
  paintFrames(root);

  await start();

  /** Один шаг: номер, что делает, и команда целиком с кнопкой копирования. */
  function step(n, title, cmd) {
    const copy = h('button.btn.ghost', { type: 'button' }, 'копировать');
    copy.addEventListener('click', async () => {
      const ok = await copyText(cmd);
      flash(copy, ok ? 'скопировано' : 'не вышло', 'копировать', ok);
    });
    return h('div.skillrow',
      h('div.n', `${n}`),
      h('div.body',
        h('div.t-body', { style: { color: 'var(--ink)' } }, title),
        h('div.row', { style: { marginTop: '9px' } },
          h('div.t-mono.grow', {
            style: { color: 'var(--oct)', minWidth: '0', wordBreak: 'break-all' },
          }, cmd),
          copy)));
  }

  /**
   * Спросить код.
   *
   * Запрос уходит всегда, даже когда сессия гостевая: право поднимать воркер
   * знает СЕРВЕР — список ведётся руками и меняется правкой переменной, — и
   * второй, клиентский, ответ на тот же вопрос разошёлся бы с первым при
   * первом же изменении списка. Сессия ниже читается ровно для одного:
   * различить два разных человека за одним серверным отказом.
   */
  async function start() {
    stop();
    clear(box);
    box.appendChild(h('div.t-sub', 'просим код'));
    box.appendChild(h('div.skel', { style: { height: '46px', maxWidth: '320px', marginTop: '10px' } }));
    try {
      const r = await post('/api/worker/pair/start', {});
      paintCode(String(r?.code || ''), Number(r?.expiresInSec) || 0);
    } catch (e) {
      paintDeny(e);
    }
  }

  function paintCode(code, secs) {
    clear(box);
    if (!code) { paintDeny({ code: 'no_code', message: 'сервер прислал пустой код' }); return; }

    const HINT = 'нажми на код, чтобы скопировать';
    const hint = h('div.t-sub', { style: { marginTop: '6px' } }, HINT);

    const big = h('div.t-mono', {
      onclick: async () => {
        const ok = await copyText(code);
        flash(hint, ok ? 'скопировано' : 'не вышло скопировать — выдели код и скопируй руками',
          HINT, ok);
      },
      title: 'нажми, чтобы скопировать',
      style: {
        fontSize: 'clamp(38px, 11vw, 58px)', fontWeight: '600', lineHeight: '1',
        letterSpacing: '.26em', color: 'var(--oct)',
        textShadow: '0 0 26px rgba(79, 200, 220, .32)',
        cursor: 'pointer', userSelect: 'all',
      },
    }, code);

    const cd = h('div.t-sub', { style: { marginTop: '10px', fontVariantNumeric: 'tabular-nums' } });
    const copy = h('button.btn.ghost', { type: 'button' }, 'копировать');
    copy.addEventListener('click', async () => {
      const ok = await copyText(code);
      flash(copy, ok ? 'скопировано' : 'не вышло', 'копировать', ok);
    });

    box.appendChild(h('div', big, h('div.hunder'), hint));
    box.appendChild(h('div.row', { style: { marginTop: '14px' } }, cd, copy));

    /* Отсчёт от момента ответа, а не от секунды тика: вкладку могут увести в
       фон, где интервалы душатся, и счётчик «минус один за тик» разъехался бы
       с настоящим сроком ровно на время, проведённое не здесь. */
    const until = Date.now() + secs * 1000;
    const paint = () => {
      const left = until - Date.now();
      if (left <= 0) { stop(); paintStale(); return; }
      cd.textContent = `код живёт ещё ${waitLabel(left)}`;
      cd.style.color = left < 60000 ? 'var(--gor)' : '';
    };
    paint();
    tick = setInterval(paint, 1000);
  }

  /** Срок вышел. Код исчезает целиком: мёртвые шесть знаков хуже пустого места. */
  function paintStale() {
    clear(box);
    box.appendChild(h('div.t-body', 'Код протух — они живут недолго нарочно.'));
    box.appendChild(h('div.row', { style: { marginTop: '14px' } },
      h('button.btn.big', { onclick: start }, 'ПОЛУЧИТЬ НОВЫЙ КОД')));
  }

  /**
   * Почему кода нет — тремя разными ответами.
   *
   * «Не в списке» — не поломка, а нормальный ответ, и красным он не красится:
   * так отвечают почти всем, кто сюда зайдёт. Красный остаётся тому
   * единственному случаю, где что-то действительно сломалось.
   *
   * ГОСТЬ ОТДЕЛЯЕТСЯ ОТ «НЕ В СПИСКЕ» ПО СЕССИИ, А НЕ ПО КОДУ ОТВЕТА.
   *
   * Сервер обоим отвечает `not_allowed` — и это правда: список ведётся по
   * аккаунтам, а у гостя аккаунта нет, значит в списке его быть не может.
   * Но следующий шаг у них противоположный: одному надо, чтобы платформа
   * назвала его по имени, второму — чтобы его вписали руками. Один текст на
   * двоих отправил бы половину читателей не туда, поэтому гостя различаем по
   * сессии: сервер тут короток, а не неправ.
   */
  function paintDeny(e) {
    clear(box);
    const closed = e?.status === 403 || e?.code === 'not_allowed';
    /* 401 сюда почти не доезжает — браузерной сессии сервер заводит гостя
       молча, — но токен может быть отозван, и тогда ответ именно такой. */
    const nameless = e?.status === 401 || e?.code === 'bad_token' || e?.code === 'guest'
      || (closed && ctx.state.session?.guest);

    if (nameless) {
      const why = h('div.t-sub', { style: { marginTop: '12px' } });
      const bind = h('button.btn.big', { type: 'button' }, 'ПРИВЯЗАТЬ АККАУНТ');
      bind.addEventListener('click', async () => {
        bind.disabled = true;
        bind.textContent = 'СПРАШИВАЕМ ПЛАТФОРМУ';
        clear(why);
        if (await claimSilently(post, ctx.refreshSession)) { await start(); return; }
        bind.disabled = false;
        bind.textContent = 'ПРИВЯЗАТЬ АККАУНТ';
        why.textContent = 'Платформа не назвала тебя по имени. Открой Airena из её галереи '
          + 'под своим аккаунтом — здесь вход не спрашивают и своих паролей у нас нет.';
      });
      box.appendChild(h('div.t-body',
        'Код выдаётся аккаунту, а не вкладке: сервер должен знать, чьей подписке '
        + 'отдавать сборку. Тебя он знает как гостя.'));
      box.appendChild(h('div.row', { style: { marginTop: '14px' } }, bind));
      box.appendChild(why);
      return;
    }

    if (closed) {
      box.appendChild(h('div.t-body',
        'Этот аккаунт не в списке тех, кому можно поднимать воркер. Список короткий '
        + 'и ведётся руками — автор добавляет туда людей по одному. Ничего не '
        + 'сломалось: код просто не выдаётся аккаунтам вне списка.'));
      box.appendChild(h('div.t-sub', { style: { marginTop: '10px' } },
        'Играть это не мешает — воркер нужен только тому, кто отдаёт игре свою модель.'));
      return;
    }

    box.appendChild(h('div.t-body', { style: { color: 'var(--bad)' } },
      e?.code === 'offline'
        ? 'Сервер не отвечает. Кода нет — это всё, что случилось; повтори через минуту.'
        : `Код не выдался: ${e?.message || 'сервер ответил ошибкой'}.`));
    box.appendChild(h('div.row', { style: { marginTop: '14px' } },
      h('button.btn.big', { onclick: start }, 'ПОВТОРИТЬ')));
    /* Имя события берётся из закрытого словаря сервера (`analytics.js`):
       событие, которого там нет, отклоняется молча, и замер был бы выдуман. */
    track('error_shown', { code: e?.code || 'worker', screen: 'worker' });
  }
}

export function leave() {
  stop();
  document.body.classList.remove('overlay');
}

/**
 * Подпись на полторы секунды и обратно — иначе «скопировано» некуда деть.
 *
 * Отказ красится янтарным, а не зелёным: одинаковый цвет у «получилось» и
 * «не получилось» — это подтверждение, которое подтверждает что угодно.
 */
function flash(el, text, back, good = true) {
  const was = el.style.color;
  el.textContent = text;
  el.style.color = good ? 'var(--ok)' : 'var(--gor)';
  later(() => { el.textContent = back; el.style.color = was; }, 1600);
}

/**
 * Скопировать — с запасным путём.
 *
 * Игра живёт внутри iframe платформы, а `navigator.clipboard` во фрейме
 * доступен не всегда: разрешение `clipboard-write` даёт родитель, и мы на это
 * влиять не можем. Поэтому есть второй путь через скрытое поле, и есть третий
 * — сказать правду и предложить выделить руками. Молча ничего не копировать —
 * худший из трёх, потому что человек уйдёт с пустым буфером и уверенностью,
 * что код у него.
 *
 * Возвращает `true`, только если копирование действительно состоялось. Ответ
 * ждётся: сказать «скопировано», не дождавшись отказа буфера, — это соврать
 * ровно тому, у кого копирование и не работает.
 */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* фрейму не дали разрешение — ниже запасной путь */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch { return false; }
}
