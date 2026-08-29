/**
 * Восемь доставок грамматики — то, чем эффект летит до цели.
 *
 * Доставка отвечает на один вопрос: ПОПАЛО ЛИ, и куда. Что происходит при
 * попадании, она не знает — это `effects.js`. Разделение не украшение:
 * четырнадцать атомов на восемь доставок это 112 сочетаний, и написать их
 * как 112 веток означало бы, что пятнадцатый атом стоит восьми правок.
 *
 * Силуэт каждой доставки зафиксирован в реестре и неприкосновенен (§9.2,
 * READ KIT): луч — цилиндр, конус — клин, болт — спрайт, лоб — дуга, зона —
 * диск, рывок — лента, мигание — два кольца, self — оболочка. VFX может
 * ДОБАВЛЯТЬ поверх, но не заменять; поэтому каждая доставка кладёт в
 * `world.fx` запись со своим `kind`, и слой эффектов рисует её по силуэту,
 * а не по вкусу.
 */

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
      world.fx.push({ kind: 'beam', who: id, t, skill: def.id, element: def.element,
        x0: ox, z0: oz, x1: ox + ux * range * tEnd, z1: oz + uz * range * tEnd, hit: connected });
      if (connected) land(true); else { miss(solid ? 'cover' : 'aim'); land(false); }
      return;
    }

    // ── конус: клин вблизи ───────────────────────────────────────────────
    case 'cone': {
      const [ux, uz] = dirOf(me.heading);
      const range = def.range * channelMul(me, 'range', world.t);
      const d = dist2(me.x, me.z, you.x, you.z);
      const inReach = you.alive && d <= range + you.def.radius;
      let inArc = false;
      if (inReach) {
        const tx = (you.x - me.x) / (d || 1), tz = (you.z - me.z) / (d || 1);
        inArc = Math.acos(clamp(tx * ux + tz * uz, -1, 1)) <= def.halfAngle;
      }
      const clear = !def.needsLos || hasLos(me.x, me.z, you.x, you.z, world.solids);
      world.fx.push({ kind: 'cone', who: id, t, skill: def.id, element: def.element,
        x: me.x, z: me.z, h: me.heading, range, halfAngle: def.halfAngle, hit: inReach && inArc && clear });
      if (inReach && inArc && clear) land(true);
      else { miss(!clear ? 'cover' : (inReach ? 'aim' : 'range')); land(false); }
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
        x: round3(at.x), z: round3(at.z), r: def.radius,
        until: world.t + def.duration, nextTick: world.t,
      });
      world.fx.push({ kind: 'zone', who: id, t, skill: def.id, element: def.element,
        x: round3(at.x), z: round3(at.z), r: def.radius, duration: def.duration });
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
      me.x += ux * travel; me.z += uz * travel;
      world.fx.push({ kind: 'dash', who: id, t, skill: def.id, element: def.element,
        x0: from.x, z0: from.z, x1: me.x, z1: me.z, hit: path >= 0 });
      if (path >= 0 && you.alive) land(true); else { miss(solid ? 'cover' : 'aim'); land(false); }
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
      world.fx.push({ kind: 'impact', who: p.who, t: round3(world.t), skill: p.skill, element: p.def.element, x: nx, z: nz });
      for (const atom of p.def.effects) applyEffect(world, p.who, youId, atom, p.def, deps);
      continue;
    }
    if (blocked) {
      const me = world.fighters[p.who];
      me.stats.blocked[p.skill] = (me.stats.blocked[p.skill] || 0) + 1;
      me.stats.misses[p.skill] = (me.stats.misses[p.skill] || 0) + 1;
      world.log.push({ t: round3(world.t), type: 'miss', who: p.who, skill: p.skill, reason: 'cover' });
      world.fx.push({ kind: 'impact', who: p.who, t: round3(world.t), skill: p.skill, element: p.def.element, x: nx, z: nz, blocked: true });
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
export const ZONE_PERIOD = 0.5;

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
      if (you.alive && dist2(z.x, z.z, you.x, you.z) <= z.r + you.def.radius) {
        for (const atom of z.def.effects) {
          if (atom.klass === 'world') continue;
          applyEffect(world, z.who, youId, atom, z.def, deps);
        }
        world.fx.push({ kind: 'impact', who: z.who, t: round3(world.t), skill: z.skill, element: z.def.element, x: you.x, z: you.z });
      }
    }
    keep.push(z);
  }
  world.zones = keep;
}
