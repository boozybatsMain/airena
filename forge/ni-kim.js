function build(THREE, TSL) {
  // SUBJECT: armoured octopus — ONE QUALITY: many sinuous arms.
  // Shape facts (must survive): (1) one dominant bulbous MANTLE mass, high and
  // rear; (2) eight equal arms, each ~one body length, radiating from a low
  // crown ring and tapering uniformly; (3) face is LOW and central, between the
  // arms, with two lateral eyes and a beak-nozzle underneath; (4) mass lives in
  // the dome; (5) the front is the eye/face side (+Z); (6) the arms curl.
  //
  // BRIEF: a squat swimming machine whose whole hull is a stepped stack of five
  // machined spine segments arcing up from the face to a domed crown, clad in
  // lapping pressed hemispherical shells, dark drive machinery showing in the
  // seams. Below the hull a geared crown ring carries eight identical arm
  // assemblies, each a six-link chain of faceted stock with joint barrels,
  // sucker cups and a drive ram along its top, ending in a machined tip. The
  // face is a rigid bolted wedge at the front with glass optics recessed in
  // lathed bezels and a split beak nozzle. Hose runs cross the spine in clamped
  // bundles, landing in ports each side of every joint. Expensive because the
  // crown is a real gear and every arm link carries a collar, a ram and
  // sucker hardware.

  const T = TSL;
  const M = {
    node(n) { const o = new THREE.Object3D(); o.name = n; return o; },
    mesh(g, m) { const x = new THREE.Mesh(g, m); return x; },
  };

  const COL = {
    shell: 0xD8D2C6, shellDark: 0xC9C2B4, worn: 0xB5AC9C,
    gun: 0x55524C, lite: 0x6B665E, recess: 0x3E3A34, bronze: 0x4A4238,
    cable: 0x1E1D1B, lens: 0x0C0D0F, markRed: 0xA8231C,
  };

  function wearMat(hex, metalness, rough) {
    const c = new THREE.Color(hex);
    const m = new THREE.MeshStandardMaterial({
      color: c, metalness: metalness, roughness: rough,
    });
    const p = T.positionLocal, ny = T.normalLocal.y;
    const n = T.sin(p.x.mul(6.1).add(p.z.mul(2.7)))
      .mul(T.cos(p.y.mul(4.9).add(p.z.mul(4.4)))).mul(0.5).add(
        T.sin(p.x.mul(13.7).add(p.y.mul(8.1))).mul(0.25)).add(0.5);
    const down = T.clamp(T.sub(1.0, T.max(ny, T.float(0)).mul(0.65)), 0, 1);
    const mask = T.smoothstep(0.58, 0.78, n).mul(down).clamp(0, 1);
    const dirt = new THREE.Color(COL.bronze);
    m.colorNode = T.mix(
      T.vec3(c.r, c.g, c.b),
      T.vec3(dirt.r, dirt.g, dirt.b), mask.mul(0.55));
    m.roughnessNode = T.clamp(T.float(rough).add(mask.mul(0.25)), 0, 1);
    return m;
  }

  const MAT = {
    shell: wearMat(COL.shell, 0.12, 0.55),
    shell2: wearMat(COL.shellDark, 0.12, 0.6),
    gun: wearMat(COL.gun, 0.82, 0.55),
    lite: wearMat(COL.lite, 0.85, 0.45),
    recess: new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.recess), metalness: 0.8, roughness: 0.6 }),
    bronze: wearMat(COL.bronze, 0.75, 0.55),
    cable: new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.cable), metalness: 0, roughness: 0.9 }),
    lens: new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.lens), metalness: 0.1, roughness: 0.08 }),
    mark: new THREE.MeshStandardMaterial({ color: new THREE.Color(COL.markRed), metalness: 0.1, roughness: 0.6 }),
    amber: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1E1D1B), emissive: new THREE.Color(0xE0A135),
      emissiveIntensity: 2.2, roughness: 0.6,
    }),
    cyan: new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x1E1D1B), emissive: new THREE.Color(0x7FC9D9),
      emissiveIntensity: 1.8, roughness: 0.6,
    }),
  };

  function cyl(rt, rb, h, seg, open, thS, thL) {
    return new THREE.CylinderGeometry(rt, rb, h, seg || 10, 1,
      open || false, thS || 0, thL || Math.PI * 2);
  }
  function plate(pts, depth) {
    const s = new THREE.Shape();
    pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]));
    const g = new THREE.ExtrudeGeometry(s, {
      depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012,
      bevelSegments: 2,
    });
    return g;
  }
  function torus(r, t, th) {
    return new THREE.TorusGeometry(r, t, 10, 28, th || Math.PI * 2);
  }
  function tubesAlong(pts, r) {
    const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    return new THREE.TubeGeometry(c, 18, r, 6, false);
  }

  const root = M.node('octopus');
  const torso = M.node('torso');
  root.add(torso);

  // ---------------- PASS 1 : THE FRAME (spine stack + crown ring) ----------
  const spinePts = [
    [0, 0.74, 0.70], [0, 1.02, 0.42], [0, 1.22, 0.02],
    [0, 1.18, -0.42], [0, 0.90, -0.72],
  ];
  const segR = [0.35, 0.44, 0.49, 0.43, 0.30];
  const mantle = [];
  const V = (a, b) => new THREE.Vector3(...a).sub(new THREE.Vector3(...b));
  for (let i = 0; i < spinePts.length; i++) {
    const s = M.node('mantleSeg' + i);
    s.position.set(...spinePts[i]);
    const dir = i < spinePts.length - 1 ?
      V(spinePts[i + 1], spinePts[i]) :
      V(spinePts[i], spinePts[i - 1]);
    dir.normalize();
    s.userData.qbase = new THREE.Quaternion()
      .setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    s.quaternion.copy(s.userData.qbase);
    // spine block (segment block kind)
    const r = segR[i];
    s.add(M.mesh(cyl(r * 0.72, r * 0.72, 0.30, 12, true), MAT.gun));
    // bearing race ring kind
    s.add(M.mesh(torus(r * 0.80, 0.05), MAT.lite));
    // gear disc at flank
    const gear = M.mesh(cyl(r * 0.45, r * 0.45, 0.06, 16), MAT.bronze);
    gear.rotation.z = Math.PI / 2; gear.position.x = r * 0.60;
    s.add(gear);
    torso.add(s); mantle.push(s);
  }
  // crown ring with gear teeth, sits under the mantle
  const crown = M.node('crownRing');
  crown.position.set(0, 0.52, 0.02);
  const ringM = M.mesh(torus(0.44, 0.075), MAT.bronze);
  ringM.rotation.x = Math.PI / 2; crown.add(ringM);
  for (let g = 0; g < 28; g++) {
    const tooth = M.mesh(new THREE.BoxGeometry(0.055, 0.09, 0.035), MAT.lite);
    tooth.position.set(Math.cos(g / 28 * Math.PI * 2) * 0.49, 0,
      Math.sin(g / 28 * Math.PI * 2) * 0.49);
    tooth.rotation.y = -g / 28 * Math.PI * 2;
    crown.add(tooth);
  }
  torso.add(crown);

  // ---------------- PASS 2 : THE LEADING END (face, eyes, beak) ------------
  const face = M.node('face');
  face.position.set(0, 0.66, 0.86);
  torso.add(face);
  const headCore = M.node('headCore');
  headCore.add(M.mesh(new THREE.BoxGeometry(0.34, 0.22, 0.30), MAT.gun));
  // faceted brow plates
  const brow = M.node('browPlates');
  const bg = plate([[-0.11, -0.05], [0.11, -0.05], [0.13, 0.10], [-0.13, 0.10]], 0.02);
  const bL = M.mesh(bg, MAT.shell); bL.rotation.x = -0.9; bL.position.set(-0.13, 0.14, 0.13);
  const bR = bL.clone(); bR.position.x = 0.13; brow.add(bL, bR);
  headCore.add(brow);
  // cheeks
  ['cheekL', 'cheekR'].forEach((n, i) => {
    const c = M.node(n);
    const chg = plate([[-0.10, -0.04], [0.10, -0.04], [0.06, 0.12], [-0.06, 0.12]], 0.015);
    const m = M.mesh(chg, MAT.shell2);
    m.rotation.y = i ? Math.PI / 2 : -Math.PI / 2; m.rotation.x = -0.15;
    m.position.set(i ? 0.20 : -0.20, 0.02, 0.02); c.add(m);
    headCore.add(c);
  });
  // eyes — dark glass, lathed bezels
  const eyeGeo = new THREE.SphereGeometry(0.075, 16, 12);
  const bezProf = [new THREE.Vector2(0.02, 0), new THREE.Vector2(0.10, 0.0),
    new THREE.Vector2(0.11, 0.05), new THREE.Vector2(0.085, 0.08)];
  const bezGeo = new THREE.LatheGeometry(bezProf, 16);
  const eyes = [];
  ['eyeL', 'eyeR'].forEach((n, i) => {
    const e = M.node(n);
    const sx = i ? 0.145 : -0.145;
    e.position.set(sx, 0.03, 0.17);
    const lens = M.mesh(eyeGeo, MAT.lens);
    lens.scale.set(1, 0.85, 0.65); lens.position.z = 0.015;
    const bez = M.mesh(bezGeo, MAT.lite);
    bez.rotation.x = Math.PI / 2;
    e.add(bez, lens);
    eyes.push(e); headCore.add(e);
  });
  // split beak nozzle
  const beakUp = M.node('beakUpper');
  beakUp.add(M.mesh(plate([[-0.07, -0.03], [0.07, -0.03], [0.05, 0.12], [-0.05, 0.12]], 0.03), MAT.gun));
  beakUp.position.set(0, -0.10, 0.15);
  const beakLo = M.node('beakLower');
  beakLo.add(M.mesh(plate([[-0.06, -0.02], [0.06, -0.02], [0.05, 0.11], [-0.05, 0.11]], 0.025), MAT.bronze));
  beakLo.position.set(0, -0.145, 0.15);
  headCore.add(beakUp, beakLo);
  // nozzle
  const nozzle = M.node('nozzle');
  const nzProf = [new THREE.Vector2(0.01, 0), new THREE.Vector2(0.055, 0.01),
    new THREE.Vector2(0.04, 0.10), new THREE.Vector2(0.015, 0.14)];
  const nz = M.mesh(new THREE.LatheGeometry(nzProf, 10), MAT.gun);
  nozzle.position.set(0, -0.11, 0.16); nozzle.rotation.x = Math.PI / 2;
  nozzle.add(nz);
  headCore.add(nozzle);
  // sensor stalk pair
  ['stalkL', 'stalkR'].forEach((n, i) => {
    const st = M.node(n);
    const rod = M.mesh(cyl(0.012, 0.012, 0.16, 6), MAT.lite);
    const cap = M.mesh(new THREE.SphereGeometry(0.022, 8, 6), MAT.lens);
    cap.position.y = 0.09;
    st.add(rod, cap);
    st.position.set(i ? 0.19 : -0.19, 0.12, -0.04);
    st.rotation.z = i ? -0.5 : 0.5;
    headCore.add(st);
  });
  face.add(headCore);
  // neck collar joins face to mantle seg0
  const collar = M.node('neckCollar');
  collar.add(M.mesh(torus(0.20, 0.05), MAT.lite));
  collar.scale.set(1.15, 1.15, 1.15); collar.rotation.x = Math.PI / 2 - 0.5;
  collar.position.set(0, 0.70, 0.72);
  torso.add(collar);

  // ---------------- PASS 3 : EXTREMITIES (eight armed tentacle chains) -----
  const NSEG = 6, SLEN = 0.235;
  const arms = [];
  for (let i = 0; i < 8; i++) {
    const th = i * Math.PI / 4 + Math.PI / 8;
    const armNode = M.node('arm' + i);
    armNode.position.set(Math.sin(th) * 0.46, 0.42, Math.cos(th) * 0.46);
    armNode.userData.yaw = th;
    armNode.userData.front = Math.cos(th);
    crown.add(armNode);
    let parent = armNode;
    const segs = [];
    for (let k = 0; k < NSEG; k++) {
      const r0 = 0.085 * (1 - k / NSEG * 0.75);
      const s = M.node('arm' + i + 's' + k);
      s.position.set(0, 0, k ? SLEN * 0.96 : 0);
      // bone stock
      s.add(M.mesh(cyl(r0 * 0.82, r0, SLEN, 8), MAT.gun));
      const bone = s.children[s.children.length - 1];
      bone.geometry.translate(0, SLEN / 2, 0);
      bone.rotation.x = Math.PI / 2;
      // joint barrel collar
      s.add(M.mesh(cyl(r0 + 0.016, r0 + 0.016, 0.05, 8), MAT.bronze));
      // sucker pair
      const suck = M.node('suckers' + i + '_' + k);
      const sg1 = M.mesh(new THREE.SphereGeometry(r0 * 0.45, 8, 6), MAT.lite);
      sg1.scale.set(1, 0.5, 1); sg1.position.set(0, -r0 * 0.75, SLEN * 0.30);
      const sg2 = sg1.clone(); sg2.position.z = SLEN * 0.62;
      suck.add(sg1, sg2);
      s.add(suck);
      // drive ram along top: barrel + polished rod + gland
      const ramB = M.mesh(cyl(0.014, 0.014, 0.10, 6), MAT.recess);
      ramB.geometry.translate(0, 0.05, 0); ramB.rotation.x = Math.PI / 2;
      ramB.position.set(0, r0 * 0.9, SLEN * 0.30);
      const rod = M.mesh(cyl(0.007, 0.007, 0.10, 6), MAT.lite);
      rod.geometry.translate(0, 0.05, 0); rod.rotation.x = Math.PI / 2;
      rod.position.set(0, r0 * 0.98, SLEN * 0.45);
      s.add(ramB, rod);
      parent.add(s);
      segs.push(s); parent = s;
    }
    const tip = M.node('arm' + i + 'tip');
    tip.position.set(0, 0, SLEN * 0.96);
    const tc = M.mesh(new THREE.ConeGeometry(0.026, 0.13, 8), MAT.lite);
    tc.rotation.x = Math.PI / 2; tc.position.z = 0.065;
    tip.add(tc);
    parent.add(tip);
    arms.push({ node: armNode, segs, tip, th, front: Math.cos(th), side: Math.sin(th) });
  }

  // ---------------- PASS 4/5 : MECHANISM + SHELLS on the mantle ------------
  mantle.forEach((s, i) => {
    const r = segR[i];
    // internal ram pair at flanks
    [-1, 1].forEach(sg => {
      const ram = M.node('mantleRam' + i + sg);
      const b = M.mesh(cyl(0.03, 0.03, 0.30, 8), MAT.recess);
      const rod = M.mesh(cyl(0.016, 0.016, 0.20, 8), MAT.lite);
      rod.position.y = 0.22;
      ram.add(b, rod);
      ram.position.set(sg * r * 0.75, 0, 0.05);
      s.add(ram);
    });
    // shells — partial spheres clamped over the stack, lapping over neighbours
    const shOffset = [0.10, -0.08, 0.14, -0.12, 0.12][i];
    ['L', 'R'].forEach((sd, j) => {
      const sh = M.node('shell' + i + sd);
      const g = new THREE.SphereGeometry(r * 1.05, 18, 12,
        0, Math.PI * 2, 0, Math.PI * 0.5);
      const pc = M.mesh(g, j ? MAT.shell : MAT.shell2);
      pc.scale.set(1, 0.65, 1.18);
      pc.position.set(0, 0.10 + shOffset, j ? -0.035 : 0.035);
      pc.rotation.z = (j ? -1 : 1) * 0.25 + shOffset * (j ? -0.4 : 0.4);
      // rolled rim
      const rim = M.mesh(torus(r * 1.02, 0.025), MAT.lite);
      rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.18, 1);
      rim.position.y = 0.02;
      sh.add(pc, rim);
      // raised rib + bolt row
      const rib = M.mesh(new THREE.BoxGeometry(0.02, r * 0.6, 0.02), MAT.lite);
      rib.position.set((j ? 1 : -1) * 0.6, 0.25, 0);
      rib.rotation.x = 0.1;
      sh.add(rib);
      for (let b = 0; b < 3; b++) {
        const bt = M.mesh(cyl(0.014, 0.014, 0.012, 6), MAT.recess);
        bt.position.set((j ? 1 : -1) * 0.35, 0.6 - b * 0.22, 0.30);
        sh.add(bt);
      }
      s.add(sh);
    });
  });
  // hazard stencil + serial numerals on one shell (2 markings, tiny)
  const stencil = M.node('stencilMark');
  const tri = M.mesh(new THREE.ShapeGeometry(
    (() => { const s = new THREE.Shape(); s.moveTo(0, 0.08);
      s.lineTo(0.07, -0.04); s.lineTo(-0.07, -0.04); return s; })()), MAT.mark);
  tri.position.set(0.30, 1.35, -0.05);
  tri.rotation.x = -0.45; stencil.add(tri);
  torso.add(stencil);

  // ---------------- PASS 6 : CABLE HARNESS (split at joints, ports both) ---
  const harness = M.node('harness');
  const routes = [
    { sega: 1, off: [[0.20, 0.25, 0.25], [0.30, -0.05, 0.30], [0.30, -0.45, 0.30]], r: 0.028 },
    { sega: 2, off: [[-0.25, 0.30, 0.30], [-0.32, -0.05, 0.35], [-0.30, -0.45, 0.30]], r: 0.02 },
    { sega: 3, off: [[0.12, -0.30, -0.30], [0.22, 0.02, -0.34], [0.18, 0.32, -0.30]], r: 0.034 },
    { sega: 1, off: [[-0.14, 0.20, -0.25], [-0.20, -0.08, -0.30], [-0.16, -0.40, -0.25]], r: 0.017 },
    { sega: 0, off: [[0.14, -0.18, 0.20], [0.18, 0.02, 0.24], [0.12, 0.22, 0.20]], r: 0.017 },
  ];
  routes.forEach((rt, ri) => {
    const run = M.node('hose' + ri);
    const pts = rt.off.map(p => p);
    const tube = M.mesh(tubesAlong(pts, rt.r), MAT.cable);
    run.add(tube);
    // ports at both ends
    const portGeo = new THREE.LatheGeometry(
      [new THREE.Vector2(0.01, 0), new THREE.Vector2(rt.r * 1.9, 0.0),
      new THREE.Vector2(rt.r * 1.9, 0.035), new THREE.Vector2(rt.r, 0.05)], 8);
    [pts[0], pts[pts.length - 1]].forEach(pp => {
      const port = M.mesh(portGeo, MAT.lite);
      port.position.set(...pp); run.add(port);
    });
    // clamp mid-run
    const clamp = M.mesh(cyl(rt.r * 1.6, rt.r * 1.6, 0.025, 8), MAT.bronze);
    clamp.position.set(...pts[1]); clamp.rotation.y = 1;
    run.add(clamp);
    mantle[rt.sega].add(run);
  });
  mantle[2].add(harness);

  // status slots — the only two emissive spots on the body
  const emA = M.node('statusPortA');
  emA.add(M.mesh(new THREE.BoxGeometry(0.05, 0.015, 0.08), MAT.amber));
  emA.position.set(0.30, 1.28, 0.02); mantle[2].add(emA);
  const emB = M.node('statusPortB');
  emB.add(M.mesh(new THREE.BoxGeometry(0.04, 0.012, 0.06), MAT.cyan));
  emB.position.set(-0.24, 1.05, 0.40); mantle[1].add(emB);

  // free arm crown ring is parented to torso (via crown) — attach crown now
  torso.add(crown);

  // ============================ POSE ============================
  const ss = (p, a, b) => { let t = Math.min(Math.max((p - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  const ler = (a, b, t) => a + (b - a) * Math.min(Math.max(t, 0), 1);

  object_pose_holder: {
    const act = ['attack', 'fire', 'hit', 'block', 'gather', 'deposit', 'eat',
      'drink', 'jump', 'land', 'signal', 'sleep', 'wake', 'die', 'evolve'];

    root.userData.pose = (s) => {
      const speed = s.speed || 0;
      const stride = s.stride || 0;
      const turn = s.turn || 0;
      const grounded = s.grounded !== false;
      const health = s.health === undefined ? 1 : s.health;
      const phase = s.phase || 0;
      const spN = Math.min(speed / 6, 1);
      const strideAng = stride * Math.PI * 2;

      // channels
      let bodyPitch = -0.06, bodyRoll = 0, bobY = 0, mantlePitch = 0, pulse = 0.02,
        headPitch = 0, beak = 0.05, droop = 0.62, curl = 0.55, spreadAmp = 0,
        rippleAmp = 0.1, fists = 0;
      let streamback = 0, sagSide = 0, idleT = 0;

      if (speed < 0.02) { // STAND idling
        idleT = s.t;
        rippleAmp = 0.12; pulse = 0.025 + Math.sin(s.t * 1.4) * 0.02;
        headPitch = Math.sin(s.t * 0.35) * 0.10;
        bodyRoll = Math.sin(s.t * 0.23) * 0.05;
      } else {
        idleT = strideAng; rippleAmp = 0.22 + Math.min(speed, 2.5) * 0.10;
        curl = 0.55 - spN * 0.85; droop = 0.62 - spN * 1.9;
        pulse = 0.03 + spN * 0.10; bodyPitch = -0.06 - spN * 0.22;
        if (speed >= 2) fists = Math.min(speed - 2, 1) * 0.4; // gait change: stream
      }
      // turn overlay
      if (turn !== 0) {
        bodyRoll += -turn * 0.30; headPitch += -turn * 0.08;
        sagSide = turn; curl += Math.abs(turn) * 0.0;
      }
      // airborne overlay
      if (!grounded) {
        streamback = 1; curl = -0.10; droop = -1.9;
        rippleAmp = 0.10; bodyPitch += 0.15; beak = 0.02;
      }
      // hurt overlay
      if (health < 1) {
        const w = (1 - health); bodyRoll += w * 0.28;
        headPitch += w * 0.35; curl += w * 0.30; pulse = 0.01;
        sagSide = 1;
      }
      if (s.action) {
        const a = s.action, p = phase;
        if (a === 'attack') { // wind up, lunge with frontal arms, beak snaps
          const w = ss(p, 0, 0.35), l = ss(p, 0.35, 0.62) - ss(p, 0.75, 1);
          curl = 0.55 - l * 1.15 + w * 0.35; headPitch += w * 0.25 - l * 0.30;
          beak = w * 0.02 + l * 0.65 - ss(p, 0.8, 1) * 0.65;
          bodyPitch -= l * 0.18; bobY += l * 0.0; rippleAmp *= 1 - w * 0.6;
        } else if (a === 'fire') { // aim nozzle, jet, recoil
          const aim = ss(p, 0, 0.3), rel = ss(p, 0.45, 0.6) - ss(p, 0.75, 1);
          headPitch += aim * 0.22 - rel * 0.3; beak = aim * 0.4 + rel * 0.2;
          bodyPitch -= aim * 0.08; pulse = aim * 0.02 + rel * 0.22;
          bobY -= rel * 0.06; rippleAmp *= (1 - aim * 0.7);
        } else if (a === 'hit') {
          const f = ss(p, 0, 0.15) * (1 - ss(p, 0.15, 0.9));
          bodyRoll += f * 0.45; headPitch += f * 0.4; bobY -= f * 0.10;
          curl += f * 0.5;
        } else if (a === 'block') {
          const b = ss(p, 0, 0.2) * (1 - ss(p, 0.8, 1));
          bodyRoll *= (1 - b); headPitch += b * 0.15; bobY -= b * 0.12;
          curl += b * 0.65; droop += b * 0.35; bodyPitch += b * 0.1;
        } else if (a === 'gather') { // down, close front arms, up
          const d = ss(p, 0, 0.35) * (1 - ss(p, 0.75, 1));
          bodyPitch += d * 0.65; bobY -= d * 0.28;
          headPitch += d * 0.55; droop += d * 0.6; curl += d * 0.4 - ss(p, 0.35, 0.55) * 0.7;
          beak += d * 0.3;
        } else if (a === 'deposit') {
          const d = ss(p, 0, 0.3) * (1 - ss(p, 0.8, 1));
          bodyPitch += d * 0.5; bobY -= d * 0.24; headPitch += d * 0.45;
          droop += d * 0.55; curl += d * 0.25 - ss(p, 0.3, 0.5) * 0.25;
          beak += d * 0.45;
        } else if (a === 'eat') { // head down, beak works 3 chews
          const d = ss(p, 0, 0.2) * (1 - ss(p, 0.85, 1));
          bodyPitch += d * 0.55; bobY -= d * 0.2; headPitch += d * 0.6;
          const ck = ss(Math.sin(p * Math.PI * 6) * 0.5 + 0.5, 0, 1) * d;
          beak = 0.1 + ck * 0.7;
        } else if (a === 'drink') { // held low
          const d = ss(p, 0, 0.25) * (1 - ss(p, 0.8, 1));
          bodyPitch += d * 0.6; bobY -= d * 0.24; headPitch += d * 0.7;
          beak = d * 0.35; curl += d * 0.3;
        } else if (a === 'jump') {
          const c = ss(p, 0, 0.33), l = ss(p, 0.33, 0.75);
          bobY -= c * 0.30 - l * 0.35; bodyPitch += c * 0.45 - l * 0.9;
          droop += c * 0.8 - l * 2.2; curl += c * 0.9 - l * 1.2;
          headPitch += c * 0.3;
        } else if (a === 'land') {
          const r = ss(p, 0, 0.25), c = ss(p, 0.25, 0.6);
          bobY += r * 0.1 - c * 0.30 + ss(p, 0.6, 1) * 0.2;
          droop += r * 0.5 + c * 0.9 - ss(p, 0.6, 1) * 0.9;
          curl += c * 0.8 - ss(p, 0.6, 1) * 0.8; bodyPitch += c * 0.3 - ss(p, 0.6, 1) * 0.3;
        } else if (a === 'signal') { // rise, spread arms, hold
          const d = ss(p, 0, 0.3) * (1 - ss(p, 0.7, 1));
          bobY += d * 0.25; bodyPitch -= d * 0.15; headPitch -= d * 0.35;
          spreadAmp = d * 0.65; curl = 0.16; droop = 0.15; beak = d * 0.5;
          mantlePitch -= d * 0.12; pulse = 0.05;
        } else if (a === 'sleep') { // fold in and end still
          const d = ss(p, 0, 1);
          bobY -= d * 0.55; bodyPitch += d * 0.5; headPitch += d * 0.8;
          curl = 0.55 + d * 0.65; droop += d * 0.5; spreadAmp += d * 0.3;
          pulse = (1 - d) * 0.02; beak = 0.02; rippleAmp *= (1 - d);
        } else if (a === 'wake') {
          const d = 1 - ss(p, 0.15, 1); // come back to standing
          bobY -= d * 0.55; bodyPitch += d * 0.5; headPitch += d * 0.8;
          curl += d * 0.65; droop += d * 0.5; spreadAmp += d * 0.3;
          pulse = 0.02 + ss(p, 0.6, 1) * 0.02; headPitch -= ss(p, 0.5, 1) * 0.3 * 0;
        } else if (a === 'die') {
          const d = ss(p, 0, 0.85);
          bobY -= d * 0.6; bodyPitch += d * 0.9; bodyRoll += d * 0.7;
          headPitch += d * 1.0; curl += d * 0.9; droop -= d * 0.2;
          beak = d * 0.3; pulse = (1 - d) * 0.02; rippleAmp *= (1 - d);
        } else if (a === 'evolve') {
          const b = ss(p, 0, 0.25), h = ss(p, 0.3, 0.7) - ss(p, 0.75, 1);
          bodyPitch -= b * 0.1; bobY += h * 0.12; curl = 0.2; droop = 0.2;
          spreadAmp = h * 0.8; headPitch -= h * 0.3; pulse = 0.04 + h * 0.18;
          beak = h * 0.6;
        }
        sagSide = 0;
      }

      // torso
      torso.rotation.set(bodyPitch, 0, bodyRoll);
      torso.position.y = bobY;
      // mantle segments: slight chain pitch + breath pulse
      mantle.forEach((sg, i) => {
        sg.quaternion.copy(sg.userData.qbase);
        const e = new THREE.Quaternion().setFromEuler(
          new THREE.Euler((mantlePitch + headPitch * 0.2) * (i / mantle.length), 0, 0));
        sg.quaternion.multiply(e);
        const psc = 1 + pulse * (i === 2 ? 2.2 : 1.2);
        sg.scale.set(1, psc, 1);
      });
      // face
      face.rotation.x = headPitch;
      face.position.y = 0.66;
      const beakU = face.getObjectByName('headCore').getObjectByName('beakUpper');
      const beakL = face.getObjectByName('headCore').getObjectByName('beakLower');
      beakU.rotation.x = -beak * 0.5; beakL.rotation.x = beak;
      // arms
      arms.forEach((A, ai) => {
        const insideHurt = (sagSide > 0 && A.side > 0) || (sagSide < 0 && A.side < 0);
        const cLocal = curl + (insideHurt ? 0.45 : 0) - (insideHurt ? 0 : 0);
        const frontBoost = Math.abs(A.front);
        const phaseI = strideAng + ai * (Math.PI / 1.8);
        const idlePh = idleT * 1.0 + ai;
        const wave = (speed < 0.02 && !s.action) ?
          Math.sin(idlePh) * rippleAmp :
          Math.sin(phaseI) * rippleAmp * (streamback ? 0.3 : 1);
        const spreadDelta = spreadAmp * (A.front < 0 ? 0.6 : 1) +
          (sagSide ? (insideHurt ? 0.4 : -0.3) : 0);
        A.node.rotation.set(droop + (insideHurt ? 0.5 : 0) * 1,
          A.th + spreadDelta * Math.sign(A.side || 0.0001), 0);
        A.segs.forEach((sg, k) => {
          const w = (k + 1) / A.segs.length;
          sg.rotation.set(
            cLocal * 0.35 * w + wave * w * (1 - fists * 0.8), 0, 0);
          if (k === 0 && fists > 0) sg.rotation.x -= fists * 0.2 * frontBoost;
        });
      });
      // hazard stencil sticks to torso with body
    };
  }

  return root;
}