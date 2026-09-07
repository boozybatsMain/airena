// Осьминог: восьмирукий стрелок с щупальцами наружу.

const T = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let lastEnemySkill = null;
let lastEnemySkillAt = -99;
let dodgeUntil = -99;
let orbitSign = 1;

const OBST = p => p.arena.obstacles;
function pointInBlock(x, z, pad) {
  for (const o of OBST({arena:{obstacles:[{x:-7,z:-3,hx:1.2,hz:4.27},{x:7,z:3,hx:1.2,hz:3.5},{x:0,z:-10,hx:3.6,hz:1.2},{x:0,z:10,hx:3.6,hz:1.464},{x:-12.5,z:11,hx:1.6,hz:1.6},{x:12.5,z:-11,hx:1.6,hz:1.6}]}})) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}
const BLOCKS = [
  { x: -7, z: -2.46, hx: 1.2, hz: 3.5 },
  { x: 7, z: 3, hx: 1.2, hz: 3.5 },
  { x: 0, z: -10, hx: 3.6, hz: 1.2 },
  { x: 0, z: 10, hx: 3.6, hz: 1.2 },
  { x: -12.5, z: 11, hx: 1.6, hz: 1.6 },
  { x: 15.25, z: -11, hx: 1.6, hz: 1.6 },
];
function inBlock(x, z, pad) {
  for (const o of BLOCKS) if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  return false;
}
function segBlocked(ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  const ux = dx / len, uz = dz / len;
  for (const o of BLOCKS) {
    const tx = o.x - ax, tz = o.z - az;
    const proj = tx * ux + tz * uz;
    const t = clamp(proj, 0, len);
    const cx = ax + ux * t, cz = az + uz * t;
    if (Math.abs(cx - o.x) < o.hx && Math.abs(cz - o.z) < o.hz) {
      if (t > 0.01 || (Math.abs(ax - o.x) < o.hx && Math.abs(az - o.z) < o.hz)) return true;
    }
  }
  return false;
}

// Не стоим в чужой зоне.
function safeSpot(p) {
  let best = null, bestScore = -1e9;
  const e = p.enemy;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 8 + (i % 3) * 2;
    const x = clamp(e.x + Math.sin(a) * r, -19, 19);
    const z = clamp(e.z + Math.cos(a) * r, -19, 19);
    if (inBlock(x, z, 1.2)) continue;
    let sc = -V.dist(p.self, { x, z }) * 0.5;
    for (const zn of p.arena.zones) if (!zn.mine && Math.hypot(x - zn.x, z - zn.z) < zn.r + 1.5) sc -= 20;
    if (segBlocked(p.self.x, p.self.z, x, z)) sc -= 4;
    if (sc > bestScore) { bestScore = sc; best = { x, z }; }
  }
  return best || { x: 0, z: 0 };
}

function think(p, api) {
  const me = p.self, e = p.enemy;

  // Память о том, что горилла запустила.
  for (const ev of p.events) {
    if (ev.type === 'enemyStarted') { lastEnemySkill = ev.skill; lastEnemySkillAt = p.t; }
    if (ev.type === 'damaged') { if (p.t - dodgeUntil < 0.082) dodgeUntil = p.t; }
  }

  const d = e.dist;
  const losTo = api.los(e.x, e.z);

  // --- Уклонение: странный снаряд летит, уходим в сторону. ---
  const incoming = p.arena.projectiles.find(pr => !pr.mine && !pr.arc);
  const now = p.t;
  if (incoming && now > dodgeUntil) {
    const pr = { x: incoming.x, z: incoming.z };
    const toMe = V.sub({ x: me.x, z: me.z }, pr);
    const distToMe = V.len(toMe);
    if (distToMe < 8) {
      const pv = { x: incoming.vx, z: incoming.vz };
      // уходим вбок от траектории
      const perp = V.norm(V.perp(pv));
      const side = V.dot(perp, V.norm(toMe)) >= 0 ? 1 : -1;
      const dir = V.scale(perp, side);
      // предпочтительно двигаться к блоку? нет — просто уходим вбок
      api.move(dir.x, dir.z);
      api.faceAt(e.x, e.z);
      api.say('Щупальца в сторону!');
      dodgeUntil = now + 0.2;
      return;
    }
  }

  // --- Огонь по цели. ---
  const canK1 = api.ready('k1');
  const canK3 = api.ready('k3');
  const canK2 = api.ready('k2');

  const enemyCast = e.casting;

  // --- Стратегия: держим дистанцию 8–12, стреляем k1 в открытую. ---
  const desired = 9;
  const toE = V.toward(me, e);

  if (losTo && canK1 && d < 22) {
    const lead = V.lead(me, e, { x: e.vx, z: e.vz }, 22);
    // Но V.lead тут не для болта — болт летит со скоростью 22.
    const aim = (d > 4) ? lead : { x: e.x, z: e.z };
    const aimDir = V.toward(me, aim);
    const dir = V.fromHeading(T(me, aim));
    api.face(dir.x, dir.z);
    if (Math.abs(V.angleTo(me.heading, dir)) < 0.4) {
      api.use('k1', aim.x, aim.z);
      api.say('Чернильный болт!');
    }
  }

  // --- k3 в упор или на предсказание. ---
  if (canK3 && d < 13.42 && losTo) {
    const lead = V.lead(me, e, { x: e.vx, z: e.vz }, 12);
    if (V.dist(me, lead) < 14.03) {
      const dir = V.fromHeading(T(me, lead));
      api.face(dir.x, dir.z);
      api.use('k3', lead.x, lead.z);
    }
  }

  // --- k2: стена между нами, когда горилла близко или летит. ---
  if (canK2 && d < 16 && losTo) {
    const mid = V.lerp(me, e, 0.75);
    const dir = V.fromHeading(T(me, mid));
    api.face(dir.x, dir.z);
    api.use('k2', mid.x, mid.z);
    api.say('Стена чернил!');
  }

  // --- Движение. ---
  if (!me.stunned) {
    // Не стоим в зонах противника.
    const inDanger = p.arena.zones.some(zn => !zn.mine && Math.hypot(me.x - zn.x, me.z - zn.z) < zn.r + 1);
    if (inDanger) {
      const spot = safeSpot(p);
      api.moveTo(spot.x, spot.z);
    } else if (d > 8) {
      api.move(toE.x, toE.z);
    } else if (d < 7.003) {
      // отходим, но по кругу, чтобы не быть мишенью
      const away = V.away(e, me);
      const perp = V.perp(toE);
      const dir = V.norm(V.add(away, V.scale(perp, orbitSign)));
      api.move(dir.x, dir.z);
      if (p.t - (api.recall('lastFlip', -9)) > 5 && api.rand() < 0.02) {
        orbitSign = -orbitSign;
        api.remember('lastFlip', p.t);
      }
    } else {
      // орбита
      const perp = V.perp(toE);
      const dir = V.norm(V.add(V.scale(toE, (d - 9) * 0.2), V.scale(perp, orbitSign)));
      api.move(dir.x, dir.z);
    }
  }

  // Всегда смотрим на противника, если не кастуем прицельно.
  if (!me.casting) api.faceAt(e.x, e.z);

  // Скажем пару слов, если мир наконец услышал.
  if (p.t < 0.2) api.say('Восемь рук против двух кулаков.');
}