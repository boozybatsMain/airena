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
import { $, h, mount, clear, num, signed, waitLabel, ago, badge, empty } from '../lib/dom.js';
import { paintFrames } from '../ui/frames.js';
import { pickStarter } from './arena.js';
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
    /* Свой цвет существа. Не назван — нейтральный: выдумывать за него цвет
       вида нельзя, потому что видов нет. */
    h('div', { html: glyphSvg(c.id, { size: 64, color: c.colour || 'var(--fg)' }) }),
    h('div.col.gap6',
      h('div.row',
        h('div.t-name.big', { style: c.colour ? { color: c.colour } : null }, c.name),
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
    /* Процент без знаменателя — половина утверждения: «сильнее 33%» из семи и
       из семисот выглядит одинаково. D83 назвал знаменатель на лестнице; сюда
       та же починка не доехала, и одна величина на двух экранах жила по
       разным правилам. */
    stat(d.percentile === null ? '—' : `${d.percentile}%`,
      d.players ? `сильнее существ · из ${d.players}` : 'сильнее существ'));

  const body = h('div.sheet', head, stats);

  /* Мало боёв — процентиль ещё ничего не значит, и молчать об этом нельзя. */
  if (c.fights < 20 && !c.isLibrary) {
    body.appendChild(h('div.t-body', { style: { marginTop: '12px', color: 'var(--gor)' } },
      `Ещё мало боёв: ${c.fights} из 20. До двадцати рейтинг гуляет сильнее, чем существо меняется.`));
  }
  if (c.rating <= 620 && !c.isLibrary) {
    body.appendChild(h('div.t-body', { style: { marginTop: '8px' } },
      'Рейтинг у нижней границы. Ниже он не падает — подбор уже даёт более слабых соперников.'));
  }

  if (mine && c.prompt) {
    body.appendChild(h('div.section',
      h('div.hcut', 'ТВОИ СЛОВА'),
      h('div.t-body', { style: { fontStyle: 'italic', color: 'var(--oct)' } }, `«${c.prompt}»`)));
  }

  /* «Не вошло» — §8.1, правило 3. Живёт на странице ВСЕГДА, а не только при
     рождении: это единственное место, где игрок видит, что именно сделали
     его слова, и отсортированный по частоте список этих строк — очередь
     разработки контента по спросу живых игроков. */
  /*
   * §5.1: ПОДМЕНА НАЗЫВАЕТСЯ ВСЛУХ.
   *
   * Конвейер собирал эти строки — «Fable не справилась, существо сделала
   * Gemini», «тело не собралось» — и они уезжали ровно в одно место: в поле
   * `fallback: 1` события аналитики. Игрок, у которого упало тело, получал
   * тело архетипа и ноль объяснений; игрок, выбравший модель, получал другую
   * и узнавал об этом только по строке модели на карточке.
   *
   * Показывается ВСЕМ, а не только владельцу: «носит тело архетипа» — это про
   * то, что зритель видит на арене, а не тайна владельца.
   */
  if (c.birthNote?.length) {
    body.appendChild(h('div.section',
      h('div.hcut', 'ПРИ РОЖДЕНИИ'),
      h('div.unfit', c.birthNote.map((n) => h('div.ln',
        n.kind === 'fallback'
          ? `${n.from} не справилась — существо сделала ${n.to}. Денег за отказ не брали.`
          : (n.kind === 'body_fallback'
            ? `Тело ${n.from} не нарисовала — его сделала ${n.to}. Денег за отказ не брали.`
            : (n.kind === 'body_failed'
            ? 'Тело не нарисовалось: существо носит тело своего архетипа. Всё остальное — своё.'
            : (n.kind === 'kit_unviable'
              ? `Набор проверен боем: ${n.message}. Умения можно поменять — это мгновенно и бесплатно.`
              : (n.message || 'что-то пошло не так')))))))));
  }

  if (mine && c.unfit?.length) {
    body.appendChild(h('div.section',
      h('div.hcut', 'НЕ ВОШЛО'),
      h('div.unfit', c.unfit.map((u) =>
        h('div.ln', h('b', `«${u.phrase}»`), ' — ', u.why)))));
  }

  /*
   * ССЫЛКА НА СУЩЕСТВО — ЭТО ПРОДУКТ, А НЕ УДОБСТВО.
   *
   * Страница существа и так открыта любому: `/api/creature/:id` владения не
   * проверяет, гостю заводится сессия на месте. То есть поделиться было МОЖНО
   * с самого начала — и неоткуда: ни кнопки, ни адреса на виду, а сам адрес
   * лежит за решёткой (`#/creature/<id>`) и руками не набирается.
   *
   * Копируем абсолютный адрес вместе с origin: относительная ссылка в чужом
   * мессенджере не ссылка.
   *
   * Буфер обмена может быть закрыт — во фрейме без разрешения он молча
   * отказывает. Тогда показываем адрес текстом и выделяем его сами: человек
   * жмёт copy и всё равно уходит со ссылкой. Форму не заводим — A6 запрещает
   * формы на встроенной поверхности, и обойти запрет ради удобства нельзя.
   */
  if (mine) {
    const out = h('div.t-sub', { style: { marginTop: '10px' } });
    body.appendChild(h('div.section',
      h('div.hcut', 'ПОКАЗАТЬ ДРУГИМ'),
      h('div.t-body', { style: { maxWidth: '58ch' } },
        'По этой ссылке любой откроет твоё существо и сможет смотреть его бои — аккаунт для этого не нужен.'),
      h('div.row', { style: { marginTop: '12px' } },
        h('button.btn.primary', {
          onclick: async (e) => {
            const url = `${location.origin}${location.pathname}${location.search}#/creature/${c.id}`;
            try {
              await navigator.clipboard.writeText(url);
              e.target.textContent = 'СКОПИРОВАНО';
              setTimeout(() => { e.target.textContent = 'СКОПИРОВАТЬ ССЫЛКУ'; }, 1800);
              clear(out);
            } catch {
              clear(out);
              const span = h('span', { style: { userSelect: 'all', color: 'var(--oct)', wordBreak: 'break-all' } }, url);
              out.appendChild(h('span', 'буфер закрыт — вот адрес: '));
              out.appendChild(span);
              try {
                const r = document.createRange(); r.selectNodeContents(span);
                const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
              } catch { /* выделение — удобство, не обязанность */ }
            }
          },
        }, 'СКОПИРОВАТЬ ССЫЛКУ')),
      out));
  }

  if (!mine) {
    /*
     * «СМОТРЕТЬ ЕГО БОИ» — ОТВЕТ НА ВОПРОС, КОТОРОГО НЕ БЫЛО ГДЕ ЗАДАТЬ.
     *
     * Следить за библиотечным существом можно было ровно одним способом:
     * выбрать его из тройки на вкладке «Существо». Тройка отбирается по
     * винрейту, поэтому только что созданное существо в неё не попадает —
     * у него ноль боёв, — и посмотреть на него было нельзя вообще никак,
     * хотя оно дерётся на арене прямо сейчас.
     *
     * Делает ровно то же, что карточка тройки, и той же парой действий:
     * запоминает выбор (иначе он не переживёт возврат на арену — см. D2 и
     * шапку `pickStarter`) и переподписывает сокет.
     */
    body.appendChild(h('div.row', { style: { marginTop: '18px' } },
      h('button.btn.primary', {
        onclick: () => {
          try { localStorage.setItem('airena.starter', c.id); } catch { /* приватный режим */ }
          try { window.__airenaSend?.({ cmd: 'watch', creatureId: c.id }); } catch { /* сокета нет */ }
          ctx.go('/arena');
        },
      }, 'СМОТРЕТЬ ЕГО БОИ')));
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
  body.appendChild(historyBlock(d, c, ctx, mine));

  if (mine) {
    /*
     * ОТСЧЁТ СЧИТАЕТСЯ ОТ ОТНОСИТЕЛЬНОГО ЧИСЛА, А НЕ ОТ ЧАСОВ СЕРВЕРА.
     *
     * Здесь стояло `d.nextFightAt - Date.now()` — разность двух РАЗНЫХ часов.
     * Ровно тот перекос, ради которого сервер отдаёт `nextFightIn`; на
     * `/api/session` его уже применяют, а этот экран остался на старом пути.
     */
    const left = d.nextFightIn != null ? d.nextFightIn
      : (d.nextFightAt ? d.nextFightAt - Date.now() : null);
    /*
     * «ИДЁТ БОЙ» — ПРО ЭТО СУЩЕСТВО, А НЕ ПРО ЛЮБУЮ ТРАНСЛЯЦИЮ.
     *
     * Здесь стояло `ctx.state.match ? …`, то есть «идёт ли хоть какой-нибудь
     * бой». На арене почти всегда идёт чужой — сокет по умолчанию отдаёт
     * витринный, — и страница уверенно сообщала «существо на арене прямо
     * сейчас», пока дрались двое других. Данные для честной проверки лежат в
     * том же объекте (`match.ids`), и `result.js` эту проверку уже делает.
     */
    /* Сервер знает точнее клиента: `fightingNow` считается по резерву боя, а
       не по тому, какую трансляцию сейчас показывает сокет. Признак с экрана
       остаётся запасным для старых ответов. */
    const ids = ctx.state.match?.ids;
    const fighting = d.fightingNow ?? (!!ids && (ids.blue === c.id || ids.orange === c.id));
    body.appendChild(h('div.section', { style: { marginTop: '40px' } },
      h('span.seeking', h('button.btn.primary', { onclick: () => ctx.go('/arena') },
        fighting ? 'ИДЁТ БОЙ' : 'В БОЙ')),
      h('div.t-sub', { style: { marginTop: '12px' } },
        fighting ? 'существо на арене прямо сейчас'
          : (d.noOpponent
            /* Лестница мала или все соседи заняты. Молчать нельзя: экран
               обещал бы бой через пять секунд и не дал бы его ни разу. */
            ? 'свободного соперника пока нет — как только кто-то освободится, бой начнётся'
            : (left !== null ? `существо отдыхает · следующий бой через ${waitLabel(left)}`
              : 'существо ищет бой')))));
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
  const sec = h('div.section',
    h('div.hcut', 'ЖУРНАЛ'),
    h('div.t-body', { style: { marginBottom: '4px' } },
      `${c.adaptations} ${plural(c.adaptations, 'улучшение принято', 'улучшения приняты', 'улучшений принято')}.`
      /* Число боёв не выдумывается: строки ниже показывают настоящее «N из M»,
         и «сто раз» им противоречило — там 96, 64, 48. Обещать круглое число
         там, где рядом напечатано настоящее, — это подрыв доверия к обоим. */
      + ' Каждое сначала проверялось десятками боёв против прежней версии.'),
    h('div.t-sub', { style: { marginBottom: '12px' } },
      'Адаптация не может сделать существо хуже: новый мозг принимается, только если выигрывает у старого.'));

  const obs = d.observations;
  if (obs) {
    sec.appendChild(h('div', { style: { margin: '0 0 16px', maxWidth: '360px' } },
      /* Очередь показывается отдельной фразой, а не подменяет числитель:
         «587 из 10» — это не полная шкала, это сломанная шкала. */
      /* Полная шкала не значит «сейчас станет лучше»: существо пробует и
         оставляет только то, что выигрывает у старого. Обещать улучшение,
         которого может не быть, — тот же обман, что «587 из 10». */
      /*
       * Подпись говорит про то же, что и шкала: сколько боёв до следующей
       * ПОПЫТКИ. Раньше она обещала «материала хватает» почти всегда, потому
       * что шкала считала не то (см. `observationsOf`), — и обещание
       * «существо возьмётся за себя» звучало после каждого боя, а сбывалось
       * раз в двести.
       */
      h('div.t-sub', obs.full
        ? `следующий бой — попытка переписать себя${d.adaptTries ? ` · уже пробовало ${d.adaptTries} раз, оставило ${d.creature.adaptations}` : ''}`
        : `${obs.have} из ${obs.need} боёв до следующей попытки${d.adaptTries ? ` · пробовало ${d.adaptTries}, оставило ${d.creature.adaptations}` : ''}`),
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
  /*
   * ОТКЛОНЁННЫЕ СЧИТАЮТСЯ ПО ПОЛНОЙ ТАБЛИЦЕ, А НЕ ПО ОКНУ.
   *
   * Здесь стояло «длина списка минус принятые в нём». Список приходит
   * усечённым (последние 12), поэтому существо, отклонившее 53 кандидата,
   * рапортовало о четырёх. Причём ошибка занижала ровно ту цифру, ради
   * которой строка написана: отбор выглядит серьёзным при пятидесяти
   * проверенных и случайным при четырёх.
   */
  const rejected = Math.max(0, (d.adaptTries ?? 0) - (c.adaptations ?? accepted.length));
  if (rejected > 0) {
    sec.appendChild(h('div.t-sub', { style: { marginTop: '12px' } },
      `Ещё ${rejected} ${plural(rejected, 'кандидат проверен', 'кандидата проверены', 'кандидатов проверены')} и отклонены — старый мозг оказался сильнее.`));
  }
  /* Список принятых тоже окно: сказать про это честнее, чем молча показать
     восемь из двадцати и дать думать, что их всего восемь. */
  if ((c.adaptations ?? 0) > accepted.slice(0, 8).length) {
    sec.appendChild(h('div.t-sub', { style: { marginTop: '4px' } },
      `Показаны последние ${accepted.slice(0, 8).length} из ${c.adaptations} принятых.`));
  }
  return sec;
}

function historyBlock(d, c, ctx, mine) {
  const sec = h('div.section', h('div.hcut', 'ПОСЛЕДНИЕ БОИ'));
  /*
   * СТРОКА ИСТОРИИ — ССЫЛКА НА БОЙ, А НЕ ЗАПИСЬ О НЁМ.
   *
   * Здесь лежал список исходов, и открыть из него было нечего: чтобы
   * посмотреть бой конкретного существа, надо было знать `matchId` и набрать
   * адрес руками. То есть повтор боя существовал (`#/watch/<id>`, экран
   * `watch.js`), а дойти до него из продукта было нельзя ниоткуда.
   *
   * `id` матча приезжает в этом же ответе с самого начала (`history()` в
   * creatures.js кладёт его первым полем) — не хватало только клика.
   */
  if (!d.history?.length) {
    sec.appendChild(empty('БОЁВ ЕЩЁ НЕ БЫЛО', 'Первый — в течение минуты после появления существа.'));
    return sec;
  }
  for (const m of d.history.slice(0, 10)) {
    const w = m.outcome === 'win' ? 'победа' : (m.outcome === 'loss' ? 'поражение' : 'ничья');
    sec.appendChild(h('div.jrow.tap', {
      onclick: () => ctx.go(`/watch/${m.id}`),
      title: 'посмотреть этот бой',
    },
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
  /*
   * ── ВЫБОР СТАРТОВОГО СУЩЕСТВА ЖИВЁТ ЗДЕСЬ, А НЕ НА АРЕНЕ ────────────────
   *
   * D2 даёт гостю выбрать одно из трёх библиотечных существ и следить за ним.
   * Карточки стояли в панели ожидания арены (`#idle`), а она показывается
   * ТОЛЬКО когда боя нет — при этом бой на арене идёт практически всегда
   * (D161 сократил паузу до пяти секунд, а витрина держится тёплой). То есть
   * выбор был недостижим: `airena.starter` не записывался никогда, а `following`
   * всегда оставался null.
   *
   * Вкладка «Существо» у гостя пуста по определению — это и есть её место.
   * Она открыта в любой момент, не спорит с идущим боем и отвечает ровно на
   * тот вопрос, с которым сюда приходят: «а что у меня есть».
   */
  const cards = h('div.row', { style: { flexWrap: 'wrap', gap: '10px', marginTop: '18px' } },
    h('div.t-sub', 'подбираем троих…'));
  const box = h('div.sheet.narrow',
    empty('У ТЕБЯ ПОКА НЕТ СВОЕГО',
      ctx.state.session?.guest
        ? 'Библиотечные существа дерутся на арене прямо сейчас — они общие для всех гостей. Выбери, за кем следить, или сделай своё на аккаунте.'
        : 'Существо создаётся из одного предложения. Оно будет драться само, даже когда вкладка закрыта.',
      h('button.btn.primary', { onclick: () => ctx.go('/new') }, 'СДЕЛАТЬ СВОЁ')));
  if (ctx.state.session?.guest) {
    box.appendChild(h('div.hcut', { style: { marginTop: '28px' } }, 'ЗА КЕМ СЛЕДИТЬ'));
    box.appendChild(cards);
  }
  mount(root, box);
  if (ctx.state.session?.guest) pickStarter(cards, ctx).catch(() => {});
}

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
