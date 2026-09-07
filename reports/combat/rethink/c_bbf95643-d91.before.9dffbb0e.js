function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive || !en) return;

  const dist = en.dist;
  const kit = me.kit || {};
  const beams = me.skills.filter(s => kit[s] && kit[s].kind === 'beam');
  const boost = me.skills.find(s => kit[s] && (kit[s].effects || []).some(e => (e.id || e) === 'boost' || (e.type || '') === 'boost'));

  // pick damage beam first, burn beam second
  let dmgBeam = null, burnBeam = null;
  for (const s of beams) {
    const eff = JSON.stringify(kit[s].effects || '');
    if (eff.indexOf('burn') >= 0) burnBeam = burnBeam || s;
    else dmgBeam = dmgBeam || s;
  }
  if (!dmgBeam && beams.length) dmgBeam = beams[0];

  // aim lead: beams are instant at strike, but enemy moves during windup
  const wind = dmgBeam ? (kit[dmgBeam].windup || 0.5) : 0.5;
  const aim = { x: en.x + en.vx * wind * 0.75, z: en.z + en.vz * wind * 0.75 };

  const clear = api.los(en.x, en.z);
  const aimClear = api.los(aim.x, aim.z);

  // effective range guess
  const baseRange = dmgBeam ? (kit[dmgBeam].range || 24) : 24;
  const boosted = me.busy === false && false;
  const reach = baseRange + 3.2;

  if (!me.busy && !me.stunned && !me.silenced) {
    // boost when it's about to matter
    if (boost && api.ready(boost) && dist > baseRange * 0.9 && clear) {
      api.use(boost);
    } else if (clear && aimClear && dist < reach) {
      if (dmgBeam && api.ready(dmgBeam)) api.use(dmgBeam, aim);
      else if (burnBeam && api.ready(burnBeam) && !en.burning) api.use(burnBeam, aim);
      else if (burnBeam && api.ready(burnBeam) && dist < reach) api.use(burnBeam, aim);
    }
  }

  // movement: keep line of sight, hold mid range, strafe
  const t = p.t;
  let side = Math.sin(t * 0.7) > 0 ? 1 : -1;
  const toE = V.toward(me, en);
  const perp = V.perp(toE);

  if (!clear) {
    api.moveTo(en.x, en.z);
  } else {
    const want = 13;
    let radial = 0;
    if (dist > want + 3) radial = 1;
    else if (dist < want - 4) radial = -1;
    const dir = V.norm(V.add(V.scale(toE, radial), V.scale(perp, side * 1.0)));
    let nx = me.x + dir.x * 4, nz = me.z + dir.z * 4;
    const lim = 18.5;
    nx = Math.max(-lim, Math.min(lim, nx));
    nz = Math.max(-lim, Math.min(lim, nz));
    api.move(nx - me.x, nz - me.z);
  }

  if (!me.casting) api.faceAt(en.x, en.z);

  if (!memSaid && p.t > 1) { memSaid = true; api.say("Line up. Burn down."); }
}

let memSaid = false;