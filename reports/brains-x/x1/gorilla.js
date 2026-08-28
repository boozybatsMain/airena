const OBST = [
  { x: -7, z: -3, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 12.5, z: -11, hx: 1.6, hz: 1.6 }
];

let ecd = { laser: 0, blink: 0, jump: 0 };
let side = 1;
let sideT = 0;
let bornT = -1;
let talk = 0;

function segBox(ax, az, bx, bz, ox, oz, hx, hz) {
  if (hx <= 0 || hz <= 0) return false;
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const axes = [
    [dx, ax, ox - hx, ox + hx],
    [dz, az, oz - hz, oz + hz]
  ];
  for (const [dd, aa, mn, mx] of axes) {
    if (Math.abs(dd) < 1e-9) {
      if (aa < mn || aa > mx) return false;
    } else {
      let ta = (mn - aa) / dd, tb = (mx - aa) / dd;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function hiddenFrom(qx, qz, ex, ez) {
  for (const o of OBST) {
    if (segBox(ex, ez, qx, qz, o.x, o.z, o.hx - 0.35, o.hz - 0.35)) return true;
  }
  return false;
}

function angErr(heading, from, to) {
  const dir = { x: to.x - from.x, z: to.z - from.z };
  if (Math.abs(dir.x) < 1e-9 && Math.abs(dir.z) < 1e-9) return 0;
  return Math.abs(V.angleTo(heading, V.norm(dir)));
}

function intercept(me, e) {
  let t = 0.3;
  let ep = { x: e.x, z: e.z };
  for (let i = 0; i < 3; i++) {
    ep = { x: e.x + e.vx * t, z: e.z + e.vz * t };
    const dd = Math.hypot(ep.x - me.x, ep.z - me.z);
    t = 0.3 + Math.max(0, dd - 2.25) / 15;
    if (t > 1.1) t = 1.1;
  }
  ep.x = Math.max(-19.4, Math.min(19.4, ep.x));
  ep.z = Math.max(-19.4, Math.min(19.4, ep.z));
  return ep;
}

function think(p, api) {
  const me = p.self, e = p.enemy;

  if (bornT < 0 || p.t < bornT || p.tick <= 4) {
    bornT = p.t;
    ecd = { laser: 0, blink: 0, jump: 0 };
    side = api.rand() < 0.5 ? -1 : 1;
    sideT = p.t;
    talk = 0;
  }

  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') {
      if (ev.skill === 'laser') ecd.laser = p.t + 2.2;
      else if (ev.skill === 'blink') ecd.blink = p.t + 3.933;
      else if (ev.skill === 'jump') ecd.jump = p.t + 2.8;
    } else if (ev.type === 'blocked') {
      side = -side; sideT = p.t;
    }
  }

  if (!me.alive || !e.alive) return;

  const d = e.dist;
  const eLaser = !!(e.casting && e.casting.skill === 'laser' && e.casting.telegraph);
  const laserSoon = eLaser || (ecd.laser - p.t) < 0.35;
  const eWillAir = e.airborne || !!(e.casting && e.casting.skill === 'jump');

  // ---------- facing ----------
  let facePt = { x: e.x + e.vx * 0.25, z: e.z + e.vz * 0.25 };
  const charging = me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup';
  if (charging) facePt = intercept(me, e);

  // ---------- skills ----------
  let usedCharge = null;
  if (!me.busy && !me.stunned && !me.airborne) {
    const sp = { x: e.x + e.vx * 0.3, z: e.z + e.vz * 0.3 };
    const sd = Math.hypot(sp.x - me.x, sp.z - me.z);
    const maxSmash = 2.9 + me.radius + e.radius;

    const ip = intercept(me, e);
    const idir = V.toward(me, ip);
    const idist = Math.hypot(ip.x - me.x, ip.z - me.z);
    let laneOk = false;
    if (idist > 0.5) {
      const r = api.ray(idir.x, idir.z, Math.min(60, idist + 1));
      laneOk = !r.hit || r.dist >= idist - 1.6;
    }
    const chargeAng = angErr(me.heading, me, ip);
    const wantCharge =
      api.ready('charge') && !eWillAir && !e.invulnerable &&
      d >= 3.0 && d <= 13.5 && laneOk && chargeAng < 0.95 &&
      (eLaser || d > 5.4 || e.hp <= 32);

    if (api.ready('smash') && !eWillAir && sd <= maxSmash - 0.25 &&
        angErr(me.heading, me, sp) < 1.35 && !(eLaser && d > 3.2 && api.ready('charge') && laneOk)) {
      api.use('smash');
      facePt = sp;
    } else if (wantCharge) {
      api.use('charge');
      facePt = ip;
      usedCharge = ip;
    }
  }

  // ---------- movement ----------
  let mv = null;
  if (usedCharge || charging) {
    mv = V.toward(me, facePt);
  } else if (d < 4.4) {
    if (p.t - sideT > 1.05) { side = -side; sideT = p.t; }
    const to = V.toward(me, e);
    const pr = V.perp(to);
    let inward = 0.25;
    if (d > 3.3) inward = 0.8;
    else if (d < 2.5) inward = -0.4;
    const lat = eLaser ? 1.25 : 1.0;
    mv = V.norm({ x: to.x * inward + pr.x * side * lat, z: to.z * inward + pr.z * side * lat });
  } else {
    const path = api.pathTo(e.x, e.z);
    let tgt = { x: e.x, z: e.z };
    if (path && !path.direct && path.points && path.points.length) {
      for (const q of path.points) {
        if (Math.hypot(q.x - me.x, q.z - me.z) > 1.3) { tgt = q; break; }
      }
    }
    let base = V.toward(me, tgt);
    if (Math.abs(base.x) < 1e-9 && Math.abs(base.z) < 1e-9) base = V.toward(me, e);

    const look = 3.6;
    const cands = [0, 0.35 * side, -0.35 * side, 0.8 * side, -0.8 * side, 1.25 * side, -1.25 * side];
    let best = base, bestScore = -1e9;
    for (const a of cands) {
      const dir = V.rot(base, a);
      const qx = Math.max(-19.0, Math.min(19.0, me.x + dir.x * look));
      const qz = Math.max(-19.0, Math.min(19.0, me.z + dir.z * look));
      let sc = 3.2 * (dir.x * base.x + dir.z * base.z);
      const r = api.ray(dir.x, dir.z, look + 0.6);
      if (r.hit && r.dist < 2.7) sc -= 60;
      else if (r.hit && r.dist < 4.0) sc -= 2.5;
      if (laserSoon && d > 6.0 && hiddenFrom(qx, qz, e.x, e.z)) sc += 5.0;
      if (eLaser) sc += 1.6 * Math.abs(Math.sin(a));
      if (a === 0) sc += 0.35;
      if (Math.abs(qx) > 18.4 || Math.abs(qz) > 18.4) sc -= 1.5;
      if (sc > bestScore) { bestScore = sc; best = dir; }
    }
    mv = best;
  }

  if (mv) api.move(mv.x, mv.z);
  api.faceAt(facePt.x, facePt.z);

  if (p.t - talk > 6.5) {
    talk = p.t;
    api.say(d > 8 ? "come here, little squid" : "no beam beats fists");
  }
}
