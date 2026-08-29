/**
 * Итог боя — «превратить бой в свидетельство» (§10.3).
 *
 * Не отдельный маршрут: он лежит поверх арены, потому что арена под ним
 * продолжает идти. Главное правило экрана — **N15**: один матч не показывается
 * как результат рейтинга. Дельта рейтинга показывается как дельта («1240 →
 * 1252»), личный счёт — только когда боёв между этими двумя было хотя бы два,
 * а «место» здесь не пишется вообще.
 *
 * И §7.1: цена не появляется в момент поражения. Никогда.
 */

import { get, track } from '../lib/api.js';
import { $, h, mount, clear, num, signed } from '../lib/dom.js';
import { paintFrames } from '../ui/frames.js';

let box = null;
let ctx = null;

const REASON = {
  kill: 'у соперника кончилось здоровье',
  timeout: 'время вышло — здоровья осталось больше',
  'timeout-draw': 'время вышло — здоровье поровну',
  'double-ko': 'оба выбыли в один тик',
  draw: 'ничья',
};

export function hideInline() { if (box) { box.remove(); box = null; } }

export async function showInline(c) {
  ctx = c;
  const o = ctx.state.over;
  const m = ctx.state.match;
  if (!o) return;
  hideInline();

  const mine = ctx.state.session?.creature || null;
  const myKey = m?.ids ? (m.ids.octopus === mine?.id ? 'octopus' : (m.ids.gorilla === mine?.id ? 'gorilla' : null)) : null;

  const stats = o.stats || {};
  const side = myKey || o.winner || 'octopus';
  const st = stats[side] || {};

  /* Ключи — из `sim.js:139`: hits/misses/uses это СЛОВАРИ по умениям, а не
     числа. Сложить их значения — не украшательство: «попаданий NaN» на экране
     итога боя это ровно тот баг, который читается как «игра сломана». */
  const sum = (o) => (o && typeof o === 'object' ? Object.values(o).reduce((a, b) => a + b, 0) : 0);
  const rows = [
    ['Урон', num(st.damageDealt ?? 0)],
    ['Попаданий', num(sum(st.hits))],
    ['Промахов', num(sum(st.misses))],
    ['Уклонений', num(st.evaded ?? 0)],
    ['Умений применено', num(sum(st.uses))],
    ['Реплик', num(st.saidLines ?? 0)],
  ];

  const bits = [];

  /* Незасчитанный бой. D8: мозг, выключившийся по FAULT_LIMIT, — это наш
     брак, и показать его как поражение значит показать поражение, которого
     не было. */
  if (o.faulted?.length) {
    bits.push(h('div.t-body', { style: { color: '#f0a99e' } },
      'Мозг существа отказал посреди боя. Бой в рейтинг не пошёл — это наша поломка, не твоя игра.'));
  } else if (myKey && o.deltas && mine) {
    const d = o.deltas[mine.id];
    if (d !== undefined && d !== null) {
      bits.push(h('div.stats', { style: { marginTop: '14px' } },
        h(`div.stat.${d >= 0 ? 'up' : 'down'}`,
          h('div.v', `${num(mine.rating)} → ${num(mine.rating + d)}`),
          h('div.k', 'рейтинг'))));
    }
  }

  /* Показательный бой двух библиотечных существ — это не тренировка игрока,
     и называть его тренировочным значит объяснять игроку то, чего с ним не
     происходило. Метка появляется, только когда в бою есть ЕГО существо. */
  if (o.training && myKey) {
    bits.push(h('div.t-body', { style: { marginTop: '10px', color: '#ddd0ad' } },
      'Соперник — тренировочный: спарринг-партнёр из библиотеки, он измеренно слабее среднего. '
      + 'Настоящая лестница начинается со следующего боя.'));
  }

  /* Поражение показывается ШКАЛОЙ, а не словами (§7.2а). Существо с десятью
     поражениями адаптируется лучше, чем с десятью победами: у него больше
     материала — и это ровно то, что должна сказать шкала. */
  if (myKey && o.winner && o.winner !== myKey && mine) {
    const obs = await observations(mine.id);
    if (obs) {
      bits.push(h('div', { style: { marginTop: '16px' } },
        h('div.t-body', `Проигрыш записан как наблюдение. Материала для следующей адаптации стало больше: ${obs.have} из ${obs.need}.`),
        h('div.prog', { style: { marginTop: '8px' } }, h('i', { style: { width: `${Math.round(obs.frac * 100)}%` } }))));
    }
  }

  /* Главное действие зависит от того, кто смотрит. У гостя оно одно и то же
     на любом исходе — «сделать своё»; у владельца главное это разбор боя, а
     не следующая кнопка. Цены здесь нет ни в каком состоянии (§7.1). */
  const actions = ctx.state.session?.creature
    ? [
      o.matchId ? h('button.btn.primary', { onclick: () => ctx.go(`/tactics/${o.matchId}`) }, 'ЧТО ОНО ДУМАЛО') : null,
      h('button.btn.ghost.big', { onclick: () => { hideInline(); ctx.go('/creature/me'); } }, 'К СУЩЕСТВУ'),
    ]
    : [
      h('button.btn.primary', { onclick: () => ctx.go('/new') }, 'СДЕЛАТЬ СВОЁ'),
      o.matchId ? h('button.btn.ghost.big', { onclick: () => ctx.go(`/tactics/${o.matchId}`) }, 'ЧТО ОНО ДУМАЛО') : null,
    ];

  box = h('div#resultbox', {
    style: {
      position: 'fixed', left: '50%', bottom: '7%', transform: 'translateX(-50%)',
      zIndex: 25, width: 'min(560px, 92vw)',
    },
  },
  h('div.panel.lift', { dataset: { frame: JSON.stringify({ seed: 61 }) } },
    h('div.bg'), h('div.fr'),
    h('div.in',
      /* Заголовок исхода рисует #banner — утверждённый элемент эталона.
         Повторять его здесь значит показать одно и то же дважды в одном
         кадре, и оба раза крупно. */
      h('div.hcut', 'ИТОГ БОЯ'),
      h('div', { style: { marginTop: '10px' } },
        rows.map(([k, v]) => h('div.prow', h('div.k', k), h('div.v', v)))),
      bits,
      h('div.row', { style: { marginTop: '18px' } }, actions))));

  document.body.appendChild(box);
  paintFrames(box);
  track('tactics_opened', { matchId: o.matchId });
}

async function observations(id) {
  try { const d = await get(`/api/creature/${id}`); return d.observations; }
  catch { return null; }
}
