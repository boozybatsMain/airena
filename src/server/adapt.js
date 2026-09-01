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

import { runIsolated } from './sandbox/index.js';
import { kitOf, sizeOf } from './arena-loop.js';

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
  /* kit_json и kit_active — чтобы соперник на панели дрался СВОИМ набором,
     как в настоящем бою, а не четырьмя захардкоженными умениями. */
  const rows = db.prepare(`
    SELECT id, brain_source, archetype, kit_json, kit_active, size FROM creature
    WHERE state='active' AND brain_source IS NOT NULL AND id != ?
    ORDER BY abs(rating - ?) ASC LIMIT ?
  `).all(creature.id, creature.rating, size);
  return rows.filter((r) => r.brain_source);
}

/**
 * Счёт мозга на панели. Один и тот же набор (соперник, сид) для всех
 * кандидатов — иначе меряется удача расписания, а не мозг.
 *
 * ── НАБОРЫ ОБЯЗАТЕЛЬНЫ, И ВОТ ПОЧЕМУ ──────────────────────────────────────
 *
 * `runIsolated` без `kits` ставит бойцам ЧЕТЫРЕ ЗАХАРДКОЖЕННЫХ умения —
 * `laser`, `smash`, `blink`, `charge`, — а не набор существа. То есть
 * адаптация переписывала мозг по боям, которые существо не дерётся: мозг,
 * написанный под `k1..k3` из грамматики, в этих прогонах своих умений не
 * видел вовсе и не мог их применить.
 *
 * Это не мелочь. Отбор кандидатов, дуэль со старым мозгом и решение «принять
 * или нет» — всё считалось в другой игре. Замерено: единственное существо
 * игрока с набором из грамматики имело 74 попытки адаптации и 3 принятых,
 * и весь этот отбор мерен не тем.
 *
 * Наборы приходят снаружи, а не собираются здесь: собрать их — значит
 * прочитать `kit_json` и скомпилировать, то есть повторить `kitOf` из
 * `arena-loop.js`. Второе место, где набор превращается в умения, однажды
 * разойдётся с первым.
 */
/**
 * @param {{[slot: string]: number|((o: object) => number)}|null} sizes размеры
 *   бойцов. Размер меняет здоровье, скорость, урон и КОЛЛАЙДЕР (`statsFor`),
 *   то есть это такая же часть входа матча, как набор. Без него адаптация
 *   отбирает мозг для существа другого телосложения: замерено, что один и тот
 *   же набор против гантлета даёт 100/100/0/100/100 при размере 1.0 и
 *   50/50/25/100/25 при 0.75 — это разные игры, а не шум.
 */
export async function score(source, archetype, opponents, rounds = DUEL_ROUNDS, kits = null, sizes = null) {
  if (!opponents.length) return { wins: 0, rounds: 0, rate: null };
  const mySlot = archetype === 'gorilla' ? 'gorilla' : 'octopus';
  const oppSlot = mySlot === 'octopus' ? 'gorilla' : 'octopus';

  /* Панель разбивается на группы по сопернику: изолят грузит мозги один раз
     и прогоняет пачку сидов, поэтому сто боёв стоят столько же переходов
     через границу потока, сколько соперников, а не сколько боёв. */
  const perOpponent = Math.max(1, Math.floor(rounds / opponents.length));
  let wins = 0; let played = 0;
  for (const [oi, o] of opponents.entries()) {
    const seeds = Array.from({ length: perOpponent }, (_, i) => 1000 + (oi * perOpponent + i) * 7919);
    let out;
    try {
      const pair = kits && (kits[mySlot] || kits[oppSlot])
        ? { [mySlot]: kits[mySlot] || null, [oppSlot]: kits[oppSlot] ? kits[oppSlot](o) : null }
        : null;
      const sz = sizes
        ? {
          [mySlot]: typeof sizes[mySlot] === 'function' ? sizes[mySlot](o) : sizes[mySlot],
          [oppSlot]: typeof sizes[oppSlot] === 'function' ? sizes[oppSlot](o) : sizes[oppSlot],
        }
        : null;
      out = await runIsolated({ [mySlot]: source, [oppSlot]: o.brain_source },
        { seeds, ...(pair ? { kits: pair } : {}), ...(sz ? { sizes: sz } : {}) });
    } catch (e) {
      /* Кандидат, который не запускается, — не «ноль побед», а брак: вернуть
         ноль значило бы сравнить его с действующим по силе, а сравнивать
         надо было по годности. */
      if (oi === 0) return { wins: -1, rounds, rate: null, broken: true, why: e.code };
      continue;
    }
    for (const r of out.results) { played++; if (r.winner === mySlot) wins++; }
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
export async function adaptOnce(db, creatureId, { rng = Math.random, now = Date.now, rounds = DUEL_ROUNDS } = {}) {
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

  /*
   * НАБОРЫ — ТЕ ЖЕ, ЧТО В НАСТОЯЩЕМ БОЮ.
   *
   * Без них адаптация переписывала мозг по боям с четырьмя захардкоженными
   * умениями вместо его собственных: то есть отбирала лучший мозг для другой
   * игры. `kitOf` — та же функция, которой набор превращается в умения перед
   * настоящим матчем, поэтому второго места, где это делается, не появляется.
   */
  const mySlot = c.archetype === 'gorilla' ? 'gorilla' : 'octopus';
  const oppSlot = mySlot === 'octopus' ? 'gorilla' : 'octopus';
  const kits = { [mySlot]: kitOf(c), [oppSlot]: (o) => kitOf(o) };
  /* Размер — по той же причине, что и набор, и той же формой: своё число и
     функция от соперника. */
  const sizes = { [mySlot]: sizeOf(c), [oppSlot]: (o) => sizeOf(o) };

  const base = await score(c.brain_source, c.archetype, opponents, rounds, kits, sizes);
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
    const s = await score(cand, c.archetype, opponents, rounds, kits, sizes);
    if (s.broken) continue;
    if (!best || s.wins > best.s.wins) best = { source: cand, s, f };
  }
  if (!best) return null;

  const accepted = best.s.wins >= base.wins + MARGIN;
  const id = `a_${randomUUID().slice(0, 12)}`;
  /*
   * СВОДКА НЕ НАЗЫВАЕТ КОНСТАНТ МОЗГА.
   *
   * Здесь стояло «Порог 20 → 16.4: 34 из 96 против 24 у прежнего». Число 20 —
   * это ЛИТЕРАЛ ИЗ ИСХОДНИКА МОЗГА, а `GET /api/creature/:id` отдаёт журнал.
   * F11 и N19 требуют, чтобы исходник мозга не покидал сервер, и формально он
   * не покидал — по одной константе за адаптацию. В мозге их полтора-два
   * десятка (§7.2а), адаптаций до двенадцати в сутки: за несколько дней
   * снимается почти вся числовая часть чужого мозга, причём руками самой игры.
   *
   * Ценность строки при этом не в числе, а в СВИДЕТЕЛЬСТВЕ: сколько побед из
   * скольких против прежнего. Оно остаётся полностью. Уходит абсолютная
   * величина, остаётся направление и то, насколько сдвинули, — этого хватает,
   * чтобы понять, что существо стало осторожнее или решительнее, и не хватает,
   * чтобы восстановить мозг.
   */
  const was = Number(knob.value);
  const now2 = Number(readBack(best.source, knob));
  const pct = Number.isFinite(was) && Number.isFinite(now2) && was !== 0
    ? Math.round(Math.abs(now2 - was) / Math.abs(was) * 100)
    : null;
  const dir = now2 > was ? 'сдержаннее' : 'решительнее';
  const счёт = `${best.s.wins} из ${best.s.rounds} против ${base.wins}`;
  const summary = accepted
    ? (pct === null
      ? `Подправила порог: ${счёт} у прежнего. Принято.`
      : `Сдвинула порог на ${pct}%, стала ${dir}: ${счёт} у прежнего. Принято.`)
    : (pct === null
      ? `Пробовала подправить порог: ${счёт}. Не лучше — оставила как было.`
      : `Пробовала сдвинуть порог на ${pct}% и стать ${dir}: ${счёт}. Не лучше — оставила как было.`);

  db.prepare(`INSERT INTO adaptation (id, creature_id, at, kind, summary, before_json, after_json,
              score_before, score_after, accepted) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    id, creatureId, now(), 'tune', summary,
    JSON.stringify({ knob: knob.value }), JSON.stringify({ knob: readBack(best.source, knob), factor: best.f }),
    base.wins, best.s.wins, accepted ? 1 : 0,
  );

  if (accepted) {
    /*
     * `constants_version` НЕ ТРОГАЕТСЯ — D10 п.3 буквально.
     *
     * Здесь стояло `constants_version = constantsVersion()`, то есть каждая
     * принятая адаптация объявляла мозг написанным против ТЕКУЩИХ констант.
     * Но адаптация не пишет мозг заново — она двигает один порог. Мозг
     * по-прежнему написан против тех чисел, против которых его писала модель,
     * и поле существует ровно для того, чтобы это сказать.
     *
     * Цена ошибки видна через границу сезона: адаптация идёт раз в десять
     * боёв, то есть через час-другой после смены констант ВСЕ существа
     * игроков молча заявляли «текущая версия». `checkstale` смотрит только
     * каталог `brains/` на диске и в базу не заглядывает — то есть дрейф не
     * увидел бы и релизный гейт.
     */
    db.prepare(`UPDATE creature SET brain_source = ?, adaptations = adaptations + 1,
                updated_at = ? WHERE id = ?`)
      .run(best.source, now(), creatureId);
  }
  return { id, accepted, summary, before: base.wins, after: best.s.wins, rounds: best.s.rounds };
}

const readBack = (src, knob) => src.slice(knob.at).match(/^\d+(?:\.\d+)?/)?.[0] ?? '?';

/** A/B двух мозгов на одной панели — используется рефактором (D4). */
export async function duelBrains(db, candidateSource, incumbentSource, archetype, { rounds = DUEL_ROUNDS, kit = null, size = 1 } = {}) {
  const any = db.prepare(`SELECT id, brain_source, rating, kit_json, kit_active, size FROM creature
    WHERE state='active' AND brain_source IS NOT NULL ORDER BY rating DESC LIMIT 6`).all();
  const opponents = any.filter((r) => r.brain_source);
  /* Дуэль идёт теми же наборами, что настоящий бой: иначе рефактор
     сравнивает два мозга в игре, в которую ни один из них не играет. */
  const mySlot = archetype === 'gorilla' ? 'gorilla' : 'octopus';
  const oppSlot = mySlot === 'octopus' ? 'gorilla' : 'octopus';
  const kits = { [mySlot]: kit, [oppSlot]: (o) => kitOf(o) };
  const sizes = { [mySlot]: size, [oppSlot]: (o) => sizeOf(o) };
  const [a, b] = await Promise.all([
    score(candidateSource, archetype, opponents, rounds, kits, sizes),
    score(incumbentSource, archetype, opponents, rounds, kits, sizes),
  ]);
  return { candidate: a.wins, incumbent: b.wins, rounds: Math.min(a.rounds, b.rounds) || rounds };
}
