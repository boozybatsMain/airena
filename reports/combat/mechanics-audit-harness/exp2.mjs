import { createWorld, step } from '/Users/boozybats/Public/Repos/work/Airena/src/core/sim.js';
import { compileKit } from '/Users/boozybats/Public/Repos/work/Airena/src/skills/compile.js';
import { DT } from '/Users/boozybats/Public/Repos/work/Airena/src/core/config.js';

const K = (delivery, effects, channel, element = 'kinetic') => ({ delivery, effects, ...(channel ? { channel } : {}), element });
const kitOf = (arr, cd = 3) => { const o = compileKit(arr, { fixedCooldown: cd }); if (o.problems.length) throw new Error(JSON.stringify(o.problems)); return o.defs; };
const place = (w, bx, bz, ox, oz) => { const b = w.fighters.blue, o = w.fighters.orange; b.x = bx; b.z = bz; o.x = ox; o.z = oz; b.px = bx; b.pz = bz; o.px = ox; o.pz = oz; b.heading = Math.atan2(ox - bx, oz - bz); b.wantHeading = b.heading; o.heading = Math.atan2(bx - ox, bz - oz); o.wantHeading = o.heading; };
const stepN = (w, think, n) => { for (let i = 0; i < n; i++) step(w, think); };

console.log('=== E7 knock / pull displacement (effect adds mag*4 to CONTROL velocity vx, not kx) ===');
for (const [eff, mag] of [['knock', 2.4], ['pull', 3.0]]) {
  for (const mode of ['standing', 'moving toward caster', 'moving away']) {
    const w = createWorld(7, { kits: { blue: kitOf([K('beam', [eff]), K('self', ['shield']), K('self', ['heal'])]), orange: kitOf([K('self', ['shield']), K('self', ['heal']), K('beam', ['damage'])]) } });
    place(w, 0, 0, 0, 6);
    let fired = false;
    const think = (id, p, api) => {
      if (id === 'blue' && !fired && p.t > 0.3) { api.faceAt(p.enemy.x, p.enemy.z); api.use('k1'); fired = true; }
      if (id === 'orange') { if (mode === 'moving toward caster') api.move(0, -1); else if (mode === 'moving away') api.move(0, 1); }
    };
    // step until the beam lands
    let z0 = null, tHit = null;
    for (let i = 0; i < 120; i++) {
      step(w, think);
      if (z0 === null && w.log.some((e) => e.type === 'use' && e.who === 'blue')) { /* cast started */ }
      const st = w.fighters.orange;
      if (tHit === null && w.fx.some((e) => e.kind === 'beam' && e.hit)) { tHit = w.t; z0 = st.pz; }
    }
    const o = w.fighters.orange;
    // Compare against a control with no beam: same mode, measure position at same time
    const wc = createWorld(7, { kits: { blue: kitOf([K('beam', [eff]), K('self', ['shield']), K('self', ['heal'])]), orange: kitOf([K('self', ['shield']), K('self', ['heal']), K('beam', ['damage'])]) } });
    place(wc, 0, 0, 0, 6);
    const thinkC = (id, p, api) => { if (id === 'orange') { if (mode === 'moving toward caster') api.move(0, -1); else if (mode === 'moving away') api.move(0, 1); } };
    stepN(wc, thinkC, 120);
    console.log(`${eff.padEnd(6)} mag ${mag} target ${mode.padEnd(22)} impulse ${(mag * 4).toFixed(1)} m/s → net displacement vs control after 4 s: ${(o.z - wc.fighters.orange.z).toFixed(2)} m (z-axis; +z = away from caster)`);
  }
}

console.log('\n=== E8 stun / silence applied during a wind-up: does the cast still land? ===');
for (const mode of ['stun', 'silence', 'root']) {
  const w = createWorld(3, { kits: { blue: kitOf([K('beam', ['damage']), K('self', ['shield']), K('self', ['heal'])]), orange: kitOf([K('self', ['shield']), K('self', ['heal']), K('beam', ['damage'])]) } });
  place(w, 0, 0, 0, 8);
  let fired = false; let applied = false;
  const think = (id, p, api) => { if (id === 'blue' && !fired && p.t > 0.3) { api.faceAt(p.enemy.x, p.enemy.z); api.use('k1'); fired = true; } };
  for (let i = 0; i < 90; i++) {
    step(w, think);
    const b = w.fighters.blue;
    if (b.act && b.act.phase === 'windup' && b.act.tPhase > 0.2 && !applied) {
      applied = true;
      if (mode === 'stun') b.stun = 1.5;
      if (mode === 'silence') { b.status = b.status || { burn: null, root: 0, shield: 0, shieldUntil: 0, blind: 0, silence: 0, boost: {}, weaken: {} }; b.status.silence = w.t + 2; }
      if (mode === 'root') { b.status = b.status || { burn: null, root: 0, shield: 0, shieldUntil: 0, blind: 0, silence: 0, boost: {}, weaken: {} }; b.status.root = w.t + 2; }
    }
  }
  const landed = w.log.filter((e) => e.type === 'damage' && e.who === 'blue').length;
  const interrupted = w.log.filter((e) => e.type === 'interrupt').length;
  console.log(`${mode.padEnd(8)} applied at 0.2 s into a 0.65 s wind-up → beam damage events: ${landed}, interrupt events: ${interrupted}`);
}

console.log('\n=== E9 blink with ABSOLUTE coordinates as arguments ===');
{
  const w = createWorld(3, { kits: { blue: kitOf([K('blink', ['cleanse']), K('self', ['shield']), K('beam', ['damage'])]), orange: kitOf([K('self', ['shield']), K('self', ['heal']), K('beam', ['damage'])]) } });
  place(w, -15, 0, 15, 0);
  let fired = false;
  const think = (id, p, api) => { if (id === 'blue' && !fired && p.t > 0.3) { api.use('k1', 10, 5); fired = true; } };
  stepN(w, think, 20);
  const b = w.fighters.blue;
  console.log(`caster at (-15,0) calls api.use('k1', 10, 5) intending the point (10,5). Landed at (${b.x.toFixed(2)}, ${b.z.toFixed(2)}).`);
  console.log(`  read as DIRECTION norm(10,5) from the caster → expected (${(-15 + 7.5 * 10 / Math.hypot(10, 5)).toFixed(2)}, ${(7.5 * 5 / Math.hypot(10, 5)).toFixed(2)}); toward the point would be (${(-15 + 7.5 * 25 / Math.hypot(25, 5)).toFixed(2)}, ${(7.5 * 5 / Math.hypot(25, 5)).toFixed(2)})`);
  const w2 = createWorld(3, { kits: { blue: kitOf([K('blink', ['cleanse']), K('self', ['shield']), K('beam', ['damage'])]), orange: kitOf([K('self', ['shield']), K('self', ['heal']), K('beam', ['damage'])]) } });
  place(w2, 5, 5, 15, 0);
  fired = false;
  const think2 = (id, p, api) => { if (id === 'blue' && !fired && p.t > 0.3) { api.use('k1', -5, -5); fired = true; } };
  stepN(w2, think2, 20);
  console.log(`caster at (5,5) calls api.use('k1', -5, -5) intending the point (-5,-5) (10 m SW). Landed at (${w2.fighters.blue.x.toFixed(2)}, ${w2.fighters.blue.z.toFixed(2)}) — direction (-1,-1) happens to coincide here; at (5,-5) the same call would go NE of the intent.`);
}

console.log('\n=== E10 lob: pair args vs metres vs none, target strafing at 5.8 m/s perpendicular ===');
for (const mode of ['pair (absolute lead point)', 'metres (lead distance)', 'none']) {
  let hits = 0, casts = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w = createWorld(seed, { kits: { blue: kitOf([K('lob', ['damage']), K('self', ['shield']), K('self', ['heal'])]), orange: kitOf([K('self', ['shield']), K('self', ['heal']), K('beam', ['damage'])]) } });
    place(w, 0, 0, 0, 10);
    let dir = 1;
    const think = (id, p, api) => {
      if (id === 'orange') { if (p.self.x > 6) dir = -1; if (p.self.x < -6) dir = 1; api.move(dir, 0); return; }
      const en = p.enemy, me = p.self;
      const d = en.dist; const tf = d / 12 + 0.5;
      const lx = en.x + en.vx * tf, lz = en.z + en.vz * tf;
      api.faceAt(lx, lz);
      if (api.ready('k1')) {
        if (mode.startsWith('pair')) api.use('k1', lx, lz);
        else if (mode.startsWith('metres')) api.use('k1', Math.hypot(lx - me.x, lz - me.z));
        else api.use('k1');
      }
    };
    stepN(w, think, 30 * 20);
    casts += w.fighters.blue.stats.uses.k1 || 0; hits += w.fighters.blue.stats.hits.k1 || 0;
  }
  console.log(`${mode.padEnd(30)} casts ${casts} hits ${hits} (${(100 * hits / casts).toFixed(0)}%)`);
}

console.log('\n=== E10b bolt (22 m/s) vs strafing target 5.8 m/s at 10 m, with and without V.lead ===');
for (const lead of [true, false]) {
  let hits = 0, casts = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w = createWorld(seed, { kits: { blue: kitOf([K('bolt', ['damage']), K('self', ['shield']), K('self', ['heal'])]), orange: kitOf([K('self', ['shield']), K('self', ['heal']), K('beam', ['damage'])]) } });
    place(w, 0, 0, 0, 10);
    let dir = 1;
    const think = (id, p, api) => {
      if (id === 'orange') { if (p.self.x > 6) dir = -1; if (p.self.x < -6) dir = 1; api.move(dir, 0); return; }
      const en = p.enemy; const tf = en.dist / 22 + 0.34;
      if (lead) api.faceAt(en.x + en.vx * tf, en.z + en.vz * tf); else api.faceAt(en.x, en.z);
      if (api.ready('k1')) api.use('k1');
    };
    stepN(w, think, 30 * 20);
    casts += w.fighters.blue.stats.uses.k1 || 0; hits += w.fighters.blue.stats.hits.k1 || 0;
  }
  console.log(`lead=${lead}  casts ${casts} hits ${hits} (${(100 * hits / casts).toFixed(0)}%)`);
}

console.log('\n=== E10c zone with pair args: where does it land? ===');
{
  const w = createWorld(3, { kits: { blue: kitOf([K('zone', ['damage']), K('self', ['shield']), K('self', ['heal'])]), orange: kitOf([K('self', ['shield']), K('self', ['heal']), K('beam', ['damage'])]) } });
  place(w, 0, 0, 0, 8);
  let fired = false;
  const think = (id, p, api) => { if (id === 'blue' && !fired && p.t > 0.3) { api.faceAt(p.enemy.x, p.enemy.z); api.use('k1', 4, 4); fired = true; } };
  stepN(w, think, 30);
  const z = w.zones[0];
  console.log(`caster (0,0) facing enemy at (0,8) calls api.use('k1', 4, 4) → zone centre (${z.x}, ${z.z}); args ignored, disc lands along heading at min(range, enemy dist)`);
}

console.log('\n=== E13 grammar dash is an instantaneous translation ===');
{
  const w = createWorld(3, { kits: { blue: kitOf([K('dash', ['damage']), K('self', ['shield']), K('self', ['heal'])]), orange: kitOf([K('self', ['shield']), K('self', ['heal']), K('beam', ['damage'])]) } });
  place(w, 0, 0, 0, 12);
  let fired = false; const trace = [];
  const think = (id, p, api) => { if (id === 'blue' && !fired && p.t > 0.3) { api.faceAt(p.enemy.x, p.enemy.z); api.use('k1'); fired = true; } };
  for (let i = 0; i < 30; i++) { step(w, think); trace.push(`${w.t.toFixed(2)}:${w.fighters.blue.z.toFixed(1)}`); }
  console.log('blue z per tick after ordering dash at ~0.33 s: ' + trace.slice(8, 20).join(' '));
}

console.log('\n=== E14 shield vs single damage skill arithmetic at CD 3 (both at 100% hit) ===');
{
  const w = createWorld(3, { kits: { blue: kitOf([K('beam', ['damage']), K('self', ['heal']), K('bolt', ['damage'])]), orange: kitOf([K('self', ['shield']), K('self', ['heal']), K('beam', ['damage'])]) } });
  place(w, 0, 0, 0, 8);
  const think = (id, p, api) => { api.faceAt(p.enemy.x, p.enemy.z); if (id === 'blue') { if (api.ready('k1')) api.use('k1'); } else { if (api.ready('k1')) api.use('k1'); } };
  stepN(w, think, 30 * 30);
  console.log(`blue beam:damage every 3 s vs orange self:shield every 3 s for 30 s → orange hp ${w.fighters.orange.hp.toFixed(1)} / 180, damage that reached hp: ${w.fighters.orange.stats.damageTaken.toFixed(1)}`);
}
