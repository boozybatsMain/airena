/**
 * Лестница — «где я» (§10.3), и три секции внутри одной вкладки.
 *
 * §10.4 задаёт форму, и она не про эстетику: таблица строится ОТ ИГРОКА.
 * Аркадный столбик «1-е, 2-е, 3-е…» на тысячу строк запрещён как форма.
 * Показывается ровно три вещи: топ-10 (единственный кусок глобального
 * списка), окно вокруг своей строки с личным счётом против каждого соседа,
 * и процентиль — «сильнее 73% существ» — везде, где хочется написать номер.
 *
 * Номер места допустим только внутри топ-10 и внутри своего окна: там он
 * означает «кто стоит рядом», а не «какой ты по счёту в мире».
 */

import { get, track } from '../lib/api.js';
import { h, mount, num, badge, empty } from '../lib/dom.js';
import { glyphSvg } from '../ui/glyph.js';

export async function enter(root, args, ctx) {
  root.className = 'on doc';
  const section = args.section || 'ladder';

  const tabs = h('div.row', { style: { marginBottom: '22px' } },
    sub('Лестница', section === 'ladder', () => ctx.go('/ladder')),
    sub('Модели', section === 'models', () => ctx.go('/ladder/models')),
    sub('Сезон', section === 'season', () => ctx.go('/ladder/season')));

  const body = h('div.sheet', tabs);
  mount(root, body);

  if (section === 'models') return models(body);
  if (section === 'season') return season(body, ctx);
  return ladder(body, ctx);
}

const sub = (text, on, onclick) => h('button.btn', {
  onclick,
  style: {
    background: on ? 'rgba(79,200,220,.12)' : 'transparent',
    borderColor: on ? 'rgba(79,200,220,.5)' : 'rgba(120,180,205,.18)',
    color: on ? '#9fe3f0' : '#8194a3',
    letterSpacing: '.12em', textTransform: 'uppercase',
  },
}, text);

async function ladder(body, ctx) {
  const d = await get('/api/ladder');
  track('ladder_viewed', { rank: d.me?.rank ?? null });

  /* Заголовок — процентиль, а не место. Ровно то, что §10.4 требует. */
  if (d.me && d.percentile !== null && d.me.fights >= 20) {
    body.appendChild(h('div.t-name.big', `СИЛЬНЕЕ ${d.percentile}% СУЩЕСТВ`));
    body.appendChild(h('div.t-sub', { style: { marginTop: '4px' } },
      `в лестнице ${num(d.total)} ${plural(d.total, 'существо', 'существа', 'существ')}`));
  } else if (d.me) {
    body.appendChild(h('div.t-name.big', 'ЕЩЁ МАЛО БОЁВ'));
    body.appendChild(h('div.t-body', { style: { marginTop: '6px', maxWidth: '52ch' } },
      `${d.me.fights} из 20. До двадцати боёв место ничего не значит: один матч — это лотерея с разбросом в тридцать семь пунктов, и лестница показывала бы её, а не силу.`));
  } else {
    body.appendChild(h('div.t-name.big', 'ЛЕСТНИЦА'));
    body.appendChild(h('div.t-body', { style: { marginTop: '6px', maxWidth: '52ch' } },
      ctx.state.session?.guest
        ? 'У библиотечного существа нет своей строки: оно общее для всех гостей.'
        : 'Своей строки пока нет — она появится вместе с существом.'));
  }

  if (d.total < 40) {
    body.appendChild(h('div.t-sub', { style: { marginTop: '10px', color: '#ddd0ad' } },
      `В лестнице ${num(d.total)} ${plural(d.total, 'существо', 'существа', 'существ')}. Проценты станут честными, когда их станет больше.`));
  }

  body.appendChild(h('div.section',
    h('div.hcut', 'ТОП-10'),
    head(),
    d.top.length ? d.top.map((r) => row(r, d.me, ctx)) : empty('ТОП ПУСТ', 'Первые бои ещё идут.')));

  if (d.around?.length > 1) {
    body.appendChild(h('div.section',
      h('div.hcut', 'ТВОЁ ОКНО'),
      head(true),
      d.around.map((r) => row(r, d.me, ctx, true))));
  }
}

const head = (h2h = false) => h('div.trow.head',
  h('span', '#'), h('span', 'существо'), h('span.num', 'рейтинг'),
  h('span.num', 'боёв'), h('span.num', h2h ? 'счёт с тобой' : 'побед'));

function row(r, me, ctx, h2h = false) {
  const isMe = me && r.id === me.id;
  return h(`div.trow${isMe ? '.me' : ''}`, {
    onclick: () => ctx.go(`/creature/${r.id}`),
    style: { cursor: 'pointer' },
  },
  h('span.rank', String(r.rank ?? '—')),
  h('span.nm', { style: { display: 'flex', alignItems: 'center', gap: '9px' } },
    h('span', { html: glyphSvg(r.id, { size: 20, color: r.archetype === 'gorilla' ? '#e8b077' : '#8fd4e4' }) }),
    r.name,
    r.isLibrary ? badge('БИБЛ.', 'warn') : null),
  h('span.num', num(r.rating)),
  h('span.num', num(r.fights)),
  h('span.num', h2h && r.head2head
    ? (r.head2head.n ? `${r.head2head.w}–${r.head2head.l}` : '—')
    : (r.winrate === null ? '—' : `${r.winrate}%`)));
}

async function models(body) {
  const d = await get('/api/models');
  body.appendChild(h('div.t-name.big', 'КАКАЯ НЕЙРОСЕТЬ СИЛЬНЕЕ'));
  body.appendChild(h('div.t-body', { style: { marginTop: '6px', maxWidth: '56ch' } },
    'Зачёт конструкторов при зачёте пилотов: винрейт существ, сгруппированный по модели, которая написала им мозг.'));

  if (d.smallSample) {
    /* §10.4: до порога таблица ПОКАЗЫВАЕТСЯ с пометкой, а не прячется.
       Спрятанная читается как «мы не знаем», помеченная — как «мы знаем,
       сколько именно знаем». */
    body.appendChild(h('div', { style: { marginTop: '14px' } },
      badge(`ВЫБОРКА МАЛА: ${d.have} ИЗ ${d.need}`, 'warn')));
    body.appendChild(h('div.t-sub', { style: { marginTop: '6px' } }, 'Это показания, а не вывод.'));
  }

  body.appendChild(h('div.section',
    h('div.trow.head', h('span', ''), h('span', 'модель'), h('span.num', 'существ'),
      h('span.num', 'боёв'), h('span.num', '% побед')),
    d.rows.length
      ? d.rows.map((r) => h('div.trow',
        h('span.rank', ''), h('span.nm', r.model), h('span.num', num(r.creatures)),
        h('span.num', num(r.fights)), h('span.num', r.winrate === null ? '—' : `${r.winrate}%`)))
      : empty('ПОКА НИ ОДНОГО СУЩЕСТВА ОТ МОДЕЛЕЙ',
        'Таблица заполнится, когда игроки начнут создавать существ.')));

  body.appendChild(h('div.t-sub', { style: { marginTop: '16px' } },
    'Данные текущего сезона. На смене констант счёт начинается заново.'));
}

async function season(body, ctx) {
  const d = await get('/api/ladder');
  const s = d.seasonMeta || { n: 1, prizeCoins: 4500, prizes: [] };
  const left = s.endsAt ? s.endsAt - Date.now() : null;

  body.appendChild(h('div.t-name.big', `СЕЗОН ${s.n}`));
  body.appendChild(h('div.t-body', { style: { marginTop: '6px' } },
    left === null ? 'Дата окончания ещё не назначена.'
      : (left > 0 ? `До конца ${Math.ceil(left / 864e5)} ${plural(Math.ceil(left / 864e5), 'день', 'дня', 'дней')}.`
        : 'Сезон закончен, топ-10 заморожен.')));

  body.appendChild(h('div.section',
    h('div.hcut', 'ПРИЗОВОЙ ФОНД'),
    h('div.trow.head', h('span', '#'), h('span', 'место'), h('span.num', 'коинов'), h('span.num', ''), h('span.num', '')),
    (s.prizes || []).map((p, i) => h('div.trow',
      h('span.rank', String(i + 1)),
      h('span.nm', d.top[i] ? d.top[i].name : '—'),
      h('span.num', num(p)), h('span.num', ''), h('span.num', ''))),
    h('div.t-body', { style: { marginTop: '14px', maxWidth: '56ch' } },
      'Коины приходят только отсюда: за победы игра их не начисляет. Это не скупость, а устройство платформы — геймплей не эмитирует валюту.')));
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
