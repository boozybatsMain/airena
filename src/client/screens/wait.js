/**
 * Ожидание генерации — «занять ожидание, а не показать спиннер» (§10.3).
 *
 * Спиннер здесь запрещён прямо, и не из вкусовых соображений: он ничего не
 * сообщает, а сообщить надо многое. Проценты и ETA запрещены по той же
 * причине, только сильнее: замеренное время генерации — от 10 с до 19 минут
 * (§5.1, §16), и любой показанный ETA будет враньём в большинстве случаев.
 *
 * Вместо этого — именованные стадии, которые сервер действительно проходит,
 * и идущий под слоем настоящий бой.
 */

import { get, track } from '../lib/api.js';
import { h, mount, clear } from '../lib/dom.js';
import { paintFrames } from '../ui/frames.js';

const STAGES = [
  ['в очереди', /очеред/],
  ['читаю описание', /описан/],
  ['мозг пишется', /мозг пишет|попытк/],
  ['проверка: два пробных боя', /провер/],
  ['готово', /готов|заменён|лучше/],
];

let poll = null;

export async function enter(root, args, ctx) {
  root.className = 'on veil';
  document.body.classList.add('overlay');

  const stages = h('div.stages', STAGES.map(([t]) => h('div.stage', h('div.dot'), t)));
  const note = h('div.t-sub', { style: { marginTop: '18px', maxWidth: '48ch' } },
    'Это занимает от нескольких секунд до нескольких минут. Пока идёт — смотри бой под этим окном, он настоящий.');
  const extra = h('div');
  const actions = h('div.row', { style: { marginTop: '22px' } });

  mount(root, h('div.overlay-card',
    h('div.panel.lift', { dataset: { frame: JSON.stringify({ seed: 45 }) } },
      h('div.bg'), h('div.fr'),
      h('div.in',
        h('div.hcut', 'СУЩЕСТВО СОБИРАЕТСЯ'),
        h('div.prog.pulse', { style: { marginTop: '14px' } }, h('i', { style: { width: '100%' } })),
        stages, note, extra, actions))));
  paintFrames(root);

  stop();
  await step();
  poll = setInterval(step, 1500);

  async function step() {
    let j;
    try { j = await get(`/api/job/${args.jobId}`); }
    catch (e) {
      if (e.status === 404 || e.status === 403) { stop(); ctx.go('/arena'); }
      return;
    }
    paintStages(j);

    if (j.state === 'done') {
      stop();
      track('create_done', { jobId: j.id });
      try { localStorage.removeItem('airena.job'); } catch { /* приватный режим */ }
      await ctx.refreshSession();
      clear(actions);
      actions.appendChild(h('button.btn.primary', {
        onclick: () => ctx.go(`/creature/${j.creatureId}`),
      }, 'ПОСМОТРЕТЬ СУЩЕСТВО'));
      note.textContent = 'Готово. Первый бой — в течение минуты, и соперник в нём тренировочный.';
      return;
    }

    if (j.state === 'failed') {
      stop();
      track('create_failed', { jobId: j.id, code: j.error });
      clear(extra);
      extra.appendChild(h('div.t-body', { style: { marginTop: '14px', color: '#f0c08c' } },
        j.error === 'rejected'
          ? 'Мозг не прошёл проверку двумя пробными боями. Денег за это не берут — валидатор отклонил, значит генерация бесплатна.'
          : `Не собралось: ${j.errorMessage || j.error}. Денег не взяли, дневной лимит не тронут.`));
      clear(actions);
      actions.appendChild(h('button.btn.primary', { onclick: () => ctx.go('/new') }, 'ПОПРОБОВАТЬ ЕЩЁ'));
      actions.appendChild(h('button.btn.ghost.big', { onclick: () => ctx.go('/arena') }, 'СМОТРЕТЬ БОЙ'));
      return;
    }

    /* Вторая попытка — 18% генераций, и молчать о ней нельзя: игрок видит,
       что время идёт, и должен знать почему. */
    if (j.attempts > 1) {
      clear(extra);
      extra.appendChild(h('div.t-body', { style: { marginTop: '12px' } },
        'Первая попытка не собралась. Идёт вторая — она бесплатная.'));
    }
    const age = Date.now() - j.createdAt;
    if (age > 240000) {
      clear(extra);
      extra.appendChild(h('div.t-body', { style: { marginTop: '12px' } },
        'Дольше обычного. Мы не бросили — модель ещё пишет.'));
    }
  }

  function paintStages(j) {
    const label = j.stage || 'в очереди';
    let at = STAGES.findIndex(([, re]) => re.test(label));
    if (at < 0) at = 0;
    [...stages.children].forEach((el, i) => {
      el.classList.toggle('on', i === at);
      el.classList.toggle('done', i < at);
      /* Подпись стадии берётся у сервера, а не выдумывается клиентом:
         «мозг пишется» и «первая попытка не удалась, пробую ещё» — это
         разные вещи, и вторая должна доезжать словами сервера. */
      if (i === at) el.lastChild.textContent = label;
    });
  }
}

function stop() { if (poll) { clearInterval(poll); poll = null; } }

export function leave() {
  stop();
  document.body.classList.remove('overlay');
}
