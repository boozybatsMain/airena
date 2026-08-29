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
  ['trigger', 'trig', 'КОГДА'],
  ['delivery', 'deliv', 'ЧЕМ'],
  ['effects', 'eff', 'ЧТО ДЕЛАЕТ'],
  ['channel', 'chan', 'КАНАЛ'],
  ['element', 'elem', 'ВИД'],
];

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
    kit.forEach((s, i) => box.appendChild(row(s, i, kit, dirty)));
    if (!editable) return;

    const total = (data.kitCost || []).reduce((a, b) => a + b, 0);
    box.appendChild(h('div.row', { style: { marginTop: '14px' } },
      h('div.t-sub', { style: { flex: 1 } },
        'Набор меняется мгновенно и бесплатно — мозг переучивать не надо, он читает умения в бою.'),
      dirty ? h('button.btn.primary', { onclick: () => save(kit) }, 'ПРИМЕНИТЬ НАБОР') : null,
      dirty ? h('button.btn.ghost.big', { onclick: () => render(creature.kit, false) }, 'ОТМЕНИТЬ') : null));
  }

  function row(s, i, kit, dirty) {
    const cost = data.kitCost?.[i];
    return h('div.skillrow',
      h('div.n', String(i + 1)),
      h('div.body',
        h('div.atoms', chips(s)),
        h('div.say', describe(s)),
        editable ? h('div.row', { style: { marginTop: '8px', gap: '8px' } },
          h('button.btn.ghost', { onclick: () => open(i, kit) }, 'изменить')) : null),
      cost !== undefined && !dirty ? h('div.cost', `${cost} оч.`) : null);
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
              : (axis === 'trigger' ? GRAMMAR.triggers : GRAMMAR.deliveries)));
        /* Канал показывается, только когда его есть кому крутить: пустая ось
           на экране читается как «тут что-то сломалось». */
        if (axis === 'channel' && !cur.effects.some((e) => GRAMMAR.effects[e]?.needsChannel)) continue;
        const opts = Object.values(src).map((a) => {
          const on = axis === 'effects' ? cur.effects.includes(a.id) : cur[axis] === a.id;
          /* L1 — единственное правило легальности грамматики, и оно должно
             быть видно ДО нажатия, а не в сообщении об ошибке после. */
          const blocked = axis === 'effects' && cur.delivery === 'self' && !GRAMMAR.selfAllowed.includes(a.id);
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
              if (cur.delivery === 'self') cur.effects = cur.effects.filter((e) => GRAMMAR.selfAllowed.includes(e));
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
      box.appendChild(h('div.t-body', { style: { color: '#f0a99e' } },
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
        : (axis === 'trigger' ? g.triggers : g.deliveries)));
  return src?.[id]?.ru || id;
}

/** Одно предложение обычным языком — рядом с чипами, а не вместо них. */
export function describe(s) {
  const g = GRAMMAR;
  if (!g) return '';
  const d = g.deliveries[s.delivery];
  const eff = (s.effects || []).map((e) => g.effects[e]?.ru || e).join(' и ');
  const t = g.triggers[s.trigger];
  const ch = s.channel ? g.channels[s.channel] : null;
  const el = g.elements[s.element];
  const when = t && t.id !== 'active' ? `${t.ru}, ` : '';
  const via = ch ? ` по каналу «${ch.ru}»` : '';
  const look = el ? ` Выглядит как ${el.ru}: ${el.read}.` : '';
  return `${cap(when)}${d?.ru || s.delivery} — ${eff}${via}.${look}`;
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export async function loadGrammar() {
  if (!GRAMMAR) GRAMMAR = await get('/api/grammar');
  return GRAMMAR;
}
