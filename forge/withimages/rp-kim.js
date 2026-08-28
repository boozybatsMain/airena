function build(THREE, TSL) {
  // THE ONE QUALITY: FLEX AND GRIP — eight long arms, each a chain of machined
  // segments that curls; a big domed mantle; a low wide head with two recessed
  // glass eyes facing +Z.
  //
  // BRIEF: an armoured octopus. Bulbous lathed mantle at the rear-top, clad in 4
  // overlapping pressed shell plates with rolled lips; gear stacks and ring bands
  // show in the flank gaps; a siphon nozzle at the rear. The head sits low in
  // front of the mantle, one rigid volume about a shoulder wide: faceted brow
  // shell over the optics, cheek shells, a crown plate with a bolt row, two dark
  // glass eyes in stepped bezels, a small two-part beak underneath that hinges
  // open. Eight arms radiate from a visible skirt ring: each arm is a chain of 7
  // tapered segment blocks, each block its own named part with a joint collar,
  // a thin shell scale on top, a ram barrel + rod beneath, rubber sucker pads
  // under that, side pins, ending in a tapered tip blade. Front/side arms walk,
  // rear arms trail. Palette: bone white shells over dark gunmetal machine,
  // near-black hose and suckers, one rust-orange accent plate on the mantle.

  const BONE = 0xD8D2C6, BONE2 = 0xB5AC9C, GUN = 0x55524C, GUN2 = 0x6B665E,
        DARK = 0x3E3A34, BRONZE = 0x4A4238, RUBBER = 0x1E1D1B, ACCENT = 0xC2521E;

  const { positionLocal, normalLocal, vec3, float, mix, smoothstep, sin, clamp } = TSL;
  function wearNodes(base, rough) {
    const p = positionLocal, n = normalLocal;
    const nz = sin(p.x.mul(37.1).add(p.y.mul(23.7)))
      .mul(sin(p.y.mul(41.3).add(p.z.mul(29.1))))
      .mul(sin(p.z.mul(31.7).add(p.x.mul(17.3))));
    const nz2 = sin(p.x.mul(7.9).add(p.z.mul(5.3))).mul(sin(p.y.mul(6.1).add(p.x.mul(4.7))));
    const edge = smoothstep(float(0.35), float(0.9), nz.mul(0.5).add(0.5).add(nz2.mul(0.35)));
    const down = clamp(n.y.mul(-1.0).add(0.5), float(0.0), float(1.0));
    const streak = smoothstep(float(0.6), float(0.95), sin(p.y.mul(9.0).add(nz.mul(3.0))).mul(0.5).add(0.5)).mul(down);
    const wearAmt = clamp(edge.mul(0.55).add(streak.mul(0.45)), float(0.0), float(1.0));
    const rust = vec3(0.30, 0.18, 0.10);
    const c = mix(base, rust, wearAmt.mul(0.55));
    const dust = clamp(n.y, float(0.0), float(1.0)).mul(0.12);
    return {
      color: c.add(vec3(dust, dust, dust.mul(0.9))),
      rough: clamp(rough.add(wearAmt.mul(0.25)).add(clamp(n.y, float(0.0), float(1.0)).mul(0.1)), float(0.3), float(1.0))
    };
  }

  function matShell(c) {
    const m = new THREE.MeshStandardNodeMaterial({ color: c, metalness: 0.12, roughness: 0.6 });
    const w = wearNodes(vec3(new THREE.Color(c).r, new THREE.Color(c).g, new THREE.Color(c).b), float(0.6));
    m.colorNode = w.color; m.roughnessNode = w.rough;
    return m;
  }
  function matMetal(c, r) {
    const m = new THREE.MeshStandardNodeMaterial({ color: c, metalness: 0.85, roughness: r });
    const col = new THREE.Color(c);
    const w = wearNodes(vec3(col.r, col.g, col.b), float(r));
    m.colorNode = w.color; m.roughnessNode = w.rough;
    return m;
  }
  function matRubber(c) {
    return new THREE.MeshStandardNodeMaterial({ color: c, metalness: 0.0, roughness: 0.9 });
  }
  function matGlass() {
    return new THREE.MeshStandardNodeMaterial({ color: 0x0A0C0E, metalness: 0.1, roughness: 0.08 });
  }
  function matEmissive() {
    return new THREE.MeshStandardNodeMaterial({ color: 0x111111, emissive: new THREE.Color(0x66CCDD), emissiveIntensity: 1.4, roughness: 0.5 });
  }

  const root = new THREE.Group();
  root.name = "octopus";

  const body = new THREE.Group();
  body.name = "body";
  body.position.y = 1.15;
  root.add(body);

  // ---------- MANTLE ----------
  const mantle = new THREE.Group();
  mantle.name = "mantle";
  mantle.position.set(0, 0.35, -0.55);
  body.add(mantle);

  const mantlePts = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 0.52;
    mantlePts.push(new THREE.Vector2(Math.sin(a) * 0.62, Math.cos(a) * 0.85 - 0.15));
  }
  const mantleCore = new THREE.Mesh(new THREE.LatheGeometry(mantlePts, 20), matMetal(GUN, 0.55));
  mantleCore.name = "mantleCore";
  mantleCore.scale.set(1, 1, 1.25);
  mantleCore.rotation.x = -0.35;
  mantle.add(mantleCore);

  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6 - i * 0.09, 0.045, 8, 24), matMetal(DARK, 0.5));
    ring.name = "mantleBand" + i;
    ring.position.set(0, -0.02 + i * 0.2, -i * 0.05);
    ring.rotation.x = Math.PI / 2 - 0.35;
    ring.scale.set(1, 1.2, 1);
    mantle.add(ring);
  }

  const shellDefs = [
    { th0: -0.5, th1: 1.6, y: 0.28, r: 0.66, name: "mantleShellTop" },
    { th0: 0.4, th1: 1.4, y: 0.05, r: 0.7, name: "mantleShellMidR", x: 0.18 },
    { th0: 1.7, th1: 1.4, y: 0.05, r: 0.7, name: "mantleShellMidL", x: -0.18 },
    { th0: -0.3, th1: 1.2, y: -0.18, r: 0.68, name: "mantleShellRear", z: -0.12 },
  ];
  for (const d of shellDefs) {
    const sh = new THREE.Mesh(
      new THREE.CylinderGeometry(d.r * 0.7, d.r, 0.42, 20, 1, true, d.th0, d.th1),
      matShell(BONE)
    );
    sh.name = d.name;
    sh.position.set(d.x || 0, d.y, d.z || 0);
    sh.scale.set(1, 1, 1.25);
    sh.rotation.x = -0.35;
    sh.material.side = THREE.DoubleSide;
    mantle.add(sh);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.022, 6, 20, d.th1 * 0.9), matShell(BONE2));
    lip.name = d.name + "Lip";
    lip.rotation.x = Math.PI / 2 - 0.35;
    lip.rotation.z = d.th0 + 0.15;
    lip.position.set(d.x || 0, d.y - 0.21, d.z || 0);
    lip.scale.set(1, 1.2, 1);
    mantle.add(lip);
  }

  const acc = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.24), matShell(ACCENT));
  acc.name = "mantleAccentPlate";
  acc.position.set(0.34, 0.42, -0.15);
  acc.rotation.z = -0.4;
  mantle.add(acc);

  for (let i = 0; i < 3; i++) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.04), matMetal(DARK, 0.6));
    v.name = "mantleVent" + i;
    v.position.set(-0.4, 0.3 - i * 0.07, -0.1);
    v.rotation.z = 0.5;
    mantle.add(v);
  }

  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10), matEmissive());
  lamp.name = "mantleStatusLamp";
  lamp.position.set(0.28, 0.5, 0.12);
  lamp.rotation.x = -0.6;
  mantle.add(lamp);

  for (const side of [-1, 1]) {
    const gearStack = new THREE.Group();
    gearStack.name = side < 0 ? "gearStackL" : "gearStackR";
    gearStack.position.set(side * 0.5, -0.05, 0.25);
    gearStack.rotation.z = Math.PI / 2;
    mantle.add(gearStack);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.1 - i * 0.02, 0.1 - i * 0.02, 0.035, 12), matMetal(i % 2 ? BRONZE : GUN2, 0.5));
      g.name = gearStack.name + "Gear" + i;
      g.position.y = i * 0.05;
      gearStack.add(g);
    }
  }

  const siphon = new THREE.Group();
  siphon.name = "siphon";
  siphon.position.set(0.2, 0.1, -0.75);
  siphon.rotation.x = 1.2;
  mantle.add(siphon);
  const sipTube = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.4, 10), matMetal(GUN2, 0.5));
  sipTube.name = "siphonTube";
  siphon.add(sipTube);
  const sipCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), matMetal(DARK, 0.55));
  sipCollar.name = "siphonCollar";
  sipCollar.position.y = -0.18;
  siphon.add(sipCollar);

  // ---------- HEAD ----------
  const head = new THREE.Group();
  head.name = "head";
  head.position.set(0, -0.05, 0.45);
  body.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), matMetal(GUN, 0.55));
  skull.name = "skullCore";
  skull.scale.set(1.0, 0.78, 0.95);
  head.add(skull);

  const brow = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 20, 10, Math.PI * 0.12, Math.PI * 0.76, 0, Math.PI * 0.42),
    matShell(BONE)
  );
  brow.name = "browShell";
  brow.scale.set(1.0, 0.78, 0.95);
  brow.rotation.x = -0.15;
  brow.material.side = THREE.DoubleSide;
  head.add(brow);

  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(
      new THREE.SphereGeometry(0.51, 14, 10, s < 0 ? Math.PI * 0.85 : Math.PI * 1.7, Math.PI * 0.28, Math.PI * 0.3, Math.PI * 0.45),
      matShell(BONE)
    );
    cheek.name = s < 0 ? "cheekL" : "cheekR";
    cheek.scale.set(1.0, 0.78, 0.95);
    cheek.material.side = THREE.DoubleSide;
    head.add(cheek);
  }

  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.42), matShell(BONE));
  crown.name = "crownPlate";
  crown.position.set(0, 0.38, -0.05);
  crown.rotation.x = -0.2;
  head.add(crown);

  for (const s of [-1, 1]) {
    const eyeG = new THREE.Group();
    eyeG.name = s < 0 ? "eyeL" : "eyeR";
    eyeG.position.set(s * 0.3, 0.08, 0.32);
    eyeG.rotation.y = s * 0.5;
    head.add(eyeG);
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.1, 16), matMetal(GUN2, 0.45));
    bezel.name = eyeG.name + "Bezel";
    bezel.rotation.x = Math.PI / 2;
    eyeG.add(bezel);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 18), matMetal(BRONZE, 0.5));
    ring.name = eyeG.name + "Ring";
    ring.position.z = 0.05;
    eyeG.add(ring);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), matGlass());
    lens.name = eyeG.name + "Lens";
    lens.position.z = 0.04;
    lens.scale.set(1, 1, 0.55);
    eyeG.add(lens);
  }

  const jaw = new THREE.Group();
  jaw.name = "jaw";
  jaw.position.set(0, -0.28, 0.3);
  head.add(jaw);
  const jawUpper = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 8), matMetal(DARK, 0.5));
  jawUpper.name = "beakUpper";
  jawUpper.rotation.x = Math.PI / 2 + 0.5;
  jawUpper.position.set(0, 0.04, 0.06);
  jaw.add(jawUpper);
  const jawLower = new THREE.Group();
  jawLower.name = "beakLowerPivot";
  jawLower.position.set(0, -0.04, -0.02);
  jaw.add(jawLower);
  const beakLow = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.15, 8), matMetal(DARK, 0.5));
  beakLow.name = "beakLower";
  beakLow.rotation.x = -Math.PI / 2 - 0.5;
  beakLow.position.set(0, 0, 0.08);
  jawLower.add(beakLow);

  for (const s of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.16, 6), matMetal(GUN2, 0.5));
    stalk.name = s < 0 ? "sensorStalkL" : "sensorStalkR";
    stalk.position.set(s * 0.18, 0.42, 0.1);
    stalk.rotation.z = s * -0.35;
    head.add(stalk);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), matMetal(DARK, 0.4));
    tip.name = stalk.name + "Tip";
    tip.position.set(s * 0.21, 0.5, 0.1);
    head.add(tip);
  }

  const skirt = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.1, 10, 24), matMetal(GUN, 0.55));
  skirt.name = "skirtRing";
  skirt.rotation.x = Math.PI / 2;
  skirt.position.set(0, -0.15, 0.05);
  head.add(skirt);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.35, 12), matMetal(GUN, 0.55));
  neck.name = "neckColumn";
  neck.position.set(0, 0.12, -0.18);
  neck.rotation.x = -0.5;
  head.add(neck);

  // harness — each run parented to the head, lands in a port at both ends
  for (const s of [-1, 1]) {
    const pts = [
      new THREE.Vector3(s * 0.3, 0.1, -0.2),
      new THREE.Vector3(s * 0.45, 0.25, -0.4),
      new THREE.Vector3(s * 0.4, 0.3, -0.7),
    ];
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.035, 8), matRubber(RUBBER));
    hose.name = s < 0 ? "trunkHoseL" : "trunkHoseR";
    head.add(hose);
    const portA = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.06, 8), matMetal(GUN2, 0.5));
    portA.name = hose.name + "PortA";
    portA.position.copy(pts[0]);
    portA.rotation.z = s * 0.6;
    head.add(portA);
    const portB = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8), matMetal(GUN2, 0.5));
    portB.name = hose.name + "PortB";
    portB.position.copy(pts[2]);
    head.add(portB);
    // thin wire paired with each trunk hose
    const pts2 = pts.map(v => new THREE.Vector3(v.x * 0.9, v.y - 0.08, v.z + 0.03));
    const wire = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), 12, 0.012, 6), matRubber(RUBBER));
    wire.name = s < 0 ? "signalWireL" : "signalWireR";
    head.add(wire);
  }

  // ---------- ARMS ----------
  const armAngles = [];
  for (let i = 0; i < 8; i++) armAngles.push((i / 8) * Math.PI * 2);
  const ARM_SEGS = 7;
  const arms = [];

  function buildArm(idx) {
    const a = armAngles[idx];
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const rootG = new THREE.Group();
    rootG.name = "arm" + idx;
    rootG.position.copy(dir.clone().multiplyScalar(0.38));
    rootG.position.y = -0.15;
    rootG.rotation.y = a;
    head.add(rootG);

    const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 10), matMetal(DARK, 0.5));
    hip.name = "arm" + idx + "HipBarrel";
    hip.rotation.z = Math.PI / 2;
    rootG.add(hip);

    const segs = [];
    let parent = rootG;
    let drop = 0.16;
    for (let j = 0; j < ARM_SEGS; j++) {
      const sg = new THREE.Group();
      sg.name = "arm" + idx + "Seg" + j;
      if (j === 0) sg.position.set(0, -drop, 0.14);
      else sg.position.set(0, -drop * (1 - j * 0.06), 0.22);
      parent.add(sg);
      segs.push(sg);
      parent = sg;

      const r = 0.085 * (1 - j / ARM_SEGS * 0.55);
      const segLen = 0.24 * (1 - j * 0.05);
      const block = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.82, r, segLen, 8), matMetal(GUN, 0.55));
      block.name = sg.name + "Block";
      block.rotation.x = Math.PI / 2;
      block.position.z = segLen / 2 - 0.02;
      sg.add(block);

      const collar = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.045, 8), matMetal(DARK, 0.5));
      collar.name = sg.name + "Collar";
      collar.rotation.x = Math.PI / 2;
      sg.add(collar);

      const scale = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 1.1, r * 1.25, segLen * 0.75, 8, 1, true, -Math.PI * 0.35, Math.PI * 0.7),
        matShell(BONE)
      );
      scale.name = sg.name + "Scale";
      scale.rotation.x = Math.PI / 2;
      scale.position.z = segLen / 2;
      scale.material.side = THREE.DoubleSide;
      sg.add(scale);

      if (j < ARM_SEGS - 1) {
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.32, r * 0.32, segLen * 0.55, 6), matMetal(BRONZE, 0.5));
        barrel.name = sg.name + "RamBarrel";
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, -r * 0.85, segLen * 0.3);
        sg.add(barrel);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, segLen * 0.4, 6), matMetal(GUN2, 0.4));
        rod.name = sg.name + "RamRod";
        rod.rotation.x = Math.PI / 2;
        rod.position.set(0, -r * 0.85, segLen * 0.72);
        sg.add(rod);
      }

      for (let k = 0; k < 2; k++) {
        const suc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r * 0.5, 0.02, 8), matRubber(RUBBER));
        suc.name = sg.name + "Sucker" + k;
        suc.position.set((k - 0.5) * r * 0.9, -r * 0.95, segLen * (0.3 + k * 0.35));
        sg.add(suc);
      }
      for (const sd of [-1, 1]) {
        const pin = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.03, 6), matMetal(GUN2, 0.45));
        pin.name = sg.name + (sd < 0 ? "PinL" : "PinR");
        pin.rotation.z = Math.PI / 2;
        pin.position.set(sd * r * 0.95, 0, segLen * 0.5);
        sg.add(pin);
      }
      if (j >= 2 && j % 2 === 0) drop *= 0.9;
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 6), matMetal(DARK, 0.45));
    tip.name = "arm" + idx + "Tip";
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.16;
    parent.add(tip);

    return { root: rootG, segs, idx };
  }

  for (let i = 0; i < 8; i++) arms.push(buildArm(i));

  // greebles
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 6), matMetal(DARK, 0.5));
    b.name = "crownBolt" + i;
    b.position.set(-0.2 + i * 0.08, 0.42, 0.08);
    head.add(b);
  }
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.08), matMetal(GUN2, 0.5));
    c.name = "skirtClamp" + i;
    const a = armAngles[i] + 0.39;
    c.position.set(Math.sin(a) * 0.42, -0.15, Math.cos(a) * 0.42 + 0.05);
    head.add(c);
  }

  // ---------- POSE ----------
  const TAU = Math.PI * 2;
  root.userData.pose = (s) => {
    const t = s.t || 0;
    const speed = s.speed || 0;
    const stride = s.stride || 0;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = s.health === undefined ? 1 : s.health;
    const act = s.action, ph = s.phase || 0;

    const creep = speed > 0 && speed < 1 ? 1 : 0;
    const run = Math.min(Math.max((speed - 1) / 2, 0), 1);
    const sprint = Math.min(Math.max((speed - 3) / 3, 0), 1);
    const bobAmp = speed === 0 ? 0 : 0.05 + run * 0.1 + sprint * 0.08;
    const strideHz = TAU * stride;

    let bodyY = 1.15, bodyPitch = 0.12, bodyRoll = 0;
    let headPitch = 0, headYaw = 0, headRoll = 0;
    let mantlePitch = 0;
    let jawOpen = 0;
    const armPose = arms.map(() => ({ curl: [], lift: 0, spread: 0, yaw: 0 }));

    const idle = speed === 0 ? 1 : Math.max(0, 1 - speed);
    bodyY += Math.sin(t * 1.4) * 0.02 * idle;
    headYaw += Math.sin(t * 0.5) * 0.25 * idle + Math.sin(t * 0.23) * 0.1 * idle;
    headPitch += Math.sin(t * 0.9) * 0.05 * idle;
    mantlePitch += Math.sin(t * 1.4) * 0.02 * idle;

    if (speed > 0) {
      bodyY += Math.sin(strideHz * 2) * bobAmp;
      bodyPitch += Math.sin(strideHz) * 0.04 * (0.5 + run);
      bodyRoll += Math.sin(strideHz) * 0.03 * (1 - sprint);
    }
    if (creep) { bodyY -= 0.18; bodyPitch += 0.08; }
    bodyY += sprint * 0.1;
    bodyPitch += -sprint * 0.12;
    headPitch += -sprint * 0.15;

    for (let i = 0; i < 8; i++) {
      const ap = armPose[i];
      const a = armAngles[i];
      const frontness = Math.cos(a);
      const phase = strideHz + i * (TAU / 8) * (1 + run * 0.5);
      const swing = Math.sin(phase);
      const reach = Math.cos(phase);
      const amp = speed === 0 ? 0 : (0.25 + run * 0.35 + sprint * 0.3) * (creep ? 0.5 : 1);
      const strokeAmp = amp * (0.4 + 0.6 * Math.abs(frontness));
      ap.lift += speed === 0 ? 0 : Math.max(0, swing) * 0.35 * (0.5 + run);
      ap.yaw += speed === 0 ? 0 : reach * strokeAmp * (frontness >= 0 ? 1 : -0.5);
      for (let j = 0; j < ARM_SEGS; j++) {
        const jj = j / (ARM_SEGS - 1);
        let c = -0.28 + jj * 0.42;
        c += speed === 0
          ? Math.sin(t * 0.8 + i * 1.3 + jj * 2.0) * 0.05 * idle
          : Math.sin(phase - jj * 1.8) * amp * (0.4 + jj * 0.6);
        ap.curl.push(c);
      }
      ap.spread += Math.sin(t * 0.4 + i) * 0.03 * idle;
    }

    if (turn !== 0) {
      bodyRoll += -turn * 0.12;
      headYaw += -turn * 0.45;
      headRoll += -turn * 0.1;
      for (let i = 0; i < 8; i++) {
        const side = Math.sin(armAngles[i]);
        armPose[i].yaw += turn * side * 0.25;
        if (side * turn < 0) armPose[i].lift -= 0.1;
        else armPose[i].lift += 0.08;
      }
    }

    if (!grounded) {
      for (let i = 0; i < 8; i++) {
        const ap = armPose[i];
        ap.lift -= 0.3;
        for (let j = 0; j < ARM_SEGS; j++) ap.curl[j] += 0.25 + j * 0.06;
      }
      bodyPitch += -0.1;
    }

    if (health < 1) {
      const h = 1 - health;
      bodyRoll += 0.15 * h;
      bodyY -= 0.15 * h;
      headPitch += 0.25 * h;
      headRoll += 0.12 * h;
      for (const i of [1, 2]) {
        armPose[i].lift -= 0.25 * h;
        for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] += 0.2 * h;
      }
    }

    if (act) {
      const p = ph;
      const ease = (x) => x * x * (3 - 2 * x);
      if (act === 'attack') {
        const w = p < 0.3 ? ease(p / 0.3) : p < 0.6 ? 1 : 1 - ease((p - 0.6) / 0.4);
        const lunge = p < 0.3 ? 0 : p < 0.6 ? ease((p - 0.3) / 0.3) : 1 - ease((p - 0.6) / 0.4);
        bodyPitch += -0.1 * w + 0.18 * lunge;
        bodyY += 0.1 * w;
        headPitch += -0.15 * w + 0.1 * lunge;
        for (const i of [0, 1, 7]) {
          const ap = armPose[i];
          ap.lift += 0.5 * w - 0.1 * lunge;
          for (let j = 0; j < ARM_SEGS; j++) ap.curl[j] += (-0.35 * w + 0.3 * lunge) * (0.5 + j / ARM_SEGS);
        }
      } else if (act === 'fire') {
        const aim = p < 0.4 ? ease(p / 0.4) : 1;
        const kick = p > 0.5 && p < 0.7 ? Math.sin((p - 0.5) / 0.2 * Math.PI) : 0;
        bodyY -= 0.12 * aim;
        bodyPitch += 0.12 * aim - 0.1 * kick;
        mantlePitch += -0.2 * aim - 0.25 * kick;
        headPitch += 0.1 * aim;
        for (let i = 0; i < 8; i++) for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] += 0.1 * aim;
      } else if (act === 'hit') {
        const k = Math.sin(Math.min(p * 3, 1) * Math.PI);
        bodyPitch += -0.2 * k;
        bodyY -= 0.12 * k;
        headPitch += -0.3 * k;
        for (let i = 0; i < 8; i++) { armPose[i].lift += 0.2 * k; for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] += 0.2 * k; }
      } else if (act === 'block') {
        const b = ease(Math.min(p * 2, 1)) * (p > 0.7 ? 1 - ease((p - 0.7) / 0.3) : 1);
        bodyY -= 0.28 * b;
        bodyPitch += 0.15 * b;
        headPitch += 0.35 * b;
        for (let i = 0; i < 8; i++) {
          const ap = armPose[i];
          const frontness = Math.cos(armAngles[i]);
          ap.yaw += frontness * 0.2 * b;
          ap.lift += 0.3 * b * Math.max(0, frontness);
          for (let j = 0; j < ARM_SEGS; j++) ap.curl[j] += 0.35 * b * (0.5 + j / ARM_SEGS);
        }
      } else if (act === 'gather' || act === 'deposit') {
        const down = act === 'gather'
          ? (p < 0.35 ? ease(p / 0.35) : p < 0.65 ? 1 : 1 - ease((p - 0.65) / 0.35))
          : (p < 0.45 ? ease(p / 0.45) : p < 0.7 ? 1 : 1 - ease((p - 0.7) / 0.3));
        bodyY -= 0.4 * down;
        bodyPitch += 0.25 * down;
        headPitch += 0.5 * down;
        const grab = p > 0.35 && p < 0.65 ? Math.sin(((p - 0.35) / 0.3) * Math.PI) : 0;
        for (const i of [0, 1, 7]) {
          const ap = armPose[i];
          ap.lift -= 0.4 * down;
          for (let j = 0; j < ARM_SEGS; j++) ap.curl[j] += -0.2 * down + 0.3 * grab * (j / ARM_SEGS);
        }
      } else if (act === 'eat') {
        const down = p < 0.2 ? ease(p / 0.2) : p > 0.85 ? 1 - ease((p - 0.85) / 0.15) : 1;
        bodyY -= 0.35 * down;
        headPitch += 0.55 * down;
        const chew = down * Math.max(0, Math.sin(p * Math.PI * 6)) * 0.12;
        jawOpen = 0.15 + chew;
        for (const i of [1, 7]) for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] += 0.15 * down * (j / ARM_SEGS) + chew * 0.3;
      } else if (act === 'drink') {
        const down = p < 0.3 ? ease(p / 0.3) : p > 0.75 ? 1 - ease((p - 0.75) / 0.25) : 1;
        bodyY -= 0.42 * down;
        bodyPitch += 0.2 * down;
        headPitch += 0.6 * down;
        jawOpen = 0.08 * down + Math.sin(t * 2.2) * 0.03 * down;
      } else if (act === 'jump') {
        if (p < 0.33) {
          const c = ease(p / 0.33);
          bodyY -= 0.35 * c;
          bodyPitch += 0.15 * c;
          for (let i = 0; i < 8; i++) for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] += 0.25 * c;
        } else {
          const e = ease((p - 0.33) / 0.67);
          bodyY += 0.3 * e;
          bodyPitch += -0.25 * e;
          for (let i = 0; i < 8; i++) { armPose[i].lift -= 0.2 * e; for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] -= 0.3 * e * (1 - j / ARM_SEGS); }
        }
      } else if (act === 'land') {
        const c = Math.sin(Math.min(p * 1.5, 1) * Math.PI);
        bodyY -= 0.3 * c;
        bodyPitch += 0.18 * c;
        headPitch += 0.2 * c;
        for (let i = 0; i < 8; i++) for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] += 0.3 * c * (1 - j / ARM_SEGS * 0.5);
      } else if (act === 'signal') {
        const up = p < 0.3 ? ease(p / 0.3) : p > 0.7 ? 1 - ease((p - 0.7) / 0.3) : 1;
        bodyY += 0.25 * up;
        bodyPitch += -0.2 * up;
        headPitch += -0.3 * up;
        mantlePitch += -0.15 * up;
        jawOpen = 0.4 * up;
        for (let i = 0; i < 8; i++) {
          armPose[i].lift += 0.55 * up;
          armPose[i].spread += 0.15 * up;
          for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] -= 0.25 * up;
        }
      } else if (act === 'sleep') {
        const d = ease(Math.min(p * 1.4, 1));
        bodyY -= 0.55 * d;
        bodyPitch += 0.1 * d;
        headPitch += 0.4 * d;
        mantlePitch += 0.1 * d;
        for (let i = 0; i < 8; i++) {
          armPose[i].lift -= 0.3 * d;
          for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] += 0.45 * d * (0.3 + j / ARM_SEGS);
        }
      } else if (act === 'wake') {
        const u = ease(p);
        bodyY -= 0.55 * (1 - u);
        headPitch += 0.4 * (1 - u) - 0.1 * Math.sin(u * Math.PI);
        for (let i = 0; i < 8; i++) {
          armPose[i].lift -= 0.3 * (1 - u);
          for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] += 0.45 * (1 - u) * (0.3 + j / ARM_SEGS);
        }
      } else if (act === 'die') {
        const d = ease(Math.min(p * 1.2, 1));
        bodyY -= 0.7 * d;
        bodyRoll += 0.5 * d;
        bodyPitch += 0.2 * d;
        headPitch += 0.5 * d;
        headRoll += 0.3 * d;
        jawOpen = 0.3 * d;
        for (let i = 0; i < 8; i++) {
          const dsign = i % 2 ? 1 : -1;
          armPose[i].spread += dsign * 0.2 * d;
          armPose[i].lift -= 0.35 * d;
          for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] += dsign * 0.15 * d * (j / ARM_SEGS) + 0.1 * d;
        }
      } else if (act === 'evolve') {
        const brace = p < 0.25 ? ease(p / 0.25) : p > 0.75 ? 1 - ease((p - 0.75) / 0.25) : 1;
        const open = p > 0.3 && p < 0.7 ? Math.sin(((p - 0.3) / 0.4) * Math.PI) : 0;
        bodyY -= 0.1 * brace;
        mantlePitch += -0.3 * open;
        headPitch += -0.15 * open;
        jawOpen = 0.35 * open;
        for (let i = 0; i < 8; i++) {
          armPose[i].spread += 0.2 * open;
          armPose[i].lift += 0.15 * open;
          for (let j = 0; j < ARM_SEGS; j++) armPose[i].curl[j] -= 0.12 * open;
        }
      }
    }

    body.position.y = bodyY;
    body.rotation.set(bodyPitch, 0, bodyRoll);
    head.rotation.set(headPitch, headYaw, headRoll);
    mantle.rotation.x = mantlePitch;
    jawLower.rotation.x = jawOpen;

    for (let i = 0; i < 8; i++) {
      const arm = arms[i];
      const ap = armPose[i];
      arm.root.rotation.x = ap.lift;
      arm.root.rotation.y = armAngles[i] + ap.yaw;
      arm.root.rotation.z = ap.spread;
      for (let j = 0; j < ARM_SEGS; j++) arm.segs[j].rotation.x = ap.curl[j];
    }
  };

  root.userData.update = (t, dt) => {};

  return root;
}