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
import { buildOf, inferReferenceTag, kitOf, refTagOf } from './arena-loop.js';

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
/*
 * ONLY THRESHOLDS — a number beside a comparison, outside a `for` header.
 *
 * Every numeric literal used to be a knob. Measured on the corpus (07.09,
 * `reports/combat/brain-corpus-audit.md` F2): the tuner had rewritten arena
 * clamps (`±17` → `29.768`), a `tick % 74.42` loop period, a `V.lead` speed,
 * and loop bounds — structural constants a fight cannot improve by nudging,
 * so the accepted "improvement" was noise from a hundred-match sample. A
 * threshold the mind compares a perception against (`dist < 6.36`,
 * `hpFrac <= 0.4`) is the kind of number ten more matches can teach; a
 * coordinate is not. The literal must sit directly beside `<`, `>`, `<=` or
 * `>=` (either side), and `for (…)` headers are skipped whole.
 */
export function findKnobs(source) {
  const stripped = stripNonCode(source);
  const out = [];
  const re = /(?<![\w.$])(\d+(?:\.\d+)?)(?![\w.])/g;
  const cmpBefore = /(?:<=|>=|<|>)\s*$/;
  const cmpAfter = /^\s*(?:<=|>=|<|>)(?!=)/;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const v = Number(m[1]);
    if (!Number.isFinite(v)) continue;
    if (v === 0 || v === 1 || v === 2) continue;
    if (Number.isInteger(v) && v > 100000) continue;
    const before = stripped.slice(Math.max(0, m.index - 12), m.index);
    const after = stripped.slice(m.index + m[1].length, m.index + m[1].length + 12);
    /* `<` and `>` beside the literal; `x < 5` reads `<` before, `5 < x` reads
       `<` after. `=>` and `<<` are not comparisons: the arrow is excluded by
       the character class, the shift by the `!=` look-ahead being absent. */
    if (!cmpBefore.test(before) && !cmpAfter.test(after)) continue;
    /* Not inside a for header: the nearest unmatched `for (` before it. */
    const head = stripped.lastIndexOf('for (', m.index);
    if (head >= 0) {
      const close = stripped.indexOf(')', head);
      const open = stripped.indexOf('{', head);
      if (close > m.index || (open > m.index && close > m.index)) continue;
    }
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
     как в настоящем бою, а не четырьмя захардкоженными умениями.
     build_json — по той же причине: без него `buildOf` вернёт телосложение по
     умолчанию, и панель молча соберётся из тел, которых ни у кого нет. */
  const rows = db.prepare(`
    SELECT id, brain_source, kit_json, kit_active, build_json FROM creature
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
 * ── ТЕЛОСЛОЖЕНИЕ, А НЕ РАЗМЕР ─────────────────────────────────────────────
 *
 * Здесь стояли `sizes` — числа-множители, которые `statsFor(id, size)`
 * накладывал на запись архетипа. Ни архетипов, ни `statsFor` больше нет:
 * здоровье, скорость, ускорение, разворот и КОЛЛАЙДЕР существо носит своё,
 * и в матч они едут полем `builds` наравне с сидом и наборами.
 *
 * Причина передавать их сюда та же, что и у наборов: без тела адаптация
 * отбирает мозг для существа другого телосложения. Замерено ещё на размерах —
 * один и тот же набор против гантлета давал 100/100/0/100/100 на одном теле и
 * 50/50/25/100/25 на другом; это разные игры, а не шум.
 *
 * @param {{[slot: string]: object|((o: object) => object)}|null} builds
 *   телосложения бойцов: своё — объектом, соперника — функцией от его строки.
 */
/*
 * Сторона у прибора ФИКСИРОВАНА, а не выбирается по виду.
 *
 * Здесь стояло `archetype === 'gorilla' ? ...` — то есть замер сажал мозг на
 * ту сторону, которую диктовал вид, и вместе со стороной он получал её числа.
 * Видов нет, числа у существа свои, а прибор обязан быть одним и тем же от
 * замера к замеру: иначе два прогона одного мозга несравнимы.
 *
 * `blue` взята не потому, что она чем-то лучше: сторона — это цвет, и обе
 * дают ровно одно и то же. Важно единственное — чтобы она не менялась.
 */
export async function score(source, opponents, rounds = DUEL_ROUNDS, kits = null, builds = null, refTags = null) {
  if (!opponents.length) return { wins: 0, rounds: 0, rate: null };
  const mySlot = 'blue';
  const oppSlot = 'orange';

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
      const bld = builds
        ? {
          [mySlot]: typeof builds[mySlot] === 'function' ? builds[mySlot](o) : builds[mySlot],
          [oppSlot]: typeof builds[oppSlot] === 'function' ? builds[oppSlot](o) : builds[oppSlot],
        }
        : null;
      /* Эталонный набор бойца без кита — по той же причине и той же формой,
         что набор и тело: своё значением, соперника функцией от его строки.
         Без него отбор мозга идёт по боям, в которых существо получало
         фикстуру по ЦВЕТУ, то есть половину прогонов не видело своих
         глаголов вовсе — тот же брак, что описан выше про наборы. */
      const tags = refTags
        ? {
          [mySlot]: typeof refTags[mySlot] === 'function' ? refTags[mySlot](o) : refTags[mySlot],
          [oppSlot]: typeof refTags[oppSlot] === 'function' ? refTags[oppSlot](o) : refTags[oppSlot],
        }
        : null;
      out = await runIsolated({ [mySlot]: source, [oppSlot]: o.brain_source },
        { seeds, ...(pair ? { kits: pair } : {}), ...(bld ? { builds: bld } : {}),
          ...(tags ? { referenceTag: tags } : {}) });
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
  const mySlot = 'blue';
  const oppSlot = 'orange';
  const kits = { [mySlot]: kitOf(c), [oppSlot]: (o) => kitOf(o) };
  /* Телосложение — по той же причине, что и набор, и той же формой: своё
     тело объектом, тело соперника функцией от его строки. */
  const builds = { [mySlot]: buildOf(c), [oppSlot]: (o) => buildOf(o) };
  /* И эталонный набор — той же формой. Существо без кита иначе отбирает мозг
     по боям, где половину прогонов дралось чужой фикстурой. */
  const refTags = { [mySlot]: refTagOf(c), [oppSlot]: (o) => refTagOf(o) };

  const base = await score(c.brain_source, opponents, rounds, kits, builds, refTags);
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
    const s = await score(cand, opponents, rounds, kits, builds, refTags);
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
  const dir = now2 > was ? 'more careful' : 'more decisive';
  const score = `${best.s.wins} of ${best.s.rounds} against ${base.wins}`;
  const summary = accepted
    ? (pct === null
      ? `Nudged a threshold: ${score} for the old one. Kept.`
      : `Moved a threshold by ${pct}% and became ${dir}: ${score} for the old one. Kept.`)
    : (pct === null
      ? `Tried nudging a threshold: ${score}. No better — left as it was.`
      : `Tried moving a threshold by ${pct}% to become ${dir}: ${score}. No better — left as it was.`);

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
export async function duelBrains(db, candidateSource, incumbentSource, { rounds = DUEL_ROUNDS, kit = null, build = null } = {}) {
  const any = db.prepare(`SELECT id, brain_source, rating, kit_json, kit_active, build_json, reference_tag
    FROM creature WHERE state='active' AND brain_source IS NOT NULL ORDER BY rating DESC LIMIT 6`).all();
  const opponents = any.filter((r) => r.brain_source);
  /* Дуэль идёт теми же наборами, что настоящий бой: иначе рефактор
     сравнивает два мозга в игре, в которую ни один из них не играет. */
  const mySlot = 'blue';
  const oppSlot = 'orange';
  const kits = { [mySlot]: kit, [oppSlot]: (o) => kitOf(o) };
  /* `null` здесь честнее единицы: тела нет — значит боец выйдет в
     `DEFAULT_BUILD`, ровно как его выпустит симуляция. */
  const builds = { [mySlot]: build, [oppSlot]: (o) => buildOf(o) };
  /* Тег считается ПО КАЖДОМУ ИСХОДНИКУ отдельно: рефактор сравнивает два
     РАЗНЫХ мозга, и вполне возможно, что модель переписала существо с
     `laser` на `smash`. Общий тег на обоих сделал бы один из двух немым и
     объявил бы это разницей в силе. Существу с китом фикстура не нужна. */
  const tagsFor = (src) => ({ [mySlot]: kit ? null : inferReferenceTag(src), [oppSlot]: (o) => refTagOf(o) });
  const [a, b] = await Promise.all([
    score(candidateSource, opponents, rounds, kits, builds, tagsFor(candidateSource)),
    score(incumbentSource, opponents, rounds, kits, builds, tagsFor(incumbentSource)),
  ]);
  return { candidate: a.wins, incumbent: b.wins, rounds: Math.min(a.rounds, b.rounds) || rounds };
}
