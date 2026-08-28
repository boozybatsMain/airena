function build(THREE, TSL) {
  const { vec3, positionLocal, positionWorld, normalWorld, cameraPosition,
          sin, pow, dot, normalize, oneMinus, clamp, float, sub } = TSL;

  // ---------- materials ----------
  function furColor(base, freqA, freqB, freqC, amt) {
    return vec3(base[0], base[1], base[2]).add(
      sin(positionLocal.x.mul(freqA))
        .mul(sin(positionLocal.y.mul(freqB)))
        .mul(sin(positionLocal.z.mul(freqC)))
        .mul(amt)
    );
  }

  const furMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0.0 });
  furMat.colorNode = furColor([0.045, 0.04, 0.036], 61.0, 47.0, 53.0, 0.02);
  furMat.roughnessNode = float(0.88).add(sin(positionLocal.y.mul(30.0)).mul(0.04));

  const skinMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.0 });
  skinMat.colorNode = furColor([0.035, 0.028, 0.024], 80.0, 65.0, 70.0, 0.01);
  skinMat.roughnessNode = float(0.4);

  const saddleMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, metalness: 0.05 });
  saddleMat.colorNode = furColor([0.58, 0.57, 0.56], 50.0, 44.0, 39.0, 0.03);
  {
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const fres = oneMinus(clamp(dot(normalize(normalWorld), viewDir), 0.0, 1.0));
    saddleMat.emissiveNode = vec3(0.04, 0.04, 0.045).mul(pow(fres, 2.0));
  }

  const eyeMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.2, metalness: 0.1 });
  eyeMat.colorNode = vec3(0.01, 0.008, 0.008);

  // ---------- geometry helper ----------
  function ellipsoid(rx, ry, rz, ws = 12, hs = 10) {
    const g = new THREE.SphereGeometry(1, ws, hs);
    g.scale(rx, ry, rz);
    return g;
  }

  const gorilla = new THREE.Group();
  gorilla.name = 'gorilla';

  // ---------- pelvis / spine / chest / neck / head ----------
  const pelvis = new THREE.Group();
  pelvis.name = 'pelvis';
  pelvis.position.set(0, 0.95, -0.35);
  gorilla.add(pelvis);

  const pelvisMesh = new THREE.Mesh(ellipsoid(0.28, 0.22, 0.30), furMat);
  pelvisMesh.name = 'pelvisMesh';
  pelvisMesh.position.set(0, -0.05, -0.18);
  pelvis.add(pelvisMesh);

  const spine = new THREE.Group();
  spine.name = 'spine';
  spine.position.set(0, 0.10, 0.10);
  pelvis.add(spine);

  const spineMesh = new THREE.Mesh(ellipsoid(0.30, 0.24, 0.28), furMat);
  spineMesh.name = 'spineMesh';
  spineMesh.position.set(0, 0.04, 0.12);
  spine.add(spineMesh);

  const saddleSpine = new THREE.Mesh(ellipsoid(0.33, 0.15, 0.30), saddleMat);
  saddleSpine.name = 'saddleSpine';
  saddleSpine.position.set(0, 0.14, 0.10);
  spine.add(saddleSpine);

  const chest = new THREE.Group();
  chest.name = 'chest';
  chest.position.set(0, 0.14, 0.38);
  spine.add(chest);

  const chestMesh = new THREE.Mesh(ellipsoid(0.42, 0.34, 0.36), furMat);
  chestMesh.name = 'chestMesh';
  chestMesh.position.set(0, 0.08, 0.10);
  chest.add(chestMesh);

  const saddleChest = new THREE.Mesh(ellipsoid(0.40, 0.14, 0.30), saddleMat);
  saddleChest.name = 'saddleChest';
  saddleChest.position.set(0, 0.24, 0.0);
  chest.add(saddleChest);

  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.32, 0.28);
  chest.add(neck);

  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 0.26, 10), furMat);
  neckMesh.name = 'neckMesh';
  neckMesh.position.set(0, 0.05, 0.02);
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.16, 0.12);
  neck.add(head);

  const skullMesh = new THREE.Mesh(ellipsoid(0.20, 0.19, 0.22), furMat);
  skullMesh.name = 'skullMesh';
  skullMesh.position.set(0, 0.03, 0.02);
  head.add(skullMesh);

  const crestMesh = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.10, 6), furMat);
  crestMesh.name = 'sagittalCrest';
  crestMesh.position.set(0, 0.20, -0.02);
  head.add(crestMesh);

  const muzzleMesh = new THREE.Mesh(ellipsoid(0.13, 0.11, 0.15), skinMat);
  muzzleMesh.name = 'muzzleMesh';
  muzzleMesh.position.set(0, -0.04, 0.22);
  head.add(muzzleMesh);

  const browRidge = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.045, 0.06), skinMat);
  browRidge.name = 'browRidge';
  browRidge.position.set(0, 0.055, 0.19);
  head.add(browRidge);

  const eyeGeo = new THREE.SphereGeometry(0.025, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.name = 'eyeL';
  eyeL.position.set(0.09, 0.03, 0.24);
  head.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.name = 'eyeR';
  eyeR.position.set(-0.09, 0.03, 0.24);
  head.add(eyeR);

  const earGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10);
  const earL = new THREE.Mesh(earGeo, skinMat);
  earL.name = 'earL';
  earL.position.set(0.20, 0.02, 0.02);
  earL.rotation.z = Math.PI / 2 * 0.9;
  head.add(earL);
  const earR = new THREE.Mesh(earGeo, skinMat);
  earR.name = 'earR';
  earR.position.set(-0.20, 0.02, 0.02);
  earR.rotation.z = -Math.PI / 2 * 0.9;
  head.add(earR);

  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, -0.02, 0.20);
  head.add(jaw);

  const jawMesh = new THREE.Mesh(ellipsoid(0.11, 0.07, 0.13), skinMat);
  jawMesh.name = 'jawMesh';
  jawMesh.position.set(0, -0.05, 0.06);
  jaw.add(jawMesh);

  // ---------- limb builders ----------
  function buildArm(sign, parent) {
    const shoulder = new THREE.Group();
    shoulder.name = sign > 0 ? 'shoulderR' : 'shoulderL';
    shoulder.position.set(sign * 0.46, 0.16, 0.10);
    parent.add(shoulder);

    const upperArmMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.42, 6, 10), furMat);
    upperArmMesh.name = (sign > 0 ? 'upperArmR' : 'upperArmL') + 'Mesh';
    upperArmMesh.position.set(0, -0.27, 0);
    shoulder.add(upperArmMesh);

    const elbow = new THREE.Group();
    elbow.name = sign > 0 ? 'elbowR' : 'elbowL';
    elbow.position.set(0, -0.50, 0.03);
    shoulder.add(elbow);

    const forearmMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.38, 6, 10), furMat);
    forearmMesh.name = (sign > 0 ? 'forearmR' : 'forearmL') + 'Mesh';
    forearmMesh.position.set(0, -0.24, 0);
    elbow.add(forearmMesh);

    const hand = new THREE.Group();
    hand.name = sign > 0 ? 'handR' : 'handL';
    hand.position.set(0, -0.44, 0.02);
    elbow.add(hand);

    const handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.15, 0.24), skinMat);
    handMesh.name = (sign > 0 ? 'handR' : 'handL') + 'Mesh';
    handMesh.position.set(0, -0.07, 0.05);
    hand.add(handMesh);

    const knuckles = new THREE.Group();
    knuckles.name = sign > 0 ? 'knucklesR' : 'knucklesL';
    knuckles.position.set(0, -0.14, 0.14);
    hand.add(knuckles);
    const knuckleGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8);
    [-0.06, -0.02, 0.02, 0.06].forEach((x) => {
      const k = new THREE.Mesh(knuckleGeo, skinMat);
      k.position.set(x, 0, 0);
      k.rotation.x = Math.PI / 2 * 0.15;
      knuckles.add(k);
    });

    return { shoulder, elbow, hand, sign };
  }

  function buildLeg(sign, parent) {
    const hip = new THREE.Group();
    hip.name = sign > 0 ? 'hipR' : 'hipL';
    hip.position.set(sign * 0.26, -0.06, -0.30);
    parent.add(hip);

    const thighMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.34, 6, 10), furMat);
    thighMesh.name = (sign > 0 ? 'thighR' : 'thighL') + 'Mesh';
    thighMesh.position.set(0, -0.20, 0);
    hip.add(thighMesh);

    const knee = new THREE.Group();
    knee.name = sign > 0 ? 'kneeR' : 'kneeL';
    knee.position.set(0, -0.38, 0.02);
    hip.add(knee);

    const shinMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.30, 6, 10), furMat);
    shinMesh.name = (sign > 0 ? 'shinR' : 'shinL') + 'Mesh';
    shinMesh.position.set(0, -0.16, 0);
    knee.add(shinMesh);

    const foot = new THREE.Group();
    foot.name = sign > 0 ? 'footR' : 'footL';
    foot.position.set(0, -0.32, 0.04);
    knee.add(foot);

    const footMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.34), skinMat);
    footMesh.name = (sign > 0 ? 'footR' : 'footL') + 'Mesh';
    footMesh.position.set(0, -0.05, 0.10);
    foot.add(footMesh);

    const toes = new THREE.Group();
    toes.name = sign > 0 ? 'toesR' : 'toesL';
    toes.position.set(0, -0.09, 0.24);
    foot.add(toes);
    const toeGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.05, 8);
    [-0.06, -0.02, 0.02, 0.06].forEach((x) => {
      const tm = new THREE.Mesh(toeGeo, skinMat);
      tm.position.set(x, 0, 0);
      tm.rotation.x = Math.PI / 2 * 0.9;
      toes.add(tm);
    });

    return { hip, knee, foot, sign };
  }

  const armR = buildArm(1, chest);
  const armL = buildArm(-1, chest);
  const legR = buildLeg(1, pelvis);
  const legL = buildLeg(-1, pelvis);
  const arms = [armR, armL];
  const legs = [legR, legL];

  // ---------- pose math helpers ----------
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
  const trapezoid = (p, inW, outW) => Math.max(0, Math.min(1, p / inW, (1 - p) / outW));
  const seg = (p, a, b, c, w1, w2) => {
    if (p < w1) return lerp(a, b, smooth(p / w1));
    if (p < w2) return lerp(b, c, smooth((p - w1) / (w2 - w1)));
    return lerp(c, a, smooth((p - w2) / (1 - w2)));
  };
  function gaitAngles(phase, amp, lift) {
    const p = ((phase % 1) + 1) % 1;
    let fwd, ld;
    if (p < 0.5) {
      const tt = p / 0.5;
      fwd = -amp + amp * 2 * tt;
      ld = Math.sin(tt * Math.PI) * lift;
    } else {
      const tt = (p - 0.5) / 0.5;
      fwd = amp - amp * 2 * tt;
      ld = 0;
    }
    return { fwd, ld };
  }

  // rest angles
  const REST_PELVIS_Y = 0.95;
  const REST_SP = 0.05, REST_CH = -0.03, REST_NECK = 0.15, REST_HEAD = 0.0;
  const REST_SH = 0.15, REST_EL = 0.55, REST_HAND = -0.10;
  const REST_HIP = -0.05, REST_KNEE = 0.35, REST_FOOT = -0.05;

  object_pose_setup: {}

  gorilla.userData.pose = (s) => {
    const speed = s.speed || 0;
    const stride = s.stride || 0;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = (s.health === undefined) ? 1 : s.health;
    const t = s.t || 0;
    const spd = Math.min(speed, 6);

    // accumulators
    let pelX = 0, pelY = REST_PELVIS_Y, pelZ = 0;
    let pelRX = 0, pelRY = 0, pelRZ = 0;
    let spineX = REST_SP, spineY = 0, spineZ = 0;
    let chestX = REST_CH, chestY = 0, chestZ = 0;
    let neckX = REST_NECK, neckY = 0, neckZ = 0;
    let headX = REST_HEAD, headY = 0, headZ = 0;
    let jawX = 0;
    let chestScale = 1;
    let eyeScale = 1;

    // per-limb targets, filled below, applied at the end
    const armPose = { }, legPose = { };
    for (const a of arms) armPose[a.sign] = { shX: REST_SH, shZ: 0.10 * a.sign, elX: REST_EL, haX: REST_HAND };
    for (const l of legs) legPose[l.sign] = { hiX: REST_HIP, hiZ: 0.05 * l.sign, knX: REST_KNEE, ftX: REST_FOOT };

    // ---------------- base locomotion ----------------
    const creepBump = Math.exp(-((spd - 0.5) * (spd - 0.5)) / (2 * 0.3 * 0.3)) * 0.10;
    const runLower = spd / 6 * 0.08;
    pelY = REST_PELVIS_Y - creepBump - runLower;
    pelZ = spd / 6 * 0.05;

    const flatten = spd / 6;
    spineX = REST_SP + flatten * 0.15;
    chestX = REST_CH - flatten * 0.05;
    neckX = REST_NECK - flatten * 0.35;
    headX = REST_HEAD - flatten * 0.15;

    const gaitMix = smooth((spd - 1) / (2 - 1));
    const legAmp = 0.30 + 0.10 * Math.min(spd, 3) + 0.05 * Math.max(0, spd - 3);
    const legLift = 0.25 + 0.15 * Math.min(spd, 3) / 3 + 0.10 * Math.max(0, spd - 3) / 3;
    const armAmp = legAmp * 1.05;
    const armLift = legLift * 0.9;

    if (grounded) {
      for (const l of legs) {
        const trotOff = l.sign === 1 ? 0.5 : 0.0;
        const off = lerp(trotOff, 0.5, gaitMix);
        const ampScaled = legAmp * (1 - Math.max(0, turn * l.sign) * 0.35);
        const { fwd, ld } = gaitAngles(stride + off, ampScaled, legLift);
        legPose[l.sign].hiX = REST_HIP - fwd;
        legPose[l.sign].hiZ = 0.05 * l.sign;
        legPose[l.sign].knX = REST_KNEE + ld * 1.4;
        legPose[l.sign].ftX = REST_FOOT - ld * 0.5;
      }
      for (const a of arms) {
        const trotOff = a.sign === 1 ? 0.0 : 0.5;
        const off = lerp(trotOff, 0.0, gaitMix);
        const ampScaled = armAmp * (1 - Math.max(0, turn * a.sign) * 0.35);
        const { fwd, ld } = gaitAngles(stride + off, ampScaled, armLift);
        armPose[a.sign].shX = REST_SH - fwd;
        armPose[a.sign].shZ = 0.10 * a.sign;
        armPose[a.sign].elX = REST_EL + ld * 1.2;
        armPose[a.sign].haX = REST_HAND - ld * 0.4;
      }
    } else {
      const dangle = Math.sin(t * 4.0) * 0.05;
      for (const l of legs) {
        legPose[l.sign].hiX = REST_HIP + 0.5 + dangle * l.sign;
        legPose[l.sign].hiZ = 0.05 * l.sign;
        legPose[l.sign].knX = REST_KNEE + 0.9;
        legPose[l.sign].ftX = REST_FOOT - 0.3;
      }
      for (const a of arms) {
        armPose[a.sign].shX = REST_SH - 0.3 + dangle * a.sign;
        armPose[a.sign].shZ = 0.15 * a.sign;
        armPose[a.sign].elX = REST_EL + 0.4;
        armPose[a.sign].haX = REST_HAND;
      }
      pelY = REST_PELVIS_Y + 0.10;
      spineX = REST_SP - 0.10;
    }

    // ---------------- idle (only when no action, fades with speed) ----------------
    if (!s.action) {
      const idleFactor = Math.max(0, 1 - speed / 0.4);
      const breathe = Math.sin(t * 1.3) * 0.03 * idleFactor;
      chestScale = 1 + breathe;
      pelRZ += Math.sin(t * 0.5) * 0.04 * idleFactor;
      pelX += Math.sin(t * 0.37) * 0.02 * idleFactor;
      const headScan = Math.sin(t * 0.31) * 0.18 * idleFactor;
      headY += headScan;
      neckY += headScan * 0.4;
    }

    // ---------------- actions ----------------
    if (s.action) {
      const ph = clamp01(s.phase || 0);

      if (s.action === 'attack') {
        const shA = seg(ph, REST_SH, -2.0, -0.15, 0.3, 0.55);
        const elA = seg(ph, REST_EL, 0.9, 0.15, 0.3, 0.55);
        for (const a of arms) { armPose[a.sign].shX = shA; armPose[a.sign].elX = elA; armPose[a.sign].shZ = 0.10 * a.sign; }
        spineX = seg(ph, REST_SP, REST_SP - 0.15, REST_SP + 0.20, 0.3, 0.55);
        chestX = seg(ph, REST_CH, REST_CH - 0.1, REST_CH + 0.15, 0.3, 0.55);
        neckX = seg(ph, REST_NECK, REST_NECK - 0.1, REST_NECK + 0.25, 0.3, 0.55);
        jawX = seg(ph, 0, 0, -0.35, 0.3, 0.55);
      } else if (s.action === 'fire') {
        chestX = seg(ph, REST_CH, REST_CH - 0.12, REST_CH + 0.18, 0.4, 0.55);
        headX = seg(ph, 0, -0.15, 0.30, 0.4, 0.55);
        jawX = seg(ph, 0, 0, -0.5, 0.4, 0.55);
        neckX = seg(ph, REST_NECK, REST_NECK - 0.08, REST_NECK + 0.10, 0.4, 0.55);
      } else if (s.action === 'hit') {
        const flinch = ph < 0.3 ? smooth(ph / 0.3) : (1 - smooth((ph - 0.3) / 0.7));
        spineX -= flinch * 0.25;
        chestX -= flinch * 0.20;
        headX -= flinch * 0.30;
        headZ += flinch * 0.15;
        pelZ -= flinch * 0.08;
        for (const a of arms) armPose[a.sign].shX += flinch * 0.15;
      } else if (s.action === 'block') {
        const b = smooth(Math.min(1, ph * 3));
        pelY -= b * 0.10;
        pelZ -= b * 0.08;
        spineX += b * 0.20;
        chestX += b * 0.10;
        headX += b * 0.30;
        for (const a of arms) {
          armPose[a.sign].shX = lerp(REST_SH, -1.1, b);
          armPose[a.sign].elX = lerp(REST_EL, 1.3, b);
          armPose[a.sign].shZ = 0.05 * a.sign;
        }
      } else if (s.action === 'gather' || s.action === 'deposit') {
        const downUp = ph < 0.5 ? smooth(ph / 0.5) : (1 - smooth((ph - 0.5) / 0.5));
        spineX = lerp(REST_SP, REST_SP + 0.5, downUp);
        chestX = lerp(REST_CH, REST_CH + 0.35, downUp);
        neckX = lerp(REST_NECK, REST_NECK - 0.5, downUp);
        headX = lerp(0, 0.35, downUp);
        pelY -= downUp * 0.18;
        const isGather = s.action === 'gather';
        for (const a of arms) {
          armPose[a.sign].shX = lerp(REST_SH, -0.9, downUp);
          armPose[a.sign].elX = lerp(REST_EL, 1.4, downUp);
          armPose[a.sign].haX = lerp(REST_HAND, isGather ? 0.4 : -0.4, downUp);
        }
      } else if (s.action === 'eat') {
        const trap = trapezoid(ph, 0.15, 0.15);
        headX = lerp(0, 0.55, trap);
        neckX = lerp(REST_NECK, REST_NECK - 0.45, trap);
        jawX = Math.sin(ph * Math.PI * 2 * 3) * 0.18 * trap;
        spineX = lerp(REST_SP, REST_SP + 0.15, trap);
      } else if (s.action === 'drink') {
        const trap = trapezoid(ph, 0.2, 0.2);
        headX = lerp(0, 0.60, trap);
        neckX = lerp(REST_NECK, REST_NECK - 0.50, trap);
        jawX = Math.sin(ph * Math.PI * 2 * 1.5) * 0.05 * trap;
        spineX = lerp(REST_SP, REST_SP + 0.12, trap);
      } else if (s.action === 'jump') {
        const crouch = ph < 0.33 ? smooth(ph / 0.33) : Math.max(0, 1 - smooth((ph - 0.33) / 0.2));
        const extension = ph < 0.33 ? 0 : smooth((ph - 0.33) / 0.67);
        pelY = REST_PELVIS_Y - crouch * 0.22 + extension * 0.18;
        spineX = REST_SP + crouch * 0.30 - extension * 0.25;
        for (const l of legs) {
          legPose[l.sign].hiX = REST_HIP + crouch * 0.5 - extension * 0.35;
          legPose[l.sign].knX = REST_KNEE + crouch * 0.7 - extension * 0.5;
        }
        for (const a of arms) {
          armPose[a.sign].shX = REST_SH + crouch * 0.4 - extension * 0.9;
          armPose[a.sign].elX = REST_EL - extension * 0.3;
        }
      } else if (s.action === 'land') {
        const legParam = ph < 0.25 ? smooth(ph / 0.25)
          : ph < 0.5 ? 1 - 2 * smooth((ph - 0.25) / 0.25)
          : -1 + smooth((ph - 0.5) / 0.5);
        pelY = legParam >= 0 ? REST_PELVIS_Y + legParam * 0.10 : REST_PELVIS_Y + legParam * 0.30;
        for (const l of legs) {
          legPose[l.sign].hiX = REST_HIP - legParam * 0.3;
          legPose[l.sign].knX = REST_KNEE - legParam * 0.5;
        }
        spineX = REST_SP - legParam * 0.15;
      } else if (s.action === 'signal') {
        const env = trapezoid(ph, 0.25, 0.35);
        pelY = REST_PELVIS_Y + env * 0.45;
        for (const l of legs) {
          legPose[l.sign].hiX = REST_HIP - env * 0.5;
          legPose[l.sign].knX = REST_KNEE - env * 0.30;
        }
        chestX = REST_CH - env * 0.30;
        spineX = REST_SP - env * 0.20;
        headX = -env * 0.20;
        jawX = -env * 0.40;
        const beatSpeed = ph * Math.PI * 2 * 6;
        for (const a of arms) {
          armPose[a.sign].shZ = 0.10 * a.sign + env * 0.9 * a.sign;
          armPose[a.sign].shX = REST_SH - env * 0.6;
          const beatOff = a.sign > 0 ? 0 : Math.PI;
          armPose[a.sign].elX = REST_EL + Math.sin(beatSpeed + beatOff) * 0.20 * env;
        }
      } else if (s.action === 'sleep' || s.action === 'wake') {
        const raw = smooth(ph);
        const w = s.action === 'sleep' ? raw : (1 - raw);
        pelY = lerp(REST_PELVIS_Y, 0.30, w);
        pelRX = lerp(0, 0.30, w);
        pelRZ = lerp(0, 0.90, w);
        spineX = lerp(REST_SP, 0.60, w);
        chestX = lerp(REST_CH, 0.35, w);
        neckX = lerp(REST_NECK, 0.90, w);
        headX = lerp(0, 0.40, w);
        eyeScale = lerp(1, 0.15, w);
        for (const l of legs) {
          legPose[l.sign].hiX = lerp(REST_HIP, -1.0, w);
          legPose[l.sign].knX = lerp(REST_KNEE, 1.8, w);
        }
        for (const a of arms) {
          armPose[a.sign].shX = lerp(REST_SH, -1.3, w);
          armPose[a.sign].elX = lerp(REST_EL, 1.6, w);
        }
      } else if (s.action === 'die') {
        const w = smooth(ph);
        pelY = lerp(REST_PELVIS_Y, 0.18, w);
        pelRX = lerp(0, 0.5, w);
        pelRZ = lerp(0, 1.5, w);
        pelZ = lerp(0, -0.15, w);
        spineX = lerp(REST_SP, 0.4, w);
        chestX = lerp(REST_CH, 0.3, w);
        neckX = lerp(REST_NECK, 0.7, w);
        headX = lerp(0, 0.5, w);
        headZ = lerp(0, 0.6, w);
        jawX = lerp(0, -0.4, w);
        legPose[1].hiX = lerp(REST_HIP, 0.9, w); legPose[1].knX = lerp(REST_KNEE, -0.3, w);
        legPose[-1].hiX = lerp(REST_HIP, -0.6, w); legPose[-1].knX = lerp(REST_KNEE, 1.4, w);
        armPose[1].shX = lerp(REST_SH, -1.6, w); armPose[1].elX = lerp(REST_EL, 0.3, w);
        armPose[-1].shX = lerp(REST_SH, 0.8, w); armPose[-1].elX = lerp(REST_EL, 1.9, w);
      } else if (s.action === 'evolve') {
        let brace = 0, openAmt = 0;
        if (ph < 0.2) { brace = smooth(ph / 0.2); openAmt = 0; }
        else if (ph < 0.75) { const tt = smooth(Math.min(1, (ph - 0.2) / 0.3)); openAmt = tt; brace = 1 - tt; }
        else { const tt = smooth((ph - 0.75) / 0.25); openAmt = 1 - tt; brace = 0; }
        spineX += brace * 0.25 - openAmt * 0.35;
        chestX -= openAmt * 0.25;
        chestScale = 1 - brace * 0.06 + openAmt * 0.12;
        headX -= openAmt * 0.35;
        jawX -= openAmt * 0.30;
        pelY += openAmt * 0.05;
        for (const a of arms) {
          armPose[a.sign].shZ = 0.10 * a.sign + openAmt * 1.0 * a.sign;
          armPose[a.sign].shX = REST_SH - openAmt * 0.7 + brace * 0.3;
          armPose[a.sign].elX = REST_EL + brace * 0.4 - openAmt * 0.2;
        }
      }
    }

    // ---------------- turn overlay (always additive) ----------------
    spineY += turn * 0.15;
    chestY += turn * 0.10;
    neckY += turn * 0.25;
    headY += turn * 0.35;
    pelRZ += -turn * 0.08;

    // ---------------- hurt overlay (always additive, scales with damage) ----------------
    const hurtAmt = clamp01((1 - health) / 0.8);
    if (hurtAmt > 0) {
      armPose[1].shZ += hurtAmt * 0.30;
      armPose[1].elX += hurtAmt * 0.35;
      headX += hurtAmt * 0.25;
      spineX += hurtAmt * 0.15;
      pelY -= hurtAmt * 0.08;
      legPose[1].hiX += hurtAmt * 0.15;
      legPose[1].knX += hurtAmt * 0.10;
      legPose[1].ftX += hurtAmt * 0.20;
    }

    // ---------------- commit ----------------
    pelvis.position.set(pelX, pelY, pelZ);
    pelvis.rotation.set(pelRX, pelRY, pelRZ);
    spine.rotation.set(spineX, spineY, spineZ);
    chest.rotation.set(chestX, chestY, chestZ);
    chestMesh.scale.set(chestScale, chestScale, chestScale);
    neck.rotation.set(neckX, neckY, neckZ);
    head.rotation.set(headX, headY, headZ);
    jaw.rotation.set(jawX, 0, 0);
    eyeL.scale.setScalar(eyeScale);
    eyeR.scale.setScalar(eyeScale);

    for (const a of arms) {
      const p = armPose[a.sign];
      a.shoulder.rotation.set(p.shX, 0, p.shZ);
      a.elbow.rotation.set(p.elX, 0, 0);
      a.hand.rotation.set(p.haX, 0, 0);
    }
    for (const l of legs) {
      const p = legPose[l.sign];
      l.hip.rotation.set(p.hiX, 0, p.hiZ);
      l.knee.rotation.set(p.knX, 0, 0);
      l.foot.rotation.set(p.ftX, 0, 0);
    }
  };

  return gorilla;
}