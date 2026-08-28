function build(THREE, TSL) {
  // ONE QUALITY: ARMOURED MASS — a heavy pressurised mantle bag slung over eight thick machine arms.
  /* BRIEF
     A crawling octopus rebuilt as hardware. The mass is the MANTLE: a deep bag, 0.55 radius,
     rising behind and above the head, built as a stack of ten machined hoops on a curved spine
     with chain runs, rams and gear stacks packed between them, then clad in overlapping pressed
     plates — side plates left and right with a 70-degree gap along the top and bottom, and a
     ridge of four large lapped plates over the crown where the camera looks.
     Ahead and below it sits the HEAD: one short rigid wedge, one shoulder wide, on a stubby
     three-block neck. Two huge domed eyes on its flanks — dark recessed glass with a horizontal
     slit pupil in a stepped bezel and a hood over each. Beneath, the beak: two hinged mandibles
     with their own rams. An asymmetric siphon nozzle bolted to the left of the nape.
     Eight ARMS radiate from a crown of bearing races around the mouth: 1.8 long, tapering
     0.155 to 0.018 over eight linked segments, each segment a hinge with two sprocket discs and
     a pin, top shells over the base five, and two rows of lathed sucker cups underneath.
     Cable: short hoses, each one split at every joint into port collars, never spanning a pivot.
     What makes it expensive: the value split — chalky bone plate over near-black machine — and
     the fact the mantle is a stack you can see into, not a bag. */

  const { vec3, positionLocal, normalLocal, mix, smoothstep, clamp, abs, max, sin, cos,
          oneMinus, float } = TSL;

  // ───────────────────────────── materials
  const cv = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };
  const nz = (p) => {
    const a = sin(p.x.mul(4.3).add(sin(p.z.mul(2.7)).mul(1.7)))
      .mul(cos(p.y.mul(3.9).add(sin(p.x.mul(2.3)).mul(1.4))));
    const b = sin(p.z.mul(8.9).sub(p.y.mul(6.1))).mul(cos(p.x.mul(7.7).add(p.z.mul(3.1))));
    const c = sin(p.y.mul(16.7).add(p.z.mul(12.3))).mul(cos(p.x.mul(14.9).sub(p.y.mul(5.0))));
    return a.mul(0.52).add(b.mul(0.30)).add(c.mul(0.18)).mul(0.5).add(0.5);
  };
  const C_worn = cv(0xB5AC9C), C_mach = cv(0x55524C), C_face = cv(0x6B665E),
        C_blue = cv(0x3E3A34), C_rust = cv(0x8B3D16), C_grime = cv(0x2A2723);

  function wearMat(hex, kind) {
    const m = new THREE.MeshStandardNodeMaterial();
    const base = cv(hex);
    const n = normalLocal;
    const amax = max(max(abs(n.x), abs(n.y)), abs(n.z));
    const edge = clamp(oneMinus(amax).mul(3.2), float(0), float(1));
    const up = clamp(n.y, float(0), float(1));
    const down = smoothstep(float(0.15), float(-0.7), n.y);
    const vert = oneMinus(abs(n.y));
    const P = positionLocal;
    const broad = nz(P.mul(2.3));
    const fine = nz(P.mul(9.5));
    const drip = nz(P.mul(vec3(7.0, 0.8, 7.0)));
    let col;
    if (kind === 'shell') {
      col = mix(base, C_worn, smoothstep(float(0.35), float(0.85), broad).mul(0.75));
      col = mix(col, C_face, edge.mul(smoothstep(float(0.35), float(0.70), fine)).mul(0.85));
      col = mix(col, C_blue, edge.mul(0.28));
      col = mix(col, C_rust, smoothstep(float(0.66), float(0.84), fine).mul(edge.mul(0.75).add(0.12)));
      col = mix(col, C_rust.mul(0.65), smoothstep(float(0.62), float(0.92), drip).mul(vert).mul(0.40));
      col = mix(col, C_grime, down.mul(0.50));
      col = mix(col, col.mul(1.12), up.mul(0.5));
      m.metalnessNode = clamp(float(0.10).add(edge.mul(0.55)), float(0), float(1));
      m.roughnessNode = clamp(float(0.60).add(up.mul(0.12)).sub(edge.mul(0.10)).add(down.mul(0.08)),
        float(0.34), float(0.95));
    } else {
      col = mix(base, C_face, smoothstep(float(0.40), float(0.80), broad).mul(0.55));
      col = mix(col, C_face.mul(1.30), edge.mul(0.60));
      col = mix(col, C_rust, smoothstep(float(0.70), float(0.88), fine).mul(edge.mul(0.8).add(0.16)).mul(0.8));
      col = mix(col, C_rust.mul(0.60), smoothstep(float(0.66), float(0.94), drip).mul(vert).mul(0.35));
      col = mix(col, C_grime, down.mul(0.60));
      m.metalnessNode = clamp(float(0.82).sub(down.mul(0.20)), float(0), float(1));
      m.roughnessNode = clamp(float(0.50).add(up.mul(0.14)).add(down.mul(0.12)).sub(edge.mul(0.08)),
        float(0.35), float(0.95));
    }
    m.colorNode = col;
    return m;
  }

  const MAT = {
    shell: wearMat(0xD8D2C6, 'shell'),
    shell2: wearMat(0xC9C2B4, 'shell'),
    accent: wearMat(0xC2521E, 'shell'),
    mach: wearMat(0x55524C, 'mach'),
    mach2: wearMat(0x4A4238, 'mach'),
    dark: wearMat(0x3E3A34, 'mach'),
    cable: new THREE.MeshStandardNodeMaterial({ color: 0x1E1D1B, roughness: 0.92, metalness: 0.03 }),
    rubber: new THREE.MeshStandardNodeMaterial({ color: 0x1E1D1B, roughness: 0.95, metalness: 0.0 }),
    lens: new THREE.MeshStandardNodeMaterial({ color: 0x0B0D10, roughness: 0.07, metalness: 0.15 }),
    glow: new THREE.MeshStandardNodeMaterial({ color: 0x12292c, roughness: 0.4, metalness: 0.2,
      emissive: new THREE.Color(0x2aa8b0), emissiveIntensity: 1.1 })
  };
  MAT.shellO = wearMat(0xD8D2C6, 'shell'); MAT.shellO.side = THREE.DoubleSide;
  MAT.shellO2 = wearMat(0xC9C2B4, 'shell'); MAT.shellO2.side = THREE.DoubleSide;
  MAT.machO = wearMat(0x55524C, 'mach'); MAT.machO.side = THREE.DoubleSide;

  // ───────────────────────────── geometry helpers
  const cylZ = (rt, rb, h, seg = 8, open = false, ts = 0, tl = Math.PI * 2) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl); g.rotateX(Math.PI / 2); return g;
  };
  const cylX = (rt, rb, h, seg = 10) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); g.rotateZ(Math.PI / 2); return g;
  };
  const cylY = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
  const latheZ = (pts, seg = 14) => {
    const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
    g.rotateX(Math.PI / 2); return g;
  };
  const latheY = (pts, seg = 12) =>
    new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
  const mk = (parent, geo, mat, name, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat); m.name = name; m.position.set(x, y, z); parent.add(m); return m;
  };
  const slot = (cx, cy, w, h) => {
    const p = new THREE.Path();
    p.moveTo(cx - w, cy - h); p.lineTo(cx + w, cy - h); p.lineTo(cx + w, cy + h); p.lineTo(cx - w, cy + h);
    p.closePath(); return p;
  };
  function pShape(w, h, c) {
    const s = new THREE.Shape();
    s.moveTo(-w + c, -h); s.lineTo(w - c, -h); s.lineTo(w, -h + c);
    s.lineTo(w, h - c * 1.7); s.lineTo(w - c * 1.7, h); s.lineTo(-w + c * 1.7, h);
    s.lineTo(-w, h - c * 1.7); s.lineTo(-w, -h + c); s.closePath();
    return s;
  }
  function plateGeo(w, h, c, depth, vents, flat) {
    const s = pShape(w, h, c);
    if (vents) { s.holes.push(slot(-w * 0.35, 0, w * 0.10, h * 0.35)); s.holes.push(slot(w * 0.35, 0, w * 0.10, h * 0.35)); }
    const g = new THREE.ExtrudeGeometry(s, {
      depth, bevelEnabled: true, bevelSize: depth * 0.4, bevelThickness: depth * 0.4,
      bevelSegments: 2, curveSegments: 4
    });
    g.translate(0, 0, -depth * 0.5);
    if (flat) g.rotateX(-Math.PI / 2);
    return g;
  }
  const boltZ = cylZ(0.014, 0.019, 0.013, 6);
  const boltY = cylY(0.014, 0.019, 0.013, 6);
  const suckG = latheY([[0.002, 0], [0.030, 0.0], [0.043, 0.013], [0.041, 0.030], [0.027, 0.026], [0.019, 0.010]], 10);
  const linkG = (() => {
    const s = pShape(0.026, 0.016, 0.007);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 });
    g.translate(0, 0, -0.025); return g;
  })();
  const pinG = cylX(0.010, 0.010, 0.062, 6);

  function quatFromDir(dir) {
    const z = dir.clone().normalize();
    const up = Math.abs(z.y) > 0.98 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(up, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }
  function boltRing(parent, r, count, z, mat, name) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      mk(parent, boltZ, mat, name + '_' + i, Math.cos(a) * r, Math.sin(a) * r, z);
    }
  }
  function chainRun(parent, pts, mat, name, sc = 1) {
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const d = new THREE.Vector3().subVectors(q, p);
      const mid = new THREE.Vector3().addVectors(p, q).multiplyScalar(0.5);
      const m = mk(parent, linkG, mat, name + '_link_' + i, mid.x, mid.y, mid.z);
      m.quaternion.copy(quatFromDir(d));
      m.rotateZ((i % 2) * Math.PI / 2);
      m.scale.set(sc, sc, Math.max(0.5, d.length() / 0.05) * sc);
      if (i % 3 === 0) {
        const pn = mk(parent, pinG, MAT.mach2, name + '_pin_' + i, mid.x, mid.y, mid.z);
        pn.quaternion.copy(m.quaternion); pn.scale.setScalar(sc);
      }
    }
  }
  function tubeRun(parent, pts, r, mat, name) {
    const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const g = new THREE.TubeGeometry(c, Math.max(8, pts.length * 4), r, 7, false);
    return mk(parent, g, mat, name);
  }
  const portG = latheZ([[0.018, 0], [0.040, 0.0], [0.044, 0.016], [0.030, 0.026], [0.022, 0.022]], 10);

  // ───────────────────────────── root / core hub
  const root = new THREE.Group(); root.name = 'armoured_octopus';
  const core = new THREE.Object3D(); core.name = 'core_hub';
  core.position.set(0, 0.60, 0.30); root.add(core);

  mk(core, cylZ(0.30, 0.34, 0.40, 10), MAT.mach, 'core_drum', 0, 0, -0.04);
  mk(core, new THREE.TorusGeometry(0.33, 0.028, 7, 22), MAT.mach2, 'core_race_front', 0, 0, 0.14);
  mk(core, new THREE.TorusGeometry(0.30, 0.024, 7, 22), MAT.dark, 'core_race_rear', 0, 0, -0.22);
  boltRing(core, 0.33, 10, 0.155, MAT.mach2, 'core_bolt');
  for (let s2 = -1; s2 <= 1; s2 += 2) {
    for (let g = 0; g < 3; g++)
      mk(core, cylX(0.11 - g * 0.022, 0.11 - g * 0.022, 0.026, 14), g === 1 ? MAT.dark : MAT.mach2,
        'core_gear_' + (s2 > 0 ? 'R' : 'L') + g, s2 * (0.24 + g * 0.028), 0.02, -0.05);
  }
  mk(core, cylZ(0.14, 0.16, 0.10, 8), MAT.dark, 'core_valve_block', 0, -0.20, 0.02);

  // ───────────────────────────── mantle (biggest mass: a stack)
  const mantle = new THREE.Object3D(); mantle.name = 'mantle'; core.add(mantle);
  const mc = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0.02), new THREE.Vector3(0, 0.10, -0.34),
    new THREE.Vector3(0, 0.16, -0.76), new THREE.Vector3(0, 0.15, -1.20),
    new THREE.Vector3(0, 0.06, -1.60)
  ]);
  const rprof = [0.34, 0.48, 0.545, 0.44, 0.17];
  const rAt = (t) => {
    const x = t * (rprof.length - 1), i = Math.min(rprof.length - 2, Math.floor(x)), f = x - i;
    return rprof[i] * (1 - f) + rprof[i + 1] * f;
  };
  const shellsBloom = [];
  const NST = 10, stations = [];
  for (let i = 0; i < NST; i++) {
    const t = 0.03 + (i / (NST - 1)) * 0.94;
    const p = mc.getPoint(t), tan = mc.getTangent(t), r = rAt(t);
    const st = new THREE.Object3D(); st.name = 'mantle_seg_' + i;
    st.position.copy(p); st.quaternion.copy(quatFromDir(tan)); mantle.add(st); stations.push({ st, r, t });
    mk(st, cylZ(r * 0.84, r * 0.88, 0.16, 8), MAT.mach, 'mantle_seg_' + i + '_drum');
    mk(st, cylZ(r * 0.96, r * 0.96, 0.05, 14), MAT.dark, 'mantle_seg_' + i + '_hoop', 0, 0, 0.075);
    mk(st, new THREE.TorusGeometry(r * 0.92, 0.02, 6, 20), MAT.mach2, 'mantle_seg_' + i + '_race', 0, 0, -0.07);
    if (i % 3 === 0) boltRing(st, r * 0.92, 8, 0.10, MAT.mach2, 'mantle_seg_' + i + '_bolt');
    if (i === 2 || i === 5) {
      for (let s2 = -1; s2 <= 1; s2 += 2)
        for (let g = 0; g < 3; g++)
          mk(st, cylX(r * 0.30 - g * 0.03, r * 0.30 - g * 0.03, 0.024, 12), g === 1 ? MAT.dark : MAT.mach2,
            'mantle_gear_' + i + (s2 > 0 ? 'R' : 'L') + g, s2 * (r * 0.72 + g * 0.026), r * 0.10, 0);
    }
  }
  // side shells (partial cylinders, lapping)
  for (let i = 1; i <= 7; i++) {
    const { st, r } = stations[i], rn = stations[i + 1] ? stations[i + 1].r : r * 0.8;
    for (let s2 = -1; s2 <= 1; s2 += 2) {
      const tsDeg = s2 > 0 ? 32 : 212;
      const g = cylZ(rn * 1.10 + 0.02, r * 1.12 + 0.02, 0.26, 22, true,
        tsDeg * Math.PI / 180, 116 * Math.PI / 180);
      const m = mk(st, g, i % 2 ? MAT.shellO : MAT.shellO2,
        'mantle_shell_' + i + (s2 > 0 ? 'R' : 'L'), 0, 0, -0.03);
      shellsBloom.push({ m, p0: m.position.clone(), dir: new THREE.Vector3(s2, 0.25, 0).normalize() });
      const lip = new THREE.TorusGeometry(r * 1.13, 0.014, 5, 16,
        116 * Math.PI / 180);
      const lm = mk(st, lip, MAT.mach2, 'mantle_shell_lip_' + i + (s2 > 0 ? 'R' : 'L'), 0, 0, 0.09);
      lm.rotation.z = (s2 > 0 ? -58 : 122) * Math.PI / 180;
    }
  }
  // crown ridge plates (what the camera sees), lapping forward over rear
  [1, 3, 5, 7].forEach((i, k) => {
    const { st, r } = stations[i];
    const g = plateGeo(r * 0.78, 0.20 - k * 0.015, 0.06, 0.045, k % 2 === 0, true);
    const m = mk(st, g, k % 2 ? MAT.shell2 : MAT.shell,
      'mantle_crown_plate_' + k, 0, r * 1.10 + 0.02, 0.02);
    m.rotation.x = -0.10 + k * 0.03;
    shellsBloom.push({ m, p0: m.position.clone(), dir: new THREE.Vector3(0, 1, 0) });
    const rib = mk(st, cylZ(0.020, 0.024, 0.30, 6), MAT.mach2, 'mantle_crown_rib_' + k, 0, r * 1.16 + 0.03, 0.02);
    rib.rotation.x = -0.10 + k * 0.03;
    boltRing(st, r * 0.60, 4, 0, MAT.mach2, 'mantle_crown_bolt_' + k);
  });
  // accent modules, rear top
  {
    const { st, r } = stations[8];
    const a1 = mk(st, plateGeo(0.14, 0.12, 0.04, 0.035, false, true), MAT.accent, 'mantle_accent_plate_A', 0, r * 1.12, 0);
    a1.rotation.x = -0.18;
    const a2 = mk(st, plateGeo(0.07, 0.06, 0.02, 0.03, false, true), MAT.accent, 'mantle_accent_plate_B', 0.16, r * 0.95, -0.04);
    a2.rotation.set(-0.1, 0, -0.5);
    mk(st, cylZ(0.030, 0.030, 0.012, 12), MAT.glow, 'mantle_status_port_A', -0.14, r * 0.92, 0.06);
    mk(st, cylZ(0.024, 0.024, 0.012, 12), MAT.glow, 'mantle_status_port_B', -0.14, r * 0.92, -0.02);
  }
  // rams alongside the mantle
  for (let s2 = -1; s2 <= 1; s2 += 2) {
    for (let k = 0; k < 2; k++) {
      const z0 = -0.28 - k * 0.52, len = 0.34;
      const x = s2 * (0.30 + k * 0.02), y = 0.02 + k * 0.06;
      const b = mk(mantle, cylZ(0.045, 0.052, len, 10), MAT.mach2,
        'mantle_ram_barrel_' + (s2 > 0 ? 'R' : 'L') + k, x, y, z0);
      mk(mantle, cylZ(0.020, 0.020, 0.22, 8), MAT.mach,
        'mantle_ram_rod_' + (s2 > 0 ? 'R' : 'L') + k, x, y, z0 + len * 0.5 + 0.09);
      mk(mantle, cylZ(0.030, 0.034, 0.05, 8), MAT.rubber,
        'mantle_ram_boot_' + (s2 > 0 ? 'R' : 'L') + k, x, y, z0 + len * 0.5 + 0.02);
      mk(mantle, cylX(0.024, 0.024, 0.07, 8), MAT.dark,
        'mantle_ram_clevis_' + (s2 > 0 ? 'R' : 'L') + k, x, y, z0 + len * 0.5 + 0.20);
    }
  }
  // chain runs down the mantle seams
  for (let s2 = -1; s2 <= 1; s2 += 2) {
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8, p = mc.getPoint(t), r = rAt(t);
      pts.push(new THREE.Vector3(p.x + s2 * r * 0.80, p.y + r * 0.62, p.z));
    }
    chainRun(mantle, pts, MAT.mach2, 'mantle_chain_' + (s2 > 0 ? 'R' : 'L'), 1.0);
  }
  // mantle hoses (each landing in ports at both ends, all inside the mantle's own space)
  for (let s2 = -1; s2 <= 1; s2 += 2) {
    tubeRun(mantle, [[s2 * 0.28, 0.06, 0.02], [s2 * 0.40, 0.16, -0.34], [s2 * 0.36, 0.22, -0.76],
      [s2 * 0.26, 0.16, -1.10]], 0.028, MAT.cable, 'mantle_hose_trunk_' + (s2 > 0 ? 'R' : 'L'));
    tubeRun(mantle, [[s2 * 0.22, -0.04, 0.02], [s2 * 0.34, -0.02, -0.40], [s2 * 0.30, 0.04, -0.90]],
      0.011, MAT.cable, 'mantle_wire_' + (s2 > 0 ? 'R' : 'L'));
    const pa = mk(mantle, portG, MAT.mach2, 'mantle_port_fwd_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.27, 0.05, 0.04);
    pa.rotation.y = s2 * 1.2;
    const pb = mk(mantle, portG, MAT.mach2, 'mantle_port_aft_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.25, 0.16, -1.12);
    pb.rotation.y = s2 * 1.0;
    mk(mantle, cylZ(0.036, 0.036, 0.022, 8), MAT.rubber, 'mantle_hose_clamp_a_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.39, 0.17, -0.40);
    mk(mantle, cylZ(0.032, 0.032, 0.020, 8), MAT.rubber, 'mantle_hose_clamp_b_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.33, 0.20, -0.80);
  }
  mk(mantle, latheZ([[0.16, 0], [0.20, 0.03], [0.20, 0.09], [0.14, 0.12]], 12), MAT.mach2, 'mantle_neck_collar', 0, 0.02, 0.06);

  // ───────────────────────────── neck + head (leading end, densest section)
  const neck = new THREE.Object3D(); neck.name = 'neck'; neck.position.set(0, 0.10, 0.06); core.add(neck);
  for (let k = 0; k < 3; k++)
    mk(neck, cylZ(0.16 - k * 0.008, 0.17 - k * 0.008, 0.06, 8), k === 1 ? MAT.dark : MAT.mach,
      'neck_block_' + k, 0, k * 0.008, 0.02 + k * 0.062);
  for (let s2 = -1; s2 <= 1; s2 += 2) {
    mk(neck, cylZ(0.024, 0.028, 0.16, 8), MAT.mach2, 'neck_ram_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.15, -0.04, 0.10);
    mk(neck, cylZ(0.014, 0.014, 0.09, 6), MAT.mach, 'neck_rod_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.15, -0.04, 0.22);
  }
  const head = new THREE.Object3D(); head.name = 'head'; head.position.set(0, 0.05, 0.17); neck.add(head);

  const hcore = mk(head, cylZ(0.25, 0.30, 0.40, 6), MAT.mach, 'head_core_block', 0, 0, 0.02);
  hcore.rotation.z = Math.PI / 6;
  mk(head, cylZ(0.20, 0.24, 0.14, 8), MAT.mach2, 'head_underhousing', 0, -0.15, 0.06);
  mk(head, new THREE.TorusGeometry(0.27, 0.026, 7, 20), MAT.mach2, 'head_nape_ring', 0, 0, -0.17);
  mk(head, latheZ([[0.16, 0], [0.21, 0.02], [0.21, 0.07], [0.15, 0.09]], 12), MAT.dark, 'head_nape_collar', 0, 0, -0.24);
  const hw = mk(head, plateGeo(0.25, 0.21, 0.08, 0.05, true, true), MAT.shell, 'head_crown_plate', 0, 0.155, 0.03);
  hw.rotation.x = -0.13;
  const hw2 = mk(head, plateGeo(0.17, 0.12, 0.05, 0.04, false, true), MAT.shell2, 'head_crown_plate_fwd', 0, 0.135, 0.24);
  hw2.rotation.x = 0.42;
  const hf = mk(head, plateGeo(0.18, 0.13, 0.06, 0.045, false, false), MAT.shell, 'head_front_plate', 0, 0.00, 0.28);
  hf.rotation.x = 0.32;
  for (let s2 = -1; s2 <= 1; s2 += 2) {
    const ch = mk(head, plateGeo(0.12, 0.19, 0.05, 0.04, false, false), MAT.shell2,
      'head_cheek_plate_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.265, -0.05, 0.06);
    ch.rotation.set(0.05, s2 * 1.25, 0);
    const br = new THREE.SphereGeometry(0.20, 20, 10, s2 > 0 ? -0.4 : Math.PI - 0.4, 1.5, 0.0, 1.25);
    const bm = mk(head, br, s2 > 0 ? MAT.shellO : MAT.shellO2, 'head_brow_' + (s2 > 0 ? 'R' : 'L'),
      s2 * 0.20, 0.09, 0.05);
    bm.scale.set(1.0, 0.72, 1.15);
    // eye assembly
    const eye = new THREE.Object3D(); eye.name = 'eye_' + (s2 > 0 ? 'R' : 'L');
    eye.position.set(s2 * 0.30, 0.04, 0.10); eye.rotation.y = s2 * 0.62; head.add(eye);
    mk(eye, latheZ([[0.055, 0], [0.135, 0.0], [0.150, 0.022], [0.150, 0.055], [0.122, 0.075], [0.115, 0.038]], 20),
      MAT.mach2, eye.name + '_bezel_outer');
    mk(eye, cylZ(0.108, 0.120, 0.045, 20), MAT.dark, eye.name + '_bezel_inner', 0, 0, 0.012);
    mk(eye, new THREE.TorusGeometry(0.128, 0.014, 6, 20), MAT.mach, eye.name + '_gimbal_ring', 0, 0, 0.045);
    const lens = mk(eye, new THREE.SphereGeometry(0.098, 22, 14), MAT.lens, eye.name + '_lens', 0, 0, 0.005);
    lens.scale.set(1, 0.94, 0.72);
    const pup = mk(eye, plateGeo(0.072, 0.011, 0.004, 0.012, false, false), MAT.rubber, eye.name + '_pupil_slit', 0, 0.002, 0.062);
    const hood = cylZ(0.150, 0.162, 0.10, 18, true, 128 * Math.PI / 180, 100 * Math.PI / 180);
    mk(eye, hood, MAT.shellO, eye.name + '_hood', 0, 0, 0.02);
    const lid = mk(eye, plateGeo(0.11, 0.045, 0.03, 0.025, false, false), MAT.shell2, eye.name + '_lid_lower', 0, -0.115, 0.03);
    lid.rotation.x = 0.5;
    mk(eye, latheZ([[0.010, 0], [0.028, 0], [0.030, 0.030], [0.014, 0.040]], 8), MAT.mach2, eye.name + '_pod', s2 * 0.14, -0.09, 0.02);
    mk(eye, cylZ(0.016, 0.016, 0.05, 6), MAT.dark, eye.name + '_pod_stem', s2 * 0.14, -0.09, -0.02);
    boltRing(eye, 0.142, 8, 0.03, MAT.mach2, eye.name + '_bolt');
    tubeRun(eye, [[0, -0.14, -0.02], [s2 * 0.06, -0.17, -0.10], [s2 * 0.03, -0.12, -0.18]], 0.012, MAT.cable, eye.name + '_wire');
    mk(eye, cylZ(0.022, 0.022, 0.016, 8), MAT.rubber, eye.name + '_wire_boot', 0, -0.14, -0.02);
  }
  // top vent slats + antennae + markings
  for (let k = 0; k < 4; k++) {
    const v = mk(head, plateGeo(0.085, 0.014, 0.006, 0.012, false, true), MAT.mach2, 'head_vent_slat_' + k, 0, 0.185, -0.06 + k * 0.035);
    v.rotation.x = -0.13;
  }
  for (let s2 = -1; s2 <= 1; s2 += 2) {
    const st = mk(head, cylY(0.010, 0.014, 0.11, 6), MAT.mach, 'head_antenna_stem_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.13, 0.20, -0.10);
    st.rotation.set(-0.25, 0, s2 * 0.22);
    mk(head, latheY([[0.006, 0], [0.020, 0.006], [0.020, 0.026], [0.008, 0.034]], 8), MAT.mach2,
      'head_antenna_tip_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.155, 0.255, -0.13);
  }
  mk(head, plateGeo(0.05, 0.045, 0.02, 0.02, false, true), MAT.dark, 'head_marking_triangle', -0.13, 0.192, 0.06);
  mk(head, cylZ(0.05, 0.055, 0.05, 6), MAT.mach2, 'head_junction_box', 0.15, 0.13, -0.13);
  mk(head, plateGeo(0.045, 0.035, 0.015, 0.02, false, false), MAT.mach2, 'head_blank_plate', -0.17, 0.06, 0.20);
  boltRing(head, 0.235, 10, -0.15, MAT.mach2, 'head_nape_bolt');
  // siphon (asymmetric bolt-on module) — hoses split at the head/mantle seam
  const siphon = new THREE.Object3D(); siphon.name = 'siphon';
  siphon.position.set(-0.24, -0.06, -0.06); siphon.rotation.set(0.55, -0.85, 0); head.add(siphon);
  mk(siphon, latheZ([[0.040, 0], [0.070, 0.02], [0.062, 0.10], [0.040, 0.17], [0.028, 0.19]], 14), MAT.mach, 'siphon_nozzle');
  mk(siphon, new THREE.TorusGeometry(0.070, 0.016, 6, 16), MAT.mach2, 'siphon_collar', 0, 0, 0.03);
  mk(siphon, cylZ(0.085, 0.090, 0.026, 12), MAT.dark, 'siphon_flange', 0, 0, -0.01);
  boltRing(siphon, 0.072, 5, -0.02, MAT.mach2, 'siphon_bolt');
  mk(siphon, cylZ(0.045, 0.05, 0.06, 6), MAT.mach2, 'siphon_valve_block', 0.03, -0.07, -0.03);
  mk(siphon, latheZ([[0.010, 0], [0.028, 0], [0.030, 0.026], [0.014, 0.034]], 8), MAT.mach2, 'siphon_gland', 0, 0, 0.17);
  tubeRun(head, [[-0.22, -0.12, -0.08], [-0.24, -0.14, -0.16], [-0.19, -0.10, -0.24]], 0.020, MAT.cable, 'head_siphon_hose');
  mk(head, cylZ(0.030, 0.030, 0.022, 8), MAT.rubber, 'head_siphon_hose_boot', -0.19, -0.10, -0.24);
  tubeRun(mantle, [[-0.19, 0.03, 0.02], [-0.22, 0.01, -0.06], [-0.24, 0.05, -0.16]], 0.020, MAT.cable, 'mantle_siphon_hose');
  mk(mantle, cylZ(0.032, 0.032, 0.024, 8), MAT.rubber, 'mantle_siphon_hose_boot', -0.19, 0.03, 0.03);
  // beak
  const beak = new THREE.Object3D(); beak.name = 'beak'; beak.position.set(0, -0.16, 0.20); head.add(beak);
  mk(beak, latheZ([[0.055, 0], [0.095, 0.01], [0.095, 0.07], [0.060, 0.09]], 12), MAT.mach2, 'beak_housing', 0, 0, -0.03);
  mk(beak, new THREE.TorusGeometry(0.085, 0.014, 6, 16), MAT.dark, 'beak_race', 0, 0, 0.03);
  const jawUp = new THREE.Object3D(); jawUp.name = 'mandible_upper'; beak.add(jawUp);
  const juA = mk(jawUp, latheZ([[0.010, 0], [0.055, 0.0], [0.040, 0.07], [0.006, 0.115]], 8), MAT.mach, 'mandible_upper_body', 0, 0.015, 0.03);
  juA.rotation.x = -0.25;
  mk(jawUp, plateGeo(0.030, 0.055, 0.012, 0.014, false, false), MAT.shell2, 'mandible_upper_plate', 0, 0.045, 0.06);
  const jawLow = new THREE.Object3D(); jawLow.name = 'mandible_lower'; beak.add(jawLow);
  const jlA = mk(jawLow, latheZ([[0.010, 0], [0.052, 0.0], [0.038, 0.065], [0.006, 0.105]], 8), MAT.mach, 'mandible_lower_body', 0, -0.015, 0.03);
  jlA.rotation.x = 0.30;
  mk(jawLow, plateGeo(0.028, 0.05, 0.012, 0.014, false, false), MAT.shell2, 'mandible_lower_plate', 0, -0.05, 0.05);
  for (let s2 = -1; s2 <= 1; s2 += 2) {
    mk(beak, cylX(0.014, 0.014, 0.05, 8), MAT.dark, 'beak_hinge_pin_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.07, 0, 0.02);
    mk(beak, cylZ(0.020, 0.024, 0.09, 8), MAT.mach2, 'beak_ram_barrel_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.085, -0.03, -0.05);
    mk(beak, cylZ(0.010, 0.010, 0.06, 6), MAT.mach, 'beak_ram_rod_' + (s2 > 0 ? 'R' : 'L'), s2 * 0.085, -0.03, 0.02);
  }
  for (let k = 0; k < 3; k++)
    mk(beak, plateGeo(0.030 - k * 0.005, 0.010, 0.004, 0.008, false, true), MAT.mach2, 'radula_rib_' + k, 0, -0.005, 0.00 + k * 0.022);

  // ───────────────────────────── arms (eight, radiating from the crown)
  const armSpec = [
    { yaw: 12, x: 0.09, y: 0.15, z: 0.20, len: 1.00 },
    { yaw: 38, x: 0.19, y: 0.06, z: 0.18, len: 0.98 },
    { yaw: 68, x: 0.25, y: -0.05, z: 0.13, len: 0.95 },
    { yaw: 104, x: 0.22, y: -0.14, z: 0.06, len: 0.90 }
  ];
  const pitchDelta = [18, 16, 12, -8, -24, -12, -6, -4];
  const segLen = [0.29, 0.28, 0.27, 0.25, 0.23, 0.20, 0.16, 0.12];
  const segR = [0.155, 0.142, 0.128, 0.112, 0.094, 0.075, 0.055, 0.036];
  const arms = [];
  for (const side of [1, -1]) {
    for (let k = 0; k < 4; k++) {
      const sp = armSpec[k], sn = side > 0 ? 'R' : 'L';
      const base = new THREE.Object3D(); base.name = `arm_${sn}${k}_base`;
      base.position.set(side * sp.x, sp.y, sp.z);
      base.rotation.set(0, side * sp.yaw * Math.PI / 180, 0);
      core.add(base);
      // crown mount hardware (stays with the body)
      mk(core, new THREE.TorusGeometry(0.075, 0.020, 6, 14), MAT.mach2, `arm_${sn}${k}_socket_race`,
        side * sp.x, sp.y, sp.z).rotation.set(0, side * sp.yaw * Math.PI / 180, 0);
      const cov = mk(core, cylZ(0.058, 0.064, 0.03, 10), MAT.dark, `arm_${sn}${k}_socket_cover`,
        side * sp.x * 0.94, sp.y, sp.z - 0.02); cov.rotation.y = side * sp.yaw * Math.PI / 180;
      const stub = tubeRun(core, [[side * sp.x * 0.6, sp.y + 0.08, sp.z - 0.10],
        [side * sp.x * 0.85, sp.y + 0.03, sp.z - 0.02], [side * sp.x, sp.y + 0.02, sp.z + 0.02]],
        0.014, MAT.cable, `arm_${sn}${k}_feed_stub`);
      mk(core, portG, MAT.mach2, `arm_${sn}${k}_feed_port`, side * sp.x * 0.6, sp.y + 0.08, sp.z - 0.11);

      const joints = [], rest = [];
      let parent = base;
      const L = sp.len;
      const drop = (sp.y + 0.60 - 0.10) / 0.65;
      for (let j = 0; j < 8; j++) {
        const jt = new THREE.Object3D(); jt.name = `arm_${sn}${k}_joint_${j}`;
        jt.position.set(0, 0, j === 0 ? 0.05 : segLen[j - 1] * L);
        const rx = pitchDelta[j] * Math.PI / 180 * (j < 4 ? drop : 1.0);
        const ry = side * (1 + k * 0.5) * 1.4 * Math.PI / 180;
        jt.rotation.set(rx, ry, 0);
        rest.push({ x: rx, y: ry, z: 0 });
        parent.add(jt); joints.push(jt); parent = jt;

        const r0 = segR[j] * (0.94 + 0.06 * L), r1 = (j < 7 ? segR[j + 1] : 0.018) * (0.94 + 0.06 * L);
        const sl = segLen[j] * L;
        mk(jt, cylZ(r1 * 0.94, r0 * 0.96, sl * 0.80, 8), MAT.mach, `arm_${sn}${k}_seg_${j}_core`, 0, 0, sl * 0.45);
        if (j < 6) {
          mk(jt, cylX(r0 * 0.78, r0 * 0.78, 0.028, 12), MAT.mach2, `arm_${sn}${k}_seg_${j}_disc_R`, r0 * 0.72, 0, 0);
          mk(jt, cylX(r0 * 0.78, r0 * 0.78, 0.028, 12), MAT.mach2, `arm_${sn}${k}_seg_${j}_disc_L`, -r0 * 0.72, 0, 0);
          mk(jt, cylX(r0 * 0.22, r0 * 0.22, r0 * 1.6, 8), MAT.dark, `arm_${sn}${k}_seg_${j}_pin`, 0, 0, 0);
        }
        if (j < 5) {
          const g = cylZ(r1 * 1.20, r0 * 1.24, sl * 0.86, 18, true, 122 * Math.PI / 180, 118 * Math.PI / 180);
          mk(jt, g, j % 2 ? MAT.shellO2 : MAT.shellO, `arm_${sn}${k}_seg_${j}_shell`, 0, 0, sl * 0.46);
          if (j === 0 || j === 2) {
            const lp = mk(jt, new THREE.TorusGeometry(r0 * 1.22, 0.011, 5, 14, 118 * Math.PI / 180),
              MAT.mach2, `arm_${sn}${k}_seg_${j}_shell_lip`, 0, 0, sl * 0.86);
            lp.rotation.z = 31 * Math.PI / 180;
          }
        }
        if (j < 5) {
          for (let a = -1; a <= 1; a += 2) {
            const sc = 0.6 + 0.6 * (1 - j / 5);
            const su = mk(jt, suckG, MAT.mach2, `arm_${sn}${k}_seg_${j}_sucker_${a > 0 ? 'R' : 'L'}`,
              a * r0 * 0.34, -r0 * 0.84, sl * 0.50);
            su.rotation.x = Math.PI; su.scale.setScalar(sc);
          }
        }
        if (j === 0 || j === 2) boltRing(jt, r0 * 0.82, 4, sl * 0.80, MAT.mach2, `arm_${sn}${k}_seg_${j}_bolt`);
        if (j === 0) {
          const pts = [];
          for (let q = 0; q <= 4; q++)
            pts.push(new THREE.Vector3(side * r0 * 0.55, r0 * 0.52 - q * 0.004, 0.05 + q * 0.05));
          chainRun(jt, pts, MAT.mach2, `arm_${sn}${k}_chain`, 0.85);
          tubeRun(jt, [[0, r0 * 0.72, 0.02], [0, r0 * 0.95, sl * 0.5], [0, r0 * 0.60, sl * 0.94]],
            0.014, MAT.cable, `arm_${sn}${k}_hose`);
          mk(jt, cylZ(0.022, 0.022, 0.018, 8), MAT.rubber, `arm_${sn}${k}_hose_boot`, 0, r0 * 0.72, 0.02);
          mk(jt, cylZ(0.020, 0.020, 0.016, 8), MAT.rubber, `arm_${sn}${k}_hose_clamp`, 0, r0 * 0.60, sl * 0.94);
          const web = new THREE.SphereGeometry(0.16, 12, 8, 0, 1.1, 1.1, 0.9);
          const wm = mk(jt, web, MAT.machO, `arm_${sn}${k}_web_plate`, 0, 0, sl * 0.35);
          wm.scale.set(0.5, 0.7, 0.9); wm.rotation.set(0, -side * 1.2, 0);
        }
        if (j === 7) {
          mk(jt, latheZ([[0.006, 0], [0.020, 0.0], [0.014, 0.05], [0.004, 0.075]], 8), MAT.mach2,
            `arm_${sn}${k}_tip_cap`, 0, 0, sl * 0.75);
          const hk = mk(jt, latheZ([[0.004, 0], [0.012, 0.01], [0.006, 0.045]], 6), MAT.dark,
            `arm_${sn}${k}_tip_hook`, 0, -0.010, sl * 0.95);
          hk.rotation.x = 0.7;
        }
      }
      arms.push({ base, joints, rest, side, k, phase: ((k * 2 + (side > 0 ? 0 : 1)) % 4) / 4 + (k % 2) * 0.125 });
    }
  }

  root.add(new THREE.Object3D()).name = 'anchor';

  // ───────────────────────────── pose
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (ph, a, b) => clamp01((ph - a) / (b - a));
  const REST = { y: core.position.y, z: core.position.z };

  function poseArm(a, o) {
    const N = a.joints.length;
    for (let j = 0; j < N; j++) {
      const u = j / (N - 1), r = a.rest[j];
      let rx = r.x * (1 - 0.80 * o.extend);
      rx -= o.curl * (0.10 + 0.55 * u);
      rx -= o.lift * (0.55 * (1 - 0.55 * u));
      rx += o.wave * Math.sin(o.wavePh - j * 0.85) * (0.25 + 0.9 * u);
      let ry = r.y + (j === 0 ? a.side * o.sweep : a.side * o.sweep * 0.16 * (1 - u));
      ry += a.side * o.spread * (j < 3 ? 1 : 0.4) * (1 - 0.4 * u);
      a.joints[j].rotation.set(rx, ry, r.z);
    }
  }

  root.userData.pose = (s) => {
    const t = s.t || 0, spd = Math.max(0, s.speed || 0), stride = s.stride || 0, turn = s.turn || 0;
    const hp = (s.health === undefined ? 1 : s.health), hurt = clamp01(1 - hp);
    const spd01 = clamp01(spd / 6), jet = sstep(2.2, 6, spd);
    const creep = sstep(0.05, 0.5, spd) * (1 - sstep(0.7, 1.6, spd));
    const act = s.action || null, ph = clamp01(s.phase || 0);

    let coreX = 0, coreY = REST.y, coreZ = REST.z;
    let cP = -0.02 + 0.05 * spd01, cR = 0, cY = 0;
    let mP = 0, mY = 0, mR = 0, mSX = 1, mSY = 1, mSZ = 1;
    let nP = 0.02, hP = 0, hY = 0, hR = 0, jaw = 0.05, sipP = 0, bloom = 0;

    const br = Math.sin(t * 1.1);
    mSX += 0.020 * br; mSY += 0.026 * br; mSZ -= 0.012 * br; coreY += 0.012 * br;

    const A = arms.map(() => ({ sweep: 0, lift: 0, curl: 0, spread: 0, extend: 0, wave: 0, wavePh: 0 }));

    if (act) {
      if (act === 'attack') {
        const w1 = seg(ph, 0, 0.30), w2 = seg(ph, 0.28, 0.52), w3 = seg(ph, 0.52, 1);
        coreZ += -0.08 * w1 + 0.26 * w2 - 0.18 * w3;
        cP += 0.10 * w1 - 0.22 * w2 + 0.12 * w3;
        mP += -0.16 * w1 + 0.25 * w2 - 0.09 * w3;
        hP += 0.15 * w1 - 0.35 * w2 + 0.20 * w3;
        jaw = 0.10 + 0.90 * w2 - 0.65 * w3;
        arms.forEach((a, i) => {
          const o = A[i];
          if (a.k <= 1) {
            o.curl = 1.05 * w1 - 1.25 * w2 + 0.22 * w3;
            o.lift = 0.55 * w1 - 0.45 * w2 - 0.10 * w3;
            o.sweep = 0.25 * w1 - 0.70 * w2 + 0.45 * w3;
            o.extend = -0.10 * w1 + 0.90 * w2 - 0.80 * w3;
          } else {
            o.extend = 0.25 * w2 - 0.2 * w3; o.sweep = 0.18 * w2 - 0.12 * w3; o.spread = 0.12 * w2;
          }
          o.wave = 0.03; o.wavePh = t * 3 + i;
        });
      } else if (act === 'fire') {
        const aim = seg(ph, 0, 0.30), rel = seg(ph, 0.30, 0.46), rec = seg(ph, 0.46, 1);
        mSX += 0.10 * aim - 0.30 * rel + 0.20 * rec;
        mSY += 0.11 * aim - 0.32 * rel + 0.21 * rec;
        mSZ += -0.05 * aim + 0.13 * rel - 0.08 * rec;
        coreZ += 0.04 * aim - 0.17 * rel + 0.13 * rec;
        cP += -0.05 * aim + 0.11 * rel - 0.06 * rec;
        mP += 0.05 * aim - 0.12 * rel + 0.07 * rec;
        sipP = -0.35 * aim + 0.20 * rel - 0.05 * rec;
        hP += 0.03 * aim;
        arms.forEach((a, i) => {
          const o = A[i];
          o.extend = 0.30 * aim + 0.15 * rel - 0.25 * rec;
          o.sweep = 0.10 * aim + 0.22 * rel - 0.30 * rec;
          o.curl = -0.06 * aim; o.spread = 0.06 * aim;
          o.wave = 0.02; o.wavePh = t * 2 + i;
        });
      } else if (act === 'hit') {
        const imp = Math.sin(Math.PI * Math.min(1, ph / 0.3)) * Math.exp(-2.6 * ph);
        coreZ -= 0.17 * imp; coreY += 0.05 * imp; cR += 0.22 * imp; cP += 0.18 * imp;
        mR -= 0.26 * imp; mP += 0.20 * imp; hP += 0.32 * imp; jaw += 0.5 * imp;
        arms.forEach((a, i) => {
          const o = A[i];
          o.lift = 0.36 * imp; o.spread = 0.32 * imp; o.curl = 0.40 * imp;
          o.wave = 0.10 * imp; o.wavePh = t * 12 + i;
        });
      } else if (act === 'block') {
        const w = sstep(0, 0.22, ph) * (1 - sstep(0.76, 1, ph));
        coreY -= 0.14 * w; coreZ -= 0.10 * w; cP += 0.06 * w;
        mP += 0.10 * w; hP += 0.30 * w; nP += 0.15 * w; jaw = 0.02;
        arms.forEach((a, i) => {
          const o = A[i];
          if (a.k <= 1) { o.curl = 1.10 * w; o.lift = 0.85 * w; o.sweep = -0.35 * w; o.spread = -0.25 * w; }
          else if (a.k === 2) { o.curl = 0.50 * w; o.lift = 0.40 * w; }
          else { o.spread = 0.30 * w; o.extend = 0.35 * w; }
        });
      } else if (act === 'gather' || act === 'deposit') {
        const q = act === 'gather' ? ph : 1 - ph;
        const d = seg(q, 0, 0.40), c = seg(q, 0.40, 0.62), u = seg(q, 0.62, 1);
        coreY += -0.17 * d + 0.17 * u; cP += 0.22 * d - 0.22 * u;
        hP += 0.36 * d - 0.30 * u; nP += 0.10 * d - 0.08 * u;
        jaw = 0.10 + 0.35 * c - 0.25 * u;
        arms.forEach((a, i) => {
          const o = A[i];
          if (a.k <= 1) {
            o.extend = 0.50 * d - 0.25 * u; o.lift = -0.38 * d + 0.48 * u; o.curl = 0.90 * c;
            o.sweep = -0.20 * d + 0.10 * u;
          } else { o.extend = 0.15 * d; o.spread = 0.12 * d; }
          o.wave = 0.02; o.wavePh = t * 2 + i;
        });
      } else if (act === 'eat') {
        const dwn = sstep(0, 0.20, ph) * (1 - sstep(0.85, 1, ph));
        const chew = Math.sin(ph * Math.PI * 6);
        coreY -= 0.12 * dwn; cP += 0.20 * dwn; mP += 0.06 * dwn;
        hP += 0.42 * dwn; nP += 0.10 * dwn;
        jaw = 0.08 + (0.45 + 0.45 * chew) * dwn;
        arms.forEach((a, i) => {
          const o = A[i];
          if (a.k <= 1) { o.curl = (0.70 + 0.15 * chew) * dwn; o.lift = 0.18 * dwn; o.sweep = -0.15 * dwn; }
          else { o.extend = 0.12 * dwn; }
          o.wave = 0.03 * dwn; o.wavePh = t * 4 + i;
        });
      } else if (act === 'drink') {
        const dwn = sstep(0, 0.25, ph) * (1 - sstep(0.80, 1, ph));
        coreY -= 0.17 * dwn; cP += 0.27 * dwn; hP += 0.50 * dwn; nP += 0.08 * dwn;
        jaw = 0.06 + 0.12 * dwn + 0.02 * Math.sin(t * 5) * dwn;
        arms.forEach((a, i) => {
          const o = A[i]; o.extend = 0.20 * dwn; o.spread = 0.12 * dwn;
          o.wave = 0.012; o.wavePh = t * 1.2 + i;
        });
      } else if (act === 'jump') {
        const cr = seg(ph, 0, 0.35), ex = seg(ph, 0.35, 0.72), hd = seg(ph, 0.72, 1);
        coreY += -0.21 * cr + 0.44 * ex + 0.04 * hd;
        cP += 0.10 * cr - 0.22 * ex; mP += -0.10 * cr + 0.20 * ex; mSY += 0.06 * ex;
        jaw = 0.05 + 0.35 * ex; hP += 0.10 * cr - 0.20 * ex;
        arms.forEach((a, i) => {
          const o = A[i];
          o.curl = 0.85 * cr - 0.95 * ex; o.lift = 0.26 * cr - 0.48 * ex;
          o.extend = -0.20 * cr + 0.85 * ex; o.sweep = -0.15 * cr + 0.48 * ex;
        });
      } else if (act === 'land') {
        const rc = seg(ph, 0, 0.30), cm = seg(ph, 0.30, 0.56), rv = seg(ph, 0.56, 1);
        coreY += 0.15 * rc - 0.36 * cm + 0.21 * rv;
        cP += -0.08 * rc + 0.15 * cm - 0.07 * rv;
        mP += 0.10 * rc - 0.16 * cm + 0.06 * rv;
        jaw = 0.05 + 0.25 * cm - 0.2 * rv;
        arms.forEach((a, i) => {
          const o = A[i];
          o.extend = 0.60 * rc - 0.35 * cm - 0.2 * rv; o.lift = -0.32 * rc + 0.18 * cm;
          o.spread = 0.26 * rc + 0.14 * cm - 0.32 * rv; o.curl = -0.20 * rc + 0.55 * cm - 0.35 * rv;
        });
      } else if (act === 'signal') {
        const w = sstep(0, 0.28, ph) * (1 - sstep(0.72, 1, ph));
        coreY += 0.20 * w; cP -= 0.12 * w; mP += 0.16 * w; mSX += 0.10 * w; mSY += 0.13 * w;
        hP -= 0.25 * w; jaw = 0.05 + 0.75 * w + 0.05 * Math.sin(t * 9) * w; bloom = 0.28 * w;
        arms.forEach((a, i) => {
          const o = A[i];
          o.lift = 0.88 * w * (1 - 0.15 * a.k); o.spread = 0.55 * w; o.extend = 0.35 * w;
          o.curl = -0.25 * w + 0.15 * Math.sin(t * 6 + i) * w; o.sweep = -0.20 * w;
          o.wave = 0.05 * w; o.wavePh = t * 6 + i;
        });
      } else if (act === 'sleep' || act === 'wake') {
        const w = act === 'sleep' ? sstep(0, 0.85, ph) : 1 - sstep(0.12, 0.92, ph);
        const stir = act === 'wake' ? Math.sin(ph * Math.PI * 3) * (1 - ph) * 0.05 : 0;
        coreY = lerp(coreY, 0.30, w); cP += 0.05 * w + stir; cR += 0.03 * w + stir * 0.5;
        mP -= 0.12 * w; mSY -= 0.07 * w; mSX += 0.03 * w;
        hP += 0.35 * w; nP += 0.20 * w; jaw = 0.02;
        arms.forEach((a, i) => {
          const o = A[i];
          o.curl = 1.15 * w; o.lift = 0.15 * w; o.spread = -0.35 * w; o.sweep = 0.25 * w;
          o.wave = 0.012 * (1 - w) + Math.abs(stir) * 0.4; o.wavePh = t * 0.7 + i;
        });
      } else if (act === 'die') {
        const f = sstep(0, 0.55, ph), g2 = sstep(0.28, 1, ph);
        const tw = Math.exp(-7 * ph) * Math.sin(ph * 40);
        coreY = lerp(coreY, 0.20, f); cR += 0.55 * g2 + tw * 0.05; cP += 0.12 * f;
        mR += 0.40 * g2; mP -= 0.25 * f; mSY -= 0.18 * f; mSX -= 0.05 * f;
        hP += 0.50 * f; hR += 0.30 * g2; jaw = 0.05 + 0.30 * f;
        arms.forEach((a, i) => {
          const o = A[i];
          o.extend = 0.55 * f; o.lift = -0.26 * f; o.spread = 0.42 * f * (1 + 0.12 * a.k);
          o.curl = -0.15 * f + 0.22 * g2 * (a.k === 3 ? 1 : 0.3);
          o.wave = 0.10 * Math.abs(tw); o.wavePh = i;
        });
      } else if (act === 'evolve') {
        const brc = seg(ph, 0, 0.22);
        const B = sstep(0.22, 0.46, ph) * (1 - sstep(0.72, 0.95, ph));
        coreY += -0.10 * brc + 0.16 * B; cP += 0.08 * brc - 0.10 * B;
        mSX += 0.12 * B; mSY += 0.14 * B; mP += 0.10 * B; bloom = B;
        jaw = 0.05 + 0.50 * B; hP -= 0.18 * B;
        arms.forEach((a, i) => {
          const o = A[i];
          o.spread = 0.30 * B + 0.10 * brc; o.lift = 0.25 * B;
          o.extend = 0.30 * brc + 0.20 * B; o.curl = 0.20 * brc - 0.10 * B;
          o.wave = 0.05 * B; o.wavePh = t * 9 + i;
        });
      }
    } else if (spd > 0.03) {
      const duty = lerp(0.62, 0.45, spd01);
      const swA = 0.10 + 0.36 * spd01, extA = 0.15 * spd01 + 0.35 * jet;
      arms.forEach((a, i) => {
        const o = A[i];
        let p = (stride + a.phase) % 1; if (p < 0) p += 1;
        if (p < duty) {
          const u = p / duty;
          o.sweep = swA * (2 * u - 1);
          o.lift = -0.05 * Math.sin(Math.PI * u);
          o.curl = -0.06;
          o.extend = extA + 0.10 * u;
        } else {
          const u = (p - duty) / (1 - duty), sw = Math.sin(Math.PI * u);
          o.sweep = swA * (1 - 2 * u);
          o.lift = (0.34 + 0.50 * spd01) * sw;
          o.curl = (0.50 + 0.60 * spd01) * sw;
          o.extend = extA * (1 - 0.5 * sw);
        }
        o.wave = 0.035 + 0.06 * spd01; o.wavePh = stride * Math.PI * 3 + i;
        o.spread = -0.07 * creep + 0.14 * jet * (a.k >= 2 ? 1 : 0.35);
      });
      coreY += -0.07 * creep + 0.03 * spd01 - 0.05 * jet;
      coreY += (0.018 + 0.05 * spd01) * Math.sin(stride * Math.PI * 4);
      cP += 0.04 * creep + 0.10 * jet;
      cR += 0.03 * Math.sin(stride * Math.PI * 2);
      mP += 0.05 * creep - 0.20 * jet;
      mY += 0.05 * Math.sin(stride * Math.PI * 2);
      hP += -0.05 * creep + 0.14 * jet;
      hY += 0.06 * Math.sin(stride * Math.PI * 2 + 1);
      jaw = 0.05 + 0.06 * jet;
    } else {
      coreX += 0.02 * Math.sin(t * 0.31); cR += 0.020 * Math.sin(t * 0.31);
      hY += 0.18 * Math.sin(t * 0.27); hP += 0.05 * Math.sin(t * 0.40);
      nP += 0.02 * Math.sin(t * 0.5);
      arms.forEach((a, i) => {
        const o = A[i];
        o.wave = 0.045; o.wavePh = t * 0.7 + i * 0.9;
        o.curl = 0.03 * Math.sin(t * 0.5 + i);
        o.spread = 0.02 * Math.sin(t * 0.4 + i * 0.7);
      });
      A[0].lift += 0.24 + 0.10 * Math.sin(t * 0.9); A[0].curl += 0.36; A[0].sweep += -0.10;
      sipP = 0.05 * Math.sin(t * 0.6);
    }

    if (!act) {
      if (turn) {
        const ta = Math.abs(turn), sg = Math.sign(turn);
        cR += -turn * 0.15; hY += turn * 0.42; mY += turn * 0.20; mR += -turn * 0.10;
        arms.forEach((a, i) => {
          const o = A[i];
          if (sg === a.side) { o.curl += 0.28 * ta; o.sweep += 0.10 * ta; o.spread -= 0.10 * ta; }
          else { o.extend += 0.18 * ta; o.sweep -= 0.10 * ta; o.spread += 0.12 * ta; }
        });
      }
      if (s.grounded === false) {
        coreY += 0.06; cP -= 0.10; mP += 0.12; mSZ += 0.02;
        arms.forEach((a, i) => {
          const o = A[i];
          o.sweep = 0.24 + 0.05 * a.k; o.extend = 0.55; o.lift = -0.14;
          o.curl = 0.12 + 0.05 * Math.sin(t * 2.2 + i); o.spread = -0.12;
          o.wave = 0.07; o.wavePh = t * 2.4 + i * 0.7;
        });
      }
    }
    if (hurt > 0.001) {
      mR += 0.13 * hurt; cR += 0.08 * hurt; coreY -= 0.07 * hurt;
      hP += 0.18 * hurt; hR += 0.08 * hurt; nP += 0.10 * hurt; mSY -= 0.05 * hurt;
      jaw += 0.12 * hurt;
      arms.forEach((a, i) => {
        const o = A[i];
        if (a.side > 0 && a.k >= 2) { o.extend += 0.32 * hurt; o.lift -= 0.20 * hurt; o.wave *= (1 - 0.6 * hurt); }
        if (a.side > 0 && a.k === 3) { o.extend += 0.28 * hurt; o.lift -= 0.14 * hurt; o.curl -= 0.10 * hurt; }
      });
    }

    core.position.set(coreX, Math.max(0.16, coreY), coreZ);
    core.rotation.set(cP, cY, cR);
    mantle.rotation.set(mP, mY, mR);
    mantle.scale.set(mSX, mSY, mSZ);
    neck.rotation.set(nP, 0, 0);
    head.rotation.set(hP, hY, hR);
    siphon.rotation.set(0.55 + sipP, -0.85, 0);
    const jc = clamp01(jaw);
    jawUp.rotation.set(-0.05 - 0.28 * jc, 0, 0);
    jawLow.rotation.set(0.08 + 0.60 * jc, 0, 0);
    for (const sh of shellsBloom) {
      sh.m.position.copy(sh.p0).addScaledVector(sh.dir, 0.075 * bloom);
      sh.m.scale.setScalar(1 + 0.03 * bloom);
    }
    for (let i = 0; i < arms.length; i++) poseArm(arms[i], A[i]);
  };

  root.userData.update = (t, dt) => { };
  return root;
}