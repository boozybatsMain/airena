// Single-process measurement harness for the mechanics audit. No workers, no server.
import { createWorld, step } from '/Users/boozybats/Public/Repos/work/Airena/src/core/sim.js';
import { compileKit } from '/Users/boozybats/Public/Repos/work/Airena/src/skills/compile.js';
import { DEFAULT_BUILD, DT, normalizeBuild } from '/Users/boozybats/Public/Repos/work/Airena/src/core/config.js';

const R = '/Users/boozybats/Public/Repos/work/Airena';
export const REPO = R;

const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };

/** A spammer pilot: hold a distance, face (leading for projectiles), fire skills by priority. */
export function spammer({ hold = 9, prio = null, lead = true, lobMetres = true, kiteAway = true } = {}) {
  return {
    tick(p, api) {
      const me = p.self, en = p.enemy;
      if (!me.alive || !en) return;
      const names = prio || me.skills;
      const kit = me.kit || {};
      // facing: lead for bolt/lob, else at enemy
      let fx = en.x, fz = en.z;
      const first = names.map((n) => kit[n]).find((k) => k && api.ready(k.id || '') === false ? false : true);
      // choose skill
      let chosen = null;
      for (const n of names) {
        const k = kit[n]; if (!k) continue;
        if (!api.ready(n)) continue;
        // range gate
        let reach = Infinity;
        if (k.kind === 'beam') reach = k.range + en.radius + me.radius;
        else if (k.kind === 'cone') reach = k.range + en.radius;
        else if (k.kind === 'bolt') reach = k.range + en.radius;
        else if (k.kind === 'lob') reach = k.range + k.splash + en.radius;
        else if (k.kind === 'zone') reach = k.range + k.radius + en.radius;
        else if (k.kind === 'dash') reach = k.distance + en.radius + me.radius;
        if (en.dist > reach) continue;
        if ((k.kind === 'beam' || k.kind === 'cone') && !en.visible) continue;
        chosen = k; chosen.name = n; break;
      }
      if (chosen && lead && (chosen.kind === 'bolt' || chosen.kind === 'lob')) {
        const sp = chosen.speed || 22;
        const tf = en.dist / sp + (chosen.windup || 0);
        fx = en.x + en.vx * tf; fz = en.z + en.vz * tf;
      }
      api.faceAt(fx, fz);
      if (chosen) {
        if (chosen.kind === 'blink') {
          const [ux, uz] = norm(me.x - en.x, me.z - en.z);
          if (kiteAway && en.dist < hold) api.use(chosen.name, ux, uz); else api.use(chosen.name, -ux, -uz);
        } else if (chosen.kind === 'lob' && lobMetres) {
          api.use(chosen.name, Math.hypot(fx - me.x, fz - me.z));
        } else api.use(chosen.name);
      }
      // movement: hold distance, step out of enemy zones
      const zone = (p.arena.zones || []).find((z) => !z.mine && Math.hypot(z.x - me.x, z.z - me.z) < z.r + me.radius + 0.5);
      if (zone) {
        const [ux, uz] = norm(me.x - zone.x, me.z - zone.z);
        api.move(ux, uz); return;
      }
      if (en.dist > hold + 1.0) api.moveTo(en.x, en.z);
      else if (en.dist < hold - 1.0) { const [ux, uz] = norm(me.x - en.x, me.z - en.z); api.move(ux, uz); }
      else api.stop();
    },
  };
}

/** Run one match with per-tick probes. */
export function run({ kits, brains, builds = null, seed = 1, cd = 3, cdOverride = null, probe = null, maxT = 50 }) {
  const compiled = {};
  for (const side of ['blue', 'orange']) {
    const out = compileKit(kits[side], { fixedCooldown: cd });
    if (out.problems.length) throw new Error(side + ' ' + JSON.stringify(out.problems));
    if (cdOverride) for (const d of Object.values(out.defs)) d.cooldown = cdOverride(d);
    compiled[side] = out.defs;
  }
  const b = builds ? { blue: normalizeBuild(builds.blue).build, orange: normalizeBuild(builds.orange).build } : null;
  const world = createWorld(seed, { kits: compiled, builds: b });
  const think = (id, p, api) => { brains[id].tick(p, api); return null; };
  const m = {
    t: 0, stunT: { blue: 0, orange: 0 }, silT: { blue: 0, orange: 0 }, rootT: { blue: 0, orange: 0 }, blindT: { blue: 0, orange: 0 },
    shieldT: { blue: 0, orange: 0 }, burnT: { blue: 0, orange: 0 }, inZoneT: { blue: 0, orange: 0 }, maxZones: 0, maxWalls: 0,
    airT: { blue: 0, orange: 0 }, busyT: { blue: 0, orange: 0 }, boostT: { blue: 0, orange: 0 }, weakT: { blue: 0, orange: 0 },
  };
  let guard = 0;
  while (!world.done && guard++ < maxT * 30 + 8) {
    step(world, think);
    if (probe) probe(world, m);
    for (const id of ['blue', 'orange']) {
      const f = world.fighters[id]; const st = f.status;
      if (f.stun > 0) m.stunT[id] += DT;
      if (st && st.silence > world.t) m.silT[id] += DT;
      if (st && st.root > world.t) m.rootT[id] += DT;
      if (st && st.blind > world.t) m.blindT[id] += DT;
      if (st && st.shield > 0) m.shieldT[id] += DT;
      if (st && st.burn && st.burn.until > world.t) m.burnT[id] += DT;
      if (st && Object.keys(st.boost).length) m.boostT[id] += DT;
      if (st && Object.keys(st.weaken).length) m.weakT[id] += DT;
      if (f.y > 0.35) m.airT[id] += DT;
      if (f.act) m.busyT[id] += DT;
      const inz = (world.zones || []).some((z) => z.who !== id && Math.hypot(z.x - f.x, z.z - f.z) <= z.r + f.def.radius);
      if (inz) m.inZoneT[id] += DT;
    }
    m.maxZones = Math.max(m.maxZones, (world.zones || []).length);
    m.maxWalls = Math.max(m.maxWalls, world.obstacles.filter((o) => o.temporary).length);
  }
  const f = (id) => {
    const x = world.fighters[id];
    const uses = Object.values(x.stats.uses).reduce((a, b) => a + b, 0);
    const hits = Object.values(x.stats.hits).reduce((a, b) => a + b, 0);
    const heal = world.log.filter((e) => e.type === 'heal' && e.who === id).reduce((a, e) => a + e.amount, 0);
    return { hp: +x.hp.toFixed(1), uses, hits, dealt: +x.stats.damageDealt.toFixed(1), taken: +x.stats.damageTaken.toFixed(1), healed: +heal.toFixed(1), usesBy: x.stats.uses, hitsBy: x.stats.hits, missBy: x.stats.misses };
  };
  return { t: +world.t.toFixed(2), winner: world.winner, reason: world.reason, blue: f('blue'), orange: f('orange'), m, world };
}

export function avg(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
export function summarise(rs, label) {
  const t = avg(rs.map((r) => r.t));
  const wb = rs.filter((r) => r.winner === 'blue').length, wo = rs.filter((r) => r.winner === 'orange').length;
  const cps = (id) => avg(rs.map((r) => r[id].uses / r.t));
  const hps = (id) => avg(rs.map((r) => r[id].hits / r.t));
  const up = (k, id) => avg(rs.map((r) => r.m[k][id] / r.t));
  const line = `${label.padEnd(44)} t=${t.toFixed(1)}s  blue ${wb}/orange ${wo}/draw ${rs.length - wb - wo}  casts/s B ${cps('blue').toFixed(2)} O ${cps('orange').toFixed(2)}  hits/s B ${hps('blue').toFixed(2)} O ${hps('orange').toFixed(2)}`;
  const st = `    uptime on ORANGE: stun ${(up('stunT', 'orange') * 100).toFixed(0)}% sil ${(up('silT', 'orange') * 100).toFixed(0)}% root ${(up('rootT', 'orange') * 100).toFixed(0)}% blind ${(up('blindT', 'orange') * 100).toFixed(0)}% inZone ${(up('inZoneT', 'orange') * 100).toFixed(0)}% weak ${(up('weakT', 'orange') * 100).toFixed(0)}% | on BLUE: shield ${(up('shieldT', 'blue') * 100).toFixed(0)}% boost ${(up('boostT', 'blue') * 100).toFixed(0)}% busy ${(up('busyT', 'blue') * 100).toFixed(0)}%  | maxZones ${Math.max(...rs.map((r) => r.m.maxZones))} maxWalls ${Math.max(...rs.map((r) => r.m.maxWalls))}  healedB ${avg(rs.map((r) => r.blue.healed)).toFixed(0)} dealtB ${avg(rs.map((r) => r.blue.dealt)).toFixed(0)} dealtO ${avg(rs.map((r) => r.orange.dealt)).toFixed(0)}`;
  return line + '\n' + st;
}
