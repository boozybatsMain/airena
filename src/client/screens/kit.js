/**
 * Набор умений — единственный рычаг игрока с нулевой дисперсией генератора.
 *
 * §7.2·2, заморожено: «Игрок выбирает, какие скиллы несёт существо, из
 * грамматики §8. Выбор применяется детерминированно, LLM в нём не участвует.
 * Это единственное, что делает проигрыш ОТЧАСТИ ВИНОЙ ИГРОКА — и,
 * следовательно, единственное, что делает любую платную починку защитимой.»
 *
 * F10: смена набора НИКОГДА не требует регенерации мозга. Перцепция в рантайме
 * отдаёт живые параметры набора обоих существ, поэтому мозг узнаёт о новом
 * умении сам, в первом же бою.
 *
 * Бюджет силы считает СЕРВЕР и считает заново (§8). Цифра, которую показывает
 * этот экран, — подсказка, а не разрешение: сервер её не читает.
 */

import { get, post, track } from '../lib/api.js';
import { h, mount, clear, empty } from '../lib/dom.js';

let GRAMMAR = null;

const AXES = [
  ['delivery', 'deliv', 'ЧЕМ'],
  ['effects', 'eff', 'ЧТО ДЕЛАЕТ'],
  ['channel', 'chan', 'КАНАЛ'],
  ['element', 'elem', 'ВИД'],
];

/** Доставка SELF-класса — та, что доставляет к себе: `self`, `blink` и `jump`. */
const selfClass = (id) => GRAMMAR?.deliveries?.[id]?.klass === 'self';

export function kitEditor(creature, data, ctx, editable) {
  const box = h('div.skills');
  render();
  return box;

  function render(kit = creature.kit, dirty = false) {
    clear(box);
    if (!kit?.length) {
      box.appendChild(empty('НАБОР ПУСТ', 'У этого существа умения ещё не собраны.'));
      return;
    }
    /*
     * ПРЕДУПРЕЖДЕНИЕ, ЕСЛИ СУЩЕСТВО ЭТИМ НАБОРОМ НЕ ДЕРЁТСЯ.
     *
     * Сервер отдаёт `kitActive` и в комментарии рядом написано, зачем: набор,
     * которым существо не пользуется, — это ложь в самом заметном месте
     * страницы. Клиент это поле не читал, и двадцать одно существо из
     * двадцати шести показывало умения, которых у них в бою нет: мозг,
     * написанный до грамматики, зовёт `laser` и `smash`, а страница рисует
     * «зона: горение».
     *
     * Не прячем набор — он настоящий и его можно менять; говорим правду
     * рядом с ним.
     */
    if (creature.kitActive === false) {
      box.appendChild(h('div.note.warn', { style: { marginBottom: '12px' } },
        h('b', {}, 'Существо дерётся не этим набором. '),
        'Его мозг написан до появления умений и знает только базовые: '
        + 'луч, рывок, прыжок. Набор ниже — настоящий, его можно собрать и '
        + 'поменять, но в бой он попадёт только у существа, чей мозг о нём знает.'));
    }
    kit.forEach((s, i) => box.appendChild(row(s, i, kit, dirty)));
    if (!editable) return;

    /*
     * БЮДЖЕТ НАДО ПОКАЗЫВАТЬ, А НЕ ХРАНИТЬ В СЕБЕ.
     *
     * Сумма очков считалась и не выводилась никуда, а сам потолок (52 на
     * набор, 22 на умение) на экране не появлялся вообще. Игрок собирал
     * умение вслепую и узнавал про бюджет единственным способом: нажав
     * «применить» и получив отказ. Это правило, по которому идёт вся сборка,
     * и прятать его — то же самое, что играть в карты рубашкой вверх.
     *
     * Считается на клиенте по тем же ценам, что пришли в `/api/grammar`, —
     * поэтому цифра живая и меняется прямо во время правки, а не только
     * после сохранения. Сервер всё равно пересчитает и останется истиной
     * (E-правила фейлятся закрыто); полоса здесь — подсказка, а не решение.
     */
    const cap = GRAMMAR?.budgets?.kit ?? null;
    const total = kit.reduce((a, s) => a + (costLocal(s) ?? 0), 0);
    if (cap) {
      const over = total > cap;
      box.appendChild(h(over ? 'div.budget.over' : 'div.budget',
        h('div.bar', h('div.fill', {
          style: { width: `${Math.min(100, Math.round((total / cap) * 100))}%` },
        })),
        h('div.t-sub', `${total} из ${cap} очков набора`
          + (over ? ' — перебор, набор не примут' : ''))));
    }
    /*
     * ПРОВЕРИТЬ ДО ТОГО, КАК ПРИМЕНИТЬ.
     *
     * §7.2·3: «никогда не продавать непроверенный жребий» — симуляция делает
     * верификацию бесплатной, поэтому показать результат ДО решения не
     * роскошь, а обязанность. Для мозга это уже работало, для набора нет:
     * игрок менял умения вслепую и узнавал результат из лестницы через час.
     *
     * Шесть боёв эталонным мозгом, около полусекунды. Цифра честно названа
     * нижней границей: она отвечает «попадает ли этот набор вообще», а не
     * «силён ли он» — силу меряет лига, и она стоит минуты.
     */
    const verdict = h('div.t-sub', { style: { marginTop: '10px' } });
    const checkBtn = h('button.btn.ghost', { onclick: () => check(kit) }, 'ПРОВЕРИТЬ БОЕМ');
    box.appendChild(h('div.row', { style: { marginTop: '14px' } },
      h('div.t-sub', { style: { flex: 1 } },
        'Набор меняется мгновенно и бесплатно — мозг переучивать не надо, он читает умения в бою.'),
      checkBtn,
      dirty ? h('button.btn.primary', { onclick: () => save(kit) }, 'ПРИМЕНИТЬ НАБОР') : null,
      dirty ? h('button.btn.ghost.big', { onclick: () => render(creature.kit, false) }, 'ОТМЕНИТЬ') : null));
    box.appendChild(verdict);

    async function check(k) {
      checkBtn.disabled = true;
      /* Без числа: сколько боёв гоняет `viability`, знает сервер
         (`VIABILITY_ROUNDS`), и клиент, повторяющий это число у себя, — третий
         источник правды. Он уже разошёлся один раз: здесь стояло «двадцать»,
         когда на сервере было сорок. */
      verdict.textContent = 'пробные бои против пятерых…';
      try {
        const r = await post(`/api/creature/${creature.id}/kit/check`, { kit: k });
        /*
         * Игроку называется ФОРМА, а не средний процент.
         *
         * «Берёт 40% боёв» ничего не говорит: 40% против всех и 80/0 — это
         * разные наборы. Первый ровный, второй — стратегия с контрой, и
         * второй интереснее. §7.2·3 требует назвать силу ДО решения, а не
         * через час на лестнице.
         */
        const pct = (r.rates || []).filter((x) => typeof x === 'number')
          .map((x) => `${Math.round(x * 100)}%`).join(' · ');
        verdict.textContent = !r.ok
          ? `набором нельзя попасть: ${r.why}. Умения стоит поменять.`
          : `${r.verdictRu || 'проверено'} — ${r.wins} побед из ${r.rounds}`
            + (pct ? ` (против пятерых: ${pct})` : '');
      } catch (e) {
        verdict.textContent = e.message || 'проверка не запустилась — можно применить и так';
      }
      checkBtn.disabled = false;
    }
  }

  /**
   * Цена умения по ценам из грамматики — та же формула, что в реестре
   * (`costOf`): доставка + эффекты + канал, и надбавка за два и за три
   * эффекта на одном умении. Дублировать формулу неприятно, но альтернатива —
   * спрашивать сервер на каждый клик по оси, а цена нужна мгновенно, иначе она
   * не подсказка. Расхождение поймает сервер: он считает по своей и отказывает,
   * если насчитал больше.
   *
   * Слагаемого «триггер» здесь больше нет: ось снята (D102). Когда её убирали,
   * из этой функции убрали ОБЪЯВЛЕНИЕ `t`, а обращения к нему остались — и
   * `describe()` вместе с `costLocal()` падали на `t is not defined`. Падал не
   * набор: падали три экрана, включая `/new`, то есть единственный путь к
   * генерации. Ни один гейт этого не видел, потому что ни один не исполнял
   * клиентский код. Теперь его читает `tools/checkscreens.mjs` — не исполняет, а
   * разрешает каждое имя разбором.
   */
  function costLocal(s) {
    if (!GRAMMAR) return null;
    const d = GRAMMAR.deliveries?.[s.delivery];
    if (!d) return null;
    let sum = d.cost || 0;
    for (const e of s.effects || []) sum += GRAMMAR.effects?.[e]?.cost ?? 0;
    if (s.channel) sum += GRAMMAR.channels?.[s.channel]?.cost ?? 0;
    const n = (s.effects || []).length;
    if (n === 2) sum += 2;
    if (n >= 3) sum += 5;
    return sum;
  }

  function row(s, i, kit, dirty) {
    const cost = costLocal(s) ?? data.kitCost?.[i];
    return h('div.skillrow',
      h('div.n', String(i + 1)),
      h('div.body',
        h('div.atoms', chips(s)),
        h('div.say', describe(s)),
        editable ? h('div.row', { style: { marginTop: '8px', gap: '8px' } },
          h('button.btn.ghost', { onclick: () => open(i, kit) }, 'изменить')) : null),
      /* Цена показывается и во время правки: раньше она пряталась ровно
         тогда, когда игрок её меняет, — то есть когда она нужнее всего. */
      cost !== undefined && cost !== null ? h('div.cost', `${cost} оч.`) : null);
  }

  function chips(s) {
    const out = [];
    for (const [axis, cls] of AXES.map((a) => [a[0], a[1]])) {
      const v = s[axis];
      if (!v) continue;
      const list = Array.isArray(v) ? v : [v];
      for (const one of list) out.push(h(`span.atom.${cls}`, label(axis, one)));
    }
    return out;
  }

  async function open(i, kit) {
    if (!GRAMMAR) GRAMMAR = await get('/api/grammar');
    const cur = { ...kit[i], effects: [...(kit[i].effects || [])] };
    const panel = h('div', { style: { marginTop: '10px' } });

    const paint = () => {
      clear(panel);
      for (const [axis, cls, ru] of AXES) {
        const src = axis === 'effects' ? GRAMMAR.effects
          : (axis === 'channel' ? GRAMMAR.channels
            : (axis === 'element' ? GRAMMAR.elements
              : GRAMMAR.deliveries));
        /* Канал показывается, только когда его есть кому крутить: пустая ось
           на экране читается как «тут что-то сломалось». */
        if (axis === 'channel' && !cur.effects.some((e) => GRAMMAR.effects[e]?.needsChannel)) continue;
        const opts = Object.values(src).map((a) => {
          const on = axis === 'effects' ? cur.effects.includes(a.id) : cur[axis] === a.id;
          /* L1 — единственное правило легальности грамматики, и оно должно
             быть видно ДО нажатия, а не в сообщении об ошибке после. */
          /* L1 — правило про КЛАСС доставки, а не про её имя. SELF-класс
             носят три доставки — `self`, `blink` и `jump` (D160); проверка по имени
             предлагала «мигание + урон» как законное и отвергала его только
             при сохранении — то есть после того, как игрок собрал набор. */
          const blocked = axis === 'effects' && selfClass(cur.delivery)
            && !GRAMMAR.selfAllowed.includes(a.id);
          return h(`span.atom.${cls}`, {
            style: {
              cursor: blocked ? 'not-allowed' : 'pointer',
              opacity: blocked ? '.3' : (on ? '1' : '.55'),
              outline: on ? '1px solid currentColor' : 'none',
            },
            title: blocked ? 'на себя это доставить нельзя' : (a.doc || a.read || ''),
            onclick: () => {
              if (blocked) return;
              if (axis === 'effects') {
                const at = cur.effects.indexOf(a.id);
                if (at >= 0) { if (cur.effects.length > 1) cur.effects.splice(at, 1); }
                else if (cur.effects.length < 3) cur.effects.push(a.id);
              } else cur[axis] = a.id;
              if (selfClass(cur.delivery)) cur.effects = cur.effects.filter((e) => GRAMMAR.selfAllowed.includes(e));
              if (!cur.effects.length) cur.effects = ['shield'];
              if (!cur.effects.some((e) => GRAMMAR.effects[e]?.needsChannel)) delete cur.channel;
              else if (!cur.channel) cur.channel = 'speed';
              paint();
            },
          }, a.ru || a.id);
        });
        panel.appendChild(h('div', { style: { margin: '10px 0' } },
          h('div.t-cap', { style: { marginBottom: '5px' } }, ru),
          h('div.atoms', opts)));
      }
      panel.appendChild(h('div.row', { style: { marginTop: '12px' } },
        h('button.btn.accent', {
          onclick: () => { const next = kit.slice(); next[i] = cur; render(next, true); },
        }, 'ГОТОВО'),
        h('button.btn.ghost', { onclick: () => render(creature.kit, false) }, 'отмена')));
    };

    paint();
    const rows = box.querySelectorAll('.skillrow');
    rows[i]?.querySelector('.body')?.appendChild(panel);
  }

  async function save(kit) {
    try {
      const out = await post(`/api/creature/${creature.id}/kit`, { kit });
      creature.kit = out.kit;
      data.kitCost = out.cost;
      track('kit_change', {});
      render(out.kit, false);
    } catch (e) {
      clear(box);
      box.appendChild(h('div.t-body', { style: { color: 'var(--bad)' } },
        e.violations?.length
          ? `Набор не проходит правила: ${e.violations.map((v) => v.ru).join('; ')}`
          : (e.message || 'Набор не применился.')));
      box.appendChild(h('button.btn.big', { style: { marginTop: '10px' }, onclick: () => render(creature.kit, false) }, 'НАЗАД'));
    }
  }
}

function label(axis, id) {
  const g = GRAMMAR;
  if (!g) return id;
  const src = axis === 'effects' ? g.effects
    : (axis === 'channel' ? g.channels
      : (axis === 'element' ? g.elements
        : g.deliveries));
  return src?.[id]?.ru || id;
}

/** Одно предложение обычным языком — рядом с чипами, а не вместо них. */
export function describe(s) {
  const g = GRAMMAR;
  if (!g) return '';
  const d = g.deliveries[s.delivery];
  const eff = (s.effects || []).map((e) => g.effects[e]?.ru || e).join(' и ');
  const ch = s.channel ? g.channels[s.channel] : null;
  const el = g.elements[s.element];
  /* «Когда» отсюда ушло вместе с осью триггеров: умение просто существует, а
     когда его применить — решает мозг, поймав событие (решение основателя). */
  const via = ch ? ` по каналу «${ch.ru}»` : '';
  const look = el ? ` Выглядит как ${el.ru}: ${el.read}.` : '';
  /*
   * МЕХАНИКА ДОСТАВКИ НАЗЫВАЕТСЯ ЗДЕСЬ, А НЕ ТОЛЬКО В `title`.
   *
   * Строка была «Прыжок — щит.» — то есть игрок, выбирающий прыжок одним из
   * трёх, нигде не читал, ЧТО ЭТО ЗА УМЕНИЕ. Единственным местом с описанием
   * был атрибут `title` на чипе внутри панели редактирования: тултипа нет на
   * тач-экране, и появляется он, когда решение уже принято.
   *
   * `doc` приходит с сервера вместе с ценой и живёт в реестре — той же
   * строкой, которую читает промпт разбора. Второй копии не заводим.
   */
  const how = d?.doc ? ` ${cap(d.doc)}.` : '';
  return `${cap(d?.ru || s.delivery)} — ${eff}${via}.${how}${look}`;
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export async function loadGrammar() {
  if (!GRAMMAR) GRAMMAR = await get('/api/grammar');
  return GRAMMAR;
}
