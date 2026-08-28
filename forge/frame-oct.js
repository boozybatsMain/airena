function build(THREE, TSL) {
  // ONE QUALITY: ARMOUR AND MASS, LOW AND SPRAWLING — a siege-engine octopus.
  //
  // BRIEF (frame pass — load-bearing masses, proportions, joints only):
  //  - The signature facts: (1) one huge bulbous MANTLE sack carried up and back
  //    behind the head, the single biggest mass on the body; (2) a low wide HEAD
  //    block wedged in front of it with two enormous bulging side EYES; (3) EIGHT
  //    long tapering ARMS radiating from a ring hub under the head, each ~3x the
  //    mantle length, front pair raised and probing, six splayed on the ground with
  //    tips curled up; (4) no legs, no spine standing tall — the whole thing is
  //    wider than it is tall and reads as an eight-pointed star from ABOVE.
  //  - Mantle is a STACK of six machined hoops on a rising curve, gaps between each
  //    pair where chain runs and gear stacks will go later; three white dorsal
  //    shells lap over it, a keel rail down the top, port collars on the flanks.
  //  - Head: faceted skull stock + upper block + brow bar + cheek plates, white
  //    crown shells lapping forward over it, eyes recessed as dark glass in stepped
  //    bezels under hinged white hoods. Beak (upper + hinged lower) sits in the
  //    centre of the arm crown with its jaw rams.
  //  - Arms: 8 machined segments each, joint barrel visible at every pivot, white
  //    shells on the two proximal segments only, twin sucker rails underneath.
  //  - Cable will run: mantle apex ports -> keel channel -> hub ring ports -> arm
  //    base collars; head crown ports -> gimbal collar. Clamp points left standing.
  //  - Expensive detail: the mantle stack gaps and the eye bezels.

  const {
    Fn, vec3, float, positionLocal, normalLocal, sin, mix, smoothstep, clamp,
    length, oneMinus
  } = TSL;

  // ---------------------------------------------------------------- materials
  const BONE = vec3(0.847, 0.824, 0.776);
  const BONES = vec3(0.788, 0.761, 0.706);
  const WORN = vec3(0.710, 0.675, 0.612);
  const GUN = vec3(0.333, 0.322, 0.298);
  const GUNL = vec3(0.420, 0.400, 0.369);
  const BLUED = vec3(0.243, 0.227, 0.204);
  const BRONZE = vec3(0.290, 0.259, 0.220);

  const noise3 = Fn(([p]) => {
    const a = sin(p.x.mul(4.1)).mul(sin(p.y.mul(3.3).add(1.7))).mul(sin(p.z.mul(3.7).add(0.6)));
    const b = sin(p.x.mul(9.7).add(2.1)).mul(sin(p.y.mul(8.3))).mul(sin(p.z.mul(11.3).add(1.1)));
    const c = sin(p.x.mul(19.3)).mul(sin(p.y.mul(21.7).add(0.4))).mul(sin(p.z.mul(23.1)));
    return a.mul(0.5).add(b.mul(0.33)).add(c.mul(0.17)).mul(0.5).add(0.5);
  });

  const shellMat = new THREE.MeshStandardNodeMaterial({ color: 0xd8d2c6, roughness: 0.6, metalness: 0.12 });
  shellMat.colorNode = Fn(() => {
    const p = positionLocal;
    const n = normalLocal;
    const edge = smoothstep(float(0.30), float(0.90), length(p));
    const down = oneMinus(smoothstep(float(-0.65), float(0.30), n.y));
    const up = smoothstep(float(0.15), float(0.95), n.y);
    const grain = noise3(p.mul(2.3));
    const streak = noise3(vec3(p.x.mul(7.5), p.y.mul(0.8), p.z.mul(7.0)));
    let col = mix(BONE, BONES, grain);
    col = mix(col, WORN, edge.mul(0.62));
    const rust = smoothstep(float(0.56), float(0.90), streak).mul(edge.mul(0.7).add(0.30));
    col = mix(col, BRONZE, rust.mul(0.85));
    col = mix(col, BLUED, down.mul(0.38));
    col = mix(col, col.add(0.045), up.mul(0.45));
    return col;
  })();
  shellMat.roughnessNode = Fn(() => {
    const n = normalLocal;
    const up = smoothstep(float(0.1), float(0.95), n.y);
    const edge = smoothstep(float(0.30), float(0.90), length(positionLocal));
    return clamp(float(0.55).add(up.mul(0.20)).add(edge.mul(0.10)), float(0.35), float(0.95));
  })();
  shellMat.side = THREE.DoubleSide;

  const machineMat = new THREE.MeshStandardNodeMaterial({ color: 0x55524c, roughness: 0.55, metalness: 0.85 });
  machineMat.colorNode = Fn(() => {
    const p = positionLocal;
    const n = normalLocal;
    const grain = noise3(p.mul(3.1));
    const down = oneMinus(smoothstep(float(-0.6), float(0.35), n.y));
    const up = smoothstep(float(0.2), float(0.95), n.y);
    const edge = smoothstep(float(0.20), float(0.75), length(p));
    let col = mix(GUN, GUNL, grain.mul(0.9));
    col = mix(col, BRONZE, edge.mul(grain).mul(0.6));
    col = mix(col, BLUED, down.mul(0.55));
    col = mix(col, col.add(0.04), up.mul(0.35));
    return col;
  })();
  machineMat.roughnessNode = Fn(() => {
    const up = smoothstep(float(0.1), float(0.95), normalLocal.y);
    return clamp(float(0.48).add(up.mul(0.22)), float(0.4), float(0.9));
  })();

  const darkMat = new THREE.MeshStandardNodeMaterial({ color: 0x3e3a34, roughness: 0.6, metalness: 0.8 });
  const rubberMat = new THREE.MeshStandardNodeMaterial({ color: 0x1e1d1b, roughness: 0.94, metalness: 0.0 });
  const lensMat = new THREE.MeshStandardNodeMaterial({ color: 0x0b0c0d, roughness: 0.08, metalness: 0.1 });
  const accentMat = new THREE.MeshStandardNodeMaterial({ color: 0xc2521e, roughness: 0.62, metalness: 0.1 });
  const glowMat = new THREE.MeshStandardNodeMaterial({ color: 0x14201f, roughness: 0.3, metalness: 0.2 });
  glowMat.emissiveNode = vec3(0.05, 0.32, 0.34);

  // ---------------------------------------------------------------- geo helpers
  const tubeZ = (rTop, rBot, len, seg, dir) => {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
    g.rotateX(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.translate(0, 0, dir * len / 2);
    return g;
  };
  const tubeX = (rTop, rBot, len, seg) => {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1);
    g.rotateZ(Math.PI / 2);
    return g;
  };
  const shellZ = (r1, r2, len, thetaLen, dir, spin) => {
    const off = (dir > 0 ? Math.PI : 0) + (spin || 0);
    const g = new THREE.CylinderGeometry(r1, r2, len, 22, 1, true, off - thetaLen / 2, thetaLen);
    g.rotateX(dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    g.translate(0, 0, dir * len / 2);
    return g;
  };
  const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg || 18);
  const plate = (pts, depth) => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    sh.closePath();
    return new THREE.ExtrudeGeometry(sh, {
      depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2
    });
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  const add = (parent, geo, mat, name, pos, rot, scl) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) m.scale.set(scl[0], scl[1], scl[2]);
    parent.add(m);
    return m;
  };
  const grp = (name, parent, pos, rot) => {
    const g = new THREE.Group();
    g.name = name;
    if (pos) g.position.set(pos[0], pos[1], pos[2]);
    if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
    if (parent) parent.add(g);
    return g;
  };

  // ================================================================ 1. FRAME
  const root = new THREE.Group();
  root.name = 'armouredOctopus';

  const core = grp('core', root, [0, 1.05, 0]);
  const coreBlock = grp('core_block', core, [0, 0, 0]);
  add(coreBlock, tubeZ(0.60, 0.52, 0.55, 8, -1), machineMat, 'core_yoke', [0, 0.06, 0.05]);
  add(coreBlock, box(0.86, 0.30, 0.44), machineMat, 'core_deck', [0, 0.22, -0.05]);
  add(coreBlock, lathe([[0.0, -0.06], [0.50, -0.06], [0.60, 0.0], [0.60, 0.10], [0.48, 0.14], [0.0, 0.14]]), machineMat, 'core_hip_race', [0, -0.10, 0.05], [Math.PI / 2, 0, 0]);
  add(coreBlock, tubeX(0.13, 0.13, 1.02, 10), darkMat, 'core_cross_shaft', [0, 0.02, -0.10]);
  add(coreBlock, lathe([[0.0, 0], [0.14, 0], [0.14, 0.07], [0.10, 0.09]]), machineMat, 'core_shaft_boss_L', [0.50, 0.02, -0.10], [0, 0, Math.PI / 2]);
  add(coreBlock, lathe([[0.0, 0], [0.14, 0], [0.14, 0.07], [0.10, 0.09]]), machineMat, 'core_shaft_boss_R', [-0.50, 0.02, -0.10], [0, 0, -Math.PI / 2]);

  // ------------------------------------------------- MANTLE (biggest mass: stack)
  const mantle = grp('mantle', core, [0, 0.20, -0.12], [0.34, 0, 0]);
  add(mantle, lathe([[0.58, 0], [0.66, 0.03], [0.68, 0.10], [0.60, 0.13]]), machineMat, 'mantle_collar', [0, 0, 0.02], [-Math.PI / 2, 0, 0]);

  const mSegLen = [0.38, 0.38, 0.36, 0.34, 0.32, 0.32];
  const mSegR = [[0.60, 0.70], [0.70, 0.77], [0.77, 0.75], [0.75, 0.64], [0.64, 0.45], [0.45, 0.15]];
  const mSegRot = [0.04, 0.05, 0.03, -0.02, -0.06, -0.08];
  const mantleSegs = [];
  let mParent = mantle;
  for (let k = 0; k < 6; k++) {
    const g = grp('mantle_seg_' + (k + 1), mParent, [0, 0, k === 0 ? 0 : -mSegLen[k - 1]], [mSegRot[k], 0, 0]);
    g.userData.restZ = k === 0 ? 0 : -mSegLen[k - 1];
    g.userData.restRotX = mSegRot[k];
    mantleSegs.push(g);
    add(g, tubeZ(mSegR[k][1], mSegR[k][0], mSegLen[k], 8, -1), machineMat, 'mantle_seg_' + (k + 1) + '_block');
    add(g, lathe([[mSegR[k][0] + 0.02, 0], [mSegR[k][0] + 0.07, 0.02], [mSegR[k][0] + 0.05, 0.07]]), darkMat,
      'mantle_seg_' + (k + 1) + '_rib', [0, 0, -0.03], [-Math.PI / 2, 0, 0]);
    add(g, box(0.16, 0.10, mSegLen[k] * 0.7), darkMat, 'mantle_seg_' + (k + 1) + '_keel_rail', [0, mSegR[k][0] * 0.94, -mSegLen[k] * 0.5]);
    mParent = g;
  }
  // dorsal shells lapping back-to-front over the stack
  add(mantleSegs[0], shellZ(0.80, 0.70, 0.62, 2.5, -1), shellMat, 'mantle_shell_fwd', [0, 0.02, 0.06]);
  add(mantleSegs[1], shellZ(0.85, 0.79, 0.62, 2.6, -1), shellMat, 'mantle_shell_mid', [0, 0.02, 0.10]);
  add(mantleSegs[3], shellZ(0.78, 0.55, 0.66, 2.3, -1), shellMat, 'mantle_shell_aft', [0, 0.01, 0.06]);
  add(mantleSegs[1], shellZ(0.84, 0.80, 0.50, 1.5, -1, Math.PI * 0.62), shellMat, 'mantle_shell_flank_L', [0, 0, 0.04]);
  add(mantleSegs[1], shellZ(0.84, 0.80, 0.50, 1.5, -1, -Math.PI * 0.62), shellMat, 'mantle_shell_flank_R', [0, 0, 0.04]);
  add(mantleSegs[4], lathe([[0.0, 0], [0.30, 0], [0.34, 0.06], [0.22, 0.11]]), machineMat, 'mantle_apex_cap', [0, 0, -0.30], [-Math.PI / 2, 0, 0]);
  // ports the harness will run between
  add(mantleSegs[0], lathe([[0.0, 0], [0.09, 0], [0.09, 0.05], [0.06, 0.07]]), darkMat, 'mantle_port_L', [0.44, 0.42, -0.14], [-0.7, 0, 0.8]);
  add(mantleSegs[0], lathe([[0.0, 0], [0.09, 0], [0.09, 0.05], [0.06, 0.07]]), darkMat, 'mantle_port_R', [-0.44, 0.42, -0.14], [-0.7, 0, -0.8]);
  add(mantleSegs[3], lathe([[0.0, 0], [0.08, 0], [0.08, 0.05], [0.05, 0.07]]), darkMat, 'mantle_port_apex', [0, 0.52, -0.18], [-0.9, 0, 0]);
  add(mantleSegs[2], box(0.26, 0.06, 0.20), accentMat, 'mantle_marker_plate', [0.58, 0.44, -0.12], [0, 0, -0.7]);
  add(mantleSegs[1], new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12), glowMat, 'mantle_status_port', [-0.30, 0.74, -0.20], [0.2, 0, -0.35]);

  // siphon / funnel — the jet
  const siphon = grp('siphon', mantle, [0.22, -0.42, 0.06], [-0.45, 0.25, 0]);
  add(siphon, lathe([[0.0, 0], [0.15, 0], [0.16, 0.10], [0.11, 0.28], [0.09, 0.34], [0.0, 0.34]]), machineMat, 'siphon_barrel', [0, 0, 0], [Math.PI / 2, 0, 0]);
  add(siphon, lathe([[0.09, 0], [0.14, 0.02], [0.12, 0.06]]), darkMat, 'siphon_lip', [0, 0, 0.34], [-Math.PI / 2, 0, 0]);
  add(siphon, tubeX(0.05, 0.05, 0.30, 8), darkMat, 'siphon_gimbal_pin', [0, 0, 0.06]);

  // ================================================================ 2. HEAD
  const head = grp('head', core, [0, 0.02, 0.26], [0.04, 0, 0]);
  add(head, lathe([[0.0, -0.06], [0.36, -0.06], [0.42, 0.0], [0.42, 0.10], [0.34, 0.14], [0.0, 0.14]]), machineMat, 'head_gimbal_collar', [0, 0.02, -0.06], [Math.PI / 2, 0, 0]);
  add(head, tubeZ(0.34, 0.46, 0.82, 6, 1), machineMat, 'head_skull_stock', [0, -0.02, -0.02], [0, Math.PI / 6, 0]);
  add(head, box(0.86, 0.34, 0.70), machineMat, 'head_upper_block', [0, 0.20, 0.26], [-0.10, 0, 0]);
  add(head, box(1.02, 0.13, 0.20), machineMat, 'head_brow_bar', [0, 0.31, 0.42], [-0.22, 0, 0]);
  add(head, plate([[-0.30, -0.20], [0.34, -0.14], [0.40, 0.14], [0.06, 0.26], [-0.30, 0.15]], 0.09), machineMat,
    'head_cheek_plate_L', [0.40, 0.06, 0.20], [0, 0.42, 0]);
  add(head, plate([[-0.30, -0.20], [0.34, -0.14], [0.40, 0.14], [0.06, 0.26], [-0.30, 0.15]], 0.09), machineMat,
    'head_cheek_plate_R', [-0.40, 0.06, 0.20], [0, -0.42, Math.PI], [1, -1, 1]);
  add(head, box(0.52, 0.16, 0.30), machineMat, 'head_snout_block', [0, -0.10, 0.56], [0.24, 0, 0]);
  // crown shells lap forward over the skull
  add(head, new THREE.SphereGeometry(0.50, 22, 14, 0, Math.PI * 2, 0, 1.05), shellMat, 'head_crown_shell_rear',
    [0, 0.16, 0.10], [0.10, 0, 0], [1.05, 0.62, 1.25]);
  add(head, new THREE.SphereGeometry(0.44, 22, 14, 0, Math.PI * 2, 0, 1.0), shellMat, 'head_crown_shell_fwd',
    [0, 0.16, 0.44], [0.26, 0, 0], [1.02, 0.55, 1.15]);
  add(head, shellZ(0.36, 0.30, 0.46, 1.5, 1, Math.PI * 0.60), shellMat, 'head_side_shell_L', [0, 0.0, 0.16]);
  add(head, shellZ(0.36, 0.30, 0.46, 1.5, 1, -Math.PI * 0.60), shellMat, 'head_side_shell_R', [0, 0.0, 0.16]);
  add(head, lathe([[0.0, 0], [0.075, 0], [0.075, 0.05], [0.05, 0.07]]), darkMat, 'head_port_L', [0.24, 0.40, 0.02], [-0.6, 0, 0.4]);
  add(head, lathe([[0.0, 0], [0.075, 0], [0.075, 0.05], [0.05, 0.07]]), darkMat, 'head_port_R', [-0.24, 0.40, 0.02], [-0.6, 0, -0.4]);
  add(head, box(0.20, 0.12, 0.26), machineMat, 'head_sensor_pod', [-0.34, 0.36, 0.14], [0, -0.3, -0.25]);
  add(head, tubeZ(0.03, 0.03, 0.20, 6, 1), darkMat, 'head_sensor_stalk', [-0.34, 0.42, 0.22], [-0.5, -0.3, 0]);

  const eyeGroups = [];
  const eyeHoods = [];
  for (const sd of [1, -1]) {
    const tag = sd > 0 ? 'L' : 'R';
    const eg = grp('eye_' + tag, head, [sd * 0.46, 0.20, 0.28], [0, sd * 0.28, 0]);
    eyeGroups.push(eg);
    add(eg, lathe([[0.0, -0.04], [0.26, -0.04], [0.30, 0.02], [0.30, 0.08], [0.22, 0.11], [0.16, 0.11]]), machineMat, 'eye_' + tag + '_race', [0, 0, 0], [0, sd * Math.PI / 2, 0]);
    add(eg, lathe([[0.14, 0.02], [0.22, 0.02], [0.24, 0.07], [0.20, 0.10], [0.15, 0.10]]), darkMat, 'eye_' + tag + '_bezel', [sd * 0.04, 0, 0], [0, sd * Math.PI / 2, 0]);
    add(eg, new THREE.SphereGeometry(0.155, 20, 14), lensMat, 'eye_' + tag + '_lens', [sd * 0.035, 0, 0], [0, 0, 0], [0.75, 1, 1]);
    add(eg, new THREE.TorusGeometry(0.20, 0.03, 8, 18, Math.PI * 1.2), darkMat, 'eye_' + tag + '_yoke', [sd * 0.02, 0, 0], [0, sd * Math.PI / 2, 0.6]);
    const hood = grp('eye_' + tag + '_hood', eg, [0, 0.06, 0], [0, 0, 0]);
    eyeHoods.push(hood);
    add(hood, new THREE.SphereGeometry(0.28, 20, 12, 0, Math.PI * 2, 0, 0.85), shellMat, 'eye_' + tag + '_hood_shell',
      [sd * 0.02, 0.02, 0], [0, 0, -sd * 0.25], [0.85, 0.55, 1.05]);
    add(hood, new THREE.TorusGeometry(0.235, 0.022, 6, 18, Math.PI), darkMat, 'eye_' + tag + '_hood_lip', [sd * 0.02, 0.0, 0], [0, sd * Math.PI / 2, 0]);
    add(hood, tubeX(0.028, 0.028, 0.18, 6), darkMat, 'eye_' + tag + '_hood_pin', [sd * 0.02, 0.03, -0.10]);
  }

  // ================================================== ARM CROWN HUB + BEAK
  const hub = grp('arm_hub', core, [0, -0.30, 0.30], [0.06, 0, 0]);
  const hubRing = new THREE.TorusGeometry(0.42, 0.10, 10, 26);
  hubRing.rotateX(Math.PI / 2);
  add(hub, hubRing, machineMat, 'hub_ring');
  add(hub, lathe([[0.0, -0.05], [0.34, -0.05], [0.40, 0.0], [0.34, 0.06], [0.0, 0.06]]), machineMat, 'hub_plate', [0, 0.02, 0], [0, 0, 0]);
  add(hub, new THREE.TorusGeometry(0.30, 0.045, 8, 22), darkMat, 'hub_race', [0, 0.06, 0], [Math.PI / 2, 0, 0]);
  add(hub, lathe([[0.0, 0], [0.07, 0], [0.07, 0.05], [0.045, 0.07]]), darkMat, 'hub_port_L', [0.30, 0.10, 0.10], [-1.2, 0, 0]);
  add(hub, lathe([[0.0, 0], [0.07, 0], [0.07, 0.05], [0.045, 0.07]]), darkMat, 'hub_port_R', [-0.30, 0.10, 0.10], [-1.2, 0, 0]);

  const beak = grp('beak', hub, [0, -0.02, 0.06], [0.2, 0, 0]);
  add(beak, new THREE.TorusGeometry(0.17, 0.035, 8, 20), darkMat, 'beak_ring', [0, 0, 0], [0.3, 0, 0]);
  add(beak, new THREE.ConeGeometry(0.13, 0.24, 6), machineMat, 'beak_upper', [0, 0.02, 0.06], [1.35, 0, 0]);
  const beakLower = grp('beak_lower', beak, [0, -0.05, 0.0], [0.1, 0, 0]);
  add(beakLower, new THREE.ConeGeometry(0.12, 0.22, 6), machineMat, 'beak_lower_jaw', [0, -0.02, 0.06], [1.75, 0, 0]);
  add(beakLower, tubeX(0.03, 0.03, 0.22, 6), darkMat, 'beak_hinge_pin', [0, 0, 0]);
  add(beak, tubeZ(0.035, 0.035, 0.16, 6, 1), machineMat, 'beak_ram_L', [0.14, -0.06, -0.02], [-0.9, 0.4, 0]);
  add(beak, tubeZ(0.035, 0.035, 0.16, 6, 1), machineMat, 'beak_ram_R', [-0.14, -0.06, -0.02], [-0.9, -0.4, 0]);

  // ================================================================ 3. ARMS
  const ARM_DEF = [
    { yaw: 22, kind: 'probe' }, { yaw: 60, kind: 'walk' }, { yaw: 104, kind: 'walk' }, { yaw: 150, kind: 'walk' },
    { yaw: -150, kind: 'walk' }, { yaw: -104, kind: 'walk' }, { yaw: -60, kind: 'walk' }, { yaw: -22, kind: 'probe' }
  ];
  const SEG_LEN = [0.56, 0.50, 0.45, 0.40, 0.35, 0.29, 0.24, 0.19];
  const REST_WALK = [0.22, 0.03, -0.13, -0.18, -0.13, -0.07, -0.15, -0.15];
  const REST_PROBE = [-0.02, -0.06, -0.02, 0.06, 0.16, 0.24, 0.30, 0.30];
  const NSEG = 8;
  const arms = [];

  for (let i = 0; i < 8; i++) {
    const def = ARM_DEF[i];
    const yaw = def.yaw * Math.PI / 180;
    const probe = def.kind === 'probe';
    const basePitch = probe ? 0.02 : 0.25;
    const r0 = probe ? 0.175 : 0.20;
    const radii = [];
    for (let k = 0; k <= NSEG; k++) radii.push(r0 * Math.pow(0.855, k));
    const rest = (probe ? REST_PROBE : REST_WALK).slice();
    const g = grp('arm_' + (i + 1), hub, [Math.sin(yaw) * 0.42, -0.04 - (probe ? 0.02 : 0), Math.cos(yaw) * 0.42], [basePitch, yaw, 0]);
    add(g, lathe([[0.0, -0.04], [r0 + 0.05, -0.04], [r0 + 0.09, 0.02], [r0 + 0.04, 0.08], [r0 * 0.7, 0.08]]), machineMat,
      'arm_' + (i + 1) + '_base_collar', [0, 0, 0.0], [-Math.PI / 2, 0, 0]);
    add(g, new THREE.TorusGeometry(r0 + 0.06, 0.028, 6, 18), rubberMat, 'arm_' + (i + 1) + '_base_boot', [0, 0, 0.06]);

    const segs = [];
    let parent = g;
    for (let k = 0; k < NSEG; k++) {
      const sg = grp('arm_' + (i + 1) + '_seg_' + (k + 1), parent, [0, 0, k === 0 ? 0.02 : SEG_LEN[k - 1]], [rest[k], 0, 0]);
      sg.userData.rest = rest[k];
      segs.push(sg);
      add(sg, tubeX(radii[k] * 1.20, radii[k] * 1.20, radii[k] * 2.3, 12), machineMat, 'arm_' + (i + 1) + '_joint_barrel_' + (k + 1));
      add(sg, tubeZ(radii[k + 1], radii[k] * 0.94, SEG_LEN[k], 6, 1), machineMat, 'arm_' + (i + 1) + '_seg_' + (k + 1) + '_stock', [0, 0, 0], [0, 0, 0.2 * ((k % 2) ? 1 : -1)]);
      if (k < 2) {
        add(sg, shellZ(radii[k + 1] + 0.045, radii[k] + 0.05, SEG_LEN[k] * 0.82, 2.4, 1), shellMat,
          'arm_' + (i + 1) + '_shell_' + (k + 1), [0, 0, SEG_LEN[k] * 0.10]);
        add(sg, box(0.055, 0.05, SEG_LEN[k] * 0.72), darkMat, 'arm_' + (i + 1) + '_sucker_rail_' + (k + 1) + 'a',
          [radii[k] * 0.5, -radii[k] * 0.82, SEG_LEN[k] * 0.5]);
        add(sg, box(0.055, 0.05, SEG_LEN[k] * 0.72), darkMat, 'arm_' + (i + 1) + '_sucker_rail_' + (k + 1) + 'b',
          [-radii[k] * 0.5, -radii[k] * 0.82, SEG_LEN[k] * 0.5]);
      }
      parent = sg;
    }
    const tip = grp('arm_' + (i + 1) + '_tip', segs[NSEG - 1], [0, 0, SEG_LEN[NSEG - 1]]);
    add(tip, tubeZ(0.012, radii[NSEG] * 0.9, 0.16, 6, 1), machineMat, 'arm_' + (i + 1) + '_tip_link');
    add(tip, new THREE.SphereGeometry(radii[NSEG] * 0.8, 10, 8), darkMat, 'arm_' + (i + 1) + '_tip_pad', [0, 0, 0.16], null, [1, 0.7, 1]);

    arms.push({ g, segs, rest, baseYaw: yaw, basePitch, side: Math.sign(def.yaw), probe, ring: i < 4 ? i : 7 - i, i });
    root.userData['arm' + (i + 1)] = g;
  }

  // ---------------------------------------------------------------- pose
  const lerp = (a, b, t) => a + (b - a) * t;
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));
  const es = x => { x = cl(x, 0, 1); return x * x * (3 - 2 * x); };
  const pulse = x => Math.sin(Math.PI * cl(x, 0, 1));
  const ramp = (sp, pts) => {
    if (sp <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      if (sp <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (sp - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
    }
    return pts[pts.length - 1][1];
  };

  const A = arms.map(() => ({ lift: 0, yaw: 0, roll: 0, curl: 1, seg: new Array(NSEG).fill(0) }));

  root.userData.pose = (s) => {
    s = s || {};
    const sp = Math.max(0, s.speed || 0);
    const stride = s.stride || 0;
    const turn = cl(s.turn || 0, -1, 1);
    const t = s.t || 0;
    const grounded = s.grounded !== false;
    const health = s.health === undefined ? 1 : cl(s.health, 0, 1);
    const act = s.action || null;
    const ph = cl(s.phase || 0, 0, 1);
    const TAU = Math.PI * 2;

    for (let i = 0; i < 8; i++) {
      const a = A[i];
      a.lift = 0; a.yaw = 0; a.roll = 0; a.curl = 1;
      for (let k = 0; k < NSEG; k++) a.seg[k] = 0;
    }

    const st = {
      bodyY: 0, bodyZ: 0, bodyPitch: 0, bodyRoll: 0, bodyYaw: 0,
      mantleTilt: ramp(sp, [[0, 0.34], [0.5, 0.44], [1, 0.34], [2, 0.26], [3, 0.18], [6, 0.06]]),
      mantleYaw: 0, mantleRoll: 0, pulse: 0, flare: 0, open: 0,
      headPitch: 0.04, headYaw: 0, headRoll: 0, beak: 0.06, hood: 0, siphon: 0
    };
    st.bodyY = ramp(sp, [[0, 0], [0.5, -0.13], [1, -0.03], [2, 0.05], [3, 0.09], [6, 0.15]]);
    st.bodyPitch = ramp(sp, [[0, 0], [0.5, 0.05], [1, 0.02], [2, -0.03], [3, -0.06], [6, -0.10]]);

    // idle hardware: mantle breathing, slow weight shift, head scanning
    const br = Math.sin(t * 0.85);
    const idle = sp < 1.2 ? 1 - sp / 1.2 : 0;
    st.pulse += br * 0.035 * (0.4 + 0.6 * idle);
    st.bodyY += br * 0.014 * (0.4 + 0.6 * idle);
    st.bodyRoll += Math.sin(t * 0.33) * 0.035 * idle;
    st.headYaw += Math.sin(t * 0.31) * 0.16 * idle;
    st.headPitch += Math.sin(t * 0.62 + 1.1) * 0.035;
    st.siphon += Math.sin(t * 0.85 + 0.6) * 0.08 * (0.3 + 0.7 * idle);
    for (let i = 0; i < 8; i++) {
      const a = A[i];
      const w = Math.sin(t * 0.7 + i * 1.1) * 0.03 * idle;
      a.seg[5] += w; a.seg[6] += w * 1.4; a.seg[7] += w * 1.8;
      a.yaw += Math.sin(t * 0.45 + i * 2.0) * 0.03 * idle;
    }

    // ------------------------------------------------ gait (metachronal crawl)
    if (!act && grounded && sp > 0.02) {
      const reach = ramp(sp, [[0, 0], [0.5, 0.55], [1, 0.8], [2, 1.05], [3, 1.25], [6, 1.6]]);
      const gather = ramp(sp, [[0, 0], [0.5, 0.5], [1, 0.25], [2, 0.1], [3, 0.05], [6, 0.0]]);
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i];
        const off = (arm.side > 0 ? 0.0 : 0.5) + arm.ring * 0.15;
        const p = (stride + off) % 1;
        const pro = Math.sin(p * TAU);
        const lift = Math.max(0, pro);
        const sgn = arm.side || 1;
        const scale = arm.probe ? 0.55 : 1.0;
        a.yaw += -sgn * pro * 0.26 * reach * scale;
        a.lift += -lift * 0.30 * reach * scale + gather * 0.10;
        a.curl += (0.30 * lift - 0.14 * (1 - lift)) * reach * scale + gather * 0.35;
        for (let k = 0; k < NSEG; k++) {
          a.seg[k] += Math.sin(p * TAU - k * 0.55) * 0.055 * reach * scale;
        }
        if (arm.probe) { a.lift -= 0.10 * reach; a.seg[6] += 0.15 * reach; a.seg[7] += 0.15 * reach; }
      }
      st.bodyY += Math.sin(stride * TAU * 2) * 0.028 * Math.min(1, sp / 2);
      st.bodyRoll += Math.sin(stride * TAU) * 0.05 * Math.min(1, sp / 3);
      st.mantleYaw += Math.sin(stride * TAU) * 0.06;
      st.pulse += Math.sin(stride * TAU * 2) * 0.02;
      st.headPitch += 0.05 * Math.min(1, sp / 3);
    }

    // ------------------------------------------------ airborne (jetting / falling)
    if (!grounded) {
      st.mantleTilt = 0.02;
      st.bodyPitch -= 0.14;
      st.pulse += Math.sin(t * 4.2) * 0.06;
      st.headPitch -= 0.10;
      st.siphon = -0.35;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i];
        const sgn = arm.side || 1;
        const target = sgn * (Math.PI * 0.92);
        a.yaw += (target - arm.baseYaw) * 0.55;
        a.lift += -0.30;
        a.curl = 0.22;
        for (let k = 0; k < NSEG; k++) a.seg[k] += Math.sin(t * 5.5 - k * 0.5) * 0.05 + 0.02 * k;
      }
    }

    // ------------------------------------------------ actions
    if (act === 'attack') {
      const w = ph < 0.3 ? es(ph / 0.3) : Math.max(0, 1 - (ph - 0.3) / 0.2);
      const k = ph < 0.3 ? 0 : (ph < 0.55 ? es((ph - 0.3) / 0.25) : Math.max(0, 1 - (ph - 0.55) / 0.45));
      st.bodyZ += k * 0.30 - w * 0.12;
      st.bodyY += -w * 0.14 + k * 0.06;
      st.bodyPitch += w * 0.14 - k * 0.12;
      st.mantleTilt += w * 0.28 - k * 0.34;
      st.pulse += w * 0.05 - k * 0.05;
      st.headPitch += -w * 0.16 + k * 0.22;
      st.beak = 0.06 + 0.75 * k;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i], sgn = arm.side || 1;
        if (arm.probe) {
          a.lift += -1.15 * w + 0.55 * k;
          a.curl = 1 + 1.7 * w - 1.25 * k;
          a.yaw += -sgn * (0.25 * w - 0.12 * k);
          for (let q = 0; q < NSEG; q++) a.seg[q] += -0.10 * k;
        } else if (arm.ring === 1) {
          a.lift += -0.55 * w + 0.30 * k;
          a.curl = 1 + 0.9 * w - 0.6 * k;
        } else {
          a.curl = 1 + 0.22 * w + 0.10 * k;
          a.lift += 0.10 * k;
        }
      }
    } else if (act === 'fire') {
      const aim = ph < 0.3 ? es(ph / 0.3) : 1;
      const chg = ph < 0.45 ? es(ph / 0.45) : Math.max(0, 1 - (ph - 0.45) / 0.12);
      const jet = (ph >= 0.45 && ph < 0.64) ? pulse((ph - 0.45) / 0.19) : 0;
      const settle = ph > 0.64 ? es((ph - 0.64) / 0.36) : 0;
      st.pulse += chg * 0.13 - jet * 0.20;
      st.flare += chg * 0.05;
      st.bodyZ -= jet * 0.15;
      st.bodyY += -aim * 0.07 - jet * 0.03;
      st.bodyPitch += aim * 0.05 + jet * 0.06;
      st.mantleTilt += aim * 0.14 - jet * 0.12;
      st.headPitch += -aim * 0.12 * (1 - settle);
      st.siphon = -0.45 * aim - 0.25 * jet;
      st.beak = 0.06 + 0.10 * aim;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i], sgn = arm.side || 1;
        if (arm.probe) { a.lift += -0.55 * aim; a.curl = 1 + 0.6 * aim; a.yaw += -sgn * 0.10 * aim; }
        else { a.curl = 1 + 0.16 * aim + 0.10 * jet; a.lift += 0.06 * jet; }
      }
    } else if (act === 'hit') {
      const f = ph < 0.18 ? ph / 0.18 : Math.max(0, 1 - (ph - 0.18) / 0.82);
      st.bodyZ -= 0.20 * f;
      st.bodyPitch += 0.16 * f;
      st.bodyRoll += 0.14 * f;
      st.bodyY -= 0.11 * f;
      st.headPitch += 0.32 * f;
      st.headRoll += 0.18 * f;
      st.mantleTilt += 0.22 * f;
      st.pulse -= 0.06 * f;
      st.beak = 0.06 + 0.30 * f;
      for (let i = 0; i < 8; i++) {
        const a = A[i];
        a.lift += ((i % 2) ? -0.28 : 0.20) * f;
        a.curl += 0.32 * f;
        a.yaw += ((i % 3) - 1) * 0.10 * f;
        for (let k = 0; k < NSEG; k++) a.seg[k] += Math.sin(k * 1.7 + i) * 0.05 * f;
      }
    } else if (act === 'block') {
      const k = ph < 0.25 ? es(ph / 0.25) : (ph > 0.78 ? 1 - es((ph - 0.78) / 0.22) : 1);
      st.bodyY -= 0.24 * k;
      st.bodyZ -= 0.10 * k;
      st.bodyPitch += 0.12 * k;
      st.mantleTilt -= 0.20 * k;
      st.headPitch += 0.34 * k;
      st.beak = 0.06 * (1 - k);
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i], sgn = arm.side || 1;
        if (arm.probe) { a.lift += -1.35 * k; a.curl = 1 + 1.6 * k; a.yaw += -sgn * 0.14 * k; }
        else if (arm.ring === 1) { a.lift += -0.95 * k; a.curl = 1 + 1.3 * k; a.yaw += -sgn * 0.45 * k; }
        else { a.curl = 1 + 0.25 * k; a.lift += 0.18 * k; a.yaw += sgn * 0.10 * k; }
      }
    } else if (act === 'gather' || act === 'deposit') {
      const q = act === 'gather' ? ph : 1 - ph;
      const sc = act === 'gather' ? 1 : 0.85;
      const down = q < 0.35 ? es(q / 0.35) : (q < 0.62 ? 1 : Math.max(0, 1 - (q - 0.62) / 0.38));
      const close = q < 0.30 ? 0 : 1;
      const up = q > 0.62 ? es((q - 0.62) / 0.38) : 0;
      st.bodyY -= 0.20 * down * sc;
      st.bodyPitch += 0.14 * down * sc;
      st.headPitch += (0.38 * down - 0.10 * up) * sc;
      st.mantleTilt += 0.26 * down * sc;
      st.beak = 0.06 + 0.20 * close * down;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i], sgn = arm.side || 1;
        if (arm.probe) {
          a.lift += (0.50 * down - 0.70 * up) * sc;
          a.curl = 1 + (0.45 * close + 1.35 * up) * sc;
          a.yaw += -sgn * 0.18 * close * sc;
        } else if (arm.ring === 1) {
          a.lift += (0.20 * down - 0.25 * up) * sc;
          a.curl = 1 + 0.35 * close * sc;
        } else {
          a.curl = 1 + 0.20 * down * sc;
        }
      }
    } else if (act === 'eat') {
      const down = Math.min(1, ph / 0.18) * (ph > 0.85 ? (1 - ph) / 0.15 : 1);
      const c = Math.sin(ph * TAU * 3);
      st.headPitch += 0.44 * down + c * 0.05 * down;
      st.bodyY -= 0.14 * down;
      st.bodyPitch += 0.10 * down;
      st.mantleTilt += 0.22 * down;
      st.beak = 0.06 + (0.5 + 0.5 * c) * 0.65 * down;
      st.pulse += c * 0.02 * down;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i];
        if (arm.probe) {
          a.lift += (0.30 - 0.30 * (0.5 + 0.5 * c)) * down;
          a.curl = 1 + (0.85 + 0.45 * c) * down;
        } else if (arm.ring === 1) {
          a.lift += 0.15 * down; a.curl = 1 + (0.35 + 0.15 * c) * down;
        } else a.curl = 1 + 0.15 * down;
      }
    } else if (act === 'drink') {
      const down = Math.min(1, ph / 0.25) * (ph > 0.80 ? (1 - ph) / 0.20 : 1);
      st.headPitch += 0.52 * down;
      st.bodyY -= 0.18 * down;
      st.bodyPitch += 0.12 * down;
      st.mantleTilt += 0.16 * down;
      st.beak = 0.06 + 0.14 * down;
      st.pulse += Math.sin(t * 1.6) * 0.02 * down;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i];
        if (arm.probe) { a.lift += 0.28 * down; a.curl = 1 + 0.30 * down; }
        else a.curl = 1 + 0.18 * down;
      }
    } else if (act === 'jump') {
      const cr = ph < 0.35 ? es(ph / 0.35) : Math.max(0, 1 - (ph - 0.35) / 0.20);
      const ex = ph < 0.35 ? 0 : es((ph - 0.35) / 0.40);
      st.bodyY += -0.32 * cr + 0.58 * ex;
      st.bodyPitch += 0.14 * cr - 0.20 * ex;
      st.mantleTilt += 0.22 * cr - 0.36 * ex;
      st.pulse += 0.05 * cr + 0.10 * ex;
      st.headPitch += 0.16 * cr - 0.20 * ex;
      st.siphon = -0.30 * ex;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i], sgn = arm.side || 1;
        a.curl = 1 + 1.05 * cr - 0.85 * ex;
        a.lift += 0.32 * cr - 0.55 * ex;
        a.yaw += sgn * 0.10 * ex;
        for (let k = 4; k < NSEG; k++) a.seg[k] += -0.06 * ex;
      }
    } else if (act === 'land') {
      const rch = Math.max(0, 1 - ph / 0.30);
      const cmp = ph > 0.20 ? Math.exp(-Math.pow(ph - 0.38, 2) * 26) : 0;
      const rec = ph > 0.55 ? es((ph - 0.55) / 0.45) : 0;
      st.bodyY += 0.36 * rch - 0.36 * cmp * (1 - rec * 0.6);
      st.bodyPitch += -0.12 * rch + 0.16 * cmp;
      st.mantleTilt += -0.22 * rch + 0.20 * cmp;
      st.headPitch += 0.22 * cmp;
      st.pulse -= 0.06 * cmp;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i], sgn = arm.side || 1;
        a.curl = 1 - 0.70 * rch + 1.15 * cmp;
        a.lift += -0.45 * rch + 0.32 * cmp;
        a.yaw += sgn * (0.10 * rch + 0.22 * cmp);
      }
    } else if (act === 'signal') {
      const up = ph < 0.25 ? es(ph / 0.25) : (ph < 0.70 ? 1 : 1 - es((ph - 0.70) / 0.30));
      st.bodyY += 0.36 * up;
      st.bodyPitch -= 0.14 * up;
      st.mantleTilt += 0.52 * up;
      st.flare += 0.15 * up;
      st.pulse += 0.06 * up + Math.sin(ph * TAU * 5) * 0.03 * up;
      st.headPitch -= 0.26 * up;
      st.beak = 0.06 + 0.55 * up;
      st.hood = up;
      st.siphon = -0.20 * up;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i], sgn = arm.side || 1;
        a.yaw += sgn * 0.38 * up;
        a.curl = 1 - 0.55 * up;
        a.lift += (arm.probe ? -0.95 : -0.35) * up;
        for (let k = 5; k < NSEG; k++) a.seg[k] += -0.12 * up;
      }
    } else if (act === 'sleep' || act === 'wake') {
      const q = act === 'sleep' ? ph : 1 - ph;
      const k = es(Math.min(1, q / 0.8));
      st.bodyY -= 0.62 * k;
      st.bodyPitch += 0.06 * k;
      st.bodyRoll += 0.07 * k;
      st.mantleTilt = lerp(st.mantleTilt, 0.10, k);
      st.pulse = lerp(st.pulse, Math.sin(t * 0.45) * 0.025, k);
      st.headPitch += 0.32 * k;
      st.headRoll += 0.10 * k;
      st.beak = 0.06 * (1 - k);
      st.siphon = 0.10 * k;
      if (act === 'wake') {
        const stir = (1 - ph) * Math.sin(ph * TAU * 2.5);
        st.headYaw += stir * 0.20;
        st.bodyRoll += stir * 0.06;
      }
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i], sgn = arm.side || 1;
        a.curl = 1 + 1.45 * k;
        a.lift += -0.18 * k;
        a.yaw += -sgn * 0.22 * k;
        for (let q2 = 3; q2 < NSEG; q2++) a.seg[q2] += 0.05 * k;
      }
    } else if (act === 'die') {
      const k = es(Math.min(1, ph / 0.68));
      const flail = Math.max(0, 1 - ph / 0.35) * Math.sin(ph * TAU * 3.5);
      st.bodyY -= 0.70 * k;
      st.bodyRoll += 0.44 * k + flail * 0.10;
      st.bodyPitch += 0.12 * k;
      st.mantleTilt = lerp(st.mantleTilt, 0.03, k);
      st.mantleRoll += 0.16 * k;
      st.pulse -= 0.07 * k;
      st.headPitch += 0.46 * k;
      st.headRoll += 0.34 * k;
      st.headYaw += flail * 0.12;
      st.beak = 0.06 + 0.28 * k;
      st.siphon = 0.16 * k;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i], sgn = arm.side || 1;
        a.curl = 1 - 0.88 * k;
        a.lift += -0.06 * k + flail * 0.14 * ((i % 2) ? 1 : -1);
        a.yaw += sgn * 0.24 * k + flail * 0.10;
        for (let q2 = 0; q2 < NSEG; q2++) a.seg[q2] += 0.04 * k * (q2 > 4 ? 1 : 0.3);
      }
    } else if (act === 'evolve') {
      const brace = ph < 0.20 ? es(ph / 0.20) : Math.max(0, 1 - (ph - 0.20) / 0.16);
      const open = ph < 0.30 ? 0 : (ph < 0.55 ? es((ph - 0.30) / 0.25) : (ph < 0.80 ? 1 : 1 - es((ph - 0.80) / 0.20)));
      const buzz = Math.sin(t * 26);
      st.bodyY += -0.18 * brace + 0.18 * open;
      st.bodyPitch += 0.12 * brace - 0.06 * open;
      st.open = open;
      st.flare += 0.11 * open;
      st.mantleTilt += 0.14 * open;
      st.pulse += buzz * 0.02 * open + 0.05 * open;
      st.hood = open;
      st.beak = 0.06 + 0.32 * open;
      st.headPitch -= 0.16 * open;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i], sgn = arm.side || 1;
        a.curl = 1 + 0.85 * brace - 0.38 * open;
        a.yaw += sgn * 0.26 * open;
        a.lift += 0.22 * brace - 0.26 * open;
        for (let k = 0; k < NSEG; k++) a.seg[k] += buzz * 0.012 * open;
      }
    }

    // ------------------------------------------------ turn overlay
    if (turn !== 0) {
      st.bodyRoll += -turn * 0.18;
      st.bodyYaw += turn * 0.05;
      st.headYaw += turn * 0.46;
      st.headRoll += -turn * 0.10;
      st.mantleYaw += -turn * 0.30;
      st.mantleRoll += -turn * 0.14;
      st.mantleTilt += 0.04 * Math.abs(turn);
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i], sgn = arm.side || 1;
        const inside = sgn === Math.sign(turn);
        if (inside) { a.curl += 0.34 * Math.abs(turn); a.yaw += -turn * 0.10; a.lift += 0.10 * Math.abs(turn); }
        else { a.curl -= 0.18 * Math.abs(turn); a.yaw += turn * 0.20; a.lift += -0.08 * Math.abs(turn); }
      }
    }

    // ------------------------------------------------ hurt overlay
    if (health < 1) {
      const w = 1 - health;
      st.bodyRoll += 0.14 * w;
      st.bodyY -= 0.11 * w;
      st.bodyPitch += 0.07 * w;
      st.headPitch += 0.24 * w;
      st.headRoll += 0.16 * w;
      st.headYaw += -0.10 * w;
      st.mantleTilt -= 0.14 * w;
      st.mantleRoll += 0.10 * w;
      st.pulse += Math.sin(t * 3.1) * 0.035 * w;
      st.siphon += 0.10 * w;
      for (let i = 0; i < 8; i++) {
        const arm = arms[i], a = A[i];
        if (arm.side < 0) {
          a.curl += 0.42 * w; a.lift += 0.18 * w;
          for (let k = 4; k < NSEG; k++) a.seg[k] += 0.06 * w;
        } else {
          a.curl += 0.10 * w;
        }
      }
    }

    // ------------------------------------------------ write transforms
    core.position.set(0, 1.05 + st.bodyY, st.bodyZ);
    core.rotation.set(st.bodyPitch, st.bodyYaw, st.bodyRoll);

    mantle.rotation.set(st.mantleTilt, st.mantleYaw, st.mantleRoll);
    mantle.scale.set(1 + st.pulse * 0.55 + st.flare, 1 + st.pulse + st.flare, 1 + st.pulse * 0.35 + st.flare * 0.5);
    for (let k = 0; k < mantleSegs.length; k++) {
      const g = mantleSegs[k];
      g.position.z = g.userData.restZ * (1 + st.open * 0.34);
      g.rotation.set(g.userData.restRotX + st.pulse * 0.10 + st.open * 0.03, 0, 0);
      g.scale.setScalar(1 + st.open * 0.02);
    }
    siphon.rotation.set(-0.45 + st.siphon, 0.25, 0);
    siphon.scale.setScalar(1 + Math.max(0, -st.siphon) * 0.25);

    head.rotation.set(0.04 + st.headPitch, st.headYaw, st.headRoll);
    beakLower.rotation.set(0.10 + st.beak * 1.0, 0, 0);
    beak.rotation.set(0.20 + st.beak * 0.15, 0, 0);
    for (let e = 0; e < eyeHoods.length; e++) eyeHoods[e].rotation.set(-st.hood * 0.42, 0, 0);
    for (let e = 0; e < eyeGroups.length; e++) {
      const sd = e === 0 ? 1 : -1;
      eyeGroups[e].rotation.set(-st.headPitch * 0.3, sd * 0.28 + st.headYaw * 0.25, 0);
    }

    for (let i = 0; i < 8; i++) {
      const arm = arms[i], a = A[i];
      // dropping the body flattens the arms so the tips stay on the ground
      const comp = st.bodyY * 0.55;
      arm.g.rotation.set(arm.basePitch + a.lift, arm.baseYaw + a.yaw, a.roll);
      for (let k = 0; k < NSEG; k++) {
        let v = arm.rest[k] * a.curl + a.seg[k];
        if (k < 2 && !arm.probe) v += comp;
        arm.segs[k].rotation.set(v, arm.segs[k].rotation.y, arm.segs[k].rotation.z);
      }
    }
  };

  root.userData.pose({ speed: 0, stride: 0, t: 0 });
  return root;
}