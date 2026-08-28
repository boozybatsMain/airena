```javascript
function build(THREE, TSL) {
  // ARMOURED OCTOPUS — quality: MASS AND POWER.
  // A squat, heavily plated cephalopod. The mantle (torso) is the single
  // biggest, thickest mass on the body - a stacked armoured bulb riding
  // above the arm-crown. The beak/eye cluster at the crown is the leading
  // end: short, dense, more parts than any one arm. Eight arms radiate
  // from the crown, heavy armoured shoulders tapering to bare hydraulic
  // tentacle at the tips, each ending in a row of turned sucker-pods.
  // A siphon nozzle on the mantle flank doubles as the ranged weapon.
  // Cable trunks run mantle->crown and are split at every arm joint so
  // nothing spans a moving joint. Bone-white pressed plate over dark
  // gunmetal machine, near-black hose, rare rust-orange accent.

  const { positionLocal: P, normalLocal: N, sin, cos, abs, pow, mix, clamp,
          oneMinus, vec3, float } = TSL;

  // ---------- materials ----------
  function col(hex) { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); }

  function armorColorNode() {
    const c1 = col(0xD8D2C6), c2 = col(0xB5AC9C), c3 = col(0x7a2f14);
    const noise = sin(P.x.mul(3.4).add(P.z.mul(2.1)).add(P.y.mul(1.3)))
      .mul(sin(P.y.mul(4.1).sub(P.z.mul(1.7)))).mul(0.5).add(0.5);
    const down = clamp(N.y.mul(-1).add(0.4), 0.0, 1.0);
    const grime = clamp(noise.mul(down), 0.0, 1.0);
    const edge = pow(clamp(oneMinus(abs(N.y)), 0.0, 1.0), 3.0);
    let c = mix(c1, c2, clamp(grime.mul(0.6), 0, 1));
    c = mix(c, c3, clamp(grime.mul(edge).mul(1.6), 0, 1));
    return c;
  }
  function machineColorNode() {
    const c1 = col(0x55524C), c2 = col(0x3E3A34), c3 = col(0x241a10);
    const noise = sin(P.x.mul(5.1).sub(P.y.mul(2.3)).add(P.z.mul(1.9)))
      .mul(sin(P.y.mul(3.3).add(P.z.mul(2.7)))).mul(0.5).add(0.5);
    const down = clamp(N.y.mul(-1).add(0.35), 0.0, 1.0);
    const grime = clamp(noise.mul(down), 0.0, 1.0);
    const edge = pow(clamp(oneMinus(abs(N.y)), 0.0, 1.0), 2.5);
    let c = mix(c1, c2, clamp(grime.mul(0.55), 0, 1));
    c = mix(c, c3, clamp(grime.mul(edge).mul(1.3), 0, 1));
    return c;
  }
  function dustyRough(base) {
    return clamp(float(base).add(clamp(N.y, 0, 1).mul(0.2)), 0.3, 0.95);
  }

  const shellMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.12, roughness: 0.55, side: THREE.DoubleSide });
  shellMat.colorNode = armorColorNode();
  shellMat.roughnessNode = dustyRough(0.55);

  const machineMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.8, roughness: 0.55 });
  machineMat.colorNode = machineColorNode();
  machineMat.roughnessNode = dustyRough(0.5);

  const machineLightMat = new THREE.MeshStandardMaterial({ color: 0x6B665E, metalness: 0.75, roughness: 0.5 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x1E1D1B, metalness: 0.0, roughness: 0.92 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x05070a, metalness: 0.1, roughness: 0.08 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xC2521E, metalness: 0.15, roughness: 0.55 });
  const statusCyan = new THREE.MeshStandardMaterial({ color: 0x113333, emissive: 0x22ffee, emissiveIntensity: 1.2, metalness: 0.3, roughness: 0.4 });
  const statusAmber = new THREE.MeshStandardMaterial({ color: 0x332211, emissive: 0xffaa33, emissiveIntensity: 1.0, metalness: 0.3, roughness: 0.4 });

  // ---------- helpers ----------
  let boltN = 0;
  function addBolt(parent, x, y, z, r = 0.012, h = 0.02, mat = machineLightMat) {
    const g = new THREE.CylinderGeometry(r, r, h, 6);
    const m = new THREE.Mesh(g, mat);
    m.name = `bolt_${boltN++}`;
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function lathe(pts, segs = 14) {
    return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  }
  function plate(pts, depth = 0.04, holes = null) {
    const shape = new THREE.Shape();
    pts.forEach(([x, y], i) => i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
    shape.closePath();
    if (holes) holes.forEach(h => {
      const p2 = new THREE.Path();
      h.forEach(([x, y], i) => i === 0 ? p2.moveTo(x, y) : p2.lineTo(x, y));
      p2.closePath();
      shape.holes.push(p2);
    });
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, steps: 1 });
  }
  function tubeBetween(pts, r, mat) {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, Math.max(4, pts.length * 4), r, 6, false);
    return new THREE.Mesh(g, mat);
  }

  const root = new THREE.Group(); root.name = 'octopus';
  const chassis = new THREE.Group(); chassis.name = 'chassis';
  root.add(chassis);

  // ============ MANTLE (torso stack) ============
  const mantleSeg1 = new THREE.Mesh(lathe([[0.30, 0], [0.40, 0.05], [0.42, 0.15], [0.38, 0.26], [0.32, 0.32]]), machineMat);
  mantleSeg1.name = 'mantleSeg1';
  mantleSeg1.position.set(0, 0.55, -0.02);
  chassis.add(mantleSeg1);

  const mantleSeg2 = new THREE.Mesh(lathe([[0.32, 0], [0.44, 0.08], [0.48, 0.18], [0.44, 0.28], [0.34, 0.34]]), machineMat);
  mantleSeg2.name = 'mantleSeg2';
  mantleSeg2.position.set(0, 0.32, -0.05);
  mantleSeg1.add(mantleSeg2);

  const mantleSeg3 = new THREE.Mesh(lathe([[0.34, 0], [0.30, 0.08], [0.22, 0.18], [0.12, 0.26], [0.04, 0.30]]), machineMat);
  mantleSeg3.name = 'mantleSeg3';
  mantleSeg3.position.set(0, 0.34, -0.06);
  mantleSeg2.add(mantleSeg3);

  function mantleCollar(name, parent, y, r) {
    const g = new THREE.Group(); g.name = name; g.position.set(0, y, 0);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 20), machineLightMat);
    disc.name = name + '_disc'; g.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, 0.012, 8, 20), machineMat);
    ring.rotation.x = Math.PI / 2; ring.name = name + '_ring'; g.add(ring);
    parent.add(g);
    return g;
  }
  mantleCollar('mantleJointA', mantleSeg1, 0.32, 0.34);
  mantleCollar('mantleJointB', mantleSeg2, 0.34, 0.30);

  const spineRam = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.36, 8), machineLightMat);
  spineRam.name = 'mantleSpineRam';
  spineRam.geometry.translate(0, 0.18, 0);
  spineRam.position.set(0, 0.0, -0.30);
  mantleSeg2.add(spineRam);
  const spineRamRod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 6), machineMat);
  spineRamRod.name = 'mantleSpineRamRod';
  spineRamRod.geometry.translate(0, 0.30, 0);
  spineRam.add(spineRamRod);

  for (let i = 0; i < 6; i++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 0.03), machineMat);
    g.name = `mantleChain${i}`;
    g.position.set(0.11, 0.02 + i * 0.05, -0.31);
    g.rotation.y = (i % 2) * 0.25;
    mantleSeg2.add(g);
  }

  // shells
  const dorsalGeo = new THREE.SphereGeometry(0.48, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
  dorsalGeo.scale(1, 0.7, 1.05);
  const mantleShellDorsal = new THREE.Mesh(dorsalGeo, shellMat);
  mantleShellDorsal.name = 'mantleShellDorsal';
  mantleShellDorsal.position.set(0, 0.28, -0.02);
  mantleSeg2.add(mantleShellDorsal);
  const dorsalLip = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.02, 6, 20, Math.PI * 1.3), shellMat);
  dorsalLip.name = 'mantleDorsalLip'; dorsalLip.rotation.x = Math.PI / 2;
  dorsalLip.position.set(0, 0.30, 0.0);
  mantleSeg2.add(dorsalLip);
  const dorsalRib = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.03), shellMat);
  dorsalRib.name = 'mantleDorsalRib'; dorsalRib.position.set(0, 0.34, 0.05);
  mantleSeg2.add(dorsalRib);

  function flankShell(name, parent, sign, y) {
    const g = new THREE.CylinderGeometry(0.46, 0.40, 0.30, 20, 1, true,
      (sign > 0 ? -0.65 : Math.PI - 0.65), 2.3);
    const m = new THREE.Mesh(g, shellMat);
    m.name = name; m.position.set(0, y, 0);
    parent.add(m);
    return m;
  }
  flankShell('mantleShellFlankL', mantleSeg1, 1, 0.15);
  flankShell('mantleShellFlankR', mantleSeg1, -1, 0.15);

  const postGeo = new THREE.CylinderGeometry(0.28, 0.10, 0.26, 16, 1, true, Math.PI * 0.55, 2.4);
  const mantleShellPosterior = new THREE.Mesh(postGeo, shellMat);
  mantleShellPosterior.name = 'mantleShellPosterior';
  mantleShellPosterior.position.set(0, 0.02, 0.0);
  mantleSeg3.add(mantleShellPosterior);

  const ventGeo = new THREE.CylinderGeometry(0.34, 0.30, 0.14, 16, 1, true, -0.7, 2.2);
  const mantleShellVentral = new THREE.Mesh(ventGeo, shellMat);
  mantleShellVentral.name = 'mantleShellVentral';
  mantleShellVentral.position.set(0, 0.02, 0.0);
  mantleSeg1.add(mantleShellVentral);

  [0, 1, 2, 3, 4].forEach(i => addBolt(mantleShellVentral, -0.24 + i * 0.12, 0.02, 0.30, 0.012, 0.02));
  [0, 1, 2, 3].forEach(i => addBolt(mantleShellDorsal, -0.22 + i * 0.15, 0.05, 0.20));

  // status port + hazard marking
  const statusPort = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.015, 10), statusCyan);
  statusPort.name = 'mantleStatusPort';
  statusPort.rotation.x = Math.PI / 2;
  statusPort.position.set(0.30, 0.14, 0.05);
  mantleSeg1.add(statusPort);
  const hazardStripe = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.02, 0.01), accentMat);
  hazardStripe.name = 'mantleHazardStripe';
  hazardStripe.position.set(-0.20, 0.10, 0.32);
  hazardStripe.rotation.z = 0.5;
  mantleSeg1.add(hazardStripe);

  // ============ SIPHON ============
  const siphonBase = new THREE.Group(); siphonBase.name = 'siphonBase';
  siphonBase.position.set(0.28, 0.04, 0.06);
  siphonBase.rotation.y = -0.5;
  mantleSeg1.add(siphonBase);
  const siphonHousing = new THREE.Mesh(lathe([[0.06, 0], [0.05, 0.05], [0.032, 0.10], [0.024, 0.14]]), machineMat);
  siphonHousing.name = 'siphonHousing';
  siphonBase.add(siphonHousing);
  const siphonNozzle = new THREE.Group(); siphonNozzle.name = 'siphonNozzle';
  siphonNozzle.position.set(0, 0.14, 0);
  siphonBase.add(siphonNozzle);
  const nozGeo = new THREE.CylinderGeometry(0.022, 0.016, 0.06, 10); nozGeo.translate(0, 0.03, 0);
  const siphonNozzleTube = new THREE.Mesh(nozGeo, machineLightMat);
  siphonNozzleTube.name = 'siphonNozzleTube';
  siphonNozzle.add(siphonNozzleTube);
  addBolt(siphonHousing, 0.05, 0.04, 0, 0.008, 0.016);

  // ============ ARM CROWN + HEAD (leading end) ============
  const armCrown = new THREE.Group(); armCrown.name = 'armCrown';
  armCrown.position.set(0, -0.05, 0.22);
  mantleSeg1.add(armCrown);

  const crownPlateL = new THREE.Mesh(plate([[-0.02, -0.06], [0.14, -0.05], [0.12, 0.08], [-0.02, 0.07]], 0.04), shellMat);
  crownPlateL.name = 'crownPlateL'; crownPlateL.position.set(0.20, 0.06, 0.02); crownPlateL.rotation.y = 0.7;
  armCrown.add(crownPlateL);
  const crownPlateR = new THREE.Mesh(plate([[-0.02, -0.06], [0.14, -0.05], [0.12, 0.08], [-0.02, 0.07]], 0.04), shellMat);
  crownPlateR.name = 'crownPlateR'; crownPlateR.position.set(-0.20, 0.06, 0.02); crownPlateR.rotation.y = -0.7;
  crownPlateR.scale.x = -1;
  armCrown.add(crownPlateR);

  function buildEye(side) {
    const g = new THREE.Group(); g.name = side > 0 ? 'eyeMountL' : 'eyeMountR';
    g.position.set(side * 0.20, 0.14, 0.16);
    g.rotation.y = side * -0.5;
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.016, 10, 16), machineLightMat);
    bezel.name = side > 0 ? 'eyeBezelL' : 'eyeBezelR';
    g.add(bezel);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), lensMat);
    lens.name = side > 0 ? 'eyeLensL' : 'eyeLensR';
    lens.position.z = 0.008; lens.scale.z = 0.55;
    g.add(lens);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6), machineMat);
    stalk.geometry.translate(0, 0.03, 0);
    stalk.name = side > 0 ? 'opticStalkL' : 'opticStalkR';
    stalk.position.set(side * 0.05, 0.04, -0.02);
    stalk.rotation.z = side * -0.5;
    g.add(stalk);
    return g;
  }
  const eyeMountL = buildEye(1); armCrown.add(eyeMountL);
  const eyeMountR = buildEye(-1); armCrown.add(eyeMountR);

  const headBase = new THREE.Group(); headBase.name = 'headBase';
  headBase.position.set(0, 0.03, 0.22);
  armCrown.add(headBase);

  const browPlate = new THREE.Mesh(plate([[-0.14, 0.02], [0.14, 0.02], [0.10, 0.10], [-0.10, 0.10]], 0.05), shellMat);
  browPlate.name = 'browPlate';
  browPlate.position.set(0, 0.10, 0.02); browPlate.rotation.x = -0.5;
  headBase.add(browPlate);

  const forecrownPlate = new THREE.Mesh(plate([[-0.08, 0], [0.08, 0], [0.06, 0.05], [-0.06, 0.05]],
    0.03, [[[-0.02, 0.01], [0.02, 0.01], [0.02, 0.03], [-0.02, 0.03]]]), shellMat);
  forecrownPlate.name = 'forecrownPlate';
  forecrownPlate.position.set(0, 0.16, -0.04); forecrownPlate.rotation.x = -0.3;
  headBase.add(forecrownPlate);

  const cheekPlateL = new THREE.Mesh(plate([[-0.02, -0.06], [0.10, -0.04], [0.09, 0.06], [-0.02, 0.04]], 0.04), shellMat);
  cheekPlateL.name = 'cheekPlateL'; cheekPlateL.position.set(0.11, 0.01, 0.0); cheekPlateL.rotation.y = 0.6;
  headBase.add(cheekPlateL);
  const cheekPlateR = new THREE.Mesh(plate([[-0.02, -0.06], [0.10, -0.04], [0.09, 0.06], [-0.02, 0.04]], 0.04), shellMat);
  cheekPlateR.name = 'cheekPlateR'; cheekPlateR.position.set(-0.11, 0.01, 0.0); cheekPlateR.rotation.y = -0.6; cheekPlateR.scale.x = -1;
  headBase.add(cheekPlateR);

  const chinPlate = new THREE.Mesh(plate([[-0.09, 0], [0.09, 0], [0.07, -0.05], [-0.07, -0.05]], 0.03), shellMat);
  chinPlate.name = 'chinPlate'; chinPlate.position.set(0, -0.09, 0.08); chinPlate.rotation.x = 0.4;
  headBase.add(chinPlate);

  function beakShape() {
    const s = new THREE.Shape();
    s.moveTo(-0.05, 0.02); s.lineTo(0.05, 0.02);
    s.quadraticCurveTo(0.06, -0.03, 0.0, -0.10);
    s.quadraticCurveTo(-0.06, -0.03, -0.05, 0.02);
    return new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 2 });
  }
  const beakUpper = new THREE.Mesh(beakShape(), machineMat);
  beakUpper.name = 'beakUpper';
  beakUpper.position.set(0, -0.02, 0.20); beakUpper.rotation.x = -0.35;
  headBase.add(beakUpper);

  const beakLower = new THREE.Group(); beakLower.name = 'beakLower';
  beakLower.position.set(0, -0.06, 0.12);
  headBase.add(beakLower);
  const beakLowerMesh = new THREE.Mesh(beakShape(), machineMat);
  beakLowerMesh.name = 'beakLowerBlade';
  beakLowerMesh.scale.y = -0.75;
  beakLowerMesh.position.set(0, 0.0, 0.06); beakLowerMesh.rotation.x = 0.35;
  beakLower.add(beakLowerMesh);

  const hingeCollarL = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8), machineLightMat);
  hingeCollarL.name = 'hingeCollarL'; hingeCollarL.rotation.z = Math.PI / 2;
  hingeCollarL.position.set(0.05, 0, 0.02); headBase.add(hingeCollarL);
  const hingeCollarR = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8), machineLightMat);
  hingeCollarR.name = 'hingeCollarR'; hingeCollarR.rotation.z = Math.PI / 2;
  hingeCollarR.position.set(-0.05, -0.06, 0.12); headBase.add(hingeCollarR);

  const jawRamBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.08, 6), machineLightMat);
  jawRamBarrel.name = 'jawRamBarrel';
  jawRamBarrel.position.set(0, 0.06, 0.10); jawRamBarrel.rotation.x = 0.9;
  headBase.add(jawRamBarrel);
  const jawRamRod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6), machineMat);
  jawRamRod.name = 'jawRamRod';
  jawRamRod.geometry.translate(0, 0.035, 0);
  jawRamRod.position.set(0, -0.02, -0.02); jawRamRod.rotation.x = 0.6;
  beakLower.add(jawRamRod);

  const mandibleLinkL = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), machineMat);
  mandibleLinkL.name = 'mandibleLinkL'; mandibleLinkL.geometry.translate(0, 0.035, 0);
  mandibleLinkL.position.set(0.045, 0, 0.0); mandibleLinkL.rotation.x = 0.5;
  beakLower.add(mandibleLinkL);
  const mandibleLinkR = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 6), machineMat);
  mandibleLinkR.name = 'mandibleLinkR'; mandibleLinkR.geometry.translate(0, 0.035, 0);
  mandibleLinkR.position.set(-0.045, 0, 0.0); mandibleLinkR.rotation.x = 0.5;
  beakLower.add(mandibleLinkR);

  const headSensorStalk = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6), machineMat);
  headSensorStalk.name = 'headSensorStalk';
  headSensorStalk.geometry.translate(0, 0.025, 0);
  headSensorStalk.position.set(0, 0.18, -0.03);
  headBase.add(headSensorStalk);
  const headSensorTip = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), statusAmber);
  headSensorTip.name = 'headSensorTip'; headSensorTip.position.set(0, 0.05, 0);
  headSensorStalk.add(headSensorTip);

  const headVent = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.015, 0.02), machineMat);
  headVent.name = 'headVent'; headVent.position.set(0.08, 0.12, 0.03);
  headBase.add(headVent);

  addBolt(browPlate, -0.08, 0.02, 0.02, 0.008, 0.014);
  addBolt(browPlate, 0.08, 0.02, 0.02, 0.008, 0.014);

  // ============ ARMS ============
  const ARM_DROOP = 0.55;
  const CURL_REST = [0.12, 0.28, 0.40, 0.50, 0.62];
  const angles = [-157.5, -112.5, -67.5, -22.5, 22.5, 67.5, 112.5, 157.5];
  const arms = [];

  function seg(name, len, rTop, rBottom, mat) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, len, 8, 1);
    g.translate(0, len / 2, 0);
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    return m;
  }

  function buildArm(index, angleDeg) {
    const angle = THREE.MathUtils.degToRad(angleDeg);
    const mount = new THREE.Group();
    mount.name = `armMount${index}`;
    mount.rotation.order = 'YXZ';
    const radius0 = 0.14;
    mount.position.set(Math.sin(angle) * radius0, -0.02, Math.cos(angle) * radius0);
    mount.rotation.set(ARM_DROOP, angle, 0, 'YXZ');
    armCrown.add(mount);

    const base = seg(`armBase${index}`, 0.16, 0.095, 0.078, machineMat);
    const s1 = seg(`armSeg1_${index}`, 0.27, 0.078, 0.062, machineMat);
    const s2 = seg(`armSeg2_${index}`, 0.27, 0.062, 0.046, machineMat);
    const s3 = seg(`armSeg3_${index}`, 0.24, 0.046, 0.032, machineMat);
    const s4 = seg(`armSeg4_${index}`, 0.22, 0.032, 0.020, machineMat);
    const tipGeo = new THREE.ConeGeometry(0.020, 0.14, 8); tipGeo.translate(0, 0.07, 0);
    const tip = new THREE.Mesh(tipGeo, machineMat); tip.name = `armTip${index}`;

    s1.position.set(0, 0.16, 0);
    s2.position.set(0, 0.27, 0);
    s3.position.set(0, 0.27, 0);
    s4.position.set(0, 0.24, 0);
    tip.position.set(0, 0.22, 0);

    mount.add(base);
    base.add(s1); s1.add(s2); s2.add(s3); s3.add(s4); s4.add(tip);

    function collar(name, parent, y, r) {
      const g = new THREE.TorusGeometry(r, r * 0.28, 8, 12);
      const m = new THREE.Mesh(g, machineLightMat);
      m.name = name; m.rotation.x = Math.PI / 2; m.position.set(0, y, 0);
      parent.add(m);
    }
    collar(`armCollarA${index}`, base, 0.16, 0.08);
    collar(`armCollarB${index}`, s1, 0.27, 0.064);
    collar(`armCollarC${index}`, s2, 0.27, 0.048);
    collar(`armCollarD${index}`, s3, 0.24, 0.033);

    const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 8), machineLightMat);
    ram.geometry.translate(0, 0.065, 0);
    ram.name = `armRam${index}`;
    ram.position.set(0.05, 0.02, -0.03);
    base.add(ram);
    const ramRod = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.10, 6), machineMat);
    ramRod.geometry.translate(0, 0.12, 0);
    ramRod.name = `armRamRod${index}`;
    ram.add(ramRod);

    function sucker(name, parent, y, side) {
      const prof = [[0.0, 0.0], [0.020, 0.004], [0.026, 0.014], [0.018, 0.022], [0.0, 0.024]];
      const g = lathe(prof, 10);
      const m = new THREE.Mesh(g, rubberMat);
      m.name = name;
      m.position.set(side * 0.032, y, -0.026);
      m.rotation.x = Math.PI;
      m.rotation.z = side * 0.3;
      parent.add(m);
    }
    sucker(`sucker${index}_a`, s2, 0.10, 1);
    sucker(`sucker${index}_b`, s2, 0.19, -1);
    sucker(`sucker${index}_c`, s3, 0.08, 1);
    sucker(`sucker${index}_d`, s3, 0.17, -1);

    const plate1geo = new THREE.CylinderGeometry(0.11, 0.09, 0.15, 10, 1, true, -0.9, 2.0);
    plate1geo.translate(0, 0.08, 0);
    const armPlateA = new THREE.Mesh(plate1geo, shellMat); armPlateA.name = `armPlateA${index}`;
    base.add(armPlateA);
    const plate2geo = new THREE.CylinderGeometry(0.088, 0.07, 0.22, 10, 1, true, -0.9, 2.0);
    plate2geo.translate(0, 0.12, 0);
    const armPlateB = new THREE.Mesh(plate2geo, shellMat); armPlateB.name = `armPlateB${index}`;
    s1.add(armPlateB);

    // arm tendon cable — contained per-segment so it never spans a joint
    function tendon(name, parent, len) {
      const t = tubeBetween([[0.02, 0.01, -len * 0.35], [0.018, len * 0.5, -0.03], [0.015, len - 0.01, -len * 0.35 + 0.02]], 0.008, rubberMat);
      t.name = name;
      parent.add(t);
    }
    tendon(`armTendonBase${index}`, base, 0.16);
    tendon(`armTendonSeg1_${index}`, s1, 0.27);
    tendon(`armTendonSeg2_${index}`, s2, 0.27);
    tendon(`armTendonSeg3_${index}`, s3, 0.24);
    tendon(`armTendonSeg4_${index}`, s4, 0.22);

    addBolt(armPlateA, 0.10, 0.02, -0.02, 0.007, 0.012);
    addBolt(armPlateA, 0.10, 0.10, -0.02, 0.007, 0.012);

    return { mount, base, s1, s2, s3, s4, tip, yaw: angle, index };
  }

  angles.forEach((a, i) => arms.push(buildArm(i, a)));

  // ============ CABLE HARNESS (mantle side, split at joints) ============
  const hoseSiphonToCrown = tubeBetween(
    [[0.28, 0.04, 0.06], [0.30, -0.02, 0.15], [0.10, -0.08, 0.20], [0, -0.05, 0.22]], 0.022, rubberMat);
  hoseSiphonToCrown.name = 'hoseSiphonToCrown';
  mantleSeg1.add(hoseSiphonToCrown);

  const hoseFlankL = tubeBetween(
    [[0.20, 0.30, 0.05], [0.28, 0.12, 0.12], [0.14, -0.03, 0.20]], 0.02, rubberMat);
  hoseFlankL.name = 'hoseFlankL';
  mantleSeg1.add(hoseFlankL);
  const hoseFlankR = tubeBetween(
    [[-0.20, 0.30, 0.05], [-0.28, 0.12, 0.12], [-0.14, -0.03, 0.20]], 0.02, rubberMat);
  hoseFlankR.name = 'hoseFlankR';
  mantleSeg1.add(hoseFlankR);

  const hoseSpineLower = tubeBetween(
    [[0.06, 0.02, -0.28], [0.10, 0.20, -0.30], [0.06, 0.32, -0.28]], 0.018, rubberMat);
  hoseSpineLower.name = 'hoseSpineLower';
  mantleSeg1.add(hoseSpineLower);
  const hoseSpineUpper = tubeBetween(
    [[0.05, 0.0, -0.26], [0.08, 0.16, -0.28], [0.03, 0.30, -0.20]], 0.016, rubberMat);
  hoseSpineUpper.name = 'hoseSpineUpper';
  mantleSeg2.add(hoseSpineUpper);

  function clamp3(name, parent, x, y, z) {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 10), machineLightMat);
    c.name = name; c.position.set(x, y, z);
    parent.add(c);
  }
  clamp3('hoseClamp1', mantleSeg1, 0.24, 0.08, 0.10);
  clamp3('hoseClamp2', mantleSeg1, -0.24, 0.08, 0.10);
  clamp3('hoseClamp3', mantleSeg1, 0.08, 0.14, -0.28);

  // ============ pose ============
  const REST_TURN_HEAD = 0;

  object_pose_fn:
  root.userData.pose = (s) => {
    const speed = s.speed || 0;
    const stride = s.stride || 0;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = (s.health === undefined) ? 1 : s.health;
    const t = s.t || 0;
    const action = s.action || null;
    const ph = s.phase || 0;

    // ---- base chassis ----
    let bob = 0, lean = 0, roll = turn * 0.12, dropY = 0, yawH = turn * 0.3;
    if (speed < 0.05) {
      bob = Math.sin(t * 1.3) * 0.012;
      lean = Math.sin(t * 0.5) * 0.02;
    } else {
      bob = Math.sin(stride * Math.PI * 4) * 0.02 * Math.min(1, speed);
      lean = 0.05 * Math.min(1, speed / 3);
      dropY = -0.04 * Math.min(1, speed / 4);
    }

    chassis.position.set(0, dropY + bob, 0);
    chassis.rotation.set(lean, 0, roll);
    chassis.scale.set(1, 1, 1);

    mantleSeg2.scale.setScalar(1 + Math.sin(t * 1.3) * 0.01);
    mantleSeg3.scale.setScalar(1 + Math.sin(t * 1.3 + 0.6) * 0.01);

    headBase.rotation.set(0, yawH, 0);
    beakLower.rotation.set(0.15, 0, 0);
    siphonNozzle.rotation.set(0, 0, 0);

    // ---- arm gait defaults ----
    function setArm(a, pitch, spread, curls) {
      a.mount.rotation.set(pitch, a.yaw, spread, 'YXZ');
      a.base.rotation.x = curls[0];
      a.s1.rotation.x = curls[1];
      a.s2.rotation.x = curls[2];
      a.s3.rotation.x = curls[3];
      a.s4.rotation.x = curls[4];
    }

    function gaitCurls(mul, extra) {
      return CURL_REST.map((c, i) => c + extra * ((i + 1) / 5) * mul);
    }

    if (!action) {
      const moving = speed >= 0.05;
      arms.forEach((a, i) => {
        const side = Math.sign(Math.sin(a.yaw)) || 1;
        const ampMul = moving ? Math.max(0.2, 1 - turn * 0.5 * side) : 1;
        if (!grounded) {
          // airborne: tuck, no walking cycle
          setArm(a, ARM_DROOP - 0.35, 0, [0.05, 0.1, 0.15, 0.2, 0.25]);
        } else if (!moving) {
          const idle = Math.sin(t * 0.6 + i * 0.8) * 0.03;
          setArm(a, ARM_DROOP + idle, side * turn * 0.05, gaitCurls(1, idle));
        } else {
          const p = (stride + i / 8) % 1;
          const swing = Math.sin(p * Math.PI * 2) * Math.min(0.5, speed * 0.16) * ampMul;
          const pushCurl = Math.max(0, Math.sin(p * Math.PI * 2 + Math.PI)) * 0.5;
          setArm(a, ARM_DROOP + swing * 0.6, side * turn * 0.08, gaitCurls(1, pushCurl - swing * 0.3));
        }
      });
      if (turn !== 0) headBase.rotation.y += turn * 0.15;
    }

    // ---- action overrides ----
    if (action === 'attack') {
      const front = [3, 4];
      let windP = Math.min(1, ph / 0.3), commP = Math.max(0, Math.min(1, (ph - 0.3) / 0.3)), recP = Math.max(0, (ph - 0.6) / 0.4);
      chassis.position.z = (commP * 0.10) - (recP * 0.10);
      beakLower.rotation.x = 0.15 + windP * 0.3 - commP * 0.35;
      arms.forEach((a, i) => {
        if (front.includes(i)) {
          const p = -windP * 0.4 + commP * 0.9 - recP * 0.5;
          setArm(a, ARM_DROOP - 0.3 + p, 0, gaitCurls(1, -windP * 0.2 + commP * 0.5));
        } else {
          setArm(a, ARM_DROOP, 0, CURL_REST);
        }
      });
    } else if (action === 'fire') {
      const aimP = Math.min(1, ph / 0.4), relP = Math.max(0, Math.min(1, (ph - 0.4) / 0.2)), recoilP = Math.max(0, (ph - 0.6) / 0.4);
      siphonNozzle.rotation.x = -aimP * 0.4;
      siphonBase.scale.setScalar(1 - relP * 0.08);
      chassis.position.x = -recoilP * 0.06;
      arms.forEach(a => setArm(a, ARM_DROOP, 0, CURL_REST));
    } else if (action === 'hit') {
      const k = Math.sin(ph * Math.PI) * (1 - ph);
      chassis.rotation.z = roll + k * 0.4;
      chassis.position.x = k * 0.06;
    } else if (action === 'block') {
      const k = Math.min(1, ph / 0.3);
      chassis.position.y += -0.05 * k;
      chassis.rotation.x += 0.1 * k;
      headBase.rotation.x = 0.3 * k;
      arms.forEach((a, i) => {
        const front = [2, 3, 4, 5].includes(i);
        if (front) setArm(a, ARM_DROOP - 0.5 * k, -Math.sign(Math.sin(a.yaw)) * 0.3 * k, gaitCurls(1, 0.4 * k));
        else setArm(a, ARM_DROOP + 0.1 * k, 0, CURL_REST);
      });
    } else if (action === 'gather') {
      const downP = Math.min(1, ph / 0.5), upP = Math.max(0, (ph - 0.5) / 0.5);
      chassis.position.y += -0.1 * downP + 0.1 * upP * downP;
      const front = [3, 4];
      arms.forEach((a, i) => {
        if (front.includes(i)) setArm(a, ARM_DROOP + 0.5 * downP - 0.3 * upP, 0, gaitCurls(1, 0.5 * downP - 0.2 * upP));
        else setArm(a, ARM_DROOP, 0, CURL_REST);
      });
    } else if (action === 'deposit') {
      const downP = Math.min(1, ph / 0.6), upP = Math.max(0, (ph - 0.6) / 0.4);
      chassis.position.y += -0.08 * downP + 0.08 * upP * downP;
      const front = [3, 4];
      arms.forEach((a, i) => {
        if (front.includes(i)) setArm(a, ARM_DROOP + 0.35 * downP - 0.25 * upP, 0, gaitCurls(1, 0.2 * downP));
        else setArm(a, ARM_DROOP, 0, CURL_REST);
      });
    } else if (action === 'eat') {
      headBase.position.y = -0.06;
      headBase.rotation.x = 0.25;
      const cyc = Math.sin(ph * Math.PI * 5) * Math.sin(ph * Math.PI);
      beakLower.rotation.x = 0.15 + Math.max(0, cyc) * 0.4;
      arms.forEach(a => setArm(a, ARM_DROOP, 0, CURL_REST));
    } else if (action === 'drink') {
      const k = Math.sin(ph * Math.PI);
      headBase.position.y = -0.08 * k;
      headBase.rotation.x = 0.3 * k;
      beakLower.rotation.x = 0.15 + 0.15 * k;
      arms.forEach(a => setArm(a, ARM_DROOP, 0, CURL_REST));
    } else if (action === 'jump') {
      const crouchP = Math.min(1, ph / 0.33), extP = Math.max(0, (ph - 0.33) / 0.67);
      chassis.position.y += -0.12 * crouchP * (1 - extP) + 0.15 * extP;
      arms.forEach(a => setArm(a, ARM_DROOP + 0.4 * crouchP - 0.6 * extP, 0, gaitCurls(1, 0.4 * crouchP - 0.3 * extP)));
    } else if (action === 'land') {
      const reachP = Math.min(1, ph / 0.4), impactP = Math.max(0, Math.min(1, (ph - 0.4) / 0.2)), settleP = Math.max(0, (ph - 0.6) / 0.4);
      chassis.position.y += -0.15 * impactP + 0.15 * impactP * settleP;
      arms.forEach(a => setArm(a, ARM_DROOP - 0.4 * reachP + 0.6 * impactP - 0.2 * settleP, 0, gaitCurls(1, 0.5 * impactP)));
    } else if (action === 'signal') {
      const env = Math.sin(ph * Math.PI);
      chassis.position.y += 0.1 * env;
      arms.forEach((a) => setArm(a, ARM_DROOP - 0.9 * env, 0, gaitCurls(1, -0.3 * env)));
      headBase.rotation.x = -0.2 * env;
    } else if (action === 'sleep') {
      const k = ph * ph * (3 - 2 * ph);
      chassis.position.y += -0.35 * k;
      chassis.rotation.x += 0.15 * k;
      headBase.rotation.x = 0.3 * k;
      arms.forEach(a => setArm(a, ARM_DROOP + 0.6 * k, 0, gaitCurls(1, 0.5 * k)));
    } else if (action === 'wake') {
      const k = 1 - (ph * ph * (3 - 2 * ph));
      chassis.position.y += -0.35 * k;
      chassis.rotation.x += 0.15 * k;
      headBase.rotation.x = 0.3 * k;
      arms.forEach(a => setArm(a, ARM_DROOP + 0.6 * k, 0, gaitCurls(1, 0.5 * k)));
    } else if (action === 'die') {
      const k = ph * ph * (3 - 2 * ph);
      chassis.position.y += -0.4 * k;
      chassis.rotation.x += 0.5 * k;
      chassis.rotation.z += 0.3 * k;
      headBase.rotation.x = 0.5 * k;
      beakLower.rotation.x = 0.15 + 0.3 * k;
      arms.forEach((a, i) => setArm(a, ARM_DROOP + 1.0 * k, (i % 2 ? 1 : -1) * 0.2 * k, gaitCurls(1, -0.3 * k)));
    } else if (action === 'evolve') {
      const braceP = Math.min(1, ph / 0.3), openP = Math.max(0, Math.min(1, (ph - 0.3) / 0.4)), closeP = Math.max(0, (ph - 0.7) / 0.3);
      const openAmt = openP * (1 - closeP);
      chassis.position.y += -0.08 * braceP;
      mantleShellDorsal.position.y = 0.28 + openAmt * 0.05;
      mantleShellFlankLref(); // noop helper avoided
      arms.forEach(a => setArm(a, ARM_DROOP + 0.3 * braceP - 0.2 * openAmt, 0, gaitCurls(1, 0.2 * braceP)));
    }

    // ---- hurt overlay (difference from standing) ----
    if (health < 1) {
      const hk = 1 - health;
      chassis.rotation.z += 0.18 * hk;
      chassis.position.y += -0.03 * hk;
      headBase.rotation.z = 0.15 * hk;
      const a0 = arms[0];
      a0.mount.rotation.x += 0.3 * hk;
    }

    function mantleShellFlankLref() {} // helper placeholder (no-op)
  };

  return root;
}
```