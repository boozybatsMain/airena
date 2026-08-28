function build(THREE, TSL) {
  const D = THREE.MathUtils.degToRad;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function kf(x, stops) {
    if (x <= stops[0][0]) return stops[0][1];
    const n = stops.length;
    if (x >= stops[n - 1][0]) return stops[n - 1][1];
    for (let i = 0; i < n - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (x >= a[0] && x <= b[0]) {
        const u = (b[0] - a[0]) > 1e-6 ? (x - a[0]) / (b[0] - a[0]) : 0;
        const e = u * u * (3 - 2 * u);
        return a[1] + (b[1] - a[1]) * e;
      }
    }
    return stops[n - 1][1];
  }

  function limbCycle(p, duty, swingAmp, liftAmp) {
    p = p - Math.floor(p);
    let swing, lift, flex;
    if (p < duty) {
      const u = duty > 0 ? p / duty : 0;
      swing = swingAmp * (1 - 2 * u);
      lift = 0; flex = 0;
    } else {
      const span = 1 - duty;
      const u = span > 0 ? (p - duty) / span : 0;
      const e = u * u * (3 - 2 * u);
      swing = -swingAmp + swingAmp * 2 * e;
      const arc = Math.sin(u * Math.PI);
      lift = arc * liftAmp;
      flex = arc;
    }
    return { swing, lift, flex };
  }

  function hx(hex) { const c = new THREE.Color(hex); return TSL.vec3(c.r, c.g, c.b); }

  function furMat(baseHex, shadeHex, rough, metal) {
    const m = new THREE.MeshStandardNodeMaterial();
    const p = TSL.positionLocal;
    const t1 = TSL.sin(TSL.add(TSL.mul(p.x, 41.0), TSL.mul(p.y, 17.0)));
    const t2 = TSL.sin(TSL.add(TSL.mul(p.y, 53.0), TSL.mul(p.z, 31.0)));
    const t3 = TSL.sin(TSL.add(TSL.mul(p.z, 23.0), TSL.mul(p.x, 11.0)));
    const n = TSL.mul(TSL.mul(t1, t2), t3);
    const speck = TSL.smoothstep(-0.15, 0.45, n);
    m.colorNode = TSL.mix(hx(shadeHex), hx(baseHex), speck);
    m.roughness = rough; m.metalness = metal;
    return m;
  }

  function skinMat(hex) {
    const m = new THREE.MeshStandardNodeMaterial();
    const p = TSL.positionLocal;
    const n = TSL.sin(TSL.add(TSL.mul(p.x, 19.0), TSL.mul(p.z, 13.0)));
    const v = TSL.mul(TSL.smoothstep(-0.3, 0.3, n), 0.05);
    m.colorNode = TSL.add(hx(hex), TSL.vec3(v, v, v));
    m.roughness = 0.5; m.metalness = 0.08;
    return m;
  }

  const furDark = furMat(0x2a2a2a, 0x141414, 0.95, 0.0);
  const furSilver = furMat(0xb9b9ad, 0x8c8c82, 0.85, 0.05);
  const skinDark = skinMat(0x1c1712);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x120a05, roughness: 0.3, metalness: 0.1 });

  const REST = {
    spine: D(18), chest: D(-10), neck: D(-14),
    shoulderForward: D(6), shoulderAbduct: D(9), elbow: D(22),
    hipForward: D(4), knee: D(16)
  };
  const BASE = { hipsY: 0.66 };

  const gorilla = new THREE.Group(); gorilla.name = 'Gorilla';

  const hips = new THREE.Group(); hips.name = 'Hips';
  hips.position.set(0, BASE.hipsY, 0);
  gorilla.add(hips);

  const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.32, 0.34), furDark);
  pelvisMesh.name = 'Pelvis';
  pelvisMesh.position.set(0, 0.02, -0.02);
  hips.add(pelvisMesh);

  const spine = new THREE.Group(); spine.name = 'Spine';
  spine.position.set(0, 0.14, 0.04);
  spine.rotation.x = REST.spine;
  hips.add(spine);

  const spineMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.20, 0.26, 4, 10), furDark);
  spineMesh.position.set(0, 0.15, 0.02);
  spine.add(spineMesh);

  const chest = new THREE.Group(); chest.name = 'Chest';
  chest.position.set(0, 0.34, 0.10);
  chest.rotation.x = REST.chest;
  spine.add(chest);

  const chestMesh = new THREE.Mesh(new THREE.SphereGeometry(0.30, 16, 12), furDark);
  chestMesh.scale.set(1.25, 1.05, 0.95);
  chestMesh.position.set(0, 0.14, 0.08);
  chest.add(chestMesh);

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.10), furSilver);
  saddle.name = 'SaddlePatch';
  saddle.position.set(0, 0.16, -0.16);
  chest.add(saddle);

  const neck = new THREE.Group(); neck.name = 'Neck';
  neck.position.set(0, 0.30, 0.14);
  neck.rotation.x = REST.neck;
  chest.add(neck);

  const neckMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.10, 4, 10), furDark);
  neckMesh.position.set(0, 0.08, 0.02);
  neck.add(neckMesh);

  const head = new THREE.Group(); head.name = 'Head';
  head.position.set(0, 0.20, 0.06);
  neck.add(head);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), furDark);
  headMesh.scale.set(1.0, 0.95, 1.05);
  headMesh.position.set(0, 0.10, 0.05);
  head.add(headMesh);

  const faceMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skinDark);
  faceMesh.name = 'Face';
  faceMesh.scale.set(0.9, 1.0, 0.5);
  faceMesh.position.set(0, 0.06, 0.19);
  head.add(faceMesh);

  const crest = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.10, 8), furDark);
  crest.name = 'SagittalCrest';
  crest.position.set(0, 0.24, 0.02);
  head.add(crest);

  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.06), skinDark);
  brow.name = 'BrowRidge';
  brow.position.set(0, 0.13, 0.20);
  head.add(brow);

  const eyeGeo = new THREE.SphereGeometry(0.02, 8, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.name = 'EyeL'; eyeL.position.set(-0.07, 0.12, 0.24); head.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.name = 'EyeR'; eyeR.position.set(0.07, 0.12, 0.24); head.add(eyeR);

  const earGeo = new THREE.SphereGeometry(0.05, 10, 8);
  const earL = new THREE.Mesh(earGeo, skinDark); earL.name = 'EarL'; earL.scale.set(0.6, 1, 0.4); earL.position.set(-0.20, 0.10, 0.02); head.add(earL);
  const earR = new THREE.Mesh(earGeo, skinDark); earR.name = 'EarR'; earR.scale.set(0.6, 1, 0.4); earR.position.set(0.20, 0.10, 0.02); head.add(earR);

  const jaw = new THREE.Group(); jaw.name = 'Jaw';
  jaw.position.set(0, 0.0, 0.17);
  head.add(jaw);
  const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.14), skinDark);
  jawMesh.position.set(0, -0.04, 0.05);
  jaw.add(jawMesh);

  function buildArm(side, parent) {
    const tag = side > 0 ? 'R' : 'L';
    const upper = new THREE.Group(); upper.name = 'UpperArm' + tag;
    upper.position.set(0.30 * side, 0.20, 0.10);
    const upperMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.34, 4, 10), furDark);
    upperMesh.position.set(0, -0.17, 0);
    upper.add(upperMesh);

    const fore = new THREE.Group(); fore.name = 'Forearm' + tag;
    fore.position.set(0, -0.34, 0);
    const foreMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.30, 4, 10), furDark);
    foreMesh.position.set(0, -0.15, 0);
    fore.add(foreMesh);

    const hand = new THREE.Group(); hand.name = 'Hand' + tag;
    hand.position.set(0, -0.30, 0);
    const handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.14, 0.19), skinDark);
    handMesh.position.set(0, -0.07, 0.02);
    hand.add(handMesh);

    fore.add(hand);
    upper.add(fore);
    parent.add(upper);
    return { upper, fore, hand };
  }

  function buildLeg(side, parent) {
    const tag = side > 0 ? 'R' : 'L';
    const thigh = new THREE.Group(); thigh.name = 'Thigh' + tag;
    thigh.position.set(0.24 * side, -0.04, -0.06);
    const thighMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.30, 4, 10), furDark);
    thighMesh.position.set(0, -0.15, 0);
    thigh.add(thighMesh);

    const shin = new THREE.Group(); shin.name = 'Shin' + tag;
    shin.position.set(0, -0.30, 0);
    const shinMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.28, 4, 10), furDark);
    shinMesh.position.set(0, -0.14, 0);
    shin.add(shinMesh);

    const foot = new THREE.Group(); foot.name = 'Foot' + tag;
    foot.position.set(0, -0.28, 0);
    const footMesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.12, 0.30), skinDark);
    footMesh.position.set(0, -0.05, 0.10);
    foot.add(footMesh);

    shin.add(foot);
    thigh.add(shin);
    parent.add(thigh);
    return { thigh, shin, foot };
  }

  const armR = buildArm(1, chest);
  const armL = buildArm(-1, chest);
  const legR = buildLeg(1, hips);
  const legL = buildLeg(-1, hips);

  gorilla.userData.pose = (s) => {
    const P = {
      hipsY: 0, hipsPosZ: 0, hipsRotX: 0, hipsRotZ: 0,
      spineRotX: REST.spine, spineRotY: 0, spineRotZ: 0,
      chestRotX: REST.chest, chestRotY: 0, chestRotZ: 0, chestScale: 1,
      neckRotX: REST.neck, neckRotY: 0,
      headRotX: 0, headRotY: 0,
      jawRotX: 0,
      shL: { x: REST.shoulderForward, z: -REST.shoulderAbduct }, elL: { x: REST.elbow }, wristL: 0,
      shR: { x: REST.shoulderForward, z: REST.shoulderAbduct }, elR: { x: REST.elbow }, wristR: 0,
      hipL: { x: REST.hipForward }, knL: { x: REST.knee }, ankleL: 0,
      hipR: { x: REST.hipForward }, knR: { x: REST.knee }, ankleR: 0
    };

    const speed = s.speed || 0, turn = s.turn || 0, t = s.t || 0;
    const stride = s.stride || 0;
    const health = (s.health === undefined) ? 1 : s.health;

    if (s.action) {
      const ph = clamp(s.phase || 0, 0, 1);
      switch (s.action) {
        case 'attack': {
          P.shR.x = kf(ph, [[0, REST.shoulderForward], [0.25, -D(80)], [0.55, D(70)], [1, REST.shoulderForward]]);
          P.elR.x = kf(ph, [[0, REST.elbow], [0.25, D(60)], [0.55, D(10)], [1, REST.elbow]]);
          P.chestRotY = kf(ph, [[0, 0], [0.25, D(-18)], [0.55, D(22)], [1, 0]]);
          P.spineRotY = kf(ph, [[0, 0], [0.25, D(-8)], [0.55, D(10)], [1, 0]]);
          P.jawRotX = kf(ph, [[0, 0], [0.4, 0], [0.5, D(-25)], [0.7, D(-25)], [1, 0]]);
          P.headRotX = kf(ph, [[0, 0], [0.5, D(-10)], [0.7, D(-6)], [1, 0]]);
          P.hipsPosZ = kf(ph, [[0, 0], [0.25, -0.05], [0.55, 0.08], [1, 0]]);
          break;
        }
        case 'fire': {
          P.shR.x = kf(ph, [[0, REST.shoulderForward], [0.35, -D(60)], [0.55, D(75)], [0.7, D(55)], [1, REST.shoulderForward]]);
          P.elR.x = kf(ph, [[0, REST.elbow], [0.35, D(50)], [0.55, D(5)], [0.7, D(15)], [1, REST.elbow]]);
          P.chestRotY = kf(ph, [[0, 0], [0.35, D(-6)], [0.55, D(10)], [1, 0]]);
          P.headRotX = kf(ph, [[0, 0], [0.35, D(-6)], [0.55, D(2)], [1, 0]]);
          P.hipsPosZ = kf(ph, [[0, 0], [0.55, -0.02], [0.7, 0.04], [1, 0]]);
          break;
        }
        case 'hit': {
          const f = kf(ph, [[0, 0], [0.15, 1], [0.45, 0.2], [1, 0]]);
          P.headRotX = -f * D(20);
          P.chestRotZ = -f * D(10);
          P.hipsPosZ = -f * 0.04;
          P.shL.x = REST.shoulderForward - f * D(25);
          break;
        }
        case 'block': {
          const b = kf(ph, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
          P.hipsY = -b * 0.05;
          P.hipsPosZ = -b * 0.06;
          P.shL.x = REST.shoulderForward + b * D(50);
          P.shL.z = -REST.shoulderAbduct + b * D(20);
          P.shR.x = REST.shoulderForward + b * D(50);
          P.shR.z = REST.shoulderAbduct - b * D(20);
          P.elL.x = REST.elbow + b * D(50);
          P.elR.x = REST.elbow + b * D(50);
          P.headRotX = b * D(15);
          P.chestRotX = REST.chest + b * D(8);
          break;
        }
        case 'gather': {
          const r = kf(ph, [[0, 0], [0.4, 1], [0.6, 1], [1, 0]]);
          P.hipsY = -r * 0.18;
          P.spineRotX = REST.spine + r * D(35);
          P.neckRotX = REST.neck + r * D(20);
          P.headRotX = r * D(15);
          P.shR.x = REST.shoulderForward + r * D(70);
          P.elR.x = REST.elbow + r * D(50);
          break;
        }
        case 'deposit': {
          const r = kf(ph, [[0, 0], [0.35, 1], [0.75, 1], [1, 0]]);
          P.hipsY = -r * 0.16;
          P.spineRotX = REST.spine + r * D(32);
          P.neckRotX = REST.neck + r * D(18);
          P.headRotX = r * D(14);
          P.shR.x = REST.shoulderForward + r * D(65);
          P.elR.x = REST.elbow + r * D(42);
          break;
        }
        case 'eat': {
          const cycles = 3;
          const env = kf(ph, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
          const chew = Math.sin(ph * cycles * Math.PI * 2);
          P.spineRotX = REST.spine + env * D(22);
          P.neckRotX = REST.neck + env * D(15);
          P.headRotX = env * D(20) + chew * D(6) * env;
          P.jawRotX = chew * D(-15) * env - D(4) * env;
          P.shR.x = REST.shoulderForward + env * D(40) + chew * D(10) * env;
          P.elR.x = REST.elbow + env * D(60) + chew * D(15) * env;
          break;
        }
        case 'drink': {
          const env = kf(ph, [[0, 0], [0.25, 1], [0.75, 1], [1, 0]]);
          const sw = Math.sin(ph * Math.PI * 2 * 1.5) * D(3) * env;
          P.spineRotX = REST.spine + env * D(28);
          P.neckRotX = REST.neck + env * D(20);
          P.headRotX = env * D(25) + sw;
          break;
        }
        case 'jump': {
          const load = kf(ph, [[0, 0], [0.33, 1], [0.5, 0.2], [1, 0]]);
          const ext = kf(ph, [[0, 0], [0.33, 0], [0.6, 1], [1, 1]]);
          P.hipsY = -load * 0.16 + ext * 0.10;
          P.spineRotX = REST.spine - ext * D(20) + load * D(10);
          P.hipL.x = REST.hipForward + load * D(30) - ext * D(50);
          P.hipR.x = REST.hipForward + load * D(30) - ext * D(50);
          P.knL.x = REST.knee + load * D(50) - ext * D(30);
          P.knR.x = REST.knee + load * D(50) - ext * D(30);
          P.shL.x = REST.shoulderForward + load * D(15) - ext * D(90);
          P.shR.x = REST.shoulderForward + load * D(15) - ext * D(90);
          P.elL.x = REST.elbow + load * D(30) - ext * D(15);
          P.elR.x = REST.elbow + load * D(30) - ext * D(15);
          break;
        }
        case 'land': {
          const reach = kf(ph, [[0, 0], [0.3, 1], [0.6, 0.3], [1, 0]]);
          const shock = kf(ph, [[0, 0], [0.3, 0], [0.45, 1], [0.6, 1], [1, 0]]);
          P.hipsY = -shock * 0.20;
          P.spineRotX = REST.spine + shock * D(15) - reach * D(10);
          P.hipL.x = REST.hipForward - reach * D(40) + shock * D(45);
          P.hipR.x = REST.hipForward - reach * D(40) + shock * D(45);
          P.knL.x = REST.knee - reach * D(10) + shock * D(45);
          P.knR.x = REST.knee - reach * D(10) + shock * D(45);
          P.shL.x = REST.shoulderForward - reach * D(60) + shock * D(45);
          P.shR.x = REST.shoulderForward - reach * D(60) + shock * D(45);
          P.elL.x = REST.elbow + shock * D(45);
          P.elR.x = REST.elbow + shock * D(45);
          break;
        }
        case 'signal': {
          const rise = kf(ph, [[0, 0], [0.25, 1], [0.7, 1], [1, 0]]);
          const beatEnv = kf(ph, [[0, 0], [0.3, 1], [0.7, 1], [1, 0]]);
          const beatL = Math.sin(ph * Math.PI * 2 * 10) * beatEnv * D(18);
          const beatR = Math.sin(ph * Math.PI * 2 * 10 + Math.PI) * beatEnv * D(18);
          P.hipsY = rise * 0.22;
          P.spineRotX = REST.spine - rise * D(30);
          P.chestScale = 1 + rise * 0.08;
          P.shL.x = REST.shoulderForward - rise * D(70) + beatL;
          P.shR.x = REST.shoulderForward - rise * D(70) + beatR;
          P.shL.z = -REST.shoulderAbduct - rise * D(50);
          P.shR.z = REST.shoulderAbduct + rise * D(50);
          P.elL.x = REST.elbow + rise * D(20);
          P.elR.x = REST.elbow + rise * D(20);
          P.headRotX = -rise * D(15);
          P.jawRotX = -rise * D(25);
          break;
        }
        case 'sleep': {
          const d = kf(ph, [[0, 0], [0.7, 1], [1, 1]]);
          P.hipsY = -d * 0.42;
          P.spineRotX = REST.spine + d * D(50);
          P.hipL.x = REST.hipForward + d * D(70);
          P.hipR.x = REST.hipForward + d * D(70);
          P.knL.x = REST.knee + d * D(80);
          P.knR.x = REST.knee + d * D(80);
          P.shL.x = REST.shoulderForward + d * D(60);
          P.shR.x = REST.shoulderForward + d * D(60);
          P.elL.x = REST.elbow + d * D(70);
          P.elR.x = REST.elbow + d * D(70);
          P.headRotX = d * D(40);
          P.neckRotX = REST.neck + d * D(20);
          P.hipsPosZ = d * 0.05;
          break;
        }
        case 'wake': {
          const w = kf(ph, [[0, 1], [0.3, 1], [1, 0]]);
          P.hipsY = -w * 0.42;
          P.spineRotX = REST.spine + w * D(50);
          P.hipL.x = REST.hipForward + w * D(70);
          P.hipR.x = REST.hipForward + w * D(70);
          P.knL.x = REST.knee + w * D(80);
          P.knR.x = REST.knee + w * D(80);
          P.shL.x = REST.shoulderForward + w * D(60);
          P.shR.x = REST.shoulderForward + w * D(60);
          P.elL.x = REST.elbow + w * D(70);
          P.elR.x = REST.elbow + w * D(70);
          P.headRotX = w * D(40);
          P.neckRotX = REST.neck + w * D(20);
          P.hipsPosZ = w * 0.05;
          break;
        }
        case 'die': {
          const c = kf(ph, [[0, 0], [0.25, 0.3], [0.5, 0.8], [0.8, 1], [1, 1]]);
          P.hipsY = -c * 0.55;
          P.hipsRotZ = c * D(60);
          P.spineRotX = REST.spine + c * D(70);
          P.shR.x = REST.shoulderForward + c * D(100);
          P.elR.x = REST.elbow - c * D(30);
          P.shL.x = REST.shoulderForward + c * D(40);
          P.elL.x = REST.elbow - c * D(15);
          P.hipL.x = REST.hipForward + c * D(50);
          P.hipR.x = REST.hipForward + c * D(50);
          P.knL.x = REST.knee * (1 - c) + c * D(5);
          P.knR.x = REST.knee * (1 - c) + c * D(5);
          P.headRotX = c * D(50);
          P.headRotY = c * D(30);
          P.jawRotX = -c * D(15);
          break;
        }
        case 'evolve': {
          const brace = kf(ph, [[0, 0], [0.15, 1], [0.3, 0.3], [1, 0]]);
          const open = kf(ph, [[0, 0], [0.25, 1], [0.6, 1], [1, 0]]);
          P.hipsY = -brace * 0.10 + open * 0.15;
          P.knL.x = REST.knee + brace * D(20);
          P.knR.x = REST.knee + brace * D(20);
          P.elL.x = REST.elbow + brace * D(20);
          P.elR.x = REST.elbow + brace * D(20);
          P.spineRotX = REST.spine + brace * D(15) - open * D(25);
          P.chestScale = 1 + open * 0.1;
          P.shL.z = -REST.shoulderAbduct - open * D(60);
          P.shR.z = REST.shoulderAbduct + open * D(60);
          P.shL.x = REST.shoulderForward - open * D(50);
          P.shR.x = REST.shoulderForward - open * D(50);
          P.headRotX = -open * D(20);
          break;
        }
      }
    } else {
      const idleT = clamp(1 - speed / 0.6, 0, 1);
      const breathe = Math.sin(t * 1.6);
      P.chestScale = 1 + breathe * 0.012 + 0.01;
      P.headRotY += Math.sin(t * 0.35) * D(8) * idleT;
      P.hipsRotZ += Math.sin(t * 0.5) * D(2) * idleT;
      P.hipsY += Math.sin(t * 1.6) * 0.006 * idleT;

      if (!s.grounded) {
        P.shL.x = REST.shoulderForward - D(18) + Math.sin(t * 3.0) * D(4);
        P.shR.x = REST.shoulderForward - D(18) + Math.sin(t * 3.0 + 1.0) * D(4);
        P.elL.x = REST.elbow + D(22);
        P.elR.x = REST.elbow + D(22);
        P.hipL.x = REST.hipForward - D(12);
        P.hipR.x = REST.hipForward - D(12);
        P.knL.x = REST.knee + D(28);
        P.knR.x = REST.knee + D(28);
        P.spineRotX = REST.spine - D(8);
        P.hipsY += 0.02;
      } else {
        const bounding = speed >= 1.5;
        let duty, swingAmpDeg, liftAmp, kneeFlexDeg;
        if (bounding) {
          duty = kf(speed, [[1.5, 0.48], [2, 0.45], [3, 0.38], [6, 0.30]]);
          swingAmpDeg = kf(speed, [[1.5, 28], [2, 34], [3, 40], [6, 46]]);
          liftAmp = kf(speed, [[1.5, 0.11], [2, 0.14], [3, 0.20], [6, 0.26]]);
          kneeFlexDeg = kf(speed, [[1.5, 32], [2, 40], [3, 48], [6, 55]]);
        } else {
          duty = kf(speed, [[0, 0.8], [0.5, 0.75], [1, 0.62]]);
          swingAmpDeg = kf(speed, [[0, 0], [0.5, 14], [1, 26]]);
          liftAmp = kf(speed, [[0, 0], [0.5, 0.05], [1, 0.09]]);
          kneeFlexDeg = kf(speed, [[0, 0], [0.5, 20], [1, 30]]);
        }
        const swingAmp = D(swingAmpDeg), kneeFlexAmp = D(kneeFlexDeg);
        const crouchAmt = kf(speed, [[0, 0], [0.5, 0.06], [1, 0], [6, 0]]);
        const flattenT = kf(speed, [[0, 0], [1, 0], [2, 0.3], [3, 0.6], [6, 1.0]]);
        const bounceAmp = kf(speed, [[0, 0], [0.5, 0.01], [1, 0.02], [2, 0.05], [3, 0.08], [6, 0.10]]);

        let offArmL, offArmR, offLegL, offLegR;
        if (bounding) { offArmL = 0; offArmR = 0.04; offLegL = 0.5; offLegR = 0.54; }
        else { offLegL = 0; offArmL = 0.25; offLegR = 0.5; offArmR = 0.75; }

        const cArmL = limbCycle(stride + offArmL, duty, swingAmp, liftAmp);
        const cArmR = limbCycle(stride + offArmR, duty, swingAmp, liftAmp);
        const cLegL = limbCycle(stride + offLegL, duty, swingAmp, liftAmp);
        const cLegR = limbCycle(stride + offLegR, duty, swingAmp, liftAmp);

        P.shL.x = REST.shoulderForward + cArmL.swing;
        P.elL.x = REST.elbow + cArmL.flex * kneeFlexAmp;
        P.wristL = -cArmL.flex * kneeFlexAmp * 0.4;
        P.shR.x = REST.shoulderForward + cArmR.swing;
        P.elR.x = REST.elbow + cArmR.flex * kneeFlexAmp;
        P.wristR = -cArmR.flex * kneeFlexAmp * 0.4;
        P.hipL.x = REST.hipForward + cLegL.swing;
        P.knL.x = REST.knee + cLegL.flex * kneeFlexAmp;
        P.ankleL = -cLegL.flex * kneeFlexAmp * 0.4;
        P.hipR.x = REST.hipForward + cLegR.swing;
        P.knR.x = REST.knee + cLegR.flex * kneeFlexAmp;
        P.ankleR = -cLegR.flex * kneeFlexAmp * 0.4;

        P.hipsY += -crouchAmt * 0.10;
        P.spineRotX = REST.spine + crouchAmt * D(10) - flattenT * D(16);
        P.neckRotX = REST.neck * (1 - flattenT * 0.8);
        P.headRotX += -flattenT * D(10);

        const maxLift = Math.max(cArmL.lift, cArmR.lift, cLegL.lift, cLegR.lift);
        P.hipsY += bounceAmp * maxLift * 4;
        P.hipsRotZ += Math.sin(stride * Math.PI * 2) * D(bounding ? 4 : 2.5);
      }

      if (turn) {
        P.chestRotZ += turn * D(-12);
        P.spineRotZ += turn * D(-6);
        P.headRotY += turn * D(-25);
        P.neckRotY += turn * D(-15);
        if (turn < 0) { P.elL.x += (-turn) * D(10); P.knL.x += (-turn) * D(10); }
        else { P.elR.x += turn * D(10); P.knR.x += turn * D(10); }
      }

      const hurtT = clamp(1 - health, 0, 1);
      if (hurtT > 0) {
        P.chestRotZ += hurtT * D(-14);
        P.spineRotZ += hurtT * D(-8);
        P.headRotX += hurtT * D(12);
        P.headRotY += hurtT * D(10);
        P.shR.x += hurtT * D(22);
        P.elR.x += hurtT * D(20);
        P.hipsY -= hurtT * 0.05;
        P.hipR.x -= hurtT * D(8);
      }
    }

    hips.position.set(0, BASE.hipsY + P.hipsY, P.hipsPosZ);
    hips.rotation.set(P.hipsRotX, 0, P.hipsRotZ);
    spine.rotation.set(P.spineRotX, P.spineRotY, P.spineRotZ);
    chest.rotation.set(P.chestRotX, P.chestRotY, P.chestRotZ);
    chest.scale.setScalar(P.chestScale);
    neck.rotation.set(P.neckRotX, P.neckRotY, 0);
    head.rotation.set(P.headRotX, P.headRotY, 0);
    jaw.rotation.set(P.jawRotX, 0, 0);

    armL.upper.rotation.set(P.shL.x, 0, P.shL.z);
    armL.fore.rotation.set(P.elL.x, 0, 0);
    armL.hand.rotation.set(P.wristL, 0, 0);
    armR.upper.rotation.set(P.shR.x, 0, P.shR.z);
    armR.fore.rotation.set(P.elR.x, 0, 0);
    armR.hand.rotation.set(P.wristR, 0, 0);

    legL.thigh.rotation.set(P.hipL.x, 0, 0);
    legL.shin.rotation.set(P.knL.x, 0, 0);
    legL.foot.rotation.set(P.ankleL, 0, 0);
    legR.thigh.rotation.set(P.hipR.x, 0, 0);
    legR.shin.rotation.set(P.knR.x, 0, 0);
    legR.foot.rotation.set(P.ankleR, 0, 0);
  };

  return gorilla;
}