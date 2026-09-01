/**
 * Маленький маршрутизатор и отдача статики.
 *
 * Отдельный файл, потому что в `api.js` должна быть видна только бизнес-логика:
 * когда разбор запроса и правила игры лежат вперемешку, правило игры меняют,
 * задев разбор, и наоборот. Плюс здесь живёт gzip — D16 требует, чтобы вес до
 * первого кадра был вопросом замера, а не веры.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createGzip } from 'node:zlib';
import { extname, join, normalize } from 'node:path';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** Что стоит жать. Картинки уже сжаты — второй проход только греет процессор. */
const GZIP = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg']);

export class Router {
  constructor() { this.routes = []; }

  add(method, pattern, handler) {
    const parts = pattern.split('/').filter(Boolean);
    this.routes.push({ method, parts, handler });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }

  match(method, path) {
    const got = path.split('/').filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method) continue;
      if (r.parts.length !== got.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < r.parts.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(':')) { params[p.slice(1)] = decodeURIComponent(got[i]); continue; }
        if (p !== got[i]) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }
}

/**
 * Защита от запроса, отправленного чужой страницей (CSRF).
 *
 * ── почему она нужна именно здесь и именно такая ───────────────────────────
 *
 * Кука сессии обязана быть `SameSite=None; Secure` — игра живёт внутри iframe
 * GENEX (F8), и без этого её просто не пришлют. Но `SameSite=None` означает
 * буквально: браузер приложит эту куку к запросу С ЛЮБОЙ страницы. Значит
 * любая страница, которую откроет игрок, может от его имени переписать набор
 * умений или сжечь единственное за жизнь бесплатное существо (F7) — оно
 * невосстановимо.
 *
 * Ни Origin, ни Referer, ни токена не проверялось нигде: замерено запросом с
 * чужим `Origin` и куки игрока — набор переписывался, ответ `{"ok":true}`.
 *
 * Два предохранителя, и оба нужны:
 *
 *   ORIGIN обязан совпасть с хостом запроса. Внутри iframe запросы идут
 *     от документа игры к её же серверу, поэтому Origin — наш. Чужая
 *     страница не может его подделать: заголовок ставит браузер.
 *
 *   ТЕЛО обязано быть `application/json`. Это не про разбор, а про то, что
 *     такой Content-Type нельзя послать «простым» запросом: браузер сначала
 *     спросит разрешения preflight-ом, а его мы не дадим. Форма, отправленная
 *     с чужой страницы, умеет только три типа, и json среди них нет.
 *
 * Отдельно от куки: заголовок `origin` браузер шлёт на все POST. Его
 * ОТСУТСТВИЕ значит «запрос не из браузера» — curl, тест, наш же инструмент.
 * Такие пропускаем: они не носят чужую куку, потому что её ставит браузер.
 * Пропускаем ровно тогда, когда куки в запросе нет; с кукой и без Origin —
 * отказ, потому что это уже похоже на попытку обойти проверку.
 */
export function crossSiteRefused(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return null;

  const origin = req.headers.origin;
  const host = req.headers.host;
  const hasCookie = !!req.headers.cookie;

  if (origin) {
    let sameHost = false;
    try { sameHost = new URL(origin).host === host; } catch { sameHost = false; }
    if (!sameHost) return { code: 'cross_site', message: 'запрос пришёл с чужой страницы' };
  } else if (hasCookie) {
    return { code: 'no_origin', message: 'запрос без источника, но с сессией' };
  }

  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type && type !== 'application/json') {
    return { code: 'bad_type', message: 'тело должно быть application/json' };
  }
  return null;
}

export function json(res, value, status = 200, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function fail(res, status, code, message, extra = {}) {
  /* У каждой ошибки есть КОД, а не только текст: экран обязан уметь показать
     разное на «лимит исчерпан» и «сервер упал», а разбирать русский текст
     регуляркой — это способ показать одно и то же. */
  json(res, { error: code, message, ...extra }, status);
}

const MAX_BODY = 64 * 1024;

export function readJson(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (d) => {
      n += d.length;
      if (n > MAX_BODY) { req.destroy(); reject(new Error('body too large')); return; }
      chunks.push(d);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

/**
 * Статика из списка монтирований. Обход директории закрыт нормализацией и
 * проверкой префикса — обе, потому что каждая по отдельности уже пропускала
 * что-нибудь в чьём-нибудь проекте.
 */
/**
 * Кеш статики.
 *
 * В продакшене — час: F6 меряет и ПОВТОРНЫЙ вход, и грузить 960 КБ three.js
 * заново на каждое открытие вкладки бессмысленно. В дев-режиме — никогда:
 * час кеша означает, что правка не видна, а проверяешь ты старый файл и
 * чинишь то, что уже починено. Этот абзац написан после того, как три
 * подряд «исправленные» ошибки продолжали воспроизводиться из кеша.
 */
const DEV = process.env.AIRENA_DEV === '1';

export function serveStatic(req, res, mounts, path) {
  for (const [prefix, dir] of mounts) {
    if (!path.startsWith(prefix)) continue;
    const rel = normalize(path.slice(prefix.length)).replace(/^(\.\.[/\\])+/, '');
    const file = join(dir, rel);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) continue;
    const ext = extname(file);
    const headers = {
      'content-type': MIME[ext] || 'application/octet-stream',
      /* Вьювер и ассеты меняются вместе с релизом; кеш на час — компромисс
         между F6 (быстрый повторный вход) и «увидеть свою правку». */
      'cache-control': (DEV || ext === '.html') ? 'no-store' : 'public, max-age=3600',
    };
    const accepts = String(req.headers['accept-encoding'] || '').includes('gzip');
    if (accepts && GZIP.has(ext)) {
      headers['content-encoding'] = 'gzip';
      headers.vary = 'accept-encoding';
      res.writeHead(200, headers);
      createReadStream(file).pipe(createGzip({ level: 6 })).pipe(res);
      return true;
    }
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
    return true;
  }
  return false;
}

/** Разбор Cookie без зависимостей. */
export function cookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setCookie(res, name, value, { days = 30, sameSite = 'None' } = {}) {
  /* SameSite=None + Secure — обязательны: игра живёт внутри iframe GENEX,
     а куку третьей стороны без этой пары браузер просто выбросит, и сессия
     будет теряться на каждой перезагрузке ровно у тех игроков, которые
     пришли по назначению. */
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${days * 86400}`,
    'HttpOnly',
    `SameSite=${sameSite}`,
  ];
  if (sameSite === 'None') bits.push('Secure');
  const prev = res.getHeader('set-cookie');
  const list = prev ? [].concat(prev) : [];
  list.push(bits.join('; '));
  res.setHeader('set-cookie', list);
}
