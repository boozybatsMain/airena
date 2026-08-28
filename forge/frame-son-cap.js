function build(THREE, TSL) {
  // ARMOURED OCTOPUS
  // ONE QUALITY: MASS AND POWER (a heavy bulbous mantle carried above a
  // ring of thick, tapering, drooping arms - a squat, deep-bodied thing
  // that pulls itself along on eight limbs and jets when it must move fast).
  // BRIEF: a bulbous three-segment mantle (widest mass, thickest front-to-
  // back and top-to-bottom) sits above a short forward-leaning neck and a
  // dense faceted head. The head carries two large recessed-glass eyes in
  // machined bezels, cheek plates, a brow, and a hinged beak tucked under
  // it. Eight thick tapering arms ring the base of the head, drooping
  // outward and down like heavy hydraulic legs, each a chain of four
  // segments narrowing to a blunt tip. A siphon nozzle hangs off the
  // underside of the lower mantle, aimed back for jetting/ink-fire. What
  // will make it read as expensive: the mantle built as a true stacked,
  // lathed, bulging mass (not a sphere), the head out-detailing every
  // single arm, and every joint (shoulder, neck, mantle waists) carrying
  // a visible collar.

  const object = new THREE.Group();
  object.name = 'armouredOctopus';

  // ---------- materials ----------
  const boneA = new THREE.Color(0xD8D2C6);
  const boneB = new THREE.Color(0xB5AC9C);

  function shellMat() {
    const m = new THREE.MeshStandardMaterial({ metalness: 0.12, roughness: 0.58 });
    const n = TSL.normalLocal;
    const t = TSL.clamp(TSL.add(TSL.mul(n.y, 0.5), 0.5), 0.0, 1.0);
    m.colorNode = TSL.mix(TSL.vec3(boneB.r, boneB.g, boneB.b), TSL.vec3(boneA.r, boneA.g, boneA.b), t);
    return m;
  }
  const matShellHead = shellMat();
  const matShellMantle = shellMat();
  const matMachine = new THREE.MeshStandardMaterial({ color: 0x4A4238, metalness: 0.75, roughness: 0.55 });
  const matMachineDark = new THREE.MeshStandardMaterial({ color: 0x3E3A34, metalness: 0.72, roughness: 0.6 });
  const matLens = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, metalness: 0.1, roughness: 0.08 });
  const matBeak = new THREE.MeshStandardMaterial({ color: 0x2b2925, metalness: 0.55, roughness: 0.5 });
  const matRubber = new THREE.MeshStandardMaterial({ color: 0x1E1D1B, metalness: 0.0, roughness: 0.92 });

  // ---------- helpers ----------
  function taperedUp(rBottom, rTop, length, mat, segs = 8) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, length, segs, 1, false);
    g.translate(0, length / 2, 0);
    return new THREE.Mesh(g, mat);
  }
  function taperedDown(rTop, rBottom, length, mat, segs = 8) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, length, segs, 1, false);
    g.translate(0, -length / 2, 0);
    return new THREE.Mesh(g, mat);
  }
  function lathePart(pts, mat, segs = 20) {
    const v = pts.map(p => new THREE.Vector2(p[0], p[1]));
    const g = new THREE.LatheGeometry(v, segs);
    return new THREE.Mesh(g, mat);
  }
  function collar(r, tube, mat) {
    return new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 16), mat);
  }

  const P = {}; // part registry
  const BASE = {}; // stored rest positions for additive offsets

  // ================= MANTLE STACK (torso, biggest/widest mass) =================
  const mantleMid = lathePart([
    [0.55, 0], [0.60, 0.15], [0.62, 0.28], [0.56, 0.40], [0.50, 0.45]
  ], matShellMantle);
  mantleMid.name = 'mantleMid';
  mantleMid.position.set(0, 1.40, -0.05);
  object.add(mantleMid);
  P.mantleMid = mantleMid;
  BASE.mantleMid = mantleMid.position.clone();

  const mantleUpper = lathePart([
    [0.50, 0], [0.45, 0.08], [0.30, 0.18], [0.12, 0.28], [0.02, 0.32]
  ], matShellMantle);
  mantleUpper.name = 'mantleUpper';
  mantleUpper.position.set(0, 0.45, 0);
  mantleMid.add(mantleUpper);
  P.mantleUpper = mantleUpper;
  BASE.mantleUpper = mantleUpper.position.clone();

  const mantleLower = lathePart([
    [0.55, 0], [0.50, -0.10], [0.42, -0.20], [0.34, -0.28]
  ], matShellMantle);
  mantleLower.name = 'mantleLower';
  mantleLower.position.set(0, 0, 0);
  mantleMid.add(mantleLower);
  P.mantleLower = mantleLower;
  BASE.mantleLower = mantleLower.position.clone();

  const collarMidLower = collar(0.5, 0.045, matMachineDark);
  collarMidLower.name = 'collarMantleMidLower';
  collarMidLower.rotation.x = Math.PI / 2;
  mantleLower.add(collarMidLower);

  // ---------------- siphon (jet nozzle, fires ink/water) ----------------
  const siphon = new THREE.Object3D();
  siphon.name = 'siphon';
  siphon.position.set(0, -0.16, -0.20);
  siphon.rotation.x = 0.95;
  mantleLower.add(siphon);
  P.siphon = siphon;
  BASE.siphonRot = siphon.rotation.x;

  const siphonTube = taperedUp(0.05, 0.08, 0.22, matMachine);
  siphonTube.name = 'siphonTube';
  siphon.add(siphonTube);

  const siphonNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.06, 0.08, 8), matMachineDark);
  siphonNozzle.name = 'siphonNozzle';
  siphonNozzle.position.set(0, 0.22, 0);
  siphon.add(siphonNozzle);
  P.siphonNozzle = siphonNozzle;

  // ================= NECK =================
  const neck = taperedDown(0.34, 0.30, 0.22, matMachine);
  neck.name = 'neck';
  neck.position.set(0, -0.28, 0);
  neck.rotation.x = -0.12;
  mantleLower.add(neck);
  P.neck = neck;
  BASE.neck = neck.position.clone();

  // ================= HEAD (leading end) =================
  const head = lathePart([
    [0.30, 0], [0.36, -0.08], [0.38, -0.18], [0.34, -0.30], [0.30, -0.40], [0.28, -0.42]
  ], matShellHead);
  head.name = 'head';
  head.position.set(0, -0.22, 0);
  neck.add(head);
  P.head = head;
  BASE.head = head.position.clone();

  const collarNeckHead = collar(0.30, 0.04, matMachineDark);
  collarNeckHead.name = 'collarNeckHead';
  collarNeckHead.rotation.x = Math.PI / 2;
  head.add(collarNeckHead);

  const browPlate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.10, 0.14), matShellHead);
  browPlate.name = 'browPlate';
  browPlate.position.set(0, -0.03, 0.28);
  browPlate.rotation.x = -0.25;
  head.add(browPlate);
  P.browPlate = browPlate;

  const cheekPlateL = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.22, 0.24), matShellHead);
  cheekPlateL.name = 'cheekPlateL';
  cheekPlateL.position.set(-0.32, -0.18, 0.02);
  cheekPlateL.rotation.y = 0.25;
  head.add(cheekPlateL);
  P.cheekPlateL = cheekPlateL;

  const cheekPlateR = cheekPlateL.clone();
  cheekPlateR.name = 'cheekPlateR';
  cheekPlateR.position.x = 0.32;
  cheekPlateR.rotation.y = -0.25;
  head.add(cheekPlateR);
  P.cheekPlateR = cheekPlateR;

  function buildEye(name, side) {
    const mount = new THREE.Object3D();
    mount.name = name + 'Mount';
    mount.position.set(0.26 * side, -0.14, 0.27);
    head.add(mount);
    const bezel = collar(0.13, 0.028, matMachineDark);
    bezel.name = name + 'Bezel';
    mount.add(bezel);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.10, 16, 12), matLens);
    lens.name = name + 'Lens';
    lens.scale.set(1, 1, 0.55);
    lens.position.set(0, 0, -0.02);
    mount.add(lens);
    return mount;
  }
  P.eyeMountL = buildEye('eyeL', -1);
  P.eyeMountR = buildEye('eyeR', 1);

  const beakUpper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.18), matBeak);
  beakUpper.name = 'beakUpper';
  beakUpper.position.set(0, -0.32, 0.26);
  beakUpper.rotation.x = 0.3;
  head.add(beakUpper);
  P.beakUpper = beakUpper;

  const beakLower = new THREE.Object3D();
  beakLower.name = 'beakLower';
  beakLower.position.set(0, -0.35, 0.22);
  head.add(beakLower);
  const beakLowerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.15), matBeak);
  beakLowerMesh.position.set(0, -0.03, 0.05);
  beakLower.add(beakLowerMesh);
  P.beakLower = beakLower;

  // ================= ARM CROWN + ARMS =================
  const armCrown = new THREE.Object3D();
  armCrown.name = 'armCrown';
  armCrown.position.set(0, -0.42, 0);
  head.add(armCrown);
  P.armCrown = armCrown;

  const armSpecs = [
    { name: 'arm1L', angle: -30, elev: 38, len: 1.50, pair: 0, side: 'L' },
    { name: 'arm1R', angle: 30, elev: 38, len: 1.50, pair: 0, side: 'R' },
    { name: 'arm2L', angle: -72, elev: 46, len: 1.62, pair: 1, side: 'L' },
    { name: 'arm2R', angle: 72, elev: 46, len: 1.62, pair: 1, side: 'R' },
    { name: 'arm3L', angle: -115, elev: 54, len: 1.58, pair: 2, side: 'L' },
    { name: 'arm3R', angle: 115, elev: 54, len: 1.58, pair: 2, side: 'R' },
    { name: 'arm4L', angle: -155, elev: 60, len: 1.42, pair: 3, side: 'L' },
    { name: 'arm4R', angle: 155, elev: 60, len: 1.42, pair: 3, side: 'R' }
  ];
  const crownRadius = 0.30;
  P.arms = [];

  armSpecs.forEach(spec => {
    const aRad = THREE.MathUtils.degToRad(spec.angle);
    const eRad = THREE.MathUtils.degToRad(spec.elev);
    const dir = new THREE.Vector3(
      Math.sin(aRad) * Math.cos(eRad),
      -Math.sin(eRad),
      Math.cos(aRad) * Math.cos(eRad)
    ).normalize();
    const baseQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    const root = new THREE.Object3D();
    root.name = spec.name;
    root.position.set(Math.sin(aRad) * crownRadius, -0.01, Math.cos(aRad) * crownRadius);
    root.quaternion.copy(baseQuat);
    armCrown.add(root);

    const shoulder = collar(0.16, 0.03, matMachineDark);
    shoulder.name = spec.name + '_shoulder';
    root.add(shoulder);

    const fr = [0.34, 0.28, 0.22, 0.16];
    const rad = [0.15, 0.115, 0.08, 0.05, 0.028];
    let parent = root;
    const segs = [];
    for (let i = 0; i < 4; i++) {
      const segLen = spec.len * fr[i];
      const seg = taperedUp(rad[i], rad[i + 1], segLen, matMachine, 8);
      seg.name = spec.name + '_seg' + (i + 1);
      seg.position.set(0, 0, 0);
      parent.add(seg);
      segs.push(seg);
      parent = seg;
    }
    const tip = new THREE.Mesh(new THREE.SphereGeometry(rad[4] * 1.3, 8, 6), matMachineDark);
    tip.name = spec.name + '_tip';
    tip.position.set(0, spec.len * fr[3], 0);
    parent.add(tip);

    P.arms.push({
      root, segs, tip, side: spec.side, pair: spec.pair,
      baseQuat, sideVal: spec.side === 'L' ? -1 : 1
    });
  });

  // ================= POSE =================
  const clamp01 = v => THREE.MathUtils.clamp(v, 0, 1);
  const lerp = THREE.MathUtils.lerp;
  const win = (p, a, b) => clamp01((p - a) / Math.max(1e-5, b - a));

  function setArmPose(arm, yaw, pitch, roll, curl) {
    const dyn = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'XYZ'));
    arm.root.quaternion.copy(arm.baseQuat).multiply(dyn);
    for (let i = 0; i < arm.segs.length; i++) {
      arm.segs[i].rotation.set(curl * (0.35 + 0.22 * i), 0, 0);
    }
  }

  object.userData.pose = (s) => {
    const speed = s.speed || 0;
    const stride = ((s.stride || 0) % 1 + 1) % 1;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = s.health === undefined ? 1 : s.health;
    const t = s.t || 0;
    const action = s.action || null;
    const phase = s.phase || 0;

    const crawlBlend = clamp01(speed / 2);
    const sprintBlend = clamp01((speed - 2) / 4);
    const idleBlend = 1 - clamp01(speed / 0.6);

    // reset bases each frame
    P.mantleMid.position.copy(BASE.mantleMid);
    P.mantleUpper.position.copy(BASE.mantleUpper);
    P.mantleLower.position.copy(BASE.mantleLower);
    P.neck.position.copy(BASE.neck);
    P.head.position.copy(BASE.head);
    P.mantleMid.scale.set(1, 1, 1);
    P.mantleMid.rotation.set(0, 0, 0);
    P.neck.rotation.set(-0.12, 0, 0);
    P.head.rotation.set(0, 0, 0);
    P.beakLower.rotation.set(0, 0, 0);
    P.siphon.rotation.set(BASE.siphonRot, 0, 0);

    // ---------- default idle breathing ----------
    const breathe = 1 + Math.sin(t * 1.5) * 0.015 * idleBlend;
    P.mantleMid.scale.set(breathe, breathe, breathe);
    P.head.rotation.y = Math.sin(t * 0.4) * 0.08 * idleBlend;

    function computeArmGait(arm, grounded) {
      const i = arm.pair * 2 + (arm.side === 'L' ? 0 : 1);
      let yaw = 0, pitch = 0, curl = 0.15;
      if (!grounded) {
        pitch = -0.6;
        yaw = Math.sin(t * 2 + i) * 0.05;
        curl = 0.3;
      } else {
        const wavePhase = ((stride + i / 8) % 1 + 1) % 1;
        const s2 = Math.sin(wavePhase * Math.PI * 2);
        const crawlYaw = s2 * 0.28;
        const crawlPitch = -Math.max(0, s2) * 0.45;
        const crawlCurl = (s2 < 0 ? (-s2) * 0.45 : 0.08);
        const ripple = Math.sin(stride * Math.PI * 2 + i * 0.4) * 0.07 * sprintBlend;
        const sprintPitch = -0.85;
        const sprintCurl = 0.5;
        yaw = lerp(crawlYaw * crawlBlend, ripple, sprintBlend);
        pitch = lerp(crawlPitch * crawlBlend, sprintPitch, sprintBlend);
        curl = 0.12 + lerp(crawlCurl * crawlBlend, sprintCurl, sprintBlend);
        yaw += Math.sin(t * 0.6 + i) * 0.04 * idleBlend;
      }
      // turn overlay
      const prod = turn * arm.sideVal;
      curl += Math.max(0, prod) * 0.35;
      yaw += -Math.max(0, -prod) * 0.25;
      // hurt overlay
      if (arm.side === 'R') pitch += (1 - health) * 0.3;
      curl *= (0.7 + 0.3 * health);
      return { yaw, pitch, roll: 0, curl };
    }

    if (!action) {
      // ---------------- default gait / turn / hurt ----------------
      P.arms.forEach(arm => {
        const g = computeArmGait(arm, grounded);
        setArmPose(arm, g.yaw, g.pitch, g.roll, g.curl);
      });
      // mantle pulse for swimming
      const pulse = Math.sin(stride * Math.PI * 4) * 0.06 * sprintBlend;
      P.mantleMid.scale.set(1 - pulse * 0.4, 1 + pulse, 1 - pulse * 0.4);
      // turn bank
      P.mantleMid.rotation.z = -turn * 0.12;
      P.head.rotation.y += turn * 0.25;
      // hurt sag
      P.head.rotation.x += (1 - health) * 0.35;
      P.mantleMid.rotation.z += (1 - health) * 0.2;
      P.neck.rotation.z = (1 - health) * 0.15;
    } else {
      // ---------------- actions ----------------
      const REST = { yaw: 0, pitch: 0, roll: 0, curl: 0.15 };
      const setAll = (fn) => P.arms.forEach(arm => {
        const v = fn(arm);
        setArmPose(arm, v.yaw, v.pitch, v.roll, v.curl);
      });
      const restIdle = () => setAll(() => ({ ...REST }));

      if (action === 'attack') {
        restIdle();
        const front = P.arms.filter(a => a.pair === 0);
        let pitch, curl;
        if (phase < 0.3) {
          const tt = phase / 0.3;
          pitch = lerp(0, -1.0, tt); curl = lerp(0.15, 0.6, tt);
          P.mantleMid.rotation.x = lerp(0, -0.08, tt);
        } else if (phase < 0.55) {
          const tt = (phase - 0.3) / 0.25;
          pitch = lerp(-1.0, 0.9, tt); curl = lerp(0.6, 0.1, tt);
          P.mantleMid.rotation.x = -0.08;
        } else {
          const tt = (phase - 0.55) / 0.45;
          pitch = lerp(0.9, 0, tt); curl = lerp(0.1, 0.15, tt);
          P.mantleMid.rotation.x = lerp(-0.08, 0, tt);
        }
        front.forEach(a => setArmPose(a, 0, pitch, 0, curl));
      } else if (action === 'fire') {
        restIdle();
        if (phase < 0.3) {
          const tt = phase / 0.3;
          P.siphon.rotation.x = lerp(BASE.siphonRot, 0.35, tt);
          P.mantleMid.rotation.x = lerp(0, 0.05, tt);
        } else if (phase < 0.5) {
          const tt = (phase - 0.3) / 0.2;
          const kick = Math.sin(tt * Math.PI);
          P.mantleMid.scale.set(1 + kick * 0.06, 1 - kick * 0.08, 1 + kick * 0.06);
          P.mantleMid.position.z = BASE.mantleMid.z - kick * 0.05;
          P.siphon.rotation.x = 0.35;
        } else {
          const tt = (phase - 0.5) / 0.5;
          P.siphon.rotation.x = lerp(0.35, BASE.siphonRot, tt);
          P.mantleMid.rotation.x = lerp(0.05, 0, tt);
        }
      } else if (action === 'hit') {
        const amt = Math.sin(clamp01(phase / 0.5) * Math.PI);
        setAll(() => ({ yaw: 0, pitch: -0.2 * amt, roll: 0, curl: 0.15 + 0.15 * amt }));
        P.head.rotation.x = -0.3 * amt;
        P.mantleMid.rotation.x = -0.15 * amt;
      } else if (action === 'block') {
        const amt = clamp01(phase / 0.2);
        setAll(arm => {
          if (arm.pair <= 1) {
            return { yaw: -arm.sideVal * 0.3 * amt, pitch: lerp(0, -0.9, amt), roll: 0, curl: lerp(0.15, 0.7, amt) };
          }
          return { yaw: 0, pitch: lerp(0, 0.2, amt), roll: 0, curl: lerp(0.15, 0.45, amt) };
        });
        P.mantleMid.rotation.x = 0.1 * amt;
        P.mantleMid.position.z = BASE.mantleMid.z - 0.05 * amt;
      } else if (action === 'gather') {
        setAll(arm => {
          if (arm.pair <= 1) {
            let pitch, curl;
            if (phase < 0.4) { const tt = phase / 0.4; pitch = lerp(0, 0.35, tt); curl = lerp(0.15, 0.05, tt); }
            else if (phase < 0.7) { const tt = (phase - 0.4) / 0.3; pitch = 0.35; curl = lerp(0.05, 0.7, tt); }
            else { const tt = (phase - 0.7) / 0.3; pitch = lerp(0.35, 0.05, tt); curl = 0.7; }
            return { yaw: 0, pitch, roll: 0, curl };
          }
          return { ...REST };
        });
        P.head.rotation.x = phase < 0.4 ? lerp(0, 0.5, phase / 0.4) : (phase < 0.7 ? 0.5 : lerp(0.5, 0.35, (phase - 0.7) / 0.3));
      } else if (action === 'deposit') {
        setAll(arm => {
          if (arm.pair <= 1) {
            let pitch, curl;
            if (phase < 0.5) { pitch = 0.35; curl = 0.7; }
            else if (phase < 0.8) { const tt = (phase - 0.5) / 0.3; pitch = 0.35; curl = lerp(0.7, 0.1, tt); }
            else { const tt = (phase - 0.8) / 0.2; pitch = lerp(0.35, 0, tt); curl = 0.1; }
            return { yaw: 0, pitch, roll: 0, curl };
          }
          return { ...REST };
        });
        P.head.rotation.x = phase < 0.8 ? 0.4 : lerp(0.4, 0, (phase - 0.8) / 0.2);
      } else if (action === 'eat') {
        restIdle();
        const down = win(phase, 0, 0.15);
        const up = 1 - win(phase, 0.85, 1);
        P.head.rotation.x = 0.4 * Math.min(down, up);
        const chatter = phase > 0.15 && phase < 0.85 ? Math.max(0, Math.sin(phase * 3 * Math.PI * 2)) : 0;
        P.beakLower.rotation.x = -0.5 * chatter;
      } else if (action === 'drink') {
        restIdle();
        let hx;
        if (phase < 0.3) hx = lerp(0, 0.45, phase / 0.3);
        else if (phase < 0.7) hx = 0.45;
        else hx = lerp(0.45, 0, (phase - 0.7) / 0.3);
        P.head.rotation.x = hx;
        P.beakLower.rotation.x = -0.08;
      } else if (action === 'jump') {
        let my, pitch, curl;
        if (phase < 0.33) {
          const tt = phase / 0.33;
          my = lerp(0, -0.15, tt); pitch = lerp(0, 0.4, tt); curl = lerp(0.15, 0.5, tt);
        } else {
          const tt = (phase - 0.33) / 0.67;
          my = lerp(-0.15, 0.28, tt); pitch = lerp(0.4, -0.75, tt); curl = lerp(0.5, 0.08, tt);
        }
        P.mantleMid.position.y = BASE.mantleMid.y + my;
        setAll(() => ({ yaw: 0, pitch, roll: 0, curl }));
      } else if (action === 'land') {
        let my, pitch, curl, sy = 1;
        if (phase < 0.3) {
          const tt = phase / 0.3;
          my = lerp(0.2, 0.05, tt); pitch = lerp(-0.3, -0.8, tt); curl = lerp(0.15, 0.3, tt);
        } else if (phase < 0.5) {
          const tt = (phase - 0.3) / 0.2;
          my = lerp(0.05, -0.18, tt); pitch = lerp(-0.8, 0.35, tt); curl = lerp(0.3, 0.6, tt);
          sy = lerp(1, 0.85, tt);
        } else {
          const tt = (phase - 0.5) / 0.5;
          my = lerp(-0.18, 0, tt); pitch = lerp(0.35, 0, tt); curl = lerp(0.6, 0.15, tt);
          sy = lerp(0.85, 1, tt);
        }
        P.mantleMid.position.y = BASE.mantleMid.y + my;
        P.mantleMid.scale.set(1, sy, 1);
        setAll(() => ({ yaw: 0, pitch, roll: 0, curl }));
      } else if (action === 'signal') {
        let my, spread, curl, pitch;
        if (phase < 0.3) { const tt = phase / 0.3; my = lerp(0, 0.2, tt); spread = 0; curl = lerp(0.15, 0.15, tt); pitch = 0; }
        else if (phase < 0.5) { const tt = (phase - 0.3) / 0.2; my = 0.2; curl = lerp(0.15, 0.02, tt); pitch = lerp(0, -0.35, tt); }
        else if (phase < 0.8) { my = 0.2 + Math.sin(phase * 20) * 0.01; curl = 0.02; pitch = -0.35; }
        else { const tt = (phase - 0.8) / 0.2; my = lerp(0.2, 0, tt); curl = lerp(0.02, 0.15, tt); pitch = lerp(-0.35, 0, tt); }
        P.mantleMid.position.y = BASE.mantleMid.y + my;
        P.head.rotation.x = -0.1;
        setAll(arm => ({ yaw: arm.sideVal * 0.35, pitch, roll: 0, curl }));
      } else if (action === 'sleep') {
        const p = clamp01(phase);
        P.mantleMid.position.y = BASE.mantleMid.y + lerp(0, -0.35, p);
        P.head.rotation.x = lerp(0, 0.6, p);
        setAll(arm => ({ yaw: lerp(0, arm.sideVal * -0.3, p), pitch: lerp(0, 0.9, p), roll: 0, curl: lerp(0.15, 0.8, p) }));
      } else if (action === 'wake') {
        const p = clamp01(phase);
        P.mantleMid.position.y = BASE.mantleMid.y + lerp(-0.35, 0, p);
        P.head.rotation.x = lerp(0.6, 0, p);
        setAll(arm => ({ yaw: lerp(arm.sideVal * -0.3, 0, p), pitch: lerp(0.9, 0, p), roll: 0, curl: lerp(0.8, 0.15, p) }));
      } else if (action === 'die') {
        const p = clamp01(phase);
        P.mantleMid.position.y = BASE.mantleMid.y + lerp(0, -0.5, p);
        P.mantleMid.rotation.z = lerp(0, 0.6, p);
        P.head.rotation.x = lerp(0, 0.8, p);
        setAll(arm => ({ yaw: lerp(0, arm.sideVal * 0.6, p), pitch: lerp(0, 1.1, p), roll: 0, curl: lerp(0.15, 0.05, p) }));
      } else if (action === 'evolve') {
        let curlAdj, yawAdj, seamUp, seamDown, mScale, pitch;
        if (phase < 0.25) {
          const tt = phase / 0.25;
          curlAdj = lerp(0.15, 0.6, tt); yawAdj = lerp(0, -0.2, tt); mScale = lerp(1, 0.92, tt);
          seamUp = 0; seamDown = 0; pitch = 0;
        } else if (phase < 0.6) {
          const tt = (phase - 0.25) / 0.35;
          curlAdj = lerp(0.6, 0.05, tt); yawAdj = lerp(-0.2, 0.5, tt); mScale = lerp(0.92, 1.08, tt);
          seamUp = lerp(0, 0.12, tt); seamDown = lerp(0, -0.08, tt); pitch = lerp(0, -0.4, tt);
        } else if (phase < 0.8) {
          curlAdj = 0.05; yawAdj = 0.5; mScale = 1.08 + Math.sin(phase * 30) * 0.01;
          seamUp = 0.12; seamDown = -0.08; pitch = -0.4;
        } else {
          const tt = (phase - 0.8) / 0.2;
          curlAdj = lerp(0.05, 0.15, tt); yawAdj = lerp(0.5, 0, tt); mScale = lerp(1.08, 1, tt);
          seamUp = lerp(0.12, 0, tt); seamDown = lerp(-0.08, 0, tt); pitch = lerp(-0.4, 0, tt);
        }
        P.mantleMid.scale.set(mScale, mScale, mScale);
        P.mantleUpper.position.y = BASE.mantleUpper.y + seamUp;
        P.mantleLower.position.y = BASE.mantleLower.y + seamDown;
        setAll(arm => ({ yaw: arm.sideVal * yawAdj, pitch, roll: 0, curl: curlAdj }));
      } else {
        restIdle();
      }
    }
  };

  return object;
}