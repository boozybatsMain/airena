function build(THREE, TSL) {
  const root = new THREE.Group();
  root.name = 'grozny_armyan';

  // =========================================================================
  // 1. PALETTE & MATERIALS (Strict House Style)
  // ~50% Chalky Bone-White Shells (#D8D2C6, #C9C2B4, #B5AC9C)
  // ~40% Dark Machine Frame & Structural Steel (#3E3A34, #55524C, #6B665E, #24221F)
  // ~5-8% Restrained Accent plates & Bronze Hardware (#A8231C, #C2521E, #B88532, #D4AF37)
  // =========================================================================
  const matShellWhite = new THREE.MeshStandardMaterial({
    color: 0xd8d2c6,
    roughness: 0.38,
    metalness: 0.15
  });

  const matShellCream = new THREE.MeshStandardMaterial({
    color: 0xc9c2b4,
    roughness: 0.44,
    metalness: 0.12
  });

  const matShellTan = new THREE.MeshStandardMaterial({
    color: 0xb5ac9c,
    roughness: 0.50,
    metalness: 0.12
  });

  const matFrameDark = new THREE.MeshStandardMaterial({
    color: 0x3e3a34,
    roughness: 0.65,
    metalness: 0.75
  });

  const matFrameMedium = new THREE.MeshStandardMaterial({
    color: 0x55524c,
    roughness: 0.55,
    metalness: 0.70
  });

  const matFrameSteel = new THREE.MeshStandardMaterial({
    color: 0x6b665e,
    roughness: 0.35,
    metalness: 0.85
  });

  const matFrameDeep = new THREE.MeshStandardMaterial({
    color: 0x24221f,
    roughness: 0.72,
    metalness: 0.60
  });

  // Restrained Accent Materials (Handful of plates / trims only)
  const matAccentGarnet = new THREE.MeshStandardMaterial({
    color: 0xa8231c,
    roughness: 0.35,
    metalness: 0.30
  });

  const matAccentTerracotta = new THREE.MeshStandardMaterial({
    color: 0xc2521e,
    roughness: 0.42,
    metalness: 0.25
  });

  const matBronze = new THREE.MeshStandardMaterial({
    color: 0xb88532,
    roughness: 0.30,
    metalness: 0.88
  });

  const matGoldTrim = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.25,
    metalness: 0.92
  });

  const matOpticsRed = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0xdd1111,
    roughness: 0.20,
    metalness: 0.10
  });

  const matHoseBlack = new THREE.MeshStandardMaterial({
    color: 0x1c1a19,
    roughness: 0.70,
    metalness: 0.25
  });

  const matHoseCopper = new THREE.MeshStandardMaterial({
    color: 0x8a4b28,
    roughness: 0.38,
    metalness: 0.82
  });

  const matBladeSteel = new THREE.MeshStandardMaterial({
    color: 0x9ea4ae,
    roughness: 0.20,
    metalness: 0.95
  });

  // =========================================================================
  // 2. HARDWARE HELPERS & MACHINED EXTRUDED PLATE GENERATOR
  // Flat machined faces with bevelEnabled ExtrudeGeometry (~70% of surfaces)
  // =========================================================================
  function makePlateGeo(pts2D, depth, bevel = 0.012, bevelSegments = 2) {
    const shape = new THREE.Shape();
    shape.moveTo(pts2D[0][0], pts2D[0][1]);
    for (let i = 1; i < pts2D.length; i++) {
      shape.lineTo(pts2D[i][0], pts2D[i][1]);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: depth,
      bevelEnabled: true,
      bevelSegments: bevelSegments,
      bevelThickness: bevel,
      bevelSize: bevel
    });
  }

  // Hardware Primitives
  const boltHexGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.014, 6);
  const boltRoundGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.012, 8);
  const clampBaseGeo = new THREE.BoxGeometry(0.034, 0.024, 0.018);
  const flangeRingGeo = new THREE.TorusGeometry(0.026, 0.006, 6, 12);

  function addBolt(parent, x, y, z, rx = 0, ry = 0, rz = 0, name = 'bolt') {
    const b = new THREE.Mesh(boltHexGeo, matBronze);
    b.name = name;
    b.position.set(x, y, z);
    b.rotation.set(rx, ry, rz);
    parent.add(b);
    return b;
  }

  function addBoltRow(parent, count, start, end, namePrefix) {
    for (let i = 0; i < count; i++) {
      const u = count > 1 ? i / (count - 1) : 0.5;
      const x = start[0] + (end[0] - start[0]) * u;
      const y = start[1] + (end[1] - start[1]) * u;
      const z = start[2] + (end[2] - start[2]) * u;
      addBolt(parent, x, y, z, 0, 0, 0, `${namePrefix}_bolt_${i}`);
    }
  }

  function addClampBracket(parent, pos, rot, name = 'cable_clamp') {
    const c = new THREE.Group();
    c.name = name;
    c.position.set(pos[0], pos[1], pos[2]);
    c.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(c);

    const base = new THREE.Mesh(clampBaseGeo, matFrameDark);
    base.name = `${name}_base`;
    c.add(base);

    const pin = new THREE.Mesh(boltRoundGeo, matBronze);
    pin.name = `${name}_pin`;
    pin.position.set(0, 0, 0.01);
    pin.rotation.x = Math.PI * 0.5;
    c.add(pin);

    const ring = new THREE.Mesh(flangeRingGeo, matBronze);
    ring.name = `${name}_ring`;
    ring.position.set(0, 0, 0.016);
    c.add(ring);
    return c;
  }

  function addVent(parent, pos, width, height, slatCount, namePrefix) {
    const ventBox = new THREE.Group();
    ventBox.name = `${namePrefix}_vent`;
    ventBox.position.set(pos[0], pos[1], pos[2]);
    parent.add(ventBox);

    const frameMesh = new THREE.Mesh(
      makePlateGeo([
        [-width * 0.5 - 0.015, height * 0.5 + 0.015],
        [width * 0.5 + 0.015, height * 0.5 + 0.015],
        [width * 0.5 + 0.015, -height * 0.5 - 0.015],
        [-width * 0.5 - 0.015, -height * 0.5 - 0.015]
      ], 0.012, 0.004),
      matFrameDark
    );
    frameMesh.name = `${namePrefix}_frame`;
    ventBox.add(frameMesh);

    const slatH = height / slatCount;
    for (let i = 0; i < slatCount; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(width - 0.01, slatH * 0.65, 0.014),
        matFrameSteel
      );
      slat.name = `${namePrefix}_slat_${i}`;
      slat.position.set(0, -height * 0.5 + (i + 0.5) * slatH, 0.008);
      slat.rotation.x = 0.35;
      ventBox.add(slat);
    }
  }

  // =========================================================================
  // 3. BODY HIERARCHY & MACHINED HARD-SURFACE ASSEMBLIES
  // =========================================================================

  // --- Pelvis Joint ---
  const pelvis = new THREE.Group();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, 1.02, 0);
  root.add(pelvis);

  // Pelvis Machined Chassis (Dark Machine Frame)
  const pelvisChassisGeo = makePlateGeo([
    [-0.18, 0.09],
    [0.18, 0.09],
    [0.15, -0.09],
    [-0.15, -0.09]
  ], 0.24, 0.015);
  const pelvisChassis = new THREE.Mesh(pelvisChassisGeo, matFrameDark);
  pelvisChassis.name = 'pelvis_chassis';
  pelvisChassis.position.set(0, 0, -0.12);
  pelvis.add(pelvisChassis);

  // Pelvis Front Armor Plate (Bone-White Shell with Hex Pattern)
  const pelvisPlateFGeo = makePlateGeo([
    [-0.15, 0.09],
    [0.15, 0.09],
    [0.10, -0.09],
    [-0.10, -0.09]
  ], 0.045, 0.014);
  const pelvisArmorF = new THREE.Mesh(pelvisPlateFGeo, matShellWhite);
  pelvisArmorF.name = 'pelvis_armor_f';
  pelvisArmorF.position.set(0, 0, 0.125);
  pelvis.add(pelvisArmorF);

  // Pelvis Rear Guard Plate (Cream Shell)
  const pelvisArmorB = new THREE.Mesh(
    makePlateGeo([
      [-0.16, 0.08],
      [0.16, 0.08],
      [0.13, -0.08],
      [-0.13, -0.08]
    ], 0.035, 0.012),
    matShellCream
  );
  pelvisArmorB.name = 'pelvis_armor_b';
  pelvisArmorB.position.set(0, 0, -0.16);
  pelvis.add(pelvisArmorB);

  // Pelvis Hardware & Edge Bolts
  addBoltRow(pelvis, 5, [-0.14, 0.08, 0.175], [0.14, 0.08, 0.175], 'pelvis_top');
  addBoltRow(pelvis, 4, [-0.09, -0.07, 0.175], [0.09, -0.07, 0.175], 'pelvis_bot');
  addBoltRow(pelvis, 3, [-0.14, 0.0, 0.175], [-0.10, -0.07, 0.175], 'pelvis_flank_l');
  addBoltRow(pelvis, 3, [0.14, 0.0, 0.175], [0.10, -0.07, 0.175], 'pelvis_flank_r');
  addClampBracket(pelvis, [-0.17, 0, 0.13], [0, 0, 0], 'pelvis_clamp_l');
  addClampBracket(pelvis, [0.17, 0, 0.13], [0, 0, 0], 'pelvis_clamp_r');

  // --- Torso / Waist Joint ---
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.set(0, 0.14, 0);
  pelvis.add(torso);

  // Waist Frame (Machined Dark Core)
  const waistCoreGeo = makePlateGeo([
    [-0.15, 0.09],
    [0.15, 0.09],
    [0.13, -0.09],
    [-0.13, -0.09]
  ], 0.22, 0.014);
  const waistCore = new THREE.Mesh(waistCoreGeo, matFrameMedium);
  waistCore.name = 'waist_core';
  waistCore.position.set(0, 0, -0.11);
  torso.add(waistCore);

  const waistActuatorR = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.18, 12),
    matFrameSteel
  );
  waistActuatorR.name = 'waist_actuator_r';
  waistActuatorR.position.set(0.12, 0, 0);
  torso.add(waistActuatorR);

  const waistActuatorL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.18, 12),
    matFrameSteel
  );
  waistActuatorL.name = 'waist_actuator_l';
  waistActuatorL.position.set(-0.12, 0, 0);
  torso.add(waistActuatorL);

  // Kamar War Belt (Machined Plates with Bronze Buckle)
  const kamarBelt = new THREE.Group();
  kamarBelt.name = 'kamar_belt';
  kamarBelt.position.set(0, 0.01, 0);
  torso.add(kamarBelt);

  const beltPlateFrontGeo = makePlateGeo([
    [-0.17, 0.045],
    [0.17, 0.045],
    [0.16, -0.045],
    [-0.16, -0.045]
  ], 0.038, 0.008);
  const beltPlateFront = new THREE.Mesh(beltPlateFrontGeo, matFrameDark);
  beltPlateFront.name = 'belt_plate_front';
  beltPlateFront.position.set(0, 0, 0.12);
  kamarBelt.add(beltPlateFront);

  const beltBuckle = new THREE.Mesh(
    makePlateGeo([
      [-0.055, 0.045],
      [0.055, 0.045],
      [0.04, -0.045],
      [-0.04, -0.045]
    ], 0.022, 0.008),
    matBronze
  );
  beltBuckle.name = 'belt_buckle';
  beltBuckle.position.set(0, 0, 0.16);
  kamarBelt.add(beltBuckle);

  const buckleGem = new THREE.Mesh(
    new THREE.BoxGeometry(0.025, 0.025, 0.015),
    matOpticsRed
  );
  buckleGem.name = 'buckle_gem';
  buckleGem.position.set(0, 0, 0.185);
  kamarBelt.add(buckleGem);

  for (let b = -2; b <= 2; b++) {
    if (b === 0) continue;
    const stud = new THREE.Mesh(
      makePlateGeo([
        [-0.016, 0.032],
        [0.016, 0.032],
        [0.014, -0.032],
        [-0.014, -0.032]
      ], 0.016, 0.005),
      matGoldTrim
    );
    stud.name = `belt_stud_${b}`;
    stud.position.set(b * 0.075, 0, 0.155);
    kamarBelt.add(stud);
  }

  // Kindjal (Armenian War Dagger - Machined Scabbard & Hilt)
  const dagger = new THREE.Group();
  dagger.name = 'dagger';
  dagger.position.set(-0.08, -0.02, 0.18);
  dagger.rotation.set(0, 0, -0.72);
  torso.add(dagger);

  const daggerScabbardGeo = makePlateGeo([
    [-0.028, 0.16],
    [0.028, 0.16],
    [0.015, -0.18],
    [-0.015, -0.18]
  ], 0.025, 0.006);
  const daggerScabbard = new THREE.Mesh(daggerScabbardGeo, matFrameDark);
  daggerScabbard.name = 'dagger_scabbard';
  dagger.add(daggerScabbard);

  const daggerChape = new THREE.Mesh(
    new THREE.ConeGeometry(0.02, 0.08, 4),
    matBronze
  );
  daggerChape.name = 'dagger_chape';
  daggerChape.position.set(0, -0.21, 0.012);
  daggerChape.rotation.y = Math.PI * 0.25;
  dagger.add(daggerChape);

  const daggerHilt = new THREE.Mesh(
    makePlateGeo([
      [-0.016, 0.06],
      [0.016, 0.06],
      [0.014, -0.06],
      [-0.014, -0.06]
    ], 0.02, 0.005),
    matShellTan
  );
  daggerHilt.name = 'dagger_hilt';
  daggerHilt.position.set(0, 0.21, 0.002);
  dagger.add(daggerHilt);

  const daggerPommel = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 8, 8),
    matBronze
  );
  daggerPommel.name = 'dagger_pommel';
  daggerPommel.position.set(0, 0.27, 0.012);
  dagger.add(daggerPommel);

  addBolt(dagger, 0, 0.08, 0.035, 0, 0, 0, 'dagger_bolt_top');
  addBolt(dagger, 0, -0.08, 0.035, 0, 0, 0, 'dagger_bolt_bot');

  // --- Armored Skirt / Chokha Faulds (Extruded Bone-White Shells) ---
  const skirt_f = new THREE.Group();
  skirt_f.name = 'skirt_f';
  skirt_f.position.set(0, -0.04, 0.14);
  torso.add(skirt_f);

  const skirtFPlateGeo = makePlateGeo([
    [-0.19, 0],
    [0.19, 0],
    [0.15, -0.36],
    [-0.15, -0.36]
  ], 0.028, 0.010);
  const skirtFMesh = new THREE.Mesh(skirtFPlateGeo, matShellWhite);
  skirtFMesh.name = 'skirt_f_mesh';
  skirt_f.add(skirtFMesh);

  // Small Restrained Accent plate on front fauld
  const skirtFAccentGeo = makePlateGeo([
    [-0.11, -0.12],
    [0.11, -0.12],
    [0.08, -0.22],
    [-0.08, -0.22]
  ], 0.015, 0.005);
  const skirtFAccent = new THREE.Mesh(skirtFAccentGeo, matAccentGarnet);
  skirtFAccent.name = 'skirt_f_accent';
  skirtFAccent.position.set(0, 0, 0.03);
  skirt_f.add(skirtFAccent);

  addBoltRow(skirt_f, 5, [-0.17, -0.03, 0.04], [0.17, -0.03, 0.04], 'skirt_f_top');
  addBoltRow(skirt_f, 5, [-0.13, -0.34, 0.04], [0.13, -0.34, 0.04], 'skirt_f_bot');
  addBoltRow(skirt_f, 4, [-0.18, -0.06, 0.04], [-0.14, -0.32, 0.04], 'skirt_f_left');
  addBoltRow(skirt_f, 4, [0.18, -0.06, 0.04], [0.14, -0.32, 0.04], 'skirt_f_right');

  const skirt_b = new THREE.Group();
  skirt_b.name = 'skirt_b';
  skirt_b.position.set(0, -0.04, -0.14);
  torso.add(skirt_b);

  const skirtBMesh = new THREE.Mesh(
    makePlateGeo([
      [-0.19, 0],
      [0.19, 0],
      [0.15, -0.38],
      [-0.15, -0.38]
    ], 0.025, 0.008),
    matShellCream
  );
  skirtBMesh.name = 'skirt_b_mesh';
  skirtBMesh.rotation.y = Math.PI;
  skirt_b.add(skirtBMesh);

  const skirt_r = new THREE.Group();
  skirt_r.name = 'skirt_r';
  skirt_r.position.set(0.18, -0.04, 0);
  torso.add(skirt_r);

  const skirtRMesh = new THREE.Mesh(
    makePlateGeo([
      [-0.13, 0],
      [0.13, 0],
      [0.09, -0.34],
      [-0.09, -0.34]
    ], 0.025, 0.008),
    matShellWhite
  );
  skirtRMesh.name = 'skirt_r_mesh';
  skirtRMesh.rotation.y = Math.PI * 0.5;
  skirt_r.add(skirtRMesh);
  addBoltRow(skirt_r, 4, [0.035, -0.04, -0.10], [0.035, -0.04, 0.10], 'skirt_r_bolts');

  const skirt_l = new THREE.Group();
  skirt_l.name = 'skirt_l';
  skirt_l.position.set(-0.18, -0.04, 0);
  torso.add(skirt_l);

  const skirtLMesh = new THREE.Mesh(
    makePlateGeo([
      [-0.13, 0],
      [0.13, 0],
      [0.09, -0.34],
      [-0.09, -0.34]
    ], 0.025, 0.008),
    matShellWhite
  );
  skirtLMesh.name = 'skirt_l_mesh';
  skirtLMesh.rotation.y = -Math.PI * 0.5;
  skirt_l.add(skirtLMesh);
  addBoltRow(skirt_l, 4, [-0.035, -0.04, -0.10], [-0.035, -0.04, 0.10], 'skirt_l_bolts');

  // --- Chest Joint & Machined Cuirass Shell ---
  const chest = new THREE.Group();
  chest.name = 'chest';
  chest.position.set(0, 0.28, 0);
  torso.add(chest);

  // Chest Structural Chassis Frame (Dark Frame Core)
  const chestFrameGeo = makePlateGeo([
    [-0.23, 0.20],
    [0.23, 0.20],
    [0.21, -0.18],
    [-0.21, -0.18]
  ], 0.32, 0.016);
  const chestFrame = new THREE.Mesh(chestFrameGeo, matFrameDark);
  chestFrame.name = 'chest_frame';
  chestFrame.position.set(0, 0.16, -0.16);
  chest.add(chestFrame);

  // Cuirass Pectoral Shell Plates (Heavy Chamfered Bone-White Shells)
  const cuirassFrontGeo = makePlateGeo([
    [-0.25, 0.34],
    [0.25, 0.34],
    [0.22, 0.02],
    [0.0, -0.10],
    [-0.22, 0.02]
  ], 0.052, 0.016);
  const cuirassFront = new THREE.Mesh(cuirassFrontGeo, matShellWhite);
  cuirassFront.name = 'cuirass_front';
  cuirassFront.position.set(0, 0.02, 0.155);
  chest.add(cuirassFront);

  // Cuirass Lateral Flank Plates (Bone-White)
  const cuirassFlankRGeo = makePlateGeo([
    [-0.12, 0.16],
    [0.12, 0.16],
    [0.10, -0.16],
    [-0.10, -0.16]
  ], 0.035, 0.012);
  const cuirassFlankR = new THREE.Mesh(cuirassFlankRGeo, matShellCream);
  cuirassFlankR.name = 'cuirass_flank_r';
  cuirassFlankR.position.set(0.24, 0.18, 0.0);
  cuirassFlankR.rotation.y = Math.PI * 0.45;
  chest.add(cuirassFlankR);

  const cuirassFlankL = new THREE.Mesh(cuirassFlankRGeo, matShellCream);
  cuirassFlankL.name = 'cuirass_flank_l';
  cuirassFlankL.position.set(-0.24, 0.18, 0.0);
  cuirassFlankL.rotation.y = -Math.PI * 0.45;
  chest.add(cuirassFlankL);

  // Arevakhach (Armenian Solar Crest / Sun Wheel - Restrained Accent)
  const solarDisc = new THREE.Group();
  solarDisc.name = 'cuirass_solar_disc';
  solarDisc.position.set(0, 0.16, 0.215);
  chest.add(solarDisc);

  const solarBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.095, 0.025, 16),
    matBronze
  );
  solarBase.rotation.x = Math.PI * 0.5;
  solarBase.name = 'solar_base';
  solarDisc.add(solarBase);

  const solarWheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.015, 8, 16),
    matGoldTrim
  );
  solarWheel.name = 'solar_wheel';
  solarDisc.add(solarWheel);

  const solarCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 10, 10),
    matOpticsRed
  );
  solarCore.position.set(0, 0, 0.02);
  solarCore.name = 'solar_core';
  solarDisc.add(solarCore);

  for (let r = 0; r < 8; r++) {
    const ray = new THREE.Mesh(
      makePlateGeo([
        [-0.008, 0.02],
        [0.008, 0.02],
        [0.006, -0.02],
        [-0.006, -0.02]
      ], 0.012, 0.003),
      matGoldTrim
    );
    const ang = r * (Math.PI / 4);
    ray.position.set(Math.sin(ang) * 0.05, Math.cos(ang) * 0.05, 0.012);
    ray.rotation.z = -ang;
    ray.name = `solar_ray_${r}`;
    solarDisc.add(ray);
  }

  // Gazi / Mecha Cartridge Bandoliers
  const gazi_rack_r = new THREE.Group();
  gazi_rack_r.name = 'gazi_rack_r';
  gazi_rack_r.position.set(0.14, 0.22, 0.20);
  gazi_rack_r.rotation.z = -0.22;
  chest.add(gazi_rack_r);

  const gazi_rack_l = new THREE.Group();
  gazi_rack_l.name = 'gazi_rack_l';
  gazi_rack_l.position.set(-0.14, 0.22, 0.20);
  gazi_rack_l.rotation.z = 0.22;
  chest.add(gazi_rack_l);

  for (let g = 0; g < 4; g++) {
    const cellR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.09, 8),
      matShellCream
    );
    cellR.name = `gazi_cell_r_${g}`;
    cellR.position.set(g * 0.032, 0, 0);
    gazi_rack_r.add(cellR);

    const capR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.02, 8),
      matBronze
    );
    capR.position.set(g * 0.032, 0.045, 0);
    gazi_rack_r.add(capR);

    const cellL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.09, 8),
      matShellCream
    );
    cellL.name = `gazi_cell_l_${g}`;
    cellL.position.set(-g * 0.032, 0, 0);
    gazi_rack_l.add(cellL);

    const capL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.02, 8),
      matBronze
    );
    capL.position.set(-g * 0.032, 0.045, 0);
    gazi_rack_l.add(capL);
  }

  // Cuirass Edge Bolts & Hardware (Prominent on Outer Shells)
  addVent(chest, [0.18, 0.06, 0.19], 0.09, 0.08, 4, 'chest_vent_r');
  addVent(chest, [-0.18, 0.06, 0.19], 0.09, 0.08, 4, 'chest_vent_l');
  addBoltRow(chest, 8, [-0.24, 0.35, 0.215], [0.24, 0.35, 0.215], 'cuirass_top');
  addBoltRow(chest, 5, [-0.24, 0.04, 0.215], [-0.04, -0.08, 0.215], 'cuirass_diag_r');
  addBoltRow(chest, 5, [0.24, 0.04, 0.215], [0.04, -0.08, 0.215], 'cuirass_diag_l');
  addBoltRow(chest, 4, [-0.25, 0.32, 0.215], [-0.23, 0.06, 0.215], 'cuirass_edge_l');
  addBoltRow(chest, 4, [0.25, 0.32, 0.215], [0.23, 0.06, 0.215], 'cuirass_edge_r');

  // Gorget Collar (Dark Steel Ring with Machined Plates)
  const gorget = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.05, 8, 16),
    matFrameDeep
  );
  gorget.name = 'gorget_armor';
  gorget.position.set(0, 0.34, 0.02);
  gorget.rotation.x = Math.PI * 0.5;
  chest.add(gorget);

  // --- Articulated Segmented Mantle / Cape (Chalky Bone-White Plates) ---
  const cape = new THREE.Group();
  cape.name = 'cape';
  cape.position.set(0, 0.32, -0.17);
  chest.add(cape);

  const capeTopMesh = new THREE.Mesh(
    makePlateGeo([
      [-0.27, 0],
      [0.27, 0],
      [0.29, -0.36],
      [-0.29, -0.36]
    ], 0.025, 0.008),
    matShellTan
  );
  capeTopMesh.name = 'cape_plate_top';
  cape.add(capeTopMesh);
  addBoltRow(cape, 7, [-0.25, -0.04, 0.032], [0.25, -0.04, 0.032], 'cape_top_bolts');

  const cape_mid = new THREE.Group();
  cape_mid.name = 'cape_mid';
  cape_mid.position.set(0, -0.34, 0);
  cape.add(cape_mid);

  const capeMidMesh = new THREE.Mesh(
    makePlateGeo([
      [-0.29, 0],
      [0.29, 0],
      [0.32, -0.38],
      [-0.32, -0.38]
    ], 0.022, 0.007),
    matShellCream
  );
  capeMidMesh.name = 'cape_plate_mid';
  cape_mid.add(capeMidMesh);
  addBoltRow(cape_mid, 7, [-0.28, -0.04, 0.03], [0.28, -0.04, 0.03], 'cape_mid_bolts');

  const cape_lower = new THREE.Group();
  cape_lower.name = 'cape_lower';
  cape_lower.position.set(0, -0.36, 0);
  cape_mid.add(cape_lower);

  const capeLowMesh = new THREE.Mesh(
    makePlateGeo([
      [-0.32, 0],
      [0.32, 0],
      [0.35, -0.40],
      [-0.35, -0.40]
    ], 0.02, 0.006),
    matShellWhite
  );
  capeLowMesh.name = 'cape_plate_low';
  cape_lower.add(capeLowMesh);

  const capeAccentMesh = new THREE.Mesh(
    makePlateGeo([
      [-0.33, 0],
      [0.33, 0],
      [0.35, -0.04],
      [-0.35, -0.04]
    ], 0.025, 0.006),
    matAccentGarnet
  );
  capeAccentMesh.name = 'cape_accent_border';
  capeAccentMesh.position.set(0, -0.38, 0.01);
  cape_lower.add(capeAccentMesh);

  // --- Neck Joint ---
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.36, 0.02);
  chest.add(neck);

  const neckCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, 0.15, 12),
    matFrameSteel
  );
  neckCore.name = 'neck_core';
  neckCore.position.set(0, 0.06, 0);
  neck.add(neckCore);

  const neckPistonR = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8),
    matBronze
  );
  neckPistonR.name = 'neck_piston_r';
  neckPistonR.position.set(0.07, 0.06, 0.03);
  neck.add(neckPistonR);

  const neckPistonL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8),
    matBronze
  );
  neckPistonL.name = 'neck_piston_l';
  neckPistonL.position.set(-0.07, 0.06, 0.03);
  neck.add(neckPistonL);

  // --- Head Joint & Machined Cranium ---
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.12, 0.03);
  neck.add(head);

  // Cranium Chassis (Machined Dark Core)
  const headChassisGeo = makePlateGeo([
    [-0.10, 0.11],
    [0.10, 0.11],
    [0.08, -0.10],
    [-0.08, -0.10]
  ], 0.18, 0.012);
  const headChassis = new THREE.Mesh(headChassisGeo, matFrameDark);
  headChassis.name = 'head_chassis';
  headChassis.position.set(0, 0.08, -0.09);
  head.add(headChassis);

  // Face Shell Plates (Machined Bone-White Chamfered Plates)
  const facePlate = new THREE.Mesh(
    makePlateGeo([
      [-0.095, 0.10],
      [0.095, 0.10],
      [0.075, -0.08],
      [-0.075, -0.08]
    ], 0.045, 0.012),
    matShellWhite
  );
  facePlate.name = 'face_plate';
  facePlate.position.set(0, 0.06, 0.09);
  head.add(facePlate);

  addBoltRow(head, 4, [-0.08, 0.15, 0.14], [0.08, 0.15, 0.14], 'head_face_top');
  addBolt(head, -0.09, 0.06, 0.12, 0, 0, 0, 'head_bolt_l');
  addBolt(head, 0.09, 0.06, 0.12, 0, 0, 0, 'head_bolt_r');

  // Aquiline (Eagle Hooked) Nose Armor (Machined Bone-White)
  const noseGroup = new THREE.Group();
  noseGroup.name = 'nose_assembly';
  noseGroup.position.set(0, 0.07, 0.13);
  head.add(noseGroup);

  const noseBridge = new THREE.Mesh(
    makePlateGeo([
      [-0.022, 0.06],
      [0.022, 0.06],
      [0.025, 0.0],
      [-0.025, 0.0]
    ], 0.045, 0.008),
    matShellWhite
  );
  noseBridge.name = 'nose_bridge';
  noseBridge.position.set(0, 0, 0.02);
  noseBridge.rotation.x = -0.32;
  noseGroup.add(noseBridge);

  const noseHook = new THREE.Mesh(
    makePlateGeo([
      [-0.025, 0.0],
      [0.025, 0.0],
      [0.018, -0.06],
      [-0.018, -0.06]
    ], 0.05, 0.008),
    matShellWhite
  );
  noseHook.name = 'nose_hook';
  noseHook.position.set(0, -0.04, 0.045);
  noseHook.rotation.x = 0.42;
  noseGroup.add(noseHook);

  // Visor & Crimson Optical Sensors
  const visorFrame = new THREE.Mesh(
    makePlateGeo([
      [-0.085, 0.02],
      [0.085, 0.02],
      [0.08, -0.02],
      [-0.08, -0.02]
    ], 0.03, 0.006),
    matFrameDark
  );
  visorFrame.name = 'visor_frame';
  visorFrame.position.set(0, 0.10, 0.135);
  head.add(visorFrame);

  const eyeSensorR = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.018, 0.015),
    matOpticsRed
  );
  eyeSensorR.name = 'eye_sensor_r';
  eyeSensorR.position.set(0.048, 0.10, 0.155);
  eyeSensorR.rotation.z = -0.15;
  head.add(eyeSensorR);

  const eyeSensorL = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.018, 0.015),
    matOpticsRed
  );
  eyeSensorL.name = 'eye_sensor_l';
  eyeSensorL.position.set(-0.048, 0.10, 0.155);
  eyeSensorL.rotation.z = 0.15;
  head.add(eyeSensorL);

  // Brow Plates
  const browR = new THREE.Mesh(
    makePlateGeo([
      [-0.035, 0.015],
      [0.035, 0.015],
      [0.03, -0.015],
      [-0.03, -0.015]
    ], 0.03, 0.005),
    matBronze
  );
  browR.name = 'brow_armor_r';
  browR.position.set(0.052, 0.122, 0.145);
  browR.rotation.z = -0.22;
  head.add(browR);

  const browL = new THREE.Mesh(
    makePlateGeo([
      [-0.035, 0.015],
      [0.035, 0.015],
      [0.03, -0.015],
      [-0.03, -0.015]
    ], 0.03, 0.005),
    matBronze
  );
  browL.name = 'brow_armor_l';
  browL.position.set(-0.052, 0.122, 0.145);
  browL.rotation.z = 0.22;
  head.add(browL);

  // Mustache & Segmented Beard Plates (Machined Dark Steel)
  const mustache_r = new THREE.Mesh(
    makePlateGeo([
      [0, 0.02],
      [0.10, -0.02],
      [0.08, -0.05],
      [0, -0.02]
    ], 0.028, 0.006),
    matFrameDark
  );
  mustache_r.name = 'mustache_r';
  mustache_r.position.set(0.02, 0.01, 0.14);
  mustache_r.rotation.set(0.15, 0.2, -0.4);
  head.add(mustache_r);

  const mustache_l = new THREE.Mesh(
    makePlateGeo([
      [0, 0.02],
      [-0.10, -0.02],
      [-0.08, -0.05],
      [0, -0.02]
    ], 0.028, 0.006),
    matFrameDark
  );
  mustache_l.name = 'mustache_l';
  mustache_l.position.set(-0.02, 0.01, 0.14);
  mustache_l.rotation.set(0.15, -0.2, 0.4);
  head.add(mustache_l);

  const beard_center = new THREE.Mesh(
    makePlateGeo([
      [-0.075, 0.02],
      [0.075, 0.02],
      [0.04, -0.26],
      [-0.04, -0.26]
    ], 0.045, 0.012),
    matFrameDeep
  );
  beard_center.name = 'beard_center';
  beard_center.position.set(0, -0.02, 0.11);
  beard_center.rotation.x = 0.22;
  head.add(beard_center);

  for (let b = 0; b < 3; b++) {
    const ring = new THREE.Mesh(
      makePlateGeo([
        [-(0.045 - b * 0.008), 0.012],
        [(0.045 - b * 0.008), 0.012],
        [(0.04 - b * 0.008), -0.012],
        [-(0.04 - b * 0.008), -0.012]
      ], 0.045, 0.005),
      matBronze
    );
    ring.name = `beard_ring_${b}`;
    ring.position.set(0, -0.08 - b * 0.06, 0.13 - b * 0.01);
    head.add(ring);
  }

  // Kalashtar Armenian Conical Helmet (Machined Bone-White Shell)
  const helmetGroup = new THREE.Group();
  helmetGroup.name = 'kalashtar_helmet';
  helmetGroup.position.set(0, 0.16, 0);
  head.add(helmetGroup);

  const helmetRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.145, 0.04, 16),
    matBronze
  );
  helmetRim.name = 'helmet_rim';
  helmetRim.position.set(0, 0.01, 0);
  helmetGroup.add(helmetRim);

  const helmetCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.28, 16),
    matShellWhite
  );
  helmetCone.name = 'helmet_cone';
  helmetCone.position.set(0, 0.16, 0);
  helmetGroup.add(helmetCone);

  const helmetSpire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.025, 0.10, 8),
    matBronze
  );
  helmetSpire.name = 'helmet_spire';
  helmetSpire.position.set(0, 0.33, 0);
  helmetGroup.add(helmetSpire);

  const helmetGem = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 8),
    matOpticsRed
  );
  helmetGem.name = 'helmet_gem';
  helmetGem.position.set(0, 0.39, 0);
  helmetGroup.add(helmetGem);

  const nasalBar = new THREE.Mesh(
    makePlateGeo([
      [-0.012, 0.06],
      [0.012, 0.06],
      [0.01, -0.06],
      [-0.01, -0.06]
    ], 0.02, 0.005),
    matFrameSteel
  );
  nasalBar.name = 'nasal_bar';
  nasalBar.position.set(0, -0.02, 0.145);
  helmetGroup.add(nasalBar);

  for (let i = 0; i < 10; i++) {
    const ang = i * (Math.PI * 2 / 10);
    addBolt(
      helmetGroup,
      Math.sin(ang) * 0.142,
      0.01,
      Math.cos(ang) * 0.142,
      0, 0, 0,
      `helmet_flange_${i}`
    );
  }

  // --- Right Arm & Gurz Flanged Mace (+X) ---
  const shoulder_r = new THREE.Group();
  shoulder_r.name = 'shoulder_r';
  shoulder_r.position.set(0.34, 0.28, 0);
  chest.add(shoulder_r);

  // Right Pauldron (Layered Chamfered Bone-White Shells with Exposed Flanges)
  const pauldron_r = new THREE.Group();
  pauldron_r.name = 'pauldron_r';
  pauldron_r.position.set(0.04, 0.04, 0);
  shoulder_r.add(pauldron_r);

  const pauldronTopMeshR = new THREE.Mesh(
    makePlateGeo([
      [-0.15, 0.13],
      [0.15, 0.13],
      [0.19, -0.11],
      [-0.19, -0.11]
    ], 0.045, 0.015),
    matShellWhite
  );
  pauldronTopMeshR.name = 'pauldron_top_r';
  pauldronTopMeshR.rotation.set(0, 0, -0.45);
  pauldron_r.add(pauldronTopMeshR);

  const pauldronLowerMeshR = new THREE.Mesh(
    makePlateGeo([
      [-0.13, 0.08],
      [0.13, 0.08],
      [0.15, -0.08],
      [-0.15, -0.08]
    ], 0.035, 0.012),
    matShellCream
  );
  pauldronLowerMeshR.name = 'pauldron_lower_r';
  pauldronLowerMeshR.position.set(0.06, -0.08, 0.01);
  pauldronLowerMeshR.rotation.set(0, 0, -0.45);
  pauldron_r.add(pauldronLowerMeshR);

  addBoltRow(pauldron_r, 5, [-0.10, 0.09, 0.06], [0.14, 0.02, 0.06], 'pauldron_r_top');
  addBoltRow(pauldron_r, 4, [-0.08, -0.06, 0.06], [0.12, -0.12, 0.06], 'pauldron_r_bot');
  addClampBracket(pauldron_r, [0.08, 0.06, 0.05], [0, 0, -0.45], 'pauldron_clamp_r');

  const arm_upper_r = new THREE.Group();
  arm_upper_r.name = 'arm_upper_r';
  arm_upper_r.position.set(0.06, -0.06, 0);
  shoulder_r.add(arm_upper_r);

  const bicepFrameR = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.065, 0.26, 10),
    matFrameDark
  );
  bicepFrameR.name = 'bicep_frame_r';
  bicepFrameR.position.set(0, -0.13, 0);
  arm_upper_r.add(bicepFrameR);

  const bicepArmorR = new THREE.Mesh(
    makePlateGeo([
      [-0.065, 0.11],
      [0.065, 0.11],
      [0.055, -0.11],
      [-0.055, -0.11]
    ], 0.032, 0.010),
    matShellWhite
  );
  bicepArmorR.name = 'bicep_armor_r';
  bicepArmorR.position.set(0.035, -0.13, 0.045);
  arm_upper_r.add(bicepArmorR);

  addBoltRow(arm_upper_r, 3, [0.035, -0.04, 0.085], [0.035, -0.22, 0.085], 'bicep_r_bolts');

  const arm_lower_r = new THREE.Group();
  arm_lower_r.name = 'arm_lower_r';
  arm_lower_r.position.set(0, -0.26, 0);
  arm_upper_r.add(arm_lower_r);

  const forearmFrameR = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.055, 0.24, 10),
    matFrameDark
  );
  forearmFrameR.name = 'forearm_frame_r';
  forearmFrameR.position.set(0, -0.11, 0);
  arm_lower_r.add(forearmFrameR);

  const vambracePlateR = new THREE.Mesh(
    makePlateGeo([
      [-0.065, 0.10],
      [0.065, 0.10],
      [0.050, -0.10],
      [-0.050, -0.10]
    ], 0.035, 0.012),
    matShellWhite
  );
  vambracePlateR.name = 'vambrace_plate_r';
  vambracePlateR.position.set(0, -0.11, 0.055);
  arm_lower_r.add(vambracePlateR);

  addBoltRow(arm_lower_r, 4, [-0.045, -0.03, 0.095], [0.045, -0.03, 0.095], 'vambrace_r_top');
  addBoltRow(arm_lower_r, 4, [-0.040, -0.18, 0.095], [0.040, -0.18, 0.095], 'vambrace_r_bot');
  addClampBracket(arm_lower_r, [0.06, -0.11, 0.03], [0, 0, 1.57], 'vambrace_clamp_r');

  const hand_r = new THREE.Group();
  hand_r.name = 'hand_r';
  hand_r.position.set(0, -0.24, 0);
  arm_lower_r.add(hand_r);

  const fistMeshR = new THREE.Mesh(
    makePlateGeo([
      [-0.04, 0.045],
      [0.04, 0.045],
      [0.035, -0.045],
      [-0.035, -0.045]
    ], 0.09, 0.01),
    matFrameSteel
  );
  fistMeshR.name = 'fist_mesh_r';
  fistMeshR.position.set(0, -0.03, -0.045);
  hand_r.add(fistMeshR);

  // WEAPON: Gurz (Armenian Spiked Flanged Mace)
  const weapon_mace = new THREE.Group();
  weapon_mace.name = 'weapon_mace';
  weapon_mace.position.set(0, -0.02, 0.02);
  hand_r.add(weapon_mace);

  const maceShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.024, 0.78, 10),
    matFrameSteel
  );
  maceShaft.name = 'mace_shaft';
  maceShaft.position.set(0, 0.16, 0);
  weapon_mace.add(maceShaft);

  const maceGrip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.026, 0.24, 10),
    matFrameDeep
  );
  maceGrip.name = 'mace_grip';
  maceGrip.position.set(0, -0.02, 0);
  weapon_mace.add(maceGrip);

  const macePommel = new THREE.Mesh(
    new THREE.SphereGeometry(0.038, 10, 10),
    matBronze
  );
  macePommel.name = 'mace_pommel';
  macePommel.position.set(0, -0.24, 0);
  weapon_mace.add(macePommel);

  const maceHead = new THREE.Group();
  maceHead.name = 'mace_head';
  maceHead.position.set(0, 0.50, 0);
  weapon_mace.add(maceHead);

  const maceCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.04, 0.18, 12),
    matBronze
  );
  maceCore.name = 'mace_core';
  maceHead.add(maceCore);

  for (let f = 0; f < 6; f++) {
    const flange = new THREE.Mesh(
      makePlateGeo([
        [0, 0.08],
        [0.08, 0.02],
        [0.07, -0.06],
        [0, -0.08]
      ], 0.018, 0.005),
      matBladeSteel
    );
    const fang = f * (Math.PI / 3);
    flange.position.set(Math.sin(fang) * 0.035, 0, Math.cos(fang) * 0.035);
    flange.rotation.y = fang;
    flange.name = `mace_flange_${f}`;
    maceHead.add(flange);
  }

  const maceTopSpike = new THREE.Mesh(
    new THREE.ConeGeometry(0.03, 0.14, 6),
    matBladeSteel
  );
  maceTopSpike.name = 'mace_top_spike';
  maceTopSpike.position.set(0, 0.14, 0);
  maceHead.add(maceTopSpike);

  // --- Left Arm & Vahan War Shield (-X) ---
  const shoulder_l = new THREE.Group();
  shoulder_l.name = 'shoulder_l';
  shoulder_l.position.set(-0.34, 0.28, 0);
  chest.add(shoulder_l);

  const pauldron_l = new THREE.Group();
  pauldron_l.name = 'pauldron_l';
  pauldron_l.position.set(-0.04, 0.04, 0);
  shoulder_l.add(pauldron_l);

  const pauldronTopMeshL = new THREE.Mesh(
    makePlateGeo([
      [-0.15, 0.13],
      [0.15, 0.13],
      [0.19, -0.11],
      [-0.19, -0.11]
    ], 0.045, 0.015),
    matShellWhite
  );
  pauldronTopMeshL.name = 'pauldron_top_l';
  pauldronTopMeshL.rotation.set(0, 0, 0.45);
  pauldron_l.add(pauldronTopMeshL);

  const pauldronLowerMeshL = new THREE.Mesh(
    makePlateGeo([
      [-0.13, 0.08],
      [0.13, 0.08],
      [0.15, -0.08],
      [-0.15, -0.08]
    ], 0.035, 0.012),
    matShellCream
  );
  pauldronLowerMeshL.name = 'pauldron_lower_l';
  pauldronLowerMeshL.position.set(-0.06, -0.08, 0.01);
  pauldronLowerMeshL.rotation.set(0, 0, 0.45);
  pauldron_l.add(pauldronLowerMeshL);

  addBoltRow(pauldron_l, 5, [-0.14, 0.02, 0.06], [0.10, 0.09, 0.06], 'pauldron_l_top');
  addBoltRow(pauldron_l, 4, [-0.12, -0.12, 0.06], [0.08, -0.06, 0.06], 'pauldron_l_bot');
  addClampBracket(pauldron_l, [-0.08, 0.06, 0.05], [0, 0, 0.45], 'pauldron_clamp_l');

  const arm_upper_l = new THREE.Group();
  arm_upper_l.name = 'arm_upper_l';
  arm_upper_l.position.set(-0.06, -0.06, 0);
  shoulder_l.add(arm_upper_l);

  const bicepFrameL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.065, 0.26, 10),
    matFrameDark
  );
  bicepFrameL.name = 'bicep_frame_l';
  bicepFrameL.position.set(0, -0.13, 0);
  arm_upper_l.add(bicepFrameL);

  const bicepArmorL = new THREE.Mesh(
    makePlateGeo([
      [-0.065, 0.11],
      [0.065, 0.11],
      [0.055, -0.11],
      [-0.055, -0.11]
    ], 0.032, 0.010),
    matShellWhite
  );
  bicepArmorL.name = 'bicep_armor_l';
  bicepArmorL.position.set(-0.035, -0.13, 0.045);
  arm_upper_l.add(bicepArmorL);

  addBoltRow(arm_upper_l, 3, [-0.035, -0.04, 0.085], [-0.035, -0.22, 0.085], 'bicep_l_bolts');

  const arm_lower_l = new THREE.Group();
  arm_lower_l.name = 'arm_lower_l';
  arm_lower_l.position.set(0, -0.26, 0);
  arm_upper_l.add(arm_lower_l);

  const forearmFrameL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.055, 0.24, 10),
    matFrameDark
  );
  forearmFrameL.name = 'forearm_frame_l';
  forearmFrameL.position.set(0, -0.11, 0);
  arm_lower_l.add(forearmFrameL);

  const vambracePlateL = new THREE.Mesh(
    makePlateGeo([
      [-0.065, 0.10],
      [0.065, 0.10],
      [0.050, -0.10],
      [-0.050, -0.10]
    ], 0.035, 0.012),
    matShellWhite
  );
  vambracePlateL.name = 'vambrace_plate_l';
  vambracePlateL.position.set(0, -0.11, 0.055);
  arm_lower_l.add(vambracePlateL);

  addBoltRow(arm_lower_l, 4, [-0.045, -0.03, 0.095], [0.045, -0.03, 0.095], 'vambrace_l_top');
  addBoltRow(arm_lower_l, 4, [-0.040, -0.18, 0.095], [0.040, -0.18, 0.095], 'vambrace_l_bot');
  addClampBracket(arm_lower_l, [-0.06, -0.11, 0.03], [0, 0, -1.57], 'vambrace_clamp_l');

  const hand_l = new THREE.Group();
  hand_l.name = 'hand_l';
  hand_l.position.set(0, -0.24, 0);
  arm_lower_l.add(hand_l);

  const fistMeshL = new THREE.Mesh(
    makePlateGeo([
      [-0.04, 0.045],
      [0.04, 0.045],
      [0.035, -0.045],
      [-0.035, -0.045]
    ], 0.09, 0.01),
    matFrameSteel
  );
  fistMeshL.name = 'fist_mesh_l';
  fistMeshL.position.set(0, -0.03, -0.045);
  hand_l.add(fistMeshL);

  // SHIELD: Armenian Vahan (Extruded Octagonal Bone-White Plate + Umbo)
  const shield = new THREE.Group();
  shield.name = 'shield';
  shield.position.set(-0.08, -0.02, 0.14);
  shield.rotation.set(0.15, 0.3, -0.2);
  hand_l.add(shield);

  const shieldOctagonPts = [];
  const octRadius = 0.36;
  for (let o = 0; o < 8; o++) {
    const oang = o * (Math.PI / 4) + Math.PI / 8;
    shieldOctagonPts.push([Math.cos(oang) * octRadius, Math.sin(oang) * octRadius]);
  }
  const shieldBodyMesh = new THREE.Mesh(
    makePlateGeo(shieldOctagonPts, 0.042, 0.016),
    matShellWhite
  );
  shieldBodyMesh.name = 'shield_body';
  shield.add(shieldBodyMesh);

  const shieldCrossH = new THREE.Mesh(
    makePlateGeo([
      [-0.34, 0.025],
      [0.34, 0.025],
      [0.34, -0.025],
      [-0.34, -0.025]
    ], 0.018, 0.005),
    matFrameDark
  );
  shieldCrossH.name = 'shield_cross_h';
  shieldCrossH.position.set(0, 0, 0.045);
  shield.add(shieldCrossH);

  const shieldCrossV = new THREE.Mesh(
    makePlateGeo([
      [-0.025, 0.34],
      [0.025, 0.34],
      [0.025, -0.34],
      [-0.025, -0.34]
    ], 0.018, 0.005),
    matFrameDark
  );
  shieldCrossV.name = 'shield_cross_v';
  shieldCrossV.position.set(0, 0, 0.045);
  shield.add(shieldCrossV);

  const shieldBoss = new THREE.Mesh(
    new THREE.SphereGeometry(0.10, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    matBronze
  );
  shieldBoss.name = 'shield_boss';
  shieldBoss.position.set(0, 0, 0.05);
  shieldBoss.rotation.x = Math.PI * 0.5;
  shield.add(shieldBoss);

  const shieldGem = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 8, 8),
    matOpticsRed
  );
  shieldGem.name = 'shield_gem';
  shieldGem.position.set(0, 0, 0.13);
  shield.add(shieldGem);

  // 12 Outer Perimeter Hex Bolts on Shield
  for (let s = 0; s < 12; s++) {
    const sang = s * (Math.PI / 6);
    addBolt(
      shield,
      Math.sin(sang) * 0.32,
      Math.cos(sang) * 0.32,
      0.052,
      0, 0, 0,
      `shield_bolt_${s}`
    );
  }

  // --- Right Leg (+X) ---
  const thigh_r = new THREE.Group();
  thigh_r.name = 'thigh_r';
  thigh_r.position.set(0.16, -0.08, 0);
  pelvis.add(thigh_r);

  const hipJointR = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 12, 10),
    matFrameSteel
  );
  hipJointR.name = 'hip_joint_r';
  thigh_r.add(hipJointR);

  const thighFrameR = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.08, 0.38, 10),
    matFrameDark
  );
  thighFrameR.name = 'thigh_frame_r';
  thighFrameR.position.set(0, -0.19, 0);
  thigh_r.add(thighFrameR);

  // Thigh Outer Plate (Bone-White Chamfered Shell)
  const thighPlateR = new THREE.Mesh(
    makePlateGeo([
      [-0.085, 0.17],
      [0.085, 0.17],
      [0.070, -0.17],
      [-0.070, -0.17]
    ], 0.040, 0.014),
    matShellWhite
  );
  thighPlateR.name = 'thigh_plate_r';
  thighPlateR.position.set(0, -0.19, 0.065);
  thigh_r.add(thighPlateR);

  addBoltRow(thigh_r, 4, [-0.07, -0.05, 0.115], [0.07, -0.05, 0.115], 'thigh_r_top');
  addBoltRow(thigh_r, 4, [-0.055, -0.33, 0.115], [0.055, -0.33, 0.115], 'thigh_r_bot');
  addClampBracket(thigh_r, [0.095, -0.20, 0.02], [0, 0, 1.57], 'thigh_clamp_r');

  const shin_r = new THREE.Group();
  shin_r.name = 'shin_r';
  shin_r.position.set(0, -0.38, 0);
  thigh_r.add(shin_r);

  const kneeGuardR = new THREE.Mesh(
    makePlateGeo([
      [-0.065, 0.065],
      [0.065, 0.065],
      [0.050, -0.065],
      [-0.050, -0.065]
    ], 0.035, 0.012),
    matBronze
  );
  kneeGuardR.name = 'knee_guard_r';
  kneeGuardR.position.set(0, 0, 0.08);
  shin_r.add(kneeGuardR);
  addBoltRow(shin_r, 3, [-0.04, 0.04, 0.125], [0.04, 0.04, 0.125], 'knee_r_bolts');

  const shinFrameR = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.07, 0.38, 10),
    matFrameDark
  );
  shinFrameR.name = 'shin_frame_r';
  shinFrameR.position.set(0, -0.19, 0);
  shin_r.add(shinFrameR);

  const greavePlateR = new THREE.Mesh(
    makePlateGeo([
      [-0.080, 0.16],
      [0.080, 0.16],
      [0.060, -0.16],
      [-0.060, -0.16]
    ], 0.040, 0.014),
    matShellWhite
  );
  greavePlateR.name = 'greave_plate_r';
  greavePlateR.position.set(0, -0.19, 0.065);
  shin_r.add(greavePlateR);

  addBoltRow(shin_r, 4, [-0.065, -0.07, 0.115], [0.065, -0.07, 0.115], 'greave_r_top');
  addBoltRow(shin_r, 4, [-0.050, -0.33, 0.115], [0.050, -0.33, 0.115], 'greave_r_bot');
  addClampBracket(shin_r, [0.085, -0.22, 0.02], [0, 0, 1.57], 'shin_clamp_r');

  const foot_r = new THREE.Group();
  foot_r.name = 'foot_r';
  foot_r.position.set(0, -0.40, 0.04);
  shin_r.add(foot_r);

  const footMeshR = new THREE.Mesh(
    makePlateGeo([
      [-0.065, 0.12],
      [0.065, 0.12],
      [0.055, -0.12],
      [-0.055, -0.12]
    ], 0.09, 0.012),
    matFrameSteel
  );
  footMeshR.name = 'foot_mesh_r';
  footMeshR.position.set(0, -0.03, -0.02);
  footMeshR.rotation.x = Math.PI * 0.5;
  foot_r.add(footMeshR);

  const toeArmorR = new THREE.Mesh(
    makePlateGeo([
      [-0.06, 0.04],
      [0.06, 0.04],
      [0.0, 0.12],
    ], 0.032, 0.008),
    matShellTan
  );
  toeArmorR.name = 'toe_armor_r';
  toeArmorR.position.set(0, -0.06, 0.16);
  toeArmorR.rotation.x = 0.55;
  foot_r.add(toeArmorR);

  // --- Left Leg (-X) ---
  const thigh_l = new THREE.Group();
  thigh_l.name = 'thigh_l';
  thigh_l.position.set(-0.16, -0.08, 0);
  pelvis.add(thigh_l);

  const hipJointL = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 12, 10),
    matFrameSteel
  );
  hipJointL.name = 'hip_joint_l';
  thigh_l.add(hipJointL);

  const thighFrameL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.08, 0.38, 10),
    matFrameDark
  );
  thighFrameL.name = 'thigh_frame_l';
  thighFrameL.position.set(0, -0.19, 0);
  thigh_l.add(thighFrameL);

  const thighPlateL = new THREE.Mesh(
    makePlateGeo([
      [-0.085, 0.17],
      [0.085, 0.17],
      [0.070, -0.17],
      [-0.070, -0.17]
    ], 0.040, 0.014),
    matShellWhite
  );
  thighPlateL.name = 'thigh_plate_l';
  thighPlateL.position.set(0, -0.19, 0.065);
  thigh_l.add(thighPlateL);

  addBoltRow(thigh_l, 4, [-0.07, -0.05, 0.115], [0.07, -0.05, 0.115], 'thigh_l_top');
  addBoltRow(thigh_l, 4, [-0.055, -0.33, 0.115], [0.055, -0.33, 0.115], 'thigh_l_bot');
  addClampBracket(thigh_l, [-0.095, -0.20, 0.02], [0, 0, -1.57], 'thigh_clamp_l');

  const shin_l = new THREE.Group();
  shin_l.name = 'shin_l';
  shin_l.position.set(0, -0.38, 0);
  thigh_l.add(shin_l);

  const kneeGuardL = new THREE.Mesh(
    makePlateGeo([
      [-0.065, 0.065],
      [0.065, 0.065],
      [0.050, -0.065],
      [-0.050, -0.065]
    ], 0.035, 0.012),
    matBronze
  );
  kneeGuardL.name = 'knee_guard_l';
  kneeGuardL.position.set(0, 0, 0.08);
  shin_l.add(kneeGuardL);
  addBoltRow(shin_l, 3, [-0.04, 0.04, 0.125], [0.04, 0.04, 0.125], 'knee_l_bolts');

  const shinFrameL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.07, 0.38, 10),
    matFrameDark
  );
  shinFrameL.name = 'shin_frame_l';
  shinFrameL.position.set(0, -0.19, 0);
  shin_l.add(shinFrameL);

  const greavePlateL = new THREE.Mesh(
    makePlateGeo([
      [-0.080, 0.16],
      [0.080, 0.16],
      [0.060, -0.16],
      [-0.060, -0.16]
    ], 0.040, 0.014),
    matShellWhite
  );
  greavePlateL.name = 'greave_plate_l';
  greavePlateL.position.set(0, -0.19, 0.065);
  shin_l.add(greavePlateL);

  addBoltRow(shin_l, 4, [-0.065, -0.07, 0.115], [0.065, -0.07, 0.115], 'greave_l_top');
  addBoltRow(shin_l, 4, [-0.050, -0.33, 0.115], [0.050, -0.33, 0.115], 'greave_l_bot');
  addClampBracket(shin_l, [-0.085, -0.22, 0.02], [0, 0, -1.57], 'shin_clamp_l');

  const foot_l = new THREE.Group();
  foot_l.name = 'foot_l';
  foot_l.position.set(0, -0.40, 0.04);
  shin_l.add(foot_l);

  const footMeshL = new THREE.Mesh(
    makePlateGeo([
      [-0.065, 0.12],
      [0.065, 0.12],
      [0.055, -0.12],
      [-0.055, -0.12]
    ], 0.09, 0.012),
    matFrameSteel
  );
  footMeshL.name = 'foot_mesh_l';
  footMeshL.position.set(0, -0.03, -0.02);
  footMeshL.rotation.x = Math.PI * 0.5;
  foot_l.add(footMeshL);

  const toeArmorL = new THREE.Mesh(
    makePlateGeo([
      [-0.06, 0.04],
      [0.06, 0.04],
      [0.0, 0.12],
    ], 0.032, 0.008),
    matShellTan
  );
  toeArmorL.name = 'toe_armor_l';
  toeArmorL.position.set(0, -0.06, 0.16);
  toeArmorL.rotation.x = 0.55;
  foot_l.add(toeArmorL);


  // =========================================================================
  // 4. EXTENSIVE EXTERIOR TUBE & CABLE HARNESS RUNS
  // 20 Prominent External Runs routing outside armor, looping proud in space
  // Total length > 12.5 meters (~6.5 body-lengths)
  // =========================================================================
  function makeExternalTube(parent, pts, radius, mat, name) {
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 24, radius, 8, false);
    const tubeMesh = new THREE.Mesh(tubeGeo, mat);
    tubeMesh.name = name;
    parent.add(tubeMesh);
    return tubeMesh;
  }

  // Run 1: Central Spine Massive Power Conduit (Arches high off spine)
  makeExternalTube(chest, [
    new THREE.Vector3(0, 0.38, -0.16),
    new THREE.Vector3(0, 0.26, -0.26),
    new THREE.Vector3(0, 0.08, -0.28),
    new THREE.Vector3(0, -0.12, -0.24),
    new THREE.Vector3(0, -0.22, -0.16)
  ], 0.022, matHoseCopper, 'harness_spine_main');

  // Run 2: Spine Right Lateral Heavy Loom
  makeExternalTube(chest, [
    new THREE.Vector3(0.12, 0.34, -0.15),
    new THREE.Vector3(0.18, 0.20, -0.24),
    new THREE.Vector3(0.16, 0.02, -0.25),
    new THREE.Vector3(0.10, -0.16, -0.20)
  ], 0.016, matHoseBlack, 'harness_spine_r');

  // Run 3: Spine Left Lateral Heavy Loom
  makeExternalTube(chest, [
    new THREE.Vector3(-0.12, 0.34, -0.15),
    new THREE.Vector3(-0.18, 0.20, -0.24),
    new THREE.Vector3(-0.16, 0.02, -0.25),
    new THREE.Vector3(-0.10, -0.16, -0.20)
  ], 0.016, matHoseBlack, 'harness_spine_l');

  // Run 4: Cranium to Chest Exterior Feed Right
  makeExternalTube(neck, [
    new THREE.Vector3(0.11, 0.12, 0.02),
    new THREE.Vector3(0.18, 0.06, 0.08),
    new THREE.Vector3(0.19, -0.04, 0.10),
    new THREE.Vector3(0.13, -0.10, 0.08)
  ], 0.014, matHoseCopper, 'harness_neck_to_chest_r');

  // Run 5: Cranium to Chest Exterior Feed Left
  makeExternalTube(neck, [
    new THREE.Vector3(-0.11, 0.12, 0.02),
    new THREE.Vector3(-0.18, 0.06, 0.08),
    new THREE.Vector3(-0.19, -0.04, 0.10),
    new THREE.Vector3(-0.13, -0.10, 0.08)
  ], 0.014, matHoseCopper, 'harness_neck_to_chest_l');

  // Run 6: Chest Pectoral Hydraulic Arch Right
  makeExternalTube(chest, [
    new THREE.Vector3(0.10, 0.14, 0.22),
    new THREE.Vector3(0.24, 0.08, 0.23),
    new THREE.Vector3(0.26, -0.06, 0.20),
    new THREE.Vector3(0.16, -0.18, 0.16)
  ], 0.015, matHoseBlack, 'harness_pectoral_r');

  // Run 7: Chest Pectoral Hydraulic Arch Left
  makeExternalTube(chest, [
    new THREE.Vector3(-0.10, 0.14, 0.22),
    new THREE.Vector3(-0.24, 0.08, 0.23),
    new THREE.Vector3(-0.26, -0.06, 0.20),
    new THREE.Vector3(-0.16, -0.18, 0.16)
  ], 0.015, matHoseBlack, 'harness_pectoral_l');

  // Run 8: Over-the-Shoulder Exterior Loop Right
  makeExternalTube(shoulder_r, [
    new THREE.Vector3(-0.06, 0.16, 0.06),
    new THREE.Vector3(0.08, 0.22, 0.04),
    new THREE.Vector3(0.18, 0.14, -0.04),
    new THREE.Vector3(0.12, -0.02, -0.08)
  ], 0.016, matHoseCopper, 'harness_shoulder_r');

  // Run 9: Over-the-Shoulder Exterior Loop Left
  makeExternalTube(shoulder_l, [
    new THREE.Vector3(0.06, 0.16, 0.06),
    new THREE.Vector3(-0.08, 0.22, 0.04),
    new THREE.Vector3(-0.18, 0.14, -0.04),
    new THREE.Vector3(-0.12, -0.02, -0.08)
  ], 0.016, matHoseCopper, 'harness_shoulder_l');

  // Run 10: Outer Arm / Bicep to Vambrace High Arc Right
  makeExternalTube(arm_upper_r, [
    new THREE.Vector3(0.08, -0.04, 0.02),
    new THREE.Vector3(0.14, -0.14, 0.06),
    new THREE.Vector3(0.12, -0.26, 0.08),
    new THREE.Vector3(0.06, -0.36, 0.06)
  ], 0.014, matHoseBlack, 'harness_arm_outer_r');

  // Run 11: Outer Arm / Bicep to Vambrace High Arc Left
  makeExternalTube(arm_upper_l, [
    new THREE.Vector3(-0.08, -0.04, 0.02),
    new THREE.Vector3(-0.14, -0.14, 0.06),
    new THREE.Vector3(-0.12, -0.26, 0.08),
    new THREE.Vector3(-0.06, -0.36, 0.06)
  ], 0.014, matHoseBlack, 'harness_arm_outer_l');

  // Run 12: Inner Bicep Hydraulic Conduit Right
  makeExternalTube(arm_upper_r, [
    new THREE.Vector3(0.02, -0.06, -0.05),
    new THREE.Vector3(-0.02, -0.16, -0.08),
    new THREE.Vector3(-0.01, -0.28, -0.06),
    new THREE.Vector3(0.03, -0.38, -0.02)
  ], 0.012, matHoseCopper, 'harness_bicep_inner_r');

  // Run 13: Inner Bicep Hydraulic Conduit Left
  makeExternalTube(arm_upper_l, [
    new THREE.Vector3(-0.02, -0.06, -0.05),
    new THREE.Vector3(0.02, -0.16, -0.08),
    new THREE.Vector3(0.01, -0.28, -0.06),
    new THREE.Vector3(-0.03, -0.38, -0.02)
  ], 0.012, matHoseCopper, 'harness_bicep_inner_l');

  // Run 14: Exterior Hip to Thigh Lateral Loop Right
  makeExternalTube(thigh_r, [
    new THREE.Vector3(0.06, 0.06, 0.04),
    new THREE.Vector3(0.14, -0.06, 0.08),
    new THREE.Vector3(0.14, -0.20, 0.08),
    new THREE.Vector3(0.08, -0.34, 0.06)
  ], 0.016, matHoseCopper, 'harness_thigh_lateral_r');

  // Run 15: Exterior Hip to Thigh Lateral Loop Left
  makeExternalTube(thigh_l, [
    new THREE.Vector3(-0.06, 0.06, 0.04),
    new THREE.Vector3(-0.14, -0.06, 0.08),
    new THREE.Vector3(-0.14, -0.20, 0.08),
    new THREE.Vector3(-0.08, -0.34, 0.06)
  ], 0.016, matHoseCopper, 'harness_thigh_lateral_l');

  // Run 16: Posterior Knee Hydraulic Loop Right
  makeExternalTube(shin_r, [
    new THREE.Vector3(0.02, 0.06, -0.06),
    new THREE.Vector3(0.06, -0.06, -0.12),
    new THREE.Vector3(0.04, -0.18, -0.11),
    new THREE.Vector3(0.01, -0.30, -0.07)
  ], 0.015, matHoseBlack, 'harness_knee_post_r');

  // Run 17: Posterior Knee Hydraulic Loop Left
  makeExternalTube(shin_l, [
    new THREE.Vector3(-0.02, 0.06, -0.06),
    new THREE.Vector3(-0.06, -0.06, -0.12),
    new THREE.Vector3(-0.04, -0.18, -0.11),
    new THREE.Vector3(-0.01, -0.30, -0.07)
  ], 0.015, matHoseBlack, 'harness_knee_post_l');

  // Run 18: Shin Lateral to Ankle Clamp Right
  makeExternalTube(shin_r, [
    new THREE.Vector3(0.08, -0.08, 0.06),
    new THREE.Vector3(0.12, -0.20, 0.08),
    new THREE.Vector3(0.10, -0.32, 0.06),
    new THREE.Vector3(0.04, -0.42, 0.04)
  ], 0.013, matHoseCopper, 'harness_shin_ankle_r');

  // Run 19: Shin Lateral to Ankle Clamp Left
  makeExternalTube(shin_l, [
    new THREE.Vector3(-0.08, -0.08, 0.06),
    new THREE.Vector3(-0.12, -0.20, 0.08),
    new THREE.Vector3(-0.10, -0.32, 0.06),
    new THREE.Vector3(-0.04, -0.42, 0.04)
  ], 0.013, matHoseCopper, 'harness_shin_ankle_l');

  // Run 20: Mace Spiral Energy Wrap
  makeExternalTube(weapon_mace, [
    new THREE.Vector3(0.03, -0.12, 0.03),
    new THREE.Vector3(-0.04, 0.06, 0.03),
    new THREE.Vector3(0.04, 0.22, -0.03),
    new THREE.Vector3(-0.03, 0.38, 0.04),
    new THREE.Vector3(0.01, 0.48, 0.03)
  ], 0.011, matHoseCopper, 'harness_mace_wrap');


  // =========================================================================
  // 5. ANIMATION & SITUATION POSE FUNCTION
  // Handles all 25 situations strictly
  // =========================================================================
  object_userData_pose(root, {
    pelvis,
    torso,
    chest,
    neck,
    head,
    shoulder_r,
    arm_upper_r,
    arm_lower_r,
    hand_r,
    weapon_mace,
    shoulder_l,
    arm_upper_l,
    arm_lower_l,
    hand_l,
    shield,
    cape,
    cape_mid,
    cape_lower,
    skirt_f,
    skirt_b,
    skirt_r,
    skirt_l,
    thigh_r,
    shin_r,
    foot_r,
    thigh_l,
    shin_l,
    foot_l,
    dagger
  });

  return root;
}

function object_userData_pose(root, p) {
  root.userData.pose = (s) => {
    const speed = (s.speed !== undefined) ? s.speed : 0;
    const stride = (s.stride !== undefined) ? s.stride : 0;
    const turn = (s.turn !== undefined) ? s.turn : 0;
    const grounded = (s.grounded !== undefined) ? s.grounded : true;
    const health = (s.health !== undefined) ? s.health : 1.0;
    const action = s.action || null;
    const phase = (s.phase !== undefined) ? s.phase : 0;
    const t = (s.t !== undefined) ? s.t : 0;

    // 1. Reset Transforms to Rest Pose
    p.pelvis.position.set(0, 1.02, 0);
    p.pelvis.rotation.set(0, 0, 0);
    p.pelvis.scale.set(1, 1, 1);

    p.torso.position.set(0, 0.14, 0);
    p.torso.rotation.set(0, 0, 0);

    p.chest.position.set(0, 0.28, 0);
    p.chest.rotation.set(0, 0, 0);
    p.chest.scale.set(1, 1, 1);

    p.neck.position.set(0, 0.36, 0.02);
    p.neck.rotation.set(0, 0, 0);

    p.head.position.set(0, 0.12, 0.03);
    p.head.rotation.set(0, 0, 0);

    p.shoulder_r.rotation.set(0, 0, 0);
    p.arm_upper_r.rotation.set(0.12, -0.1, -0.18);
    p.arm_lower_r.rotation.set(-0.55, 0.2, 0.1);
    p.hand_r.rotation.set(0, 0, 0);
    p.weapon_mace.rotation.set(0.2, 0, 0);

    p.shoulder_l.rotation.set(0, 0, 0);
    p.arm_upper_l.rotation.set(0.18, 0.1, 0.22);
    p.arm_lower_l.rotation.set(-0.85, -0.2, -0.15);
    p.hand_l.rotation.set(0, 0, 0);
    p.shield.rotation.set(0.15, 0.3, -0.2);

    p.cape.rotation.set(0.08, 0, 0);
    p.cape_mid.rotation.set(0.06, 0, 0);
    p.cape_lower.rotation.set(0.06, 0, 0);

    p.skirt_f.rotation.set(0.08, 0, 0);
    p.skirt_b.rotation.set(-0.08, 0, 0);
    p.skirt_r.rotation.set(0, 0, -0.06);
    p.skirt_l.rotation.set(0, 0, 0.06);

    p.thigh_r.rotation.set(0, 0, 0.03);
    p.shin_r.rotation.set(0, 0, 0);
    p.foot_r.rotation.set(0, 0, 0);

    p.thigh_l.rotation.set(0, 0, -0.03);
    p.shin_l.rotation.set(0, 0, 0);
    p.foot_l.rotation.set(0, 0, 0);

    // 2. ACTION HANDLING
    if (action) {
      if (action === 'attack') {
        if (phase < 0.35) {
          const u = phase / 0.35;
          p.pelvis.position.y = 1.02 - u * 0.08;
          p.torso.rotation.y = u * 0.45;
          p.chest.rotation.y = u * 0.35;
          p.chest.rotation.x = -u * 0.15;
          p.arm_upper_r.rotation.set(-u * 1.8, 0.2, -u * 0.4);
          p.arm_lower_r.rotation.set(-u * 1.2, 0, 0);
          p.hand_r.rotation.set(-u * 0.5, 0, 0);
          p.arm_upper_l.rotation.set(0.2, 0, 0.4);
          p.arm_lower_l.rotation.set(-1.1, -0.3, 0);
          p.cape.rotation.x = 0.08 + u * 0.25;
        } else if (phase < 0.65) {
          const u = (phase - 0.35) / 0.3;
          p.pelvis.position.y = 0.94 + u * 0.02;
          p.pelvis.position.z = u * 0.12;
          p.torso.rotation.y = 0.45 - u * 0.8;
          p.chest.rotation.x = -0.15 + u * 0.55;
          p.head.rotation.x = -u * 0.2;
          p.arm_upper_r.rotation.set(-1.8 + u * 2.8, -u * 0.4, 0.2);
          p.arm_lower_r.rotation.set(-1.2 + u * 0.9, 0, 0);
          p.hand_r.rotation.set(-0.5 + u * 1.0, 0, 0);
          p.arm_upper_l.rotation.set(0.2 - u * 0.4, 0, 0.5);
          p.cape.rotation.x = 0.33 - u * 0.5;
        } else {
          const u = (phase - 0.65) / 0.35;
          p.pelvis.position.y = 0.96 + u * 0.06;
          p.pelvis.position.z = 0.12 * (1 - u);
          p.torso.rotation.y = -0.35 * (1 - u);
          p.chest.rotation.x = 0.4 * (1 - u);
          p.arm_upper_r.rotation.set(1.0 * (1 - u) + u * 0.12, -0.1, -0.18);
          p.arm_lower_r.rotation.set(-0.3 * (1 - u) - u * 0.55, 0.2, 0.1);
        }
      } else if (action === 'fire') {
        if (phase < 0.35) {
          const u = phase / 0.35;
          p.arm_upper_r.rotation.set(-u * 1.5, u * 0.5, -u * 0.3);
          p.arm_lower_r.rotation.set(-u * 1.4, 0, 0);
          p.torso.rotation.y = u * 0.4;
        } else if (phase < 0.65) {
          const u = (phase - 0.35) / 0.3;
          p.arm_upper_r.rotation.set(-1.5 + u * 2.6, 0.5 - u * 0.8, 0);
          p.arm_lower_r.rotation.set(-1.4 + u * 1.2, 0, 0);
          p.torso.rotation.y = 0.4 - u * 0.8;
          p.chest.rotation.x = u * 0.25;
        } else {
          const u = (phase - 0.65) / 0.35;
          p.arm_upper_r.rotation.set(1.1 * (1 - u) + u * 0.12, -0.1, -0.18);
          p.torso.rotation.y = -0.4 * (1 - u);
          p.chest.rotation.x = 0.25 * (1 - u);
        }
      } else if (action === 'hit') {
        const flinch = Math.sin(phase * Math.PI);
        p.pelvis.position.y = 1.02 - flinch * 0.09;
        p.pelvis.position.z = -flinch * 0.14;
        p.torso.rotation.x = -flinch * 0.35;
        p.chest.rotation.x = -flinch * 0.25;
        p.head.rotation.x = flinch * 0.4;
        p.head.rotation.y = flinch * 0.25;
        p.arm_upper_l.rotation.z = 0.22 + flinch * 0.4;
        p.arm_upper_r.rotation.z = -0.18 - flinch * 0.4;
        p.cape.rotation.x = 0.08 - flinch * 0.35;
      } else if (action === 'block') {
        const brace = Math.sin(phase * Math.PI);
        p.pelvis.position.y = 1.02 - brace * 0.14;
        p.pelvis.position.z = -brace * 0.08;
        p.torso.rotation.y = -brace * 0.35;
        p.chest.rotation.x = brace * 0.15;
        p.head.rotation.y = brace * 0.35;
        p.head.rotation.x = -brace * 0.1;

        p.arm_upper_l.rotation.set(brace * 0.5, -brace * 0.4, brace * 0.5);
        p.arm_lower_l.rotation.set(-1.4 * brace - 0.4 * (1 - brace), -0.6 * brace, 0);
        p.shield.rotation.set(0.2, brace * 0.6 + 0.3, -0.1);

        p.arm_upper_r.rotation.set(-brace * 0.8, brace * 0.3, -0.2);
        p.arm_lower_r.rotation.set(-brace * 1.1, 0, 0);

        p.thigh_l.rotation.set(brace * 0.3, 0, -0.1);
        p.shin_l.rotation.set(brace * 0.35, 0, 0);
        p.thigh_r.rotation.set(-brace * 0.2, 0, 0.1);
        p.shin_r.rotation.set(brace * 0.25, 0, 0);
      } else if (action === 'gather') {
        const dip = Math.sin(phase * Math.PI);
        p.pelvis.position.y = 1.02 - dip * 0.42;
        p.pelvis.position.z = dip * 0.1;
        p.torso.rotation.x = dip * 0.55;
        p.chest.rotation.x = dip * 0.35;
        p.head.rotation.x = -dip * 0.4;
        p.arm_upper_r.rotation.set(dip * 1.2, 0, -0.2);
        p.arm_lower_r.rotation.set(-dip * 0.2, 0, 0);
        p.thigh_r.rotation.set(dip * 0.7, 0, 0.1);
        p.shin_r.rotation.set(dip * 0.9, 0, 0);
        p.thigh_l.rotation.set(dip * 0.4, 0, -0.2);
        p.shin_l.rotation.set(dip * 0.8, 0, 0);
      } else if (action === 'deposit') {
        const dip = Math.sin(phase * Math.PI);
        p.pelvis.position.y = 1.02 - dip * 0.35;
        p.torso.rotation.x = dip * 0.45;
        p.arm_upper_r.rotation.set(dip * 0.9, 0, -0.1);
        p.arm_lower_r.rotation.set(dip * 0.1, 0, 0);
        p.thigh_r.rotation.set(dip * 0.6, 0, 0.1);
        p.shin_r.rotation.set(dip * 0.8, 0, 0);
      } else if (action === 'eat') {
        const cycle = Math.sin(phase * Math.PI * 6);
        p.arm_upper_r.rotation.set(-0.9, 0.4, -0.3);
        p.arm_lower_r.rotation.set(-1.6 + cycle * 0.1, 0.2, 0);
        p.head.rotation.x = 0.15 + cycle * 0.08;
      } else if (action === 'drink') {
        const lift = Math.sin(phase * Math.PI);
        p.arm_upper_r.rotation.set(-lift * 1.1, lift * 0.5, -0.2);
        p.arm_lower_r.rotation.set(-lift * 1.5, 0.3, 0);
        p.head.rotation.x = -lift * 0.45;
        p.chest.rotation.x = -lift * 0.15;
      } else if (action === 'jump') {
        if (phase < 0.35) {
          const u = phase / 0.35;
          p.pelvis.position.y = 1.02 - u * 0.25;
          p.torso.rotation.x = u * 0.3;
          p.thigh_r.rotation.set(u * 0.6, 0, 0.1);
          p.shin_r.rotation.set(u * 0.7, 0, 0);
          p.thigh_l.rotation.set(u * 0.6, 0, -0.1);
          p.shin_l.rotation.set(u * 0.7, 0, 0);
        } else {
          const u = (phase - 0.35) / 0.65;
          p.pelvis.position.y = 0.77 + u * 0.55;
          p.torso.rotation.x = -u * 0.2;
          p.arm_upper_r.rotation.set(-u * 1.6, 0, -0.3);
          p.arm_upper_l.rotation.set(-u * 1.4, 0, 0.3);
          p.cape.rotation.x = -u * 0.5;
        }
      } else if (action === 'land') {
        const dip = Math.sin(phase * Math.PI);
        p.pelvis.position.y = 1.02 - dip * 0.32;
        p.torso.rotation.x = dip * 0.35;
        p.thigh_r.rotation.set(dip * 0.7, 0, 0.15);
        p.shin_r.rotation.set(dip * 0.8, 0, 0);
        p.thigh_l.rotation.set(dip * 0.7, 0, -0.15);
        p.shin_l.rotation.set(dip * 0.8, 0, 0);
        p.cape.rotation.x = dip * 0.3;
      } else if (action === 'signal') {
        const u = Math.sin(phase * Math.PI);
        p.pelvis.position.y = 1.02 + u * 0.06;
        p.chest.rotation.x = -u * 0.35;
        p.chest.scale.set(1 + u * 0.15, 1 + u * 0.1, 1 + u * 0.15);
        p.head.rotation.x = -u * 0.55;
        p.arm_upper_r.rotation.set(-u * 2.6, 0, -u * 0.3);
        p.arm_lower_r.rotation.set(-u * 0.3, 0, 0);
        p.arm_upper_l.rotation.set(-u * 0.5, 0, u * 0.8);
        p.arm_lower_l.rotation.set(-u * 0.7, 0, 0);
        p.cape.rotation.x = u * 0.35;
      } else if (action === 'sleep') {
        const u = Math.min(1.0, phase * 1.2);
        p.pelvis.position.y = 1.02 - u * 0.65;
        p.pelvis.position.z = -u * 0.25;
        p.torso.rotation.x = u * 0.25;
        p.head.rotation.x = u * 0.45;
        p.arm_upper_r.rotation.set(u * 0.5, 0, -0.2);
        p.arm_lower_r.rotation.set(-u * 1.3, 0, 0);
        p.arm_upper_l.rotation.set(u * 0.5, 0, 0.2);
        p.arm_lower_l.rotation.set(-u * 1.3, 0, 0);
        p.thigh_r.rotation.set(u * 1.3, 0, 0.3);
        p.shin_r.rotation.set(u * 1.4, 0, 0);
        p.thigh_l.rotation.set(u * 1.3, 0, -0.3);
        p.shin_l.rotation.set(u * 1.4, 0, 0);
      } else if (action === 'wake') {
        const u = 1.0 - Math.min(1.0, phase);
        p.pelvis.position.y = 1.02 - u * 0.65;
        p.pelvis.position.z = -u * 0.25;
        p.torso.rotation.x = u * 0.25;
        p.head.rotation.x = u * 0.45;
        p.thigh_r.rotation.set(u * 1.3, 0, 0.3);
        p.shin_r.rotation.set(u * 1.4, 0, 0);
        p.thigh_l.rotation.set(u * 1.3, 0, -0.3);
        p.shin_l.rotation.set(u * 1.4, 0, 0);
      } else if (action === 'die') {
        const u = Math.min(1.0, phase);
        p.pelvis.position.y = 1.02 - u * 0.82;
        p.pelvis.position.z = -u * 0.4;
        p.torso.rotation.x = u * 0.65;
        p.torso.rotation.z = u * 0.4;
        p.head.rotation.x = u * 0.6;
        p.head.rotation.y = u * 0.4;
        p.arm_upper_r.rotation.set(u * 0.8, 0, -u * 0.7);
        p.arm_lower_r.rotation.set(u * 0.2, 0, 0);
        p.arm_upper_l.rotation.set(u * 0.5, 0, u * 0.8);
        p.thigh_r.rotation.set(u * 1.2, 0, 0.4);
        p.shin_r.rotation.set(u * 1.5, 0, 0);
        p.thigh_l.rotation.set(u * 0.9, 0, -0.4);
        p.shin_l.rotation.set(u * 1.3, 0, 0);
      } else if (action === 'evolve') {
        const surge = Math.sin(phase * Math.PI);
        p.pelvis.position.y = 1.02 - surge * 0.08;
        p.chest.scale.set(1 + surge * 0.2, 1 + surge * 0.15, 1 + surge * 0.2);
        p.chest.rotation.x = -surge * 0.25;
        p.head.rotation.x = -surge * 0.4;
        p.arm_upper_r.rotation.set(-surge * 1.2, 0, -surge * 0.9);
        p.arm_lower_r.rotation.set(-surge * 0.6, 0, 0);
        p.arm_upper_l.rotation.set(-surge * 1.2, 0, surge * 0.9);
        p.arm_lower_l.rotation.set(-surge * 0.6, 0, 0);
        p.cape.rotation.x = surge * 0.45;
        p.thigh_r.rotation.set(surge * 0.2, 0, surge * 0.25);
        p.thigh_l.rotation.set(surge * 0.2, 0, -surge * 0.25);
      }
    } else {
      // 3. LOCOMOTION GAITS
      if (speed <= 0.05) {
        // STAND / IDLE
        const breath = Math.sin(t * 2.2);
        const scan = Math.sin(t * 0.8);

        p.chest.scale.set(1 + breath * 0.03, 1 + breath * 0.02, 1 + breath * 0.03);
        p.chest.rotation.x = breath * 0.015;
        p.head.rotation.y = scan * 0.12;
        p.head.rotation.x = Math.sin(t * 0.5) * 0.04;

        const shift = Math.sin(t * 1.1);
        p.pelvis.position.x = shift * 0.015;
        p.pelvis.rotation.z = shift * 0.012;

        p.cape.rotation.x = 0.08 + Math.sin(t * 1.5) * 0.03;
        p.cape_mid.rotation.z = Math.sin(t * 1.2) * 0.02;
      } else {
        const cycle = stride * Math.PI * 2;
        const sinCycle = Math.sin(cycle);
        const cosCycle = Math.cos(cycle);

        let legAmp = 0.55;
        let kneeAmp = 0.65;
        let armAmp = 0.45;
        let lean = 0.05;
        let bounce = 0.03;
        let capeBillow = 0.15;

        if (speed <= 0.5) {
          legAmp = 0.35;
          kneeAmp = 0.45;
          armAmp = 0.25;
          lean = 0.08;
          bounce = 0.02;
          capeBillow = 0.10;
        } else if (speed <= 1.2) {
          legAmp = 0.60;
          kneeAmp = 0.70;
          armAmp = 0.50;
          lean = 0.06;
          bounce = 0.035;
          capeBillow = 0.20;
        } else if (speed <= 2.5) {
          legAmp = 0.85;
          kneeAmp = 0.95;
          armAmp = 0.75;
          lean = 0.14;
          bounce = 0.06;
          capeBillow = 0.35;
        } else if (speed <= 4.0) {
          legAmp = 1.05;
          kneeAmp = 1.15;
          armAmp = 0.95;
          lean = 0.22;
          bounce = 0.08;
          capeBillow = 0.55;
        } else {
          legAmp = 1.25;
          kneeAmp = 1.35;
          armAmp = 1.15;
          lean = 0.32;
          bounce = 0.09;
          capeBillow = 0.85;
        }

        p.pelvis.position.y = 1.02 - Math.abs(sinCycle) * bounce;
        p.pelvis.rotation.y = -sinCycle * 0.12;
        p.pelvis.rotation.z = cosCycle * 0.04;

        p.torso.rotation.x = lean;
        p.torso.rotation.y = sinCycle * 0.10;
        p.chest.rotation.x = lean * 0.5;
        p.chest.rotation.y = -sinCycle * 0.05;
        p.head.rotation.x = -lean * 0.8;

        p.thigh_r.rotation.x = sinCycle * legAmp;
        p.shin_r.rotation.x = Math.max(0, -Math.sin(cycle + 0.3)) * kneeAmp;
        p.foot_r.rotation.x = -sinCycle * 0.25;

        p.thigh_l.rotation.x = -sinCycle * legAmp;
        p.shin_l.rotation.x = Math.max(0, Math.sin(cycle + 0.3)) * kneeAmp;
        p.foot_l.rotation.x = sinCycle * 0.25;

        p.arm_upper_r.rotation.x = -sinCycle * armAmp + 0.1;
        p.arm_lower_r.rotation.x = -0.55 + Math.max(0, -sinCycle) * 0.3;

        p.arm_upper_l.rotation.x = sinCycle * (armAmp * 0.6) + 0.15;
        p.arm_lower_l.rotation.x = -0.85 - Math.max(0, sinCycle) * 0.2;

        p.skirt_f.rotation.x = 0.08 + Math.max(0, sinCycle) * 0.25;
        p.skirt_b.rotation.x = -0.08 - Math.max(0, -sinCycle) * 0.25;
        p.cape.rotation.x = 0.08 + capeBillow + Math.sin(cycle * 2) * 0.1;
        p.cape_mid.rotation.x = 0.06 + capeBillow * 0.8;
        p.cape_lower.rotation.x = 0.06 + capeBillow * 0.6;
      }
    }

    // 4. OVERLAYS
    if (turn !== 0) {
      p.pelvis.rotation.z += -turn * 0.08;
      p.torso.rotation.y += turn * 0.22;
      p.head.rotation.y += turn * 0.28;
      p.cape.rotation.z += -turn * 0.20;
      p.cape_mid.rotation.z += -turn * 0.15;
    }

    if (!grounded) {
      p.pelvis.position.y += 0.08;
      p.thigh_r.rotation.x = 0.35;
      p.shin_r.rotation.x = 0.45;
      p.foot_r.rotation.x = -0.2;

      p.thigh_l.rotation.x = 0.35;
      p.shin_l.rotation.x = 0.45;
      p.foot_l.rotation.x = -0.2;

      p.arm_upper_r.rotation.z -= 0.25;
      p.arm_upper_l.rotation.z += 0.25;
      p.cape.rotation.x = -0.35;
    }

    if (health < 1.0) {
      const wound = 1.0 - health;
      p.pelvis.position.y -= wound * 0.06;
      p.chest.rotation.z += wound * 0.14;
      p.head.rotation.x += wound * 0.22;
      p.head.rotation.z += wound * 0.12;
      p.arm_upper_l.rotation.z += wound * 0.2;
      p.arm_upper_r.rotation.z += wound * 0.15;
    }
  };
}
;return build(THREE, TSL);