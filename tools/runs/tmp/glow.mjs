import { registerHooks } from 'node:module';
registerHooks({ resolve(spec, ctx, next) { return next(spec === 'three' ? 'three/webgpu' : spec, ctx); } });
import * as THREE from 'three';
const R='/Users/boozybats/Public/Repos/work/Airena/';
const core = await import(R+'src/viewer/vfx/core.js');
const { Vfx } = await import(R+'src/viewer/vfx.js');

core.setGlowEnabled(true);
const scene = new THREE.Scene();
const pool=[];
const vfx = new Vfx(scene, { spawnMesh(o,l,u){ scene.add(o); pool.push({o,l,u}); return o; } });
const ctx = { bodyPos: () => new THREE.Vector3(), bodyShape: (w)=>({x:w==='blue'?-2:2,y:0,z:0,r:0.8,h:2,yaw:0}) };
vfx.now=0; vfx.update(0);
for (const el of ['ember','frost','kinetic','arc','void','acid','laser','time','gravity','radiation'])
  for (const k of ['zone','cone','impact','bolt','beam','status','wall','dash','jump','self','blink','lob'])
    try { vfx.play({element:el,kind:k,who:'blue',skill:'s'+k,x:1,z:1,x1:3,z1:3,t:0,effects:['damage'],effect:'stun'}, ctx); } catch(e){}
console.log('marked materials:', core.glowMarkCount());
// how many of those are OFF the scene (pool / Particles meshes not traversed by scene.traverse)?
const onScene = new Set(); scene.traverse((o)=>{ const m=o.material; if(!m) return; for (const one of Array.isArray(m)?m:[m]) onScene.add(one); });
const marks = core.__markedForTest ? core.__markedForTest() : [];
let off = 0; for (const m of marks) if (!onScene.has(m)) off++;
console.log('marked total', marks.length, 'UNREACHABLE by scene.traverse:', off);
// emulate main.js dropPost: setGlowEnabled(false) then scene.traverse strip
core.setGlowEnabled(false);
let left=0; scene.traverse((o)=>{ const m=o.material; if(!m) return; for (const one of Array.isArray(m)?m:[m]) if (one.mrtNode) left++; });
console.log('after setGlowEnabled(false): marks left on scene =', left, ' registry =', core.glowMarkCount());
