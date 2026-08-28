```javascript
function build(THREE, TSL) {
  // THE ONE QUALITY: MASS AND TENTACULAR PRECISION
  // A heavy industrial cephalopod frame clad in bone-white pressed armor shells,
  // packing a high-pressure hydraulic core, radial crown gear turret, dual recessed
  // dark-glass optical nacelles, hardened titanium beak mandibles, directional siphon,
  // and eight fully articulated five-segment arms with machined sucker irises and rams.

  const {
    Fn, vec2, vec3, vec4, float, positionLocal, normalLocal,
    sin, cos, abs, dot, clamp, mix, smoothstep, fract, floor, mul, add, sub
  } = TSL;

  // ── SHADERS & MATERIALS ──────────────────────────────────────────────────
  const smoothNoise = Fn(([p]) => {
    const p3 = fract(mul(p, vec3(0.1031, 0.1030, 0.0973)));
    const d = dot(p3, add(p3.yzx, float(33.33)));
    const p4 = fract(mul(add(p3.xxy, p3.yzz), d));
    return fract(mul(add(p4.x, p4.y), p4.z));
  });

  const noise3d = Fn(([pos, scale]) => {
    const sp = mul(pos, scale);
    const i = floor(sp);
    const f = fract(sp);
    const u = mul(mul(f, f), sub(float(3.0), mul(float(2.0), f)));
    const n000 = smoothNoise(i);
    const n100 = smoothNoise(add(i, vec3(1.0, 0.0, 0.0)));
    const n010 = smoothNoise(add(i, vec3(0.0, 1.0, 0.0)));
    const n110 = smoothNoise(add(i, vec3(1.0, 1.0, 0.0)));
    const n001 = smoothNoise(add(i, vec3(0.0, 0.0, 1.0)));
    const n101 = smoothNoise(add(i, vec3(1.0, 0.0, 1.0)));
    const n011 = smoothNoise(add(i, vec3(0.0, 1.0, 1.0)));
    const n111 = smoothNoise(add(i, vec3(1.0, 1.0, 1.0)));
    const x00 = mix(n000, n100, u.x);
    const x10 = mix(n010, n110, u.x);
    const x01 = mix(n001, n101, u.x);
    const x11 = mix(n011, n111, u.x);
    const y0 = mix(x00, x10, u.y);
    const y1 = mix(x01, x11, u.y);
    return mix(y0, y1, u.z);
  });

  const shellColorNode = Fn(() => {
    const n1 = noise3d(positionLocal, float(5.0));
    const n2 = noise3d(positionLocal, float(16.0));
    const nCombined = add(mul(n1, float(0.65)), mul(n2, float(0.35)));

    const edgeMask = smoothstep(float(0.4), float(0.85), abs(normalLocal.x));
    const wear = mul(smoothstep(float(0.45), float(0.8), nCombined), edgeMask);
    const downBias = clamp(sub(float(0.2), normalLocal.y), float(0.0), float(1.0));
    const grime = mul(smoothstep(float(0.35), float(0.75), n1), downBias);

    const baseWhite = vec3(0.847, 0.823, 0.776); // #D8D2C6
    const shadowWhite = vec3(0.71, 0.68, 0.62); // #B5AC9C
    const darkSteel = vec3(0.24, 0.23, 0.21);   // #3E3A34
    const rustColor = vec3(0.35, 0.18, 0.12);

    const c1 = mix(baseWhite, shadowWhite, grime);
    const c2 = mix(c1, rustColor, mul(grime, float(0.45)));
    return mix(c2, darkSteel, wear);
  });

  const accentColorNode = Fn(() => {
    const n1 = noise3d(positionLocal, float(5.0));
    const edgeMask = smoothstep(float(0.4), float(0.85), abs(normalLocal.x));
    const wear = mul(smoothstep(float(0.45), float(0.8), n1), edgeMask);
    const baseAccent = vec3(0.76, 0.32, 0.12); // #C2521E rust orange
    const darkSteel = vec3(0.24, 0.23, 0.21);
    return mix(baseAccent, darkSteel, wear);
  });

  const shellRoughnessNode = Fn(() => {
    const n1 = noise3d(positionLocal, float(6.0));
    const dust = clamp(normalLocal.y, float(0.0), float(1.0));
    return clamp(add(float(0.52), add(mul(n1, float(0.18)), mul(dust, float(0.18)))), float(0.3), float(0.95));
  });

  const machineColorNode = Fn(() => {
    const n = noise3d(positionLocal, float(9.0));
    const baseMetal = vec3(0.33, 0.32, 0.30);  // #55524C gunmetal
    const wornMetal = vec3(0.44, 0.42, 0.39);  // #6B665E
    const crevice = vec3(0.18, 0.17, 0.16);
    const c = mix(baseMetal, wornMetal, mul(n, float(0.55)));
    const dust = clamp(normalLocal.y, float(0.0), float(1.0));
    return mix(c, crevice, mul(float(0.8), sub(float(1.0), dust)));
  });

  // Material instances
  const shellMat = new THREE.MeshStandardNodeMaterial({
    colorNode: shellColorNode(),
    roughnessNode: shellRoughnessNode(),
    metalness: 0.12,
    roughness: 0.6
  });

  const accentMat = new THREE.MeshStandardNodeMaterial({
    colorNode: accentColorNode(),
    roughnessNode: shellRoughnessNode(),
    metalness: 0.15,
    roughness: 0.62
  });

  const machineMat = new THREE.MeshStandardNodeMaterial({
    colorNode: machineColorNode(),
    metalness: 0.82,
    roughness: 0.48
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xD6D4D0,
    metalness: 0.95,
    roughness: 0.22
  });

  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x1E1D1B,
    metalness: 0.05,
    roughness: 0.88
  });

  const eyeGlassMat = new THREE.MeshStandardMaterial({
    color: 0x080B10,
    metalness: 0.1,
    roughness: 0.04
  });

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0x4A4238,
    metalness: 0.75,
    roughness: 0.5
  });

  // ── ROOT ASSEMBLY ────────────────────────────────────────────────────────
  const root = new THREE.Group();
  root.name = 'octopus_root';

  // Master crown & chassis
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  chassis.position.set(0, 0.9, 0);
  root.add(chassis);

  // ── 1. CROWN / HEAD / SENSOR CRADLE (LEADING END) ────────────────────────
  const crownTurret = new THREE.Group();
  crownTurret.name = 'crown_turret';
  chassis.add(crownTurret);

  // Crown Ring gear base
  const ringGeo = new THREE.CylinderGeometry(0.68, 0.74, 0.24, 24);
  const ringMesh = new THREE.Mesh(ringGeo, machineMat);
  ringMesh.name = 'crown_gear_ring';
  crownTurret.add(ringMesh);

  // Gear teeth around circumference
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const toothGeo = new THREE.BoxGeometry(0.04, 0.18, 0.08);
    const tooth = new THREE.Mesh(toothGeo, machineMat);
    tooth.name = `crown_tooth_${i}`;
    tooth.position.set(Math.cos(angle) * 0.75, 0, Math.sin(angle) * 0.75);
    tooth.rotation.y = -angle;
    crownTurret.add(tooth);
  }

  // Cranial sensor deck
  const browCowl = new THREE.Group();
  browCowl.name = 'brow_cowl';
  browCowl.position.set(0, 0.22, 0.15);
  crownTurret.add(browCowl);

  const browPlateShape = new THREE.Shape();
  browPlateShape.moveTo(-0.45, -0.15);
  browPlateShape.lineTo(0.45, -0.15);
  browPlateShape.lineTo(0.38, 0.22);
  browPlateShape.lineTo(0.0, 0.32);
  browPlateShape.lineTo(-0.38, 0.22);
  browPlateShape.closePath();

  const browPlateGeo = new THREE.ExtrudeGeometry(browPlateShape, {
    depth: 0.25,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.03,
    bevelThickness: 0.03
  });
  const browMesh = new THREE.Mesh(browPlateGeo, shellMat);
  browMesh.name = 'brow_armour_plate';
  browMesh.rotation.x = Math.PI * 0.25;
  browMesh.position.set(0, 0, 0);
  browCowl.add(browMesh);

  // Dual auxiliary rangefinder ports
  for (let s of [-1, 1]) {
    const rfBezel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.06, 12), machineMat);
    rfBezel.name = s > 0 ? 'rangefinder_bezel_R' : 'rangefinder_bezel_L';
    rfBezel.rotation.x = Math.PI * 0.5;
    rfBezel.position.set(s * 0.18, 0.12, 0.35);
    browCowl.add(rfBezel);

    const rfLens = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), eyeGlassMat);
    rfLens.name = s > 0 ? 'rangefinder_lens_R' : 'rangefinder_lens_L';
    rfLens.position.set(0, 0.02, 0);
    rfBezel.add(rfLens);
  }

  // Lateral Optic Assemblies (Eyes: Left & Right)
  const eyeAssemblies = {};
  for (let s of [-1, 1]) {
    const side = s > 0 ? 'R' : 'L';
    const eyeNacelle = new THREE.Group();
    eyeNacelle.name = `eye_nacelle_${side}`;
    eyeNacelle.position.set(s * 0.58, 0.08, 0.28);
    eyeNacelle.rotation.y = s * 0.45;
    crownTurret.add(eyeNacelle);

    // Gimbal yoke socket
    const yokeGeo = new THREE.BoxGeometry(0.18, 0.22, 0.22);
    const yokeMesh = new THREE.Mesh(yokeGeo, machineMat);
    yokeMesh.name = `eye_yoke_${side}`;
    eyeNacelle.add(yokeMesh);

    // Bezel housing
    const bezelGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.12, 16);
    const bezelMesh = new THREE.Mesh(bezelGeo, machineMat);
    bezelMesh.name = `eye_bezel_${side}`;
    bezelMesh.rotation.x = Math.PI * 0.5;
    bezelMesh.position.set(0, 0, 0.1);
    eyeNacelle.add(bezelMesh);

    // Stepped knurled collar
    const collarGeo = new THREE.TorusGeometry(0.14, 0.025, 8, 16);
    const collarMesh = new THREE.Mesh(collarGeo, brassMat);
    collarMesh.name = `eye_collar_${side}`;
    collarMesh.position.set(0, 0, 0.04);
    bezelMesh.add(collarMesh);

    // Recessed dark glass lens (deep socket)
    const lensGeo = new THREE.SphereGeometry(0.10, 16, 12);
    const lensMesh = new THREE.Mesh(lensGeo, eyeGlassMat);
    lensMesh.name = `eye_lens_${side}`;
    lensMesh.position.set(0, 0.04, 0);
    bezelMesh.add(lensMesh);

    // Protective eyebrow shell hood
    const hoodGeo = new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI, 0, Math.PI * 0.5);
    const hoodMesh = new THREE.Mesh(hoodGeo, shellMat);
    hoodMesh.name = `eye_hood_${side}`;
    hoodMesh.rotation.x = -Math.PI * 0.4;
    hoodMesh.position.set(0, 0.08, 0.04);
    eyeNacelle.add(hoodMesh);

    // Telemetry antenna mast
    const antGeo = new THREE.CylinderGeometry(0.01, 0.018, 0.28, 8);
    const antMesh = new THREE.Mesh(antGeo, machineMat);
    antMesh.name = `eye_antenna_${side}`;
    antMesh.position.set(0, 0.18, -0.05);
    antMesh.rotation.z = -s * 0.2;
    eyeNacelle.add(antMesh);

    eyeAssemblies[side] = eyeNacelle;
  }

  // Hardened Beak Mandibles (Ventral Rostrum)
  const beakAssembly = new THREE.Group();
  beakAssembly.name = 'beak_assembly';
  beakAssembly.position.set(0, -0.22, 0.28);
  crownTurret.add(beakAssembly);

  const beakBaseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.24), machineMat);
  beakBaseMesh.name = 'beak_base_housing';
  beakAssembly.add(beakBaseMesh);

  // Upper Beak Mandible
  const beakUpper = new THREE.Group();
  beakUpper.name = 'beak_upper';
  beakUpper.position.set(0, 0.04, 0.08);
  beakAssembly.add(beakUpper);

  const beakUpperGeo = new THREE.ConeGeometry(0.11, 0.28, 4);
  const beakUpperMesh = new THREE.Mesh(beakUpperGeo, machineMat);
  beakUpperMesh.name = 'beak_upper_blade';
  beakUpperMesh.rotation.x = Math.PI * 0.65;
  beakUpperMesh.scale.set(0.7, 1.2, 0.5);
  beakUpper.add(beakUpperMesh);

  // Lower Beak Mandible
  const beakLower = new THREE.Group();
  beakLower.name = 'beak_lower';
  beakLower.position.set(0, -0.05, 0.08);
  beakAssembly.add(beakLower);

  const beakLowerGeo = new THREE.ConeGeometry(0.12, 0.26, 4);
  const beakLowerMesh = new THREE.Mesh(beakLowerGeo, machineMat);
  beakLowerMesh.name = 'beak_lower_blade';
  beakLowerMesh.rotation.x = Math.PI * 0.35;
  beakLowerMesh.scale.set(0.65, 1.1, 0.45);
  beakLower.add(beakLowerMesh);

  // Beak linear actuators
  for (let s of [-1, 1]) {
    const ram = new THREE.Group();
    ram.name = s > 0 ? 'beak_ram_R' : 'beak_ram_L';
    ram.position.set(s * 0.12, 0.02, 0);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), machineMat);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8), chromeMat);
    rod.position.y = 0.06;
    ram.add(cyl);
    ram.add(rod);
    ram.rotation.x = Math.PI * 0.5;
    beakAssembly.add(ram);
  }

  // Directional Siphon / Hyponome Jet
  const siphon = new THREE.Group();
  siphon.name = 'siphon';
  siphon.position.set(0, -0.32, -0.05);
  crownTurret.add(siphon);

  const siphonBase = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), machineMat);
  siphonBase.name = 'siphon_gimbal_base';
  siphon.add(siphonBase);

  const siphonNozzle = new THREE.Group();
  siphonNozzle.name = 'siphon_nozzle';
  siphonNozzle.position.set(0, -0.06, 0.08);
  siphon.add(siphonNozzle);

  const nozzleGeo = new THREE.CylinderGeometry(0.12, 0.08, 0.32, 16);
  const nozzleMesh = new THREE.Mesh(nozzleGeo, machineMat);
  nozzleMesh.name = 'siphon_nozzle_body';
  nozzleMesh.rotation.x = Math.PI * 0.35;
  siphonNozzle.add(nozzleMesh);

  const nozzleCollar = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 8, 16), brassMat);
  nozzleCollar.name = 'siphon_vector_ring';
  nozzleCollar.position.set(0, -0.12, 0.1);
  nozzleCollar.rotation.x = Math.PI * 0.35;
  siphonNozzle.add(nozzleCollar);

  // ── 2. MANTLE ASSEMBLY (TORSO / POWER CORE / REAR MASS) ───────────────────
  const mantle = new THREE.Group();
  mantle.name = 'mantle';
  mantle.position.set(0, 0.25, -0.2);
  mantle.rotation.x = -0.25;
  chassis.add(mantle);

  // Mantle Bulkhead Skeleton (5 vertebrae segment hoops)
  const bulkheadRadii = [0.65, 0.72, 0.68, 0.54, 0.32];
  const bulkheadZ = [-0.15, -0.5, -0.9, -1.3, -1.65];
  for (let i = 0; i < 5; i++) {
    const bhGeo = new THREE.TorusGeometry(bulkheadRadii[i], 0.045, 8, 20);
    const bhMesh = new THREE.Mesh(bhGeo, machineMat);
    bhMesh.name = `mantle_bulkhead_${i}`;
    bhMesh.position.set(0, 0, bulkheadZ[i]);
    mantle.add(bhMesh);
  }

  // Internal Hydraulic Reactor Core Cylinder
  const reactorGeo = new THREE.CylinderGeometry(0.38, 0.26, 1.4, 16);
  const reactorMesh = new THREE.Mesh(reactorGeo, machineMat);
  reactorMesh.name = 'reactor_core';
  reactorMesh.rotation.x = Math.PI * 0.5;
  reactorMesh.position.set(0, 0, -0.85);
  mantle.add(reactorMesh);

  // Interleaved heat radiator vane pack (10 thin metal plates)
  for (let i = 0; i < 10; i++) {
    const vaneGeo = new THREE.BoxGeometry(0.72 - i * 0.03, 0.58 - i * 0.02, 0.02);
    const vaneMesh = new THREE.Mesh(vaneGeo, machineMat);
    vaneMesh.name = `radiator_vane_${i}`;
    vaneMesh.position.set(0, 0, -0.35 - i * 0.11);
    mantle.add(vaneMesh);
  }

  // High-pressure accumulator sphere tanks
  for (let s of [-1, 1]) {
    const accumGeo = new THREE.SphereGeometry(0.16, 12, 10);
    const accumMesh = new THREE.Mesh(accumGeo, machineMat);
    accumMesh.name = s > 0 ? 'accumulator_tank_R' : 'accumulator_tank_L';
    accumMesh.position.set(s * 0.32, -0.15, -0.75);
    mantle.add(accumMesh);
  }

  // Mantle Exterior Armor Shells (Overlapping Bone White Plates)
  // Dorsal Carapace 1 (Anterior hood)
  const cowl1Geo = new THREE.CylinderGeometry(0.72, 0.78, 0.55, 20, 1, true, -Math.PI * 0.65, Math.PI * 1.3);
  const cowl1Mesh = new THREE.Mesh(cowl1Geo, shellMat);
  cowl1Mesh.name = 'mantle_dorsal_cowl_1';
  cowl1Mesh.rotation.x = Math.PI * 0.5;
  cowl1Mesh.position.set(0, 0.12, -0.35);
  mantle.add(cowl1Mesh);

  // Dorsal Carapace 2 (Mid carapace with spine ridge)
  const cowl2Geo = new THREE.CylinderGeometry(0.75, 0.68, 0.6, 20, 1, true, -Math.PI * 0.65, Math.PI * 1.3);
  const cowl2Mesh = new THREE.Mesh(cowl2Geo, shellMat);
  cowl2Mesh.name = 'mantle_dorsal_cowl_2';
  cowl2Mesh.rotation.x = Math.PI * 0.5;
  cowl2Mesh.position.set(0, 0.15, -0.85);
  mantle.add(cowl2Mesh);

  // Raised Spine Keel on Cowl 2
  const keelShape = new THREE.Shape();
  keelShape.moveTo(0, 0);
  keelShape.lineTo(0.06, 0.15);
  keelShape.lineTo(0.55, 0.12);
  keelShape.lineTo(0.60, 0);
  keelShape.closePath();
  const keelGeo = new THREE.ExtrudeGeometry(keelShape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015 });
  const spineKeelMesh = new THREE.Mesh(keelGeo, shellMat);
  spineKeelMesh.name = 'mantle_spine_keel';
  spineKeelMesh.rotation.y = -Math.PI * 0.5;
  spineKeelMesh.position.set(0.03, 0.78, -0.6);
  mantle.add(spineKeelMesh);

  // Dorsal Carapace 3 (Rear apex dome cowl - with rust accent marking on rear station)
  const cowl3Geo = new THREE.SphereGeometry(0.52, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const cowl3Mesh = new THREE.Mesh(cowl3Geo, accentMat);
  cowl3Mesh.name = 'mantle_dorsal_cowl_3';
  cowl3Mesh.rotation.x = -Math.PI * 0.5;
  cowl3Mesh.position.set(0, 0.06, -1.35);
  mantle.add(cowl3Mesh);

  // Rear exhaust thruster cowl ring
  const exhaustRing = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 8, 16), machineMat);
  exhaustRing.name = 'mantle_exhaust_manifold';
  exhaustRing.position.set(0, 0.02, -1.75);
  mantle.add(exhaustRing);

  // Flank Shells (Left & Right)
  for (let s of [-1, 1]) {
    const side = s > 0 ? 'R' : 'L';
    const flankGeo = new THREE.CylinderGeometry(0.68, 0.55, 0.8, 12, 1, true, 0, Math.PI * 0.45);
    const flankMesh = new THREE.Mesh(flankGeo, shellMat);
    flankMesh.name = `mantle_flank_shell_${side}`;
    flankMesh.rotation.x = Math.PI * 0.5;
    flankMesh.rotation.y = s > 0 ? Math.PI * 0.85 : -Math.PI * 0.3;
    flankMesh.position.set(s * 0.18, -0.05, -0.75);
    mantle.add(flankMesh);

    // Lateral hydraulic conduit bundle
    const conduitCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.52, 0.15, -0.1),
      new THREE.Vector3(s * 0.62, 0.0, -0.6),
      new THREE.Vector3(s * 0.48, -0.2, -1.1),
      new THREE.Vector3(s * 0.22, -0.1, -1.5)
    ]);
    const conduitGeo = new THREE.TubeGeometry(conduitCurve, 16, 0.032, 8, false);
    const conduitMesh = new THREE.Mesh(conduitGeo, cableMat);
    conduitMesh.name = `mantle_conduit_${side}`;
    mantle.add(conduitMesh);
  }

  // Ventral Protective Belly Keel Shell
  const bellyGeo = new THREE.CylinderGeometry(0.62, 0.5, 0.9, 16, 1, true, Math.PI * 0.65, Math.PI * 0.7);
  const bellyMesh = new THREE.Mesh(bellyGeo, shellMat);
  bellyMesh.name = 'mantle_ventral_keel';
  bellyMesh.rotation.x = Math.PI * 0.5;
  bellyMesh.position.set(0, -0.22, -0.8);
  mantle.add(bellyMesh);

  // ── 3. EIGHT ARTICULATED TENTACLES (5 LINKS + RAMS + SUCKERS) ─────────────
  const arms = [];
  const armBaseAngles = [
    Math.PI * 0.14,   // 0: Front-Left
    -Math.PI * 0.14,  // 1: Front-Right
    Math.PI * 0.42,   // 2: Mid-Front Left
    -Math.PI * 0.42,  // 3: Mid-Front Right
    Math.PI * 0.68,   // 4: Mid-Rear Left
    -Math.PI * 0.68,  // 5: Mid-Rear Right
    Math.PI * 0.90,   // 6: Rear Left
    -Math.PI * 0.90   // 7: Rear Right
  ];

  const segLengths = [0.44, 0.40, 0.36, 0.32, 0.28];
  const segWidths = [0.18, 0.15, 0.12, 0.09, 0.065];

  for (let a = 0; a < 8; a++) {
    const baseAngle = armBaseAngles[a];
    const armRoot = new THREE.Group();
    armRoot.name = `arm_${a}_root`;

    // Place at radial perimeter of crown
    const rad = 0.66;
    armRoot.position.set(Math.sin(baseAngle) * rad, -0.06, Math.cos(baseAngle) * rad);
    armRoot.rotation.y = baseAngle;
    crownTurret.add(armRoot);

    // Radial gimbal base turret socket
    const socketGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.16, 12);
    const socketMesh = new THREE.Mesh(socketGeo, machineMat);
    socketMesh.name = `arm_${a}_gimbal_socket`;
    armRoot.add(socketMesh);

    let parentNode = armRoot;
    const armSegs = [];

    for (let s = 0; s < 5; s++) {
      const segJoint = new THREE.Group();
      segJoint.name = `arm_${a}_seg_${s}`;
      if (s > 0) {
        segJoint.position.set(0, 0, segLengths[s - 1]);
      }
      parentNode.add(segJoint);
      armSegs.push(segJoint);

      const sl = segLengths[s];
      const sw = segWidths[s];

      // 1. Internal Machined Bone Chassis
      const boneGeo = new THREE.BoxGeometry(sw * 0.85, sw * 0.8, sl * 0.92);
      const boneMesh = new THREE.Mesh(boneGeo, machineMat);
      boneMesh.name = `arm_${a}_seg_${s}_chassis`;
      boneMesh.position.set(0, 0, sl * 0.46);
      segJoint.add(boneMesh);

      // Transverse hinge barrel pin at joint
      const pinGeo = new THREE.CylinderGeometry(sw * 0.48, sw * 0.48, sw * 1.05, 10);
      const pinMesh = new THREE.Mesh(pinGeo, brassMat);
      pinMesh.name = `arm_${a}_seg_${s}_hinge_pin`;
      pinMesh.rotation.z = Math.PI * 0.5;
      segJoint.add(pinMesh);

      // 2. Curved Dorsal Armor Shell (Bone White)
      const shellShape = new THREE.Shape();
      shellShape.moveTo(-sw * 0.6, 0);
      shellShape.lineTo(-sw * 0.5, sw * 0.65);
      shellShape.lineTo(0, sw * 0.8);
      shellShape.lineTo(sw * 0.5, sw * 0.65);
      shellShape.lineTo(sw * 0.6, 0);
      shellShape.closePath();

      const shellGeo = new THREE.ExtrudeGeometry(shellShape, {
        depth: sl * 0.95,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.015,
        bevelThickness: 0.015
      });
      const dorsalShell = new THREE.Mesh(shellGeo, shellMat);
      dorsalShell.name = `arm_${a}_seg_${s}_shell`;
      dorsalShell.position.set(0, 0, sl * 0.05);
      segJoint.add(dorsalShell);

      // 3. Linear Hydraulic Ram (Cylinder + Chrome Rod + Gland Boot)
      const ramGroup = new THREE.Group();
      ramGroup.name = `arm_${a}_seg_${s}_ram`;
      ramGroup.position.set(0, sw * 0.65, sl * 0.2);
      const ramCyl = new THREE.Mesh(new THREE.CylinderGeometry(sw * 0.16, sw * 0.16, sl * 0.45, 8), machineMat);
      ramCyl.rotation.x = Math.PI * 0.5;
      const ramRod = new THREE.Mesh(new THREE.CylinderGeometry(sw * 0.09, sw * 0.09, sl * 0.4, 8), chromeMat);
      ramRod.rotation.x = Math.PI * 0.5;
      ramRod.position.z = sl * 0.25;
      ramGroup.add(ramCyl);
      ramGroup.add(ramRod);
      segJoint.add(ramGroup);

      // 4. Ventral Sucker Modules (2 per segment, machined brass/gunmetal irises)
      for (let k of [0.3, 0.75]) {
        const suckerGroup = new THREE.Group();
        suckerGroup.name = `arm_${a}_seg_${s}_sucker_${k > 0.5 ? '1' : '0'}`;
        suckerGroup.position.set(0, -sw * 0.45, sl * k);

        // Flange ring
        const ringM = new THREE.Mesh(new THREE.CylinderGeometry(sw * 0.38, sw * 0.42, 0.03, 12), machineMat);
        ringM.name = 'sucker_flange';
        suckerGroup.add(ringM);

        // Iris nozzle
        const irisM = new THREE.Mesh(new THREE.TorusGeometry(sw * 0.28, sw * 0.08, 8, 12), brassMat);
        irisM.name = 'sucker_iris';
        irisM.rotation.x = Math.PI * 0.5;
        suckerGroup.add(irisM);

        // Center valve probe
        const probeM = new THREE.Mesh(new THREE.SphereGeometry(sw * 0.12, 8, 6), machineMat);
        probeM.name = 'sucker_valve';
        probeM.position.y = -0.01;
        suckerGroup.add(probeM);

        segJoint.add(suckerGroup);
      }

      // 5. Flank Split Cable Conduit with Clamp Port
      const cablePts = [
        new THREE.Vector3(sw * 0.48, 0, 0),
        new THREE.Vector3(sw * 0.55, -sw * 0.15, sl * 0.5),
        new THREE.Vector3(sw * 0.48, 0, sl)
      ];
      const armCableGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePts), 8, sw * 0.08, 6, false);
      const armCableMesh = new THREE.Mesh(armCableGeo, cableMat);
      armCableMesh.name = `arm_${a}_seg_${s}_cable`;
      segJoint.add(armCableMesh);

      // Port clamp collar
      const clampMesh = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.12, sw * 0.18, 0.04), machineMat);
      clampMesh.name = `arm_${a}_seg_${s}_port_clamp`;
      clampMesh.position.set(sw * 0.52, -sw * 0.1, sl * 0.5);
      segJoint.add(clampMesh);

      // Tip effector on last segment
      if (s === 4) {
        const clawGeo = new THREE.ConeGeometry(sw * 0.4, sl * 0.6, 4);
        const clawMesh = new THREE.Mesh(clawGeo, machineMat);
        clawMesh.name = `arm_${a}_tip_claw`;
        clawMesh.rotation.x = Math.PI * 0.5;
        clawMesh.position.set(0, 0, sl * 1.15);
        segJoint.add(clawMesh);
      }

      parentNode = segJoint;
    }

    arms.push(armSegs);
  }

  // ── 4. KINEMATIC POSE SYSTEM (HANDLES ALL 25 SITUATIONS) ───────────────────
  object_userData_pose(root, chassis, crownTurret, mantle, siphon, beakUpper, beakLower, eyeAssemblies, arms);

  return root;
}

function object_userData_pose(root, chassis, crownTurret, mantle, siphon, beakUpper, beakLower, eyeAssemblies, arms) {
  root.userData.pose = (s) => {
    const speed = s.speed !== undefined ? s.speed : 0;
    const stride = s.stride !== undefined ? s.stride : 0;
    const turn = s.turn !== undefined ? s.turn : 0;
    const grounded = s.grounded !== undefined ? s.grounded : true;
    const health = s.health !== undefined ? s.health : 1.0;
    const action = s.action || null;
    const phase = s.phase !== undefined ? s.phase : 0;
    const t = s.t !== undefined ? s.t : 0;

    // Reset Base Transforms
    chassis.position.set(0, 0.9, 0);
    chassis.rotation.set(0, 0, 0);
    mantle.position.set(0, 0.25, -0.2);
    mantle.rotation.set(-0.25, 0, 0);
    mantle.scale.set(1, 1, 1);
    siphon.rotation.set(0, 0, 0);
    beakUpper.rotation.set(0, 0, 0);
    beakLower.rotation.set(0, 0, 0);
    eyeAssemblies.L.rotation.set(0, -0.45, 0);
    eyeAssemblies.R.rotation.set(0, 0.45, 0);

    // Idle breathing & scanning rhythms
    const breath = Math.sin(t * 2.2);
    const breathSlow = Math.sin(t * 1.1);
    mantle.scale.set(1.0 + breath * 0.035, 1.0 + breath * 0.035, 1.0 + breath * 0.025);
    siphon.rotation.x = breathSlow * 0.08;
    siphon.rotation.y = Math.sin(t * 0.8) * 0.12;

    eyeAssemblies.L.rotation.y = -0.45 + Math.sin(t * 1.5) * 0.08;
    eyeAssemblies.L.rotation.x = Math.cos(t * 1.2) * 0.06;
    eyeAssemblies.R.rotation.y = 0.45 + Math.sin(t * 1.5 + 0.4) * 0.08;
    eyeAssemblies.R.rotation.x = Math.cos(t * 1.2 + 0.4) * 0.06;

    // Default rest arm pose curves (8 arms arching down to touch the ground)
    const armJointPitch = [
      [-0.45, 0.65, 0.45, -0.35, -0.2], // 0 Front-L
      [-0.45, 0.65, 0.45, -0.35, -0.2], // 1 Front-R
      [-0.35, 0.60, 0.50, -0.40, -0.2], // 2 Mid-FL
      [-0.35, 0.60, 0.50, -0.40, -0.2], // 3 Mid-FR
      [-0.30, 0.55, 0.55, -0.45, -0.2], // 4 Mid-RL
      [-0.30, 0.55, 0.55, -0.45, -0.2], // 5 Mid-RR
      [-0.25, 0.50, 0.60, -0.50, -0.2], // 6 Rear-L
      [-0.25, 0.50, 0.60, -0.50, -0.2]  // 7 Rear-R
    ];

    const armJointYaw = [
      [0.05, 0.04, 0.02, -0.05, -0.08],
      [-0.05, -0.04, -0.02, 0.05, 0.08],
      [0.08, 0.05, 0.02, -0.04, -0.06],
      [-0.08, -0.05, -0.02, 0.04, 0.06],
      [0.05, 0.03, 0.0, -0.03, -0.05],
      [-0.05, -0.03, 0.0, 0.03, 0.05],
      [0.03, 0.02, 0.0, -0.02, -0.03],
      [-0.03, -0.02, 0.0, 0.02, 0.03]
    ];

    // ── GAIT COMPUTATION ───────────────────────────────────────────────────
    if (!action) {
      if (grounded) {
        // Octopedal crawling / walking locomotion
        const speedNorm = Math.min(speed / 6.0, 1.0);
        const crawlH = 0.9 - Math.min(speed * 0.04, 0.22);
        chassis.position.y = crawlH + Math.sin(stride * Math.PI * 4.0) * (0.02 + speed * 0.008);
        chassis.position.z = Math.sin(stride * Math.PI * 2.0) * (0.02 + speed * 0.015);

        // Stance changes across speed samples: 0.5 (stalk), 1.0 (walk), 2.0 (jog), 3.0 (run), 6.0 (sprint)
        const forwardPitch = Math.min(speed * 0.06, 0.35);
        chassis.rotation.x = forwardPitch;

        // Apply locomotion offsets to 8 arms
        for (let a = 0; a < 8; a++) {
          // Staggered gait phases across arms
          const armPhaseOffset = (a % 2 === 0 ? 0 : 0.5) + (Math.floor(a / 2) * 0.25);
          const armCycle = (stride + armPhaseOffset) % 1.0;
          const cycleRad = armCycle * Math.PI * 2.0;

          // Lift vs push stroke
          const isLift = armCycle < 0.45;
          const liftPhase = isLift ? (armCycle / 0.45) : 0;
          const liftAmount = isLift ? Math.sin(liftPhase * Math.PI) : 0;

          const reachZ = Math.sin(cycleRad) * (0.15 + speed * 0.08);
          const reachY = liftAmount * (0.18 + speed * 0.05);

          for (let sIdx = 0; sIdx < 5; sIdx++) {
            let p = armJointPitch[a][sIdx];
            let y = armJointYaw[a][sIdx];
            let r = 0;

            if (sIdx === 0) {
              p += (isLift ? -0.35 : 0.25) * speedNorm;
              y += Math.cos(cycleRad) * 0.2 * speedNorm * (a % 2 === 0 ? 1 : -1);
            } else if (sIdx === 1) {
              p += (isLift ? 0.45 : -0.2) * speedNorm;
            } else if (sIdx === 2) {
              p += (isLift ? 0.3 : 0.1) * speedNorm;
            } else if (sIdx >= 3) {
              p += Math.sin(cycleRad) * 0.25 * speedNorm;
            }

            // High speed extension (speed -> 6)
            if (speed > 3.0) {
              const sprintFactor = (speed - 3.0) / 3.0;
              p *= (1.0 - sprintFactor * 0.45);
              if (a === 0 || a === 1) { // Front arms reach flat forward
                p -= 0.35 * sprintFactor;
              } else if (a >= 6) { // Rear arms trail back
                p += 0.45 * sprintFactor;
              }
            }

            // Idle coil when speed == 0
            if (speed < 0.1) {
              const coil = Math.sin(t * 1.8 + a * 0.8 + sIdx * 0.6) * 0.06;
              p += coil;
              y += Math.cos(t * 1.4 + a * 0.8) * 0.04;
            }

            arms[a][sIdx].rotation.set(p, y, r);
          }
        }
      } else {
        // ── AIRBORNE / JET SWIMMING OVERLAY ────────────────────────────────
        chassis.position.y = 1.1 + Math.sin(t * 2.0) * 0.08;
        chassis.rotation.x = -0.45; // Hydrodynamic tilt
        mantle.scale.set(1.15, 1.15, 1.25); // Pressurized mantle
        siphon.rotation.x = 0.55; // Siphon thrusting backwards

        // Arms streamline into a trailing hydrodynamic bundle
        for (let a = 0; a < 8; a++) {
          const swimWave = Math.sin(t * 3.5 + a * 0.4);
          for (let sIdx = 0; sIdx < 5; sIdx++) {
            const p = -0.15 + sIdx * 0.08 + swimWave * 0.06;
            const y = (a < 4 ? 0.08 : -0.08) * sIdx;
            arms[a][sIdx].rotation.set(p, y, 0);
          }
        }
      }

      // ── TURN OVERLAYS (-1 to +1) ──────────────────────────────────────────
      if (Math.abs(turn) > 0.01) {
        chassis.rotation.z = -turn * 0.22; // Bank into turn
        crownTurret.rotation.y = turn * 0.35;
        siphon.rotation.y = -turn * 0.45; // Counter-thrust torque

        for (let a = 0; a < 8; a++) {
          const isInside = (turn < 0 && a % 2 === 0) || (turn > 0 && a % 2 !== 0);
          const mult = isInside ? 0.6 : 1.4;
          arms[a][0].rotation.y += turn * 0.25;
          arms[a][1].rotation.x *= mult;
        }
      }

      // ── HURT OVERLAY (health <= 0.2) ─────────────────────────────────────
      if (health < 0.5) {
        const hurtSev = (0.5 - health) / 0.5;
        chassis.position.y -= hurtSev * 0.25;
        chassis.rotation.z += hurtSev * 0.2;
        mantle.rotation.z += hurtSev * 0.25;
        siphon.rotation.x -= hurtSev * 0.3;

        // Limp dragging arms on one side (Arm 1 & 3)
        for (let sIdx = 0; sIdx < 5; sIdx++) {
          arms[1][sIdx].rotation.set(0.6 * hurtSev, 0.2 * hurtSev, 0.3 * hurtSev);
          arms[3][sIdx].rotation.set(0.5 * hurtSev, -0.1 * hurtSev, 0.2 * hurtSev);
        }
      }
    } else {
      // ── ACTIONS ──────────────────────────────────────────────────────────
      if (action === 'attack') {
        // Strike with front arms & beak snap
        if (phase < 0.3) {
          // Windup: mantle draws back, front arms coil tight
          const p = phase / 0.3;
          chassis.position.z = -0.2 * p;
          chassis.position.y = 0.9 + 0.15 * p;
          beakUpper.rotation.x = -0.4 * p;
          beakLower.rotation.x = 0.4 * p;
          for (let sIdx = 0; sIdx < 5; sIdx++) {
            arms[0][sIdx].rotation.set(0.6 * p, 0.2 * p, 0);
            arms[1][sIdx].rotation.set(0.6 * p, -0.2 * p, 0);
          }
        } else if (phase < 0.6) {
          // Commit: explosive forward thrust, beaks snap
          const p = (phase - 0.3) / 0.3;
          chassis.position.z = -0.2 + 0.65 * p;
          chassis.position.y = 1.05 - 0.3 * p;
          beakUpper.rotation.x = -0.4 + 0.7 * p;
          beakLower.rotation.x = 0.4 - 0.7 * p;
          for (let sIdx = 0; sIdx < 5; sIdx++) {
            arms[0][sIdx].rotation.set(-0.35 * (1 - p) - 0.1, -0.1 * p, 0);
            arms[1][sIdx].rotation.set(-0.35 * (1 - p) - 0.1, 0.1 * p, 0);
          }
        } else {
          // Recover
          const p = (phase - 0.6) / 0.4;
          chassis.position.z = 0.45 * (1 - p);
          chassis.position.y = 0.75 + 0.15 * p;
        }
      } else if (action === 'fire') {
        // High pressure siphon jet blast
        if (phase < 0.35) {
          // Aim & steady
          const p = phase / 0.35;
          siphon.rotation.x = -0.4 * p;
          mantle.scale.set(1 + 0.2 * p, 1 + 0.2 * p, 1 + 0.15 * p);
        } else if (phase < 0.55) {
          // Release & Recoil
          const p = (phase - 0.35) / 0.2;
          chassis.position.z = -0.35 * Math.sin(p * Math.PI);
          mantle.scale.set(1.2 - 0.4 * p, 1.2 - 0.4 * p, 1.15 - 0.3 * p);
        } else {
          // Recovery
          const p = (phase - 0.55) / 0.45;
          siphon.rotation.x = -0.4 * (1 - p);
        }
      } else if (action === 'hit') {
        // Sharp impact flinch & recovery
        const flinch = Math.sin(phase * Math.PI);
        chassis.position.z = -0.4 * flinch;
        chassis.position.y = 0.9 + 0.2 * flinch;
        chassis.rotation.x = -0.35 * flinch;
        for (let a = 0; a < 8; a++) {
          arms[a][0].rotation.x = -0.6 * flinch;
          arms[a][1].rotation.x = 0.8 * flinch;
        }
      } else if (action === 'block') {
        // Armored Phalanx: Front arms coil into an interlocking dome shield
        const p = Math.sin(phase * Math.PI);
        chassis.position.y = 0.65 - 0.15 * p;
        chassis.position.z = -0.1 * p;
        for (let a = 0; a < 4; a++) {
          for (let sIdx = 0; sIdx < 5; sIdx++) {
            arms[a][sIdx].rotation.set(-0.25 * p, (a % 2 === 0 ? 0.4 : -0.4) * p, 0.2 * p);
          }
        }
      } else if (action === 'gather') {
        // Reach down, grasp with front tentacles, draw to beak
        const p = Math.sin(phase * Math.PI);
        chassis.position.y = 0.9 - 0.35 * p;
        chassis.rotation.x = 0.35 * p;
        arms[0][0].rotation.set(0.6 * p, 0.2 * p, 0);
        arms[0][1].rotation.set(0.8 * p, 0, 0);
        arms[0][2].rotation.set(-0.6 * p, 0, 0);
        arms[1][0].rotation.set(0.6 * p, -0.2 * p, 0);
        arms[1][1].rotation.set(0.8 * p, 0, 0);
        arms[1][2].rotation.set(-0.6 * p, 0, 0);
      } else if (action === 'deposit') {
        // Reverse of gather, careful placement
        const p = Math.sin(phase * Math.PI);
        chassis.position.y = 0.9 - 0.25 * p;
        chassis.rotation.x = 0.25 * p;
        arms[0][0].rotation.set(0.4 * p, 0.1 * p, 0);
        arms[1][0].rotation.set(0.4 * p, -0.1 * p, 0);
      } else if (action === 'eat') {
        // Head down, beak cycling 3 times
        const chew = Math.sin(phase * Math.PI * 6.0);
        chassis.position.y = 0.72;
        chassis.rotation.x = 0.25;
        beakUpper.rotation.x = -0.35 * Math.max(chew, 0);
        beakLower.rotation.x = 0.35 * Math.max(chew, 0);
        arms[0][0].rotation.set(0.4, 0.3, 0);
        arms[1][0].rotation.set(0.4, -0.3, 0);
      } else if (action === 'drink') {
        // Siphon low to ground, slow steady intake
        chassis.position.y = 0.65;
        siphon.rotation.x = -0.6;
        const gulp = Math.sin(phase * Math.PI * 4.0);
        mantle.scale.set(1 + gulp * 0.08, 1 + gulp * 0.08, 1 + gulp * 0.05);
      } else if (action === 'jump') {
        if (phase < 0.35) {
          // Crouch & load
          const p = phase / 0.35;
          chassis.position.y = 0.9 - 0.45 * p;
          for (let a = 0; a < 8; a++) {
            arms[a][0].rotation.x = -0.3 * p;
            arms[a][1].rotation.x = 0.9 * p;
          }
        } else {
          // Thrust upward
          const p = (phase - 0.35) / 0.65;
          chassis.position.y = 0.45 + 1.2 * p;
          for (let a = 0; a < 8; a++) {
            arms[a][0].rotation.x = 0.8 * p;
            arms[a][1].rotation.x = -0.4 * p;
          }
        }
      } else if (action === 'land') {
        // Compression shock absorber
        const p = Math.sin(phase * Math.PI);
        chassis.position.y = 0.9 - 0.5 * p;
        for (let a = 0; a < 8; a++) {
          arms[a][0].rotation.x = -0.4 * p;
          arms[a][1].rotation.x = 0.95 * p;
        }
      } else if (action === 'signal') {
        // Threat display: Crown rises high, all 8 arms spread in massive radial halo
        const p = Math.sin(phase * Math.PI);
        chassis.position.y = 0.9 + 0.5 * p;
        mantle.scale.set(1 + 0.25 * p, 1 + 0.25 * p, 1 + 0.25 * p);
        for (let a = 0; a < 8; a++) {
          arms[a][0].rotation.set(-0.8 * p, 0, 0);
          arms[a][1].rotation.set(-0.4 * p, 0, 0);
          arms[a][2].rotation.set(0.6 * p, 0, 0);
        }
      } else if (action === 'sleep') {
        // Fold neatly onto ground into inert coiled shell
        const p = phase;
        chassis.position.y = 0.9 - 0.55 * p;
        mantle.rotation.x = -0.25 + 0.4 * p;
        for (let a = 0; a < 8; a++) {
          arms[a][0].rotation.set(-0.2 * p, 0.4 * p * (a % 2 === 0 ? 1 : -1), 0);
          arms[a][1].rotation.set(0.8 * p, 0.3 * p, 0);
          arms[a][2].rotation.set(0.6 * p, 0.2 * p, 0);
        }
      } else if (action === 'wake') {
        // Unfold from sleep back to standing
        const p = 1.0 - phase;
        chassis.position.y = 0.9 - 0.55 * p;
        mantle.rotation.x = -0.25 + 0.4 * p;
        for (let a = 0; a < 8; a++) {
          arms[a][0].rotation.set(-0.2 * p, 0.4 * p * (a % 2 === 0 ? 1 : -1), 0);
          arms[a][1].rotation.set(0.8 * p, 0.3 * p, 0);
          arms[a][2].rotation.set(0.6 * p, 0.2 * p, 0);
        }
      } else if (action === 'die') {
        // Collapse: hydraulic depressurization, limp sprawl
        const p = phase;
        chassis.position.y = 0.9 - 0.65 * p;
        chassis.rotation.z = 0.35 * p;
        chassis.rotation.x = 0.25 * p;
        mantle.rotation.x = -0.25 - 0.3 * p;
        beakUpper.rotation.x = -0.3 * p;
        beakLower.rotation.x = 0.4 * p;
        siphon.rotation.x = -0.5 * p;
        for (let a = 0; a < 8; a++) {
          arms[a][0].rotation.set(0.5 * p, (a * 0.1) * p, 0.2 * p);
          arms[a][1].rotation.set(0.3 * p, 0, -0.3 * p);
          arms[a][2].rotation.set(0.2 * p, 0, 0);
        }
      } else if (action === 'evolve') {
        // Overcharge state: mantle plates unclamp and flare outward
        const p = Math.sin(phase * Math.PI);
        chassis.position.y = 0.9 + 0.2 * p;
        mantle.scale.set(1 + 0.3 * p, 1 + 0.3 * p, 1 + 0.3 * p);
        crownTurret.position.y = 0.1 * p;
        for (let a = 0; a < 8; a++) {
          arms[a][0].rotation.set(-0.3 * p, (a % 2 === 0 ? 0.3 : -0.3) * p, 0);
        }
      }
    }
  };
}
```