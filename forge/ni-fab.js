function build(THREE, TSL) {
  // ONE QUALITY: ENDURANCE AND ARMOUR — a low, wide, dome-shelled machine.
  // BRIEF: a squat armoured octopus. The mantle is a fat stacked drum of machined
  // hoops leaning slightly back, clad in a pressed bone-white dome that laps over
  // two flank shells and a rear shell, with gear stacks and a chain run showing in
  // the rear gap. The face is the dense end: two big dark glass lenses in stepped
  // bezels under a bevelled brow, a faceted snout wedge between them, a hinged
  // two-part beak slung under the arm crown. Eight arms radiate from a bearing
  // crown, each a tapering chain of seven machined links with a top shell strip,
  // rubber suckers underneath and a claw tip. Hoses loop over the rear shell edge,
  // both ends landing in ports on the mantle; every arm hose lives on one link.
  // The expensive thing: the eyes — deep, dark, recessed, machine-alive.

  const { vec3, positionLocal, normalLocal, sin, mix, smoothstep, float, oneMinus } = TSL;

  const N = (p) => sin(p.x.add(sin(p.y.mul(1.7)))).mul(sin(p.y.mul(1.3).add(sin(p.z.mul(2.1))))).mul(sin(p.z.mul(1.6).add(sin(p.x.mul(2.7))))).abs();
  const w1 = N(positionLocal.mul(6.0));
  const w2 = N(positionLocal.mul(13.7).add(vec3(5, 7, 3)));
  const up = normalLocal.y.mul(0.5).add(0.5);
  const down = oneMinus(up);

  const shellMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide });
  {
    let c = mix(vec3(0.847, 0.824, 0.776), vec3(0.788, 0.761, 0.706), w1);
    c = mix(c, vec3(0.710, 0.675, 0.612), smoothstep(0.45, 0.9, w2).mul(0.7));
    c = mix(c, vec3(0.30, 0.28, 0.25), smoothstep(0.72, 0.96, w2.mul(down.mul(0.6).add(0.55))));
    c = mix(c, vec3(0.23, 0.21, 0.18), down.mul(w1).mul(0.4));
    shellMat.colorNode = c.add(up.mul(w1).mul(0.05));
    shellMat.roughnessNode = float(0.52).add(w1.mul(0.18)).add(up.mul(0.12));
  }
  const metal = new THREE.MeshStandardNodeMaterial({ metalness: 0.85, roughness: 0.55 });
  metal.colorNode = mix(vec3(0.243, 0.227, 0.204), vec3(0.42, 0.40, 0.37), w1.mul(0.55).add(up.mul(0.25)));
  metal.roughnessNode = float(0.5).add(w1.mul(0.2)).add(up.mul(0.08));
  const bronze = new THREE.MeshStandardNodeMaterial({ metalness: 0.8, roughness: 0.6 });
  bronze.colorNode = mix(vec3(0.29, 0.26, 0.22), vec3(0.37, 0.34, 0.29), w1.mul(0.7));
  const rubber = new THREE.MeshStandardNodeMaterial({ color: 0x1e1d1b, metalness: 0.0, roughness: 0.9 });
  const lensMat = new THREE.MeshStandardNodeMaterial({ color: 0x0a0c0e, metalness: 0.1, roughness: 0.08 });
  const accent = new THREE.MeshStandardNodeMaterial({ color: 0xc2521e, metalness: 0.1, roughness: 0.6 });
  const darkPaint = new THREE.MeshStandardNodeMaterial({ color: 0x2a2723, metalness: 0.1, roughness: 0.7 });
  const glow = new THREE.MeshStandardNodeMaterial({ color: 0x201200, emissive: new THREE.Color(0xcc7722), emissiveIntensity: 1.5, roughness: 0.5 });

  const root = new THREE.Group(); root.name = 'octopus';
  const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  function M(geo, mat, parent, x, y, z, name) {
    const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); if (name) o.name = name; parent.add(o); return o;
  }
  function hose(parent, pts, r, mat, fit) {
    const cur = new THREE.CatmullRomCurve3(pts.map(V3));
    const h = new THREE.Mesh(new THREE.TubeGeometry(cur, 12, r, 6, false), mat); parent.add(h);
    if (fit !== false) for (const e of [0, 1]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.7, r * 2.0, r * 2.6, 8), metal);
      f.position.copy(cur.getPoint(e));
      f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cur.getTangent(e).normalize());
      parent.add(f);
    }
    return h;
  }
  function bolts(parent, r, y, n, s) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      M(new THREE.CylinderGeometry(s, s, s * 1.4, 6), bronze, parent, Math.sin(a) * r, y, Math.cos(a) * r);
    }
  }

  // ── 1. CROWN (arm hub, bearing race, beak) ─────────────────────────────
  const crown = new THREE.Group(); crown.name = 'crown'; crown.position.set(0, 0.55, 0); root.add(crown);
  const ring = M(new THREE.TorusGeometry(0.36, 0.055, 10, 24), metal, crown, 0, 0, 0, 'crownRace'); ring.rotation.x = Math.PI / 2;
  M(new THREE.CylinderGeometry(0.30, 0.35, 0.13, 16), bronze, crown, 0, -0.02, 0, 'crownHub');
  M(new THREE.CylinderGeometry(0.20, 0.20, 0.05, 16), metal, crown, 0, -0.11, 0, 'crownGear');
  bolts(crown, 0.27, 0.06, 12, 0.016);
  M(new THREE.BoxGeometry(0.09, 0.06, 0.07), metal, crown, -0.2, 0.06, -0.24, 'junctionBox');
  M(new THREE.BoxGeometry(0.03, 0.025, 0.02), glow, crown, -0.2, 0.06, -0.28, 'statusPort');

  const beak = new THREE.Group(); beak.name = 'beak'; beak.position.set(0, -0.06, 0.28); crown.add(beak);
  const beakU = new THREE.Group(); beakU.name = 'beakUpper'; beakU.position.set(0, 0.02, 0.02); beak.add(beakU);
  const bu = M(new THREE.ConeGeometry(0.078, 0.17, 6), metal, beakU, 0, -0.07, 0.01); bu.rotation.x = Math.PI - 0.35;
  M(new THREE.ConeGeometry(0.014, 0.05, 5), bronze, beakU, -0.035, -0.13, 0.05, 'toothL');
  M(new THREE.ConeGeometry(0.014, 0.05, 5), bronze, beakU, 0.035, -0.13, 0.05, 'toothR');
  const beakL = new THREE.Group(); beakL.name = 'beakLower'; beakL.position.set(0, 0.0, -0.03); beak.add(beakL);
  const bl = M(new THREE.ConeGeometry(0.06, 0.13, 6), bronze, beakL, 0, -0.06, 0.02); bl.rotation.x = Math.PI - 0.15;
  M(new THREE.TorusGeometry(0.075, 0.02, 8, 12), rubber, beak, 0, 0.03, 0, 'beakBoot').rotation.x = Math.PI / 2;

  // ── 2+5. MANTLE — core stack, hardware, then shells ────────────────────
  const mant = new THREE.Group(); mant.name = 'mantle'; mant.position.set(0, 0.62, -0.05); root.add(mant);
  const hoopSpec = [[0.50, 0.54, 0.24, 0.10, 0.0], [0.55, 0.52, 0.26, 0.36, -0.07], [0.47, 0.42, 0.24, 0.60, -0.13], [0.33, 0.24, 0.22, 0.82, -0.17]];
  hoopSpec.forEach((h, i) => {
    M(new THREE.CylinderGeometry(h[1], h[0], h[2], 16), i % 2 ? bronze : metal, mant, 0, h[3], h[4], 'mantleSeg' + i);
    M(new THREE.TorusGeometry((h[0] + h[1]) / 2 + 0.015, 0.018, 6, 20), metal, mant, 0, h[3] + h[2] / 2, h[4]).rotation.x = Math.PI / 2;
  });
  M(new THREE.SphereGeometry(0.26, 12, 8), bronze, mant, 0, 0.96, -0.18, 'mantleCap');
  M(new THREE.TorusGeometry(0.38, 0.035, 8, 22), metal, mant, 0, 0.0, 0, 'lowerRace').rotation.x = Math.PI / 2;
  // rear-gap hardware: gear stack + chain run (theta ~0.82pi -> dir (0.54,-0.84))
  const gdir = new THREE.Vector3(0.54, 0, -0.84);
  const gq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), gdir);
  [[0.115, 0.05, 0.24], [0.085, 0.045, 0.29], [0.05, 0.04, 0.33]].forEach((g, i) => {
    const gm = M(new THREE.CylinderGeometry(g[0], g[0], g[1], 14), i % 2 ? bronze : metal, mant, gdir.x * (0.40 + i * 0.03), 0.24, gdir.z * (0.40 + i * 0.03), 'gear' + i);
    gm.quaternion.copy(gq);
  });
  const spA = [0.25, 0.52, -0.40], spB = [0.23, 0.10, -0.36];
  for (const sp of [spA, spB]) { const s = M(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), metal, mant, sp[0], sp[1], sp[2], 'sprocket'); s.quaternion.copy(gq); }
  for (let k = 0; k < 11; k++) {
    const tt = k / 10;
    const l = M(new THREE.BoxGeometry(0.022, 0.05, 0.018), k % 2 ? metal : bronze, mant,
      spA[0] + (spB[0] - spA[0]) * tt + gdir.x * 0.05, spA[1] + (spB[1] - spA[1]) * tt, spA[2] + (spB[2] - spA[2]) * tt + gdir.z * 0.05);
    l.rotation.y = 0.55; l.name = 'chainLink' + k;
  }
  // shells (pass 5, but geometry lives here)
  const shTop = M(new THREE.SphereGeometry(0.66, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), shellMat, mant, 0, 0.60, -0.06, 'shellTop');
  shTop.scale.set(1.0, 0.85, 1.12);
  M(new THREE.TorusGeometry(0.645, 0.02, 6, 28), shellMat, mant, 0, 0.512, -0.06, 'shellTopLip').rotation.x = Math.PI / 2;
  const shL = M(new THREE.CylinderGeometry(0.44, 0.585, 0.64, 20, 1, true, Math.PI * 1.21, Math.PI * 0.62), shellMat, mant, 0, 0.33, -0.04, 'shellL'); shL.scale.z = 1.08;
  const shR = M(new THREE.CylinderGeometry(0.44, 0.585, 0.64, 20, 1, true, Math.PI * 0.17, Math.PI * 0.62), shellMat, mant, 0, 0.33, -0.04, 'shellR'); shR.scale.z = 1.08;
  const shRe = M(new THREE.CylinderGeometry(0.40, 0.555, 0.56, 14, 1, true, Math.PI * 0.90, Math.PI * 0.30), shellMat, mant, 0, 0.34, -0.06, 'shellRear');
  // ribs, stencil, hazard chevrons
  for (let k = -1; k <= 1; k++) M(new THREE.BoxGeometry(0.03, 0.02, 0.42), shellMat, shTop, k * 0.16, 0.55, -0.05, 'domeRib' + (k + 1));
  M(new THREE.CylinderGeometry(0.06, 0.06, 0.006, 3), darkPaint, shTop, 0.3, 0.52, 0.25, 'stencil');
  const ch1 = M(new THREE.BoxGeometry(0.10, 0.02, 0.012), accent, mant, -0.06, 0.30, -0.545, 'chevronA'); ch1.rotation.z = 0.55; ch1.rotation.x = -0.15;
  const ch2 = M(new THREE.BoxGeometry(0.10, 0.02, 0.012), accent, mant, 0.06, 0.30, -0.545, 'chevronB'); ch2.rotation.z = -0.55; ch2.rotation.x = -0.15;
  // rear hoses: mantle port -> mantle port, looping over the rear shell edge
  hose(mant, [[0.06, 0.74, -0.44], [0.34, 0.52, -0.55], [0.30, 0.14, -0.42]], 0.028, rubber);
  hose(mant, [[-0.04, 0.72, -0.46], [0.30, 0.48, -0.60], [0.26, 0.12, -0.46]], 0.019, rubber);
  hose(mant, [[-0.12, 0.70, -0.44], [-0.34, 0.45, -0.55], [-0.26, 0.10, -0.44]], 0.013, rubber);
  M(new THREE.BoxGeometry(0.05, 0.03, 0.06), metal, mant, 0.33, 0.5, -0.56, 'hoseClamp');

  // ── head front (part of mantle) ────────────────────────────────────────
  const snoutG = new THREE.CylinderGeometry(0.10, 0.25, 0.36, 4, 1); snoutG.rotateY(Math.PI / 4); snoutG.rotateX(Math.PI / 2);
  M(snoutG, metal, mant, 0, 0.20, 0.44, 'snout');
  const snSh = M(new THREE.CylinderGeometry(0.11, 0.20, 0.32, 12, 1, true, Math.PI * 0.62, Math.PI * 0.76), shellMat, mant, 0, 0.21, 0.44, 'snoutShell');
  snSh.rotation.x = Math.PI / 2;
  const browShape = new THREE.Shape();
  browShape.moveTo(-0.36, 0); browShape.lineTo(0.36, 0); browShape.lineTo(0.25, 0.17); browShape.lineTo(-0.25, 0.17);
  const brow = M(new THREE.ExtrudeGeometry(browShape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }), shellMat, mant, 0, 0.44, 0.40, 'brow');
  brow.rotation.x = -0.62;
  M(new THREE.BoxGeometry(0.05, 0.025, 0.05), metal, mant, -0.14, 0.53, 0.36, 'browRibL');
  M(new THREE.BoxGeometry(0.05, 0.025, 0.05), metal, mant, 0.14, 0.53, 0.36, 'browRibR');
  const cheekShape = new THREE.Shape();
  cheekShape.moveTo(0, 0); cheekShape.lineTo(0.2, 0.03); cheekShape.lineTo(0.17, 0.19); cheekShape.lineTo(0.02, 0.15);
  for (const sd of [-1, 1]) {
    const ck = M(new THREE.ExtrudeGeometry(cheekShape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 }), shellMat, mant, sd * 0.24, 0.06, 0.40, sd < 0 ? 'cheekL' : 'cheekR');
    ck.rotation.y = sd * -0.7; ck.scale.x = sd;
    M(new THREE.BoxGeometry(0.06, 0.05, 0.05), bronze, mant, sd * 0.20, 0.10, 0.46, sd < 0 ? 'jawJunctionL' : 'jawJunctionR');
  }
  M(new THREE.BoxGeometry(0.16, 0.04, 0.10), shellMat, mant, 0, 0.02, 0.46, 'chin');
  const antL = M(new THREE.CylinderGeometry(0.008, 0.012, 0.20, 6), metal, mant, -0.16, 1.02, -0.06, 'antennaL');
  M(new THREE.SphereGeometry(0.016, 8, 6), rubber, antL, 0, 0.11, 0);
  const antR = M(new THREE.CylinderGeometry(0.008, 0.012, 0.13, 6), metal, mant, 0.19, 0.99, -0.10, 'antennaR');
  M(new THREE.SphereGeometry(0.014, 8, 6), rubber, antR, 0, 0.075, 0);
  hose(mant, [[-0.1, 0.50, 0.40], [-0.2, 0.36, 0.44], [-0.22, 0.20, 0.40]], 0.011, rubber);

  function eye(sd) {
    const g = new THREE.Group(); g.name = sd < 0 ? 'eyeL' : 'eyeR';
    g.position.set(0.38 * sd, 0.30, 0.36); g.rotation.y = sd * 0.55; mant.add(g);
    const prof = [[0.05, 0], [0.115, 0.01], [0.128, 0.05], [0.10, 0.075], [0.092, 0.115]].map(p => new THREE.Vector2(p[0], p[1]));
    const bz = M(new THREE.LatheGeometry(prof, 20), metal, g, 0, 0, 0, g.name + '_bezel'); bz.rotation.x = Math.PI / 2;
    M(new THREE.SphereGeometry(0.078, 20, 14), lensMat, g, 0, 0, 0.022, g.name + '_lens');
    M(new THREE.TorusGeometry(0.095, 0.012, 6, 18), rubber, g, 0, 0, 0.095, g.name + '_gasket').rotation.x = 0;
    const hood = M(new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI, 0, Math.PI * 0.42), shellMat, g, 0, 0.015, 0.0, g.name + '_hood');
    hood.rotation.x = -0.45;
    M(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6), bronze, g, 0.10 * sd, -0.08, 0.05, g.name + '_bolt');
    return g;
  }
  const eyeL = eye(-1), eyeR = eye(1);

  // ── 3+4. ARMS — segment chains, joints, rams, shells, suckers ──────────
  const AZ = [0.35, 1.13, 1.92, 2.70, -0.35, -1.13, -1.92, -2.70];
  const L = [0.34, 0.30, 0.27, 0.24, 0.21, 0.18, 0.16];
  const RAD = [0.115, 0.10, 0.088, 0.076, 0.064, 0.052, 0.040, 0.028];
  const arms = [];
  AZ.forEach((az, i) => {
    const arm = new THREE.Group(); arm.name = 'arm' + i;
    arm.position.set(Math.sin(az) * 0.33, 0.55, Math.cos(az) * 0.33);
    arm.rotation.y = az; root.add(arm);
    M(new THREE.BoxGeometry(0.14, 0.10, 0.10), metal, arm, 0, 0.02, 0.0, 'arm' + i + '_yoke');
    const bar = M(new THREE.CylinderGeometry(0.024, 0.024, 0.13, 8), bronze, arm, 0, 0.09, 0.05); bar.rotation.x = 1.05;
    const rod = M(new THREE.CylinderGeometry(0.011, 0.011, 0.12, 6), metal, arm, 0, 0.02, 0.13); rod.rotation.x = 1.05;
    M(new THREE.SphereGeometry(0.018, 8, 6), metal, arm, 0, -0.03, 0.18);
    let parent = arm; const segs = [];
    for (let j = 0; j < 7; j++) {
      const seg = new THREE.Group(); seg.name = 'arm' + i + '_seg' + j;
      seg.position.z = j === 0 ? 0.06 : L[j - 1]; parent.add(seg);
      const r1 = RAD[j], r2 = RAD[j + 1];
      const jb = M(new THREE.CylinderGeometry(r1 * 1.12, r1 * 1.12, r1 * 1.7, 10), metal, seg, 0, 0, 0); jb.rotation.z = Math.PI / 2;
      if (j > 0) M(new THREE.TorusGeometry(r1 * 1.02, 0.016, 6, 12), rubber, seg, 0, 0, 0).rotation.y = Math.PI / 2;
      const body = M(new THREE.CylinderGeometry(r2 * 0.92, r1 * 0.92, L[j], 8), bronze, seg, 0, 0, L[j] / 2); body.rotation.x = Math.PI / 2;
      const sh = M(new THREE.CylinderGeometry(r2 + 0.02, r1 + 0.022, L[j] * 0.94, 12, 1, true, Math.PI * 0.42, Math.PI * 1.16), shellMat, seg, 0, 0, L[j] / 2);
      sh.rotation.x = Math.PI / 2;
      if (j >= 1 && j <= 4) for (let k = 0; k < 2; k++) {
        const sx = (k % 2 ? 1 : -1) * r1 * 0.28;
        const su = M(new THREE.CylinderGeometry(r1 * 0.30, r1 * 0.42, 0.022, 8), rubber, seg, sx, -r1 * 0.92, L[j] * (0.3 + 0.4 * k));
        M(new THREE.CylinderGeometry(r1 * 0.14, r1 * 0.14, 0.01, 8), metal, su, 0, -0.012, 0);
      }
      if (j < 5) hose(seg, [[0, r1 * 0.72, 0.05], [0, (r1 + r2) * 0.42, L[j] * 0.55], [0, r2 * 0.72, L[j] - 0.03]], 0.012, rubber);
      segs.push(seg); parent = seg;
    }
    const tip = new THREE.Group(); tip.name = 'arm' + i + '_tip'; tip.position.z = L[6]; parent.add(tip);
    const claw = M(new THREE.ConeGeometry(0.030, 0.11, 8), metal, tip, 0, 0, 0.05); claw.rotation.x = Math.PI / 2;
    arms.push({ g: arm, segs, tip, az });
  });

  // ── POSE ───────────────────────────────────────────────────────────────
  const REST = [0.50, 0.10, -0.10, -0.25, -0.20, -0.10, 0.05];
  const TAU = Math.PI * 2;
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));
  const sat = (x) => cl(x, 0, 1);
  const lp = (a, b, t) => a + (b - a) * t;
  const ss = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const bump = (x) => Math.sin(Math.PI * sat(x));

  // set an initial rest pose
  arms.forEach(A => A.segs.forEach((s, j) => s.rotation.x = REST[j]));

  root.userData.pose = (s) => {
    const t = s.t || 0, spd = s.speed || 0, st = s.stride || 0, turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = (s.health == null ? 1 : s.health);
    const hurt = sat((0.6 - health) / 0.6);
    const ph = s.phase || 0, act = s.action || null;

    let mx = 0, my = 0, mz = 0, py = 0.62, sxz = 1, sy = 1;
    let beakO = 0, siph = 0.5, shellO = 0, scan = 0;

    const idle = sat(1.2 - spd);
    const br = Math.sin(t * 1.7) * (0.016 + 0.02 * sat(1 - spd));
    sxz = 1 + br * 0.5; sy = 1 + br;
    mz += Math.sin(t * 0.6) * 0.02 * idle;
    scan = Math.sin(t * 0.45) * 0.25 * idle;
    siph += Math.sin(t * 1.1) * 0.06 * idle;

    const jet = grounded ? sat((spd - 2.2) / 1.8) : 0;
    const crawlAmp = grounded && spd > 0.01 ? (0.10 + 0.22 * sat(spd / 2)) * (1 - jet) : 0;
    py -= sat(1 - Math.abs(spd - 0.5) / 0.5) * 0.06;           // gathered creep stance
    py += jet * 0.18; mx += jet * 0.55;
    if (jet > 0) { const pu = Math.sin(st * TAU * 2); sxz *= 1 + jet * 0.06 * pu; sy *= 1 - jet * 0.05 * pu; }
    py += Math.sin(st * TAU * 2) * 0.02 * sat(spd) * (1 - jet);
    mz += Math.sin(st * TAU) * 0.04 * sat(spd) * (1 - jet);

    my += turn * 0.45; mz -= turn * 0.22;
    py -= hurt * 0.10; mz += hurt * 0.20; mx += hurt * 0.08;

    const yaw = [], pitch = [];
    for (let i = 0; i < 8; i++) {
      const az = arms[i].az; let yw = az; const p = [];
      const wph = st * TAU * 2 + i * 2.4;
      for (let j = 0; j < 7; j++) {
        let v = REST[j] + crawlAmp * Math.sin(wph - j * 0.85) * (1 - j * 0.06);
        v += Math.sin(t * 0.9 + i * 0.8 - j * 0.5) * 0.015 * idle;
        if (j === 0) v -= Math.cos(az) * 0.10 * sat(spd) * (1 - jet);
        if (j === 2) v += turn * Math.sin(az) * 0.10;
        if (j === 3) v += turn * Math.sin(az) * 0.08;
        p.push(v);
      }
      if (hurt > 0 && az < 0) for (let j = 0; j < 7; j++) p[j] = lp(p[j], j === 0 ? 0.55 : 0.05, hurt * 0.7);
      if (jet > 0) {
        yw = lp(az, Math.sign(az || 1) * 2.75, jet * 0.85);
        for (let j = 0; j < 7; j++) p[j] = lp(p[j], (j === 0 ? 0.25 : 0.02) + 0.05 * Math.sin(st * TAU * 2 - j * 0.5), jet);
      }
      if (!grounded) {
        yw = az;
        for (let j = 0; j < 7; j++) p[j] = (j === 0 ? 0.5 : 0.06) + 0.05 * Math.sin(t * 2.5 + i * 1.3 - j * 0.7);
      }
      yaw.push(yw); pitch.push(p);
    }

    if (act === 'attack') {
      const c = ph < 0.35 ? -(ph / 0.35) : ph < 0.55 ? lp(-1, 1, (ph - 0.35) / 0.2) : lp(1, 0, (ph - 0.55) / 0.45);
      for (let i = 0; i < 8; i++) if (Math.abs(arms[i].az) < 0.6) {
        yaw[i] = lp(arms[i].az, Math.sign(arms[i].az) * 0.15, Math.abs(c));
        for (let j = 0; j < 7; j++) pitch[i][j] += c * (0.55 - j * 0.16);
      }
      mx += Math.max(c, 0) * 0.3; py += Math.max(c, 0) * 0.05; beakO = Math.max(c, 0) * 0.6;
    } else if (act === 'fire') {
      const aim = ss(0, 0.35, ph) * (1 - ss(0.75, 1, ph)), rel = bump((ph - 0.4) / 0.25);
      siph = 0.5 - 0.5 * aim + rel * 0.35;
      sy *= 1 - 0.16 * rel; sxz *= 1 + 0.10 * rel; mx -= rel * 0.25;
    } else if (act === 'hit') {
      const f = bump(sat(ph * 2.2)) * (1 - ph * 0.6);
      mx -= f * 0.35; py -= f * 0.06; beakO = f * 0.3;
      for (let i = 0; i < 8; i++) for (let j = 3; j < 7; j++) pitch[i][j] += f * 0.35;
    } else if (act === 'block') {
      const b = ss(0, 0.22, ph) * (1 - ss(0.75, 1, ph));
      for (let i = 0; i < 8; i++) if (Math.abs(arms[i].az) < 1.5) {
        yaw[i] = lp(yaw[i], arms[i].az * 0.5, b);
        pitch[i][0] = lp(pitch[i][0], -0.55, b);
        for (let j = 1; j < 7; j++) pitch[i][j] = lp(pitch[i][j], 0.42, b);
      }
      mx -= b * 0.25; py -= b * 0.10;
    } else if (act === 'gather' || act === 'deposit') {
      const g = act === 'gather';
      const dn = g ? ss(0, 0.35, ph) * (1 - ss(0.65, 1, ph)) : ss(0, 0.45, ph) * (1 - ss(0.7, 1, ph));
      const curl = g ? ss(0.35, 0.55, ph) : 1 - ss(0.45, 0.7, ph);
      yaw[0] = lp(yaw[0], 0.1, dn);
      pitch[0][0] = lp(pitch[0][0], 0.85, dn); pitch[0][1] = lp(pitch[0][1], 0.35, dn);
      for (let j = 4; j < 7; j++) pitch[0][j] = lp(pitch[0][j], 0.75, curl);
      mx += dn * 0.28;
    } else if (act === 'eat') {
      const w = ss(0, 0.2, ph) * (1 - ss(0.85, 1, ph)), cyc = Math.sin(ph * TAU * 3);
      for (let i = 0; i < 8; i++) if (Math.abs(arms[i].az) < 0.6) {
        yaw[i] = lp(yaw[i], Math.sign(arms[i].az) * 0.18, w);
        pitch[i][0] = lp(pitch[i][0], 0.55, w); pitch[i][1] = lp(pitch[i][1], 0.3, w);
        for (let j = 2; j < 7; j++) pitch[i][j] = lp(pitch[i][j], 0.45 + 0.18 * Math.sin(ph * TAU * 3 - j * 0.5), w);
      }
      beakO = w * (0.3 + 0.25 * Math.max(0, cyc)); mx += w * 0.15;
    } else if (act === 'drink') {
      const h = ss(0, 0.25, ph) * (1 - ss(0.8, 1, ph));
      mx += h * 0.4; py -= h * 0.12; siph = 0.5 + h * 0.5;
      sy *= 1 + 0.03 * Math.sin(ph * TAU * 2) * h;
    } else if (act === 'jump') {
      const cr = ss(0, 0.35, ph) * (1 - ss(0.35, 0.6, ph)), ext = ss(0.35, 0.75, ph);
      py += -cr * 0.18 + ext * 0.28; mx += ext * 0.25;
      for (let i = 0; i < 8; i++) {
        for (let j = 1; j < 4; j++) pitch[i][j] += cr * 0.35;
        pitch[i][0] = lp(pitch[i][0], 0.95, ext);
        for (let j = 1; j < 7; j++) pitch[i][j] = lp(pitch[i][j], -0.02, ext);
      }
    } else if (act === 'land') {
      const reach = 1 - ss(0.25, 0.5, ph), comp = bump(ss(0.25, 0.65, ph));
      for (let i = 0; i < 8; i++) {
        pitch[i][0] = lp(pitch[i][0], 0.75, reach);
        for (let j = 1; j < 7; j++) { pitch[i][j] = lp(pitch[i][j], 0.05, reach); if (j < 4) pitch[i][j] += comp * 0.3; }
      }
      py -= comp * 0.16; mx += reach * 0.1;
    } else if (act === 'signal') {
      const b = ss(0, 0.25, ph) * (1 - ss(0.8, 1, ph));
      for (let i = 0; i < 8; i++) {
        pitch[i][0] = lp(pitch[i][0], -0.7, b);
        for (let j = 1; j < 3; j++) pitch[i][j] = lp(pitch[i][j], -0.15, b);
        for (let j = 3; j < 7; j++) pitch[i][j] = lp(pitch[i][j], 0.12 + 0.1 * Math.sin(t * 6 + i), b);
      }
      py += b * 0.10; sxz *= 1 + b * 0.10; sy *= 1 + b * 0.12; beakO = b * 0.35; mx -= b * 0.15;
    } else if (act === 'sleep' || act === 'wake') {
      let e = act === 'sleep' ? ss(0, 0.7, ph) : 1 - ss(0.1, 0.8, ph);
      if (act === 'wake') mz += Math.sin(ph * 25) * 0.02 * (1 - ph) * ss(0, 0.2, ph);
      py = lp(py, 0.34, e); mx = lp(mx, 0.12, e); sy *= 1 - 0.06 * e;
      for (let i = 0; i < 8; i++) {
        pitch[i][0] = lp(pitch[i][0], 0.5, e);
        for (let j = 1; j < 7; j++) pitch[i][j] = lp(pitch[i][j], 0.30, e);
      }
    } else if (act === 'die') {
      const d = ss(0, 0.65, ph);
      py = lp(py, 0.30, d); mz += 1.15 * d; mx += 0.1 * d; sy *= 1 - 0.12 * d;
      beakO = d * 0.45;
      for (let i = 0; i < 8; i++) {
        yaw[i] = lp(yaw[i], arms[i].az + (i % 2 ? 0.25 : -0.2), d);
        pitch[i][0] = lp(pitch[i][0], 0.42, d);
        for (let j = 1; j < 7; j++) pitch[i][j] = lp(pitch[i][j], (j % 2 ? 0.10 : -0.06), d);
      }
    } else if (act === 'evolve') {
      const v = ss(0, 0.3, ph) * (1 - ss(0.7, 1, ph));
      shellO = v; mz += Math.sin(t * 35) * 0.015 * v; py -= v * 0.05; sxz *= 1 + v * 0.05;
      for (let i = 0; i < 8; i++) { pitch[i][1] += v * 0.15; pitch[i][2] += v * 0.12; }
    }

    // write
    mant.position.set(0, py, -0.05);
    mant.rotation.set(mx, my, mz);
    mant.scale.set(sxz, sy, sxz);
    shTop.position.y = 0.60 + 0.10 * shellO;
    shL.position.x = -0.09 * shellO; shR.position.x = 0.09 * shellO;
    shRe.position.z = -0.06 - 0.08 * shellO;
    beakU.rotation.x = -beakO * 0.6; beakL.rotation.x = beakO * 0.7;
    eyeL.rotation.y = -0.55 + scan + turn * 0.3;
    eyeR.rotation.y = 0.55 + scan + turn * 0.3;
    // siphon (built below arms? — it exists on mantle via name lookup)
    const sip = root.userData._siph; if (sip) sip.rotation.x = siph;
    for (let i = 0; i < 8; i++) {
      const A = arms[i];
      A.g.rotation.set(0, yaw[i], 0);
      for (let j = 0; j < 7; j++) {
        A.segs[j].rotation.x = pitch[i][j];
        A.segs[j].rotation.y = Math.sin(st * TAU * 2 + i * 2.1 - j * 0.8) * 0.05 * (crawlAmp > 0 ? 1 : 0)
          + Math.sin(t * 0.8 + i + j) * 0.02 * idle;
      }
      A.tip.rotation.x = 0.12 + Math.sin(st * TAU * 2 + i * 2.1 - 6) * 0.08 * (crawlAmp > 0 ? 1 : 0);
    }
  };

  // siphon (asymmetric, right-front-low on the mantle)
  const siphG = new THREE.Group(); siphG.name = 'siphon'; siphG.position.set(0.35, 0.10, 0.34); siphG.rotation.x = 0.5; mant.add(siphG);
  const sprof = [[0.02, 0], [0.055, 0.02], [0.06, 0.10], [0.045, 0.14], [0.05, 0.20], [0.038, 0.24]].map(p => new THREE.Vector2(p[0], p[1]));
  const snoz = M(new THREE.LatheGeometry(sprof, 12), bronze, siphG, 0, 0, 0, 'siphonBarrel'); snoz.rotation.x = Math.PI / 2;
  M(new THREE.TorusGeometry(0.05, 0.012, 6, 12), rubber, siphG, 0, 0, 0.02, 'siphonClamp');
  M(new THREE.CylinderGeometry(0.03, 0.036, 0.03, 10), metal, siphG, 0, 0, 0.25, 'siphonNozzle').rotation.x = Math.PI / 2;
  root.userData._siph = siphG;

  root.userData.update = () => {};
  return root;
}