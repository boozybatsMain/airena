function build(THREE, TSL) {
  const { vec3, normalWorld, cameraPosition, positionWorld, normalize, pow, oneMinus, clamp, dot, mix, smoothstep, sub } = TSL;

  function clampNum(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sstep(e0, e1, x) { const t = clampNum((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

  function segForward(jointRadius, tipRadius, length, radial) {
    const g = new THREE.CylinderGeometry(tipRadius, jointRadius, length, radial || 14, 1, false);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, length / 2);
    return g;
  }
  function segBackward(jointRadius, tipRadius, length, radial) {
    const g = new THREE.CylinderGeometry(jointRadius, tipRadius, length, radial || 14, 1, false);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, -length / 2);
    return g;
  }
  function finVertical(spanSign, span, rootChord, tipChord, sweep, thickness) {
    const shape = new THREE.Shape();
    shape.moveTo(-rootChord / 2, 0);
    shape.lineTo(rootChord / 2, 0);
    shape.lineTo(tipChord / 2 - sweep, spanSign * span);
    shape.lineTo(-tipChord / 2 - sweep, spanSign * span);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -thickness / 2);
    g.rotateY(Math.PI / 2);
    return g;
  }
  function finHorizontal(spanSign, span, rootChord, tipChord, sweep, thickness) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -rootChord / 2);
    shape.lineTo(0, rootChord / 2);
    shape.lineTo(spanSign * span, tipChord / 2 - sweep);
    shape.lineTo(spanSign * span, -tipChord / 2 - sweep);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -thickness / 2);
    g.rotateX(Math.PI / 2);
    return g;
  }

  // ---------- materials ----------
  const skinMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.04 });
  const topColor = vec3(0.13, 0.18, 0.22);
  const bellyColor = vec3(0.80, 0.82, 0.78);
  const grad = smoothstep(-0.15, 0.35, normalWorld.y);
  skinMat.colorNode = mix(bellyColor, topColor, grad);
  const viewDir = normalize(sub(cameraPosition, positionWorld));
  const fres = pow(oneMinus(clamp(dot(normalWorld, viewDir), 0.0, 1.0)), 3.0);
  skinMat.emissiveNode = vec3(0.03, 0.06, 0.08).mul(fres);

  const teethMat = new THREE.MeshStandardMaterial({ color: 0xf3efe2, roughness: 0.25, metalness: 0.02 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.2, metalness: 0.3 });
  const gillMat = new THREE.MeshStandardMaterial({ color: 0x3a1f1c, roughness: 0.7, metalness: 0.0 });

  // ---------- root ----------
  const root = new THREE.Group();
  root.name = 'shark';

  // ---------- torso ----------
  const torso = new THREE.Group();
  torso.name = 'torso';
  root.add(torso);
  const torsoMesh = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 16), skinMat);
  torsoMesh.name = 'torsoMesh';
  torsoMesh.scale.set(1.0, 0.80, 1.65);
  torso.add(torsoMesh);

  // ---------- head ----------
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.03, 0.50);
  torso.add(head);
  const headMesh = new THREE.Mesh(segForward(0.24, 0.02, 0.58, 18), skinMat);
  headMesh.name = 'headMesh';
  headMesh.scale.set(1.22, 0.70, 1.0);
  head.add(headMesh);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeMat);
  eyeL.name = 'eyeL';
  eyeL.position.set(0.20, 0.05, 0.17);
  head.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeMat);
  eyeR.name = 'eyeR';
  eyeR.position.set(-0.20, 0.05, 0.17);
  head.add(eyeR);

  const jawHinge = { x: 0, y: -0.12, z: 0.20 };
  const upperJaw = new THREE.Group();
  upperJaw.name = 'upperJaw';
  upperJaw.position.set(jawHinge.x, jawHinge.y, jawHinge.z);
  head.add(upperJaw);
  const upperJawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.045, 0.30), skinMat);
  upperJawMesh.name = 'upperJawMesh';
  upperJawMesh.position.set(0, 0.015, 0.14);
  upperJaw.add(upperJawMesh);

  const lowerJaw = new THREE.Group();
  lowerJaw.name = 'lowerJaw';
  lowerJaw.position.set(jawHinge.x, jawHinge.y, jawHinge.z);
  head.add(lowerJaw);
  const lowerJawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.045, 0.28), skinMat);
  lowerJawMesh.name = 'lowerJawMesh';
  lowerJawMesh.position.set(0, -0.02, 0.13);
  lowerJaw.add(lowerJawMesh);

  function addTeeth(parent, count, z, y, xSpread, pointDown) {
    for (let i = 0; i < count; i++) {
      const tNorm = count === 1 ? 0.5 : i / (count - 1);
      const x = (tNorm - 0.5) * 2 * xSpread;
      const centerness = 1 - Math.abs(tNorm - 0.5) * 2;
      const size = 0.028 + centerness * 0.032;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(size * 0.42, size, 6), teethMat);
      tooth.position.set(x, y, z - Math.abs(tNorm - 0.5) * 0.02);
      if (pointDown) tooth.rotation.x = Math.PI;
      parent.add(tooth);
    }
  }
  const upperTeeth = new THREE.Group();
  upperTeeth.name = 'upperTeeth';
  upperJaw.add(upperTeeth);
  addTeeth(upperTeeth, 9, 0.27, -0.015, 0.11, true);
  const lowerTeeth = new THREE.Group();
  lowerTeeth.name = 'lowerTeeth';
  lowerJaw.add(lowerTeeth);
  addTeeth(lowerTeeth, 9, 0.24, 0.012, 0.10, false);

  // ---------- pectoral fins ----------
  const pectoralFinR = new THREE.Group();
  pectoralFinR.name = 'pectoralFinR';
  pectoralFinR.position.set(0.34, -0.09, 0.14);
  torso.add(pectoralFinR);
  pectoralFinR.add(new THREE.Mesh(finHorizontal(1, 0.55, 0.30, 0.12, 0.12, 0.02), skinMat));

  const pectoralFinL = new THREE.Group();
  pectoralFinL.name = 'pectoralFinL';
  pectoralFinL.position.set(-0.34, -0.09, 0.14);
  torso.add(pectoralFinL);
  pectoralFinL.add(new THREE.Mesh(finHorizontal(-1, 0.55, 0.30, 0.12, 0.12, 0.02), skinMat));

  // ---------- dorsal fin ----------
  const dorsalFin = new THREE.Group();
  dorsalFin.name = 'dorsalFin';
  dorsalFin.position.set(0, 0.29, -0.05);
  torso.add(dorsalFin);
  dorsalFin.add(new THREE.Mesh(finVertical(1, 0.42, 0.34, 0.08, 0.14, 0.02), skinMat));

  // ---------- gills ----------
  function makeGills(sign) {
    const g = new THREE.Group();
    g.name = sign > 0 ? 'gillSlitsR' : 'gillSlitsL';
    g.position.set(sign * 0.33, 0.05, 0.32);
    for (let i = 0; i < 5; i++) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.02), gillMat);
      slit.position.set(0, 0, -i * 0.05);
      g.add(slit);
    }
    return g;
  }
  const gillSlitsR = makeGills(1);
  const gillSlitsL = makeGills(-1);
  torso.add(gillSlitsR, gillSlitsL);

  // ---------- tail chain ----------
  const tailSegment1 = new THREE.Group();
  tailSegment1.name = 'tailSegment1';
  tailSegment1.position.set(0, 0, -0.53);
  torso.add(tailSegment1);
  tailSegment1.add(new THREE.Mesh(segBackward(0.30, 0.24, 0.55, 14), skinMat));

  const pelvicFinR = new THREE.Group();
  pelvicFinR.name = 'pelvicFinR';
  pelvicFinR.position.set(0.22, -0.15, -0.20);
  tailSegment1.add(pelvicFinR);
  pelvicFinR.add(new THREE.Mesh(finHorizontal(1, 0.30, 0.18, 0.07, 0.08, 0.015), skinMat));
  const pelvicFinL = new THREE.Group();
  pelvicFinL.name = 'pelvicFinL';
  pelvicFinL.position.set(-0.22, -0.15, -0.20);
  tailSegment1.add(pelvicFinL);
  pelvicFinL.add(new THREE.Mesh(finHorizontal(-1, 0.30, 0.18, 0.07, 0.08, 0.015), skinMat));

  const tailSegment2 = new THREE.Group();
  tailSegment2.name = 'tailSegment2';
  tailSegment2.position.set(0, 0, -0.52);
  tailSegment1.add(tailSegment2);
  tailSegment2.add(new THREE.Mesh(segBackward(0.24, 0.15, 0.48, 12), skinMat));

  const analFin = new THREE.Group();
  analFin.name = 'analFin';
  analFin.position.set(0, -0.16, -0.18);
  tailSegment2.add(analFin);
  analFin.add(new THREE.Mesh(finVertical(-1, 0.20, 0.16, 0.05, 0.06, 0.015), skinMat));

  const tailSegment3 = new THREE.Group();
  tailSegment3.name = 'tailSegment3';
  tailSegment3.position.set(0, 0, -0.45);
  tailSegment2.add(tailSegment3);
  tailSegment3.add(new THREE.Mesh(segBackward(0.15, 0.09, 0.34, 10), skinMat));

  const caudalFin = new THREE.Group();
  caudalFin.name = 'caudalFin';
  caudalFin.position.set(0, 0, -0.32);
  tailSegment3.add(caudalFin);
  const caudalUpperLobe = new THREE.Mesh(finVertical(1, 0.55, 0.20, 0.06, 0.28, 0.02), skinMat);
  caudalUpperLobe.name = 'caudalUpperLobe';
  caudalFin.add(caudalUpperLobe);
  const caudalLowerLobe = new THREE.Mesh(finVertical(-1, 0.30, 0.18, 0.06, 0.18, 0.02), skinMat);
  caudalLowerLobe.name = 'caudalLowerLobe';
  caudalFin.add(caudalLowerLobe);

  // ================= POSE =================
  const REST_PEC = 0.42;
  const REST_PELVIC = 0.28;

  object_pose:
  root.userData.pose = (s) => {
    let torsoRotX = 0, torsoRotY = 0, torsoRotZ = 0;
    let torsoScaleX = 1, torsoScaleY = 1, torsoScaleZ = 1;
    let headRotX = 0, headRotY = 0, headRotZ = 0;
    let upperJawX = 0, lowerJawX = 0;
    let pecLdroop = REST_PEC, pecRdroopMag = REST_PEC, pecLsweep = 0, pecRsweep = 0;
    let pelvicLdroop = REST_PELVIC, pelvicRdroopMag = REST_PELVIC;
    let analSway = 0;
    let dorsalSway = 0, dorsalScaleY = 1;
    let seg1Yaw = 0, seg2Yaw = 0, seg3Yaw = 0, caudalYaw = 0;
    let seg1PitchX = 0, seg2PitchX = 0, seg3PitchX = 0, caudalPitchX = 0;

    const t = s.t || 0;
    const p = clampNum(s.phase || 0, 0, 1);

    if (s.action) {
      if (s.action === 'attack') {
        if (p < 0.35) { const e = sstep(0, 0.35, p); headRotX = lerp(0, -0.30, e); lowerJawX = lerp(0, 0.60, e); upperJawX = lerp(0, -0.18, e); torsoRotX = lerp(0, -0.05, e); }
        else if (p < 0.6) { const e = sstep(0.35, 0.6, p); headRotX = lerp(-0.30, 0.30, e); lowerJawX = lerp(0.60, -0.05, e); upperJawX = lerp(-0.18, 0.05, e); torsoRotX = lerp(-0.05, 0.08, e); }
        else { const e = sstep(0.6, 1.0, p); headRotX = lerp(0.30, 0, e); lowerJawX = lerp(-0.05, 0, e); upperJawX = lerp(0.05, 0, e); torsoRotX = lerp(0.08, 0, e); }
      } else if (s.action === 'fire') {
        if (p < 0.5) { const e = sstep(0, 0.5, p); headRotX = lerp(0, -0.08, e); lowerJawX = lerp(0, 0.35, e); upperJawX = lerp(0, -0.08, e); }
        else if (p < 0.7) { const e = sstep(0.5, 0.7, p); headRotX = lerp(-0.08, 0.22, e); lowerJawX = lerp(0.35, 0.05, e); upperJawX = lerp(-0.08, 0.03, e); torsoRotX = lerp(0, -0.06, e); }
        else { const e = sstep(0.7, 1.0, p); headRotX = lerp(0.22, 0, e); lowerJawX = lerp(0.05, 0, e); upperJawX = lerp(0.03, 0, e); torsoRotX = lerp(-0.06, 0, e); }
      } else if (s.action === 'hit') {
        if (p < 0.2) { const e = sstep(0, 0.2, p); headRotY = lerp(0, 0.35, e); torsoRotZ = lerp(0, 0.18, e); headRotX = lerp(0, -0.1, e); }
        else { const e = sstep(0.2, 1.0, p); headRotY = lerp(0.35, 0, e); torsoRotZ = lerp(0.18, 0, e); headRotX = lerp(-0.1, 0, e); }
      } else if (s.action === 'block') {
        const brace = p < 0.75 ? sstep(0, 0.25, p) : (1 - sstep(0.75, 1, p));
        torsoRotX = -0.18 * brace; headRotX = 0.12 * brace;
        pecLsweep = 0.4 * brace; pecRsweep = -0.4 * brace;
        pecLdroop = lerp(REST_PEC, 0.15, brace); pecRdroopMag = lerp(REST_PEC, 0.15, brace);
      } else if (s.action === 'gather') {
        if (p < 0.4) { const e = sstep(0, 0.4, p); torsoRotX = lerp(0, 0.32, e); headRotX = lerp(0, 0.20, e); lowerJawX = lerp(0, 0.35, e); upperJawX = lerp(0, -0.05, e); }
        else if (p < 0.6) { const e = sstep(0.4, 0.6, p); torsoRotX = 0.32; headRotX = 0.20; lowerJawX = lerp(0.35, 0.05, e); upperJawX = lerp(-0.05, 0.02, e); }
        else { const e = sstep(0.6, 1.0, p); torsoRotX = lerp(0.32, 0, e); headRotX = lerp(0.20, 0, e); lowerJawX = lerp(0.05, 0, e); upperJawX = lerp(0.02, 0, e); }
      } else if (s.action === 'deposit') {
        if (p < 0.5) { const e = sstep(0, 0.5, p); torsoRotX = lerp(0, 0.30, e); headRotX = lerp(0, 0.18, e); lowerJawX = 0.15; }
        else if (p < 0.65) { const e = sstep(0.5, 0.65, p); torsoRotX = 0.30; headRotX = 0.18; lowerJawX = lerp(0.15, 0.5, e); upperJawX = lerp(0, -0.1, e); }
        else { const e = sstep(0.65, 1.0, p); torsoRotX = lerp(0.30, 0, e); headRotX = lerp(0.18, 0, e); lowerJawX = lerp(0.5, 0, e); upperJawX = lerp(-0.1, 0, e); }
      } else if (s.action === 'eat') {
        const env = Math.sin(Math.PI * p);
        headRotX = 0.22 * env; torsoRotX = 0.10 * env;
        const chew = Math.sin(p * 3 * Math.PI * 2);
        lowerJawX = Math.max(0, chew) * 0.4 * env + 0.05 * env;
        upperJawX = -Math.max(0, -chew) * 0.15 * env;
      } else if (s.action === 'drink') {
        if (p < 0.3) { const e = sstep(0, 0.3, p); headRotX = lerp(0, 0.20, e); torsoRotX = lerp(0, 0.08, e); lowerJawX = lerp(0, 0.12, e); }
        else if (p < 0.7) { headRotX = 0.20; torsoRotX = 0.08; lowerJawX = 0.12 + Math.sin(t * 3) * 0.01; }
        else { const e = sstep(0.7, 1.0, p); headRotX = lerp(0.20, 0, e); torsoRotX = lerp(0.08, 0, e); lowerJawX = lerp(0.12, 0, e); }
      } else if (s.action === 'jump') {
        if (p < 0.33) { const e = sstep(0, 0.33, p); torsoScaleY = lerp(1, 0.85, e); torsoScaleZ = lerp(1, 0.92, e); seg1PitchX = lerp(0, 0.15, e); seg2PitchX = lerp(0, 0.22, e); seg3PitchX = lerp(0, 0.28, e); caudalPitchX = lerp(0, 0.35, e); headRotX = lerp(0, -0.1, e); pecLdroop = lerp(REST_PEC, 0.15, e); pecRdroopMag = lerp(REST_PEC, 0.15, e); }
        else { const e = sstep(0.33, 1.0, p); torsoScaleY = lerp(0.85, 1.05, e); torsoScaleZ = lerp(0.92, 1.08, e); seg1PitchX = lerp(0.15, -0.05, e); seg2PitchX = lerp(0.22, -0.08, e); seg3PitchX = lerp(0.28, -0.10, e); caudalPitchX = lerp(0.35, -0.15, e); headRotX = lerp(-0.1, 0.12, e); pecLdroop = lerp(0.15, 0.10, e); pecRdroopMag = lerp(0.15, 0.10, e); }
      } else if (s.action === 'land') {
        if (p < 0.4) { const e = sstep(0, 0.4, p); headRotX = lerp(0, 0.18, e); pecLdroop = lerp(REST_PEC, 0.12, e); pecRdroopMag = lerp(REST_PEC, 0.12, e); seg1PitchX = lerp(0, -0.08, e); seg2PitchX = lerp(0, -0.10, e); seg3PitchX = lerp(0, -0.12, e); }
        else if (p < 0.6) { const e = sstep(0.4, 0.6, p); torsoScaleY = lerp(1, 0.82, e); torsoScaleZ = lerp(1, 1.06, e); headRotX = lerp(0.18, 0.22, e); }
        else { const e = sstep(0.6, 1.0, p); torsoScaleY = lerp(0.82, 1, e); torsoScaleZ = lerp(1.06, 1, e); headRotX = lerp(0.22, 0, e); pecLdroop = lerp(0.12, REST_PEC, e); pecRdroopMag = lerp(0.12, REST_PEC, e); seg1PitchX = lerp(-0.08, 0, e); seg2PitchX = lerp(-0.10, 0, e); seg3PitchX = lerp(-0.12, 0, e); }
      } else if (s.action === 'signal') {
        if (p < 0.3) { const e = sstep(0, 0.3, p); torsoRotX = lerp(0, -0.12, e); headRotX = lerp(0, -0.15, e); lowerJawX = lerp(0, 0.65, e); upperJawX = lerp(0, -0.20, e); pecLdroop = lerp(REST_PEC, 0.05, e); pecRdroopMag = lerp(REST_PEC, 0.05, e); dorsalScaleY = lerp(1, 1.35, e); }
        else if (p < 0.7) { torsoRotX = -0.12; headRotX = -0.15; lowerJawX = 0.65 + Math.sin(t * 10) * 0.01; upperJawX = -0.20; pecLdroop = 0.05; pecRdroopMag = 0.05; dorsalScaleY = 1.35; }
        else { const e = sstep(0.7, 1.0, p); torsoRotX = lerp(-0.12, 0, e); headRotX = lerp(-0.15, 0, e); lowerJawX = lerp(0.65, 0, e); upperJawX = lerp(-0.20, 0, e); pecLdroop = lerp(0.05, REST_PEC, e); pecRdroopMag = lerp(0.05, REST_PEC, e); dorsalScaleY = lerp(1.35, 1, e); }
      } else if (s.action === 'sleep') {
        const e = sstep(0, 0.7, p);
        torsoRotX = lerp(0, 0.22, e); headRotX = lerp(0, 0.15, e);
        pecLdroop = lerp(REST_PEC, 0.85, e); pecRdroopMag = lerp(REST_PEC, 0.85, e);
        pelvicLdroop = lerp(REST_PELVIC, 0.7, e); pelvicRdroopMag = lerp(REST_PELVIC, 0.7, e);
        lowerJawX = 0.03 * e;
      } else if (s.action === 'wake') {
        const e = 1 - sstep(0, 0.8, p);
        torsoRotX = 0.22 * e; headRotX = 0.15 * e;
        pecLdroop = lerp(REST_PEC, 0.85, e); pecRdroopMag = lerp(REST_PEC, 0.85, e);
        pelvicLdroop = lerp(REST_PELVIC, 0.7, e); pelvicRdroopMag = lerp(REST_PELVIC, 0.7, e);
        lowerJawX = 0.03 * e;
      } else if (s.action === 'die') {
        const e = sstep(0, 1, p);
        torsoRotZ = 1.1 * e; torsoRotX = 0.25 * e;
        headRotX = 0.3 * sstep(0.1, 0.9, p); headRotY = -0.5 * sstep(0.1, 0.9, p);
        lowerJawX = 0.6 * sstep(0.2, 1, p); upperJawX = -0.1 * sstep(0.2, 1, p);
        pecLdroop = lerp(REST_PEC, 1.0, e); pecRdroopMag = lerp(REST_PEC, 0.1, e);
        seg1Yaw = 0.3 * e; seg2Yaw = 0.45 * e; seg3Yaw = 0.6 * e; caudalYaw = 0.8 * e;
      } else if (s.action === 'evolve') {
        if (p < 0.35) { const e = sstep(0, 0.35, p); torsoScaleX = lerp(1, 0.92, e); torsoScaleY = lerp(1, 0.90, e); torsoScaleZ = lerp(1, 0.95, e); headRotX = lerp(0, 0.1, e); }
        else if (p < 0.65) { const e = sstep(0.35, 0.65, p); torsoScaleX = lerp(0.92, 1.12, e); torsoScaleY = lerp(0.90, 1.15, e); torsoScaleZ = lerp(0.95, 1.05, e); lowerJawX = lerp(0, 0.6, e); upperJawX = lerp(0, -0.18, e); pecLdroop = lerp(REST_PEC, 0.05, e); pecRdroopMag = lerp(REST_PEC, 0.05, e); dorsalScaleY = lerp(1, 1.4, e); headRotX = lerp(0.1, -0.05, e); }
        else { const e = sstep(0.65, 1.0, p); torsoScaleX = lerp(1.12, 1, e); torsoScaleY = lerp(1.15, 1, e); torsoScaleZ = lerp(1.05, 1, e); lowerJawX = lerp(0.6, 0, e); upperJawX = lerp(-0.18, 0, e); pecLdroop = lerp(0.05, REST_PEC, e); pecRdroopMag = lerp(0.05, REST_PEC, e); dorsalScaleY = lerp(1.4, 1, e); headRotX = lerp(-0.05, 0, e); }
      }
    } else {
      const spd = clampNum(s.speed || 0, 0, 6);
      const turn = clampNum(s.turn || 0, -1, 1);
      const slow = 1 - sstep(1.4, 2.2, spd);
      const ampBase = 0.06 + spd * 0.05;
      const mult1 = lerp(0.5, 0.22, 1 - slow);
      const mult2 = lerp(0.78, 0.5, 1 - slow);
      const mult3 = lerp(1.0, 0.85, 1 - slow);
      const multC = lerp(1.15, 1.65, 1 - slow);
      const cyc = (s.stride || 0) * Math.PI * 2;

      seg1Yaw = Math.sin(cyc) * ampBase * mult1;
      seg2Yaw = Math.sin(cyc - 0.9) * ampBase * mult2;
      seg3Yaw = Math.sin(cyc - 1.8) * ampBase * mult3;
      caudalYaw = Math.sin(cyc - 2.6) * ampBase * multC;
      headRotY = -Math.sin(cyc) * ampBase * 0.12;
      dorsalSway = Math.sin(cyc - 1.2) * ampBase * 0.30;
      analSway = Math.sin(cyc - 1.6) * ampBase * 0.22;

      pecLdroop = lerp(0.55, 0.18, 1 - slow);
      pecRdroopMag = pecLdroop;
      pelvicLdroop = pecLdroop * 0.65;
      pelvicRdroopMag = pelvicLdroop;

      torsoScaleZ = 1 + spd * 0.012;
      headRotX = spd * 0.02;

      const idleAmt = 1 - sstep(0, 0.4, spd);
      torsoScaleY = 1 + Math.sin(t * 1.3) * 0.02 * idleAmt;
      headRotY += Math.sin(t * 0.4) * 0.12 * idleAmt;
      torsoRotZ += Math.sin(t * 0.35) * 0.02 * idleAmt;
      const flutter = Math.sin(t * 0.8) * 0.05 * idleAmt;
      pecLdroop += flutter; pecRdroopMag += flutter;

      headRotY += turn * 0.32;
      torsoRotZ += turn * 0.22;
      seg1Yaw += turn * 0.12; seg2Yaw += turn * 0.20; seg3Yaw += turn * 0.28; caudalYaw += turn * 0.38;
      pecLdroop += turn * 0.15;
      pecRdroopMag -= turn * 0.15;

      if (!s.grounded) {
        seg1Yaw *= 0.4; seg2Yaw *= 0.4; seg3Yaw *= 0.4; caudalYaw *= 0.4;
        torsoRotX += -0.06;
        headRotY *= 0.3;
        pecLdroop *= 0.5; pecRdroopMag *= 0.5;
        seg1PitchX = -0.05; seg2PitchX = -0.08; seg3PitchX = -0.10; caudalPitchX = -0.12;
      }
    }

    const sev = clampNum(1 - (s.health === undefined ? 1 : s.health), 0, 1);
    if (sev > 0) {
      torsoRotZ += sev * 0.28;
      headRotX += sev * 0.18;
      headRotY += sev * 0.10;
      pecRdroopMag += sev * 0.35;
      pecLdroop -= sev * 0.10;
      seg1Yaw += sev * 0.06; seg2Yaw += sev * 0.09; seg3Yaw += sev * 0.12; caudalYaw += sev * 0.15;
    }

    torso.rotation.set(torsoRotX, torsoRotY, torsoRotZ);
    torso.scale.set(torsoScaleX, torsoScaleY, torsoScaleZ);
    head.rotation.set(headRotX, headRotY, headRotZ);
    upperJaw.rotation.set(upperJawX, 0, 0);
    lowerJaw.rotation.set(lowerJawX, 0, 0);
    pectoralFinL.rotation.set(0, pecLsweep, pecLdroop);
    pectoralFinR.rotation.set(0, pecRsweep, -pecRdroopMag);
    pelvicFinL.rotation.set(0, 0, pelvicLdroop);
    pelvicFinR.rotation.set(0, 0, -pelvicRdroopMag);
    analFin.rotation.set(0, analSway, 0);
    dorsalFin.rotation.set(0, dorsalSway, 0);
    dorsalFin.scale.set(1, dorsalScaleY, 1);
    tailSegment1.rotation.set(seg1PitchX, seg1Yaw, 0);
    tailSegment2.rotation.set(seg2PitchX, seg2Yaw, 0);
    tailSegment3.rotation.set(seg3PitchX, seg3Yaw, 0);
    caudalFin.rotation.set(caudalPitchX, caudalYaw, 0);
  };

  return root;
}