/**
 * «Что оно думало» — то, чем F11 заменил закрытый исходник.
 *
 * ЖЁСТКОЕ ОГРАНИЧЕНИЕ: карточка НЕ ВЫЗЫВАЕТ МОДЕЛЬ. Никогда. Бои идут раз в
 * минуту на существо, вечно (§6.2, Q3), а вирусная посадочная — это сотни
 * тысяч открытий. Любой вызов модели здесь — та же экономическая смерть,
 * ради которой §7.2а запретил LLM в адаптации.
 *
 * Поэтому карточка собирается из двух вещей, которые уже есть бесплатно:
 * реплик `api.say()`, записанных в лог матча, и самих событий боя. Всё, что
 * здесь написано, игрок видел своими глазами — и это сильнее пересказа.
 */

import { get } from '../lib/api.js';
import { h, mount, empty } from '../lib/dom.js';
import { paintFrames } from '../ui/frames.js';

const SKILL_RU = {
  laser: 'луч', blink: 'рывок', smash: 'удар', charge: 'разгон', jump: 'прыжок',
};
const ru = (s) => SKILL_RU[s] || s;

export async function enter(root, args, ctx) {
  root.className = 'on veil';
  document.body.classList.add('overlay');

  mount(root, h('div.overlay-card',
    h('div.panel.lift', { dataset: { frame: JSON.stringify({ seed: 77 }) } },
      h('div.bg'), h('div.fr'),
      h('div.in',
        h('div.hcut', 'ЧТО ОНО ДУМАЛО'),
        h('div.beats', { id: 'beats' },
          [0, 1, 2].map(() => h('div.skel', { style: { height: '18px', margin: '7px 0' } }))),
        h('div.t-body', { style: { marginTop: '18px', color: '#7d8b98', fontSize: '13px' } },
          'Это написала нейросеть. Исходник мы не показываем — ни свой, ни чужой.'),
        h('div.row', { style: { marginTop: '16px' } },
          h('button.btn.big', { onclick: () => history.back() }, 'НАЗАД'),
          ctx.state.session?.creature ? null
            : h('button.btn.primary', { onclick: () => ctx.go('/new') }, 'СДЕЛАТЬ СВОЁ'))))));
  paintFrames(root);

  let m;
  try { m = await get(`/api/match/${args.matchId}`); }
  catch (e) {
    mount(root.querySelector('#beats'),
      h('div.t-body', 'Этот бой мы уже не помним подробно.'));
    return;
  }

  const nameOf = (slot) => (slot === m.a.slot ? m.a.name : m.b.name);
  const isOr = (slot) => slot === 'gorilla';
  const lines = [];

  for (const b of m.beats || []) {
    const who = b.who;
    const or = (m.a.name === who ? m.a.slot : m.b.slot) === 'gorilla';
    if (b.type === 'say') {
      lines.push({ t: b.t, or, html: [h('q', `«${b.text}»`), ' — сказало ', who] });
    } else if (b.type === 'hit') {
      lines.push({ t: b.t, or, html: [who, ' попало: ', ru(b.skill), ' на ', String(Math.round(b.amount))] });
    } else if (b.type === 'blocked') {
      lines.push({ t: b.t, or, html: [who, ' — ', ru(b.skill), ' закрыт укрытием'] });
    } else if (b.type === 'miss') {
      lines.push({ t: b.t, or, html: [who, ' — ', ru(b.skill), ' мимо'] });
    }
  }

  const said = lines.filter((l) => Array.isArray(l.html) && l.html[0]?.tagName === 'Q');
  const box = root.querySelector('#beats');
  if (!lines.length) {
    mount(box, empty('БОЙ НЕ ОСТАВИЛ СЛЕДА',
      'От этого боя не сохранилось ни реплик, ни разбора. Такое бывает с самыми короткими.'));
    return;
  }

  mount(box, [
    said.length ? null : h('div.t-body', { style: { marginBottom: '10px', color: '#8b9aa8' } },
      'В этом бою существо не сказало ни слова. Осталось то, что оно делало:'),
    lines.slice(0, 14).map((l) => h(`div.beat${l.or ? '.or' : ''}`,
      h('div.t', fmt(l.t)), h('div.x', l.html))),
  ]);
}

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function leave() { document.body.classList.remove('overlay'); }
