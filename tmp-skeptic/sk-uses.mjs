import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runIsolated } from '../src/server/sandbox/index.js';
import { compileKit } from '../src/skills/compile.js';
const db = new DatabaseSync('data/airena.db');
const rows = db.prepare("select id, archetype, rating, kit_json, kit_active, brain_source, is_library from creature where state='active' and brain_source is not null and kit_json is not null order by rating desc").all();
const kitOf = (c) => { const o = compileKit(JSON.parse(c.kit_json||'[]')); return o.problems.length?null:o.defs; };
const stub = { octopus: readFileSync('brains/kit-stub/octopus.js','utf8'), gorilla: readFileSync('brains/kit-stub/gorilla.js','utf8') };
const foeKit = compileKit([
  { delivery:'bolt', effects:['damage'], element:'kinetic' },
  { delivery:'cone', effects:['damage'], element:'kinetic' },
  { delivery:'self', effects:['heal'], element:'frost' },
]).defs;
const seeds = [11,22,33];
let ownZero=0, stubZero=0, n=0;
for (const c of rows) {
  const mine = c.archetype==='gorilla'?'gorilla':'octopus';
  const foe = mine==='gorilla'?'octopus':'gorilla';
  const kits = { [mine]: kitOf(c), [foe]: foeKit };
  const own = await runIsolated({ [mine]: c.brain_source, [foe]: stub[foe] }, { seeds, kits });
  const ref = await runIsolated({ [mine]: stub[mine], [foe]: stub[foe] }, { seeds, kits });
  const u = (res) => res.results.reduce((s,r)=> s + Object.values(r[mine].uses).reduce((a,b)=>a+b,0), 0);
  const w = (res) => res.results.filter(r=>r.winner===mine).length;
  const uo = u(own), ur = u(ref);
  n++; if (uo===0) ownZero++; if (ur===0) stubZero++;
  console.log(`${c.id.slice(2,8)} ${c.archetype} kit_active=${c.kit_active} lib=${c.is_library} | свой мозг: ${uo} использований, ${w(own)}/3 побед | эталон: ${ur} использований, ${w(ref)}/3 побед`);
}
console.log(`\nсуществ: ${n}; ни одного применения умения своим мозгом: ${ownZero}; эталонным: ${stubZero}`);
process.exit(0);
