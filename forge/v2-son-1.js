"use strict";
function build(THREE, TSL) {
  const { Fn, vec2, vec3, vec4, float, uv, positionLocal, positionWorld, normalLocal,
          normalWorld, cameraPosition, time, sin, cos, abs, pow, mix, smoothstep, step,
          fract, floor, dot, cross, normalize, length, min, max, clamp, oneMinus,
          mul, add, sub, div, uniform } = TSL;

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------------
  // MATERIALS
  // ---------------------------------------------------------------------
  const fresnelNode = (() => {
    const viewDir = normalize(sub(cameraPosition, positionWorld));
    const f = pow(oneMinus(clamp(max(dot(normalWorld, viewDir), 0.0), 0.0, 1.0)), 3.0);
    return f;
  })();

  const skinMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.05 });
  skinMat.side = THREE.DoubleSide;
  {
    const topColor = uniform(new THREE.Color(0x3d4a56));
    const bellyColor = uniform(new THREE.Color(0xe9e3d6));
    skinMat.colorNode = mix(bellyColor, topColor, smoothstep(-0.15, 0.55, normalWorld.y));
    skinMat.emissiveNode = vec3(0.05, 0.07, 0.09).mul(fresnelNode);
    skinMat.positionNode = positionLocal.add(
      normalLocal.mul(sin(positionLocal.z.mul(9.0).add(time.mul(1.6))).mul(0.0015))
    );
  }

  const finMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.05 });
  finMat.side = THREE.DoubleSide;
  {
    const finColor = uniform(new THREE.Color(0x33404a));
    finMat.colorNode = finColor;
    finMat.emissiveNode = vec3(0.04, 0.05, 0.07).mul(fresnelNode);
  }

  const mouthMat = new THREE.MeshStandardNodeMaterial({ color: 0x5a2530, roughness: 0.6 });
  mouthMat.side = THREE.DoubleSide;

  const toothMat = new THREE.MeshStandardNodeMaterial({ color: 0xf3efe2, roughness: 0.25, metalness: 0.0 });
  toothMat.side = THREE.DoubleSide;

  const eyeMat = new THREE.MeshStandardNodeMaterial({ color: 0x05050a, roughness: 0.15, metalness: 0.3 });
  eyeMat.side = THREE.DoubleSide;

  const gillMat = new THREE.MeshStandardNodeMaterial({ color: 0x2a1c1e, roughness: 0.7 });
  gillMat.side = THREE.DoubleSide;

  const hoseMat = new THREE.MeshStandardNodeMaterial({ color: 0x1c1c1e, roughness: 0.55, metalness: 0.1 });
  hoseMat.emissiveNode = vec3(0.02, 0.02, 0.03).mul(fresnelNode);

  const hardwareMat = new THREE.MeshStandardNodeMaterial({ color: 0x8a9096, roughness: 0.35, metalness: 0.8 });

  // ---------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------
  function makeBlade(points, depth) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2, curveSegments: 8
    });
    geo.translate(0, 0, -depth / 2);
    return geo;
  }

  function makeBevelBoxGeo(w, h, depth, bevel) {
    bevel = bevel || 0.014;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -h / 2); shape.lineTo(w / 2, -h / 2);
    shape.lineTo(w / 2, h / 2); shape.lineTo(-w / 2, h / 2); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 1 });
    geo.translate(0, 0, -depth / 2);
    return geo;
  }

  function buildTeeth(count, spreadX, pointDown, len, rad) {
    const g = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const tn = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
      const x = tn * spreadX;
      const sc = 1 - Math.abs(tn) * 0.35;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(rad * sc, len * sc, 4), toothMat);
      cone.name = (pointDown ? 'UpperTooth' : 'LowerTooth') + i;
      cone.position.set(x, 0, Math.abs(tn) * 0.015);
      if (pointDown) cone.rotation.x = Math.PI;
      g.add(cone);
    }
    return g;
  }

  const boltGeo = new THREE.CylinderGeometry(0.022, 0.024, 0.018, 6);
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  const AXIS_Z = new THREE.Vector3(0, 0, 1);

  function addBolt(parent, name, position, normal) {
    const b = new THREE.Mesh(boltGeo, hardwareMat);
    b.name = name;
    b.position.copy(position);
    b.quaternion.setFromUnitVectors(AXIS_Y, normal.clone().normalize());
    parent.add(b);
    return b;
  }

  function addBoltRing(parent, prefix, z, rx, ry, sides) {
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU;
      const nx = ry * Math.cos(a), ny = rx * Math.sin(a);
      const nl = Math.hypot(nx, ny) || 1;
      const normal = new THREE.Vector3(nx / nl, ny / nl, 0);
      const pos = new THREE.Vector3(rx * Math.cos(a), ry * Math.sin(a), z).add(normal.clone().multiplyScalar(0.012));
      addBolt(parent, `${prefix}Bolt${i}`, pos, normal);
    }
  }

  // Flat, beveled, machined hull panel "barrel" — replaces round hull masses
  // with named flat plates meeting at chamfered edges.
  function makePanelBarrel(parent, prefix, z0, z1, r0x, r0y, r1x, r1y, sides, opts) {
    opts = opts || {};
    const thickness = opts.thickness || 0.03;
    const bevelSize = opts.bevelSize || 0.012;
    const bevelThickness = opts.bevelThickness || 0.010;
    const material = opts.material || skinMat;
    const h = z1 - z0;
    const panels = [];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * TAU, a1 = ((i + 1) / sides) * TAU, aMid = (a0 + a1) / 2;
      const p00 = new THREE.Vector3(r0x * Math.cos(a0), r0y * Math.sin(a0), 0);
      const p10 = new THREE.Vector3(r0x * Math.cos(a1), r0y * Math.sin(a1), 0);
      const p01 = new THREE.Vector3(r1x * Math.cos(a0), r1y * Math.sin(a0), 0);
      const p11 = new THREE.Vector3(r1x * Math.cos(a1), r1y * Math.sin(a1), 0);
      const w0 = p00.distanceTo(p10), w1 = p01.distanceTo(p11);
      const shape = new THREE.Shape();
      shape.moveTo(-w0 / 2, 0); shape.lineTo(w0 / 2, 0);
      shape.lineTo(w1 / 2, h); shape.lineTo(-w1 / 2, h); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness, bevelSize, bevelSegments: 1, curveSegments: 1 });
      geo.translate(0, 0, -thickness / 2);
      const mesh = new THREE.Mesh(geo, material);
      mesh.name = `${prefix}Panel${i}`;
      const rxMid = (r0x + r1x) / 2, ryMid = (r0y + r1y) / 2;
      const tangent = new THREE.Vector3(-rxMid * Math.sin(aMid), ryMid * Math.cos(aMid), 0).normalize();
      const normal = new THREE.Vector3(ryMid * Math.cos(aMid), rxMid * Math.sin(aMid), 0).normalize();
      const spineDir = new THREE.Vector3(0, 0, 1);
      const basis = new THREE.Matrix4().makeBasis(tangent, spineDir, normal);
      mesh.quaternion.setFromRotationMatrix(basis);
      mesh.position.set(r0x * Math.cos(aMid), r0y * Math.sin(aMid), z0);
      parent.add(mesh);
      panels.push(mesh);
      if (opts.faceBolt !== false) {
        const fpos = new THREE.Vector3(rxMid * Math.cos(aMid), ryMid * Math.sin(aMid), z0 + h / 2)
          .add(normal.clone().multiplyScalar(thickness / 2 + 0.01));
        addBolt(parent, `${prefix}FaceBolt${i}`, fpos, normal);
      }
    }
    addBoltRing(parent, prefix + 'FrontRing', z0, r0x, r0y, sides);
    addBoltRing(parent, prefix + 'BackRing', z1, r1x, r1y, sides);
    return panels;
  }

  function addHose(parent, name, ptsArr, radius, corrugate) {
    const pts = ptsArr.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubularSeg = Math.max(8, pts.length * 6);
    const geo = new THREE.TubeGeometry(curve, tubularSeg, radius, 7, false);
    const mesh = new THREE.Mesh(geo, hoseMat);
    mesh.name = name;
    parent.add(mesh);
    if (corrugate) {
      const len = curve.getLength();
      const ringCount = Math.max(4, Math.round(len / 0.16));
      for (let i = 0; i < ringCount; i++) {
        const tt = (i + 0.5) / ringCount;
        const pos = curve.getPointAt(tt);
        const tan = curve.getTangentAt(tt);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.25, radius * 0.4, 5, 9), hardwareMat);
        ring.position.copy(pos);
        ring.quaternion.setFromUnitVectors(AXIS_Z, tan.clone().normalize());
        ring.name = `${name}Ring${i}`;
        parent.add(ring);
      }
    }
    return mesh;
  }

  // ---------------------------------------------------------------------
  // GEOMETRY (shared, beveled)
  // ---------------------------------------------------------------------
  const dorsalGeo = makeBlade([[0, 0], [0.04, 0.32], [0.22, 0.5], [0.5, 0.28], [0.46, 0.05], [0.15, 0]], 0.055);
  const pectGeo = makeBlade([[0, 0], [0.18, 0.06], [0.55, 0.22], [0.48, 0.4], [0.12, 0.32], [0, 0.1]], 0.045);
  const caudalUpperGeo = makeBlade([[0, 0], [0.1, 0.3], [0.32, 0.55], [0.62, 0.5], [0.55, 0.15], [0.25, -0.05]], 0.05);
  const caudalLowerGeo = makeBlade([[0, 0], [0.08, -0.18], [0.24, -0.3], [0.4, -0.2], [0.32, -0.02], [0.15, 0.05]], 0.045);

  // ---------------------------------------------------------------------
  // BUILD HIERARCHY
  // ---------------------------------------------------------------------
  const Shark = new THREE.Group();
  Shark.name = 'Shark';

  // ---- Torso -------------------------------------------------------
  const Torso = new THREE.Group();
  Torso.name = 'Torso';
  Torso.position.set(0, 0, 0);
  Shark.add(Torso);

  // torso hull as two flat beveled panel barrels (front bulge, aft taper)
  makePanelBarrel(Torso, 'TorsoA', -0.55, 0.05, 0.30, 0.25, 0.62, 0.51, 8, { material: skinMat });
  makePanelBarrel(Torso, 'TorsoB', 0.05, 0.90, 0.62, 0.51, 0.44, 0.36, 8, { material: skinMat });

  // neck collar joint ring between torso and head shells
  const NeckCollar = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 6, 14), hardwareMat);
  NeckCollar.name = 'NeckCollar';
  NeckCollar.position.set(0, 0.02, 0.925);
  NeckCollar.rotation.x = Math.PI / 2;
  Torso.add(NeckCollar);

  // gills
  const GILL_REST = { z: 0.55, x: 0.56, y: 0.03 };
  const gillGroups = {};
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.name = side < 0 ? 'GillsLeft' : 'GillsRight';
    g.position.set(GILL_REST.x * side, GILL_REST.y, GILL_REST.z);
    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(makeBevelBoxGeo(0.03, 0.22, 0.02, 0.006), gillMat);
      bar.name = (side < 0 ? 'GillBarLeft' : 'GillBarRight') + i;
      bar.position.set(0, 0, -i * 0.07);
      bar.rotation.z = 0.15 * side;
      g.add(bar);
    }
    const jbox = new THREE.Mesh(makeBevelBoxGeo(0.05, 0.05, 0.06, 0.008), hardwareMat);
    jbox.name = side < 0 ? 'JunctionBoxLeft' : 'JunctionBoxRight';
    jbox.position.set(0.02 * side, 0.16, 0.05);
    g.add(jbox);
    addBolt(jbox, (side < 0 ? 'JBoxBoltL' : 'JBoxBoltR') + '0', new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(0, 1, 0));
    addBolt(jbox, (side < 0 ? 'JBoxBoltL' : 'JBoxBoltR') + '1', new THREE.Vector3(0.03 * side, 0, 0), new THREE.Vector3(side, 0, 0));
    Torso.add(g);
    gillGroups[side] = g;
  }

  // dorsal fin
  const DORSAL_POS = new THREE.Vector3(0, 0.5, 0.05);
  const DORSAL_REST_RX = 0.12;
  const DorsalFin = new THREE.Group();
  DorsalFin.name = 'DorsalFin';
  DorsalFin.position.copy(DORSAL_POS);
  DorsalFin.rotation.set(DORSAL_REST_RX, Math.PI / 2, 0);
  const dorsalMesh = new THREE.Mesh(dorsalGeo, finMat);
  dorsalMesh.name = 'DorsalFinBlade';
  DorsalFin.add(dorsalMesh);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(boltGeo, hardwareMat);
    b.name = 'DorsalBaseBolt' + i;
    b.scale.setScalar(0.8);
    b.position.set(0.05 + i * 0.15, 0.02, -0.02);
    b.quaternion.setFromUnitVectors(AXIS_Y, new THREE.Vector3(0, 0, 1));
    DorsalFin.add(b);
  }
  Torso.add(DorsalFin);

  // pectoral fins
  const PECT_POS = { z: 0.15, y: -0.15, x: 0.5 };
  const PECT_REST_RX = -Math.PI / 2;
  const pectoralFins = {};
  for (const side of [-1, 1]) {
    const grp = new THREE.Group();
    grp.name = side < 0 ? 'PectoralFinLeft' : 'PectoralFinRight';
    grp.position.set(PECT_POS.x * side, PECT_POS.y, PECT_POS.z);
    grp.rotation.set(PECT_REST_RX, 0, 0.1 * side);
    const mesh = new THREE.Mesh(pectGeo, finMat);
    mesh.name = side < 0 ? 'PectoralFinBladeLeft' : 'PectoralFinBladeRight';
    if (side < 0) mesh.scale.x = -1;
    grp.add(mesh);
    Torso.add(grp);
    pectoralFins[side] = grp;
  }

  // ---- Head ----------------------------------------------------------
  const HEAD_POS = new THREE.Vector3(0, 0.02, 0.95);
  const Head = new THREE.Group();
  Head.name = 'Head';
  Head.position.copy(HEAD_POS);
  Torso.add(Head);

  makePanelBarrel(Head, 'HeadHull', 0.0, 0.75, 0.44, 0.36, 0.14, 0.12, 8, { material: skinMat });
  makePanelBarrel(Head, 'Snout', 0.75, 1.05, 0.14, 0.12, 0.015, 0.015, 6, { material: skinMat, faceBolt: false });

  const VentGrilleL = new THREE.Group(); VentGrilleL.name = 'VentGrilleLeft';
  const VentGrilleR = new THREE.Group(); VentGrilleR.name = 'VentGrilleRight';
  for (const [g, side] of [[VentGrilleL, -1], [VentGrilleR, 1]]) {
    g.position.set(0.28 * side, 0.10, 0.32);
    g.rotation.y = 1.15 * side;
    for (let i = 0; i < 4; i++) {
      const slat = new THREE.Mesh(makeBevelBoxGeo(0.09, 0.012, 0.008, 0.003), hardwareMat);
      slat.name = (side < 0 ? 'VentSlatLeft' : 'VentSlatRight') + i;
      slat.position.set(0, -0.05 + i * 0.033, 0);
      g.add(slat);
    }
    Head.add(g);
  }

  const eyes = {};
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), eyeMat);
    eye.name = side < 0 ? 'EyeLeft' : 'EyeRight';
    eye.position.set(0.30 * side, 0.16, 0.36);
    Head.add(eye);
    eyes[side] = eye;
  }

  // upper jaw
  const UPPERJAW_POS = new THREE.Vector3(0, -0.06, 0.5);
  const UpperJaw = new THREE.Group();
  UpperJaw.name = 'UpperJaw';
  UpperJaw.position.copy(UPPERJAW_POS);
  Head.add(UpperJaw);
  const upperJawMesh = new THREE.Mesh(makeBevelBoxGeo(0.5, 0.1, 0.5, 0.02), mouthMat);
  upperJawMesh.name = 'UpperJawPlate';
  upperJawMesh.position.set(0, -0.02, 0.15);
  UpperJaw.add(upperJawMesh);
  const TeethUpper = buildTeeth(9, 0.22, true, 0.12, 0.038);
  TeethUpper.name = 'TeethUpper';
  TeethUpper.position.set(0, -0.05, 0.38);
  UpperJaw.add(TeethUpper);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(boltGeo, hardwareMat);
    b.name = 'UpperJawBolt' + i;
    b.scale.setScalar(0.7);
    b.position.set(-0.19 + i * 0.13, -0.06, -0.06);
    b.quaternion.setFromUnitVectors(AXIS_Y, new THREE.Vector3(0, -1, 0));
    UpperJaw.add(b);
  }

  // lower jaw
  const LOWERJAW_POS = new THREE.Vector3(0, -0.14, 0.4);
  const LowerJaw = new THREE.Group();
  LowerJaw.name = 'LowerJaw';
  LowerJaw.position.copy(LOWERJAW_POS);
  Head.add(LowerJaw);
  const lowerJawMesh = new THREE.Mesh(makeBevelBoxGeo(0.46, 0.1, 0.55, 0.02), mouthMat);
  lowerJawMesh.name = 'LowerJawPlate';
  lowerJawMesh.position.set(0, 0, 0.2);
  LowerJaw.add(lowerJawMesh);
  const TeethLower = buildTeeth(8, 0.19, false, 0.11, 0.034);
  TeethLower.name = 'TeethLower';
  TeethLower.position.set(0, 0.04, 0.42);
  LowerJaw.add(TeethLower);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(boltGeo, hardwareMat);
    b.name = 'LowerJawBolt' + i;
    b.scale.setScalar(0.7);
    b.position.set(-0.17 + i * 0.12, -0.05, -0.02);
    b.quaternion.setFromUnitVectors(AXIS_Y, new THREE.Vector3(0, -1, 0));
    LowerJaw.add(b);
  }
  const HingePinLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), hardwareMat);
  HingePinLeft.name = 'HingePinLeft';
  HingePinLeft.position.set(-0.24, -0.09, 0.52);
  HingePinLeft.rotation.z = Math.PI / 2;
  Head.add(HingePinLeft);
  const HingePinRight = HingePinLeft.clone();
  HingePinRight.name = 'HingePinRight';
  HingePinRight.position.x = 0.24;
  Head.add(HingePinRight);

  // ---- TorsoMid --------------------------------------------------------
  const TORSOMID_POS = new THREE.Vector3(0, -0.02, -0.85);
  const TorsoMid = new THREE.Group();
  TorsoMid.name = 'TorsoMid';
  TorsoMid.position.copy(TORSOMID_POS);
  Torso.add(TorsoMid);

  makePanelBarrel(TorsoMid, 'TorsoMidHull', -0.55, 0.30, 0.20, 0.17, 0.30, 0.25, 8, { material: skinMat });

  // pelvic fins (reuse pectoral geometry, smaller)
  const PELVIC_POS = { x: 0.32, y: -0.18, z: -0.25 };
  const pelvicFins = {};
  for (const side of [-1, 1]) {
    const grp = new THREE.Group();
    grp.name = side < 0 ? 'PelvicFinLeft' : 'PelvicFinRight';
    grp.position.set(PELVIC_POS.x * side, PELVIC_POS.y, PELVIC_POS.z);
    grp.rotation.set(-Math.PI / 2, 0, 0.05 * side);
    grp.scale.setScalar(0.5);
    const mesh = new THREE.Mesh(pectGeo, finMat);
    mesh.name = side < 0 ? 'PelvicFinBladeLeft' : 'PelvicFinBladeRight';
    if (side < 0) mesh.scale.x = -1;
    grp.add(mesh);
    TorsoMid.add(grp);
    pelvicFins[side] = grp;
  }

  // anal fin (reuse dorsal geometry, small, mirrored downward)
  const ANALFIN_POS = new THREE.Vector3(0, -0.28, -0.75);
  const AnalFin = new THREE.Group();
  AnalFin.name = 'AnalFin';
  AnalFin.position.copy(ANALFIN_POS);
  AnalFin.rotation.set(0, Math.PI / 2, 0);
  AnalFin.scale.set(0.5, -0.45, 0.5);
  const analMesh = new THREE.Mesh(dorsalGeo, finMat);
  analMesh.name = 'AnalFinBlade';
  AnalFin.add(analMesh);
  TorsoMid.add(AnalFin);

  // ---- TailPeduncle ------------------------------------------------
  const PEDUNCLE_POS = new THREE.Vector3(0, 0, -0.95);
  const TailPeduncle = new THREE.Group();
  TailPeduncle.name = 'TailPeduncle';
  TailPeduncle.position.copy(PEDUNCLE_POS);
  TorsoMid.add(TailPeduncle);

  makePanelBarrel(TailPeduncle, 'PeduncleHull', -0.35, 0.40, 0.09, 0.08, 0.20, 0.17, 6, { material: skinMat, thickness: 0.024 });

  // ---- CaudalFin -----------------------------------------------------
  const CAUDAL_POS = new THREE.Vector3(0, 0, -0.7);
  const CaudalFin = new THREE.Group();
  CaudalFin.name = 'CaudalFin';
  CaudalFin.position.copy(CAUDAL_POS);
  TailPeduncle.add(CaudalFin);

  const CaudalUpperLobe = new THREE.Group();
  CaudalUpperLobe.name = 'CaudalUpperLobe';
  CaudalUpperLobe.rotation.set(-0.55, Math.PI / 2, 0);
  const upperLobeMesh = new THREE.Mesh(caudalUpperGeo, finMat);
  upperLobeMesh.name = 'CaudalUpperLobeBlade';
  CaudalUpperLobe.add(upperLobeMesh);
  CaudalFin.add(CaudalUpperLobe);

  const CaudalLowerLobe = new THREE.Group();
  CaudalLowerLobe.name = 'CaudalLowerLobe';
  CaudalLowerLobe.rotation.set(0.4, Math.PI / 2, 0);
  const lowerLobeMesh = new THREE.Mesh(caudalLowerGeo, finMat);
  lowerLobeMesh.name = 'CaudalLowerLobeBlade';
  CaudalLowerLobe.add(lowerLobeMesh);
  CaudalFin.add(CaudalLowerLobe);

  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(boltGeo, hardwareMat);
    b.name = 'CaudalBaseBolt' + i;
    b.scale.setScalar(0.75);
    b.position.set(0, -0.03 + i * 0.03, 0.02);
    b.quaternion.setFromUnitVectors(AXIS_Y, new THREE.Vector3(0, 0, 1));
    CaudalFin.add(b);
  }

  // ---------------------------------------------------------------------
  // HARNESS — hoses & wires (own pass, all routed in Torso-local space)
  // ---------------------------------------------------------------------
  const Harness = new THREE.Group();
  Harness.name = 'Harness';
  Torso.add(Harness);

  const P = {
    snoutTip: [0, 0.03, 1.98], jawPort: [0, -0.08, 1.65], chin: [0, -0.15, 1.55],
    headTop: [0, 0.30, 1.30], headSideL: [-0.30, 0.10, 1.25], headSideR: [0.30, 0.10, 1.25],
    torsoTopFront: [0, 0.42, 0.55], torsoTopMid: [0, 0.51, 0.05], torsoSpineMid: [0, 0.45, -0.45],
    dorsalBase: [0, 0.51, 0.05],
    gillL: [-0.56, 0.03, 0.55], gillR: [0.56, 0.03, 0.55],
    gillLTop: [-0.56, 0.15, 0.62], gillRTop: [0.56, 0.15, 0.62], gillMidBelly: [0, -0.15, 0.62],
    pectL: [-0.5, -0.15, 0.15], pectR: [0.5, -0.15, 0.15],
    pectMidL: [-0.55, -0.05, 0.35], pectMidR: [0.55, -0.05, 0.35],
    torsoBelly: [0, -0.55, 0.0], torsoBellyMidL: [-0.3, -0.5, 0.1], torsoBellyMidR: [0.3, -0.5, 0.1],
    torsoBellyBack: [0, -0.5, -0.5], torsoMidBelly: [0, -0.37, -1.05],
    pelvicL: [-0.32, -0.20, -1.10], pelvicR: [0.32, -0.20, -1.10],
    analBase: [0, -0.30, -1.60], analMid: [0, -0.15, -1.90],
    peduncleTop: [0, 0.13, -2.10], peduncleBelly: [0, -0.15, -1.95],
    caudalBase: [0, -0.02, -2.50], caudalUpTip: [0, 0.35, -2.90], caudalLowTip: [0, -0.30, -2.75]
  };

  const routes = [
    ['HoseSnoutToGillL', [P.snoutTip, P.headSideL, P.gillLTop, P.gillL], 0.020, true],
    ['HoseSnoutToGillR', [P.snoutTip, P.headSideR, P.gillRTop, P.gillR], 0.020, true],
    ['WireJawToTorsoTop', [P.jawPort, P.headTop, P.torsoTopFront], 0.009, false],
    ['HoseGillLToPectL', [P.gillL, P.pectMidL, P.pectL], 0.022, true],
    ['HoseGillRToPectR', [P.gillR, P.pectMidR, P.pectR], 0.022, true],
    ['HoseHeadToDorsal', [P.headTop, P.torsoTopFront, P.torsoTopMid, P.dorsalBase], 0.020, true],
    ['WireDorsalToCaudal', [P.dorsalBase, P.torsoSpineMid, P.peduncleTop, P.caudalBase], 0.009, false],
    ['HosePectLToBelly', [P.pectL, P.torsoBellyMidL, P.torsoBelly], 0.018, true],
    ['HosePectRToBelly', [P.pectR, P.torsoBellyMidR, P.torsoBelly], 0.018, true],
    ['HoseBellyToPelvicL', [P.torsoBelly, P.torsoMidBelly, P.pelvicL], 0.020, true],
    ['HoseBellyToPelvicR', [P.torsoBelly, P.torsoMidBelly, P.pelvicR], 0.020, true],
    ['HosePelvicLToAnal', [P.pelvicL, P.analBase], 0.016, true],
    ['HosePelvicRToAnal', [P.pelvicR, P.analBase], 0.016, true],
    ['HoseAnalToPeduncle', [P.analBase, P.analMid, P.peduncleTop], 0.018, true],
    ['HosePeduncleToCaudal', [P.peduncleTop, P.caudalBase, P.caudalUpTip], 0.016, true],
    ['WireCaudalCross', [P.caudalUpTip, P.caudalBase, P.caudalLowTip], 0.008, false],
    ['HoseGillCross', [P.gillL, P.gillMidBelly, P.gillR], 0.014, true],
    ['HoseHeadCross', [P.headTop, [0, 0.20, 0.90], P.torsoTopFront], 0.014, true],
    ['WireSpineToAnal', [P.torsoSpineMid, P.torsoMidBelly, P.analBase], 0.008, false],
    ['HosePeduncleBellyToCaudal', [P.peduncleBelly, P.caudalBase], 0.016, true],
    ['HoseBellyLongitudinal', [P.torsoBelly, P.torsoBellyBack, P.torsoMidBelly], 0.018, true],
    ['WireTopLongitudinal', [P.torsoTopFront, P.torsoTopMid, P.torsoSpineMid], 0.008, false],
    ['HoseChinToGillL', [P.chin, [-0.30, 0.10, 0.9], P.gillL], 0.014, true],
    ['WireGillCrossLower', [P.gillMidBelly, [0, -0.25, 0.30], P.torsoBelly], 0.008, false]
  ];
  for (const [name, pts, r, corr] of routes) addHose(Harness, name, pts, r, corr);

  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const pt = new THREE.Vector3().lerpVectors(
      new THREE.Vector3(...P.dorsalBase), new THREE.Vector3(...P.peduncleTop), t);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.005, 5, 8), hardwareMat);
    tie.name = 'CableTie' + i;
    tie.position.copy(pt);
    tie.rotation.x = Math.PI / 2;
    Harness.add(tie);
  }

  const GrabHandle = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, 0.53, 0.05), new THREE.Vector3(0, 0.60, 0.05), new THREE.Vector3(0.1, 0.53, 0.05)
    ]), 12, 0.014, 6, false),
    hardwareMat
  );
  GrabHandle.name = 'GrabHandle';
  Torso.add(GrabHandle);

  // =======================================================================
  // POSE FUNCTION
  // =======================================================================
  Shark.userData.pose = (s) => {
    const speed = s.speed || 0;
    const stride = s.stride || 0;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = (s.health === undefined) ? 1 : s.health;
    const action = s.action || null;
    const phase = s.phase || 0;
    const t = s.t || 0;

    // reset accumulators for every part (delta from rest)
    let torsoPos = new THREE.Vector3(0, 0, 0);
    let torsoRot = new THREE.Euler(0, 0, 0);
    let headPos = new THREE.Vector3(0, 0, 0);
    let headRot = new THREE.Euler(0, 0, 0);
    let upperJawRot = new THREE.Euler(0, 0, 0);
    let lowerJawRot = new THREE.Euler(0, 0, 0);
    let torsoMidRot = new THREE.Euler(0, 0, 0);
    let peduncleRot = new THREE.Euler(0, 0, 0);
    let caudalRot = new THREE.Euler(0, 0, 0);
    let dorsalRot = new THREE.Euler(DORSAL_REST_RX, Math.PI / 2, 0);
    let pectRot = { '-1': new THREE.Euler(PECT_REST_RX, 0, 0.1 * -1), '1': new THREE.Euler(PECT_REST_RX, 0, 0.1) };
    let pelvicRot = { '-1': new THREE.Euler(-Math.PI / 2, 0, 0.05 * -1), '1': new THREE.Euler(-Math.PI / 2, 0, 0.05) };

    // ---------------------------------------------------------------
    // 1. SWIM WAVE (from stride, distance-driven) or idle (from t)
    // ---------------------------------------------------------------
    const sp = Math.max(0, speed);
    const idleBlend = clamp01(1 - sp / 0.15); // 1 at stand, 0 once moving

    const stridePhase = stride * TAU;
    const wHead = Math.sin(stridePhase);
    const wMid = Math.sin(stridePhase - 1.1);
    const wPed = Math.sin(stridePhase - 2.0);
    const wCaud = Math.sin(stridePhase - 2.7);

    const idleWave = Math.sin(t * 1.1);

    // amplitude profile across the speed grid
    const t01 = clamp01(sp / 2);
    const t26 = clamp01((sp - 2) / 4);
    const creep = clamp01(1 - Math.abs(sp - 0.4) / 0.6);

    const ampHead = lerp(0.09, 0.03, t01);
    const ampMid = lerp(0.05, 0.16, t01) * (1 - 0.4 * t26);
    const ampPed = lerp(0.10, 0.30, t01) * lerp(1, 1.35, t26);
    const ampCaud = lerp(0.16, 0.42, t01) * lerp(1, 1.55, t26);
    const pectFold = lerp(0.05, 0.95, t26);
    const bodyStretch = lerp(0, 0.16, t26);

    let headYaw = idleBlend * (-idleWave * 0.10) + (1 - idleBlend) * (-ampHead * wHead);
    let midYaw = (1 - idleBlend) * (ampMid * wMid) + idleBlend * (idleWave * 0.02);
    let pedYaw = (1 - idleBlend) * (ampPed * wPed) + idleBlend * (idleWave * 0.05);
    let caudYaw = (1 - idleBlend) * (ampCaud * wCaud) + idleBlend * (idleWave * 0.08);

    // gathered low stance for slow creep (move-0.5)
    torsoPos.y -= creep * 0.05;
    torsoRot.x += creep * 0.03;

    // stretch/streamline at high speed
    headPos.z += bodyStretch * 0.15;
    torsoRot.x -= bodyStretch * 0.08; // nose-down flatten

    // pectoral fins: neutral splay at low speed, folded back at high speed
    for (const side of [-1, 1]) {
      const key = String(side);
      pectRot[key] = new THREE.Euler(
        PECT_REST_RX + pectFold * 0.5,
        pectFold * 0.6 * side,
        0.1 * side + Math.sin(t * 1.5 + side) * 0.03 * idleBlend
      );
    }

    headRot.y += headYaw;
    torsoMidRot.y += midYaw;
    peduncleRot.y += pedYaw;
    caudalRot.y += caudYaw * 1.1;

    // breathing / idle chest motion at stand
    torsoPos.y += idleBlend * Math.sin(t * 1.7) * 0.012;
    for (const side of [-1, 1]) {
      gillGroups[side].scale.setScalar(1 + idleBlend * 0.04 * Math.sin(t * 2.2 + side));
    }

    // ---------------------------------------------------------------
    // 2. TURN OVERLAY (additive, difference from standing)
    // ---------------------------------------------------------------
    torsoRot.z += -turn * 0.28;
    headRot.y += turn * 0.35;
    headRot.z += -turn * 0.12;
    torsoMidRot.y += -turn * 0.18;
    peduncleRot.y += -turn * 0.32;
    caudalRot.y += -turn * 0.4;
    for (const side of [-1, 1]) {
      const key = String(side);
      const towardTurn = -turn * side;
      pectRot[key].x += clamp01(towardTurn) * 0.5;
      pectRot[key].z += -turn * 0.15;
    }

    // ---------------------------------------------------------------
    // 3. AIRBORNE OVERLAY — controlled breach pose, stop the stroke
    // ---------------------------------------------------------------
    if (!grounded) {
      const arch = 0.35 + Math.sin(t * 4.0) * 0.03;
      torsoRot.x = -arch * 0.5;
      headRot.x = -0.25;
      torsoMidRot.y = 0;
      peduncleRot.y = 0;
      caudalRot.y = Math.sin(t * 5.0) * 0.15;
      peduncleRot.x = arch * 0.6;
      torsoMidRot.x = arch * 0.4;
      for (const side of [-1, 1]) {
        const key = String(side);
        pectRot[key] = new THREE.Euler(PECT_REST_RX + 0.4, 0.5 * side, 0.1 * side);
      }
    }

    // ---------------------------------------------------------------
    // 4. HURT OVERLAY — favour a side, sag
    // ---------------------------------------------------------------
    const hurtT = clamp01(1 - health);
    torsoRot.z += hurtT * 0.18;
    headRot.z += hurtT * 0.22;
    headRot.x += hurtT * 0.15;
    headPos.y -= hurtT * 0.05;
    pectRot['1'].x += hurtT * 0.3;
    caudYaw *= (1 - hurtT * 0.4);
    caudalRot.y = caudYaw;

    // ---------------------------------------------------------------
    // 5. ACTIONS — override / layer on top when active
    // ---------------------------------------------------------------
    if (action) {
      const p = clamp01(phase);
      function smoothstepJS(a, b, x) {
        const k = clamp01((x - a) / (b - a));
        return k * k * (3 - 2 * k);
      }
      const ease = (a, b, x) => smoothstepJS(a, b, x);

      if (action === 'attack') {
        const windup = ease(0, 0.35, p) * (1 - ease(0.35, 0.4, p));
        const commit = ease(0.3, 0.5, p) * (1 - ease(0.55, 0.9, p));
        const recover = ease(0.55, 1.0, p);
        torsoPos.z += -windup * 0.12 + commit * 0.28 - recover * 0.16;
        headPos.z += -windup * 0.05 + commit * 0.22;
        headRot.x = windup * 0.15 - commit * 0.25;
        const jawOpen = clamp01(windup * 1.4 - commit * 0.6);
        lowerJawRot.x = jawOpen * 1.0 + commit * 0.15;
        caudalRot.y += commit * 0.4 * Math.sin(p * 30);
        pedYaw += commit * 0.3 * Math.sin(p * 30);
        peduncleRot.y = pedYaw;
      } else if (action === 'fire') {
        const aim = ease(0, 0.3, p) * (1 - ease(0.3, 0.35, p));
        const release = ease(0.3, 0.45, p) * (1 - ease(0.45, 0.7, p));
        const recoil = ease(0.45, 1.0, p);
        headRot.x = -aim * 0.08 + release * 0.18 - recoil * 0.05;
        lowerJawRot.x = release * 0.85;
        headPos.z += release * 0.06 - recoil * 0.08;
      } else if (action === 'hit') {
        const rise = ease(0, 0.08, p);
        const fall = 1 - ease(0.08, 0.4, p);
        const inten = rise * fall;
        headRot.y += inten * 0.35;
        headRot.z += inten * 0.25;
        torsoRot.z += inten * 0.2;
        torsoPos.x += inten * 0.08;
      } else if (action === 'block') {
        const brace = ease(0, 0.25, p) * (1 - ease(0.85, 1.0, p) * 0.3);
        torsoPos.z -= brace * 0.15;
        torsoPos.y -= brace * 0.04;
        headPos.z -= brace * 0.1;
        headRot.x += brace * 0.2;
        for (const side of [-1, 1]) {
          const key = String(side);
          pectRot[key] = new THREE.Euler(PECT_REST_RX + brace * 0.6, brace * 0.4 * side, 0.1 * side);
        }
        lowerJawRot.x = brace * 0.05;
      } else if (action === 'gather') {
        const down = ease(0, 0.4, p) * (1 - ease(0.85, 1.0, p));
        const grab = ease(0.35, 0.55, p) * (1 - ease(0.6, 0.75, p));
        const up = ease(0.55, 1.0, p);
        headRot.x = down * 0.55 - up * 0.55;
        torsoRot.x = down * 0.2 - up * 0.2;
        torsoPos.y = -down * 0.15 + up * 0.15;
        lowerJawRot.x = grab * 0.9 + down * 0.3;
      } else if (action === 'deposit') {
        const down = ease(0, 0.5, p) * (1 - ease(0.9, 1.0, p));
        const release = ease(0.5, 0.7, p) * (1 - ease(0.75, 0.85, p));
        const up = ease(0.7, 1.0, p);
        headRot.x = down * 0.5 - up * 0.5;
        torsoRot.x = down * 0.18 - up * 0.18;
        torsoPos.y = -down * 0.14 + up * 0.14;
        lowerJawRot.x = release * 0.7;
      } else if (action === 'eat') {
        const env = Math.sin(p * Math.PI);
        headRot.x = env * 0.45;
        torsoRot.x = env * 0.12;
        const chew = Math.sin(p * Math.PI * 2 * 3) * 0.5 + 0.5;
        lowerJawRot.x = env * chew * 0.7;
      } else if (action === 'drink') {
        const down = ease(0, 0.3, p) * (1 - ease(0.7, 1.0, p));
        headRot.x = down * 0.5;
        torsoRot.x = down * 0.1;
        lowerJawRot.x = down * 0.1 + Math.sin(p * Math.PI * 4) * 0.03 * down;
      } else if (action === 'jump') {
        const crouch = ease(0, 0.33, p) * (1 - ease(0.3, 0.36, p));
        const extend = ease(0.33, 1.0, p);
        torsoPos.y = -crouch * 0.1 + extend * 0.05;
        torsoRot.x = crouch * 0.15 - extend * 0.25;
        headRot.x = -extend * 0.15;
        peduncleRot.y = 0;
        caudalRot.y = -crouch * 0.3 + extend * 0.1;
        for (const side of [-1, 1]) {
          const key = String(side);
          pectRot[key] = new THREE.Euler(PECT_REST_RX + extend * 0.5, extend * 0.3 * side, 0.1 * side);
        }
      } else if (action === 'land') {
        const reach = ease(0, 0.4, p) * (1 - ease(0.38, 0.44, p));
        const impact = ease(0.4, 0.55, p) * (1 - ease(0.6, 0.7, p));
        const recover = ease(0.55, 1.0, p);
        torsoRot.x = -reach * 0.2 + impact * 0.3 - recover * 0.1;
        torsoPos.y = -impact * 0.12 + recover * 0.12;
        headRot.x = -reach * 0.1 + impact * 0.2;
      } else if (action === 'signal') {
        const rise = ease(0, 0.3, p) * (1 - ease(0.7, 1.0, p));
        const hold = ease(0.3, 0.45, p) * (1 - ease(0.65, 0.7, p));
        torsoRot.x = -rise * 0.2;
        headRot.x = -rise * 0.25;
        lowerJawRot.x = hold * 0.9;
        for (const side of [-1, 1]) {
          const key = String(side);
          pectRot[key] = new THREE.Euler(PECT_REST_RX - rise * 0.3, rise * 0.5 * side, 0.1 * side);
        }
        dorsalRot.x = DORSAL_REST_RX + rise * 0.15;
      } else if (action === 'sleep') {
        const k = ease(0, 1, p);
        torsoPos.y = -k * 0.28;
        torsoRot.x = k * 0.35;
        headPos.y = -k * 0.05;
        headRot.x = k * 0.4;
        torsoMidRot.y = 0;
        peduncleRot.y = 0;
        caudalRot.y = Math.sin(t * 0.4) * 0.03 * (1 - k);
        for (const side of [-1, 1]) {
          const key = String(side);
          pectRot[key] = new THREE.Euler(PECT_REST_RX + k * 0.7, k * 0.3 * side, 0.1 * side);
        }
        lowerJawRot.x = 0;
      } else if (action === 'wake') {
        const k = ease(0, 1, p);
        const kk = 1 - k;
        torsoPos.y = -kk * 0.28 + Math.sin(p * 10) * 0.01 * kk;
        torsoRot.x = kk * 0.35;
        headPos.y = -kk * 0.05;
        headRot.x = kk * 0.4;
        for (const side of [-1, 1]) {
          const key = String(side);
          pectRot[key] = new THREE.Euler(PECT_REST_RX + kk * 0.7, kk * 0.3 * side, 0.1 * side);
        }
      } else if (action === 'die') {
        const k = ease(0, 0.75, p);
        const twitch = Math.exp(-p * 6) * Math.sin(p * 24) * (1 - k);
        torsoRot.z = k * 2.6;
        torsoRot.x = k * 0.3;
        torsoPos.y = -k * 0.25;
        headRot.x = k * 0.5;
        lowerJawRot.x = k * 0.5;
        caudalRot.y = twitch * 0.3;
        peduncleRot.y = twitch * 0.2;
        for (const side of [-1, 1]) {
          const key = String(side);
          pectRot[key] = new THREE.Euler(PECT_REST_RX + k * 0.6, 0, 0.1 * side + k * 0.3 * side);
        }
        dorsalRot.x = DORSAL_REST_RX + k * 0.3;
      } else if (action === 'evolve') {
        const brace = ease(0, 0.3, p) * (1 - ease(0.28, 0.32, p));
        const holdOpen = ease(0.3, 0.45, p) - ease(0.7, 0.85, p);
        torsoRot.x = brace * 0.15;
        headRot.x = -Math.max(holdOpen, 0) * 0.2;
        lowerJawRot.x = Math.max(holdOpen, 0) * 1.1;
        torsoMidRot.x = Math.max(holdOpen, 0) * 0.15;
        for (const side of [-1, 1]) {
          const key = String(side);
          pectRot[key] = new THREE.Euler(
            PECT_REST_RX - Math.max(holdOpen, 0) * 0.4,
            Math.max(holdOpen, 0) * 0.7 * side,
            0.1 * side
          );
        }
        dorsalRot.x = DORSAL_REST_RX + Math.max(holdOpen, 0) * 0.25;
      }
    }

    // ---------------------------------------------------------------
    // APPLY
    // ---------------------------------------------------------------
    Torso.position.set(torsoPos.x, torsoPos.y, torsoPos.z);
    Torso.rotation.set(torsoRot.x, torsoRot.y, torsoRot.z);

    Head.position.set(HEAD_POS.x + headPos.x, HEAD_POS.y + headPos.y, HEAD_POS.z + headPos.z);
    Head.rotation.set(headRot.x, headRot.y, headRot.z);

    UpperJaw.rotation.set(upperJawRot.x, upperJawRot.y, upperJawRot.z);
    LowerJaw.rotation.set(lowerJawRot.x, lowerJawRot.y, lowerJawRot.z);

    TorsoMid.rotation.set(torsoMidRot.x, torsoMidRot.y, torsoMidRot.z);
    TailPeduncle.rotation.set(peduncleRot.x, peduncleRot.y, peduncleRot.z);
    CaudalFin.rotation.set(caudalRot.x, caudalRot.y, caudalRot.z);

    DorsalFin.rotation.set(dorsalRot.x, dorsalRot.y, dorsalRot.z);

    pectoralFins['-1'].rotation.copy(pectRot['-1']);
    pectoralFins['1'].rotation.copy(pectRot['1']);

    const pelvicSway = Math.sin(stridePhase - 1.6) * 0.1 * (1 - idleBlend);
    pelvicFins['-1'].rotation.set(pelvicRot['-1'].x + pelvicSway, pelvicRot['-1'].y, pelvicRot['-1'].z);
    pelvicFins['1'].rotation.set(pelvicRot['1'].x - pelvicSway, pelvicRot['1'].y, pelvicRot['1'].z);
  };

  return Shark;
}
;return build(THREE, TSL);