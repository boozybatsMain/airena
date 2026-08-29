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
    state.session = await get('/api/session');
    paintShell();
    state.bus.dispatchEvent(new CustomEvent('session'));
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
  current = r.screen;

  const mod = state.screens[r.screen];
  if (!mod) { go('/arena', { replace: true }); return; }

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
