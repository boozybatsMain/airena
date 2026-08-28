function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEn = V.toward(me, en);

  // --- track enemy laser casts / blinks
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      if (e.skill === 'laser') lastLaserStart = p.t;
      if (e.skill === 'blink') lastBlink = p.t;
    }
    if (e.type === 'damaged' && e.skill === 'laser') lastHitByLaser = p.t;
  }

  const enCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---------- strafe sign management ----------
  if (p.t - strafeSwitch > 1.1) {
    strafeSwitch = p.t;
    strafeSign = api.rand() < 0.5 ? 1 : -1;
  }
  for (const e of p.events) {
    if (e.type === 'blocked') { strafeSign = -strafeSign; strafeSwitch = p.t; }
  }

  // ---------- always face the enemy (or lead) ----------
  const busyLocked = me.casting && (me.casting.skill === 'charge') && me.casting.phase !== 'windup';
  if (!busyLocked) api.faceAt(en.x, en.z);

  // ---------- SMASH: highest priority when in range ----------
  const smashCenterReach = me.radius + 2.9 + en.radius; // 5.15
  const predictedDist = (() => {
    // where will they be in 0.28s
    const fx = en.x + en.vx * 0.28, fz = en.z + en.vz * 0.28;
    return Math.hypot(fx - me.x - me.vx * 0.28, fz - me.z - me.vz * 0.28);
  })();

  if (api.ready('smash') && !me.busy && !me.airborne && !en.airborne &&
      !en.invulnerable && en.visible &&
      (dist < smashCenterReach - 0.35 || predictedDist < smashCenterReach - 0.5)) {
    // must be roughly facing
    const ang = Math.abs(V.angleTo(me.heading, toEn));
    if (ang < 1.1) {
      api.use('smash');
      api.move(toEn.x, toEn.z);
      return;
    }
  }

  // ---------- CHARGE: closing tool ----------
  if (api.ready('charge') && !me.busy && !me.airborne && en.visible) {
    const good = dist > 3.2 && dist < 13.5;
    // extra eager if they are casting laser (interrupt) or stunned
    const eager = enCasting || en.stunned;
    if (good && (eager || dist < 11.5)) {
      // aim at lead point for the dash (0.28 windup + travel)
      const travelT = 0.28 + Math.max(0, (dist - 2) / 15);
      const lead = { x: en.x + en.vx * travelT * 0.7, z: en.z + en.vz * travelT * 0.7 };
      if (api.los(lead.x, lead.z) || api.los(en.x, en.z)) {
        api.faceAt(lead.x, lead.z);
        api.use('charge');
        api.move(lead.x - me.x, lead.z - me.z);
        return;
      }
    }
  }

  // during charge windup, keep aiming lead
  if (me.casting && me.casting.skill === 'charge' && me.casting.phase === 'windup') {
    const travelT = 0.28 + Math.max(0, (dist - 2) / 15);
    const lead = { x: en.x + en.vx * travelT * 0.7, z: en.z + en.vz * travelT * 0.7 };
    api.faceAt(lead.x, lead.z);
    return;
  }

  // ---------- dodge the beam ----------
  // If they are casting laser and we're in the open, break line or move perpendicular
  if (enCasting && en.casting.remaining < 0.75) {
    const perp = V.perp(toEn);
    const side = strafeSign;
    // jump to avoid? no, laser is not a ground sweep. Move perpendicular hard.
    let dir = { x: perp.x * side, z: perp.z * side };
    // bias slightly toward enemy so we keep closing
    dir = V.norm(V.add(V.scale(dir, 1.0), V.scale(toEn, dist > 6 ? 0.55 : -0.1)));
    const probe = { x: me.x + dir.x * 3.0, z: me.z + dir.z * 3.0 };
    if (Math.abs(probe.x) > 19 || Math.abs(probe.z) > 19) {
      strafeSign = -strafeSign;
      dir = { x: -dir.x, z: -dir.z };
    }
    api.move(dir.x, dir.z);
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- main approach ----------
  // Close distance; use cover-breaking pathing when not visible.
  if (!en.visible) {
    const path = api.pathTo(en.x, en.z);
    if (path && path.points && path.points.length) {
      const wp = path.points[0];
      api.moveTo(wp.x, wp.z);
    } else {
      api.move(toEn.x, toEn.z);
    }
    api.faceAt(en.x, en.z);
    return;
  }

  // Visible: approach with a serpentine so the beam has to lead us.
  const perp = V.perp(toEn);
  let wobble = Math.sin(p.t * 3.1) * (dist > 4 ? 0.75 : 0.3);
  let dir = V.norm({
    x: toEn.x + perp.x * wobble * strafeSign,
    z: toEn.z + perp.z * wobble * strafeSign
  });

  if (dist < 2.6) {
    // too close and smash on cooldown — orbit rather than shove
    dir = V.norm({
      x: perp.x * strafeSign + toEn.x * 0.15,
      z: perp.z * strafeSign + toEn.z * 0.15
    });
  }

  // wall avoidance
  const ahead = { x: me.x + dir.x * 2.5, z: me.z + dir.z * 2.5 };
  const lim = 18.6;
  if (Math.abs(ahead.x) > lim || Math.abs(ahead.z) > lim) {
    const inward = V.norm({ x: -me.x, z: -me.z });
    dir = V.norm({ x: dir.x + inward.x * 1.4, z: dir.z + inward.z * 1.4 });
  }

  api.move(dir.x, dir.z);
  api.faceAt(en.x, en.z);

  if (p.t - lastSay > 6) {
    lastSay = p.t;
    api.say(SAYINGS[(sayIdx++) % SAYINGS.length]);
  }
}

let strafeSign = 1;
let strafeSwitch = 0;
let lastLaserStart = -99;
let lastBlink = -99;
let lastHitByLaser = -99;
let lastSay = -99;
let sayIdx = 0;
const SAYINGS = [
  "eight arms, one grip",
  "come closer, calamari",
  "the beam is slow. I am not",
  "smash",
  "no water here"
];
