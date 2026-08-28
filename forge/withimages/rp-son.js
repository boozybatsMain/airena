```javascript
function build(THREE, TSL) {
  // ARMOURED OCTOPUS
  // ONE QUALITY: MASS AND POWER — a single heavy bulbous mantle overhead,
  // eight thick radial arms tapering to fine tips, everything thickened,
  // joints oversized, the whole animal a squat dense drum of hardware.
  //
  // BRIEF: the mantle is a stack of three dark turned drum segments,
  // clad in overlapping bone-white pressed shells that cover maybe two
  // thirds of it, leaving the dark machine core visible in the gaps and
  // at every seam. Big lensed eyes bulge from the front-lower mantle
  // under a single brow plate; a hinged beak sits at the crown center
  // between the arms; a siphon funnel trails from the mantle's rear.
  // Eight arms hang from a bearing hub below the mantle, each a chain of
  // four tapering segments with a tendon rod, a joint bearing ring, a
  // partial shell over the first two segments and two rows of rubber
  // suckers. Cable runs are split at every joint, landing in collar
  // clamps. What makes it read as expensive: the hub's gear-toothed
  // bearing collar and the way the shells lap forward over one another
  // like scale armour instead of sitting flush.

  const {
    vec3, vec4, float, sin, smoothstep, clamp, max, abs, mix,
    positionLocal, normalLocal
  } = TSL;

  const DOWN = new THREE.Vector3(0, -1, 0);

  function hexVec(hex) {
    const c = new THREE.Color(hex);
    return vec3(c.r, c.g, c.b);
  }

  function makeShellMaterial(ex, ey, ez) {
    const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.12, roughness: 0.6, side: THREE.DoubleSide });
    const p = positionLocal, n = normalLocal;
    const edge = max(max(abs(p.x).div(ex), abs(p.y).div(ey)), abs(p.z).div(ez));
    const edgeWear = smoothstep(0.5, 1.05, edge);
    const noiseVal = sin(p.x.mul(9.0).add(p.y.mul(6.3))).mul(0.5).add(0.5)
      .mul(sin(p.y.mul(13.0).sub(p.z.mul(5.2))).mul(0.5).add(0.5));
    const upFacing = smoothstep(-0.3, 0.3, n.y);
    const downMask = float(1.0).sub(upFacing);
    const grime = downMask.mul(noiseVal);
    const dust = smoothstep(0.2, 0.8, n.y).mul(0.12);
    const bone = hexVec('#D8D2C6');
    const boneWorn = hexVec('#B5AC9C');
    const rust = hexVec('#7a4326');
    let col = mix(bone, boneWorn, clamp(edgeWear.mul(0.8).add(grime.mul(0.6)), 0.0, 1.0));
    col = mix(col, rust, edgeWear.mul(noiseVal).mul(0.4));
    col = col.add(dust);
    mat.colorNode = vec4(col, 1.0);
    mat.roughnessNode = clamp(float(0.55).add(edgeWear.mul(0.2)).add(dust.mul(0.5)), 0.3, 0.95);
    return mat;
  }

  function makeMachineMaterial() {
    const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0.8, roughness: 0.55 });
    const p = positionLocal, n = normalLocal;
    const noiseVal = sin(p.x.mul(11.0).add(p.z.mul(7.0))).mul(0.5).add(0.5);
    const base = hexVec('#55524C');
    const light = hexVec('#6B665E');
    const dark = hexVec('#3E3A34');
    const upFacing = smoothstep(-0.2, 0.3, n.y);
    let col = mix(dark, base, upFacing);
    col = mix(col, light, noiseVal.mul(0.3));
    mat.colorNode = vec4(col, 1.0);
    mat.roughnessNode = clamp(float(0.5).add(noiseVal.mul(0.15)), 0.35, 0.85);
    return mat;
  }

  function makeRubberMaterial() { return new THREE.MeshStandardMaterial({ color: 0x1e1d1b, roughness: 0.9, metalness: 0.0 }); }
  function makeLensMaterial() { return new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 0.08, metalness: 0.15 }); }
  function makeAccentMaterial() { return new THREE.MeshStandardMaterial({ color: 0xC2521E, roughness: 0.5, metalness: 0.15 }); }
  function makeEmissiveMaterial() { return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x35d0d8, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.2 }); }

  function cylSeg(rTop, rBottom, length, rad) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, length, rad || 8, 1, false);
    g.translate(0, -length / 2, 0);
    return g;
  }

  function addBolts(parent, radius, y, count, mat, boltR, boltH) {
    boltR = boltR || 0.015; boltH = boltH || 0.02;
    for (let k = 0; k < count; k++) {
      const ang = (k / count) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(boltR, boltR, boltH, 6), mat);
      b.position.set(Math.sin(ang) * radius, y, Math.cos(ang) * radius);
      b.name = 'bolt';
      parent.add(b);
    }
  }

  // ---------------------------------------------------------------
  const root = new THREE.Group();
  root.name = 'octopus';

  const shellMatMantle = makeShellMaterial(0.42, 0.5, 0.42);
  const shellMatArm = makeShellMaterial(0.1, 0.35, 0.1);
  const machineMat = makeMachineMaterial();
  const rubberMat = makeRubberMaterial();
  const lensMat = makeLensMaterial();
  const accentMat = makeAccentMaterial();
  const emissiveMat = makeEmissiveMaterial();

  const FUNNEL_REST_X = -1.05;

  // ---- COLLAR HUB (the joint between mantle & arm crown) ----
  const collarHub = new THREE.Object3D();
  collarHub.name = 'collarHub';
  collarHub.position.set(0, 1.15, 0);
  root.add(collarHub);

  const hubDrum = new THREE.Mesh(cylSeg(0.32, 0.34, 0.18, 16), machineMat);
  hubDrum.name = 'collarDrum';
  collarHub.add(hubDrum);

  const hubBearing = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.025, 8, 20), machineMat);
  hubBearing.rotation.x = Math.PI / 2;
  hubBearing.position.y = -0.02;
  hubBearing.name = 'collarBearingRing';
  collarHub.add(hubBearing);

  addBolts(collarHub, 0.34, -0.16, 14, machineMat);

  // gear teeth around hub rim
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.02), machineMat);
    tooth.position.set(Math.sin(ang) * 0.35, -0.09, Math.cos(ang) * 0.35);
    tooth.rotation.y = ang;
    tooth.name = 'collarGearTooth';
    collarHub.add(tooth);
  }

  // ---- BEAK (mouth, at crown center) ----
  const beakUpper = new THREE.Object3D();
  beakUpper.name = 'beakUpper';
  beakUpper.position.set(0, -0.03, 0.30);
  collarHub.add(beakUpper);
  const beakUpperMesh = new THREE.Mesh(cylSeg(0.10, 0.02, 0.17, 6), machineMat);
  beakUpperMesh.rotation.x = -Math.PI / 2;
  beakUpperMesh.name = 'beakUpperCore';
  beakUpper.add(beakUpperMesh);

  const beakLower = new THREE.Object3D();
  beakLower.name = 'beakLower';
  beakLower.position.set(0, -0.07, 0.30);
  collarHub.add(beakLower);
  const beakLowerMesh = new THREE.Mesh(cylSeg(0.09, 0.018, 0.15, 6), machineMat);
  beakLowerMesh.rotation.x = -Math.PI / 2;
  beakLowerMesh.name = 'beakLowerCore';
  beakLower.add(beakLowerMesh);

  // ---- MANTLE ASSEMBLY (leading end) ----
  const mantle = new THREE.Object3D();
  mantle.name = 'mantle';
  mantle.position.set(0, 0, 0);
  collarHub.add(mantle);

  function latheSeg(pts) {
    return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 20);
  }

  const mantleLower = new THREE.Mesh(latheSeg([
    [0.24, 0.0], [0.30, 0.05], [0.35, 0.14], [0.37, 0.24], [0.37, 0.28]
  ]), machineMat);
  mantleLower.name = 'mantleLower';
  mantle.add(mantleLower);

  const mantleMid = new THREE.Mesh(latheSeg([
    [0.37, 0.28], [0.41, 0.38], [0.40, 0.48], [0.38, 0.55]
  ]), machineMat);
  mantleMid.name = 'mantleMid';
  mantle.add(mantleMid);

  const mantleUpper = new THREE.Mesh(latheSeg([
    [0.38, 0.55], [0.33, 0.65], [0.20, 0.78], [0.06, 0.87], [0.0, 0.90]
  ]), machineMat);
  mantleUpper.name = 'mantleUpper';
  mantle.add(mantleUpper);

  const jointRingLower = new THREE.Mesh(new THREE.TorusGeometry(0.375, 0.018, 6, 20), machineMat);
  jointRingLower.rotation.x = Math.PI / 2;
  jointRingLower.position.y = 0.28;
  jointRingLower.name = 'mantleJointRingLower';
  mantle.add(jointRingLower);

  const jointRingUpper = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.018, 6, 20), machineMat);
  jointRingUpper.rotation.x = Math.PI / 2;
  jointRingUpper.position.y = 0.55;
  jointRingUpper.name = 'mantleJointRingUpper';
  mantle.add(jointRingUpper);

  addBolts(mantle, 0.38, 0.02, 14, machineMat);

  // shell plates over the mantle, overlapping, leaving gaps
  const shellsList = [];
  function addShell(name, mesh, openDir) {
    mesh.name = name;
    mantle.add(mesh);
    mesh.userData.basePos = mesh.position.clone();
    mesh.userData.openDir = openDir.clone().normalize();
    shellsList.push(mesh);
  }

  const dorsal = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 20, 14, Math.PI * 0.55, Math.PI * 1.05, 0.15, Math.PI * 0.55),
    shellMatMantle
  );
  dorsal.position.set(0, 0.42, 0);
  addShell('mantleShellDorsal', dorsal, new THREE.Vector3(0, 1, -0.3));

  const flankL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.40, 0.42, 0.32, 20, 1, true, Math.PI * 0.75, Math.PI * 0.55),
    shellMatMantle
  );
  flankL.position.set(0, 0.40, 0);
  addShell('mantleShellFlankL', flankL, new THREE.Vector3(-1, 0.1, 0));

  const flankR = new THREE.Mesh(
    new THREE.CylinderGeometry(0.40, 0.42, 0.32, 20, 1, true, -Math.PI * 0.30, Math.PI * 0.55),
    shellMatMantle
  );
  flankR.position.set(0, 0.40, 0);
  addShell('mantleShellFlankR', flankR, new THREE.Vector3(1, 0.1, 0));

  const rear = new THREE.Mesh(
    new THREE.SphereGeometry(0.30, 16, 12, Math.PI * 0.7, Math.PI * 0.7, 0.3, Math.PI * 0.45),
    shellMatMantle
  );
  rear.position.set(0, 0.16, -0.26);
  addShell('mantleShellRear', rear, new THREE.Vector3(0, -0.3, -1));

  // small vent + marking greebles on dorsal
  const vent = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.03, 0.05), machineMat);
  vent.position.set(0.1, 0.7, 0.18);
  vent.name = 'mantleVent';
  mantle.add(vent);

  const markShape = new THREE.Shape();
  markShape.moveTo(-0.03, -0.025); markShape.lineTo(0.03, -0.025); markShape.lineTo(0, 0.03); markShape.lineTo(-0.03, -0.025);
  const markGeo = new THREE.ExtrudeGeometry(markShape, { depth: 0.005, bevelEnabled: false });
  const marking = new THREE.Mesh(markGeo, machineMat);
  marking.position.set(-0.12, 0.62, 0.30);
  marking.name = 'mantleMarking';
  mantle.add(marking);

  // status port (one of at most two emissive spots on the body)
  const statusPort = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), emissiveMat);
  statusPort.position.set(0.05, 0.55, -0.32);
  statusPort.name = 'statusPort';
  mantle.add(statusPort);

  // hazard accent stripe (rare, small, kept off the leading end proper)
  const hazard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.02), accentMat);
  hazard.position.set(0, 0.14, -0.34);
  hazard.name = 'mantleHazardStripe';
  mantle.add(hazard);

  // ---- BROW + EYES ----
  const browRidge = new THREE.Object3D();
  browRidge.name = 'browRidge';
  browRidge.position.set(0, 0.36, 0.30);
  mantle.add(browRidge);
  const browShape = new THREE.Shape();
  browShape.moveTo(-0.26, 0); browShape.lineTo(0.26, 0); browShape.lineTo(0.20, 0.09); browShape.quadraticCurveTo(0, 0.14, -0.20, 0.09); browShape.lineTo(-0.26, 0);
  const browGeo = new THREE.ExtrudeGeometry(browShape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
  browGeo.translate(0, 0, -0.03);
  const browMesh = new THREE.Mesh(browGeo, shellMatMantle);
  browMesh.name = 'browRidgePlate';
  browRidge.add(browMesh);

  function buildEye(name, side) {
    const housing = new THREE.Object3D();
    housing.name = name;
    housing.position.set(side * 0.20, 0.28, 0.30);
    mantle.add(housing);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 8, 16), machineMat);
    bezel.name = name + 'Bezel';
    housing.add(bezel);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 12), lensMat);
    lens.position.z = -0.015;
    lens.name = name + 'Lens';
    housing.add(lens);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      shellMatMantle
    );
    cap.rotation.x = Math.PI;
    cap.position.z = -0.03;
    cap.name = name + 'Cap';
    housing.add(cap);
    return housing;
  }
  const eyeHousingL = buildEye('eyeHousingL', -1);
  const eyeHousingR = buildEye('eyeHousingR', 1);

  // ---- FUNNEL / SIPHON ----
  const funnelSiphon = new THREE.Object3D();
  funnelSiphon.name = 'funnelSiphon';
  funnelSiphon.position.set(0, 0.10, -0.34);
  funnelSiphon.rotation.x = FUNNEL_REST_X;
  mantle.add(funnelSiphon);
  const funnelMesh = new THREE.Mesh(cylSeg(0.09, 0.05, 0.22, 8), machineMat);
  funnelMesh.name = 'funnelCore';
  funnelSiphon.add(funnelMesh);
  const funnelRim = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 6, 12), machineMat);
  funnelRim.position.y = -0.22;
  funnelRim.rotation.x = Math.PI / 2;
  funnelRim.name = 'funnelRim';
  funnelSiphon.add(funnelRim);

  // neck boot hiding the collarHub / mantle cable seam
  const neckBootF = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.03, 6, 14, Math.PI * 0.6), rubberMat);
  neckBootF.rotation.x = Math.PI / 2;
  neckBootF.position.set(0, 0.02, 0.10);
  neckBootF.name = 'mantleNeckBoot';
  collarHub.add(neckBootF);

  // hoses split at the collar/mantle joint
  function tubeBetween(p0, p1, p2, r) {
    const curve = new THREE.CatmullRomCurve3([p0, p1, p2]);
    return new THREE.TubeGeometry(curve, 8, r, 6, false);
  }
  const hoseLowerF = new THREE.Mesh(tubeBetween(
    new THREE.Vector3(0.08, -0.02, 0.20), new THREE.Vector3(0.10, 0.05, 0.15), new THREE.Vector3(0.10, 0.02, 0.05)
  ), rubberMat);
  hoseLowerF.name = 'neckHoseLower';
  collarHub.add(hoseLowerF);
  const hoseUpperF = new THREE.Mesh(tubeBetween(
    new THREE.Vector3(0.10, 0.0, 0.10), new THREE.Vector3(0.10, 0.12, 0.15), new THREE.Vector3(0.08, 0.30, 0.20)
  ), rubberMat);
  hoseUpperF.name = 'neckHoseUpper';
  mantle.add(hoseUpperF);

  const hoseLowerB = new THREE.Mesh(tubeBetween(
    new THREE.Vector3(-0.08, -0.02, -0.20), new THREE.Vector3(-0.10, 0.05, -0.15), new THREE.Vector3(-0.10, 0.02, -0.05)
  ), rubberMat);
  hoseLowerB.name = 'neckHoseLowerB';
  collarHub.add(hoseLowerB);
  const hoseUpperB = new THREE.Mesh(tubeBetween(
    new THREE.Vector3(-0.10, 0.0, -0.10), new THREE.Vector3(-0.10, 0.15, -0.15), new THREE.Vector3(-0.06, 0.38, -0.20)
  ), rubberMat);
  hoseUpperB.name = 'neckHoseUpperB';
  mantle.add(hoseUpperB);

  // ---- ARMS ----
  const ARM_COUNT = 8;
  const CROWN_R = 0.30;
  const ARM_LENS = [0.42, 0.36, 0.30, 0.24];
  const ARM_RTOP = [0.095, 0.075, 0.055, 0.032];
  const ARM_RBOT = [0.078, 0.058, 0.036, 0.014];
  const arms = [];

  for (let i = 0; i < ARM_COUNT; i++) {
    const az = i * Math.PI / 4;
    const armBase = new THREE.Object3D();
    armBase.name = `arm${i}_base`;
    armBase.position.set(Math.sin(az) * CROWN_R, -0.06, Math.cos(az) * CROWN_R);
    collarHub.add(armBase);

    const segs = [];
    let parent = armBase;
    for (let s = 0; s < 4; s++) {
      const segObj = new THREE.Object3D();
      segObj.name = `arm${i}_seg${s}`;
      if (s > 0) segObj.position.set(0, -ARM_LENS[s - 1], 0);
      parent.add(segObj);

      const core = new THREE.Mesh(cylSeg(ARM_RTOP[s], ARM_RBOT[s], ARM_LENS[s], 8), machineMat);
      core.name = `arm${i}_seg${s}_core`;
      segObj.add(core);

      if (s < 2) {
        const shellLen = ARM_LENS[s] * 0.85;
        const shellGeo = new THREE.CylinderGeometry(ARM_RTOP[s] + 0.016, ARM_RBOT[s] + 0.012, shellLen, 12, 1, true, Math.PI * 0.15, Math.PI * 0.95);
        const shellMesh = new THREE.Mesh(shellGeo, shellMatArm);
        shellMesh.position.set(0, -shellLen / 2 - ARM_LENS[s] * 0.04, 0);
        shellMesh.name = `arm${i}_seg${s}_shell`;
        segObj.add(shellMesh);
      }

      const rod = new THREE.Mesh(cylSeg(0.02, 0.015, ARM_LENS[s] * 0.85, 6), machineMat);
      rod.position.set(0, -ARM_LENS[s] * 0.06, ARM_RBOT[s] + 0.03);
      rod.name = `arm${i}_seg${s}_rod`;
      segObj.add(rod);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(ARM_RTOP[s] + 0.012, 0.015, 6, 12), machineMat);
      ring.rotation.x = Math.PI / 2;
      ring.name = `arm${i}_seg${s}_jointRing`;
      segObj.add(ring);

      // split cable run, local to this segment, landing in clamps at both ends
      const hoseCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, -0.02, -(ARM_RTOP[s] + 0.03)),
        new THREE.Vector3(0, -ARM_LENS[s] * 0.5, -(((ARM_RTOP[s] + ARM_RBOT[s]) / 2) + 0.038)),
        new THREE.Vector3(0, -ARM_LENS[s] + 0.02, -(ARM_RBOT[s] + 0.03))
      ]);
      const hose = new THREE.Mesh(new THREE.TubeGeometry(hoseCurve, 8, 0.012, 6, false), rubberMat);
      hose.name = `arm${i}_seg${s}_hose`;
      segObj.add(hose);
      const clampTop = new THREE.Mesh(new THREE.TorusGeometry(ARM_RTOP[s] + 0.035, 0.012, 6, 10), machineMat);
      clampTop.rotation.x = Math.PI / 2;
      clampTop.position.set(0, 0, -(ARM_RTOP[s] + 0.03));
      clampTop.name = `arm${i}_seg${s}_hoseClamp`;
      segObj.add(clampTop);

      if (s < 3) {
        for (let k = 0; k < 2; k++) {
          const tt = (k + 1) / 3;
          const suckerR = 0.03 * (1 - s * 0.14);
          const sucker = new THREE.Mesh(new THREE.CylinderGeometry(suckerR, suckerR * 0.8, 0.014, 10), rubberMat);
          sucker.rotation.x = Math.PI / 2;
          const rad = (ARM_RTOP[s] * (1 - tt) + ARM_RBOT[s] * tt) + 0.01;
          sucker.position.set(0, -ARM_LENS[s] * tt, rad);
          sucker.name = `arm${i}_seg${s}_sucker${k}`;
          segObj.add(sucker);
        }
      }

      segs.push(segObj);
      parent = segObj;
    }

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 8), machineMat);
    tip.position.set(0, -ARM_LENS[3] - 0.01, 0);
    tip.name = `arm${i}_tip`;
    parent.add(tip);

    if (i === 4) {
      const trim = new THREE.Mesh(new THREE.TorusGeometry(ARM_RTOP[1] + 0.02, 0.01, 6, 12), accentMat);
      trim.rotation.x = Math.PI / 2;
      trim.position.set(0, -0.05, 0);
      trim.name = 'arm4_accentTrim';
      segs[1].add(trim);
    }

    arms.push({ base: armBase, segs, az, i });
  }

  // ---------------------------------------------------------------
  const parts = {
    mantle, browRidge, beakUpper, beakLower, eyeHousingL, eyeHousingR,
    funnelSiphon, arms, shellsList
  };

  function poseArm(arm, sweep, lift, curlBase, opts) {
    opts = opts || {};
    const outFactor = opts.outFactor !== undefined ? opts.outFactor : 0.95;
    const downFactor = opts.downFactor !== undefined ? opts.downFactor : 1.0;
    const liftScale = opts.liftScale !== undefined ? opts.liftScale : 1.0;
    const liftClamped = THREE.MathUtils.clamp(lift, 0, 1.2);
    const effAz = arm.az + sweep;
    const dir = new THREE.Vector3(
      Math.sin(effAz) * outFactor * (1 + liftClamped * 0.3),
      -downFactor * (1 - liftClamped * 0.35),
      Math.cos(effAz) * outFactor * (1 + liftClamped * 0.3)
    ).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(DOWN, dir);
    arm.base.quaternion.copy(q);
    const lc = liftClamped * liftScale;
    const segs = arm.segs;
    segs[0].rotation.set(curlBase * 0.25 + lc * 0.25, 0, 0);
    segs[1].rotation.set(curlBase * 0.45 + lc * 0.5, 0, 0);
    segs[2].rotation.set(curlBase * 0.65 + lc * 0.55, 0, 0);
    segs[3].rotation.set(curlBase * 0.35 + lc * 0.3, 0, 0);
  }

  function setShellOpen(amount) {
    for (const sh of shellsList) {
      sh.position.copy(sh.userData.basePos).addScaledVector(sh.userData.openDir, amount);
    }
  }

  function doAction(s) {
    const ph = s.phase || 0;
    for (const arm of arms) poseArm(arm, 0, 0.1, 0.2);
    mantle.position.set(0, 0, 0);
    mantle.scale.set(1, 1, 1);
    mantle.rotation.set(-0.04, 0, 0);
    browRidge.rotation.set(0, 0, 0);
    beakLower.rotation.set(0.03, 0, 0);
    funnelSiphon.rotation.set(FUNNEL_REST_X, 0, 0);
    setShellOpen(0);

    switch (s.action) {
      case 'attack': {
        const arm = arms[0];
        let curl, sweep;
        if (ph < 0.35) { const u = ph / 0.35; curl = 0.6 * u; sweep = 0.3 * u; }
        else if (ph < 0.6) { const u = (ph - 0.35) / 0.25; curl = 0.6 - 0.9 * u; sweep = 0.3 - 0.9 * u; }
        else { const u = (ph - 0.6) / 0.4; curl = -0.3 + 0.3 * u; sweep = -0.6 + 0.6 * u; }
        poseArm(arm, sweep, 0, curl);
        mantle.rotation.x = -0.04 - 0.15 * Math.sin(ph * Math.PI);
        break;
      }
      case 'fire': {
        const aim = Math.min(1, ph / 0.4);
        funnelSiphon.rotation.x = FUNNEL_REST_X - 0.3 * aim;
        if (ph >= 0.4 && ph < 0.55) {
          mantle.scale.set(1.08, 0.92, 1.08);
        } else if (ph >= 0.55) {
          const u = (ph - 0.55) / 0.45;
          const k = 1 - u;
          mantle.scale.set(1 + 0.08 * k, 1 - 0.08 * k, 1 + 0.08 * k);
        }
        break;
      }
      case 'hit': {
        const k = Math.sin(ph * Math.PI);
        mantle.rotation.x -= 0.3 * k;
        mantle.position.y -= 0.05 * k;
        for (const arm of arms) poseArm(arm, -0.15 * k, 0.3 * k, 0.3 * k);
        break;
      }
      case 'block': {
        mantle.rotation.x -= 0.15;
        mantle.position.y -= 0.06;
        for (const arm of arms) {
          const lateral = Math.sin(arm.az);
          if (Math.cos(arm.az) > 0.3) poseArm(arm, -lateral * 0.3, 0.4, 0.75);
          else poseArm(arm, 0, 0.15, 0.3);
        }
        break;
      }
      case 'gather': {
        const u = ph < 0.5 ? ph / 0.5 : 1 - (ph - 0.5) / 0.5;
        mantle.position.y = -0.15 * u;
        mantle.rotation.x = -0.04 - 0.3 * u;
        poseArm(arms[0], 0, 0.2 * u, 0.5 * u + 0.3 * u);
        poseArm(arms[1], -0.2 * u, 0.2 * u, 0.5 * u + 0.3 * u);
        poseArm(arms[7], 0.2 * u, 0.2 * u, 0.5 * u + 0.3 * u);
        break;
      }
      case 'deposit': {
        const u = ph < 0.6 ? ph / 0.6 : 1 - (ph - 0.6) / 0.4;
        mantle.position.y = -0.12 * u;
        mantle.rotation.x = -0.04 - 0.25 * u;
        poseArm(arms[0], 0, 0.15 * u, 0.4 * u);
        poseArm(arms[1], -0.1 * u, 0.15 * u, 0.4 * u);
        poseArm(arms[7], 0.1 * u, 0.15 * u, 0.4 * u);
        break;
      }
      case 'eat': {
        const chew = Math.sin(ph * Math.PI * 3) * 0.5 + 0.5;
        mantle.rotation.x -= 0.2;
        beakLower.rotation.x = 0.03 + chew * 0.35;
        poseArm(arms[0], 0, 0.15, 0.5);
        poseArm(arms[7], 0, 0.15, 0.5);
        break;
      }
      case 'drink': {
        const hold = ph < 0.8 ? Math.min(1, ph / 0.3) : (1 - (ph - 0.8) / 0.2);
        mantle.rotation.x -= 0.3 * hold;
        mantle.position.y -= 0.08 * hold;
        break;
      }
      case 'jump': {
        if (ph < 0.33) {
          const u = ph / 0.33;
          mantle.position.y = -0.15 * u;
          mantle.rotation.x = -0.04 - 0.25 * u;
          for (const arm of arms) poseArm(arm, 0, 0.3 * u, 0.6 * u);
        } else {
          const u = (ph - 0.33) / 0.67;
          mantle.position.y = -0.15 * (1 - u) + 0.15 * u;
          mantle.rotation.x = -0.04 + 0.1 * u;
          for (const arm of arms) poseArm(arm, 0, 0.1 * (1 - u), 0.15 * (1 - u) - 0.3 * u);
        }
        break;
      }
      case 'land': {
        if (ph < 0.3) {
          const u = ph / 0.3;
          for (const arm of arms) poseArm(arm, 0, 0.2 * (1 - u), 0.1);
          mantle.position.y = 0.1 * (1 - u);
        } else if (ph < 0.6) {
          const u = (ph - 0.3) / 0.3;
          mantle.position.y = -0.18 * u;
          mantle.rotation.x = -0.04 - 0.3 * u;
          for (const arm of arms) poseArm(arm, 0, 0, 0.5 * u);
        } else {
          const u = (ph - 0.6) / 0.4;
          mantle.position.y = -0.18 * (1 - u);
          mantle.rotation.x = -0.04 - 0.3 * (1 - u);
          for (const arm of arms) poseArm(arm, 0, 0, 0.5 * (1 - u));
        }
        break;
      }
      case 'signal': {
        const u = ph < 0.3 ? ph / 0.3 : (ph < 0.7 ? 1 : 1 - (ph - 0.7) / 0.3);
        mantle.position.y = 0.12 * u;
        mantle.rotation.x = -0.04 - 0.1 * u;
        browRidge.rotation.x = -0.3 * u;
        for (const arm of arms) poseArm(arm, Math.sin(arm.az) * 0.25 * u, 0.35 * u, -0.2 * u);
        break;
      }
      case 'sleep': {
        const u = Math.min(1, ph / 0.8);
        mantle.position.y = -0.35 * u;
        mantle.rotation.x = -0.04 - 0.5 * u;
        for (const arm of arms) poseArm(arm, 0, 0.1, 0.9 * u);
        break;
      }
      case 'wake': {
        const u = ph;
        mantle.position.y = -0.35 * (1 - u);
        mantle.rotation.x = -0.04 - 0.5 * (1 - u);
        for (const arm of arms) poseArm(arm, 0, 0.1, 0.9 * (1 - u));
        break;
      }
      case 'die': {
        const u = ph;
        mantle.position.y = -0.4 * u;
        mantle.rotation.x = -0.04 + 0.9 * u;
        mantle.rotation.z = 0.4 * u;
        for (const arm of arms) poseArm(arm, Math.sin(arm.az) * 0.3 * u, 0.05, 0.15 + 0.6 * u);
        break;
      }
      case 'evolve': {
        let u;
        if (ph < 0.3) u = ph / 0.3;
        else if (ph < 0.7) u = 1;
        else u = 1 - (ph - 0.7) / 0.3;
        for (const arm of arms) poseArm(arm, 0, 0.15, 0.5 * u);
        const openAmt = Math.max(0, (u - 0.4)) * 0.25;
        setShellOpen(openAmt);
        browRidge.rotation.x = -0.2 * Math.max(0, (u - 0.4));
        break;
      }
      default: break;
    }
  }

  object_pose_setup: {}

  const object = root;
  object.userData.pose = (s) => {
    const speed = s.speed || 0;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = s.health === undefined ? 1 : s.health;
    const hurtAmt = THREE.MathUtils.clamp(1 - health, 0, 1);
    const stride = ((s.stride || 0) % 1 + 1) % 1;
    const t = s.t || 0;

    if (s.action) { doAction(s); return; }

    const moving = speed > 0.05;
    const speedNorm = Math.min(speed, 6) / 6;
    const amp = moving ? (0.22 + Math.min(speed, 6) * 0.11) : 0.05;
    const crouch = speed >= 1.8 ? Math.min(1, (speed - 1.8) / 2) : 0;

    let mantlePitch = -0.04 - speedNorm * 0.35 - crouch * 0.05;
    let mantleY = -crouch * 0.06 + (moving ? Math.sin(stride * Math.PI * 4) * 0.02 * (0.4 + speedNorm) : Math.sin(t * 0.8) * 0.015);
    let mantleBank = -turn * 0.22;

    if (!grounded) {
      mantlePitch += 0.18;
      mantleY += 0.05;
    }

    mantle.position.set(0, mantleY - hurtAmt * 0.05, 0);
    mantle.scale.set(1, 1, 1);
    mantle.rotation.set(mantlePitch + hurtAmt * 0.15, 0, mantleBank + hurtAmt * 0.1);

    browRidge.rotation.set(0, turn * 0.25, 0);
    beakLower.rotation.set(0.03, 0, 0);
    funnelSiphon.rotation.set(FUNNEL_REST_X + (moving ? 0 : Math.sin(t * 0.7) * 0.03), 0, 0);
    setShellOpen(0);

    for (const arm of arms) {
      const lateral = Math.sin(arm.az);
      const turnSweepBias = -turn * lateral * 0.35;
      const turnCurlBias = Math.max(0, turn * lateral) * 0.5;
      let sweep, lift, curl;

      if (!grounded) {
        sweep = -0.25 + turnSweepBias * 0.3;
        lift = 0.5;
        curl = 0.5;
      } else if (moving) {
        const phase = ((stride + arm.i / 8) % 1 + 1) % 1;
        if (phase < 0.5) {
          const u = phase / 0.5;
          sweep = amp * (1 - 2 * u);
          lift = 0;
          curl = 0.08;
        } else {
          const u = (phase - 0.5) / 0.5;
          sweep = -amp + 2 * amp * u;
          lift = Math.sin(u * Math.PI);
          curl = 0.1 + lift * 0.65;
        }
        sweep += turnSweepBias;
        curl += turnCurlBias;
      } else {
        sweep = Math.sin(t * 0.6 + arm.az * 1.3) * 0.06 + turnSweepBias * 0.5;
        lift = 0.12 + 0.05 * Math.sin(t * 0.4 + arm.az);
        curl = 0.22 + turnCurlBias * 0.5;
      }

      curl += hurtAmt * (arm.i === 2 ? 0.5 : 0.15);
      poseArm(arm, sweep, lift, curl, { liftScale: 0.9 + speedNorm * 0.6 });
    }
  };

  object.userData.update = (t, dt) => {};

  return object;
}
```