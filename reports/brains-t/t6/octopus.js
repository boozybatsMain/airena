const D24 = Array.from({length:24},(_,i)=>({x:Math.sin(i*Math.PI/12),z:Math.cos(i*Math.PI/12)}));

let prevDir = {x:0,z:1};
let chargeReadyAt = 0;
let smashReadyAt = 0;
let jumpReadyAt = 0;
let lastSay = -9;
let lastBlinkT = -9;

function insideBlock(p,x,z,m){
  for(const o of p.arena.obstacles){
    if(Math.abs(x-o.x) < o.hx+m && Math.abs(z-o.z) < o.hz+m) return true;
  }
  return false;
}

function scorePoint(p,x,z){
  let s = 0;
  const lim = p.arena.half - 1.5;
  if(Math.abs(x) > lim) s -= (Math.abs(x)-lim)*5;
  if(Math.abs(z) > lim) s -= (Math.abs(z)-lim)*5;
  if(insideBlock(p,x,z,1.2)) s -= 8;
  s += Math.hypot(x-p.enemy.x, z-p.enemy.z)*0.35;
  return s;
}

function pickSide(p,a,b,reach){
  const sa = scorePoint(p, p.self.x + a.x*reach, p.self.z + a.z*reach);
  const sb = scorePoint(p, p.self.x + b.x*reach, p.self.z + b.z*reach);
  return sa >= sb ? a : b;
}

function bestEscape(p){
  const me = p.self;
  let best = V.away(me, p.enemy), bs = -1e9;
  for(const d of D24){
    const s = scorePoint(p, me.x + d.x*7.0, me.z + d.z*7.0)
            + (d.x*V.away(me,p.enemy).x + d.z*V.away(me,p.enemy).z)*1.2;
    if(s > bs){ bs = s; best = d; }
  }
  return best;
}

function chooseMove(p, api, want, laneDir){
  const me = p.self, e = p.enemy;
  const toE = V.toward(me, e);
  let best = null, bs = -1e9;
  const step = 2.8;
  for(const d of D24){
    const nx = me.x + d.x*step, nz = me.z + d.z*step;
    let s = 0;
    const lim = p.arena.half - 1.0;
    const ax = Math.abs(nx) - lim + 2.2, az = Math.abs(nz) - lim + 2.2;
    if(ax > 0) s -= ax*ax*2.5;
    if(az > 0) s -= az*az*2.5;
    const r = api.ray(d.x, d.z, step + 1.0);
    if(r.hit) s -= (step + 1.0 - r.dist)*4;
    const dE = Math.hypot(nx - e.x, nz - e.z);
    s -= Math.abs(dE - want)*1.3;
    if(laneDir){
      const rx = nx - e.x, rz = nz - e.z;
      const al = rx*laneDir.x + rz*laneDir.z;
      const lt = Math.abs(rx*laneDir.z - rz*laneDir.x);
      if(al > -1 && al < 14 && lt < 3.6) s -= (3.6 - lt)*3.0;
    }
    s += (d.x*prevDir.x + d.z*prevDir.z)*1.0;
    if(!e.visible) s += Math.abs(d.x*toE.z - d.z*toE.x)*1.6;
    s -= Math.hypot(nx, nz)*0.08;
    if(s > bs){ bs = s; best = d; }
  }
  return best || {x:0,z:0};
}

function think(p, api){
  const me = p.self, e = p.enemy;
  if(!me || !me.alive) return;
  const now = p.t;

  for(const ev of p.events){
    if(ev.type === 'enemyStarted'){
      if(ev.skill === 'charge') chargeReadyAt = now + 4.033;
      else if(ev.skill === 'smash') smashReadyAt = now + 1.3;
      else if(ev.skill === 'jump') jumpReadyAt = now + 2.8;
    } else if(ev.type === 'blinked'){
      lastBlinkT = now;
    }
  }

  if(!e || !e.alive){ api.stop(); return; }

  const dist = e.dist;
  const canAct = !me.busy && !me.stunned && !me.airborne;

  // ---- aiming (lead the target for the remaining cast time) ----
  const casting = me.casting && me.casting.skill === 'laser' && me.casting.telegraph;
  const castLeft = casting ? me.casting.remaining : 0.667;
  const lead = Math.min(0.75, Math.max(0, castLeft));
  const aim = { x: e.x + e.vx*lead*0.95, z: e.z + e.vz*lead*0.95 };
  const toAim = V.toward(me, aim);
  const angErr = Math.abs(V.angleTo(me.heading, toAim));
  api.faceAt(aim.x, aim.z);

  // ---- read enemy threats ----
  let chDir = null, chPhase = null, chRem = 9;
  if(e.casting && e.casting.skill === 'charge'){
    chPhase = e.casting.phase;
    chRem = e.casting.remaining;
    chDir = (chPhase === 'dash' && e.speed > 2)
      ? V.norm({x:e.vx, z:e.vz})
      : V.fromHeading(e.heading);
  }
  let inLane = false;
  if(chDir){
    const rx = me.x - e.x, rz = me.z - e.z;
    const al = rx*chDir.x + rz*chDir.z;
    const lt = Math.abs(rx*chDir.z - rz*chDir.x);
    inLane = al > -0.8 && al < 13.5 && lt < 3.2;
  }
  const smashing = !!(e.casting && e.casting.skill === 'smash' && e.casting.telegraph);
  const chargeSoon = (chargeReadyAt - now) < 1.2;

  // ---- desired spacing ----
  let want = chargeSoon ? 14.0 : 10.0;
  if(chDir) want = 15.0;
  if(me.hp < 45) want += 2.0;

  let laneAvoid = chDir && dist < 16 ? chDir : null;
  let handled = false;

  // ---- 1. dodge a charge ----
  if(chDir && inLane){
    const p1 = {x: chDir.z, z: -chDir.x};
    const p2 = {x: -chDir.z, z: chDir.x};
    const side = pickSide(p, p1, p2, 7.0);
    const urgent = (chPhase === 'dash') || (chPhase === 'windup' && chRem < 0.15);
    if(urgent && canAct && api.ready('blink')){
      api.use('blink', side.x, side.z);
    }
    const bias = V.norm({ x: side.x*2.2 + V.away(me,e).x, z: side.z*2.2 + V.away(me,e).z });
    api.move(bias.x, bias.z);
    prevDir = bias;
    handled = true;
  }

  // ---- 2. dodge a smash ----
  if(!handled && smashing && dist < 6.4){
    const away = bestEscape(p);
    if(canAct){
      if(api.ready('jump')) api.use('jump');
      else if(api.ready('blink') && !chargeSoon) api.use('blink', away.x, away.z);
      else if(api.ready('blink') && dist < 4.0) api.use('blink', away.x, away.z);
    }
    api.move(away.x, away.z);
    prevDir = away;
    handled = true;
  }

  // ---- 3. emergency disengage ----
  if(!handled && canAct && dist < 4.4 && api.ready('blink') && (!chargeSoon || dist < 2.6)){
    const away = bestEscape(p);
    api.use('blink', away.x, away.z);
    api.move(away.x, away.z);
    prevDir = away;
    handled = true;
  }

  // ---- 4. laser ----
  if(!handled && canAct && api.ready('laser') && e.visible && dist > 2.4 && dist < 23.5 && angErr < 0.55){
    let risk = 0;
    if((chargeReadyAt - now) < 0.25 && dist < 13.5) risk += 2;
    if(dist < 6.8 && (smashReadyAt - now) < 0.25) risk += 2;
    if(chDir) risk += 4;
    if(e.busy && !chDir) risk -= 1;
    if(e.stunned) risk -= 3;
    if(e.airborne) risk -= 2;
    const desperate = (p.t > 17) || (me.hp/me.maxHp < e.hp/e.maxHp - 0.08) || (p.burn > 0);
    const limit = desperate ? 3 : 2;
    if(risk < limit){
      api.use('laser');
      if(now - lastSay > 6){ lastSay = now; api.say("eight arms, one beam"); }
    }
  }

  // ---- default movement ----
  if(!handled){
    if(!e.visible && dist > 17){
      const back = V.toward(me, e);
      const tgt = { x: e.x - back.x*want, z: e.z - back.z*want };
      api.moveTo(tgt.x, tgt.z);
      prevDir = back;
    } else {
      const d = chooseMove(p, api, want, laneAvoid);
      api.move(d.x, d.z);
      prevDir = d;
    }
  }
}
