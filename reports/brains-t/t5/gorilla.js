function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en.alive) return;

  const dist = en.dist;
  const toEnemy = V.toward(me, en);
  const enemyCasting = en.casting && en.casting.skill === 'laser' && en.casting.telegraph;

  // ---- track enemy skill usage times ----
  for (const e of p.events) {
    if (e.type === 'enemyStarted') {
      api.remember('last_' + e.skill, p.t);
      if (e.skill === 'laser') api.remember('laserCount', api.recall('laserCount', 0) + 1);
    }
    if (e.type === 'damaged') api.remember('lastHurt', p.t);
  }

  const lastBlink = api.recall('last_blink', -99);
  const blinkReady = (p.t - lastBlink) > 3.9;

  // ---------- helpers ----------
  const angDiff = (h, dir) => Math.abs(V.angleTo(h, dir));
  const facingErr = angDiff(me.heading, toEnemy);

  // smash reach: centre-to-centre max 5.15
  const SMASH_MAX = 5.15;
  const smashCone = (d) => (55 * Math.PI / 180) + Math.asin(Math.min(0.999, en.radius / Math.max(d, en.radius + 0.01)));

  // ---------- if busy, only manage facing ----------
  if (me.casting) {
    const c = me.casting;
    if (c.skill === 'smash') {
      // keep aiming where they will be
      const fut = { x: en.x + en.vx * 0.12, z: en.z + en.vz * 0.12 };
      api.faceAt(fut.x, fut.z);
      if (dist > 3.2) api.move(toEnemy.x, toEnemy.z);
      else api.move(toEnemy.x * 0.4, toEnemy.z * 0.4);
      return;
    }
    if (c.skill === 'charge') {
      if (c.phase === 'windup') {
        // aim at lead point
        const lead = { x: en.x + en.vx * 0.35, z: en.z + en.vz * 0.35 };
        api.faceAt(lead.x, lead.z);
      } else {
        api.faceAt(en.x, en.z);
      }
      return;
    }
    if (c.skill === 'jump') {
      api.faceAt(en.x, en.z);
      return;
    }
  }
  if (me.stunned || me.airborne) {
    api.faceAt(en.x, en.z);
    return;
  }

  // ---------- default facing ----------
  api.faceAt(en.x, en.z);

  // ---------- 1. SMASH when in range ----------
  if (api.ready('smash') && !en.airborne) {
    // predict where they are in 0.3s
    const px = en.x + en.vx * 0.3, pz = en.z + en.vz * 0.3;
    const pd = Math.hypot(px - me.x, pz - me.z);
    const dirP = V.norm({ x: px - me.x, z: pz - me.z });
    // facing after windup: we can turn 0.55*4*0.3 = 0.66 rad
    const need = angDiff(me.heading, dirP);
    const canTurn = 0.66;
    const resid = Math.max(0, need - canTurn);
    if (pd <= SMASH_MAX - 0.25 && resid < smashCone(pd) - 0.15 && !en.invulnerable) {
      api.use('smash');
      api.faceAt(px, pz);
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
  }

  // ---------- 2. CHARGE ----------
  // charge dash: 15 m/s up to 0.8s => 12m. Good from ~4 to 11 m with LoS.
  if (api.ready('charge') && en.visible && !en.airborne) {
    const lead = { x: en.x + en.vx * 0.4, z: en.z + en.vz * 0.4 };
    const dirL = V.norm({ x: lead.x - me.x, z: lead.z - me.z });
    const need = angDiff(me.heading, dirL);
    const turnAvail = 0.85 * me.turnRate * 0.3; // ~1.02 rad
    const ld = Math.hypot(lead.x - me.x, lead.z - me.z);
    const goodDist = dist > 3.6 && dist < 11.5;
    // ray check the path is clear
    let clear = true;
    const r = api.ray(dirL.x, dirL.z, Math.min(ld, 12));
    if (r && r.hit && r.dist < ld - 0.8) clear = false;
    // prefer charging when they're casting laser (interrupt) or just in range
    if (goodDist && clear && need < turnAvail + 0.35 && !en.invulnerable) {
      api.use('charge');
      api.faceAt(lead.x, lead.z);
      return;
    }
  }

  // ---------- 3. Dodge the laser ----------
  if (enemyCasting) {
    const rem = en.casting.remaining;
    // Beam fires along their facing at fire instant. Their turn rate while casting: 6*0.35=2.1 rad/s
    const enDir = V.fromHeading(en.heading);
    const toMe = V.toward(en, me);
    const off = V.angleTo(en.heading, toMe); // signed
    // strafe perpendicular, away from their turn direction
    const perp = V.perp(toEnemy);
    // move to the side that increases angular offset
    let side = off > 0 ? 1 : -1;
    // choosing perpendicular direction: perp is toEnemy rotated quarter turn
    let strafe = V.scale(perp, side);
    // jump does NOT dodge laser (height not consulted). Use blocks / distance.
    // If very close, better to just smash them.
    if (dist < 5.6 && api.ready('smash') && !en.invulnerable) {
      api.use('smash');
      api.move(toEnemy.x, toEnemy.z);
      return;
    }
    // try to break LoS by moving toward a nearby block edge
    const cover = findCover(p, api, me, en);
    if (cover && rem > 0.15) {
      api.moveTo(cover.x, cover.z);
      return;
    }
    // otherwise strafe hard perpendicular while closing a bit
    const mv = V.norm({ x: strafe.x * 1.0 + toEnemy.x * 0.55, z: strafe.z * 1.0 + toEnemy.z * 0.55 });
    const tgt = { x: me.x + mv.x * 4, z: me.z + mv.z * 4 };
    if (Math.abs(tgt.x) > 19 || Math.abs(tgt.z) > 19) {
      const mv2 = V.norm({ x: -strafe.x + toEnemy.x * 0.6, z: -strafe.z + toEnemy.z * 0.6 });
      api.move(mv2.x, mv2.z);
    } else {
      api.move(mv.x, mv.z);
    }
    return;
  }

  // ---------- 4. Approach ----------
  // Close the gap. Use zigzag when far and visible to make laser aiming hard.
  if (dist > 5.0) {
    // If enemy not visible, path to them
    if (!en.visible) {
      const path = api.pathTo(en.x, en.z);
      if (path && path.points && path.points.length) {
        const wp = path.points[0];
        api.moveTo(wp.x, wp.z);
      } else {
        api.move(toEnemy.x, toEnemy.z);
      }
      return;
    }
    // visible: serpentine approach
    const phase = Math.sin(p.t * 2.4 + api.recall('phaseOff', 0));
    const perp = V.perp(toEnemy);
    const lat = dist > 9 ? 0.75 : 0.45;
    let mv = V.norm({ x: toEnemy.x + perp.x * phase * lat, z: toEnemy.z + perp.z * phase * lat });
    // avoid walls
    const nx = me.x + mv.x * 2.5, nz = me.z + mv.z * 2.5;
    if (Math.abs(nx) > 18.5 || Math.abs(nz) > 18.5) {
      mv = V.norm({ x: toEnemy.x - perp.x * phase * lat, z: toEnemy.z - perp.z * phase * lat });
    }
    api.move(mv.x, mv.z);
    return;
  }

  // ---------- 5. Close range brawl ----------
  // Stay glued. Smash on cooldown.
  if (dist > 2.6) {
    api.move(toEnemy.x, toEnemy.z);
  } else {
    // circle slightly to stay in cone and press
    const perp = V.perp(toEnemy);
    const s = ((Math.floor(p.t * 0.7) % 2) === 0) ? 1 : -1;
    const mv = V.norm({ x: toEnemy.x * 0.85 + perp.x * s * 0.5, z: toEnemy.z * 0.85 + perp.z * s * 0.5 });
    api.move(mv.x, mv.z);
  }
}

function findCover(p, api, me, en) {
  let best = null, bestD = 1e9;
  for (const o of p.arena.obstacles) {
    // candidate points just behind the block relative to enemy
    const dir = V.toward(en, { x: o.x, z: o.z });
    const ext = Math.max(o.hx, o.hz) + 1.9;
    const cand = { x: o.x + dir.x * ext, z: o.z + dir.z * ext };
    if (Math.abs(cand.x) > 19 || Math.abs(cand.z) > 19) continue;
    const d = Math.hypot(cand.x - me.x, cand.z - me.z);
    if (d > 7.5) continue;
    if (api.los(cand.x, cand.z) === false && d > 3) continue;
    if (d < bestD) { bestD = d; best = cand; }
  }
  return best;
}
