/**
 * Formatting helpers shared by every screen. English only.
 */

/** 1214 → "1,214". null/undefined/NaN → "—". */
export const num = (n) => (n === null || n === undefined || Number.isNaN(n)
  ? '—' : Math.round(n).toLocaleString('en-US'));

/** +24 / −21 / 0 — with a real minus sign. */
export const signed = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—'
  : (n > 0 ? `+${num(n)}` : (n < 0 ? `−${num(Math.abs(n))}` : '0')));

/** "#782" */
export const rank = (n) => (n === null || n === undefined ? '—' : `#${num(n)}`);

/** 62 → "62%" */
export const pct = (n) => (n === null || n === undefined ? '—' : `${Math.round(n)}%`);

/** 28.4 s → "00:28" (battle clock). */
export function clock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 65000 ms → "1:05"; 8000 → "0:08". */
export function mmss(ms) {
  if (ms === null || ms === undefined || ms < 0) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Countdown label: < 60 s → "8s", else "1:05". Ceil so "0s" means now.
 *
 * THE UNIT IS PART OF THE NUMBER. Above a minute the colon says "this is time"
 * on its own — `1:05` cannot be read as anything else. Below it this returned a
 * bare integer, and the product printed `NEXT FIGHT IN 8` on both result cards
 * and set a naked `8` at 44 px under `NEXT FIGHT IN` on the empty career. The
 * one reader who most needs that number — somebody whose creature has never
 * fought, watching the only clock the screen offers — could not tell eight
 * seconds from eight minutes, and the difference decides whether they wait.
 */
export function countdown(ms) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return s < 60 ? `${s}s` : mmss(ms);
}

/** "18D 04H 12M" for a season clock. */
export function dhm(ms) {
  const t = Math.max(0, ms);
  const d = Math.floor(t / 864e5);
  const h = Math.floor((t % 864e5) / 36e5);
  const m = Math.floor((t % 36e5) / 6e4);
  return `${d}D ${String(h).padStart(2, '0')}H ${String(m).padStart(2, '0')}M`;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function ago(ts, now = Date.now()) {
  const m = Math.round(Math.max(0, now - ts) / 6e4);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "TODAY" / "YESTERDAY" / "3 SEP" — group headers in History. */
export function dayLabel(ts, now = Date.now()) {
  const a = new Date(ts); const b = new Date(now);
  const day = (d) => Math.floor((d.getTime() - d.getTimezoneOffset() * 6e4) / 864e5);
  const diff = day(b) - day(a);
  if (diff <= 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  return `${a.getDate()} ${MONTHS[a.getMonth()]}${a.getFullYear() !== b.getFullYear() ? ` ${a.getFullYear()}` : ''}`;
}

/** "0:04" for beat timestamps inside a match. */
export const beatTime = (seconds) => mmss(Math.round(seconds) * 1000);

/** Strings from legacy data may be Russian; the product shows English only. */
export const latinOnly = (s) => (typeof s === 'string' && !/[Ѐ-ӿ]/.test(s) ? s : '');

/** "12,843" with a noun: pluralize simply. */
export const plural = (n, one, many = `${one}s`) => `${num(n)} ${Math.abs(n) === 1 ? one : many}`;

/** Clamp a string to n chars with an ellipsis. */
export const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : (s || ''));
