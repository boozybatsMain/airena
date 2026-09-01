import { readFileSync } from 'node:fs';
import { runIsolated } from '../src/server/sandbox/index.js';
import { compileKit } from '../src/skills/compile.js';
const stub = { octopus: readFileSync('brains/kit-stub/octopus.js','utf8'), gorilla: readFileSync('brains/kit-stub/gorilla.js','utf8') };
const K = (a)=>compileKit(a).defs;
const heal = {delivery:'self',effects:['heal'],element:'frost'};
const shield = {delivery:'self',effects:['shield'],element:'frost'};
const foesSpec = [
  [{delivery:'bolt',effects:['damage']},{delivery:'cone',effects:['damage']},heal],
  [{delivery:'zone',effects:['burn']},{delivery:'beam',effects:['damage']},shield],
  [{delivery:'lob',effects:['root']},{delivery:'dash',effects:['damage']},{delivery:'self',effects:['boost'],channel:'speed'}],
  [{delivery:'beam',effects:['damage','burn']},{delivery:'blink',effects:['cleanse']},shield],
  [{delivery:'cone',effects:['damage','knock']},{delivery:'dash',effects:['damage']},shield],
  [{delivery:'bolt',effects:['blind']},{delivery:'lob',effects:['silence']},{delivery:'cone',effects:['damage']}],
  [{delivery:'zone',effects:['damage','root']},{delivery:'bolt',effects:['damage']},heal],
  [{delivery:'beam',effects:['damage']},{delivery:'zone',effects:['wall']},heal],
  [{delivery:'bolt',effects:['damage','stun']},{delivery:'blink',effects:['shield']},{delivery:'cone',effects:['damage']}],
  [{delivery:'lob',effects:['damage','burn']},{delivery:'dash',effects:['knock','damage']},heal],
  [{delivery:'cone',effects:['damage']},{delivery:'bolt',effects:['weaken'],channel:'armor'},heal],
  [{delivery:'beam',effects:['damage']},{delivery:'bolt',effects:['pull','damage']},shield],
];
const A = K([{delivery:'bolt',effects:['damage','stun']},shield,{delivery:'cone',effects:['damage']}]);
const seeds = [1000,8919,16838,24757,32676];
const rates = [];
const t0=Date.now(); let fights=0;
for (const [i,spec] of foesSpec.entries()) {
  const out = await runIsolated({ octopus: stub.octopus, gorilla: stub.gorilla }, { seeds, kits: { octopus: A, gorilla: K(spec) } });
  const w = out.results.filter(r=>r.winner==='octopus').length; fights += out.results.length;
  rates.push(w/seeds.length);
  console.log(`соперник ${i+1}: ${w}/${seeds.length} побед`);
}
console.log('время', Date.now()-t0, 'мс на', fights, 'боёв =', ((Date.now()-t0)/fights).toFixed(0), 'мс/бой');
const mean = rates.reduce((a,b)=>a+b,0)/rates.length;
const sd = Math.sqrt(rates.reduce((s,r)=>s+(r-mean)**2,0)/(rates.length-1));
console.log(`доля побед по соперникам: ${rates.map(r=>r.toFixed(2)).join(' ')}`);
console.log(`среднее ${(mean*100).toFixed(0)}%, разброс между соперниками sd=${sd.toFixed(2)}`);
console.log(`стандартная ошибка счёта на панели из 6 соперников: ±${(sd/Math.sqrt(6)*60).toFixed(1)} побед из 60`);
console.log(`то же, если бы 60 боёв были независимыми: ±${(Math.sqrt(mean*(1-mean)/60)*60).toFixed(1)} побед из 60`);
process.exit(0);
