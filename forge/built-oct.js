function build(THREE, TSL) {
  // ONE QUALITY: MASS AND POWER — a low, heavy, wide armoured dome dragging itself on eight thick machine arms.
  //
  // BRIEF:
  //  - A single oblate mantle dome carried high and back (L1.70 x W1.30 x H0.95), built as a
  //    stack of 7 ribs on an I-beam keel, packed with a chain run over two sprockets, gear
  //    stacks, three rams, segment blocks and ducting, then clad in 8 overlapping bone-white
  //    pressed shells plus an apex cap and a 9-blade dorsal ridge.
  //  - The eyes sit on a pinched waist BELOW and FORWARD of the mantle, bulging sideways as
  //    two transverse barrels with recessed dark glass lenses in machined bezels.
  //  - Eight arms on a Ø0.86 bearing crown, crowded forward (±24/68/115/156°), 7 tapering
  //    D-section segments each, oversized joint barrels, rams, chain, biserial machined
  //    sucker cups on the oral face only, and a 3-link + claw coiled tip.
  //  - Eight separate web panels lap between arm bases and are the shield in `block`.
  //  - A gimballed funnel nozzle at the right-front of the mantle base is the ranged weapon.
  //  - Expensive detail lives on the UPWARD faces: lap seams showing the chain, the ridge
  //    blades, bolt rows, the open hatch, the aux module, and the joint-barrel rhythm down
  //    every arm read from above.

  const P = Math.PI;
  const D = P / 180;

  // ─────────────────────────────────────────────────────────────── materials
  const NM = (o) => {
    const m = new THREE.MeshStandardNodeMaterial(o);
    return m;
  };

  const COL = {
    shell: 0xD8D2C6, shellShadow: 0xC9C2B4, shellWorn: 0xB5AC9C,
    machine: 0x55524C, machineBright: 0x6B665E, blued: 0x3E3A34,
    bronze: 0x4A4238, rubber: 0x1E1D1B, lens: 0x141312,
    rust: 0xC2521E, red: 0xA8231C
  };

  const MAT = {
    SHELL:  NM({ color: COL.shell,       metalness: 0.12, roughness: 0.60 }),
    SHELL_SHADOW: NM({ color: COL.shellShadow, metalness: 0.12, roughness: 0.62, side: THREE.DoubleSide }),
    SHELL_D: NM({ color: COL.shell,      metalness: 0.12, roughness: 0.60, side: THREE.DoubleSide }),
    SHELL_WORN: NM({ color: COL.shellWorn, metalness: 0.15, roughness: 0.66, side: THREE.DoubleSide }),
    MACHINE: NM({ color: COL.machine,    metalness: 0.82, roughness: 0.55 }),
    BRIGHT:  NM({ color: COL.machineBright, metalness: 0.85, roughness: 0.45 }),
    BLUED:   NM({ color: COL.blued,      metalness: 0.78, roughness: 0.62 }),
    BRONZE:  NM({ color: COL.bronze,     metalness: 0.80, roughness: 0.68 }),
    RUBBER:  NM({ color: COL.rubber,     metalness: 0.0,  roughness: 0.92 }),
    LENS:    NM({ color: COL.lens,       metalness: 0.10, roughness: 0.07 }),
    RUST:    NM({ color: COL.rust,       metalness: 0.08, roughness: 0.62 }),
    RED:     NM({ color: COL.red,        metalness: 0.08, roughness: 0.62 }),
    EMIT_A:  NM({ color: 0x2A211A,       metalness: 0.2,  roughness: 0.5 }),
    EMIT_C:  NM({ color: 0x16232A,       metalness: 0.2,  roughness: 0.5 })
  };

  // ───────────────────────────────────────────── TSL wear shader (shared)
  const {
    Fn, vec2, vec3, vec4, float, positionLocal, normalLocal, uniform,
    mix, smoothstep, step, fract, floor, dot, clamp, pow, abs, oneMinus,
    sin, max, min, add, mul, sub, div, length
  } = TSL;

  // continuous value noise (hash lattice + smoothstep interpolation)
  const hash3 = Fn(([p]) => {
    const q = p.mul(vec3(127.1, 311.7, 74.7));
    return fract(sin(q.x.add(q.y).add(q.z)).mul(43758.5453));
  });

  const vnoise = Fn(([p]) => {
    const i = floor(p);
    const f = p.sub(i);
    const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
    const c000 = hash3(i.add(vec3(0, 0, 0)));
    const c100 = hash3(i.add(vec3(1, 0, 0)));
    const c010 = hash3(i.add(vec3(0, 1, 0)));
    const c110 = hash3(i.add(vec3(1, 1, 0)));
    const c001 = hash3(i.add(vec3(0, 0, 1)));
    const c101 = hash3(i.add(vec3(1, 0, 1)));
    const c011 = hash3(i.add(vec3(0, 1, 1)));
    const c111 = hash3(i.add(vec3(1, 1, 1)));
    const x00 = mix(c000, c100, u.x);
    const x10 = mix(c010, c110, u.x);
    const x01 = mix(c001, c101, u.x);
    const x11 = mix(c011, c111, u.x);
    return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
  });

  // one wear material per base colour / wear amount, cached
  const wearCache = new Map();
  function wearMat(base, metal, rough, wearAmount, crevice, dbl) {
    const key = [base, metal, rough, wearAmount, crevice, dbl ? 1 : 0].join('|');
    if (wearCache.has(key)) return wearCache.get(key);

    const m = new THREE.MeshStandardNodeMaterial({
      color: base, metalness: metal, roughness: rough,
      side: dbl ? THREE.DoubleSide : THREE.FrontSide
    });

    const uBase = uniform(new THREE.Color(base));
    const uWear = uniform(wearAmount);
    const uCrev = uniform(crevice);
    const uR = uniform(0.55);

    const bareMetal = uniform(new THREE.Color(COL.machineBright));
    const grimeCol = uniform(new THREE.Color(COL.blued));
    const rustCol = uniform(new THREE.Color(COL.bronze));
    const rustHot = uniform(new THREE.Color(COL.rust));
    const dustCol = uniform(new THREE.Color(COL.shellShadow));
    const wornCol = uniform(new THREE.Color(COL.shellWorn));

    const shade = Fn(() => {
      const pl = positionLocal.div(uR);
      // three octaves of continuous noise
      const n = vnoise(pl.mul(3.0)).mul(1.0)
        .add(vnoise(pl.mul(7.5)).mul(0.5))
        .add(vnoise(pl.mul(19.0)).mul(0.25)).div(1.75);
      const nLow = vnoise(pl.mul(2.2));

      // edge mask: high near the part's outer boundary
      const r = length(pl);
      const edge = smoothstep(0.42, 1.05, r);
      const rim = pow(oneMinus(abs(normalLocal.y)), 1.5).mul(0.5).add(0.5);

      let c = uBase.toVar();

      // 1/2 chipping to bare metal at edges & corners
      const chip = step(0.60, n.mul(edge.mul(rim).mul(0.85).add(0.22)));
      c.assign(mix(c, bareMetal, chip.mul(uWear).mul(0.85)));

      // paint worn thin on high points (upward-forward facing)
      const high = pow(clamp(dot(normalLocal, TSL.normalize(vec3(0.0, 1.0, 0.35))), 0.0, 1.0), 3.0);
      c.assign(mix(c, wornCol, high.mul(0.35).mul(uWear)));

      // 3 rust bleeding downward from fasteners/seams — vertically stretched noise
      const drip = clamp(float(0.5).sub(pl.y).mul(0.85), 0.0, 1.0);
      const streakN = vnoise(vec3(pl.x.mul(9.0), pl.y.mul(1.6), pl.z.mul(9.0)));
      const streak = smoothstep(0.55, 0.86, streakN).mul(drip).mul(edge.mul(0.6).add(0.4)).mul(uWear);
      c.assign(mix(c, rustCol, streak.mul(0.7)));
      c.assign(mix(c, rustHot, streak.mul(0.25)));

      // 4 grime in recesses / crevices
      const crev = smoothstep(0.0, -0.7, normalLocal.y).mul(smoothstep(0.30, 0.80, nLow));
      const crevT = clamp(crev.add(uCrev), 0.0, 1.0);
      c.assign(mix(c, grimeCol, crevT.mul(0.30)));

      // 5 dust on upward faces
      const up = clamp(normalLocal.y, 0.0, 1.0);
      c.assign(mix(c, dustCol, up.mul(0.07)));

      return vec4(c, 1.0);
    });

    const roughNode = Fn(() => {
      const up = clamp(normalLocal.y, 0.0, 1.0);
      const crev = smoothstep(0.0, -0.7, normalLocal.y);
      return clamp(float(rough).add(up.mul(0.16)).add(crev.mul(0.15)).add(uCrev.mul(0.1)), 0.30, 1.0);
    });

    m.colorNode = shade();
    m.roughnessNode = roughNode();
    wearCache.set(key, m);
    return m;
  }

  // wear-shaded variants of the main materials
  const W = {
    SHELL: wearMat(COL.shell, 0.12, 0.60, 1.0, 0.0, false),
    SHELL_D: wearMat(COL.shell, 0.12, 0.60, 1.0, 0.0, true),
    SHELL_SH: wearMat(COL.shellShadow, 0.12, 0.62, 0.8, 0.10, true),
    SHELL_WORN: wearMat(COL.shellWorn, 0.15, 0.66, 1.3, 0.0, true),
    MACHINE: wearMat(COL.machine, 0.82, 0.55, 0.7, 0.06, false),
    MACHINE_D: wearMat(COL.machine, 0.82, 0.55, 0.7, 0.06, true),
    BRIGHT: wearMat(COL.machineBright, 0.85, 0.45, 0.5, 0.0, false),
    BLUED: wearMat(COL.blued, 0.78, 0.62, 0.6, 0.22, false),
    BRONZE: wearMat(COL.bronze, 0.80, 0.68, 1.1, 0.10, false),
    RUST: wearMat(COL.rust, 0.08, 0.62, 1.2, 0.0, false),
    RED: wearMat(COL.red, 0.08, 0.62, 1.0, 0.0, false)
  };
  const M_RUBBER = MAT.RUBBER;
  const M_LENS = MAT.LENS;

  // emissive materials (exactly two parts)
  const mkEmit = (hex, inten) => {
    const m = new THREE.MeshStandardNodeMaterial({ color: 0x101010, metalness: 0.2, roughness: 0.5 });
    m.emissiveNode = TSL.vec3(new THREE.Color(hex).r * inten, new THREE.Color(hex).g * inten, new THREE.Color(hex).b * inten);
    return m;
  };
  const M_EMIT_AMBER = mkEmit(0xC2701E, 1.6);
  const M_EMIT_CYAN = mkEmit(0x3FA8B8, 1.2);

  // ───────────────────────────────────────────────────────── helpers
  let uid = 0;
  const mesh = (geo, mat, name, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name || ('part' + (uid++));
    if (parent) parent.add(m);
    return m;
  };
  const grp = (name, parent) => {
    const g = new THREE.Group();
    g.name = name;
    if (parent) parent.add(g);
    return g;
  };

  // faceted tapered stock
  const cyl = (rT, rB, h, seg = 8, open = false) =>
    new THREE.CylinderGeometry(rT, rB, h, seg, 1, open);

  // hex bolt head
  const boltGeo = new THREE.CylinderGeometry(0.010, 0.012, 0.009, 6);
  const boltGeoS = new THREE.CylinderGeometry(0.006, 0.0075, 0.006, 6);
  function bolt(parent, x, y, z, s, small) {
    const b = mesh(small ? boltGeoS : boltGeo, W.BLUED, 'bolt', parent);
    b.position.set(x, y, z);
    if (s) b.scale.setScalar(s);
    return b;
  }
  // ring of bolts on a face (plane = 'xz' up, or 'xy' facing z)
  function boltRing(parent, n, r, y, plane, s, small) {
    for (let i = 0; i < n; i++) {
      const a = i / n * P * 2;
      const b = mesh(small ? boltGeoS : boltGeo, W.BLUED, 'bolt', parent);
      if (plane === 'xy') { b.position.set(Math.cos(a) * r, Math.sin(a) * r, y); b.rotation.x = P / 2; }
      else { b.position.set(Math.cos(a) * r, y, Math.sin(a) * r); }
      if (s) b.scale.setScalar(s);
    }
  }
  function boltRow(parent, n, x0, y0, z0, dx, dy, dz, s) {
    for (let i = 0; i < n; i++) bolt(parent, x0 + dx * i, y0 + dy * i, z0 + dz * i, s, true);
  }

  // lathed part from profile points
  function lathe(pts, seg = 16) {
    return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
  }

  // pressed plate: outline points, bevelled extrude
  function plate(pts, depth, holes) {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]);
      else sh.lineTo(p[0], p[1]);
    }
    sh.closePath();
    if (holes) for (const h of holes) {
      const hp = new THREE.Path();
      hp.moveTo(h[0][0], h[0][1]);
      for (let i = 1; i < h.length; i++) hp.lineTo(h[i][0], h[i][1]);
      hp.closePath();
      sh.holes.push(hp);
    }
    return new THREE.ExtrudeGeometry(sh, {
      depth: depth, bevelEnabled: true, bevelSize: Math.min(0.012, depth * 0.5),
      bevelThickness: Math.min(0.010, depth * 0.4), bevelSegments: 2, curveSegments: 6
    });
  }

  // partial cylinder shell (formed sheet round a volume)
  function shellCyl(rT, rB, len, thetaStart, thetaLen, seg = 20) {
    return new THREE.CylinderGeometry(rT, rB, len, seg, 1, true, thetaStart, thetaLen);
  }
  // rolled lip along a shell rim
  function lipTorus(r, tube, arc, seg = 18) {
    return new THREE.TorusGeometry(r, tube, 6, seg, arc);
  }

  // ram: barrel + polished rod + gland + clevis + boot. Along +Y, origin at barrel base.
  function ram(parent, name, rBar, len, rodOut) {
    const g = grp(name, parent);
    const bar = mesh(lathe([
      [0, 0], [rBar * 0.9, 0], [rBar, 0.012], [rBar, len * 0.86],
      [rBar * 0.82, len * 0.9], [rBar * 0.62, len * 0.94], [0, len * 0.94]
    ], 12), W.BLUED, name + '_barrel', g);
    const rodR = rBar * 0.45;
    const rod = mesh(cyl(rodR, rodR, rodOut, 10), W.BRIGHT, name + '_rod', g);
    rod.position.y = len * 0.94 + rodOut * 0.5;
    const gland = mesh(lathe([[0, 0], [rBar * 0.78, 0], [rBar * 0.78, 0.018], [rodR * 1.2, 0.024], [0, 0.024]], 10), W.BRIGHT, name + '_gland', g);
    gland.position.y = len * 0.9;
    const boot = mesh(lathe([
      [rodR * 1.05, 0], [rBar * 0.7, 0.006], [rodR * 1.05, 0.012], [rBar * 0.7, 0.018],
      [rodR * 1.05, 0.024], [rBar * 0.7, 0.030], [rodR * 1.05, 0.036]
    ], 10), M_RUBBER, name + '_boot', g);
    boot.position.y = len * 0.94;
    const cl = mesh(plate([[-rBar * 0.5, 0], [rBar * 0.5, 0], [rBar * 0.5, rBar * 0.9], [0, rBar * 1.25], [-rBar * 0.5, rBar * 0.9]], rBar * 0.5), W.MACHINE, name + '_clevis', g);
    cl.position.set(0, len * 0.94 + rodOut, -rBar * 0.25);
    boltRing(g, 6, rBar * 0.86, 0.010, 'xz', 0.55, true);
    return g;
  }

  // bearing race: concentric stepped discs + hub + cover plate w/ hole
  function race(parent, name, R, thick) {
    const g = grp(name, parent);
    mesh(lathe([
      [R * 0.30, 0], [R, 0], [R, thick * 0.45], [R * 0.86, thick * 0.55],
      [R * 0.86, thick], [R * 0.52, thick], [R * 0.52, thick * 0.7], [R * 0.30, thick * 0.7]
    ], 18), W.MACHINE, name + '_outer', g);
    const inner = mesh(lathe([[R * 0.14, 0], [R * 0.50, 0], [R * 0.50, thick * 1.15], [R * 0.14, thick * 1.15]], 16), W.BRIGHT, name + '_inner', g);
    const hub = mesh(cyl(R * 0.16, R * 0.20, thick * 1.5, 8), W.BRIGHT, name + '_hub', g);
    hub.position.y = thick * 0.6;
    const cov = mesh(lathe([[R * 0.22, 0], [R * 0.72, 0], [R * 0.72, 0.012], [R * 0.22, 0.012]], 16), W.BRIGHT, name + '_cover', g);
    cov.position.y = thick * 1.16;
    boltRing(g, 8, R * 0.80, thick + 0.006, 'xz', 0.6, true);
    return g;
  }

  // gear stack: 3 stepped discs + teeth boxes
  const toothGeo = new THREE.BoxGeometry(1, 1, 1);
  function gearStack(parent, name, r1, r2, r3, teeth) {
    const g = grp(name, parent);
    const d1 = mesh(lathe([[r1 * 0.2, 0], [r1, 0], [r1, 0.026], [r1 * 0.2, 0.026]], 18), W.MACHINE, name + '_d1', g);
    const d2 = mesh(lathe([[r2 * 0.2, 0], [r2, 0], [r2, 0.022], [r2 * 0.2, 0.022]], 16), W.BRIGHT, name + '_d2', g);
    d2.position.y = 0.028;
    const d3 = mesh(lathe([[r3 * 0.25, 0], [r3, 0], [r3, 0.020], [r3 * 0.25, 0.020]], 14), W.BRONZE, name + '_d3', g);
    d3.position.y = 0.052;
    const hub = mesh(cyl(r3 * 0.4, r3 * 0.5, 0.086, 8), W.BRIGHT, name + '_hub', g);
    hub.position.y = 0.036;
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * P * 2;
      const t = mesh(toothGeo, W.BRONZE, name + '_tooth', g);
      t.position.set(Math.cos(a) * (r1 + 0.010), 0.013, Math.sin(a) * (r1 + 0.010));
      t.scale.set(0.016, 0.020, 0.011);
      t.rotation.y = -a;
    }
    boltRing(g, 6, r1 * 0.55, 0.027, 'xz', 0.5, true);
    return g;
  }

  // sprocket
  function sprocket(parent, name, R, teeth) {
    const g = grp(name, parent);
    mesh(lathe([[R * 0.18, 0], [R, 0], [R, 0.020], [R * 0.66, 0.026], [R * 0.18, 0.026]], 16), W.MACHINE, name + '_disc', g);
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * P * 2;
      const t = mesh(toothGeo, W.BRONZE, name + '_t', g);
      t.position.set(Math.cos(a) * (R + 0.008), 0.010, Math.sin(a) * (R + 0.008));
      t.scale.set(0.013, 0.016, 0.009);
      t.rotation.y = -a;
    }
    const hub = mesh(cyl(R * 0.22, R * 0.26, 0.038, 8), W.BRIGHT, name + '_hub', g);
    hub.position.y = 0.008;
    return g;
  }

  // chain run of links along a curve (built in the parent's local space)
  const linkGeo = new THREE.BoxGeometry(0.045, 0.022, 0.030);
  const pinGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.036, 6);
  function chainRun(parent, name, curve, n, scale) {
    const g = grp(name, parent);
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const p = curve.getPointAt ? curve.getPointAt(t) : curve.getPoint(t);
      const tan = curve.getTangentAt ? curve.getTangentAt(t) : curve.getTangent(t);
      const l = mesh(linkGeo, W.BLUED, name + '_link' + i, g);
      l.position.copy(p);
      l.scale.setScalar(scale || 1);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), tan.clone().normalize());
      l.quaternion.copy(q);
      if (i % 2 === 0) {
        const pn = mesh(pinGeo, W.BRIGHT, name + '_pin' + i, g);
        pn.position.copy(p);
        pn.scale.setScalar(scale || 1);
        pn.quaternion.copy(q);
        pn.rotateX(P / 2);
      }
    }
    return g;
  }

  // hose run: tube along a curve, with corrugation rings and clamps
  function hose(parent, name, pts, r, corrug, clampAt) {
    const g = grp(name, parent);
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const tg = new THREE.TubeGeometry(curve, Math.max(10, pts.length * 5), r, 7, false);
    mesh(tg, M_RUBBER, name + '_tube', g);
    if (corrug) {
      for (let i = 0; i < 11; i++) {
        const t = 0.04 + 0.92 * (i / 10);
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        const rg = mesh(new THREE.TorusGeometry(r * 1.05, r * 0.30, 5, 8), M_RUBBER, name + '_cor', g);
        rg.position.copy(p);
        rg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.clone().normalize());
      }
    }
    if (clampAt) for (const t of clampAt) {
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const c = mesh(lathe([[r * 1.05, 0], [r * 1.9, 0], [r * 1.9, 0.016], [r * 1.05, 0.016]], 10), W.BLUED, name + '_clamp', g);
      c.position.copy(p);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.clone().normalize());
      const tie = mesh(new THREE.TorusGeometry(r * 1.25, r * 0.18, 4, 10), M_RUBBER, name + '_tie', g);
      tie.position.copy(curve.getPointAt(Math.min(0.97, t + 0.06)));
      tie.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), curve.getTangentAt(Math.min(0.97, t + 0.06)).clone().normalize());
    }
    return g;
  }

  // flanged port collar — where every hose lands
  function port(parent, name, r, x, y, z, dir) {
    const g = grp(name, parent);
    mesh(lathe([
      [r * 0.55, 0], [r * 1.5, 0], [r * 1.5, 0.010], [r * 1.0, 0.016],
      [r * 1.0, 0.034], [r * 0.62, 0.034], [r * 0.62, 0.012], [r * 0.55, 0.012]
    ], 12), W.MACHINE, name + '_collar', g);
    boltRing(g, 6, r * 1.25, 0.011, 'xz', 0.45, true);
    g.position.set(x, y, z);
    if (dir) g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return g;
  }

  // blanking plate
  function blank(parent, name, r, x, y, z) {
    const g = grp(name, parent);
    mesh(lathe([[0, 0], [r, 0], [r, 0.012], [r * 0.7, 0.016], [0, 0.016]], 10), W.MACHINE, name + '_disc', g);
    boltRing(g, 4, r * 0.66, 0.017, 'xz', 0.45, true);
    g.position.set(x, y, z);
    return g;
  }

  // junction block
  function junction(parent, name, sx, sy, sz, x, y, z) {
    const g = grp(name, parent);
    const b = mesh(plate([[-sx, -sz], [sx, -sz], [sx * 1.0, sz * 0.7], [sx * 0.6, sz], [-sx * 0.8, sz]], sy), W.MACHINE, name + '_body', g);
    b.rotation.x = -P / 2;
    bolt(g, -sx * 0.6, sy * 0.5, -sz * 0.6, 0.6, true);
    bolt(g, sx * 0.6, sy * 0.5, -sz * 0.6, 0.6, true);
    mesh(lathe([[0.006, 0], [0.014, 0], [0.014, 0.010], [0.007, 0.010]], 8), W.BRIGHT, name + '_p1', g).position.set(sx * 0.5, sy * 0.5, sz * 0.4);
    mesh(lathe([[0.006, 0], [0.014, 0], [0.014, 0.010], [0.007, 0.010]], 8), W.BRIGHT, name + '_p2', g).position.set(-sx * 0.5, sy * 0.5, sz * 0.4);
    g.position.set(x, y, z);
    return g;
  }

  // vent grille of individual slats
  function grille(parent, name, n, w, h, gap, x, y, z, rx) {
    const g = grp(name, parent);
    for (let i = 0; i < n; i++) {
      const s = mesh(new THREE.BoxGeometry(w, h * 0.5, gap * 0.55), W.BLUED, name + '_slat' + i, g);
      s.position.set(0, 0, (i - (n - 1) / 2) * gap);
      s.rotation.x = 0.35;
    }
    g.position.set(x, y, z);
    if (rx) g.rotation.x = rx;
    return g;
  }

  // standoff pad (a shell stands on 3-4 of these)
  function standoff(parent, name, x, y, z, r) {
    const g = grp(name, parent);
    mesh(lathe([[0, 0], [r, 0], [r, 0.014], [r * 0.6, 0.020], [0, 0.020]], 8), W.MACHINE, name + '_pad', g);
    bolt(g, 0, 0.021, 0, 0.5, true);
    g.position.set(x, y, z);
    return g;
  }

  function handle(parent, name, x, y, z, len) {
    const g = grp(name, parent);
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-len / 2, 0, 0), new THREE.Vector3(-len * 0.3, 0.028, 0),
      new THREE.Vector3(len * 0.3, 0.028, 0), new THREE.Vector3(len / 2, 0, 0)
    ]);
    mesh(new THREE.TubeGeometry(c, 12, 0.006, 6, false), W.BRIGHT, name + '_bar', g);
    for (const sx of [-1, 1]) {
      const p = mesh(lathe([[0, 0], [0.016, 0], [0.016, 0.008], [0, 0.008]], 8), W.MACHINE, name + '_pad', g);
      p.position.set(sx * len / 2, -0.004, 0);
    }
    g.position.set(x, y, z);
    return g;
  }

  // ═══════════════════════════════════════════════════ ROOT
  const root = grp('octopus', null);

  // ── spine curve (§2)
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.66, -1.44),
    new THREE.Vector3(0, 0.94, -1.05),
    new THREE.Vector3(0.03, 1.02, -0.60),
    new THREE.Vector3(0.02, 0.92, -0.16),
    new THREE.Vector3(0, 0.72, 0.22),
    new THREE.Vector3(0, 0.60, 0.50),
    new THREE.Vector3(0, 0.50, 0.72)
  ]);

  // ═════════════ MANTLE  (origin = arm-crown centre 0,0.42,0.16)
  const CROWN_ORIGIN = new THREE.Vector3(0, 0.42, 0.16);
  const mantle = grp('mantle', root);
  mantle.position.copy(CROWN_ORIGIN);
  // local helper: world spine point -> mantle local
  const sp = (t) => spine.getPointAt(t).sub(CROWN_ORIGIN);

  // ───────── mantleFrame (dark, structural)
  const frame = grp('mantleFrame', mantle);

  const ribT = [0.05, 0.14, 0.24, 0.35, 0.46, 0.57, 0.68];
  const ribR = [0.30, 0.44, 0.56, 0.65, 0.63, 0.52, 0.36];
  const ribNodes = [];
  for (let i = 0; i < 7; i++) {
    const g = grp('mantleRib' + (i + 1), frame);
    const p = sp(ribT[i]);
    g.position.copy(p);
    const tan = spine.getTangentAt(ribT[i]);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.clone().normalize());
    const hoop = mesh(new THREE.TorusGeometry(ribR[i], 0.035, 6, 12), W.MACHINE, 'mantleRib' + (i + 1) + '_hoop', g);
    hoop.scale.set(1, 0.62, 1);
    // 8 bolt heads on the outer face + gusset to keel
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * P * 2;
      const b = mesh(boltGeo, W.BLUED, 'ribBolt', g);
      b.position.set(Math.cos(a) * ribR[i], Math.sin(a) * ribR[i] * 0.62, 0.030);
      b.rotation.x = P / 2;
      b.scale.setScalar(0.7);
    }
    const gus = mesh(plate([[-0.05, 0], [0.05, 0], [0.03, 0.07], [-0.03, 0.07]], 0.020), W.MACHINE, 'mantleRibGusset' + (i + 1), g);
    gus.position.set(0, -ribR[i] * 0.62 + 0.01, -0.010);
    gus.rotation.z = P;
    ribNodes.push(g);
  }
  // 18 spacer blocks between rib pairs at 3 clock positions
  {
    let sc = 0;
    for (let i = 0; i < 6; i++) {
      const a = sp(ribT[i]), b = sp(ribT[i + 1]);
      const mid = a.clone().lerp(b, 0.5);
      const rm = (ribR[i] + ribR[i + 1]) * 0.5;
      const clocks = [[0, rm * 0.62], [-rm * 0.94, rm * 0.10], [rm * 0.94, rm * 0.10]];
      for (const c of clocks) {
        sc++;
        const blk = mesh(plate([[-0.045, -0.025], [0.045, -0.025], [0.038, 0.025], [-0.038, 0.025]], 0.050), W.BLUED, 'mantleSpacer' + sc, frame);
        blk.position.set(mid.x + c[0], mid.y + c[1], mid.z - 0.025);
        bolt(frame, mid.x + c[0] + 0.02, mid.y + c[1] + 0.026, mid.z, 0.55, true);
        bolt(frame, mid.x + c[0] - 0.02, mid.y + c[1] + 0.026, mid.z, 0.55, true);
      }
    }
  }

  // keel: I-beam (web + 2 flanges) running the mantle length under the ribs
  {
    const keel = grp('mantleKeel', frame);
    const kz0 = sp(0.05).z, kz1 = sp(0.70).z;
    const len = kz1 - kz0;
    const web = mesh(new THREE.BoxGeometry(0.030, 0.14, len), W.MACHINE, 'mantleKeel_web', keel);
    const fT = mesh(new THREE.BoxGeometry(0.11, 0.022, len), W.MACHINE, 'mantleKeel_flangeTop', keel);
    fT.position.y = 0.078;
    const fB = mesh(new THREE.BoxGeometry(0.13, 0.024, len * 0.98), W.MACHINE, 'mantleKeel_flangeBot', keel);
    fB.position.y = -0.076;
    keel.position.set(0, sp(0.36).y - 0.40, (kz0 + kz1) / 2);
    boltRow(keel, 9, -0.035, 0.090, -len * 0.42, 0, 0, len * 0.10, 0.8);
    boltRow(keel, 9, 0.035, 0.090, -len * 0.42, 0, 0, len * 0.10, 0.8);
    // 5 stacked machined blocks on the keel
    for (let i = 0; i < 5; i++) {
      const s = [1.0, 1.0, 0.95, 0.85, 0.7][i];
      const blk = grp('mantleBlock' + (i + 1), keel);
      const bm = mesh(plate([[-0.12, -0.10], [0.12, -0.10], [0.10, 0.10], [-0.10, 0.10]], 0.18, [[[-0.06, -0.05], [0.06, -0.05], [0.06, 0.04], [-0.06, 0.04]]]), W.MACHINE, 'mantleBlock' + (i + 1) + '_body', blk);
      bm.position.z = -0.09;
      bm.rotation.x = 0;
      blk.position.set(0, 0.095 + 0.10 * s, -len * 0.34 + i * len * 0.17);
      blk.scale.setScalar(s);
      blk.rotation.x = P / 2;
      bolt(blk, -0.08, 0.0, 0.10, 0.7, true);
      bolt(blk, 0.08, 0.0, 0.10, 0.7, true);
      bolt(blk, -0.08, 0.0, -0.10, 0.7, true);
      bolt(blk, 0.08, 0.0, -0.10, 0.7, true);
    }
  }

  // spine chain over two sprockets, sitting in the dorsal trough
  {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = 0.10 + (0.62 - 0.10) * (i / 8);
      const p = sp(t);
      const rr = 0.30 + 0.30 * Math.sin(P * (t - 0.02) / 0.72);
      pts.push(new THREE.Vector3(p.x, p.y + rr * 0.60, p.z));
    }
    const cc = new THREE.CatmullRomCurve3(pts);
    chainRun(frame, 'mantleSpineChain', cc, 34, 1.0);
    const sa = sprocket(frame, 'mantleSprocketAft', 0.08, 14);
    const pa = cc.getPointAt(0.02);
    sa.position.copy(pa); sa.rotation.z = P / 2;
    const sf = sprocket(frame, 'mantleSprocketFwd', 0.10, 16);
    const pf = cc.getPointAt(0.98);
    sf.position.copy(pf); sf.rotation.z = P / 2;
  }

  // gear stacks at rib4 flanks
  for (const sx of [-1, 1]) {
    const g = gearStack(frame, sx < 0 ? 'mantleGearStackL' : 'mantleGearStackR', 0.11, 0.08, 0.055, 18);
    const p = sp(0.35);
    g.position.set(sx * 0.52, p.y - 0.02, p.z);
    g.rotation.z = sx * P / 2;
  }

  // three rams
  for (const sx of [-1, 1]) {
    const a = sp(0.14), b = sp(0.57);
    const r = ram(frame, sx < 0 ? 'mantleRamL' : 'mantleRamR', 0.0375, 0.42, 0.16);
    r.position.set(sx * 0.44, (a.y + b.y) / 2 - 0.06, a.z + 0.02);
    r.rotation.x = -P / 2 * 0.92;
    r.rotation.z = sx * 0.10;
  }
  {
    const a = sp(0.24), b = sp(0.46);
    const r = ram(frame, 'mantleRamTop', 0.030, 0.26, 0.11);
    r.position.set(-0.06, a.y + 0.30, a.z);
    r.rotation.x = -P / 2 * 0.86;
  }

  // aft bearing race
  {
    const g = race(frame, 'mantleBearingRaceAft', 0.17, 0.040);
    const p = sp(0.02);
    g.position.copy(p);
    g.rotation.x = P / 2;
    boltRing(g, 12, 0.135, 0.045, 'xz', 0.7, true);
  }

  // tie rods + torsion bar
  for (const sx of [-1, 1]) {
    const a = sp(0.05), b = sp(0.35);
    const g = grp(sx < 0 ? 'mantleTieRodL' : 'mantleTieRodR', frame);
    const dir = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const L = dir.length();
    const rod = mesh(cyl(0.009, 0.009, L, 8), W.BLUED, 'tieRod', g);
    for (let i = 0; i < 2; i++) {
      const n = mesh(cyl(0.016, 0.016, 0.014, 6), W.BLUED, 'tieNut', g);
      n.position.y = -L * 0.36 + i * L * 0.72;
    }
    const eyeA = mesh(new THREE.TorusGeometry(0.016, 0.006, 5, 10), W.MACHINE, 'tieEye', g);
    eyeA.position.y = -L / 2; eyeA.rotation.x = P / 2;
    const eyeB = mesh(new THREE.TorusGeometry(0.016, 0.006, 5, 10), W.MACHINE, 'tieEye', g);
    eyeB.position.y = L / 2; eyeB.rotation.x = P / 2;
    g.position.set(sx * 0.30, (a.y + b.y) / 2 - 0.12, (a.z + b.z) / 2);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  }
  {
    const g = grp('mantleTorsionBar', frame);
    const p = sp(0.24);
    const bar = mesh(cyl(0.013, 0.013, 1.04, 8), W.BLUED, 'torsionBar_bar', g);
    bar.rotation.z = P / 2;
    for (const sx of [-1, 1]) {
      const c = mesh(lathe([[0.013, 0], [0.030, 0], [0.030, 0.030], [0.020, 0.036], [0.013, 0.036]], 10), W.MACHINE, 'torsionCollar', g);
      c.position.x = sx * 0.50; c.rotation.z = sx * P / 2;
      boltRing(g, 4, 0.024, 0, 'xy', 0.45, true);
    }
    g.position.set(0, p.y - 0.10, p.z);
  }

  // corrugated ducting: rib5 forward-down to the gill ports (machine, rigid)
  for (const sx of [-1, 1]) {
    const a = sp(0.46), name = sx < 0 ? 'mantleDuctL' : 'mantleDuctR';
    const g = grp(name, frame);
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.34, a.y - 0.08, a.z),
      new THREE.Vector3(sx * 0.48, a.y - 0.18, a.z + 0.18),
      new THREE.Vector3(sx * 0.56, 0.08, -0.26)
    ]);
    mesh(new THREE.TubeGeometry(c, 20, 0.045, 8, false), W.MACHINE, name + '_duct', g);
    for (let i = 0; i < 9; i++) {
      const t = 0.06 + 0.88 * i / 8;
      const rg = mesh(new THREE.TorusGeometry(0.048, 0.010, 5, 10), W.BLUED, name + '_rib', g);
      rg.position.copy(c.getPointAt(t));
      rg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), c.getTangentAt(t).clone().normalize());
    }
    // flanged port at the aft end
    const fl = mesh(lathe([[0.045, 0], [0.072, 0], [0.072, 0.012], [0.045, 0.012]], 12), W.MACHINE, name + '_flange', g);
    fl.position.copy(c.getPointAt(0.02));
    fl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.getTangentAt(0.02).clone().normalize());
  }

  // ───────── MANTLE SHELLS (8 pieces + apex cap)
  function mantleTopPlate(name, t0, t1, rT, rB, thetaLen, vents, lapOffset) {
    const g = grp(name, mantle);
    const a = sp(t0), b = sp(t1);
    const mid = a.clone().lerp(b, 0.5);
    const len = a.distanceTo(b) * 1.06;
    const dir = b.clone().sub(a).normalize();
    const sh = mesh(shellCyl(rT, rB, len, -thetaLen / 2 + P / 2, thetaLen, 22), W.SHELL_D, name + '_skin', g);
    sh.rotation.x = P / 2;
    sh.scale.set(1, 1, 0.66); // oblate after the x-rotation -> y squashed
    // raised centre rib
    const rib = mesh(plate([[-0.024, 0], [0.024, 0], [0.020, len * 0.9], [-0.020, len * 0.9]], 0.022), W.SHELL, name + '_rib', g);
    rib.rotation.x = -P / 2;
    rib.position.set(0, ((rT + rB) / 2) * 0.66 + 0.010, -len * 0.45);
    // rolled lips on both long edges
    for (const sx of [-1, 1]) {
      const lip = mesh(new THREE.CylinderGeometry(0.012, 0.012, len * 0.98, 6), W.SHELL, name + '_lip', g);
      lip.rotation.x = P / 2;
      const ang = P / 2 + sx * thetaLen / 2;
      lip.position.set(Math.sin(ang) * (rT + rB) / 2, Math.cos(ang) * (rT + rB) / 2 * 0.66, 0);
    }
    // vent slots (recessed dark plates with slats)
    for (let i = 0; i < vents; i++) {
      const v = grp(name + '_vent' + i, g);
      const vp = mesh(plate([[-0.055, -0.020], [0.055, -0.020], [0.048, 0.020], [-0.048, 0.020]], 0.012), W.BLUED, name + '_ventFrame', v);
      vp.rotation.x = -P / 2;
      v.position.set((i - (vents - 1) / 2) * 0.16, ((rT + rB) / 2) * 0.66 - 0.004, -len * 0.10 + i * 0.05);
      for (let k = 0; k < 3; k++) {
        const s = mesh(new THREE.BoxGeometry(0.090, 0.008, 0.010), W.BLUED, 'ventSlat', v);
        s.position.set(0, 0.004, -0.012 + k * 0.012);
        s.rotation.x = 0.4;
      }
    }
    // scalloped bite (a small notched plate lifted away) + bolt rows along the borders
    boltRow(g, 8, -((rT + rB) / 2) * 0.72, ((rT + rB) / 2) * 0.40, -len * 0.42, 0, 0, len * 0.105, 0.9);
    boltRow(g, 8, ((rT + rB) / 2) * 0.72, ((rT + rB) / 2) * 0.40, -len * 0.42, 0, 0, len * 0.105, 0.9);
    // standoff pads
    for (let i = 0; i < 4; i++) {
      standoff(g, name + '_standoff' + i, (i % 2 ? 1 : -1) * (rT + rB) / 2 * 0.45, ((rT + rB) / 2) * 0.40, -len * 0.30 + Math.floor(i / 2) * len * 0.5, 0.020);
    }
    g.position.copy(mid);
    g.position.y += (lapOffset || 0);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    g.userData.rest = { p: g.position.clone(), q: g.quaternion.clone() };
    return g;
  }

  const mantlePlateTopFwd = mantleTopPlate('mantlePlateTopFwd', 0.42, 0.70, 0.50, 0.66, 130 * D, 2, 0.010);
  const mantlePlateTopMid = mantleTopPlate('mantlePlateTopMid', 0.22, 0.44, 0.60, 0.68, 145 * D, 2, 0.0);
  const mantlePlateTopAft = mantleTopPlate('mantlePlateTopAft', 0.04, 0.24, 0.34, 0.60, 120 * D, 1, -0.008);

  // sub-plate + stencil triangle on TopMid
  {
    const sub = mesh(plate([[-0.10, -0.07], [0.10, -0.07], [0.085, 0.07], [-0.085, 0.07]], 0.014), W.SHELL, 'mantlePlateTopMid_subPlate', mantlePlateTopMid);
    sub.rotation.x = -P / 2;
    sub.position.set(0.02, 0.68 * 0.66 + 0.020, 0.02);
    boltRing(sub, 4, 0.07, 0.015, 'xy', 0.5, true);
    const tri = mesh(plate([[0, 0.030], [0.026, -0.016], [-0.026, -0.016]], 0.004), W.BLUED, 'mantleStencilTriangle', mantlePlateTopMid);
    tri.rotation.x = -P / 2;
    tri.position.set(-0.13, 0.68 * 0.66 + 0.008, -0.02);
  }

  // flank plates — path-extruded bent plates
  function flankPlate(name, sx, zEnd, slots) {
    const g = grp(name, mantle);
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.30, 0.90 - 0.42, -1.20 - CROWN_ORIGIN.z),
      new THREE.Vector3(sx * 0.60, 0.86 - 0.42, -0.80 - CROWN_ORIGIN.z),
      new THREE.Vector3(sx * 0.68, 0.74 - 0.42, -0.36 - CROWN_ORIGIN.z),
      new THREE.Vector3(sx * 0.58, 0.58 - 0.42, zEnd - CROWN_ORIGIN.z)
    ]);
    const holes = [];
    for (let i = 0; i < slots; i++) holes.push([[-0.030, -0.012 + i * 0.0], [0.030, -0.012], [0.030, 0.012], [-0.030, 0.012]].map(p => [p[0] + (i - 1) * 0.0, p[1] + (i - 0.5) * 0.055]));
    const outline = [
      [-0.16, -0.022], [0.10, -0.024, 0.19, -0.010], [0.20, 0.050], [0.09, 0.098, -0.06, 0.104],
      [-0.19, 0.070], [-0.21, 0.010]
    ];
    const sh = new THREE.Shape();
    sh.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) {
      const p = outline[i];
      if (p.length === 4) sh.quadraticCurveTo(p[0], p[1], p[2], p[3]); else sh.lineTo(p[0], p[1]);
    }
    sh.closePath();
    for (const h of holes) {
      const hp = new THREE.Path(); hp.moveTo(h[0][0], h[0][1]);
      for (let i = 1; i < h.length; i++) hp.lineTo(h[i][0], h[i][1]);
      hp.closePath(); sh.holes.push(hp);
    }
    const geo = new THREE.ExtrudeGeometry(sh, { steps: 26, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.006, bevelSegments: 2, extrudePath: path, curveSegments: 6 });
    mesh(geo, W.SHELL_D, name + '_skin', g);
    // rolled lip along the lower rim
    const lipC = new THREE.CatmullRomCurve3(path.getPoints(14).map((p, i, arr) => p.clone().add(new THREE.Vector3(sx * 0.02, -0.020, 0))));
    mesh(new THREE.TubeGeometry(lipC, 20, 0.010, 6, false), W.SHELL, name + '_lip', g);
    for (let i = 0; i < 4; i++) {
      const t = 0.12 + i * 0.25;
      const p = path.getPointAt(Math.min(0.95, t));
      standoff(g, name + '_standoff' + i, p.x - sx * 0.03, p.y, p.z, 0.018);
      bolt(g, p.x - sx * 0.01, p.y + 0.075, p.z, 0.9, true);
      bolt(g, p.x - sx * 0.01, p.y - 0.030, p.z, 0.9, true);
    }
    g.userData.rest = { p: g.position.clone(), q: g.quaternion.clone() };
    return g;
  }
  const mantlePlateFlankL = flankPlate('mantlePlateFlankL', -1, 0.05, 3);
  const mantlePlateFlankR = flankPlate('mantlePlateFlankR', 1, 0.00, 2);

  // serial stencil on the starboard flank upper edge
  {
    for (let i = 0; i < 3; i++) {
      const d = mesh(plate([[0, 0], [0.014, 0], [0.014, 0.024], [0, 0.024]], 0.003), W.BLUED, 'mantleSerialDigit' + i, mantlePlateFlankR);
      d.position.set(0.60, 0.40 + 0.0, -0.55 + i * 0.024);
      d.rotation.y = P / 2; d.rotation.z = 0.1;
    }
  }

  // cheek plates
  function cheekPlate(name, sx, accentHazard) {
    const g = grp(name, mantle);
    const sh = mesh(shellCyl(0.30, 0.34, 0.30, P / 2 - 60 * D, 120 * D, 16), W.SHELL_D, name + '_skin', g);
    sh.rotation.z = P / 2; sh.scale.set(1, 1, 0.8);
    const lip = mesh(lipTorus(0.32, 0.010, 120 * D), W.SHELL, name + '_lip', g);
    lip.rotation.y = P / 2; lip.rotation.z = -60 * D + P / 2; lip.position.x = 0.15;
    g.position.set(sx * 0.42, 0.16, 0.02);
    g.rotation.y = sx > 0 ? 0 : P;
    g.rotation.z = sx * -0.18;
    for (let i = 0; i < 3; i++) standoff(g, name + '_standoff' + i, -0.08 + i * 0.08, 0.25, 0, 0.016);
    boltRow(g, 5, -0.10, 0.30, -0.10, 0.05, 0, 0, 0.8);
    if (accentHazard) {
      for (let i = 0; i < 5; i++) {
        const d = mesh(plate([[0, 0], [0.010, 0], [0.016, 0.026], [0.006, 0.026]], 0.003), W.BLUED, 'mantleHazard' + i, g);
        d.position.set(-0.04 + i * 0.020, 0.31, 0.08);
        d.rotation.x = -P / 2;
      }
    } else {
      for (let i = 0; i < 2; i++) {
        const d = mesh(plate([[0, 0], [0.016, 0], [0.016, 0.026], [0, 0.026]], 0.003), W.BLUED, 'mantleStencil07_' + i, g);
        d.position.set(-0.02 + i * 0.022, 0.31, 0.06);
        d.rotation.x = -P / 2;
      }
    }
    return g;
  }
  cheekPlate('mantlePlateCheekL', -1, false);
  cheekPlate('mantlePlateCheekR', 1, true);

  // apex cap — partial sphere, scaled to a nose cone
  {
    const g = grp('mantleApexCap', mantle);
    const sk = mesh(new THREE.SphereGeometry(0.30, 22, 14, -105 * D, 210 * D, 0.10, 95 * D), W.SHELL_D, 'mantleApexCap_skin', g);
    sk.scale.set(1.0, 0.66, 1.35);
    sk.rotation.x = P / 2 * 0.9;
    const p = sp(0.015);
    g.position.copy(p);
    g.rotation.x = 0.18;
    boltRing(g, 12, 0.24, 0.02, 'xy', 0.8, true);
    blank(g, 'mantleApexBlank', 0.030, 0, 0.14, -0.10);
    g.userData.rest = { p: g.position.clone(), q: g.quaternion.clone() };
  }

  // dorsal ridge with 9 individual blades
  const ridgeVanes = [];
  {
    const ridge = grp('mantleDorsalRidge', mantle);
    const spar = grp('mantleDorsalSpar', ridge);
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = 0.13 + (0.62 - 0.13) * (i / 6);
      const p = sp(t);
      const rr = 0.30 + 0.30 * Math.sin(P * (t - 0.02) / 0.72);
      pts.push(new THREE.Vector3(p.x, p.y + rr * 0.62 + 0.028, p.z));
    }
    const rc = new THREE.CatmullRomCurve3(pts);
    mesh(new THREE.TubeGeometry(rc, 18, 0.016, 6, false), W.MACHINE, 'mantleDorsalSpar_bar', spar);
    const H = [0.06, 0.09, 0.12, 0.14, 0.15, 0.13, 0.10, 0.07, 0.05];
    for (let i = 0; i < 9; i++) {
      const t = 0.96 - i * 0.115;
      const v = grp('ridgeVane' + (i + 1), ridge);
      const bl = mesh(plate([[-0.030, 0], [0.030, 0], [0.020, H[i] * 0.75], [0, H[i]], [-0.024, H[i] * 0.70]], 0.020), W.SHELL, 'ridgeVane' + (i + 1) + '_blade', v);
      bl.position.z = -0.010;
      v.position.copy(rc.getPointAt(Math.max(0.02, t)));
      const tan = rc.getTangentAt(Math.max(0.02, t));
      v.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.clone().normalize());
      v.rotateZ(i * 4 * D - 16 * D);
      v.userData.restQ = v.quaternion.clone();
      bolt(v, 0, 0.008, 0.012, 0.5, true);
      ridgeVanes.push(v);
    }
  }

  // hatch (hinged open 8°) — one of three rust plates
  const mantleHatch = grp('mantleHatch', mantle);
  {
    const hp = mesh(plate([[-0.11, -0.09], [0.11, -0.09], [0.095, 0.09], [-0.095, 0.09]], 0.018, [[[-0.05, -0.03], [0.05, -0.03], [0.05, 0.02], [-0.05, 0.02]]]), W.RUST, 'mantleHatch_plate', mantleHatch);
    hp.rotation.x = -P / 2;
    hp.position.set(0, 0, -0.09);
    boltRing(mantleHatch, 4, 0.085, 0.020, 'xz', 0.6, true);
    const p = sp(0.33);
    mantleHatch.position.set(0.22, p.y + 0.40, p.z + 0.02);
    mantleHatch.rotation.x = -8 * D;
    mantleHatch.rotation.z = -0.22;
    mantleHatch.userData.restQ = mantleHatch.quaternion.clone();
    for (const sx of [-1, 1]) {
      const pin = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.034, 6), W.BRIGHT, 'mantleHatchPin', mantleHatch);
      pin.position.set(sx * 0.07, 0, -0.09); pin.rotation.z = P / 2;
    }
    junction(mantleHatch, 'mantleHatchJunction', 0.035, 0.026, 0.030, 0, -0.028, -0.02);
  }

  // aux module — the asymmetric bolt-on, top-left-rear, with the amber emissive
  const mantleAuxModule = grp('mantleAuxModule', mantle);
  {
    const body = mesh(plate([[-0.13, -0.09], [0.13, -0.09], [0.115, 0.07], [0.05, 0.09], [-0.115, 0.075]], 0.14), W.MACHINE, 'mantleAuxModule_body', mantleAuxModule);
    body.rotation.x = -P / 2; body.position.y = -0.07;
    const cap = mesh(lathe([[0, 0], [0.048, 0], [0.048, 0.020], [0.034, 0.030], [0, 0.030]], 12), W.BRIGHT, 'mantleAuxModule_cap', mantleAuxModule);
    cap.position.set(-0.04, 0.075, 0.01);
    const front = mesh(plate([[-0.10, -0.05], [0.10, -0.05], [0.09, 0.05], [-0.09, 0.05]], 0.012), W.RUST, 'mantleAuxModule_front', mantleAuxModule);
    front.position.set(0, 0.0, 0.088);
    grille(mantleAuxModule, 'mantleAuxModule_grille', 6, 0.11, 0.030, 0.019, 0.03, 0.045, -0.02, 0);
    boltRing(mantleAuxModule, 6, 0.105, 0.076, 'xz', 0.7, true);
    const em = mesh(new THREE.BoxGeometry(0.020, 0.010, 0.050), M_EMIT_AMBER, 'mantleAuxEmissive', mantleAuxModule);
    em.position.set(0.06, 0.0, -0.095);
    const p = sp(0.20);
    mantleAuxModule.position.set(-0.26, p.y + 0.34, p.z - 0.02);
    mantleAuxModule.rotation.z = 0.20;
  }

  // gill ports
  for (const sx of [-1, 1]) {
    const name = sx < 0 ? 'gillPortL' : 'gillPortR';
    const g = grp(name, mantle);
    mesh(lathe([[0.030, 0], [0.086, 0], [0.086, 0.014], [0.062, 0.022], [0.030, 0.022]], 14), W.MACHINE, name + '_collar', g);
    const sl = grille(g, name + '_slats', 7, 0.11, 0.028, 0.020, 0, 0.020, 0, 0);
    sl.rotation.x = P / 2;
    boltRing(g, 8, 0.072, 0.016, 'xz', 0.6, true);
    g.position.set(sx * 0.56, 0.08, -0.26);
    g.rotation.z = sx * P / 2;
    g.userData.slats = sl;
  }

  // greebles group (blanks, handles, ties)
  {
    const gg = grp('mantleGreebles', mantle);
    blank(gg, 'mantleBlank1', 0.030, 0.16, sp(0.50).y + 0.34, sp(0.50).z);
    blank(gg, 'mantleBlank2', 0.026, -0.18, sp(0.44).y + 0.33, sp(0.44).z);
    blank(gg, 'mantleBlank3', 0.024, 0.30, sp(0.30).y + 0.10, sp(0.30).z);
    blank(gg, 'mantleBlank4', 0.024, -0.32, sp(0.26).y + 0.06, sp(0.26).z);
    handle(gg, 'mantleHandleL', -0.18, sp(0.56).y + 0.36, sp(0.56).z, 0.10);
    handle(gg, 'mantleHandleR', 0.20, sp(0.56).y + 0.35, sp(0.56).z, 0.10);
    handle(gg, 'mantleHandleFlankL', -0.52, 0.24, -0.36, 0.09).rotation.z = 0.6;
    handle(gg, 'mantleHandleFlankR', 0.52, 0.24, -0.36, 0.09).rotation.z = -0.6;
    junction(gg, 'mantleJunction1', 0.030, 0.024, 0.026, 0.30, sp(0.42).y + 0.06, sp(0.42).z);
    junction(gg, 'mantleJunction2', 0.028, 0.022, 0.024, -0.30, sp(0.38).y + 0.02, sp(0.38).z);
    junction(gg, 'mantleJunction3', 0.026, 0.020, 0.024, 0.0, sp(0.10).y + 0.20, sp(0.10).z);
  }

  // ───────── FUNNEL / SIPHON
  const funnelBase = grp('funnelBase', mantle);
  funnelBase.position.set(0.30, 0.30 - 0.42, 0.10 - 0.16);
  {
    const ring = mesh(new THREE.TorusGeometry(0.10, 0.016, 6, 16), W.MACHINE, 'funnelBase_gimbalRing', funnelBase);
    ring.rotation.x = P / 2;
    boltRing(funnelBase, 8, 0.10, 0.018, 'xz', 0.6, true);
    for (const sx of [-1, 1]) {
      const pin = mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.040, 6), W.BRIGHT, 'funnelBase_pin', funnelBase);
      pin.position.set(sx * 0.10, 0, 0); pin.rotation.z = P / 2;
    }
    const boot = mesh(lathe([[0.05, 0], [0.075, 0.008], [0.05, 0.016], [0.075, 0.024], [0.05, 0.032]], 12), M_RUBBER, 'funnelBase_boot', funnelBase);
  }
  const funnel = grp('funnel', funnelBase);
  {
    const bar = mesh(lathe([
      [0, 0], [0.080, 0], [0.080, 0.06], [0.062, 0.10], [0.055, 0.26],
      [0.062, 0.32], [0.075, 0.38], [0.062, 0.40], [0, 0.40]
    ], 16), W.MACHINE, 'funnelBarrel', funnel);
    const lip = mesh(new THREE.TorusGeometry(0.070, 0.014, 6, 18), W.SHELL, 'funnelLipRing', funnel);
    lip.position.y = 0.40; lip.rotation.x = P / 2;
    const vb = mesh(plate([[-0.05, -0.05], [0.05, -0.05], [0.045, 0.05], [-0.045, 0.05]], 0.10), W.MACHINE, 'funnelValveBlock', funnel);
    vb.position.set(0.0, 0.10, -0.05); vb.rotation.x = -P / 2;
    boltRing(vb, 4, 0.035, 0.10, 'xy', 0.6, true);
    const tab = mesh(plate([[0, 0], [0.050, 0], [0.050, 0.020], [0, 0.020]], 0.004), W.RED, 'funnelArmingTab', funnel);
    tab.position.set(0.03, 0.14, 0.055);
    port(funnel, 'funnelValvePort', 0.014, 0.0, 0.16, 0.055, new THREE.Vector3(0, 0, 1));
    for (let i = 0; i < 3; i++) {
      const c = mesh(lathe([[0.016, 0], [0.030, 0], [0.030, 0.014], [0.016, 0.014]], 10), W.BLUED, 'funnelClamp' + (i + 1), funnel);
      c.position.set(-0.055, 0.06 + i * 0.11, 0.02);
      c.rotation.z = 0.4;
    }
    for (const [n, sx] of [['funnelRamA', -1], ['funnelRamB', 1]]) {
      const r = ram(funnelBase, n, 0.022, 0.13, 0.05);
      r.position.set(sx * 0.075, -0.03, -0.06);
      r.rotation.x = -0.5; r.rotation.z = sx * 0.25;
    }
  }
  funnel.rotation.set(-20 * D, 25 * D, 0);
  funnel.userData.restRot = funnel.rotation.clone();

  // ═════════════ CROWN (arm ring) — child of mantle
  const crown = grp('crown', mantle);
  crown.position.set(0, 0, 0);
  crown.rotation.x = 15 * D;
  {
    const R = 0.43;
    const ring = mesh(lathe([
      [R * 0.62, 0], [R, 0], [R, 0.040], [R * 0.90, 0.052], [R * 0.90, 0.080],
      [R * 0.70, 0.092], [R * 0.62, 0.070]
    ], 28), W.MACHINE, 'crownRing', crown);
    boltRing(crown, 16, R * 0.80, 0.094, 'xz', 0.9);
    // toothed inner gear ring
    const gr = grp('crownGearRing', crown);
    mesh(lathe([[R * 0.42, 0], [R * 0.60, 0], [R * 0.60, 0.034], [R * 0.42, 0.034]], 24), W.BRONZE, 'crownGearRing_disc', gr);
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * P * 2;
      const t = mesh(toothGeo, W.BRONZE, 'crownGearTooth', gr);
      t.position.set(Math.cos(a) * (R * 0.61), 0.017, Math.sin(a) * (R * 0.61));
      t.scale.set(0.014, 0.020, 0.010); t.rotation.y = -a;
    }
    gr.position.y = 0.030;
    // pinion at the front with a shaft landing in a bearing on the keel
    const pin = grp('crownPinion', crown);
    const pd = mesh(lathe([[0.010, 0], [0.045, 0], [0.045, 0.030], [0.010, 0.030]], 14), W.BRIGHT, 'crownPinion_disc', pin);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * P * 2;
      const t = mesh(toothGeo, W.BRONZE, 'crownPinionTooth', pin);
      t.position.set(Math.cos(a) * 0.050, 0.015, Math.sin(a) * 0.050);
      t.scale.set(0.012, 0.018, 0.009); t.rotation.y = -a;
    }
    const shaft = mesh(cyl(0.010, 0.010, 0.14, 8), W.BLUED, 'crownPinion_shaft', pin);
    shaft.rotation.x = P / 2; shaft.position.z = -0.07; shaft.position.y = 0.015;
    const brg = mesh(lathe([[0.010, 0], [0.026, 0], [0.026, 0.020], [0.010, 0.020]], 10), W.MACHINE, 'crownPinion_bearing', pin);
    brg.position.set(0, 0.015, -0.14); brg.rotation.x = P / 2;
    pin.position.set(0.0, 0.030, R * 0.66);
    // hub plate — forward 60% of the ring top
    const hub = grp('crownHubPlate', crown);
    const hp = mesh(shellCyl(R * 0.98, R * 0.98, 0.030, -55 * D, 110 * D, 22), W.SHELL_D, 'crownHubPlate_skin', hub);
    hp.rotation.x = 0; hp.position.y = 0.11;
    const hcap = mesh(new THREE.RingGeometry(R * 0.44, R * 0.99, 26, 1, -55 * D, 110 * D), W.SHELL_D, 'crownHubPlate_cap', hub);
    hcap.rotation.x = -P / 2; hcap.position.y = 0.125;
    const hlip = mesh(lipTorus(R * 0.99, 0.010, 110 * D, 20), W.SHELL, 'crownHubPlate_lip', hub);
    hlip.rotation.x = P / 2; hlip.rotation.z = -55 * D; hlip.position.y = 0.100;
    grille(hub, 'crownHubVent', 3, 0.10, 0.020, 0.020, 0.0, 0.132, R * 0.72, -P / 2);
    boltRing(hub, 8, R * 0.86, 0.130, 'xz', 0.6, true);
    for (let i = 0; i < 4; i++) standoff(hub, 'crownHubStandoff' + i, Math.cos(-P / 2 + i * 0.5) * R * 0.7, 0.096, Math.sin(-P / 2 + i * 0.5) * R * 0.7, 0.018);
    const hsub = mesh(plate([[-0.05, -0.035], [0.05, -0.035], [0.045, 0.035], [-0.045, 0.035]], 0.010), W.RUST, 'crownHubSubPlate', hub);
    hsub.rotation.x = -P / 2; hsub.position.set(0.10, 0.136, R * 0.50);
    // under plate
    const und = grp('crownUnderPlate', crown);
    const uc = mesh(new THREE.RingGeometry(R * 0.30, R * 0.92, 24, 1, 200 * D, 160 * D), W.SHELL_SH, 'crownUnderPlate_cap', und);
    uc.rotation.x = P / 2; uc.position.y = -0.020;
    const ul = mesh(lipTorus(R * 0.92, 0.010, 160 * D, 18), W.SHELL, 'crownUnderPlate_lip', und);
    ul.rotation.x = P / 2; ul.rotation.z = 200 * D; ul.position.y = -0.024;
    boltRing(und, 6, R * 0.80, -0.030, 'xz', 0.55, true);
    // crown distribution manifolds + hoses (runs 16-19) + the cyan emissive
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * P * 2;
      const mf = grp('crownManifold' + (i + 1), crown);
      mesh(plate([[-0.036, -0.026], [0.036, -0.026], [0.030, 0.026], [-0.030, 0.026]], 0.044), W.MACHINE, 'crownManifold' + (i + 1) + '_body', mf);
      mf.children[0].rotation.x = -P / 2; mf.children[0].position.y = -0.022;
      port(mf, 'crownManifoldOut' + i + 'a', 0.011, 0.020, 0.024, 0.010, new THREE.Vector3(0, 1, 0.3));
      port(mf, 'crownManifoldOut' + i + 'b', 0.011, -0.020, 0.024, 0.010, new THREE.Vector3(0, 1, -0.3));
      bolt(mf, 0.028, 0.024, -0.020, 0.7, true);
      bolt(mf, -0.028, 0.024, -0.020, 0.7, true);
      mf.position.set(Math.sin(a) * R * 0.74, 0.098, Math.cos(a) * R * 0.74);
      mf.rotation.y = a;
      if (i === 2) {
        const em = mesh(new THREE.BoxGeometry(0.020, 0.008, 0.050), M_EMIT_CYAN, 'crownStatusPort', mf);
        em.position.set(0, 0.026, -0.014);
      }
      // trunk from a keel port over the ring's top face into this manifold
      const kp = port(crown, 'crownKeelPort' + i, 0.014, Math.sin(a) * 0.10, 0.16, Math.cos(a) * 0.10, new THREE.Vector3(Math.sin(a), 0.4, Math.cos(a)));
      hose(crown, 'crownTrunk' + (i + 1), [
        [Math.sin(a) * 0.10, 0.17, Math.cos(a) * 0.10],
        [Math.sin(a) * 0.22, 0.185, Math.cos(a) * 0.22],
        [Math.sin(a) * 0.34, 0.145, Math.cos(a) * 0.34],
        [Math.sin(a) * R * 0.74, 0.108, Math.cos(a) * R * 0.74]
      ], 0.030, true, [0.35, 0.75]);
    }
    // 8 arm sockets
  }

  // arm socket azimuths (from +Z, +X to the right)
  const ARMS = [
    { n: 'armR1', az: 24, L: 3.30, R: 0.155, side: 1, rank: 1 },
    { n: 'armL1', az: -24, L: 3.30, R: 0.155, side: -1, rank: 1 },
    { n: 'armR2', az: 68, L: 3.05, R: 0.148, side: 1, rank: 2 },
    { n: 'armL2', az: -68, L: 3.05, R: 0.148, side: -1, rank: 2 },
    { n: 'armR3', az: 115, L: 2.80, R: 0.145, side: 1, rank: 3 },
    { n: 'armL3', az: -115, L: 2.80, R: 0.145, side: -1, rank: 3 },
    { n: 'armR4', az: 156, L: 2.35, R: 0.165, side: 1, rank: 4 },
    { n: 'armL4', az: -156, L: 2.35, R: 0.165, side: -1, rank: 4 }
  ];
  const SEG_L = [0.19, 0.17, 0.16, 0.15, 0.13, 0.11, 0.09];
  const SEG_RT = [0.92, 0.80, 0.66, 0.52, 0.38, 0.24, 0.14];
  const SEG_RB = [1.00, 0.92, 0.80, 0.66, 0.52, 0.38, 0.24];
  const REST_ELEV = {
    1: [26, 6, -16, -30, -34, -22, -6],
    2: [16, -4, -26, -38, -30, -12, 4],
    3: [12, -8, -32, -40, -24, -6, 8],
    4: [8, -14, -36, -38, -18, -2, 10]
  };
  const REST_TIP = { 1: [38, 46, 52], 2: [30, 40, 48], 3: [26, 36, 44], 4: [22, 32, 40] };
  const SUCKER_PER_SEG = [8, 4, 3, 3, 2, 1, 1];
  const SUCK_D = [0.115, 0.108, 0.100, 0.092, 0.084, 0.076, 0.068, 0.060, 0.054, 0.048, 0.043, 0.038, 0.034, 0.030, 0.027, 0.024, 0.021, 0.019, 0.017, 0.015, 0.013, 0.011];

  // sucker unit: rim + piston + boot + port
  function suckerUnit(parent, name, d) {
    const g = grp(name, parent);
    const r = d / 2;
    mesh(lathe([
      [r * 0.30, 0], [r, 0], [r, r * 0.30], [r * 0.88, r * 0.42],
      [r * 0.60, r * 0.34], [r * 0.55, r * 0.10], [r * 0.30, r * 0.10]
    ], 12), W.SHELL, name + '_rim', g);
    const pist = mesh(lathe([[0, 0], [r * 0.52, 0], [r * 0.52, r * 0.16], [r * 0.30, r * 0.22], [0, r * 0.22]], 10), W.BRIGHT, name + '_piston', g);
    pist.position.y = r * 0.10;
    g.userData.piston = pist;
    g.userData.pistonRestY = pist.position.y;
    g.userData.pistonDepth = r * 0.42;
    const boot = mesh(lathe([
      [r * 0.55, 0], [r * 0.80, r * 0.06], [r * 0.55, r * 0.12],
      [r * 0.80, r * 0.18], [r * 0.55, r * 0.24]
    ], 10), M_RUBBER, name + '_boot', g);
    boot.position.y = -r * 0.22;
    const prt = mesh(lathe([[r * 0.14, 0], [r * 0.34, 0], [r * 0.34, r * 0.14], [r * 0.16, r * 0.14]], 8), W.MACHINE, name + '_port', g);
    prt.position.y = -r * 0.36;
    return g;
  }

  // build one arm
  const armNodes = {};
  function buildArm(spec) {
    const armRoot = grp(spec.n, crown);
    const azr = spec.az * D;
    const Rr = 0.43;
    armRoot.position.set(Math.sin(azr) * Rr * 0.86, 0.030, Math.cos(azr) * Rr * 0.86);
    armRoot.rotation.y = azr;

    // socket cup + flange + gear stack
    const sock = grp(spec.n + '_socket', armRoot);
    mesh(lathe([
      [0.040, 0], [0.105, 0], [0.105, 0.024], [0.086, 0.036],
      [0.086, 0.062], [0.055, 0.062], [0.055, 0.030], [0.040, 0.030]
    ], 16), W.MACHINE, spec.n + '_socketCup', sock);
    boltRing(sock, 6, 0.092, 0.026, 'xz', 0.7, true);
    const gs = gearStack(sock, spec.n + '_gearStack', 0.10, 0.075, 0.05, 16);
    gs.position.set(0, 0.02, -0.10);
    gs.rotation.x = P / 2;

    // segment chain
    let parent = armRoot;
    const segs = [];
    const elev = REST_ELEV[spec.rank];
    const bow = [0, 6, 4, 2, 0, 0, 0];
    for (let i = 0; i < 7; i++) {
      const segG = grp(spec.n + '_seg' + (i + 1), parent);
      const len = SEG_L[i] * spec.L;
      const rT = SEG_RT[i] * spec.R, rB = SEG_RB[i] * spec.R;
      segG.position.set(0, i === 0 ? 0.055 : 0, i === 0 ? 0 : SEG_L[i - 1] * spec.L);
      segG.userData.len = len;
      segG.userData.rT = rT; segG.userData.rB = rB;
      segG.userData.restRot = new THREE.Euler(-elev[i] * D, spec.side * bow[i] * D, 0);
      segG.rotation.copy(segG.userData.restRot);

      // oversized joint barrel at this joint (1.30x segment radius)
      const bR = rB * 1.30;
      const bar = grp(spec.n + '_barrel' + (i + 1), segG);
      mesh(lathe([
        [bR * 0.30, -bR * 0.9], [bR * 0.82, -bR * 0.9], [bR, -bR * 0.62],
        [bR, bR * 0.62], [bR * 0.82, bR * 0.9], [bR * 0.30, bR * 0.9]
      ], 14), W.MACHINE, spec.n + '_barrel' + (i + 1) + '_hsg', bar);
      bar.rotation.z = P / 2;
      for (const sx of [-1, 1]) {
        const pinm = mesh(new THREE.CylinderGeometry(bR * 0.20, bR * 0.20, bR * 0.5, 6), W.BRIGHT, 'hingePin', bar);
        pinm.position.y = sx * bR * 1.05;
        const col = mesh(lathe([[bR * 0.20, 0], [bR * 0.40, 0], [bR * 0.40, bR * 0.14], [bR * 0.22, bR * 0.14]], 10), W.MACHINE, 'pinCollar', bar);
        col.position.y = sx * bR * 0.90;
        col.rotation.x = sx < 0 ? P : 0;
      }
      boltRing(bar, 6, bR * 0.66, bR * 0.92, 'xz', 0.55, true);
      const boot = mesh(lathe([
        [bR * 0.5, 0], [bR * 0.80, 0.010], [bR * 0.5, 0.020],
        [bR * 0.80, 0.030], [bR * 0.5, 0.040]
      ], 10), M_RUBBER, spec.n + '_boot' + (i + 1), bar);
      boot.position.set(0, -bR * 0.9, 0);
      boot.rotation.z = P;

      // segment body — faceted taper, D-section with dorsal strip + oral plate
      const body = mesh(cyl(rT, rB, len, 8), W.MACHINE, spec.n + '_seg' + (i + 1) + '_body', segG);
      body.rotation.x = P / 2;
      body.position.z = len / 2;
      const dors = mesh(plate([[-rT * 0.55, 0], [rT * 0.55, 0], [rB * 0.48, len], [-rB * 0.48, len]], 0.020), W.MACHINE, spec.n + '_seg' + (i + 1) + '_dorsalStrip', segG);
      dors.position.set(0, rB * 0.86, 0);
      dors.rotation.x = 0;
      const oral = mesh(plate([[-rB * 0.72, 0], [rB * 0.72, 0], [rT * 0.66, len], [-rT * 0.66, len]], 0.022), W.BRONZE, spec.n + '_seg' + (i + 1) + '_oralPlate', segG);
      oral.position.set(0, -rB * 0.92, 0);

      // bearing races at joints 1,3,5
      if (i === 0 || i === 2 || i === 4) {
        const rc = race(segG, spec.n + '_bearingRace' + (i + 1), bR * 0.75, 0.024);
        rc.position.set(spec.side * bR * 0.5, 0, 0.012);
        rc.rotation.z = spec.side * P / 2;
      }
      // rams on segs 1-5, double on 1 and 2
      if (i < 5) {
        const sides = (i < 2) ? [-1, 1] : [spec.side];
        for (const sx of sides) {
          const r = ram(segG, spec.n + '_ram' + (i + 1) + (sx < 0 ? 'L' : 'R'), spec.R * 0.30 * (1 - i * 0.09), len * 0.52, len * 0.20);
          r.position.set(sx * rB * 0.86, -rB * 0.24, len * 0.16);
          r.rotation.x = P / 2 * 0.94;
          r.rotation.z = sx * 0.10;
        }
      }
      // tie rods on segs 2 and 4
      if (i === 1 || i === 3) {
        const tg = grp(spec.n + '_tieRod' + (i + 1), segG);
        const rod = mesh(cyl(0.007, 0.007, len * 0.7, 8), W.BLUED, 'tieRod', tg);
        rod.rotation.x = P / 2; rod.position.z = len * 0.35;
        for (let k = 0; k < 2; k++) {
          const n = mesh(cyl(0.012, 0.012, 0.011, 6), W.BLUED, 'tieNut', tg);
          n.rotation.x = P / 2; n.position.z = len * (0.12 + k * 0.46);
        }
        const e1 = mesh(new THREE.TorusGeometry(0.012, 0.005, 5, 10), W.MACHINE, 'tieEye', tg);
        e1.position.z = 0; const e2 = e1.clone(); e2.position.z = len * 0.7; tg.add(e2);
        tg.position.set(-spec.side * rB * 0.80, rB * 0.30, 0);
      }
      // gusset + spacer block (visible joint between segment pairs)
      const gus = mesh(plate([[-rB * 0.4, 0], [rB * 0.4, 0], [rB * 0.28, rB * 0.75], [-rB * 0.28, rB * 0.75]], rB * 0.42), W.MACHINE, spec.n + '_gusset' + (i + 1), segG);
      gus.position.set(0, rB * 0.5, len * 0.10);
      gus.rotation.x = -P / 2;

      segs.push(segG);
      parent = segG;
    }

    // shells on segs 1..6 (5 on rank 3/4 per spec: skip seg6 there)
    const shellThetas = [175, 165, 150, 140, 125, 115];
    const nShell = (spec.rank >= 3) ? 5 : 6;
    for (let i = 0; i < nShell; i++) {
      const seg = segs[i];
      const len = seg.userData.len, rT = seg.userData.rT, rB = seg.userData.rB;
      let th = shellThetas[i] * D;
      if (spec.rank === 4 && i === 0) th = 190 * D;
      const nm = spec.n + '_shell' + 'ABCDEF'[i];
      const g = grp(nm, seg);
      const sk = mesh(shellCyl(rT + 0.030, rB + 0.030, len * 0.88, P / 2 - th / 2, th, 18), (spec.rank === 4 && i === 0) ? W.SHELL_WORN : W.SHELL_D, nm + '_skin', g);
      sk.rotation.x = P / 2;
      g.position.set(0, 0, len * 0.06);
      // rolled lips on both edges
      for (const sx of [-1, 1]) {
        const lip = mesh(new THREE.CylinderGeometry(0.010, 0.010, len * 0.86, 6), W.SHELL, nm + '_lip', g);
        lip.rotation.x = P / 2;
        const ang = P / 2 + sx * th / 2;
        lip.position.set(Math.sin(ang) * (rT + rB) / 2 * 1.0 + Math.sin(ang) * 0.030, Math.cos(ang) * ((rT + rB) / 2 + 0.030), len * 0.44);
      }
      // raised rib on the big shells + vents
      if (i < 3) {
        const rib = mesh(plate([[-0.016, 0], [0.016, 0], [0.013, len * 0.7], [-0.013, len * 0.7]], 0.016), W.SHELL, nm + '_rib', g);
        rib.position.set(0, rB + 0.042, len * 0.08);
        const nv = 3 - i;
        for (let k = 0; k < nv; k++) {
          const v = mesh(plate([[-0.030, -0.010], [0.030, -0.010], [0.026, 0.010], [-0.026, 0.010]], 0.010), W.BLUED, nm + '_vent' + k, g);
          v.rotation.x = -P / 2;
          v.position.set(spec.side * rB * 0.55, rB + 0.030, len * (0.18 + k * 0.22));
        }
      }
      if (i === 1) {
        const sub = mesh(plate([[-0.030, -0.022], [0.030, -0.022], [0.026, 0.022], [-0.026, 0.022]], 0.010), W.SHELL, nm + '_subPlate', g);
        sub.rotation.x = -P / 2;
        sub.position.set(-spec.side * rB * 0.4, rB + 0.044, len * 0.4);
      }
      // 3 standoffs + edge bolt rows
      for (let k = 0; k < 3; k++) standoff(g, nm + '_standoff' + k, (k - 1) * rB * 0.7, rB * 0.72, len * (0.16 + k * 0.28), 0.013);
      boltRow(g, 5, -rB * 0.86, rB * 0.62, len * 0.10, 0, 0, len * 0.17, 0.7);
      boltRow(g, 5, rB * 0.86, rB * 0.62, len * 0.10, 0, 0, len * 0.17, 0.7);
      g.userData.rest = { p: g.position.clone(), q: g.quaternion.clone() };
    }

    // chain run: split at joint 4 (seg1-local, then seg4-local)
    {
      const proxPts = [];
      for (let i = 0; i <= 4; i++) {
        const f = i / 4;
        const zz = f * (SEG_L[0] + SEG_L[1] + SEG_L[2]) * spec.L * 0.98;
        proxPts.push(new THREE.Vector3(0, spec.R * (0.98 - f * 0.26), zz));
      }
      chainRun(segs[0], spec.n + '_chainProx', new THREE.CatmullRomCurve3(proxPts), 11, 0.85);
      const sa = sprocket(segs[0], spec.n + '_sprocketA', 0.055, 12);
      sa.position.set(0, spec.R * 1.0, 0.01); sa.rotation.z = P / 2;
      const distPts = [];
      for (let i = 0; i <= 3; i++) {
        const f = i / 3;
        const zz = f * (SEG_L[3] + SEG_L[4]) * spec.L * 0.96;
        distPts.push(new THREE.Vector3(0, spec.R * (0.56 - f * 0.16), zz));
      }
      chainRun(segs[3], spec.n + '_chainDist', new THREE.CatmullRomCurve3(distPts), 7, 0.7);
      const sb = sprocket(segs[3], spec.n + '_sprocketB', 0.035, 10);
      sb.position.set(0, spec.R * 0.58, 0.008); sb.rotation.z = P / 2;
      // the boot where the two runs meet, at joint 4
      const bt = mesh(lathe([[spec.R * 0.30, 0], [spec.R * 0.62, 0], [spec.R * 0.62, 0.030], [spec.R * 0.30, 0.030]], 10), W.BLUED, spec.n + '_chainBoot', segs[3]);
      bt.position.set(0, spec.R * 0.58, -0.008);
      bt.rotation.x = P / 2;
      // turnbuckle on seg5
      const tb = mesh(lathe([[0.008, 0], [0.018, 0], [0.018, 0.040], [0.008, 0.040]], 8), W.BRIGHT, spec.n + '_turnbuckle', segs[4]);
      tb.position.set(0, spec.R * 0.42, SEG_L[4] * spec.L * 0.5);
      tb.rotation.x = P / 2;
    }

    // suckers, biserial staggered, oral face only
    const suckers = [];
    let sIdx = 0;
    for (let i = 0; i < 7; i++) {
      const seg = segs[i];
      const len = seg.userData.len, rB = seg.userData.rB;
      const n = SUCKER_PER_SEG[i];
      for (let k = 0; k < n; k++) {
        const d = SUCK_D[Math.min(SUCK_D.length - 1, sIdx)];
        const row = (k % 2) ? 1 : -1;
        const su = suckerUnit(seg, spec.n + '_sucker' + (sIdx + 1), d);
        const f = (k + 0.6) / (n + 0.2);
        su.position.set(row * rB * 0.40, -rB * 0.95 - d * 0.18, len * f);
        su.rotation.x = P;
        su.rotation.z = row * 0.12;
        suckers.push(su);
        // hose stub + tee on the 6 largest suckers of the front arms
        if (spec.rank === 1 && sIdx < 6) {
          const st = mesh(new THREE.CylinderGeometry(d * 0.10, d * 0.10, 0.030, 6), M_RUBBER, spec.n + '_suckerStub' + sIdx, seg);
          st.position.set(row * rB * 0.40 * 0.5, -rB * 0.95 - 0.008, len * f);
          st.rotation.z = row * 1.0;
          const tee = mesh(lathe([[0.006, 0], [0.013, 0], [0.013, 0.010], [0.007, 0.010]], 8), W.MACHINE, spec.n + '_suckerTee' + sIdx, seg);
          tee.position.set(0, -rB * 0.95 - 0.014, len * f);
          tee.rotation.x = P;
        }
        sIdx++;
      }
    }

    // heel block on rear arms
    if (spec.rank === 4) {
      const hb = grp(spec.n + '_heelBlock', segs[1]);
      const b = mesh(plate([[-0.055, -0.045], [0.055, -0.045], [0.046, 0.045], [-0.046, 0.045]], 0.050), W.MACHINE, spec.n + '_heelBlock_body', hb);
      b.rotation.x = -P / 2; b.position.y = -0.025;
      const skid = mesh(plate([[-0.050, -0.040], [0.050, -0.040], [0.042, 0.040], [-0.042, 0.040]], 0.012), W.BRONZE, spec.n + '_heelBlock_skid', hb);
      skid.rotation.x = -P / 2; skid.position.y = -0.055;
      const topp = mesh(plate([[-0.048, -0.038], [0.048, -0.038], [0.040, 0.038], [-0.040, 0.038]], 0.010), W.SHELL_WORN, spec.n + '_heelBlock_top', hb);
      topp.rotation.x = -P / 2; topp.position.y = 0.030;
      boltRing(hb, 4, 0.040, 0.032, 'xz', 0.6, true);
      hb.position.set(0, -spec.R * 0.95, SEG_L[1] * spec.L * 0.5);
    }

    // tip assembly: 3 links + claw
    const tipRoot = grp(spec.n + '_tipAssembly', segs[6]);
    tipRoot.position.z = SEG_L[6] * spec.L;
    const tipRest = REST_TIP[spec.rank];
    const tipLinks = [];
    let tp = tipRoot;
    const TL = [0.055, 0.042, 0.032], TR = [[0.026, 0.020], [0.020, 0.014], [0.014, 0.009]];
    for (let i = 0; i < 3; i++) {
      const g = grp(spec.n + '_tipLink' + (i + 1), tp);
      g.position.z = i === 0 ? 0 : TL[i - 1];
      g.userData.restRot = new THREE.Euler(-tipRest[i] * D, 0, 0);
      g.rotation.copy(g.userData.restRot);
      const b = mesh(cyl(TR[i][1], TR[i][0], TL[i], 6), W.MACHINE, spec.n + '_tipLink' + (i + 1) + '_body', g);
      b.rotation.x = P / 2; b.position.z = TL[i] / 2;
      const bR = TR[i][0] * 1.3;
      const bar = mesh(lathe([[bR * 0.3, -bR * 0.8], [bR, -bR * 0.55], [bR, bR * 0.55], [bR * 0.3, bR * 0.8]], 10), W.MACHINE, spec.n + '_tipBarrel' + (i + 1), g);
      bar.rotation.z = P / 2;
      const pinm = mesh(new THREE.CylinderGeometry(bR * 0.22, bR * 0.22, bR * 2.2, 6), W.BRIGHT, 'tipPin', g);
      pinm.rotation.z = P / 2;
      if (i === 0) {
        const r = ram(g, spec.n + '_tipRam', 0.007, TL[0] * 0.6, TL[0] * 0.3);
        r.position.set(TR[0][0] * 0.9, -TR[0][0] * 0.3, TL[0] * 0.15);
        r.rotation.x = P / 2;
      }
      tipLinks.push(g);
      tp = g;
    }
    const claw = grp(spec.n + '_tipClaw', tp);
    claw.position.z = TL[2];
    const cw = mesh(plate([[0, -0.008], [0.030, -0.010, 0.045, 0.004], [0.030, 0.010], [0.004, 0.010]], 0.014), W.SHELL, spec.n + '_tipClaw_blade', claw);
    cw.rotation.y = P / 2;
    const cwEdge = mesh(plate([[0, -0.004], [0.040, 0.002], [0.038, 0.005], [0, 0.001]], 0.006), W.BRIGHT, spec.n + '_tipClaw_edge', claw);
    cwEdge.rotation.y = P / 2; cwEdge.position.y = -0.006;

    // arm dorsal trunk hose, split at joint 3
    {
      const mb = mesh(lathe([[0.030, 0], [0.052, 0], [0.052, 0.026], [0.030, 0.026]], 10), W.BLUED, spec.n + '_midBoot', segs[2]);
      mb.position.set(0, spec.R * 0.70, SEG_L[2] * spec.L * 0.92);
      mb.rotation.x = P / 2;
      port(segs[0], spec.n + '_trunkPortProx', 0.013, spec.side * spec.R * 0.5, spec.R * 0.90, 0.02, new THREE.Vector3(0, 1, 0.2));
      hose(segs[0], spec.n + '_trunkProx', [
        [spec.side * spec.R * 0.5, spec.R * 0.95, 0.02],
        [spec.side * spec.R * 0.42, spec.R * 1.06, SEG_L[0] * spec.L * 0.45],
        [spec.side * spec.R * 0.30, spec.R * 0.90, SEG_L[0] * spec.L * 0.95]
      ], 0.030, true, [0.5]);
      hose(segs[1], spec.n + '_trunkMid', [
        [spec.side * spec.R * 0.28, spec.R * 0.86, 0.0],
        [spec.side * spec.R * 0.22, spec.R * 0.96, SEG_L[1] * spec.L * 0.5],
        [0, spec.R * 0.74, SEG_L[1] * spec.L * 0.98]
      ], 0.028, true, [0.55]);
      hose(segs[3], spec.n + '_trunkDist', [
        [0, spec.R * 0.62, 0.0],
        [spec.side * spec.R * 0.16, spec.R * 0.70, SEG_L[3] * spec.L * 0.5],
        [spec.side * spec.R * 0.10, spec.R * 0.52, SEG_L[3] * spec.L * 0.98]
      ], 0.022, false, [0.5]);
      hose(segs[4], spec.n + '_trunkTerm', [
        [spec.side * spec.R * 0.10, spec.R * 0.50, 0.0],
        [0, spec.R * 0.44, SEG_L[4] * spec.L * 0.6]
      ], 0.018, false, null);
      port(segs[4], spec.n + '_trunkPortTerm', 0.010, 0, spec.R * 0.44, SEG_L[4] * spec.L * 0.62, new THREE.Vector3(0, 1, 0.4));
      junction(segs[0], spec.n + '_junction', 0.024, 0.020, 0.022, -spec.side * spec.R * 0.6, spec.R * 0.80, SEG_L[0] * spec.L * 0.6);
      blank(segs[2], spec.n + '_blank', 0.020, spec.side * spec.R * 0.5, spec.R * 0.60, SEG_L[2] * spec.L * 0.4);
    }
    // oral trunk on the front pair, split at joint 2
    if (spec.rank === 1) {
      hose(segs[0], spec.n + '_oralTrunkProx', [
        [0, -spec.R * 1.05, 0.02],
        [0, -spec.R * 1.12, SEG_L[0] * spec.L * 0.5],
        [0, -spec.R * 1.02, SEG_L[0] * spec.L * 0.96]
      ], 0.030, true, [0.5]);
      hose(segs[1], spec.n + '_oralTrunkMid', [
        [0, -spec.R * 1.00, 0.0],
        [0, -spec.R * 1.06, SEG_L[1] * spec.L * 0.5],
        [0, -spec.R * 0.90, SEG_L[1] * spec.L * 0.96]
      ], 0.028, true, [0.5]);
      const man = junction(segs[2], spec.n + '_oralManifold', 0.028, 0.022, 0.026, 0, -spec.R * 0.86, SEG_L[2] * spec.L * 0.4);
      man.rotation.x = P;
      const bt = mesh(lathe([[0.026, 0], [0.044, 0], [0.044, 0.020], [0.026, 0.020]], 10), W.BLUED, spec.n + '_oralBoot', segs[1]);
      bt.position.set(0, -spec.R * 1.0, 0.0); bt.rotation.x = -P / 2;
    }

    armNodes[spec.n] = { root: armRoot, segs, tipLinks, claw, suckers, spec };
    return armNodes[spec.n];
  }
  for (const a of ARMS) buildArm(a);

  // web panels — 8, each parented to the LEFT arm of its pair (by azimuth order)
  const webPanels = [];
  {
    const order = ['armR1', 'armR2', 'armR3', 'armR4', 'armL4', 'armL3', 'armL2', 'armL1'];
    for (let i = 0; i < 8; i++) {
      const owner = armNodes[order[i]];
      const nxt = armNodes[order[(i + 1) % 8]];
      const deep = (Math.abs(owner.spec.az) < 120 && Math.abs(nxt.spec.az) < 120) ? 0.42 : 0.24;
      const nm = 'webPanel' + (i + 1);
      const g = grp(nm, owner.segs[0]);
      const dAz = ((nxt.spec.az - owner.spec.az + 540) % 360 - 180) * D;
      const w = Math.abs(dAz) * 0.42 * 0.86;
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(0, deep);
      sh.quadraticCurveTo(w * 0.35, deep * 0.86, w * 0.55, deep * 0.62);
      sh.quadraticCurveTo(w * 0.80, deep * 0.40, w, deep * 0.10);
      sh.lineTo(w * 0.92, -0.02);
      sh.closePath();
      const hp = new THREE.Path();
      hp.moveTo(w * 0.22, deep * 0.30); hp.lineTo(w * 0.42, deep * 0.28);
      hp.lineTo(w * 0.42, deep * 0.38); hp.lineTo(w * 0.22, deep * 0.40); hp.closePath();
      sh.holes.push(hp);
      const hp2 = new THREE.Path();
      hp2.moveTo(w * 0.22, deep * 0.52); hp2.lineTo(w * 0.40, deep * 0.50);
      hp2.lineTo(w * 0.40, deep * 0.60); hp2.lineTo(w * 0.22, deep * 0.62); hp2.closePath();
      sh.holes.push(hp2);
      // curved in cross-section via an extrude path that bows outward
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.030, 0.012), new THREE.Vector3(0, -0.050, 0.026)
      ]);
      const geo = new THREE.ExtrudeGeometry(sh, { steps: 6, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.005, bevelSegments: 2, extrudePath: path, curveSegments: 8 });
      const skin = mesh(geo, i % 2 ? W.SHELL_D : W.SHELL_SH, nm + '_skin', g);
      // rolled lip along the free (scalloped) edge
      const lipC = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, deep, 0.004),
        new THREE.Vector3(w * 0.40, deep * 0.78, -0.010),
        new THREE.Vector3(w * 0.70, deep * 0.46, -0.026),
        new THREE.Vector3(w, deep * 0.10, -0.040)
      ]);
      mesh(new THREE.TubeGeometry(lipC, 14, 0.008, 6, false), W.SHELL, nm + '_lip', g);
      boltRow(g, 4, 0.010, 0.004, 0.02, 0, 0, deep * 0.24, 0.6);
      g.position.set(0, owner.spec.R * 0.2, 0.06);
      g.rotation.y = -owner.spec.side * 0.0 + (dAz > 0 ? 0 : 0);
      g.rotation.z = -dAz * 0.5;
      g.rotation.x = -0.35;
      g.userData.rest = { q: g.quaternion.clone(), s: g.scale.clone() };
      webPanels.push(g);
    }
  }

  // ═════════════ HEAD (leading end) — child of mantle, origin at the waist
  const head = grp('head', mantle);
  head.position.set(0, 0.70 - 0.42, 0.20 - 0.16);
  head.rotation.x = -0.06;
  head.userData.restRot = head.rotation.clone();

  {
    // (a) frame block: 4 intersecting volumes
    const fb = grp('headFrameBlock', head);
    const topPlane = mesh(plate([[-0.31, -0.17], [0.31, -0.17], [0.26, 0.15], [-0.26, 0.15]], 0.080), W.MACHINE, 'headFrameBlock_top', fb);
    topPlane.rotation.x = -P / 2; topPlane.position.set(0, 0.10, 0.20);
    for (const sx of [-1, 1]) {
      const ch = mesh(cyl(0.14, 0.19, 0.24, 6), W.MACHINE, 'headFrameBlock_cheek' + (sx < 0 ? 'L' : 'R'), fb);
      ch.position.set(sx * 0.20, -0.02, 0.24);
      ch.rotation.z = P / 2; ch.rotation.y = sx * 22 * D;
    }
    const under = mesh(plate([[-0.13, -0.22], [0.13, -0.22], [0.10, 0.10], [0, 0.16], [-0.10, 0.10]], 0.16), W.MACHINE, 'headFrameBlock_under', fb);
    under.rotation.x = -P / 2 + 0.25; under.position.set(0, -0.14, 0.28);
    const step = mesh(new THREE.BoxGeometry(0.56, 0.020, 0.16), W.BRIGHT, 'headFrameBlock_shoulderLine', fb);
    step.position.set(0, 0.055, 0.20);
    boltRow(fb, 6, -0.20, 0.070, 0.14, 0.08, 0, 0, 0.8);

    // (b) waist hardware
    const wr = grp('headWaistRace', head);
    mesh(lathe([
      [0.05, 0], [0.13, 0], [0.13, 0.026], [0.10, 0.036], [0.10, 0.050], [0.05, 0.050]
    ], 18), W.MACHINE, 'headWaistRace_body', wr);
    boltRing(wr, 14, 0.115, 0.028, 'xy', 0.7, true);
    wr.rotation.x = P / 2; wr.position.set(0, 0.0, -0.02);
    const bel = mesh(lathe([
      [0.10, 0], [0.135, 0.012], [0.10, 0.024], [0.135, 0.036], [0.10, 0.048],
      [0.135, 0.060], [0.10, 0.072], [0.135, 0.084], [0.10, 0.096]
    ], 14), M_RUBBER, 'headWaistBellows', head);
    bel.rotation.x = P / 2; bel.position.set(0, -0.01, 0.09);
    for (const sx of [-1, 1]) {
      const gp = grp(sx < 0 ? 'headGearL' : 'headGearR', head);
      gearStack(gp, (sx < 0 ? 'headGearL' : 'headGearR') + '_stack', 0.065, 0.045, 0.030, 14);
      gp.position.set(sx * 0.16, 0.02, 0.02);
      gp.rotation.z = sx * P / 2;
    }
    for (const sx of [-1, 1]) {
      const r = ram(head, sx < 0 ? 'headRamL' : 'headRamR', 0.0275, 0.16, 0.07);
      r.position.set(sx * 0.19, 0.08, -0.05);
      r.rotation.x = -P / 2 + 0.9; r.rotation.z = sx * 0.2;
    }
  }

  // (c) head shells
  {
    const brow = grp('headBrowPlate', head);
    const sk = mesh(shellCyl(0.26, 0.32, 0.34, P / 2 - 75 * D, 150 * D, 20), W.SHELL_D, 'headBrowPlate_skin', brow);
    sk.rotation.x = P / 2; sk.scale.set(1, 1, 0.82);
    const rib = mesh(plate([[-0.020, 0], [0.020, 0], [0.016, 0.30], [-0.016, 0.30]], 0.020), W.SHELL, 'headBrowPlate_rib', brow);
    rib.rotation.x = -P / 2; rib.position.set(0, 0.26, -0.15);
    for (let i = 0; i < 2; i++) {
      const v = mesh(plate([[-0.040, -0.012], [0.040, -0.012], [0.034, 0.012], [-0.034, 0.012]], 0.010), W.BLUED, 'headBrowVent' + i, brow);
      v.rotation.x = -P / 2; v.position.set((i ? 1 : -1) * 0.10, 0.245, -0.02);
      for (let k = 0; k < 2; k++) {
        const s = mesh(new THREE.BoxGeometry(0.070, 0.006, 0.008), W.BLUED, 'browSlat', brow);
        s.position.set((i ? 1 : -1) * 0.10, 0.252, -0.03 + k * 0.014); s.rotation.x = 0.4;
      }
    }
    for (const sx of [-1, 1]) {
      const lip = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.32, 6), W.SHELL, 'headBrowPlate_lip', brow);
      lip.rotation.x = P / 2;
      const ang = P / 2 + sx * 75 * D;
      lip.position.set(Math.sin(ang) * 0.29, Math.cos(ang) * 0.29 * 0.82, 0);
    }
    for (let i = 0; i < 4; i++) standoff(brow, 'headBrowStandoff' + i, (i % 2 ? 1 : -1) * 0.13, 0.20, -0.10 + Math.floor(i / 2) * 0.20, 0.015);
    boltRow(brow, 6, -0.215, 0.145, -0.13, 0, 0, 0.055, 0.8);
    boltRow(brow, 6, 0.215, 0.145, -0.13, 0, 0, 0.055, 0.8);
    brow.position.set(0, 0.02, 0.20);
    brow.userData.rest = { p: brow.position.clone(), q: brow.quaternion.clone() };

    const nose = grp('headNosePlate', head);
    const n1 = mesh(plate([[-0.15, 0], [0.15, 0], [0.07, 0.26], [-0.07, 0.26]], 0.030), W.SHELL, 'headNosePlate_topPlane', nose);
    n1.rotation.x = -P / 2 + 0.30;
    for (const sx of [-1, 1]) {
      const n2 = mesh(plate([[-0.13, 0], [0.13, 0], [0.06, 0.26], [-0.06, 0.26]], 0.026), W.SHELL, 'headNosePlate_sidePlane' + (sx < 0 ? 'L' : 'R'), nose);
      n2.rotation.y = sx * P / 2 * 0.86; n2.rotation.x = -0.5;
      n2.position.set(sx * 0.10, -0.055, 0.02);
    }
    const nlip = mesh(new THREE.TorusGeometry(0.070, 0.010, 6, 14, P), W.SHELL, 'headNosePlate_lip', nose);
    nlip.rotation.x = P / 2 * 0.7; nlip.position.set(0, -0.075, 0.24);
    boltRow(nose, 4, -0.05, 0.03, 0.06, 0.033, 0, 0, 0.7);
    nose.position.set(0, -0.02, 0.30);
    nose.userData.rest = { p: nose.position.clone(), q: nose.quaternion.clone() };

    for (const sx of [-1, 1]) {
      const nm = sx < 0 ? 'headCheekPlateL' : 'headCheekPlateR';
      const g = grp(nm, head);
      const sk2 = mesh(shellCyl(0.17, 0.21, 0.20, P / 2 - 60 * D, 120 * D, 16), W.SHELL_D, nm + '_skin', g);
      sk2.rotation.z = P / 2;
      const lip = mesh(lipTorus(0.20, 0.008, 120 * D, 14), W.SHELL, nm + '_lip', g);
      lip.rotation.y = P / 2; lip.rotation.z = P / 2 - 60 * D; lip.position.x = 0.10;
      const v = mesh(plate([[-0.028, -0.010], [0.028, -0.010], [0.024, 0.010], [-0.024, 0.010]], 0.008), W.BLUED, nm + '_vent', g);
      v.rotation.x = -P / 2; v.position.set(0.0, 0.18, 0.03);
      const sub = mesh(plate([[-0.030, -0.020], [0.030, -0.020], [0.026, 0.020], [-0.026, 0.020]], 0.010), W.SHELL, nm + '_subPlate', g);
      sub.rotation.x = -P / 2; sub.position.set(0.0, 0.19, -0.05);
      for (let i = 0; i < 3; i++) standoff(g, nm + '_standoff' + i, -0.05 + i * 0.05, 0.155, 0.0, 0.013);
      boltRow(g, 4, -0.06, 0.16, 0.07, 0.04, 0, 0, 0.65);
      g.position.set(sx * 0.235, -0.03, 0.30);
      g.rotation.y = sx > 0 ? 0 : P;
      g.rotation.z = sx * -0.24;
      g.userData.rest = { p: g.position.clone(), q: g.quaternion.clone() };
    }

    const underP = grp('headUnderPlate', head);
    const usk = mesh(new THREE.SphereGeometry(0.28, 20, 12, -85 * D, 170 * D, P / 2 - 0.10, 70 * D), W.SHELL_SH, 'headUnderPlate_skin', underP);
    usk.scale.set(1.0, 0.7, 1.2);
    const ulip = mesh(new THREE.TorusGeometry(0.235, 0.009, 6, 18, 170 * D), W.SHELL, 'headUnderPlate_lip', underP);
    ulip.rotation.x = P / 2; ulip.rotation.z = -85 * D; ulip.position.y = -0.135;
    boltRow(underP, 4, -0.09, -0.02, -0.14, 0.06, 0, 0, 0.7);
    for (const sx of [-1, 1]) {
      const pin = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.036, 6), W.BRIGHT, 'headUnderPlate_pin', underP);
      pin.position.set(sx * 0.13, 0.0, -0.02); pin.rotation.z = P / 2;
    }
    underP.position.set(0, -0.12, 0.26);
    underP.rotation.x = 6 * D;
    underP.userData.restRot = underP.rotation.clone();
  }

  // (d) eye turrets
  const eyes = {};
  for (const sx of [-1, 1]) {
    const L = sx < 0;
    const nm = L ? 'eyeTurretL' : 'eyeTurretR';
    const t = grp(nm, head);
    t.position.set(sx * 0.31, 0.66 - 0.70, 0.36 - 0.20);
    t.rotation.set(0, 0, 0);
    // axis transverse (+X for R, -X for L), tilted 20° up and 12° forward
    t.rotation.z = sx * (P / 2 - 20 * D);
    t.rotation.y = sx * 12 * D;
    t.userData.restRot = t.rotation.clone();

    const bar = mesh(lathe([
      [0, 0], [0.150, 0], [0.150, 0.030], [0.138, 0.045], [0.138, 0.090],
      [0.128, 0.105], [0.128, 0.150], [0.120, 0.170], [0.098, 0.190], [0, 0.190]
    ], 20), W.MACHINE, (L ? 'eyeBarrelL' : 'eyeBarrelR'), t);
    const bez = mesh(lathe([
      [0.095, 0], [0.130, 0], [0.130, 0.020], [0.112, 0.026], [0.095, 0.020]
    ], 20), W.BRIGHT, (L ? 'eyeBezelL' : 'eyeBezelR'), t);
    bez.position.y = 0.190;
    boltRing(t, 10, 0.115, 0.212, 'xz', 0.45, true);
    const lens = mesh(new THREE.SphereGeometry(0.085, 20, 12, 0, P * 2, 0, 0.9), M_LENS, (L ? 'eyeLensL' : 'eyeLensR'), t);
    lens.scale.set(1, 0.55, 1);
    lens.position.y = 0.190 - 0.045;
    const iris = mesh(new THREE.TorusGeometry(0.096, 0.005, 5, 20), M_RUBBER, (L ? 'eyeIrisRingL' : 'eyeIrisRingR'), t);
    iris.rotation.x = P / 2; iris.position.y = 0.176;
    const hood = grp(L ? 'eyeBrowHoodL' : 'eyeBrowHoodR', t);
    const hs = mesh(shellCyl(0.150, 0.155, 0.12, P / 2 - 55 * D, 110 * D, 16), W.SHELL_D, 'eyeBrowHood_skin', hood);
    hs.rotation.x = P / 2; hs.rotation.z = 0;
    const hlip = mesh(lipTorus(0.152, 0.008, 110 * D, 14), W.SHELL, 'eyeBrowHood_lip', hood);
    hlip.rotation.z = P / 2 - 55 * D; hlip.position.z = 0.058;
    hood.position.y = 0.185;
    hood.rotation.x = -P / 2;
    hood.rotation.z = 0;
    // lid plate — crescent shutter on a visible pivot
    const lid = grp(L ? 'eyeLidPlateL' : 'eyeLidPlateR', t);
    const ls = mesh(new THREE.TorusGeometry(0.070, 0.030, 6, 18, 150 * D), W.SHELL_D, 'eyeLidPlate_skin', lid);
    ls.scale.set(1, 1, 0.28);
    ls.rotation.z = -75 * D;
    lid.position.y = 0.196;
    lid.rotation.x = -12 * D;
    lid.userData.restRot = lid.rotation.clone();
    const lpin = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.20, 6), W.BRIGHT, 'eyeLidPin', lid);
    lpin.rotation.z = P / 2;
    // 3 slit vanes below the lens
    for (let i = 0; i < 3; i++) {
      const v = mesh(plate([[-0.014, 0], [0.014, 0], [0.010, [0.10, 0.08, 0.06][i]], [-0.010, [0.10, 0.08, 0.06][i]]], 0.012), W.SHELL, (L ? 'eyeSlitVaneL' : 'eyeSlitVaneR') + (i + 1), t);
      v.position.set((i - 1) * 0.045, 0.166, 0.060);
      v.rotation.x = P / 2 - 0.5;
      v.rotation.z = (i - 1) * 0.20;
    }
    const er = ram(head, L ? 'eyeRamL' : 'eyeRamR', 0.015, 0.10, 0.045);
    er.position.set(sx * 0.20, -0.09, 0.28);
    er.rotation.x = -0.8; er.rotation.z = sx * -0.9;
    // greebles + the boot & split cable
    const gg = grp(L ? 'eyeGreeblesL' : 'eyeGreeblesR', t);
    boltRing(gg, 8, 0.140, 0.026, 'xz', 0.55, true);
    junction(gg, 'eyeFitting1', 0.018, 0.014, 0.016, 0.10, 0.070, 0.06);
    junction(gg, 'eyeFitting2', 0.016, 0.012, 0.014, -0.10, 0.070, -0.05);
    port(gg, (L ? 'eyePortCollarL' : 'eyePortCollarR'), 0.012, 0.0, 0.090, -0.130, new THREE.Vector3(0, 0.3, -1));
    const boot = mesh(lathe([
      [0.150, 0], [0.175, 0.010], [0.150, 0.020], [0.175, 0.030], [0.150, 0.040]
    ], 14), M_RUBBER, L ? 'eyeBootL' : 'eyeBootR', t);
    boot.position.y = 0.006;
    // distal half of the eye feed (on the turret)
    hose(t, (L ? 'eyeFeedLDist' : 'eyeFeedRDist'), [
      [0.11, 0.030, -0.12], [0.05, 0.070, -0.16], [0.0, 0.088, -0.135]
    ], 0.016, false, null);
    eyes[L ? 'L' : 'R'] = { turret: t, lid, lens };
    // proximal half (on the head), landing in the same boot
    hose(head, (L ? 'eyeFeedLProx' : 'eyeFeedRProx'), [
      [sx * 0.20, -0.05, 0.20], [sx * 0.28, -0.02, 0.14], [sx * 0.31, -0.030, 0.155]
    ], 0.016, false, [0.5]);
    port(head, (L ? 'eyeFeedPortL' : 'eyeFeedPortR'), 0.012, sx * 0.20, -0.05, 0.20, new THREE.Vector3(sx * 0.3, -1, 0));
  }

  // (e) beak assembly
  const beak = grp('beakAssembly', head);
  beak.position.set(0, 0.46 - 0.70, 0.62 - 0.20);
  const beakUpper = grp('beakUpper', beak);
  const beakLower = grp('beakLower', beak);
  {
    for (const [g, sgn, nm] of [[beakUpper, 1, 'beakUpper'], [beakLower, -1, 'beakLower']]) {
      const p1 = mesh(plate([[-0.055, 0], [0.055, 0], [0.030, 0.13], [-0.030, 0.13]], 0.020), W.SHELL, nm + '_planeA', g);
      p1.rotation.x = -P / 2 + sgn * 0.35;
      const p2 = mesh(plate([[-0.050, 0], [0.050, 0], [0.026, 0.12], [-0.026, 0.12]], 0.018), W.SHELL, nm + '_planeB', g);
      p2.rotation.x = -P / 2 + sgn * 0.75;
      p2.position.y = sgn * -0.012;
      const lip = mesh(new THREE.TorusGeometry(0.040, 0.008, 6, 12, P), W.SHELL, nm + '_lip', g);
      lip.rotation.x = P / 2 * sgn; lip.position.set(0, sgn * 0.006, 0.115);
      const TL2 = [0.045, 0.055, 0.055, 0.045];
      for (let i = 0; i < 4; i++) {
        const t = mesh(cyl(0.004, 0.012, TL2[i], 5), W.BRONZE, nm.replace('beak', 'beakTooth').replace('Upper', 'U').replace('Lower', 'L') + (i + 1), g);
        t.position.set((i - 1.5) * 0.028, sgn * -0.014, 0.115);
        t.rotation.x = P / 2 * (sgn > 0 ? 1 : 1) - sgn * 0.5;
      }
      const pin = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.10, 6), W.BRIGHT, nm + '_pin', g);
      pin.rotation.z = P / 2;
    }
    beakLower.rotation.x = 0;
    beakLower.userData.restRot = beakLower.rotation.clone();
    beakUpper.userData.restRot = beakUpper.rotation.clone();
    const r = ram(beak, 'beakRam', 0.013, 0.07, 0.030);
    r.position.set(0.05, -0.055, -0.02);
    r.rotation.x = -0.8; r.rotation.z = -0.5;
    const drum = grp('radulaDrum', beak);
    mesh(cyl(0.035, 0.035, 0.05, 12), W.BRIGHT, 'radulaDrum_body', drum);
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * P * 2;
      const rr = mesh(new THREE.BoxGeometry(0.008, 0.052, 0.006), W.BRONZE, 'radulaRib', drum);
      rr.position.set(Math.cos(a) * 0.036, 0, Math.sin(a) * 0.036);
      rr.rotation.y = -a;
    }
    drum.rotation.z = P / 2;
    drum.position.set(0, 0, 0.055);
    const coll = mesh(lathe([
      [0.020, 0], [0.048, 0], [0.048, 0.014], [0.032, 0.022], [0.020, 0.022]
    ], 14), W.MACHINE, 'beakCollar', beak);
    coll.rotation.x = -P / 2; coll.position.set(0, -0.02, -0.05);
    boltRing(beak, 8, 0.040, -0.030, 'xz', 0.5, true);
  }

  // (f) sensor stalks
  for (const [nm, sx, len] of [['sensorStalkA', -1, 0.10], ['sensorStalkB', 1, 0.075]]) {
    const g = grp(nm, head);
    mesh(cyl(0.006, 0.008, len, 6), W.MACHINE, nm + '_rod', g).position.y = len / 2;
    const can = mesh(lathe([[0, 0], [0.014, 0], [0.014, 0.020], [0.008, 0.026], [0, 0.026]], 10), W.BRIGHT, nm + '_can', g);
    can.position.y = len;
    bolt(g, 0, len + 0.028, 0, 0.5, true);
    g.position.set(sx * 0.09, 0.13, 0.16);
    g.rotation.x = -0.25; g.rotation.z = sx * 0.15;
  }

  // (g) head harness (runs 13-15) + beak feed distal half
  {
    const hh = grp('harnessHead', head);
    junction(hh, 'headBrowJunction', 0.026, 0.020, 0.022, 0, 0.12, 0.02);
    hose(hh, 'browSignalA', [[-0.09, 0.14, 0.155], [-0.05, 0.14, 0.10], [-0.01, 0.13, 0.035]], 0.008, false, null);
    hose(hh, 'browSignalB', [[0.09, 0.115, 0.155], [0.05, 0.13, 0.10], [0.01, 0.13, 0.035]], 0.008, false, null);
    for (const sx of [-1, 1]) {
      const nm = sx < 0 ? 'cheekLoopL' : 'cheekLoopR';
      const shorten = sx > 0 ? 0.02 : 0;
      hose(hh, nm, [
        [sx * 0.24, 0.16, 0.25],
        [sx * 0.33, 0.09, 0.20 + shorten],
        [sx * 0.30, -0.06, 0.14],
        [sx * 0.20, -0.12, 0.16]
      ], 0.016, false, [0.35, 0.75]);
      port(hh, nm + '_portA', 0.012, sx * 0.24, 0.16, 0.25, new THREE.Vector3(sx * 0.4, 1, 0));
      port(hh, nm + '_portB', 0.012, sx * 0.20, -0.12, 0.16, new THREE.Vector3(sx * 0.3, -1, 0));
    }
    hose(hh, 'beakFeedDist', [
      [0.0, -0.245, 0.40], [0.0, -0.20, 0.22], [0.0, -0.13, 0.05], [0.0, -0.06, -0.02]
    ], 0.016, false, [0.5]);
    blank(hh, 'headBlank1', 0.020, 0.16, 0.11, 0.34);
    blank(hh, 'headBlank2', 0.018, -0.17, 0.10, 0.30);
    junction(hh, 'headJunction2', 0.022, 0.018, 0.020, -0.14, -0.10, 0.22);
  }

  // ═════════════ MANTLE HARNESS (runs 1-9) + beak feed proximal
  {
    const hm = grp('harnessMantle', mantle);
    const apex = sp(0.03);
    port(hm, 'apexPortL', 0.014, -0.05, apex.y + 0.10, apex.z + 0.04, new THREE.Vector3(-0.3, 1, 0.5));
    port(hm, 'apexPortR', 0.014, 0.05, apex.y + 0.10, apex.z + 0.04, new THREE.Vector3(0.3, 1, 0.5));
    for (const sx of [-1, 1]) {
      const nm = sx < 0 ? 'dorsalTrunkA' : 'dorsalTrunkB';
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const t = 0.06 + (0.35 - 0.06) * (i / 5);
        const p = sp(t);
        const rr = 0.30 + 0.30 * Math.sin(P * (t - 0.02) / 0.72);
        pts.push([p.x + sx * 0.10, p.y + rr * 0.60 + 0.020 - (i % 2 ? 0.016 : 0), p.z]);
      }
      const gp = sp(0.35);
      pts.push([sx * 0.44, gp.y + 0.06, gp.z]);
      pts.push([sx * 0.50, gp.y + 0.02, gp.z]);
      hose(hm, nm, pts, 0.030, true, [0.25, 0.5, 0.78]);
      port(hm, nm + '_endPort', 0.014, sx * 0.50, gp.y + 0.02, gp.z, new THREE.Vector3(sx, 0.3, 0));
    }
    for (const sx of [-1, 1]) {
      const nm = sx < 0 ? 'flankMediumL' : 'flankMediumR';
      const a = sp(0.14);
      hose(hm, nm, [
        [sx * 0.34, a.y + 0.20, a.z],
        [sx * 0.54, a.y + 0.10, a.z + 0.16],
        [sx * 0.62, 0.30, -0.44],
        [sx * 0.58, 0.16, -0.34],
        [sx * 0.56, 0.09, -0.27]
      ], 0.016, false, [0.2, 0.45, 0.68, 0.88]);
      port(hm, nm + '_startPort', 0.012, sx * 0.34, a.y + 0.20, a.z, new THREE.Vector3(sx * 0.6, 1, 0));
    }
    for (const sx of [-1, 1]) {
      const nm = sx < 0 ? 'signalBundleL' : 'signalBundleR';
      const g = grp(nm, hm);
      const from = [sx * 0.40, 0.20, 0.02];
      const to = sx < 0 ? [-0.26, sp(0.20).y + 0.30, sp(0.20).z] : [0.30, sp(0.46).y + 0.02, sp(0.46).z];
      for (let k = 0; k < 4; k++) {
        const off = (k - 1.5) * 0.010;
        hose(g, nm + '_w' + k, [
          [from[0], from[1] + off, from[2] + off * 0.5],
          [(from[0] + to[0]) / 2 + off, (from[1] + to[1]) / 2 + 0.05, (from[2] + to[2]) / 2],
          [to[0] + off * 0.7, to[1] + off * 0.6, to[2] + off * 0.4]
        ], 0.008, false, null);
      }
      const c1 = mesh(lathe([[0.014, 0], [0.028, 0], [0.028, 0.014], [0.014, 0.014]], 10), W.BLUED, nm + '_bundleClamp1', g);
      c1.position.set(from[0], from[1] + 0.02, from[2]);
      const c2 = mesh(lathe([[0.014, 0], [0.028, 0], [0.028, 0.014], [0.014, 0.014]], 10), W.BLUED, nm + '_bundleClamp2', g);
      c2.position.set(to[0], to[1] - 0.03, to[2]);
      junction(g, nm + '_junction', 0.024, 0.018, 0.020, from[0], from[1] - 0.02, from[2]);
      for (let k = 0; k < 4; k++) port(g, nm + '_fanPort' + k, 0.007, to[0] + (k - 1.5) * 0.012, to[1], to[2], new THREE.Vector3(0, 1, 0));
    }
    // funnel feed, proximal half in mantle space
    const kf = [0.14, 0.18 - 0.42 + 0.16, 0.02];
    port(hm, 'funnelFeedPort', 0.014, 0.14, -0.14, 0.02, new THREE.Vector3(0.2, -1, 0.4));
    hose(hm, 'funnelFeedTrunk', [
      [0.14, -0.13, 0.02], [0.22, -0.11, 0.00], [0.28, -0.11, -0.04], [0.30, -0.115, -0.055]
    ], 0.030, true, [0.6]);
    hose(funnel, 'funnelFeedDistal', [
      [-0.055, 0.02, 0.02], [-0.070, 0.09, 0.03], [-0.030, 0.15, 0.05], [0.0, 0.16, 0.052]
    ], 0.030, true, [0.5]);
    // hatch loom
    hose(mantleHatch, 'hatchLoom', [
      [0.0, -0.030, -0.02], [0.02, -0.020, 0.05], [0.03, 0.010, 0.075]
    ], 0.016, false, null);
    port(mantleHatch, 'hatchLoomPort', 0.011, 0.03, 0.012, 0.075, new THREE.Vector3(0, 1, 0.5));
    // aft cross-tie
    const r1 = sp(0.05);
    hose(hm, 'aftCrossTie', [
      [-0.26, r1.y + 0.16, r1.z], [0, r1.y + 0.22, r1.z + 0.01], [0.26, r1.y + 0.16, r1.z]
    ], 0.016, false, [0.5]);
    port(hm, 'aftCrossPortL', 0.012, -0.26, r1.y + 0.16, r1.z, new THREE.Vector3(-1, 0.4, 0));
    port(hm, 'aftCrossPortR', 0.012, 0.26, r1.y + 0.16, r1.z, new THREE.Vector3(1, 0.4, 0));
    // beak feed proximal — meets inside headWaistBellows
    hose(hm, 'beakFeedProx', [
      [0.0, 0.20, 0.05], [0.0, 0.24, 0.10], [0.0, 0.27, 0.05]
    ], 0.016, false, null);
    port(crown, 'crownBeakPort', 0.012, 0.0, 0.02, 0.20, new THREE.Vector3(0, 1, 0.4));
  }

  // ═════════════════════════════════════════════════ POSE
  // capture rest state
  const REST = {
    mantlePos: mantle.position.clone(),
    mantleRotX: -12 * D,
    headRot: head.rotation.clone(),
    crownRotX: crown.rotation.x
  };
  mantle.rotation.x = REST.mantleRotX;

  const armList = ARMS.map(a => armNodes[a.n]);
  const PHASE = { armR4: 0.00, armL4: 0.50, armR3: 0.14, armL3: 0.64, armR2: 0.28, armL2: 0.78, armR1: 0.42, armL1: 0.92 };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
  const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  // keyframe interpolation across a table [[phase, value], ...]
  function key(tbl, p) {
    if (p <= tbl[0][0]) return tbl[0][1];
    for (let i = 1; i < tbl.length; i++) {
      if (p <= tbl[i][0]) {
        const t = ss(tbl[i - 1][0], tbl[i][0], p);
        return lerp(tbl[i - 1][1], tbl[i][1], t);
      }
    }
    return tbl[tbl.length - 1][1];
  }
  // speed-sampled scalars
  function bySpeed(v, sp) {
    const S = [0, 0.5, 1, 2, 3, 6];
    if (sp <= 0) return v[0];
    for (let i = 1; i < 6; i++) {
      if (sp <= S[i]) return lerp(v[i - 1], v[i], (sp - S[i - 1]) / (S[i] - S[i - 1]));
    }
    return v[5];
  }

  function setSuckers(arm, ext) {
    for (const su of arm.suckers) {
      const p = su.userData.piston;
      p.position.y = su.userData.pistonRestY + su.userData.pistonDepth * (ext - 1) * 0.9;
    }
  }

  // write a whole arm from joint angles (degrees, elevation-style) + yaw + tip curl
  function writeArm(arm, elevDeg, yawDeg, tipDeg, roll) {
    const segs = arm.segs;
    for (let i = 0; i < 7; i++) {
      const s = segs[i];
      s.rotation.set(-elevDeg[i] * D, (yawDeg[i] || 0) * D, (roll ? roll[i] * D : 0));
    }
    for (let i = 0; i < 3; i++) arm.tipLinks[i].rotation.set(-tipDeg[i] * D, 0, 0);
  }

  const restElevFor = (rank) => REST_ELEV[rank].slice();
  const restTipFor = (rank) => REST_TIP[rank].slice();
  const bowFor = (arm) => [0, arm.spec.side * 6, arm.spec.side * 4, arm.spec.side * 2, 0, 0, 0];

  function baseShellReset() {
    // restore shells / plates that evolve moves
    for (const p of [mantlePlateTopFwd, mantlePlateTopMid, mantlePlateTopAft, mantlePlateFlankL, mantlePlateFlankR]) {
      p.position.copy(p.userData.rest.p); p.quaternion.copy(p.userData.rest.q);
    }
    const apex = mantle.getObjectByName('mantleApexCap');
    if (apex && apex.userData.rest) { apex.position.copy(apex.userData.rest.p); apex.quaternion.copy(apex.userData.rest.q); }
    for (const nm of ['headBrowPlate', 'headNosePlate', 'headCheekPlateL', 'headCheekPlateR']) {
      const o = head.getObjectByName(nm);
      if (o && o.userData.rest) { o.position.copy(o.userData.rest.p); o.quaternion.copy(o.userData.rest.q); }
    }
    for (const arm of armList) {
      for (const l of ['A', 'B']) {
        const sh = arm.segs[l === 'A' ? 0 : 1].getObjectByName(arm.spec.n + '_shell' + l);
        if (sh && sh.userData.rest) { sh.position.copy(sh.userData.rest.p); sh.quaternion.copy(sh.userData.rest.q); }
      }
    }
    for (let i = 0; i < webPanels.length; i++) {
      webPanels[i].quaternion.copy(webPanels[i].userData.rest.q);
      webPanels[i].scale.copy(webPanels[i].userData.rest.s);
    }
    for (let i = 0; i < ridgeVanes.length; i++) ridgeVanes[i].quaternion.copy(ridgeVanes[i].userData.restQ);
  }

  function setVanes(deg, fanDeg) {
    for (let i = 0; i < ridgeVanes.length; i++) {
      const v = ridgeVanes[i];
      v.quaternion.copy(v.userData.restQ);
      v.rotateX(-deg * D);
      if (fanDeg) v.rotateY((i - 4) * fanDeg * D * 0.25);
    }
  }

  function setLid(side, closed01) {
    const e = eyes[side];
    e.lid.rotation.copy(e.lid.userData.restRot);
    e.lid.rotation.x = -12 * D - closed01 * 58 * D;
  }

  object_pose_setup: {
    root.userData.pose = (s) => {
      const t = s.t || 0;
      const stride = s.stride || 0;
      const speed = Math.max(0, s.speed || 0);
      const turn = s.turn || 0;
      const health = s.health === undefined ? 1 : s.health;
      const act = s.action || null;
      const ph = s.phase === undefined ? 0 : s.phase;

      baseShellReset();

      // ── base (gait / stand) values
      const mantleY = bySpeed([0.42, 0.34, 0.42, 0.47, 0.52, 0.56], speed);
      const mantlePitch = bySpeed([-12, -16, -13, -10, -7, -4], speed);
      const headPitchX = bySpeed([2, -8, -4, -2, 0, 4], speed);
      const strideArc = bySpeed([0, 16, 22, 28, 33, 40], speed);
      const lift = bySpeed([0, 8, 14, 20, 26, 34], speed);
      const pull = bySpeed([0, 6, 12, 20, 28, 38], speed);
      const splay = bySpeed([0, -4, 0, -3, -6, -10], speed);
      const duty = bySpeed([0.62, 0.72, 0.62, 0.55, 0.48, 0.40], speed);
      const tipLoose = bySpeed([0, 0, 0, 0.18, 0.32, 0.52], speed);
      const breathAmp = 0.012 * bySpeed([1, 0.7, 0.5, 0.4, 0.3, 0.2], speed);
      const vaneUp = bySpeed([0, 0, 0, 4, 7, 11], speed);
      const funnelPitchExtra = bySpeed([0, 0, 0, -8, -14, -22], speed);
      const frontPlanted = ss(1.4, 2.2, speed);

      // idle scan / weight shift
      const scanY = Math.sin(t * 0.13 * P * 2) * 11;
      const scanX = Math.sin(t * 0.19 * P * 2) * 5;
      const shiftYaw = Math.sin(t * P * 2 / 11) * 1.4;
      const shiftRoll = Math.cos(t * P * 2 / 11) * 1.0;
      const idle = 1 - ss(0, 0.6, speed);

      // ── heave from stride
      const heave = Math.sin(stride * P * 4) * 0.018 * ss(0.1, 1.0, speed);

      // targets that overlays / actions will modify
      let mY = mantleY + heave;
      let mZ = 0, mX = 0;
      let mPitch = mantlePitch, mRoll = shiftRoll * idle, mYaw = shiftYaw * idle;
      let hPitch = headPitchX + scanX * idle, hYaw = scanY * idle, hRoll = 0;
      let breathe = Math.sin(t * 0.55 * P * 2) * breathAmp;
      let mScale = 1 + breathe;
      let arcMul = 1, pullMul = 1, splayAdd = 0, liftMul = 1;
      let lidL = 0.12, lidR = 0.12;
      let vane = vaneUp, vaneFan = 0;
      let funnelP = funnelPitchExtra, funnelY = 0;
      let underPlateOpen = 6, beakOpen = 0, radula = 0;
      let suckExt = 1;
      let stepping = true, jetting = false;
      const armOverride = {};   // n -> {elev, yaw, tip, suck}
      const armMul = {};        // n -> {arc, pull, lift, hold}

      // blink
      const bl = (per, off) => {
        const x = ((t + off) % per) / per;
        return ss(0, 0.06, x) - ss(0.06, 0.12, x);
      };
      lidL += bl(3.4, 0.0) * 0.85;
      lidR += bl(4.1, 1.7) * 0.85;

      // ── overlays: turn
      if (turn !== 0 && !act) {
        const k = Math.abs(turn), sgn = Math.sign(turn); // -1 left
        mRoll += sgn * -11 * k;
        mYaw += sgn * -7 * k;
        hYaw += sgn * -26 * k;
        hRoll += sgn * -8 * k;
        funnelY += sgn * -18 * k;
        vaneFan += sgn * -6 * k;
        for (const arm of armList) {
          const inner = (sgn < 0) ? (arm.spec.side < 0) : (arm.spec.side > 0);
          armMul[arm.spec.n] = { arc: inner ? lerp(1, 0.55, k) : lerp(1, 1.35, k), pull: inner ? 1 : lerp(1, 1.3, k), flex: inner ? 9 * k : 0, hold: (inner && arm.spec.rank === 4) ? 0.6 * k : 0 };
        }
      }

      // ── overlays: hurt
      let hurtK = 0;
      if (health < 0.95 && !act) {
        hurtK = clamp01((1 - health) / 0.8);
        mRoll += 7 * hurtK;
        mY -= 0.05 * hurtK;
        mPitch += -5 * hurtK;
        hPitch += -17 * hurtK;
        hYaw += -9 * hurtK;
        lidL = Math.max(lidL, 0.60 * hurtK);
        lidR = Math.max(lidR, 0.15 * hurtK);
        vane = lerp(vane, -4, hurtK);
        mScale += Math.sin(t * 1.7 * P * 2) * 0.02 * hurtK;
        suckExt = lerp(suckExt, 0.72, hurtK);
        armMul['armL2'] = Object.assign(armMul['armL2'] || {}, { arc: (armMul['armL2'] ? armMul['armL2'].arc : 1) * lerp(1, 0.5, hurtK) });
        const droop = Math.sin(t * 0.9 * P * 2) * 3 * hurtK;
        armOverride['armL1'] = {
          elev: [lerp(26, -12, hurtK), lerp(6, -24, hurtK) + droop, lerp(-16, -24, hurtK), lerp(-30, -24, hurtK) + droop, lerp(-34, -24, hurtK), lerp(-22, -24, hurtK), lerp(-6, -18, hurtK)],
          tip: [lerp(38, 8, hurtK), lerp(46, 8, hurtK), lerp(52, 8, hurtK)]
        };
      }

      // ── overlays: airborne = jetting
      if (s.grounded === false && !act) {
        stepping = false; jetting = true;
        mPitch = 8; mY = mantleY + 0.10;
        hPitch = 6; hYaw *= 0.2;
        const pulse = Math.sin(t * 2.4 * P * 2);
        mScale = 1 - 0.03 + pulse * 0.03;
        funnelP = -38 - 25; funnelY = -25;
        lidL = 0; lidR = 0;
        vane = 2;
        suckExt = 0.55;
        for (const arm of armList) {
          const az = arm.spec.az;
          const targetAz = Math.sign(az) * Math.min(22, Math.abs(az));
          const flutter = Math.sin(t * 3 * P * 2 + az) * 5;
          armOverride[arm.spec.n] = {
            elev: [4, 2, 0, -2, -2, -1, 0],
            yaw: [(targetAz - az) * 1.0, 0, 0, 0, 0, 0, 0],
            tip: [12 + flutter, 12, 12]
          };
        }
      }

      // ═══════════ ACTIONS
      if (act) {
        stepping = false;
        const A = {};
        if (act === 'attack') {
          const wind = ss(0, 0.25, ph), commit = ss(0.25, 0.50, ph), hold = ss(0.50, 0.72, ph), rec = ss(0.72, 1.0, ph);
          mY = mantleY + key([[0, 0], [0.25, 0.10], [0.5, -0.02], [0.72, 0.0], [1, 0]], ph);
          mZ = key([[0, 0], [0.25, -0.04], [0.5, 0.16], [0.72, 0.10], [1, 0]], ph);
          mPitch = key([[0, mantlePitch], [0.25, 14], [0.5, -22], [0.72, -14], [0.9, -4], [1, mantlePitch]], ph);
          hPitch = key([[0, headPitchX], [0.25, 8], [0.5, -12], [0.72, -6], [1, headPitchX]], ph);
          underPlateOpen = key([[0, 6], [0.25, 18], [0.5, 34], [0.72, 4], [1, 6]], ph);
          beakOpen = key([[0, 0], [0.25, 12], [0.5, 34], [0.62, 2], [0.72, 2], [1, 0]], ph);
          radula = hold * 3 * P * 2;
          suckExt = key([[0, 1], [0.25, 0.9], [0.5, 1.35], [0.72, 1.3], [1, 1]], ph);
          vane = key([[0, vaneUp], [0.3, 10], [0.6, 6], [1, vaneUp]], ph);
          for (const arm of armList) {
            const rank = arm.spec.rank;
            if (rank === 1) {
              const lagPer = 0.06;
              const el = [];
              for (let i = 0; i < 7; i++) {
                const p2 = clamp01(ph - i * lagPer / 2);
                el.push(key([[0, REST_ELEV[1][i]], [0.25, [54, 40, 10, -10, -20, -10, 0][i]], [0.5, [-20, -8, 4, 10, 14, 10, 4][i]], [0.72, [10, 20, 30, 30, 26, 18, 10][i]], [1, REST_ELEV[1][i]]], p2));
              }
              armOverride[arm.spec.n] = {
                elev: el,
                tip: [key([[0, 38], [0.25, 62], [0.5, 6], [0.72, 60], [1, 38]], ph), key([[0, 46], [0.25, 68], [0.5, 8], [0.72, 66], [1, 46]], ph), key([[0, 52], [0.25, 72], [0.5, 10], [0.72, 70], [1, 52]], ph)]
              };
            } else {
              const braceEl = restElevFor(rank).map((v, i) => v + key([[0, 0], [0.25, [6, -6, -4, -2, 2, 0, 0][i]], [0.5, [2, -10, -6, -2, 0, 0, 0][i]], [1, 0]], ph));
              armOverride[arm.spec.n] = { elev: braceEl, yaw: bowFor(arm).map((v, i) => v + (i === 0 ? arm.spec.side * 12 * ss(0, 0.3, ph) * (1 - ss(0.72, 1, ph)) : 0)), tip: restTipFor(rank) };
            }
          }
        } else if (act === 'fire') {
          mPitch = key([[0, mantlePitch], [0.35, -6], [0.55, -6], [0.78, 9], [1, mantlePitch]], ph);
          mY = mantleY + key([[0, 0], [0.55, 0], [0.78, 0.04], [1, 0]], ph);
          mZ = key([[0, 0], [0.45, 0], [0.6, -0.10], [0.78, -0.06], [1, 0]], ph);
          mScale = 1 + key([[0, 0], [0.35, 0], [0.45, -0.05], [0.5, -0.11], [0.55, -0.11], [0.78, -0.02], [1, 0]], ph);
          hPitch = key([[0, headPitchX], [0.35, -8], [0.55, -8], [0.78, 6], [1, headPitchX]], ph);
          hYaw = 0;
          funnelP = key([[0, funnelPitchExtra], [0.35, 42], [0.55, 42], [0.62, 30], [1, funnelPitchExtra]], ph);
          funnelY = key([[0, 0], [0.35, -25], [0.78, -25], [1, 0]], ph);
          vane = key([[0, vaneUp], [0.45, 8], [0.7, 4], [1, vaneUp]], ph);
          lidL = lidR = key([[0, 0.12], [0.35, 0], [0.7, 0], [1, 0.12]], ph);
          const conv = ss(0.1, 0.35, ph) * (1 - ss(0.78, 1, ph));
          for (const arm of armList) {
            const el = restElevFor(arm.spec.rank).map((v, i) => v + (i < 3 ? key([[0, 0], [0.35, -4], [0.62, [8, -6, -4][i]], [1, 0]], ph) : 0));
            armOverride[arm.spec.n] = { elev: el, yaw: bowFor(arm).map((v, i) => v + (i === 0 ? arm.spec.side * 8 * ss(0.1, 0.35, ph) * (1 - ss(0.8, 1, ph)) : 0)), tip: restTipFor(arm.spec.rank) };
          }
          suckExt = key([[0, 1], [0.35, 1.2], [0.78, 1.2], [1, 1]], ph);
          eyes.L.turret.userData.conv = conv; eyes.R.turret.userData.conv = conv;
        } else if (act === 'hit') {
          const f = key([[0, 0], [0.14, 1], [0.42, -0.35], [0.62, 0.12], [0.82, -0.04], [1, 0]], ph);
          mZ = -0.13 * f; mRoll = 13 * f; mPitch = mantlePitch + 11 * f; mYaw = 6 * f;
          hPitch = headPitchX - 22 * f; hYaw = 14 * f;
          lidL = lidR = 0.12 + 0.63 * Math.max(0, f);
          vane = vaneUp + 14 * Math.max(0, f);
          mScale = 1 - 0.03 * Math.max(0, f);
          for (const arm of armList) {
            const el = restElevFor(arm.spec.rank).map((v, i) => v + (i === 0 ? 15 * f : (i < 4 ? -20 * f * 0.5 : 0)));
            armOverride[arm.spec.n] = { elev: el, tip: restTipFor(arm.spec.rank).map(v => v + 8 * Math.max(0, f)) };
          }
          for (let i = 0; i < webPanels.length; i++) webPanels[i].scale.multiplyScalar(1 - 0.08 * Math.max(0, f));
        } else if (act === 'block') {
          const k = ss(0, 0.15, ph) * (1 - ss(0.85, 1, ph));
          mY = mantleY - 0.12 * k; mZ = -0.10 * k; mPitch = mantlePitch + (18 - mantlePitch) * k;
          hPitch = headPitchX + (-30 - headPitchX) * k; mX = 0;
          head.userData.zTuck = -0.06 * k;
          underPlateOpen = lerp(6, 0, k); lidL = lidR = lerp(0.12, 0.55, k);
          vane = lerp(vaneUp, 16, k);
          suckExt = lerp(1, 1.35, k);
          for (const arm of armList) {
            const rank = arm.spec.rank;
            if (rank <= 2) {
              const tgt = [40, -10, -45, -55, -20, -6, 0];
              armOverride[arm.spec.n] = { elev: restElevFor(rank).map((v, i) => lerp(v, tgt[i], k)), tip: restTipFor(rank).map(v => lerp(v, 70, k)) };
            } else {
              armOverride[arm.spec.n] = {
                elev: restElevFor(rank).map((v, i) => v + (i < 4 ? [-4, -8, -6, -4][i] * k : 0)),
                yaw: bowFor(arm).map((v, i) => v + (i === 0 ? arm.spec.side * 18 * k : 0)),
                tip: restTipFor(rank)
              };
            }
          }
        } else if (act === 'gather' || act === 'deposit') {
          const dep = act === 'deposit';
          const p = ph;
          if (!dep) {
            mY = mantleY + key([[0, 0], [0.30, -0.20], [0.5, -0.20], [0.8, 0.05], [1, 0]], p);
            mZ = key([[0, 0], [0.30, 0.08], [0.8, 0.02], [1, 0]], p);
            mPitch = key([[0, mantlePitch], [0.30, -24], [0.5, -24], [0.8, 8], [1, mantlePitch]], p);
            hPitch = key([[0, headPitchX], [0.30, -26], [0.5, -22], [1, headPitchX]], p);
            underPlateOpen = key([[0, 6], [0.5, 14], [0.8, 8], [1, 6]], p);
          } else {
            mY = mantleY + key([[0, 0], [0.22, -0.06], [0.55, -0.16], [0.72, -0.14], [1, 0]], p);
            mPitch = key([[0, mantlePitch], [0.22, -10], [0.55, -20], [0.72, -18], [1, mantlePitch]], p);
            hPitch = key([[0, headPitchX], [0.3, -20], [0.8, -20], [1, headPitchX]], p);
          }
          for (const arm of armList) {
            const rank = arm.spec.rank;
            if (rank === 1) {
              const reach = dep
                ? [key([[0, 18], [0.22, 6], [0.55, -14], [0.72, -14], [1, 26]], p), key([[0, 30], [0.55, -4], [1, 6]], p), key([[0, 20], [0.55, -20], [1, -16]], p), key([[0, -10], [0.55, -34], [1, -30]], p), key([[0, -20], [0.55, -34], [1, -34]], p), key([[0, -14], [0.55, -22], [1, -22]], p), key([[0, -6], [0.55, -6], [1, -6]], p)]
                : [key([[0, 26], [0.3, -8], [0.5, 0], [0.8, 18], [1, 18]], p), key([[0, 6], [0.3, -2], [0.5, 10], [0.8, 30], [1, 30]], p), key([[0, -16], [0.3, -18], [0.5, -6], [0.8, 20], [1, 20]], p), key([[0, -30], [0.3, -30], [0.5, -20], [0.8, -10], [1, -10]], p), key([[0, -34], [0.3, -30], [0.5, -30], [1, -20]], p), key([[0, -22], [0.3, -16], [0.5, -30], [1, -14]], p), key([[0, -6], [0.3, -4], [0.5, -20], [1, -6]], p)];
              const tipV = dep
                ? [key([[0, 65], [0.55, 65], [0.72, 10], [1, 38]], p), key([[0, 65], [0.55, 65], [0.72, 10], [1, 46]], p), key([[0, 65], [0.55, 65], [0.72, 10], [1, 52]], p)]
                : [key([[0, 38], [0.3, 6], [0.5, 60], [1, 62]], p), key([[0, 46], [0.3, 6], [0.5, 66], [1, 66]], p), key([[0, 52], [0.3, 6], [0.5, 70], [1, 70]], p)];
              armOverride[arm.spec.n] = { elev: reach, tip: tipV };
            } else {
              armOverride[arm.spec.n] = { elev: restElevFor(rank).map((v, i) => v + (i > 0 && i < 5 ? (dep ? -4 : -8) * ss(0, 0.3, p) : 0)), tip: restTipFor(rank) };
            }
          }
          // grip wave
          const gw = dep ? key([[0, 1.3], [0.55, 1.3], [0.72, 0.6], [1, 1]], p) : key([[0, 1], [0.3, 0.85], [0.5, 1.35], [1, 1.2]], p);
          suckExt = gw;
        } else if (act === 'eat') {
          mY = mantleY - 0.14; mPitch = -20; hPitch = -30;
          underPlateOpen = 26;
          const c = (ph * 3) % 1;
          beakOpen = key([[0, 0], [0.18, 30], [0.35, 30], [0.55, 3], [0.7, 3], [0.85, 10], [1, 0]], c);
          radula = ph * 3 * 1.2 * P * 2;
          mScale = 1 + Math.sin(t * 1.1 * P * 2) * 0.012 - (c > 0.35 && c < 0.7 ? 0.010 : 0);
          hPitch += (c > 0.35 && c < 0.7) ? -4 : (c > 0.7 ? 3 : 0);
          lidL = lidR = 0.40;
          for (const arm of armList) {
            const rank = arm.spec.rank;
            if (rank <= 2) {
              armOverride[arm.spec.n] = {
                elev: [22, 4, -10, -45, -45, -30, -10],
                yaw: bowFor(arm).map((v, i) => v - arm.spec.side * (i === 0 ? 10 : 0)),
                tip: [60 + (c < 0.35 ? 6 : 0), 66, 70]
              };
            } else {
              armOverride[arm.spec.n] = { elev: restElevFor(rank), tip: restTipFor(rank) };
            }
          }
          suckExt = 1.1;
        } else if (act === 'drink') {
          mY = mantleY + key([[0, 0], [0.30, -0.18], [0.78, -0.18], [1, 0]], ph);
          mPitch = key([[0, mantlePitch], [0.30, -26], [0.78, -26], [1, mantlePitch]], ph);
          hPitch = key([[0, headPitchX], [0.30, -38], [0.78, -38], [1, headPitchX]], ph);
          hYaw = (ph > 0.9) ? Math.sin((ph - 0.9) * 30) * 4 : 0;
          underPlateOpen = key([[0, 6], [0.3, 12], [0.78, 12], [1, 6]], ph);
          beakOpen = key([[0, 0], [0.3, 8], [0.78, 8], [0.94, 0], [1, 0]], ph);
          radula = t * 0.8 * P * 2;
          lidL = lidR = key([[0, 0.12], [0.3, 0.65], [0.78, 0.65], [1, 0.12]], ph);
          const swallow = (ph > 0.3 && ph < 0.78) ? Math.sin(t * 0.7 * P * 2) * 0.008 : 0;
          mScale = 1 + Math.sin(t * 0.28 * P * 2) * 0.006 + swallow;
          for (const arm of armList) {
            const rank = arm.spec.rank;
            if (rank === 1) {
              armOverride[arm.spec.n] = {
                elev: [key([[0, 26], [0.3, -16], [0.78, -16], [1, 26]], ph), key([[0, 6], [0.3, -6], [0.78, -6], [1, 6]], ph), key([[0, -16], [0.3, -20], [1, -16]], ph), key([[0, -30], [0.3, -26], [1, -30]], ph), -30, -14, -2],
                tip: [key([[0, 38], [0.3, 10], [0.78, 10], [1, 38]], ph), 14, 16]
              };
            } else armOverride[arm.spec.n] = { elev: restElevFor(rank), tip: restTipFor(rank) };
          }
          suckExt = key([[0, 1], [0.3, 1.3], [0.78, 1.3], [1, 1]], ph);
        } else if (act === 'jump') {
          mY = key([[0, mantleY], [0.35, 0.24], [0.72, 0.72], [1, 0.78]], ph);
          mPitch = key([[0, mantlePitch], [0.35, -18], [0.72, 16], [1, 16]], ph);
          hPitch = key([[0, headPitchX], [0.35, -10], [0.72, 8], [1, 10]], ph);
          mScale = 1 + key([[0, 0], [0.35, 0.07], [0.72, -0.09], [1, -0.07]], ph);
          funnelP = key([[0, funnelPitchExtra], [0.35, -20], [0.72, -40], [1, -40]], ph);
          vane = key([[0, vaneUp], [0.35, 0], [0.72, 6], [1, 6]], ph);
          suckExt = key([[0, 1], [0.35, 1.4], [0.6, 1.0], [1, 0.6]], ph);
          for (const arm of armList) {
            const rank = arm.spec.rank;
            const isFront = rank === 1;
            const wave = clamp01((ph - 0.35) / 0.20);
            const el = [];
            for (let i = 0; i < 7; i++) {
              const lag = clamp01(ph - (6 - i) * 0.02);
              const crouch = [-6, 35, -50, 40, -10, -4, 4][i];
              const ext = isFront && ph > 0.72 ? [46, 30, 10, -4, -10, -6, 0][i] : [30, 8, -6, -14, -18, -10, -2][i];
              el.push(key([[0, REST_ELEV[rank][i]], [0.35, crouch], [0.72, ext], [1, ext]], lag));
            }
            armOverride[arm.spec.n] = {
              elev: el,
              tip: isFront ? [key([[0, 38], [0.35, 68], [0.72, 14], [1, 14]], ph), key([[0, 46], [0.35, 70], [0.72, 14], [1, 14]], ph), key([[0, 52], [0.35, 72], [0.72, 14], [1, 14]], ph)]
                : restTipFor(rank).map(v => key([[0, v], [0.35, 70], [1, 30]], ph))
            };
          }
        } else if (act === 'land') {
          mY = key([[0, 0.60], [0.22, 0.44], [0.42, 0.20], [0.62, 0.46], [0.78, 0.42], [1, 0.42]], ph);
          mPitch = key([[0, 6], [0.22, 4], [0.42, -8], [0.72, mantlePitch], [1, mantlePitch]], ph);
          hPitch = key([[0, 10], [0.22, 10], [0.42, -16], [0.72, headPitchX], [1, headPitchX]], ph);
          mZ = key([[0, 0], [0.42, 0.03], [0.6, 0], [1, 0]], ph);
          vane = key([[0, 4], [0.42, -6], [0.72, vaneUp], [1, vaneUp]], ph);
          suckExt = key([[0, 0.6], [0.26, 1.4], [0.6, 1.1], [1, 1]], ph);
          lidL = lidR = key([[0, 0], [0.42, 0.3], [1, 0.12]], ph);
          for (const arm of armList) {
            const rank = arm.spec.rank;
            const el = [];
            for (let i = 0; i < 7; i++) {
              const reach = [-14, 6, -10, -20, -22, -10, 8][i];
              const absorb = [-4, 26, -44, 38, -20, -6, 6][i];
              el.push(key([[0, reach], [0.22, reach], [0.42, absorb], [0.72, REST_ELEV[rank][i]], [1, REST_ELEV[rank][i]]], ph));
            }
            armOverride[arm.spec.n] = {
              elev: el,
              yaw: bowFor(arm).map((v, i) => v + (i === 0 ? arm.spec.side * 16 * (1 - ss(0.22, 0.7, ph)) : 0)),
              tip: restTipFor(rank).map(v => key([[0, 8], [0.42, 30], [1, v]], ph))
            };
          }
          for (let i = 0; i < webPanels.length; i++) webPanels[i].scale.multiplyScalar(1 - 0.09 * (ss(0.22, 0.42, ph) - ss(0.42, 0.7, ph)));
        } else if (act === 'signal') {
          mY = key([[0, mantleY], [0.20, mantleY - 0.06], [0.45, 0.68], [0.72, 0.68], [1, mantleY]], ph);
          mPitch = key([[0, mantlePitch], [0.20, mantlePitch], [0.45, 22], [0.72, 22], [1, mantlePitch]], ph);
          hPitch = key([[0, headPitchX], [0.45, 18], [0.72, 18], [1, headPitchX]], ph);
          const hold = (ph > 0.45 && ph < 0.72) ? Math.sin(t * 1.1 * P * 2) : 0;
          mScale = 1 + key([[0, 0], [0.45, 0.09], [0.72, 0.09], [1, 0]], ph) + hold * 0.008;
          vane = key([[0, vaneUp], [0.45, 22], [0.72, 22], [1, vaneUp]], ph);
          vaneFan = key([[0, 0], [0.45, 8], [0.72, 8], [1, 0]], ph);
          funnelP = key([[0, funnelPitchExtra], [0.45, 30], [0.72, 30], [1, funnelPitchExtra]], ph);
          underPlateOpen = key([[0, 6], [0.45, 30], [0.72, 30], [1, 6]], ph);
          beakOpen = key([[0, 0], [0.45, 24], [0.72, 24], [1, 0]], ph);
          lidL = lidR = key([[0, 0.12], [0.42, 0], [0.75, 0], [1, 0.12]], ph);
          for (const arm of armList) {
            const rank = arm.spec.rank;
            const open = [38, 12, -6, -14, -14, -8, 0];
            armOverride[arm.spec.n] = {
              elev: restElevFor(rank).map((v, i) => key([[0, v], [0.20, v - 3], [0.45, open[i]], [0.72, open[i] + hold * 1.2], [1, v]], ph)),
              yaw: bowFor(arm).map((v, i) => v + (i === 0 ? arm.spec.side * key([[0, 0], [0.45, 26], [0.72, 26], [1, 0]], ph) : 0)),
              tip: restTipFor(rank).map(v => key([[0, v], [0.45, 18], [0.72, 18 + hold * 2], [1, v]], ph))
            };
          }
        } else if (act === 'sleep') {
          mY = key([[0, mantleY], [0.35, 0.18], [0.70, 0.13], [0.90, 0.13], [1, 0.13]], ph);
          mPitch = key([[0, mantlePitch], [0.35, -6], [0.90, -4], [1, -4]], ph);
          hPitch = key([[0, headPitchX], [0.5, -20], [0.90, -40], [1, -40]], ph);
          head.userData.yTuck = key([[0, 0], [0.9, -0.05], [1, -0.05]], ph);
          lidL = lidR = key([[0, 0.12], [0.7, 0.5], [0.90, 0.95], [1, 0.95]], ph);
          vane = key([[0, vaneUp], [0.9, -6], [1, -6]], ph);
          funnelP = key([[0, funnelPitchExtra], [0.9, -52], [1, -52]], ph);
          funnelY = key([[0, 0], [0.9, 40], [1, 40]], ph);
          suckExt = key([[0, 1], [0.9, 0.5], [1, 0.5]], ph);
          mScale = 1 + (ph > 0.9 ? Math.sin(t * 0.28 * P * 2) * 0.005 : Math.sin(t * 0.4 * P * 2) * 0.008);
          const order = ['armR4', 'armL4', 'armR3', 'armL3', 'armR2', 'armL2', 'armR1', 'armL1'];
          for (let k = 0; k < 8; k++) {
            const arm = armNodes[order[k]];
            const rank = arm.spec.rank;
            const t0 = 0.35 + k * 0.045;
            const fold = [22, 40, -55, 45, -35, -10, 0];
            armOverride[arm.spec.n] = {
              elev: restElevFor(rank).map((v, i) => key([[0, v], [t0, v], [Math.min(0.9, t0 + 0.14), fold[i]], [1, fold[i]]], ph)),
              yaw: bowFor(arm).map((v, i) => v + (i === 0 ? arm.spec.side * key([[0, 0], [t0, 0], [Math.min(0.9, t0 + 0.14), 12], [1, 12]], ph) : 0)),
              tip: restTipFor(rank).map(v => key([[0, v], [Math.min(0.9, t0 + 0.14), 70], [1, 70]], ph))
            };
          }
          for (let i = 0; i < webPanels.length; i++) {
            webPanels[i].rotateX(-key([[0, 0], [0.7, 0.30], [1, 0.30]], ph));
          }
        } else if (act === 'wake') {
          mY = key([[0, 0.13], [0.18, 0.13], [0.42, 0.30], [0.72, 0.46], [1, 0.42]], ph);
          mPitch = key([[0, -4], [0.18, -4], [0.42, -16], [0.72, -12], [1, -12]], ph);
          hPitch = key([[0, -40], [0.42, -12], [0.72, headPitchX], [1, headPitchX]], ph);
          head.userData.yTuck = key([[0, -0.05], [0.42, 0], [1, 0]], ph);
          lidL = key([[0, 0.95], [0.10, 0.55], [0.18, 0.30], [0.6, 0], [1, 0.12]], ph);
          lidR = key([[0, 0.95], [0.14, 0.6], [0.22, 0.35], [0.62, 0], [1, 0.12]], ph);
          hYaw = (ph > 0.80 && ph < 0.92) ? Math.sin((ph - 0.80) * 60) * 6 : 0;
          mScale = 1 + Math.sin(t * 0.4 * P * 2) * key([[0, 0.005], [0.18, 0.015], [1, 0.012]], ph);
          funnelP = key([[0, -52], [0.7, funnelPitchExtra], [1, funnelPitchExtra]], ph);
          funnelY = key([[0, 40], [0.7, 0], [1, 0]], ph);
          suckExt = key([[0, 0.5], [0.42, 1.2], [1, 1]], ph);
          for (const arm of armList) {
            const rank = arm.spec.rank;
            const fold = [22, 40, -55, 45, -35, -10, 0];
            const t0 = rank === 4 ? 0.18 : (rank === 3 ? 0.24 : 0.42);
            armOverride[arm.spec.n] = {
              elev: fold.map((v, i) => key([[0, v], [t0, v], [Math.min(0.95, t0 + 0.24), REST_ELEV[rank][i]], [1, REST_ELEV[rank][i]]], ph)),
              yaw: bowFor(arm).map((v, i) => v + (i === 0 ? arm.spec.side * key([[0, 12], [t0 + 0.2, 0], [1, 0]], ph) : 0)),
              tip: restTipFor(rank).map(v => key([[0, 70], [Math.min(0.95, t0 + 0.24), v], [1, v]], ph))
            };
          }
        } else if (act === 'die') {
          mY = key([[0, mantleY], [0.12, mantleY + 0.06], [0.30, 0.16], [0.34, 0.13], [0.45, 0.15], [1, 0.15]], ph);
          mPitch = key([[0, mantlePitch], [0.12, 16], [0.34, -10], [1, -10]], ph);
          mRoll = key([[0, 0], [0.12, 0], [0.34, 26], [1, 26]], ph);
          mYaw = key([[0, 0], [0.34, 9], [1, 9]], ph);
          hPitch = key([[0, headPitchX], [0.12, 6], [0.40, -44], [1, -44]], ph);
          hRoll = key([[0, 0], [0.40, 14], [1, 14]], ph);
          underPlateOpen = key([[0, 6], [0.12, 14], [0.40, 22], [1, 22]], ph);
          beakOpen = key([[0, 0], [0.12, 20], [0.40, 14], [1, 14]], ph);
          vane = key([[0, vaneUp], [0.12, 18], [0.34, 0], [0.55, -8], [1, -8]], ph);
          lidL = lidR = key([[0, 0.12], [0.12, 0], [0.55, 0.5], [0.66, 0.88], [1, 0.88]], ph);
          const spasm = (ph > 0.55 && ph < 0.8) ? (Math.sin((ph - 0.55) * 40) * 0.020 * (1 - ss(0.55, 0.8, ph))) : 0;
          mScale = 1 + spasm;
          funnelP = key([[0, funnelPitchExtra], [0.40, -48], [1, -48]], ph);
          funnelY = key([[0, 0], [0.45, 0], [0.6, 6 * Math.sin(t * 3)], [1, 0]], ph);
          suckExt = key([[0, 1], [0.12, 1.3], [0.45, 0.4], [1, 0.4]], ph);
          const order2 = { 1: 0.12, 2: 0.20, 3: 0.20, 4: 0.28 };
          for (const arm of armList) {
            const rank = arm.spec.rank;
            const t0 = order2[rank];
            const limp = [-4, -30, -15, -25, -10, -4, -2];
            const wob = (ph > t0 + 0.06 && ph < 0.8) ? Math.sin(t * (1.3 + rank * 0.2) * P * 2) * 4 * (1 - ss(t0, 0.8, ph)) : 0;
            const twitch = (arm.spec.n === 'armR3') ? (key([[0.60, 0], [0.62, 9], [0.66, 0], [0.70, 0], [0.71, 4], [0.75, 0], [1, 0]], ph)) : 0;
            armOverride[arm.spec.n] = {
              elev: restElevFor(rank).map((v, i) => key([[0, v], [0.12, v + [20, 10, 14, 10, 6, 4, 2][i]], [t0 + 0.18, limp[i] + wob + twitch], [1, limp[i]]], ph)),
              yaw: bowFor(arm).map((v, i) => v + (i === 0 ? arm.spec.side * key([[0, 0], [0.12, 20], [t0 + 0.18, 14], [1, 14]], ph) : 0)),
              tip: restTipFor(rank).map(v => key([[0, v], [0.12, v + 10], [t0 + 0.20, 6], [1, 6]], ph))
            };
          }
          for (let i = 0; i < webPanels.length; i++) webPanels[i].rotateX(-key([[0, 0], [0.5, 0.21], [1, 0.21]], ph));
        } else if (act === 'evolve') {
          const open = key([[0, 0], [0.22, 0], [0.48, 1], [0.70, 1], [0.90, -0.10], [0.94, 0], [1, 0]], ph);
          const tre = (ph > 0.48 && ph < 0.70) ? Math.sin(t * 2.6 * P * 2) * 0.006 : (ph < 0.22 ? Math.sin(t * 12 * P * 2) * 0.004 : 0);
          mY = mantleY - 0.06 * ss(0, 0.22, ph) * (1 - ss(0.7, 1, ph));
          mPitch = mantlePitch - 4 * ss(0, 0.22, ph) * (1 - ss(0.7, 1, ph));
          hPitch = headPitchX - 10 * ss(0, 0.22, ph) * (1 - ss(0.75, 1, ph));
          mScale = 1 + 0.08 * Math.max(0, open) + tre;
          vane = lerp(vaneUp, 26, Math.max(0, open)); vaneFan = 10 * Math.max(0, open);
          underPlateOpen = lerp(6, 30, Math.max(0, open));
          suckExt = lerp(1, 1.4, ss(0, 0.22, ph) * (1 - ss(0.8, 1, ph)));
          // shells open along the seams
          mantlePlateTopFwd.position.y += 0.055 * open; mantlePlateTopFwd.position.z += 0.04 * open;
          mantlePlateTopFwd.rotateX(-11 * D * open);
          mantlePlateTopMid.position.y += 0.045 * open; mantlePlateTopMid.rotateX(-9 * D * open);
          mantlePlateTopAft.position.y += 0.035 * open; mantlePlateTopAft.position.z -= 0.03 * open;
          mantlePlateTopAft.rotateX(-7 * D * open);
          mantlePlateFlankL.rotateZ(14 * D * open); mantlePlateFlankR.rotateZ(-14 * D * open);
          const apex = mantle.getObjectByName('mantleApexCap');
          if (apex) apex.position.z -= 0.05 * open;
          const bp = head.getObjectByName('headBrowPlate');
          if (bp) { bp.position.y += 0.03 * open; bp.rotateX(-9 * D * open); }
          const cl = head.getObjectByName('headCheekPlateL'), cr = head.getObjectByName('headCheekPlateR');
          if (cl) cl.rotateZ(-12 * D * open);
          if (cr) cr.rotateZ(12 * D * open);
          for (let i = 0; i < armList.length; i++) {
            const arm = armList[i];
            const w = clamp01((ph - 0.22 - (7 - arm.spec.rank) * 0.012) / 0.20) * (1 - ss(0.70, 0.92, ph));
            for (const l of ['A', 'B']) {
              const sh = arm.segs[l === 'A' ? 0 : 1].getObjectByName(arm.spec.n + '_shell' + l);
              if (sh) { sh.position.y += 0.02 * w; sh.rotateZ(arm.spec.side * 8 * D * w); }
            }
          }
          for (let i = 0; i < webPanels.length; i++) webPanels[i].rotateX(0.28 * Math.max(0, open));
          for (const arm of armList) {
            const rank = arm.spec.rank;
            const trem = (ph > 0.48 && ph < 0.70) ? Math.sin(t * 3 * P * 2 + rank) * 3 : 0;
            armOverride[arm.spec.n] = {
              elev: restElevFor(rank).map((v, i) => v + (i < 4 ? [-4, -8, -6, -4][i] * Math.max(0, open) : 0)),
              yaw: bowFor(arm).map((v, i) => v + (i === 0 ? arm.spec.side * 14 * ss(0, 0.22, ph) * (1 - ss(0.8, 1, ph)) : 0)),
              tip: restTipFor(rank).map(v => v + trem)
            };
          }
          lidL = lidR = lerp(0.12, 0.0, Math.max(0, open));
        }
      }

      // ── write the body
      mantle.position.set(CROWN_ORIGIN.x + mX, mY, CROWN_ORIGIN.z + mZ);
      mantle.rotation.set(mPitch * D, mYaw * D, mRoll * D);
      mantle.scale.set(mScale, 1 + (mScale - 1) * 0.35, mScale);

      head.position.set(0, 0.70 - 0.42 + (head.userData.yTuck || 0), 0.20 - 0.16 + (head.userData.zTuck || 0));
      head.rotation.set(hPitch * D, hYaw * D, hRoll * D);
      head.userData.yTuck = 0; head.userData.zTuck = 0;

      // eye turrets: rest + independent roll / convergence
      for (const side of ['L', 'R']) {
        const sx = side === 'L' ? -1 : 1;
        const e = eyes[side];
        e.turret.rotation.copy(e.turret.userData.restRot);
        const conv = e.turret.userData.conv || 0;
        const scan = Math.sin(t * (side === 'L' ? 0.31 : 0.27) * P * 2 + (side === 'L' ? 0 : 1.6)) * 7 * idle;
        e.turret.rotation.y += sx * (12 * D) * 0 + sx * (scan * D) - sx * conv * 9 * D;
        if (turn !== 0 && !act) {
          const sgn = Math.sign(turn);
          e.turret.rotation.y += (side === 'L' ? (sgn < 0 ? -10 : 4) : (sgn < 0 ? 4 : -10)) * D * Math.abs(turn) * sx;
        }
        e.turret.userData.conv = 0;
      }
      setLid('L', clamp01(lidL));
      setLid('R', clamp01(lidR));

      setVanes(vane, vaneFan);

      funnel.rotation.set(funnel.userData.restRot.x + funnelP * D, funnel.userData.restRot.y + funnelY * D + (idle ? Math.sin(t * 0.4 * P * 2) * 3 * D : 0), 0);

      const up = head.getObjectByName('headUnderPlate');
      if (up) up.rotation.x = underPlateOpen * D;
      beakLower.rotation.x = beakOpen * D * 0.9;
      beakUpper.rotation.x = -beakOpen * D * 0.25;
      const drum = beak.getObjectByName('radulaDrum');
      if (drum) drum.rotation.x = radula;

      // gill slats pulse with the breath
      for (const nm of ['gillPortL', 'gillPortR']) {
        const gp = mantle.getObjectByName(nm);
        if (gp && gp.userData.slats) gp.userData.slats.rotation.z = (mScale - 1) * 2.4 + (jetting ? -0.35 : 0);
      }
      mantleHatch.quaternion.copy(mantleHatch.userData.restQ);

      // ── arms
      for (const arm of armList) {
        const n = arm.spec.n, rank = arm.spec.rank;
        const ov = armOverride[n];
        if (ov) {
          const el = ov.elev || restElevFor(rank);
          const yw = ov.yaw || bowFor(arm);
          const tp = ov.tip || restTipFor(rank);
          writeArm(arm, el, yw, tp);
          setSuckers(arm, ov.suck === undefined ? suckExt : ov.suck);
          continue;
        }
        const mul = armMul[n] || {};
        const arc = strideArc * (mul.arc === undefined ? 1 : mul.arc) * arcMul;
        const pl = pull * (mul.pull === undefined ? 1 : mul.pull) * pullMul;
        const lf = lift * liftMul;
        const extraFlex = mul.flex || 0;

        const el = restElevFor(rank);
        const yw = bowFor(arm);
        const tp = restTipFor(rank);

        if (stepping && speed > 0.02) {
          let p = (stride + PHASE[n]) % 1;
          if (p < 0) p += 1;
          const holdSup = mul.hold || 0;
          const inStance = p < duty;
          if (inStance) {
            const q = p / duty;                       // 0..1 through stance
            const sw = (q - 0.5) * 2;                 // -1..1
            yw[0] += -sw * arc;                       // sweep backward (drag body forward)
            const st = Math.sin(q * P) * pl;
            el[2] += st * 0.7; el[3] += st * 0.9; el[4] += st * 0.6;
            el[0] += -2 * Math.sin(q * P);
            setSuckers(arm, suckExt * 1.25);
          } else {
            const q = (p - duty) / (1 - duty);
            const swing = Math.sin(q * P);
            yw[0] += lerp(arc, -arc, q) * (1 - holdSup);
            el[0] += swing * lf * 0.5 * (1 - holdSup);
            el[1] += swing * lf * 0.8 * (1 - holdSup);
            el[2] += swing * lf * 0.6 * (1 - holdSup);
            for (let i = 0; i < 3; i++) tp[i] = lerp(tp[i], tp[i] * 0.55, swing);
            setSuckers(arm, suckExt * 0.6);
          }
          // front pair: probe below 2 body-lengths, planted above
          if (rank === 1 && frontPlanted < 0.5) {
            el[0] = REST_ELEV[1][0] + Math.sin(t * 0.6 * P * 2 + (arm.spec.side > 0 ? 0 : 1.4)) * 6;
            el[1] = REST_ELEV[1][1] + Math.sin(t * 0.5 * P * 2) * 4;
            yw[0] = bowFor(arm)[0] + Math.sin(t * 0.42 * P * 2 + arm.spec.side) * 3;
            for (let i = 0; i < 3; i++) tp[i] = REST_TIP[1][i] + Math.sin(t * 0.4 * P * 2 + i) * 5;
            setSuckers(arm, suckExt * 0.8);
          }
        } else {
          // idle: slow independent tip curl + front-arm drift
          const i0 = ARMS.findIndex(a => a.n === n);
          const curl = Math.sin(t * 0.4 * P * 2 + i0 * 0.9) * 9;
          for (let i = 0; i < 3; i++) tp[i] += curl;
          el[1] += Math.sin(t * 0.27 * P * 2 + i0) * 2 * idle;
          if (rank === 1) yw[0] += Math.sin(t * 0.33 * P * 2 + arm.spec.side) * 3;
          setSuckers(arm, suckExt);
        }
        // gait-wide splay & flex
        yw[0] += arm.spec.side * (splay + splayAdd);
        for (let i = 1; i < 5; i++) el[i] -= extraFlex;
        for (let i = 0; i < 3; i++) tp[i] *= (1 - tipLoose * 0.45);
        writeArm(arm, el, yw, tp);
      }
    };

    // fallback clock animation
    root.userData.update = (t, dt) => {
      const b = 1 + Math.sin(t * 0.28 * P * 2) * 0.010;
      mantle.scale.set(b, 1 + (b - 1) * 0.35, b);
      for (let k = 0; k < armList.length; k++) {
        const arm = armList[k];
        const curl = Math.sin(t * 0.4 * P * 2 + k * 0.9) * 9;
        for (let i = 0; i < 3; i++) arm.tipLinks[i].rotation.x = -(REST_TIP[arm.spec.rank][i] + curl) * D;
      }
    };
  }

  // prime the rest pose
  root.userData.pose({ speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0, t: 0, dt: 0 });

  return root;
}