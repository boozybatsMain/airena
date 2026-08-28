function build(THREE, TSL) {
  // THE ONE QUALITY: MASS AND FLEX — a heavy armoured marine chassis with 8 serpentine mechanical tentacles.
  // Brief: An industrial biomechanical octopus. A massive segmented engine mantle slung aft, clad in overlapping
  // chalky-white curved shell plates over a dark gunmetal core of turbines, rams and gear stacks. The leading sensor
  // head is densely packed with faceted brow plates, twin recessed dark-glass eye lenses in machined bezels, an articulated
  // dual-beak mandible beneath, and a steerable ventral hydro-jet siphon. Eight 6-link articulated tentacle arms radiate
  // from the central hub, each link packed with bearing races, hydraulic rams, ventral suction pads, and overlapping scales.

  const root = new THREE.Group();
  root.name = 'root_octopus';

  // -------------------------------------------------------------------------
  // MATERIALS & TSL SHADERS
  // -------------------------------------------------------------------------
  const {
    Fn, vec2, vec3, vec4, float, positionLocal, positionWorld, normalLocal, normalWorld,
    sin, cos, abs, pow, mix, smoothstep, clamp, mul, add, sub, dot
  } = TSL;

  // Custom wear & grime TSL shader node
  const createShellColorNode = (baseHex, wornHex, grimeHex) => {
    return Fn(() => {
      const p = positionLocal.mul(6.0);
      const n1 = sin(p.x.mul(2.1).add(cos(p.y.mul(2.7)))).mul(cos(p.z.mul(2.3)));
      const n2 = sin(p.x.mul(6.3).add(p.y.mul(5.9))).mul(cos(p.z.mul(5.7)));
      const noise = n1.mul(0.6).add(n2.mul(0.4)).mul(0.5).add(0.5);

      const downGrime = clamp(sub(0.2, normalWorld.y), float(0.0), float(1.0)).mul(0.45);
      const edgeMask = pow(sub(float(1.0), clamp(abs(dot(normalLocal, vec3(0.0, 1.0, 0.0))), float(0.0), float(1.0))), float(2.0));
      const wear = clamp(edgeMask.mul(noise).add(downGrime), float(0.0), float(1.0));

      const baseCol = vec3(new THREE.Color(baseHex).r, new THREE.Color(baseHex).g, new THREE.Color(baseHex).b);
      const wornCol = vec3(new THREE.Color(wornHex).r, new THREE.Color(wornHex).g, new THREE.Color(wornHex).b);
      const grimeCol = vec3(new THREE.Color(grimeHex).r, new THREE.Color(grimeHex).g, new THREE.Color(grimeHex).b);

      const mixedCol = mix(baseCol, wornCol, wear.mul(0.6));
      return mix(mixedCol, grimeCol, downGrime.mul(0.7));
    })();
  };

  const matShellWhite = new THREE.MeshStandardNodeMaterial({
    metalness: 0.12,
    roughness: 0.58,
    side: THREE.DoubleSide
  });
  matShellWhite.colorNode = createShellColorNode(0xD8D2C6, 0x8C8476, 0x3A342D);

  const matShellAccent = new THREE.MeshStandardNodeMaterial({
    metalness: 0.15,
    roughness: 0.62,
    side: THREE.DoubleSide
  });
  matShellAccent.colorNode = createShellColorNode(0xC2521E, 0x6E2D12, 0x2A1F18);

  const matDarkMetal = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0x45423C),
    metalness: 0.85,
    roughness: 0.48
  });

  const matBrightMetal = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0x78736B),
    metalness: 0.92,
    roughness: 0.32
  });

  const matSteelRecess = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0x282623),
    metalness: 0.75,
    roughness: 0.72
  });

  const matCable = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0x1B1A18),
    metalness: 0.05,
    roughness: 0.88
  });

  const matEyeLens = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0x0A0D12),
    metalness: 0.1,
    roughness: 0.04
  });

  const matSuctionPad = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0x32302D),
    metalness: 0.25,
    roughness: 0.8
  });

  // -------------------------------------------------------------------------
  // GEOMETRY HELPERS
  // -------------------------------------------------------------------------
  const geomBearing = (r, thick) => {
    return new THREE.CylinderGeometry(r, r, thick, 16);
  };

  const geomHexBolt = (r, h) => {
    return new THREE.CylinderGeometry(r, r, h, 6);
  };

  const createCurvedPlate = (rTop, rBot, len, arc, thetaStart = 0) => {
    return new THREE.CylinderGeometry(rTop, rBot, len, 14, 1, true, thetaStart, arc);
  };

  // -------------------------------------------------------------------------
  // 1. CENTRAL CHASSIS & HUB
  // -------------------------------------------------------------------------
  const hubGroup = new THREE.Group();
  hubGroup.name = 'hub_main';
  hubGroup.position.set(0, 0.7, 0);
  root.add(hubGroup);

  // Central chassis core block
  const hubCoreGeom = new THREE.CylinderGeometry(0.55, 0.65, 0.45, 12);
  const hubCoreMesh = new THREE.Mesh(hubCoreGeom, matDarkMetal);
  hubCoreMesh.name = 'hub_core_mesh';
  hubGroup.add(hubCoreMesh);

  // Hub structural bearing ring
  const hubRingGeom = new THREE.TorusGeometry(0.68, 0.08, 8, 24);
  const hubRingMesh = new THREE.Mesh(hubRingGeom, matBrightMetal);
  hubRingMesh.rotation.x = Math.PI / 2;
  hubRingMesh.name = 'hub_bearing_ring';
  hubGroup.add(hubRingMesh);

  // Bolt ring on hub
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const bolt = new THREE.Mesh(geomHexBolt(0.035, 0.04), matBrightMetal);
    bolt.position.set(Math.cos(angle) * 0.62, 0.23, Math.sin(angle) * 0.62);
    bolt.name = `hub_bolt_${i}`;
    hubGroup.add(bolt);
  }

  // -------------------------------------------------------------------------
  // 2. MANTLE (TORSO - THICKEST MASS, SLUNG AFT)
  // -------------------------------------------------------------------------
  const mantleGroup = new THREE.Group();
  mantleGroup.name = 'mantle_group';
  mantleGroup.position.set(0, 0.15, -0.35);
  mantleGroup.rotation.x = -0.22; // angled upward/backward
  hubGroup.add(mantleGroup);

  // Mantle internal frame segments (stack along axis)
  const mantleSegments = [
    { z: -0.2, r: 0.75, len: 0.4 },
    { z: -0.6, r: 0.88, len: 0.45 },
    { z: -1.05, r: 0.82, len: 0.45 },
    { z: -1.45, r: 0.62, len: 0.4 },
    { z: -1.8, r: 0.38, len: 0.35 }
  ];

  mantleSegments.forEach((seg, idx) => {
    const segMesh = new THREE.Mesh(new THREE.CylinderGeometry(seg.r * 0.88, seg.r * 0.95, seg.len, 12), matDarkMetal);
    segMesh.rotation.x = Math.PI / 2;
    segMesh.position.set(0, 0, seg.z);
    segMesh.name = `mantle_frame_seg_${idx}`;
    mantleGroup.add(segMesh);

    // Bearing race / ribbed separation
    const rib = new THREE.Mesh(new THREE.TorusGeometry(seg.r * 0.92, 0.04, 6, 16), matSteelRecess);
    rib.position.set(0, 0, seg.z + seg.len * 0.5);
    rib.name = `mantle_rib_${idx}`;
    mantleGroup.add(rib);
  });

  // Mantle Turbines / Hydraulic manifolds in gaps
  const turbineCore = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.7, 16), matBrightMetal);
  turbineCore.rotation.x = Math.PI / 2;
  turbineCore.position.set(0, 0, -0.9);
  turbineCore.name = 'mantle_turbine_core';
  mantleGroup.add(turbineCore);

  for (let t = 0; t < 6; t++) {
    const tAngle = (t / 6) * Math.PI * 2;
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.6), matDarkMetal);
    vane.position.set(Math.cos(tAngle) * 0.38, Math.sin(tAngle) * 0.38, -0.9);
    vane.rotation.z = tAngle;
    vane.name = `mantle_turbine_vane_${t}`;
    mantleGroup.add(vane);
  }

  // Linear Rams alongside Mantle spine
  [-0.45, 0.45].forEach((xSide, i) => {
    const ramCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), matDarkMetal);
    ramCyl.rotation.x = Math.PI / 2;
    ramCyl.position.set(xSide, 0.38, -0.8);
    ramCyl.name = `mantle_ram_cyl_${i}`;
    mantleGroup.add(ramCyl);

    const ramRod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8), matBrightMetal);
    ramRod.rotation.x = Math.PI / 2;
    ramRod.position.set(xSide, 0.38, -1.25);
    ramRod.name = `mantle_ram_rod_${i}`;
    mantleGroup.add(ramRod);
  });

  // Gear stacks on mantle flanks
  [-0.75, 0.75].forEach((xSide, i) => {
    const gear1 = new THREE.Mesh(geomBearing(0.22, 0.08), matBrightMetal);
    gear1.rotation.z = Math.PI / 2;
    gear1.position.set(xSide, 0.0, -0.6);
    gear1.name = `mantle_gear_large_${i}`;
    mantleGroup.add(gear1);

    const gear2 = new THREE.Mesh(geomBearing(0.14, 0.06), matDarkMetal);
    gear2.rotation.z = Math.PI / 2;
    gear2.position.set(xSide, 0.16, -0.8);
    gear2.name = `mantle_gear_small_${i}`;
    mantleGroup.add(gear2);
  });

  // OVERLAPPING CURVED SHELL PLATES CLADDING THE MANTLE
  // 1. Front dorsal carapace
  const shellDorsalFrontGeom = createCurvedPlate(0.82, 0.95, 0.55, Math.PI * 0.75, -Math.PI * 0.375);
  const shellDorsalFront = new THREE.Mesh(shellDorsalFrontGeom, matShellWhite);
  shellDorsalFront.rotation.x = Math.PI / 2;
  shellDorsalFront.position.set(0, 0.08, -0.35);
  shellDorsalFront.name = 'mantle_shell_dorsal_front';
  mantleGroup.add(shellDorsalFront);

  // 2. Mid dorsal carapace (overlapping front)
  const shellDorsalMidGeom = createCurvedPlate(0.96, 0.92, 0.6, Math.PI * 0.8, -Math.PI * 0.4);
  const shellDorsalMid = new THREE.Mesh(shellDorsalMidGeom, matShellWhite);
  shellDorsalMid.rotation.x = Math.PI / 2;
  shellDorsalMid.position.set(0, 0.12, -0.85);
  shellDorsalMid.name = 'mantle_shell_dorsal_mid';
  mantleGroup.add(shellDorsalMid);

  // 3. Aft dorsal cowl (with rust accent coat)
  const shellDorsalAftGeom = createCurvedPlate(0.9, 0.65, 0.65, Math.PI * 0.85, -Math.PI * 0.425);
  const shellDorsalAft = new THREE.Mesh(shellDorsalAftGeom, matShellAccent);
  shellDorsalAft.rotation.x = Math.PI / 2;
  shellDorsalAft.position.set(0, 0.09, -1.4);
  shellDorsalAft.name = 'mantle_shell_dorsal_aft';
  mantleGroup.add(shellDorsalAft);

  // 4. Rear thruster exhaust cone
  const exhaustConeGeom = new THREE.CylinderGeometry(0.38, 0.22, 0.3, 16, 1, true);
  const exhaustCone = new THREE.Mesh(exhaustConeGeom, matDarkMetal);
  exhaustCone.rotation.x = Math.PI / 2;
  exhaustCone.position.set(0, 0, -1.95);
  exhaustCone.name = 'mantle_exhaust_cone';
  mantleGroup.add(exhaustCone);

  const exhaustRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 16), matBrightMetal);
  exhaustRing.position.set(0, 0, -2.1);
  exhaustRing.name = 'mantle_exhaust_ring';
  mantleGroup.add(exhaustRing);

  // Flank shell armor (Left & Right)
  [-1, 1].forEach((dir, idx) => {
    const flankGeom = createCurvedPlate(0.85, 0.78, 0.5, Math.PI * 0.45, dir > 0 ? Math.PI * 0.25 : Math.PI * 1.3);
    const flankShell = new THREE.Mesh(flankGeom, matShellWhite);
    flankShell.rotation.x = Math.PI / 2;
    flankShell.position.set(dir * 0.15, 0, -0.75);
    flankShell.name = `mantle_shell_flank_${idx}`;
    mantleGroup.add(flankShell);
  });

  // Ventral mantle armor plate
  const ventralShellGeom = createCurvedPlate(0.75, 0.65, 0.8, Math.PI * 0.6, Math.PI * 0.7);
  const ventralShell = new THREE.Mesh(ventralShellGeom, matShellWhite);
  ventralShell.rotation.x = Math.PI / 2;
  ventralShell.position.set(0, -0.08, -0.8);
  ventralShell.name = 'mantle_shell_ventral';
  mantleGroup.add(ventralShell);

  // Cables on mantle (parented to mantle, landing in port collars)
  const mantleCableCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.3, 0.42, -0.25),
    new THREE.Vector3(-0.55, 0.5, -0.7),
    new THREE.Vector3(-0.4, 0.45, -1.3),
    new THREE.Vector3(-0.15, 0.25, -1.8)
  ]);
  const mantleCableL = new THREE.Mesh(new THREE.TubeGeometry(mantleCableCurveL, 20, 0.028, 6, false), matCable);
  mantleCableL.name = 'mantle_cable_L';
  mantleGroup.add(mantleCableL);

  const mantleCableCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.3, 0.42, -0.25),
    new THREE.Vector3(0.55, 0.5, -0.7),
    new THREE.Vector3(0.4, 0.45, -1.3),
    new THREE.Vector3(0.15, 0.25, -1.8)
  ]);
  const mantleCableR = new THREE.Mesh(new THREE.TubeGeometry(mantleCableCurveR, 20, 0.028, 6, false), matCable);
  mantleCableR.name = 'mantle_cable_R';
  mantleGroup.add(mantleCableR);

  // -------------------------------------------------------------------------
  // 3. SIPHON (VENTRAL DIRECTIONAL THRUSTER / FUNNEL)
  // -------------------------------------------------------------------------
  const siphonBase = new THREE.Group();
  siphonBase.name = 'siphon_base';
  siphonBase.position.set(0, -0.32, 0.1);
  hubGroup.add(siphonBase);

  const siphonSwivel = new THREE.Group();
  siphonSwivel.name = 'siphon_swivel';
  siphonBase.add(siphonSwivel);

  const siphonHousingGeom = new THREE.CylinderGeometry(0.18, 0.22, 0.28, 12);
  const siphonHousing = new THREE.Mesh(siphonHousingGeom, matDarkMetal);
  siphonHousing.rotation.x = Math.PI / 3;
  siphonHousing.name = 'siphon_housing';
  siphonSwivel.add(siphonHousing);

  const siphonNozzle = new THREE.Group();
  siphonNozzle.name = 'siphon_nozzle';
  siphonNozzle.position.set(0, -0.12, 0.22);
  siphonNozzle.rotation.x = Math.PI / 4;
  siphonSwivel.add(siphonNozzle);

  const nozzleTubeGeom = new THREE.CylinderGeometry(0.14, 0.17, 0.35, 12, 1, true);
  const nozzleTube = new THREE.Mesh(nozzleTubeGeom, matBrightMetal);
  nozzleTube.name = 'siphon_nozzle_tube';
  siphonNozzle.add(nozzleTube);

  const nozzleRim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 16), matDarkMetal);
  nozzleRim.position.set(0, 0.18, 0);
  nozzleRim.rotation.x = Math.PI / 2;
  nozzleRim.name = 'siphon_nozzle_rim';
  siphonNozzle.add(nozzleRim);

  // Siphon steering hydraulic rams
  [-0.14, 0.14].forEach((side, i) => {
    const sRamCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), matDarkMetal);
    sRamCyl.position.set(side, 0.05, 0.05);
    sRamCyl.name = `siphon_ram_${i}`;
    siphonSwivel.add(sRamCyl);
  });

  // -------------------------------------------------------------------------
  // 4. LEADING END (HEAD, SENSOR TURRETS, DUAL BEAKS)
  // -------------------------------------------------------------------------
  // The leading end is packed with hardware and has more parts than any single limb.
  const headGroup = new THREE.Group();
  headGroup.name = 'head_group';
  headGroup.position.set(0, 0.18, 0.45);
  hubGroup.add(headGroup);

  // Head structural core & brow chassis
  const headCoreGeom = new THREE.BoxGeometry(0.68, 0.42, 0.55);
  const headCore = new THREE.Mesh(headCoreGeom, matDarkMetal);
  headCore.name = 'head_core_block';
  headGroup.add(headCore);

  // Faceted Brow Shell Plates (Bone-White)
  const browShape = new THREE.Shape();
  browShape.moveTo(-0.36, -0.15);
  browShape.lineTo(0.36, -0.15);
  browShape.lineTo(0.30, 0.22);
  browShape.lineTo(0.0, 0.28);
  browShape.lineTo(-0.30, 0.22);
  browShape.closePath();

  const browGeom = new THREE.ExtrudeGeometry(browShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.03,
    bevelThickness: 0.03
  });
  const browMesh = new THREE.Mesh(browGeom, matShellWhite);
  browMesh.position.set(0, 0.05, 0.15);
  browMesh.rotation.x = 0.25;
  browMesh.name = 'head_brow_plate';
  headGroup.add(browMesh);

  // Lateral cranial plates (Left & Right)
  [-1, 1].forEach((dir, i) => {
    const cheekGeom = createCurvedPlate(0.32, 0.38, 0.4, Math.PI * 0.45, dir > 0 ? -Math.PI * 0.2 : Math.PI * 0.75);
    const cheek = new THREE.Mesh(cheekGeom, matShellWhite);
    cheek.position.set(dir * 0.32, 0.02, 0.05);
    cheek.rotation.z = dir * 0.2;
    cheek.name = `head_cheek_plate_${i}`;
    headGroup.add(cheek);
  });

  // OPTICAL SENSOR TURRETS (LEFT & RIGHT) - Recessed dark glass, machined bezels
  [-0.32, 0.32].forEach((xPos, idx) => {
    const sideName = idx === 0 ? 'L' : 'R';
    const eyeTurret = new THREE.Group();
    eyeTurret.name = `eye_turret_${sideName}`;
    eyeTurret.position.set(xPos, 0.08, 0.25);
    headGroup.add(eyeTurret);

    // Stepped outer housing
    const housingGeom = new THREE.CylinderGeometry(0.14, 0.16, 0.12, 16);
    const housing = new THREE.Mesh(housingGeom, matDarkMetal);
    housing.rotation.x = Math.PI / 2;
    housing.rotation.y = idx === 0 ? -0.35 : 0.35;
    housing.name = `eye_housing_${sideName}`;
    eyeTurret.add(housing);

    // Machined bezel ring
    const bezelGeom = new THREE.TorusGeometry(0.12, 0.03, 8, 20);
    const bezel = new THREE.Mesh(bezelGeom, matBrightMetal);
    bezel.rotation.x = Math.PI / 2;
    bezel.rotation.y = idx === 0 ? -0.35 : 0.35;
    bezel.position.set(0, 0, 0.06);
    bezel.name = `eye_bezel_${sideName}`;
    eyeTurret.add(bezel);

    // Recessed dark glass lens
    const lensGeom = new THREE.SphereGeometry(0.09, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const lens = new THREE.Mesh(lensGeom, matEyeLens);
    lens.rotation.x = Math.PI / 2;
    lens.rotation.y = idx === 0 ? -0.35 : 0.35;
    lens.position.set(0, 0, 0.05);
    lens.name = `eye_lens_${sideName}`;
    eyeTurret.add(lens);

    // Visor / Cowl shroud
    const visorGeom = createCurvedPlate(0.15, 0.16, 0.1, Math.PI * 0.6, -Math.PI * 0.3);
    const visor = new THREE.Mesh(visorGeom, matShellWhite);
    visor.rotation.x = Math.PI / 2;
    visor.rotation.y = idx === 0 ? -0.35 : 0.35;
    visor.position.set(0, 0.06, 0.06);
    visor.name = `eye_visor_${sideName}`;
    eyeTurret.add(visor);

    // Sensor cable lead into head
    const eyeCableCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.05, 0.02),
      new THREE.Vector3(idx === 0 ? 0.08 : -0.08, -0.12, -0.1),
      new THREE.Vector3(0, -0.15, -0.2)
    ]);
    const eyeCable = new THREE.Mesh(new THREE.TubeGeometry(eyeCableCurve, 10, 0.015, 6, false), matCable);
    eyeCable.name = `eye_cable_${sideName}`;
    eyeTurret.add(eyeCable);
  });

  // VENTRAL MANDIBLES / CENTRAL BEAK CLUSTER
  const beakCluster = new THREE.Group();
  beakCluster.name = 'beak_cluster';
  beakCluster.position.set(0, -0.28, 0.35);
  headGroup.add(beakCluster);

  // Upper Beak
  const beakUpperGroup = new THREE.Group();
  beakUpperGroup.name = 'beak_upper_group';
  beakUpperGroup.position.set(0, 0.06, 0.05);
  beakCluster.add(beakUpperGroup);

  const beakUpperGeom = new THREE.ConeGeometry(0.12, 0.28, 5);
  const beakUpperMesh = new THREE.Mesh(beakUpperGeom, matBrightMetal);
  beakUpperMesh.rotation.x = Math.PI * 0.65;
  beakUpperMesh.scale.set(0.6, 1.2, 0.8);
  beakUpperMesh.name = 'beak_upper_blade';
  beakUpperGroup.add(beakUpperMesh);

  // Lower Beak
  const beakLowerGroup = new THREE.Group();
  beakLowerGroup.name = 'beak_lower_group';
  beakLowerGroup.position.set(0, -0.06, 0.05);
  beakCluster.add(beakLowerGroup);

  const beakLowerGeom = new THREE.ConeGeometry(0.14, 0.32, 5);
  const beakLowerMesh = new THREE.Mesh(beakLowerGeom, matDarkMetal);
  beakLowerMesh.rotation.x = Math.PI * 0.35;
  beakLowerMesh.scale.set(0.65, 1.1, 0.85);
  beakLowerMesh.name = 'beak_lower_blade';
  beakLowerGroup.add(beakLowerMesh);

  // Beak rotary drive gear and actuator rams
  const beakDriveDisc = new THREE.Mesh(geomBearing(0.12, 0.06), matDarkMetal);
  beakDriveDisc.rotation.z = Math.PI / 2;
  beakDriveDisc.name = 'beak_drive_disc';
  beakCluster.add(beakDriveDisc);

  [-0.12, 0.12].forEach((xSide, i) => {
    const bRam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), matBrightMetal);
    bRam.position.set(xSide, 0, -0.08);
    bRam.name = `beak_ram_${i}`;
    beakCluster.add(bRam);
  });

  // -------------------------------------------------------------------------
  // 5. EIGHT ARTICULATED ARMS (TENTACLES)
  // -------------------------------------------------------------------------
  // Radiating from hub: Arm 0..7
  // Angles: 0: Front-Right (+30°), 1: Mid-Right (+70°), 2: Rear-Right (+115°), 3: Aft-Right (+160°),
  //         4: Aft-Left (-160°), 5: Rear-Left (-115°), 6: Mid-Left (-70°), 7: Front-Left (-30°)
  const armAngles = [
    Math.PI * 0.18,  // 0: RF
    Math.PI * 0.42,  // 1: RM1
    Math.PI * 0.68,  // 2: RM2
    Math.PI * 0.90,  // 3: RR
    -Math.PI * 0.90, // 4: LR
    -Math.PI * 0.68, // 5: LM2
    -Math.PI * 0.42, // 6: LM1
    -Math.PI * 0.18  // 7: LF
  ];

  const armRoots = [];
  const armJoints = []; // armJoints[armIdx][segIdx]

  for (let a = 0; a < 8; a++) {
    const yaw = armAngles[a];
    const armBaseGroup = new THREE.Group();
    armBaseGroup.name = `arm_${a}_base`;
    armBaseGroup.position.set(Math.sin(yaw) * 0.62, -0.15, Math.cos(yaw) * 0.62);
    armBaseGroup.rotation.y = yaw;
    hubGroup.add(armBaseGroup);
    armRoots.push(armBaseGroup);

    // Shoulder gimbal housing
    const socketMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), matDarkMetal);
    socketMesh.name = `arm_${a}_socket_housing`;
    armBaseGroup.add(socketMesh);

    const shoulderRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 6, 16), matBrightMetal);
    shoulderRing.rotation.y = Math.PI / 2;
    shoulderRing.name = `arm_${a}_shoulder_ring`;
    armBaseGroup.add(shoulderRing);

    // Build 6 articulated segments per arm
    let parentNode = armBaseGroup;
    const jointsForArm = [];

    const numSegs = 6;
    for (let s = 0; s < numSegs; s++) {
      const segGroup = new THREE.Group();
      segGroup.name = `arm_${a}_seg_${s}`;

      // Progressive length and tapering radius
      const segLen = 0.42 - s * 0.035;
      const rProx = 0.15 - s * 0.016;
      const rDist = 0.13 - s * 0.016;

      if (s === 0) {
        segGroup.position.set(0, 0, 0.15);
      } else {
        segGroup.position.set(0, 0, 0.38 - (s - 1) * 0.035);
      }
      parentNode.add(segGroup);
      jointsForArm.push(segGroup);
      parentNode = segGroup;

      // Segment Core Chassis (dark machined stock)
      const chassisGeom = new THREE.BoxGeometry(rProx * 1.6, rProx * 1.5, segLen * 0.95);
      const chassisMesh = new THREE.Mesh(chassisGeom, matDarkMetal);
      chassisMesh.position.set(0, 0, segLen * 0.48);
      chassisMesh.name = `arm_${a}_seg_${s}_chassis`;
      segGroup.add(chassisMesh);

      // Articulation Hinge Bearing Pin at origin
      const pinGeom = geomBearing(rProx * 0.9, rProx * 1.8);
      const pinMesh = new THREE.Mesh(pinGeom, matBrightMetal);
      pinMesh.rotation.z = Math.PI / 2;
      pinMesh.name = `arm_${a}_seg_${s}_pin`;
      segGroup.add(pinMesh);

      // Dorsal Linear Ram Actuator (spanning segment)
      const ramBarrel = new THREE.Mesh(new THREE.CylinderGeometry(rProx * 0.28, rProx * 0.28, segLen * 0.5, 6), matSteelRecess);
      ramBarrel.rotation.x = Math.PI / 2;
      ramBarrel.position.set(0, rProx * 0.85, segLen * 0.28);
      ramBarrel.name = `arm_${a}_seg_${s}_ram_barrel`;
      segGroup.add(ramBarrel);

      const ramPiston = new THREE.Mesh(new THREE.CylinderGeometry(rProx * 0.16, rProx * 0.16, segLen * 0.55, 6), matBrightMetal);
      ramPiston.rotation.x = Math.PI / 2;
      ramPiston.position.set(0, rProx * 0.85, segLen * 0.65);
      ramPiston.name = `arm_${a}_seg_${s}_ram_piston`;
      segGroup.add(ramPiston);

      // Dorsal Overlapping Armour Shell (Chalky-White)
      const shellGeom = createCurvedPlate(rProx * 1.15, rDist * 1.15, segLen * 0.95, Math.PI * 0.65, -Math.PI * 0.325);
      const shellMesh = new THREE.Mesh(shellGeom, matShellWhite);
      shellMesh.position.set(0, rProx * 0.35, segLen * 0.48);
      shellMesh.name = `arm_${a}_seg_${s}_shell`;
      segGroup.add(shellMesh);

      // Ventral Suction Pads (Twin machined cups per segment)
      [-1, 1].forEach((padPos, pIdx) => {
        const padZ = segLen * (0.3 + pIdx * 0.4);
        const suctionCupGeom = new THREE.CylinderGeometry(rProx * 0.55, rProx * 0.35, 0.05, 10);
        const suctionPad = new THREE.Mesh(suctionCupGeom, matSuctionPad);
        suctionPad.position.set(0, -rProx * 0.8, padZ);
        suctionPad.name = `arm_${a}_seg_${s}_pad_${pIdx}`;
        segGroup.add(suctionPad);

        const padValve = new THREE.Mesh(new THREE.CylinderGeometry(rProx * 0.15, rProx * 0.15, 0.07, 6), matBrightMetal);
        padValve.position.set(0, -rProx * 0.82, padZ);
        padValve.name = `arm_${a}_seg_${s}_valve_${pIdx}`;
        segGroup.add(padValve);
      });

      // Side cable conduit (Local to segment, splits at joint)
      const conduitGeom = new THREE.CylinderGeometry(0.016, 0.016, segLen * 0.85, 5);
      const conduit = new THREE.Mesh(conduitGeom, matCable);
      conduit.rotation.x = Math.PI / 2;
      conduit.position.set(rProx * 0.85, 0, segLen * 0.48);
      conduit.name = `arm_${a}_seg_${s}_conduit`;
      segGroup.add(conduit);
    }

    // Terminal Tip: 3-prong micro-gripper and hardened barb
    const tipGroup = new THREE.Group();
    tipGroup.name = `arm_${a}_tip`;
    tipGroup.position.set(0, 0, 0.22);
    parentNode.add(tipGroup);

    const tipCore = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), matBrightMetal);
    tipCore.rotation.x = Math.PI / 2;
    tipCore.name = `arm_${a}_tip_barb`;
    tipGroup.add(tipCore);

    for (let p = 0; p < 3; p++) {
      const pAngle = (p / 3) * Math.PI * 2;
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.12), matDarkMetal);
      claw.position.set(Math.cos(pAngle) * 0.04, Math.sin(pAngle) * 0.04, 0.06);
      claw.rotation.z = pAngle;
      claw.rotation.x = 0.2;
      claw.name = `arm_${a}_tip_prong_${p}`;
      tipGroup.add(claw);
    }

    armJoints.push(jointsForArm);
  }

  // -------------------------------------------------------------------------
  // 6. GREEBLES & FASTENERS PASS
  // -------------------------------------------------------------------------
  // Add fastener rings, port blocks, and status modules across the chassis
  for (let g = 0; g < 12; g++) {
    const angle = (g / 12) * Math.PI * 2;
    const greeble = new THREE.Mesh(geomHexBolt(0.025, 0.03), matBrightMetal);
    greeble.position.set(Math.cos(angle) * 0.72, 0.05, Math.sin(angle) * 0.72);
    greeble.name = `hub_outer_greeble_${g}`;
    hubGroup.add(greeble);
  }

  // Single subtle status port on mantle flank (maximum 2 emissive spots rule)
  const statusPortGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8);
  const matStatusAmber = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0xD97706),
    emissive: new THREE.Color(0xD97706),
    emissiveIntensity: 0.8,
    metalness: 0.1,
    roughness: 0.2
  });
  const statusPort = new THREE.Mesh(statusPortGeom, matStatusAmber);
  statusPort.rotation.z = Math.PI / 2;
  statusPort.position.set(0.78, 0.25, -0.9);
  statusPort.name = 'status_port_mantle';
  mantleGroup.add(statusPort);

  // -------------------------------------------------------------------------
  // 7. POSE FUNCTION (ALL 25 SITUATIONS HANDLED)
  // -------------------------------------------------------------------------
  root.userData.pose = (s) => {
    const t = s.t || 0;
    const speed = s.speed !== undefined ? s.speed : 0;
    const stride = s.stride !== undefined ? s.stride : 0;
    const turn = s.turn !== undefined ? s.turn : 0;
    const grounded = s.grounded !== undefined ? s.grounded : true;
    const health = s.health !== undefined ? s.health : 1.0;
    const action = s.action || null;
    const phase = s.phase !== undefined ? s.phase : 0;

    // Reset base hub transforms
    hubGroup.position.set(0, 0.65, 0);
    hubGroup.rotation.set(0, 0, 0);

    // Head rest
    headGroup.rotation.set(0.05, 0, 0);
    headGroup.position.set(0, 0.18, 0.45);

    // Mantle breathing / resting pulse
    const breathe = Math.sin(t * 1.8) * 0.04;
    mantleGroup.position.set(0, 0.15 + breathe * 0.5, -0.35);
    mantleGroup.rotation.set(-0.22 + breathe * 0.5, 0, 0);
    mantleGroup.scale.set(1.0 + breathe * 0.3, 1.0 + breathe * 0.4, 1.0 + breathe * 0.2);

    // Siphon rest
    siphonSwivel.rotation.set(0, 0, 0);
    siphonNozzle.rotation.set(Math.PI / 4, 0, 0);

    // Beak rest
    beakUpperGroup.rotation.set(0, 0, 0);
    beakLowerGroup.rotation.set(0, 0, 0);

    // Base Arm Poses Cache
    // We compute pitch/yaw/roll for each of the 6 segments across the 8 arms
    const segRotations = Array.from({ length: 8 }, () =>
      Array.from({ length: 6 }, () => ({ x: 0, y: 0, z: 0 }))
    );

    // -----------------------------------------------------------------------
    // GAIT & LOCOMOTION
    // -----------------------------------------------------------------------
    if (speed === 0) {
      // STAND / IDLE — organic resting stance, arms undulating slowly, touching ground
      for (let a = 0; a < 8; a++) {
        const armPhase = t * 1.2 + a * 0.78;
        const wave = Math.sin(armPhase);
        const waveCos = Math.cos(armPhase);

        segRotations[a][0].x = 0.35 + wave * 0.04;
        segRotations[a][0].y = Math.sin(t * 0.8 + a) * 0.06;
        segRotations[a][1].x = 0.25 + waveCos * 0.05;
        segRotations[a][2].x = -0.30 + wave * 0.06;
        segRotations[a][3].x = -0.35 + waveCos * 0.08;
        segRotations[a][4].x = 0.20 + wave * 0.07;
        segRotations[a][5].x = 0.30 + waveCos * 0.10;
        segRotations[a][5].y = wave * 0.12;
      }
      // Gentle eye tracking
      headGroup.rotation.y = Math.sin(t * 0.6) * 0.12;
      headGroup.rotation.x = 0.05 + Math.cos(t * 0.8) * 0.04;
    } else if (speed <= 1.5) {
      // CRAWLING / WALKING GAIT (speed 0.5 to 1.0)
      // Driven off s.stride so feet never skate
      const crawlAmount = Math.min(speed, 1.0);
      hubGroup.position.y = 0.55 - crawlAmount * 0.08 + Math.sin(stride * Math.PI * 4) * 0.03;

      for (let a = 0; a < 8; a++) {
        // Metachronal phase offset between arms
        const armStridePhase = (stride + a * 0.25) % 1.0;
        const cycleRad = armStridePhase * Math.PI * 2;
        const lift = Math.max(0, Math.sin(cycleRad));
        const reach = Math.cos(cycleRad);

        // Shoulder reach & push
        segRotations[a][0].x = 0.3 + reach * 0.35 * crawlAmount;
        segRotations[a][0].y = Math.sin(cycleRad) * 0.15;
        // Knee lift & plant
        segRotations[a][1].x = 0.35 - lift * 0.45;
        segRotations[a][2].x = -0.45 + lift * 0.3;
        segRotations[a][3].x = -0.35 + reach * 0.25;
        segRotations[a][4].x = 0.25 - reach * 0.15;
        segRotations[a][5].x = 0.40 + lift * 0.2;
      }
    } else {
      // HIGH SPEED PROPULSION / JET SWIM (speed 2.0, 3.0, 6.0)
      // Hydrodynamic teardrop dart: arms streamline together trailing behind
      const jetFactor = Math.min((speed - 1.0) / 5.0, 1.0);
      const jetPulse = Math.sin(stride * Math.PI * 2);

      hubGroup.rotation.x = -0.35 * jetFactor; // mantle tilts in line with travel
      hubGroup.position.y = 0.65 + Math.sin(stride * Math.PI * 2) * 0.08 * jetFactor;

      // Mantle thrust compression
      mantleGroup.scale.set(
        1.0 - jetPulse * 0.15 * jetFactor,
        1.0 - jetPulse * 0.15 * jetFactor,
        1.0 + jetPulse * 0.25 * jetFactor
      );

      // Siphon discharges backward
      siphonNozzle.rotation.x = Math.PI * 0.6;

      for (let a = 0; a < 8; a++) {
        const streamTuck = 0.65 * jetFactor;
        // Arms tuck backwards into jet cone
        segRotations[a][0].x = -0.45 * streamTuck + jetPulse * 0.15;
        segRotations[a][1].x = -0.35 * streamTuck;
        segRotations[a][2].x = -0.25 * streamTuck;
        segRotations[a][3].x = -0.15 * streamTuck;
        segRotations[a][4].x = 0.10 + jetPulse * 0.25;
        segRotations[a][5].x = 0.20 + jetPulse * 0.35;

        // Front arms reach forward like torpedo fins at top speed (6.0)
        if ((a === 0 || a === 7) && speed > 4.0) {
          segRotations[a][0].x = 0.6;
          segRotations[a][1].x = 0.4;
          segRotations[a][2].x = 0.2;
        }
      }
    }

    // -----------------------------------------------------------------------
    // OVERLAYS (Turn, Airborne, Hurt)
    // -----------------------------------------------------------------------
    if (turn !== 0) {
      hubGroup.rotation.z = -turn * 0.25;
      hubGroup.rotation.y = -turn * 0.3;
      mantleGroup.rotation.y = turn * 0.25;
      headGroup.rotation.y = -turn * 0.4;
      siphonSwivel.rotation.y = turn * 0.5;

      // Inside arms curl tighter, outside arms reach wider
      for (let a = 0; a < 8; a++) {
        const isRightArm = a < 4;
        const sideFactor = isRightArm ? 1 : -1;
        segRotations[a][0].y += turn * sideFactor * 0.25;
        segRotations[a][2].z += turn * 0.15;
      }
    }

    if (!grounded) {
      // AIRBORNE / FLOATING — tentacles trail in suspension, undulating
      hubGroup.position.y += 0.25;
      for (let a = 0; a < 8; a++) {
        const hang = Math.sin(t * 2.0 + a) * 0.12;
        segRotations[a][0].x = -0.25 + hang;
        segRotations[a][1].x = -0.20;
        segRotations[a][2].x = -0.15;
        segRotations[a][3].x = 0.25 + hang;
        segRotations[a][4].x = 0.35;
        segRotations[a][5].x = 0.45;
      }
    }

    if (health < 0.8) {
      // HURT OVERLAY — sagging posture, dragging damaged limbs, limping bias
      const hurtSeverity = (0.8 - health) / 0.8;
      hubGroup.position.y -= 0.15 * hurtSeverity;
      hubGroup.rotation.z += 0.2 * hurtSeverity;
      headGroup.rotation.x -= 0.25 * hurtSeverity;
      mantleGroup.rotation.x -= 0.18 * hurtSeverity;

      // Limp on left side arms (4, 5, 6, 7)
      [4, 5, 6, 7].forEach((a) => {
        segRotations[a][0].x += 0.3 * hurtSeverity;
        segRotations[a][1].x -= 0.4 * hurtSeverity;
        segRotations[a][2].x -= 0.3 * hurtSeverity;
      });
    }

    // -----------------------------------------------------------------------
    // ACTIONS (s.action & s.phase)
    // -----------------------------------------------------------------------
    if (action) {
      if (action === 'attack') {
        // Rapid tentacle strike & beak bite
        if (phase < 0.3) {
          // Windup: arms coil back, beaks open
          const w = phase / 0.3;
          hubGroup.position.z = -0.2 * w;
          headGroup.rotation.x = -0.2 * w;
          beakUpperGroup.rotation.x = 0.4 * w;
          beakLowerGroup.rotation.x = -0.4 * w;
          // Front arms coil
          [0, 1, 6, 7].forEach((a) => {
            segRotations[a][0].x = -0.5 * w;
            segRotations[a][1].x = -0.6 * w;
            segRotations[a][2].x = 0.7 * w;
          });
        } else if (phase < 0.6) {
          // Strike commit: front tentacles whip forward with extreme reach, beaks snap
          const c = (phase - 0.3) / 0.3;
          hubGroup.position.z = 0.35 * c;
          headGroup.rotation.x = 0.35 * c;
          beakUpperGroup.rotation.x = -0.3;
          beakLowerGroup.rotation.x = 0.3;
          [0, 7].forEach((a) => {
            segRotations[a][0].x = 0.95;
            segRotations[a][1].x = 0.45;
            segRotations[a][2].x = 0.15;
            segRotations[a][3].x = -0.25;
            segRotations[a][4].x = -0.35;
          });
        } else {
          // Recovery back to stance
          const r = (phase - 0.6) / 0.4;
          hubGroup.position.z = 0.35 * (1 - r);
          beakUpperGroup.rotation.x = -0.3 * (1 - r);
          beakLowerGroup.rotation.x = 0.3 * (1 - r);
        }
      } else if (action === 'fire') {
        // High-pressure ink/plasma blast from siphon
        if (phase < 0.3) {
          // Aim siphon forward and load mantle
          const w = phase / 0.3;
          siphonNozzle.rotation.x = (Math.PI / 4) * (1 - w);
          mantleGroup.scale.set(1 + 0.25 * w, 1 + 0.25 * w, 1 - 0.15 * w);
        } else if (phase < 0.6) {
          // Discharge blast: violent recoil rocking backward
          const d = (phase - 0.3) / 0.3;
          hubGroup.position.z = -0.45 * (1 - d * 0.5);
          hubGroup.rotation.x = 0.35 * (1 - d * 0.5);
          mantleGroup.scale.set(0.8, 0.8, 1.3); // rapid collapse
          siphonNozzle.rotation.x = -0.1;
        } else {
          // Settle back
          const r = (phase - 0.6) / 0.4;
          hubGroup.position.z = -0.22 * (1 - r);
          hubGroup.rotation.x = 0.18 * (1 - r);
        }
      } else if (action === 'hit') {
        // Fast flinch impact shockwave
        const hFlinch = Math.sin(phase * Math.PI);
        hubGroup.position.z = -0.35 * hFlinch;
        hubGroup.position.y = 0.65 - 0.2 * hFlinch;
        headGroup.rotation.x = -0.45 * hFlinch;
        mantleGroup.rotation.x = 0.35 * hFlinch;
        for (let a = 0; a < 8; a++) {
          segRotations[a][0].x += 0.5 * hFlinch;
          segRotations[a][2].x -= 0.6 * hFlinch;
        }
      } else if (action === 'block') {
        // COMPLETE ARMOURED SHELL BALL: All 8 arms curl tightly over head and mantle
        const b = Math.sin(phase * Math.PI);
        hubGroup.position.y = 0.45 - 0.15 * b;
        headGroup.position.y = 0.05;
        headGroup.rotation.x = -0.3 * b;
        mantleGroup.rotation.x = -0.4 * b;

        for (let a = 0; a < 8; a++) {
          segRotations[a][0].x = 0.8 * b;
          segRotations[a][1].x = 0.7 * b;
          segRotations[a][2].x = 0.6 * b;
          segRotations[a][3].x = 0.6 * b;
          segRotations[a][4].x = 0.5 * b;
          segRotations[a][5].x = 0.4 * b;
        }
      } else if (action === 'gather') {
        // Front arms reach down, grip object, and pull to central beak
        const g = Math.sin(phase * Math.PI);
        headGroup.rotation.x = 0.3 * g;
        [0, 1, 6, 7].forEach((a) => {
          segRotations[a][0].x = 0.7 * g;
          segRotations[a][1].x = 0.5 * g;
          segRotations[a][2].x = -0.4 * g;
          segRotations[a][3].x = -0.6 * g;
        });
      } else if (action === 'deposit') {
        // Extend front arms downward, uncurling
        const d = Math.sin(phase * Math.PI);
        [0, 7].forEach((a) => {
          segRotations[a][0].x = 0.4 * d;
          segRotations[a][1].x = -0.2 * d;
          segRotations[a][2].x = -0.4 * d;
          segRotations[a][5].x = 0.6 * d;
        });
      } else if (action === 'eat') {
        // Head down, beaks working cyclically 3 times across phase
        const eatCycle = Math.sin(phase * Math.PI * 6);
        headGroup.rotation.x = 0.25;
        beakUpperGroup.rotation.x = Math.max(0, eatCycle) * 0.4;
        beakLowerGroup.rotation.x = -Math.max(0, eatCycle) * 0.4;
        [0, 7].forEach((a) => {
          segRotations[a][0].x = 0.4;
          segRotations[a][1].x = 0.3;
          segRotations[a][2].x = -0.3 + eatCycle * 0.1;
        });
      } else if (action === 'drink') {
        // Siphon lowered to ground, rhythmic suction pulses
        const drinkPulse = Math.sin(phase * Math.PI * 4) * 0.1;
        siphonSwivel.rotation.x = 0.35;
        siphonNozzle.rotation.x = 0.5;
        mantleGroup.scale.set(1 + drinkPulse, 1 + drinkPulse, 1 - drinkPulse);
      } else if (action === 'jump') {
        // Jet burst launch
        if (phase < 0.35) {
          // Crouch load
          const c = phase / 0.35;
          hubGroup.position.y = 0.65 - 0.3 * c;
          for (let a = 0; a < 8; a++) {
            segRotations[a][0].x = 0.6 * c;
            segRotations[a][1].x = 0.4 * c;
          }
        } else {
          // Extension burst
          const e = (phase - 0.35) / 0.65;
          hubGroup.position.y = 0.35 + 1.2 * e;
          siphonNozzle.rotation.x = Math.PI * 0.55;
          for (let a = 0; a < 8; a++) {
            segRotations[a][0].x = -0.6 * (1 - e * 0.5);
            segRotations[a][1].x = -0.4;
          }
        }
      } else if (action === 'land') {
        // Compression shock on arrival
        const l = Math.sin(phase * Math.PI);
        hubGroup.position.y = 0.65 - 0.35 * l;
        for (let a = 0; a < 8; a++) {
          segRotations[a][0].x = 0.5 * l;
          segRotations[a][1].x = 0.6 * l;
          segRotations[a][2].x = -0.5 * l;
        }
      } else if (action === 'signal') {
        // Threat / Dominance display: Mantle flares high, all 8 arms spread wide radially
        const sMag = Math.sin(phase * Math.PI);
        hubGroup.position.y = 0.65 + 0.4 * sMag;
        mantleGroup.rotation.x = (-0.22 + 0.45 * sMag);
        mantleGroup.scale.set(1 + 0.3 * sMag, 1 + 0.35 * sMag, 1 + 0.2 * sMag);
        beakUpperGroup.rotation.x = 0.4 * sMag;
        beakLowerGroup.rotation.x = -0.4 * sMag;

        for (let a = 0; a < 8; a++) {
          segRotations[a][0].x = 0.7 * sMag;
          segRotations[a][1].x = -0.3 * sMag;
          segRotations[a][2].x = -0.4 * sMag;
          segRotations[a][3].x = -0.4 * sMag;
          segRotations[a][4].x = 0.5 * sMag;
        }
      } else if (action === 'sleep') {
        // Shutdown: Lower to ground, fold tight, hold last frame
        const sl = Math.min(phase * 1.2, 1.0);
        hubGroup.position.y = 0.65 - 0.4 * sl;
        mantleGroup.position.y = 0.15 - 0.15 * sl;
        mantleGroup.rotation.x = -0.4 * sl;
        headGroup.rotation.x = -0.3 * sl;

        for (let a = 0; a < 8; a++) {
          segRotations[a][0].x = 0.4 * sl;
          segRotations[a][1].x = 0.5 * sl;
          segRotations[a][2].x = -0.4 * sl;
          segRotations[a][3].x = -0.3 * sl;
          segRotations[a][4].x = 0.4 * sl;
        }
      } else if (action === 'wake') {
        // Stir from sleep to standing
        const wk = Math.min(phase * 1.1, 1.0);
        hubGroup.position.y = 0.25 + 0.4 * wk;
        mantleGroup.rotation.x = -0.4 * (1 - wk) - 0.22 * wk;
      } else if (action === 'die') {
        // Complete collapse to floor, limp wreck stays down
        const dPhase = Math.min(phase, 1.0);
        hubGroup.position.y = 0.65 - 0.52 * dPhase;
        hubGroup.rotation.z = 0.35 * dPhase;
        hubGroup.rotation.x = 0.25 * dPhase;
        headGroup.rotation.x = -0.45 * dPhase;
        mantleGroup.scale.set(1.1 * (1 - dPhase * 0.4), 0.6, 1.2);

        for (let a = 0; a < 8; a++) {
          segRotations[a][0].x = (0.2 + a * 0.05) * dPhase;
          segRotations[a][1].x = -0.3 * dPhase;
          segRotations[a][2].x = (0.4 - a * 0.08) * dPhase;
          segRotations[a][3].x = -0.5 * dPhase;
          segRotations[a][4].x = 0.2 * dPhase;
        }
      } else if (action === 'evolve') {
        // Overclock transformation: Mantle vents open, arms arch back vibrating
        const ev = Math.sin(phase * Math.PI);
        const jitter = Math.sin(phase * 40.0) * 0.04 * ev;
        hubGroup.position.y = 0.65 + 0.35 * ev + jitter;
        mantleGroup.scale.set(1 + 0.4 * ev, 1 + 0.4 * ev, 1 + 0.4 * ev);
        for (let a = 0; a < 8; a++) {
          segRotations[a][0].x = -0.6 * ev;
          segRotations[a][1].x = 0.7 * ev;
          segRotations[a][2].x = 0.5 * ev;
          segRotations[a][3].x = -0.6 * ev;
        }
      }
    }

    // -----------------------------------------------------------------------
    // APPLY ROTATIONS TO HIERARCHY
    // -----------------------------------------------------------------------
    for (let a = 0; a < 8; a++) {
      for (let s = 0; s < 6; s++) {
        const joint = armJoints[a][s];
        if (joint) {
          const rot = segRotations[a][s];
          joint.rotation.set(rot.x, rot.y, rot.z);
        }
      }
    }
  };

  return root;
}