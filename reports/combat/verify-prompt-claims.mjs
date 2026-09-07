#!/usr/bin/env node
/**
 * Measurements behind reports/combat/prompt-audit.md.
 *
 *   node reports/combat/verify-prompt-claims.mjs
 *
 * Single process, no worker pool, no server. Drives `createWorld` + `step`
 * with stub brains and prints what the world actually does, next to what the
 * prompt says, for every claim in the audit that could be measured.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { createWorld, step } = await import(join(ROOT, 'src/core/sim.js'));
const { compileKit } = await import(join(ROOT, 'src/skills/compile.js'));
const { brainPrompt } = await import(join(ROOT, 'src/brain/prompt.js'));
const { TICK_HZ, THINK_EVERY } = await import(join(ROOT, 'src/core/config.js'));
const DT = 1 / TICK_HZ;

const r3 = (v) => Math.round(v * 1000) / 1000;
const put = (f, x, z, h) => {
  f.x = x; f.z = z; f.px = x; f.pz = z; f.heading = h; f.wantHeading = h;
  f.vx = 0; f.vz = 0; f.kx = 0; f.kz = 0; f.y = 0;
};
function world(kitBlue, kitOrange, { seed = 1, clear = true } = {}) {
  const a = compileKit(kitBlue), b = compileKit(kitOrange);
  if (a.problems.length || b.problems.length) throw new Error(JSON.stringify({ a: a.problems, b: b.problems }));
  const w = createWorld(seed, { kits: { blue: a.defs, orange: b.defs } });
  if (clear) { w.solids = w.solids.filter((s) => s.wall); w.obstacles = []; }
  return { w, blue: a.defs, orange: b.defs };
}
const FILL = [
  { delivery: 'self', effects: ['heal'], element: 'frost' },
  { delivery: 'blink', effects: ['cleanse'], element: 'void' },
];
const kitOf = (delivery, effects, channel) => [{ delivery, effects, element: 'kinetic', ...(channel ? { channel } : {}) }, ...FILL];

/** Text the prompt prints on the `cast` line of the k1 block. */
function castLineSaid(defsOwn, defsEnemy) {
  const text = brainPrompt('blue', { own: defsOwn, enemy: defsEnemy }, null);
  const block = text.split('\n\n').find((b) => b.startsWith('k1\n'));
  return block.split('\n').find((l) => /^ {2}cast {2,}/.test(l)).trim();
}

console.log('=== 1. served phase durations of grammar deliveries vs the prompt\'s cast line ===');
for (const kind of ['beam', 'cone', 'bolt', 'lob', 'zone', 'dash', 'blink', 'self', 'jump']) {
  const effects = (kind === 'blink' || kind === 'self' || kind === 'jump') ? ['shield'] : ['damage'];
  const fill = kind === 'blink' ? [{ delivery: 'self', effects: ['heal'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }]
    : kind === 'self' ? [{ delivery: 'blink', effects: ['cleanse'], element: 'void' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }]
      : FILL;
  const kit = [{ delivery: kind, effects, element: 'kinetic' }, ...fill];
  const { w, blue, orange } = world(kit, kit);
  const me = w.fighters.blue, you = w.fighters.orange;
  put(me, 0, -9, 0); put(you, 0, 0, Math.PI);
  let ordered = false;
  const phases = [];
  const think = (id, p, api) => { if (id === 'blue' && !ordered) { api.use('k1'); ordered = true; } };
  for (let k = 0; k < 60; k++) {
    if (kind !== 'dash') { put(you, 0, 0, Math.PI); }
    step(w, think);
    if (me.act) {
      const last = phases[phases.length - 1];
      if (last && last.phase === me.act.phase) last.ticks++;
      else phases.push({ phase: me.act.phase, ticks: 1 });
    }
  }
  const served = phases.map((p) => `${p.phase} ${p.ticks} ticks = ${r3(p.ticks * DT)} s`).join(', ');
  console.log(`${kind.padEnd(6)} config windup ${blue.k1.windup} recover ${blue.k1.recover}${blue.k1.airborne ? ` airborne ${blue.k1.airborne}` : ''}`);
  console.log(`       world serves: ${served}`);
  console.log(`       prompt says:  ${castLineSaid(blue, orange)}`);
}

console.log('\n=== 2. lob argument: single number vs pair ===');
{
  const kit = kitOf('lob', ['damage']);
  for (const args of [[], [10], [10, 0], [10, undefined], [3, 4]]) {
    const { w } = world(kit, kit);
    const me = w.fighters.blue, you = w.fighters.orange;
    put(me, 0, -9, 0); put(you, 0, 5, Math.PI);
    let ordered = false, reach = 'n/a', spot = null;
    const think = (id, p, api) => { if (id === 'blue' && !ordered) { api.use('k1', ...args); ordered = true; } };
    for (let k = 0; k < 40; k++) {
      step(w, think);
      if (me.act && reach === 'n/a') reach = me.act.reach;
      const pr = (w.projectiles || []).find((q) => q.who === 'blue');
      if (pr && !spot) spot = pr.spot;
    }
    console.log(`api.use('k1'${args.length ? ', ' + args.map(String).join(', ') : ''})  act.reach=${reach}  lands at d=${spot ? r3(spot.d) : '?'} (enemy at 14 m)`);
  }
}

console.log('\n=== 3. grammar knock: where the impulse goes, how far it moves a target, whether anything is interrupted ===');
{
  const blueKit = kitOf('cone', ['knock']);
  const orangeKit = kitOf('zone', ['damage']);
  for (const orangeCasts of [false, true]) {
    const { w } = world(blueKit, orangeKit);
    const me = w.fighters.blue, you = w.fighters.orange;
    put(me, 0, -3, 0); put(you, 0, 0, Math.PI);
    let ordered = false, ordered2 = false;
    const think = (id, p, api) => {
      if (id === 'orange' && orangeCasts && !ordered2) { api.use('k1'); ordered2 = true; }
      if (id === 'blue' && !ordered && p.tick >= 4) { api.use('k1'); ordered = true; }
    };
    const z0 = you.z; let zAtHit = null, vxAtHit = null, kAtHit = null, hitTick = null;
    const evs = [];
    for (let k = 0; k < 60; k++) {
      step(w, think);
      for (const e of you.events) evs.push(`${w.tick}:${e.type}`);
      you.events = [];
      if (hitTick === null && (Math.abs(you.vz) > 0.01 || Math.abs(you.kz) > 0.01)) {
        hitTick = w.tick; zAtHit = you.z; vxAtHit = r3(you.vz); kAtHit = r3(you.kz);
      }
    }
    console.log(`orange ${orangeCasts ? 'mid-windup of a zone' : 'idle'}: impulse into vz=${vxAtHit} (control velocity) kz=${kAtHit} (knockback slot); pushed ${r3(you.z - z0)} m total; orange events: ${evs.filter((e) => !/contact/.test(e)).join(' ') || '(none)'}; orange act after: ${you.act ? you.act.phase : 'null'}; zone placed: ${(w.zones || []).length}`);
  }
}

console.log('\n=== 4. stun mid-cast: does the cast still land? ===');
{
  const blueKit = kitOf('cone', ['stun']);
  const orangeKit = kitOf('lob', ['damage']);
  const { w } = world(blueKit, orangeKit);
  const me = w.fighters.blue, you = w.fighters.orange;
  put(me, 0, -3, 0); put(you, 0, 0, Math.PI);
  let o1 = false, o2 = false;
  const think = (id, p, api) => {
    if (id === 'orange' && !o1) { api.use('k1'); o1 = true; }
    if (id === 'blue' && !o2 && p.tick >= 4) { api.use('k1'); o2 = true; }
  };
  let stunnedAt = null, projectileAt = null;
  for (let k = 0; k < 40; k++) {
    step(w, think);
    if (stunnedAt === null && you.stun > 0) stunnedAt = `tick ${w.tick}, orange in phase ${you.act ? you.act.phase : 'null'}`;
    if (projectileAt === null && (w.projectiles || []).some((q) => q.who === 'orange')) projectileAt = `tick ${w.tick}`;
  }
  console.log(`orange stunned at ${stunnedAt}; orange's lob projectile appeared at ${projectileAt ?? 'never'}`);
}

console.log('\n=== 5. zone totals: burn vs damage, target standing still in the disc for its whole life ===');
for (const eff of ['damage', 'burn']) {
  const { w } = world(kitOf('zone', [eff]), kitOf('bolt', ['damage']));
  const me = w.fighters.blue, you = w.fighters.orange;
  put(me, 0, -6, 0); put(you, 0, 0, Math.PI);
  let ordered = false;
  const think = (id, p, api) => { if (id === 'blue' && !ordered) { api.use('k1'); ordered = true; } };
  const hp0 = you.hp; let ticksHit = 0;
  for (let k = 0; k < 30 * 8; k++) { put(you, 0, 0, Math.PI); const h = you.hp; step(w, think); if (you.hp < h) ticksHit++; }
  console.log(`zone:${eff}  hp lost ${r3(hp0 - you.hp)} over 8 s (single ${eff} hit would be ${eff === 'damage' ? 26 : '7 dps x 4 s = 28'})`);
}

console.log('\n=== 6. cooldown: ticks from cast to ready ===');
{
  const kit = kitOf('bolt', ['damage']);
  const { w, blue } = world(kit, kit);
  const me = w.fighters.blue;
  let ordered = false, castTick = null, readyTick = null;
  const think = (id, p, api) => { if (id === 'blue' && !ordered) { api.use('k1'); ordered = true; castTick = p.tick; } };
  for (let k = 0; k < 400; k++) { step(w, think); if (castTick !== null && readyTick === null && me.cooldowns.k1 === 0) readyTick = w.tick; }
  console.log(`config cooldown ${blue.k1.cooldown}; ordered on think at tick ${castTick}; cooldowns.k1 === 0 first seen at tick ${readyTick}; ${readyTick - castTick} ticks = ${r3((readyTick - castTick) * DT)} s`);
}

console.log('\n=== 7. blind: how old the enemy block is ===');
{
  const blueKit = kitOf('bolt', ['damage']);
  const orangeKit = kitOf('cone', ['blind']);
  const { w } = world(blueKit, orangeKit);
  const me = w.fighters.blue, you = w.fighters.orange;
  put(me, 0, 0, 0); put(you, 0, 2.5, Math.PI);
  let o1 = false; const rows = [];
  const think = (id, p, api) => {
    if (id === 'orange') { if (!o1) { api.use('k1'); o1 = true; } api.move(0, 1); }
    if (id === 'blue') rows.push({ t: p.t, seen: p.enemy.z, real: r3(you.z), blinded: p.self.blinded });
  };
  for (let k = 0; k < 30 * 4; k++) step(w, think);
  const b = rows.filter((r) => r.blinded);
  const first = b[0], mid = b[Math.floor(b.length / 2)];
  const lagOf = (row) => { const i = rows.findIndex((r) => Math.abs(r.real - row.seen) < 0.05); return i >= 0 ? r3(row.t - rows[i].t) : '?'; };
  console.log(`blinded for ${b.length} thoughts (${r3(b.length * THINK_EVERY * DT)} s, config 2.5 s); at t=${mid.t} sees enemy z=${mid.seen}, real z=${mid.real}, lag ≈ ${lagOf(mid)} s; first blinded thought lag ≈ ${lagOf(first)} s`);
}

console.log('\n=== 8. wall: where it grows ===');
{
  const kit = kitOf('self', ['wall']).map((s, i) => (i === 0 ? s : s));
  const kit2 = [{ delivery: 'self', effects: ['wall'], element: 'kinetic' }, { delivery: 'blink', effects: ['cleanse'], element: 'void' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }];
  const { w } = world(kit2, kit2);
  const me = w.fighters.blue, you = w.fighters.orange;
  put(me, 0, -9, 0); put(you, 0, 5, Math.PI);
  let ordered = false;
  const think = (id, p, api) => { if (id === 'blue' && !ordered) { api.use('k1'); ordered = true; } };
  for (let k = 0; k < 30; k++) step(w, think);
  const wall = w.obstacles.find((o) => o.temporary);
  console.log(`caster at (0,-9) facing +Z; wall box ${JSON.stringify(wall)} (centre ${wall ? r3(wall.z - me.z) : '?'} m ahead; full size ${wall ? wall.hx * 2 : '?'} x ${wall ? wall.hz * 2 : '?'})`);
}

console.log('\n=== 9. shield vs damage order, and what perception shows ===');
{
  const blueKit = kitOf('bolt', ['damage']);
  const orangeKit = [{ delivery: 'self', effects: ['shield'], element: 'frost' }, ...FILL.map((s) => (s.delivery === 'self' ? { delivery: 'bolt', effects: ['damage'], element: 'arc' } : s))];
  const { w } = world(blueKit, orangeKit);
  const me = w.fighters.blue, you = w.fighters.orange;
  put(me, 0, -6, 0); put(you, 0, 0, Math.PI);
  let o1 = false, o2 = false; let seen = null;
  const think = (id, p, api) => {
    if (id === 'orange' && !o1) { api.use('k1'); o1 = true; }
    if (id === 'blue') { if (!o2 && p.tick >= 20) { api.use('k1'); o2 = true; } if (p.enemy.shield > 0 && !seen) seen = { enemyShield: p.enemy.shield, selfShield: p.self.shield }; }
  };
  const hp0 = you.hp;
  for (let k = 0; k < 60; k++) { put(you, 0, 0, Math.PI); step(w, think); }
  console.log(`orange shield 40 then hit by 26 damage: hp ${hp0} -> ${r3(you.hp)}, shield left ${r3(you.status.shield)}; blue's perception saw p.enemy.shield=${seen?.enemyShield}`);
}

console.log('\n=== 10. events feed cap ===');
{
  const kit = kitOf('bolt', ['damage']);
  const { w } = world(kit, kit);
  const me = w.fighters.blue;
  let got = null;
  const think = (id, p, api) => {
    if (id !== 'blue') return;
    if (p.tick === 2) { for (let i = 0; i < 60; i++) api.use('nope'); }
    if (p.tick === 4) got = p.events.length;
  };
  for (let k = 0; k < 6; k++) step(w, think);
  console.log(`60 refused orders in one thought -> p.events.length next thought = ${got}`);
}

console.log('\n=== 11. aim read at strike, not at order: bolt cast while turning ===');
{
  const kit = kitOf('bolt', ['damage']);
  const { w, blue } = world(kit, kit);
  const me = w.fighters.blue, you = w.fighters.orange;
  put(me, 0, 0, Math.PI / 2); put(you, 0, 8, Math.PI); // facing +X, enemy at +Z
  let ordered = false; let hAtOrder = null, hAtFire = null;
  const think = (id, p, api) => { if (id === 'blue' && !ordered) { api.faceAt(you.x, you.z); api.use('k1'); ordered = true; hAtOrder = p.self.heading; } };
  for (let k = 0; k < 30; k++) {
    step(w, think);
    const pr = (w.projectiles || []).find((q) => q.who === 'blue');
    if (pr && hAtFire === null) hAtFire = r3(Math.atan2(pr.vx, pr.vz));
  }
  console.log(`heading at order ${r3(hAtOrder)} rad; bolt left along ${hAtFire} rad after a ${blue.k1.windup} s wind-up at turnScale ${r3(blue.k1.turnScale)} (turn rate 7.5 rad/s -> ${r3(7.5 * blue.k1.turnScale * blue.k1.windup)} rad of turning available)`);
}

console.log('\n=== 12. root: movement, turning, casting ===');
{
  const blueKit = kitOf('cone', ['root']);
  const orangeKit = kitOf('bolt', ['damage']);
  const { w } = world(blueKit, orangeKit);
  const me = w.fighters.blue, you = w.fighters.orange;
  put(me, 0, -3, 0); put(you, 0, 0, Math.PI);
  let o1 = false; let rootedRows = [];
  const think = (id, p, api) => {
    if (id === 'blue' && !o1 && p.tick >= 4) { api.use('k1'); o1 = true; }
    if (id === 'orange') { api.move(0, 1); api.face(1, 0); if (p.self.rooted) rootedRows.push({ speed: p.self.speed, heading: r3(p.self.heading) }); if (p.self.rooted && p.tick % 10 === 0) api.use('k1'); }
  };
  const refused = [];
  for (let k = 0; k < 60; k++) { step(w, think); for (const e of you.events) if (e.type === 'refused') refused.push(e.reason); you.events = []; }
  console.log(`rooted thoughts: ${rootedRows.length}; speed while rooted max ${r3(Math.max(...rootedRows.map((r) => r.speed)))}; heading changed from ${rootedRows[0]?.heading} to ${rootedRows[rootedRows.length - 1]?.heading}; api.use while rooted refused with: ${[...new Set(refused)].join(',') || '(never refused)'}; orange projectiles fired: ${(w.projectiles || []).filter((q) => q.who === 'orange').length + (you.stats.uses.k1 || 0)}`);
}
