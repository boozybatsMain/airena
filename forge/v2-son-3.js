function build(THREE, TSL) {
  const deg = THREE.MathUtils.degToRad;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

  const octopus = new THREE.Group();
  octopus.name = 'ArmouredOctopus';

  // ---------- materials ----------
  const fleshMat = new THREE.MeshStandardMaterial({ color: 0x2c4258, roughness: 0.62, metalness: 0.06 });
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x8b93a0, roughness: 0.32, metalness: 0.85 });
  const armorTrimMat = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.4, metalness: 0.7 });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0x191c1f, roughness: 0.5, metalness: 0.15 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x070a0b, roughness: 0.25, metalness: 0.1 });

  const glow = TSL.uniform(0.15);
  eyeMat.emissiveNode = TSL.vec3(0.2, 1.0, 0.6).mul(glow);

  const rim = TSL.pow(
    TSL.oneMinus(TSL.max(TSL.dot(TSL.normalWorld, TSL.normalize(TSL.cameraPosition.sub(TSL.positionWorld))), 0.0)),
    2.5
  );
  armorMat.emissiveNode = TSL.vec3(0.55, 0.6, 0.65).mul(rim).mul(0.5);

  // ---------- mantle (head/body) ----------
  const MANTLE_REST_Y = 1.25;
  const mantle = new THREE.Group();
  mantle.name = 'Mantle';
  mantle.position.set(0, MANTLE_REST_Y, 0);
  octopus.add(mantle);

  const hull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), fleshMat);
  hull.name = 'MantleHull';
  hull.scale.set(1.0, 0.82, 1.15);
  hull.position.set(0, 0, 0.02);
  mantle.add(hull);

  // crown plate group with spikes
  const plateCrown = new THREE.Group();
  plateCrown.name = 'PlateCrown';
  plateCrown.position.set(0, 0.34, 0.02);
  mantle.add(plateCrown);
  const crownBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.62), armorMat);
  crownBase.name = 'PlateCrownBase';
  plateCrown.add(crownBase);
  for (let k = 0; k < 3; k++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), armorTrimMat);
    spike.name = 'PlateCrownSpike' + k;
    spike.position.set(0, 0.1, -0.2 + k * 0.2);
    plateCrown.add(spike);
  }

  const plateBrowLeft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), armorMat);
  plateBrowLeft.name = 'PlateBrowLeft';
  plateBrowLeft.position.set(-0.24, 0.2, 0.34);
  mantle.add(plateBrowLeft);

  const plateBrowRight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), armorMat);
  plateBrowRight.name = 'PlateBrowRight';
  plateBrowRight.position.set(0.24, 0.2, 0.34);
  mantle.add(plateBrowRight);

  const plateCheekLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.32), armorMat);
  plateCheekLeft.name = 'PlateCheekLeft';
  plateCheekLeft.position.set(-0.34, -0.02, 0.02);
  mantle.add(plateCheekLeft);

  const plateCheekRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.32), armorMat);
  plateCheekRight.name = 'PlateCheekRight';
  plateCheekRight.position.set(0.34, -0.02, 0.02);
  mantle.add(plateCheekRight);

  const plateSpineBack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.22), armorTrimMat);
  plateSpineBack.name = 'PlateSpineBack';
  plateSpineBack.position.set(0, 0.3, -0.28);
  mantle.add(plateSpineBack);

  const evolvePlates = [
    { obj: plateCrown, base: plateCrown.position.clone(), dir: new THREE.Vector3(0, 1, 0) },
    { obj: plateBrowLeft, base: plateBrowLeft.position.clone(), dir: new THREE.Vector3(-0.5, 0.6, 0.4) },
    { obj: plateBrowRight, base: plateBrowRight.position.clone(), dir: new THREE.Vector3(0.5, 0.6, 0.4) },
    { obj: plateCheekLeft, base: plateCheekLeft.position.clone(), dir: new THREE.Vector3(-1, 0, 0) },
    { obj: plateCheekRight, base: plateCheekRight.position.clone(), dir: new THREE.Vector3(1, 0, 0) },
    { obj: plateSpineBack, base: plateSpineBack.position.clone(), dir: new THREE.Vector3(0, 0.4, -0.7) },
  ];

  const eyeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), eyeMat);
  eyeLeft.name = 'EyeLeft';
  eyeLeft.position.set(-0.2, 0.1, 0.42);
  mantle.add(eyeLeft);

  const eyeRight = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), eyeMat);
  eyeRight.name = 'EyeRight';
  eyeRight.position.set(0.2, 0.1, 0.42);
  mantle.add(eyeRight);

  const beak = new THREE.Group();
  beak.name = 'Beak';
  beak.position.set(0, -0.26, 0.42);
  mantle.add(beak);
  const beakUpper = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), beakMat);
  beakUpper.name = 'BeakUpper';
  beakUpper.rotation.x = deg(100);
  beakUpper.position.set(0, 0.03, 0.02);
  beak.add(beakUpper);
  const beakLower = new THREE.Group();
  beakLower.name = 'BeakLower';
  beak.add(beakLower);
  const beakLowerMesh = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.15, 4), beakMat);
  beakLowerMesh.name = 'BeakLowerJaw';
  beakLowerMesh.rotation.x = deg(-95);
  beakLowerMesh.position.set(0, -0.02, 0.02);
  beakLower.add(beakLowerMesh);

  const SIPHON_REST_X = deg(18);
  const siphon = new THREE.Group();
  siphon.name = 'Siphon';
  siphon.position.set(0, -0.05, -0.46);
  siphon.rotation.x = SIPHON_REST_X;
  mantle.add(siphon);
  const siphonLen = 0.22;
  const siphonTube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, siphonLen, 8), armorTrimMat);
  siphonTube.name = 'SiphonTube';
  siphonTube.rotation.x = Math.PI / 2;
  siphonTube.position.set(0, 0, -siphonLen / 2);
  siphon.add(siphonTube);

  // ---------- tentacles ----------
  const restTiltX = deg(60);
  const BASE_R = 0.44;
  const BASE_Y = -0.22;
  const SEG = [
    { L: 0.40, Rt: 0.115, Rb: 0.095 },
    { L: 0.32, Rt: 0.090, Rb: 0.065 },
    { L: 0.24, Rt: 0.060, Rb: 0.038 },
    { L: 0.16, Rt: 0.034, Rb: 0.016 },
  ];

  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const dirX = Math.sin(angle);
    const dirZ = Math.cos(angle);

    const root = new THREE.Group();
    root.name = 'Tentacle' + i;
    root.position.set(dirX * BASE_R, BASE_Y, dirZ * BASE_R);
    root.rotation.order = 'XYZ';
    root.rotation.set(restTiltX, angle, 0);
    mantle.add(root);

    const m0 = new THREE.Mesh(new THREE.CylinderGeometry(SEG[0].Rt, SEG[0].Rb, SEG[0].L, 8), fleshMat);
    m0.name = 'Tentacle' + i + 'Shell0';
    m0.position.set(0, -SEG[0].L / 2, 0);
    root.add(m0);
    const ring0 = new THREE.Mesh(new THREE.TorusGeometry(SEG[0].Rt * 1.25, SEG[0].Rt * 0.4, 6, 10), armorMat);
    ring0.name = 'Tentacle' + i + 'Armor0';
    ring0.rotation.x = Math.PI / 2;
    ring0.position.set(0, -SEG[0].L * 0.12, 0);
    root.add(ring0);

    const seg1 = new THREE.Group();
    seg1.name = 'Tentacle' + i + 'Seg1';
    seg1.position.set(0, -SEG[0].L, 0);
    root.add(seg1);
    const m1 = new THREE.Mesh(new THREE.CylinderGeometry(SEG[1].Rt, SEG[1].Rb, SEG[1].L, 8), fleshMat);
    m1.name = 'Tentacle' + i + 'Shell1';
    m1.position.set(0, -SEG[1].L / 2, 0);
    seg1.add(m1);
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(SEG[1].Rt * 1.25, SEG[1].Rt * 0.4, 6, 10), armorMat);
    ring1.name = 'Tentacle' + i + 'Armor1';
    ring1.rotation.x = Math.PI / 2;
    ring1.position.set(0, -SEG[1].L * 0.15, 0);
    seg1.add(ring1);

    const seg2 = new THREE.Group();
    seg2.name = 'Tentacle' + i + 'Seg2';
    seg2.position.set(0, -SEG[1].L, 0);
    seg1.add(seg2);
    const m2 = new THREE.Mesh(new THREE.CylinderGeometry(SEG[2].Rt, SEG[2].Rb, SEG[2].L, 7), fleshMat);
    m2.name = 'Tentacle' + i + 'Shell2';
    m2.position.set(0, -SEG[2].L / 2, 0);
    seg2.add(m2);

    const seg3 = new THREE.Group();
    seg3.name = 'Tentacle' + i + 'Seg3';
    seg3.position.set(0, -SEG[2].L, 0);
    seg2.add(seg3);
    const m3 = new THREE.Mesh(new THREE.CylinderGeometry(SEG[3].Rt, SEG[3].Rb, SEG[3].L, 6), fleshMat);
    m3.name = 'Tentacle' + i + 'Shell3';
    m3.position.set(0, -SEG[3].L / 2, 0);
    seg3.add(m3);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(SEG[3].Rb * 1.3, SEG[3].L * 0.6, 6), armorTrimMat);
    spike.name = 'Tentacle' + i + 'Spike';
    spike.position.set(0, -SEG[3].L - SEG[3].L * 0.25, 0);
    seg3.add(spike);

    tentacles.push({ root, seg1, seg2, seg3, angle, dirX, dirZ });
  }

  function setTentacle(i, yaw, pitch, c1, c2, c3, spread) {
    const T = tentacles[i];
    T.root.rotation.set(restTiltX + pitch, T.angle + yaw, spread || 0);
    T.seg1.rotation.set(c1, 0, 0);
    T.seg2.rotation.set(c2, 0, 0);
    T.seg3.rotation.set(c3, 0, 0);
  }

  const GAIT_SAMPLES = [0, 0.5, 1, 2, 3, 6];
  const GAIT_PARAMS = {
    0: { bodyY: 0.00, pitch: 0.00, reach: 0.10, lift: 0.04, curl: 0.16, swing: 0.0, spread: 0.05 },
    0.5: { bodyY: -0.07, pitch: 0.03, reach: 0.24, lift: 0.11, curl: 0.36, swing: 0.5, spread: -0.05 },
    1: { bodyY: -0.02, pitch: 0.01, reach: 0.42, lift: 0.15, curl: 0.22, swing: 0.38, spread: 0.08 },
    2: { bodyY: 0.02, pitch: -0.02, reach: 0.62, lift: 0.24, curl: 0.16, swing: 0.34, spread: 0.10 },
    3: { bodyY: 0.05, pitch: -0.06, reach: 0.80, lift: 0.32, curl: 0.12, swing: 0.30, spread: 0.12 },
    6: { bodyY: 0.08, pitch: -0.17, reach: 1.05, lift: 0.42, curl: 0.08, swing: 0.26, spread: 0.16 },
  };
  function gaitParams(speedIn) {
    const sp = Math.max(0, speedIn || 0);
    if (sp <= 0) return GAIT_PARAMS[0];
    if (sp >= 6) return GAIT_PARAMS[6];
    let a = 0, b = 6;
    for (let k = 0; k < GAIT_SAMPLES.length - 1; k++) {
      if (sp >= GAIT_SAMPLES[k] && sp <= GAIT_SAMPLES[k + 1]) { a = GAIT_SAMPLES[k]; b = GAIT_SAMPLES[k + 1]; break; }
    }
    const pa = GAIT_PARAMS[a], pb = GAIT_PARAMS[b];
    const t = (sp - a) / (b - a);
    const out = {};
    for (const key in pa) out[key] = lerp(pa[key], pb[key], t);
    return out;
  }

  const HURT_LIMB = 3;

  octopus.userData.pose = (s) => {
    const t = s.t || 0;
    const turn = s.turn || 0;
    const gp = gaitParams(s.speed || 0);

    // ---- 1. neutral baseline, written every call ----
    mantle.position.set(0, MANTLE_REST_Y, 0);
    mantle.rotation.set(0, 0, 0);
    mantle.scale.set(1, 1, 1);
    for (let i = 0; i < 8; i++) setTentacle(i, 0, 0, 0.16, 0.20, 0.24, 0.05);
    beakLower.rotation.set(0, 0, 0);
    siphon.rotation.set(SIPHON_REST_X, 0, 0);
    eyeLeft.scale.set(1, 1, 1);
    eyeRight.scale.set(1, 1, 1);
    for (const pd of evolvePlates) pd.obj.position.copy(pd.base);
    let glowTarget = 0.15 + 0.05 * Math.sin(t * 2);

    // ---- 2. branch ----
    if (s.action) {
      const p = clamp01(s.phase || 0);

      if (s.action === 'attack') {
        if (p < 0.3) {
          const u = ease(p / 0.3);
          mantle.rotation.x = -u * 0.10;
          for (const idx of [0, 1, 7]) {
            const m = idx === 0 ? 1 : 0.8;
            setTentacle(idx, -u * 0.7 * m, u * 0.15, lerp(0.16, 0.55, u), lerp(0.20, 0.65, u), lerp(0.24, 0.75, u), 0.02);
          }
        } else if (p < 0.55) {
          const u = ease((p - 0.3) / 0.25);
          mantle.rotation.x = lerp(-0.10, 0.09, u);
          for (const idx of [0, 1, 7]) {
            const m = idx === 0 ? 1 : 0.8;
            setTentacle(idx, lerp(-0.7, 0.9, u) * m, lerp(0.15, -0.05, u), lerp(0.55, 0.06, u), lerp(0.65, 0.05, u), lerp(0.75, 0.05, u), 0.02);
          }
          beakLower.rotation.x = u > 0.7 ? 0.45 : 0;
        } else {
          const u = ease((p - 0.55) / 0.45);
          mantle.rotation.x = lerp(0.09, 0, u);
          for (const idx of [0, 1, 7]) {
            const m = idx === 0 ? 1 : 0.8;
            setTentacle(idx, lerp(0.9, 0, u) * m, 0, lerp(0.06, 0.16, u), lerp(0.05, 0.20, u), lerp(0.05, 0.24, u), lerp(0.02, 0.05, u));
          }
          beakLower.rotation.x = lerp(0.45, 0, u);
        }
        glowTarget = 0.15;

      } else if (s.action === 'fire') {
        if (p < 0.35) {
          const u = ease(p / 0.35);
          siphon.rotation.x = SIPHON_REST_X + u * 0.5;
          mantle.position.y = MANTLE_REST_Y - u * 0.05;
          mantle.scale.set(1 - u * 0.04, 1 + u * 0.05, 1 - u * 0.04);
        } else if (p < 0.55) {
          const u = ease((p - 0.35) / 0.2);
          siphon.rotation.x = SIPHON_REST_X + 0.5 + u * 0.15;
          mantle.position.z = -u * 0.12;
          mantle.position.y = MANTLE_REST_Y - 0.05 + u * 0.02;
          mantle.scale.set(1 + u * 0.06, 1 - u * 0.05, 1 + u * 0.02);
        } else {
          const u = ease((p - 0.55) / 0.45);
          siphon.rotation.x = lerp(SIPHON_REST_X + 0.65, SIPHON_REST_X, u);
          mantle.position.z = lerp(-0.12, 0, u);
          mantle.position.y = lerp(MANTLE_REST_Y - 0.03, MANTLE_REST_Y, u);
          mantle.scale.set(lerp(1.06, 1, u), lerp(0.95, 1, u), lerp(1.02, 1, u));
        }
        glowTarget = 0.5;

      } else if (s.action === 'hit') {
        const imp = Math.exp(-p * 10);
        mantle.position.x = -imp * 0.14;
        mantle.rotation.z = imp * 0.26;
        mantle.rotation.y = -imp * 0.10;
        for (let i = 0; i < 8; i++) {
          const dx = tentacles[i].dirX;
          setTentacle(i, -imp * 0.05 * Math.sign(dx || 1), imp * 0.15, 0.16 + imp * 0.22, 0.20 + imp * 0.26, 0.24 + imp * 0.30, 0.05);
        }
        glowTarget = 0.6 * imp + 0.1;

      } else if (s.action === 'block') {
        const e = ease(Math.min(p * 3, 1));
        mantle.position.y = MANTLE_REST_Y - e * 0.16;
        mantle.position.z = -e * 0.06;
        mantle.rotation.x = e * 0.28;
        for (let i = 0; i < 8; i++) {
          const T = tentacles[i];
          const front = Math.max(0, T.dirZ);
          const g = e * (0.4 + front * 0.5);
          setTentacle(i, T.dirX * e * -0.15 * front, lerp(0, 0.5, g), lerp(0.16, 0.55, g), lerp(0.20, 0.72, g), lerp(0.24, 0.88, g), lerp(0.05, -0.08, g));
        }
        glowTarget = 0.1;

      } else if (s.action === 'gather') {
        if (p < 0.4) {
          const u = ease(p / 0.4);
          setTentacle(0, u * 0.85, u * 0.65, lerp(0.16, 0.28, u), lerp(0.20, 0.32, u), lerp(0.24, 0.34, u), 0);
          mantle.rotation.x = u * 0.14;
          mantle.position.y = MANTLE_REST_Y - u * 0.08;
        } else if (p < 0.7) {
          const u = ease((p - 0.4) / 0.3);
          setTentacle(0, 0.85, 0.65, lerp(0.28, 0.95, u), lerp(0.32, 1.05, u), lerp(0.34, 1.15, u), 0);
          mantle.rotation.x = 0.14;
          mantle.position.y = MANTLE_REST_Y - 0.08;
        } else {
          const u = ease((p - 0.7) / 0.3);
          setTentacle(0, lerp(0.85, 0.18, u), lerp(0.65, 0.15, u), lerp(0.95, 0.5, u), lerp(1.05, 0.58, u), lerp(1.15, 0.65, u), 0);
          mantle.rotation.x = lerp(0.14, 0.02, u);
          mantle.position.y = lerp(MANTLE_REST_Y - 0.08, MANTLE_REST_Y - 0.01, u);
        }
        glowTarget = 0.12;

      } else if (s.action === 'deposit') {
        if (p < 0.3) {
          const u = ease(p / 0.3);
          setTentacle(0, lerp(0.18, 0.5, u), lerp(0.15, 0.4, u), lerp(0.5, 0.75, u), lerp(0.58, 0.85, u), lerp(0.65, 0.95, u), 0);
          mantle.rotation.x = lerp(0.02, 0.08, u);
        } else if (p < 0.75) {
          const u = ease((p - 0.3) / 0.45);
          setTentacle(0, lerp(0.5, 0.9, u), lerp(0.4, 0.62, u), lerp(0.75, 0.7, u), lerp(0.85, 0.75, u), lerp(0.95, 0.8, u), 0);
          mantle.rotation.x = lerp(0.08, 0.16, u);
          mantle.position.y = MANTLE_REST_Y - u * 0.09;
        } else {
          const u = ease((p - 0.75) / 0.25);
          setTentacle(0, lerp(0.9, 0.15, u), lerp(0.62, 0.1, u), lerp(0.7, 0.16, u), lerp(0.75, 0.20, u), lerp(0.8, 0.24, u), 0);
          mantle.rotation.x = lerp(0.16, 0, u);
          mantle.position.y = lerp(MANTLE_REST_Y - 0.09, MANTLE_REST_Y, u);
        }
        glowTarget = 0.12;

      } else if (s.action === 'eat') {
        const dip = ease(Math.min(p / 0.15, 1)) * (1 - ease(Math.max(0, (p - 0.88) / 0.12)));
        mantle.position.y = MANTLE_REST_Y - dip * 0.32;
        mantle.rotation.x = dip * 0.34;
        const chew = 0.5 + 0.5 * Math.sin(p * Math.PI * 2 * 2.5);
        beakLower.rotation.x = dip * (0.12 + chew * 0.34);
        for (const idx of [0, 1, 7]) {
          setTentacle(idx, tentacles[idx].dirX * -0.05, dip * 0.55, lerp(0.16, 0.45, dip), lerp(0.20, 0.55, dip), lerp(0.24, 0.62, dip), 0.03);
        }
        glowTarget = 0.12;

      } else if (s.action === 'drink') {
        const dip = ease(Math.min(p / 0.25, 1)) * (1 - ease(Math.max(0, (p - 0.78) / 0.22)));
        mantle.position.y = MANTLE_REST_Y - dip * 0.38;
        mantle.rotation.x = dip * 0.4;
        beakLower.rotation.x = dip * 0.06;
        glowTarget = 0.1;

      } else if (s.action === 'jump') {
        if (p < 0.33) {
          const u = ease(p / 0.33);
          mantle.position.y = MANTLE_REST_Y - u * 0.20;
          for (let i = 0; i < 8; i++) setTentacle(i, 0, lerp(0, 0.35, u), lerp(0.16, 0.5, u), lerp(0.20, 0.62, u), lerp(0.24, 0.72, u), lerp(0.05, -0.06, u));
        } else {
          const u = ease((p - 0.33) / 0.67);
          mantle.position.y = lerp(MANTLE_REST_Y - 0.20, MANTLE_REST_Y + 0.30, u);
          for (let i = 0; i < 8; i++) setTentacle(i, lerp(0, -0.28, u), lerp(0.35, -0.15, u), lerp(0.5, 0.10, u), lerp(0.62, 0.14, u), lerp(0.72, 0.18, u), lerp(-0.06, 0.08, u));
        }
        glowTarget = 0.15;

      } else if (s.action === 'land') {
        if (p < 0.35) {
          const u = ease(p / 0.35);
          mantle.position.y = MANTLE_REST_Y + lerp(0.22, 0.05, u);
          for (let i = 0; i < 8; i++) setTentacle(i, lerp(-0.2, 0.05, u), lerp(-0.1, 0.25, u), lerp(0.10, 0.20, u), lerp(0.14, 0.26, u), lerp(0.18, 0.32, u), 0.04);
        } else if (p < 0.62) {
          const u = ease((p - 0.35) / 0.27);
          mantle.position.y = lerp(MANTLE_REST_Y + 0.05, MANTLE_REST_Y - 0.26, u);
          for (let i = 0; i < 8; i++) setTentacle(i, lerp(0.05, 0, u), lerp(0.25, 0.5, u), lerp(0.20, 0.62, u), lerp(0.26, 0.78, u), lerp(0.32, 0.9, u), lerp(0.04, -0.08, u));
        } else {
          const u = ease((p - 0.62) / 0.38);
          mantle.position.y = lerp(MANTLE_REST_Y - 0.26, MANTLE_REST_Y, u);
          for (let i = 0; i < 8; i++) setTentacle(i, 0, lerp(0.5, 0, u), lerp(0.62, 0.16, u), lerp(0.78, 0.20, u), lerp(0.9, 0.24, u), lerp(-0.08, 0.05, u));
        }
        glowTarget = 0.12;

      } else if (s.action === 'signal') {
        const rise = ease(clamp01((p - 0.1) / 0.3)) * (1 - ease(clamp01((p - 0.75) / 0.25)));
        mantle.position.y = MANTLE_REST_Y + rise * 0.22;
        mantle.rotation.x = -rise * 0.12;
        for (let i = 0; i < 8; i++) setTentacle(i, tentacles[i].dirX * rise * 0.15, -rise * 0.55, lerp(0.16, 0.08, rise), lerp(0.20, 0.12, rise), lerp(0.24, 0.15, rise), 0.05 + rise * 0.4);
        beakLower.rotation.x = rise * 0.7;
        glowTarget = 0.25 + rise * 0.9;

      } else if (s.action === 'sleep') {
        const e2 = ease(p);
        mantle.position.y = MANTLE_REST_Y - e2 * 1.05;
        mantle.rotation.x = e2 * 0.22;
        for (let i = 0; i < 8; i++) setTentacle(i, 0, lerp(0, 0.6, e2), lerp(0.16, 0.68, e2), lerp(0.20, 0.85, e2), lerp(0.24, 0.95, e2), lerp(0.05, -0.08, e2));
        eyeLeft.scale.y = lerp(1, 0.06, e2);
        eyeRight.scale.y = lerp(1, 0.06, e2);
        glowTarget = lerp(0.15, 0.02, e2);

      } else if (s.action === 'wake') {
        const e3 = 1 - ease(p);
        mantle.position.y = MANTLE_REST_Y - e3 * 1.05;
        mantle.rotation.x = e3 * 0.22;
        for (let i = 0; i < 8; i++) setTentacle(i, 0, lerp(0, 0.6, e3), lerp(0.16, 0.68, e3), lerp(0.20, 0.85, e3), lerp(0.24, 0.95, e3), lerp(0.05, -0.08, e3));
        eyeLeft.scale.y = lerp(1, 0.06, e3);
        eyeRight.scale.y = lerp(1, 0.06, e3);
        glowTarget = lerp(0.15, 0.02, e3);

      } else if (s.action === 'die') {
        const de = ease(Math.min(p * 1.15, 1));
        mantle.position.y = MANTLE_REST_Y - de * (MANTLE_REST_Y - 0.12);
        mantle.rotation.z = de * 1.35;
        mantle.rotation.x = de * 0.45;
        for (let i = 0; i < 8; i++) {
          const dx = tentacles[i].dirX;
          setTentacle(i, dx * 0.35 * de, 0.75 * de, lerp(0.16, 0.6, de), lerp(0.20, 0.82, de), lerp(0.24, 0.95, de), lerp(0.05, -0.12, de));
        }
        beakLower.rotation.x = de * 0.3;
        eyeLeft.scale.y = lerp(1, 0.15, de);
        eyeRight.scale.y = lerp(1, 0.15, de);
        glowTarget = lerp(0.15, 0.0, de);

      } else if (s.action === 'evolve') {
        const brace = ease(Math.min(p / 0.15, 1)) * (1 - ease(clamp01((p - 0.15) / 0.05)));
        const openR = ease(clamp01((p - 0.15) / 0.35)) * (1 - ease(clamp01((p - 0.78) / 0.22)));
        mantle.position.y = MANTLE_REST_Y - brace * 0.08 + openR * 0.16;
        mantle.rotation.x = -openR * 0.05;
        for (const pd of evolvePlates) pd.obj.position.copy(pd.base).addScaledVector(pd.dir, openR * 0.16);
        for (let i = 0; i < 8; i++) setTentacle(i, tentacles[i].dirX * openR * 0.4, -openR * 0.3, lerp(0.16, 0.06, openR), lerp(0.20, 0.08, openR), lerp(0.24, 0.10, openR), 0.05 + openR * 0.3);
        glowTarget = 0.15 + openR * 1.1;
      }

    } else if (s.grounded === false) {
      for (let i = 0; i < 8; i++) {
        const wave = Math.sin(t * 2.2 + i * 0.9) * 0.06;
        setTentacle(i, -0.18 + wave, 0.35 + Math.sin(t * 1.7 + i) * 0.05, 0.15, 0.22, 0.3, gp.spread * 0.5);
      }
      mantle.position.set(0, MANTLE_REST_Y + 0.05, 0);
      mantle.rotation.set(-0.08 + Math.sin(t * 1.3) * 0.03, turn * 0.08, turn * -0.1 + Math.sin(t * 0.9) * 0.03);
      glowTarget = 0.15;

    } else {
      for (let i = 0; i < 8; i++) {
        const T = tentacles[i];
        const phaseI = ((s.stride + i / 8) % 1 + 1) % 1;
        let yaw, pitch, c1, c2, c3;
        if (gp.swing <= 0.001) {
          const idle = Math.sin(t * 1.2 + i * 0.85);
          yaw = idle * 0.03;
          pitch = 0.015 * Math.sin(t * 1.0 + i * 0.6);
          c1 = gp.curl * 0.55 + idle * 0.02;
          c2 = gp.curl * 0.75;
          c3 = gp.curl * 0.9;
        } else if (phaseI < gp.swing) {
          const u = phaseI / gp.swing;
          const e = ease(u);
          const arc = Math.sin(u * Math.PI);
          yaw = lerp(-gp.reach, gp.reach, e);
          pitch = -arc * gp.lift * 1.6;
          c1 = gp.curl * 0.5 + arc * gp.lift * 1.1;
          c2 = gp.curl * 0.7 + arc * gp.lift * 1.4;
          c3 = gp.curl * 0.9 + arc * gp.lift * 1.7;
        } else {
          const v = (phaseI - gp.swing) / (1 - gp.swing);
          yaw = lerp(gp.reach, -gp.reach, v);
          pitch = 0.02 + gp.lift * 0.05;
          c1 = gp.curl * 0.45;
          c2 = gp.curl * 0.55;
          c3 = gp.curl * 0.65;
        }
        const inside = T.dirX * turn;
        const insideAmt = Math.max(0, inside);
        const outsideAmt = Math.max(0, -inside);
        yaw *= (1 - insideAmt * 0.45 + outsideAmt * 0.25);
        c1 += insideAmt * 0.30; c2 += insideAmt * 0.36; c3 += insideAmt * 0.42;
        setTentacle(i, yaw + turn * 0.03, pitch, c1, c2, c3, gp.spread + turn * T.dirX * -0.05);
      }
      const bob = gp.swing <= 0.001 ? Math.sin(t * 1.6) * 0.012 : 0;
      mantle.position.set(0, MANTLE_REST_Y + gp.bodyY + bob, 0);
      mantle.rotation.set(gp.pitch, turn * 0.12, turn * -0.16);
      glowTarget = 0.15;
    }

    // ---- 3. hurt overlay (skip during death, which owns its own collapse) ----
    if (s.action !== 'die') {
      const hurtAmt = clamp01(1 - (s.health === undefined ? 1 : s.health));
      if (hurtAmt > 0.001) {
        mantle.rotation.x += hurtAmt * 0.12;
        mantle.rotation.z += hurtAmt * 0.20;
        mantle.position.y -= hurtAmt * 0.05;
        tentacles[HURT_LIMB].root.rotation.x += hurtAmt * 0.20;
        tentacles[HURT_LIMB].seg2.rotation.x += hurtAmt * 0.35;
        tentacles[HURT_LIMB].seg3.rotation.x += hurtAmt * 0.45;
        glowTarget *= (1 - hurtAmt * 0.6);
      }
    }

    glow.value = glowTarget;
  };

  return octopus;
}