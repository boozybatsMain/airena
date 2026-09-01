import { readFileSync } from 'node:fs';
import { runIsolated } from '../src/server/sandbox/index.js';
import { compileKit } from '../src/skills/compile.js';
const stub = { octopus: readFileSync('brains/kit-stub/octopus.js','utf8'), gorilla: readFileSync('brains/kit-stub/gorilla.js','utf8') };
const K = (a)=>compileKit(a).defs;
const A = K([{delivery:'bolt',effects:['damage','stun'],element:'kinetic'},{delivery:'self',effects:['shield'],element:'frost'},{delivery:'cone',effects:['damage'],element:'ember'}]);
const foes = [
  ['снаряд+урон/конус/лечение', K([{delivery:'bolt',effects:['damage'],element:'kinetic'},{delivery:'cone',effects:['damage'],element:'kinetic'},{delivery:'self',effects:['heal'],element:'frost'}])],
  ['зона+горение/луч/щит', K([{delivery:'zone',effects:['burn'],element:'ember'},{delivery:'beam',effects:['damage'],element:'arc'},{delivery:'self',effects:['shield'],element:'frost'}])],
  ['навес+обездв/рывок+урон/усиление', K([{delivery:'lob',effects:['root'],element:'frost'},{delivery:'dash',effects:['damage'],element:'kinetic'},{delivery:'self',effects:['boost'],channel:'speed',element:'arc'}])],
];
const seeds = Array.from({length:20},(_,i)=>1000+i*7919);
for (const [name, F] of foes) {
  const out = await runIsolated({ octopus: stub.octopus, gorilla: stub.gorilla }, { seeds, kits: { octopus: A, gorilla: F } });
  const wins = out.results.filter(r=>r.winner==='octopus').length;
  const secs = out.results.map(r=>r.seconds);
  const uniq = new Set(out.results.map(r=>`${r.seconds}|${r.winner}`)).size;
  console.log(`против «${name}»: побед ${wins}/20, различных исходов ${uniq}/20, длины ${Math.min(...secs)}–${Math.max(...secs)} с`);
}
process.exit(0);
