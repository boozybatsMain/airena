// Scratch: one game with a trace line injected into a COPY of the pilot source (the file is untouched).
import fs from 'node:fs';
import path from 'node:path';
import { compileBrain } from '../../../src/brain/host.js';
import { runMatch } from '../../../src/core/match.js';
import { compileKit } from '../../../src/skills/compile.js';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const KITS = {
  7: [{ delivery: 'cone', effects: ['blind'], element: 'kinetic' }, { delivery: 'bolt', effects: ['heal', 'damage'], element: 'arc' }, { delivery: 'cone', effects: ['burn'], element: 'ember' }],
  9: [{ delivery: 'cone', effects: ['heal', 'silence'], element: 'kinetic' }, { delivery: 'zone', effects: ['weaken'], channel: 'cooldown', element: 'arc' }, { delivery: 'cone', effects: ['burn', 'silence'], element: 'ember' }],
};
const ki = Number(process.argv[2] || 7), seed = Number(process.argv[3] || 170), mine = process.argv[4] || 'blue';
if (process.env.KIT) KITS[ki] = JSON.parse(process.env.KIT);
let srcA = fs.readFileSync(path.join(ROOT, 'brains/pilots/kiter.js'), 'utf8');
srcA = srcA.replace('  api.moveTo(goal.x, goal.z);\n}', "  if (Math.round(p.t*15) % 8 === 0) console.log(`${p.t.toFixed(1)} d=${en.dist.toFixed(1)} want=${want.toFixed(1)} poke=${(p.t < pokeUntil)} close=${closing.toFixed(1)} tele=${!!tele} proj=${!!proj} wait=${dmgWait.toFixed(1)} goal=${goal.x.toFixed(0)},${goal.z.toFixed(0)} me=${me.x.toFixed(0)},${me.z.toFixed(0)} hp=${hpF.toFixed(2)}/${enF.toFixed(2)}`);\n  api.moveTo(goal.x, goal.z);\n}");
const srcB = fs.readFileSync(path.join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8');
const other = mine === 'blue' ? 'orange' : 'blue';
const brains = { [mine]: compileBrain(srcA, mine), [other]: compileBrain(srcB, other) };
const defs = compileKit(KITS[ki]).defs;
const r = runMatch(brains, { seed, kits: { blue: defs, orange: defs } }).result;
console.log(`winner ${r.winner} ${r.seconds}s uses ${JSON.stringify(r[mine].uses)} faults ${r[mine].faults}`);
console.log(brains[mine].logs.slice(0, 70).join('\n'));
