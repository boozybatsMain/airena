/**
 * Markup without a framework. `h('div#id.a.b', {props}, ...children)`.
 *
 * Props: `class`, `style` (object), `html`, `dataset`, `on<event>` handlers,
 * `value`/`checked` as properties, everything else as attributes.
 */
export function h(spec, props = null, ...kids) {
  const spec2 = String(spec);
  const m = spec2.match(/^([a-z][a-z0-9]*)?((?:[#.][\w-]+)*)$/i);
  if (!m) throw new Error(`bad selector: ${spec}`);
  const el = document.createElement(m[1] || 'div');
  const cls = [];
  for (const part of (m[2] || '').match(/[#.][\w-]+/g) || []) {
    if (part[0] === '#') el.id = part.slice(1); else cls.push(part.slice(1));
  }
  if (cls.length) el.className = cls.join(' ');
  if (props && (props.nodeType || Array.isArray(props) || typeof props === 'string' || typeof props === 'number')) {
    kids.unshift(props); props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = `${el.className} ${v}`.trim();
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'value' || k === 'checked') el[k] = v;
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
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];

/** Inline SVG from a string, as an element. */
export function svg(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

/** Wait for a CSS transition/animation-length pause. */
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Next animation frame, as a promise. */
export const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Empty state: a reason and a next step, never just "empty". */
export const empty = (title, text, action = null, glyph = null) =>
  h('div.empty', glyph ? h('div.circle', glyph) : null,
    h('div.hd', title), text ? h('div.t-small', text) : null, action);
