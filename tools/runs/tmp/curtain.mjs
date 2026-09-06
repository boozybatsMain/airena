import { registerHooks } from 'node:module';
registerHooks({ resolve(spec, ctx, next) { return next(spec === 'three' ? 'three/webgpu' : spec, ctx); } });
import * as THREE from 'three';
const ROOT='/Users/boozybats/Public/Repos/work/Airena/';
const { Vfx, clearGlowMarks, glowMarkCount, sideTone, sideWash } = await import(ROOT+'src/viewer/vfx.js');
const core = await import(ROOT+'src/viewer/vfx/core.js');

const scene = new THREE.Scene();
const pool = [];
const vfx = new Vfx(scene, { spawnMesh(obj, life, update) { scene.add(obj); pool.push({ obj, life, update, born: vfx.now }); return obj; } });
const ctx = { bodyPos: () => new THREE.Vector3(0,0,0), bodyShape: (w) => ({ x: w==='blue'?-2:2, y:0, z:0, r:0.8, h:2.0, yaw:0 }) };
const step = (t) => { vfx.now = t; vfx.update(t); for (const f of pool) { const u=(t-f.born)/f.life; if(u<=1) { try{f.update(f.obj,Math.max(0,u));}catch(e){} } else if(f.obj.parent) scene.remove(f.obj); } };

vfx.now = 0; vfx.update(0);
const play = (el, kind, who='blue', extra={}) => vfx.play({ element: el, kind, who, skill:'s1', x: 1, z: 1, x1: 3, z1: 3, t: 0, effects:['damage'], ...extra }, ctx);
for (const el of ['ember','frost','kinetic','arc','void','acid']) { for (const k of ['zone','cone','impact','bolt']) { try { play(el,k);}catch(e){console.log('play fail',el,k,e.message);} } }
step(0.5);
const liveBefore = vfx.staged.filter(r=>!r.done && r.obj.parent).length;
// how many particles are alive at t=0.5
const alive = (t) => { const A=vfx.body.arr,S=vfx.body.stride,O=vfx.body.off; let n=0; for(let i=0;i<vfx.body.max;i++){const b=A[i*S+O.cfg],l=A[i*S+O.cfg+1]; if(l>0){const u=(t-b)/l; if(u>=0&&u<1)n++;} } return n; };
console.log('t=0.5 staged live', liveBefore, 'particles alive', alive(0.5));
const n = vfx.clearField(0.3);
console.log('clearField draped', n);
step(0.6);
console.log('t=0.6 particles alive', alive(0.6), 'faded meshes', vfx.staged.filter(r=>r.at>=0).length);
step(0.81);
step(0.9);
console.log('t=0.9 particles alive', alive(0.9), 'still on scene', vfx.staged.filter(r=>!r.done && r.obj.parent).length, 'done', vfx.staged.filter(r=>r.done).length);
// restore check: fades back to their original
let bad=0; for (const r of vfx.staged) if (r.done && r.mats) for (const it of r.mats) { const f=it.o.material.userData.fade; const v=f?f.value:it.o.material.opacity; if (Math.abs(v-it.v)>1e-6) bad++; }
console.log('materials NOT restored:', bad);
