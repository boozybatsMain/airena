/**
 * The client store — one object, a few keys, subscribers by key.
 *
 * Screens read `store` and subscribe with `on(key, fn)`; `app.js` is the only
 * writer of `route` and the raw `live` fields (from the socket), `live.js`
 * refines `live.phase` for VS/result timing. Nothing else mutates the store
 * directly — call `set()` so subscribers fire.
 */
import { get } from './api.js';

export const store = {
  session: null,
  route: null,
  live: { phase: 'connecting', match: null, frame: null, over: null, mode: 'live', idle: false },
  debug: null,
  /* the last known rating/rank of my creature before the current fight — the
     result card compares against these. */
  before: null,
};

const subs = new Map();

export function on(key, fn) {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(fn);
  return () => subs.get(key)?.delete(fn);
}

function emit(key) {
  for (const fn of subs.get(key) || []) { try { fn(store[key], store); } catch (e) { console.error(e); } }
  for (const fn of subs.get('*') || []) { try { fn(key, store); } catch (e) { console.error(e); } }
}

/** Shallow merge per key; `live` is merged one level deeper. */
export function set(patch) {
  for (const [k, v] of Object.entries(patch)) {
    store[k] = (k === 'live' && v && typeof v === 'object') ? { ...store.live, ...v } : v;
    emit(k);
  }
}

/**
 * Re-fetch the session. Converts the server's relative `nextFightIn` into a
 * local `nextFightAt` (two clocks never agree; one does), reopens the socket
 * when the account changed, and re-points the socket at a creature that
 * appeared mid-session.
 */
export async function refreshSession() {
  const before = store.session;
  const s = await get('/api/session');
  if (s && s.nextFightIn != null) s.nextFightAt = Date.now() + s.nextFightIn;
  else if (s) s.nextFightAt = null;
  set({ session: s });
  if (before?.accountId && s?.accountId && before.accountId !== s.accountId) {
    try { window.__airenaReconnect?.(); } catch { /* no socket yet */ }
  }
  const was = before?.creature?.id ?? null;
  const now = s?.creature?.id ?? null;
  if (was !== now) {
    try { window.__airenaSend?.({ cmd: 'watch', creatureId: now }); } catch { /* no socket yet */ }
  }
  return s;
}

/** Remember rating/rank before a fight so the result card can show the arrow. */
export function snapshotBefore() {
  const c = store.session?.creature;
  if (!c) return;
  store.before = { rating: c.rating, rank: c.rank ?? null, at: Date.now() };
}
