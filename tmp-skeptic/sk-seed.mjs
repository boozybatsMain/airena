import { DatabaseSync } from 'node:sqlite';
import { runIsolated } from '../src/server/sandbox/index.js';
import { compileKit } from '../src/skills/compile.js';
const db = new DatabaseSync('data/airena.db');
const all = db.prepare("select id, archetype, rating, kit_json, brain_source from creature where state='active' and brain_source is not null and kit_json is not null").all();
const kitOf = (c) => { try { const o = compileKit(JSON.parse(c.kit_json||'[]')); return o.problems.length?null:o.defs; } catch { return null; } };
const me = all.find(r => r.id === 'c_70986a43-271');
const o = all.find(r => r.id === 'c_04cc9eb0-595');
const mySlot='gorilla', oppSlot='octopus';
const seeds = [1,2,3,7,11,101,1000,7919,123457,999983];
const out = await runIsolated({ [mySlot]: me.brain_source, [oppSlot]: o.brain_source }, { seeds, kits: { [mySlot]: kitOf(me), [oppSlot]: kitOf(o) } });
for (const r of out.results) {
  console.log(`сид ${String(r.seed).padStart(7)} | ${r.seconds} с | winner=${r.winner} ${r.reason} | мой урон ${r.gorilla.damageDealt.toFixed?.(1) ?? r.gorilla.damageDealt} | попаданий ${JSON.stringify(r.gorilla.hits)} | промахов ${JSON.stringify(r.gorilla.misses)} | использований ${JSON.stringify(r.gorilla.uses)}`);
}
// без наборов (четыре захардкоженных умения) — для сравнения
const out2 = await runIsolated({ [mySlot]: me.brain_source, [oppSlot]: o.brain_source }, { seeds });
console.log('--- без наборов ---');
for (const r of out2.results) console.log(`сид ${String(r.seed).padStart(7)} | ${r.seconds} с | winner=${r.winner} ${r.reason}`);
process.exit(0);
