```javascript
function build(THREE, TSL) {
  const root = new THREE.Group();
  root.name = "ArmouredOctopus";

  const mantle = new THREE.Group();
  mantle.name = "Mantle";
  mantle.position.set(0, 1.15, 0);
  root.add(mantle);

  // ---------- materials ----------
  const matArmor = new THREE.MeshStandardMaterial({ color: 0x3a4a52, metalness: 0.85, roughness: 0.35 });
  const matArmorDark = new THREE.MeshStandardMaterial({ color: 0x22282c, metalness: 0.8, roughness: 0.4 });
  const matRing = new THREE.MeshStandardMaterial({ color: 0x8a97a0, metalness: 0.9, roughness: 0.25 });
  const matTentacle = new THREE.MeshStandardMaterial({ color: 0x2e5c55, metalness: 0.2, roughness: 0.6 });
  const matBeak = new THREE.MeshStandardMaterial({ color: 0x14171a, metalness: 0.6, roughness: 0.4 });
  const matEyeBall = new THREE.MeshStandardMaterial({ color: 0xe8e8e0, metalness: 0.1, roughness: 0.3 });

  const eyeGlow = TSL.uniform(1.0);
  const pupilMat = new THREE.MeshStandardNodeMaterial({ color: 0x000000 });
  pupilMat.emissiveNode = TSL.mul(
    TSL.vec3(0.15, 0.95, 1.0),
    TSL.mul(eyeGlow, TSL.add(0.55, TSL.mul(TSL.sin(TSL.mul(TSL.time, 2.0)), 0.45)))
  );

  // ---------- mantle shell & armor ----------
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), matArmor);
  shell.scale.set(1, 1.05, 1.2);
  shell.name = "MantleShell";
  mantle.add(shell);

  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.28, 6), matArmorDark);
  crown.position.set(0, 0.42, -0.05);
  crown.name = "PlateCrown";
  mantle.add(crown);

  function makeSidePlate(sign) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.4), matArmor);
    m.position.set(sign * 0.5, 0.15, 0.0);
    m.rotation.z = sign * 0.3;
    m.name = sign > 0 ? "PlateRight" : "PlateLeft";
    return m;
  }
  const plateLeft = makeSidePlate(-1);
  const plateRight = makeSidePlate(1);
  mantle.add(plateLeft, plateRight);

  const rearSpike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 6), matArmorDark);
  rearSpike.position.set(0, 0.05, -0.55);
  rearSpike.rotation.x = Math.PI / 2;
  rearSpike.name = "PlateRear";
  mantle.add(rearSpike);

  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.22), matArmor);
  brow.position.set(0, 0.28, 0.42);
  brow.name = "PlateBrow";
  mantle.add(brow);

  function makeEye(sign) {
    const eye = new THREE.Group();
    eye.name = sign > 0 ? "EyeRight" : "EyeLeft";
    eye.position.set(sign * 0.18, 0.26, 0.5);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), matEyeBall);
    ball.name = eye.name + "_Ball";
    eye.add(ball);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), pupilMat);
    pupil.position.z = 0.05;
    pupil.name = eye.name + "_Pupil";
    eye.add(pupil);
    return eye;
  }
  mantle.add(makeEye(1), makeEye(-1));

  const jawUpper = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 4), matBeak);
  jawUpper.position.set(0, 0.02, 0.62);
  jawUpper.rotation.x = Math.PI / 2;
  jawUpper.rotation.y = Math.PI / 4;
  jawUpper.name = "BeakUpper";
  mantle.add(jawUpper);

  const jaw = new THREE.Group();
  jaw.name = "Jaw";
  jaw.position.set(0, -0.05, 0.58);
  mantle.add(jaw);
  const jawLower = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 4), matBeak);
  jawLower.position.set(0, 0, 0.08);
  jawLower.rotation.x = -Math.PI / 2;
  jawLower.rotation.y = Math.PI / 4;
  jawLower.name = "BeakLower";
  jaw.add(jawLower);

  // ---------- tentacles ----------
  const ARM_ANGLES = [-157.5, -112.5, -67.5, -22.5, 22.5, 67.5, 112.5, 157.5].map(d => d * Math.PI / 180);
  const SEG_LEN = [0.42, 0.36, 0.30, 0.24];
  const SEG_RTOP = [0.15, 0.115, 0.085, 0.06];
  const SEG_RBOT = [0.115, 0.085, 0.06, 0.03];

  const tentacles = [];
  ARM_ANGLES.forEach((angle, idx) => {
    const n = idx + 1;
    const group = new THREE.Group();
    group.name = "Tentacle" + n;
    group.position.set(Math.sin(angle) * 0.42, -0.42, Math.cos(angle) * 0.42);
    group.rotation.order = "YXZ";
    const restLeanX = -1.05;
    group.rotation.set(restLeanX, angle, 0);
    mantle.add(group);

    let parent = group;
    const segs = [];
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Object3D();
      seg.name = "Tentacle" + n + "_Segment" + (i + 1);
      if (i > 0) seg.position.set(0, 0, SEG_LEN[i - 1]);
      parent.add(seg);

      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(SEG_RTOP[i], SEG_RBOT[i], SEG_LEN[i], 8), matTentacle);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.z = SEG_LEN[i] / 2;
      mesh.name = seg.name + "_Mesh";
      seg.add(mesh);

      const ring = new THREE.Mesh(new THREE.TorusGeometry(SEG_RTOP[i] * 1.05, 0.025, 6, 10), matRing);
      ring.rotation.x = Math.PI / 2;
      ring.name = seg.name + "_Ring";
      seg.add(ring);

      segs.push(seg);
      parent = seg;
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 6), matArmorDark);
    tip.position.z = SEG_LEN[3] + 0.02;
    tip.rotation.x = Math.PI / 2;
    tip.name = "Tentacle" + n + "_Tip";
    segs[3].add(tip);

    tentacles.push({ group, segs, angle, restLeanX, side: Math.sign(Math.sin(angle)) });
  });

  const PRIMARY = 4;   // front-right arm, used as the "weapon/hand"
  const SECONDARY = 3; // front-left arm, paired for block/signal
  const HURT_IDX = 0;  // rear-left arm favoured/limp when hurt/dying
  const HURT_SIDE = -1;

  const lerp = THREE.MathUtils.lerp;
  const smooth = THREE.MathUtils.smoothstep;
  const clamp = THREE.MathUtils.clamp;

  // ---------- pose ----------
  object_pose_holder: {}
  root.userData.pose = (s) => {
    const spd = Math.max(0, s.speed || 0);
    const stride = ((s.stride || 0) % 1 + 1) % 1;
    const turn = clamp(s.turn || 0, -1, 1);
    const grounded = s.grounded !== false;
    const health = s.health === undefined ? 1 : s.health;
    const t = s.t || 0;
    const action = s.action || null;
    const phase = clamp(s.phase || 0, 0, 1);

    const walk01 = clamp(spd, 0, 1);
    const runBlend = smooth(spd, 1.4, 2.4);
    const sprintBlend = smooth(spd, 3, 6);
    const creepBump = Math.max(0, 1 - Math.abs(spd - 0.5) / 0.5);
    const hurtAmt = clamp(1 - health, 0, 1);

    // ---- mantle baseline ----
    let mY = 1.15, mX = 0, mZ = 0;
    let rX = 0, rY = 0, rZ = 0;
    let sX = 1, sY = 1, sZ = 1;
    let jawRotX = 0.02;

    const breathe = Math.sin(t * 1.3) * 0.012 * (1 - walk01);
    sY *= 1 + breathe;

    const crouch = walk01 * 0.09 + creepBump * 0.08 - runBlend * 0.02;
    mY -= crouch;

    const bobAmp = (0.015 + spd * 0.01 + runBlend * 0.05) * walk01;
    const bob = Math.sin(stride * Math.PI * 4) * bobAmp;
    mY += bob;

    rX += -walk01 * 0.05 - sprintBlend * 0.28;
    rZ += turn * 0.20;
    rY += (1 - walk01) * Math.sin(t * 0.6) * 0.10 + turn * 0.05 * Math.sin(stride * Math.PI * 2) * walk01;

    sZ += sprintBlend * 0.30;
    sX -= sprintBlend * 0.06;
    sY -= sprintBlend * 0.04;

    if (!grounded) {
      rX -= 0.15;
      sY -= 0.05; sX += 0.03; sZ -= 0.03;
    }

    mY -= hurtAmt * 0.10;
    rZ += HURT_SIDE * hurtAmt * 0.16;
    rX += hurtAmt * 0.05;
    mX += HURT_SIDE * hurtAmt * 0.05;
    jawRotX += hurtAmt * 0.05;
    eyeGlow.value = clamp(0.25 + 0.75 * health, 0.1, 2.0);

    // ---- per-tentacle baseline (gait / stand / airborne) ----
    const insideSign = turn < 0 ? -1 : 1;

    const gx = new Array(8), gy = new Array(8), gz = new Array(8);
    const curlX = [], curlY = [];
    for (let i = 0; i < 8; i++) { curlX.push([0, 0, 0, 0]); curlY.push([0, 0, 0, 0]); }

    for (let i = 0; i < 8; i++) {
      const T = tentacles[i];
      const isInside = T.side === insideSign;

      if (!grounded) {
        // trailing / floating, no stepping
        const wob = Math.sin(t * 1.6 + i * 0.9) * 0.12;
        gx[i] = T.restLeanX + 0.35 + wob * 0.4;
        gy[i] = T.angle - 0.15 * T.side;
        gz[i] = 0;
        for (let k = 0; k < 4; k++) {
          curlX[i][k] = 0.35 + 0.15 * Math.sin(t * 1.4 + i + k * 0.6);
          curlY[i][k] = Math.sin(t * 1.1 + i * 0.7 + k) * 0.1;
        }
        continue;
      }

      if (walk01 <= 0.0001 && spd < 0.001) {
        // idle stand: slow independent sway, no stepping
        const wob = Math.sin(t * 0.7 + i * 0.8) * 0.08;
        gx[i] = T.restLeanX + wob * 0.3;
        gy[i] = T.angle + Math.sin(t * 0.5 + i) * 0.03;
        gz[i] = 0;
        for (let k = 0; k < 4; k++) {
          curlX[i][k] = 0.12 + 0.06 * Math.sin(t * 0.9 + i * 0.5 + k * 0.7);
          curlY[i][k] = Math.sin(t * 0.6 + i + k) * 0.05;
        }
        continue;
      }

      const legOffset = i / 8;
      const boundOffset = T.side < 0 ? 0 : 0.5;
      const effOffset = lerp(legOffset, boundOffset, runBlend);
      const ph = ((stride + effOffset) % 1 + 1) % 1;
      const a = ph * Math.PI * 2;
      const swingCos = Math.cos(a);
      const lift = Math.max(0, -Math.sin(a));

      let strideAmp = (0.20 + walk01 * 0.20 + runBlend * 0.30 + sprintBlend * 0.45) * (1 - creepBump * 0.30);
      let liftAmp = 0.35 + walk01 * 0.25 + runBlend * 0.45 + sprintBlend * 0.60;

      const turnFactor = isInside ? (1 - Math.abs(turn) * 0.55) : (1 + Math.abs(turn) * 0.40);
      strideAmp *= turnFactor;
      if (isInside) liftAmp *= (1 + Math.abs(turn) * 0.3);

      if (i === HURT_IDX) strideAmp *= (1 - hurtAmt * 0.5);

      const liftLean = -lift * liftAmp;
      gx[i] = T.restLeanX + liftLean + (i === HURT_IDX ? hurtAmt * 0.6 : 0);
      gy[i] = T.angle + swingCos * strideAmp;
      gz[i] = T.side * Math.abs(turn) * 0.05 * (isInside ? -1 : 1);

      for (let k = 0; k < 4; k++) {
        let cx = 0.08 + Math.max(0, -swingCos) * 0.15 * ((k + 1) / 4);
        cx += lift * (0.5 + k * 0.35);
        if (i === HURT_IDX) cx = cx * 0.4 + hurtAmt * 0.15 * (k + 1);
        curlX[i][k] = cx;
        curlY[i][k] = Math.sin(a * 2 + k * 0.8) * 0.12 * (0.3 + lift);
      }
    }

    // ---- actions override on top ----
    if (action === "attack") {
      const T = tentacles[PRIMARY];
      let sweep, curl;
      if (phase < 0.35) {
        const k = smooth(phase, 0, 0.35);
        sweep = lerp(0, -0.75, k); curl = lerp(0.15, 1.0, k);
      } else if (phase < 0.55) {
        const k = smooth(phase, 0.35, 0.55);
        sweep = lerp(-0.75, 1.15, k); curl = lerp(1.0, 0.05, k);
      } else {
        const k = smooth(phase, 0.55, 1);
        sweep = lerp(1.15, 0, k); curl = lerp(0.05, 0.15, k);
      }
      gy[PRIMARY] = T.angle + sweep;
      gx[PRIMARY] = T.restLeanX - 0.2 + curl * 0.15;
      curlX[PRIMARY] = [curl * 0.5, curl * 0.75, curl * 0.95, curl * 1.1];
      curlY[PRIMARY] = [0, 0, 0, 0];
      const hump = Math.sin(clamp(phase, 0, 1) * Math.PI);
      rZ += -0.10 * hump; mZ += -0.05 * hump;
      jawRotX = Math.max(jawRotX, hump * 0.5 * (phase > 0.35 && phase < 0.6 ? 1 : 0.2));
    } else if (action === "fire") {
      let aimK = smooth(phase, 0, 0.4);
      let relK = smooth(phase, 0.4, 0.55);
      let recK = smooth(phase, 0.55, 1);
      jawRotX = lerp(lerp(0.02, 0.55, aimK), 0.9, relK) * (1 - recK) + 0.05 * recK;
      rX += -0.06 * aimK + -0.12 * relK * (1 - recK);
      mZ += -0.08 * relK * (1 - recK);
      for (let i = 0; i < 8; i++) {
        curlX[i] = curlX[i].map(c => c + 0.10 * relK);
      }
    } else if (action === "hit") {
      const env = phase < 0.6 ? Math.sin((phase / 0.6) * Math.PI) : 0;
      rZ += HURT_SIDE * 0.35 * env;
      rX -= 0.15 * env;
      mY -= 0.05 * env;
      for (let i = 0; i < 8; i++) curlX[i] = curlX[i].map(c => c + 0.15 * env);
    } else if (action === "block") {
      const rise = smooth(phase, 0, 0.15);
      const fall = smooth(phase, 0.85, 1.0);
      const env = rise * (1 - fall);
      mY -= 0.12 * env; rX += 0.12 * env; sZ -= 0.10 * env;
      [PRIMARY, SECONDARY].forEach(i => {
        gy[i] = tentacles[i].angle * (1 - 0.6 * env);
        curlX[i] = curlX[i].map(c => c + 0.55 * env);
      });
      for (let i = 0; i < 8; i++) if (i !== PRIMARY && i !== SECONDARY) curlX[i] = curlX[i].map(c => c + 0.20 * env);
    } else if (action === "gather") {
      const downK = Math.sin(Math.min(phase, 0.6) / 0.6 * Math.PI * 0.5);
      const closeK = smooth(phase, 0.5, 0.75);
      const riseK = smooth(phase, 0.7, 1);
      const T = tentacles[PRIMARY];
      gx[PRIMARY] = lerp(T.restLeanX - 1.1 * downK, T.restLeanX + 0.4, riseK);
      gy[PRIMARY] = T.angle + 0.3 * downK * (1 - riseK);
      curlX[PRIMARY] = [0.3 * downK, 0.5 * downK, 0.7 * downK + closeK * 0.4, 0.9 * downK + closeK * 0.6].map(c => lerp(c, 0.75, riseK));
      mY -= 0.12 * downK * (1 - riseK);
      rX += 0.10 * downK * (1 - riseK);
    } else if (action === "deposit") {
      const lowerK = smooth(phase, 0.1, 0.75);
      const releaseK = smooth(phase, 0.6, 0.9);
      const settleK = smooth(phase, 0.85, 1);
      const T = tentacles[PRIMARY];
      gx[PRIMARY] = lerp(T.restLeanX + 0.4, T.restLeanX - 1.0, lowerK) * (1 - settleK) + T.restLeanX * settleK;
      const held = [0.6, 0.7, 0.8, 0.9];
      const released = [0.2, 0.25, 0.15, 0.10];
      curlX[PRIMARY] = held.map((h, k) => lerp(lerp(h, released[k], releaseK), curlX[PRIMARY][k], settleK));
      mY -= 0.10 * lowerK * (1 - settleK);
    } else if (action === "eat") {
      const downK = Math.max(0, smooth(phase, 0, 0.15) - smooth(phase, 0.9, 1));
      mY -= 0.15 * downK; rX += 0.18 * downK;
      const chompWave = Math.max(0, Math.sin(phase * Math.PI * 2 * 2.5));
      jawRotX = 0.05 + chompWave * 0.45 * downK;
      [SECONDARY, PRIMARY].forEach(i => { curlX[i] = curlX[i].map(c => c + chompWave * 0.15 * downK); });
    } else if (action === "drink") {
      const downK = smooth(phase, 0, 0.2);
      const holdEnd = smooth(phase, 0.8, 1);
      const lvl = downK * (1 - holdEnd);
      mY -= 0.16 * lvl; rX += 0.22 * lvl; jawRotX = 0.15 * lvl + 0.02;
    } else if (action === "jump") {
      const loadK = smooth(phase, 0, 0.33);
      const extK = smooth(phase, 0.33, 0.7);
      mY += -0.15 * loadK * (1 - extK) + 0.25 * extK;
      sZ += 0.10 * extK; sY += -0.08 * loadK + 0.15 * extK;
      for (let i = 0; i < 8; i++) {
        curlX[i] = curlX[i].map(c => c + 0.30 * loadK);
        gx[i] -= 0.5 * extK;
        gy[i] -= 0.2 * extK * tentacles[i].side * 0.3;
      }
    } else if (action === "land") {
      const reachK = smooth(phase, 0, 0.3);
      const shockK = smooth(phase, 0.3, 0.5);
      const recK = smooth(phase, 0.5, 1);
      const compress = Math.max(reachK * 0.3, shockK * (1 - recK));
      mY -= 0.05 * reachK + 0.20 * compress;
      for (let i = 0; i < 8; i++) {
        gx[i] -= 0.4 * reachK * (1 - recK);
        curlX[i] = curlX[i].map(c => c + 0.40 * shockK * (1 - recK));
      }
    } else if (action === "signal") {
      const riseK = smooth(phase, 0, 0.3);
      const holdEnd = smooth(phase, 0.75, 1);
      const lvl = riseK * (1 - holdEnd);
      mY += 0.18 * lvl; sY += 0.08 * lvl; sX += 0.05 * lvl;
      jawRotX = 0.30 * lvl + 0.02;
      eyeGlow.value = clamp(eyeGlow.value + 1.2 * lvl, 0, 3);
      for (let i = 0; i < 8; i++) {
        const T = tentacles[i];
        gx[i] = lerp(gx[i], T.restLeanX + 0.5, lvl);
        gy[i] = lerp(gy[i], T.angle + T.side * 0.15, lvl);
        curlX[i] = curlX[i].map(c => c * (1 - 0.6 * lvl));
      }
    } else if (action === "sleep") {
      const k = smooth(phase, 0, 0.85);
      mY -= 0.45 * k; rX += 0.05 * k; sY -= 0.15 * k; sX += 0.05 * k;
      jawRotX = 0.02;
      for (let i = 0; i < 8; i++) {
        const T = tentacles[i];
        gx[i] = lerp(gx[i], T.restLeanX + 0.9, k);
        curlX[i] = curlX[i].map(c => lerp(c, 0.6 + 0.06 * (i % 4), k));
      }
    } else if (action === "wake") {
      const k = 1 - smooth(phase, 0.1, 0.9);
      mY -= 0.45 * k; rX += 0.05 * k; sY -= 0.15 * k; sX += 0.05 * k;
      for (let i = 0; i < 8; i++) {
        const T = tentacles[i];
        gx[i] = lerp(gx[i], T.restLeanX + 0.9, k);
        curlX[i] = curlX[i].map(c => lerp(c, 0.6 + 0.06 * (i % 4), k));
      }
    } else if (action === "die") {
      const k = smooth(phase, 0, 0.8);
      mY -= 0.85 * k; rX += 0.5 * k; rZ += HURT_SIDE * 0.4 * k; sY -= 0.35 * k; sX += 0.10 * k;
      jawRotX = 0.4 * k;
      for (let i = 0; i < 8; i++) {
        const T = tentacles[i];
        const jitter = Math.sin(i * 1.7) * 0.15;
        gx[i] = lerp(gx[i], T.restLeanX + 1.3 + jitter, k);
        curlX[i] = curlX[i].map(c => lerp(c, 0.05, k));
      }
    } else if (action === "evolve") {
      const rise = smooth(phase, 0, 0.3);
      const fall = smooth(phase, 0.7, 1);
      const openK = rise * (1 - fall);
      sY += 0.15 * openK; rX -= 0.10 * openK; jawRotX = 0.20 * openK + 0.02;
      eyeGlow.value = clamp(eyeGlow.value + 1.5 * openK, 0, 3);
      plateLeft.position.x = -0.5 - 0.15 * openK;
      plateRight.position.x = 0.5 + 0.15 * openK;
      crown.position.y = 0.42 + 0.12 * openK;
      rearSpike.position.z = -0.55 - 0.15 * openK;
      for (let i = 0; i < 8; i++) {
        const T = tentacles[i];
        gx[i] = lerp(gx[i], T.restLeanX + 0.4, openK);
        curlX[i] = curlX[i].map(c => c * (1 - 0.5 * openK));
      }
    } else {
      plateLeft.position.x = -0.5;
      plateRight.position.x = 0.5;
      crown.position.y = 0.42;
      rearSpike.position.z = -0.55;
    }

    // ---- write final transforms ----
    mantle.position.set(mX, mY, mZ);
    mantle.rotation.set(rX, rY, rZ);
    mantle.scale.set(sX, sY, sZ);
    jaw.rotation.set(clamp(jawRotX, 0, 1.1), 0, 0);

    for (let i = 0; i < 8; i++) {
      const T = tentacles[i];
      T.group.rotation.set(gx[i], gy[i], gz[i]);
      for (let k = 0; k < 4; k++) {
        T.segs[k].rotation.set(curlX[i][k], curlY[i][k], 0);
      }
    }
  };

  return root;
}
```