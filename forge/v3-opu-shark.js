function build(THREE, TSL) {
  const root = new THREE.Group();
  root.name = 'Shark';

  // ------------------------------------------------------------------
  // Shared helpers
  // ------------------------------------------------------------------
  const V = THREE.Vector3;

  const skinTop = new THREE.Color(0x4a5a66);
  const skinMid = new THREE.Color(0x8a97a1);
  const skinBelly = new THREE.Color(0xe9eef0);

  // Countershaded skin material (dark dorsal -> white ventral), driven in
  // local object space so every part of the body shares the same gradient.
  function makeSkin(opts) {
    opts = opts || {};
    const m = new THREE.MeshStandardNodeMaterial({
      roughness: opts.rough !== undefined ? opts.rough : 0.62,
      metalness: 0.03
    });
    const yOff = TSL.float(opts.yOff !== undefined ? opts.yOff : 0.0);
    const scaleY = TSL.float(opts.scaleY !== undefined ? opts.scaleY : 1.0);
    const cTop = TSL.vec3(skinTop.r, skinTop.g, skinTop.b);
    const cMid = TSL.vec3(skinMid.r, skinMid.g, skinMid.b);
    const cBel = TSL.vec3(skinBelly.r, skinBelly.g, skinBelly.b);

    const col = TSL.Fn(() => {
      const p = TSL.positionLocal;
      const y = p.y.mul(scaleY).add(yOff);
      // normalized vertical band across the body (~ -0.55 .. 0.55)
      const t = TSL.clamp(y.add(0.42).div(0.95), 0.0, 1.0);
      const lower = TSL.mix(cBel, cMid, TSL.smoothstep(0.10, 0.52, t));
      const body = TSL.mix(lower, cTop, TSL.smoothstep(0.50, 0.80, t));

      // Dermal-denticle micro speckle: cheap 3D-ish hash noise
      const q = p.mul(46.0);
      const n = TSL.fract(
        TSL.sin(q.x.mul(12.9898).add(q.y.mul(78.233)).add(q.z.mul(37.719))).mul(43758.5453)
      );
      const grain = n.sub(0.5).mul(0.075);

      // faint longitudinal flank striations
      const stripe = TSL.sin(p.z.mul(26.0)).mul(0.012);

      // wet sheen toward the top surface
      const sheen = TSL.pow(TSL.clamp(TSL.normalLocal.y, 0.0, 1.0), TSL.float(3.0)).mul(0.09);

      return TSL.clamp(body.add(grain).add(stripe).add(sheen), 0.0, 1.0);
    })();

    m.colorNode = col;

    // slicker on the back, softer on the belly
    m.roughnessNode = TSL.Fn(() => {
      const t = TSL.clamp(TSL.positionLocal.y.mul(scaleY).add(yOff).add(0.42).div(0.95), 0.0, 1.0);
      return TSL.mix(TSL.float(0.72), TSL.float(0.34), t);
    })();

    return m;
  }

  const finMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide });
    m.colorNode = TSL.Fn(() => {
      const p = TSL.positionLocal;
      // fins: dark base, paler leading edge, dusky tip
      const base = TSL.vec3(0.28, 0.34, 0.39);
      const pale = TSL.vec3(0.60, 0.66, 0.70);
      const tip = TSL.vec3(0.13, 0.16, 0.19);
      const r = TSL.clamp(TSL.length(p).div(0.55), 0.0, 1.0);
      let c = TSL.mix(pale, base, TSL.smoothstep(0.05, 0.55, r));
      c = TSL.mix(c, tip, TSL.smoothstep(0.72, 1.0, r));
      const q = p.mul(70.0);
      const n = TSL.fract(TSL.sin(q.x.mul(12.9898).add(q.y.mul(78.233)).add(q.z.mul(37.719))).mul(43758.5453));
      return TSL.clamp(c.add(n.sub(0.5).mul(0.05)), 0.0, 1.0);
    })();
    return m;
  })();

  const toothMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.22, metalness: 0.0 });
    m.colorNode = TSL.Fn(() => {
      const p = TSL.positionLocal;
      // enamel: bright at the tip, slightly yellowed at the root
      const root_ = TSL.vec3(0.82, 0.79, 0.70);
      const tipC = TSL.vec3(1.0, 0.99, 0.97);
      const t = TSL.clamp(p.y.div(0.09).add(0.15), 0.0, 1.0);
      return TSL.mix(root_, tipC, TSL.smoothstep(0.0, 1.0, t));
    })();
    m.emissiveNode = TSL.vec3(0.05, 0.05, 0.055);
    return m;
  })();

  const gumMat = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0x7d4a4e), roughness: 0.5 });

  const mouthMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, side: THREE.DoubleSide });
    m.colorNode = TSL.Fn(() => {
      const d = TSL.clamp(TSL.positionLocal.z.add(0.5), 0.0, 1.0);
      return TSL.mix(TSL.vec3(0.05, 0.02, 0.03), TSL.vec3(0.42, 0.18, 0.19), d);
    })();
    return m;
  })();

  const eyeMat = (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.1 });
    m.colorNode = TSL.Fn(() => {
      const p = TSL.normalize(TSL.positionLocal);
      const pupil = TSL.smoothstep(0.62, 0.86, p.z);
      const sclera = TSL.vec3(0.06, 0.07, 0.08);
      const iris = TSL.vec3(0.015, 0.015, 0.02);
      return TSL.mix(sclera, iris, pupil);
    })();
    m.emissiveNode = TSL.Fn(() => {
      const p = TSL.normalize(TSL.positionLocal);
      const spec = TSL.pow(TSL.clamp(TSL.dot(p, TSL.normalize(TSL.vec3(0.4, 0.7, 0.6))), 0.0, 1.0), TSL.float(28.0));
      return TSL.vec3(0.9, 0.95, 1.0).mul(spec).mul(0.9);
    })();
    return m;
  })();

  const gillMat = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0x2a3238), roughness: 0.8 });

  // ------------------------------------------------------------------
  // Body profile — a lathe-free approach: stacked cross sections skinned
  // by hand into a single BufferGeometry, so the shark is one smooth hull
  // per segment and the segments hinge at real joints.
  // ------------------------------------------------------------------

  // Full-body silhouette in Z (nose at +Z). half-width, half-height, y-center
  // z runs +1.30 (snout) .. -1.05 (tail root)
  function profileAt(z) {
    // t: 0 at tail root, 1 at snout
    const t = THREE.MathUtils.clamp((z + 1.05) / 2.35, 0, 1);
    // girth: peaked just behind the head (t ~ 0.62)
    const g = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.85);
    const nose = THREE.MathUtils.smoothstep(t, 0.86, 1.0);
    const w = 0.30 * g * (1.0 - 0.55 * nose) + 0.012;
    const h = 0.345 * g * (1.0 - 0.42 * nose) + 0.012;
    // belly hangs lower mid-body, snout tips slightly down
    const yc = -0.035 * Math.sin(Math.PI * t) - 0.055 * nose * nose;
    return { w, h, yc };
  }

  // builds a tube-of-sections mesh between z0..z1 with an origin offset
  function buildHull(z0, z1, rings, radialSegs, originZ, opts) {
    opts = opts || {};
    const pos = [];
    const nrm = [];
    const uvs = [];
    const idx = [];
    const flatten = opts.flatten || 0; // squash bottom (belly flattening)

    const ringPts = [];
    for (let i = 0; i <= rings; i++) {
      const f = i / rings;
      const z = THREE.MathUtils.lerp(z0, z1, f);
      const p = profileAt(z);
      const ring = [];
      for (let j = 0; j < radialSegs; j++) {
        const a = (j / radialSegs) * Math.PI * 2;
        let cx = Math.cos(a);
        let cy = Math.sin(a);
        // superellipse-ish: fuller shoulders, keeled belly
        const k = 1.25;
        const sx = Math.sign(cx) * Math.pow(Math.abs(cx), 2 / k);
        const sy = Math.sign(cy) * Math.pow(Math.abs(cy), 2 / k);
        let x = sx * p.w;
        let y = sy * p.h + p.yc;
        if (sy < 0) y = p.yc + sy * p.h * (1 - flatten * 0.35);
        ring.push(new THREE.Vector3(x, y, z - originZ));
      }
      ringPts.push(ring);
    }

    for (let i = 0; i <= rings; i++) {
      for (let j = 0; j <= radialSegs; j++) {
        const jj = j % radialSegs;
        const v = ringPts[i][jj];
        pos.push(v.x, v.y, v.z);
        uvs.push(j / radialSegs, i / rings);
        // normal by neighbour cross
        const iA = ringPts[Math.min(i + 1, rings)][jj];
        const iB = ringPts[Math.max(i - 1, 0)][jj];
        const jA = ringPts[i][(jj + 1) % radialSegs];
        const jB = ringPts[i][(jj - 1 + radialSegs) % radialSegs];
        const du = new THREE.Vector3().subVectors(iA, iB);
        const dv = new THREE.Vector3().subVectors(jA, jB);
        const n = new THREE.Vector3().crossVectors(dv, du).normalize();
        if (n.lengthSq() < 1e-9) n.set(0, 1, 0);
        nrm.push(n.x, n.y, n.z);
      }
    }
    const stride = radialSegs + 1;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < radialSegs; j++) {
        const a = i * stride + j;
        const b = a + stride;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }

    // cap the ends if requested (closed nose / closed tail stub)
    function cap(ringIndex, dir) {
      const ring = ringPts[ringIndex];
      const c = new THREE.Vector3();
      ring.forEach((p) => c.add(p));
      c.multiplyScalar(1 / ring.length);
      const centerIdx = pos.length / 3;
      pos.push(c.x, c.y, c.z);
      nrm.push(0, 0, dir);
      uvs.push(0.5, 0.5);
      for (let j = 0; j < radialSegs; j++) {
        const a = ringIndex * stride + j;
        const b = ringIndex * stride + ((j + 1) % radialSegs);
        if (dir > 0) idx.push(centerIdx, a, b);
        else idx.push(centerIdx, b, a);
      }
    }
    if (opts.capStart) cap(0, -1);
    if (opts.capEnd) cap(rings, 1);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ------------------------------------------------------------------
  // SPINE HIERARCHY
  // Body -> Torso -> Peduncle -> TailStem -> TailFin
  // Body -> Head -> Snout / Jaw
  // Origins sit at the hinge between adjacent segments.
  // ------------------------------------------------------------------

  const body = new THREE.Group();
  body.name = 'Body';
  root.add(body);

  // --- Torso (the big mass, from behind the head back to the peduncle) ---
  const TORSO_Z0 = -0.28; // rear hinge
  const TORSO_Z1 = 0.72;  // head hinge
  const torso = new THREE.Group();
  torso.name = 'Torso';
  torso.position.set(0, 0, 0);
  body.add(torso);

  const torsoMesh = new THREE.Mesh(
    buildHull(TORSO_Z0 - 0.02, TORSO_Z1 + 0.02, 26, 28, 0, { flatten: 0.35 }),
    makeSkin({})
  );
  torsoMesh.name = 'TorsoShell';
  torso.add(torsoMesh);

  // --- Peduncle: the narrowing waist forward of the tail ---
  const PED_Z = -0.28;
  const peduncle = new THREE.Group();
  peduncle.name = 'Peduncle';
  peduncle.position.set(0, 0, PED_Z);
  torso.add(peduncle);

  const pedMesh = new THREE.Mesh(
    buildHull(-0.70, PED_Z + 0.02, 16, 24, PED_Z, { flatten: 0.2 }),
    makeSkin({})
  );
  pedMesh.name = 'PeduncleShell';
  peduncle.add(pedMesh);

  // lateral keels on the caudal peduncle
  for (const sgn of [-1, 1]) {
    const keel = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.05, 0.30),
      makeSkin({ yOff: 0.2 })
    );
    keel.name = sgn < 0 ? 'KeelLeft' : 'KeelRight';
    keel.position.set(sgn * 0.085, -0.03, -0.18);
    keel.scale.set(1, 0.7, 1);
    keel.rotation.z = sgn * 0.12;
    peduncle.add(keel);
  }

  // --- Tail stem ---
  const STEM_Z = -0.70;
  const tailStem = new THREE.Group();
  tailStem.name = 'TailStem';
  tailStem.position.set(0, 0, STEM_Z - PED_Z);
  peduncle.add(tailStem);

  const stemMesh = new THREE.Mesh(
    buildHull(-1.05, STEM_Z + 0.02, 14, 20, STEM_Z, { flatten: 0.1 }),
    makeSkin({})
  );
  stemMesh.name = 'TailStemShell';
  tailStem.add(stemMesh);

  // --- Caudal fin (heterocercal: big upper lobe, small lower lobe) ---
  const TAIL_Z = -1.02;
  const tailFin = new THREE.Group();
  tailFin.name = 'TailFin';
  tailFin.position.set(0, 0, TAIL_Z - STEM_Z);
  tailStem.add(tailFin);

  function finShape(pts) {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]);
      else s.lineTo(p[0], p[1]);
    }
    s.closePath();
    return s;
  }

  function extrudeFin(shape, thick, taper) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: thick,
      bevelEnabled: true,
      bevelThickness: thick * 0.42,
      bevelSize: thick * 0.5,
      bevelSegments: 3,
      curveSegments: 22
    });
    g.translate(0, 0, -thick / 2);
    // taper thickness toward the fin tip (radius from origin)
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const r = Math.min(1, Math.hypot(x, y) / (taper || 0.5));
      p.setZ(i, z * (1 - 0.75 * r * r));
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }

  // Upper caudal lobe — swept back and up. Built in XY then rotated into YZ.
  const upperLobeShape = finShape([
    [0.0, 0.0],
    [-0.06, 0.30, -0.20, 0.62],   // leading edge sweeping up-back
    [-0.34, 0.86],
    [-0.24, 0.60, -0.16, 0.34],   // notch / trailing concave
    [-0.30, 0.16],
    [-0.10, 0.04, 0.0, 0.0]
  ]);
  const upperLobe = new THREE.Mesh(extrudeFin(upperLobeShape, 0.05, 0.7), finMat);
  upperLobe.name = 'CaudalUpperLobe';
  upperLobe.rotation.y = Math.PI / 2; // shape's -X becomes -Z (backwards)
  tailFin.add(upperLobe);

  const lowerLobeShape = finShape([
    [0.0, 0.0],
    [0.02, -0.16, -0.06, -0.34],
    [-0.20, -0.42],
    [-0.16, -0.24, -0.24, -0.10],
    [-0.10, -0.02],
    [0.0, 0.0]
  ]);
  const lowerLobe = new THREE.Mesh(extrudeFin(lowerLobeShape, 0.045, 0.42), finMat);
  lowerLobe.name = 'CaudalLowerLobe';
  lowerLobe.rotation.y = Math.PI / 2;
  tailFin.add(lowerLobe);

  // ------------------------------------------------------------------
  // FINS on the torso
  // ------------------------------------------------------------------

  // Dorsal fin — the big triangular sail
  const dorsalShape = finShape([
    [0.0, 0.0],
    [0.10, 0.20, 0.14, 0.46],   // leading edge
    [0.16, 0.56],
    [0.02, 0.40, -0.14, 0.16],  // trailing edge falls back
    [-0.26, 0.02],
    [-0.12, -0.01, 0.0, 0.0]
  ]);
  const dorsalFin = new THREE.Group();
  dorsalFin.name = 'DorsalFin';
  dorsalFin.position.set(0, 0.30, 0.18);
  torso.add(dorsalFin);
  {
    const m = new THREE.Mesh(extrudeFin(dorsalShape, 0.055, 0.5), finMat);
    m.name = 'DorsalFinBlade';
    m.rotation.y = Math.PI / 2;
    m.rotation.z = 0; // shape +X -> -Z? fix: rotate so shape's +X points -Z
    m.rotation.y = -Math.PI / 2;
    dorsalFin.add(m);
  }

  // Second (small) dorsal fin, just ahead of the tail
  const dorsal2 = new THREE.Group();
  dorsal2.name = 'SecondDorsalFin';
  dorsal2.position.set(0, 0.115, -0.05);
  peduncle.add(dorsal2);
  {
    const s = finShape([
      [0.0, 0.0],
      [0.03, 0.06, 0.045, 0.13],
      [0.05, 0.16],
      [-0.02, 0.10, -0.09, 0.02],
      [-0.10, 0.0],
      [0.0, 0.0]
    ]);
    const m = new THREE.Mesh(extrudeFin(s, 0.025, 0.16), finMat);
    m.name = 'SecondDorsalBlade';
    m.rotation.y = -Math.PI / 2;
    dorsal2.add(m);
  }

  // Anal fin (ventral, mirrors second dorsal)
  const analFin = new THREE.Group();
  analFin.name = 'AnalFin';
  analFin.position.set(0, -0.10, -0.10);
  peduncle.add(analFin);
  {
    const s = finShape([
      [0.0, 0.0],
      [0.02, -0.05, 0.035, -0.11],
      [0.04, -0.13],
      [-0.02, -0.08, -0.08, -0.01],
      [-0.09, 0.0],
      [0.0, 0.0]
    ]);
    const m = new THREE.Mesh(extrudeFin(s, 0.022, 0.14), finMat);
    m.name = 'AnalFinBlade';
    m.rotation.y = -Math.PI / 2;
    analFin.add(m);
  }

  // Pectoral fins — big scythes, pivoting at the shoulder socket
  function makePectoral(sgn) {
    const g = new THREE.Group();
    g.name = sgn < 0 ? 'PectoralLeft' : 'PectoralRight';
    g.position.set(sgn * 0.19, -0.13, 0.40);
    torso.add(g);

    const s = finShape([
      [0.0, 0.0],
      [0.18, -0.04, 0.42, -0.14],   // leading edge sweeping outward/back
      [0.62, -0.30],
      [0.34, -0.20, 0.16, -0.14],   // trailing concave
      [-0.05, -0.10],
      [-0.03, -0.03, 0.0, 0.0]
    ]);
    const blade = new THREE.Mesh(extrudeFin(s, 0.05, 0.62), finMat);
    blade.name = (sgn < 0 ? 'PectoralLeft' : 'PectoralRight') + 'Blade';
    // shape lives in XY; lay it flat so +X(shape) -> outward, -Y(shape) -> -Z(back)
    blade.rotation.set(-Math.PI / 2, 0, 0);
    blade.scale.set(sgn, 1, 1);
    // thin the trailing tip vertically
    g.add(blade);

    g.userData.rest = { x: 0.10, y: 0, z: sgn * -0.12 };
    g.rotation.set(0.10, 0, sgn * -0.12);
    return g;
  }
  const pecL = makePectoral(-1);
  const pecR = makePectoral(1);

  // Pelvic fins — small, low, behind the belly
  function makePelvic(sgn) {
    const g = new THREE.Group();
    g.name = sgn < 0 ? 'PelvicLeft' : 'PelvicRight';
    g.position.set(sgn * 0.10, -0.145, -0.13);
    torso.add(g);
    const s = finShape([
      [0.0, 0.0],
      [0.10, -0.02, 0.20, -0.08],
      [0.24, -0.15],
      [0.13, -0.10, 0.05, -0.08],
      [-0.04, -0.06],
      [0.0, 0.0]
    ]);
    const blade = new THREE.Mesh(extrudeFin(s, 0.03, 0.25), finMat);
    blade.name = g.name + 'Blade';
    blade.rotation.set(-Math.PI / 2, 0, 0);
    blade.scale.set(sgn, 1, 1);
    g.add(blade);
    g.rotation.set(0.05, 0, sgn * -0.25);
    g.userData.rest = { x: 0.05, y: 0, z: sgn * -0.25 };
    return g;
  }
  const pelL = makePelvic(-1);
  const pelR = makePelvic(1);

  // Gill slits — five raked slashes each side, on the torso
  const gillsL = new THREE.Group(); gillsL.name = 'GillsLeft';
  const gillsR = new THREE.Group(); gillsR.name = 'GillsRight';
  torso.add(gillsL, gillsR);
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? -1 : 1;
    const parent = side === 0 ? gillsL : gillsR;
    for (let i = 0; i < 5; i++) {
      const gz = 0.60 - i * 0.062;
      const p = profileAt(gz);
      const slit = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.155 - i * 0.012, 0.016),
        gillMat
      );
      slit.name = (sgn < 0 ? 'GillL' : 'GillR') + i;
      slit.position.set(sgn * (p.w * 0.94), p.yc + 0.035, gz);
      slit.rotation.z = sgn * 0.16;
      slit.rotation.x = -0.12;
      parent.add(slit);
    }
  }

  // ------------------------------------------------------------------
  // HEAD — hinges at the back of the skull so it can swing/scan
  // ------------------------------------------------------------------
  const HEAD_Z = 0.72;
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 0, HEAD_Z);
  torso.add(head);

  // Cranium: the upper head shell from the hinge forward to the snout tip
  const cranium = new THREE.Group();
  cranium.name = 'Cranium';
  head.add(cranium);

  const craniumMesh = new THREE.Mesh(
    buildHull(HEAD_Z - 0.03, 1.30, 20, 26, HEAD_Z, { flatten: 0.5 }),
    makeSkin({})
  );
  craniumMesh.name = 'CraniumShell';
  cranium.add(craniumMesh);

  // Conical snout cap to finish the nose into a point
  const snout = new THREE.Group();
  snout.name = 'Snout';
  snout.position.set(0, -0.055, 1.28 - HEAD_Z);
  cranium.add(snout);
  {
    const cone = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), makeSkin({ yOff: 0.30 }));
    cone.name = 'SnoutTip';
    cone.scale.set(0.85, 0.72, 1.35);
    snout.add(cone);
  }

  // Nostrils
  for (const sgn of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.030, 4, 8), gillMat);
    n.name = sgn < 0 ? 'NostrilLeft' : 'NostrilRight';
    n.position.set(sgn * 0.055, -0.085, 1.185 - HEAD_Z);
    n.rotation.set(Math.PI / 2, 0, sgn * 0.5);
    n.scale.set(1, 1, 0.55);
    cranium.add(n);
  }

  // Ampullae of Lorenzini — speckled pores over the snout
  const ampullae = new THREE.Group();
  ampullae.name = 'Ampullae';
  cranium.add(ampullae);
  {
    const poreGeo = new THREE.SphereGeometry(0.007, 6, 5);
    const poreMat = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(0x2b333a), roughness: 0.9 });
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 90; i++) {
      const z = 0.94 + rnd() * 0.33;
      const p = profileAt(z);
      const a = (rnd() * 2 - 1) * 2.1;
      const px = Math.sin(a) * p.w * 0.98;
      const py = p.yc - Math.abs(Math.cos(a)) * p.h * 0.85 * (rnd() * 0.4 + 0.6);
      const dot = new THREE.Mesh(poreGeo, poreMat);
      dot.position.set(px, py + 0.02, z - HEAD_Z);
      ampullae.add(dot);
    }
  }

  // Eyes — set high and wide on the head, each on its own pivot
  function makeEye(sgn) {
    const g = new THREE.Group();
    g.name = sgn < 0 ? 'EyeLeft' : 'EyeRight';
    const z = 1.02;
    const p = profileAt(z);
    g.position.set(sgn * (p.w * 0.92), p.yc + p.h * 0.30, z - HEAD_Z);
    g.rotation.y = sgn * 1.15;
    cranium.add(g);

    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 12), gumMat);
    socket.name = g.name + 'Socket';
    socket.scale.set(1, 0.95, 0.7);
    socket.position.z = -0.006;
    g.add(socket);

    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.040, 20, 16), eyeMat);
    ball.name = g.name + 'Ball';
    ball.position.z = 0.012;
    g.add(ball);

    // nictitating membrane — a lid that can sweep across during a strike
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(0.0435, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      makeSkin({ yOff: 0.4 })
    );
    lid.name = g.name + 'Lid';
    lid.position.z = 0.010;
    lid.rotation.x = Math.PI / 2;
    lid.rotation.z = 0;
    lid.scale.set(1, 1, 1);
    lid.userData.open = -Math.PI * 0.62;
    lid.rotation.y = lid.userData.open;
    g.add(lid);
    return g;
  }
  const eyeL = makeEye(-1);
  const eyeR = makeEye(1);

  // ------------------------------------------------------------------
  // JAWS — the point of the whole thing
  // Upper jaw is slightly protrusible; lower jaw hinges at the corner.
  // ------------------------------------------------------------------

  const JAW_HINGE = new THREE.Vector3(0, -0.10, 0.86 - HEAD_Z);

  // ---- Tooth builder: a serrated triangular blade ----
  function makeToothGeometry(h, w, thick, curve) {
    const seg = 9;
    const pos = [];
    const idx = [];
    // Build front & back faces as a serrated triangle outline
    function outline() {
      const pts = [];
      // right edge from base up to tip with serration notches
      for (let i = 0; i <= seg; i++) {
        const f = i / seg;
        const y = f * h;
        const halfW = (w / 2) * (1 - f) * (1 - 0.25 * f);
        const serr = i === seg ? 0 : (i % 2 === 0 ? 0.0 : -w * 0.055);
        const bend = curve * f * f;
        pts.push(new THREE.Vector2(halfW + serr + bend, y));
      }
      // down the left edge
      for (let i = seg; i >= 0; i--) {
        const f = i / seg;
        const y = f * h;
        const halfW = (w / 2) * (1 - f) * (1 - 0.25 * f);
        const serr = i === seg ? 0 : (i % 2 === 0 ? 0.0 : -w * 0.055);
        const bend = curve * f * f;
        pts.push(new THREE.Vector2(-(halfW + serr) + bend, y));
      }
      return pts;
    }
    const o = outline();
    const n = o.length;
    // two shells offset in Z, tapering to a knife edge at the tip
    for (let s = 0; s < 2; s++) {
      const sz = s === 0 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const f = o[i].y / h;
        const t = thick * 0.5 * (1 - 0.85 * f * f);
        pos.push(o[i].x, o[i].y, sz * t);
      }
    }
    for (let i = 0; i < n; i++) {
      const a = i, b = (i + 1) % n;
      const a2 = a + n, b2 = b + n;
      idx.push(a, b, b2, a, b2, a2); // rim
    }
    // fans for the faces
    const cA = pos.length / 3;
    pos.push(0, h * 0.35, thick * 0.32);
    const cB = pos.length / 3;
    pos.push(0, h * 0.35, -thick * 0.32);
    for (let i = 0; i < n; i++) {
      const a = i, b = (i + 1) % n;
      idx.push(cA, b, a);
      idx.push(cB, a + n, b + n);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  const toothGeoCache = {};
  function toothGeo(h, w, thick, curve) {
    const key = [h, w, thick, curve].map((v) => v.toFixed(3)).join('_');
    if (!toothGeoCache[key]) toothGeoCache[key] = makeToothGeometry(h, w, thick, curve);
    return toothGeoCache[key];
  }

  // Place a row of teeth along a parabolic jaw arc.
  // dir = +1 teeth point down (upper jaw), -1 teeth point up (lower jaw)
  function buildToothRow(parent, opts) {
    const {
      name, count, halfWidth, front, back, yLine, dir,
      hMax, hMin, wMax, wMin, thick, curve, rowIndex
    } = opts;
    const rowGroup = new THREE.Group();
    rowGroup.name = name;
    parent.add(rowGroup);

    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0 : (i / (count - 1)) * 2 - 1; // -1..1 across the arc
      const au = Math.abs(u);
      const x = u * halfWidth;
      // parabolic jaw line: front-most at u=0
      const z = THREE.MathUtils.lerp(front, back, au * au * 0.92 + au * 0.08);
      const size = THREE.MathUtils.lerp(1.0, 0.42, Math.pow(au, 1.25));
      const h = THREE.MathUtils.lerp(hMin, hMax, size) * (1 - rowIndex * 0.26);
      const w = THREE.MathUtils.lerp(wMin, wMax, size) * (1 - rowIndex * 0.18);

      const t = new THREE.Mesh(toothGeo(h, w, thick, curve), toothMat);
      t.name = `${name}_${i}`;
      t.position.set(x, yLine - dir * 0.0 + (rowIndex * 0.012 * -dir), z + rowIndex * (dir > 0 ? 0.026 : 0.026));
      // teeth splay outward and rake back toward the throat
      const splay = u * 0.55;
      const rake = 0.20 + au * 0.28 + rowIndex * 0.45;
      if (dir > 0) {
        // upper: point down (-Y)
        t.rotation.set(Math.PI + rake * 0.0, 0, 0);
        t.rotation.z = Math.PI - 0; // reset
        t.rotation.set(0, 0, 0);
        t.rotateZ(Math.PI + splay * 0.0);
        t.rotateX(rake);
        t.rotateZ(splay);
      } else {
        t.rotation.set(0, 0, 0);
        t.rotateX(-rake);
        t.rotateZ(-splay);
      }
      // toe-in the far teeth so the arc reads as a jaw, not a comb
      t.rotateY(-u * 0.85);
      rowGroup.add(t);
    }
    return rowGroup;
  }

  // ---- Upper jaw ----
  const upperJaw = new THREE.Group();
  upperJaw.name = 'UpperJaw';
  upperJaw.position.copy(JAW_HINGE);
  head.add(upperJaw);

  // palate / roof of the mouth
  {
    const palate = new THREE.Mesh(new THREE.SphereGeometry(0.20, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), mouthMat);
    palate.name = 'Palate';
    palate.rotation.x = Math.PI;
    palate.scale.set(1.0, 0.42, 1.35);
    palate.position.set(0, 0.012, 0.14);
    upperJaw.add(palate);
  }
  // upper gum arch
  {
    const gum = new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.028, 10, 28, Math.PI * 1.12), gumMat);
    gum.name = 'UpperGum';
    gum.rotation.x = Math.PI / 2;
    gum.rotation.z = -Math.PI * 0.06;
    gum.position.set(0, -0.004, 0.135);
    gum.scale.set(1.0, 1.30, 1.0);
    upperJaw.add(gum);
  }
  const upperTeeth = new THREE.Group();
  upperTeeth.name = 'UpperTeeth';
  upperJaw.add(upperTeeth);
  for (let r = 0; r < 2; r++) {
    buildToothRow(upperTeeth, {
      name: 'UpperToothRow' + r,
      count: 15,
      halfWidth: 0.175,
      front: 0.295,
      back: 0.055,
      yLine: -0.016,
      dir: 1,
      hMax: 0.105, hMin: 0.055,
      wMax: 0.072, wMin: 0.040,
      thick: 0.016,
      curve: 0.004,
      rowIndex: r
    });
  }

  // ---- Lower jaw (mandible) — hinges at the same corner ----
  const lowerJaw = new THREE.Group();
  lowerJaw.name = 'LowerJaw';
  lowerJaw.position.copy(JAW_HINGE);
  head.add(lowerJaw);

  {
    // mandible shell: a flattened U of flesh
    const mand = new THREE.Mesh(
      new THREE.SphereGeometry(0.205, 24, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
      makeSkin({ yOff: 0.55 })
    );
    mand.name = 'MandibleShell';
    mand.scale.set(1.0, 0.55, 1.40);
    mand.position.set(0, -0.010, 0.145);
    lowerJaw.add(mand);

    // tongue / floor of mouth
    const floor = new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mouthMat);
    floor.name = 'MouthFloor';
    floor.scale.set(0.95, 0.28, 1.30);
    floor.position.set(0, -0.030, 0.135);
    lowerJaw.add(floor);

    const gum = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.026, 10, 28, Math.PI * 1.12), gumMat);
    gum.name = 'LowerGum';
    gum.rotation.x = Math.PI / 2;
    gum.rotation.z = -Math.PI * 0.06;
    gum.position.set(0, 0.004, 0.135);
    gum.scale.set(1.0, 1.30, 1.0);
    lowerJaw.add(gum);
  }

  const lowerTeeth = new THREE.Group();
  lowerTeeth.name = 'LowerTeeth';
  lowerJaw.add(lowerTeeth);
  for (let r = 0; r < 2; r++) {
    buildToothRow(lowerTeeth, {
      name: 'LowerToothRow' + r,
      count: 15,
      halfWidth: 0.165,
      front: 0.280,
      back: 0.050,
      yLine: 0.014,
      dir: -1,
      hMax: 0.088, hMin: 0.046,
      wMax: 0.052, wMin: 0.030,
      thick: 0.014,
      curve: 0.006,
      rowIndex: r
    });
  }

  // Throat: a dark filler that closes the gap when the jaws open
  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mouthMat);
  throat.name = 'Throat';
  throat.position.set(0, -0.09, 0.80 - HEAD_Z);
  throat.scale.set(1.05, 0.85, 0.9);
  head.add(throat);

  // Labial folds at the jaw corners
  for (const sgn of [-1, 1]) {
    const fold = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.10, 5, 9), makeSkin({ yOff: 0.35 }));
    fold.name = sgn < 0 ? 'LabialFoldLeft' : 'LabialFoldRight';
    fold.position.set(sgn * 0.155, -0.075, 0.90 - HEAD_Z);
    fold.rotation.set(0.35, sgn * 0.25, 0);
    head.add(fold);
  }

  // ------------------------------------------------------------------
  // Collect handles for posing
  // ------------------------------------------------------------------
  const P = {
    body, torso, peduncle, tailStem, tailFin,
    upperLobe, lowerLobe,
    head, cranium, snout, upperJaw, lowerJaw, throat,
    dorsalFin, dorsal2, analFin,
    pecL, pecR, pelL, pelR,
    eyeL, eyeR,
    lidL: eyeL.getObjectByName('EyeLeftLid'),
    lidR: eyeR.getObjectByName('EyeRightLid'),
    upperTeeth, lowerTeeth, gillsL, gillsR
  };

  root.userData.parts = P;

  // ------------------------------------------------------------------
  // POSE
  // ------------------------------------------------------------------
  const TAU = Math.PI * 2;
  const clamp = THREE.MathUtils.clamp;
  const lerp = THREE.MathUtils.lerp;
  const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
  const ease = (x) => x * x * (3 - 2 * x);

  const REST = {
    pecL: new THREE.Euler(0.10, 0, 0.12),
    pecR: new THREE.Euler(0.10, 0, -0.12),
    pelL: new THREE.Euler(0.05, 0, 0.25),
    pelR: new THREE.Euler(0.05, 0, -0.25)
  };

  function resetAll() {
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    body.scale.set(1, 1, 1);

    torso.position.set(0, 0, 0);
    torso.rotation.set(0, 0, 0);
    torso.scale.set(1, 1, 1);

    peduncle.position.set(0, 0, PED_Z);
    peduncle.rotation.set(0, 0, 0);

    tailStem.position.set(0, 0, STEM_Z - PED_Z);
    tailStem.rotation.set(0, 0, 0);

    tailFin.position.set(0, 0, TAIL_Z - STEM_Z);
    tailFin.rotation.set(0, 0, 0);
    tailFin.scale.set(1, 1, 1);

    upperLobe.rotation.set(0, Math.PI / 2, 0);
    lowerLobe.rotation.set(0, Math.PI / 2, 0);

    head.position.set(0, 0, HEAD_Z);
    head.rotation.set(0, 0, 0);
    cranium.rotation.set(0, 0, 0);
    snout.rotation.set(0, 0, 0);

    upperJaw.position.copy(JAW_HINGE);
    upperJaw.rotation.set(0, 0, 0);
    lowerJaw.position.copy(JAW_HINGE);
    lowerJaw.rotation.set(0, 0, 0);
    throat.scale.set(1.05, 0.85, 0.9);
    throat.position.set(0, -0.09, 0.80 - HEAD_Z);

    dorsalFin.rotation.set(0, 0, 0);
    dorsalFin.scale.set(1, 1, 1);
    dorsal2.rotation.set(0, 0, 0);
    analFin.rotation.set(0, 0, 0);

    pecL.rotation.copy(REST.pecL);
    pecR.rotation.copy(REST.pecR);
    pelL.rotation.copy(REST.pelL);
    pelR.rotation.copy(REST.pelR);
    pecL.scale.set(1, 1, 1);
    pecR.scale.set(1, 1, 1);

    eyeL.rotation.set(0, -1.15, 0);
    eyeR.rotation.set(0, 1.15, 0);
    if (P.lidL) P.lidL.rotation.set(Math.PI / 2, P.lidL.userData.open, 0);
    if (P.lidR) P.lidR.rotation.set(Math.PI / 2, P.lidR.userData.open, 0);

    gillsL.scale.set(1, 1, 1);
    gillsR.scale.set(1, 1, 1);
  }

  // undulating swim wave: amplitude grows toward the tail
  function swim(phase, amp, headAmp) {
    const w = (lag) => Math.sin((phase - lag) * TAU);
    torso.rotation.y = w(0.00) * amp * 0.28;
    peduncle.rotation.y = w(0.14) * amp * 0.85;
    tailStem.rotation.y = w(0.26) * amp * 1.25;
    tailFin.rotation.y = w(0.40) * amp * 1.15;
    // caudal lobes trail (membrane flex)
    upperLobe.rotation.z = w(0.50) * amp * 0.55;
    lowerLobe.rotation.z = w(0.52) * amp * 0.45;
    // head counter-swings a little, less than the body
    head.rotation.y = -w(0.02) * amp * headAmp;
    // slight roll coupling
    torso.rotation.z = w(0.10) * amp * 0.10;
  }

  function breathe(t) {
    const b = Math.sin(t * 1.35) * 0.5 + 0.5;
    const s = 1 + b * 0.018;
    torsoMesh.scale.set(s, 1 + b * 0.012, 1);
    const gs = 1 + b * 0.16;
    gillsL.scale.set(gs, 1, 1);
    gillsR.scale.set(gs, 1, 1);
    // jaw idles very slightly open with the gill pump
    lowerJaw.rotation.x += b * 0.035;
  }

  function setJaw(openU, openL, protrude) {
    lowerJaw.rotation.x = openL;
    upperJaw.rotation.x = -openU;
    upperJaw.position.z = JAW_HINGE.z + (protrude || 0);
    upperJaw.position.y = JAW_HINGE.y + (protrude || 0) * 0.25;
    const gape = openL + openU;
    throat.scale.set(1.05, 0.85 + gape * 0.35, 0.9 + gape * 0.25);
    throat.position.y = -0.09 - gape * 0.09;
  }

  function blink(amount) {
    const a = clamp(amount, 0, 1);
    if (P.lidL) P.lidL.rotation.y = lerp(P.lidL.userData.open, 0.05, a);
    if (P.lidR) P.lidR.rotation.y = lerp(P.lidR.userData.open, 0.05, a);
  }

  root.userData.pose = (s) => {
    s = s || {};
    const t = s.t || 0;
    const speed = s.speed || 0;
    const stride = ((s.stride || 0) % 1 + 1) % 1;
    const turn = clamp(s.turn || 0, -1, 1);
    const grounded = s.grounded === undefined ? true : s.grounded;
    const health = s.health === undefined ? 1 : clamp(s.health, 0, 1);
    const action = s.action || null;
    const ph = clamp(s.phase || 0, 0, 1);

    resetAll();

    // ================= ACTIONS =================
    if (action) {
      switch (action) {
        case 'attack': {
          // wind-up: coil back and gape; commit: lunge + jaw slam; recover
          const wind = smooth(0.0, 0.30, ph) * (1 - smooth(0.28, 0.42, ph));
          const lunge = smooth(0.30, 0.52, ph) * (1 - smooth(0.62, 1.0, ph));
          const snap = smooth(0.44, 0.56, ph);
          const rec = smooth(0.62, 1.0, ph);

          // body S-coil then straighten out through the strike
          const coil = wind * 0.55 - lunge * 0.15;
          torso.rotation.y = coil * 0.30;
          peduncle.rotation.y = -coil * 0.75 + lunge * 0.35;
          tailStem.rotation.y = -coil * 0.95 + lunge * 0.55;
          tailFin.rotation.y = -coil * 0.8 + lunge * 0.5;
          upperLobe.rotation.z = -coil * 0.4 + lunge * 0.3;

          // head rears back then drives forward and down
          head.rotation.x = wind * -0.42 + lunge * 0.34 - rec * 0.10;
          head.rotation.y = coil * -0.20;
          body.position.z = lunge * 0.30 - rec * 0.28 * ease(rec);
          body.position.y = wind * 0.06 - lunge * 0.05;
          body.rotation.x = wind * -0.14 + lunge * 0.12 - rec * 0.05;

          // jaws: huge gape into the commit, then snap shut
          const gapeU = (wind * 0.42 + lunge * 0.50) * (1 - snap) + 0.02;
          const gapeL = (wind * 0.60 + lunge * 0.78) * (1 - snap) + 0.03;
          setJaw(gapeU, gapeL, (wind * 0.5 + lunge) * 0.055 * (1 - snap));
          // a little chew-through after the snap
          if (ph > 0.56) {
            const worry = Math.sin((ph - 0.56) * 26) * (1 - rec) * 0.10;
            lowerJaw.rotation.x += Math.abs(worry);
            head.rotation.z = worry * 0.7;
          }

          // nictitating membranes roll over the eyes at the moment of contact
          blink(smooth(0.34, 0.46, ph) * (1 - smooth(0.66, 0.85, ph)));

          // pectorals flare down as brakes on the recovery
          pecL.rotation.x = REST.pecL.x - lunge * 0.35 + rec * 0.55;
          pecR.rotation.x = REST.pecR.x - lunge * 0.35 + rec * 0.55;
          pecL.rotation.z = REST.pecL.z + rec * 0.35;
          pecR.rotation.z = REST.pecR.z - rec * 0.35;
          dorsalFin.rotation.x = -wind * 0.12 + lunge * 0.10;
          break;
        }

        case 'fire': {
          // aim, hold steady, hard cough of water/spine, absorb recoil
          const aim = smooth(0.0, 0.34, ph);
          const hold = smooth(0.30, 0.44, ph) * (1 - smooth(0.50, 0.58, ph));
          const shot = smooth(0.52, 0.58, ph) * (1 - smooth(0.60, 0.80, ph));
          const settle = smooth(0.66, 1.0, ph);

          // body braces still — tail sculls only slightly to hold station
          const scull = Math.sin(t * 5.0) * 0.05 * (1 - shot);
          peduncle.rotation.y = scull;
          tailStem.rotation.y = scull * 1.4;
          tailFin.rotation.y = scull * 1.2;

          // snout lines up on the target and freezes
          head.rotation.x = -aim * 0.22 + shot * 0.16 + settle * 0.02;
          cranium.rotation.x = -aim * 0.10;
          body.rotation.x = -aim * 0.06;

          // throat swells during the hold, then punches out
          const charge = aim * 0.6 + hold * 0.4;
          throat.scale.set(1.05 + charge * 0.30, 0.85 + charge * 0.42, 0.9 + charge * 0.20);
          throat.position.y = -0.09 - charge * 0.05;

          // jaws part for the launch, snap after
          setJaw(0.06 + aim * 0.12 + shot * 0.10, 0.10 + aim * 0.26 + shot * 0.34 - settle * 0.30, 0.0);

          // recoil pushes the whole body back
          body.position.z = -shot * 0.16 + settle * 0.15 * ease(settle);
          const ring = Math.sin(ph * 42) * Math.exp(-(ph - 0.56) * 14) * (ph > 0.56 ? 1 : 0);
          body.position.y = ring * 0.02;
          head.rotation.z = ring * 0.06;

          pecL.rotation.x = REST.pecL.x + aim * 0.30 - shot * 0.2;
          pecR.rotation.x = REST.pecR.x + aim * 0.30 - shot * 0.2;
          blink(shot * 0.8);
          break;
        }

        case 'hit': {
          // sharp flinch, then a decaying settle — reads inside 0.25s
          const k = Math.exp(-ph * 7.5);
          const osc = Math.sin(ph * 30);
          const jolt = smooth(0.0, 0.10, ph) * (1 - smooth(0.10, 0.45, ph));

          body.position.x = -osc * k * 0.10;
          body.position.z = -k * 0.10 * (1 - ph);
          body.rotation.z = osc * k * 0.30;
          body.rotation.y = -osc * k * 0.16;
          torso.rotation.y = osc * k * 0.22;
          peduncle.rotation.y = -osc * k * 0.42;
          tailStem.rotation.y = -osc * k * 0.62;
          tailFin.rotation.y = -osc * k * 0.55;
          head.rotation.y = osc * k * 0.34;
          head.rotation.x = -jolt * 0.22 + k * 0.06;
          head.rotation.z = -osc * k * 0.20;

          setJaw(0.10 * k + 0.02, (0.42 * jolt + 0.20 * k), 0.0);
          blink(clamp(k * 1.6, 0, 1));

          pecL.rotation.x = REST.pecL.x - k * 0.5;
          pecR.rotation.x = REST.pecR.x - k * 0.5;
          pecL.rotation.z = REST.pecL.z + k * 0.3;
          pecR.rotation.z = REST.pecR.z - k * 0.3;
          dorsalFin.rotation.z = osc * k * 0.18;
          break;
        }

        case 'block': {
          // no arms: turn the armoured skull and shoulder mass forward,
          // pitch nose-down, pull back and low, fins clamped as a shield
          const inA = smooth(0.0, 0.22, ph);
          const hold = 1 - smooth(0.72, 1.0, ph);
          const b = inA * hold;

          body.position.z = -b * 0.16;
          body.position.y = -b * 0.07;
          body.rotation.x = b * 0.30;               // nose tips down, brow forward
          torso.rotation.x = b * 0.10;
          head.rotation.x = b * 0.34;
          cranium.rotation.x = b * 0.10;

          // tail sweeps under and forward, bracing
          peduncle.rotation.x = -b * 0.24;
          tailStem.rotation.x = -b * 0.30;
          tailFin.rotation.x = -b * 0.18;

          // pectorals clamp in front and down like shields
          pecL.rotation.set(REST.pecL.x + b * 0.55, b * 0.65, REST.pecL.z - b * 0.85);
          pecR.rotation.set(REST.pecR.x + b * 0.55, -b * 0.65, REST.pecR.z + b * 0.85);
          pelL.rotation.z = REST.pelL.z - b * 0.4;
          pelR.rotation.z = REST.pelR.z + b * 0.4;
          dorsalFin.rotation.x = -b * 0.22;

          // jaws clamped hard, eyes rolled behind the lids
          setJaw(0.0, 0.02, 0.0);
          blink(b);
          // isometric tremor of holding the brace
          const tr = Math.sin(t * 26) * 0.012 * b;
          head.rotation.z = tr;
          torso.rotation.z = -tr * 0.6;
          break;
        }

        case 'gather': {
          // dive to the seabed, mouth over the item, close, come back up
          const down = smooth(0.0, 0.32, ph);
          const close = smooth(0.38, 0.52, ph);
          const up = smooth(0.58, 1.0, ph);
          const d = down - up;

          body.rotation.x = d * 0.62;            // pitch nose-down
          body.position.y = -d * 0.30;
          body.position.z = d * 0.10;
          head.rotation.x = d * 0.26;
          cranium.rotation.x = d * 0.08;

          // tail lifts as the nose goes down
          peduncle.rotation.x = -d * 0.20;
          tailStem.rotation.x = -d * 0.26;
          // slow station-keeping sculls all the way through
          const scull = Math.sin(t * 3.2) * 0.10;
          peduncle.rotation.y = scull * 0.5;
          tailStem.rotation.y = scull;
          tailFin.rotation.y = scull * 0.9;

          const gape = (down * 0.9) * (1 - close);
          setJaw(0.05 + gape * 0.34, 0.05 + gape * 0.70, gape * 0.05);
          // once closed it stays shut, carrying
          if (ph > 0.52) setJaw(0.0, 0.05, 0.0);

          pecL.rotation.x = REST.pecL.x + d * 0.45;
          pecR.rotation.x = REST.pecR.x + d * 0.45;
          pecL.rotation.z = REST.pecL.z - d * 0.25;
          pecR.rotation.z = REST.pecR.z + d * 0.25;
          blink(close * (1 - up) * 0.7);
          break;
        }

        case 'deposit': {
          // the reverse of gather, and slower: settle down, open, release, rise
          const down = smooth(0.0, 0.40, ph);
          const open = smooth(0.44, 0.66, ph);
          const up = smooth(0.72, 1.0, ph);
          const d = down - up;

          body.rotation.x = d * 0.50;
          body.position.y = -d * 0.26;
          head.rotation.x = d * 0.20;

          peduncle.rotation.x = -d * 0.16;
          tailStem.rotation.x = -d * 0.22;
          const scull = Math.sin(t * 2.4) * 0.08;
          peduncle.rotation.y = scull * 0.5;
          tailStem.rotation.y = scull;
          tailFin.rotation.y = scull * 0.9;

          const rel = open * (1 - up);
          setJaw(0.02 + rel * 0.26, 0.03 + rel * 0.55, 0.0);

          pecL.rotation.x = REST.pecL.x + d * 0.40;
          pecR.rotation.x = REST.pecR.x + d * 0.40;
          break;
        }

        case 'eat': {
          // head down onto the source and a repeated saw-through: 3 bites
          const down = smooth(0.0, 0.20, ph);
          const up = smooth(0.84, 1.0, ph);
          const d = down - up;

          body.rotation.x = d * 0.40;
          body.position.y = -d * 0.20;
          head.rotation.x = d * 0.26;

          const cyc = clamp((ph - 0.16) / 0.68, 0, 1);
          const bites = 3;
          const c = ((cyc * bites) % 1);
          const chew = Math.pow(Math.sin(c * Math.PI), 1.4);
          // the head shakes side to side to saw flesh off — that's how they feed
          const shake = Math.sin(cyc * bites * TAU * 2.0) * (cyc > 0 && cyc < 1 ? 1 : 0);

          setJaw(0.05 + chew * 0.34, 0.06 + chew * 0.72, chew * 0.05);
          head.rotation.y = shake * 0.28 * (1 - up);
          head.rotation.z = shake * 0.16 * (1 - up);
          torso.rotation.y = -shake * 0.10 * (1 - up);
          peduncle.rotation.y = shake * 0.22 * (1 - up);
          tailStem.rotation.y = shake * 0.30 * (1 - up);
          tailFin.rotation.y = shake * 0.26 * (1 - up);
          body.position.z = chew * -0.03;

          blink(chew * 0.85);
          pecL.rotation.x = REST.pecL.x + d * 0.35;
          pecR.rotation.x = REST.pecR.x + d * 0.35;
          break;
        }

        case 'drink': {
          // stiller than eating: nose down, hold, slow gulps, up
          const down = smooth(0.0, 0.24, ph);
          const up = smooth(0.80, 1.0, ph);
          const d = down - up;

          body.rotation.x = d * 0.46;
          body.position.y = -d * 0.24;
          head.rotation.x = d * 0.22;
          peduncle.rotation.x = -d * 0.14;
          tailStem.rotation.x = -d * 0.18;

          const hold = smooth(0.22, 0.30, ph) * (1 - smooth(0.76, 0.86, ph));
          const gulp = Math.pow(Math.sin(clamp((ph - 0.26) / 0.50, 0, 1) * Math.PI * 2) * 0.5 + 0.5, 2) * hold;
          setJaw(0.02 + gulp * 0.06, 0.05 + gulp * 0.16, 0.0);
          // throat pumps
          throat.scale.set(1.05 + gulp * 0.20, 0.85 + gulp * 0.26, 0.9 + gulp * 0.12);
          gillsL.scale.set(1 + gulp * 0.30, 1, 1);
          gillsR.scale.set(1 + gulp * 0.30, 1, 1);

          const drift = Math.sin(t * 1.6) * 0.05;
          peduncle.rotation.y = drift * 0.5;
          tailStem.rotation.y = drift;
          tailFin.rotation.y = drift * 0.9;
          pecL.rotation.x = REST.pecL.x + d * 0.30;
          pecR.rotation.x = REST.pecR.x + d * 0.30;
          break;
        }

        case 'jump': {
          // load the tail into a C, then unload straight and launch upward
          const load = smooth(0.0, 0.34, ph);
          const fire = smooth(0.36, 0.72, ph);
          const reach = smooth(0.70, 1.0, ph);

          // coil hard to one side then whip straight — how a shark breaches
          const coil = load * (1 - fire);
          torso.rotation.y = coil * 0.34 - fire * 0.10;
          peduncle.rotation.y = -coil * 0.95 + fire * 0.45;
          tailStem.rotation.y = -coil * 1.25 + fire * 0.65;
          tailFin.rotation.y = -coil * 1.10 + fire * 0.60;
          upperLobe.rotation.z = -coil * 0.5 + fire * 0.35;
          lowerLobe.rotation.z = -coil * 0.4 + fire * 0.30;

          // pitch up and extend
          body.rotation.x = -load * 0.16 - fire * 0.52 - reach * 0.12;
          body.position.y = -load * 0.10 + fire * 0.34 + reach * 0.16;
          body.position.z = fire * 0.12;
          head.rotation.x = load * 0.10 - fire * 0.22 - reach * 0.10;

          // whole body lengthens into the reach
          const ext = 1 + reach * 0.045;
          body.scale.set(1 - reach * 0.02, 1 - reach * 0.02, ext);

          // pectorals sweep back into the launch
          pecL.rotation.set(REST.pecL.x - fire * 0.55 - reach * 0.2, -fire * 0.45, REST.pecL.z + fire * 0.55);
          pecR.rotation.set(REST.pecR.x - fire * 0.55 - reach * 0.2, fire * 0.45, REST.pecR.z - fire * 0.55);
          dorsalFin.rotation.x = -fire * 0.10;

          setJaw(0.04 + fire * 0.22, 0.06 + fire * 0.45 - reach * 0.15, 0.0);
          break;
        }

        case 'land': {
          // reach down for the surface, take the shock, compress, push back out
          const reach = 1 - smooth(0.0, 0.30, ph);
          const impact = smooth(0.26, 0.36, ph) * (1 - smooth(0.40, 0.66, ph));
          const rise = smooth(0.58, 1.0, ph);

          body.rotation.x = reach * 0.34 - impact * 0.20 - rise * 0.02;
          body.position.y = reach * 0.20 - impact * 0.18 + rise * 0.02;
          body.position.z = -impact * 0.10 + rise * 0.06;

          // compression ripples down the body
          const sq = impact;
          body.scale.set(1 + sq * 0.10, 1 - sq * 0.14, 1 - sq * 0.05);
          torso.rotation.x = -impact * 0.14 + reach * 0.10;
          peduncle.rotation.x = impact * 0.32 - reach * 0.18;
          tailStem.rotation.x = impact * 0.40 - reach * 0.22;
          tailFin.rotation.x = impact * 0.26;
          head.rotation.x = reach * 0.22 - impact * 0.30 + rise * 0.06;

          // fins flare wide to catch and brake
          const flare = reach * 0.5 + impact;
          pecL.rotation.set(REST.pecL.x + flare * 0.75, flare * 0.30, REST.pecL.z - flare * 0.55);
          pecR.rotation.set(REST.pecR.x + flare * 0.75, -flare * 0.30, REST.pecR.z + flare * 0.55);
          pelL.rotation.z = REST.pelL.z - flare * 0.4;
          pelR.rotation.z = REST.pelR.z + flare * 0.4;

          setJaw(0.02 + impact * 0.16, 0.04 + impact * 0.40, 0.0);
          blink(impact);
          break;
        }

        case 'signal': {
          // rear up, open the jaws to their full extent, spread every fin,
          // hold the display, then come back down
          const rise = smooth(0.0, 0.30, ph);
          const hold = smooth(0.26, 0.36, ph) * (1 - smooth(0.62, 0.80, ph));
          const down = smooth(0.72, 1.0, ph);
          const a = rise - down;

          body.rotation.x = -a * 0.46;
          body.position.y = a * 0.22;
          body.position.z = a * 0.05;
          head.rotation.x = -a * 0.30;
          cranium.rotation.x = -a * 0.10;

          // tail beats hard underneath to hold the display up
          const beat = Math.sin(t * 7.5) * (rise - down * 0.5);
          peduncle.rotation.y = beat * 0.42;
          tailStem.rotation.y = beat * 0.66;
          tailFin.rotation.y = beat * 0.60;
          upperLobe.rotation.z = beat * 0.30;

          // maximum gape — every tooth on show
          const gape = a * 1.0 + hold * 0.12;
          setJaw(0.06 + gape * 0.52, 0.06 + gape * 0.95, gape * 0.075);
          // jaw shudders with the call
          const roar = Math.sin(t * 34) * hold * 0.045;
          lowerJaw.rotation.x += roar;
          head.rotation.z = Math.sin(t * 5) * hold * 0.05;

          // fins spread to their limit
          pecL.rotation.set(REST.pecL.x - a * 0.30, a * 0.35, REST.pecL.z - a * 0.75);
          pecR.rotation.set(REST.pecR.x - a * 0.30, -a * 0.35, REST.pecR.z + a * 0.75);
          pelL.rotation.z = REST.pelL.z - a * 0.55;
          pelR.rotation.z = REST.pelR.z + a * 0.55;
          dorsalFin.rotation.x = -a * 0.18;
          dorsalFin.scale.set(1, 1 + a * 0.14, 1 + a * 0.06);
          gillsL.scale.set(1 + a * 0.6, 1, 1);
          gillsR.scale.set(1 + a * 0.6, 1, 1);
          break;
        }

        case 'sleep': {
          // sinks, settles onto its side on the bottom, gills barely working.
          // ENDS here and stays.
          const sink = smooth(0.0, 0.42, ph);
          const roll = smooth(0.30, 0.72, ph);
          const still = smooth(0.66, 1.0, ph);

          body.position.y = -sink * 0.30;
          body.rotation.x = sink * 0.10 - still * 0.06;
          body.rotation.z = roll * 0.52;          // lists onto one flank
          body.rotation.y = roll * 0.10;

          // slow decaying tail sway that dies out to nothing
          const sway = Math.sin(t * 1.1) * (1 - still) * 0.5;
          torso.rotation.y = sway * 0.10;
          peduncle.rotation.y = sway * 0.26 + roll * 0.18;
          tailStem.rotation.y = sway * 0.34 + roll * 0.26;
          tailFin.rotation.y = sway * 0.30 + roll * 0.20;
          peduncle.rotation.x = -sink * 0.10;

          head.rotation.y = -roll * 0.16;
          head.rotation.x = sink * 0.10;
          head.rotation.z = -roll * 0.14;

          // fins fold to the body
          pecL.rotation.set(REST.pecL.x + roll * 0.20, 0, REST.pecL.z + roll * 0.75);
          pecR.rotation.set(REST.pecR.x + roll * 0.20, 0, REST.pecR.z - roll * 0.75);
          pelL.rotation.z = REST.pelL.z + roll * 0.4;
          pelR.rotation.z = REST.pelR.z - roll * 0.4;
          dorsalFin.rotation.z = roll * 0.10;

          // mouth hangs a touch open, gills pumping very slowly
          const pump = (Math.sin(t * 0.9) * 0.5 + 0.5);
          setJaw(0.02, 0.06 + pump * 0.05 * (0.4 + still * 0.6), 0.0);
          gillsL.scale.set(1 + pump * 0.10, 1, 1);
          gillsR.scale.set(1 + pump * 0.10, 1, 1);
          blink(clamp(sink * 1.2, 0, 1));
          break;
        }

        case 'wake': {
          // stir, roll upright, a push of the tail, settle exactly on standing
          const stir = smooth(0.0, 0.22, ph);
          const rollBack = smooth(0.18, 0.62, ph);
          const push = smooth(0.44, 0.68, ph) * (1 - smooth(0.70, 0.92, ph));
          const settle = smooth(0.78, 1.0, ph);

          const listed = (1 - rollBack);
          body.rotation.z = listed * 0.52;
          body.rotation.y = listed * 0.10;
          body.position.y = -listed * 0.30 + push * 0.06;
          body.rotation.x = listed * 0.10 - push * 0.08;

          const kick = Math.sin(ph * 12) * push;
          torso.rotation.y = kick * 0.14;
          peduncle.rotation.y = kick * 0.40 + listed * 0.18;
          tailStem.rotation.y = kick * 0.60 + listed * 0.26;
          tailFin.rotation.y = kick * 0.52 + listed * 0.20;

          head.rotation.y = -listed * 0.16 + stir * (1 - rollBack) * 0.12;
          head.rotation.z = -listed * 0.14;
          head.rotation.x = listed * 0.10;

          pecL.rotation.set(REST.pecL.x + listed * 0.20 - push * 0.2, 0, REST.pecL.z + listed * 0.75);
          pecR.rotation.set(REST.pecR.x + listed * 0.20 - push * 0.2, 0, REST.pecR.z - listed * 0.75);
          pelL.rotation.z = REST.pelL.z + listed * 0.4;
          pelR.rotation.z = REST.pelR.z - listed * 0.4;

          const yawn = smooth(0.20, 0.36, ph) * (1 - smooth(0.42, 0.58, ph));
          setJaw(0.02 + yawn * 0.30, 0.04 + yawn * 0.60, 0.0);
          blink(clamp((1 - stir) + (1 - settle) * 0.15 * Math.sin(t * 3), 0, 1) * (1 - rollBack));
          break;
        }

        case 'die': {
          // strength drains, the body goes slack, rolls belly-up and sinks.
          // Last frame is a wreck lying over. Nothing loops.
          const spasm = (1 - smooth(0.0, 0.34, ph));
          const slack = smooth(0.20, 0.62, ph);
          const rollOver = smooth(0.30, 0.78, ph);
          const settle = smooth(0.70, 1.0, ph);

          // final thrashes, decaying
          const th = Math.sin(ph * 26) * spasm;
          torso.rotation.y = th * 0.28;
          peduncle.rotation.y = th * 0.52 - slack * 0.18;
          tailStem.rotation.y = th * 0.72 - slack * 0.30;
          tailFin.rotation.y = th * 0.62 - slack * 0.26;
          upperLobe.rotation.z = th * 0.3;

          // belly-up roll and sink
          body.rotation.z = rollOver * Math.PI * 0.92;
          body.rotation.x = slack * 0.10 - settle * 0.16;
          body.rotation.y = rollOver * 0.20;
          body.position.y = -smooth(0.25, 1.0, ph) * 0.42;
          body.position.z = -slack * 0.06;

          // everything hangs
          const hang = slack;
          head.rotation.x = hang * 0.30 + th * 0.10;
          head.rotation.y = -hang * 0.22 + th * 0.16;
          head.rotation.z = hang * 0.18;
          peduncle.rotation.x = hang * 0.16;
          tailStem.rotation.x = hang * 0.24;

          pecL.rotation.set(REST.pecL.x + hang * 0.55, 0, REST.pecL.z - hang * 0.30);
          pecR.rotation.set(REST.pecR.x + hang * 0.55, 0, REST.pecR.z + hang * 0.30);
          pelL.rotation.z = REST.pelL.z - hang * 0.3;
          pelR.rotation.z = REST.pelR.z + hang * 0.3;
          dorsalFin.rotation.z = rollOver * 0.16;

          // jaw drops open and stays open, eyes roll white behind the lids
          setJaw(0.05 + slack * 0.12, 0.06 + slack * 0.46, 0.0);
          blink(smooth(0.30, 0.70, ph));
          gillsL.scale.set(1 - slack * 0.5, 1, 1);
          gillsR.scale.set(1 - slack * 0.5, 1, 1);
          break;
        }

        case 'evolve': {
          // brace, split along the flanks and jaw-line, hold at the top,
          // then clamp back down. Effort, not flourish.
          const brace = smooth(0.0, 0.20, ph);
          const openU = smooth(0.18, 0.48, ph);
          const holdU = smooth(0.44, 0.52, ph) * (1 - smooth(0.62, 0.72, ph));
          const closeU = smooth(0.70, 1.0, ph);
          const o = (openU - closeU);

          // the body arches and shudders under the strain
          const strain = Math.sin(t * 30) * (brace * 0.5 + o) * 0.02;
          body.rotation.x = -brace * 0.14 - o * 0.16;
          body.position.y = o * 0.10 - brace * 0.05;
          body.rotation.z = strain * 2.0;

          // seams open: the torso swells and the girth widens
          const swell = 1 + o * 0.16 + holdU * 0.03;
          torsoMesh.scale.set(swell, 1 + o * 0.12, 1);
          pedMesh.scale.set(1 + o * 0.10, 1 + o * 0.08, 1);
          craniumMesh.scale.set(1 + o * 0.10, 1 + o * 0.08, 1);
          gillsL.scale.set(1 + o * 1.5, 1 + o * 0.4, 1);
          gillsR.scale.set(1 + o * 1.5, 1 + o * 0.4, 1);

          // fins rise and stretch
          dorsalFin.scale.set(1 + o * 0.18, 1 + o * 0.38, 1 + o * 0.15);
          dorsalFin.rotation.x = -o * 0.16;
          dorsal2.scale.set(1, 1 + o * 0.30, 1);
          analFin.scale.set(1, 1 + o * 0.30, 1);
          tailFin.scale.set(1 + o * 0.10, 1 + o * 0.26, 1 + o * 0.12);
          pecL.rotation.set(REST.pecL.x - o * 0.34, o * 0.28, REST.pecL.z - o * 0.70);
          pecR.rotation.set(REST.pecR.x - o * 0.34, -o * 0.28, REST.pecR.z + o * 0.70);
          pecL.scale.setScalar(1 + o * 0.22);
          pecR.scale.setScalar(1 + o * 0.22);
          pelL.rotation.z = REST.pelL.z - o * 0.45;
          pelR.rotation.z = REST.pelR.z + o * 0.45;

          // the jaws open and the tooth rows push out — new teeth rolling in
          setJaw(0.05 + o * 0.44, 0.06 + o * 0.80, o * 0.07);
          upperTeeth.scale.setScalar(1 + o * 0.30);
          lowerTeeth.scale.setScalar(1 + o * 0.30);
          head.rotation.x = -o * 0.16 + strain;

          // tail flexes slowly through the whole thing
          const flex = Math.sin(t * 2.2) * (0.3 + o * 0.3);
          peduncle.rotation.y = flex * 0.14;
          tailStem.rotation.y = flex * 0.22;
          tailFin.rotation.y = flex * 0.20;
          blink(brace * (1 - closeU) * 0.6);
          break;
        }

        default:
          break;
      }

      // wounded bodies carry the wound into their actions too
      if (health < 0.75) applyHurt(1 - clamp((health - 0.0) / 0.75, 0, 1), t, 0.55);
      return;
    }

    // ================= AIRBORNE =================
    if (!grounded) {
      // out of the water: a rigid ballistic arc. The tail stops beating and
      // sets into a stiff curve, the fins lock out like an aeroplane, the
      // body arches. Absolutely no swimming cycle.
      const arch = 0.22 + Math.sin(t * 1.6) * 0.05;
      body.rotation.x = -0.10;
      torso.rotation.x = -arch * 0.30;
      peduncle.rotation.x = arch * 0.55;
      tailStem.rotation.x = arch * 0.70;
      tailFin.rotation.x = arch * 0.30;

      // a slow residual twist from the launch, not a swim beat
      const twist = Math.sin(t * 1.1) * 0.18;
      torso.rotation.y = twist * 0.35;
      peduncle.rotation.y = twist * 0.55;
      tailStem.rotation.y = twist * 0.70;
      tailFin.rotation.y = twist * 0.62;
      upperLobe.rotation.z = twist * 0.35;
      lowerLobe.rotation.z = twist * 0.30;
      body.rotation.z = twist * 0.30;

      // pectorals locked out flat and forward, like stiff wings
      pecL.rotation.set(REST.pecL.x - 0.28, -0.12, REST.pecL.z - 0.42);
      pecR.rotation.set(REST.pecR.x - 0.28, 0.12, REST.pecR.z + 0.42);
      pelL.rotation.z = REST.pelL.z - 0.30;
      pelR.rotation.z = REST.pelR.z + 0.30;
      dorsalFin.rotation.x = -0.08;

      // head reaches forward, jaws part in the air
      head.rotation.x = -0.12 + Math.sin(t * 2.2) * 0.04;
      const gape = 0.30 + Math.sin(t * 3.4) * 0.10;
      setJaw(0.06 + gape * 0.30, 0.10 + gape * 0.55, 0.02);
      blink(0.15);

      if (health < 0.75) applyHurt(1 - clamp(health / 0.75, 0, 1), t, 0.8);
      return;
    }

    // ================= LOCOMOTION =================
    // A shark is thrust by its tail: the whole gait is one travelling wave
    // whose amplitude and frequency change with speed. There are no feet to
    // skate — but the wave is still driven off stride so the beat matches
    // the distance covered.
    const sp = clamp(speed, 0, 6);

    if (sp < 0.02) {
      // ---- STAND: hovering on station, alive ----
      // Slow sculling of the tail just to hold position, a breathing swell
      // through the gills, the head panning as it scans.
      const idle = t;
      const scull = Math.sin(idle * 1.15);
      const scull2 = Math.sin(idle * 1.15 - 0.5);
      const scull3 = Math.sin(idle * 1.15 - 0.9);

      torso.rotation.y = scull * 0.045;
      peduncle.rotation.y = scull2 * 0.16;
      tailStem.rotation.y = scull3 * 0.24;
      tailFin.rotation.y = Math.sin(idle * 1.15 - 1.25) * 0.22;
      upperLobe.rotation.z = Math.sin(idle * 1.15 - 1.6) * 0.16;
      lowerLobe.rotation.z = Math.sin(idle * 1.15 - 1.7) * 0.13;

      // gentle rise and fall + roll of a body holding depth
      body.position.y = Math.sin(idle * 0.75) * 0.020;
      body.rotation.z = Math.sin(idle * 0.62 + 1.1) * 0.035;
      body.rotation.x = Math.sin(idle * 0.55) * 0.022;

      // head scans: a slow sweep with a pause, plus a small pitch nod
      const scanPhase = idle * 0.33;
      const scan = Math.sin(scanPhase) * Math.pow(Math.abs(Math.sin(scanPhase)), 0.4);
      head.rotation.y = scan * 0.24;
      head.rotation.x = Math.sin(idle * 0.47 + 0.8) * 0.05;
      head.rotation.z = scan * 0.06;
      // the eyes counter-rotate, keeping something in sight
      eyeL.rotation.y = -1.15 - scan * 0.22;
      eyeR.rotation.y = 1.15 - scan * 0.22;

      // pectorals feather to trim depth
      const feather = Math.sin(idle * 0.9);
      pecL.rotation.x = REST.pecL.x + feather * 0.09;
      pecR.rotation.x = REST.pecR.x - feather * 0.09;
      pecL.rotation.z = REST.pecL.z + Math.sin(idle * 0.7) * 0.05;
      pecR.rotation.z = REST.pecR.z + Math.sin(idle * 0.7) * 0.05;
      pelL.rotation.x = REST.pelL.x + feather * 0.05;
      pelR.rotation.x = REST.pelR.x - feather * 0.05;
      dorsalFin.rotation.z = Math.sin(idle * 0.8) * 0.03;

      // ram ventilation stops at zero speed: it must pump water — jaw and
      // gills work together
      breathe(idle);
      setJaw(0.015, 0.055 + (Math.sin(idle * 1.35) * 0.5 + 0.5) * 0.06, 0.0);

      // an occasional blink of the nictitating membrane
      const bl = Math.pow(Math.max(0, Math.sin(t * 0.41)), 40);
      blink(bl);
    } else {
      // ---- MOVING ----
      // gait character by speed band, sampled where the grid samples
      let amp, headAmp, cyclesPerStride, pitch, stretch, pecTuck, gillFlare;

      if (sp <= 0.5) {
        // creep / stalk: long, slow, deep-bodied sweeps; body gathered and low
        const k = sp / 0.5;
        amp = lerp(0.10, 0.30, k);
        headAmp = lerp(0.22, 0.30, k);
        cyclesPerStride = 1.0;
        pitch = lerp(0.0, 0.06, k);        // nose slightly down, stalking
        stretch = 0.0;
        pecTuck = lerp(0.0, 0.10, k);      // fins still spread, gliding wide
        gillFlare = 0.15;
      } else if (sp <= 1.0) {
        // cruise
        const k = (sp - 0.5) / 0.5;
        amp = lerp(0.30, 0.36, k);
        headAmp = lerp(0.30, 0.26, k);
        cyclesPerStride = 1.0;
        pitch = lerp(0.06, 0.02, k);
        stretch = lerp(0.0, 0.01, k);
        pecTuck = lerp(0.10, 0.16, k);
        gillFlare = 0.25;
      } else if (sp <= 2.0) {
        // GAIT CHANGE: the sculling cruise becomes a driven beat. The body
        // stiffens forward of the peduncle and the thrust moves aft.
        const k = (sp - 1.0);
        amp = lerp(0.36, 0.42, k);
        headAmp = lerp(0.26, 0.13, k);     // head stops swinging, locks on
        cyclesPerStride = lerp(1.0, 1.35, k);
        pitch = lerp(0.02, -0.02, k);
        stretch = lerp(0.01, 0.022, k);
        pecTuck = lerp(0.16, 0.40, k);     // fins begin sweeping back
        gillFlare = lerp(0.25, 0.45, k);
      } else if (sp <= 3.0) {
        // run
        const k = sp - 2.0;
        amp = lerp(0.42, 0.46, k);
        headAmp = lerp(0.13, 0.08, k);
        cyclesPerStride = lerp(1.35, 1.6, k);
        pitch = lerp(-0.02, -0.04, k);
        stretch = lerp(0.022, 0.036, k);
        pecTuck = lerp(0.40, 0.62, k);
        gillFlare = lerp(0.45, 0.7, k);
      } else {
        // sprint: everything longer and flatter, body rigid up front, all of
        // the amplitude in the last third, fins folded into the flanks
        const k = clamp((sp - 3.0) / 3.0, 0, 1);
        amp = lerp(0.46, 0.60, k);
        headAmp = lerp(0.08, 0.03, k);
        cyclesPerStride = lerp(1.6, 2.1, k);
        pitch = lerp(-0.04, -0.05, k);
        stretch = lerp(0.036, 0.070, k);
        pecTuck = lerp(0.62, 0.95, k);
        gillFlare = lerp(0.7, 1.0, k);
      }

      const phase = stride * cyclesPerStride;
      // at high speed the wave concentrates aft: scale the forward links down
      const fwdDamp = lerp(1.0, 0.30, clamp((sp - 1.0) / 5.0, 0, 1));
      const w = (lag) => Math.sin((phase - lag) * TAU);

      torso.rotation.y = w(0.00) * amp * 0.26 * fwdDamp;
      peduncle.rotation.y = w(0.15) * amp * 0.92;
      tailStem.rotation.y = w(0.28) * amp * 1.30;
      tailFin.rotation.y = w(0.42) * amp * 1.20;
      upperLobe.rotation.z = w(0.52) * amp * 0.55;
      lowerLobe.rotation.z = w(0.54) * amp * 0.46;
      head.rotation.y = -w(0.03) * amp * headAmp;
      torso.rotation.z = w(0.12) * amp * 0.11 * fwdDamp;
      head.rotation.z = w(0.05) * amp * 0.06 * fwdDamp;

      // vertical bob and body pitch: the whole animal rides its own wave
      body.position.y = Math.sin(phase * TAU * 2) * 0.012 * (1 - clamp(sp / 6, 0, 1) * 0.6);
      body.rotation.x = pitch + Math.sin(phase * TAU) * 0.020 * fwdDamp;

      // the body stretches out at speed
      body.scale.set(1 - stretch * 0.35, 1 - stretch * 0.35, 1 + stretch);
      // the head drops into line with the spine as it goes faster
      head.rotation.x += -pitch * 0.4 + clamp((sp - 2) / 4, 0, 1) * -0.06;

      // pectorals: spread wide when slow (lift), swept back and tucked when fast
      const flick = w(0.20) * 0.05;
      pecL.rotation.set(
        REST.pecL.x - pecTuck * 0.22 + flick,
        -pecTuck * 0.55,
        REST.pecL.z + pecTuck * 0.62
      );
      pecR.rotation.set(
        REST.pecR.x - pecTuck * 0.22 - flick,
        pecTuck * 0.55,
        REST.pecR.z - pecTuck * 0.62
      );
      pelL.rotation.set(REST.pelL.x, -pecTuck * 0.25, REST.pelL.z + pecTuck * 0.35);
      pelR.rotation.set(REST.pelR.x, pecTuck * 0.25, REST.pelR.z - pecTuck * 0.35);
      // fins trail-flex with the wave
      dorsalFin.rotation.z = w(0.10) * amp * 0.16;
      dorsal2.rotation.z = w(0.22) * amp * 0.26;
      analFin.rotation.z = w(0.24) * amp * 0.26;

      // ram ventilation: mouth cracks open, gills flare with speed
      setJaw(0.010 + gillFlare * 0.02, 0.030 + gillFlare * 0.075, 0.0);
      const gs = 1 + gillFlare * 0.45 + Math.abs(w(0.15)) * 0.10;
      gillsL.scale.set(gs, 1, 1);
      gillsR.scale.set(gs, 1, 1);

      // eyes lead the direction of travel very slightly
      eyeL.rotation.y = -1.15 + head.rotation.y * 0.4;
      eyeR.rotation.y = 1.15 + head.rotation.y * 0.4;

      // a stalking creep still breathes visibly
      if (sp <= 0.6) breathe(t);
    }

    // ================= TURN OVERLAY =================
    if (Math.abs(turn) > 0.001) {
      const k = turn; // negative = left
      // banked like an aircraft: roll INTO the turn, spine curves, tail
      // sweeps to the outside, inside pectoral drops and the outside one lifts
      body.rotation.z += k * 0.42;           // bank
      torso.rotation.y += -k * 0.16;         // spine curls toward the turn
      peduncle.rotation.y += k * 0.30;       // tail swings outboard
      tailStem.rotation.y += k * 0.40;
      tailFin.rotation.y += k * 0.34;
      head.rotation.y += -k * 0.40;          // head leads
      head.rotation.z += k * 0.20;
      torso.rotation.z += k * 0.10;

      // inside fin (the side being turned toward) drops and pitches up,
      // outside fin lifts — that is what actually rolls a shark
      const insideIsLeft = k < 0;
      const inside = insideIsLeft ? pecL : pecR;
      const outside = insideIsLeft ? pecR : pecL;
      const mag = Math.abs(k);
      inside.rotation.x += mag * 0.55;
      inside.rotation.z += (insideIsLeft ? 1 : -1) * mag * 0.35;
      outside.rotation.x -= mag * 0.45;
      outside.rotation.z += (insideIsLeft ? -1 : 1) * mag * 0.30;

      const insidePel = insideIsLeft ? pelL : pelR;
      const outsidePel = insideIsLeft ? pelR : pelL;
      insidePel.rotation.x += mag * 0.28;
      outsidePel.rotation.x -= mag * 0.22;

      dorsalFin.rotation.z += k * 0.18;
      dorsal2.rotation.z += k * 0.22;
      analFin.rotation.z += -k * 0.20;

      // eyes swing hard into the turn
      eyeL.rotation.y += -k * 0.30;
      eyeR.rotation.y += -k * 0.30;
    }

    // ================= HURT OVERLAY =================
    if (health < 0.999) {
      applyHurt(1 - health, t, 1.0);
    }
  };

  // The difference a wound makes: lists onto the wounded (left) flank, one
  // pectoral hangs useless, the head sags, the tail beat goes ragged.
  function applyHurt(w, t, gain) {
    const k = clamp(w, 0, 1) * (gain === undefined ? 1 : gain);
    if (k <= 0.001) return;

    // list and sag
    body.rotation.z += k * 0.30;
    body.rotation.x += k * 0.10;
    body.position.y -= k * 0.07;

    // the spine loses tone on the wounded side
    torso.rotation.y += k * 0.10;
    torso.rotation.z += k * 0.08;
    peduncle.rotation.y += -k * 0.12;
    peduncle.rotation.x += k * 0.10;
    tailStem.rotation.x += k * 0.14;

    // head drops and hangs to one side
    head.rotation.x += k * 0.24;
    head.rotation.y += k * 0.18;
    head.rotation.z += k * 0.16;

    // the wounded-side pectoral trails dead, the other overworks
    pecL.rotation.x += k * 0.55;
    pecL.rotation.z += k * 0.50;
    pecL.rotation.y += k * 0.20;
    pecR.rotation.x -= k * 0.18;
    pecR.rotation.z -= k * 0.10;
    pelL.rotation.z += k * 0.30;

    dorsalFin.rotation.z += k * 0.22;
    dorsalFin.rotation.x += k * 0.10;

    // shallow, labored gill pumping and a slack jaw
    const gasp = Math.sin(t * 2.6) * 0.5 + 0.5;
    lowerJaw.rotation.x += k * (0.10 + gasp * 0.14);
    upperJaw.rotation.x -= k * 0.03;
    gillsL.scale.x += k * gasp * 0.5;
    gillsR.scale.x += k * gasp * 0.5;
    throat.scale.y += k * gasp * 0.20;

    // an irregular shudder
    const shud = Math.sin(t * 13.0) * Math.sin(t * 3.1);
    body.rotation.y += shud * k * 0.04;
    head.rotation.z += shud * k * 0.05;

    // eyes half-lidded
    if (P.lidL) P.lidL.rotation.y = lerp(P.lidL.rotation.y, 0.05, k * 0.45);
    if (P.lidR) P.lidR.rotation.y = lerp(P.lidR.rotation.y, 0.05, k * 0.45);
  }

  // Fallback clock — a slow cruise if nothing ever calls pose.
  let _d = 0;
  root.userData.update = (t, dt) => {
    _d += (dt || 0.016) * 1.0;
    root.userData.pose({ t, dt: dt || 0.016, speed: 1, stride: (_d * 0.75) % 1, turn: 0, grounded: true, health: 1 });
  };

  // start at rest
  root.userData.pose({ t: 0, dt: 0, speed: 0, stride: 0, turn: 0, grounded: true, health: 1 });

  return root;
}