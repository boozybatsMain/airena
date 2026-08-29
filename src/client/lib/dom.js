/**
 * Разметка без фреймворка.
 *
 * A6 держит бандл в пределах 200 файлов и запрещает половину привычных
 * афордансов; экранов пятнадцать, и все они — списки, панели и одна кнопка.
 * Реакт здесь стоил бы больше своего веса — а вес считает F6.
 */

/** h('div#id.card.on', {onclick}, ...children) */
export function h(spec, props = null, ...kids) {
  const m = String(spec).match(/^([a-z][a-z0-9]*)?(#[\w-]+)?((?:\.[\w-]+)*)$/i);
  if (!m) throw new Error(`не разбирается селектор: ${spec}`);
  const el = document.createElement(m[1] || 'div');
  if (m[2]) el.id = m[2].slice(1);
  const cls = m[3] ? m[3].slice(1).split('.') : [];
  if (cls.length) el.className = cls.join(' ');
  if (props && (props.nodeType || Array.isArray(props) || typeof props === 'string')) {
    kids.unshift(props); props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = `${el.className} ${v}`.trim();
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) { add(el, k); continue; }
    el.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...kids) => { clear(el); add(el, kids); return el; };
export const $ = (s, root = document) => root.querySelector(s);

/** Число с тонким пробелом в разрядах — как в эталонном HUD. */
export const num = (n) => (n === null || n === undefined || Number.isNaN(n)
  ? '—' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));

/** Знаковое число: «+8» / «−12». Минус — типографский, не дефис. */
export const signed = (n) => (n === null || n === undefined ? '—'
  : (n > 0 ? `+${Math.round(n)}` : (n < 0 ? `−${Math.abs(Math.round(n))}` : '0')));

/** Часы: 0:37. Всегда две цифры на секундах — иначе строка дёргается. */
export function mmss(ms) {
  if (ms === null || ms === undefined || ms < 0) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * «14 ч назад», «вчера», «3 дня назад».
 *
 * Правило рода из копирайт-дисциплины сюда тоже достаёт: формы согласуются с
 * единицей времени, а не с чем-то снаружи, поэтому здесь их можно склонять.
 */
export function ago(ms, now = Date.now()) {
  const d = Math.max(0, now - ms);
  const m = Math.round(d / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`;
  const hh = Math.round(m / 60);
  if (hh < 24) return `${hh} ${plural(hh, 'час', 'часа', 'часов')} назад`;
  const dd = Math.round(hh / 24);
  return `${dd} ${plural(dd, 'день', 'дня', 'дней')} назад`;
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Панель со скруглённым срезом и прошорканной рамкой. */
export function panel(inner, { w = 0, h: hh = 0, seed = 7, lift = false, cls = '' } = {}) {
  const el = h(`div.panel${lift ? '.lift' : ''}${cls ? `.${cls}` : ''}`,
    h('div.bg'), h('div.fr'), h('div.in', inner));
  el.dataset.frame = JSON.stringify({ w, h: hh, seed });
  return el;
}

export const cap = (text) => h('div.hcut', text);

/** Пустое состояние: всегда причина и следующий шаг, никогда просто «пусто». */
export const empty = (hd, text, action = null) =>
  h('div.empty', h('div.hd', hd), h('div.t-body', text), action ? h('div', { style: { marginTop: '16px' } }, action) : null);

export const badge = (text, kind = '') => h(`span.badge${kind ? `.${kind}` : ''}`, text);

export const btn = (text, onclick, kind = 'primary') =>
  h(`button.btn.${kind}`, { onclick, type: 'button' }, text);
