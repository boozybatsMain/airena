import { DatabaseSync } from 'node:sqlite';
import { runIsolated } from '../src/server/sandbox/index.js';
import { compileKit } from '../src/skills/compile.js';
const db = new DatabaseSync('data/airena.db');
const rows = db.prepare("select id, archetype, rating, kit_json, brain_source from creature where kit_active=1 and brain_source is not null").all();
const kitOf = (c) => { const o = compileKit(JSON.parse(c.kit_json||'[]')); return o.problems.length?null:o.defs; };
const seeds = [1,2,3,7,11,101,1000,7919,123457,999983];
const oct = rows.filter(r=>r.archetype==='octopus');
const gor = rows.filter(r=>r.archetype==='gorilla');
for (const a of oct.slice(0,3)) {
  for (const b of gor) {
    const out = await runIsolated({ octopus: a.brain_source, gorilla: b.brain_source }, { seeds, kits: { octopus: kitOf(a), gorilla: kitOf(b) } });
    const secs = out.results.map(r=>r.seconds);
    const wins = out.results.filter(r=>r.winner==='octopus').length;
    const draws = out.results.filter(r=>!r.winner).length;
    const uniq = new Set(out.results.map(r=>`${r.seconds}|${r.winner}`)).size;
    const uses = out.results[0].octopus.uses;
    console.log(`${a.id.slice(2,8)} vs ${b.id.slice(2,8)}: побед ${wins}/10, ничьих ${draws}, различных исходов ${uniq}/10, длины ${Math.min(...secs)}–${Math.max(...secs)} с, использований k ${JSON.stringify(uses)}`);
  }
}
process.exit(0);
