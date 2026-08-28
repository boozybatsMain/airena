function think(p, api) {
  const me = p && p.self;
  const e = p && p.enemy;
  if (!me || !e || !me.alive) return;

  const dt = p.dt || 0.066;
  const d = typeof e.dist === "number" ? e.dist : Math.hypot(e.x - me.x, e.z - me.z);

  // --- track enemy laser timing
  if (p.events) {
    for (const ev of p.events) {
      if (ev.type === "enemyStarted" && ev.skill === "laser") lastLaser = p.t;
      if (ev.type === "blocked") lastBlock = p.t;
      if (ev.type === "damaged") lastHurt = p.t;
    }
  }

  const enemyCast = e.casting || null;
  const laserNow = !!(enemyCast && enemyCast.skill === "laser" && enemyCast.telegraph);
  const laserSoon = laserNow || (p.t - lastLaser < 0.55);

  // predicted enemy point (smash lands 0.28s later)
  const pex = e.x + (e.vx || 0) * 0.30;
  const pez = e.z + (e.vz || 0) * 0.30;
  const pd = Math.hypot(pex - me.x, pez - me.z);

  // ---------- FACING ----------
  if (me.casting && me.casting.skill === "charge" && me.casting.phase === "windup") {
    const a = leadPoint(me, e);
    api.faceAt(a.x, a.z);
  } else {
    api.faceAt(pex, pez);
  }

  // ---------- SKILLS ----------
  let used = false;
  if (!me.busy && !me.airborne && !me.stunned) {
    const smashReady = api.ready("smash");
    const chargeReady = api.ready("charge");

    // SMASH: enemy in or entering the cone reach
    if (smashReady && !e.airborne && (d < 3.6 || pd < 3.5)) {
      api.use("smash");
      used = true;
    }

    // CHARGE: gap closer / laser interrupter
    if (!used && chargeReady && e.visible && d > 2.2 && d < 11.5) {
      const a = leadPoint(me, e);
      api.faceAt(a.x, a.z);
      api.use("charge");
      used = true;
    }
  }

  // ---------- MOVEMENT ----------
  if (me.casting && me.casting.skill === "charge" && me.casting.phase === "windup") {
    const a = leadPoint(me, e);
    api.move(a.x - me.x, a.z - me.z);
    return;
  }
  if (me.airborne || me.stunned) return;

  const myFrac = me.hp / (me.maxHp || 220);
  const eFrac = e.hp / (e.maxHp || 140);
  const stall = p.t > 47 && myFrac > eFrac + 0.08 && d > 4;

  if (stall) {
    // Ahead on the burn clock: break line of sight and run the timer out.
    const spot = coverSpot(p, api, me, e);
    if (spot) api.moveTo(spot.x, spot.z);
    else api.move(me.x - e.x, me.z - e.z);
  } else if (d < 4.2) {
    // In my range: stay glued, drift slightly around them so the beam must track
    const tx = pex - me.x, tz = pez - me.z;
    const px = tz, pz = -tx;
    const s = ((Math.floor(p.t * 0.5) % 2) === 0) ? 1 : -1;
    api.move(tx + px * 0.35 * s, tz + pz * 0.35 * s);
  } else if (laserSoon && d > 6 && !api.ready("charge")) {
    // Under the beam with no charge: sidestep hard while approaching
    const tx = e.x - me.x, tz = e.z - me.z;
    const px = tz, pz = -tx;
    const s = ((Math.floor(p.t * 1.5) % 2) === 0) ? 1 : -1;
    api.move(tx * 0.55 + px * s, tz * 0.55 + pz * s);
  } else if (e.visible && p.t - lastBlock > 0.5) {
    api.move(pex - me.x, pez - me.z);
  } else {
    api.moveTo(e.x, e.z);
  }

  if (p.t - lastSay > 7) {
    lastSay = p.t;
    api.say(stall ? "let the fire have you" : (d < 5 ? "no range for you here" : "walking you down"));
  }
}

let lastLaser = -9;
let lastBlock = -9;
let lastHurt = -9;
let lastSay = -9;

function leadPoint(me, e) {
  const t0 = 0.34;
  const fx = e.x + (e.vx || 0) * t0;
  const fz = e.z + (e.vz || 0) * t0;
  const dd = Math.hypot(fx - me.x, fz - me.z);
  const tt = dd / 15;
  return { x: fx + (e.vx || 0) * tt * 0.7, z: fz + (e.vz || 0) * tt * 0.7 };
}

function coverSpot(p, api, me, e) {
  let best = null;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI * 2) / 12;
    for (const r of [4, 8]) {
      const x = me.x + Math.sin(a) * r;
      const z = me.z + Math.cos(a) * r;
      if (Math.abs(x) > 17.5 || Math.abs(z) > 17.5) continue;
      const blocked = !api.los(x, z) ? 0 : 1;
      const nd = Math.hypot(x - e.x, z - e.z);
      let s = Math.min(nd, 16) * 0.8 + (blocked ? 0 : 6);
      if (s > (best ? best.s : -1e9)) best = { s, x, z };
    }
  }
  return best;
}
