/**
 * Кит → то, что умеет исполнять симуляция.
 *
 * Грамматика §8 описывает умение пятью осями. Симуляция исполняет объекты
 * той же формы, что `SKILLS` в `config.js`: фазы, кулдаун, дальность,
 * множители движения. Этот файл — мост между ними, и он односторонний:
 * сервер компилирует кит в определения, симуляция их читает и никогда не
 * пишет обратно.
 *
 * Числа берутся из реестра, а не выдумываются здесь. Реестр — единственное
 * место, где живёт цена и сила атома (§8: сервер пересчитывает бюджет заново
 * перед матчем; если бы сила жила в двух местах, пересчитывать было бы
 * нечего).
 *
 * ЧТО ЭТОТ ФАЙЛ НЕ ДЕЛАЕТ. Он не трогает четыре захардкоженных умения
 * (`laser`, `blink`, `smash`, `charge`) и `jump`. Они — основание §1: шесть
 * эталонных мозгов написаны против них, все 2450 матчей турнира сыграны на
 * них, и любая правка там переписывает измерение задним числом. Умения из
 * грамматики живут рядом, под собственным резолвером.
 */

import {
  CHANNELS, DELIVERIES, EFFECTS, ELEMENTS, TRIGGERS, costOf, validateSkill,
} from './registry.js';

/**
 * Кулдаун выводится из цены. Дорогое умение не может быть частым — иначе
 * бюджет силы измеряет одну сторону силы и не замечает вторую.
 *
 * 0.9 с на очко даёт: дешёвый рывок (8) — 7.2 с, дорогой конус с двумя
 * эффектами (18) — 16.2 с. Прицел на бой длиной 25.8 с (§16): дешёвое
 * успевает три раза, дорогое один.
 */
export const COOLDOWN_PER_POINT = 0.9;
export const COOLDOWN_MIN = 1.1;

/**
 * Пассивный триггер стоит кулдауна: иначе он срабатывает каждый тик.
 *
 * `on_low_hp` множителя не получает вовсе, и это не поблажка: он и так
 * одноразовый за бой (`firedLowHp` в симуляции). Множитель 6 давал ему
 * 54 секунды отката при длине боя 25.8 с — то есть штрафовал дважды за
 * одно, и второй штраф был невидим ни в одном числе на экране.
 */
export const TRIGGER_COOLDOWN = {
  active: 1.0,
  on_hit_taken: 1.35,
  on_hit_dealt: 1.35,
  on_low_hp: 1.0,
  on_enemy_cast: 1.6,
};

/**
 * Скомпилировать одно умение.
 *
 * @param {object} skill  {trigger, delivery, effects[], channel?, element}
 * @param {string} id     имя в рантайме: `k1`, `k2`, `k3`
 */
export function compileSkill(skill, id) {
  const bad = validateSkill(skill);
  if (bad.length) return { error: bad };

  const d = DELIVERIES[skill.delivery];
  const t = TRIGGERS[skill.trigger];
  const cost = costOf(skill);
  const effects = skill.effects.map((e) => ({ ...EFFECTS[e], id: e }));

  const def = {
    id,
    /* `generic` — метка для симуляции: это умение из грамматики, его
       исполняет общий резолвер, а не одна из четырёх ветвей `resolveStrike`. */
    generic: true,
    grammar: { ...skill },
    kind: d.id,
    trigger: t.id,
    element: skill.element || 'kinetic',
    palette: (ELEMENTS[skill.element] || ELEMENTS.kinetic).palette,
    channel: skill.channel || null,
    cost,

    windup: d.windup,
    recover: d.recover,
    cooldown: Math.max(COOLDOWN_MIN, cost * COOLDOWN_PER_POINT * (TRIGGER_COOLDOWN[t.id] ?? 1)),
    needsLos: d.needsLos === true,
    interruptible: d.windup > 0.2,

    /* Множители движения: чем длиннее замах, тем сильнее он приковывает.
       Мгновенные доставки (blink) не замедляют вовсе. */
    moveScale: d.windup === 0 ? 1 : clamp(1 - d.windup * 0.8, 0.25, 1),
    turnScale: d.windup === 0 ? 1 : clamp(1 - d.windup * 0.6, 0.3, 1),

    effects: effects.map((e) => ({
      id: e.id, klass: e.klass, mag: e.mag ?? null,
      duration: e.duration ?? null, mind: !!e.mind, size: e.size ?? null,
      channel: e.needsChannel ? skill.channel : null,
    })),
  };

  /* Геометрия доставки — то, что резолвер обязан знать, чтобы построить
     форму: без range у конуса нет длины, без radius у зоны нет площади. */
  for (const k of ['range', 'halfAngle', 'speed', 'radius', 'duration', 'distance', 'iframes', 'arc']) {
    if (d[k] !== undefined) def[k] = d[k];
  }

  /*
   * Сила эффекта делится на число эффектов.
   *
   * Иначе комбинация «урон + оглушение» бьёт как полный урон И оглушает,
   * то есть строго сильнее каждой из частей при цене всего на два очка
   * выше. Делитель делает выбор настоящим: один эффект в полную силу или
   * два по три четверти.
   */
  const share = [1, 0.75, 0.6][Math.min(def.effects.length, 3) - 1];
  for (const e of def.effects) {
    if (e.mag !== null) e.mag = round3(e.mag * share);
    if (e.duration !== null) e.duration = round3(e.duration * share);
  }
  /* Урон — то, что читает HUD и лента; поднимаем его на верхний уровень. */
  const dmg = def.effects.find((e) => e.id === 'damage');
  if (dmg) def.damage = Math.round(dmg.mag);

  return { def };
}

/**
 * Скомпилировать весь кит. Возвращает объект `{ k1, k2, k3 }` в форме
 * `SKILLS`, плюс `jump` — прыжок есть у всех и в кит не входит (§8:
 * `skillsOf` всегда добавляет его).
 */
export function compileKit(kit) {
  const defs = {}; const problems = [];
  (kit || []).forEach((s, i) => {
    const out = compileSkill(s, `k${i + 1}`);
    if (out.error) { problems.push({ slot: i, problems: out.error }); return; }
    defs[out.def.id] = out.def;
  });
  return { defs, names: Object.keys(defs), problems };
}

/**
 * Как умение называется для игрока и для мозга.
 *
 * Мозг видит его в перцепции и вызывает по имени; имя обязано быть коротким
 * и стабильным, поэтому `k1..k3`. Читаемое имя идёт рядом отдельным полем —
 * промпт и HUD показывают его, а `api.use` принимает только короткое.
 */
export function readable(def) {
  const d = DELIVERIES[def.kind];
  const eff = def.effects.map((e) => EFFECTS[e.id]?.ru || e.id).join(' + ');
  const ch = def.channel ? ` по каналу «${CHANNELS[def.channel]?.ru || def.channel}»` : '';
  return `${d?.ru || def.kind}: ${eff}${ch}`;
}

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
const round3 = (x) => Math.round(x * 1000) / 1000;
