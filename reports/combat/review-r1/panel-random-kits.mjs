/* 40 random legal kits on the pilot panel, single process. */
import { readFileSync } from 'node:fs';
const ROOT = '/Users/boozybats/Public/Repos/work/Airena';
const { compileBrain } = await import(`${ROOT}/src/brain/host.js`);
const { runMatch } = await import(`${ROOT}/src/core/match.js`);
const { compileKit } = await import(`${ROOT}/src/skills/compile.js`);
const { normalizeBuild, SUDDEN_DEATH_AT } = await import(`${ROOT}/src/core/config.js`);
const { DELIVERIES, EFFECTS, CHANNELS, SELF_ALLOWED, validateKit, validateSkill } = await import(`${ROOT}/src/skills/registry.js`);
const { mulberry32 } = await import(`${ROOT}/src/core/rng.js`);

const N = Number(process.argv[2] || 40), OPP = Number(process.argv[3] || 2), SEEDS = [1];
const rng = mulberry32(20260907);
const pick = (xs) => xs[Math.floor(rng() * xs.length)];
const pickW = (items, w) => { let r = rng() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < items.length; i++) { r -= w[i]; if (r < 0) return items[i]; } return items[items.length - 1]; };
const DELIVERY_IDS = Object.keys(DELIVERIES), EFFECT_IDS = Object.keys(EFFECTS), CHANNEL_IDS = Object.keys(CHANNELS);
function sampleSkill() {
  const delivery = pick(DELIVERY_IDS);
  const selfClass = DELIVERIES[delivery].klass === 'self';
  const pool = selfClass ? EFFECT_IDS.filter((e) => SELF_ALLOWED.has(e)) : EFFECT_IDS;
  const n = pickW([1, 2, 3], [0.5, 0.35, 0.15]);
  const effects = []; let g = 0;
  while (effects.length < n && g++ < 50) { const e = pick(pool); if (!effects.includes(e)) effects.push(e); }
  const skill = { delivery, effects, element: 'kinetic' };
  if (effects.some((e) => EFFECTS[e].needsChannel)) skill.channel = pick(CHANNEL_IDS);
  return validateSkill(skill).length ? null : skill;
}
function sampleKit() {
  for (let t = 0; t < 4000; t++) {
    const kit = []; let ok = true;
    for (let i = 0; i < 3; i++) { const s = sampleSkill(); if (!s) { ok = false; break; } kit.push(s); }
    if (!ok || validateKit(kit).length) continue;
    return kit;
  }
  return null;
}
const kits = []; const seen = new Set();
while (kits.length < N) { const k = sampleKit(); if (!k) continue; const sig = JSON.stringify(k); if (seen.has(sig)) continue; seen.add(sig); kits.push(k); }
const label = (kit) => kit.map((s) => `${s.delivery}:${s.effects.join('+')}${s.channel ? '/' + s.channel : ''}`).join(' | ');
const compiled = kits.map((k) => { const c = compileKit(k); if (c.problems.length) throw new Error(JSON.stringify(c.problems)); return c.defs; });
const build = normalizeBuild(null).build;
const PILOTS = { stub: `${ROOT}/brains/kit-stub/octopus.js`, rusher: `${ROOT}/brains/pilots/rusher.js`, kiter: `${ROOT}/brains/pilots/kiter.js`, controller: `${ROOT}/brains/pilots/controller.js` };
const brains = {};
for (const [name, file] of Object.entries(PILOTS)) brains[name] = { blue: compileBrain(readFileSync(file, 'utf8'), `${name}:blue`), orange: compileBrain(readFileSync(file, 'utf8'), `${name}:orange`) };

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const pct = (a, b) => `${(100 * a / Math.max(1, b)).toFixed(0)}%`;

const out = { all: [], byPilot: {} };
const jobs = [];
for (let i = 0; i < kits.length; i++) {
  const others = new Set(); while (others.size < OPP) { const j = Math.floor(rng() * kits.length); if (j !== i) others.add(j); }
  for (const j of others) for (const pilot of Object.keys(PILOTS)) for (const seed of SEEDS) jobs.push({ i, j, pilot, seed });
}
console.log(`${kits.length} kits, ${jobs.length} matches (${OPP} opponents × ${Object.keys(PILOTS).length} pilots × ${SEEDS.length} seed)`);
const t0 = Date.now();
let maxCdSeen = 0; let maxCdStretch = 0; let maxCdStretchWhat = '';
for (const job of jobs) {
  const b = brains[job.pilot]; b.blue.reset(); b.orange.reset();
  const kitsSide = { blue: compiled[job.i], orange: compiled[job.j] };
  const per = { blue: { alive: 0, noAct: 0, waitCd: 0, allCd: 0 }, orange: { alive: 0, noAct: 0, waitCd: 0, allCd: 0 } };
  let ticks = 0, bothCd = 0, sdTicks = 0;
  const stretch = { blue: {}, orange: {} }; // slot -> ticks of continuous cd>0
  const onFrame = (s) => {
    if (s.over) return; ticks++;
    if (s.t >= SUDDEN_DEATH_AT) sdTicks++;
    const all = {};
    for (const side of ['blue', 'orange']) {
      const f = s[side]; if (!f.alive) continue; const p = per[side]; p.alive++;
      const cds = Object.entries(f.cd);
      for (const [k, c] of cds) { if (c > maxCdSeen) maxCdSeen = c; if (c > 0) { stretch[side][k] = (stretch[side][k] || 0) + 1; } else { if ((stretch[side][k] || 0) > maxCdStretch) { maxCdStretch = stretch[side][k]; maxCdStretchWhat = `${job.pilot} kit${job.i}/${job.j} ${side} ${k} ${kitsSide[side][k].kind}:${kitsSide[side][k].effects.map(e=>e.id).join('+')}`; } stretch[side][k] = 0; } }
      const every = cds.length > 0 && cds.every(([, c]) => c > 0); all[side] = every;
      if (every) p.allCd++;
      if (f.act === null) { p.noAct++; if (every) p.waitCd++; }
    }
    if (all.blue && all.orange) bothCd++;
  };
  const { result } = runMatch({ blue: b.blue, orange: b.orange }, { seed: job.seed, kits: kitsSide, builds: { blue: build, orange: build }, record: false, onFrame });
  const log = result.log;
  const deathAt = {}, burnedAt = {}, fireAt = {}; let uses = { blue: 0, orange: 0 }, immune = 0, miss = 0, hit = 0, dodges = 0, judged = 0;
  for (const ev of log) {
    if (ev.type === 'use') uses[ev.who]++;
    else if (ev.type === 'death') deathAt[ev.who] = ev.t; else if (ev.type === 'burned') burnedAt[ev.who] = ev.t; else if (ev.type === 'burnedOut') fireAt[ev.who] = ev.t;
    else if (ev.type === 'immune') immune++;
    else if (ev.type === 'miss') { miss++; if (ev.reason === 'airborne') dodges++; }
    else if (ev.type === 'evade') dodges++;
    else if (ev.type === 'damage') hit++;
  }
  const cause = (side) => deathAt[side] == null ? 'nodeath' : (burnedAt[side] != null && Math.abs(burnedAt[side] - deathAt[side]) < 0.05 ? 'arena' : (fireAt[side] != null && Math.abs(fireAt[side] - deathAt[side]) < 0.05 ? 'fire' : 'hit'));
  let decided; if (result.reason === 'kill') decided = cause(result.winner === 'blue' ? 'orange' : 'blue'); else if (result.reason === 'double-ko') decided = 'double'; else decided = result.reason;
  const T = Math.max(1, ticks);
  const rec = { pilot: job.pilot, i: job.i, j: job.j, seconds: result.seconds, reason: result.reason, decided, sd: result.seconds > SUDDEN_DEATH_AT, uses, castsPer10: (uses.blue + uses.orange) / 2 / result.seconds * 10, immune, miss, dodges, bothCd: bothCd / T,
    noAct: mean(['blue', 'orange'].map((s) => per[s].noAct / Math.max(1, per[s].alive))), waitCd: mean(['blue', 'orange'].map((s) => per[s].waitCd / Math.max(1, per[s].alive))), deadSlots: ['blue', 'orange'].reduce((n, s) => n + Object.keys(kitsSide[s]).filter((k) => !log.some((e) => e.type === 'use' && e.who === s && e.skill === k)).length, 0) };
  out.all.push(rec); (out.byPilot[job.pilot] ||= []).push(rec);
}
console.log(`wall ${((Date.now() - t0) / 1000).toFixed(1)} s`);
function report(name, rs) {
  const secs = rs.map((r) => r.seconds);
  const dec = rs.reduce((a, r) => { a[r.decided] = (a[r.decided] || 0) + 1; return a; }, {});
  console.log(`\n[${name}] ${rs.length} matches`);
  console.log(`  length: min ${Math.min(...secs).toFixed(1)} p25 ${q(secs, .25).toFixed(1)} median ${median(secs).toFixed(1)} p75 ${q(secs, .75).toFixed(1)} max ${Math.max(...secs).toFixed(1)} mean ${mean(secs).toFixed(1)}`);
  console.log(`  burn clock reached (>30 s): ${pct(rs.filter((r) => r.sd).length, rs.length)} | in 20–35 s band: ${pct(secs.filter((s) => s >= 20 && s <= 35).length, rs.length)} | under 20 s: ${pct(secs.filter((s) => s < 20).length, rs.length)}`);
  console.log(`  decided by: ${Object.entries(dec).map(([k, v]) => `${k} ${v} (${pct(v, rs.length)})`).join(', ')}`);
  console.log(`  casts/fighter/10 s mean ${mean(rs.map((r) => r.castsPer10)).toFixed(2)} | noAct ${pct(mean(rs.map((r) => r.noAct)), 1)} | waitingCd ${pct(mean(rs.map((r) => r.waitCd)), 1)} | bothAllCd ${pct(mean(rs.map((r) => r.bothCd)), 1)}`);
  console.log(`  immune/match ${mean(rs.map((r) => r.immune)).toFixed(2)} | miss/match ${mean(rs.map((r) => r.miss)).toFixed(2)} | dodges/match ${mean(rs.map((r) => r.dodges)).toFixed(2)} | dead slots ${rs.reduce((n, r) => n + r.deadSlots, 0)}/${rs.length * 6} (${pct(rs.reduce((n, r) => n + r.deadSlots, 0), rs.length * 6)})`);
}
report('ALL PILOTS', out.all);
for (const [p, rs] of Object.entries(out.byPilot)) report(p, rs);
console.log(`\nmax cooldown value ever seen in a snapshot: ${maxCdSeen.toFixed(3)} s; longest continuous cd>0 stretch: ${(maxCdStretch / 30).toFixed(2)} s (${maxCdStretchWhat})`);
console.log('\nkits:'); kits.forEach((k, i) => console.log(`  ${String(i).padStart(2)} ${label(k)}`));
