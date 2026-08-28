function build(THREE, TSL) {
  // ONE QUALITY: MASS AND POWER — everything thickens.
  // BRIEF: a silverback as hardware. Knuckle-walking quadruped, weight thrown
  // forward; the high point is the nuchal hump behind the head, the back slopes
  // DOWN to small hips. Forelimbs half again longer and a third thicker than the
  // short bent hind limbs. Head is one short rigid volume on a 0.12 neck: heavy
  // brow beam, sagittal crest of separate blades, prognathic muzzle wedge, hinged
  // jaw with its own rams and teeth, dark glass optics deep in machined bezels.
  // Big shells: two back plates lapping down the spine, two great pectoral plates,
  // a deltoid cap over each shoulder, flank plates over the rib hoops. Ribcage is
  // hoops + gear stacks + chain and the shells cover only two thirds of it.
  // Cable: 34 runs OUTSIDE the armour — over both shoulders, down the outside of
  // every limb across every joint, both flanks shoulder-port to hip-port.
  const T = TSL || {};
  const Fn = T.Fn, vec3 = T.vec3, float = T.float, positionLocal = T.positionLocal,
    normalLocal = T.normalLocal, mixN = T.mix, ss = T.smoothstep, cl = T.clamp,
    om = T.oneMinus, fr = T.fract, fl = T.floor, si = T.sin, dt = T.dot, at = T.attribute;
  const NM = THREE.MeshStandardNodeMaterial || THREE.MeshStandardMaterial;
  const UN = !!(THREE.MeshStandardNodeMaterial && Fn && at && vec3);
  let fbm, eA = null;
  if (UN) {
    eA = at('aEdge', 'float');
    const h3 = Fn(([p]) => fr(si(dt(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453)));
    const vn = Fn(([p]) => {
      const i = fl(p).toVar(), f = fr(p).toVar();
      const u = f.mul(f).mul(f.mul(-2.0).add(3.0)).toVar();
      const a = h3(i), b = h3(i.add(vec3(1, 0, 0))), c = h3(i.add(vec3(0, 1, 0))), d = h3(i.add(vec3(1, 1, 0)));
      const e = h3(i.add(vec3(0, 0, 1))), f2 = h3(i.add(vec3(1, 0, 1))), g = h3(i.add(vec3(0, 1, 1))), k = h3(i.add(vec3(1, 1, 1)));
      return mixN(mixN(mixN(a, b, u.x), mixN(c, d, u.x), u.y), mixN(mixN(e, f2, u.x), mixN(g, k, u.x), u.y), u.z);
    });
    fbm = Fn(([p]) => vn(p).mul(0.55).add(vn(p.mul(2.07).add(vec3(13.1))).mul(0.28)).add(vn(p.mul(4.13).add(vec3(27.7))).mul(0.17)));
  }
  function matte(hex, o) {
    o = o || {}; const m = new NM(), c = new THREE.Color(hex);
    m.side = o.side || THREE.FrontSide;
    const r0 = o.rough === undefined ? 0.62 : o.rough, m0 = o.metal === undefined ? 0.12 : o.metal;
    if (!UN) { m.color = c; m.roughness = r0; m.metalness = m0; return m; }
    const w = o.wear === undefined ? 1 : o.wear;
    const bc = new THREE.Color(0x6B665E), rc = new THREE.Color(0x6E3418);
    const base = vec3(c.r, c.g, c.b), bare = vec3(bc.r, bc.g, bc.b), rust = vec3(rc.r, rc.g, rc.b);
    const p = positionLocal;
    const em = om(ss(0.02, 0.92, cl(eA, 0, 1)));
    const nb = fbm(p.mul(9.0)), nf = fbm(p.mul(24.0).add(vec3(5.0)));
    const st = fbm(vec3(p.x.mul(26.0), p.y.mul(3.0), p.z.mul(26.0)).add(vec3(9.0)));
    const dn = om(ss(-0.78, -0.05, normalLocal.y)), up = ss(0.15, 0.85, normalLocal.y);
    const chip = cl(ss(0.48, 0.78, nf).mul(em.mul(1.25)).add(ss(0.84, 0.98, nb).mul(0.3)), 0, 1).mul(w);
    const rst = cl(ss(0.42, 0.88, st).mul(em.mul(0.9).add(dn.mul(0.35))), 0, 1).mul(w);
    const grm = cl(ss(0.32, 0.88, fbm(p.mul(6.0).add(vec3(31.0)))).mul(dn.mul(0.75).add(em.mul(0.45))), 0, 1).mul(w);
    let col = mixN(base, bare, chip.mul(0.8));
    col = mixN(col, rust, rst.mul(0.55));
    col = col.mul(om(grm.mul(0.38)));
    if (o.mw) col = mixN(col, col.mul(1.35).add(vec3(0.03)), em.mul(0.35));
    col = mixN(col, col.mul(1.08).add(vec3(0.012)), up.mul(0.3));
    m.colorNode = col;
    m.roughnessNode = cl(float(r0).add(up.mul(0.12)).add(grm.mul(0.22)).sub(chip.mul(0.12)), 0.3, 1.0);
    m.metalnessNode = cl(float(m0).add(chip.mul(0.55)), 0, 1);
    return m;
  }
  const DS = THREE.DoubleSide;
  const SH = matte(0xD8D2C6, { rough: .6, metal: .1 }), SHS = matte(0xC9C2B4, { rough: .63, metal: .1 }),
    SHW = matte(0xB5AC9C, { rough: .66, metal: .14 }), SHD = matte(0xD8D2C6, { rough: .6, metal: .1, side: DS }),
    SHSD = matte(0xC9C2B4, { rough: .63, metal: .1, side: DS }), SHWD = matte(0xB5AC9C, { rough: .66, metal: .14, side: DS }),
    MT = matte(0x55524C, { rough: .55, metal: .82, mw: 1 }), MTL = matte(0x6B665E, { rough: .5, metal: .86, mw: 1 }),
    MTD = matte(0x55524C, { rough: .55, metal: .82, mw: 1, side: DS }), BL = matte(0x3E3A34, { rough: .58, metal: .78, mw: 1 }),
    BZ = matte(0x4A4238, { rough: .62, metal: .72, mw: 1 }), RB = matte(0x1E1D1B, { rough: .93, metal: .02, wear: .22 }),
    HS = matte(0x1E1D1B, { rough: .9, metal: .05, wear: .3 }), AC = matte(0xC2521E, { rough: .62, metal: .08 }),
    ACR = matte(0xA8231C, { rough: .62, metal: .08 });
  const LENS = (function () { const m = new NM(), c = new THREE.Color(0x0A0B0D); if (!UN) { m.color = c; m.roughness = .07; m.metalness = .2; return m; } m.colorNode = vec3(c.r, c.g, c.b); m.roughnessNode = float(.07); m.metalnessNode = float(.2); return m; })();
  function glow(hex) { const m = new NM(), c = new THREE.Color(hex); if (!UN) { m.color = c; m.emissive = c; return m; } m.colorNode = vec3(c.r * .12, c.g * .12, c.b * .12); m.emissiveNode = vec3(c.r * 1.5, c.g * 1.5, c.b * 1.5); m.roughnessNode = float(.35); m.metalnessNode = float(0); return m; }
  const GA = glow(0x39C6D8), GB = glow(0xD89A2A);

  function addEdge(g) {
    if (!g || !g.attributes || !g.attributes.position || g.attributes.aEdge) return g;
    g.computeBoundingBox(); const b = g.boundingBox, p = g.attributes.position, n = p.count;
    const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2;
    const hx = Math.max((b.max.x - b.min.x) / 2, 1e-5), hy = Math.max((b.max.y - b.min.y) / 2, 1e-5), hz = Math.max((b.max.z - b.min.z) / 2, 1e-5);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = Math.min(hx - Math.abs(p.getX(i) - cx), Math.min(hy - Math.abs(p.getY(i) - cy), hz - Math.abs(p.getZ(i) - cz)));
      a[i] = Math.min(1, Math.max(0, d / 0.03));
    }
    g.setAttribute('aEdge', new THREE.BufferAttribute(a, 1)); return g;
  }
  const GC = new Map();
  function gc(k, f) { let g = GC.get(k); if (!g) { g = addEdge(f()); GC.set(k, g); } return g; }
  const joints = [];
  function G(n, p, x, y, z) { const g = new THREE.Group(); g.name = n; g.position.set(x || 0, y || 0, z || 0); if (p) p.add(g); return g; }
  function J(n, p, x, y, z) { const g = G(n, p, x, y, z); joints.push(g); return g; }
  function M(n, g, m, p, x, y, z) { addEdge(g); const o = new THREE.Mesh(g, m); o.name = n; o.position.set(x || 0, y || 0, z || 0); if (p) p.add(o); return o; }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const YA = V(0, 1, 0), ZA = V(0, 0, 1);
  function cf(w, h, d, c) {
    c = c === undefined ? Math.min(w, h) * .16 : c;
    return gc('c' + w.toFixed(3) + h.toFixed(3) + d.toFixed(3) + c.toFixed(3), () => {
      const s = new THREE.Shape(), hw = w / 2, hh = h / 2, k = Math.min(c, hw * .9, hh * .9);
      s.moveTo(-hw + k, -hh); s.lineTo(hw - k, -hh); s.quadraticCurveTo(hw, -hh, hw, -hh + k);
      s.lineTo(hw, hh - k); s.quadraticCurveTo(hw, hh, hw - k, hh); s.lineTo(-hw + k, hh);
      s.quadraticCurveTo(-hw, hh, -hw, hh - k); s.lineTo(-hw, -hh + k); s.quadraticCurveTo(-hw, -hh, -hw + k, -hh);
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: d * .12, bevelThickness: d * .12, bevelSegments: 2, curveSegments: 2 });
      g.translate(0, 0, -d / 2); return g;
    });
  }
  function pl(k, pts, d, b, slots) {
    return gc('p' + k, () => {
      const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      s.closePath();
      if (slots) for (let i = 0; i < slots.length; i++) {
        const q = slots[i], x = q[0], y = q[1], w = q[2] / 2, h = q[3] / 2, r = Math.min(w, h) * .7, pa = new THREE.Path();
        pa.moveTo(x - w + r, y - h); pa.lineTo(x + w - r, y - h); pa.quadraticCurveTo(x + w, y - h, x + w, y - h + r);
        pa.lineTo(x + w, y + h - r); pa.quadraticCurveTo(x + w, y + h, x + w - r, y + h); pa.lineTo(x - w + r, y + h);
        pa.quadraticCurveTo(x - w, y + h, x - w, y + h - r); pa.lineTo(x - w, y - h + r); pa.quadraticCurveTo(x - w, y - h, x - w + r, y - h);
        s.holes.push(pa);
      }
      const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: b || .006, bevelThickness: b || .006, bevelSegments: 2, curveSegments: 3 });
      g.translate(0, 0, -d / 2); return g;
    });
  }
  const arc = (rt, rb, l, ts, tl) => gc('a' + [rt, rb, l, ts, tl].map(v => v.toFixed(3)).join('_'), () => new THREE.CylinderGeometry(rt, rb, l, 22, 1, true, ts, tl));
  const dm = (r, ps, pln, ts, tl) => gc('d' + [r, ps, pln, ts, tl].map(v => v.toFixed(3)).join('_'), () => new THREE.SphereGeometry(r, 20, 13, ps, pln, ts, tl));
  const la = (pr, sg) => gc('l' + pr.map(p => p[0].toFixed(3) + p[1].toFixed(3)).join('') + (sg || 16), () => new THREE.LatheGeometry(pr.map(p => new THREE.Vector2(p[0], p[1])), sg || 16));
  const tp = (rt, rb, l, s) => gc('t' + [rt, rb, l, s || 8].map(v => (+v).toFixed(3)).join('_'), () => new THREE.CylinderGeometry(rt, rb, l, s || 8));
  const tor = (r, t, a, s) => gc('o' + [r, t, a, s || 10].map(v => (+v).toFixed(3)).join('_'), () => new THREE.TorusGeometry(r, t, 6, s || 10, a));
  const sph = (r) => gc('s' + r.toFixed(3), () => new THREE.SphereGeometry(r, 12, 8));

  function bolts(p, n, x, y, z, R, cnt, ax, sz) {
    sz = sz || .0075;
    const g = gc('b' + sz.toFixed(4), () => new THREE.CylinderGeometry(sz, sz * 1.2, sz * 1.1, 6));
    for (let i = 0; i < cnt; i++) {
      const a = i / cnt * Math.PI * 2, ca = Math.cos(a) * R, sa = Math.sin(a) * R;
      let m;
      if (ax === 'y') m = M(n + '_' + i, g, MTL, p, x + ca, y, z + sa);
      else if (ax === 'x') { m = M(n + '_' + i, g, MTL, p, x, y + ca, z + sa); m.rotation.z = Math.PI / 2; }
      else { m = M(n + '_' + i, g, MTL, p, x + ca, y + sa, z); m.rotation.x = Math.PI / 2; }
    }
  }
  function race(p, n, x, y, z, ri, ro, h, ax) {
    const g = la([[ri, -h], [ro, -h], [ro, -h * .35], [ro * .9, -h * .35], [ro * .9, h * .35], [ro, h * .35], [ro, h], [ri, h]], 18);
    const m = M(n, g, MT, p, x, y, z);
    if (ax === 'x') m.rotation.z = Math.PI / 2; else if (ax === 'z') m.rotation.x = Math.PI / 2;
    const c = la([[0, -h * .6], [ri * 1.02, -h * .6], [ri * 1.02, h * .6], [0, h * .6]], 14);
    const m2 = M(n + '_hub', c, BL, p, x, y, z);
    m2.rotation.copy(m.rotation);
    bolts(p, n + '_bolt', x, y, z, (ri + ro) * .5, 6, ax === 'x' ? 'x' : ax === 'z' ? 'z' : 'y', .0065);
    return m;
  }
  function gears(p, n, x, y, z, r, ax) {
    const st = [[r, .022, MT, 10], [r * .78, .034, MTL, 12], [r * .52, .026, BZ, 8]];
    for (let i = 0; i < st.length; i++) {
      const q = st[i], m = M(n + '_g' + i, tp(q[0], q[0], q[1], q[3]), q[2], p, x, y, z);
      if (ax === 'x') m.rotation.z = Math.PI / 2; else if (ax === 'z') m.rotation.x = Math.PI / 2;
      if (ax === 'x') m.position.x += (i - 1) * q[1] * .9; else if (ax === 'z') m.position.z += (i - 1) * q[1] * .9; else m.position.y += (i - 1) * q[1] * .9;
    }
    bolts(p, n + '_b', x, y, z, r * .62, 5, ax === 'x' ? 'x' : ax === 'z' ? 'z' : 'y', .006);
  }
  function ram(p, n, a, b, r) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const g = G(n, p, a.x, a.y, a.z);
    g.quaternion.setFromUnitVectors(YA, d.clone().normalize());
    M(n + '_barrel', la([[0, 0], [r, 0], [r, L * .5], [r * .82, L * .52], [r * .82, L * .56], [0, L * .56]], 14), MT, g, 0, 0, 0);
    M(n + '_rod', tp(r * .34, r * .34, L * .52, 10), MTL, g, 0, L * .72, 0);
    M(n + '_gland', la([[r * .3, 0], [r * .72, 0], [r * .72, .012], [r * .3, .014]], 12), BZ, g, 0, L * .55, 0);
    for (let i = 0; i < 3; i++) M(n + '_boot' + i, tor(r * .48, r * .16, Math.PI * 2, 8), RB, g, 0, L * (.60 + i * .035), 0).rotation.x = Math.PI / 2;
    M(n + '_clevis', cf(r * 1.5, r * 1.1, r * .5), MT, g, 0, L * .97, 0).rotation.x = Math.PI / 2;
    M(n + '_pin', tp(r * .28, r * .28, r * 1.8, 8), BL, g, 0, L * .97, 0).rotation.z = Math.PI / 2;
    M(n + '_foot', la([[0, 0], [r * 1.1, 0], [r * .9, .02], [0, .022]], 12), BZ, g, 0, -.008, 0);
    return g;
  }
  function chain(p, n, pts, r, cnt) {
    const cv = new THREE.CatmullRomCurve3(pts.map(q => V(q[0], q[1], q[2])));
    const lk = cf(r * 2.0, r * .8, r * 2.4, r * .3), pn = tp(r * .3, r * .3, r * 2.2, 6);
    for (let i = 0; i < cnt; i++) {
      const t = (i + .5) / cnt, po = cv.getPointAt(t), tg = cv.getTangentAt(t);
      const m = M(n + '_l' + i, lk, i % 2 ? BL : MT, p, po.x, po.y, po.z);
      m.quaternion.setFromUnitVectors(ZA, tg);
      if (i % 2) m.rotateZ(Math.PI / 2);
      if (i % 2 === 0) { const q = M(n + '_p' + i, pn, MTL, p, po.x, po.y, po.z); q.quaternion.copy(m.quaternion); q.rotateY(Math.PI / 2); }
    }
    for (let e = 0; e < 2; e++) {
      const po = cv.getPointAt(e), tg = cv.getTangentAt(e);
      const s = M(n + '_spr' + e, tp(r * 2.1, r * 2.1, r * 1.3, 8), MT, p, po.x, po.y, po.z);
      s.quaternion.setFromUnitVectors(YA, tg); s.rotateZ(Math.PI / 2);
      M(n + '_sprh' + e, tp(r * .85, r * .85, r * 1.9, 10), BZ, p, po.x, po.y, po.z).quaternion.copy(s.quaternion);
    }
  }

  // ── frame ────────────────────────────────────────────────────────────────
  const root = new THREE.Group(); root.name = 'gorilla_mech';
  const rig = G('rig', root, 0, 0, 0);
  const R = { spine: [], arms: [], legs: [], open: [] };
  const SP = [[0, .78, -.44], [0, .83, -.24], [0, .885, -.04], [0, .95, .14], [0, 1.01, .28], [0, 1.00, .40]];
  let par = rig, prev = [0, 0, 0];
  for (let i = 0; i < SP.length; i++) {
    const g = J('spine_' + i, par, SP[i][0] - prev[0], SP[i][1] - prev[1], SP[i][2] - prev[2]);
    R.spine.push(g); par = g; prev = SP[i];
  }
  const SW = [.24, .25, .27, .29, .30, .24], SH2 = [.15, .15, .16, .16, .15, .12];
  for (let i = 0; i < 6; i++) {
    const g = R.spine[i];
    M('vertebra_' + i, cf(SW[i], SH2[i], .16, .03), MT, g, 0, .01, 0);
    M('vertebra_cap_' + i, cf(SW[i] * .7, SH2[i] * .5, .175, .02), BZ, g, 0, .055, 0);
    if (i < 5) race(g, 'spine_race_' + i, 0, -.01, .085, .028, .058, .018, 'z');
    bolts(g, 'vert_bolt_' + i, 0, .01, .082, SW[i] * .32, 6, 'z', .006);
    if (i > 0 && i < 5) for (const s of [-1, 1]) {
      M('transverse_' + i + (s > 0 ? 'R' : 'L'), tp(.018, .026, .10, 6), MTL, g, s * .09, -.01, 0).rotation.z = Math.PI / 2 * s;
    }
  }
  // rib hoops + cores (the torso is a stack, not a primitive)
  for (let i = 1; i <= 4; i++) {
    const g = R.spine[i], Rr = [0, .21, .245, .27, .265][i];
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      const m = M('rib_' + i + '_' + k + (s > 0 ? 'R' : 'L'), tor(Rr - k * .022, .017 - k * .004, Math.PI * .92, 12), k ? BZ : MT, g, 0, -.055, -.045 + k * .085);
      m.rotation.z = s > 0 ? -Math.PI / 2 : Math.PI / 2; m.scale.set(1, .86, 1);
      if (s < 0) m.rotation.z = Math.PI / 2;
      m.rotation.y = s > 0 ? 0 : 0;
      m.scale.x = s;
    }
    M('rib_tie_' + i, tp(.014, .014, .30, 6), BL, g, 0, -.20, .02).rotation.z = Math.PI / 2;
  }
  M('chest_core', sph(.27), BL, R.spine[3], 0, -.05, -.02).scale.set(1, .82, 1.05);
  M('belly_core', sph(.22), BL, R.spine[1], 0, -.10, .02).scale.set(1.02, .86, 1.0);
  M('pelvis_core', cf(.34, .21, .27, .05), MT, R.spine[0], 0, -.04, -.03);
  M('pelvis_yoke', cf(.40, .10, .14, .03), MTL, R.spine[0], 0, -.10, -.10);
  M('rump_block', cf(.26, .18, .14, .04), MT, R.spine[0], 0, .0, -.16);
  bolts(R.spine[0], 'pelvis_bolt', 0, -.04, .10, .13, 8, 'z', .007);
  gears(R.spine[0], 'hip_gear_L', -.17, -.05, -.02, .06, 'x');
  gears(R.spine[0], 'hip_gear_R', .17, -.05, -.02, .06, 'x');
  const yoke = G('shoulder_yoke', R.spine[4], 0, .0, .0);
  M('yoke_beam', cf(.60, .12, .18, .035), MT, yoke, 0, .01, -.02);
  M('yoke_upper', cf(.46, .09, .15, .03), MTL, yoke, 0, .075, -.03);
  M('nuchal_hump', sph(.20), BL, yoke, 0, .06, -.02).scale.set(1, .62, .85);
  for (let i = 0; i < 3; i++) {
    const m = M('hump_plate_' + i, dm(.205 - i * .004, -1.15 + i * .78, .82, .12, 1.0), i === 1 ? SHD : SHSD, yoke, 0, .045, -.02);
    m.scale.set(1.02, .70, .92); R.open.push({ o: m, d: V(i === 0 ? -.5 : i === 2 ? .5 : 0, .8, -.2) });
  }
  bolts(yoke, 'yoke_bolt', 0, .085, .05, .16, 10, 'y', .0065);
  gears(yoke, 'yoke_gear_L', -.20, .02, -.06, .055, 'x');
  gears(yoke, 'yoke_gear_R', .20, .02, -.06, .055, 'x');
  M('withers_junction', cf(.13, .07, .10, .02), MT, yoke, .0, .105, .01);
  M('status_port', tp(.012, .012, .006, 10), GA, yoke, .045, .142, .03).rotation.x = Math.PI / 2;
  chain(R.spine[2], 'spine_chain', [[.055, .07, .12], [.05, .075, -.02], [.045, .06, -.16], [.04, .04, -.26]], .017, 8);
  chain(R.spine[2], 'spine_chain_L', [[-.055, .07, .12], [-.05, .075, -.02], [-.045, .06, -.16], [-.04, .04, -.26]], .017, 8);
  for (const s of [-1, 1]) ram(R.spine[2], 'trunk_ram_' + (s > 0 ? 'R' : 'L'), V(s * .13, .05, .14), V(s * .16, -.06, -.20), .028);

  // ── head (densest section) ───────────────────────────────────────────────
  const neck = J('neck', R.spine[5], 0, 0, .02);
  for (let i = 0; i < 3; i++) M('neck_ring_' + i, la([[.055, 0], [.085, 0], [.085, .022], [.062, .028]], 14), i % 2 ? BZ : MT, neck, 0, -.01 + i * .012, i * .035).rotation.x = Math.PI / 2.2;
  M('neck_column', tp(.075, .095, .13, 8), MTL, neck, 0, -.01, .05).rotation.x = Math.PI / 2;
  race(neck, 'neck_race', 0, 0, .10, .045, .085, .022, 'z');
  for (const s of [-1, 1]) ram(neck, 'neck_ram_' + (s > 0 ? 'R' : 'L'), V(s * .10, -.05, -.05), V(s * .07, .04, .10), .019);
  const head = J('head', neck, 0, .0, .12);
  M('head_core', cf(.26, .20, .22, .05), MT, head, 0, .085, .10);
  M('head_core_lower', cf(.225, .12, .19, .04), BL, head, 0, -.005, .12);
  M('head_base_block', cf(.19, .13, .09, .03), MTL, head, 0, .05, -.01);
  M('skull_plate_c', dm(.155, Math.PI / 2 - .85, 1.7, .05, 1.15), SHD, head, 0, .07, .08).scale.set(1.0, .92, 1.10);
  M('skull_plate_l', dm(.152, .18, .95, .45, 1.15), SHSD, head, 0, .07, .08).scale.set(1.0, .92, 1.08);
  M('skull_plate_r', dm(.152, Math.PI - 1.13, .95, .45, 1.15), SHSD, head, 0, .07, .08).scale.set(1.0, .92, 1.08);
  M('occipital_plate', dm(.148, Math.PI * 1.5 - .95, 1.9, .18, 1.35), SHWD, head, 0, .065, .07).scale.set(1.0, .95, 1.0);
  const crest = G('sagittal_crest', head, 0, .155, .09);
  M('crest_base', pl('cb', [[-.11, 0], [.10, 0], [.085, .035], [-.095, .03]], .036, .005), MTL, crest, 0, 0, 0).rotation.y = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const h = .026 + Math.sin((i + 1) / 7 * Math.PI) * .038, z = -.085 + i * .036;
    const m = M('crest_blade_' + i, pl('cbl' + i, [[-.017, 0], [.017, 0], [.012, h], [-.014, h * .92]], .012, .003), i % 2 ? SHS : SH, crest, 0, .022, z);
    m.rotation.y = Math.PI / 2; R.open.push({ o: m, d: V(0, 1, 0) });
  }
  M('crest_rail', tp(.007, .007, .21, 6), BL, crest, 0, .018, .0).rotation.x = Math.PI / 2;
  const brow = G('brow', head, 0, .105, .225);
  M('brow_beam', cf(.30, .052, .075, .016), SH, brow, 0, 0, 0).rotation.x = -.16;
  M('brow_beam_under', cf(.27, .028, .06, .01), MT, brow, 0, -.035, -.005);
  for (const s of [-1, 1]) {
    M('brow_wing_' + (s > 0 ? 'R' : 'L'), pl('bw', [[0, 0], [.075, .012], [.08, .05], [0, .045]], .022, .005), SHS, brow, s * .07, .01, -.03).rotation.set(-.2, 0, s > 0 ? 0 : Math.PI);
    M('brow_rivet_pad_' + (s > 0 ? 'R' : 'L'), cf(.05, .022, .014, .006), MTL, brow, s * .105, .012, .02);
  }
  bolts(brow, 'brow_bolt', 0, .012, .035, .12, 8, 'z', .0055);
  for (const s of [-1, 1]) {
    const sn = s > 0 ? 'R' : 'L', ex = G('eye_' + sn, head, s * .072, .055, .215);
    M('eye_bezel_' + sn, la([[.021, 0], [.038, 0], [.038, .012], [.030, .020], [.030, .026], [.021, .026]], 16), MT, ex, 0, 0, 0).rotation.x = Math.PI / 2;
    M('eye_socket_' + sn, la([[0, 0], [.030, 0], [.030, .012], [0, .012]], 14), BL, ex, 0, 0, -.012).rotation.x = Math.PI / 2;
    M('eye_lens_' + sn, sph(.0245), LENS, ex, 0, 0, .002).scale.set(1, 1, .55);
    M('eye_hood_' + sn, pl('eh', [[-.036, 0], [.036, 0], [.03, .022], [-.03, .022]], .012, .004), SHS, ex, 0, .034, .006).rotation.x = -.5;
    M('eye_iris_ring_' + sn, tor(.026, .0035, Math.PI * 2, 14), BZ, ex, 0, 0, .012);
    bolts(ex, 'eye_bolt_' + sn, 0, 0, .008, .035, 6, 'z', .005);
    M('tear_duct_' + sn, tp(.006, .008, .014, 6), MTL, ex, s * .04, -.02, .0).rotation.x = Math.PI / 2;
  }
  const muz = G('muzzle', head, 0, -.005, .30);
  M('muzzle_barrel', tp(.078, .108, .175, 6), MT, muz, 0, .015, 0).rotation.x = Math.PI / 2;
  M('muzzle_top_plate', pl('mt', [[-.085, -.09], [.085, -.09], [.062, .085], [-.062, .085]], .018, .005), SH, muz, 0, .078, .005).rotation.x = Math.PI / 2 - .12;
  for (const s of [-1, 1]) M('muzzle_cheek_' + (s > 0 ? 'R' : 'L'), pl('mc', [[-.085, -.05], [.085, -.04], [.07, .055], [-.075, .05]], .016, .004), SHS, muz, s * .088, .012, .0).rotation.set(Math.PI / 2, 0, 0).y = s * Math.PI / 2;
  for (const s of [-1, 1]) { const m = M('cheek_flange_' + (s > 0 ? 'R' : 'L'), arc(.075, .095, .15, s > 0 ? -.2 : Math.PI - 1.4, 1.6), SHSD, muz, s * .012, .012, -.01); m.rotation.x = Math.PI / 2; }
  M('muzzle_front', la([[0, 0], [.072, 0], [.078, .014], [.06, .022], [0, .024]], 12), MTL, muz, 0, .01, .093).rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) M('nostril_' + (s > 0 ? 'R' : 'L'), la([[0, 0], [.014, 0], [.014, .008], [.007, .012]], 10), BL, muz, s * .026, .022, .10).rotation.x = -Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * .022, big = (i === 1 || i === 4);
    M('tooth_up_' + i, tp(.005, .010, big ? .034 : .020, 5), MTL, muz, x, -.028, .07 - Math.abs(i - 2.5) * .006).rotation.x = .12;
  }
  bolts(muz, 'muzzle_bolt', 0, .04, .06, .07, 7, 'z', .005);
  const jaw = J('jaw', head, 0, -.048, .225);
  for (const s of [-1, 1]) {
    M('jaw_beam_' + (s > 0 ? 'R' : 'L'), cf(.034, .052, .16, .012), MT, jaw, s * .082, -.012, .075);
    M('jaw_hinge_' + (s > 0 ? 'R' : 'L'), la([[0, 0], [.026, 0], [.026, .016], [.018, .022]], 12), MTL, jaw, s * .088, 0, 0).rotation.z = -s * Math.PI / 2;
    M('jaw_shell_' + (s > 0 ? 'R' : 'L'), pl('js', [[-.075, -.028], [.07, -.02], [.062, .028], [-.07, .022]], .014, .004), SHW, jaw, s * .10, -.016, .08).rotation.y = s * Math.PI / 2;
  }
  M('jaw_front', cf(.175, .05, .052, .014), MT, jaw, 0, -.018, .152);
  M('jaw_chin_plate', pl('jc', [[-.08, -.028], [.08, -.028], [.068, .03], [-.068, .03]], .016, .005), SHS, jaw, 0, -.03, .135).rotation.x = 1.35;
  for (let i = 0; i < 6; i++) M('tooth_low_' + i, tp(.005, .009, (i === 1 || i === 4) ? .030 : .018, 5), MTL, jaw, (i - 2.5) * .021, .012, .148).rotation.x = -.1;
  M('jaw_gear', tp(.03, .03, .014, 10), BZ, jaw, .088, 0, 0).rotation.z = Math.PI / 2;
  M('jaw_gear_L', tp(.03, .03, .014, 10), BZ, jaw, -.088, 0, 0).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) ram(head, 'jaw_ram_' + (s > 0 ? 'R' : 'L'), V(s * .105, .045, .10), V(s * .098, -.035, .20), .017);
  for (const s of [-1, 1]) {
    M('ear_' + (s > 0 ? 'R' : 'L'), la([[0, 0], [.026, .004], [.028, .014], [.014, .018], [.012, .008]], 12), MT, head, s * .145, .055, .045).rotation.z = -s * Math.PI / 2;
    M('ear_cup_' + (s > 0 ? 'R' : 'L'), la([[0, 0], [.018, 0], [.018, .008], [0, .008]], 10), BL, head, s * .152, .055, .045).rotation.z = -s * Math.PI / 2;
    M('head_vent_' + (s > 0 ? 'R' : 'L'), pl('hv', [[-.03, -.018], [.03, -.018], [.03, .018], [-.03, .018]], .008, .003, [[-.014, 0, .008, .026], [0, 0, .008, .026], [.014, 0, .008, .026]]), MTL, head, s * .128, .10, .10).rotation.y = s * Math.PI / 2;
    M('head_port_' + (s > 0 ? 'R' : 'L'), la([[0, 0], [.017, 0], [.017, .012], [.011, .016]], 10), BZ, head, s * .10, .145, -.01).rotation.x = -.4;
    M('sensor_stalk_' + (s > 0 ? 'R' : 'L'), tp(.004, .005, .07, 6), BL, head, s * .055, .17, -.03).rotation.x = .7;
    M('sensor_tip_' + (s > 0 ? 'R' : 'L'), sph(.009), MTL, head, s * .055, .195, -.052);
  }
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2, r = .13 + (i % 3) * .012;
    M('head_rivet_' + i, gc('hr', () => new THREE.CylinderGeometry(.005, .006, .006, 6)), MTL, head,
      Math.cos(a) * r * .92, .07 + Math.sin(a) * r * .62, .09 + Math.cos(a * 2) * .05).rotation.x = Math.PI / 2;
  }

  // ── limbs ────────────────────────────────────────────────────────────────
  function digit(p, n, x, y, z, rot, lens, rads, curls, tip) {
    const ch = []; let g = J(n, p, x, y, z);
    g.rotation.set(rot[0], rot[1], rot[2]); ch.push(g);
    for (let i = 0; i < lens.length; i++) {
      const L = lens[i], r0 = rads[i], r1 = rads[i + 1] !== undefined ? rads[i + 1] : rads[i] * .8;
      const lg = gc('dg' + r0.toFixed(3) + r1.toFixed(3) + L.toFixed(3), () => { const c = new THREE.CylinderGeometry(r1, r0, L, 6); c.rotateX(Math.PI / 2); c.translate(0, 0, L * .5); return c; });
      M(n + '_link' + i, lg, i === 1 ? MTL : MT, g, 0, 0, 0);
      M(n + '_pin' + i, tp(r0 * .45, r0 * .45, r0 * 2.4, 6), BL, g, 0, 0, 0).rotation.z = Math.PI / 2;
      if (i === 0) M(n + '_shell', arc(r1 * 1.35, r0 * 1.35, L * .8, -1.0, 2.0), SHSD, g, 0, r0 * .1, L * .45).rotation.x = Math.PI / 2;
      const nx = J(n + '_j' + (i + 1), g, 0, 0, L);
      nx.rotation.x = curls[i] || 0; ch.push(nx); g = nx;
    }
    const r = rads[rads.length - 1] * .9;
    if (tip === 'claw') { M(n + '_claw', tp(.001, r, .05, 6), BL, g, 0, 0, .022).rotation.x = Math.PI / 2; M(n + '_claw_base', la([[0, 0], [r * 1.2, 0], [r, .012]], 8), MTL, g, 0, 0, .004).rotation.x = -Math.PI / 2; }
    else { M(n + '_pad', cf(r * 2.1, r * 1.2, .022, .006), RB, g, 0, -r * .5, .012); M(n + '_tipcap', la([[0, 0], [r * 1.1, 0], [r * .8, .016]], 8), MTL, g, 0, 0, .003).rotation.x = -Math.PI / 2; }
    return ch;
  }
  for (const s of [-1, 1]) {
    const sn = s > 0 ? 'R' : 'L';
    const sh = J('arm_' + sn + '_shoulder', yoke, s * .32, -.06, -.06);
    race(sh, 'arm_' + sn + '_race', 0, .0, 0, .055, .105, .03, 'x');
    gears(sh, 'arm_' + sn + '_gear', s * .04, -.02, -.05, .062, 'x');
    const up = J('arm_' + sn + '_upper', sh, 0, 0, 0);
    up.rotation.set(-.14, 0, s * .06);
    M('arm_' + sn + '_humerus', tp(.075, .092, .44, 8), MT, up, 0, -.22, .01);
    M('arm_' + sn + '_hum_block', cf(.11, .09, .12, .025), MTL, up, 0, -.10, .01);
    M('arm_' + sn + '_hum_block2', cf(.10, .08, .10, .022), BZ, up, 0, -.33, .02);
    const dc = M('deltoid_cap_' + sn, dm(.155, s > 0 ? Math.PI * .05 : Math.PI * .55, Math.PI * .95, .0, 1.35), SHD, up, 0, -.02, 0);
    dc.scale.set(1.05, .95, 1.0); R.open.push({ o: dc, d: V(s, .5, 0) });
    M('deltoid_lip_' + sn, arc(.158, .162, .02, s > 0 ? .15 : Math.PI * .55, Math.PI * .95), SHSD, up, 0, -.12, 0);
    M('arm_' + sn + '_shell_out', arc(.10, .115, .30, s > 0 ? -.55 : Math.PI - .95, 1.5), SHSD, up, 0, -.20, .0);
    M('arm_' + sn + '_shell_out_lip', arc(.104, .104, .016, s > 0 ? -.55 : Math.PI - .95, 1.5), SHWD, up, 0, -.352, 0);
    M('arm_' + sn + '_shell_fr', arc(.095, .105, .20, 2.45, 1.25), SHWD, up, 0, -.16, .0);
    bolts(up, 'arm_' + sn + '_bolt', 0, -.05, .07, .07, 7, 'z', .006);
    ram(up, 'arm_' + sn + '_ram', V(s * .085, -.02, -.075), V(s * .06, -.36, -.055), .026);
    chain(up, 'arm_' + sn + '_chain', [[s * .105, -.02, .045], [s * .118, -.16, .06], [s * .112, -.30, .05], [s * .10, -.42, .03]], .016, 8);
    const el = J('arm_' + sn + '_elbow', up, 0, -.44, .02);
    el.rotation.x = -.10;
    race(el, 'elbow_race_' + sn, 0, 0, 0, .05, .088, .034, 'x');
    gears(el, 'elbow_gear_' + sn, s * .055, 0, -.02, .05, 'x');
    M('elbow_pin_' + sn, tp(.02, .02, .19, 8), BL, el, 0, 0, 0).rotation.z = Math.PI / 2;
    M('arm_' + sn + '_ulna', tp(.058, .078, .36, 8), MT, el, 0, -.18, .01);
    M('arm_' + sn + '_radius', tp(.032, .042, .33, 6), MTL, el, s * .045, -.17, -.02);
    M('arm_' + sn + '_fore_block', cf(.10, .08, .10, .022), BZ, el, 0, -.09, .01);
    M('arm_' + sn + '_fore_block2', cf(.09, .07, .09, .02), MTL, el, 0, -.27, .02);
    M('arm_' + sn + '_fore_shell', arc(.075, .10, .26, s > 0 ? -.5 : Math.PI - 1.0, 1.55), SHD, el, 0, -.16, .0);
    M('arm_' + sn + '_fore_shell_lip', arc(.079, .079, .015, s > 0 ? -.5 : Math.PI - 1.0, 1.55), SHSD, el, 0, -.29, 0);
    M('arm_' + sn + '_fore_shell_b', arc(.07, .09, .16, 2.6, 1.1), SHWD, el, 0, -.20, 0);
    if (s > 0) M('forearm_blank_plate', pl('fbp', [[-.03, -.05], [.03, -.05], [.03, .05], [-.03, .05]], .01, .004), AC, el, .085, -.16, .04).rotation.y = Math.PI / 2;
    ram(el, 'fore_ram_' + sn, V(s * .07, -.03, -.06), V(s * .05, -.30, -.03), .021);
    chain(el, 'fore_chain_' + sn, [[s * .085, -.03, .045], [s * .095, -.15, .055], [s * .085, -.30, .04]], .013, 7);
    bolts(el, 'fore_bolt_' + sn, 0, -.05, .06, .06, 6, 'z', .0055);
    const wr = J('arm_' + sn + '_wrist', el, 0, -.36, .02);
    wr.rotation.x = .20;
    race(wr, 'wrist_race_' + sn, 0, 0, 0, .04, .072, .028, 'x');
    const hd = J('hand_' + sn, wr, 0, 0, 0);
    M('carpal_' + sn, cf(.135, .10, .115, .025), MT, hd, 0, -.055, .005);
    M('carpal_shell_' + sn, pl('cs', [[-.062, -.055], [.062, -.055], [.055, .05], [-.055, .05]], .016, .005, [[0, -.02, .05, .014]]), SHD, hd, 0, -.05, .062);
    M('carpal_shell_b_' + sn, pl('cs2', [[-.05, -.04], [.05, -.04], [.045, .04], [-.045, .04]], .012, .004), SHSD, hd, 0, -.05, -.058);
    M('knuckle_bar_' + sn, tp(.030, .030, .125, 10), MTL, hd, 0, -.115, .012).rotation.z = Math.PI / 2;
    bolts(hd, 'hand_bolt_' + sn, 0, -.05, .07, .045, 6, 'z', .0055);
    const dig = [];
    for (let i = 0; i < 4; i++) {
      dig.push(digit(hd, 'finger_' + sn + '_' + i, (i - 1.5) * .033, -.115, .022, [.62, 0, 0], [.052, .044, .030], [.017, .015, .012], [-2.35, -.55], 'pad'));
    }
    dig.push(digit(hd, 'thumb_' + sn, -s * .062, -.085, .012, [.85, -s * .8, 0], [.045, .036], [.016, .013], [-1.1], 'pad'));
    R.arms.push({ sh, up, el, wr, hd, dig, s });
  }
  for (const s of [-1, 1]) {
    const sn = s > 0 ? 'R' : 'L';
    const hp = J('leg_' + sn + '_hip', R.spine[0], s * .20, -.06, .02);
    hp.rotation.set(-.55, 0, s * .05);
    race(hp, 'hip_race_' + sn, 0, 0, 0, .05, .095, .03, 'x');
    M('leg_' + sn + '_femur', tp(.068, .088, .32, 8), MT, hp, 0, -.16, 0);
    M('leg_' + sn + '_fem_block', cf(.10, .08, .10, .022), MTL, hp, 0, -.07, .0);
    M('leg_' + sn + '_shell', arc(.082, .10, .22, s > 0 ? -.6 : Math.PI - .95, 1.6), SHD, hp, 0, -.16, .0);
    M('leg_' + sn + '_shell_lip', arc(.086, .086, .015, s > 0 ? -.6 : Math.PI - .95, 1.6), SHSD, hp, 0, -.265, 0);
    M('leg_' + sn + '_shell_b', arc(.075, .09, .14, 2.55, 1.1), SHWD, hp, 0, -.13, 0);
    if (s < 0) M('hip_blank_plate', pl('hbp', [[-.035, -.04], [.035, -.04], [.03, .04], [-.03, .04]], .011, .004), AC, hp, -.088, -.10, .01).rotation.y = -Math.PI / 2;
    ram(hp, 'leg_ram_' + sn, V(s * .075, -.02, -.06), V(s * .05, -.26, -.04), .024);
    chain(hp, 'leg_chain_' + sn, [[s * .095, -.02, .05], [s * .105, -.15, .055], [s * .09, -.29, .03]], .014, 7);
    bolts(hp, 'leg_bolt_' + sn, 0, -.05, .06, .06, 6, 'z', .0055);
    const kn = J('leg_' + sn + '_knee', hp, 0, -.32, 0);
    kn.rotation.x = .78;
    race(kn, 'knee_race_' + sn, 0, 0, 0, .042, .078, .03, 'x');
    gears(kn, 'knee_gear_' + sn, s * .05, 0, -.015, .046, 'x');
    M('patella_' + sn, pl('pt', [[-.045, -.05], [.045, -.05], [.038, .045], [-.038, .045]], .018, .006), SH, kn, 0, -.02, .062);
    M('leg_' + sn + '_tibia', tp(.052, .072, .30, 8), MT, kn, 0, -.15, -.005);
    M('leg_' + sn + '_fibula', tp(.026, .034, .27, 6), MTL, kn, s * .04, -.14, -.02);
    M('leg_' + sn + '_shank_shell', arc(.065, .085, .19, s > 0 ? -.5 : Math.PI - 1.05, 1.55), SHSD, kn, 0, -.14, 0);
    M('leg_' + sn + '_shank_lip', arc(.069, .069, .014, s > 0 ? -.5 : Math.PI - 1.05, 1.55), SHWD, kn, 0, -.235, 0);
    ram(kn, 'shank_ram_' + sn, V(s * .06, -.03, -.05), V(s * .04, -.25, -.03), .019);
    chain(kn, 'shank_chain_' + sn, [[s * .075, -.02, .04], [s * .08, -.14, .045], [s * .07, -.26, .02]], .012, 6);
    const an = J('leg_' + sn + '_ankle', kn, 0, -.30, 0);
    an.rotation.x = -.24;
    race(an, 'ankle_race_' + sn, 0, 0, 0, .034, .062, .026, 'x');
    const ft = J('foot_' + sn, an, 0, 0, 0);
    M('heel_' + sn, cf(.10, .075, .085, .02), MT, ft, 0, -.075, -.055);
    M('sole_' + sn, pl('sl', [[-.062, -.09], [.062, -.09], [.07, .07], [-.07, .07]], .028, .008), MTL, ft, 0, -.125, .035).rotation.x = Math.PI / 2;
    M('sole_pad_' + sn, pl('sp', [[-.055, -.075], [.055, -.075], [.06, .055], [-.06, .055]], .012, .004), RB, ft, 0, -.142, .035).rotation.x = Math.PI / 2;
    M('instep_shell_' + sn, pl('is', [[-.055, -.05], [.055, -.05], [.045, .05], [-.045, .05]], .016, .005, [[0, 0, .05, .012]]), SHD, ft, 0, -.055, .045).rotation.x = 1.25;
    M('foot_arch_' + sn, arc(.055, .07, .10, s > 0 ? -.6 : Math.PI - .95, 1.5), SHSD, ft, 0, -.07, .0);
    bolts(ft, 'foot_bolt_' + sn, 0, -.12, .06, .045, 6, 'z', .0055);
    const toes = [];
    for (let i = 0; i < 4; i++) toes.push(digit(ft, 'toe_' + sn + '_' + i, (i - 1.5) * .031 + s * .012, -.122, .10, [-.06, 0, 0], [.036, .028, .020], [.014, .012, .010], [-.12, -.15], 'claw'));
    toes.push(digit(ft, 'hallux_' + sn, -s * .072, -.12, .055, [-.05, -s * .75, 0], [.040, .030, .020], [.017, .014, .011], [-.15, -.2], 'claw'));
    R.legs.push({ hp, kn, an, ft, toes, s });
  }

  // ── shells over the torso stack ──────────────────────────────────────────
  const backs = [[R.spine[4], .30, .30, .22, .04, SHD], [R.spine[3], .30, .29, .24, .0, SHSD], [R.spine[2], .285, .27, .24, -.02, SHD], [R.spine[1], .255, .235, .22, -.02, SHSD], [R.spine[0], .225, .19, .18, -.04, SHWD]];
  for (let i = 0; i < backs.length; i++) {
    const b = backs[i], g = b[0];
    const m = M('back_plate_' + i, arc(b[1], b[2], b[3], -1.15, 2.3), b[5], g, 0, -.06, b[4]);
    m.rotation.x = Math.PI / 2; m.scale.y = 1.0;
    R.open.push({ o: m, d: V(0, .9, 0) });
    M('back_plate_lip_' + i, arc(b[1] + .006, b[1] + .006, .016, -1.15, 2.3), SHWD, g, 0, -.06, b[4] + b[3] * .48).rotation.x = Math.PI / 2;
    M('back_rib_' + i, tor(b[1] - .004, .008, 2.3, 14), MTL, g, 0, -.06, b[4] - b[3] * .30).rotation.z = -1.15 + Math.PI / 2;
    bolts(g, 'back_bolt_' + i, 0, b[1] * .62 - .06, b[4] - b[3] * .35, .09, 5, 'y', .006);
  }
  for (const s of [-1, 1]) {
    const sn = s > 0 ? 'R' : 'L';
    const f1 = M('flank_plate_f_' + sn, arc(.275, .265, .26, s > 0 ? -.1 : Math.PI - 1.35, 1.45), SHD, R.spine[3], 0, -.075, -.02);
    f1.rotation.x = Math.PI / 2; f1.scale.y = .94; R.open.push({ o: f1, d: V(s, 0, 0) });
    M('flank_lip_f_' + sn, arc(.281, .281, .015, s > 0 ? -.1 : Math.PI - 1.35, 1.45), SHSD, R.spine[3], 0, -.075, .10).rotation.x = Math.PI / 2;
    const f2 = M('flank_plate_r_' + sn, arc(.245, .215, .24, s > 0 ? -.05 : Math.PI - 1.4, 1.4), SHSD, R.spine[1], 0, -.08, -.04);
    f2.rotation.x = Math.PI / 2; f2.scale.y = .92; R.open.push({ o: f2, d: V(s, 0, 0) });
    M('flank_lip_r_' + sn, arc(.25, .25, .014, s > 0 ? -.05 : Math.PI - 1.4, 1.4), SHWD, R.spine[1], 0, -.08, .07).rotation.x = Math.PI / 2;
    const pc = M('pectoral_plate_' + sn, dm(.19, s > 0 ? Math.PI * .5 - .1 : Math.PI * .5 - .9, 1.0, .45, 1.15), SHD, R.spine[3], s * .04, -.05, .05);
    pc.scale.set(1.0, 1.0, .95); R.open.push({ o: pc, d: V(s * .6, 0, .8) });
    M('pectoral_lip_' + sn, tor(.115, .008, 1.5, 12), SHWD, R.spine[3], s * .10, -.10, .21).rotation.set(-.4, s * .5, 0);
    bolts(R.spine[3], 'pec_bolt_' + sn, s * .13, -.03, .21, .06, 6, 'z', .0065);
    M('belly_plate_' + sn, arc(.20, .18, .30, s > 0 ? 2.85 : 2.60, .95), SHWD, R.spine[1], 0, -.10, -.02).rotation.x = Math.PI / 2;
    M('scap_plate_' + sn, pl('sc', [[-.07, -.09], [.075, -.075], [.065, .085], [-.06, .08]], .018, .006, [[0, 0, .05, .016]]), SHSD, yoke, s * .22, .02, -.05).rotation.set(.1, s * .55, 0);
  }
  M('sternum_plate', pl('st', [[-.09, -.10], [.09, -.10], [.07, .10], [-.07, .10]], .02, .006, [[0, .04, .07, .016], [0, -.01, .07, .016]]), SHS, R.spine[2], 0, -.14, .21).rotation.x = 1.35;
  M('heat_slot', pl('hs2', [[-.022, -.008], [.022, -.008], [.022, .008], [-.022, .008]], .006, .002), GB, R.spine[2], 0, -.115, .235).rotation.x = 1.35;
  M('mark_triangle', pl('mk', [[0, .028], [.026, -.016], [-.026, -.016]], .004, .001), BL, R.spine[3], .10, .21, .02).rotation.set(-1.2, .3, 0);
  for (let i = 0; i < 3; i++) M('mark_hazard_' + i, cf(.008, .036, .004, .002), i % 2 ? ACR : BL, R.spine[0], -.13, .06, -.10 + i * .013).rotation.set(-1.4, 0, .5);
  M('mark_serial', cf(.05, .012, .004, .002), BL, yoke, -.17, .06, .05).rotation.set(.1, -.5, 0);

  // ── harness: 34 runs, outside the armour, every end in a port ────────────
  root.updateMatrixWorld(true);
  const harness = [];
  function hose(pobj, n, wp, r, heavy) {
    const pts = wp.map(q => pobj.worldToLocal(V(q[0], q[1], q[2])));
    const cv = new THREE.CatmullRomCurve3(pts);
    const L = cv.getLength();
    const seg = Math.max(14, Math.min(90, Math.round(L * 55)));
    const g = new THREE.TubeGeometry(cv, seg, r, heavy ? 9 : 7, false);
    M(n, g, heavy ? HS : RB, pobj, 0, 0, 0);
    harness.push(L);
    for (let e = 0; e < 2; e++) {
      const p0 = cv.getPointAt(e), tg = cv.getTangentAt(e);
      const pt = M(n + '_port' + e, la([[r * .85, 0], [r * 2.1, 0], [r * 2.1, r * .8], [r * 1.4, r * 1.3], [r * 1.3, r * 2.2], [r * .9, r * 2.2]], 12), MT, pobj, p0.x, p0.y, p0.z);
      pt.quaternion.setFromUnitVectors(YA, e ? tg : tg.clone().negate());
      const fl2 = M(n + '_flange' + e, tp(r * 2.4, r * 2.4, r * .5, 10), MTL, pobj, p0.x, p0.y, p0.z);
      fl2.quaternion.copy(pt.quaternion);
    }
    for (let c = 0; c < 2; c++) {
      const t = c ? .84 : .16, p0 = cv.getPointAt(t), tg = cv.getTangentAt(t);
      const cm = M(n + '_clamp' + c, tor(r * 1.35, r * .40, Math.PI * 2, 10), MTL, pobj, p0.x, p0.y, p0.z);
      cm.quaternion.setFromUnitVectors(ZA, tg);
      const bk = M(n + '_clampfoot' + c, cf(r * 1.4, r * 1.0, r * .9, r * .2), BL, pobj, p0.x, p0.y, p0.z);
      bk.quaternion.copy(cm.quaternion); bk.translateY(-r * 1.7);
    }
    if (heavy) for (let i = 0; i < 7; i++) {
      const t = .2 + i * .095, p0 = cv.getPointAt(t), tg = cv.getTangentAt(t);
      const rib = M(n + '_rib' + i, tor(r * 1.12, r * .28, Math.PI * 2, 9), RB, pobj, p0.x, p0.y, p0.z);
      rib.quaternion.setFromUnitVectors(ZA, tg);
    }
  }
  for (const s of [-1, 1]) {
    const sn = s > 0 ? 'R' : 'L', A = R.arms[s > 0 ? 1 : 0], Lg = R.legs[s > 0 ? 1 : 0];
    hose(R.spine[2], 'hose_flank_up_' + sn, [[s * .30, 1.00, .24], [s * .40, .98, .10], [s * .425, .90, -.10], [s * .385, .84, -.30], [s * .26, .80, -.46]], .038, 1);
    hose(R.spine[2], 'hose_flank_lo_' + sn, [[s * .24, .88, .32], [s * .385, .80, .10], [s * .40, .72, -.14], [s * .32, .70, -.36], [s * .22, .74, -.50]], .032, 1);
    hose(yoke, 'hose_nape_' + sn, [[s * .12, 1.02, .44], [s * .16, 1.17, .30], [s * .21, 1.10, .14], [s * .225, 1.02, .02]], .030, 0);
    hose(yoke, 'hose_napewire_' + sn, [[s * .16, .95, .52], [s * .27, 1.00, .40], [s * .305, 1.02, .26], [s * .30, .97, .14]], .013, 0);
    hose(A.up, 'hose_shoulder_' + sn, [[s * .28, .94, .06], [s * .385, 1.09, .16], [s * .465, .92, .26], [s * .525, .66, .28], [s * .475, .40, .30]], .030, 0);
    hose(A.up, 'hose_upperarm_' + sn, [[s * .425, .94, .14], [s * .505, .74, .18], [s * .47, .54, .24]], .034, 1);
    hose(A.up, 'hose_elbowloop_' + sn, [[s * .44, .60, .20], [s * .535, .50, .10], [s * .47, .40, .22]], .024, 0);
    hose(A.el, 'hose_forearm_' + sn, [[s * .45, .50, .34], [s * .505, .32, .38], [s * .45, .16, .38]], .028, 0);
    hose(A.hd, 'hose_wrist_' + sn, [[s * .44, .16, .42], [s * .465, .09, .445], [s * .43, .05, .40]], .012, 0);
    hose(Lg.hp, 'hose_hipknee_' + sn, [[s * .30, .76, -.44], [s * .365, .60, -.32], [s * .335, .45, -.24]], .030, 1);
    hose(Lg.hp, 'hose_leglong_' + sn, [[s * .26, .80, -.50], [s * .385, .62, -.30], [s * .375, .36, -.28], [s * .30, .18, -.32]], .026, 0);
    hose(Lg.hp, 'hose_kneeloop_' + sn, [[s * .30, .50, -.18], [s * .375, .42, -.08], [s * .30, .34, -.20]], .022, 0);
    hose(Lg.kn, 'hose_shank_' + sn, [[s * .30, .36, -.38], [s * .315, .22, -.42], [s * .25, .10, -.34]], .026, 0);
    hose(R.spine[3], 'hose_chest_' + sn, [[s * .26, .96, .28], [s * .10, .84, .43], [-s * .12, .78, .41], [-s * .24, .84, .28]], .028, 0);
    hose(R.spine[1], 'hose_belly_' + sn, [[s * .22, .70, .24], [s * .145, .59, .02], [s * .10, .61, -.24], [s * .18, .72, -.44]], .030, 1);
    hose(R.spine[2], 'hose_crest_a_' + sn, [[s * .07, 1.11, .26], [s * .06, 1.005, .04], [s * .05, .925, -.20], [s * .05, .84, -.48]], .014, 0);
    hose(R.spine[2], 'hose_crest_b_' + sn, [[s * .115, 1.09, .245], [s * .10, .995, .02], [s * .085, .915, -.22], [s * .075, .835, -.47]], .012, 0);
  }

  // ── snapshot rest ────────────────────────────────────────────────────────
  joints.forEach(j => { j.userData.rp = j.position.clone(); j.userData.rr = j.rotation.clone(); });
  R.open.forEach(o => { o.p = o.o.position.clone(); });
  const A0 = R.arms[0], A1 = R.arms[1], L0 = R.legs[0], L1 = R.legs[1];

  // ── pose ─────────────────────────────────────────────────────────────────
  const c01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const sst = (a, b, x) => { const k = c01((x - a) / (b - a || 1e-6)); return k * k * (3 - 2 * k); };
  const lp = (a, b, k) => a + (b - a) * k;
  function cyc(p, duty) {
    p = p - Math.floor(p);
    if (p < duty) return { a: 1 - 2 * (p / duty), f: 0, l: 0 };
    const k = (p - duty) / (1 - duty), e = k * k * (3 - 2 * k);
    return { a: -1 + 2 * e, f: Math.sin(Math.PI * k), l: Math.sin(Math.PI * k) };
  }
  root.userData.pose = (s) => {
    s = s || {};
    const t = s.t || 0, sp = Math.max(0, Math.min(6, s.speed || 0)), str = s.stride || 0;
    const turn = Math.max(-1, Math.min(1, s.turn || 0));
    const gr = s.grounded === false ? 0 : 1;
    const hl = s.health === undefined ? 1 : s.health;
    const act = s.action || null, ph = c01(s.phase || 0);
    joints.forEach(j => { j.position.copy(j.userData.rp); j.rotation.copy(j.userData.rr); });
    R.open.forEach(o => o.o.position.copy(o.p));
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
    let bY = 0, bZ = 0, bP = 0, bR = 0, bW = 0;
    const spP = [0, 0, 0, 0, 0, 0], spY = [0, 0, 0, 0, 0, 0], spR = [0, 0, 0, 0, 0, 0];
    let nP = 0, nY = 0, hP = 0, hY = 0, hR = 0, jw = .04, opn = 0, spr = 0;
    const AR = [{ x: 0, y: 0, z: 0, e: 0, w: 0, c: 0 }, { x: 0, y: 0, z: 0, e: 0, w: 0, c: 0 }];
    const LR = [{ x: 0, z: 0, k: 0, a: 0, c: 0 }, { x: 0, z: 0, k: 0, a: 0, c: 0 }];
    const br = Math.sin(t * 1.15), br2 = Math.sin(t * 1.15 + 1.1);
    // idle hardware
    spP[2] += br * .012; spP[3] += br2 * .010; spP[4] -= br * .008;
    nP += br2 * .015; hY += Math.sin(t * .37) * .13; hP += Math.sin(t * .53) * .05;
    hR += Math.sin(t * .29) * .04; bR += Math.sin(t * .31) * .012; bY += br * .004;
    AR[0].e += br * .02; AR[1].e -= br2 * .02;
    if (!act) {
      const mv = sst(.02, .30, sp), run = sst(1.2, 2.4, sp), gal = sst(2.6, 5.0, sp);
      const dW = lp(.68, .40, sst(.5, 6, sp));
      const A = (.15 + .058 * sp) * mv, A2 = (.13 + .050 * sp) * mv;
      const offW = [0, .5, .25, .75], offR = [0, .12, .55, .67];
      const lim = (i) => { const w = cyc(str + offW[i], dW), r2 = cyc(str + offR[i], Math.max(.3, dW - .2)); return { a: lp(w.a, r2.a, run), f: lp(w.f, r2.f, run), l: lp(w.l, r2.l, run) }; };
      const fL = lim(0), fR = lim(1), hL = lim(2), hR2 = lim(3);
      const fr2 = [fL, fR], hr2 = [hL, hR2];
      for (let i = 0; i < 2; i++) {
        AR[i].x += -A * fr2[i].a * gr; AR[i].e += -(.55 * fr2[i].f + .06 * mv) * gr;
        AR[i].w += (.30 * fr2[i].f) * gr; AR[i].c += .12 * fr2[i].f * mv;
        LR[i].x += -A2 * hr2[i].a * gr; LR[i].k += (.62 * hr2[i].f + .07 * mv) * gr;
        LR[i].a += (-.30 * hr2[i].f) * gr; LR[i].c += .10 * hr2[i].f;
      }
      const bob = Math.cos(str * Math.PI * 4) * (.012 + .022 * sst(0, 6, sp)) * mv * gr;
      bY += -bob; bP += Math.sin(str * Math.PI * 4 + .7) * .045 * mv * gal * gr;
      spP[2] += Math.sin(str * Math.PI * 4) * .05 * gal; spP[3] += Math.sin(str * Math.PI * 4 + .4) * .05 * gal;
      // crouched creep at half a body length
      const creep = mv * (1 - sst(.45, 1.1, sp));
      bY -= .055 * creep; spP[3] += .07 * creep; nP += .14 * creep;
      LR[0].k += .18 * creep; LR[1].k += .18 * creep; LR[0].x -= .10 * creep; LR[1].x -= .10 * creep;
      // sprint: long, flat, head in line with the spine
      const flat = sst(2.8, 6, sp);
      bY -= .055 * flat; bP += .10 * flat; nP += .22 * flat; hP -= .10 * flat;
      spP[4] -= .10 * flat; AR[0].z -= .05 * flat; AR[1].z += .05 * flat;
      if (!gr) {
        for (let i = 0; i < 2; i++) { AR[i].x = -.75; AR[i].e = -.55; AR[i].w = .35; AR[i].c = -.25; LR[i].x = .42; LR[i].k = .95; LR[i].a = -.30; LR[i].c = .3; }
        bP = -.10; spP[2] -= .09; spP[3] -= .07; nP -= .12; bY += .02;
        AR[0].z = -.16; AR[1].z = .16;
      }
    }
    // turn overlay
    if (turn) {
      for (let i = 1; i < 6; i++) { spY[i] += turn * .055; spR[i] += -turn * .022; }
      hY += turn * .34; hR += -turn * .12; bR += -turn * .10; bW += turn * .05;
      const insi = turn < 0 ? 0 : 1, outi = 1 - insi, m = Math.abs(turn);
      AR[insi].e -= .22 * m; AR[insi].x += .16 * m; AR[outi].x -= .18 * m; AR[outi].e -= .05 * m;
      LR[insi].k += .18 * m; LR[outi].x -= .12 * m;
    }
    // action
    if (act === 'attack') {
      const w = sst(0, .34, ph), c = sst(.34, .58, ph), r = sst(.60, 1, ph), g2 = (1 - r);
      bY += (.13 * w - .20 * c) * g2; bP += (-.28 * w + .48 * c) * g2; nP += (-.20 * w + .40 * c) * g2;
      jw = .15 * w + .8 * c * (1 - r * .8);
      for (let i = 0; i < 2; i++) {
        AR[i].x += (-1.55 * w + 2.0 * c) * g2; AR[i].e += (-1.0 * w + .85 * c) * g2;
        AR[i].c += (.4 * w + .5 * c) * g2; AR[i].z += (i ? .2 : -.2) * w * g2;
        LR[i].k += .35 * w * g2; LR[i].x -= .12 * c * g2;
      }
      spP[3] += (-.22 * w + .30 * c) * g2; spP[4] += (-.16 * w + .28 * c) * g2;
    } else if (act === 'fire') {
      const a = sst(0, .40, ph), rel = sst(.40, .56, ph), rec = sst(.56, 1, ph), g2 = 1 - rec;
      for (let i = 1; i < 6; i++) spY[i] += (.09 * a - .11 * rel) * g2;
      AR[1].x += (1.25 * a - 2.5 * rel) * g2; AR[1].e += (-1.5 * a + 1.35 * rel) * g2;
      AR[1].c += (.6 * a - .55 * rel) * g2; AR[0].x += (-.30 * a + .25 * rel) * g2; AR[0].e += -.5 * a * g2;
      hY += (-.18 * a + .10 * rel) * g2; bP += (.06 * rel) * g2; bR += (-.05 * a) * g2;
      LR[0].k += .18 * a * g2; LR[1].k += .12 * a * g2; jw = .18 * a;
      bZ += (-.02 * a + .03 * rel) * g2;
    } else if (act === 'hit') {
      const imp = Math.exp(-5.5 * ph) * Math.sin(ph * 15.0);
      bR += imp * .22; bW += imp * .12; bY -= Math.exp(-6 * ph) * .05;
      nP += -imp * .30; hY += imp * .28; hR += imp * .20;
      for (let i = 1; i < 6; i++) spY[i] += imp * .05;
      AR[0].x += imp * .35; AR[1].x -= imp * .30; AR[0].e -= Math.abs(imp) * .3; AR[1].e -= Math.abs(imp) * .2;
      LR[0].k += Math.abs(imp) * .25; LR[1].k += Math.abs(imp) * .18; jw = Math.abs(imp) * .45;
    } else if (act === 'block') {
      const k = sst(0, .22, ph) * (1 - sst(.80, 1, ph));
      bY -= .16 * k; bZ -= .06 * k; bP += .12 * k;
      spP[3] += .10 * k; spP[4] += .12 * k; nP += .40 * k; hP += .12 * k;
      for (let i = 0; i < 2; i++) {
        AR[i].x += -1.25 * k; AR[i].e += -1.95 * k; AR[i].z += (i ? -.42 : .42) * k;
        AR[i].c += .55 * k; AR[i].w += .3 * k; LR[i].k += .45 * k; LR[i].x += .16 * k;
      }
      spr += .5 * k;
    } else if (act === 'gather' || act === 'deposit') {
      const rev = act === 'deposit';
      const q = rev ? 1 - ph : ph;
      const dn = sst(0, .42, q), cls = sst(.42, .60, q), up = sst(.60, 1, q);
      bP += (.30 * dn - .22 * up); bY += (-.10 * dn + .06 * up); nP += (.45 * dn - .30 * up);
      AR[1].x += (-.55 * dn + .35 * up); AR[1].e += (.35 * dn - 1.55 * up);
      AR[1].c += rev ? (1 - cls) * .9 : (cls * .95 - .1 * dn);
      AR[1].w += .25 * dn; AR[0].e -= .35 * dn; LR[0].k += .30 * dn; LR[1].k += .30 * dn;
      LR[0].x -= .12 * dn; LR[1].x -= .12 * dn; hP += .12 * dn;
    } else if (act === 'eat') {
      const dn = sst(0, .18, ph) * (1 - sst(.86, 1, ph));
      bP += .18 * dn; nP += .55 * dn; hP += .10 * dn; bY -= .06 * dn;
      AR[1].x += -.95 * dn; AR[1].e += -1.6 * dn; AR[1].c += .85 * dn; AR[1].z += -.25 * dn;
      LR[0].k += .28 * dn; LR[1].k += .28 * dn;
      jw = dn * (.30 + .30 * Math.sin(ph * Math.PI * 6));
      hP += Math.sin(ph * Math.PI * 6) * .05 * dn;
    } else if (act === 'drink') {
      const dn = sst(0, .25, ph) * (1 - sst(.80, 1, ph));
      bP += .26 * dn; bY -= .12 * dn; nP += .85 * dn; hP += .12 * dn;
      LR[0].k += .42 * dn; LR[1].k += .42 * dn; LR[0].x -= .10 * dn; LR[1].x -= .10 * dn;
      AR[0].e -= .30 * dn; AR[1].e -= .30 * dn; AR[0].x += .18 * dn; AR[1].x += .18 * dn;
      jw = .10 * dn + Math.sin(t * 2.0) * .02 * dn;
    } else if (act === 'jump') {
      const ld = sst(0, .34, ph), ex = sst(.34, .74, ph), hd2 = sst(.74, 1, ph);
      bY += -.20 * ld + .32 * ex; bP += .16 * ld - .22 * ex;
      for (let i = 0; i < 2; i++) {
        LR[i].k += .85 * ld - .95 * ex; LR[i].x += .30 * ld - .45 * ex; LR[i].a += -.35 * ld + .40 * ex;
        AR[i].x += .55 * ld - 1.55 * ex; AR[i].e += -1.0 * ld + .55 * ex; AR[i].c += .35 * ld;
      }
      nP += .30 * ld - .35 * ex; spP[3] += .16 * ld - .18 * ex; jw = .25 * ex * (1 - hd2 * .5);
    } else if (act === 'land') {
      const rc = sst(0, .28, ph), cp = sst(.28, .55, ph), ps = sst(.55, 1, ph);
      bY += -.05 * rc - .24 * cp + .28 * ps; bP += -.10 * rc + .22 * cp - .12 * ps;
      for (let i = 0; i < 2; i++) {
        AR[i].x += -.85 * rc + .70 * cp - .05 * ps; AR[i].e += -.35 * rc - 1.05 * cp + 1.25 * ps;
        AR[i].c += .3 * cp; LR[i].x += .28 * rc - .10 * cp; LR[i].k += -.15 * rc + .95 * cp - .80 * ps;
        LR[i].a += -.25 * cp + .20 * ps;
      }
      nP += -.12 * rc + .38 * cp - .25 * ps; spP[2] += .14 * cp - .10 * ps;
    } else if (act === 'signal') {
      const up = sst(0, .22, ph), bt = sst(.22, .30, ph) * (1 - sst(.72, .82, ph)), dn = sst(.80, 1, ph), g2 = 1 - dn;
      bY += (.16 * up) * g2; bP += (-.30 * up) * g2; spP[3] += -.18 * up * g2; spP[4] += -.16 * up * g2;
      nP += -.32 * up * g2; hP += -.10 * up * g2; jw = (.20 + .72 * up) * g2;
      const beat = Math.sin(ph * Math.PI * 6.5);
      for (let i = 0; i < 2; i++) {
        const of = i ? 0 : Math.PI;
        AR[i].x += (-1.15 + .42 * Math.sin(ph * Math.PI * 6.5 + of)) * bt;
        AR[i].e += (-1.95 - .25 * Math.sin(ph * Math.PI * 6.5 + of)) * bt;
        AR[i].z += (i ? -.30 : .30) * bt; AR[i].c += .5 * bt;
        LR[i].k += .22 * up * g2;
      }
      bR += beat * .035 * bt; spr += up * g2; opn += .35 * up * g2;
      hY += Math.sin(ph * Math.PI * 3) * .10 * g2;
    } else if (act === 'sleep' || act === 'wake') {
      const q = act === 'wake' ? 1 - ph : ph;
      const d1 = sst(0, .52, q), d2 = sst(.45, .84, q);
      bY += -.42 * d1; bP += .14 * d1 - .06 * d2; bR += .16 * d2; bZ += -.04 * d1;
      for (let i = 0; i < 2; i++) {
        LR[i].k += 1.15 * d1; LR[i].x += .55 * d1; LR[i].a += -.55 * d1; LR[i].z += (i ? .22 : -.22) * d1;
        AR[i].e += -1.55 * d1; AR[i].x += .30 * d1 - .25 * d2; AR[i].c += .55 * d1; AR[i].z += (i ? .18 : -.18) * d1;
      }
      for (let i = 1; i < 6; i++) spP[i] += .11 * d2;
      nP += .55 * d1 + .18 * d2; hP += .18 * d2; hY += .28 * d2; jw = .03;
      bY += Math.sin(t * .7) * .006 * d2;
    } else if (act === 'die') {
      const st1 = sst(0, .24, ph), st2 = sst(.22, .62, ph), st3 = sst(.55, 1, ph);
      bY += .06 * st1 - .66 * st2; bP += -.22 * st1 + .52 * st2 - .10 * st3;
      bR += 1.15 * st3; bW += .25 * st3; bZ += .05 * st2;
      for (let i = 1; i < 6; i++) { spP[i] += .10 * st2 - .05 * st3; spY[i] += .06 * st3; }
      AR[0].x += -.85 * st1 + .95 * st2; AR[1].x += .35 * st1 + .55 * st2;
      AR[0].e += -.55 * st1 - .35 * st3; AR[1].e += -.25 * st2 - .55 * st3;
      AR[0].z += -.55 * st3; AR[1].z += .35 * st3; AR[0].c -= .35 * st3; AR[1].c -= .35 * st3;
      for (let i = 0; i < 2; i++) { LR[i].k += .95 * st2 - .35 * st3; LR[i].x += .35 * st2; LR[i].z += (i ? .45 : -.28) * st3; LR[i].a += -.35 * st2; }
      nP += .28 * st1 + .55 * st2; hP += .25 * st3; hY += .35 * st3; hR += .3 * st3;
      jw = .45 * st1 + .22 * st2 - .15 * st3;
    } else if (act === 'evolve') {
      const br3 = sst(0, .24, ph), op = sst(.24, .46, ph) * (1 - sst(.70, .95, ph)), cls = sst(.88, 1, ph);
      bY += -.10 * br3 + .05 * op; bP += .12 * br3 - .14 * op;
      opn += op; spr += op;
      const trem = Math.sin(ph * 90) * .01 * op;
      bR += trem; hR += trem * 2;
      for (let i = 0; i < 2; i++) {
        LR[i].k += .38 * br3 + .10 * op; LR[i].z += (i ? .18 : -.18) * op; LR[i].x += .12 * br3;
        AR[i].x += .22 * br3 - .30 * op; AR[i].e += -.35 * br3 - .30 * op; AR[i].z += (i ? -.34 : .34) * op; AR[i].c += .25 * op;
      }
      for (let i = 1; i < 6; i++) spP[i] += .05 * br3 - .06 * op;
      nP += .30 * br3 - .40 * op; jw = .18 * br3 + .55 * op; hP += -.15 * op;
      opn *= (1 - cls);
    }
    // hurt overlay
    const hu = c01((.65 - hl) / .5);
    if (hu > 0) {
      const trem = Math.sin(t * 9.3) * .012 * hu;
      bR += .10 * hu + trem; bY -= .05 * hu; bP += .07 * hu;
      for (let i = 1; i < 6; i++) { spP[i] += .045 * hu; spR[i] += .02 * hu; }
      nP += .30 * hu; hP += .16 * hu; hY += .10 * hu; hR += .12 * hu;
      AR[1].e -= .45 * hu; AR[1].x += .20 * hu; AR[1].z += .10 * hu; AR[0].e -= .12 * hu;
      LR[1].k += .28 * hu; LR[1].x += .10 * hu; jw = Math.max(jw, .12 * hu);
    }
    // apply
    rig.position.set(0, bY, bZ); rig.rotation.set(bP, bW, bR);
    for (let i = 0; i < 6; i++) {
      const g = R.spine[i];
      g.rotation.set(g.userData.rr.x + spP[i], g.userData.rr.y + spY[i], g.userData.rr.z + spR[i]);
      if (opn) g.position.copy(g.userData.rp).multiplyScalar(1 + .10 * opn);
    }
    neck.rotation.set(neck.userData.rr.x + nP, neck.userData.rr.y + nY, neck.userData.rr.z);
    head.rotation.set(head.userData.rr.x + hP, head.userData.rr.y + hY, head.userData.rr.z + hR);
    jaw.rotation.set(jaw.userData.rr.x + Math.max(0, jw) * .95, 0, 0);
    for (let i = 0; i < 2; i++) {
      const a = R.arms[i], q = AR[i];
      a.up.rotation.set(a.up.userData.rr.x + q.x, q.y, a.up.userData.rr.z + q.z);
      a.el.rotation.set(a.el.userData.rr.x + q.e, 0, 0);
      a.wr.rotation.set(a.wr.userData.rr.x + q.w, 0, 0);
      for (let d = 0; d < a.dig.length; d++) {
        const ch = a.dig[d], f = d === 4 ? .7 : 1;
        ch[0].rotation.x = ch[0].userData.rr.x + q.c * .55 * f;
        if (ch[1]) ch[1].rotation.x = ch[1].userData.rr.x + q.c * .75 * f;
        if (ch[2]) ch[2].rotation.x = ch[2].userData.rr.x + q.c * .5 * f;
      }
      const l = R.legs[i], w = LR[i];
      l.hp.rotation.set(l.hp.userData.rr.x + w.x, 0, l.hp.userData.rr.z + w.z);
      l.kn.rotation.set(l.kn.userData.rr.x + w.k, 0, 0);
      l.an.rotation.set(l.an.userData.rr.x + w.a, 0, 0);
      for (let d = 0; d < l.toes.length; d++) {
        const ch = l.toes[d];
        ch[0].rotation.x = ch[0].userData.rr.x - w.c * .45;
        if (ch[1]) ch[1].rotation.x = ch[1].userData.rr.x - w.c * .35;
      }
    }
    if (opn || spr) {
      const k = opn * .055 + spr * .025;
      R.open.forEach(o => { o.o.position.set(o.p.x + o.d.x * k, o.p.y + o.d.y * k, o.p.z + o.d.z * k); });
    }
  };
  root.userData.pose({ speed: 0, stride: 0, t: 0, dt: 0 });
  root.userData.update = (t, dt) => root.userData.pose({ speed: 0, stride: 0, t: t, dt: dt, health: 1 });
  return root;
}