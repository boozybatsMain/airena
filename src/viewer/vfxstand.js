/**
 * СТЕНД РУКАМИ: каждая доставка каждой стихии — кнопкой, в настоящей боевой
 * сцене, с четырьмя глазами прогона снимков. Дев-инструмент, только в
 * дев-вьювере (`?vfx=1&stand=1`); в продуктовый бандл не входит
 * (`tools/checkscope.mjs` обходит бандл от `src/client/index.html`).
 *
 * Зачем, когда есть карусель (`vfxdemo.js`) и прогон (`tools/vfxshot.mjs`):
 * карусель показывает всё по кругу и не даёт остановиться на одном, прогон
 * снимает кадры без человека. Основателю нужно нажать «луч» пять раз подряд
 * с разных глаз и сказать, что не так. Стенд — это кнопки поверх боевой
 * сцены: стойка бойцов, глаза и записи доставок — те же, что у прогона
 * (`vfxfixture.js`), чтобы то, что он видит, было тем, что снимают судьи.
 *
 * Подпись на каждой кнопке — КТО рисует эту доставку для этой стихии
 * (`drawnBy` из `vfx.js`): элементный модуль, лазер (штатный луч стихий без
 * модуля) или штатный силуэт. Это и есть ответ на вопрос «какие формы
 * сейчас есть у молнии и у лазера».
 *
 *   /?vfx=1&stand=1              стенд (стихия при старте — `&el=kinetic`)
 *   пробел — повторить последний каст, 1–4 — глаза, 0 — камера решателя
 *   window.__stand.cast(kind, el) / .cam(name) — руками из консоли
 */

import { BLUE, ORANGE, CAMS, CAM_LABELS, FORMS, ATOMS, STATUSES, fxFor } from './vfxfixture.js';
import { drawnBy } from './vfx.js';
import { ELEMENTS as REGISTRY } from '../skills/registry.js';

const params = new URLSearchParams(location.search);
if (params.get('vfx') && params.get('stand')) boot().catch((err) => console.error('vfxstand', err));

/* Стихии — из реестра, чтобы новая стихия появлялась на стенде без правки;
   порядок: сначала те, над которыми идёт работа. */
const FIRST = ['arc', 'kinetic', 'void'];
const ELEMENTS = [...FIRST.filter((k) => REGISTRY[k]), ...Object.keys(REGISTRY).filter((k) => !FIRST.includes(k))];
const EL_LABEL = Object.fromEntries(ELEMENTS.map((k) => [k, `${k[0].toUpperCase()}${k.slice(1)} · ${REGISTRY[k].ru}`]));
/* Подпись «кто рисует» на кнопке: коротко и честно. */
const BY_LABEL = (el, by) => ({
  module: `${el} module`, 'module+stock': `${el} + stock`, laser: 'laser', stock: 'stock', none: 'nothing',
}[by] || by);

const CSS = `
#vfxstand { position: fixed; left: 14px; top: 132px; z-index: 7; width: 318px; max-height: calc(100vh - 232px);
  overflow: auto; background: rgba(8, 14, 22, 0.9); border: 1px solid rgba(120, 170, 190, 0.3); color: #cfe6ee;
  font-family: "Rajdhani", ui-monospace, sans-serif; font-size: 13px; letter-spacing: 0.04em; padding: 10px 12px 12px;
  backdrop-filter: blur(6px); scrollbar-width: thin; }
#vfxstand h2 { margin: 0 0 4px; font-size: 14px; letter-spacing: 0.18em; text-transform: uppercase; color: #e8fbff; font-weight: 700; }
#vfxstand h3 { margin: 12px 0 6px; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #7fa8b8; font-weight: 600; }
#vfxstand .row { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
#vfxstand button { font: inherit; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; font-size: 11px;
  color: #cfe6ee; background: rgba(20, 30, 42, 0.9); border: 1px solid rgba(120, 170, 190, 0.35); padding: 6px 9px; cursor: pointer; }
#vfxstand button:hover { border-color: #7fd6e8; }
#vfxstand button.on { color: #0d131c; background: #7fd6e8; border-color: #7fd6e8; }
#vfxstand .sum { color: #93a9b6; font-size: 12px; line-height: 1.4; letter-spacing: 0; margin: 4px 0 0; }
#vfxstand .form { display: grid; grid-template-columns: 1fr auto; gap: 1px 8px; align-items: center; padding: 6px 4px;
  border-top: 1px solid rgba(120, 170, 190, 0.15); cursor: pointer; }
#vfxstand .form:hover { background: rgba(127, 214, 232, 0.08); }
#vfxstand .form.on { background: rgba(127, 214, 232, 0.14); }
#vfxstand .form b { font-size: 13px; letter-spacing: 0.1em; text-transform: uppercase; color: #e8fbff; }
#vfxstand .form b small { color: #7fa8b8; text-transform: none; letter-spacing: 0; margin-left: 6px; font-size: 12px; font-weight: 500; }
#vfxstand .form .what { grid-column: 1 / -1; color: #93a9b6; font-size: 12px; line-height: 1.35; letter-spacing: 0; }
#vfxstand .tag { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; padding: 2px 6px; border: 1px solid; white-space: nowrap; }
#vfxstand .tag.module, #vfxstand .tag.module-stock { color: #7fd6e8; border-color: #7fd6e8; }
#vfxstand .tag.laser { color: #ffb27a; border-color: #ffb27a; }
#vfxstand .tag.stock { color: #8a9aa6; border-color: rgba(138, 154, 166, 0.6); }
#vfxstand .tag.none { color: #6b7782; border-color: rgba(107, 119, 130, 0.5); }
#vfxstand label { display: inline-flex; gap: 5px; align-items: center; font-size: 12px; color: #b9cbd6; letter-spacing: 0; cursor: pointer; }
#vfxstand select { font: inherit; font-size: 12px; color: #cfe6ee; background: rgba(20, 30, 42, 0.9); border: 1px solid rgba(120, 170, 190, 0.35); padding: 3px 4px; }
#vfxstand pre { margin: 6px 0 0; font: 11px/1.4 ui-monospace, Menlo, monospace; color: #93a9b6; white-space: pre-wrap; word-break: break-all; max-height: 110px; overflow: auto; }
#vfxstand .foot { margin-top: 8px; color: #7fa8b8; font-size: 11px; letter-spacing: 0.06em; }
#vfxstand .keys { color: #6b7782; }
/* Лента боя лежит ровно под панелью; на стенде боя нет — прячем. */
#feedwrap { display: none; }
`;

function waitSweep() {
  return new Promise((res, rej) => {
    let n = 0;
    const t = setInterval(() => {
      const s = window.__airenaSweep;
      const b = s && s.bodies();
      if (b && b.blue && b.orange) { clearInterval(t); res(s); } else if (++n > 300) { clearInterval(t); rej(new Error('вьювер не поднялся за 60 с')); }
    }, 200);
  });
}

async function boot() {
  const sweep = await waitSweep();
  const state = {
    el: ELEMENTS.includes(params.get('el')) ? params.get('el') : 'arc',
    cam: 'broadcast', hit: true, atom: 'damage', effect: 'burn', vary: true, loop: false,
    last: null, casts: 0, timer: 0,
  };

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const box = document.createElement('div');
  box.id = 'vfxstand';
  document.body.appendChild(box);

  const place = () => sweep.place({ blue: BLUE, orange: ORANGE });
  const setCam = (name) => { state.cam = name; sweep.cam(name === 'auto' ? null : CAMS[name]); render(); };
  const cast = (kind, el = state.el) => {
    state.casts++;
    /* `t` входит в сид (`seedOf`): с `vary` каждый каст — свой рисунок,
       без него — один и тот же кадр в кадр, как в повторе боя. */
    const e = fxFor(kind, el, { hit: state.hit, atom: state.atom, effect: state.effect, t: state.vary ? state.casts * 0.001 : 0 });
    if (!e) return;
    sweep.cast(e);
    state.last = { kind, el, e, by: drawnBy(el, kind) };
    updateLast();
  };
  const setLoop = (on) => {
    state.loop = on;
    clearInterval(state.timer);
    if (on) state.timer = setInterval(() => { if (state.last) cast(state.last.kind, state.last.el); }, 2600);
    render();
  };

  /* Полная перерисовка — только при смене стихии или глаза; каст меняет лишь
     подсветку формы и блок «последний каст», иначе панель прыгает под рукой. */
  function updateLast() {
    for (const f of box.querySelectorAll('.form')) f.classList.toggle('on', !!state.last && state.last.kind === f.dataset.kind && state.last.el === state.el);
    const again = box.querySelector('[data-act="again"]');
    if (again) again.disabled = !state.last;
    const sum = box.querySelector('#vfxstand-last');
    if (sum) sum.textContent = state.last ? `${state.last.el} · ${state.last.kind} · drawn by ${BY_LABEL(state.last.el, state.last.by)}` : 'nothing yet';
    const pre = box.querySelector('#vfxstand-json');
    if (pre) pre.textContent = state.last ? JSON.stringify(state.last.e) : '';
  }

  function render() {
    const st = box.scrollTop;
    const el = state.el;
    const byCount = {};
    for (const f of FORMS) { const b = drawnBy(el, f.kind); byCount[b] = (byCount[b] || 0) + 1; }
    const summary = Object.entries(byCount).map(([b, n]) => `${n} ${BY_LABEL(el, b)}`).join(' · ');
    box.innerHTML = `
      <h2>VFX stand</h2>
      <div class="sum">Real combat scene, the same fixture and cameras as the capture tool. Click a form to cast it from blue at orange.</div>
      <h3>Element</h3>
      <div class="row">${ELEMENTS.map((x) => `<button data-el="${x}" class="${x === el ? 'on' : ''}">${EL_LABEL[x]}</button>`).join('')}</div>
      <div class="sum">${el}: ${summary}</div>
      <h3>Forms</h3>
      <div class="forms">${FORMS.map((f) => {
        const by = drawnBy(el, f.kind);
        const on = state.last && state.last.kind === f.kind && state.last.el === el;
        return `<div class="form ${on ? 'on' : ''}" data-kind="${f.kind}" title="cast ${f.kind}">
          <b>${f.kind}<small>${f.ru}${f.sim === false ? ' · viewer only' : ''}</small></b>
          <span class="tag ${by.replace('+', '-')}">${BY_LABEL(el, by)}</span>
          <span class="what">${f.what}</span></div>`;
      }).join('')}</div>
      <h3>Options</h3>
      <div class="row">
        <label><input type="checkbox" data-opt="hit" ${state.hit ? 'checked' : ''}> hit</label>
        <label><input type="checkbox" data-opt="vary" ${state.vary ? 'checked' : ''}> new seed each cast</label>
        <label><input type="checkbox" data-opt="loop" ${state.loop ? 'checked' : ''}> loop last</label>
      </div>
      <div class="row" style="margin-top:6px">
        <label>impact <select data-opt="atom">${ATOMS.map((a) => `<option ${a === state.atom ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <label>status <select data-opt="effect">${STATUSES.map((a) => `<option ${a === state.effect ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      </div>
      <h3>Camera</h3>
      <div class="row">${Object.keys(CAMS).map((c) => `<button data-cam="${c}" class="${state.cam === c ? 'on' : ''}" title="${CAM_LABELS[c][1]}">${CAM_LABELS[c][0]}</button>`).join('')}<button data-cam="auto" class="${state.cam === 'auto' ? 'on' : ''}" title="the fight director's camera">Auto</button><button data-act="place" title="put both fighters back on the fixture">Reset fighters</button></div>
      <h3>Last cast</h3>
      <div class="row"><button data-act="again" ${state.last ? '' : 'disabled'}>Cast again</button><button data-act="bolthit" title="bolt, then the sim's impact record 0.4 s later at the target">Bolt + hit</button><span class="sum" id="vfxstand-last">${state.last ? `${state.last.el} · ${state.last.kind} · drawn by ${BY_LABEL(state.last.el, state.last.by)}` : 'nothing yet'}</span></div>
      <pre id="vfxstand-json">${state.last ? JSON.stringify(state.last.e) : ''}</pre>
      <div class="foot" id="vfxstand-foot"></div>
      <div class="foot keys">space — cast again · 1–4 — cameras · 0 — auto</div>`;
    box.scrollTop = st;
  }

  box.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-el],[data-kind],[data-cam],[data-act]');
    if (!t) return;
    if (t.dataset.el) { state.el = t.dataset.el; render(); }
    else if (t.dataset.kind) cast(t.dataset.kind);
    else if (t.dataset.cam) setCam(t.dataset.cam);
    else if (t.dataset.act === 'place') place();
    else if (t.dataset.act === 'again' && state.last) cast(state.last.kind, state.last.el);
    else if (t.dataset.act === 'bolthit') {
      /* Снаряд + удар той же пары (who, skill) через 0.4 с — так сим сообщает
         снаряду точку попадания (см. docs/VFX-PLAN.md §7.2). */
      cast('bolt');
      setTimeout(() => { const e = fxFor('impact', state.el, { atom: state.atom, t: state.casts * 0.001 }); if (e) sweep.cast(e); }, 400);
    }
  });
  box.addEventListener('change', (ev) => {
    const t = ev.target;
    if (!t.dataset.opt) return;
    if (t.dataset.opt === 'loop') setLoop(t.checked);
    else if (t.type === 'checkbox') state[t.dataset.opt] = t.checked;
    else state[t.dataset.opt] = t.value;
  });
  addEventListener('keydown', (ev) => {
    if (ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
    if (ev.key === ' ' && state.last) { ev.preventDefault(); cast(state.last.kind, state.last.el); }
    else if (ev.key >= '1' && ev.key <= '4') setCam(Object.keys(CAMS)[Number(ev.key) - 1]);
    else if (ev.key === '0') setCam('auto');
  });
  /* Кадры и бэкенд — раз в секунду, чтобы просадку было видно рядом с кнопкой. */
  setInterval(() => {
    const f = document.getElementById('vfxstand-foot');
    if (!f) return;
    const s = sweep.stats();
    f.textContent = `${s.backend || '?'} · ${s.fps != null ? Math.round(s.fps) : '?'} fps · bloom ${s.bloom ? 'on' : 'off'} · draws ${s.draws ?? '?'}`;
  }, 1000);

  place();
  setCam(state.cam);
  window.__stand = { cast, cam: setCam, place, state };
}
