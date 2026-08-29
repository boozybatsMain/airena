/**
 * Живой показ боя.
 *
 * Здесь важен один порядок, и он не переставляется: **сначала бой посчитан,
 * потом показан.** Зачётный прогон headless стоит 70 мс и уже записан в
 * таблицу (A3); показ — это ПОВТОР записанного, кадр в кадр, в реальном
 * времени. Детерминизм (A2) делает повтор точным, а не похожим.
 *
 * Что это даёт помимо честности:
 *  — обрыв связи не теряет бой: клиент переподключается и получает тот же
 *    матч с нужной секунды (D14);
 *  — клиент физически не может сообщить исход: он получает кадры и всё;
 *  — F5a («длительность боя держит сервер») выполняется буквально —
 *    таймер здесь, а не в браузере.
 *
 * Протокол — тот же, что уже понимает `src/viewer/main.js`, и это намеренно:
 * боевой экран утверждён поэлементно (§10.6), и переписывать его ради нового
 * сообщения значит рисковать утверждённым ради необязательного.
 */

import { CURTAIN } from './arena-loop.js';
import { runIsolated } from './sandbox/index.js';
import { kitOf } from './arena-loop.js';
import { DELIVERIES, EFFECTS } from '../skills/registry.js';

/**
 * Подписи умений для боевого HUD: короткое имя, которым мозг зовёт умение,
 * и русское название, которое читает игрок.
 */
function kitLabels(c) {
  const defs = kitOf(c);
  if (!defs) return null;
  const out = {};
  for (const [name, d] of Object.entries(defs)) {
    const eff = d.effects.map((e) => EFFECTS[e.id]?.ru || e.id).join('+');
    out[name] = { ru: `${DELIVERIES[d.kind]?.ru || d.kind}·${eff}`, element: d.element };
  }
  return out;
}
import { TICK_HZ } from '../core/config.js';

/** Сколько трансляций держим в памяти одновременно. */
const MAX_BROADCASTS = 24;
/** Сколько секунд после конца боя трансляция ещё жива (для догоняющих). */
const LINGER_SECONDS = 12;

export class Live {
  constructor(db, { compile, now = Date.now } = {}) {
    this.db = db;
    this.compile = compile;
    this.now = now;
    this.broadcasts = new Map();   // matchId -> Broadcast
    this.opening = new Set();      // matchId, пока считаются кадры
    this.sockets = new Set();
    this.featured = null;          // matchId, который смотрят гости
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.pump(), 1000 / TICK_HZ);
    this.timer.unref?.();
  }

  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  /**
   * Открыть трансляцию только что сыгранного матча.
   *
   * Кадры считаются заново тем же `(seed, brains)` — 70 мс. Хранить их с
   * зачётного прогона было бы дешевле по CPU и дороже по смыслу: тогда
   * «показ равен зачёту» держалось бы на том, что кто-то не забыл передать
   * массив, а не на детерминизме.
   */
  async open(matchRow, { a, b, featured = false }) {
    if (this.broadcasts.has(matchRow.id)) return this.broadcasts.get(matchRow.id);
    /* Заглушка на время расчёта: без неё два кадра подряд открывают один и
       тот же матч дважды и зритель получает две трансляции одного боя. */
    if (this.opening.has(matchRow.id)) return null;
    this.opening.add(matchRow.id);
    let frames;
    try {
      const out = await runIsolated(
        { [matchRow.aSlot]: a.brain_source, [matchRow.bSlot]: b.brain_source },
        { seed: matchRow.seed, record: true, curtainSeconds: CURTAIN,
          kits: { [matchRow.aSlot]: kitOf(a), [matchRow.bSlot]: kitOf(b) } },
      );
      frames = out.frames;
    } catch (e) {
      this.opening.delete(matchRow.id);
      return null;
    }
    this.opening.delete(matchRow.id);
    const bc = {
      id: matchRow.id,
      seed: matchRow.seed,
      frames,
      at: 0,
      startedAt: this.now(),
      over: null,
      meta: {
        [matchRow.aSlot]: { id: a.id, name: a.name, model: a.brain_model, library: !!a.is_library },
        [matchRow.bSlot]: { id: b.id, name: b.name, model: b.brain_model, library: !!b.is_library },
      },
      training: !!b.is_library || !!a.is_library,
      kits: {
        [matchRow.aSlot]: kitLabels(a),
        [matchRow.bSlot]: kitLabels(b),
      },
      result: matchRow,
      watchers: new Set(),
    };
    this.broadcasts.set(matchRow.id, bc);
    if (featured || !this.featured || !this.broadcasts.has(this.featured)) this.featured = matchRow.id;
    this.evict();
    return bc;
  }

  evict() {
    while (this.broadcasts.size > MAX_BROADCASTS) {
      /* Выкидываем самую старую БЕЗ зрителей. Трансляция со зрителем не
         выселяется никогда: зритель посреди боя, у которого пропала картинка,
         не отличает это от поломки. */
      let victim = null;
      for (const [id, b] of this.broadcasts) {
        if (b.watchers.size) continue;
        if (!victim || b.startedAt < victim.startedAt) victim = b;
      }
      if (!victim) break;
      this.broadcasts.delete(victim.id);
      if (this.featured === victim.id) this.featured = null;
    }
  }

  /** Подписать сокет на существо (или на витрину, если существа нет). */
  attach(ws, { creatureId = null, dev = false } = {}) {
    const sub = { ws, creatureId, dev, matchId: null, cursor: 0, alive: true };
    this.sockets.add(sub);
    ws.on('close', () => { this.detach(sub); });
    this.deliver(sub);
    return sub;
  }

  detach(sub) {
    sub.alive = false;
    this.sockets.delete(sub);
    for (const b of this.broadcasts.values()) b.watchers.delete(sub);
  }

  /** Что показать этому сокету прямо сейчас. */
  pick(sub) {
    if (sub.creatureId) {
      for (const b of this.broadcasts.values()) {
        if (b.meta[b.result.aSlot]?.id === sub.creatureId || b.meta[b.result.bSlot]?.id === sub.creatureId) return b;
      }
    }
    return this.featured ? this.broadcasts.get(this.featured) : null;
  }

  deliver(sub) {
    const b = this.pick(sub);
    if (!b) {
      /* Нет боя — это состояние, а не ошибка. Экран показывает «существо ищет
         бой, следующий через N с», и для этого ему нужно сообщение, а не
         тишина. */
      send(sub.ws, { type: 'idle' });
      return;
    }
    if (sub.matchId === b.id) return;
    sub.matchId = b.id;
    b.watchers.add(sub);
    /* Догоняющий получает тот же матч с текущей секунды — D14. */
    sub.cursor = b.at;
    send(sub.ws, {
      type: 'match',
      seed: b.seed,
      matchId: b.id,
      atSecond: b.frames[Math.min(b.at, b.frames.length - 1)]?.t ?? 0,
      training: b.training,
      tags: { octopus: b.meta.octopus?.name ?? '—', gorilla: b.meta.gorilla?.name ?? '—' },
      kits: b.kits || null,
      names: { octopus: b.meta.octopus?.name ?? '—', gorilla: b.meta.gorilla?.name ?? '—' },
      ids: { octopus: b.meta.octopus?.id ?? null, gorilla: b.meta.gorilla?.id ?? null },
      meta: {
        octopus: b.meta.octopus ? { model: b.meta.octopus.model, effort: '—', chars: null } : null,
        gorilla: b.meta.gorilla ? { model: b.meta.gorilla.model, effort: '—', chars: null } : null,
      },
    });
    if (b.frames[0]) send(sub.ws, { type: 'frame', frame: b.frames[Math.min(sub.cursor, b.frames.length - 1)] });
  }

  /** Один тик реального времени: продвинуть все трансляции и разослать кадры. */
  pump() {
    for (const b of this.broadcasts.values()) {
      if (b.at < b.frames.length) {
        const frame = b.frames[b.at++];
        for (const sub of b.watchers) {
          if (sub.alive && sub.matchId === b.id) send(sub.ws, { type: 'frame', frame });
        }
        if (b.at >= b.frames.length && !b.over) this.finish(b);
      } else if (b.over && this.now() - b.over.at > LINGER_SECONDS * 1000) {
        for (const sub of [...b.watchers]) { sub.matchId = null; b.watchers.delete(sub); }
        this.broadcasts.delete(b.id);
        if (this.featured === b.id) this.featured = null;
      }
    }
    /* Сокеты без матча пробуют подцепиться каждый тик — так «вошёл посреди
       боя → попадает сразу на арену» (§6.2) работает само собой. */
    for (const sub of this.sockets) if (sub.alive && !sub.matchId) this.deliver(sub);
  }

  finish(b) {
    const m = b.result;
    b.over = { at: this.now() };
    const payload = {
      type: 'over',
      matchId: m.id,
      winner: m.winner === null ? null
        : (m.winner === b.meta[m.aSlot]?.id ? m.aSlot : m.bSlot),
      reason: m.reason,
      stats: m.result ? { octopus: m.result.octopus, gorilla: m.result.gorilla } : {},
      logs: { octopus: [], gorilla: [] },
      deltas: m.deltas ?? null,
      training: b.training,
    };
    for (const sub of b.watchers) if (sub.alive) send(sub.ws, payload);
  }

  describe() {
    const b = this.featured ? this.broadcasts.get(this.featured) : null;
    if (!b) return null;
    return {
      matchId: b.id,
      atSecond: Math.round((b.at / TICK_HZ) * 10) / 10,
      totalSeconds: Math.round((b.frames.length / TICK_HZ) * 10) / 10,
      training: b.training,
    };
  }
}

function send(ws, v) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(v)); } catch { /* сокет умер между проверкой и отправкой */ }
  }
}
