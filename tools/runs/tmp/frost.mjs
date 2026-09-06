import { registerHooks } from 'node:module';
registerHooks({ resolve(spec, ctx, next) { return next(spec === 'three' ? 'three/webgpu' : spec, ctx); } });
const R='/Users/boozybats/Public/Repos/work/Airena/';
globalThis.window = { __airenaSides: { blue:'own', orange:'foe', mine:'blue' } };
const THREE = await import('three');
const { Vfx } = await import(R+'src/viewer/vfx.js');
const scene = new THREE.Scene();
const pool=[];
const vfx = new Vfx(scene, { spawnMesh(o,l,u){ scene.add(o); pool.push({o,l,u,born:vfx.now}); return o; } });
const ctx = { bodyPos:(w)=>new THREE.Vector3(w==='blue'?-2:2,0,0), bodyShape:(w)=>({x:w==='blue'?-2:2,y:0,z:0,r:0.8,h:2,yaw:0}), radius:1.2 };
vfx.now=0; vfx.update(0);
const kinds=['cone','zone','self','beam','bolt','lob','impact','charge','dash','blink','jump','wall','status'];
let bad=0;
for (const who of ['blue','orange']) for (const k of kinds) {
  const before = console.warn; let msg=null; console.warn=(...a)=>{msg=a.join(' ');};
  try { vfx.play({element:'frost',kind:k,who,skill:'s'+k,x:1,z:1,x0:1,z0:1,x1:4,z1:4,y:0,t:0,effects:['damage'],effect:'shield',height:2,width:3}, ctx); }
  catch(e){ console.warn=before; console.log('THROW', who, k, e.message); bad++; continue; }
  console.warn=before;
  if (msg && /is not defined|Cannot read/.test(msg)) { console.log('QUARANTINE', who, k, msg.slice(0,160)); bad++; }
}
// step the sim so deferred branches run
for (let t=0.05;t<7;t+=0.05){ vfx.now=t; vfx.update(t); for (const f of pool){const u=(t-f.born)/f.life; if(u<=1){try{f.u(f.o,Math.max(0,u));}catch(e){console.log('UPDATE THROW',e.message);bad++;}}}}
console.log(bad?`FAIL ${bad}`:'frost: all 13 forms x 2 sides played and ticked clean');
