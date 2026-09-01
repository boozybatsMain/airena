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
import { $, h, mount, clear, num, signed, waitLabel } from '../lib/dom.js';
import { paintFrames } from '../ui/frames.js';

let box = null;
let ctx = null;

/** «1 бой», «2 боя», «10 боёв», «21 бой». */
function fightWord(n) {
  const t = n % 100; const o = n % 10;
  if (t >= 11 && t <= 14) return 'боёв';
  if (o === 1) return 'бой';
  if (o >= 2 && o <= 4) return 'боя';
  return 'боёв';
}

const REASON = {
  kill: 'у соперника кончилось здоровье',
  timeout: 'время вышло — здоровья осталось больше',
  'timeout-draw': 'время вышло — здоровье поровну',
  'double-ko': 'оба выбыли в один тик',
  draw: 'ничья',
};

/** Тикер обратного отсчёта до следующего боя. Живёт ровно столько, сколько карточка. */
let cdTimer = null;

export function hideInline() {
  /* Отменяет и уже показанную карточку, и ту, что ещё ждёт ответа сервера. */
  epoch++;
  if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
  if (box) { box.remove(); box = null; }
}

/*
 * ОТМЕНА ПОКАЗА: маршрут сменился, пока мы ждали сервер.
 *
 * `showInline` ждёт `/api/creature/<id>` ради шкалы наблюдений — и только
 * ПОСЛЕ этого создаёт `box`. `hideInline()` маршрутизатора в это окно видит
 * `box === null` и не делает ничего, а карточка потом приклеивается к
 * `document.body` как `position: fixed` поверх уже другого экрана.
 *
 * Счётчик, а не флаг: показов может быть несколько подряд, и «отменён ли
 * ЭТОТ» отвечает только номер.
 */
let epoch = 0;

export async function showInline(c) {
  ctx = c;
  const o = ctx.state.over;
  const m = ctx.state.match;
  if (!o) return;
  hideInline();
  const mine0 = ++epoch;

  const mine = ctx.state.session?.creature || null;
  const myKey = m?.ids ? (m.ids.octopus === mine?.id ? 'octopus' : (m.ids.gorilla === mine?.id ? 'gorilla' : null)) : null;

  const stats = o.stats || {};
  const side = myKey || o.winner || 'octopus';
  const st = stats[side] || {};
  const sideName = m?.names?.[side] || (side === 'gorilla' ? 'горилла' : 'осьминог');

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
    bits.push(h('div.t-body', { style: { color: 'var(--bad)' } },
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
    /* Цифра вместо общего утверждения. «Измеренно слабее среднего» читается
       ложью, когда у соперника 91% побед за всю жизнь: замерен не он, а пара
       (мозг, сторона), и сказать надо ровно то, что замерено. */
    const rate = typeof o.trainingRate === 'number' ? Math.round(o.trainingRate * 100) : null;
    bits.push(h('div.t-body', { style: { marginTop: '10px', color: 'var(--gor)' } },
      rate === null
        ? 'Это был тренировочный бой: соперника подбирали не по рейтингу. Настоящая лестница начинается со следующего боя.'
        : `Это был тренировочный бой: соперник отобран замером — его мозг на этой стороне выигрывает ${rate}% боёв. `
          + 'Настоящая лестница начинается со следующего боя.'));
  }

  /* Поражение показывается ШКАЛОЙ, а не словами (§7.2а). Существо с десятью
     поражениями адаптируется лучше, чем с десятью победами: у него больше
     материала — и это ровно то, что должна сказать шкала. */
  if (myKey && o.winner && o.winner !== myKey && mine) {
    const obs = await observations(mine.id);
    if (obs) {
      bits.push(h('div', { style: { marginTop: '16px' } },
        h('div.t-body', obs.full
          ? 'Проигрыш записан. Следующим боем существо попробует переписать себя — и оставит новое, только если оно выигрывает у старого.'
          /* «10 боя» — русское число согласуется по последней цифре, а не по
             «единица или нет»: 1 бой, 2–4 боя, 5–20 боёв, 21 бой. */
          : `Проигрыш записан. До следующей попытки переписать себя ${obs.need - obs.have} ${fightWord(obs.need - obs.have)}.`),
        h('div.prog', { style: { marginTop: '8px' } }, h('i', { style: { width: `${Math.round(obs.frac * 100)}%` } }))));
    }
  }

  /*
   * ── СКОЛЬКО ЖДАТЬ СЛЕДУЮЩЕГО БОЯ (D161) ────────────────────────────────
   *
   * Здесь не было ничего, и это была самая заметная дыра экрана: бой кончался,
   * поверх арены вставала карточка с цифрами, и человек не понимал, что
   * делать дальше. Кнопки на карточке уводят с арены («разбор», «к своему»),
   * то есть единственные предложенные действия — это УЙТИ, хотя правильное
   * действие ровно одно: остаться и смотреть следующий бой.
   *
   * Отсчёт берётся из сессии (`nextFightAt`), которую арена перечитывает
   * сразу на `over`. Это то же самое число, по которому сервер решает,
   * когда существо выйдет на арену (`ArenaLoop.due`), а не отдельная оценка:
   * второй источник разошёлся бы с первым в первую же секунду.
   *
   * Гостю показывается другая строка. У него нет существа, значит нет и
   * `nextFightAt`; обещать ему секунды было бы обещанием про чужой бой.
   */
  const nextRow = h('div.t-sub', {
    style: { marginTop: '14px', textAlign: 'center', letterSpacing: '.04em' },
  }, '');
  const paintNext = () => {
    if (!ctx.state.session?.creature) {
      nextRow.textContent = 'бои идут непрерывно — следующий начнётся сам';
      return;
    }
    const at = ctx.state.session?.nextFightAt;
    if (!at) { nextRow.textContent = 'существо ищет соперника'; return; }
    const left = Math.max(0, Math.round((at - Date.now()) / 1000));
    nextRow.textContent = left > 0
      ? `следующий бой через ${waitLabel(left * 1000)}`
      : 'следующий бой начинается';
  };
  paintNext();

  /* Главное действие зависит от того, кто смотрит. У гостя оно одно и то же
     на любом исходе — «сделать своё»; у владельца главное это разбор боя, а
     не следующая кнопка. Цены здесь нет ни в каком состоянии (§7.1). */
  const actions = ctx.state.session?.creature
    ? [
      o.matchId ? h('button.btn.primary', { onclick: () => ctx.go(`/tactics/${o.matchId}`) },
        myKey ? 'ЧТО ОНО ДУМАЛО' : 'ЧТО ОНИ ДУМАЛИ') : null,
      h('button.btn.ghost.big', { onclick: () => { hideInline(); ctx.go('/creature/me'); } }, 'К СВОЕМУ'),
    ]
    : [
      h('button.btn.primary', { onclick: () => ctx.go('/new') }, 'СДЕЛАТЬ СВОЁ'),
      o.matchId ? h('button.btn.ghost.big', { onclick: () => ctx.go(`/tactics/${o.matchId}`) }, 'ЧТО ОНО ДУМАЛО') : null,
    ];

  /* Пока мы ходили на сервер, экран мог смениться — тогда карточки быть не
     должно вовсе. */
  if (mine0 !== epoch) return;
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
      /*
       * ЧЬИ ЭТО ЦИФРЫ — НАДО НАПИСАТЬ.
       *
       * Карточка показывается на КАЖДОМ досмотренном бою, включая чужие: на
       * арене идёт общая трансляция, и владелец существа видит итоги боёв,
       * в которых его существа нет. Строки при этом снимались со стороны
       * победителя и подписывались просто «ИТОГ БОЯ» — то есть человек
       * читал чужой урон как свой и делал выводы про своё существо по чужим
       * цифрам. Ошибка тихая: ничего не ломается, просто всё неправда.
       */
      h('div.t-sub', { style: { marginTop: '2px' } },
        myKey ? 'твоё существо' : `${sideName} · чужой бой`),
      h('div', { style: { marginTop: '10px' } },
        rows.map(([k, v]) => h('div.prow', h('div.k', k), h('div.v', v)))),
      bits,
      nextRow,
      h('div.row', { style: { marginTop: '14px' } }, actions))));

  document.body.appendChild(box);
  paintFrames(box);
  /* Тикает раз в секунду, пока карточка на экране. `hideInline` его снимает —
     и это единственный способ его остановить, потому что карточку снимает
     либо следующий бой, либо смена маршрута, и оба зовут `hideInline`. */
  if (cdTimer) clearInterval(cdTimer);
  cdTimer = setInterval(() => {
    if (mine0 !== epoch) { clearInterval(cdTimer); cdTimer = null; return; }
    paintNext();
  }, 1000);
  /* `tactics_opened` шлёт ЭКРАН РАЗБОРА, а не эта панель: событие кормит
     метрику «дошёл ли игрок до доказательства авторства» (F11), и отправлять
     его на показ панели итога значит получить ровно 100% всегда. */
  track('result_shown', { matchId: o.matchId });
}

async function observations(id) {
  try { const d = await get(`/api/creature/${id}`); return d.observations; }
  catch { return null; }
}
