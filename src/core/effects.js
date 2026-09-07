/**
 * Атомы эффектов — что происходит с бойцом, когда в него попали.
 *
 * Отдельный файл, потому что у него одно свойство, которое надо было
 * защитить: **эффект не знает, чем его доставили**. Луч, конус и зона
 * применяют `damage` одинаково, и добавить четырнадцатый атом означает
 * дописать сюда четырнадцать строк, а не тронуть девять доставок.
 *
 * Три атома специфичны для Airena и стоят дороже прочих, потому что бьют
 * по слою принятия решений — самому интересному, что может делать умение
 * в игре, чей тезис «решения принимает LLM» (§8):
 *
 *   blind    портит ОБЪЕКТ ПЕРЦЕПЦИИ цели: блок противника отдаётся из
 *            кольцевого буфера с задержкой 30 тиков, и `self.blinded: true`
 *            стоит рядом — мозг обязан знать, что его чувства устарели.
 *            Врать мозгу молча нельзя: это не механика, это баг с точки
 *            зрения всех, кто его увидит.
 *   silence  заставляет `startSkill` цели отказывать с причиной 'silenced'.
 *   wall     вставляет временный солид в `world.obstacles`.
 *
 * Все три тривиально детерминированы — ни один не смотрит на часы.
 */

import { BURN_EVENT_EVERY, WALL_AHEAD, WALL_RAISED_HEIGHT } from './config.js';

/** Сколько тиков задержки даёт ослепление. §8 называет это число. */
export const BLIND_LAG_TICKS = 30;

/*
 * THE IMMUNITY CLASSES — perception reports their names in `p.self.immune` and
 * `p.enemy.immune`.
 *
 * Three classes, and a stun belongs to two of them. `act` is the ability to
 * start a cast (stun, silence), `move` the ability to move (stun, root),
 * `sense` the truth of perception (blind). A control arms the immunity of
 * every class it takes away, and a control is refused while ANY class it
 * would take is immune — so stun → silence is refused (act), stun → root is
 * refused (move), and silence → root goes through, because those are two
 * different things to lose. Measured on the earlier per-effect window: a kit
 * rotating stun → silence → root locked a target out of casting 44% of the
 * time; with classes the act-lock ceiling from any rotation is one control's
 * duration in every duration + window.
 */
export const IMMUNE_CATEGORY = Object.assign(Object.create(null), {
  stun: ['act', 'move'], root: ['move'], silence: ['act'], blind: ['sense'],
});

/**
 * Состояния, которые может нести боец. Заводятся лениво: боец без единого
 * эффекта не платит ни байтом, а `snapshot` не растёт на пустом объекте.
 */
export function ensureStatus(f) {
  if (!f.status) {
    f.status = {
      burn: null,       // { dps, until }
      root: 0,          // до какого t
      shield: 0,        // сколько ещё поглотит
      shieldUntil: 0,
      blind: 0,
      silence: 0,
      boost: {},        // канал -> { mul, until }
      weaken: {},
    };
  }
  return f.status;
}

/** Активен ли эффект прямо сейчас. */
export const active = (until, t) => until > t;

/**
 * Применить один атом. `src` — кто бьёт, `dst` — по кому.
 *
 * SELF-атомы на нацеленной доставке применяются к КАСТЕРУ при попадании
 * (§8): это вампиризм, и он читается верно. Поэтому получатель выбирается
 * здесь, а не в резолвере доставки.
 *
 * @returns {boolean} whether the atom actually landed. False means it was
 *   refused — by an armed immunity, by the target's i-frames — and `applyAtoms`
 *   uses it to build the `landed` list a control-only hit is announced with.
 */
export function applyEffect(world, srcId, dstId, atom, def, deps) {
  /* Лог и эффекты берутся ИЗ МИРА, а не из зависимостей: они принадлежат
     матчу, а `deps` — это набор функций, общий на все матчи. Взять их из
     deps значило бы писать все бои в один массив. */
  const { damage, round3 } = deps;
  const { log, fx } = world;
  const src = world.fighters[srcId];
  const dst = world.fighters[dstId];
  /* Куда летит атом: SELF и WORLD — к кастеру и в мир, остальное — в цель. */
  const to = atom.klass === 'self' ? src : dst;
  const st = ensureStatus(to);
  const t = world.t;

  /*
   * THE IMMUNITY WINDOW — the one rule a price cannot provide.
   *
   * With every cooldown at three seconds or under, a stun of 0.9 s every
   * 1.8 s is a fighter who plays half the fight, and a silence of 2.2 s every
   * 3 s is a fighter who never casts. No cost fixes that: a cheaper stun is
   * the same chain, only cheaper. So the four effects that take a DECISION
   * away — stun, root, silence, blind — leave behind an immunity to
   * themselves once they expire, `immune` seconds long (registry.js). The
   * second stun in a row lands on nothing and says so: `immune` in the log,
   * a 'missed' event with reason 'immune' for the caster, so a mind that
   * keeps pressing the same button learns why it stopped working. Damage on
   * the same ability still lands — only the control is refused.
   */
  /* The window belongs to a CLASS of control, not to one effect — see
     IMMUNE_CATEGORY above for why a stun and a root cannot alternate. */
  const classes = atom.immune ? (IMMUNE_CATEGORY[atom.id] || []) : [];
  if (classes.length && st.immune && classes.some((c) => st.immune[c] > t)) {
    /*
     * A REFUSAL THAT REACHES HERE IS A DECISION, AND IT IS LOUD.
     *
     * It used to be mostly noise: a field re-applied its control on every one
     * of its five ticks, four of them into the immunity the first tick had
     * armed, and 88% of every `immune` line in the league was a disc refusing
     * itself. That is fixed where it belonged — the field applies its controls
     * once per cast (`tickZones`) — so every line left here is what the line
     * always claimed to be: a DIFFERENT cast putting a control on a class that
     * is already armed. It is worth a log line, an event to the caster and,
     * now, something on screen: a refusal a spectator cannot see is a fight
     * that changes for no visible reason.
     */
    log.push({ t: round3(t), type: 'immune', who: to.id, effect: atom.id, by: srcId, skill: def.id });
    deps.emit(world, srcId, { type: 'missed', skill: def.id, reason: 'immune', effect: atom.id });
    fx.push({ kind: 'immune', who: to.id, t: round3(t), effect: atom.id, by: srcId });
    return false;
  }
  const arm = () => {
    if (!classes.length) return;
    if (!st.immune) st.immune = {};
    const until = t + (atom.duration || 0) + atom.immune;
    for (const c of classes) st.immune[c] = Math.max(st.immune[c] || 0, until);
  };
  /*
   * A control lands on a body inside its blink: nothing happens, and the
   * caster is told the same thing `damage()` tells it. The impulse atoms
   * used to ignore i-frames while damage respected them, so "invulnerable"
   * meant two different things depending on which atom arrived.
   *
   * ── AND THE DODGER IS TOLD, ONCE ──────────────────────────────────────────
   *
   * The prompt lists `{ type: 'evaded', skill, by }` for every kitted mind and
   * it could never arrive on the grammar path: the only `evaded` in the world
   * was inside `damage()`, which the two lines above return before. So a mind
   * that blinked under a bolt was told nothing at all, and `spectate.mjs` /
   * `bakeoff.mjs`, which count a dodge from the `evade` LOG line, read 0.00
   * dodges a fight for all 28 minds in the league — a metric measuring the
   * absence of a code path rather than the absence of a decision.
   *
   * Once per ABILITY per tick, not once per atom: a two-effect ability used to
   * send the attacker two `missed` events for one shot, and the defender would
   * have got two `evaded` for one dodge. The dedupe key is caster + ability, on
   * a set the world throws away every tick.
   */
  if (atom.klass === 'targeted' && to.iframes > 0) {
    if (world.evadeTick !== world.tick) { world.evadeTick = world.tick; world.evadeSeen = new Set(); }
    const key = `${srcId}|${def.id}`;
    if (!world.evadeSeen.has(key)) {
      world.evadeSeen.add(key);
      to.stats.evaded++;
      deps.emit(world, srcId, { type: 'missed', skill: def.id, reason: 'invulnerable', effect: atom.id });
      deps.emit(world, to.id, { type: 'evaded', skill: def.id, by: srcId });
      log.push({ t: round3(t), type: 'evade', who: to.id, skill: def.id });
      fx.push({ kind: 'evade', who: to.id, t: round3(t), skill: def.id, by: srcId });
    }
    return false;
  }

  switch (atom.id) {
    case 'damage':
      damage(world, srcId, dstId, atom.mag, def.id);
      return true;

    case 'burn': {
      /* Горение не складывается, а обновляется: два поджога подряд от одного
         умения — это один пожар, а не двойной урон в секунду. */
      const fresh = !st.burn || st.burn.until <= t;
      /*
       * A SECOND FIRE EXTENDS THE FIRST (fix round 1, 07.09) — the time still
       * burning grows by the new fire's length, up to twice that length —
       * instead of merely renewing it. Renewal threw away every second of
       * fire still burning when the next hit landed: a 3 s burn re-lit by a
       * 2.0 s fan kept about two thirds of what it was priced at, and the fan
       * of burn lost to the fan of damage 29 : 71 (cone×burn −17 pp on the
       * panel, the largest interaction in the table). Extending pays every
       * hit in full while the cap keeps a stream of hits from banking a
       * minute of fire. A FIELD'S ticks still renew: standing in fire is one
       * fire, and the afterburn on leaving stays one second.
       */
      const extend = !fresh && def.kind !== 'zone';
      const until = fresh ? t + atom.duration
        : extend ? Math.min(st.burn.until + atom.duration, t + 2 * atom.duration)
          : Math.max(st.burn.until, t + atom.duration);
      st.burn = {
        dps: Math.max(st.burn?.dps ?? 0, atom.mag),
        until: Math.max(st.burn?.until ?? 0, until),
        /* КТО поджёг. Поле читалось при смерти от горения (`burnedOut.by`) и
           не записывалось никогда, так что в логе всегда стояло null; а урон
           горения не попадал в счёт поджигателя вовсе. Игрок при этом видит
           на экране итога строку «урон» — и она была тем меньше, чем больше
           существо жгло. Уверенная неверная цифра хуже отсутствующей. */
        by: srcId,
      };
      /* ДЛИТЕЛЬНОСТЬ В ЗАПИСИ (docs/VFX-PLAN.md §7.7): вьювер держит статус
         ровно столько, сколько его держит сим, и не заводит второй эффект на
         то же тело, когда зона подкладывает статус каждые 0.5 с (P10).
         `atom.duration` — уже свёрнутая доля и тик (`compile.js`); у лечения
         и очищения её нет вовсе, и поле не пишется: `round3(null)` дал бы 0,
         а `??` пропустил бы этот 0 как настоящую длительность. Сим пишет,
         вьювер читает — инвариант §9 цел, у записи просто появилось поле. */
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'burn', element: def.element, ...(atom.duration != null ? { duration: round3(atom.duration) } : {}) });
      /* В лог — только начало пожара, не его продление. */
      if (fresh) log.push({ t: round3(t), type: 'ignite', who: srcId, target: to.id, skill: def.id });
      return true;
    }

    /*
     * KNOCK AND PULL ARE IMPULSES ON THE KNOCKBACK SLOT, not on the control
     * velocity. Written to `vx/vz` they were drained by the target's own
     * acceleration toward whatever it wanted to do — a body with a standing
     * move order shrugged a 15 m/s shove off in a fifth of a second, a
     * stunned one carried it 4 m. On `kx/kz` the impulse decays at
     * KNOCKBACK_DRAG for everybody alike (config.js), the way the reference
     * charge's has always done, and the distance is a fact the prompt can
     * state: mag² ÷ (2 · drag) metres. Both cancel a cancellable wind-up —
     * they are impacts, and the smash and the charge have always cancelled.
     */
    case 'knock': {
      const dx = to.x - src.x, dz = to.z - src.z;
      const l = Math.hypot(dx, dz) || 1;
      to.kx += (dx / l) * atom.mag;
      to.kz += (dz / l) * atom.mag;
      if (deps.interrupt && to !== src) deps.interrupt(world, srcId, def.id);
      deps.emit(world, to.id, { type: 'knockback', by: def.id });
      return true;
    }

    case 'pull': {
      const dx = src.x - to.x, dz = src.z - to.z;
      const l = Math.hypot(dx, dz) || 1;
      to.kx += (dx / l) * atom.mag;
      to.kz += (dz / l) * atom.mag;
      if (deps.interrupt && to !== src) deps.interrupt(world, srcId, def.id);
      deps.emit(world, to.id, { type: 'knockback', by: def.id });
      return true;
    }

    case 'stun':
      /* Оглушение не продлевает уже идущее: цепочка оглушений — это бой,
         в котором один из двоих не играет, и смотреть его нечего. */
      to.stun = Math.max(to.stun, atom.duration);
      arm();
      /* A stun lands on a wind-up: the cast is cancelled, the cooldown spent.
         `interrupt` reads `defOf`, so a grammar ability is cancellable exactly
         when compile.js said it was (wind-up over 0.2 s). */
      if (deps.interrupt && to !== src) deps.interrupt(world, srcId, def.id);
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'stun', element: def.element, ...(atom.duration != null ? { duration: round3(atom.duration) } : {}) });
      return true;

    case 'root':
      st.root = Math.max(st.root, t + atom.duration);
      arm();
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'root', element: def.element, ...(atom.duration != null ? { duration: round3(atom.duration) } : {}) });
      return true;

    case 'shield':
      st.shield = Math.max(st.shield, atom.mag);
      st.shieldUntil = Math.max(st.shieldUntil, t + atom.duration);
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'shield', element: def.element, ...(atom.duration != null ? { duration: round3(atom.duration) } : {}) });
      return true;

    case 'heal': {
      const before = to.hp;
      /*
       * A HEAL IS A SHARE OF WHAT IS MISSING, floored and capped. A flat
       * amount every three seconds was a second health bar: 26 hp a cast at
       * full cadence out-sustained one damaging ability outright (the starter
       * healer won 94% of its league the moment cooldowns dropped). A share
       * of the missing hp rewards the mind that heals when it is hurt and
       * gives almost nothing to one that heals on cooldown at full health —
       * self-limiting, and one sentence in the prompt: `mag` is the cap,
       * `floor` the least it ever gives, `share` the fraction of missing hp.
       */
      const missing = Math.max(0, to.def.hp - to.hp);
      const amount = Math.min(atom.mag, Math.max(atom.floor ?? 0, missing * (atom.share ?? 1)));
      to.hp = Math.min(to.def.hp, to.hp + amount);
      if (to.hp > before) {
        log.push({ t: round3(t), type: 'heal', who: to.id, amount: round3(to.hp - before) });
        fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'heal', element: def.element, ...(atom.duration != null ? { duration: round3(atom.duration) } : {}) });
      }
      return true;
    }

    case 'cleanse':
      st.burn = null; st.root = 0; st.blind = 0; st.silence = 0;
      st.weaken = {};
      to.stun = 0;
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'cleanse', element: def.element, ...(atom.duration != null ? { duration: round3(atom.duration) } : {}) });
      return true;

    case 'blind':
      /* Портится ОБЪЕКТ ПЕРЦЕПЦИИ, а не прицел: цель продолжает видеть, но
         видит прошлое. И знает об этом — `self.blinded` в перцепции. */
      st.blind = Math.max(st.blind, t + atom.duration);
      arm();
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'blind', element: def.element, ...(atom.duration != null ? { duration: round3(atom.duration) } : {}) });
      return true;

    case 'silence':
      st.silence = Math.max(st.silence, t + atom.duration);
      arm();
      /* Silence is the anti-caster tool: it also cancels a wind-up in
         progress, through the same door a stun uses. Without that it was
         strictly weaker than a stun, which cancels AND freezes the body. */
      if (deps.interrupt && to !== src) deps.interrupt(world, srcId, def.id);
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'silence', element: def.element, ...(atom.duration != null ? { duration: round3(atom.duration) } : {}) });
      return true;

    case 'wall': {
      /* Временный солид в мире. Ставится ПЕРЕД кастером, а не в точке
         попадания: стена, выросшая под ногами противника, выталкивает его
         сквозь геометрию, и это видно. */
      const [ux, uz] = [Math.sin(src.heading), Math.cos(src.heading)];
      const at = { x: src.x + ux * WALL_AHEAD, z: src.z + uz * WALL_AHEAD };
      const [w, d] = atom.size || [4, 1];
      /*
       * ПОЛУРАЗМЕРЫ, а не размеры. Арена описывает препятствия через `hx`/`hz`
       * (см. `src/core/geom.js`: segBox, pushOutOfBox, circleHitsBox — все три
       * читают именно их, и config.js со статическими блоками их и кладёт).
       *
       * Стена клала `w`/`d`, и это молча ломало ВСЮ геометрию арены на пять
       * секунд. `clamp(v, undefined, undefined)` возвращает `v`, поэтому
       * расстояние до коробки выходило нулевым для любого тела в любой точке:
       * `pushOutOfBox` выталкивал обоих бойцов из середины арены к северной
       * стене за один тик, а `segBox` объявлял луч перекрытым у самого дула,
       * то есть линия взгляда была ложна по всей карте. Замерено: бойцы с
       * (-6,0) и (6,0) оказывались на z=19 через 0.033 с после появления
       * стены, и `hasLos` возвращал false до её исчезновения.
       *
       * Хуже того, в перцепцию мозга уезжала коробка БЕЗ размеров: sim.js
       * отдаёт `{x, z, hx, hz}`, undefined выпадали при сериализации в изолят,
       * и мозг видел препятствие нулевого размера — ровно та «ложь движка»,
       * которую комментарий к `blind` в этом же файле называет недопустимой.
       * Вьювер при этом рисовал стену правильно, из своих `w`/`d`, так что
       * картинка и физика расходились.
       *
       * `w`/`d` остаются в записи для вьювера — ему нужны полные размеры.
       */
      const along = ux * ux > uz * uz;
      const fullW = along ? d : w;
      const fullD = along ? w : d;
      const box = {
        x: round3(at.x), z: round3(at.z),
        hx: round3(fullW / 2),
        hz: round3(fullD / 2),
        h: WALL_RAISED_HEIGHT, temporary: true, until: t + atom.duration, by: srcId, skill: def.id,
      };
      /* ONE WALL PER CASTER — the same rule as the field, stricter: two
         abilities with a wall each at three-second cooldowns built a maze in
         which the navigator pinned both bodies for forty seconds. The new
         wall replaces the caster's old one, whichever ability built it, and
         the navigation graphs are rebuilt on the next step (`navDirty`). */
      const stale = world.obstacles.filter((o) => o.temporary && o.by === srcId);
      if (stale.length) {
        world.obstacles = world.obstacles.filter((o) => !stale.includes(o));
        world.solids = world.solids.filter((o) => !stale.includes(o));
      }
      world.obstacles.push(box);
      world.solids.push(box);
      world.navDirty = true;
      log.push({ t: round3(t), type: 'wall', who: srcId, x: box.x, z: box.z });
      /* Длительность едет с событием: она зависит от числа эффектов в умении
         (доля делит и её), а вьювер рисовал стену ровно пять секунд всегда —
         то есть показывал стену, которой уже нет, или убирал ту, что стоит. */
      /* `height` — третье измерение коробки. Ширину и глубину вьювер получал,
         а высоту приходилось повторять числом 2.2 в четырёх местах (здесь,
         штатная плита в vfx.js и решётка молнии в arc/move.js): подвинуть её
         в одном месте значило разойтись с остальными. Теперь она одна. */
      fx.push({ kind: 'wall', who: srcId, t: round3(t), x: box.x, z: box.z,
        w: fullW, d: fullD, height: box.h, duration: round3(atom.duration), element: def.element });
      return true;
    }

    case 'boost':
      st.boost[atom.channel] = { mul: atom.mag, until: t + atom.duration };
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'boost', channel: atom.channel, element: def.element, ...(atom.duration != null ? { duration: round3(atom.duration) } : {}) });
      return true;

    case 'weaken':
      st.weaken[atom.channel] = { mul: atom.mag, until: t + atom.duration };
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'weaken', channel: atom.channel, element: def.element, ...(atom.duration != null ? { duration: round3(atom.duration) } : {}) });
      return true;

    default:
      /* An atom id the switch does not know applied nothing at all. */
      return false;
  }
}

/**
 * Apply a whole ability's atoms to one body, and tell the caster what landed.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * A hit that carried no damage announced NOTHING. `dealt` is emitted by
 * `damage()` and by nothing else, so `bolt:root` connecting on a body sent its
 * caster an empty event list — measured: a mind that landed a root learned
 * about it only by noticing `p.enemy.rooted` on its next thought, and a mind
 * that MISSED learned exactly the same amount. Two opposite outcomes, one
 * silence. Control-only abilities are a third of the grammar.
 *
 * So an ability whose atoms carry neither damage nor burn announces itself:
 * `{ type: 'dealt', skill, amount: 0, landed: [...], enemyHp }`, once per body
 * per tick, after its atoms have applied. `landed` holds the ids that actually
 * took — a control refused by an armed immunity is NOT in it, which is what
 * makes the event worth reading: the caster can tell "the root took" from "the
 * root was refused" without correlating two events.
 *
 * The event is deliberately absent for a damaging ability: that one already
 * emits `dealt` from `damage()` with a real amount, and a second one would
 * double every hit in every counter that reads the feed. `landed` is therefore
 * the field that says "this is the control-only shape of the event".
 *
 * SELF and WORLD atoms are not announced here. `dealt` means "you hit them";
 * a shield on yourself and a wall on the floor are neither, and the caster can
 * read both in its own perception.
 */
export function applyAtoms(world, srcId, dstId, atoms, def, deps, { skip = null } = {}) {
  const landed = [];
  let touchedThem = false;
  let announces = true;
  for (const atom of atoms) {
    if (skip && skip(atom)) continue;
    if (atom.id === 'damage' || atom.id === 'burn') announces = false;
    const took = applyEffect(world, srcId, dstId, atom, def, deps);
    if (atom.klass === 'targeted') {
      touchedThem = true;
      if (took) landed.push(atom.id);
    }
  }
  if (announces && touchedThem && landed.length) {
    const dst = world.fighters[dstId];
    deps.emit(world, srcId, {
      type: 'dealt', skill: def.id, amount: 0, landed, enemyHp: deps.round3(dst.hp),
    });
  }
  return landed;
}

/** Множитель канала на бойце: усиление × ослабление, оба с истечением. */
export function channelMul(f, channel, t) {
  const st = f.status;
  if (!st) return 1;
  const up = st.boost[channel];
  const down = st.weaken[channel];
  let m = 1;
  if (up && up.until > t) m *= up.mul;
  if (down && down.until > t) m *= down.mul;
  return m;
}

/**
 * Один тик состояний: горение, истечение сроков.
 *
 * Горение НЕ идёт через `damage()`. Оно тикает тридцать раз в секунду, и
 * каждый вызов писал бы строку в лог: замерено — один бой с двумя зонами
 * дал 520 записей `damage` из 19 применённых умений, то есть лог боя стал
 * нечитаемым, разбор в «что оно думало» — тоже, а `result_json` вырос в
 * тридцать раз. Урон применяется прямо, а в лог попадает событие, а не тик:
 * начало горения и смерть от него.
 */
export function tickStatus(world, id, dt, deps) {
  const f = world.fighters[id];
  const st = f.status;
  if (!st) return;
  const t = world.t;

  if (st.burn && st.burn.until > t && f.alive) {
    let amount = st.burn.dps * dt;
    amount = absorb(f, amount);
    if (amount > 0) {
      const before = f.hp;
      f.hp = Math.max(0, f.hp - amount);
      f.stats.damageTaken += amount;
      /* Счёт поджигателя. Не через `damage()` — по причине выше, — но в
         статистику урон обязан попасть: это тот же урон. */
      const src = st.burn.by ? world.fighters[st.burn.by] : null;
      if (src && src !== f) src.stats.damageDealt += amount;
      /* Одна строка на каждые 10 единиц здоровья — то же правило, по
         которому арена сообщает о своём выгорании. */
      if (Math.floor(before / BURN_EVENT_EVERY) !== Math.floor(f.hp / BURN_EVENT_EVERY)) {
        deps.emit(world, id, { type: 'burning', skill: 'burn', hp: deps.round3(f.hp) });
      }
      if (f.hp <= 0) {
        world.log.push({ t: deps.round3(t), type: 'burnedOut', who: id, by: st.burn.by ?? null });
        deps.kill(world, id);
      }
    }
  } else if (st.burn && st.burn.until <= t) st.burn = null;

  if (st.shieldUntil <= t) st.shield = 0;
  for (const bag of [st.boost, st.weaken]) {
    for (const k of Object.keys(bag)) if (bag[k].until <= t) delete bag[k];
  }
}

/** Снять истёкшие временные стены. Делается один раз на тик, для мира. */
export function tickWalls(world) {
  if (!world.obstacles.some((o) => o.temporary)) return;
  const t = world.t;
  const gone = world.obstacles.filter((o) => o.temporary && o.until <= t);
  if (!gone.length) return;
  world.obstacles = world.obstacles.filter((o) => !gone.includes(o));
  world.solids = world.solids.filter((o) => !gone.includes(o));
  /* The navigator must forget the wall too, or `moveTo` keeps walking round
     a box that is no longer there. */
  world.navDirty = true;
}

/** Щит съедает урон первым. Возвращает то, что до бойца всё-таки дошло. */
export function absorb(f, amount) {
  const st = f.status;
  if (!st || st.shield <= 0) return amount;
  const eaten = Math.min(st.shield, amount);
  st.shield -= eaten;
  return amount - eaten;
}
