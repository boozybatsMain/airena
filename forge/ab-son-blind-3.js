function build(THREE, TSL) {
  const {
    vec3, mix, pow, max, dot, normalize, sub, add, mul,
    time, sin, uniform, positionWorld, normalWorld, cameraPosition, clamp, float
  } = TSL;

  // ---------- shader helpers ----------
  const viewDir = normalize(sub(cameraPosition, positionWorld));
  const fresnel = pow(clamp(sub(float(1.0), max(dot(normalWorld, viewDir), float(0.0))), 0.0, 1.0), 3.0);
  const glowUniform = uniform(0.0);

  const skinMat = new THREE.MeshStandardNodeMaterial();
  skinMat.colorNode = add(
    mix(vec3(0.07, 0.17, 0.19), vec3(0.28, 0.72, 0.52), fresnel),
    mul(sin(add(mul(time, 0.6), mul(positionWorld.y, 4.0))), 0.04)
  );
  skinMat.roughnessNode = float(0.55);
  skinMat.metalnessNode = float(0.05);
  skinMat.emissiveNode = vec3(0.01, 0.03, 0.03);

  const armorMat = new THREE.MeshStandardNodeMaterial();
  armorMat.colorNode = mix(vec3(0.045, 0.05, 0.065), vec3(0.5, 0.42, 0.28), mul(fresnel, 0.8));
  armorMat.roughnessNode = float(0.32);
  armorMat.metalnessNode = float(0.88);
  armorMat.emissiveNode = mul(vec3(1.0, 0.45, 0.12), glowUniform);

  const eyeMat = new THREE.MeshStandardNodeMaterial();
  eyeMat.colorNode = vec3(0.9, 0.75, 0.15);
  eyeMat.roughnessNode = float(0.25);
  eyeMat.metalnessNode = float(0.1);
  eyeMat.emissiveNode = mul(vec3(1.0, 0.78, 0.15), add(0.5, mul(glowUniform, 1.6)));

  const beakMat = new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.5, metalness: 0.4 });

  // ---------- geometry helpers ----------
  function segMesh(rTop, rBot, len, mat, radial) {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, radial || 8, 1, false);
    g.translate(0, -len / 2, 0);
    return new THREE.Mesh(g, mat);
  }
  function orientToDir(obj, dir) {
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  }

  // ---------- root hierarchy ----------
  const root = new THREE.Group();
  root.name = "ArmouredOctopus";

  const core = new THREE.Group();
  core.name = "Core";
  root.add(core);

  const mantle = new THREE.Group();
  mantle.name = "Mantle";
  mantle.position.set(0, 1.05, -0.05);
  core.add(mantle);

  const mantleHull = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), skinMat);
  mantleHull.name = "MantleHull";
  mantleHull.scale.set(1.0, 0.92, 1.18);
  mantle.add(mantleHull);

  // armor plates on mantle
  const plateDefs = [
    { name: "ArmorCrown", dir: new THREE.Vector3(0, 1, 0.15), size: [0.5, 0.1, 0.42] },
    { name: "ArmorFront", dir: new THREE.Vector3(0, 0.35, 1), size: [0.4, 0.09, 0.3] },
    { name: "ArmorBack", dir: new THREE.Vector3(0, 0.35, -1), size: [0.4, 0.09, 0.3] },
    { name: "ArmorLeft", dir: new THREE.Vector3(-1, 0.3, 0), size: [0.3, 0.09, 0.4] },
    { name: "ArmorRight", dir: new THREE.Vector3(1, 0.3, 0), size: [0.3, 0.09, 0.4] }
  ];
  const armorPlates = [];
  for (const pd of plateDefs) {
    const dir = pd.dir.clone().normalize();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(pd.size[0], pd.size[1], pd.size[2]), armorMat);
    mesh.name = pd.name;
    orientToDir(mesh, dir);
    mesh.position.copy(dir.clone().multiplyScalar(0.5));
    mantle.add(mesh);
    armorPlates.push({ mesh: mesh, dir: dir, basePos: mesh.position.clone() });
  }

  const head = new THREE.Group();
  head.name = "Head";
  head.position.set(0, 0.22, 0.38);
  mantle.add(head);

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), eyeMat);
  eyeL.name = "EyeLeft";
  eyeL.position.set(0.15, 0, 0.1);
  head.add(eyeL);

  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), eyeMat);
  eyeR.name = "EyeRight";
  eyeR.position.set(-0.15, 0, 0.1);
  head.add(eyeR);

  const siphon = new THREE.Group();
  siphon.name = "Siphon";
  siphon.position.set(0, -0.12, -0.42);
  siphon.rotation.x = -0.7;
  mantle.add(siphon);
  const siphonMesh = segMesh(0.09, 0.05, 0.22, skinMat, 8);
  siphonMesh.rotation.x = Math.PI;
  siphon.add(siphonMesh);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 6), beakMat);
  beak.name = "Beak";
  beak.position.set(0, 0.5, 0.18);
  beak.rotation.x = Math.PI;
  core.add(beak);

  // ---------- arms ----------
  const ARM_COUNT = 8;
  const HIP_R = 0.32;
  const HIP_Y = 0.55;
  const SEG_LEN = [0.34, 0.28, 0.22, 0.16];
  const SEG_RAD = [
    [0.095, 0.078],
    [0.078, 0.06],
    [0.06, 0.044],
    [0.044, 0.018]
  ];
  const PITCH_REST = 1.0;
  const CURLS_REST = [0.32, 0.5, 0.68, 0.5];
  const PITCH_SLEEP = 1.95;
  const CURLS_SLEEP = [1.05, 1.3, 1.4, 1.15];

  const arms = [];
  for (let i = 0; i < ARM_COUNT; i++) {
    const angle = i * (Math.PI / 4);
    const base = new THREE.Group();
    base.name = "Arm" + i + "Base";
    base.rotation.order = "YXZ";
    base.position.set(HIP_R * Math.sin(angle), HIP_Y, HIP_R * Math.cos(angle));
    base.rotation.y = angle;
    core.add(base);

    const s1 = new THREE.Group();
    s1.name = "Arm" + i + "Seg1";
    base.add(s1);
    const m1 = segMesh(SEG_RAD[0][0], SEG_RAD[0][1], SEG_LEN[0], skinMat, 8);
    s1.add(m1);
    if (i % 2 === 0) {
      const plate1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.06), armorMat);
      plate1.name = "Arm" + i + "Armor1";
      plate1.position.set(0, -SEG_LEN[0] * 0.5, -0.08);
      s1.add(plate1);
    }

    const s2 = new THREE.Group();
    s2.name = "Arm" + i + "Seg2";
    s2.position.set(0, -SEG_LEN[0], 0);
    s1.add(s2);
    const m2 = segMesh(SEG_RAD[1][0], SEG_RAD[1][1], SEG_LEN[1], skinMat, 8);
    s2.add(m2);
    if (i % 2 === 0) {
      const plate2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.05), armorMat);
      plate2.name = "Arm" + i + "Armor2";
      plate2.position.set(0, -SEG_LEN[1] * 0.5, -0.065);
      s2.add(plate2);
    }

    const s3 = new THREE.Group();
    s3.name = "Arm" + i + "Seg3";
    s3.position.set(0, -SEG_LEN[1], 0);
    s2.add(s3);
    const m3 = segMesh(SEG_RAD[2][0], SEG_RAD[2][1], SEG_LEN[2], skinMat, 7);
    s3.add(m3);

    const s4 = new THREE.Group();
    s4.name = "Arm" + i + "Seg4";
    s4.position.set(0, -SEG_LEN[2], 0);
    s3.add(s4);
    const m4 = segMesh(SEG_RAD[3][0], SEG_RAD[3][1], SEG_LEN[3], skinMat, 6);
    s4.add(m4);

    // small suckers (decorative, non-animated)
    [s1, s2, s3].forEach((seg, si) => {
      const len = SEG_LEN[si];
      [0.35, 0.75].forEach((f) => {
        const suck = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), skinMat);
        suck.position.set(0, -len * f, SEG_RAD[si][0] * 0.9);
        suck.scale.set(1, 0.6, 0.6);
        seg.add(suck);
      });
    });

    arms.push({
      base: base, s1: s1, s2: s2, s3: s3, s4: s4,
      angle: angle, side: Math.sin(angle) > 0.05 ? 1 : (Math.sin(angle) < -0.05 ? -1 : 0)
    });
  }

  // ---------- helpers for pose() ----------
  function frac(x) { return x - Math.floor(x); }
  function smooth01(a, b, x) {
    let t = (x - a) / (b - a);
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function applyArmRest(arm, pitch, curls, sway) {
    arm.base.rotation.x = pitch;
    arm.base.rotation.z = sway || 0;
    arm.s1.rotation.x = curls[0];
    arm.s2.rotation.x = curls[1];
    arm.s3.rotation.x = curls[2];
    arm.s4.rotation.x = curls[3];
  }

  root.userData.pose = (s) => {
    const speed = Math.max(0, s.speed || 0);
    const turn = Math.max(-1, Math.min(1, s.turn || 0));
    const health = s.health === undefined ? 1 : s.health;
    const hurtFactor = Math.max(0, 1 - health);
    const t = s.t || 0;

    // ---- default / idle shape parameters ----
    let coreY = 0;
    let coreRotX = 0;
    let coreRotZ = 0;
    let mantleScaleY = 1.0 + Math.sin(t * 0.9) * 0.015;
    let mantleScaleXZ = 1.0 - Math.sin(t * 0.9) * 0.01;
    let headYawExtra = Math.sin(t * 0.35) * 0.12 * (1 - Math.min(speed, 1));
    let eyeScaleY = 1.0;
    let glow = 0.15 + 0.05 * Math.sin(t * 1.5);

    const armPitch = new Array(ARM_COUNT).fill(PITCH_REST);
    const armCurls = [];
    for (let i = 0; i < ARM_COUNT; i++) armCurls.push(CURLS_REST.slice());
    const armSway = new Array(ARM_COUNT).fill(0);

    if (s.action) {
      const p = Math.max(0, Math.min(1, s.phase || 0));
      const ease = smooth01(0, 1, p);

      switch (s.action) {
        case "attack": {
          const wind = smooth01(0, 0.3, p) - smooth01(0.55, 1.0, p);
          const commit = smooth01(0.3, 0.55, p) * (1 - smooth01(0.6, 1, p));
          coreY = -0.05 * wind;
          coreRotX = -0.15 * wind + 0.25 * commit;
          for (let i = 0; i < ARM_COUNT; i++) {
            let pitch = PITCH_REST + wind * 0.5 - commit * 0.85;
            let curls = [
              CURLS_REST[0] + wind * 0.4 - commit * 0.5,
              CURLS_REST[1] + wind * 0.3 - commit * 0.6,
              CURLS_REST[2] - commit * 0.4,
              CURLS_REST[3] - commit * 0.3
            ];
            if (i !== 0) { pitch = PITCH_REST; curls = CURLS_REST.slice(); }
            armPitch[i] = pitch;
            armCurls[i] = curls;
          }
          glow = commit * 1.1;
          break;
        }
        case "fire": {
          const aim = smooth01(0, 0.4, p) * (1 - smooth01(0.55, 1, p));
          const release = smooth01(0.4, 0.55, p) * (1 - smooth01(0.6, 1, p));
          const recoil = smooth01(0.55, 1, p);
          mantleScaleXZ = 1.0 + aim * 0.08 - release * 0.15 + recoil * 0.03;
          mantleScaleY = 1.0 + aim * 0.05 - release * 0.12 + recoil * 0.03;
          siphon.rotation.x = -0.7 - aim * 0.5 + release * 0.3;
          coreRotX = -aim * 0.1 + recoil * 0.08;
          coreY = -recoil * 0.05;
          for (let i = 0; i < ARM_COUNT; i++) {
            armPitch[i] = PITCH_REST - aim * 0.15 + recoil * 0.1;
            armCurls[i] = CURLS_REST.map((c) => c + aim * 0.15);
          }
          glow = release > 0.01 ? 1.4 : aim * 0.6;
          break;
        }
        case "hit": {
          const snap = smooth01(0, 0.25, p) * (1 - smooth01(0.25, 1, p));
          const settle = ease;
          coreRotZ = snap * 0.35 * (1 - settle);
          coreRotX = -snap * 0.2;
          coreY = -snap * 0.08;
          for (let i = 0; i < ARM_COUNT; i++) {
            armPitch[i] = PITCH_REST + snap * 0.3;
            armCurls[i] = CURLS_REST.map((c) => c + snap * 0.25);
          }
          glow = 0.4 * snap;
          break;
        }
        case "block": {
          coreY = -0.15 * ease;
          coreRotX = 0.2 * ease;
          mantleScaleXZ = 1.0 + 0.06 * ease;
          for (let i = 0; i < ARM_COUNT; i++) {
            const isFront = Math.cos(arms[i].angle) > 0.3;
            if (isFront) {
              armPitch[i] = PITCH_REST - 0.5 * ease;
              armCurls[i] = [0.9 * ease, 1.0 * ease, 0.6 * ease, 0.3 * ease];
              armSway[i] = (arms[i].side || 0) * -0.25 * ease;
            } else {
              armPitch[i] = PITCH_REST + 0.15 * ease;
              armCurls[i] = CURLS_REST.map((c) => c + 0.2 * ease);
            }
          }
          headYawExtra = 0;
          break;
        }
        case "gather": {
          const down = smooth01(0, 0.5, p) * (1 - smooth01(0.7, 1, p) * 0.4);
          const grasp = smooth01(0.5, 0.75, p);
          const rise = smooth01(0.75, 1, p);
          coreY = -0.2 * down + 0.08 * rise;
          coreRotX = 0.3 * down - 0.1 * rise;
          for (let i = 0; i < ARM_COUNT; i++) {
            if (i === 0) {
              armPitch[i] = PITCH_REST + 0.6 * down - 0.2 * rise;
              armCurls[i] = [
                0.3 + 0.5 * down,
                0.5 + 0.6 * down + 0.3 * grasp,
                0.68 + 0.4 * down + 0.4 * grasp,
                0.5 + 0.6 * grasp
              ];
            } else {
              armPitch[i] = PITCH_REST + 0.1 * down;
              armCurls[i] = CURLS_REST.map((c) => c + 0.15 * down);
            }
          }
          break;
        }
        case "deposit": {
          const down = smooth01(0, 0.55, p);
          const release = smooth01(0.55, 0.8, p);
          const rise = smooth01(0.8, 1, p);
          coreY = -0.18 * down + 0.06 * rise;
          coreRotX = 0.25 * down - 0.08 * rise;
          for (let i = 0; i < ARM_COUNT; i++) {
            if (i === 0) {
              armPitch[i] = PITCH_REST + 0.55 * down - 0.15 * rise;
              armCurls[i] = [
                0.3 + 0.4 * down,
                0.5 + 0.5 * down - 0.3 * release,
                0.68 + 0.3 * down - 0.35 * release,
                0.5 + 0.5 * down - 0.45 * release
              ];
            } else {
              armPitch[i] = PITCH_REST + 0.08 * down;
              armCurls[i] = CURLS_REST.map((c) => c + 0.1 * down);
            }
          }
          break;
        }
        case "eat": {
          const cyc = Math.sin(p * Math.PI * 2.5) * 0.5 + 0.5;
          const down = smooth01(0, 0.2, p) * (1 - smooth01(0.85, 1, p));
          coreY = -0.12 * down;
          coreRotX = 0.28 * down;
          beak.scale.y = 1.0 + cyc * 0.5 * down;
          for (let i = 0; i < ARM_COUNT; i++) {
            const front = Math.cos(arms[i].angle) > 0.3;
            if (front) {
              armPitch[i] = PITCH_REST + 0.35 * down;
              armCurls[i] = CURLS_REST.map((c) => c + 0.3 * down + cyc * 0.1 * down);
            }
          }
          break;
        }
        case "drink": {
          const down = smooth01(0, 0.35, p) * (1 - smooth01(0.75, 1, p));
          coreY = -0.14 * down;
          coreRotX = 0.32 * down;
          for (let i = 0; i < ARM_COUNT; i++) {
            const front = Math.cos(arms[i].angle) > 0.3;
            if (front) {
              armPitch[i] = PITCH_REST + 0.3 * down;
              armCurls[i] = CURLS_REST.map((c) => c + 0.25 * down);
            }
          }
          break;
        }
        case "jump": {
          const load = smooth01(0, 0.33, p) * (1 - smooth01(0.33, 0.4, p));
          const ext = smooth01(0.33, 1, p);
          coreY = -0.22 * load + 0.35 * ext;
          coreRotX = 0.15 * load - 0.25 * ext;
          for (let i = 0; i < ARM_COUNT; i++) {
            armPitch[i] = PITCH_REST + 0.5 * load - 0.9 * ext;
            armCurls[i] = CURLS_REST.map((c, k) => c + 0.4 * load * (1 - k * 0.2) - 0.3 * ext);
          }
          mantleScaleY = 1.0 - 0.1 * load + 0.15 * ext;
          break;
        }
        case "land": {
          const reach = smooth01(0, 0.35, p);
          const shock = smooth01(0.35, 0.55, p) * (1 - smooth01(0.7, 1, p));
          const up = smooth01(0.55, 1, p);
          coreY = 0.2 * reach - 0.3 * shock + 0.0 * up;
          coreRotX = -0.2 * reach + 0.3 * shock;
          for (let i = 0; i < ARM_COUNT; i++) {
            armPitch[i] = PITCH_REST - 0.6 * reach + 0.5 * shock - 0.1 * up;
            armCurls[i] = CURLS_REST.map((c) => c + 0.5 * shock * (1 - up));
          }
          mantleScaleY = 1.0 - 0.25 * shock;
          break;
        }
        case "signal": {
          const rise = Math.sin(p * Math.PI);
          coreY = 0.22 * rise;
          coreRotX = -0.1 * rise;
          mantleScaleXZ = 1.0 + 0.15 * rise;
          mantleScaleY = 1.0 + 0.1 * rise;
          for (let i = 0; i < ARM_COUNT; i++) {
            armPitch[i] = PITCH_REST - 0.7 * rise;
            armCurls[i] = CURLS_REST.map((c) => Math.max(0.05, c - 0.35 * rise));
          }
          eyeScaleY = 1.0 + 0.2 * rise;
          glow = rise * 1.4;
          break;
        }
        case "sleep": {
          const tt = ease;
          coreY = lerp(0, -0.35, tt);
          coreRotX = lerp(0, 0.55, tt);
          mantleScaleXZ = lerp(1.0, 0.94, tt);
          mantleScaleY = lerp(1.0, 0.88, tt);
          eyeScaleY = lerp(1.0, 0.06, tt);
          for (let i = 0; i < ARM_COUNT; i++) {
            armPitch[i] = lerp(PITCH_REST, PITCH_SLEEP, tt);
            armCurls[i] = CURLS_REST.map((c, k) => lerp(c, CURLS_SLEEP[k], tt));
          }
          break;
        }
        case "wake": {
          const tt = ease;
          coreY = lerp(-0.35, 0, tt);
          coreRotX = lerp(0.55, 0, tt);
          mantleScaleXZ = lerp(0.94, 1.0, tt);
          mantleScaleY = lerp(0.88, 1.0, tt);
          eyeScaleY = lerp(0.06, 1.0, tt);
          for (let i = 0; i < ARM_COUNT; i++) {
            armPitch[i] = lerp(PITCH_SLEEP, PITCH_REST, tt);
            armCurls[i] = CURLS_REST.map((c, k) => lerp(CURLS_SLEEP[k], c, tt));
          }
          break;
        }
        case "die": {
          const collapse = 1 - Math.max(0, Math.min(1, health));
          const cc = Math.max(collapse, ease);
          coreY = lerp(0, -0.45, cc);
          coreRotX = lerp(0, 0.6, cc);
          coreRotZ = lerp(0, 0.75, cc);
          mantleScaleXZ = lerp(1.0, 0.8, cc);
          mantleScaleY = lerp(1.0, 0.6, cc);
          eyeScaleY = lerp(1.0, 0.05, cc);
          for (let i = 0; i < ARM_COUNT; i++) {
            armPitch[i] = lerp(PITCH_REST, PITCH_REST + 1.3, cc);
            armCurls[i] = CURLS_REST.map((c) => lerp(c, 0.1, cc));
            armSway[i] = (arms[i].side || 0) * 0.4 * cc;
          }
          glow = 0;
          break;
        }
        case "evolve": {
          const env = Math.sin(p * Math.PI);
          coreY = -0.1 * smooth01(0, 0.15, p) + 0.05 * env;
          coreRotX = 0.1 * smooth01(0, 0.15, p);
          for (const ap of armorPlates) {
            ap.mesh.position.copy(ap.basePos.clone().add(ap.dir.clone().multiplyScalar(0.22 * env)));
          }
          mantleScaleXZ = 1.0 + 0.08 * env;
          mantleScaleY = 1.0 + 0.05 * env;
          for (let i = 0; i < ARM_COUNT; i++) {
            armPitch[i] = PITCH_REST - 0.15 * env;
            armCurls[i] = CURLS_REST.map((c) => c + 0.1 * env);
          }
          glow = env * 1.5;
          break;
        }
        default:
          break;
      }

      if (s.action !== "evolve") {
        for (const ap of armorPlates) ap.mesh.position.copy(ap.basePos);
      }

    } else {
      // ---- locomotion / idle from speed, turn, grounded, health ----
      const creepBump = Math.exp(-Math.pow(speed - 0.5, 2) / (2 * 0.25)) * 0.16;
      const sprintBlend = smooth01(3, 6, speed);
      const ampScale = 0.45 + Math.min(speed, 4) * 0.16;
      const liftScale = 0.12 + Math.min(speed, 4) * 0.07;
      const duty = 0.55;

      coreY = -creepBump * 0.4 - sprintBlend * 0.22;
      coreRotX = Math.min(speed, 3) * 0.02 + sprintBlend * 0.16;
      coreRotZ = -turn * 0.25;
      headYawExtra = turn * 0.4 + headYawExtra;
      mantleScaleXZ *= 1.0 + sprintBlend * 0.02;
      mantleScaleY *= 1.0 - sprintBlend * 0.1;
      mantle.scale.z = 1.0 + sprintBlend * 0.3;

      if (!s.grounded) {
        // airborne: legs trail loosely, no ground contact cycle
        coreRotX += 0.15;
        for (let i = 0; i < ARM_COUNT; i++) {
          armPitch[i] = PITCH_REST + 0.55 + Math.sin(t * 3 + i) * 0.05;
          armCurls[i] = CURLS_REST.map((c) => c + 0.25 + Math.sin(t * 4 + i * 0.7) * 0.05);
        }
      } else if (speed < 0.02) {
        for (let i = 0; i < ARM_COUNT; i++) {
          const wag = Math.sin(t * 0.8 + i * 0.9) * 0.05;
          armPitch[i] = PITCH_REST;
          armCurls[i] = CURLS_REST.map((c, k) => c + Math.sin(t * 0.6 + i + k) * 0.03);
          armSway[i] = wag;
        }
      } else {
        const bob = Math.abs(Math.sin(s.stride * Math.PI * 2)) * (0.025 + ampScale * 0.015);
        coreY += bob;
        for (let i = 0; i < ARM_COUNT; i++) {
          const side = arms[i].side;
          const ampMul = 1 - turn * side * 0.3;
          const phaseOffset = (i / ARM_COUNT) * (1 - sprintBlend * 0.7);
          const p = frac(s.stride + phaseOffset);
          let sweep, liftT;
          if (p < duty) {
            const tt = p / duty;
            sweep = ampScale * (1 - 2 * tt) * ampMul;
            liftT = 0;
          } else {
            const tt = (p - duty) / (1 - duty);
            sweep = ampScale * (-1 + 2 * tt) * ampMul;
            liftT = Math.sin(Math.PI * tt);
          }
          const pitch = PITCH_REST
            - liftT * liftScale * 1.8
            + sprintBlend * 0.45
            + creepBump * 0.9;
          const curlLift = liftT * (0.5 + sprintBlend * 0.2);
          armPitch[i] = pitch;
          armCurls[i] = CURLS_REST.map((c) =>
            (c + creepBump * 1.1 + curlLift) * (1 - sprintBlend * 0.5)
          );
          armSway[i] = sweep * 0.9;
        }
      }
    }

    // hurt overlay (applies whenever no die/hit action already handling it)
    if (s.action !== "die" && s.action !== "hit" && hurtFactor > 0.01) {
      coreY -= hurtFactor * 0.08;
      coreRotZ += hurtFactor * 0.18;
      coreRotX += hurtFactor * 0.08;
      armPitch[4] += hurtFactor * 0.35;
      armCurls[4] = armCurls[4].map((c) => c + hurtFactor * 0.3);
      glow = Math.max(glow, hurtFactor * 0.35 * Math.max(0, Math.sin(t * 6)));
    }

    // ---- apply to scene graph ----
    core.position.y = coreY;
    core.rotation.x = coreRotX;
    core.rotation.z = coreRotZ;
    mantleHull.scale.set(mantleScaleXZ, mantleScaleY, mantleScaleXZ * (mantle.scale.z || 1));
    head.rotation.y = headYawExtra;
    eyeL.scale.y = eyeScaleY;
    eyeR.scale.y = eyeScaleY;

    for (let i = 0; i < ARM_COUNT; i++) {
      applyArmRest(arms[i], armPitch[i], armCurls[i], armSway[i]);
    }

    glowUniform.value = glow;
  };

  return root;
}