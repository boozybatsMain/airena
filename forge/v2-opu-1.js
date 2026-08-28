function build(THREE, TSL) {
  const root = new THREE.Group();
  root.name = 'Shark';

  // ---------------------------------------------------------------------
  // Shared materials
  // ---------------------------------------------------------------------
  const { Fn, vec2, vec3, vec4, float, uv, positionLocal, normalLocal, mix,
          smoothstep, abs, pow, clamp, sin, cos, fract, floor, dot, length,
          oneMinus, max, min, step, mul, add, sub, div, normalize } = TSL;

  // Procedural hash / noise helpers in TSL
  const hash21 = Fn(([p]) => {
    const q = fract(p.mul(vec2(127.1, 311.7)).sin().mul(43758.5453));
    return fract(q.x.add(q.y).mul(43758.5453));
  });

  const vnoise = Fn(([p]) => {
    const i = floor(p);
    const f = fract(p);
    const u = f.mul(f).mul(sub(float(3.0), f.mul(2.0)));
    const a = hash21(i);
    const b = hash21(i.add(vec2(1.0, 0.0)));
    const c = hash21(i.add(vec2(0.0, 1.0)));
    const d = hash21(i.add(vec2(1.0, 1.0)));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  });

  const fbm = Fn(([p]) => {
    const n1 = vnoise(p);
    const n2 = vnoise(p.mul(2.03)).mul(0.5);
    const n3 = vnoise(p.mul(4.11)).mul(0.25);
    const n4 = vnoise(p.mul(8.07)).mul(0.125);
    return n1.add(n2).add(n3).add(n4).div(1.875);
  });

  // ---- Shark skin: countershaded grey, dermal-denticle micro speckle -----
  const skinMat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.55,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
  {
    const yy = positionLocal.y;
    const zz = positionLocal.z;

    // countershading: dark dorsal, pale ventral, hard-ish transition line
    const shade = smoothstep(float(-0.42), float(0.30), yy);
    const dorsal = vec3(0.213, 0.243, 0.271);
    const flank  = vec3(0.352, 0.386, 0.413);
    const belly  = vec3(0.878, 0.874, 0.845);

    const midline = smoothstep(float(-0.55), float(-0.10), yy);
    let base = mix(belly, flank, midline);
    base = mix(base, dorsal, smoothstep(float(0.02), float(0.55), yy));

    // dermal denticle grain (fine, stretched along body axis)
    const grainUV = vec2(zz.mul(46.0), yy.mul(30.0).add(positionLocal.x.mul(30.0)));
    const grain = fbm(grainUV).sub(0.5).mul(0.085);

    // broad mottling
    const mott = fbm(vec2(zz.mul(2.2), yy.mul(2.0).add(positionLocal.x.mul(1.7)))).sub(0.5).mul(0.10);

    // subtle darker blotch along upper flank
    const blotch = smoothstep(float(0.35), float(0.75),
      fbm(vec2(zz.mul(1.1).add(3.7), yy.mul(1.4)))).mul(0.09)
      .mul(smoothstep(float(-0.2), float(0.45), yy));

    let col = base.add(vec3(grain)).add(vec3(mott)).sub(vec3(blotch));

    // lateral line: faint pale stripe near y ~ 0
    const lat = oneMinus(smoothstep(float(0.0), float(0.035), abs(yy.add(0.02))));
    col = mix(col, col.add(vec3(0.06, 0.07, 0.075)), lat.mul(0.55));

    // wet sheen fresnel handled by roughness variation
    skinMat.colorNode = vec4(clamp(col, vec3(0.0), vec3(1.0)), 1.0);
    skinMat.roughnessNode = clamp(
      float(0.62).sub(smoothstep(float(-0.5), float(0.4), yy).mul(0.12)).add(grain.mul(2.0)),
      float(0.25), float(0.85)
    );
  }

  // ---- Gill slit / mouth-interior dark material -------------------------
  const mawMat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.42, metalness: 0.0, side: THREE.DoubleSide
  });
  {
    const d = smoothstep(float(-0.6), float(0.6), positionLocal.y);
    const c = mix(vec3(0.115, 0.045, 0.055), vec3(0.352, 0.156, 0.168), d);
    const wet = fbm(vec2(positionLocal.z.mul(9.0), positionLocal.x.mul(9.0))).mul(0.10);
    mawMat.colorNode = vec4(c.add(vec3(wet)), 1.0);
    mawMat.roughnessNode = float(0.34).add(wet.mul(0.8));
  }

  const gumMat = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0.62, 0.30, 0.31), roughness: 0.45, metalness: 0.0
  });

  // ---- Teeth: bright enamel, faintly translucent tips -------------------
  const toothMat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.18, metalness: 0.0
  });
  {
    const h = clamp(positionLocal.y.mul(1.6).add(0.5), float(0.0), float(1.0));
    const c = mix(vec3(0.86, 0.84, 0.78), vec3(0.995, 0.995, 0.985), h);
    toothMat.colorNode = vec4(c, 1.0);
    toothMat.roughnessNode = float(0.30).sub(h.mul(0.18));
  }

  // ---- Eye ---------------------------------------------------------------
  const eyeMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.0 });
  {
    const r = length(positionLocal.xy.mul(vec2(1.0, 1.0)));
    const pupil = oneMinus(smoothstep(float(0.30), float(0.42), r));
    const iris = mix(vec3(0.10, 0.10, 0.115), vec3(0.02, 0.02, 0.025), pupil);
    eyeMat.colorNode = vec4(iris, 1.0);
    eyeMat.emissiveNode = vec3(0.02, 0.022, 0.028).mul(oneMinus(pupil));
  }

  const finMembraneMat = skinMat;

  const clawWhite = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0.93, 0.93, 0.90), roughness: 0.35
  });

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  function makeNode(name, parent, pos) {
    const g = new THREE.Group();
    g.name = name;
    if (pos) g.position.copy(pos);
    (parent || root).add(g);
    return g;
  }

  // Lathe-like fin: build a flat tapered blade in the XZ/XY plane by extruding a Shape.
  function bladeGeometry(pts, thickness, taperCurve) {
    // pts: [[x,y],...] outline in 2D, extruded along Z then thinned
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i], pv = pts[i - 1];
      shape.lineTo(p[0], p[1]);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.42,
      bevelSize: thickness * 0.55,
      bevelSegments: 3,
      curveSegments: 18
    });
    geo.translate(0, 0, -thickness * 0.5);
    // taper thickness toward the tip (distance in x)
    if (taperCurve) {
      const pos = geo.attributes.position;
      let minX = Infinity, maxX = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      const span = Math.max(1e-5, maxX - minX);
      for (let i = 0; i < pos.count; i++) {
        const t = (pos.getX(i) - minX) / span;
        pos.setZ(i, pos.getZ(i) * taperCurve(t));
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
    return geo;
  }

  // Smooth curve-based body: build a lathe-ish tube with an elliptic cross section
  function bodyGeometry() {
    // Profile: half-width (x radius) and half-height (y radius) along z (nose +Z).
    // Shark spans z from -2.35 (tail base) to +1.55 (snout tip). Length ~ 3.9 units.
    const stations = [
      // z,    rx,    ry,    yOff (belly/back offset of section center)
      [ 1.560, 0.008, 0.006,  0.020],
      [ 1.500, 0.055, 0.048,  0.014],
      [ 1.400, 0.110, 0.092,  0.006],
      [ 1.280, 0.166, 0.140, -0.004],
      [ 1.140, 0.222, 0.192, -0.014],
      [ 1.000, 0.272, 0.244, -0.022],
      [ 0.860, 0.315, 0.294, -0.026],
      [ 0.700, 0.356, 0.344, -0.026],
      [ 0.520, 0.392, 0.390, -0.022],
      [ 0.320, 0.418, 0.424, -0.014],
      [ 0.100, 0.432, 0.446, -0.004],
      [-0.120, 0.430, 0.452,  0.004],
      [-0.340, 0.414, 0.440,  0.010],
      [-0.560, 0.386, 0.414,  0.014],
      [-0.780, 0.348, 0.378,  0.018],
      [-1.000, 0.302, 0.334,  0.022],
      [-1.220, 0.252, 0.286,  0.026],
      [-1.440, 0.200, 0.236,  0.030],
      [-1.660, 0.150, 0.188,  0.034],
      [-1.860, 0.108, 0.146,  0.038],
      [-2.040, 0.076, 0.114,  0.042],
      [-2.200, 0.054, 0.092,  0.046],
      [-2.350, 0.040, 0.078,  0.050]
    ];

    const RADIAL = 34;
    const N = stations.length;
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i < N; i++) {
      const [z, rx, ry, yo] = stations[i];
      for (let j = 0; j <= RADIAL; j++) {
        const a = (j / RADIAL) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        // superellipse-ish: flatten the belly a touch, keep back rounded
        const k = 1.0 + 0.16 * Math.max(0, -sa);   // belly slightly flatter/wider
        const x = ca * rx * (1.0 + 0.05 * Math.max(0, -sa));
        let y = sa * ry;
        if (sa < 0) y *= 0.92;         // belly flattening
        else y *= 1.03;                // back slightly raised
        // keel: near the tail the section becomes laterally compressed
        positions.push(x, y + yo, z);
        uvs.push(j / RADIAL, i / (N - 1));
        normals.push(x, y, 0);
      }
    }
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * (RADIAL + 1) + j;
        const b = a + RADIAL + 1;
        indices.push(a, b, a + 1);
        indices.push(b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------------------------------------
  // SKELETON: spine chain, nose→tail, every joint at its pivot
  // ---------------------------------------------------------------------
  // Root -> Body (torso, holds the big mass) -> Spine1..Spine4 -> TailFin
  //      -> Head -> Snout / Jaw / Eyes / Gills
  //
  // The torso mesh is split into segments so that each spine joint actually
  // bends geometry, giving a real anguilliform/carangiform swim.

  const bodyRoot = makeNode('Body', root, V3(0, 0, 0));

  // Slice the full body geometry into z-bands, each parented to its spine node.
  const fullGeo = bodyGeometry();

  function sliceGeometry(geo, zMin, zMax, pivotZ) {
    // Keep triangles whose centroid lies in [zMin, zMax); rebuild indexed geo.
    const pos = geo.attributes.position;
    const idx = geo.index.array;
    const keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
      if (cz >= zMin - 1e-6 && cz < zMax + 1e-6) keep.push(a, b, c);
    }
    const remap = new Map();
    const P = [], U = [], I = [];
    const uvA = geo.attributes.uv;
    for (const vi of keep) {
      let ni = remap.get(vi);
      if (ni === undefined) {
        ni = P.length / 3;
        remap.set(vi, ni);
        P.push(pos.getX(vi), pos.getY(vi), pos.getZ(vi) - pivotZ);
        U.push(uvA.getX(vi), uvA.getY(vi));
      }
      I.push(ni);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    return g;
  }

  // Spine joint z positions (world/rest space), nose-forward.
  const SEG = [
    { name: 'Torso',  z0: -0.30, z1:  1.56, pivot:  0.00 },
    { name: 'Spine1', z0: -0.85, z1: -0.30, pivot: -0.30 },
    { name: 'Spine2', z0: -1.35, z1: -0.85, pivot: -0.85 },
    { name: 'Spine3', z0: -1.80, z1: -1.35, pivot: -1.35 },
    { name: 'Spine4', z0: -2.36, z1: -1.80, pivot: -1.80 }
  ];

  const spineNodes = [];
  let parentNode = bodyRoot;
  let prevPivot = 0;
  for (const s of SEG) {
    const node = new THREE.Group();
    node.name = s.name;
    node.position.set(0, 0, s.pivot - prevPivot);
    parentNode.add(node);
    const g = sliceGeometry(fullGeo, s.z0, s.z1, s.pivot);
    const m = new THREE.Mesh(g, skinMat);
    m.name = s.name + 'Mesh';
    m.castShadow = m.receiveShadow = true;
    node.add(m);
    spineNodes.push(node);
    parentNode = node;
    prevPivot = s.pivot;
  }
  const [torso, spine1, spine2, spine3, spine4] = spineNodes;

  // ---------------------------------------------------------------------
  // HEAD — parented to torso, pivot behind the skull at z = 0.62
  // ---------------------------------------------------------------------
  const head = makeNode('Head', torso, V3(0, 0, 0.62));

  // Snout cone shell wrapping the front of the torso section (visual detail
  // only — the torso mesh already covers it, this is the pointed conical
  // rostrum a shark actually has, slightly proud of the base surface).
  const snout = makeNode('Snout', head, V3(0, 0, 0.55));
  {
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const z = t * 0.94;                       // from jaw hinge forward
      const r = 0.352 * Math.pow(1 - t, 0.62) + 0.004;
      pts.push(new THREE.Vector2(r, z));
    }
    const lathe = new THREE.LatheGeometry(pts, 28);
    lathe.rotateX(-Math.PI / 2);
    // shark rostrum: flatten it vertically & droop the tip
    const p = lathe.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const t = Math.max(0, Math.min(1, z / 0.94));
      p.setY(i, p.getY(i) * (1.0 - 0.30 * t) - 0.030 * t * t);
      p.setX(i, p.getX(i) * (1.0 + 0.06 * t));
    }
    p.needsUpdate = true;
    lathe.computeVertexNormals();
    const m = new THREE.Mesh(lathe, skinMat);
    m.name = 'SnoutMesh';
    m.castShadow = true;
    snout.add(m);

    // ampullae of Lorenzini: tiny dark pores on the underside of the rostrum
    const poreG = new THREE.SphereGeometry(0.011, 6, 5);
    const poreM = new THREE.MeshStandardNodeMaterial({
      color: new THREE.Color(0.10, 0.10, 0.11), roughness: 0.6
    });
    const pores = new THREE.Group();
    pores.name = 'Ampullae';
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 7; c++) {
        const t = 0.22 + r * 0.145;
        const zz = t * 0.94;
        const rad = 0.352 * Math.pow(1 - t, 0.62) + 0.004;
        const ang = -Math.PI / 2 + (c - 3) * 0.30;
        const px = Math.cos(ang) * rad * 0.98;
        const py = Math.sin(ang) * rad * (1 - 0.30 * t) * 0.98 - 0.030 * t * t;
        const pm = new THREE.Mesh(poreG, poreM);
        pm.position.set(px, py, zz);
        pm.scale.setScalar(0.8 + 0.5 * Math.random());
        pores.add(pm);
      }
    }
    snout.add(pores);

    // nostrils
    const nosG = new THREE.SphereGeometry(0.030, 10, 8);
    nosG.scale(1.0, 0.55, 1.5);
    for (const sx of [-1, 1]) {
      const n = new THREE.Mesh(nosG, poreM);
      n.name = sx < 0 ? 'NostrilL' : 'NostrilR';
      n.position.set(sx * 0.145, -0.115, 0.585);
      snout.add(n);
    }
  }

  // ---- EYES -------------------------------------------------------------
  const eyeRadius = 0.056;
  const eyes = [];
  for (const sx of [-1, 1]) {
    const socket = makeNode(sx < 0 ? 'EyeL' : 'EyeR', head, V3(sx * 0.278, 0.098, 0.352));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(eyeRadius, 18, 14), eyeMat);
    ball.name = 'EyeBall';
    socket.add(ball);
    // nictitating lid (a thin cap that can sweep across during attack)
    const lid = new THREE.Mesh(
      new THREE.SphereGeometry(eyeRadius * 1.06, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      skinMat
    );
    lid.name = 'Lid';
    lid.rotation.z = sx < 0 ? -0.4 : 0.4;
    lid.position.y = -eyeRadius * 0.02;
    lid.rotation.x = Math.PI;   // start below, sweeps up
    lid.position.y = -eyeRadius * 1.02;
    socket.add(lid);
    socket.rotation.y = sx * 0.30;
    eyes.push({ socket, lid, ball, sx });
  }

  // ---- GILLS ------------------------------------------------------------
  const gills = [];
  for (const sx of [-1, 1]) {
    const holder = makeNode(sx < 0 ? 'GillsL' : 'GillsR', torso, V3(0, 0, 0));
    for (let i = 0; i < 5; i++) {
      const z = 0.30 - i * 0.098;
      const slitGrp = new THREE.Group();
      slitGrp.name = (sx < 0 ? 'GillL' : 'GillR') + i;
      const h = 0.235 - i * 0.014;
      const g = new THREE.BoxGeometry(0.014, h, 0.030);
      const m = new THREE.Mesh(g, mawMat);
      m.name = 'Slit';
      // curve the slit slightly forward at the bottom
      const gp = g.attributes.position;
      for (let k = 0; k < gp.count; k++) {
        const yy = gp.getY(k) / h;
        gp.setZ(k, gp.getZ(k) + 0.055 * (yy * yy - 0.25));
      }
      gp.needsUpdate = true; g.computeVertexNormals();
      slitGrp.add(m);
      // find surface x at this z: approximate with the profile
      const t = (z + 0.30) / 1.86;
      const rx = 0.435 - Math.abs(z - 0.10) * 0.10;
      slitGrp.position.set(sx * (rx * 0.985), -0.02 - i * 0.010, z);
      slitGrp.rotation.z = sx * 0.06;
      holder.add(slitGrp);
    }
    gills.push(holder);
  }

  // ---------------------------------------------------------------------
  // JAWS — the point of this creature. Upper jaw fixed to the head, lower
  // jaw hinged at the quadrate joint. Teeth are individual objects.
  // ---------------------------------------------------------------------
  const jawHingeZ = 0.185;
  const jawHingeY = -0.132;

  const upperJaw = makeNode('UpperJaw', head, V3(0, jawHingeY + 0.02, jawHingeZ));
  const lowerJaw = makeNode('LowerJaw', head, V3(0, jawHingeY, jawHingeZ));

  // Jaw arch curve: parabolic U opening forward (+Z), in local jaw space.
  function jawArch(halfWidth, reach, y) {
    // returns f(u in -1..1) -> Vector3
    return (u) => {
      const x = u * halfWidth;
      const z = reach * (1.0 - u * u * 0.92);
      return new THREE.Vector3(x, y, z);
    };
  }

  const UP_W = 0.312, UP_REACH = 0.556;
  const LO_W = 0.286, LO_REACH = 0.512;

  // ---- Gum / cartilage arch as a swept tube -----------------------------
  function archTube(halfWidth, reach, thickness, y) {
    const f = jawArch(halfWidth, reach, y);
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const u = -1 + (2 * i) / 24;
      pts.push(f(u));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 48, thickness, 10, false);
  }

  {
    const ug = archTube(UP_W, UP_REACH, 0.052, 0);
    const um = new THREE.Mesh(ug, gumMat);
    um.name = 'UpperGum';
    upperJaw.add(um);

    const lg = archTube(LO_W, LO_REACH, 0.048, 0);
    const lm = new THREE.Mesh(lg, gumMat);
    lm.name = 'LowerGum';
    lowerJaw.add(lm);

    // Mouth cavity: a dark shell behind/inside the arches so the open maw
    // reads as a throat rather than a hole through the head.
    const cav = new THREE.SphereGeometry(0.30, 22, 18);
    cav.scale(1.06, 0.72, 1.30);
    const cavM = new THREE.Mesh(cav, mawMat);
    cavM.name = 'MouthCavity';
    cavM.position.set(0, 0.02, 0.10);
    cavM.material = mawMat;
    upperJaw.add(cavM);

    // tongue / basihyal floor
    const tg = new THREE.SphereGeometry(0.20, 18, 14);
    tg.scale(1.0, 0.32, 1.5);
    const tm = new THREE.Mesh(tg, mawMat);
    tm.name = 'Tongue';
    tm.position.set(0, 0.028, 0.20);
    lowerJaw.add(tm);

    // lower jaw cartilage plate (gives the chin a mass)
    const chinShape = new THREE.Shape();
    chinShape.moveTo(-LO_W * 1.02, 0);
    chinShape.quadraticCurveTo(0, LO_REACH * 1.06, LO_W * 1.02, 0);
    chinShape.quadraticCurveTo(0, -0.10, -LO_W * 1.02, 0);
    const chinGeo = new THREE.ExtrudeGeometry(chinShape, {
      depth: 0.11, bevelEnabled: true, bevelThickness: 0.03,
      bevelSize: 0.03, bevelSegments: 2, curveSegments: 16
    });
    chinGeo.rotateX(Math.PI / 2);
    const chin = new THREE.Mesh(chinGeo, skinMat);
    chin.name = 'ChinPlate';
    chin.position.set(0, -0.028, 0);
    chin.scale.set(1.0, 1.0, 1.0);
    lowerJaw.add(chin);

    // upper palate plate
    const palShape = new THREE.Shape();
    palShape.moveTo(-UP_W * 1.04, 0);
    palShape.quadraticCurveTo(0, UP_REACH * 1.05, UP_W * 1.04, 0);
    palShape.quadraticCurveTo(0, -0.16, -UP_W * 1.04, 0);
    const palGeo = new THREE.ExtrudeGeometry(palShape, {
      depth: 0.10, bevelEnabled: true, bevelThickness: 0.028,
      bevelSize: 0.028, bevelSegments: 2, curveSegments: 16
    });
    palGeo.rotateX(Math.PI / 2);
    const pal = new THREE.Mesh(palGeo, skinMat);
    pal.name = 'PalatePlate';
    pal.position.set(0, 0.030, 0);
    upperJaw.add(pal);
  }

  // ---- TEETH ------------------------------------------------------------
  // A great-white style tooth: broad triangular blade, serrated edges,
  // slightly recurved, thin. Built once, instanced as individual Meshes so
  // each tooth is its own named, detachable object.
  function toothGeometry(height, width, thickness, serrations) {
    const shape = new THREE.Shape();
    const hw = width * 0.5;
    // root
    shape.moveTo(-hw, 0);
    shape.lineTo(-hw * 0.92, -height * 0.14);
    shape.lineTo(hw * 0.92, -height * 0.14);
    shape.lineTo(hw, 0);
    // right cutting edge with serrations
    const n = serrations;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const ex = hw * (1 - Math.pow(t, 0.82)) * (1 - 0.06 * Math.sin(t * 9));
      const ey = height * t;
      const bump = (i % 2 === 0 ? 1 : -1) * width * 0.045 * (1 - t);
      shape.lineTo(ex + bump, ey);
    }
    // apex
    shape.lineTo(0, height * 1.02);
    // left cutting edge
    for (let i = n; i >= 1; i--) {
      const t = i / n;
      const ex = -hw * (1 - Math.pow(t, 0.82)) * (1 - 0.06 * Math.sin(t * 9));
      const ey = height * t;
      const bump = (i % 2 === 0 ? -1 : 1) * width * 0.045 * (1 - t);
      shape.lineTo(ex + bump, ey);
    }
    shape.lineTo(-hw, 0);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.5,
      bevelSize: thickness * 0.42,
      bevelSegments: 2,
      curveSegments: 4
    });
    geo.translate(0, 0, -thickness * 0.5);

    // Thin toward the tip and give the blade a slight lingual curve so it
    // hooks backward — a real shark tooth is not a flat card.
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const t = Math.max(0, Math.min(1, y / height));
      p.setZ(i, p.getZ(i) * (1.0 - 0.62 * t));
      p.setZ(i, p.getZ(i) - 0.16 * height * t * t);   // recurve
      p.setX(i, p.getX(i) * (1.0 - 0.05 * t));
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  const bigTooth  = toothGeometry(0.108, 0.086, 0.020, 7);
  const midTooth  = toothGeometry(0.086, 0.070, 0.017, 6);
  const smallTooth = toothGeometry(0.062, 0.052, 0.014, 5);
  const lowTooth  = toothGeometry(0.098, 0.062, 0.017, 6);   // narrower, spikier
  const lowTooth2 = toothGeometry(0.076, 0.050, 0.015, 5);

  // Rows: front functional row + two replacement rows folded back inside
  // the jaw, which is exactly how a shark's dentition is stacked.
  function buildToothRow(parentGrp, halfWidth, reach, opts) {
    const {
      count, y, tiltOut, rowName, geoPick, rollBack, radialInset, scale
    } = opts;
    const f = jawArch(halfWidth * radialInset, reach * radialInset, y);
    const row = new THREE.Group();
    row.name = rowName;
    parentGrp.add(row);

    for (let i = 0; i < count; i++) {
      const u = -1 + (2 * i) / (count - 1);
      const p = f(u);
      // tangent of the arch for orientation
      const eps = 0.02;
      const p1 = f(Math.max(-1, u - eps));
      const p2 = f(Math.min(1, u + eps));
      const tang = new THREE.Vector3().subVectors(p2, p1).normalize();
      // outward normal in XZ
      const outward = new THREE.Vector3(tang.z, 0, -tang.x).normalize();
      if (outward.dot(new THREE.Vector3(p.x, 0, p.z - reach * 0.3)) < 0) outward.negate();

      const t = new THREE.Group();
      t.name = `${rowName}_${i}`;
      t.position.copy(p);

      // face the tooth blade outward, apex along +Y (parent flips for upper)
      const m = new THREE.Mesh(geoPick(Math.abs(u), i), toothMat);
      m.name = 'Tooth';
      t.add(m);

      // orient: blade plane perpendicular to the arch tangent
      const yaw = Math.atan2(outward.x, outward.z);
      t.rotation.y = yaw;
      // splay outward near the corners, upright at the symphysis
      t.rotation.x = tiltOut * (0.35 + 0.65 * Math.abs(u)) * (rollBack ? -1 : 1);
      // slight lateral cant, alternating, as real rows do
      t.rotation.z = (i % 2 ? 1 : -1) * 0.05 * Math.abs(u);

      const s = scale * (1.0 - 0.30 * Math.pow(Math.abs(u), 1.5));
      t.scale.setScalar(s);
      row.add(t);
    }
    return row;
  }

  const upperTeeth = makeNode('UpperTeeth', upperJaw, V3(0, 0, 0));
  upperTeeth.rotation.x = Math.PI;       // apex points DOWN for the upper jaw
  upperTeeth.scale.z = -1;               // keep the arch opening forward
  {
    const pick = (au) => (au < 0.30 ? bigTooth : au < 0.66 ? midTooth : smallTooth);
    buildToothRow(upperTeeth, UP_W, UP_REACH, {
      count: 19, y: 0.014, tiltOut: 0.16, rowName: 'UpperRow0',
      geoPick: pick, rollBack: false, radialInset: 0.93, scale: 1.0
    });
    buildToothRow(upperTeeth, UP_W, UP_REACH, {
      count: 17, y: -0.026, tiltOut: 0.95, rowName: 'UpperRow1',
      geoPick: pick, rollBack: false, radialInset: 0.80, scale: 0.86
    });
    buildToothRow(upperTeeth, UP_W, UP_REACH, {
      count: 15, y: -0.052, tiltOut: 1.35, rowName: 'UpperRow2',
      geoPick: () => smallTooth, rollBack: false, radialInset: 0.66, scale: 0.72
    });
  }

  const lowerTeeth = makeNode('LowerTeeth', lowerJaw, V3(0, 0.012, 0));
  {
    const pick = (au) => (au < 0.42 ? lowTooth : lowTooth2);
    buildToothRow(lowerTeeth, LO_W, LO_REACH, {
      count: 19, y: 0.010, tiltOut: 0.10, rowName: 'LowerRow0',
      geoPick: pick, rollBack: false, radialInset: 0.93, scale: 1.0
    });
    buildToothRow(lowerTeeth, LO_W, LO_REACH, {
      count: 17, y: -0.020, tiltOut: 0.90, rowName: 'LowerRow1',
      geoPick: pick, rollBack: false, radialInset: 0.80, scale: 0.86
    });
    buildToothRow(lowerTeeth, LO_W, LO_REACH, {
      count: 15, y: -0.044, tiltOut: 1.30, rowName: 'LowerRow2',
      geoPick: () => lowTooth2, rollBack: false, radialInset: 0.66, scale: 0.72
    });
  }

  // Lip / labial skin folds that hide the tooth roots
  {
    const lipU = archTube(UP_W * 1.035, UP_REACH * 1.03, 0.040, 0.028);
    const lm = new THREE.Mesh(lipU, skinMat);
    lm.name = 'UpperLip';
    upperJaw.add(lm);
    const lipL = archTube(LO_W * 1.04, LO_REACH * 1.035, 0.038, -0.020);
    const ll = new THREE.Mesh(lipL, skinMat);
    ll.name = 'LowerLip';
    lowerJaw.add(ll);
  }

  // ---------------------------------------------------------------------
  // FINS
  // ---------------------------------------------------------------------
  // Pectorals: big scythe blades, hinged at the shoulder.
  const pectorals = [];
  for (const sx of [-1, 1]) {
    const hinge = makeNode(sx < 0 ? 'PectoralL' : 'PectoralR', torso, V3(sx * 0.36, -0.235, 0.14));
    const outline = [
      [0.00,  0.075],
      [0.22,  0.098],
      [0.52,  0.070],
      [0.80,  0.010],
      [0.96, -0.055],
      [0.72, -0.086],
      [0.40, -0.108],
      [0.14, -0.100],
      [0.00, -0.062]
    ];
    const geo = bladeGeometry(outline, 0.062, (t) => Math.pow(1 - t, 0.75) * 0.95 + 0.05);
    // outline is in (x=span, y=chord); we want span along ±X, chord along Z
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, finMembraneMat);
    m.name = 'PectoralBlade';
    m.castShadow = true;
    if (sx < 0) m.scale.x = -1;
    hinge.add(m);
    // rest pose: swept back and slightly down
    hinge.rotation.set(0, sx * -0.36, sx * -0.22);
    pectorals.push({ hinge, sx });
  }
  const [pecL, pecR] = pectorals;

  // Pelvic fins (small, paired), on Spine1
  const pelvics = [];
  for (const sx of [-1, 1]) {
    const hinge = makeNode(sx < 0 ? 'PelvicL' : 'PelvicR', spine1, V3(sx * 0.235, -0.255, -0.42));
    const outline = [
      [0.00,  0.045], [0.14, 0.052], [0.30, 0.016],
      [0.38, -0.030], [0.20, -0.055], [0.06, -0.050], [0.00, -0.032]
    ];
    const geo = bladeGeometry(outline, 0.044, (t) => Math.pow(1 - t, 0.8) * 0.95 + 0.05);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, finMembraneMat);
    m.name = 'PelvicBlade';
    if (sx < 0) m.scale.x = -1;
    hinge.add(m);
    hinge.rotation.set(0, sx * -0.30, sx * -0.30);
    pelvics.push({ hinge, sx });
  }
  const [pelL, pelR] = pelvics;

  // First dorsal fin — the silhouette. On the torso, hinged at its base.
  const dorsal = makeNode('DorsalFin', torso, V3(0, 0.415, -0.06));
  {
    const outline = [
      [0.00,  0.00],    // leading base, x is HEIGHT here after rotation
      [0.18,  0.10],
      [0.42,  0.20],
      [0.66,  0.24],
      [0.80,  0.20],
      [0.74, -0.06],
      [0.52, -0.20],
      [0.24, -0.30],
      [0.00, -0.34]
    ];
    // build in XY then stand it up: x -> +Y (height), y -> +Z (chord)
    const geo = bladeGeometry(outline, 0.078, (t) => Math.pow(1 - t, 0.62) * 0.92 + 0.08);
    geo.rotateZ(Math.PI / 2);          // x(height) becomes +Y
    geo.rotateY(Math.PI / 2);          // thickness axis becomes X
    // after those, remap so chord runs along Z
    const m = new THREE.Mesh(geo, finMembraneMat);
    m.name = 'DorsalBlade';
    m.castShadow = true;
    m.rotation.y = Math.PI / 2;
    m.scale.set(1.0, 1.05, 1.0);
    dorsal.add(m);
    dorsal.scale.setScalar(1.28);
  }

  // Second (small) dorsal on Spine3
  const dorsal2 = makeNode('DorsalFin2', spine3, V3(0, 0.235, -0.18));
  {
    const outline = [
      [0.00, 0.00], [0.10, 0.05], [0.22, 0.075], [0.30, 0.04],
      [0.26, -0.05], [0.14, -0.11], [0.00, -0.14]
    ];
    const geo = bladeGeometry(outline, 0.040, (t) => Math.pow(1 - t, 0.7) * 0.92 + 0.08);
    geo.rotateZ(Math.PI / 2);
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, finMembraneMat);
    m.name = 'Dorsal2Blade';
    m.rotation.y = Math.PI / 2;
    dorsal2.add(m);
    dorsal2.scale.setScalar(1.15);
  }

  // Anal fin (underside, mirrors dorsal2) on Spine3
  const analFin = makeNode('AnalFin', spine3, V3(0, -0.222, -0.16));
  {
    const outline = [
      [0.00, 0.00], [0.09, -0.05], [0.20, -0.075], [0.27, -0.04],
      [0.23, 0.05], [0.12, 0.10], [0.00, 0.13]
    ];
    const geo = bladeGeometry(outline, 0.036, (t) => Math.pow(1 - t, 0.7) * 0.92 + 0.08);
    geo.rotateZ(-Math.PI / 2);
    geo.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(geo, finMembraneMat);
    m.name = 'AnalBlade';
    m.rotation.y = Math.PI / 2;
    analFin.add(m);
  }

  // Caudal keels on the peduncle
  for (const sx of [-1, 1]) {
    const keelG = new THREE.BoxGeometry(0.055, 0.030, 0.46);
    const kp = keelG.attributes.position;
    for (let i = 0; i < kp.count; i++) {
      const t = Math.abs(kp.getZ(i)) / 0.23;
      kp.setX(i, kp.getX(i) * (1 - 0.75 * t * t));
      kp.setY(i, kp.getY(i) * (1 - 0.55 * t * t));
    }
    kp.needsUpdate = true; keelG.computeVertexNormals();
    const k = new THREE.Mesh(keelG, skinMat);
    k.name = sx < 0 ? 'KeelL' : 'KeelR';
    k.position.set(sx * 0.115, 0.020, -0.10);
    spine4.add(k);
  }

  // ---- CAUDAL FIN — heterocercal, big upper lobe -------------------------
  const tailFin = makeNode('TailFin', spine4, V3(0, 0.02, -0.54));
  const tailUpper = makeNode('TailUpperLobe', tailFin, V3(0, 0, 0));
  const tailLower = makeNode('TailLowerLobe', tailFin, V3(0, 0, 0));
  {
    // upper lobe: tall, swept back
    const up = [
      [0.00,  0.02],
      [0.26,  0.02],
      [0.60, -0.10],
      [0.86, -0.34],
      [0.98, -0.62],
      [0.80, -0.56],
      [0.48, -0.36],
      [0.20, -0.16],
      [0.00, -0.10]
    ];
    const gU = bladeGeometry(up, 0.062, (t) => Math.pow(1 - t, 0.55) * 0.90 + 0.10);
    gU.rotateZ(Math.PI / 2);
    gU.rotateY(Math.PI / 2);
    const mU = new THREE.Mesh(gU, finMembraneMat);
    mU.name = 'UpperLobeBlade';
    mU.rotation.y = Math.PI / 2;
    mU.castShadow = true;
    tailUpper.add(mU);
    tailUpper.scale.setScalar(1.16);

    // lower lobe: shorter, forward-raked
    const lo = [
      [0.00,  0.02],
      [0.22,  0.06],
      [0.44,  0.02],
      [0.56, -0.14],
      [0.40, -0.22],
      [0.18, -0.16],
      [0.00, -0.08]
    ];
    const gL = bladeGeometry(lo, 0.056, (t) => Math.pow(1 - t, 0.6) * 0.90 + 0.10);
    gL.rotateZ(-Math.PI / 2);
    gL.rotateY(Math.PI / 2);
    const mL = new THREE.Mesh(gL, finMembraneMat);
    mL.name = 'LowerLobeBlade';
    mL.rotation.y = Math.PI / 2;
    mL.castShadow = true;
    tailLower.add(mL);
    tailLower.scale.setScalar(1.10);
  }

  // Claspers / small underside detail so the belly is not featureless
  {
    const cg = new THREE.CapsuleGeometry(0.028, 0.16, 4, 8);
    cg.rotateX(Math.PI / 2);
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(cg, skinMat);
      c.name = sx < 0 ? 'ClasperL' : 'ClasperR';
      c.position.set(sx * 0.062, -0.235, -0.60);
      c.rotation.x = 0.22;
      spine1.add(c);
    }
  }

  // ---------------------------------------------------------------------
  // Cache rest transforms so the pose function can always write absolutely.
  // ---------------------------------------------------------------------
  const REST = new Map();
  root.traverse((o) => {
    REST.set(o, {
      p: o.position.clone(),
      r: o.rotation.clone(),
      s: o.scale.clone()
    });
  });
  const rest = (o) => REST.get(o);

  function setRot(o, x, y, z) {
    const r = rest(o).r;
    o.rotation.set(r.x + x, r.y + y, r.z + z);
  }
  function setPos(o, x, y, z) {
    const p = rest(o).p;
    o.position.set(p.x + x, p.y + y, p.z + z);
  }
  function setScl(o, x, y, z) {
    const s = rest(o).s;
    o.scale.set(s.x * x, s.y * y, s.z * z);
  }

  // Overall body length is ~3.9 units nose→tail-tip; the game's "body length"
  // maps onto that, and stride advances by distance.
  root.userData.bodyLength = 3.95;

  // ---------------------------------------------------------------------
  // POSE
  // ---------------------------------------------------------------------
  const TAU = Math.PI * 2;
  const clampf = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const bell = (t, c, w) => Math.exp(-Math.pow((t - c) / w, 2));

  root.userData.pose = (s) => {
    const t = s.t || 0;
    const speed = Math.max(0, s.speed || 0);
    const stride = s.stride || 0;
    const turn = clampf(s.turn || 0, -1, 1);
    const grounded = s.grounded !== false;
    const health = s.health === undefined ? 1 : clampf(s.health, 0, 1);
    const action = s.action || null;
    const phase = clampf(s.phase || 0, 0, 1);
    const hurt = 1 - health;

    // ---- reset every driven part to rest ----
    const driven = [
      torso, spine1, spine2, spine3, spine4, tailFin, tailUpper, tailLower,
      head, snout, upperJaw, lowerJaw, upperTeeth, lowerTeeth,
      dorsal, dorsal2, analFin, pecL.hinge, pecR.hinge, pelL.hinge, pelR.hinge,
      gills[0], gills[1], eyes[0].socket, eyes[1].socket, eyes[0].lid, eyes[1].lid
    ];
    for (const o of driven) {
      const r = rest(o);
      o.position.copy(r.p);
      o.rotation.copy(r.r);
      o.scale.copy(r.s);
    }
    const rr = rest(root);
    root.position.copy(rr.p);
    root.rotation.copy(rr.r);
    root.scale.copy(rr.s);

    // =====================================================================
    // ACCUMULATORS — everything is composed then written once at the end.
    // =====================================================================
    const A = {
      // body carriage
      bodyY: 0, bodyZ: 0, bodyPitch: 0, bodyRoll: 0, bodyYaw: 0,
      // undulation
      undAmp: 0, undFreq: 1, undPhase: 0, undBias: 0,
      // per-segment extra yaw
      segYaw: [0, 0, 0, 0, 0],
      segPitch: [0, 0, 0, 0, 0],
      segRoll: [0, 0, 0, 0, 0],
      // head
      headPitch: 0, headYaw: 0, headRoll: 0,
      // jaw
      jawOpen: 0,          // radians of gape on the lower jaw
      jawProtrude: 0,      // upper jaw protrusion (0..1)
      jawShake: 0,
      // fins
      pecPitch: 0, pecSpread: 0, pecCurl: 0, pecAsym: 0,
      pelPitch: 0, pelSpread: 0,
      dorsalLean: 0, dorsalFold: 0,
      tailYaw: 0, tailLobeLag: 0,
      // misc
      gillFlare: 0, eyeRoll: 0, lidClose: 0,
      breathe: 0, squash: 1
    };

    // =====================================================================
    // 1. GAIT — a shark "walks" by swimming: carangiform undulation whose
    //    amplitude grows toward the tail and whose beat frequency and body
    //    stiffness change with speed.
    // =====================================================================
    function gait() {
      const sp = speed;
      // Tail-beat cycle: driven strictly by stride so nothing skates.
      // At higher speed the wave travels tighter (shorter wavelength) and
      // the anterior body stiffens while the peduncle does the work.
      const cyclesPerStride = 1.0;
      const ph = stride * TAU * cyclesPerStride;

      if (sp < 0.02) {
        // ---- STAND: hovering in place. Sharks are never truly still —
        //      a slow sculling of the tail, breathing through the gills,
        //      pectorals holding trim, head scanning.
        const idle = t * 0.62;
        A.undAmp = 0.052;
        A.undFreq = 0.30;
        A.undPhase = idle * TAU * 0.30;
        A.breathe = 1.0;
        A.gillFlare = 0.55 + 0.45 * Math.sin(t * 1.35);
        A.bodyY = Math.sin(t * 0.55) * 0.030;
        A.bodyPitch = Math.sin(t * 0.41 + 1.1) * 0.030;
        A.bodyRoll = Math.sin(t * 0.33 + 0.4) * 0.045;
        // head scans slowly, left and right, with the snout leading
        A.headYaw = Math.sin(t * 0.37) * 0.20 + Math.sin(t * 0.13 + 2.0) * 0.09;
        A.headPitch = Math.sin(t * 0.29 + 0.8) * 0.055;
        A.headRoll = Math.sin(t * 0.23) * 0.035;
        A.eyeRoll = Math.sin(t * 0.37) * 0.5;
        // pectorals ride wide and level to hold station
        A.pecSpread = 0.34;
        A.pecPitch = 0.10 + Math.sin(t * 0.62) * 0.05;
        A.pecCurl = 0.10;
        A.pelSpread = 0.16;
        A.jawOpen = 0.055 + 0.030 * (0.5 + 0.5 * Math.sin(t * 1.35));  // ram breathing
        A.dorsalLean = Math.sin(t * 0.45) * 0.05;
        A.tailLobeLag = 0.45;
        return;
      }

      // Continuous parameters with deliberate gear changes at the sample
      // speeds the grid records.
      let amp, freq, stiff, lobeLag, pecTuck, bodyLift, headDrop, extend;

      if (sp <= 0.5) {
        // creep / stalk — long slow sweeps, body gathered, deep carriage,
        // pectorals angled down, mouth nearly shut.
        const k = sp / 0.5;
        amp = lerp(0.055, 0.115, k);
        freq = lerp(0.35, 0.72, k);
        stiff = 0.28;
        lobeLag = 0.55;
        pecTuck = 0.10;
        bodyLift = -0.055;
        headDrop = 0.055;
        extend = 0.0;
      } else if (sp <= 1.0) {
        // ordinary cruise
        const k = (sp - 0.5) / 0.5;
        amp = lerp(0.115, 0.150, k);
        freq = lerp(0.72, 1.0, k);
        stiff = lerp(0.28, 0.42, k);
        lobeLag = lerp(0.55, 0.48, k);
        pecTuck = lerp(0.10, 0.20, k);
        bodyLift = lerp(-0.055, 0.0, k);
        headDrop = lerp(0.055, 0.0, k);
        extend = 0.0;
      } else if (sp <= 2.0) {
        // GEAR CHANGE: from body-wave cruising to peduncle-driven drive.
        // The anterior stiffens hard, the beat sharpens, the fins tuck.
        const k = (sp - 1.0) / 1.0;
        amp = lerp(0.150, 0.185, k);
        freq = lerp(1.0, 1.45, k);
        stiff = lerp(0.42, 0.78, k);
        lobeLag = lerp(0.48, 0.36, k);
        pecTuck = lerp(0.20, 0.52, k);
        bodyLift = lerp(0.0, 0.02, k);
        headDrop = lerp(0.0, -0.035, k);
        extend = k * 0.35;
      } else if (sp <= 3.0) {
        const k = (sp - 2.0) / 1.0;
        amp = lerp(0.185, 0.225, k);
        freq = lerp(1.45, 1.85, k);
        stiff = lerp(0.78, 0.90, k);
        lobeLag = lerp(0.36, 0.28, k);
        pecTuck = lerp(0.52, 0.72, k);
        bodyLift = lerp(0.02, 0.03, k);
        headDrop = lerp(-0.035, -0.070, k);
        extend = lerp(0.35, 0.62, k);
      } else {
        // burst — everything longer and flatter
        const k = clampf((sp - 3.0) / 3.0, 0, 1);
        amp = lerp(0.225, 0.300, k);
        freq = lerp(1.85, 2.60, k);
        stiff = lerp(0.90, 0.98, k);
        lobeLag = lerp(0.28, 0.18, k);
        pecTuck = lerp(0.72, 0.96, k);
        bodyLift = lerp(0.03, 0.02, k);
        headDrop = lerp(-0.070, -0.105, k);
        extend = lerp(0.62, 1.0, k);
      }

      A.undAmp = amp;
      A.undFreq = freq;
      A.undPhase = ph;

      // Body wave: posterior segments swing more and lag in phase. `stiff`
      // suppresses the anterior swing so fast swimming is thunniform.
      const lagStep = lerp(0.85, 0.52, stiff);   // radians of lag per joint
      const gainAnt = lerp(1.0, 0.22, stiff);
      const segGain = [
        0.16 * gainAnt,   // torso — barely moves at speed
        0.42 * lerp(1.0, 0.55, stiff),
        0.72 * lerp(1.0, 0.80, stiff),
        1.00,
        1.35
      ];
      for (let i = 0; i < 5; i++) {
        A.segYaw[i] += Math.sin(ph - i * lagStep) * amp * segGain[i];
      }
      // The tail fin trails the peduncle — the lobe lag is what makes the
      // caudal read as a flexible foil rather than a rudder.
      A.tailYaw = Math.sin(ph - 5 * lagStep) * amp * 1.55;
      A.tailLobeLag = lobeLag;

      // Slight body roll coupled to the beat (real sharks roll a little)
      A.bodyRoll += Math.sin(ph - 1.1) * amp * 0.34 * (1 - stiff * 0.5);
      // vertical bob at twice the beat, small
      A.bodyY += Math.sin(ph * 2.0) * amp * 0.09 + bodyLift;
      A.bodyPitch += headDrop * 0.55;

      // Head counter-yaws against the first segment so the snout tracks the
      // path instead of whipping — this is what stops it looking like a sock.
      A.headYaw += -A.segYaw[0] * 0.55 - A.segYaw[1] * 0.12;
      A.headPitch += headDrop;
      A.headRoll += Math.sin(ph - 0.6) * amp * 0.20;

      // Fins: swept back and folded flat as speed rises.
      A.pecSpread = lerp(0.30, -0.28, pecTuck);
      A.pecPitch = lerp(0.12, -0.16, pecTuck);
      A.pecCurl = lerp(0.14, 0.42, pecTuck);
      // pectorals also flutter slightly out of phase for stabilization
      A.pecAsym = Math.sin(ph - 1.6) * amp * 0.55;
      A.pelSpread = lerp(0.14, -0.20, pecTuck);
      A.pelPitch = Math.sin(ph - 2.2) * amp * 0.5;
      A.dorsalLean = Math.sin(ph - 2.4) * amp * 0.62;
      A.dorsalFold = pecTuck * 0.12;

      // Gape: mouth cracks open for ram ventilation at speed.
      A.jawOpen += lerp(0.03, 0.20, clampf(sp / 6, 0, 1));
      A.gillFlare = 0.30 + 0.70 * clampf(sp / 3.0, 0, 1) * (0.6 + 0.4 * Math.sin(ph * 2));
      A.breathe = lerp(1.0, 0.25, clampf(sp / 2, 0, 1));

      // Stretch the body slightly at burst speed — it lengthens and thins.
      A.squash = lerp(1.0, 0.955, extend);
      A.bodyZ += extend * 0.02;
    }

    // =====================================================================
    // 2. TURN OVERLAY — banking, spine bend, inside pectoral braking.
    //    Only the DIFFERENCE from straight is applied here, in the spine,
    //    head and fins; the game yaws the whole body itself.
    // =====================================================================
    function turnOverlay() {
      if (Math.abs(turn) < 1e-4) return;
      const q = turn;                     // -1 left, +1 right
      const mag = Math.abs(q);

      // Spine bends INTO the turn: a steady curvature added on top of the
      // travelling wave. Negative turn (left) bends the body toward -X, and
      // in this rig a +Y rotation of a segment swings its tail to -X, so
      // for a LEFT turn the head must yaw left (-Y is... ) — resolve
      // explicitly: yawing a segment by +ry rotates everything downstream,
      // sending the tail toward +X and thus curving the body left.
      const bend = q * 0.30;
      A.segYaw[0] += bend * 0.16;
      A.segYaw[1] += bend * 0.28;
      A.segYaw[2] += bend * 0.32;
      A.segYaw[3] += bend * 0.30;
      A.segYaw[4] += bend * 0.24;
      A.tailYaw += bend * 0.30;

      // Head leads the turn hard — it aims where the body is going.
      A.headYaw += -q * 0.42;
      A.headRoll += -q * 0.16;
      A.eyeRoll += -q * 0.8;

      // BANK into the turn like an aircraft; sharks roll into tight turns.
      A.bodyRoll += q * 0.46;
      A.bodyYaw += -q * 0.10;

      // Inside pectoral drops and brakes; outside pectoral rises.
      // turn<0 (left) -> LEFT fin (sx=-1) is inside.
      A.pecAsym += -q * 0.62;
      A.pecSpread += mag * 0.10;

      // Dorsal leans out of the turn (it trails the roll)
      A.dorsalLean += q * 0.26;
      // pelvics act as the rear rudder
      A.pelPitch += q * 0.22;
    }

    // =====================================================================
    // 3. AIRBORNE — a shark out of the water. It does not swim in the air;
    //    it arcs, arches its back, thrashes the tail once, gapes and flares
    //    the gills. This is the breach.
    // =====================================================================
    function airborneOverlay() {
      if (grounded) return;
      // Kill the swimming cycle — no pedalling.
      A.undAmp *= 0.15;
      for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.18;
      A.tailYaw *= 0.25;

      const w = t * 5.2;
      // arch: the whole body curls upward, spine extended (dorsiflexed)
      A.segPitch[0] += -0.06;
      A.segPitch[1] += -0.10;
      A.segPitch[2] += -0.13;
      A.segPitch[3] += -0.15;
      A.segPitch[4] += -0.14;
      A.bodyPitch += 0.10;

      // one slow, powerful lateral thrash looking for water
      const thrash = Math.sin(w * 0.62);
      A.segYaw[2] += thrash * 0.10;
      A.segYaw[3] += thrash * 0.17;
      A.segYaw[4] += thrash * 0.24;
      A.tailYaw += thrash * 0.34;
      A.tailLobeLag = 0.62;

      // fins splay rigid — they stop being control surfaces and just hang
      A.pecSpread += 0.62;
      A.pecPitch += 0.30;
      A.pecCurl += -0.20;
      A.pelSpread += 0.36;
      A.dorsalLean += Math.sin(w * 0.5) * 0.06;

      // gaping, gills flared, eyes rolled back
      A.jawOpen += 0.34 + 0.10 * Math.sin(w * 1.1);
      A.jawProtrude += 0.20;
      A.gillFlare = 1.0;
      A.eyeRoll += 0.5;
      A.headPitch += -0.14;
      A.breathe = 0.0;
    }

    // =====================================================================
    // 4. HURT OVERLAY — favours one side, one pectoral hangs dead, the
    //    head sags, the beat becomes ragged and asymmetric.
    // =====================================================================
    function hurtOverlay() {
      if (hurt < 0.01) return;
      const h = hurt;

      // A persistent list to one side (wound on the left).
      A.bodyRoll += -0.30 * h;
      A.bodyYaw += -0.10 * h;
      A.bodyY += -0.055 * h;

      // Spine bows away from the wound and loses its clean wave.
      A.segYaw[1] += -0.10 * h;
      A.segYaw[2] += -0.07 * h;
      A.segPitch[1] += 0.07 * h;
      A.segPitch[3] += 0.10 * h;
      A.undAmp *= lerp(1.0, 0.62, h);

      // ragged tremor
      const tr = Math.sin(t * 11.0) * 0.5 + Math.sin(t * 6.3 + 1.0) * 0.5;
      A.segYaw[3] += tr * 0.035 * h;
      A.tailYaw += tr * 0.05 * h;

      // Head sags and drifts off-axis.
      A.headPitch += 0.24 * h;
      A.headYaw += -0.16 * h;
      A.headRoll += -0.14 * h;

      // Left pectoral hangs; right overworks to compensate.
      A.pecAsym += 0.55 * h;
      A.pecCurl += 0.30 * h;
      A.pecSpread += -0.10 * h;

      // Jaw hangs slightly open, gills labour, one eye half-lidded.
      A.jawOpen += 0.14 * h;
      A.gillFlare = Math.max(A.gillFlare, 0.5 + 0.5 * Math.sin(t * 2.4)) ;
      A.lidClose += 0.35 * h;
      A.dorsalFold += 0.18 * h;
      A.breathe = Math.max(A.breathe, 0.8);
    }

    // =====================================================================
    // 5. ACTIONS
    // =====================================================================
    function doAttack(p) {
      // A shark's bite: the head rears back (wind-up), the body lunges,
      // the jaws hyper-extend — upper jaw protrudes clear of the skull,
      // lower drops wide — then the bite snaps shut and it shakes.
      A.undAmp *= 0.35;
      for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.4;

      if (p < 0.26) {
        const k = smooth(p / 0.26);
        // gather: head up and back, body coiled, tail cocked
        A.headPitch += -0.34 * k;
        A.bodyPitch += -0.13 * k;
        A.bodyZ += -0.10 * k;
        A.segYaw[2] += 0.18 * k;
        A.segYaw[3] += 0.26 * k;
        A.tailYaw += 0.36 * k;
        A.jawOpen += 0.30 * k;
        A.jawProtrude += 0.15 * k;
        A.pecSpread += 0.42 * k;
        A.pecPitch += 0.34 * k;
        A.gillFlare = 0.4;
        A.lidClose += 0.25 * k;
      } else if (p < 0.44) {
        const k = smooth((p - 0.26) / 0.18);
        // GAPE — maximum, the whole snout lifts off the jaw line
        A.headPitch += lerp(-0.34, -0.52, k);
        A.bodyPitch += lerp(-0.13, -0.06, k);
        A.bodyZ += lerp(-0.10, 0.16, k);
        A.jawOpen += lerp(0.30, 1.02, k);
        A.jawProtrude += lerp(0.15, 1.0, k);
        A.segYaw[2] += lerp(0.18, -0.05, k);
        A.segYaw[3] += lerp(0.26, -0.10, k);
        A.tailYaw += lerp(0.36, -0.16, k);
        A.pecSpread += lerp(0.42, 0.10, k);
        A.pecPitch += lerp(0.34, -0.10, k);
        A.lidClose += lerp(0.25, 1.0, k);   // nictitating membrane covers
        A.gillFlare = 0.9;
      } else if (p < 0.58) {
        const k = ease((p - 0.44) / 0.14);
        // SNAP — jaws slam shut, head drives down and forward
        A.headPitch += lerp(-0.52, 0.22, k);
        A.bodyZ += lerp(0.16, 0.30, k);
        A.bodyPitch += lerp(-0.06, 0.14, k);
        A.jawOpen += lerp(1.02, 0.0, k);
        A.jawProtrude += lerp(1.0, 0.55, k);
        A.segYaw[1] += -0.06 * k;
        A.pecSpread += lerp(0.10, -0.10, k);
        A.lidClose += 1.0;
        A.gillFlare = 1.0;
      } else if (p < 0.82) {
        const k = (p - 0.58) / 0.24;
        // SHAKE — thrash the head side to side to saw through
        const sh = Math.sin(k * TAU * 2.6) * (1 - k) * (1 - k * 0.2);
        A.headYaw += sh * 0.46;
        A.headRoll += sh * 0.34;
        A.segYaw[0] += -sh * 0.12;
        A.segYaw[1] += -sh * 0.16;
        A.segYaw[2] += sh * 0.12;
        A.segYaw[3] += sh * 0.18;
        A.tailYaw += sh * 0.26;
        A.bodyRoll += sh * 0.22;
        A.bodyZ += lerp(0.30, 0.12, k);
        A.jawOpen += 0.02;
        A.jawProtrude += lerp(0.55, 0.20, k);
        A.jawShake = Math.abs(sh);
        A.lidClose += 1 - k * 0.6;
      } else {
        const k = smooth((p - 0.82) / 0.18);
        A.bodyZ += lerp(0.12, 0.0, k);
        A.headPitch += lerp(0.22, 0.0, k) * (1 - k);
        A.jawProtrude += lerp(0.20, 0.0, k);
        A.jawOpen += lerp(0.02, 0.05, k);
        A.lidClose += (1 - k) * 0.4;
        A.pecSpread += (1 - k) * 0.12;
      }
    }

    function doFire(p) {
      // No projectile organ on a shark — so this is the ram-jet spit:
      // the body plants, the head steadies and aims dead ahead, the gills
      // clamp, and it expels a hard pressurised jolt of water from the
      // gape, then absorbs the recoil. Body stays put; the muzzle steadies.
      A.undAmp *= 0.18;
      for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.22;

      if (p < 0.40) {
        const k = smooth(p / 0.40);
        // AIM: everything goes still and straight, head locks on
        A.headPitch += -0.10 * k;
        A.headYaw *= (1 - k);
        A.bodyPitch += -0.04 * k;
        A.jawOpen += 0.10 * k;
        A.jawProtrude += 0.10 * k;
        A.pecSpread += 0.40 * k;   // fins brace wide to hold station
        A.pecPitch += 0.22 * k;
        A.pelSpread += 0.26 * k;
        A.gillFlare = 0.15;
        A.squash *= lerp(1.0, 1.035, k);   // pressurised, swollen throat
        A.breathe = 0.0;
        // a fine tremor of a held aim
        A.headYaw += Math.sin(t * 24) * 0.008 * k;
      } else if (p < 0.52) {
        const k = ease((p - 0.40) / 0.12);
        // RELEASE
        A.jawOpen += lerp(0.10, 0.62, k);
        A.jawProtrude += lerp(0.10, 0.42, k);
        A.headPitch += lerp(-0.10, -0.02, k);
        A.squash *= lerp(1.035, 0.955, k);
        A.gillFlare = 1.0;
        A.bodyZ += 0.03 * k;
        A.pecSpread += 0.40;
        A.pecPitch += 0.22;
      } else if (p < 0.74) {
        const k = ease((p - 0.52) / 0.22);
        // RECOIL — driven back, head kicks up, body ripples backward
        A.bodyZ += lerp(0.03, -0.16, k);
        A.headPitch += lerp(-0.02, -0.20, k) * (1 - k * 0.4);
        A.jawOpen += lerp(0.62, 0.16, k);
        A.jawProtrude += lerp(0.42, 0.0, k);
        A.squash *= lerp(0.955, 1.0, k);
        const ripple = Math.sin(k * TAU * 1.5) * (1 - k);
        A.segPitch[1] += ripple * 0.09;
        A.segPitch[2] += ripple * 0.12;
        A.segPitch[3] += ripple * 0.14;
        A.tailYaw += Math.sin(k * TAU * 2) * (1 - k) * 0.20;
        A.pecSpread += lerp(0.40, 0.14, k);
        A.pecPitch += lerp(0.22, 0.06, k);
        A.gillFlare = 1 - k;
      } else {
        const k = smooth((p - 0.74) / 0.26);
        A.bodyZ += lerp(-0.16, 0.0, k);
        A.headPitch += lerp(-0.20, 0.0, k) * (1 - k);
        A.jawOpen += lerp(0.16, 0.05, k);
        A.pecSpread += (1 - k) * 0.14;
        A.pelSpread += (1 - k) * 0.10;
      }
    }

    function doHit(p) {
      // Sharp flinch away from the impact (taken on the left flank),
      // then a settle. Must read inside a quarter second, so all the
      // energy is in the first 35% of phase.
      const k = p;
      const impact = Math.exp(-k * 7.0);
      const ring = Math.sin(k * TAU * 3.4) * Math.exp(-k * 4.2);

      A.undAmp *= lerp(0.4, 1.0, smooth(clampf(k * 1.6, 0, 1)));

      // whole body kicked to the right (away from a left-side blow)
      A.bodyRoll += impact * 0.52 + ring * 0.14;
      A.bodyYaw += impact * 0.22;
      A.bodyY += -impact * 0.075;
      A.bodyZ += -impact * 0.075;
      A.bodyPitch += impact * 0.12;

      // spine buckles then whips
      A.segYaw[0] += impact * -0.20 + ring * 0.10;
      A.segYaw[1] += impact * -0.26 + ring * 0.14;
      A.segYaw[2] += impact * -0.16 + ring * 0.18;
      A.segYaw[3] += impact * 0.10 + ring * 0.22;
      A.segYaw[4] += impact * 0.16 + ring * 0.26;
      A.tailYaw += impact * 0.22 + ring * 0.34;
      A.segPitch[1] += impact * 0.14;
      A.segPitch[2] += impact * 0.10;

      // head snaps, jaw gapes reflexively, gills flare, eye lids slam
      A.headYaw += impact * 0.44 + ring * 0.16;
      A.headPitch += -impact * 0.30;
      A.headRoll += impact * 0.26;
      A.jawOpen += impact * 0.52;
      A.jawProtrude += impact * 0.20;
      A.lidClose += Math.min(1, impact * 1.6);
      A.gillFlare = Math.max(A.gillFlare, impact);

      // fins fling out
      A.pecSpread += impact * 0.70;
      A.pecPitch += impact * 0.34;
      A.pecAsym += impact * 0.40;
      A.pelSpread += impact * 0.40;
      A.dorsalLean += -impact * 0.30 + ring * 0.12;
      A.squash *= 1 - impact * 0.05;
    }

    function doBlock(p) {
      // A shark's armour is its head — the dense rostrum and the shoulders.
      // It turns the snout at the threat, backs off, tucks the eyes, and
      // rolls the thick of its body forward.
      A.undAmp *= 0.25;
      for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.3;

      const up = p < 0.22 ? smooth(p / 0.22)
               : p < 0.74 ? 1.0
               : 1 - smooth((p - 0.74) / 0.26);
      const holdWob = p > 0.22 && p < 0.74 ? Math.sin((p - 0.22) * 30) * 0.02 : 0;

      // weight back and down, nose angled forward as a shield
      A.bodyZ += -0.20 * up;
      A.bodyY += -0.10 * up;
      A.bodyPitch += 0.20 * up + holdWob;
      A.headPitch += 0.30 * up;      // chin tucked, forehead forward
      A.headYaw *= (1 - up * 0.8);
      A.headRoll += holdWob;

      // spine coils so the body is a compressed spring
      A.segYaw[1] += 0.12 * up;
      A.segYaw[2] += -0.14 * up;
      A.segYaw[3] += 0.16 * up;
      A.segPitch[1] += -0.10 * up;
      A.segPitch[2] += -0.08 * up;
      A.tailYaw += -0.22 * up;

      // jaws clamped shut, eyes rolled back under the lids
      A.jawOpen += -0.02 * up;
      A.jawProtrude += 0.0;
      A.lidClose += up;
      A.gillFlare = 0.1;

      // pectorals brace forward and down like a stance
      A.pecSpread += 0.30 * up;
      A.pecPitch += -0.38 * up;
      A.pecCurl += 0.30 * up;
      A.pelSpread += 0.24 * up;
      A.dorsalFold += 0.20 * up;
      A.squash *= lerp(1.0, 1.045, up);   // braced, swollen
    }

    function doGather(p) {
      // Down to the substrate, close the jaws on it, lift it clear.
      A.undAmp *= 0.35;
      for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.4;

      if (p < 0.34) {
        const k = smooth(p / 0.34);
        // descend, nose down, tail up — a shark tips almost vertical
        A.bodyPitch += 0.62 * k;
        A.bodyY += -0.30 * k;
        A.bodyZ += 0.06 * k;
        A.headPitch += 0.32 * k;
        A.segPitch[1] += 0.14 * k;
        A.segPitch[2] += 0.12 * k;
        A.jawOpen += 0.50 * k;
        A.jawProtrude += 0.30 * k;
        A.pecSpread += 0.40 * k;
        A.pecPitch += 0.44 * k;   // fins back-pedal to hold the nose down
        A.pelSpread += 0.24 * k;
        A.tailYaw += Math.sin(k * TAU) * 0.14;
      } else if (p < 0.52) {
        const k = ease((p - 0.34) / 0.18);
        // close on it
        A.bodyPitch += 0.62;
        A.bodyY += -0.30;
        A.headPitch += lerp(0.32, 0.40, k);
        A.jawOpen += lerp(0.50, -0.02, k);
        A.jawProtrude += lerp(0.30, 0.62, k);
        A.pecSpread += 0.40;
        A.pecPitch += 0.44;
        A.pelSpread += 0.24;
        A.lidClose += k * 0.8;
      } else if (p < 0.82) {
        const k = ease((p - 0.52) / 0.30);
        // lift it clear, rolling back to level
        A.bodyPitch += lerp(0.62, -0.10, k);
        A.bodyY += lerp(-0.30, 0.06, k);
        A.headPitch += lerp(0.40, -0.14, k);
        A.jawOpen += 0.02;
        A.jawProtrude += lerp(0.62, 0.18, k);
        A.segPitch[1] += lerp(0.14, -0.04, k);
        A.segPitch[2] += lerp(0.12, -0.03, k);
        A.pecSpread += lerp(0.40, 0.16, k);
        A.pecPitch += lerp(0.44, -0.08, k);
        A.tailYaw += Math.sin(k * TAU * 1.2) * 0.20 * (1 - k);
        A.lidClose += 0.8 * (1 - k);
      } else {
        const k = smooth((p - 0.82) / 0.18);
        A.bodyPitch += lerp(-0.10, 0.0, k);
        A.bodyY += lerp(0.06, 0.0, k);
        A.headPitch += lerp(-0.14, 0.0, k);
        A.jawProtrude += lerp(0.18, 0.0, k);
        A.jawOpen += 0.04;
        A.pecSpread += (1 - k) * 0.16;
      }
    }

    function doDeposit(p) {
      // Reverse of gather and deliberately slower: carry down, present,
      // release, withdraw.
      A.undAmp *= 0.30;
      for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.35;

      if (p < 0.40) {
        const k = smooth(p / 0.40);
        A.bodyPitch += 0.50 * k;
        A.bodyY += -0.26 * k;
        A.headPitch += 0.30 * k;
        A.jawOpen += 0.02;
        A.jawProtrude += 0.34 * k;
        A.segPitch[1] += 0.11 * k;
        A.pecSpread += 0.34 * k;
        A.pecPitch += 0.38 * k;
        A.pelSpread += 0.20 * k;
      } else if (p < 0.58) {
        const k = smooth((p - 0.40) / 0.18);
        // present and hold, very still
        A.bodyPitch += 0.50;
        A.bodyY += lerp(-0.26, -0.32, k);
        A.headPitch += lerp(0.30, 0.36, k);
        A.jawProtrude += 0.34;
        A.jawOpen += 0.02;
        A.pecSpread += 0.34;
        A.pecPitch += 0.38;
        A.pelSpread += 0.20;
        A.headYaw += Math.sin(k * TAU) * 0.03;
      } else if (p < 0.72) {
        const k = ease((p - 0.58) / 0.14);
        // open and let go
        A.bodyPitch += 0.50;
        A.bodyY += -0.32;
        A.headPitch += 0.36;
        A.jawOpen += lerp(0.02, 0.46, k);
        A.jawProtrude += lerp(0.34, 0.08, k);
        A.pecSpread += 0.34;
        A.pecPitch += 0.38;
      } else {
        const k = smooth((p - 0.72) / 0.28);
        // withdraw, slowly
        A.bodyPitch += lerp(0.50, 0.0, k);
        A.bodyY += lerp(-0.32, 0.0, k);
        A.bodyZ += -0.09 * Math.sin(k * Math.PI);
        A.headPitch += lerp(0.36, 0.0, k);
        A.jawOpen += lerp(0.46, 0.05, k);
        A.jawProtrude += lerp(0.08, 0.0, k);
        A.segPitch[1] += lerp(0.11, 0.0, k);
        A.pecSpread += lerp(0.34, 0.0, k);
        A.pecPitch += lerp(0.38, 0.0, k);
        A.pelSpread += lerp(0.20, 0.0, k);
      }
    }

    function doEat(p) {
      // Head down onto the source, then three full bite-and-saw cycles:
      // gape, close, shake. The teeth are the whole point, so this shows
      // them repeatedly.
      A.undAmp *= 0.3;
      for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.35;

      const inK = smooth(clampf(p / 0.16, 0, 1));
      const outK = smooth(clampf((p - 0.86) / 0.14, 0, 1));
      const down = inK * (1 - outK);

      A.bodyPitch += 0.42 * down;
      A.bodyY += -0.24 * down;
      A.headPitch += 0.30 * down;
      A.pecSpread += 0.32 * down;
      A.pecPitch += 0.34 * down;
      A.pelSpread += 0.18 * down;
      A.gillFlare = 0.5 + 0.5 * down;

      // three chew cycles across the middle of the phase
      const c0 = 0.16, c1 = 0.86;
      if (p > c0 && p < c1) {
        const u = (p - c0) / (c1 - c0);
        const cyc = u * 3.0;
        const local = cyc - Math.floor(cyc);
        // gape open on the first 40%, snap shut, saw
        let gape;
        if (local < 0.40) gape = smooth(local / 0.40);
        else if (local < 0.55) gape = 1 - ease((local - 0.40) / 0.15);
        else gape = 0;
        A.jawOpen += gape * 0.82;
        A.jawProtrude += gape * 0.70;
        A.lidClose += clampf(gape * 1.4, 0, 1);

        // saw the head side to side while closed
        if (local >= 0.55) {
          const sw = (local - 0.55) / 0.45;
          const sh = Math.sin(sw * TAU * 1.6) * (1 - sw * 0.5);
          A.headYaw += sh * 0.24;
          A.headRoll += sh * 0.18;
          A.segYaw[1] += -sh * 0.08;
          A.segYaw[3] += sh * 0.10;
          A.tailYaw += sh * 0.16;
          A.bodyRoll += sh * 0.12;
          A.bodyZ += 0.05 * Math.sin(sw * Math.PI);
          A.jawShake = Math.abs(sh);
        }
        // a small forward surge on each bite
        A.bodyZ += bell(local, 0.46, 0.09) * 0.08;
      }
    }

    function doDrink(p) {
      // A shark doesn't drink, so this is gulping at a source on the
      // bottom: it settles nose-down, holds a steady low gape and pulls
      // water through, far stiller than eating, then lifts.
      A.undAmp *= 0.18;
      for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.22;

      const inK = smooth(clampf(p / 0.24, 0, 1));
      const outK = smooth(clampf((p - 0.80) / 0.20, 0, 1));
      const down = inK * (1 - outK);

      A.bodyPitch += 0.46 * down;
      A.bodyY += -0.28 * down;
      A.headPitch += 0.26 * down;
      A.segPitch[1] += 0.08 * down;
      A.pecSpread += 0.30 * down;
      A.pecPitch += 0.36 * down;
      A.pelSpread += 0.16 * down;

      // slow rhythmic buccal pumping: jaw and gills breathe together
      const pump = 0.5 + 0.5 * Math.sin(p * TAU * 3.0 - 1.2);
      A.jawOpen += down * (0.14 + pump * 0.16);
      A.gillFlare = down * (0.35 + pump * 0.65);
      A.jawProtrude += down * 0.06 * pump;
      // almost no head movement — just a faint settle
      A.headYaw += Math.sin(p * TAU * 0.8) * 0.03 * down;
      A.bodyRoll += Math.sin(p * TAU * 0.6) * 0.03 * down;
      A.lidClose += down * 0.35;
      A.breathe = 1.0;
    }

    function doJump(p) {
      // A breach: coil low, then explode upward with the tail delivering
      // one enormous stroke. Ends committed, body reaching, extended.
      if (p < 0.34) {
        const k = smooth(p / 0.34);
        // load: body compresses, tail cocks hard to one side, nose down
        A.undAmp *= 0.3;
        for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.3;
        A.bodyY += -0.20 * k;
        A.bodyPitch += 0.28 * k;
        A.bodyZ += -0.10 * k;
        A.segYaw[2] += 0.26 * k;
        A.segYaw[3] += 0.40 * k;
        A.segYaw[4] += 0.50 * k;
        A.tailYaw += 0.66 * k;
        A.segPitch[1] += 0.14 * k;
        A.segPitch[2] += 0.16 * k;
        A.pecSpread += 0.20 * k;
        A.pecPitch += 0.26 * k;
        A.jawOpen += 0.06 * k;
        A.squash *= lerp(1.0, 1.05, k);   // coiled, compressed
        A.tailLobeLag = 0.6;
      } else if (p < 0.70) {
        const k = ease((p - 0.34) / 0.36);
        // DRIVE: the tail sweeps all the way through, body straightens
        A.bodyY += lerp(-0.20, 0.34, k);
        A.bodyPitch += lerp(0.28, -0.42, k);
        A.bodyZ += lerp(-0.10, 0.16, k);
        A.segYaw[2] += lerp(0.26, -0.24, k);
        A.segYaw[3] += lerp(0.40, -0.38, k);
        A.segYaw[4] += lerp(0.50, -0.48, k);
        A.tailYaw += lerp(0.66, -0.62, k);
        A.segPitch[1] += lerp(0.14, -0.12, k);
        A.segPitch[2] += lerp(0.16, -0.14, k);
        A.segPitch[3] += lerp(0.10, -0.16, k);
        A.headPitch += lerp(0.10, -0.30, k);
        A.pecSpread += lerp(0.20, 0.56, k);
        A.pecPitch += lerp(0.26, -0.20, k);
        A.pelSpread += 0.30 * k;
        A.jawOpen += lerp(0.06, 0.34, k);
        A.gillFlare = k;
        A.squash *= lerp(1.05, 0.95, k);
        A.tailLobeLag = 0.4;
      } else {
        const k = smooth((p - 0.70) / 0.30);
        // committed and reaching — this is where airborne takes over
        A.bodyY += lerp(0.34, 0.52, k);
        A.bodyPitch += lerp(-0.42, -0.30, k);
        A.bodyZ += lerp(0.16, 0.22, k);
        A.segPitch[1] += lerp(-0.12, -0.08, k);
        A.segPitch[2] += lerp(-0.14, -0.10, k);
        A.segPitch[3] += lerp(-0.16, -0.12, k);
        A.segYaw[3] += lerp(-0.38, -0.10, k);
        A.segYaw[4] += lerp(-0.48, -0.14, k);
        A.tailYaw += lerp(-0.62, -0.18, k);
        A.headPitch += lerp(-0.30, -0.24, k);
        A.pecSpread += lerp(0.56, 0.62, k);
        A.pecPitch += lerp(-0.20, 0.14, k);
        A.pelSpread += 0.32;
        A.jawOpen += lerp(0.34, 0.40, k);
        A.gillFlare = 1.0;
        A.squash *= lerp(0.95, 0.96, k);
      }
    }

    function doLand(p) {
      // Re-entry: reach with the head, take the shock through the whole
      // body as a travelling ripple, compress, then push back to level.
      if (p < 0.26) {
        const k = smooth(p / 0.26);
        // reach — nose down at the water, body extended, fins forward
        A.undAmp *= 0.2;
        for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.2;
        A.bodyY += lerp(0.34, 0.06, k);
        A.bodyPitch += lerp(-0.24, 0.34, k);
        A.headPitch += lerp(-0.18, 0.26, k);
        A.segPitch[1] += -0.08 * (1 - k);
        A.pecSpread += lerp(0.56, 0.30, k);
        A.pecPitch += lerp(0.10, 0.46, k);
        A.pelSpread += 0.28 * (1 - k * 0.4);
        A.jawOpen += 0.22 * (1 - k * 0.5);
        A.squash *= lerp(0.96, 1.0, k);
      } else if (p < 0.52) {
        const k = ease((p - 0.26) / 0.26);
        // IMPACT and compress — a shock wave runs nose to tail
        const comp = Math.sin(k * Math.PI);
        A.bodyY += lerp(0.06, -0.24, k) ;
        A.bodyPitch += lerp(0.34, 0.06, k);
        A.bodyZ += -0.10 * comp;
        A.headPitch += lerp(0.26, 0.22, k) + comp * 0.14;
        // ripple travels backward
        A.segPitch[0] += bell(k, 0.10, 0.14) * 0.16;
        A.segPitch[1] += bell(k, 0.26, 0.14) * 0.20;
        A.segPitch[2] += bell(k, 0.42, 0.14) * 0.22;
        A.segPitch[3] += bell(k, 0.58, 0.14) * 0.24;
        A.segPitch[4] += bell(k, 0.74, 0.14) * 0.26;
        A.segYaw[2] += Math.sin(k * TAU * 1.3) * 0.12;
        A.segYaw[3] += Math.sin(k * TAU * 1.3 - 0.6) * 0.16;
        A.tailYaw += Math.sin(k * TAU * 1.3 - 1.2) * 0.24;
        A.pecSpread += lerp(0.30, 0.48, k);
        A.pecPitch += lerp(0.46, 0.10, k);
        A.pecCurl += comp * 0.30;
        A.jawOpen += comp * 0.30;
        A.gillFlare = 1.0;
        A.squash *= 1 + comp * 0.06;
        A.bodyRoll += Math.sin(k * TAU * 0.9) * 0.14;
      } else {
        const k = smooth((p - 0.52) / 0.48);
        // recover to level, with a decaying settle
        const wob = Math.sin(k * TAU * 1.6) * (1 - k) * (1 - k);
        A.bodyY += lerp(-0.24, 0.0, k) + wob * 0.05;
        A.bodyPitch += lerp(0.06, 0.0, k) + wob * 0.07;
        A.bodyRoll += wob * 0.12;
        A.headPitch += lerp(0.22, 0.0, k) - wob * 0.10;
        A.segPitch[1] += wob * 0.06;
        A.segPitch[2] += wob * 0.05;
        A.segYaw[3] += wob * 0.10;
        A.tailYaw += wob * 0.18;
        A.pecSpread += lerp(0.48, 0.0, k);
        A.pecPitch += lerp(0.10, 0.0, k);
        A.pelSpread += lerp(0.20, 0.0, k);
        A.jawOpen += (1 - k) * 0.10;
        A.gillFlare = 1 - k * 0.6;
      }
    }

    function doSignal(p) {
      // The display: it rises, arches, throws the head back, hyperextends
      // the jaws so the whole dentition is presented, flares every gill
      // and spreads the pectorals wide — then holds — then folds down.
      A.undAmp *= 0.3;
      for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.3;

      let up;
      if (p < 0.28) up = smooth(p / 0.28);
      else if (p < 0.66) up = 1.0;
      else up = 1 - smooth((p - 0.66) / 0.34);

      const holdT = p >= 0.28 && p < 0.66 ? (p - 0.28) / 0.38 : 0;
      const shudder = holdT > 0 ? Math.sin(holdT * TAU * 4.0) * 0.6 : 0;

      // rise and arch
      A.bodyY += 0.26 * up;
      A.bodyPitch += -0.34 * up;
      A.bodyZ += 0.04 * up;
      A.segPitch[1] += -0.14 * up;
      A.segPitch[2] += -0.16 * up;
      A.segPitch[3] += -0.14 * up;
      A.segPitch[4] += -0.10 * up;
      A.headPitch += -0.46 * up + shudder * 0.03;

      // full gape, jaws thrown forward — the teeth ARE the signal
      A.jawOpen += (0.95 + shudder * 0.05) * up;
      A.jawProtrude += (0.92 + shudder * 0.06) * up;
      A.jawShake = Math.abs(shudder) * up;

      // everything spreads
      A.pecSpread += 0.86 * up;
      A.pecPitch += 0.28 * up;
      A.pecCurl += -0.34 * up;
      A.pelSpread += 0.52 * up;
      A.dorsalLean += shudder * 0.05 * up;
      A.dorsalFold += -0.22 * up;      // dorsal erects
      A.gillFlare = up;
      A.lidClose += 0.0;
      A.eyeRoll += shudder * 0.4;

      // slow side-to-side sweep of the whole display
      const sweep = Math.sin(p * TAU * 0.9);
      A.bodyYaw += sweep * 0.10 * up;
      A.headYaw += sweep * 0.16 * up;
      A.segYaw[1] += -sweep * 0.05 * up;
      A.tailYaw += -sweep * 0.20 * up;
      A.squash *= lerp(1.0, 1.06, up);
    }

    function doSleep(p) {
      // Settling to the bottom, the way a nurse shark does: the body sinks,
      // rolls slightly onto one side, the tail curls around, the fins fold,
      // the gape drops to a slow pump and then almost stops. Ends at rest.
      const k = smooth(p);
      const down = k;

      A.undAmp *= (1 - k) * 0.5;
      for (let i = 0; i < 5; i++) A.segYaw[i] *= (1 - k) * 0.6;

      // sink and settle
      A.bodyY += -0.30 * down;
      A.bodyPitch += 0.12 * down;
      A.bodyRoll += 0.34 * down;    // lists onto its right side
      A.bodyZ += -0.06 * down;

      // spine curls into a comma
      A.segYaw[1] += 0.16 * down;
      A.segYaw[2] += 0.24 * down;
      A.segYaw[3] += 0.30 * down;
      A.segYaw[4] += 0.32 * down;
      A.tailYaw += 0.36 * down;
      A.segPitch[1] += 0.06 * down;
      A.segPitch[2] += 0.05 * down;
      A.segRoll[1] += 0.08 * down;
      A.segRoll[2] += 0.10 * down;

      // head lowers and turns
      A.headPitch += 0.26 * down;
      A.headYaw += 0.18 * down;
      A.headRoll += -0.16 * down;

      // fins fold in
      A.pecSpread += -0.34 * down;
      A.pecPitch += -0.22 * down;
      A.pecCurl += 0.44 * down;
      A.pelSpread += -0.26 * down;
      A.dorsalFold += 0.30 * down;

      // eyes close, breathing slows to a buccal pump
      A.lidClose += down;
      const slowPump = 0.5 + 0.5 * Math.sin(t * 0.9);
      A.jawOpen += down * (0.06 + slowPump * 0.09);
      A.gillFlare = down * slowPump * 0.8 + (1 - down) * A.gillFlare;
      A.breathe = 1.0;
      // last faint life at full sleep
      A.bodyY += -Math.sin(t * 0.5) * 0.012 * down;
    }

    function doWake(p) {
      // Comes up out of the sleep pose and lands exactly on standing.
      const k = smooth(p);
      const down = 1 - k;   // how much of the sleep pose is left

      // start from the sleep pose
      A.undAmp = lerp(0.02, 0.052, k);
      A.undFreq = 0.30;
      A.undPhase = t * TAU * 0.30;

      A.bodyY += -0.30 * down;
      A.bodyPitch += 0.12 * down;
      A.bodyRoll += 0.34 * down;
      A.bodyZ += -0.06 * down;
      A.segYaw[1] += 0.16 * down;
      A.segYaw[2] += 0.24 * down;
      A.segYaw[3] += 0.30 * down;
      A.segYaw[4] += 0.32 * down;
      A.tailYaw += 0.36 * down;
      A.segPitch[1] += 0.06 * down;
      A.segRoll[1] += 0.08 * down;
      A.segRoll[2] += 0.10 * down;
      A.headPitch += 0.26 * down;
      A.headYaw += 0.18 * down;
      A.headRoll += -0.16 * down;
      A.pecSpread += -0.34 * down;
      A.pecPitch += -0.22 * down;
      A.pecCurl += 0.44 * down;
      A.pelSpread += -0.26 * down;
      A.dorsalFold += 0.30 * down;
      A.lidClose += down;

      // THE STIR — a first twitch, then a push, then the settle
      if (p < 0.22) {
        const j = p / 0.22;
        const twitch = Math.sin(j * TAU * 1.5) * (1 - j);
        A.segYaw[3] += twitch * 0.08;
        A.segYaw[4] += twitch * 0.10;
        A.tailYaw += twitch * 0.14;
        A.lidClose -= j * 0.25;                 // eyes crack open
        A.gillFlare = Math.max(A.gillFlare, j * 0.5);
      } else if (p < 0.60) {
        const j = (p - 0.22) / 0.38;
        // the push: a big lateral sweep that lifts it off the bottom
        const push = Math.sin(j * Math.PI);
        A.segYaw[2] += -push * 0.16;
        A.segYaw[3] += -push * 0.24;
        A.segYaw[4] += -push * 0.30;
        A.tailYaw += -push * 0.40;
        A.bodyY += push * 0.12;
        A.bodyZ += push * 0.06;
        A.pecSpread += push * 0.34;
        A.pecPitch += push * 0.20;
        A.headPitch += -push * 0.16;
        A.gillFlare = Math.max(A.gillFlare, 0.5 + 0.5 * push);
        A.jawOpen += push * 0.16;
      } else {
        const j = (p - 0.60) / 0.40;
        const settle = Math.sin(j * TAU * 1.2) * (1 - j) * (1 - j);
        A.bodyRoll += settle * 0.08;
        A.bodyY += settle * 0.03;
        A.headYaw += settle * 0.10;
        A.tailYaw += settle * 0.14;
        A.pecSpread += (1 - j) * 0.16;
        A.gillFlare = 0.55 + 0.45 * Math.sin(t * 1.35);
        A.jawOpen += (1 - j) * 0.05;
      }
      A.breathe = 1.0;
    }

    function doDie(p) {
      // The death of a shark: a violent thrashing spasm, then the drive
      // fails, it rolls belly-up, sinks nose-first, and the last of it is
      // a slack body with a hanging jaw. It stays down.
      A.undAmp = 0;
      for (let i = 0; i < 5; i++) A.segYaw[i] = 0;

      if (p < 0.20) {
        // SPASM — the last burst, whole body convulses
        const k = p / 0.20;
        const env = 1 - k * 0.35;
        const w = Math.sin(k * TAU * 3.2);
        const w2 = Math.sin(k * TAU * 4.7 + 1.0);
        A.segYaw[1] += w * 0.20 * env;
        A.segYaw[2] += w2 * 0.26 * env;
        A.segYaw[3] += w * 0.34 * env;
        A.segYaw[4] += w2 * 0.40 * env;
        A.tailYaw += w * 0.52 * env;
        A.segPitch[2] += w2 * 0.12 * env;
        A.segPitch[3] += w * 0.14 * env;
        A.headYaw += -w * 0.30 * env;
        A.headPitch += -0.24 * env + w2 * 0.10;
        A.bodyRoll += w2 * 0.30 * env;
        A.bodyY += -0.05 * k;
        A.jawOpen += 0.55 * env + w * 0.15;
        A.jawProtrude += 0.35 * env;
        A.gillFlare = 1.0;
        A.pecSpread += 0.70 * env;
        A.pecPitch += w * 0.30 * env;
        A.pelSpread += 0.44 * env;
        A.lidClose += 0.2;
        A.squash *= 1 + 0.03 * Math.abs(w);
      } else if (p < 0.52) {
        const k = (p - 0.20) / 0.32;
        const ek = ease(k);
        // the roll: it turns belly-up as buoyancy takes over from control
        const dying = 1 - ek;
        const w = Math.sin(k * TAU * 1.6) * dying * dying;
        A.bodyRoll += lerp(0.0, 2.10, ek) + w * 0.20;   // ~120°, going over
        A.bodyPitch += lerp(-0.05, 0.20, ek);
        A.bodyY += lerp(-0.05, -0.30, ek);
        A.segYaw[1] += w * 0.14;
        A.segYaw[2] += w * 0.16 + lerp(0, 0.10, ek);
        A.segYaw[3] += w * 0.18 + lerp(0, 0.14, ek);
        A.segYaw[4] += w * 0.20 + lerp(0, 0.16, ek);
        A.tailYaw += w * 0.26 + lerp(0, 0.20, ek);
        A.segPitch[1] += lerp(0, 0.10, ek);
        A.segPitch[2] += lerp(0, 0.12, ek);
        A.segPitch[3] += lerp(0, 0.14, ek);
        A.headPitch += lerp(-0.24, 0.30, ek);
        A.headYaw += w * 0.18;
        A.headRoll += lerp(0, -0.20, ek);
        A.jawOpen += lerp(0.55, 0.30, ek);
        A.jawProtrude += lerp(0.35, 0.10, ek);
        A.pecSpread += lerp(0.70, 0.30, ek);
        A.pecPitch += lerp(0.0, -0.30, ek);
        A.pecCurl += ek * 0.30;
        A.pelSpread += lerp(0.44, 0.12, ek);
        A.lidClose += lerp(0.2, 0.9, ek);
        A.gillFlare = 1 - ek;
        A.dorsalFold += ek * 0.30;
      } else if (p < 0.80) {
        const k = (p - 0.52) / 0.28;
        const ek = ease(k);
        // the sink: nose-first, inverted, going slack
        const twitch = Math.exp(-k * 5.0) * Math.sin(k * TAU * 3.0);
        A.bodyRoll += lerp(2.10, Math.PI, ek) + twitch * 0.06;
        A.bodyPitch += lerp(0.20, 0.46, ek);
        A.bodyY += lerp(-0.30, -0.62, ek);
        A.bodyZ += lerp(0.0, -0.06, ek);
        A.segYaw[2] += 0.10 + twitch * 0.05;
        A.segYaw[3] += 0.14 + twitch * 0.06;
        A.segYaw[4] += 0.16 + twitch * 0.07;
        A.tailYaw += lerp(0.20, 0.26, ek) + twitch * 0.10;
        A.segPitch[1] += lerp(0.10, 0.14, ek);
        A.segPitch[2] += lerp(0.12, 0.16, ek);
        A.segPitch[3] += lerp(0.14, 0.18, ek);
        A.segPitch[4] += lerp(0.0, 0.10, ek);
        A.headPitch += lerp(0.30, 0.42, ek);
        A.headRoll += -0.20;
        A.headYaw += 0.10 * ek;
        A.jawOpen += lerp(0.30, 0.46, ek);   // the jaw falls open and stays
        A.jawProtrude += lerp(0.10, 0.0, ek);
        A.pecSpread += lerp(0.30, 0.10, ek);
        A.pecPitch += lerp(-0.30, -0.44, ek);
        A.pecCurl += lerp(0.30, 0.46, ek);
        A.pelSpread += lerp(0.12, 0.0, ek);
        A.lidClose += lerp(0.9, 1.0, ek);
        A.gillFlare = 0;
        A.dorsalFold += lerp(0.30, 0.42, ek);
      } else {
        const k = (p - 0.80) / 0.20;
        // the wreck: down, inverted, jaw hanging. Nothing loops.
        const rest0 = Math.exp(-k * 6.0) * Math.sin(k * TAU * 1.6) * 0.04;
        A.bodyRoll += Math.PI + rest0;
        A.bodyPitch += 0.46;
        A.bodyY += -0.62;
        A.bodyZ += -0.06;
        A.segYaw[2] += 0.10;
        A.segYaw[3] += 0.14;
        A.segYaw[4] += 0.16 + rest0 * 0.5;
        A.tailYaw += 0.26 + rest0;
        A.segPitch[1] += 0.14;
        A.segPitch[2] += 0.16;
        A.segPitch[3] += 0.18;
        A.segPitch[4] += 0.10;
        A.headPitch += 0.42;
        A.headRoll += -0.20;
        A.headYaw += 0.10;
        A.jawOpen += 0.46;
        A.pecSpread += 0.10;
        A.pecPitch += -0.44;
        A.pecCurl += 0.46;
        A.lidClose += 1.0;
        A.gillFlare = 0;
        A.dorsalFold += 0.42;
        A.breathe = 0;
      }
    }

    function doEvolve(p) {
      // The body braces rigid, then opens along its seams — the jaws
      // hyperextend, the gill slits gape apart, the dorsal erects and the
      // fins fan — it holds at the peak, straining, then closes down.
      A.undAmp *= 0.2;
      for (let i = 0; i < 5; i++) A.segYaw[i] *= 0.2;

      let open;
      if (p < 0.30) open = smooth(p / 0.30);
      else if (p < 0.68) open = 1.0;
      else open = 1 - smooth((p - 0.68) / 0.32);

      // BRACE first: before opening it compresses hard
      const brace = p < 0.30 ? Math.sin((p / 0.30) * Math.PI) * (1 - p / 0.30) : 0;
      const strain = p >= 0.30 && p < 0.68
        ? Math.sin((p - 0.30) / 0.38 * TAU * 5.0) * 0.5 + Math.sin((p - 0.30) / 0.38 * TAU * 11.0) * 0.25
        : 0;

      A.bodyY += -0.10 * brace + 0.14 * open;
      A.bodyZ += -0.06 * brace;
      A.bodyPitch += 0.12 * brace - 0.20 * open;
      A.bodyRoll += strain * 0.03 * open;
      A.squash *= lerp(1.0, 1.10, open) * (1 + brace * 0.04);

      // spine extends, arching backward, every joint straining
      A.segPitch[1] += -0.12 * open + strain * 0.012;
      A.segPitch[2] += -0.14 * open + strain * 0.014;
      A.segPitch[3] += -0.13 * open + strain * 0.016;
      A.segPitch[4] += -0.10 * open + strain * 0.018;
      A.segYaw[2] += strain * 0.020 * open;
      A.segYaw[3] += strain * 0.024 * open;
      A.segYaw[4] += strain * 0.028 * open;
      A.tailYaw += strain * 0.040 * open;

      // head thrown back, jaws hyperextended wide open
      A.headPitch += -0.40 * open + strain * 0.02;
      A.jawOpen += (0.98 + strain * 0.04) * open;
      A.jawProtrude += (1.0) * open;
      A.jawShake = Math.abs(strain) * open * 0.6;

      // the seams open: gills flare fully, fins fan out and lock
      A.gillFlare = open;
      A.pecSpread += 0.92 * open;
      A.pecPitch += 0.20 * open + strain * 0.02;
      A.pecCurl += -0.40 * open;
      A.pelSpread += 0.60 * open;
      A.dorsalFold += -0.28 * open;
      A.dorsalLean += strain * 0.02 * open;
      A.lidClose += open * 0.85;
      A.eyeRoll += strain * 0.3;
      A.breathe = 0;
    }

    // --------------------- composition order ---------------------
    gait();

    switch (action) {
      case 'attack':  doAttack(phase);  break;
      case 'fire':    doFire(phase);    break;
      case 'hit':     doHit(phase);     break;
      case 'block':   doBlock(phase);   break;
      case 'gather':  doGather(phase);  break;
      case 'deposit': doDeposit(phase); break;
      case 'eat':     doEat(phase);     break;
      case 'drink':   doDrink(phase);   break;
      case 'jump':    doJump(phase);    break;
      case 'land':    doLand(phase);    break;
      case 'signal':  doSignal(phase);  break;
      case 'sleep':   doSleep(phase);   break;
      case 'wake':    doWake(phase);    break;
      case 'die':     doDie(phase);     break;
      case 'evolve':  doEvolve(phase);  break;
      default: break;
    }

    // Overlays: turn and hurt ride on top of everything; airborne
    // suppresses the gait but not the action (a jump ends airborne).
    if (action !== 'die' && action !== 'sleep') turnOverlay();
    if (!grounded && action !== 'die') airborneOverlay();
    if (action !== 'die') hurtOverlay();

    // =====================================================================
    // WRITE THE POSE
    // =====================================================================

    // ---- root carriage ----
    root.position.set(rr.p.x, rr.p.y + A.bodyY, rr.p.z + A.bodyZ);
    root.rotation.set(rr.r.x + A.bodyPitch, rr.r.y + A.bodyYaw, rr.r.z + A.bodyRoll);
    const sq = A.squash;
    root.scale.set(rr.s.x * (2 - sq) * 0.5 + rr.s.x * 0.5, rr.s.y * sq, rr.s.z * (2 - sq * 0.5) / 1.5 + rr.s.z / 3);
    // keep it simple and safe: uniform-ish volume preserving stretch
    root.scale.set(rr.s.x * (2 - sq), rr.s.y * sq, rr.s.z * (1 + (1 - sq) * 1.2));

    // ---- spine chain ----
    for (let i = 0; i < 5; i++) {
      const n = spineNodes[i];
      setRot(n, A.segPitch[i], A.segYaw[i], A.segRoll[i]);
    }

    // Breathing: the torso swells slightly. Written as scale on the torso
    // mesh's own node so the joints are untouched.
    const br = 1 + Math.sin(t * 1.35) * 0.016 * A.breathe;
    setScl(torso, br, br * (1 + Math.sin(t * 1.35 + 0.4) * 0.010 * A.breathe), 1);

    // ---- tail fin ----
    setRot(tailFin, 0, A.tailYaw * 0.55, 0);
    // The two lobes trail the peduncle by different amounts — the upper
    // lobe is longer and flexes more, which is the whole heterocercal read.
    const lobeDrive = A.tailYaw;
    setRot(tailUpper, 0, lobeDrive * A.tailLobeLag * 1.10, lobeDrive * 0.10);
    setRot(tailLower, 0, lobeDrive * A.tailLobeLag * 0.66, -lobeDrive * 0.06);

    // ---- head ----
    setRot(head, A.headPitch, A.headYaw, A.headRoll);
    // the rostrum flexes a hair with the head, and shivers on a shake
    setRot(snout, A.headPitch * 0.16 + A.jawShake * 0.02,
                  A.headYaw * 0.12, A.headRoll * 0.10);

    // ---- jaws ----
    // jawOpen is expressed in radians of lower-jaw drop; the upper jaw
    // rotates up a little AND, crucially, protrudes forward and down out
    // of the skull the way a lamnid's does when it bites.
    const gape = clampf(A.jawOpen, -0.05, 1.15);
    const prot = clampf(A.jawProtrude, 0, 1.05);

    setRot(lowerJaw, gape * 0.82 + A.jawShake * 0.02, A.jawShake * 0.03, 0);
    setPos(lowerJaw, 0, -gape * 0.035, -gape * 0.030);

    setRot(upperJaw, -gape * 0.22 - prot * 0.10, 0, 0);
    setPos(upperJaw, 0, -prot * 0.085, prot * 0.115);

    // Tooth rows: the functional row erects as the jaw opens (the
    // replacement rows behind it rotate up too, but less), which is what
    // makes the dentition read as rows of blades rather than a printed
    // texture.
    const erect = clampf(gape * 0.55 + prot * 0.45, 0, 1.1);
    for (const rowsHolder of [upperTeeth, lowerTeeth]) {
      const isUpper = rowsHolder === upperTeeth;
      const rows = rowsHolder.children;
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const rrst = REST.get(row);
        if (!rrst) continue;
        // row 0 stands fully; rows 1 and 2 stay more folded back
        const w = ri === 0 ? 1.0 : ri === 1 ? 0.55 : 0.30;
        row.rotation.set(
          rrst.r.x - erect * 0.30 * w,
          rrst.r.y,
          rrst.r.z + (isUpper ? 1 : -1) * A.jawShake * 0.02 * w
        );
        row.position.copy(rrst.p);
        const ts = 1 + erect * 0.04 * w;
        row.scale.set(rrst.s.x * ts, rrst.s.y * ts, rrst.s.z * ts);
      }
    }

    // ---- eyes and nictitating lids ----
    for (const e of eyes) {
      const er = REST.get(e.socket);
      e.socket.rotation.set(
        er.r.x + A.headPitch * -0.10,
        er.r.y + A.eyeRoll * 0.22 * e.sx * -1 + A.headYaw * -0.20,
        er.r.z
      );
      const lc = clampf(A.lidClose, 0, 1);
      const lr = REST.get(e.lid);
      // the membrane sweeps up across the eye
      e.lid.rotation.set(lr.r.x - lc * Math.PI, lr.r.y, lr.r.z);
      e.lid.position.set(lr.p.x, lerp(-eyeRadius * 1.02, eyeRadius * 0.02, lc), lr.p.z);
      e.lid.scale.set(1, 1, 1);
    }

    // ---- gills ----
    const gf = clampf(A.gillFlare, 0, 1);
    for (let gi = 0; gi < gills.length; gi++) {
      const holder = gills[gi];
      const sx = gi === 0 ? -1 : 1;
      const hr = REST.get(holder);
      holder.rotation.copy(hr.r);
      holder.position.copy(hr.p);
      for (let k = 0; k < holder.children.length; k++) {
        const slit = holder.children[k];
        const sr = REST.get(slit);
        if (!sr) continue;
        // slits open in a travelling wave front-to-back
        const wave = 0.5 + 0.5 * Math.sin(t * 2.6 - k * 0.7);
        const o = gf * (0.35 + 0.65 * wave);
        slit.position.set(sr.p.x + sx * o * 0.028, sr.p.y, sr.p.z);
        slit.rotation.set(sr.r.x, sr.r.y + sx * o * 0.18, sr.r.z);
        slit.scale.set(sr.s.x * (1 + o * 2.4), sr.s.y * (1 + o * 0.06), sr.s.z);
      }
    }

    // ---- fins ----
    // Pectorals: spread (dihedral), pitch (angle of attack), curl (sweep),
    // asym (differential roll control for turns and injury).
    for (const p of pectorals) {
      const h = p.hinge, sx = p.sx;
      const hr = REST.get(h);
      const asym = A.pecAsym * (sx < 0 ? 1 : -1);
      h.rotation.set(
        hr.r.x + A.pecPitch + asym * 0.26,
        hr.r.y + sx * -A.pecCurl,
        hr.r.z + sx * -A.pecSpread + asym * 0.30
      );
      h.position.copy(hr.p);
      h.scale.copy(hr.s);
    }
    for (const p of pelvics) {
      const h = p.hinge, sx = p.sx;
      const hr = REST.get(h);
      h.rotation.set(
        hr.r.x + A.pelPitch * (sx < 0 ? 1 : -1) * 0.5 + A.pelPitch * 0.5,
        hr.r.y + sx * -A.pecCurl * 0.4,
        hr.r.z + sx * -A.pelSpread
      );
    }

    setRot(dorsal, 0, 0, A.dorsalLean);
    setScl(dorsal, 1, clampf(1 - A.dorsalFold, 0.5, 1.4), 1);
    setRot(dorsal2, 0, 0, A.dorsalLean * 0.8);
    setScl(dorsal2, 1, clampf(1 - A.dorsalFold * 0.6, 0.5, 1.4), 1);
    setRot(analFin, 0, 0, A.dorsalLean * 0.6);
  };

  // Fallback clock animation (a lazy cruise) for hosts that only drive update.
  let _acc = 0;
  root.userData.update = (t, dt) => {
    _acc += (dt || 0) * 0.32;
    root.userData.pose({
      t: t || 0, dt: dt || 0.016,
      speed: 1.0, stride: _acc % 1, turn: 0,
      grounded: true, health: 1, action: null, phase: 0
    });
  };

  // Neutral rest pose on creation.
  root.userData.pose({
    t: 0, dt: 0.016, speed: 0, stride: 0, turn: 0,
    grounded: true, health: 1, action: null, phase: 0
  });

  return root;
}