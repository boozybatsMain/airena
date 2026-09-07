const CD = { k1: 11.733, k2: 12.4, k3: 6.333 };
const enemyLast = { k1: -99, k2: -99, k3: -99 };
let lastSay = -99;
let sayIdx = 0;
const LINES = [
  'Иди сюда, мешок с чернилами.',
  'Кости хрустят вкусно.',
  'Беги. Мне нравится догонять.',
  'Тебя мало. Меня много.',
  'Восемь рук — восемь ошибок.'
];

function chat(api, p, force) {
  if (p.t - lastSay < 6 && !force) return;
  lastSay = p.t;
  api.say(LINES[sayIdx++ % LINES.length]);
}

function blendEdge(p, dir) {
  const me = p.self;
  const h = p.arena.half;
  let out = { x: dir.x, z: dir.z };
  if (Math.abs(me.x) > h - 5 || Math.abs(me.z) > h - 5) {
    const c = V.norm({ x: -me.x, z: -me.z });
    const w = 0.9;
    out = V.norm({ x: out.x + c.x * w, z: out.z + c.z * w });
  }
  return V.norm(out);
}

function steer(api, dir) {
  const d = V.norm(dir);
  if (d.x === 0 && d.z === 0) { api.stop(); return; }
  const r = api.ray(d.x, d.z, 2.8);
  if (r.hit && r.dist < 2.3) {
    for (const a of [0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4]) {
      const c = V.rot(d, a);
      const rr = api.ray(c.x, c.z, 2.8);
      if (!rr.hit || rr.dist > 2.6) { api.move(c.x, c.z); return; }
    }
  }
  api.move(d.x, d.z);
}

function think(p, api) {
  const me = p.self, en = p.enemy;
  if (!me.alive) return;

  for (const e of p.events) {
    if (e.type === 'enemyStarted' && enemyLast[e.skill] !== undefined) enemyLast[e.skill] = p.t;
    if (e.type === 'dealt' && e.skill === 'k2') chat(api, p, false);
  }

  if (me.stunned) return;

  const d = en.dist;
  const aim = { x: en.x + en.vx * 0.3, z: en.z + en.vz * 0.3 };
  const toAim = V.toward(me, aim);
  const toEn = V.toward(me, en);
  const err = Math.abs(V.angleTo(me.heading, toAim));

  api.faceAt(aim.x, aim.z);

  const cast = en.casting;
  const enK2 = !!(cast && cast.skill === 'k2' && cast.telegraph);
  const enK1 = !!(cast && cast.skill === 'k1' && cast.telegraph);
  const enemyK2Ready = (p.t - enemyLast.k2) >= CD.k2 - 0.3;

  // ---- if we are mid-cast, just keep the body doing the right thing ----
  if (me.busy && me.casting) {
    const s = me.casting.skill;
    if (s === 'k2') {
      if (d > 2.2) steer(api, toEn); else api.stop();
      return;
    }
    if (s === 'k1') { api.stop(); return; }
    // k3: keep positioning below
  }

  const k2r = api.ready('k2');
  const k1r = api.ready('k1');
  const k3r = api.ready('k3');
  const clear = en.visible && !en.airborne && !en.invulnerable;

  // ---- offense ----
  if (!me.busy) {
    if (k2r && clear && err < 0.65 && d <= (en.stunned ? 3.3 : 3.05)) {
      api.use('k2');
      if (d > 2.2) steer(api, toEn); else api.stop();
      return;
    }
    if (k1r && clear && err < 0.32 && d >= 1.4 && d <= 7.4 && (!k2r || en.stunned || d > 4.6)) {
      const r = api.ray(toAim.x, toAim.z, d + 0.5);
      if (!r.hit || r.dist > d - 0.3) {
        api.use('k1');
        api.stop();
        return;
      }
    }
    if (k3r && d < 15 && !enK1 && !enK2 && !(k2r && d < 4.2) && !(en.stunned && k1r && d < 7)) {
      api.use('k3');
      // keep closing while boosting
      if (d > 3.4) {
        if (en.visible) steer(api, toEn); else api.moveTo(en.x, en.z);
      } else api.stop();
      return;
    }
  }

  // ---- evasion ----
  if (enK2 && d < 5.0) {
    const away = blendEdge(p, V.away(me, en));
    steer(api, away);
    return;
  }
  if (enK1 && d < 10.5) {
    const side = V.perp(toEn);
    const a = { x: me.x + side.x * 4, z: me.z + side.z * 4 };
    const b = { x: me.x - side.x * 4, z: me.z - side.z * 4 };
    const ra = api.ray(side.x, side.z, 4.5);
    const rb = api.ray(-side.x, -side.z, 4.5);
    let dir = (ra.dist >= rb.dist) ? side : { x: -side.x, z: -side.z };
    if (Math.abs(a.x) > 19 || Math.abs(a.z) > 19) dir = { x: -side.x, z: -side.z };
    dir = V.norm({ x: dir.x - toEn.x * 0.35, z: dir.z - toEn.z * 0.35 });
    steer(api, blendEdge(p, dir));
    return;
  }

  // ---- positioning ----
  const soonK2 = api.cooldown('k2') < 1.2;
  const aggressive = k2r || soonK2 || k1r || en.stunned || !enemyK2Ready;
  let hold = aggressive ? 2.4 : 4.9;

  if (!en.visible) {
    api.moveTo(en.x, en.z);
    return;
  }

  if (d > hold + 0.7) {
    steer(api, toEn);
  } else if (d < hold - 0.7) {
    steer(api, blendEdge(p, V.away(me, en)));
  } else {
    const side = V.perp(toEn);
    const ra = api.ray(side.x, side.z, 3.5);
    const rb = api.ray(-side.x, -side.z, 3.5);
    const dir = (ra.dist >= rb.dist) ? side : { x: -side.x, z: -side.z };
    steer(api, blendEdge(p, dir));
  }

  if (p.t > 2) chat(api, p, false);
}