/**
 * Адаптация — существо улучшается само.
 *
 * ЗАФИКСИРОВАНО 28.08 (§7.2а): апгрейд мозга примерно раз в 10 боёв, БЕЗ
 * какого-либо участия игрока — ни кнопки, ни выбора приоритетов, ни
 * подтверждения. Интерфейса адаптации нет; на странице существа — журнал.
 *
 * И бюджетный предохранитель, без которого это решение убивает экономику:
 * бой раз в минуту → адаптация раз в ~10 минут на существо. Если бы каждая
 * адаптация была LLM-вызовом, одно существо жгло бы $0.3–16 В ЧАС. Поэтому
 * **адаптация обязана быть симуляционной**: перебор числовых порогов мозга
 * (их в мозге 14–24) с отбором по прогону боёв. LLM в адаптации НЕ ВЫЗЫВАЕТСЯ
 * НИКОГДА. Стоимость — CPU, то есть ~ноль.
 *
 * Как сравниваются два мозга. Не «кандидат против действующего» головой к
 * голове: архетипы асимметричны, и посадить осьминожий мозг за гориллу
 * значит померить не мозг, а пересадку. Вместо этого оба мозга играют
 * ОДНУ И ТУ ЖЕ панель соперников на ОДНИХ И ТЕХ ЖЕ сидах — это A/B, где
 * различается ровно одна вещь. Счёт показывается игроку как «61 из 100».
 */

import { randomUUID } from 'node:crypto';

import { compileBrain } from '../brain/host.js';
import { runMatch } from '../core/match.js';
import { constantsVersion } from '../core/version.js';

/** Сколько боёв на сторону в проверке. 100 × 70 мс ≈ 7 с — по цене ноль. */
export const DUEL_ROUNDS = 100;
/** Не больше стольки принятых адаптаций в сутки на существо (D9). */
export const ADAPT_PER_DAY = 12;
/**
 * Насколько кандидат обязан быть лучше, чтобы его приняли.
 *
 * Ноль здесь был бы ошибкой: разброс 100 боёв — около ±5 побед даже между
 * двумя копиями одной программы, и «принимать при +1» означает принимать шум,
 * то есть случайно блуждать. Порог +4 победы из 100 — примерно одна сигма.
 */
export const MARGIN = 4;

/**
 * Числовые пороги мозга.
 *
 * Литералы берутся из кода вне строк и комментариев. 0 и 1 пропускаются —
 * это почти всегда индексы и флаги, а не пороги; крутить их значит ломать
 * программу, а не настраивать её.
 */
export function findKnobs(source) {
  const stripped = stripNonCode(source);
  const out = [];
  const re = /(?<![\w.$])(\d+(?:\.\d+)?)(?![\w.])/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const v = Number(m[1]);
    if (!Number.isFinite(v)) continue;
    if (v === 0 || v === 1 || v === 2) continue;
    if (Number.isInteger(v) && v > 100000) continue;
    out.push({ at: m.index, len: m[1].length, value: v });
  }
  return out;
}

/** Убрать строки и комментарии, сохранив длину — чтобы индексы совпадали. */
export function stripNonCode(src) {
  let out = ''; let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += ' '; i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      out += ' '; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Подкрутить один порог. Возвращает новый исходник или null. */
export function twist(source, knob, factor) {
  const v = knob.value * factor;
  const next = Number.isInteger(knob.value) && Math.abs(v - Math.round(v)) < 0.35
    ? String(Math.max(1, Math.round(v)))
    : String(Math.round(v * 1000) / 1000);
  if (next === String(knob.value)) return null;
  return source.slice(0, knob.at) + next + source.slice(knob.at + knob.len);
}

/** Панель соперников: одни и те же мозги, одни и те же сиды, для обоих. */
export function panel(db, creature, size = 6) {
  const rows = db.prepare(`
    SELECT id, brain_source, archetype FROM creature
    WHERE state='active' AND brain_source IS NOT NULL AND id != ?
    ORDER BY abs(rating - ?) ASC LIMIT ?
  `).all(creature.id, creature.rating, size);
  return rows.filter((r) => r.brain_source);
}

/**
 * Счёт мозга на панели. Один и тот же набор (соперник, сид) для всех
 * кандидатов — иначе меряется удача расписания, а не мозг.
 */
export function score(source, archetype, opponents, rounds = DUEL_ROUNDS) {
  if (!opponents.length) return { wins: 0, rounds: 0, rate: null };
  let brain;
  try { brain = compileBrain(source, archetype); } catch { return { wins: -1, rounds, rate: null, broken: true }; }

  const mySlot = archetype === 'gorilla' ? 'gorilla' : 'octopus';
  const oppSlot = mySlot === 'octopus' ? 'gorilla' : 'octopus';
  let wins = 0; let played = 0;
  for (let i = 0; i < rounds; i++) {
    const o = opponents[i % opponents.length];
    let oppBrain;
    try { oppBrain = compileBrain(o.brain_source, oppSlot); } catch { continue; }
    const seed = 1000 + i * 7919;
    let r;
    try { r = runMatch({ [mySlot]: brain, [oppSlot]: oppBrain }, { seed }); }
    catch { continue; }
    played++;
    if (r.result.winner === mySlot) wins++;
  }
  return { wins, rounds: played, rate: played ? wins / played : null };
}

/**
 * Один заход адаптации. Возвращает запись журнала или null, если менять
 * нечего или лучше не стало.
 *
 * §7.2а: «Адаптация не может ухудшить существо… при ухудшении старый
 * остаётся автоматически». Здесь это не проверка после, а условие записи.
 */
export function adaptOnce(db, creatureId, { rng = Math.random, now = Date.now, rounds = DUEL_ROUNDS } = {}) {
  const c = db.prepare('SELECT * FROM creature WHERE id = ?').get(creatureId);
  if (!c || !c.brain_source || c.is_library) return null;

  const today = new Date(now()).toISOString().slice(0, 10);
  const doneToday = db.prepare(`SELECT count(*) AS n FROM adaptation
    WHERE creature_id = ? AND accepted = 1 AND at >= ?`)
    .get(creatureId, Date.parse(`${today}T00:00:00.000Z`)).n;
  if (doneToday >= ADAPT_PER_DAY) return null;

  const knobs = findKnobs(c.brain_source);
  if (!knobs.length) return null;

  const opponents = panel(db, c);
  if (!opponents.length) return null;

  const base = score(c.brain_source, c.archetype, opponents, rounds);
  if (base.broken) return null;

  /* Три кандидата за заход: один порог, три множителя. Больше — дороже по CPU
     без выигрыша: поиск идёт каждые 10 боёв и сходится расписанием, а не
     шириной одного шага. */
  const knob = knobs[Math.floor(rng() * knobs.length)];
  const factors = [0.82, 1.22, rng() < 0.5 ? 0.94 : 1.08];
  let best = null;
  for (const f of factors) {
    const cand = twist(c.brain_source, knob, f);
    if (!cand) continue;
    const s = score(cand, c.archetype, opponents, rounds);
    if (s.broken) continue;
    if (!best || s.wins > best.s.wins) best = { source: cand, s, f };
  }
  if (!best) return null;

  const accepted = best.s.wins >= base.wins + MARGIN;
  const id = `a_${randomUUID().slice(0, 12)}`;
  const summary = accepted
    ? `Порог ${knob.value} → ${readBack(best.source, knob)}: ${best.s.wins} из ${best.s.rounds} против ${base.wins} у прежнего. Принято.`
    : `Пробовала порог ${knob.value} → ${readBack(best.source, knob)}: ${best.s.wins} из ${best.s.rounds} против ${base.wins}. Не лучше — оставила как было.`;

  db.prepare(`INSERT INTO adaptation (id, creature_id, at, kind, summary, before_json, after_json,
              score_before, score_after, accepted) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    id, creatureId, now(), 'tune', summary,
    JSON.stringify({ knob: knob.value }), JSON.stringify({ knob: readBack(best.source, knob), factor: best.f }),
    base.wins, best.s.wins, accepted ? 1 : 0,
  );

  if (accepted) {
    db.prepare(`UPDATE creature SET brain_source = ?, adaptations = adaptations + 1,
                constants_version = ?, updated_at = ? WHERE id = ?`)
      .run(best.source, constantsVersion(), now(), creatureId);
  }
  return { id, accepted, summary, before: base.wins, after: best.s.wins, rounds: best.s.rounds };
}

const readBack = (src, knob) => src.slice(knob.at).match(/^\d+(?:\.\d+)?/)?.[0] ?? '?';

/** A/B двух мозгов на одной панели — используется рефактором (D4). */
export function duelBrains(db, candidateSource, incumbentSource, archetype, { rounds = DUEL_ROUNDS } = {}) {
  const any = db.prepare(`SELECT id, brain_source, rating FROM creature
    WHERE state='active' AND brain_source IS NOT NULL ORDER BY rating DESC LIMIT 6`).all();
  const opponents = any.filter((r) => r.brain_source);
  const a = score(candidateSource, archetype, opponents, rounds);
  const b = score(incumbentSource, archetype, opponents, rounds);
  return { candidate: a.wins, incumbent: b.wins, rounds: Math.min(a.rounds, b.rounds) || rounds };
}
