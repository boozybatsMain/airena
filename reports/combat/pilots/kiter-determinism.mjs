// Scratch: same kit, same seed, three ways — fresh compile, after reset, after other matches.
import fs from 'node:fs';
import path from 'node:path';
import { compileBrain } from '../../../src/brain/host.js';
import { runMatch } from '../../../src/core/match.js';
import { compileKit } from '../../../src/skills/compile.js';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const srcA = fs.readFileSync(path.join(ROOT, 'brains/pilots/kiter.js'), 'utf8');
const srcB = fs.readFileSync(path.join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8');
const kit = [
  { delivery: 'dash', effects: ['weaken', 'shield'], channel: 'armor', element: 'kinetic' },
  { delivery: 'cone', effects: ['heal', 'boost'], channel: 'damage', element: 'kinetic' },
  { delivery: 'lob', effects: ['burn'], element: 'ember' },
];
const defs = compileKit(kit).defs;
const sig = (r) => `${r.winner} ${r.seconds} ${r.blue.damageDealt.toFixed(2)} ${r.orange.damageDealt.toFixed(2)}`;
const fresh = () => ({ blue: compileBrain(srcA, 'blue'), orange: compileBrain(srcB, 'orange') });
let b = fresh();
console.log('fresh      ', sig(runMatch(b, { seed: 200, kits: { blue: defs, orange: defs } }).result));
b.blue.reset(); b.orange.reset();
console.log('after reset', sig(runMatch(b, { seed: 200, kits: { blue: defs, orange: defs } }).result));
b = fresh();
runMatch(b, { seed: 7, kits: { blue: defs, orange: defs } });
b.blue.reset(); b.orange.reset();
console.log('after other', sig(runMatch(b, { seed: 200, kits: { blue: defs, orange: defs } }).result));
b = fresh();
console.log('fresh again', sig(runMatch(b, { seed: 200, kits: { blue: defs, orange: defs } }).result));
