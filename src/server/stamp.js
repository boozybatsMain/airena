/**
 * Штамп сборки — версия, которой помечается вся статика.
 *
 * Нужен двум разным людям сразу, и это единственная причина, по которой он
 * решается на сервере, а не руками:
 *
 *  — В ПРОДАКШЕНЕ он позволяет кешировать `three.webgpu.min.js` навсегда.
 *    F6 меряет и повторный вход тоже, а 960 КБ модулей, перекачиваемых на
 *    каждое открытие вкладки, — это провал бюджета у возвращающегося игрока.
 *  — В РАЗРАБОТКЕ он меняется от правки файла, и правка видна сразу. Без
 *    этого час кеша означает, что чинишь ты то, что уже починено: три
 *    подряд «исправленные» ошибки в этом проекте продолжали воспроизводиться
 *    из памяти браузера, и на их поиск ушёл час.
 *
 * Штамп — максимальное время правки среди файлов клиента. Не хеш содержимого:
 * хеш пришлось бы считать на каждый запрос или изобретать шаг сборки, а A6
 * держит проект без него.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WATCH = ['src/client', 'src/viewer', 'bodies'];

let cache = { at: 0, value: null };

function newest(dir, deadline) {
  let max = 0;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { max = Math.max(max, newest(p, deadline)); continue; }
    try { max = Math.max(max, statSync(p).mtimeMs); } catch { /* исчез между чтением и статом */ }
  }
  return max;
}

/**
 * @param {string} root корень репозитория
 * @param {boolean} dev в дев-режиме пересчитывается каждую секунду
 */
export function buildStamp(root, dev = false) {
  const ttl = dev ? 1000 : 3600_000;
  if (cache.value && Date.now() - cache.at < ttl) return cache.value;
  let max = 0;
  for (const d of WATCH) max = Math.max(max, newest(join(root, d)));
  cache = { at: Date.now(), value: Math.round(max).toString(36) };
  return cache.value;
}

/**
 * Проштамповать ссылки в index.html.
 *
 * Штампуются только СВОИ пути (начинаются со слэша) — карта импортов, стили,
 * модули и предзагрузки. Внешних тут нет и быть не должно: шрифты лежат у нас
 * именно ради F6.
 */
export function stampHtml(html, v) {
  return html
    .replace(/(href|src)="(\/[^"?#]+\.(?:js|mjs|css|woff2|png|svg))"/g, `$1="$2?v=${v}"`)
    .replace(/"(\/vendor\/[^"?#]+\.js)"/g, `"$1?v=${v}"`)
    .replace('<head>', `<head>\n<script>window.__v=${JSON.stringify(v)}</script>`);
}
