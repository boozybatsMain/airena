import { registerHooks } from 'node:module';
registerHooks({ resolve(spec, ctx, next) { return next(spec === 'three' ? 'three/webgpu' : spec, ctx); } });
const R='/Users/boozybats/Public/Repos/work/Airena/';
const THREE = await import('three');
const toLin=(v)=>(v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
const labF=(t)=>(t>0.008856?Math.cbrt(t):7.787*t+16/116);
const LAB=(r,g,b)=>{const Rr=toLin(r),G=toLin(g),B=toLin(b);
 const X=(Rr*0.4124+G*0.3576+B*0.1805)/0.95047,Y=Rr*0.2126+G*0.7152+B*0.0722,Z=(Rr*0.0193+G*0.1192+B*0.9505)/1.08883;
 return [116*labF(Y)-16,500*(labF(X)-labF(Y)),200*(labF(Y)-labF(Z))];};
const fmt=(name,c)=>{const s=c.clone().convertLinearToSRGB();const [L,a,b]=LAB(s.r,s.g,s.b);
 const hex='#'+[s.r,s.g,s.b].map(v=>Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,'0')).join('');
 return `${name.padEnd(22)} ${hex}  L*${L.toFixed(1).padStart(5)}  a*${a.toFixed(1).padStart(6)}  b*${b.toFixed(1).padStart(6)}  C*${Math.hypot(a,b).toFixed(1).padStart(5)}  labh ${(Math.atan2(b,a)*180/Math.PI).toFixed(1).padStart(6)}`;};

const core = await import(R+'src/viewer/vfx/core.js');
const { palette } = await import(R+'src/viewer/vfx.js');

console.log('=== finding 21 · graded palette, the mud band ===');
for (const el of ['ember','time','acid','radiation','laser','kinetic','frost']) {
  const P = palette(el);
  console.log('  '+el);
  P.forEach((c,i)=>console.log('    '+fmt(`stop ${i}`, c)));
}

console.log('\n=== finding 42 · frost mass, both roles (b* floor 0, C* cap 12) ===');
const MIST=new THREE.Color(0.77,0.84,0.88), MIST2=new THREE.Color(0.58,0.76,0.85),
      CLOUD=new THREE.Color(0.24,0.32,0.39), CLOUD2=new THREE.Color(0.38,0.48,0.55);
const P=palette('frost');
for (const [role,who] of [['own (player)','blue'],['foe (opponent)','orange']]) {
  globalThis.window={__airenaSides:{blue:'own',orange:'foe',mine:'blue'}};
  const w={k:0.45,bFloor:0,cap:12};
  console.log('  '+role);
  for (const [n,c] of [['mist',MIST],['mist2',MIST2],['cloud',CLOUD],['cloud2',CLOUD2],['haze (was P[1])',P[1]],['shell (was P[2])',P[2]]])
    console.log('    '+fmt(n, core.sideWash(c, who, w)));
}
console.log('\n  form (untouched, keeps the ice): ');
P.forEach((c,i)=>console.log('    '+fmt(`P[${i}]`, c)));

console.log('\n=== finding 42 · dome coverage over a body (#1A140E, L* 6.8) ===');
const body=[26,20,14];
const shell=core.sideWash(P[2],'blue',{k:0.45,bFloor:0,cap:12}).clone().convertLinearToSRGB();
const rim=core.sideWash(P[1],'blue',{k:0.45,bFloor:0,cap:12}).clone().convertLinearToSRGB();
const face=[0,1,2].map(i=>255*(shell[['r','g','b'][i]]*0.9+rim[['r','g','b'][i]]*0.1));
const L=(c)=>LAB(c[0]/255,c[1]/255,c[2]/255)[0];
for (const [label,a] of [['fill only',0.05],['fill + vein (max)',0.15],['old fill + vein (max)',0.38]]) {
  const c=body.map((v,i)=>v*(1-a)+face[i]*a);
  console.log(`  ${label.padEnd(22)} alpha ${a.toFixed(2)}  ->  L* ${L(c).toFixed(1)}  (+${(L(c)-L(body)).toFixed(1)})`);
}
