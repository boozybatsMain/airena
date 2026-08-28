function build(THREE, TSL) {
  // ONE QUALITY: SPREAD AND GRIP — a heavy bulbous mantle hovering over a skirt of
  // eight long tapering curling arms, each a chain of machined segments lined with
  // sucker pads; the mass sits high and central, the arms do all the reaching.

  const TAU = Math.PI * 2;
  const root = new THREE.Group();
  root.name = 'octopus';

  // ---- materials (TSL worn) ----
  const hash = TSL.Fn(([p]) => TSL.fract(TSL.sin(TSL.dot(p, TSL.vec3(127.1, 311.7, 74.7))).mul(43758.5453)));
  const vnoise = TSL.Fn(([p]) => {
    const i = TSL.floor(p); const f = TSL.fract(p);
    const u = f.mul(f).mul(TSL.float(3.0).sub(f.mul(2.0)));
    const a = hash(i);
    const b = hash(i.add(TSL.vec3(1, 0, 0))); const c = hash(i.add(TSL.vec3(0, 1, 0))); const d = hash(i.add(TSL.vec3(1, 1, 0)));
    const e = hash(i.add(TSL.vec3(0, 0, 1))); const g = hash(i.add(TSL.vec3(1, 0, 1))); const h = hash(i.add(TSL.vec3(0, 1, 1))); const k = hash(i.add(TSL.vec3(1, 1, 1)));
    const x00 = TSL.mix(a, b, u.x); const x10 = TSL.mix(c, d, u.x); const x01 = TSL.mix(e, g, u.x); const x11 = TSL.mix(h, k, u.x);
    const y0 = TSL.mix(x00, x10, u.y); const y1 = TSL.mix(x01, x11, u.y);
    return TSL.mix(y0, y1, u.z);
  });

  function shellMat() {
    const m = new THREE.MeshStandardNodeMaterial();
    const pos = TSL.positionLocal;
    const nrm = TSL.normalLocal;
    const n1 = vnoise(pos.mul(5.0));
    const n2 = vnoise(pos.mul(16.0));
    const bone = TSL.vec3(0.847, 0.824, 0.776);
    const boneSh = TSL.vec3(0.788, 0.761, 0.706);
    const worn = TSL.vec3(0.710, 0.675, 0.612);
    const metal = TSL.vec3(0.333, 0.322, 0.298);
    const rust = TSL.vec3(0.761, 0.322, 0.118);
    const edge = TSL.smoothstep(0.62, 0.92, n2);
    const down = TSL.clamp(TSL.float(0.5).sub(nrm.y.mul(0.5)), 0.0, 1.0);
    let col = TSL.mix(bone, boneSh, TSL.smoothstep(0.3, 0.8, n1).mul(0.5));
    col = TSL.mix(col, worn, TSL.smoothstep(0.5, 0.9, n1).mul(0.4));
    col = TSL.mix(col, metal, edge.mul(0.75));
    col = TSL.mix(col, rust, TSL.smoothstep(0.72, 0.95, n1).mul(down).mul(0.22));
    col = TSL.mix(col, TSL.vec3(0.20, 0.18, 0.16), down.mul(TSL.smoothstep(0.4, 0.9, n2)).mul(0.3));
    m.colorNode = col;
    m.roughnessNode = TSL.float(0.62).add(nrm.y.mul(0.12)).add(edge.mul(0.1));
    m.metalnessNode = TSL.float(0.12).add(edge.mul(0.5));
    m.side = THREE.DoubleSide;
    return m;
  }
  function metalMat() {
    const m = new THREE.MeshStandardNodeMaterial();
    const pos = TSL.positionLocal;
    const nrm = TSL.normalLocal;
    const n = vnoise(pos.mul(9.0));
    const base = TSL.vec3(0.333, 0.322, 0.298);
    const lite = TSL.vec3(0.420, 0.400, 0.369);
    const dark = TSL.vec3(0.243, 0.227, 0.204);
    let col = TSL.mix(base, lite, TSL.clamp(nrm.y.mul(0.5).add(0.3), 0.0, 1.0).mul(0.6));
    col = TSL.mix(col, dark, TSL.smoothstep(0.5, 0.9, n).mul(0.5));
    m.colorNode = col;
    m.roughnessNode = TSL.float(0.55).add(n.mul(0.15));
    m.metalnessNode = TSL.float(0.8);
    return m;
  }
  const shellM = shellMat();
  const metalM = metalMat();
  const rubberM = new THREE.MeshStandardNodeMaterial(); rubberM.color = new THREE.Color(0x1e1d1b); rubberM.roughness = 0.9; rubberM.metalness = 0.0;
  const lensM = new THREE.MeshStandardNodeMaterial(); lensM.color = new THREE.Color(0x0a0c10); lensM.roughness = 0.08; lensM.metalness = 0.1;
  const bronzeM = new THREE.MeshStandardNodeMaterial(); bronzeM.color = new THREE.Color(0x4a4238); bronzeM.roughness = 0.6; bronzeM.metalness = 0.7;

  // ---- helpers ----
  function mesh(geo, mat, name) { const o = new THREE.Mesh(geo, mat); if (name) o.name = name; return o; }
  function bolt(r, h) { const g = new THREE.CylinderGeometry(r, r, h, 6); return g; }
  function addBolts(parent, radius, y, count, ringR) {
    for (let i = 0; i < count; i++) {
      const a = i / count * TAU;
      const b = mesh(bolt(radius, 0.02), metalM, 'bolt');
      b.position.set(Math.cos(a) * ringR, y, Math.sin(a) * ringR);
      parent.add(b);
    }
  }
  function gear(r, t, teeth) {
    const g = new THREE.Group(); g.name = 'gear';
    const disc = mesh(new THREE.CylinderGeometry(r, r, t, 16), metalM, 'gearDisc'); g.add(disc);
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * TAU;
      const tooth = mesh(new THREE.BoxGeometry(r * 0.22, t, r * 0.18), metalM, 'tooth');
      tooth.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      tooth.rotation.y = -a; g.add(tooth);
    }
    return g;
  }
  function ram(len, r) {
    const g = new THREE.Group(); g.name = 'ram';
    const barrel = mesh(new THREE.CylinderGeometry(r, r, len * 0.6, 10), metalM, 'ramBarrel'); barrel.position.y = -len * 0.3; g.add(barrel);
    const rod = mesh(new THREE.CylinderGeometry(r * 0.4, r * 0.4, len * 0.5, 8), bronzeM, 'ramRod'); rod.position.y = -len * 0.7; g.add(rod);
    const gland = mesh(new THREE.CylinderGeometry(r * 1.1, r * 1.1, len * 0.12, 10), rubberM, 'ramGland'); gland.position.y = -len * 0.58; g.add(gland);
    return g;
  }
  function bearing(r) {
    const g = new THREE.Group(); g.name = 'bearing';
    g.add(mesh(new THREE.TorusGeometry(r, r * 0.28, 8, 18), metalM, 'race'));
    g.add(mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, r * 0.6, 12), metalM, 'hub'));
    return g;
  }
  function cableRun(points, r, name) {
    const cur = new THREE.CatmullRomCurve3(points);
    const g = new THREE.TubeGeometry(cur, 16, r, 6, false);
    return mesh(g, rubberM, name || 'cable');
  }
  function shellPlate(rTop, rBot, len, thStart, thLen, name) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, 18, 1, true, thStart, thLen);
    const o = mesh(g, shellM, name); return o;
  }

  // ---- spine curve for the mantle ----
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.55, -0.42),
    new THREE.Vector3(0, 1.18, -0.10),
    new THREE.Vector3(0, 0.92, 0.10),
    new THREE.Vector3(0, 0.66, 0.28)
  ]);

  const mantle = new THREE.Group(); mantle.name = 'mantle'; root.add(mantle);

  // mantle core: stacked segment blocks along spine
  const mantleSegs = [];
  const segN = 5;
  for (let i = 0; i < segN; i++) {
    const t = i / (segN - 1);
    const p = spine.getPoint(t);
    const tan = spine.getTangent(t);
    const rad = 0.30 + Math.sin(t * Math.PI) * 0.26;
    const seg = new THREE.Group(); seg.name = 'mantleSeg' + i;
    seg.position.copy(p);
    seg.lookAt(p.clone().add(tan));
    seg.rotateX(Math.PI / 2);
    const blk = mesh(new THREE.CylinderGeometry(rad * 0.92, rad, 0.22, 14), metalM, 'mantleBlock');
    seg.add(blk);
    const race = bearing(rad * 0.7); race.rotation.x = Math.PI / 2; seg.add(race);
    mantle.add(seg); mantleSegs.push(seg);
  }
  // mantle tip cap
  const tip = mesh(new THREE.ConeGeometry(0.16, 0.34, 12), metalM, 'mantleTip');
  tip.position.copy(spine.getPoint(0)); tip.position.y += 0.12; tip.rotation.x = 0.5; mantle.add(tip);

  // chain run over the spine
  (function () {
    const chain = new THREE.Group(); chain.name = 'spineChain';
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const p = spine.getPoint(t);
      const link = mesh(new THREE.TorusGeometry(0.045, 0.018, 6, 8), metalM, 'chainLink');
      link.position.copy(p); link.position.y += 0.05; link.position.z -= 0.05;
      link.rotation.y = (i % 2) * Math.PI / 2;
      chain.add(link);
    }
    mantle.add(chain);
  })();

  // mantle shells: overlapping partial cylinders wrapping the core
  const shellDefs = [
    { t: 0.18, th: 0.0, len: 2.0, name: 'mantleShellTop' },
    { t: 0.45, th: 2.4, len: 2.4, name: 'mantleShellR' },
    { t: 0.45, th: -2.4, len: 2.4, name: 'mantleShellL' },
    { t: 0.72, th: 0.6, len: 2.6, name: 'mantleShellFront' },
    { t: 0.72, th: 3.6, len: 2.6, name: 'mantleShellBack' }
  ];
  shellDefs.forEach((d, idx) => {
    const p = spine.getPoint(d.t);
    const rad = 0.30 + Math.sin(d.t * Math.PI) * 0.26 + 0.05;
    const sh = shellPlate(rad, rad * 0.9, 0.5, d.th, d.len, d.name);
    sh.position.copy(p);
    sh.rotation.y = idx * 0.4;
    mantle.add(sh);
  });
  // top dome shell (scaled partial sphere)
  const dome = mesh(new THREE.SphereGeometry(0.5, 20, 14, 0, TAU, 0, Math.PI * 0.5), shellM, 'mantleDome');
  dome.scale.set(1, 1.25, 0.92); dome.position.copy(spine.getPoint(0.12)); mantle.add(dome);
  addBolts(mantle, 0.02, 0.0, 10, 0.42);

  // rams flanking the mantle
  const ramL = ram(0.5, 0.05); ramL.position.set(-0.42, 1.0, 0.0); ramL.rotation.z = 0.3; mantle.add(ramL);
  const ramR = ram(0.5, 0.05); ramR.position.set(0.42, 1.0, 0.0); ramR.rotation.z = -0.3; mantle.add(ramR);

  // ---- HEAD / leading end (eyes, beak, brow, siphon) ----
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.78, 0.34); root.add(head);

  // brow plate
  const brow = mesh(new THREE.SphereGeometry(0.30, 18, 10, 0, TAU, 0, Math.PI * 0.45), shellM, 'brow');
  brow.scale.set(1.15, 0.7, 1.0); brow.position.set(0, 0.10, 0.05); brow.rotation.x = -0.5; head.add(brow);
  // cheek plates
  const cheekR = shellPlate(0.22, 0.18, 0.3, -0.6, 1.6, 'cheekR'); cheekR.position.set(0.16, -0.02, 0.05); cheekR.rotation.z = -0.4; head.add(cheekR);
  const cheekL = shellPlate(0.22, 0.18, 0.3, Math.PI - 1.0, 1.6, 'cheekL'); cheekL.position.set(-0.16, -0.02, 0.05); cheekL.rotation.z = 0.4; head.add(cheekL);
  // face wedge (faceted front)
  const faceShape = new THREE.Shape();
  faceShape.moveTo(-0.16, 0.10); faceShape.lineTo(0.16, 0.10); faceShape.lineTo(0.10, -0.16); faceShape.quadraticCurveTo(0, -0.22, -0.10, -0.16); faceShape.closePath();
  const faceGeo = new THREE.ExtrudeGeometry(faceShape, { depth: 0.10, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  const face = mesh(faceGeo, shellM, 'facePlate'); face.position.set(0, 0.0, 0.16); head.add(face);

  // eyes: dark recessed glass in machined bezels
  function eye(side) {
    const g = new THREE.Group(); g.name = 'eye' + side;
    const bezel = mesh(new THREE.TorusGeometry(0.085, 0.028, 10, 18), metalM, 'eyeBezel'); g.add(bezel);
    const ring = mesh(new THREE.CylinderGeometry(0.10, 0.085, 0.05, 16), metalM, 'eyeRing'); ring.rotation.x = Math.PI / 2; ring.position.z = -0.02; g.add(ring);
    const lens = mesh(new THREE.SphereGeometry(0.07, 16, 12), lensM, 'eyeLens'); lens.scale.z = 0.5; lens.position.z = 0.01; g.add(lens);
    const fit = mesh(bolt(0.02, 0.03), metalM, 'eyeFit'); fit.position.set(0, 0.11, 0); g.add(fit);
    return g;
  }
  const eyeR = eye('R'); eyeR.position.set(0.20, 0.04, 0.12); eyeR.rotation.y = -0.7; head.add(eyeR);
  const eyeL = eye('L'); eyeL.position.set(-0.20, 0.04, 0.12); eyeL.rotation.y = 0.7; head.add(eyeL);

  // beak: hinged upper + lower
  const beak = new THREE.Group(); beak.name = 'beak'; beak.position.set(0, -0.16, 0.16); head.add(beak);
  const beakUp = new THREE.Group(); beakUp.name = 'beakUpper'; beak.add(beakUp);
  const bu = mesh(new THREE.ConeGeometry(0.07, 0.14, 8), metalM, 'beakUpMesh'); bu.rotation.x = Math.PI; bu.position.z = 0.05; beakUp.add(bu);
  const beakLo = new THREE.Group(); beakLo.name = 'beakLower'; beak.add(beakLo);
  const bl = mesh(new THREE.ConeGeometry(0.06, 0.12, 8), bronzeM, 'beakLoMesh'); bl.rotation.x = Math.PI; bl.position.set(0, -0.02, 0.05); beakLo.add(bl);

  // siphon funnel (lower rear)
  const siphon = new THREE.Group(); siphon.name = 'siphon'; siphon.position.set(0, -0.10, -0.22); siphon.rotation.x = 0.8; head.add(siphon);
  const funnel = mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.22, 12), metalM, 'siphonTube'); funnel.position.y = -0.1; siphon.add(funnel);
  const nozzle = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.06, 12), bronzeM, 'siphonNozzle'); nozzle.position.y = -0.22; siphon.add(nozzle);

  // head greebles / sensor stalks
  const stalk = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), metalM, 'sensorStalk'); stalk.position.set(0.0, 0.24, -0.05); head.add(stalk);
  const stalkTip = mesh(new THREE.SphereGeometry(0.025, 8, 6), metalM, 'sensorTip'); stalkTip.position.set(0, 0.32, -0.05); head.add(stalkTip);
  addBolts(head, 0.015, 0.12, 6, 0.22);

  // ---- ARMS: eight radiating chains ----
  const ARMS = 8, SEGS = 6;
  const armRoots = [], armSegs = [], armTips = [];
  const armCables = [];
  for (let i = 0; i < ARMS; i++) {
    const a = i / ARMS * TAU;
    const rootG = new THREE.Group(); rootG.name = 'armRoot' + i;
    const rr = 0.40;
    rootG.position.set(Math.sin(a) * rr, 0.60, Math.cos(a) * rr + 0.10);
    rootG.rotation.y = a;
    rootG.rotation.x = 0.85;
    root.add(rootG); armRoots.push(rootG);

    // shoulder gear + bearing at the root
    const sg = gear(0.10, 0.05, 10); sg.rotation.x = Math.PI / 2; sg.position.y = 0.02; rootG.add(sg);
    const sb = bearing(0.09); sb.rotation.x = Math.PI / 2; rootG.add(sb);

    // cable run parented to THIS arm root (moves with the arm)
    const cab = cableRun([
      new THREE.Vector3(0, 0.05, 0.06),
      new THREE.Vector3(0, -0.3, 0.10),
      new THREE.Vector3(0, -0.6, 0.08),
      new THREE.Vector3(0, -0.85, 0.04)
    ], 0.022, 'armCable' + i);
    rootG.add(cab); armCables.push(cab);
    const clamp1 = mesh(bolt(0.03, 0.04), metalM, 'cableClamp'); clamp1.position.set(0, -0.3, 0.09); rootG.add(clamp1);

    let parent = rootG;
    const segArr = [];
    let len = 0.34;
    for (let j = 0; j < SEGS; j++) {
      const seg = new THREE.Group(); seg.name = 'arm' + i + 'seg' + j;
      seg.position.y = j === 0 ? -0.06 : -len;
      parent.add(seg);
      const rTop = 0.085 * (1 - j * 0.11);
      const rBot = 0.085 * (1 - (j + 1) * 0.11);
      const cyl = new THREE.CylinderGeometry(rBot, rTop, len, 8);
      cyl.translate(0, -len / 2, 0);
      const segMesh = mesh(cyl, metalM, 'armSegMesh'); seg.add(segMesh);
      // shell plate on outer face of some segments
      if (j % 2 === 0) {
        const sh = shellPlate(rTop + 0.02, rBot + 0.02, len * 0.9, -0.9, 1.8, 'armShell' + i + '_' + j);
        sh.position.y = -len / 2; seg.add(sh);
      }
      // sucker pads on inner face
      if (j >= 1) {
        const suck = mesh(new THREE.CylinderGeometry(rBot * 0.7, rBot * 0.7, 0.03, 10), rubberM, 'sucker' + i + '_' + j);
        suck.rotation.x = Math.PI / 2; suck.position.set(0, -len / 2, -rBot - 0.01); seg.add(suck);
      }
      // small joint pin
      const pin = mesh(bolt(0.02, rTop * 2.4), bronzeM, 'jointPin'); pin.rotation.z = Math.PI / 2; seg.add(pin);
      segArr.push(seg);
      parent = seg;
      len *= 0.86;
    }
    armSegs.push(segArr);
    // tip claw
    const tipG = new THREE.Group(); tipG.name = 'armTip' + i; tipG.position.y = -len; parent.add(tipG);
    const claw = mesh(new THREE.ConeGeometry(0.03, 0.10, 6), metalM, 'tipClaw'); claw.rotation.x = Math.PI; claw.position.y = -0.04; tipG.add(claw);
    armTips.push(tipG);
  }

  // mantle-to-arm cable harness on the body (parented to mantle so it moves with breathing)
  const trunkA = cableRun([new THREE.Vector3(0, 1.3, -0.2), new THREE.Vector3(0.3, 1.0, 0.0), new THREE.Vector3(0.4, 0.7, 0.2)], 0.035, 'trunkCableR'); mantle.add(trunkA);
  const trunkB = cableRun([new THREE.Vector3(0, 1.3, -0.2), new THREE.Vector3(-0.3, 1.0, 0.0), new THREE.Vector3(-0.4, 0.7, 0.2)], 0.035, 'trunkCableL'); mantle.add(trunkB);
  const thinWire = cableRun([new THREE.Vector3(0.1, 1.4, -0.1), new THREE.Vector3(0.2, 1.1, 0.1), new THREE.Vector3(0.15, 0.85, 0.25)], 0.012, 'signalWire'); mantle.add(thinWire);

  // greebles: a few junction boxes on mantle
  const jb = mesh(new THREE.BoxGeometry(0.10, 0.06, 0.08), metalM, 'junctionBox'); jb.position.set(0.30, 1.05, -0.18); mantle.add(jb);
  const jb2 = mesh(new THREE.BoxGeometry(0.08, 0.05, 0.07), metalM, 'junctionBox2'); jb2.position.set(-0.28, 0.95, -0.10); mantle.add(jb2);

  root.position.y = 0;

  // ===================== POSE =====================
  const restCurl = [0.15, 0.30, 0.45, 0.55, 0.62, 0.66];
  const restRootX = 0.85;

  function pose(s) {
    const t = s.t || 0;
    const speed = s.speed || 0;
    const stride = s.stride || 0;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = s.health == null ? 1 : s.health;
    const action = s.action;
    const phase = s.phase || 0;

    // breathing / idle on mantle
    const breath = 1 + Math.sin(t * 1.6) * 0.015 + (speed > 0.1 ? Math.sin(stride * TAU * 2) * 0.01 : 0);
    mantle.scale.set(breath, 1 + (breath - 1) * 0.6, breath);
    mantle.position.y = Math.sin(t * 1.6) * 0.01;
    // head scan idle
    head.rotation.y = Math.sin(t * 0.5) * 0.10 + turn * 0.35;
    head.rotation.x = Math.sin(t * 0.7) * 0.04;
    head.rotation.z = turn * -0.18;
    beakLo.rotation.x = 0;
    siphon.rotation.x = 0.8;

    // speed factor for wave amplitude & reach
    const sf = Math.min(speed / 3, 1);
    const waveAmp = grounded ? (0.10 + sf * 0.55) : 0;
    const reach = grounded ? (0.10 + sf * 0.30) : 0;

    // action modifiers
    let actCurl = 0, actRoot = 0, actLift = 0, mantleSquash = 1, headDrop = 0, spread = 0;
    let blockDome = 0, signalRaise = 0, sleepCoil = 0, dieSplay = 0;
    let attackWhip = 0, gatherReach = 0, eatCycle = 0;

    if (action === 'attack') {
      const w = Math.sin(phase * Math.PI);
      attackWhip = w;
    } else if (action === 'fire') {
      mantleSquash = 1 - Math.sin(phase * Math.PI) * 0.18;
      siphon.rotation.x = 0.8 - Math.sin(phase * Math.PI) * 0.6;
    } else if (action === 'hit') {
      actRoot = -Math.sin(phase * Math.PI) * 0.5;
      headDrop = Math.sin(phase * Math.PI) * 0.3;
    } else if (action === 'block') {
      blockDome = Math.sin(Math.min(phase * 1.5, 1) * Math.PI * 0.5);
    } else if (action === 'gather') {
      gatherReach = Math.sin(phase * Math.PI);
    } else if (action === 'deposit') {
      gatherReach = Math.sin(phase * Math.PI) * 0.8;
    } else if (action === 'eat') {
      eatCycle = Math.sin(phase * TAU * 3);
      gatherReach = 0.6;
      beakLo.rotation.x = Math.abs(eatCycle) * 0.5;
    } else if (action === 'drink') {
      headDrop = Math.sin(Math.min(phase * 2, 1) * Math.PI * 0.5) * 0.5;
      gatherReach = 0.4;
    } else if (action === 'jump') {
      const c = phase < 0.33 ? phase / 0.33 : 1;
      actCurl = (phase < 0.33 ? c * 0.6 : -0.4 * (1 - (phase - 0.33) / 0.67));
      mantleSquash = phase < 0.33 ? 1 + c * 0.1 : 1 - (phase - 0.33) * 0.2;
    } else if (action === 'land') {
      actCurl = Math.sin(phase * Math.PI) * 0.5;
      mantleSquash = 1 + Math.sin(phase * Math.PI) * 0.1;
    } else if (action === 'signal') {
      signalRaise = Math.sin(Math.min(phase * 1.3, 1) * Math.PI);
      spread = signalRaise;
    } else if (action === 'sleep') {
      sleepCoil = Math.min(phase * 1.4, 1);
    } else if (action === 'wake') {
      sleepCoil = 1 - Math.min(phase * 1.4, 1);
    } else if (action === 'die') {
      dieSplay = Math.min(phase * 1.2, 1);
    } else if (action === 'evolve') {
      const open = Math.sin(phase * Math.PI);
      mantleSegs.forEach((sg, k) => { sg.position.y = spine.getPoint(k / (segN - 1)).y + open * 0.06 * (k % 2 ? 1 : -1); });
      mantleSquash = 1 + open * 0.08;
    }

    // health sag overlay
    const sag = (1 - health) * 0.4;

    // mantle squash
    mantle.scale.y *= mantleSquash;
    head.position.y = 0.78 - headDrop - sag * 0.3;
    head.rotation.x += headDrop;

    // airborne: trail & curl up
    const air = !grounded;

    for (let i = 0; i < ARMS; i++) {
      const a = i / ARMS * TAU;
      const lead = Math.cos(a);
      const side = Math.sin(a);
      const rootG = armRoots[i];

      // metachronal traveling wave
      const wave = Math.sin(stride * TAU - i * (TAU / ARMS) * 1.5);
      const liftWave = wave * waveAmp;

      let rx = restRootX - liftWave - reach * 0.3 * (0.5 + 0.5 * wave);
      let ry = a;
      // turn: bank & shorten inside arms
      rx += turn * side * 0.25;
      ry += turn * 0.25;
      // spread / signal raise
      rx -= spread * 0.7;
      ry += spread * side * 0.3;
      // block dome: curl roots up over mantle
      rx -= blockDome * 1.1;
      // sleep coil: tuck under
      rx += sleepCoil * 0.6;
      // die splay flat
      rx -= dieSplay * 0.9;
      // airborne trail
      if (air) { rx = restRootX - 0.5; }
      // attack whip on front arms
      if (attackWhip > 0 && lead > 0.3) { rx -= attackWhip * 0.9; }
      // gather reach on front arms down
      if (gatherReach > 0 && lead > 0) { rx += gatherReach * 0.5 * lead; }
      // sag: droop one side
      rx += sag * (side > 0 ? 0.3 : 0.0);

      rootG.rotation.x = rx;
      rootG.rotation.y = ry;
      rootG.rotation.z = turn * -side * 0.15 + spread * side * 0.2;

      // segments
      for (let j = 0; j < SEGS; j++) {
        const seg = armSegs[i][j];
        let cx = restCurl[j];
        // wave curl propagates down the arm
        cx += Math.sin(stride * TAU - i * 0.9 + j * 0.6) * waveAmp * 0.5;
        cx += actCurl * (j / SEGS);
        cx += blockDome * 0.6 * (j / SEGS);
        cx += sleepCoil * 0.7 * (j / SEGS);
        cx -= dieSplay * 0.5 * (j / SEGS);
        if (air) cx = restCurl[j] + 0.5;
        if (attackWhip > 0 && lead > 0.3) cx -= attackWhip * 0.5 * (1 - j / SEGS);
        if (gatherReach > 0 && lead > 0) cx += gatherReach * 0.3 * (j / SEGS) * lead;
        if (eatCycle && lead > 0) cx += eatCycle * 0.15 * (j / SEGS);
        cx += sag * 0.3 * (side > 0 ? 1 : 0);
        seg.rotation.x = cx;
        seg.rotation.z = turn * -side * 0.05 + Math.sin(t * 1.2 + i) * 0.02;
      }
      // tip
      armTips[i].rotation.x = restCurl[SEGS - 1] * 0.5 + (air ? 0.4 : 0) + sleepCoil * 0.5 - dieSplay * 0.4;
    }

    // reset mantle seg offsets if not evolving
    if (action !== 'evolve') {
      mantleSegs.forEach((sg, k) => { sg.position.y = spine.getPoint(k / (segN - 1)).y; });
    }
  }

  root.userData.pose = pose;
  root.userData.update = (t, dt) => {};

  return root;
}