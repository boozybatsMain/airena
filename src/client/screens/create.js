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
import { loadGrammar, describe } from './kit.js';

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

let chosenPreset = 'keeper';
let chosenBundle = null;

export async function enter(root, args, ctx) {
  root.className = 'on veil';
  document.body.classList.add('overlay');

  const s = ctx.state.session;
  /* D1: гость не запускает генерацию. Стена аккаунта, а не общая ошибка. */
  if (s?.createBlocked === 'guest') { ctx.go('/save'); return; }

  const [catalog] = await Promise.all([get('/api/catalog'), loadGrammar()]);
  chosenBundle = chosenBundle
    || catalog.bundles.find((b) => b.available)?.id
    || null;

  const field = h('textarea.field', {
    rows: 3, maxlength: MAX,
    placeholder: 'акула с острыми зубами, которая чует кровь',
    oninput: () => paintCount(),
    onfocus: () => { document.body.dataset.typing = '1'; },
    onblur: () => { document.body.dataset.typing = '0'; },
  });

  const counter = h('div.t-sub');
  const errBox = h('div');
  const goBtn = h('button.btn.primary', { onclick: submit }, 'СОЗДАТЬ');

  const presets = h('div.cards',
    Object.entries(PRESETS).map(([id, p]) => h(`div.card${id === chosenPreset ? '.on' : ''}`, {
      dataset: { preset: id },
      onclick: () => { chosenPreset = id; repaintPresets(); },
    },
    h('div.hd', p.ru),
    h('div.why', p.why),
    h('div.atoms', p.kit.map((k) => h('span.atom.deliv', axis(k)))),
    h('div.say', p.kit.map((k) => describe(k)).join(' ')))));

  const models = h('div.row', catalog.bundles.slice(0, 6).map((b) => h('button.btn', {
    disabled: !b.available,
    onclick: () => { if (b.available) { chosenBundle = b.id; repaintModels(); } },
    dataset: { bundle: b.id },
    title: b.unavailableReason || '',
    style: {
      borderColor: b.id === chosenBundle ? 'rgba(79,200,220,.55)' : 'rgba(120,180,205,.2)',
      color: b.available ? (b.id === chosenBundle ? '#9fe3f0' : '#c4d8e2') : '#5d6b7a',
    },
  }, b.available ? `${b.label} · ${b.think}` : `${b.label} — ${b.unavailableReason}`)));

  mount(root, h('div.overlay-card',
    h('div.panel.lift', { dataset: { frame: JSON.stringify({ seed: 33 }) } },
      h('div.bg'), h('div.fr'),
      h('div.in',
        h('div.hcut', 'СОЗДАНИЕ СУЩЕСТВА'),
        h('div.t-body', { style: { margin: '10px 0 12px', maxWidth: '52ch' } },
          'Одно предложение. Из него получатся тело, имя и характер боя.'),
        field, counter, errBox,
        h('div.section', h('div.hcut', 'НАБОР УМЕНИЙ · ТРИ НА ВЫБОР'), presets),
        h('div.section', h('div.hcut', 'АВТОР МОЗГА'), models,
          catalog.note ? h('div.t-sub', { style: { marginTop: '8px' } }, catalog.note) : null),
        h('div.row', { style: { marginTop: '26px' } },
          goBtn,
          h('button.btn.ghost.big', { onclick: () => history.back() }, 'НЕ СЕЙЧАС'))))));
  paintFrames(root);
  paintCount();
  track('create_opened', {});

  if (s?.createBlocked === 'free_used') showDeny('free_used');
  if (s?.limits && !s.limits.open) showDeny('budget_day');

  function paintCount() {
    const n = field.value.trim().length;
    goBtn.disabled = n < 3;
    counter.textContent = n === 0
      ? 'Напиши одно предложение — этого достаточно'
      : (n >= MAX ? 'До 280 знаков. Длиннее не станет точнее: в механику превращается смысл, а не объём.'
        : `${n} из ${MAX}`);
    counter.style.color = n >= MAX ? '#e0b34c' : '';
  }

  function repaintPresets() {
    for (const el of presets.children) el.classList.toggle('on', el.dataset.preset === chosenPreset);
  }
  function repaintModels() {
    for (const el of models.children) {
      const on = el.dataset.bundle === chosenBundle;
      el.style.borderColor = on ? 'rgba(79,200,220,.55)' : 'rgba(120,180,205,.2)';
      el.style.color = el.disabled ? '#5d6b7a' : (on ? '#9fe3f0' : '#c4d8e2');
    }
  }

  function showDeny(code, extra = '') {
    clear(errBox);
    errBox.appendChild(h('div.t-body', {
      style: { marginTop: '10px', color: '#f0c08c', borderLeft: '2px solid rgba(224,179,76,.5)', paddingLeft: '12px' },
    }, `${DENY_TEXT[code] || extra || 'Не получилось.'}`));
    goBtn.disabled = code !== 'concurrent';
  }

  async function submit() {
    goBtn.disabled = true;
    clear(errBox);
    const prompt = field.value.trim();
    track('create_submitted', { bundle: chosenBundle, promptChars: prompt.length });
    try {
      const job = await post('/api/creature', { prompt, bundle: chosenBundle, kitPreset: chosenPreset });
      /* Ключ в localStorage: вкладку можно закрыть, и генерацию надо будет
         найти снова — это самое длинное окно первой сессии и окно
         наибольшего отвала. */
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

const axis = (k) => k.delivery;

/** Те же три пресета, что знает сервер. Держатся здесь ради первого кадра. */
const PRESETS = {
  keeper: {
    ru: 'Держит дистанцию', why: 'бьёт издалека и уходит, когда подошли',
    kit: [
      { trigger: 'active', delivery: 'beam', effects: ['damage'], element: 'arc' },
      { trigger: 'on_enemy_cast', delivery: 'blink', effects: ['cleanse'], element: 'void' },
      { trigger: 'active', delivery: 'zone', effects: ['burn'], element: 'ember' },
    ],
  },
  breaker: {
    ru: 'Ломает вблизи', why: 'входит в упор и не даёт разорвать дистанцию',
    kit: [
      { trigger: 'active', delivery: 'cone', effects: ['damage', 'knock'], element: 'kinetic' },
      { trigger: 'active', delivery: 'dash', effects: ['damage'], element: 'kinetic' },
      { trigger: 'on_low_hp', delivery: 'self', effects: ['shield'], element: 'frost' },
    ],
  },
  saboteur: {
    ru: 'Портит чувства', why: 'бьёт по тому, чем противник принимает решения',
    kit: [
      { trigger: 'active', delivery: 'bolt', effects: ['blind'], element: 'void' },
      { trigger: 'on_hit_taken', delivery: 'lob', effects: ['silence'], element: 'arc' },
      { trigger: 'active', delivery: 'cone', effects: ['damage'], element: 'frost' },
    ],
  },
};
