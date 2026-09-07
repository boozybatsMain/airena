/**
 * review-minds — play bake-off minds against the kiter/rusher pilots on the
 * mind's own kit and body, and read the log like a spectator.
 *
 *   node review-minds.mjs --minds=sub-opus-plain/caster,... --pilots=kiter,rusher --seeds=1,2,3 [--timeline=<mind>:<pilot>:<seed>:<side>] [--json=out.json]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/boozybats/Public/Repos/work/Airena';
const { compileBrain } = await import(join(ROOT, 'src/brain/host.js'));
const { runMatch } = await import(join(ROOT, 'src/core/match.js'));
const { compileKit } = await import(join(ROOT, 'src/skills/compile.js'));
const { normalizeBuild, SUDDEN_DEATH_AT } = await import(join(ROOT, 'src/core/config.js'));
const { DELIVERIES, EFFECTS } = await import(join(ROOT, 'src/skills/registry.js'));

const argv = process.argv.slice(2);
const arg = (n, d) => { const e = argv.find((a) => a.startsWith(`--${n}=`)); return e ? e.slice(n.length + 3) : d; };
const MINDS = String(arg('minds', '')).split(',').map((s) => s.trim()).filter(Boolean);
const PILOTS = String(arg('pilots', 'kiter,rusher')).split(',').filter(Boolean);
const SEEDS = String(arg('seeds', '1,2,3')).split(',').map(Number);
const TIMELINE = arg('timeline', null);
const JSON_OUT = arg('json', null);
const SIDES = String(arg('sides', 'blue,orange')).split(',');

const other = (s) => (s === 'blue' ? 'orange' : 'blue');
const wrap = (a) => { let x = a; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const pct = (v) => (v === null || Number.isNaN(v) ? '—' : `${Math.round(v * 100)}%`);

const creatures = JSON.parse(readFileSync(join(ROOT, 'reports/combat/bakeoff/creatures.json'), 'utf8'));
const byId = new Map(creatures.map((c) => [c.id, c]));

function loadMind(key) {
  const [dir, creatureId] = key.split('/');
  const base = join(ROOT, 'reports/combat/bakeoff', dir, creatureId);
  const rec = JSON.parse(readFileSync(`${base}.json`, 'utf8'));
  const c = byId.get(creatureId);
  const kitJson = rec.creature?.kit || c.kit;
  const buildRaw = rec.creature?.build || c.build;
  const compiled = compileKit(kitJson);
  const source = readFileSync(`${base}.js`, 'utf8');
  return { key, creatureId, kit: compiled.defs, build: normalizeBuild(buildRaw).build, brain: compileBrain(source, key), admitted: rec.admitted, source };
}
function loadPilot(name) {
  const file = name === 'stub' ? join(ROOT, 'brains/kit-stub/octopus.js') : join(ROOT, 'brains/pilots', `${name}.js`);
  return { key: `pilot:${name}`, brain: compileBrain(readFileSync(file, 'utf8'), `pilot:${name}`) };
}

const JUDGED = (kind) => DELIVERIES[kind]?.klass === 'targeted' || kind === 'zone';
const TARGETED_ATOM = (id) => EFFECTS[id]?.klass === 'targeted';
const reachOf = (def, me) => {
  switch (def.kind) {
    case 'beam': case 'bolt': case 'lob': return def.range + me.radius;
    case 'cone': return def.range + me.radius;
    case 'zone': return def.range + def.radius;
    case 'dash': return def.distance + me.radius;
    default: return null;
  }
};

function play(mind, pilot, seed, mindSide, { timeline = false } = {}) {
  const pSide = other(mindSide);
  const brains = { [mindSide]: mind.brain, [pSide]: pilot.brain };
  const kits = { [mindSide]: mind.kit, [pSide]: pilot.isMind ? pilot.kit : mind.kit };
  const builds = { [mindSide]: mind.build, [pSide]: pilot.isMind ? pilot.build : mind.build };
  mind.brain.reset(); pilot.brain.reset();

  const frames = [];
  const per = { blue: { alive: 0, still: 0, noAct: 0, idleReady: 0, idleInRange: 0, allCd: 0 }, orange: { alive: 0, still: 0, noAct: 0, idleReady: 0, idleInRange: 0, allCd: 0 } };
  const tg = { blue: { open: null, windows: [] }, orange: { open: null, windows: [] } };
  const lead = { blue: { casts: 0, led: 0, angles: [] }, orange: { casts: 0, led: 0, angles: [] } };
  const shots = []; // bolt/lob fx with launch data
  const impacts = { blue: [], orange: [] };
  let distSum = 0, ticks = 0, brawl = 0, far = 0;
  const closeWindow = (side, s) => {
    const w = tg[side].open; if (!w) return; tg[side].open = null;
    if (w.ticks < 3) return; w.t1 = s ? s.t : w.tLast; tg[side].windows.push(w);
  };
  const onFrame = (s) => {
    frames.push({ t: s.t, tick: s.tick, blue: { x: s.blue.x, z: s.blue.z, vx: s.blue.vx, vz: s.blue.vz, hp: s.blue.hp, act: s.blue.act, ph: s.blue.actPhase, h: s.blue.h, cd: s.blue.cd, alive: s.blue.alive, stun: s.blue.stun, inv: s.blue.inv }, orange: { x: s.orange.x, z: s.orange.z, vx: s.orange.vx, vz: s.orange.vz, hp: s.orange.hp, act: s.orange.act, ph: s.orange.actPhase, h: s.orange.h, cd: s.orange.cd, alive: s.orange.alive, stun: s.orange.stun, inv: s.orange.inv } });
    for (const fx of s.fx) {
      if (fx.kind === 'impact' && !fx.blocked && fx.effects && fx.effects.some(TARGETED_ATOM)) impacts[fx.who].push({ t: fx.t, skill: fx.skill });
      if (fx.kind === 'bolt' || fx.kind === 'lob') {
        const en = s[other(fx.who)];
        const bearing = Math.atan2(en.x - fx.x, en.z - fx.z);
        const aim = fx.kind === 'lob' && fx.x1 !== undefined ? Math.atan2(fx.x1 - fx.x, fx.z1 - fx.z) : fx.h;
        const off = wrap(aim - bearing);
        const enSpeed = Math.hypot(en.vx, en.vz);
        // ideal lead bearing: where a shot at fx.speed meets a target at constant velocity
        let idealOff = null;
        if (fx.kind === 'bolt' && fx.speed) {
          const rx = en.x - fx.x, rz = en.z - fx.z, vx = en.vx, vz = en.vz, sp = fx.speed;
          const a = vx * vx + vz * vz - sp * sp, b = 2 * (rx * vx + rz * vz), cc = rx * rx + rz * rz;
          let tt = null;
          if (Math.abs(a) < 1e-6) tt = -cc / b; else { const disc = b * b - 4 * a * cc; if (disc >= 0) { const t1 = (-b - Math.sqrt(disc)) / (2 * a), t2 = (-b + Math.sqrt(disc)) / (2 * a); tt = [t1, t2].filter((x) => x > 0).sort((p, q) => p - q)[0] ?? null; } }
          if (tt !== null) { const ideal = Math.atan2(rx + vx * tt, rz + vz * tt); idealOff = wrap(ideal - bearing); }
        }
        shots.push({ who: fx.who, kind: fx.kind, t: fx.t, x: fx.x, z: fx.z, x1: fx.x1, z1: fx.z1, aim: fx.aim, speed: fx.speed, h: fx.h, off, idealOff, enSpeed, enX: en.x, enZ: en.z, enVx: en.vx, enVz: en.vz, skill: fx.skill, splash: fx.splash });
        if (enSpeed > 2) { lead[fx.who].casts++; lead[fx.who].angles.push(Math.abs(off)); if (Math.abs(off) > 5 * Math.PI / 180) lead[fx.who].led++; }
        if (fx.kind === 'bolt' && idealOff !== null && Math.abs(idealOff) > 3 * Math.PI / 180) {
          const L = lead[fx.who]; L.needed = (L.needed || 0) + 1;
          const errIdeal = Math.abs(wrap(off - idealOff)), errDirect = Math.abs(off);
          if (errIdeal < errDirect) L.towardIdeal = (L.towardIdeal || 0) + 1;
          (L.errIdeal ||= []).push(errIdeal * 180 / Math.PI);
        }
      }
    }
    if (s.over) { closeWindow('blue', s); closeWindow('orange', s); return; }
    ticks++;
    const dist = Math.hypot(s.blue.x - s.orange.x, s.blue.z - s.orange.z);
    distSum += dist; if (dist < 4) brawl++; if (dist > 12) far++;
    for (const side of ['blue', 'orange']) {
      const f = s[side], opp = s[other(side)], p = per[side];
      const inWindup = opp.alive && opp.act !== null && opp.actPhase === 'windup';
      const w = tg[side].open;
      if (inWindup && f.alive) {
        if (!w || w.act !== opp.act || w.tickLast !== s.tick - 1) {
          closeWindow(side, s);
          tg[side].open = { act: opp.act, t0: s.t, tLast: s.t, tickLast: s.tick, ticks: 1, v0: [f.vx, f.vz], moved: false };
        } else {
          w.tickLast = s.tick; w.tLast = s.t; w.ticks++;
          if (!w.moved) {
            const sp0 = Math.hypot(w.v0[0], w.v0[1]), sp = Math.hypot(f.vx, f.vz);
            if (sp0 > 0.8 && sp > 0.8) { if (Math.abs(wrap(Math.atan2(f.vx, f.vz) - Math.atan2(w.v0[0], w.v0[1]))) > 40 * Math.PI / 180) w.moved = true; }
            else if ((sp0 > 0.8 && sp < 0.3) || (sp0 < 0.3 && sp > 0.8)) w.moved = true;
          }
        }
      } else if (w) closeWindow(side, s);
      if (!f.alive) continue;
      p.alive++;
      const cds = Object.entries(f.cd);
      const anyReady = cds.some(([, c]) => c <= 0), everyCd = cds.every(([, c]) => c > 0);
      if (everyCd) p.allCd++;
      if (Math.hypot(f.vx, f.vz) < 0.3 && !f.stun) p.still++;
      if (f.act === null) {
        p.noAct++;
        if (anyReady) p.idleReady++;
        if (cds.some(([k, c]) => c <= 0 && reachOf(kits[side][k], builds[side]) !== null && dist <= reachOf(kits[side][k], builds[side]) + builds[other(side)].radius)) p.idleInRange++;
      }
    }
  };
  const { result } = runMatch(brains, { seed, kits, builds, onFrame });
  closeWindow('blue', null); closeWindow('orange', null);
  const log = result.log;

  // per side event tallies
  const S = {};
  for (const side of ['blue', 'orange']) S[side] = { uses: {}, miss: {}, missBySkill: {}, refused: {}, refusedBySkill: {}, immune: {}, immuneSkill: {}, immuneWithDamage: 0, immuneNoDamage: 0, dmgBySkill: {}, dmgTotal: 0, evadeBy: 0, interruptsMade: 0, interruptsTaken: 0, say: 0, faults: result[side].faults, thinks: result[side].thinks };
  const dmgAt = { blue: [], orange: [] };
  for (const ev of log) {
    if (ev.type === 'damage') dmgAt[ev.who].push({ t: ev.t, skill: ev.skill, amount: ev.amount });
  }
  // immunity windows on each TARGET side, reconstructed from applied controls
  const CLASSES = { stun: ['act', 'move'], root: ['move'], silence: ['act'], blind: ['sense'] };
  const immuneWin = { blue: {}, orange: {} };
  const immuneLines = log.filter((e) => e.type === 'immune');
  for (const side of ['blue', 'orange']) {
    for (const im of impacts[side]) {
      const def = kits[side][im.skill]; if (!def) continue;
      for (const atom of def.effects) {
        if (!CLASSES[atom.id]) continue;
        const refused = immuneLines.some((l) => l.by === side && l.skill === im.skill && l.effect === atom.id && Math.abs(l.t - im.t) < 0.02);
        if (refused) continue;
        const a = im.t + (atom.duration || 0), z = a + (atom.immune || 3);
        for (const c of CLASSES[atom.id]) (immuneWin[other(side)][c] ||= []).push([a, z]);
      }
    }
  }
  for (const ev of log) {
    const s = S[ev.who];
    switch (ev.type) {
      case 'use': s.uses[ev.skill] = (s.uses[ev.skill] || 0) + 1; break;
      case 'miss': s.miss[ev.reason] = (s.miss[ev.reason] || 0) + 1; s.missBySkill[`${ev.skill}:${ev.reason}`] = (s.missBySkill[`${ev.skill}:${ev.reason}`] || 0) + 1; break;
      case 'refused': s.refused[ev.reason] = (s.refused[ev.reason] || 0) + 1; s.refusedBySkill[`${ev.skill}:${ev.reason}`] = (s.refusedBySkill[`${ev.skill}:${ev.reason}`] || 0) + 1; break;
      case 'immune': {
        const b = S[ev.by]; b.immune[ev.effect] = (b.immune[ev.effect] || 0) + 1; b.immuneSkill[ev.skill] = (b.immuneSkill[ev.skill] || 0) + 1;
        const def = kits[ev.by][ev.skill];
        const carriesDmg = def && def.effects.some((e) => e.id === 'damage' || e.id === 'burn');
        if (carriesDmg) b.immuneWithDamage++; else b.immuneNoDamage++;
        // predictable: was the enemy already immune to this class when the cast was ORDERED?
        const useT = [...log].filter((u) => u.type === 'use' && u.who === ev.by && u.skill === ev.skill && u.t <= ev.t).pop();
        const classes = CLASSES[ev.effect] || [];
        const win = immuneWin[ev.who];
        if (useT && classes.some((c) => win[c] && win[c].some(([a, z]) => useT.t >= a && useT.t <= z))) b.immunePredictable = (b.immunePredictable || 0) + 1;
        break;
      }
      case 'damage': s.dmgBySkill[ev.skill] = (s.dmgBySkill[ev.skill] || 0) + ev.amount; s.dmgTotal += ev.amount; break;
      case 'evade': S[other(ev.who)].evadeBy++; break;
      case 'interrupt': s.interruptsMade++; S[ev.target].interruptsTaken++; break;
      case 'say': s.say++; break;
      default: break;
    }
  }
  // root windows on each target (applied roots = impact with a root atom and no immune line at that instant)
  const rootWin = { blue: [], orange: [] };
  for (const side of ['blue', 'orange']) for (const im of impacts[side]) {
    const def = kits[side][im.skill]; if (!def) continue;
    const atom = def.effects.find((e) => e.id === 'root' || e.id === 'stun'); if (!atom) continue;
    if (log.some((l) => l.type === 'immune' && l.by === side && l.skill === im.skill && l.effect === atom.id && Math.abs(l.t - im.t) < 0.02)) continue;
    rootWin[other(side)].push([im.t, im.t + (atom.duration || 0)]);
  }
  // mortar aim error: distance from landing point to enemy at landing time
  const lobErr = { blue: [], orange: [] };
  for (const sh of shots) {
    if (sh.kind !== 'lob' || sh.x1 === undefined) continue;
    const tLand = sh.t + (sh.aim || 0) / (sh.speed || 12);
    const pinned = rootWin[other(sh.who)].some(([a, z]) => tLand >= a && tLand <= z);
    const fr = frames.find((f) => f.t >= tLand - 0.017) || frames[frames.length - 1];
    const en = fr[other(sh.who)];
    const err = Math.hypot(sh.x1 - en.x, sh.z1 - en.z);
    // error had it been thrown at the enemy's position at launch (no lead)
    const errNoLead = Math.hypot(sh.enX - en.x, sh.enZ - en.z);
    lobErr[sh.who].push({ t: sh.t, err, errNoLead, enSpeed: sh.enSpeed, pinned, hit: err <= (sh.splash || 1.8) + builds[other(sh.who)].radius });
  }
  // cast outcomes (spectate logic, simplified): hit if impact/damage before the next use of the same skill
  const casts = { blue: [], orange: [] };
  for (const ev of log) if (ev.type === 'use') casts[ev.who].push({ t: ev.t, skill: ev.skill, kind: kits[ev.who][ev.skill]?.kind });
  const missLog = log.filter((e) => e.type === 'miss' || e.type === 'evade');
  for (const side of ['blue', 'orange']) {
    const list = casts[side];
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!JUDGED(c.kind)) { c.outcome = 'applied'; continue; }
      const next = list.slice(i + 1).find((x) => x.skill === c.skill);
      const until = next ? next.t : Infinity;
      const hit = impacts[side].find((e) => e.skill === c.skill && e.t >= c.t && e.t < until) || dmgAt[side].find((e) => e.skill === c.skill && e.t >= c.t && e.t < until);
      const miss = missLog.find((e) => ((e.type === 'miss' && e.who === side) || (e.type === 'evade' && e.who === other(side))) && e.skill === c.skill && e.t >= c.t && e.t < until);
      if (hit && (!miss || hit.t <= miss.t)) c.outcome = 'hit';
      else if (miss) { c.outcome = 'miss'; c.reason = miss.type === 'evade' ? 'invulnerable' : miss.reason; }
      else c.outcome = c.kind === 'zone' ? 'whiff' : 'pending';
    }
  }

  const row = (side) => {
    const p = per[side], T = Math.max(1, p.alive);
    const list = casts[side];
    const judged = list.filter((c) => c.outcome && c.outcome !== 'applied' && c.outcome !== 'pending');
    const hits = judged.filter((c) => c.outcome === 'hit').length;
    const maxCasts = Object.values(kits[side]).reduce((s, d) => s + Math.floor(result.seconds / d.cooldown) + 1, 0);
    const windows = tg[side].windows;
    const responded = windows.filter((w) => w.moved || list.some((c) => c.t >= w.t0 && c.t <= w.t1 + 0.001)).length;
    const le = lobErr[side];
    return {
      side, win: result.winner === side, draw: result.winner === null, hpLeft: result[side].hpFrac,
      casts: list.length, castsPer10s: list.length / Math.max(1, result.seconds) * 10, cdUtil: list.length / maxCasts,
      hitRate: judged.length ? hits / judged.length : null, judged: judged.length,
      uses: S[side].uses, dead: Object.keys(kits[side]).filter((k) => !S[side].uses[k]),
      miss: S[side].miss, missBySkill: S[side].missBySkill, refused: S[side].refused, refusedBySkill: S[side].refusedBySkill,
      immune: S[side].immune, immuneSkill: S[side].immuneSkill, immuneWithDamage: S[side].immuneWithDamage, immuneNoDamage: S[side].immuneNoDamage, immunePredictable: S[side].immunePredictable || 0,
      dmg: S[side].dmgTotal, dmgBySkill: S[side].dmgBySkill, dodges: S[side].evadeBy, interruptsMade: S[side].interruptsMade, interruptsTaken: S[side].interruptsTaken,
      say: S[side].say, faults: S[side].faults, thinks: S[side].thinks,
      still: p.still / T, noAct: p.noAct / T, idleReady: p.idleReady / T, idleInRange: p.idleInRange / T, allCd: p.allCd / T,
      teleWindows: windows.length, teleResp: responded,
      leadNeeded: lead[side].needed || 0, leadTowardIdeal: lead[side].towardIdeal || 0, leadErrIdealDeg: lead[side].errIdeal && lead[side].errIdeal.length ? lead[side].errIdeal.reduce((a, b) => a + b, 0) / lead[side].errIdeal.length : null,
      leadCasts: lead[side].casts, leadLed: lead[side].led, leadMeanDeg: lead[side].angles.length ? lead[side].angles.reduce((a, b) => a + b, 0) / lead[side].angles.length * 180 / Math.PI : null,
      lobN: le.length, lobHit: le.filter((x) => x.hit).length, lobErr: le.length ? le.reduce((a, b) => a + b.err, 0) / le.length : null, lobErrNoLead: le.length ? le.reduce((a, b) => a + b.errNoLead, 0) / le.length : null,
      lobMovingN: le.filter((x) => x.enSpeed > 2).length, lobMovingHit: le.filter((x) => x.enSpeed > 2 && x.hit).length,
      lobPinnedN: le.filter((x) => x.pinned).length, lobPinnedHit: le.filter((x) => x.pinned && x.hit).length,
    };
  };
  const out = { seed, mindSide, seconds: result.seconds, winner: result.winner, reason: result.reason, meanDist: distSum / Math.max(1, ticks), brawl: brawl / Math.max(1, ticks), far: far / Math.max(1, ticks), suddenDeath: result.seconds > SUDDEN_DEATH_AT, mind: row(mindSide), pilot: row(pSide) };
  if (timeline) out.timeline = renderTimeline(log, frames, shots, mindSide, kits, builds);
  return out;
}

function renderTimeline(log, frames, shots, mindSide, kits, builds) {
  const lines = [];
  const who = (s) => (s === mindSide ? 'MIND' : 'pilot');
  const events = [];
  for (const ev of log) {
    let txt = null;
    switch (ev.type) {
      case 'use': txt = `${who(ev.who)} casts ${ev.skill} (${kits[ev.who][ev.skill]?.kind})`; break;
      case 'miss': txt = `${who(ev.who)} ${ev.skill} MISSED: ${ev.reason}`; break;
      case 'refused': txt = `${who(ev.who)} ${ev.skill} REFUSED: ${ev.reason}`; break;
      case 'immune': txt = `${who(ev.by)} ${ev.skill}: ${ev.effect} shrugged off (immune)`; break;
      case 'damage': txt = `${who(ev.who)} ${ev.skill} hits for ${r1(ev.amount)} → ${who(ev.target)} hp ${r1(ev.hp)}`; break;
      case 'evade': txt = `${who(other(ev.who))} ${ev.skill} passed through ${who(ev.who)}'s i-frames`; break;
      case 'interrupt': txt = `${who(ev.who)} INTERRUPTS ${who(ev.target)}'s ${ev.skill}`; break;
      case 'say': txt = `${who(ev.who)} says "${ev.text}"`; break;
      case 'death': txt = `${who(ev.who)} dies`; break;
      case 'burned': txt = `${who(ev.who)} burned by the arena`; break;
      case 'end': txt = `END ${JSON.stringify({ winner: ev.winner, reason: ev.reason })}`; break;
      case 'fault': txt = `${who(ev.who)} FAULT ${String(ev.message || '').slice(0, 80)}`; break;
      default: break;
    }
    if (txt) events.push({ t: ev.t, txt });
  }
  for (const sh of shots) {
    if (sh.kind === 'lob') {
      const tLand = sh.t + (sh.aim || 0) / (sh.speed || 12);
      const fr = frames.find((f) => f.t >= tLand - 0.017) || frames[frames.length - 1];
      const en = fr[other(sh.who)];
      const err = Math.hypot(sh.x1 - en.x, sh.z1 - en.z);
      events.push({ t: sh.t, txt: `  ${who(sh.who)} mortar released → lands (${r1(sh.x1)},${r1(sh.z1)}) in ${r2((sh.aim || 0) / (sh.speed || 12))}s; enemy then at (${r1(en.x)},${r1(en.z)}) moving ${r1(sh.enSpeed)} m/s → error ${r1(err)} m ${err <= (sh.splash || 1.8) + builds[other(sh.who)].radius ? 'HIT' : 'miss'}; aim off bearing ${r1(sh.off * 180 / Math.PI)}°` });
    } else {
      events.push({ t: sh.t, txt: `  ${who(sh.who)} bolt released heading ${r1(sh.h)} — ${r1(sh.off * 180 / Math.PI)}° off the direct bearing, enemy moving ${r1(sh.enSpeed)} m/s` });
    }
  }
  let nextStatus = 0;
  for (const f of frames) {
    if (f.t >= nextStatus) {
      nextStatus += 2;
      const m = f[mindSide], p = f[other(mindSide)];
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      events.push({ t: f.t, txt: `-- t=${r1(f.t)} dist ${r1(d)} | MIND (${r1(m.x)},${r1(m.z)}) v${r1(Math.hypot(m.vx, m.vz))} hp ${r1(m.hp)} act ${m.act || '-'}${m.ph ? '/' + m.ph : ''} cd ${Object.entries(m.cd).map(([k, v]) => `${k}:${r1(v)}`).join(' ')} | pilot (${r1(p.x)},${r1(p.z)}) v${r1(Math.hypot(p.vx, p.vz))} hp ${r1(p.hp)} act ${p.act || '-'}${p.ph ? '/' + p.ph : ''}` });
    }
  }
  events.sort((a, b) => a.t - b.t);
  for (const e of events) lines.push(`${e.t.toFixed(2).padStart(6)}  ${e.txt}`);
  return lines.join('\n');
}

// ── run ──────────────────────────────────────────────────────────────────────
const VS = arg('vs', null);
const pilots = VS ? [Object.assign(loadMind(VS), { key: `mind:${VS}`, isMind: true })] : PILOTS.map(loadPilot);
const results = {};
for (const key of MINDS) {
  const mind = loadMind(key);
  results[key] = {};
  for (const pilot of pilots) {
    const games = [];
    for (const seed of SEEDS) for (const side of SIDES) {
      const tl = TIMELINE === `${key}:${pilot.key.replace('pilot:', '')}:${seed}:${side}`;
      const g = play(mind, pilot, seed, side, { timeline: tl });
      games.push(g);
      if (tl) { console.log(`\n===== TIMELINE ${key} vs ${pilot.key} seed ${seed} mind=${side} =====\n${g.timeline}\n`); delete g.timeline; }
    }
    results[key][pilot.key] = games;
  }
}

// ── report ───────────────────────────────────────────────────────────────────
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sumObj = (objs) => { const o = {}; for (const x of objs) for (const [k, v] of Object.entries(x || {})) o[k] = (o[k] || 0) + v; return o; };
const fmtObj = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || '—';

for (const [key, byPilot] of Object.entries(results)) {
  console.log(`\n## ${key}`);
  for (const [pk, games] of Object.entries(byPilot)) {
    const M = games.map((g) => g.mind), P = games.map((g) => g.pilot);
    const wins = M.filter((m) => m.win).length, draws = M.filter((m) => m.draw).length;
    const n = games.length;
    const sd = games.filter((g) => g.suddenDeath).length;
    console.log(`  vs ${pk}: W-D-L ${wins}-${draws}-${n - wins - draws} | len ${r1(mean(games.map((g) => g.seconds)))}s | sudden death ${sd}/${n} | mean dist ${r1(mean(games.map((g) => g.meanDist)))} m | reasons ${games.map((g) => g.reason).join(',')}`);
    const totalCasts = M.reduce((s, m) => s + m.casts, 0);
    const judged = M.reduce((s, m) => s + m.judged, 0);
    const hits = M.reduce((s, m) => s + (m.hitRate === null ? 0 : m.hitRate * m.judged), 0);
    console.log(`    MIND  casts/10s ${r1(mean(M.map((m) => m.castsPer10s)))} cdUtil ${pct(mean(M.map((m) => m.cdUtil)))} hit ${pct(judged ? hits / judged : null)} (${Math.round(hits)}/${judged}) dmg/game ${r1(mean(M.map((m) => m.dmg)))} still ${pct(mean(M.map((m) => m.still)))} noAct ${pct(mean(M.map((m) => m.noAct)))} idle+ready ${pct(mean(M.map((m) => m.idleReady)))} idle+inReach ${pct(mean(M.map((m) => m.idleInRange)))} allCd ${pct(mean(M.map((m) => m.allCd)))}`);
    console.log(`          uses ${fmtObj(sumObj(M.map((m) => m.uses)))} | dead slots ${M.reduce((s, m) => s + m.dead.length, 0)}/${n * 3} | miss ${fmtObj(sumObj(M.map((m) => m.missBySkill)))} | refused ${fmtObj(sumObj(M.map((m) => m.refusedBySkill)))}`);
    console.log(`          immune ${fmtObj(sumObj(M.map((m) => m.immune)))} (on damage-carrying casts ${M.reduce((s, m) => s + m.immuneWithDamage, 0)}, on pure controls ${M.reduce((s, m) => s + m.immuneNoDamage, 0)}; already immune when ordered ${M.reduce((s, m) => s + m.immunePredictable, 0)}) | dodges ${M.reduce((s, m) => s + m.dodges, 0)} | interrupts made ${M.reduce((s, m) => s + m.interruptsMade, 0)} taken ${M.reduce((s, m) => s + m.interruptsTaken, 0)} | say ${M.reduce((s, m) => s + m.say, 0)} | faults ${M.reduce((s, m) => s + m.faults, 0)}`);
    const tw = M.reduce((s, m) => s + m.teleWindows, 0), tr = M.reduce((s, m) => s + m.teleResp, 0);
    const lc = M.reduce((s, m) => s + m.leadCasts, 0), ll = M.reduce((s, m) => s + m.leadLed, 0);
    const lobN = M.reduce((s, m) => s + m.lobN, 0), lobHit = M.reduce((s, m) => s + m.lobHit, 0), lobMN = M.reduce((s, m) => s + m.lobMovingN, 0), lobMH = M.reduce((s, m) => s + m.lobMovingHit, 0);
    const lobErrs = M.filter((m) => m.lobErr !== null);
    const ln = M.reduce((s, m) => s + m.leadNeeded, 0), lti = M.reduce((s, m) => s + m.leadTowardIdeal, 0);
    const lerr = M.filter((m) => m.leadErrIdealDeg !== null);
    console.log(`          bolt lead: of ${ln} shots that needed >3° of lead, ${lti} (${pct(ln ? lti / ln : null)}) were aimed nearer the intercept than the target; mean error from the intercept ${lerr.length ? r1(mean(lerr.map((m) => m.leadErrIdealDeg))) : '—'}°`);
    console.log(`          telegraph resp ${pct(tw ? tr / tw : null)} (${tr}/${tw}) | lead usage ${pct(lc ? ll / lc : null)} (${ll}/${lc}) mean off-bearing ${lobErrs.length || lc ? r1(mean(M.filter((m) => m.leadMeanDeg !== null).map((m) => m.leadMeanDeg))) : '—'}° | mortar: ${lobN} thrown, ${lobHit} on target (${pct(lobN ? lobHit / lobN : null)}), vs moving target ${lobMH}/${lobMN}, mean landing error ${lobErrs.length ? r1(mean(lobErrs.map((m) => m.lobErr))) : '—'} m (no-lead would be ${lobErrs.length ? r1(mean(lobErrs.map((m) => m.lobErrNoLead))) : '—'} m)`);
    const pn = M.reduce((s, m) => s + m.lobPinnedN, 0), ph2 = M.reduce((s, m) => s + m.lobPinnedHit, 0);
    if (lobN) console.log(`          mortar on a rooted/stunned target: ${pn} of ${lobN} landed while the enemy was pinned (${pct(lobN ? pn / lobN : null)}), ${ph2} of those on target (${pct(pn ? ph2 / pn : null)}); free target ${lobHit - ph2}/${lobN - pn} (${pct(lobN - pn ? (lobHit - ph2) / (lobN - pn) : null)})`);
    const pj = P.reduce((s, m) => s + m.judged, 0), ph = P.reduce((s, m) => s + (m.hitRate === null ? 0 : m.hitRate * m.judged), 0);
    console.log(`    PILOT casts/10s ${r1(mean(P.map((m) => m.castsPer10s)))} hit ${pct(pj ? ph / pj : null)} dmg/game ${r1(mean(P.map((m) => m.dmg)))} still ${pct(mean(P.map((m) => m.still)))} idle+inReach ${pct(mean(P.map((m) => m.idleInRange)))} immune ${fmtObj(sumObj(P.map((m) => m.immune)))} dodges ${P.reduce((s, m) => s + m.dodges, 0)} interrupts made ${P.reduce((s, m) => s + m.interruptsMade, 0)}`);
  }
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 1));
