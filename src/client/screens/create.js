/**
 * Создание существа — «одно текстовое поле + выбор набора» (§10.3).
 *
 * Чего здесь нет по списку §10.3: слайдеров статов и классов. Чего нет по
 * §4: редактора мозга (N10), импорта кода (N20), кнопки генерации без всех
 * шести лимитов (N12), платной модели (E6).
 *
 * Экран — СЛОЙ поверх идущего боя, а не страница: §10.3 требует, чтобы
 * ожидание занимал чужой бой, и арена под этим слоем не останавливается.
 */

import { get, post, track } from '../lib/api.js';
import { h, mount, clear, empty } from '../lib/dom.js';
import { paintFrames } from '../ui/frames.js';

const MAX = 280;

/** Причины отказа лимитов — восемь кодов, восемь честных текстов. */
const DENY_TEXT = {
  guest: 'Своё существо создаётся на аккаунте. Библиотечное доступно прямо сейчас.',
  free_used: 'Бесплатное существо на этом аккаунте уже создано. Второе появится, когда откроем платных авторов — сейчас их нет.',
  account_day: 'На сегодня лимит генераций исчерпан. Откроется в 00:00 UTC.',
  account_month: 'Лимит генераций на месяц исчерпан.',
  budget_day: 'Сегодня генерации закончились: дневной бюджет игры исчерпан. Откроется в 00:00 UTC. Библиотечное существо работает прямо сейчас.',
  concurrent: 'Прямо сейчас идёт слишком много генераций. Попробуй через минуту.',
  request_cost: 'Эта модель не помещается в предохранитель по стоимости запроса.',
  not_free: 'Платежи платформы ещё не включены — платных авторов пока нет.',
  internal: 'Проверка лимитов не отработала. Мы не запускаем генерацию, когда не уверены, что сможем за неё заплатить.',
  short_prompt: 'Напиши одно предложение — этого достаточно.',
};

let chosenBundle = null;

export async function enter(root, args, ctx) {
  root.className = 'on veil';
  document.body.classList.add('overlay');

  const s = ctx.state.session;
  /*
   * Гость видит экран ЦЕЛИКОМ и упирается в стену на «СОЗДАТЬ», а не на входе.
   *
   * Раньше он выбрасывался отсюда до первой отрисовки — и §10.5 терял свой
   * сороковой секунды: «одно поле и выбор набора» гость не видел ни разу,
   * то есть шаг воронки, на котором держится метрика «посетитель → создал
   * существо ≥25%», не существовал.
   *
   * D1 при этом не двигается ни на шаг: генерация гостю по-прежнему
   * недоступна, потому что она стоит живые деньги, а гостевой аккаунт
   * заводится бесконечно. Меняется только МОМЕНТ отказа — с «до того, как
   * ты что-то выбрал» на «когда ты выбрал и нажал».
   */
  const guest = s?.createBlocked === 'guest';

  const catalog = await get('/api/catalog');
  /*
   * УМОЛЧАНИЕ — САМЫЙ БЫСТРЫЙ АВТОР, А НЕ ПЕРВЫЙ В СПИСКЕ.
   *
   * Здесь стояло `find((b) => b.available)`, то есть первый доступный. Список
   * приходит отсортированным ПО ЦЕНЕ, и первым оказывается самый дешёвый —
   * он же самый долгий, потому что дешевизна берётся размышлением и
   * переделками. Игрок нажимал «Создать» и уходил ждать, ни разу не выбрав
   * это сам; ровно это и выглядело как «создание не работает».
   *
   * Порядок списка не трогаем — цена в нём осмысленна. Меняется только то,
   * что выбрано заранее.
   */
  chosenBundle = chosenBundle
    || pickFastest(catalog.bundles)?.id
    || null;

  /* Черновик, переживший стену аккаунта. */
  let draft = {};
  try { draft = JSON.parse(localStorage.getItem('airena.draft') || '{}'); } catch { draft = {}; }
  if (draft.bundle) chosenBundle = draft.bundle;

  const field = h('textarea.field', {
    rows: 3, maxlength: MAX,
    value: draft.prompt || '',
    placeholder: 'акула с острыми зубами, которая чует кровь',
    oninput: () => { paintCount(); keepDraft(); },
    onfocus: () => { document.body.dataset.typing = '1'; },
    onblur: () => { document.body.dataset.typing = '0'; },
  });

  /*
   * ЧЕРНОВИК СОХРАНЯЕТСЯ ПО ВВОДУ, А НЕ ПО НАЖАТИЮ КНОПКИ.
   *
   * Раньше текст уезжал в localStorage только внутри `submit`. То есть
   * переживал он ровно один сценарий — «написал, нажал, упёрся в стену».
   * А человек, который написал две строки и перешёл на вкладку арены
   * посмотреть, что тут вообще происходит, возвращался к пустому полю. Это
   * самая дорогая строка, которую игрок печатает за всю сессию, и терять её
   * за переключение вкладки нельзя.
   *
   * Пишем не чаще раза в полсекунды: поле маленькое, но дёргать хранилище на
   * каждый символ незачем.
   */
  let draftTimer = null;
  function keepDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        const prompt = field.value.trim();
        if (prompt) {
          localStorage.setItem('airena.draft', JSON.stringify({ prompt, bundle: chosenBundle }));
        }
      } catch { /* приватный режим — черновик просто не сохранится */ }
    }, 500);
  }

  const counter = h('div.t-sub');
  const errBox = h('div');
  const goBtn = h('button.btn.primary', { onclick: submit }, guest ? 'СОЗДАТЬ СВОЁ' : 'СОЗДАТЬ');

  /*
   * ВСЕ СВЯЗКИ, А НЕ ПЕРВЫЕ ШЕСТЬ.
   *
   * `slice(0, 6)` держался, пока каталог был из четырёх строк. С появлением
   * канала подписки (D164) их стало восемь, и обрезка съедала ровно то, что
   * основатель просил добавить: Fable не показывался вовсе, потому что стоял
   * седьмым. Обрезка списка, длина которого зависит от каталога, — это
   * молчаливая потеря; каталог короткий по построению (белый список семей),
   * и обрезать его незачем.
   */
  const models = h('div.row', catalog.bundles.map((b) => h('button.btn', {
    disabled: !b.available,
    onclick: () => { if (b.available) { chosenBundle = b.id; repaintModels(); keepDraft(); } },
    dataset: { bundle: b.id },
    title: b.unavailableReason || '',
    style: {
      borderColor: b.id === chosenBundle ? 'rgba(79,200,220,.55)' : 'rgba(120,180,205,.2)',
      color: b.available ? (b.id === chosenBundle ? 'var(--oct)' : 'var(--ink)') : 'var(--dim)',
    },
  }, b.available ? `${b.label} · ${b.think}${waitLabel(b)}` : `${b.label} — ${b.unavailableReason}`)));

  mount(root, h('div.overlay-card',
    h('div.panel.lift', { dataset: { frame: JSON.stringify({ seed: 33 }) } },
      h('div.bg'), h('div.fr'),
      h('div.in',
        h('div.hcut', 'СОЗДАНИЕ СУЩЕСТВА'),
        h('div.t-body', { style: { margin: '10px 0 12px', maxWidth: '52ch' } },
          'Одно предложение. Из него получатся тело, имя, размер и три умения — '
          + 'всё следует из описания, выбирать ничего не надо.'),
        field, counter, errBox,
        h('div.section', h('div.hcut', 'АВТОР МОЗГА'), models,
          catalog.note ? h('div.t-sub', { style: { marginTop: '8px' } }, catalog.note) : null),
        h('div.row', { style: { marginTop: '26px' } },
          goBtn,
          h('button.btn.ghost.big', { onclick: () => history.back() }, 'НЕ СЕЙЧАС'))))));
  paintFrames(root);
  paintCount();
  track('create_opened', {});

  if (guest) {
    counter.textContent = 'Существо создаётся на аккаунте — спросим один раз, на кнопке.';
  }
  if (s?.createBlocked === 'free_used') showDeny('free_used');
  if (s?.limits && !s.limits.open) showDeny('budget_day');

  function paintCount() {
    const n = field.value.trim().length;
    goBtn.disabled = n < 3;
    counter.textContent = n === 0
      ? 'Напиши одно предложение — этого достаточно'
      : (n >= MAX ? 'До 280 знаков. Длиннее не станет точнее: в механику превращается смысл, а не объём.'
        : `${n} из ${MAX}`);
    counter.style.color = n >= MAX ? 'var(--warn)' : '';
  }

  function repaintModels() {
    for (const el of models.children) {
      const on = el.dataset.bundle === chosenBundle;
      el.style.borderColor = on ? 'rgba(79,200,220,.55)' : 'rgba(120,180,205,.2)';
      el.style.color = el.disabled ? 'var(--dim)' : (on ? 'var(--oct)' : 'var(--ink)');
    }
  }

  function showDeny(code, extra = '') {
    clear(errBox);
    errBox.appendChild(h('div.t-body', {
      style: { marginTop: '10px', color: 'var(--gor)', borderLeft: '2px solid rgba(224,179,76,.5)', paddingLeft: '12px' },
    }, `${DENY_TEXT[code] || extra || 'Не получилось.'}`));
    goBtn.disabled = code !== 'concurrent';
  }

  async function submit() {
    const prompt = field.value.trim();
    if (guest) {
      /* То, что игрок уже написал и выбрал, переживает стену: возвращаться
         и печатать заново — худший способ отпраздновать регистрацию. */
      clearTimeout(draftTimer);
      try {
        localStorage.setItem('airena.draft', JSON.stringify({ prompt, bundle: chosenBundle }));
      } catch { /* приватный режим — черновик просто не сохранится */ }
      ctx.go('/save');
      return;
    }
    goBtn.disabled = true;
    clear(errBox);
    track('create_submitted', { bundle: chosenBundle, promptChars: prompt.length });
    try {
      const job = await post('/api/creature', { prompt, bundle: chosenBundle });
      /* Ключ в localStorage: вкладку можно закрыть, и генерацию надо будет
         найти снова — это самое длинное окно первой сессии и окно
         наибольшего отвала. */
      /*
       * ЧЕРНОВИК СТИРАЕТСЯ ПРИ РОЖДЕНИИ СУЩЕСТВА, А НЕ ПРИ СОЗДАНИИ ЗАДАНИЯ.
       *
       * Здесь он стирался сразу. Дальше генерация могла упасть — «мозг не
       * собрался даже на запасной модели», — игрок жал «попробовать ещё» и
       * получал ПУСТОЕ поле с выключенной кнопкой. Самая дорогая строка
       * сессии терялась ровно в тот момент, когда её надо было предложить
       * заново, а плейсхолдер совпадает с примером, так что поле ещё и
       * выглядело заполненным.
       *
       * Теперь черновик снимает экран ожидания, когда существо родилось.
       */
      try { localStorage.setItem('airena.job', job.id); } catch { /* приватный режим */ }
      ctx.go(`/new/${job.id}`);
    } catch (e) {
      showDeny(e.code, e.message);
      goBtn.disabled = false;
    }
  }
}

export function leave() {
  document.body.classList.remove('overlay');
  document.body.dataset.typing = '0';
}

/*
 * Здесь стояли три карточки набора, их русские подписи и копия серверных
 * пресетов. Всё снято 31.08: умения следуют из описания, выбирать нечего.
 * Копия пресетов была долгом (она уже расходилась с сервером однажды, D30) —
 * долг закрыт удалением, а не ещё одной сверкой. `tools/checkgrammar.mjs`
 * теперь следит, чтобы копия не вернулась.
 */

/**
 * Самый быстрый из доступных.
 *
 * Замеренное время (`secs`) приходит с сервера и есть не у всех связок.
 * Незамеренные не выигрывают по умолчанию — про них ничего не известно, и
 * ставить игроку неизвестное вперёд известного нечестно. Если замеренных нет
 * вовсе, поведение прежнее: первый доступный.
 */
function pickFastest(bundles) {
  const free = bundles.filter((b) => b.available);
  const timed = free.filter((b) => typeof b.secs === 'number');
  if (!timed.length) return free[0] || null;
  return timed.reduce((a, b) => (b.secs < a.secs ? b : a));
}

/**
 * Сколько ждать — словами, рядом с автором.
 *
 * Игрок не обязан догадываться, что «дешевле» значит «дольше в пять раз».
 * Число замерено; у незамеренной связки подписи нет, потому что выдумывать
 * ожидание хуже, чем промолчать.
 */
function waitLabel(b) {
  if (typeof b.secs !== 'number') return '';
  const m = Math.round(b.secs / 60);
  return m <= 1 ? ' · около минуты' : ` · ~${m} мин`;
}
