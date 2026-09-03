/**
 * ПЕСОЧНИЦА: двое дерутся сами, а ты крутишь параметры умения и сразу
 * видишь, что изменилось. Дев-инструмент, только в дев-вьювере
 * (`?vfx=1&sandbox=1`); в продуктовый бандл не входит.
 *
 * Заказ основателя дословно: «доделай эту сцену, где можно переключаться
 * между разными умениями и смотреть их, с существами, которые бегают и
 * дерутся. Пусть у них будет бесконечное здоровье. Дай им примитивный ИИ,
 * чтобы они бегали, убегали друг от друга и стреляли. Я должен иметь
 * возможность крутить настройки любого умения — дальность, радиус, что там
 * у умения есть. Хочу менять их и чтобы это работало в реальном времени:
 * существа подстраиваются под новые настройки, и сразу видно, как всё
 * меняется».
 *
 * ЧЕМ ЭТО НЕ СТЕНД (`vfxstand.js`). Стенд — одиночный каст по кнопке: боец
 * стоит, ты смотришь один эффект с четырёх глаз. Здесь другое: бой идёт сам,
 * непрерывно, и вопрос не «как выглядит луч», а «как играется луч с такой
 * дальностью» — видно дистанцию, на которой ИИ решает стрелять, как часто
 * эффект появляется, как он смотрится в движении и внахлёст с чужим.
 *
 * ТРИ ВЕЩИ, КОТОРЫЕ ЗДЕСЬ НАСТОЯЩИЕ, А НЕ ПОДДЕЛАННЫЕ:
 *   · тела — те же, что в бою, с той же походкой (`__airenaSweep.move`
 *     считает позу боевым кодом, а не своим);
 *   · записи — той же формы, что пишет сим (`vfxfixture.js` строит их из
 *     тех же полей, что `deliver.js`), поэтому модули эффектов не знают, что
 *     их зовёт песочница;
 *   · ручки — НЕ второй, руками писаный список, а опись, которую сами модули
 *     объявляют в `kit.tune`; песочница читает её через `kit.knobsFor` после
 *     первого каста. Список не может разойтись с кодом, потому что это он и
 *     есть.
 *
 * ЗДОРОВЬЕ БЕСКОНЕЧНО и урона нет вовсе: сим здесь не крутится. Бойцы —
 * марионетки простого руля, а удары рисуются записью `impact`, чтобы
 * попадание читалось. Это осознанно: песочница про ВИД и ЧУВСТВО параметра,
 * а не про баланс; за баланс отвечает `tools/kitbalance.mjs` на настоящем симе.
 *
 *   /?vfx=1&sandbox=1            песочница
 *   пробел — пауза, R — развести бойцов, 1–4 — глаза, 0 — камера решателя
 *   window.__sandbox.state       состояние руками из консоли
 */

import { BLUE, ORANGE, CAMS, CAM_LABELS, fxFor } from './vfxfixture.js';
import { drawnBy } from './vfx.js';
import { knobsFor } from './vfx/kit.js';
import { ELEMENTS as REGISTRY, DELIVERIES } from '../skills/registry.js';

const params = new URLSearchParams(location.search);
if (params.get('vfx') && params.get('sandbox')) boot().catch((err) => console.error('vfxsandbox', err));

/* Стихии и доставки — из реестра: новая стихия появляется здесь сама. */
const ELEMENTS = Object.keys(REGISTRY);
/* Только те доставки, которые песочница умеет разыграть боем. Удар, статус,
   заряд и стена приходят сами по ходу: удар — после попадания, заряд — в
   замахе, статус — от эффекта. */
const CASTABLE = ['beam', 'cone', 'bolt', 'lob', 'zone', 'dash', 'blink', 'self', 'jump'];

/* Арена: круг, в котором держатся бойцы (боевая сцена — 12 м в поперечнике). */
const ARENA_R = 9.5;

const CSS = `
#sbx { position: fixed; left: 14px; top: 132px; z-index: 7; width: 340px; max-height: calc(100vh - 220px);
  overflow: auto; background: rgba(8, 14, 22, 0.92); border: 1px solid rgba(120, 170, 190, 0.3); color: #cfe6ee;
  font-family: "Rajdhani", ui-monospace, sans-serif; font-size: 13px; letter-spacing: 0.04em; padding: 10px 12px 14px;
  backdrop-filter: blur(6px); scrollbar-width: thin; }
#sbx h2 { margin: 0 0 2px; font-size: 14px; letter-spacing: 0.18em; text-transform: uppercase; color: #e8fbff; font-weight: 700; }
#sbx h3 { margin: 13px 0 6px; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #7fa8b8; font-weight: 600;
  border-top: 1px solid rgba(120, 170, 190, 0.16); padding-top: 9px; }
#sbx h3:first-of-type { border-top: 0; }
#sbx .row { display: flex; gap: 5px; flex-wrap: wrap; align-items: center; }
#sbx button { font: inherit; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; font-size: 11px;
  color: #cfe6ee; background: rgba(20, 30, 42, 0.9); border: 1px solid rgba(120, 170, 190, 0.35); padding: 5px 8px; cursor: pointer; }
#sbx button:hover { border-color: #7fd6e8; }
#sbx button.on { color: #0d131c; background: #7fd6e8; border-color: #7fd6e8; }
#sbx select { font: inherit; font-size: 12px; color: #cfe6ee; background: rgba(20, 30, 42, 0.95);
  border: 1px solid rgba(120, 170, 190, 0.35); padding: 4px 6px; width: 100%; }
#sbx .who { display: flex; gap: 6px; align-items: center; margin: 6px 0 2px; }
#sbx .who b { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; width: 54px; }
#sbx .who b.blue { color: #7fd6e8; } #sbx .who b.orange { color: #ffb072; }
#sbx .knob { display: grid; grid-template-columns: 1fr 62px; gap: 2px 8px; align-items: center; margin: 5px 0; }
#sbx .knob label { font-size: 11.5px; color: #9fc0cd; letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#sbx .knob output { font: 600 11.5px ui-monospace, monospace; color: #e8fbff; text-align: right; }
#sbx .knob input[type=range] { grid-column: 1 / -1; width: 100%; margin: 0; accent-color: #7fd6e8; height: 16px; }
#sbx .note { color: #93a9b6; font-size: 11.5px; line-height: 1.45; letter-spacing: 0; margin: 5px 0 0; }
#sbx .stat { font: 600 11px ui-monospace, monospace; color: #8fb3c2; letter-spacing: 0.02em; margin-top: 6px; }
#sbx .tag { font: 600 9.5px ui-monospace, monospace; letter-spacing: 0.1em; color: #7fa8b8;
  border: 1px solid rgba(120, 170, 190, 0.3); padding: 2px 5px; }
`;

/* ── состояние ───────────────────────────────────────────────────────────── */

const FIGHTERS = {
  blue: { id: 'blue', el: 'arc', kind: 'beam', x: BLUE.x, z: BLUE.z, h: BLUE.h, vx: 0, vz: 0, stride: 0, turn: 0, cd: 0.6, wander: 0, tune: {} },
  orange: { id: 'orange', el: 'ember', kind: 'cone', x: ORANGE.x, z: ORANGE.z, h: ORANGE.h, vx: 0, vz: 0, stride: 0, turn: 0, cd: 1.4, wander: 1.7, tune: {} },
};
const state = { run: true, cam: 'auto', edit: 'blue', last: 0, casts: 0, fps: 0 };

/* Значения по умолчанию доставки из реестра — стартовая точка ползунков. */
const deliveryDefaults = (kind) => {
  const d = DELIVERIES[kind] || {};
  const out = {};
  for (const k of ['range', 'radius', 'halfAngle', 'speed', 'duration', 'airborne']) if (d[k] != null) out[k] = d[k];
  return out;
};

/*
 * ГРАНИЦЫ ПОЛЗУНКА. Ручек десятки, и у каждой свой смысл, поэтому вилка
 * берётся от самого значения: половина — вдвое, что для длины, что для доли,
 * что для секунды. Исключение одно — углы: полураствор больше π бессмыслен.
 */
const rangeFor = (key, v) => {
  if (/half|angle/i.test(key)) return [0.05, Math.PI, 0.01];
  const base = Math.abs(v) || 1;
  const hi = base * 3;
  const step = hi > 20 ? 0.5 : hi > 4 ? 0.05 : hi > 0.4 ? 0.01 : 0.001;
  return [0, +(hi).toFixed(3), step];
};

/** Живое значение ручки: правка пользователя или значение по умолчанию. */
const knobValue = (f, key, dflt) => (f.tune[key] != null ? f.tune[key] : dflt);

/** Дальность, на которой этот боец хочет держаться. */
function wantRange(f) {
  const d = deliveryDefaults(f.kind);
  const r = knobValue(f, 'range', d.range ?? knobValue(f, 'radius', d.radius ?? 6));
  /*
   * Ближние формы жмутся вплотную, дальние держат три четверти дистанции —
   * но НЕ ДАЛЬШЕ, ЧЕМ ПОЗВОЛЯЕТ АРЕНА. У луча реестровая дальность 24 м, а
   * арена 19 м в поперечнике: без потолка боец «держал бы» 18 м, то есть
   * пятился в стену и никогда не был доволен. Потолок в 0.8 круга оставляет
   * место для обхода.
   */
  const near = f.kind === 'cone' || f.kind === 'self' || f.kind === 'jump';
  const want = near ? Math.max(1.6, r * 0.6) : Math.max(2.2, r * 0.75);
  return Math.min(want, ARENA_R * 0.8);
}

/* ── бой ─────────────────────────────────────────────────────────────────── */

/**
 * ПРИМИТИВНЫЙ РУЛЬ. Три желания складываются в одно направление: держать
 * дистанцию (подойти, если далеко; отойти, если близко), обходить противника
 * боком (иначе двое стоят столбами друг против друга) и не выходить за круг
 * арены. Ничего умнее не нужно: задача — показать, КАК ИГРАЕТСЯ параметр,
 * а не выиграть бой.
 */
function steer(f, foe, dt) {
  const dx = foe.x - f.x, dz = foe.z - f.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const ux = dx / dist, uz = dz / dist;
  const want = wantRange(f);
  /* Мёртвая зона в метр: без неё боец дрожит на месте вокруг идеала. */
  const err = dist - want;
  const push = Math.abs(err) < 1 ? 0 : Math.sign(err);
  f.wander += dt * 0.7;
  const strafe = Math.sin(f.wander) * 0.85;
  let mx = ux * push - uz * strafe;
  let mz = uz * push + ux * strafe;
  /* Стенка круга: чем ближе к краю, тем сильнее тянет к центру. */
  const rad = Math.hypot(f.x, f.z);
  if (rad > ARENA_R * 0.72) {
    const k = (rad - ARENA_R * 0.72) / (ARENA_R * 0.28);
    mx -= (f.x / rad) * k * 2.4;
    mz -= (f.z / rad) * k * 2.4;
  }
  const ml = Math.hypot(mx, mz) || 1;
  const SPEED = 3.4;
  const tx = (mx / ml) * SPEED, tz = (mz / ml) * SPEED;
  /* Разгон, а не телепорт скорости: иначе походка дёргается. */
  f.vx += (tx - f.vx) * Math.min(1, dt * 5);
  f.vz += (tz - f.vz) * Math.min(1, dt * 5);
  const stepX = f.vx * dt, stepZ = f.vz * dt;
  f.x += stepX; f.z += stepZ;
  /* Смотрит ВСЕГДА на противника: он стреляет, а не гуляет. */
  const wantH = Math.atan2(dx, dz);
  let dh = wantH - f.h;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const turn = dh * Math.min(1, dt * 7);
  f.h += turn;
  f.turn = turn / Math.max(dt, 1e-4);
  /* Шаг копится по пройденному пути со знаком хода против взгляда. */
  const fwd = Math.sin(f.h) * stepX + Math.cos(f.h) * stepZ;
  const moved = Math.hypot(stepX, stepZ);
  f.stride += moved * Math.sign(fwd || 1) * 2.2;
  f.speed = Math.hypot(f.vx, f.vz);
  return dist;
}

/** Запись каста: та же форма, что пишет сим, плюс живые правки ползунков. */
function recordFor(f, foe) {
  const base = fxFor(f.kind, f.el, { hit: true, t: state.casts * 0.001 });
  if (!base) return null;
  const e = { ...base, who: f.id, skill: `sbx_${f.id}` };
  /* Геометрия — от НАСТОЯЩИХ позиций бойцов, а не от стойки прогона. */
  const dx = foe.x - f.x, dz = foe.z - f.z;
  const h = Math.atan2(dx, dz);
  const dist = Math.hypot(dx, dz);
  if (e.x != null) { e.x = f.x; e.z = f.z; }
  if (e.h != null) e.h = h;
  if (e.x0 != null) { e.x0 = f.x; e.z0 = f.z; }
  if (e.x1 != null) {
    /* Луч и рывок кончаются на противнике, но не дальше своей дальности. */
    const reach = Math.min(dist, knobValue(f, 'range', deliveryDefaults(f.kind).range ?? dist));
    e.x1 = f.x + Math.sin(h) * reach; e.z1 = f.z + Math.cos(h) * reach;
  }
  if (f.kind === 'zone') { e.x = foe.x; e.z = foe.z; e.h = h; }
  /* Живые правки кладутся ПОСЛЕДНИМИ и перекрывают всё, включая то, что
     обычно пишет сим: в этом весь смысл песочницы. */
  return { ...e, ...f.tune };
}

/** Каст плюс удар по противнику через полёт снаряда — чтобы попадание читалось. */
function fire(vfx, f, foe, dist) {
  const e = recordFor(f, foe);
  if (!e) return;
  state.casts++;
  window.__airenaSweep.cast(e);
  const speed = knobValue(f, 'speed', deliveryDefaults(f.kind).speed);
  const flight = (f.kind === 'bolt' || f.kind === 'lob') && speed ? Math.min(2, dist / speed) : 0.08;
  const hit = { ...fxFor('impact', f.el, { atom: 'damage', t: state.casts * 0.001 }), who: f.id, skill: `sbx_${f.id}`, x: foe.x, z: foe.z };
  setTimeout(() => { try { window.__airenaSweep.cast(hit); } catch { /* сцена ушла */ } }, flight * 1000);
}

/** Перезарядка: у зоны и щита она длиннее — иначе они наслаиваются сами на себя. */
const cooldownFor = (f) => {
  const d = deliveryDefaults(f.kind);
  const dur = knobValue(f, 'duration', d.duration || 0);
  return Math.max(0.55, dur * 0.8 + (f.kind === 'beam' || f.kind === 'cone' ? 0.9 : 1.3));
};

/* ── панель ──────────────────────────────────────────────────────────────── */

function boot() {
  return new Promise((done) => {
    const wait = () => {
      if (window.__airenaSweep && window.__airenaVfx && window.__airenaSweep.bodies().blue) { start(); done(); return; }
      setTimeout(wait, 120);
    };
    wait();
  });
}

function start() {
  const sweep = window.__airenaSweep;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const box = document.createElement('div');
  box.id = 'sbx';
  document.body.appendChild(box);

  /* Прогрев: по одному холостому касту на выбранную пару, чтобы `kit.tune`
     успел объявить опись ручек до первой отрисовки панели. Заодно снимает
     двухсекундный затык на компиляции узловых материалов (см.
     docs/vfx-notes/LIGHTNING-BRIEF.md). */
  const warm = (f) => { const e = recordFor(f, FIGHTERS[f.id === 'blue' ? 'orange' : 'blue']); if (e) { try { sweep.cast(e); } catch { /* ещё не готов */ } } };

  const setCam = (name) => { state.cam = name; sweep.cam(name === 'auto' ? null : CAMS[name]); render(); };

  function knobRows(f) {
    const declared = knobsFor(f.el, f.kind) || {};
    const all = { ...deliveryDefaults(f.kind), ...declared };
    const keys = Object.keys(all).filter((k) => typeof all[k] === 'number' && Number.isFinite(all[k]));
    if (!keys.length) return '<p class="note">Ручки появятся после первого каста этой пары — их объявляет сам модуль.</p>';
    keys.sort();
    return keys.map((k) => {
      const dflt = all[k];
      const v = knobValue(f, k, dflt);
      const [lo, hi, step] = rangeFor(k, dflt);
      const edited = f.tune[k] != null ? ' style="color:#7fd6e8"' : '';
      return `<div class="knob"><label title="${k}"${edited}>${k}</label><output>${(+v).toFixed(step < 0.01 ? 3 : 2)}</output>`
        + `<input type="range" data-knob="${k}" min="${lo}" max="${hi}" step="${step}" value="${v}"></div>`;
    }).join('');
  }

  function render() {
    const f = FIGHTERS[state.edit];
    const other = state.edit === 'blue' ? 'orange' : 'blue';
    box.innerHTML = `
      <h2>Песочница</h2>
      <p class="note">Двое дерутся сами. Крути ручки — они действуют со следующего каста, и боец сразу меняет дистанцию.</p>
      <div class="row" style="margin-top:8px">
        <button data-act="run" class="${state.run ? 'on' : ''}">${state.run ? '⏸ пауза' : '▶ пуск'}</button>
        <button data-act="reset">развести</button>
        <span class="tag" id="sbx-stat"></span>
      </div>
      <h3>Кого настраиваем</h3>
      <div class="row">
        ${['blue', 'orange'].map((id) => `<button data-edit="${id}" class="${state.edit === id ? 'on' : ''}">${id === 'blue' ? 'синий' : 'оранжевый'}</button>`).join('')}
      </div>
      <div class="who"><b class="${f.id}">умение</b>
        <select data-sel="el">${ELEMENTS.map((el) => `<option value="${el}" ${el === f.el ? 'selected' : ''}>${el} · ${REGISTRY[el].ru}</option>`).join('')}</select></div>
      <div class="who"><b></b>
        <select data-sel="kind">${CASTABLE.filter((k) => (REGISTRY[f.el].forms || CASTABLE).includes(k)).map((k) => `<option value="${k}" ${k === f.kind ? 'selected' : ''}>${k} · ${DELIVERIES[k] ? DELIVERIES[k].ru : k}</option>`).join('')}</select></div>
      <p class="note">рисует: <b>${drawnBy(f.el, f.kind)}</b> · держит дистанцию ${wantRange(f).toFixed(1)} м · перезарядка ${cooldownFor(f).toFixed(2)} с</p>
      <h3>Параметры умения</h3>
      ${knobRows(f)}
      <div class="row" style="margin-top:9px"><button data-act="defaults">сбросить ручки</button></div>
      <h3>Глаз</h3>
      <div class="row">
        <button data-cam="auto" class="${state.cam === 'auto' ? 'on' : ''}">решатель</button>
        ${Object.keys(CAMS).map((n) => `<button data-cam="${n}" class="${state.cam === n ? 'on' : ''}">${CAM_LABELS ? (CAM_LABELS[n] || n) : n}</button>`).join('')}
      </div>
      <p class="note">пробел — пауза, R — развести, 1–4 — глаза, 0 — решатель. Здоровье бесконечно, урона нет: песочница про вид и чувство параметра.</p>`;
    const other2 = FIGHTERS[other];
    void other2;
  }

  box.addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.edit) { state.edit = t.dataset.edit; render(); }
    else if (t.dataset.cam) setCam(t.dataset.cam);
    else if (t.dataset.act === 'run') { state.run = !state.run; render(); }
    else if (t.dataset.act === 'reset') reset();
    else if (t.dataset.act === 'defaults') { FIGHTERS[state.edit].tune = {}; render(); }
  });
  box.addEventListener('change', (ev) => {
    const t = ev.target;
    if (!t.dataset.sel) return;
    const f = FIGHTERS[state.edit];
    if (t.dataset.sel === 'el') {
      f.el = t.value;
      const forms = REGISTRY[f.el].forms || CASTABLE;
      if (!forms.includes(f.kind)) f.kind = CASTABLE.find((k) => forms.includes(k)) || 'beam';
      /* Стихия сменилась — ручки прежней формы к ней не относятся. */
      f.tune = {};
    } else { f.kind = t.value; f.tune = {}; }
    warm(f);
    render();
  });
  /* `input`, а не `change`: значение обязано меняться ПОКА ТЯНЕШЬ ползунок —
     в этом и была просьба «чтобы работало в реальном времени». */
  box.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!t.dataset.knob) return;
    const f = FIGHTERS[state.edit];
    f.tune[t.dataset.knob] = +t.value;
    const out = t.parentElement.querySelector('output');
    if (out) out.textContent = (+t.value).toFixed(+t.step < 0.01 ? 3 : 2);
    t.parentElement.querySelector('label').style.color = '#7fd6e8';
    const note = box.querySelectorAll('.note')[1];
    if (note) note.innerHTML = `рисует: <b>${drawnBy(f.el, f.kind)}</b> · держит дистанцию ${wantRange(f).toFixed(1)} м · перезарядка ${cooldownFor(f).toFixed(2)} с`;
  });

  function reset() {
    FIGHTERS.blue.x = BLUE.x; FIGHTERS.blue.z = BLUE.z; FIGHTERS.blue.vx = 0; FIGHTERS.blue.vz = 0;
    FIGHTERS.orange.x = ORANGE.x; FIGHTERS.orange.z = ORANGE.z; FIGHTERS.orange.vx = 0; FIGHTERS.orange.vz = 0;
  }

  addEventListener('keydown', (ev) => {
    if (ev.target && /input|select|textarea/i.test(ev.target.tagName)) return;
    if (ev.code === 'Space') { ev.preventDefault(); state.run = !state.run; render(); }
    else if (ev.key === 'r' || ev.key === 'R') reset();
    else if (ev.key === '0') setCam('auto');
    else {
      const n = Object.keys(CAMS)[+ev.key - 1];
      if (n) setCam(n);
    }
  });

  reset();
  /* Прогрев ДО первой отрисовки: опись ручек объявляет сам модуль внутри
     `kit.tune`, то есть она существует только после первого каста. Панель,
     нарисованная раньше, показала бы одну доставочную «дальность» вместо
     двух десятков настоящих ручек. */
  warm(FIGHTERS.blue);
  warm(FIGHTERS.orange);
  render();

  let last = performance.now() / 1000;
  const tick = () => {
    requestAnimationFrame(tick);
    const now = performance.now() / 1000;
    const dt = Math.min(0.05, now - last);
    last = now;
    if (!state.run) return;
    for (const id of ['blue', 'orange']) {
      const f = FIGHTERS[id], foe = FIGHTERS[id === 'blue' ? 'orange' : 'blue'];
      const dist = steer(f, foe, dt);
      sweep.move(id, { x: f.x, z: f.z, h: f.h, dt, t: now, speed: f.speed, stride: f.stride, turn: f.turn, action: 'idle', phase: 0 });
      f.cd -= dt;
      /* Стреляет, когда перезарядился И противник в пределах своей дальности
         с запасом в четверть: иначе ИИ палит в пустоту, и по кадру не понять,
         что дальность вообще на что-то влияет. */
      const reach = knobValue(f, 'range', deliveryDefaults(f.kind).range ?? wantRange(f)) * 1.25;
      const selfish = f.kind === 'self' || f.kind === 'jump' || f.kind === 'blink';
      if (f.cd <= 0 && (selfish || dist <= reach)) {
        f.cd = cooldownFor(f);
        fire(window.__airenaVfx, f, foe, dist);
      }
    }
    const st = box.querySelector('#sbx-stat');
    if (st) {
      const d = Math.hypot(FIGHTERS.blue.x - FIGHTERS.orange.x, FIGHTERS.blue.z - FIGHTERS.orange.z);
      st.textContent = `${d.toFixed(1)} м · ${state.casts} кастов`;
    }
  };
  tick();

  window.__sandbox = { state, fighters: FIGHTERS, reset, render };
}
