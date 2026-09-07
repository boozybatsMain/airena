function think(p, api) {
  const S = p.self, E = p.enemy;
  let mem = api.recall('m', { lastLaser: -99, lastBolt: -99, wantBlink: false });
  const say = (t) => { if (api.recall('ls', '') !== t) { api.remember('ls', t); api.say(t); } };

  // events
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted' && ev.skill === 'k1' && ev.windup <= 0.7) mem.wantBlink = true;
    if (ev.type === 'blinked') mem.wantBlink = false;
    if (ev.type === 'refused' && ev.skill === 'k2') mem.wantBlink = false;
    if (ev.type === 'damaged') mem.hitAt = p.t;
  }

  const d = E.dist;
  const aim = V.toward(S, E);
  const away = V.away(E, S);

  // facing: track enemy when visible
  if (E.visible) api.faceAt(E.x, E.z);

  // blink away from incoming laser windup
  if (mem.wantBlink && api.ready('k2')) {
    const bx = S.x + away.x * 7.5, bz = S.z + away.z * 7.5;
    api.use('k2',
      Math.max(-19, Math.min(19, bx)) - S.x,
      Math.max(-19, Math.min(19, bz)) - S.z);
    say('Чернила в глаза — я исчезаю!');
  }

  // attack
  if (E.visible && d < 23 && api.ready('k1') && !S.busy && !S.stunned) {
    api.use('k1');
    mem.lastLaser = p.t;
    say('Луч!');
  }
  if (E.visible && d > 6 && d < 17 && api.ready('k3') && !S.busy) {
    const lead = V.lead(S, E, { x: E.vx, z: E.vz }, 22);
    const lv = V.toward(S, lead);
    api.use('k3', lv.x, lv.z);
    mem.lastBolt = p.t;
  }

  // movement: kite — keep ~14 m, strafe perpendicular, use obstacles
  let mv;
  const ideal = 14;
  const perp = V.perp(aim);
  const strafeDir = (Math.floor(p.t / 2.5) % 2 === 0) ? 1 : -1;
  if (d > ideal + 3) mv = { x: aim.x * 1.2 + perp.x * 0.4 * strafeDir, z: aim.z * 1.2 + perp.z * 0.4 * strafeDir };
  else if (d < ideal - 4) mv = { x: away.x * 1.2 + perp.x * 0.4 * strafeDir, z: away.z * 1.2 + perp.z * 0.4 * strafeDir };
  else mv = { x: perp.x * strafeDir, z: perp.z * strafeDir };

  // break line of sight when hurt / reposition near blocks when Gorilla charges
  if (E.busy && d < 9) {
    // incoming charge — sidestep hard
    mv = { x: perp.x * strafeDir * 1.5, z: perp.z * strafeDir * 1.5 };
  }

  // stay in arena
  if (Math.abs(S.x) > 17.5) mv.x -= Math.sign(S.x) * 1;
  if (Math.abs(S.z) > 17.5) mv.z -= Math.sign(S.z) * 1;

  api.move(mv.x, mv.z);
  api.remember('m', mem);
}