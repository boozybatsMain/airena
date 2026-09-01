/** The viewer's own telegraph code, cut out of src/viewer/main.js and made runnable. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three/webgpu';

const ROOT = '/Users/boozybats/Public/Repos/work/Airena';
const SRC = readFileSync(resolve(ROOT, 'src/viewer/main.js'), 'utf8');

function at(needle) {
  const i = SRC.indexOf(needle);
  if (i < 0) throw new Error(`main.js no longer contains ${JSON.stringify(needle)}`);
  if (SRC.indexOf(needle, i + 1) >= 0) throw new Error(`${JSON.stringify(needle)} appears twice`);
  return i;
}
const cut = (from, to) => {
  const a = at(from), b = at(to);
  if (b <= a) throw new Error('slice runs backwards');
  return SRC.slice(a, b);
};

export function buildTelegraph(cfg) {
  const slices = [
    cut('const HALF = cfg.arena.half;', 'const scene = new THREE.Scene();'),
    cut('const SOLIDS = [];', 'function segSolid(eye, px, py, pz, o) {'),
    cut('const COLOR = { octopus:', '/**\n * Lay a flat geometry on the ground'),
    cut('function layFlat(obj)', '/**\n * Metres of travel per gait cycle'),
    cut('function makeTelegraph(id) {', '/**\n * How far a charge launched from here'),
    cut('function dashReach(id, x, z, h, budget) {', 'const tele = { octopus: makeTelegraph'),
    cut('const tele = { octopus: makeTelegraph', '/**\n * What a fighter looks like when there is'),
    cut("/** Where in a skill's own clock we are", 'function updateTelegraph(id, v) {'),
    cut('function updateTelegraph(id, v) {', "const hud = $('#hud');"),
  ];
  const prelude = `
    const scene = { add() {} };
    const kitLabels = { octopus: null, gorilla: null };
    const performance = { now: () => 0 };
  `;
  const epilogue = '\nreturn { tele, updateTelegraph, dashReach, beamReach, kitLabels, SOLIDS };\n';
  const fn = new Function('THREE', 'cfg', prelude + slices.join('\n') + epilogue);
  return fn(THREE, cfg);
}
