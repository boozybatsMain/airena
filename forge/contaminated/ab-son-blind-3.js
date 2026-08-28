function build(THREE, TSL) {
  const root = new THREE.Group(); root.name = 'octopus';

  // ---------- materials ----------
  const boneA = new THREE.MeshStandardMaterial({ color: 0xD8D2C6, roughness: 0.55, metalness: 0.22 });
  const boneB = new THREE.MeshStandardMaterial({ color: 0xC9C2B4, roughness: 0.6, metalness: 0.18 });
  const boneC = new THREE.MeshStandardMaterial({ color: 0xB5AC9C, roughness: 0.5, metalness: 0.3 });
  const darkA = new THREE.MeshStandardMaterial({ color: 0x55524C, roughness: 0.45, metalness: 0.7 });
  const darkB = new THREE.MeshStandardMaterial({ color: 0x6B665E, roughness: 0.5, metalness: 0.6 });
  const darkC = new THREE.MeshStandardMaterial({ color: 0x3E3A34, roughness: 0.5, metalness: 0.68 });
  const darkD = new THREE.MeshStandardMaterial({ color: 0x4A4238, roughness: 0.4, metalness: 0.75 });
  const accent1 = new THREE.MeshStandardMaterial({ color: 0xC2521E, roughness: 0.4, metalness: 0.5 });
  const accent2 = new THREE.MeshStandardMaterial({ color: 0xA8231C, roughness: 0.4, metalness: 0.5 });
  const hoseMat = new THREE.MeshStandardMaterial({ color: 0x2A2724, roughness: 0.85, metalness: 0.1 });
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x17150F, roughness: 0.6, metalness: 0.35 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0xE8B84B, roughness: 0.2, metalness: 0.1, emissive: 0x5C3A0E, emissiveIntensity: 0.4 });
  const boltMat = darkD;

  // ---------- geometry helpers ----------
  function polyShape(radius, sides, rot) {
    const s = new THREE.Shape();
    for (let i = 0; i < sides; i++) {
      const a = rot + i * (Math.PI * 2 / sides);
      const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath();
    return s;
  }
  function extrudePlate(shape, depth, bevel) {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
    return g;
  }
  function rectShape(w, h) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
    return s;
  }
  function trapShape(w0, w1, len) {
    const s = new THREE.Shape();
    s.moveTo(-w0 / 2, 0); s.lineTo(w0 / 2, 0); s.lineTo(w1 / 2, len); s.lineTo(-w1 / 2, len); s.closePath();
    return s;
  }
  function hexBoltGeo(r, h) { return new THREE.CylinderGeometry(r, r, h, 6); }
  function ringGeo(r, tube) { return new THREE.TorusGeometry(r, tube, 6, 10); }

  function corrugatedTubeGeo(curve, tubularSeg, radialSeg, baseR, ampRatio, freq) {
    const frames = curve.computeFrenetFrames(tubularSeg, false);
    const pos = [], nor = [], uv = [], idx = [];
    for (let i = 0; i <= tubularSeg; i++) {
      const t = i / tubularSeg;
      const p = curve.getPointAt(t);
      const N = frames.normals[i], B = frames.binormals[i];
      const r = baseR * (1 + ampRatio * Math.sin(t * freq * Math.PI * 2));
      for (let j = 0; j <= radialSeg; j++) {
        const v = j / radialSeg * Math.PI * 2;
        const cs = Math.cos(v), sn = Math.sin(v);
        const nx = cs * N.x + sn * B.x, ny = cs * N.y + sn * B.y, nz = cs * N.z + sn * B.z;
        pos.push(p.x + r * nx, p.y + r * ny, p.z + r * nz);
        nor.push(nx, ny, nz);
        uv.push(t, j / radialSeg);
      }
    }
    for (let i = 0; i < tubularSeg; i++) {
      for (let j = 0; j < radialSeg; j++) {
        const a = (radialSeg + 1) * i + j, b = (radialSeg + 1) * (i + 1) + j;
        const c = (radialSeg + 1) * (i + 1) + j + 1, d = (radialSeg + 1) * i + j + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
  function addHose(parent, pts, radius, corrugated, mat, name) {
    const curve = new THREE.CatmullRomCurve3(pts);
    const len = curve.getLength();
    let geo;
    if (corrugated) geo = corrugatedTubeGeo(curve, Math.max(18, Math.round(len * 44)), 7, radius, 0.3, 5.5);
    else geo = new THREE.TubeGeometry(curve, Math.max(14, Math.round(len * 30)), radius, 6, false);
    const m = new THREE.Mesh(geo, mat); m.name = name;
    parent.add(m);
    return len;
  }
  function basisQuat(yDir, zApprox) {
    const y = yDir.clone().normalize();
    let z = zApprox.clone().sub(y.clone().multiplyScalar(zApprox.dot(y)));
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1);
    z.normalize();
    const x = new THREE.Vector3().crossVectors(y, z).normalize();
    z.crossVectors(x, y).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }
  function addBolts(parent, pts, r, h, mat) {
    if (!pts.length) return null;
    const inst = new THREE.InstancedMesh(hexBoltGeo(r, h), mat, pts.length);
    const m = new THREE.Matrix4();
    for (let i = 0; i < pts.length; i++) {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pts[i].n);
      m.compose(pts[i].p, q, new THREE.Vector3(1, 1, 1));
      inst.setMatrixAt(i, m);
    }
    parent.add(inst);
    return inst;
  }
  function plateBoltPts(w0, w1, len, zOff, perSide) {
    const pts = [];
    for (const s of [-1, 1]) for (let i = 0; i < perSide; i++) {
      const t = (i + 0.5) / perSide, w = THREE.MathUtils.lerp(w0, w1, t);
      pts.push({ p: new THREE.Vector3(s * (w / 2 - 0.015), t * len, zOff), n: new THREE.Vector3(0, 0, 1) });
    }
    return pts;
  }
  function addClamp(parent, pos, axis, r, tube, mat) {
    const g = new THREE.Mesh(ringGeo(r, tube), mat);
    g.position.copy(pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.clone().normalize());
    parent.add(g);
  }
  function addBox(parent, pos, size, mat, rotY) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
    g.position.copy(pos); if (rotY) g.rotation.y = rotY;
    parent.add(g);
  }
  function addHandle(parent, pos, quat, mat) {
    const g = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 5, 8, Math.PI), mat);
    g.position.copy(pos); g.quaternion.copy(quat);
    parent.add(g);
  }
  function addVent(parent, pos, quat, w, h, mat) {
    const grp = new THREE.Group(); grp.position.copy(pos); grp.quaternion.copy(quat);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), darkC); grp.add(base);
    for (let i = -1; i <= 1; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.006, 0.016), darkA);
      slat.position.set(0, i * h * 0.28, 0.006); grp.add(slat);
    }
    parent.add(grp);
  }

  // ---------- dimensions ----------
  const mantleR = 0.55, mantleH = 0.62, capH = 0.16;
  const segDef = [
    { len: 0.34, rN: 0.11, rF: 0.085 },
    { len: 0.40, rN: 0.085, rF: 0.062 },
    { len: 0.38, rN: 0.062, rF: 0.042 },
    { len: 0.32, rN: 0.042, rF: 0.016 }
  ];
  const segNames = ['Base', 'Mid1', 'Mid2', 'Tip'];

  // ---------- mantle core ----------
  const mantle = new THREE.Group(); mantle.name = 'mantle'; root.add(mantle);

  const coreGeo = extrudePlate(polyShape(mantleR, 8, Math.PI / 8), mantleH, 0.02);
  coreGeo.rotateX(-Math.PI / 2);
  const mantleFrame = new THREE.Mesh(coreGeo, darkA); mantleFrame.name = 'mantleFrame';
  mantle.add(mantleFrame);

  const capGeo = extrudePlate(polyShape(mantleR * 1.06, 8, Math.PI / 8), capH, 0.03);
  capGeo.rotateX(-Math.PI / 2);
  const mantleCap = new THREE.Group(); mantleCap.name = 'mantleCap'; mantleCap.position.set(0, mantleH, 0);
  const capMesh = new THREE.Mesh(capGeo, boneA); capMesh.name = 'mantleCapPlate';
  mantleCap.add(capMesh); mantle.add(mantleCap);
  {
    const insig = new THREE.Mesh(extrudePlate(rectShape(0.14, 0.09), 0.02, 0.006), accent1);
    insig.position.set(0, capH * 0.5 + 0.011, mantleR * 0.5); insig.rotation.x = -0.5;
    mantleCap.add(insig);
    addBolts(mantleCap, plateBoltPts(mantleR * 1.7, mantleR * 1.7, 0.001, capH + 0.012, 6).map((p, i) => {
      const a = i * (Math.PI * 2 / 12);
      return { p: new THREE.Vector3(Math.sin(a) * mantleR * 0.85, capH * 0.5 + 0.012, Math.cos(a) * mantleR * 0.85), n: new THREE.Vector3(0, 1, 0) };
    }), 0.018, 0.014, boltMat);
  }

  const sidePlates = [];
  for (let i = 0; i < 8; i++) {
    const angle = i * (Math.PI * 2 / 8);
    const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const plateMat = (i === 0) ? boneB : boneA;
    const pg = extrudePlate(rectShape(0.42, mantleH * 0.82), 0.045, 0.014);
    pg.translate(0, 0, -0.0225);
    const plate = new THREE.Mesh(pg, plateMat); plate.name = 'mantlePlate' + i;
    plate.position.set(dir.x * mantleR * 1.03, mantleH * 0.52, dir.z * mantleR * 1.03);
    plate.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    mantle.add(plate); sidePlates.push(plate);
    const bpts = plateBoltPts(0.42, 0.42, mantleH * 0.82, 0.023, 3).map(pt => {
      const local = new THREE.Vector3(pt.p.x, pt.p.y - mantleH * 0.41, pt.p.z);
      const world = local.clone().applyQuaternion(plate.quaternion).add(plate.position);
      return { p: world, n: dir.clone() };
    });
    addBolts(mantle, bpts, 0.017, 0.013, boltMat);
    if (i % 2 === 0) addHandle(mantle, plate.position.clone().add(new THREE.Vector3(0, 0.05, 0)).addScaledVector(dir, 0.03), plate.quaternion, darkD);
    if (i % 4 === 1) addVent(mantle, plate.position.clone().addScaledVector(dir, 0.005), plate.quaternion, 0.14, 0.12, darkC);
  }

  // ---------- head / eyes / beak ----------
  const head = new THREE.Group(); head.name = 'head';
  head.position.set(0, mantleH * 0.66, mantleR * 0.62);
  mantle.add(head);
  {
    const shroud = new THREE.Mesh(extrudePlate(rectShape(0.5, 0.3), 0.05, 0.016), boneB);
    shroud.position.set(0, 0, 0.02); shroud.name = 'headShroud';
    head.add(shroud);
    addBolts(head, plateBoltPts(0.5, 0.5, 0.3, 0.045 + 0.012, 2).map((p, i) => ({ p: new THREE.Vector3(p.p.x, p.p.y - 0.15 + 0.02, 0.045 + 0.012), n: new THREE.Vector3(0, 0, 1) })), 0.015, 0.012, boltMat);
  }
  const eyeL = new THREE.Group(); eyeL.name = 'eyeL'; eyeL.position.set(-0.17, 0.02, 0.09);
  const eyeR = new THREE.Group(); eyeR.name = 'eyeR'; eyeR.position.set(0.17, 0.02, 0.09);
  for (const e of [eyeL, eyeR]) {
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10), darkC);
    socket.rotation.x = Math.PI / 2; e.add(socket);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), lensMat);
    lens.position.z = 0.025; e.add(lens);
    head.add(e);
  }
  const beakUpper = new THREE.Group(); beakUpper.name = 'beakUpper'; beakUpper.position.set(0, -0.14, 0.12);
  const beakLower = new THREE.Group(); beakLower.name = 'beakLower'; beakLower.position.set(0, -0.14, 0.12);
  {
    const upG = extrudePlate(trapShape(0.14, 0.03, 0.13), 0.09, 0.01); upG.translate(-0.07, 0, -0.045);
    const up = new THREE.Mesh(upG, accent2); up.rotation.x = -1.15; beakUpper.add(up);
    const loG = extrudePlate(trapShape(0.13, 0.03, 0.11), 0.085, 0.01); loG.translate(-0.065, 0, -0.0425);
    const lo = new THREE.Mesh(loG, darkC); lo.rotation.x = 1.05; beakLower.add(lo);
  }
  head.add(beakUpper, beakLower);

  // ---------- arms ----------
  const arms = [];
  for (let i = 0; i < 8; i++) {
    const angle = i * (Math.PI * 2 / 8);
    const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const armRoot = new THREE.Group(); armRoot.name = 'arm' + i;
    armRoot.position.set(dir.x * mantleR * 0.96, mantleH * 0.08, dir.z * mantleR * 0.96);
    const yDir = new THREE.Vector3(dir.x * 0.55, -1, dir.z * 0.55).normalize();
    const zApprox = dir.clone();
    const restQuat = basisQuat(yDir, zApprox);
    armRoot.quaternion.copy(restQuat);
    mantle.add(armRoot);

    const segs = [];
    let parentNode = armRoot;
    for (let s = 0; s < 4; s++) {
      const d = segDef[s];
      const segGroup = new THREE.Group(); segGroup.name = 'arm' + i + segNames[s];
      const frameGeo = new THREE.CylinderGeometry(d.rF, d.rN, d.len, 8);
      frameGeo.translate(0, d.len / 2, 0);
      const frame = new THREE.Mesh(frameGeo, s % 2 === 0 ? darkB : darkA); frame.name = segGroup.name + 'Frame';
      segGroup.add(frame);

      const pw0 = d.rN * 2.15, pw1 = d.rF * 2.15;
      const pGeo = extrudePlate(trapShape(pw0, pw1, d.len * 0.92), 0.03, 0.011);
      pGeo.translate(0, 0, -0.015);
      const plateMat = (s === 0 && (i === 0 || i === 4)) ? accent1 : (s % 3 === 0 ? boneA : boneB);
      const plate = new THREE.Mesh(pGeo, plateMat); plate.name = segGroup.name + 'Plate';
      plate.position.set(0, d.len * 0.04, d.rF * 0.82);
      segGroup.add(plate);
      const bpts = plateBoltPts(pw0, pw1, d.len * 0.92, 0.03 / 2 + 0.011, 3).map(pt => ({
        p: new THREE.Vector3(pt.p.x, pt.p.y + d.len * 0.04, pt.p.z), n: new THREE.Vector3(0, 0, 1)
      }));
      addBolts(segGroup, bpts, 0.013, 0.01, boltMat);

      // suckers on ventral (-Z) side
      const suckerCount = 3;
      const sInst = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), boneC, suckerCount * 2);
      const sm = new THREE.Matrix4(), sq = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
      let sidx = 0;
      for (let k = 0; k < suckerCount; k++) {
        const t = (k + 0.5) / suckerCount;
        const rr = THREE.MathUtils.lerp(d.rN, d.rF, t) * 0.95;
        const sr = THREE.MathUtils.lerp(0.045, 0.03, t);
        for (const side of [-1, 1]) {
          sm.compose(new THREE.Vector3(side * rr * 0.5, t * d.len, -rr * 0.85), sq, new THREE.Vector3(sr, sr, sr));
          sInst.setMatrixAt(sidx++, sm);
        }
      }
      sInst.name = segGroup.name + 'Suckers';
      segGroup.add(sInst);

      // joint housing (round, mechanical)
      const jh = new THREE.Mesh(new THREE.CylinderGeometry(d.rN * 1.12, d.rN * 1.12, d.rN * 0.5, 10), darkC);
      jh.rotation.x = Math.PI / 2; jh.position.y = 0.002; jh.name = segGroup.name + 'Joint';
      segGroup.add(jh);
      addBolts(segGroup, [0, 1, 2, 3].map(k => {
        const a = k * (Math.PI / 2) + i * 0.3;
        return { p: new THREE.Vector3(Math.cos(a) * d.rN * 1.1, 0, Math.sin(a) * d.rN * 1.1), n: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) };
      }), 0.014, 0.012, boltMat);

      parentNode.add(segGroup);
      segGroup.position.set(0, s === 0 ? 0 : segDef[s - 1].len, 0);
      segs.push(segGroup);
      parentNode = segGroup;
    }
    arms.push({ root: armRoot, restQuat, angle, lat: dir.x, segs, len: segDef.reduce((a, d) => a + d.len, 0) });
  }

  // ---------- harness: hoses & wires pass ----------
  const hoseRuns = [];
  // thick hoses from mantle vent (top) down to two arm shoulders
  hoseRuns.push([mantle, [
    new THREE.Vector3(0.05, mantleH * 0.95, mantleR * 0.3),
    new THREE.Vector3(0.28, mantleH * 0.6, mantleR * 0.55),
    new THREE.Vector3(arms[1].root.position.x * 0.9, mantleH * 0.25, arms[1].root.position.z * 0.9),
    new THREE.Vector3(arms[1].root.position.x, mantleH * 0.1, arms[1].root.position.z)
  ], 0.028, true, hoseMat]);
  hoseRuns.push([mantle, [
    new THREE.Vector3(-0.05, mantleH * 0.95, -mantleR * 0.3),
    new THREE.Vector3(-0.3, mantleH * 0.58, -mantleR * 0.5),
    new THREE.Vector3(arms[5].root.position.x * 0.9, mantleH * 0.22, arms[5].root.position.z * 0.9),
    new THREE.Vector3(arms[5].root.position.x, mantleH * 0.1, arms[5].root.position.z)
  ], 0.026, true, hoseMat]);
  // collar manifold ring segments between adjacent arm shoulders
  for (let i = 0; i < 8; i++) {
    const a = arms[i], b = arms[(i + 1) % 8];
    hoseRuns.push([mantle, [
      a.root.position.clone().add(new THREE.Vector3(0, 0.03, 0)),
      a.root.position.clone().lerp(b.root.position, 0.5).add(new THREE.Vector3(0, 0.08, 0)),
      b.root.position.clone().add(new THREE.Vector3(0, 0.03, 0))
    ], 0.012, false, wireMat]);
  }
  // per-arm hose: mantle -> shoulder -> over base -> into mid1 (like shoulder-to-knee run)
  for (let i = 0; i < 8; i++) {
    const a = arms[i];
    const base = a.segs[0], mid1 = a.segs[1];
    hoseRuns.push([base, [
      new THREE.Vector3(0.06, -0.02, 0.05),
      new THREE.Vector3(0.05, segDef[0].len * 0.35, 0.09),
      new THREE.Vector3(0.02, segDef[0].len * 0.8, 0.07),
      new THREE.Vector3(0, segDef[0].len * 1.02, 0.04)
    ], 0.02, true, hoseMat]);
    hoseRuns.push([mid1, [
      new THREE.Vector3(-0.015, 0.02, -0.04),
      new THREE.Vector3(-0.02, segDef[1].len * 0.5, -0.05),
      new THREE.Vector3(-0.01, segDef[1].len * 0.95, -0.03)
    ], 0.008, false, wireMat]);
  }
  // sensor wires from head down mantle side
  hoseRuns.push([mantle, [
    new THREE.Vector3(0.05, mantleH * 0.68, mantleR * 0.6),
    new THREE.Vector3(0.16, mantleH * 0.45, mantleR * 0.5),
    new THREE.Vector3(0.1, mantleH * 0.15, mantleR * 0.4)
  ], 0.007, false, wireMat]);
  hoseRuns.push([mantle, [
    new THREE.Vector3(-0.05, mantleH * 0.68, mantleR * 0.6),
    new THREE.Vector3(-0.16, mantleH * 0.45, mantleR * 0.5),
    new THREE.Vector3(-0.1, mantleH * 0.15, mantleR * 0.4)
  ], 0.007, false, wireMat]);

  let boltHardwareCount = 0;
  for (const [parent, pts, r, corr, mat] of hoseRuns) {
    addHose(parent, pts, r, corr, mat, (parent.name || 'part') + 'Hose' + (boltHardwareCount++));
    // clamps + cable ties along the run
    const n = Math.max(2, Math.floor(pts.length));
    for (let k = 1; k < n; k++) {
      const p = pts[k];
      const dirv = pts[k].clone().sub(pts[k - 1]).normalize();
      if (k % 1 === 0) addClamp(parent, p, dirv, r * 1.9, r * 0.35, darkD);
    }
  }
  // junction boxes at mantle ports
  addBox(mantle, new THREE.Vector3(0.05, mantleH * 0.95, mantleR * 0.3), new THREE.Vector3(0.06, 0.05, 0.05), darkC);
  addBox(mantle, new THREE.Vector3(-0.05, mantleH * 0.95, -mantleR * 0.3), new THREE.Vector3(0.06, 0.05, 0.05), darkC);
  for (let i = 0; i < 8; i++) {
    addBox(arms[i].segs[0], new THREE.Vector3(0.06, -0.02, 0.05), new THREE.Vector3(0.035, 0.03, 0.03), darkD);
  }
  // blanking plates on lower mantle
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + Math.PI / 4;
    const g = new THREE.Mesh(extrudePlate(rectShape(0.1, 0.08), 0.02, 0.006), boneC);
    g.position.set(Math.sin(a) * mantleR * 0.9, mantleH * 0.1, Math.cos(a) * mantleR * 0.9);
    g.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    mantle.add(g);
  }

  // ---------- pose ----------
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const ease = (t) => t * t * (3 - 2 * t);
  const tri = (t, peak) => (t < peak ? ease(t / Math.max(peak, 1e-4)) : ease(1 - (t - peak) / Math.max(1 - peak, 1e-4)));
  const AXIS_X = new THREE.Vector3(1, 0, 0);

  function setSeg(seg, curl, twist, spread) {
    seg.rotation.set(curl, twist || 0, spread || 0);
  }

  object_pose:
  root.userData.pose = (s) => {
    const spd = Math.max(0, s.speed || 0);
    const health = s.health === undefined ? 1 : s.health;
    const grounded = s.grounded !== false;

    // defaults / rest
    mantle.position.set(0, 0, 0);
    mantle.rotation.set(0, 0, 0);
    mantle.scale.set(1, 1, 1);
    mantleCap.position.set(0, mantleH, 0);
    mantleCap.rotation.set(0, 0, 0);
    head.position.set(0, mantleH * 0.66, mantleR * 0.62);
    head.rotation.set(0, 0, 0);
    beakUpper.rotation.set(0, 0, 0);
    beakLower.rotation.set(0, 0, 0);

    const breathe = Math.sin(s.t * 1.6) * 0.012;
    mantle.scale.y = 1 + breathe;
    mantleCap.position.y = mantleH + Math.sin(s.t * 1.6 + 0.4) * 0.008;
    head.rotation.x = Math.sin(s.t * 0.7) * 0.03;

    function poseLocomotion() {
      const groupBlend = clamp01((spd - 1) / 2);
      const sweepAmp = THREE.MathUtils.lerp(0.16, 0.95, clamp01(spd / 6));
      const liftAmp = THREE.MathUtils.lerp(0.05, 0.34, clamp01(spd / 6));
      const gather = Math.max(0, 1 - spd * 1.7);
      const lean = THREE.MathUtils.lerp(0, 0.34, clamp01(spd / 4));
      const bob = Math.sin(s.stride * Math.PI * 4) * THREE.MathUtils.lerp(0.01, 0.05, clamp01(spd / 3));

      mantle.position.y += bob - gather * 0.05;
      mantle.rotation.x = -lean;
      mantle.position.z += lean * 0.25;

      for (let i = 0; i < 8; i++) {
        const a = arms[i];
        const wave = i / 8;
        const travelPhase = (s.stride + wave) % 1;
        const groupPhase = (s.stride + (i % 2) * 0.5) % 1;
        const phase = THREE.MathUtils.lerp(travelPhase, groupPhase, groupBlend);
        const sweep = Math.sin(phase * Math.PI * 2 - Math.PI * 0.5);
        const lift = Math.max(0, Math.sin(phase * Math.PI * 2));

        a.root.quaternion.copy(a.restQuat).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, sweep * sweepAmp));
        const curlBase = 0.15 + gather * 0.5;
        setSeg(a.segs[0], curlBase + lift * 0.25, 0, sweep * 0.08);
        setSeg(a.segs[1], curlBase * 1.4 + lift * liftAmp * 1.6, 0, 0);
        setSeg(a.segs[2], curlBase * 1.2 + lift * liftAmp * 1.3, 0, 0);
        setSeg(a.segs[3], curlBase * 0.8 + lift * liftAmp * 0.7, 0, 0);
      }
    }

    function applyTurn() {
      if (!s.turn) return;
      mantle.rotation.z += -s.turn * 0.16;
      head.rotation.y += -s.turn * 0.25;
      for (let i = 0; i < 8; i++) {
        const a = arms[i];
        const bias = -s.turn * a.lat;
        a.segs[1].rotation.x += Math.max(0, bias) * 0.5;
        a.segs[0].rotation.z += -s.turn * 0.1 * (a.lat >= 0 ? 1 : -1);
      }
    }

    function applyHurt() {
      const t = 1 - health;
      if (t <= 0) return;
      mantle.rotation.z += 0.25 * t;
      mantle.position.y -= 0.06 * t;
      head.rotation.z += 0.2 * t;
      arms[2].segs[0].rotation.x += 0.4 * t;
      arms[2].segs[1].rotation.x += 0.5 * t;
      arms[6].root.position.y -= 0.02 * t;
    }

    function applyAirborne() {
      for (let i = 0; i < 8; i++) {
        const a = arms[i];
        a.root.quaternion.copy(a.restQuat).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, -0.5));
        setSeg(a.segs[0], -0.4, 0, 0);
        setSeg(a.segs[1], -0.6, 0, 0);
        setSeg(a.segs[2], -0.5, 0, 0);
        setSeg(a.segs[3], -0.3, 0, 0);
      }
      mantle.rotation.x = -0.15;
    }

    if (s.action) {
      const p = clamp01(s.phase || 0);
      poseLocomotion();
      if (s.action === 'attack') {
        const w = tri(p, 0.35);
        for (const idx of [0, 1]) {
          const a = arms[idx];
          setSeg(a.segs[0], -0.5 * w + p * 0.9, 0, 0);
          setSeg(a.segs[1], -0.7 * w + p * 1.1, 0, 0);
          setSeg(a.segs[2], -0.3 * w + p * 0.8, 0, 0);
        }
        beakLower.rotation.x = 0.5 * Math.sin(p * Math.PI);
        beakUpper.rotation.x = -0.4 * Math.sin(p * Math.PI);
        mantle.position.z += ease(Math.min(p * 2, 1)) * 0.08 - ease(Math.max(0, p * 2 - 1)) * 0.08;
      } else if (s.action === 'fire') {
        const aim = ease(Math.min(p / 0.5, 1));
        const recoil = p > 0.5 ? Math.sin((p - 0.5) * Math.PI * 4) * (1 - (p - 0.5) * 2) : 0;
        const a = arms[0];
        setSeg(a.segs[0], -0.5 * aim, 0, 0);
        setSeg(a.segs[1], -0.7 * aim, 0, 0);
        setSeg(a.segs[2], -0.4 * aim, 0.0, 0);
        setSeg(a.segs[3], -0.2 * aim - recoil * 0.3, 0, 0);
        mantle.position.z -= recoil * 0.04;
      } else if (s.action === 'hit') {
        const w = tri(p, 0.2);
        mantle.rotation.x += 0.3 * w;
        mantle.position.z -= 0.1 * w;
        head.rotation.x -= 0.3 * w;
      } else if (s.action === 'block') {
        const w = ease(Math.min(p / 0.3, 1));
        mantle.position.y -= 0.08 * w;
        mantle.position.z -= 0.06 * w;
        mantle.rotation.x = 0.12 * w;
        head.rotation.x = 0.25 * w;
        for (const idx of [0, 1, 7]) {
          setSeg(arms[idx].segs[0], -0.7 * w, 0, 0);
          setSeg(arms[idx].segs[1], -0.5 * w, 0, 0);
        }
      } else if (s.action === 'gather') {
        const down = tri(p, 0.5) * 1.0;
        head.position.y -= 0.22 * ease(Math.min(p / 0.4, 1)) * (p < 0.6 ? 1 : (1 - (p - 0.6) / 0.4));
        head.rotation.x = 0.5 * down;
        const a = arms[0];
        setSeg(a.segs[0], -0.6 * down, 0, 0);
        setSeg(a.segs[1], -0.9 * down, 0, 0);
        setSeg(a.segs[2], -0.6 * down, 0, 0);
      } else if (s.action === 'deposit') {
        const down = ease(Math.min(p / 0.6, 1)) * (1 - ease(Math.max(0, (p - 0.8) / 0.2)));
        head.position.y -= 0.18 * down;
        head.rotation.x = 0.4 * down;
        const a = arms[0];
        setSeg(a.segs[0], -0.5 * down, 0, 0);
        setSeg(a.segs[1], -0.75 * down, 0, 0.1 * ease(Math.max(0, (p - 0.7) / 0.3)));
      } else if (s.action === 'eat') {
        const down = ease(Math.min(p / 0.2, 1)) * (1 - ease(Math.max(0, (p - 0.85) / 0.15)));
        head.position.y -= 0.16 * down;
        head.rotation.x = 0.45 * down;
        const chomp = Math.sin(p * Math.PI * 2 * 2.5) * down;
        beakLower.rotation.x = Math.max(0, chomp) * 0.5;
        beakUpper.rotation.x = -Math.max(0, chomp) * 0.4;
      } else if (s.action === 'drink') {
        const down = ease(Math.min(p / 0.25, 1)) * (1 - ease(Math.max(0, (p - 0.8) / 0.2)));
        head.position.y -= 0.17 * down;
        head.rotation.x = 0.5 * down;
        beakLower.rotation.x = 0.1 * down;
      } else if (s.action === 'jump') {
        const load = tri(p, 0.33);
        mantle.position.y -= 0.1 * load * (p < 0.33 ? 1 : 0);
        const ext = ease(Math.max(0, (p - 0.33) / 0.67));
        mantle.position.y += ext * 0.15;
        mantle.scale.y = 1 - 0.15 * load + 0.1 * ext;
        for (let i = 0; i < 8; i++) {
          setSeg(arms[i].segs[0], 0.3 * load - 0.4 * ext, 0, 0);
          setSeg(arms[i].segs[1], 0.5 * load - 0.6 * ext, 0, 0);
        }
      } else if (s.action === 'land') {
        const reach = ease(Math.min(p / 0.3, 1));
        const impact = tri(p, 0.55);
        mantle.scale.y = 1 - 0.25 * impact;
        mantle.position.y -= 0.14 * impact;
        for (let i = 0; i < 8; i++) {
          setSeg(arms[i].segs[0], -0.3 * reach + 0.5 * impact * (1 - reach * 0), 0, 0);
          setSeg(arms[i].segs[1], -0.2 * reach + 0.6 * impact, 0, 0);
        }
      } else if (s.action === 'signal') {
        const rise = tri(p, 0.6);
        mantle.position.y += 0.12 * rise;
        mantleCap.position.y += 0.1 * rise;
        for (let i = 0; i < 8; i++) {
          const a = arms[i];
          a.root.quaternion.copy(a.restQuat).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, 0.9 * rise));
          setSeg(a.segs[0], -0.3 * rise, 0, Math.sin(a.angle) * 0.3 * rise);
          setSeg(a.segs[1], -0.2 * rise, 0, 0);
        }
        beakLower.rotation.x = 0.35 * rise;
      } else if (s.action === 'sleep') {
        const d = ease(p);
        mantle.position.y -= 0.32 * d;
        mantle.rotation.x = 0.2 * d;
        head.rotation.x = 0.4 * d;
        head.position.y -= 0.12 * d;
        for (let i = 0; i < 8; i++) {
          setSeg(arms[i].segs[0], 0.6 * d, 0, 0);
          setSeg(arms[i].segs[1], 0.9 * d, 0, 0);
          setSeg(arms[i].segs[2], 0.7 * d, 0, 0);
          setSeg(arms[i].segs[3], 0.5 * d, 0, 0);
        }
      } else if (s.action === 'wake') {
        const d = 1 - ease(p);
        mantle.position.y -= 0.32 * d;
        mantle.rotation.x = 0.2 * d;
        head.rotation.x = 0.4 * d;
        head.position.y -= 0.12 * d;
        for (let i = 0; i < 8; i++) {
          setSeg(arms[i].segs[0], 0.6 * d, 0, 0);
          setSeg(arms[i].segs[1], 0.9 * d, 0, 0);
          setSeg(arms[i].segs[2], 0.7 * d, 0, 0);
          setSeg(arms[i].segs[3], 0.5 * d, 0, 0);
        }
      } else if (s.action === 'die') {
        const d = ease(p);
        mantle.rotation.z = 1.3 * d;
        mantle.rotation.x = 0.4 * d;
        mantle.position.y -= 0.4 * d;
        for (let i = 0; i < 8; i++) {
          setSeg(arms[i].segs[0], 0.8 * d * (0.5 + Math.random() * 0), 0, (i % 2 ? 1 : -1) * 0.3 * d);
          setSeg(arms[i].segs[1], 1.0 * d, 0, 0);
          setSeg(arms[i].segs[2], 0.6 * d, 0, 0);
        }
      } else if (s.action === 'evolve') {
        const brace = tri(p, 0.3);
        const open = ease(clamp01((p - 0.25) / 0.5)) * (1 - ease(clamp01((p - 0.75) / 0.25)));
        mantle.scale.y = 1 - 0.15 * brace + 0.05 * open;
        mantleCap.position.y += 0.12 * open;
        for (let i = 0; i < 8; i++) {
          const dir = arms[i].angle;
          sidePlates[i].position.x = Math.sin(dir) * (mantleR * 1.03 + open * 0.12);
          sidePlates[i].position.z = Math.cos(dir) * (mantleR * 1.03 + open * 0.12);
          const a = arms[i];
          a.root.quaternion.copy(a.restQuat).multiply(new THREE.Quaternion().setFromAxisAngle(AXIS_X, 0.4 * open - 0.3 * brace));
        }
      }
    } else {
      poseLocomotion();
      applyTurn();
      applyHurt();
      if (!grounded) applyAirborne();
    }
  };

  return root;
}