const CD = { smash: 1.3, charge: 4, jump: 2.8 };
const OBS_PAD = 1.15;

let eCd = { smash: 0, charge: 0, jump: 0 };
let strafe = 1;
let nextFlip = 0;
let saidHello = false;

function predict(e, t) {
  return { x: e.x + (e.vx || 0) * t, z: e.z + (e.vz || 0) * t };
}

function inObstacle(p, x, z, pad) {
  for (const o of p.arena.obstacles) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

function landing(p, s, d, range) {
  const half = p.arena.half - 1.2;
  for (let r = range; r > 0.5; r -= 0.6) {
    const x = s.x + d.x * r, z = s.z + d.z * r;
    if (Math.abs(x) > half || Math.abs(z) > half) continue;
    if (inObstacle(p, x, z, OBS_PAD)) continue;
    return { x, z, r };
  }
  return { x: s.x, z: s.z, r: 0 };
}

function doBlink(p, api, prefer) {
  const s = p.self, e = p.enemy;
  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const L = landing(p, s, d, 7.5);
    if (L.r < 3) continue;
    let sc = L.r * 0.8;
    sc += Math.hypot(L.x - e.x, L.z - e.z) * 0.7;
    const wall = Math.min(p.arena.half - Math.abs(L.x), p.arena.half - Math.abs(L.z));
    if (wall < 4.5) sc -= (4.5 - wall) * 2.2;
    if (prefer) sc += (d.x * prefer.x + d.z * prefer.z) * 6;
    if (sc > bs) { bs = sc; best = d; }
  }
  if (best) { api.use("blink", best.x, best.z); return true; }
  return false;
}

function steer(p, api, D, bias) {
  const s = p.self, e = p.enemy;
  const ep = predict(e, 0.45);
  let best = null, bs = -1e9;
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(d.x, d.z, 4.5);
    if (r.dist < 1.5) continue;
    const look = Math.min(2.6, r.dist - 0.6);
    const fx = s.x + d.x * look, fz = s.z + d.z * look;
    const de = Math.hypot(fx - ep.x, fz - ep.z);
    let sc = -Math.abs(de - D) * 1.2;
    if (de < 5.5) sc -= (5.5 - de) * 3.5;
    sc += Math.min(r.dist, 4.5) * 0.5;
    const wall = Math.min(p.arena.half - Math.abs(fx), p.arena.half - Math.abs(fz));
    if (wall < 4) sc -= (4 - wall) * 2.5;
    if (bias) sc += (d.x * bias.x + d.z * bias.z) * 2.0;
    if (sc > bs) { bs = sc; best = d; }
  }
  if (best) api.move(best.x, best.z);
  else {
    const away = V.away(s, e);
    api.move(away.x, away.z);
  }
}

function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s.alive || !e || !e.alive) return;

  if (!saidHello) { saidHello = true; api.say("eight arms, one beam"); }

  for (const ev of p.events) {
    if (ev.type === "enemyStarted" && CD[ev.skill] != null) eCd[ev.skill] = p.t + CD[ev.skill];
    else if (ev.type === "damaged" && CD[ev.skill] != null) eCd[ev.skill] = p.t + CD[ev.skill];
    else if (ev.type === "evaded" && CD[ev.by] != null) eCd[ev.by] = p.t + CD[ev.by];
    else if (ev.type === "blocked") { strafe = -strafe; nextFlip = p.t + 0.9; }
  }

  if (p.t > nextFlip) {
    nextFlip = p.t + 0.7 + api.rand() * 1.0;
    if (api.rand() < 0.5) strafe = -strafe;
  }

  if (s.stunned) return;
  if (s.airborne) { api.faceAt(e.x, e.z); return; }

  const dist = e.dist;
  const ec = e.casting;
  const chargeReady = p.t >= eCd.charge - 0.05;
  const toE = V.toward(s, e);
  const perp = { x: toE.z * strafe, z: -toE.x * strafe };

  let dashPhase = null, dashDir = null, lat = 0, along = 0;
  if (ec && ec.skill === "charge") {
    dashPhase = ec.phase;
    const moving = Math.abs(e.vx) + Math.abs(e.vz) > 2;
    dashDir = (dashPhase === "dash" && moving) ? V.norm({ x: e.vx, z: e.vz }) : V.fromHeading(e.heading);
    const rel = { x: s.x - e.x, z: s.z - e.z };
    along = V.dot(rel, dashDir);
    lat = rel.x * dashDir.z - rel.z * dashDir.x;
  }
  const dashIncoming = dashPhase === "dash" && along > -0.5 && along < 14 && Math.abs(lat) < 3.2;

  let sideDir = null;
  if (dashDir) {
    const q = { x: dashDir.z, z: -dashDir.x };
    sideDir = lat >= 0 ? q : { x: -q.x, z: -q.z };
  }

  let acted = false;

  if (dashIncoming && api.ready("blink")) {
    const pref = V.norm({ x: sideDir.x - toE.x * 0.4, z: sideDir.z - toE.z * 0.4 });
    if (doBlink(p, api, pref)) acted = true;
  }

  const smashTele = ec && ec.skill === "smash" && ec.telegraph;
  if (!acted && dist < 5.3 && !e.airborne) {
    if (api.ready("blink") && (smashTele || dist < 3.7)) {
      doBlink(p, api, V.norm({ x: V.away(s, e).x + perp.x * 0.5, z: V.away(s, e).z + perp.z * 0.5 }));
      acted = true;
    } else if (smashTele && dist < 4.8 && api.ready("jump")) {
      api.use("jump");
      acted = true;
    }
  }

  const myFrac = s.hp / s.maxHp, eFrac = e.hp / e.maxHp;
  const stalling = p.burnStartsIn < 3 && myFrac > eFrac + 0.04;

  if (!acted && api.ready("laser") && e.visible && !e.invulnerable && !e.airborne &&
      dist > 4.6 && dist < 21) {
    const eta = Math.max(0, eCd.charge - p.t) + 0.28 + Math.max(0, dist - 2.6) / 15;
    const need = stalling ? 1.15 : 0.86;
    const safe = eta > need || dist > 15.5;
    const aim = predict(e, 0.72);
    const ang = Math.abs(V.angleTo(s.heading, V.toward(s, aim)));
    if (safe && ang < 0.95 && !(ec && ec.skill === "charge")) {
      api.use("laser");
      acted = true;
    }
  }

  const casting = s.casting && s.casting.skill === "laser";
  if (casting) {
    let rem = s.casting.remaining;
    if (typeof rem !== "number") rem = 0.35;
    rem = Math.max(0.03, Math.min(rem, 0.7));
    const aim = predict(e, rem);
    api.faceAt(aim.x, aim.z);
  } else {
    const aim = predict(e, 0.4);
    api.faceAt(aim.x, aim.z);
  }

  let D;
  if (dashPhase === "windup" || dashIncoming) D = dist + 7;
  else if (stalling) D = 15;
  else if (chargeReady) D = 12.5;
  else D = 8.5;
  if (dist < 6.5) D = Math.max(D, 11);
  if (casting) D = Math.max(D, dist + 1.5);

  let bias = perp;
  if (dashPhase && sideDir) {
    bias = V.norm({ x: sideDir.x * 1.2 - toE.x * 0.7, z: sideDir.z * 1.2 - toE.z * 0.7 });
  }

  if (!e.visible && dist > 8 && api.cooldown("laser") < 1.3 && !stalling) {
    api.moveTo(e.x, e.z);
  } else {
    steer(p, api, D, bias);
  }
}
