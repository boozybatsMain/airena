function build(THREE, TSL) {
  const {
    vec3, float, mix, smoothstep, sin, dot, normalize, sub, pow, clamp,
    oneMinus, cameraPosition, positionWorld, positionLocal, normalWorld,
    normalLocal, uniform
  } = TSL;

  // ---------- helpers ----------
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
  const smoothJS = (e0, e1, x) => ease((x - e0) / (e1 - e0));
  const tri = (x, c, w) => Math.max(0, 1 - Math.abs(x - c) / w);
  const frac = (x) => x - Math.floor(x);

  const glow = uniform(0.0);

  function fresnel(power) {
    const viewDir = normalize(sub(cameraPosition, positionWorld));
    const d = clamp(dot(normalWorld, viewDir), float(0), float(1));
    return pow(clamp(oneMinus(d), float(0), float(1)), float(power));
  }

  // ---------- materials ----------
  const armorMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.85, roughness: 0.32 });
  armorMat.colorNode = mix(
    vec3(0.07, 0.09, 0.12), vec3(0.27, 0.32, 0.37),
    smoothstep(float(-0.4), float(0.5), positionLocal.y)
  );
  armorMat.emissiveNode = vec3(0.15, 0.55, 0.65).mul(fresnel(2.4)).mul(float(0.5).add(glow.mul(2.2)));

  const skinMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.05, roughness: 0.55 });
  skinMat.colorNode = mix(
    vec3(0.04, 0.26, 0.30), vec3(0.10, 0.44, 0.48),
    sin(positionLocal.y.mul(float(5.0))).mul(float(0.5)).add(float(0.5))
  );
  skinMat.emissiveNode = vec3(0.05, 0.3, 0.34).mul(fresnel(3.0)).mul(float(0.2).add(glow.mul(1.4)));

  const eyeMat = new THREE.MeshStandardNodeMaterial({ metalness: 0.1, roughness: 0.25 });
  eyeMat.colorNode = mix(
    vec3(0.65, 0.12, 0.04), vec3(0.02, 0.02, 0.02),
    smoothstep(float(0.82), float(0.93), clamp(dot(normalLocal, vec3(0, 0, 1)), float(0), float(1)))
  );

  const beakMat = new THREE.MeshStandardNodeMaterial({ color: 0x0d0a08, metalness: 0.15, roughness: 0.5 });

  // ---------- root & mantle ----------
  const root = new THREE.Group();
  root.name = 'ArmouredOctopus';

  const MANTLE_REST_Y = 1.5;
  const mantle = new THREE.Group();
  mantle.name = 'Mantle';
  mantle.position.set(0, MANTLE_REST_Y, 0);
  root.add(mantle);

  const mantleCore = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), skinMat);
  mantleCore.name = 'MantleCore';
  mantleCore.scale.set(1.05, 1.15, 1.0);
  mantle.add(mantleCore);

  const carapaceShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), armorMat
  );
  carapaceShell.name = 'CarapaceShell';
  carapaceShell.position.set(0, 0.05, 0);
  carapaceShell.scale.set(1.05, 1.05, 1.0);
  carapaceShell.userData.restPos = carapaceShell.position.clone();
  carapaceShell.userData.outDir = new THREE.Vector3(0, 1, 0);
  mantle.add(carapaceShell);

  const browPlate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.22), armorMat);
  browPlate.name = 'BrowPlate';
  browPlate.position.set(0, 0.20, 0.42);
  browPlate.rotation.x = -0.35;
  browPlate.userData.restPos = browPlate.position.clone();
  browPlate.userData.outDir = new THREE.Vector3(0, 0.4, 1).normalize();
  mantle.add(browPlate);

  const cheekPlateL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.32), armorMat);
  cheekPlateL.name = 'CheekPlateL';
  cheekPlateL.position.set(-0.42, 0.0, 0.20);
  cheekPlateL.rotation.y = 0.4;
  cheekPlateL.userData.restPos = cheekPlateL.position.clone();
  cheekPlateL.userData.outDir = new THREE.Vector3(-1, 0, 0.2).normalize();
  mantle.add(cheekPlateL);

  const cheekPlateR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.32), armorMat);
  cheekPlateR.name = 'CheekPlateR';
  cheekPlateR.position.set(0.42, 0.0, 0.20);
  cheekPlateR.rotation.y = -0.4;
  cheekPlateR.userData.restPos = cheekPlateR.position.clone();
  cheekPlateR.userData.outDir = new THREE.Vector3(1, 0, 0.2).normalize();
  mantle.add(cheekPlateR);

  const collarArmor = new THREE.Mesh(new THREE.TorusGeometry(0.50, 0.07, 8, 16), armorMat);
  collarArmor.name = 'CollarArmor';
  collarArmor.position.set(0, -0.42, 0);
  collarArmor.rotation.x = Math.PI / 2;
  mantle.add(collarArmor);

  const spikes = [];
  const spikeZ = [0.35, 0.02, -0.32];
  for (let k = 0; k < 3; k++) {
    const size = 0.09 - k * 0.015;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(size, 0.24 - k * 0.03, 6), armorMat);
    sp.name = `DorsalSpike${k}`;
    sp.position.set(0, 0.60 - k * 0.02, spikeZ[k]);
    sp.userData.restPos = sp.position.clone();
    sp.userData.outDir = new THREE.Vector3(0, 1, spikeZ[k] * 0.4).normalize();
    mantle.add(sp);
    spikes.push(sp);
  }

  const eyeLeft = new THREE.Object3D();
  eyeLeft.name = 'EyeLeft';
  eyeLeft.position.set(-0.28, 0.10, 0.46);
  mantle.add(eyeLeft);
  const eyeLeftBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), eyeMat);
  eyeLeftBall.name = 'EyeLeft_Ball';
  eyeLeft.add(eyeLeftBall);

  const eyeRight = new THREE.Object3D();
  eyeRight.name = 'EyeRight';
  eyeRight.position.set(0.28, 0.10, 0.46);
  mantle.add(eyeRight);
  const eyeRightBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), eyeMat);
  eyeRightBall.name = 'EyeRight_Ball';
  eyeRight.add(eyeRightBall);

  const upperBeak = new THREE.Object3D();
  upperBeak.name = 'UpperBeak';
  upperBeak.position.set(0, -0.44, 0.16);
  mantle.add(upperBeak);
  const upperBeakMesh = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 5), beakMat);
  upperBeakMesh.name = 'UpperBeak_Mesh';
  upperBeakMesh.rotation.x = Math.PI * 0.55;
  upperBeakMesh.position.set(0, 0.03, 0.06);
  upperBeak.add(upperBeakMesh);

  const lowerBeak = new THREE.Object3D();
  lowerBeak.name = 'LowerBeak';
  lowerBeak.position.set(0, -0.52, 0.16);
  mantle.add(lowerBeak);
  const lowerBeakMesh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 5), beakMat);
  lowerBeakMesh.name = 'LowerBeak_Mesh';
  lowerBeakMesh.rotation.x = -Math.PI * 0.45;
  lowerBeakMesh.position.set(0, -0.02, 0.05);
  lowerBeak.add(lowerBeakMesh);

  const siphon = new THREE.Object3D();
  siphon.name = 'Siphon';
  siphon.position.set(0.20, -0.24, -0.34);
  mantle.add(siphon);
  const siphonMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.28, 8), armorMat);
  siphonMesh.name = 'Siphon_Mesh';
  siphonMesh.rotation.x = Math.PI * 0.45;
  siphonMesh.position.set(0, 0, -0.10);
  siphon.add(siphonMesh);

  // ---------- tentacles ----------
  const ARM_COUNT = 8;
  const SEG_LENGTHS = [0.50, 0.45, 0.38, 0.30, 0.22];
  const SEG_RTOP = [0.13, 0.10, 0.075, 0.055, 0.035];
  const SEG_RBOT = [0.10, 0.075, 0.055, 0.035, 0.018];
  const SWEEP_COEF = [1.0, 0.85, 0.6, 0.4, 0.25];
  const CURL_COEF = [0.35, 0.6, 0.85, 1.0, 1.1];

  const segGeos = SEG_LENGTHS.map((len, j) => {
    const g = new THREE.CylinderGeometry(SEG_RTOP[j], SEG_RBOT[j], len, 8, 1);
    g.translate(0, -len / 2, 0);
    return g;
  });
  const ringGeos = [0, 1, 2].map((j) => new THREE.TorusGeometry(SEG_RTOP[j] * 1.15, SEG_RTOP[j] * 0.35, 6, 10));
  const tipGeo = new THREE.ConeGeometry(0.05, 0.14, 6);

  const tentacles = [];
  for (let i = 0; i < ARM_COUNT; i++) {
    const angle = i * (Math.PI / 4);
    const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));

    const base = new THREE.Object3D();
    base.name = `Tentacle${i}`;
    base.position.set(dir.x * 0.42, -0.42, dir.z * 0.42);
    const lean = 0.55;
    const leanDir = new THREE.Vector3(dir.x * Math.sin(lean), -Math.cos(lean), dir.z * Math.sin(lean)).normalize();
    base.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), leanDir);
    mantle.add(base);

    const segs = [];
    let parent = base;
    for (let j = 0; j < 5; j++) {
      const seg = new THREE.Object3D();
      seg.name = `Tentacle${i}_Seg${j}`;
      seg.position.set(0, j === 0 ? 0 : -SEG_LENGTHS[j - 1], 0);
      parent.add(seg);

      const mesh = new THREE.Mesh(segGeos[j], skinMat);
      mesh.name = `Tentacle${i}_Seg${j}_Mesh`;
      seg.add(mesh);

      if (j < 3) {
        const ring = new THREE.Mesh(ringGeos[j], armorMat);
        ring.name = `Tentacle${i}_Seg${j}_Armor`;
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.02;
        seg.add(ring);
      }
      if (j === 4) {
        const tip = new THREE.Mesh(tipGeo, armorMat);
        tip.name = `Tentacle${i}_Tip`;
        tip.rotation.x = Math.PI;
        tip.position.set(0, -SEG_LENGTHS[4] - 0.03, 0);
        seg.add(tip);
      }

      segs.push(seg);
      parent = seg;
    }

    tentacles.push({ base, segs, dir, angle, index: i });
  }

  function poseArmDirect(arm, sweep, curl, ripple, ripplePhase, extraZ) {
    extraZ = extraZ || 0;
    for (let j = 0; j < 5; j++) {
      const seg = arm.segs[j];
      const sc = SWEEP_COEF[j], cc = CURL_COEF[j];
      const rip = ripple * Math.sin(ripplePhase * Math.PI * 2 + j * 0.8) * cc;
      seg.rotation.x = sweep * sc + rip;
      seg.rotation.z = curl * cc + extraZ * sc;
    }
  }

  const openPlates = [browPlate, cheekPlateL, cheekPlateR, carapaceShell, ...spikes];

  function resetAll() {
    mantle.position.set(0, MANTLE_REST_Y, 0);
    mantle.rotation.set(0, 0, 0);
    mantle.scale.set(1, 1, 1);
    for (const p of openPlates) {
      p.position.copy(p.userData.restPos);
      p.rotation.set(0, 0, 0);
      p.scale.set(1, 1, 1);
    }
    collarArmor.rotation.x = Math.PI / 2;
    eyeLeft.rotation.set(0, 0, 0);
    eyeRight.rotation.set(0, 0, 0);
    upperBeak.rotation.set(0, 0, 0);
    lowerBeak.rotation.set(0, 0, 0);
    siphon.rotation.set(0, 0, 0);
    siphon.scale.set(1, 1, 1);
    glow.value = 0.0;
    for (const arm of tentacles) {
      for (const seg of arm.segs) seg.rotation.set(0, 0, 0);
    }
  }

  // ---------- locomotion ----------
  function runLocomotion(s) {
    const speed = s.speed || 0;
    const stride = s.stride || 0;
    const turn = s.turn || 0;
    const health = s.health === undefined ? 1 : s.health;
    const damage = clamp01(1 - health);
    const grounded = s.grounded !== false;
    const t = s.t || 0;

    const swimFactor = smoothJS(1.3, 2.4, speed);
    const sprintFactor = smoothJS(2.6, 6.0, speed);
    const creepFactor = 1 - smoothJS(0.0, 1.0, speed);
    const breathe = 0.02 * Math.sin(t * 1.3);

    let crouch = speed < 0.05 ? 0.0 : 0.05 * creepFactor;
    const pulsePhase = frac(stride);
    const pulse = swimFactor * Math.max(0, Math.sin(pulsePhase * Math.PI * 2));

    let posY = MANTLE_REST_Y - crouch + swimFactor * 0.15 - damage * 0.22;
    let posZ = swimFactor * 0.05;
    let rotX = -swimFactor * 0.15 - sprintFactor * 0.35 + damage * 0.10;
    let rotY = turn * 0.15;
    let rotZ = -turn * 0.22 + damage * 0.18;

    let sx = 1 - pulse * 0.10 * swimFactor + breathe * 0.5;
    let sy = 1 - pulse * 0.06 * swimFactor - sprintFactor * 0.15 + breathe;
    let sz = 1 + pulse * 0.05 * swimFactor + sprintFactor * 0.5 + breathe * 0.3;

    mantle.position.set(0, posY, posZ);
    mantle.rotation.set(rotX, rotY, rotZ);
    mantle.scale.set(sx, sy, sz);

    if (speed < 0.05) {
      eyeLeft.rotation.y = 0.15 * Math.sin(t * 0.5);
      eyeRight.rotation.y = 0.15 * Math.sin(t * 0.5 + 0.6);
    }

    const crawlAmp = Math.min(1, speed / 2) * 0.6;

    for (const arm of tentacles) {
      const dir = arm.dir, i = arm.index;
      let sweep = 0, curl = 0.28, ripple = 0, ripplePhase = 0;

      if (speed < 0.05) {
        curl = 0.30 + 0.05 * Math.sin(t * 0.6 + i * 0.9);
        sweep = 0.05 * Math.sin(t * 0.4 + i * 1.3);
        ripple = 0.03;
        ripplePhase = t * 0.15 + i * 0.3;
      } else if (!grounded) {
        sweep = -0.9 - sprintFactor * 0.2;
        curl = 0.14;
        ripple = 0.10;
        ripplePhase = t * 0.6 + i * 0.25;
      } else {
        const armPhase = frac(stride + i / 8);
        const crawlSweep = Math.sin(armPhase * Math.PI * 2) * crawlAmp;
        const crawlCurl = 0.25 + 0.15 * Math.max(0, Math.cos(armPhase * Math.PI * 2));
        const crawlRipple = 0.32;
        const swimSweep = -0.75 - sprintFactor * 0.3;
        const swimCurl = 0.12;
        const swimRipple = 0.10 + swimFactor * 0.05;

        sweep = lerp(crawlSweep, swimSweep, swimFactor);
        curl = lerp(crawlCurl, swimCurl, swimFactor);
        ripple = lerp(crawlRipple, swimRipple, swimFactor);
        ripplePhase = armPhase;
      }

      const insideAmt = clamp01(dir.x * -turn);
      const outsideAmt = clamp01(dir.x * turn);
      curl += insideAmt * 0.35;
      sweep += outsideAmt * 0.25 - insideAmt * 0.15;

      if (dir.x > 0.1) {
        curl += damage * 0.5;
        sweep *= (1 - damage * 0.6);
        ripple *= (1 - damage * 0.5);
      }

      poseArmDirect(arm, sweep, curl, ripple, ripplePhase, 0);
    }
  }

  // ---------- actions ----------
  function runAction(s) {
    const phase = clamp01(s.phase || 0);

    switch (s.action) {
      case 'attack': {
        let sweep = 0, curl = 0.3;
        if (phase < 0.35) { const p = ease(phase / 0.35); sweep = lerp(0, -0.9, p); curl = lerp(0.3, 0.85, p); }
        else if (phase < 0.6) { const p = ease((phase - 0.35) / 0.25); sweep = lerp(-0.9, 1.3, p); curl = lerp(0.85, 0.15, p); }
        else { const p = ease((phase - 0.6) / 0.4); sweep = lerp(1.3, 0, p); curl = lerp(0.15, 0.28, p); }
        poseArmDirect(tentacles[0], sweep, curl, 0.15, phase * 3, 0);
        for (let i = 1; i < 8; i++) poseArmDirect(tentacles[i], -0.12, 0.35, 0.05, phase, 0);
        const lunge = tri(phase, 0.5, 0.25);
        mantle.position.z += lunge * 0.20;
        mantle.rotation.x += lunge * 0.14;
        mantle.position.y -= lunge * 0.06;
        break;
      }
      case 'fire': {
        const aim = ease(Math.min(phase / 0.3, 1));
        siphon.rotation.x = lerp(0, -0.55, aim);
        const burst = tri(phase, 0.40, 0.12);
        mantle.scale.set(1 - burst * 0.14, 1 - burst * 0.08, 1 + burst * 0.10);
        const recoil = phase > 0.4 ? ease((phase - 0.4) / 0.6) : 0;
        mantle.position.z = -recoil * 0.12 * (1 - (phase > 0.9 ? ease((phase - 0.9) / 0.1) : 0));
        for (const arm of tentacles) poseArmDirect(arm, -0.10, 0.34, 0.04, phase, 0);
        break;
      }
      case 'hit': {
        const impulse = (1 - phase) * (1 - phase);
        mantle.position.z -= impulse * 0.20;
        mantle.rotation.z += impulse * 0.28;
        mantle.rotation.x += impulse * 0.10;
        for (const arm of tentacles) poseArmDirect(arm, -impulse * 0.3, 0.3 + impulse * 0.25, impulse * 0.1, phase, 0);
        break;
      }
      case 'block': {
        const p = ease(Math.min(phase * 3, 1));
        mantle.position.y -= 0.24 * p;
        mantle.rotation.x += 0.16 * p;
        for (const arm of tentacles) {
          const front = clamp01(arm.dir.z);
          const sweep = lerp(0, -0.5 * front + 0.15, p);
          const curl = lerp(0.28, 0.75, p);
          poseArmDirect(arm, sweep, curl, 0.02, phase, front * 0.3 * p);
        }
        break;
      }
      case 'gather': {
        let down = 0, curl = 0.3;
        if (phase < 0.4) { const p = ease(phase / 0.4); down = p; curl = lerp(0.3, 0.1, p); }
        else if (phase < 0.6) { const p = ease((phase - 0.4) / 0.2); down = 1; curl = lerp(0.1, 0.9, p); }
        else { const p = ease((phase - 0.6) / 0.4); down = lerp(1, 0.3, p); curl = 0.9; }
        mantle.position.y -= down * 0.35;
        mantle.rotation.x += down * 0.25;
        poseArmDirect(tentacles[0], -down * 1.1, curl, 0.05, phase, 0);
        poseArmDirect(tentacles[1], -down * 0.7, curl * 0.8, 0.05, phase, 0.2);
        poseArmDirect(tentacles[7], -down * 0.7, curl * 0.8, 0.05, phase, -0.2);
        for (const i of [2, 3, 4, 5, 6]) poseArmDirect(tentacles[i], -down * 0.15, 0.35, 0.03, phase, 0);
        break;
      }
      case 'deposit': {
        let down = 0, curl = 0.9;
        if (phase < 0.5) { const p = ease(phase / 0.5); down = p; curl = 0.9; }
        else if (phase < 0.7) { const p = ease((phase - 0.5) / 0.2); down = 1; curl = lerp(0.9, 0.1, p); }
        else { const p = ease((phase - 0.7) / 0.3); down = lerp(1, 0, p); curl = lerp(0.1, 0.3, p); }
        mantle.position.y -= down * 0.35;
        mantle.rotation.x += down * 0.22;
        poseArmDirect(tentacles[0], -down * 1.0, curl, 0.04, phase, 0);
        poseArmDirect(tentacles[1], -down * 0.65, curl * 0.8, 0.04, phase, 0.15);
        poseArmDirect(tentacles[7], -down * 0.65, curl * 0.8, 0.04, phase, -0.15);
        for (const i of [2, 3, 4, 5, 6]) poseArmDirect(tentacles[i], -down * 0.1, 0.32, 0.02, phase, 0);
        break;
      }
      case 'eat': {
        const nCycles = 2.5;
        const downP = ease(Math.min(phase / 0.15, 1)) * (1 - ease(Math.max(0, (phase - 0.85) / 0.15)));
        mantle.position.y -= downP * 0.30;
        mantle.rotation.x += downP * 0.22;
        const bite = Math.max(0, Math.sin(phase * nCycles * Math.PI * 2)) * 0.55;
        upperBeak.rotation.x = -bite;
        lowerBeak.rotation.x = bite;
        for (const i of [0, 1, 7]) poseArmDirect(tentacles[i], -downP * 0.6 - bite * 0.2, 0.5 + bite * 0.2, 0.05, phase, 0);
        for (const i of [2, 3, 4, 5, 6]) poseArmDirect(tentacles[i], -downP * 0.1, 0.32, 0.02, phase, 0);
        break;
      }
      case 'drink': {
        let down = 0;
        if (phase < 0.3) down = ease(phase / 0.3);
        else if (phase < 0.7) down = 1;
        else down = ease(1 - (phase - 0.7) / 0.3);
        mantle.position.y -= down * 0.32;
        mantle.rotation.x += down * 0.25;
        mantle.scale.y = 1 - down * 0.03 * Math.sin(phase * 10);
        for (const i of [0, 1, 7]) poseArmDirect(tentacles[i], -down * 0.4, 0.35, 0.02, phase, 0);
        for (const i of [2, 3, 4, 5, 6]) poseArmDirect(tentacles[i], -down * 0.08, 0.30, 0.01, phase, 0);
        break;
      }
      case 'jump': {
        if (phase < 0.33) {
          const p = ease(phase / 0.33);
          mantle.position.y -= 0.30 * p;
          mantle.scale.set(1 + 0.12 * p, 1 - 0.22 * p, 1 + 0.10 * p);
          for (const arm of tentacles) poseArmDirect(arm, 0.3 * p, 0.6 * p, 0.02, phase, 0);
        } else {
          const p = ease((phase - 0.33) / 0.67);
          mantle.position.y += lerp(-0.30, 0.35, p);
          mantle.scale.set(lerp(1.12, 0.95, p), lerp(0.78, 1.25, p), lerp(1.10, 0.95, p));
          for (const arm of tentacles) poseArmDirect(arm, lerp(0.3, -0.9, p), lerp(0.6, 0.15, p), 0.05, phase, 0);
        }
        break;
      }
      case 'land': {
        if (phase < 0.35) {
          const p = ease(phase / 0.35);
          mantle.position.y += 0.15 * p;
          for (const arm of tentacles) poseArmDirect(arm, lerp(-0.6, 0.2, p), lerp(0.2, 0.15, p), 0.03, phase, 0);
        } else if (phase < 0.6) {
          const p = ease((phase - 0.35) / 0.25);
          mantle.position.y -= 0.30 * p;
          mantle.scale.set(1 + 0.18 * p, 1 - 0.30 * p, 1 + 0.15 * p);
          for (const arm of tentacles) {
            const s2 = arm.dir.x;
            poseArmDirect(arm, 0.1, lerp(0.15, 0.5, p), 0.05, phase, s2 * 0.4 * p);
          }
        } else {
          const p = ease((phase - 0.6) / 0.4);
          mantle.position.y -= lerp(0.30, 0, p);
          mantle.scale.set(lerp(1.18, 1, p), lerp(0.70, 1, p), lerp(1.15, 1, p));
          for (const arm of tentacles) {
            const s2 = arm.dir.x;
            poseArmDirect(arm, lerp(0.1, 0, p), lerp(0.5, 0.28, p), 0.02, phase, s2 * lerp(0.4, 0, p));
          }
        }
        break;
      }
      case 'signal': {
        let open = 0;
        if (phase < 0.4) open = ease(phase / 0.4);
        else if (phase < 0.7) open = 1;
        else open = ease(1 - (phase - 0.7) / 0.3);
        mantle.position.y += open * 0.28;
        mantle.scale.set(1 + open * 0.16, 1 + open * 0.16, 1 + open * 0.16);
        glow.value = open * 1.5;
        for (const arm of tentacles) {
          const outAngle = arm.dir.x;
          poseArmDirect(arm, -0.3 * open, lerp(0.28, -0.15, open), 0.06 * open, phase * 2 + arm.index * 0.1, outAngle * 0.5 * open);
        }
        break;
      }
      case 'sleep': {
        const p = ease(phase);
        mantle.position.y = lerp(MANTLE_REST_Y, MANTLE_REST_Y - 1.05, p);
        mantle.rotation.x = lerp(0, 0.32, p);
        for (const arm of tentacles) poseArmDirect(arm, lerp(0, -0.35, p), lerp(0.3, 0.85, p), 0.02, 0, 0);
        break;
      }
      case 'wake': {
        const p = ease(phase);
        mantle.position.y = lerp(MANTLE_REST_Y - 1.05, MANTLE_REST_Y, p);
        mantle.rotation.x = lerp(0.32, 0, p);
        for (const arm of tentacles) poseArmDirect(arm, lerp(-0.35, 0, p), lerp(0.85, 0.3, p), 0.02, 0, 0);
        break;
      }
      case 'die': {
        const p = ease(phase);
        mantle.position.y = lerp(MANTLE_REST_Y, 0.28, p);
        mantle.rotation.x = lerp(0, 1.25, p);
        mantle.rotation.z = lerp(0, 0.55, p);
        for (const arm of tentacles) {
          const i = arm.index;
          const sw = (i % 2 === 0 ? 0.55 : -0.55) + arm.dir.z * 0.3;
          poseArmDirect(arm, lerp(0, sw, p), lerp(0.3, 0.08 + (i * 0.05) % 0.3, p), 0.02 * (1 - p), phase, 0);
        }
        break;
      }
      case 'evolve': {
        let brace = 0, open = 0;
        if (phase < 0.2) { brace = ease(phase / 0.2); }
        else if (phase < 0.5) { brace = 1; open = ease((phase - 0.2) / 0.3); }
        else if (phase < 0.7) { brace = 1; open = 1; }
        else { const p = ease((phase - 0.7) / 0.3); brace = 1 - p; open = 1 - p; }

        mantle.position.y -= brace * 0.12;
        glow.value = open * 1.8;

        for (const p of openPlates) {
          const d = p.userData.outDir;
          p.position.set(
            p.userData.restPos.x + d.x * open * 0.35,
            p.userData.restPos.y + d.y * open * 0.35,
            p.userData.restPos.z + d.z * open * 0.35
          );
        }

        for (const arm of tentacles) {
          const outAngle = arm.dir.x;
          const sweep = lerp(-0.15 * brace, -0.25 * open + 0.15, open);
          poseArmDirect(arm, sweep, lerp(0.55 * brace, 0.15, open), 0.04 * open, phase, outAngle * 0.4 * open);
        }
        break;
      }
      default:
        runLocomotion({ speed: 0, stride: 0, turn: 0, health: 1, grounded: true, t: s.t || 0 });
    }
  }

  // ---------- master pose ----------
  root.userData.pose = (s) => {
    resetAll();
    if (s && s.action) {
      runAction(s);
    } else {
      runLocomotion(s || {});
    }
  };

  return root;
}