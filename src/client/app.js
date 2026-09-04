/**
 * Оболочка: маршруты, вкладки, сессия, и один боевой слой на всё время жизни.
 *
 * Хеш-роуты, а не пути (A3). Продукт живёт внутри iframe GENEX, песочница —
 * `allow-scripts allow-same-origin allow-pointer-lock`, и никто не проверил,
 * что платформа прокидывает во фрейм путь и query. Хеш переживает и подстановку
 * `src`, и отсутствие серверных rewrite-правил. `?m=` и `?seed=` принимаются
 * как алиасы — страховка на случай, если query доезжает, а хеш нет.
 *
 * Боевой слой НЕ размонтируется никогда: рендерер, который сносят на каждой
 * навигации, — это F6, провалённый на каждом переходе.
 */

/**
 * Отметки пути к первому кадру.
 *
 * F6 — «≤10 с до первого кадра настоящего боя на p75, холодный кеш, средний
 * ноутбук» — это ЦИФРА, а цифра, которую никто не меряет, не выполняется, а
 * декларируется. Отметки читает `tools/checkboot.mjs` и роняет сборку, если
 * бюджет пробит.
 */
export const marks = { t0: performance.now() };
export const mark = (k) => { marks[k] = Math.round(performance.now()); return marks[k]; };
if (typeof window !== 'undefined') window.__airenaMarks = marks;

import { get, post, track, setToken } from './lib/api.js';
import { $, h, mount, clear, mmss } from './lib/dom.js';
import { paintFrames } from './ui/frames.js';
import { glyph } from './ui/glyph.js';

import * as arena from './screens/arena.js';
import * as creature from './screens/creature.js';
import * as ladder from './screens/ladder.js';
import * as create from './screens/create.js';
import * as wait from './screens/wait.js';
import * as wall from './screens/wall.js';
import { startPlatformIdentity } from './lib/platform.js';
import * as result from './screens/result.js';
import * as tactics from './screens/tactics.js';
import * as fatal from './screens/fatal.js';
import * as watch from './screens/watch.js';

export const state = {
  session: null,
  match: null,      // последнее сообщение type:'match'
  over: null,       // последнее сообщение type:'over'
  frame: null,
  route: null,
  screens: { arena, creature, ladder, create, wait, wall, result, tactics, fatal, watch },
  bus: new EventTarget(),
};

const screenEl = $('#screen');
const shellEl = $('#shell');

// ───────────────────────────────────────────────────────────────────────────
// сессия
// ───────────────────────────────────────────────────────────────────────────

export async function refreshSession() {
  try {
    const before = state.session?.creature?.id ?? null;
    const beforeAccount = state.session?.accountId ?? null;
    state.session = await get('/api/session');
    /*
     * Аккаунт сменился — сокет обязан переоткрыться (D162).
     *
     * Личность сокета фиксируется на рукопожатии. `claimAccount` всегда даёт
     * НОВЫЙ id: гостевой удаляется, вместо него появляется настоящий. Сокет с
     * прежней личностью считает только что созданное существо чужим, и на
     * экране нет ни «ТВОЁ», ни «твой бой» — ровно там, где игрок впервые
     * смотрит на СВОЁ существо.
     */
    if (beforeAccount && state.session?.accountId && beforeAccount !== state.session.accountId) {
      try { window.__airenaReconnect?.(); } catch { /* сокета нет */ }
    }
    /*
     * Отметка следующего боя переводится в ЛОКАЛЬНЫЕ часы (D161).
     *
     * Сервер шлёт и абсолютное `nextFightAt` (его часы), и относительное
     * `nextFightIn` (миллисекунды от ответа). Считать по абсолютному значит
     * считать разницу двух разных часов: расхождение телефона с сервером на
     * минуту превращало «через 5 секунд» в «через минуту пять» или в ноль.
     *
     * Одно место на весь клиент: и экран ожидания, и карточка итога читают
     * уже исправленное поле, и разойтись им негде.
     */
    if (state.session && state.session.nextFightIn != null) {
      state.session.nextFightAt = Date.now() + state.session.nextFightIn;
    }
    paintShell();
    state.bus.dispatchEvent(new CustomEvent('session'));
    /*
     * Существо, появившееся посреди сессии, обязано появиться и на арене.
     *
     * Без этого игрок доживал генерацию до конца, возвращался на вкладку
     * «Бой» и видел гостевую плашку «ты смотришь чужой бой» — про своё
     * существо, которое в этот момент уже дралось. Перезагрузка чинила, и
     * это худший вид бага: он выглядит как «игра не заметила», потому что
     * игра действительно не заметила.
     */
    /*
     * У кого нет своего существа, тот смотрит ВЫБРАННОЕ им из библиотеки.
     *
     * `airena.starter` писался при выборе и не читался нигде: выбор гостя из
     * тройки (D2) был кликом в никуда, и при каждом возврате на арену ему
     * снова предлагали выбрать. Теперь он подставляется вместо собственного
     * существа, которого у гостя ещё нет, — и сервер показывает бой именно
     * этого существа (`Live.wanted` → `showcase({ prefer })`).
     */
    let starter = null;
    try { starter = localStorage.getItem('airena.starter'); } catch { /* приватный режим */ }
    const after = state.session?.creature?.id ?? starter ?? null;
    if (before !== after) {
      arena.onSessionChanged();
      /* Сокет подписан на существо, которого тогда ещё не было. */
      try { window.__airenaSend?.({ cmd: 'watch', creatureId: after }); } catch { /* сокета нет */ }
    }
    return state.session;
  } catch (e) {
    if (e.code === 'offline') fatal.show('offline');
    throw e;
  }
}

function paintShell() {
  const s = state.session;
  if (!s) return;
  const status = $('#shell .status');
  const bits = [];
  if (s.guest) bits.push('гость · существо не сохраняется');
  else if (s.creature) bits.push('1 существо из 1');
  if (s.season?.endsAt) {
    const left = s.season.endsAt - Date.now();
    if (left > 0 && left < 864e5) bits.push(`сезон ${s.season.n} · остаётся ${Math.round(left / 36e5)} ч`);
  }
  status.textContent = bits.join(' · ');

  const pip = $('#shell .tab[data-tab="creature"] .pip');
  const nAdapt = s.since?.adaptations || 0;
  pip.classList.toggle('on', nAdapt > 0);
  pip.textContent = nAdapt ? `+${nAdapt}` : '';
}

// ───────────────────────────────────────────────────────────────────────────
// маршруты
// ───────────────────────────────────────────────────────────────────────────

/** Куда ведёт каждый маршрут и какая вкладка при этом горит. */
const ROUTES = [
  [/^\/arena$/, () => ({ screen: 'arena', tab: 'arena' })],
  [/^\/watch\/([\w-]+)$/, (m) => ({ screen: 'watch', tab: null, args: { matchId: m[1] } })],
  [/^\/creature\/([\w-]+)$/, (m) => ({ screen: 'creature', tab: 'creature', args: { id: m[1] } })],
  [/^\/ladder$/, () => ({ screen: 'ladder', tab: 'ladder', args: { section: 'ladder' } })],
  [/^\/ladder\/(models|season)$/, (m) => ({ screen: 'ladder', tab: 'ladder', args: { section: m[1] } })],
  [/^\/new$/, () => ({ screen: 'create', tab: null })],
  [/^\/new\/([\w-]+)$/, (m) => ({ screen: 'wait', tab: null, args: { jobId: m[1] } })],
  [/^\/save$/, () => ({ screen: 'wall', tab: null })],
  [/^\/tactics\/([\w-]+)$/, (m) => ({ screen: 'tactics', tab: null, args: { matchId: m[1] } })],
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/arena';
  for (const [re, fn] of ROUTES) {
    const m = raw.match(re);
    if (m) return { ...fn(m), path: raw };
  }
  return { screen: 'arena', tab: 'arena', path: '/arena' };
}

export function go(path, { replace = false } = {}) {
  const next = `#${path}`;
  if (location.hash === next) { render(); return; }
  if (replace) history.replaceState(null, '', next); else location.hash = next;
  if (replace) render();
}

let current = null;

async function render() {
  const r = parseHash();
  state.route = r;

  for (const t of document.querySelectorAll('#shell .tab')) {
    t.classList.toggle('on', t.dataset.tab === r.tab);
  }
  shellEl.classList.toggle('hidden', r.screen === 'watch');

  if (current && current !== r.screen && state.screens[current]?.leave) {
    try { state.screens[current].leave(); } catch { /* уход не роняет вход */ }
  }
  /*
   * КАРТОЧКА ИТОГА СНИМАЕТСЯ ПРИ ЛЮБОЙ СМЕНЕ ЭКРАНА.
   *
   * Она `position: fixed` и живёт вне `#screen`, поэтому смена маршрута её не
   * трогает. Снимал её только `arena.leave()` — а на посадочную с клипа
   * карточку ставит другой экран, и при переходе `#/watch → #/new` панель
   * «ИТОГ БОЯ» оставалась висеть поверх экрана создания.
   *
   * Правило простое: элемент, который живёт над всеми экранами, обязан
   * убираться маршрутизатором, а не тем экраном, который его поставил.
   */
  try { result.hideInline(); } catch { /* карточки может не быть */ }
  current = r.screen;

  const mod = state.screens[r.screen];
  if (!mod) { go('/arena', { replace: true }); return; }

  /*
   * ИДЁТ ГЕНЕРАЦИЯ — ЗНАЧИТ ЭКРАН ОЖИДАНИЯ.
   *
   * Генерация занимает три–шесть минут: самый длинный и самый хрупкий отрезок
   * первой сессии. Экран ожидания существовал и был доступен ровно по ссылке
   * `#/new/<id>`, которую игрок получал один раз при отправке. Перезагрузил
   * вкладку — и попал на арену, где ему как «существа ещё нет» предлагали
   * взять библиотечное, хотя своё в этот момент собиралось. Ни строки о том,
   * что происходит, и ни одного пути назад.
   *
   * Сессия про задание знает (`session.job`), знала и раньше — просто ей
   * никто не пользовался. Вкладки «существо» и «бой» при этом остаются
   * доступными: увести человека силой нельзя, можно только вернуть его туда,
   * куда он шёл.
   */
  const job = state.session?.job;
  if (job && (job.state === 'queued' || job.state === 'running')
      && (r.screen === 'arena' || r.screen === 'create')
      && r.screen !== 'wait') {
    go(`/new/${job.id}`, { replace: true });
    return;
  }

  document.body.classList.remove('overlay');
  screenEl.className = '';
  clear(screenEl);
  try {
    await mod.enter(screenEl, r.args || {}, { go, state, refreshSession });
  } catch (e) {
    if (e?.code === 'offline') { fatal.show('offline'); return; }
    mount(screenEl, h('div.sheet.narrow',
      h('div.empty',
        h('div.hd', 'ЭКРАН НЕ СОБРАЛСЯ'),
        h('div.t-body', e?.message || 'Что-то не отдалось сервером.'),
        h('div', { style: { marginTop: '16px' } },
          h('button.btn.big', { onclick: () => render() }, 'ПОВТОРИТЬ')))));
    screenEl.className = 'on doc';
    track('error_shown', { code: e?.code || 'render', screen: r.screen });
  }
  track('tab_view', { tab: r.tab || r.screen });
  paintFrames(screenEl);
}

// ───────────────────────────────────────────────────────────────────────────
// боевой слой: один сокет, одна правда
// ───────────────────────────────────────────────────────────────────────────

/*
 * Подсказка «как читать бой» показывается на ПЕРВОМ бою, который человек
 * увидел, а не при загрузке: до первого кадра объяснять нечего.
 */
(() => {
  const el = document.getElementById('howto');
  const close = document.getElementById('howto-close');
  if (!el || !close) return;
  /*
   * Ключ версионирован (D162): булев `airena.howto` означал, что новую строку
   * легенды не увидит никто из уже игравших — то есть ровно те, кто смотрит
   * бои дольше всех. Версия поднимается ВМЕСТЕ с содержимым легенды.
   */
  const HOWTO_VERSION = '2';
  /* Версия видна СНАРУЖИ, на самом элементе. Съёмка боя (`tools/vfxshot.mjs
     --watch`) гасит памятку тем же ключом, каким её гасит человек, и без
     этого атрибута ей пришлось бы держать копию номера у себя — то есть
     разъехаться с ним на первом же подъёме версии. */
  el.dataset.v = HOWTO_VERSION;
  let seen = true;
  try { seen = localStorage.getItem('airena.howto') === HOWTO_VERSION; } catch { seen = true; }
  if (seen) return;
  const show = () => {
    el.hidden = false;
    removeEventListener('airena:match', show);
  };
  addEventListener('airena:match', show);
  close.onclick = () => {
    el.hidden = true;
    try { localStorage.setItem('airena.howto', HOWTO_VERSION); } catch { /* приватный режим */ }
  };
})();

addEventListener('airena:match', (e) => {
  if (!marks.firstMatch) mark('firstMatch');
  state.match = e.detail; state.over = null;
  $('#boot')?.classList.add('off');
  $('#netstate')?.classList.remove('on');
  arena.onMatch(e.detail);
});
addEventListener('airena:frame', (e) => { if (!marks.firstFrame) mark('firstFrame'); state.frame = e.detail.frame; arena.onFrame(e.detail.frame); });
addEventListener('airena:over', (e) => { state.over = e.detail; arena.onOver(e.detail); });
addEventListener('airena:idle', () => { state.match = null; $('#boot')?.classList.add('off'); arena.onIdle(); });

/**
 * Тело не собралось в браузере — и об этом узнают.
 *
 * Вьювер об этом кричал (`airena:bodyfail`) с самого начала, а слушателя не
 * было ни одного: событие уходило в пустоту, существо молча выходило в стоковом
 * теле, игрок видел чужую фигуру вместо своей медузы и ничего не понимал. Мы —
 * тем более: в телеметрии этого не было.
 *
 * Это единственное место, где видно ПРАВДУ: приёмка на сервере может ошибиться,
 * а здесь код уже исполнился в настоящем браузере на настоящем железе. Поэтому
 * событие едет на сервер: доля отказов тела — наш показатель, а не игрока.
 *
 * Игроку — одна строка, без модалки: он смотрит бой, и прерывать бой ради
 * плохой новости о картинке хуже, чем сама новость.
 */
addEventListener('airena:bodyfail', (e) => {
  const { side, ref, message } = e.detail || {};
  track('body_broken', { ref: String(ref || ''), side: String(side || ''), message: String(message || '').slice(0, 200) });
  arena.onBodyFail?.({ side, ref, message });
});

/**
 * Загрузка тяжёлого рендерера отложена на кадр после первой отрисовки
 * оболочки: F6 меряет время до ПЕРВОГО КАДРА, и три мегабайта three.js в
 * критическом пути разметки — это гарантированный провал бюджета.
 */
async function bootRenderer() {
  mark('rendererRequested');
  try {
    /* Штамп сборки едет и в динамические импорты: без него вьювер кешируется
       отдельно от страницы, и релиз выкатывается наполовину. */
    const v = window.__v ? `?v=${window.__v}` : '';
    await import(`/viewer/main.js${v}`);
    mark('rendererReady');
    await import(`/viewer/hud-skin.js${v}`);
  } catch (e) {
    console.error(e);
    fatal.show('norender');
  }
}

// ───────────────────────────────────────────────────────────────────────────
// старт
// ───────────────────────────────────────────────────────────────────────────

async function main() {
  /* Алиасы query → хеш (A3). Делается ДО первого разбора маршрута. */
  const q = new URLSearchParams(location.search);
  if (!location.hash && q.get('m')) go(`/watch/${q.get('m')}`, { replace: true });

  addEventListener('hashchange', render);

  glyph.install();

  /*
   * Рендерер стартует ПЕРВЫМ, а не после отрисовки оболочки.
   *
   * Он и есть длинный полюс: 960 КБ модулей, инициализация WebGPU и загрузка
   * двух тел. Всё остальное — сессия, вкладки, экран — это микросекунды DOM,
   * и они прекрасно едут параллельно. Замерено: при обратном порядке импорт
   * main.js стартовал на 5159 мс вместо 15 мс, потому что вкладка была
   * фоновой и растеризация рамок в ней откладывается.
   *
   * Await здесь нет намеренно: если рендерер упадёт, оболочка обязана
   * доехать и показать текстовый режим (fatal), а не исчезнуть вместе с ним.
   */
  bootRenderer();

  /*
   * РУКОПОЖАТИЕ С ПЛАТФОРМОЙ — ЗДЕСЬ, А НЕ У СТЕНЫ АККАУНТА.
   *
   * Дашборд платформы даёт игре пятнадцать секунд на первое сообщение
   * протокола и, не услышав его, накрывает фрейм страницей «This game didn't
   * finish starting» — то есть молчание на старте читается как сборка без
   * SDK. Замерено на живом превью: ровно это игрок и увидел.
   *
   * Без `await` и рядом с рендерером по той же причине, что и он: F6 меряет
   * время до первого кадра, и кадр не имеет права ждать чужую сеть. Отсюда
   * же и порядок — сначала тяжёлый рендерер, потом всё остальное.
   */
  startPlatformIdentity();

  try { await refreshSession(); } catch { /* fatal уже показан */ }
  track('session_start', {
    returning: state.session?.creature ? 1 : 0,
    awayMs: state.session?.since ? 1 : 0,
  });
  mark('shellReady');
  await render();
  mark('screenReady');
}

main();
