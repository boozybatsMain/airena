/**
 * FATAL — the two ways the product can stop being a product (§6.8).
 *
 * Not a screen in the router's sense: nothing routes here, `app.js` calls
 * `show()` when the renderer refuses to start or the very first request never
 * comes back. It draws over everything, on the same warm ground as the rest of
 * the product, and offers one button.
 *
 * WHY IT SAYS WHICH OF THE TWO IT IS. "Something went wrong" is the sentence
 * that makes a person reload eleven times: it names no cause, so it suggests no
 * next step. A dead network and a browser that cannot draw need opposite things
 * — wait a minute, or open the page somewhere else — and the only cheap moment
 * to say which is right now.
 *
 * There is no spinner and no retry loop. A page that quietly retries in the
 * background while showing a dead screen is the same lie with more moving
 * parts; the button is honest and the person keeps the choice.
 */

import { h, mount, $ } from '../lib/dom.js';

const KINDS = {
  offline: {
    word: 'The arena is unreachable',
    line: 'The fights are running on the server whether this page watches or not, '
      + 'so nothing has been lost. What broke is the way in.',
  },
  /*
   * "the graphics card … this browser did not start it" left `it` with two
   * candidates — the card or the drawing — and described an action nobody can
   * picture a browser performing. `your graphics card … could not reach it`
   * names the owner, gives `it` one antecedent, and says the true shape of the
   * failure: the hardware is there, the way to it is not. The trailing "on a
   * machine with a screen" was machine-room speech for the same thought the
   * sentence already carries.
   */
  norender: {
    word: 'Your browser cannot draw the arena',
    line: 'The fight is drawn by your graphics card, and this browser could not reach it. '
      + 'A recent Chrome, Edge or Safari can.',
  },
};

let shown = null;

/**
 * Draw the fatal card. `kind` ∈ 'offline' | 'norender'.
 *
 * Idempotent for the same kind: the renderer can fail twice in one boot (module
 * load, then adapter request) and the second failure must not stack a second
 * card on the first.
 */
export function show(kind = 'offline') {
  const k = KINDS[kind] ? kind : 'offline';
  if (shown === k) return;
  shown = k;
  const { word, line } = KINDS[k];
  const root = $('#overlay');
  if (!root) return;
  mount(root, h('div.fatal', { role: 'alertdialog', 'aria-label': word },
    h('div.fatal-in',
      h('div.t-state.fatal-word', word),
      h('p.t-body.fatal-line', line),
      h('button.btn.primary.big', { type: 'button', onclick: () => location.reload() }, 'Reload'))));
}

/** Take it back down — used when the cause turns out to be transient. */
export function hide() {
  shown = null;
  const root = $('#overlay');
  const el = root?.querySelector('.fatal');
  if (el) el.remove();
}

/*
 * Screenshot hook (§10). Neither kind has a route — they are states of the
 * shell, not places — so `?ui=fatal-offline` / `?ui=fatal-norender` on any
 * route arms them. Read once, at import, from the same two places `app.js`
 * reads `ui` from; anything else leaves this file inert.
 */
try {
  const hash = location.hash.replace(/^#/, '');
  const q = hash.indexOf('?');
  const ui = (q >= 0 ? new URLSearchParams(hash.slice(q + 1)).get('ui') : null)
    || new URLSearchParams(location.search).get('ui');
  if (ui === 'fatal-offline' || ui === 'fatal-norender') {
    requestAnimationFrame(() => show(ui.slice('fatal-'.length)));
  }
} catch { /* no window worth the name — nothing to arm */ }
