```javascript
function build(THREE, TSL) {
  const root = new THREE.Group();
  root.name = 'ArmouredOctopus';

  // ---------- shader-driven materials ----------
  const glowUniform = TSL.uniform(0.15);
  const glowColorUniform = TSL.uniform(new THREE.Color(0.15, 0.9, 0.8));

  const skinMat = new THREE.MeshStandardMaterial({ color: 0x5a2038, roughness: 0.55, metalness: 0.05 });
  {
    const mx = TSL.positionLocal.x, my = TSL.positionLocal.y, mz = TSL.positionLocal.z;
    const n1 = TSL.sin(mx.mul(17).add(my.mul(9))).mul(0.5).add(0.5);
    const n2 = TSL.sin(my.mul(23).sub(mz.mul(13))).mul(0.5).add(0.5);
    const mottle = n1.mul(n2);
    skinMat.colorNode = TSL.mix(TSL.vec3(0.14, 0.03, 0.08), TSL.vec3(0.46, 0.11, 0.23), mottle);
    const viewDir = TSL.normalize(TSL.cameraPosition.sub(TSL.positionWorld));
    const fres = TSL.pow(TSL.oneMinus(TSL.max(TSL.dot(TSL.normalWorld, viewDir), 0.0)), 3.0);
    skinMat.emissiveNode = glowColorUniform.mul(fres.mul(0.7).add(0.08)).mul(glowUniform);
  }

  const armorMat = new THREE.MeshStandardMaterial({ color: 0x262a30, roughness: 0.35, metalness: 0.85 });
  {
    const ay = TSL.positionLocal.y;
    const seam = TSL.step(0.9, TSL.fract(ay.mul(26)));
    const viewDir = TSL.normalize(TSL.cameraPosition.sub(TSL.positionWorld));
    const fres = TSL.pow(TSL.oneMinus(TSL.max(TSL.dot(TSL.normalWorld, viewDir), 0.0)), 2.0);
    armorMat.colorNode = TSL.mix(TSL.vec3(0.10, 0.11, 0.13), TSL.vec3(0.55, 0.58, 0.62), fres);
    armorMat.emissiveNode = glowColorUniform.mul(seam.mul(0.8).add(0.04)).mul(glowUniform);
  }

  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xdccf86, roughness: 0.25, metalness: 0.0 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.2 });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0x15100d, roughness: 0.4, metalness: 0.15 });

  // ---------- geometry helpers ----------
  function segGeo(len, rBase, rTip) {
    const g = new THREE.CylinderGeometry(rBase, rTip, len, 8, 1);
    g.translate(0, -len / 2, 0);
    return g;
  }
  function ringGeo(r) {
    return new THREE.TorusGeometry(r, r * 0.28, 6, 12);
  }

  // ---------- mantle (body) ----------
  const mantle = new THREE.Group();
  mantle.name = 'Mantle';
  mantle.position.set(0, 0.62, 0);
  root.add(mantle);

  const mantleCore = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), skinMat);
  mantleCore.name = 'MantleCore';
  mantleCore.scale.set(1, 1.1, 0.92);
  mantle.add(mantleCore);

  const armorLeft = new THREE.Group();
  armorLeft.name = 'ArmorLeft';
  armorLeft.position.set(0, 0.16, 0.02);
  const armorRight = new THREE.Group();
  armorRight.name = 'ArmorRight';
  armorRight.position.set(0, 0.16, 0.02);
  mantle.add(armorLeft, armorRight);

  const domeLeft = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 10, Math.PI / 2, Math.PI, 0, Math.PI / 2.1), armorMat);
  domeLeft.name = 'ArmorPlate_L1';
  domeLeft.position.y = -0.02;
  armorLeft.add(domeLeft);
  const domeRight = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 10, -Math.PI / 2, Math.PI, 0, Math.PI / 2.1), armorMat);
  domeRight.name = 'ArmorPlate_R1';
  domeRight.position.y = -0.02;
  armorRight.add(domeRight);

  const spikeGeo = new THREE.ConeGeometry(0.035, 0.09, 6);
  for (let k = 0; k < 3; k++) {
    const zPos = -0.12 + k * 0.12;
    const sL = new THREE.Mesh(spikeGeo, armorMat);
    sL.name = 'Spike_L' + (k + 1);
    sL.position.set(-0.03, 0.30, zPos);
    armorLeft.add(sL);
    const sR = new THREE.Mesh(spikeGeo, armorMat);
    sR.name = 'Spike_R' + (k + 1);
    sR.position.set(0.03, 0.30, zPos);
    armorRight.add(sR);
  }

  const browGeo = new THREE.BoxGeometry(0.11, 0.035, 0.09);
  const browLeft = new THREE.Mesh(browGeo, armorMat);
  browLeft.name = 'BrowLeft';
  browLeft.position.set(-0.15, 0.13, 0.23);
  browLeft.rotation.set(-0.3, 0, -0.15);
  mantle.add(browLeft);
  const browRight = new THREE.Mesh(browGeo, armorMat);
  browRight.name = 'BrowRight';
  browRight.position.set(0.15, 0.13, 0.23);
  browRight.rotation.set(-0.3, 0, 0.15);
  mantle.add(browRight);

  const eyeGeo = new THREE.SphereGeometry(0.07, 12, 10);
  const pupilGeo = new THREE.SphereGeometry(0.035, 8, 8);
  const eyeL = new THREE.Group();
  eyeL.name = 'Eye_L';
  eyeL.position.set(-0.15, 0.02, 0.27);
  const eyeballL = new THREE.Mesh(eyeGeo, eyeWhiteMat);
  eyeballL.name = 'Eyeball_L';
  eyeL.add(eyeballL);
  const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
  pupilL.name = 'Pupil_L';
  pupilL.position.set(0, 0, 0.06);
  eyeL.add(pupilL);
  mantle.add(eyeL);

  const eyeR = new THREE.Group();
  eyeR.name = 'Eye_R';
  eyeR.position.set(0.15, 0.02, 0.27);
  const eyeballR = new THREE.Mesh(eyeGeo, eyeWhiteMat);
  eyeballR.name = 'Eyeball_R';
  eyeR.add(eyeballR);
  const pupilR = new THREE.Mesh(pupilGeo, pupilMat);
  pupilR.name = 'Pupil_R';
  pupilR.position.set(0, 0, 0.06);
  eyeR.add(pupilR);
  mantle.add(eyeR);

  const beakGroup = new THREE.Group();
  beakGroup.name = 'Beak';
  beakGroup.position.set(0, -0.22, 0.22);
  mantle.add(beakGroup);
  const beakGeo = new THREE.ConeGeometry(0.06, 0.18, 4);
  beakGeo.translate(0, 0.09, 0);
  const restBeakUpper = Math.PI / 2 - 0.12;
  const restBeakLower = Math.PI / 2 + 0.12;
  const beakUpper = new THREE.Mesh(beakGeo, beakMat);
  beakUpper.name = 'BeakUpper';
  beakUpper.position.y = 0.02;
  beakUpper.rotation.x = restBeakUpper;
  beakGroup.add(beakUpper);
  const beakLower = new THREE.Mesh(beakGeo, beakMat);
  beakLower.name = 'BeakLower';
  beakLower.position.y = -0.02;
  beakLower.rotation.x = restBeakLower;
  beakGroup.add(beakLower);

  const restSiphonX = -Math.PI / 2 - 0.2;
  const siphonGeo = new THREE.CylinderGeometry(0.025, 0.04, 0.14, 8);
  siphonGeo.translate(0, 0.07, 0);
  const siphon = new THREE.Mesh(siphonGeo, armorMat);
  siphon.name = 'Siphon';
  siphon.position.set(0.13, -0.06, -0.20);
  siphon.rotation.x = restSiphonX;
  mantle.add(siphon);

  // ---------- arms ----------
  const ARM_ANGLES_DEG = [-157.5, -112.5, -67.5, -22.5, 22.5, 67.5, 112.5, 157.5];
  const BASE_ANGLES = ARM_ANGLES_DEG.map((d) => THREE.MathUtils.degToRad(d));
  const restSplay = 0.55;
  const restCurl = [0.10, 0.20, 0.32, 0.46];
  const segLens = [0.26, 0.20, 0.15, 0.11];
  const segRadii = [[0.050, 0.036], [0.036, 0.024], [0.024, 0.014], [0.014, 0.005]];
  const ATTACH_R = 0.29, ATTACH_Y = -0.16;

  const armRoots = [];
  const segNodes = [];
  for (let i = 0; i < 8; i++) {
    const ang = BASE_ANGLES[i];
    const armRoot = new THREE.Object3D();
    armRoot.name = 'Arm_' + (i + 1);
    armRoot.rotation.order = 'YXZ';
    armRoot.rotation.y = ang;
    armRoot.rotation.x = restSplay;
    armRoot.position.set(Math.sin(ang) * ATTACH_R, ATTACH_Y, Math.cos(ang) * ATTACH_R);
    mantle.add(armRoot);
    armRoots.push(armRoot);

    let parent = armRoot;
    const segs = [];
    for (let k = 0; k < 4; k++) {
      const seg = new THREE.Object3D();
      seg.name = 'Arm_' + (i + 1) + '_Seg' + (k + 1);
      if (k > 0) seg.position.set(0, -segLens[k - 1], 0);
      seg.rotation.x = restCurl[k];
      parent.add(seg);
      const [rb, rt] = segRadii[k];
      const mesh = new THREE.Mesh(segGeo(segLens[k], rb, rt), skinMat);
      mesh.name = 'Arm_' + (i + 1) + '_Seg' + (k + 1) + '_Mesh';
      seg.add(mesh);
      if (k < 2) {
        const ring = new THREE.Mesh(ringGeo(rb * 1.15), armorMat);
        ring.name = 'Arm_' + (i + 1) + '_Ring' + (k + 1);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = -0.02;
        seg.add(ring);
      }
      segs.push(seg);
      parent = seg;
    }
    segNodes.push(segs);
  }

  // ---------- pose ----------
  object_pose_setup: {
  }
  root.userData.pose = (s) => {
    const speed = s.speed || 0;
    const turn = s.turn || 0;
    const grounded = s.grounded !== false;
    const health = s.health === undefined ? 1 : s.health;
    const t = s.t || 0;
    const stride = s.stride || 0;
    const action = s.action || null;
    const phase = s.phase || 0;

    const sweep = [0, 0, 0, 0, 0, 0, 0, 0];
    const lift = [0, 0, 0, 0, 0, 0, 0, 0];
    const twist = [0, 0, 0, 0, 0, 0, 0, 0];
    const curl = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    let mantleY = 0, mantlePitch = 0, mantleRoll = 0, mantleYawLean = 0;
    let mantleScale = [1, 1, 1];
    let beakOpen = 0.12;
    let breathe = 0;
    let glow = 0.15, glowColor = [0.15, 0.9, 0.8];
    let siphonAim = 0;
    let armorOpen = 0;

    if (action) {
      const p = phase;
      switch (action) {
        case 'attack': {
          const wind = Math.min(1, p / 0.35);
          const commit = p < 0.35 ? 0 : Math.min(1, (p - 0.35) / 0.35);
          const rec = p < 0.7 ? 0 : (p - 0.7) / 0.3;
          [3, 4].forEach((i) => {
            const pull = -0.7 * wind * (1 - commit) + 1.1 * commit * (1 - rec);
            sweep[i] += (i === 3 ? -1 : 1) * pull * 0.4;
            lift[i] += 0.25 * wind * (1 - commit) - 0.15 * commit;
            curl[i][0] += -0.3 * commit + 0.4 * wind;
            curl[i][1] += 0.6 * commit - 0.2 * wind;
            curl[i][2] += 0.8 * commit;
            curl[i][3] += 1.0 * commit - 0.3 * rec;
          });
          mantlePitch += 0.1 * commit - 0.05 * wind;
          beakOpen += 0.15 * commit;
          break;
        }
        case 'fire': {
          const aim = Math.min(1, p / 0.4);
          const release = p < 0.4 ? 0 : Math.min(1, (p - 0.4) / 0.2);
          const recoil = p < 0.6 ? 0 : (p - 0.6) / 0.4;
          siphonAim = aim * 0.3;
          mantleScale = [1 - 0.06 * release, 1 + 0.05 * release, 1 - 0.06 * release];
          mantleY -= 0.05 * recoil * (1 - recoil) * 4;
          for (let i = 0; i < 8; i++) { lift[i] += 0.15 * aim; sweep[i] += (i < 4 ? -1 : 1) * 0.05 * aim; }
          glow = 0.4 + 0.6 * release; glowColor = [0.2, 1, 0.9];
          break;
        }
        case 'hit': {
          const snap = Math.sin(Math.min(1, p / 0.25) * Math.PI);
          mantleRoll += 0.3 * snap; mantleY -= 0.08 * snap;
          for (let i = 0; i < 8; i++) { lift[i] += 0.1 * snap; curl[i][2] += 0.2 * snap; }
          break;
        }
        case 'block': {
          const b = Math.min(1, p / 0.3);
          mantleY -= 0.1 * b; mantlePitch += 0.15 * b;
          for (let i = 3; i <= 4; i++) {
            lift[i] += 0.3 * b; curl[i][0] += 0.3 * b; curl[i][1] += 0.5 * b;
            sweep[i] += (i === 3 ? 0.3 : -0.3) * b;
          }
          beakOpen -= 0.1 * b;
          break;
        }
        case 'gather': {
          const down = Math.sin(Math.min(1, p / 0.5) * Math.PI / 2);
          const up = p < 0.5 ? 0 : Math.sin((p - 0.5) * Math.PI);
          mantleY -= 0.18 * down; mantlePitch += 0.25 * down;
          [3, 4].forEach((i) => {
            lift[i] -= 0.25 * down; curl[i][2] += 0.5 * down; curl[i][3] += 0.7 * down;
            sweep[i] += (i === 3 ? 0.2 : -0.2) * down;
          });
          mantleY += 0.02 * up;
          break;
        }
        case 'deposit': {
          const down = Math.sin(Math.min(1, p / 0.6) * Math.PI / 2);
          mantleY -= 0.15 * down; mantlePitch += 0.2 * down;
          [3, 4].forEach((i) => { lift[i] -= 0.2 * down; curl[i][2] += 0.4 * down; curl[i][3] += 0.5 * down; });
          break;
        }
        case 'eat': {
          const cyc = Math.sin(p * Math.PI * 3) * 0.5 + 0.5;
          mantlePitch += 0.18; mantleY -= 0.08;
          beakOpen += 0.18 * cyc;
          [3, 4].forEach((i) => { lift[i] -= 0.15; curl[i][3] += 0.3 * cyc; });
          break;
        }
        case 'drink': {
          const hold = Math.sin(Math.min(1, p) * Math.PI);
          mantlePitch += 0.22 * hold; mantleY -= 0.1 * hold;
          beakOpen += 0.06 * hold;
          [3, 4].forEach((i) => { lift[i] -= 0.1 * hold; });
          break;
        }
        case 'jump': {
          const crouch = p < 0.33 ? Math.sin((p / 0.33) * Math.PI / 2) : Math.max(0, 1 - (p - 0.33) / 0.2);
          const ext = p < 0.33 ? 0 : Math.min(1, (p - 0.33) / 0.4);
          mantleY -= 0.15 * crouch * (1 - ext);
          mantleY += 0.25 * ext;
          mantleScale = [1 + 0.08 * ext, 1 - 0.1 * crouch + 0.15 * ext, 1 + 0.08 * ext];
          for (let i = 0; i < 8; i++) { curl[i][1] -= 0.2 * ext; curl[i][2] -= 0.3 * ext; lift[i] -= 0.15 * ext; }
          break;
        }
        case 'land': {
          const impact = Math.min(1, p / 0.3);
          const settle = p < 0.3 ? 0 : Math.max(0, 1 - (p - 0.3) / 0.5);
          const sq = impact * settle;
          mantleY -= 0.22 * sq;
          mantleScale = [1 + 0.1 * sq, 1 - 0.18 * sq, 1 + 0.1 * sq];
          for (let i = 0; i < 8; i++) { lift[i] += 0.2 * sq; sweep[i] += (i < 4 ? -1 : 1) * 0.1 * sq; }
          break;
        }
        case 'signal': {
          const a = p < 0.4 ? Math.sin((p / 0.4) * Math.PI / 2) : (p < 0.75 ? 1 : Math.max(0, 1 - (p - 0.75) / 0.25));
          mantleY += 0.12 * a;
          mantleScale = [1 + 0.1 * a, 1 + 0.15 * a, 1 + 0.1 * a];
          for (let i = 0; i < 8; i++) {
            sweep[i] += (i < 4 ? -1 : 1) * 0.35 * a; lift[i] += 0.4 * a;
            curl[i][0] -= 0.2 * a; curl[i][1] -= 0.1 * a;
          }
          glow = 0.3 + 0.9 * a; glowColor = [0.3, 1, 0.6];
          beakOpen += 0.1 * a;
          break;
        }
        case 'sleep': {
          const a = Math.min(1, p / 0.8);
          mantleY -= 0.32 * a; mantlePitch += 0.1 * a;
          mantleScale = [1 + 0.05 * a, 1 - 0.15 * a, 1 + 0.05 * a];
          for (let i = 0; i < 8; i++) {
            lift[i] -= 0.35 * a; curl[i][0] += 0.2 * a; curl[i][1] += 0.35 * a;
            curl[i][2] += 0.45 * a; curl[i][3] += 0.5 * a; sweep[i] *= (1 - a);
          }
          breathe = 0.3;
          beakOpen -= 0.08 * a;
          break;
        }
        case 'wake': {
          const a = 1 - Math.min(1, p);
          mantleY -= 0.32 * a; mantlePitch += 0.1 * a;
          mantleScale = [1 + 0.05 * a, 1 - 0.15 * a, 1 + 0.05 * a];
          for (let i = 0; i < 8; i++) {
            lift[i] -= 0.35 * a; curl[i][0] += 0.2 * a; curl[i][1] += 0.35 * a;
            curl[i][2] += 0.45 * a; curl[i][3] += 0.5 * a;
          }
          break;
        }
        case 'die': {
          const a = Math.min(1, p);
          mantleY -= 0.4 * a; mantleRoll += 0.6 * a; mantlePitch += 0.3 * a;
          mantleScale = [1 + 0.15 * a, 1 - 0.3 * a, 1 + 0.15 * a];
          for (let i = 0; i < 8; i++) {
            lift[i] -= 0.4 * a; curl[i][1] += 0.3 * a; curl[i][2] += 0.5 * a;
            curl[i][3] += 0.7 * a; sweep[i] += (i % 2 ? 1 : -1) * 0.15 * a;
          }
          beakOpen += 0.05 * a;
          glow = 0.05;
          break;
        }
        case 'evolve': {
          const brace = Math.min(1, p / 0.25);
          const open = p < 0.25 ? 0 : (p < 0.7 ? Math.min(1, (p - 0.25) / 0.2) : Math.max(0, 1 - (p - 0.7) / 0.3));
          mantleY -= 0.12 * brace * (1 - open * 0.3);
          mantleScale = [1 + 0.1 * open, 1 + 0.15 * open, 1 + 0.1 * open];
          for (let i = 0; i < 8; i++) { lift[i] += 0.15 * open; curl[i][0] -= 0.1 * open; }
          glow = 0.2 + 0.8 * open; glowColor = [0.6, 0.9, 1];
          armorOpen = open;
          break;
        }
      }
    } else {
      const gather = speed <= 0.5 ? speed / 0.5 : Math.max(0, 1 - (speed - 0.5) / 0.7);
      const runT = Math.max(0, Math.min(1, (speed - 2) / 4));
      const legAmp = Math.min(1, speed / 3) * (1 - 0.35 * gather);
      breathe = 0.5 * (1 - Math.min(1, speed));

      mantleY -= 0.10 * gather;
      mantlePitch += 0.05 * gather + 0.12 * runT;
      mantleScale = [1 - 0.05 * runT, 1 - 0.08 * runT, 1 + 0.12 * runT];
      mantleYawLean += Math.sin(t * 0.35) * 0.05 * (1 - Math.min(1, speed));
      mantleRoll += Math.sin(t * 0.5 + 1) * 0.02 * (1 - Math.min(1, speed));

      if (grounded && speed > 0.02) {
        for (let i = 0; i < 8; i++) {
          const off = (i / 8) * (1 - runT) + ((i % 2) * 0.5) * runT;
          const th = ((stride + off) % 1) * Math.PI * 2;
          const lf = Math.max(0, Math.sin(th)) * legAmp * 0.6;
          sweep[i] = Math.cos(th) * legAmp * 0.5;
          lift[i] = lf;
          curl[i][0] = 0.12 * legAmp * Math.sin(th + 0.3);
          curl[i][1] = 0.22 * legAmp * Math.sin(th + 0.6) - 0.15 * runT * (1 - lf);
          curl[i][2] = 0.30 * legAmp * Math.sin(th + 0.9) - 0.25 * runT * (1 - lf);
          curl[i][3] = 0.35 * legAmp * Math.sin(th + 1.2) - 0.30 * runT * (1 - lf);
        }
        const bobPhase = ((stride * 2) % 1) * Math.PI * 2;
        mantleY += Math.abs(Math.sin(bobPhase)) * 0.05 * Math.min(1, speed);
        mantleRoll += Math.sin(stride * Math.PI * 2) * 0.03 * Math.min(1, speed);
      } else if (grounded) {
        for (let i = 0; i < 8; i++) {
          sweep[i] = Math.sin(t * 0.6 + i) * 0.03;
          curl[i][1] = Math.sin(t * 0.5 + i * 0.7) * 0.03;
          curl[i][2] = Math.sin(t * 0.5 + i * 0.7 + 0.5) * 0.04;
        }
      }

      if (turn !== 0) {
        const insideSide = turn < 0 ? -1 : 1;
        const m = Math.abs(turn);
        mantleRoll += -turn * 0.18;
        mantleYawLean += turn * 0.10;
        for (let i = 0; i < 8; i++) {
          const side = i < 4 ? -1 : 1;
          if (side === insideSide) {
            lift[i] += 0.25 * m; curl[i][1] += 0.25 * m; curl[i][2] += 0.3 * m; curl[i][3] += 0.35 * m;
          } else {
            curl[i][1] -= 0.15 * m; curl[i][2] -= 0.2 * m; sweep[i] += (side < 0 ? -1 : 1) * 0.15 * m;
          }
        }
      }

      if (!grounded) {
        for (let i = 0; i < 8; i++) {
          sweep[i] = Math.sin(t * 1.3 + i * 0.8) * 0.12;
          lift[i] = 0.3 + Math.sin(t * 1.1 + i) * 0.08;
          curl[i][0] = 0.1;
          curl[i][1] = 0.15 + Math.sin(t * 1.4 + i) * 0.1;
          curl[i][2] = 0.2 + Math.sin(t * 1.6 + i) * 0.12;
          curl[i][3] = 0.25 + Math.sin(t * 1.8 + i) * 0.15;
        }
        mantlePitch += 0.08;
        mantleY += 0.05;
      }
    }

    const hurtT = Math.max(0, Math.min(1, 1 - health));
    if (hurtT > 0) {
      mantleRoll += 0.22 * hurtT;
      mantlePitch += 0.08 * hurtT;
      mantleY -= 0.06 * hurtT;
      for (let i = 4; i < 8; i++) { lift[i] -= 0.15 * hurtT; curl[i][2] += 0.15 * hurtT; }
      glow = Math.max(glow, 0.15 + 0.35 * hurtT);
      glowColor = [1, 0.15, 0.1];
    }

    beakOpen = Math.max(0, beakOpen);

    mantle.position.set(0, 0.62 + mantleY, 0);
    mantle.rotation.set(mantlePitch, mantleYawLean, mantleRoll);
    mantle.scale.set(mantleScale[0], mantleScale[1], mantleScale[2]);
    mantleCore.scale.set(
      1 + Math.sin(t * 1.6) * 0.02 * breathe,
      1.1 + Math.sin(t * 1.6) * 0.025 * breathe,
      0.92 + Math.sin(t * 1.6) * 0.02 * breathe
    );

    for (let i = 0; i < 8; i++) {
      const ar = armRoots[i];
      ar.rotation.y = BASE_ANGLES[i] + sweep[i];
      ar.rotation.x = restSplay - lift[i];
      ar.rotation.z = twist[i];
      const segs = segNodes[i];
      for (let k = 0; k < 4; k++) segs[k].rotation.x = restCurl[k] + curl[i][k];
    }

    beakUpper.rotation.x = restBeakUpper - beakOpen;
    beakLower.rotation.x = restBeakLower + beakOpen;
    siphon.rotation.set(restSiphonX, siphonAim, 0);

    armorLeft.rotation.z = 0.5 * armorOpen;
    armorRight.rotation.z = -0.5 * armorOpen;

    glowUniform.value = glow;
    glowColorUniform.value.setRGB(glowColor[0], glowColor[1], glowColor[2]);
  };

  return root;
}
```