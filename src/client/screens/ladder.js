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
import { h, mount, num, badge, empty, clear } from '../lib/dom.js';
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

/* Состояние — классом, а не инлайновым стилем: инлайн перебивает таблицу
   стилей, и переключатель раздела оставался коробкой при любом правиле. */
const sub = (text, on, onclick) => h(`button.btn.sub${on ? '.on' : ''}`, {
  onclick,
  style: { textTransform: 'uppercase' },
}, text);

async function ladder(body, ctx, topLimit = null) {
  /* `topLimit` приходит только от кнопки «показать всех»: первый заход всегда
     просит десять, потому что вопрос лестницы — «кто сильнейший». */
  const d = await get(topLimit ? `/api/ladder?top=${topLimit}` : '/api/ladder');
  track('ladder_viewed', { rank: d.me?.rank ?? null });

  /* Заголовок — процентиль, а не место. Ровно то, что §10.4 требует. */
  /*
   * ПРОЦЕНТ ЧЕСТЕН ТОЛЬКО ВМЕСТЕ С РАЗМЕРОМ.
   *
   * «Сильнее 100% существ» среди семи игроков и среди семисот — разные
   * утверждения, а выглядят одинаково. Знаменатель едет с сервера и
   * называется вслух: это та же честность, что у бейджа «топ-100», который
   * появляется только при сотне существ.
   */
  if (d.me && d.percentile !== null && d.me.fights >= 20) {
    body.appendChild(h('div.t-name.big', `СИЛЬНЕЕ ${d.percentile}% СУЩЕСТВ`));
    /*
     * ПОДПИСЬ НАЗЫВАЕТ ОБА ЧИСЛА, потому что на экране видны оба.
     *
     * Процент считается по существам игроков, а таблица ниже показывает и
     * эталоны — с местами до двадцать второго. Написать одно число значит
     * противоречить самому себе через два блока: «в лестнице 7» над строкой
     * «#18». Называем оба и говорим, какое к чему.
     */
    body.appendChild(h('div.t-sub', { style: { marginTop: '4px' } },
      d.players
        ? `процент считается по ${num(d.players)} ${plural(d.players, 'существу игроков', 'существам игроков', 'существам игроков')}`
          + (d.total > d.players ? `; в таблице ещё ${num(d.total - d.players)} наших эталонов` : '')
        : `в лестнице ${num(d.total)} ${plural(d.total, 'существо', 'существа', 'существ')}`));
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
    body.appendChild(h('div.t-sub', { style: { marginTop: '10px', color: 'var(--gor)' } },
      /* Число то же, что и выше: существа ИГРОКОВ. Иначе экран называет
         размер лестницы двумя разными числами в двух блоках. */
      `Существ игроков — ${num(d.players ?? d.total)}. Проценты станут честными, когда их станет больше.`));
  }

  /*
   * Объяснение к «ЭТАЛОН» стоит ОДИН РАЗ и рядом с таблицей, а не в подсказке
   * на наведение: строка «1450 · 201 бой · 0% побед» вызывает вопрос сразу, и
   * ответ на него не должен требовать мыши.
   */
  if ((d.top || []).some((r) => r.calibration)) {
    body.appendChild(h('div.t-sub', { style: { marginTop: '6px' } },
      'Существа с меткой ЭТАЛОН — наши, для калибровки. Их рейтинг поставлен '
      + 'при заселении и не меняется от боёв: они должны всё время стоить одного '
      + 'и того же. Счёт побед у них настоящий.'));
  }

  /*
   * ТАБЛИЦА РАСКРЫВАЕТСЯ ДО ВСЕХ, А НЕ ЗАКАНЧИВАЕТСЯ НА ДЕСЯТОМ.
   *
   * Лестница была доской ТОП-10, и это делало недостижимой всю середину: при
   * сорока двух активных существах тридцать с лишним не показывались НИГДЕ.
   * Страница существа открывается только кликом отсюда или из тройки «за кем
   * следить», а тройка сортирует по винрейту — значит существо со слабым
   * счётом не показывалось ни там, ни там, и посмотреть, что с ним не так,
   * было нельзя. Именно с этим и пришёл основатель.
   *
   * Кнопка, а не «всегда всё»: десять строк — это ответ на вопрос «кто
   * сильнейший», и подменять его списком из сорока значит отвечать на другой.
   */
  const full = d.top.length >= (d.total ?? 0);
  body.appendChild(h('div.section',
    h('div.hcut', full ? 'ВСЕ СУЩЕСТВА' : 'ТОП-10'),
    head(),
    d.top.length ? d.top.map((r) => row(r, d.me, ctx)) : empty('ТОП ПУСТ', 'Первые бои ещё идут.'),
    full ? null : h('div.row', { style: { marginTop: '14px' } },
      h('button.btn.ghost', {
        onclick: async (e) => {
          e.target.disabled = true;
          e.target.textContent = 'загружаю…';
          try {
            clear(body);
            await ladder(body, ctx, Math.max(1, d.total || 200));
          } catch {
            e.target.disabled = false;
            e.target.textContent = 'не получилось — ещё раз';
          }
        },
      }, `ПОКАЗАТЬ ВСЕХ${d.total ? ` (${d.total})` : ''}`))));

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
    /* Знак существа красится ЕГО цветом. Цвет вида не бывает: видов нет. */
    h('span', { html: glyphSvg(r.id, { size: 20, color: r.colour || 'var(--fg)' }) }),
    r.name,
    /* «Библиотечное» — не про происхождение, а про то, что его рейтинг
       поставлен для калибровки и не двигается. Иначе строка «1450 · 201 бой ·
       0% побед» читается как заработанное место. */
    r.isLibrary ? badge('ЭТАЛОН', 'warn') : null),
  h('span.num', { title: r.calibration ? 'отметка калибровки: не меняется от боёв' : null },
    r.calibration ? h('span', { style: { opacity: '.62' } }, num(r.rating)) : num(r.rating)),
  h('span.num', num(r.fights)),
  /*
   * ПОД ОДНИМ ЗАГОЛОВКОМ — ОДНА ВЕЛИЧИНА.
   *
   * В окне «рядом с тобой» колонка называется «счёт с тобой», и у соседей там
   * личный счёт («90–0»). А у собственной строки игрока `head2head` пуст —
   * сам с собой он не дрался, — и она падала в запасную ветку и печатала
   * «49%» под тем же заголовком. Две разные величины в одном столбце
   * читаются как одна: «49» рядом с «90–0» выглядит как разгромный счёт.
   *
   * Своя строка теперь ставит прочерк: у неё этой величины нет, и это
   * честнее, чем подставить другую.
   */
  h('span.num', h2h
    ? (r.head2head?.n ? `${r.head2head.w}–${r.head2head.l}` : '—')
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
    /* Места берутся из `prizeBoard`, а не из общей лестницы: в ней стоят и
       наши калибровочные существа, и приз доставался дому. */
    (s.prizes || []).map((p, i) => h('div.trow',
      h('span.rank', String(i + 1)),
      h('span.nm', (d.prizeBoard || [])[i] ? d.prizeBoard[i].name : '—'),
      h('span.num', num(p)), h('span.num', ''), h('span.num', ''))),
    h('div.t-body', { style: { marginTop: '14px', maxWidth: '56ch' } },
      'Коины приходят только отсюда: за победы игра их не начисляет. Это не скупость, а устройство платформы — геймплей не эмитирует валюту.'),
    h('div.t-sub', { style: { marginTop: '8px' } },
      'В призах участвуют существа игроков. Наши калибровочные — те, что с меткой ЭТАЛОН, — стоят в лестнице, но призов не берут.')));
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
