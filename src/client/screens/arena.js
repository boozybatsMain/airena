/**
 * Арена — экран по умолчанию и единственный, у которого нет своего DOM.
 *
 * Бой рисует вьювер, перенесённый из утверждённого эталона (§10.6). Этот
 * модуль отвечает за то, чего у эталона не было: состояние «между боями»,
 * метка тренировочного соперника, дайджест «пока тебя не было», подпись
 * авторства и переход в итог боя.
 *
 * §6.2 буквально: «вошёл посреди боя — попадает сразу на арену, нет боя —
 * в меню». Меню как экрана нет (§10.3), поэтому «меню» здесь — состояние
 * этой же вкладки: кольцо `.seeking` вокруг одной кнопки и отсчёт до
 * следующего боя.
 */

import { get, track } from '../lib/api.js';
import { $, h, mount, clear, mmss, num } from '../lib/dom.js';
import { paintFrames } from '../ui/frames.js';
import * as result from './result.js';

let ctx = null;
let idleEl = null;
let tick = null;
let watchedMatch = null;

export async function enter(root, args, c) {
  ctx = c;
  root.className = 'on';
  document.body.classList.remove('overlay');
  paintSides();
  paintDigest();
  if (ctx.state.match) hideIdle(); else showIdle();
  if (ctx.state.over) result.showInline(ctx);
  startTick();
}

export function leave() {
  stopTick();
  result.hideInline();
}

// ── состояние «между боями» ────────────────────────────────────────────────

function ensureIdle() {
  if (idleEl && idleEl.isConnected) return idleEl;
  idleEl = h('div#idle');
  $('#arena').appendChild(idleEl);
  return idleEl;
}

export function showIdle() {
  const s = ctx?.state.session;
  const el = ensureIdle();
  el.style.display = '';

  if (!s) { mount(el, h('div.t-cap', 'соединение')); return; }

  /* Гость без своего существа. F7 даёт ему библиотечное; D2 делает это
     выбором, а не выдачей — «я выбрал» держит воронку лучше, чем «нам дали». */
  if (!s.creature) {
    mount(el, h('div.panel.lift', { dataset: { frame: JSON.stringify({ seed: 21 }) } },
      h('div.bg'), h('div.fr'),
      h('div.in',
        h('div.t-cap', { style: { color: '#8fb3c2', fontSize: '14px' } }, 'ТЫ СМОТРИШЬ ЧУЖОЙ БОЙ'),
        h('div.t-body', { style: { maxWidth: '46ch', margin: '8px 0 14px' } },
          'Возьми существо из библиотеки — оно дерётся ровно так же, как любое другое. '
          + 'Своё можно сделать после первого боя.'),
        h('button.btn.primary', { onclick: () => ctx.go('/creature/me') }, 'ВЗЯТЬ СУЩЕСТВО'))));
    paintFrames(el);
    return;
  }

  if (s.job && (s.job.state === 'queued' || s.job.state === 'running')) {
    mount(el,
      h('div.t-cap', 'существо собирается · бои начнутся, когда оно будет готово'),
      h('div.prog.pulse', h('i', { style: { width: '38%' } })));
    return;
  }

  if (!s.creature.hasBrain) {
    mount(el,
      h('div.t-cap', { style: { color: '#f0a99e' } }, 'существо не собралось. денег не взяли.'),
      h('div', { style: { marginTop: '12px' } },
        h('button.btn.primary', { onclick: () => ctx.go('/new') }, 'ПОПРОБОВАТЬ ЕЩЁ')));
    return;
  }

  mount(el,
    h('span.seeking', h('button.btn.primary', { onclick: () => ctx.go('/creature/me') }, 'СМОТРЕТЬ БОЙ')),
    h('div.cd-t', 'существо ищет бой'),
    h('div.prog', h('i', { style: { width: '0%' } })));
  renderCountdown();
}

export function hideIdle() { if (idleEl) idleEl.style.display = 'none'; }

function renderCountdown() {
  const s = ctx?.state.session;
  if (!idleEl || !s?.nextFightAt) return;
  const left = s.nextFightAt - Date.now();
  const t = idleEl.querySelector('.cd-t');
  const bar = idleEl.querySelector('.prog > i');
  if (!t) return;
  if (left <= 0) { t.textContent = 'бой начинается'; if (bar) bar.style.width = '100%'; return; }
  t.textContent = `существо ищет бой · следующий через ${mmss(left)}`;
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, (1 - left / 60000) * 100)).toFixed(0)}%`;
}

function startTick() {
  stopTick();
  tick = setInterval(() => {
    renderCountdown();
    /* Раз в 20 с переспрашиваем сессию: бои идут на сервере всегда, и
       страница, которая этого не замечает, обещает автобатлер и не
       показывает его. */
    if (Date.now() % 20000 < 1000) ctx?.refreshSession().then(() => {
      if (!ctx.state.match) showIdle();
    }).catch(() => {});
  }, 1000);
}
function stopTick() { if (tick) { clearInterval(tick); tick = null; } }

// ── сообщения сокета ───────────────────────────────────────────────────────

export function onMatch(m) {
  watchedMatch = m;
  document.body.classList.add('fighting');
  hideIdle();
  result.hideInline();
  paintSides(m);
  const clock = $('#clock .s');
  if (clock) clock.textContent = `бой №${m.seed}`;
  track('fight_watched', { matchId: m.matchId, seconds: 0, completed: 0 });
  for (const el of [$('#bar-oct'), $('#bar-gor')]) el?.classList.remove('dead', 'won');
}

export function onFrame(f) {
  const clock = $('#clock .s');
  if (!clock || !watchedMatch) return;
  /* Внезапная смерть — рампа, а не константа: процент берётся из кадра,
     иначе строка врёт ровно тем сильнее, чем дольше идёт бой. */
  if (f.t >= 30) {
    clock.classList.add('burning');
    clock.textContent = 'ВНЕЗАПНАЯ СМЕРТЬ · арена жжёт обоих';
  } else {
    clock.classList.remove('burning');
    const left = Math.max(0, 30 - f.t);
    clock.textContent = left < 9
      ? `бой №${watchedMatch.seed} · арена загорится через ${Math.ceil(left)} с`
      : `бой №${watchedMatch.seed}`;
  }
}

export function onOver(o) {
  document.body.classList.remove('fighting');
  const win = o.winner;
  if (win) {
    $(win === 'octopus' ? '#bar-oct' : '#bar-gor')?.classList.add('won');
    $(win === 'octopus' ? '#bar-gor' : '#bar-oct')?.classList.add('dead');
  }
  track('fight_watched', { matchId: o.matchId, seconds: 1, completed: 1 });
  if (ctx?.state.route?.screen === 'arena' || ctx?.state.route?.screen === 'watch') {
    result.showInline(ctx);
  }
  /* Бой кончился — сессия знает про новый рейтинг и следующий бой. */
  ctx?.refreshSession().then(() => { if (!ctx.state.match) showIdle(); }).catch(() => {});
}

/** Сессия сменила существо — перерисовать то, что от него зависит. */
export function onSessionChanged() {
  paintDigest();
  if (!ctx?.state.match && ctx?.state.route?.screen === 'arena') showIdle();
}

export function onIdle() {
  watchedMatch = null;
  document.body.classList.remove('fighting');
  paintSides(null);
  if (ctx?.state.route?.screen === 'arena') showIdle();
}

// ── метка тренировочного соперника ─────────────────────────────────────────

/**
 * §7.3 и N4 вместе: соперник настоящий и играет в полную силу, но он ЯВНО
 * помечен тренировочным. Запрещена постановка, а не слабость — а постановкой
 * слабый соперник становится ровно в тот момент, когда о нём молчат.
 */
function paintSides(m = watchedMatch) {
  for (const [side, key] of [['oct', 'octopus'], ['gor', 'gorilla']]) {
    const tag = document.querySelector(`.sidetag[data-side="${side}"]`);
    if (!tag) continue;
    clear(tag);
    if (!m) continue;
    const meta = m.meta?.[key];
    if (m.training && m.ids && ctx?.state.session?.creature
        && m.ids[key] !== ctx.state.session.creature.id) {
      tag.appendChild(h('span.badge.warn', 'ТРЕНИРОВОЧНЫЙ'));
      tag.appendChild(h('span.note', 'спарринг-партнёр из библиотеки, не игрок'));
    } else if (meta?.model) {
      tag.appendChild(h('span.note', meta.model));
    }
  }
}

// ── дайджест «пока тебя не было» ───────────────────────────────────────────

/**
 * A17: три строки под `// ПОКА ТЕБЯ НЕ БЫЛО` держатся ВНЕ ленты. Внутри неё
 * они исчезают за четыре секунды плотного боя — то есть ровно тогда, когда
 * игрок их читает.
 */
function paintDigest() {
  const box = $('#digest');
  if (!box) return;
  clear(box);
  const s = ctx?.state.session?.since;
  if (!s || !s.fights) return;
  const wr = s.fights ? Math.round((s.wins / s.fights) * 100) : 0;
  box.appendChild(h('div.box',
    h('div.hd', 'пока тебя не было'),
    h('div.ln', `${num(s.fights)} боёв · ${wr}% побед`),
    h('div.ln', `рейтинг ${s.ratingDrift >= 0 ? '+' : '−'}${Math.abs(Math.round(s.ratingDrift))}`),
    h('div.ln', `${s.adaptations} ${s.adaptations === 1 ? 'улучшение принято' : 'улучшений принято'}`)));
}
