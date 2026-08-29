/**
 * Конвейер рождения существа.
 *
 * Порядок шагов выбран так, чтобы дорогое шло после дешёвого и после того,
 * что может отказать:
 *
 *   1. РАЗБОР ПРОМПТА  — один дешёвый вызов: имя, архетип, кит из грамматики
 *                        §8 и список НЕПОПАВШИХ понятий (§8.1). Кит проверяет
 *                        сервер заново; цифры модели не авторитетны.
 *   2. ТЕЛО            — библиотечное в v1. N18 запрещает house-style путь
 *                        ($3.31–$11.72, ~58 мин) в любом потоке, видимом
 *                        игроку; forge подключается отдельным этапом.
 *   3. МОЗГ            — вызов по существующему промпту, с повтором по
 *                        правилу 4 (урезанный бюджет размышления).
 *   4. ВАЛИДАТОР       — бесплатный: компилирует и прогоняет два пробных боя.
 *                        Замерено: поймал 9 провалов из 9, ложных отказов 0.
 *   5. КАРТОЧКА ТАКТИКИ— один дешёвый вызов, ОДИН РАЗ НА МОЗГ (D5), а не на бой.
 *
 * §8.1, три правила, которые здесь исполняются буквально:
 *   1. никогда не подменять молча;
 *   2. никогда не терять существо из-за одной непопавшей детали;
 *   3. записывать каждое непопавшее понятие — это очередь разработки контента
 *      по спросу живых игроков, а не по догадке дизайнера.
 */

import { readFileSync } from 'node:fs';

import { brainPrompt, SYSTEM_PROMPT } from '../../brain/prompt.js';
import { extractSource } from '../../brain/host.js';
import { admit } from '../sandbox/index.js';
import { constantsVersion } from '../../core/version.js';
import { EFFECTS, KIT_BUDGET, KIT_SIZE, costOf, describe, grammar, validateKit, validateSkill } from '../../skills/registry.js';

const EFFECT_RU = (id) => EFFECTS[id]?.ru || id;
import { fallbackName, sanitizeName } from '../creatures.js';
import { callWithRepair, extractJson, LlmError } from './llm.js';
import { fallbackBundle } from './models.js';

/** Спарринг-партнёр допуска — рукописный эталон противоположной стороны. */
const SPARRING = {
  octopus: readFileSync(new URL('../../../brains/stub/gorilla.js', import.meta.url), 'utf8'),
  gorilla: readFileSync(new URL('../../../brains/stub/octopus.js', import.meta.url), 'utf8'),
};
const sparringFor = (archetype) => SPARRING[archetype === 'gorilla' ? 'gorilla' : 'octopus'];

/** Три стартовых кита — пресеты §10.5, они же и запасной вариант разбора. */
export const KIT_PRESETS = {
  keeper: {
    ru: 'Держит дистанцию',
    why: 'бьёт издалека и уходит, когда подошли',
    kit: [
      { trigger: 'active', delivery: 'beam', effects: ['damage'], element: 'arc' },
      { trigger: 'on_enemy_cast', delivery: 'blink', effects: ['cleanse'], element: 'void' },
      { trigger: 'active', delivery: 'zone', effects: ['burn'], element: 'ember' },
    ],
  },
  breaker: {
    ru: 'Ломает вблизи',
    why: 'входит в упор и не даёт разорвать дистанцию',
    kit: [
      { trigger: 'active', delivery: 'cone', effects: ['damage', 'knock'], element: 'kinetic' },
      { trigger: 'active', delivery: 'dash', effects: ['damage'], element: 'kinetic' },
      { trigger: 'on_low_hp', delivery: 'self', effects: ['shield'], element: 'frost' },
    ],
  },
  saboteur: {
    ru: 'Портит чувства',
    why: 'бьёт по тому, чем противник принимает решения',
    kit: [
      { trigger: 'active', delivery: 'bolt', effects: ['blind'], element: 'void' },
      { trigger: 'on_hit_taken', delivery: 'lob', effects: ['silence'], element: 'arc' },
      { trigger: 'active', delivery: 'cone', effects: ['damage'], element: 'frost' },
    ],
  },
};

const PARSE_SYSTEM = `Ты переводишь описание существа, написанное игроком, в закрытую грамматику.
Отвечай ТОЛЬКО объектом JSON, без пояснений.

Поля:
  name       — короткое имя существа, 2-22 символа, заглавными. Русский или латиница.
  archetype  — "octopus" (лёгкий, быстрый, дальнобойный) или "gorilla" (тяжёлый, ближний бой).
  kit        — РОВНО 3 скилла. Каждый: {trigger, delivery, effects:[1..3], channel?, element}.
  unfit      — массив строк: понятия из описания игрока, которых в грамматике НЕТ.
               Пиши их словами игрока. Пустой массив, если вошло всё.
  why        — одно предложение по-русски: почему такой кит подходит описанию.

ЖЁСТКИЕ ПРАВИЛА:
  • Бери значения только из перечисленных ниже. Придуманное значение — брак.
  • Доставка "self" допускает только эффекты shield, heal, cleanse, boost, wall.
  • Эффекты boost и weaken ОБЯЗАНЫ назвать channel.
  • Элемент — только визуал. Он не даёт никакой механики.
  • НИКОГДА не подменяй просьбу игрока похожей. Не влезло — пиши в unfit.
    Молчаливая подмена хуже отказа: существо выглядит нормальным и делает не то.`;

/**
 * Словарь для модели — С ЦЕНАМИ.
 *
 * Без цен модель раз за разом собирала `конус: урон + ослабление/броня` — 18
 * очков при потолке 16 — и сервер её чинил. Комбинация разумная, модель не
 * ошибалась; ей просто не сказали арифметику, и она не могла посчитать.
 * Замерено 29.08: пять прогонов подряд, три с одним и тем же перебором.
 * Правило шире случая: если сервер что-то пересчитывает, он обязан сообщить
 * правило — иначе он не проверяет, а угадывает за собеседника.
 */
function parseUserPrompt(g) {
  const list = (o) => Object.values(o).map((x) => `${x.id} (${x.ru}, ${x.cost})`).join(', ');
  return `Каждый атом стоит очки. Цена скилла = триггер + доставка + сумма эффектов
+ канал, плюс надбавка за комбинацию: два эффекта +2, три эффекта +5.

ТРИГГЕРЫ: ${list(g.triggers)}
ДОСТАВКИ: ${list(g.deliveries)}
ЭФФЕКТЫ: ${list(g.effects)}
КАНАЛЫ: ${list(g.channels)}
ЭЛЕМЕНТЫ (цена 0, только вид): ${Object.values(g.elements).map((x) => `${x.id} (${x.ru})`).join(', ')}

Потолок одного скилла — ${g.budgets.skill} очков, всего набора — ${g.budgets.kit}.
Посчитай КАЖДЫЙ скилл перед тем, как его записать. Скилл дороже потолка —
это брак, и его придётся заменить на стартовый.`;
}

/**
 * Шаг 1 — разбор промпта игрока в грамматику.
 *
 * Существо не теряется, если модель ошиблась: невалидные скиллы заменяются
 * из пресета и попадают в `unfit` как «не удалось собрать», а не молча.
 */
export async function parsePrompt({ prompt, bundle, kitPreset = null, call = callWithRepair }) {
  const g = grammar();
  const fallback = KIT_PRESETS[kitPreset] || KIT_PRESETS.keeper;

  let raw;
  try {
    raw = await call({
      modelId: bundle.modelId,
      maxTokens: Math.min(bundle.maxTokens, 4000 + bundle.thinkBudget),
      thinkBudget: bundle.thinkBudget,
      messages: [
        { role: 'system', content: `${PARSE_SYSTEM}\n\n${parseUserPrompt(g)}` },
        { role: 'user', content: prompt },
      ],
      accept: (t) => t.includes('{') && t.includes('}'),
    });
  } catch (e) {
    /* Правило 2 из §8.1: генерация не падает. Пресет — не «тихая подмена»,
       потому что он попадает в unfit явной строкой. */
    return {
      name: fallbackName(prompt),
      archetype: 'octopus',
      kit: fallback.kit,
      unfit: [{ phrase: prompt.slice(0, 80), why: 'разбор описания не удался, поставлен стартовый набор' }],
      why: fallback.why,
      costUsd: e.costUsd || 0,
      degraded: true,
    };
  }

  let obj;
  try { obj = extractJson(raw.text); }
  catch {
    return {
      name: fallbackName(prompt), archetype: 'octopus', kit: fallback.kit,
      unfit: [{ phrase: prompt.slice(0, 80), why: 'модель вернула не-JSON, поставлен стартовый набор' }],
      why: fallback.why, costUsd: raw.costUsd, degraded: true,
    };
  }

  const unfit = [];
  for (const u of Array.isArray(obj.unfit) ? obj.unfit.slice(0, 6) : []) {
    const phrase = typeof u === 'string' ? u : u?.phrase;
    if (phrase) unfit.push({ phrase: String(phrase).slice(0, 80), why: whyUnfit(String(phrase)) });
  }

  /*
   * Кит проверяется ЗАНОВО и чинится ТОЧЕЧНО.
   *
   * Модель могла придумать атом, перебрать бюджет или нарушить L1 — всё это
   * ловится здесь, а не в бою (§8: цифры, присланные клиентом или моделью,
   * не авторитетны). Но §8.1, правило 2, говорит и обратное: существо не
   * теряется из-за одной непопавшей детали. Поэтому чиним ровно то, что
   * сломано, и записываем ровно это: «скилл 2 не собрался» читается, а
   * «весь набор не собрался» — это отказ, замаскированный под починку.
   */
  let kit = Array.isArray(obj.kit) ? obj.kit.slice(0, KIT_SIZE) : [];
  kit = kit.map((s) => normalizeSkill(s));
  const repaired = [];

  for (let i = 0; i < KIT_SIZE; i++) {
    if (kit[i] && !validateSkill(kit[i]).length) continue;
    kit[i] = fallback.kit[i];
    repaired.push({ slot: i, why: 'не собрался по правилам грамматики' });
  }

  /* Два скилла, делающих одно и то же, — это один скилл с двумя кулдаунами:
     читаемости ноль, а именно она предмет §8. Меняем ПОВТОР, а не весь набор. */
  const sig = (k) => `${k.delivery}:${[...(k.effects || [])].sort().join('+')}`;
  const seen = new Set();
  for (let i = 0; i < kit.length; i++) {
    if (!seen.has(sig(kit[i]))) { seen.add(sig(kit[i])); continue; }
    const spare = fallback.kit.find((f) => !seen.has(sig(f)));
    if (!spare) continue;
    kit[i] = spare; seen.add(sig(spare));
    repaired.push({ slot: i, why: 'повторял другое умение того же набора' });
  }

  /* Бюджет кита: снимаем самый дорогой лишний эффект с самого дорогого
     скилла, пока не влезет. Урезание дешевле подмены — оно оставляет
     задуманную форму умения. */
  let guard = 0;
  while (kit.reduce((a, k) => a + costOf(k), 0) > KIT_BUDGET && guard++ < 6) {
    const at = kit.map((k, i) => [costOf(k), i]).sort((a, b) => b[0] - a[0])[0][1];
    if ((kit[at].effects || []).length > 1) {
      const dropped = kit[at].effects.pop();
      repaired.push({ slot: at, why: `не влезал в бюджет — снят эффект «${EFFECT_RU(dropped)}»` });
    } else {
      kit[at] = fallback.kit[at];
      repaired.push({ slot: at, why: 'не влезал в бюджет набора' });
    }
  }

  /* Последний рубеж: если после всей починки кит всё ещё вне правил, ставим
     пресет целиком — но говорим об этом прямо. */
  if (validateKit(kit).length) {
    kit = fallback.kit.slice();
    repaired.length = 0;
    repaired.push({ slot: -1, why: 'набор не сошёлся целиком — поставлен стартовый' });
  }

  for (const r of repaired) {
    unfit.push({
      phrase: r.slot < 0 ? 'набор умений' : `умение ${r.slot + 1}`,
      why: r.why,
    });
  }

  return {
    name: sanitizeName(obj.name, prompt),
    archetype: obj.archetype === 'gorilla' ? 'gorilla' : 'octopus',
    kit,
    unfit,
    why: typeof obj.why === 'string' ? obj.why.slice(0, 200) : fallback.why,
    costUsd: raw.costUsd,
    degraded: false,
  };
}

const normalizeSkill = (s) => (s && typeof s === 'object' ? {
  trigger: String(s.trigger || 'active'),
  delivery: String(s.delivery || 'beam'),
  effects: Array.isArray(s.effects) ? s.effects.map(String).slice(0, 3) : [],
  ...(s.channel ? { channel: String(s.channel) } : {}),
  element: String(s.element || 'kinetic'),
} : null);

/**
 * Почему понятие не влезло. Игроку показывается прямо (§8.1, правило 3):
 * «Не вошло: „чует кровь“ — реакции на раненого противника пока не существует.»
 */
const UNFIT_HINTS = [
  [/кров|раненн?|подранк/i, 'реакции на раненого противника пока не существует'],
  [/лет|полёт|крыл|парит/i, 'полёта в арене нет — все дерутся по земле'],
  [/яд|отрав|токсин/i, 'яд машине ничто — словарь стихий проверяется на правдоподобие против робота'],
  [/невидим|маскир|прячет/i, 'невидимости нет: бой обязан читаться зрителем'],
  [/призыв|клон|копи[юя]|помощник/i, 'на арене всегда ровно двое'],
  [/лечит союз|союзник|команд/i, 'союзников нет — бой один на один'],
  [/телепат|мысли противник/i, 'чтения чужих мыслей нет; портить чужую перцепцию умеет blind'],
  [/броня растёт|эволюц|мутир/i, 'тело не меняется в бою'],
];

export function whyUnfit(phrase) {
  for (const [re, why] of UNFIT_HINTS) if (re.test(phrase)) return why;
  return 'такого понятия в грамматике скиллов пока нет';
}

/**
 * Язык реплик — отдельной строкой, а не правкой промпта.
 *
 * `src/brain/prompt.js` — научный артефакт: шесть эталонных мозгов §1
 * написаны по нему дословно, и `checktactics` держит его в четырёх
 * разрешённых видах строк. Трогать его ради языка значит трогать основание
 * измерения ради оформления.
 *
 * Поэтому требование живёт здесь, на продуктовом пути. И это ограничение
 * С ПРИЧИНОЙ, а не пожелание: реплики `api.say()` — одно из двух
 * доказательств, которыми F11 заменил закрытый исходник, и доказательство
 * на чужом языке доказывает вдвое меньше.
 */
const SAY_RU = `Одно дополнение к промпту выше, и оно про язык, а не про тактику.

Строки, которые ты передаёшь в api.say(), читает игрок — по-русски. Пиши их
по-русски: коротко, в характере бойца, до 90 знаков. Это единственное место,
где язык имеет значение; имена переменных, комментарии и всё остальное в коде
оставляй как привык.`;

/** Шаг 3 — мозг. */
export async function forgeBrain({ archetype, bundle, call = callWithRepair, onAttempt = null }) {
  const r = await call({
    modelId: bundle.modelId,
    maxTokens: bundle.maxTokens,
    thinkBudget: bundle.thinkBudget,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `${brainPrompt(archetype)}\n\n${SAY_RU}` },
    ],
    accept: (t) => {
      try { return extractSource(t).length > 200; } catch { return false; }
    },
    onAttempt,
  });
  return { source: extractSource(r.text), costUsd: r.costUsd, tries: r.tries, usage: r.usage };
}

const CARD_SYSTEM = `Ты читаешь программу-мозг бойца и описываешь ЕЁ ТАКТИКУ игроку.
Отвечай 2-3 предложениями по-русски, без кода, без названий переменных, без markdown.
Говори о поведении: на какой дистанции держится, чего ждёт, чем отвечает, когда рискует.
Если программа делает что-то странное или явно плохое — скажи это прямо, не выгораживай.`;

/** Шаг 5 — карточка тактики. Один раз на мозг (D5), не на бой. */
export async function tacticsCard({ source, archetype, bundle, call = callWithRepair }) {
  try {
    const r = await call({
      modelId: bundle.modelId,
      maxTokens: Math.min(bundle.maxTokens, 1200),
      thinkBudget: 0,
      messages: [
        { role: 'system', content: CARD_SYSTEM },
        { role: 'user', content: `Боец: ${archetype}.\n\n${source.slice(0, 12000)}` },
      ],
      accept: (t) => t.trim().length > 30,
      attempts: 1,
    });
    return { text: r.text.trim().slice(0, 600), costUsd: r.costUsd };
  } catch (e) {
    /* Карточка — доказательство, а не украшение (F11), но её отсутствие не
       повод потерять существо. Экран покажет реплики say() и разбор боя. */
    return { text: null, costUsd: e.costUsd || 0 };
  }
}

/**
 * Весь конвейер. Возвращает описание существа ИЛИ причину отказа.
 *
 * `onStage` двигает экран ожидания: он занимает 60–180 с чужим боем (§10.3),
 * и «спиннер» там запрещён — значит стадии должны быть настоящими.
 */
export async function forgeCreature({
  prompt, bundle, catalog, kitPreset = null, archetypeHint = null,
  onStage = () => {}, call = callWithRepair,
}) {
  const spent = { usd: 0 };
  const note = [];
  let use = bundle;

  onStage('parse', 0.1);
  const parsed = await parsePrompt({ prompt, bundle: use, kitPreset, call });
  spent.usd += parsed.costUsd || 0;
  const archetype = archetypeHint || parsed.archetype;

  onStage('brain', 0.35);
  let brain;
  try {
    brain = await forgeBrain({ archetype, bundle: use, call });
  } catch (e) {
    /* Молчаливая подмена запрещена (§5.1): «Fable не справилась, существо
       сделала Gemini» — обязательная строка, а не любезность. */
    const alt = fallbackBundle(catalog, use.bundle);
    spent.usd += e.costUsd || 0;
    if (!alt) return { ok: false, code: 'brain_failed', message: 'мозг не собрался', costUsd: spent.usd };
    note.push({ kind: 'fallback', from: use.label, to: alt.label });
    use = alt;
    onStage('brain_retry', 0.45);
    try {
      brain = await forgeBrain({ archetype, bundle: use, call });
    } catch (e2) {
      spent.usd += e2.costUsd || 0;
      return { ok: false, code: 'brain_failed', message: 'мозг не собрался даже на запасной модели', costUsd: spent.usd };
    }
  }
  spent.usd += brain.costUsd || 0;

  onStage('validate', 0.7);
  /*
   * ДОПУСК, а не просто валидация.
   *
   * Мозг, только что написанный моделью по свободному тексту игрока, —
   * это ровно тот код, ради которого написан A1. `admit()` прогоняет его
   * через все четыре стены: статический анализ, вставку учёта топлива,
   * два пробных боя в изоляте и проверку, что он не падает и не крутится.
   *
   * Порядок важен: допуск ДО записи в БД. Тогда «в базе нет ни одного
   * мозга, не прошедшего стены» — свойство схемы, а не привычка.
   */
  const v = await admit(brain.source, archetype, { sparring: sparringFor(archetype) });
  if (!v.ok) {
    /* E5: отклонённая валидатором генерация бесплатна для игрока. Деньги,
       которые провайдер уже списал, в дневной бюджет попадают — это два
       разных счётчика, см. limits.recordSpend. */
    return {
      ok: false, code: 'rejected', stage: v.stage,
      message: v.problems?.[0]?.message || 'мозг не прошёл проверку',
      problems: v.problems, costUsd: spent.usd, note,
    };
  }

  onStage('card', 0.9);
  const cardOut = await tacticsCard({ source: brain.source, archetype, bundle: use, call });
  spent.usd += cardOut.costUsd || 0;

  onStage('done', 1);
  return {
    ok: true,
    name: parsed.name,
    archetype,
    bodyRef: archetype,
    kit: parsed.kit,
    unfit: parsed.unfit,
    why: parsed.why,
    brainSource: brain.source,
    brainModel: use.bundle,
    tacticsCard: cardOut.text,
    constantsVersion: constantsVersion(),
    costUsd: spent.usd,
    note,
    kitReadable: parsed.kit.map(describe),
    kitCost: parsed.kit.map(costOf),
  };
}
