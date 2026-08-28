function angNorm(a){ while(a>Math.PI)a-=2*Math.PI; while(a<=-Math.PI)a+=2*Math.PI; return a; }

function segBlocked(obs, A, B, pad){
  const dx=B.x-A.x, dz=B.z-A.z;
  for(const o of obs){
    const hx=Math.max(0.05,o.hx+pad), hz=Math.max(0.05,o.hz+pad);
    let t0=0,t1=1, ok=true;
    if(Math.abs(dx)<1e-6){ if(A.x < o.x-hx || A.x > o.x+hx) ok=false; }
    else { let ta=(o.x-hx-A.x)/dx, tb=(o.x+hx-A.x)/dx; if(ta>tb){const s=ta;ta=tb;tb=s;} t0=Math.max(t0,ta); t1=Math.min(t1,tb); if(t0>t1) ok=false; }
    if(ok){
      if(Math.abs(dz)<1e-6){ if(A.z<o.z-hz||A.z>o.z+hz) ok=false; }
      else { let ta=(o.z-hz-A.z)/dz, tb=(o.z+hz-A.z)/dz; if(ta>tb){const s=ta;ta=tb;tb=s;} t0=Math.max(t0,ta); t1=Math.min(t1,tb); if(t0>t1) ok=false; }
    }
    if(ok) return true;
  }
  return false;
}

function clampArena(P){
  return { x: Math.max(-19.2, Math.min(19.2, P.x)), z: Math.max(-19.2, Math.min(19.2, P.z)) };
}

function predictEnemy(en, t, k){
  return clampArena({ x: en.x + en.vx*t*k, z: en.z + en.vz*t*k });
}

function chargeAim(me, en){
  let t = 0.3;
  let P = { x: en.x, z: en.z };
  for(let i=0;i<3;i++){
    P = predictEnemy(en, t, 0.75);
    const d = Math.hypot(P.x-me.x, P.z-me.z);
    t = 0.3 + Math.min(0.8, Math.max(0, (d - (me.radius+en.radius)) / 15));
  }
  return P;
}

let strafeSign = 1;
let flipAt = 0;
let lastLaser = -99, lastBlink = -99, lastEJump = -99;
let stuck = 0, forcePathUntil = -99;
let lastSay = -99;

function dodgeDir(p, me, en){
  const cast = en.casting;
  const t = Math.max(0.12, Math.min(0.7, cast && cast.remaining ? cast.remaining : 0.4));
  const speed = me.maxSpeed * 0.82;
  const turnCap = 6 * 0.35 * t;
  const obs = p.arena.obstacles;
  const S = { x: me.x, z: me.z };
  const E = { x: en.x, z: en.z };
  const curDist = en.dist;
  let best = null, bestScore = -1e9;
  for(let i=0;i<16;i++){
    const a = i * Math.PI / 8;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const P = { x: me.x + d.x*speed*t, z: me.z + d.z*speed*t };
    if(Math.abs(P.x) > 19.0 || Math.abs(P.z) > 19.0) continue;
    if(segBlocked(obs, S, P, me.radius*0.85)) continue;
    const dxe = P.x - en.x, dze = P.z - en.z;
    const dE = Math.hypot(dxe, dze) || 0.01;
    const angTo = Math.atan2(dxe, dze);
    const diff = Math.abs(angNorm(angTo - en.heading));
    const miss = dE * Math.max(0, diff - turnCap);
    let score = Math.min(miss, 3.2) * 9;
    if(segBlocked(obs, E, P, -0.4)) score += 70;
    score += (curDist - dE) * 1.4;
    if(dE < 2.2) score -= 12;
    if(score > bestScore){ bestScore = score; best = d; }
  }
  return best;
}

function coverSpot(p, api, me, en){
  const obs = p.arena.obstacles;
  const E = { x: en.x, z: en.z };
  let best = null, bs = -1e9;
  for(const o of obs){
    const away = V.norm({ x: o.x - en.x, z: o.z - en.z });
    if(away.x === 0 && away.z === 0) continue;
    const d = Math.max(o.hx, o.hz) + 2.2;
    const P = clampArena({ x: o.x + away.x*d, z: o.z + away.z*d });
    const path = api.pathTo(P.x, P.z);
    const walk = path ? path.dist : 999;
    let score = -walk * 1.0 + Math.hypot(P.x - en.x, P.z - en.z) * 0.6;
    if(segBlocked(obs, E, P, -0.4)) score += 45;
    if(score > bs){ bs = score; best = P; }
  }
  return best;
}

function think(p, api){
  const me = p.self, en = p.enemy;
  if(!me || !me.alive) return;
  if(!en || !en.alive){ api.stop(); return; }

  for(const e of p.events){
    if(e.type === 'enemyStarted'){
      if(e.skill === 'laser') lastLaser = p.t;
      else if(e.skill === 'blink') lastBlink = p.t;
      else if(e.skill === 'jump') lastEJump = p.t;
    } else if(e.type === 'blocked'){
      strafeSign = -strafeSign;
      flipAt = p.t + 0.6;
      forcePathUntil = p.t + 0.8;
    }
  }

  const S = { x: me.x, z: me.z };
  const E = { x: en.x, z: en.z };
  const obs = p.arena.obstacles;
  const dist = en.dist;
  const toE = V.toward(S, E);

  // ---- facing ----
  let faceP;
  if(me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup'){
    faceP = chargeAim(me, en);
  } else if(me.casting && me.casting.skill === 'smash' && me.casting.telegraph){
    faceP = predictEnemy(en, Math.max(0.05, me.casting.remaining || 0.3), 0.9);
  } else {
    faceP = predictEnemy(en, 0.16, 0.8);
  }
  api.faceAt(faceP.x, faceP.z);

  if(me.stunned || me.airborne) return;

  const myFrac = me.hp / me.maxHp;
  const enFrac = en.hp / en.maxHp;
  const evade = (p.t > 33 && myFrac > enFrac + 0.06) || (p.timeLeft < 9 && myFrac > enFrac + 0.02);

  const enemyLasering = !!(en.casting && en.casting.skill === 'laser' && en.casting.telegraph);
  const enemyJumping = !!(en.casting && en.casting.skill === 'jump') || (p.t - lastEJump) < 0.75;

  // ---- skills ----
  let used = false;
  if(!me.busy){
    const smashReach = 2.9 + me.radius + en.radius;
    if(api.ready('smash')){
      const P = predictEnemy(en, 0.33, 0.85);
      const dP = Math.hypot(P.x - me.x, P.z - me.z);
      const dirP = V.toward(S, P);
      const ang = Math.abs(V.angleTo(me.heading, dirP));
      const angOk = ang < 1.05;
      const hittable = !en.airborne && !en.invulnerable && !enemyJumping && (p.t - lastBlink) > 0.35;
      if(dP < smashReach - 0.4 && angOk && hittable && !segBlocked(obs, S, P, -0.2)){
        api.use('smash');
        used = true;
      }
    }
    if(!used && !evade && api.ready('charge')){
      const aim = chargeAim(me, en);
      const dA = Math.hypot(aim.x - me.x, aim.z - me.z);
      const clear = !segBlocked(obs, S, aim, me.radius * 0.75);
      const hittable = !en.invulnerable && (p.t - lastBlink) > 0.35;
      const minD = enemyLasering ? 3.0 : 4.0;
      if(dA > minD && dA < 11.4 && en.visible && clear && hittable){
        api.use('charge');
        used = true;
      }
    }
  }

  // ---- movement ----
  if(me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup'){
    api.move(toE.x, toE.z);
    return;
  }
  if(me.busy && me.casting && (me.casting.phase === 'dash' || me.casting.phase === 'air')) return;

  if(evade){
    if(!en.visible && dist > 9){
      api.stop();
    } else {
      const spot = coverSpot(p, api, me, en);
      if(spot && (dist > 4 || !en.visible)){
        api.moveTo(spot.x, spot.z);
      } else {
        const away = V.away(S, E);
        const t2 = clampArena({ x: me.x + away.x*6, z: me.z + away.z*6 });
        api.moveTo(t2.x, t2.z);
      }
    }
    if(p.t - lastSay > 8){ lastSay = p.t; api.say("clock's mine"); }
    return;
  }

  if(enemyLasering && dist > 2.3){
    const d = dodgeDir(p, me, en);
    if(d){ api.move(d.x, d.z); return; }
  }

  // stuck detection
  if(me.speed < 0.7 && !me.busy) stuck++; else stuck = Math.max(0, stuck - 2);
  if(stuck > 8){ forcePathUntil = p.t + 1.0; stuck = 0; }

  const path = api.pathTo(en.x, en.z);
  const needPath = (path && !path.direct) || p.t < forcePathUntil || !en.visible;

  if(needPath && path && path.points && path.points.length){
    let wp = path.points[0];
    for(const q of path.points){
      if(Math.hypot(q.x - me.x, q.z - me.z) > 1.4){ wp = q; break; }
    }
    api.move(wp.x - me.x, wp.z - me.z);
    return;
  }

  if(p.t > flipAt){
    flipAt = p.t + 0.7 + api.rand() * 1.1;
    if(api.rand() < 0.45) strafeSign = -strafeSign;
  }
  let ang;
  if(dist > 9) ang = 0.22;
  else if(dist > 5.5) ang = 0.5;
  else if(dist > 3.2) ang = 0.85;
  else ang = 1.25;
  let d = V.rot(toE, strafeSign * ang);
  const r = api.ray(d.x, d.z, 3.0);
  if(r && r.hit && r.dist < 2.2){
    strafeSign = -strafeSign;
    d = V.rot(toE, strafeSign * ang);
  }
  if(dist < 2.0) d = V.rot(toE, strafeSign * 1.45);
  api.move(d.x, d.z);
}
