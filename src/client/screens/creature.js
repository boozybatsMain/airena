/**
 * Страница существа — «показать, что это за боец» (§10.3).
 *
 * Чего здесь НЕТ и не будет:
 *  — исходника мозга (F11), ни своего, ни чужого;
 *  — ЛЮБОГО органа управления адаптацией (§7.2а: «Интерфейса адаптации нет»).
 *    Кнопки «Адаптировать» и полосы «до следующей бесплатной адаптации» из
 *    макета preview/creature.html отменены замороженным решением 28.08;
 *  — кнопки рефактора (D19: Q1 закрыт, LLM-рефакторы в v1 не строятся);
 *  — цены. Нигде и ни в каком виде (E6, N1).
 *
 * Что здесь ЕСТЬ и чего не было в §10.3: смена НАБОРА умений. §7.2·2 —
 * замороженное решение: это единственный рычаг игрока с нулевой дисперсией
 * генератора и единственное, что делает проигрыш отчасти его виной.
 */

import { get, post, track } from '../lib/api.js';
import { $, h, mount, clear, num, signed, mmss, ago, badge, empty } from '../lib/dom.js';
import { paintFrames } from '../ui/frames.js';
import { glyphSvg } from '../ui/glyph.js';
import { kitEditor, loadGrammar } from './kit.js';

export async function enter(root, args, ctx) {
  root.className = 'on doc';

  const id = args.id === 'me'
    ? ctx.state.session?.creature?.id
    : args.id;

  if (!id) return renderNoCreature(root, ctx);

  /* Грамматика нужна, чтобы назвать атомы по-русски: без неё карточка
     умений печатает `on_hit_taken`, то есть внутренние имена наружу. */
  const [d] = await Promise.all([get(`/api/creature/${id}`), loadGrammar()]);
  const c = d.creature;
  const mine = c.isMine;

  const head = h('div.row', { style: { alignItems: 'flex-start', gap: '18px' } },
    h('div', { html: glyphSvg(c.id, { size: 64, color: c.archetype === 'gorilla' ? '#e8b077' : '#8fd4e4' }) }),
    h('div.col.gap6',
      h('div.row',
        h(`div.t-name.big${c.archetype === 'gorilla' ? '.or' : ''}`, c.name),
        c.isLibrary ? badge('БИБЛИОТЕЧНОЕ · общее для всех', 'warn') : null,
        /* Бейдж честен только на масштабе: «топ-100» в лестнице из
           девятнадцати существ — это «топ-100 из 19», то есть похвала ни за
           что. §10.4 вводит его как отличие, а не как участие. */
        d.top100 && !c.isLibrary && d.total >= 100 ? badge('ТОП-100', 'ok') : null,
        badge(`ПОКОЛЕНИЕ ${c.adaptations + 1}`)),
      h('div.t-sub', c.model || 'эталон репозитория')));

  const stats = h('div.stats', { style: { marginTop: '20px' } },
    stat(num(c.rating), 'рейтинг'),
    stat(num(c.fights), 'боёв'),
    stat(c.winrate === null ? '—' : `${c.winrate}%`, 'побед'),
    /* §10.4: везде, где хочется написать номер места, пишется процентиль. */
    stat(d.percentile === null ? '—' : `${d.percentile}%`, 'сильнее существ'));

  const body = h('div.sheet', head, stats);

  /* Мало боёв — процентиль ещё ничего не значит, и молчать об этом нельзя. */
  if (c.fights < 20 && !c.isLibrary) {
    body.appendChild(h('div.t-body', { style: { marginTop: '12px', color: '#ddd0ad' } },
      `Ещё мало боёв: ${c.fights} из 20. До двадцати рейтинг гуляет сильнее, чем существо меняется.`));
  }
  if (c.rating <= 620 && !c.isLibrary) {
    body.appendChild(h('div.t-body', { style: { marginTop: '8px' } },
      'Рейтинг у нижней границы. Ниже он не падает — подбор уже даёт более слабых соперников.'));
  }

  if (mine && c.prompt) {
    body.appendChild(h('div.section',
      h('div.hcut', 'ТВОИ СЛОВА'),
      h('div.t-body', { style: { fontStyle: 'italic', color: '#a9bcc8' } }, `«${c.prompt}»`)));
  }

  /* «Не вошло» — §8.1, правило 3. Живёт на странице ВСЕГДА, а не только при
     рождении: это единственное место, где игрок видит, что именно сделали
     его слова, и отсортированный по частоте список этих строк — очередь
     разработки контента по спросу живых игроков. */
  if (mine && c.unfit?.length) {
    body.appendChild(h('div.section',
      h('div.hcut', 'НЕ ВОШЛО'),
      h('div.unfit', c.unfit.map((u) =>
        h('div.ln', h('b', `«${u.phrase}»`), ' — ', u.why)))));
  }

  body.appendChild(h('div.section',
    h('div.hcut', 'УМЕНИЯ'),
    kitEditor(c, d, ctx, mine)));

  if (c.tacticsCard) {
    body.appendChild(h('div.section',
      h('div.hcut', 'КАК ОНО ДЕРЁТСЯ'),
      h('div.t-body', { style: { maxWidth: '66ch' } }, c.tacticsCard)));
  }

  if (mine) body.appendChild(journal(c, d));
  body.appendChild(historyBlock(d, c));

  if (mine) {
    const left = d.nextFightAt ? d.nextFightAt - Date.now() : null;
    body.appendChild(h('div.section', { style: { marginTop: '40px' } },
      h('span.seeking', h('button.btn.primary', { onclick: () => ctx.go('/arena') },
        ctx.state.match ? 'ИДЁТ БОЙ' : 'В БОЙ')),
      h('div.t-sub', { style: { marginTop: '12px' } },
        ctx.state.match ? 'существо на арене прямо сейчас'
          : (left !== null ? `существо ищет бой · следующий через ${mmss(left)}`
            : 'существо ищет бой'))));
  } else if (!ctx.state.session?.creature) {
    body.appendChild(h('div.section', { style: { marginTop: '40px' } },
      h('div.t-body', { style: { maxWidth: '56ch', marginBottom: '14px' } },
        c.isLibrary
          ? 'Оно не сохранится за тобой: библиотечные существа общие для всех гостей. Своё — после первого боя.'
          : 'Это чужое существо. Своё можно сделать после первого боя.'),
      h('button.btn.primary', { onclick: () => ctx.go('/new') }, 'СДЕЛАТЬ СВОЁ')));
  }

  mount(root, body);
  paintFrames(root);
  track('creature_viewed', { creatureId: c.id, mine: mine ? 1 : 0 });
}

const stat = (v, k) => h('div.stat', h('div.v', v), h('div.k', k));

/**
 * Журнал адаптаций. Только чтение: §7.2а не оставляет здесь ни одного
 * органа управления, и это не упущение, а следствие решения.
 */
function journal(c, d) {
  const accepted = (d.adaptations || []).filter((a) => a.accepted);
  const checked = (d.adaptations || []).length;
  const sec = h('div.section',
    h('div.hcut', 'ЖУРНАЛ'),
    h('div.t-body', { style: { marginBottom: '4px' } },
      `${c.adaptations} ${plural(c.adaptations, 'улучшение принято', 'улучшения приняты', 'улучшений принято')}.`
      + ' Каждое сначала дралось со старой версией сто раз.'),
    h('div.t-sub', { style: { marginBottom: '12px' } },
      'Адаптация не может сделать существо хуже: новый мозг принимается, только если выигрывает у старого.'));

  const obs = d.observations;
  if (obs) {
    sec.appendChild(h('div', { style: { margin: '0 0 16px', maxWidth: '360px' } },
      h('div.t-sub', `наблюдений ${obs.have} из ${obs.need} — потом существо попробует себя улучшить`),
      h('div.prog', { style: { marginTop: '6px' } }, h('i', { style: { width: `${Math.round(obs.frac * 100)}%` } }))));
  }

  if (!d.adaptations?.length) {
    sec.appendChild(empty('ПОКА НЕЧЕГО ПОКАЗАТЬ', 'Первое улучшение — после десяти боёв.'));
    return sec;
  }

  for (const a of d.adaptations.filter((x) => x.accepted).slice(0, 8)) {
    sec.appendChild(h(`div.jrow${a.accepted ? '' : '.no'}`,
      h('div.when', ago(a.at)),
      h('div.what', a.summary),
      h('div.score', `${a.score_after} : ${a.score_before}`)));
  }
  const rejected = checked - accepted.length;
  if (rejected > 0) {
    sec.appendChild(h('div.t-sub', { style: { marginTop: '12px' } },
      `Ещё ${rejected} ${plural(rejected, 'кандидат проверен', 'кандидата проверены', 'кандидатов проверены')} и отклонены — старый мозг оказался сильнее.`));
  }
  return sec;
}

function historyBlock(d, c) {
  const sec = h('div.section', h('div.hcut', 'ПОСЛЕДНИЕ БОИ'));
  if (!d.history?.length) {
    sec.appendChild(empty('БОЁВ ЕЩЁ НЕ БЫЛО', 'Первый — в течение минуты после появления существа.'));
    return sec;
  }
  for (const m of d.history.slice(0, 10)) {
    const w = m.outcome === 'win' ? 'победа' : (m.outcome === 'loss' ? 'поражение' : 'ничья');
    sec.appendChild(h('div.jrow',
      h('div.when', ago(m.at)),
      h('div.what', [
        `${w} · ${m.opponent.name}`,
        m.training ? h('span.badge.warn', { style: { marginLeft: '8px' } }, 'ТРЕНИРОВОЧНЫЙ') : null,
      ]),
      h('div.score', { class: m.delta > 0 ? '' : 'no' }, signed(m.delta))));
  }
  return sec;
}

function renderNoCreature(root, ctx) {
  mount(root, h('div.sheet.narrow',
    empty('У ТЕБЯ ПОКА НЕТ СВОЕГО',
      ctx.state.session?.guest
        ? 'Библиотечное существо дерётся на арене прямо сейчас — оно общее для всех гостей. Своё создаётся на аккаунте.'
        : 'Существо создаётся из одного предложения. Оно будет драться само, раз в минуту, даже когда вкладка закрыта.',
      h('button.btn.primary', { onclick: () => ctx.go('/new') }, 'СДЕЛАТЬ СВОЁ'))));
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
