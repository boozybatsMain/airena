function build(THREE, TSL) {
  const { Fn, vec3, dot, sin, fract, positionLocal, normalWorld, cameraPosition, positionWorld, normalize, max, pow, oneMinus, clamp: tclamp } = TSL;

  // ---------- shader material helper ----------
  function hashNoise(p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  }
  function organicMaterial(hex, roughness, speck) {
    const mat = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(hex),
      roughness: roughness,
      metalness: 0.04,
    });
    const c = mat.color;
    const n1 = hashNoise(positionLocal.mul(7.0));
    const n2 = hashNoise(positionLocal.mul(29.0).add(vec3(4.1, 1.7, 8.3)));
    const s = n1.mul(0.6).add(n2.mul(0.4));
    mat.colorNode = vec3(c.r, c.g, c.b).mul(TSL.float(1.0).sub(TSL.float(speck).mul(0.5)).add(s.mul(speck)));
    mat.roughnessNode = tclamp(TSL.float(roughness).add(s.mul(0.14).sub(0.07)), 0.35, 1.0);
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const fres = pow(oneMinus(max(dot(normalWorld, viewDir), 0.0)), 3.2);
    mat.emissiveNode = vec3(0.045, 0.045, 0.05).mul(fres);
    return mat;
  }

  const furMat = organicMaterial(0x232022, 0.88, 0.22);
  const saddleMat = organicMaterial(0xb7b3a8, 0.55, 0.14);
  const skinMat = organicMaterial(0x171310, 0.55, 0.1);
  const eyeMat = new THREE.MeshStandardNodeMaterial({ color: 0x0b0908, roughness: 0.25, metalness: 0.15 });
  const mouthMat = new THREE.MeshStandardNodeMaterial({ color: 0x3a0e0e, roughness: 0.7, metalness: 0.0 });
  const toothMat = new THREE.MeshStandardNodeMaterial({ color: 0xe8e0d0, roughness: 0.4, metalness: 0.0 });

  // ---------- helpers ----------
  function capsuleBone(radius, totalLen, mat, segRadial) {
    const g = new THREE.CapsuleGeometry(radius, Math.max(totalLen - 2 * radius, 0.02), 4, segRadial || 8);
    const m = new THREE.Mesh(g, mat);
    m.position.y = -totalLen / 2;
    return m;
  }
  function joint(name) {
    const o = new THREE.Object3D();
    o.name = name;
    return o;
  }

  // ================= ROOT =================
  const root = new THREE.Group();
  root.name = 'Gorilla';

  // ---------- REST POSE CONSTANTS ----------
  const REST = {
    hipsY: 0.66,
    thighX: -0.30, shinX: 0.78, footX: -0.35,
    upperArmX: -0.15, upperArmZ: 0.20, forearmX: 0.42, handX: 0.08,
    spineX: 0.22, chestX: 0.10, neckX: -0.15, headX: 0.05,
  };

  // ================= HIPS =================
  const Hips = joint('Hips');
  Hips.position.set(0, REST.hipsY, 0);
  root.add(Hips);

  // pelvis visual
  {
    const pelvisGeo = new THREE.SphereGeometry(0.30, 14, 10);
    const pelvis = new THREE.Mesh(pelvisGeo, furMat);
    pelvis.name = 'PelvisMesh';
    pelvis.scale.set(1.05, 0.78, 0.9);
    pelvis.position.set(0, -0.03, -0.03);
    Hips.add(pelvis);
  }

  // ---------- SPINE / CHEST / NECK / HEAD ----------
  const Spine = joint('Spine');
  Spine.position.set(0, 0.10, -0.02);
  Spine.rotation.x = REST.spineX;
  Hips.add(Spine);

  const Chest = joint('Chest');
  Chest.position.set(0, 0.34, 0.10);
  Chest.rotation.x = REST.chestX;
  Spine.add(Chest);

  {
    const chestGeo = new THREE.SphereGeometry(0.40, 18, 14);
    const chestMesh = new THREE.Mesh(chestGeo, furMat);
    chestMesh.name = 'ChestMesh';
    chestMesh.scale.set(1.18, 1.0, 0.9);
    chestMesh.position.set(0, 0.06, 0.02);
    Chest.add(chestMesh);

    const bellyGeo = new THREE.SphereGeometry(0.30, 14, 10);
    const bellyMesh = new THREE.Mesh(bellyGeo, furMat);
    bellyMesh.name = 'BellyMesh';
    bellyMesh.scale.set(1.1, 0.9, 0.95);
    bellyMesh.position.set(0, -0.24, 0.08);
    Chest.add(bellyMesh);

    const saddleGeo = new THREE.SphereGeometry(0.32, 14, 10);
    const saddle = new THREE.Mesh(saddleGeo, saddleMat);
    saddle.name = 'Saddle';
    saddle.scale.set(1.0, 0.6, 0.55);
    saddle.position.set(0, -0.06, -0.30);
    Chest.add(saddle);

    // deltoid bumps for shoulder width read
    const deltGeo = new THREE.SphereGeometry(0.16, 10, 8);
    const deltL = new THREE.Mesh(deltGeo, furMat);
    deltL.name = 'DeltoidL';
    deltL.position.set(-0.48, 0.14, 0.05);
    Chest.add(deltL);
    const deltR = new THREE.Mesh(deltGeo, furMat);
    deltR.name = 'DeltoidR';
    deltR.position.set(0.48, 0.14, 0.05);
    Chest.add(deltR);
  }

  const Neck = joint('Neck');
  Neck.position.set(0, 0.30, 0.14);
  Neck.rotation.x = REST.neckX;
  Chest.add(Neck);
  {
    const neckGeo = new THREE.CylinderGeometry(0.17, 0.20, 0.16, 10);
    const neckMesh = new THREE.Mesh(neckGeo, furMat);
    neckMesh.name = 'NeckMesh';
    neckMesh.position.set(0, 0.08, 0.0);
    Neck.add(neckMesh);
  }

  const Head = joint('Head');
  Head.position.set(0, 0.14, 0.04);
  Head.rotation.x = REST.headX;
  Neck.add(Head);
  {
    const skullGeo = new THREE.SphereGeometry(0.26, 16, 12);
    const skull = new THREE.Mesh(skullGeo, furMat);
    skull.name = 'HeadMesh';
    skull.scale.set(1.0, 1.05, 1.02);
    skull.position.set(0, 0.06, -0.02);
    Head.add(skull);

    const crestGeo = new THREE.ConeGeometry(0.07, 0.12, 8);
    const crest = new THREE.Mesh(crestGeo, furMat);
    crest.name = 'SagittalCrest';
    crest.position.set(0, 0.26, -0.04);
    Head.add(crest);

    const browGeo = new THREE.BoxGeometry(0.34, 0.08, 0.10);
    const brow = new THREE.Mesh(browGeo, skinMat);
    brow.name = 'BrowRidge';
    brow.position.set(0, 0.10, 0.19);
    Head.add(brow);

    const earGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const earL = new THREE.Mesh(earGeo, skinMat);
    earL.name = 'EarL';
    earL.scale.set(0.6, 1.0, 0.4);
    earL.position.set(-0.25, 0.02, -0.01);
    Head.add(earL);
    const earR = new THREE.Mesh(earGeo, skinMat);
    earR.name = 'EarR';
    earR.scale.set(0.6, 1.0, 0.4);
    earR.position.set(0.25, 0.02, -0.01);
    Head.add(earR);

    const eyeGeo = new THREE.SphereGeometry(0.028, 8, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.name = 'EyeL';
    eyeL.position.set(-0.10, 0.08, 0.22);
    Head.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.name = 'EyeR';
    eyeR.position.set(0.10, 0.08, 0.22);
    Head.add(eyeR);
  }

  const Jaw = joint('Jaw');
  Jaw.position.set(0, -0.07, 0.15);
  Jaw.rotation.x = 0;
  Head.add(Jaw);
  {
    const jawGeo = new THREE.BoxGeometry(0.24, 0.13, 0.22);
    const jawMesh = new THREE.Mesh(jawGeo, skinMat);
    jawMesh.name = 'JawMesh';
    jawMesh.position.set(0, -0.02, 0.08);
    Jaw.add(jawMesh);

    const mouthGeo = new THREE.BoxGeometry(0.16, 0.05, 0.05);
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.name = 'MouthInterior';
    mouth.position.set(0, 0.03, 0.16);
    Jaw.add(mouth);

    const toothGeo = new THREE.BoxGeometry(0.20, 0.03, 0.04);
    const teeth = new THREE.Mesh(toothGeo, toothMat);
    teeth.name = 'Teeth';
    teeth.position.set(0, 0.055, 0.17);
    Jaw.add(teeth);
  }

  // ================= ARMS =================
  function buildArm(side) {
    const sign = side === 'L' ? 1 : -1;
    const upper = joint('UpperArm' + side);
    upper.position.set(0.52 * sign, 0.14, 0.06);
    upper.rotation.set(REST.upperArmX, 0, -sign * REST.upperArmZ);
    Chest.add(upper);
    upper.add(capsuleBone(0.135, 0.46, furMat, 8));

    const fore = joint('Forearm' + side);
    fore.position.set(0, -0.44, 0.02);
    fore.rotation.x = REST.forearmX;
    upper.add(fore);
    fore.add(capsuleBone(0.11, 0.40, furMat, 8));

    const hand = joint('Hand' + side);
    hand.position.set(0, -0.40, 0.04);
    hand.rotation.x = REST.handX;
    fore.add(hand);
    {
      const fistGeo = new THREE.BoxGeometry(0.20, 0.18, 0.22);
      const fist = new THREE.Mesh(fistGeo, skinMat);
      fist.name = 'Fist' + side;
      fist.position.set(0, -0.11, 0.02);
      hand.add(fist);
      const knuckleGeo = new THREE.SphereGeometry(0.05, 8, 6);
      for (let i = -1; i <= 1; i++) {
        const k = new THREE.Mesh(knuckleGeo, skinMat);
        k.name = 'Knuckle' + side + (i + 2);
        k.position.set(i * 0.06, -0.17, 0.13);
        hand.add(k);
      }
    }
    return { upper, fore, hand };
  }
  const armL = buildArm('L');
  const armR = buildArm('R');

  // ================= LEGS =================
  function buildLeg(side) {
    const sign = side === 'L' ? 1 : -1;
    const thigh = joint('Thigh' + side);
    thigh.position.set(0.24 * sign, -0.06, -0.02);
    thigh.rotation.x = REST.thighX;
    Hips.add(thigh);
    thigh.add(capsuleBone(0.16, 0.38, furMat, 8));

    const shin = joint('Shin' + side);
    shin.position.set(0, -0.38, 0.02);
    shin.rotation.x = REST.shinX;
    thigh.add(shin);
    shin.add(capsuleBone(0.13, 0.36, furMat, 8));

    const foot = joint('Foot' + side);
    foot.position.set(0, -0.36, 0.04);
    foot.rotation.x = REST.footX;
    shin.add(foot);
    {
      const footGeo = new THREE.BoxGeometry(0.19, 0.11, 0.32);
      const footMesh = new THREE.Mesh(footGeo, skinMat);
      footMesh.name = 'FootMesh' + side;
      footMesh.position.set(0, -0.07, 0.10);
      foot.add(footMesh);
      const toeGeo = new THREE.SphereGeometry(0.045, 8, 6);
      for (let i = -1; i <= 1; i++) {
        const toe = new THREE.Mesh(toeGeo, skinMat);
        toe.name = 'Toe' + side + (i + 2);
        toe.position.set(i * 0.05, -0.09, 0.24);
        foot.add(toe);
      }
    }
    return { thigh, shin, foot };
  }
  const legL = buildLeg('L');
  const legR = buildLeg('R');

  // ================= JOINT MAP =================
  const J = {
    Hips, Spine, Chest, Neck, Head, Jaw,
    UpperArmL: armL.upper, ForearmL: armL.fore, HandL: armL.hand,
    UpperArmR: armR.upper, ForearmR: armR.fore, HandR: armR.hand,
    ThighL: legL.thigh, ShinL: legL.shin, FootL: legL.foot,
    ThighR: legR.thigh, ShinR: legR.shin, FootR: legR.foot,
  };

  // ================= POSE HELPERS =================
  const TAU = Math.PI * 2;
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function smooth(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function kf3(p, v0, v1, v2, split) {
    split = split === undefined ? 0.4 : split;
    if (p < split) return lerp(v0, v1, smooth(0, split, p));
    return lerp(v1, v2, smooth(split, 1, p));
  }

  const sidesCfg = [
    { key: 'L', sign: 1, legPhase: 0 },
    { key: 'R', sign: -1, legPhase: Math.PI },
  ];

  // ================= POSE FUNCTION =================
  object_pose:
  root.userData.pose = (s) => {
    const speed = s.speed || 0;
    const stride = s.stride || 0;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = s.health === undefined ? 1 : s.health;
    const action = s.action || null;
    const phase = s.phase || 0;
    const t = s.t || 0;

    // working pose values (start at REST)
    let hipsY = REST.hipsY, hipsX = 0, hipsY_pos = 0, hipsZpos = 0, hipsRotX = 0, hipsRotY = 0, hipsRotZ = 0;
    let spineX = REST.spineX, spineY = 0, spineZ = 0;
    let chestX = REST.chestX, chestY = 0, chestZ = 0, chestScale = 1;
    let neckX = REST.neckX, neckY = 0;
    let headX = REST.headX, headY = 0, headZ = 0;
    let jawX = 0;
    const arm = { L: { x: REST.upperArmX, z: -REST.upperArmZ, fx: REST.forearmX, hx: REST.handX },
                  R: { x: REST.upperArmX, z: REST.upperArmZ, fx: REST.forearmX, hx: REST.handX } };
    const leg = { L: { x: REST.thighX, sx: REST.shinX, fx: REST.footX },
                  R: { x: REST.thighX, sx: REST.shinX, fx: REST.footX } };

    if (action) {
      // ============ ACTIONS ============
      if (action === 'attack') {
        const sp = 0.35;
        arm.L.x = arm.R.x = kf3(phase, -1.1, 1.0, REST.upperArmX, sp);
        arm.L.fx = arm.R.fx = kf3(phase, 0.9, 0.15, REST.forearmX, sp);
        spineX = kf3(phase, REST.spineX - 0.1, REST.spineX + 0.55, REST.spineX, sp);
        chestX = kf3(phase, REST.chestX - 0.05, REST.chestX + 0.3, REST.chestX, sp);
        jawX = kf3(phase, 0.05, 0.55, 0.0, 0.5);
        headX = kf3(phase, REST.headX - 0.1, REST.headX + 0.25, REST.headX, sp);
        hipsY = REST.hipsY - kf3(phase, 0.05, 0.15, 0.0, sp);
        leg.L.x = leg.R.x = kf3(phase, REST.thighX - 0.05, REST.thighX + 0.1, REST.thighX, sp);
      } else if (action === 'fire') {
        const sp = 0.4;
        arm.R.x = kf3(phase, -1.3, 0.9, REST.upperArmX, sp);
        arm.R.fx = kf3(phase, 1.2, 0.1, REST.forearmX, sp);
        arm.L.x = kf3(phase, REST.upperArmX - 0.1, REST.upperArmX + 0.15, REST.upperArmX, sp);
        spineX = kf3(phase, REST.spineX - 0.15, REST.spineX + 0.35, REST.spineX, sp);
        headX = kf3(phase, REST.headX - 0.1, REST.headX + 0.1, REST.headX, sp);
        hipsY = REST.hipsY - kf3(phase, 0.03, 0.10, 0.0, sp);
      } else if (action === 'hit') {
        const env = kf3(phase, 0, 1, 0, 0.15);
        headX += env * 0.25;
        headZ += env * 0.22;
        spineX -= env * 0.15;
        arm.L.z -= env * 0.15;
        arm.R.z += env * 0.15;
        hipsY -= env * 0.05;
      } else if (action === 'block') {
        const env = phase < 0.2 ? smooth(0, 0.2, phase) : (phase < 0.8 ? 1 : 1 - smooth(0.8, 1, phase));
        hipsY -= env * 0.12;
        spineX = lerp(REST.spineX, REST.spineX + 0.35, env);
        arm.L.x = lerp(REST.upperArmX, -0.9, env);
        arm.R.x = lerp(REST.upperArmX, -0.9, env);
        arm.L.z = lerp(arm.L.z, -0.5, env);
        arm.R.z = lerp(arm.R.z, 0.5, env);
        arm.L.fx = lerp(REST.forearmX, 1.3, env);
        arm.R.fx = lerp(REST.forearmX, 1.3, env);
        headX = lerp(REST.headX, 0.3, env);
      } else if (action === 'gather') {
        const sp = 0.5;
        hipsY = REST.hipsY - kf3(phase, 0, 0.35, 0.0, sp);
        spineX = kf3(phase, REST.spineX, REST.spineX + 0.7, REST.spineX, sp);
        arm.L.x = arm.R.x = kf3(phase, REST.upperArmX, -1.0, REST.upperArmX, sp);
        arm.L.fx = arm.R.fx = kf3(phase, REST.forearmX, 0.3, REST.forearmX, sp);
        arm.L.hx = arm.R.hx = kf3(phase, 0, 0.4, 0, sp);
        headX = kf3(phase, REST.headX, REST.headX + 0.4, REST.headX, sp);
      } else if (action === 'deposit') {
        const envD = phase < 0.4 ? smooth(0, 0.4, phase) : (phase < 0.6 ? 1 : 1 - smooth(0.6, 1, phase));
        hipsY = REST.hipsY - 0.30 * envD;
        spineX = REST.spineX + 0.6 * envD;
        arm.L.x = lerp(REST.upperArmX, -0.85, envD);
        arm.R.x = lerp(REST.upperArmX, -0.85, envD);
        arm.L.fx = lerp(REST.forearmX, 0.25, envD);
        arm.R.fx = lerp(REST.forearmX, 0.25, envD);
        const release = phase > 0.85 ? smooth(0.85, 1, phase) : 0;
        arm.L.hx = arm.R.hx = lerp(0, -0.3, envD) * (1 - release);
        headX = lerp(REST.headX, REST.headX + 0.35, envD);
      } else if (action === 'eat') {
        const baseDown = phase < 0.15 ? smooth(0, 0.15, phase) : (phase < 0.85 ? 1 : 1 - smooth(0.85, 1, phase));
        const chew = Math.sin(phase * TAU * 2.5) * 0.5 + 0.5;
        headX = lerp(REST.headX, REST.headX + 0.45, baseDown) + chew * 0.08 * baseDown;
        jawX = chew * 0.35 * baseDown;
        spineX = lerp(REST.spineX, REST.spineX + 0.4, baseDown);
        arm.L.x = arm.R.x = lerp(REST.upperArmX, -0.5, baseDown);
        hipsY = REST.hipsY - 0.15 * baseDown;
      } else if (action === 'drink') {
        const d = phase < 0.25 ? smooth(0, 0.25, phase) : (phase < 0.8 ? 1 : 1 - smooth(0.8, 1, phase));
        headX = lerp(REST.headX, REST.headX + 0.55, d);
        spineX = lerp(REST.spineX, REST.spineX + 0.5, d);
        hipsY = REST.hipsY - 0.2 * d;
      } else if (action === 'jump') {
        const crouch = phase < 0.33 ? smooth(0, 0.33, phase) : Math.max(0, 1 - smooth(0.33, 0.6, phase));
        const extend = phase < 0.33 ? 0 : smooth(0.33, 0.65, phase);
        hipsY = REST.hipsY - 0.28 * crouch + 0.15 * extend;
        leg.L.x = leg.R.x = REST.thighX - 0.5 * crouch - 0.6 * extend;
        leg.L.sx = leg.R.sx = REST.shinX + 0.6 * crouch - 0.3 * extend;
        arm.L.x = arm.R.x = REST.upperArmX - 0.3 * crouch - 0.7 * extend;
        spineX = REST.spineX + 0.2 * crouch - 0.3 * extend;
      } else if (action === 'land') {
        const sp = 0.3;
        const reachV = { hy: REST.hipsY, tx: REST.thighX - 0.4, sx: REST.shinX - 0.2, spx: REST.spineX - 0.1, ax: REST.upperArmX - 0.3, az: 0.3 };
        const impactV = { hy: REST.hipsY - 0.35, tx: REST.thighX - 0.6, sx: REST.shinX + 1.0, spx: REST.spineX + 0.3, ax: -0.4, az: 0.4 };
        const restV = { hy: REST.hipsY, tx: REST.thighX, sx: REST.shinX, spx: REST.spineX, ax: REST.upperArmX, az: 0 };
        function land3(a, b, c) { return kf3(phase, a, b, c, sp); }
        hipsY = land3(reachV.hy, impactV.hy, restV.hy);
        leg.L.x = leg.R.x = land3(reachV.tx, impactV.tx, restV.tx);
        leg.L.sx = leg.R.sx = land3(reachV.sx, impactV.sx, restV.sx);
        spineX = land3(reachV.spx, impactV.spx, restV.spx);
        arm.L.x = arm.R.x = land3(reachV.ax, impactV.ax, restV.ax);
        arm.L.z -= land3(0, impactV.az, 0);
        arm.R.z += land3(0, impactV.az, 0);
      } else if (action === 'signal') {
        const riseT = phase < 0.3 ? smooth(0, 0.3, phase) : (phase < 0.75 ? 1 : 1 - smooth(0.75, 1, phase));
        hipsY = REST.hipsY + 0.08 * riseT;
        leg.L.x = leg.R.x = REST.thighX + 0.15 * riseT;
        leg.L.sx = leg.R.sx = REST.shinX - 0.2 * riseT;
        spineX = REST.spineX - 0.25 * riseT;
        chestX = REST.chestX - 0.2 * riseT;
        const beatL = riseT * Math.max(0, Math.sin(phase * TAU * 6));
        const beatR = riseT * Math.max(0, Math.sin(phase * TAU * 6 + Math.PI));
        arm.L.x = lerp(REST.upperArmX, -0.9, riseT) + beatL * 0.25;
        arm.R.x = lerp(REST.upperArmX, -0.9, riseT) + beatR * 0.25;
        arm.L.fx = lerp(REST.forearmX, 0.9, riseT) - beatL * 0.5;
        arm.R.fx = lerp(REST.forearmX, 0.9, riseT) - beatR * 0.5;
        headX = REST.headX - 0.2 * riseT;
        jawX = riseT * 0.4;
      } else if (action === 'sleep') {
        const lieT = smooth(0, 0.85, phase);
        hipsY = lerp(REST.hipsY, 0.16, lieT);
        spineX = lerp(REST.spineX, 1.3, lieT);
        spineZ = lerp(0, 0.3, lieT);
        chestX = lerp(REST.chestX, 0.3, lieT);
        headX = lerp(REST.headX, 0.7, lieT);
        leg.L.x = leg.R.x = lerp(REST.thighX, -0.9, lieT);
        leg.L.sx = leg.R.sx = lerp(REST.shinX, 1.6, lieT);
        arm.L.x = arm.R.x = lerp(REST.upperArmX, -0.7, lieT);
        arm.L.fx = arm.R.fx = lerp(REST.forearmX, 1.4, lieT);
      } else if (action === 'wake') {
        const lyingHipsY = 0.16, lyingSpineX = 1.3, lyingSpineZ = 0.3, lyingChestX = 0.3, lyingHeadX = 0.7, lyingThighX = -0.9, lyingShinX = 1.6, lyingArmX = -0.7, lyingForeX = 1.4;
        const riseT = smooth(0.15, 0.85, phase);
        const stir = (phase < 0.15) ? Math.sin(phase * 60) * 0.03 : 0;
        hipsY = lerp(lyingHipsY, REST.hipsY, riseT);
        spineX = lerp(lyingSpineX, REST.spineX, riseT);
        spineZ = lerp(lyingSpineZ, 0, riseT);
        chestX = lerp(lyingChestX, REST.chestX, riseT);
        headX = lerp(lyingHeadX, REST.headX, riseT) + stir;
        leg.L.x = leg.R.x = lerp(lyingThighX, REST.thighX, riseT);
        leg.L.sx = leg.R.sx = lerp(lyingShinX, REST.shinX, riseT);
        arm.L.x = arm.R.x = lerp(lyingArmX, REST.upperArmX, riseT);
        arm.L.fx = arm.R.fx = lerp(lyingForeX, REST.forearmX, riseT);
      } else if (action === 'die') {
        const collapseT = smooth(0.1, 0.8, phase);
        const spasm = phase < 0.1 ? Math.sin(phase * 90) * 0.1 * (1 - phase * 10) : 0;
        hipsY = lerp(REST.hipsY, 0.08, collapseT);
        spineX = lerp(REST.spineX, 1.5, collapseT) + spasm;
        spineZ = lerp(0, 0.6, collapseT);
        headX = lerp(REST.headX, 0.9, collapseT);
        headZ = lerp(0, 0.4, collapseT);
        arm.L.x = lerp(REST.upperArmX, -1.4, collapseT);
        arm.R.x = lerp(REST.upperArmX, 0.3, collapseT);
        arm.L.z = lerp(arm.L.z, -0.9, collapseT);
        arm.R.z = lerp(arm.R.z, 1.0, collapseT);
        leg.L.x = lerp(REST.thighX, -0.2, collapseT);
        leg.R.x = lerp(REST.thighX, 0.6, collapseT);
        jawX = lerp(0, 0.2, collapseT);
      } else if (action === 'evolve') {
        const crouch = phase < 0.25 ? smooth(0, 0.25, phase) : Math.max(0, 1 - smooth(0.25, 0.35, phase));
        const rampUp = smooth(0.25, 0.55, Math.min(phase, 0.8));
        const rampDown = phase > 0.8 ? smooth(0.8, 1, phase) : 0;
        const openT = rampUp * (1 - rampDown);
        hipsY = REST.hipsY - 0.15 * crouch + 0.05 * openT;
        spineX = REST.spineX + 0.3 * crouch - 0.2 * openT;
        chestX = REST.chestX - 0.1 * crouch - 0.35 * openT;
        arm.L.x = lerp(REST.upperArmX * (1 - openT) + -0.3 * openT, REST.upperArmX, 0) ; // base
        arm.L.x = REST.upperArmX * (1 - openT) + -0.3 * openT;
        arm.R.x = REST.upperArmX * (1 - openT) + -0.3 * openT;
        arm.L.z = -REST.upperArmZ - openT * 0.9;
        arm.R.z = REST.upperArmZ + openT * 0.9;
        headX = REST.headX - 0.15 * openT;
        jawX = openT * 0.3;
      }
    } else {
      // ============ GAIT (locomotion) ============
      const g = smooth(1.5, 2.5, speed); // 0 = quadrupedal, 1 = bipedal run
      const quad = 1 - g;
      const stridePhase = stride * TAU;
      const bounceAmp = lerp(0.015, 0.10, clamp01(speed / 6));
      hipsY = REST.hipsY - Math.abs(Math.sin(stridePhase)) * bounceAmp;

      // crouch & lean blend
      const crouchQuad = lerp(REST.hipsY, 0.48, smooth(0, 2, Math.min(speed, 2)));
      const crouchBiped = lerp(0.70, 0.62, smooth(2, 6, speed));
      hipsY += lerp(crouchQuad, crouchBiped, g) - REST.hipsY;

      const spineQuad = lerp(REST.spineX, 0.55, smooth(0, 2, Math.min(speed, 2)));
      const spineBiped = lerp(0.40, 0.9, smooth(2, 6, speed));
      spineX = lerp(spineQuad, spineBiped, g);
      chestX = REST.chestX + (spineX - REST.spineX) * 0.4;

      // head aligns with spine at top speed
      const headAlignT = smooth(2, 6, speed);
      neckX = lerp(REST.neckX, -REST.spineX * 0.3, headAlignT * g);
      headX = lerp(REST.headX, 0.0, headAlignT * g);

      const legAmpQuad = lerp(0.18, 0.55, smooth(0, 2, Math.min(speed, 2)));
      const legAmpBiped = lerp(0.55, 1.0, smooth(2, 6, speed));
      const legAmp = lerp(legAmpQuad, legAmpBiped, g);
      const armAmpQuad = lerp(0.22, 0.60, smooth(0, 2, Math.min(speed, 2)));
      const armAmpBiped = lerp(0.55, 1.0, smooth(2, 6, speed));
      const armAmp = lerp(armAmpQuad, armAmpBiped, g);
      const kneeLift = lerp(0.5, 1.0, g);
      const elbowLift = lerp(0.5, 0.9, g);

      for (const cfg of sidesCfg) {
        const k = cfg.key;
        const ampMult = 1 + turn * 0.4 * cfg.sign;
        const legPhase = stridePhase + cfg.legPhase;
        const armPhase = legPhase + Math.PI;

        leg[k].x = REST.thighX + Math.cos(legPhase) * legAmp * ampMult;
        leg[k].sx = REST.shinX + Math.max(0, -Math.sin(legPhase)) * kneeLift * ampMult;
        leg[k].fx = REST.footX + Math.sin(legPhase) * 0.15;

        arm[k].x = REST.upperArmX + Math.cos(armPhase) * armAmp * ampMult;
        arm[k].fx = REST.forearmX + Math.max(0, -Math.sin(armPhase)) * elbowLift * ampMult;
        arm[k].hx = REST.handX;
      }

      // airborne overlay: stop cyclic legs, relax
      if (!grounded) {
        for (const cfg of sidesCfg) {
          const k = cfg.key;
          leg[k].x = REST.thighX - 0.55 + Math.sin(t * 3 + (k === 'L' ? 0 : 1.5)) * 0.05;
          leg[k].sx = REST.shinX + 1.0;
          leg[k].fx = -0.1;
          arm[k].x = REST.upperArmX - 0.35;
          arm[k].fx = 0.6;
        }
        arm.L.z = -REST.upperArmZ - 0.5;
        arm.R.z = REST.upperArmZ + 0.5;
        headX = REST.headX - 0.1;
        spineX = REST.spineX + 0.1;
      }

      // idle-only breathing / weight shift / head scan
      const idleFade = 1 - clamp01(speed / 1.0);
      if (idleFade > 0) {
        chestScale = 1 + Math.sin(t * 1.3) * 0.02 * idleFade;
        hipsX = Math.sin(t * 0.55) * 0.02 * idleFade;
        headY += Math.sin(t * 0.35) * 0.18 * idleFade;
        headZ += Math.sin(t * 0.5 + 1.0) * 0.03 * idleFade;
        spineZ += Math.sin(t * 0.4) * 0.02 * idleFade;
      }

      // turn overlay (added on top of gait)
      spineZ += turn * 0.20;
      chestZ += turn * 0.14;
      headY += turn * 0.4;
      hipsZpos += turn * -0.03;

      // hurt overlay (difference from standing, additive)
      const hurtT = clamp01(1 - health);
      if (hurtT > 0) {
        chestX += hurtT * 0.15;
        headX += hurtT * 0.20;
        headZ += hurtT * 0.18;
        spineZ += hurtT * 0.10;
        arm.R.x += hurtT * 0.30;
        arm.R.fx += hurtT * 0.35;
        arm.R.z += hurtT * 0.15;
        leg.R.x *= (1 - hurtT * 0.4);
        hipsY -= hurtT * 0.05;
      }
    }

    // ================= WRITE TO OBJECTS =================
    Hips.position.set(hipsX, hipsY, hipsZpos);
    Hips.rotation.set(hipsRotX, hipsRotY, hipsRotZ);

    Spine.rotation.set(spineX, spineY, spineZ);
    Chest.rotation.set(chestX, chestY, chestZ);
    Chest.scale.set(1, chestScale, 1);
    Neck.rotation.set(neckX, neckY, 0);
    Head.rotation.set(headX, headY, headZ);
    Jaw.rotation.x = jawX;

    J.UpperArmL.rotation.set(arm.L.x, 0, arm.L.z);
    J.ForearmL.rotation.x = arm.L.fx;
    J.HandL.rotation.x = arm.L.hx;
    J.UpperArmR.rotation.set(arm.R.x, 0, arm.R.z);
    J.ForearmR.rotation.x = arm.R.fx;
    J.HandR.rotation.x = arm.R.hx;

    J.ThighL.rotation.x = leg.L.x;
    J.ShinL.rotation.x = leg.L.sx;
    J.FootL.rotation.x = leg.L.fx;
    J.ThighR.rotation.x = leg.R.x;
    J.ShinR.rotation.x = leg.R.sx;
    J.FootR.rotation.x = leg.R.fx;
  };

  return root;
}