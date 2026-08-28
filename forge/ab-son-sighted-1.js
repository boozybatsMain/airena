function build(THREE, TSL) {
  const { vec3, positionLocal, positionWorld, normalWorld, cameraPosition,
          mix, smoothstep, clamp, pow, max, dot, oneMinus, sin, time,
          mul, add, sub, div, normalize } = TSL;

  function clamp01(x){ return Math.max(0, Math.min(1, x)); }
  function smoothstepJS(a,b,x){ const t = clamp01((x-a)/(b-a)); return t*t*(3-2*t); }
  function lerp(a,b,t){ return a + (b-a)*t; }

  function lathe(points, radial){
    const pts = points.map(p => new THREE.Vector2(p[0], p[1]));
    const g = new THREE.LatheGeometry(pts, radial || 14);
    g.rotateX(Math.PI/2);
    return g;
  }
  function coneAtBase(r, h, radial){
    const g = new THREE.ConeGeometry(r, h, radial || 8);
    g.translate(0, h/2, 0);
    return g;
  }
  function finGeo(r, h, thin, radial){
    const g = coneAtBase(r, h, radial || 6);
    g.scale(thin, 1, 1);
    return g;
  }

  // ---------- materials ----------
  const skinMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.04 });
  {
    const belly = vec3(0.86, 0.84, 0.80);
    const back  = vec3(0.14, 0.18, 0.23);
    const h = clamp(mul(positionLocal.y, 1.6), -1.0, 1.0);
    const t = smoothstep(-0.1, 0.35, h);
    let col = mix(belly, back, t);
    const viewDir = normalize(sub(cameraPosition, positionWorld));
    const fres = pow(oneMinus(max(dot(normalWorld, viewDir), 0.0)), 3.0);
    col = mix(col, vec3(0.55, 0.68, 0.72), mul(fres, 0.18));
    const shimmer = mul(sin(add(add(mul(positionWorld.x, 9.0), mul(positionWorld.z, 6.0)), mul(time, 1.3))), 0.02);
    col = add(col, shimmer);
    skinMat.colorNode = col;
    skinMat.roughnessNode = clamp(add(0.5, mul(sin(add(mul(positionWorld.x, 22.0), mul(positionWorld.y, 22.0))), 0.06)), 0.3, 0.8);
  }
  const toothMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.02 });
  {
    const tbase = vec3(0.70, 0.66, 0.62);
    const ttip  = vec3(0.97, 0.96, 0.92);
    const tt = clamp(div(positionLocal.y, 0.15), 0.0, 1.0);
    toothMat.colorNode = mix(tbase, ttip, tt);
  }
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.2 });
  const gillMat = new THREE.MeshStandardMaterial({ color: 0x1a0f12, roughness: 0.7 });

  // ---------- root ----------
  const root = new THREE.Group();
  root.name = "Shark";

  // ---------- body front ----------
  const bodyFrontGeo = lathe([
    [0.46, -0.6], [0.55, -0.3], [0.60, 0.05], [0.59, 0.3], [0.56, 0.5], [0.42, 0.9]
  ]);
  const bodyFront = new THREE.Mesh(bodyFrontGeo, skinMat);
  bodyFront.name = "BodyFront";
  root.add(bodyFront);

  // ---------- head ----------
  const headGeo = lathe([
    [0.42, 0.0], [0.40, 0.05], [0.38, 0.1], [0.30, 0.3], [0.22, 0.5],
    [0.14, 0.65], [0.08, 0.8], [0.03, 0.92], [0.0, 1.0]
  ]);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.name = "Head";
  head.position.set(0, 0, 0.9);
  bodyFront.add(head);

  const eyeGeo = new THREE.SphereGeometry(0.07, 10, 8);
  const eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
  eyeLeft.name = "EyeLeft";
  eyeLeft.position.set(-0.28, 0.06, 0.28);
  head.add(eyeLeft);
  const eyeRight = new THREE.Mesh(eyeGeo, eyeMat);
  eyeRight.name = "EyeRight";
  eyeRight.position.set(0.28, 0.06, 0.28);
  head.add(eyeRight);

  function makeTeethRow(count, arcWidth, baseH, baseR, curveDepth, pointDown){
    const grp = new THREE.Group();
    for (let i = 0; i < count; i++){
      const tt = count === 1 ? 0.5 : i/(count-1);
      const x = (tt-0.5)*arcWidth;
      const edge = Math.abs(tt-0.5)*2;
      const z = -curveDepth*edge*edge;
      const sizeMul = lerp(1.0, 0.5, edge) * (i%2===0 ? 1.0 : 0.82);
      const g = coneAtBase(baseR*sizeMul, baseH*sizeMul, 6);
      const m = new THREE.Mesh(g, toothMat);
      m.position.set(x, 0, z);
      m.rotation.x = pointDown ? Math.PI : 0;
      m.rotation.z = (tt-0.5)*0.6;
      grp.add(m);
    }
    return grp;
  }

  const upperTeeth = makeTeethRow(9, 0.34, 0.13, 0.045, 0.06, true);
  upperTeeth.name = "UpperTeeth";
  upperTeeth.position.set(0, -0.15, 0.5);
  head.add(upperTeeth);

  const lowerJaw = new THREE.Group();
  lowerJaw.name = "LowerJaw";
  lowerJaw.position.set(0, -0.24, 0.14);
  head.add(lowerJaw);

  const lowerJawMeshGeo = coneAtBase(0.15, 0.55, 8);
  lowerJawMeshGeo.scale(0.75, 0.45, 1);
  const lowerJawMesh = new THREE.Mesh(lowerJawMeshGeo, skinMat);
  lowerJawMesh.name = "LowerJawMesh";
  lowerJawMesh.rotation.x = Math.PI/2;
  lowerJaw.add(lowerJawMesh);

  const lowerTeeth = makeTeethRow(8, 0.24, 0.11, 0.04, 0.04, false);
  lowerTeeth.name = "LowerTeeth";
  lowerTeeth.position.set(0, 0.09, 0.40);
  lowerJaw.add(lowerTeeth);

  // gill slits
  function makeGills(side){
    const grp = new THREE.Group();
    grp.name = side > 0 ? "GillsRight" : "GillsLeft";
    for (let i = 0; i < 5; i++){
      const g = new THREE.BoxGeometry(0.02, 0.20, 0.045);
      const m = new THREE.Mesh(g, gillMat);
      m.position.set(side*0.44, -0.06 - i*0.02, 0.58 - i*0.06);
      m.rotation.z = side*0.35;
      grp.add(m);
    }
    return grp;
  }
  const gillsLeft = makeGills(-1);
  bodyFront.add(gillsLeft);
  const gillsRight = makeGills(1);
  bodyFront.add(gillsRight);

  // ---------- dorsal fin ----------
  const DORSAL_REST = [-0.32, 0, 0];
  const dorsalFin = new THREE.Mesh(finGeo(0.34, 0.78, 0.16, 6), skinMat);
  dorsalFin.name = "DorsalFin";
  dorsalFin.position.set(0, 0.60, 0.05);
  dorsalFin.rotation.set(DORSAL_REST[0], DORSAL_REST[1], DORSAL_REST[2]);
  bodyFront.add(dorsalFin);

  // ---------- pectoral fins ----------
  const PEC_L_REST = [0.45, 0.15, Math.PI/2];
  const PEC_R_REST = [0.45, -0.15, -Math.PI/2];
  const pectoralFinLeft = new THREE.Mesh(finGeo(0.15, 0.9, 0.16, 6), skinMat);
  pectoralFinLeft.name = "PectoralFinLeft";
  pectoralFinLeft.position.set(-0.5, -0.02, 0.35);
  pectoralFinLeft.rotation.set(PEC_L_REST[0], PEC_L_REST[1], PEC_L_REST[2]);
  bodyFront.add(pectoralFinLeft);

  const pectoralFinRight = new THREE.Mesh(finGeo(0.15, 0.9, 0.16, 6), skinMat);
  pectoralFinRight.name = "PectoralFinRight";
  pectoralFinRight.position.set(0.5, -0.02, 0.35);
  pectoralFinRight.rotation.set(PEC_R_REST[0], PEC_R_REST[1], PEC_R_REST[2]);
  bodyFront.add(pectoralFinRight);

  // ---------- body rear ----------
  const bodyRearGeo = lathe([
    [0.46, 0.0], [0.40, -0.3], [0.34, -0.55], [0.24, -0.8], [0.16, -1.0]
  ]);
  const bodyRear = new THREE.Mesh(bodyRearGeo, skinMat);
  bodyRear.name = "BodyRear";
  bodyRear.position.set(0, 0, -0.6);
  bodyFront.add(bodyRear);

  const PELV_L_REST = [Math.PI, 0, 0.55];
  const PELV_R_REST = [Math.PI, 0, -0.55];
  const pelvicFinLeft = new THREE.Mesh(finGeo(0.09, 0.4, 0.2, 6), skinMat);
  pelvicFinLeft.name = "PelvicFinLeft";
  pelvicFinLeft.position.set(-0.20, -0.30, -0.55);
  pelvicFinLeft.rotation.set(PELV_L_REST[0], PELV_L_REST[1], PELV_L_REST[2]);
  bodyRear.add(pelvicFinLeft);

  const pelvicFinRight = new THREE.Mesh(finGeo(0.09, 0.4, 0.2, 6), skinMat);
  pelvicFinRight.name = "PelvicFinRight";
  pelvicFinRight.position.set(0.20, -0.30, -0.55);
  pelvicFinRight.rotation.set(PELV_R_REST[0], PELV_R_REST[1], PELV_R_REST[2]);
  bodyRear.add(pelvicFinRight);

  const ANAL_REST = [Math.PI, 0, 0];
  const analFin = new THREE.Mesh(finGeo(0.08, 0.3, 0.2, 6), skinMat);
  analFin.name = "AnalFin";
  analFin.position.set(0, -0.28, -0.85);
  analFin.rotation.set(ANAL_REST[0], ANAL_REST[1], ANAL_REST[2]);
  bodyRear.add(analFin);

  // ---------- tail stalk ----------
  const tailStalkGeo = lathe([
    [0.16, 0.0], [0.12, -0.2], [0.08, -0.38], [0.05, -0.55]
  ]);
  const tailStalk = new THREE.Mesh(tailStalkGeo, skinMat);
  tailStalk.name = "TailStalk";
  tailStalk.position.set(0, 0, -1.0);
  bodyRear.add(tailStalk);

  // ---------- caudal fin ----------
  const caudalFin = new THREE.Group();
  caudalFin.name = "CaudalFin";
  caudalFin.position.set(0, 0, -0.55);
  tailStalk.add(caudalFin);

  const upperLobe = new THREE.Mesh(finGeo(0.30, 1.15, 0.14, 8), skinMat);
  upperLobe.name = "UpperLobe";
  upperLobe.rotation.x = -1.15;
  caudalFin.add(upperLobe);

  const lowerLobe = new THREE.Mesh(finGeo(0.20, 0.62, 0.16, 8), skinMat);
  lowerLobe.name = "LowerLobe";
  lowerLobe.rotation.x = -2.55;
  caudalFin.add(lowerLobe);

  root.add(bodyFront); // (bodyFront already added; keep hierarchy explicit)

  // ================= POSE =================
  object_pose:
  root.userData._restBodyScale = new THREE.Vector3(1,1,1);

  function foldAmounts(amount){
    return {
      rootY: -amount*0.30,
      rootTilt: amount*0.22,
      pecFold: amount,
      pelvFold: amount*0.6,
      jawOpen: amount*0.04,
      dorsal: -amount*0.5,
      tailCurl: amount*0.5
    };
  }

  root.userData.pose = (s) => {
    const spd = Math.max(0, s.speed || 0);
    const t = s.t || 0;
    const hurtF = clamp01((0.75 - s.health) / 0.6);

    // --- reset transient outputs ---
    let rootPosY = 0, rootRotX = 0, rootRotZ = 0, rootRotY = 0;
    let headRotX = 0, headRotY = 0;
    let jawOpen = 0.03 + Math.sin(t*1.4)*0.015;
    let rearY = 0, tailY = 0, finY = 0;
    let rearX = 0, tailX = 0, finX = 0;
    let dorsalX = DORSAL_REST[0];
    let pecL = PEC_L_REST.slice(), pecR = PEC_R_REST.slice();
    let pelvL = PELV_L_REST.slice(), pelvR = PELV_R_REST.slice();

    const burst = smoothstepJS(1.6, 2.4, spd);
    const speedN = Math.min(spd, 6)/6;

    function swimCycle(strideAngle, idleMix){
      const waveAmpBase = lerp(0.10, 0.32, speedN) * lerp(1.0, 1.4, burst);
      const aRear = waveAmpBase*0.45, aTail = waveAmpBase*0.9, aFin = waveAmpBase*1.7;
      const idleR = Math.sin(t*1.4)*0.05*idleMix;
      const idleT = Math.sin(t*1.4+0.6)*0.08*idleMix;
      const idleF = Math.sin(t*1.4+1.1)*0.12*idleMix;
      rearY = Math.sin(strideAngle)*aRear*(1-idleMix) + idleR;
      tailY = Math.sin(strideAngle+0.5)*aTail*(1-idleMix) + idleT;
      finY  = Math.sin(strideAngle+1.0)*aFin*(1-idleMix) + idleF;
      headRotY = -Math.sin(strideAngle)*0.04*(1-idleMix);
    }

    if (s.action){
      const ph = clamp01(s.phase || 0);

      if (s.action === 'attack'){
        const wind = smoothstepJS(0,0.3,ph) * (1-smoothstepJS(0.3,0.45,ph));
        const commit = smoothstepJS(0.28,0.55,ph) * (1-smoothstepJS(0.55,0.85,ph));
        const rec = smoothstepJS(0.6,1.0,ph);
        rootRotX = -wind*0.12 + commit*0.10;
        rootPosY = commit*0.02;
        headRotX = wind*0.15 - commit*0.5;
        jawOpen = wind*0.25 + commit*0.85 - rec*0.6;
        tailY = wind*-0.18 + commit*0.3;
        finY = wind*-0.3 + commit*0.55;
        pecL[2] += commit*0.3; pecR[2] -= commit*0.3;
      } else if (s.action === 'fire'){
        const aim = smoothstepJS(0,0.4,ph)*(1-smoothstepJS(0.4,0.5,ph));
        const rel = smoothstepJS(0.42,0.55,ph)*(1-smoothstepJS(0.55,0.7,ph));
        const recoil = smoothstepJS(0.55,1.0,ph);
        headRotX = -aim*0.08 + rel*0.18;
        jawOpen = rel*0.7;
        rootRotX = recoil*-0.1;
        rootPosY = -recoil*0.03;
        tailY = recoil*-0.15;
      } else if (s.action === 'hit'){
        function pulse(peak,end){
          if (ph>=end) return 0;
          if (ph<peak) return smoothstepJS(0,peak,ph);
          return 1-smoothstepJS(peak,end,ph);
        }
        const p = pulse(0.12,0.55);
        rootRotZ = p*0.35;
        rootRotX = -p*0.1;
        headRotY = p*0.3;
        rearY = p*-0.2; tailY = p*0.3; finY = p*-0.35;
      } else if (s.action === 'block'){
        const env = envHold(ph,0.25,0.75);
        function envHold(p,a,b){ return Math.min(smoothstepJS(0,a,p), 1-smoothstepJS(b,1,p)); }
        rootRotX = env*0.18;
        rootPosY = -env*0.08;
        headRotX = env*0.25;
        pecL[0] -= env*0.5; pecR[0] -= env*0.5;
        pecL[2] -= env*0.4; pecR[2] += env*0.4;
        jawOpen = 0.01;
      } else if (s.action === 'gather'){
        const down = smoothstepJS(0,0.5,ph)*(1-smoothstepJS(0.85,1.0,ph));
        const grab = smoothstepJS(0.35,0.55,ph);
        headRotX = down*0.55;
        rootRotX = down*0.15;
        rootPosY = -down*0.15;
        jawOpen = down*0.4 - grab*0.35;
      } else if (s.action === 'deposit'){
        const down = smoothstepJS(0,0.6,ph)*(1-smoothstepJS(0.85,1.0,ph));
        const release = smoothstepJS(0.55,0.75,ph);
        headRotX = down*0.5;
        rootRotX = down*0.12;
        rootPosY = -down*0.13;
        jawOpen = down*0.15 + release*0.4;
      } else if (s.action === 'eat'){
        const down = smoothstepJS(0,0.2,ph)*(1-smoothstepJS(0.9,1.0,ph));
        const bite = Math.max(0,Math.sin(ph*Math.PI*2.5*2))*down;
        headRotX = down*0.45;
        jawOpen = down*0.15 + Math.max(0,bite)*0.45;
        rootPosY = -down*0.06;
      } else if (s.action === 'drink'){
        const env = smoothstepJS(0,0.25,ph)*(1-smoothstepJS(0.8,1.0,ph));
        headRotX = env*0.5;
        jawOpen = env*0.12;
        rootPosY = -env*0.07;
      } else if (s.action === 'jump'){
        const crouch = (1-smoothstepJS(0,0.33,ph))*smoothstepJS(0,0.12,ph);
        const ext = smoothstepJS(0.33,0.8,ph);
        rootPosY = -crouch*0.12 + ext*0.25;
        rootRotX = crouch*0.15 - ext*0.25;
        tailY = crouch*0.25 - ext*0.4;
        finY = crouch*0.35 - ext*0.6;
        pecL[0] -= ext*0.3; pecR[0] -= ext*0.3;
      } else if (s.action === 'land'){
        const reach = (1-smoothstepJS(0,0.4,ph));
        const impact = smoothstepJS(0.35,0.55,ph)*(1-smoothstepJS(0.55,0.7,ph));
        const settle = smoothstepJS(0.6,1.0,ph);
        rootRotX = reach*-0.2 + impact*0.25;
        rootPosY = -impact*0.18 + settle*0;
        pecL[0] -= reach*0.3*(1-settle); pecR[0] -= reach*0.3*(1-settle);
        tailY = impact*0.3;
      } else if (s.action === 'signal'){
        const env = envHoldS(ph,0.3,0.75);
        function envHoldS(p,a,b){ return Math.min(smoothstepJS(0,a,p), 1-smoothstepJS(b,1,p)); }
        rootRotX = -env*0.15;
        rootPosY = env*0.12;
        jawOpen = env*0.9;
        dorsalX = DORSAL_REST[0] + env*0.4;
        pecL[2] += env*0.5; pecR[2] -= env*0.5;
        pecL[0] -= env*0.4; pecR[0] -= env*0.4;
        finY = Math.sin(t*3)*0.1*env;
      } else if (s.action === 'sleep'){
        const amt = smoothstepJS(0,0.8,ph);
        const f = foldAmounts(amt);
        rootPosY = f.rootY; rootRotX = f.rootTilt;
        pecL[0] -= f.pecFold*0.6; pecR[0] -= f.pecFold*0.6;
        pecL[2] -= f.pecFold*0.5; pecR[2] += f.pecFold*0.5;
        pelvL[2] += 0; pelvR[2] -= 0;
        jawOpen = 0.01;
        dorsalX = DORSAL_REST[0] + f.dorsal;
        tailY = 0.1*amt; finY = 0.05*amt;
      } else if (s.action === 'wake'){
        const amt = 1 - smoothstepJS(0,0.85,ph);
        const f = foldAmounts(amt);
        rootPosY = f.rootY; rootRotX = f.rootTilt;
        pecL[0] -= f.pecFold*0.6; pecR[0] -= f.pecFold*0.6;
        pecL[2] -= f.pecFold*0.5; pecR[2] += f.pecFold*0.5;
        jawOpen = 0.02;
        dorsalX = DORSAL_REST[0] + f.dorsal;
        tailY = 0.1*amt; finY = 0.05*amt;
      } else if (s.action === 'die'){
        const fallT = smoothstepJS(0,0.7,ph);
        rootRotZ = fallT*1.15;
        rootPosY = -fallT*0.35;
        rootRotX = fallT*0.1;
        jawOpen = fallT*0.3;
        pecL[0] -= fallT*0.2; pecR[0] += fallT*0.3;
        tailY = 0.05*fallT; finY = -0.05*fallT;
        dorsalX = DORSAL_REST[0] - fallT*0.3;
      } else if (s.action === 'evolve'){
        const env = envHoldE(ph,0.3,0.75);
        function envHoldE(p,a,b){ return Math.min(smoothstepJS(0,a,p), 1-smoothstepJS(b,1,p)); }
        rootRotX = -env*0.1;
        jawOpen = env*0.95;
        pecL[2] += env*0.6; pecR[2] -= env*0.6;
        pelvL[2] += env*0.5; pelvR[2] -= env*0.5;
        dorsalX = DORSAL_REST[0] + env*0.5;
        rearY = Math.sin(t*8)*0.05*env;
        tailY = Math.sin(t*8+1)*0.08*env;
        finY = Math.sin(t*8+2)*0.12*env;
      }
    } else if (!s.grounded){
      // airborne glide / breach
      rootRotX = -0.15;
      headRotX = -0.08;
      pecL[0] -= 0.5; pecR[0] -= 0.5;
      pecL[2] += 0.35; pecR[2] -= 0.35;
      pelvL[2] += 0.3; pelvR[2] -= 0.3;
      tailY = Math.sin(t*2.5)*0.15;
      finY = Math.sin(t*2.5+0.6)*0.25;
      dorsalX = DORSAL_REST[0] - 0.15;
    } else {
      // normal locomotion
      const idleMix = 1 - smoothstepJS(0, 0.15, spd);
      const freqMul = lerp(1.0, 1.15, burst);
      const strideAngle = (s.stride || 0) * Math.PI * 2 * freqMul;
      swimCycle(strideAngle, idleMix);

      // stand-only extra life
      headRotY += Math.sin(t*0.5)*0.05;
      rootPosY = Math.sin(t*1.1)*0.01*idleMix;

      // pectoral tuck at speed, sculling at stand
      const tuck = burst;
      pecL[0] -= tuck*0.45; pecR[0] -= tuck*0.45;
      pecL[2] -= tuck*0.25; pecR[2] += tuck*0.25;
      const scull = Math.sin(t*1.6)*0.08*idleMix;
      pecL[0] += scull; pecR[0] += scull;
      dorsalX = DORSAL_REST[0] - burst*0.25;

      // top-speed extension
      headRotX = -burst*0.06;
      rootRotX = -burst*0.05;

      // turn overlay (difference from standing, added to spine/head/fins)
      const turn = s.turn || 0;
      headRotY += turn*0.35;
      rootRotZ = turn*-0.22;
      rearY += turn*0.12;
      tailY += turn*0.22;
      finY += turn*0.32;
      if (turn > 0){ pecR[0] -= turn*0.2; } else { pecL[0] += turn*0.2; }
    }

    // --- hurt overlay (additive) ---
    rootRotZ += hurtF*0.28;
    headRotX += hurtF*0.12;
    pecR[0] -= hurtF*0.3;
    dorsalX -= hurtF*0.15;
    rootPosY -= hurtF*0.04;

    // --- breathing (always, subtle) ---
    const breathe = 1 + Math.sin(t*1.2)*0.01;
    bodyFront.scale.set(breathe, 1, 2 - breathe);

    // ---- apply ----
    root.position.set(0, rootPosY, 0);
    root.rotation.set(rootRotX, rootRotY, rootRotZ);

    head.rotation.set(headRotX, headRotY, 0);
    lowerJaw.rotation.set(clamp01(jawOpen) * 1.1, 0, 0);

    bodyRear.rotation.set(0, rearY, 0);
    tailStalk.rotation.set(0, tailY, 0);
    caudalFin.rotation.set(0, finY, 0);

    dorsalFin.rotation.set(dorsalX, 0, 0);
    pectoralFinLeft.rotation.set(pecL[0], pecL[1], pecL[2]);
    pectoralFinRight.rotation.set(pecR[0], pecR[1], pecR[2]);
    pelvicFinLeft.rotation.set(pelvL[0], pelvL[1], pelvL[2]);
    pelvicFinRight.rotation.set(pelvR[0], pelvR[1], pelvR[2]);
    analFin.rotation.set(ANAL_REST[0], ANAL_REST[1], ANAL_REST[2]);
  };

  return root;
}