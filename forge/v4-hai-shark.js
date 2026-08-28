```javascript
"use strict";
function build(THREE, TSL) {
  const root = new THREE.Group();
  root.name = 'shark';
  
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x303030 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x606060, metalness: 0.8, roughness: 0.3 });
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xF5F5DC });
  const hardwareMat = new THREE.MeshStandardMaterial({ color: 0x404040, metalness: 0.9, roughness: 0.2 });
  
  const body = new THREE.Group();
  body.name = 'body';
  body.position.set(0, 0, 0);
  root.add(body);
  
  // BODY SECTIONS - ExtrudeGeometry with chamfered edges
  const chestShape = new THREE.Shape();
  chestShape.moveTo(-0.42, -0.38);
  chestShape.lineTo(0.42, -0.38);
  chestShape.lineTo(0.42, 0.44);
  chestShape.lineTo(-0.42, 0.44);
  chestShape.closePath();
  
  const chestGeom = new THREE.ExtrudeGeometry(chestShape, {
    depth: 1.1,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.07,
    bevelSegments: 5
  });
  const chest = new THREE.Mesh(chestGeom, bodyMat);
  chest.name = 'body_chest';
  chest.position.z = 0.8;
  chest.castShadow = true;
  body.add(chest);
  
  const midShape = new THREE.Shape();
  midShape.moveTo(-0.44, -0.45);
  midShape.lineTo(0.44, -0.45);
  midShape.lineTo(0.44, 0.45);
  midShape.lineTo(-0.44, 0.45);
  midShape.closePath();
  
  const midGeom = new THREE.ExtrudeGeometry(midShape, {
    depth: 1.3,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.07,
    bevelSegments: 5
  });
  const mid = new THREE.Mesh(midGeom, bodyMat);
  mid.name = 'body_mid';
  mid.position.z = -0.15;
  mid.castShadow = true;
  body.add(mid);
  
  const rearShape = new THREE.Shape();
  rearShape.moveTo(-0.38, -0.40);
  rearShape.lineTo(0.38, -0.40);
  rearShape.lineTo(0.38, 0.40);
  rearShape.lineTo(-0.38, 0.40);
  rearShape.closePath();
  
  const rearGeom = new THREE.ExtrudeGeometry(rearShape, {
    depth: 1.2,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.07,
    bevelSegments: 5
  });
  const rear = new THREE.Mesh(rearGeom, bodyMat);
  rear.name = 'body_rear';
  rear.position.z = -1.5;
  rear.castShadow = true;
  body.add(rear);
  
  // HEAD - ExtrudeGeometry
  const headShape = new THREE.Shape();
  headShape.moveTo(-0.30, -0.28);
  headShape.lineTo(0.30, -0.28);
  headShape.lineTo(0.32, 0.32);
  headShape.lineTo(-0.32, 0.32);
  headShape.closePath();
  
  const headGeom = new THREE.ExtrudeGeometry(headShape, {
    depth: 0.85,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 4
  });
  const head = new THREE.Mesh(headGeom, bodyMat);
  head.name = 'head';
  head.position.z = 1.4;
  head.castShadow = true;
  body.add(head);
  
  // SNOUT - ExtrudeGeometry
  const snoutShape = new THREE.Shape();
  snoutShape.moveTo(-0.18, -0.16);
  snoutShape.lineTo(0.18, -0.16);
  snoutShape.lineTo(0.20, 0.20);
  snoutShape.lineTo(-0.20, 0.20);
  snoutShape.closePath();
  
  const snoutGeom = new THREE.ExtrudeGeometry(snoutShape, {
    depth: 0.65,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.05,
    bevelSegments: 3
  });
  const snout = new THREE.Mesh(snoutGeom, bodyMat);
  snout.name = 'snout';
  snout.position.z = 2.3;
  snout.castShadow = true;
  body.add(snout);
  
  // UPPER TEETH
  for (let i = -3; i <= 3; i++) {
    const toothGeom = new THREE.ConeGeometry(0.055, 0.35, 6);
    const tooth = new THREE.Mesh(toothGeom, toothMat);
    tooth.name = `tooth_upper_${i}`;
    tooth.position.set(i * 0.18, 0.18, 0.5);
    tooth.castShadow = true;
    head.add(tooth);
  }
  
  // JAW - ExtrudeGeometry
  const jawShape = new THREE.Shape();
  jawShape.moveTo(-0.26, -0.10);
  jawShape.lineTo(0.26, -0.10);
  jawShape.lineTo(0.26, 0.10);
  jawShape.lineTo(-0.26, 0.10);
  jawShape.closePath();
  
  const jawGeom = new THREE.ExtrudeGeometry(jawShape, {
    depth: 0.58,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.04,
    bevelSegments: 3
  });
  const jaw = new THREE.Mesh(jawGeom, bodyMat);
  jaw.name = 'jaw';
  jaw.position.set(0, -0.22, 0.7);
  jaw.castShadow = true;
  body.add(jaw);
  
  const jawHingeGeom = new THREE.BoxGeometry(0.12, 0.10, 0.08);
  const jawHingeL = new THREE.Mesh(jawHingeGeom, metalMat);
  jawHingeL.name = 'jaw_hinge_left';
  jawHingeL.position.set(-0.18, -0.18, 0.45);
  jawHingeL.castShadow = true;
  body.add(jawHingeL);
  
  const jawHingeR = new THREE.Mesh(jawHingeGeom, metalMat);
  jawHingeR.name = 'jaw_hinge_right';
  jawHingeR.position.set(0.18, -0.18, 0.45);
  jawHingeR.castShadow = true;
  body.add(jawHingeR);
  
  // LOWER TEETH
  for (let i = -3; i <= 3; i++) {
    const toothGeom = new THREE.ConeGeometry(0.055, 0.30, 6);
    const tooth = new THREE.Mesh(toothGeom, toothMat);
    tooth.name = `tooth_lower_${i}`;
    tooth.position.set(i * 0.18, -0.08, 0.35);
    tooth.castShadow = true;
    jaw.add(tooth);
  }
  
  // DORSAL FIN - ExtrudeGeometry
  const dorsalShape = new THREE.Shape();
  dorsalShape.moveTo(-0.08, 0);
  dorsalShape.lineTo(0.08, 0);
  dorsalShape.lineTo(0.10, 0.70);
  dorsalShape.lineTo(-0.10, 0.70);
  dorsalShape.closePath();
  
  const dorsalGeom = new THREE.ExtrudeGeometry(dorsalShape, {
    depth: 0.20,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.03,
    bevelSegments: 2
  });
  const dorsalFin = new THREE.Mesh(dorsalGeom, bodyMat);
  dorsalFin.name = 'dorsal_fin';
  dorsalFin.position.set(0, 0.52, 0.2);
  dorsalFin.rotation.z = Math.PI / 2;
  dorsalFin.castShadow = true;
  body.add(dorsalFin);
  
  const dorsalBaseGeom = new THREE.BoxGeometry(0.20, 0.16, 0.38);
  const dorsalBase = new THREE.Mesh(dorsalBaseGeom, metalMat);
  dorsalBase.name = 'dorsal_fin_base';
  dorsalBase.position.set(0, 0.38, 0.2);
  dorsalBase.castShadow = true;
  body.add(dorsalBase);
  
  // PECTORAL FINS - ExtrudeGeometry
  const pectoralShape = new THREE.Shape();
  pectoralShape.moveTo(-0.08, 0);
  pectoralShape.lineTo(0.08, 0);
  pectoralShape.lineTo(0.20, 0.58);
  pectoralShape.lineTo(-0.20, 0.58);
  pectoralShape.closePath();
  
  const pectoralGeom = new THREE.ExtrudeGeometry(pectoralShape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 2
  });
  
  const leftPectoral = new THREE.Mesh(pectoralGeom, bodyMat);
  leftPectoral.name = 'pectoral_left';
  leftPectoral.position.set(-0.5, -0.25, 0);
  leftPectoral.rotation.z = Math.PI / 4;
  leftPectoral.castShadow = true;
  body.add(leftPectoral);
  
  const leftPecBase = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.30), metalMat);
  leftPecBase.name = 'pectoral_left_base';
  leftPecBase.position.set(-0.5, -0.14, 0);
  leftPecBase.castShadow = true;
  body.add(leftPecBase);
  
  const rightPectoral = new THREE.Mesh(pectoralGeom, bodyMat);
  rightPectoral.name = 'pectoral_right';
  rightPectoral.position.set(0.5, -0.25, 0);
  rightPectoral.rotation.z = -Math.PI / 4;
  rightPectoral.castShadow = true;
  body.add(rightPectoral);
  
  const rightPecBase = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.30), metalMat);
  rightPecBase.name = 'pectoral_right_base';
  rightPecBase.position.set(0.5, -0.14, 0);
  rightPecBase.castShadow = true;
  body.add(rightPecBase);
  
  // TAIL
  const tailGeom = new THREE.ConeGeometry(0.22, 1.8, 12);
  const tail = new THREE.Mesh(tailGeom, bodyMat);
  tail.name = 'tail';
  tail.position.z = -1.4;
  tail.rotation.x = Math.PI / 2;
  tail.castShadow = true;
  body.add(tail);
  
  const tailBaseGeom = new THREE.BoxGeometry(0.22, 0.14, 0.32);
  const tailBase = new THREE.Mesh(tailBaseGeom, metalMat);
  tailBase.name = 'tail_base';
  tailBase.position.set(0, 0, -1.32);
  tailBase.castShadow = true;
  body.add(tailBase);
  
  // EYES
  const eyeGeom = new THREE.SphereGeometry(0.08, 8, 8);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
  
  const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
  leftEye.name = 'eye_left';
  leftEye.position.set(-0.28, 0.25, 1.0);
  leftEye.castShadow = true;
  head.add(leftEye);
  
  const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
  rightEye.name = 'eye_right';
  rightEye.position.set(0.28, 0.25, 1.0);
  rightEye.castShadow = true;
  head.add(rightEye);
  
  // GILL PLATES
  const gillGeom = new THREE.BoxGeometry(0.14, 0.34, 0.18);
  for (let i = 0; i < 3; i++) {
    const gillL = new THREE.Mesh(gillGeom, metalMat);
    gillL.name = `gill_left_${i}`;
    gillL.position.set(-0.44, -0.16, 0.35 + i * 0.36);
    gillL.castShadow = true;
    body.add(gillL);
    
    const gillR = new THREE.Mesh(gillGeom, metalMat);
    gillR.name = `gill_right_${i}`;
    gillR.position.set(0.44, -0.16, 0.35 + i * 0.36);
    gillR.castShadow = true;
    body.add(gillR);
  }
  
  // ===== HARNESS: 18 Long Tube Runs =====
  
  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.48, 1.6),
    new THREE.Vector3(0, 0.52, 1.0),
    new THREE.Vector3(0, 0.50, 0.3),
    new THREE.Vector3(0, 0.48, -0.6),
    new THREE.Vector3(0, 0.45, -1.6)
  ]);
  const spineHose = new THREE.Mesh(new THREE.TubeGeometry(spineCurve, 20, 0.09, 6, false), metalMat);
  spineHose.name = 'hose_spine';
  spineHose.castShadow = true;
  body.add(spineHose);
  
  const leftDorsalCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.15, 0.50, 1.3),
    new THREE.Vector3(-0.30, 0.55, 0.8),
    new THREE.Vector3(-0.45, 0.50, 0.2),
    new THREE.Vector3(-0.48, 0.45, -0.8)
  ]);
  const leftDorsalHose = new THREE.Mesh(new THREE.TubeGeometry(leftDorsalCurve, 16, 0.07, 5, false), metalMat);
  leftDorsalHose.name = 'hose_left_dorsal';
  leftDorsalHose.castShadow = true;
  body.add(leftDorsalHose);
  
  const rightDorsalCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.15, 0.50, 1.3),
    new THREE.Vector3(0.30, 0.55, 0.8),
    new THREE.Vector3(0.45, 0.50, 0.2),
    new THREE.Vector3(0.48, 0.45, -0.8)
  ]);
  const rightDorsalHose = new THREE.Mesh(new THREE.TubeGeometry(rightDorsalCurve, 16, 0.07, 5, false), metalMat);
  rightDorsalHose.name = 'hose_right_dorsal';
  rightDorsalHose.castShadow = true;
  body.add(rightDorsalHose);
  
  const leftVentralCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.35, 0.35, 1.2),
    new THREE.Vector3(-0.46, 0.30, 0.4),
    new THREE.Vector3(-0.48, 0.25, -0.8),
    new THREE.Vector3(-0.45, 0.20, -1.6)
  ]);
  const leftVentralHose = new THREE.Mesh(new THREE.TubeGeometry(leftVentralCurve, 18, 0.065, 5, false), metalMat);
  leftVentralHose.name = 'hose_left_ventral';
  leftVentralHose.castShadow = true;
  body.add(leftVentralHose);
  
  const rightVentralCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.35, 0.35, 1.2),
    new THREE.Vector3(0.46, 0.30, 0.4),
    new THREE.Vector3(0.48, 0.25, -0.8),
    new THREE.Vector3(0.45, 0.20, -1.6)
  ]);
  const rightVentralHose = new THREE.Mesh(new THREE.TubeGeometry(rightVentralCurve, 18, 0.065, 5, false), metalMat);
  rightVentralHose.name = 'hose_right_ventral';
  rightVentralHose.castShadow = true;
  body.add(rightVentralHose);
  
  const lowerCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.45, 1.0),
    new THREE.Vector3(0, -0.48, 0.2),
    new THREE.Vector3(0, -0.45, -1.2)
  ]);
  const lowerHose = new THREE.Mesh(new THREE.TubeGeometry(lowerCurve, 14, 0.06, 5, false), metalMat);
  lowerHose.name = 'hose_lower';
  lowerHose.castShadow = true;
  body.add(lowerHose);
  
  const snoutUpperCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.40, 1.6),
    new THREE.Vector3(0, 0.35, 1.95),
    new THREE.Vector3(0, 0.30, 2.35)
  ]);
  const snoutUpperHose = new THREE.Mesh(new THREE.TubeGeometry(snoutUpperCurve, 10, 0.05, 4, false), metalMat);
  snoutUpperHose.name = 'hose_snout_upper';
  snoutUpperHose.castShadow = true;
  body.add(snoutUpperHose);
  
  const snoutLowerCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.30, 1.6),
    new THREE.Vector3(0, -0.25, 1.95),
    new THREE.Vector3(0, -0.20, 2.35)
  ]);
  const snoutLowerHose = new THREE.Mesh(new THREE.TubeGeometry(snoutLowerCurve, 10, 0.04, 4, false), metalMat);
  snoutLowerHose.name = 'hose_snout_lower';
  snoutLowerHose.castShadow = true;
  body.add(snoutLowerHose);
  
  const leftPecHoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.32, 0.35, 0.6),
    new THREE.Vector3(-0.50, 0.20, 0.4),
    new THREE.Vector3(-0.56, 0.05, 0.2)
  ]);
  const leftPecHose = new THREE.Mesh(new THREE.TubeGeometry(leftPecHoseCurve, 12, 0.048, 4, false), metalMat);
  leftPecHose.name = 'hose_left_pectoral';
  leftPecHose.castShadow = true;
  body.add(leftPecHose);
  
  const rightPecHoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.32, 0.35, 0.6),
    new THREE.Vector3(0.50, 0.20, 0.4),
    new THREE.Vector3(0.56, 0.05, 0.2)
  ]);
  const rightPecHose = new THREE.Mesh(new THREE.TubeGeometry(rightPecHoseCurve, 12, 0.048, 4, false), metalMat);
  rightPecHose.name = 'hose_right_pectoral';
  rightPecHose.castShadow = true;
  body.add(rightPecHose);
  
  const tailUpperCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.40, -0.9),
    new THREE.Vector3(0, 0.30, -1.3),
    new THREE.Vector3(0, 0.15, -1.8)
  ]);
  const tailUpperHose = new THREE.Mesh(new THREE.TubeGeometry(tailUpperCurve, 10, 0.05, 4, false), metalMat);
  tailUpperHose.name = 'hose_tail_upper';
  tailUpperHose.castShadow = true;
  body.add(tailUpperHose);
  
  const tailLowerCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.40, -0.9),
    new THREE.Vector3(0, -0.35, -1.3),
    new THREE.Vector3(0, -0.25, -1.8)
  ]);
  const tailLowerHose = new THREE.Mesh(new THREE.TubeGeometry(tailLowerCurve, 10, 0.04, 4, false), metalMat);
  tailLowerHose.name = 'hose_tail_lower';
  tailLowerHose.castShadow = true;
  body.add(tailLowerHose);
  
  const leftShoulderCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.20, 0.45, 0.8),
    new THREE.Vector3(-0.40, 0.48, 0.6),
    new THREE.Vector3(-0.50, 0.40, 0.3)
  ]);
  const leftShoulderHose = new THREE.Mesh(new THREE.TubeGeometry(leftShoulderCurve, 12, 0.038, 3, false), metalMat);
  leftShoulderHose.name = 'hose_left_shoulder';
  leftShoulderHose.castShadow = true;
  body.add(leftShoulderHose);
  
  const rightShoulderCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.20, 0.45, 0.8),
    new THREE.Vector3(0.40, 0.48, 0.6),
    new THREE.Vector3(0.50, 0.40, 0.3)
  ]);
  const rightShoulderHose = new THREE.Mesh(new THREE.TubeGeometry(rightShoulderCurve, 12, 0.038, 3, false), metalMat);
  rightShoulderHose.name = 'hose_right_shoulder';
  rightShoulderHose.castShadow = true;
  body.add(rightShoulderHose);
  
  const leftHipCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.30, 0.30, -0.4),
    new THREE.Vector3(-0.46, 0.28, -0.8),
    new THREE.Vector3(-0.50, 0.22, -1.4)
  ]);
  const leftHipHose = new THREE.Mesh(new THREE.TubeGeometry(leftHipCurve, 12, 0.035, 3, false), metalMat);
  leftHipHose.name = 'hose_left_hip';
  leftHipHose.castShadow = true;
  body.add(leftHipHose);
  
  const rightHipCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.30, 0.30, -0.4),
    new THREE.Vector3(0.46, 0.28, -0.8),
    new THREE.Vector3(0.50, 0.22, -1.4)
  ]);
  const rightHipHose = new THREE.Mesh(new THREE.TubeGeometry(rightHipCurve, 12, 0.035, 3, false), metalMat);
  rightHipHose.name = 'hose_right_hip';
  rightHipHose.castShadow = true;
  body.add(rightHipHose);
  
  // ===== HARDWARE PASS - Top and forward-facing surfaces only =====
  
  const boltHeadGeom = new THREE.CylinderGeometry(0.065, 0.065, 0.035, 8);
  
  // Bolts along top edges of body sections
  for (let i = 0; i < 9; i++) {
    const bolt = new THREE.Mesh(boltHeadGeom, hardwareMat);
    bolt.name = `bolt_chest_${i}`;
    bolt.position.set(-0.38 + i * 0.105, 0.48, 0.2 + i * 0.12);
    bolt.castShadow = true;
    body.add(bolt);
  }
  
  for (let i = 0; i < 12; i++) {
    const bolt = new THREE.Mesh(boltHeadGeom, hardwareMat);
    bolt.name = `bolt_mid_${i}`;
    bolt.position.set(-0.40 + i * 0.067, 0.50, -0.3 + i * 0.12);
    bolt.castShadow = true;
    body.add(bolt);
  }
  
  for (let i = 0; i < 10; i++) {
    const bolt = new THREE.Mesh(boltHeadGeom, hardwareMat);
    bolt.name = `bolt_rear_${i}`;
    bolt.position.set(-0.35 + i * 0.078, 0.48, -1.3 + i * 0.15);
    bolt.castShadow = true;
    body.add(bolt);
  }
  
  for (let i = 0; i < 7; i++) {
    const bolt = new THREE.Mesh(boltHeadGeom, hardwareMat);
    bolt.name = `bolt_dorsal_${i}`;
    bolt.position.set(-0.15 + i * 0.05, 0.48, 0.05 + i * 0.06);
    bolt.castShadow = true;
    body.add(bolt);
  }
  
  // Clamps on visible hose sections
  const clampGeom = new THREE.BoxGeometry(0.09, 0.045, 0.045);
  
  for (let i = 0; i < 14; i++) {
    const clamp = new THREE.Mesh(clampGeom, hardwareMat);
    clamp.name = `clamp_spine_${i}`;
    const z = -1.4 + i * 0.25;
    clamp.position.set(0.08, 0.50, z);
    clamp.castShadow = true;
    body.add(clamp);
  }
  
  for (let i = 0; i < 9; i++) {
    const clamp = new THREE.Mesh(clampGeom, hardwareMat);
    clamp.name = `clamp_left_dorsal_${i}`;
    const t = i / 8;
    clamp.position.set(-0.28 * t - 0.15, 0.52 + Math.sin(t * Math.PI) * 0.12, 1.3 - t * 2.1);
    clamp.castShadow = true;
    body.add(clamp);
  }
  
  for (let i = 0; i < 9; i++) {
    const clamp = new THREE.Mesh(clampGeom, hardwareMat);
    clamp.name = `clamp_right_dorsal_${i}`;
    const t = i / 8;
    clamp.position.set(0.28 * t + 0.15, 0.52 + Math.sin(t * Math.PI) * 0.12, 1.3 - t * 2.1);
    clamp.castShadow = true;
    body.add(clamp);
  }
  
  // Junction boxes on top-forward
  const connectorGeom = new THREE.BoxGeometry(0.15, 0.12, 0.15);
  
  const conn1 = new THREE.Mesh(connectorGeom, hardwareMat);
  conn1.name = 'connector_head';
  conn1.position.set(0, 0.52, 1.8);
  conn1.castShadow = true;
  body.add(conn1);
  
  const conn2 = new THREE.Mesh(connectorGeom, hardwareMat);
  conn2.name = 'connector_mid';
  conn2.position.set(0, 0.50, 0.4);
  conn2.castShadow = true;
  body.add(conn2);
  
  const conn3 = new THREE.Mesh(connectorGeom, hardwareMat);
  conn3.name = 'connector_rear';
  conn3.position.set(0, 0.48, -1.1);
  conn3.castShadow = true;
  body.add(conn3);
  
  // Panel seams on top
  const panelGeom = new THREE.BoxGeometry(0.92, 0.025, 0.08);
  
  for (let i = 0; i < 3; i++) {
    const panel = new THREE.Mesh(panelGeom, hardwareMat);
    panel.name = `panel_seam_${i}`;
    panel.position.set(0, 0.46, -0.15 + i * 1.3);
    panel.castShadow = true;
    body.add(panel);
  }
  
  // Top-facing vents
  const ventGeom = new THREE.BoxGeometry(0.25, 0.035, 0.13);
  
  for (let i = 0; i < 6; i++) {
    const vent = new THREE.Mesh(ventGeom, hardwareMat);
    vent.name = `vent_left_${i}`;
    vent.position.set(-0.30, 0.47, -0.3 + i * 0.32);
    vent.castShadow = true;
    body.add(vent);
  }
  
  for (let i = 0; i < 6; i++) {
    const vent = new THREE.Mesh(ventGeom, hardwareMat);
    vent.name = `vent_right_${i}`;
    vent.position.set(0.30, 0.47, -0.3 + i * 0.32);
    vent.castShadow = true;
    body.add(vent);
  }
  
  // Blanking plates scattered on top surfaces
  const blankGeom = new THREE.BoxGeometry(0.08, 0.025, 0.08);
  
  for (let i = 0; i < 24; i++) {
    const blank = new THREE.Mesh(blankGeom, hardwareMat);
    blank.name = `blank_${i}`;
    const x = (Math.random() - 0.5) * 0.7;
    const z = 1.5 - Math.random() * 3;
    blank.position.set(x, 0.46, z);
    blank.castShadow = true;
    body.add(blank);
  }
  
  // Forward junction plates
  const juncGeom = new THREE.BoxGeometry(0.12, 0.10, 0.13);
  
  for (let i = 0; i < 5; i++) {
    const junc = new THREE.Mesh(juncGeom, hardwareMat);
    junc.name = `junction_${i}`;
    junc.position.set(-0.30 + i * 0.15, 0.42, 1.4);
    junc.castShadow = true;
    body.add(junc);
  }
  
  // Cable ties along frame
  const tieGeom = new THREE.BoxGeometry(0.04, 0.025, 0.04);
  
  for (let i = 0; i < 28; i++) {
    const tie = new THREE.Mesh(tieGeom, hardwareMat);
    tie.name = `cable_tie_${i}`;
    const t = i / 27;
    tie.position.set(t * 0.8 - 0.4, 0.46, 1.5 - t * 3.1);
    tie.castShadow = true;
    body.add(tie);
  }
  
  // Port housings - top-forward
  const portGeom = new THREE.BoxGeometry(0.17, 0.12, 0.17);
  
  const portHead = new THREE.Mesh(portGeom, hardwareMat);
  portHead.name = 'port_head';
  portHead.position.set(0, 0.54, 1.8);
  portHead.castShadow = true;
  body.add(portHead);
  
  const portTail = new THREE.Mesh(portGeom, hardwareMat);
  portTail.name = 'port_tail';
  portTail.position.set(0, 0.52, -1.7);
  portTail.castShadow = true;
  body.add(portTail);
  
  // Grab handles on shoulders
  const handleGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.30);
  
  const handleL = new THREE.Mesh(handleGeom, metalMat);
  handleL.name = 'handle_left';
  handleL.position.set(-0.48, 0.48, 0.4);
  handleL.rotation.z = Math.PI / 2;
  handleL.castShadow = true;
  body.add(handleL);
  
  const handleR = new THREE.Mesh(handleGeom, metalMat);
  handleR.name = 'handle_right';
  handleR.position.set(0.48, 0.48, 0.4);
  handleR.rotation.z = Math.PI / 2;
  handleR.castShadow = true;
  body.add(handleR);
  
  // Hinge pin visible on dorsal
  const hingeGeom = new THREE.CylinderGeometry(0.032, 0.032, 0.24);
  
  const hingeD = new THREE.Mesh(hingeGeom, metalMat);
  hingeD.name = 'hinge_dorsal';
  hingeD.position.set(-0.20, 0.38, 0.2);
  hingeD.rotation.z = Math.PI / 2;
  hingeD.castShadow = true;
  body.add(hingeD);
  
  // More scattered hardware on top
  for (let i = 0; i < 16; i++) {
    const bolt = new THREE.Mesh(boltHeadGeom, hardwareMat);
    bolt.name = `bolt_scattered_${i}`;
    const x = (Math.random() - 0.5) * 0.8;
    const z = 1.4 - Math.random() * 3.0;
    bolt.position.set(x, 0.51, z);
    bolt.castShadow = true;
    body.add(bolt);
  }
  
  root.userData.pose = (s) => {
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    body.scale.set(1, 1, 1);
    head.position.set(0, 0, 1.4);
    head.rotation.set(0, 0, 0);
    jaw.rotation.set(0, 0, 0);
    tail.rotation.set(Math.PI / 2, 0, 0);
    dorsalFin.rotation.set(0, 0, Math.PI / 2);
    leftPectoral.rotation.set(0, 0, Math.PI / 4);
    rightPectoral.rotation.set(0, 0, -Math.PI / 4);
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    
    if (s.action) {
      switch (s.action) {
        case 'attack': {
          const windUp = s.phase < 0.4;
          const strike = s.phase >= 0.4 && s.phase < 0.7;
          if (windUp) {
            jaw.rotation.x = -s.phase / 0.4 * 1.2;
            head.rotation.x = -s.phase / 0.4 * 0.5;
            body.rotation.x = s.phase / 0.4 * 0.3;
          } else if (strike) {
            const ph = (s.phase - 0.4) / 0.3;
            jaw.rotation.x = -1.2 + ph * 1.5;
            head.position.z = 1.4 + ph * 0.4;
            body.position.z = ph * 0.3;
          } else {
            jaw.rotation.x = (1 - s.phase) / 0.3 * 0.3;
            head.position.z = 1.4 + (0.7 - s.phase) / 0.3 * 0.1;
          }
          break;
        }
        case 'fire': {
          jaw.rotation.x = Math.sin(s.phase * Math.PI) * 0.6;
          head.rotation.x = Math.sin(s.phase * Math.PI) * 0.3;
          body.rotation.x = -Math.sin(s.phase * Math.PI) * 0.2;
          break;
        }
        case 'hit': {
          const bounce = Math.exp(-s.phase * 8);
          body.position.set(-bounce * 0.2, 0, 0);
          body.rotation.x = -bounce * 0.4;
          break;
        }
        case 'block': {
          body.rotation.x = -0.4;
          body.position.y = -0.2;
          leftPectoral.rotation.z = Math.PI / 4 - 0.3;
          rightPectoral.rotation.z = -Math.PI / 4 + 0.3;
          dorsalFin.rotation.x = -0.2;
          break;
        }
        case 'gather': {
          const down = s.phase < 0.5;
          if (down) {
            const ph = s.phase / 0.5;
            body.position.y = -ph * 0.6;
            body.rotation.x = ph * 0.5;
            leftPectoral.rotation.z = Math.PI / 4 - ph * 0.4;
            rightPectoral.rotation.z = -Math.PI / 4 + ph * 0.4;
          } else {
            const ph = (s.phase - 0.5) / 0.5;
            body.position.y = -0.6 + ph * 0.6;
            body.rotation.x = 0.5 - ph * 0.5;
            leftPectoral.rotation.z = -0.15 + ph * 0.4;
            rightPectoral.rotation.z = 0.15 - ph * 0.4;
          }
          break;
        }
        case 'deposit': {
          const down = s.phase < 0.4;
          if (down) {
            const ph = s.phase / 0.4;
            body.position.y = -ph * 0.4;
            body.rotation.x = ph * 0.3;
          } else {
            const ph = (s.phase - 0.4) / 0.6;
            body.position.y = -0.4 + ph * 0.4;
            body.rotation.x = 0.3 - ph * 0.3;
          }
          break;
        }
        case 'eat': {
          jaw.rotation.x = Math.sin(s.phase * Math.PI * 3) * 0.8;
          head.rotation.x = Math.sin(s.phase * Math.PI * 1.5) * 0.15;
          break;
        }
        case 'drink': {
          body.position.y = -(1 - Math.cos(s.phase * Math.PI)) * 0.4;
          body.rotation.x = Math.sin(s.phase * Math.PI) * 0.3;
          head.rotation.x = Math.sin(s.phase * Math.PI) * 0.4;
          break;
        }
        case 'jump': {
          const launch = s.phase < 0.5;
          if (launch) {
            const ph = s.phase / 0.5;
            body.position.y = ph * ph * 1.8;
            body.rotation.x = -ph * 0.6;
          } else {
            const ph = (s.phase - 0.5) / 0.5;
            body.position.y = 1.8 - ph * ph * 0.5;
            body.rotation.x = -0.6 + ph * 0.2;
          }
          break;
        }
        case 'land': {
          const impact = s.phase < 0.3;
          if (impact) {
            const ph = s.phase / 0.3;
            body.position.y = (1 - ph * ph) * 0.5;
            body.scale.y = 1 - ph * 0.2;
          } else {
            const ph = (s.phase - 0.3) / 0.7;
            body.position.y = 0.5 * (1 - ph);
            body.scale.y = 0.8 + ph * 0.2;
          }
          break;
        }
        case 'signal': {
          const rise = (1 - Math.cos(s.phase * Math.PI)) * 0.6;
          body.position.y = rise;
          head.rotation.x = s.phase * 0.4;
          dorsalFin.rotation.x = -s.phase * 0.5;
          leftPectoral.rotation.z = Math.PI / 4 + s.phase * 0.6;
          rightPectoral.rotation.z = -Math.PI / 4 - s.phase * 0.6;
          break;
        }
        case 'sleep': {
          body.rotation.x = s.phase * 1.2;
          body.position.y = -s.phase * 0.7;
          tail.rotation.y = s.phase * 0.8;
          head.rotation.x = s.phase * 0.6;
          leftPectoral.rotation.z = Math.PI / 4 - s.phase * 0.5;
          rightPectoral.rotation.z = -Math.PI / 4 + s.phase * 0.5;
          break;
        }
        case 'wake': {
          const ph = 1 - s.phase;
          body.rotation.x = ph * 1.2;
          body.position.y = -ph * 0.7;
          tail.rotation.y = ph * 0.8;
          head.rotation.x = ph * 0.6;
          leftPectoral.rotation.z = Math.PI / 4 - ph * 0.5;
          rightPectoral.rotation.z = -Math.PI / 4 + ph * 0.5;
          break;
        }
        case 'die': {
          body.rotation.x = s.phase * 1.4;
          body.rotation.z = s.phase * 0.6;
          body.position.y = -s.phase * 2;
          tail.rotation.y = s.phase * Math.PI;
          head.rotation.x = s.phase * 0.8;
          break;
        }
        case 'evolve': {
          const open = s.phase < 0.5;
          if (open) {
            const ph = s.phase / 0.5;
            body.scale.y = 1 + ph * 0.3;
            body.scale.x = 1 - ph * 0.1;
            body.rotation.x = ph * 0.4;
          } else {
            const ph = (s.phase - 0.5) / 0.5;
            body.scale.y = 1.3 - ph * 0.3;
            body.scale.x = 0.9 + ph * 0.1;
            body.rotation.x = 0.4 - ph * 0.4;
          }
          break;
        }
      }
    } else {
      const swimCycle = Math.sin(s.stride * Math.PI * 2);
      const swimAmount = Math.min(s.speed / 6, 1);
      tail.rotation.y = swimCycle * swimAmount * 0.8;
      body.rotation.z = Math.cos(s.stride * Math.PI * 2) * swimAmount * 0.3;
      if (s.speed > 2) body.rotation.x = -swimAmount * 0.15;
      const finBase = Math.PI / 4;
      const finLift = swimAmount * 0.3;
      leftPectoral.rotation.z = finBase - finLift + s.turn * 0.4;
      rightPectoral.rotation.z = -finBase + finLift + s.turn * 0.4;
      head.rotation.y = s.turn * Math.PI / 5;
      body.rotation.x -= s.turn * 0.2;
      if (!s.grounded) {
        leftPectoral.rotation.z = finBase + 0.4;
        rightPectoral.rotation.z = -finBase - 0.4;
        root.position.y += Math.sin(s.t * 1.5) * 0.08;
      }
      if (s.health < 1) {
        const damage = 1 - s.health;
        body.rotation.z += damage * 0.4;
        body.position.y -= damage * 0.3;
        leftPectoral.position.y -= damage * 0.15;
      }
    }
  };
  
  return root;
}
```