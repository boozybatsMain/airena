const TAU = Math.PI * 2;

let chargeNextAt = 0;
let smashNextAt = 0;
let prevDir = { x: 0, z: 1 };
let lastSay = -99;

function pickDir(p, api, desired) {
  const me = p.self, en = p.enemy;
  let best = null, bestScore = -1e9;

  let wp = null;
  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      wp = path.points[0];
      if (V.dist(me, wp) < 1.4 && path.points.length > 1) wp = path.points[1];
    }
  }

  for (let i = 0; i < 16; i++) {
    const a = i * TAU / 16;
    const d = { x: Math.sin(a), z: Math.cos(a) };
    const r = api.ray(d.x, d.z, 4.5);
    const clear = r.dist;
    if (clear < 1.2) continue;
    const step = Math.min(Math.max(clear - 0.8, 0.4), 2.5);
    const fx = me.x + d.x * step, fz = me.z + d.z * step;
    const fd = Math.hypot(fx - en.x, fz - en.z);

    let s = -Math.abs(fd - desired);
    const m = 20 - Math.max(Math.abs(fx), Math.abs(fz));
    if (m < 6) s -= (6 - m) * (6 - m) * 0.3;
    s += Math.min(clear, 4.5) * 0.5;
    s += V.dot(d, prevDir) * 0.9;
    if (wp) {
      const tw = V.toward(me, wp);
      s += V.dot(d, tw) * 2.5;
    }
    if (s > bestScore) { bestScore = s; best = d; }
  }
  if (!best) best = V.away(me, en);
  return best;
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me || !me.alive) return;
  const t = p.t;

  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'charge') chargeNextAt = t + 4.5;
      else if (e.skill === 'smash') smashNextAt = t + 1.1;
    }
  }

  if (!en || !en.alive) { api.stop(); return; }
  if (me.airborne || me.stunned) return;

  const dist = en.dist;
  const chargeReady = t >= chargeNextAt - 0.08;
  const ec = en.casting;
  const dashing = !!(ec && ec.skill === 'charge' && ec.phase === 'dash');
  const chargeWind = !!(ec && ec.skill === 'charge' && ec.phase === 'windup');
  const smashWind = !!(ec && ec.skill === 'smash' && ec.telegraph);

  // ---------- aim ----------
  const tp = (me.casting && me.casting.skill === 'laser')
    ? Math.max(0, 0.55 - (me.casting.elapsed || 0))
    : 0.5;
  api.faceAt(en.x + en.vx * tp, en.z + en.vz * tp);

  let dodged = false;

  // ---------- dodge an incoming charge dash ----------
  if (dashing) {
    const dv = { x: en.vx, z: en.vz };
    const dd = V.len(dv) > 1 ? V.norm(dv) : V.fromHeading(en.heading);
    const rel = { x: me.x - en.x, z: me.z - en.z };
    const along = V.dot(rel, dd);
    const cross = dd.x * rel.z - dd.z * rel.x;
    if (along > -1.5 && along < 15 && Math.abs(cross) < 3.4) {
      let side = cross >= 0 ? 1 : -1;
      if (Math.abs(cross) < 0.9) {
        const a1 = { x: -dd.z, z: dd.x }, b1 = { x: dd.z, z: -dd.x };
        side = api.ray(a1.x, a1.z, 6).dist >= api.ray(b1.x, b1.z, 6).dist ? 1 : -1;
      }
      const perp = { x: -dd.z * side, z: dd.x * side };
      const esc = V.norm({ x: perp.x - dd.x * 0.3, z: perp.z - dd.z * 0.3 });
      if (api.ready('blink')) {
        api.use('blink', esc.x, esc.z);
        if (t - lastSay > 4) { api.say('ink and vanish'); lastSay = t; }
      } else {
        api.move(esc.x, esc.z);
      }
      dodged = true;
    }
  }

  // ---------- dodge a smash ----------
  if (!dodged && smashWind && dist < 4.8) {
    const away = V.away(me, en);
    if (api.ready('blink')) api.use('blink', away.x, away.z);
    else if (api.ready('jump')) api.use('jump');
    else api.move(away.x, away.z);
    dodged = true;
  }

  // ---------- panic reset if he is on top of us ----------
  if (!dodged && dist < 3.6 && !me.busy && api.ready('blink')) {
    const away = V.norm({
      x: (me.x - en.x) - (me.x) * 0.12,
      z: (me.z - en.z) - (me.z) * 0.12
    });
    api.use('blink', away.x, away.z);
    dodged = true;
  }

  const myFrac = me.hp / me.maxHp, enFrac = en.hp / en.maxHp;
  const cautious = myFrac > enFrac + 0.06 && t > 44;

  // ---------- laser ----------
  if (!dodged && !me.busy && api.ready('laser')) {
    const blinkCd = api.cooldown('blink');
    let minD = 7.5;
    if (chargeReady) minD = blinkCd < 0.45 ? 10.5 : 15.5;
    if (smashWind || chargeWind || dashing) minD = Math.max(minD, 16);
    if (cautious) minD = Math.max(minD, 12);
    if (en.visible && dist >= minD && dist <= 22.5 && !en.airborne && !en.invulnerable) {
      api.use('laser');
    }
  }

  // ---------- movement ----------
  if (!dodged) {
    let desired = chargeReady ? 15.5 : 11.0;
    if (!en.visible) desired = 10.0;
    if (cautious) desired += 3.5;

    if (chargeWind) {
      const toMe = V.toward(en, me);
      const per = V.perp(toMe);
      const s = api.ray(per.x, per.z, 5).dist >= api.ray(-per.x, -per.z, 5).dist ? 1 : -1;
      const dir = V.norm({ x: toMe.x * 0.55 + per.x * s, z: toMe.z * 0.55 + per.z * s });
      api.move(dir.x, dir.z);
      prevDir = dir;
    } else {
      const dir = pickDir(p, api, desired);
      api.move(dir.x, dir.z);
      prevDir = dir;
    }
  }

  if (t - lastSay > 9) {
    api.say(`eight arms, one beam — ${Math.round(en.hp)} left on the ape`);
    lastSay = t;
  }
}
