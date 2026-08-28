function build(THREE, TSL) {
// ONE QUALITY: GRIP AND FLEX — a heavy armoured mantle bulb riding over eight long, densely segmented gripping arms.
/* BRIEF
   A machine octopus, crawling. The mass is the mantle: a deep bulb 1.3 long and 0.9 wide,
   built as five hooped segment stations along a spine curve that rises over the middle and
   tapers to a blunt tail — the widest, thickest thing on the body from front and top.
   Under the mantle's front sits the head: one short rigid faceted volume, one shoulder wide,
   carrying two big outboard eye turrets of dark recessed glass in machined bezels, a brow
   ridge, three overlapping pressed top plates, and a hinged beak in a peri-oral ring.
   Below and forward of the head a bearing-race crown throws eight arms in a fan: each arm is
   eight machined blocks on visible barrel joints, tapering 0.10 -> 0.02, part-shelled on the
   top third with the suckers, rams, chain and races bare underneath.
   Cable: short corrugated trunks along each mantle station between port collars, split at
   every joint; loops on the crown; harness on each arm's first block.
   Expensive detail: the eye turrets and the dorsal gap, where chain runs, gear stacks and
   ram pairs sit in the open between the clamped white shells.
*/
const { Fn, vec3, float, positionLocal, normalLocal, sin, cos, mix, smoothstep, clamp, oneMinus, length, pow } = TSL;
const TAU = Math.PI * 2;
const SM = THREE.MeshStandardNodeMaterial || THREE.MeshStandardMaterial;

// ---------------------------------------------------------------- materials
const nz = Fn(([p, f]) => {
  const q = p.mul(f);
  const a = sin(q.x.mul(1.7).add(cos(q.z.mul(2.3)).mul(1.7))).mul(0.5);
  const b = sin(q.y.mul(2.9).add(cos(q.x.mul(3.1)).mul(1.3))).mul(0.3);
  const c = sin(q.z.mul(5.3).add(cos(q.y.mul(4.7)).mul(2.1))).mul(0.2);
  return a.add(b).add(c).mul(0.5).add(0.5);
});

const shellCol = Fn(() => {
  const p = positionLocal;
  const n1 = nz(p, float(5.0));
  const n2 = nz(p.add(vec3(7.3, 2.1, 4.7)), float(16.0));
  const rim = smoothstep(float(0.05), float(0.30), length(p));
  const dn = clamp(normalLocal.y.mul(-1.0), float(0.0), float(1.0));
  const up = clamp(normalLocal.y, float(0.0), float(1.0));
  let col = mix(vec3(0.847, 0.824, 0.776), vec3(0.788, 0.760, 0.706), n1);
  col = mix(col, vec3(0.710, 0.675, 0.612), pow(n2, float(2.0)).mul(0.55));
  const chip = smoothstep(float(0.52), float(0.80), n2.mul(float(0.5).add(rim.mul(0.8))).add(rim.mul(0.20)));
  col = mix(col, vec3(0.315, 0.305, 0.285), chip.mul(0.9));
  const streak = nz(vec3(p.x.mul(5.0), p.y.mul(0.85), p.z.mul(5.0)), float(2.6));
  const rust = smoothstep(float(0.58), float(0.90), streak).mul(dn.mul(0.55).add(0.28)).mul(rim.mul(0.55).add(0.22));
  col = mix(col, vec3(0.40, 0.22, 0.11), rust.mul(0.8));
  col = col.mul(oneMinus(dn.mul(0.30)));
  col = col.mul(float(1.0).add(up.mul(0.05)));
  return col;
});
const shellRough = Fn(() => float(0.56).add(clamp(normalLocal.y, float(0.0), float(1.0)).mul(0.16)));

const machCol = Fn(() => {
  const p = positionLocal;
  const n1 = nz(p, float(9.0));
  const n2 = nz(p.add(vec3(2.7, 5.1, 1.3)), float(24.0));
  const rim = smoothstep(float(0.03), float(0.22), length(p));
  const dn = clamp(normalLocal.y.mul(-1.0), float(0.0), float(1.0));
  const up = clamp(normalLocal.y, float(0.0), float(1.0));
  let col = mix(vec3(0.243, 0.227, 0.204), vec3(0.333, 0.322, 0.298), n1);
  col = mix(col, vec3(0.420, 0.400, 0.368), up.mul(0.55).mul(n2));
  col = mix(col, vec3(0.290, 0.258, 0.218), smoothstep(float(0.5), float(0.85), n2).mul(rim));
  col = col.mul(oneMinus(dn.mul(0.35)));
  return col;
});
const machRough = Fn(() => float(0.50).add(clamp(normalLocal.y, float(0.0), float(1.0)).mul(0.18)).add(nz(positionLocal, float(14.0)).mul(0.08)));

const mk = (opts, cN, rN) => {
  const m = new SM(opts);
  try { if (cN) m.colorNode = cN(); if (rN) m.roughnessNode = rN(); } catch (e) { }
  return m;
};
const SHELL = mk({ color: 0xD8D2C6, metalness: 0.14, roughness: 0.6 }, shellCol, shellRough);
SHELL.side = THREE.DoubleSide;
const MACH = mk({ color: 0x55524C, metalness: 0.85, roughness: 0.55 }, machCol, machRough);
const DARK = mk({ color: 0x3E3A34, metalness: 0.8, roughness: 0.47 }, machCol, null);
const BRZ = mk({ color: 0x4A4238, metalness: 0.8, roughness: 0.6 }, null, null);
const RUB = mk({ color: 0x1E1D1B, metalness: 0.0, roughness: 0.93 }, null, null);
const LENS = mk({ color: 0x0A0B0D, metalness: 0.1, roughness: 0.08 }, null, null);
const ACC = mk({ color: 0xC2521E, metalness: 0.1, roughness: 0.55 }, null, null);
const GLOWC = mk({ color: 0x24312F, metalness: 0.2, roughness: 0.4 }, null, null);
const GLOWA = mk({ color: 0x33281A, metalness: 0.2, roughness: 0.4 }, null, null);
try { GLOWC.emissiveNode = vec3(0.12, 0.55, 0.62); GLOWA.emissiveNode = vec3(0.7, 0.42, 0.10); } catch (e) { }

// ---------------------------------------------------------------- primitives
const BOLTG = new THREE.CylinderGeometry(0.5, 0.42, 0.42, 6);
const cyl = (rt, rb, h, mat, sg) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, sg || 8), mat);
const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
const lat = (prof, mat, sg) => new THREE.Mesh(new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), sg || 14), mat);
const tor = (r, tr, mat, arc, rs) => new THREE.Mesh(new THREE.TorusGeometry(r, tr, rs || 6, 18, arc === undefined ? TAU : arc), mat);
const wrap = (rt, rb, h, t0, tl, mat) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 20, 1, true, t0, tl), mat);
const plate = (pts, depth, mat, holes) => {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  if (holes) holes.forEach(h => {
    const p = new THREE.Path();
    p.moveTo(h[0][0], h[0][1]);
    for (let i = 1; i < h.length; i++) p.lineTo(h[i][0], h[i][1]);
    p.closePath(); sh.holes.push(p);
  });
  const g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, steps: 1, curveSegments: 6 });
  g.translate(0, 0, -depth * 0.5);
  return new THREE.Mesh(g, mat);
};
const bolt = (parent, x, y, z, s, mat) => { const b = new THREE.Mesh(BOLTG, mat || MACH); b.scale.setScalar(s); b.position.set(x, y, z); b.name = 'bolt'; parent.add(b); return b; };
const boltRing = (parent, n, rad, y, s, mat, axis) => {
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, b = new THREE.Mesh(BOLTG, mat || MACH);
    b.scale.setScalar(s); b.name = 'bolt';
    if (axis === 'x') { b.position.set(y, Math.cos(a) * rad, Math.sin(a) * rad); b.rotation.z = Math.PI / 2; }
    else if (axis === 'z') { b.position.set(Math.cos(a) * rad, Math.sin(a) * rad, y); b.rotation.x = Math.PI / 2; }
    else b.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
    parent.add(b);
  }
};
const chainRun = (parent, pts, n, s, mat) => {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.Group(); g.name = 'chain_run';
  const lg = new THREE.BoxGeometry(0.055 * s, 0.020 * s, 0.050 * s);
  const pg = new THREE.CylinderGeometry(0.014 * s, 0.014 * s, 0.075 * s, 6); pg.rotateZ(Math.PI / 2);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, p = curve.getPointAt(u), t = curve.getTangentAt(u);
    const o = new THREE.Object3D(); o.position.copy(p); o.lookAt(p.clone().add(t)); o.name = 'link';
    const m = new THREE.Mesh(lg, mat || MACH); o.add(m);
    const pin = new THREE.Mesh(pg, DARK); pin.position.z = 0.026 * s; o.add(pin);
    g.add(o);
  }
  parent.add(g); return g;
};
const hose = (parent, pts, r, name, corr) => {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(10, pts.length * 5), r, 7, false), RUB);
  m.name = name || 'hose'; parent.add(m);
  if (corr) {
    const rg = new THREE.TorusGeometry(r * 1.35, r * 0.36, 5, 9);
    for (let i = 0; i <= 6; i++) {
      const u = 0.04 + i / 6 * 0.92, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      const rm = new THREE.Mesh(rg, RUB); rm.position.copy(p); rm.lookAt(p.clone().add(t)); rm.name = 'corrugation'; parent.add(rm);
    }
  }
  // port collars at both ends
  [0, 1].forEach(e => {
    const p = curve.getPointAt(e === 0 ? 0.001 : 0.999), t = curve.getTangentAt(e === 0 ? 0.001 : 0.999);
    const c = lat([[0, 0], [r * 2.1, 0], [r * 2.1, r * 0.7], [r * 1.5, r * 0.9], [r * 1.5, r * 1.5], [0, r * 1.5]], MACH, 10);
    c.name = 'port_collar'; c.position.copy(p);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.clone().multiplyScalar(e === 0 ? 1 : -1).normalize());
    c.quaternion.copy(q); parent.add(c);
  });
  return m;
};
const ram = (len, r, name) => {
  const g = new THREE.Group(); g.name = name || 'ram';
  const barrel = lat([[0, 0], [r * 1.15, 0], [r * 1.15, 0.012], [r, 0.02], [r, len * 0.58], [r * 0.8, len * 0.60], [r * 0.8, len * 0.63], [0, len * 0.63]], MACH, 12);
  barrel.name = 'ram_barrel'; g.add(barrel);
  boltRing(g, 6, r * 0.8, 0.014, r * 0.28, DARK);
  const rod = cyl(r * 0.4, r * 0.4, len * 0.52, DARK, 10); rod.position.y = len * 0.62 + len * 0.26; rod.name = 'ram_rod'; g.add(rod);
  const gl = lat([[0, 0], [r * 0.85, 0], [r * 0.85, 0.02], [r * 0.55, 0.03], [0, 0.03]], RUB, 10); gl.position.y = len * 0.615; gl.name = 'ram_gland_boot'; g.add(gl);
  const cl = box(r * 1.5, r * 1.1, r * 0.7, MACH); cl.position.y = len * 1.06; cl.name = 'ram_clevis'; g.add(cl);
  const pin = cyl(r * 0.24, r * 0.24, r * 2.0, DARK, 8); pin.rotation.z = Math.PI / 2; pin.position.y = len * 1.06; pin.name = 'clevis_pin'; g.add(pin);
  return g;
};
const gearStack = (rads, name) => {
  const g = new THREE.Group(); g.name = name || 'gear_stack';
  let y = 0;
  rads.forEach((r, i) => {
    const th = 0.018 + 0.006 * (i % 2);
    const d = lat([[0, 0], [r * 0.4, 0], [r * 0.45, th * 0.3], [r, th * 0.25], [r, th * 0.75], [r * 0.45, th * 0.7], [r * 0.4, th], [0, th]], i === 0 ? MACH : DARK, 16);
    d.position.y = y; d.name = 'gear'; g.add(d);
    if (i === 0) for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; const t = box(r * 0.16, th * 0.9, r * 0.2, DARK); t.position.set(Math.cos(a) * r * 1.02, y + th * 0.5, Math.sin(a) * r * 1.02); t.rotation.y = -a; t.name = 'gear_tooth'; g.add(t); }
    y += th + 0.006;
  });
  const hub = lat([[0, -0.01], [r0 => 0, 0]].length ? [[0, -0.01], [rads[0] * 0.30, -0.01], [rads[0] * 0.26, y + 0.02], [0, y + 0.02]] : [], MACH, 10);
  hub.name = 'gear_hub'; g.add(hub);
  return g;
};
const bearingRace = (r, name) => {
  const g = new THREE.Group(); g.name = name || 'bearing_race';
  const outer = lat([[r * 0.72, 0], [r, 0], [r, 0.04], [r * 0.9, 0.055], [r * 0.72, 0.045]], MACH, 22); outer.name = 'race_outer'; g.add(outer);
  const inner = tor(r * 0.80, 0.016, DARK, TAU, 6); inner.rotation.x = Math.PI / 2; inner.position.y = 0.03; inner.name = 'race_balls'; g.add(inner);
  boltRing(g, 10, r * 0.93, 0.045, 0.024, DARK);
  return g;
};

// ---------------------------------------------------------------- root
const root = new THREE.Group(); root.name = 'armoured_octopus';
const core = new THREE.Group(); core.name = 'core'; root.add(core);

// =============================================== PASS 1/4/5: MANTLE (largest mass = stack)
const mantle = new THREE.Group(); mantle.name = 'mantle';
mantle.position.set(0, 0.80, 0.15); mantle.rotation.y = Math.PI; core.add(mantle);
const neckRest = lat([[0, 0], [0.28, 0], [0.30, 0.03], [0.28, 0.06], [0.22, 0.075], [0, 0.075]], MACH, 18);
neckRest.rotation.x = -Math.PI / 2; neckRest.name = 'neck_flange'; mantle.add(neckRest);
boltRing(mantle, 12, 0.26, 0.0, 0.028, DARK, 'z');
const spine = [[0, 0, 0], [0, 0.12, 0.20], [0, 0.20, 0.50], [0, 0.18, 0.80], [0, 0.08, 1.07], [0, -0.05, 1.27]];
const rr = [0.30, 0.42, 0.45, 0.40, 0.30, 0.17];
const mantleSegs = [];
let mp = mantle, prevAbs = 0, prevLen = 0;
for (let i = 0; i < 5; i++) {
  const dy = spine[i + 1][1] - spine[i][1], dz = spine[i + 1][2] - spine[i][2];
  const len = Math.hypot(dy, dz), abs = -Math.atan2(dy, dz);
  const node = new THREE.Group(); node.name = 'mantle_station_' + (i + 1);
  node.position.set(0, 0, i === 0 ? 0 : prevLen);
  node.rotation.x = abs - prevAbs;
  mp.add(node); prevAbs = abs; prevLen = len; mp = node;
  const g = new THREE.Group(); g.name = 'mantle_station_' + (i + 1) + '_body'; node.add(g);
  const r0 = rr[i], r1 = rr[i + 1];
  // (a) machined hull block for this station
  const hull = cyl(r1 * 0.97, r0 * 0.97, len * 1.02, MACH, 9); hull.rotation.x = Math.PI / 2; hull.position.z = len / 2; hull.name = 'hull_block'; g.add(hull);
  const rib = tor(r0 * 1.03, 0.024, DARK, TAU, 6); rib.position.z = 0.006; rib.name = 'hoop_rib'; g.add(rib);
  const rib2 = tor((r0 + r1) * 0.5 * 1.0, 0.016, DARK, TAU, 6); rib2.position.z = len * 0.55; rib2.name = 'hoop_rib_b'; g.add(rib2);
  boltRing(g, 14, r0 * 1.0, 0.03, 0.026, DARK, 'z');
  // (b) hardware in the dorsal gap: blocks, chain, gears, rams, races
  const db = box(0.13, 0.075, len * 0.62, MACH); db.position.set(0, (r0 + r1) * 0.47, len * 0.5); db.name = 'dorsal_block'; g.add(db);
  bolt(g, 0.045, (r0 + r1) * 0.47 + 0.04, len * 0.5, 0.03); bolt(g, -0.045, (r0 + r1) * 0.47 + 0.04, len * 0.5, 0.03);
  for (const sx of [-1, 1]) {
    chainRun(g, [[sx * 0.075, r0 * 0.96, 0.03], [sx * 0.08, (r0 + r1) * 0.5 * 0.99, len * 0.5], [sx * 0.075, r1 * 0.96, len - 0.02]], 6, 0.9, MACH);
    const gs = gearStack([0.058, 0.040, 0.028], 'gear_stack'); gs.rotation.z = sx * Math.PI / 2;
    gs.position.set(sx * r0 * 0.80, -r0 * 0.10, 0.02); g.add(gs);
    const rm = ram(len * 0.82, 0.030, 'mantle_ram'); rm.rotation.x = Math.PI / 2;
    rm.position.set(sx * (r0 * 0.80), -r0 * 0.42, 0.03); g.add(rm);
    const race = bearingRace(0.075, 'station_race'); race.rotation.z = sx * Math.PI / 2; race.position.set(sx * r0 * 0.62, r0 * 0.45, 0.02); g.add(race);
    const rod = cyl(0.014, 0.014, len * 0.9, DARK, 6); rod.rotation.x = Math.PI / 2; rod.position.set(sx * (r0 * 0.55), r0 * 0.62, len * 0.5); rod.name = 'tie_rod'; g.add(rod);
  }
  // cable: one trunk per side, entirely inside this station, port collar each end
  for (const sx of [-1, 1]) {
    hose(g, [[sx * (r0 * 0.90), r0 * 0.30, 0.03], [sx * (r0 * 1.06), r0 * 0.05, len * 0.35], [sx * (r0 * 1.04), -r0 * 0.10, len * 0.7], [sx * (r1 * 0.92), r1 * 0.25, len - 0.02]], 0.020, 'trunk_line', true);
    hose(g, [[sx * (r0 * 0.80), r0 * 0.55, 0.04], [sx * (r0 * 0.95), r0 * 0.62, len * 0.5], [sx * (r1 * 0.82), r1 * 0.55, len - 0.03]], 0.007, 'signal_wire', false);
    const clamp2 = box(0.035, 0.022, 0.022, MACH); clamp2.position.set(sx * (r0 * 1.02), r0 * 0.05, len * 0.5); clamp2.name = 'hose_clamp'; g.add(clamp2);
  }
  // (c) shells clamped over the stack — left and right, dorsal gap between them
  const shells = [];
  for (const sx of [1, -1]) {
    const sg = new THREE.Group(); sg.name = 'shell_group_' + (sx > 0 ? 'r' : 'l') + (i + 1); g.add(sg);
    const t0 = sx > 0 ? 1.05 : (TAU - 1.05 - 1.85);
    const sh = wrap(r1 + 0.045, r0 + 0.045, len * 0.94, t0, 1.85, SHELL);
    sh.rotation.x = Math.PI / 2; sh.position.z = len * 0.5; sh.name = 'mantle_shell_' + (sx > 0 ? 'r' : 'l') + (i + 1); sg.add(sh);
    const lip = tor(r0 + 0.048, 0.014, SHELL, 1.85, 5); lip.rotation.z = t0 + Math.PI / 2; lip.position.z = len * 0.04; lip.name = 'rolled_lip'; sg.add(lip);
    const lip2 = tor(r1 + 0.048, 0.012, SHELL, 1.85, 5); lip2.rotation.z = t0 + Math.PI / 2; lip2.position.z = len * 0.95; lip2.name = 'rolled_lip_b'; sg.add(lip2);
    // raised rib on shell face + bolt row along its lower border
    for (let k = 0; k < 5; k++) {
      const a = t0 + 0.18 + k * 0.38;
      bolt(sg, Math.sin(a) * (r0 + 0.055), -Math.cos(a) * (r0 + 0.055), len * 0.10, 0.026, MACH);
      bolt(sg, Math.sin(a) * (r1 + 0.055), -Math.cos(a) * (r1 + 0.055), len * 0.88, 0.024, MACH);
    }
    const ridA = t0 + 0.95;
    const rid = box(0.026, 0.020, len * 0.7, SHELL); rid.position.set(Math.sin(ridA) * (r0 + 0.052), -Math.cos(ridA) * (r0 + 0.052), len * 0.5);
    rid.rotation.z = -ridA; rid.name = 'shell_rib'; sg.add(rid);
    // small bolt-on plate lapping over the neighbour behind
    const cap = plate([[-0.055, -len * 0.30], [0.055, -len * 0.30], [0.070, 0], [0.045, len * 0.30], [-0.045, len * 0.30], [-0.070, 0]], 0.016, SHELL);
    const ca = t0 + 1.62;
    cap.position.set(Math.sin(ca) * (r0 + 0.058), -Math.cos(ca) * (r0 + 0.058), len * 0.62);
    cap.rotation.set(Math.PI / 2, 0, -ca); cap.name = 'lap_plate'; sg.add(cap);
    shells.push(sg);
  }
  // flank vent, formed plate with cut slots
  if (i === 1 || i === 2) {
    for (const sx of [-1, 1]) {
      const v = plate([[-0.09, -0.05], [0.09, -0.05], [0.10, 0.05], [-0.10, 0.05]], 0.014, SHELL,
        [[[-0.06, -0.02], [0.06, -0.02], [0.06, 0.005], [-0.06, 0.005]], [[-0.06, 0.02], [0.06, 0.02], [0.06, 0.04], [-0.06, 0.04]]]);
      v.position.set(sx * (r0 + 0.052), -r0 * 0.42, len * 0.45); v.rotation.set(0, sx * Math.PI / 2, 0.15 * sx); v.name = 'gill_vent'; g.add(v);
    }
  }
  mantleSegs.push({ node: node, g: g, shells: shells, rest: node.rotation.x, len: len });
}
// tail cap
const tailCap = lat([[0, 0], [0.15, 0.01], [0.16, 0.05], [0.11, 0.10], [0, 0.115]], MACH, 14);
tailCap.rotation.x = -Math.PI / 2; tailCap.position.z = mantleSegs[4].len; tailCap.name = 'tail_cap';
mantleSegs[4].g.add(tailCap);
boltRing(mantleSegs[4].g, 8, 0.12, mantleSegs[4].len + 0.01, 0.024, DARK, 'z');
// asymmetric bolt-on module (starboard, station 2) with the one status port
const modu = new THREE.Group(); modu.name = 'aux_module'; modu.position.set(0.40, 0.20, 0.30); modu.rotation.set(0, -0.3, 0.4);
const mbody = box(0.14, 0.10, 0.20, MACH); mbody.name = 'aux_body'; modu.add(mbody);
const mlid = plate([[-0.06, -0.09], [0.06, -0.09], [0.07, 0.09], [-0.07, 0.09]], 0.018, SHELL); mlid.rotation.x = Math.PI / 2; mlid.position.y = 0.058; mlid.name = 'aux_hatch'; modu.add(mlid);
const acc1 = plate([[-0.035, -0.05], [0.035, -0.05], [0.035, 0.05], [-0.035, 0.05]], 0.012, ACC); acc1.rotation.x = Math.PI / 2; acc1.position.set(0, 0.074, 0.02); acc1.name = 'accent_hatch'; modu.add(acc1);
const stat = box(0.022, 0.008, 0.05, GLOWC); stat.position.set(0.06, 0.03, -0.06); stat.name = 'status_port'; modu.add(stat);
bolt(modu, 0.05, 0.06, 0.08, 0.028); bolt(modu, -0.05, 0.06, 0.08, 0.028); bolt(modu, 0.05, 0.06, -0.08, 0.028); bolt(modu, -0.05, 0.06, -0.08, 0.028);
mantleSegs[1].g.add(modu);
// hazard diagonals + stencil triangle
for (let k = 0; k < 3; k++) { const hz = box(0.012, 0.006, 0.05, DARK); hz.position.set(-0.42 + k * 0.02, 0.26, 0.24); hz.rotation.set(0.5, 0.2, 0); hz.name = 'hazard_stripe'; mantleSegs[1].g.add(hz); }
const tri = plate([[0, 0.035], [0.032, -0.022], [-0.032, -0.022]], 0.006, DARK);
tri.rotation.set(Math.PI / 2, 0, 0); tri.position.set(0.20, 0.44, 0.30); tri.name = 'stencil_mark'; mantleSegs[2].g.add(tri);

// siphon / funnel (right flank of station 1) — points forward-down
const siphon = new THREE.Group(); siphon.name = 'siphon'; siphon.position.set(0.24, -0.16, 0.12);
siphon.rotation.set(0.5, -0.5, 0.3); mantleSegs[0].g.add(siphon);
const sbase = lat([[0, 0], [0.075, 0], [0.078, 0.03], [0.062, 0.05], [0.058, 0.11], [0.046, 0.15], [0.048, 0.18], [0.036, 0.20], [0, 0.20]], MACH, 16);
sbase.name = 'siphon_barrel'; siphon.add(sbase);
boltRing(siphon, 8, 0.062, 0.012, 0.024, DARK);
const scol = lat([[0.040, 0], [0.052, 0], [0.052, 0.022], [0.040, 0.022]], ACC, 14); scol.position.y = 0.185; scol.name = 'siphon_collar_accent'; siphon.add(scol);
const snoz = lat([[0, 0], [0.036, 0], [0.030, 0.05], [0.026, 0.055], [0, 0.055]], DARK, 14); snoz.position.y = 0.205; snoz.name = 'siphon_nozzle'; siphon.add(snoz);
const heat = box(0.012, 0.03, 0.006, GLOWA); heat.position.set(0.06, 0.09, 0.0); heat.name = 'heat_slot'; siphon.add(heat);
hose(siphon, [[0.06, 0.03, 0.03], [0.10, 0.09, 0.05], [0.05, 0.16, 0.02]], 0.012, 'siphon_line', true);
const sram = ram(0.16, 0.022, 'siphon_ram'); sram.position.set(-0.07, 0.02, 0.02); sram.rotation.z = 0.35; siphon.add(sram);

// =============================================== PASS 2: HEAD (leading end, densest)
const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.745, 0.40); head.rotation.x = 0.06; core.add(head);
const headRest = 0.06;
const hHull = cyl(0.215, 0.245, 0.44, MACH, 7); hHull.rotation.x = Math.PI / 2; hHull.position.z = 0.0; hHull.name = 'head_frame'; head.add(hHull);
const hUnder = box(0.34, 0.13, 0.36, MACH); hUnder.position.set(0, -0.105, 0.01); hUnder.name = 'head_underframe'; head.add(hUnder);
const hCheekFrameL = box(0.10, 0.16, 0.20, DARK); hCheekFrameL.position.set(-0.20, 0.02, 0.10); hCheekFrameL.name = 'eye_frame_l'; head.add(hCheekFrameL);
const hCheekFrameR = hCheekFrameL.clone(); hCheekFrameR.position.x = 0.20; hCheekFrameR.name = 'eye_frame_r'; head.add(hCheekFrameR);
const headPlates = [];
const topOutlines = [
  { pts: [[-0.10, 0.30], [0.10, 0.30], [0.19, 0.14], [0.20, 0.00], [-0.20, 0.00], [-0.19, 0.14]], y: 0.170, tilt: 0.30, name: 'skull_plate_front' },
  { pts: [[-0.21, 0.05], [0.21, 0.05], [0.27, -0.07], [0.24, -0.20], [-0.24, -0.20], [-0.27, -0.07]], y: 0.155, tilt: 0.02, name: 'skull_plate_mid' },
  { pts: [[-0.22, -0.15], [0.22, -0.15], [0.17, -0.30], [-0.17, -0.30]], y: 0.135, tilt: -0.22, name: 'skull_plate_rear' }
];
topOutlines.forEach((o, k) => {
  const pl = plate(o.pts, 0.030, SHELL, k === 1 ? [[[-0.05, -0.14], [0.05, -0.14], [0.05, -0.11], [-0.05, -0.11]]] : null);
  pl.rotation.x = Math.PI / 2 + o.tilt; pl.position.set(0, o.y, 0.02); pl.name = o.name; head.add(pl);
  headPlates.push({ o: pl, rest: pl.rotation.x });
  const n = o.pts.length;
  for (let i = 0; i < n; i++) bolt(pl, o.pts[i][0] * 0.86, o.pts[i][1] * 0.86, -0.020, 0.024, MACH);
  const rid = box(0.024, 0.016, 0.16, SHELL); rid.rotation.x = -o.tilt; rid.position.set(0, o.y + 0.020, o.pts[0][1] * 0.5 + 0.02); rid.name = o.name + '_rib'; head.add(rid);
});
// brow ridge over the optics + front wedge planes
for (const sx of [-1, 1]) {
  const brow = plate([[-0.09, -0.035], [0.09, -0.045], [0.10, 0.030], [-0.08, 0.035]], 0.022, SHELL);
  brow.position.set(sx * 0.215, 0.115, 0.115); brow.rotation.set(0.5, sx * 0.55, sx * 0.25); brow.name = 'brow_plate_' + (sx > 0 ? 'r' : 'l'); head.add(brow);
  bolt(brow, 0.06, 0.0, -0.014, 0.024); bolt(brow, -0.06, 0.0, -0.014, 0.024);
  const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.20, 18, 12, 0, Math.PI * 1.0, 0.80, 0.95), SHELL);
  cheek.rotation.set(0, sx > 0 ? -0.4 : Math.PI + 0.4, sx * Math.PI / 2); cheek.scale.set(1.0, 0.75, 0.95);
  cheek.position.set(sx * 0.06, 0.0, 0.02); cheek.name = 'cheek_shell_' + (sx > 0 ? 'r' : 'l'); head.add(cheek);
}
const wedge1 = plate([[-0.10, -0.06], [0.10, -0.06], [0.075, 0.07], [-0.075, 0.07]], 0.024, SHELL);
wedge1.position.set(0, 0.055, 0.235); wedge1.rotation.set(1.05, 0, 0); wedge1.name = 'face_wedge_upper'; head.add(wedge1);
const wedge2 = plate([[-0.085, -0.06], [0.085, -0.06], [0.10, 0.06], [-0.10, 0.06]], 0.022, SHELL);
wedge2.position.set(0, -0.045, 0.215); wedge2.rotation.set(1.9, 0, 0); wedge2.name = 'face_wedge_lower'; head.add(wedge2);
bolt(wedge1, 0.06, -0.03, -0.014, 0.024); bolt(wedge1, -0.06, -0.03, -0.014, 0.024);
bolt(wedge2, 0.07, 0.03, -0.014, 0.024); bolt(wedge2, -0.07, 0.03, -0.014, 0.024);
// eye turrets
const eyeLids = [];
for (const sx of [-1, 1]) {
  const eg = new THREE.Group(); eg.name = 'eye_turret_' + (sx > 0 ? 'r' : 'l');
  eg.position.set(sx * 0.235, 0.035, 0.115); eg.rotation.set(0.08, sx * 0.62, 0); head.add(eg);
  const hous = lat([[0, 0], [0.11, 0.005], [0.115, 0.03], [0.10, 0.055], [0.085, 0.062], [0.085, 0.075], [0, 0.075]], MACH, 18);
  hous.rotation.x = Math.PI / 2; hous.rotation.z = 0; hous.name = 'optic_housing'; eg.add(hous);
  boltRing(eg, 10, 0.098, 0.012, 0.024, DARK, 'z');
  const bez = lat([[0.070, 0], [0.098, 0], [0.098, 0.018], [0.082, 0.030], [0.070, 0.026]], MACH, 20);
  bez.rotation.x = Math.PI / 2; bez.position.z = 0.055; bez.name = 'optic_bezel'; eg.add(bez);
  const bez2 = tor(0.084, 0.008, DARK, TAU, 5); bez2.position.z = 0.070; bez2.name = 'bezel_ring'; eg.add(bez2);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.070, 20, 14), LENS);
  lens.scale.set(1, 0.92, 0.55); lens.position.z = 0.030; lens.name = 'eye_lens'; eg.add(lens);
  const pup = box(0.096, 0.016, 0.010, RUB); pup.position.z = 0.060; pup.name = 'pupil_slit'; eg.add(pup);
  const lid = plate([[-0.10, -0.03], [0.10, -0.03], [0.085, 0.045], [-0.085, 0.045]], 0.018, SHELL);
  lid.position.set(0, 0.075, 0.040); lid.rotation.set(0.85, 0, 0); lid.name = 'eye_lid'; eg.add(lid);
  eyeLids.push({ o: lid, rest: 0.85 });
  const fit1 = box(0.032, 0.030, 0.040, MACH); fit1.position.set(sx * 0.075, -0.060, 0.030); fit1.name = 'optic_fitting_a'; eg.add(fit1);
  const fit2 = cyl(0.016, 0.020, 0.05, DARK, 8); fit2.rotation.x = Math.PI / 2; fit2.position.set(-sx * 0.080, -0.050, 0.030); fit2.name = 'optic_fitting_b'; eg.add(fit2);
  const gs = gearStack([0.034, 0.024], 'optic_gear'); gs.rotation.x = Math.PI / 2; gs.position.set(0, -0.085, 0.0); eg.add(gs);
  hose(eg, [[sx * 0.075, -0.062, 0.010], [sx * 0.10, -0.10, -0.03], [sx * 0.03, -0.085, -0.075]], 0.011, 'optic_line', true);
}
// beak assembly in a peri-oral ring
const mouth = new THREE.Group(); mouth.name = 'mouth_ring'; mouth.position.set(0, -0.155, 0.06); head.add(mouth);
const ring = lat([[0.055, 0], [0.10, 0], [0.105, 0.022], [0.085, 0.036], [0.055, 0.030]], MACH, 20);
ring.rotation.x = Math.PI; ring.name = 'oral_race'; mouth.add(ring);
boltRing(mouth, 10, 0.092, -0.012, 0.024, DARK);
for (let k = 0; k < 8; k++) {
  const a = k / 8 * TAU;
  const op = plate([[-0.022, -0.030], [0.022, -0.030], [0.016, 0.030], [-0.016, 0.030]], 0.012, SHELL);
  op.position.set(Math.cos(a) * 0.085, -0.030, Math.sin(a) * 0.085);
  op.rotation.set(Math.PI / 2 - 0.5, -a + Math.PI / 2, 0); op.name = 'oral_plate_' + (k + 1); mouth.add(op);
}
const beakU = cyl(0.006, 0.052, 0.085, DARK, 6); beakU.position.set(0, -0.055, 0.012); beakU.rotation.x = -0.45; beakU.name = 'beak_upper'; mouth.add(beakU);
const beakLow = new THREE.Group(); beakLow.name = 'beak_lower'; beakLow.position.set(0, -0.030, 0.020); mouth.add(beakLow);
const beakLm = cyl(0.006, 0.048, 0.080, DARK, 6); beakLm.position.set(0, -0.042, 0.020); beakLm.rotation.x = 0.35; beakLm.name = 'beak_lower_blade'; beakLow.add(beakLm);
const beakHinge = cyl(0.014, 0.014, 0.09, MACH, 8); beakHinge.rotation.z = Math.PI / 2; beakHinge.name = 'beak_hinge_pin'; beakLow.add(beakHinge);
for (const sx of [-1, 1]) {
  const jr = ram(0.10, 0.017, 'jaw_ram'); jr.position.set(sx * 0.065, -0.02, -0.02); jr.rotation.set(-0.5, 0, sx * 0.2); mouth.add(jr);
}
// sensor stalks + neck hardware + head harness
for (let k = 0; k < 3; k++) {
  const st = new THREE.Group(); st.name = 'sensor_stalk_' + (k + 1);
  st.position.set((k - 1) * 0.09, 0.175, -0.20 + Math.abs(k - 1) * 0.02); st.rotation.set(-0.5, 0, (k - 1) * 0.25); head.add(st);
  const sm = cyl(0.008, 0.013, 0.09, MACH, 6); sm.position.y = 0.045; sm.name = 'stalk_shaft'; st.add(sm);
  const sc = lat([[0, 0], [0.020, 0], [0.018, 0.020], [0, 0.024]], DARK, 10); sc.position.y = 0.09; sc.name = 'stalk_head'; st.add(sc);
  const sb = lat([[0, 0], [0.024, 0], [0.022, 0.012], [0, 0.012]], MACH, 10); sb.name = 'stalk_base'; st.add(sb);
}
const collar = lat([[0, 0], [0.24, 0], [0.25, 0.03], [0.23, 0.055], [0, 0.055]], MACH, 18);
collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.045, -0.22); collar.name = 'neck_collar'; head.add(collar);
const boot = tor(0.235, 0.035, RUB, TAU, 6); boot.position.set(0, 0.045, -0.245); boot.name = 'neck_boot'; head.add(boot);
boltRing(head, 12, 0.225, -0.21, 0.026, DARK, 'z');
hose(head, [[0.18, 0.02, -0.20], [0.24, -0.06, -0.05], [0.20, -0.115, 0.055]], 0.016, 'head_trunk_l', true);
hose(head, [[-0.18, 0.02, -0.20], [-0.24, -0.06, -0.05], [-0.20, -0.115, 0.055]], 0.016, 'head_trunk_r', true);
hose(head, [[0.06, 0.10, -0.235], [0.09, 0.135, -0.12], [0.05, 0.145, -0.03]], 0.007, 'head_wire_l', false);
hose(head, [[-0.06, 0.10, -0.235], [-0.09, 0.135, -0.12], [-0.05, 0.145, -0.03]], 0.007, 'head_wire_r', false);
for (const sx of [-1, 1]) { const nr = ram(0.16, 0.022, 'neck_ram'); nr.position.set(sx * 0.14, 0.02, -0.19); nr.rotation.set(-1.1, 0, sx * 0.2); head.add(nr); }

// =============================================== PASS 3/4: CROWN + EIGHT ARMS
const crown = new THREE.Group(); crown.name = 'arm_crown'; crown.position.set(0, 0.575, 0.285); core.add(crown);
const crownHub = lat([[0, 0.02], [0.22, 0.02], [0.235, -0.02], [0.20, -0.08], [0.10, -0.11], [0, -0.115]], MACH, 22);
crownHub.name = 'crown_hub'; crown.add(crownHub);
const crownRace = bearingRace(0.245, 'crown_race'); crownRace.position.y = 0.01; crown.add(crownRace);
const crownPlateA = plate([[-0.16, -0.10], [0.16, -0.10], [0.20, 0.06], [0, 0.14], [-0.20, 0.06]], 0.024, SHELL);
crownPlateA.rotation.x = -Math.PI / 2; crownPlateA.position.set(0, -0.10, 0.06); crownPlateA.name = 'crown_shell_front'; crown.add(crownPlateA);
const crownPlateB = plate([[-0.15, -0.10], [0.15, -0.10], [0.17, 0.07], [-0.17, 0.07]], 0.022, SHELL);
crownPlateB.rotation.x = -Math.PI / 2 + 0.15; crownPlateB.position.set(0, -0.105, -0.10); crownPlateB.name = 'crown_shell_rear'; crown.add(crownPlateB);
boltRing(crown, 10, 0.19, -0.115, 0.026, MACH);
for (const sx of [-1, 1]) {
  const gs = gearStack([0.06, 0.042, 0.030], 'crown_gear'); gs.rotation.z = sx * Math.PI / 2; gs.position.set(sx * 0.16, -0.03, -0.14); crown.add(gs);
  hose(crown, [[sx * 0.10, -0.02, 0.16], [sx * 0.20, -0.10, 0.02], [sx * 0.12, -0.02, -0.14]], 0.014, 'crown_loop', true);
  hose(crown, [[sx * 0.06, 0.0, 0.18], [sx * 0.13, -0.06, 0.16], [sx * 0.05, 0.0, 0.10]], 0.006, 'crown_wire', false);
}

const armData = [];
const yaws = [18, -18, 58, -58, 104, -104, 150, -150];
const lens8 = [0.27, 0.255, 0.24, 0.22, 0.20, 0.17, 0.13, 0.09];
const rads9 = [0.100, 0.092, 0.084, 0.075, 0.066, 0.056, 0.045, 0.034, 0.022];
const restB = [0.62, 0.25, 0.0, -0.30, -0.45, -0.30, -0.20, -0.12];
const trailB = [-0.22, -0.08, 0.04, 0.06, 0.05, 0.03, 0.0, 0.0];
const wW = [0.30, 0.50, 0.70, 0.88, 1.0, 1.0, 0.90, 0.80];
const twW = [0.0, 0.05, 0.15, 0.35, 0.60, 0.85, 1.0, 1.0];
yaws.forEach((deg, i) => {
  const yaw = deg * Math.PI / 180, side = deg > 0 ? 1 : -1;
  const isFront = Math.abs(deg) < 40, rank = Math.floor(i / 2);
  const rootG = new THREE.Group(); rootG.name = 'arm_' + (i + 1);
  rootG.position.set(Math.sin(yaw) * 0.235, -0.045, Math.cos(yaw) * 0.235);
  rootG.rotation.y = yaw; crown.add(rootG);
  const shoulderRace = bearingRace(0.105, 'arm_' + (i + 1) + '_race'); shoulderRace.rotation.x = Math.PI / 2; shoulderRace.position.z = -0.02; rootG.add(shoulderRace);
  const sBoot = tor(0.098, 0.026, RUB, TAU, 6); sBoot.position.z = 0.03; sBoot.name = 'arm_boot'; rootG.add(sBoot);
  const rest = restB.map((v, j) => j === 0 ? v * (isFront ? 0.84 : 1.0) + (rank === 3 ? 0.10 : 0) : v);
  const segs = []; let parent = rootG;
  for (let j = 0; j < 8; j++) {
    const seg = new THREE.Group(); seg.name = 'arm_' + (i + 1) + '_seg_' + (j + 1);
    seg.position.set(0, 0, j === 0 ? 0.05 : lens8[j - 1]);
    seg.rotation.x = rest[j]; parent.add(seg); segs.push(seg); parent = seg;
    const r0 = rads9[j], r1 = rads9[j + 1], L = lens8[j];
    const cB = cyl(r1 * 0.92, r0 * 0.92, L * 0.97, MACH, 8); cB.rotation.x = Math.PI / 2; cB.position.z = L / 2; cB.name = 'seg_block'; seg.add(cB);
    const barrel = cyl(r0 * 1.05, r0 * 1.05, r0 * 2.4, DARK, 12); barrel.rotation.z = Math.PI / 2; barrel.name = 'joint_barrel'; seg.add(barrel);
    for (const sx of [-1, 1]) {
      const capd = lat([[0, 0], [r0 * 0.95, 0], [r0 * 0.95, 0.012], [r0 * 0.62, 0.020], [r0 * 0.55, 0.030], [0, 0.030]], MACH, 12);
      capd.rotation.z = sx * Math.PI / 2; capd.position.x = sx * r0 * 1.22; capd.name = 'bearing_cap'; seg.add(capd);
      if (j < 4) boltRing(seg, 6, r0 * 0.62, sx * (r0 * 1.28), r0 * 0.20, DARK, 'x');
    }
    // stepped block on top of each segment (stacked segment blocks)
    const tb = box(r0 * 0.9, r0 * 0.5, L * 0.55, MACH); tb.position.set(0, r0 * 0.85, L * 0.5); tb.name = 'seg_top_block'; seg.add(tb);
    // suckers on the inner (-Y) face
    if (j < 4) {
      for (let k = 0; k < 2; k++) {
        const z = L * (0.30 + 0.42 * k), rz = r0 + (r1 - r0) * (0.30 + 0.42 * k);
        const su = lat([[0, 0], [rz * 0.44, 0.004], [rz * 0.48, 0.016], [rz * 0.30, 0.022], [rz * 0.20, 0.014], [0, 0.014]], DARK, 12);
        su.rotation.x = Math.PI; su.position.set(0, -rz * 0.92, z); su.name = 'sucker_' + (j * 2 + k + 1); seg.add(su);
        const sr = tor(rz * 0.46, rz * 0.10, RUB, TAU, 5); sr.rotation.x = Math.PI / 2; sr.position.set(0, -rz * 0.95, z); sr.name = 'sucker_gasket'; seg.add(sr);
      }
    }
    // shell over the top third
    if (j < 3) {
      const sh = wrap(r1 + 0.026, r0 + 0.026, L * 0.86, Math.PI - 0.90, 1.80, SHELL);
      sh.rotation.x = Math.PI / 2; sh.position.z = L * 0.52; sh.name = 'arm_shell_' + (j + 1); seg.add(sh);
      const lip = tor(r0 + 0.029, 0.010, SHELL, 1.80, 5); lip.rotation.z = Math.PI - 0.90 + Math.PI / 2; lip.position.z = L * 0.10; lip.name = 'shell_lip'; seg.add(lip);
      bolt(seg, 0.0, r0 + 0.040, L * 0.16, 0.022, MACH); bolt(seg, 0.0, r1 + 0.038, L * 0.88, 0.020, MACH);
      bolt(seg, r0 * 0.7, r0 * 0.8, L * 0.5, 0.020, MACH); bolt(seg, -r0 * 0.7, r0 * 0.8, L * 0.5, 0.020, MACH);
    }
    // rams and chain on the first two blocks
    if (j < 2) {
      for (const sx of [-1, 1]) {
        const rm = ram(L * 0.86, r0 * 0.30, 'arm_ram'); rm.rotation.x = Math.PI / 2;
        rm.position.set(sx * (r0 * 1.05), -r0 * 0.30, 0.02); seg.add(rm);
      }
      chainRun(seg, [[r0 * 1.15, r0 * 0.55, 0.02], [r0 * 1.20, r0 * 0.30, L * 0.5], [r0 * 1.10, r0 * 0.50, L * 0.94]], 5, 0.8, MACH);
      chainRun(seg, [[-r0 * 1.15, r0 * 0.55, 0.02], [-r0 * 1.20, r0 * 0.30, L * 0.5], [-r0 * 1.10, r0 * 0.50, L * 0.94]], 5, 0.8, MACH);
    }
    if (j === 0) {
      hose(seg, [[r0 * 0.55, r0 * 0.75, 0.03], [r0 * 1.35, r0 * 0.10, L * 0.45], [r0 * 0.60, r0 * 0.70, L * 0.92]], 0.014, 'arm_trunk', true);
      hose(seg, [[-r0 * 0.55, r0 * 0.75, 0.03], [-r0 * 1.35, r0 * 0.10, L * 0.45], [-r0 * 0.60, r0 * 0.70, L * 0.92]], 0.006, 'arm_wire', false);
      // web blade between this arm and its neighbour
      const web = plate([[0, -0.02], [0.16, 0.02], [0.14, 0.10], [0, 0.06]], 0.010, SHELL);
      web.position.set(side * (r0 * 1.1), r0 * 0.2, L * 0.35); web.rotation.set(0.2, side * 1.2, 0.3 * side); web.name = 'web_blade'; seg.add(web);
    }
    if (j === 2) { const gs = gearStack([r0 * 0.9, r0 * 0.6], 'arm_gear'); gs.rotation.z = Math.PI / 2; gs.position.set(r0 * 1.1, 0, 0.01); seg.add(gs); }
  }
  // tip
  const tip = new THREE.Group(); tip.name = 'arm_' + (i + 1) + '_tip'; tip.position.set(0, 0, lens8[7]); segs[7].add(tip);
  const tm = cyl(0.004, rads9[8] * 0.9, 0.075, DARK, 6); tm.rotation.x = Math.PI / 2; tm.position.z = 0.037; tm.name = 'tip_claw'; tip.add(tm);
  const tp = lat([[0, 0], [0.016, 0.002], [0.014, 0.010], [0, 0.010]], MACH, 8); tp.rotation.x = Math.PI; tp.position.set(0, -0.014, 0.02); tp.name = 'tip_pad'; tip.add(tp);
  armData.push({ root: rootG, segs: segs, yaw: yaw, side: side, isFront: isFront, rank: rank, rest: rest, off: (rank * 0.25 + (side > 0 ? 0 : 0.5)) % 1, w: wW, tw: twW });
});

// ---------------------------------------------------------------- pose
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = x => x * x * (3 - 2 * x);
const kf = (x, keys) => {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (x <= keys[i][0]) {
    const a = keys[i - 1], b = keys[i];
    return lerp(a[1], b[1], ease((x - a[0]) / (b[0] - a[0])));
  }
  return keys[keys.length - 1][1];
};

root.userData.pose = (s) => {
  const t = s.t || 0;
  const sp = Math.max(0, s.speed || 0), stride = s.stride || 0, turn = Math.max(-1, Math.min(1, s.turn || 0));
  const grounded = s.grounded !== false;
  const hurt = 1 - clamp01(s.health === undefined ? 1 : s.health);
  const act = s.action || null, ph = clamp01(s.phase || 0);

  const K = {
    bodyY: 0, bodyZ: 0, pitch: 0, roll: 0, yaw: 0,
    headPitch: 0, headYaw: 0, headRoll: 0, jaw: 0.05, lid: 0,
    curl: 0, pulse: 0, flare: 0, siphon: 0, jet: 0,
    cs: 1, wave: 0, lat: 0, lift: 0, spread: 0, reach: 0, tipCurl: 0,
    cycle: stride, lag: 0.09, idle: 0, ov: null
  };

  // ---- idle / breathing always present
  const breath = Math.sin(t * 1.1);
  K.pulse = 0.22 * breath;
  K.idle = 1;
  K.headYaw = Math.sin(t * 0.37) * 0.16;
  K.headPitch = Math.sin(t * 0.53) * 0.05;
  K.headRoll = Math.sin(t * 0.29) * 0.05;
  K.bodyY = 0.012 * breath;
  K.roll = 0.02 * Math.sin(t * 0.31);

  // ---- locomotion
  if (sp > 0.02) {
    const j = clamp01((sp - 1.6) / 1.6);
    const crawl = 1 - j;
    const creep = clamp01(1 - Math.abs(sp - 0.5) / 0.85);
    K.jet = j;
    K.idle = 0.25 * crawl;
    K.wave = (0.07 + 0.17 * clamp01(sp / 1.3)) * crawl + 0.30 * j;
    K.lat = (0.04 + 0.08 * clamp01(sp / 2)) * crawl + 0.15 * j;
    K.lag = lerp(0.11, 0.045, clamp01(sp / 3));
    K.reach = 0.20 * clamp01(sp / 2) * crawl;
    K.cs = 1 + 0.12 * creep - 0.06 * j;
    K.bodyY = -0.075 * creep + 0.11 * j + 0.13 * clamp01((sp - 3) / 3) + 0.02 * Math.sin(TAU * stride * 2) * crawl;
    K.pitch = -0.05 * j - 0.06 * clamp01((sp - 3) / 3) + 0.04 * creep;
    K.pulse = 0.15 * breath * crawl + (0.30 + 0.35 * clamp01((sp - 3) / 3)) * j * Math.sin(TAU * stride);
    K.curl = -0.05 * j;
    K.headPitch = 0.10 * creep - 0.16 * j - 0.10 * clamp01((sp - 3) / 3);
    K.headYaw = Math.sin(t * 0.37) * 0.10 * crawl;
    K.spread = 0.05 * crawl;
    K.siphon = 0.35 * j;
  }

  // ---- turn overlay
  if (turn !== 0) {
    K.headYaw += turn * 0.45;
    K.headRoll += -turn * 0.18;
    K.roll += -turn * 0.15;
    K.yaw += turn * 0.05;
    K.curl += turn * 0.0;
  }

  // ---- airborne
  if (!grounded) {
    K.jet = Math.max(K.jet, 0.72);
    K.wave = 0.10; K.lat = 0.08; K.reach = 0; K.idle = 0.7;
    K.cycle = t * 0.35;
    K.bodyY += 0.16; K.pitch += 0.10;
    K.cs = 0.94; K.tipCurl = 0.10; K.pulse = 0.35 * Math.sin(t * 3.0);
    K.headPitch += -0.12;
  }

  // ---- actions
  if (act === 'attack') {
    K.bodyZ = kf(ph, [[0, 0], [0.28, -0.12], [0.5, 0.26], [0.72, 0.10], [1, 0]]);
    K.pitch += kf(ph, [[0, 0], [0.28, 0.18], [0.5, -0.20], [0.75, 0.03], [1, 0]]);
    K.bodyY += kf(ph, [[0, 0], [0.28, 0.06], [0.5, -0.05], [1, 0]]);
    K.jaw = kf(ph, [[0, 0.05], [0.3, 0.35], [0.48, 0.9], [0.65, 0.15], [1, 0.05]]);
    K.curl += kf(ph, [[0, 0], [0.28, 0.16], [0.5, -0.18], [1, 0]]);
    K.headPitch += kf(ph, [[0, 0], [0.3, -0.20], [0.5, 0.30], [1, 0]]);
    const strike = kf(ph, [[0, 0], [0.28, -0.60], [0.5, 0.85], [0.78, 0.20], [1, 0]]);
    K.wave *= 0.3; K.idle = 0.2;
    K.ov = (A, j) => A.isFront ? strike * (0.25 + A.w[j] * 0.9) : -0.06 * A.w[j] * Math.abs(strike);
  } else if (act === 'fire') {
    K.siphon = kf(ph, [[0, 0], [0.35, 1.0], [0.62, 1.0], [1, 0]]);
    K.pulse = kf(ph, [[0, 0], [0.4, -0.35], [0.55, 0.95], [0.72, 0.15], [1, 0]]);
    K.bodyZ = kf(ph, [[0, 0], [0.5, 0.03], [0.60, -0.15], [0.82, -0.03], [1, 0]]);
    K.pitch += kf(ph, [[0, 0], [0.5, -0.04], [0.6, 0.10], [1, 0]]);
    K.headPitch += kf(ph, [[0, 0], [0.4, -0.10], [1, 0]]);
    K.wave *= 0.15; K.idle = 0.1; K.cs += 0.06; K.spread += 0.12;
    K.jaw = 0.08;
  } else if (act === 'hit') {
    K.bodyZ = kf(ph, [[0, 0], [0.12, -0.18], [0.38, 0.04], [1, 0]]);
    K.bodyY += kf(ph, [[0, 0], [0.12, 0.05], [0.4, -0.03], [1, 0]]);
    K.roll += kf(ph, [[0, 0], [0.12, 0.20], [0.45, -0.05], [1, 0]]);
    K.pitch += kf(ph, [[0, 0], [0.12, 0.16], [0.5, -0.04], [1, 0]]);
    K.headPitch += kf(ph, [[0, 0], [0.12, -0.32], [0.5, 0.08], [1, 0]]);
    K.lid = kf(ph, [[0, 0], [0.12, 1], [0.6, 0.2], [1, 0]]);
    K.jaw = kf(ph, [[0, 0.05], [0.12, 0.5], [0.5, 0.1], [1, 0.05]]);
    const fl = kf(ph, [[0, 0], [0.12, 0.45], [0.5, -0.1], [1, 0]]);
    K.spread += fl * 0.5; K.ov = (A, j) => -fl * A.w[j] * 0.5;
  } else if (act === 'block') {
    const g = kf(ph, [[0, 0], [0.22, 1], [0.78, 1], [1, 0]]);
    K.bodyY += -0.14 * g; K.bodyZ = -0.12 * g; K.pitch += 0.16 * g;
    K.curl += -0.30 * g; K.headPitch += 0.42 * g; K.jaw = 0.05;
    K.cs += 0.22 * g; K.idle = 0.15;
    K.ov = (A, j) => A.isFront || A.rank === 1 ? g * (j < 4 ? -0.55 + j * 0.30 : 0.55) : g * 0.10 * A.w[j];
  } else if (act === 'gather' || act === 'deposit') {
    const p = act === 'gather' ? ph : 1 - ph;
    K.bodyY += kf(p, [[0, 0], [0.35, -0.16], [0.7, -0.12], [1, 0.02]]);
    K.pitch += kf(p, [[0, 0], [0.35, 0.18], [0.7, 0.12], [1, 0]]);
    K.headPitch += kf(p, [[0, 0], [0.35, 0.50], [0.7, 0.42], [1, 0.05]]);
    K.jaw = kf(p, [[0, 0.05], [0.4, 0.25], [0.6, 0.12], [1, 0.05]]);
    const reach = kf(p, [[0, 0], [0.32, 0.55], [0.55, 0.50], [0.8, -0.28], [1, 0]]);
    const close = kf(p, [[0, 0], [0.45, 0], [0.62, 0.75], [0.85, 0.65], [1, 0]]);
    K.wave *= 0.2; K.idle = 0.2;
    K.ov = (A, j) => A.isFront ? reach * (j < 3 ? 0.45 : 0.1) + close * A.tw[j] * 0.85 : 0.06 * A.w[j] * reach;
  } else if (act === 'eat') {
    K.headPitch += 0.44; K.bodyY += -0.10; K.pitch += 0.14;
    const chew = 0.5 + 0.5 * Math.sin(ph * TAU * 3 - 1.2);
    const env = kf(ph, [[0, 0], [0.15, 1], [0.85, 1], [1, 0]]);
    K.jaw = 0.05 + 0.55 * chew * env;
    K.wave *= 0.2; K.idle = 0.3;
    const feed = env * (0.3 + 0.3 * Math.sin(ph * TAU * 3));
    K.ov = (A, j) => A.isFront ? feed * (j < 3 ? 0.30 : -0.20) : 0;
  } else if (act === 'drink') {
    const g = kf(ph, [[0, 0], [0.25, 1], [0.8, 1], [1, 0]]);
    K.headPitch += 0.52 * g; K.bodyY += -0.13 * g; K.pitch += 0.15 * g;
    K.jaw = 0.05 + 0.09 * g; K.wave *= 0.1; K.idle = 0.15; K.cs += 0.05 * g;
  } else if (act === 'jump') {
    K.bodyY += kf(ph, [[0, 0], [0.35, -0.24], [0.62, 0.34], [1, 0.50]]);
    K.pitch += kf(ph, [[0, 0], [0.35, 0.14], [0.62, -0.16], [1, -0.12]]);
    K.cs = kf(ph, [[0, 1], [0.35, 1.28], [0.65, 0.62], [1, 0.55]]);
    K.spread += kf(ph, [[0, 0], [0.35, -0.06], [0.7, 0.22], [1, 0.18]]);
    K.pulse = kf(ph, [[0, 0], [0.4, -0.2], [0.6, 0.9], [1, 0.2]]);
    K.headPitch += kf(ph, [[0, 0], [0.35, 0.22], [0.7, -0.25], [1, -0.2]]);
    K.jaw = kf(ph, [[0, 0.05], [0.6, 0.4], [1, 0.2]]);
    K.wave = 0; K.idle = 0;
  } else if (act === 'land') {
    K.bodyY += kf(ph, [[0, 0.40], [0.25, 0.06], [0.45, -0.24], [0.75, -0.05], [1, 0]]);
    K.pitch += kf(ph, [[0, 0.10], [0.45, 0.16], [1, 0]]);
    K.cs = kf(ph, [[0, 0.62], [0.28, 0.80], [0.5, 1.30], [0.8, 1.05], [1, 1]]);
    K.spread += kf(ph, [[0, 0.22], [0.5, 0.10], [1, 0]]);
    K.headPitch += kf(ph, [[0, -0.20], [0.45, 0.32], [1, 0]]);
    K.wave = 0; K.idle = 0.2; K.pulse = kf(ph, [[0, 0], [0.5, 0.6], [1, 0]]);
  } else if (act === 'signal') {
    const g = kf(ph, [[0, 0], [0.28, 1], [0.72, 1], [1, 0]]);
    K.bodyY += 0.22 * g; K.pitch += -0.12 * g; K.curl += -0.22 * g;
    K.flare = kf(ph, [[0, 0], [0.3, 0.7], [0.7, 0.7], [1, 0]]);
    K.jaw = 0.05 + 0.7 * g; K.headPitch += -0.30 * g;
    K.pulse = 0.5 * g * Math.sin(t * 6) + 0.3 * g;
    K.spread += 0.55 * g; K.lift = 0.55 * g; K.wave *= 0.2; K.idle = 0.2;
    K.ov = (A, j) => -g * 0.30 * A.w[j];
  } else if (act === 'sleep') {
    K.bodyY += kf(ph, [[0, 0], [0.5, -0.34], [1, -0.42]]);
    K.pitch += kf(ph, [[0, 0], [0.6, 0.12], [1, 0.08]]);
    K.roll += kf(ph, [[0, 0], [1, 0.10]]);
    K.cs = kf(ph, [[0, 1], [0.6, 1.35], [1, 1.50]]);
    K.tipCurl = kf(ph, [[0, 0], [1, 0.35]]);
    K.headPitch += kf(ph, [[0, 0], [1, 0.34]]);
    K.lid = kf(ph, [[0, 0], [0.55, 1], [1, 1]]);
    K.jaw = 0.03; K.wave = 0; K.idle = 0.25;
    K.pulse = 0.12 * Math.sin(t * 0.6);
  } else if (act === 'wake') {
    K.bodyY += kf(ph, [[0, -0.42], [0.3, -0.30], [0.7, -0.05], [1, 0]]);
    K.pitch += kf(ph, [[0, 0.08], [0.5, 0.06], [1, 0]]);
    K.roll += kf(ph, [[0, 0.10], [0.25, 0.14], [1, 0]]);
    K.cs = kf(ph, [[0, 1.50], [0.25, 1.42], [0.7, 1.10], [1, 1]]);
    K.tipCurl = kf(ph, [[0, 0.35], [0.7, 0.08], [1, 0]]);
    K.headPitch += kf(ph, [[0, 0.34], [0.6, 0.10], [1, 0]]);
    K.lid = kf(ph, [[0, 1], [0.4, 0.4], [1, 0]]);
    K.wave = 0; K.idle = 0.4;
  } else if (act === 'die') {
    K.bodyY += kf(ph, [[0, 0], [0.28, 0.06], [0.55, -0.30], [1, -0.46]]);
    K.roll += kf(ph, [[0, 0], [0.5, 0.28], [1, 0.72]]);
    K.pitch += kf(ph, [[0, 0], [0.3, -0.10], [0.6, 0.18], [1, 0.14]]);
    K.headPitch += kf(ph, [[0, 0], [0.5, 0.20], [1, 0.55]]);
    K.headRoll += kf(ph, [[0, 0], [1, -0.35]]);
    K.jaw = kf(ph, [[0, 0.05], [0.3, 0.45], [1, 0.18]]);
    K.lid = kf(ph, [[0, 0], [0.7, 1], [1, 1]]);
    K.cs = kf(ph, [[0, 1], [0.5, 0.90], [1, 0.80]]);
    K.spread += kf(ph, [[0, 0], [1, 0.34]]);
    K.curl += kf(ph, [[0, 0], [1, 0.20]]);
    K.pulse = kf(ph, [[0, 0.2], [0.6, -0.15], [1, -0.25]]);
    K.wave = 0; K.idle = 0;
  } else if (act === 'evolve') {
    const g = kf(ph, [[0, 0], [0.30, 0.20], [0.46, 1], [0.70, 1], [1, 0]]);
    K.flare = g;
    K.bodyY += kf(ph, [[0, 0], [0.3, -0.12], [0.5, 0.06], [0.75, 0.06], [1, 0]]);
    K.pitch += kf(ph, [[0, 0], [0.3, 0.14], [0.55, -0.06], [1, 0]]);
    K.cs = 1 + 0.18 * g; K.spread += 0.20 * g;
    K.pulse = 0.35 * g + 0.10 * g * Math.sin(t * 34);
    K.jaw = 0.05 + 0.45 * g; K.headPitch += -0.18 * g;
    K.roll += 0.02 * g * Math.sin(t * 27);
    K.wave *= 0.2; K.idle = 0.2;
  }

  // ---- hurt overlay
  if (hurt > 0.01) {
    K.roll += 0.14 * hurt;
    K.headPitch += 0.26 * hurt;
    K.headRoll += -0.18 * hurt;
    K.bodyY += -0.06 * hurt;
    K.pulse += 0.20 * hurt * Math.sin(t * 2.6);
    K.lid = Math.max(K.lid, 0.55 * hurt);
    K.wave *= (1 - 0.35 * hurt);
  }

  // ---- write body
  core.position.set(0, K.bodyY, K.bodyZ);
  core.rotation.set(K.pitch, K.yaw, K.roll);

  // mantle stack
  for (let i = 0; i < mantleSegs.length; i++) {
    const M = mantleSegs[i];
    const shape = Math.sin((i + 0.5) / mantleSegs.length * Math.PI);
    M.node.rotation.set(M.rest + K.curl * (0.10 + i * 0.10) + K.pulse * 0.02 * shape, turn * 0.06 * (i + 1) * 0.5, 0);
    const p = 1 + K.pulse * 0.075 * shape;
    M.g.scale.set(p, p, 1 - K.pulse * 0.02 * shape);
    const f = K.flare;
    M.shells[0].rotation.z = -f * 0.26; M.shells[0].position.set(f * 0.035, 0, 0);
    M.shells[1].rotation.z = f * 0.26; M.shells[1].position.set(-f * 0.035, 0, 0);
  }
  // siphon
  siphon.rotation.set(0.5 - K.siphon * 1.15, -0.5 + K.siphon * 0.35, 0.3 - K.siphon * 0.25);

  // head
  head.rotation.set(headRest + K.headPitch, K.headYaw, K.headRoll);
  beakLow.rotation.set(-0.05 - K.jaw * 0.95, 0, 0);
  beakU.rotation.x = -0.45 + K.jaw * 0.18;
  for (let i = 0; i < eyeLids.length; i++) eyeLids[i].o.rotation.set(eyeLids[i].rest - K.lid * 0.62, 0, 0);
  for (let i = 0; i < headPlates.length; i++) headPlates[i].o.rotation.x = headPlates[i].rest - K.flare * 0.20 * (i === 1 ? 1.4 : 1);

  // arms
  for (let i = 0; i < armData.length; i++) {
    const A = armData[i];
    const trailYaw = A.side * (Math.PI - 0.32 - 0.09 * A.rank);
    let phi = (K.cycle + A.off) % 1; if (phi < 0) phi += 1;
    let cs = K.cs;
    if (turn !== 0) cs += (A.side === (turn > 0 ? 1 : -1) ? 0.13 : -0.08) * Math.abs(turn);
    if (hurt > 0.01 && A.side > 0) cs -= 0.16 * hurt;
    const limp = (hurt > 0.01 && i === 5) ? hurt : 0;
    const yawT = lerp(A.yaw, trailYaw, K.jet) + K.reach * Math.cos(TAU * phi) * (1 - K.jet) * (A.isFront ? 1 : 0.7)
      + turn * 0.12 * (A.isFront ? 1 : -0.4) + K.spread * A.side * 0.35;
    A.root.rotation.set(0, yawT, 0);
    for (let j = 0; j < 8; j++) {
      const w = A.w[j];
      let b = lerp(A.rest[j], trailB[j], K.jet) * (cs * (1 - limp) + limp * 0.55);
      b += K.wave * w * Math.sin(TAU * (phi - j * K.lag));
      b += K.idle * 0.035 * w * Math.sin(t * 1.15 - j * 0.62 + i * 0.9);
      b += K.tipCurl * A.tw[j] * 1.2;
      b += -K.lift * w * 0.65;
      b += limp * 0.22 * w;
      if (K.ov) b += K.ov(A, j);
      const y = K.lat * w * Math.sin(TAU * (phi - j * K.lag * 1.35) + 1.1)
        + K.spread * A.side * w * 0.30
        + K.idle * 0.02 * w * Math.sin(t * 0.9 + j * 0.5 + i);
      A.segs[j].rotation.set(b, y, 0);
    }
  }
};

root.userData.update = (t, dt) => { root.userData.pose({ t: t, dt: dt, speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0 }); };

return root;
}