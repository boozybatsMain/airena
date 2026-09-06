/**
 * Кто это играет.
 *
 * Личность даёт GENEX: игра получает `embedToken`, из него `sub` и
 * подтверждённая почта. Своих паролей у Airena нет и не будет — A4 отдаёт
 * идентичность платформе, и заводить вторую значит заводить вторую поверхность
 * утечки ради нуля пользы.
 *
 * Гость — это не «неудобный пользователь», а первая половина воронки: он
 * смотрит бой и играет библиотечным существом (F7). Стена аккаунта стоит на
 * «сохранить это существо» (10.2.2) — после первого боя, не до генерации, и
 * это единственное место, где она стоит.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/** Гостевая куки живёт столько же, сколько имеет смысл её история. */
export const GUEST_TTL_DAYS = 30;

/**
 * Секрет подписи сессии.
 *
 * Запасное значение в коде — это не «удобно для разработки», это форгируемый
 * токен в продакшене у любого, кто читал репозиторий: подписать себе
 * `{u:"<чужой id>"}` становится однострочником, и вместе с сессией уезжает
 * чужое существо, чужая лестница и чужой лимит генераций.
 *
 * Поэтому дефолт есть ТОЛЬКО в дев-режиме, и он кричит о себе. В продакшене
 * без переменной процесс не поднимается вовсе — падение на старте видно, а
 * тихая уязвимость нет.
 */
/* Режим один на весь сервер и объяснён в `mode.js`: дев-стенд — это
   ОТСУТСТВИЕ `AIRENA_SECRET`, а не выставленная переменная. */
import { DEV } from './mode.js';
const SECRET = (() => {
  const v = process.env.AIRENA_SECRET;
  if (v && v.length >= 24) return v;
  if (!DEV) {
    throw new Error('AIRENA_SECRET is not set (24 characters or more are needed). '
      + 'Sessions must not be signed with a value from the sources: they would become forgeable.');
  }
  if (v) console.warn('  AIRENA_SECRET is shorter than 24 characters — production will refuse it');
  console.warn('  dev mode: sessions are signed with a value from the sources, never do this in production');
  return 'dev-secret-not-for-production';
})();

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = createHmac('sha256', SECRET).update(body).digest('base64url');
  /* Сравнение постоянного времени: подпись сессии — это ровно тот случай, для
     которого timingSafeEqual существует. Разная длина роняет его, поэтому
     сначала длина. */
  if (!mac || mac.length !== want.length) return null;
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (p.exp && p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}

/**
 * Нормализация почты для дедупликации бесплатного существа (F7).
 *
 * Точки и `+tag` в gmail — это один и тот же ящик, и «одно бесплатное существо
 * на аккаунт» без этой нормализации означает «одно бесплатное существо на
 * запятую в адресе».
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const s = email.trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at <= 0) return null;
  let user = s.slice(0, at); let host = s.slice(at + 1);
  const plus = user.indexOf('+');
  if (plus > 0) user = user.slice(0, plus);
  if (host === 'gmail.com' || host === 'googlemail.com') {
    user = user.replace(/\./g, '');
    /*
     * И САМ ДОМЕН ТОЖЕ. Точки убирались у обоих, а домен оставался как есть,
     * так что `a@gmail.com` и `a@googlemail.com` — один и тот же ящик — давали
     * две разные нормализованные строки и, значит, два бесплатных существа на
     * один почтовый ящик. F7 обещает одно.
     */
    host = 'gmail.com';
  }
  return `${user}@${host}`;
}

export function ensureGuest(db, cookieToken) {
  const p = verify(cookieToken);
  if (p?.g) {
    const row = db.prepare('SELECT * FROM account WHERE id = ?').get(p.g);
    if (row) {
      db.prepare('UPDATE account SET last_seen_at = ? WHERE id = ?').run(Date.now(), row.id);
      return { account: row, token: cookieToken, fresh: false };
    }
  }
  const id = `g_${randomUUID().slice(0, 12)}`;
  const now = Date.now();
  db.prepare(`INSERT INTO account (id, genex_sub, email_norm, created_at, last_seen_at, is_guest)
              VALUES (?, NULL, NULL, ?, ?, 1)`).run(id, now, now);
  return {
    account: db.prepare('SELECT * FROM account WHERE id = ?').get(id),
    token: sign({ g: id, exp: now + GUEST_TTL_DAYS * 864e5 }),
    fresh: true,
  };
}

/**
 * Стена аккаунта: гость становится владельцем, его существа переезжают к нему.
 *
 * Переезд, а не пересоздание — гость уже посмотрел бой своим существом, и
 * потерять его на регистрации значит наказать за регистрацию ровно в тот
 * момент, когда мы её просим.
 */
export function claimAccount(db, guestId, { sub, email }) {
  const emailNorm = normalizeEmail(email);
  if (!sub) return { error: 'no_sub' };
  const now = Date.now();

  let acct = db.prepare('SELECT * FROM account WHERE genex_sub = ?').get(sub);
  if (!acct && emailNorm) acct = db.prepare('SELECT * FROM account WHERE email_norm = ?').get(emailNorm);

  if (!acct) {
    const id = `u_${randomUUID().slice(0, 12)}`;
    db.prepare(`INSERT INTO account (id, genex_sub, email_norm, created_at, last_seen_at, is_guest)
                VALUES (?, ?, ?, ?, ?, 0)`).run(id, sub, emailNorm, now, now);
    acct = db.prepare('SELECT * FROM account WHERE id = ?').get(id);
  } else {
    db.prepare(`UPDATE account SET genex_sub = COALESCE(genex_sub, ?), email_norm = COALESCE(email_norm, ?),
                last_seen_at = ?, is_guest = 0 WHERE id = ?`).run(sub, emailNorm, now, acct.id);
  }

  let moved = 0;
  if (guestId && guestId !== acct.id) {
    /* Библиотечное существо не переезжает: оно общее и не принадлежит никому. */
    const r = db.prepare(`UPDATE creature SET owner_id = ?, updated_at = ?
                          WHERE owner_id = ? AND is_library = 0`).run(acct.id, now, guestId);
    moved = r.changes;
    if (moved) db.prepare('UPDATE account SET free_creature_used = 1 WHERE id = ?').run(acct.id);
    db.prepare(`DELETE FROM account WHERE id = ? AND is_guest = 1`).run(guestId);
  }
  return {
    account: db.prepare('SELECT * FROM account WHERE id = ?').get(acct.id),
    token: sign({ u: acct.id, exp: now + 180 * 864e5 }),
    moved,
  };
}

export function accountFromToken(db, token) {
  const p = verify(token);
  if (!p) return null;
  const id = p.u || p.g;
  if (!id) return null;
  const row = db.prepare('SELECT * FROM account WHERE id = ?').get(id);
  if (row) db.prepare('UPDATE account SET last_seen_at = ? WHERE id = ?').run(Date.now(), id);
  return row || null;
}
