/**
 * Третий транспорт генерации: ПОДПИСКА КОЛЛЕГИ, на машине коллеги.
 *
 * ── ЗАЧЕМ ОН ВООБЩЕ ЕСТЬ ───────────────────────────────────────────────────
 *
 * `subscription.js` умеет звать `claude` — но только тот, что стоит на ЭТОЙ
 * машине, с ЭТОЙ сессией. На сервере GENEX его нет: в образе нет бинарника и
 * некуда примонтировать учётку. Канал существовал и молчал.
 *
 * Здесь он получает вторую половину: сервер больше не зовёт `claude` сам, он
 * отдаёт запрос воркеру — маленькой программе, которую коллега запустил у
 * себя. Тот зовёт СВОЙ `claude` СВОЕЙ подпиской и возвращает текст.
 *
 * ── ПОЧЕМУ ИМЕННО ТАК, А НЕ «ПРИШЛИ НАМ ТОКЕН» ─────────────────────────────
 *
 * Anthropic закрыл второй вариант дословно (проверено 05.09,
 * code.claude.com/docs/en/legal-and-compliance): «developers may not collect,
 * store, or intermediate Claude.ai credentials or session tokens» и «may not …
 * route requests through Free, Pro, or Max plan credentials on behalf of their
 * users». Схема со сбором токенов — не «рискованная», а прямо названная.
 *
 * Разрешено ровно то, что делает этот файл: каждый пользуется своей подпиской
 * сам, на своей машине, войдя через собственный флоу Anthropic. Поэтому здесь
 * НЕТ и не может появиться ни одного поля под токен Anthropic. Единственный
 * секрет, который тут живёт, — свой: `worker_token`, выданный Airena, дающий
 * право забирать задания и больше ничего.
 *
 * ── ГРАНИЦА, КОТОРАЯ ДЕРЖИТ ВСЮ СХЕМУ (D172) ──────────────────────────────
 *
 * На подписке коллеги считается ТОЛЬКО его собственное существо. Заказ
 * постороннего игрока, уехавший на чужую подписку, — это ровно
 * «intermediate usage on end users' behalf», то есть запрещённая схема,
 * добытая окольным путём. Поэтому очередь заданий здесь не общая, а
 * ПОАККАУНТНАЯ: у запроса нет способа попасть к чужому воркеру, потому что
 * ключ словаря — идентификатор аккаунта, а не позиция в общей очереди.
 * Это не проверка, которую можно забыть вызвать; это форма данных.
 */

import { randomBytes } from 'node:crypto';

/** Сколько сервер держит длинный опрос, прежде чем ответить «пусто». */
export const POLL_MS = 25_000;

/**
 * Через сколько молчания воркер считается офлайн.
 *
 * Больше `POLL_MS`: воркер отвечает сразу после ответа сервера, но между
 * ответом и следующим запросом есть сеть, планировщик и его собственный
 * `claude`. Слишком короткое окно гасило бы кнопку у работающего воркера —
 * то есть врало бы игроку в самую неудачную секунду.
 */
export const OFFLINE_MS = 70_000;

/** Сколько живёт код привязки. Шесть знаков надиктовываются за это с запасом. */
export const PAIR_TTL_MS = 600_000;

/**
 * Алфавит кода привязки — без `O/0` и `I/1/L`.
 *
 * Код читают с экрана и вбивают в терминал руками. Пара похожих знаков
 * превращает «не подключается» в получасовой разговор, а стоит их убрать
 * ноль.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const nowMs = () => Date.now();

/** Код на шесть знаков. */
function makeCode() {
  const b = randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s;
}

const makeToken = () => randomBytes(32).toString('base64url');

/**
 * Кто вообще допускается запускать воркер — решение основателя, не база.
 *
 * Список короткий, меняется словом основателя и живёт в окружении:
 * `AIRENA_WORKER_ACCOUNTS=gleb@example.com,acc_17ab…`. Отдельная таблица
 * здесь означала бы экран администрирования, которым никто не пользуется, —
 * и ещё одну поверхность, где случайная строка открывает чужую подписку.
 *
 * Пустая переменная — канал выключен ЦЕЛИКОМ. Это умолчание выбрано намеренно:
 * забыть выставить список безопаснее, чем забыть его сузить.
 */
export function allowlistFromEnv(env = process.env) {
  const raw = String(env.AIRENA_WORKER_ACCOUNTS || '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Брокер между сервером и машинами коллег.
 *
 * ── ПОЧЕМУ ЗАДАНИЯ В ПАМЯТИ, А ТОКЕНЫ В БАЗЕ ──────────────────────────────
 *
 * Задания — в памяти, потому что очередь генерации и так в памяти: `pump()`
 * разбирает только `this.queue`, регидратации из базы нет, и перезапуск уже
 * сегодня теряет всё, что было в полёте. Класть сюда персистентность значило
 * бы чинить половину проблемы и делать вид, что починил целую.
 *
 * Токены — в базе, и это ровно обратное решение. Токен лежит у коллеги в
 * `~/.airena-worker.json`. Держи мы его в памяти — каждый деплой молча
 * отвязывал бы всех, и узнали бы они об этом не сообщением, а пропавшей
 * кнопкой в игре. Токен переживает перезапуск, потому что его хранит не тот,
 * кто перезапускается.
 */
export class WorkerHub {
  constructor({ db, allowlist = allowlistFromEnv(), pollMs = POLL_MS, now = nowMs } = {}) {
    this.db = db;
    this.allowlist = allowlist;
    this.pollMs = pollMs;
    this.now = now;
    /** accountId → { hostname, lastPollAt, since } */
    this.online = new Map();
    /** accountId → массив ожидающих запросов (FIFO). */
    this.pending = new Map();
    /** accountId → resolve длинного опроса, который прямо сейчас висит. */
    this.waiting = new Map();
    /** requestId → запрос, который воркер забрал и ещё не вернул. */
    this.inflight = new Map();
    /** code → { accountId, expiresAt } */
    this.codes = new Map();
  }

  // ── допуск ───────────────────────────────────────────────────────────────

  /** Разрешено ли этому аккаунту вообще иметь воркер. */
  allows(account) {
    if (!account || account.is_guest || !account.id) return false;
    if (this.allowlist.size === 0) return false;
    const id = String(account.id).toLowerCase();
    const mail = String(account.email_norm || '').toLowerCase();
    return this.allowlist.has(id) || (Boolean(mail) && this.allowlist.has(mail));
  }

  /**
   * На связи ли воркер этого аккаунта.
   *
   * Считается по времени последнего опроса, а не по флагу «подключился».
   * Флаг переживает падение воркера, обрыв сети и закрытый ноутбук — то есть
   * врёт ровно в тех трёх случаях, ради которых его и заводят.
   */
  isOnline(accountId) {
    const w = this.online.get(accountId);
    if (!w) return false;
    if (this.now() - w.lastPollAt > OFFLINE_MS) { this.online.delete(accountId); return false; }
    return true;
  }

  /** Кто сейчас на связи — для статуса и диагностики. */
  onlineList() {
    const out = [];
    for (const id of [...this.online.keys()]) {
      if (this.isOnline(id)) out.push({ accountId: id, ...this.online.get(id) });
    }
    return out;
  }

  // ── привязка ─────────────────────────────────────────────────────────────

  /** Код для экрана привязки. Старый код того же аккаунта гасится. */
  startPairing(accountId) {
    for (const [code, v] of this.codes) if (v.accountId === accountId) this.codes.delete(code);
    let code = makeCode();
    while (this.codes.has(code)) code = makeCode();
    const expiresAt = this.now() + PAIR_TTL_MS;
    this.codes.set(code, { accountId, expiresAt });
    return { code, expiresInSec: Math.round(PAIR_TTL_MS / 1000) };
  }

  /**
   * Обмен кода на токен. Код одноразовый — гасится немедленно, даже при
   * успехе, потому что второй воркер на том же коде это не «удобно», а
   * молчаливое раздвоение канала.
   */
  claimPairing(code, hostname = '') {
    const key = String(code || '').toUpperCase().replace(/[\s-]/g, '');
    const rec = this.codes.get(key);
    if (!rec) return null;
    this.codes.delete(key);
    if (this.now() > rec.expiresAt) return null;
    const token = makeToken();
    this.db.prepare(`INSERT INTO worker_token (token, account_id, hostname, created_at, last_seen_at)
                     VALUES (?, ?, ?, ?, ?)`)
      .run(token, rec.accountId, String(hostname || '').slice(0, 120), this.now(), this.now());
    return { token, accountId: rec.accountId };
  }

  /** Аккаунт по токену воркера, или null. */
  accountByToken(token) {
    if (!token) return null;
    const row = this.db.prepare('SELECT account_id FROM worker_token WHERE token = ?').get(token);
    if (!row) return null;
    this.db.prepare('UPDATE worker_token SET last_seen_at = ? WHERE token = ?').run(this.now(), token);
    return this.db.prepare('SELECT * FROM account WHERE id = ?').get(row.account_id) || null;
  }

  /** Отвязать — по токену (сам воркер) или все токены аккаунта. */
  revoke({ token = null, accountId = null }) {
    if (token) this.db.prepare('DELETE FROM worker_token WHERE token = ?').run(token);
    else if (accountId) this.db.prepare('DELETE FROM worker_token WHERE account_id = ?').run(accountId);
  }

  // ── работа ───────────────────────────────────────────────────────────────

  /**
   * Спросить у воркера коллеги один ответ модели.
   *
   * Возвращает промис, который разрешится, когда воркер принесёт текст, и
   * отвергнется по стене. Стена стоит ЗДЕСЬ, на сервере, а не в воркере:
   * воркер может быть убит, усыплён вместе с ноутбуком или потерян сетью, и
   * во всех трёх случаях он ничего не сообщит. Задание, чья судьба зависит от
   * добросовестности удалённой стороны, зависает навсегда.
   */
  ask({ accountId, system, prompt, model, effort, timeoutMs }) {
    if (!this.isOnline(accountId)) {
      return Promise.reject(new WorkerError('offline', 'the worker of this account is not connected'));
    }
    const requestId = randomBytes(12).toString('base64url');
    return new Promise((resolve, reject) => {
      const req = {
        requestId, accountId, system, prompt, model, effort, timeoutMs,
        resolve, reject, queuedAt: this.now(), takenAt: null,
      };
      req.timer = setTimeout(() => {
        this.#drop(req);
        reject(new WorkerError('wall', `the worker did not answer within ${Math.round(timeoutMs / 1000)} s`));
      }, timeoutMs);
      /* `unref` — чтобы висящая стена не держала процесс при выключении. */
      req.timer.unref?.();

      const q = this.pending.get(accountId) || [];
      q.push(req);
      this.pending.set(accountId, q);

      /* Если воркер уже висит в длинном опросе — отдать немедленно. */
      const wake = this.waiting.get(accountId);
      if (wake) { this.waiting.delete(accountId); wake(); }
    });
  }

  /**
   * Длинный опрос воркера. Возвращает задание или null через `pollMs`.
   *
   * Ровно ОДНО задание за раз на аккаунт: у коллеги одна подписка и один
   * `claude`, а два параллельных высоких `--effort` на одной учётке — это
   * очередь на стороне Anthropic, которую мы не видим и не контролируем.
   * Лучше честная очередь у нас, где видно, кто ждёт.
   */
  async next({ accountId, hostname = '' }) {
    const prev = this.online.get(accountId);
    this.online.set(accountId, {
      hostname: String(hostname || prev?.hostname || '').slice(0, 120),
      lastPollAt: this.now(),
      since: prev?.since ?? this.now(),
    });

    let req = this.#take(accountId);
    if (!req) {
      await new Promise((resolve) => {
        const timer = setTimeout(() => { this.waiting.delete(accountId); resolve(); }, this.pollMs);
        timer.unref?.();
        this.waiting.set(accountId, () => { clearTimeout(timer); resolve(); });
      });
      req = this.#take(accountId);
    }
    if (!req) return null;

    req.takenAt = this.now();
    this.inflight.set(req.requestId, req);
    return {
      requestId: req.requestId,
      system: req.system || '',
      prompt: req.prompt,
      model: req.model,
      effort: req.effort,
      /* Воркеру отдаётся ОСТАТОК стены, а не исходное значение: запрос мог
         пролежать в очереди, и полный отсчёт заново сделал бы серверную
         стену недостижимой — она бы всегда срабатывала раньше. */
      timeoutMs: Math.max(30_000, req.timeoutMs - (this.now() - req.queuedAt)),
    };
  }

  /** Воркер принёс ответ (или отказ). */
  deliver({ accountId, requestId, body }) {
    const req = this.inflight.get(requestId);
    /* Чужой аккаунт по чужому requestId — не «не найдено», а попытка забрать
       результат из чужой очереди. Ответ один и тот же, чтобы по коду ошибки
       нельзя было перебирать существующие идентификаторы. */
    if (!req || req.accountId !== accountId) return false;
    this.#drop(req);
    if (body && body.ok) {
      req.resolve({
        text: String(body.text || ''),
        usage: body.usage || {},
        model: body.model || req.model,
        costUsd: Number(body.costUsd) || 0,
        durationMs: Number(body.durationMs) || (this.now() - req.takenAt),
      });
    } else {
      const code = ['wall', 'no_key', 'http'].includes(body?.code) ? body.code : 'http';
      req.reject(new WorkerError(code, String(body?.message || 'the worker refused').slice(0, 300)));
    }
    return true;
  }

  /**
   * Воркер выключился. Всё, что он не успел вернуть, отвергается СРАЗУ, а не
   * по стене: игрок, чей коллега нажал Ctrl+C, не должен ждать полчаса, чтобы
   * узнать то, что серверу уже известно.
   */
  bye(accountId) {
    this.online.delete(accountId);
    const wake = this.waiting.get(accountId);
    if (wake) { this.waiting.delete(accountId); wake(); }
    for (const req of [...this.inflight.values(), ...(this.pending.get(accountId) || [])]) {
      if (req.accountId !== accountId) continue;
      this.#drop(req);
      req.reject(new WorkerError('offline', 'the worker disconnected before finishing'));
    }
    this.pending.delete(accountId);
  }

  #take(accountId) {
    const q = this.pending.get(accountId);
    if (!q || q.length === 0) return null;
    const req = q.shift();
    if (q.length === 0) this.pending.delete(accountId);
    return req;
  }

  #drop(req) {
    clearTimeout(req.timer);
    this.inflight.delete(req.requestId);
    const q = this.pending.get(req.accountId);
    if (q) {
      const i = q.indexOf(req);
      if (i >= 0) q.splice(i, 1);
      if (q.length === 0) this.pending.delete(req.accountId);
    }
  }
}

/** Отказ канала воркера. `code` совпадает с кодами `LlmError` намеренно. */
export class WorkerError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
