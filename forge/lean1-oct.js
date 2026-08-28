function build(THREE, TSL) {
  // ONE QUALITY: ARMOURED REACH — a heavy bulbous armoured mantle carried high, and eight long
  // segmented arms that do all the work. Mass at the back, reach at the front.
  /* BRIEF
     A machined octopus. The mantle is the biggest mass on the body: a three-section stack of
     ten-sided machined hoops on a rising spine curve, filled solid with a dark core, girdled with
     bearing races and a dorsal chain run, then clad in four overlapping pressed bone-white shells
     that stop short of the flanks so the gearwork shows. Forward of it, a short rigid head — no
     neck boom — one shoulder wide: faceted skull domes split by a ribbed dorsal ridge, two big
     outward-canted eye turrets with deep dark glass set back in stepped bezels behind hinged
     lids, and the funnel/siphon nozzle bolted to the right cheek. Under the head, a crown hub
     ring carrying eight bearing races; between the front arm roots, a two-part beak in a machined
     mouth ring. Eight arms, front pair longest, each seven tapering blocks with a joint barrel and
     race at every station, biserial sucker discs lathed onto the underside, a tendon chain along
     the top of the first four and a ram alongside the first three, ending in a pointed tip with a
     tiny sensor bulb. Cable: short trunk runs, each drawn in one part's own space, both ends in
     port collars, split at every joint. Expensive thing: the eye turrets and the sucker rows.
  */
  const {
    Fn, vec2, vec3, float, positionLocal, normalLocal, mix, smoothstep, abs, max, min,
    sin, clamp, oneMinus
  } = TSL;

  const TAU = Math.PI * 2;
  const C = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };

  // ---------- shared TSL noise ----------
  const nz = (p) => {
    const a = sin(p.x.mul(3.1).add(sin(p.z.mul(2.3)).mul(1.7)).add(p.y.mul(0.7)));
    const b = sin(p.y.mul(2.7).add(sin(p.x.mul(3.3)).mul(1.3)).add(p.z.mul(0.9)));
    return a.mul(b).mul(0.5).add(0.5);
  };
  const fbm = (p) => nz(p).mul(0.55)
    .add(nz(p.mul(2.6).add(vec3(1.7, 4.2, 2.9))).mul(0.3))
    .add(nz(p.mul(6.3).add(vec3(9.1, 2.2, 5.5))).mul(0.15));

  const edgeMask = () => {
    const an = abs(normalLocal);
    const mx = max(max(an.x, an.y), an.z);
    return oneMinus(smoothstep(0.55, 0.97, mx));
  };

  const NM = THREE.MeshStandardNodeMaterial;

  function paintedMat(base, shade, worn) {
    const m = new NM({ metalness: 0.12, roughness: 0.6 });
    const p = positionLocal;
    const edge = edgeMask();
    const nA = fbm(p.mul(12));
    const nB = fbm(vec3(p.x.mul(10), p.y.mul(1.1), p.z.mul(10)).add(3));
    const down = smoothstep(0.35, -0.5, normalLocal.y);
    const up = smoothstep(0.05, 0.95, normalLocal.y);
    let col = mix(C(base), C(shade), down.mul(0.7));
    col = mix(col, C(worn), up.mul(0.4).mul(smoothstep(0.32, 0.8, nA)));
    const chip = clamp(edge.mul(1.7).mul(smoothstep(0.4, 0.72, nA)), 0, 1);
    col = mix(col, C('#55524C'), chip.mul(0.9));
    const rust = clamp(edge.mul(0.85).add(0.08).mul(smoothstep(0.62, 0.96, nB)).mul(down.mul(0.7).add(0.3)), 0, 1);
    col = mix(col, C('#4A4238'), rust.mul(0.85));
    col = col.mul(mix(float(1.0), float(0.68), down.mul(smoothstep(0.35, 0.85, nA))));
    m.colorNode = col;
    m.roughnessNode = clamp(float(0.55).add(up.mul(0.16)).add(rust.mul(0.24)), 0.3, 1.0);
    m.metalnessNode = clamp(float(0.08).add(chip.mul(0.6)), 0, 1);
    return m;
  }

  function machineMat(base, rough, metal) {
    const m = new NM({ metalness: metal, roughness: rough });
    const p = positionLocal;
    const edge = edgeMask();
    const nA = fbm(p.mul(15));
    const up = smoothstep(0.0, 0.9, normalLocal.y);
    const down = smoothstep(0.3, -0.6, normalLocal.y);
    let col = mix(C(base), C('#6B665E'), edge.mul(0.5).add(up.mul(0.22)));
    col = mix(col, C('#3E3A34'), down.mul(0.6));
    col = mix(col, C('#4A4238'), smoothstep(0.58, 0.95, nA).mul(0.55));
    m.colorNode = col;
    m.roughnessNode = clamp(float(rough).add(up.mul(0.12)).sub(edge.mul(0.06)), 0.32, 1.0);
    return m;
  }

  const M = {
    shell: paintedMat('#D8D2C6', '#C9C2B4', '#B5AC9C'),
    shellB: paintedMat('#CFC8BA', '#C0B8A9', '#B5AC9C'),
    accent: paintedMat('#C2521E', '#8E3B14', '#A8231C'),
    mach: machineMat('#55524C', 0.55, 0.82),
    mach2: machineMat('#3E3A34', 0.5, 0.85),
    bronze: machineMat('#4A4238', 0.6, 0.75),
    rubber: new NM({ color: new THREE.Color('#1E1D1B'), metalness: 0.0, roughness: 0.95 }),
    lens: new NM({ color: new THREE.Color('#131518'), metalness: 0.1, roughness: 0.08 })
  };
  const glowA = new NM({ color: new THREE.Color('#22282A'), metalness: 0.2, roughness: 0.45 });
  glowA.emissiveNode = C('#2E6E78').mul(1.5);
  const glowB = new NM({ color: new THREE.Color('#2A2622'), metalness: 0.2, roughness: 0.45 });
  glowB.emissiveNode = C('#8A5A16').mul(1.3);

  // ---------- geometry helpers ----------
  function plate(pts, depth, bev, holes) {
    const sh = new THREE.Shape();
    pts.forEach((q, i) => i ? sh.lineTo(q[0], q[1]) : sh.moveTo(q[0], q[1]));
    sh.closePath();
    (holes || []).forEach(h => {
      const pa = new THREE.Path();
      h.forEach((q, i) => i ? pa.lineTo(q[0], q[1]) : pa.moveTo(q[0], q[1]));
      pa.closePath(); sh.holes.push(pa);
    });
    return new THREE.ExtrudeGeometry(sh, {
      depth, bevelEnabled: true, bevelSize: bev || 0.008, bevelThickness: bev || 0.008,
      bevelSegments: 2, steps: 1, curveSegments: 5
    });
  }
  const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(q => new THREE.Vector2(q[0], q[1])), seg || 16);
  const wrap = (rt, rb, l, ts, tl, seg) => new THREE.CylinderGeometry(rt, rb, l, seg || 18, 1, true, ts, tl);
  const tube = (pts, r, ts, rs) => new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(q[0], q[1], q[2]))), ts || 22, r, rs || 6, false);

  function mk(geo, mat, name, parent, pos, rot, scl) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl !== undefined) Array.isArray(scl) ? m.scale.set(scl[0], scl[1], scl[2]) : m.scale.setScalar(scl);
    parent.add(m); return m;
  }
  function grp(name, parent, pos, rot) {
    const g = new THREE.Group(); g.name = name;
    if (pos) g.position.set(pos[0], pos[1], pos[2]);
    if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(g); return g;
  }

  const boltGeo = new THREE.CylinderGeometry(0.013, 0.016, 0.014, 6);
  const discGeo = lathe([[0.18, 0], [0.82, 0.02], [1.0, 0.09], [0.9, 0.18], [0.5, 0.23], [0.2, 0.21], [0, 0.19]], 18);
  const collarGeo = lathe([[0.55, 0], [1.0, 0.04], [1.06, 0.12], [0.92, 0.19], [0.6, 0.21], [0.55, 0.05]], 14);
  const gearGeo = new THREE.CylinderGeometry(1, 1, 0.16, 12);
  const linkGeo = plate([[-0.022, -0.011], [0.022, -0.011], [0.026, 0], [0.022, 0.011], [-0.022, 0.011], [-0.026, 0]], 0.026, 0.004);
  const rollerGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.042, 8);
  const suckerGeo = lathe([[0, -0.030], [0.016, -0.032], [0.028, -0.026], [0.034, -0.012], [0.030, 0.002], [0.012, 0.006], [0, 0.005]], 12);
  const barrelGeo = lathe([[0, 0], [0.09, 0], [0.10, 0.03], [0.10, 0.30], [0.075, 0.34], [0.05, 0.35], [0, 0.35]], 12);
  const rodGeo = new THREE.CylinderGeometry(0.026, 0.026, 1, 8);
  const bootGeo = new THREE.TorusGeometry(0.05, 0.019, 6, 10);
  const clevisGeo = plate([[-0.035, 0], [0.035, 0], [0.035, 0.05], [0.018, 0.07], [-0.018, 0.07], [-0.035, 0.05]], 0.03, 0.005);

  function boltRing(parent, c, r, n, axis, s, mat) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU;
      let pos, rot = [0, 0, 0];
      if (axis === 'y') pos = [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r];
      else if (axis === 'z') { pos = [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]]; rot = [Math.PI / 2, 0, 0]; }
      else { pos = [c[0], c[1] + Math.sin(a) * r, c[2] + Math.cos(a) * r]; rot = [0, 0, Math.PI / 2]; }
      mk(boltGeo, mat || M.mach2, 'bolt', parent, pos, rot, s || 1);
    }
  }
  function boltRow(parent, from, to, n, s, mat, rot) {
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0.5 : i / (n - 1);
      mk(boltGeo, mat || M.mach2, 'bolt', parent,
        [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k],
        rot || [0, 0, 0], s || 1);
    }
  }
  function chainRun(parent, name, pts, s) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i % 2 === 0) mk(linkGeo, M.mach2, name + '_link' + i, parent, p, [0, 0, Math.PI / 2], s || 1);
      else mk(rollerGeo, M.bronze, name + '_roll' + i, parent, p, [0, 0, Math.PI / 2], s || 1);
    }
  }
  function port(parent, name, pos, rot, s) {
    return mk(collarGeo, M.mach, name, parent, pos, rot, s || 0.09);
  }
  function hose(parent, name, pts, r) {
    return mk(tube(pts, r), M.rubber, name, parent);
  }

  // ============================================================ ROOT / FRAME
  const root = new THREE.Object3D(); root.name = 'octopus_mech';
  const core = grp('body_core', root, [0, 0, 0]);
  const P = {};

  // spine curve (used to seat mantle sections)
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.50, 0.30), new THREE.Vector3(0, 0.57, 0.02),
    new THREE.Vector3(0, 0.64, -0.55), new THREE.Vector3(0, 0.69, -1.05),
    new THREE.Vector3(0, 0.66, -1.55)
  ]);

  // ---------- internal frame spars (visible in the gaps, land in fittings) ----------
  const frame = grp('frame', core, [0, 0, 0]);
  for (let i = 0; i < 5; i++) {
    const p0 = spine.getPoint(i / 6), p1 = spine.getPoint((i + 1) / 6);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const len = p0.distanceTo(p1);
    const g = new THREE.CylinderGeometry(0.06, 0.07, len, 8);
    const m = mk(g, M.mach2, 'spine_spar' + i, frame, [mid.x, mid.y, mid.z]);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
    mk(discGeo, M.bronze, 'spine_race' + i, frame, [0, p0.y, p0.z], [0, 0, 0], 0.34);
  }

  // ============================================================ MANTLE (largest mass: a stack)
  function mantleSection(name, parent, pos, hoops, opt) {
    const g = grp(name, parent, pos);
    hoops.forEach((h, i) => {
      mk(new THREE.CylinderGeometry(h[3], h[2], h[4], 10, 1, false), M.mach,
        name + '_seg' + i, g, [0, h[1], h[0]], [Math.PI / 2, 0, 0]);
      mk(discGeo, M.mach2, name + '_raceL' + i, g, [-h[2] * 0.93, h[1] + 0.03, h[0]], [0, 0, Math.PI / 2], h[2] * 0.75);
      mk(discGeo, M.mach2, name + '_raceR' + i, g, [h[2] * 0.93, h[1] + 0.03, h[0]], [0, 0, -Math.PI / 2], h[2] * 0.75);
      mk(gearGeo, M.bronze, name + '_gearL' + i, g, [-h[2] * 0.99, h[1] - 0.10, h[0]], [0, 0, Math.PI / 2], [h[2] * 0.42, 1, h[2] * 0.42]);
      mk(gearGeo, M.bronze, name + '_gearR' + i, g, [h[2] * 0.99, h[1] - 0.10, h[0]], [0, 0, Math.PI / 2], [h[2] * 0.42, 1, h[2] * 0.42]);
      boltRing(g, [0, h[1], h[0] + h[4] * 0.5], h[2] * 0.72, 10, 'y', 0.9);
    });
    // solid filler core (buried, gives the section real volume)
    const fz = (hoops[0][0] + hoops[hoops.length - 1][0]) * 0.5;
    const rm = Math.max.apply(null, hoops.map(h => h[2]));
    mk(new THREE.SphereGeometry(rm * 0.92, 14, 10), M.mach2, name + '_fill', g,
      [0, hoops[0][1] + 0.02, fz], [0, 0, 0],
      [1, 0.92, Math.abs(hoops[hoops.length - 1][0] - hoops[0][0]) / (rm * 1.5) + 0.5]);
    // dorsal chain run + ducting
    const pts = [];
    const z0 = hoops[0][0] + 0.05, z1 = hoops[hoops.length - 1][0] - 0.03;
    const nlink = opt && opt.links ? opt.links : 7;
    for (let i = 0; i < nlink; i++) {
      const k = i / (nlink - 1);
      pts.push([0.0, hoops[0][1] + rm * 0.94 + 0.02 - k * 0.02, z0 + (z1 - z0) * k]);
    }
    chainRun(g, name + '_chain', pts, 1);
    mk(new THREE.CylinderGeometry(rm * 0.16, rm * 0.20, Math.abs(z1 - z0) * 0.9, 8), M.bronze,
      name + '_duct', g, [rm * 0.55, hoops[0][1] - 0.10, (z0 + z1) * 0.5], [Math.PI / 2, 0, 0]);
    mk(new THREE.CylinderGeometry(rm * 0.16, rm * 0.20, Math.abs(z1 - z0) * 0.9, 8), M.bronze,
      name + '_ductL', g, [-rm * 0.55, hoops[0][1] - 0.10, (z0 + z1) * 0.5], [Math.PI / 2, 0, 0]);
    return g;
  }

  const mantleA = mantleSection('mantle_a', core, [0, 0.55, 0.02], [
    [-0.10, 0.02, 0.395, 0.435, 0.15],
    [-0.29, 0.05, 0.44, 0.465, 0.15],
    [-0.47, 0.07, 0.465, 0.465, 0.14]
  ], { links: 8 });
  P.mantle_a = mantleA;
  const mantleB = mantleSection('mantle_b', mantleA, [0, 0.07, -0.55], [
    [-0.08, 0.01, 0.462, 0.45, 0.15],
    [-0.26, 0.03, 0.45, 0.40, 0.15],
    [-0.44, 0.04, 0.40, 0.345, 0.14]
  ], { links: 7 });
  P.mantle_b = mantleB;
  const mantleC = mantleSection('mantle_c', mantleB, [0, 0.04, -0.52], [
    [-0.07, 0.0, 0.34, 0.265, 0.14],
    [-0.22, -0.01, 0.265, 0.17, 0.14]
  ], { links: 5 });
  P.mantle_c = mantleC;
  P.mantle_c_base = mantleC.position.clone();

  // mantle tip (rounded machined point + fins)
  const tipG = grp('mantle_tip', mantleC, [0, -0.02, -0.30]);
  mk(lathe([[0, 0], [0.13, 0.02], [0.16, 0.09], [0.13, 0.17], [0.07, 0.21], [0, 0.22]], 12), M.mach,
    'mantle_tip_cap', tipG, [0, 0, 0], [-Math.PI / 2, 0, 0]);
  mk(new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 1.25, 0, Math.PI * 0.62), M.shellB,
    'mantle_tip_shell', tipG, [0, 0.01, 0.03], [-0.25, 0.5, 0], [1, 0.85, 1.15]);
  mk(plate([[-0.02, 0], [0.02, 0], [0.03, 0.10], [0, 0.16], [-0.03, 0.10]], 0.016, 0.004), M.mach2,
    'mantle_fin_L', tipG, [-0.05, 0.10, -0.02], [Math.PI / 2 - 0.3, 0, 0.4]);
  mk(plate([[-0.02, 0], [0.02, 0], [0.03, 0.10], [0, 0.16], [-0.03, 0.10]], 0.016, 0.004), M.mach2,
    'mantle_fin_R', tipG, [0.05, 0.10, -0.02], [Math.PI / 2 - 0.3, 0, -0.4]);
  boltRing(tipG, [0, 0, 0.02], 0.11, 8, 'y', 0.8);

  // ---- mantle shells (overlapping pressed plates, stopping short of the flanks)
  function dorsalShell(parent, name, r, len, z, y, ts, tl, mat, tilt) {
    const m = mk(wrap(r * 0.98, r, len, ts, tl, 22), mat, name, parent, [0, y, z], [Math.PI / 2 + (tilt || 0), 0, 0]);
    m.material.side = THREE.DoubleSide;
    return m;
  }
  const shA1 = dorsalShell(mantleA, 'mantle_a_shell_top', 0.515, 0.40, -0.13, 0.03, Math.PI * 0.62, 1.95, M.shell);
  const shA2 = dorsalShell(mantleA, 'mantle_a_shell_top2', 0.535, 0.34, -0.44, 0.06, Math.PI * 0.66, 1.80, M.shellB);
  mk(wrap(0.53, 0.545, 0.30, 0.30, 1.15, 16), M.shell, 'mantle_a_shell_flankR', mantleA, [0, 0.02, -0.22], [Math.PI / 2, 0, 0]).material.side = THREE.DoubleSide;
  mk(wrap(0.53, 0.545, 0.30, Math.PI * 2 - 1.45, 1.15, 16), M.shell, 'mantle_a_shell_flankL', mantleA, [0, 0.02, -0.22], [Math.PI / 2, 0, 0]).material.side = THREE.DoubleSide;
  // rolled lips
  mk(new THREE.TorusGeometry(0.515, 0.014, 6, 26, Math.PI * 1.1), M.mach, 'mantle_a_lip', mantleA, [0, 0.03, 0.06], [0, 0, -Math.PI * 0.05]);
  // ribbed bolt-on plate on the dorsal (top read for the camera)
  mk(plate([[-0.20, 0], [0.20, 0], [0.24, 0.16], [0.20, 0.34], [-0.20, 0.34], [-0.24, 0.16]], 0.03, 0.008,
    [[[-0.10, 0.08], [0.10, 0.08], [0.10, 0.13], [-0.10, 0.13]], [[-0.10, 0.20], [0.10, 0.20], [0.10, 0.25], [-0.10, 0.25]]]),
    M.shellB, 'mantle_a_hatch_plate', mantleA, [0, 0.545, -0.10], [Math.PI / 2 - 0.06, 0, 0]);
  boltRow(mantleA, [-0.23, 0.55, -0.09], [0.23, 0.55, -0.09], 7, 0.9);
  boltRow(mantleA, [-0.20, 0.53, -0.42], [0.20, 0.53, -0.42], 6, 0.9);
  mk(plate([[-0.035, 0], [0.035, 0], [0.035, 0.09], [-0.035, 0.09]], 0.014, 0.004), M.accent,
    'mantle_a_tab_accent', mantleA, [0.24, 0.50, -0.30], [Math.PI / 2 - 0.2, 0, -0.25]);
  mk(plate([[-0.03, 0], [0.03, 0], [0.03, 0.07], [-0.03, 0.07]], 0.014, 0.004), M.accent,
    'mantle_a_tab_accent2', mantleA, [-0.245, 0.49, -0.31], [Math.PI / 2 - 0.2, 0, 0.25]);
  mk(new THREE.BoxGeometry(0.05, 0.02, 0.03), glowA, 'mantle_status_port', mantleA, [0.10, 0.555, -0.46], [0.1, 0, 0]);

  // evolve hatches on the mid section (hinge at the dorsal line)
  P.hatch_L = grp('mantle_hatch_L', mantleB, [-0.04, 0.42, -0.26]);
  const hL = mk(wrap(0.44, 0.47, 0.36, Math.PI * 2 - 1.55, 1.25, 16), M.shell, 'mantle_hatch_L_shell', P.hatch_L, [0.04, -0.40, 0], [Math.PI / 2, 0, 0]);
  hL.material.side = THREE.DoubleSide;
  mk(new THREE.TorusGeometry(0.47, 0.012, 6, 18, 1.2), M.mach, 'mantle_hatch_L_lip', P.hatch_L, [0.04, -0.40, -0.17], [0, 0, Math.PI * 1.02]);
  boltRow(P.hatch_L, [-0.30, -0.06, -0.14], [-0.30, -0.06, 0.14], 5, 0.85);
  P.hatch_R = grp('mantle_hatch_R', mantleB, [0.04, 0.42, -0.26]);
  const hR = mk(wrap(0.44, 0.47, 0.36, 0.30, 1.25, 16), M.shell, 'mantle_hatch_R_shell', P.hatch_R, [-0.04, -0.40, 0], [Math.PI / 2, 0, 0]);
  hR.material.side = THREE.DoubleSide;
  mk(new THREE.TorusGeometry(0.47, 0.012, 6, 18, 1.2), M.mach, 'mantle_hatch_R_lip', P.hatch_R, [-0.04, -0.40, -0.17], [0, 0, -0.20]);
  boltRow(P.hatch_R, [0.30, -0.06, -0.14], [0.30, -0.06, 0.14], 5, 0.85);
  P.hatch_top = grp('mantle_hatch_top', mantleB, [0, 0.44, -0.06]);
  mk(plate([[-0.17, 0], [0.17, 0], [0.20, 0.16], [0.14, 0.30], [-0.14, 0.30], [-0.20, 0.16]], 0.028, 0.007,
    [[[-0.07, 0.10], [0.07, 0.10], [0.07, 0.15], [-0.07, 0.15]]]), M.shell,
    'mantle_hatch_top_plate', P.hatch_top, [0, 0.02, -0.02], [Math.PI / 2, 0, 0]);
  boltRow(P.hatch_top, [-0.18, 0.03, -0.02], [0.18, 0.03, -0.02], 6, 0.85);

  dorsalShell(mantleB, 'mantle_b_shell_top', 0.49, 0.34, -0.40, 0.03, Math.PI * 0.63, 1.75, M.shellB, 0.05);
  dorsalShell(mantleC, 'mantle_c_shell_top', 0.36, 0.30, -0.12, 0.01, Math.PI * 0.60, 1.85, M.shell, 0.10);
  dorsalShell(mantleC, 'mantle_c_shell_top2', 0.29, 0.22, -0.28, -0.01, Math.PI * 0.64, 1.70, M.shellB, 0.16);
  mk(wrap(0.40, 0.44, 0.24, 0.35, 1.0, 14), M.shell, 'mantle_b_shell_ventral_R', mantleB, [0, -0.06, -0.30], [Math.PI / 2 + 0.15, 0, 0]).material.side = THREE.DoubleSide;
  mk(wrap(0.40, 0.44, 0.24, Math.PI * 2 - 1.35, 1.0, 14), M.shell, 'mantle_b_shell_ventral_L', mantleB, [0, -0.06, -0.30], [Math.PI / 2 + 0.15, 0, 0]).material.side = THREE.DoubleSide;

  // mantle hoses — each entirely in one section's local space, both ends in ports
  port(mantleA, 'mantle_a_port_in', [0.30, 0.30, -0.02], [0.6, 0.4, 0], 0.10);
  port(mantleA, 'mantle_a_port_out', [0.34, 0.16, -0.48], [1.1, 0.5, 0], 0.10);
  hose(mantleA, 'hose_mantle_a_R', [[0.30, 0.30, -0.02], [0.40, 0.26, -0.16], [0.42, 0.18, -0.34], [0.34, 0.16, -0.48]], 0.026);
  port(mantleA, 'mantle_a_port_inL', [-0.30, 0.30, -0.02], [0.6, -0.4, 0], 0.10);
  port(mantleA, 'mantle_a_port_outL', [-0.34, 0.16, -0.48], [1.1, -0.5, 0], 0.10);
  hose(mantleA, 'hose_mantle_a_L', [[-0.30, 0.30, -0.02], [-0.40, 0.26, -0.16], [-0.42, 0.18, -0.34], [-0.34, 0.16, -0.48]], 0.026);
  hose(mantleA, 'wire_mantle_a_L', [[-0.28, 0.33, -0.03], [-0.36, 0.31, -0.18], [-0.37, 0.24, -0.36], [-0.32, 0.19, -0.47]], 0.008);
  hose(mantleA, 'wire_mantle_a_R', [[0.28, 0.33, -0.03], [0.36, 0.31, -0.18], [0.37, 0.24, -0.36], [0.32, 0.19, -0.47]], 0.008);
  port(mantleB, 'mantle_b_port_in', [0.30, 0.22, -0.03], [0.7, 0.4, 0], 0.09);
  port(mantleB, 'mantle_b_port_out', [0.20, 0.10, -0.46], [1.1, 0.4, 0], 0.09);
  hose(mantleB, 'hose_mantle_b_R', [[0.30, 0.22, -0.03], [0.38, 0.16, -0.20], [0.30, 0.11, -0.36], [0.20, 0.10, -0.46]], 0.024);
  port(mantleB, 'mantle_b_port_inL', [-0.30, 0.22, -0.03], [0.7, -0.4, 0], 0.09);
  port(mantleB, 'mantle_b_port_outL', [-0.20, 0.10, -0.46], [1.1, -0.4, 0], 0.09);
  hose(mantleB, 'hose_mantle_b_L', [[-0.30, 0.22, -0.03], [-0.38, 0.16, -0.20], [-0.30, 0.11, -0.36], [-0.20, 0.10, -0.46]], 0.024);
  hose(mantleB, 'wire_mantle_b', [[-0.10, 0.42, -0.05], [0.0, 0.45, -0.24], [0.10, 0.42, -0.44]], 0.007);
  port(mantleC, 'mantle_c_port_in', [0.18, 0.16, -0.03], [0.8, 0.4, 0], 0.08);
  port(mantleC, 'mantle_c_port_out', [0.08, 0.05, -0.28], [1.2, 0.3, 0], 0.08);
  hose(mantleC, 'hose_mantle_c', [[0.18, 0.16, -0.03], [0.22, 0.11, -0.15], [0.14, 0.06, -0.24], [0.08, 0.05, -0.28]], 0.020);

  // ============================================================ ARM CROWN (hip block)
  const crown = grp('arm_crown', core, [0, 0.42, 0.18]);
  P.crown = crown;
  mk(lathe([[0.06, 0.16], [0.24, 0.15], [0.34, 0.10], [0.39, 0.02], [0.37, -0.08], [0.26, -0.17], [0.12, -0.21], [0, -0.22]], 20),
    M.mach, 'crown_hub', crown);
  mk(new THREE.TorusGeometry(0.375, 0.045, 8, 26), M.mach2, 'crown_ring', crown, [0, 0.0, 0], [Math.PI / 2, 0, 0]);
  mk(lathe([[0.05, 0], [0.20, 0.02], [0.24, 0.07], [0.20, 0.12], [0.06, 0.14], [0, 0.13]], 16), M.bronze,
    'crown_gear_stack', crown, [0, -0.16, 0], [Math.PI, 0, 0]);
  mk(new THREE.SphereGeometry(0.30, 16, 10, 0, Math.PI * 1.15, Math.PI * 0.42, Math.PI * 0.5), M.shell,
    'crown_shell_ventral_R', crown, [0, -0.02, 0.02], [0.15, 0.6, 0], [1.05, 0.9, 1.05]).material.side = THREE.DoubleSide;
  mk(new THREE.SphereGeometry(0.30, 16, 10, 0, Math.PI * 1.15, Math.PI * 0.42, Math.PI * 0.5), M.shellB,
    'crown_shell_ventral_L', crown, [0, -0.02, 0.02], [0.15, Math.PI + 0.5, 0], [1.05, 0.9, 1.05]).material.side = THREE.DoubleSide;
  boltRing(crown, [0, 0.12, 0], 0.30, 12, 'y', 0.9);
  boltRing(crown, [0, -0.19, 0], 0.16, 8, 'y', 0.85);
  port(crown, 'crown_port_a', [0.16, 0.13, 0.26], [0.5, 0, 0], 0.09);
  port(crown, 'crown_port_b', [-0.16, 0.13, 0.26], [0.5, 0, 0], 0.09);
  hose(crown, 'hose_crown_front', [[0.16, 0.13, 0.26], [0.07, 0.06, 0.33], [-0.07, 0.06, 0.33], [-0.16, 0.13, 0.26]], 0.022);
  port(crown, 'crown_port_c', [0.24, 0.10, -0.20], [0.4, 2.6, 0], 0.09);
  port(crown, 'crown_port_d', [-0.24, 0.10, -0.20], [0.4, -2.6, 0], 0.09);
  hose(crown, 'hose_crown_rear', [[0.24, 0.10, -0.20], [0.12, 0.02, -0.30], [-0.12, 0.02, -0.30], [-0.24, 0.10, -0.20]], 0.022);
  hose(crown, 'wire_crown', [[0.20, 0.14, 0.20], [0.26, 0.10, 0.0], [0.20, 0.13, -0.18]], 0.007);

  // ============================================================ LEADING END — HEAD
  const head = grp('head', core, [0, 0.50, 0.16]);
  P.head = head;
  // neck hardware (visible join, nothing floats)
  mk(new THREE.TorusGeometry(0.24, 0.038, 8, 20), M.mach2, 'neck_race', head, [0, 0.02, -0.05], [0, 0, 0]);
  mk(lathe([[0.05, 0], [0.19, 0.02], [0.22, 0.06], [0.18, 0.10], [0.05, 0.11], [0, 0.10]], 16), M.bronze,
    'neck_gear_a', head, [0, 0.02, -0.02], [Math.PI / 2, 0, 0]);
  mk(gearGeo, M.bronze, 'neck_gear_b', head, [0, 0.02, 0.02], [Math.PI / 2, 0, 0], [0.16, 1, 0.16]);
  boltRing(head, [0, 0.02, -0.06], 0.20, 10, 'x', 0.85);
  // skull mass: several intersecting volumes
  mk(new THREE.CylinderGeometry(0.24, 0.32, 0.42, 8), M.mach, 'skull_core', head, [0, 0.05, 0.15], [Math.PI / 2, Math.PI / 8, 0], [1, 1, 0.82]);
  mk(plate([[-0.20, -0.10], [0.20, -0.10], [0.26, 0.06], [0.20, 0.20], [-0.20, 0.20], [-0.26, 0.06]], 0.10, 0.012),
    M.mach2, 'skull_underframe', head, [0, -0.14, 0.16], [Math.PI / 2, 0, 0]);
  mk(plate([[-0.14, 0], [0.14, 0], [0.17, 0.09], [0.10, 0.17], [-0.10, 0.17], [-0.17, 0.09]], 0.09, 0.010),
    M.mach, 'skull_snout_block', head, [0, -0.02, 0.34], [Math.PI / 2, 0, 0]);
  // faceted skull domes (two shells, split by a ridge)
  mk(new THREE.SphereGeometry(0.30, 20, 12, 0.10, Math.PI * 0.85, 0, Math.PI * 0.55), M.shell,
    'skull_shell_R', head, [0.01, 0.02, 0.13], [-0.18, 0, 0], [1.0, 0.78, 1.22]).material.side = THREE.DoubleSide;
  mk(new THREE.SphereGeometry(0.30, 20, 12, Math.PI + 0.10, Math.PI * 0.85, 0, Math.PI * 0.55), M.shellB,
    'skull_shell_L', head, [-0.01, 0.02, 0.13], [-0.18, 0, 0], [1.0, 0.78, 1.22]).material.side = THREE.DoubleSide;
  mk(plate([[-0.055, 0], [0.055, 0], [0.065, 0.14], [0.05, 0.34], [-0.05, 0.34], [-0.065, 0.14]], 0.035, 0.008,
    [[[-0.022, 0.06], [0.022, 0.06], [0.022, 0.12], [-0.022, 0.12]]]), M.shell,
    'skull_ridge_plate', head, [0, 0.245, -0.02], [Math.PI / 2 - 0.22, 0, 0]);
  mk(plate([[-0.10, 0], [0.10, 0], [0.13, 0.08], [0.09, 0.17], [-0.09, 0.17], [-0.13, 0.08]], 0.028, 0.007),
    M.shellB, 'skull_crest_front', head, [0, 0.205, 0.22], [Math.PI / 2 - 0.45, 0, 0]);
  mk(plate([[-0.16, 0], [0.16, 0], [0.19, 0.07], [0.15, 0.15], [-0.15, 0.15], [-0.19, 0.07]], 0.026, 0.007,
    [[[-0.05, 0.05], [0.05, 0.05], [0.05, 0.09], [-0.05, 0.09]]]), M.shell,
    'skull_crest_rear', head, [0, 0.235, -0.04], [Math.PI / 2 - 0.12, 0, 0]);
  boltRow(head, [-0.15, 0.24, -0.03], [0.15, 0.24, -0.03], 6, 0.85);
  boltRow(head, [-0.09, 0.215, 0.26], [0.09, 0.215, 0.26], 4, 0.8);
  mk(new THREE.BoxGeometry(0.035, 0.016, 0.024), glowB, 'head_status_port', head, [-0.14, 0.20, 0.10], [0.2, 0, 0.2]);
  // brow + cheek plates
  [1, -1].forEach(sd => {
    const t = sd > 0 ? 'R' : 'L';
    mk(plate([[-0.10, 0], [0.10, 0], [0.12, 0.06], [0.06, 0.12], [-0.10, 0.10]], 0.026, 0.006), M.shell,
      'brow_' + t, head, [sd * 0.24, 0.17, 0.10], [Math.PI / 2 - 0.5, sd * 0.5, 0]);
    mk(plate([[-0.09, 0], [0.09, 0], [0.11, 0.10], [0.05, 0.19], [-0.09, 0.16]], 0.024, 0.006), M.shellB,
      'cheek_' + t, head, [sd * 0.30, -0.05, 0.06], [0.15, sd * 1.15, sd * 0.2]);
    mk(new THREE.CylinderGeometry(0.012, 0.016, 0.10, 6), M.mach2, 'sensor_stalk_' + t, head, [sd * 0.12, 0.26, 0.12], [-0.35, 0, sd * 0.3]);
    mk(new THREE.SphereGeometry(0.018, 8, 6), M.lens, 'sensor_cap_' + t, head, [sd * 0.135, 0.31, 0.135]);
  });
  // eye turrets — the expensive part
  [1, -1].forEach(sd => {
    const t = sd > 0 ? 'R' : 'L';
    const eg = grp('eye_turret_' + t, head, [sd * 0.255, 0.09, 0.09], [0, sd * 1.0, 0]);
    P['eye_' + t] = eg;
    mk(lathe([[0.03, -0.02], [0.14, -0.01], [0.16, 0.03], [0.155, 0.075], [0.125, 0.105], [0.10, 0.115]], 18),
      M.mach, 'eye_housing_' + t, eg, [0, 0, 0], [Math.PI / 2, 0, 0]);
    mk(lathe([[0.10, 0], [0.145, 0.005], [0.152, 0.028], [0.128, 0.045], [0.10, 0.048]], 20), M.mach2,
      'eye_bezel_' + t, eg, [0, 0, 0.09], [Math.PI / 2, 0, 0]);
    mk(new THREE.TorusGeometry(0.113, 0.011, 6, 20), M.bronze, 'eye_bezel_ring_' + t, eg, [0, 0, 0.10]);
    mk(new THREE.SphereGeometry(0.098, 20, 14), M.lens, 'eye_lens_' + t, eg, [0, 0, 0.045], [0, 0, 0], [1, 1, 0.7]);
    mk(new THREE.TorusGeometry(0.062, 0.012, 6, 16), M.mach2, 'eye_iris_ring_' + t, eg, [0, 0, 0.095]);
    const lu = grp('eye_lid_upper_' + t, eg, [0, 0, 0.055]);
    mk(new THREE.SphereGeometry(0.125, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.34), M.shell,
      'eye_lid_upper_shell_' + t, lu, [0, 0, 0], [Math.PI / 2, 0, 0], [1, 0.7, 1]).material.side = THREE.DoubleSide;
    mk(new THREE.TorusGeometry(0.070, 0.010, 5, 14, Math.PI), M.mach, 'eye_lid_upper_lip_' + t, lu, [0, 0.088, 0.02], [Math.PI / 2, 0, 0]);
    P['lidU_' + t] = lu;
    const ll = grp('eye_lid_lower_' + t, eg, [0, 0, 0.055]);
    mk(new THREE.SphereGeometry(0.122, 18, 10, 0, Math.PI * 2, Math.PI * 0.66, Math.PI * 0.34), M.shellB,
      'eye_lid_lower_shell_' + t, ll, [0, 0, 0], [Math.PI / 2, 0, 0], [1, 0.7, 1]).material.side = THREE.DoubleSide;
    P['lidL_' + t] = ll;
    boltRing(eg, [0, 0, 0.035], 0.135, 8, 'y', 0.8);
    mk(collarGeo, M.mach, 'eye_port_' + t, eg, [0.10, -0.09, -0.02], [1.4, 0, 0], 0.08);
    mk(collarGeo, M.mach, 'eye_port2_' + t, eg, [-0.02, -0.11, 0.06], [1.4, 0, 0], 0.07);
    hose(eg, 'hose_eye_' + t, [[0.10, -0.09, -0.02], [0.07, -0.15, 0.01], [0.01, -0.15, 0.05], [-0.02, -0.11, 0.06]], 0.016);
    mk(new THREE.BoxGeometry(0.03, 0.022, 0.05), M.mach2, 'eye_drive_block_' + t, eg, [-0.11, -0.05, -0.02], [0, 0.3, 0]);
    mk(gearGeo, M.bronze, 'eye_drive_gear_' + t, eg, [-0.11, 0.02, -0.02], [0, 0, Math.PI / 2], [0.035, 1, 0.035]);
  });
  // beak (the gripping/biting mechanism) in a machined mouth ring
  const mouth = grp('mouth', head, [0, -0.15, 0.30], [0.35, 0, 0]);
  P.mouth = mouth;
  mk(new THREE.TorusGeometry(0.095, 0.028, 8, 20), M.mach2, 'mouth_ring', mouth);
  mk(lathe([[0.02, 0], [0.09, 0.01], [0.11, 0.05], [0.08, 0.09], [0.02, 0.10]], 14), M.mach, 'mouth_housing', mouth, [0, 0, -0.06], [Math.PI / 2, 0, 0]);
  const bu = grp('beak_upper', mouth, [0, 0.055, 0.0]);
  mk(new THREE.CylinderGeometry(0.008, 0.062, 0.14, 5), M.bronze, 'beak_upper_blade', bu, [0, -0.03, 0.06], [Math.PI / 2 + 0.5, 0, 0]);
  mk(plate([[-0.05, 0], [0.05, 0], [0.04, 0.06], [-0.04, 0.06]], 0.02, 0.005), M.shellB, 'beak_upper_plate', bu, [0, 0.0, -0.01], [Math.PI / 2 - 0.4, 0, 0]);
  P.beak_upper = bu;
  const bl = grp('beak_lower', mouth, [0, -0.055, 0.0]);
  mk(new THREE.CylinderGeometry(0.008, 0.058, 0.12, 5), M.bronze, 'beak_lower_blade', bl, [0, 0.025, 0.055], [Math.PI / 2 - 0.5, 0, 0]);
  mk(plate([[-0.045, 0], [0.045, 0], [0.035, 0.05], [-0.035, 0.05]], 0.02, 0.005), M.shell, 'beak_lower_plate', bl, [0, 0.0, -0.01], [Math.PI / 2 + 0.4, 0, 0]);
  P.beak_lower = bl;
  [1, -1].forEach(sd => {
    mk(plate([[-0.03, 0], [0.03, 0], [0.035, 0.05], [0.0, 0.08], [-0.035, 0.05]], 0.016, 0.004), M.shell,
      'mandible_guard_' + (sd > 0 ? 'R' : 'L'), mouth, [sd * 0.10, 0.0, 0.02], [0, sd * 0.6, 0]);
    mk(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8), M.mach, 'beak_ram_' + (sd > 0 ? 'R' : 'L'), mouth, [sd * 0.07, 0.05, -0.05], [0.6, 0, 0]);
  });
  boltRing(mouth, [0, 0, -0.03], 0.085, 8, 'y', 0.7);
  // funnel / siphon — the octopus tell, bolted to the right cheek
  const siphon = grp('siphon', head, [0.20, -0.06, 0.14], [0.5, 0.55, 0]);
  P.siphon = siphon;
  mk(lathe([[0.02, 0], [0.085, 0.01], [0.09, 0.06], [0.075, 0.14], [0.055, 0.20], [0.062, 0.23], [0.04, 0.24], [0.02, 0.23]], 16),
    M.mach, 'siphon_nozzle', siphon, [0, 0, 0], [Math.PI / 2, 0, 0]);
  mk(collarGeo, M.mach2, 'siphon_collar', siphon, [0, 0, 0.02], [Math.PI / 2, 0, 0], 0.09);
  mk(new THREE.TorusGeometry(0.075, 0.018, 6, 14), M.rubber, 'siphon_boot', siphon, [0, 0, 0.07], [0, 0, 0]);
  mk(new THREE.CylinderGeometry(0.016, 0.016, 0.10, 8), M.bronze, 'siphon_ram', siphon, [0.07, 0.02, 0.08], [Math.PI / 2, 0, 0]);
  mk(clevisGeo, M.mach2, 'siphon_clevis', siphon, [0.07, 0.02, 0.15], [Math.PI / 2, 0, 0], 0.6);
  boltRing(siphon, [0, 0, 0.02], 0.085, 7, 'y', 0.7);
  // head trunk hoses (both ends in ports, inside head local space)
  port(head, 'head_port_a', [0.12, 0.14, -0.02], [1.0, 0.4, 0], 0.09);
  port(head, 'head_port_b', [0.17, -0.06, 0.22], [1.4, 0.3, 0], 0.09);
  hose(head, 'hose_head_R', [[0.12, 0.14, -0.02], [0.22, 0.10, 0.02], [0.25, 0.0, 0.14], [0.17, -0.06, 0.22]], 0.026);
  port(head, 'head_port_c', [-0.12, 0.14, -0.02], [1.0, -0.4, 0], 0.09);
  port(head, 'head_port_d', [-0.17, -0.06, 0.22], [1.4, -0.3, 0], 0.09);
  hose(head, 'hose_head_L', [[-0.12, 0.14, -0.02], [-0.22, 0.10, 0.02], [-0.25, 0.0, 0.14], [-0.17, -0.06, 0.22]], 0.026);
  hose(head, 'wire_head_L', [[-0.10, 0.16, -0.01], [-0.19, 0.13, 0.04], [-0.21, 0.03, 0.15], [-0.15, -0.03, 0.21]], 0.008);
  hose(head, 'wire_head_R', [[0.10, 0.16, -0.01], [0.19, 0.13, 0.04], [0.21, 0.03, 0.15], [0.15, -0.03, 0.21]], 0.008);

  // ============================================================ ARMS
  const SEGL = [0.42, 0.378, 0.340, 0.306, 0.276, 0.248, 0.223];
  const SEGR = [0.135, 0.118, 0.102, 0.088, 0.074, 0.060, 0.046];
  const SEGR2 = [0.118, 0.102, 0.088, 0.074, 0.060, 0.046, 0.030];
  const SG = SEGL.map((L, j) => {
    const r = SEGR[j], r2 = SEGR2[j];
    return {
      block: new THREE.CylinderGeometry(r2 * 0.95, r * 0.95, L * 0.94, 8),
      top: plate([[-r * 0.60, 0.015], [r * 0.60, 0.015], [r * 0.48, L * 0.78], [-r * 0.48, L * 0.78]], Math.max(0.012, r * 0.20), 0.006),
      side: plate([[-r * 0.35, 0], [r * 0.35, 0], [r * 0.28, L * 0.5], [-r * 0.28, L * 0.5]], 0.012, 0.004),
      shell: wrap(r2 + 0.032, r + 0.038, L * 0.84, Math.PI * 0.55, 2.0, 16),
      flank: wrap(r2 + 0.026, r + 0.032, L * 0.62, 0.55, 1.1, 12),
      barrel: new THREE.CylinderGeometry(r * 1.02, r * 1.02, r * 2.1, 12),
      L, r, r2
    };
  });
  const ARCH = [-1.0, -0.55, 0.35, 0.5, 0.4, 0.25, 0.1];
  const LIMP = [0.55, 0.48, 0.10, 0.10, 0.08, 0.05, 0.04];
  const REST_P = [0.45, 0.30, -0.75, 0.02, -0.05, -0.12, -0.25];
  const ARM_DEF = [
    { n: 'arm_FR', yaw: 0.30, len: 1.00 }, { n: 'arm_FL', yaw: -0.30, len: 1.00 },
    { n: 'arm_MR', yaw: 0.95, len: 0.95 }, { n: 'arm_ML', yaw: -0.95, len: 0.95 },
    { n: 'arm_BR', yaw: 1.75, len: 0.90 }, { n: 'arm_BL', yaw: -1.75, len: 0.90 },
    { n: 'arm_RR', yaw: 2.55, len: 0.82 }, { n: 'arm_RL', yaw: -2.55, len: 0.82 }
  ];
  const OFFS = [0.0, 0.5, 0.28, 0.78, 0.62, 0.12, 0.86, 0.36];
  const arms = [];

  ARM_DEF.forEach((def, ai) => {
    const sign = def.yaw >= 0 ? 1 : -1;
    const A = grp(def.n, crown, [Math.sin(def.yaw) * 0.33, -0.03, Math.cos(def.yaw) * 0.33], [0, def.yaw, 0]);
    A.scale.setScalar(def.len);
    // root socket hardware
    mk(discGeo, M.mach, def.n + '_root_race', A, [0, 0, 0.01], [Math.PI / 2, 0, 0], 0.20);
    mk(collarGeo, M.mach2, def.n + '_root_collar', A, [0, 0, 0.05], [Math.PI / 2, 0, 0], 0.15);
    mk(new THREE.TorusGeometry(0.14, 0.022, 6, 14), M.rubber, def.n + '_root_boot', A, [0, 0, 0.02]);
    boltRing(A, [0, 0, 0.03], 0.155, 8, 'y', 0.8);

    let parent = A;
    const segs = [];
    for (let j = 0; j < 7; j++) {
      const g = grp(def.n + '_seg' + j, parent, [0, 0, j === 0 ? 0.06 : SG[j - 1].L]);
      const s = SG[j];
      mk(s.block, M.mach, def.n + '_block' + j, g, [0, 0, s.L * 0.5], [Math.PI / 2, 0, 0]);
      mk(s.top, M.mach2, def.n + '_topplate' + j, g, [0, s.r * 0.86, 0], [Math.PI / 2, 0, 0]);
      mk(s.side, M.mach2, def.n + '_sideplate' + j, g, [sign * s.r * 0.85, 0, s.L * 0.15], [Math.PI / 2, sign * Math.PI / 2, 0]);
      // joint barrel + races
      mk(s.barrel, M.mach2, def.n + '_barrel' + j, g, [0, 0, 0], [0, 0, Math.PI / 2]);
      mk(discGeo, M.bronze, def.n + '_raceR' + j, g, [s.r * 1.05, 0, 0], [0, 0, Math.PI / 2], s.r * 1.25);
      mk(discGeo, M.bronze, def.n + '_raceL' + j, g, [-s.r * 1.05, 0, 0], [0, 0, -Math.PI / 2], s.r * 1.25);
      mk(new THREE.TorusGeometry(s.r * 0.95, s.r * 0.20, 6, 12), M.rubber, def.n + '_boot' + j, g, [0, 0, 0], [0, 0, 0]);
      // shells (top, and alternating flank so they lap)
      const sh = mk(s.shell, j % 2 ? M.shellB : M.shell, def.n + '_shell' + j, g, [0, 0, s.L * 0.46], [Math.PI / 2, 0, 0]);
      sh.material.side = THREE.DoubleSide;
      mk(new THREE.TorusGeometry(s.r + 0.036, 0.008, 5, 14, 2.0), M.mach, def.n + '_shell_lip' + j, g,
        [0, 0, s.L * 0.05], [0, 0, Math.PI * 0.55 + 1.0]);
      if (j % 2 === 0 && j < 6) {
        const fl = mk(s.flank, M.shell, def.n + '_flank' + j, g, [0, 0, s.L * 0.55], [Math.PI / 2, 0, sign > 0 ? 0 : Math.PI]);
        fl.material.side = THREE.DoubleSide;
      }
      // suckers (biserial rows, underside)
      const su = grp(def.n + '_suckers' + j, g, [0, -s.r * 0.80, 0]);
      const sc = s.r / 0.135;
      mk(suckerGeo, M.bronze, def.n + '_sucker' + j + 'a', su, [-s.r * 0.34, 0, s.L * 0.28], [0, 0, 0], sc);
      mk(suckerGeo, M.bronze, def.n + '_sucker' + j + 'b', su, [s.r * 0.34, 0, s.L * 0.58], [0, 0, 0], sc);
      if (j < 4) mk(suckerGeo, M.bronze, def.n + '_sucker' + j + 'c', su, [-s.r * 0.30, 0, s.L * 0.82], [0, 0, 0], sc * 0.85);
      mk(plate([[-s.r * 0.5, 0], [s.r * 0.5, 0], [s.r * 0.42, s.L * 0.8], [-s.r * 0.42, s.L * 0.8]], 0.010, 0.003),
        M.mach2, def.n + '_sucker_rail' + j, su, [0, 0.012, 0], [Math.PI / 2, 0, 0]);
      // tendon chain on top of the inner segments
      if (j < 4) {
        const pts = [];
        for (let i = 0; i < 5; i++) pts.push([0, s.r * 0.86 + 0.030, s.L * (0.08 + 0.20 * i)]);
        chainRun(g, def.n + '_chain' + j, pts, s.r / 0.135);
        mk(gearGeo, M.bronze, def.n + '_sprocket' + j, g, [0, s.r * 0.86 + 0.030, 0.0], [0, 0, Math.PI / 2], [s.r * 0.28, 0.7, s.r * 0.28]);
      }
      // ram alongside the inner segments
      if (j < 3) {
        const rx = -sign * (s.r * 0.9);
        mk(barrelGeo, M.mach, def.n + '_ram_barrel' + j, g, [rx, s.r * 0.20, s.L * 0.06], [-Math.PI / 2, 0, 0], s.r / 0.135);
        mk(rodGeo, M.bronze, def.n + '_ram_rod' + j, g, [rx, s.r * 0.20, s.L * 0.62], [Math.PI / 2, 0, 0], [s.r / 0.135, s.L * 0.30, s.r / 0.135]);
        mk(bootGeo, M.rubber, def.n + '_ram_boot' + j, g, [rx, s.r * 0.20, s.L * 0.44], [0, 0, 0], s.r / 0.135);
        mk(clevisGeo, M.mach2, def.n + '_ram_clevis' + j, g, [rx, s.r * 0.20, s.L * 0.78], [Math.PI / 2, 0, 0], s.r / 0.135 * 0.8);
        mk(new THREE.BoxGeometry(0.03, 0.024, 0.03), M.mach2, def.n + '_ram_lug' + j, g, [rx * 0.7, s.r * 0.55, s.L * 0.80], [0, 0, 0], s.r / 0.135);
      }
      boltRow(g, [-s.r * 0.55, s.r * 0.86 + 0.012, s.L * 0.12], [s.r * 0.55, s.r * 0.86 + 0.012, s.L * 0.12], 3, s.r / 0.135 * 0.8);
      // hose on the base segments only — split at the joint, both ends in ports
      if (j < 2) {
        port(g, def.n + '_port_a' + j, [-sign * s.r * 0.55, s.r * 0.55, s.L * 0.06], [1.2, 0, 0], 0.075);
        port(g, def.n + '_port_b' + j, [-sign * s.r * 0.35, s.r * 0.45, s.L * 0.86], [1.2, 0, 0], 0.070);
        hose(g, def.n + '_hose' + j, [
          [-sign * s.r * 0.55, s.r * 0.55, s.L * 0.06],
          [-sign * s.r * 0.95, s.r * 0.20, s.L * 0.32],
          [-sign * s.r * 0.90, s.r * 0.22, s.L * 0.62],
          [-sign * s.r * 0.35, s.r * 0.45, s.L * 0.86]], 0.020);
        hose(g, def.n + '_wire' + j, [
          [-sign * s.r * 0.45, s.r * 0.62, s.L * 0.08],
          [-sign * s.r * 0.72, s.r * 0.42, s.L * 0.45],
          [-sign * s.r * 0.30, s.r * 0.52, s.L * 0.84]], 0.007);
      }
      segs.push(g);
      parent = g;
    }
    // arm tip
    const tp = grp(def.n + '_tip', parent, [0, 0, SG[6].L]);
    mk(new THREE.CylinderGeometry(0.008, 0.030, 0.14, 6), M.mach, def.n + '_tip_cone', tp, [0, 0, 0.07], [Math.PI / 2, 0, 0]);
    mk(plate([[-0.018, 0], [0.018, 0], [0.012, 0.09], [-0.012, 0.09]], 0.010, 0.003), M.shell, def.n + '_tip_plate_a', tp, [0, 0.022, 0.01], [Math.PI / 2 - 0.15, 0, 0]);
    mk(plate([[-0.016, 0], [0.016, 0], [0.010, 0.07], [-0.010, 0.07]], 0.010, 0.003), M.shellB, def.n + '_tip_plate_b', tp, [0, -0.020, 0.01], [Math.PI / 2 + 0.15, 0, 0]);
    mk(new THREE.SphereGeometry(0.013, 8, 6), M.lens, def.n + '_tip_sensor', tp, [0, 0.004, 0.135]);
    mk(collarGeo, M.mach2, def.n + '_tip_collar', tp, [0, 0, 0.01], [Math.PI / 2, 0, 0], 0.032);

    arms.push({
      group: A, segs, yaw: def.yaw, sign, off: OFFS[ai],
      restP: REST_P.slice(), restY: [0, sign * 0.04, sign * 0.07, sign * 0.05, sign * 0.03, sign * 0.02, 0]
    });
  });

  // ============================================================ POSE
  const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  const lerp = (a, b, k) => a + (b - a) * k;
  const es = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
  const sg = (p, a, b) => clamp01((p - a) / (b - a));
  const frac = (x) => x - Math.floor(x);

  root.userData.pose = (s) => {
    const sp = Math.max(0, s.speed || 0);
    const st = s.stride || 0;
    const turn = s.turn || 0;
    const hp = (s.health === undefined || s.health === null) ? 1 : s.health;
    const t = s.t || 0;
    const grounded = s.grounded !== false;
    const act = s.action || null;
    const ph = clamp01(s.phase || 0);

    // gait weights
    const creep = 1 - clamp01(sp / 0.9);
    const walkK = clamp01(sp / 1.0);
    const run = clamp01((sp - 1.6) / 1.6);
    const flat = clamp01((sp - 3.2) / 2.8);
    const breathe = Math.sin(t * 1.15) * 0.5 + 0.5;

    // channels
    let bodyX = 0, bodyY = 0, bodyZ = 0, bodyPitch = 0, bodyYaw = 0, bodyRoll = 0;
    let mA = -0.04, mB = -0.02, mC = -0.01, mYaw = 0, mRoll = 0, mScale = 1, mCz = 0;
    let hPitch = -0.02, hYaw = 0, hRoll = 0;
    let eyeYaw = 0, eyePitch = 0, lid = 0;
    let beak = 0.06, siphonA = 0, siphonS = 1;
    let hatch = 0;

    const AO = arms.map((A) => ({
      yawAdd: 0, pitchAll: 0, curl: 0, straighten: 0, arch: 0, spread: 0, roll: 0,
      rootPitch: 0, rootRoll: 0, limp: 0,
      waveAmp: 0.035, wavePhase: t * 0.20 + A.off, waveLag: 0.62
    }));

    // ---------------- LOCOMOTION ----------------
    if (!act) {
      // idle hardware
      mA += Math.sin(t * 0.9) * 0.018 - creep * 0.02;
      mB += Math.sin(t * 0.7 + 1.0) * 0.012;
      mC += Math.sin(t * 0.55 + 2.0) * 0.014;
      hYaw += Math.sin(t * 0.31) * 0.22 * (1 - walkK * 0.6);
      hPitch += Math.sin(t * 0.47) * 0.05;
      eyeYaw += Math.sin(t * 0.31 + 1.1) * 0.16;
      eyePitch += Math.sin(t * 0.4) * 0.05;
      lid = 0.10 + (Math.sin(t * 0.9) > 0.985 ? 0.85 : 0);
      siphonA = 0.10 * Math.sin(t * 1.15) + walkK * 0.10;
      siphonS = 1 + (breathe - 0.5) * 0.10;
      mScale = 1 + (breathe - 0.5) * 0.035 * (1 - flat * 0.5);

      bodyY += -creep * 0.09 + run * 0.04 + flat * 0.05;
      bodyPitch += creep * 0.03 - flat * 0.05;
      mA += creep * 0.10 - run * 0.10 - flat * 0.10;
      mB += -run * 0.05 - flat * 0.08;
      hPitch += creep * 0.10 - flat * 0.12;

      if (grounded) {
        bodyY += Math.sin(st * TAU * 2) * 0.020 * walkK;
        bodyRoll += Math.sin(st * TAU) * 0.030 * walkK;
        bodyPitch += Math.sin(st * TAU * 2 + 1.0) * 0.015 * walkK;

        arms.forEach((A, i) => {
          const o = AO[i];
          const cyc = frac(st + A.off);
          const swing = cyc < 0.5 ? Math.sin(cyc / 0.5 * Math.PI) : 0;
          const stance = 1 - swing;
          const amp = 0.30 + 0.35 * walkK + 0.45 * run + 0.35 * flat;
          const reach = (0.10 + 0.16 * walkK + 0.16 * run + 0.14 * flat);
          o.arch = swing * amp * (sp > 0.05 ? 1 : 0);
          o.yawAdd = -A.sign * reach * (-Math.cos(cyc * TAU));
          o.straighten = (0.10 + 0.30 * run + 0.30 * flat) * stance + creep * -0.05;
          o.curl = creep * 0.18 - flat * 0.10 + swing * 0.05;
          o.pitchAll = -0.05 * run - 0.08 * flat + stance * 0.05 * walkK;
          o.spread = -0.06 * creep + 0.10 * flat;
          o.waveAmp = 0.03 + 0.05 * walkK + 0.06 * flat;
          o.wavePhase = st * (1 + run * 0.5) + A.off;
          o.waveLag = 0.55;
        });
        // front pair probe ahead when creeping
        [0, 1].forEach(i => {
          AO[i].waveAmp += creep * 0.07;
          AO[i].wavePhase = t * 0.35 + arms[i].off;
          AO[i].pitchAll -= creep * 0.10;
        });
      } else {
        // AIRBORNE — arms trail and flutter, mantle streams up, no stepping
        mA -= 0.16; mB -= 0.10; mC -= 0.06;
        hPitch -= 0.10; bodyPitch -= 0.06; bodyY += 0.03;
        lid = 0.25;
        arms.forEach((A, i) => {
          const o = AO[i];
          o.arch = 0;
          o.yawAdd = A.sign * 0.16;
          o.straighten = 0.55;
          o.pitchAll = 0.30;
          o.curl = -0.05;
          o.spread = 0.10;
          o.waveAmp = 0.10;
          o.wavePhase = t * 0.85 + A.off;
          o.waveLag = 0.75;
        });
      }

      // TURN overlay
      if (turn) {
        hYaw += turn * 0.50;
        mYaw += -turn * 0.26;
        mRoll += -turn * 0.10;
        bodyRoll += -turn * 0.12;
        eyeYaw += turn * 0.20;
        arms.forEach((A, i) => {
          const inside = (A.sign === (turn < 0 ? -1 : 1));
          AO[i].curl += inside ? 0.22 * Math.abs(turn) : -0.05 * Math.abs(turn);
          AO[i].straighten += inside ? -0.10 * Math.abs(turn) : 0.16 * Math.abs(turn);
          AO[i].yawAdd += -turn * 0.10;
        });
      }

      // HURT overlay
      if (hp < 0.999) {
        const k = clamp01(1 - hp);
        mA += 0.20 * k; mB += 0.10 * k; mRoll += -0.16 * k;
        hPitch += 0.24 * k; hRoll += 0.14 * k;
        bodyY -= 0.06 * k; bodyRoll += 0.10 * k; bodyPitch += 0.05 * k;
        lid = Math.max(lid, 0.45 * k);
        AO[3].limp = 0.85 * k;
        AO[5].limp = 0.45 * k;
        AO[2].curl += 0.12 * k;
        arms.forEach((A, i) => { AO[i].waveAmp *= (1 - 0.4 * k); });
      }
    } else {
      // ---------------- ACTIONS ----------------
      const setAll = (f) => AO.forEach((o, i) => f(o, i, arms[i]));
      const fr = [0, 1], md = [2, 3], bk = [4, 5], rr = [6, 7];
      const grpSet = (list, f) => list.forEach(i => f(AO[i], arms[i], i));

      if (act === 'attack') {
        const w = es(sg(ph, 0, 0.28)), c = es(sg(ph, 0.28, 0.5)), r = es(sg(ph, 0.5, 1));
        bodyZ = -0.12 * w + 0.40 * c - 0.28 * r;
        bodyY = -0.06 * w + 0.08 * c - 0.02 * r;
        bodyPitch = 0.10 * w - 0.20 * c + 0.10 * r;
        mA += -0.28 * w + 0.34 * c - 0.06 * r;
        mB += -0.12 * w + 0.14 * c - 0.02 * r;
        hPitch += -0.16 * w + 0.28 * c - 0.12 * r;
        beak = 0.06 + 0.55 * w + 0.10 * c - 0.66 * r;
        eyePitch = 0.10 * c;
        grpSet(fr, (o, A) => {
          o.arch = 0.95 * w - 0.95 * c;
          o.curl = 0.35 * w - 0.55 * c + 0.20 * r;
          o.straighten = 0.95 * c - 0.90 * r;
          o.yawAdd = A.sign * 0.28 * w - A.sign * 0.50 * c + A.sign * 0.22 * r;
          o.pitchAll = -0.10 * w - 0.20 * c + 0.28 * r;
          o.waveAmp = 0.03;
        });
        grpSet(md, (o, A) => {
          o.curl = 0.28 * w - 0.18 * r; o.straighten = 0.25 * c;
          o.yawAdd = -A.sign * 0.10 * c; o.waveAmp = 0.03;
        });
        grpSet(bk.concat(rr), (o) => { o.straighten = 0.30 * w + 0.10 * c; o.pitchAll = 0.10 * c; o.waveAmp = 0.02; });
      } else if (act === 'fire') {
        const a = es(sg(ph, 0, 0.35)), b = es(sg(ph, 0.35, 0.55)), c = es(sg(ph, 0.55, 1));
        mScale = 1 + 0.13 * a - 0.22 * b + 0.09 * c;
        siphonA = 0.75 * a - 0.20 * b - 0.05 * c;
        siphonS = 1 + 0.35 * a - 0.55 * b + 0.20 * c;
        bodyZ = 0.05 * a - 0.16 * b + 0.11 * c;
        bodyY = -0.03 * a - 0.02 * b + 0.05 * c;
        bodyPitch = -0.04 * a + 0.08 * b - 0.04 * c;
        mA += -0.14 * a + 0.26 * b - 0.12 * c;
        mB += -0.06 * a + 0.12 * b - 0.06 * c;
        hPitch += -0.10 * a + 0.06 * b + 0.04 * c;
        hYaw = 0.05 * a; eyeYaw = 0; lid = 0.05;
        beak = 0.04;
        setAll((o, i, A) => {
          o.straighten = 0.30 * a + 0.10 * b - 0.30 * c;
          o.curl = 0.12 * a + 0.10 * b - 0.20 * c;
          o.pitchAll = 0.08 * a + 0.06 * b - 0.10 * c;
          o.spread = 0.10 * a - 0.10 * c;
          o.waveAmp = 0.02 + 0.10 * b * (1 - c);
          o.wavePhase = t * 1.2 + A.off;
        });
      } else if (act === 'hit') {
        const d = Math.exp(-ph * 5.5), q = Math.exp(-ph * 6) * Math.sin(ph * 20);
        bodyZ = -0.14 * d; bodyY = -0.05 * d; bodyRoll = 0.18 * q; bodyPitch = 0.10 * d;
        mA += 0.26 * d; mB += 0.12 * d; mRoll += -0.22 * q;
        hPitch += 0.32 * d; hRoll += 0.20 * q; lid = 0.9 * Math.exp(-ph * 4.5);
        beak = 0.30 * d;
        setAll((o, i, A) => {
          o.arch = 0.35 * d; o.spread = 0.32 * d; o.curl = 0.18 * d;
          o.waveAmp = 0.16 * Math.exp(-ph * 3.5); o.wavePhase = t * 2.4 + A.off; o.waveLag = 0.9;
        });
      } else if (act === 'block') {
        const k = es(Math.min(sg(ph, 0, 0.22), 1 - sg(ph, 0.82, 1)));
        bodyY = -0.17 * k; bodyZ = -0.10 * k; bodyPitch = 0.10 * k;
        mA += 0.22 * k; mB += 0.10 * k; hPitch += 0.28 * k; lid = 0.55 * k; beak = 0.03;
        eyePitch = 0.10 * k;
        grpSet(fr, (o, A) => {
          o.rootPitch = -0.60 * k; o.arch = 0.75 * k; o.curl = 0.55 * k;
          o.yawAdd = -A.sign * 0.18 * k; o.waveAmp = 0.02;
        });
        grpSet(md, (o, A) => {
          o.rootPitch = -0.34 * k; o.arch = 0.45 * k; o.curl = 0.45 * k;
          o.yawAdd = -A.sign * 0.26 * k; o.waveAmp = 0.02;
        });
        grpSet(bk.concat(rr), (o, A) => {
          o.straighten = 0.35 * k; o.spread = 0.24 * k; o.pitchAll = 0.10 * k; o.waveAmp = 0.02;
        });
      } else if (act === 'gather') {
        const d = es(sg(ph, 0, 0.35)), g = es(sg(ph, 0.35, 0.62)), u = es(sg(ph, 0.62, 1));
        bodyY = -0.15 * d + 0.12 * u; bodyPitch = 0.15 * d - 0.14 * u; bodyZ = 0.05 * d - 0.05 * u;
        mA += 0.16 * d - 0.12 * u; hPitch += 0.34 * d + 0.05 * g - 0.30 * u;
        beak = 0.05 + 0.22 * u; lid = 0.15 * d;
        grpSet(fr, (o, A) => {
          o.pitchAll = 0.36 * d + 0.10 * g - 0.44 * u;
          o.curl = 0.10 * d + 0.85 * g - 0.30 * u;
          o.straighten = 0.45 * d - 0.45 * g;
          o.yawAdd = -A.sign * 0.22 * d + A.sign * 0.06 * u;
          o.waveAmp = 0.03;
        });
        grpSet(md, (o) => { o.pitchAll = 0.14 * d; o.curl = 0.18 * d + 0.20 * g; o.waveAmp = 0.03; });
        grpSet(bk.concat(rr), (o) => { o.straighten = 0.22 * d; o.spread = 0.12 * d; o.waveAmp = 0.02; });
      } else if (act === 'deposit') {
        const a = es(sg(ph, 0, 0.45)), b = es(sg(ph, 0.45, 0.68)), c = es(sg(ph, 0.68, 1));
        bodyY = -0.14 * a + 0.13 * c; bodyPitch = 0.13 * a - 0.12 * c;
        mA += 0.14 * a - 0.12 * c; hPitch += 0.30 * a - 0.27 * c;
        beak = 0.20 - 0.16 * b; lid = 0.12 * a;
        grpSet(fr, (o, A) => {
          o.curl = 0.72 - 0.30 * a - 0.42 * b + 0.0 * c;
          o.pitchAll = 0.40 * a + 0.05 * b - 0.44 * c;
          o.straighten = 0.30 * b - 0.28 * c;
          o.yawAdd = -A.sign * 0.16 * a + A.sign * 0.14 * c;
          o.waveAmp = 0.025;
        });
        grpSet(md, (o) => { o.pitchAll = 0.12 * a - 0.12 * c; o.curl = 0.20 * a - 0.18 * c; o.waveAmp = 0.025; });
        grpSet(bk.concat(rr), (o) => { o.straighten = 0.20 * a - 0.18 * c; o.waveAmp = 0.02; });
      } else if (act === 'eat') {
        const hold = Math.min(es(sg(ph, 0, 0.14)), 1 - es(sg(ph, 0.86, 1)));
        const ch = Math.sin(ph * TAU * 3 - Math.PI / 2) * 0.5 + 0.5;
        bodyY = -0.09 * hold; bodyPitch = 0.10 * hold;
        mA += 0.14 * hold; hPitch += 0.34 * hold + 0.05 * ch * hold;
        beak = 0.04 + 0.40 * ch * hold; lid = 0.30 * hold;
        grpSet(fr, (o, A) => {
          o.pitchAll = (0.16 + 0.22 * ch) * hold;
          o.curl = (0.40 + 0.25 * ch) * hold;
          o.yawAdd = -A.sign * 0.22 * hold;
          o.rootPitch = -0.20 * hold;
          o.waveAmp = 0.03;
        });
        grpSet(md, (o) => { o.curl = (0.20 + 0.10 * ch) * hold; o.pitchAll = 0.10 * hold; o.waveAmp = 0.03; });
        grpSet(bk.concat(rr), (o) => { o.straighten = 0.18 * hold; o.spread = 0.10 * hold; o.waveAmp = 0.02; });
      } else if (act === 'drink') {
        const hold = Math.min(es(sg(ph, 0, 0.2)), 1 - es(sg(ph, 0.8, 1)));
        const sip = Math.sin(ph * TAU * 2) * 0.5 + 0.5;
        bodyY = -0.13 * hold; bodyPitch = 0.13 * hold;
        mA += 0.18 * hold; mB += 0.06 * hold;
        hPitch += 0.44 * hold; beak = 0.05 + 0.06 * sip * hold; lid = 0.55 * hold;
        siphonA = 0.10 * sip * hold;
        setAll((o, i, A) => {
          o.straighten = 0.16 * hold; o.spread = 0.10 * hold; o.pitchAll = 0.08 * hold;
          o.waveAmp = 0.015; o.wavePhase = t * 0.15 + A.off;
        });
        grpSet(fr, (o) => { o.pitchAll += 0.16 * hold; o.curl = 0.16 * hold; });
      } else if (act === 'jump') {
        const c = es(sg(ph, 0, 0.35)), e = es(sg(ph, 0.35, 1));
        bodyY = -0.24 * c + 0.60 * e; bodyPitch = 0.12 * c - 0.22 * e; bodyZ = -0.04 * c + 0.12 * e;
        mA += 0.22 * c - 0.40 * e; mB += 0.10 * c - 0.20 * e; mC += -0.10 * e;
        hPitch += 0.16 * c - 0.26 * e; beak = 0.06 + 0.24 * e; lid = 0.20 * c;
        setAll((o, i, A) => {
          o.curl = 0.60 * c - 0.55 * e;
          o.straighten = 0.90 * e;
          o.pitchAll = 0.18 * c + 0.34 * e;
          o.spread = 0.12 * c - 0.16 * e;
          o.arch = -0.10 * c;
          o.waveAmp = 0.02;
        });
      } else if (act === 'land') {
        const r = es(sg(ph, 0, 0.25)), c = es(sg(ph, 0.25, 0.5)), u = es(sg(ph, 0.5, 1));
        bodyY = 0.32 - 0.32 * r - 0.22 * c + 0.22 * u;
        bodyPitch = -0.10 * r + 0.16 * c - 0.06 * u;
        mA += -0.22 * r + 0.34 * c - 0.12 * u; mB += -0.10 * r + 0.16 * c - 0.06 * u;
        hPitch += -0.10 * r + 0.24 * c - 0.14 * u; lid = 0.5 * c * (1 - u);
        setAll((o, i, A) => {
          o.spread = 0.38 * r - 0.24 * u;
          o.straighten = 0.75 * r - 0.55 * c + 0.05 * u;
          o.curl = 0.55 * c - 0.55 * u;
          o.pitchAll = 0.30 * r - 0.10 * c - 0.18 * u;
          o.arch = -0.18 * c + 0.18 * u;
          o.waveAmp = 0.03 + 0.08 * c * (1 - u);
          o.wavePhase = t * 1.4 + A.off;
        });
      } else if (act === 'signal') {
        const k = es(Math.min(sg(ph, 0, 0.28), 1 - sg(ph, 0.72, 1)));
        const trem = Math.sin(t * 9.0) * 0.05 * k;
        bodyY = 0.26 * k; bodyPitch = -0.12 * k;
        mA += -0.38 * k; mB += -0.22 * k; mC += -0.16 * k; mScale = 1 + 0.10 * k;
        hPitch += -0.28 * k; beak = 0.06 + 0.55 * k; lid = -0.22 * k;
        siphonA = 0.5 * k; siphonS = 1 + 0.3 * k;
        eyePitch = -0.12 * k;
        grpSet(fr, (o, A) => {
          o.rootPitch = -1.05 * k; o.arch = 0.55 * k; o.spread = 0.55 * k;
          o.straighten = 0.65 * k; o.yawAdd = A.sign * 0.20 * k;
          o.waveAmp = 0.03 + Math.abs(trem); o.wavePhase = t * 1.6 + A.off;
        });
        grpSet(md, (o, A) => {
          o.rootPitch = -0.75 * k; o.arch = 0.45 * k; o.spread = 0.45 * k;
          o.straighten = 0.55 * k; o.yawAdd = A.sign * 0.28 * k;
          o.waveAmp = 0.03 + Math.abs(trem); o.wavePhase = t * 1.6 + A.off;
        });
        grpSet(bk.concat(rr), (o, A) => {
          o.straighten = 0.35 * k; o.spread = 0.22 * k; o.pitchAll = 0.12 * k; o.waveAmp = 0.02;
        });
      } else if (act === 'sleep') {
        const k = es(Math.min(1, ph / 0.75));
        bodyY = -0.34 * k; bodyPitch = 0.06 * k; bodyRoll = 0.05 * k;
        mA += 0.30 * k; mB += 0.14 * k; mC += 0.12 * k; mRoll += -0.10 * k;
        mScale = 1 - 0.05 * k + (breathe - 0.5) * 0.02;
        hPitch += 0.38 * k; hRoll += 0.06 * k;
        lid = es(sg(ph, 0.25, 0.7)); beak = 0.02;
        siphonA = 0.05 * Math.sin(t * 0.5);
        setAll((o, i, A) => {
          o.curl = 0.95 * k; o.spread = -0.26 * k; o.roll = A.sign * 0.18 * k;
          o.rootPitch = -0.10 * k; o.straighten = -0.10 * k;
          o.waveAmp = 0.03 * (1 - k) + 0.008; o.wavePhase = t * 0.12 + A.off;
        });
      } else if (act === 'wake') {
        const k = es(1 - Math.min(1, sg(ph, 0.1, 0.9)));
        const stir = Math.exp(-Math.pow((ph - 0.16) * 8, 2)) * 0.5;
        bodyY = -0.34 * k; bodyPitch = 0.06 * k;
        mA += 0.30 * k - 0.06 * stir; mB += 0.14 * k; mC += 0.12 * k; mRoll += -0.10 * k;
        hPitch += 0.38 * k - 0.10 * stir; hYaw = 0.20 * stir;
        lid = k * 0.95 - 0.4 * stir; beak = 0.03 + 0.12 * stir;
        mScale = 1 + (breathe - 0.5) * 0.03;
        setAll((o, i, A) => {
          o.curl = 0.95 * k; o.spread = -0.26 * k + 0.10 * stir; o.roll = A.sign * 0.18 * k;
          o.rootPitch = -0.10 * k;
          o.waveAmp = 0.02 + 0.10 * stir; o.wavePhase = t * 0.6 + A.off;
        });
      } else if (act === 'die') {
        const k = es(Math.min(1, ph / 0.55));
        const tw = Math.exp(-ph * 7) * Math.sin(ph * 34) * (1 - k * 0.6);
        bodyY = -0.40 * k; bodyRoll = 0.55 * k + 0.06 * tw; bodyPitch = 0.12 * k;
        mA += 0.32 * k; mB += 0.16 * k; mC += 0.10 * k; mRoll += -0.45 * k; mYaw += 0.20 * k;
        mScale = 1 - 0.07 * k;
        hPitch += 0.48 * k; hRoll += 0.34 * k; hYaw += -0.22 * k;
        lid = es(sg(ph, 0.35, 0.8)); beak = 0.14 * (1 - k) + 0.04;
        siphonA = -0.2 * k;
        setAll((o, i, A) => {
          o.limp = k;
          o.spread = 0.36 * k; o.yawAdd = A.sign * 0.14 * k; o.roll = A.sign * 0.12 * k;
          o.waveAmp = 0.09 * (1 - k) + Math.abs(tw) * 0.10;
          o.wavePhase = t * 1.1 + A.off;
        });
      } else if (act === 'evolve') {
        const br = es(sg(ph, 0, 0.2));
        const k = es(Math.min(sg(ph, 0.18, 0.45), 1 - sg(ph, 0.76, 1)));
        const trem = Math.abs(Math.sin(t * 11)) * k;
        hatch = k;
        bodyY = -0.12 * br + 0.10 * k; bodyPitch = 0.06 * br - 0.05 * k;
        mScale = 1 + 0.11 * k; mA += -0.12 * k + 0.10 * br; mB += -0.06 * k; mC += -0.05 * k;
        mCz = -0.11 * k;
        hPitch += -0.14 * k + 0.10 * br; beak = 0.06 + 0.30 * k; lid = 0.35 * br - 0.25 * k;
        siphonA = 0.35 * k; siphonS = 1 + 0.2 * k;
        setAll((o, i, A) => {
          o.rootPitch = -0.38 * k; o.spread = 0.32 * k; o.straighten = 0.42 * k;
          o.curl = 0.26 * br - 0.20 * k; o.pitchAll = 0.10 * br;
          o.waveAmp = 0.025 + 0.06 * trem; o.wavePhase = t * 1.8 + A.off;
        });
      } else {
        // unknown action: hold a live idle
        mA += Math.sin(t * 0.9) * 0.02;
        hYaw += Math.sin(t * 0.3) * 0.2;
        mScale = 1 + (breathe - 0.5) * 0.03;
        setAll((o, i, A) => { o.waveAmp = 0.035; o.wavePhase = t * 0.2 + A.off; });
      }
      // wounded body under any action
      if (hp < 0.999 && act !== 'die' && act !== 'sleep') {
        const k = clamp01(1 - hp) * 0.6;
        mRoll += -0.12 * k; hPitch += 0.16 * k; bodyRoll += 0.08 * k; bodyY -= 0.04 * k;
        AO[3].limp = Math.max(AO[3].limp, 0.7 * k);
      }
    }

    // ---------------- WRITE ----------------
    core.position.set(bodyX, bodyY, bodyZ);
    core.rotation.set(bodyPitch, bodyYaw, bodyRoll);

    P.mantle_a.rotation.set(mA, mYaw * 0.45, mRoll * 0.4);
    P.mantle_b.rotation.set(mB, mYaw * 0.75, mRoll * 0.8);
    P.mantle_c.rotation.set(mC, mYaw, mRoll);
    P.mantle_c.position.set(P.mantle_c_base.x, P.mantle_c_base.y, P.mantle_c_base.z + mCz);
    P.mantle_a.scale.set(mScale, mScale, 1);
    P.mantle_b.scale.set(1 + (mScale - 1) * 0.7, 1 + (mScale - 1) * 0.7, 1);

    P.hatch_L.rotation.set(0, 0, 0.85 * hatch);
    P.hatch_R.rotation.set(0, 0, -0.85 * hatch);
    P.hatch_top.rotation.set(-0.55 * hatch, 0, 0);

    P.head.rotation.set(hPitch, hYaw, hRoll);
    P.eye_R.rotation.set(eyePitch, 1.0 + eyeYaw, 0);
    P.eye_L.rotation.set(eyePitch, -1.0 + eyeYaw, 0);
    const lc = clamp01(lid);
    P.lidU_R.rotation.set(-0.52 + lc * 0.60, 0, 0);
    P.lidU_L.rotation.set(-0.52 + lc * 0.60, 0, 0);
    P.lidL_R.rotation.set(0.46 - lc * 0.52, 0, 0);
    P.lidL_L.rotation.set(0.46 - lc * 0.52, 0, 0);
    const bo = Math.max(0, beak);
    P.beak_upper.rotation.set(-0.04 - bo * 0.55, 0, 0);
    P.beak_lower.rotation.set(0.04 + bo * 0.65, 0, 0);
    P.siphon.rotation.set(0.5 - siphonA * 0.55, 0.55, 0);
    P.siphon.scale.set(1 + (siphonS - 1) * 0.5, 1 + (siphonS - 1) * 0.5, siphonS);

    arms.forEach((A, i) => {
      const o = AO[i];
      A.group.rotation.set(o.rootPitch, A.yaw + o.yawAdd, o.rootRoll);
      const n = A.segs.length;
      for (let j = 0; j < n; j++) {
        const w = j / (n - 1);
        const wave = Math.sin(o.wavePhase * TAU - j * o.waveLag) * o.waveAmp * (0.35 + w * 1.3);
        let px = A.restP[j] * (1 - o.straighten * 0.72)
          + o.arch * ARCH[j]
          + wave
          + o.pitchAll * (0.25 + w)
          + o.curl * (0.25 + 1.5 * w);
        if (o.limp > 0) px = lerp(px, LIMP[j], o.limp);
        A.segs[j].rotation.set(px, A.restY[j] + o.spread * w * A.sign, o.roll * w);
      }
    });
  };

  // rest pose on build
  root.userData.pose({ speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0, t: 0, dt: 0 });

  return root;
}