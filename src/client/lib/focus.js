/**
 * Keeping Tab inside the thing that is open.
 *
 * A panel that lets Tab walk out of it is a panel only to the mouse: the next
 * stop past its last row is the screen behind the veil, which is inert,
 * invisible and still focusable. Two places need exactly this — the History
 * detail panel (`screens/history.js`) and the mind picker (`ui/mindpicker.js`)
 * — and both carried a verbatim copy of it, comment included, each with a note
 * to the lead saying the hoist belonged in a shared module. This is that
 * module.
 *
 * It is deliberately not a "focus trap" component: nothing here opens, closes,
 * remembers the opener or restores focus. Those are decisions about a screen's
 * behaviour and they stay with the screen. This answers one question — where
 * may this Tab land — and answers it the same way for everybody.
 */

/**
 * What a Tab may land on inside an open panel.
 *
 * Broad on purpose: the filter below, not the selector, decides what is really
 * reachable, because only the DOM knows whether a node is disabled, hidden or
 * has been taken out of the tab order.
 */
export const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

/**
 * The reachable stops inside `root`, in tab order.
 *
 * `tabIndex >= 0` and not a `:not([tabindex="-1"])` selector: a native button
 * is tabbable without carrying the attribute, and one that has been taken out
 * of the order carries it. The size test drops what is not laid out — a
 * collapsed section's rows, a panel's own `tabindex="-1"` shell.
 */
export function focusables(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE)]
    .filter((el) => el.tabIndex >= 0 && !el.disabled && (el.offsetWidth || el.offsetHeight));
}

/**
 * Wrap Tab and Shift+Tab around `card`. Call it from a `keydown` listener that
 * has already established the key is Tab; it consumes the event only when it
 * actually moves focus, so a Tab in the middle of a list behaves natively.
 *
 * Focus standing outside the card at all — the opener still holds it, or a
 * click landed on the veil — is pulled to whichever end the direction asks
 * for, so the first Tab after opening enters the panel instead of leaving it.
 */
export function trapTab(e, card) {
  const els = focusables(card);
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  const cur = document.activeElement;
  if (!card.contains(cur)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
  if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
}
