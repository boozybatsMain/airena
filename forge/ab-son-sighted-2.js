function build(THREE, TSL) {
  const { vec3, float, mix, pow, oneMinus, max, dot, normalize,
          cameraPosition, normalWorld, positionWorld, positionLocal,
          fract, sin } = TSL;

  function furMaterial(dark, light) {
    const mat = new THREE.MeshStandardNodeMaterial();
    const p = positionLocal;
    const n1 = fract(sin(p.x.mul(12.9898).add(p.y.mul(78.233)).add(p.z.mul(37.719))).mul(43758.5453));
    let col = mix(dark, light, n1.mul(0.6));
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const fres = pow(oneMinus(max(dot(normalWorld, viewDir), float(0.0))), float(3.0));
    col = mix(col, vec3(0.32, 0.30, 0.29), fres.mul(0.18));
    mat.colorNode = col;
    mat.roughnessNode = float(0.82);
    mat.metalnessNode = float(0.0);
    return mat;
  }

  function skinMaterial() {
    const mat = new THREE.MeshStandardNodeMaterial();
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const fres = pow(oneMinus(max(dot(normalWorld, viewDir), float(0.0))), float(2.0));
    const base = vec3(0.02, 0.018, 0.017);
    const rim = vec3(0.16, 0.13, 0.12);
    mat.colorNode = mix(base, rim, fres);
    mat.roughnessNode = float(0.38);
    mat.metalnessNode = float(0.06);
    return mat;
  }

  const furBlack = furMaterial(vec3(0.03, 0.028, 0.026), vec3(0.08, 0.065, 0.05));
  const furSilver = furMaterial(vec3(0.45, 0.44, 0.43), vec3(0.7, 0.68, 0.66));
  const skin = skinMaterial();
  const eyeMat = new THREE.MeshStandardNodeMaterial();
  eyeMat.colorNode = vec3(0.015, 0.015, 0.015);
  eyeMat.roughnessNode = float(0.25);
  eyeMat.metalnessNode = float(0.0);

  const root = new THREE.Group();
  root.name = 'Gorilla';

  function seg(name, topR, botR, len, mat, radial) {
    const obj = new THREE.Object3D();
    obj.name = name;
    const geo = new THREE.CylinderGeometry(topR, botR, len, radial || 10, 1, false);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -len / 2;
    mesh.name = name + '_mesh';
    obj.add(mesh);
    return obj;
  }

  // ---- pelvis (root) ----
  const pelvis = new THREE.Object3D();
  pelvis.name = 'pelvis';
  {
    const g = new THREE.SphereGeometry(0.30, 16, 12);
    const m = new THREE.Mesh(g, furBlack);
    m.scale.set(1.3, 0.85, 1.05);
    pelvis.add(m);
  }
  root.add(pelvis);

  // ---- spine (silverback saddle) ----
  const spine = seg('spine', 0.24, 0.20, 0.32, furSilver, 12);
  spine.position.set(0, 0.20, -0.02);
  pelvis.add(spine);

  // ---- chest ----
  const chest = new THREE.Object3D();
  chest.name = 'chest';
  chest.position.set(0, 0.32, 0.04);
  {
    const g = new THREE.SphereGeometry(0.36, 18, 14);
    const m = new THREE.Mesh(g, furBlack);
    m.scale.set(1.2, 1.05, 0.95);
    m.position.y = 0.20;
    chest.add(m);
  }
  spine.add(chest);

  // ---- head ----
  const head = new THREE.Object3D();
  head.name = 'head';
  head.position.set(0, 0.40, 0.10);
  {
    const g = new THREE.SphereGeometry(0.20, 16, 14);
    const m = new THREE.Mesh(g, furBlack);
    m.scale.set(1.0, 1.05, 1.1);
    m.position.y = 0.15;
    head.add(m);
  }
  const browRidge = new THREE.Object3D();
  browRidge.name = 'browRidge';
  browRidge.position.set(0, 0.20, 0.16);
  {
    const g = new THREE.BoxGeometry(0.28, 0.05, 0.09);
    const m = new THREE.Mesh(g, furBlack);
    browRidge.add(m);
  }
  head.add(browRidge);
  {
    const g = new THREE.SphereGeometry(0.13, 12, 10);
    const m = new THREE.Mesh(g, skin);
    m.scale.set(1, 0.85, 1.0);
    m.position.set(0, 0.08, 0.17);
    m.name = 'muzzle';
    head.add(m);
  }
  {
    const gEye = new THREE.SphereGeometry(0.045, 8, 8);
    const mL = new THREE.Mesh(gEye, eyeMat);
    mL.position.set(-0.08, 0.16, 0.19);
    mL.name = 'eyeL';
    head.add(mL);
    const mR = mL.clone();
    mR.position.x = 0.08;
    mR.name = 'eyeR';
    head.add(mR);
  }
  {
    const gEar = new THREE.SphereGeometry(0.06, 8, 8);
    const earL = new THREE.Mesh(gEar, furBlack);
    earL.name = 'earL';
    earL.scale.set(0.6, 1, 0.5);
    earL.position.set(-0.20, 0.16, 0.0);
    head.add(earL);
    const earR = earL.clone();
    earR.name = 'earR';
    earR.position.x = 0.20;
    head.add(earR);
  }
  chest.add(head);

  // ---- jaw ----
  const jaw = new THREE.Object3D();
  jaw.name = 'jaw';
  jaw.position.set(0, 0.06, 0.17);
  {
    const g = new THREE.BoxGeometry(0.15, 0.08, 0.13);
    const m = new THREE.Mesh(g, skin);
    m.position.set(0, -0.045, 0.04);
    jaw.add(m);
  }
  head.add(jaw);

  // ---- arms ----
  const arms = {};
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? -1 : 1;
    const shoulder = new THREE.Object3D();
    shoulder.name = 'shoulder' + side;
    shoulder.position.set(sign * 0.38, 0.30, 0.05);
    {
      const g = new THREE.SphereGeometry(0.15, 10, 8);
      const m = new THREE.Mesh(g, furBlack);
      shoulder.add(m);
    }
    chest.add(shoulder);

    const upperArm = seg('upperArm' + side, 0.135, 0.11, 0.50, furBlack, 10);
    shoulder.add(upperArm);

    const forearm = seg('forearm' + side, 0.11, 0.09, 0.46, furBlack, 10);
    forearm.position.set(0, -0.50, 0);
    upperArm.add(forearm);

    const hand = new THREE.Object3D();
    hand.name = 'hand' + side;
    hand.position.set(0, -0.46, 0);
    {
      const g = new THREE.BoxGeometry(0.18, 0.20, 0.24);
      const m = new THREE.Mesh(g, skin);
      m.position.y = -0.10;
      hand.add(m);
    }
    forearm.add(hand);

    arms[side] = { shoulder: shoulder, upperArm: upperArm, forearm: forearm, hand: hand };
  }

  // ---- legs ----
  const legs = {};
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? -1 : 1;
    const hip = new THREE.Object3D();
    hip.name = 'hip' + side;
    hip.position.set(sign * 0.24, -0.04, 0.0);
    pelvis.add(hip);

    const thigh = seg('thigh' + side, 0.16, 0.13, 0.44, furBlack, 10);
    hip.add(thigh);

    const shin = seg('shin' + side, 0.13, 0.095, 0.40, furBlack, 10);
    shin.position.set(0, -0.44, 0);
    thigh.add(shin);

    const foot = new THREE.Object3D();
    foot.name = 'foot' + side;
    foot.position.set(0, -0.40, 0);
    {
      const g = new THREE.BoxGeometry(0.15, 0.10, 0.28);
      const m = new THREE.Mesh(g, skin);
      m.position.set(0, -0.05, 0.09);
      foot.add(m);
    }
    shin.add(foot);

    legs[side] = { hip: hip, thigh: thigh, shin: shin, foot: foot };
  }

  const P = { pelvis: pelvis, spine: spine, chest: chest, head: head, jaw: jaw, arms: arms, legs: legs };

  // ---------------- pose helpers ----------------
  function curve(x, pts) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      const x0 = pts[i][0], y0 = pts[i][1], x1 = pts[i + 1][0], y1 = pts[i + 1][1];
      if (x <= x1) {
        const tt = (x1 > x0) ? (x - x0) / (x1 - x0) : 0;
        return y0 + (y1 - y0) * tt;
      }
    }
    return pts[pts.length - 1][1];
  }
  function keyframe(ph, stops) {
    if (ph <= stops[0][0]) return stops[0][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const t0 = stops[i][0], v0 = stops[i][1], t1 = stops[i + 1][0], v1 = stops[i + 1][1];
      if (ph <= t1) {
        const tt = (t1 > t0) ? (ph - t0) / (t1 - t0) : 0;
        return v0 + (v1 - v0) * tt;
      }
    }
    return stops[stops.length - 1][1];
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function setSwing(obj, forward, spread, twist) {
    obj.rotation.set(-forward, twist || 0, spread || 0);
  }

  const HEIGHT_PTS = [[0, 0.92], [0.5, 0.80], [1, 0.86], [2, 0.60], [3, 0.54], [6, 0.50]];
  const SPINE_PITCH_PTS = [[0, 0.08], [0.5, 0.28], [1, 0.16], [2, 0.95], [3, 1.08], [6, 1.18]];
  const THIGH_AMP_PTS = [[0, 0.0], [0.5, 0.30], [1, 0.50], [2, 0.55], [3, 0.72], [6, 0.95]];
  const KNEE_SWING_PTS = [[0, 0.0], [0.5, 0.32], [1, 0.48], [2, 0.60], [3, 0.75], [6, 0.92]];
  const KNEE_REST_PTS = [[0, 0.16], [0.5, 0.38], [1, 0.28], [2, 0.48], [3, 0.55], [6, 0.60]];
  const ARM_AMP_PTS = [[0, 0.0], [0.5, 0.22], [1, 0.42], [2, 0.50], [3, 0.66], [6, 0.88]];
  const ELBOW_SWING_PTS = [[0, 0.08], [0.5, 0.28], [1, 0.32], [2, 0.42], [3, 0.55], [6, 0.70]];
  const ELBOW_REST_PTS = [[0, 0.14], [0.5, 0.28], [1, 0.24], [2, 0.34], [3, 0.40], [6, 0.46]];
  const BOB_PTS = [[0, 0.0], [0.5, 0.008], [1, 0.028], [2, 0.05], [3, 0.08], [6, 0.12]];

  const HIP_SPREAD = 0.08;
  const SHOULDER_SPREAD = 0.30;

  function poseFn(s) {
    const speed = s.speed || 0;
    const stride = (((s.stride || 0) % 1) + 1) % 1;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = (s.health === undefined || s.health === null) ? 1 : s.health;
    const action = s.action || null;
    const phase = clamp01(s.phase || 0);
    const t = s.t || 0;

    const quadT = clamp01(speed - 1);
    const boundT = clamp01((speed - 3) / 3);

    const pelvisY = curve(speed, HEIGHT_PTS);
    const spinePitch = curve(speed, SPINE_PITCH_PTS);
    const thighAmpBase = curve(speed, THIGH_AMP_PTS);
    const kneeSwing = curve(speed, KNEE_SWING_PTS);
    const kneeRest = curve(speed, KNEE_REST_PTS);
    const armAmpBase = curve(speed, ARM_AMP_PTS);
    const elbowSwing = curve(speed, ELBOW_SWING_PTS);
    const elbowRest = curve(speed, ELBOW_REST_PTS);
    const bobAmp = curve(speed, BOB_PTS);

    const idleT = clamp01(1 - speed);
    const breathe = Math.sin(t * 1.3) * 0.035 * idleT;
    const sway = Math.sin(t * 0.4) * 0.02 * idleT;
    const headScan = (Math.sin(t * 0.17) * 0.22 + Math.sin(t * 0.41) * 0.06) * idleT;

    const turnAmt = Math.max(-1, Math.min(1, turn));
    const insideScaleL = 1 - Math.max(0, -turnAmt) * 0.45;
    const insideScaleR = 1 - Math.max(0, turnAmt) * 0.45;

    const hurtT = clamp01(1 - health);

    const armLphase = 0.0;
    const armRphase = lerp(0.5, 0.0, boundT);
    const hipLphase = lerp(0.5, 0.5, boundT);
    const hipRphase = lerp(0.0, 0.5, boundT);

    function gaitLimb(phaseOffset, amp, kneeAmp, kneeBase, insideScale) {
      const ph = (((stride + phaseOffset) % 1)) * Math.PI * 2;
      const forward = Math.sin(ph) * amp * insideScale;
      const bend = kneeBase + (0.5 + 0.5 * Math.sin(ph - Math.PI / 2)) * kneeAmp;
      return { forward: forward, bend: bend };
    }

    const legL = gaitLimb(hipLphase, thighAmpBase, kneeSwing, kneeRest, insideScaleL);
    const legR = gaitLimb(hipRphase, thighAmpBase, kneeSwing, kneeRest, insideScaleR);
    const armL = gaitLimb(armLphase, armAmpBase, elbowSwing, elbowRest, insideScaleL);
    const armR = gaitLimb(armRphase, armAmpBase, elbowSwing, elbowRest, insideScaleR);

    const bobPhase = ((stride * 2) % 1) * Math.PI * 2;
    const bodyBob = Math.abs(Math.sin(bobPhase)) * bobAmp;

    // ---- base gait pose (written every call) ----
    P.pelvis.position.set(sway, pelvisY + bodyBob, 0);
    P.pelvis.rotation.set(spinePitch * 0.35, 0, 0);

    P.spine.rotation.set(spinePitch * 0.5 + breathe, 0, turnAmt * -0.15);
    P.chest.rotation.set(spinePitch * 0.15, turnAmt * 0.10, turnAmt * -0.05);
    P.chest.scale.set(1, 1, 1);

    P.head.rotation.set(-spinePitch * 0.55 + 0.05, headScan + turnAmt * 0.35, turnAmt * 0.06);
    P.jaw.rotation.set(0, 0, 0);

    setSwing(P.legs.L.thigh, legL.forward, HIP_SPREAD);
    setSwing(P.legs.L.shin, -legL.bend, 0);
    P.legs.L.foot.rotation.set(-(legL.forward - legL.bend) * 0.4, 0, 0);

    setSwing(P.legs.R.thigh, legR.forward, -HIP_SPREAD);
    setSwing(P.legs.R.shin, -legR.bend, 0);
    P.legs.R.foot.rotation.set(-(legR.forward - legR.bend) * 0.4, 0, 0);

    P.arms.L.shoulder.rotation.set(0, 0, SHOULDER_SPREAD * lerp(1, 0.6, quadT));
    setSwing(P.arms.L.upperArm, armL.forward, 0);
    setSwing(P.arms.L.forearm, -armL.bend, 0);
    P.arms.L.hand.rotation.set((armL.forward - armL.bend) * 0.3, 0, 0);

    P.arms.R.shoulder.rotation.set(0, 0, -SHOULDER_SPREAD * lerp(1, 0.6, quadT));
    setSwing(P.arms.R.upperArm, armR.forward, 0);
    setSwing(P.arms.R.forearm, -armR.bend, 0);
    P.arms.R.hand.rotation.set((armR.forward - armR.bend) * 0.3, 0, 0);

    // ---- hurt overlay ----
    if (hurtT > 0) {
      P.chest.rotation.z += hurtT * 0.18;
      P.head.rotation.x += hurtT * 0.25;
      P.head.rotation.z += hurtT * 0.12;
      P.arms.R.shoulder.rotation.z += -hurtT * 0.3;
      P.legs.R.thigh.rotation.x += hurtT * 0.15;
    }

    // ---- airborne overlay (only when no explicit action) ----
    if (!action && !grounded) {
      setSwing(P.legs.L.thigh, 0.35, HIP_SPREAD);
      setSwing(P.legs.L.shin, -0.9, 0);
      setSwing(P.legs.R.thigh, 0.35, -HIP_SPREAD);
      setSwing(P.legs.R.shin, -0.9, 0);
      setSwing(P.arms.L.upperArm, 0.25, 0);
      setSwing(P.arms.L.forearm, -0.7, 0);
      setSwing(P.arms.R.upperArm, 0.25, 0);
      setSwing(P.arms.R.forearm, -0.7, 0);
      P.pelvis.rotation.x = spinePitch * 0.35 - 0.15;
    }

    // ---- actions ----
    if (action === 'attack') {
      const wind = keyframe(phase, [[0, 0], [0.30, 1], [0.55, 0], [1, 0]]);
      const commit = keyframe(phase, [[0, 0], [0.30, 0], [0.55, 1], [0.80, 0.2], [1, 0]]);
      const armF = lerp(-0.7, 1.4, commit) - wind * 0.3;
      const elbowB = lerp(1.1, 0.25, commit);
      setSwing(P.arms.L.upperArm, armF * 0.7, 0.1);
      setSwing(P.arms.L.forearm, -elbowB, 0);
      setSwing(P.arms.R.upperArm, armF, -0.1);
      setSwing(P.arms.R.forearm, -elbowB, 0);
      P.spine.rotation.x = spinePitch * 0.5 - wind * 0.15 + commit * 0.35;
      P.chest.rotation.x = commit * 0.25 - wind * 0.1;
      P.jaw.rotation.x = keyframe(phase, [[0, 0], [0.3, 0.15], [0.55, 0.5], [1, 0.1]]);
      P.head.rotation.x += -wind * 0.1 + commit * 0.15;
    } else if (action === 'fire') {
      const aim = keyframe(phase, [[0, 0], [0.35, 1], [0.5, 1], [1, 0]]);
      const release = keyframe(phase, [[0, 0], [0.5, 0], [0.62, 1], [1, 0]]);
      const recoil = keyframe(phase, [[0, 0], [0.62, 0], [0.75, 1], [1, 0]]);
      setSwing(P.arms.L.upperArm, 0.3 + aim * 0.3, 0.15);
      setSwing(P.arms.L.forearm, -(0.5 + release * 0.5), 0);
      setSwing(P.arms.R.upperArm, 0.3 + aim * 0.3, -0.15);
      setSwing(P.arms.R.forearm, -(0.5 + release * 0.5), 0);
      P.chest.rotation.x = aim * 0.1 - recoil * 0.18;
      P.spine.rotation.x = spinePitch * 0.5 - recoil * 0.12;
      P.jaw.rotation.x = release * 0.4;
    } else if (action === 'hit') {
      const flinch = keyframe(phase, [[0, 0], [0.12, 1], [0.4, 0], [1, 0]]);
      P.chest.rotation.z = flinch * 0.35;
      P.chest.rotation.x = flinch * -0.15;
      P.head.rotation.z = flinch * 0.3;
      P.head.rotation.y += flinch * 0.2;
      P.pelvis.position.x = sway - flinch * 0.05;
    } else if (action === 'block') {
      const g = keyframe(phase, [[0, 0], [0.25, 1], [0.75, 1], [1, 0]]);
      P.pelvis.position.y = pelvisY - g * 0.10;
      P.pelvis.rotation.x = spinePitch * 0.35 + g * 0.15;
      P.spine.rotation.x = spinePitch * 0.5 + g * 0.2;
      setSwing(P.arms.L.upperArm, 0.9 * g, 0.35 * g);
      setSwing(P.arms.L.forearm, -1.3 * g, 0);
      setSwing(P.arms.R.upperArm, 0.9 * g, -0.35 * g);
      setSwing(P.arms.R.forearm, -1.3 * g, 0);
      P.head.rotation.x += g * 0.2;
    } else if (action === 'gather') {
      const down = keyframe(phase, [[0, 0], [0.4, 1], [0.6, 1], [1, 0]]);
      const grip = keyframe(phase, [[0, 0], [0.4, 0], [0.55, 1], [1, 1]]);
      P.pelvis.position.y = pelvisY - down * 0.28;
      P.spine.rotation.x = spinePitch * 0.5 + down * 0.9;
      P.head.rotation.x += down * 0.5;
      setSwing(P.arms.L.upperArm, down * 0.8, 0.1);
      setSwing(P.arms.L.forearm, -down * 1.0 - grip * 0.2, 0);
      setSwing(P.arms.R.upperArm, down * 0.8, -0.1);
      setSwing(P.arms.R.forearm, -down * 1.0 - grip * 0.2, 0);
      setSwing(P.legs.L.thigh, down * 0.3, HIP_SPREAD);
      setSwing(P.legs.L.shin, -down * 0.6, 0);
      setSwing(P.legs.R.thigh, down * 0.3, -HIP_SPREAD);
      setSwing(P.legs.R.shin, -down * 0.6, 0);
    } else if (action === 'deposit') {
      const down = keyframe(phase, [[0, 0], [0.55, 1], [0.75, 1], [1, 0]]);
      const release = keyframe(phase, [[0, 0], [0.6, 0], [0.85, 1], [1, 1]]);
      P.pelvis.position.y = pelvisY - down * 0.26;
      P.spine.rotation.x = spinePitch * 0.5 + down * 0.85;
      P.head.rotation.x += down * 0.45;
      setSwing(P.arms.L.upperArm, down * 0.75, 0.15 + release * 0.15);
      setSwing(P.arms.L.forearm, -down * 0.9 + release * 0.3, 0);
      setSwing(P.arms.R.upperArm, down * 0.75, -0.15 - release * 0.15);
      setSwing(P.arms.R.forearm, -down * 0.9 + release * 0.3, 0);
    } else if (action === 'eat') {
      const down = keyframe(phase, [[0, 0], [0.2, 1], [0.85, 1], [1, 0]]);
      const chew = Math.sin(phase * Math.PI * 2 * 2.5) * down;
      P.spine.rotation.x = spinePitch * 0.5 + down * 0.75;
      P.head.rotation.x += down * 0.55;
      P.jaw.rotation.x = 0.15 + Math.max(0, chew) * 0.35;
      setSwing(P.arms.L.upperArm, down * 0.5, 0.1);
      setSwing(P.arms.L.forearm, -down * 0.8, 0);
      setSwing(P.arms.R.upperArm, down * 0.5, -0.1);
      setSwing(P.arms.R.forearm, -down * 0.8, 0);
    } else if (action === 'drink') {
      const down = keyframe(phase, [[0, 0], [0.3, 1], [0.8, 1], [1, 0]]);
      P.spine.rotation.x = spinePitch * 0.5 + down * 0.85;
      P.head.rotation.x += down * 0.6;
      P.jaw.rotation.x = down * 0.08;
    } else if (action === 'jump') {
      const crouch = keyframe(phase, [[0, 0], [0.33, 1], [0.5, 0.3], [1, 0]]);
      const extend = keyframe(phase, [[0, 0], [0.33, 0], [0.7, 1], [1, 1]]);
      P.pelvis.position.y = pelvisY - crouch * 0.22 + extend * 0.15;
      P.spine.rotation.x = spinePitch * 0.5 - extend * 0.3 + crouch * 0.3;
      setSwing(P.legs.L.thigh, -crouch * 0.5 + extend * 0.6, HIP_SPREAD);
      setSwing(P.legs.L.shin, -(crouch * 0.9) + extend * 0.2, 0);
      setSwing(P.legs.R.thigh, -crouch * 0.5 + extend * 0.6, -HIP_SPREAD);
      setSwing(P.legs.R.shin, -(crouch * 0.9) + extend * 0.2, 0);
      setSwing(P.arms.L.upperArm, -crouch * 0.3 + extend * 1.0, 0.2);
      setSwing(P.arms.R.upperArm, -crouch * 0.3 + extend * 1.0, -0.2);
      P.head.rotation.x += -extend * 0.2;
    } else if (action === 'land') {
      const reach = keyframe(phase, [[0, 0], [0.4, 1], [0.45, 1], [1, 0]]);
      const impact = keyframe(phase, [[0, 0], [0.45, 0], [0.6, 1], [1, 0]]);
      P.pelvis.position.y = pelvisY - impact * 0.3;
      P.spine.rotation.x = spinePitch * 0.5 + impact * 0.4;
      setSwing(P.legs.L.thigh, reach * 0.4 - impact * 0.2, HIP_SPREAD);
      setSwing(P.legs.L.shin, -(reach * 0.3 + impact * 0.9), 0);
      setSwing(P.legs.R.thigh, reach * 0.4 - impact * 0.2, -HIP_SPREAD);
      setSwing(P.legs.R.shin, -(reach * 0.3 + impact * 0.9), 0);
      setSwing(P.arms.L.upperArm, reach * 0.5, 0.15);
      setSwing(P.arms.R.upperArm, reach * 0.5, -0.15);
    } else if (action === 'signal') {
      const rise = keyframe(phase, [[0, 0], [0.25, 1], [0.65, 1], [1, 0]]);
      const beat = Math.max(0, Math.sin(phase * Math.PI * 2 * 4)) * keyframe(phase, [[0, 0], [0.15, 1], [0.55, 1], [0.7, 0]]);
      P.pelvis.position.y = pelvisY + rise * 0.12;
      P.spine.rotation.x = spinePitch * 0.5 - rise * 0.5;
      P.chest.rotation.x = -rise * 0.1;
      setSwing(P.arms.L.upperArm, lerp(0.6 * beat, 1.6, rise * (1 - beat)), 0.6 * rise);
      setSwing(P.arms.L.forearm, -0.3 - beat * 0.6, 0);
      setSwing(P.arms.R.upperArm, lerp(0.6 * beat, 1.6, rise * (1 - beat)), -0.6 * rise);
      setSwing(P.arms.R.forearm, -0.3 - beat * 0.6, 0);
      P.head.rotation.x += -rise * 0.2;
      P.jaw.rotation.x = rise * 0.4;
    } else if (action === 'sleep') {
      const down = keyframe(phase, [[0, 0], [0.6, 1], [1, 1]]);
      P.pelvis.position.y = pelvisY - down * 0.45;
      P.spine.rotation.x = spinePitch * 0.5 + down * 0.9;
      P.head.rotation.x += down * 0.7;
      setSwing(P.legs.L.thigh, down * 0.9, HIP_SPREAD);
      setSwing(P.legs.L.shin, -down * 1.3, 0);
      setSwing(P.legs.R.thigh, down * 0.9, -HIP_SPREAD);
      setSwing(P.legs.R.shin, -down * 1.3, 0);
      setSwing(P.arms.L.upperArm, down * 0.7, 0.3);
      setSwing(P.arms.L.forearm, -down * 1.1, 0);
      setSwing(P.arms.R.upperArm, down * 0.7, -0.3);
      setSwing(P.arms.R.forearm, -down * 1.1, 0);
    } else if (action === 'wake') {
      const up = keyframe(phase, [[0, 1], [0.3, 1], [0.75, 0.3], [1, 0]]);
      P.pelvis.position.y = pelvisY - up * 0.45;
      P.spine.rotation.x = spinePitch * 0.5 + up * 0.9;
      P.head.rotation.x += up * 0.6;
      setSwing(P.legs.L.thigh, up * 0.9, HIP_SPREAD);
      setSwing(P.legs.L.shin, -up * 1.3, 0);
      setSwing(P.legs.R.thigh, up * 0.9, -HIP_SPREAD);
      setSwing(P.legs.R.shin, -up * 1.3, 0);
      setSwing(P.arms.L.upperArm, up * 0.7, 0.3);
      setSwing(P.arms.L.forearm, -up * 1.1, 0);
      setSwing(P.arms.R.upperArm, up * 0.7, -0.3);
      setSwing(P.arms.R.forearm, -up * 1.1, 0);
    } else if (action === 'die') {
      const fall = phase;
      P.pelvis.position.y = pelvisY - fall * 0.55;
      P.pelvis.rotation.x = spinePitch * 0.35 + fall * 0.9;
      P.pelvis.rotation.z = fall * 0.35;
      P.spine.rotation.x = spinePitch * 0.5 + fall * 0.6;
      P.head.rotation.x += fall * 0.6;
      P.head.rotation.z += fall * 0.4;
      setSwing(P.legs.L.thigh, fall * 0.4, HIP_SPREAD + fall * 0.3);
      setSwing(P.legs.L.shin, -fall * 0.9, 0);
      setSwing(P.legs.R.thigh, -fall * 0.3, -HIP_SPREAD - fall * 0.2);
      setSwing(P.legs.R.shin, -fall * 0.5, 0);
      setSwing(P.arms.L.upperArm, fall * 0.9, 0.5 * fall);
      setSwing(P.arms.L.forearm, -fall * 0.4, 0);
      setSwing(P.arms.R.upperArm, -fall * 0.5, -0.6 * fall);
      setSwing(P.arms.R.forearm, -fall * 0.7, 0);
    } else if (action === 'evolve') {
      const brace = keyframe(phase, [[0, 0], [0.22, 1], [0.25, 1], [1, 0]]);
      const open = keyframe(phase, [[0, 0], [0.25, 0], [0.5, 1], [0.75, 1], [1, 0]]);
      P.pelvis.position.y = pelvisY - brace * 0.2 + open * 0.08;
      P.spine.rotation.x = spinePitch * 0.5 + brace * 0.4 - open * 0.55;
      const chestPulse = 1 + open * 0.12;
      P.chest.scale.set(chestPulse, chestPulse, chestPulse);
      setSwing(P.arms.L.upperArm, -brace * 0.4 + open * 1.3, brace * 0.1 + open * 0.9);
      setSwing(P.arms.L.forearm, -brace * 1.0 + open * 0.2, 0);
      setSwing(P.arms.R.upperArm, -brace * 0.4 + open * 1.3, -(brace * 0.1 + open * 0.9));
      setSwing(P.arms.R.forearm, -brace * 1.0 + open * 0.2, 0);
      P.head.rotation.x += -open * 0.3 + brace * 0.2;
    }
  }

  root.userData.pose = poseFn;

  return root;
}