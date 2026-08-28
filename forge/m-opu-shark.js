```javascript
"use strict";
function build(THREE, TSL) {
  // ONE QUALITY: SPEED — a six-metre torpedo of pressed plate, faired and swept.
  /* BRIEF — as before, plus PASS 6 rebuilt: the harness now rides OUTSIDE the
     armour. Three parallel trunk lines a side ride the seam between the top shell
     and the flank shell, over the shoulder, down every tail segment and up the
     fins — clamped to the frame at intervals, bowing clear of the hull between
     clamps, split at every joint into ports that face each other. */
  const F = TSL;
  const PI = Math.PI, TAU = Math.PI * 2;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const cl = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ss = (a, b, x) => { const u = cl((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

  /* ---------------- materials ---------------- */
  const cv = (hex) => { const c = new THREE.Color(hex); return F.vec3(c.r, c.g, c.b); };
  let useNodes = !!THREE.MeshStandardNodeMaterial, h31, vnoise, fbm;
  try {
    h31 = (p) => F.fract(F.sin(F.dot(p, F.vec3(127.1, 311.7, 74.7))).mul(43758.5453));
    vnoise = (p) => {
      const i = F.floor(p), f = F.fract(p);
      const u = f.mul(f).mul(F.float(3.0).sub(f.mul(2.0)));
      const c = (a, b, d) => h31(i.add(F.vec3(a, b, d)));
      const x00 = F.mix(c(0, 0, 0), c(1, 0, 0), u.x), x10 = F.mix(c(0, 1, 0), c(1, 1, 0), u.x);
      const x01 = F.mix(c(0, 0, 1), c(1, 0, 1), u.x), x11 = F.mix(c(0, 1, 1), c(1, 1, 1), u.x);
      return F.mix(F.mix(x00, x10, u.y), F.mix(x01, x11, u.y), u.z);
    };
    fbm = (p) => vnoise(p).mul(0.54)
      .add(vnoise(p.mul(2.07).add(F.vec3(11.3, 4.7, 19.1))).mul(0.29))
      .add(vnoise(p.mul(4.13).add(F.vec3(3.1, 27.7, 8.3))).mul(0.17));
  } catch (e) { useNodes = false; }

  function wearMat(hex, metal, rough, o) {
    o = o || {}; let mat = null;
    if (useNodes) {
      try {
        mat = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(hex), metalness: metal, roughness: rough });
        const P = F.positionLocal, N = F.normalLocal, na = F.abs(F.normalLocal);
        const mx = F.max(F.max(na.x, na.y), na.z);
        const bevel = F.oneMinus(F.smoothstep(0.70, 0.97, mx));
        const down = F.oneMinus(F.smoothstep(-0.65, 0.15, N.y));
        const up = F.smoothstep(0.05, 0.85, N.y);
        const ridge = F.oneMinus(F.abs(fbm(P.mul(o.f || 9.0)).mul(2.0).sub(1.0)));
        const chip = F.smoothstep(0.74, 0.98, ridge).mul(F.float(0.30).add(bevel.mul(0.70)))
          .mul(o.chip === undefined ? 1.0 : o.chip);
        const streak = F.smoothstep(0.54, 0.96, fbm(F.vec3(P.x.mul(15.0), P.y.mul(1.15), P.z.mul(15.0))));
        const rust = streak.mul(F.float(0.28).add(down.mul(0.72))).mul(o.rust === undefined ? 1.0 : o.rust);
        const broad = fbm(P.mul(1.6));
        let col = cv(hex).mul(F.float(0.87).add(broad.mul(0.26)));
        col = F.mix(col, cv('#6B665E'), chip.mul(0.9));
        col = F.mix(col, cv('#5A3720'), rust.mul(0.5));
        col = col.mul(F.oneMinus(down.mul(0.30)));
        col = F.mix(col, col.mul(1.16), up.mul(0.45));
        mat.colorNode = col;
        mat.roughnessNode = F.clamp(F.float(rough).add(up.mul(0.13)).add(down.mul(0.07)).sub(chip.mul(0.10)).add(broad.mul(0.05)), 0.06, 1.0);
        mat.metalnessNode = metal > 0.4 ? F.clamp(F.float(metal).sub(rust.mul(0.22)), 0.0, 1.0)
          : F.clamp(F.float(metal).add(chip.mul(0.55)), 0.0, 1.0);
      } catch (e) { mat = null; }
    }
    if (!mat) mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), metalness: metal, roughness: rough });
    if (o.side) mat.side = o.side;
    return mat;
  }
  const DS = THREE.DoubleSide;
  const M = {
    shell: wearMat('#D8D2C6', 0.14, 0.58, { f: 9 }),
    shellD: wearMat('#D8D2C6', 0.14, 0.58, { f: 9, side: DS }),
    shellSh: wearMat('#C9C2B4', 0.12, 0.62, { f: 11, chip: 1.1, rust: 1.2, side: DS }),
    shellW: wearMat('#B5AC9C', 0.18, 0.60, { f: 8, chip: 1.35, rust: 1.1, side: DS }),
    metal: wearMat('#55524C', 0.82, 0.55, { f: 13, chip: 0.35, rust: 0.8 }),
    metalHi: wearMat('#6B665E', 0.88, 0.46, { f: 16, chip: 0.30, rust: 0.6 }),
    blued: wearMat('#3E3A34', 0.80, 0.60, { f: 12, chip: 0.22, rust: 0.7 }),
    bronze: wearMat('#4A4238', 0.86, 0.50, { f: 14, chip: 0.30, rust: 1.2 }),
    rubber: wearMat('#1E1D1B', 0.02, 0.93, { f: 20, chip: 0.0, rust: 0.15 }),
    tooth: wearMat('#CFC8BA', 0.46, 0.34, { f: 18, chip: 0.5, rust: 0.5, side: DS }),
    accent: wearMat('#C2521E', 0.10, 0.60, { f: 10, chip: 1.5, rust: 1.4 }),
    glass: new THREE.MeshStandardMaterial({ color: new THREE.Color('#08090A'), metalness: 0.12, roughness: 0.08 })
  };
  function emiss(hex) {
    let m = null;
    if (useNodes) { try { m = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(hex), roughness: 0.4, metalness: 0.1 }); m.emissiveNode = cv(hex).mul(1.6); } catch (e) { m = null; } }
    if (!m) m = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), emissive: new THREE.Color(hex), emissiveIntensity: 1.4, roughness: 0.4 });
    return m;
  }
  M.lampA = emiss('#2E6E78'); M.lampB = emiss('#8A5A18');

  /* ---------------- geometry helpers ---------------- */
  function chamShape(w, h, c) {
    const s = new THREE.Shape(), x = w / 2, y = h / 2;
    s.moveTo(-x + c, -y); s.lineTo(x - c, -y); s.lineTo(x, -y + c); s.lineTo(x, y - c);
    s.lineTo(x - c, y); s.lineTo(-x + c, y); s.lineTo(-x, y - c); s.lineTo(-x, -y + c);
    s.closePath(); return s;
  }
  const gc = {};
  function blockGeo(w, h, d, c, b) {
    c = c === undefined ? Math.min(w, h) * 0.22 : c; b = b === undefined ? Math.min(w, h, d) * 0.10 : b;
    const k = 'B' + [w, h, d, c, b].map(v => v.toFixed(3)).join('_');
    if (gc[k]) return gc[k];
    const g = new THREE.ExtrudeGeometry(chamShape(w, h, c), { depth: d, bevelEnabled: true, bevelSize: b, bevelThickness: b, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -d / 2); gc[k] = g; return g;
  }
  function latheZ(prof, seg) { const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg || 14); g.rotateX(PI / 2); return g; }
  function tube(rT, rB, len, seg) { const g = new THREE.CylinderGeometry(rT, rB, len, seg || 8); g.rotateX(PI / 2); return g; }
  function wrapShell(rT, rB, len, ca, span, seg) { const g = new THREE.CylinderGeometry(rT, rB, len, seg || 20, 1, true, ca - span / 2, span); g.rotateX(PI / 2); return g; }
  function lipGeo(r, tk, ca, span) { const g = new THREE.TorusGeometry(r, tk, 5, 18, span); g.rotateZ(ca - span / 2 - PI / 2); return g; }
  function mk(geo, mat, name, parent, x, y, z) {
    const m = new THREE.Mesh(geo, mat); m.name = name;
    if (x !== undefined) m.position.set(x, y, z);
    if (parent) parent.add(m);
    return m;
  }
  const g_bolt = new THREE.CylinderGeometry(0.020, 0.024, 0.016, 6); g_bolt.rotateX(PI / 2);
  const g_ring = new THREE.TorusGeometry(0.030, 0.009, 5, 10);
  function bolt(parent, name, x, y, z, sc, rx, ry, mat) {
    const m = mk(g_bolt, mat || M.metalHi, name, parent, x, y, z);
    m.scale.setScalar(sc || 0.8); m.rotation.set(rx || 0, ry || 0, 0); return m;
  }
  function boltRingZ(parent, name, r, n, z, sc, mat) {
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; bolt(parent, name + i, Math.cos(a) * r, Math.sin(a) * r, z, sc, 0, 0, mat); }
  }
  function boltRow(parent, name, x0, y0, z0, x1, y1, z1, n, sc, rx, ry) {
    for (let i = 0; i < n; i++) { const u = n === 1 ? 0.5 : i / (n - 1); bolt(parent, name + i, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u, sc, rx, ry); }
  }
  function ram(parent, name, len, r, mat) {
    const g = new THREE.Group(); g.name = name; const bl = len * 0.60;
    mk(latheZ([[0, 0], [r * 0.55, 0], [r, r * 0.30], [r, bl - r * 0.35], [r * 0.88, bl - r * 0.2], [r * 0.88, bl], [r * 0.62, bl + r * 0.12], [0, bl + r * 0.12]], 12), mat || M.metal, name + '_barrel', g);
    mk(latheZ([[r * 0.62, bl + r * 0.10], [r * 0.98, bl + r * 0.10], [r * 0.98, bl + r * 0.26], [r * 0.62, bl + r * 0.26]], 10), M.metalHi, name + '_gland', g);
    mk(tube(r * 0.34, r * 0.34, len - bl, 10), M.metalHi, name + '_rod', g, 0, 0, bl + (len - bl) / 2);
    mk(latheZ([[r * 0.34, 0], [r * 0.68, 0], [r * 0.68, r * 0.55], [r * 0.34, r * 0.55]], 10), M.rubber, name + '_boot', g, 0, 0, bl + r * 0.22);
    mk(blockGeo(r * 1.1, r * 0.40, r * 1.0, r * 0.12, r * 0.06), M.metalHi, name + '_clevis_a', g, 0, r * 0.32, len - r * 0.3);
    mk(blockGeo(r * 1.1, r * 0.40, r * 1.0, r * 0.12, r * 0.06), M.metalHi, name + '_clevis_b', g, 0, -r * 0.32, len - r * 0.3);
    mk(new THREE.CylinderGeometry(r * 0.16, r * 0.16, r * 1.4, 8), M.blued, name + '_pin', g, 0, 0, len - r * 0.3);
    bolt(g, name + '_bolt', 0, r * 0.7, r * 0.35, 0.6, PI / 2, 0);
    parent.add(g); return g;
  }
  function sprocket(parent, name, r, n, th, mat) {
    const g = new THREE.Group(); g.name = name;
    mk(latheZ([[0, -th / 2], [r * 0.86, -th / 2], [r * 0.86, th / 2], [r * 0.42, th / 2], [r * 0.42, th * 1.15], [r * 0.20, th * 1.15], [r * 0.20, -th * 1.05], [r * 0.42, -th * 1.05], [r * 0.42, -th / 2], [0, -th / 2]], 16), mat || M.metalHi, name + '_disc', g);
    const tg = blockGeo(r * 0.20, r * 0.20, th * 0.9, r * 0.05, r * 0.03);
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const m = mk(tg, mat || M.metal, name + '_t' + i, g, Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94, 0); m.rotation.z = a; }
    boltRingZ(g, name + '_b', r * 0.60, 5, th * 0.65, 0.5, M.blued);
    parent.add(g); return g;
  }
  function race(parent, name, r, th, mat) {
    const g = new THREE.Group(); g.name = name;
    mk(latheZ([[r * 0.18, -th * 0.6], [r, -th * 0.6], [r, th * 0.2], [r * 0.72, th * 0.35], [r * 0.72, th * 0.7], [r * 0.34, th * 0.7], [r * 0.34, th * 0.2], [r * 0.18, th * 0.2]], 18), mat || M.bronze, name + '_race', g);
    mk(latheZ([[0, -th * 0.95], [r * 0.30, -th * 0.95], [r * 0.30, th * 1.0], [0, th * 1.0]], 12), M.blued, name + '_hub', g);
    boltRingZ(g, name + '_b', r * 0.84, 6, th * 0.30, 0.55, M.metalHi);
    parent.add(g); return g;
  }
  function chainRun(parent, name, pts, w, mat) {
    const cu = new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], p[1], p[2])));
    const n = Math.max(4, Math.round(cu.getLength() / (w * 1.15)));
    const g = new THREE.Group(); g.name = name;
    const lg = blockGeo(w, w * 0.46, w * 1.02, w * 0.16, w * 0.05);
    const pg = new THREE.CylinderGeometry(w * 0.15, w * 0.15, w * 1.3, 6);
    const fw = V3(0, 0, 1);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, p = cu.getPointAt(u), tg = cu.getTangentAt(u);
      const m = mk(lg, mat || M.blued, name + '_l' + i, g, p.x, p.y, p.z);
      m.quaternion.setFromUnitVectors(fw, tg);
      if (i % 2) m.rotateZ(PI / 2);
      if (i % 2 === 0) { const pin = mk(pg, M.metalHi, name + '_p' + i, g, p.x, p.y, p.z); pin.quaternion.copy(m.quaternion); }
    }
    parent.add(g); return g;
  }
  function clampF(parent, name, x, y, z, r, rot) {
    const g = mk(latheZ([[r * 0.9, -r * 0.35], [r * 1.8, -r * 0.35], [r * 1.8, r * 0.35], [r * 0.9, r * 0.35]], 10), M.metalHi, name, parent, x, y, z);
    if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
    return g;
  }
  function hose(parent, name, pts, r, mat, ribs) {
    const cu = new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], p[1], p[2])));
    const tg = new THREE.TubeGeometry(cu, Math.max(10, Math.round(cu.getLength() * 18)), r, 7, false);
    const m = mk(tg, mat || M.rubber, name, parent);
    const fw = V3(0, 0, 1);
    const pg = latheZ([[0, 0], [r * 2.1, 0], [r * 2.1, r * 0.55], [r * 1.45, r * 0.7], [r * 1.45, r * 1.7], [r * 1.02, r * 1.85]], 10);
    for (let e = 0; e < 2; e++) {
      const p = cu.getPointAt(e), d = cu.getTangentAt(e).multiplyScalar(e ? 1 : -1).normalize();
      const pm = mk(pg, M.metalHi, name + '_port' + e, parent, p.x, p.y, p.z);
      pm.quaternion.setFromUnitVectors(fw, d);
    }
    if (ribs) for (let i = 1; i < ribs; i++) {
      const u = i / ribs, p = cu.getPointAt(u), d = cu.getTangentAt(u);
      const rm = mk(g_ring, M.rubber, name + '_rib' + i, parent, p.x, p.y, p.z);
      rm.quaternion.setFromUnitVectors(fw, d); rm.scale.setScalar(r / 0.028);
    }
    return m;
  }
  /* --- harness run: tube + ports + flanges + corrugation + saddle clamps that
     hold it OFF the plate, so it stands clear of the hull between them --- */
  const ribC = {}, bandC = {}, portC = {}, flanC = {}, padC = {};
  function ribGeo(r) { const k = r.toFixed(4); if (!ribC[k]) ribC[k] = new THREE.TorusGeometry(r * 1.16, r * 0.30, 4, 10); return ribC[k]; }
  function bandGeo(r) { const k = r.toFixed(4); if (!bandC[k]) bandC[k] = new THREE.TorusGeometry(r * 1.40, r * 0.34, 4, 12); return bandC[k]; }
  function portGeo(r) { const k = r.toFixed(4); if (!portC[k]) portC[k] = latheZ([[0, 0], [r * 2.4, 0], [r * 2.4, r * 0.5], [r * 1.82, r * 0.66], [r * 1.82, r * 1.5], [r * 1.26, r * 1.76], [r * 1.05, r * 1.95]], 12); return portC[k]; }
  function flanGeo(r) { const k = r.toFixed(4); if (!flanC[k]) flanC[k] = latheZ([[r * 1.5, 0], [r * 2.9, 0], [r * 2.9, r * 0.32], [r * 1.5, r * 0.32]], 12); return flanC[k]; }
  function padGeo(r) { const k = r.toFixed(4); if (!padC[k]) padC[k] = latheZ([[0, 0], [r * 1.5, 0], [r * 1.5, r * 0.30], [0, r * 0.30]], 10); return padC[k]; }
  const HARN = { runs: 0, len: 0 };
  function harnRun(parent, name, pts, r, mat, o) {
    o = o || {};
    const cu = new THREE.CatmullRomCurve3(pts.map(p => V3(p[0], p[1], p[2])), false, 'catmullrom', 0.5);
    const L = cu.getLength(); HARN.runs++; HARN.len += L;
    const tseg = Math.max(18, Math.min(150, Math.round(L * 30)));
    const m = mk(new THREE.TubeGeometry(cu, tseg, r, o.rad || 8, false), mat || M.rubber, name, parent);
    const fw = V3(0, 0, 1);
    for (let e = 0; e < 2; e++) {
      const p = cu.getPointAt(e), d = cu.getTangentAt(e).multiplyScalar(e ? 1 : -1).normalize();
      const pm = mk(portGeo(r), e ? M.metalHi : M.metal, name + '_port' + e, parent, p.x, p.y, p.z);
      pm.quaternion.setFromUnitVectors(fw, d);
      const fl = mk(flanGeo(r), M.metalHi, name + '_flange' + e, parent, p.x, p.y, p.z);
      fl.quaternion.copy(pm.quaternion);
      for (let b = 0; b < 2; b++) {
        const a = b * PI + 0.5;
        const bp = V3(Math.cos(a) * r * 2.3, Math.sin(a) * r * 2.3, r * 0.22).applyQuaternion(pm.quaternion);
        const bm = mk(g_bolt, M.blued, name + '_pbolt' + e + b, parent, p.x + bp.x, p.y + bp.y, p.z + bp.z);
        bm.quaternion.copy(pm.quaternion); bm.scale.setScalar(cl(r / 0.045 * 0.5 + 0.25, 0.3, 1.0));
      }
    }
    const nr = o.ribs === undefined ? Math.min(9, Math.max(3, Math.round(L / (r * 6.5)))) : o.ribs;
    if (r >= 0.026) for (let i = 1; i < nr; i++) {
      const u = i / nr, p = cu.getPointAt(u), d = cu.getTangentAt(u);
      const rm = mk(ribGeo(r), M.rubber, name + '_rib' + i, parent, p.x, p.y, p.z);
      rm.quaternion.setFromUnitVectors(fw, d);
    }
    const cls = o.clamps || [];
    for (let i = 0; i < cls.length; i++) {
      const u = cls[i], p = cu.getPointAt(u), d = cu.getTangentAt(u);
      let inw = o.in ? V3(o.in[0], o.in[1], o.in[2]) : V3(-p.x, -p.y, 0);
      if (inw.lengthSq() < 1e-6) inw = V3(0, -1, 0);
      inw.normalize();
      const g = new THREE.Group(); g.name = name + '_clamp' + i; g.position.copy(p); parent.add(g);
      const band = mk(bandGeo(r), M.metalHi, name + '_band' + i, g);
      band.quaternion.setFromUnitVectors(fw, d);
      const foot = o.foot === undefined ? r * 3.0 : o.foot;
      const st = mk(blockGeo(r * 1.7, r * 0.75, foot, r * 0.3, r * 0.10), M.metalHi, name + '_strut' + i, g, inw.x * foot * 0.5, inw.y * foot * 0.5, inw.z * foot * 0.5);
      st.quaternion.setFromUnitVectors(fw, inw);
      const pad = mk(padGeo(r), M.blued, name + '_pad' + i, g, inw.x * foot, inw.y * foot, inw.z * foot);
      pad.quaternion.setFromUnitVectors(fw, inw);
      const bl = bolt(g, name + '_cbolt' + i, inw.x * foot * 0.92, inw.y * foot * 0.92, inw.z * foot * 0.92, cl(r / 0.045 * 0.5 + 0.3, 0.35, 1.0));
      bl.quaternion.setFromUnitVectors(fw, inw);
    }
    return m;
  }
  // cylindrical placement: ang measured from +Y (0 = spine ridge), sd picks the side
  const CP = (sd, ang, rad, z) => [sd * Math.sin(ang) * rad, Math.cos(ang) * rad, z];
  // a run that lands at both ends and bows AWAY from the hull between clamps
  function arcPts(sd, a0, a1, R0, R1, z0, z1, bulge, waves, n) {
    n = n || 10; const out = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n, a = a0 + (a1 - a0) * u, s = Math.sin(u * PI * waves);
      const R = R0 + (R1 - R0) * u + bulge * s * s;
      out.push([sd * Math.sin(a) * R, Math.cos(a) * R, z0 + (z1 - z0) * u]);
    }
    return out;
  }
  const tc = {};
  function toothGeo(w, h, th) {
    const k = 'T' + w.toFixed(3) + h.toFixed(3);
    if (tc[k]) return tc[k];
    const s = new THREE.Shape(), n = 4, d = w * 0.10;
    s.moveTo(-w * 0.5, 0);
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      const xa = -w * 0.5 * (1 - u0), ya = h * u0, xb = -w * 0.5 * (1 - u1), yb = h * u1;
      s.lineTo((xa + xb) * 0.5 + d, (ya + yb) * 0.5); s.lineTo(xb, yb);
    }
    s.lineTo(0, h * 1.05);
    for (let i = n - 1; i >= 0; i--) {
      const u0 = (i + 1) / n, u1 = i / n;
      const xa = w * 0.5 * (1 - u0), ya = h * u0, xb = w * 0.5 * (1 - u1), yb = h * u1;
      s.lineTo((xa + xb) * 0.5 - d, (ya + yb) * 0.5); s.lineTo(xb, yb);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelSize: th * 0.30, bevelThickness: th * 0.30, bevelSegments: 1, curveSegments: 1 });
    g.translate(0, 0, -th / 2); tc[k] = g; return g;
  }
  function bladeGeo(len, wRoot, wTip, th, k) {
    const s = new THREE.Shape();
    s.moveTo(0, -wRoot * 0.5);
    s.quadraticCurveTo(len * 0.55, -wRoot * 0.5 - k * 0.35, len, -wTip * 0.5);
    s.lineTo(len * 1.03, 0);
    s.lineTo(len, wTip * 0.5);
    s.quadraticCurveTo(len * 0.5, wRoot * 0.35 + k, 0, wRoot * 0.5);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelSize: th * 0.32, bevelThickness: th * 0.30, bevelSegments: 1, curveSegments: 5 });
    g.translate(0, 0, -th / 2); return g;
  }

  /* ---------------- frame ---------------- */
  const root = new THREE.Group(); root.name = 'shark_mk4';
  const chassis = new THREE.Group(); chassis.name = 'chassis';
  chassis.position.y = 1.05; chassis.rotation.order = 'YXZ'; root.add(chassis);
  const RTAB = [[3.10, 0.05], [2.85, 0.15], [2.55, 0.26], [2.20, 0.37], [1.85, 0.45], [1.55, 0.50], [1.15, 0.555], [0.80, 0.575], [0.20, 0.565], [-0.35, 0.525], [-0.90, 0.455], [-1.45, 0.360], [-1.90, 0.275], [-2.30, 0.190], [-2.62, 0.125], [-2.95, 0.10]];
  function bodyR(z) {
    for (let i = 0; i < RTAB.length - 1; i++) {
      const a = RTAB[i], b = RTAB[i + 1];
      if (z <= a[0] && z >= b[0]) return a[1] + (b[1] - a[1]) * ((a[0] - z) / (a[0] - b[0]));
    }
    return z > RTAB[0][0] ? RTAB[0][1] : 0.10;
  }
  const rest = [];
  function keep(o) { o.userData.__r = { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() }; rest.push(o); return o; }
  const seams = [];
  function seam(o, dx, dy, dz) { seams.push({ o: o, d: V3(dx, dy, dz) }); keep(o); return o; }

  /* ---------------- THORAX ---------------- */
  const thorax = new THREE.Group(); thorax.name = 'thorax'; thorax.position.set(0, 0, 0.20);
  chassis.add(thorax); keep(thorax);
  for (let i = 0; i < 5; i++) {
    const z = 0.10 + i * 0.31, r = bodyR(z + 0.20);
    mk(blockGeo(r * 0.86, r * 0.94, 0.235, r * 0.16, 0.016), M.metal, 'thorax_core_' + i, thorax, 0, 0.02, z);
    mk(latheZ([[r * 0.20, 0], [r * 0.54, 0], [r * 0.54, 0.028], [r * 0.20, 0.028]], 12), M.blued, 'thorax_disc_' + i, thorax, 0, 0.02, z + 0.135);
    const h = mk(new THREE.TorusGeometry(r * 0.80, 0.036, 6, 22, 4.6), M.metalHi, 'thorax_rib_' + i, thorax, 0, 0.0, z - 0.02);
    h.rotation.z = -2.3 + PI / 2; h.scale.set(1.0, 1.06, 1);
    bolt(thorax, 'thorax_ribbolt_a' + i, r * 0.80, 0.05, z - 0.02, 0.7, 0, PI / 2);
    bolt(thorax, 'thorax_ribbolt_b' + i, -r * 0.80, 0.05, z - 0.02, 0.7, 0, -PI / 2);
  }
  for (let i = 0; i < 6; i++) {
    const z = 0.05 + i * 0.26, r = bodyR(z + 0.20);
    mk(blockGeo(0.075, 0.055, 0.19, 0.018, 0.008), M.metalHi, 'thorax_keel_' + i, thorax, 0, r * 1.02, z).rotation.x = -0.02;
    bolt(thorax, 'thorax_keelbolt_' + i, 0, r * 1.06, z + 0.09, 0.65, PI / 2, 0);
  }
  race(thorax, 'girdle_race_R', 0.20, 0.05, M.bronze).position.set(0.36, -0.10, 0.80);
  const glR = race(thorax, 'girdle_race_L', 0.20, 0.05, M.bronze); glR.position.set(-0.36, -0.10, 0.80); glR.rotation.y = PI;
  sprocket(thorax, 'girdle_gear_R', 0.15, 14, 0.045, M.metalHi).position.set(0.30, 0.10, 0.66);
  sprocket(thorax, 'girdle_gear_L', 0.15, 14, 0.045, M.metalHi).position.set(-0.30, 0.10, 0.66);
  sprocket(thorax, 'girdle_pinion', 0.085, 10, 0.04, M.bronze).position.set(0, 0.24, 0.72);
  mk(tube(0.035, 0.035, 0.78, 8), M.metalHi, 'girdle_shaft', thorax, 0, 0.24, 0.72).rotation.y = PI / 2;
  mk(latheZ([[0, 0], [0.06, 0], [0.06, 0.05], [0, 0.05]], 10), M.blued, 'girdle_cap_R', thorax, 0.39, 0.24, 0.72).rotation.y = PI / 2;
  mk(latheZ([[0, 0], [0.06, 0], [0.06, 0.05], [0, 0.05]], 10), M.blued, 'girdle_cap_L', thorax, -0.39, 0.24, 0.72).rotation.y = -PI / 2;
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    const r1 = ram(thorax, 'thorax_ram_up_' + nm, 0.52, 0.055, M.metal);
    r1.position.set(sd * 0.40, 0.22, 0.62); r1.rotation.set(0.06, sd * 0.10, 0);
    const r2 = ram(thorax, 'thorax_ram_lo_' + nm, 0.46, 0.048, M.metal);
    r2.position.set(sd * 0.38, -0.24, 0.30); r2.rotation.set(-0.05, sd * 0.09, 0);
    const s1 = sprocket(thorax, 'thorax_spr_f_' + nm, 0.10, 11, 0.035, M.metalHi); s1.position.set(sd * 0.44, 0.20, 1.24); s1.rotation.y = PI / 2;
    const s2 = sprocket(thorax, 'thorax_spr_r_' + nm, 0.11, 12, 0.035, M.metalHi); s2.position.set(sd * 0.44, 0.16, 0.06); s2.rotation.y = PI / 2;
    chainRun(thorax, 'thorax_chain_' + nm, [[sd * 0.455, 0.29, 1.24], [sd * 0.475, 0.30, 0.90], [sd * 0.48, 0.28, 0.50], [sd * 0.465, 0.26, 0.06], [sd * 0.44, 0.06, 0.02], [sd * 0.45, 0.06, 0.55], [sd * 0.44, 0.10, 1.20]], 0.052, M.blued);
    chainRun(thorax, 'thorax_chain_lo_' + nm, [[sd * 0.40, -0.30, 1.22], [sd * 0.43, -0.34, 0.80], [sd * 0.42, -0.35, 0.30], [sd * 0.38, -0.33, 0.02]], 0.044, M.blued);
    mk(blockGeo(0.030, 0.030, 1.26, 0.008, 0.005), M.metalHi, 'lateral_rail_' + nm, thorax, sd * 0.505, -0.02, 0.66).rotation.y = sd * 0.03;
    for (let i = 0; i < 5; i++) bolt(thorax, 'lateral_port_' + nm + i, sd * 0.525, -0.02, 0.12 + i * 0.27, 0.6, 0, sd * PI / 2, M.blued);
    // ducting + signal wire — now OUTSIDE, in the gap above the flank shell
    hose(thorax, 'thorax_duct_' + nm, arcPts(sd, 0.74, 0.80, 0.635, 0.60, 1.44, 0.0, 0.125, 3, 10), 0.050, M.rubber, 9);
    hose(thorax, 'thorax_wire_' + nm, arcPts(sd, 1.60, 1.66, 0.690, 0.660, 1.40, -0.02, 0.075, 3, 10), 0.017, M.rubber);
    hose(thorax, 'thorax_wire2_' + nm, arcPts(sd, 1.70, 1.76, 0.685, 0.655, 1.36, -0.02, 0.065, 3, 10), 0.014, M.rubber);
    clampF(thorax, 'thorax_clamp_a_' + nm, sd * 0.485, -0.19, 0.62, 0.026, [0, sd * 1.4, 0]);
    clampF(thorax, 'thorax_clamp_b_' + nm, sd * 0.305, 0.27, 0.70, 0.052, [0, sd * 1.4, 0]);
  }
  const thS = [['thorax_shell_top_a', 0.605, 0.62, PI, 1.36, 1.05, M.shellD],
  ['thorax_shell_top_b', 0.585, 0.66, PI, 1.24, 0.42, M.shellD],
  ['thorax_shell_top_c', 0.55, 0.50, PI, 1.12, -0.02, M.shellW]];
  for (const s of thS) {
    const m = mk(wrapShell(s[1] + 0.045, s[1] + 0.055, s[2], s[3], s[4]), s[6], s[0], thorax, 0, 0.01, s[5]);
    m.scale.set(0.98, 1.04, 1); seam(m, 0, 1, 0);
    mk(lipGeo(s[1] + 0.058, 0.014, s[3], s[4]), M.metalHi, s[0] + '_lip', thorax, 0, 0.01, s[5] - s[2] / 2);
    boltRow(thorax, s[0] + '_bolt', -0.38, 0.48, s[5] - s[2] * 0.36, 0.38, 0.48, s[5] - s[2] * 0.36, 4, 0.8, 0, 0);
  }
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    const f1 = mk(wrapShell(0.63, 0.635, 0.78, sd * (PI / 2 + 0.06), 0.76), M.shellD, 'thorax_shell_flank_' + nm, thorax, 0, -0.02, 0.92);
    seam(f1, sd, 0.05, 0);
    const f2 = mk(wrapShell(0.615, 0.60, 0.70, sd * (PI / 2 + 0.20), 0.70), M.shellSh, 'thorax_shell_flank2_' + nm, thorax, 0, -0.04, 0.24);
    seam(f2, sd, -0.05, 0);
    mk(lipGeo(0.655, 0.013, sd * (PI / 2 + 0.06), 0.76), M.metalHi, 'thorax_flank_lip_' + nm, thorax, 0, -0.02, 0.53);
    const bl = mk(wrapShell(0.585, 0.60, 0.86, 0, 0.98), M.shellSh, 'thorax_shell_belly_' + nm, thorax, sd * 0.05, -0.02, 0.62);
    bl.rotation.z = sd * 0.22; seam(bl, sd * 0.4, -1, 0);
    boltRow(thorax, 'thorax_flankbolt_' + nm, sd * 0.64, 0.24, 1.24, sd * 0.68, 0.10, 0.60, 4, 0.75, 0, sd * PI / 2);
  }
  const hatch = mk(blockGeo(0.30, 0.26, 0.05, 0.05, 0.012), M.shell, 'thorax_hatch', thorax, 0.13, 0.615, 0.98);
  hatch.rotation.set(-1.15, 0.12, 0); seam(hatch, 0.2, 1, 0);
  boltRingZ(hatch, 'thorax_hatch_bolt', 0.115, 8, 0.032, 0.7);
  for (let i = 0; i < 5; i++) mk(blockGeo(0.20, 0.028, 0.030, 0.008, 0.006), M.blued, 'thorax_vent_' + i, thorax, -0.14, 0.617 - i * 0.006, 0.30 + i * 0.055).rotation.set(-1.25, 0, 0);
  mk(blockGeo(0.13, 0.115, 0.008, 0.055, 0.003), M.blued, 'stencil_triangle', thorax, -0.30, 0.50, 0.72).rotation.set(-1.1, -0.5, 0.2);
  mk(blockGeo(0.19, 0.10, 0.016, 0.03, 0.005), M.accent, 'accent_plate_R', thorax, 0.56, -0.16, 0.40).rotation.set(0, -PI / 2 + 0.1, 0.15);
  mk(blockGeo(0.12, 0.07, 0.014, 0.02, 0.004), M.accent, 'accent_plate_L', thorax, -0.58, 0.10, 1.02).rotation.set(0, PI / 2 - 0.1, -0.1);
  mk(latheZ([[0, 0], [0.024, 0], [0.024, 0.012], [0, 0.012]], 8), M.lampA, 'status_lamp', thorax, 0.545, 0.16, 0.16).rotation.y = PI / 2;
  const mod = new THREE.Group(); mod.name = 'dorsal_module'; mod.position.set(-0.22, 0.56, 0.12); mod.rotation.set(-0.9, 0.25, 0.1); thorax.add(mod);
  mk(blockGeo(0.20, 0.15, 0.14, 0.035, 0.010), M.metal, 'module_body', mod);
  mk(blockGeo(0.15, 0.10, 0.03, 0.02, 0.006), M.shellW, 'module_lid', mod, 0, 0, 0.085);
  boltRingZ(mod, 'module_bolt', 0.085, 6, 0.075, 0.7);
  mk(latheZ([[0, 0], [0.016, 0], [0.016, 0.02], [0, 0.02]], 8), M.lampB, 'module_lamp', mod, 0.05, -0.05, 0.088);
  hose(mod, 'module_hose', [[-0.06, -0.04, 0.07], [-0.11, -0.09, 0.04], [-0.13, -0.13, -0.02], [-0.09, -0.15, -0.07]], 0.014, M.rubber, 4);

  /* ---------------- GILLS ---------------- */
  const gillsR = [], gillsL = [];
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    const duct = mk(wrapShell(0.50, 0.53, 0.62, sd * PI / 2, 1.15, 18), M.blued, 'gill_duct_' + nm, thorax, 0, -0.02, 1.06);
    duct.scale.setScalar(0.99);
    for (let i = 0; i < 5; i++) {
      const z = 1.30 - i * 0.135, r = bodyR(z + 0.20);
      const g = new THREE.Group(); g.name = 'gill_' + nm + '_' + i;
      g.position.set(sd * (r * 0.99), -0.02 - i * 0.012, z); g.rotation.y = sd * PI / 2;
      thorax.add(g); keep(g);
      const bg = bladeGeo(0.135, 0.40 - i * 0.022, 0.34 - i * 0.02, 0.026, 0.05);
      const bm = mk(bg, M.shellW, 'gill_blade_' + nm + '_' + i, g);
      bm.rotation.set(0, 0, PI / 2); bm.position.set(0, 0, 0.012);
      mk(blockGeo(0.05, 0.40 - i * 0.022, 0.03, 0.012, 0.006), M.metalHi, 'gill_rail_' + nm + '_' + i, g, 0, 0, -0.01);
      bolt(g, 'gill_bolt_a' + nm + i, 0, 0.16, 0.02, 0.6, 0, 0);
      bolt(g, 'gill_bolt_b' + nm + i, 0, -0.16, 0.02, 0.6, 0, 0);
      mk(new THREE.CylinderGeometry(0.016, 0.016, 0.44, 6), M.blued, 'gill_pin_' + nm + '_' + i, g, 0, 0, 0.0);
      (sd > 0 ? gillsR : gillsL).push(g);
    }
    const gr = ram(thorax, 'gill_ram_' + nm, 0.30, 0.036, M.metal);
    gr.position.set(sd * 0.34, -0.30, 0.86); gr.rotation.set(0.2, sd * 0.5, 0);
  }

  /* ---------------- LEADING END ---------------- */
  const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 0.01, 1.35);
  thorax.add(head); keep(head);
  race(head, 'atlas_collar', 0.44, 0.075, M.bronze).position.set(0, 0, -0.02);
  mk(latheZ([[0.30, -0.05], [0.46, -0.05], [0.46, 0.05], [0.30, 0.05]], 20), M.metal, 'atlas_ring', head, 0, 0, 0.03);
  boltRingZ(head, 'atlas_bolt', 0.39, 10, 0.09, 0.8, M.metalHi);
  mk(blockGeo(0.72, 0.62, 0.30, 0.14, 0.018), M.metal, 'skull_block_a', head, 0, 0.01, 0.16);
  mk(blockGeo(0.62, 0.54, 0.26, 0.12, 0.016), M.metal, 'skull_block_b', head, 0, 0.03, 0.42);
  mk(blockGeo(0.48, 0.42, 0.24, 0.10, 0.014), M.metalHi, 'skull_block_c', head, 0, 0.04, 0.64);
  mk(blockGeo(0.34, 0.30, 0.22, 0.08, 0.012), M.metal, 'skull_block_d', head, 0, 0.02, 0.86);
  mk(tube(0.055, 0.24, 0.80, 7), M.metal, 'rostrum_spar', head, 0, -0.01, 1.06);
  mk(tube(0.030, 0.070, 0.22, 6), M.metalHi, 'rostrum_tip_core', head, 0, -0.03, 1.48);
  mk(blockGeo(0.60, 0.075, 0.12, 0.025, 0.010), M.metalHi, 'brow_bar', head, 0, 0.19, 0.62).rotation.x = -0.16;
  boltRow(head, 'brow_bolt', -0.25, 0.235, 0.66, 0.25, 0.235, 0.66, 5, 0.7, 0, 0);
  const snoutTop = mk(wrapShell(0.095, 0.30, 0.94, PI, 1.66, 22), M.shellD, 'shell_rostrum_top', head, 0, 0.02, 1.03);
  snoutTop.scale.set(1.06, 0.86, 1); seam(snoutTop, 0, 1, 0.3);
  mk(lipGeo(0.305, 0.014, PI, 1.66), M.metalHi, 'shell_rostrum_lip', head, 0, 0.02, 0.57).scale.set(1.06, 0.86, 1);
  const cranTop = mk(wrapShell(0.30, 0.375, 0.58, PI, 1.46, 22), M.shellD, 'shell_cranium_top', head, 0, 0.02, 0.35);
  cranTop.scale.set(1.05, 0.95, 1); seam(cranTop, 0, 1, 0);
  boltRow(head, 'cranium_bolt', -0.22, 0.37, 0.14, 0.22, 0.37, 0.14, 5, 0.8, 0, 0);
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    const ch = mk(wrapShell(0.20, 0.38, 0.82, sd * (PI / 2 - 0.15), 0.90, 20), M.shellD, 'shell_cheek_' + nm, head, 0, -0.01, 0.72);
    seam(ch, sd, 0.1, 0.2);
    const gj = mk(wrapShell(0.38, 0.45, 0.42, sd * (PI / 2 - 0.05), 0.84, 18), M.shellSh, 'shell_jowl_' + nm, head, 0, -0.02, 0.18);
    seam(gj, sd, -0.1, 0);
    mk(lipGeo(0.385, 0.012, sd * (PI / 2 - 0.15), 0.90), M.metalHi, 'cheek_lip_' + nm, head, 0, -0.01, 0.31);
    boltRow(head, 'cheek_bolt_' + nm, sd * 0.30, 0.08, 1.02, sd * 0.42, -0.02, 0.40, 4, 0.7, 0, sd * PI / 2);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) {
      const u = i / 6, z = 0.72 + u * 0.74, rr = 0.30 - u * 0.20;
      bolt(head, 'ampulla_' + nm + r + '_' + i, sd * rr * (0.55 + r * 0.30), -0.06 - r * 0.09 + u * 0.02, z, 0.42, 0, sd * PI / 2, M.blued);
    }
    // head service lines — rerouted OUTSIDE the cheek shell, jowl port to rostrum port
    hose(head, 'head_hose_' + nm, [[sd * 0.40, 0.13, 0.10], [sd * 0.50, 0.02, 0.32], [sd * 0.44, -0.09, 0.56],
    [sd * 0.36, -0.13, 0.80], [sd * 0.28, -0.12, 1.00], [sd * 0.20, -0.10, 1.14], [sd * 0.145, -0.075, 1.22]], 0.036, M.rubber, 8);
    hose(head, 'head_wire_' + nm, [[sd * 0.27, 0.28, 0.04], [sd * 0.29, 0.315, 0.26], [sd * 0.285, 0.33, 0.48],
    [sd * 0.265, 0.28, 0.70], [sd * 0.225, 0.225, 0.92], [sd * 0.175, 0.175, 1.12], [sd * 0.125, 0.125, 1.30]], 0.014, M.rubber);
    clampF(head, 'head_clamp_' + nm, sd * 0.46, -0.05, 0.47, 0.030, [0, sd * 1.3, 0]);
    const qr = race(head, 'quadrate_race_' + nm, 0.115, 0.045, M.bronze);
    qr.position.set(sd * 0.30, -0.30, 0.30); qr.rotation.y = sd * PI / 2;
    const sg = sprocket(head, 'quadrate_gear_' + nm, 0.075, 9, 0.032, M.metalHi);
    sg.position.set(sd * 0.30, -0.30, 0.30); sg.rotation.y = sd * PI / 2;
    const ar = ram(head, 'adductor_ram_' + nm, 0.30, 0.045, M.metal);
    ar.position.set(sd * 0.21, 0.02, 0.44); ar.rotation.set(1.15, sd * 0.16, 0);
    const pr = ram(head, 'protract_ram_' + nm, 0.22, 0.032, M.metal);
    pr.position.set(sd * 0.15, -0.16, 0.36); pr.rotation.set(0.12, sd * 0.10, 0);
    const eye = new THREE.Group(); eye.name = 'eye_' + nm;
    eye.position.set(sd * 0.295, 0.055, 0.74); eye.rotation.set(0.06, sd * (PI / 2 - 0.28), 0);
    head.add(eye);
    mk(latheZ([[0.028, -0.02], [0.085, -0.02], [0.092, 0.012], [0.078, 0.030], [0.055, 0.030], [0.050, 0.008], [0.028, 0.008]], 16), M.metalHi, 'eye_bezel_' + nm, eye);
    mk(latheZ([[0, -0.035], [0.052, -0.035], [0.052, 0.004], [0, 0.004]], 14), M.blued, 'eye_socket_' + nm, eye);
    mk(new THREE.SphereGeometry(0.046, 16, 12), M.glass, 'eye_lens_' + nm, eye, 0, 0, -0.006);
    mk(blockGeo(0.16, 0.045, 0.022, 0.014, 0.006), M.shellW, 'eye_hood_' + nm, eye, 0, 0.085, 0.006).rotation.z = sd * 0.12;
    bolt(eye, 'eye_bolt_a' + nm, 0.085, 0.055, 0.02, 0.6);
    bolt(eye, 'eye_bolt_b' + nm, -0.085, -0.045, 0.02, 0.6);
    mk(latheZ([[0, 0], [0.022, 0], [0.022, 0.016], [0, 0.016]], 8), M.blued, 'eye_fitting_' + nm, eye, -0.10, 0.03, 0.01);
    mk(latheZ([[0.012, 0], [0.040, 0], [0.040, 0.018], [0.020, 0.026]], 12), M.blued, 'nares_' + nm, head, sd * 0.115, -0.135, 1.16).rotation.set(1.25, 0, 0);
  }

  /* ---------------- JAWS + SHARP TEETH ---------------- */
  const jawU = new THREE.Group(); jawU.name = 'jaw_upper'; jawU.position.set(0, -0.20, 0.34); head.add(jawU); keep(jawU);
  const jawL = new THREE.Group(); jawL.name = 'jaw_lower'; jawL.position.set(0, -0.31, 0.30); head.add(jawL); keep(jawL);
  function archPt(u, hw, dp, z0) { const a = u * 1.12; return [Math.sin(a) * hw, z0 - (1 - Math.cos(a)) * dp]; }
  function buildArch(parent, tag, y, hw, dp, z0, dir, mat) {
    const N = 13;
    for (let i = 0; i < N; i++) {
      const u = (i / (N - 1)) * 2 - 1, p = archPt(u, hw, dp, z0);
      const seg = mk(blockGeo(0.075, 0.085, 0.10, 0.020, 0.008), mat, tag + '_arch_' + i, parent, p[0], y, p[1]);
      seg.rotation.y = -u * 1.12;
      if (i % 3 === 0) bolt(parent, tag + '_archbolt_' + i, p[0] * 1.15, y + dir * 0.045, p[1], 0.55, 0, -u * 1.12);
    }
    mk(blockGeo(0.055, 0.055, 0.10, 0.014, 0.006), M.metalHi, tag + '_rail_c', parent, 0, y + dir * 0.05, z0 + 0.02);
    for (let r = 0; r < 2; r++) {
      const NT = 13;
      for (let i = 0; i < NT; i++) {
        const u = (i / (NT - 1)) * 2 - 1, p = archPt(u, hw - r * 0.045, dp - r * 0.03, z0 - r * 0.075);
        const k = 1 - Math.abs(u) * 0.42, sz = (r ? 0.80 : 1.0) * k;
        const t = mk(toothGeo(0.105 * sz, 0.165 * sz, 0.020), M.tooth, tag + '_tooth_' + r + '_' + i, parent, p[0], y + dir * 0.055, p[1]);
        t.rotation.set(dir > 0 ? -0.12 : 0.12, -u * 1.12, dir > 0 ? 0 : PI);
        t.rotation.x += dir > 0 ? 0.10 * Math.abs(u) : -0.10 * Math.abs(u);
      }
    }
  }
  buildArch(jawU, 'upper', 0.0, 0.315, 0.44, 0.66, -1, M.metalHi);
  buildArch(jawL, 'lower', 0.0, 0.295, 0.40, 0.64, 1, M.metalHi);
  const chin = mk(wrapShell(0.16, 0.30, 0.56, 0, 1.42, 18), M.shellSh, 'shell_chin', jawL, 0, 0.10, 0.40);
  chin.scale.set(1.0, 0.72, 1); seam(chin, 0, -1, 0.2);
  mk(lipGeo(0.30, 0.012, 0, 1.42), M.metalHi, 'chin_lip', jawL, 0, 0.10, 0.12).scale.set(1, 0.72, 1);
  boltRow(jawL, 'chin_bolt', -0.16, -0.10, 0.30, 0.16, -0.10, 0.30, 4, 0.7, 1.2, 0);
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    mk(blockGeo(0.075, 0.11, 0.30, 0.022, 0.010), M.metal, 'mandible_ramus_' + nm, jawL, sd * 0.26, 0.01, 0.10).rotation.y = sd * 0.42;
    mk(latheZ([[0, 0], [0.055, 0], [0.055, 0.05], [0, 0.05]], 12), M.bronze, 'mandible_boss_' + nm, jawL, sd * 0.29, 0.0, -0.01).rotation.y = sd * PI / 2;
    mk(tube(0.016, 0.016, 0.20, 8), M.metalHi, 'adductor_rod_' + nm, jawL, sd * 0.20, 0.11, 0.14).rotation.set(1.15, sd * 0.16, 0);
    mk(latheZ([[0.016, 0], [0.034, 0], [0.034, 0.05], [0.016, 0.05]], 10), M.rubber, 'adductor_boot_' + nm, jawL, sd * 0.20, 0.17, 0.17).rotation.set(1.15, sd * 0.16, 0);
    // mandible line, run along the OUTSIDE of the ramus from the boss to a chin port
    hose(jawL, 'jaw_hose_' + nm, [[sd * 0.325, 0.02, -0.02], [sd * 0.375, -0.03, 0.14], [sd * 0.355, -0.09, 0.30],
    [sd * 0.285, -0.12, 0.44], [sd * 0.195, -0.11, 0.55], [sd * 0.115, -0.085, 0.62]], 0.024, M.rubber, 7);
    mk(tube(0.014, 0.014, 0.18, 8), M.metalHi, 'protract_rod_' + nm, jawU, sd * 0.15, 0.04, 0.16).rotation.set(0.12, sd * 0.10, 0);
    mk(latheZ([[0.014, 0], [0.030, 0], [0.030, 0.045], [0.014, 0.045]], 10), M.rubber, 'protract_boot_' + nm, jawU, sd * 0.15, 0.04, 0.09).rotation.set(0.12, sd * 0.10, 0);
    mk(blockGeo(0.06, 0.06, 0.34, 0.016, 0.008), M.metal, 'palate_bar_' + nm, jawU, sd * 0.20, 0.04, 0.30).rotation.y = sd * 0.30;
  }
  mk(blockGeo(0.22, 0.07, 0.16, 0.020, 0.008), M.metal, 'palate_keystone', jawU, 0, 0.05, 0.52);

  /* ---------------- PECTORAL FINS ---------------- */
  const pecs = [];
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    const pec = new THREE.Group(); pec.name = 'pectoral_' + nm;
    pec.position.set(sd * 0.42, -0.22, 0.80); pec.rotation.set(0.05, sd * 0.35, sd * -0.22);
    thorax.add(pec); keep(pec); pecs.push(pec);
    const hub = race(pec, 'pec_race_' + nm, 0.13, 0.05, M.bronze); hub.rotation.y = sd * PI / 2;
    sprocket(pec, 'pec_gear_' + nm, 0.09, 10, 0.03, M.metalHi).rotation.y = sd * PI / 2;
    mk(tube(0.05, 0.075, 0.92, 6), M.metal, 'pec_spar_' + nm, pec, sd * 0.46, -0.03, -0.04).rotation.set(0, sd * PI / 2, 0);
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      const b = mk(bladeGeo(0.62 + u * 0.36, 0.19 - u * 0.05, 0.075, 0.022, 0.06 + u * 0.05), M.shellW, 'pec_blade_' + nm + '_' + i, pec);
      b.rotation.set(PI / 2, sd > 0 ? -PI / 2 : PI / 2, 0);
      b.position.set(sd * 0.12, -0.02 - u * 0.012, 0.16 - u * 0.115);
    }
    const ps = mk(wrapShell(0.10, 0.20, 0.50, PI, 1.42, 16), M.shellD, 'pec_shell_' + nm, pec, sd * 0.30, 0.02, 0.02);
    ps.rotation.y = sd * PI / 2; ps.scale.set(1, 0.55, 1); seam(ps, 0, 1, 0);
    mk(blockGeo(0.10, 0.06, 0.34, 0.02, 0.008), M.metalHi, 'pec_root_rail_' + nm, pec, sd * 0.16, 0.06, 0.0).rotation.y = sd * 0.2;
    const pr = ram(pec, 'pec_ram_' + nm, 0.34, 0.036, M.metal);
    pr.position.set(sd * 0.06, -0.10, 0.10); pr.rotation.set(0.1, sd * (PI / 2 - 0.35), 0);
    chainRun(pec, 'pec_chain_' + nm, [[sd * 0.10, 0.08, 0.10], [sd * 0.40, 0.05, 0.02], [sd * 0.68, 0.0, -0.08]], 0.036, M.blued);
    // spar line, run on TOP of the spar in open air from the hub port to a tip port
    hose(pec, 'pec_hose_' + nm, [[sd * 0.08, 0.09, 0.12], [sd * 0.26, 0.12, 0.06], [sd * 0.46, 0.115, -0.01],
    [sd * 0.66, 0.09, -0.07], [sd * 0.84, 0.05, -0.12], [sd * 0.95, 0.01, -0.15]], 0.022, M.rubber, 7);
    boltRow(pec, 'pec_bolt_' + nm, sd * 0.14, 0.09, 0.14, sd * 0.60, 0.03, -0.06, 4, 0.65, PI / 2, 0);
    mk(blockGeo(0.08, 0.05, 0.012, 0.015, 0.004), M.accent, 'pec_tipmark_' + nm, pec, sd * 0.92, -0.03, -0.10).rotation.set(PI / 2, 0, 0);
  }

  /* ---------------- TAIL SEGMENTS ---------------- */
  const SEGDEF = [['seg_a', 0.55, 0.565, 0.525, 0.01], ['seg_b', 0.55, 0.525, 0.455, -0.01],
  ['seg_c', 0.55, 0.455, 0.360, 0.0], ['seg_d', 0.45, 0.360, 0.275, -0.02],
  ['seg_e', 0.40, 0.275, 0.190, -0.02], ['seg_f', 0.32, 0.190, 0.125, -0.02]];
  const segs = [];
  let parentNode = thorax, parentLen = 0;
  for (let i = 0; i < SEGDEF.length; i++) {
    const d = SEGDEF[i], nmS = d[0], len = d[1], r0 = d[2], r1 = d[3];
    const g = new THREE.Group(); g.name = nmS;
    g.position.set(0, i === 0 ? 0 : d[4], i === 0 ? 0 : -parentLen);
    parentNode.add(g); keep(g); segs.push(g);
    mk(new THREE.CylinderGeometry(r0 * 0.14, r0 * 0.14, r0 * 1.7, 10), M.metalHi, nmS + '_pin', g);
    mk(new THREE.LatheGeometry([[0, 0], [r0 * 0.34, 0], [r0 * 0.34, r0 * 0.12], [0, r0 * 0.12]].map(p => new THREE.Vector2(p[0], p[1])), 12), M.bronze, nmS + '_cap_up', g, 0, r0 * 0.78, 0);
    mk(new THREE.LatheGeometry([[0, 0], [r0 * 0.30, 0], [r0 * 0.30, -r0 * 0.12], [0, -r0 * 0.12]].map(p => new THREE.Vector2(p[0], p[1])), 12), M.bronze, nmS + '_cap_dn', g, 0, -r0 * 0.72, 0);
    const gs = sprocket(g, nmS + '_gear', r0 * 0.44, 12, r0 * 0.13, M.metalHi); gs.rotation.x = PI / 2; gs.position.y = r0 * 0.56;
    for (const sd of [1, -1]) {
      const nm2 = sd > 0 ? 'R' : 'L';
      const rc = race(g, nmS + '_race_' + nm2, r0 * 0.34, r0 * 0.13, M.bronze);
      rc.position.set(sd * r0 * 0.80, 0, 0); rc.rotation.y = sd * PI / 2;
      mk(latheZ([[r0 * 0.20, 0], [r0 * 0.40, 0], [r0 * 0.40, 0.03], [r0 * 0.20, 0.03]], 10), M.rubber, nmS + '_jboot_' + nm2, g, sd * r0 * 0.62, 0, 0.02).rotation.y = sd * PI / 2;
    }
    for (let k = 0; k < 3; k++) {
      const u = (k + 0.5) / 3, rr = r0 + (r1 - r0) * u;
      mk(blockGeo(rr * 0.80, rr * 0.88, len / 3 * 0.86, rr * 0.16, 0.012), M.metal, nmS + '_vert_' + k, g, 0, 0.01, -len * u);
      mk(latheZ([[rr * 0.18, 0], [rr * 0.48, 0], [rr * 0.48, 0.022], [rr * 0.18, 0.022]], 12), M.blued, nmS + '_vertdisc_' + k, g, 0, 0.01, -len * u - len / 6);
      mk(blockGeo(0.058, 0.045, len / 3 * 0.8, 0.014, 0.006), M.metalHi, nmS + '_keel_' + k, g, 0, rr * 1.0, -len * u);
      mk(blockGeo(0.048, 0.038, len / 3 * 0.7, 0.012, 0.005), M.metal, nmS + '_vkeel_' + k, g, 0, -rr * 0.95, -len * u);
    }
    for (const sd of [1, -1]) {
      const nm2 = sd > 0 ? 'R' : 'L';
      mk(tube(r0 * 0.075, r0 * 0.075, r0 * 0.55, 8), M.metalHi, nmS + '_pushrod_' + nm2, g, sd * r0 * 0.62, 0.02, r0 * 0.24);
      const rm = ram(g, nmS + '_ram_' + nm2, len * 0.72, r0 * 0.10, M.metal);
      rm.position.set(sd * r0 * 0.66, -r0 * 0.24, -len * 0.90); rm.rotation.set(0, PI + sd * 0.06, 0);
      const s1 = sprocket(g, nmS + '_spr_f_' + nm2, r0 * 0.20, 10, 0.03, M.metalHi); s1.position.set(sd * r0 * 0.70, r0 * 0.28, -len * 0.10); s1.rotation.y = PI / 2;
      const s2 = sprocket(g, nmS + '_spr_r_' + nm2, r1 * 0.24, 9, 0.03, M.metalHi); s2.position.set(sd * r1 * 0.72, r1 * 0.30, -len * 0.92); s2.rotation.y = PI / 2;
      chainRun(g, nmS + '_chain_' + nm2, [[sd * r0 * 0.74, r0 * 0.40, -len * 0.06], [sd * (r0 + r1) * 0.38, (r0 + r1) * 0.21, -len * 0.5], [sd * r1 * 0.78, r1 * 0.42, -len * 0.94], [sd * r1 * 0.66, r1 * 0.12, -len * 0.92], [sd * r0 * 0.68, r0 * 0.10, -len * 0.10]], r0 * 0.085, M.blued);
      // segment service lines — moved OUT into the lower gap and along the flank
      hose(g, nmS + '_hose_' + nm2, arcPts(sd, 2.18, 2.24, r0 * 1.02 + 0.035, r1 * 1.02 + 0.035, 0.03, -len - 0.03, Math.max(0.045, r0 * 0.24), 2, 9), Math.max(0.020, r0 * 0.070), M.rubber, 7);
      hose(g, nmS + '_wire_' + nm2, arcPts(sd, 1.52, 1.58, r0 * 1.04 + 0.045, r1 * 1.04 + 0.045, 0.03, -len - 0.03, Math.max(0.030, r0 * 0.16), 2, 9), Math.max(0.012, r0 * 0.032), M.rubber);
      clampF(g, nmS + '_clamp_' + nm2, sd * (r0 + r1) * 0.50, -(r0 + r1) * 0.30, -len * 0.5, r0 * 0.06, [0, sd * 1.3, 0]);
      mk(blockGeo(0.026, 0.026, len * 0.8, 0.007, 0.004), M.metalHi, nmS + '_lateral_' + nm2, g, sd * (r0 + r1) * 0.50, 0, -len * 0.5);
    }
    const tp = mk(wrapShell(r1 * 0.99 + 0.035, r0 * 1.0 + 0.04, len + 0.10, PI, 1.24), M.shellD, nmS + '_shell_top', g, 0, 0.01, -len / 2 - 0.05);
    tp.scale.set(0.98, 1.03, 1); seam(tp, 0, 1, 0);
    mk(lipGeo(r0 * 1.0 + 0.05, 0.012, PI, 1.24), M.metalHi, nmS + '_shell_lip', g, 0, 0.01, 0.02);
    boltRow(g, nmS + '_topbolt_', -r0 * 0.5, r0 * 0.92, -len * 0.15, r0 * 0.5, r0 * 0.92, -len * 0.15, 3, 0.7, 0, 0);
    for (const sd of [1, -1]) {
      const nm2 = sd > 0 ? 'R' : 'L';
      const fl = mk(wrapShell(r1 * 1.02 + 0.03, r0 * 1.02 + 0.035, len + 0.06, sd * (PI / 2 + 0.16), 0.80), i % 2 ? M.shellSh : M.shellD, nmS + '_shell_flank_' + nm2, g, 0, -0.01, -len / 2 - 0.03);
      seam(fl, sd, 0, 0);
      if (i % 2 === 0) {
        const bl = mk(wrapShell(r1 + 0.03, r0 + 0.03, len * 0.86, 0, 0.94), M.shellSh, nmS + '_shell_belly_' + nm2, g, sd * 0.02, 0, -len / 2);
        bl.rotation.z = sd * 0.2; seam(bl, sd * 0.3, -1, 0);
      }
    }
    parentNode = g; parentLen = len;
  }

  /* ---------------- FINS ON THE TAIL ---------------- */
  const dorsal = new THREE.Group(); dorsal.name = 'dorsal_fin'; dorsal.position.set(0, 0.52, 0.28);
  segs[0].add(dorsal); keep(dorsal);
  mk(blockGeo(0.11, 0.20, 0.62, 0.03, 0.010), M.metal, 'dorsal_base_block', dorsal, 0, 0.02, -0.16);
  race(dorsal, 'dorsal_race', 0.10, 0.04, M.bronze).rotation.y = PI / 2;
  mk(tube(0.035, 0.085, 0.74, 6), M.metal, 'dorsal_spar', dorsal, 0, 0.36, -0.16).rotation.x = -PI / 2 + 0.42;
  const dorsalBlades = [];
  for (let i = 0; i < 5; i++) {
    const u = i / 4;
    const b = mk(bladeGeo(0.60 - u * 0.10, 0.30 - u * 0.05, 0.07, 0.028, 0.10), M.shellW, 'dorsal_blade_' + i, dorsal, 0.0, 0.06, -0.02 - u * 0.14);
    b.rotation.set(0, PI / 2, 1.24 - u * 0.10);
    b.position.x = (i - 2) * 0.026;
    dorsalBlades.push(keep(b));
  }
  const dsh = mk(wrapShell(0.05, 0.16, 0.44, PI / 2, 1.32, 14), M.shellD, 'dorsal_shell_R', dorsal, 0.05, 0.24, -0.10);
  dsh.rotation.set(-PI / 2 + 0.45, 0, 0); seam(dsh, 1, 0.4, 0);
  const dsh2 = mk(wrapShell(0.05, 0.16, 0.44, -PI / 2, 1.32, 14), M.shellD, 'dorsal_shell_L', dorsal, -0.05, 0.24, -0.10);
  dsh2.rotation.set(-PI / 2 + 0.45, 0, 0); seam(dsh2, -1, 0.4, 0);
  boltRow(dorsal, 'dorsal_bolt', -0.06, 0.06, 0.14, -0.06, 0.60, -0.30, 4, 0.65, 0, -PI / 2);
  hose(dorsal, 'dorsal_hose', [[0.085, 0.02, 0.14], [0.105, 0.20, 0.02], [0.105, 0.40, -0.14], [0.085, 0.58, -0.28], [0.062, 0.70, -0.36]], 0.018, M.rubber, 6);
  ram(dorsal, 'dorsal_ram', 0.30, 0.030, M.metal).rotation.set(-1.1, 0, 0);
  const d2 = new THREE.Group(); d2.name = 'dorsal_fin_2'; d2.position.set(0, 0.28, -0.12); segs[4].add(d2); keep(d2);
  mk(bladeGeo(0.20, 0.16, 0.05, 0.022, 0.05), M.shellW, 'dorsal2_blade', d2).rotation.set(0, PI / 2, 1.25);
  mk(blockGeo(0.06, 0.08, 0.16, 0.018, 0.006), M.metal, 'dorsal2_base', d2, 0, -0.04, -0.02);
  bolt(d2, 'dorsal2_bolt', 0.035, -0.02, 0.05, 0.6, 0, PI / 2);
  const anal = new THREE.Group(); anal.name = 'anal_fin'; anal.position.set(0, -0.26, -0.16); segs[4].add(anal); keep(anal);
  mk(bladeGeo(0.18, 0.14, 0.05, 0.020, 0.04), M.shellSh, 'anal_blade', anal).rotation.set(0, PI / 2, -1.3);
  mk(blockGeo(0.055, 0.07, 0.14, 0.016, 0.006), M.metal, 'anal_base', anal, 0, 0.04, -0.02);
  const pelvics = [];
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    const pv = new THREE.Group(); pv.name = 'pelvic_' + nm; pv.position.set(sd * 0.18, -0.28, -0.30);
    segs[2].add(pv); keep(pv); pelvics.push(pv);
    for (let i = 0; i < 3; i++) {
      const b = mk(bladeGeo(0.30 - i * 0.04, 0.15, 0.05, 0.020, 0.05), M.shellSh, 'pelvic_blade_' + nm + '_' + i, pv, 0, -0.01 * i, -0.03 * i);
      b.rotation.set(PI / 2 - 0.5, sd > 0 ? -PI / 2 : PI / 2, 0);
    }
    mk(latheZ([[0, 0], [0.05, 0], [0.05, 0.045], [0, 0.045]], 10), M.bronze, 'pelvic_hub_' + nm, pv).rotation.y = sd * PI / 2;
    bolt(pv, 'pelvic_bolt_' + nm, 0, 0.03, 0.04, 0.6);
  }
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    const k = mk(bladeGeo(0.22, 0.10, 0.04, 0.030, 0.02), M.metalHi, 'caudal_keel_' + nm, segs[5], sd * 0.11, -0.01, -0.10);
    k.rotation.set(0, sd > 0 ? -PI / 2 : PI / 2, 0);
    for (let i = 0; i < 3; i++) mk(blockGeo(0.035, 0.030, 0.010, 0.008, 0.003), i % 2 ? M.accent : M.blued, 'hazard_' + nm + i, segs[5], sd * 0.15, 0.05, -0.05 - i * 0.045).rotation.set(0, sd * PI / 2, 0.6);
  }

  /* ---------------- CAUDAL FIN ---------------- */
  const caudal = new THREE.Group(); caudal.name = 'caudal_fin'; caudal.position.set(0, -0.02, -0.32);
  segs[5].add(caudal); keep(caudal);
  race(caudal, 'caudal_race', 0.115, 0.05, M.bronze).rotation.y = PI / 2;
  sprocket(caudal, 'caudal_gear', 0.075, 9, 0.03, M.metalHi).rotation.x = PI / 2;
  mk(blockGeo(0.10, 0.16, 0.22, 0.03, 0.010), M.metal, 'caudal_hub_block', caudal, 0, 0, -0.10);
  mk(latheZ([[0, 0], [0.026, 0], [0.026, 0.014], [0, 0.014]], 8), M.lampB, 'caudal_lamp', caudal, 0.07, 0.05, -0.02).rotation.y = PI / 2;
  const lobes = [];
  for (const up of [1, -1]) {
    const nm = up > 0 ? 'upper' : 'lower';
    const lobe = new THREE.Group(); lobe.name = 'caudal_' + nm; lobe.position.set(0, up * 0.04, -0.10);
    lobe.rotation.x = up > 0 ? -0.62 : -(PI - 0.72);
    caudal.add(lobe); keep(lobe); lobes.push(lobe);
    const L = up > 0 ? 1.24 : 0.94;
    mk(tube(0.022, 0.062, L, 6), M.metal, 'caudal_spar_' + nm, lobe, 0, L * 0.5, 0).rotation.x = PI / 2;
    for (let i = 0; i < 6; i++) {
      const u = i / 5, ln = (up > 0 ? 0.44 : 0.34) * (1 - u * 0.28) + 0.06;
      const b = mk(bladeGeo(ln, 0.24 - u * 0.05, 0.06, 0.026, 0.05), i % 2 ? M.shellW : M.shellD, 'caudal_blade_' + nm + '_' + i, lobe, 0, 0.10 + u * (L * 0.78), 0);
      b.rotation.set(0, PI / 2, up > 0 ? -0.30 - u * 0.55 : 0.35 + u * 0.5);
      b.position.x = (i % 2 ? 0.012 : -0.012);
    }
    const sh = mk(wrapShell(0.045, 0.11, L * 0.44, PI / 2, 1.4, 14), M.shellD, 'caudal_shell_' + nm + '_R', lobe, 0.03, L * 0.26, 0);
    sh.rotation.set(PI / 2, 0, 0); seam(sh, 1, 0, 0);
    const sh2 = mk(wrapShell(0.045, 0.11, L * 0.44, -PI / 2, 1.4, 14), M.shellD, 'caudal_shell_' + nm + '_L', lobe, -0.03, L * 0.26, 0);
    sh2.rotation.set(PI / 2, 0, 0); seam(sh2, -1, 0, 0);
    chainRun(lobe, 'caudal_chain_' + nm, [[0.055, 0.06, 0.01], [0.06, L * 0.4, 0.0], [0.05, L * 0.75, -0.01]], 0.030, M.blued);
    hose(lobe, 'caudal_hose_' + nm, [[-0.062, 0.05, 0.03], [-0.082, L * 0.28, 0.015], [-0.078, L * 0.55, 0.0], [-0.062, L * 0.78, -0.015], [-0.048, L * 0.90, -0.02]], 0.016, M.rubber, 6);
    boltRow(lobe, 'caudal_bolt_' + nm, 0.05, 0.12, 0.03, 0.05, L * 0.7, 0.0, 4, 0.6, 0, PI / 2);
    ram(lobe, 'caudal_ram_' + nm, 0.26, 0.026, M.metal).rotation.set(-PI / 2, 0, 0);
  }

  /* ================= PASS 6 — THE CABLE HARNESS, OUTSIDE THE ARMOUR =================
     Every run lives in ONE moving part's local space. Runs that must cross a joint
     are SPLIT at that joint: each half lands in its own flanged port, facing the
     other across the gap, so the joint is where the plumbing is most visible. */

  // --- thorax: three trunk lines a side, over the shoulder, and a belly return ---
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    harnRun(thorax, 'harness_spine_trunk_' + nm,
      arcPts(sd, 0.50, 0.38, 0.680, 0.615, 1.50, 0.04, 0.115, 3, 12),
      0.062, M.rubber, { clamps: [1 / 3, 2 / 3], foot: 0.105 });
    harnRun(thorax, 'harness_flank_trunk_' + nm,
      arcPts(sd, 1.00, 1.10, 0.615, 0.595, 1.46, -0.02, 0.140, 3, 12),
      0.070, M.rubber, { clamps: [1 / 3, 2 / 3], foot: 0.135 });
    harnRun(thorax, 'harness_shoulder_' + nm, [
      CP(sd, 0.30, 0.665, 1.06), CP(sd, 0.60, 0.760, 1.02), CP(sd, 0.95, 0.800, 0.98),
      CP(sd, 1.30, 0.790, 0.94), CP(sd, 1.62, 0.750, 0.90), CP(sd, 1.85, 0.660, 0.86),
      [sd * 0.50, -0.225, 0.82]
    ], 0.052, M.rubber, { clamps: [0.30, 0.62], foot: 0.105 });
    harnRun(thorax, 'harness_belly_' + nm,
      arcPts(sd, 2.10, 2.28, 0.575, 0.560, 1.42, -0.02, 0.115, 3, 12),
      0.046, M.rubber, { clamps: [1 / 3, 2 / 3], foot: 0.10 });
    // neck crossing: thorax half, landing on the atlas collar ring
    harnRun(thorax, 'harness_neck_' + nm, [
      CP(sd, 0.42, 0.660, 0.92), CP(sd, 0.46, 0.700, 1.12), CP(sd, 0.52, 0.640, 1.28),
      [sd * 0.235, 0.360, 1.395]
    ], 0.038, M.rubber, { clamps: [0.45], foot: 0.08 });
  }

  // --- head: dorsal trunk from the collar over the cranium to the rostrum, plus a jaw feed ---
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    harnRun(head, 'harness_head_spine_' + nm, [
      [sd * 0.210, 0.350, 0.02], [sd * 0.222, 0.395, 0.20], [sd * 0.228, 0.420, 0.40],
      [sd * 0.212, 0.362, 0.60], [sd * 0.192, 0.302, 0.80], [sd * 0.152, 0.248, 1.00],
      [sd * 0.116, 0.188, 1.20], [sd * 0.086, 0.138, 1.38], [sd * 0.066, 0.106, 1.47]
    ], 0.040, M.rubber, { clamps: [0.30, 0.66], foot: 0.075 });
    harnRun(head, 'harness_head_quad_' + nm, [
      [sd * 0.415, 0.075, 0.26], [sd * 0.500, -0.055, 0.305], [sd * 0.470, -0.205, 0.325],
      [sd * 0.375, -0.290, 0.310]
    ], 0.036, M.rubber, { clamps: [0.5], foot: 0.07 });
  }
  // jaw half of the same crossing, on the mandible boss
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    harnRun(jawL, 'harness_jaw_feed_' + nm, [
      [sd * 0.345, 0.030, 0.00], [sd * 0.400, -0.020, 0.16], [sd * 0.375, -0.075, 0.34],
      [sd * 0.300, -0.100, 0.50], [sd * 0.205, -0.090, 0.60]
    ], 0.026, M.rubber, { clamps: [0.5], in: [-sd * 0.9, 0.44, 0], foot: 0.05 });
  }

  // --- tail: a dorsal trunk over the top shell and a bundle in the upper gap, per segment ---
  for (let i = 0; i < segs.length; i++) {
    const d = SEGDEF[i], len = d[1], r0 = d[2], r1 = d[3], g = segs[i], nmS = d[0];
    const SF = r0 * 1.03 + 0.048, SR = r1 * 1.03 + 0.048;
    const zF = (i === 0 ? -0.12 : 0.05), zR = -len - 0.05;
    for (const sd of [1, -1]) {
      const nm = sd > 0 ? 'R' : 'L';
      harnRun(g, 'harness_spine_' + nmS + '_' + nm,
        arcPts(sd, 0.42, 0.38, SF, SR, zF, zR, Math.max(0.050, r0 * 0.21), 2, 11),
        Math.max(0.021, r0 * 0.095), M.rubber, { clamps: [0.5], foot: Math.max(0.05, r0 * 0.17) });
      harnRun(g, 'harness_gap_' + nmS + '_' + nm,
        arcPts(sd, 0.84, 0.90, r0 * 0.96, r1 * 0.96, zF, zR, Math.max(0.060, r0 * 0.30), 2, 11),
        Math.max(0.014, r0 * 0.050), M.rubber, { ribs: 0, clamps: [0.5], foot: Math.max(0.04, r0 * 0.14) });
    }
  }

  // --- fins: runs up the outside face of the dorsal and both caudal lobes ---
  for (const sd of [1, -1]) {
    const nm = sd > 0 ? 'R' : 'L';
    harnRun(dorsal, 'harness_dorsal_' + nm, [
      [sd * 0.075, 0.010, 0.16], [sd * 0.105, 0.180, 0.04], [sd * 0.112, 0.360, -0.10],
      [sd * 0.100, 0.540, -0.24], [sd * 0.078, 0.680, -0.35]
    ], 0.020, M.rubber, { clamps: [0.5], in: [-sd, 0, 0], foot: 0.045 });
  }
  for (let i = 0; i < lobes.length; i++) {
    const L = i === 0 ? 1.24 : 0.94, nm = i === 0 ? 'upper' : 'lower';
    harnRun(lobes[i], 'harness_caudal_' + nm, [
      [0.070, 0.045, 0.030], [0.092, L * 0.24, 0.015], [0.090, L * 0.50, 0.0],
      [0.074, L * 0.74, -0.015], [0.056, L * 0.90, -0.022]
    ], 0.022, M.rubber, { clamps: [0.5], in: [-1, 0, 0], foot: 0.045 });
  }
  // --- pectoral: outboard run over the top of the spar, its inboard mate on the girdle ---
  for (let i = 0; i < pecs.length; i++) {
    const sd = i === 0 ? 1 : -1, nm = sd > 0 ? 'R' : 'L';
    harnRun(pecs[i], 'harness_pec_' + nm, [
      [sd * 0.060, 0.105, 0.14], [sd * 0.240, 0.150, 0.07], [sd * 0.440, 0.150, 0.00],
      [sd * 0.640, 0.125, -0.07], [sd * 0.820, 0.080, -0.13], [sd * 0.940, 0.035, -0.17]
    ], 0.026, M.rubber, { clamps: [0.34, 0.70], in: [0, -1, 0], foot: 0.055 });
  }

  /* ================= POSE ================= */
  const nSeg = segs.length;
  root.userData.pose = (s) => {
    s = s || {};
    const t = s.t || 0;
    const sp = cl(s.speed || 0, 0, 7);
    const turn = cl(s.turn === undefined ? 0 : s.turn, -1, 1);
    const hp = s.health === undefined ? 1 : cl(s.health, 0, 1);
    const gnd = s.grounded === undefined ? true : !!s.grounded;
    const act = s.action || null;
    const ph = cl(s.phase || 0, 0, 1);
    const stride = s.stride || 0;

    for (let i = 0; i < rest.length; i++) {
      const o = rest[i], r = o.userData.__r;
      o.position.copy(r.p); o.rotation.copy(r.r); o.scale.copy(r.s);
    }

    const mv = ss(0.05, 0.55, sp), fast = ss(1.1, 2.7, sp), sprint = ss(2.8, 6.0, sp);
    const hk = ss(0.15, 0.85, 1 - hp);
    let cyc = 1, coil = 0, coilPh = 0, arch = 0;
    let jaw = 0.03 + 0.02 * Math.sin(t * 0.7), prot = 0, gillX = 0, seamK = 0, fanK = 0;
    let hdP = 0, hdY = 0, hdR = 0, bP = 0, bR = 0, bY = 0, bDY = 0, bDZ = 0, bDX = 0;
    let pSweep = 0.35 + 0.28 * fast - 0.14 * (1 - mv), pDih = -0.22 - 0.14 * (1 - mv) + 0.20 * sprint, pAoa = 0.05 - 0.06 * fast;
    let pecExtra = [0, 0], limp = 0, tailK = 1;

    if (!gnd) { cyc = 0.22; arch = -0.055; bP = -0.22; pSweep = 0.10; pDih = 0.30; pAoa = -0.18; jaw = 0.34; gillX = 0.30; tailK = 1.6; coil = 0.10; coilPh = t * 6.0; }

    if (act === 'attack') {
      cyc = 0.35;
      const w = ss(0, 0.3, ph), c = ss(0.28, 0.52, ph), snap = ss(0.52, 0.66, ph), rec = ss(0.68, 1, ph);
      jaw = 0.10 + 1.05 * (w * 0.55 + c * 0.45) * (1 - snap) + 0.05 * (1 - rec);
      prot = (w * 0.4 + c * 0.6) * (1 - snap);
      hdP = -0.30 * w + 0.34 * c - 0.10 * rec;
      bDZ = -0.16 * w + 0.62 * c - 0.42 * rec;
      bP = -0.14 * w + 0.12 * c;
      coil = 0.16 * w - 0.10 * c; coilPh = 1.2;
      hdY = 0.16 * Math.sin(ph * 34) * snap * (1 - rec);
      gillX = 0.25 * c;
    } else if (act === 'fire') {
      cyc = 0.20;
      const aim = ss(0, 0.4, ph), rel = ss(0.42, 0.52, ph), rc = ss(0.52, 0.78, ph), st = ss(0.78, 1, ph);
      jaw = 0.05 + 0.30 * aim - 0.18 * rc;
      hdP = -0.16 * aim + 0.10 * rc - 0.06 * st;
      gillX = -0.18 * aim + 0.75 * rel * (1 - rc) + 0.10 * rc;
      bDZ = -0.30 * rel * (1 - rc) - 0.10 * rc * (1 - st);
      bP = -0.05 * aim;
      coil = 0.05 * rel;
    } else if (act === 'hit') {
      cyc = 0.5;
      const f = Math.sin(PI * Math.min(1, ph * 2.0)) * Math.exp(-3.2 * ph);
      bR = 0.34 * f; bY = 0; hdY = -0.42 * f; hdP = 0.18 * f;
      bDX = -0.20 * f; coil = 0.20 * f; coilPh = 0.4;
      jaw = 0.28 * f; gillX = 0.30 * f; limp = 0.4 * f;
    } else if (act === 'block') {
      const k = ss(0, 0.22, ph) * (1 - ss(0.76, 1, ph));
      cyc = 1 - 0.75 * k;
      bDZ = -0.26 * k; bDY = -0.14 * k; bP = 0.30 * k;
      hdP = 0.18 * k; jaw = 0.02;
      coil = 0.13 * k; coilPh = 0.8; arch = 0.05 * k;
      pSweep = 0.35 - 0.55 * k; pDih = -0.22 + 0.55 * k; pAoa = 0.05 + 0.55 * k;
      gillX = -0.2 * k;
    } else if (act === 'gather' || act === 'deposit') {
      const dep = act === 'deposit';
      const dn = ss(0, dep ? 0.42 : 0.34, ph), grab = ss(dep ? 0.46 : 0.36, dep ? 0.72 : 0.58, ph), up = ss(dep ? 0.76 : 0.62, 1, ph);
      cyc = 0.45;
      bP = 0.52 * dn - 0.50 * up; bDY = -0.34 * dn + 0.32 * up; bDZ = 0.10 * dn - 0.08 * up;
      hdP = 0.24 * dn - 0.22 * up;
      jaw = dep ? (0.05 + 0.65 * grab * (1 - up)) : (0.70 * dn * (1 - grab) + 0.04);
      pSweep = 0.18; pDih = -0.44 * dn + 0.2 * up; pAoa = -0.2 * dn;
    } else if (act === 'eat') {
      cyc = 0.30;
      const inK = ss(0, 0.16, ph) * (1 - ss(0.86, 1, ph));
      bP = 0.44 * inK; bDY = -0.30 * inK; hdP = 0.22 * inK;
      const chew = 0.5 + 0.5 * Math.sin(ph * TAU * 3 - PI / 2);
      jaw = 0.05 + 0.62 * chew * inK;
      hdY = 0.24 * Math.sin(ph * TAU * 6) * inK;
      coil = 0.08 * Math.sin(ph * TAU * 6) * inK; coilPh = 0.5;
      gillX = 0.22 * chew * inK;
    } else if (act === 'drink') {
      cyc = 0.18;
      const inK = ss(0, 0.22, ph) * (1 - ss(0.80, 1, ph));
      bP = 0.46 * inK; bDY = -0.32 * inK; hdP = 0.20 * inK;
      jaw = 0.05 + 0.14 * inK;
      gillX = 0.16 * inK * (0.5 + 0.5 * Math.sin(t * 2.2));
      pDih = -0.40 * inK - 0.10;
    } else if (act === 'jump') {
      const load = ss(0, 0.34, ph), ext = ss(0.34, 1, ph);
      cyc = 0.25;
      coil = 0.30 * load * (1 - ext * 0.9); coilPh = 0.0;
      bDY = -0.22 * load + 0.62 * ext; bP = 0.14 * load - 0.60 * ext;
      bDZ = -0.10 * load + 0.30 * ext;
      arch = 0.05 * load - 0.05 * ext;
      jaw = 0.06 + 0.42 * ext; gillX = 0.35 * ext;
      pSweep = 0.55 - 0.35 * load + 0.20 * ext; pDih = -0.30 * load + 0.35 * ext;
      tailK = 1.0 + 1.2 * ext;
    } else if (act === 'land') {
      const reach = ss(0, 0.30, ph), shock = ss(0.30, 0.52, ph), push = ss(0.55, 1, ph);
      cyc = 0.30;
      bP = 0.42 * reach - 0.30 * shock - 0.10 * push;
      bDY = 0.16 * reach - 0.46 * shock + 0.32 * push;
      pSweep = 0.10; pDih = 0.30 * reach - 0.45 * shock + 0.20 * push; pAoa = -0.30 * reach + 0.15 * shock;
      coil = 0.18 * shock * (1 - push); coilPh = 2.0;
      jaw = 0.30 * reach - 0.24 * shock; gillX = 0.30 * shock * (1 - push);
      arch = -0.04 * reach + 0.06 * shock;
    } else if (act === 'signal') {
      const rise = ss(0, 0.30, ph), hold = ss(0.28, 0.40, ph) * (1 - ss(0.62, 0.80, ph)), down = ss(0.72, 1, ph);
      const k = rise * (1 - down);
      cyc = 0.35;
      bDY = 0.28 * k; bP = -0.30 * k; arch = -0.10 * k;
      jaw = 0.10 + 0.95 * k; gillX = 0.85 * k; prot = 0.35 * k;
      fanK = 0.9 * k; hdP = -0.16 * k;
      pSweep = 0.35 - 0.45 * k; pDih = -0.22 + 0.55 * k; pAoa = 0.05 - 0.25 * k;
      coil = 0.05 * Math.sin(t * 18) * hold;
    } else if (act === 'sleep') {
      const k = ss(0, 0.85, ph);
      cyc = 1 - 0.97 * k;
      bDY = -0.60 * k; bR = 0.40 * k; bP = 0.06 * k;
      coil = 0.16 * k; coilPh = 0.0;
      jaw = 0.02; gillX = -0.25 * k + 0.05 * (1 - k);
      pSweep = 0.35 + 0.30 * k; pDih = -0.22 - 0.45 * k; limp = 0.7 * k;
      hdP = 0.14 * k;
    } else if (act === 'wake') {
      const k = 1 - ss(0.15, 0.95, ph);
      const stir = Math.sin(PI * ss(0, 0.3, ph)) * (1 - ss(0.3, 0.5, ph));
      cyc = 1 - 0.9 * k;
      bDY = -0.60 * k; bR = 0.40 * k; bP = 0.06 * k;
      coil = 0.16 * k + 0.10 * stir; coilPh = 0.0;
      gillX = -0.25 * k + 0.45 * stir;
      jaw = 0.02 + 0.20 * stir;
      pSweep = 0.35 + 0.30 * k; pDih = -0.22 - 0.45 * k; limp = 0.7 * k;
      hdP = 0.14 * k - 0.10 * stir;
    } else if (act === 'die') {
      const thr = Math.sin(PI * ss(0, 0.24, ph)) * (1 - ss(0.20, 0.34, ph));
      const roll = ss(0.20, 0.72, ph), sink = ss(0.16, 0.86, ph), still = ss(0.72, 1, ph);
      cyc = 0.9 * thr;
      coil = 0.34 * thr + 0.12 * roll * (1 - still); coilPh = t * 9;
      bR = 2.92 * roll; bDY = -0.62 * sink; bP = 0.10 * sink;
      jaw = 0.06 + 0.34 * sink;
      gillX = 0.30 * thr + 0.10 * sink;
      limp = 0.95 * sink;
      pSweep = 0.35 - 0.25 * sink; pDih = -0.22 - 0.30 * sink;
      hdP = 0.26 * sink; tailK = 0.2;
    } else if (act === 'evolve') {
      const brace = ss(0, 0.24, ph), open = ss(0.24, 0.48, ph), hold = ss(0.44, 0.55, ph) * (1 - ss(0.66, 0.78, ph)), close = ss(0.72, 1, ph);
      const k = open * (1 - close);
      cyc = 0.25;
      seamK = k; fanK = k; gillX = 0.9 * k;
      bDY = 0.16 * k - 0.06 * brace; bP = 0.14 * brace - 0.16 * k;
      jaw = 0.05 + 0.5 * k; prot = 0.25 * k;
      arch = 0.06 * brace - 0.08 * k;
      const trem = Math.sin(ph * 62) * 0.012 * (brace + hold);
      coil = trem; coilPh = 0.0;
      pSweep = 0.35 - 0.30 * k; pDih = -0.22 + 0.30 * k;
    }

    if (hk > 0) {
      cyc *= 1 - 0.35 * hk;
      bR += 0.20 * hk; bP += 0.10 * hk; bDY -= 0.06 * hk;
      hdP += 0.20 * hk; hdY += -0.10 * hk;
      jaw += 0.12 * hk; gillX += 0.18 * hk * (0.5 + 0.5 * Math.sin(t * 3.1));
      limp = Math.max(limp, 0.55 * hk);
      pecExtra[1] = -0.42 * hk;
      coil += 0.05 * hk * Math.sin(t * 1.7);
    }

    const beat = stride * TAU, idleP = t * 1.15;
    const amp = (0.042 + 0.078 * ss(0, 3, sp) + 0.032 * ss(3, 6, sp)) * cyc * tailK;
    const iamp = 0.026 * cyc;
    for (let i = 0; i < nSeg; i++) {
      const lag = 0.62 * (i + 1), prof = 0.30 + 0.90 * Math.pow(i / (nSeg - 1), 1.2);
      let y = amp * prof * Math.sin(beat - lag) * mv
        + iamp * prof * Math.sin(idleP * 0.85 - lag * 0.5) * (1 - 0.75 * mv);
      y += coil * Math.sin(coilPh + i * 0.62) * (0.30 + 0.70 * i / (nSeg - 1));
      y += -turn * 0.055 * (0.4 + 0.6 * i / (nSeg - 1));
      const o = segs[i], r = o.userData.__r;
      o.rotation.y = r.r.y + y;
      o.rotation.x = r.r.x + arch * (0.4 + 0.6 * i / (nSeg - 1));
      o.rotation.z = r.r.z + turn * 0.035 * (i / (nSeg - 1)) + limp * 0.05 * Math.sin(i * 1.7);
    }
    const lagT = 0.62 * (nSeg + 1);
    const tailY = amp * 1.30 * Math.sin(beat - lagT) * mv + iamp * 1.2 * Math.sin(idleP * 0.85 - lagT * 0.5) * (1 - 0.75 * mv) + coil * 0.9 * Math.sin(coilPh + nSeg * 0.62);
    caudal.rotation.y = caudal.userData.__r.r.y + tailY;
    caudal.rotation.z = caudal.userData.__r.r.z + limp * 0.12;
    for (let i = 0; i < lobes.length; i++) {
      const L = lobes[i], r = L.userData.__r;
      L.rotation.y = r.r.y + tailY * (0.42 + i * 0.10);
      L.rotation.x = r.r.x + (i === 0 ? -0.05 : 0.05) * sprint + limp * (i === 0 ? 0.30 : -0.18);
    }

    thorax.rotation.y = thorax.userData.__r.r.y - 0.30 * amp * Math.sin(beat - 0.2) * mv + turn * 0.05;
    thorax.rotation.x = thorax.userData.__r.r.x + arch * 0.3;
    const hr = head.userData.__r;
    head.rotation.y = hr.r.y + 0.45 * amp * Math.sin(beat + 0.5) * mv + hdY + turn * 0.22;
    head.rotation.x = hr.r.x + hdP + 0.05 * (1 - mv) * Math.sin(t * 0.9) - 0.05 * sprint;
    head.rotation.z = hr.r.z + hdR - turn * 0.10 + limp * 0.10;

    jawL.rotation.x = jawL.userData.__r.r.x + cl(jaw, 0, 1.15);
    jawL.position.z = jawL.userData.__r.p.z + 0.02 * cl(jaw, 0, 1.15);
    jawU.position.z = jawU.userData.__r.p.z + 0.17 * prot;
    jawU.position.y = jawU.userData.__r.p.y - 0.075 * prot;
    jawU.rotation.x = jawU.userData.__r.r.x + 0.16 * prot;

    for (let i = 0; i < 5; i++) {
      const puls = (1 - mv) * (0.5 + 0.5 * Math.sin(idleP * 1.6 - i * 0.38)) * 0.34 + mv * 0.10;
      const op = cl(puls + gillX * (1 - i * 0.06), -0.05, 1.05);
      gillsR[i].rotation.y = PI / 2 - op;
      gillsL[i].rotation.y = -PI / 2 + op;
    }

    for (let i = 0; i < pecs.length; i++) {
      const sd = i === 0 ? 1 : -1, p = pecs[i], r = p.userData.__r;
      const inside = (turn > 0) === (sd > 0);
      const tw = Math.abs(turn) * (inside ? -1 : 1);
      p.rotation.y = r.r.y + sd * (pSweep - 0.35);
      p.rotation.z = r.r.z + sd * (pDih + 0.22 + tw * 0.30) + (i === 1 ? pecExtra[1] : 0) - limp * 0.28 * (i === 1 ? 1 : 0.5);
      p.rotation.x = r.r.x + pAoa - 0.05 + tw * 0.18 + 0.03 * Math.sin(idleP * 0.7 + i);
    }
    for (let i = 0; i < pelvics.length; i++) {
      const sd = i === 0 ? 1 : -1, p = pelvics[i], r = p.userData.__r;
      p.rotation.z = r.r.z + sd * (0.10 * (1 - mv) + 0.06 * Math.sin(idleP * 0.8 + i * 2)) - limp * 0.20;
      p.rotation.y = r.r.y - turn * 0.12 * sd;
    }
    for (let i = 0; i < dorsalBlades.length; i++) {
      const b = dorsalBlades[i], r = b.userData.__r, u = i / (dorsalBlades.length - 1);
      b.rotation.z = r.r.z - fanK * (0.22 * (u - 0.5) * 2);
      b.position.x = r.p.x * (1 + 1.6 * fanK) + seamK * 0.02 * (i - 2);
      b.rotation.y = r.r.y + fanK * 0.10 * (u - 0.5);
    }
    dorsal.rotation.z = dorsal.userData.__r.r.z - turn * 0.16 - limp * 0.10;
    dorsal.rotation.x = dorsal.userData.__r.r.x + 0.05 * sprint;

    for (let i = 0; i < seams.length; i++) {
      const sm = seams[i], o = sm.o, r = o.userData.__r;
      if (seamK > 0.001) {
        o.position.set(r.p.x + sm.d.x * 0.085 * seamK, r.p.y + sm.d.y * 0.085 * seamK, r.p.z + sm.d.z * 0.085 * seamK);
        o.scale.set(r.s.x * (1 + 0.02 * seamK), r.s.y * (1 + 0.02 * seamK), r.s.z);
      }
    }

    chassis.position.set(bDX, 1.05 + bDY, bDZ);
    chassis.rotation.set(bP + 0.02 * Math.sin(t * 0.6) * (1 - mv), bY, bR + (-turn * 0.34) + 0.04 * Math.sin(t * 0.5) * (1 - mv) + 0.05 * amp * Math.sin(beat - 1.2) * mv * 6);
    const stz = 1 + 0.02 * sprint;
    chassis.scale.set(1, 1 - 0.012 * sprint, stz);
  };
  keep(chassis);
  root.userData.update = (t, dt) => {
    root.userData.pose({ t: t, dt: dt, speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0 });
  };
  root.userData.pose({ t: 0, dt: 0, speed: 0, stride: 0, turn: 0, grounded: true, health: 1 });
  return root;
}
```