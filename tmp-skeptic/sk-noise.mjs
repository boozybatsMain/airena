import { DatabaseSync } from 'node:sqlite';
import { runIsolated } from '../src/server/sandbox/index.js';
import { compileKit } from '../src/skills/compile.js';

const db = new DatabaseSync('data/airena.db');
const all = db.prepare("select id, archetype, rating, kit_json, brain_source from creature where state='active' and brain_source is not null and kit_json is not null").all();
const kitOf = (c) => { try { const o = compileKit(JSON.parse(c.kit_json||'[]')); return o.problems.length?null:o.defs; } catch { return null; } };
const me = all.find(r => r.id === 'c_70986a43-271');
const opp = all.filter(r => r.id !== me.id).sort((a,b)=>Math.abs(a.rating-me.rating)-Math.abs(b.rating-me.rating)).slice(0,6);
const mySlot = me.archetype === 'gorilla' ? 'gorilla' : 'octopus';
const oppSlot = mySlot === 'octopus' ? 'gorilla' : 'octopus';

async function bench(kitDefs, seedBase) {
  let wins=0, draws=0, played=0, secs=[];
  for (const [oi,o] of opp.entries()) {
    const seeds = Array.from({length:10},(_,i)=> seedBase + (oi*10+i)*7919);
    const out = await runIsolated({ [mySlot]: me.brain_source, [oppSlot]: o.brain_source },
      { seeds, kits: { [mySlot]: kitDefs, [oppSlot]: kitOf(o) } });
    for (const r of out.results) { played++; secs.push(r.seconds); if (r.winner===mySlot) wins++; if(!r.winner) draws++; }
  }
  secs.sort((a,b)=>a-b);
  return { wins, draws, played, median: secs[Math.floor(secs.length/2)] };
}

const mine = kitOf(me);
console.log('мой набор:', JSON.parse(me.kit_json).map(s=>`${s.delivery}:${(s.effects||[]).join('+')}`).join(' | '));
console.log('панель:', opp.map(o=>o.id.slice(2,8)+'@'+Math.round(o.rating)).join(' '));
const t0=Date.now();
for (const base of [1000, 50000, 123457, 777771, 909091]) {
  const t=Date.now();
  const r = await bench(mine, base);
  console.log(`сид-пачка ${base}: побед ${r.wins}/60, ничьих ${r.draws}, медиана боя ${r.median} с, ${Date.now()-t} мс (${((Date.now()-t)/60).toFixed(0)} мс/бой)`);
}
console.log('итого', Date.now()-t0, 'мс');
process.exit(0);
