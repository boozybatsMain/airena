function build(THREE, TSL) {
  const { mix, smoothstep, positionLocal, vec3 } = TSL;

  const PEC_BASE_Z = 0.5;
  const PEL_BASE_Z = 0.3;

  const skinMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.05, roughness: 0.5 });
  skinMat.colorNode = mix(
    vec3(0.72, 0.75, 0.78),
    vec3(0.15, 0.19, 0.25),
    smoothstep(-0.05, 0.35, positionLocal.y)
  );

  const finMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.05, roughness: 0.55 });
  finMat.colorNode = mix(
    vec3(0.5, 0.55, 0.6),
    vec3(0.1, 0.13, 0.18),
    smoothstep(-0.1, 0.3, positionLocal.y)
  );

  const teethMat = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.25, metalness: 0.05 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.3, metalness: 0.1 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x5b1418, roughness: 0.6 });
  const gillMat = new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.7 });

  function finGeo(points, thickness) {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 8 });
    geo.translate(0, 0, -thickness / 2);
    return geo;
  }

  function pectoralGeo(sign, spanScale, chordScale) {
    const pts = [[0, 0.02], [0.5, 0.15], [0.68, 0.32], [0.45, 0.42], [0.15, 0.3], [0, 0.1]]
      .map((p) => [p[0] * sign * spanScale, p[1] * chordScale]);
    const geo = finGeo(pts, 0.025);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }

  const toothGeo = new THREE.ConeGeometry(0.02, 0.07, 4);
  function tooth(parent, x, y, z, flip, scale, tilt) {
    const m = new THREE.Mesh(toothGeo, teethMat);
    m.name = 'Tooth';
    m.position.set(x, y, z);
    m.rotation.x = flip ? Math.PI : 0;
    m.rotation.z = tilt || 0;
    m.scale.setScalar(scale || 1);
    parent.add(m);
    return m;
  }

  const shark = new THREE.Group();
  shark.name = 'Shark';

  const body = new THREE.Group();
  body.name = 'Body';
  shark.add(body);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skinMat);
  torso.name = 'Torso';
  torso.scale.set(0.34, 0.32, 0.78);
  torso.position.set(0, 0.02, 0.02);
  body.add(torso);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), skinMat);
  belly.name = 'Belly';
  belly.scale.set(0.3, 0.22, 0.6);
  belly.position.set(0, -0.14, 0.05);
  body.add(belly);

  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 0.02, 0.58);
  body.add(head);

  const skullGeo = new THREE.ConeGeometry(0.26, 0.85, 10);
  skullGeo.rotateX(Math.PI / 2);
  const skull = new THREE.Mesh(skullGeo, skinMat);
  skull.name = 'Skull';
  skull.scale.set(1, 0.66, 1);
  skull.position.set(0, -0.01, 0.35);
  head.add(skull);

  const upperTeeth = new THREE.Group();
  upperTeeth.name = 'UpperTeeth';
  upperTeeth.position.set(0, -0.13, 0.32);
  head.add(upperTeeth);
  for (let i = 0; i < 9; i++) {
    const tt = i / 8 - 0.5;
    tooth(upperTeeth, tt * 0.34, 0, -Math.abs(tt) * 0.12, false, 1 - Math.abs(tt) * 0.3, tt * 0.5);
  }

  const eyeGeo = new THREE.SphereGeometry(0.035, 10, 8);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.name = 'EyeL';
  eyeL.position.set(-0.22, 0.07, 0.22);
  head.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.name = 'EyeR';
  eyeR.position.set(0.22, 0.07, 0.22);
  head.add(eyeR);

  const lowerJaw = new THREE.Group();
  lowerJaw.name = 'LowerJaw';
  lowerJaw.position.set(0, -0.14, 0.15);
  head.add(lowerJaw);

  const jawGeo = new THREE.ConeGeometry(0.19, 0.55, 8);
  jawGeo.rotateX(Math.PI / 2);
  const jawMesh = new THREE.Mesh(jawGeo, skinMat);
  jawMesh.name = 'LowerJawMesh';
  jawMesh.scale.set(0.8, 0.4, 1);
  jawMesh.position.set(0, -0.02, 0.2);
  lowerJaw.add(jawMesh);

  const mouthInside = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mouthMat);
  mouthInside.name = 'MouthInside';
  mouthInside.scale.set(0.9, 0.5, 1);
  mouthInside.position.set(0, 0.02, 0.1);
  lowerJaw.add(mouthInside);

  const lowerTeeth = new THREE.Group();
  lowerTeeth.name = 'LowerTeeth';
  lowerTeeth.position.set(0, 0.05, 0.3);
  lowerJaw.add(lowerTeeth);
  for (let i = 0; i < 8; i++) {
    const tt = i / 7 - 0.5;
    tooth(lowerTeeth, tt * 0.3, 0, -Math.abs(tt) * 0.1, true, 0.9 - Math.abs(tt) * 0.25, tt * 0.5);
  }

  const gills = new THREE.Group();
  gills.name = 'Gills';
  gills.position.set(0, 0, 0.4);
  body.add(gills);
  for (let i = 0; i < 4; i++) {
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.15, 0.03), gillMat);
    gl.name = 'GillSlitL' + (i + 1);
    gl.position.set(-0.3, -0.02, 0.05 - i * 0.06);
    gl.rotation.y = 0.3;
    gills.add(gl);
    const gr = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.15, 0.03), gillMat);
    gr.name = 'GillSlitR' + (i + 1);
    gr.position.set(0.3, -0.02, 0.05 - i * 0.06);
    gr.rotation.y = -0.3;
    gills.add(gr);
  }

  const pecL = new THREE.Group();
  pecL.name = 'PectoralFinL';
  pecL.position.set(-0.28, -0.08, 0.3);
  pecL.rotation.z = PEC_BASE_Z;
  body.add(pecL);
  const pecLMesh = new THREE.Mesh(pectoralGeo(-1, 1, 1), finMat);
  pecLMesh.name = 'PectoralFinLMesh';
  pecL.add(pecLMesh);

  const pecR = new THREE.Group();
  pecR.name = 'PectoralFinR';
  pecR.position.set(0.28, -0.08, 0.3);
  pecR.rotation.z = -PEC_BASE_Z;
  body.add(pecR);
  const pecRMesh = new THREE.Mesh(pectoralGeo(1, 1, 1), finMat);
  pecRMesh.name = 'PectoralFinRMesh';
  pecR.add(pecRMesh);

  const pelL = new THREE.Group();
  pelL.name = 'PelvicFinL';
  pelL.position.set(-0.16, -0.16, -0.28);
  pelL.rotation.z = PEL_BASE_Z;
  body.add(pelL);
  const pelLMesh = new THREE.Mesh(pectoralGeo(-1, 0.5, 0.55), finMat);
  pelLMesh.name = 'PelvicFinLMesh';
  pelL.add(pelLMesh);

  const pelR = new THREE.Group();
  pelR.name = 'PelvicFinR';
  pelR.position.set(0.16, -0.16, -0.28);
  pelR.rotation.z = -PEL_BASE_Z;
  body.add(pelR);
  const pelRMesh = new THREE.Mesh(pectoralGeo(1, 0.5, 0.55), finMat);
  pelRMesh.name = 'PelvicFinRMesh';
  pelR.add(pelRMesh);

  const analFin = new THREE.Group();
  analFin.name = 'AnalFin';
  analFin.position.set(0, -0.14, -0.48);
  body.add(analFin);
  const analGeo = finGeo([[0, 0], [0.1, -0.16], [0.24, -0.08], [0.18, 0.01], [0, 0]], 0.02);
  analGeo.rotateY(Math.PI / 2);
  const analMesh = new THREE.Mesh(analGeo, finMat);
  analMesh.name = 'AnalFinMesh';
  analFin.add(analMesh);

  const dorsal = new THREE.Group();
  dorsal.name = 'DorsalFin';
  dorsal.position.set(0, 0.26, -0.05);
  body.add(dorsal);
  const dorsalGeo = finGeo([[0, 0], [0.16, 0.42], [0.4, 0.1], [0.5, 0]], 0.025);
  dorsalGeo.rotateY(Math.PI / 2);
  const dorsalMesh = new THREE.Mesh(dorsalGeo, finMat);
  dorsalMesh.name = 'DorsalFinMesh';
  dorsal.add(dorsalMesh);

  const spineMid = new THREE.Group();
  spineMid.name = 'SpineMid';
  spineMid.position.set(0, 0, -0.5);
  body.add(spineMid);
  const spineMidGeo = new THREE.ConeGeometry(0.22, 0.4, 10);
  spineMidGeo.rotateX(-Math.PI / 2);
  const spineMidMesh = new THREE.Mesh(spineMidGeo, skinMat);
  spineMidMesh.name = 'SpineMidMesh';
  spineMidMesh.scale.set(1, 0.85, 1);
  spineMid.add(spineMidMesh);

  const spineTail = new THREE.Group();
  spineTail.name = 'SpineTail';
  spineTail.position.set(0, 0, -0.36);
  spineMid.add(spineTail);
  const spineTailGeo = new THREE.ConeGeometry(0.09, 0.24, 8);
  spineTailGeo.rotateX(-Math.PI / 2);
  const spineTailMesh = new THREE.Mesh(spineTailGeo, skinMat);
  spineTailMesh.name = 'SpineTailMesh';
  spineTailMesh.scale.set(1, 0.8, 1);
  spineTail.add(spineTailMesh);

  const caudal = new THREE.Group();
  caudal.name = 'CaudalFin';
  caudal.position.set(0, 0, -0.2);
  spineTail.add(caudal);

  const cUpGeo = finGeo([[0, 0], [0.14, 0.5], [0.42, 0.3], [0.36, 0.02], [0, 0]], 0.02);
  cUpGeo.rotateY(Math.PI / 2);
  const caudalUpper = new THREE.Group();
  caudalUpper.name = 'CaudalFinUpper';
  caudal.add(caudalUpper);
  const cUpMesh = new THREE.Mesh(cUpGeo, finMat);
  cUpMesh.name = 'CaudalFinUpperMesh';
  caudalUpper.add(cUpMesh);

  const cLoGeo = finGeo([[0, 0], [0.08, -0.26], [0.26, -0.16], [0.2, -0.01], [0, 0]], 0.02);
  cLoGeo.rotateY(Math.PI / 2);
  const caudalLower = new THREE.Group();
  caudalLower.name = 'CaudalFinLower';
  caudal.add(caudalLower);
  const cLoMesh = new THREE.Mesh(cLoGeo, finMat);
  cLoMesh.name = 'CaudalFinLowerMesh';
  caudalLower.add(cLoMesh);

  shark.userData.pose = (s) => {
    const L = THREE.MathUtils.lerp;
    const Cl = THREE.MathUtils.clamp;
    const SS = THREE.MathUtils.smoothstep;

    const spd = Math.max(0, s.speed || 0);
    const turn = Cl(s.turn || 0, -1, 1);
    const grounded = s.grounded === false ? false : true;
    const health = s.health === undefined ? 1 : s.health;
    const t = s.t || 0;
    const stride = s.stride || 0;
    const ph = stride * Math.PI * 2;

    let bodyRotX = 0, bodyRotZ = 0, bodyPosY = 0;
    let headRotX = 0, headRotY = 0, headRotZ = 0;
    let jawOpen = 0;
    let pecZL = PEC_BASE_Z, pecZR = -PEC_BASE_Z, pecXL = 0, pecXR = 0;
    let pelZL = PEL_BASE_Z, pelZR = -PEL_BASE_Z;
    let analRotX = 0;
    let dorsalRotZ = 0, dorsalRotX = 0;
    let smRotY = 0, stRotY = 0, cfRotY = 0;
    let cfuRotX = 0, cflRotX = 0;

    if (s.action) {
      const p = Cl(s.phase || 0, 0, 1);
      switch (s.action) {
        case 'attack': {
          if (p < 0.3) {
            const u = p / 0.3;
            headRotX = L(0, 0.18, u);
            bodyRotX = L(0, 0.1, u);
            jawOpen = L(0, 0.9, u);
            smRotY = L(0, -0.15, u);
            stRotY = L(0, -0.2, u);
          } else if (p < 0.55) {
            const u = (p - 0.3) / 0.25;
            headRotX = L(0.18, -0.22, u);
            bodyRotX = L(0.1, -0.15, u);
            jawOpen = L(0.9, 1.0, u);
            smRotY = L(-0.15, 0.25, u);
            stRotY = L(-0.2, 0.35, u);
            cfRotY = L(0, 0.4, u);
          } else {
            const u = (p - 0.55) / 0.45;
            headRotX = L(-0.22, 0, u);
            bodyRotX = L(-0.15, 0, u);
            jawOpen = L(1.0, 0.05, u);
            smRotY = L(0.25, 0, u);
            stRotY = L(0.35, 0, u);
            cfRotY = L(0.4, 0, u);
          }
          pecZL = PEC_BASE_Z * 0.7;
          pecZR = -PEC_BASE_Z * 0.7;
          break;
        }
        case 'fire': {
          if (p < 0.4) {
            const u = p / 0.4;
            headRotX = L(0, -0.08, u);
            jawOpen = L(0, 0.5, u);
          } else if (p < 0.55) {
            const u = (p - 0.4) / 0.15;
            headRotX = L(-0.08, 0.15, u);
            jawOpen = L(0.5, 1.0, u);
            bodyRotX = L(0, -0.06, u);
          } else {
            const u = (p - 0.55) / 0.45;
            headRotX = L(0.15, 0, u);
            jawOpen = L(1.0, 0.1, u);
            bodyRotX = L(-0.06, 0, u);
          }
          break;
        }
        case 'hit': {
          const k = Math.sin(Cl(p, 0, 1) * Math.PI);
          bodyRotZ = -0.3 * k;
          headRotY = -0.35 * k;
          headRotX = 0.15 * k;
          pecZL = PEC_BASE_Z + 0.2 * k;
          break;
        }
        case 'block': {
          const inAmt = Cl(p / 0.25, 0, 1);
          const outAmt = 1 - Cl((p - 0.75) / 0.25, 0, 1);
          const k = Math.min(inAmt, outAmt);
          bodyRotX = 0.15 * k;
          bodyPosY = -0.05 * k;
          headRotX = 0.3 * k;
          pecZL = L(PEC_BASE_Z, PEC_BASE_Z * 1.3, k);
          pecZR = L(-PEC_BASE_Z, -PEC_BASE_Z * 1.3, k);
          break;
        }
        case 'gather': {
          if (p < 0.45) {
            const u = p / 0.45;
            headRotX = L(0, 0.45, u);
            bodyRotX = L(0, 0.25, u);
            bodyPosY = L(0, -0.1, u);
            jawOpen = L(0, 0.8, u);
          } else if (p < 0.65) {
            const u = (p - 0.45) / 0.2;
            headRotX = 0.45;
            bodyRotX = 0.25;
            bodyPosY = -0.1;
            jawOpen = L(0.8, 0.1, u);
          } else {
            const u = (p - 0.65) / 0.35;
            headRotX = L(0.45, 0, u);
            bodyRotX = L(0.25, 0, u);
            bodyPosY = L(-0.1, 0, u);
            jawOpen = 0.1;
          }
          break;
        }
        case 'deposit': {
          jawOpen = 0.1;
          if (p < 0.5) {
            const u = p / 0.5;
            headRotX = L(0, 0.4, u);
            bodyPosY = L(0, -0.08, u);
          } else if (p < 0.75) {
            const u = (p - 0.5) / 0.25;
            headRotX = 0.4;
            bodyPosY = -0.08;
            jawOpen = L(0.1, 0.7, u);
          } else {
            const u = (p - 0.75) / 0.25;
            headRotX = L(0.4, 0, u);
            bodyPosY = L(-0.08, 0, u);
            jawOpen = L(0.7, 0.05, u);
          }
          break;
        }
        case 'eat': {
          const edge = Cl(Math.min(p * 8, (1 - p) * 8), 0, 1);
          headRotX = 0.35 * edge;
          bodyPosY = -0.06 * edge;
          jawOpen = 0.15 + 0.45 * (0.5 + 0.5 * Math.sin(p * Math.PI * 2 * 2.5));
          headRotZ = Math.sin(p * Math.PI * 2 * 2.5) * 0.05;
          break;
        }
        case 'drink': {
          if (p < 0.3) {
            const u = p / 0.3;
            headRotX = L(0, 0.4, u);
            bodyPosY = L(0, -0.07, u);
          } else if (p < 0.8) {
            headRotX = 0.4;
            bodyPosY = -0.07;
            jawOpen = 0.08;
          } else {
            const u = (p - 0.8) / 0.2;
            headRotX = L(0.4, 0, u);
            bodyPosY = L(-0.07, 0, u);
          }
          break;
        }
        case 'jump': {
          if (p < 0.33) {
            const u = p / 0.33;
            bodyRotX = L(0, 0.2, u);
            bodyPosY = L(0, -0.08, u);
            smRotY = L(0, -0.1, u);
            stRotY = L(0, -0.15, u);
            cfRotY = L(0, -0.2, u);
          } else {
            const u = (p - 0.33) / 0.67;
            bodyRotX = L(0.2, -0.25, u);
            bodyPosY = L(-0.08, 0.1, u);
            smRotY = L(-0.1, 0.15, u);
            stRotY = L(-0.15, 0.3, u);
            cfRotY = L(-0.2, 0.35, u);
            pecZL = PEC_BASE_Z * 1.2;
            pecZR = -PEC_BASE_Z * 1.2;
          }
          break;
        }
        case 'land': {
          if (p < 0.3) {
            const u = p / 0.3;
            bodyRotX = L(-0.25, 0.05, u);
            bodyPosY = L(0.1, 0, u);
          } else if (p < 0.55) {
            const u = (p - 0.3) / 0.25;
            bodyRotX = L(0.05, 0.25, u);
            bodyPosY = L(0, -0.12, u);
          } else {
            const u = (p - 0.55) / 0.45;
            bodyRotX = L(0.25, 0, u);
            bodyPosY = L(-0.12, 0, u);
          }
          break;
        }
        case 'signal': {
          const k = p < 0.7 ? Cl(p / 0.35, 0, 1) : Cl((1 - p) / 0.3, 0, 1);
          bodyRotX = -0.2 * k;
          bodyPosY = 0.08 * k;
          headRotX = -0.15 * k;
          jawOpen = 0.85 * k;
          pecZL = PEC_BASE_Z + 0.3 * k;
          pecZR = -PEC_BASE_Z - 0.3 * k;
          dorsalRotX = -0.12 * k;
          smRotY = Math.sin(t * 6) * 0.05 * k;
          stRotY = Math.sin(t * 6 - 0.5) * 0.08 * k;
          cfRotY = Math.sin(t * 6 - 1) * 0.12 * k;
          break;
        }
        case 'sleep': {
          const u = Cl(p / 0.7, 0, 1);
          bodyRotX = L(0, 0.35, u);
          bodyPosY = L(0, -0.18, u);
          headRotX = L(0, 0.2, u);
          pecZL = L(PEC_BASE_Z, PEC_BASE_Z * 1.4, u);
          pecZR = L(-PEC_BASE_Z, -PEC_BASE_Z * 1.4, u);
          cfRotY = Math.sin(t * 0.6) * 0.03 * (1 - u);
          break;
        }
        case 'wake': {
          const u = Cl(p, 0, 1);
          bodyRotX = L(0.35, 0, u);
          bodyPosY = L(-0.18, 0, u);
          headRotX = L(0.2, 0, u);
          pecZL = L(PEC_BASE_Z * 1.4, PEC_BASE_Z, u);
          pecZR = L(-PEC_BASE_Z * 1.4, -PEC_BASE_Z, u);
          break;
        }
        case 'die': {
          const u = Cl(p, 0, 1);
          bodyRotZ = L(0, 1.3, u);
          bodyRotX = L(0, 0.4, u);
          bodyPosY = L(0, -0.3, u);
          headRotX = L(0, 0.3, u);
          headRotZ = L(0, 0.6, u);
          jawOpen = L(0.2, 0.6, u);
          pecZL = L(PEC_BASE_Z, PEC_BASE_Z * 1.6, u);
          pecZR = L(-PEC_BASE_Z, -PEC_BASE_Z * 0.3, u);
          smRotY = Math.sin(u * 8) * 0.15 * (1 - u);
          stRotY = Math.sin(u * 8 - 1) * 0.2 * (1 - u);
          cfRotY = Math.sin(u * 8 - 2) * 0.25 * (1 - u);
          break;
        }
        case 'evolve': {
          const k = Math.sin(Cl(p, 0, 1) * Math.PI);
          bodyRotX = -0.15 * k;
          bodyPosY = 0.06 * k;
          jawOpen = 0.6 * k;
          pecZL = PEC_BASE_Z + 0.4 * k;
          pecZR = -PEC_BASE_Z - 0.4 * k;
          pelZL = PEL_BASE_Z + 0.25 * k;
          pelZR = -PEL_BASE_Z - 0.25 * k;
          dorsalRotX = -0.2 * k;
          smRotY = 0.15 * k;
          stRotY = 0.2 * k;
          cfRotY = 0.25 * k;
          break;
        }
        default:
          break;
      }
    } else {
      const waveAmp = L(0.05, 0.6, Cl(spd / 6, 0, 1));
      const tipAmp = waveAmp * 1.6;
      const idleAmt = 1 - Cl(spd / 0.8, 0, 1);
      const burst = SS(spd, 1.5, 2.5);
      const tuck = Cl(spd / 6, 0, 1);

      bodyPosY = Math.sin(t * 1.4) * 0.02 * idleAmt;
      bodyRotX = Math.sin(t * 0.9) * 0.015 * idleAmt - 0.02 * Cl((spd - 3) / 3, 0, 1);
      headRotX = Math.sin(t * 0.5) * 0.03 * idleAmt;
      headRotY = Math.sin(t * 0.35) * 0.18 * idleAmt;
      headRotY *= (1 - burst * 0.4);
      headRotY += -Math.sin(ph) * 0.06 * Cl(spd / 3, 0, 1);

      smRotY = Math.sin(ph) * waveAmp * 0.6;
      stRotY = Math.sin(ph - 1.0) * waveAmp * 1.0;
      cfRotY = Math.sin(ph - 1.9) * tipAmp;
      cfuRotX = 0.05 + Math.sin(ph - 1.9) * 0.05;
      cflRotX = -0.05 - Math.sin(ph - 1.9) * 0.05;

      const pecFlap = Math.sin(ph * 0.5) * 0.05 * (1 - tuck);
      pecZL = PEC_BASE_Z * (1 - 0.65 * tuck) + pecFlap;
      pecZR = -PEC_BASE_Z * (1 - 0.65 * tuck) - pecFlap;
      pecXL = -0.05 * tuck;
      pecXR = -0.05 * tuck;

      pelZL = PEL_BASE_Z + Math.sin(ph) * 0.04 * waveAmp;
      pelZR = -PEL_BASE_Z - Math.sin(ph) * 0.04 * waveAmp;
      analRotX = Math.sin(ph - 1.0) * 0.06 * waveAmp;

      dorsalRotZ = Math.sin(ph - 0.5) * 0.05 * waveAmp;
      dorsalRotX = -0.03 * Cl(spd / 6, 0, 1);

      jawOpen = 0.04 * idleAmt * Math.max(0, Math.sin(t * 1.4));

      if (turn !== 0) {
        bodyRotZ += -turn * 0.35;
        headRotY += -turn * 0.3;
        smRotY += -turn * 0.25;
        stRotY += -turn * 0.35;
        cfRotY += -turn * 0.2;
        if (turn < 0) {
          pecZL *= 0.5;
          pecXL += 0.15;
        } else {
          pecZR *= 0.5;
          pecXR -= 0.15;
        }
      }

      if (!grounded) {
        smRotY *= 0.3;
        stRotY *= 0.3;
        cfRotY = Math.sin(t * 2.0) * 0.08;
        pecZL = PEC_BASE_Z * 1.1;
        pecZR = -PEC_BASE_Z * 1.1;
        pecXL = 0.1;
        pecXR = 0.1;
        bodyRotX = -0.08;
        jawOpen = Math.max(jawOpen, 0.05);
      }

      if (health < 1) {
        const hAmt = Cl(1 - health, 0, 1);
        bodyRotZ += 0.18 * hAmt;
        headRotX += 0.12 * hAmt;
        headRotY += 0.1 * hAmt;
        pecZR -= 0.2 * hAmt;
        smRotY *= (1 - 0.3 * hAmt);
        stRotY *= (1 - 0.3 * hAmt);
        bodyPosY -= 0.03 * hAmt;
      }
    }

    body.rotation.set(bodyRotX, 0, bodyRotZ);
    body.position.y = bodyPosY;
    head.rotation.set(headRotX, headRotY, headRotZ);
    lowerJaw.rotation.x = -jawOpen * 0.9;
    pecL.rotation.set(pecXL, 0, pecZL);
    pecR.rotation.set(pecXR, 0, pecZR);
    pelL.rotation.z = pelZL;
    pelR.rotation.z = pelZR;
    analFin.rotation.x = analRotX;
    dorsal.rotation.set(dorsalRotX, 0, dorsalRotZ);
    spineMid.rotation.y = smRotY;
    spineTail.rotation.y = stRotY;
    caudal.rotation.y = cfRotY;
    caudalUpper.rotation.x = cfuRotX;
    caudalLower.rotation.x = cflRotX;
  };

  return shark;
}