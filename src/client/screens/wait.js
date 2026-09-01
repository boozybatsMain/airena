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

/*
 * Рельс стадий обязан совпадать с тем, что присылает сервер (STAGE_RU в
 * jobs.js). Здесь не хватало двух: тела — самой длинной стадии из всех, — и
 * карточки тактики. Пока их не было, экран несколько минут стоял на «мозг
 * пишется», а потом прыгал сразу в «готово»: движение шло рывками и в самом
 * длинном месте не шло вовсе.
 */
/** Коды, за которые отвечаем мы, а не игрок — совпадает с limits.js. */
const OUR_FAULT = ['server_restarted', 'internal', 'no_catalog', 'no_creature',
  'no_key', 'network', 'wall'];

/*
 * ШАГИ РАИЛА СОПОСТАВЛЯЮТСЯ ПО КОДУ СТАДИИ, А НЕ ПО ЕЁ ТЕКСТУ.
 *
 * Здесь стояли регекспы по русской подписи сервера, и один из них промахнулся:
 * клиент искал `/мозг пишет/`, сервер писал «модель пишет мозг». Рельс на
 * самой длинной стадии откатывался на шаг назад и стоял там минуты — то есть
 * в окне наибольшего отвала игра показывала, что дела идут хуже, чем идут.
 *
 * Регексп по прозе ломается от любой переформулировки, и ломается молча.
 * Коды приходят от сервера (`stageCode`) и перечислены в `STAGE_RU` в
 * `src/server/jobs.js`; `tools/checkstages.mjs` падает, если тут появится код,
 * которого сервер не шлёт, или наоборот.
 *
 * Регекспы оставлены ЗАПАСНЫМ путём — для заданий, начатых до появления
 * колонки `stage_code`: у них кода нет, и без запасного пути рельс встал бы
 * на первом шаге.
 */
const STAGES = [
  ['в очереди', ['queued'], /очеред/],
  ['читаю описание', ['parse'], /описан/],
  /* `/мозг/` тут было бы слишком широко: «проверяю МОЗГ двумя пробными боями»
     — это уже другой шаг. Запасной путь обязан быть не шире кода, который он
     заменяет, иначе он не запасной, а второй источник ошибки. */
  ['мозг пишется', ['brain', 'brain_retry'], /пишет мозг|попытк/],
  ['тело рисуется', ['body', 'body_retry'], /тело/],
  ['проверка: два пробных боя', ['validate', 'duel'], /провер|свожу/],
  ['записываю тактику', ['card'], /записыва/],
  ['готово', ['done'], /готов|заменён|лучше/],
];

let poll = null;

export async function enter(root, args, ctx) {
  root.className = 'on veil';
  document.body.classList.add('overlay');

  const stages = h('div.stages', STAGES.map(([t]) => h('div.stage', h('div.dot'), t)));
  const note = h('div.t-sub', { style: { marginTop: '18px', maxWidth: '48ch' } },
    /*
     * ОБЕЩАНИЕ ПРИВЕДЕНО К ЗАМЕРУ.
     *
     * Стояло «от нескольких секунд до нескольких минут». Замерено на пятнадцати
     * живых генерациях: медиана 157 секунд, но три хвостовых — 702, 725 и 1232
     * секунды, а с запасной моделью на теле худший случай удваивается. Потолок
     * на запрос — час, и это решение основателя: «сколько генерируется, столько
     * пусть и генерируется».
     *
     * Значит «несколько минут» — неправда ровно для тех, кому хуже всего
     * ждётся. Обещание, которое не выполняется у худшей десятой доли, хуже
     * честного «до получаса»: второе переживается один раз, первое — как обман.
     */
    'Обычно две-три минуты, изредка до получаса: дольше всего рисуется тело. '
    + 'Пока идёт — смотри бой под этим окном, он настоящий.');
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
      /* Существо родилось — черновик больше не нужен. До этого момента он
         жив: генерация может упасть, и тогда игроку предложат тот же текст,
         а не пустое поле. */
      try { localStorage.removeItem('airena.job'); localStorage.removeItem('airena.draft'); }
      catch { /* приватный режим */ }
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
      extra.appendChild(h('div.t-body', { style: { marginTop: '14px', color: 'var(--gor)' } },
        j.error === 'rejected'
          ? 'Мозг не прошёл проверку двумя пробными боями. Денег за это не берут — валидатор отклонил, значит генерация бесплатна.'
          /*
           * Про лимит говорится ТО, ЧТО ЕСТЬ.
           *
           * Строка обещала «дневной лимит не тронут» безусловно. После того как
           * счётчик стал считать попытки, дошедшие до модели, это стало
           * неправдой для провалов модели — а именно они и случаются чаще
           * всего. Деньги игрок по-прежнему не платит (E5), и это отдельная
           * фраза, потому что это отдельный факт.
           */
          : `Не собралось: ${j.errorMessage || j.error}. Денег не взяли.`
            + (OUR_FAULT.includes(j.error)
              ? ' Это наша поломка — дневной лимит не тронут.'
              : ' Попытка засчитана: модель ответила, и ответ стоил денег.')));
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
    const code = j.stageCode || (j.state === 'queued' ? 'queued' : null);
    let at = code ? STAGES.findIndex(([, codes]) => codes.includes(code)) : -1;
    if (at < 0) at = STAGES.findIndex(([, , re]) => re.test(label));
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
