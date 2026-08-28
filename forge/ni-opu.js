function build(THREE, TSL) {
  // ===== ONE QUALITY: ENDURANCE AND ARMOUR =====
  /* BRIEF — an armoured octopus, built as hardware.
   * Stance: mass low and BACK. A plated mantle bulb (the widest, deepest volume on the body,
   *   0.58 half-width against a 0.20 arm radius) carried above and behind the eye block, its tip
   *   drooping aft; the whole weight slung on eight arms splaying off a bearing crown under the brow.
   * Head: ONE short rigid faceted wedge, about a shoulder wide, one head-length of neck collar,
   *   brow plate with a cut vent over two big gimballed eye pods set high on the sides; dark
   *   slit-pupil glass sunk in stepped bezels under pressed hoods. No accent colour anywhere on it.
   * Beak: at the centre of the arm crown — two hooked machined halves, the lower on a visible ram.
   * Shells: three lapped dorsal plates down the mantle (front laps over rear), two flank plates, a
   *   ventral plate, cheek plates, and one lapped pauldron over the base of every arm.
   * Arms: 7 machined links each, tapering 0.20 -> 0.03, bearing race + bolt ring at every joint,
   *   two rows of turned suckers underneath, hook tip; shells on the inner four links only.
   * Cable: trunk lines out of a port ring at the neck collar, down the mantle flanks into the tip
   *   port; every arm run lives inside ONE link and lands in a clamp collar at the joint.
   * Expensive bit: the siphon funnel on the right flank — lathed nozzle on a rubber bellows.
   */

  const { Fn, vec3, float, positionLocal, normalLocal, sin, mix, smoothstep, max, clamp, oneMinus, pow } = TSL;

  const C = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const ZAX = new THREE.Vector3(0, 0, 1);

  // ---------------- shaders: wear that follows the form ----------------
  const wig = Fn(([p]) => {
    const a = sin(p.x.mul(3.1).add(sin(p.y.mul(2.2)).mul(1.3)));
    const b = sin(p.y.mul(4.1).sub(sin(p.z.mul(3.3)).mul(1.1)));
    const c = sin(p.z.mul(2.7).add(sin(p.x.mul(4.7)).mul(0.9)));
    return a.add(b).add(c).mul(0.3333);
  });
  const fbm = Fn(([p]) => wig(p).mul(0.55)
    .add(wig(p.mul(2.7).add(vec3(1.3, 4.1, 2.2))).mul(0.30))
    .add(wig(p.mul(6.1).add(vec3(7.7, 2.1, 5.5))).mul(0.15)));

  const edgeMask = () => {
    const n = normalLocal;
    const m = max(max(n.x.abs(), n.y.abs()), n.z.abs());
    return smoothstep(float(0.99), float(0.72), m);
  };

  function wearNodes(seed) {
    const p = positionLocal.mul(2.4).add(vec3(seed * 1.7, seed * 0.9, seed * 2.3));
    const g = fbm(p).mul(0.5).add(0.5);
    const em = edgeMask();
    const ny = normalLocal.y;
    const down = oneMinus(smoothstep(float(-0.6), float(0.3), ny));
    const up = smoothstep(float(0.15), float(0.95), ny);
    const streak = fbm(vec3(positionLocal.x.mul(13.0).add(seed), positionLocal.y.mul(1.5), positionLocal.z.mul(13.0))).mul(0.5).add(0.5);
    const chip = clamp(em.mul(smoothstep(float(0.30), float(0.85), g)).mul(1.7), float(0), float(1));
    const rust = clamp(pow(streak, float(3.2)).mul(em.mul(0.9).add(0.22)).mul(2.2), float(0), float(1));
    return { g, em, down, up, chip, rust };
  }

  function paintMat(hex, seed, dbl) {
    const m = new THREE.MeshStandardNodeMaterial();
    if (dbl) m.side = THREE.DoubleSide;
    const w = wearNodes(seed);
    let col = mix(C(hex), C(0xC9C2B4), w.g.mul(0.5));
    col = mix(col, C(0xB5AC9C), w.em.mul(0.55));
    col = mix(col, C(0x6B665E), w.chip.mul(0.75));
    col = mix(col, C(0x4A4238), w.rust.mul(0.5));
    col = col.mul(oneMinus(w.down.mul(0.38).mul(w.g.mul(0.4).add(0.6))));
    col = mix(col, col.mul(1.10), w.up.mul(0.6));
    m.colorNode = col;
    m.roughnessNode = clamp(float(0.56).add(w.up.mul(0.13)).add(w.down.mul(0.16)).sub(w.chip.mul(0.14)), float(0.34), float(1));
    m.metalnessNode = clamp(float(0.08).add(w.chip.mul(0.5)), float(0), float(1));
    return m;
  }
  function metalMat(hex, seed, dbl) {
    const m = new THREE.MeshStandardNodeMaterial();
    if (dbl) m.side = THREE.DoubleSide;
    const w = wearNodes(seed);
    let col = mix(C(hex), C(0x3E3A34), w.g.mul(0.55));
    col = mix(col, C(0x6B665E), w.em.mul(0.42).add(w.chip.mul(0.35)));
    col = mix(col, C(0x4A4238), w.rust.mul(0.6));
    col = col.mul(oneMinus(w.down.mul(0.30)));
    m.colorNode = col;
    m.roughnessNode = clamp(float(0.52).add(w.up.mul(0.16)).add(w.down.mul(0.12)).sub(w.chip.mul(0.10)), float(0.36), float(1));
    m.metalnessNode = clamp(float(0.82).sub(w.rust.mul(0.35)), float(0.2), float(1));
    return m;
  }

  const M = {
    shellA: paintMat(0xD8D2C6, 1.0, true),
    shellB: paintMat(0xC9C2B4, 2.4, true),
    shellC: paintMat(0xB5AC9C, 5.1, true),
    accent: paintMat(0xC2521E, 8.3, true),
    metal: metalMat(0x55524C, 0.4, true),
    metalLite: metalMat(0x6B665E, 3.3, true),
    steel: metalMat(0x3E3A34, 7.7, true),
    bronze: metalMat(0x4A4238, 11.2, true),
    rubber: new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0x1E1D1B), roughness: 0.94, metalness: 0.0 }),
    lens: new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0x090A0C), roughness: 0.08, metalness: 0.1 })
  };
  const glowA = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0x14181A), roughness: 0.4, metalness: 0.1 });
  glowA.emissiveNode = C(0x2E7C86).mul(1.6);
  const glowB = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0x1A1512), roughness: 0.4, metalness: 0.1 });
  glowB.emissiveNode = C(0x8A5A18).mul(1.5);

  // ---------------- geometry helpers ----------------
  function cylZc(rt, rb, len, seg, open, ts, tl) {
    const g = new THREE.CylinderGeometry(rt, rb, len, seg || 8, 1, !!open, ts, tl);
    g.rotateX(Math.PI / 2); return g;
  }
  function cylZ(rt, rb, len, seg, open, ts, tl) {
    const g = cylZc(rt, rb, len, seg, open, ts, tl); g.translate(0, 0, len / 2); return g;
  }
  function latheZ(pts, seg) {
    const g = new THREE.LatheGeometry(pts.map(a => V2(a[0], a[1])), seg || 14);
    g.rotateX(Math.PI / 2); return g;
  }
  function torZ(r, t, rs, ts, arc) { return new THREE.TorusGeometry(r, t, rs || 5, ts || 18, arc || Math.PI * 2); }
  function plateGeo(pts, depth, bevel, holes) {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]); else sh.lineTo(p[0], p[1]);
    }
    if (holes) holes.forEach(h => {
      const pa = new THREE.Path(); pa.moveTo(h[0][0], h[0][1]);
      for (let i = 1; i < h.length; i++) pa.lineTo(h[i][0], h[i][1]);
      sh.holes.push(pa);
    });
    return new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: true, bevelSize: bevel || 0.010, bevelThickness: bevel || 0.010, bevelSegments: 2, curveSegments: 6 });
  }
  function mesh(parent, geo, mat, name, pos, rot, scl) {
    const m = new THREE.Mesh(geo, mat);
    if (name) m.name = name;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl !== undefined) { if (typeof scl === 'number') m.scale.setScalar(scl); else m.scale.set(scl[0], scl[1], scl[2]); }
    parent.add(m); return m;
  }
  function orient(obj, dir) { obj.quaternion.setFromUnitVectors(ZAX, dir.clone().normalize()); }

  const GEO = {
    bolt: (() => { const g = new THREE.CylinderGeometry(0.017, 0.023, 0.020, 6); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.008); return g; })(),
    link: torZ(0.026, 0.0085, 5, 9),
    sprocket: cylZc(0.052, 0.052, 0.026, 11),
    sprocketHub: cylZc(0.019, 0.019, 0.052, 6),
    sucker: latheZ([[0.0, 0], [0.052, 0.004], [0.060, 0.020], [0.048, 0.032], [0.030, 0.036], [0.026, 0.016]], 12),
    suckerIn: cylZ(0.030, 0.036, 0.014, 10),
    port: latheZ([[0.0, 0], [0.050, 0.0], [0.055, 0.016], [0.040, 0.024], [0.038, 0.046], [0.030, 0.050]], 10),
    clampRing: torZ(1, 0.11, 4, 10),
    corr: torZ(1, 0.30, 4, 8),
    block: (() => { const g = new THREE.BoxGeometry(1, 1, 1); return g; })()
  };

  function boltRing(parent, count, radius, z, s, phase, span, mat) {
    span = (span === undefined) ? Math.PI * 2 : span;
    for (let i = 0; i < count; i++) {
      const a = (phase || 0) + span * (span >= 6.2 ? i / count : i / Math.max(1, count - 1));
      const m = new THREE.Mesh(GEO.bolt, mat || M.steel);
      m.position.set(Math.cos(a) * radius, Math.sin(a) * radius, z || 0);
      m.scale.setScalar(s || 1); parent.add(m);
    }
  }
  function boltArc(parent, count, radius, z0, z1, angle, s, mat) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const m = new THREE.Mesh(GEO.bolt, mat || M.steel);
      const dx = Math.cos(angle) * radius, dy = Math.sin(angle) * radius;
      m.position.set(dx, dy, z0 + (z1 - z0) * t);
      orient(m, new THREE.Vector3(dx, dy, 0));
      m.scale.setScalar(s || 1); parent.add(m);
    }
  }
  function port(parent, pos, dir, r, mat) {
    const m = new THREE.Mesh(GEO.port, mat || M.metalLite);
    m.position.copy(pos); orient(m, dir); m.scale.setScalar(Math.max(0.35, (r * 2.4) / 0.055));
    parent.add(m); return m;
  }
  function hose(parent, ptsArr, r, mat, name, corr) {
    const pts = ptsArr.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    const cv = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(cv, Math.max(14, pts.length * 6), r, 6, false);
    const m = new THREE.Mesh(g, mat || M.rubber); m.name = name; parent.add(m);
    port(parent, cv.getPoint(0), cv.getTangent(0).clone().negate(), r);
    port(parent, cv.getPoint(1), cv.getTangent(1), r);
    if (corr) {
      const n = 9;
      for (let i = 1; i < n; i++) {
        const u = i / n, p = cv.getPoint(u), t = cv.getTangent(u);
        const ring = new THREE.Mesh(GEO.corr, M.rubber);
        ring.position.copy(p); orient(ring, t); ring.scale.setScalar(r * 1.35);
        parent.add(ring);
      }
    } else {
      const p = cv.getPoint(0.5), t = cv.getTangent(0.5);
      const cl = new THREE.Mesh(GEO.clampRing, M.metalLite);
      cl.position.copy(p); orient(cl, t); cl.scale.setScalar(r * 1.9);
      parent.add(cl);
    }
    return m;
  }
  function chain(parent, ptsArr, n, s) {
    const cv = new THREE.CatmullRomCurve3(ptsArr.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), p = cv.getPoint(u), t = cv.getTangent(u);
      const m = new THREE.Mesh(GEO.link, M.steel);
      m.position.copy(p); orient(m, t); if (i % 2) m.rotateZ(Math.PI / 2);
      m.scale.setScalar(s || 1); parent.add(m);
    }
    [0, 1].forEach(e => {
      const p = cv.getPoint(e), t = cv.getTangent(e);
      const ax = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0));
      if (ax.lengthSq() < 1e-5) ax.set(1, 0, 0);
      const sp = new THREE.Mesh(GEO.sprocket, M.metalLite);
      sp.position.copy(p); orient(sp, ax); sp.scale.setScalar(s || 1); parent.add(sp);
      const hb = new THREE.Mesh(GEO.sprocketHub, M.bronze);
      hb.position.copy(p); orient(hb, ax); hb.scale.setScalar(s || 1); parent.add(hb);
    });
  }
  function ram(parent, name, len, r, pos, rot) {
    const g = new THREE.Group(); g.name = name;
    g.position.set(pos[0], pos[1], pos[2]); if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(g);
    mesh(g, latheZ([[0, 0], [r * 1.3, 0.005], [r * 1.3, len * 0.52], [r * 1.0, len * 0.56], [r * 1.0, len * 0.60], [r * 0.6, len * 0.60]], 10), M.metal, name + '_barrel');
    mesh(g, cylZ(r * 0.40, r * 0.40, len * 0.46, 8), M.metalLite, name + '_rod', [0, 0, len * 0.58]);
    mesh(g, torZ(r * 0.62, r * 0.18, 4, 10), M.rubber, name + '_boot', [0, 0, len * 0.60]);
    mesh(g, cylZ(r * 0.72, r * 0.52, r * 1.0, 6), M.steel, name + '_clevis', [0, 0, len * 1.02]);
    boltRing(g, 4, r * 1.08, 0.006, 0.8);
    return g;
  }
  function gearStack(parent, name, pos, dir, r, n) {
    const g = new THREE.Group(); g.name = name; g.position.set(pos[0], pos[1], pos[2]);
    orient(g, dir); parent.add(g);
    for (let i = 0; i < n; i++) {
      const rr = r * (1 - i * 0.19);
      mesh(g, cylZc(rr, rr, 0.030, 10 + i * 3), i % 2 ? M.metalLite : M.steel, name + '_disc' + i, [0, 0, 0.02 + i * 0.042]);
    }
    mesh(g, cylZ(r * 0.20, r * 0.20, 0.05 + n * 0.042, 6), M.bronze, name + '_shaft', [0, 0, -0.01]);
    mesh(g, torZ(r * 1.05, 0.018, 4, 14), M.metal, name + '_race', [0, 0, 0.018]);
    boltRing(g, 6, r * 0.80, 0.03 + n * 0.042, 0.65);
    return g;
  }

  // ---------------- registry for posing ----------------
  const posed = [];
  function reg(o) {
    o.userData._rest = { p: o.position.clone(), e: o.rotation.clone(), s: o.scale.clone() };
    posed.push(o); return o;
  }
  const openParts = [];

  // ================= PASS 1 : FRAME =================
  const root = new THREE.Group(); root.name = 'ArmouredOctopus';
  const carriage = new THREE.Group(); carriage.name = 'carriage'; root.add(carriage); reg(carriage);

  const mantle = new THREE.Group(); mantle.name = 'mantle';
  mantle.position.set(0, 0.60, 0.24); carriage.add(mantle); reg(mantle);
  const stack = new THREE.Group(); stack.name = 'mantleStack'; mantle.add(stack); reg(stack);

  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.00, 0.12),
    new THREE.Vector3(0, 0.12, -0.32),
    new THREE.Vector3(0, 0.22, -0.78),
    new THREE.Vector3(0, 0.22, -1.22),
    new THREE.Vector3(0, 0.10, -1.62),
    new THREE.Vector3(0, -0.02, -1.86)
  ]);
  const SL = spine.getLength();
  const MW = [[0, 0.42], [0.17, 0.55], [0.35, 0.58], [0.50, 0.53], [0.70, 0.40], [0.85, 0.26], [1, 0.13]];
  const MH = [[0, 0.39], [0.17, 0.48], [0.35, 0.50], [0.50, 0.45], [0.70, 0.35], [0.85, 0.23], [1, 0.11]];
  function tab(t, u) {
    for (let i = 0; i < t.length - 1; i++) if (u <= t[i + 1][0]) {
      const a = t[i], b = t[i + 1], k = (u - a[0]) / (b[0] - a[0]);
      return a[1] + (b[1] - a[1]) * k;
    }
    return t[t.length - 1][1];
  }
  const mw = u => tab(MW, u), mh = u => tab(MH, u);

  // a) stacked segment blocks down the mantle
  const hoopGeo = cylZc(1, 1, 1, 8);
  const HOOPS = [[0.03, 0.24], [0.16, 0.24], [0.31, 0.24], [0.46, 0.23], [0.61, 0.21], [0.76, 0.18], [0.90, 0.15]];
  HOOPS.forEach((h, i) => {
    const u = h[0], p = spine.getPointAt(u), t = spine.getTangentAt(u);
    const g = new THREE.Group(); g.name = 'mantle_block' + (i + 1);
    g.position.copy(p); orient(g, t); stack.add(g);
    mesh(g, hoopGeo, M.metal, 'mantle_block' + (i + 1) + '_body', [0, 0, 0], null, [mw(u), mh(u), h[1]]);
    const r = new THREE.Mesh(torZ(1, 0.045, 4, 20), M.steel);
    r.position.z = h[1] * 0.5; r.scale.set(mw(u) * 1.03, mh(u) * 1.03, 1);
    r.name = 'mantle_block' + (i + 1) + '_joint'; g.add(r);
    boltRing(g, 8, Math.min(mw(u), mh(u)) * 0.9, h[1] * 0.5 + 0.02, 0.8);
  });

  // b) the solid inner mass + hardware between the blocks
  const coreMount = new THREE.Group(); coreMount.name = 'mantle_coreMount'; coreMount.rotation.x = 0.10; stack.add(coreMount);
  const coreSpin = new THREE.Group(); coreSpin.rotation.y = Math.PI; coreMount.add(coreSpin);
  mesh(coreSpin, latheZ([[0.02, 0], [0.30, 0.03], [0.44, 0.22], [0.50, 0.60], [0.47, 1.00], [0.38, 1.35], [0.24, 1.62], [0.10, 1.80], [0.02, 1.86]], 16),
    M.steel, 'mantle_core', [0, 0, 0], null, [1.0, 0.86, 1.0]);
  mesh(coreSpin, latheZ([[0.02, 0.15], [0.26, 0.20], [0.28, 0.55], [0.20, 0.80], [0.05, 0.92]], 10), M.bronze, 'mantle_pumpMass', [0, 0.02, 0], null, [1, 0.9, 1]);

  // spine chain runs over sprockets (mantle-local, rigid)
  for (const sx of [-0.12, 0.12]) {
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const u = 0.10 + i * 0.19, p = spine.getPointAt(u);
      pts.push([sx, p.y + mh(u) * 0.92, p.z]);
    }
    chain(stack, pts, 15, 0.95);
  }
  // gear trains, rams, ducting in the gaps
  gearStack(stack, 'mantle_gearR', [0.46, 0.06, -0.18], new THREE.Vector3(1, 0.15, 0), 0.14, 4);
  gearStack(stack, 'mantle_gearL', [-0.46, 0.06, -0.18], new THREE.Vector3(-1, 0.15, 0), 0.14, 4);
  gearStack(stack, 'mantle_gearAux', [-0.34, 0.30, -0.86], new THREE.Vector3(-0.5, 1, 0), 0.10, 3);
  for (const sx of [-1, 1]) {
    ram(stack, 'mantle_ram' + (sx > 0 ? 'R1' : 'L1'), 0.52, 0.045, [sx * 0.50, -0.02, -0.30], [0, Math.PI + sx * 0.16, 0]);
    ram(stack, 'mantle_ram' + (sx > 0 ? 'R2' : 'L2'), 0.42, 0.036, [sx * 0.38, 0.24, -0.92], [0.16, Math.PI + sx * 0.18, 0]);
  }
  for (const sx of [-1, 1]) {
    mesh(stack, cylZ(0.055, 0.075, 0.55, 8), M.metalLite, 'mantle_duct' + (sx > 0 ? 'R' : 'L'), [sx * 0.30, -0.16, -0.10], [Math.PI / 2 - 0.25, sx * 0.2, 0]);
    mesh(stack, torZ(0.082, 0.02, 4, 12), M.metal, null, [sx * 0.30, -0.16, -0.10]);
  }
  // asymmetric bolt-on module (deliberate, one only)
  const modu = new THREE.Group(); modu.name = 'mantle_auxModule'; modu.position.set(-0.30, 0.30, -1.05); modu.rotation.set(0.2, -0.3, 0); stack.add(modu);
  mesh(modu, plateGeo([[-0.12, -0.09], [0.12, -0.09], [0.14, 0.0, 0.10, 0.09], [-0.10, 0.09], [-0.12, -0.09]], 0.10, 0.012, [[[-0.05, -0.04], [0.05, -0.04], [0.05, 0.02], [-0.05, 0.02]]]), M.shellB, 'mantle_auxModule_cover');
  mesh(modu, cylZ(0.05, 0.06, 0.10, 6), M.metal, 'mantle_auxModule_can', [0, 0, -0.09]);
  boltRing(modu, 6, 0.11, 0.10, 0.8);

  // ================= PASS 5 (mantle shells) =================
  function spineShell(name, u0, u1, ts, tl, rs, mat, out) {
    const um = (u0 + u1) / 2, p = spine.getPointAt(um), t = spine.getTangentAt(um);
    const len = SL * (u1 - u0);
    const wA = mw(u0) * rs, hA = mh(u0) * rs, wB = mw(u1) * rs, hB = mh(u1) * rs;
    const ratio = ((wB / wA) + (hB / hA)) * 0.5;
    const g = new THREE.Group(); g.name = name; g.position.copy(p); orient(g, t); stack.add(g);
    mesh(g, cylZc(ratio, 1, len, 22, true, ts, tl), mat, name + '_skin', [0, 0, 0], null, [wA, hA, 1]);
    const lip = new THREE.Mesh(torZ(1, 0.026, 4, 20, tl), mat);
    lip.position.z = -len * 0.5; lip.rotation.z = ts - Math.PI / 2; lip.scale.set(wA * 1.01, hA * 1.01, 1);
    lip.name = name + '_lip'; g.add(lip);
    const lip2 = new THREE.Mesh(torZ(1, 0.020, 4, 20, tl), M.shellC);
    lip2.position.z = len * 0.5; lip2.rotation.z = ts - Math.PI / 2; lip2.scale.set(wB * 1.01, hB * 1.01, 1);
    lip2.name = name + '_lipRear'; g.add(lip2);
    mesh(g, cylZc(ratio, 1, len * 0.90, 10, true, ts + tl * 0.5 - 0.15, 0.30), M.shellC, name + '_rib', [0, 0, 0], null, [wA * 1.05, hA * 1.05, 1]);
    for (const e of [ts + 0.07, ts + tl - 0.07]) {
      for (let i = 0; i < 5; i++) {
        const z = -len * 0.4 + len * 0.8 * (i / 4);
        const dx = Math.sin(e) * wA * 1.03, dy = -Math.cos(e) * hA * 1.03;
        const b = new THREE.Mesh(GEO.bolt, M.steel);
        b.position.set(dx, dy, z); orient(b, new THREE.Vector3(dx, dy, 0)); b.scale.setScalar(0.85); g.add(b);
      }
    }
    openParts.push({ node: g, dir: new THREE.Vector3(out[0], out[1], out[2]) });
    reg(g); return g;
  }
  const dorsF = spineShell('mantle_shellDorsalFront', 0.02, 0.34, Math.PI - 1.55, 3.10, 1.10, M.shellA, [0, 1, 0]);
  const dorsM = spineShell('mantle_shellDorsalMid', 0.30, 0.60, Math.PI - 1.40, 2.80, 1.06, M.shellB, [0, 1, 0]);
  spineShell('mantle_shellDorsalRear', 0.56, 0.87, Math.PI - 1.22, 2.44, 1.02, M.shellA, [0, 1, 0]);
  spineShell('mantle_shellFlankR', 0.12, 0.52, Math.PI / 2 - 0.50, 1.00, 1.13, M.shellB, [1, 0, 0]);
  spineShell('mantle_shellFlankL', 0.12, 0.52, -Math.PI / 2 - 0.50, 1.00, 1.13, M.shellB, [-1, 0, 0]);
  spineShell('mantle_shellVentral', 0.10, 0.44, -0.55, 1.10, 1.05, M.shellC, [0, -1, 0]);
  // stencil glyphs + the few accent plates
  mesh(dorsF, plateGeo([[-0.05, 0], [0.05, 0], [0, 0.08], [-0.05, 0]], 0.008, 0.004), M.steel, 'mantle_glyphTri', [0.16, 0.50, -0.06], [-Math.PI / 2, 0, 0.2]);
  mesh(dorsM, plateGeo([[-0.09, -0.02], [0.09, -0.02], [0.09, 0.02], [-0.09, 0.02]], 0.008, 0.004), M.steel, 'mantle_glyphBar', [-0.14, 0.48, 0.02], [-Math.PI / 2, 0, 0]);
  mesh(dorsM, plateGeo([[-0.07, -0.05], [0.07, -0.05], [0.08, 0.05], [-0.06, 0.05]], 0.02, 0.008), M.accent, 'mantle_accentTab', [0.30, 0.36, 0.06], [-1.1, 0.3, 0]);
  mesh(dorsF, plateGeo([[-0.05, -0.04], [0.05, -0.04], [0.05, 0.04], [-0.05, 0.04]], 0.02, 0.008), M.accent, 'mantle_accentChip', [-0.42, 0.22, -0.10], [0, -1.2, 0]);
  // status port (emissive 1 of 2)
  mesh(dorsM, cylZ(0.020, 0.024, 0.012, 8), glowA, 'mantle_statusPort', [0.05, 0.52, 0.10], [-Math.PI / 2, 0, 0]);
  mesh(dorsM, torZ(0.030, 0.010, 4, 10), M.metalLite, null, [0.05, 0.505, 0.10], [-Math.PI / 2, 0, 0]);

  // siphon funnel — the expensive bit
  const funnel = new THREE.Group(); funnel.name = 'siphon';
  funnel.position.set(0.44, -0.08, -0.14); funnel.rotation.set(0.22, 1.10, 0); mantle.add(funnel); reg(funnel);
  mesh(funnel, latheZ([[0.02, -0.03], [0.10, 0.0], [0.105, 0.05], [0.075, 0.075]], 12), M.metal, 'siphon_base');
  boltRing(funnel, 7, 0.10, 0.01, 0.9);
  const bellows = new THREE.Group(); bellows.name = 'siphon_bellows'; funnel.add(bellows); reg(bellows);
  for (let i = 0; i < 4; i++) mesh(bellows, torZ(0.072 - i * 0.004, 0.021, 4, 14), M.rubber, 'siphon_bellowRing' + i, [0, 0, 0.085 + i * 0.040]);
  mesh(funnel, latheZ([[0.058, 0.235], [0.072, 0.275], [0.052, 0.385], [0.060, 0.420], [0.038, 0.455]], 14), M.metalLite, 'siphon_nozzle');
  mesh(funnel, torZ(0.062, 0.014, 4, 14), M.shellC, 'siphon_collar', [0, 0, 0.245]);
  mesh(funnel, plateGeo([[-0.05, -0.03], [0.05, -0.03], [0.055, 0.03], [-0.045, 0.03]], 0.015, 0.006), M.accent, 'siphon_guard', [0.075, 0, 0.31], [0, 1.2, 0]);
  mesh(funnel, cylZ(0.014, 0.016, 0.010, 6), glowB, 'siphon_heatSlot', [0, 0, 0.44]); // emissive 2 of 2

  // mantle cable harness (all in mantle-local space — moves with the mantle)
  for (const sx of [-1, 1]) {
    hose(stack, [
      [sx * 0.30, 0.02, 0.10], [sx * 0.56, 0.02, -0.20], [sx * 0.58, 0.10, -0.62],
      [sx * 0.46, 0.16, -1.05], [sx * 0.26, 0.14, -1.45], [sx * 0.09, 0.02, -1.76]
    ], 0.034, M.rubber, 'mantle_trunk' + (sx > 0 ? 'R' : 'L'), true);
    hose(stack, [
      [sx * 0.20, -0.12, 0.09], [sx * 0.44, -0.20, -0.34], [sx * 0.40, -0.12, -0.84],
      [sx * 0.26, -0.02, -1.30], [sx * 0.07, -0.02, -1.72]
    ], 0.013, M.rubber, 'mantle_signal' + (sx > 0 ? 'R' : 'L'));
  }
  hose(stack, [[0.06, 0.28, 0.06], [0.10, 0.42, -0.30], [0.06, 0.46, -0.72], [-0.06, 0.44, -1.10], [-0.05, 0.24, -1.60]], 0.017, M.rubber, 'mantle_dorsalRun');
  hose(stack, [[0.40, -0.10, -0.16], [0.30, -0.24, -0.05], [0.14, -0.22, 0.06]], 0.026, M.rubber, 'mantle_siphonFeed', true);

  // neck port ring (mantle side of the split cable)
  const neckRing = new THREE.Group(); neckRing.name = 'mantle_neckCollar'; neckRing.position.set(0, 0.02, 0.10); stack.add(neckRing);
  mesh(neckRing, latheZ([[0.36, 0], [0.42, 0.02], [0.42, 0.06], [0.34, 0.08]], 20), M.metalLite, 'mantle_neckCollar_race', [0, 0, 0], null, [1, 0.92, 1]);
  mesh(neckRing, torZ(0.40, 0.028, 4, 22), M.rubber, 'mantle_neckCollar_boot', [0, 0, 0.06], null, [1, 0.92, 1]);
  boltRing(neckRing, 12, 0.38, 0.05, 0.9);

  // ================= PASS 2 : THE LEADING END =================
  const head = new THREE.Group(); head.name = 'head';
  head.position.set(0, 0.02, 0.14); mantle.add(head); reg(head);

  mesh(head, cylZ(0.30, 0.44, 0.52, 6), M.metal, 'head_coreA', [0, 0.02, 0.02], null, [1.18, 0.86, 1]);
  mesh(head, cylZ(0.20, 0.32, 0.30, 4), M.metal, 'head_snoutBlock', [0, -0.06, 0.46], [0.16, Math.PI / 4, 0], [1.25, 0.70, 1]);
  mesh(head, cylZ(0.16, 0.26, 0.44, 6), M.steel, 'head_underBlock', [0, -0.20, 0.10], [0.10, 0, 0], [1.10, 0.58, 1]);
  mesh(head, cylZ(0.26, 0.30, 0.16, 6), M.metalLite, 'head_crown', [0, 0.16, 0.10], null, [1.15, 0.55, 1]);
  // neck collar (head side) — short, one head long at most
  mesh(head, latheZ([[0.30, -0.04], [0.36, -0.01], [0.36, 0.05], [0.28, 0.07]], 18), M.metalLite, 'head_collar', [0, 0, 0], null, [1, 0.92, 1]);
  mesh(head, torZ(0.33, 0.030, 4, 20), M.rubber, 'head_collarBoot', [0, 0, 0.0], null, [1, 0.92, 1]);
  boltRing(head, 10, 0.31, 0.06, 0.9);
  // brow plate with a cut vent
  const brow = mesh(head, plateGeo([
    [-0.30, -0.24], [0.30, -0.24], [0.34, -0.02, 0.22, 0.20], [0.0, 0.28, -0.22, 0.20], [-0.34, -0.02, -0.30, -0.24]
  ], 0.055, 0.014, [[[-0.16, -0.14], [0.16, -0.14], [0.16, -0.06], [-0.16, -0.06]], [[-0.09, 0.02], [0.09, 0.02], [0.09, 0.09], [-0.09, 0.09]]]),
    M.shellA, 'head_browPlate', [0, 0.26, 0.18], [-Math.PI / 2 + 0.22, 0, 0]);
  boltArc(brow, 1, 0, 0, 0, 0, 0.9);
  boltRing(brow, 8, 0.28, 0.058, 0.85, 0.2);
  mesh(head, torZ(0.30, 0.024, 4, 18, 2.2), M.shellC, 'head_browLip', [0, 0.30, 0.40], [-1.25, 0, Math.PI - 1.1], [1.05, 0.7, 1]);
  // crest plates lapping the brow rear
  for (const sx of [-1, 1]) {
    mesh(head, plateGeo([[-0.11, -0.13], [0.12, -0.14], [0.15, 0.05, 0.05, 0.14], [-0.11, 0.11], [-0.11, -0.13]], 0.045, 0.012),
      M.shellB, 'head_crest' + (sx > 0 ? 'R' : 'L'), [sx * 0.16, 0.31, -0.02], [-Math.PI / 2 + 0.42, sx * 0.20, sx * 0.25]);
    // cheek shells (partial cylinders, formed to the head)
    const ck = mesh(head, cylZc(0.30, 0.38, 0.42, 18, true, sx > 0 ? Math.PI / 2 - 0.55 : -Math.PI / 2 - 0.55, 1.10), M.shellB,
      'head_cheek' + (sx > 0 ? 'R' : 'L'), [0, 0.02, 0.22], null, [1.16, 0.90, 1]);
    boltArc(ck, 4, 0.36, -0.14, 0.16, sx > 0 ? 0.1 : Math.PI - 0.1, 0.8);
    mesh(head, cylZ(0.045, 0.055, 0.10, 6), M.metalLite, 'head_intake' + (sx > 0 ? 'R' : 'L'), [sx * 0.34, -0.10, 0.30], [0, sx * 1.2, 0]);
    mesh(head, GEO.block, M.steel, 'head_hingePin' + (sx > 0 ? 'R' : 'L'), [sx * 0.30, 0.10, 0.02], [0, 0, 0], [0.09, 0.05, 0.07]);
    gearStack(head, 'head_gimbalGear' + (sx > 0 ? 'R' : 'L'), [sx * 0.26, 0.06, 0.10], new THREE.Vector3(sx, 0.2, -0.1), 0.075, 3);
    ram(head, 'head_ram' + (sx > 0 ? 'R' : 'L'), 0.26, 0.026, [sx * 0.17, -0.12, 0.06], [-0.55, sx * 0.25, 0]);
    mesh(head, GEO.block, M.metalLite, 'head_ramPad' + (sx > 0 ? 'R' : 'L'), [sx * 0.19, 0.10, 0.28], null, [0.06, 0.03, 0.05]);
    // sensor stalk
    const st = new THREE.Group(); st.name = 'head_sensorStalk' + (sx > 0 ? 'R' : 'L');
    st.position.set(sx * 0.11, 0.34, -0.06); st.rotation.set(-0.5, 0, -sx * 0.35); head.add(st); reg(st);
    mesh(st, cylZ(0.010, 0.016, 0.17, 6), M.steel, st.name + '_rod');
    mesh(st, latheZ([[0, 0], [0.028, 0.006], [0.030, 0.045], [0.014, 0.055]], 8), M.metalLite, st.name + '_housing', [0, 0, 0.16]);
    mesh(st, torZ(0.020, 0.007, 4, 8), M.rubber, null, [0, 0, 0.15]);
  }
  mesh(head, plateGeo([[-0.07, -0.05], [0.07, -0.05], [0.07, 0.05], [-0.07, 0.05]], 0.02, 0.008, [[[-0.03, -0.02], [0.03, -0.02], [0.03, 0.02], [-0.03, 0.02]]]), M.shellC, 'head_hatch', [0.0, 0.33, -0.10], [-Math.PI / 2, 0, 0]);
  mesh(head, cylZ(0.010, 0.010, 0.14, 6), M.steel, 'head_grabHandle', [-0.19, 0.30, 0.10], [0, Math.PI / 2, 0]);
  // head-side split of the neck cable, landing in eye-pod base ports
  hose(head, [[0.14, 0.04, 0.02], [0.20, 0.10, 0.06], [0.24, 0.06, 0.12]], 0.015, M.rubber, 'head_hoseR');
  hose(head, [[-0.14, 0.04, 0.02], [-0.20, 0.10, 0.06], [-0.24, 0.06, 0.12]], 0.015, M.rubber, 'head_hoseL');
  hose(head, [[0.0, 0.05, 0.01], [0.0, -0.14, 0.14], [0.05, -0.20, 0.30]], 0.022, M.rubber, 'head_hoseVentral', true);

  // eye pods — the optics
  const pods = {};
  const lids = {};
  for (const sx of [-1, 1]) {
    const key = sx > 0 ? 'R' : 'L';
    const pod = new THREE.Group(); pod.name = 'eyePod' + key;
    pod.position.set(sx * 0.30, 0.16, 0.20); pod.rotation.set(-0.12, sx * 0.72, 0);
    head.add(pod); reg(pod); pods[key] = pod;
    mesh(pod, latheZ([[0.03, -0.02], [0.19, 0.0], [0.205, 0.055], [0.165, 0.095], [0.175, 0.125], [0.140, 0.155]], 18), M.metalLite, 'eye' + key + '_bezel');
    mesh(pod, torZ(0.20, 0.020, 4, 20), M.metal, 'eye' + key + '_race', [0, 0, 0.01]);
    boltRing(pod, 9, 0.185, 0.05, 0.8);
    const lensG = new THREE.SphereGeometry(0.125, 18, 12);
    mesh(pod, lensG, M.lens, 'eye' + key + '_lens', [0, 0, 0.075], null, [1, 0.80, 0.72]);
    mesh(pod, GEO.block, M.rubber, 'eye' + key + '_pupil', [0, 0, 0.135], null, [0.125, 0.020, 0.028]);
    const lid = new THREE.Group(); lid.name = 'eyeLid' + key; lid.position.set(0, 0, 0.02); pod.add(lid); reg(lid); lids[key] = lid;
    mesh(lid, new THREE.SphereGeometry(0.215, 18, 10, 0, Math.PI * 2, 0, 0.72), M.shellA, 'eyeLid' + key + '_shell', [0, 0, 0.02], [-Math.PI / 2, 0, 0], [1, 0.62, 1]);
    mesh(lid, torZ(0.19, 0.018, 4, 18, 2.4), M.shellC, 'eyeLid' + key + '_lip', [0, 0.055, 0.10], [-0.4, 0, Math.PI - 1.2]);
    boltArc(lid, 3, 0.20, 0.0, 0.06, Math.PI / 2, 0.7);
    mesh(pod, GEO.block, M.steel, 'eye' + key + '_fitting1', [sx * 0.15, -0.10, 0.05], null, [0.05, 0.04, 0.06]);
    mesh(pod, cylZ(0.016, 0.020, 0.05, 6), M.bronze, 'eye' + key + '_fitting2', [-sx * 0.13, -0.11, 0.04], [0.3, 0, 0]);
    hose(pod, [[sx * 0.10, -0.13, 0.0], [sx * 0.16, -0.10, 0.06], [sx * 0.14, -0.03, 0.10]], 0.011, M.rubber, 'eye' + key + '_hose');
  }

  // ================= arm crown + beak =================
  const crown = new THREE.Group(); crown.name = 'armCrown';
  crown.position.set(0, -0.24, 0.20); crown.rotation.x = 0.10; mantle.add(crown); reg(crown);
  mesh(crown, latheZ([[0.10, -0.05], [0.36, -0.02], [0.38, 0.04], [0.30, 0.08], [0.12, 0.09]], 22), M.metal, 'crown_race', [0, 0, 0], null, [1, 0.66, 1]);
  mesh(crown, torZ(0.37, 0.032, 4, 24), M.metalLite, 'crown_bearing', [0, 0, 0.02], null, [1, 0.66, 1]);
  mesh(crown, latheZ([[0.02, 0.02], [0.20, 0.05], [0.22, 0.12], [0.14, 0.18]], 14), M.steel, 'crown_oralMass', [0, 0, 0.02], null, [1, 0.82, 1]);
  boltRing(crown, 14, 0.34, 0.06, 0.85);
  hose(crown, [[0.24, -0.10, 0.02], [0.0, -0.19, 0.06], [-0.24, -0.10, 0.02]], 0.016, M.rubber, 'crown_ringHose');
  hose(crown, [[0.20, 0.12, 0.0], [0.0, 0.17, 0.05], [-0.20, 0.12, 0.0]], 0.011, M.rubber, 'crown_ringHose2');

  const beakHousing = new THREE.Group(); beakHousing.name = 'beakHousing';
  beakHousing.position.set(0, -0.02, 0.14); crown.add(beakHousing);
  mesh(beakHousing, latheZ([[0.02, 0], [0.12, 0.01], [0.125, 0.06], [0.09, 0.09]], 12), M.metal, 'beakHousing_collar');
  boltRing(beakHousing, 7, 0.115, 0.03, 0.7);
  const beakUpper = new THREE.Group(); beakUpper.name = 'beakUpper'; beakUpper.position.set(0, 0.03, 0.06); beakHousing.add(beakUpper); reg(beakUpper);
  mesh(beakUpper, plateGeo([[-0.075, 0], [0.075, 0], [0.05, -0.09, 0.0, -0.16], [-0.05, -0.09, -0.075, 0]], 0.05, 0.008), M.steel, 'beakUpper_hook', [0, 0.02, 0.06], [-0.5, 0, 0]);
  mesh(beakUpper, cylZ(0.008, 0.020, 0.06, 6), M.bronze, 'beakUpper_tine1', [0.035, -0.02, 0.09], [0.8, 0, 0]);
  mesh(beakUpper, cylZ(0.008, 0.020, 0.06, 6), M.bronze, 'beakUpper_tine2', [-0.035, -0.02, 0.09], [0.8, 0, 0]);
  const beakLower = new THREE.Group(); beakLower.name = 'beakLower'; beakLower.position.set(0, -0.04, 0.05); beakHousing.add(beakLower); reg(beakLower);
  mesh(beakLower, plateGeo([[-0.065, 0], [0.065, 0], [0.045, 0.08, 0.0, 0.14], [-0.045, 0.08, -0.065, 0]], 0.045, 0.008), M.steel, 'beakLower_hook', [0, -0.02, 0.05], [0.45, 0, 0]);
  mesh(beakLower, cylZ(0.007, 0.017, 0.05, 6), M.bronze, 'beakLower_tine1', [0.030, 0.02, 0.08], [-0.7, 0, 0]);
  mesh(beakLower, cylZ(0.007, 0.017, 0.05, 6), M.bronze, 'beakLower_tine2', [-0.030, 0.02, 0.08], [-0.7, 0, 0]);
  ram(beakLower, 'beakLower_ram', 0.10, 0.016, [0.07, -0.03, 0.0], [-0.9, 0, 0]);
  ram(beakLower, 'beakLower_ram2', 0.10, 0.016, [-0.07, -0.03, 0.0], [-0.9, 0, 0]);

  // ================= PASS 3+4 : ARMS =================
  const ARMCFG = [
    { th: 0.36, pair: 0 }, { th: -0.36, pair: 0 },
    { th: 1.02, pair: 1 }, { th: -1.02, pair: 1 },
    { th: 1.78, pair: 2 }, { th: -1.78, pair: 2 },
    { th: 2.42, pair: 3 }, { th: -2.42, pair: 3 }
  ];
  const AL = [0.58, 0.53, 0.48, 0.42, 0.36, 0.28, 0.21];
  const AR = [0.200, 0.175, 0.150, 0.126, 0.102, 0.078, 0.052, 0.030];
  const CURL = [0.30, -0.52, -0.02, -0.04, -0.16, -0.26, -0.36];
  const BP = [0.26, 0.20, 0.13, 0.05];
  const ASC = [1.06, 1.02, 0.98, 0.94];
  const arms = [];

  ARMCFG.forEach((cfg, ai) => {
    const side = cfg.th >= 0 ? 1 : -1;
    const nm = 'arm' + (ai + 1);
    const th = cfg.th, sc = ASC[cfg.pair], bp = BP[cfg.pair];
    const base = new THREE.Object3D(); base.name = nm + '_base';
    base.position.set(Math.sin(th) * 0.33, -0.05, Math.cos(th) * 0.28);
    base.rotation.set(bp, th, 0);
    crown.add(base); reg(base);
    mesh(base, latheZ([[0.02, -0.04], [AR[0] * sc * 1.35, -0.02], [AR[0] * sc * 1.35, 0.04], [AR[0] * sc * 1.1, 0.06]], 12), M.metalLite, nm + '_socket');
    boltRing(base, 6, AR[0] * sc * 1.2, 0.05, 0.7);

    let par = base; const segs = [];
    for (let i = 0; i < 7; i++) {
      const seg = new THREE.Object3D(); seg.name = nm + '_seg' + (i + 1);
      seg.position.set(0, 0, i === 0 ? 0.05 : AL[i - 1] * sc);
      seg.rotation.x = CURL[i];
      par.add(seg); reg(seg); segs.push(seg);
      const L = AL[i] * sc, r0 = AR[i] * sc, r1 = AR[i + 1] * sc;
      mesh(seg, cylZ(r1, r0, L, 8), M.metal, nm + '_core' + (i + 1));
      mesh(seg, torZ(r0 * 1.16, r0 * 0.22, 5, 14), M.metalLite, nm + '_race' + (i + 1), [0, 0, 0.012]);
      mesh(seg, cylZ(r0 * 0.78, r0 * 0.88, 0.028, 10), M.steel, nm + '_hubCover' + (i + 1), [0, 0, -0.012]);
      boltRing(seg, 5, r0 * 0.98, 0.042, 0.55);
      if (i < 4) {
        const t0 = Math.PI - 1.45, tl = 2.9;
        mesh(seg, cylZc(r1 + 0.034, r0 + 0.040, L * 0.82, 18, true, t0, tl), i % 2 ? M.shellB : M.shellA, nm + '_shell' + (i + 1), [0, 0, L * 0.50]);
        const lip = new THREE.Mesh(torZ(1, 0.021, 4, 16, tl), M.shellC);
        lip.position.z = L * 0.91; lip.rotation.z = t0 - Math.PI / 2; lip.scale.set(r1 + 0.034, r1 + 0.034, 1);
        lip.name = nm + '_lip' + (i + 1); seg.add(lip);
        boltArc(seg, 3, r0 + 0.052, L * 0.22, L * 0.72, Math.PI / 2 + 0.52, 0.7);
        boltArc(seg, 3, r0 + 0.052, L * 0.22, L * 0.72, Math.PI / 2 - 0.52, 0.7);
      }
      const ns = i < 4 ? 2 : (i < 6 ? 1 : 0);
      for (let k = 0; k < ns; k++) {
        const z = L * (0.28 + 0.42 * k);
        for (const sgn of [-1, 1]) {
          const dir = new THREE.Vector3(sgn * 0.35, -1, 0);
          const su = new THREE.Mesh(GEO.sucker, M.metalLite);
          su.position.set(sgn * r0 * 0.42, -r0 * 0.84, z); orient(su, dir);
          su.scale.setScalar(sc * (1 - i * 0.085));
          su.name = nm + '_sucker' + (i + 1) + (sgn > 0 ? 'R' : 'L') + k; seg.add(su);
          if (i < 2) {
            const inr = new THREE.Mesh(GEO.suckerIn, M.rubber);
            inr.position.copy(su.position).addScaledVector(dir.clone().normalize(), 0.013);
            inr.quaternion.copy(su.quaternion); inr.scale.copy(su.scale).multiplyScalar(0.9);
            inr.name = su.name + '_gasket'; seg.add(inr);
          }
        }
      }
      if (i === 0) {
        const pt = Math.PI - 1.62;
        mesh(seg, cylZc(r0 * 1.02 + 0.048, r0 * 1.16 + 0.055, L * 0.55, 18, true, pt, 3.24), M.shellA, nm + '_pauldron', [0, 0, L * 0.22]);
        const plip = new THREE.Mesh(torZ(1, 0.026, 4, 18, 3.24), M.shellC);
        plip.position.z = L * 0.50; plip.rotation.z = pt - Math.PI / 2; plip.scale.set(r0 + 0.056, r0 + 0.056, 1);
        plip.name = nm + '_pauldronLip'; seg.add(plip);
        boltArc(seg, 4, r0 + 0.07, L * 0.02, L * 0.44, Math.PI / 2 + 0.7, 0.85);
        boltArc(seg, 4, r0 + 0.07, L * 0.02, L * 0.44, Math.PI / 2 - 0.7, 0.85);
        ram(seg, nm + '_ram1', L * 0.60, 0.036, [r0 * 0.55, r0 * 0.52, 0.06], [0.10, 0, 0]);
        chain(seg, [[-r0 * 0.92, r0 * 0.16, 0.09], [-r0 * 1.02, r0 * 0.08, L * 0.45], [-r0 * 0.86, r0 * 0.04, L * 0.84]], 6, 0.85);
        hose(seg, [[r0 * 0.50, -r0 * 0.42, 0.05], [r0 * 0.64, -r0 * 0.78, L * 0.36], [r0 * 0.50, -r0 * 0.58, L * 0.86]], 0.021, M.rubber, nm + '_hoseA', true);
        hose(seg, [[-r0 * 0.50, -r0 * 0.46, 0.06], [-r0 * 0.58, -r0 * 0.82, L * 0.40], [-r0 * 0.44, -r0 * 0.60, L * 0.86]], 0.010, M.rubber, nm + '_hoseB');
      }
      if (i === 1) {
        ram(seg, nm + '_ram2', L * 0.58, 0.026, [-r0 * 0.62, r0 * 0.46, 0.05], [0.09, 0, 0]);
        hose(seg, [[r0 * 0.55, -r0 * 0.36, 0.05], [r0 * 0.62, -r0 * 0.72, L * 0.45], [r0 * 0.42, -r0 * 0.52, L * 0.85]], 0.013, M.rubber, nm + '_hoseC');
      }
      if (i === 2) {
        mesh(seg, cylZ(0.010, 0.010, L * 0.7, 6), M.bronze, nm + '_tieRod', [r0 * 0.7, r0 * 0.35, L * 0.15]);
        mesh(seg, GEO.block, M.steel, nm + '_junction', [-r0 * 0.7, r0 * 0.3, L * 0.5], null, [0.045, 0.03, 0.05]);
      }
      par = seg;
    }
    const tip = new THREE.Object3D(); tip.name = nm + '_tip';
    tip.position.set(0, 0, AL[6] * sc); segs[6].add(tip); reg(tip);
    mesh(tip, cylZ(0.005, 0.028 * sc, 0.14, 6), M.steel, nm + '_hook', [0, 0, 0], [0.55, 0, 0]);
    mesh(tip, torZ(0.030, 0.011, 4, 10), M.metalLite, nm + '_tipRace');
    mesh(tip, cylZ(0.016, 0.023, 0.045, 6), M.bronze, nm + '_tipPad', [0, -0.018, 0.02], [1.25, 0, 0]);
    mesh(tip, GEO.block, M.rubber, nm + '_tipGasket', [0, 0, 0.005], null, [0.03, 0.022, 0.012]);

    arms.push({ name: nm, base: base, segs: segs, tip: tip, th: th, side: side, pair: cfg.pair, bp: bp, off: cfg.pair * 0.25 + (side > 0 ? 0 : 0.5) });
  });

  // ================= POSE =================
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const ss = (a, b, v) => { const u = clamp01((v - a) / (b - a)); return u * u * (3 - 2 * u); };
  const frac = v => v - Math.floor(v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function kf(ph, stops) {
    if (ph <= stops[0][0]) return stops[0][1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (ph <= stops[i + 1][0]) {
        const a = stops[i], b = stops[i + 1];
        const u = (ph - a[0]) / Math.max(1e-5, b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * (u * u * (3 - 2 * u));
      }
    }
    return stops[stops.length - 1][1];
  }

  root.userData.pose = (s) => {
    for (const o of posed) { const r = o.userData._rest; o.position.copy(r.p); o.rotation.copy(r.e); o.scale.copy(r.s); }
    const T = s.t || 0;
    const sp = Math.max(0, s.speed || 0), st = s.stride || 0, tn = s.turn || 0;
    const hp = (s.health === undefined ? 1 : s.health);
    const grounded = (s.grounded !== false);
    const act = s.action || null, ph = clamp01(s.phase || 0);
    const hurt = clamp01(1 - hp) * (act === 'die' ? 0 : 1);

    let cx = 0, cy = 0, cz = 0, cpitch = 0, cyaw = 0, croll = 0;
    let mYaw = 0, mRoll = 0, mInf = 0;
    let hPitch = 0, hYaw = 0, hRoll = 0;
    let beakOpen = 0, lidOpen = 0, open = 0, fAim = 0, fPulse = 0;

    const A = arms.map(() => ({ yaw: 0, pitch: 0, roll: 0, c: CURL.slice() }));

    // ---- gait selection ----
    const jet = grounded ? ss(1.9, 3.3, sp) : 0;
    const crawl = clamp01(ss(0.04, 0.45, sp)) * (1 - jet);
    const idleAmt = (1 - Math.max(crawl, jet)) * (grounded ? 1 : 0);
    const gaitAmp = 0.09 + 0.13 * Math.min(sp, 2.4);

    arms.forEach((a, i) => {
      const o = A[i];
      const phase = frac(st + a.off);
      const swing = phase < 0.42;
      const lift = swing ? Math.sin(phase / 0.42 * Math.PI) : 0;
      const sweep = swing ? (-1 + 2 * (phase / 0.42)) : (1 - 2 * ((phase - 0.42) / 0.58));
      // crawl: metachronal wave, planted arms push back
      o.yaw += -a.side * sweep * gaitAmp * crawl;
      o.c[0] += (-0.50 * lift + (swing ? 0 : 0.06)) * crawl;
      o.c[1] += (0.34 * lift) * crawl;
      o.c[2] += (0.14 * lift) * crawl;
      o.c[4] += (-0.10 * lift) * crawl;
      o.pitch += (swing ? -0.18 * lift : 0.04) * crawl;
      // creep gather (low, long steps)
      const creep = crawl * (1 - ss(0.6, 1.7, sp));
      o.c[0] += 0.10 * creep; o.pitch += 0.06 * creep;
      // idle ripple in the arm tips
      o.c[4] += Math.sin(T * 1.25 + i * 0.9) * 0.05 * idleAmt;
      o.c[5] += Math.sin(T * 1.25 + i * 0.9 + 0.6) * 0.07 * idleAmt;
      o.c[6] += Math.sin(T * 1.25 + i * 0.9 + 1.2) * 0.09 * idleAmt;
      o.yaw += Math.sin(T * 0.6 + i) * 0.02 * idleAmt;
      // jet: arms gather forward into a bundle and undulate
      if (jet > 0) {
        const wv = st * Math.PI * 4;
        for (let k = 0; k < 7; k++) {
          const target = 0.02 + Math.sin(wv - k * 0.75 + i * 0.35) * (0.05 + 0.028 * k);
          o.c[k] = lerp(o.c[k], target, jet);
        }
        o.yaw += (-a.th * 0.72) * jet;
        o.pitch += (0.10 - a.bp) * jet;
      }
    });
    cy += 0.42 * jet; cpitch += -0.10 * jet;
    mInf += Math.sin(st * Math.PI * 4) * 0.06 * jet; fPulse += (Math.sin(st * Math.PI * 4) * 0.5 + 0.5) * jet;
    cy += Math.sin(st * Math.PI * 4) * 0.035 * crawl - 0.05 * crawl - 0.09 * crawl * (1 - ss(0.6, 1.7, sp));
    cx += Math.sin(st * Math.PI * 2) * 0.03 * crawl;
    croll += Math.sin(st * Math.PI * 2) * 0.035 * crawl;
    hPitch += 0.06 * crawl - 0.16 * jet;
    // idle hardware
    mInf += Math.sin(T * 1.0) * 0.030 * (0.45 + 0.55 * idleAmt);
    cy += Math.sin(T * 1.0) * 0.012 * idleAmt;
    cx += Math.sin(T * 0.42) * 0.025 * idleAmt;
    croll += Math.sin(T * 0.42) * 0.030 * idleAmt;
    hYaw += Math.sin(T * 0.33) * 0.20 * idleAmt;
    hPitch += Math.sin(T * 0.50) * 0.06 * idleAmt;
    fAim += Math.sin(T * 0.29) * 0.10 * idleAmt;

    // ---- turn overlay ----
    if (tn !== 0) {
      const a = Math.abs(tn), sgn = tn < 0 ? -1 : 1;
      croll += -tn * 0.14; cyaw += -tn * 0.05;
      hYaw += tn * 0.26; hRoll += -tn * 0.10;
      mYaw += -tn * 0.13; mRoll += tn * 0.08;
      arms.forEach((ar, i) => {
        const inside = (ar.side === sgn);
        A[i].c[0] += inside ? 0.16 * a : -0.10 * a;
        A[i].yaw += (inside ? 0.12 : -0.06) * a * (-ar.side);
      });
    }

    // ---- airborne overlay ----
    if (!grounded) {
      cpitch += -0.06; mInf += 0.03;
      arms.forEach((ar, i) => {
        const o = A[i];
        for (let k = 0; k < 7; k++) o.c[k] = lerp(o.c[k], 0.20 + 0.055 * k + Math.sin(T * 2.2 + k * 0.5 + i) * 0.05, 0.85);
        o.yaw += -ar.th * 0.25; o.pitch += (0.38 - ar.bp) * 0.9;
      });
    }

    // ---- hurt overlay ----
    if (hurt > 0.02) {
      croll += 0.11 * hurt; cy -= 0.10 * hurt; cpitch += 0.06 * hurt;
      hPitch += 0.25 * hurt; hRoll += 0.12 * hurt; mRoll += -0.08 * hurt;
      lidOpen += -0.35 * hurt;
      const o = A[2];
      for (let k = 0; k < 7; k++) o.c[k] = lerp(o.c[k], 0.05 + 0.09 * k, 0.8 * hurt);
      o.pitch += 0.30 * hurt;
      croll += Math.sin(T * 13) * 0.012 * hurt;
    }

    // ---- actions ----
    if (act === 'attack') {
      const w = kf(ph, [[0, 0], [0.28, 1], [0.50, 0], [1, 0]]);
      const k = kf(ph, [[0, 0], [0.30, 0], [0.48, 1], [0.72, 0.25], [1, 0]]);
      cz += -0.14 * w + 0.34 * k; cy += 0.10 * w - 0.10 * k; cpitch += -0.12 * w + 0.22 * k;
      hPitch += -0.10 * w + 0.24 * k;
      beakOpen += kf(ph, [[0, 0], [0.30, 0.3], [0.50, 1], [0.72, 0.2], [1, 0]]);
      arms.forEach((ar, i) => {
        const o = A[i];
        if (ar.pair <= 1) {
          o.pitch += -0.85 * w + 0.25 * k;
          o.c[0] += -0.55 * w + 0.30 * k; o.c[1] += 0.95 * w - 0.55 * k; o.c[2] += 0.70 * w - 0.60 * k;
          for (let m = 3; m < 7; m++) o.c[m] += 0.50 * w - 0.45 * k;
          o.yaw += -ar.side * (-0.12 * w + 0.18 * k);
        } else { o.c[0] += 0.10 * w + 0.16 * k; o.pitch += 0.05 * k; }
      });
    } else if (act === 'fire') {
      const aim = kf(ph, [[0, 0], [0.30, 1], [0.62, 1], [0.85, 0], [1, 0]]);
      const rel = kf(ph, [[0, 0], [0.34, 0], [0.42, 1], [0.58, 0.2], [1, 0]]);
      cy += -0.07 * aim; cpitch += 0.05 * aim - 0.10 * rel; cz += -0.16 * rel;
      hPitch += -0.06 * aim; mInf += 0.07 * aim - 0.20 * rel;
      fAim += aim; fPulse += rel;
      arms.forEach((ar, i) => { const o = A[i]; o.c[0] += 0.14 * aim; o.pitch += 0.06 * aim; o.c[1] += -0.08 * aim; o.c[6] += 0.20 * rel; });
    } else if (act === 'hit') {
      const f = kf(ph, [[0, 0], [0.14, 1], [0.42, 0.3], [0.70, 0.08], [1, 0]]);
      cz += -0.26 * f; cy += 0.06 * f; croll += 0.18 * f; cpitch += -0.14 * f;
      hPitch += 0.30 * f; hYaw += 0.20 * f; lidOpen += -0.9 * f;
      arms.forEach((ar, i) => { const o = A[i]; for (let k = 0; k < 7; k++) o.c[k] += 0.28 * f * (k < 3 ? 1 : 0.6); o.pitch += -0.12 * f; });
    } else if (act === 'block') {
      const b = kf(ph, [[0, 0], [0.22, 1], [0.78, 1], [1, 0]]);
      cz += -0.16 * b; cy += -0.14 * b; cpitch += 0.10 * b; hPitch += 0.28 * b; lidOpen += -0.5 * b;
      arms.forEach((ar, i) => {
        const o = A[i];
        if (ar.pair <= 1) { o.pitch += -1.05 * b; o.c[0] += 0.85 * b; o.c[1] += 0.55 * b; o.c[2] += 0.35 * b; o.yaw += ar.side * 0.10 * b; }
        else { o.c[0] += 0.22 * b; o.yaw += ar.side * 0.18 * b; }
      });
    } else if (act === 'gather') {
      const reach = kf(ph, [[0, 0], [0.32, 1], [0.58, 1], [0.85, 0], [1, 0]]);
      const close = kf(ph, [[0, 0], [0.38, 0], [0.55, 1], [0.90, 1], [1, 0.2]]);
      const rise = kf(ph, [[0, 0], [0.60, 0], [0.82, 1], [1, 0.35]]);
      cy += -0.12 * reach + 0.06 * rise; cpitch += 0.10 * reach - 0.06 * rise; cz += 0.06 * reach;
      hPitch += 0.24 * reach - 0.10 * rise; beakOpen += 0.30 * rise;
      arms.forEach((ar, i) => {
        const o = A[i];
        if (i === 0) {
          o.pitch += 0.42 * reach - 0.75 * rise; o.c[0] += -0.30 * reach - 0.25 * rise; o.c[1] += 0.40 * reach;
          for (let k = 2; k < 7; k++) o.c[k] += 0.55 * close + 0.10 * reach;
        } else if (ar.pair === 0) o.c[0] += 0.12 * reach;
        else o.c[0] += 0.06 * reach;
      });
    } else if (act === 'deposit') {
      const hold = kf(ph, [[0, 1], [0.55, 1], [0.80, 0], [1, 0]]);
      const down = kf(ph, [[0, 0], [0.50, 1], [0.75, 1], [1, 0]]);
      const rel = kf(ph, [[0, 0], [0.62, 0], [0.78, 1], [1, 0.3]]);
      cy += -0.10 * down; cpitch += 0.08 * down; hPitch += 0.20 * down;
      arms.forEach((ar, i) => {
        const o = A[i];
        if (i === 0) {
          o.pitch += -0.60 * hold + 0.55 * down; o.c[0] += -0.20 * hold - 0.20 * down;
          for (let k = 2; k < 7; k++) o.c[k] += 0.55 * hold * (1 - rel);
        } else o.c[0] += 0.06 * down;
      });
    } else if (act === 'eat') {
      const dn = kf(ph, [[0, 0], [0.20, 1], [0.80, 1], [1, 0]]);
      const cyc = Math.sin(ph * Math.PI * 6);
      cy += -0.16 * dn; cpitch += 0.16 * dn; hPitch += 0.42 * dn;
      beakOpen += (0.5 + 0.5 * Math.sin(ph * Math.PI * 12)) * dn;
      arms.forEach((ar, i) => {
        const o = A[i];
        if (ar.pair <= 1) {
          o.pitch += -0.30 * dn; o.c[0] += 0.25 * dn + 0.12 * cyc * dn; o.c[1] += 0.40 * dn - 0.15 * cyc * dn;
          for (let k = 2; k < 7; k++) o.c[k] += 0.30 * dn + 0.10 * cyc * dn;
        } else o.c[0] += 0.12 * dn;
      });
    } else if (act === 'drink') {
      const dn = kf(ph, [[0, 0], [0.25, 1], [0.80, 1], [1, 0]]);
      cy += -0.20 * dn + Math.sin(T * 2.0) * 0.006 * dn; cpitch += 0.20 * dn; hPitch += 0.50 * dn;
      beakOpen += 0.22 * dn; lidOpen += -0.3 * dn;
      arms.forEach((ar, i) => { const o = A[i]; o.c[0] += 0.16 * dn; if (ar.pair <= 1) { o.pitch += 0.18 * dn; o.c[1] += -0.12 * dn; } });
    } else if (act === 'jump') {
      const cr = kf(ph, [[0, 0], [0.30, 1], [0.45, 0], [1, 0]]);
      const ex = kf(ph, [[0, 0], [0.34, 0], [0.60, 1], [1, 1]]);
      cy += -0.26 * cr + 0.55 * ex; cpitch += 0.14 * cr - 0.16 * ex;
      hPitch += 0.16 * cr - 0.22 * ex; mInf += 0.05 * cr + 0.10 * ex;
      arms.forEach((ar, i) => {
        const o = A[i];
        o.c[0] += 0.55 * cr - 0.35 * ex; o.c[1] += 0.45 * cr - 0.20 * ex;
        for (let k = 2; k < 7; k++) o.c[k] += 0.30 * cr + 0.15 * ex;
        o.pitch += 0.25 * cr + (0.16 - ar.bp) * ex;
      });
    } else if (act === 'land') {
      const rch = kf(ph, [[0, 1], [0.25, 1], [0.45, 0], [1, 0]]);
      const comp = kf(ph, [[0, 0], [0.30, 0], [0.45, 1], [0.70, 0.4], [1, 0]]);
      cy += 0.30 * rch - 0.28 * comp; cpitch += -0.12 * rch + 0.10 * comp;
      hPitch += -0.14 * rch + 0.26 * comp;
      arms.forEach((ar, i) => {
        const o = A[i];
        o.pitch += (0.48 - ar.bp) * rch - 0.25 * comp;
        o.c[0] += -0.25 * rch + 0.50 * comp; o.c[1] += 0.15 * rch - 0.35 * comp;
        for (let k = 2; k < 7; k++) o.c[k] += -0.10 * rch + 0.20 * comp;
        o.yaw += ar.side * 0.14 * comp;
      });
    } else if (act === 'signal') {
      const rise = kf(ph, [[0, 0], [0.28, 1], [0.72, 1], [1, 0]]);
      const spr = kf(ph, [[0, 0], [0.34, 0.2], [0.50, 1], [0.70, 1], [0.92, 0], [1, 0]]);
      cy += 0.34 * rise; cpitch += -0.14 * rise; mInf += 0.16 * rise + 0.05 * spr;
      hPitch += -0.30 * rise; beakOpen += 0.85 * spr; lidOpen += 0.5 * rise; open += 0.35 * spr;
      arms.forEach((ar, i) => {
        const o = A[i];
        if (ar.pair <= 1) { o.pitch += -1.15 * spr - 0.20 * rise; o.c[1] += -0.30 * spr; o.c[5] += -0.30 * spr; o.c[6] += -0.40 * spr; }
        else { o.pitch += -0.25 * rise; o.c[0] += 0.25 * rise; }
        o.yaw += ar.side * 0.34 * spr;
      });
    } else if (act === 'sleep') {
      const low = kf(ph, [[0, 0], [0.45, 1], [1, 1]]);
      const fold = kf(ph, [[0, 0], [0.30, 0.2], [0.80, 1], [1, 1]]);
      cy += -0.30 * low; cpitch += 0.06 * low; croll += 0.05 * low;
      hPitch += 0.42 * fold; mInf += -0.05 * low + Math.sin(T * 0.5) * 0.02 * low;
      lidOpen += -1.0 * fold;
      arms.forEach((ar, i) => {
        const o = A[i];
        o.pitch += -0.10 * low; o.c[0] += 0.35 * fold; o.c[1] += 0.50 * fold;
        for (let k = 2; k < 7; k++) o.c[k] += 0.42 * fold;
        o.yaw += -ar.side * 0.18 * fold;
      });
    } else if (act === 'wake') {
      const low = kf(ph, [[0, 1], [0.45, 0.55], [0.80, 0], [1, 0]]);
      const fold = kf(ph, [[0, 1], [0.30, 0.85], [0.75, 0.10], [1, 0]]);
      const stir = Math.sin(ph * Math.PI * 3) * Math.max(0, 1 - ph * 1.4);
      cy += -0.30 * low; cpitch += 0.06 * low; croll += 0.05 * low + stir * 0.05;
      hPitch += 0.42 * fold - stir * 0.10; lidOpen += -1.0 * fold + 0.3 * stir;
      arms.forEach((ar, i) => {
        const o = A[i];
        o.pitch += -0.10 * low; o.c[0] += 0.35 * fold + stir * 0.10 * Math.sin(i * 1.3);
        o.c[1] += 0.50 * fold;
        for (let k = 2; k < 7; k++) o.c[k] += 0.42 * fold;
        o.yaw += -ar.side * 0.18 * fold;
      });
    } else if (act === 'die') {
      const rear = kf(ph, [[0, 0], [0.16, 1], [0.32, 0.2], [1, 0]]);
      const fall = kf(ph, [[0, 0], [0.20, 0], [0.55, 1], [1, 1]]);
      const limp = kf(ph, [[0, 0], [0.35, 0.3], [0.80, 1], [1, 1]]);
      cy += 0.08 * rear - 0.34 * fall; cpitch += -0.20 * rear + 0.10 * fall;
      croll += 0.62 * fall; cz += -0.05 * fall;
      hPitch += -0.20 * rear + 0.50 * limp; hRoll += 0.25 * fall;
      mInf += 0.05 * rear - 0.12 * limp; lidOpen += -1.0 * limp; beakOpen += 0.25 * rear + 0.15 * limp;
      arms.forEach((ar, i) => {
        const o = A[i];
        o.c[0] += -0.10 * rear;
        for (let k = 0; k < 7; k++) o.c[k] = lerp(o.c[k], (k === 0 ? 0.16 : -0.06) + Math.sin(i * 1.7 + k) * 0.05, limp);
        o.pitch += (0.06 - ar.bp * 0.4) * limp; o.yaw += ar.side * 0.22 * limp;
      });
    } else if (act === 'evolve') {
      const brace = kf(ph, [[0, 0], [0.20, 1], [0.85, 1], [1, 0]]);
      const op = kf(ph, [[0, 0], [0.22, 0], [0.42, 1], [0.66, 1], [0.85, 0], [1, 0]]);
      const trem = Math.sin(T * 22) * 0.012 * op;
      cy += -0.14 * brace + 0.08 * op; cpitch += 0.08 * brace; croll += trem;
      open += op; mInf += 0.10 * op - 0.04 * brace; lidOpen += 0.4 * op; beakOpen += 0.30 * op;
      arms.forEach((ar, i) => {
        const o = A[i];
        o.c[0] += 0.30 * brace - 0.10 * op; o.pitch += 0.12 * brace;
        o.yaw += ar.side * (0.16 * brace + trem * 2);
        for (let k = 2; k < 7; k++) o.c[k] += 0.18 * brace;
      });
    }

    // ---- write it out ----
    const cr = carriage.userData._rest;
    carriage.position.set(cr.p.x + cx, cr.p.y + cy, cr.p.z + cz);
    carriage.rotation.set(cr.e.x + cpitch, cr.e.y + cyaw, cr.e.z + croll);
    const mr = mantle.userData._rest;
    mantle.rotation.set(mr.e.x - cpitch * 0.25, mr.e.y + mYaw, mr.e.z + mRoll);
    const inf = Math.max(-0.4, mInf);
    stack.scale.set(1 + inf, 1 + inf * 0.9, 1 - inf * 0.3);
    const hr = head.userData._rest;
    head.rotation.set(hr.e.x + hPitch, hr.e.y + hYaw, hr.e.z + hRoll);
    for (const k of ['L', 'R']) {
      const pr = pods[k].userData._rest;
      pods[k].rotation.set(pr.e.x - hPitch * 0.35, pr.e.y - hYaw * 0.55, pr.e.z);
      const lr = lids[k].userData._rest;
      lids[k].rotation.set(lr.e.x + (lidOpen < 0 ? -lidOpen * 0.95 : -lidOpen * 0.30), lr.e.y, lr.e.z);
    }
    const bu = beakUpper.userData._rest, bl = beakLower.userData._rest;
    beakUpper.rotation.set(bu.e.x - beakOpen * 0.20, bu.e.y, bu.e.z);
    beakLower.rotation.set(bl.e.x + beakOpen * 0.62, bl.e.y, bl.e.z);
    const fr = funnel.userData._rest;
    funnel.rotation.set(fr.e.x + fPulse * 0.06, fr.e.y - fAim * 0.85, fr.e.z);
    bellows.scale.set(1 + fPulse * 0.10, 1 + fPulse * 0.10, 1 - fPulse * 0.32);
    for (const op of openParts) {
      const r = op.node.userData._rest;
      op.node.position.copy(r.p).addScaledVector(op.dir, open * 0.10);
      op.node.rotation.set(r.e.x + open * 0.05 * op.dir.z, r.e.y, r.e.z + open * 0.06 * op.dir.x);
    }
    arms.forEach((a, i) => {
      const o = A[i], br = a.base.userData._rest;
      a.base.rotation.set(br.e.x + o.pitch, br.e.y + o.yaw, br.e.z + o.roll);
      for (let k = 0; k < 7; k++) {
        const sr = a.segs[k].userData._rest;
        a.segs[k].rotation.set(o.c[k], sr.e.y, sr.e.z);
      }
      const tr = a.tip.userData._rest;
      a.tip.rotation.set(tr.e.x + (o.c[6] - CURL[6]) * 0.5, tr.e.y, tr.e.z);
    });
  };

  root.userData.update = (t) => { /* body is driven by pose */ };

  return root;
}