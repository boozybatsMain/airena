```javascript
function build(THREE, TSL) {
  const {
    Fn, vec3, mix, smoothstep, positionLocal, normalWorld, cameraPosition,
    dot, normalize, sub, mul, pow, oneMinus, clamp, add, sin
  } = TSL;

  // ---------- helpers ----------
  function taperedSeg(rTop, rBottom, len, rad) {
    const g = new THREE.CylinderGeometry(rTop, rBottom, len, rad || 14, 1, false);
    g.rotateX(Math.PI / 2);
    return g;
  }
  function finGeo(points, thickness) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 8 });
    g.translate(0, 0, -thickness / 2);
    return g;
  }
  function curve(x, pts) {
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) {
        const a = pts[i - 1], b = pts[i];
        const k = (x - a[0]) / ((b[0] - a[0]) || 1);
        return a[1] + (b[1] - a[1]) * k;
      }
    }
    return pts[pts.length - 1][1];
  }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const seg = (p, a, b) => smooth(a, b, p);

  // ---------- materials ----------
  const skinMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.04, side: THREE.FrontSide });
  const finMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.04, side: THREE.DoubleSide });
  function riggedSkin(mat) {
    mat.colorNode = Fn(() => {
      const topColor = vec3(0.13, 0.17, 0.20);
      const bellyColor = vec3(0.80, 0.78, 0.72);
      const h = smoothstep(-0.06, 0.32, positionLocal.y);
      return mix(bellyColor, topColor, h);
    })();
    mat.emissiveNode = Fn(() => {
      const viewDir = normalize(sub(cameraPosition, positionLocal));
      const ndv = clamp(dot(normalWorld, viewDir), 0.0, 1.0);
      const fres = pow(oneMinus(ndv), 3.0);
      return mul(vec3(0.03, 0.05, 0.07), fres);
    })();
    mat.roughnessNode = Fn(() => add(0.45, mul(0.06, sin(mul(positionLocal.z, 18.0)))))();
  }
  riggedSkin(skinMat);
  riggedSkin(finMat);

  const teethMat = new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.35, metalness: 0.0 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x05050a, roughness: 0.2, metalness: 0.1 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x3a0d10, roughness: 0.7 });
  const gillMat = new THREE.MeshStandardMaterial({ color: 0x140507, roughness: 0.7 });

  // ---------- root ----------
  const root = new THREE.Group();
  root.name = 'Shark';

  // ---------- Torso (spine root) ----------
  const torso = new THREE.Group();
  torso.name = 'Torso';
  root.add(torso);
  const TORSO_LEN = 1.0, TORSO_R_FRONT = 0.46, TORSO_R_BACK = 0.40;
  const torsoMesh = new THREE.Mesh(taperedSeg(TORSO_R_FRONT, TORSO_R_BACK, TORSO_LEN), skinMat);
  torsoMesh.name = 'TorsoMesh';
  torsoMesh.position.z = 0.25;
  torso.add(torsoMesh);

  // ---------- Head ----------
  const HEAD_POS = { x: 0, y: 0, z: 0.75 };
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(HEAD_POS.x, HEAD_POS.y, HEAD_POS.z);
  torso.add(head);
  const HEAD_LEN = 1.1, HEAD_R_NECK = 0.46, HEAD_R_NOSE = 0.06;
  const headMesh = new THREE.Mesh(taperedSeg(HEAD_R_NOSE, HEAD_R_NECK, HEAD_LEN, 14), skinMat);
  headMesh.name = 'HeadMesh';
  headMesh.position.z = HEAD_LEN / 2;
  head.add(headMesh);

  // eyes
  const eyeGeo = new THREE.SphereGeometry(0.085, 12, 10);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.name = 'EyeLeft'; eyeL.position.set(-0.30, 0.10, 0.66); head.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.name = 'EyeRight'; eyeR.position.set(0.30, 0.10, 0.66); head.add(eyeR);

  // mouth interior
  const mouthInterior = new THREE.Mesh(new THREE.SphereGeometry(0.30, 10, 8), mouthMat);
  mouthInterior.name = 'MouthInterior';
  mouthInterior.position.set(0, -0.16, 0.32);
  mouthInterior.scale.set(1.0, 0.5, 1.3);
  head.add(mouthInterior);

  // upper teeth (fixed to head)
  const upperTeeth = new THREE.Group(); upperTeeth.name = 'UpperTeeth'; head.add(upperTeeth);
  {
    const N = 9, spread = 0.34;
    for (let i = 0; i < N; i++) {
      const tt = i / (N - 1);
      const x = lerp(-spread, spread, tt);
      const z = 0.28 + 0.50 * (1 - Math.min(1, Math.abs(x) / spread));
      const size = 0.11 * (i % 2 === 0 ? 1.0 : 0.78);
      const g = new THREE.ConeGeometry(0.032, size, 4);
      const m = new THREE.Mesh(g, teethMat);
      m.name = 'ToothUpper' + i;
      m.position.set(x, -0.235, z);
      m.rotation.x = Math.PI + 0.35;
      upperTeeth.add(m);
    }
  }

  // lower jaw
  const LOWERJAW_POS = { x: 0, y: -0.20, z: 0.28 };
  const lowerJaw = new THREE.Group();
  lowerJaw.name = 'LowerJaw';
  lowerJaw.position.set(LOWERJAW_POS.x, LOWERJAW_POS.y, LOWERJAW_POS.z);
  head.add(lowerJaw);
  const JAW_LEN = 0.85;
  const lowerJawMesh = new THREE.Mesh(taperedSeg(0.045, 0.22, JAW_LEN, 12), skinMat);
  lowerJawMesh.name = 'LowerJawMesh';
  lowerJawMesh.position.z = JAW_LEN / 2;
  lowerJawMesh.rotation.x = -0.04;
  lowerJaw.add(lowerJawMesh);

  const lowerTeeth = new THREE.Group(); lowerTeeth.name = 'LowerTeeth'; lowerJaw.add(lowerTeeth);
  {
    const N = 8, spread = 0.24;
    for (let i = 0; i < N; i++) {
      const tt = i / (N - 1);
      const x = lerp(-spread, spread, tt);
      const z = 0.18 + 0.42 * (1 - Math.min(1, Math.abs(x) / spread));
      const size = 0.095 * (i % 2 === 0 ? 1.0 : 0.8);
      const g = new THREE.ConeGeometry(0.028, size, 4);
      const m = new THREE.Mesh(g, teethMat);
      m.name = 'ToothLower' + i;
      m.position.set(x, 0.04, z);
      m.rotation.x = -0.3;
      lowerTeeth.add(m);
    }
  }

  // gill slits (static decoration on torso, near head joint)
  const gills = new THREE.Group(); gills.name = 'GillSlits'; torso.add(gills);
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 5; i++) {
      const g = new THREE.BoxGeometry(0.02, 0.30 - i * 0.03, 0.045);
      const m = new THREE.Mesh(g, gillMat);
      m.name = 'GillSlit' + (side < 0 ? 'L' : 'R') + i;
      m.position.set(side * 0.455, 0.02 - i * 0.01, 0.62 - i * 0.10);
      m.rotation.y = side * 0.4;
      gills.add(m);
    }
  });

  // ---------- Pectoral fins ----------
  const PECTORAL_PTS = [[0.0, -0.05], [0.15, -0.32], [0.55, -0.30], [0.88, -0.04], [0.58, 0.28], [0.18, 0.20]];
  const pecGeo = finGeo(PECTORAL_PTS, 0.045);
  const PEC_L_POS = { x: -0.42, y: -0.20, z: 0.25 };
  const PEC_R_POS = { x: 0.42, y: -0.20, z: 0.25 };
  const pecL = new THREE.Group(); pecL.name = 'PectoralFinLeft'; pecL.position.set(PEC_L_POS.x, PEC_L_POS.y, PEC_L_POS.z); torso.add(pecL);
  const pecLMesh = new THREE.Mesh(pecGeo, finMat); pecLMesh.name = 'PectoralFinLeftMesh'; pecL.add(pecLMesh);
  const pecR = new THREE.Group(); pecR.name = 'PectoralFinRight'; pecR.position.set(PEC_R_POS.x, PEC_R_POS.y, PEC_R_POS.z); torso.add(pecR);
  const pecRMesh = new THREE.Mesh(pecGeo, finMat); pecRMesh.name = 'PectoralFinRightMesh'; pecR.add(pecRMesh);

  // ---------- TorsoRear ----------
  const TORSOREAR_POS = { x: 0, y: 0, z: -0.25 };
  const torsoRear = new THREE.Group(); torsoRear.name = 'TorsoRear';
  torsoRear.position.set(TORSOREAR_POS.x, TORSOREAR_POS.y, TORSOREAR_POS.z);
  torso.add(torsoRear);
  const TORSOREAR_LEN = 0.85;
  const torsoRearMesh = new THREE.Mesh(taperedSeg(0.40, 0.20, TORSOREAR_LEN, 12), skinMat);
  torsoRearMesh.name = 'TorsoRearMesh';
  torsoRearMesh.position.z = -TORSOREAR_LEN / 2;
  torsoRear.add(torsoRearMesh);

  // dorsal fin
  const DORSAL_PTS = [[0, 0], [0.08, 0.6], [0.4, 0.28], [0.58, 0.02], [0.15, -0.03]];
  const DORSAL_POS = { x: 0, y: 0.38, z: -0.10 };
  const dorsal = new THREE.Group(); dorsal.name = 'DorsalFin';
  dorsal.position.set(DORSAL_POS.x, DORSAL_POS.y, DORSAL_POS.z);
  dorsal.rotation.y = Math.PI / 2;
  torsoRear.add(dorsal);
  const dorsalMesh = new THREE.Mesh(finGeo(DORSAL_PTS, 0.05), finMat); dorsalMesh.name = 'DorsalFinMesh'; dorsal.add(dorsalMesh);

  // pelvic fins
  const PELVIC_PTS = [[0.0, -0.03], [0.08, -0.18], [0.30, -0.16], [0.44, -0.02], [0.28, 0.16], [0.10, 0.11]];
  const pelGeo = finGeo(PELVIC_PTS, 0.035);
  const PEL_L_POS = { x: -0.20, y: -0.16, z: -0.55 };
  const PEL_R_POS = { x: 0.20, y: -0.16, z: -0.55 };
  const pelL = new THREE.Group(); pelL.name = 'PelvicFinLeft'; pelL.position.set(PEL_L_POS.x, PEL_L_POS.y, PEL_L_POS.z); torsoRear.add(pelL);
  const pelLMesh = new THREE.Mesh(pelGeo, finMat); pelLMesh.name = 'PelvicFinLeftMesh'; pelL.add(pelLMesh);
  const pelR = new THREE.Group(); pelR.name = 'PelvicFinRight'; pelR.position.set(PEL_R_POS.x, PEL_R_POS.y, PEL_R_POS.z); torsoRear.add(pelR);
  const pelRMesh = new THREE.Mesh(pelGeo, finMat); pelRMesh.name = 'PelvicFinRightMesh'; pelR.add(pelRMesh);

  // ---------- TailBase ----------
  const TAILBASE_POS = { x: 0, y: 0, z: -0.85 };
  const tailBase = new THREE.Group(); tailBase.name = 'TailBase';
  tailBase.position.set(TAILBASE_POS.x, TAILBASE_POS.y, TAILBASE_POS.z);
  torsoRear.add(tailBase);
  const TAILBASE_LEN = 0.55;
  const tailBaseMesh = new THREE.Mesh(taperedSeg(0.20, 0.085, TAILBASE_LEN, 10), skinMat);
  tailBaseMesh.name = 'TailBaseMesh';
  tailBaseMesh.position.z = -TAILBASE_LEN / 2;
  tailBase.add(tailBaseMesh);

  // anal fin
  const ANAL_PTS = [[0, 0], [0.06, -0.24], [0.24, -0.28], [0.28, -0.04], [0.09, 0.02]];
  const ANAL_POS = { x: 0, y: -0.09, z: -0.15 };
  const analFin = new THREE.Group(); analFin.name = 'AnalFin';
  analFin.position.set(ANAL_POS.x, ANAL_POS.y, ANAL_POS.z);
  analFin.rotation.y = Math.PI / 2;
  tailBase.add(analFin);
  const analMesh = new THREE.Mesh(finGeo(ANAL_PTS, 0.035), finMat); analMesh.name = 'AnalFinMesh'; analFin.add(analMesh);

  // caudal fin (heterocercal: big upper lobe, small lower lobe)
  const CAUDAL_UPPER_PTS = [[0, 0], [0.15, 0.55], [0.55, 0.85], [0.95, 0.55], [0.85, 0.15], [0.35, 0.05]];
  const CAUDAL_LOWER_PTS = [[0, 0], [0.12, -0.28], [0.4, -0.4], [0.62, -0.18], [0.4, 0.02]];
  const CAUDAL_POS = { x: 0, y: 0, z: -0.55 };
  const caudal = new THREE.Group(); caudal.name = 'CaudalFin';
  caudal.position.set(CAUDAL_POS.x, CAUDAL_POS.y, CAUDAL_POS.z);
  caudal.rotation.y = Math.PI / 2;
  tailBase.add(caudal);
  const caudalUpper = new THREE.Mesh(finGeo(CAUDAL_UPPER_PTS, 0.05), finMat); caudalUpper.name = 'CaudalUpperLobe'; caudal.add(caudalUpper);
  const caudalLower = new THREE.Mesh(finGeo(CAUDAL_LOWER_PTS, 0.05), finMat); caudalLower.name = 'CaudalLowerLobe'; caudal.add(caudalLower);

  // ================= POSE =================
  const SP = [0, 0.5, 1, 2, 3, 6];
  const HEAD_AMP = [[0, 0.05], [0.5, 0.10], [1, 0.09], [2, 0.05], [3, 0.03], [6, 0.01]];
  const TORSO_AMP = [[0, 0.08], [0.5, 0.16], [1, 0.20], [2, 0.18], [3, 0.14], [6, 0.08]];
  const TAILB_AMP = [[0, 0.15], [0.5, 0.28], [1, 0.38], [2, 0.52], [3, 0.62], [6, 0.75]];
  const CAUD_AMP = [[0, 0.25], [0.5, 0.42], [1, 0.58], [2, 0.85], [3, 1.05], [6, 1.35]];
  const HEAD_PITCH_C = [[0, 0.04], [0.5, -0.12], [1, -0.04], [2, 0.0], [3, 0.0], [6, 0.0]];
  const TREAR_PITCH_C = [[0, 0.0], [0.5, 0.08], [1, 0.03], [2, 0.0], [3, -0.02], [6, -0.05]];
  const PEC_SWEEP_C = [[0, 0.05], [0.5, 0.0], [1, 0.1], [2, 0.35], [3, 0.55], [6, 0.85]];
  const PEC_DIHED_C = [[0, 0.15], [0.5, 0.35], [1, 0.15], [2, 0.05], [3, -0.05], [6, -0.15]];

  object3dSetup: {}
  const root_ = root;

  root_.userData.pose = (s) => {
    const t = s.t || 0;
    const speed = s.speed || 0;
    const stride = s.stride || 0;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = s.health === undefined ? 1 : s.health;
    const action = s.action || null;
    const phase = s.phase || 0;

    // accumulators (deltas from rest, on top of mounts)
    let headPitch = 0, headYawV = 0, headRoll = 0, headDZ = 0;
    let torsoPitch = 0, torsoRoll = 0, torsoDZ = 0, torsoDY = 0;
    let trPitch = 0, trYaw = 0, trRoll = 0;
    let tbPitch = 0, tbYaw = 0, tbRoll = 0;
    let caudYaw = 0, caudRoll = 0;
    let jawOpen = 0.03 + Math.sin(t * 1.1) * 0.015;
    let pecSweepL = 0, pecSweepR = 0, pecDihedL = 0, pecDihedR = 0, pecFlapL = 0, pecFlapR = 0;
    let pelSweepL = 0, pelSweepR = 0, pelDihedL = 0, pelDihedR = 0;
    let dorsalLean = 0, dorsalYawExtra = 0;
    let analYawExtra = 0, analLean = 0;
    let breatheScale = 1 + Math.sin(t * 1.2) * 0.008;

    if (action) {
      // ---------------- ACTIONS ----------------
      if (action === 'attack') {
        const wind = seg(phase, 0, 0.28), commit = seg(phase, 0.28, 0.5), rec = seg(phase, 0.5, 1.0);
        jawOpen = lerp(0.05, 0.82, wind) * (1 - commit) + lerp(0.82, 0.04, commit);
        headDZ = lerp(0, -0.10, wind) * (1 - commit) + lerp(-0.10, 0.20, commit) * (1 - rec) + lerp(0.20, 0, rec);
        torsoRoll = Math.sin(phase * Math.PI * 3) * 0.10 * (1 - rec) * 0.6;
        trYaw = lerp(0, 0.22, wind) - lerp(0, 0.35, commit) + lerp(0, 0, rec);
        tbYaw = -trYaw * 0.6;
        caudYaw = -trYaw * 1.3;
        jawOpen = Math.max(0.02, jawOpen);
      } else if (action === 'fire') {
        const aim = seg(phase, 0, 0.35), rel = seg(phase, 0.35, 0.55), rec = seg(phase, 0.55, 1.0);
        headYawV = Math.sin(t * 2) * 0.01 * (1 - aim);
        jawOpen = lerp(0.05, 0.45, aim) - lerp(0, 0.40, rel) * 1;
        jawOpen = aim < 1 ? lerp(0.05, 0.5, aim) : (rel < 1 ? lerp(0.5, 0.06, rel) : lerp(0.06, 0.03, rec));
        headDZ = -lerp(0, 0.12, rel) + lerp(0, 0.12, rec) * 0;
        headDZ = rel > 0 ? -0.12 * rel * (1 - rec) : 0;
        torsoDZ = -0.03 * rel * (1 - rec);
      } else if (action === 'hit') {
        const flinch = seg(phase, 0, 0.18), settle = seg(phase, 0.18, 1.0);
        const k = flinch * (1 - settle);
        headRoll = -0.35 * k; headYawV = 0.25 * k; trRoll = 0.20 * k; tbRoll = -0.15 * k;
        headDZ = -0.06 * k;
      } else if (action === 'block') {
        const rise = seg(phase, 0, 0.2), hold = seg(phase, 0.2, 0.75), rel = seg(phase, 0.75, 1.0);
        const k = rise * (1 - rel) + hold * (1 - rel);
        const kk = Math.min(1, rise + hold * 0.001) * (1 - rel);
        torsoDZ = -0.12 * kk; torsoPitch = 0.10 * kk;
        headPitch = -0.20 * kk; headDZ = -0.08 * kk;
        pecDihedL = 0.5 * kk; pecDihedR = 0.5 * kk; pecSweepL = -0.3 * kk; pecSweepR = -0.3 * kk;
      } else if (action === 'gather') {
        const down = seg(phase, 0, 0.4), grab = seg(phase, 0.4, 0.6), up = seg(phase, 0.6, 1.0);
        headPitch = lerp(0, -0.55, down) - lerp(0, 0, grab) - lerp(0, 0.55, up) * 0 + (down < 1 ? -0.55 * down : -0.55 * (1 - up));
        headDZ = -0.15 * (down < 1 ? down : (1 - up));
        jawOpen = down < 1 ? lerp(0.05, 0.5, down) : (grab < 1 ? lerp(0.5, 0.05, grab) : 0.05);
        trPitch = 0.15 * (down < 1 ? down : (1 - up));
      } else if (action === 'deposit') {
        const down = seg(phase, 0, 0.5), open = seg(phase, 0.5, 0.75), up = seg(phase, 0.75, 1.0);
        headPitch = -0.5 * (down < 1 ? down : (1 - up));
        headDZ = -0.14 * (down < 1 ? down : (1 - up));
        jawOpen = open < 1 && down >= 1 ? lerp(0.05, 0.4, open) : (down < 1 ? 0.05 : lerp(0.4, 0.03, up));
        trPitch = 0.12 * (down < 1 ? down : (1 - up));
      } else if (action === 'eat') {
        const down = seg(phase, 0, 0.15);
        const cyc = Math.sin(phase * Math.PI * 2 * 2.5);
        headPitch = -0.45 * down;
        headDZ = -0.12 * down;
        jawOpen = 0.06 + Math.max(0, cyc) * 0.32 * down;
        trPitch = 0.10 * down;
      } else if (action === 'drink') {
        const down = seg(phase, 0, 0.25), up = seg(phase, 0.8, 1.0);
        const holdK = down * (1 - up);
        headPitch = -0.4 * holdK;
        headDZ = -0.10 * holdK;
        jawOpen = 0.10 * holdK;
        trPitch = 0.08 * holdK;
      } else if (action === 'jump') {
        const load = seg(phase, 0, 0.33), ext = seg(phase, 0.33, 1.0);
        torsoDZ = -0.10 * load * (1 - ext);
        torsoPitch = 0.15 * load * (1 - ext) - 0.15 * ext;
        headPitch = 0.20 * ext;
        trPitch = -0.15 * ext;
        tbYaw = 0.15 * load - 0.1 * ext;
        caudYaw = -0.3 * load + 0.5 * ext;
        pecDihedL = -0.15 * ext; pecDihedR = -0.15 * ext;
        pecSweepL = 0.4 * ext; pecSweepR = 0.4 * ext;
      } else if (action === 'land') {
        const reach = seg(phase, 0, 0.35), shock = seg(phase, 0.35, 0.6), settle = seg(phase, 0.6, 1.0);
        headPitch = 0.18 * reach * (1 - shock);
        torsoDZ = -0.14 * shock * (1 - settle);
        torsoPitch = 0.20 * shock * (1 - settle);
        trPitch = 0.10 * shock * (1 - settle);
        pecDihedL = 0.35 * shock * (1 - settle); pecDihedR = 0.35 * shock * (1 - settle);
      } else if (action === 'signal') {
        const rise = seg(phase, 0, 0.3), hold = seg(phase, 0.3, 0.75), down = seg(phase, 0.75, 1.0);
        const k = rise * (1 - down) + hold * (1 - down) * 0.001;
        const kk = Math.min(1, rise + hold) * (1 - down);
        torsoPitch = -0.18 * kk;
        headPitch = 0.30 * kk;
        jawOpen = 0.6 * kk;
        pecDihedL = -0.3 * kk; pecDihedR = -0.3 * kk; pecSweepL = 0.5 * kk; pecSweepR = 0.5 * kk;
        dorsalLean = 0.08 * kk;
        caudYaw = Math.sin(t * 6) * 0.15 * kk;
      } else if (action === 'sleep') {
        const k = seg(phase, 0, 1.0);
        torsoDZ = -0.08 * k; torsoPitch = 0.10 * k;
        headPitch = -0.30 * k; headDZ = -0.06 * k;
        trPitch = 0.12 * k; tbPitch = 0.08 * k;
        pecDihedL = 0.45 * k; pecDihedR = 0.45 * k; pecSweepL = 0.2 * k; pecSweepR = 0.2 * k;
        jawOpen = 0.02;
        breatheScale = 1 + Math.sin(t * 0.5) * 0.006 * k;
      } else if (action === 'wake') {
        const stir = seg(phase, 0, 0.3), push = seg(phase, 0.3, 0.8), rest = seg(phase, 0.8, 1.0);
        const k = (1 - push) * (stir) * 0 + (1 - push);
        const kk = 1 - push;
        torsoDZ = -0.08 * kk; torsoPitch = 0.10 * kk;
        headPitch = -0.30 * kk + Math.sin(t * 8) * 0.02 * stir * (1 - push);
        trPitch = 0.12 * kk; tbPitch = 0.08 * kk;
        pecDihedL = 0.45 * kk; pecDihedR = 0.45 * kk; pecSweepL = 0.2 * kk; pecSweepR = 0.2 * kk;
        jawOpen = lerp(0.02, 0.03, rest);
      } else if (action === 'die') {
        const k = clamp01(phase);
        torsoDZ = -0.10 * k; torsoRoll = 1.1 * k; torsoPitch = 0.12 * k;
        headRoll = 1.2 * k; headPitch = -0.20 * k;
        trRoll = 1.0 * k; tbRoll = 0.9 * k; caudRoll = 0.6 * k;
        jawOpen = 0.5 * k;
        pecDihedL = 0.6 * k; pecDihedR = -0.5 * k;
        pecSweepL = 0.3 * k; pecSweepR = 0.3 * k;
        caudYaw = Math.sin(k * 8) * 0.3 * (1 - k) * 0.5;
        breatheScale = 1;
      } else if (action === 'evolve') {
        const brace = seg(phase, 0, 0.25), open = seg(phase, 0.25, 0.6), hold = seg(phase, 0.6, 0.8), close = seg(phase, 0.8, 1.0);
        const openK = Math.min(1, open + hold) * (1 - close);
        const braceK = brace * (1 - open);
        torsoDZ = -0.10 * braceK + 0.06 * openK;
        headDZ = 0.15 * openK;
        jawOpen = 0.7 * openK;
        pecDihedL = -0.35 * openK; pecDihedR = -0.35 * openK;
        pecSweepL = 0.5 * openK; pecSweepR = 0.5 * openK;
        dorsalLean = -0.10 * openK;
        trYaw = Math.sin(t * 10) * 0.03 * openK;
        tbYaw = -trYaw;
      }
    } else {
      // ---------------- LOCOMOTION GAIT ----------------
      const wavePhase = stride * Math.PI * 2;
      const idlePhase = t * 0.9;
      const stillT = smooth(0.08, 0.0, speed); // 1 at speed 0, 0 by speed 0.08
      const usePhase = lerp(wavePhase, idlePhase, stillT);
      const idleScale = lerp(1.0, 0.35, stillT);

      const hAmp = curve(speed, HEAD_AMP) * idleScale;
      const tAmp = curve(speed, TORSO_AMP) * idleScale;
      const bAmp = curve(speed, TAILB_AMP) * idleScale;
      const cAmp = curve(speed, CAUD_AMP) * idleScale;

      headYawV = Math.sin(usePhase) * hAmp;
      trYaw = Math.sin(usePhase - 0.9) * tAmp;
      tbYaw = Math.sin(usePhase - 1.8) * bAmp;
      caudYaw = Math.sin(usePhase - 2.6) * cAmp;

      headPitch = curve(speed, HEAD_PITCH_C) + Math.sin(t * 0.5) * 0.02 * stillT;
      trPitch = curve(speed, TREAR_PITCH_C);

      const pecSweep = curve(speed, PEC_SWEEP_C);
      const pecDihed = curve(speed, PEC_DIHED_C) + Math.sin(t * 1.4) * 0.03 * stillT;
      pecSweepL = pecSweep; pecSweepR = pecSweep;
      pecDihedL = pecDihed; pecDihedR = pecDihed;
      pecFlapL = Math.sin(usePhase * 0.5) * 0.03 * idleScale;
      pecFlapR = -pecFlapL;

      pelSweepL = tbYaw * 0.3; pelSweepR = tbYaw * 0.3;
      pelDihedL = 0.10; pelDihedR = 0.10;

      dorsalLean = -trYaw * 0.4;
      analYawExtra = tbYaw * 0.25;

      breatheScale = 1 + Math.sin(t * 1.2) * (stillT * 0.01 + 0.003);
    }

    // ---------------- OVERLAYS ----------------
    // turn (added regardless of branch)
    headYawV += turn * 0.18;
    headRoll += -turn * 0.06;
    trRoll += -turn * 0.20;
    trYaw += turn * 0.06;
    tbRoll += -turn * 0.26;
    tbYaw += turn * 0.10;
    caudYaw += -turn * 0.35;
    const leftInner = Math.max(0, -turn), leftOuter = Math.max(0, turn);
    const rightInner = Math.max(0, turn), rightOuter = Math.max(0, -turn);
    pecDihedL += -leftInner * 0.20 + leftOuter * 0.20;
    pecDihedR += -rightInner * 0.20 + rightOuter * 0.20;

    // hurt (health < 1)
    const hurtT = clamp01(1 - health);
    dorsalLean += hurtT * 0.30;
    pecDihedR += hurtT * 0.35;
    pecSweepR += hurtT * 0.15;
    headRoll += hurtT * 0.15;
    headPitch -= hurtT * 0.06;
    const wobble = Math.sin(t * 3.3) * hurtT * 0.07;
    trYaw += wobble; tbYaw += wobble * 1.2;

    // airborne
    if (!grounded) {
      const damp = 0.15;
      headYawV *= damp; trYaw *= damp; tbYaw *= damp; caudYaw *= damp;
      headPitch += 0.18;
      trPitch += -0.10;
      tbYaw += 0.10;
      caudYaw += 0.28;
      pecSweepL -= 0.25; pecSweepR -= 0.25;
      pecDihedL -= 0.25; pecDihedR -= 0.25;
      pelDihedL -= 0.10; pelDihedR -= 0.10;
    }

    // ---------------- APPLY ----------------
    torso.position.set(TORSO_POS_X, TORSO_POS_Y, TORSO_POS_Z + torsoDZ + torsoDY * 0);
    torso.position.y += torsoDY;
    torso.rotation.set(torsoPitch, 0, torsoRoll);
    torso.scale.set(breatheScale, breatheScale, breatheScale);

    head.position.set(HEAD_POS.x, HEAD_POS.y, HEAD_POS.z + headDZ);
    head.rotation.set(headPitch, headYawV, headRoll);

    lowerJaw.rotation.set(Math.max(0, jawOpen), 0, 0);

    torsoRear.rotation.set(trPitch, trYaw, trRoll);

    tailBase.rotation.set(tbPitch, tbYaw, tbRoll);

    caudal.rotation.set(0, Math.PI / 2 + caudYaw, caudRoll);

    dorsal.rotation.set(0, Math.PI / 2, dorsalLean);

    analFin.rotation.set(0, Math.PI / 2 + analYawExtra, analLean);

    pecL.scale.set(-1, 1, 1);
    pecL.rotation.set(-Math.PI / 2 + pecFlapL, pecSweepL, pecDihedL);
    pecR.scale.set(1, 1, 1);
    pecR.rotation.set(-Math.PI / 2 + pecFlapR, pecSweepR, pecDihedR);

    pelL.scale.set(-1, 1, 1);
    pelL.rotation.set(-Math.PI / 2, pelSweepL, pelDihedL);
    pelR.scale.set(1, 1, 1);
    pelR.rotation.set(-Math.PI / 2, pelSweepR, pelDihedR);
  };

  const TORSO_POS_X = 0, TORSO_POS_Y = 0, TORSO_POS_Z = 0;

  return root;
}
```