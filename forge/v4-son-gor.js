function build(THREE, TSL) {
  const {
    vec3, float, positionLocal, positionWorld, normalWorld, cameraPosition,
    sin, dot, pow, clamp, mix, normalize
  } = TSL;

  // ---------------- materials ----------------
  function furMaterial(hex, rough, fuzz, rim) {
    const mat = new THREE.MeshStandardNodeMaterial();
    const base = new THREE.Color(hex);
    const p = positionLocal;
    const n = sin(p.x.mul(21.0).add(p.y.mul(13.0)))
      .mul(sin(p.z.mul(27.0).add(p.y.mul(9.0))))
      .mul(0.5).add(0.5);
    const varied = vec3(base.r, base.g, base.b).mul(float(1.0).sub(n.mul(fuzz)));
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const fres = pow(clamp(float(1.0).sub(dot(normalWorld, viewDir)), 0.0, 1.0), 2.2);
    mat.colorNode = mix(varied, vec3(1.0, 1.0, 1.0), fres.mul(rim));
    mat.roughnessNode = clamp(float(rough).sub(n.mul(0.18)), 0.15, 1.0);
    mat.metalnessNode = float(0.03);
    return mat;
  }

  const darkFur   = furMaterial(0x0e0c0a, 0.85, 0.10, 0.10);
  const silverFur = furMaterial(0x9a9690, 0.75, 0.08, 0.12);
  const skinMat   = furMaterial(0x1c1712, 0.55, 0.05, 0.18);
  const eyeMat    = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.3 });

  function addMesh(parent, geo, mat, pos, rot, name, scl) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function joint(parent, name, pos) {
    const j = new THREE.Object3D();
    j.name = name;
    j.position.set(pos[0], pos[1], pos[2]);
    parent.add(j);
    return j;
  }

  function limb(parent, len, rTop, rBot, mat, name, bulge) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, 9, 1);
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name;
    mesh.position.set(0, -len / 2, 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    if (bulge) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rTop * 1.05, 10, 8), mat);
      s.name = name + 'Bulge';
      s.castShadow = true; s.receiveShadow = true;
      parent.add(s);
    }
    return mesh;
  }

  const root = new THREE.Group();
  root.name = 'Gorilla';

  // ================= HIPS / PELVIS =================
  const HIP_HEIGHT = 0.66;
  const Hips = new THREE.Object3D();
  Hips.name = 'Hips';
  Hips.position.set(0, HIP_HEIGHT, -0.10);
  root.add(Hips);

  addMesh(Hips, new THREE.BoxGeometry(0.60, 0.40, 0.48), silverFur, [0, 0.02, -0.02], [0, 0, 0], 'PelvisMass');
  addMesh(Hips, new THREE.SphereGeometry(0.30, 14, 10), silverFur, [0, 0.06, 0.10], [0, 0, 0], 'HipBulge', [0.95, 0.85, 1.0]);
  const Belly = addMesh(Hips, new THREE.SphereGeometry(0.34, 14, 10), darkFur, [0, 0.16, 0.30], [0, 0, 0], 'Belly', [1.05, 0.95, 1.0]);

  // ================= SPINE / CHEST =================
  const SpineLower = joint(Hips, 'SpineLower', [0, 0.22, 0.14]);
  const Chest = joint(SpineLower, 'Chest', [0, 0.16, 0.32]);

  addMesh(Chest, new THREE.BoxGeometry(0.82, 0.58, 0.58), darkFur, [0, 0.10, 0.06], [0, 0, 0], 'ChestMass');
  addMesh(Chest, new THREE.SphereGeometry(0.30, 12, 10), silverFur, [0, -0.10, -0.10], [0, 0, 0], 'BackSaddle', [1.3, 0.7, 1.1]);
  addMesh(Chest, new THREE.SphereGeometry(0.24, 10, 8), darkFur, [-0.44, 0.16, 0.08], [0, 0, 0.3], 'LeftShoulderCap');
  addMesh(Chest, new THREE.SphereGeometry(0.24, 10, 8), darkFur, [0.44, 0.16, 0.08], [0, 0, -0.3], 'RightShoulderCap');

  const Neck = joint(Chest, 'Neck', [0, 0.30, 0.24]);
  addMesh(Neck, new THREE.CylinderGeometry(0.17, 0.20, 0.14, 10), darkFur, [0, 0.07, 0], [0, 0, 0], 'NeckMass');

  const Head = joint(Neck, 'Head', [0, 0.14, 0.02]);
  addMesh(Head, new THREE.SphereGeometry(0.21, 14, 12), darkFur, [0, 0.05, 0.02], [0, 0, 0], 'Skull', [1.0, 1.0, 0.95]);
  addMesh(Head, new THREE.ConeGeometry(0.09, 0.14, 8), darkFur, [0, 0.22, -0.02], [0, 0, 0], 'SagittalCrest');
  addMesh(Head, new THREE.BoxGeometry(0.30, 0.08, 0.10), darkFur, [0, 0.10, 0.18], [0.15, 0, 0], 'BrowRidge');
  addMesh(Head, new THREE.SphereGeometry(0.045, 8, 8), eyeMat, [-0.09, 0.09, 0.19], [0, 0, 0], 'LeftEyeball');
  addMesh(Head, new THREE.SphereGeometry(0.045, 8, 8), eyeMat, [0.09, 0.09, 0.19], [0, 0, 0], 'RightEyeball');
  addMesh(Head, new THREE.SphereGeometry(0.06, 8, 8), skinMat, [-0.20, 0.02, 0.0], [0, 0, 0], 'LeftEar');
  addMesh(Head, new THREE.SphereGeometry(0.06, 8, 8), skinMat, [0.20, 0.02, 0.0], [0, 0, 0], 'RightEar');
  addMesh(Head, new THREE.SphereGeometry(0.12, 10, 8), skinMat, [0, -0.05, 0.16], [0, 0, 0], 'Muzzle', [1.1, 0.8, 1.0]);

  const Jaw = joint(Head, 'Jaw', [0, -0.07, 0.10]);
  addMesh(Jaw, new THREE.BoxGeometry(0.17, 0.09, 0.16), skinMat, [0, -0.03, 0.03], [0, 0, 0], 'JawMass');

  // ================= ARMS =================
  function buildArm(side) {
    const sx = side === 'L' ? -1 : 1;
    const prefix = side === 'L' ? 'Left' : 'Right';
    const Shoulder = joint(Chest, prefix + 'Shoulder', [sx * 0.46, 0.14, 0.16]);
    limb(Shoulder, 0.46, 0.15, 0.135, darkFur, prefix + 'UpperArmMass', true);
    const Elbow = joint(Shoulder, prefix + 'Elbow', [0, -0.46, 0]);
    limb(Elbow, 0.40, 0.135, 0.10, darkFur, prefix + 'ForearmMass', true);
    const Wrist = joint(Elbow, prefix + 'Wrist', [0, -0.40, 0]);
    addMesh(Wrist, new THREE.BoxGeometry(0.16, 0.10, 0.24), skinMat, [0, -0.05, 0.05], [0, 0, 0], prefix + 'HandMass');
    addMesh(Wrist, new THREE.SphereGeometry(0.06, 8, 8), skinMat, [-0.05, -0.09, 0.14], [0, 0, 0], prefix + 'Knuckle1');
    addMesh(Wrist, new THREE.SphereGeometry(0.06, 8, 8), skinMat, [0.05, -0.09, 0.14], [0, 0, 0], prefix + 'Knuckle2');
    return { Shoulder, Elbow, Wrist };
  }
  const armL = buildArm('L');
  const armR = buildArm('R');

  // ================= LEGS =================
  function buildLeg(side) {
    const sx = side === 'L' ? -1 : 1;
    const prefix = side === 'L' ? 'Left' : 'Right';
    const Hip = joint(Hips, prefix + 'Hip', [sx * 0.26, -0.02, -0.22]);
    limb(Hip, 0.30, 0.17, 0.14, silverFur, prefix + 'ThighMass', true);
    const Knee = joint(Hip, prefix + 'Knee', [0, -0.30, 0]);
    limb(Knee, 0.28, 0.13, 0.105, darkFur, prefix + 'ShinMass', true);
    const Ankle = joint(Knee, prefix + 'Ankle', [0, -0.28, 0]);
    addMesh(Ankle, new THREE.BoxGeometry(0.18, 0.10, 0.28), skinMat, [0, -0.05, 0.06], [0, 0, 0], prefix + 'FootMass');
    return { Hip, Knee, Ankle };
  }
  const legL = buildLeg('L');
  const legR = buildLeg('R');

  // ================= POSE HELPERS =================
  const REST = {
    hipY: HIP_HEIGHT,
    hipPitch: -0.28,
    kneePitch: 0.85,
    anklePitch: -0.45,
    shoulderPitch: 0.20,
    elbowPitch: -0.18,
    wristPitch: -0.15,
    spinePitch: 0.18,
    chestPitch: -0.10,
    neckPitch: 0.15,
    headPitch: 0.05
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const ease = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

  function keyLinear(x, pts) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const x0 = pts[i - 1][0], y0 = pts[i - 1][1];
        const x1 = pts[i][0], y1 = pts[i][1];
        return lerp(y0, y1, (x - x0) / (x1 - x0));
      }
    }
    return pts[pts.length - 1][1];
  }

  function limbCycle(stridePhase, offset, amp) {
    const cp = ((stridePhase + offset) % 1 + 1) % 1;
    const ang = Math.sin(cp * Math.PI * 2) * amp;
    const liftRaw = Math.max(0, Math.sin(cp * Math.PI * 2));
    return { ang, lift: Math.pow(liftRaw, 1.6) };
  }

  // ================= POSE =================
  root.userData.pose = (s) => {
    const speed = s.speed || 0;
    const stride = ((s.stride || 0) % 1 + 1) % 1;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = (s.health === undefined) ? 1 : s.health;
    const time = s.t || 0;

    let hipX = 0, hipY = REST.hipY, hipZ = -0.10, hipYaw = 0, hipRoll = 0;
    let spX = REST.spinePitch, spY = 0, spZ = 0;
    let chX = REST.chestPitch, chY = 0, chZ = 0;
    let neX = REST.neckPitch, neY = 0, neZ = 0;
    let heX = REST.headPitch, heY = 0, heZ = 0;
    let jaw = 0.04;

    let aL = { s: REST.shoulderPitch, sSpread: 0.10, e: REST.elbowPitch, w: REST.wristPitch };
    let aR = { s: REST.shoulderPitch, sSpread: -0.10, e: REST.elbowPitch, w: REST.wristPitch };
    let lL = { h: REST.hipPitch, hSpread: 0.05, k: REST.kneePitch, a: REST.anklePitch };
    let lR = { h: REST.hipPitch, hSpread: -0.05, k: REST.kneePitch, a: REST.anklePitch };

    if (s.action) {
      const ph = clamp01(s.phase || 0);

      switch (s.action) {
        case 'attack': {
          let w, c, r;
          if (ph < 0.35) { w = ease(ph / 0.35); c = 0; r = 0; }
          else if (ph < 0.6) { w = 1; c = ease((ph - 0.35) / 0.25); r = 0; }
          else { w = 1; c = 1; r = ease((ph - 0.6) / 0.4); }
          const windup = w * (1 - c), commit = c, recov = r;
          spX = REST.spinePitch - 0.35 * windup + 0.55 * commit - 0.2 * recov;
          chX = REST.chestPitch - 0.30 * windup + 0.65 * commit - 0.25 * recov;
          heX = REST.headPitch - 0.15 * windup + 0.25 * commit;
          aL.s = REST.shoulderPitch - 1.6 * windup + 2.2 * commit - 0.6 * recov;
          aR.s = REST.shoulderPitch - 1.6 * windup + 2.2 * commit - 0.6 * recov;
          aL.e = REST.elbowPitch - 0.6 * windup + 1.0 * commit;
          aR.e = REST.elbowPitch - 0.6 * windup + 1.0 * commit;
          aL.w = REST.wristPitch + 0.5 * commit;
          aR.w = REST.wristPitch + 0.5 * commit;
          hipY = REST.hipY - 0.05 * commit;
          break;
        }
        case 'fire': {
          let aim, rel, rec;
          if (ph < 0.4) { aim = ease(ph / 0.4); rel = 0; rec = 0; }
          else if (ph < 0.55) { aim = 1; rel = ease((ph - 0.4) / 0.15); rec = 0; }
          else { aim = 1; rel = 1; rec = ease((ph - 0.55) / 0.45); }
          aR.s = REST.shoulderPitch - 1.4 * aim + 2.6 * rel - 0.5 * rec;
          aR.e = REST.elbowPitch - 1.0 * aim + 1.3 * rel;
          aR.w = REST.wristPitch + 0.8 * rel;
          aL.s = REST.shoulderPitch + 0.3 * aim - 0.2 * rel;
          chY = 0.25 * aim - 0.35 * rel + 0.05 * rec;
          spY = 0.12 * aim - 0.20 * rel;
          heY = 0.1 * rel;
          hipZ = -0.10 - 0.04 * rel + 0.06 * rec;
          break;
        }
        case 'hit': {
          const snap = ease(Math.min(1, ph / 0.25)) * (1 - ease(Math.max(0, (ph - 0.25) / 0.75)));
          heX = REST.headPitch - 0.5 * snap;
          heZ = 0.35 * snap;
          chZ = 0.22 * snap;
          spZ = 0.15 * snap;
          aL.s = REST.shoulderPitch + 0.4 * snap;
          aR.s = REST.shoulderPitch + 0.4 * snap;
          hipY = REST.hipY - 0.03 * snap;
          break;
        }
        case 'block': {
          const k = ease(Math.min(1, ph / 0.3)) * (ph < 0.85 ? 1 : ease(1 - (ph - 0.85) / 0.15));
          hipY = REST.hipY - 0.10 * k;
          hipZ = -0.10 - 0.08 * k;
          spX = REST.spinePitch + 0.30 * k;
          chX = REST.chestPitch + 0.35 * k;
          heX = REST.headPitch + 0.30 * k;
          aL.s = REST.shoulderPitch - 1.3 * k; aL.sSpread = 0.10 - 0.35 * k;
          aR.s = REST.shoulderPitch - 1.3 * k; aR.sSpread = -0.10 + 0.35 * k;
          aL.e = REST.elbowPitch - 1.5 * k;
          aR.e = REST.elbowPitch - 1.5 * k;
          lL.k = REST.kneePitch + 0.2 * k;
          lR.k = REST.kneePitch + 0.2 * k;
          break;
        }
        case 'gather': {
          let d;
          if (ph < 0.45) d = ease(ph / 0.45);
          else if (ph < 0.6) d = 1;
          else d = 1 - ease((ph - 0.6) / 0.4);
          hipY = REST.hipY - 0.22 * d;
          spX = REST.spinePitch + 0.45 * d;
          chX = REST.chestPitch + 0.55 * d;
          heX = REST.headPitch + 0.35 * d;
          aL.s = REST.shoulderPitch + 1.5 * d;
          aR.s = REST.shoulderPitch + 1.5 * d;
          aL.e = REST.elbowPitch + 0.9 * d;
          aR.e = REST.elbowPitch + 0.9 * d;
          aL.w = REST.wristPitch + 0.3 * d;
          aR.w = REST.wristPitch + 0.3 * d;
          break;
        }
        case 'deposit': {
          let d;
          if (ph < 0.55) d = ease(ph / 0.55);
          else if (ph < 0.75) d = 1;
          else d = 1 - ease((ph - 0.75) / 0.25);
          hipY = REST.hipY - 0.16 * d;
          spX = REST.spinePitch + 0.35 * d;
          chX = REST.chestPitch + 0.42 * d;
          heX = REST.headPitch + 0.25 * d;
          aL.s = REST.shoulderPitch + 1.2 * d;
          aR.s = REST.shoulderPitch + 1.2 * d;
          aL.e = REST.elbowPitch + 0.5 * d;
          aR.e = REST.elbowPitch + 0.5 * d;
          aL.w = REST.wristPitch - 0.3 * d;
          aR.w = REST.wristPitch - 0.3 * d;
          break;
        }
        case 'eat': {
          const bow = ph < 0.2 ? ease(ph / 0.2) : (ph > 0.85 ? ease((1 - ph) / 0.15) : 1);
          const chew = Math.sin(ph * Math.PI * 2 * 2.5) * 0.5 + 0.5;
          heX = REST.headPitch + 0.55 * bow;
          neX = REST.neckPitch + 0.35 * bow;
          chX = REST.chestPitch + 0.25 * bow;
          hipY = REST.hipY - 0.08 * bow;
          jaw = 0.04 + 0.30 * chew * bow;
          break;
        }
        case 'drink': {
          const bow = ph < 0.3 ? ease(ph / 0.3) : (ph < 0.75 ? 1 : ease((1 - ph) / 0.25));
          heX = REST.headPitch + 0.65 * bow;
          neX = REST.neckPitch + 0.4 * bow;
          chX = REST.chestPitch + 0.20 * bow;
          hipY = REST.hipY - 0.10 * bow;
          jaw = 0.04 + 0.05 * bow;
          break;
        }
        case 'jump': {
          if (ph < 0.34) {
            const c = ease(ph / 0.34);
            hipY = REST.hipY - 0.24 * c;
            lL.k = REST.kneePitch + 0.6 * c; lR.k = REST.kneePitch + 0.6 * c;
            lL.h = REST.hipPitch - 0.3 * c; lR.h = REST.hipPitch - 0.3 * c;
            spX = REST.spinePitch + 0.3 * c; chX = REST.chestPitch + 0.3 * c;
            aL.s = REST.shoulderPitch + 0.8 * c; aR.s = REST.shoulderPitch + 0.8 * c;
          } else {
            const e = ease((ph - 0.34) / 0.66);
            hipY = REST.hipY - 0.24 + 0.55 * e;
            lL.k = REST.kneePitch + 0.6 - 0.9 * e; lR.k = REST.kneePitch + 0.6 - 0.9 * e;
            lL.h = REST.hipPitch - 0.3 + 0.5 * e; lR.h = REST.hipPitch - 0.3 + 0.5 * e;
            spX = REST.spinePitch + 0.3 - 0.5 * e; chX = REST.chestPitch + 0.3 - 0.55 * e;
            aL.s = REST.shoulderPitch + 0.8 - 2.0 * e; aR.s = REST.shoulderPitch + 0.8 - 2.0 * e;
            heX = REST.headPitch - 0.3 * e;
          }
          break;
        }
        case 'land': {
          if (ph < 0.4) {
            const e = ease(ph / 0.4);
            lL.h = REST.hipPitch + 0.2 * e; lR.h = REST.hipPitch + 0.2 * e;
            lL.k = REST.kneePitch - 0.15 * e; lR.k = REST.kneePitch - 0.15 * e;
            aL.s = REST.shoulderPitch - 0.9 * e; aR.s = REST.shoulderPitch - 0.9 * e;
            hipY = REST.hipY + 0.05 * e;
          } else if (ph < 0.65) {
            const c = ease((ph - 0.4) / 0.25);
            hipY = REST.hipY + 0.05 - 0.30 * c;
            lL.k = REST.kneePitch - 0.15 + 0.75 * c; lR.k = REST.kneePitch - 0.15 + 0.75 * c;
            chX = REST.chestPitch + 0.35 * c; spX = REST.spinePitch + 0.3 * c;
            aL.s = REST.shoulderPitch - 0.9 + 1.5 * c; aR.s = REST.shoulderPitch - 0.9 + 1.5 * c;
          } else {
            const r = ease((ph - 0.65) / 0.35);
            hipY = REST.hipY - 0.25 + 0.25 * r;
            lL.k = REST.kneePitch + 0.6 - 0.6 * r; lR.k = REST.kneePitch + 0.6 - 0.6 * r;
            chX = REST.chestPitch + 0.35 - 0.35 * r; spX = REST.spinePitch + 0.3 - 0.3 * r;
            aL.s = REST.shoulderPitch + 0.6 - 0.6 * r; aR.s = REST.shoulderPitch + 0.6 - 0.6 * r;
          }
          break;
        }
        case 'signal': {
          const rise = ph < 0.35 ? ease(ph / 0.35) : (ph < 0.75 ? 1 : ease((1 - ph) / 0.25));
          hipY = REST.hipY + 0.10 * rise;
          spX = REST.spinePitch - 0.35 * rise;
          chX = REST.chestPitch - 0.45 * rise;
          heX = REST.headPitch - 0.30 * rise;
          aL.s = REST.shoulderPitch - 2.0 * rise; aL.sSpread = 0.10 + 0.9 * rise;
          aR.s = REST.shoulderPitch - 2.0 * rise; aR.sSpread = -0.10 - 0.9 * rise;
          aL.e = REST.elbowPitch + 0.6 * rise; aR.e = REST.elbowPitch + 0.6 * rise;
          const beat = Math.sin(ph * Math.PI * 8) * 0.15 * rise;
          aL.e += beat; aR.e -= beat;
          break;
        }
        case 'sleep': {
          const d = ease(ph);
          hipY = REST.hipY - 0.42 * d;
          hipZ = -0.10 + 0.08 * d;
          spX = REST.spinePitch + 0.55 * d;
          chX = REST.chestPitch + 0.60 * d;
          heX = REST.headPitch + 0.55 * d;
          heY = 0.3 * d;
          lL.h = REST.hipPitch + 0.9 * d; lR.h = REST.hipPitch + 0.9 * d;
          lL.k = REST.kneePitch + 0.7 * d; lR.k = REST.kneePitch + 0.7 * d;
          aL.s = REST.shoulderPitch + 1.1 * d; aR.s = REST.shoulderPitch + 1.1 * d;
          aL.e = REST.elbowPitch + 0.7 * d; aR.e = REST.elbowPitch + 0.7 * d;
          jaw = 0.02;
          break;
        }
        case 'wake': {
          const d = 1 - ease(ph);
          hipY = REST.hipY - 0.42 * d;
          hipZ = -0.10 + 0.08 * d;
          spX = REST.spinePitch + 0.55 * d;
          chX = REST.chestPitch + 0.60 * d;
          heX = REST.headPitch + 0.55 * d;
          heY = 0.3 * d;
          lL.h = REST.hipPitch + 0.9 * d; lR.h = REST.hipPitch + 0.9 * d;
          lL.k = REST.kneePitch + 0.7 * d; lR.k = REST.kneePitch + 0.7 * d;
          aL.s = REST.shoulderPitch + 1.1 * d; aR.s = REST.shoulderPitch + 1.1 * d;
          aL.e = REST.elbowPitch + 0.7 * d; aR.e = REST.elbowPitch + 0.7 * d;
          break;
        }
        case 'die': {
          const d = ease(ph);
          hipY = REST.hipY - 0.50 * d;
          hipZ = -0.10 - 0.10 * d;
          hipRoll = 0.9 * d;
          spX = REST.spinePitch + 0.5 * d;
          spZ = 0.5 * d;
          chX = REST.chestPitch + 0.6 * d;
          chZ = 0.5 * d;
          heX = REST.headPitch + 0.4 * d;
          heZ = 0.5 * d;
          aL.s = REST.shoulderPitch - 0.6 * d; aR.s = REST.shoulderPitch + 1.3 * d;
          aL.e = REST.elbowPitch + 0.5 * d; aR.e = REST.elbowPitch + 0.4 * d;
          lL.h = REST.hipPitch + 0.5 * d; lR.h = REST.hipPitch + 0.7 * d;
          lL.k = REST.kneePitch + 0.5 * d; lR.k = REST.kneePitch + 0.3 * d;
          break;
        }
        case 'evolve': {
          let k;
          if (ph < 0.3) k = -ease(ph / 0.3);
          else if (ph < 0.7) k = ease((ph - 0.3) / 0.4);
          else k = 1 - ease((ph - 0.7) / 0.3);
          const brace = Math.max(0, -k), open = Math.max(0, k);
          hipY = REST.hipY - 0.15 * brace + 0.06 * open;
          spX = REST.spinePitch + 0.3 * brace - 0.25 * open;
          chX = REST.chestPitch + 0.35 * brace - 0.40 * open;
          heX = REST.headPitch + 0.2 * brace - 0.25 * open;
          aL.s = REST.shoulderPitch + 1.0 * brace - 1.8 * open; aL.sSpread = 0.10 + 0.7 * open;
          aR.s = REST.shoulderPitch + 1.0 * brace - 1.8 * open; aR.sSpread = -0.10 - 0.7 * open;
          lL.hSpread = 0.05 + 0.25 * open; lR.hSpread = -0.05 - 0.25 * open;
          break;
        }
      }
    } else {
      const boundT = smoothstep(1.5, 2.5, speed);
      const amp = keyLinear(speed, [[0, 0], [0.5, 0.30], [1, 0.48], [2, 0.55], [3, 0.68], [6, 0.85]]);
      const crouch = keyLinear(speed, [[0, 0.0], [0.5, 0.14], [1, 0.06], [2, 0.02], [3, -0.02], [6, -0.08]]);
      const lean = keyLinear(speed, [[0, 0.0], [0.5, 0.04], [1, 0.08], [2, 0.14], [3, 0.22], [6, 0.34]]);
      const bobAmp = keyLinear(speed, [[0, 0.006], [0.5, 0.02], [1, 0.035], [2, 0.05], [3, 0.065], [6, 0.09]]);

      const oLA = lerp(0, 0, boundT);
      const oRA = lerp(0.5, 0.06, boundT);
      const oLL = lerp(0.5, 0.5, boundT);
      const oRL = lerp(0, 0.56, boundT);

      const cLA = limbCycle(stride, oLA, amp);
      const cRA = limbCycle(stride, oRA, amp);
      const cLL = limbCycle(stride, oLL, amp * 0.75);
      const cRL = limbCycle(stride, oRL, amp * 0.75);

      const moving = speed > 0.02;

      hipY = REST.hipY - crouch;
      hipY -= (cLL.lift + cRL.lift) * bobAmp * 0.5 + Math.abs(Math.sin(stride * Math.PI * 2 * 2)) * bobAmp * 0.4;
      spX = REST.spinePitch + lean;
      chX = REST.chestPitch - lean * 0.5;

      const breathe = Math.sin(time * 1.6) * (moving ? 0.0 : 0.02);
      chX += breathe;
      const scan = Math.sin(time * 0.35) * (moving ? 0.02 : 0.18);
      heY += scan;
      const sway = Math.sin(time * 0.8) * (moving ? 0.0 : 0.02);
      hipX += sway;

      aL.s = REST.shoulderPitch + cLA.ang;
      aR.s = REST.shoulderPitch + cRA.ang;
      aL.e = REST.elbowPitch + cLA.lift * 0.5;
      aR.e = REST.elbowPitch + cRA.lift * 0.5;
      lL.h = REST.hipPitch + cLL.ang;
      lR.h = REST.hipPitch + cRL.ang;
      lL.k = REST.kneePitch + cLL.lift * 0.7;
      lR.k = REST.kneePitch + cRL.lift * 0.7;
      lL.a = REST.anklePitch - cLL.lift * 0.3;
      lR.a = REST.anklePitch - cRL.lift * 0.3;

      const sprint = smoothstep(3, 6, speed);
      heX -= 0.25 * sprint;
      neX -= 0.15 * sprint;
      spX += 0.10 * sprint;

      const turnMag = Math.max(-1, Math.min(1, turn));
      hipRoll = -turnMag * 0.16;
      spZ += -turnMag * 0.10;
      chZ += -turnMag * 0.14;
      heY += -turnMag * 0.35;
      chY += -turnMag * 0.18;
      if (turnMag < 0) { lL.h -= 0.15 * (-turnMag); aL.s -= 0.15 * (-turnMag); }
      else if (turnMag > 0) { lR.h -= 0.15 * turnMag; aR.s -= 0.15 * turnMag; }

      if (!grounded) {
        aL.s = REST.shoulderPitch - 0.5; aR.s = REST.shoulderPitch - 0.5;
        aL.e = REST.elbowPitch - 0.4; aR.e = REST.elbowPitch - 0.4;
        lL.h = REST.hipPitch - 0.5; lR.h = REST.hipPitch - 0.5;
        lL.k = REST.kneePitch + 0.6; lR.k = REST.kneePitch + 0.6;
        lL.a = REST.anklePitch; lR.a = REST.anklePitch;
        spX = REST.spinePitch + 0.15;
        chX = REST.chestPitch + 0.1;
        hipY = REST.hipY - 0.05;
      }
    }

    const hurt = clamp01(1 - health);
    if (hurt > 0.001) {
      chZ += 0.20 * hurt;
      spZ += 0.12 * hurt;
      heZ += 0.18 * hurt;
      heX += 0.15 * hurt;
      aR.s -= 0.35 * hurt;
      hipY -= 0.06 * hurt;
      hipRoll += 0.10 * hurt;
    }

    Hips.position.set(hipX, hipY, hipZ);
    Hips.rotation.set(0, hipYaw, hipRoll);
    SpineLower.rotation.set(spX, spY, spZ);
    Chest.rotation.set(chX, chY, chZ);
    Neck.rotation.set(neX, neY, neZ);
    Head.rotation.set(heX, heY, heZ);
    Jaw.rotation.set(jaw, 0, 0);

    armL.Shoulder.rotation.set(aL.s, 0, aL.sSpread);
    armL.Elbow.rotation.set(aL.e, 0, 0);
    armL.Wrist.rotation.set(aL.w, 0, 0);
    armR.Shoulder.rotation.set(aR.s, 0, aR.sSpread);
    armR.Elbow.rotation.set(aR.e, 0, 0);
    armR.Wrist.rotation.set(aR.w, 0, 0);

    legL.Hip.rotation.set(lL.h, 0, lL.hSpread);
    legL.Knee.rotation.set(lL.k, 0, 0);
    legL.Ankle.rotation.set(lL.a, 0, 0);
    legR.Hip.rotation.set(lR.h, 0, lR.hSpread);
    legR.Knee.rotation.set(lR.k, 0, 0);
    legR.Ankle.rotation.set(lR.a, 0, 0);
  };

  return root;
}