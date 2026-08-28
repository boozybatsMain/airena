```javascript
function build(THREE, TSL) {
  // ARMOURED OCTOPUS — mass and power, low wide stance, dense central body
  // Eight articulated arms radiating from a domed mantle, each a chain of segments
  // Bone-white pressed metal shells over dark machine: rams, bearing races, chain runs
  // Low center of gravity, arms curve and reach, the mantle is the thickest mass

  const body = new THREE.Group();
  body.name = 'octopus';

  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xD8D2C6,
    metalness: 0.1,
    roughness: 0.65,
  });

  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x3E3A34,
    metalness: 0.75,
    roughness: 0.55,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xC2521E,
    metalness: 0.6,
    roughness: 0.7,
  });

  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x1E1D1B,
    metalness: 0.2,
    roughness: 0.8,
  });

  // MANTLE — central body, low and wide
  const mantle = new THREE.Group();
  mantle.name = 'mantle';
  body.add(mantle);

  // Core frame: stacked segments down the mantle spine
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.35, 8, 1),
      darkMat
    );
    seg.position.y = -0.5 + i * 0.35;
    seg.name = `mantle_segment_${i}`;
    mantle.add(seg);

    // Bearing race at each segment
    const bearing = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.08, 8, 32),
      darkMat
    );
    bearing.rotation.x = Math.PI * 0.5;
    bearing.position.y = seg.position.y;
    bearing.name = `bearing_${i}`;
    mantle.add(bearing);
  }

  // Shell plates wrapping the mantle (overlapping segments)
  for (let side = 0; side < 2; side++) {
    const shellGeo = new THREE.CylinderGeometry(0.65, 0.65, 1.75, 12, 3, true, 0, Math.PI);
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.y = -0.5;
    shell.position.x = side === 0 ? 0.2 : -0.2;
    shell.name = `mantle_shell_${side}`;
    mantle.add(shell);
  }

  // Dorsal ridge of shell plates on top
  for (let i = 0; i < 4; i++) {
    const ridgeShape = new THREE.Shape();
    ridgeShape.moveTo(-0.15, 0);
    ridgeShape.lineTo(0.15, 0);
    ridgeShape.lineTo(0.1, 0.3);
    ridgeShape.lineTo(-0.1, 0.3);
    ridgeShape.closePath();

    const ridgeGeo = new THREE.ExtrudeGeometry(ridgeShape, {
      depth: 0.25,
      bevelEnabled: true,
      bevelSize: 0.02,
      bevelThickness: 0.01,
      bevelSegments: 2,
    });
    const ridge = new THREE.Mesh(ridgeGeo, shellMat);
    ridge.position.y = -0.4 + i * 0.4;
    ridge.rotation.z = Math.PI * 0.5;
    ridge.name = `ridge_${i}`;
    mantle.add(ridge);
  }

  // Internal mechanism: chain runs and rams
  for (let i = 0; i < 3; i++) {
    const chain = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.05, 6, 20),
      darkMat
    );
    chain.rotation.x = Math.PI * 0.5;
    chain.position.y = -0.2 + i * 0.5;
    chain.scale.z = 1.2;
    chain.name = `chain_run_${i}`;
    mantle.add(chain);
  }

  // Create 8 arms radiating from mantle
  const armCount = 8;
  for (let a = 0; a < armCount; a++) {
    const armAngle = (a / armCount) * Math.PI * 2;
    const armGroup = new THREE.Group();
    armGroup.name = `arm_${a}`;

    // Position arm base on mantle
    const baseRadius = 0.6;
    const basePosX = Math.cos(armAngle) * baseRadius;
    const basePosZ = Math.sin(armAngle) * baseRadius;

    // Arm mount on mantle
    const mount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.15, 0.15, 8),
      darkMat
    );
    mount.position.set(basePosX, -0.3, basePosZ);
    mount.name = `arm_${a}_mount`;
    mantle.add(mount);

    armGroup.position.set(basePosX, -0.35, basePosZ);
    armGroup.rotation.order = 'YXZ';
    mantle.add(armGroup);

    // Arm segments (7 links, tapering and curving)
    const segmentCount = 7;
    let parentSegment = armGroup;

    for (let seg = 0; seg < segmentCount; seg++) {
      const segGroup = new THREE.Group();
      segGroup.name = `arm_${a}_seg_${seg}`;

      // Taper radius
      const r1 = 0.18 * (1 - seg * 0.12);
      const r2 = 0.16 * (1 - (seg + 1) * 0.12);
      const segLen = 0.5 - seg * 0.05;

      // Dark frame segment
      const frameSeg = new THREE.Mesh(
        new THREE.CylinderGeometry(r1, r2, segLen, 8, 1),
        darkMat
      );
      frameSeg.position.y = segLen * 0.5;
      frameSeg.name = `frame_${seg}`;
      segGroup.add(frameSeg);

      // Shell plate wrapping this segment
      const shellRad1 = r1 + 0.05;
      const shellRad2 = r2 + 0.04;
      const shellSeg = new THREE.Mesh(
        new THREE.CylinderGeometry(shellRad1, shellRad2, segLen * 0.95, 10, 2, true, 0, Math.PI * 1.2),
        shellMat
      );
      shellSeg.position.y = segLen * 0.5;
      shellSeg.position.x = 0.06;
      shellSeg.name = `shell_${seg}`;
      segGroup.add(shellSeg);

      // Actuator rod alongside
      const rodGeo = new THREE.CylinderGeometry(0.04, 0.03, segLen * 0.8, 6);
      const rod = new THREE.Mesh(rodGeo, darkMat);
      rod.position.y = segLen * 0.5;
      rod.position.x = -0.12;
      rod.name = `rod_${seg}`;
      segGroup.add(rod);

      // Bearing housing at joint
      const bearing = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.04, 8, 20),
        darkMat
      );
      bearing.position.y = 0;
      bearing.rotation.x = Math.PI * 0.5;
      bearing.name = `bearing_${seg}`;
      segGroup.add(bearing);

      // Bolts around bearing
      for (let b = 0; b < 6; b++) {
        const bolt = new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 6, 6),
          darkMat
        );
        const boltAngle = (b / 6) * Math.PI * 2;
        bolt.position.x = Math.cos(boltAngle) * 0.16;
        bolt.position.z = Math.sin(boltAngle) * 0.16;
        bolt.name = `bolt_${b}`;
        segGroup.add(bolt);
      }

      parentSegment.add(segGroup);
      parentSegment = segGroup;
      segGroup.position.y = segLen;
    }

    // Sucker cluster at arm tip (5 suckers, articulated)
    const tipCluster = new THREE.Group();
    tipCluster.name = `arm_${a}_tip`;
    parentSegment.add(tipCluster);
    tipCluster.position.y = 0.2;

    for (let s = 0; s < 5; s++) {
      const suckerAngle = (s / 5) * Math.PI * 2;
      const suckerGroup = new THREE.Group();
      suckerGroup.name = `sucker_${s}`;

      // Sucker stalk
      const stalk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.05, 0.15, 6),
        darkMat
      );
      stalk.position.y = 0.075;
      suckerGroup.add(stalk);

      // Sucker pad with ridges
      const padGeo = new THREE.CylinderGeometry(0.12, 0.11, 0.04, 12, 1);
      const pad = new THREE.Mesh(padGeo, darkMat);
      pad.position.y = 0.15;
      suckerGroup.add(pad);

      // Shell covering
      const suckerShell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.12, 0.12, 10, 2),
        shellMat
      );
      suckerShell.position.y = 0.08;
      suckerGroup.add(suckerShell);

      tipCluster.add(suckerGroup);
      suckerGroup.position.x = Math.cos(suckerAngle) * 0.15;
      suckerGroup.position.z = Math.sin(suckerAngle) * 0.15;
    }
  }

  // Cable harness: multiple runs over the mantle and down arms
  const cableHarness = new THREE.Group();
  cableHarness.name = 'cable_harness';
  body.add(cableHarness);

  // Thick trunk lines over dorsal surface
  for (let c = 0; c < 4; c++) {
    const cableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.2, 0),
      new THREE.Vector3(0.3 * Math.cos(c * Math.PI * 0.5), 0.4, 0.3 * Math.sin(c * Math.PI * 0.5)),
      new THREE.Vector3(0.5 * Math.cos(c * Math.PI * 0.5), -0.3, 0.5 * Math.sin(c * Math.PI * 0.5)),
    ]);

    const cableGeo = new THREE.TubeGeometry(cableCurve, 8, 0.08, 4);
    const cable = new THREE.Mesh(cableGeo, cableMat);
    cable.name = `cable_trunk_${c}`;
    cableHarness.add(cable);
  }

  // Fine signal lines (thinner)
  for (let s = 0; s < 3; s++) {
    const signalCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.15, 0.1, 0),
      new THREE.Vector3(0.4, 0, 0.4),
      new THREE.Vector3(0.6, -0.4, 0.6),
    ]);

    const signalGeo = new THREE.TubeGeometry(signalCurve, 6, 0.03, 3);
    const signal = new THREE.Mesh(signalGeo, cableMat);
    signal.name = `signal_${s}`;
    cableHarness.add(signal);
  }

  // Greebles: fasteners, clamps, small details
  const greebles = new THREE.Group();
  greebles.name = 'greebles';
  mantle.add(greebles);

  // Bolt grid on shell
  for (let bx = -0.4; bx <= 0.4; bx += 0.25) {
    for (let by = -0.8; by <= 0.2; by += 0.3) {
      const boltHead = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.04, 6),
        darkMat
      );
      boltHead.position.set(bx, by, 0.68);
      boltHead.name = `bolt_shell_${bx}_${by}`;
      greebles.add(boltHead);
    }
  }

  // Cable clamps
  for (let i = 0; i < 6; i++) {
    const clamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.08, 0.05),
      darkMat
    );
    clamp.position.set(Math.cos(i * Math.PI * 0.33) * 0.5, -0.2 + i * 0.15, Math.sin(i * Math.PI * 0.33) * 0.5);
    clamp.name = `clamp_${i}`;
    greebles.add(clamp);
  }

  // Small sensor nub
  const sensor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.04, 0.08, 6),
    darkMat
  );
  sensor.position.set(0, 0.15, 0.65);
  sensor.name = 'sensor';
  greebles.add(sensor);

  // Apply wear shader to shells
  const wearNode = TSL.mix(
    TSL.vec3(0xB5 / 255, 0xAC / 255, 0x9C / 255),
    TSL.vec3(0x3E / 255, 0x3A / 255, 0x34 / 255),
    TSL.smoothstep(0.3, 0.8, TSL.abs(TSL.normalLocal.y))
  );

  shellMat.colorNode = wearNode;

  body.userData.pose = (s) => {
    const strideFrac = s.stride;
    const speedFactor = Math.min(s.speed / 3, 1);

    // Mantle bob based on stride
    mantle.position.y = Math.sin(strideFrac * Math.PI * 2) * 0.05 * speedFactor - 0.2;

    // Mantle lean with turn
    mantle.rotation.z = s.turn * 0.15 * speedFactor;

    // Animate each arm
    for (let a = 0; a < armCount; a++) {
      const arm = mantle.children.find((c) => c.name === `arm_${a}`);
      if (!arm) continue;

      const armPhase = (strideFrac + a / armCount) % 1;
      const armCurve = Math.sin(armPhase * Math.PI * 2);

      // Arm swing relative to body
      arm.rotation.x = 0.3 + armCurve * 0.4 * speedFactor;
      arm.rotation.z = Math.sin(armPhase * Math.PI) * 0.3 * speedFactor;

      // Arm lift when grounded
      if (s.grounded) {
        arm.position.y = Math.cos(armPhase * Math.PI * 2) * 0.1 * speedFactor;
      } else {
        arm.position.y = -0.2;
      }

      // Segment curl
      for (let seg = 0; seg < 7; seg++) {
        const segGroup = arm.children.find(
          (c) => c.name === `arm_${a}_seg_${seg}`
        );
        if (!segGroup) continue;

        const curvePhase = (armPhase + seg * 0.1) % 1;
        segGroup.rotation.x = Math.sin(curvePhase * Math.PI * 2) * 0.15;
        segGroup.rotation.z = Math.cos(curvePhase * Math.PI) * 0.1;
      }
    }

    // Action handling
    if (s.action === 'attack') {
      const phase = s.phase;
      for (let a = 0; a < armCount; a++) {
        const arm = mantle.children.find((c) => c.name === `arm_${a}`);
        if (!arm) continue;

        if (a % 2 === 0) {
          arm.rotation.x = phase < 0.5 ? -0.5 * (phase * 2) : -0.5 + (phase - 0.5) * 2 * 0.5;
          arm.position.z = Math.sin(phase * Math.PI) * 0.3;
        }
      }
    } else if (s.action === 'gather') {
      mantle.position.y -= s.phase * 0.3;
      for (let a = 0; a < armCount; a++) {
        const arm = mantle.children.find((c) => c.name === `arm_${a}`);
        if (!arm) continue;
        arm.rotation.x = -0.8 * s.phase;
      }
    }

    if (s.health < 1) {
      mantle.rotation.x += (1 - s.health) * 0.2;
    }
  };

  body.userData.update = (t, dt) => {
    // Idle breathing motion
    const breath = Math.sin(t * 0.5) * 0.02;
    if (!mantle) return;
    mantle.scale.y = 1 + breath;
  };

  return body;
}
```