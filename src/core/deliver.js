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

import { AIRBORNE_DODGE_MIN, ARENA_HALF, ZONE_PERIOD, ZONE_TOTAL_SHARE } from './config.js';
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
function lobLanding(me, you, def, act, reach, ux, uz, deps) {
  const { dist2 } = deps;
  const want = (act && act.reach !== null && act.reach !== undefined)
    ? act.reach
    : dist2(me.x, me.z, you.x, you.z);
  const near = me.def.radius + def.splash;
  let d = Math.min(reach, Math.max(near, want));
  d = Math.min(d, rayLimit(me.x, me.z, ux, uz, ARENA_HALF - def.splash));
  return { d, x: me.x + ux * d, z: me.z + uz * d };
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
      const arc = def.kind === 'lob';
      /* Предел умения с учётом канала «дальность» — потолок обоим. */
      const reach = def.range * channelMul(me, 'range', world.t);
      /* Точка вылета: снаряд рождается ПЕРЕД телом, а не в его центре. */
      const muzzle = me.def.radius + 0.3;
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
      /*
       * СПИСОК АТОМОВ ЕДЕТ С ЗАПИСЬЮ — как у зоны и у удара. Без него
       * оболочка щита и вспышка лечения приходят во вьювер ОДИНАКОВЫМИ
       * записями, хотя живут разное: щит по реестру держится 5 с
       * (`registry.js:332`), очищение — событие на полсекунды. Проверяется
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
  const { segBoxes, dist2, round3, applyEffect, other } = deps;
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
        for (const atom of p.def.effects) applyEffect(world, p.who, youId, atom, p.def, deps);
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
      }
      continue;
    }

    const blocked = segBoxes(p.x, p.z, nx, nz, world.solids);
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
