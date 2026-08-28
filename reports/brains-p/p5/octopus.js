function think(p, api) {
  const me = p.self, e = p.enemy;
  if (!me || !e || !me.alive || !e.alive) return;

  const mePos = { x: me.x, z: me.z };
  const ePos = { x: e.x, z: e.z };
  const d = e.dist;
  const toE = V.toward(mePos, ePos);
  const awayE = { x: -toE.x, z: -toE.z };

  for (const ev of p.events) {
    if (ev.type === 'blocked') orbit = -orbit;
    if (ev.type === 'damaged' && ev.skill === 'charge') orbit = -orbit;
    if (ev.type === 'enemyStarted' && ev.skill === 'charge') lastChargeSeen = p.t;
  }

  // ---------- aim prediction ----------
  const castT = 0.62;
  const lead = (e.casting && (e.casting.skill === 'smash' || e.casting.skill === 'charge')) ? 0.15 : 0.75;
  const aim = { x: e.x + e.vx * castT * lead, z: e.z + e.vz * castT * lead };
  const aimDir = V.toward(mePos, aim);
  const angErr = Math.abs(V.angleTo(me.heading, aimDir.x === 0 && aimDir.z === 0 ? toE : aimDir));

  // facing: always keep the gun on them
  if (aimDir.x !== 0 || aimDir.z !== 0) api.face(aimDir.x, aimDir.z);
  else api.face(toE.x, toE.z);

  if (me.stunned) return;

  // ---------- threat reading ----------
  const ec = e.casting;
  const chargingDash = !!(ec && ec.skill === 'charge' && (ec.phase === 'dash'));
  const chargingWind = !!(ec && ec.skill === 'charge' && ec.phase === 'windup');
  const smashTel = !!(ec && ec.skill === 'smash' && ec.telegraph);
  const smashRem = smashTel ? ec.remaining : 99;

  const blinkReady = api.ready('blink');
  const jumpReady = api.ready('jump');
  const busy = me.busy || me.airborne;

  // ---------- emergency: incoming charge ----------
  if (!busy && chargingDash) {
    const cd = V.fromHeading(e.heading);
    const rel = V.sub(mePos, ePos);
    const along = V.dot(rel, cd);
    const lat = Math.abs(rel.x * cd.z - rel.z * cd.x);
    if (along > -1.5 && along < 14 && lat < 3.6) {
      if (blinkReady) {
        let s = (rel.x * cd.z - rel.z * cd.x) >= 0 ? 1 : -1;
        let per = V.perp(cd);
        let bd = { x: per.x * s, z: per.z * s };
        const land = { x: me.x + bd.x * 7.0, z: me.z + bd.z * 7.0 };
        if (Math.abs(land.x) > 18.5 || Math.abs(land.z) > 18.5) {
          bd = { x: -bd.x, z: -bd.z };
        }
        api.use('blink', bd.x, bd.z);
        api.move(bd.x, bd.z);
        return;
      }
      // no blink: sidestep hard
      let per = V.perp(cd);
      let s = (rel.x * cd.z - rel.z * cd.x) >= 0 ? 1 : -1;
      let bd = safeDir(p, api, { x: per.x * s, z: per.z * s });
      api.move(bd.x, bd.z);
      return;
    }
  }

  // ---------- emergency: smash about to land ----------
  if (!busy && smashTel && d < 6.0) {
    if (smashRem <= 0.26 && smashRem >= 0.11 && jumpReady) {
      const esc = safeDir(p, api, mix(awayE, V.perp(toE), orbit, 1.0, 0.7));
      api.move(esc.x, esc.z);
      api.use('jump');
      return;
    }
    if (blinkReady) {
      const bd = escapeDir(p, api, awayE, toE);
      api.use('blink', bd.x, bd.z);
      api.move(bd.x, bd.z);
      return;
    }
  }

  // ---------- melee escape ----------
  if (!busy && d < 5.2 && blinkReady && !e.stunned) {
    const bd = escapeDir(p, api, awayE, toE);
    api.use('blink', bd.x, bd.z);
    api.move(bd.x, bd.z);
    return;
  }

  // ---------- laser ----------
  const enemyRecovering = e.stunned || (ec && ec.phase === 'recover');
  const safeToCast = (d >= 5.6 && !chargingDash && !chargingWind && !(smashTel && d < 6.5)) || enemyRecovering;
  if (!busy && api.ready('laser') && e.visible && d <= 21 && d > 1.8 &&
      !e.invulnerable && angErr < 0.55 && safeToCast && api.los(aim.x, aim.z)) {
    api.use('laser');
  }

  // ---------- movement ----------
  if (!e.visible && d > 9) {
    const tx = e.x - toE.x * 9.5, tz = e.z - toE.z * 9.5;
    const pt = api.pathTo(tx, tz);
    if (pt) api.moveTo(tx, tz);
    else {
      const dir = safeDir(p, api, toE);
      api.move(dir.x, dir.z);
    }
    return;
  }

  const ideal = 12.0;
  let radial;
  if (d < ideal - 3) radial = -1.25;
  else if (d > ideal + 4) radial = 1.0;
  else radial = -0.25;

  const per = V.perp(toE);
  let want = {
    x: toE.x * radial + per.x * orbit * 0.95,
    z: toE.z * radial + per.z * orbit * 0.95
  };

  // stay off the walls
  const rc = Math.sqrt(me.x * me.x + me.z * me.z);
  if (Math.abs(me.x) > 14.5 || Math.abs(me.z) > 14.5 || rc > 16) {
    const inward = V.norm({ x: -me.x, z: -me.z });
    want = { x: want.x + inward.x * 1.3, z: want.z + inward.z * 1.3 };
  }
  want = V.norm(want);
  if (want.x === 0 && want.z === 0) want = awayE;

  const mv = safeDir(p, api, want);
  api.move(mv.x, mv.z);

  if (p.t - lastSay > 7.5 && api.rand() < 0.25) {
    lastSay = p.t;
    api.say(TAUNTS[Math.floor(api.rand() * TAUNTS.length) % TAUNTS.length]);
  }
}

let orbit = 1;
let lastSay = -99;
let lastChargeSeen = -99;
const TAUNTS = [
  "eight arms, one beam",
  "too slow, ape",
  "keep swinging at air",
  "range is a weapon",
  "ink and light"
];

function mix(a, b, sb, wa, wb) {
  return V.norm({ x: a.x * wa + b.x * sb * wb, z: a.z * wa + b.z * sb * wb });
}

function escapeDir(p, api, awayE, toE) {
  const me = p.self;
  const cands = [];
  const per = V.perp(toE);
  for (const k of [0, 0.6, -0.6, 1.1, -1.1]) {
    const v = V.rot(awayE, k);
    cands.push(v);
  }
  cands.push({ x: per.x * orbit, z: per.z * orbit });
  let best = awayE, bestScore = -1e9;
  for (const c of cands) {
    const lx = me.x + c.x * 7.2, lz = me.z + c.z * 7.2;
    const cx = Math.min(19.0 - Math.abs(lx), 19.0 - Math.abs(lz));
    const dx = lx - p.enemy.x, dz = lz - p.enemy.z;
    const de = Math.sqrt(dx * dx + dz * dz);
    const score = Math.min(de, 14) * 1.0 + Math.min(cx, 6) * 1.4;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function safeDir(p, api, dir) {
  const me = p.self;
  if (!dir || (dir.x === 0 && dir.z === 0)) return { x: 0, z: 0 };
  const probe = 3.0;
  const angles = [0, 0.35, -0.35, 0.75, -0.75, 1.15, -1.15, 1.6, -1.6, 2.1, -2.1, 2.7, -2.7, 3.14];
  for (const a of angles) {
    const v = V.rot(dir, a);
    const nx = me.x + v.x * probe, nz = me.z + v.z * probe;
    if (Math.abs(nx) > 18.6 || Math.abs(nz) > 18.6) continue;
    const r = api.ray(v.x, v.z, probe);
    if (!r || !r.hit || r.dist >= probe - 0.35) return v;
  }
  const inward = V.norm({ x: -me.x, z: -me.z });
  return inward;
}
