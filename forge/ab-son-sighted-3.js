function build(THREE, TSL) {
  const root = new THREE.Group();
  root.name = 'ArmouredOctopus';

  const armorMat = new THREE.MeshStandardMaterial({ color: 0x3a4a52, metalness: 0.85, roughness: 0.35 });
  const armorMatDark = new THREE.MeshStandardMaterial({ color: 0x232d31, metalness: 0.8, roughness: 0.4 });
  const tentacleMat = new THREE.MeshStandardMaterial({ color: 0x5c3f56, roughness: 0.75, metalness: 0.05 });
  const mantleMat = new THREE.MeshStandardMaterial({ color: 0x4a3350, roughness: 0.6, metalness: 0.1 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffcf3d, emissive: 0xee8800, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.1 });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.3 });
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, metalness: 0.9, roughness: 0.25 });

  try {
    eyeMat.emissiveNode = TSL.vec3(1.0, 0.55, 0.05).mul(TSL.sin(TSL.time.mul(3.0)).mul(0.15).add(0.5));
    const vDir = TSL.normalize(TSL.sub(TSL.cameraPosition, TSL.positionWorld));
    const fres = TSL.pow(TSL.oneMinus(TSL.clamp(TSL.dot(TSL.normalWorld, vDir), 0.0, 1.0)), 3.0);
    mantleMat.emissiveNode = TSL.vec3(0.18, 0.05, 0.22).mul(fres);
  } catch (e) {}

  const MANTLE_R = 0.5;
  const BODY_Y = 0.95;

  const Body = new THREE.Group();
  Body.name = 'Body';
  Body.position.set(0, BODY_Y, 0);
  root.add(Body);

  const mantleHull = new THREE.Mesh(new THREE.SphereGeometry(MANTLE_R, 24, 16), mantleMat);
  mantleHull.scale.set(1.0, 1.08, 1.12);
  mantleHull.name = 'MantleHull';
  Body.add(mantleHull);

  function addPlate(name, hingePos, size, offset, mat) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(hingePos[0], hingePos[1], hingePos[2]);
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
    m.position.set(offset[0], offset[1], offset[2]);
    g.add(m);
    Body.add(g);
    return g;
  }

  const plateCrown = addPlate('PlateCrown', [0, MANTLE_R * 0.9, -MANTLE_R * 0.15], [0.55, 0.12, 0.7], [0, 0.06, 0.1], armorMat);
  const plateBrowL = addPlate('PlateBrowLeft', [-0.22, MANTLE_R * 0.55, MANTLE_R * 0.75], [0.22, 0.08, 0.16], [-0.06, 0.03, 0], armorMat);
  const plateBrowR = addPlate('PlateBrowRight', [0.22, MANTLE_R * 0.55, MANTLE_R * 0.75], [0.22, 0.08, 0.16], [0.06, 0.03, 0], armorMat);
  const plateChest = addPlate('PlateChest', [0, -MANTLE_R * 0.05, MANTLE_R * 0.85], [0.5, 0.45, 0.14], [0, -0.2, 0.05], armorMatDark);
  const plateFlankL = addPlate('PlateFlankLeft', [-MANTLE_R * 0.85, MANTLE_R * 0.1, 0], [0.14, 0.55, 0.6], [-0.06, -0.05, 0], armorMat);
  const plateFlankR = addPlate('PlateFlankRight', [MANTLE_R * 0.85, MANTLE_R * 0.1, 0], [0.14, 0.55, 0.6], [0.06, -0.05, 0], armorMat);
  const plateRear = addPlate('PlateRear', [0, MANTLE_R * 0.35, -MANTLE_R * 0.85], [0.6, 0.5, 0.16], [0, -0.05, -0.08], armorMatDark);

  for (let k = 0; k < 3; k++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), spikeMat);
    spike.position.set((k - 1) * 0.16, 0.13, 0.05);
    spike.name = `CrownSpike${k}`;
    plateCrown.add(spike);
  }

  const eyeGeo = new THREE.SphereGeometry(0.09, 12, 10);
  const eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
  eyeLeft.name = 'EyeLeft';
  eyeLeft.position.set(-0.2, MANTLE_R * 0.45, MANTLE_R * 0.92);
  Body.add(eyeLeft);
  const eyeRight = new THREE.Mesh(eyeGeo, eyeMat);
  eyeRight.name = 'EyeRight';
  eyeRight.position.set(0.2, MANTLE_R * 0.45, MANTLE_R * 0.92);
  Body.add(eyeRight);

  const beak = new THREE.Group();
  beak.name = 'Beak';
  beak.position.set(0, -MANTLE_R * 0.2, MANTLE_R * 0.55);
  Body.add(beak);
  const beakUpper = new THREE.Group();
  beakUpper.name = 'BeakUpper';
  beak.add(beakUpper);
  const beakUpperMesh = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 6), beakMat);
  beakUpperMesh.rotation.x = Math.PI / 2 + 0.4;
  beakUpperMesh.position.set(0, 0.02, 0.1);
  beakUpper.add(beakUpperMesh);
  const beakLower = new THREE.Group();
  beakLower.name = 'BeakLower';
  beak.add(beakLower);
  const beakLowerMesh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 6), beakMat);
  beakLowerMesh.rotation.x = -Math.PI / 2 - 0.2;
  beakLowerMesh.position.set(0, -0.02, 0.08);
  beakLower.add(beakLowerMesh);

  const siphon = new THREE.Group();
  siphon.name = 'Siphon';
  siphon.position.set(0, -MANTLE_R * 0.1, -MANTLE_R * 0.6);
  Body.add(siphon);
  const siphonTube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 8), armorMatDark);
  siphonTube.rotation.x = Math.PI / 2;
  siphonTube.position.z = -0.15;
  siphonTube.name = 'SiphonTube';
  siphon.add(siphonTube);

  const segLen = [0.5, 0.46, 0.42];
  const segTopR = [0.10, 0.075, 0.05];
  const segBotR = [0.078, 0.052, 0.02];
  const armAngleDeg = [24, 62, 102, 144];

  const armBases = [], armMids = [], armTips = [], armSides = [], armRestQuat = [];

  for (let pair = 0; pair < 4; pair++) {
    const deg = armAngleDeg[pair];
    for (let sgn = 0; sgn < 2; sgn++) {
      const side = sgn === 0 ? 1 : -1;
      const theta = (deg * Math.PI / 180) * side;
      const i = pair * 2 + sgn;

      const attachX = Math.sin(theta) * MANTLE_R * 0.88;
      const attachZ = Math.cos(theta) * MANTLE_R * 0.88;
      const attachY = -MANTLE_R * 0.22;

      const dir = new THREE.Vector3(Math.sin(theta) * 0.85, -0.5, Math.cos(theta) * 0.85).normalize();
      const restQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

      const base = new THREE.Group();
      base.name = `Arm${i}_Base`;
      base.position.set(attachX, attachY, attachZ);
      base.quaternion.copy(restQuat);
      Body.add(base);

      let parent = base;
      let mid = null, tip = null;
      for (let si = 0; si < 3; si++) {
        const segMesh = new THREE.Mesh(new THREE.CylinderGeometry(segTopR[si], segBotR[si], segLen[si], 8), tentacleMat);
        segMesh.rotation.x = Math.PI / 2;
        segMesh.position.z = segLen[si] / 2;
        segMesh.name = `Arm${i}_Segment${si}`;
        parent.add(segMesh);

        const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(segTopR[si] * 1.6, segTopR[si] * 0.55, segLen[si] * 0.8), si % 2 === 0 ? armorMat : armorMatDark);
        plateMesh.position.set(0, segTopR[si] * 0.85, segLen[si] * 0.5);
        plateMesh.name = `Arm${i}_Plate${si}`;
        parent.add(plateMesh);

        if (si < 2) {
          const joint = new THREE.Group();
          joint.name = si === 0 ? `Arm${i}_Mid` : `Arm${i}_Tip`;
          joint.position.z = segLen[si];
          parent.add(joint);
          if (si === 0) mid = joint; else tip = joint;
          parent = joint;
        } else {
          const tipSpike = new THREE.Mesh(new THREE.ConeGeometry(segBotR[si] * 1.6, segTopR[si] * 1.3, 6), spikeMat);
          tipSpike.rotation.x = Math.PI / 2;
          tipSpike.position.z = segLen[si] + segTopR[si] * 0.5;
          tipSpike.name = `Arm${i}_TipSpike`;
          parent.add(tipSpike);
        }
      }

      armBases[i] = base;
      armMids[i] = mid;
      armTips[i] = tip;
      armSides[i] = side;
      armRestQuat[i] = restQuat;
    }
  }

  const _e1 = new THREE.Euler();
  const _q1 = new THREE.Quaternion();

  function setArmPose(i, basePitch, baseYaw, baseRoll, midBend, tipBend, tipTwist) {
    _e1.set(basePitch, baseYaw, baseRoll || 0);
    _q1.setFromEuler(_e1);
    armBases[i].quaternion.copy(armRestQuat[i]).multiply(_q1);
    armMids[i].rotation.set(midBend, 0, 0);
    armTips[i].rotation.set(tipBend, tipTwist || 0, 0);
  }

  function clamp01(x) { return Math.min(1, Math.max(0, x)); }
  function smooth(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function doLocomotion(s) {
    const speed = s.speed || 0;
    const stride = ((s.stride % 1) + 1) % 1;
    const turn = s.turn || 0;
    const health = s.health === undefined ? 1 : s.health;
    const hurtT = clamp01(1 - health);
    const t = s.t || 0;

    const gallopT = smooth(1.2, 2.4, speed);
    const creepT = smooth(0.15, 0.6, speed) * (1 - smooth(0.9, 1.4, speed));
    const sprintT = smooth(2.5, 6, speed);

    const bob = Math.sin(stride * Math.PI * 4) * (0.03 + 0.05 * Math.min(speed, 3) / 3) * (1 - 0.4 * gallopT);
    let bodyY = BODY_Y - 0.12 * creepT + 0.05 * sprintT + bob * 0.5;
    let bodyPitch = 0.05 * Math.min(speed, 3) / 3 + 0.25 * sprintT;
    let bodyRoll = 0;

    if (speed < 0.05) {
      const breathe = Math.sin(t * 1.3) * 0.02;
      bodyY = BODY_Y + breathe;
      bodyPitch = Math.sin(t * 0.5) * 0.02;
      bodyRoll = Math.sin(t * 0.37) * 0.02;
    }

    bodyRoll += -turn * 0.22;
    bodyPitch += Math.abs(turn) * 0.03;

    bodyY -= hurtT * 0.12;
    bodyPitch += hurtT * 0.15;
    bodyRoll += hurtT * 0.18;

    Body.position.set(0, bodyY, 0);
    Body.rotation.set(bodyPitch, 0, bodyRoll);

    const breathe2 = 1 + (speed < 0.05 ? Math.sin(t * 1.3) * 0.015 : 0.01 * Math.sin(stride * Math.PI * 4));
    mantleHull.scale.set(breathe2, 1.08 * breathe2, 1.12 * breathe2);

    const lookY = speed < 0.05 ? Math.sin(t * 0.6) * 0.15 : turn * 0.3;
    eyeLeft.rotation.y = lookY; eyeRight.rotation.y = lookY;

    plateRear.rotation.y = -turn * 0.35 + (speed < 0.05 ? Math.sin(t * 0.8) * 0.06 : 0);
    plateRear.rotation.x = 0.05 * sprintT;

    for (let i = 0; i < 8; i++) {
      const side = armSides[i];
      const pair = Math.floor(i / 2);

      if (!s.grounded) {
        setArmPose(i, -0.5 - 0.1 * pair, side * 0.15, side * -0.1, -0.9 - 0.1 * pair, -0.6, 0);
        continue;
      }

      const groupOffset = (i % 2 === 0 ? 0 : 0.5) * (1 - gallopT);
      const ph = (stride + groupOffset + pair * 0.03) % 1;

      const sweepAmp = 0.55 - 0.18 * creepT + 0.15 * sprintT;
      const liftAmp = 0.5 + 0.5 * gallopT + 0.3 * sprintT;
      const sweep = Math.cos(ph * Math.PI * 2) * sweepAmp;
      const liftPhaseT = ph < 0.5 ? 0 : (ph - 0.5) / 0.5;
      const lift = ph < 0.5 ? 0 : Math.sin(liftPhaseT * Math.PI) * liftAmp;

      const turnFold = turn * side > 0 ? -turn * side * 0.3 : -turn * side * 0.15;

      const basePitch = -0.35 - 0.15 * creepT - lift * 0.6 + 0.1 * sprintT;
      const baseYaw = sweep + side * 0.05;
      const midBend = -0.7 - 0.3 * creepT - lift * 0.5 - turnFold * 0.5 + 0.15 * sprintT;
      const tipBend = -0.5 - 0.2 * creepT - lift * 0.4 - 0.15 * sprintT;

      setArmPose(i, basePitch, baseYaw, 0, midBend, tipBend, 0);
    }
  }

  function doAction(s) {
    const p = clamp01(s.phase || 0);

    switch (s.action) {
      case 'attack': {
        let strike;
        if (p < 0.35) { strike = -easeInOut(p / 0.35); }
        else if (p < 0.6) { strike = lerp(-1, 1.3, easeInOut((p - 0.35) / 0.25)); }
        else { strike = lerp(1.3, 0, easeInOut((p - 0.6) / 0.4)); }
        Body.position.set(0, BODY_Y - 0.05 + Math.max(0, strike) * 0.08, 0);
        Body.rotation.set(0.1 + Math.max(0, strike) * 0.25, 0, 0);
        for (let i = 0; i < 8; i++) {
          if (i < 2) setArmPose(i, -0.5 + strike * 0.9, armSides[i] * 0.1, 0, -0.9 + strike * 1.4, -0.6 + strike * 1.0, 0);
          else setArmPose(i, -0.4 - Math.max(0, strike) * 0.1, armSides[i] * 0.05, 0, -0.75, -0.5, 0);
        }
        beakUpper.rotation.x = -Math.max(0, strike) * 0.5;
        beakLower.rotation.x = Math.max(0, strike) * 0.5;
        break;
      }
      case 'fire': {
        let aim, recoil;
        if (p < 0.4) { aim = easeInOut(p / 0.4); recoil = 0; }
        else if (p < 0.55) { aim = 1; recoil = easeInOut((p - 0.4) / 0.15); }
        else { aim = 1; recoil = lerp(1, 0, easeInOut((p - 0.55) / 0.45)); }
        Body.position.set(0, BODY_Y, 0);
        Body.rotation.set(0.08 * aim - recoil * 0.15, 0, 0);
        siphon.rotation.x = -0.4 * aim + recoil * 0.3;
        siphonTube.scale.z = 1 + recoil * 0.6;
        for (let i = 0; i < 8; i++) setArmPose(i, -0.4 - 0.1 * aim, armSides[i] * 0.05, 0, -0.8, -0.5, 0);
        break;
      }
      case 'hit': {
        const t = p < 0.25 ? easeInOut(p / 0.25) : lerp(1, 0, easeInOut(Math.min(1, (p - 0.25) / 0.75)));
        Body.position.set(0, BODY_Y - 0.06 * t, 0);
        Body.rotation.set(-0.15 * t, 0, 0.2 * t);
        for (let i = 0; i < 8; i++) setArmPose(i, -0.35 - 0.2 * t, armSides[i] * (0.1 + 0.15 * t), 0, -0.7 - 0.2 * t, -0.5, 0);
        break;
      }
      case 'block': {
        const rt = easeInOut(Math.min(1, p / 0.4)) * (p > 0.85 ? lerp(1, 0.85, (p - 0.85) / 0.15) : 1);
        Body.position.set(0, BODY_Y - 0.1 * rt, 0);
        Body.rotation.set(0.2 * rt, 0, 0);
        plateChest.rotation.x = -0.4 * rt;
        for (let i = 0; i < 8; i++) {
          if (i < 4) setArmPose(i, -0.15 - 0.4 * rt, armSides[i] * 0.35 * rt, 0, -1.1 * rt - 0.5, -0.3, 0);
          else setArmPose(i, -0.5, armSides[i] * 0.05, 0, -0.8, -0.5, 0);
        }
        break;
      }
      case 'gather': {
        let dt;
        if (p < 0.4) dt = easeInOut(p / 0.4);
        else if (p < 0.65) dt = 1;
        else dt = lerp(1, 0, easeInOut((p - 0.65) / 0.35));
        const close = p < 0.4 ? 0 : (p < 0.65 ? easeInOut((p - 0.4) / 0.25) : 1);
        Body.position.set(0, BODY_Y - 0.28 * dt, 0);
        Body.rotation.set(0.35 * dt, 0, 0);
        for (let i = 0; i < 8; i++) {
          if (i < 2) setArmPose(i, -0.1 - 0.9 * dt, armSides[i] * 0.1, 0, -1.3 * dt - close * 0.5, -0.4 - close * 0.9, 0);
          else setArmPose(i, -0.4 - 0.2 * dt, armSides[i] * 0.05, 0, -0.8, -0.5, 0);
        }
        beakUpper.rotation.x = -0.15 * close; beakLower.rotation.x = 0.15 * close;
        break;
      }
      case 'deposit': {
        const dt = p < 0.6 ? easeInOut(p / 0.6) : lerp(1, 0, easeInOut((p - 0.6) / 0.4));
        const open = p < 0.6 ? 0 : easeInOut((p - 0.6) / 0.4);
        Body.position.set(0, BODY_Y - 0.28 * dt, 0);
        Body.rotation.set(0.35 * dt, 0, 0);
        for (let i = 0; i < 8; i++) {
          if (i < 2) setArmPose(i, -0.1 - 0.9 * dt, armSides[i] * (0.1 + open * 0.3), 0, -1.3 * dt + open * 0.6, -1.0 + open * 0.6, 0);
          else setArmPose(i, -0.4 - 0.2 * dt, armSides[i] * 0.05, 0, -0.8, -0.5, 0);
        }
        break;
      }
      case 'eat': {
        const cyc = Math.min(2.999, p * 3);
        const cf = cyc - Math.floor(cyc);
        const chew = Math.sin(cf * Math.PI * 2) * 0.5 + 0.5;
        const down = smooth(0, 0.15, p) * (1 - smooth(0.85, 1, p));
        Body.position.set(0, BODY_Y - 0.22 * down, 0);
        Body.rotation.set(0.3 * down, 0, 0);
        beakUpper.rotation.x = -0.25 * chew * down - 0.05;
        beakLower.rotation.x = 0.25 * chew * down + 0.05;
        for (let i = 0; i < 8; i++) {
          if (i < 2) setArmPose(i, -0.6 - 0.3 * down, armSides[i] * 0.1, 0, -1.0 - 0.2 * chew * down, -0.5, 0);
          else setArmPose(i, -0.4, armSides[i] * 0.05, 0, -0.8, -0.5, 0);
        }
        break;
      }
      case 'drink': {
        const down = smooth(0, 0.25, p) * (1 - smooth(0.8, 1, p));
        Body.position.set(0, BODY_Y - 0.26 * down, 0);
        Body.rotation.set(0.4 * down, 0, 0);
        beakUpper.rotation.x = -0.08 * down; beakLower.rotation.x = 0.05 * down;
        for (let i = 0; i < 8; i++) setArmPose(i, -0.45 - 0.15 * down, armSides[i] * 0.05, 0, -0.8, -0.5, 0);
        break;
      }
      case 'jump': {
        let crouch, ext;
        if (p < 0.33) { crouch = easeInOut(p / 0.33); ext = 0; }
        else { crouch = 1; ext = easeInOut((p - 0.33) / 0.67); }
        Body.position.set(0, BODY_Y - 0.25 * crouch + 0.4 * ext, 0);
        Body.rotation.set(-0.15 * ext + 0.1 * crouch, 0, 0);
        for (let i = 0; i < 8; i++) {
          const bend = crouch * 1.2 - ext * 0.9;
          setArmPose(i, -0.3 - 0.5 * crouch + ext * 0.8, armSides[i] * 0.05, 0, -0.6 - bend, -0.4 - bend * 0.6, 0);
        }
        break;
      }
      case 'land': {
        const reach = 1 - smooth(0, 0.3, p);
        const shock = smooth(0.2, 0.45, p) * (1 - smooth(0.55, 0.8, p));
        Body.position.set(0, BODY_Y + 0.3 * reach - 0.25 * shock, 0);
        Body.rotation.set(-0.2 * reach + 0.25 * shock, 0, 0);
        for (let i = 0; i < 8; i++) setArmPose(i, -0.3 + reach * 0.7 - shock * 0.4, armSides[i] * 0.05, 0, -0.7 - shock * 0.8, -0.5 - shock * 0.5, 0);
        break;
      }
      case 'signal': {
        const rise = p < 0.6 ? easeInOut(p / 0.6) : lerp(1, 0, easeInOut((p - 0.6) / 0.4));
        Body.position.set(0, BODY_Y + 0.22 * rise, 0);
        Body.rotation.set(-0.15 * rise, 0, 0);
        plateCrown.rotation.x = -0.5 * rise;
        plateBrowL.rotation.z = 0.3 * rise; plateBrowR.rotation.z = -0.3 * rise;
        for (let i = 0; i < 8; i++) {
          const spread = rise * (1.0 + 0.2 * Math.floor(i / 2));
          setArmPose(i, -0.2 - 0.9 * spread, armSides[i] * 0.5 * spread, armSides[i] * 0.1 * spread, -0.3 - 0.3 * spread, -0.2 - 0.3 * spread, 0);
        }
        break;
      }
      case 'sleep': {
        const st = easeInOut(Math.min(1, p));
        Body.position.set(0, BODY_Y - 0.55 * st, 0);
        Body.rotation.set(0.15 * st, 0, 0.08 * st);
        for (let i = 0; i < 8; i++) setArmPose(i, -0.1 - 0.9 * st, armSides[i] * (0.3 * st), 0, -1.4 * st, -1.1 * st, 0);
        break;
      }
      case 'wake': {
        const wt = easeInOut(Math.min(1, p));
        Body.position.set(0, BODY_Y - 0.55 * (1 - wt), 0);
        Body.rotation.set(0.15 * (1 - wt), 0, 0.08 * (1 - wt));
        for (let i = 0; i < 8; i++) setArmPose(i, -0.1 - 0.9 * (1 - wt) - 0.35 * wt, armSides[i] * (0.3 * (1 - wt)), 0, -1.4 * (1 - wt) - 0.8 * wt, -1.1 * (1 - wt) - 0.5 * wt, 0);
        break;
      }
      case 'die': {
        const dt = easeInOut(Math.min(1, p));
        Body.position.set(0, BODY_Y - 0.75 * dt, 0);
        Body.rotation.set(0.3 * dt, 0, 0.6 * dt);
        for (let i = 0; i < 8; i++) setArmPose(i, -0.1 - 0.6 * dt + armSides[i] * 0.05 * dt, armSides[i] * (0.6 * dt), armSides[i] * 0.2 * dt, -0.3 * dt, -0.2 * dt, 0);
        plateChest.rotation.x = 0.2 * dt;
        break;
      }
      case 'evolve': {
        let et;
        if (p < 0.3) et = easeInOut(p / 0.3);
        else if (p < 0.7) et = 1;
        else et = lerp(1, 0, easeInOut((p - 0.7) / 0.3));
        Body.position.set(0, BODY_Y - 0.15 * et, 0);
        Body.rotation.set(0.1 * et, 0, 0);
        plateCrown.rotation.x = -0.7 * et;
        plateBrowL.rotation.z = 0.5 * et; plateBrowR.rotation.z = -0.5 * et;
        plateFlankL.rotation.z = 0.6 * et; plateFlankR.rotation.z = -0.6 * et;
        plateChest.rotation.x = -0.5 * et;
        plateRear.rotation.x = -0.5 * et;
        for (let i = 0; i < 8; i++) setArmPose(i, -0.4 - 0.3 * et, armSides[i] * 0.4 * et, 0, -0.9 - 0.3 * et, -0.6, 0);
        break;
      }
      default: {
        doLocomotion({ speed: 0, stride: 0, turn: 0, grounded: true, health: 1, t: s.t || 0, dt: s.dt || 0 });
      }
    }
  }

  root.userData.pose = (s) => {
    if (s.action) { doAction(s); }
    else { doLocomotion(s); }
  };

  return root;
}