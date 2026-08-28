```javascript
function build(THREE, TSL) {
  const shark = new THREE.Group();
  shark.name = 'shark';

  // Materials
  const bodyMat = new THREE.MeshStandardMaterial({ 
    color: 0x3a4a5c,
    roughness: 0.7,
    metalness: 0.1
  });
  
  const teethMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f0,
    roughness: 0.4,
    metalness: 0.6
  });

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });

  // Body - main torso as elongated capsule
  const bodyGeom = new THREE.CapsuleGeometry(0.32, 2.0, 8, 20);
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.name = 'body';
  body.position.set(0, 0, 0);
  shark.add(body);

  // Head - cone tapered to snout
  const headGeom = new THREE.ConeGeometry(0.26, 0.9, 8);
  const head = new THREE.Mesh(headGeom, bodyMat);
  head.name = 'head';
  head.position.set(0, 0, 1.15);
  head.rotation.z = Math.PI;
  shark.add(head);

  // Snout tip
  const snoutGeom = new THREE.ConeGeometry(0.12, 0.3, 6);
  const snout = new THREE.Mesh(snoutGeom, bodyMat);
  snout.name = 'snout';
  snout.position.set(0, 0, 1.55);
  snout.rotation.z = Math.PI;
  head.add(snout);

  // Eyes
  const eyeGeom = new THREE.SphereGeometry(0.09, 8, 8);
  
  const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
  leftEye.name = 'leftEye';
  leftEye.position.set(-0.18, 0.12, 0.8);
  head.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
  rightEye.name = 'rightEye';
  rightEye.position.set(0.18, 0.12, 0.8);
  head.add(rightEye);

  // Upper jaw with teeth
  const upperJawGroup = new THREE.Group();
  upperJawGroup.name = 'upperJaw';
  upperJawGroup.position.set(0, 0.18, 1.3);
  head.add(upperJawGroup);

  const toothGeom = new THREE.ConeGeometry(0.032, 0.18, 4);
  for (let i = 0; i < 10; i++) {
    const tooth = new THREE.Mesh(toothGeom, teethMat);
    tooth.position.set((i - 4.5) * 0.065, 0.08, 0);
    tooth.rotation.x = 0.2;
    upperJawGroup.add(tooth);
  }

  // Lower jaw with teeth - can open/close
  const lowerJaw = new THREE.Group();
  lowerJaw.name = 'lowerJaw';
  lowerJaw.position.set(0, -0.18, 1.3);
  head.add(lowerJaw);

  for (let i = 0; i < 10; i++) {
    const tooth = new THREE.Mesh(toothGeom, teethMat);
    tooth.position.set((i - 4.5) * 0.065, -0.08, 0);
    tooth.rotation.x = -0.2;
    lowerJaw.add(tooth);
  }

  // Tail - tapered cone
  const tailGeom = new THREE.ConeGeometry(0.22, 1.4, 8);
  const tail = new THREE.Mesh(tailGeom, bodyMat);
  tail.name = 'tail';
  tail.position.set(0, 0, -1.15);
  tail.rotation.z = Math.PI;
  shark.add(tail);

  // Tail fin (caudal) - flat with curvature
  const tailFinGeom = new THREE.BoxGeometry(0.9, 0.06, 0.35);
  const tailFin = new THREE.Mesh(tailFinGeom, bodyMat);
  tailFin.name = 'tailFin';
  tailFin.position.set(0, 0, -1.85);
  tail.add(tailFin);

  // Dorsal fin
  const dorsalGeom = new THREE.BoxGeometry(0.08, 0.55, 0.3);
  const dorsalFin = new THREE.Mesh(dorsalGeom, bodyMat);
  dorsalFin.name = 'dorsalFin';
  dorsalFin.position.set(0, 0.35, 0.3);
  body.add(dorsalFin);

  // Left pectoral fin
  const pectGeom = new THREE.BoxGeometry(0.45, 0.07, 0.22);
  const leftPectoral = new THREE.Mesh(pectGeom, bodyMat);
  leftPectoral.name = 'leftPectoral';
  leftPectoral.position.set(-0.28, -0.2, 0.1);
  leftPectoral.rotation.z = -0.3;
  body.add(leftPectoral);

  // Right pectoral fin
  const rightPectoral = new THREE.Mesh(pectGeom, bodyMat);
  rightPectoral.name = 'rightPectoral';
  rightPectoral.position.set(0.28, -0.2, 0.1);
  rightPectoral.rotation.z = 0.3;
  body.add(rightPectoral);

  // Anal fin (smaller, rear)
  const analGeom = new THREE.BoxGeometry(0.06, 0.3, 0.25);
  const analFin = new THREE.Mesh(analGeom, bodyMat);
  analFin.name = 'analFin';
  analFin.position.set(0, -0.28, -0.6);
  body.add(analFin);

  shark.userData.pose = (s) => {
    // Reset all parts to neutral positions first
    resetPose();

    // Handle actions first
    if (s.action) {
      applyAction(s);
    } else {
      // Handle locomotion based on speed
      applyLocomotion(s);
    }

    function resetPose() {
      body.position.set(0, 0, 0);
      body.rotation.set(0, 0, 0);
      body.scale.set(1, 1, 1);
      
      head.position.set(0, 0, 1.15);
      head.rotation.z = Math.PI;
      
      tail.position.set(0, 0, -1.15);
      tail.rotation.z = Math.PI;
      
      dorsalFin.rotation.z = -0.15;
      analFin.rotation.z = -0.15;
      
      leftPectoral.rotation.z = -0.3;
      rightPectoral.rotation.z = 0.3;
      
      lowerJaw.rotation.x = 0;
    }

    function applyLocomotion(s) {
      // Main undulation from stride cycle
      const bodyWave = Math.sin(s.stride * Math.PI * 2) * 0.12;
      const tailWave = Math.sin((s.stride + 0.2) * Math.PI * 2) * 0.5;
      
      body.position.y = bodyWave * 0.5;
      body.rotation.z = bodyWave * 0.25;
      body.rotation.x = Math.sin(s.stride * Math.PI * 2) * 0.08 * Math.min(s.speed / 3, 1);
      
      tail.rotation.z = tailWave;
      tail.rotation.x = Math.sin(s.stride * Math.PI * 2) * 0.12 * Math.min(s.speed / 3, 1);
      
      // Head follows with slight phase shift
      head.rotation.z = Math.PI + Math.sin((s.stride - 0.1) * Math.PI * 2) * 0.15;
      
      // Mouth slightly open while moving
      const jawOpen = Math.max(0, Math.min(0.15, s.speed * 0.04));
      lowerJaw.rotation.x = jawOpen;
      
      // Dorsal fin stiffens at speed
      dorsalFin.rotation.z = -0.15 - Math.min(0.25, s.speed * 0.08);
      analFin.rotation.z = -0.15 - Math.min(0.2, s.speed * 0.06);
      
      // Pectoral fins adjust for depth control and turning
      const pectoralTrim = Math.min(0.4, s.speed * 0.12);
      leftPectoral.rotation.z = -0.3 - pectoralTrim - s.turn * 0.25;
      rightPectoral.rotation.z = 0.3 + pectoralTrim + s.turn * 0.25;
      
      // Turning - lean into turns
      if (Math.abs(s.turn) > 0.1) {
        body.rotation.y = s.turn * 0.4;
        head.rotation.y = s.turn * 0.5;
        body.rotation.x += s.turn * 0.15;
      }
      
      // Damage - sag and list
      if (s.health < 1) {
        const damage = 1 - s.health;
        body.position.y -= damage * 0.3;
        body.rotation.x += damage * 0.4;
        body.rotation.z += damage * 0.2 * (Math.random() > 0.5 ? 1 : -1);
      }
      
      // Airborne - relax control surfaces
      if (!s.grounded) {
        dorsalFin.rotation.z += 0.3;
        leftPectoral.rotation.z -= 0.4;
        rightPectoral.rotation.z += 0.4;
        body.rotation.x += 0.2;
      }
    }

    function applyAction(s) {
      const p = s.phase;
      
      if (s.action === 'attack') {
        // Explosive lunge with wide jaw
        const strike = Math.sin(p * Math.PI);
        head.position.z += strike * 0.6;
        body.rotation.x = strike * 0.25;
        lowerJaw.rotation.x = -Math.sin(p * Math.PI) * 0.5;
        tail.rotation.z = Math.sin(p * Math.PI * 2) * 0.3;
      }
      else if (s.action === 'hit') {
        // Sharp recoil backwards
        const impact = Math.pow(1 - p, 2);
        body.position.z -= impact * 0.4;
        body.rotation.x = impact * 0.35;
        head.rotation.z = Math.PI + impact * 0.3;
      }
      else if (s.action === 'block') {
        // Tuck and brace
        body.position.y -= p * 0.25;
        body.rotation.x = p * 0.5;
        head.rotation.z = Math.PI - p * 0.4;
        lowerJaw.rotation.x = p * 0.3;
      }
      else if (s.action === 'jump') {
        // Load and launch
        const load = 1 - Math.cos(p * Math.PI);
        body.position.y -= load * 0.3;
        tail.rotation.z = load * 0.6;
        body.rotation.x = load * 0.3;
      }
      else if (s.action === 'land') {
        // Absorb impact
        const absorb = Math.max(0, Math.sin(p * Math.PI));
        body.position.y -= absorb * 0.2;
        body.rotation.x = absorb * 0.3;
        leftPectoral.rotation.z = -0.3 - absorb * 0.3;
        rightPectoral.rotation.z = 0.3 + absorb * 0.3;
      }
      else if (s.action === 'eat') {
        // Repeated snapping
        const snap = (p * 4) % 1;
        lowerJaw.rotation.x = -Math.sin(snap * Math.PI * 2) * 0.4;
        body.position.z = Math.sin(snap * Math.PI * 2) * 0.12;
      }
      else if (s.action === 'signal') {
        // Rise and display dorsals
        const rise = Math.sin(p * Math.PI);
        body.position.y += rise * 0.5;
        dorsalFin.rotation.z = -0.15 - rise * 0.6;
        head.rotation.z = Math.PI - rise * 0.25;
      }
      else if (s.action === 'gather') {
        // Dip down to grab
        body.position.y = (1 - Math.cos(p * Math.PI)) * -0.35;
        head.rotation.x = Math.sin(p * Math.PI) * 0.4;
      }
      else if (s.action === 'deposit') {
        // Slow release downward
        body.position.y = Math.sin((1 - p) * Math.PI * 0.5) * -0.3;
        head.rotation.x = (1 - p) * 0.35;
      }
      else if (s.action === 'sleep') {
        // Sink and curl
        const curl = p;
        body.position.y -= curl * 0.6;
        body.rotation.z = curl * 0.4;
        tail.rotation.z = curl * 0.7;
        head.rotation.z = Math.PI + curl * 0.3;
      }
      else if (s.action === 'wake') {
        // Stir and rise
        const wake = p;
        body.position.y = -(1 - wake) * 0.6;
        body.rotation.z = (1 - wake) * 0.4;
        tail.rotation.z = Math.sin(wake * Math.PI * 2) * 0.4;
      }
      else if (s.action === 'die') {
        // Roll over and go limp
        const death = p;
        body.position.y -= death * 0.8;
        body.rotation.z = death * Math.PI * 0.8;
        tail.rotation.z = death * Math.PI * 0.6;
        head.rotation.x = death * 0.6;
        lowerJaw.rotation.x = death * 0.5;
      }
      else if (s.action === 'evolve') {
        // Flex and pulse
        const pulse = Math.sin(p * Math.PI);
        body.scale.y = 1 + pulse * 0.15;
        dorsalFin.rotation.z = -0.15 - pulse * 0.4;
        tail.rotation.z = pulse * 0.5;
      }
    }
  };

  return shark;
}
```