```javascript
"use strict";
function build(THREE, TSL) {
  const octopus = new THREE.Group();
  octopus.name = 'octopus';
  
  // Material palette - house style
  const shellMat = new THREE.MeshPhongMaterial({ color: 0xD8D2C6 }); // bone white
  const frameMat = new THREE.MeshPhongMaterial({ color: 0x55524C }); // dark frame
  const accentMat = new THREE.MeshPhongMaterial({ color: 0xC2521E }); // rust accent
  const eyeMat = new THREE.MeshPhongMaterial({ color: 0xFFFAFA });
  const pupilMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
  const tubeMat = new THREE.MeshPhongMaterial({ color: 0x4A4238 }); // hose color
  const wireMat = new THREE.MeshPhongMaterial({ color: 0x3E3A34 }); // thin wire
  
  // Central body - extruded ellipse with bevel for hard surfaces
  const bodyShape = new THREE.Shape();
  bodyShape.absellipse(0, 0, 0.6, 0.45, 0, Math.PI * 2, false);
  const bodyGeom = new THREE.ExtrudeGeometry(bodyShape, {
    depth: 0.8,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 3
  });
  bodyGeom.center();
  const body = new THREE.Mesh(bodyGeom, shellMat);
  body.name = 'body';
  body.castShadow = true;
  octopus.add(body);
  
  // Dorsal armor plates - extruded with bevel, rust accent color
  const armorTopShape = new THREE.Shape();
  armorTopShape.moveTo(-0.55, 0);
  armorTopShape.lineTo(0.55, 0);
  armorTopShape.lineTo(0.55, 0.15);
  armorTopShape.lineTo(-0.55, 0.15);
  const armorTopGeom = new THREE.ExtrudeGeometry(armorTopShape, {
    depth: 0.45,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 2
  });
  armorTopGeom.center();
  const armorTop = new THREE.Mesh(armorTopGeom, accentMat);
  armorTop.name = 'armor_dorsal';
  armorTop.position.y = 0.5;
  armorTop.castShadow = true;
  body.add(armorTop);
  
  // Left side armor plate
  const armorLShape = new THREE.Shape();
  armorLShape.moveTo(0, -0.35);
  armorLShape.lineTo(0.1, -0.35);
  armorLShape.lineTo(0.1, 0.35);
  armorLShape.lineTo(0, 0.35);
  const armorLGeom = new THREE.ExtrudeGeometry(armorLShape, {
    depth: 0.45,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2
  });
  armorLGeom.center();
  const armorL = new THREE.Mesh(armorLGeom, accentMat);
  armorL.name = 'armor_left';
  armorL.position.x = -0.6;
  armorL.castShadow = true;
  body.add(armorL);
  
  const armorR = new THREE.Mesh(armorLGeom.clone(), accentMat);
  armorR.name = 'armor_right';
  armorR.position.x = 0.6;
  armorR.castShadow = true;
  body.add(armorR);
  
  // Eyes - keep as spheres (round joints)
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), eyeMat);
  eyeL.name = 'eye_left';
  eyeL.position.set(-0.3, 0.35, 0.55);
  body.add(eyeL);
  
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), eyeMat);
  eyeR.name = 'eye_right';
  eyeR.position.set(0.3, 0.35, 0.55);
  body.add(eyeR);
  
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), pupilMat);
  pupilL.position.z = 0.11;
  eyeL.add(pupilL);
  
  const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), pupilMat);
  pupilR.position.z = 0.11;
  eyeR.add(pupilR);
  
  // 8 arms radiating from body - with flat machined segments
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const armRoot = new THREE.Group();
    armRoot.name = `arm_${i}`;
    armRoot.position.x = Math.cos(angle) * 0.65;
    armRoot.position.z = Math.sin(angle) * 0.65;
    body.add(armRoot);
    
    // 5 tapered segments per arm with rectangular beveled geometry
    let parent = armRoot;
    for (let seg = 0; seg < 5; seg++) {
      const r = 0.13 - seg * 0.025;
      const nextR = (seg < 4) ? (0.13 - (seg + 1) * 0.025) : 0.035;
      
      // Create a 2D tapered rectangular profile
      const armShape = new THREE.Shape();
      armShape.moveTo(-r, 0);
      armShape.lineTo(r, 0);
      armShape.lineTo(nextR, 0.45);
      armShape.lineTo(-nextR, 0.45);
      
      // Extrude with bevel for flat machined look
      const segGeom = new THREE.ExtrudeGeometry(armShape, {
        depth: r * 1.2,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.015,
        bevelSegments: 2
      });
      
      // Center the extrusion in Z axis
      segGeom.translate(0, 0, -r * 0.6);
      
      const segment = new THREE.Mesh(segGeom, frameMat);
      segment.name = `arm_${i}_seg${seg}`;
      segment.position.y = -0.225 - seg * 0.225;
      segment.castShadow = true;
      parent.add(segment);
      
      // Suction cups - small geometric details
      if (seg > 0 && seg < 5) {
        const cupGeom = new THREE.CylinderGeometry(0.045, 0.035, 0.04, 8);
        const cup = new THREE.Mesh(cupGeom, accentMat);
        cup.position.x = 0.12;
        segment.add(cup);
      }
      
      parent = segment;
    }
  }
  
  // Harness - tubes and cables
  const harness = new THREE.Group();
  harness.name = 'harness';
  octopus.add(harness);
  
  // Main spine tube - runs down center
  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.8, -0.15),
    new THREE.Vector3(0, 0.4, -0.2),
    new THREE.Vector3(0, 0, -0.25),
    new THREE.Vector3(0, -0.4, -0.3),
    new THREE.Vector3(0, -0.8, -0.35)
  ]);
  const spineGeom = new THREE.TubeGeometry(spineCurve, 20, 0.08, 4);
  const spineTube = new THREE.Mesh(spineGeom, tubeMat);
  spineTube.name = 'harness_spine';
  spineTube.castShadow = true;
  harness.add(spineTube);
  
  // Left shoulder to hip
  const leftShoulderCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.6, 0.4, -0.15),
    new THREE.Vector3(-0.75, 0.15, -0.2),
    new THREE.Vector3(-0.85, -0.2, -0.25),
    new THREE.Vector3(-0.75, -0.6, -0.3)
  ]);
  const leftShoulderGeom = new THREE.TubeGeometry(leftShoulderCurve, 15, 0.06, 3);
  const leftShoulderTube = new THREE.Mesh(leftShoulderGeom, tubeMat);
  leftShoulderTube.name = 'harness_left_shoulder';
  leftShoulderTube.castShadow = true;
  harness.add(leftShoulderTube);
  
  // Right shoulder to hip
  const rightShoulderCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.6, 0.4, -0.15),
    new THREE.Vector3(0.75, 0.15, -0.2),
    new THREE.Vector3(0.85, -0.2, -0.25),
    new THREE.Vector3(0.75, -0.6, -0.3)
  ]);
  const rightShoulderGeom = new THREE.TubeGeometry(rightShoulderCurve, 15, 0.06, 3);
  const rightShoulderTube = new THREE.Mesh(rightShoulderGeom, tubeMat);
  rightShoulderTube.name = 'harness_right_shoulder';
  rightShoulderTube.castShadow = true;
  harness.add(rightShoulderTube);
  
  // Left front cable
  const leftFrontCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.5, 0.3, 0.35),
    new THREE.Vector3(-0.65, 0.05, 0.4),
    new THREE.Vector3(-0.75, -0.35, 0.42),
    new THREE.Vector3(-0.65, -0.75, 0.35)
  ]);
  const leftFrontGeom = new THREE.TubeGeometry(leftFrontCurve, 12, 0.04, 2);
  const leftFrontTube = new THREE.Mesh(leftFrontGeom, wireMat);
  leftFrontTube.name = 'harness_left_front';
  harness.add(leftFrontTube);
  
  // Right front cable
  const rightFrontCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.5, 0.3, 0.35),
    new THREE.Vector3(0.65, 0.05, 0.4),
    new THREE.Vector3(0.75, -0.35, 0.42),
    new THREE.Vector3(0.65, -0.75, 0.35)
  ]);
  const rightFrontGeom = new THREE.TubeGeometry(rightFrontCurve, 12, 0.04, 2);
  const rightFrontTube = new THREE.Mesh(rightFrontGeom, wireMat);
  rightFrontTube.name = 'harness_right_front';
  harness.add(rightFrontTube);
  
  // Diagonal braces
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const x1 = Math.cos(angle) * 0.4;
    const z1 = Math.sin(angle) * 0.4;
    const diagonalCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(x1 * 0.7, 0.15, z1 * 0.7),
      new THREE.Vector3(x1, -0.4, z1)
    ]);
    const diagonalGeom = new THREE.TubeGeometry(diagonalCurve, 10, 0.03, 2);
    const diagonalTube = new THREE.Mesh(diagonalGeom, wireMat);
    diagonalTube.name = `harness_diagonal_${i}`;
    harness.add(diagonalTube);
  }
  
  // Circumferential harness runs
  for (let ring = 0; ring < 3; ring++) {
    const yPos = 0.4 - ring * 0.4;
    const circularCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.75, yPos, -0.05),
      new THREE.Vector3(0.05, yPos, 0.75),
      new THREE.Vector3(-0.75, yPos, 0.05),
      new THREE.Vector3(-0.05, yPos, -0.75),
      new THREE.Vector3(0.75, yPos, -0.05)
    ]);
    const circularGeom = new THREE.TubeGeometry(circularCurve, 20, 0.04, 2);
    const circularTube = new THREE.Mesh(circularGeom, tubeMat);
    circularTube.name = `harness_circumferential_${ring}`;
    harness.add(circularTube);
  }
  
  // Arm branch runs to each arm
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const armX = Math.cos(angle) * 0.65;
    const armZ = Math.sin(angle) * 0.65;
    const armBranchCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(armX * 0.5, -0.1, armZ * 0.5),
      new THREE.Vector3(armX, -0.3, armZ)
    ]);
    const armBranchGeom = new THREE.TubeGeometry(armBranchCurve, 8, 0.035, 2);
    const armBranchTube = new THREE.Mesh(armBranchGeom, wireMat);
    armBranchTube.name = `harness_arm_${i}`;
    harness.add(armBranchTube);
  }
  
  // Detailed small parts - hundreds of components
  const details = new THREE.Group();
  details.name = 'details';
  octopus.add(details);
  
  const boltHeadGeom = new THREE.CylinderGeometry(0.035, 0.035, 0.015, 6);
  const nutGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.012, 6);
  const clampGeom = new THREE.BoxGeometry(0.06, 0.045, 0.1);
  const connectorGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 6);
  const blankGeom = new THREE.BoxGeometry(0.12, 0.12, 0.015);
  const boltGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.08, 4);
  const cableGrommetGeom = new THREE.TorusGeometry(0.04, 0.015, 8, 16);
  const ribGeom = new THREE.BoxGeometry(0.02, 0.08, 0.08);
  
  // Bolts around armor plates
  for (let i = 0; i < 50; i++) {
    const bolt = new THREE.Mesh(boltHeadGeom, frameMat);
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.6 + Math.random() * 0.2;
    bolt.position.set(
      Math.cos(angle) * radius,
      -0.7 + Math.random() * 1.4,
      Math.sin(angle) * radius
    );
    bolt.rotation.x = Math.random() * Math.PI * 2;
    bolt.name = `bolt_${i}`;
    details.add(bolt);
  }
  
  // Cable clamps all over
  for (let i = 0; i < 80; i++) {
    const clamp = new THREE.Mesh(clampGeom, frameMat);
    clamp.position.set(
      -0.85 + Math.random() * 1.7,
      -0.95 + Math.random() * 1.9,
      -0.4 + Math.random() * 0.8
    );
    clamp.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    clamp.scale.set(0.6 + Math.random() * 0.4, 0.6 + Math.random() * 0.4, 0.6 + Math.random() * 0.4);
    clamp.name = `clamp_${i}`;
    details.add(clamp);
  }
  
  // Connectors and ports
  for (let i = 0; i < 30; i++) {
    const connector = new THREE.Mesh(connectorGeom, shellMat);
    connector.position.set(
      -0.7 + Math.random() * 1.4,
      -0.8 + Math.random() * 1.6,
      -0.25 + Math.random() * 0.5
    );
    connector.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    connector.name = `connector_${i}`;
    details.add(connector);
  }
  
  // Blanking plates
  for (let i = 0; i < 40; i++) {
    const blank = new THREE.Mesh(blankGeom, frameMat);
    blank.position.set(
      -0.75 + Math.random() * 1.5,
      -0.85 + Math.random() * 1.7,
      -0.3 + Math.random() * 0.6
    );
    blank.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    blank.name = `blank_${i}`;
    details.add(blank);
  }
  
  // Bolts and fasteners
  for (let i = 0; i < 100; i++) {
    const bolt = new THREE.Mesh(boltGeom, frameMat);
    bolt.position.set(
      -0.8 + Math.random() * 1.6,
      -0.9 + Math.random() * 1.8,
      -0.35 + Math.random() * 0.7
    );
    bolt.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    bolt.scale.set(0.4 + Math.random() * 0.6, 0.4 + Math.random() * 0.6, 0.4 + Math.random() * 0.6);
    bolt.name = `fastener_${i}`;
    details.add(bolt);
  }
  
  // Nuts and washers
  for (let i = 0; i < 60; i++) {
    const nut = new THREE.Mesh(nutGeom, frameMat);
    nut.position.set(
      -0.75 + Math.random() * 1.5,
      -0.8 + Math.random() * 1.6,
      -0.3 + Math.random() * 0.6
    );
    nut.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    nut.name = `nut_${i}`;
    details.add(nut);
  }
  
  // Cable grommets
  for (let i = 0; i < 35; i++) {
    const grommet = new THREE.Mesh(cableGrommetGeom, frameMat);
    grommet.position.set(
      -0.7 + Math.random() * 1.4,
      -0.85 + Math.random() * 1.7,
      -0.3 + Math.random() * 0.6
    );
    grommet.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    grommet.scale.set(0.5 + Math.random() * 0.5, 0.5 + Math.random() * 0.5, 0.5 + Math.random() * 0.5);
    grommet.name = `grommet_${i}`;
    details.add(grommet);
  }
  
  // Ribs and stiffeners
  for (let i = 0; i < 45; i++) {
    const rib = new THREE.Mesh(ribGeom, frameMat);
    rib.position.set(
      -0.75 + Math.random() * 1.5,
      -0.8 + Math.random() * 1.6,
      -0.3 + Math.random() * 0.6
    );
    rib.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    rib.scale.set(0.5 + Math.random() * 0.5, 0.5 + Math.random() * 0.5, 0.5 + Math.random() * 0.5);
    rib.name = `rib_${i}`;
    details.add(rib);
  }
  
  // Grab handles
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(angle) * 0.5, 0.4, Math.sin(angle) * 0.5),
      new THREE.Vector3(Math.cos(angle) * 0.6, 0.6, Math.sin(angle) * 0.6),
      new THREE.Vector3(Math.cos(angle) * 0.5, 0.8, Math.sin(angle) * 0.5)
    ]);
    const handleGeom = new THREE.TubeGeometry(handleCurve, 8, 0.02, 3);
    const handle = new THREE.Mesh(handleGeom, frameMat);
    handle.name = `handle_${i}`;
    details.add(handle);
  }
  
  octopus.userData.pose = (s) => {
    const b = octopus.getObjectByName('body');
    if (!b) return;
    
    // Reset to rest
    b.position.copy(new THREE.Vector3());
    b.rotation.order = 'YXZ';
    b.rotation.set(0, 0, 0);
    b.scale.set(1, 1, 1);
    
    // Reset all arms
    for (let i = 0; i < 8; i++) {
      const arm = octopus.getObjectByName(`arm_${i}`);
      if (arm) {
        arm.rotation.order = 'ZYX';
        arm.rotation.set(0, 0, 0);
      }
    }
    
    // Health injuries
    const hurtLean = (1 - s.health) * 0.25;
    const hurtDrop = -(1 - s.health) * 0.3;
    
    if (s.action) {
      switch (s.action) {
        case 'attack':
          actionAttack(octopus, s, hurtLean, hurtDrop);
          break;
        case 'fire':
          actionFire(octopus, s, hurtLean, hurtDrop);
          break;
        case 'hit':
          actionHit(octopus, s, hurtLean, hurtDrop);
          break;
        case 'block':
          actionBlock(octopus, s, hurtLean, hurtDrop);
          break;
        case 'gather':
          actionGather(octopus, s, hurtLean, hurtDrop);
          break;
        case 'deposit':
          actionDeposit(octopus, s, hurtLean, hurtDrop);
          break;
        case 'eat':
          actionEat(octopus, s, hurtLean, hurtDrop);
          break;
        case 'drink':
          actionDrink(octopus, s, hurtLean, hurtDrop);
          break;
        case 'jump':
          actionJump(octopus, s, hurtLean, hurtDrop);
          break;
        case 'land':
          actionLand(octopus, s, hurtLean, hurtDrop);
          break;
        case 'signal':
          actionSignal(octopus, s, hurtLean, hurtDrop);
          break;
        case 'sleep':
          actionSleep(octopus, s, hurtLean, hurtDrop);
          break;
        case 'wake':
          actionWake(octopus, s, hurtLean, hurtDrop);
          break;
        case 'die':
          actionDie(octopus, s, hurtLean, hurtDrop);
          break;
        case 'evolve':
          actionEvolve(octopus, s, hurtLean, hurtDrop);
          break;
        default:
          poseLocomotion(octopus, s, hurtLean, hurtDrop);
      }
    } else {
      poseLocomotion(octopus, s, hurtLean, hurtDrop);
    }
    
    // Airborne overlay
    if (!s.grounded) {
      for (let i = 0; i < 8; i++) {
        const arm = octopus.getObjectByName(`arm_${i}`);
        if (arm) {
          arm.rotation.x = 0.3;
        }
      }
    }
  };
  
  function poseLocomotion(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const speedFactor = Math.min(s.speed / 6, 1);
    
    const breathe = 0.05 + 0.05 * Math.sin(s.t * 1.5);
    b.scale.set(1 + breathe * 0.15, 1 - breathe * 0.08, 1 + breathe * 0.15);
    
    b.rotation.y = s.turn * 0.4;
    b.rotation.z = hurtLean;
    b.position.y = hurtDrop;
    
    if (s.speed < 0.1) {
      for (let i = 0; i < 8; i++) {
        const arm = octopus.getObjectByName(`arm_${i}`);
        if (arm) {
          const drift = Math.sin(s.t * 0.8 + i * Math.PI / 4) * 0.2;
          arm.rotation.x = drift * 0.3;
          arm.rotation.z = Math.cos(s.t * 0.6 + i) * 0.15;
        }
      }
    } else {
      for (let i = 0; i < 8; i++) {
        const arm = octopus.getObjectByName(`arm_${i}`);
        if (arm) {
          const wavePhase = s.stride * Math.PI * 2 - (i / 8) * Math.PI * 1.2;
          const bend = Math.sin(wavePhase);
          const twist = Math.cos(wavePhase) * 0.25 * speedFactor;
          
          arm.rotation.x = bend * (0.4 + speedFactor * 0.5);
          arm.rotation.z = twist;
          arm.rotation.y = twist * 0.4;
        }
      }
    }
  }
  
  function actionAttack(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    if (p < 0.35) {
      const draw = p / 0.35;
      b.position.z = -0.35 * draw;
      b.rotation.y = 0.45 * draw;
    } else if (p < 0.75) {
      const strike = (p - 0.35) / 0.4;
      b.position.z = -0.35 + strike * 0.7;
      
      const arm = octopus.getObjectByName('arm_4');
      if (arm) arm.rotation.x = -1.2 * strike;
    } else {
      const recover = (p - 0.75) / 0.25;
      b.position.z = 0.35 - recover * 0.35;
      b.rotation.y = 0.45 - recover * 0.45;
      
      const arm = octopus.getObjectByName('arm_4');
      if (arm) arm.rotation.x = -1.2 + recover * 1.2;
    }
    
    b.rotation.z = hurtLean;
    b.position.y = hurtDrop;
  }
  
  function actionFire(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    if (p < 0.4) {
      const aim = p / 0.4;
      const arm2 = octopus.getObjectByName('arm_2');
      if (arm2) {
        arm2.rotation.x = -1.0 * aim;
        arm2.rotation.z = 0.5 * aim;
      }
      b.rotation.x = -0.2 * aim;
    } else if (p < 0.6) {
      const arm2 = octopus.getObjectByName('arm_2');
      if (arm2) {
        arm2.rotation.x = -1.0;
        arm2.rotation.z = 0.5;
      }
    } else {
      const recover = (p - 0.6) / 0.4;
      b.position.z = -0.2 * (1 - recover);
      
      const arm2 = octopus.getObjectByName('arm_2');
      if (arm2) {
        arm2.rotation.x = -1.0 + recover * 1.0;
        arm2.rotation.z = 0.5 - recover * 0.5;
      }
    }
    
    b.rotation.z = hurtLean;
    b.position.y = hurtDrop;
  }
  
  function actionHit(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    if (p < 0.25) {
      const flinch = p / 0.25;
      b.position.z = -0.5 * flinch;
      b.rotation.y = -0.4 * flinch;
    } else {
      const settle = (p - 0.25) / 0.75;
      b.position.z = -0.5 + settle * 0.5;
      b.rotation.y = -0.4 + settle * 0.4;
    }
    
    b.rotation.z = hurtLean + 0.3 * (1 - Math.abs(2 * p - 1));
    b.position.y = hurtDrop;
  }
  
  function actionBlock(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    b.position.y = -0.2 + hurtDrop;
    b.rotation.x = 0.3;
    b.rotation.z = hurtLean;
    
    for (let i = 0; i < 8; i++) {
      const arm = octopus.getObjectByName(`arm_${i}`);
      if (arm) arm.rotation.x = 0.6;
    }
  }
  
  function actionGather(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    if (p < 0.4) {
      const reach = p / 0.4;
      b.position.y = -0.4 * reach + hurtDrop;
      b.rotation.x = 0.5 * reach;
    } else if (p < 0.7) {
      b.position.y = -0.4 + hurtDrop;
      b.rotation.x = 0.5;
      
      for (let i = 0; i < 8; i++) {
        const arm = octopus.getObjectByName(`arm_${i}`);
        if (arm) arm.rotation.x = 1.0 * (p - 0.4) / 0.3;
      }
    } else {
      const rise = (p - 0.7) / 0.3;
      b.position.y = -0.4 + rise * 0.4 + hurtDrop;
      b.rotation.x = 0.5 - rise * 0.5;
    }
    
    b.rotation.z = hurtLean;
  }
  
  function actionDeposit(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    if (p < 0.35) {
      const lower = p / 0.35;
      b.position.y = -0.35 * lower + hurtDrop;
      b.rotation.x = 0.4 * lower;
    } else if (p < 0.65) {
      b.position.y = -0.35 + hurtDrop;
      b.rotation.x = 0.4;
      
      for (let i = 0; i < 8; i++) {
        const arm = octopus.getObjectByName(`arm_${i}`);
        if (arm) arm.rotation.x = 0.8 - 0.8 * (p - 0.35) / 0.3;
      }
    } else {
      const rise = (p - 0.65) / 0.35;
      b.position.y = -0.35 + rise * 0.35 + hurtDrop;
      b.rotation.x = 0.4 - rise * 0.4;
    }
    
    b.rotation.z = hurtLean;
  }
  
  function actionEat(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    b.position.y = -0.3 + hurtDrop;
    b.rotation.x = 0.4;
    b.rotation.z = hurtLean;
    
    const cycles = s.phase * 3 * Math.PI * 2;
    const bite = Math.sin(cycles);
    b.scale.z = 0.9 + bite * 0.1;
  }
  
  function actionDrink(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    if (p < 0.3) {
      const lower = p / 0.3;
      b.position.y = -0.4 * lower + hurtDrop;
      b.rotation.x = 0.5 * lower;
    } else if (p < 0.8) {
      b.position.y = -0.4 + hurtDrop;
      b.rotation.x = 0.5;
    } else {
      const rise = (p - 0.8) / 0.2;
      b.position.y = -0.4 + rise * 0.4 + hurtDrop;
      b.rotation.x = 0.5 - rise * 0.5;
    }
    
    b.rotation.z = hurtLean;
  }
  
  function actionJump(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    if (p < 0.4) {
      const crouch = p / 0.4;
      b.position.y = -0.35 * crouch + hurtDrop;
      b.scale.set(1.15, 0.65, 1.15);
    } else {
      const launch = (p - 0.4) / 0.6;
      b.position.y = -0.35 + launch * 1.5 + hurtDrop;
      b.scale.set(1.15 - 0.15 * launch, 0.65 + 0.35 * launch, 1.15 - 0.15 * launch);
    }
    
    b.rotation.z = hurtLean;
  }
  
  function actionLand(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    if (p < 0.3) {
      b.position.y = 1.5 - 1.5 * (p / 0.3) + hurtDrop;
    } else if (p < 0.7) {
      const compress = (p - 0.3) / 0.4;
      b.position.y = hurtDrop;
      b.scale.set(1 + compress * 0.15, 1 - compress * 0.3, 1 + compress * 0.15);
    } else {
      const settle = (p - 0.7) / 0.3;
      b.scale.set(1 + 0.15 - settle * 0.15, 0.7 + settle * 0.3, 1 + 0.15 - settle * 0.15);
    }
    
    b.rotation.z = hurtLean;
  }
  
  function actionSignal(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    if (p < 0.35) {
      const rise = p / 0.35;
      b.position.y = 0.4 * rise + hurtDrop;
      b.scale.set(1.2, 1.15, 1.2);
      
      for (let i = 0; i < 8; i++) {
        const arm = octopus.getObjectByName(`arm_${i}`);
        if (arm) arm.rotation.x = -0.8 * rise;
      }
    } else if (p < 0.75) {
      b.position.y = 0.4 + hurtDrop;
      b.scale.set(1.2, 1.15, 1.2);
      
      for (let i = 0; i < 8; i++) {
        const arm = octopus.getObjectByName(`arm_${i}`);
        if (arm) arm.rotation.x = -0.8;
      }
    } else {
      const close = (p - 0.75) / 0.25;
      b.position.y = 0.4 - close * 0.4 + hurtDrop;
      b.scale.set(1.2 - close * 0.2, 1.15 - close * 0.15, 1.2 - close * 0.2);
    }
    
    b.rotation.z = hurtLean;
  }
  
  function actionSleep(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = Math.min(s.phase, 1);
    
    b.position.y = -1.2 * p + hurtDrop;
    b.rotation.x = 0.6 * p;
    b.rotation.z = hurtLean + 0.3 * p;
    b.scale.set(1 - 0.1 * p, 1 - 0.2 * p, 1 - 0.05 * p);
    
    for (let i = 0; i < 8; i++) {
      const arm = octopus.getObjectByName(`arm_${i}`);
      if (arm) {
        arm.rotation.x = 1.8 * p;
        arm.rotation.z = (i % 2 ? 1 : -1) * 0.8 * p;
      }
    }
  }
  
  function actionWake(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    b.position.y = -1.2 + 1.2 * p + hurtDrop;
    b.rotation.x = 0.6 - 0.6 * p;
    b.rotation.z = hurtLean + 0.3 - 0.3 * p;
    b.scale.set(0.9 + 0.1 * p, 0.8 + 0.2 * p, 0.95 + 0.05 * p);
    
    for (let i = 0; i < 8; i++) {
      const arm = octopus.getObjectByName(`arm_${i}`);
      if (arm) {
        arm.rotation.x = 1.8 - 1.8 * p;
        arm.rotation.z = (i % 2 ? 1 : -1) * 0.8 - p * 0.8;
      }
    }
  }
  
  function actionDie(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    b.position.y = -1.8 * p + hurtDrop;
    b.rotation.x = 0.8 * p;
    b.rotation.z = hurtLean + 0.5 * p;
    b.scale.set(1 - 0.2 * p, 1 - 0.35 * p, 1 - 0.1 * p);
    
    for (let i = 0; i < 8; i++) {
      const arm = octopus.getObjectByName(`arm_${i}`);
      if (arm) {
        arm.rotation.x = -0.9 * p;
        arm.rotation.z = (i % 2 ? 1 : -1) * 0.6 * p;
      }
    }
  }
  
  function actionEvolve(octopus, s, hurtLean, hurtDrop) {
    const b = octopus.getObjectByName('body');
    const p = s.phase;
    
    if (p < 0.35) {
      const open = p / 0.35;
      b.scale.set(1 + 0.15 * open, 1.1, 1 + 0.15 * open);
      
      for (let i = 0; i < 8; i++) {
        const arm = octopus.getObjectByName(`arm_${i}`);
        if (arm) arm.rotation.x = -0.6 * open;
      }
    } else if (p < 0.7) {
      b.scale.set(1.15, 1.1, 1.15);
      
      for (let i = 0; i < 8; i++) {
        const arm = octopus.getObjectByName(`arm_${i}`);
        if (arm) arm.rotation.x = -0.6;
      }
    } else {
      const close = (p - 0.7) / 0.3;
      b.scale.set(1.15 - close * 0.15, 1.1 - close * 0.1, 1.15 - close * 0.15);
      
      for (let i = 0; i < 8; i++) {
        const arm = octopus.getObjectByName(`arm_${i}`);
        if (arm) arm.rotation.x = -0.6 + close * 0.6;
      }
    }
    
    b.rotation.z = hurtLean;
    b.position.y = hurtDrop;
  }
  
  return octopus;
}
;return build(THREE, TSL);
```