/**
 * VFX уровня 1: закрытая грамматика декоративных частей (§9.2).
 *
 * ── что это и чем не является ──────────────────────────────────────────────
 *
 * §9.2 расписывает четыре уровня свободы модели в VFX и выбирает первый:
 * модель отдаёт **валидированный JSON-IR из частей поверх неприкосновенного
 * read-kit**. Третий уровень (модель пишет TSL/WGSL) отвергнут письменно и
 * навсегда: «запустить эффект» там значит «выполнить код автора в браузере
 * ЗРИТЕЛЯ», и это единственный дизайн, где риск переносится с автора на
 * постороннего человека.
 *
 * До этого файла в игре был только read-kit: силуэт от доставки, палитра от
 * элемента, импакт от эффекта. Это правильный низ, но это НУЛЕВОЙ уровень —
 * у модели там нет ни одного решения, и все умения с одной доставкой
 * выглядят одинаково у всех существ. Грамматика §8 даёт 470 прочтений,
 * а видно из них было ровно столько, сколько различает read-kit.
 *
 * ── правило, которое здесь главное ─────────────────────────────────────────
 *
 * **МОДЕЛЬ МОЖЕТ ДОБАВЛЯТЬ, НО НЕ ЗАМЕНЯТЬ.** Read-kit рисуется всегда и
 * первым; IR играется поверх и не может ни отменить его, ни перекрасить.
 * Технически это обеспечено тем, что в IR нет ни одного поля, называющего
 * цвет, геометрию или силуэт: цвет выбирается ИНДЕКСОМ в палитре элемента,
 * которую задал сервер, а форма — именем из закрытого списка.
 *
 * Худший случай уровня 1 — скучный эффект, а не чёрный экран. Это тоже
 * требование §9.2, и оно проверяется гейтом: любой валидный IR обязан
 * рисоваться без исключения.
 *
 * ── почему пределы такие ───────────────────────────────────────────────────
 *
 * Пределы не про вкус, а про две вещи, которые нельзя отдать автору:
 * кадровый бюджет зрителя и читаемость боя. Автор, которому дали 3000 частиц,
 * потратит 3000 частиц; зритель с этого получит просадку и белую кашу, в
 * которой не видно, кто кого бьёт. Поэтому бюджет на один каст жёсткий, и
 * `validateIr` не «предупреждает», а отказывает.
 */

/* ── ЧАСТИ ────────────────────────────────────────────────────────────────
 *
 * Каждая ось — закрытый список. Закрытость и есть безопасность: интерпретатор
 * не видит ни одной строки, которую не выбрал бы сам, поэтому «неизвестное
 * значение» не бывает — бывает только отказ на входе.
 *
 * Таблицы через `Object.create(null)`: `EMITTERS['constructor']` на обычном
 * литерале вернул бы функцию, то есть истинное значение, и проверка
 * «известна ли часть» пропустила бы имя из прототипа. Ровно этим уже один раз
 * пробивался бюджет умений — см. §8 и `src/skills/registry.js`.
 */
const table = (o) => Object.assign(Object.create(null), o);

/** Откуда летят частицы. */
export const EMITTERS = table({
  ring: { id: 'ring', ru: 'кольцо', cost: 1 },
  burst: { id: 'burst', ru: 'вспышка во все стороны', cost: 1 },
  cone: { id: 'cone', ru: 'конус по направлению', cost: 1 },
  trail: { id: 'trail', ru: 'шлейф вдоль пути', cost: 2 },
  spiral: { id: 'spiral', ru: 'спираль', cost: 2 },
  rain: { id: 'rain', ru: 'осыпание сверху', cost: 2 },
});

/** Как частица движется после рождения. */
export const MOTIONS = table({
  linear: { id: 'linear', ru: 'прямо' },
  ease_out: { id: 'ease_out', ru: 'с торможением' },
  gravity: { id: 'gravity', ru: 'с падением' },
  rise: { id: 'rise', ru: 'вверх' },
  swirl: { id: 'swirl', ru: 'закручиваясь' },
});

/** Чем частица нарисована. Формы, не текстуры: текстура — это уровень 2. */
export const SPRITES = table({
  dot: { id: 'dot', ru: 'точка', scale: 1 },
  streak: { id: 'streak', ru: 'штрих', scale: 1.6 },
  shard: { id: 'shard', ru: 'осколок', scale: 1.3 },
  spark: { id: 'spark', ru: 'искра', scale: 0.7 },
});

/** След на полу. */
export const DECALS = table({
  none: { id: 'none', ru: 'нет' },
  ring: { id: 'ring', ru: 'кольцо на полу' },
  scorch: { id: 'scorch', ru: 'пятно' },
  cross: { id: 'cross', ru: 'перекрестье' },
});

/**
 * Экранный эффект.
 *
 * Тряска здесь ОГРАНИЧЕНА и складывается с той, что вьювер уже даёт на
 * попадание. Автор, которому позволили трясти камеру как угодно, сделает
 * невозможным смотреть чужой бой — а чужие бои и есть трансляция арены.
 */
export const SCREENS = table({
  none: { id: 'none', ru: 'нет' },
  shake: { id: 'shake', ru: 'толчок камеры' },
  flash: { id: 'flash', ru: 'вспышка кадра' },
});

/* ── ПРЕДЕЛЫ ─────────────────────────────────────────────────────────────── */

/** Слоёв на одно умение. Три — это «есть замысел», десять — это каша. */
export const MAX_LAYERS = 3;
/** Частиц на один каст, суммарно по слоям. Пул вьювера — 3000 на всю сцену. */
export const MAX_PARTICLES = 120;
/** Секунд жизни слоя. Дольше — эффект переживает сам бой. */
export const MAX_LIFE = 2.5;
/** Задержка слоя от начала каста. */
export const MAX_DELAY = 0.6;
/** Доля от максимума тряски, которую автор может добрать сверх штатной. */
export const MAX_SHAKE = 0.25;

const NUM = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Проверка одного слоя.
 *
 * Возвращает массив проблем; пустой массив значит «принято». Формат тот же,
 * что у `validateSkill` в реестре умений, — и не ради единообразия, а потому
 * что оба списка едут в один и тот же экран отказа.
 */
function checkLayer(l, i) {
  const bad = [];
  const at = `слой ${i + 1}`;
  if (!l || typeof l !== 'object' || Array.isArray(l)) return [{ code: 'shape', ru: `${at}: не объект` }];

  if (!EMITTERS[l.emitter]) bad.push({ code: 'emitter', ru: `${at}: неизвестный эмиттер «${l.emitter}»` });
  if (!MOTIONS[l.motion]) bad.push({ code: 'motion', ru: `${at}: неизвестное движение «${l.motion}»` });
  if (!SPRITES[l.sprite]) bad.push({ code: 'sprite', ru: `${at}: неизвестный спрайт «${l.sprite}»` });
  if (l.decal !== undefined && !DECALS[l.decal]) bad.push({ code: 'decal', ru: `${at}: неизвестный след «${l.decal}»` });

  /*
   * ЦВЕТ — ИНДЕКС, А НЕ ЦВЕТ.
   *
   * Палитру задаёт элемент, и она заблокирована (§9.2). Автор выбирает только,
   * с какой её ступени начать и на какой закончить. Поэтому здесь нет ни
   * hex-строк, ни каналов: перекрасить эффект нечем, и это не ограничение
   * интерфейса, а невозможность по устройству.
   */
  for (const k of ['from', 'to']) {
    const v = l[k];
    if (!Number.isInteger(v) || v < 0 || v > 2) {
      bad.push({ code: 'gradient', ru: `${at}: ${k} должен быть ступенью палитры 0, 1 или 2` });
    }
  }

  if (!Number.isInteger(l.count) || l.count < 1 || l.count > MAX_PARTICLES) {
    bad.push({ code: 'count', ru: `${at}: частиц должно быть от 1 до ${MAX_PARTICLES}` });
  }
  if (!NUM(l.life) || l.life <= 0 || l.life > MAX_LIFE) {
    bad.push({ code: 'life', ru: `${at}: жизнь должна быть больше 0 и не больше ${MAX_LIFE} с` });
  }
  if (l.delay !== undefined && (!NUM(l.delay) || l.delay < 0 || l.delay > MAX_DELAY)) {
    bad.push({ code: 'delay', ru: `${at}: задержка от 0 до ${MAX_DELAY} с` });
  }
  if (l.speed !== undefined && (!NUM(l.speed) || l.speed < 0 || l.speed > 14)) {
    bad.push({ code: 'speed', ru: `${at}: скорость от 0 до 14 м/с` });
  }
  if (l.size !== undefined && (!NUM(l.size) || l.size < 0.05 || l.size > 1.2)) {
    bad.push({ code: 'size', ru: `${at}: размер от 0.05 до 1.2 м` });
  }
  return bad;
}

/**
 * Проверка IR одного умения.
 *
 * @param {unknown} ir
 * @returns {Array<{code: string, ru: string}>} пустой массив — принято
 */
export function validateIr(ir) {
  if (ir === null || ir === undefined) return [];
  if (typeof ir !== 'object' || Array.isArray(ir)) return [{ code: 'shape', ru: 'IR должен быть объектом' }];

  const bad = [];
  const layers = ir.layers;
  if (!Array.isArray(layers) || layers.length === 0) {
    bad.push({ code: 'layers', ru: 'нужен хотя бы один слой' });
    return bad;
  }
  if (layers.length > MAX_LAYERS) {
    bad.push({ code: 'layers', ru: `слоёв не больше ${MAX_LAYERS}, прислано ${layers.length}` });
  }
  layers.slice(0, MAX_LAYERS).forEach((l, i) => bad.push(...checkLayer(l, i)));

  /*
   * БЮДЖЕТ ЧАСТИЦ — СУММАРНЫЙ, а не на слой.
   *
   * Три слоя по «законному» максимуму — это уже втрое больше бюджета. Предел
   * на слой без предела на сумму защищает ровно ни от чего: обходится
   * копированием слоя.
   */
  const total = layers.reduce((a, l) => a + (Number.isInteger(l?.count) ? l.count : 0), 0);
  if (total > MAX_PARTICLES) {
    bad.push({ code: 'budget', ru: `частиц на каст не больше ${MAX_PARTICLES}, набрано ${total}` });
  }

  if (ir.screen !== undefined) {
    if (!SCREENS[ir.screen]) bad.push({ code: 'screen', ru: `неизвестный экранный эффект «${ir.screen}»` });
    else if (ir.screen !== 'none') {
      const a = ir.screenAmount;
      if (!NUM(a) || a <= 0 || a > MAX_SHAKE) {
        bad.push({ code: 'screen', ru: `сила экранного эффекта от 0 до ${MAX_SHAKE}` });
      }
    }
  }
  return bad;
}

/**
 * Привести IR к каноническому виду: только известные поля, только в пределах.
 *
 * ЗАЧЕМ ЭТО ОТДЕЛЬНО ОТ ПРОВЕРКИ. Проверка говорит «да» или «нет», но она не
 * снимает лишнего. Модель может прислать валидный IR С ДОБАВКОЙ — полем,
 * которого нет в грамматике. Само по себе оно безвредно, но оно доедет до
 * интерпретатора и до базы, и через месяц кто-нибудь начнёт его читать.
 * Канонизация делает это невозможным: наружу выходит объект, собранный здесь
 * из известных полей, а не присланный.
 */
export function canonicalIr(ir) {
  if (validateIr(ir).length) return null;
  if (!ir) return null;
  const out = {
    layers: ir.layers.slice(0, MAX_LAYERS).map((l) => ({
      emitter: l.emitter,
      motion: l.motion,
      sprite: l.sprite,
      decal: DECALS[l.decal] ? l.decal : 'none',
      from: l.from,
      to: l.to,
      count: l.count,
      life: Math.round(l.life * 100) / 100,
      delay: NUM(l.delay) ? Math.round(l.delay * 100) / 100 : 0,
      speed: NUM(l.speed) ? Math.round(l.speed * 100) / 100 : 3,
      size: NUM(l.size) ? Math.round(l.size * 1000) / 1000 : 0.18,
    })),
  };
  if (ir.screen && ir.screen !== 'none') {
    out.screen = ir.screen;
    out.screenAmount = Math.round(ir.screenAmount * 1000) / 1000;
  }
  return out;
}

/** Сколько различимых декораций даёт грамматика частей — для отчёта и промпта. */
export function decorCount() {
  const perLayer = Object.keys(EMITTERS).length
    * Object.keys(MOTIONS).length
    * Object.keys(SPRITES).length
    * Object.keys(DECALS).length;
  return perLayer;
}

/** Вся грамматика частей одним объектом — для клиента и для промпта. */
export function vfxGrammar() {
  return {
    emitters: EMITTERS,
    motions: MOTIONS,
    sprites: SPRITES,
    decals: DECALS,
    screens: SCREENS,
    limits: {
      layers: MAX_LAYERS,
      particles: MAX_PARTICLES,
      life: MAX_LIFE,
      delay: MAX_DELAY,
      shake: MAX_SHAKE,
    },
    decorations: decorCount(),
  };
}
