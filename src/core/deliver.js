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

import { AIRBORNE_DODGE_MIN, ARENA_HALF, BEAM_MUZZLE, BEAM_RADIUS, BLINK_VELOCITY_KEEP, PROJECTILE_MUZZLE, PROJECTILE_TOUCH, ZONE_PERIOD, ZONE_TOTAL_SHARE } from './config.js';
import { applyAtoms } from './effects.js';
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
 * Докуда по курсу можно поставить точку, чтобы она осталась в поле.
 *
 * Границы берутся у `ARENA_HALF` (config.js) и больше нигде: судья приёмки
 * нашёл радиационный навес, лежавший три кадра подряд по ту сторону стены, и
 * лечить это числом на месте значит завести вторую копию размера арены.
 *
 * Зажимается ДАЛЬНОСТЬ, а не координаты по осям. Разница видна на первом же
 * промахе: покоординатный зажим уводит точку С ЛУЧА, и тогда `aim` в записи
 * перестаёт описывать `x1/z1` — вьювер и сим снова расходятся, ровно то, из-за
 * чего эта правка и делается. Скольжение по лучу физически честнее: навес
 * перелетает препятствия, но не край мира, и падает у стены.
 *
 * @returns {number} максимальное t ≥ 0, при котором точка ещё в квадрате
 */
/** Unit direction from a body to an aim point; the facing when they coincide. */
function aimDir(me, at, fallback) {
  const dx = at.x - me.x, dz = at.z - me.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) return fallback;
  return [dx / l, dz / l];
}

function rayLimit(x, z, ux, uz, lim) {
  let t = Infinity;
  for (const [p, u] of [[x, ux], [z, uz]]) {
    if (Math.abs(u) < 1e-9) { if (Math.abs(p) > lim) return 0; continue; }
    t = Math.min(t, ((u > 0 ? lim : -lim) - p) / u);
  }
  return Math.max(0, t === Infinity ? lim : t);
}

/**
 * Куда ляжет навес — одно число и одна точка на всех потребителей.
 *
 * ДАЛЬНОСТЬ НАЗЫВАЕТ МОЗГ. `api.use(name, a, b)` принимал два числа с самого
 * начала, но до 04.09 ими пользовалось только мигание: у всех остальных
 * доставок аргументы молча пропадали. Для навеса первый аргумент — это
 * ЗАПРОШЕННАЯ ДАЛЬНОСТЬ в метрах, и без неё умение неуправляемо: снаряд летит
 * секунду, за секунду тело проходит до 8.6 м, и попасть можно только с
 * упреждением, которого нечем задать.
 *
 * УМОЛЧАНИЕ — РАССТОЯНИЕ ДО ВРАГА, А НЕ ПРЕДЕЛ УМЕНИЯ. Это не удобство, а
 * починка: пределом навес улетал мимо всегда, и его лужа ложилась за краем
 * арены (кадр `f3-fight-acid-radiation/fight-11-t15_8.png`, 3.5 с зелени в
 * пустоте). Наивный `use('k2')` обязан ЛОЖИТЬСЯ НА ВРАГА — тогда мозг,
 * который про аргумент ещё не знает, получает разумное поведение, а тот,
 * который знает, получает рычаг.
 *
 * ГРАНИЦЫ. Снизу — `радиус тела + splash`: ближе круг поражения накрывает
 * собственное тело, и навес перестаёт быть навесом. Сверху — предел умения с
 * учётом канала «дальность», как и у всех остальных доставок. Поверх обоих —
 * край поля: он не «разумный предел», а физика, и потому идёт последним и
 * побеждает. Единственный случай, когда он опускает точку ниже нижней
 * границы, — боец, прижатый к стене и бросающий В стену: навес падает себе
 * под ноги. Это законный исход и он читается, а лужа за стеной — нет.
 */
/*
 * ── A MORTAR AIMED AT A POINT LANDS ON THE POINT ────────────────────────────
 *
 * The direction has always been read at the STRIKE (`aimDir` above, from the
 * caster's position at that instant). The DISTANCE was read at the ORDER —
 * `sim.js` stored `hypot` on the act half a second earlier — so the two halves
 * of one aim came from two different moments and the shot missed by exactly
 * how far the caster walked. Measured, point 10 m ahead, caster closing at
 * 0.6 × 5.8 m/s through the 0.5 s wind-up: the mortar landed 1.70 m PAST the
 * point, 1.70 m short when kiting, 0.48 m off when strafing. Splash is 1.8 m,
 * so a correctly led shot became a miss precisely when the caster was moving —
 * which is every moment a mind bothers to lead.
 *
 * Both halves are now read here, at the strike, exactly as the field does
 * (`case 'zone'`). The single-number form (`api.use(name, metres)`) is
 * unchanged: it names a distance and not a place, so there is nothing to
 * re-read.
 */
function lobLanding(me, you, def, act, reach, ux, uz, deps) {
  const { dist2 } = deps;
  const want = (act && act.at)
    ? dist2(me.x, me.z, act.at.x, act.at.z)
    : ((act && act.reach !== null && act.reach !== undefined)
      ? act.reach
      : dist2(me.x, me.z, you.x, you.z));
  const near = me.def.radius + def.splash;
  let d = Math.min(reach, Math.max(near, want));
  d = Math.min(d, rayLimit(me.x, me.z, ux, uz, ARENA_HALF - def.splash));
  return { d, x: me.x + ux * d, z: me.z + uz * d };
}

/**
 * The solids a caster's OWN beam and bolt see: everything except the wall it
 * built itself.
 *
 * ── WHY A WALL IS COVER YOU CAN SHOOT FROM ──────────────────────────────────
 *
 * A wall grows 3.2 m ahead of the caster, along its facing — that is, directly
 * between the caster and whatever it was pointing at. So the piece a mind buys
 * to protect itself blocked its own beam and swallowed its own bolt, and the
 * only way to use it was to build it and then walk around it. The panel
 * measured what that is worth: −4.2 win-rate points at a cost of 1, the price
 * floor, in four passes running. A piece that cannot be priced any lower and is
 * still a loss is re-SCALED, not re-priced (`docs/COMBAT.md` §5), and the scale
 * a wall has is who it stops.
 *
 * It stops the ENEMY's shots exactly as before, and it is solid to BOTH bodies
 * and to both navigators — a wall you can walk through is not cover, it is a
 * decal. Only the two shapes that trace a line from the caster's own muzzle
 * ignore it, and only their owner's.
 */
function shotSolids(world, id) {
  if (!world.obstacles.some((o) => o.temporary && o.by === id)) return world.solids;
  return world.solids.filter((o) => !(o.temporary && o.by === id));
}

/**
 * @param deps  примитивы симуляции, переданные явно: файл не импортирует
 *              sim.js, потому что sim.js импортирует его.
 */
export function resolveDelivery(world, id, def, act, deps) {
  const { other, dirOf, segBoxes, segCircle, dist2, clamp, hasLos, round3, blinkDestination, channelMul } = deps;
  const me = world.fighters[id];
  const youId = other(id);
  const you = world.fighters[youId];
  const t = round3(world.t);

  /** Разложить все атомы умения по цели. */
  const land = (hit) => {
    /* WORLD-атом (стена) не требует попадания: он про арену, а не про бойца.
       Остальные — только при попадании. `applyAtoms` заодно объявляет кастеру
       попадание, которое не несёт урона (см. effects.js). */
    applyAtoms(world, id, youId, def.effects, def, deps,
      hit ? {} : { skip: (a) => a.klass !== 'world' });
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
      /* Named, not typed: `BEAM_MUZZLE` and `BEAM_RADIUS` live in config.js and
         the prompt quotes them from there. Two literals here and two numbers in
         the prompt is how the grammar beam and the fixture laser drift apart. */
      const ox = me.x + ux * (me.def.radius + BEAM_MUZZLE), oz = me.z + uz * (me.def.radius + BEAM_MUZZLE);
      const range = def.range * channelMul(me, 'range', world.t);
      const ex = ox + ux * range, ez = oz + uz * range;
      /* Its own wall is not in the way of its own beam — see `shotSolids`. */
      const solid = segBoxes(ox, oz, ex, ez, shotSolids(world, id));
      const tSolid = solid ? solid.t : 1;
      const tHit = you.alive ? segCircle(ox, oz, ex, ez, you.x, you.z, you.def.radius + BEAM_RADIUS) : -1;
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
      /*
       * A mortar ordered AT A POINT flies toward the point, whatever the body
       * is facing at the strike: the mind named a place, and a place is not an
       * angle the turn rate has to catch up with. A bolt keeps the facing —
       * it is a shot, and the turn IS the aim.
       */
      const [ux, uz] = (def.kind === 'lob' && act && act.at)
        ? aimDir(me, act.at, dirOf(me.heading))
        : dirOf(me.heading);
      world.projectiles = world.projectiles || [];
      const arc = def.kind === 'lob';
      /* Предел умения с учётом канала «дальность» — потолок обоим. */
      const reach = def.range * channelMul(me, 'range', world.t);
      /* Точка вылета: снаряд рождается ПЕРЕД телом, а не в его центре. */
      const muzzle = me.def.radius + PROJECTILE_MUZZLE;
      /*
       * ТОЧКА ПРИЗЕМЛЕНИЯ НАВЕСА СЧИТАЕТСЯ ЗДЕСЬ И ОДИН РАЗ.
       *
       * Заказ основателя 04.09, двумя предложениями: «не должна попадать,
       * если пролетает над существом… попадает только туда, куда попала» и
       * «существо может контролировать рейндж, и должно это делать, чтобы
       * попадать». Обе половины упираются в одно число — расстояние до точки
       * падения, — и считать его дважды (сим отдельно, вьювер отдельно)
       * нельзя: именно так лужа кислоты и уехала за край арены.
       *
       * Поэтому точка вычисляется в одном месте и разъезжается по трём
       * потребителям как ОДНО значение: в снаряд (`spot`, по нему считает
       * приземление `tickProjectiles`), в запись `world.fx` (`aim`, `x1/z1`
       * — по ним вьювер кладёт лужу) и в срок жизни снаряда.
       */
      const spot = arc ? lobLanding(me, you, def, act, reach, ux, uz, deps) : null;
      world.projectiles.push({
        who: id, skill: def.id, def,
        x: me.x + ux * muzzle, z: me.z + uz * muzzle,
        vx: ux * def.speed, vz: uz * def.speed,
        /* Лоб летит по дуге и не замечает препятствий; болт замечает. */
        arc,
        /* Болт живёт до предела умения — он ищет цель всей своей дорогой.
           Навес живёт ровно до СВОЕЙ точки: дороги у него нет, есть падение.
           Отсчёт от дула, потому что оттуда снаряд и стартует; без вычета
           `muzzle` навес перелетал бы собственную метку на 1.8 м. */
        life: arc ? Math.max(0, (spot.d - muzzle) / def.speed) : reach / def.speed,
        ...(arc ? { spot, splash: def.splash } : {}),
        t0: world.t,
      });
      /*
       * `aim` — КУДА СНАРЯД НА САМОМ ДЕЛЕ ЛЕТИТ, а `range` — докуда он может.
       *
       * В записи стояла только предельная дальность умения, и вьювер честно
       * вёл снаряд до неё: у кислоты (дальность 18 м при бойцах в девяти)
       * лужа ложилась ЗА КРАЙ АРЕНЫ и висела там 3.5 с — 1 373 зелёных
       * пикселя в пустоте на `f3-fight-acid-radiation/fight-11-t15_8.png`.
       * Нашёл агент кислоты, разобрав кадр по времени; он же подрезал
       * дальность у себя через `ctx.bodyShape`, то есть ДОГАДКОЙ вьювера о
       * том, что знает сим. Догадка врёт, если боец промахнулся или сменил
       * цель между кастом и кадром.
       *
       * Правильное место — запись, и рядом уже есть образец: зона строкой
       * ниже берёт `min(range, dist(me, you))`. Здесь то же самое, но вторым
       * полем: `range` остаётся пределом (снаряд, который промахнулся,
       * действительно летит дальше), а `aim` говорит, где цель. Дефект был
       * общий для всех девяти стихий с болтом и навесом.
       *
       * У НАВЕСА `aim` БОЛЬШЕ НЕ ДОГАДКА, А ЗАМЕР. Для болта это по-прежнему
       * «где стоит цель» — снаряд может её и не застать. Для навеса это
       * ровно то расстояние, на котором сим применит эффекты, плюс сама
       * точка `x1/z1` и круг `splash`, чтобы вьюверу нечего было
       * реконструировать по курсу и дальности.
       */
      world.fx.push({ kind: def.kind, who: id, t, skill: def.id, element: def.element,
        x: me.x, z: me.z, h: me.heading, range: reach, speed: def.speed,
        aim: arc ? round3(spot.d) : round3(Math.min(reach, dist2(me.x, me.z, you.x, you.z))),
        ...(arc ? { x1: round3(spot.x), z1: round3(spot.z), splash: def.splash } : {}) });
      return;
    }

    // ── зона: диск, который работает несколько секунд ────────────────────
    case 'zone': {
      /*
       * A field ordered AT A POINT lands on the point, clamped to its range;
       * without one it lands along the facing at the enemy's distance, as it
       * always did. The point is what makes a field a placed trap rather than
       * a shot: a mind can put it where the enemy is GOING, or across the gap
       * it wants to close, and neither of those is "along my facing".
       */
      const aimed = act && act.at;
      const limit = def.range * channelMul(me, 'range', world.t);
      const [ux, uz] = aimed ? aimDir(me, act.at, dirOf(me.heading)) : dirOf(me.heading);
      const reach = Math.min(limit, aimed
        ? dist2(me.x, me.z, act.at.x, act.at.z)
        : dist2(me.x, me.z, you.x, you.z));
      const at = { x: me.x + ux * reach, z: me.z + uz * reach };
      world.zones = world.zones || [];
      /*
       * ONE FIELD PER ABILITY PER CASTER. At a three-second cooldown a field
       * that lasts as long as its cooldown would never leave the floor, and
       * two of them would tile the arena; the new cast replaces the old one,
       * so a field is a thing the mind PLACES and re-places, not a thing it
       * accumulates. The viewer's copy of the old disc fades on its own clock.
       */
      world.zones = world.zones.filter((z) => !(z.who === id && z.skill === def.id));
      world.zones.push({
        who: id, skill: def.id, def,
        /* Поделённые атомы считаются один раз при постановке, а не на каждом
           тике: тик обязан быть дешёвым, их шесть на зону и зон бывает две. */
        x: round3(at.x), z: round3(at.z), r: def.radius,
        until: world.t + def.duration, nextTick: world.t,
        /* Whose controls this CAST has already spent — see `tickZones`. */
        controlled: null,
      });
      /* `h` — курс кастера в момент постановки зоны. Симу он не нужен (зона
         круглая), но без него вьювер не может ориентировать НИЧЕГО внутри неё,
         и «направление зоны» нечем настроить (заказ основателя). Запись
         обрастает полем, сим пишет — вьювер читает: инвариант §9 цел. */
      /*
       * И СПИСОК АТОМОВ. Тем же приёмом и по той же причине, что `h` выше:
       * симу он не нужен, а вьювер без него не может отличить зону, которая
       * ТЯНЕТ, от зоны, которая жжёт, — и потому не имеет права рисовать
       * притяжение ни в одной (нашёл агент гравитации 04.09: «рисовать линии,
       * сходящиеся к кастеру, значило бы врать в половине случаев»). У удара
       * этот список есть с самого начала (`pushImpact`), и подписи атомов
       * стоят именно на нём; зона была единственной живущей формой без него.
       * Поле — только идентификаторы, никаких величин: величины остаются
       * симу, вьюверу нужно ЗНАТЬ ЧТО, а не СКОЛЬКО.
       */
      world.fx.push({ kind: 'zone', who: id, t, skill: def.id, element: def.element,
        x: round3(at.x), z: round3(at.z), r: def.radius, duration: def.duration, h: round3(me.heading),
        effects: def.effects.map((a) => a.id) });
      /* WORLD-атомы (стена) срабатывают сразу; остальные — по тикам зоны. */
      applyAtoms(world, id, youId, def.effects, def, deps, { skip: (a) => a.klass !== 'world' });
      return;
    }

    // ── рывок: кастер едет вперёд и бьёт всех по пути ────────────────────
    /*
     * THE LUNGE IS TRAVEL NOW, and it does not resolve here. Its phases are
     * wind-up → dash → recover (`phasesOfDef` in sim.js): the heading locks at
     * the end of the wind-up, `dashStepGeneric` moves the body `dashSpeed`
     * metres a second and tests contact every tick, a solid stops it, a body
     * in the air is passed under, and the atoms land on contact or the WORLD
     * ones at the end. The old branch moved the body 8 m on one tick — a hit
     * nothing could dodge and nobody could see. Kept as a case so an unknown
     * caller still gets a defined answer: nothing happens.
     */
    case 'dash':
      return;

    // ── мигание: перемещение с неуязвимостью ─────────────────────────────
    case 'blink': {
      const from = { x: me.x, z: me.z };
      /* A blink ordered at a point goes toward it and stops there when the
         point is nearer than the full distance — a step, not a lunge past. */
      const want = (act && act.at)
        ? Math.min(def.distance, dist2(me.x, me.z, act.at.x, act.at.z))
        : def.distance;
      const dest = blinkDestination(world, me, act.dx, act.dz, want);
      me.x = dest.x; me.z = dest.z;
      me.iframes = Math.max(me.iframes, def.iframes);
      me.vx *= BLINK_VELOCITY_KEEP; me.vz *= BLINK_VELOCITY_KEEP;
      world.fx.push({ kind: 'blink', who: id, t, skill: def.id, element: def.element,
        x0: from.x, z0: from.z, x1: me.x, z1: me.z });
      deps.emit(world, id, { type: 'blinked', from, to: { x: round3(me.x), z: round3(me.z) }, moved: round3(dist2(from.x, from.z, me.x, me.z)) });
      world.log.push({ t, type: 'blink', who: id, dist: round3(dist2(from.x, from.z, me.x, me.z)) });
      land(true);
      return;
    }

    // ── на себя: оболочка вокруг тела ────────────────────────────────────
    case 'self': {
      /*
       * СПИСОК АТОМОВ ЕДЕТ С ЗАПИСЬЮ — как у зоны и у удара. Без него
       * оболочка щита и вспышка лечения приходят во вьювер ОДИНАКОВЫМИ
       * записями, хотя живут разное: щит по реестру держится 2.5 с (`EFFECTS
       * .shield.duration`; в комментарии стояло 5 с — число из мира до 07.09,
       * где щит переживал собственный кулдаун), очищение — событие на
       * полсекунды. Проверяется
       * это просто: «ice.js:1593» уже читает `e.effects` у `self`, чтобы
       * отличить свою оболочку от чужой, и до сих пор эта ветка не
       * срабатывала НИ РАЗУ в настоящем бою — поля в записи не было.
       */
      world.fx.push({ kind: 'self', who: id, t, skill: def.id, element: def.element, x: me.x, z: me.z, effects: def.effects.map((a) => a.id) });
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
  const { segBoxes, dist2, round3, other } = deps;
  /*
   * A WALL IS BUILT WHETHER OR NOT THE SHOT CONNECTED.
   *
   * The prompt says so in one sentence for the whole grammar — "it is built
   * even when the delivery carrying it misses" — and it was true of the beam,
   * the fan, the lunge and the field and false of the two shapes that fly. A
   * bolt stopped by cover, a bolt that ran out of range and a mortar that
   * landed on empty floor all applied NOTHING, so `bolt:damage+wall` was a
   * wall the mind only got when it did not need one. WORLD atoms are about the
   * arena, not about the body, and every miss branch below now says so.
   */
  const worldOnly = { skip: (a) => a.klass !== 'world' };
  const keep = [];
  for (const p of list) {
    const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    const youId = other(p.who);
    const you = world.fighters[youId];

    /*
     * ── НАВЕС: НИКОГО В ПОЛЁТЕ, ВСЕХ В ТОЧКЕ ПАДЕНИЯ ────────────────────
     *
     * Заказ основателя 04.09: «лобная атака… не должна попадать, если
     * пролетает НАД существом. То есть попадает только туда, куда попала».
     *
     * До правки навес шёл этой же дорогой, что и болт, и проверялся тем же
     * тестом близости (`radius + 0.35`) на каждом тике полёта. Получалось
     * ровно наоборот заказу: попадал там, где не должен (по дороге, пролетая
     * над целью), и не попадал там, где должен (долетев до конца жизни, он
     * шёл в промах и не применял НИЧЕГО). Замер до правки: три боя
     * ГРОЗА × ПЕПЕЛ, 14 навесов — 11 попаданий сквозных, 0 по приземлению.
     * И это противоречило собственной строке реестра «приземляется с
     * задержкой»: задержка была, приземления не было.
     *
     * Здесь полёт не проверяет ничего вообще — ни тела, ни солиды (второе
     * и раньше было так: перелетать препятствия и есть смысл навеса). Вся
     * механика в одной строке ниже: круг `splash` вокруг точки `spot`,
     * посчитанной при касте, плюс радиус тела цели — так же, как считает
     * зона (`tickZones`), и по той же причине: цель — не точка, а диск.
     *
     * Точка берётся ИЗ СНАРЯДА, а не из проинтегрированной позиции: за
     * ~38 тиков полёта `p.x += vx*dt` набирает свою ошибку, и лужа во
     * вьювере (он читает `x1/z1` из записи) разошлась бы с тем, по чему
     * считает сим. Разойтись им нельзя — это тот самый дефект, из-за
     * которого правка и начата.
     */
    if (p.arc) {
      p.x = nx; p.z = nz;
      p.life -= dt;
      if (p.life > 0) { keep.push(p); continue; }
      const me = world.fighters[p.who];
      const at = p.spot;
      if (you.alive && dist2(at.x, at.z, you.x, you.z) <= p.splash + you.def.radius) {
        pushImpact(world, p.who, p.def, p.skill, at, me, round3);
        applyAtoms(world, p.who, youId, p.def.effects, p.def, deps);
      } else {
        /* Промах остаётся промахом, со всей статистикой: пустая точка — это
           ошибка ПРИЦЕЛА, `aim`, ровно как и раньше на исходе жизни. */
        me.stats.misses[p.skill] = (me.stats.misses[p.skill] || 0) + 1;
        world.log.push({ t: round3(world.t), type: 'miss', who: p.who, skill: p.skill, reason: 'aim' });
        /*
         * И СОБЫТИЕ МОЗГУ — у навеса, в отличие от болта, оно единственная
         * обратная связь. Болт промахивается геометрией, которую мозг видит
         * сам: снаряд лежит в `p.arena.projectiles` и проходит мимо цели на
         * глазах. Навес промахивается ЧИСЛОМ, которое мозг сам и назвал
         * (`api.use(name, дальность)`), и результат приходит через секунду
         * после каста. Без события связать своё решение с исходом нечем —
         * а `startSkill` уже записал дословно, чем это кончается: модель
         * жмёт ту же кнопку до конца боя.
         */
        deps.emit(world, p.who, { type: 'missed', skill: p.skill, reason: 'aim' });
        /* An empty circle is still a cast: the wall it carried rises. */
        applyAtoms(world, p.who, youId, p.def.effects, p.def, deps, worldOnly);
      }
      continue;
    }

    /* A bolt passes through the wall its own caster built (`shotSolids`). */
    const blocked = segBoxes(p.x, p.z, nx, nz, shotSolids(world, p.who));
    const hit = you.alive && dist2(nx, nz, you.x, you.z) <= you.def.radius + PROJECTILE_TOUCH;

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
      applyAtoms(world, p.who, youId, p.def.effects, p.def, deps);
      continue;
    }
    if (blocked) {
      const me = world.fighters[p.who];
      me.stats.blocked[p.skill] = (me.stats.blocked[p.skill] || 0) + 1;
      me.stats.misses[p.skill] = (me.stats.misses[p.skill] || 0) + 1;
      world.log.push({ t: round3(world.t), type: 'miss', who: p.who, skill: p.skill, reason: 'cover' });
      world.fx.push({ kind: 'impact', who: p.who, t: round3(world.t), skill: p.skill,
        element: p.def.element, x: nx, z: nz, blocked: true, effects: atomIds(p.def) });
      applyAtoms(world, p.who, youId, p.def.effects, p.def, deps, worldOnly);
      continue;
    }
    p.x = nx; p.z = nz;
    p.life -= dt;
    if (p.life > 0) keep.push(p);
    else {
      const me = world.fighters[p.who];
      me.stats.misses[p.skill] = (me.stats.misses[p.skill] || 0) + 1;
      world.log.push({ t: round3(world.t), type: 'miss', who: p.who, skill: p.skill, reason: 'aim' });
      applyAtoms(world, p.who, youId, p.def.effects, p.def, deps, worldOnly);
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

/*
 * ── A FIELD'S CONTROL LANDS ONCE PER CAST, PER BODY ─────────────────────────
 *
 * A disc ticks five times. Applying its control on every one of them was, in
 * practice, applying it on the FIRST and then being refused four times by the
 * immunity that first tick had armed — each refusal writing an `immune` line
 * and sending the caster a `missed` event. Measured: one `zone:stun` cast on a
 * standing body produced four refusals; across the bake-off 17.4 of the 19.7
 * refusals a game were a disc refusing itself, so the league's headline
 * "immune per game" number was 88% an artefact of this loop, and a mind reading
 * its events was told its field was failing while the field was working.
 *
 * The rule is now what it always read like on the card: the control lands the
 * first time a body touches the disc, at the registry's WHOLE duration
 * (compile.js no longer divides control durations by the tick share), and the
 * later ticks of that same cast do not try again. They do not log, they do not
 * emit, and they do not push an fx: nothing was refused, because nothing was
 * attempted. Damage and burn keep ticking every half-second — that is what
 * their per-tick share is priced on — so a body standing in a field of
 * `damage + root` is rooted once and burned five times, which is the sentence
 * the ability was sold with.
 *
 * A DIFFERENT cast is a different decision and stays loud: re-placing the
 * field inside the window still writes `immune`, because that IS a mind
 * pressing a button that cannot work yet.
 *
 * `z.controlled` is the set of bodies this cast has already controlled. Per
 * ZONE, not per caster: replacing a field creates a new object (one field per
 * ability per caster), so a re-cast legitimately tries again.
 */
export function tickZones(world, deps) {
  const list = world.zones;
  if (!list || !list.length) return;
  const { dist2, other, round3 } = deps;
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
        const spent = z.controlled && z.controlled.has(youId);
        applyAtoms(world, z.who, youId, z.def.effects, z.def, deps, {
          skip: (a) => a.klass === 'world' || (spent && !!a.immune),
        });
        if (!spent && z.def.effects.some((a) => a.immune)) {
          if (!z.controlled) z.controlled = new Set();
          z.controlled.add(youId);
        }
        pushImpact(world, z.who, z.def, z.skill, { x: you.x, z: you.z }, world.fighters[z.who], round3);
      }
    }
    keep.push(z);
  }
  world.zones = keep;
}
