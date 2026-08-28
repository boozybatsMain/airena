"use strict";
function build(THREE, TSL) {
  // ONE QUALITY: SPEED AND FLEX — a heavy pressure-hull bulb dragged by eight long, thin, endlessly articulated arms.
  /* BRIEF ------------------------------------------------------------------
     An armoured octopus. Mass sits BACK and UP: a ribbed pressure-hull mantle
     (1.36 long, 0.93 wide, 0.98 tall) built as six machined hoop-segments with
     gear stacks, chain runs and rams packed between them, clad in overlapping
     pressed shells that leave the ventral machine bare. Forward and BELOW it,
     a short thick collar carries the head: one rigid faceted volume no longer
     than a shoulder width, with two big sideways-bulging eye pods (dark glass
     in stepped bezels, rectangular pupil bars) and four raisable papillae.
     Under the head front sits the arm crown — a lathed ring of eight sockets
     around a hinged parrot beak driven by two rams. Eight arms radiate from it,
     each 2.4 long: eleven machined segments, bearing race + pin + rubber boot at
     every joint, chain runs and rams on the base segments, sucker cups in rows
     along the oral face, a dorsal shell over each segment lapping the next,
     web fins at the bases, micro-grippers on the front pair. The siphon is the
     signature bolt-on: gimballed nozzle with a six-petal iris under the mantle
     lip; the gill rakes are fourteen individual louvre blades.
     Expensive bit: the crown ring — eight identical machined sockets, evenly
     spaced, each with its own race, boot and bolt circle.
  ------------------------------------------------------------------------- */

  const PI = Math.PI, TAU = PI * 2;
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;

  const root = new THREE.Group();
  root.name = 'ArmouredOctopus';
  const P = {};

  // ---------------------------------------------------------------- palette
  const C = {
    shell: '#D8D2C6', shellSh: '#C9C2B4', shellWorn: '#B5AC9C',
    gun: '#55524C', machined: '#6B665E', blued: '#3E3A34', bronze: '#4A4238',
    cable: '#1E1D1B', rust: '#C2521E', lens: '#0A0C0F'
  };

  // ---------------------------------------------------------------- shaders
  const hasNodes = (typeof THREE.MeshStandardNodeMaterial === 'function') && TSL && TSL.positionLocal;
  let surf;
  if (hasNodes) {
    const { vec3, float, positionLocal, normalLocal, sin, abs, mix, smoothstep,
      fract, floor, dot, max, clamp, mul, add, sub } = TSL;
    const CM = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };
    const nz3 = (p) => {
      const i = floor(p), f = fract(p);
      const u = mul(mul(f, f), sub(vec3(3, 3, 3), mul(f, 2)));
      const h = (a, b, c) => fract(mul(sin(dot(add(i, vec3(a, b, c)), vec3(127.1, 311.7, 74.7))), 43758.5453));
      const c000 = h(0, 0, 0), c100 = h(1, 0, 0), c010 = h(0, 1, 0), c110 = h(1, 1, 0);
      const c001 = h(0, 0, 1), c101 = h(1, 0, 1), c011 = h(0, 1, 1), c111 = h(1, 1, 1);
      return mix(mix(mix(c000, c100, u.x), mix(c010, c110, u.x), u.y),
        mix(mix(c001, c101, u.x), mix(c011, c111, u.x), u.y), u.z);
    };
    const fbm = (p) => add(mul(nz3(p), 0.62), mul(nz3(mul(p, 2.31)), 0.38));

    surf = (hex, o) => {
      o = Object.assign({
        extent: 0.30, metal: 0.12, rough: 0.60, wear: 1.0, noise: 9, chip: 0.8,
        side: THREE.FrontSide, chipCol: C.machined, rustCol: '#7E4322',
        grimeCol: '#26241F', dustCol: '#CFC9BC'
      }, o || {});
      const m = new THREE.MeshStandardNodeMaterial();
      m.metalness = o.metal; m.roughness = o.rough; m.side = o.side;
      m.color = new THREE.Color(hex);
      const p = positionLocal, n = normalLocal;
      const rel = mul(p, 1 / o.extent);
      const edge = clamp(max(max(abs(rel.x), abs(rel.y)), abs(rel.z)), 0, 1);
      const nA = fbm(mul(p, o.noise));
      const nB = nz3(mul(p, o.noise * 3.7));
      const streak = fbm(vec3(mul(p.x, o.noise * 2.6), mul(p.y, o.noise * 0.20), mul(p.z, o.noise * 2.6)));
      const downFace = clamp(sub(float(0.66), mul(n.y, 0.78)), 0, 1);
      const chipM = mul(mul(smoothstep(0.56, 1.03, edge), smoothstep(0.47, 0.80, nA)), o.wear);
      const freck = mul(mul(smoothstep(0.75, 0.965, nB), smoothstep(0.18, 0.98, edge)), o.wear);
      const rustM = mul(mul(mul(smoothstep(0.50, 0.87, streak), downFace), add(mul(edge, 0.72), 0.20)), o.wear);
      let col = CM(hex);
      col = mix(col, CM(o.rustCol), mul(rustM, 0.42));
      col = mix(col, CM(o.rustCol), mul(freck, 0.55));
      col = mix(col, CM(o.grimeCol), mul(clamp(mul(n.y, -1), 0, 1), 0.30));
      col = mix(col, CM(o.dustCol), mul(clamp(n.y, 0, 1), mul(0.17, nA)));
      col = mix(col, CM(o.chipCol), mul(chipM, o.chip));
      m.colorNode = col;
      m.roughnessNode = clamp(add(float(o.rough), add(mul(clamp(n.y, 0, 1), 0.14), mul(chipM, -0.13))), 0.24, 1.0);
      return m;
    };
  } else {
    surf = (hex, o) => {
      o = o || {};
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex) });
      m.metalness = o.metal === undefined ? 0.12 : o.metal;
      m.roughness = o.rough === undefined ? 0.6 : o.rough;
      m.side = o.side || THREE.FrontSide;
      return m;
    };
  }

  const DS = THREE.DoubleSide;
  const M = {
    shellA: surf(C.shell, { extent: 0.52, noise: 6, metal: 0.14, rough: 0.58 }),
    shellA2: surf(C.shell, { extent: 0.52, noise: 6, metal: 0.14, rough: 0.58, side: DS }),
    shellB: surf(C.shellSh, { extent: 0.24, noise: 13, metal: 0.13, rough: 0.60 }),
    shellB2: surf(C.shellSh, { extent: 0.24, noise: 13, metal: 0.13, rough: 0.60, side: DS }),
    shellC: surf(C.shellWorn, { extent: 0.12, noise: 24, metal: 0.16, rough: 0.62 }),
    shellC2: surf(C.shellWorn, { extent: 0.12, noise: 24, metal: 0.16, rough: 0.62, side: DS }),
    gun: surf(C.gun, { extent: 0.20, noise: 15, metal: 0.85, rough: 0.55, wear: 0.55 }),
    machined: surf(C.machined, { extent: 0.13, noise: 22, metal: 0.88, rough: 0.45, wear: 0.45 }),
    blued: surf(C.blued, { extent: 0.12, noise: 24, metal: 0.80, rough: 0.66, wear: 0.35 }),
    bronze: surf(C.bronze, { extent: 0.11, noise: 26, metal: 0.86, rough: 0.50, wear: 0.60 }),
    rubber: surf(C.cable, { extent: 0.14, noise: 20, metal: 0.02, rough: 0.93, wear: 0.15 }),
    accent: surf(C.rust, { extent: 0.10, noise: 26, metal: 0.10, rough: 0.60, wear: 1.0 }),
    lens: surf(C.lens, { extent: 0.09, noise: 30, metal: 0.10, rough: 0.08, wear: 0.0 })
  };
  const glow = (hex) => {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.35, metalness: 0.1 });
    m.emissive = new THREE.Color(hex); m.emissiveIntensity = 1.6; return m;
  };
  M.glowA = glow('#B8752A'); M.glowC = glow('#2C7C86');

  // ------------------------------------------------------------- geo cache
  const gcache = new Map();
  const G = (k, fn) => { let g = gcache.get(k); if (!g) { g = fn(); gcache.set(k, g); } return g; };
  const n2 = (v) => Math.round(v * 1000) / 1000;

  const tubeZ = (rt, rb, len, seg, open) => G(`tz|${n2(rt)}|${n2(rb)}|${n2(len)}|${seg}|${!!open}`, () => {
    const g = new THREE.CylinderGeometry(rt, rb, len, seg || 8, 1, !!open);
    g.rotateX(PI / 2); g.translate(0, 0, len / 2); return g;
  });
  const tubeNZ = (rf, rn, len, seg) => G(`tnz|${n2(rf)}|${n2(rn)}|${n2(len)}|${seg}`, () => {
    const g = new THREE.CylinderGeometry(rf, rn, len, seg || 8, 1, false);
    g.rotateX(-PI / 2); g.translate(0, 0, -len / 2); return g;
  });
  const tubeY = (rt, rb, len, seg) => G(`ty|${n2(rt)}|${n2(rb)}|${n2(len)}|${seg}`, () => {
    const g = new THREE.CylinderGeometry(rt, rb, len, seg || 8, 1, false);
    g.translate(0, len / 2, 0); return g;
  });
  const tubeX = (rt, rb, len, seg) => G(`tx|${n2(rt)}|${n2(rb)}|${n2(len)}|${seg}`, () => {
    const g = new THREE.CylinderGeometry(rt, rb, len, seg || 8, 1, false);
    g.rotateZ(-PI / 2); g.translate(len / 2, 0, 0); return g;
  });
  const latheY = (key, pts, seg) => G(`ly|${key}`, () =>
    new THREE.LatheGeometry(pts.map(a => V2(a[0], a[1])), seg || 14));
  const latheZ = (key, pts, seg) => G(`lz|${key}`, () => {
    const g = new THREE.LatheGeometry(pts.map(a => V2(a[0], a[1])), seg || 14);
    g.rotateX(PI / 2); return g;
  });
  const latheX = (key, pts, seg) => G(`lx|${key}`, () => {
    const g = new THREE.LatheGeometry(pts.map(a => V2(a[0], a[1])), seg || 14);
    g.rotateZ(-PI / 2); return g;
  });
  const shapeFrom = (pts) => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i];
      if (q.length === 4) s.quadraticCurveTo(q[0], q[1], q[2], q[3]); else s.lineTo(q[0], q[1]);
    }
    s.closePath(); return s;
  };
  const plate = (key, pts, depth, bev, holes) => G(`pl|${key}`, () => {
    const s = shapeFrom(pts);
    if (holes) for (const h of holes) {
      const hp = new THREE.Path();
      if (h.r !== undefined) hp.absarc(h.x, h.y, h.r, 0, TAU, true);
      else {
        hp.moveTo(h.x - h.w / 2, h.y - h.h / 2); hp.lineTo(h.x - h.w / 2, h.y + h.h / 2);
        hp.lineTo(h.x + h.w / 2, h.y + h.h / 2); hp.lineTo(h.x + h.w / 2, h.y - h.h / 2); hp.closePath();
      }
      s.holes.push(hp);
    }
    const b = bev === undefined ? 0.008 : bev;
    const g = new THREE.ExtrudeGeometry(s, {
      depth: depth, bevelEnabled: true, bevelSize: b, bevelThickness: b * 0.85,
      bevelSegments: 2, curveSegments: 5, steps: 1
    });
    g.translate(0, 0, -depth / 2); return g;
  });
  const plateFlat = (key, pts, depth, bev, holes) => G(`plf|${key}`, () => {
    const g = plate('f' + key, pts, depth, bev, holes).clone(); g.rotateX(-PI / 2); return g;
  });
  const plateSag = (key, pts, depth, bev, holes) => G(`pls|${key}`, () => {
    const g = plate('s' + key, pts, depth, bev, holes).clone(); g.rotateY(-PI / 2); return g;
  });
  // partial shell: axis +Z, radial dir (sin t, -cos t); t=PI is up, t=PI/2 is +X
  const shellZ = (rTip, rBase, len, tStart, tLen) =>
    G(`sh|${n2(rTip)}|${n2(rBase)}|${n2(len)}|${n2(tStart)}|${n2(tLen)}`, () => {
      const g = new THREE.CylinderGeometry(rTip, rBase, len, 16, 1, true, tStart, tLen);
      g.rotateX(PI / 2); g.translate(0, 0, len / 2); return g;
    });
  const dome = (r, phi0, phiL, th0, thL) =>
    G(`dm|${n2(r)}|${n2(phi0)}|${n2(phiL)}|${n2(th0)}|${n2(thL)}`, () =>
      new THREE.SphereGeometry(r, 20, 12, phi0, phiL, th0, thL));
  const torus = (r, t, arc, rs) => G(`to|${n2(r)}|${n2(t)}|${n2(arc)}|${rs || 8}`, () =>
    new THREE.TorusGeometry(r, t, rs || 8, 22, arc === undefined ? TAU : arc));
  const box = (w, h, d) => G(`bx|${n2(w)}|${n2(h)}|${n2(d)}`, () => new THREE.BoxGeometry(w, h, d));

  // ----------------------------------------------------------- node helpers
  const grp = (parent, name, x, y, z) => {
    const g = new THREE.Group(); if (name) g.name = name;
    g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g;
  };
  const mk = (parent, geo, mat, name, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); if (name) m.name = name;
    m.position.set(x || 0, y || 0, z || 0); parent.add(m); return m;
  };
  const boltsZ = (parent, r, count, z, mat, size, a0) => {
    size = size || 0.011; a0 = a0 || 0;
    const g = G(`bz${n2(size)}`, () => { const q = new THREE.CylinderGeometry(size, size * 1.2, size * 1.15, 6); q.rotateX(PI / 2); return q; });
    for (let i = 0; i < count; i++) { const a = a0 + i / count * TAU; mk(parent, g, mat || M.machined, null, Math.sin(a) * r, Math.cos(a) * r, z); }
    return parent;
  };
  const boltsY = (parent, r, count, y, mat, size, a0) => {
    size = size || 0.011; a0 = a0 || 0;
    const g = G(`by${n2(size)}`, () => new THREE.CylinderGeometry(size, size * 1.2, size * 1.15, 6));
    for (let i = 0; i < count; i++) { const a = a0 + i / count * TAU; mk(parent, g, mat || M.machined, null, Math.sin(a) * r, y, Math.cos(a) * r); }
    return parent;
  };
  const boltRow = (parent, a, b, n, mat, size) => {
    size = size || 0.010;
    const g = G(`br${n2(size)}`, () => new THREE.CylinderGeometry(size, size * 1.2, size * 1.2, 6));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      mk(parent, g, mat || M.machined, null, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    }
    return parent;
  };
  const raceZ = (R, w) => latheZ(`race${n2(R)}${n2(w)}`, [
    [R * 0.34, -w], [R * 0.62, -w], [R * 0.66, -w * 0.45], [R * 0.88, -w * 0.45],
    [R * 0.92, -w * 0.9], [R, -w * 0.55], [R, w * 0.55], [R * 0.92, w * 0.9],
    [R * 0.88, w * 0.45], [R * 0.66, w * 0.45], [R * 0.62, w], [R * 0.34, w]
  ], 14);
  const gearZ = (R, w) => latheZ(`gear${n2(R)}${n2(w)}`, [
    [R * 0.2, -w], [R * 0.55, -w], [R * 0.58, -w * 0.5], [R * 0.98, -w * 0.5],
    [R, -w * 0.2], [R, w * 0.2], [R * 0.98, w * 0.5], [R * 0.58, w * 0.5],
    [R * 0.55, w], [R * 0.2, w]
  ], 16);
  const gearStack = (parent, name, R, x, y, z, axis) => {
    const g = grp(parent, name, x, y, z);
    mk(g, gearZ(R, 0.020), M.blued, null);
    mk(g, gearZ(R * 0.66, 0.018), M.machined, null, 0, 0, 0.030);
    mk(g, gearZ(R * 0.40, 0.016), M.bronze, null, 0, 0, 0.054);
    mk(g, tubeZ(R * 0.13, R * 0.13, 0.10, 6), M.machined, null, 0, 0, -0.022);
    boltsZ(g, R * 0.70, 6, -0.021, M.machined, 0.008);
    const th = G(`th${n2(R)}`, () => new THREE.BoxGeometry(R * 0.15, R * 0.22, 0.018));
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      mk(g, th, M.blued, null, Math.sin(a) * R * 1.02, Math.cos(a) * R * 1.02, 0).rotation.z = -a;
    }
    if (axis === 'x') g.rotation.y = PI / 2;
    return g;
  };
  const ram = (parent, name, len, r, x, y, z, rx, ry) => {
    const g = grp(parent, name, x, y, z);
    g.rotation.set(rx || 0, ry || 0, 0);
    mk(g, tubeZ(r, r * 1.1, len * 0.54, 8), M.gun, null);
    mk(g, latheZ(`gl${n2(r)}`, [[r * 0.45, 0], [r * 1.18, 0], [r * 1.18, 0.024], [r * 0.9, 0.032], [r * 0.45, 0.032]], 10), M.machined, null, 0, 0, len * 0.54);
    mk(g, tubeZ(r * 0.40, r * 0.40, len * 0.50, 8), M.machined, null, 0, 0, len * 0.55);
    mk(g, latheZ(`bt${n2(r)}`, [[r * 0.42, 0], [r * 0.85, 0.01], [r * 0.80, 0.03], [r * 0.88, 0.05], [r * 0.42, 0.06]], 10), M.rubber, null, 0, 0, len * 0.56);
    mk(g, box(r * 1.5, r * 0.7, r * 1.1), M.machined, null, 0, 0, len * 1.02);
    mk(g, tubeX(r * 0.26, r * 0.26, r * 2.0, 6), M.blued, null, -r, 0, len * 1.02);
    mk(g, latheZ(`cap${n2(r)}`, [[0, -0.012], [r * 0.9, -0.012], [r * 1.05, 0.004], [r * 0.5, 0.012], [0, 0.012]], 10), M.blued, null, 0, 0, -0.012);
    return g;
  };
  const chainRun = (parent, name, pts, count, w, mat) => {
    const g = grp(parent, name);
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const link = G(`lk${n2(w)}`, () => {
      const q = plate(`lk${n2(w)}`, [
        [-w * 1.5, -w * 0.55], [w * 1.5, -w * 0.55], [w * 1.75, 0], [w * 1.5, w * 0.55],
        [-w * 1.5, w * 0.55], [-w * 1.75, 0]
      ], w * 0.5, w * 0.14, [{ x: -w * 0.85, y: 0, r: w * 0.26 }, { x: w * 0.85, y: 0, r: w * 0.26 }]).clone();
      q.rotateY(-PI / 2); return q;
    });
    const roller = G(`rl${n2(w)}`, () => { const q = new THREE.CylinderGeometry(w * 0.34, w * 0.34, w * 1.1, 7); q.rotateZ(PI / 2); return q; });
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const m = mk(g, link, mat || M.blued, null, p.x, p.y, p.z);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
      m.rotateZ(i % 2 ? 0.0 : PI / 2);
      const p2 = curve.getPointAt(Math.min(0.999, t + 0.5 / count));
      const r = mk(g, roller, M.machined, null, p2.x, p2.y, p2.z);
      r.quaternion.copy(m.quaternion); r.rotateZ(i % 2 ? PI / 2 : 0);
      if (i % 3 === 0) { const c = mk(g, torus(w * 0.95, w * 0.16, TAU, 6), M.gun, null, p.x, p.y, p.z); c.quaternion.copy(m.quaternion); }
    }
    up.set(0, 1, 0);
    return g;
  };
  const port = (parent, x, y, z, r, rx, ry) => {
    const g = grp(parent, null, x, y, z); g.rotation.set(rx || 0, ry || 0, 0);
    mk(g, latheZ(`pt${n2(r)}`, [[r * 0.55, 0], [r * 1.5, 0], [r * 1.5, 0.016], [r * 1.15, 0.020], [r * 1.15, 0.040], [r * 0.55, 0.046]], 10), M.machined, null);
    boltsZ(g, r * 1.2, 4, 0.006, M.blued, 0.007);
    return g;
  };
  const hose = (parent, name, pts, r, mat, clamps) => {
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const g = new THREE.TubeGeometry(curve, Math.max(10, pts.length * 5), r, 6, false);
    const m = mk(parent, g, mat || M.rubber, name);
    const nc = clamps === undefined ? 2 : clamps;
    for (let i = 0; i < nc; i++) {
      const t = (i + 1) / (nc + 1);
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const c = mk(parent, torus(r * 1.5, r * 0.42, TAU, 6), M.machined, null, p.x, p.y, p.z);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
    }
    // both ends land in a collar
    for (const t of [0.001, 0.999]) {
      const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const c = mk(parent, latheZ(`hc${n2(r)}`, [[r * 0.6, 0], [r * 2.0, 0], [r * 2.0, 0.018], [r * 1.3, 0.026], [r * 0.6, 0.03]], 9), M.machined, null, p.x, p.y, p.z);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), t < 0.5 ? tan : tan.clone().negate());
    }
    return m;
  };

  // =========================================================== 1. THE FRAME
  const hull = grp(root, 'Hull', 0, 0.60, 0.02);
  P.hull = hull;

  // ------------------------------------------------------ 1a. MANTLE (torso)
  const MSEG = [
    { len: 0.24, rF: 0.335, rB: 0.420 },
    { len: 0.24, rF: 0.420, rB: 0.462 },
    { len: 0.24, rF: 0.462, rB: 0.455 },
    { len: 0.23, rF: 0.455, rB: 0.400 },
    { len: 0.21, rF: 0.400, rB: 0.300 },
    { len: 0.20, rF: 0.300, rB: 0.140 }
  ];
  const mantleRoot = grp(hull, 'MantleRoot', 0, 0.07, -0.06);
  P.mantle = []; P.mantleSkin = []; P.shellPivots = [];
  let mParent = mantleRoot;
  for (let k = 0; k < MSEG.length; k++) {
    const S = MSEG[k];
    const seg = grp(mParent, 'MantleSeg' + k, 0, 0, k === 0 ? 0 : -MSEG[k - 1].len);
    const skin = grp(seg, 'MantleSkin' + k);
    P.mantle.push(seg); P.mantleSkin.push(skin);

    // (a) stacked machined core + intersecting volumes
    const core = mk(skin, tubeNZ(S.rB * 0.97, S.rF * 0.97, S.len, 10), M.gun, 'mantleCore' + k);
    core.scale.set(1.0, 1.06, 1.0);
    const ridge = mk(skin, plateSag('mrdg' + k, [
      [0.02, S.rF * 0.90], [-S.len - 0.01, S.rB * 0.86], [-S.len - 0.01, S.rB * 1.04], [0.02, S.rF * 1.06]
    ], 0.10, 0.012), M.blued, 'mantleSpineRib' + k, 0, 0, 0);
    mk(skin, tubeNZ(S.rB * 0.62, S.rF * 0.64, S.len, 6), M.blued, 'mantleKeel' + k, 0, -S.rF * 0.62, 0).scale.set(1.5, 0.55, 1);
    for (const sx of [-1, 1]) {
      const ch = mk(skin, tubeNZ(S.rB * 0.44, S.rF * 0.46, S.len * 0.98, 6), M.gun, 'mantleCheek' + (sx < 0 ? 'L' : 'R') + k,
        sx * S.rF * 0.62, -0.02, 0);
      ch.rotation.z = sx * 0.12; ch.scale.set(0.9, 1.25, 1);
    }
    // (b) hoop rib + bolt circle at the joint
    const rib = mk(skin, torus(S.rF * 1.01, 0.024, TAU, 8), M.blued, 'mantleRib' + k, 0, 0, 0);
    rib.scale.set(1, 1.06, 1);
    boltsZ(skin, S.rF * 1.01, 14, 0.012, M.machined, 0.011);
    mk(skin, torus(S.rF * 0.80, 0.014, TAU, 6), M.machined, null, 0, 0, -S.len * 0.55).scale.set(1, 1.06, 1);

    // (c) mechanism packed in the gaps — 5 distinct kinds
    gearStack(skin, 'mantleGearL' + k, 0.088, -S.rF * 0.93, 0.05, -S.len * 0.45, 'x');
    mk(skin, raceZ(0.10, 0.026), M.blued, 'mantleRaceR' + k, S.rF * 0.95, 0.06, -S.len * 0.45).rotation.y = PI / 2;
    mk(skin, tubeX(0.030, 0.030, S.rF * 1.9, 6), M.machined, 'mantleShaft' + k, -S.rF * 0.95, 0.06, -S.len * 0.45);
    ram(skin, 'mantleRamL' + k, S.len * 0.95, 0.028, -S.rF * 0.52, -S.rF * 0.66, 0.0, 0, PI);
    ram(skin, 'mantleRamR' + k, S.len * 0.95, 0.028, S.rF * 0.52, -S.rF * 0.66, 0.0, 0, PI);
    chainRun(skin, 'mantleChain' + k, [
      [0.085, S.rF * 0.95, -0.01], [0.085, (S.rF + S.rB) * 0.5 * 0.99, -S.len * 0.5], [0.085, S.rB * 0.95, -S.len + 0.01]
    ], 5, 0.030, M.blued);
    chainRun(skin, 'mantleChainB' + k, [
      [-0.085, S.rF * 0.95, -0.01], [-0.085, (S.rF + S.rB) * 0.5 * 0.99, -S.len * 0.5], [-0.085, S.rB * 0.95, -S.len + 0.01]
    ], 5, 0.030, M.blued);
    // segment blocks under the shell line
    for (let b = 0; b < 3; b++) {
      const t = (b + 0.5) / 3;
      mk(skin, box(0.075, 0.05, 0.055), M.machined, null, S.rF * 0.86 * Math.sin(2.5), 0, 0).position.set(
        Math.sin(2.35) * (S.rF * 0.90), Math.cos(2.35) * (S.rF * 0.90), -S.len * t);
      mk(skin, box(0.075, 0.05, 0.055), M.machined, null, 0, 0, 0).position.set(
        -Math.sin(2.35) * (S.rF * 0.90), Math.cos(2.35) * (S.rF * 0.90), -S.len * t);
    }
    // (d) shells — dorsal + two flanks, each on an opening pivot
    const rP = S.rF * 1.03 + 0.030, rD = S.rB * 1.03 + 0.052;
    const dPiv = grp(skin, 'MantlePlateTopPiv' + k, 0, 0, 0.01);
    const dsh = mk(dPiv, shellZ(rD, rP, S.len + 0.06, PI - 0.85, 1.70), M.shellA2, 'mantlePlateTop' + k);
    dsh.rotation.y = PI; dsh.position.z = 0.02; dsh.scale.set(1, 1.04, 1);
    mk(dPiv, torus(rD * 0.99, 0.014, 1.70, 6), M.shellB, null, 0, 0, -S.len - 0.04).rotation.set(0, 0, PI - 0.85 + 1.70 / 2 - PI / 2);
    boltRow(dPiv, [-rP * 0.62, rP * 0.72, -0.01], [-rD * 0.62, rD * 0.72, -S.len - 0.02], 4, M.machined, 0.010);
    boltRow(dPiv, [rP * 0.62, rP * 0.72, -0.01], [rD * 0.62, rD * 0.72, -S.len - 0.02], 4, M.machined, 0.010);
    mk(dPiv, plateFlat('mvent' + k, [
      [-0.075, 0.02], [0.075, 0.02], [0.085, -S.len * 0.62], [-0.085, -S.len * 0.62]
    ], 0.016, 0.006, [
      { x: -0.03, y: -S.len * 0.2, w: 0.028, h: 0.055 },
      { x: 0.03, y: -S.len * 0.2, w: 0.028, h: 0.055 }
    ]), M.shellB, 'mantleVent' + k, 0, (rP + rD) * 0.5 * 1.01, -S.len * 0.2);
    P.shellPivots.push({ n: dPiv, ax: 'x', a: 0.42 });
    for (const sx of [-1, 1]) {
      const fPiv = grp(skin, 'MantlePlate' + (sx < 0 ? 'L' : 'R') + 'Piv' + k, sx * rP * 0.55, rP * 0.70, 0);
      const fsh = mk(fPiv, shellZ(rD * 0.99, rP * 0.99, S.len + 0.05, sx > 0 ? (PI / 2 - 0.80) : (-PI / 2 - 0.80), 1.58), M.shellB2, 'mantlePlate' + (sx < 0 ? 'L' : 'R') + k);
      fsh.rotation.y = PI; fsh.position.set(-sx * rP * 0.55, -rP * 0.70, 0.015); fsh.scale.set(1, 1.04, 1);
      const lip = mk(fPiv, torus(rD * 0.99, 0.013, 1.58, 6), M.shellC, null, -sx * rP * 0.55, -rP * 0.70, -S.len - 0.035);
      lip.rotation.z = (sx > 0 ? (PI / 2 - 0.80) : (-PI / 2 - 0.80)) + 1.58 / 2 - PI / 2;
      boltRow(fPiv, [0, 0, 0.0], [-sx * (rD - rP) * 0.55, -(rD - rP) * 0.7, -S.len], 4, M.machined, 0.009);
      P.shellPivots.push({ n: fPiv, ax: 'z', a: -sx * 0.55 });
    }
  }
  const mTail = P.mantle[MSEG.length - 1];
  const tailSkin = P.mantleSkin[MSEG.length - 1];
  // rear cap: three overlapping pressed plates + asymmetric bolt-on module
  const capG = grp(tailSkin, 'MantleCap', 0, 0, -MSEG[5].len);
  mk(capG, latheZ('mcap', [[0, -0.10], [0.055, -0.09], [0.10, -0.05], [0.135, 0.0], [0.145, 0.03], [0.14, 0.05]], 12), M.gun, 'mantleCapCore');
  for (let i = 0; i < 3; i++) {
    const a = PI * 0.5 + i * (TAU / 3);
    const pl = mk(capG, dome(0.150 + i * 0.004, a - 0.62, 1.30, 0.30, 1.15), M.shellB2, 'mantleCapPlate' + i, 0, 0, -0.02 - i * 0.006);
    pl.rotation.x = -PI / 2; pl.scale.set(1, 1.25, 1);
  }
  mk(capG, torus(0.145, 0.016, TAU, 6), M.blued, 'mantleCapRing', 0, 0, -0.012);
  boltsZ(capG, 0.135, 8, -0.02, M.machined, 0.010);
  const mod = grp(capG, 'DorsalModule', -0.10, 0.09, -0.02);
  mod.rotation.set(0.2, 0.3, 0.15);
  mk(mod, plate('modbx', [[-0.055, -0.035], [0.055, -0.045], [0.062, 0.035], [-0.048, 0.042]], 0.07, 0.008), M.shellC, 'moduleShell');
  for (let i = 0; i < 5; i++) mk(mod, box(0.10, 0.006, 0.030), M.blued, null, 0, -0.03 + i * 0.016, 0.045);
  mk(mod, box(0.026, 0.010, 0.006), M.glowA, 'statusPortAmber', 0.03, 0.0, 0.041);
  mk(mod, tubeY(0.006, 0.008, 0.13, 6), M.machined, 'antennaA', -0.03, 0.04, 0.0).rotation.set(0.2, 0, 0.25);
  mk(mod, box(0.014, 0.014, 0.014), M.bronze, null, -0.055, 0.165, 0.03);
  mk(capG, plate('acc1', [[-0.03, -0.016], [0.03, -0.016], [0.034, 0.016], [-0.034, 0.016]], 0.012, 0.004), M.accent, 'mantleTailChip', 0.09, -0.09, -0.03);

  // gill rakes — 7 individual louvre blades each side, on pivots
  P.gills = [];
  const gillBlade = plate('gill', [[-0.012, 0], [0.012, 0], [0.016, 0.13], [0.0, 0.155], [-0.016, 0.13]], 0.010, 0.004);
  for (const sx of [-1, 1]) {
    const rake = grp(mantleRoot, 'GillRake' + (sx < 0 ? 'L' : 'R'), sx * 0.30, -0.10, 0.02);
    rake.rotation.set(0, 0, sx * 0.35);
    mk(rake, plateSag('gbase', [[-0.02, -0.03], [0.20, -0.05], [0.20, 0.03], [-0.02, 0.04]], 0.05, 0.006), M.gun, 'gillBase' + (sx < 0 ? 'L' : 'R'));
    for (let i = 0; i < 7; i++) {
      const piv = grp(rake, 'GillBlade' + (sx < 0 ? 'L' : 'R') + i, 0, 0, 0.02 - i * 0.028);
      const restZ = sx * (0.10 + i * 0.045);
      piv.rotation.z = restZ;
      mk(piv, gillBlade, i % 2 ? M.shellC : M.blued, null, 0, 0, 0);
      mk(piv, torus(0.014, 0.005, TAU, 6), M.machined, null, 0, 0, 0).rotation.y = PI / 2;
      P.gills.push({ n: piv, rest: restZ, sx: sx });
    }
    boltRow(rake, [0.01, -0.03, 0.03], [0.01, -0.03, -0.18], 5, M.machined, 0.008);
  }

  // siphon — gimballed nozzle + six-petal iris
  const siphon = grp(mantleRoot, 'Siphon', 0.11, -0.30, 0.03);
  siphon.rotation.set(0.55, -0.10, 0);
  P.siphon = siphon; P.siphonRest = { x: 0.55, y: -0.10 };
  mk(mantleRoot, latheZ('sbase', [[0.03, -0.02], [0.085, -0.02], [0.095, 0.02], [0.07, 0.05], [0.03, 0.055]], 12), M.gun, 'siphonMount', 0.11, -0.30, 0.0);
  boltsZ(mantleRoot, 0.075, 6, -0.02, M.machined, 0.009);
  mk(siphon, dome(0.055, 0, TAU, 0, PI), M.machined, 'siphonBall').scale.set(1, 0.8, 1);
  mk(siphon, torus(0.062, 0.012, TAU, 7), M.blued, 'siphonGimbal').rotation.x = PI / 2;
  mk(siphon, torus(0.066, 0.010, TAU, 7), M.bronze, 'siphonGimbal2').rotation.y = PI / 2;
  mk(siphon, latheZ('sbody', [[0.020, 0], [0.052, 0.01], [0.050, 0.06], [0.044, 0.10], [0.046, 0.135], [0.040, 0.165], [0.024, 0.175]], 12), M.gun, 'siphonBody');
  mk(siphon, shellZ(0.050, 0.058, 0.11, PI - 1.05, 2.10), M.shellC2, 'siphonShell', 0, 0, 0.03);
  mk(siphon, torus(0.048, 0.008, TAU, 6), M.machined, 'siphonRing1', 0, 0, 0.075);
  boltsZ(siphon, 0.046, 6, 0.076, M.blued, 0.007);
  for (let i = 0; i < 3; i++) mk(siphon, box(0.012, 0.004, 0.030), M.accent, null, 0, 0.050, 0.055 + i * 0.014).rotation.z = 0.5;
  P.iris = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    const piv = grp(siphon, 'SiphonPetal' + i, Math.sin(a) * 0.030, Math.cos(a) * 0.030, 0.172);
    piv.rotation.z = -a; piv.rotation.x = 0.15;
    mk(piv, plate('spet', [[-0.017, 0], [0.017, 0], [0.012, 0.042], [-0.012, 0.042]], 0.006, 0.003), M.blued, null);
    P.iris.push(piv);
  }
  ram(siphon, 'SiphonRamL', 0.13, 0.014, -0.055, 0.02, -0.01, 0, 0.20);
  ram(siphon, 'SiphonRamR', 0.13, 0.014, 0.055, 0.02, -0.01, 0, -0.20);
  port(siphon, 0.0, -0.048, 0.02, 0.017, PI / 2, 0);
  hose(siphon, 'siphonFeed', [[0, -0.052, 0.02], [0.03, -0.075, 0.055], [0.02, -0.062, 0.11], [0, -0.046, 0.125]], 0.011, M.rubber, 1);
  port(mantleRoot, 0.11, -0.245, 0.06, 0.020, -PI / 2, 0);
  hose(mantleRoot, 'siphonTrunk', [[0.11, -0.240, 0.06], [0.15, -0.205, 0.0], [0.16, -0.16, -0.12], [0.19, -0.10, -0.22]], 0.022, M.rubber, 2);
  port(mantleRoot, 0.19, -0.10, -0.225, 0.026, 0.9, 0.3);

  // mantle harness — one run per segment, both ends landing on that segment
  for (let k = 0; k < MSEG.length; k++) {
    const S = MSEG[k], skin = P.mantleSkin[k];
    for (const sx of [-1, 1]) {
      const y0 = S.rF * 0.55, y1 = S.rB * 0.52;
      port(skin, sx * S.rF * 0.86, y0, -0.015, 0.020, 0, 0);
      hose(skin, 'mantleHose' + k + (sx < 0 ? 'L' : 'R'), [
        [sx * S.rF * 0.86, y0, -0.02], [sx * S.rF * 1.02, y0 * 0.9, -S.len * 0.35],
        [sx * S.rF * 1.02, y1 * 0.86, -S.len * 0.7], [sx * S.rB * 0.86, y1, -S.len + 0.015]
      ], 0.021, M.rubber, 2);
      port(skin, sx * S.rB * 0.86, y1, -S.len + 0.02, 0.020, 0, PI);
      hose(skin, 'mantleWire' + k + (sx < 0 ? 'L' : 'R'), [
        [sx * S.rF * 0.72, y0 * 1.15, -0.02], [sx * S.rF * 0.86, y0 * 1.16, -S.len * 0.5],
        [sx * S.rB * 0.72, y1 * 1.18, -S.len + 0.015]
      ], 0.008, M.rubber, 1);
    }
  }
  // stencil markings (paint, few)
  mk(P.mantleSkin[2], plateFlat('stri', [[-0.05, -0.045], [0.05, -0.045], [0, 0.05]], 0.005, 0.003,
    [{ x: 0, y: -0.012, w: 0.036, h: 0.026 }]), M.shellC, 'mantleStencil', 0.0, MSEG[2].rF + 0.062, -0.11);
  mk(P.mantleSkin[3], plate('sbar', [[-0.055, -0.010], [0.055, -0.010], [0.055, 0.012], [-0.055, 0.012]], 0.004, 0.002), M.blued, 'mantleSerial',
    0.20, MSEG[3].rF * 0.62, -0.10).rotation.set(0, 0.4, 0);

  // ==================================================== 2. THE LEADING END
  const head = grp(hull, 'Head', 0, 0.0, 0.05);
  P.head = head;
  mk(head, latheZ('ncol', [[0.13, -0.05], [0.26, -0.05], [0.275, 0.0], [0.26, 0.045], [0.20, 0.07], [0.13, 0.075]], 16), M.gun, 'neckCollar');
  mk(head, torus(0.245, 0.030, TAU, 8), M.blued, 'collarRace', 0, 0, 0.01).scale.set(1.05, 0.85, 1);
  boltsZ(head, 0.235, 12, 0.045, M.machined, 0.011);
  mk(head, plateFlat('nuch', [[-0.16, -0.04], [0.16, -0.04], [0.13, 0.13], [-0.13, 0.13]], 0.026, 0.008,
    [{ x: 0, y: 0.05, w: 0.10, h: 0.035 }]), M.shellB, 'nuchalPlate', 0, 0.16, 0.06);
  // cranial mass — several intersecting volumes
  const hf = mk(head, tubeZ(0.19, 0.255, 0.40, 8), M.gun, 'headFrame', 0, -0.01, 0.03);
  hf.scale.set(1.28, 0.88, 1);
  mk(head, plateFlat('htop', [
    [-0.20, -0.02], [0.20, -0.02], [0.215, 0.16], [0.15, 0.33], [0, 0.375], [-0.15, 0.33], [-0.215, 0.16]
  ], 0.045, 0.010, [{ x: 0, y: 0.13, w: 0.10, h: 0.05 }]), M.gun, 'headTopPlate', 0, 0.115, 0.04);
  mk(head, plateFlat('hund', [[-0.15, 0], [0.15, 0], [0.13, 0.30], [0, 0.34], [-0.13, 0.30]], 0.05, 0.010), M.gun, 'headUnderPlate', 0, -0.155, 0.05);
  for (const sx of [-1, 1]) {
    const ck = mk(head, tubeZ(0.10, 0.145, 0.34, 6), M.gun, 'headCheek' + (sx < 0 ? 'L' : 'R'), sx * 0.175, -0.005, 0.05);
    ck.rotation.y = -sx * 0.20; ck.scale.set(0.85, 1.15, 1);
    mk(head, plate('jowl' + (sx < 0 ? 'L' : 'R'), [
      [-0.13, -0.10], [0.14, -0.075], [0.16, 0.06], [-0.10, 0.09]
    ], 0.035, 0.010), M.shellB, 'jowl' + (sx < 0 ? 'L' : 'R'), sx * 0.245, -0.09, 0.24).rotation.set(0.1, -sx * 1.30, 0);
  }
  // dorsal crown shells (the surface the camera actually sees)
  const cA = mk(head, dome(0.255, PI * 0.5 - 0.95, 1.90, 0.05, 1.05), M.shellA2, 'crownShellA', 0, 0.055, 0.10);
  cA.rotation.set(-0.10, PI / 2, 0); cA.scale.set(1.12, 0.72, 1.0);
  const cB = mk(head, dome(0.222, PI * 0.5 - 0.85, 1.70, 0.10, 1.00), M.shellB2, 'crownShellB', 0, 0.075, 0.275);
  cB.rotation.set(0.22, PI / 2, 0); cB.scale.set(1.10, 0.66, 0.95);
  const cC = mk(head, shellZ(0.20, 0.235, 0.16, PI - 0.95, 1.90), M.shellC2, 'crownShellC', 0, 0.02, -0.02);
  cC.scale.set(1.15, 0.80, 1);
  mk(head, torus(0.222, 0.013, 1.70, 6), M.shellC, 'crownLip', 0, 0.075, 0.395).rotation.set(0, 0, 0.0);
  boltRow(head, [-0.16, 0.215, 0.06], [-0.115, 0.185, 0.30], 4, M.machined, 0.010);
  boltRow(head, [0.16, 0.215, 0.06], [0.115, 0.185, 0.30], 4, M.machined, 0.010);
  mk(head, plateFlat('hridge', [[-0.028, -0.10], [0.028, -0.10], [0.022, 0.26], [-0.022, 0.26]], 0.028, 0.007), M.shellC, 'crownRib', 0, 0.235, 0.14);
  mk(head, plateFlat('hvent', [[-0.06, -0.05], [0.06, -0.05], [0.055, 0.05], [-0.055, 0.05]], 0.014, 0.005,
    [{ x: 0, y: -0.02, w: 0.075, h: 0.012 }, { x: 0, y: 0.005, w: 0.075, h: 0.012 }, { x: 0, y: 0.03, w: 0.075, h: 0.012 }]),
    M.shellB, 'headVentPlate', -0.10, 0.225, 0.22).rotation.z = 0.15;
  const sensPod = grp(head, 'SensorPodTop', 0.115, 0.215, 0.20);
  sensPod.rotation.set(-0.2, 0.2, -0.15);
  mk(sensPod, latheY('spod', [[0, 0], [0.030, 0.004], [0.034, 0.022], [0.026, 0.036], [0.012, 0.040]], 10), M.machined, 'sensorPodShell');
  mk(sensPod, box(0.010, 0.006, 0.010), M.glowC, 'statusPortCyan', 0, 0.040, 0.006);
  boltsY(sensPod, 0.026, 5, 0.006, M.blued, 0.007);
  mk(head, tubeY(0.005, 0.007, 0.115, 6), M.machined, 'antennaB', -0.145, 0.19, 0.10).rotation.set(-0.25, 0, -0.30);
  mk(head, box(0.012, 0.012, 0.012), M.bronze, null, -0.175, 0.30, 0.075);
  // brow over the optics
  mk(head, plate('brow', [
    [-0.30, -0.030], [-0.16, 0.010], [0, 0.055], [0.16, 0.010], [0.30, -0.030],
    [0.28, -0.075], [0, -0.030], [-0.28, -0.075]
  ], 0.055, 0.010), M.shellA, 'headBrow', 0, 0.105, 0.235).rotation.x = 0.28;
  boltRow(head, [-0.26, 0.115, 0.262], [0.26, 0.115, 0.262], 7, M.machined, 0.009);
  // head-side machinery in the gaps
  gearStack(head, 'headGearL', 0.060, -0.235, 0.045, 0.055, 'x');
  gearStack(head, 'headGearR', 0.060, 0.235, 0.045, 0.055, 'x');
  mk(head, raceZ(0.075, 0.022), M.blued, 'headRaceL', -0.245, -0.055, 0.14).rotation.y = PI / 2;
  mk(head, raceZ(0.075, 0.022), M.blued, 'headRaceR', 0.245, -0.055, 0.14).rotation.y = PI / 2;
  chainRun(head, 'headChainRun', [[-0.14, -0.16, 0.02], [0, -0.185, 0.13], [0.14, -0.16, 0.02]], 7, 0.026, M.blued);
  ram(head, 'headRamL', 0.20, 0.022, -0.16, -0.135, 0.03, -0.35, 0.25);
  ram(head, 'headRamR', 0.20, 0.022, 0.16, -0.135, 0.03, -0.35, -0.25);
  // head half of the neck harness — ends in a boot at the collar
  port(head, -0.10, 0.175, 0.09, 0.020, -0.4, 0);
  hose(head, 'neckHoseL', [[-0.10, 0.175, 0.09], [-0.16, 0.20, 0.02], [-0.17, 0.12, -0.03], [-0.14, 0.05, -0.045]], 0.021, M.rubber, 1);
  port(head, 0.10, 0.175, 0.09, 0.020, -0.4, 0);
  hose(head, 'neckHoseR', [[0.10, 0.175, 0.09], [0.16, 0.20, 0.02], [0.17, 0.12, -0.03], [0.14, 0.05, -0.045]], 0.021, M.rubber, 1);
  // mantle half — meets it inside a boot collar on MantleSeg0
  mk(P.mantleSkin[0], latheZ('boot', [[0.03, 0], [0.055, 0.005], [0.050, 0.03], [0.058, 0.055], [0.030, 0.062]], 10), M.rubber, 'neckBootL', -0.14, -0.02, 0.04);
  mk(P.mantleSkin[0], latheZ('boot', [[0.03, 0], [0.055, 0.005], [0.050, 0.03], [0.058, 0.055], [0.030, 0.062]], 10), M.rubber, 'neckBootR', 0.14, -0.02, 0.04);
  hose(P.mantleSkin[0], 'neckHoseBackL', [[-0.14, -0.02, 0.03], [-0.20, 0.06, -0.02], [-0.24, 0.14, -0.10], [-0.22, 0.20, -0.19]], 0.021, M.rubber, 1);
  hose(P.mantleSkin[0], 'neckHoseBackR', [[0.14, -0.02, 0.03], [0.20, 0.06, -0.02], [0.24, 0.14, -0.10], [0.22, 0.20, -0.19]], 0.021, M.rubber, 1);
  port(P.mantleSkin[0], -0.22, 0.20, -0.195, 0.022, 0.5, -0.3);
  port(P.mantleSkin[0], 0.22, 0.20, -0.195, 0.022, 0.5, 0.3);

  // ---- eye pods (dark recessed glass, machined bezels)
  P.eyeLids = [];
  for (const sx of [-1, 1]) {
    const L = sx < 0 ? 'L' : 'R';
    const eye = grp(head, 'EyePod' + L, sx * 0.255, 0.045, 0.215);
    eye.rotation.set(0, sx * 0.32, 0);
    mk(eye, latheX(`emnt${sx}`, [[0.045, 0], [0.098, 0.005], [0.105, 0.028], [0.100, 0.050], [0.088, 0.062]], 16), M.gun, 'eyeMount' + L)
      .scale.set(sx, 1, 1);
    mk(eye, latheX(`ebz${sx}`, [[0.058, 0.055], [0.100, 0.058], [0.104, 0.072], [0.092, 0.082], [0.070, 0.086], [0.058, 0.082]], 18), M.machined, 'eyeBezel' + L)
      .scale.set(sx, 1, 1);
    mk(eye, torus(0.089, 0.010, TAU, 7), M.blued, 'eyeBezelRing' + L, sx * 0.070, 0, 0).rotation.y = PI / 2;
    boltsY(eye, 0.086, 8, 0, M.machined, 0.008);
    const lens = mk(eye, dome(0.070, 0, TAU, 0, PI * 0.62), M.lens, 'eyeLens' + L, sx * 0.052, 0, 0);
    lens.rotation.z = -sx * PI / 2; lens.scale.set(1, 1, 0.82);
    mk(eye, plate('pup', [[-0.048, -0.011], [0.048, -0.011], [0.052, 0.008], [-0.052, 0.008]], 0.010, 0.004), M.lens, 'eyePupil' + L,
      sx * 0.086, 0.002, 0).rotation.y = PI / 2;
    const lid = grp(eye, 'EyeLid' + L, 0, 0.030, 0);
    mk(lid, shellZ(0.098, 0.090, 0.10, PI - 0.95, 1.90), M.shellB2, 'eyeHood' + L, sx * 0.02, 0, -0.05).rotation.y = PI / 2 * sx;
    mk(lid, torus(0.094, 0.011, 1.5, 6), M.shellC, 'eyeHoodLip' + L, sx * 0.072, -0.012, 0).rotation.set(0, PI / 2, 0.3);
    P.eyeLids.push({ n: lid, sx: sx });
    mk(eye, plate('elow', [[-0.055, -0.020], [0.055, -0.026], [0.050, 0.012], [-0.050, 0.016]], 0.018, 0.006), M.shellC, 'eyeLower' + L,
      sx * 0.062, -0.072, 0).rotation.set(0.25, sx * PI / 2, 0);
    mk(eye, box(0.024, 0.020, 0.030), M.machined, 'eyeSensor' + L, sx * 0.055, 0.055, 0.055).rotation.y = sx * 0.4;
    mk(eye, tubeX(0.008, 0.008, 0.045 * (sx > 0 ? 1 : -1) + (sx > 0 ? 0 : 0), 6), M.blued, 'eyeStub' + L, sx * 0.055, -0.05, -0.045);
    port(eye, sx * 0.02, -0.05, -0.075, 0.014, 0, 0);
    hose(eye, 'eyeHose' + L, [[sx * 0.02, -0.05, -0.075], [sx * 0.06, -0.085, -0.05], [sx * 0.055, -0.075, 0.0], [sx * 0.03, -0.055, 0.02]], 0.009, M.rubber, 1);
    // papillae above the eye
    for (let i = 0; i < 2; i++) {
      const piv = grp(head, 'Papilla' + L + i, sx * (0.175 + i * 0.055), 0.185, 0.20 - i * 0.075);
      piv.rotation.set(-0.45, 0, sx * (0.30 + i * 0.12));
      mk(piv, tubeY(0.008, 0.026, 0.075 - i * 0.014, 6), M.machined, null);
      mk(piv, latheY('ptip', [[0.014, 0], [0.020, 0.010], [0.010, 0.028], [0, 0.036]], 8), M.blued, null, 0, 0.070 - i * 0.014, 0);
      mk(piv, torus(0.022, 0.006, TAU, 6), M.bronze, null, 0, 0.012, 0);
      P.eyeLids.push({ pap: piv, rest: piv.rotation.x });
    }
  }
  P.paps = P.eyeLids.filter(o => o.pap);
  P.lids = P.eyeLids.filter(o => o.n);

  // ---- arm crown + beak (the mechanism this animal is known for)
  const crown = grp(head, 'ArmCrown', 0, -0.20, 0.30);
  mk(crown, latheY('crown', [[0.10, -0.02], [0.20, -0.05], [0.275, -0.035], [0.295, 0.01], [0.275, 0.055], [0.20, 0.075], [0.12, 0.06]], 20), M.gun, 'crownRing');
  mk(crown, torus(0.278, 0.024, TAU, 8), M.blued, 'crownRace', 0, 0.01, 0);
  boltsY(crown, 0.245, 16, 0.062, M.machined, 0.010);
  mk(crown, latheY('cinner', [[0.0, 0.02], [0.09, 0.01], [0.11, -0.03], [0.10, -0.07], [0, -0.075]], 14), M.blued, 'crownFloor');
  const beakG = grp(crown, 'BeakAssembly', 0, -0.045, 0.045);
  mk(beakG, box(0.10, 0.055, 0.075), M.gun, 'beakHousing');
  mk(beakG, tubeX(0.014, 0.014, 0.13, 6), M.machined, 'beakHinge', -0.065, 0, 0);
  const beakU = grp(beakG, 'BeakUpper', 0, 0.005, 0.01);
  mk(beakU, plateSag('bku', [[-0.02, 0.02], [0.075, 0.0], [0.098, -0.055], [0.058, -0.045], [0.02, -0.02], [-0.03, -0.01]], 0.075, 0.007), M.blued, 'beakUpperPlate');
  mk(beakU, plateSag('bku2', [[-0.02, 0.02], [0.06, 0.005], [0.07, -0.03], [-0.01, -0.005]], 0.088, 0.006), M.machined, 'beakUpperCap', 0, 0.008, 0);
  const beakL = grp(beakG, 'BeakLower', 0, -0.008, 0.01);
  mk(beakL, plateSag('bkl', [[-0.02, -0.02], [0.070, -0.005], [0.088, 0.040], [0.050, 0.032], [0.015, 0.012], [-0.03, 0.005]], 0.068, 0.007), M.blued, 'beakLowerPlate');
  mk(beakL, box(0.055, 0.016, 0.030), M.bronze, 'radulaBlock', 0, -0.018, 0.02);
  ram(beakG, 'BeakRamL', 0.09, 0.014, -0.055, 0.045, -0.03, 1.10, 0);
  ram(beakG, 'BeakRamR', 0.09, 0.014, 0.055, 0.045, -0.03, 1.10, 0);
  P.beakU = beakU; P.beakL = beakL;
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + 0.4;
    mk(crown, plate('mir', [[-0.022, 0], [0.022, 0], [0.014, 0.045], [-0.014, 0.045]], 0.008, 0.003), M.machined, 'mouthIris' + i,
      Math.sin(a) * 0.10, -0.02, Math.cos(a) * 0.10).rotation.set(1.2, -a, 0);
  }

  // ======================================================= 3./4. THE ARMS
  const NSEG = 11;
  const ARM_L = [0.335, 0.310, 0.280, 0.250, 0.225, 0.200, 0.180, 0.155, 0.135, 0.115, 0.095];
  const ARM_R = []; for (let j = 0; j <= NSEG; j++) ARM_R.push(0.100 * Math.pow(0.855, j));
  const ARM_AZ = [16, -16, 56, -56, 102, -102, 150, -150].map(d => d * PI / 180);
  const REST_P = [0.38, 0.52, 0.34, 0.06, 0.00, -0.01, -0.03, -0.06, -0.10, -0.20, -0.34];
  const STREAM_P = [0.34, 0.30, 0.10, 0.00, -0.02, -0.03, -0.04, -0.05, -0.06, -0.08, -0.10];
  const ARCH = [0, -0.30, -0.55, -0.60, -0.40, -0.10, 0.10, 0.16, 0.14, 0.08, 0.02];
  const TIPC = [0, 0, -0.05, -0.14, -0.28, -0.46, -0.68, -0.95, -1.25, -1.58, -1.92];
  const LIFTP = [0, -0.25, -0.42, -0.42, -0.30, -0.18, -0.10, -0.06, -0.04, -0.02, 0];
  const LATP = [0, 0.16, 0.30, 0.42, 0.50, 0.55, 0.58, 0.60, 0.60, 0.60, 0.60];
  const PHASE = [0.0, 0.5, 0.28, 0.78, 0.62, 0.12, 0.86, 0.36];

  const suckerGeo = (r) => G(`suk${n2(r)}`, () => {
    const g = new THREE.LatheGeometry([
      [0.0, 0], [r * 0.55, 0.004], [r * 0.86, 0.020], [r * 1.0, 0.040],
      [r * 0.90, 0.048], [r * 0.62, 0.030], [r * 0.55, 0.012]
    ].map(a => V2(a[0], a[1])), 10);
    g.rotateX(PI); return g;
  });

  P.arms = [];
  for (let i = 0; i < 8; i++) {
    const az = ARM_AZ[i], sgn = az < 0 ? -1 : 1;
    const socket = grp(crown, 'ArmSocket' + i, Math.sin(az) * 0.255, -0.020, Math.cos(az) * 0.255);
    socket.rotation.y = az;
    // socket hardware
    mk(socket, latheZ('sock', [[0.055, -0.02], [0.125, -0.025], [0.135, 0.01], [0.120, 0.045], [0.075, 0.055]], 14), M.gun, 'armSocket' + i);
    mk(socket, raceZ(0.125, 0.024), M.blued, 'armSocketRace' + i, 0, 0, 0.02);
    boltsZ(socket, 0.108, 8, -0.022, M.machined, 0.009);
    mk(socket, latheZ('sboot', [[0.085, 0], [0.115, 0.012], [0.108, 0.035], [0.118, 0.055], [0.088, 0.068]], 12), M.rubber, 'armBoot' + i, 0, 0, 0.03);
    gearStack(socket, 'armGear' + i, 0.048, 0.10, 0.07, 0.02, 'x');

    const armRoot = grp(socket, 'Arm' + i, 0, 0, 0.06);
    const segs = [];
    let prev = armRoot;
    for (let j = 0; j < NSEG; j++) {
      const L = ARM_L[j], r0 = ARM_R[j], r1 = ARM_R[j + 1];
      const seg = grp(prev, 'arm' + i + '_seg' + j, 0, 0, j === 0 ? 0 : ARM_L[j - 1]);
      segs.push(seg);
      // joint hardware
      mk(seg, raceZ(r0 * 1.30, r0 * 0.34), M.blued, null);
      mk(seg, tubeX(r0 * 0.20, r0 * 0.20, r0 * 2.9, 6), M.machined, null, -r0 * 1.45, 0, 0);
      mk(seg, latheZ(`ab${n2(r0)}`, [[r0 * 0.75, 0], [r0 * 1.10, 0.012], [r0 * 1.02, r0 * 0.35], [r0 * 1.12, r0 * 0.6], [r0 * 0.80, r0 * 0.7]], 10), M.rubber, null, 0, 0, r0 * 0.35);
      // core segment block
      mk(seg, tubeZ(r1 * 0.98, r0 * 0.94, L * 1.14, 8), M.gun, 'arm' + i + '_core' + j);
      mk(seg, plateSag(`akl${j}`, [[0.02, -r0 * 0.5], [L * 0.9, -r1 * 0.5], [L * 0.9, r1 * 0.5], [0.02, r0 * 0.5]], r0 * 0.5, 0.006), M.machined, null, 0, -r0 * 0.75, 0);
      mk(seg, torus(r0 * 1.05, r0 * 0.14, TAU, 6), M.machined, null, 0, 0, L * 0.55);
      // dorsal shell, lapping over the next segment
      if (j < 9) {
        const rp = r0 * 1.32 + 0.012, rd = r1 * 1.40 + 0.016;
        mk(seg, shellZ(rd, rp, L * 1.03, PI - 0.95, 1.90), M.shellB2, 'arm' + i + '_plate' + j, 0, 0, 0.012);
        if (j < 5) mk(seg, torus(rd * 0.99, r0 * 0.13, 1.90, 6), M.shellC, null, 0, 0, L * 1.02).rotation.z = PI - 0.95 + 0.95 - PI / 2;
        mk(seg, plate(`arib${j}`, [[-r0 * 0.22, -L * 0.30], [r0 * 0.22, -L * 0.30], [r0 * 0.17, L * 0.30], [-r0 * 0.17, L * 0.30]], r0 * 0.22, 0.005),
          M.shellC, null, 0, rp * 0.96, L * 0.48).rotation.x = PI / 2;
        boltRow(seg, [-rp * 0.72, rp * 0.66, 0.03], [-rd * 0.72, rd * 0.66, L * 0.9], 3, M.machined, 0.008);
        boltRow(seg, [rp * 0.72, rp * 0.66, 0.03], [rd * 0.72, rd * 0.66, L * 0.9], 3, M.machined, 0.008);
      }
      // suckers on the oral face
      const nS = j < 6 ? 2 : (j < 9 ? 1 : 0);
      for (let s = 0; s < nS; s++) {
        for (const sx of (j < 6 ? [-1, 1] : [0])) {
          const rr = r0 * 0.44;
          const zz = L * (0.28 + s * 0.44);
          mk(seg, suckerGeo(rr), M.blued, null, sx * r0 * 0.42, -r0 * 0.86, zz);
          mk(seg, torus(rr * 0.72, rr * 0.16, TAU, 6), M.machined, null, sx * r0 * 0.42, -r0 * 0.80, zz).rotation.x = PI / 2;
        }
      }
      // rams + chain on the base segments
      if (j < 2) {
        ram(seg, 'arm' + i + '_ram' + j, L * 0.92, r0 * 0.22, -r0 * 0.95, r0 * 0.30, 0.02, 0, 0);
        ram(seg, 'arm' + i + '_ramB' + j, L * 0.92, r0 * 0.22, r0 * 0.95, r0 * 0.30, 0.02, 0, 0);
      }
      if (j < 3) {
        chainRun(seg, 'arm' + i + '_chain' + j, [
          [0, r0 * 1.02, 0.01], [0, (r0 + r1) * 0.52, L * 0.5], [0, r1 * 1.02, L * 0.96]
        ], 4, r0 * 0.30, M.blued);
      }
      if (j === 0) {
        // web fins + one service loop that begins and ends on this segment
        for (const sx of [-1, 1]) {
          mk(seg, plate('web', [[0, -0.02], [0.09, 0.02], [0.10, 0.16], [0.0, 0.20], [-0.02, 0.08]], 0.012, 0.005),
            M.shellC, 'arm' + i + '_web' + (sx < 0 ? 'L' : 'R'), sx * r0 * 0.85, -r0 * 0.25, 0.06).rotation.set(0.1, sx * 1.35, sx * 0.4);
        }
        port(seg, -r0 * 0.55, r0 * 0.95, 0.03, 0.014, -0.5, 0);
        hose(seg, 'arm' + i + '_hose', [
          [-r0 * 0.55, r0 * 0.95, 0.03], [-r0 * 1.5, r0 * 1.15, L * 0.35],
          [r0 * 1.4, r0 * 1.15, L * 0.6], [r0 * 0.55, r0 * 0.95, L * 0.90]
        ], 0.013, M.rubber, 2);
        port(seg, r0 * 0.55, r0 * 0.95, L * 0.92, 0.014, -0.5, PI);
        hose(seg, 'arm' + i + '_wire', [
          [-r0 * 0.3, r0 * 1.0, 0.03], [-r0 * 0.4, r0 * 1.25, L * 0.5], [-r0 * 0.2, r0 * 1.0, L * 0.9]
        ], 0.006, M.rubber, 1);
      }
      prev = seg;
    }
    // arm tip: two extra links and a hooked claw
    const tipA = grp(prev, 'arm' + i + '_tipA', 0, 0, ARM_L[NSEG - 1]);
    mk(tipA, raceZ(ARM_R[NSEG] * 1.3, ARM_R[NSEG] * 0.35), M.blued, null);
    mk(tipA, tubeZ(ARM_R[NSEG] * 0.72, ARM_R[NSEG] * 0.98, 0.075, 7), M.machined, 'arm' + i + '_tipCore');
    const tipB = grp(tipA, 'arm' + i + '_tipB', 0, 0, 0.070);
    mk(tipB, tubeZ(ARM_R[NSEG] * 0.42, ARM_R[NSEG] * 0.72, 0.055, 6), M.blued, 'arm' + i + '_tipLink');
    mk(tipB, plateSag('claw', [[0, -0.008], [0.045, -0.012], [0.062, 0.004], [0.030, 0.006], [0, 0.010]], 0.012, 0.004), M.machined, 'arm' + i + '_claw', 0, 0, 0.05).rotation.x = -0.4;
    P.armTips = P.armTips || [];

    // micro-grippers on the front pair
    const grips = [];
    if (i < 2) {
      for (let f = 0; f < 3; f++) {
        const a = (f - 1) * 1.15;
        const fRoot = grp(tipB, 'arm' + i + '_finger' + f, Math.sin(a) * 0.014, Math.cos(a) * 0.014 - 0.008, 0.045);
        fRoot.rotation.z = -a;
        let fp = fRoot;
        for (let l = 0; l < 3; l++) {
          const lk = grp(fp, 'arm' + i + '_finger' + f + '_l' + l, 0, 0, l === 0 ? 0 : 0.026);
          mk(lk, tubeZ(0.0075, 0.010, 0.028, 6), M.machined, null);
          mk(lk, torus(0.010, 0.004, TAU, 6), M.blued, null, 0, 0, 0.001).rotation.y = PI / 2;
          fp = lk;
        }
        mk(fp, plateSag('ftip', [[0, -0.006], [0.022, -0.008], [0.030, 0.002], [0, 0.007]], 0.008, 0.003), M.blued, 'arm' + i + '_fingerTip' + f, 0, 0, 0.024);
        grips.push(fRoot);
      }
      mk(tipB, box(0.030, 0.020, 0.024), M.gun, 'arm' + i + '_gripHousing', 0, 0, 0.030);
    }
    P.arms.push({ root: armRoot, segs: segs, az: az, sgn: sgn, tipA: tipA, tipB: tipB, grips: grips });
  }

  // ============================================================= 7. GREEBLES
  for (let k = 0; k < MSEG.length; k++) {
    const S = MSEG[k], skin = P.mantleSkin[k];
    for (let i = 0; i < 3; i++) {
      const a = 0.9 + i * 1.7;
      mk(skin, box(0.036, 0.026, 0.030), M.machined, null,
        Math.sin(a) * S.rF * 0.99, Math.cos(a) * S.rF * 0.99, -S.len * (0.25 + i * 0.22));
      mk(skin, box(0.018, 0.010, 0.018), M.bronze, null,
        Math.sin(a + 0.5) * S.rF * 1.0, Math.cos(a + 0.5) * S.rF * 1.0, -S.len * (0.3 + i * 0.2));
    }
    boltsZ(skin, S.rB * 0.99, 10, -S.len + 0.014, M.machined, 0.009, 0.2);
  }
  mk(hull, box(0.05, 0.03, 0.05), M.machined, 'grabHandleBase', 0.0, 0.30, -0.30);
  mk(hull, torus(0.045, 0.010, PI, 7), M.blued, 'grabHandle', 0.0, 0.315, -0.30).rotation.set(0, PI / 2, 0);

  // ================================================================== POSE
  const sm = (a, b, x) => { const u = clamp01((b - a) === 0 ? 0 : (x - a) / (b - a)); return u * u * (3 - 2 * u); };
  const keyw = (a, b, c, d) => (x) => sm(a, b, x) * (1 - sm(c, d, x));
  const frac = (x) => x - Math.floor(x);

  root.userData.pose = (s) => {
    s = s || {};
    const sp = Math.max(0, s.speed || 0);
    const stride = s.stride || 0;
    const turn = Math.max(-1, Math.min(1, s.turn || 0));
    const grounded = s.grounded !== false;
    const health = (s.health === undefined) ? 1 : s.health;
    const act = s.action || null;
    const ph = clamp01(s.phase || 0);
    const t = s.t || 0;

    // ---- drivers, written whole every call
    let hY = 0, hZ = 0, hX = 0, hP = 0, hR = 0, hYaw = 0;
    let mBend = 0, mYaw = 0, mBreath = 0;
    let hdP = 0, hdY = 0, hdR = 0, idleK = 1;
    let beak = 0.10, gill = 0.15, pap = 0.30, iris = 0.28, sipP = 0, sipY = 0, open = 0, lidK = 0;
    const A = [];
    for (let i = 0; i < 8; i++) A.push({ yaw: 0, pitch: 0, roll: 0, mid: 0, tip: 0, lift: 0, lat: 0, ext: 1, wave: 0, wph: 0, drop: 0, grip: 0.15 });

    // ---- idle hardware (alive at speed 0)
    mBreath = 0.022 * Math.sin(t * 1.30);
    hY += Math.sin(t * 1.30) * 0.012;
    hR += Math.sin(t * 0.47) * 0.012;
    hdY += Math.sin(t * 0.43) * 0.16;
    hdP += Math.sin(t * 0.71) * 0.05;
    pap += Math.sin(t * 0.9) * 0.10;
    gill += 0.06 + 0.05 * Math.sin(t * 1.30 + 0.6);
    for (let i = 0; i < 8; i++) {
      A[i].wave = 0.045; A[i].wph = t * 0.16 + i * 0.13;
      A[i].tip += 0.10 + 0.07 * Math.sin(t * 0.85 + i * 1.1);
    }

    // ---- gait
    const stream = clamp01((sp - 2.4) / 3.0);
    const groundK = grounded ? 1 : 0;
    const walkK = clamp01(sp / 0.35) * (1 - stream) * groundK;
    const k3 = clamp01(sp / 3);
    const creep = clamp01(1 - Math.abs(sp - 0.5) / 0.55) * groundK;
    const midAmp = (0.45 + 0.85 * k3) * walkK;
    const liftAmp = (0.30 + 0.70 * k3) * walkK;
    const sweepAmp = (0.09 + 0.19 * k3) * walkK;

    hY += (-0.075 * creep) + 0.10 * k3 * (1 - stream) * groundK;
    hP += -0.05 * k3 * (1 - stream);
    if (walkK > 0) {
      hY += Math.sin(TAU * stride * 2) * 0.020 * walkK;
      hR += Math.sin(TAU * stride) * 0.035 * walkK;
      mBend += Math.sin(TAU * stride * 2 + 1.0) * 0.030 * walkK;
      mYaw += Math.sin(TAU * stride) * 0.045 * walkK;
      hdP += -0.05 * k3;
      idleK *= (1 - 0.5 * walkK);
    }
    for (let i = 0; i < 8; i++) {
      const a = A[i], az = ARM_AZ[i], fwd = Math.cos(az), sgn = P.arms[i].sgn;
      if (walkK > 0.001) {
        const p = frac(stride + PHASE[i]);
        const power = p < 0.58;
        const u = power ? p / 0.58 : (p - 0.58) / 0.42;
        const sw = sweepAmp * (0.35 + 0.65 * Math.max(0, fwd));
        if (power) {
          a.mid += midAmp * Math.sin(PI * u) * (0.55 + 0.45 * Math.max(0, fwd));
          a.ext -= 0.09 * Math.sin(PI * u);
          a.yaw += sgn * sw * (-1 + 2 * u);
        } else {
          a.mid += midAmp * 0.22 * (1 - u);
          a.lift += liftAmp * Math.sin(PI * u);
          a.ext += 0.11 * Math.sin(PI * u);
          a.yaw += sgn * sw * (1 - 2 * u);
        }
        a.lat += sgn * 0.06 * creep;
        a.ext += 0.06 * creep;
      }
      // jet / stream
      if (stream > 0.001) {
        const targ = sgn * (2.62 + 0.10 * Math.abs(i - 3.5) * 0.1);
        a.yaw += (targ - az) * stream;
        a.mid *= (1 - stream); a.lift *= (1 - stream);
        a.wave = 0.045 + 0.16 * stream;
        a.wph = stride * 1.5 + i * 0.10;
        a.ext += 0.12 * stream;
        a.tip *= (1 - 0.6 * stream);
      }
    }
    if (stream > 0.001) {
      hY += 0.30 * stream; hP += -0.06 * stream;
      mBreath += 0.055 * Math.sin(TAU * stride * 2) * stream;
      sipP += -1.05 * stream; iris = Math.max(iris, 0.85 * stream);
      gill = Math.max(gill, 0.70 * stream); hdP += -0.06 * stream;
      idleK *= (1 - 0.7 * stream);
    }

    // ---- overlays: turn
    if (turn !== 0) {
      hR += -turn * 0.17; hYaw += -turn * 0.05;
      hdY += turn * 0.36; hdR += -turn * 0.16; hdP += 0.03 * Math.abs(turn);
      mYaw += turn * 0.10; mBend += 0.03 * Math.abs(turn);
      for (let i = 0; i < 8; i++) {
        const sgn = P.arms[i].sgn, a = A[i];
        const inside = turn * sgn;            // +1 when this arm is on the inside
        a.mid += 0.42 * Math.max(0, inside) * Math.abs(turn);
        a.ext += 0.10 * Math.max(0, -inside) * Math.abs(turn);
        a.yaw += -turn * 0.12;
        a.lat += -turn * 0.10 * sgn;
      }
    }
    // ---- overlays: airborne
    if (!grounded) {
      hP += -0.06; hY += 0.02; gill += 0.28; sipP += -0.30;
      for (let i = 0; i < 8; i++) {
        const a = A[i];
        a.mid = a.mid * 0.15 + 0.18; a.lift = 0;
        a.pitch += 0.34; a.tip += 0.55; a.lat += P.arms[i].sgn * 0.12;
        a.wave = 0.13; a.wph = t * 0.75 + i * 0.12;
      }
    }
    // ---- overlays: hurt
    const hurt = sm(0.85, 0.15, health);
    if (hurt > 0.001) {
      hR += 0.13 * hurt; hY += -0.06 * hurt; hP += 0.07 * hurt;
      hdP += 0.24 * hurt; hdR += 0.20 * hurt; hdY += -0.10 * hurt;
      mBend += 0.13 * hurt; mYaw += 0.05 * hurt; mBreath *= (1 - 0.4 * hurt);
      gill *= (1 - 0.5 * hurt); pap *= (1 - 0.8 * hurt); lidK += 0.45 * hurt;
      for (const i of [2, 4]) { A[i].mid += 0.85 * hurt; A[i].tip += 0.75 * hurt; A[i].lift *= (1 - 0.8 * hurt); A[i].ext -= 0.06 * hurt; }
      for (let i = 0; i < 8; i++) A[i].lat += P.arms[i].sgn * 0.06 * hurt;
    }

    // ---- actions
    if (act === 'attack') {
      const kW = keyw(0.00, 0.22, 0.26, 0.40)(ph), kS = keyw(0.28, 0.42, 0.52, 0.74)(ph), kR = keyw(0.62, 0.88, 1.2, 1.3)(ph);
      idleK *= 0.2;
      hZ += -0.10 * kW + 0.17 * kS - 0.03 * kR; hY += 0.10 * kW - 0.05 * kS;
      hP += -0.18 * kW + 0.24 * kS; hdP += -0.26 * kW + 0.32 * kS + 0.05 * kR;
      mBend += -0.12 * kW + 0.14 * kS; beak = 0.10 + 0.90 * kW + 0.04 * kS + 0.25 * kR;
      gill = 0.15 + 0.55 * kW; pap = 0.30 + 0.60 * kW;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        if (i < 2) {
          a.mid += 1.35 * kW - 0.30 * kS; a.tip += 1.20 * kW - 0.55 * kS;
          a.pitch += -0.55 * kW - 0.20 * kS; a.ext += -0.12 * kW + 0.30 * kS;
          a.yaw += -sgn * 0.18 * kS; a.grip = 0.15 + 0.75 * kS;
        } else {
          a.mid += 0.55 * kW + 0.30 * kS; a.lat += sgn * 0.24 * (kW + kS);
          a.ext += 0.05 * kS;
        }
      }
    } else if (act === 'fire') {
      const kA = keyw(0.00, 0.28, 0.44, 0.56)(ph), kF = keyw(0.46, 0.54, 0.62, 0.84)(ph);
      idleK *= (1 - 0.85 * Math.max(kA, kF));
      sipP += -1.10 * (kA * 0.75 + kF); iris = 0.20 + 0.80 * kF;
      mBreath += 0.045 * kA - 0.115 * kF; gill = 0.15 + 0.75 * kA - 0.10 * kF;
      hZ += -0.16 * kF; hP += 0.05 * kF + 0.04 * kA; hY += 0.03 * kA - 0.03 * kF;
      hdP += -0.06 * kA + 0.10 * kF; beak = 0.06;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        a.mid += 0.55 * kA + 0.95 * kF; a.lat += sgn * 0.22 * (kA + kF);
        a.ext -= 0.07 * kF; a.tip += 0.25 * kF;
      }
    } else if (act === 'hit') {
      const e1 = Math.exp(-ph * 6), e2 = Math.exp(-ph * 4.5), osc = Math.exp(-ph * 7) * Math.sin(ph * 26);
      idleK *= 0.3;
      hZ += -0.17 * e1; hY += -0.055 * e1; hR += 0.16 * osc; hP += 0.10 * e1;
      hdP += 0.30 * e1; hdR += 0.24 * osc; hdY += -0.14 * osc;
      beak += 0.55 * e1; gill += 0.65 * e1; pap += 0.5 * e1; lidK += 0.6 * e1;
      mBend += 0.10 * e1; mBreath -= 0.03 * e1;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        a.lat += sgn * 0.38 * e2; a.mid += 0.55 * e2; a.tip += 0.25 * e2; a.pitch += -0.12 * e1;
      }
    } else if (act === 'block') {
      const k = keyw(0.00, 0.24, 0.76, 1.0)(ph);
      idleK *= (1 - 0.8 * k);
      hZ += -0.17 * k; hY += -0.13 * k; hP += 0.12 * k;
      hdP += 0.32 * k; mBend += 0.10 * k; beak = 0.10 - 0.06 * k;
      gill = 0.15 - 0.12 * k; pap = 0.30 - 0.28 * k; lidK += 0.5 * k;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        if (i < 4) { a.pitch += -0.90 * k; a.mid += 0.95 * k; a.tip += 0.80 * k; a.lat += -sgn * 0.16 * k; a.ext -= 0.05 * k; }
        else { a.lat += sgn * 0.32 * k; a.mid += 0.45 * k; a.pitch += 0.10 * k; }
      }
    } else if (act === 'gather' || act === 'deposit') {
      const rev = act === 'deposit';
      const q = rev ? 1 - ph : ph;
      const kD = keyw(0.00, 0.30, 0.44, 0.56)(q), kG = keyw(0.42, 0.56, 0.64, 0.78)(q), kU = keyw(0.62, 0.82, 1.1, 1.2)(q);
      idleK *= 0.3;
      hY += -0.12 * kD - 0.03 * kG + 0.05 * kU; hP += 0.16 * kD + 0.05 * kG - 0.07 * kU;
      hZ += 0.05 * kD; hdP += 0.36 * kD + 0.10 * kG - 0.18 * kU; hdY += 0.10 * kD;
      beak = 0.10 + 0.20 * kD + 0.45 * kU;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        if (i === 0) {
          a.pitch += 0.42 * kD - 0.45 * kU; a.ext += 0.24 * kD - 0.10 * kU;
          a.tip += 1.35 * kG + 1.65 * kU; a.mid += 0.20 * kD + 0.65 * kU; a.grip = 0.15 + 0.80 * (kG + kU);
        } else if (i === 1) {
          a.pitch += 0.28 * kD - 0.30 * kU; a.tip += 0.85 * kG + 1.05 * kU; a.yaw += 0.12 * kG; a.grip = 0.15 + 0.55 * kU;
        } else { a.mid += 0.42 * (kD + kU); a.lat += sgn * 0.16 * kD; }
      }
    } else if (act === 'eat') {
      const dn = keyw(0.00, 0.18, 0.84, 1.0)(ph), ch = Math.sin(ph * TAU * 3);
      idleK *= 0.25;
      hY += -0.14 * dn; hP += 0.13 * dn; hdP += 0.44 * dn; hdY += 0.07 * ch * dn;
      beak = 0.10 + 0.50 * dn * (0.5 + 0.5 * ch); gill = 0.15 + 0.20 * dn;
      mBend += 0.06 * dn;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        if (i < 2) { a.pitch += -0.34 * dn; a.tip += (0.95 + 0.45 * Math.sin(ph * TAU * 3 + i)) * dn; a.mid += 0.45 * dn; a.grip = 0.15 + 0.6 * dn; }
        else { a.mid += 0.40 * dn; a.lat += sgn * 0.14 * dn; }
      }
    } else if (act === 'drink') {
      const dn = keyw(0.00, 0.22, 0.80, 1.0)(ph);
      idleK *= 0.2;
      hY += -0.17 * dn + 0.006 * Math.sin(t * 3) * dn; hP += 0.15 * dn;
      hdP += 0.52 * dn; beak = 0.08 + 0.10 * dn; gill = 0.15 + 0.10 * dn; lidK += 0.35 * dn;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        a.mid += 0.38 * dn; a.lat += sgn * 0.20 * dn; a.ext += 0.04 * dn;
        if (i < 2) a.pitch += -0.16 * dn;
      }
    } else if (act === 'jump') {
      const cr = keyw(0.00, 0.30, 0.34, 0.48)(ph), ex = sm(0.36, 0.74, ph);
      idleK *= 0.15;
      hY += -0.22 * cr + 0.46 * ex; hP += 0.12 * cr - 0.18 * ex; hZ += -0.04 * cr + 0.06 * ex;
      hdP += 0.16 * cr - 0.30 * ex; beak = 0.10 + 0.35 * ex;
      sipP += -0.75 * ex; iris = 0.25 + 0.70 * ex; gill = 0.15 + 0.65 * ex; mBreath -= 0.085 * ex;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        a.mid += 1.15 * cr - 0.35 * ex; a.pitch += 0.10 * cr + 0.52 * ex;
        a.lat += sgn * 0.26 * cr + sgn * 0.10 * ex; a.ext += -0.05 * cr + 0.18 * ex; a.tip += 0.30 * cr;
      }
    } else if (act === 'land') {
      const re = 1 - sm(0.00, 0.28, ph), im = keyw(0.24, 0.36, 0.46, 0.64)(ph), pu = sm(0.58, 1.0, ph);
      idleK *= 0.2;
      hY += 0.30 * re - 0.22 * im + 0.02 * pu; hP += -0.10 * re + 0.16 * im - 0.02 * pu;
      hdP += -0.18 * re + 0.26 * im; gill = 0.15 + 0.45 * im; beak = 0.10 + 0.30 * im;
      mBend += -0.06 * re + 0.10 * im;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        a.pitch += 0.56 * re - 0.05 * im; a.ext += 0.20 * re - 0.06 * im;
        a.mid += 1.25 * im + 0.20 * pu; a.lat += sgn * 0.26 * im; a.tip += 0.25 * re;
      }
    } else if (act === 'signal') {
      const ri = keyw(0.05, 0.34, 0.72, 0.96)(ph);
      idleK *= (1 - 0.7 * ri);
      hY += 0.32 * ri + 0.010 * Math.sin(t * 21) * ri; hP += -0.20 * ri; hR += 0.02 * Math.sin(t * 23) * ri;
      mBend += -0.24 * ri; mBreath += 0.05 * ri;
      hdP += -0.38 * ri; beak = 0.10 + 0.78 * ri;
      gill = 0.15 + 0.85 * ri; pap = 0.30 + 0.70 * ri; iris = 0.25 + 0.65 * ri; open += 0.22 * ri;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        a.pitch += -0.80 * ri; a.lat += sgn * 0.38 * ri; a.tip += 0.55 * ri;
        a.ext += 0.10 * ri; a.wave = 0.045 + 0.09 * ri; a.wph = t * 0.9 + i * 0.2;
      }
    } else if (act === 'sleep' || act === 'wake') {
      const k = act === 'sleep' ? sm(0.00, 0.78, ph) : (1 - sm(0.10, 0.82, ph));
      const stir = act === 'wake' ? (1 - sm(0.0, 0.38, ph)) * Math.sin(ph * TAU * 3) : 0;
      idleK *= (1 - 0.85 * k);
      hY += -0.20 * k; hP += 0.07 * k; hR += 0.05 * k + 0.05 * stir;
      mBend += 0.16 * k; mBreath *= (1 - 0.6 * k);
      hdP += 0.32 * k; hdR += 0.10 * k;
      beak = 0.10 - 0.08 * k; gill = 0.15 - 0.12 * k; pap = 0.30 - 0.29 * k; iris = 0.28 - 0.22 * k; lidK += 0.95 * k;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        a.mid += 1.05 * k; a.tip += 1.55 * k; a.lat += sgn * 0.24 * k;
        a.pitch += 0.16 * k; a.ext -= 0.03 * k; a.wave = 0.045 * (1 - k);
      }
    } else if (act === 'die') {
      const k = sm(0.00, 0.60, ph), k2 = sm(0.10, 0.88, ph);
      const tw = (1 - sm(0.0, 0.28, ph)) * Math.sin(ph * 42);
      idleK = 0;
      hY += -0.20 * k2; hR += 0.40 * k2 + 0.05 * tw; hP += 0.14 * k; hZ += -0.05 * k;
      mBend += 0.22 * k2; mYaw += 0.10 * k2; mBreath = -0.10 * k2;
      hdP += 0.55 * k2; hdR += 0.42 * k2; hdY += 0.16 * k2;
      beak = 0.10 + 0.32 * k; gill = 0.15 - 0.14 * k; pap = 0.30 * (1 - k); iris = 0.28 - 0.24 * k; lidK += 0.85 * k2;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        a.pitch += 0.18 * k + 0.06 * tw; a.lat += sgn * 0.58 * k2;
        a.mid += 0.16 * k; a.tip += (i % 2 ? 0.55 : 0.30) * k2; a.ext -= 0.04 * k; a.wave = 0.02 * (1 - k);
      }
    } else if (act === 'evolve') {
      const br = keyw(0.00, 0.20, 0.24, 0.36)(ph), op = keyw(0.28, 0.46, 0.62, 0.82)(ph);
      idleK *= 0.3;
      hY += -0.11 * br + 0.17 * op + 0.010 * Math.sin(t * 26) * op;
      hP += 0.12 * br - 0.11 * op; hR += 0.013 * Math.sin(t * 30) * op;
      open += 1.0 * op; mBreath += 0.06 * op; mBend += 0.06 * br - 0.08 * op;
      gill = 0.15 + 0.85 * op; iris = 0.25 + 0.68 * op; pap = 0.30 + 0.68 * op;
      beak = 0.10 + 0.50 * op; hdP += 0.14 * br - 0.24 * op;
      for (let i = 0; i < 8; i++) {
        const a = A[i], sgn = P.arms[i].sgn;
        a.mid += 0.90 * br - 0.15 * op; a.pitch += 0.10 * br - 0.40 * op;
        a.lat += sgn * 0.32 * op; a.tip += 0.45 * op; a.ext += 0.06 * op;
      }
    }

    // ---- write the body
    hull.position.set(hX, 0.60 + hY, 0.02 + hZ);
    hull.rotation.set(hP, hYaw, hR);
    for (let k = 0; k < P.mantle.length; k++) {
      const w = (k + 1) / P.mantle.length;
      P.mantle[k].rotation.set(mBend * (0.35 + w * 0.9) * 0.42, mYaw * (0.25 + w) * 0.42, mYaw * 0.10);
      const bw = 1 + mBreath * (0.35 + Math.sin(w * PI) * 1.0);
      P.mantleSkin[k].scale.set(bw, bw, 1 + mBreath * 0.35);
    }
    head.rotation.set(hdP, hdY, hdR);
    P.beakU.rotation.x = -beak * 0.55;
    P.beakL.rotation.x = beak * 1.00;
    P.siphon.rotation.set(P.siphonRest.x + sipP, P.siphonRest.y + sipY, 0);
    for (let i = 0; i < P.iris.length; i++) P.iris[i].rotation.x = 0.15 - iris * 0.95;
    for (const g of P.gills) g.n.rotation.z = g.rest * (0.45 + gill * 1.30);
    for (const p of P.paps) p.pap.rotation.x = p.rest - pap * 0.75;
    for (const l of P.lids) l.n.rotation.x = -lidK * 0.55;
    for (const sh of P.shellPivots) sh.n.rotation[sh.ax] = open * sh.a;

    // ---- write the arms
    for (let i = 0; i < 8; i++) {
      const arm = P.arms[i], a = A[i];
      arm.root.rotation.set(a.pitch, a.yaw, a.roll + a.lat * 0.10);
      const ext = Math.max(0.86, Math.min(1.18, a.ext));
      let pp = 0, py = 0, pr = 0;
      const rearBias = (Math.abs(ARM_AZ[i]) > 2.0) ? arm.sgn * 0.30 : 0;
      for (let j = 0; j < NSEG; j++) {
        const seg = arm.segs[j], u = j / (NSEG - 1);
        const base = REST_P[j] * (1 - stream) + STREAM_P[j] * stream;
        const midW = Math.exp(-Math.pow((u - 0.42) / 0.34, 2));
        let Pj = base
          + a.mid * ARCH[j] * 0.95
          + a.tip * TIPC[j] * 0.62
          + a.lift * LIFTP[j]
          + a.wave * Math.sin(TAU * (a.wph - u * 1.15)) * (0.20 + u * 0.55) * 0.55
          + a.drop * u;
        Pj *= (j < 4 ? (1 + (ext - 1) * -0.35) : 1);
        let Yj = a.lat * LATP[j]
          + rearBias * (j < 4 ? j * 0.28 : 1.12) * (1 - stream)
          + Math.sin(j * 0.85 + i * 1.7) * 0.045
          + a.wave * Math.sin(TAU * (a.wph * 0.85 - u * 1.05)) * (0.25 + u * 0.8);
        const Rj = Math.sin(j * 1.3 + i) * 0.03 + a.lat * 0.05 * u;
        seg.rotation.set(Pj - pp, Yj - py, Rj - pr);
        seg.position.z = j === 0 ? 0 : ARM_L[j - 1] * ext;
        pp = Pj; py = Yj; pr = Rj;
      }
      arm.tipA.position.z = ARM_L[NSEG - 1] * ext;
      arm.tipA.rotation.set(-0.10 - a.tip * 0.34, a.lat * 0.10, 0);
      arm.tipB.rotation.set(-0.10 - a.tip * 0.30, 0, 0);
      for (let f = 0; f < arm.grips.length; f++) {
        const fr = arm.grips[f];
        const cl = 0.25 + a.grip * 0.85;
        fr.rotation.x = cl;
        for (const ch of fr.children) if (ch.isGroup) { ch.rotation.x = cl * 0.9; for (const c2 of ch.children) if (c2.isGroup) c2.rotation.x = cl * 0.8; }
      }
    }
  };

  root.userData.pose({ speed: 0, stride: 0, turn: 0, grounded: true, health: 1, t: 0, dt: 0 });
  return root;
}