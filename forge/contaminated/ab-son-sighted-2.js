function build(THREE, TSL) {
  const {
    vec2, vec3, float, positionLocal, positionWorld, normalLocal, normalWorld,
    cameraPosition, sin, pow, mix, smoothstep, clamp, fract, dot, normalize,
    oneMinus, mul, add, sub
  } = TSL;

  function smooth(e0, e1, x) { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
  function clamp01(x) { return Math.min(1, Math.max(0, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function stage(phase, stops) {
    for (let i = 0; i < stops.length - 1; i++) {
      const t0 = stops[i][0], v0 = stops[i][1], t1 = stops[i + 1][0], v1 = stops[i + 1][1];
      if (phase <= t1 || i === stops.length - 2) return lerp(v0, v1, smooth(t0, t1, phase));
    }
    return stops[stops.length - 1][1];
  }

  function hashNoise(scale) {
    const p = mul(positionLocal, float(scale));
    const h = sin(add(dot(vec2(p.x, p.y), vec2(12.9898, 78.233)), mul(p.z, 37.719)));
    return fract(mul(h, 43758.5453123));
  }
  function furColor(hex, fleck) {
    const c = new THREE.Color(hex);
    const base = vec3(c.r, c.g, c.b);
    return add(base, mul(sub(hashNoise(20.0), 0.5), fleck));
  }
  function fresnelTerm(power) {
    const viewDir = normalize(sub(cameraPosition, positionWorld));
    const d = clamp(dot(normalize(normalWorld), viewDir), 0.0, 1.0);
    return pow(oneMinus(d), power);
  }
  function makeFurMaterial({ base = 0x14120f, fleck = 0.05, rough = 0.92, saddle = false } = {}) {
    const mat = new THREE.MeshStandardNodeMaterial();
    const baseCol = furColor(base, fleck);
    let col = baseCol;
    if (saddle) {
      const upMask = smoothstep(-0.05, 0.30, positionLocal.y);
      const backMask = oneMinus(smoothstep(-0.35, 0.05, normalLocal.z));
      const mask = mul(upMask, backMask);
      col = mix(baseCol, furColor(0x8a8580, 0.05), mask);
    }
    mat.colorNode = col;
    mat.emissiveNode = mul(vec3(0.05, 0.05, 0.06), fresnelTerm(3.0));
    mat.roughnessNode = clamp(sub(float(rough), mul(hashNoise(20.0), 0.06)), 0.4, 1.0);
    mat.metalness = 0.0;
    return mat;
  }
  function makeSkinMaterial(hex, rough = 0.5) {
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = furColor(hex, 0.02);
    mat.emissiveNode = mul(vec3(0.03, 0.02, 0.02), fresnelTerm(2.0));
    mat.roughnessNode = float(rough);
    mat.metalness = 0.0;
    return mat;
  }
  function makeEyeMaterial(hex) {
    const mat = new THREE.MeshStandardNodeMaterial();
    const c = new THREE.Color(hex);
    mat.colorNode = vec3(c.r, c.g, c.b);
    mat.emissiveNode = mul(vec3(c.r, c.g, c.b), 0.4);
    mat.roughness = 0.25; mat.metalness = 0.0;
    return mat;
  }

  const furBody = makeFurMaterial({ base: 0x121110, fleck: 0.05, rough: 0.92 });
  const furSaddle = makeFurMaterial({ base: 0x121110, fleck: 0.05, rough: 0.9, saddle: true });
  const furLimb = makeFurMaterial({ base: 0x0f0e0d, fleck: 0.06, rough: 0.95 });
  const skinFace = makeSkinMaterial(0x2a2320, 0.45);
  const skinHand = makeSkinMaterial(0x241f1c, 0.5);
  const eyeMat = makeEyeMaterial(0x1a1712);

  function boneDown(rTop, rBot, len, mat, segs = 8) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, len, segs);
    geo.translate(0, -len / 2, 0);
    return new THREE.Mesh(geo, mat);
  }
  function boneUp(rBot, rTop, len, mat, segs = 10) {
    const geo = new THREE.CylinderGeometry(rTop, rBot, len, segs);
    geo.translate(0, len / 2, 0);
    return new THREE.Mesh(geo, mat);
  }
  function bulge(radius, mat, segs = 10, s = [1, 1, 1]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, segs, Math.max(6, segs - 2)), mat);
    m.scale.set(s[0], s[1], s[2]);
    return m;
  }

  const root = new THREE.Group();
  root.name = 'Gorilla';

  const hips = new THREE.Object3D(); hips.name = 'Hips'; hips.position.set(0, 0.90, -0.05);
  root.add(hips);
  const hipsY0 = hips.position.y, hipsZ0 = hips.position.z;
  const pelvisMesh = bulge(0.26, furSaddle, 12, [1.15, 0.85, 1.0]);
  pelvisMesh.position.set(0, -0.02, -0.02);
  hips.add(pelvisMesh);

  const upperLegs = {}, lowerLegs = {}, feet = {};
  for (const side of ['L', 'R']) {
    const x = side === 'L' ? 0.20 : -0.20;
    const upperLeg = new THREE.Object3D(); upperLeg.name = `UpperLeg${side}`;
    upperLeg.position.set(x, -0.03, 0.02); hips.add(upperLeg);
    upperLeg.add(boneDown(0.135, 0.10, 0.40, furLimb, 8));
    const hipBulge = bulge(0.15, furSaddle, 10); hipBulge.position.set(0, -0.02, 0); upperLeg.add(hipBulge);

    const lowerLeg = new THREE.Object3D(); lowerLeg.name = `LowerLeg${side}`;
    lowerLeg.position.set(0, -0.40, 0); upperLeg.add(lowerLeg);
    lowerLeg.add(boneDown(0.10, 0.07, 0.38, furLimb, 8));
    lowerLeg.add(bulge(0.10, furLimb, 8));

    const foot = new THREE.Object3D(); foot.name = `Foot${side}`;
    foot.position.set(0, -0.38, 0); lowerLeg.add(foot);
    const footMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.30, 1, 1, 1), skinHand);
    footMesh.position.set(0, -0.05, 0.12); foot.add(footMesh);
    const toeBulge = bulge(0.08, skinHand, 8, [1.3, 0.6, 0.9]);
    toeBulge.position.set(0, -0.06, 0.27); foot.add(toeBulge);

    upperLegs[side] = upperLeg; lowerLegs[side] = lowerLeg; feet[side] = foot;
  }

  const spine = new THREE.Object3D(); spine.name = 'Spine'; spine.position.set(0, 0.08, 0.02);
  hips.add(spine);
  const spineY0 = spine.position.y, spineZ0 = spine.position.z;
  spine.add(boneUp(0.16, 0.20, 0.24, furSaddle, 10));

  const belly = new THREE.Object3D(); belly.name = 'Belly'; belly.position.set(0, 0.10, 0.16);
  spine.add(belly);
  const bellyY0 = belly.position.y, bellyZ0 = belly.position.z;
  belly.add(bulge(0.24, furBody, 12, [1.05, 0.95, 0.85]));

  const chest = new THREE.Object3D(); chest.name = 'Chest'; chest.position.set(0, 0.24, 0.03);
  spine.add(chest);
  const chestY0 = chest.position.y, chestZ0 = chest.position.z;
  const chestMesh = bulge(0.34, furSaddle, 14, [1.15, 1.0, 0.95]);
  chestMesh.position.set(0, 0.16, 0.02); chest.add(chestMesh);

  const neck = new THREE.Object3D(); neck.name = 'Neck'; neck.position.set(0, 0.38, 0.05);
  chest.add(neck);
  neck.add(boneUp(0.16, 0.14, 0.12, furBody, 10));

  const head = new THREE.Object3D(); head.name = 'Head'; head.position.set(0, 0.14, 0.02);
  neck.add(head);
  const skullMesh = bulge(0.20, skinFace, 14, [1.0, 1.05, 1.1]);
  skullMesh.position.set(0, 0.06, 0.04); head.add(skullMesh);

  const browRidge = new THREE.Object3D(); browRidge.name = 'BrowRidge'; browRidge.position.set(0, 0.10, 0.20);
  head.add(browRidge);
  browRidge.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.08), skinFace));

  const sagittalCrest = new THREE.Object3D(); sagittalCrest.name = 'SagittalCrest'; sagittalCrest.position.set(0, 0.20, -0.02);
  head.add(sagittalCrest);
  const crestMesh = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 6), furBody);
  crestMesh.position.set(0, 0.05, 0); sagittalCrest.add(crestMesh);

  const jaw = new THREE.Object3D(); jaw.name = 'Jaw'; jaw.position.set(0, -0.04, 0.16);
  head.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.14), skinFace);
  jawMesh.position.set(0, -0.02, 0.05); jaw.add(jawMesh);
  const muzzleMesh = bulge(0.09, skinFace, 10, [1.0, 0.7, 1.1]);
  muzzleMesh.position.set(0, 0.0, 0.10); jaw.add(muzzleMesh);

  const earL = new THREE.Object3D(); earL.name = 'EarL'; earL.position.set(0.19, 0.06, 0.0); head.add(earL);
  const earR = new THREE.Object3D(); earR.name = 'EarR'; earR.position.set(-0.19, 0.06, 0.0); head.add(earR);
  [earL, earR].forEach(e => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), skinFace);
    m.rotation.z = Math.PI / 2; e.add(m);
  });

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), eyeMat); eyeL.position.set(0.08, 0.08, 0.19); head.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), eyeMat); eyeR.position.set(-0.08, 0.08, 0.19); head.add(eyeR);

  const upperArms = {}, forearms = {}, hands = {};
  for (const side of ['L', 'R']) {
    const x = side === 'L' ? 0.34 : -0.34;
    const upperArm = new THREE.Object3D(); upperArm.name = `UpperArm${side}`;
    upperArm.position.set(x, 0.30, 0.05); chest.add(upperArm);
    upperArm.add(bulge(0.17, furBody, 12));
    upperArm.add(boneDown(0.155, 0.115, 0.50, furLimb, 10));

    const forearm = new THREE.Object3D(); forearm.name = `Forearm${side}`;
    forearm.position.set(0, -0.50, 0); upperArm.add(forearm);
    forearm.add(bulge(0.11, furLimb, 8));
    forearm.add(boneDown(0.108, 0.09, 0.46, furLimb, 10));

    const hand = new THREE.Object3D(); hand.name = `Hand${side}`;
    hand.position.set(0, -0.46, 0); forearm.add(hand);
    const handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.20), skinHand);
    handMesh.position.set(0, -0.07, 0.03); hand.add(handMesh);
    const knuckleBulge = bulge(0.075, skinHand, 8, [1.2, 0.8, 1.0]);
    knuckleBulge.position.set(0, -0.14, 0.07); hand.add(knuckleBulge);

    upperArms[side] = upperArm; forearms[side] = forearm; hands[side] = hand;
  }

  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  object_pose_setup: {}
  root.userData.pose = (s) => {
    const speed = s.speed || 0;
    const turn = s.turn || 0;
    const health = (s.health === undefined) ? 1 : s.health;
    const grounded = s.grounded !== false;
    const action = s.action || null;
    const phase = s.phase || 0;
    const t = s.t || 0;

    let hipsRotX = 0, hipsRotY = 0, hipsRotZ = 0, hipsPosY = hipsY0;
    let spineRotX = 0.05, spineRotY = 0, spineRotZ = 0;
    let chestRotX = -0.02, chestRotY = 0, chestRotZ = 0;
    let neckRotX = 0.05, neckRotY = 0, neckRotZ = 0;
    let headRotX = 0, headRotY = 0, headRotZ = 0;
    let jawRotX = 0;
    let bellyScale = 1, crestScale = 1;
    let legAng = { L: { hip: 0, knee: 0.08, foot: 0 }, R: { hip: 0, knee: 0.08, foot: 0 } };
    let armAng = { L: { shoulder: 0.08, shoulderZ: 0.12, elbow: 0.18, hand: 0 }, R: { shoulder: 0.08, shoulderZ: -0.12, elbow: 0.18, hand: 0 } };

    if (action) {
      switch (action) {
        case 'attack': {
          const sh = stage(phase, [[0, 0.1], [0.35, -2.7], [0.5, 0.6], [1, 0.15]]);
          const el = stage(phase, [[0, 0.25], [0.35, 1.0], [0.5, 0.15], [1, 0.3]]);
          armAng.L.shoulder = sh; armAng.R.shoulder = sh;
          armAng.L.elbow = el; armAng.R.elbow = el;
          armAng.L.shoulderZ = 0.05; armAng.R.shoulderZ = -0.05;
          spineRotX = stage(phase, [[0, 0.5], [0.35, -0.15], [0.5, 0.75], [1, 0.3]]);
          chestRotX = stage(phase, [[0, 0.2], [0.35, -0.35], [0.5, 1.0], [1, 0.1]]);
          hipsRotX = stage(phase, [[0, 0.05], [0.35, -0.1], [0.5, 0.2], [1, 0.05]]);
          hipsPosY = hipsY0 - stage(phase, [[0, 0.05], [0.35, 0.02], [0.5, 0.18], [1, 0.05]]);
          legAng.L.knee = stage(phase, [[0, 0.15], [0.35, 0.05], [0.5, 0.35], [1, 0.12]]);
          legAng.R.knee = legAng.L.knee;
          headRotX = stage(phase, [[0, -0.05], [0.35, -0.3], [0.5, 0.1], [1, 0]]);
          jawRotX = stage(phase, [[0, 0], [0.35, -0.35], [0.5, -0.1], [1, 0]]);
          break;
        }
        case 'fire': {
          armAng.R.shoulder = stage(phase, [[0, 0.1], [0.4, -1.6], [0.55, 0.4], [1, -0.05]]);
          armAng.R.elbow = stage(phase, [[0, 0.2], [0.4, 1.3], [0.55, 0.05], [1, 0.3]]);
          armAng.R.shoulderZ = -0.25;
          armAng.L.shoulder = 0.15; armAng.L.elbow = 0.3;
          spineRotX = stage(phase, [[0, 0.15], [0.4, -0.05], [1, 0.05]]);
          chestRotX = stage(phase, [[0, -0.05], [0.4, -0.15], [0.55, 0.1], [1, -0.02]]);
          headRotX = stage(phase, [[0, -0.1], [0.4, -0.2], [1, 0]]);
          hipsRotY = stage(phase, [[0, 0], [0.55, -0.08], [1, 0]]);
          break;
        }
        case 'hit': {
          const k = stage(phase, [[0, 0], [0.25, 1], [1, 0]]);
          hipsRotZ += -0.22 * k; chestRotZ += 0.28 * k; chestRotX += -0.22 * k;
          headRotZ += -0.3 * k; headRotX += -0.15 * k;
          armAng.L.shoulderZ += 0.3 * k; armAng.R.shoulderZ += -0.15 * k;
          hipsPosY -= 0.04 * k;
          break;
        }
        case 'block': {
          const k = stage(phase, [[0, 0], [0.25, 1], [0.8, 1], [1, 0]]);
          spineRotX += 0.3 * k; chestRotX += 0.17 * k;
          hipsPosY -= 0.12 * k; hipsRotX += 0.1 * k;
          armAng.L.shoulder = lerp(armAng.L.shoulder, -0.9, k);
          armAng.R.shoulder = lerp(armAng.R.shoulder, -0.9, k);
          armAng.L.elbow = lerp(armAng.L.elbow, 1.6, k);
          armAng.R.elbow = lerp(armAng.R.elbow, 1.6, k);
          armAng.L.shoulderZ = lerp(armAng.L.shoulderZ, 0.45, k);
          armAng.R.shoulderZ = lerp(armAng.R.shoulderZ, -0.45, k);
          headRotX = lerp(headRotX, 0.35, k);
          legAng.L.knee = lerp(legAng.L.knee, 0.5, k); legAng.R.knee = lerp(legAng.R.knee, 0.5, k);
          break;
        }
        case 'gather': {
          spineRotX = stage(phase, [[0, 0.5], [0.55, 1.05], [0.75, 0.95], [1, 0.65]]);
          chestRotX = stage(phase, [[0, -0.1], [0.55, 0.55], [0.75, 0.45], [1, 0.15]]);
          hipsPosY = hipsY0 - stage(phase, [[0, 0.02], [0.55, 0.22], [0.75, 0.20], [1, 0.08]]);
          legAng.L.knee = stage(phase, [[0, 0.1], [0.55, 0.55], [1, 0.3]]); legAng.R.knee = legAng.L.knee;
          const sh = stage(phase, [[0, 0.1], [0.5, -1.2], [0.7, -1.0], [1, -0.55]]);
          const el = stage(phase, [[0, 0.2], [0.5, 1.5], [0.7, 1.6], [1, 1.5]]);
          armAng.L.shoulder = sh; armAng.R.shoulder = sh; armAng.L.elbow = el; armAng.R.elbow = el;
          headRotX = stage(phase, [[0, 0], [0.55, 0.35], [1, 0.1]]);
          break;
        }
        case 'deposit': {
          spineRotX = stage(phase, [[0, 0.55], [0.5, 1.0], [0.85, 1.05], [1, 0.6]]);
          chestRotX = stage(phase, [[0, 0.15], [0.5, 0.5], [0.85, 0.55], [1, -0.02]]);
          hipsPosY = hipsY0 - stage(phase, [[0, 0.06], [0.5, 0.18], [0.85, 0.22], [1, 0.03]]);
          legAng.L.knee = stage(phase, [[0, 0.3], [0.5, 0.5], [0.85, 0.55], [1, 0.1]]); legAng.R.knee = legAng.L.knee;
          const sh = stage(phase, [[0, -0.55], [0.5, -1.1], [0.85, -1.25], [1, 0.1]]);
          const el = stage(phase, [[0, 1.5], [0.5, 1.55], [0.85, 1.5], [1, 0.25]]);
          armAng.L.shoulder = sh; armAng.R.shoulder = sh; armAng.L.elbow = el; armAng.R.elbow = el;
          headRotX = stage(phase, [[0, 0.1], [0.5, 0.3], [0.85, 0.35], [1, 0]]);
          break;
        }
        case 'eat': {
          const down = stage(phase, [[0, 0], [0.12, 1], [0.85, 1], [1, 0]]);
          spineRotX = lerp(spineRotX, 0.75, down); chestRotX = lerp(chestRotX, 0.35, down);
          neckRotX = lerp(neckRotX, -0.55, down); headRotX = lerp(headRotX, 0.35, down);
          hipsPosY -= 0.10 * down;
          legAng.L.knee = lerp(legAng.L.knee, 0.4, down); legAng.R.knee = legAng.L.knee;
          const chew = Math.sin(phase * Math.PI * 2 * 2.5) * down;
          jawRotX = -0.28 - Math.max(0, chew) * 0.22;
          armAng.L.shoulder = lerp(armAng.L.shoulder, -1.3, down * 0.6);
          armAng.L.elbow = lerp(armAng.L.elbow, 1.6, down * 0.6);
          break;
        }
        case 'drink': {
          const down = stage(phase, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
          spineRotX = lerp(spineRotX, 0.7, down); chestRotX = lerp(chestRotX, 0.3, down);
          neckRotX = lerp(neckRotX, -0.6, down); headRotX = lerp(headRotX, 0.45, down);
          hipsPosY -= 0.09 * down;
          legAng.L.knee = lerp(legAng.L.knee, 0.35, down); legAng.R.knee = legAng.L.knee;
          jawRotX = -0.08 * down;
          break;
        }
        case 'jump': {
          const load = stage(phase, [[0, 0], [0.33, 1], [0.5, 0.2], [1, 0]]);
          const ext = stage(phase, [[0, 0], [0.33, 0], [0.6, 1], [1, 1]]);
          hipsPosY = hipsY0 - 0.20 * load + 0.15 * ext;
          spineRotX = lerp(0.1, 0.5, load) - ext * 0.4;
          chestRotX = lerp(-0.05, 0.3, load) - ext * 0.35;
          legAng.L.knee = lerp(0.1, 0.9, load) * (1 - ext * 0.7); legAng.R.knee = legAng.L.knee;
          legAng.L.hip = -ext * 0.5; legAng.R.hip = -ext * 0.5;
          armAng.L.shoulder = lerp(0.1, 0.6, load) - ext * 1.6;
          armAng.R.shoulder = lerp(0.1, 0.6, load) - ext * 1.6;
          headRotX = -ext * 0.3;
          break;
        }
        case 'land': {
          const reach = stage(phase, [[0, 1], [0.3, 1], [0.55, 0.2], [1, 0]]);
          const compress = stage(phase, [[0, 0], [0.35, 0], [0.55, 1], [0.8, 0.3], [1, 0]]);
          hipsPosY = hipsY0 - reach * 0.05 - compress * 0.22;
          spineRotX = 0.55 * reach + compress * 0.5;
          chestRotX = 0.35 * reach + compress * 0.4;
          legAng.L.knee = 0.15 + compress * 0.75 + reach * 0.2; legAng.R.knee = legAng.L.knee;
          armAng.L.shoulder = -1.4 * reach + compress * 0.3;
          armAng.R.shoulder = -1.4 * reach + compress * 0.3;
          headRotX = -0.25 * reach + compress * 0.15;
          break;
        }
        case 'signal': {
          const rise = stage(phase, [[0, 0], [0.25, 1], [0.75, 1], [1, 0]]);
          spineRotX = lerp(spineRotX, -0.35, rise); chestRotX = lerp(chestRotX, -0.25, rise);
          hipsPosY = hipsY0 + 0.10 * rise; hipsRotX = -0.1 * rise;
          neckRotX = lerp(neckRotX, -0.2, rise); headRotX = lerp(headRotX, -0.25, rise);
          legAng.L.knee = lerp(legAng.L.knee, 0.05, rise); legAng.R.knee = legAng.L.knee;
          const beat = Math.sin(phase * Math.PI * 2 * 6);
          armAng.L.shoulder = lerp(armAng.L.shoulder, -1.7 + Math.max(0, beat) * 0.5, rise);
          armAng.R.shoulder = lerp(armAng.R.shoulder, -1.7 + Math.max(0, -beat) * 0.5, rise);
          armAng.L.elbow = lerp(armAng.L.elbow, 1.7, rise); armAng.R.elbow = lerp(armAng.R.elbow, 1.7, rise);
          armAng.L.shoulderZ = lerp(armAng.L.shoulderZ, 0.5, rise);
          armAng.R.shoulderZ = lerp(armAng.R.shoulderZ, -0.5, rise);
          jawRotX = -0.3 * rise;
          break;
        }
        case 'sleep': {
          const k = smooth(0, 0.7, phase);
          spineRotX = lerp(spineRotX, 1.3, k); chestRotX = lerp(chestRotX, 0.8, k);
          hipsRotX = lerp(hipsRotX, 0.5, k); hipsPosY = hipsY0 - 0.55 * k;
          legAng.L.hip = lerp(legAng.L.hip, 0.9, k); legAng.R.hip = legAng.L.hip;
          legAng.L.knee = lerp(legAng.L.knee, 1.3, k); legAng.R.knee = legAng.L.knee;
          armAng.L.shoulder = lerp(armAng.L.shoulder, -0.4, k); armAng.R.shoulder = lerp(armAng.R.shoulder, -0.4, k);
          armAng.L.elbow = lerp(armAng.L.elbow, 1.5, k); armAng.R.elbow = lerp(armAng.R.elbow, 1.5, k);
          neckRotX = lerp(neckRotX, 0.9, k); headRotX = lerp(headRotX, 0.5, k);
          chestRotX += Math.sin(t * 1.2) * 0.02 * k;
          break;
        }
        case 'wake': {
          const awake = smooth(0.1, 0.9, phase);
          spineRotX = lerp(1.3, 0.05, awake); chestRotX = lerp(0.8, -0.02, awake);
          hipsRotX = lerp(0.5, 0, awake); hipsPosY = hipsY0 - 0.55 * (1 - awake);
          legAng.L.hip = lerp(0.9, 0, awake); legAng.R.hip = legAng.L.hip;
          legAng.L.knee = lerp(1.3, 0.08, awake); legAng.R.knee = legAng.L.knee;
          armAng.L.shoulder = lerp(-0.4, 0.1, awake); armAng.R.shoulder = lerp(-0.4, 0.1, awake);
          armAng.L.elbow = lerp(1.5, 0.2, awake); armAng.R.elbow = lerp(1.5, 0.2, awake);
          neckRotX = lerp(0.9, 0.05, awake); headRotX = lerp(0.5, 0, awake);
          headRotZ += (1 - smooth(0, 0.3, phase)) * Math.sin(phase * 40) * 0.03;
          break;
        }
        case 'die': {
          const k = smooth(0, 0.8, phase);
          spineRotX = lerp(0.1, 1.6, k); chestRotX = lerp(-0.02, 0.9, k);
          hipsRotX = lerp(0, 0.7, k); hipsRotZ = lerp(0, 0.5, smooth(0.1, 0.6, phase));
          hipsPosY = hipsY0 - 0.65 * k;
          legAng.L.hip = lerp(0, 0.4, k); legAng.R.hip = lerp(0, -0.2, k);
          legAng.L.knee = lerp(0.1, 1.0, k); legAng.R.knee = lerp(0.1, 0.6, k);
          armAng.L.shoulder = lerp(0.1, -1.1, k); armAng.R.shoulder = lerp(0.1, 0.6, k);
          armAng.L.elbow = lerp(0.2, 0.3, k); armAng.R.elbow = lerp(0.2, 0.9, k);
          neckRotX = lerp(0.05, 0.6, k); headRotX = lerp(0, 0.4, k); headRotZ = lerp(0, 0.6, k);
          jawRotX = -0.25 * smooth(0.2, 0.6, phase);
          break;
        }
        case 'evolve': {
          const brace = stage(phase, [[0, 0], [0.25, 1], [0.4, 0.6], [1, 0]]);
          const open = stage(phase, [[0, 0], [0.4, 0], [0.65, 1], [0.85, 1], [1, 0]]);
          spineRotX = lerp(spineRotX, 0.5, brace) - open * 0.55;
          chestRotX = lerp(chestRotX, 0.3, brace) - open * 0.4;
          hipsPosY = hipsY0 - 0.15 * brace + 0.08 * open;
          legAng.L.knee = lerp(legAng.L.knee, 0.55, brace) * (1 - open * 0.6); legAng.R.knee = legAng.L.knee;
          armAng.L.shoulder = lerp(0.1, -0.3, brace) - open * 1.9;
          armAng.R.shoulder = lerp(0.1, -0.3, brace) - open * 1.9;
          armAng.L.shoulderZ = 0.15 + open * 0.7; armAng.R.shoulderZ = -0.15 - open * 0.7;
          armAng.L.elbow = lerp(0.2, 0.6, brace) - open * 0.4; armAng.R.elbow = armAng.L.elbow;
          bellyScale = 1 + open * 0.15 + Math.sin(phase * Math.PI * 2 * 4) * 0.03 * open;
          crestScale = 1 + open * 0.25;
          headRotX = -open * 0.3; jawRotX = -open * 0.35;
          break;
        }
      }
    } else if (!grounded) {
      spineRotX = 0.5; chestRotX = 0.25;
      armAng.L.shoulder = -0.5; armAng.L.elbow = 0.5;
      armAng.R.shoulder = -0.5; armAng.R.elbow = 0.5;
      legAng.L.hip = 0.35; legAng.L.knee = 0.6;
      legAng.R.hip = 0.35; legAng.R.knee = 0.6;
      hipsPosY = hipsY0 - 0.05;
      hipsRotZ += Math.sin(t * 3.0) * 0.03;
    } else {
      const cr = smooth(0, 0.35, speed);
      const creep = smooth(0, 0.25, speed) * (1 - smooth(0.35, 1.3, speed));
      const gal = smooth(1.2, 2.5, speed);
      const reachBase = lerp(0.35, 0.95, smooth(0, 6, speed));
      const liftBase = lerp(0.18, 0.55, smooth(0, 6, speed));

      spineRotX = lerp(0.05, 0.95, cr) + creep * 0.25;
      chestRotX = lerp(-0.02, 0.55, cr) + creep * 0.15;
      hipsRotX = lerp(0, 0.12, cr);
      hipsPosY = hipsY0 - lerp(0, 0.16, cr) - creep * 0.10;
      neckRotX = lerp(0.05, -0.35, cr);
      headRotX = lerp(0, -0.15, cr);
      armAng.L.shoulderZ = 0.12 + cr * 0.08;
      armAng.R.shoulderZ = -0.12 - cr * 0.08;

      if (speed > 0.001) {
        const cyc0 = ((s.stride % 1) + 1) % 1;
        const legPhase = (offset) => {
          const c = ((cyc0 + offset) % 1 + 1) % 1;
          const ang = Math.cos(c * Math.PI * 2);
          let lift = 0;
          if (c > 0.5) { const st = (c - 0.5) * 2; lift = Math.sin(st * Math.PI); }
          return { ang, lift };
        };
        const offFR = lerp(0.5, 0.0, gal);
        const offRR = lerp(0.0, 0.5, gal);
        const FL = legPhase(0), FR = legPhase(offFR), RL = legPhase(0.5), RR = legPhase(offRR);
        const reach = reachBase * (1 - creep * 0.35);
        const lift = liftBase;

        armAng.L.shoulder = 0.08 + FL.ang * reach * 0.9 + lerp(0, 0.3, cr);
        armAng.L.elbow = 0.18 + FL.lift * lift * 1.4;
        armAng.L.hand = -FL.lift * 0.2;
        armAng.R.shoulder = 0.08 + FR.ang * reach * 0.9 + lerp(0, 0.3, cr);
        armAng.R.elbow = 0.18 + FR.lift * lift * 1.4;
        armAng.R.hand = -FR.lift * 0.2;

        legAng.L.hip = RL.ang * reach * 0.7;
        legAng.L.knee = 0.10 + RL.lift * lift * 1.1;
        legAng.L.foot = -RL.lift * 0.3;
        legAng.R.hip = RR.ang * reach * 0.7;
        legAng.R.knee = 0.10 + RR.lift * lift * 1.1;
        legAng.R.foot = -RR.lift * 0.3;

        hipsPosY += (FL.lift + FR.lift + RL.lift + RR.lift) * 0.01 * lerp(1, 1.8, gal);
        hipsRotZ = Math.sin(cyc0 * Math.PI * 2) * 0.05 * lerp(1, 0.4, cr);
        chestRotZ = -hipsRotZ * 0.6;
      }

      const idleAmt = 1 - smooth(0, 0.4, speed);
      if (idleAmt > 0) {
        const breathe = Math.sin(t * 1.6);
        chestRotX += breathe * 0.025 * idleAmt;
        bellyScale *= 1 + breathe * 0.02 * idleAmt;
        hipsPosY += Math.sin(t * 0.5) * 0.01 * idleAmt;
        hipsRotY += Math.sin(t * 0.35) * 0.05 * idleAmt;
        headRotY = Math.sin(t * 0.6) * 0.18 * idleAmt;
        headRotX += Math.sin(t * 0.9 + 1.0) * 0.03 * idleAmt;
        const shift = Math.sin(t * 0.45);
        hipsRotZ += shift * 0.03 * idleAmt;
        legAng.L.knee += Math.max(0, shift) * 0.02 * idleAmt;
        legAng.R.knee += Math.max(0, -shift) * 0.02 * idleAmt;
      }
    }

    hipsRotZ += -turn * 0.14; spineRotZ += -turn * 0.10; chestRotZ += -turn * 0.16;
    chestRotY += turn * 0.12; neckRotY += turn * 0.15; headRotY += turn * 0.35; hipsRotY += turn * 0.08;
    const insideL = clamp01(-turn), insideR = clamp01(turn);
    armAng.L.elbow += insideL * 0.25; legAng.L.knee += insideL * 0.15; armAng.L.shoulder += insideL * 0.15;
    armAng.R.elbow += insideR * 0.25; legAng.R.knee += insideR * 0.15; armAng.R.shoulder += insideR * 0.15;

    const hurtAmt = clamp01(1 - health);
    hipsRotZ += hurtAmt * 0.12; chestRotZ += -hurtAmt * 0.10; chestRotY += hurtAmt * 0.08;
    spineRotX += hurtAmt * 0.12; headRotX += hurtAmt * 0.18; headRotZ += hurtAmt * 0.15;
    armAng.R.shoulder += -hurtAmt * 0.5; armAng.R.elbow += hurtAmt * 0.5;
    legAng.L.knee += hurtAmt * 0.15; hipsPosY -= hurtAmt * 0.05;

    hips.position.set(0, hipsPosY, hipsZ0);
    hips.rotation.set(hipsRotX, hipsRotY, hipsRotZ);
    spine.position.set(0, spineY0, spineZ0);
    spine.rotation.set(spineRotX, spineRotY, spineRotZ);
    chest.position.set(0, chestY0, chestZ0);
    chest.rotation.set(chestRotX, chestRotY, chestRotZ);
    neck.rotation.set(neckRotX, neckRotY, neckRotZ);
    head.rotation.set(headRotX, headRotY, headRotZ);
    jaw.rotation.set(jawRotX, 0, 0);
    belly.position.set(0, bellyY0, bellyZ0);
    belly.scale.setScalar(bellyScale);
    sagittalCrest.scale.setScalar(crestScale);

    upperLegs.L.rotation.set(legAng.L.hip, 0, 0.03);
    lowerLegs.L.rotation.set(legAng.L.knee, 0, 0);
    feet.L.rotation.set(legAng.L.foot || 0, 0, 0);
    upperLegs.R.rotation.set(legAng.R.hip, 0, -0.03);
    lowerLegs.R.rotation.set(legAng.R.knee, 0, 0);
    feet.R.rotation.set(legAng.R.foot || 0, 0, 0);

    upperArms.L.rotation.set(armAng.L.shoulder, 0, armAng.L.shoulderZ);
    forearms.L.rotation.set(armAng.L.elbow, 0, 0);
    hands.L.rotation.set(armAng.L.hand || 0, 0, 0);
    upperArms.R.rotation.set(armAng.R.shoulder, 0, armAng.R.shoulderZ);
    forearms.R.rotation.set(armAng.R.elbow, 0, 0);
    hands.R.rotation.set(armAng.R.hand || 0, 0, 0);
  };

  return root;
}