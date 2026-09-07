// Mind for the blue fighter. We assume the default kit given in the prompt
// (k1 = lob mortar, k2 = fire disc, k3 = self shield+heal) because the live
// numbers in p.self.kit / p.enemy.kit are the source of truth. We read them
// every thought so the same brain still works if the kit is swapped between
// matches.

const DEAD = 0.0001;
const ENGAGE = 24;            // start using k2 zones once closer than this
const SAFE = 7.5;             // try not to fight inside our own radius
const MAXHP_ME = 156;
const MAXHP_EN = 180;

// state held across thoughts
let state = { lastK3: 0, lastK2: 0, lastK1: 0, lastZone: null, facingEnemy: false };

function sign(x) { return x < 0 ? -1 : (x > 0 ? 1 : 0); }

function me(p) { return p.self; }
function en(p) { return p.enemy; }

// nearest free landing spot toward the enemy along our facing (avoids the
// minimum-distance clamp by just aiming at the enemy directly; the engine
// clamps it for us). We prefer the enemy's current position.
function aimK1(p) {
  const e = en(p), s = me(p);
  // aim a little ahead of the enemy so it intercepts a strafer
  if (e.visible && s.casting && s.casting.skill === 'k1') return { x: e.x, z: e.z };
  return { x: e.x, z: e.z };
}

function distToEnemy(p) {
  return me(p).dist ? me(p).dist : Math.hypot(me(p).x - en(p).x, me(p).z - en(p).z);
}

function canCast(p, name) {
  return me(p).alive && !me(p).stunned && !me(p).silenced && !me(p).airborne
     && !me(p).busy && api.ready(name);
}

function useK3(p) {
  // shield+heal: always worth casting on cooldown when we are below ~60% hp
  if (!canCast(p, 'k3')) return;
  const s = me(p);
  const missing = s.maxHp - s.hp;
  const want = Math.max(5, Math.min(15, 0.15 * missing));
  // shield is 9 hp, heal is want hp. Cast unless we are nearly full and already shielded.
  if (s.hp < s.maxHp * 0.7 || s.shield < 5) {
    api.use('k3');
  }
}

function useK1(p) {
  if (!canCast(p, 'k1')) return;
  const kit = me(p).kit.k1;
  if (!kit) return;
  const e = en(p), s = me(p);
  const d = Math.hypot(s.x - e.x, s.z - e.z);
  if (d > kit.range + kit.splash + e.radius) return; // out of reach
  // aim slightly ahead of enemy movement
  const aim = (e.visible) ? { x: e.x, z: e.z } : { x: e.x + e.vx, z: e.z + e.vz };
  api.use('k1', aim);
}

function useK2(p) {
  if (!canCast(p, 'k2')) return;
  const kit = me(p).kit.k2;
  if (!kit) return;
  const e = en(p), s = me(p);
  const d = Math.hypot(s.x - e.x, s.z - e.z);
  if (d > kit.range + kit.radius + e.radius) return;
  // place the disc near the enemy's feet
  api.use('k2', { x: e.x, z: e.z });
}

function pickRetreatDir(p, awayFrom) {
  // step back from where we are facing enemy
  const ang = Math.atan2(me(p).x - awayFrom.x, me(p).z - awayFrom.z);
  return { x: Math.sin(ang), z: Math.cos(ang) };
}

function planMove(p) {
  const s = me(p), e = en(p);
  if (!s.alive) { api.stop(); return; }
  const d = distToEnemy(p);

  // if we are very close, back off a bit while still casting
  if (d < SAFE) {
    const back = pickRetreatDir(p, e);
    api.move(back.x, back.z);
    return;
  }

  // otherwise close to a comfortable fighting distance
  if (d > ENGAGE) {
    api.moveTo(e.x, e.z);
    return;
  }

  // comfortable range: stop and strafe a little to make us harder to hit
  api.stop();
}

function think(p, api) {
  const s = me(p);

  if (!s.alive) return;

  // 1. survival: keep k3 on cooldown when hurt
  useK3(p);

  // 2. offensive: k1 mortar at the enemy, k2 fire disc under the enemy
  useK1(p);
  useK2(p);

  // 3. move into a good range and strafe
  planMove(p);

  // 4. face the enemy so our k1/k2 aim with our facing as a fallback
  api.faceAt(en(p).x, en(p).z);

  // short morale taunt
  if (p.t > 0 && Math.floor(p.t * 15) % 75 === 0) {
    api.say("You're glowing.");
  }
}