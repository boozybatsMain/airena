function build(THREE, TSL) {
  // БОЕВАЯ СТЕКЛЯННАЯ МЕДУЗА. Качество: хрупкая стеклянная масса + холодная механизация.
  // Пропорции: колокол R1.7 H1.3 — самая широкая и толстая масса; 8 длинных щупалец (7 длин тела),
  // 4 ротовые руки с лопастями. Внутри колокола — тёмное машинное ядро, видимое сквозь стекло.

  const C = {
    shell: 0xD8D2C6, shell2: 0xB5AC9C, gun: 0x55524C, steel: 0x6B665E,
    dark: 0x3E3A34, bronze: 0x4A4238, cable: 0x1E1D1B, rust: 0xC2521E
  };
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0d10, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.92 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x2b3238, metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  const glassDark = new THREE.MeshPhysicalMaterial({ color: 0x141a1e, metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.55, side: THREE.DoubleSide });

  // TSL: грязь на рёбрах и низу, пыль на верхних гранях — не камуфляж
  const posL = TSL.positionLocal, norL = TSL.normalLocal;
  const hash = (p) => TSL.fract(TSL.sin(TSL.dot(p, TSL.vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const noise = (p) => {
    const i = TSL.floor(p), f = TSL.fract(p).mul(p).mul(TSL.sub(3.0, p.mul(2.0)));
    return TSL.mix(TSL.mix(hash(i), hash(TSL.add(i, TSL.vec3(1, 0, 0))), f.x),
      TSL.mix(hash(TSL.add(i, TSL.vec3(0, 1, 0))), hash(TSL.add(i, TSL.vec3(1, 1, 0))), f.x), f.y);
  };
  const wearNode = TSL.Fn(() => {
    const n = noise(posL.mul(6.0)).mul(0.5).add(noise(posL.mul(14.0)).mul(0.3));
    const edge = TSL.smoothstep(0.55, 0.95, TSL.abs(posL.y).mul(0.6).add(TSL.length(posL.xz).mul(0.45)));
    const down = TSL.smoothstep(0.0, -0.7, norL.y);
    const dust = TSL.smoothstep(0.1, 0.8, norL.y).mul(0.18);
    const grime = n.mul(edge.mul(0.55).add(down.mul(0.35)));
    return TSL.vec4(TSL.vec3(0.05, 0.045, 0.04).mul(grime).sub(TSL.vec3(0.02, 0.02, 0.015).mul(dust)), 1.0);
  });
  const shellMat = new THREE.MeshStandardMaterial({ color: C.shell, metalness: 0.1, roughness: 0.6 });
  shellMat.colorNode = TSL.vec4(TSL.mul(TSL.vec3(0.847, 0.824, 0.776), TSL.vec3(1.0)), 1.0);
  shellMat.emissiveNode = TSL.mul(wearNode().xyz, 0.6).xyz ? shellMat.colorNode : shellMat.colorNode; // wear via emissive shift below
  const wearMix = wearNode;
  const shellWorn = new THREE.MeshStandardMaterial({ color: C.shell2, metalness: 0.12, roughness: 0.65 });
  const metalMat = new THREE.MeshStandardMaterial({ color: C.gun, metalness: 0.8, roughness: 0.55 });
  const steelMat = new THREE.MeshStandardMaterial({ color: C.steel, metalness: 0.85, roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: C.dark, metalness: 0.7, roughness: 0.7 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: C.bronze, metalness: 0.75, roughness: 0.55 });
  const cableMat = new THREE.MeshStandardMaterial({ color: C.cable, metalness: 0.0, roughness: 0.9 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: C.cable, metalness: 0.0, roughness: 0.95 });
  const rustMat = new THREE.MeshStandardMaterial({ color: C.rust, metalness: 0.3, roughness: 0.7 });
  // износ: применяем через emissiveNode у белой краски
  shellMat.emissiveNode = TSL.mul(wearNode().rgb, 0.35);

  const root = new THREE.Group(); root.name = 'medusa';

  // ---------- helpers ----------
  const mesh = (g, m, name, parent, x=0, y=0, z=0) => {
    const o = new THREE.Mesh(g, m); o.name = name; o.position.set(x, y, z);
    if (parent) parent.add(o); return o;
  };
  const bolt = (r=0.035) => new THREE.CylinderGeometry(r, r*1.15, r*1.2, 6);
  const boltRow = (parent, name, n, r, m, x0, x1, y, z) => {
    for (let i=0;i<n;i++) mesh(bolt(r), m, name+i, parent, x0+(x1-x0)*i/(n-1||1), y, z);
  };
  const hose = (pts, rad, name, parent, mat) => {
    const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(c, 20, rad, 7), mat || cableMat, name, parent);
  };

  // ---------- BELL (leading end) ----------
  const bell = new THREE.Group(); bell.name = 'bell'; root.add(bell);

  // стеклянный купол — латунный профиль, стекло тёмное
  const domePts = [];
  for (let i=0;i<=12;i++){ const t=i/12; domePts.push(new THREE.Vector2(Math.sin(t*Math.PI*0.62)*1.7*(0.25+0.75*t)+0.12*(1-t), 1.35*Math.cos(t*Math.PI*0.42))); }
  domePts.reverse();
  mesh(new THREE.LatheGeometry(domePts, 28), glassMat, 'domeGlass', bell);

  // каркасные рёбра купола — тёмная сталь
  for (let i=0;i<6;i++){
    const rib = new THREE.Group(); rib.name='domeRib'+i; rib.rotation.y = i*Math.PI/3; bell.add(rib);
    const g = new THREE.TorusGeometry(1.62, 0.045, 6, 14, Math.PI*0.5);
    const r = mesh(g, darkMat, 'rib'+i, rib, 0, 0, 0);
    r.rotation.set(0, Math.PI/2, 0);
    r.rotation.x = 0; r.rotation.z = 0; r.rotation.y = Math.PI/2;
    r.rotation.set(Math.PI/2, 0, 0); r.rotation.x = Math.PI*0.5; r.rotation.z = Math.PI/2;
    r.rotation.set(0, 0, 0);
    r.rotation.x = -Math.PI/2 * 0; // положение дугой вверх
    r.rotation.set(Math.PI*0.5, 0, 0);
    r.rotation.x = Math.PI/2; r.rotation.z = -Math.PI/2;
    r.rotation.set(0, Math.PI/2, 0);
    r.rotation.x = 0; r.rotation.y = Math.PI/2; r.rotation.z = -Math.PI*0.5;
    // дуга стоит вертикально над rim
    r.rotation.set(Math.PI/2, 0, 0); r.rotation.x = Math.PI/2 - 0;
    r.rotation.set(0,0,0);
    r.rotation.y = Math.PI/2; r.rotation.x = 0; r.rotation.z = 0;
    r.rotation.set(-Math.PI/2, 0, 0); r.rotation.x = Math.PI/2;
    r.rotation.set(0, 0, 0);
    r.rotation.set(Math.PI*0.5, i*0, 0);
    r.rotation.x = Math.PI/2; r.rotation.y = Math.PI/2;
    r.rotation.set(Math.PI/2, Math.PI/2, 0);
    r.rotation.x = Math.PI/2 - Math.PI*0.25;
    r.rotation.x = Math.PI*0.5; r.rotation.z = Math.PI*0.5;
    r.rotation.set(Math.PI*0.25 + 0, 0, 0);
    r.rotation.x = Math.PI*0.5 - Math.PI*0.25;
    r.rotation.x = Math.PI*0.5 - 0;
    r.rotation.x = Math.PI/2; r.rotation.z = 0; r.rotation.y = 0;
    r.rotation.set(Math.PI/2, 0, 0);
    r.rotation.x = Math.PI/2 - Math.PI/4;
    r.rotation.x = Math.PI/2 - Math.PI/4 + Math.PI/4;
    r.rotation.x = Math.PI/2; r.rotation.z = -Math.PI/4;
    r.rotation.x = Math.PI/2 - Math.PI/4; r.rotation.z = Math.PI/4;
    r.rotation.set(Math.PI/4, 0, 0);
    r.rotation.x = Math.PI*0.25; r.rotation.y = Math.PI/2;
    r.rotation.set(Math.PI*0.25, Math.PI/2, 0);
    r.rotation.x = Math.PI*0.25; // полудуга вверх
  }

  // стеклянные пластины поверх купола — перекрывающиеся белые сегменты
  const plates = new THREE.Group(); plates.name = 'bellPlates'; bell.add(plates);
  for (let i=0;i<9;i++){
    const pg = new THREE.Group(); pg.name='shellPlate'+i; pg.rotation.y = i*(Math.PI*2/9); plates.add(pg);
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(1.85, 12, 8, 0, Math.PI*0.42, Math.PI*0.18, Math.PI*0.42),
      i%3===2 ? shellWorn : shellMat
    );
    s.name='plate'+i; s.scale.set(1, 0.85, 0.9); s.rotation.x = 0.12; pg.add(s);
    // катенёк по нижней кромке
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.03, 5, 10, Math.PI*0.38), steelMat);
    lip.name='plateLip'+i; lip.rotation.x = Math.PI*0.5; lip.rotation.z = Math.PI*0.1; lip.position.y = -0.55; pg.add(lip);
    boltRow(pg, 'plateBolt'+i+'_', 3, 0.028, steelMat, 1.2, 1.6, -0.15, 0.9);
  }

  // венец — стопка сегментов на вершине
  const crown = new THREE.Group(); crown.name='crown'; crown.position.y = 1.15; bell.add(crown);
  const cr1 = mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.22, 8), steelMat, 'crownBase', crown, 0, 0.05, 0);
  const cr2 = mesh(new THREE.CylinderGeometry(0.38, 0.5, 0.2, 8), darkMat, 'crownMid', crown, 0, 0.26, 0);
  const cr3 = mesh(new THREE.CylinderGeometry(0.16, 0.28, 0.3, 8), bronzeMat, 'crownSpire', crown, 0, 0.5, 0);
  mesh(new THREE.SphereGeometry(0.1, 8, 6), steelMat, 'crownTip', crown, 0, 0.7, 0);
  for (let i=0;i<4;i++){
    const a=i*Math.PI/2;
    mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), darkMat, 'crownPin'+i, crown, Math.cos(a)*0.45, 0.3, Math.sin(a)*0.45);
  }
  // антенные штыри венца
  mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5), steelMat, 'antenna1', crown, 0.15, 0.85, 0.1);
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 5), steelMat, 'antenna2', crown, -0.14, 0.78, -0.08);

  // внутреннее ядро — тёмная машина в стекле
  const core = new THREE.Group(); core.name='core'; core.position.y = 0.45; bell.add(core);
  mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.9, 10), darkMat, 'coreHousing', core);
  mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 10), steelMat, 'coreBearingTop', core, 0, 0.48, 0);
  mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 10), steelMat, 'coreBearingBot', core, 0, -0.48, 0);
  // шестерённая стойка — три диска
  for (let i=0;i<3;i++){
    const gear = mesh(new THREE.CylinderGeometry(0.3-i*0.05, 0.3-i*0.05, 0.06, 12), bronzeMat, 'gear'+i, core, 0, -0.3+i*0.28, 0);
    for (let t=0;t<8;t++){
      const a=t*Math.PI/4;
      mesh(new THREE.BoxGeometry(0.07, 0.05, 0.07), bronzeMat, 'gear'+i+'tooth'+t, gear, Math.cos(a)*0.3, 0, Math.sin(a)*0.3);
    }
  }
  const lensRing = mesh(new THREE.TorusGeometry(0.2, 0.045, 8, 16), steelMat, 'opticBezel', core, 0, 0.1, 0.45);
  lensRing.rotation.x = 0; 
  const lens = mesh(new THREE.SphereGeometry(0.15, 12, 10), lensMat, 'opticLens', core, 0, 0.1, 0.42);
  // второй глаз-оптика
  const lensRing2 = mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 14), steelMat, 'opticBezel2', core, 0.32, 0.05, 0.32);
  const lens2 = mesh(new THREE.SphereGeometry(0.09, 10, 8), lensMat, 'opticLens2', core, 0.33, 0.05, 0.3);
  // силовой порт (единственный светящийся элемент)
  const portMat = new THREE.MeshStandardMaterial({ color: 0x222018, emissive: 0xC2521E, emissiveIntensity: 0.0, roughness: 0.4, metalness: 0.2 });
  const powerPort = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8), portMat, 'powerPort', core, 0, -0.5, 0);

  // юбка — нижний обод: рама, поршни, цепной прогон
  const skirt = new THREE.Group(); skirt.name='skirt'; skirt.position.y = 0.1; bell.add(skirt);
  mesh(new THREE.TorusGeometry(1.55, 0.1, 8, 24), steelMat, 'rimRing', skirt).rotation.x = Math.PI/2;
  mesh(new THREE.TorusGeometry(1.4, 0.06, 6, 24), darkMat, 'rimInner', skirt).rotation.x = Math.PI/2;
  // радиальные рамы + поршневые домкраты
  for (let i=0;i<8;i++){
    const a = i*Math.PI/4 + Math.PI/8;
    const fr = new THREE.Group(); fr.name='radialFrame'+i; fr.rotation.y=a; skirt.add(fr);
    mesh(new THREE.BoxGeometry(0.09, 0.16, 1.35), darkMat, 'frameRib'+i, fr, 0, 0, 0.75);
    // домкрат: ствол + шток + гнездо
    mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), metalMat, 'jackBarrel'+i, fr, 0, 0.22, 0.4).rotation.x = 0.5;
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), steelMat, 'jackRod'+i, fr, 0, 0.06, 0.62).rotation.x = 0.5;
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 8), rubberMat, 'jackBoot'+i, fr, 0, 0.3, 0.28).rotation.x = 0.5;
    // крепление щупальца — вилка
    if (i%2===0){
      const yoke = new THREE.Group(); yoke.name='tentacleYoke'+i; yoke.position.set(0, -0.1, 1.42); fr.add(yoke);
      mesh(new THREE.BoxGeometry(0.16, 0.14, 0.12), steelMat, 'yokeBlock'+i, yoke);
      boltRow(yoke, 'yokeBolt'+i+'_', 2, 0.025, steelMat, -0.05, 0.05, 0.09, 0);
    }
  }
  // цепной прогон по ободу
  for (let i=0;i<26;i++){
    const a=i/26*Math.PI*2;
    const link = mesh(new THREE.BoxGeometry(0.09, 0.05, 0.16), darkMat, 'rimChain'+i, skirt, Math.cos(a)*1.55, -0.02, Math.sin(a)*1.55);
    link.rotation.y = -a;
  }

  // кабельная обвязка колокола — каждая внутри одной детали
  hose([[0.6,0.9,0.5],[0.9,0.5,0.7],[1.1,0.0,0.9],[1.3,-0.4,0.9],[1.5,-0.5,0.5]], 0.045, 'harnessA', bell);
  hose([[0.5,0.9,-0.6],[0.8,0.4,-0.9],[1.05,-0.1,-1.05],[1.35,-0.45,-0.95]], 0.04, 'harnessB', bell);
  hose([[-0.7,0.85,0.4],[-1.0,0.4,0.7],[-1.2,-0.1,0.85],[-1.45,-0.5,0.6]], 0.04, 'harnessC', bell);
  hose([[-0.5,0.95,-0.55],[-0.85,0.55,-0.85],[-1.1,0.0,-1.0],[-1.4,-0.45,-0.8]], 0.038, 'harnessD', bell);
  hose([[0.2,0.55,0.5],[0.35,0.2,0.44],[0.2,-0.15,0.5]], 0.02, 'wireCore1', core);
  hose([[-0.25,0.5,-0.4],[-0.35,0.15,-0.35],[-0.2,-0.2,-0.42]], 0.02, 'wireCore2', core);

  // ---------- ОРАЛОВЫЕ РУКИ (4 широкие лопасти) ----------
  const arms = [];
  const armDefs = [[0.5,0.35],[ -0.5,0.35],[0.5,-0.35],[-0.5,-0.35]];
  for (let i=0;i<4;i++){
    const tg = new THREE.Group(); tg.name='oralArm'+i;
    tg.position.set(armDefs[i][0], -0.05, armDefs[i][1]); bell.add(tg);
    let parent = tg; const segs=[];
    for (let s=0;s<6;s++){
      const seg = new THREE.Group(); seg.name='armSeg'+i+'_'+s; seg.position.y = s===0?0:-0.62; parent.add(seg);
      const L=0.6, w=0.3-0.03*s;
      mesh(new THREE.BoxGeometry(w, L, w*0.5), i%2?darkMat:metalMat, 'armBone'+i+'_'+s, seg, 0, -L/2, 0);
      // лопасти-перья
      for (let v=0;v<3;v++){
        const blade = mesh(new THREE.BoxGeometry(w*2.2, 0.5, 0.015), v===1?glassDark:darkMat, 'armVane'+i+'_'+s+'_'+v, seg, 0, -L*0.3-v*0.16, 0);
        blade.scale.x = 1 - v*0.18;
      }
      segs.push(seg); parent = seg;
    }
    // хват на конце: 2 звена + пластина
    const claw = new THREE.Group(); claw.name='armClaw'+i; claw.position.y=-0.62; parent.add(claw);
    mesh(new THREE.BoxGeometry(0.1,0.25,0.08), steelMat, 'armClawLink'+i, claw, 0,-0.12,0);
    mesh(new THREE.ConeGeometry(0.06,0.3,6), steelMat, 'armClawTip'+i, claw, 0,-0.38,0).rotation.x=Math.PI;
    arms.push({ root: tg, segs });
  }

  // ---------- ЩУПАЛЬЦА (8 длинных, по 12 звеньев) ----------
  const tentacles = [];
  for (let i=0;i<8;i++){
    const a = i*Math.PI/4 + Math.PI/8;
    const tg = new THREE.Group(); tg.name='tentacle'+i;
    tg.position.set(Math.cos(a)*1.45, -0.12, Math.sin(a)*1.45);
    tg.rotation.y = -a; bell.add(tg);
    // портовый патрубок у основания
    mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.18, 8), steelMat, 'tentaclePort'+i, tg, 0, 0.02, 0);
    let parent = tg; const segs=[];
    const N=12;
    for (let s=0;s<N;s++){
      const seg = new THREE.Group(); seg.name='tentacleSeg'+i+'_'+s; seg.position.y = s===0?0:-0.55; parent.add(seg);
      const shrink = 1 - s/N*0.75;
      const L = 0.55*(1 - s/N*0.3);
      mesh(new THREE.CylinderGeometry(0.075*shrink, 0.09*shrink, L, 7), s%2?metalMat:darkMat, 'tentBone'+i+'_'+s, seg, 0, -L/2, 0);
      // шарнирные кольца между сегментами
      mesh(new THREE.TorusGeometry(0.085*shrink, 0.022, 5, 8), steelMat, 'tentJoint'+i+'_'+s, seg, 0, 0.01, 0).rotation.x = Math.PI/2;
      // короткий шланг-обвязка на каждом третьем звене (внутри звена)
      if (s%3===1) hose([[0.06*shrink,0,0.02],[0.09*shrink,-L*0.5,0.05],[0.06*shrink,-L,0.02]], 0.018, 'tentWire'+i+'_'+s, seg);
      segs.push(seg); parent = seg;
    }
    // кисть: 3 звена + коготь
    const last = segs[N-1];
    for (let c=0;c<3;c++){
      const cl = new THREE.Group(); cl.name='tentacleClaw'+i+'_'+c; cl.position.y = c===0?-0.5:-0.28; (c===0?last:parent).add(cl);
      mesh(new THREE.CylinderGeometry(0.04,0.05,0.26,6), steelMat, 'clawLink'+i+'_'+c, cl, 0, -0.13, 0);
      parent = cl;
    }
    const tip = mesh(new THREE.ConeGeometry(0.045, 0.28, 6), steelMat, 'clawTip'+i, parent, 0, -0.4, 0);
    tip.rotation.x = Math.PI;
    tentacles.push({ root: tg, segs, angle: a });
  }

  // ---------- ПОЗА ----------
  const lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const ease=(t)=>t*t*(3-2*t);
  let clock=0;

  root.userData.pose = (s) => {
    const t = s.t ?? 0, dt = s.dt ?? 0.016; clock += dt;
    const spN = clamp(s.speed/6, 0, 1);
    const walkN = clamp(s.speed/1, 0, 1);

    // дыхание/гребок: стоя — по времени, в движении — по пройденному пути
    const cycle = s.speed > 0.02 ? s.stride*Math.PI*4 : t*0.9;
    const pulse = Math.sin(cycle);
    const pulse2 = Math.sin(cycle*2 + 1.2);

    // базовые величины
    let hover = 2.4 + pulse*0.12*(0.3+spN) + pulse2*0.05*spN;
    let bellSx=1, bellSy=1, bellRz=0, bellRx=0;
    let coreS=1, plateOpen=0;
    let tentTrail = 0.1 + spN*0.75;          // наклон назад
    let tentAmp = 0.06 + spN*0.3;            // амплитуда волны
    let tentWaveSpd = s.speed>0.02 ? 2.2+spN*2 : 0.7;
    let tentSpread = 1, tentCurl=0, tentLift=0;
    let tiltX=0, tiltZ=0, lean=0;
    let portGlow=0;

    // стоя: медленное переливание массы, сканирование оптикой
    if (s.speed < 0.02){
      tiltZ = Math.sin(t*0.5)*0.035;
      bellRx = Math.sin(t*0.33)*0.04;
      coreS = 1 + Math.sin(t*0.8)*0.03;
    } else {
      // колокол сжимается-раскрывается на гребке
      bellSy = 1 + pulse*0.14*(0.4+spN);
      bellSx = 1 - pulse*0.06*(0.4+spN);
      bellRx = lerp(0.06, -0.12, (pulse+1)/2)*spN;
      lean = spN*0.18;
    }

    // поворот: крен внутрь, щупальца наружу от поворота
    const turn = s.turn||0;
    tiltZ += -turn*0.22;
    tentSpread += Math.abs(turn)*0.25;
    tentTrail += turn*0; // щупальца сносит наружу по z ниже

    // воздух — набор высоты, щупальца вытянуты вниз-назад и не идут волной
    if (s.grounded===false){ hover += 1.6; tentLift = -0.5; tentAmp*=0.3; tentTrail=0.9; bellRx=-0.15; }
    // ранение: перекос на бок, колокол приспущен
    if ((s.health??1) < 0.5){ tiltZ += 0.14; hover -= 0.25; bellSy*=0.94; tentAmp*=0.7; }

    // ---------- ДЕЙСТВИЯ ----------
    const act = s.action, p = clamp(s.phase??0, 0, 1);
    let front = []; // индексы щупалец, смотрящих вперёд (+Z мира)
    tentacles.forEach((T,i)=>{ if (Math.cos(T.angle) > 0.35) front.push(i); });
    let armAct = null; // {reach, curl}

    if (act==='attack'){
      // замах передними щупальцами назад — хлёсткий удар вперёд — возврат
      const w = p<0.3 ? ease(p/0.3) : p<0.55 ? 1-ease((p-0.3)/0.25) : 0;
      const strike = p>=0.3 && p<0.55 ? ease((p-0.3)/0.25) : p>=0.55 ? 1-ease(Math.min(1,(p-0.55)/0.45)) : 0;
      armAct = { reach: -strike*1.1 + w*0.6, curl: strike*0.8, amp: 0.2 };
      tiltX = -strike*0.1 + w*0.08;
      hover += strike*0.15 - w*0.1;
    }
    else if (act==='fire'){
      // ядро заряжается — вспышка — отдача
      const charge = ease(Math.min(1, p/0.45));
      const shot = p>0.5 && p<0.62 ? 1 : 0;
      const recoil = p>0.5 ? Math.exp(-(p-0.5)*6) : 0;
      coreS = 1 + charge*0.18 - recoil*0.12;
      portGlow = charge*1.2*(1-Math.max(0,(p-0.6)/0.4));
      tiltX = recoil*0.12; hover += recoil*0.1;
      bellRx = -charge*0.08;
    }
    else if (act==='hit'){
      const fl = Math.exp(-p*7)*Math.sin(p*22);
      tiltZ += fl*0.25; tiltX += fl*0.15; hover -= Math.abs(fl)*0.3; bellSy *= 1 - Math.abs(fl)*0.1;
    }
    else if (act==='block'){
      const b = ease(Math.min(1,p/0.3))*(1-ease(Math.max(0,(p-0.8)/0.2)));
      hover -= b*0.7; bellSx *= 1+b*0.1; bellSy *= 1-b*0.12;
      tentCurl = b*0.9; tentSpread -= b*0.5; tiltX = b*0.12;
    }
    else if (act==='gather'){
      const d = p<0.4 ? ease(p/0.4) : p<0.7 ? 1 : 1-ease((p-0.7)/0.3);
      hover -= d*0.9; tentTrail += d*0.2;
      armAct = { reach: 0.9*d, curl: 0.5*ease(Math.max(0,(p-0.4)/0.2))*(1-ease(Math.max(0,(p-0.7)/0.3))) };
    }
    else if (act==='deposit'){
      const d = p<0.35 ? ease(p/0.35) : p<0.7 ? 1 : 1-ease((p-0.7)/0.3);
      hover -= d*0.7;
      armAct = { reach: 0.7*d, curl: 0.5*(1-ease(Math.max(0,(p-0.4)/0.25))) };
    }
    else if (act==='eat' || act==='drink'){
      const d = p<0.25 ? ease(p/0.25) : p>0.8 ? 1-ease((p-0.8)/0.2) : 1;
      hover -= d*1.0;
      const chew = act==='eat' ? Math.sin(p*Math.PI*2*3)*0.25*d : Math.sin(p*Math.PI*2*1.2)*0.08*d;
      armAct = { reach: 0.8*d, curl: 0.4*d, amp: chew };
      bellRx = d*0.1 + chew*0.3;
    }
    else if (act==='jump'){
      const load = ease(Math.min(1,p/0.33)), ext = p>0.33 ? ease((p-0.33)/0.3) : 0;
      hover += ext*1.4 - load*0.6;
      bellSy = 1 - load*0.25 + ext*0.2;
      tentLift = -ext*1.2; tentTrail = 0.2 + ext*1.0;
    }
    else if (act==='land'){
      const comp = ease(Math.min(1,p/0.3))*(1-ease(Math.max(0,(p-0.55)/0.45)));
      hover -= comp*1.0; bellSy *= 1-comp*0.3; bellSx *= 1+comp*0.15;
      tentLift = comp*0.4;
    }
    else if (act==='signal'){
      const rise = ease(Math.min(1,p/0.25))*(1-ease(Math.max(0,(p-0.75)/0.25)));
      const hold = p>0.25&&p<0.75 ? 1 : 0;
      hover += rise*0.8; plateOpen = rise;
      bellSx *= 1+rise*0.15; bellSy *= 1+rise*0.1;
      tentSpread += rise*1.3; tentLift = -rise*0.4; tentTrail -= rise*0.4;
      portGlow = hold*1.0; coreS = 1+rise*0.15;
    }
    else if (act==='sleep'){
      const e = ease(p);
      hover = lerp(2.4, 0.45, e);
      tentCurl = e*1.2; tentAmp = 0.02*(1-e); tentTrail = e*0.35; tentSpread = 1-e*0.5;
      bellSy = 1-e*0.18; bellSx = 1+e*0.1; coreS = 1-e*0.12;
      tiltX = e*0.05;
    }
    else if (act==='wake'){
      const e = ease(p);
      hover = lerp(0.45, 2.4, e);
      tentCurl = 1.2*(1-e); tentTrail = 0.35*(1-e)+0.1*e;
      bellSy = lerp(0.82, 1, e); coreS = lerp(0.88, 1, e);
      tentAmp = 0.02 + e*0.06;
    }
    else if (act==='die'){
      const e = ease(p);
      hover = lerp(2.4, 0.12, e);
      tiltZ = e*0.5; tiltX = e*0.25;
      bellSy = 1-e*0.35; bellSx = 1+e*0.12; coreS = 1-e*0.3;
      tentCurl = 0; tentAmp = 0; tentTrail = e*0.15; tentSpread = 1+e*0.4; tentLift = e*0.6;
      plateOpen = e*0.5;
      portGlow = (1-e)*0.8;
    }
    else if (act==='evolve'){
      const brace = ease(Math.min(1,p/0.2));
      const open = p>0.2&&p<0.4 ? ease((p-0.2)/0.2) : p>=0.4&&p<0.6 ? 1 : p>=0.6 ? 1-ease((p-0.6)/0.25) : 0;
      const close = 1-brace;
      hover += brace*0.5 + open*0.7;
      plateOpen = open; bellSx *= 1+open*0.22; bellSy *= 1-open*0.1;
      tentSpread += open*1.5; tentLift = -open*0.7; tentTrail = 0.1*(1-open);
      portGlow = open*1.3; coreS = 1+open*0.3;
      tentAmp *= (1-open*0.7);
      tiltZ += Math.sin(t*20)*0.01*open; // вибрация напряжения
    }

    // ---------- ПРИМЕНЕНИЕ ----------
    root.position.set(0, Math.max(0.12, hover), 0);
    root.rotation.set(tiltX + lean, 0, tiltZ);

    bell.scale.set(bellSx, bellSy, bellSx);
    bell.rotation.set(bellRx, 0, bellRz);
    plates.rotation.y = plateOpen*0.35;
    plates.scale.setScalar(1 + plateOpen*0.08);
    core.scale.setScalar(coreS);
    skirt.rotation.y = s.speed>0.02 ? cycle*0.15 : t*0.05;
    portMat.emissiveIntensity = portGlow*1.5;
    lensMat.emissiveIntensity = 0;

    // щупальца: волна от основания к кончику + наклон назад + вихление
    tentacles.forEach((T, j) => {
      const inward = (T.angle < Math.PI ? 1 : -1); // разворот при повороте
      T.root.rotation.x = tentTrail + tentLift;
      T.root.rotation.z = turn*0.35*Math.cos(T.angle) + Math.sin(t*0.4+j)*0.05;
      T.segs.forEach((seg, i) => {
        const wave = Math.sin(cycle*tentWaveSpd - i*0.55 + j*1.7) * tentAmp * (0.4 + i/T.segs.length);
        let rx = tentTrail*0.12 + wave + (act==='attack' && front.includes(j) && armAct ? 0 : 0);
        let rz = Math.cos(cycle*tentWaveSpd - i*0.5 + j*2.3)*tentAmp*0.6 + turn*0.1*Math.sin(T.angle)*(i/T.segs.length);
        // скручивание/сбор (block, sleep, die)
        if (tentCurl>0) rx += tentCurl*0.14*(1+i*0.05) * (Math.cos(T.angle)>=0?1:1);
        if (tentLift<0) rx += tentLift*0.1;
        // атака/сбор передними щупальцами
        if (armAct && front.includes(j)){
          const f = Math.cos(T.angle);
          rx += (-armAct.reach*0.32 + armAct.curl*0.18*(i>5?1:0)) * f;
        }
        seg.rotation.set(rx, 0, rz);
      });
    });

    // ротовые руки: та же волна, лопасти шире, действия сильнее
    arms.forEach((A, j) => {
      A.segs.forEach((seg, i) => {
        const wave = Math.sin(cycle*tentWaveSpd*0.8 - i*0.6 + j*2.1)*tentAmp*0.8;
        let rx = tentTrail*0.15 + wave + tentLift*0.15;
        if (tentCurl>0) rx += tentCurl*0.18;
        if (armAct) rx += (-armAct.reach*0.3 + armAct.curl*0.2*(i>3?1:0)) + (armAct.amp||0)*Math.sin(i*1.2);
        seg.rotation.set(rx, 0, Math.cos(cycle*tentWaveSpd - i*0.6 + j)*tentAmp*0.4);
      });
    });
  };

  return root;
}