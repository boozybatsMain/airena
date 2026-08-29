/**
 * Грамматика скиллов — пять закрытых осей (§8).
 *
 * Реестр, а не идея: у каждого атома есть цена в бюджете силы, требования к
 * доставке и — обязательно — **VFX-сигнатура**. Правило перенесено из Autoage
 * дословно вместе с его комментарием: *«variety the player cannot see is not
 * variety»*. Атом без сигнатуры не регистрируется; это проверяет `selfTest()`
 * и релизный гейт.
 *
 * Оси:
 *   TRIGGER  (5)  когда скилл пытается сработать
 *   DELIVERY (8)  каким силуэтом он летит
 *   EFFECT   (14) что он делает, 1–3 штуки
 *   CHANNEL  (7)  какое число крутит boost/weaken — обязателен при них
 *   ELEMENT  (5)  палитра и импакт. ТОЛЬКО ВИЗУАЛ, не трогает ни одного числа
 *
 * Единственное правило легальности — L1: доставка `self` допускает только
 * {shield, heal, cleanse, boost, wall}. SELF-атом на нацеленной доставке
 * применяется к КАСТЕРУ при попадании — это вампиризм, и он читается верно.
 * Больше исключений не нужно, и добавлять их нельзя без решения основателя.
 */

/** Классы атомов: кому применяется эффект. */
export const TARGETED = 'targeted';
export const SELF = 'self';
export const WORLD = 'world';

export const TRIGGERS = {
  active: {
    id: 'active', ru: 'по решению мозга',
    doc: 'мозг вызывает скилл сам через api.startSkill',
    cost: 0,
  },
  on_hit_taken: {
    id: 'on_hit_taken', ru: 'когда меня ударили',
    doc: 'срабатывает на входящем уроне, если скилл не на кулдауне',
    cost: 1,
  },
  on_hit_dealt: {
    id: 'on_hit_dealt', ru: 'когда я попал',
    doc: 'срабатывает на исходящем уроне',
    cost: 1,
  },
  on_low_hp: {
    id: 'on_low_hp', ru: 'когда я ранен',
    doc: 'один раз за бой, при падении здоровья ниже трети',
    cost: 2,
  },
  on_enemy_cast: {
    id: 'on_enemy_cast', ru: 'когда враг начал каст',
    doc: 'срабатывает на чужом замахе — читается как контрплей',
    cost: 2,
  },
};

/**
 * Доставки. `silhouette` — то, что VFX обязан нарисовать; это неприкосновенная
 * часть READ KIT (§9.2): LLM может ДОБАВЛЯТЬ поверх, но не ЗАМЕНЯТЬ силуэт.
 */
export const DELIVERIES = {
  beam: {
    id: 'beam', ru: 'луч', klass: TARGETED, cost: 5,
    silhouette: 'цилиндр от кастера к точке попадания',
    windup: 0.65, recover: 0.10, range: 24, needsLos: true,
    doc: 'мгновенно по прямой, останавливается о препятствие',
  },
  cone: {
    id: 'cone', ru: 'конус', klass: TARGETED, cost: 4,
    silhouette: 'клин конуса от кастера',
    windup: 0.28, recover: 0.28, range: 3.4, halfAngle: 0.96, needsLos: true,
    doc: 'вблизи, широко, быстро',
  },
  bolt: {
    id: 'bolt', ru: 'снаряд', klass: TARGETED, cost: 4,
    silhouette: 'спрайт болта, летящий по прямой',
    windup: 0.34, recover: 0.16, range: 18, speed: 22, needsLos: false,
    doc: 'летит время, его можно обойти',
  },
  lob: {
    id: 'lob', ru: 'навес', klass: TARGETED, cost: 4,
    silhouette: 'дуга лоба с меткой приземления',
    windup: 0.5, recover: 0.2, range: 15, speed: 12, needsLos: false, arc: true,
    doc: 'перелетает препятствия, приземляется с задержкой',
  },
  zone: {
    id: 'zone', ru: 'зона', klass: WORLD, cost: 5,
    silhouette: 'диск зоны на полу',
    windup: 0.45, recover: 0.25, range: 12, radius: 3.0, duration: 3.0, needsLos: false,
    doc: 'область, которая работает несколько секунд',
  },
  dash: {
    id: 'dash', ru: 'рывок', klass: TARGETED, cost: 4,
    silhouette: 'лента рывка за телом',
    windup: 0.18, recover: 0.26, distance: 8.0, needsLos: true,
    doc: 'кастер едет вперёд и бьёт всех по пути',
  },
  blink: {
    id: 'blink', ru: 'мигание', klass: SELF, cost: 5,
    silhouette: 'два кольца — откуда и куда',
    windup: 0.0, recover: 0.18, distance: 7.5, iframes: 0.28, needsLos: false,
    doc: 'мгновенное перемещение с неуязвимостью',
  },
  self: {
    id: 'self', ru: 'на себя', klass: SELF, cost: 3,
    silhouette: 'оболочка вокруг тела',
    windup: 0.30, recover: 0.18, needsLos: false,
    doc: 'применяется к кастеру',
  },
};

/**
 * Эффекты. `klass` решает, к кому применяется атом, а L1 — где он допустим.
 * `vfx` — обязательная сигнатура импакта.
 *
 * Три атома специфичны для Airena и стоят больше, чем в Autoage, потому что
 * бьют по слою принятия решений — самое интересное, что может делать скилл
 * в игре, чей тезис «решения принимает LLM»:
 *   blind    портит объект перцепции цели (блок противника из кольцевого
 *            буфера с задержкой 30 тиков, при self.blinded = true)
 *   silence  заставляет startSkill цели отказывать с причиной 'silenced'
 *   wall     вставляет временный солид в world.obstacles
 */
export const EFFECTS = {
  damage: { id: 'damage', ru: 'урон', klass: TARGETED, cost: 4, vfx: 'вспышка удара по цели', mag: 26 },
  burn: { id: 'burn', ru: 'горение', klass: TARGETED, cost: 4, vfx: 'тлеющий шлейф на теле цели', mag: 4.5, duration: 4 },
  knock: { id: 'knock', ru: 'отброс', klass: TARGETED, cost: 3, vfx: 'волна от точки удара', mag: 2.4 },
  pull: { id: 'pull', ru: 'притяжение', klass: TARGETED, cost: 4, vfx: 'сходящиеся к кастеру линии', mag: 3.0 },
  stun: { id: 'stun', ru: 'оглушение', klass: TARGETED, cost: 6, vfx: 'кольцо над головой цели', duration: 0.9 },
  root: { id: 'root', ru: 'обездвиживание', klass: TARGETED, cost: 5, vfx: 'скобы у ног цели', duration: 1.4 },
  shield: { id: 'shield', ru: 'щит', klass: SELF, cost: 5, vfx: 'оболочка по силуэту тела', mag: 40, duration: 5 },
  heal: { id: 'heal', ru: 'лечение', klass: SELF, cost: 5, vfx: 'восходящие искры', mag: 26 },
  cleanse: { id: 'cleanse', ru: 'очищение', klass: SELF, cost: 4, vfx: 'сброшенная оболочка' },
  blind: { id: 'blind', ru: 'ослепление', klass: TARGETED, cost: 6, mind: true, vfx: 'помеха на силуэте цели', duration: 2.5 },
  silence: { id: 'silence', ru: 'немота', klass: TARGETED, cost: 6, mind: true, vfx: 'перечёркнутый знак каста', duration: 2.2 },
  wall: { id: 'wall', ru: 'стена', klass: WORLD, cost: 5, vfx: 'вырастающая плита', duration: 5, size: [4, 1] },
  boost: { id: 'boost', ru: 'усиление', klass: SELF, cost: 4, needsChannel: true, vfx: 'подсветка по каналу', mag: 1.35, duration: 5 },
  weaken: { id: 'weaken', ru: 'ослабление', klass: TARGETED, cost: 5, needsChannel: true, vfx: 'приглушение по каналу', mag: 0.7, duration: 4 },
};

/**
 * Каналы. `mind`-класс дороже: канал, который бьёт по чувствам и решениям,
 * стоит больше канала, который двигает число.
 */
export const CHANNELS = {
  speed: { id: 'speed', ru: 'скорость', cost: 2 },
  turn: { id: 'turn', ru: 'поворот', cost: 2 },
  damage: { id: 'damage', ru: 'урон', cost: 3 },
  armor: { id: 'armor', ru: 'броня', cost: 3 },
  cooldown: { id: 'cooldown', ru: 'кулдаун', cost: 3 },
  range: { id: 'range', ru: 'дальность', cost: 2 },
  vision: { id: 'vision', ru: 'обзор', cost: 4, mind: true },
};

/**
 * Элементы. ТОЛЬКО ВИЗУАЛ (решение 28.08): механическая роль — профиль
 * сопротивлений — убрана вместе с резистами. Элемент задаёт палитру, силуэт
 * снаряда и импакт и **не трогает ни одного числа**, поэтому его цена — 0.
 *
 * Словарь обязан быть правдоподобным против РОБОТА: `venom` исключён — яд
 * машине ничто. `acid` — кандидат на замену, открытый вопрос §8.
 */
export const ELEMENTS = {
  kinetic: { id: 'kinetic', ru: 'кинетика', cost: 0, palette: ['#d8e2ea', '#9fb4c4', '#5d7183'], read: 'удар' },
  ember: { id: 'ember', ru: 'жар', cost: 0, palette: ['#ffd9a0', '#ff9a4d', '#c8431c'], read: 'перегрев' },
  frost: { id: 'frost', ru: 'мороз', cost: 0, palette: ['#dff4ff', '#8fd4f0', '#3f8fbd'], read: 'обледенение и хрупкость' },
  arc: { id: 'arc', ru: 'дуга', cost: 0, palette: ['#eaf3ff', '#9fd8ff', '#4a7cff'], read: 'электричество' },
  void: { id: 'void', ru: 'пустота', cost: 0, palette: ['#e6dcff', '#a98cf0', '#4b2f8c'], read: 'фантастика, но однозначна' },
};

/** L1 — единственное правило легальности. */
export const SELF_ALLOWED = new Set(['shield', 'heal', 'cleanse', 'boost', 'wall']);

/**
 * Бюджет силы одного скилла. Сервер пересчитывает его заново перед матчем.
 *
 * 22 — не круглое число, а результат перебора. §8 разрешает брать 1–3 эффекта;
 * перебор всех 52 780 легальных комбинаций показал, при каком потолке эта ось
 * действительно доступна:
 *
 *   бюджет 16 → 1 914 комбинаций, из них трёхэффектных   0
 *   бюджет 18 → 4 456 комбинаций, из них трёхэффектных   0
 *   бюджет 20 → 7 877 комбинаций, из них трёхэффектных  24
 *   бюджет 22 → 10 107 комбинаций, из них трёхэффектных 693
 *   бюджет 24 → 14 586 комбинаций, из них трёхэффектных 5 016
 *
 * До 20 включительно третий эффект недостижим вообще — то есть целая
 * задокументированная ось грамматики не существует, и это не строгость, а
 * поломка. С 24 трёхэффектные перестают быть редкими. 22 оставляет их
 * дорогими и возможными: 693 из 10 107, то есть 7% допустимого пространства.
 */
export const SKILL_BUDGET = 22;
/**
 * Бюджет всего кита. Не 3 × SKILL_BUDGET: три максимальных скилла (66) — это
 * набор без единого выбора. 52 значит «три крепких по 17 или один дорогой и
 * два поскромнее», то есть решение, а не сложение.
 */
export const KIT_BUDGET = 52;
/** Каждое существо несёт ровно 3 скилла (зафиксировано 28.08). */
export const KIT_SIZE = 3;

/**
 * Цена скилла. Считается ТОЛЬКО здесь, и только на сервере: цифры, присланные
 * клиентом или LLM, не авторитетны (§8).
 */
export function costOf(skill) {
  const t = TRIGGERS[skill.trigger];
  const d = DELIVERIES[skill.delivery];
  if (!t || !d) return Infinity;
  let sum = t.cost + d.cost;
  for (const e of skill.effects || []) {
    const a = EFFECTS[e];
    if (!a) return Infinity;
    sum += a.cost;
  }
  if (skill.channel) {
    const c = CHANNELS[skill.channel];
    if (!c) return Infinity;
    sum += c.cost;
  }
  /* Два и три эффекта на одном скилле дорожают сверх суммы: комбинация стоит
     больше своих частей, потому что попадание одно, а срабатывает всё. */
  const n = (skill.effects || []).length;
  if (n === 2) sum += 2;
  if (n >= 3) sum += 5;
  return sum;
}

/**
 * Проверка легальности. Возвращает список нарушений — пустой значит «годен».
 * Список, а не первое нарушение: игроку показывается всё сразу, иначе он
 * чинит кит по одному сообщению за раз.
 */
export function validateSkill(skill) {
  const bad = [];
  if (!skill || typeof skill !== 'object') return [{ code: 'shape', ru: 'скилл не объект' }];
  if (!TRIGGERS[skill.trigger]) bad.push({ code: 'trigger', ru: `нет такого триггера: ${skill.trigger}` });
  if (!DELIVERIES[skill.delivery]) bad.push({ code: 'delivery', ru: `нет такой доставки: ${skill.delivery}` });
  const eff = Array.isArray(skill.effects) ? skill.effects : [];
  if (eff.length < 1 || eff.length > 3) bad.push({ code: 'effects_count', ru: 'эффектов должно быть от 1 до 3' });
  if (new Set(eff).size !== eff.length) bad.push({ code: 'effects_dup', ru: 'эффекты повторяются' });
  for (const e of eff) if (!EFFECTS[e]) bad.push({ code: 'effect', ru: `нет такого эффекта: ${e}` });
  if (skill.element && !ELEMENTS[skill.element]) bad.push({ code: 'element', ru: `нет такого элемента: ${skill.element}` });

  const needsChannel = eff.some((e) => EFFECTS[e]?.needsChannel);
  if (needsChannel && !CHANNELS[skill.channel]) {
    bad.push({ code: 'channel', ru: 'boost и weaken обязаны назвать канал' });
  }
  if (!needsChannel && skill.channel) bad.push({ code: 'channel_extra', ru: 'канал задан, но его некому крутить' });

  /* L1 — единственное исключение в грамматике. */
  if (skill.delivery === 'self') {
    for (const e of eff) {
      if (!SELF_ALLOWED.has(e)) {
        bad.push({ code: 'L1', ru: `«${EFFECTS[e]?.ru || e}» нельзя доставить на себя` });
      }
    }
  }

  const cost = costOf(skill);
  if (cost > SKILL_BUDGET) bad.push({ code: 'budget', ru: `бюджет скилла ${cost} из ${SKILL_BUDGET}` });
  return bad;
}

export function validateKit(kit) {
  const bad = [];
  if (!Array.isArray(kit)) return [{ code: 'shape', ru: 'кит не массив' }];
  if (kit.length !== KIT_SIZE) bad.push({ code: 'size', ru: `в ките ровно ${KIT_SIZE} скилла, получено ${kit.length}` });
  kit.forEach((s, i) => {
    for (const b of validateSkill(s)) bad.push({ ...b, slot: i });
  });
  const total = kit.reduce((s, k) => s + costOf(k), 0);
  if (total > KIT_BUDGET) bad.push({ code: 'kit_budget', ru: `бюджет кита ${total} из ${KIT_BUDGET}` });
  /* Три одинаковых скилла — это один скилл с тремя кулдаунами. Читаемости
     ноль, а именно она — предмет §8. */
  const sig = kit.map((s) => `${s.delivery}:${(s.effects || []).join('+')}`);
  if (new Set(sig).size < sig.length) bad.push({ code: 'kit_dup', ru: 'два скилла в ките делают одно и то же' });
  return bad;
}

/** Читаемое имя скилла на русском — для карточки и для «не вошло». */
export function describe(skill) {
  const d = DELIVERIES[skill.delivery];
  const eff = (skill.effects || []).map((e) => EFFECTS[e]?.ru || e).join(' + ');
  const t = TRIGGERS[skill.trigger];
  const el = ELEMENTS[skill.element];
  const ch = skill.channel ? CHANNELS[skill.channel] : null;
  const bits = [`${d?.ru || skill.delivery}: ${eff}`];
  if (ch) bits.push(`по каналу «${ch.ru}»`);
  if (t && t.id !== 'active') bits.push(`(${t.ru})`);
  if (el) bits.push(`· ${el.ru}`);
  return bits.join(' ');
}

/** Сколько всего различимых прочтений даёт грамматика — для отчёта. */
export function readingCount() {
  let n = 0;
  for (const d of Object.values(DELIVERIES)) {
    for (const e of Object.values(EFFECTS)) {
      if (d.id === 'self' && !SELF_ALLOWED.has(e.id)) continue;
      n += Object.keys(ELEMENTS).length;
    }
  }
  return n;
}

/**
 * Самопроверка реестра. Гоняется тестом и релизным гейтом: атом без
 * VFX-сигнатуры не должен доезжать до игрока, потому что разнообразие,
 * которого игрок не видит, разнообразием не является.
 */
export function selfTest() {
  const errs = [];
  for (const [id, a] of Object.entries(EFFECTS)) {
    if (!a.vfx) errs.push(`эффект ${id} без VFX-сигнатуры`);
    if (!a.klass) errs.push(`эффект ${id} без класса`);
    if (!Number.isFinite(a.cost)) errs.push(`эффект ${id} без цены`);
  }
  for (const [id, d] of Object.entries(DELIVERIES)) {
    if (!d.silhouette) errs.push(`доставка ${id} без силуэта`);
    if (!Number.isFinite(d.cost)) errs.push(`доставка ${id} без цены`);
  }
  for (const [id, e] of Object.entries(ELEMENTS)) {
    if (!Array.isArray(e.palette) || e.palette.length !== 3) errs.push(`элемент ${id} без палитры из трёх цветов`);
    if (e.cost !== 0) errs.push(`элемент ${id} стоит очков — элемент только визуал`);
  }
  if (Object.keys(TRIGGERS).length !== 5) errs.push('триггеров должно быть 5');
  if (Object.keys(DELIVERIES).length !== 8) errs.push('доставок должно быть 8');
  if (Object.keys(EFFECTS).length !== 14) errs.push('эффектов должно быть 14');
  if (Object.keys(CHANNELS).length !== 7) errs.push('каналов должно быть 7');
  if (Object.keys(ELEMENTS).length !== 5) errs.push('элементов должно быть 5');
  return errs;
}

/** Весь реестр одним объектом — для клиента и для промпта генерации. */
export function grammar() {
  return {
    triggers: TRIGGERS,
    deliveries: DELIVERIES,
    effects: EFFECTS,
    channels: CHANNELS,
    elements: ELEMENTS,
    selfAllowed: [...SELF_ALLOWED],
    budgets: { skill: SKILL_BUDGET, kit: KIT_BUDGET, size: KIT_SIZE },
    readings: readingCount(),
  };
}
