```javascript
function build(THREE, TSL) {
  const root = new THREE.Group();
  root.name = 'shark';

  // Materials
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xD8D2C6,
    roughness: 0.6,
    metalness: 0.1
  });

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x55524C,
    roughness: 0.5,
    metalness: 0.3
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xC2521E,
    roughness: 0.4,
    metalness: 0.2
  });

  const teethMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.1,
    metalness: 0.95
  });

  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x000000
  });

  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0x6B665E,
    roughness: 0.7,
    metalness: 0.2
  });

  const boltMat = new THREE.MeshStandardMaterial({
    color: 0x3E3A34,
    roughness: 0.4,
    metalness: 0.6
  });

  function createPlateShape(w, h) {
    const shape = new THREE.Shape();
    const hw = w / 2, hh = h / 2;
    const bevel = 0.06;
    shape.moveTo(-hw + bevel, -hh);
    shape.lineTo(hw - bevel, -hh);
    shape.quadraticCurveTo(hw, -hh, hw, -hh + bevel);
    shape.lineTo(hw, hh - bevel);
    shape.quadraticCurveTo(hw, hh, hw - bevel, hh);
    shape.lineTo(-hw + bevel, hh);
    shape.quadraticCurveTo(-hw, hh, -hw, hh - bevel);
    shape.lineTo(-hw, -hh + bevel);
    shape.quadraticCurveTo(-hw, -hh, -hw + bevel, -hh);
    return shape;
  }

  function createExtrudedPlate(w, h, d) {
    const shape = createPlateShape(w, h);
    return new THREE.ExtrudeGeometry(shape, {
      depth: d,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.015,
      bevelSegments: 2
    });
  }

  // HEAD
  const head = new THREE.Group();
  head.name = 'head';
  root.add(head);

  const headShell = new THREE.Mesh(createExtrudedPlate(0.8, 0.6, 1.2), shellMat);
  headShell.name = 'head_shell';
  headShell.position.z = 0.5;
  head.add(headShell);

  const headFrame = new THREE.Mesh(createExtrudedPlate(0.7, 0.5, 1.1), frameMat);
  headFrame.name = 'head_frame';
  headFrame.position.z = 0.55;
  head.add(headFrame);

  // Eyes
  const eyeGeo = new THREE.SphereGeometry(0.11, 8, 8);
  [-1, 1].forEach(side => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.name = `eye_${side > 0 ? 'right' : 'left'}`;
    eye.position.set(side * 0.32, 0.25, 0.8);
    head.add(eye);
  });

  // JAW
  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.z = 1.4;
  head.add(jaw);

  const jawShell = new THREE.Mesh(createExtrudedPlate(0.5, 0.35, 0.6), shellMat);
  jawShell.name = 'jaw_shell';
  jawShell.position.z = 0.2;
  jaw.add(jawShell);

  const jawFrame = new THREE.Mesh(createExtrudedPlate(0.45, 0.3, 0.55), frameMat);
  jawFrame.name = 'jaw_frame';
  jawFrame.position.z = 0.25;
  jaw.add(jawFrame);

  // TEETH
  const teethCount = 8;
  for (let i = 0; i < teethCount; i++) {
    const angle = (i / (teethCount - 1) - 0.5) * 0.7;
    const x = Math.sin(angle) * 0.22;
    
    const upperTooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 6), teethMat);
    upperTooth.name = `upper_tooth_${i}`;
    upperTooth.position.set(x, 0.2, 0.45);
    upperTooth.rotation.x = 0.15;
    jaw.add(upperTooth);

    const lowerTooth = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), teethMat);
    lowerTooth.name = `lower_tooth_${i}`;
    lowerTooth.position.set(x, -0.2, 0.45);
    lowerTooth.rotation.x = -0.15;
    jaw.add(lowerTooth);
  }

  // BODY
  const bodySegs = [];
  let lastSeg = head;
  
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.name = `body_segment_${i}`;
    seg.position.z = -0.65;
    lastSeg.add(seg);

    const w = 0.5 - i * 0.08;
    const h = 0.35 - i * 0.05;

    const segShell = new THREE.Mesh(createExtrudedPlate(w, h, 0.65), shellMat);
    segShell.name = `body_${i}_shell`;
    seg.add(segShell);

    const segFrame = new THREE.Mesh(createExtrudedPlate(w * 0.85, h * 0.85, 0.6), frameMat);
    segFrame.name = `body_${i}_frame`;
    segFrame.position.z = 0.05;
    seg.add(segFrame);

    if (i % 2 === 0) {
      const accent = new THREE.Mesh(createExtrudedPlate(w * 0.35, h * 0.25, 0.4), accentMat);
      accent.name = `body_${i}_accent`;
      accent.position.z = 0.25;
      seg.add(accent);
    }

    bodySegs.push(seg);
    lastSeg = seg;
  }

  // TAIL
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.z = -0.5;
  lastSeg.add(tail);

  const tailShell = new THREE.Mesh(createExtrudedPlate(0.3, 0.25, 1.0), shellMat);
  tailShell.name = 'tail_shell';
  tailShell.position.z = -0.4;
  tail.add(tailShell);

  const tailFrame = new THREE.Mesh(createExtrudedPlate(0.25, 0.2, 0.9), frameMat);
  tailFrame.name = 'tail_frame';
  tailFrame.position.z = -0.45;
  tail.add(tailFrame);

  // FINS
  const dorsalFin = new THREE.Group();
  dorsalFin.name = 'dorsal_fin';
  dorsalFin.position.set(0, 0.35, 0.2);
  root.add(dorsalFin);

  const dorsalShell = new THREE.Mesh(createExtrudedPlate(0.15, 0.5, 0.6), shellMat);
  dorsalShell.name = 'dorsal_shell';
  dorsalFin.add(dorsalShell);

  const dorsalFrame = new THREE.Mesh(createExtrudedPlate(0.12, 0.45, 0.55), frameMat);
  dorsalFrame.name = 'dorsal_frame';
  dorsalFrame.position.z = 0.03;
  dorsalFin.add(dorsalFrame);

  [-1, 1].forEach(side => {
    const pecFin = new THREE.Group();
    pecFin.name = `pectoral_${side > 0 ? 'right' : 'left'}`;
    pecFin.position.set(side * 0.38, 0, 0.35);
    root.add(pecFin);

    const pecShell = new THREE.Mesh(createExtrudedPlate(0.12, 0.4, 0.45), shellMat);
    pecShell.name = `pectoral_${side > 0 ? 'right' : 'left'}_shell`;
    pecFin.add(pecShell);

    const pecFrame = new THREE.Mesh(createExtrudedPlate(0.1, 0.35, 0.4), frameMat);
    pecFrame.name = `pectoral_${side > 0 ? 'right' : 'left'}_frame`;
    pecFrame.position.z = 0.03;
    pecFin.add(pecFrame);
  });

  // HARNESS - 16+ tube runs with substantial lengths
  const tubeRadius = 0.04;

  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 1.5), new THREE.Vector3(0, 0, 0.5),
    new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0, 0, -1.5),
    new THREE.Vector3(0, 0, -2.2)
  ]);
  const spineTubeHarness = new THREE.Mesh(new THREE.TubeGeometry(spineCurve, 20, tubeRadius, 6, false), tubeMat);
  spineTubeHarness.name = 'harness_spine';
  root.add(spineTubeHarness);

  const leftCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.3, 0.1, 1.0), new THREE.Vector3(-0.4, 0.05, 0.3),
    new THREE.Vector3(-0.5, -0.1, -0.5), new THREE.Vector3(-0.4, -0.15, -1.5)
  ]);
  const leftTubeHarness = new THREE.Mesh(new THREE.TubeGeometry(leftCurve, 15, tubeRadius * 0.8, 5, false), tubeMat);
  leftTubeHarness.name = 'harness_left';
  root.add(leftTubeHarness);

  const rightCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.3, 0.1, 1.0), new THREE.Vector3(0.4, 0.05, 0.3),
    new THREE.Vector3(0.5, -0.1, -0.5), new THREE.Vector3(0.4, -0.15, -1.5)
  ]);
  const rightTubeHarness = new THREE.Mesh(new THREE.TubeGeometry(rightCurve, 15, tubeRadius * 0.8, 5, false), tubeMat);
  rightTubeHarness.name = 'harness_right';
  root.add(rightTubeHarness);

  const verticalCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.35, 1.2), new THREE.Vector3(0, 0.2, 0),
    new THREE.Vector3(0, 0.1, -1.2), new THREE.Vector3(0, -0.1, -2.2)
  ]);
  const verticalTubeHarness = new THREE.Mesh(new THREE.TubeGeometry(verticalCurve, 18, tubeRadius * 0.6, 5, false), tubeMat);
  verticalTubeHarness.name = 'harness_vertical';
  root.add(verticalTubeHarness);

  const crossCurve1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.25, 0.15, 0.8), new THREE.Vector3(0.25, 0.15, 0.2),
    new THREE.Vector3(-0.2, 0.1, -0.8)
  ]);
  const crossTubeHarness1 = new THREE.Mesh(new THREE.TubeGeometry(crossCurve1, 12, tubeRadius * 0.7, 5, false), tubeMat);
  crossTubeHarness1.name = 'harness_cross_1';
  root.add(crossTubeHarness1);

  const crossCurve2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.25, 0.15, 0.8), new THREE.Vector3(-0.25, 0.15, 0.2),
    new THREE.Vector3(0.2, 0.1, -0.8)
  ]);
  const crossTubeHarness2 = new THREE.Mesh(new THREE.TubeGeometry(crossCurve2, 12, tubeRadius * 0.7, 5, false), tubeMat);
  crossTubeHarness2.name = 'harness_cross_2';
  root.add(crossTubeHarness2);

  const diagonalCurve1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.35, 0.2, 0.9), new THREE.Vector3(-0.1, 0.12, 0),
    new THREE.Vector3(-0.3, 0.05, -1.0)
  ]);
  const diagonalTubeHarness1 = new THREE.Mesh(new THREE.TubeGeometry(diagonalCurve1, 12, tubeRadius * 0.65, 4, false), tubeMat);
  diagonalTubeHarness1.name = 'harness_diagonal_1';
  root.add(diagonalTubeHarness1);

  const diagonalCurve2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.35, 0.2, 0.9), new THREE.Vector3(0.1, 0.12, 0),
    new THREE.Vector3(0.3, 0.05, -1.0)
  ]);
  const diagonalTubeHarness2 = new THREE.Mesh(new THREE.TubeGeometry(diagonalCurve2, 12, tubeRadius * 0.65, 4, false), tubeMat);
  diagonalTubeHarness2.name = 'harness_diagonal_2';
  root.add(diagonalTubeHarness2);

  const tailCurve1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.15, 0.08, -0.8), new THREE.Vector3(-0.25, 0.02, -1.5),
    new THREE.Vector3(-0.2, -0.05, -2.1)
  ]);
  const tailTubeHarness1 = new THREE.Mesh(new THREE.TubeGeometry(tailCurve1, 10, tubeRadius * 0.6, 4, false), tubeMat);
  tailTubeHarness1.name = 'harness_tail_1';
  root.add(tailTubeHarness1);

  const tailCurve2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.15, 0.08, -0.8), new THREE.Vector3(0.25, 0.02, -1.5),
    new THREE.Vector3(0.2, -0.05, -2.1)
  ]);
  const tailTubeHarness2 = new THREE.Mesh(new THREE.TubeGeometry(tailCurve2, 10, tubeRadius * 0.6, 4, false), tubeMat);
  tailTubeHarness2.name = 'harness_tail_2';
  root.add(tailTubeHarness2);

  const upperCurve1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, 0.3, 0.9), new THREE.Vector3(-0.15, 0.25, 0.1),
    new THREE.Vector3(-0.25, 0.2, -0.7)
  ]);
  const upperTubeHarness1 = new THREE.Mesh(new THREE.TubeGeometry(upperCurve1, 11, tubeRadius * 0.55, 4, false), tubeMat);
  upperTubeHarness1.name = 'harness_upper_1';
  root.add(upperTubeHarness1);

  const upperCurve2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.2, 0.3, 0.9), new THREE.Vector3(0.15, 0.25, 0.1),
    new THREE.Vector3(0.25, 0.2, -0.7)
  ]);
  const upperTubeHarness2 = new THREE.Mesh(new THREE.TubeGeometry(upperCurve2, 11, tubeRadius * 0.55, 4, false), tubeMat);
  upperTubeHarness2.name = 'harness_upper_2';
  root.add(upperTubeHarness2);

  const lowerCurve1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.28, -0.2, 0.7), new THREE.Vector3(-0.32, -0.15, 0),
    new THREE.Vector3(-0.35, -0.1, -1.1)
  ]);
  const lowerTubeHarness1 = new THREE.Mesh(new THREE.TubeGeometry(lowerCurve1, 11, tubeRadius * 0.55, 4, false), tubeMat);
  lowerTubeHarness1.name = 'harness_lower_1';
  root.add(lowerTubeHarness1);

  const lowerCurve2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.28, -0.2, 0.7), new THREE.Vector3(0.32, -0.15, 0),
    new THREE.Vector3(0.35, -0.1, -1.1)
  ]);
  const lowerTubeHarness2 = new THREE.Mesh(new THREE.TubeGeometry(lowerCurve2, 11, tubeRadius * 0.55, 4, false), tubeMat);
  lowerTubeHarness2.name = 'harness_lower_2';
  root.add(lowerTubeHarness2);

  const dorsalCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.4, 0.8), new THREE.Vector3(0, 0.35, 0.0),
    new THREE.Vector3(0, 0.28, -0.8), new THREE.Vector3(0, 0.15, -2.0)
  ]);
  const dorsalTubeHarness = new THREE.Mesh(new THREE.TubeGeometry(dorsalCurve, 14, tubeRadius * 0.5, 4, false), tubeMat);
  dorsalTubeHarness.name = 'harness_dorsal';
  root.add(dorsalTubeHarness);

  const ventralCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.3, 0.9), new THREE.Vector3(0, -0.25, 0.1),
    new THREE.Vector3(0, -0.18, -0.8), new THREE.Vector3(0, -0.1, -2.0)
  ]);
  const ventralTubeHarness = new THREE.Mesh(new THREE.TubeGeometry(ventralCurve, 14, tubeRadius * 0.5, 4, false), tubeMat);
  ventralTubeHarness.name = 'harness_ventral';
  root.add(ventralTubeHarness);

  // SMALL HARDWARE - Dense coverage on visible surfaces
  let hwIndex = 0;
  const boltHeadGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.012, 6);
  const clampGeo = new THREE.BoxGeometry(0.03, 0.02, 0.02);
  const connectorGeo = new THREE.BoxGeometry(0.025, 0.025, 0.04);
  const tieGeo = new THREE.BoxGeometry(0.015, 0.015, 0.035);
  const grilleGeo = new THREE.BoxGeometry(0.07, 0.07, 0.01);

  // Head bolts on outer faces
  for (let x = -0.35; x <= 0.35; x += 0.18) {
    for (let y = -0.25; y <= 0.25; y += 0.15) {
      const bolt = new THREE.Mesh(boltHeadGeo, boltMat);
      bolt.name = `bolt_${hwIndex++}`;
      bolt.position.set(x, y, 1.05);
      root.add(bolt);
    }
  }

  // Body segment bolts on all visible edges
  bodySegs.forEach((seg, segIdx) => {
    const baseZ = 1.3 - (segIdx + 1) * 0.65;
    for (let x = -0.25 - segIdx * 0.05; x <= 0.25 + segIdx * 0.05; x += 0.14) {
      for (let y = -0.22; y <= 0.22; y += 0.12) {
        const bolt = new THREE.Mesh(boltHeadGeo, boltMat);
        bolt.name = `bolt_${hwIndex++}`;
        bolt.position.set(x, y, baseZ);
        root.add(bolt);
      }
    }
  });

  // Tail bolts
  for (let x = -0.15; x <= 0.15; x += 0.11) {
    for (let y = -0.15; y <= 0.15; y += 0.1) {
      const bolt = new THREE.Mesh(boltHeadGeo, boltMat);
      bolt.name = `bolt_${hwIndex++}`;
      bolt.position.set(x, y, -1.8);
      root.add(bolt);
    }
  }

  // Dorsal fin bolts
  for (let x = -0.08; x <= 0.08; x += 0.08) {
    for (let y = 0.12; y <= 0.38; y += 0.12) {
      const bolt = new THREE.Mesh(boltHeadGeo, boltMat);
      bolt.name = `bolt_${hwIndex++}`;
      bolt.position.set(x, y, 0.4);
      root.add(bolt);
    }
  }

  // Pectoral fin bolts
  [-1, 1].forEach(side => {
    for (let y = -0.22; y <= 0.22; y += 0.12) {
      for (let z = 0.12; z <= 0.65; z += 0.15) {
        const bolt = new THREE.Mesh(boltHeadGeo, boltMat);
        bolt.name = `bolt_${hwIndex++}`;
        bolt.position.set(side * 0.38, y, z);
        root.add(bolt);
      }
    }
  });

  // Clamps along all tube routes
  const clampPositions = [
    [0, 0.16, 1.1], [0, -0.16, 1.1], [0, 0.2, 0.85], [0, -0.2, 0.85],
    [-0.3, 0.24, 0.7], [0.3, 0.24, 0.7], [-0.3, 0.24, 0.3], [0.3, 0.24, 0.3],
    [-0.3, 0.24, -0.3], [0.3, 0.24, -0.3], [-0.3, 0.24, -0.9], [0.3, 0.24, -0.9],
    [-0.32, -0.2, 0.6], [0.32, -0.2, 0.6], [-0.32, -0.2, 0.2], [0.32, -0.2, 0.2],
    [-0.32, -0.2, -0.4], [0.32, -0.2, -0.4], [-0.32, -0.2, -1.0], [0.32, -0.2, -1.0],
    [0, 0.32, 0.8], [0, 0.32, 0.4], [0, 0.32, 0.0], [0, 0.32, -0.4], [0, 0.32, -0.8],
    [0, 0.12, 0.5], [0, -0.12, 0.5], [0, 0.12, -0.3], [0, -0.12, -0.3], [0, 0.12, -1.1],
    [-0.16, 0.14, -1.4], [0.16, 0.14, -1.4], [-0.16, -0.14, -1.4], [0.16, -0.14, -1.4],
    [-0.16, 0.14, -1.9], [0.16, 0.14, -1.9], [-0.22, 0.18, 0.7], [0.22, 0.18, 0.7],
    [-0.22, 0.18, 0.1], [0.22, 0.18, 0.1], [-0.22, 0.18, -0.6], [0.22, 0.18, -0.6]
  ];

  clampPositions.forEach((pos, i) => {
    const clamp = new THREE.Mesh(clampGeo, boltMat);
    clamp.name = `clamp_${i}`;
    clamp.position.set(...pos);
    root.add(clamp);
  });

  // Connectors at major junctions
  const connectorPositions = [
    [0, 0.34, 1.2], [0, -0.34, 1.2], [-0.4, 0.18, 1.0], [0.4, 0.18, 1.0],
    [-0.36, 0.22, 0.7], [0.36, 0.22, 0.7], [-0.36, -0.22, 0.7], [0.36, -0.22, 0.7],
    [-0.32, 0.2, 0.05], [0.32, 0.2, 0.05], [-0.32, -0.2, 0.05], [0.32, -0.2, 0.05],
    [-0.28, 0.18, -0.6], [0.28, 0.18, -0.6], [-0.28, -0.18, -0.6], [0.28, -0.18, -0.6],
    [-0.4, 0.08, 0.3], [0.4, 0.08, 0.3], [0, 0.4, 0.5], [0, 0.4, 0.1],
    [-0.22, 0.14, -1.3], [0.22, 0.14, -1.3], [0, 0.2, -1.6], [0, -0.2, -1.6],
    [0, 0.18, 0.4], [0, -0.18, 0.4], [0, 0.18, -0.3], [0, -0.18, -0.3],
    [-0.15, 0.1, 0.0], [0.15, 0.1, 0.0]
  ];

  connectorPositions.forEach((pos, i) => {
    const connector = new THREE.Mesh(connectorGeo, accentMat);
    connector.name = `connector_${i}`;
    connector.position.set(...pos);
    root.add(connector);
  });

  // Cable ties and clips distributed across harness
  const tiePositions = [
    [-0.28, 0.12, 0.8], [0.28, 0.12, 0.8], [-0.25, 0.1, 0.3], [0.25, 0.1, 0.3],
    [-0.22, 0.08, -0.2], [0.22, 0.08, -0.2], [-0.2, 0.06, -0.8], [0.2, 0.06, -0.8],
    [0, 0.22, 0.7], [0, 0.22, 0.1], [0, 0.22, -0.5], [0, -0.2, 0.6],
    [0, -0.2, 0.0], [0, -0.2, -0.6], [-0.32, 0.08, -1.4], [0.32, 0.08, -1.4],
    [-0.18, 0.15, 0.5], [0.18, 0.15, 0.5], [-0.15, 0.12, -1.0], [0.15, 0.12, -1.0]
  ];

  tiePositions.forEach((pos, i) => {
    const tie = new THREE.Mesh(tieGeo, boltMat);
    tie.name = `cable_tie_${i}`;
    tie.position.set(...pos);
    root.add(tie);
  });

  // Grilles and blanking plates on shell surfaces
  const grillePositions = [
    [0, 0, 1.1], [-0.28, 0.18, 1.05], [0.28, 0.18, 1.05],
    [-0.22, 0.2, 0.6], [0.22, 0.2, 0.6], [-0.2, 0.18, 0.0], [0.2, 0.18, 0.0],
    [-0.18, 0.16, -0.6], [0.18, 0.16, -0.6],
    [-0.12, 0.14, -1.5], [0.12, 0.14, -1.5],
    [0, -0.22, 0.5], [0, -0.22, 0.0], [0, -0.22, -0.5], [0, -0.22, -1.2],
    [0, 0.08, 0.2], [-0.25, -0.1, 0.3], [0.25, -0.1, 0.3]
  ];

  grillePositions.forEach((pos, i) => {
    const grille = new THREE.Mesh(grilleGeo, frameMat);
    grille.name = `grille_${i}`;
    grille.position.set(...pos);
    root.add(grille);
  });

  root.userData.pose = (s) => {
    head.position.z = 1.3;
    head.rotation.set(0, 0, 0);
    jaw.rotation.x = 0;

    bodySegs.forEach((seg, i) => {
      seg.position.z = -(i + 1) * 0.65;
      seg.rotation.set(0, 0, 0);
    });

    tail.position.z = -0.5;
    tail.rotation.set(0, 0, 0);

    if (s.action) {
      const ph = s.phase;
      if (s.action === 'attack') {
        jaw.rotation.x = Math.sin(ph * Math.PI) * 1.3;
        head.position.z += ph * 0.3;
      } else if (s.action === 'eat') {
        jaw.rotation.x = Math.sin(ph * Math.PI * 2.5) * 0.8;
      } else if (s.action === 'signal') {
        jaw.rotation.x = Math.sin(ph * Math.PI) * 1.1;
        head.rotation.x = Math.sin(ph * Math.PI * 2) * 0.25;
      } else if (s.action === 'jump') {
        root.position.y = Math.sin(ph * Math.PI) * 2;
      } else if (s.action === 'die') {
        root.rotation.z = ph * Math.PI * 0.8;
        root.position.y = -ph * 1.2;
      } else if (s.action === 'sleep') {
        const settle = Math.min(ph / 0.65, 1);
        root.rotation.z = settle * Math.PI * 0.3;
        root.position.y = -settle * 0.4;
      }
    } else {
      const wavePhase = s.stride * Math.PI * 2;
      const speedFactor = Math.min(s.speed / 6, 1);
      const waveAmp = 0.07 + speedFactor * 0.08;
      head.rotation.z = Math.sin(wavePhase) * waveAmp;
      bodySegs.forEach((seg, i) => {
        const phase = wavePhase + (i + 1) * 0.48;
        seg.rotation.z = Math.sin(phase) * waveAmp * (1 + i * 0.28);
      });
      tail.rotation.z = Math.sin(wavePhase + Math.PI) * waveAmp * 2.5;
      if (s.speed === 0) {
        head.position.y = Math.sin(s.t * 1.4) * 0.07;
      }
      if (Math.abs(s.turn) > 0.01) {
        const turnAmt = s.turn * 0.45;
        head.rotation.y = turnAmt * 0.35;
        tail.rotation.y = -turnAmt * 0.25;
      }
      if (s.health < 1) {
        const dmg = 1 - s.health;
        root.rotation.z = dmg * 0.55;
        bodySegs[0].rotation.y = dmg * 0.4;
      }
    }

    if (!s.grounded) {
      head.position.y += 0.3;
    }
  };

  return root;
}
```