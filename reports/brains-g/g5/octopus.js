function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  // ---- event digest ----
  let charging = false, chargeCommitted = false;
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('lastEnemySkill', e.skill);
      api.remember('lastEnemySkillT', p.t);
      if (e.skill === 'charge') { chargeStartT = p.t; }
      if (e.skill === 'smash') { smashStartT = p.t; }
    }
    if (e.type === 'enemyCommitted') chargeCommitted = true;
    if (e.type === 'damaged') lastHitT = p.t;
  }

  const cast = en.casting;
  if (cast && cast.skill === 'charge') charging = true;

  const dToE = en.dist;
  const toE = V.toward(me, en);
  const away = V.away(me, en);

  // ---------- DANGER ASSESSMENT ----------
  // charge threat: gorilla winding up or dashing toward us
  let chargeThreat = false;
  if (cast && cast.skill === 'charge') {
    chargeThreat = true;
  }
  // smash threat: within cone range and winding up
  let smashThreat = false;
  if (cast && cast.skill === 'smash' && dToE < 4.6) smashThreat = true;

  // ---------- REACTIVE DEFENSE ----------
  if (!me.stunned && !me.airborne) {
    // Dodge a smash by hopping (airborne dodges ground sweep)
    if (smashThreat && cast.remaining !== undefined) {
      const rem = cast.remaining;
      // jump so we are airborne when it lands
      if (rem <= 0.16 && rem > 0.0 && api.ready('jump')) {
        api.use('jump');
        api.move(away.x, away.z);
        api.faceAt(en.x, en.z);
        return;
      }
      // otherwise sidestep out of the cone
      if (!me.busy) {
        const side = V.perp(toE);
        const sgn = pickSide(p, api, side);
        api.move(side.x * sgn - toE.x * 0.8, side.z * sgn - toE.z * 0.8);
      }
    }

    // Dodge a charge: blink perpendicular at the last moment
    if (chargeThreat) {
      const dashPhase = cast.phase === 'dash';
      const facingUs = Math.abs(V.angleTo(en.heading, toEnemyRev(me, en))) < 0.5;
      if (dashPhase) {
        // they're moving; predict
        const evx = en.vx, evz = en.vz;
        const sp = Math.hypot(evx, evz);
        if (sp > 5) {
          const dir = { x: evx / sp, z: evz / sp };
          const rel = V.sub(me, en);
          const along = V.dot(rel, dir);
          const lat = Math.abs(rel.x * dir.z - rel.z * dir.x);
          if (along > -1 && along < 13 && lat < 2.6) {
            const perp = V.perp(dir);
            const sgn = (rel.x * dir.z - rel.z * dir.x) >= 0 ? 1 : -1;
            const esc = { x: perp.x * sgn, z: perp.z * sgn };
            if (api.ready('blink') && along < 7) {
              api.use('blink', esc.x, esc.z);
              api.remember('blinkT', p.t);
              return;
            }
            api.move(esc.x, esc.z);
            api.faceAt(en.x, en.z);
            return;
          }
        }
      } else if (cast.phase === 'windup' && dToE < 13.5 && facingUs) {
        // strafe hard so their locked direction misses
        const perp = V.perp(toE);
        const sgn = pickSide(p, api, perp);
        api.move(perp.x * sgn, perp.z * sgn);
        api.faceAt(en.x, en.z);
        // don't burn laser into a charge unless it will fire before impact
        if (api.ready('laser') && dToE > 9) {
          api.use('laser');
        }
        return;
      }
    }
  }

  // ---------- OFFENSE: LASER ----------
  const laserCd = api.cooldown('laser');
  const casting = me.casting && me.casting.skill === 'laser';

  if (casting) {
    // keep aim leading slightly; we turn at 0.35 rate
    const rem = me.casting.remaining || 0;
    const lead = { x: en.x + en.vx * rem * 0.9, z: en.z + en.vz * rem * 0.9 };
    api.faceAt(lead.x, lead.z);
    // keep distance while casting (slow), drift away/strafe
    const perp = V.perp(toE);
    const sgn = pickSide(p, api, perp);
    let mvx = perp.x * sgn, mvz = perp.z * sgn;
    if (dToE < 7) { mvx += away.x * 1.2; mvz += away.z * 1.2; }
    else if (dToE > 18) { mvx += toE.x * 0.6; mvz += toE.z * 0.6; }
    api.move(mvx, mvz);
    return;
  }

  const wantRange = dToE > 5.5 && dToE < 22 && en.visible && !en.airborne;
  if (api.ready('laser') && wantRange && !me.busy && !me.stunned && !me.airborne) {
    // don't start if a charge is about to hit
    const safeToCast = !(charging && dToE < 10);
    if (safeToCast) {
      api.use('laser');
      const lead = { x: en.x + en.vx * 0.7, z: en.z + en.vz * 0.7 };
      api.faceAt(lead.x, lead.z);
      const perp = V.perp(toE);
      const sgn = pickSide(p, api, perp);
      api.move(perp.x * sgn * 0.9 + away.x * 0.4, perp.z * sgn * 0.9 + away.z * 0.4);
      return;
    }
  }

  // ---------- KITING / POSITIONING ----------
  api.faceAt(en.x, en.z);

  const ideal = 11;
  let mx = 0, mz = 0;

  if (dToE < ideal - 1.5) {
    mx += away.x * 1.4; mz += away.z * 1.4;
  } else if (dToE > ideal + 3.5) {
    if (en.visible) { mx += toE.x * 0.7; mz += toE.z * 0.7; }
    else {
      const path = api.pathTo(en.x, en.z);
      if (path && path.points && path.points.length) {
        const wp = path.points[0];
        const d = V.toward(me, wp);
        mx += d.x; mz += d.z;
      } else { mx += toE.x; mz += toE.z; }
    }
  }

  // constant orbit so charges must predict
  const perp = V.perp(toE);
  const sgn = pickSide(p, api, perp);
  mx += perp.x * sgn * 1.0; mz += perp.z * sgn * 1.0;

  // wall avoidance
  const half = p.arena.half - 2.2;
  if (me.x > half) mx -= (me.x - half) * 1.2;
  if (me.x < -half) mx -= (me.x + half) * 1.2;
  if (me.z > half) mz -= (me.z - half) * 1.2;
  if (me.z < -half) mz -= (me.z + half) * 1.2;

  // obstacle nudge
  for (const o of p.arena.obstacles) {
    const dx = me.x - o.x, dz = me.z - o.z;
    const ox = Math.max(Math.abs(dx) - o.hx, 0), oz = Math.max(Math.abs(dz) - o.hz, 0);
    const d = Math.hypot(ox, oz);
    if (d < 2.0) {
      const s = (2.0 - d) * 1.5;
      const nx = ox > 0 ? Math.sign(dx) * ox / (d || 1) : (Math.abs(dx) > Math.abs(dz) ? Math.sign(dx) : 0);
      const nz = oz > 0 ? Math.sign(dz) * oz / (d || 1) : (Math.abs(dz) >= Math.abs(dx) ? Math.sign(dz) : 0);
      mx += nx * s; mz += nz * s;
    }
  }

  if (mx === 0 && mz === 0) { mx = perp.x; mz = perp.z; }
  api.move(mx, mz);

  // escape blink if cornered and gorilla close
  if (dToE < 3.2 && api.ready('blink') && !me.busy && !me.stunned && !me.airborne) {
    const dir = pickBlinkDir(p, api, away);
    api.use('blink', dir.x, dir.z);
  }

  if (p.tick % 90 === 0) api.say(SAYINGS[(p.tick / 90) % SAYINGS.length | 0]);
}

let chargeStartT = -99;
let smashStartT = -99;
let lastHitT = -99;
let sideSign = 1;
let sideT = -99;

const SAYINGS = [
  "eight arms, one beam",
  "come closer, ape",
  "ink and light",
  "you swing, I burn"
];

function toEnemyRev(me, en) {
  return { x: me.x - en.x, z: me.z - en.z };
}

function pickSide(p, api, perp) {
  // re-evaluate strafe side every ~1.2s, prefer open space
  if (p.t - sideT > 1.2) {
    sideT = p.t;
    const me = p.self;
    const a = api.ray(perp.x, perp.z, 8);
    const b = api.ray(-perp.x, -perp.z, 8);
    if (a.dist > b.dist + 0.5) sideSign = 1;
    else if (b.dist > a.dist + 0.5) sideSign = -1;
    else if (api.rand() < 0.35) sideSign = -sideSign;
  } else {
    // immediate bail if blocked
    const a = api.ray(perp.x * sideSign, perp.z * sideSign, 2.0);
    if (a.hit && a.dist < 1.6) { sideSign = -sideSign; sideT = p.t; }
  }
  return sideSign;
}

function pickBlinkDir(p, api, away) {
  let best = away, bestD = -1;
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    if (V.dot(d, away) < 0.1) continue;
    const r = api.ray(d.x, d.z, 7.5);
    if (r.dist > bestD) { bestD = r.dist; best = d; }
  }
  return best;
}
