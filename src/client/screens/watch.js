/**
 * Посадочная с клипа: показать настоящий бой за две секунды, без аккаунта.
 *
 * Отличие от арены — не в содержимом, а в том, чего нет: вкладок, меню,
 * регистрации и генерации до первого боя (N5). §10.5 отводит на это первые
 * две секунды, и вход в матч не требует ни одного клика: клиент просит
 * сервер повторить конкретный бой по его id (A16 — только серверный id,
 * никаких клиентских тегов мозгов), и кадры начинают идти сами.
 */

import { get } from '../lib/api.js';
import { $, h, mount } from '../lib/dom.js';
import * as arena from './arena.js';

let ws = null;

export async function enter(root, args, ctx) {
  root.className = '';
  document.body.classList.remove('overlay');

  const clock = $('#clock .s');
  if (clock) clock.textContent = `бой из клипа · №${args.matchId.slice(-6)}`;

  let m = null;
  try { m = await get(`/api/match/${args.matchId}`); } catch { /* ниже */ }

  if (!m) {
    note('Этого боя больше нет — вот другой.');
    return;
  }
  if (m.constantsVersion !== ctx.state.session?.constantsVersion) {
    /* Детерминизм — свойство, а не пожелание (A2). Бой на других константах
       воспроизводится ПРИБЛИЗИТЕЛЬНО, а приблизительно мы не показываем. */
    note('Этот бой шёл по прошлым правилам и точно не повторится. Приблизительно мы не показываем.');
    return;
  }
  askReplay(args.matchId);
}

function note(text) {
  const el = $('#clock .byline');
  if (el) el.textContent = text;
}

/** Просим сокет вьювера повторить конкретный бой. */
function askReplay(matchId) {
  const send = () => {
    try { window.__airenaSend?.({ cmd: 'replay', matchId }); } catch { /* сокета ещё нет */ }
  };
  send();
  setTimeout(send, 700);
  setTimeout(send, 2000);
}

export function leave() { note('Оба мозга написаны нейросетью. Мы в них не вмешивались.'); }
