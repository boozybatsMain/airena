"use strict";
function build(THREE, TSL) {
  // ARMoured octopus — ONE QUALITY: mass and power slung over eight radial limbs.
  // Brief: a squat dome mantle (the biggest mass, wider than any tentacle) floating
  // on a ring of eight segmented machine tentacles, each a chain of turned segments
  // with shell plates on the outboard face and a ram + hose per segment. Leading end
  // is the front of the dome: two recessed lens eyes in machined bezels under brow
  // plates, and a two-part steel beak with tines underneath. Dark gunmetal machine
  // packed under chalky white pressed shells; cable plumbed per-segment so nothing
  // spans a joint.

  const bone = 0xd8d2c6, boneSh = 0xc9c2b4, gun = 0x55524c, gunL = 0x6b665e,
        blued = 0x3e3a34, bronzeC = 0x4a4238, cableC = 0x1e1d1b;

  // --- shell material with TSL wear: chips at wrap seam/edges, grime in lows, dust on up ---
  const shellMat = new THREE.MeshStandardMaterial({ color: bone, metalness: 0.08, roughness: 0.6, side: THREE.DoubleSide });
  {
    const { positionLocal, normalLocal, uv, sin, float, smoothstep, min, oneMinus, mix, vec3 } = TSL;
    const p = positionLocal;
    const n1 = sin(p.x.mul(5.3).add(sin(p.y.mul(4.1)).mul(2.0))).mul(sin(p.z.mul(3.7).add(sin(p.x.mul(2.3)))))
      .mul(0.5).add(0.5);
    const grime = smoothstep(float(0.55), float(0.95), n1);
    const u = uv().x;
    const edge = min(u, oneMinus(u));
    const chip = smoothstep(float(0.10), float(0.0), edge);
    const up = smoothstep(float(0.15), float(0.9), normalLocal.y);
    const base = vec3(bone), worn = vec3(boneSh), bare = vec3(0xb5ac9c), dark = vec3(0x8a8276);
    let c = mix(base, worn, grime.mul(0.6));
    c = mix(c, bare, chip);
    c = mix(c, dark, grime.mul(oneMinus(up)).mul(0.35));
    shellMat.colorNode = c;
    shellMat.roughnessNode = float(0.6).add(up.mul(0.15)).add(grime.mul(0.1));
  }
  const metal = new THREE.MeshStandardMaterial({ color: gun, metalness: 0.75, roughness: 0.55 });
  const metalL = new THREE.MeshStandardMaterial({ color: gunL, metalness: 0.7, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: blued, metalness: 0.8, roughness: 0.65 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: bronzeC, metalness: 0.7, roughness: 0.6 });
  const rubber = new THREE.MeshStandardMaterial({ color: cableC, metalness: 0.0, roughness: 0.9 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.1, roughness: 0.08 });

  const root = new THREE.Group(); root.name = 'octopus';

  const mesh = (g, m, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
    (parent || root).add(o); return o;
  };
  const boltRing = (n, r, parent, y, faceR, mat) => {
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 6), mat || metalL, parent,
        Math.cos(a) * r, y, Math.sin(a) * r);
    }
  };

  // ============ MANTLE (leading mass + armour) ============
  const mantle = new THREE.Group(); mantle.name = 'mantle'; mantle.position.set(0, 2.3, 0); root.add(mantle);

  // interior machine: core column, gear ring, rams
  const core = new THREE.Group(); core.name = 'mantleCore'; mantle.add(core);
  mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.5, 8), metal, core, 0, 0.7, 0);
  mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.7, 6), bronzeMat, core, 0, 0.75, 0.5, 0, 0, 0.25);
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.5;
    mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), metalL, core, Math.cos(a) * 0.85, 0.75, Math.sin(a) * 0.85, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), lens, core, Math.cos(a) * 0.95, 0.25, Math.sin(a) * 0.95, Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
  }
  const gearRing = new THREE.Group(); gearRing.name = 'gearRing'; mantle.add(gearRing);
  mesh(new THREE.TorusGeometry(1.05, 0.09, 8, 28), bronzeMat, gearRing, 0, 0.15, 0, Math.PI / 2);
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2;
    mesh(new THREE.BoxGeometry(0.09, 0.12, 0.09), metalL, gearRing, Math.cos(a) * 1.14, 0.15, Math.sin(a) * 1.14, 0, -a);
  }
  mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 24), metalL, gearRing, 0, 1.1, 0, Math.PI / 2);

  // dome core volume + pressed shell plates around it (overlapping, gaps show machine)
  mesh(new THREE.SphereGeometry(1.35, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), dark, mantle, 0, 0.15, 0).scale.set(1, 1.25, 1);
  mesh(new THREE.CylinderGeometry(1.38, 1.3, 0.4, 16), metal, mantle, 0, 0.1, 0);
  for (let k = 0; k < 6; k++) {
    const a0 = k / 6 * Math.PI * 2 - 0.12, len = Math.PI / 3 + 0.35;
    const pl = new THREE.Group(); pl.name = 'mantlePlate' + k; mantle.add(pl);
    const g = new THREE.SphereGeometry(1.48, 14, 10, a0, len, 0.12, Math.PI * 0.52);
    const sh = mesh(g, shellMat, pl, 0, 0.12, 0); sh.scale.set(1, 1.22, 1);
    // rolled rim + bolts + a raised rib on alternating plates
    mesh(new THREE.TorusGeometry(1.49, 0.035, 6, 14, len * 0.8), metalL, pl, 0, 0.12, 0, 0, a0 + len * 0.1, Math.PI / 2 - 0.35);
    if (k % 2 === 0) {
      const rib = mesh(new THREE.BoxGeometry(0.1, 0.35, 0.9), metalL, pl);
      const am = a0 + len / 2;
      rib.position.set(Math.cos(am) * 1.42, 1.05, Math.sin(am) * 1.42);
      rib.lookAt(Math.cos(am) * 2.4, 1.3, Math.sin(am) * 2.4);
    }
    for (let b = 0; b < 4; b++) {
      const am = a0 + len * (0.15 + b * 0.23);
      mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 6), metalL, pl, Math.cos(am) * 1.5, 0.75, Math.sin(am) * 1.5, Math.PI / 2, 0, -am + Math.PI / 2);
    }
  }
  // top hatch (own plate) + seam ring
  const hatch = new THREE.Group(); hatch.name = 'hatch'; mantle.add(hatch);
  mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.16, 12), shellMat, hatch, 0, 1.62, 0);
  mesh(new THREE.TorusGeometry(0.52, 0.04, 6, 16), metalL, hatch, 0, 1.56, 0, Math.PI / 2);
  mesh(new THREE.BoxGeometry(0.16, 0.06, 0.3), metalL, hatch, 0, 1.72, 0.15);
  boltRing(8, 0.42, hatch, 1.7, 0.5);
  // mantle harness: three runs, top hatch port down to base ports — all inside mantle space
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 1.0, r0 = 0.42 + k * 0.06;
    const pts = [new THREE.Vector3(Math.cos(a) * 0.3, 1.6, Math.sin(a) * 0.3),
      new THREE.Vector3(Math.cos(a) * r0 * 1.6, 1.1, Math.sin(a) * r0 * 1.6),
      new THREE.Vector3(Math.cos(a) * 1.5, 0.5, Math.sin(a) * 1.5),
      new THREE.Vector3(Math.cos(a) * 1.45, 0.15, Math.sin(a) * 1.45)];
    const tb = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.07 + k * 0.02, 8), rubber, mantle);
    tb.name = 'mantleHose' + k;
    mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 10), metalL, mantle, Math.cos(a) * 1.5, 0.5, Math.sin(a) * 1.5, 0, -a, 1.2);
    mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 8), metalL, mantle, Math.cos(a) * 1.45, 0.1, Math.sin(a) * 1.45);
  }
  // status port (one of two emissives on the whole body)
  const port = mesh(new THREE.BoxGeometry(0.12, 0.05, 0.2), new THREE.MeshStandardMaterial({ color: 0x2a2218, emissive: 0xd08a20, emissiveIntensity: 1.2, roughness: 0.4 }), mantle, 1.42, 0.6, 0.35);
  port.name = 'statusPort';
  port.material.emissiveNode = TSL.mul(TSL.uniform(1), TSL.vec3(1.0, 0.55, 0.1)).mul(TSL.smoothstep(TSL.float(0.3), TSL.float(0.9), TSL.sin(TSL.time.mul(2)).mul(0.5).add(0.5)));

  // --- eyes + brow (leading end) ---
  function eye(sx) {
    const e = new THREE.Group(); e.name = sx > 0 ? 'eyeR' : 'eyeL';
    e.position.set(sx * 0.72, 0.75, 1.02); mantle.add(e);
    mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.28, 8), metal, e, 0, 0, 0, Math.PI / 2 - 0.35);
    mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 18), metalL, e, 0, 0.04, 0.14, Math.PI / 2 - 0.35);
    const gl = mesh(new THREE.SphereGeometry(0.14, 16, 12), lens, e, 0, 0.02, 0.1);
    gl.scale.set(1, 1, 0.55);
    mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 12), bronzeMat, e, 0, 0.02, 0.2, Math.PI / 2 - 0.35);
    return e;
  }
  eye(1); eye(-1);
  for (const sx of [1, -1]) {
    const br = new THREE.Group(); br.name = sx > 0 ? 'browR' : 'browL';
    br.position.set(sx * 0.72, 1.0, 0.92); mantle.add(br);
    const sh = new THREE.Shape();
    sh.moveTo(-0.28, 0); sh.lineTo(0.3, 0.02); sh.quadraticCurveTo(0.36, 0.1, 0.3, 0.16);
    sh.lineTo(-0.24, 0.14); sh.quadraticCurveTo(-0.34, 0.08, -0.28, 0);
    mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), shellMat, br, 0, 0, 0, 0.5, 0, 0);
  }
  // cheek plates flank the beak
  for (const sx of [1, -1]) {
    const ck = mesh(new THREE.SphereGeometry(0.3, 10, 8, -0.6, 2.0, 0.4, 1.4), shellMat, mantle, sx * 0.45, 0.35, 0.9);
    ck.name = sx > 0 ? 'cheekR' : 'cheekL'; ck.scale.set(0.5, 0.8, 0.6);
  }

  // --- beak (hinged jaws + tines) ---
  const beak = new THREE.Group(); beak.name = 'beak'; beak.position.set(0, -0.15, 1.05); mantle.add(beak);
  mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.18, 10), metal, beak, 0, 0.1, 0);
  const beakTop = new THREE.Group(); beakTop.name = 'beakTop'; beakTop.position.set(0, 0.05, 0); beak.add(beakTop);
  mesh(new THREE.ConeGeometry(0.22, 0.55, 6), dark, beakTop, 0, -0.25, 0, Math.PI);
  const beakBot = new THREE.Group(); beakBot.name = 'beakBot'; beakBot.position.set(0, 0.05, 0); beak.add(beakBot);
  mesh(new THREE.ConeGeometry(0.18, 0.42, 6), dark, beakBot, 0, -0.2, 0);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    mesh(new THREE.ConeGeometry(0.045, 0.22, 5), metalL, beakBot, Math.cos(a) * 0.2, -0.32, Math.sin(a) * 0.2, Math.PI + 0.25 * Math.sin(a), 0, 0.25 * Math.cos(a));
  }

  // ============ TENTACLES ×8 ============
  const SEGS = 6, SEGLEN = 0.55;
  const tent = [];
  for (let i = 0; i < 8; i++) {
    const az = i / 8 * Math.PI * 2;
    const tg = new THREE.Group(); tg.name = 'tentacle' + i;
    tg.position.set(Math.sin(az) * 1.05, 2.05, Math.cos(az) * 1.05);
    tg.rotation.order = 'YXZ';
    root.add(tg);
    // shoulder yoke + collar at the mantle ring
    mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), metal, tg, 0, 0.08, 0);
    mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 10), metalL, tg, 0, 0.02, 0, Math.PI / 2);
    boltRing(6, 0.27, tg, 0.2, 0.3);
    let parent = tg;
    const segs = [];
    for (let j = 0; j < SEGS; j++) {
      const f = j / (SEGS - 1);
      const r = 0.34 * (1 - f * 0.68) + 0.06;
      const sg = new THREE.Group(); sg.name = `seg-${i}-${j}`; sg.position.set(0, j === 0 ? 0 : -SEGLEN, 0);
      parent.add(sg);
      // core segment, faceted, tapering
      mesh(new THREE.CylinderGeometry(r * 0.9, r * 1.08, SEGLEN, 8), metal, sg, 0, -SEGLEN / 2, 0);
      // joint collar at the top of each segment (the visible pin joint)
      if (j > 0) {
        mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.18, 0.1, 10), bronzeMat, sg, 0, -0.02, 0);
        mesh(new THREE.CylinderGeometry(0.05, 0.05, r * 2.6, 6), metalL, sg, 0, 0, 0, 0, 0, Math.PI / 2);
      }
      // shell plate: pressed partial cylinder wrapping the outboard face
      const sh = mesh(new THREE.CylinderGeometry(r + 0.055, r + 0.09, SEGLEN * 0.82, 12, 1, true, -1.15, 2.3), shellMat, sg, 0, -SEGLEN / 2, 0);
      sh.name = `plate-${i}-${j}`;
      mesh(new THREE.TorusGeometry(r + 0.06, 0.028, 6, 14, 2.1), metalL, sg, 0, -SEGLEN * 0.86, 0, 0, -1.05 + 0, Math.PI / 2);
      // linear ram alongside the bone: barrel + polished rod + gland boot
      const rmx = (j % 2 ? 1 : -1) * (r + 0.1);
      mesh(new THREE.CylinderGeometry(0.055, 0.065, SEGLEN * 0.55, 8), metalL, sg, rmx, -SEGLEN * 0.32, 0);
      mesh(new THREE.CylinderGeometry(0.028, 0.028, SEGLEN * 0.5, 6), lens, sg, rmx, -SEGLEN * 0.78, 0);
      mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.09, 8), rubber, sg, rmx, -SEGLEN * 0.56, 0);
      mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), metal, sg, rmx, -SEGLEN * 0.08, 0);
      // chain run over the outboard face — links every other segment
      if (j % 2 === 0) {
        for (let L = 0; L < 3; L++) {
          mesh(new THREE.TorusGeometry(0.05, 0.018, 6, 10), dark, sg, 0, -SEGLEN * (0.2 + L * 0.3), r + 0.13, 0, (L % 2) * Math.PI / 2);
        }
        mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 8), bronzeMat, sg, 0, -SEGLEN * 0.5, r + 0.13, Math.PI / 2);
      }
      // corrugated hose on the inboard face, parented to THIS segment only (never spans the joint)
      const hp = [new THREE.Vector3(0.08, -0.04, -r - 0.06), new THREE.Vector3(0, -SEGLEN / 2, -r - 0.13), new THREE.Vector3(-0.08, -SEGLEN + 0.04, -r - 0.06)];
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), 8, 0.042, 7), rubber, sg);
      mesh(new THREE.BoxGeometry(0.1, 0.05, 0.08), metalL, sg, 0, -SEGLEN * 0.5, -r - 0.1);
      segs.push(sg); parent = sg;
    }
    // tip: three articulated digits (two links + claw each) around a knuckle
    const tip = new THREE.Group(); tip.name = `tip-${i}`; tip.position.set(0, -SEGLEN, 0); parent.add(tip);
    mesh(new THREE.SphereGeometry(0.11, 10, 8), bronzeMat, tip);
    for (let dg = 0; dg < 3; dg++) {
      const a = dg / 3 * Math.PI * 2;
      const fg = new THREE.Group(); fg.name = `digit-${i}-${dg}`;
      fg.position.set(Math.cos(a) * 0.09, -0.05, Math.sin(a) * 0.09);
      fg.rotation.set(0.5, -a, 0); tip.add(fg);
      mesh(new THREE.BoxGeometry(0.06, 0.11, 0.06), metal, fg, 0, -0.06, 0);
      const l2 = new THREE.Group(); l2.name = `digit2-${i}-${dg}`; l2.position.set(0, -0.12, 0); fg.add(l2);
      mesh(new THREE.BoxGeometry(0.05, 0.09, 0.05), metal, l2, 0, -0.05, 0);
      mesh(new THREE.ConeGeometry(0.03, 0.12, 5), dark, l2, 0, -0.14, 0, Math.PI);
    }
    tent.push({ root: tg, segs, az });
  }

  // second (and last) emissive: heat slot low on the core, seen in the gaps
  const heat = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.1), new THREE.MeshStandardMaterial({ color: 0x201408, emissive: 0xd06818, emissiveIntensity: 0.9, roughness: 0.5 }), mantle, 0, 0.35, -1.2);
  heat.name = 'heatSlot';

  root.userData.tent = tent; root.userData.mantle = mantle; root.userData.beak = beak;
  root.userData.beakTop = beakTop; root.userData.beakBot = beakBot;

  // ================= POSE =================
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const TILT = -0.95, CURL = 0.30;

  root.userData.pose = (s) => {
    const d = root.userData, T = d.tent, M = d.mantle, BK = d.beakTop, BB = d.beakBot, R = root;
    const t = s.t || 0, spd = s.speed || 0, e = s.phase || 0;
    // ---- reset to rest, every frame, from the root outward ----
    R.position.set(0, 0, 0); R.rotation.set(0, 0, 0);
    M.position.set(0, 2.3, 0); M.rotation.set(0, 0, 0); M.scale.set(1, 1, 1);
    BK.rotation.set(0, 0, 0); BB.rotation.set(0, 0, 0);
    for (let i = 0; i < 8; i++) {
      const tt = T[i];
      tt.root.rotation.set(TILT, tt.az, 0);
      for (let j = 0; j < tt.segs.length; j++) tt.segs[j].rotation.set(CURL, 0, (i % 2 ? 1 : -1) * 0.03);
    }
    // ---- living idle: breathing, weight shift, head scan ----
    M.scale.y = 1 + 0.022 * Math.sin(t * 1.3);
    M.rotation.y = Math.sin(t * 0.35) * 0.3;
    R.position.y += Math.sin(t * 0.8) * 0.02;
    // ---- gait from speed, cycle driven off stride ----
    if (spd > 0.01) {
      const run = sm(1.6, 2.6, spd);
      const amp = Math.min(1.4, spd * 0.7 + 0.15);
      const creep = 1 - sm(0.3, 0.7, spd);
      R.position.y += -0.15 * creep + run * 0.12;
      R.rotation.x += 0.10 * Math.min(spd, 3) / 3 + 0.05 * run;
      for (let i = 0; i < 8; i++) {
        const tt = T[i];
        const p = s.stride * Math.PI * 2 * (1 + run * 0.6) + tt.az * 2 + (run > 0.5 ? (i % 2) * Math.PI : i * 0.9);
        const lift = Math.max(0, Math.sin(p)) * amp;
        const sw = Math.cos(p) * amp;
        tt.root.rotation.x += lift * 0.38 - sw * 0.05;
        for (let j = 0; j < tt.segs.length; j++)
          tt.segs[j].rotation.x += Math.sin(p - j * 0.55) * 0.10 * amp - lift * 0.06;
      }
      R.position.y += Math.abs(Math.sin(s.stride * Math.PI * 2)) * 0.1 * amp;
    }
    // ---- flat out: body flattens, tentacles stream ----
    if (spd > 3) {
      const k = sm(3, 6, spd);
      R.rotation.x += 0.12 * k; M.rotation.x += 0.28 * k; M.position.y -= 0.12 * k;
      for (const tt of T) {
        tt.root.rotation.x -= 0.18 * k;
        for (const g of tt.segs) g.rotation.x += 0.07 * k;
      }
    }
    // ---- turn overlay: bank, head leads, inside limbs shorten ----
    if (s.turn) {
      const tn = s.turn;
      R.rotation.z += tn * 0.10;
      M.rotation.y += tn * 0.35;
      for (let i = 0; i < 8; i++) {
        const tt = T[i], side = Math.sin(tt.az);
        const inside = side * tn > 0 ? 1 : -1;
        for (const g of tt.segs) g.rotation.x += inside * 0.10;
      }
    }
    // ---- airborne: walking stops, limbs trail and sway ----
    if (s.grounded === false) {
      R.rotation.x += -0.1;
      for (let i = 0; i < 8; i++) {
        const tt = T[i];
        tt.root.rotation.x += -0.45 + Math.sin(t * 2 + i) * 0.06;
        for (let j = 0; j < tt.segs.length; j++)
          tt.segs[j].rotation.x += -0.12 - j * 0.02 + Math.sin(t * 3 - j * 0.7) * 0.08;
      }
    }
    // ---- hurt overlay: favour a side, sag, one limb hangs ----
    if (s.health < 0.6) {
      const k = Math.min(1, (0.6 - Math.max(s.health, 0)) / 0.4);
      R.rotation.z += 0.12 * k; M.rotation.x += 0.10 * k; M.position.y -= 0.08 * k;
      for (const g of T[2].segs) g.rotation.x += 0.10 * k;
      BK.rotation.x += -0.2 * k;
    }
    // ---- actions ----
    const act = s.action;
    if (!act) return;
    const front = (tt) => Math.cos(tt.az) > 0.4;
    switch (act) {
      case 'attack': {
        const pull = e < 0.3 ? e / 0.3 : Math.max(0, 1 - (e - 0.3) / 0.15);
        const thr = (e >= 0.3 && e < 0.65) ? Math.sin((e - 0.3) / 0.35 * Math.PI) : 0;
        for (const tt of T) if (front(tt)) {
          tt.root.rotation.x += thr * 1.35 - pull * 0.45;
          for (const g of tt.segs) g.rotation.x -= thr * 0.13 + pull * 0.05;
        }
        M.rotation.x += thr * 0.12 - pull * 0.1;
        BK.rotation.x += thr * 0.55;
        break;
      }
      case 'fire': {
        const aim = sm(0, 0.35, e);
        const rec = e > 0.5 ? Math.exp(-(e - 0.5) * 8) : 0;
        M.rotation.x += aim * 0.15 - rec * 0.12;
        M.position.z += aim * 0.05 - rec * 0.18;
        R.position.y -= rec * 0.05;
        BK.rotation.x += Math.sin(Math.min(e * 2, 1) * Math.PI) * 0.45;
        break;
      }
      case 'hit': {
        const k = Math.sin(Math.min(e * 4, 1) * Math.PI);
        R.rotation.x += -0.22 * k; R.position.y -= 0.08 * k; M.rotation.z += 0.08 * k;
        for (const tt of T) for (const g of tt.segs) g.rotation.x += 0.08 * k;
        break;
      }
      case 'block': {
        const k = Math.min(e * 3, 1) * (e > 0.8 ? (1 - e) / 0.2 : 1);
        R.position.y -= 0.45 * k; M.rotation.x += 0.22 * k;
        for (const tt of T) {
          tt.root.rotation.y += (0 - tt.az) * 0.25 * k;
          tt.root.rotation.x += 0.3 * k;
          for (const g of tt.segs) g.rotation.x += 0.12 * k;
        }
        break;
      }
      case 'gather': {
        const reach = e < 0.4 ? sm(0, 0.4, e) : e < 0.65 ? 1 : 1 - sm(0.65, 1, e);
        const tt = T[0];
        tt.root.rotation.x += reach * 0.55;
        for (const g of tt.segs) g.rotation.x -= reach * 0.15;
        M.rotation.x += reach * 0.15; R.position.y -= reach * 0.1;
        break;
      }
      case 'deposit': {
        const reach = Math.sin(Math.PI * Math.min(e * 1.05, 1));
        const tt = T[7];
        tt.root.rotation.x += reach * 0.55;
        for (const g of tt.segs) g.rotation.x -= reach * 0.15;
        M.rotation.x += reach * 0.18; R.position.y -= reach * 0.12;
        break;
      }
      case 'eat': {
        const down = Math.min(e * 4, 1) * (1 - Math.max(0, (e - 0.8) / 0.2));
        const chew = Math.sin(e * Math.PI * 6) * down;
        M.rotation.x += 0.55 * down; R.position.y -= 0.15 * down;
        BK.rotation.x += 0.12 * down + chew * 0.22;
        BB.rotation.x -= 0.12 * down + chew * 0.12;
        break;
      }
      case 'drink': {
        let down = Math.min(e * 3, 1); if (e > 0.8) down *= (1 - e) / 0.2;
        M.rotation.x += 0.5 * down; R.position.y -= 0.12 * down;
        BK.rotation.x += 0.1 * down;
        break;
      }
      case 'jump': {
        const cr = e < 0.35 ? sm(0, 0.35, e) : 0;
        const ex = e >= 0.35 ? sm(0.35, 0.65, e) : 0;
        R.position.y += -0.5 * cr + 0.35 * ex;
        for (const tt of T) {
          tt.root.rotation.x += ex * 0.55 - cr * 0.1;
          for (const g of tt.segs) g.rotation.x += cr * 0.16 - ex * 0.1;
        }
        break;
      }
      case 'land': {
        const comp = Math.sin(Math.min(e * 1.4, 1) * Math.PI) * (1 - sm(0.7, 1, e) * 0.4);
        R.position.y -= 0.55 * comp; R.rotation.x += 0.15 * comp;
        for (const tt of T) for (const g of tt.segs) g.rotation.x += 0.18 * comp;
        break;
      }
      case 'signal': {
        const rise = Math.sin(Math.min(e * 1.2, 1) * Math.PI);
        R.position.y += 0.4 * rise; M.rotation.x += -0.12 * rise;
        BK.rotation.x += rise * 0.55; BB.rotation.x -= rise * 0.3;
        for (const tt of T) {
          tt.root.rotation.x += -rise * 0.35;
          for (let j = 0; j < tt.segs.length; j++)
            tt.segs[j].rotation.z += Math.sin(t * 5 + j) * 0.1 * rise;
        }
        break;
      }
      case 'sleep': {
        const dn = sm(0, 0.85, e);
        R.position.y += -1.55 * dn;
        for (const tt of T) {
          tt.root.rotation.x += dn * 0.6;
          for (const g of tt.segs) g.rotation.x += dn * 0.55;
        }
        M.rotation.x += 0.12 * dn; M.position.y -= 0.25 * dn;
        BK.rotation.x += 0.15 * dn;
        break;
      }
      case 'wake': {
        const dn = Math.pow(1 - sm(0, 1, e), 1.4);
        const push = Math.sin(Math.min(e * 1.3, 1) * Math.PI) * 0.15;
        R.position.y += -1.55 * dn + push;
        for (const tt of T) {
          tt.root.rotation.x += dn * 0.6;
          for (const g of tt.segs) g.rotation.x += dn * 0.55;
        }
        M.rotation.x += 0.12 * dn; M.position.y -= 0.25 * dn;
        break;
      }
      case 'die': {
        const k = sm(0, 1, e);
        R.position.y += -1.7 * k; R.rotation.z += 0.5 * k; R.rotation.x += -0.25 * k;
        M.rotation.x += 0.3 * k;
        for (const tt of T) {
          tt.root.rotation.x += -0.25 * k;
          for (const g of tt.segs) g.rotation.x += 0.4 * k;
        }
        BK.rotation.x += 0.5 * k;
        break;
      }
      case 'evolve': {
        const open = sm(0, 0.4, e) * (e < 0.7 ? 1 : 1 - sm(0.7, 1, e));
        R.position.y += -0.3 * Math.sin(e * Math.PI) + open * 0.3;
        M.scale.multiplyScalar(1 + open * 0.12);
        M.rotation.y += Math.sin(t * 30) * 0.015 * open;
        for (const tt of T) {
          tt.root.rotation.x += -open * 0.3;
          for (const g of tt.segs) g.rotation.x -= open * 0.06;
        }
        break;
      }
    }
  };

  root.userData.update = (t) => {
    root.userData.pose({ speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0, t, dt: 0 });
  };

  return root;
}
;return build(THREE, TSL);