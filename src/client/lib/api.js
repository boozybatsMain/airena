/**
 * Разговор с сервером.
 *
 * D22: токен сессии ездит заголовком `Authorization: Bearer`, а не кукой.
 * Игра живёт внутри iframe GENEX (F8), а куку третьей стороны Safari
 * блокирует по умолчанию — сессия на куке терялась бы на каждой перезагрузке
 * ровно у тех игроков, которые пришли по назначению. Кука сервером тоже
 * ставится, как запасной путь на собственном домене.
 *
 * Ошибки не глотаются и не превращаются в `null`: у каждой есть КОД, и экран
 * обязан уметь показать разное на «лимит исчерпан» и «сервер упал».
 */

const KEY = 'airena.session';

/**
 * Адрес бэкенда. Пусто = свой хост, и тогда всё ровно как было.
 *
 * Ставится в `index.html` до загрузки модулей (см. комментарий там): статику
 * может раздавать GENEX, а ручки живут на отдельном сервере. Читается на
 * каждый вызов, а не один раз при импорте, — модуль грузится раньше, чем
 * страница успевает решить, и кеш в константе сохранил бы пустую строку.
 */
const base = () => (typeof window !== 'undefined' && window.__api) || '';

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message || code);
    this.status = status; this.code = code;
    Object.assign(this, extra);
  }
}

/** localStorage может быть недоступен целиком — приватный режим роняет геттер. */
function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    return v;
  } catch { return null; }
}

export const token = () => store(KEY);
export const setToken = (t) => store(KEY, t);

export async function call(path, { method = 'GET', body = null, signal = null } = {}) {
  const headers = { accept: 'application/json' };
  const t = token();
  if (t) headers.authorization = `Bearer ${t}`;
  if (body) headers['content-type'] = 'application/json';

  let res;
  try {
    /* `include`, а не `same-origin`: на своём домене это то же самое, а с
       отдельным бэкендом кука сессии (запасной путь к личности) иначе не
       поедет вовсе. Главный путь всё равно заголовок — D22. */
    res = await fetch(base() + path, { method, headers, signal, body: body ? JSON.stringify(body) : null, credentials: 'include' });
  } catch (e) {
    throw new ApiError(0, 'offline', 'The server is not answering. The fights run on it, so nothing is lost.');
  }
  /* Сервер отдаёт свежий токен на первом же ответе — гость заводится молча. */
  const fresh = res.headers.get('x-airena-session');
  if (fresh) setToken(fresh);

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok) {
    throw new ApiError(res.status, data?.error || 'http', data?.message || `Error ${res.status}`, data || {});
  }
  return data;
}

export const get = (p, o) => call(p, o);
export const post = (p, body, o) => call(p, { ...o, method: 'POST', body: body || {} });

/**
 * Аналитика (A7). Копится и уходит пачкой — по событию на запрос это лишний
 * трафик в кадре, а кадр здесь стоит дорого.
 */
const pending = [];
let flushing = null;

export function track(name, props = {}) {
  pending.push({ name, props });
  if (flushing) return;
  flushing = setTimeout(() => {
    flushing = null;
    const batch = pending.splice(0, pending.length);
    if (batch.length) post('/api/events', { events: batch }).catch(() => { /* аналитика не роняет экран */ });
  }, 1500);
}

/* Событие, потерянное при закрытии вкладки, — это дыра ровно в тех метриках
   §14, которые про отвал. */
addEventListener('pagehide', () => {
  if (!pending.length) return;
  const batch = pending.splice(0, pending.length);
  try {
    navigator.sendBeacon?.('/api/events', new Blob([JSON.stringify({ events: batch })], { type: 'application/json' }));
  } catch { /* отправить не вышло — не мешаем закрытию */ }
});
