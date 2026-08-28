```javascript
function build(THREE, TSL) {
  // ARMOURED OCTOPUS — Mass and Power
  // A low-slung cephalopod with heavy segmented body armour, eight thick muscular
  // arms with articulated suckers, recessed optics in a brow-plated head, prominent
  // beak visible in a hinged lower mandible. Density in the torso, packed mechanism
  // in every joint. Eight separate arm chains, each articulated to the wrist. Rising
  // to the front, dropping to the rear; mass forward over the suckers.

  const root = new THREE.Group();
  root.name = 'octopus';

  // ─── PALETTE ───
  const palette = {
    shellWhite: 0xD8D2C6,
    shellShadow: 0xC9C2B4,
    shellWorn: 0xB5AC9C,
    gunmetal: 0x55524C,
    machined: 0x6B665E,
    blued: 0x3E3A34,
    bronze: 0x4A4238,
    cable: 0x1E1D1B,
    rust: 0xC2521E
  };

  // ─── MATERIALS ───
  const matShell = new THREE.MeshStandardMaterial({
    color: palette.shellWhite,
    metalness: 0.1,
    roughness: 0.6
  });

  const matMachine = new THREE.MeshStandardMaterial({
    color: palette.gunmetal,
    metalness: 0.8,
    roughness: 0.55
  });

  const matMachined = new THREE.MeshStandardMaterial({
    color: palette.machined,
    metalness: 0.75,
    roughness: 0.5
  });

  const matWorn = new THREE.MeshStandardMaterial({
    color: palette.shellWorn,
    metalness: 0.15,
    roughness: 0.65
  });

  const matCable = new THREE.MeshStandardMaterial({
    color: palette.cable,
    metalness: 0.0,
    roughness: 0.9
  });

  const matGlass = new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    metalness: 0.1,
    roughness: 0.08,
    emissive: 0x1a3a4a,
    emissiveIntensity: 0.3
  });

  // ─── SPINE CURVE ───
  const spinePoints = [
    new THREE.Vector3(0, 0.4, -0.15),
    new THREE.Vector3(0, 0.2, 0),
    new THREE.Vector3(0, 0, 0.3),
    new THREE.Vector3(0, -0.15, 0.5)
  ];
  const spineCurve = new THREE.CatmullRomCurve3(spinePoints);

  // ─── 1. FRAME ───
  const frame = new THREE.Group();
  frame.name = 'frame';
  root.add(frame);

  // Torso segment positions along spine
  const torsoPos = [];
  for (let i = 0; i <= 3; i++) {
    torsoPos.push(spineCurve.getPoint(i / 3));
  }

  // ─── 2. LEADING END (HEAD) ───
  const head = new THREE.Group();
  head.name = 'head';
  head.position.copy(torsoPos[0]);
  frame.add(head);

  // Head brow plate
  const browShape = new THREE.Shape();
  browShape.moveTo(-0.12, 0);
  browShape.lineTo(0.12, 0);
  browShape.quadraticCurveTo(0.13, -0.06, 0.12, -0.1);
  browShape.lineTo(-0.12, -0.1);
  browShape.quadraticCurveTo(-0.13, -0.06, -0.12, 0);
  const browGeo = new THREE.ExtrudeGeometry(browShape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelSize: 0.01,
    bevelThickness: 0.01,
    bevelSegments: 2
  });
  const brow = new THREE.Mesh(browGeo, matShell);
  brow.name = 'brow';
  brow.position.z = 0.02;
  head.add(brow);

  // Upper mandible
  const upperMandShape = new THREE.Shape();
  upperMandShape.moveTo(-0.1, 0);
  upperMandShape.lineTo(0.1, 0);
  upperMandShape.quadraticCurveTo(0.11, -0.04, 0.08, -0.08);
  upperMandShape.lineTo(-0.08, -0.08);
  upperMandShape.quadraticCurveTo(-0.11, -0.04, -0.1, 0);
  const upperMandGeo = new THREE.ExtrudeGeometry(upperMandShape, {
    depth: 0.07,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    bevelSegments: 2
  });
  const upperMand = new THREE.Mesh(upperMandGeo, matMachined);
  upperMand.name = 'upper_mandible';
  upperMand.position.z = 0.05;
  head.add(upperMand);

  // Hinged lower mandible
  const lowerMandible = new THREE.Group();
  lowerMandible.name = 'lower_mandible';
  lowerMandible.position.set(0, -0.06, 0.05);
  head.add(lowerMandible);

  const lowerMandShape = new THREE.Shape();
  lowerMandShape.moveTo(-0.08, 0);
  lowerMandShape.lineTo(0.08, 0);
  lowerMandShape.lineTo(0.09, -0.06);
  lowerMandShape.lineTo(-0.09, -0.06);
  const lowerMandGeo = new THREE.ExtrudeGeometry(lowerMandShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelSize: 0.006,
    bevelThickness: 0.006,
    bevelSegments: 2
  });
  const lowerMand = new THREE.Mesh(lowerMandGeo, matShell);
  lowerMand.name = 'lower_mandible_shell';
  lowerMandible.add(lowerMand);

  // Beaked centre (visible between mandibles)
  const beakGeo = new THREE.ConeGeometry(0.016, 0.05, 6);
  const beak = new THREE.Mesh(beakGeo, matMachine);
  beak.name = 'beak';
  beak.position.set(0, -0.02, 0.08);
  beak.rotation.x = Math.PI / 2;
  head.add(beak);

  // Eye sockets and optics
  const eyeSocketL = new THREE.Group();
  eyeSocketL.name = 'eye_socket_L';
  eyeSocketL.position.set(-0.06, 0.02, 0.08);
  head.add(eyeSocketL);

  const eyeBevelL = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12);
  const eyeBevel = new THREE.Mesh(eyeBevelL, matMachined);
  eyeSocketL.add(eyeBevel);

  const lensL = new THREE.SphereGeometry(0.015, 8, 8);
  const lens = new THREE.Mesh(lensL, matGlass);
  lens.position.z = 0.008;
  eyeSocketL.add(lens);

  const eyeSocketR = eyeSocketL.clone();
  eyeSocketR.name = 'eye_socket_R';
  eyeSocketR.position.x = 0.06;
  head.add(eyeSocketR);

  // Head housing (rear)
  const headHousingGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.07, 8, 2, true, 0, Math.PI);
  const headHousing = new THREE.Mesh(headHousingGeo, matShell);
  headHousing.name = 'head_housing';
  headHousing.rotation.z = Math.PI / 2;
  headHousing.position.z = -0.02;
  head.add(headHousing);

  // ─── TORSO SEGMENTS ───
  const torsoSegments = [];
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.name = `torso_segment_${i}`;
    seg.position.copy(torsoPos[i]);

    if (i > 0) {
      torsoSegments[i - 1].add(seg);
    } else {
      head.add(seg);
    }

    torsoSegments.push(seg);

    // Segment block
    const scale = 0.14 - i * 0.02;
    const blockGeo = new THREE.BoxGeometry(scale * 2, scale * 1.8, scale);
    const block = new THREE.Mesh(blockGeo, matMachined);
    block.name = `torso_block_${i}`;
    seg.add(block);

    // Bearing ring
    const ringGeo = new THREE.TorusGeometry(scale * 1.1, 0.008, 8, 12);
    const ring = new THREE.Mesh(ringGeo, matMachine);
    ring.name = `torso_bearing_${i}`;
    ring.rotation.y = Math.PI / 2;
    seg.add(ring);

    // Side plates (left and right)
    const plateShape = new THREE.Shape();
    plateShape.moveTo(0, -scale * 0.9);
    plateShape.lineTo(scale * 1.5, -scale * 0.9);
    plateShape.quadraticCurveTo(scale * 1.6, 0, scale * 1.5, scale * 0.9);
    plateShape.lineTo(0, scale * 0.9);

    const plateGeo = new THREE.ExtrudeGeometry(plateShape, {
      depth: 0.015,
      bevelEnabled: true,
      bevelSize: 0.003,
      bevelThickness: 0.003,
      bevelSegments: 1
    });

    const plateL = new THREE.Mesh(plateGeo, matShell);
    plateL.name = `torso_plate_L_${i}`;
    plateL.position.x = -scale * 1.1;
    plateL.position.z = scale * 0.4;
    seg.add(plateL);

    const plateR = plateL.clone();
    plateR.name = `torso_plate_R_${i}`;
    plateR.position.x = scale * 1.1;
    plateR.scale.x = -1;
    seg.add(plateR);

    // Chain run along spine
    if (i < 3) {
      for (let j = 0; j < 4; j++) {
        const linkGeo = new THREE.BoxGeometry(0.008, 0.012, 0.008);
        const link = new THREE.Mesh(linkGeo, matMachine);
        link.name = `chain_link_${i}_${j}`;
        link.position.y = -scale * 0.4 + (j * scale * 0.2);
        seg.add(link);
      }
    }
  }

  // ─── 3. ARMS (8 total) ───
  const arms = [];
  const armPositions = [
    { angle: 0, y: -0.04 },
    { angle: Math.PI / 4, y: -0.02 },
    { angle: Math.PI / 2, y: 0 },
    { angle: 3 * Math.PI / 4, y: -0.02 },
    { angle: Math.PI, y: -0.04 },
    { angle: 5 * Math.PI / 4, y: -0.06 },
    { angle: 3 * Math.PI / 2, y: -0.08 },
    { angle: 7 * Math.PI / 4, y: -0.06 }
  ];

  for (let armIdx = 0; armIdx < 8; armIdx++) {
    const armRoot = new THREE.Group();
    armRoot.name = `arm_${armIdx}`;

    const aPos = armPositions[armIdx];
    armRoot.position.set(
      Math.cos(aPos.angle) * 0.12,
      aPos.y,
      Math.sin(aPos.angle) * 0.1
    );

    torsoSegments[1].add(armRoot);
    arms.push(armRoot);

    // Shoulder barrel
    const shoulderGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.035, 8);
    const shoulder = new THREE.Mesh(shoulderGeo, matMachined);
    shoulder.name = `arm_shoulder_${armIdx}`;
    shoulder.rotation.z = Math.PI / 2;
    armRoot.add(shoulder);

    // Upper arm segments (3)
    let prevSegment = armRoot;
    for (let seg = 0; seg < 3; seg++) {
      const armSeg = new THREE.Group();
      armSeg.name = `arm_segment_${armIdx}_${seg}`;
      armSeg.position.z = 0.06 + seg * 0.055;
      prevSegment.add(armSeg);

      // Muscle block
      const muscleGeo = new THREE.CylinderGeometry(0.022, 0.02, 0.05, 6);
      const muscle = new THREE.Mesh(muscleGeo, matMachine);
      muscle.name = `arm_muscle_${armIdx}_${seg}`;
      muscle.rotation.z = Math.PI / 2;
      armSeg.add(muscle);

      // Joint barrel
      const jointGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.025, 8);
      const joint = new THREE.Mesh(jointGeo, matMachined);
      joint.name = `arm_joint_${armIdx}_${seg}`;
      joint.rotation.z = Math.PI / 2;
      joint.position.z = 0.035;
      armSeg.add(joint);

      // Actuator rod
      const rodGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.048, 4);
      const rod = new THREE.Mesh(rodGeo, matMachine);
      rod.name = `arm_rod_${armIdx}_${seg}`;
      rod.position.set(0.018, 0, 0.01);
      armSeg.add(rod);

      prevSegment = armSeg;
    }

    // Wrist
    const wrist = new THREE.Group();
    wrist.name = `arm_wrist_${armIdx}`;
    wrist.position.z = 0.22;
    prevSegment.add(wrist);

    const wristGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8);
    const wristMesh = new THREE.Mesh(wristGeo, matMachined);
    wrist.add(wristMesh);

    // Hand/Sucker cluster
    const hand = new THREE.Group();
    hand.name = `arm_hand_${armIdx}`;
    hand.position.z = 0.015;
    wrist.add(hand);

    // 6 suckers in a hexagonal pattern
    const suckerPositions = [
      { r: 0, a: 0 },
      { r: 0.012, a: 0 },
      { r: 0.012, a: Math.PI / 3 },
      { r: 0.012, a: 2 * Math.PI / 3 },
      { r: 0.012, a: Math.PI },
      { r: 0.012, a: 4 * Math.PI / 3 }
    ];

    for (let s = 0; s < 6; s++) {
      const sPos = suckerPositions[s];
      const suckerGeo = new THREE.CylinderGeometry(0.008, 0.006, 0.012, 8);
      const sucker = new THREE.Mesh(suckerGeo, matShell);
      sucker.name = `arm_sucker_${armIdx}_${s}`;
      sucker.position.set(
        Math.cos(sPos.a) * sPos.r,
        Math.sin(sPos.a) * sPos.r,
        0
      );
      hand.add(sucker);

      // Sucker texture (ridges)
      const ridgeGeo = new THREE.TorusGeometry(0.006, 0.001, 4, 6);
      const ridge = new THREE.Mesh(ridgeGeo, matWorn);
      ridge.position.z = 0.006;
      sucker.add(ridge);
    }
  }

  // ─── 4. CABLE HARNESS ───
  const harness = new THREE.Group();
  harness.name = 'harness';
  root.add(harness);

  // Main trunk line down the spine
  const trunkPoints = [
    new THREE.Vector3(-0.04, 0.35, -0.1),
    new THREE.Vector3(-0.04, 0.15, 0.1),
    new THREE.Vector3(-0.04, -0.05, 0.35),
    new THREE.Vector3(-0.04, -0.18, 0.48)
  ];
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPoints);
  const trunkTubeGeo = new THREE.TubeGeometry(trunkCurve, 20, 0.008, 6, false);
  const trunk = new THREE.Mesh(trunkTubeGeo, matCable);
  trunk.name = 'trunk_cable';
  harness.add(trunk);

  // Signal lines (thinner, paired)
  for (let side = 0; side < 2; side++) {
    const signalPoints = [
      new THREE.Vector3((side ? 1 : -1) * 0.025, 0.35, -0.1),
      new THREE.Vector3((side ? 1 : -1) * 0.025, 0.15, 0.1),
      new THREE.Vector3((side ? 1 : -1) * 0.025, -0.05, 0.35)
    ];
    const signalCurve = new THREE.CatmullRomCurve3(signalPoints);
    const signalTubeGeo = new THREE.TubeGeometry(signalCurve, 16, 0.003, 4, false);
    const signal = new THREE.Mesh(signalTubeGeo, matCable);
    signal.name = `signal_cable_${side}`;
    harness.add(signal);
  }

  // Arm harness branches (one per arm)
  for (let armIdx = 0; armIdx < 8; armIdx++) {
    const aPos = armPositions[armIdx];
    const armCablePoints = [
      new THREE.Vector3(
        Math.cos(aPos.angle) * 0.04,
        0,
        Math.sin(aPos.angle) * 0.04
      ),
      new THREE.Vector3(
        Math.cos(aPos.angle) * 0.15,
        -0.02,
        Math.sin(aPos.angle) * 0.12
      )
    ];
    const armCableCurve = new THREE.CatmullRomCurve3(armCablePoints);
    const armCableTubeGeo = new THREE.TubeGeometry(armCableCurve, 12, 0.0045, 5, false);
    const armCable = new THREE.Mesh(armCableTubeGeo, matCable);
    armCable.name = `arm_cable_${armIdx}`;
    harness.add(armCable);
  }

  // ─── 5. GREEBLES ───
  const greebles = new THREE.Group();
  greebles.name = 'greebles';
  root.add(greebles);

  // Bolt heads around shoulders and joints
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const boltGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.006, 6);
    const bolt = new THREE.Mesh(boltGeo, matMachine);
    bolt.name = `bolt_${i}`;
    bolt.position.set(
      Math.cos(angle) * 0.09,
      Math.sin(angle) * 0.07,
      0.02 + i * 0.01
    );
    greebles.add(bolt);
  }

  // Cable clamps
  for (let i = 0; i < 6; i++) {
    const clampGeo = new THREE.BoxGeometry(0.018, 0.006, 0.006);
    const clamp = new THREE.Mesh(clampGeo, matMachine);
    clamp.name = `clamp_${i}`;
    clamp.position.set(-0.04, 0.2 - i * 0.1, i * 0.05);
    greebles.add(clamp);
  }

  // Status port
  const portGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.004, 8);
  const port = new THREE.Mesh(portGeo, matMachined);
  port.name = 'status_port';
  port.position.set(0.06, 0.1, 0.2);
  port.emissive = new THREE.Color(0x0066aa);
  port.emissiveIntensity = 0.4;
  greebles.add(port);

  // Vent grille
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 3; y++) {
      const ventGeo = new THREE.BoxGeometry(0.005, 0.005, 0.002);
      const vent = new THREE.Mesh(ventGeo, matMachine);
      vent.name = `vent_${x}_${y}`;
      vent.position.set(-0.08 + x * 0.008, 0.05 + y * 0.008, 0.12);
      greebles.add(vent);
    }
  }

  // ─── POSE FUNCTION ───
  root.userData.pose = (s) => {
    // Calculate arm spread and lift based on speed and turn
    const speedFactor = Math.min(s.speed / 6, 1);
    const strideSin = Math.sin(s.stride * Math.PI * 2);
    const strideCos = Math.cos(s.stride * Math.PI * 2);

    // Torso rotation and flex
    torsoSegments.forEach((seg, idx) => {
      const t = idx / torsoSegments.length;

      if (s.action === 'attack') {
        const attackPhase = s.phase;
        seg.rotation.x = Math.sin(attackPhase * Math.PI) * 0.15;
        seg.rotation.z = Math.sin(attackPhase * Math.PI * 2) * 0.1;
      } else if (s.action === 'gather') {
        seg.rotation.x = Math.mix(-0.3, 0, Math.sin(s.phase * Math.PI));
      } else if (s.action === 'signal') {
        seg.rotation.z = Math.sin(s.phase * Math.PI) * 0.2;
        seg.rotation.x = -Math.sin(s.phase * Math.PI * 2) * 0.1;
      } else {
        // Gait-based flexing
        seg.rotation.x = strideSin * speedFactor * 0.06;
        seg.rotation.z = s.turn * speedFactor * 0.08 + strideCos * speedFactor * 0.04;
      }
    });

    // Head movement
    head.rotation.x = strideSin * 0.05 + (s.action === 'signal' ? Math.sin(s.phase * Math.PI) * 0.15 : 0);
    head.rotation.z = s.turn * 0.3;

    // Lower mandible
    const lowerMandible = head.getObjectByName('lower_mandible');
    if (lowerMandible) {
      if (s.action === 'eat') {
        lowerMandible.rotation.x = Math.sin(s.phase * Math.PI * 3) * 0.3;
      } else if (s.action === 'attack') {
        lowerMandible.rotation.x = -Math.sin(s.phase * Math.PI) * 0.4;
      } else {
        lowerMandible.rotation.x = 0;
      }
    }

    // Arm movement (8 arms in a circle)
    arms.forEach((arm, armIdx) => {
      const baseAngle = (armIdx / 8) * Math.PI * 2;

      // Arm lift and spread
      let armLift = 0;
      let armSpread = 0;

      if (s.action === 'attack') {
        // Attack: front arms strike forward
        const isForwardArm = armIdx < 2 || armIdx > 6;
        if (isForwardArm) {
          arm.rotation.z = -Math.sin(s.phase * Math.PI) * 0.5;
          arm.rotation.x = Math.sin(s.phase * Math.PI) * 0.3;
        }
      } else if (s.action === 'gather') {
        // Gather: arms reach down
        armLift = -0.2 + Math.sin(s.phase * Math.PI) * 0.2;
      } else if (s.action === 'signal') {
        // Signal: arms spread outward
        armSpread = Math.sin(s.phase * Math.PI) * 0.3;
      } else if (!s.grounded) {
        // Airborne: arms trail down
        armLift = -0.15;
      } else {
        // Walking/running gait
        armLift = Math.sin(s.stride * Math.PI * 2 + baseAngle) * speedFactor * 0.15;
      }

      arm.position.y = armPositions[armIdx].y + armLift;
      arm.rotation.x = armSpread * 0.5;

      // Arm segments articulation
      for (let seg = 0; seg < 3; seg++) {
        const segment = arm.getObjectByName(`arm_segment_${armIdx}_${seg}`);
        if (segment) {
          if (s.action === 'attack') {
            segment.rotation.z = Math.sin(s.phase * Math.PI) * 0.4;
          } else if (s.action === 'gather') {
            segment.rotation.z = -Math.sin(s.phase * Math.PI) * 0.3;
          } else {
            segment.rotation.z = strideSin * speedFactor * 0.08;
          }
        }
      }

      // Wrist
      const wrist = arm.getObjectByName(`arm_wrist_${armIdx}`);
      if (wrist) {
        if (s.action === 'attack' || s.action === 'gather') {
          wrist.rotation.z = Math.sin(s.phase * Math.PI * 2) * 0.2;
        } else {
          wrist.rotation.z = strideCos * speedFactor * 0.1;
        }
      }
    });

    // Health-based lean
    if (s.health < 1) {
      root.rotation.z = (1 - s.health) * 0.2;
      torsoSegments.forEach(seg => {
        seg.rotation.x += (1 - s.health) * 0.1;
      });
    }

    // Landing/jump
    if (s.action === 'land') {
      const landCompress = (1 - s.phase) * 0.1;
      root.scale.y = 1 - landCompress;
    } else if (s.action === 'jump') {
      const jumpExt = Math.max(0, Math.sin(s.phase * Math.PI)) * 0.15;
      root.position.y += jumpExt;
    }
  };

  return root;
}
```