/**
 * Когда картинки не будет.
 *
 * Правило: сказать правду и оставить бой доступным. Симуляция идёт на
 * сервере, и её текстовая лента — не «заглушка вместо игры», а тот же бой
 * без картинки. «Что-то пошло не так» здесь запрещено: это фраза, после
 * которой игрок не может сделать ничего.
 */

import { h, mount } from '../lib/dom.js';

const TEXT = {
  norender: ['ЭТОТ БРАУЗЕР НЕ РИСУЕТ АРЕНУ',
    'Бой всё равно идёт — он считается на сервере. Показать картинку не выйдет: браузер не умеет ни WebGPU, ни WebGL2.'],
  offline: ['СЕРВЕР НЕ ОТВЕЧАЕТ',
    'Бои идут на нём, так что ничего не потеряно. Существо дерётся и без этой вкладки.'],
  gpulost: ['ВИДЕОКАРТА ОТВАЛИЛАСЬ',
    'Перезагрузи страницу — бой не потерян, он идёт на сервере.'],
  stale: ['ИГРА ОБНОВИЛАСЬ', 'Обнови страницу, чтобы правила совпали с серверными.'],
};

export function show(kind) {
  const [hd, text] = TEXT[kind] || TEXT.offline;
  const root = document.getElementById('screen');
  if (!root) return;
  root.className = 'on doc';
  mount(root, h('div.sheet.narrow',
    h('div.empty',
      h('div.hd', hd),
      h('div.t-body', { style: { maxWidth: '52ch', margin: '0 auto' } }, text),
      h('div', { style: { marginTop: '20px' } },
        h('button.btn.primary', { onclick: () => location.reload() }, 'ОБНОВИТЬ')))));
  document.getElementById('boot')?.classList.add('off');
}

export async function enter(root) { show('offline'); }
