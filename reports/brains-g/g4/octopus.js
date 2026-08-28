function think(p, api) {
  const s = p.self, e = p.enemy;
  if (!s || !s.alive) return;
  if (!e || !e.alive) { api.stop(); return; }

  const me = { x: s.x, z: s.z };
  const him = { x: e.x, z: e.z };

  // ---------- remember events ----------
  for (const ev of p.events) {
    if (ev.type === 'blocked') stuck++;
    if (ev.type === 'damaged') lastHurt = p.t;
    if (ev.type === 'enemyStarted' && ev.skill === 'charge') lastChargeSeen = p.t;
  }
  if (stuck > 0 && p.t - lastStuckDecay > 0.6) { stuck = Math.max(0, stuck - 1); lastStuckDecay = p.t; }

  const ec = e.casting;

  // ---------- charge threat ----------
  let charge = null;
  if (ec && ec.skill === 'charge') {
    let d;
    if (ec.phase === 'dash' && (Math.abs(e.vx) + Math.abs(e.vz)) > 1.5) d = V.norm({ x: e.vx, z: e.vz });
    else d = V.fromHeading(e.heading);
    const rel = { x: s.x - e.x, z: s.z - e.z };
    const fwd = V.dot(rel, d);
    const lat = rel.x * d.z - rel.z * d.x;
    charge = {
      d, fwd, lat, phase: ec.phase,
      inline: Math.abs(lat) < 2.9 && fwd > -2.0 && fwd < 14.5
    };
  }
  const smashing = !!(ec && ec.skill === 'smash' && ec.telegraph);

  let handled = false;

  // ---------- dodge charge ----------
  if (charge && charge.inline && !s.airborne) {
    let side = charge.lat >= 0 ? 1 : -1;
    let perp = { x: charge.d.z * side, z: -charge.d.x * side };
    let r = api.ray(perp.x, perp.z, 4.0);
    if (r.dist < 2.2) {
      side = -side;
      perp = { x: charge.d.z * side, z: -charge.d.x * side };
    }
    const mv = V.norm({ x: perp.x - charge.d.x * 0.30, z: perp.z - charge.d.z * 0.30 });
    if (charge.phase === 'dash' && charge.fwd < 10.5 && charge.fwd > -1 && api.ready('blink') && !s.busy) {
      api.use('blink', mv.x, mv.z);
      api.move(mv.x, mv.z);
    } else {
      api.move(mv.x, mv.z);
    }
    lastDir = mv;
    api.faceAt(e.x, e.z);
    handled = true;
  }

  // ---------- dodge smash ----------
  if (!handled && smashing && e.dist < 6.4 && !s.airborne) {
    const away = V.away(me, him);
    const wallR = api.ray(away.x, away.z, 3.0);
    let mv = away;
    if (wallR.dist < 1.8) {
      const t = V.perp(away);
      mv = V.norm({ x: away.x + t.x * 1.6, z: away.z + t.z * 1.6 });
    }
    if (e.dist < 5.0 && !s.busy && api.ready('blink')) {
      api.use('blink', mv.x, mv.z);
    } else if (e.dist < 4.9 && !s.busy && api.ready('jump') && ec.remaining < 0.22) {
      api.use('jump');
    }
    api.move(mv.x, mv.z);
    lastDir = mv;
    api.faceAt(e.x, e.z);
    handled = true;
  }

  // ---------- panic distance ----------
  if (!handled && e.dist < 5.0 && !s.airborne) {
    const away = V.away(me, him);
    let mv = away;
    const wallR = api.ray(away.x, away.z, 3.0);
    if (wallR.dist < 1.8) {
      const t = V.perp(away);
      mv = V.norm({ x: away.x + t.x * 1.8, z: away.z + t.z * 1.8 });
    }
    if (!s.busy && api.ready('blink') && e.dist < 3.6) api.use('blink', mv.x, mv.z);
    api.move(mv.x, mv.z);
    lastDir = mv;
    api.faceAt(e.x, e.z);
    handled = true;
  }

  // ---------- aiming ----------
  const casting = s.casting && s.casting.skill === 'laser' && s.casting.telegraph;
  let leadT = 0.42;
  if (casting) leadT = Math.max(0, s.casting.remaining);
  let vx = e.vx, vz = e.vz;
  const vm = Math.hypot(vx, vz);
  if (vm > 5.5) { vx = vx / vm * 5.5; vz = vz / vm * 5.5; }
  const aim = { x: e.x + vx * leadT * 0.85, z: e.z + vz * leadT * 0.85 };
  if (!handled || casting) api.faceAt(aim.x, aim.z);

  // ---------- laser ----------
  const dirToAim = V.toward(me, aim);
  const angErr = Math.abs(V.angleTo(s.heading, dirToAim));
  const safeToCast =
    e.stunned || e.airborne ||
    e.dist > 11.8 ||
    (e.dist > 7.0 && e.busy && !(ec && ec.skill === 'charge'));
  if (!s.busy && !s.airborne && !s.stunned &&
      api.ready('laser') && e.visible && e.dist < 21.5 && e.dist > 3.0 &&
      !(ec && ec.skill === 'charge') && safeToCast && angErr < 1.05) {
    api.use('laser');
  }

  // ---------- movement ----------
  if (!handled && !s.airborne) {
    let desired = 13.0;
    const cd = api.cooldown('laser');
    if (cd > 0.9) desired = 15.0;
    if (casting) desired = 14.0;
    if (p.t > 46 && s.hp / s.maxHp > e.hp / e.maxHp) desired = 16.0;

    if (!e.visible && e.dist > 8) {
      const path = api.pathTo(e.x, e.z);
      if (path) api.moveTo(e.x, e.z);
      else api.move(V.toward(me, him).x, V.toward(me, him).z);
    } else {
      const tang = V.perp(V.toward(me, him));
      let best = null, bestScore = -1e9;
      for (let k = 0; k < 16; k++) {
        const h = k * Math.PI / 8;
        const d = { x: Math.sin(h), z: Math.cos(h) };
        const r = api.ray(d.x, d.z, 3.4);
        const clear = r.dist;
        if (clear < 1.5) continue;
        const step = Math.min(2.3, clear - 1.2);
        const np = { x: s.x + d.x * step, z: s.z + d.z * step };
        const nd = Math.hypot(np.x - e.x, np.z - e.z);
        let sc = -Math.abs(nd - desired) * 1.7;
        sc += Math.min(clear, 3.4) * 0.45;
        const wm = Math.min(20 - Math.abs(np.x), 20 - Math.abs(np.z));
        if (wm < 5) sc -= (5 - wm) * 2.0;
        sc += V.dot(d, lastDir) * 0.8;
        sc += Math.abs(V.dot(d, tang)) * 0.55;
        if (stuck > 1) sc += api.rand() * 1.5;
        if (sc > bestScore) { bestScore = sc; best = d; }
      }
      if (best) {
        api.move(best.x, best.z);
        lastDir = best;
      } else {
        const c = V.toward(me, { x: 0, z: 0 });
        api.move(c.x, c.z);
        lastDir = c;
      }
    }
  }

  // ---------- flavour ----------
  if (p.t - lastSay > 11) {
    lastSay = p.t;
    const lines = ['eight arms, one beam', 'too slow, ape', 'range is a weapon', 'ink and light'];
    api.say(lines[Math.floor(api.rand() * lines.length) % lines.length]);
  }
}

let lastDir = { x: 0, z: 1 };
let stuck = 0;
let lastStuckDecay = 0;
let lastHurt = -99;
let lastChargeSeen = -99;
let lastSay = -99;
