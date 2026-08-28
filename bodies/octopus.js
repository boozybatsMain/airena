function build(THREE, TSL) {

  // ── ONE QUALITY: BONELESS REACH AND GRIP ─────────────────────────────────
  // Eight long tapering arms, each a chain of machined segments getting thinner
  // and more finely jointed toward the tip, two rows of pressed suckers under
  // every one. All of the mass in one bag carried high and back.
  //
  // BRIEF
  //  - Crown of arms = a bearing race at y=0.70 with eight yokes. Arms splay,
  //    drop to the floor, tips out at ~1.7 radius, front pair reaching, rear
  //    pair trailing under the bag. No arm is straight.
  //  - The mantle is the widest, deepest mass (0.92 across): seven ring frames
  //    on a spine curve leaning up and back, a dark packed drum between them,
  //    tie rods, two chain runs over sprockets, two gear stacks, two rams —
  //    then nine pressed shells clamped over that stack on their own hinges.
  //  - The head is ONE rigid volume a crown wide on a short visible collar:
  //    faceted top, cheeks, front wedge, under plate, dark core. Two eye
  //    turrets bulge out and up — dark glass recessed in stepped bezels, slot
  //    pupil, hood, two lids, a ram each. Beak of two hooked plates on a
  //    ram-driven hinge, papillae round the mouth, funnel bolted on the right.
  //  - Harness is its own pass and rides OUTSIDE the armour: a trunk hose on
  //    every arm standing clear on clamps, dorsal trunks and flank runs over
  //    the mantle shells, two proud loops, belly runs, two rings round the
  //    crown collar. Every run lands in a port at both ends.

  const PI = Math.PI, TAU = PI * 2;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  const root = new THREE.Group(); root.name = 'octopus';
  const body = new THREE.Group(); body.name = 'body'; root.add(body);

  // ─────────────────────────── MATERIALS ───────────────────────────────────
  const T = TSL || {};
  const hasTSL = !!(T.positionLocal && T.mix && T.smoothstep && T.vec3 && T.floor);
  const NodeMat = THREE.MeshStandardNodeMaterial || THREE.MeshStandardMaterial;
  const C = (h) => new THREE.Color(h);
  const P = hasTSL ? T.positionLocal : null;
  const NL = hasTSL ? T.normalLocal : null;

  function hash13(p) {
    return T.fract(T.sin(T.dot(p, T.vec3(127.1, 311.7, 74.7))).mul(43758.5453));
  }
  function vnoise(p) {
    const i = T.floor(p), f = T.fract(p);
    const u = f.mul(f).mul(T.float(3).sub(f.mul(2)));
    const c = (a, b, d) => hash13(i.add(T.vec3(a, b, d)));
    const x00 = T.mix(c(0, 0, 0), c(1, 0, 0), u.x);
    const x10 = T.mix(c(0, 1, 0), c(1, 1, 0), u.x);
    const x01 = T.mix(c(0, 0, 1), c(1, 0, 1), u.x);
    const x11 = T.mix(c(0, 1, 1), c(1, 1, 1), u.x);
    return T.mix(T.mix(x00, x10, u.y), T.mix(x01, x11, u.y), u.z);
  }
  function fbm(p) {
    return vnoise(p).mul(0.58).add(vnoise(p.mul(2.31)).mul(0.29)).add(vnoise(p.mul(5.7)).mul(0.13));
  }

  const RUST = C(0x7a4526), BARE = C(0x6b665e), DIRT = C(0x2a2723);

  function mkMat(hex, metal, rough, w, off) {
    const m = new NodeMat({ color: C(hex), metalness: metal, roughness: rough });
    if (hasTSL && w) {
      const o = T.vec3(off || 0, (off || 0) * 0.61, (off || 0) * 1.37);
      const base = C(hex);
      const q = P.add(o);
      const grit = fbm(q.mul(34.0));
      const soft = fbm(q.mul(9.0));
      // plate rim / bevel band: extruded plates face along their own +Z
      const edge = T.smoothstep(0.18, 0.92, T.oneMinus(T.abs(NL.z)));
      const rim = T.clamp(edge.mul(0.8).add(grit.mul(0.6)).sub(0.42), 0, 1);
      const chip = T.smoothstep(0.06, 0.42, rim).mul(w.chip);
      // rust bleeding downward, stretched in Y, emanating from edges
      const streak = fbm(T.vec3(q.x.mul(28.0), q.y.mul(2.6), q.z.mul(28.0)));
      const down = T.smoothstep(0.85, -0.4, NL.y);
      const rust = T.smoothstep(0.5, 0.86, streak).mul(down).mul(T.mix(0.18, 1.0, edge)).mul(w.rust);
      const grime = T.smoothstep(0.1, -0.9, NL.y).mul(soft.mul(0.6).add(0.4)).mul(w.grime);
      const dust = T.clamp(NL.y, 0, 1).mul(soft).mul(w.dust);
      let col = T.vec3(base.r, base.g, base.b);
      col = T.mix(col, T.vec3(RUST.r, RUST.g, RUST.b), rust.mul(0.8));
      col = T.mix(col, T.vec3(BARE.r, BARE.g, BARE.b), chip);
      col = T.mix(col, T.vec3(DIRT.r, DIRT.g, DIRT.b), grime.mul(0.65));
      col = col.mul(T.float(1).add(dust.mul(0.16)));
      m.colorNode = col;
      m.roughnessNode = T.clamp(T.float(rough).add(dust.mul(0.2)).add(grime.mul(0.12)).sub(chip.mul(0.1)), 0.3, 0.98);
    }
    return m;
  }

  const W_SHELL = { chip: 0.55, rust: 0.75, grime: 0.5, dust: 0.55 };
  const W_MACH = { chip: 0.3, rust: 0.5, grime: 0.7, dust: 0.4 };

  const M = {
    shell: mkMat(0xd8d2c6, 0.14, 0.58, W_SHELL, 0),
    shellB: mkMat(0xc9c2b4, 0.14, 0.6, W_SHELL, 5.3),
    shellC: mkMat(0xb5ac9c, 0.16, 0.62, W_SHELL, 11.7),
    mach: mkMat(0x55524c, 0.82, 0.55, W_MACH, 2.1),
    machL: mkMat(0x6b665e, 0.86, 0.46, W_MACH, 7.9),
    steel: mkMat(0x3e3a34, 0.85, 0.5, W_MACH, 13.3),
    bronze: mkMat(0x4a4238, 0.8, 0.58, W_MACH, 17.1),
    rubber: new NodeMat({ color: C(0x1e1d1b), metalness: 0.0, roughness: 0.92 }),
    lens: new NodeMat({ color: C(0x090a0c), metalness: 0.1, roughness: 0.08 }),
    accent: mkMat(0xc2521e, 0.08, 0.62, W_SHELL, 23.7)
  };
  const armShellMat = [], armMachMat = [];
  for (let i = 0; i < 8; i++) {
    armShellMat.push(mkMat(i % 3 === 0 ? 0xc9c2b4 : 0xd8d2c6, 0.14, 0.59, W_SHELL, 3.1 + i * 4.7));
    armMachMat.push(mkMat(i % 2 ? 0x55524c : 0x4a4238, 0.83, 0.54, W_MACH, 31.3 + i * 3.3));
  }
  const emAmber = new NodeMat({ color: C(0x2a2622), metalness: 0.3, roughness: 0.4 });
  emAmber.emissive = C(0xc2521e); emAmber.emissiveIntensity = 2.2;
  const emCyan = new NodeMat({ color: C(0x1e2224), metalness: 0.3, roughness: 0.4 });
  emCyan.emissive = C(0x2f7f8c); emCyan.emissiveIntensity = 2.0;

  // ─────────────────────── GEOMETRY HELPERS ────────────────────────────────
  function poly(pts, holes) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]);
    }
    s.closePath();
    if (holes) for (const h of holes) {
      const hp = new THREE.Path(); hp.moveTo(h[0][0], h[0][1]);
      for (let i = 1; i < h.length; i++) hp.lineTo(h[i][0], h[i][1]);
      hp.closePath(); s.holes.push(hp);
    }
    return s;
  }
  function rrectPts(w, h, cx, cy) {
    const x = w / 2, y = h / 2, r = Math.min(w, h) * 0.22;
    cx = cx || 0; cy = cy || 0;
    return [[cx - x + r, cy - y], [cx + x - r, cy - y], [cx + x, cy - y, cx + x, cy - y + r],
    [cx + x, cy + y - r], [cx + x, cy + y, cx + x - r, cy + y], [cx - x + r, cy + y],
    [cx - x, cy + y, cx - x, cy + y - r], [cx - x, cy - y + r], [cx - x, cy - y, cx - x + r, cy - y]];
  }
  function ngon(r, n, rot, sx, sy) {
    const p = []; rot = rot || 0; sx = sx === undefined ? 1 : sx; sy = sy === undefined ? 1 : sy;
    for (let i = 0; i < n; i++) { const a = rot + i / n * TAU; p.push([Math.cos(a) * r * sx, Math.sin(a) * r * sy]); }
    return p;
  }
  function ex(shape, depth, bev, curveSeg) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelSize: bev, bevelThickness: bev * 0.85,
      bevelSegments: 2, curveSegments: curveSeg || 4, steps: 1
    });
    g.translate(0, 0, -depth / 2);
    return g;
  }
  function taperZ(g, depth, s0, s1) {
    const pos = g.attributes.position, h = depth / 2;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i), t = clamp01((z + h) / depth), s = lerp(s0, s1, t);
      pos.setX(i, pos.getX(i) * s); pos.setY(i, pos.getY(i) * s);
    }
    g.computeVertexNormals(); return g;
  }
  // curls the plate's X ends back toward -Z (toward the mass it is pressed over)
  function bendY(g, R) {
    if (!R) return g;
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), th = x / R, rr = R + z;
      pos.setX(i, rr * Math.sin(th)); pos.setZ(i, rr * Math.cos(th) - R);
    }
    g.computeVertexNormals(); return g;
  }
  function mesh(parent, g, m, name, x, y, z) {
    const o = new THREE.Mesh(g, m); if (name) o.name = name;
    if (x !== undefined) o.position.set(x, y, z);
    parent.add(o); return o;
  }
  function grp(parent, name, x, y, z) {
    const g = new THREE.Group(); g.name = name; g.position.set(x || 0, y || 0, z || 0);
    parent.add(g); return g;
  }
  function orient(obj, zDir, yDir) {
    const z = zDir.clone().normalize(), yv = yDir.clone().normalize();
    const x = new THREE.Vector3().crossVectors(yv, z).normalize();
    const y2 = new THREE.Vector3().crossVectors(z, x).normalize();
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y2, z));
  }

  // shared small hardware
  const boltG = new THREE.CylinderGeometry(0.009, 0.011, 0.009, 6); boltG.rotateX(PI / 2);
  const pinG = new THREE.CylinderGeometry(0.011, 0.011, 0.05, 8); pinG.rotateZ(PI / 2);
  const linkG = ex(poly(rrectPts(0.052, 0.026), [ngon(0.006, 6, 0, 1, 1).map(p => [p[0] - 0.014, p[1]]), ngon(0.006, 6, 0, 1, 1).map(p => [p[0] + 0.014, p[1]])]), 0.011, 0.002);
  const clampG = ex(poly(ngon(0.036, 10, 0.31), [ngon(0.0248, 10, 0.31)]), 0.017, 0.003);
  const clampTabG = ex(poly(rrectPts(0.026, 0.03, 0, -0.03)), 0.012, 0.002);
  const portProf = [V2(0.002, 0), V2(0.030, 0), V2(0.030, 0.011), V2(0.021, 0.014), V2(0.021, 0.030),
  V2(0.028, 0.034), V2(0.028, 0.042), V2(0.014, 0.046), V2(0.014, 0.055), V2(0.002, 0.055)];
  const portG = new THREE.LatheGeometry(portProf, 9); portG.rotateX(PI / 2);
  const raceG = new THREE.CylinderGeometry(1, 1, 1, 12); raceG.rotateZ(PI / 2);
  const sprocketG = new THREE.LatheGeometry([V2(0.004, 0), V2(0.03, 0), V2(0.03, 0.012), V2(0.043, 0.014), V2(0.043, 0.024), V2(0.03, 0.026), V2(0.03, 0.036), V2(0.004, 0.036)], 10);
  sprocketG.rotateX(PI / 2);
  const suckerG = ex(poly(ngon(0.055, 10), [ngon(0.031, 10)]), 0.02, 0.004);
  const suckerCapG = ex(poly(ngon(0.032, 10)), 0.009, 0.002);
  const gearG = new THREE.LatheGeometry([V2(0.006, 0), V2(0.05, 0), V2(0.05, 0.014), V2(0.036, 0.017), V2(0.036, 0.03), V2(0.062, 0.033), V2(0.062, 0.045), V2(0.03, 0.049), V2(0.03, 0.06), V2(0.006, 0.06)], 12);
  gearG.rotateX(PI / 2);

  function boltRing(parent, n, r, z, mat, sc, ax) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      const b = new THREE.Mesh(boltG, mat);
      if (ax === 'y') { b.position.set(Math.cos(a) * r, z, Math.sin(a) * r); b.rotation.x = PI / 2; }
      else b.position.set(Math.cos(a) * r, Math.sin(a) * r, z);
      b.scale.setScalar(sc || 1); parent.add(b);
    }
  }
  function ram(parent, len, r, mat, matRod, name) {
    const g = grp(parent, name || '');
    const barrel = new THREE.CylinderGeometry(r, r * 1.12, len * 0.55, 8); barrel.rotateX(PI / 2);
    mesh(g, barrel, mat, '', 0, 0, -len * 0.22);
    const gland = new THREE.CylinderGeometry(r * 0.78, r * 0.78, len * 0.09, 8); gland.rotateX(PI / 2);
    mesh(g, gland, M.rubber, '', 0, 0, len * 0.09);
    const rod = new THREE.CylinderGeometry(r * 0.42, r * 0.42, len * 0.52, 6); rod.rotateX(PI / 2);
    const rm = mesh(g, rod, matRod || M.machL, '', 0, 0, len * 0.3);
    mesh(g, ex(poly(rrectPts(r * 1.5, r * 1.2)), r * 0.9, r * 0.16), mat, '', 0, 0, len * 0.52);
    return { g, rod: rm };
  }
  function chainRun(parent, pts, mat, n) {
    const cv = new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], p[1], p[2])));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, p = cv.getPointAt(t), tan = cv.getTangentAt(t);
      const l = new THREE.Mesh(linkG, i % 2 ? mat : M.steel);
      l.position.copy(p); l.quaternion.setFromUnitVectors(V3(1, 0, 0), tan);
      l.position.y += (i % 2 ? 0.004 : -0.004);
      parent.add(l);
      if (i % 2 === 0) { const pn = new THREE.Mesh(pinG, M.machL); pn.position.copy(p); pn.scale.set(0.32, 0.32, 0.32); parent.add(pn); }
    }
    return cv;
  }

  // ══════════════ PASS 1 — THE FRAME ═══════════════════════════════════════
  const crown = grp(body, 'crown', 0, 0.70, 0);
  const neck = grp(body, 'neck', 0, 0.74, 0.01);
  const head = grp(neck, 'head', 0, 0.21, 0.05);
  const skull = grp(head, 'skull', 0, 0, 0);
  const mantle = grp(body, 'mantle', 0, 1.00, -0.14);

  // spine of the bag, in mantle-local space
  const spine = new THREE.CatmullRomCurve3([
    V3(0, -0.04, 0.10), V3(0, 0.14, -0.14), V3(0, 0.36, -0.38),
    V3(0, 0.54, -0.66), V3(0, 0.62, -0.94), V3(0, 0.60, -1.08)
  ]);
  const ribT = [0.04, 0.19, 0.34, 0.49, 0.64, 0.80, 0.95];
  const ribR = [0.30, 0.41, 0.46, 0.45, 0.38, 0.27, 0.13];

  // neck collar — the head is bolted to the bag, nothing floats
  mesh(neck, taperZ(ex(poly(ngon(0.17, 8, 0.39, 1.15, 1.0)), 0.24, 0.008), 0.24, 1.0, 0.86), M.mach, 'neck_column', 0, 0.10, -0.02).rotation.x = PI / 2 - 0.35;
  mesh(neck, ex(poly(ngon(0.20, 10, 0.31, 1.2, 1.0), [ngon(0.13, 10, 0.31, 1.2, 1.0)]), 0.03, 0.005), M.machL, 'neck_flange', 0, 0.19, -0.06).rotation.x = PI / 2 - 0.35;
  boltRing(neck, 8, 0.165, 0.19, M.steel, 0.9, 'y');
  mesh(neck, ex(poly(ngon(0.20, 10, 0.31, 1.2, 1.0), [ngon(0.14, 10, 0.31, 1.2, 1.0)]), 0.028, 0.005), M.machL, 'neck_race', 0, 0.015, 0.01).rotation.x = PI / 2 - 0.2;

  // ══════════════ PASS 2 — THE LEADING END ═════════════════════════════════
  // dark filled core first so no daylight shows through the head
  mesh(skull, taperZ(ex(poly(ngon(0.26, 10, 0.31, 1.05, 0.8)), 0.44, 0.01), 0.44, 1.0, 0.72), M.steel, 'skull_core', 0, 0.0, 0.06).rotation.x = PI / 2;

  const topShape = poly([[-0.29, 0.04], [0.29, 0.04], [0.305, -0.10], [0.27, -0.28], [0.185, -0.42],
  [0.07, -0.49], [-0.07, -0.49], [-0.185, -0.42], [-0.27, -0.28], [-0.305, -0.10]],
    [[[-0.10, -0.06], [0.10, -0.06], [0.10, -0.10], [-0.10, -0.10]], [[-0.09, -0.16], [0.09, -0.16], [0.09, -0.195], [-0.09, -0.195]]]);
  const topG = bendY(ex(topShape, 0.032, 0.007, 5), 0.60);
  const skTop = mesh(skull, topG, M.shell, 'skull_topPlate', 0, 0.125, -0.01);
  skTop.rotation.x = -PI / 2 + 0.14;
  mesh(skull, bendY(ex(poly(rrectPts(0.13, 0.30, 0, -0.16)), 0.022, 0.004), 0.6), M.shellB, 'skull_topRib', 0, 0.152, -0.01).rotation.x = -PI / 2 + 0.14;

  const cheekShape = poly([[-0.20, 0.10], [0.24, 0.05], [0.30, -0.06], [0.26, -0.17], [0.05, -0.21], [-0.19, -0.16], [-0.23, -0.02]],
    [[[0.02, -0.02], [0.14, -0.04], [0.14, -0.075], [0.02, -0.055]]]);
  const cheekG = bendY(ex(cheekShape, 0.026, 0.006, 5), 0.9);
  const chL = mesh(skull, cheekG, M.shellB, 'skull_cheekL', -0.235, -0.01, 0.06); chL.rotation.y = -PI / 2;
  const chR = mesh(skull, cheekG, M.shellB, 'skull_cheekR', 0.235, -0.01, 0.06); chR.rotation.y = PI / 2; chR.scale.z = -1;

  const frontShape = poly([[-0.20, 0.09], [0.20, 0.09], [0.235, -0.02], [0.16, -0.15], [0.0, -0.20], [-0.16, -0.15], [-0.235, -0.02]],
    [[[-0.055, -0.04], [0.055, -0.04], [0.055, -0.075], [-0.055, -0.075]]]);
  mesh(skull, bendY(ex(frontShape, 0.028, 0.006, 5), 0.45), M.shell, 'skull_frontWedge', 0, 0.01, 0.30).rotation.x = -0.92;
  mesh(skull, bendY(ex(poly(rrectPts(0.30, 0.10, 0, 0)), 0.024, 0.005), 0.4), M.shellC, 'skull_browBar', 0, 0.085, 0.235).rotation.x = -1.25;
  mesh(skull, bendY(ex(poly(ngon(0.23, 9, 0.35, 1.15, 0.9)), 0.024, 0.005), 0.55), M.shellC, 'skull_underPlate', 0, -0.145, 0.05).rotation.x = PI / 2;
  mesh(skull, ex(poly(rrectPts(0.10, 0.05)), 0.012, 0.003), emCyan, 'skull_heatSlot', 0.0, -0.152, 0.19).rotation.x = PI / 2;
  mesh(skull, ex(poly(rrectPts(0.11, 0.07, 0, 0), [rrectPts(0.07, 0.03, 0, 0)]), 0.02, 0.004), M.machL, 'skull_vent', 0, 0.03, -0.20).rotation.y = 0;
  mesh(skull, ex(poly(ngon(0.10, 8, 0.39, 1.0, 0.7)), 0.05, 0.006), M.mach, 'skull_sensorPod', 0, 0.10, 0.16).rotation.x = -1.0;
  mesh(skull, ex(poly(rrectPts(0.05, 0.09)), 0.03, 0.004), M.machL, 'skull_junctionBox', -0.18, 0.09, -0.13);
  mesh(skull, ex(poly(rrectPts(0.05, 0.07)), 0.028, 0.004), M.machL, 'skull_junctionBoxR', 0.19, 0.08, -0.14);
  for (let i = 0; i < 2; i++) {
    const a = i ? 1 : -1;
    const st = new THREE.CylinderGeometry(0.004, 0.006, 0.14, 5); st.rotateZ(a * 0.5); st.rotateX(-0.3);
    mesh(skull, st, M.steel, 'skull_antenna_' + i, a * 0.14, 0.19, -0.08);
  }
  boltRing(skull, 10, 0.24, -0.05, M.steel, 0.85, 'y');

  // eyes — dark recessed glass in stepped bezels, slot pupils, two lids each
  const eyes = [];
  for (let e = 0; e < 2; e++) {
    const s = e ? 1 : -1, nm = e ? 'R' : 'L';
    const tur = grp(skull, 'eye' + nm, s * 0.20, 0.055, 0.045);
    tur.rotation.set(-0.22, s * 1.18, 0);
    const barrel = new THREE.LatheGeometry([V2(0.004, 0), V2(0.10, 0), V2(0.115, 0.03), V2(0.115, 0.07),
    V2(0.10, 0.085), V2(0.10, 0.10), V2(0.086, 0.108), V2(0.004, 0.108)], 14);
    barrel.rotateX(PI / 2);
    mesh(tur, barrel, M.mach, 'eye' + nm + '_barrel', 0, 0, 0.02);
    const bez = new THREE.LatheGeometry([V2(0.072, 0), V2(0.104, 0), V2(0.104, 0.018), V2(0.094, 0.026),
    V2(0.094, 0.04), V2(0.082, 0.046), V2(0.072, 0.04)], 14);
    bez.rotateX(PI / 2);
    mesh(tur, bez, M.machL, 'eye' + nm + '_bezel', 0, 0, 0.086);
    const lensG = new THREE.SphereGeometry(0.072, 14, 9, 0, TAU, 0, PI * 0.56); lensG.rotateX(PI / 2);
    mesh(tur, lensG, M.lens, 'eye' + nm + '_lens', 0, 0, 0.058);
    mesh(tur, ex(poly(rrectPts(0.088, 0.019)), 0.006, 0.001), M.lens, 'eye' + nm + '_pupil', 0, 0, 0.113);
    mesh(tur, bendY(ex(poly([[-0.10, 0.0], [0.10, 0.0], [0.085, 0.055], [0.0, 0.075], [-0.085, 0.055]]), 0.02, 0.004), 0.16), M.shellB, 'eye' + nm + '_hood', 0, 0.055, 0.055).rotation.x = -1.15;
    const lu = grp(tur, 'eye' + nm + '_lidUpper', 0, 0.052, 0.055); lu.rotation.x = -0.62;
    mesh(lu, bendY(ex(poly([[-0.098, 0.0], [0.098, 0.0], [0.086, -0.055], [0.0, -0.072], [-0.086, -0.055]]), 0.016, 0.003), 0.17), M.shellC, 'eye' + nm + '_lidUpperPlate', 0, -0.02, 0.03);
    const ll = grp(tur, 'eye' + nm + '_lidLower', 0, -0.05, 0.05); ll.rotation.x = 0.5;
    mesh(ll, bendY(ex(poly([[-0.09, 0.0], [0.09, 0.0], [0.078, 0.045], [0.0, 0.058], [-0.078, 0.045]]), 0.014, 0.003), 0.17), M.shellC, 'eye' + nm + '_lidLowerPlate', 0, 0.018, 0.028);
    ram(tur, 0.13, 0.017, M.mach, M.machL, 'eye' + nm + '_ram').g.position.set(s * 0.045, -0.03, -0.05);
    mesh(tur, ex(poly(ngon(0.026, 6, 0.2)), 0.03, 0.004), M.machL, 'eye' + nm + '_fitting', -s * 0.08, 0.06, -0.01);
    mesh(tur, ex(poly(ngon(0.02, 6, 0.4)), 0.026, 0.003), M.bronze, 'eye' + nm + '_fitting2', s * 0.07, -0.062, 0.0);
    mesh(tur, new THREE.CylinderGeometry(0.05, 0.055, 0.02, 10), M.steel, 'eye' + nm + '_race', 0, 0, -0.03).rotation.x = PI / 2;
    boltRing(tur, 8, 0.096, 0.075, M.steel, 0.8);
    eyes.push({ tur, lu, ll, ruX: lu.rotation.x, rlX: ll.rotation.x });
  }

  // beak, in the middle of the arm crown
  const beak = grp(crown, 'beak', 0, -0.05, 0.06);
  mesh(beak, new THREE.LatheGeometry([V2(0.004, 0), V2(0.10, 0), V2(0.10, 0.03), V2(0.075, 0.045), V2(0.075, 0.07), V2(0.004, 0.07)], 12), M.mach, 'beak_housing', 0, 0.04, 0);
  const beakU = grp(beak, 'beak_upperHinge', 0, -0.01, 0.0);
  mesh(beakU, ex(poly([[-0.052, 0.0], [0.052, 0.0], [0.044, -0.055], [0.016, -0.10], [0.0, -0.115], [-0.016, -0.10], [-0.044, -0.055]]), 0.05, 0.006), M.steel, 'beak_upper', 0, 0, 0.01);
  const beakL2 = grp(beak, 'beak_lowerHinge', 0, -0.012, -0.005);
  mesh(beakL2, ex(poly([[-0.046, 0.0], [0.046, 0.0], [0.038, -0.048], [0.0, -0.088], [-0.038, -0.048]]), 0.044, 0.005), M.bronze, 'beak_lower', 0, 0, -0.012);
  ram(beak, 0.10, 0.014, M.mach, M.machL, 'beak_ramL').g.position.set(-0.07, -0.01, -0.03);
  ram(beak, 0.10, 0.014, M.mach, M.machL, 'beak_ramR').g.position.set(0.07, -0.01, -0.03);
  mesh(beak, gearG, M.bronze, 'beak_gear', 0.075, 0.01, 0.0).scale.setScalar(0.55);
  mesh(beak, new THREE.LatheGeometry([V2(0.10, 0), V2(0.135, 0), V2(0.135, 0.022), V2(0.10, 0.03)], 14), M.machL, 'mouth_ring', 0, 0.02, 0);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU + 0.3;
    const pap = mesh(beak, ex(poly([[-0.018, 0], [0.018, 0], [0.012, 0.05], [-0.012, 0.05]]), 0.012, 0.002), M.shellC, 'mouth_papilla_' + i,
      Math.cos(a) * 0.125, 0.025, Math.sin(a) * 0.125);
    pap.rotation.set(PI / 2 - 0.5, -a, 0);
  }

  // funnel — the deliberate asymmetry, bolted on the right of the head
  const siphon = grp(head, 'siphon', 0.20, -0.09, 0.02);
  siphon.rotation.set(0.85, 0.42, 0);
  mesh(siphon, ex(poly(ngon(0.062, 9, 0.3), [ngon(0.036, 9, 0.3)]), 0.022, 0.004), M.machL, 'siphon_flange', 0, 0, 0.01);
  const sBody = new THREE.CylinderGeometry(0.032, 0.052, 0.16, 8); sBody.rotateX(PI / 2);
  mesh(siphon, sBody, M.mach, 'siphon_body', 0, 0, 0.09);
  const sNoz = new THREE.LatheGeometry([V2(0.004, 0), V2(0.030, 0), V2(0.036, 0.02), V2(0.030, 0.038), V2(0.020, 0.042), V2(0.004, 0.042)], 10);
  sNoz.rotateX(PI / 2);
  const siphonNoz = mesh(siphon, sNoz, M.machL, 'siphon_nozzle', 0, 0, 0.175);
  mesh(siphon, ex(poly(rrectPts(0.05, 0.045)), 0.03, 0.004), M.accent, 'siphon_valve', 0.045, 0.018, 0.06);
  mesh(siphon, ex(poly(ngon(0.045, 8, 0.4), [ngon(0.032, 8, 0.4)]), 0.014, 0.003), M.bronze, 'siphon_clampRing', 0, 0, 0.145);
  boltRing(siphon, 7, 0.05, 0.012, M.steel, 0.8);

  // ══════════════ PASS 3+4+5 — ARMS: digits, mechanism, shells ═════════════
  const SEGL = [0.30, 0.28, 0.26, 0.235, 0.205, 0.175, 0.145];
  const SEGR = [0.135, 0.118, 0.100, 0.083, 0.066, 0.048, 0.030, 0.014];
  const SEGP = [0, 0.25, 0.15, -0.25, -0.45, -0.20, -0.10];
  const SEGY = [0, 0.05, 0.09, 0.06, 0.0, -0.05, -0.08];
  const ARMY = [0.30, -0.30, 0.85, -0.85, 1.45, -1.45, 2.15, -2.15];
  const ARMP = [0.44, 0.44, 0.47, 0.47, 0.50, 0.50, 0.56, 0.56];
  const LSIGN = [1, -1, -1, 1, 1, -1, -1, 1];
  const SIDE = ARMY.map(a => Math.sin(a) >= 0 ? 1 : -1);
  const ARMPH = [0, 0.5, 0.125, 0.625, 0.25, 0.75, 0.375, 0.875];

  // one set of segment geometries, reused by all eight arms
  const coreG = [], shellG = [], hubG = [], raceGs = [];
  for (let k = 0; k < 7; k++) {
    const r0 = SEGR[k], r1 = SEGR[k + 1], L = SEGL[k];
    const cs = poly(ngon(r0, 9, 0.35, 1.0, 0.88));
    coreG.push(taperZ(ex(cs, L * 0.94, Math.min(0.008, r0 * 0.13), 3), L * 0.94, 1.0, r1 / r0));
    const R = r0 + 0.016, w = R * 2.1;
    const sh = poly([[-w / 2, 0.03], [w / 2, 0.03], [w / 2 * 0.94, -L * 0.35], [w / 2 * 0.8, -L * 0.72],
    [w / 2 * 0.45, -L * 0.90], [0, -L * 0.94], [-w / 2 * 0.45, -L * 0.90], [-w / 2 * 0.72, -L * 0.72], [-w / 2 * 0.94, -L * 0.35]],
      k < 5 ? [[[-w * 0.13, -L * 0.30], [w * 0.13, -L * 0.30], [w * 0.13, -L * 0.40], [-w * 0.13, -L * 0.40]]] : null);
    shellG.push(bendY(ex(sh, Math.max(0.012, r0 * 0.16), Math.min(0.006, r0 * 0.1), 3), R));
    const hg = new THREE.CylinderGeometry(r0 * 1.06, r0 * 1.06, r0 * 1.5, 8); hg.rotateZ(PI / 2);
    hubG.push(hg);
    const rg = new THREE.CylinderGeometry(r0 * 1.22, r0 * 1.22, r0 * 0.42, 10); rg.rotateZ(PI / 2);
    raceGs.push(rg);
  }
  const tipG = ex(poly([[-0.014, 0], [0.014, 0], [0.008, -0.09], [0, -0.115], [-0.008, -0.09]]), 0.012, 0.002);

  const arms = [];
  for (let i = 0; i < 8; i++) {
    const yaw = ARMY[i], mp = ARMP[i], d = mp - 0.45;
    const mount = grp(crown, 'arm_' + i, Math.sin(yaw) * 0.325, -0.015, Math.cos(yaw) * 0.325);
    mount.rotation.set(mp, yaw, 0);
    mount.scale.setScalar(i > 5 ? 0.94 : (i < 2 ? 1.04 : 1.0));
    // yoke the arm sits in — it is bolted to the crown race, not floating
    mesh(mount, ex(poly(rrectPts(0.13, 0.115), [ngon(0.045, 8)]), 0.05, 0.006), M.machL, 'arm_' + i + '_yoke', 0, 0, -0.03);
    boltRing(mount, 6, 0.075, -0.055, M.steel, 0.8);

    const segs = [], rs = [];
    let parent = mount;
    for (let k = 0; k < 7; k++) {
      const g = grp(parent, 'arm_' + i + '_seg_' + k, 0, 0, k === 0 ? 0.02 : SEGL[k - 1]);
      const px = SEGP[k] - (k === 3 ? d * 0.6 : k === 4 ? d * 0.4 : 0);
      g.rotation.set(px, SEGY[k] * LSIGN[i], 0);
      rs.push({ x: px, y: SEGY[k] * LSIGN[i], z: 0 });
      segs.push(g); parent = g;
      const L = SEGL[k], r0 = SEGR[k];
      mesh(g, coreG[k], armMachMat[i], 'arm_' + i + '_core_' + k, 0, 0, L * 0.47);
      mesh(g, hubG[k], M.machL, '', 0, 0, 0.004);
      mesh(g, raceGs[k], M.steel, '', 0, 0, 0.004);
      boltRing(g, 6, r0 * 0.8, 0.004, M.bronze, 0.62);
      const sh = mesh(g, shellG[k], armShellMat[i], 'arm_' + i + '_shell_' + k, 0, 0, 0);
      sh.rotation.x = -PI / 2;
      if (k < 3) {
        mesh(g, bendY(ex(poly(rrectPts(r0 * 0.5, L * 0.55, 0, -L * 0.45)), r0 * 0.12, 0.004), r0 + 0.02), armShellMat[i], 'arm_' + i + '_shellRib_' + k, 0, r0 * 0.02, 0).rotation.x = -PI / 2;
        const sp = mesh(g, bendY(ex(poly([[-r0 * 0.62, 0], [r0 * 0.62, 0], [r0 * 0.5, -L * 0.6], [-r0 * 0.55, -L * 0.55]]), r0 * 0.13, 0.004), r0 + 0.02), M.shellC, 'arm_' + i + '_shellSide_' + k, 0, 0, 0);
        sp.rotation.set(-PI / 2, 0, 0); sp.rotation.z = 0; sp.position.set(0, 0, 0);
        sp.rotation.y = 0; sp.rotateOnAxis(V3(0, 0, 1), 0);
        sp.applyMatrix4(new THREE.Matrix4().makeRotationZ(0));
        sp.rotation.set(-PI / 2, 0, 0); sp.position.set(0, 0, 0);
        sp.rotation.z = LSIGN[i] * 1.25;
        const rr = ram(g, L * 0.8, r0 * 0.2, M.mach, M.machL, '');
        rr.g.position.set(-r0 * 0.72 * LSIGN[i], -r0 * 0.3, L * 0.42);
      }
      if (k < 5) {
        chainRun(g, [[r0 * 0.8, r0 * 0.42, 0.01], [r0 * 0.72, r0 * 0.5, L * 0.35], [r0 * 0.6, r0 * 0.44, L * 0.72], [r0 * 0.5, r0 * 0.38, L * 0.95]], M.bronze, 4);
        mesh(g, sprocketG, M.machL, '', r0 * 0.82, r0 * 0.42, 0.01).scale.setScalar(r0 * 5.2);
      }
      // suckers — their own pressed pieces, going small toward the tip
      for (let sIdx = 0; sIdx < 2; sIdx++) {
        const sc = (r0 / 0.135) * (1 - k * 0.03);
        const su = mesh(g, suckerG, M.machL, 'arm_' + i + '_sucker_' + k + '_' + sIdx,
          (sIdx ? 1 : -1) * r0 * 0.42, -r0 * 0.80, L * (sIdx ? 0.68 : 0.28));
        su.rotation.set(PI / 2, 0, 0); su.scale.setScalar(sc * 0.95);
        const cap = mesh(g, suckerCapG, M.rubber, '', (sIdx ? 1 : -1) * r0 * 0.42, -r0 * 0.74, L * (sIdx ? 0.68 : 0.28));
        cap.rotation.set(PI / 2, 0, 0); cap.scale.setScalar(sc * 0.95);
      }
    }
    // the tip: three fine links and a claw, on the last segment
    const tipHost = segs[6];
    const t1 = grp(tipHost, 'arm_' + i + '_tipLink_0', 0, 0, SEGL[6]); t1.rotation.x = -0.14;
    mesh(t1, taperZ(ex(poly(ngon(0.013, 7, 0.3)), 0.05, 0.002, 3), 0.05, 1.0, 0.8), M.machL, 'arm_' + i + '_tipCore_0', 0, 0, 0.025);
    const t2 = grp(t1, 'arm_' + i + '_tipLink_1', 0, 0, 0.05); t2.rotation.x = -0.18;
    mesh(t2, taperZ(ex(poly(ngon(0.010, 7, 0.3)), 0.042, 0.002, 3), 0.042, 1.0, 0.75), M.mach, 'arm_' + i + '_tipCore_1', 0, 0, 0.021);
    const t3 = grp(t2, 'arm_' + i + '_tipLink_2', 0, 0, 0.042); t3.rotation.x = -0.22;
    mesh(t3, taperZ(ex(poly(ngon(0.008, 6, 0.3)), 0.036, 0.0015, 3), 0.036, 1.0, 0.6), M.machL, 'arm_' + i + '_tipCore_2', 0, 0, 0.018);
    const claw = mesh(t3, tipG, M.steel, 'arm_' + i + '_tipClaw', 0, 0, 0.05);
    claw.rotation.x = -PI / 2 + 0.3;
    arms.push({ mount, segs, rs, rm: { x: mp, y: yaw, z: 0 }, tips: [t1, t2, t3], tr: [-0.14, -0.18, -0.22] });
  }

  // crown race and its hardware — arms hang off something you can see
  mesh(crown, new THREE.LatheGeometry([V2(0.24, 0), V2(0.375, 0), V2(0.375, 0.05), V2(0.33, 0.075), V2(0.24, 0.075)], 24), M.mach, 'crown_race', 0, 0.01, 0);
  mesh(crown, ex(poly(ngon(0.30, 14, 0.22), [ngon(0.19, 14, 0.22)]), 0.05, 0.007, 4), M.machL, 'crown_plate', 0, 0.055, 0).rotation.x = PI / 2;
  boltRing(crown, 16, 0.345, 0.055, M.steel, 0.9, 'y');
  mesh(crown, gearG, M.bronze, 'crown_gearStack', 0.18, 0.06, 0.16).rotation.set(-PI / 2, 0, 0);
  mesh(crown, gearG, M.bronze, 'crown_gearStack2', -0.18, 0.06, 0.16).rotation.set(-PI / 2, 0, 0);

  // ══════════════ PASS 4/5 — THE MANTLE: stack, machine, then shells ═══════
  const ribs = [];
  for (let i = 0; i < 7; i++) {
    const p = spine.getPointAt(ribT[i]), tan = spine.getTangentAt(ribT[i]), r = ribR[i];
    const g = grp(mantle, 'mantle_rib_' + i, p.x, p.y, p.z);
    g.quaternion.setFromUnitVectors(V3(0, 0, 1), tan);
    const rs = poly(ngon(r, 16, 0.196, 1.0, 0.94), [ngon(r * 0.78, 16, 0.196, 1.0, 0.94)]);
    mesh(g, ex(rs, 0.05, 0.006, 4), i % 2 ? M.machL : M.mach, 'mantle_ribPlate_' + i);
    mesh(g, ex(poly(rrectPts(r * 1.6, r * 0.16)), 0.035, 0.004), M.steel, 'mantle_ribBraceA_' + i);
    mesh(g, ex(poly(rrectPts(r * 0.16, r * 1.5)), 0.03, 0.004), M.steel, 'mantle_ribBraceB_' + i);
    boltRing(g, 10, r * 0.88, 0.03, M.bronze, 0.85);
    ribs.push({ g, p, tan, r });
  }
  // the drum that fills the bag — no daylight through the middle
  for (let i = 0; i < 5; i++) {
    const t0 = ribT[i], t1 = ribT[i + 1];
    const a = spine.getPointAt(t0), b = spine.getPointAt(t1);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const g = grp(mantle, 'mantle_drum_' + i, mid.x, mid.y, mid.z);
    g.quaternion.setFromUnitVectors(V3(0, 0, 1), dir.normalize());
    mesh(g, taperZ(ex(poly(ngon(ribR[i] * 0.80, 12, 0.26, 1.0, 0.94)), len, 0.006, 3), len, 1.0, (ribR[i + 1] * 0.8) / (ribR[i] * 0.8)), M.steel, 'mantle_drumBlock_' + i);
  }
  // tie rods landing in flanges at both ends
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + 0.4;
    const pts = ribs.map(rb => {
      const q = new THREE.Vector3(Math.cos(a) * rb.r * 0.86, Math.sin(a) * rb.r * 0.86, 0).applyQuaternion(rb.g.quaternion);
      return rb.p.clone().add(q);
    });
    const cv = new THREE.CatmullRomCurve3(pts);
    mesh(mantle, new THREE.TubeGeometry(cv, 26, 0.017, 6, false), M.machL, 'mantle_tieRod_' + i);
    for (const endT of [0, 1]) {
      const pp = cv.getPointAt(endT), tt = cv.getTangentAt(endT);
      const fl = mesh(mantle, portG, M.mach, '', pp.x, pp.y, pp.z);
      fl.quaternion.setFromUnitVectors(V3(0, 0, 1), tt); fl.scale.setScalar(0.7);
    }
  }
  // chain runs over sprockets down both flanks, in the shell gaps
  for (let s = 0; s < 2; s++) {
    const sg = s ? 1 : -1;
    const pts = ribs.map(rb => {
      const q = new THREE.Vector3(sg * rb.r * 0.99, -rb.r * 0.28, 0).applyQuaternion(rb.g.quaternion);
      return rb.p.clone().add(q);
    });
    const cvp = pts.map(p => [p.x, p.y, p.z]);
    const cv = chainRun(mantle, cvp, M.bronze, 16);
    const cg = grp(mantle, 'mantle_chainRun_' + s);
    for (const et of [0.02, 0.98]) {
      const pp = cv.getPointAt(et), tt = cv.getTangentAt(et);
      const sp = mesh(cg, sprocketG, M.machL, 'mantle_sprocket_' + s + '_' + (et > 0.5 ? 1 : 0), pp.x, pp.y, pp.z);
      sp.quaternion.setFromUnitVectors(V3(0, 0, 1), V3(sg, 0, 0));
      sp.scale.setScalar(1.35);
    }
  }
  // gear stacks and contraction rams
  const mantleRams = [];
  for (let s = 0; s < 2; s++) {
    const sg = s ? 1 : -1;
    mesh(mantle, gearG, M.bronze, 'mantle_gearStack_' + s, sg * 0.30, 0.02, -0.06).quaternion.setFromUnitVectors(V3(0, 0, 1), V3(sg, 0.1, 0));
    mesh(mantle, gearG, M.machL, 'mantle_gearStack2_' + s, sg * 0.30, 0.14, -0.30).quaternion.setFromUnitVectors(V3(0, 0, 1), V3(sg, 0.1, 0));
    const rr = ram(mantle, 0.52, 0.03, M.mach, M.machL, 'mantle_ram_' + s);
    rr.g.position.set(sg * 0.26, 0.20, -0.28);
    rr.g.quaternion.setFromUnitVectors(V3(0, 0, 1), V3(0, 0.62, -0.78));
    mantleRams.push(rr);
  }
  mesh(mantle, ex(poly(ngon(0.16, 10, 0.3), [ngon(0.10, 10, 0.3)]), 0.03, 0.005), M.machL, 'mantle_baseRace', 0, -0.05, 0.07).rotation.x = PI / 2 - 0.5;

  // shells clamped over the stack, each on a hinge, overlapping like scales
  const mShells = [];
  function mantleShell(name, t, ang, arc, along, mat, tier, openSign) {
    const p = spine.getPointAt(t), tan = spine.getTangentAt(t);
    const rb = lerp(ribR[Math.max(0, Math.min(6, Math.floor(t * 6)))], ribR[Math.max(0, Math.min(6, Math.ceil(t * 6)))], (t * 6) % 1);
    const up = V3(0, -tan.z, tan.y).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const outward = up.clone().multiplyScalar(Math.cos(ang)).add(side.clone().multiplyScalar(Math.sin(ang))).normalize();
    const hinge = grp(mantle, name + '_hinge', p.x, p.y, p.z);
    orient(hinge, outward, tan);
    const R = rb + 0.035, w = R * arc;
    const sh = poly([[-w / 2, along * 0.5], [w / 2 * 0.92, along * 0.5], [w / 2, along * 0.1],
    [w / 2 * 0.88, -along * 0.42], [w / 2 * 0.5, -along * 0.5], [-w / 2 * 0.6, -along * 0.5],
    [-w / 2 * 0.95, -along * 0.2], [-w / 2, along * 0.15]],
      [[[-w * 0.16, along * 0.10], [w * 0.16, along * 0.10], [w * 0.16, along * 0.02], [-w * 0.16, along * 0.02]],
      [[-w * 0.10, -along * 0.14], [w * 0.10, -along * 0.14], [w * 0.10, -along * 0.22], [-w * 0.10, -along * 0.22]]]);
    const g = bendY(ex(sh, 0.03, 0.007, 4), R);
    const m = mesh(hinge, g, mat, name, 0, 0, R - 0.01);
    mesh(hinge, bendY(ex(poly(rrectPts(w * 0.55, along * 0.10, 0, along * 0.28)), 0.018, 0.004), R), mat, name + '_rib', 0, 0, R + 0.012);
    boltRing(hinge, 6, w * 0.36, R + 0.005, M.steel, 0.75);
    mShells.push({ hinge, sign: openSign, rest: hinge.rotation.clone() });
    return m;
  }
  mantleShell('mantle_shell_dorsalA', 0.13, 0.0, 2.30, 0.38, M.shell, 0, 1);
  mantleShell('mantle_shell_dorsalB', 0.40, 0.0, 2.20, 0.36, M.shellB, 0, 1);
  mantleShell('mantle_shell_dorsalC', 0.66, 0.0, 2.00, 0.32, M.shell, 0, 1);
  mantleShell('mantle_shell_flankL1', 0.16, -1.30, 1.55, 0.34, M.shellB, 1, -1);
  mantleShell('mantle_shell_flankR1', 0.16, 1.30, 1.55, 0.34, M.shellB, 1, 1);
  mantleShell('mantle_shell_flankL2', 0.45, -1.35, 1.60, 0.34, M.shellC, 1, -1);
  mantleShell('mantle_shell_flankR2', 0.45, 1.35, 1.60, 0.34, M.shellC, 1, 1);
  mantleShell('mantle_shell_flankL3', 0.72, -1.25, 1.40, 0.28, M.shellB, 1, -1);
  mantleShell('mantle_shell_flankR3', 0.72, 1.25, 1.40, 0.28, M.shellB, 1, 1);
  mantleShell('mantle_shell_bellyL', 0.34, -2.45, 1.20, 0.30, M.shellC, 2, -1);
  mantleShell('mantle_shell_bellyR', 0.34, 2.45, 1.20, 0.30, M.shellC, 2, 1);
  // rear cap in three pressed pieces, not one pebble
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU + 0.5;
    const p = spine.getPointAt(0.985), tan = spine.getTangentAt(0.985);
    const hg = grp(mantle, 'mantle_capHinge_' + i, p.x, p.y, p.z);
    orient(hg, tan, V3(0, 1, 0));
    const cs = poly([[-0.085, 0.0], [0.085, 0.0], [0.06, 0.11], [0.0, 0.135], [-0.06, 0.11]]);
    const m = mesh(hg, bendY(ex(cs, 0.024, 0.005), 0.19), i === 1 ? M.accent : M.shellB, 'mantle_capPlate_' + i, 0, 0, 0.02);
    m.rotation.z = a; m.position.set(Math.cos(a + PI / 2) * 0.05, Math.sin(a + PI / 2) * 0.05, 0.02);
    mShells.push({ hinge: hg, sign: i === 0 ? 1 : -1, rest: hg.rotation.clone() });
  }
  mesh(mantle, ex(poly(rrectPts(0.07, 0.035)), 0.012, 0.002), emAmber, 'mantle_statusPort', 0.24, 0.44, -0.62).quaternion.setFromUnitVectors(V3(0, 0, 1), V3(1, 0.1, 0));
  mesh(mantle, ex(poly(rrectPts(0.10, 0.06)), 0.008, 0.002), M.accent, 'mantle_markPlateL', -0.30, 0.30, -0.30).quaternion.setFromUnitVectors(V3(0, 0, 1), V3(-1, 0.15, 0));
  // painted stencils, three on the whole body
  const glyph = ex(poly([[-0.035, -0.028], [0.035, -0.028], [0, 0.034]], [[[-0.014, -0.012], [0.014, -0.012], [0, 0.014]]]), 0.003, 0.0008);
  mesh(mantle, glyph, M.steel, 'mark_glyph_0', 0.16, 0.30, -0.16).quaternion.setFromUnitVectors(V3(0, 0, 1), V3(0.6, 0.75, 0.3));
  mesh(mantle, glyph, M.steel, 'mark_glyph_1', -0.10, 0.55, -0.66).quaternion.setFromUnitVectors(V3(0, 0, 1), V3(-0.2, 0.9, 0.35));
  mesh(skull, glyph, M.steel, 'mark_glyph_2', 0.13, 0.115, -0.10).scale.setScalar(0.65);
  mesh(skull, glyph, M.steel, 'mark_glyph_2b', 0.13, 0.115, -0.10).visible = false;

  // ══════════════ PASS 6 — THE CABLE HARNESS, OUTSIDE THE ARMOUR ═══════════
  root.updateMatrixWorld(true);
  const harness = grp(body, 'harness');
  const hMantle = grp(mantle, 'harness_mantle');
  const hCrown = grp(crown, 'harness_crown');
  let runIdx = 0;

  function portAt(parent, p, dir, sc) {
    const o = mesh(parent, portG, M.machL, '', p.x, p.y, p.z);
    o.quaternion.setFromUnitVectors(V3(0, 0, 1), dir.clone().normalize());
    o.scale.setScalar(sc || 1);
    return o;
  }
  function hose(parent, pts, r, mat, name, clamps) {
    const v = pts.map(p => (p.isVector3 ? p : V3(p[0], p[1], p[2])));
    const cv = new THREE.CatmullRomCurve3(v);
    const L = cv.getLength();
    const g = new THREE.TubeGeometry(cv, Math.max(14, Math.round(L * 22)), r, 6, false);
    mesh(parent, g, mat, name);
    const n = clamps === undefined ? 3 : clamps;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, p = cv.getPointAt(t), tan = cv.getTangentAt(t);
      const c = new THREE.Mesh(clampG, M.machL);
      c.position.copy(p); c.quaternion.setFromUnitVectors(V3(0, 0, 1), tan);
      c.scale.setScalar(r / 0.024); parent.add(c);
      const tb = new THREE.Mesh(clampTabG, M.steel);
      tb.position.copy(p); tb.quaternion.copy(c.quaternion); tb.scale.setScalar(r / 0.024);
      parent.add(tb);
    }
    portAt(parent, cv.getPointAt(0), cv.getTangentAt(0).multiplyScalar(-1), r / 0.024 * 0.9);
    portAt(parent, cv.getPointAt(1), cv.getTangentAt(1), r / 0.024 * 0.9);
    runIdx++;
    return cv;
  }

  // every arm carries a trunk hose standing clear of its shells
  for (let i = 0; i < 8; i++) {
    const A = arms[i], host = A.segs[1];
    const off = (k, ox, oy, oz) => {
      const w = A.segs[k].localToWorld(V3(ox, oy, oz));
      return host.worldToLocal(w);
    };
    const sgn = LSIGN[i];
    const pts = [
      host.worldToLocal(A.mount.localToWorld(V3(sgn * 0.09, 0.05, -0.05))),
      off(0, sgn * 0.11, 0.15, 0.12), off(1, sgn * 0.10, 0.17, 0.14),
      off(2, sgn * 0.085, 0.16, 0.13), off(3, sgn * 0.075, 0.15, 0.12),
      off(4, sgn * 0.06, 0.13, 0.10), off(5, sgn * 0.05, 0.10, 0.07),
      off(6, sgn * 0.035, 0.07, 0.05)
    ];
    hose(host, pts, 0.024, M.rubber, 'harness_armTrunk_' + i, 5);
    const host2 = A.segs[4];
    const off2 = (k, ox, oy, oz) => {
      const w = A.segs[k].localToWorld(V3(ox, oy, oz));
      return host2.worldToLocal(w);
    };
    hose(host2, [off2(3, -sgn * 0.07, 0.09, 0.05), off2(4, -sgn * 0.065, 0.11, 0.10),
    off2(5, -sgn * 0.05, 0.09, 0.09), off2(6, -sgn * 0.035, 0.06, 0.06),
    off2(6, -sgn * 0.02, 0.035, 0.12)], 0.009, M.rubber, 'harness_armWire_' + i, 3);
  }
  // hoses ringing the crown collar, fully in the open
  for (let s = 0; s < 2; s++) {
    const rr = 0.40 + s * 0.045, yy = 0.03 - s * 0.055, pts = [];
    for (let i = 0; i <= 12; i++) {
      const a = -2.5 + i / 12 * 5.0;
      pts.push([Math.sin(a) * rr, yy + Math.sin(i * 1.9) * 0.012, Math.cos(a) * rr]);
    }
    hose(hCrown, pts, s ? 0.023 : 0.011, M.rubber, 'harness_crownRing_' + s, 6);
  }
  // mantle runs: over the dorsal shells, along the flanks, belly, and two proud loops
  function spineOff(t, ang, d) {
    const p = spine.getPointAt(t), tan = spine.getTangentAt(t);
    const rb = lerp(ribR[Math.max(0, Math.min(6, Math.floor(t * 6)))], ribR[Math.max(0, Math.min(6, Math.ceil(t * 6)))], (t * 6) % 1);
    const up = V3(0, -tan.z, tan.y).normalize();
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const out = up.clone().multiplyScalar(Math.cos(ang)).add(side.clone().multiplyScalar(Math.sin(ang))).normalize();
    return p.clone().add(out.multiplyScalar(rb + d));
  }
  for (let s = 0; s < 2; s++) {
    const sg = s ? 1 : -1;
    hose(hMantle, [spineOff(0.02, sg * 0.5, 0.05), spineOff(0.16, sg * 0.42, 0.10), spineOff(0.32, sg * 0.38, 0.075),
    spineOff(0.5, sg * 0.35, 0.10), spineOff(0.68, sg * 0.32, 0.075), spineOff(0.86, sg * 0.30, 0.09),
    spineOff(0.98, sg * 0.4, 0.04)], 0.024, M.rubber, 'harness_dorsalTrunk_' + s, 5);
    hose(hMantle, [spineOff(0.03, sg * 1.55, 0.04), spineOff(0.20, sg * 1.62, 0.095), spineOff(0.38, sg * 1.66, 0.06),
    spineOff(0.56, sg * 1.62, 0.10), spineOff(0.74, sg * 1.58, 0.06), spineOff(0.92, sg * 1.5, 0.085),
    spineOff(0.99, sg * 1.2, 0.03)], 0.019, M.rubber, 'harness_flankRun_' + s, 5);
    hose(hMantle, [spineOff(0.06, sg * 2.6, 0.035), spineOff(0.26, sg * 2.7, 0.07), spineOff(0.48, sg * 2.75, 0.05),
    spineOff(0.70, sg * 2.7, 0.075), spineOff(0.9, sg * 2.6, 0.04)], 0.013, M.rubber, 'harness_bellyRun_' + s, 4);
    // a loop that stands proud of the shells and lands back on the body
    hose(hMantle, [spineOff(0.12, sg * 1.0, 0.03), spineOff(0.22, sg * 0.9, 0.22), spineOff(0.42, sg * 0.85, 0.30),
    spineOff(0.62, sg * 0.95, 0.24), spineOff(0.74, sg * 1.15, 0.05)], 0.017, M.rubber, 'harness_loop_' + s, 4);
    hose(hMantle, [spineOff(0.08, sg * 0.9, 0.05), spineOff(0.30, sg * 1.1, 0.13), spineOff(0.55, sg * 1.25, 0.10),
    spineOff(0.80, sg * 1.35, 0.13), spineOff(0.96, sg * 1.0, 0.045)], 0.009, M.rubber, 'harness_spineWire_' + s, 4);
  }
  // head to bag and head to crown, crossing the joints where they show most
  for (let s = 0; s < 2; s++) {
    const sg = s ? 1 : -1;
    hose(harness, [[sg * 0.20, 0.86, 0.10], [sg * 0.27, 0.94, -0.02], [sg * 0.30, 1.02, -0.16],
    [sg * 0.28, 1.14, -0.32], [sg * 0.22, 1.26, -0.46]], 0.022, M.rubber, 'harness_neckTrunk_' + s, 4);
    hose(harness, [[sg * 0.15, 0.78, 0.22], [sg * 0.26, 0.70, 0.24], [sg * 0.33, 0.66, 0.12],
    [sg * 0.35, 0.70, -0.06], [sg * 0.30, 0.80, -0.16]], 0.012, M.rubber, 'harness_crownFeed_' + s, 4);
  }
  hose(harness, [[0.20, 0.66, 0.20], [0.26, 0.72, 0.10], [0.30, 0.86, -0.02], [0.26, 0.96, -0.10]], 0.014, M.rubber, 'harness_siphonFeed', 3);
  hose(harness, [[0.14, 0.60, 0.26], [0.24, 0.62, 0.22], [0.31, 0.74, 0.10], [0.24, 0.90, 0.02]], 0.009, M.rubber, 'harness_siphonReturn', 3);

  // ══════════════ PASS 7 — GREEBLES ════════════════════════════════════════
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * TAU;
    const b = mesh(mantle, boltG, M.steel, '', Math.cos(a) * 0.30, 0.02 + Math.sin(a) * 0.28, 0.06);
    b.rotation.z = a; b.scale.setScalar(0.9);
  }
  for (let i = 0; i < 10; i++) {
    const t = 0.1 + i * 0.09;
    const p = spineOff(t, (i % 2 ? 1 : -1) * (0.8 + (i % 3) * 0.3), 0.012);
    const bx = mesh(mantle, ex(poly(rrectPts(0.035 + (i % 3) * 0.008, 0.026)), 0.018, 0.003), M.machL, '', p.x, p.y, p.z);
    bx.quaternion.setFromUnitVectors(V3(0, 0, 1), p.clone().sub(spine.getPointAt(t)).normalize());
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + 0.2;
    mesh(crown, ex(poly(rrectPts(0.03, 0.022)), 0.014, 0.002), M.machL, '', Math.sin(a) * 0.30, 0.085, Math.cos(a) * 0.30).rotation.set(PI / 2, 0, -a);
  }

  // ═══════════════════════════ POSE ════════════════════════════════════════
  const restMantle = mantle.rotation.clone();
  const restBeakU = beakU.rotation.x, restBeakL = beakL2.rotation.x;
  const restSiphon = siphon.rotation.clone();
  const restSkull = skull.rotation.clone();

  root.userData.pose = (s) => {
    s = s || {};
    const t = s.t || 0;
    const speed = Math.max(0, s.speed || 0);
    const stride = s.stride || 0;
    const turn = Math.max(-1, Math.min(1, s.turn || 0));
    const grounded = s.grounded !== false;
    const health = (s.health === undefined || s.health === null) ? 1 : s.health;
    const act = s.action || null;
    const ph = clamp01(s.phase || 0);
    const hurt = clamp01(1 - health);

    let bY = 0, bZ = 0, bX = 0, bPitch = 0, bRoll = 0;
    let mSc = 1, mZ = 1, mPitch = 0, mYaw = 0, mRoll = 0;
    let sPitch = 0, sYaw = 0, sRoll = 0, cPitch = 0, cYaw = 0;
    let beakOpen = 0.05, lid = 0, shellOpen = 0, sAim = 0, sPunch = 0, dead = 0;
    const aP = new Array(8).fill(0), aYw = new Array(8).fill(0), aRl = new Array(8).fill(0);
    const aC = new Array(8).fill(0), aT = new Array(8).fill(0), aS = new Array(8).fill(1);
    const aW = new Array(8).fill(0), aPh = new Array(8).fill(0), aL = new Array(8).fill(0);

    const swim = clamp01((speed - 1.6) / 1.3);
    const crawlW = (1 - swim) * (grounded ? 1 : 0);
    const fast = clamp01((speed - 3.0) / 3.0);
    const moving = clamp01(speed / 0.2);

    // ---- crawl: a metachronal wave round the eight arms, driven by stride ----
    if (crawlW > 0.001 && moving > 0.001) {
      const low = clamp01((1.15 - speed) / 1.15);
      const amp = (0.13 + 0.30 * Math.min(speed, 2.2) / 2.2) * crawlW * moving;
      bY -= 0.055 * low * crawlW * moving;
      bPitch += 0.05 * low * crawlW * moving;
      for (let i = 0; i < 8; i++) {
        let p = (stride + ARMPH[i]) % 1; if (p < 0) p += 1;
        const sw = p < 0.40;
        const swT = clamp01(p / 0.40), stT = clamp01((p - 0.40) / 0.60);
        const sweep = sw ? lerp(-amp, amp, sstep(0, 1, swT)) : lerp(amp, -amp, stT);
        const lift = sw ? Math.sin(PI * swT) : 0;
        aP[i] += -sweep * 0.60 - lift * 0.42 * crawlW;
        aC[i] += (lift * 0.34 - stT * 0.06 + low * 0.20) * crawlW;
        aT[i] += lift * 0.40 * crawlW;
        aL[i] += sweep * 0.22 * LSIGN[i];
        aYw[i] += SIDE[i] * 0.09 * low * crawlW;
        aW[i] += 0.045 * crawlW;
        aPh[i] += stride * TAU + i * 0.8;
      }
    }
    // ---- swim: the arms gather forward into a bundle and undulate ----
    if (swim > 0.001 && grounded !== false) {
      for (let i = 0; i < 8; i++) {
        aP[i] += (-ARMP[i] * 0.62 + 0.10) * swim;
        aYw[i] += -ARMY[i] * 0.50 * swim;
        aS[i] *= 1 - 0.62 * swim;
        aC[i] += -0.10 * swim;
        aW[i] += (0.10 + 0.13 * fast) * swim;
        aPh[i] += stride * TAU * 1.7 + i * 0.55 + t * 0.8;
      }
      bY += 0.11 * swim + 0.07 * fast;
      bPitch += -0.10 * swim - 0.06 * fast;
      mZ += 0.07 * swim; mSc -= 0.035 * swim;
      mPitch += -0.10 * swim;
      const jet = Math.pow(Math.max(0, Math.sin(stride * TAU * 2)), 3);
      mSc -= jet * 0.055 * swim; sAim += 0.35 * swim; sPunch += jet * swim;
      sPitch += -0.10 * swim;
    }
    // ---- turn overlay ----
    if (turn !== 0) {
      const a = Math.abs(turn), inSide = turn < 0 ? -1 : 1;
      sYaw += turn * 0.42; sRoll += -turn * 0.18;
      mYaw += turn * 0.16; mRoll += -turn * 0.22;
      bRoll += -turn * 0.17; cYaw += turn * 0.12;
      sAim += a * 0.2;
      for (let i = 0; i < 8; i++) {
        if (SIDE[i] * inSide > 0) { aC[i] += 0.30 * a; aP[i] += 0.12 * a; aT[i] += 0.2 * a; }
        else { aC[i] -= 0.12 * a; aYw[i] += SIDE[i] * 0.16 * a; aS[i] *= 1 - 0.12 * a; }
      }
    }
    // ---- airborne: the arms stop walking and trail ----
    if (!grounded) {
      for (let i = 0; i < 8; i++) {
        aP[i] += 0.34; aYw[i] += -ARMY[i] * 0.22;
        aC[i] += 0.16 + 0.08 * Math.sin(t * 1.7 + i * 0.8);
        aS[i] *= 0.84; aW[i] += 0.07; aPh[i] += t * 1.7 + i * 0.9;
        aT[i] += 0.22;
      }
      bPitch += 0.10; mPitch += -0.06; mZ += 0.02;
      sPitch += -0.06;
    }
    // ---- hurt: one side goes slack ----
    if (hurt > 0.01) {
      const h = hurt;
      bRoll += 0.17 * h; bPitch += 0.08 * h; bY -= 0.05 * h;
      sPitch += 0.22 * h; sRoll += 0.15 * h;
      mRoll += 0.13 * h; mSc -= 0.035 * h; mPitch += 0.08 * h;
      for (let i = 0; i < 8; i++) {
        if (SIDE[i] < 0) { aC[i] += 0.32 * h; aP[i] += 0.24 * h; aS[i] *= 1 - 0.35 * h; aW[i] += 0.03 * h; }
        else aC[i] += 0.07 * h;
        aC[i] += Math.sin(t * 8.5 + i) * 0.018 * h;
      }
      lid = Math.max(lid, 0.5 * h);
    }

    // ---- actions ----
    if (act === 'attack') {
      const wind = sstep(0, 0.28, ph) * (1 - sstep(0.30, 0.46, ph));
      const str = sstep(0.30, 0.50, ph) * (1 - sstep(0.62, 1.0, ph));
      bZ += -0.13 * wind + 0.26 * str; bY += 0.06 * wind - 0.05 * str;
      bPitch += -0.13 * wind + 0.22 * str;
      cPitch += 0.10 * str; sPitch += -0.12 * wind + 0.20 * str;
      mSc += 0.05 * wind - 0.06 * str; mPitch += -0.10 * wind + 0.12 * str;
      beakOpen += 0.9 * wind + 0.85 * str * (1 - sstep(0.36, 0.50, ph));
      for (let i = 0; i < 8; i++) {
        const f = Math.max(0, Math.cos(ARMY[i])), r = Math.max(0, -Math.cos(ARMY[i]));
        aP[i] += -0.60 * f * wind - 0.32 * f * str + 0.14 * r * str;
        aC[i] += 0.60 * f * wind - 0.62 * f * str + 0.26 * r * str;
        aS[i] *= 1 - 0.45 * f * str;
        aYw[i] += -ARMY[i] * 0.26 * f * str;
        aT[i] += 0.55 * f * wind - 0.35 * f * str;
      }
    } else if (act === 'fire') {
      const aim = sstep(0, 0.38, ph) * (1 - sstep(0.42, 0.60, ph));
      const shot = sstep(0.40, 0.48, ph) * (1 - sstep(0.52, 0.86, ph));
      mSc += 0.10 * aim - 0.17 * shot; mZ += 0.05 * aim - 0.10 * shot;
      sAim += 1.0 * sstep(0, 0.35, ph) * (1 - 0.35 * sstep(0.7, 1, ph)); sPunch += shot;
      bZ += -0.06 * shot; bPitch += -0.06 * aim + 0.11 * shot; bY += 0.02 * aim;
      sPitch += -0.06 * aim + 0.05 * shot; cPitch += -0.04 * aim + 0.06 * shot;
      for (let i = 0; i < 8; i++) {
        aP[i] += 0.15 * aim; aC[i] += 0.20 * aim + 0.12 * shot;
        aYw[i] += SIDE[i] * 0.11 * aim; aT[i] += 0.25 * aim;
      }
    } else if (act === 'hit') {
      const e = Math.exp(-ph * 6.0), j = Math.sin(ph * 21) * e;
      bZ += -0.15 * e + 0.03 * j; bX += 0.05 * j; bRoll += 0.14 * e + 0.06 * j; bPitch += 0.10 * e;
      sPitch += 0.28 * e; sYaw += 0.20 * j; mSc -= 0.10 * e; mRoll += 0.13 * e;
      for (let i = 0; i < 8; i++) { aC[i] += 0.44 * e + 0.06 * j; aP[i] += 0.18 * e; aT[i] += 0.38 * e; }
      lid = Math.max(lid, 0.8 * e); beakOpen += 0.5 * e;
    } else if (act === 'block') {
      const b = sstep(0, 0.22, ph) * (1 - sstep(0.80, 1, ph));
      bY -= 0.11 * b; bZ -= 0.11 * b; bPitch += 0.17 * b;
      sPitch += 0.30 * b; cPitch += -0.10 * b; mPitch += 0.14 * b; mSc -= 0.02 * b;
      for (let i = 0; i < 8; i++) {
        const f = Math.max(0, Math.cos(ARMY[i]));
        aP[i] += -0.80 * f * b + 0.16 * (1 - f) * b;
        aC[i] += 0.60 * f * b + 0.18 * (1 - f) * b;
        aYw[i] += -ARMY[i] * 0.32 * f * b;
        aT[i] += 0.55 * f * b;
      }
    } else if (act === 'gather' || act === 'deposit') {
      const rev = act === 'deposit';
      const q = rev ? 1 - ph : ph;
      const down = sstep(0, 0.35, q) * (1 - sstep(0.60, 0.90, q));
      const close = sstep(0.35, 0.58, q) * (1 - sstep(0.82, 1, q));
      const up = sstep(0.62, 1.0, q);
      bY += -0.13 * down + 0.05 * up; bPitch += 0.17 * down - 0.05 * up;
      sPitch += 0.32 * down - 0.10 * up; beakOpen += 0.35 * close + 0.18 * up;
      for (let i = 0; i < 8; i++) {
        const f = Math.max(0, Math.cos(ARMY[i]));
        aP[i] += 0.55 * f * down - 0.35 * f * up;
        aC[i] += -0.22 * f * down + 0.75 * f * close + 0.55 * f * up;
        aT[i] += 0.85 * f * close + 0.65 * f * up;
        aYw[i] += -ARMY[i] * 0.20 * f * (down + close) * 0.5;
      }
    } else if (act === 'eat') {
      const dn = sstep(0, 0.18, ph) * (1 - sstep(0.82, 1, ph));
      const chew = Math.sin(ph * TAU * 3);
      sPitch += 0.42 * dn; bY -= 0.11 * dn; bPitch += 0.13 * dn; cPitch += 0.10 * dn;
      beakOpen += dn * (0.45 + 0.45 * chew); mSc += 0.02 * chew * dn;
      for (let i = 0; i < 8; i++) {
        const f = Math.max(0, Math.cos(ARMY[i]));
        aP[i] += 0.36 * f * dn; aC[i] += (0.55 + 0.20 * chew) * f * dn; aT[i] += 0.65 * f * dn;
      }
    } else if (act === 'drink') {
      const dn = sstep(0, 0.22, ph) * (1 - sstep(0.80, 1, ph));
      sPitch += 0.50 * dn; bY -= 0.15 * dn; bPitch += 0.17 * dn;
      beakOpen += 0.16 * dn; sAim += 0.25 * dn; lid = Math.max(lid, 0.25 * dn);
      for (let i = 0; i < 8; i++) {
        aP[i] += 0.28 * Math.max(0, Math.cos(ARMY[i])) * dn;
        aC[i] += 0.24 * dn; aYw[i] += SIDE[i] * 0.13 * dn;
      }
    } else if (act === 'jump') {
      const cr = sstep(0, 0.30, ph) * (1 - sstep(0.34, 0.54, ph));
      const ext = sstep(0.34, 0.68, ph);
      bY += -0.23 * cr + 0.44 * ext; bPitch += 0.11 * cr - 0.18 * ext;
      mSc += -0.05 * cr + 0.08 * ext; mZ += 0.05 * ext; sPitch += 0.18 * cr - 0.24 * ext;
      for (let i = 0; i < 8; i++) {
        aC[i] += 0.72 * cr - 0.55 * ext; aP[i] += 0.26 * cr - 0.48 * ext;
        aS[i] *= 1 - 0.5 * ext; aT[i] += 0.5 * cr - 0.3 * ext;
      }
    } else if (act === 'land') {
      const rc = 1 - sstep(0, 0.30, ph);
      const cmp = sstep(0.22, 0.46, ph) * (1 - sstep(0.58, 0.88, ph));
      bY += 0.30 * rc - 0.25 * cmp; bPitch += -0.15 * rc + 0.16 * cmp;
      mSc += -0.06 * cmp; sPitch += 0.20 * cmp;
      for (let i = 0; i < 8; i++) {
        aP[i] += 0.44 * rc - 0.32 * cmp; aC[i] += -0.36 * rc + 0.56 * cmp;
        aYw[i] += SIDE[i] * 0.19 * cmp; aS[i] *= 1 - 0.3 * rc; aT[i] += 0.3 * cmp;
      }
    } else if (act === 'signal') {
      const rise = sstep(0, 0.32, ph) * (1 - sstep(0.72, 1.0, ph));
      const hold = sstep(0.32, 0.46, ph) * (1 - sstep(0.68, 0.94, ph));
      bY += 0.26 * rise; bPitch += -0.21 * rise;
      mSc += 0.14 * rise; mZ += 0.06 * rise; mPitch += -0.16 * rise;
      sPitch += -0.26 * rise; beakOpen += 0.78 * hold; shellOpen += 0.28 * hold;
      lid -= 0.25 * rise;
      for (let i = 0; i < 8; i++) {
        aP[i] += -0.90 * rise; aYw[i] += SIDE[i] * 0.24 * rise;
        aC[i] += -0.36 * rise + Math.sin(t * 6 + i) * 0.05 * hold;
        aS[i] *= 1 - 0.38 * rise; aT[i] += 0.55 * rise;
      }
    } else if (act === 'sleep' || act === 'wake') {
      const g = act === 'sleep' ? sstep(0, 0.72, ph) : 1 - sstep(0.12, 0.95, ph);
      const stir = act === 'wake' ? Math.sin(ph * PI * 4) * Math.exp(-ph * 5) * 0.10 : Math.sin(ph * PI * 2) * Math.exp(-ph * 3) * 0.04;
      dead = act === 'sleep' ? g : 0;
      bY -= 0.30 * g; bPitch += 0.11 * g + stir * 0.2; bRoll += 0.06 * g;
      mSc -= 0.06 * g; mPitch += 0.17 * g; sPitch += 0.30 * g;
      lid = Math.max(lid, g); beakOpen *= (1 - g);
      for (let i = 0; i < 8; i++) {
        aC[i] += 0.95 * g + stir * (i % 2 ? 1 : -1);
        aP[i] += 0.30 * g; aT[i] += 0.9 * g; aYw[i] += -ARMY[i] * 0.26 * g;
      }
    } else if (act === 'die') {
      const d = sstep(0, 0.62, ph), f = sstep(0.32, 1.0, ph);
      const tw = Math.exp(-ph * 8) * Math.sin(ph * 38) * 0.12;
      dead = d;
      bY -= 0.52 * d; bRoll += 0.62 * f + tw * 0.4; bPitch += 0.22 * d; bZ -= 0.06 * d;
      mSc -= 0.13 * f; mPitch += 0.24 * d; mRoll += 0.26 * f;
      sPitch += 0.44 * d; sRoll += 0.30 * f;
      lid = Math.max(lid, f); beakOpen += 0.25 * f;
      for (let i = 0; i < 8; i++) {
        aS[i] *= 1 - 0.55 * d;
        aC[i] += -0.14 * d + tw * (i % 2 ? 1 : -1) * 2.0;
        aYw[i] += SIDE[i] * 0.22 * d; aP[i] += 0.10 * d;
        aT[i] += 0.30 * f; aW[i] += 0.02 * (1 - f);
      }
    } else if (act === 'evolve') {
      const br = sstep(0, 0.22, ph) * (1 - sstep(0.26, 0.42, ph));
      const op = sstep(0.24, 0.50, ph) * (1 - sstep(0.72, 0.96, ph));
      bY += -0.10 * br + 0.09 * op; bPitch += 0.12 * br - 0.08 * op;
      mSc += -0.05 * br + 0.11 * op; mZ += 0.05 * op;
      shellOpen += op; sPitch += 0.16 * br - 0.14 * op; beakOpen += 0.5 * op;
      for (let i = 0; i < 8; i++) {
        aC[i] += 0.55 * br - 0.30 * op; aP[i] += 0.22 * br - 0.45 * op;
        aYw[i] += SIDE[i] * 0.20 * op; aT[i] += 0.4 * br;
        aW[i] += 0.05 * op; aPh[i] += t * 5 + i;
      }
    }

    // ---- idle hardware: always breathing unless it is down for good ----
    const live = 1 - dead;
    const idle = clamp01(1 - speed / 0.4) * live;
    const br = Math.sin(t * 0.9);
    mSc += br * 0.018 * (0.35 + 0.65 * idle) * live;
    mZ += Math.sin(t * 0.9 + 0.6) * 0.022 * (0.35 + 0.65 * idle) * live;
    sYaw += Math.sin(t * 0.31) * 0.16 * idle;
    sPitch += Math.sin(t * 0.44 + 1.1) * 0.07 * idle + 0.03 * br * live;
    bY += br * 0.008 * live;
    cYaw += Math.sin(t * 0.27 + 2.0) * 0.05 * idle;
    for (let i = 0; i < 8; i++) {
      aW[i] += 0.030 * idle + 0.012 * live;
      aPh[i] += t * (0.55 + i * 0.04) + i * 0.9;
      aC[i] += Math.sin(t * 0.5 + i * 1.3) * 0.035 * idle;
      aT[i] += Math.sin(t * 0.7 + i * 2.1) * 0.06 * idle;
    }
    const blink = Math.pow(Math.max(0, Math.sin(t * 0.63)), 60) * live;
    lid = Math.max(lid, blink);

    // ---- write the whole pose ----
    body.position.set(bX, bY, bZ);
    body.rotation.set(bPitch, 0, bRoll);
    mantle.rotation.set(restMantle.x + mPitch, restMantle.y + mYaw, restMantle.z + mRoll);
    mantle.scale.set(mSc, mSc, mZ);
    skull.rotation.set(restSkull.x + sPitch, restSkull.y + sYaw, restSkull.z + sRoll);
    crown.rotation.set(cPitch, cYaw, 0);
    beakU.rotation.x = restBeakU - beakOpen * 0.5;
    beakL2.rotation.x = restBeakL + beakOpen * 0.75;
    siphon.rotation.set(restSiphon.x - sAim * 0.42, restSiphon.y - sAim * 0.12, restSiphon.z);
    siphonNoz.position.z = 0.175 + sPunch * 0.03;
    siphonNoz.scale.setScalar(1 + sPunch * 0.18);
    for (let e = 0; e < 2; e++) {
      const E = eyes[e];
      E.lu.rotation.x = E.ruX + lid * 0.66;
      E.ll.rotation.x = E.rlX - lid * 0.58;
    }
    for (let i = 0; i < mShells.length; i++) {
      const sh = mShells[i];
      sh.hinge.rotation.set(sh.rest.x + shellOpen * 0.16, sh.rest.y + shellOpen * sh.sign * 0.34, sh.rest.z + shellOpen * sh.sign * 0.10);
    }
    for (let r = 0; r < mantleRams.length; r++) mantleRams[r].rod.position.z = 0.52 * 0.3 + (1 - mSc) * 0.42;

    for (let i = 0; i < 8; i++) {
      const A = arms[i];
      A.mount.rotation.set(A.rm.x + aP[i] + (aS[i] - 1) * A.rm.x * 0.5, A.rm.y + aYw[i], A.rm.z + aRl[i]);
      const n = A.segs.length;
      for (let k = 0; k < n; k++) {
        const r = A.rs[k], w = k / (n - 1);
        const wave = Math.sin(aPh[i] - k * 0.85) * aW[i] * (0.35 + 0.95 * w);
        const curl = aC[i] * (0.25 + 1.15 * w) + aT[i] * Math.max(0, w - 0.5) * 2.2;
        A.segs[k].rotation.set(r.x * aS[i] + curl + wave, r.y + aL[i] * (0.3 + 0.9 * w), r.z);
      }
      for (let k = 0; k < 3; k++) {
        A.tips[k].rotation.x = A.tr[k] + aT[i] * 0.55 + aC[i] * 0.35 + Math.sin(aPh[i] - (n + k) * 0.85) * aW[i] * 1.1;
      }
    }
  };

  root.userData.pose({ t: 0, dt: 0, speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0 });
  return root;
}