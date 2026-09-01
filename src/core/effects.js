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

/** Сколько тиков задержки даёт ослепление. §8 называет это число. */
export const BLIND_LAG_TICKS = 30;

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

  switch (atom.id) {
    case 'damage':
      damage(world, srcId, dstId, atom.mag, def.id);
      return;

    case 'burn': {
      /* Горение не складывается, а обновляется: два поджога подряд от одного
         умения — это один пожар, а не двойной урон в секунду. */
      const fresh = !st.burn || st.burn.until <= t;
      st.burn = {
        dps: Math.max(st.burn?.dps ?? 0, atom.mag),
        until: Math.max(st.burn?.until ?? 0, t + atom.duration),
        /* КТО поджёг. Поле читалось при смерти от горения (`burnedOut.by`) и
           не записывалось никогда, так что в логе всегда стояло null; а урон
           горения не попадал в счёт поджигателя вовсе. Игрок при этом видит
           на экране итога строку «урон» — и она была тем меньше, чем больше
           существо жгло. Уверенная неверная цифра хуже отсутствующей. */
        by: srcId,
        by: srcId,
      };
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'burn', element: def.element });
      /* В лог — только начало пожара, не его продление. */
      if (fresh) log.push({ t: round3(t), type: 'ignite', who: srcId, target: to.id, skill: def.id });
      return;
    }

    case 'knock': {
      const dx = to.x - src.x, dz = to.z - src.z;
      const l = Math.hypot(dx, dz) || 1;
      to.vx += (dx / l) * atom.mag * 4;
      to.vz += (dz / l) * atom.mag * 4;
      return;
    }

    case 'pull': {
      const dx = src.x - to.x, dz = src.z - to.z;
      const l = Math.hypot(dx, dz) || 1;
      to.vx += (dx / l) * atom.mag * 4;
      to.vz += (dz / l) * atom.mag * 4;
      return;
    }

    case 'stun':
      /* Оглушение не продлевает уже идущее: цепочка оглушений — это бой,
         в котором один из двоих не играет, и смотреть его нечего. */
      to.stun = Math.max(to.stun, atom.duration);
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'stun', element: def.element });
      return;

    case 'root':
      st.root = Math.max(st.root, t + atom.duration);
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'root', element: def.element });
      return;

    case 'shield':
      st.shield = Math.max(st.shield, atom.mag);
      st.shieldUntil = Math.max(st.shieldUntil, t + atom.duration);
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'shield', element: def.element });
      return;

    case 'heal': {
      const before = to.hp;
      to.hp = Math.min(to.def.hp, to.hp + atom.mag);
      if (to.hp > before) {
        log.push({ t: round3(t), type: 'heal', who: to.id, amount: round3(to.hp - before) });
        fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'heal', element: def.element });
      }
      return;
    }

    case 'cleanse':
      st.burn = null; st.root = 0; st.blind = 0; st.silence = 0;
      st.weaken = {};
      to.stun = 0;
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'cleanse', element: def.element });
      return;

    case 'blind':
      /* Портится ОБЪЕКТ ПЕРЦЕПЦИИ, а не прицел: цель продолжает видеть, но
         видит прошлое. И знает об этом — `self.blinded` в перцепции. */
      st.blind = Math.max(st.blind, t + atom.duration);
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'blind', element: def.element });
      return;

    case 'silence':
      st.silence = Math.max(st.silence, t + atom.duration);
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'silence', element: def.element });
      return;

    case 'wall': {
      /* Временный солид в мире. Ставится ПЕРЕД кастером, а не в точке
         попадания: стена, выросшая под ногами противника, выталкивает его
         сквозь геометрию, и это видно. */
      const [ux, uz] = [Math.sin(src.heading), Math.cos(src.heading)];
      const at = { x: src.x + ux * 3.2, z: src.z + uz * 3.2 };
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
        h: 2.2, temporary: true, until: t + atom.duration, by: srcId,
      };
      world.obstacles.push(box);
      world.solids.push(box);
      log.push({ t: round3(t), type: 'wall', who: srcId, x: box.x, z: box.z });
      /* Длительность едет с событием: она зависит от числа эффектов в умении
         (доля делит и её), а вьювер рисовал стену ровно пять секунд всегда —
         то есть показывал стену, которой уже нет, или убирал ту, что стоит. */
      fx.push({ kind: 'wall', who: srcId, t: round3(t), x: box.x, z: box.z,
        w: fullW, d: fullD, duration: round3(atom.duration), element: def.element });
      return;
    }

    case 'boost':
      st.boost[atom.channel] = { mul: atom.mag, until: t + atom.duration };
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'boost', channel: atom.channel, element: def.element });
      return;

    case 'weaken':
      st.weaken[atom.channel] = { mul: atom.mag, until: t + atom.duration };
      fx.push({ kind: 'status', who: to.id, t: round3(t), effect: 'weaken', channel: atom.channel, element: def.element });
      return;

    default:
      return;
  }
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
      if (Math.floor(before / 10) !== Math.floor(f.hp / 10)) {
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
}

/** Щит съедает урон первым. Возвращает то, что до бойца всё-таки дошло. */
export function absorb(f, amount) {
  const st = f.status;
  if (!st || st.shield <= 0) return amount;
  const eaten = Math.min(st.shield, amount);
  st.shield -= eaten;
  return amount - eaten;
}
