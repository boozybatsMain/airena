/* Mind-vs-mind cross league on the bake-off minds, single process: what ends a fight. */
import { readFileSync } from 'node:fs';
const ROOT = '/Users/boozybats/Public/Repos/work/Airena';
const { compileBrain } = await import(`${ROOT}/src/brain/host.js`);
const { runMatch } = await import(`${ROOT}/src/core/match.js`);
const { compileKit } = await import(`${ROOT}/src/skills/compile.js`);
const { normalizeBuild, SUDDEN_DEATH_AT } = await import(`${ROOT}/src/core/config.js`);
const { EFFECTS } = await import(`${ROOT}/src/skills/registry.js`);
const creatures = JSON.parse(readFileSync(`${ROOT}/reports/combat/bakeoff/creatures.json`, 'utf8'));
const MODELS = (process.argv[2] || 'sub-fable-high,sub-opus-high,sub-sonnet-high,z-ai-glm-5.3-flash-plain,sub-fable-plain,deepseek-deepseek-v4-flash-think').split(',');
const SEEDS = (process.argv[3] || '1').split(',').map(Number);
const minds = [];
for (const m of MODELS) for (const c of creatures) {
  let meta; try { meta = JSON.parse(readFileSync(`${ROOT}/reports/combat/bakeoff/${m}/${c.id}.json`, 'utf8')); } catch { continue; }
  if (!meta.admitted) continue;
  const src = readFileSync(`${ROOT}/reports/combat/bakeoff/${m}/${c.id}.js`, 'utf8');
  const kit = compileKit(c.kit); if (kit.problems.length) throw new Error(JSON.stringify(kit.problems));
  minds.push({ key: `${m}/${c.id}`, brain: compileBrain(src, `${m}/${c.id}`), kit: kit.defs, build: normalizeBuild(c.build).build });
}
console.log(`${minds.length} minds: ${minds.map((m) => m.key).join(', ')}`);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const pct = (a, b) => `${(100 * a / Math.max(1, b)).toFixed(0)}%`;
const isControl = (id) => !!EFFECTS[id]?.immune;
const recs = []; const t0 = Date.now();
for (let i = 0; i < minds.length; i++) for (let j = i + 1; j < minds.length; j++) for (const seed of SEEDS) for (const flip of [false, true]) {
  const A = flip ? minds[j] : minds[i], B = flip ? minds[i] : minds[j];
  A.brain.reset(); B.brain.reset();
  const kits = { blue: A.kit, orange: B.kit }, builds = { blue: A.build, orange: B.build };
  let ticks = 0, bothCd = 0; const per = { blue: { alive: 0, noAct: 0, waitCd: 0 }, orange: { alive: 0, noAct: 0, waitCd: 0 } };
  const onFrame = (s) => { if (s.over) return; ticks++; const all = {}; for (const side of ['blue', 'orange']) { const f = s[side]; if (!f.alive) continue; const p = per[side]; p.alive++; const cds = Object.values(f.cd); const every = cds.length && cds.every((c) => c > 0); all[side] = every; if (f.act === null) { p.noAct++; if (every) p.waitCd++; } } if (all.blue && all.orange) bothCd++; };
  let result;
  try { ({ result } = runMatch({ blue: A.brain, orange: B.brain }, { seed, kits, builds, record: false, onFrame })); } catch (e) { console.error(`  ! ${A.key} vs ${B.key}: ${e.message}`); continue; }
  const log = result.log; const deathAt = {}, burnedAt = {}, fireAt = {}; let uses = 0, immune = 0, immunePure = 0, miss = 0, dodges = 0, dmg = 0, judgedMiss = 0;
  for (const ev of log) {
    if (ev.type === 'use') uses++;
    else if (ev.type === 'death') deathAt[ev.who] = ev.t; else if (ev.type === 'burned') burnedAt[ev.who] = ev.t; else if (ev.type === 'burnedOut') fireAt[ev.who] = ev.t;
    else if (ev.type === 'immune') { immune++; const def = kits[ev.by]?.[ev.skill]; if (def && def.effects.every((e) => isControl(e.id) || !['damage', 'burn'].includes(e.id))) immunePure++; }
    else if (ev.type === 'miss') { miss++; if (ev.reason === 'airborne') dodges++; }
    else if (ev.type === 'evade') dodges++;
    else if (ev.type === 'damage') dmg++;
  }
  const cause = (side) => deathAt[side] == null ? 'nodeath' : (burnedAt[side] != null && Math.abs(burnedAt[side] - deathAt[side]) < 0.05 ? 'arena' : (fireAt[side] != null && Math.abs(fireAt[side] - deathAt[side]) < 0.05 ? 'fire' : 'hit'));
  let decided; if (result.reason === 'kill') decided = cause(result.winner === 'blue' ? 'orange' : 'blue'); else if (result.reason === 'double-ko') decided = 'double'; else decided = result.reason;
  recs.push({ a: A.key, b: B.key, seconds: result.seconds, decided, sd: result.seconds > SUDDEN_DEATH_AT, castsPer10: uses / 2 / result.seconds * 10, immune, immunePure, miss, dodges, dmg, bothCd: bothCd / Math.max(1, ticks), noAct: mean(['blue', 'orange'].map((s) => per[s].noAct / Math.max(1, per[s].alive))), waitCd: mean(['blue', 'orange'].map((s) => per[s].waitCd / Math.max(1, per[s].alive))), faults: (result.blue.faults || 0) + (result.orange.faults || 0) });
}
console.log(`${recs.length} matches, wall ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const secs = recs.map((r) => r.seconds); const dec = recs.reduce((a, r) => { a[r.decided] = (a[r.decided] || 0) + 1; return a; }, {});
console.log(`length: min ${Math.min(...secs).toFixed(1)} p25 ${q(secs, .25).toFixed(1)} median ${median(secs).toFixed(1)} p75 ${q(secs, .75).toFixed(1)} max ${Math.max(...secs).toFixed(1)} mean ${mean(secs).toFixed(1)}`);
console.log(`burn clock reached: ${pct(recs.filter((r) => r.sd).length, recs.length)} | 20–35 s band ${pct(secs.filter((s) => s >= 20 && s <= 35).length, recs.length)} | under 20 s ${pct(secs.filter((s) => s < 20).length, recs.length)}`);
console.log(`decided by: ${Object.entries(dec).map(([k, v]) => `${k} ${v} (${pct(v, recs.length)})`).join(', ')}`);
console.log(`casts/fighter/10 s ${mean(recs.map((r) => r.castsPer10)).toFixed(2)} | noAct ${pct(mean(recs.map((r) => r.noAct)), 1)} | waitingCd ${pct(mean(recs.map((r) => r.waitCd)), 1)} | bothAllCd ${pct(mean(recs.map((r) => r.bothCd)), 1)}`);
console.log(`immune/match ${mean(recs.map((r) => r.immune)).toFixed(2)} of which from pure-control casts (no damage/burn atom) ${mean(recs.map((r) => r.immunePure)).toFixed(2)} | miss/match ${mean(recs.map((r) => r.miss)).toFixed(2)} | dodges/match ${mean(recs.map((r) => r.dodges)).toFixed(2)} | faults ${recs.reduce((n, r) => n + r.faults, 0)}`);
// per-pairing archetype: by creature pair
const byPair = {}; for (const r of recs) { const k = [r.a.split('/')[1], r.b.split('/')[1]].sort().join('+'); (byPair[k] ||= []).push(r); }
for (const [k, rs] of Object.entries(byPair)) { const d = rs.reduce((a, r) => { a[r.decided] = (a[r.decided] || 0) + 1; return a; }, {}); console.log(`  ${k.padEnd(16)} n=${rs.length} median ${median(rs.map((r) => r.seconds)).toFixed(1)} s burn ${pct(rs.filter((r) => r.sd).length, rs.length)} decided ${Object.entries(d).map(([a, b]) => `${a} ${b}`).join(', ')}`); }
