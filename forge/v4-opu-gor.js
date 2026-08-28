function build(THREE, TSL) {
  const root = new THREE.Group();
  root.name = 'Gorilla';

  // ---------------------------------------------------------------- materials
  const { Fn, vec3, vec4, float, uv, positionLocal, normalLocal, mix, sin, cos,
          abs, pow, smoothstep, step, fract, floor, dot, length, clamp,
          oneMinus, uniform, mul, add, sub, div, max: tmax, min: tmin } = TSL;

  const hash = Fn(([p]) => {
    const q = p.mul(vec3(127.1, 311.7, 74.7));
    return fract(sin(dot(q, vec3(12.9898, 78.233, 45.164))).mul(43758.5453));
  });

  const fbm = Fn(([p]) => {
    let s = float(0).toVar();
    let a = float(0.5).toVar();
    let q = p.toVar();
    for (let i = 0; i < 4; i++) {
      const c = floor(q);
      const f = fract(q);
      const w = f.mul(f).mul(sub(float(3.0), f.mul(2.0)));
      const n000 = hash(c.add(vec3(0, 0, 0)));
      const n100 = hash(c.add(vec3(1, 0, 0)));
      const n010 = hash(c.add(vec3(0, 1, 0)));
      const n110 = hash(c.add(vec3(1, 1, 0)));
      const n001 = hash(c.add(vec3(0, 0, 1)));
      const n101 = hash(c.add(vec3(1, 0, 1)));
      const n011 = hash(c.add(vec3(0, 1, 1)));
      const n111 = hash(c.add(vec3(1, 1, 1)));
      const x00 = mix(n000, n100, w.x);
      const x10 = mix(n010, n110, w.x);
      const x01 = mix(n001, n101, w.x);
      const x11 = mix(n011, n111, w.x);
      const y0 = mix(x00, x10, w.y);
      const y1 = mix(x01, x11, w.y);
      s.addAssign(mix(y0, y1, w.z).mul(a));
      a.mulAssign(0.5);
      q.mulAssign(2.03);
    }
    return s;
  });

  // fur: dense directional strand noise + silverback saddle
  const makeFur = (silver) => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0.0 });
    const strands = Fn(() => {
      const p = positionLocal;
      // stretch noise along Y so it reads as hanging strands
      const strandN = fbm(vec3(p.x.mul(46.0), p.y.mul(9.0), p.z.mul(46.0)));
      const clumps = fbm(vec3(p.x.mul(13.0), p.y.mul(6.0), p.z.mul(13.0)));
      const fine = fbm(vec3(p.mul(120.0)));

      const base = vec3(0.055, 0.048, 0.046);
      const lift = vec3(0.145, 0.128, 0.120);
      let col = mix(base, lift, clamp(strands.mul(1.35).sub(0.12), 0.0, 1.0)).toVar();
      col.mulAssign(mix(float(0.78), float(1.16), clumps));
      col.addAssign(vec3(0.03, 0.026, 0.022).mul(fine));

      if (silver) {
        // saddle across the back: high Y, negative Z (behind), fading at flanks
        const backness = smoothstep(float(0.05), float(-0.28), p.z);
        const height = smoothstep(float(-0.10), float(0.34), p.y);
        const flank = oneMinus(smoothstep(float(0.30), float(0.72), abs(p.x)));
        const saddle = clamp(backness.mul(height).mul(flank).mul(1.25), 0.0, 1.0);
        const grizzle = clamp(strands.mul(1.7).sub(0.25), 0.0, 1.0);
        const silverCol = mix(vec3(0.30, 0.30, 0.32), vec3(0.74, 0.74, 0.78), grizzle);
        col.assign(mix(col, silverCol, saddle.mul(0.92)));
      }
      return vec4(col, 1.0);
    });
    m.colorNode = strands();
    m.roughnessNode = Fn(() =>
      clamp(float(0.98).sub(fbm(positionLocal.mul(28.0)).mul(0.22)), 0.4, 1.0)
    )();
    return m;
  };

  const furMat = makeFur(false);
  const furSilverMat = makeFur(true);

  // bare skin: face, ears, palms, soles, chest patch — leathery, creased
  const skinMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.62, metalness: 0.0 });
  skinMat.colorNode = Fn(() => {
    const p = positionLocal;
    const pores = fbm(p.mul(85.0));
    const creases = fbm(p.mul(19.0));
    const base = vec3(0.048, 0.040, 0.040);
    const warm = vec3(0.115, 0.083, 0.078);
    let col = mix(base, warm, clamp(creases.mul(1.4).sub(0.15), 0.0, 1.0)).toVar();
    col.mulAssign(mix(float(0.82), float(1.10), pores));
    return vec4(col, 1.0);
  })();
  skinMat.roughnessNode = Fn(() =>
    clamp(float(0.72).sub(fbm(positionLocal.mul(50.0)).mul(0.35)), 0.22, 0.9)
  )();

  const noseMat = new THREE.MeshStandardNodeMaterial({ color: 0x0a0808, roughness: 0.35 });
  const eyeWhiteMat = new THREE.MeshStandardNodeMaterial({ color: 0x5a4a3a, roughness: 0.30 });
  const irisMat = new THREE.MeshStandardNodeMaterial({ color: 0x2a1a0c, roughness: 0.18 });
  irisMat.emissiveNode = TSL.vec3(0.05, 0.028, 0.012);
  const pupilMat = new THREE.MeshStandardNodeMaterial({ color: 0x000000, roughness: 0.1 });
  const teethMat = new THREE.MeshStandardNodeMaterial({ color: 0xdcd2bc, roughness: 0.28 });
  const gumMat = new THREE.MeshStandardNodeMaterial({ color: 0x3a1c1c, roughness: 0.55 });
  const nailMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a1614, roughness: 0.42 });

  // ------------------------------------------------------------------ helpers
  const add3 = (parent, child, x = 0, y = 0, z = 0) => {
    child.position.set(x, y, z);
    parent.add(child);
    return child;
  };
  const part = (name, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    return g;
  };
  const mesh = (name, geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  // squashed sphere blob
  const blob = (name, rx, ry, rz, mat, seg = 20) => {
    const g = new THREE.SphereGeometry(1, seg, Math.max(12, seg - 4));
    g.scale(rx, ry, rz);
    return mesh(name, g, mat);
  };
  const caps = (name, r, len, mat, seg = 16) =>
    mesh(name, new THREE.CapsuleGeometry(r, len, 6, seg), mat);

  // lathe profile builder from [radius, y] pairs
  const lathe = (name, pts, mat, seg = 24) => {
    const v = pts.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y));
    return mesh(name, new THREE.LatheGeometry(v, seg), mat);
  };

  // ============================================================== ROOT / PELVIS
  // Gorilla is ~1.55 body-length nose-to-rump in knuckle stance; scale so total
  // forward extent is about 1 unit. Body length = 1 unit for stride math.
  const body = part('Body', 0, 0, 0);
  root.add(body);

  const pelvis = part('Pelvis', 0, 0.78, -0.30);
  body.add(pelvis);

  const hipMass = blob('PelvisMass', 0.30, 0.26, 0.28, furSilverMat, 24);
  hipMass.position.set(0, -0.02, -0.02);
  pelvis.add(hipMass);

  const rump = blob('Rump', 0.27, 0.23, 0.22, furSilverMat, 20);
  rump.position.set(0, -0.04, -0.22);
  pelvis.add(rump);

  const gut = blob('Belly', 0.34, 0.31, 0.36, furMat, 24);
  gut.position.set(0, -0.03, 0.20);
  pelvis.add(gut);

  // ================================================================== SPINE
  const spineLow = part('SpineLower', 0, 0.16, 0.12);
  pelvis.add(spineLow);
  const lumbar = blob('LumbarMass', 0.34, 0.30, 0.30, furSilverMat, 24);
  lumbar.position.set(0, 0.02, 0.06);
  spineLow.add(lumbar);

  const spineMid = part('SpineMid', 0, 0.10, 0.20);
  spineLow.add(spineMid);
  const ribs = blob('Ribcage', 0.40, 0.36, 0.40, furSilverMat, 26);
  ribs.position.set(0, 0.03, 0.08);
  ribs.geometry.translate(0, 0, 0);
  spineMid.add(ribs);

  const chestPatch = blob('ChestSkin', 0.26, 0.24, 0.10, skinMat, 20);
  chestPatch.position.set(0, 0.02, 0.34);
  chestPatch.scale.set(1, 1, 1);
  spineMid.add(chestPatch);

  // ================================================================== CHEST / SHOULDERS
  const chest = part('Chest', 0, 0.22, 0.10);
  spineMid.add(chest);

  const chestMass = blob('ChestMass', 0.46, 0.34, 0.36, furSilverMat, 28);
  chestMass.position.set(0, 0.00, 0.06);
  chest.add(chestMass);

  const trapL = blob('TrapLeft', 0.20, 0.18, 0.22, furSilverMat, 18);
  trapL.position.set(-0.24, 0.14, -0.02);
  chest.add(trapL);
  const trapR = blob('TrapRight', 0.20, 0.18, 0.22, furSilverMat, 18);
  trapR.position.set(0.24, 0.14, -0.02);
  chest.add(trapR);

  const nuchal = blob('NuchalCrestPad', 0.22, 0.20, 0.18, furSilverMat, 18);
  nuchal.position.set(0, 0.20, -0.10);
  chest.add(nuchal);

  // ================================================================== NECK / HEAD
  const neck = part('Neck', 0, 0.26, 0.06);
  chest.add(neck);
  const neckMass = caps('NeckMass', 0.19, 0.14, furSilverMat, 18);
  neckMass.rotation.x = Math.PI * 0.42;
  neckMass.position.set(0, 0.06, 0.02);
  neck.add(neckMass);

  const head = part('Head', 0, 0.17, 0.05);
  neck.add(head);

  // cranium + sagittal crest
  const cranium = blob('Cranium', 0.20, 0.21, 0.22, furMat, 26);
  cranium.position.set(0, 0.05, -0.02);
  head.add(cranium);

  const crestShape = new THREE.Shape();
  crestShape.moveTo(-0.20, 0);
  crestShape.quadraticCurveTo(-0.10, 0.115, 0.02, 0.10);
  crestShape.quadraticCurveTo(0.12, 0.085, 0.17, 0);
  crestShape.lineTo(-0.20, 0);
  const crestGeo = new THREE.ExtrudeGeometry(crestShape, {
    depth: 0.075, bevelEnabled: true, bevelSize: 0.028, bevelThickness: 0.028, bevelSegments: 4, curveSegments: 14
  });
  crestGeo.rotateY(Math.PI * 0.5);
  crestGeo.translate(-0.037, 0.16, -0.02);
  const crest = mesh('SagittalCrest', crestGeo, furMat);
  head.add(crest);

  const browRidge = blob('BrowRidge', 0.185, 0.055, 0.075, skinMat, 20);
  browRidge.position.set(0, 0.055, 0.155);
  head.add(browRidge);
  const browFur = blob('BrowFur', 0.19, 0.07, 0.07, furMat, 18);
  browFur.position.set(0, 0.10, 0.115);
  head.add(browFur);

  // muzzle: prognathic, its own pivot at the skull base so it can push forward
  const muzzle = part('Muzzle', 0, -0.035, 0.10);
  head.add(muzzle);
  const muzzleMass = lathe('MuzzleMass', [
    [0.00, -0.09], [0.075, -0.088], [0.115, -0.055], [0.135, -0.005],
    [0.132, 0.045], [0.108, 0.085], [0.060, 0.105], [0.00, 0.11]
  ], skinMat, 26);
  muzzleMass.rotation.x = Math.PI * 0.5;
  muzzleMass.scale.set(1.12, 1.0, 0.86);
  muzzleMass.position.set(0, 0.005, 0.055);
  muzzle.add(muzzleMass);

  const upperLip = blob('UpperLip', 0.115, 0.05, 0.065, skinMat, 18);
  upperLip.position.set(0, -0.028, 0.115);
  muzzle.add(upperLip);

  const nose = blob('Nose', 0.075, 0.045, 0.05, noseMat, 16);
  nose.position.set(0, 0.028, 0.135);
  muzzle.add(nose);
  const nostrilL = blob('NostrilLeft', 0.020, 0.016, 0.020, pupilMat, 10);
  nostrilL.position.set(-0.032, 0.016, 0.168);
  muzzle.add(nostrilL);
  const nostrilR = blob('NostrilRight', 0.020, 0.016, 0.020, pupilMat, 10);
  nostrilR.position.set(0.032, 0.016, 0.168);
  muzzle.add(nostrilR);

  // jaw pivots at the condyle, well back and up
  const jaw = part('Jaw', 0, 0.005, -0.035);
  muzzle.add(jaw);
  const jawMass = lathe('JawMass', [
    [0.00, -0.075], [0.070, -0.072], [0.105, -0.040], [0.120, 0.00],
    [0.112, 0.038], [0.070, 0.062], [0.00, 0.068]
  ], skinMat, 22);
  jawMass.rotation.x = Math.PI * 0.5;
  jawMass.scale.set(1.10, 1.0, 0.80);
  jawMass.position.set(0, -0.055, 0.085);
  jaw.add(jawMass);

  const lowerLip = blob('LowerLip', 0.10, 0.035, 0.05, skinMat, 16);
  lowerLip.position.set(0, -0.045, 0.145);
  jaw.add(lowerLip);

  const gumUpper = blob('GumUpper', 0.085, 0.028, 0.045, gumMat, 14);
  gumUpper.position.set(0, -0.055, 0.115);
  muzzle.add(gumUpper);
  const gumLower = blob('GumLower', 0.078, 0.026, 0.042, gumMat, 14);
  gumLower.position.set(0, -0.028, 0.118);
  jaw.add(gumLower);

  const teethTop = part('TeethUpper', 0, -0.062, 0.118);
  muzzle.add(teethTop);
  const teethBot = part('TeethLower', 0, -0.020, 0.120);
  jaw.add(teethBot);
  for (let i = -2; i <= 2; i++) {
    const s = Math.abs(i) === 2 ? 1.0 : 0.55;
    const isCanine = Math.abs(i) === 2;
    const tGeo = new THREE.ConeGeometry(isCanine ? 0.019 : 0.014, isCanine ? 0.062 : 0.030, 8);
    const tU = mesh('ToothUpper' + (i + 3), tGeo, teethMat);
    tU.position.set(i * 0.030, -0.020 * s, 0.008 - Math.abs(i) * 0.011);
    tU.rotation.x = Math.PI;
    teethTop.add(tU);
    const tL = mesh('ToothLower' + (i + 3), tGeo.clone(), teethMat);
    tL.position.set(i * 0.029, 0.014 * s, 0.006 - Math.abs(i) * 0.011);
    tL.scale.setScalar(0.8);
    teethBot.add(tL);
  }

  // eyes
  const mkEye = (side) => {
    const g = part('Eye' + side, side === 'Left' ? -0.083 : 0.083, 0.028, 0.152);
    const w = blob('EyeBall' + side, 0.032, 0.030, 0.030, eyeWhiteMat, 16);
    g.add(w);
    const iris = blob('Iris' + side, 0.020, 0.020, 0.012, irisMat, 14);
    iris.position.set(0, 0, 0.021);
    g.add(iris);
    const pup = blob('Pupil' + side, 0.010, 0.010, 0.008, pupilMat, 12);
    pup.position.set(0, 0, 0.028);
    g.add(pup);
    const lid = part('EyelidUpper' + side, 0, 0, 0);
    const lidM = blob('EyelidMesh' + side, 0.036, 0.034, 0.032, skinMat, 16);
    lidM.position.set(0, 0.030, 0.002);
    lid.add(lidM);
    g.add(lid);
    return g;
  };
  const eyeL = mkEye('Left'); head.add(eyeL);
  const eyeR = mkEye('Right'); head.add(eyeR);

  const earL = part('EarLeft', -0.185, 0.045, -0.045);
  const earLM = blob('EarLeftMesh', 0.018, 0.045, 0.035, skinMat, 14);
  earLM.rotation.y = -0.4; earL.add(earLM); head.add(earL);
  const earR = part('EarRight', 0.185, 0.045, -0.045);
  const earRM = blob('EarRightMesh', 0.018, 0.045, 0.035, skinMat, 14);
  earRM.rotation.y = 0.4; earR.add(earRM); head.add(earR);

  // ================================================================== ARMS
  // Gorilla arm: long, reaching past the knee; knuckle-walking hand.
  const mkArm = (side) => {
    const sgn = side === 'Left' ? -1 : 1;
    const shoulder = part('Shoulder' + side, sgn * 0.40, 0.06, 0.02);
    chest.add(shoulder);

    const delt = blob('Deltoid' + side, 0.20, 0.20, 0.20, furSilverMat, 20);
    delt.position.set(sgn * 0.03, 0.02, 0.0);
    shoulder.add(delt);

    const upper = part('UpperArm' + side, 0, -0.03, 0);
    shoulder.add(upper);
    const upperM = caps('UpperArmMesh' + side, 0.135, 0.28, furMat, 18);
    upperM.position.set(0, -0.17, 0);
    upper.add(upperM);
    const bicep = blob('Bicep' + side, 0.145, 0.15, 0.145, furMat, 16);
    bicep.position.set(0, -0.14, 0.03);
    upper.add(bicep);

    const elbow = part('Elbow' + side, 0, -0.36, 0);
    upper.add(elbow);
    const fore = part('Forearm' + side, 0, 0, 0);
    elbow.add(fore);
    const foreM = caps('ForearmMesh' + side, 0.115, 0.26, furMat, 18);
    foreM.position.set(0, -0.16, 0);
    fore.add(foreM);
    const foreBulk = blob('ForearmFlexor' + side, 0.135, 0.14, 0.13, furMat, 16);
    foreBulk.position.set(0, -0.08, 0.015);
    fore.add(foreBulk);

    const wrist = part('Wrist' + side, 0, -0.33, 0);
    fore.add(wrist);

    const hand = part('Hand' + side, 0, 0, 0);
    wrist.add(hand);
    const palm = blob('Palm' + side, 0.105, 0.055, 0.115, skinMat, 18);
    palm.position.set(0, -0.055, 0.01);
    hand.add(palm);
    const backHand = blob('HandBack' + side, 0.105, 0.045, 0.11, furMat, 16);
    backHand.position.set(0, -0.020, 0.005);
    hand.add(backHand);

    // knuckles fold under: fingers are curled so the middle phalanges bear weight
    const fingers = [];
    for (let i = 0; i < 4; i++) {
      const fx = (i - 1.5) * 0.052;
      const fName = 'Finger' + side + i;
      const f = part(fName, fx, -0.075, 0.075);
      hand.add(f);
      const p1 = caps(fName + 'P1', 0.026, 0.055, skinMat, 10);
      p1.rotation.x = Math.PI * 0.5;
      p1.position.set(0, 0, 0.030);
      f.add(p1);
      const knuck = part(fName + 'Knuckle', 0, 0, 0.062);
      f.add(knuck);
      const p2 = caps(fName + 'P2', 0.024, 0.05, skinMat, 10);
      p2.position.set(0, -0.033, 0);
      knuck.add(p2);
      const tip = part(fName + 'Tip', 0, -0.062, 0);
      knuck.add(tip);
      const p3 = caps(fName + 'P3', 0.021, 0.030, skinMat, 10);
      p3.rotation.x = -Math.PI * 0.35;
      p3.position.set(0, -0.018, -0.014);
      tip.add(p3);
      const nl = mesh(fName + 'Nail', new THREE.SphereGeometry(0.016, 8, 6), nailMat);
      nl.scale.set(1, 0.5, 0.7);
      nl.position.set(0, -0.036, -0.024);
      tip.add(nl);
      // rest curl: knuckle-walking fold
      f.rotation.x = -0.55;
      knuck.rotation.x = 1.95;
      tip.rotation.x = 0.85;
      fingers.push({ f, knuck, tip });
    }
    const thumb = part('Thumb' + side, sgn * 0.095, -0.055, 0.030);
    hand.add(thumb);
    const th1 = caps('Thumb' + side + 'P1', 0.026, 0.042, skinMat, 10);
    th1.rotation.z = sgn * -0.5;
    th1.position.set(sgn * 0.014, -0.025, 0);
    thumb.add(th1);
    const thTip = part('Thumb' + side + 'Tip', sgn * 0.026, -0.048, 0.006);
    thumb.add(thTip);
    const th2 = caps('Thumb' + side + 'P2', 0.022, 0.032, skinMat, 10);
    th2.rotation.x = Math.PI * 0.45;
    th2.position.set(0, -0.006, 0.018);
    thTip.add(th2);
    thumb.rotation.x = -0.25;
    thumb.rotation.z = sgn * 0.35;

    return { shoulder, delt, upper, elbow, fore, wrist, hand, fingers, thumb, thTip };
  };
  const armL = mkArm('Left');
  const armR = mkArm('Right');

  // ================================================================== LEGS
  // Short, thick, heavily flexed. Foot is plantigrade with a divergent hallux.
  const mkLeg = (side) => {
    const sgn = side === 'Left' ? -1 : 1;
    const hip = part('Hip' + side, sgn * 0.235, -0.055, 0.01);
    pelvis.add(hip);

    const glute = blob('Glute' + side, 0.185, 0.175, 0.185, furMat, 18);
    glute.position.set(sgn * 0.02, 0.01, -0.05);
    hip.add(glute);

    const thigh = part('Thigh' + side, 0, 0, 0);
    hip.add(thigh);
    const thighM = caps('ThighMesh' + side, 0.155, 0.22, furMat, 18);
    thighM.position.set(0, -0.15, 0);
    thigh.add(thighM);
    const quad = blob('Quad' + side, 0.165, 0.17, 0.175, furMat, 16);
    quad.position.set(0, -0.12, 0.03);
    thigh.add(quad);

    const knee = part('Knee' + side, 0, -0.31, 0);
    thigh.add(knee);
    const shin = part('Shin' + side, 0, 0, 0);
    knee.add(shin);
    const shinM = caps('ShinMesh' + side, 0.115, 0.18, furMat, 16);
    shinM.position.set(0, -0.12, 0);
    shin.add(shinM);
    const calf = blob('Calf' + side, 0.125, 0.13, 0.125, furMat, 16);
    calf.position.set(0, -0.09, -0.035);
    shin.add(calf);

    const ankle = part('Ankle' + side, 0, -0.27, 0.005);
    shin.add(ankle);
    const foot = part('Foot' + side, 0, 0, 0);
    ankle.add(foot);
    const heel = blob('Heel' + side, 0.075, 0.06, 0.075, skinMat, 14);
    heel.position.set(0, -0.045, -0.045);
    foot.add(heel);
    const sole = blob('Sole' + side, 0.095, 0.048, 0.12, skinMat, 18);
    sole.position.set(0, -0.045, 0.055);
    foot.add(sole);
    const footTop = blob('FootTop' + side, 0.095, 0.055, 0.115, furMat, 16);
    footTop.position.set(0, -0.012, 0.045);
    foot.add(footTop);

    const toes = [];
    const ball = part('Toes' + side, 0, -0.045, 0.145);
    foot.add(ball);
    for (let i = 0; i < 4; i++) {
      const tx = (i - 1.5) * 0.040 + sgn * -0.012;
      const t = part('Toe' + side + i, tx, 0, 0);
      ball.add(t);
      const tm = caps('Toe' + side + i + 'Mesh', 0.021, 0.030, skinMat, 8);
      tm.rotation.x = Math.PI * 0.5;
      tm.position.set(0, 0, 0.018);
      t.add(tm);
      const tn = mesh('ToeNail' + side + i, new THREE.SphereGeometry(0.014, 8, 6), nailMat);
      tn.scale.set(1, 0.55, 0.6);
      tn.position.set(0, 0.014, 0.036);
      t.add(tn);
      toes.push(t);
    }
    // hallux — big, thumb-like, splayed sideways
    const hallux = part('Hallux' + side, sgn * 0.088, -0.048, 0.055);
    foot.add(hallux);
    const hm = caps('HalluxMesh' + side, 0.032, 0.045, skinMat, 10);
    hm.rotation.x = Math.PI * 0.5;
    hm.position.set(0, 0, 0.026);
    hallux.add(hm);
    const hn = mesh('HalluxNail' + side, new THREE.SphereGeometry(0.020, 8, 6), nailMat);
    hn.scale.set(1, 0.55, 0.6);
    hn.position.set(0, 0.018, 0.052);
    hallux.add(hn);
    hallux.rotation.y = sgn * 0.55;

    return { hip, thigh, knee, shin, ankle, foot, ball, toes, hallux };
  };
  const legL = mkLeg('Left');
  const legR = mkLeg('Right');

  // vestigial tail-less rump tuft (fur clump), kept as a named part
  const rumpTuft = part('RumpTuft', 0, -0.10, -0.38);
  const rumpTuftM = blob('RumpTuftMesh', 0.13, 0.10, 0.09, furMat, 14);
  pelvis.add(rumpTuft);
  rumpTuft.add(rumpTuftM);

  // ============================================================ REST POSE CACHE
  // Rest = knuckle stance. Arms hang forward-down, legs crouched under the hips.
  const REST = {
    bodyY: 0,
    shoulderX: -0.10,
    elbow: 0.30,
    wrist: -0.55,
    hipX: 0.55,
    knee: -1.05,
    ankle: 0.52
  };

  // apply the standing skeleton once so the model reads correctly before posing
  const applyRest = () => {
    armL.shoulder.rotation.set(REST.shoulderX, 0, 0.16);
    armR.shoulder.rotation.set(REST.shoulderX, 0, -0.16);
    armL.elbow.rotation.set(REST.elbow, 0, 0);
    armR.elbow.rotation.set(REST.elbow, 0, 0);
    armL.wrist.rotation.set(REST.wrist, 0, 0);
    armR.wrist.rotation.set(REST.wrist, 0, 0);
    legL.hip.rotation.set(REST.hipX, 0, 0.12);
    legR.hip.rotation.set(REST.hipX, 0, -0.12);
    legL.knee.rotation.set(REST.knee, 0, 0);
    legR.knee.rotation.set(REST.knee, 0, 0);
    legL.ankle.rotation.set(REST.ankle, 0, 0);
    legR.ankle.rotation.set(REST.ankle, 0, 0);
  };
  applyRest();

  // Lower the whole body so the knuckles and soles sit near y=0.
  // Knuckle at rest: shoulder world y ≈ 0.78+0.16+0.10+0.22+0.06 ≈ 1.32 ; arm reach ≈ 0.75
  body.position.y = -0.58;

  // ================================================================== POSE
  const TAU = Math.PI * 2;
  const clampf = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  // eased 0→1→0 bump
  const bump = (t) => Math.sin(clampf(t, 0, 1) * Math.PI);

  root.userData.pose = (s) => {
    const t = s.t || 0;
    const speed = Math.max(0, s.speed || 0);
    const stride = ((s.stride || 0) % 1 + 1) % 1;
    const turn = clampf(s.turn || 0, -1, 1);
    const grounded = s.grounded !== false;
    const health = s.health === undefined ? 1 : clampf(s.health, 0, 1);
    const action = s.action || null;
    const phase = clampf(s.phase || 0, 0, 1);
    const hurt = 1 - health;

    // ---------------------------------------------------- gait shaping by speed
    // 0        idle knuckle stance
    // 0.5      stalk / creep: lower, gathered, long slow reach
    // 1        walk
    // 2        GAIT CHANGE: lateral-sequence walk → diagonal gallop-ish bound
    // 3        run: arms swing wide, hips drive, suspension
    // 6        sprint: body long and flat, head down in line with spine
    const sp = speed;
    const wWalk = clampf(sp / 1.0, 0, 1);                 // 0→1 by walk
    const wRun = clampf((sp - 1.6) / 1.4, 0, 1);          // gait change at 2
    const wSprint = clampf((sp - 3.0) / 3.0, 0, 1);       // top end
    const creep = clampf(1 - Math.abs(sp - 0.5) / 0.5, 0, 1) * (sp < 1 ? 1 : 0);
    const moving = clampf(sp / 0.35, 0, 1);

    // breathing / idle
    const breath = Math.sin(t * 1.35) * 0.5 + Math.sin(t * 0.61 + 1.1) * 0.22;
    const idleAmt = (1 - moving);
    const sway = Math.sin(t * 0.44) * idleAmt;
    const scan = Math.sin(t * 0.31 + 0.7) * idleAmt;

    // cycle phases: gorilla knuckle-walk is lateral-sequence but at speed becomes
    // a bounding gallop where both hands land near-together then both feet.
    const ph = stride * TAU;
    const bound = wRun; // 0 = walk (diagonal alternation), 1 = bound (paired)

    // limb phase offsets
    const phFL = ph;                                    // front-left hand
    const phFR = ph + Math.PI * lerp(1.0, 0.16, bound); // front-right
    const phHL = ph + Math.PI * lerp(0.5, 0.55, bound); // hind-left
    const phHR = ph + Math.PI * lerp(1.5, 0.71, bound); // hind-right

    // amplitudes
    const armSwing = lerp(0.34, 1.05, wWalk) * lerp(1, 1.55, wRun) * lerp(1, 1.22, wSprint) * lerp(1, 0.72, creep);
    const legSwing = lerp(0.28, 0.85, wWalk) * lerp(1, 1.5, wRun) * lerp(1, 1.25, wSprint) * lerp(1, 0.68, creep);
    const lift = lerp(0.10, 0.40, wWalk) * lerp(1, 1.6, wRun) * lerp(1, 1.15, wSprint);

    // vertical bob: two per cycle at a walk, one big at a bound
    const bobWalk = Math.cos(ph * 2) * 0.022 * wWalk;
    const bobBound = Math.sin(ph + 0.6) * 0.075 * bound;
    const bob = lerp(bobWalk, bobBound, bound) * (1 - creep * 0.4);

    // stance height: crouch when creeping, extend when sprinting
    const crouch = -0.055 * creep + 0.045 * wSprint - 0.03 * hurt;

    // -------------------------------------------------------- accumulators
    // Every write below starts from the rest pose. Nothing accumulates.
    let bodyY = 0, bodyZ = 0, bodyPitch = 0, bodyRoll = 0, bodyYaw = 0;
    let pelvPitch = 0, pelvRoll = 0, pelvYaw = 0, pelvY = 0, pelvZ = 0;
    let spLowX = 0, spLowY = 0, spLowZ = 0;
    let spMidX = 0, spMidY = 0, spMidZ = 0;
    let chestX = 0, chestY = 0, chestZ = 0;
    let neckX = 0, neckY = 0, neckZ = 0;
    let headX = 0, headY = 0, headZ = 0;
    let jawX = 0, muzzleX = 0;
    let lidL = 0, lidR = 0;
    let eyeYaw = 0, eyePitch = 0;
    let bodyScaleY = 1, bodyScaleXZ = 1;

    const A = {
      L: { shX: 0, shY: 0, shZ: 0, el: 0, elY: 0, wr: 0, wrY: 0, wrZ: 0, curl: 0, spread: 0 },
      R: { shX: 0, shY: 0, shZ: 0, el: 0, elY: 0, wr: 0, wrY: 0, wrZ: 0, curl: 0, spread: 0 }
    };
    const L = {
      L: { hpX: 0, hpY: 0, hpZ: 0, kn: 0, an: 0, anZ: 0, toe: 0, hal: 0 },
      R: { hpX: 0, hpY: 0, hpZ: 0, kn: 0, an: 0, anZ: 0, toe: 0, hal: 0 }
    };

    // ============================================== LOCOMOTION (base layer)
    const legCycle = (o, phase0, sgn) => {
      const sw = Math.sin(phase0);
      const li = Math.max(0, Math.sin(phase0 + Math.PI * 0.35));
      // stance vs swing: contact around phase0 ≈ -PI/2
      const contact = Math.max(0, -Math.sin(phase0));
      o.hpX = sw * legSwing * 0.55 - 0.10 * wSprint - 0.16 * creep;
      o.kn = -Math.pow(li, 1.6) * legSwing * 0.95 - 0.30 * creep + 0.10 * contact * wRun;
      o.an = li * 0.55 * legSwing + contact * 0.22 + 0.18 * creep;
      o.toe = -contact * 0.55 * lerp(0.5, 1.2, wWalk) + li * 0.25;
      o.hal = -contact * 0.3;
      o.hpZ = sgn * (0.05 + 0.10 * wRun) * Math.max(0, sw);
    };
    const armCycle = (o, phase0, sgn) => {
      const sw = Math.sin(phase0);
      const li = Math.max(0, Math.sin(phase0 + Math.PI * 0.35));
      const contact = Math.max(0, -Math.sin(phase0));
      o.shX = sw * armSwing * 0.60;
      o.shZ = sgn * (0.05 + 0.14 * li * lift);
      o.el = 0.16 + li * armSwing * 0.55 + contact * 0.06;
      o.wr = -li * 0.30 + contact * 0.22 - 0.10 * wSprint;
      o.curl = contact * 0.28;             // knuckles tighten on weight-bearing
      o.wrZ = sgn * 0.05;
    };
    legCycle(L.L, phHL, -1);
    legCycle(L.R, phHR, 1);
    armCycle(A.L, phFL, -1);
    armCycle(A.R, phFR, 1);

    // scale the whole locomotion layer by how much it is actually moving
    const gm = moving;
    for (const k of ['L', 'R']) {
      const sgn = k === 'L' ? -1 : 1;
      const a = A[k], l = L[k];
      a.shX *= gm; a.shZ *= gm; a.el *= gm; a.wr *= gm; a.curl *= gm; a.wrZ *= gm;
      l.hpX *= gm; l.kn *= gm; l.an *= gm; l.toe *= gm; l.hal *= gm; l.hpZ *= gm;
    }

    // spine mechanics with speed
    bodyY += bob + crouch;
    // gorilla trunk pitches nose-down more as it speeds up
    spLowX += lerp(0.0, -0.10, wWalk) - 0.10 * wSprint + 0.06 * creep;
    spMidX += lerp(0.0, -0.08, wWalk) - 0.14 * wSprint + 0.08 * creep;
    chestX += -0.05 * wRun - 0.10 * wSprint;
    // bound flexion/extension of the back
    const flex = Math.sin(ph * lerp(2, 1, bound) + 0.9) * lerp(0.03, 0.16, bound) * moving;
    spLowX += flex;
    spMidX += flex * 0.7;
    // shoulder girdle roll against hips
    const girdle = Math.sin(ph) * lerp(0.05, 0.16, wRun) * moving * (1 - bound * 0.55);
    pelvRoll += girdle;
    chestZ += -girdle * 0.8;
    pelvYaw += Math.sin(ph) * 0.10 * moving * (1 - bound * 0.7);
    chestY += -Math.sin(ph) * 0.09 * moving * (1 - bound * 0.7);

    // head: rides level at a walk, drops in line with the spine at a sprint
    neckX += 0.10 * wWalk - 0.34 * wSprint - 0.10 * wRun + 0.12 * creep;
    headX += -0.05 * wWalk + 0.20 * wSprint * 0.4 - 0.10 * creep;
    headX += Math.sin(ph * 2 + 0.4) * 0.045 * moving;
    neckY += Math.sin(ph) * 0.05 * moving;

    // idle life at rest
    bodyY += breath * 0.008 * idleAmt;
    chestX += breath * 0.018 * idleAmt;
    bodyScaleXZ = 1 + breath * 0.012 * idleAmt;
    spMidX += Math.sin(t * 0.5) * 0.02 * idleAmt;
    pelvRoll += sway * 0.05;
    chestZ += -sway * 0.04;
    neckY += scan * 0.30;
    headY += scan * 0.22;
    headX += Math.sin(t * 0.9 + 2.0) * 0.05 * idleAmt;
    eyeYaw += scan * 0.25;
    A.L.shX += sway * 0.06 * idleAmt; A.R.shX += -sway * 0.06 * idleAmt;
    A.L.el += Math.sin(t * 0.7) * 0.05 * idleAmt;
    A.R.el += Math.sin(t * 0.7 + 1.3) * 0.05 * idleAmt;
    // slow blink
    const blinkT = (t * 0.55) % 1;
    const blink = blinkT > 0.94 ? Math.sin((blinkT - 0.94) / 0.06 * Math.PI) : 0;
    lidL += blink; lidR += blink;
    jawX += Math.sin(t * 0.4) * 0.02 * idleAmt;

    // ============================================== OVERLAY: turn
    if (Math.abs(turn) > 0.001) {
      const tn = turn;
      // bank and lead with the head; the game yaws the body itself
      spLowZ += tn * 0.16;
      spMidZ += tn * 0.14;
      chestZ += tn * 0.10;
      pelvRoll += tn * 0.10;
      neckY += -tn * 0.42;
      headY += -tn * 0.30;
      headZ += tn * 0.14;
      eyeYaw += -tn * 0.5;
      // inside limbs shorten, outside limbs reach
      const inside = tn < 0 ? 'L' : 'R';
      const outside = tn < 0 ? 'R' : 'L';
      const m = Math.abs(tn);
      L[inside].kn += -0.28 * m; L[inside].hpX += 0.16 * m; L[inside].an += 0.12 * m;
      L[outside].hpX += -0.16 * m; L[outside].kn += 0.10 * m;
      A[inside].shX += 0.24 * m; A[inside].el += 0.20 * m;
      A[outside].shX += -0.26 * m; A[outside].el += -0.08 * m;
      A[inside].shZ += -tn * 0.14; A[outside].shZ += -tn * 0.20;
      L.L.hpZ += tn * 0.10; L.R.hpZ += tn * 0.10;
    }

    // ============================================== OVERLAY: airborne
    if (!grounded) {
      const air = 1;
      // legs stop walking: tuck, then reach as it comes down (use t for hang feel)
      const tuck = 0.5 + 0.5 * Math.sin(t * 4.0);
      for (const k of ['L', 'R']) {
        const l = L[k], a = A[k];
        // wipe the walking cycle out of the limbs
        l.hpX = lerp(l.hpX, -0.55 - 0.35 * tuck, air);
        l.kn = lerp(l.kn, -1.05 - 0.55 * tuck, air);
        l.an = lerp(l.an, 0.35 + 0.25 * tuck, air);
        l.toe = lerp(l.toe, 0.25, air);
        l.hal = lerp(l.hal, 0.2, air);
        a.shX = lerp(a.shX, -0.85 - 0.30 * tuck, air);
        a.el = lerp(a.el, 0.55 + 0.45 * tuck, air);
        a.wr = lerp(a.wr, -0.25, air);
        a.curl = lerp(a.curl, 0.55, air);
      }
      A.L.shZ = 0.55; A.R.shZ = -0.55;
      L.L.hpZ = 0.16; L.R.hpZ = -0.16;
      bodyY += 0.03;
      spLowX += -0.14; spMidX += -0.10;
      neckX += 0.16; headX += 0.10;
      lidL += 0.3; lidR += 0.3;
      jawX += 0.10;
    }

    // ============================================== OVERLAY: hurt
    if (hurt > 0.01) {
      const h = hurt;
      // favour the left side: right shoulder drops, left arm guards the ribs
      bodyY += -0.075 * h;
      spLowZ += 0.14 * h;
      spMidZ += 0.10 * h;
      chestZ += 0.13 * h;
      chestX += 0.16 * h;
      neckX += 0.24 * h;
      headX += 0.22 * h;
      headZ += 0.10 * h;
      lidL += 0.45 * h; lidR += 0.55 * h;
      jawX += 0.10 * h;
      A.R.shX += 0.30 * h; A.R.el += 0.35 * h; A.R.shZ += -0.10 * h; A.R.curl += 0.3 * h;
      A.L.shX += -0.10 * h; A.L.el += 0.15 * h;
      L.R.hpX += 0.22 * h; L.R.kn += -0.30 * h; L.R.an += 0.12 * h;
      L.L.kn += -0.10 * h;
      // tremor
      const tr = Math.sin(t * 11.0) * 0.012 * h;
      A.R.el += tr; L.R.kn += tr; headX += tr * 0.6;
    }

    // ============================================== ACTIONS
    if (action) {
      const p = phase;
      const wipeLegs = (amt) => {
        for (const k of ['L', 'R']) {
          const l = L[k];
          l.hpX *= (1 - amt); l.kn *= (1 - amt); l.an *= (1 - amt);
          l.toe *= (1 - amt); l.hal *= (1 - amt); l.hpZ *= (1 - amt);
        }
      };
      const wipeArms = (amt) => {
        for (const k of ['L', 'R']) {
          const a = A[k];
          a.shX *= (1 - amt); a.shZ *= (1 - amt); a.el *= (1 - amt);
          a.wr *= (1 - amt); a.curl *= (1 - amt);
        }
      };

      if (action === 'attack') {
        // rear up onto the hind legs, wind the right arm back, hammer down
        const w = smooth(clampf(p / 0.34, 0, 1));            // wind-up
        const c = smooth(clampf((p - 0.32) / 0.20, 0, 1));   // commit
        const r = smooth(clampf((p - 0.60) / 0.40, 0, 1));   // recover
        const act = (1 - r);
        wipeArms(0.9 * act); wipeLegs(0.55 * act);
        const rear = (w * 0.75 + c * 0.35) * act;
        bodyY += rear * 0.16;
        spLowX += rear * 0.30 - c * 0.55 * act;
        spMidX += rear * 0.26 - c * 0.60 * act;
        chestX += rear * 0.20 - c * 0.45 * act;
        pelvYaw += (-w * 0.30 + c * 0.45) * act;
        chestY += (w * 0.55 - c * 0.85) * act;
        neckY += (w * 0.30 - c * 0.45) * act;
        headX += (-w * 0.30 + c * 0.55) * act;
        jawX += (w * 0.55 + (1 - c) * 0.2) * act * (1 - r);
        lidL += -0.4 * act; lidR += -0.4 * act;
        // striking arm (right)
        A.R.shX += (-2.05 * w + 1.85 * c) * act;
        A.R.shZ += (-0.60 * w + 0.30 * c) * act;
        A.R.shY += (0.35 * w - 0.55 * c) * act;
        A.R.el += (1.35 * w - 1.15 * c) * act;
        A.R.wr += (-0.5 * w + 0.75 * c) * act;
        A.R.curl += (0.5 * w + 0.9 * c) * act;
        // support arm plants
        A.L.shX += (-0.35 * w - 0.10 * c) * act;
        A.L.el += (0.55 * w + 0.25 * c) * act;
        A.L.shZ += -0.30 * act;
        A.L.curl += 0.55 * act;
        // legs brace and drive
        L.L.hpX += (0.45 * w - 0.20 * c) * act;
        L.R.hpX += (0.30 * w - 0.35 * c) * act;
        L.L.kn += (-0.55 * w + 0.30 * c) * act;
        L.R.kn += (-0.40 * w + 0.35 * c) * act;
        L.L.an += (0.25 * w) * act; L.R.an += (0.25 * w) * act;
      }

      else if (action === 'fire') {
        // gorillas throw: gather, cock the arm high behind, whip, follow through
        const g = smooth(clampf(p / 0.30, 0, 1));
        const c = smooth(clampf((p - 0.28) / 0.16, 0, 1));   // cock/steady
        const rel = smooth(clampf((p - 0.44) / 0.14, 0, 1)); // release
        const rec = smooth(clampf((p - 0.62) / 0.38, 0, 1)); // recoil absorb
        const act = 1 - rec;
        wipeArms(0.9 * act); wipeLegs(0.4 * act);
        // planted, steady body — it does not travel
        bodyY += (-0.05 * g + 0.06 * c) * act;
        spLowX += (0.10 * g - 0.12 * rel) * act;
        spMidX += (0.14 * c - 0.30 * rel) * act;
        chestY += (0.55 * c - 0.80 * rel) * act;
        pelvYaw += (0.25 * c - 0.35 * rel) * act;
        neckY += (-0.28 * c + 0.10 * rel) * act;   // eyes stay on target
        headX += (-0.12 * c + 0.14 * rel) * act;
        eyeYaw += -0.2 * act;
        lidL += 0.35 * c * act; lidR += 0.15 * c * act;
        // throwing arm — right
        A.R.shX += (-1.20 * g - 1.05 * c + 2.60 * rel) * act;
        A.R.shZ += (-0.50 * g - 0.35 * c + 0.55 * rel) * act;
        A.R.shY += (-0.30 * c + 0.45 * rel) * act;
        A.R.el += (1.20 * g + 0.85 * c - 1.70 * rel) * act;
        A.R.wr += (-0.35 * c + 0.85 * rel) * act;
        A.R.curl += (0.85 * g + 0.85 * c - 1.0 * rel) * act;
        // off arm points/steadies forward
        A.L.shX += (-0.85 * c - 0.20 * g + 0.45 * rel) * act;
        A.L.el += (0.35 * c + 0.20 * rel) * act;
        A.L.shZ += 0.25 * act;
        A.L.curl += 0.15 * act;
        // recoil settle
        chestX += rec * 0.0;
        L.R.hpX += (0.25 * c - 0.20 * rel) * act;
        L.L.hpX += (-0.15 * c + 0.25 * rel) * act;
        L.R.kn += (-0.30 * c + 0.10 * rel) * act;
        L.L.kn += (-0.10 * c - 0.15 * rel) * act;
      }

      else if (action === 'hit') {
        // sharp flinch away from the front-right, then settle. Reads fast.
        const k = Math.exp(-p * 6.0);
        const jolt = Math.sin(p * Math.PI * 3.4) * k;
        const imp = Math.exp(-Math.pow((p - 0.10) / 0.10, 2));
        bodyY += -0.09 * imp;
        bodyZ = -0.055 * imp;
        spLowX += 0.30 * imp + jolt * 0.05;
        spMidX += 0.34 * imp + jolt * 0.06;
        chestZ += 0.30 * imp;
        chestY += 0.28 * imp;
        pelvRoll += 0.16 * imp;
        neckX += 0.55 * imp + jolt * 0.10;
        headX += 0.35 * imp;
        headZ += 0.30 * imp;
        headY += 0.25 * imp;
        jawX += 0.55 * imp;
        lidL += 0.85 * imp; lidR += 0.9 * imp;
        A.L.shX += 0.55 * imp; A.L.el += 0.45 * imp; A.L.shZ += -0.25 * imp;
        A.R.shX += -0.30 * imp; A.R.el += 0.75 * imp; A.R.shZ += 0.30 * imp;
        A.L.curl += 0.6 * imp; A.R.curl += 0.6 * imp;
        L.L.kn += -0.30 * imp; L.R.kn += -0.22 * imp;
        L.L.hpX += 0.18 * imp; L.R.hpX += 0.12 * imp;
      }

      else if (action === 'block') {
        // weight back and down, both massive forearms up and crossed in front,
        // the great shoulder mass turned toward the threat, head tucked behind.
        const on = smooth(clampf(p / 0.22, 0, 1));
        const hold = clampf((p - 0.20) / 0.55, 0, 1);
        const off = smooth(clampf((p - 0.78) / 0.22, 0, 1));
        const b = on * (1 - off);
        wipeArms(0.95 * b); wipeLegs(0.7 * b);
        const brace = Math.sin(t * 13.0) * 0.012 * hold * (1 - off);
        bodyY += -0.16 * b;
        bodyZ = -0.07 * b;
        spLowX += 0.30 * b;
        spMidX += 0.26 * b;
        chestX += 0.20 * b;
        pelvPitch += 0.10 * b;
        neckX += 0.45 * b;
        headX += 0.30 * b;
        lidL += 0.55 * b; lidR += 0.55 * b;
        // forearms up, crossed
        A.L.shX += (-1.55 - brace) * b; A.L.el += (2.00 + brace) * b;
        A.R.shX += (-1.55 + brace) * b; A.R.el += (2.00 - brace) * b;
        A.L.shZ += 0.55 * b; A.R.shZ += -0.55 * b;
        A.L.shY += -0.45 * b; A.R.shY += 0.45 * b;
        A.L.wr += -0.55 * b; A.R.wr += -0.55 * b;
        A.L.curl += 0.85 * b; A.R.curl += 0.85 * b;
        L.L.hpX += 0.55 * b; L.R.hpX += 0.55 * b;
        L.L.kn += -0.55 * b; L.R.kn += -0.55 * b;
        L.L.an += 0.30 * b; L.R.an += 0.30 * b;
        L.L.hpZ += 0.18 * b; L.R.hpZ += -0.18 * b;
      }

      else if (action === 'gather') {
        // reach down with the right hand, close the fingers, come back up with it
        const down = smooth(clampf(p / 0.32, 0, 1));
        const grip = smooth(clampf((p - 0.34) / 0.16, 0, 1));
        const up = smooth(clampf((p - 0.55) / 0.45, 0, 1));
        const low = down * (1 - up);
        const hold = grip;
        wipeArms(0.9 * Math.max(low, up * 0.7));
        wipeLegs(0.6 * low);
        bodyY += -0.22 * low - 0.03 * up;
        spLowX += 0.55 * low;
        spMidX += 0.45 * low;
        chestX += 0.30 * low - 0.10 * up * (1 - low);
        neckX += 0.55 * low - 0.20 * up * (1 - low);
        headX += 0.42 * low;
        lidL += 0.3 * low; lidR += 0.3 * low;
        eyePitch += 0.4 * low;
        // right arm reaches the ground then lifts to the chest
        A.R.shX += (0.55 * down - 1.15 * up);
        A.R.el += (0.10 * down + 1.55 * up + 0.35 * hold);
        A.R.shZ += -0.20 * down + 0.30 * up;
        A.R.wr += (-0.30 * down + 0.55 * up);
        A.R.curl += hold * 1.15;
        A.R.spread += (1 - hold) * down * 0.6;
        // left arm braces on the ground
        A.L.shX += 0.35 * low;
        A.L.el += 0.20 * low;
        A.L.curl += 0.55 * low;
        L.L.hpX += 0.55 * low; L.R.hpX += 0.50 * low;
        L.L.kn += -0.60 * low; L.R.kn += -0.55 * low;
        L.L.an += 0.35 * low; L.R.an += 0.30 * low;
        jawX += 0.06 * low;
      }

      else if (action === 'deposit') {
        // reverse of gather, slower: hold it, lower carefully, open, withdraw
        const start = smooth(clampf(p / 0.18, 0, 1));
        const down = smooth(clampf((p - 0.15) / 0.42, 0, 1));
        const open = smooth(clampf((p - 0.58) / 0.16, 0, 1));
        const back = smooth(clampf((p - 0.74) / 0.26, 0, 1));
        const low = down * (1 - back);
        wipeArms(0.9);
        wipeLegs(0.6 * low);
        bodyY += -0.20 * low;
        spLowX += 0.50 * low;
        spMidX += 0.42 * low;
        chestX += 0.28 * low;
        neckX += 0.50 * low;
        headX += 0.40 * low;
        eyePitch += 0.42 * low;
        lidL += 0.25 * low; lidR += 0.25 * low;
        A.R.shX += (-1.10 * start + 1.55 * down - 0.90 * back);
        A.R.el += (1.55 * start - 1.30 * down + 0.55 * back);
        A.R.shZ += 0.25 * start - 0.35 * down;
        A.R.wr += (0.45 * start - 0.65 * down);
        A.R.curl += (1.15 * start) * (1 - open);
        A.R.spread += open * 0.75 * (1 - back);
        A.L.shX += 0.30 * low;
        A.L.el += 0.20 * low;
        A.L.curl += 0.55 * low;
        L.L.hpX += 0.50 * low; L.R.hpX += 0.45 * low;
        L.L.kn += -0.55 * low; L.R.kn += -0.50 * low;
        L.L.an += 0.30 * low; L.R.an += 0.28 * low;
      }

      else if (action === 'eat') {
        // head down to the source, hand feeding to the mouth, jaw works 3 cycles
        const down = smooth(clampf(p / 0.16, 0, 1)) * (1 - smooth(clampf((p - 0.86) / 0.14, 0, 1)));
        const chew = Math.sin(p * Math.PI * 2 * 3.0);
        const chew2 = Math.sin(p * Math.PI * 2 * 3.0 + 0.9);
        wipeArms(0.85 * down); wipeLegs(0.55 * down);
        bodyY += -0.16 * down;
        spLowX += 0.36 * down;
        spMidX += 0.34 * down;
        chestX += 0.24 * down;
        neckX += 0.52 * down + chew * 0.045 * down;
        headX += 0.22 * down - Math.max(0, chew) * 0.10 * down;
        jawX += (0.30 + 0.30 * chew) * down;
        muzzleX += chew2 * 0.05 * down;
        lidL += 0.35 * down; lidR += 0.35 * down;
        eyePitch += 0.3 * down;
        // right hand holds food to the mouth
        A.R.shX += (-0.95 - 0.10 * chew) * down;
        A.R.el += (1.75 + 0.15 * chew) * down;
        A.R.shZ += -0.25 * down;
        A.R.wr += (-0.35 - 0.10 * chew2) * down;
        A.R.curl += 1.05 * down;
        // left hand rests on the ground
        A.L.shX += 0.30 * down; A.L.el += 0.25 * down; A.L.curl += 0.6 * down;
        L.L.hpX += 0.60 * down; L.R.hpX += 0.58 * down;
        L.L.kn += -0.75 * down; L.R.kn += -0.72 * down;
        L.L.an += 0.35 * down; L.R.an += 0.35 * down;
        L.L.hpZ += 0.22 * down; L.R.hpZ += -0.22 * down;
      }

      else if (action === 'drink') {
        // down and HELD — stiller than eating; a slow lapping of the lips
        const down = smooth(clampf(p / 0.22, 0, 1));
        const up = smooth(clampf((p - 0.76) / 0.24, 0, 1));
        const d = down * (1 - up);
        const lap = Math.sin(p * Math.PI * 2 * 2.0) * 0.5 + 0.5;
        wipeArms(0.85 * d); wipeLegs(0.6 * d);
        bodyY += -0.24 * d;
        spLowX += 0.50 * d;
        spMidX += 0.46 * d;
        chestX += 0.30 * d;
        neckX += 0.70 * d;
        headX += 0.26 * d;
        jawX += (0.10 + 0.10 * lap) * d;
        muzzleX += 0.06 * lap * d;
        lidL += 0.55 * d; lidR += 0.55 * d;
        eyePitch += 0.35 * d;
        // both hands planted, weight forward on the knuckles
        A.L.shX += 0.42 * d; A.R.shX += 0.42 * d;
        A.L.el += 0.28 * d; A.R.el += 0.28 * d;
        A.L.shZ += 0.14 * d; A.R.shZ += -0.14 * d;
        A.L.curl += 0.65 * d; A.R.curl += 0.65 * d;
        A.L.wr += 0.20 * d; A.R.wr += 0.20 * d;
        L.L.hpX += 0.70 * d; L.R.hpX += 0.70 * d;
        L.L.kn += -0.85 * d; L.R.kn += -0.85 * d;
        L.L.an += 0.42 * d; L.R.an += 0.42 * d;
        L.L.hpZ += 0.20 * d; L.R.hpZ += -0.20 * d;
      }

      else if (action === 'jump') {
        // crouch and load, then a full extension off both legs and the arms
        const load = smooth(clampf(p / 0.36, 0, 1));
        const ext = smooth(clampf((p - 0.34) / 0.46, 0, 1));
        const reach = smooth(clampf((p - 0.72) / 0.28, 0, 1));
        wipeArms(0.9); wipeLegs(0.9);
        bodyY += -0.30 * load + 0.34 * ext;
        spLowX += 0.42 * load - 0.42 * ext;
        spMidX += 0.36 * load - 0.40 * ext;
        chestX += 0.26 * load - 0.32 * ext;
        neckX += 0.35 * load - 0.45 * ext;
        headX += 0.20 * load - 0.10 * ext;
        jawX += 0.30 * ext;
        lidL += -0.3 * ext; lidR += -0.3 * ext;
        A.L.shX += 0.65 * load - 1.85 * ext;
        A.R.shX += 0.65 * load - 1.85 * ext;
        A.L.el += 0.75 * load - 0.45 * ext + 0.20 * reach;
        A.R.el += 0.75 * load - 0.45 * ext + 0.20 * reach;
        A.L.shZ += 0.20 * load + 0.45 * ext;
        A.R.shZ += -0.20 * load - 0.45 * ext;
        A.L.curl += 0.75 * load + 0.35 * reach;
        A.R.curl += 0.75 * load + 0.35 * reach;
        A.L.spread += ext * 0.35 * (1 - reach);
        A.R.spread += ext * 0.35 * (1 - reach);
        L.L.hpX += 0.95 * load - 1.20 * ext;
        L.R.hpX += 0.95 * load - 1.20 * ext;
        L.L.kn += -1.15 * load + 1.35 * ext;
        L.R.kn += -1.15 * load + 1.35 * ext;
        L.L.an += 0.55 * load - 0.85 * ext;
        L.R.an += 0.55 * load - 0.85 * ext;
        L.L.toe += -0.20 * load - 0.75 * ext;
        L.R.toe += -0.20 * load - 0.75 * ext;
      }

      else if (action === 'land') {
        // reach for the ground, absorb through arms and legs, push back to stance
        const reach = smooth(clampf(p / 0.22, 0, 1));
        const comp = bump(clampf((p - 0.18) / 0.34, 0, 1));
        const rise = smooth(clampf((p - 0.50) / 0.50, 0, 1));
        const a = 1 - rise;
        wipeArms(0.9 * Math.max(a, comp)); wipeLegs(0.9 * Math.max(a, comp));
        bodyY += (0.08 * reach - 0.34 * comp) * 1;
        spLowX += 0.20 * reach + 0.45 * comp;
        spMidX += 0.16 * reach + 0.38 * comp;
        chestX += 0.28 * comp;
        neckX += -0.20 * reach + 0.42 * comp;
        headX += 0.10 * reach + 0.20 * comp;
        jawX += 0.22 * comp;
        lidL += 0.5 * comp; lidR += 0.5 * comp;
        A.L.shX += -1.20 * reach + 1.00 * comp;
        A.R.shX += -1.20 * reach + 1.00 * comp;
        A.L.el += 0.30 * reach + 1.10 * comp;
        A.R.el += 0.30 * reach + 1.10 * comp;
        A.L.shZ += 0.35 * reach + 0.20 * comp;
        A.R.shZ += -0.35 * reach - 0.20 * comp;
        A.L.curl += 0.35 * reach + 0.95 * comp;
        A.R.curl += 0.35 * reach + 0.95 * comp;
        A.L.wr += -0.35 * reach + 0.35 * comp;
        A.R.wr += -0.35 * reach + 0.35 * comp;
        L.L.hpX += -0.55 * reach + 1.05 * comp;
        L.R.hpX += -0.55 * reach + 1.05 * comp;
        L.L.kn += -0.35 * reach - 1.15 * comp;
        L.R.kn += -0.35 * reach - 1.15 * comp;
        L.L.an += 0.30 * reach + 0.55 * comp;
        L.R.an += 0.30 * reach + 0.55 * comp;
        L.L.toe += -0.35 * comp; L.R.toe += -0.35 * comp;
      }

      else if (action === 'signal') {
        // rise up, chest out, throw the head back, roar, and beat the chest twice
        const rise = smooth(clampf(p / 0.24, 0, 1));
        const hold = clampf((p - 0.22) / 0.50, 0, 1);
        const down = smooth(clampf((p - 0.72) / 0.28, 0, 1));
        const up = rise * (1 - down);
        // two chest beats during the hold
        const beatPhase = clampf((p - 0.28) / 0.40, 0, 1);
        const beat = Math.sin(beatPhase * Math.PI * 2 * 2.0);
        const beatL = Math.max(0, beat);
        const beatR = Math.max(0, -beat);
        const impact = Math.pow(Math.max(beatL, beatR), 6);
        wipeArms(0.92 * up); wipeLegs(0.65 * up);
        bodyY += 0.26 * up - 0.03 * impact;
        spLowX += -0.42 * up;
        spMidX += -0.40 * up;
        chestX += -0.36 * up + 0.06 * impact;
        pelvPitch += -0.10 * up;
        neckX += -0.55 * up;
        headX += -0.45 * up + 0.10 * impact;
        jawX += (0.85 * up) * (0.65 + 0.35 * Math.sin(p * Math.PI * 6.0));
        muzzleX += -0.10 * up;
        lidL += 0.35 * up; lidR += 0.35 * up;
        bodyScaleXZ *= 1 + 0.05 * up;
        // arms out and up, then hammering the chest alternately
        A.L.shX += (-1.05 - 0.85 * beatL) * up;
        A.R.shX += (-1.05 - 0.85 * beatR) * up;
        A.L.shZ += (0.85 - 0.45 * beatL) * up;
        A.R.shZ += (-0.85 + 0.45 * beatR) * up;
        A.L.el += (1.05 + 0.75 * beatL) * up;
        A.R.el += (1.05 + 0.75 * beatR) * up;
        A.L.shY += (-0.35 - 0.35 * beatL) * up;
        A.R.shY += (0.35 + 0.35 * beatR) * up;
        A.L.wr += -0.35 * up; A.R.wr += -0.35 * up;
        A.L.curl += (0.35 + 0.55 * beatL) * up;
        A.R.curl += (0.35 + 0.55 * beatR) * up;
        A.L.spread += 0.35 * up * (1 - beatL);
        A.R.spread += 0.35 * up * (1 - beatR);
        // stand tall on the hind legs
        L.L.hpX += -0.35 * up; L.R.hpX += -0.35 * up;
        L.L.kn += 0.50 * up; L.R.kn += 0.50 * up;
        L.L.an += -0.25 * up; L.R.an += -0.25 * up;
        L.L.hpZ += 0.14 * up; L.R.hpZ += -0.14 * up;
      }

      else if (action === 'sleep') {
        // fold down onto the side and go still — ENDS here
        const fold = smooth(clampf(p / 0.42, 0, 1));
        const roll = smooth(clampf((p - 0.36) / 0.38, 0, 1));
        const still = smooth(clampf((p - 0.70) / 0.30, 0, 1));
        wipeArms(0.95); wipeLegs(0.95);
        const slowBreath = Math.sin(t * 0.75) * still;
        bodyY += -0.52 * fold - 0.12 * roll;
        bodyZ = -0.10 * fold;
        bodyRoll += roll * 0.72;
        bodyPitch += fold * 0.10;
        pelvPitch += 0.28 * fold;
        spLowX += 0.42 * fold + 0.10 * roll;
        spMidX += 0.40 * fold + 0.12 * roll;
        spLowZ += roll * 0.22;
        spMidZ += roll * 0.20;
        chestX += 0.30 * fold + slowBreath * 0.02;
        chestZ += roll * 0.24;
        neckX += 0.62 * fold + 0.14 * roll;
        headX += 0.30 * fold;
        headZ += roll * 0.42;
        headY += roll * 0.22;
        lidL += 1.0 * clampf(p / 0.5, 0, 1); lidR += 1.0 * clampf(p / 0.5, 0, 1);
        jawX += 0.06 * still;
        bodyScaleXZ *= 1 + slowBreath * 0.008;
        // arms fold in, one under the head
        A.L.shX += -0.75 * fold - 0.35 * roll;
        A.L.el += 1.85 * fold + 0.35 * roll;
        A.L.shZ += 0.35 * fold;
        A.L.curl += 0.85 * fold;
        A.R.shX += 0.40 * fold + 0.25 * roll;
        A.R.el += 1.15 * fold;
        A.R.shZ += -0.55 * fold;
        A.R.curl += 0.75 * fold;
        // legs tuck up
        L.L.hpX += 1.05 * fold; L.R.hpX += 0.95 * fold;
        L.L.kn += -1.55 * fold; L.R.kn += -1.45 * fold;
        L.L.an += 0.55 * fold; L.R.an += 0.50 * fold;
        L.L.hpZ += 0.30 * fold; L.R.hpZ += -0.20 * fold;
      }

      else if (action === 'wake') {
        // the mirror of sleep: stir, unroll, push up, settle exactly on standing
        const q = 1 - p;
        const fold = smooth(clampf(q / 0.42, 0, 1));
        const roll = smooth(clampf((q - 0.36) / 0.38, 0, 1));
        const stir = Math.exp(-Math.pow((p - 0.12) / 0.10, 2));
        const push = bump(clampf((p - 0.35) / 0.40, 0, 1));
        wipeArms(0.95 * Math.max(fold, push * 0.8));
        wipeLegs(0.95 * Math.max(fold, push * 0.8));
        bodyY += -0.52 * fold - 0.12 * roll + 0.05 * push;
        bodyZ = -0.10 * fold;
        bodyRoll += roll * 0.72;
        bodyPitch += fold * 0.10;
        pelvPitch += 0.28 * fold;
        spLowX += 0.42 * fold + 0.10 * roll - 0.08 * push;
        spMidX += 0.40 * fold + 0.12 * roll - 0.10 * push;
        spLowZ += roll * 0.22;
        spMidZ += roll * 0.20;
        chestX += 0.30 * fold;
        chestZ += roll * 0.24;
        neckX += 0.62 * fold + 0.14 * roll - 0.22 * push + 0.12 * stir;
        headX += 0.30 * fold - 0.15 * push;
        headZ += roll * 0.42;
        headY += roll * 0.22 + stir * 0.30;
        lidL += clampf(1 - p * 2.4, 0, 1); lidR += clampf(1 - p * 2.6, 0, 1);
        jawX += 0.45 * push;   // a yawn on the way up
        muzzleX += 0.10 * push;
        A.L.shX += -0.75 * fold - 0.35 * roll - 0.25 * push;
        A.L.el += 1.85 * fold + 0.35 * roll + 0.30 * push;
        A.L.shZ += 0.35 * fold;
        A.L.curl += 0.85 * fold + 0.35 * push;
        A.R.shX += 0.40 * fold + 0.25 * roll + 0.30 * push;
        A.R.el += 1.15 * fold + 0.35 * push;
        A.R.shZ += -0.55 * fold;
        A.R.curl += 0.75 * fold + 0.35 * push;
        L.L.hpX += 1.05 * fold + 0.35 * push; L.R.hpX += 0.95 * fold + 0.35 * push;
        L.L.kn += -1.55 * fold - 0.30 * push; L.R.kn += -1.45 * fold - 0.30 * push;
        L.L.an += 0.55 * fold + 0.20 * push; L.R.an += 0.50 * fold + 0.20 * push;
        L.L.hpZ += 0.30 * fold; L.R.hpZ += -0.20 * fold;
      }

      else if (action === 'die') {
        // stagger, the legs go, it goes down on its side and STAYS there
        const stag = smooth(clampf(p / 0.20, 0, 1));
        const buckle = smooth(clampf((p - 0.18) / 0.26, 0, 1));
        const fall = smooth(clampf((p - 0.40) / 0.30, 0, 1));
        const dead = smooth(clampf((p - 0.66) / 0.34, 0, 1));
        const twitch = Math.exp(-Math.pow((p - 0.76) / 0.05, 2)) * (1 - dead * 0.4);
        wipeArms(0.98); wipeLegs(0.98);
        bodyY += -0.16 * stag - 0.28 * buckle - 0.44 * fall;
        bodyZ = -0.06 * stag + 0.12 * fall;
        bodyRoll += fall * 0.95 + dead * 0.35;
        bodyPitch += stag * 0.08 + buckle * 0.18 + fall * 0.10;
        bodyYaw += fall * 0.22;
        pelvPitch += 0.20 * buckle + 0.16 * fall;
        spLowX += 0.35 * stag + 0.30 * buckle - 0.20 * fall;
        spMidX += 0.30 * stag + 0.28 * buckle - 0.24 * fall;
        spLowZ += fall * 0.28;
        spMidZ += fall * 0.26 + twitch * 0.10;
        chestX += 0.30 * buckle - 0.15 * fall;
        chestZ += fall * 0.30;
        neckX += 0.45 * stag + 0.35 * buckle + 0.30 * fall - twitch * 0.35;
        headX += 0.25 * stag + 0.35 * fall;
        headZ += fall * 0.55;
        headY += fall * 0.28;
        lidL += clampf(p * 1.9, 0, 1); lidR += clampf(p * 2.1, 0, 1);
        jawX += 0.35 * fall + 0.25 * dead - twitch * 0.2;
        muzzleX += 0.05 * dead;
        // arms give way, then sprawl
        A.L.shX += -0.35 * stag + 0.95 * buckle + 0.35 * fall - twitch * 0.5;
        A.L.el += 0.85 * stag - 0.35 * buckle + 0.25 * fall;
        A.L.shZ += 0.25 * stag + 0.55 * fall;
        A.L.curl += 0.55 * stag - 0.45 * fall;
        A.L.spread += fall * 0.5;
        A.R.shX += 0.55 * stag + 0.55 * buckle - 0.35 * fall;
        A.R.el += 0.55 * stag - 0.30 * buckle + 0.85 * fall;
        A.R.shZ += -0.45 * stag - 0.75 * fall;
        A.R.curl += 0.45 * stag - 0.40 * fall;
        A.R.spread += fall * 0.5;
        // legs collapse, one folded under, one trailing
        L.L.hpX += 0.85 * buckle + 0.35 * fall;
        L.R.hpX += 0.70 * buckle - 0.35 * fall;
        L.L.kn += -1.35 * buckle - 0.25 * fall;
        L.R.kn += -0.85 * buckle + 0.30 * fall;
        L.L.an += 0.45 * buckle + 0.20 * fall;
        L.R.an += 0.35 * buckle - 0.30 * fall;
        L.L.hpZ += 0.35 * fall; L.R.hpZ += -0.45 * fall;
        L.L.toe += 0.25 * fall; L.R.toe += 0.30 * fall;
      }

      else if (action === 'evolve') {
        // brace low, then open along the seams — the ribcage and shoulders
        // swell, the arms are forced outward, the head is thrown back — hold,
        // then close back down. Effort, not flourish.
        const brace = smooth(clampf(p / 0.20, 0, 1));
        const open = smooth(clampf((p - 0.18) / 0.24, 0, 1));
        const hold = clampf((p - 0.40) / 0.28, 0, 1);
        const close = smooth(clampf((p - 0.68) / 0.32, 0, 1));
        const on = 1 - close;
        const strain = Math.sin(t * 26.0) * 0.02 * open * on;
        const pulse = Math.sin(hold * Math.PI * 3.0) * 0.5 + 0.5;
        wipeArms(0.92 * Math.max(brace, open)); wipeLegs(0.7 * Math.max(brace, open));
        const swell = open * on;
        bodyY += (-0.20 * brace + 0.30 * open) * on;
        bodyScaleY = 1 + swell * 0.10 * (0.7 + 0.3 * pulse);
        bodyScaleXZ *= 1 + swell * 0.14 * (0.7 + 0.3 * pulse);
        spLowX += (0.40 * brace - 0.50 * open) * on + strain;
        spMidX += (0.36 * brace - 0.55 * open) * on + strain;
        chestX += (0.28 * brace - 0.50 * open) * on;
        pelvPitch += (0.18 * brace - 0.12 * open) * on;
        neckX += (0.40 * brace - 0.85 * open) * on;
        headX += (0.25 * brace - 0.55 * open) * on;
        jawX += (0.10 * brace + 0.75 * open) * on;
        muzzleX += -0.12 * swell;
        lidL += (0.65 * brace - 0.35 * open) * on;
        lidR += (0.65 * brace - 0.35 * open) * on;
        // arms forced out and back as the body opens
        A.L.shX += (0.45 * brace - 1.35 * open) * on + strain;
        A.R.shX += (0.45 * brace - 1.35 * open) * on - strain;
        A.L.shZ += (0.20 * brace + 1.05 * open) * on;
        A.R.shZ += (-0.20 * brace - 1.05 * open) * on;
        A.L.shY += (-0.45 * open) * on; A.R.shY += (0.45 * open) * on;
        A.L.el += (1.05 * brace - 0.55 * open) * on;
        A.R.el += (1.05 * brace - 0.55 * open) * on;
        A.L.wr += (-0.25 * open) * on; A.R.wr += (-0.25 * open) * on;
        A.L.curl += (0.85 * brace - 0.95 * open) * on;
        A.R.curl += (0.85 * brace - 0.95 * open) * on;
        A.L.spread += swell * 0.85; A.R.spread += swell * 0.85;
        L.L.hpX += (0.75 * brace - 0.45 * open) * on;
        L.R.hpX += (0.75 * brace - 0.45 * open) * on;
        L.L.kn += (-0.85 * brace + 0.55 * open) * on;
        L.R.kn += (-0.85 * brace + 0.55 * open) * on;
        L.L.an += (0.40 * brace - 0.20 * open) * on;
        L.R.an += (0.40 * brace - 0.20 * open) * on;
        L.L.hpZ += 0.22 * swell; L.R.hpZ += -0.22 * swell;
      }
    }

    // ============================================== WRITE THE POSE
    body.position.set(0, -0.58 + bodyY, bodyZ);
    body.rotation.set(bodyPitch, bodyYaw, bodyRoll);
    body.scale.set(bodyScaleXZ, bodyScaleY, bodyScaleXZ);

    pelvis.position.set(0, 0.78 + pelvY, -0.30 + pelvZ);
    pelvis.rotation.set(pelvPitch, pelvYaw, pelvRoll);

    spineLow.rotation.set(spLowX, spLowY, spLowZ);
    spineMid.rotation.set(spMidX, spMidY, spMidZ);
    chest.rotation.set(chestX, chestY, chestZ);
    neck.rotation.set(neckX, neckY, neckZ);
    head.rotation.set(headX, headY, headZ);
    muzzle.rotation.set(muzzleX, 0, 0);
    jaw.rotation.set(clampf(jawX, -0.05, 1.05), 0, 0);

    const writeEye = (eye, lidAmt, side) => {
      eye.rotation.set(clampf(eyePitch, -0.5, 0.5), clampf(eyeYaw, -0.6, 0.6), 0);
      const lid = eye.getObjectByName('EyelidUpper' + side);
      if (lid) lid.rotation.x = clampf(lidAmt, 0, 1.2) * 1.15;
    };
    writeEye(eyeL, lidL, 'Left');
    writeEye(eyeR, lidR, 'Right');

    // ears flick with alertness
    const alert = clampf(1 - hurt, 0, 1);
    earL.rotation.set(0, Math.sin(t * 1.7) * 0.06 * alert, 0.10 * hurt);
    earR.rotation.set(0, -Math.sin(t * 1.7 + 0.6) * 0.06 * alert, -0.10 * hurt);

    rumpTuft.rotation.set(Math.sin(t * 1.1) * 0.04 * idleAmt, 0, 0);

    const writeArm = (arm, o, side) => {
      const sgn = side === 'L' ? -1 : 1;
      arm.shoulder.rotation.set(
        REST.shoulderX + o.shX,
        o.shY,
        sgn * -0.16 + o.shZ * -sgn * -1 * 0 + (sgn === -1 ? 1 : -1) * 0 + o.shZ
      );
      // rebuild the roll cleanly: base splay + overlay
      arm.shoulder.rotation.z = (side === 'L' ? 0.16 : -0.16) + o.shZ;
      arm.elbow.rotation.set(clampf(REST.elbow + o.el, -0.05, 2.65), o.elY, 0);
      arm.wrist.rotation.set(clampf(REST.wrist + o.wr, -1.30, 0.85), o.wrY, o.wrZ);
      const curl = clampf(o.curl, -1.2, 1.2);
      const spread = clampf(o.spread, 0, 1.2);
      arm.fingers.forEach((f, i) => {
        const j = (i - 1.5) * 0.06;
        f.f.rotation.set(-0.55 - curl * 0.30 + spread * 0.85, j * spread * 2.2, 0);
        f.knuck.rotation.x = clampf(1.95 + curl * 0.55 - spread * 1.85, 0.0, 2.6);
        f.tip.rotation.x = clampf(0.85 + curl * 0.45 - spread * 0.90, 0.0, 1.7);
      });
      arm.thumb.rotation.set(-0.25 - curl * 0.25 + spread * 0.45,
        0, (side === 'L' ? -1 : 1) * (0.35 + spread * 0.45 - curl * 0.15));
      arm.thTip.rotation.x = clampf(0.35 + curl * 0.55 - spread * 0.55, -0.1, 1.3);
    };
    writeArm(armL, A.L, 'L');
    writeArm(armR, A.R, 'R');

    const writeLeg = (leg, o, side) => {
      const base = side === 'L' ? 0.12 : -0.12;
      leg.hip.rotation.set(REST.hipX + o.hpX, o.hpY, base + o.hpZ);
      leg.knee.rotation.set(clampf(REST.knee + o.kn, -2.35, -0.02), 0, 0);
      leg.ankle.rotation.set(clampf(REST.ankle + o.an, -0.65, 1.15), 0, o.anZ);
      leg.ball.rotation.set(clampf(o.toe, -0.9, 0.9), 0, 0);
      leg.toes.forEach((tt, i) => {
        tt.rotation.set(clampf(o.toe * 0.6, -0.8, 0.8), 0, 0);
      });
      leg.hallux.rotation.set(clampf(o.hal, -0.7, 0.7), (side === 'L' ? -1 : 1) * 0.55, 0);
    };
    writeLeg(legL, L.L, 'L');
    writeLeg(legR, L.R, 'R');
  };

  // fallback clock so it is never a statue
  root.userData.update = (t, dt) => {
    root.userData.pose({ speed: 0, stride: 0, turn: 0, grounded: true, health: 1,
                         action: null, phase: 0, t, dt });
  };

  // establish the standing pose immediately
  root.userData.pose({ speed: 0, stride: 0, turn: 0, grounded: true, health: 1,
                       action: null, phase: 0, t: 0, dt: 0 });

  return root;
}