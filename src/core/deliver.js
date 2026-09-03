/**
 * Девять доставок грамматики — то, чем эффект летит до цели.
 *
 * Доставка отвечает на один вопрос: ПОПАЛО ЛИ, и куда. Что происходит при
 * попадании, она не знает — это `effects.js`. Разделение не украшение:
 * четырнадцать атомов на девять доставок это 126 сочетаний, и написать их
 * как 126 веток означало бы, что пятнадцатый атом стоит девяти правок.
 *
 * Силуэт каждой доставки зафиксирован в реестре и неприкосновенен (§9.2,
 * READ KIT): луч — цилиндр, конус — клин, болт — спрайт, лоб — дуга, зона —
 * диск, рывок — лента, мигание — два кольца, self — оболочка, прыжок — дуга
 * с кругом тени под телом. VFX может
 * ДОБАВЛЯТЬ поверх, но не заменять; поэтому каждая доставка кладёт в
 * `world.fx` запись со своим `kind`, и слой эффектов рисует её по силуэту,
 * а не по вкусу.
 */

import { AIRBORNE_DODGE_MIN, ZONE_PERIOD, ZONE_TOTAL_SHARE } from './config.js';
import { GROUND_DELIVERIES } from '../skills/registry.js';

/**
 * Проходит ли эта доставка ПОД тем, кто в воздухе (D160).
 *
 * Спрашивается у реестра, а не проверяется литералом на месте. Литералов было
 * три — конус, рывок, тик зоны, — и список `GROUND_DELIVERIES`, объявленный
 * единственным источником правды, при этом не читал никто. Четыре копии
 * одного правила расходятся на первой же правке, и расходиться они начинают
 * молча: промпт обещает модели одно, симуляция делает другое.
 *
 * Высота берётся из `yTick` — снимка на начало тика (см. `step` в sim.js).
 * Прямое чтение `y` давало разные ответы конусу и зоне, потому что они
 * резолвятся по разные стороны от `moveStep`.
 */
function dodgedInAir(def, you) {
  if (!GROUND_DELIVERIES.has(def.kind)) return false;
  return (you.yTick ?? you.y) > AIRBORNE_DODGE_MIN;
}

/**
 * @param deps  примитивы симуляции, переданные явно: файл не импортирует
 *              sim.js, потому что sim.js импортирует его.
 */
export function resolveDelivery(world, id, def, act, deps) {
  const { other, dirOf, segBoxes, segCircle, dist2, clamp, hasLos, round3, applyEffect, blinkDestination, channelMul } = deps;
  const me = world.fighters[id];
  const youId = other(id);
  const you = world.fighters[youId];
  const t = round3(world.t);

  /** Разложить все атомы умения по цели. */
  const land = (hit) => {
    for (const atom of def.effects) {
      /* WORLD-атом (стена) не требует попадания: он про арену, а не про
         бойца. Остальные — только при попадании. */
      if (atom.klass === 'world' || hit) applyEffect(world, id, youId, atom, def, deps);
    }
    /*
     * ПОПАДАНИЕ ВИДНО. Раньше — нет.
     *
     * Событие `impact` клали только снаряды и зоны. Луч, конус, рывок и всё
     * остальное, что решается мгновенно, не клали ничего: попавший конус
     * выглядел ровно как промахнувшийся, и единственным способом узнать, что
     * удар прошёл, была цифра урона в ленте. Для игры, чей экран — главный
     * источник понимания происходящего, это дыра, а не мелочь.
     *
     * Событие несёт список сработавших атомов: §9.2 отдаёт удар ЭФФЕКТУ, и
     * без этого поля вьювер физически не может нарисовать разное разным.
     */
    if (hit) {
      /*
       * Удар рисуется ТАМ, КУДА ПРИШЁЛ АТОМ, и это решает класс атома, а не
       * доставка. `blink: очищение` — доставка SELF-класса, но проверять надо
       * не её: одно умение может нести и щит себе, и урон противнику, и тогда
       * ударов два, в двух разных местах. Первая версия смотрела на
       * `def.kind` и рисовала очищение кастера на теле ПРОТИВНИКА.
       */
      const mine = def.effects.filter((a) => a.klass === 'self');
      const theirs = def.effects.filter((a) => a.klass !== 'self' && a.klass !== 'world');
      const push = (who2, at, list) => {
        if (!list.length) return;
        world.fx.push({
          kind: 'impact', who: id, t, skill: def.id, element: def.element,
          x: round3(at.x), z: round3(at.z), effects: list.map((a) => a.id),
        });
      };
      push(id, me, mine);
      push(youId, you, theirs);
    }
  };

  const miss = (reason) => {
    me.stats.misses[def.id] = (me.stats.misses[def.id] || 0) + 1;
    if (reason === 'cover') me.stats.blocked[def.id] = (me.stats.blocked[def.id] || 0) + 1;
    deps.emit(world, id, { type: 'missed', skill: def.id, reason });
    world.log.push({ t, type: 'miss', who: id, skill: def.id, reason });
  };

  switch (def.kind) {
    // ── луч: цилиндр от кастера, останавливается о препятствие ───────────
    case 'beam': {
      const [ux, uz] = dirOf(me.heading);
      const ox = me.x + ux * (me.def.radius + 0.2), oz = me.z + uz * (me.def.radius + 0.2);
      const range = def.range * channelMul(me, 'range', world.t);
      const ex = ox + ux * range, ez = oz + uz * range;
      const solid = segBoxes(ox, oz, ex, ez, world.solids);
      const tSolid = solid ? solid.t : 1;
      const tHit = you.alive ? segCircle(ox, oz, ex, ez, you.x, you.z, you.def.radius + 0.4) : -1;
      const connected = tHit >= 0 && tHit < tSolid;
      const tCentre = clamp(((you.x - ox) * ux + (you.z - oz) * uz) / range, 0, 1);
      const tEnd = connected ? (tHit > 0 ? tHit : tCentre) : tSolid;
      const why = connected ? null : (solid ? 'cover' : 'aim');
      world.fx.push({ kind: 'beam', who: id, t, skill: def.id, element: def.element,
        x0: ox, z0: oz, x1: ox + ux * range * tEnd, z1: oz + uz * range * tEnd, hit: connected, miss: why });
      if (connected) land(true); else { miss(why); land(false); }
      return;
    }

    // ── конус: клин вблизи ───────────────────────────────────────────────
    case 'cone': {
      const [ux, uz] = dirOf(me.heading);
      const range = def.range * channelMul(me, 'range', world.t);
      const d = dist2(me.x, me.z, you.x, you.z);
      /*
       * D160: конус — взмах на уровне пола, и он проходит под тем, кто в
       * воздухе. Ровно то же правило, по которому эталонный осьминог
       * уклоняется от `smash` (`sim.js`, та же константа), просто теперь оно
       * записано в грамматике, а не в одной захардкоженной ветке.
       */
      const overhead = dodgedInAir(def, you);
      const inReach = you.alive && d <= range + you.def.radius;
      let inArc = false;
      if (inReach) {
        const tx = (you.x - me.x) / (d || 1), tz = (you.z - me.z) / (d || 1);
        inArc = Math.acos(clamp(tx * ux + tz * uz, -1, 1)) <= def.halfAngle;
      }
      const clear = !def.needsLos || hasLos(me.x, me.z, you.x, you.z, world.solids);
      /*
       * «Ушёл в прыжок» ставится ТОЛЬКО ТОГДА, КОГДА БЕЗ ПРЫЖКА ПОПАЛО БЫ.
       *
       * Первая версия писала эту причину по одному факту «цель в воздухе», и
       * она затирала все остальные: конус, промахнувшийся по дальности на
       * двенадцать метров, отчитывался «ушёл в прыжок», а счётчик `blocked`
       * терял попадания, закрытые укрытием. Мозг учился реагировать на
       * уклонение там, где промахнулся по дальности.
       */
      const wouldHit = inReach && inArc && clear;
      const hit = wouldHit && !overhead;
      const why = hit ? null
        : (wouldHit ? 'airborne' : (!clear ? 'cover' : (inReach ? 'aim' : 'range')));
      /* Причина промаха едет В КАДРЕ, а не только в логе: лог остаётся на
         сервере, а объяснить игроку, почему удар прошёл мимо, может только
         экран. См. `playFx` во вьювере. */
      world.fx.push({ kind: 'cone', who: id, t, skill: def.id, element: def.element,
        x: me.x, z: me.z, h: me.heading, range, halfAngle: def.halfAngle, hit, miss: why });
      if (hit) land(true); else { miss(why); land(false); }
      return;
    }

    // ── снаряд: летит время, его можно обойти ────────────────────────────
    case 'bolt':
    case 'lob': {
      /* Снаряд не разрешается мгновенно: он кладётся в мир и живёт тиками.
         Именно это делает его обходимым — а обходимость и есть разница
         между болтом и лучом, за которую с них берут одинаково. */
      const [ux, uz] = dirOf(me.heading);
      world.projectiles = world.projectiles || [];
      world.projectiles.push({
        who: id, skill: def.id, def,
        x: me.x + ux * (me.def.radius + 0.3), z: me.z + uz * (me.def.radius + 0.3),
        vx: ux * def.speed, vz: uz * def.speed,
        /* Лоб летит по дуге и не замечает препятствий; болт замечает. */
        arc: def.kind === 'lob',
        life: (def.range * channelMul(me, 'range', world.t)) / def.speed,
        t0: world.t,
      });
      world.fx.push({ kind: def.kind, who: id, t, skill: def.id, element: def.element,
        x: me.x, z: me.z, h: me.heading, range: def.range * channelMul(me, 'range', world.t), speed: def.speed });
      return;
    }

    // ── зона: диск, который работает несколько секунд ────────────────────
    case 'zone': {
      const [ux, uz] = dirOf(me.heading);
      const reach = Math.min(def.range * channelMul(me, 'range', world.t), dist2(me.x, me.z, you.x, you.z));
      const at = { x: me.x + ux * reach, z: me.z + uz * reach };
      world.zones = world.zones || [];
      world.zones.push({
        who: id, skill: def.id, def,
        /* Поделённые атомы считаются один раз при постановке, а не на каждом
           тике: тик обязан быть дешёвым, их шесть на зону и зон бывает две. */
        x: round3(at.x), z: round3(at.z), r: def.radius,
        until: world.t + def.duration, nextTick: world.t,
      });
      /* `h` — курс кастера в момент постановки зоны. Симу он не нужен (зона
         круглая), но без него вьювер не может ориентировать НИЧЕГО внутри неё,
         и «направление зоны» нечем настроить (заказ основателя). Запись
         обрастает полем, сим пишет — вьювер читает: инвариант §9 цел. */
      world.fx.push({ kind: 'zone', who: id, t, skill: def.id, element: def.element,
        x: round3(at.x), z: round3(at.z), r: def.radius, duration: def.duration, h: round3(me.heading) });
      /* WORLD-атомы (стена) срабатывают сразу; остальные — по тикам зоны. */
      for (const atom of def.effects) if (atom.klass === 'world') applyEffect(world, id, youId, atom, def, deps);
      return;
    }

    // ── рывок: кастер едет вперёд и бьёт всех по пути ────────────────────
    case 'dash': {
      const [ux, uz] = dirOf(me.heading);
      const from = { x: me.x, z: me.z };
      const want = def.distance;
      const solid = segBoxes(me.x, me.z, me.x + ux * want, me.z + uz * want, world.solids);
      const travel = solid ? Math.max(0, want * solid.t - me.def.radius) : want;
      const path = segCircle(me.x, me.z, me.x + ux * travel, me.z + uz * travel, you.x, you.z, you.def.radius + me.def.radius);
      /*
       * АТОМЫ СНАЧАЛА, ПЕРЕМЕЩЕНИЕ ПОТОМ. Порядок здесь — механика, а не стиль.
       *
       * Раньше кастер сперва оказывался в конце рывка, и только потом
       * применялись эффекты. Отброс считает направление как «от кастера к
       * цели»; после рывка СКВОЗЬ цель кастер стоит за ней, и это направление
       * разворачивается — «рывок с отбросом» ТЯНУЛ цель назад мимо кастера
       * вместо того, чтобы её снести. Умение делало противоположное тому, что
       * написано на его собственной карточке.
       *
       * Пока кастер в начале пути, «от кастера к цели» — это и есть
       * направление рывка, то есть «тебя снесло тем, что в тебя въехало».
       */
      /* D160: рывок едет по полу — тот, кто в воздухе, пропускает его над
         собой. Кастер всё равно перемещается: рывок состоялся, он просто
         никого не задел. Причина «в воздухе» — только если иначе попал бы. */
      const overhead = dodgedInAir(def, you);
      const wouldHit = path >= 0 && you.alive;
      const hit = wouldHit && !overhead;
      const why = hit ? null : (wouldHit ? 'airborne' : (solid ? 'cover' : 'aim'));
      if (hit) land(true); else { miss(why); land(false); }
      me.x += ux * travel; me.z += uz * travel;
      world.fx.push({ kind: 'dash', who: id, t, skill: def.id, element: def.element,
        x0: from.x, z0: from.z, x1: me.x, z1: me.z, hit, miss: why });
      return;
    }

    // ── мигание: перемещение с неуязвимостью ─────────────────────────────
    case 'blink': {
      const from = { x: me.x, z: me.z };
      const dest = blinkDestination(world, me, act.dx, act.dz, def.distance);
      me.x = dest.x; me.z = dest.z;
      me.iframes = Math.max(me.iframes, def.iframes);
      me.vx *= 0.3; me.vz *= 0.3;
      world.fx.push({ kind: 'blink', who: id, t, skill: def.id, element: def.element,
        x0: from.x, z0: from.z, x1: me.x, z1: me.z });
      deps.emit(world, id, { type: 'blinked', from, to: { x: round3(me.x), z: round3(me.z) }, moved: round3(dist2(from.x, from.z, me.x, me.z)) });
      world.log.push({ t, type: 'blink', who: id, dist: round3(dist2(from.x, from.z, me.x, me.z)) });
      land(true);
      return;
    }

    // ── на себя: оболочка вокруг тела ────────────────────────────────────
    case 'self': {
      world.fx.push({ kind: 'self', who: id, t, skill: def.id, element: def.element, x: me.x, z: me.z });
      land(true);
      return;
    }

    /*
     * ── прыжок: кастер уходит с земли ───────────────────────────────────
     *
     * Геометрии здесь нет и быть не может: доставка класса SELF цели не
     * касается. Вся её механика живёт в двух других местах — в скрипте фаз
     * (`phasesOfDef`, воздушная фаза) и в трёх наземных доставках, которые
     * проверяют `AIRBORNE_DODGE_MIN`. Резолвер лишь применяет собственные
     * атомы на отрыве и кладёт запись, по которой вьювер рисует дугу.
     */
    case 'jump': {
      world.fx.push({ kind: 'jump', who: id, t, skill: def.id, element: def.element,
        x: me.x, z: me.z, h: me.heading, height: me.def.jumpHeight, duration: def.airborne });
      land(true);
      return;
    }

    default:
      return;
  }
}

/**
 * Тик снарядов. Отдельно от резолвера, потому что снаряд живёт дольше
 * умения, которое его выпустило: попадание болта — это событие мира, а не
 * фаза каста.
 */
export function tickProjectiles(world, dt, deps) {
  const list = world.projectiles;
  if (!list || !list.length) return;
  const { segBoxes, dist2, round3, applyEffect, other } = deps;
  const keep = [];
  for (const p of list) {
    const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    /* Лоб перелетает препятствия — в этом весь смысл навеса. */
    const blocked = !p.arc && segBoxes(p.x, p.z, nx, nz, world.solids);
    const youId = other(p.who);
    const you = world.fighters[youId];
    const hit = you.alive && dist2(nx, nz, you.x, you.z) <= you.def.radius + 0.35;

    if (hit) {
      /*
       * SELF-атомы рисуются на КАСТЕРЕ, а не в точке попадания.
       *
       * `bolt: лечение` — это вампиризм: снаряд летит во врага, а лечится
       * тот, кто выстрелил (`applyEffect` отправляет SELF-класс к `src`).
       * Событие при этом клало ВСЕ атомы в точку попадания, и восходящие
       * искры лечения появлялись над телом жертвы. Игрок видел, что лечится
       * противник, — то есть ровно обратное происходящему.
       */
      pushImpact(world, p.who, p.def, p.skill, { x: nx, z: nz }, world.fighters[p.who], round3);
      for (const atom of p.def.effects) applyEffect(world, p.who, youId, atom, p.def, deps);
      continue;
    }
    if (blocked) {
      const me = world.fighters[p.who];
      me.stats.blocked[p.skill] = (me.stats.blocked[p.skill] || 0) + 1;
      me.stats.misses[p.skill] = (me.stats.misses[p.skill] || 0) + 1;
      world.log.push({ t: round3(world.t), type: 'miss', who: p.who, skill: p.skill, reason: 'cover' });
      world.fx.push({ kind: 'impact', who: p.who, t: round3(world.t), skill: p.skill,
        element: p.def.element, x: nx, z: nz, blocked: true, effects: atomIds(p.def) });
      continue;
    }
    p.x = nx; p.z = nz;
    p.life -= dt;
    if (p.life > 0) keep.push(p);
    else {
      const me = world.fighters[p.who];
      me.stats.misses[p.skill] = (me.stats.misses[p.skill] || 0) + 1;
      world.log.push({ t: round3(world.t), type: 'miss', who: p.who, skill: p.skill, reason: 'aim' });
    }
  }
  world.projectiles = keep;
}

/** Тик зон: раз в полсекунды по всем, кто внутри. */
/**
 * Какие атомы сработали в этом попадании.
 *
 * §9.2 говорит: доставка владеет силуэтом, элемент — палитрой, ЭФФЕКТ —
 * ударом. Первые две ноги были реализованы, третья нет: вьювер рисовал одну
 * и ту же вспышку на все четырнадцать атомов, потому что событие попадания
 * не сообщало, что именно попало. Реестр при этом уже описывает подпись
 * каждого атома словами («волна от точки удара», «скобы у ног цели»,
 * «кольцо над головой»), то есть замысел был записан и не доехал до экрана
 * ровно через это поле.
 */
/**
 * Событие попадания, разложенное по тому, КОМУ достался атом.
 *
 * SELF-класс идёт кастеру (щит, лечение, очищение, усиление — `applyEffect`
 * отправляет их к `src` независимо от доставки), остальное — цели. Одно
 * умение может нести и то и другое, и тогда ударов два, в двух местах.
 * Рисовать всё в точке попадания значит показывать лечение врага там, где
 * лечится стрелявший.
 */
function pushImpact(world, who, def, skill, at, caster, round3) {
  const t = round3(world.t);
  const mine = def.effects.filter((a) => a.klass === 'self').map((a) => a.id);
  const theirs = def.effects.filter((a) => a.klass !== 'self' && a.klass !== 'world').map((a) => a.id);
  if (theirs.length) {
    world.fx.push({ kind: 'impact', who, t, skill, element: def.element,
      x: round3(at.x), z: round3(at.z), effects: theirs });
  }
  if (mine.length && caster) {
    world.fx.push({ kind: 'impact', who, t, skill, element: def.element,
      x: round3(caster.x), z: round3(caster.z), effects: mine });
  }
}

function atomIds(def) {
  const out = [];
  for (const a of def.effects) out.push(a.id);
  return out;
}



/*
 * Деление величины зоны на число срабатываний ушло в `compileSkill`.
 * Здесь его больше нет НАРОЧНО: пока оно жило тут, `def.effects` описывали
 * одно, а происходило другое, и перцепция показывала мозгу первое. Одно
 * место — одно правило.
 */

export function tickZones(world, deps) {
  const list = world.zones;
  if (!list || !list.length) return;
  const { dist2, applyEffect, other, round3 } = deps;
  const keep = [];
  for (const z of list) {
    if (z.until <= world.t) continue;
    if (world.t >= z.nextTick) {
      z.nextTick = world.t + ZONE_PERIOD;
      const youId = other(z.who);
      const you = world.fighters[youId];
      /* D160: зона лежит НА полу. Тик по тому, кто в этот момент в воздухе,
         пропускается — но зона не гаснет и достанет его на приземлении. */
      if (you.alive && !dodgedInAir(z.def, you)
          && dist2(z.x, z.z, you.x, you.z) <= z.r + you.def.radius) {
        for (const atom of z.def.effects) {
          if (atom.klass === 'world') continue;
          applyEffect(world, z.who, youId, atom, z.def, deps);
        }
        pushImpact(world, z.who, z.def, z.skill, { x: you.x, z: you.z }, world.fighters[z.who], round3);
      }
    }
    keep.push(z);
  }
  world.zones = keep;
}
