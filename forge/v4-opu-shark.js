function build(THREE, TSL) {
  const root = new THREE.Group();
  root.name = 'Shark';

  // ---------------------------------------------------------------- helpers
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- palette
  const SKIN_TOP = new THREE.Color(0x4a5a68);
  const SKIN_MID = new THREE.Color(0x8d9aa6);
  const SKIN_LOW = new THREE.Color(0xe8e6df);
  const TOOTH_C = new THREE.Color(0xfdfcf4);
  const GUM_C = new THREE.Color(0xb0555c);
  const MOUTH_C = new THREE.Color(0x40151c);

  // ------------------------------------------------------- shark skin shader
  // Counter-shaded hide with dermal-denticle speckle + fine ripple.
  function makeSkin(opts) {
    const o = opts || {};
    const m = new THREE.MeshStandardNodeMaterial({
      roughness: 0.62,
      metalness: 0.04,
      side: o.side || THREE.FrontSide,
    });

    const topC = TSL.vec3(SKIN_TOP.r, SKIN_TOP.g, SKIN_TOP.b);
    const midC = TSL.vec3(SKIN_MID.r, SKIN_MID.g, SKIN_MID.b);
    const lowC = TSL.vec3(SKIN_LOW.r, SKIN_LOW.g, SKIN_LOW.b);

    const bias = TSL.float(o.bias === undefined ? 0.0 : o.bias);
    const scale = TSL.float(o.scale === undefined ? 1.0 : o.scale);

    const hash3 = TSL.Fn(([p]) => {
      const q = p.mul(TSL.vec3(127.1, 311.7, 74.7));
      return TSL.fract(TSL.sin(TSL.dot(q, TSL.vec3(12.9898, 78.233, 45.164))).mul(43758.5453));
    });

    m.colorNode = TSL.Fn(() => {
      // world-ish up from the object normal + local height => counter-shade
      const n = TSL.normalLocal.normalize();
      const h = TSL.positionLocal.y.mul(scale).add(bias);
      // vertical gradient driven both by height and by facing-up
      const up = n.y.mul(0.5).add(0.5);
      const g = TSL.clamp(h.mul(0.55).add(0.5).mul(0.55).add(up.mul(0.45)), 0.0, 1.0);

      const base = TSL.mix(
        lowC,
        TSL.mix(midC, topC, TSL.smoothstep(0.5, 0.92, g)),
        TSL.smoothstep(0.18, 0.62, g)
      );

      // hard-ish counter-shade break line, like a real shark's flank seam
      const seam = TSL.smoothstep(0.36, 0.46, g);
      const shaded = TSL.mix(base.mul(1.03), base.mul(0.94), seam);

      // denticle speckle
      const cell = TSL.floor(TSL.positionLocal.mul(46.0));
      const sp = hash3(cell);
      const speck = TSL.smoothstep(0.72, 1.0, sp).mul(0.09);

      // long ripple bands along the body
      const band = TSL.sin(TSL.positionLocal.z.mul(9.0).add(TSL.positionLocal.y.mul(3.0)))
        .mul(0.5)
        .add(0.5)
        .mul(0.035);

      // subtle wet rim
      const rim = TSL.pow(
        TSL.oneMinus(
          TSL.clamp(TSL.dot(TSL.normalWorld.normalize(), TSL.normalize(TSL.cameraPosition.sub(TSL.positionWorld))), 0.0, 1.0)
        ),
        3.0
      ).mul(0.13);

      return shaded.add(speck).sub(band).add(rim);
    })();

    m.roughnessNode = TSL.Fn(() => {
      const n = TSL.normalLocal.normalize();
      const up = n.y.mul(0.5).add(0.5);
      return TSL.clamp(TSL.float(0.72).sub(up.mul(0.22)), 0.28, 0.85);
    })();

    return m;
  }

  const skinMat = makeSkin({ scale: 1.0 });
  const finMat = makeSkin({ scale: 2.0, bias: -0.15, side: THREE.DoubleSide });

  const toothMat = new THREE.MeshStandardNodeMaterial({
    color: TOOTH_C,
    roughness: 0.22,
    metalness: 0.0,
  });
  toothMat.colorNode = TSL.Fn(() => {
    const base = TSL.vec3(TOOTH_C.r, TOOTH_C.g, TOOTH_C.b);
    // tip brighter, root yellowed
    const t = TSL.clamp(TSL.positionLocal.y.mul(2.4).add(0.35), 0.0, 1.0);
    const root = TSL.vec3(0.86, 0.79, 0.62);
    return TSL.mix(root, base, TSL.smoothstep(0.1, 0.75, t));
  })();

  const gumMat = new THREE.MeshStandardNodeMaterial({
    color: GUM_C,
    roughness: 0.5,
    metalness: 0.0,
  });

  const mouthMat = new THREE.MeshStandardNodeMaterial({
    color: MOUTH_C,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const tongueMat = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0x8c3a44),
    roughness: 0.55,
  });

  const eyeMat = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0x05070a),
    roughness: 0.12,
    metalness: 0.25,
  });
  eyeMat.emissiveNode = TSL.Fn(() => {
    const n = TSL.normalLocal.normalize();
    const spec = TSL.pow(TSL.clamp(n.z.mul(0.4).add(n.y.mul(0.6)), 0.0, 1.0), 8.0);
    return TSL.vec3(0.5, 0.55, 0.62).mul(spec).mul(0.5);
  })();

  const eyeRingMat = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0xd8d4c8),
    roughness: 0.6,
  });

  const gillMat = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0x2b3238),
    roughness: 0.9,
    side: THREE.DoubleSide,
  });

  const noseMat = new THREE.MeshStandardNodeMaterial({
    color: new THREE.Color(0x2a3238),
    roughness: 0.8,
  });

  // ------------------------------------------------------- body cross-section
  // Shark trunk: rounded-triangular, deeper than wide, keeled belly.
  // profile(z) -> {halfWidth, halfHeight, centerY}
  const BODY_FRONT = 1.62; // snout tip z
  const BODY_BACK = -1.86; // caudal peduncle z

  function girth(z) {
    // normalized 0 at tail joint .. 1 at snout
    const u = clamp((z - BODY_BACK) / (BODY_FRONT - BODY_BACK), 0, 1);
    // peak girth just behind the pectorals (u ~ 0.62)
    const shoulder = Math.exp(-Math.pow((u - 0.63) / 0.30, 2));
    const tailTaper = Math.pow(clamp(u / 0.24, 0, 1), 0.85);
    const snoutTaper = Math.pow(clamp((1.0 - u) / 0.20, 0, 1), 0.62);
    const g = (0.30 + 0.72 * shoulder) * tailTaper * (0.28 + 0.72 * snoutTaper);
    return g;
  }

  function profileAt(z) {
    const g = girth(z);
    const u = clamp((z - BODY_BACK) / (BODY_FRONT - BODY_BACK), 0, 1);
    const hw = g * 0.44;
    const hh = g * 0.56 * (1.0 + 0.10 * Math.exp(-Math.pow((u - 0.55) / 0.25, 2)));
    // dorsal ridge rises a touch mid-body; belly hangs lower amidships
    const cy = -0.02 + 0.10 * Math.exp(-Math.pow((u - 0.30) / 0.35, 2)) * 0.4;
    return { hw, hh, cy, u };
  }

  // Superellipse ring: flatter belly, rounded back, slight ventral keel.
  function ringPoint(z, a) {
    const p = profileAt(z);
    const c = Math.cos(a);
    const s = Math.sin(a);
    // exponent varies with vertical position: back rounder, belly flatter
    const n = 2.0 + 0.55 * clamp(-s, 0, 1) + 0.10 * clamp(s, 0, 1);
    const sx = Math.sign(c) * Math.pow(Math.abs(c), 2.0 / n);
    const sy = Math.sign(s) * Math.pow(Math.abs(s), 2.0 / n);
    let x = sx * p.hw;
    let y = sy * p.hh + p.cy;
    // dorsal ridge slight peak
    y += 0.05 * p.hh * Math.pow(clamp(s, 0, 1), 3);
    // head flattening: snout is wedge-shaped, wider than tall near the tip
    if (p.u > 0.80) {
      const k = smooth(0.80, 1.0, p.u);
      x *= 1.0 + 0.35 * k;
      y *= 1.0 - 0.30 * k;
      y -= 0.055 * k; // snout points slightly down (overbite)
    }
    return new THREE.Vector3(x, y, z);
  }

  function buildTrunk(z0, z1, segZ, segA, closeFront, closeBack) {
    const geo = new THREE.BufferGeometry();
    const pos = [];
    const nrm = [];
    const uvs = [];
    const idx = [];
    const rings = [];

    for (let i = 0; i <= segZ; i++) {
      const t = i / segZ;
      // denser sampling near the snout
      const tt = Math.pow(t, 1.0);
      const z = lerp(z0, z1, tt);
      const ring = [];
      for (let j = 0; j < segA; j++) {
        const a = (j / segA) * TAU;
        ring.push(ringPoint(z, a));
      }
      rings.push({ z, ring });
    }

    // vertices
    for (let i = 0; i <= segZ; i++) {
      const R = rings[i].ring;
      for (let j = 0; j <= segA; j++) {
        const jj = j % segA;
        const v = R[jj];
        pos.push(v.x, v.y, v.z);
        // normal by finite differences on the ring + along z
        const vA = R[(jj + 1) % segA];
        const vB = R[(jj - 1 + segA) % segA];
        const tangA = new THREE.Vector3().subVectors(vA, vB);
        const iN = Math.min(segZ, i + 1);
        const iP = Math.max(0, i - 1);
        const tangZ = new THREE.Vector3().subVectors(rings[iN].ring[jj], rings[iP].ring[jj]);
        const n = new THREE.Vector3().crossVectors(tangZ, tangA).normalize();
        // outward check
        const outward = new THREE.Vector3(v.x, v.y - profileAt(v.z).cy, 0);
        if (n.dot(outward) < 0) n.negate();
        nrm.push(n.x, n.y, n.z);
        uvs.push(j / segA, i / segZ);
      }
    }

    const stride = segA + 1;
    for (let i = 0; i < segZ; i++) {
      for (let j = 0; j < segA; j++) {
        const a = i * stride + j;
        const b = a + stride;
        idx.push(a, b, a + 1);
        idx.push(a + 1, b, b + 1);
      }
    }

    // caps
    if (closeFront) {
      const cIdx = pos.length / 3;
      const zc = rings[segZ].z;
      pos.push(0, profileAt(zc).cy, zc + 0.02);
      nrm.push(0, 0, 1);
      uvs.push(0.5, 1);
      for (let j = 0; j < segA; j++) {
        const a = segZ * stride + j;
        idx.push(a, a + 1, cIdx);
      }
    }
    if (closeBack) {
      const cIdx = pos.length / 3;
      const zc = rings[0].z;
      pos.push(0, profileAt(zc).cy, zc - 0.02);
      nrm.push(0, 0, -1);
      uvs.push(0.5, 0);
      for (let j = 0; j < segA; j++) {
        const a = j;
        idx.push(a + 1, a, cIdx);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    return geo;
  }

  // ------------------------------------------------------- fin blade builder
  // A swept, tapered, cambered blade. Origin at root (0,0,0), spans +Y.
  function buildFin(cfg) {
    const {
      span = 1.0,
      rootChord = 0.6,
      tipChord = 0.12,
      sweep = 0.45, // how far back the tip goes (-Z)
      thickness = 0.09,
      segS = 14,
      segC = 10,
      curveBack = 0.0, // trailing edge concavity
      dihedral = 0.0, // tip lift in +X (used before rotation)
      camber = 0.0,
    } = cfg;

    const geo = new THREE.BufferGeometry();
    const pos = [];
    const nrm = [];
    const uvs = [];
    const idx = [];

    const pts = []; // [s][c] -> Vector3 mid-surface
    for (let i = 0; i <= segS; i++) {
      const s = i / segS;
      const y = span * s;
      const chord = lerp(rootChord, tipChord, Math.pow(s, 0.72));
      const back = -sweep * Math.pow(s, 1.25);
      const xoff = dihedral * Math.pow(s, 1.6);
      const row = [];
      for (let j = 0; j <= segC; j++) {
        const c = j / segC; // 0 leading (+Z) .. 1 trailing (-Z)
        // trailing edge concavity: pull the aft part further back near the root
        const conc = curveBack * Math.sin(Math.PI * c) * (1 - s) * 0.5;
        const z = back + chord * (0.5 - c) - conc;
        const cam = camber * Math.sin(Math.PI * c) * Math.pow(s, 0.5);
        row.push(new THREE.Vector3(xoff + cam, y, z));
      }
      pts.push(row);
    }

    function thickAt(s, c) {
      const tp = Math.sin(Math.PI * Math.pow(c, 0.72));
      return thickness * tp * (1 - 0.72 * Math.pow(s, 1.1));
    }

    // two shells
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? 1 : -1;
      const base = pos.length / 3;
      for (let i = 0; i <= segS; i++) {
        for (let j = 0; j <= segC; j++) {
          const p = pts[i][j];
          const th = thickAt(i / segS, j / segC);
          pos.push(p.x + sgn * th, p.y, p.z);
          nrm.push(sgn, 0, 0);
          uvs.push(j / segC, i / segS);
        }
      }
      const st = segC + 1;
      for (let i = 0; i < segS; i++) {
        for (let j = 0; j < segC; j++) {
          const a = base + i * st + j;
          const b = a + st;
          if (sgn > 0) {
            idx.push(a, b, a + 1, a + 1, b, b + 1);
          } else {
            idx.push(a, a + 1, b, a + 1, b + 1, b);
          }
        }
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // ================================================================= SKELETON
  // Spine chain: every segment pivots at its joint so the body can undulate.
  // root -> Body -> Spine1 -> Spine2 -> Spine3 -> Peduncle -> TailFin
  //   Body also carries Head (which carries the jaws) and the fins.

  const body = new THREE.Group();
  body.name = 'Body';
  body.position.set(0, 0, 0);
  root.add(body);

  // Trunk shell (from tail joint forward to base of head)
  const TRUNK_FRONT = 0.62; // where the head group takes over
  const trunkMesh = new THREE.Mesh(buildTrunk(BODY_BACK, TRUNK_FRONT, 40, 26, false, false), skinMat);
  trunkMesh.name = 'TrunkShell';
  body.add(trunkMesh);

  // ---- spine chain aft of the trunk (each is a short shell of its own) -----
  const SPINE_Z = [BODY_BACK, -1.34, -0.92, -0.46];
  // We already drew the whole trunk on `body` for a seamless silhouette; the
  // aft chain drives deformation of that shell via a vertex-follow shader-free
  // approach: instead, the aft chain owns its own sleeve meshes and the trunk
  // shell is trimmed. Simpler and fully riggable: rebuild trunk to stop at
  // spine1 and give each spine link its own sleeve.
  body.remove(trunkMesh);
  trunkMesh.geometry.dispose();

  const SPINE1_Z = -0.42;
  const SPINE2_Z = -0.92;
  const SPINE3_Z = -1.34;
  const PEDUNCLE_Z = -1.70;

  const trunk = new THREE.Mesh(buildTrunk(SPINE1_Z - 0.012, TRUNK_FRONT, 30, 26, false, false), skinMat);
  trunk.name = 'TrunkShell';
  body.add(trunk);

  const spine1 = new THREE.Group();
  spine1.name = 'Spine1';
  spine1.position.set(0, 0, SPINE1_Z);
  body.add(spine1);
  {
    const g = buildTrunk(SPINE2_Z - 0.012, SPINE1_Z + 0.012, 12, 26, false, false);
    g.translate(0, 0, -SPINE1_Z);
    const m = new THREE.Mesh(g, skinMat);
    m.name = 'Spine1Shell';
    spine1.add(m);
  }

  const spine2 = new THREE.Group();
  spine2.name = 'Spine2';
  spine2.position.set(0, 0, SPINE2_Z - SPINE1_Z);
  spine1.add(spine2);
  {
    const g = buildTrunk(SPINE3_Z - 0.012, SPINE2_Z + 0.012, 10, 26, false, false);
    g.translate(0, 0, -SPINE2_Z);
    const m = new THREE.Mesh(g, skinMat);
    m.name = 'Spine2Shell';
    spine2.add(m);
  }

  const spine3 = new THREE.Group();
  spine3.name = 'Spine3';
  spine3.position.set(0, 0, SPINE3_Z - SPINE2_Z);
  spine2.add(spine3);
  {
    const g = buildTrunk(PEDUNCLE_Z - 0.012, SPINE3_Z + 0.012, 8, 26, false, false);
    g.translate(0, 0, -SPINE3_Z);
    const m = new THREE.Mesh(g, skinMat);
    m.name = 'Spine3Shell';
    spine3.add(m);
  }

  const peduncle = new THREE.Group();
  peduncle.name = 'Peduncle';
  peduncle.position.set(0, 0, PEDUNCLE_Z - SPINE3_Z);
  spine3.add(peduncle);
  {
    const g = buildTrunk(BODY_BACK, PEDUNCLE_Z + 0.012, 8, 26, false, true);
    g.translate(0, 0, -PEDUNCLE_Z);
    const m = new THREE.Mesh(g, skinMat);
    m.name = 'PeduncleShell';
    peduncle.add(m);

    // lateral caudal keels
    const keelG = new THREE.BoxGeometry(0.30, 0.035, 0.10);
    for (const sgn of [-1, 1]) {
      const k = new THREE.Mesh(keelG, skinMat);
      k.name = sgn < 0 ? 'CaudalKeelL' : 'CaudalKeelR';
      k.position.set(sgn * 0.095, -0.01, -0.10);
      k.rotation.z = sgn * 0.05;
      peduncle.add(k);
    }
  }

  // ================================================================== TAIL FIN
  // Heterocercal caudal fin — big upper lobe, short lower lobe.
  const tailFin = new THREE.Group();
  tailFin.name = 'TailFin';
  tailFin.position.set(0, 0, BODY_BACK - PEDUNCLE_Z);
  peduncle.add(tailFin);

  const tailUpper = new THREE.Group();
  tailUpper.name = 'TailLobeUpper';
  tailUpper.position.set(0, 0.03, 0);
  tailFin.add(tailUpper);
  {
    const g = buildFin({
      span: 0.98,
      rootChord: 0.44,
      tipChord: 0.19,
      sweep: 0.60,
      thickness: 0.055,
      curveBack: 0.20,
      segS: 18,
      segC: 12,
    });
    const m = new THREE.Mesh(g, finMat);
    m.name = 'TailLobeUpperBlade';
    m.rotation.x = -0.20;
    tailUpper.add(m);
  }

  const tailLower = new THREE.Group();
  tailLower.name = 'TailLobeLower';
  tailLower.position.set(0, -0.02, 0);
  tailFin.add(tailLower);
  {
    const g = buildFin({
      span: 0.50,
      rootChord: 0.40,
      tipChord: 0.13,
      sweep: 0.20,
      thickness: 0.05,
      curveBack: 0.26,
      segS: 12,
      segC: 10,
    });
    g.rotateZ(Math.PI); // point down
    const m = new THREE.Mesh(g, finMat);
    m.name = 'TailLobeLowerBlade';
    m.rotation.x = 0.10;
    tailLower.add(m);
  }

  // =============================================================== DORSAL FINS
  const dorsalFin = new THREE.Group();
  dorsalFin.name = 'DorsalFin';
  dorsalFin.position.set(0, 0.30, -0.02);
  body.add(dorsalFin);
  {
    const g = buildFin({
      span: 0.66,
      rootChord: 0.68,
      tipChord: 0.10,
      sweep: 0.46,
      thickness: 0.055,
      curveBack: 0.22,
      segS: 16,
      segC: 12,
    });
    const m = new THREE.Mesh(g, finMat);
    m.name = 'DorsalFinBlade';
    dorsalFin.add(m);
  }

  const dorsalFin2 = new THREE.Group();
  dorsalFin2.name = 'DorsalFin2';
  dorsalFin2.position.set(0, 0.17, 0.06);
  spine3.add(dorsalFin2);
  {
    const g = buildFin({
      span: 0.19,
      rootChord: 0.22,
      tipChord: 0.05,
      sweep: 0.16,
      thickness: 0.03,
      curveBack: 0.12,
      segS: 8,
      segC: 8,
    });
    const m = new THREE.Mesh(g, finMat);
    m.name = 'DorsalFin2Blade';
    dorsalFin2.add(m);
  }

  const analFin = new THREE.Group();
  analFin.name = 'AnalFin';
  analFin.position.set(0, -0.16, 0.02);
  spine3.add(analFin);
  {
    const g = buildFin({
      span: 0.17,
      rootChord: 0.22,
      tipChord: 0.05,
      sweep: 0.15,
      thickness: 0.03,
      curveBack: 0.12,
      segS: 8,
      segC: 8,
    });
    g.rotateZ(Math.PI);
    const m = new THREE.Mesh(g, finMat);
    m.name = 'AnalFinBlade';
    analFin.add(m);
  }

  // ============================================================ PECTORAL FINS
  function makePectoral(sgn, name) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(sgn * 0.20, -0.16, 0.30);
    const blade = new THREE.Mesh(
      buildFin({
        span: 0.86,
        rootChord: 0.50,
        tipChord: 0.09,
        sweep: 0.52,
        thickness: 0.048,
        curveBack: 0.24,
        camber: 0.05,
        segS: 16,
        segC: 12,
      }),
      finMat
    );
    blade.name = name + 'Blade';
    g.add(blade);
    // rest orientation: swept out and slightly down/back
    g.rotation.set(0, 0, sgn * (Math.PI / 2 - 0.20));
    g.rotation.y = 0;
    g.userData.rest = g.rotation.clone();
    return g;
  }
  const pecL = makePectoral(-1, 'PectoralL');
  const pecR = makePectoral(1, 'PectoralR');
  body.add(pecL, pecR);

  // ============================================================== PELVIC FINS
  function makePelvic(sgn, name) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(sgn * 0.10, -0.15, 0.02);
    const blade = new THREE.Mesh(
      buildFin({
        span: 0.30,
        rootChord: 0.24,
        tipChord: 0.06,
        sweep: 0.20,
        thickness: 0.032,
        curveBack: 0.14,
        segS: 10,
        segC: 8,
      }),
      finMat
    );
    blade.name = name + 'Blade';
    g.add(blade);
    g.rotation.set(0, 0, sgn * (Math.PI / 2 + 0.55));
    g.userData.rest = g.rotation.clone();
    return g;
  }
  const pelL = makePelvic(-1, 'PelvicL');
  const pelR = makePelvic(1, 'PelvicR');
  spine2.add(pelL, pelR);

  // ==================================================================== GILLS
  const gills = new THREE.Group();
  gills.name = 'Gills';
  gills.position.set(0, 0, 0);
  body.add(gills);
  {
    const slitShape = new THREE.Shape();
    slitShape.moveTo(0, 0);
    slitShape.bezierCurveTo(0.02, 0.10, 0.02, 0.20, 0.0, 0.30);
    slitShape.bezierCurveTo(-0.014, 0.20, -0.014, 0.10, 0, 0);
    const slitGeo = new THREE.ShapeGeometry(slitShape, 10);

    for (const sgn of [-1, 1]) {
      const side = new THREE.Group();
      side.name = sgn < 0 ? 'GillsL' : 'GillsR';
      gills.add(side);
      for (let i = 0; i < 5; i++) {
        const z = 0.50 - i * 0.085;
        const p = profileAt(z);
        const slit = new THREE.Mesh(slitGeo, gillMat);
        slit.name = (sgn < 0 ? 'GillSlitL' : 'GillSlitR') + i;
        const yc = p.cy + 0.02;
        slit.position.set(sgn * (p.hw * 0.94), yc - 0.14 - i * 0.006, z);
        slit.rotation.y = sgn * Math.PI * 0.5;
        slit.rotation.z = sgn * -0.12 - 0.04 * i * sgn;
        slit.scale.setScalar(1.0 - i * 0.05);
        side.add(slit);
      }
    }
  }

  // ===================================================================== HEAD
  // Head group pivots at the base of the skull so it can swing and nod.
  const head = new THREE.Group();
  head.name = 'Head';
  head.position.set(0, 0, TRUNK_FRONT);
  body.add(head);

  // head shell, continuing the trunk profile forward to the snout
  {
    const g = buildTrunk(TRUNK_FRONT - 0.012, BODY_FRONT, 22, 26, true, false);
    g.translate(0, 0, -TRUNK_FRONT);
    const m = new THREE.Mesh(g, skinMat);
    m.name = 'HeadShell';
    head.add(m);
  }

  // conical snout tip cap for a proper pointed nose
  {
    const p = profileAt(BODY_FRONT);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.10, 18, 12), skinMat);
    tip.name = 'SnoutTip';
    tip.position.set(0, p.cy - 0.01, BODY_FRONT - TRUNK_FRONT + 0.01);
    tip.scale.set(1.35, 0.72, 1.05);
    head.add(tip);
  }

  // nostrils
  for (const sgn of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), noseMat);
    n.name = sgn < 0 ? 'NostrilL' : 'NostrilR';
    n.position.set(sgn * 0.085, -0.035, BODY_FRONT - TRUNK_FRONT - 0.10);
    n.scale.set(1.5, 0.55, 1.0);
    head.add(n);
  }

  // ampullae of Lorenzini — speckled pores on the snout
  {
    const pores = new THREE.Group();
    pores.name = 'Ampullae';
    head.add(pores);
    const poreGeo = new THREE.SphereGeometry(0.011, 6, 5);
    const poreMat = new THREE.MeshStandardNodeMaterial({ color: 0x39424a, roughness: 0.9 });
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 64; i++) {
      const z = lerp(0.80, 1.56, rnd());
      const a = lerp(-1.35, 1.35, rnd());
      const p = profileAt(z);
      const pt = ringPoint(z, Math.PI + a * 0.9);
      const m = new THREE.Mesh(poreGeo, poreMat);
      m.position.set(pt.x * 1.01, pt.y * 1.01, z - TRUNK_FRONT);
      pores.add(m);
      void p;
    }
  }

  // ------------------------------------------------------------------- EYES
  function makeEye(sgn) {
    const g = new THREE.Group();
    g.name = sgn < 0 ? 'EyeL' : 'EyeR';
    const z = 1.10;
    const pt = ringPoint(z, Math.PI * 0.06);
    g.position.set(sgn * (pt.x * 0.0 + profileAt(z).hw * 0.90), profileAt(z).cy + 0.055, z - TRUNK_FRONT);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 8, 20), eyeRingMat);
    ring.name = (sgn < 0 ? 'EyeL' : 'EyeR') + 'Ring';
    ring.rotation.y = sgn * Math.PI * 0.5;
    ring.scale.set(1.0, 0.85, 1.0);
    g.add(ring);

    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), eyeMat);
    ball.name = (sgn < 0 ? 'EyeL' : 'EyeR') + 'Ball';
    ball.position.x = sgn * 0.008;
    ball.scale.set(0.75, 0.92, 1.0);
    g.add(ball);

    // nictitating membrane (a lid that can sweep across)
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), skinMat);
    lid.name = (sgn < 0 ? 'EyeL' : 'EyeR') + 'Lid';
    lid.position.x = sgn * 0.004;
    lid.rotation.z = sgn * -0.2;
    lid.rotation.x = Math.PI; // parked below, sweeps up
    lid.scale.set(0.9, 1.0, 1.0);
    g.add(lid);
    g.userData.lid = lid;

    return g;
  }
  const eyeL = makeEye(-1);
  const eyeR = makeEye(1);
  head.add(eyeL, eyeR);

  // ============================================================== JAWS & TEETH
  // Jaw pivot sits well back under the eyes so the mouth opens like a real
  // shark's — the whole snout lifts, the lower jaw drops and protrudes.
  const JAW_PIVOT_Z = 0.90 - TRUNK_FRONT;
  const JAW_PIVOT_Y = -0.055;

  const jawUpper = new THREE.Group();
  jawUpper.name = 'JawUpper';
  jawUpper.position.set(0, JAW_PIVOT_Y, JAW_PIVOT_Z);
  head.add(jawUpper);

  const jawLower = new THREE.Group();
  jawLower.name = 'JawLower';
  jawLower.position.set(0, JAW_PIVOT_Y, JAW_PIVOT_Z);
  head.add(jawLower);

  // --- mouth arch curve: parabolic, matching the snout underside ------------
  // Returns a point on the tooth-row arch. t: -1 (left corner) .. 1 (right).
  const MOUTH_HALF_WIDTH = 0.235;
  const MOUTH_FRONT_Z = 0.60; // relative to jaw pivot
  const MOUTH_BACK_Z = -0.02;

  function archPoint(t, widen) {
    const w = MOUTH_HALF_WIDTH * (widen === undefined ? 1 : widen);
    const x = t * w;
    const z = lerp(MOUTH_FRONT_Z, MOUTH_BACK_Z, t * t);
    return new THREE.Vector2(x, z);
  }
  function archTangent(t) {
    const d = 0.02;
    const a = archPoint(clamp(t - d, -1, 1));
    const b = archPoint(clamp(t + d, -1, 1));
    return new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
  }

  // --- a single tooth: triangular, serrated edges, sharp point --------------
  function buildTooth(h, w, thick, serrations, curveBack) {
    const pos = [];
    const idx = [];
    const rows = 9;
    // outline half-width at height s (0 root .. 1 tip), concave sides = sharper
    const halfW = (s) => (w * 0.5) * Math.pow(1 - s, 0.78) * (1 - 0.10 * Math.sin(Math.PI * s));
    const zc = (s) => -curveBack * Math.pow(s, 1.8);
    const thickAt = (s) => thick * Math.pow(1 - s, 0.55);

    // build as a lens: for each row, left edge -> front -> right edge -> back
    const ringN = 8;
    const ringsPts = [];
    for (let i = 0; i <= rows; i++) {
      const s = i / rows;
      const hw = halfW(s);
      const th = thickAt(s);
      const y = h * s;
      const z0 = zc(s);
      const ring = [];
      for (let j = 0; j < ringN; j++) {
        const a = (j / ringN) * TAU;
        // elliptical cross-section, flattened front/back with knife edges at ±x
        const ex = Math.cos(a);
        const ez = Math.sin(a);
        // serration: notch the ±x knife edges
        let serr = 1.0;
        if (serrations > 0) {
          const edge = Math.pow(Math.abs(ex), 6);
          serr = 1.0 - 0.14 * edge * (0.5 + 0.5 * Math.cos(s * Math.PI * serrations * 2));
        }
        ring.push(new THREE.Vector3(ex * hw * serr, y, z0 + ez * th));
      }
      ringsPts.push(ring);
    }
    for (const ring of ringsPts) for (const p of ring) pos.push(p.x, p.y, p.z);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < ringN; j++) {
        const a = i * ringN + j;
        const a2 = i * ringN + ((j + 1) % ringN);
        const b = a + ringN;
        const b2 = a2 + ringN;
        idx.push(a, b, a2, a2, b, b2);
      }
    }
    // sharp apex
    const apex = pos.length / 3;
    pos.push(0, h * 1.06, zc(1.0));
    for (let j = 0; j < ringN; j++) {
      const a = rows * ringN + j;
      const a2 = rows * ringN + ((j + 1) % ringN);
      idx.push(a, apex, a2);
    }
    // root cap
    const rootC = pos.length / 3;
    pos.push(0, -h * 0.06, 0);
    for (let j = 0; j < ringN; j++) {
      idx.push(j + 0, ((j + 1) % ringN), rootC);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  const toothBigGeo = buildTooth(0.115, 0.085, 0.020, 7, 0.010);
  const toothMidGeo = buildTooth(0.090, 0.068, 0.017, 6, 0.012);
  const toothSmallGeo = buildTooth(0.062, 0.050, 0.014, 5, 0.014);
  const toothTinyGeo = buildTooth(0.040, 0.034, 0.010, 4, 0.012);

  function pickToothGeo(scaleSel) {
    if (scaleSel > 0.85) return toothBigGeo;
    if (scaleSel > 0.62) return toothMidGeo;
    if (scaleSel > 0.40) return toothSmallGeo;
    return toothTinyGeo;
  }

  // --- a full tooth row along the arch, plus a second replacement row -------
  function buildToothRow(parent, opts) {
    const {
      count = 15,
      yBase = 0,
      dir = -1, // -1 teeth point down (upper jaw), +1 point up (lower jaw)
      rows = 2,
      name = 'ToothRow',
      widen = 1.0,
      sizeScale = 1.0,
      lean = 0.16,
    } = opts;

    const rowGroup = new THREE.Group();
    rowGroup.name = name;
    parent.add(rowGroup);

    for (let r = 0; r < rows; r++) {
      const rowN = new THREE.Group();
      rowN.name = name + 'Rank' + r;
      rowGroup.add(rowN);
      const back = r * 0.055;
      const shrink = 1 - r * 0.30;
      const n = count - r * 2;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
        const p = archPoint(t, widen * (1 - r * 0.10));
        const tang = archTangent(t);
        // front teeth largest, corner teeth small
        const sel = (1 - Math.pow(Math.abs(t), 1.35)) * shrink * sizeScale;
        const geo = pickToothGeo(sel);
        const m = new THREE.Mesh(geo, toothMat);
        m.name = name + '_' + r + '_' + i;
        m.position.set(p.x, yBase + dir * 0.004 * r, p.y - dir * 0 + (dir < 0 ? back * 0.4 : back * 0.4) * -1);
        // orient: teeth point along `dir` in Y, splayed outward, leaning back
        const outAngle = Math.atan2(tang.x, -tang.y); // normal of the arch
        m.rotation.order = 'YXZ';
        m.rotation.y = -outAngle;
        const leanBack = lean + 0.28 * Math.pow(Math.abs(t), 2) + r * 0.42;
        if (dir < 0) {
          m.rotation.z = Math.PI; // flip to point down
          m.rotation.x = leanBack;
        } else {
          m.rotation.x = -leanBack;
        }
        const s = lerp(0.55, 1.06, clamp(sel, 0, 1)) * (1 - r * 0.12);
        m.scale.setScalar(s);
        rowN.add(m);
      }
    }
    return rowGroup;
  }

  // ---- upper jaw structure -------------------------------------------------
  {
    // palate / gum arch, an extruded band following the mouth curve
    const gumPts = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * 2 - 1;
      const p = archPoint(t, 1.02);
      gumPts.push(new THREE.Vector3(p.x, 0, p.y));
    }
    const gumCurve = new THREE.CatmullRomCurve3(gumPts);
    const gumGeo = new THREE.TubeGeometry(gumCurve, 40, 0.042, 10, false);
    const gum = new THREE.Mesh(gumGeo, gumMat);
    gum.name = 'UpperGum';
    gum.position.y = 0.012;
    gum.scale.y = 0.85;
    jawUpper.add(gum);

    buildToothRow(jawUpper, {
      count: 17,
      yBase: -0.012,
      dir: -1,
      rows: 2,
      name: 'UpperTeeth',
      widen: 0.98,
      sizeScale: 1.0,
      lean: 0.14,
    });

    // upper lip / snout underside skin flap so the arch reads as a mouth
    const lipShape = new THREE.Shape();
    lipShape.moveTo(-MOUTH_HALF_WIDTH * 1.30, MOUTH_BACK_Z - 0.10);
    lipShape.quadraticCurveTo(-MOUTH_HALF_WIDTH * 1.30, MOUTH_FRONT_Z + 0.16, 0, MOUTH_FRONT_Z + 0.16);
    lipShape.quadraticCurveTo(MOUTH_HALF_WIDTH * 1.30, MOUTH_FRONT_Z + 0.16, MOUTH_HALF_WIDTH * 1.30, MOUTH_BACK_Z - 0.10);
    lipShape.lineTo(MOUTH_HALF_WIDTH * 1.05, MOUTH_BACK_Z - 0.10);
    lipShape.quadraticCurveTo(MOUTH_HALF_WIDTH * 1.02, MOUTH_FRONT_Z + 0.02, 0, MOUTH_FRONT_Z + 0.03);
    lipShape.quadraticCurveTo(-MOUTH_HALF_WIDTH * 1.02, MOUTH_FRONT_Z + 0.02, -MOUTH_HALF_WIDTH * 1.05, MOUTH_BACK_Z - 0.10);
    lipShape.lineTo(-MOUTH_HALF_WIDTH * 1.30, MOUTH_BACK_Z - 0.10);
    const lipGeo = new THREE.ExtrudeGeometry(lipShape, { depth: 0.05, bevelEnabled: false });
    lipGeo.rotateX(Math.PI / 2);
    const lip = new THREE.Mesh(lipGeo, skinMat);
    lip.name = 'UpperLip';
    lip.position.y = 0.055;
    jawUpper.add(lip);
  }

  // ---- lower jaw structure -------------------------------------------------
  {
    // mandible: a solid U bar the teeth sit on
    const mandPts = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * 2 - 1;
      const p = archPoint(t, 0.94);
      mandPts.push(new THREE.Vector3(p.x, 0, p.y));
    }
    const mandCurve = new THREE.CatmullRomCurve3(mandPts);
    const mandGeo = new THREE.TubeGeometry(mandCurve, 40, 0.052, 10, false);
    const mand = new THREE.Mesh(mandGeo, skinMat);
    mand.name = 'Mandible';
    mand.scale.y = 0.95;
    jawLower.add(mand);

    const lgumGeo = new THREE.TubeGeometry(mandCurve, 40, 0.036, 10, false);
    const lgum = new THREE.Mesh(lgumGeo, gumMat);
    lgum.name = 'LowerGum';
    lgum.position.y = 0.028;
    lgum.scale.y = 0.8;
    jawLower.add(lgum);

    buildToothRow(jawLower, {
      count: 15,
      yBase: 0.040,
      dir: 1,
      rows: 2,
      name: 'LowerTeeth',
      widen: 0.90,
      sizeScale: 0.86,
      lean: 0.10,
    });

    // throat / chin floor so the open mouth has a body
    const chinShape = new THREE.Shape();
    chinShape.moveTo(-MOUTH_HALF_WIDTH * 1.05, MOUTH_BACK_Z - 0.14);
    chinShape.quadraticCurveTo(-MOUTH_HALF_WIDTH * 1.05, MOUTH_FRONT_Z + 0.06, 0, MOUTH_FRONT_Z + 0.07);
    chinShape.quadraticCurveTo(MOUTH_HALF_WIDTH * 1.05, MOUTH_FRONT_Z + 0.06, MOUTH_HALF_WIDTH * 1.05, MOUTH_BACK_Z - 0.14);
    chinShape.lineTo(-MOUTH_HALF_WIDTH * 1.05, MOUTH_BACK_Z - 0.14);
    const chinGeo = new THREE.ExtrudeGeometry(chinShape, { depth: 0.075, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
    chinGeo.rotateX(Math.PI / 2);
    const chin = new THREE.Mesh(chinGeo, skinMat);
    chin.name = 'Chin';
    chin.position.y = -0.012;
    jawLower.add(chin);

    // dark mouth interior floor
    const cavShape = new THREE.Shape();
    cavShape.moveTo(-MOUTH_HALF_WIDTH * 0.86, MOUTH_BACK_Z - 0.10);
    cavShape.quadraticCurveTo(-MOUTH_HALF_WIDTH * 0.86, MOUTH_FRONT_Z - 0.02, 0, MOUTH_FRONT_Z - 0.01);
    cavShape.quadraticCurveTo(MOUTH_HALF_WIDTH * 0.86, MOUTH_FRONT_Z - 0.02, MOUTH_HALF_WIDTH * 0.86, MOUTH_BACK_Z - 0.10);
    cavShape.lineTo(-MOUTH_HALF_WIDTH * 0.86, MOUTH_BACK_Z - 0.10);
    const cavGeo = new THREE.ShapeGeometry(cavShape, 12);
    cavGeo.rotateX(Math.PI / 2);
    const cav = new THREE.Mesh(cavGeo, mouthMat);
    cav.name = 'MouthFloor';
    cav.position.y = 0.028;
    jawLower.add(cav);

    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.10, 14, 10), tongueMat);
    tongue.name = 'Tongue';
    tongue.position.set(0, 0.045, 0.13);
    tongue.scale.set(1.05, 0.35, 1.9);
    jawLower.add(tongue);
  }

  // dark throat behind the jaws so an open mouth reads as a hole
  {
    const throat = new THREE.Mesh(new THREE.SphereGeometry(0.20, 16, 12), mouthMat);
    throat.name = 'Throat';
    throat.position.set(0, JAW_PIVOT_Y + 0.02, JAW_PIVOT_Z + 0.08);
    throat.scale.set(1.1, 0.75, 1.0);
    head.add(throat);
  }

  // ---- store rest transforms for everything we animate ---------------------
  const REST = new Map();
  root.traverse((o) => {
    REST.set(o, {
      p: o.position.clone(),
      q: o.quaternion.clone(),
      s: o.scale.clone(),
      r: o.rotation.clone(),
    });
  });
  function rest(o) {
    return REST.get(o);
  }
  function resetAll() {
    for (const [o, r] of REST) {
      o.position.copy(r.p);
      o.rotation.copy(r.r);
      o.scale.copy(r.s);
    }
  }

  // gather the tooth meshes for the "bare the teeth" flourish
  const upperTeethRanks = [];
  const lowerTeethRanks = [];
  root.traverse((o) => {
    if (o.name && o.name.startsWith('UpperTeethRank')) upperTeethRanks.push(o);
    if (o.name && o.name.startsWith('LowerTeethRank')) lowerTeethRanks.push(o);
  });

  const finGroups = { pecL, pecR, pelL, pelR };

  // ================================================================== POSING
  const spineChain = [spine1, spine2, spine3, peduncle];

  // The shark's cycle: a travelling wave of yaw down the spine.
  // Amplitude grows toward the tail; frequency and amplitude scale with speed.
  function applySwim(s, ampScale, phaseOffset) {
    const sp = s.speed;
    const stride = s.stride;
    const ph = stride * TAU + (phaseOffset || 0);

    // amplitude profile: head barely moves, tail sweeps hard
    const baseAmp = (0.030 + 0.115 * smooth(0, 3.2, sp)) * ampScale;
    const idleAmp = 0.022 * ampScale; // sculling even when "still"
    const idleWave = Math.sin(s.t * 1.05);

    // body/head counter-yaw (recoil from tail thrust)
    const headYaw = -Math.sin(ph + 1.05) * (baseAmp * 0.55 + idleAmp * 0.5 * 0) - idleWave * idleAmp * 0.35;

    const linkAmp = [0.55, 0.95, 1.45, 1.85];
    const linkLag = [0.0, -0.62, -1.24, -1.86];

    for (let i = 0; i < spineChain.length; i++) {
      const g = spineChain[i];
      const a = Math.sin(ph + linkLag[i]) * baseAmp * linkAmp[i] + idleWave * idleAmp * linkAmp[i] * 0.35;
      g.rotation.y += a;
      // slight roll coupling makes it feel like a fish, not a hinge
      g.rotation.z += a * 0.14;
    }

    // caudal fin whips a beat behind the peduncle
    const tailA = Math.sin(ph + linkLag[3] - 0.55) * baseAmp * 1.5 + idleWave * idleAmp * 0.7;
    tailFin.rotation.y += tailA;
    tailUpper.rotation.y += tailA * 0.35;
    tailLower.rotation.y += tailA * 0.45;
    tailUpper.rotation.x += rest(tailUpper).r.x * 0 + Math.sin(ph + 0.4) * 0.06 * ampScale;
    tailLower.rotation.x += Math.sin(ph + 0.9) * 0.05 * ampScale;

    return headYaw;
  }

  function applyPectoralIdle(s, gain) {
    const sp = s.speed;
    // At speed the pectorals sweep back and flatten; at rest they flare and scull.
    const sweepBack = smooth(0.5, 6, sp);
    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      const scull = Math.sin(s.t * 1.35 + (sgn > 0 ? 0.4 : 0)) * 0.10 * (1 - sweepBack * 0.8) * gain;
      g.rotation.set(
        r.x - 0.30 * sweepBack + scull * 0.5,
        r.y - sgn * 0.42 * sweepBack,
        r.z + sgn * (0.16 * sweepBack) + scull * sgn * 0.6
      );
    }
    for (const [g, sgn] of [[pelL, -1], [pelR, 1]]) {
      const r = rest(g).r;
      const f = Math.sin(s.t * 1.1 + (sgn > 0 ? 0.8 : 0.2)) * 0.07 * gain;
      g.rotation.set(r.x - 0.14 * sweepBack + f * 0.5, r.y - sgn * 0.22 * sweepBack, r.z + f * sgn);
    }
  }

  function setJaw(open, protrude) {
    // open: 0 closed .. 1 gaping. protrude: upper jaw slides forward/down.
    const o = clamp(open, 0, 1.3);
    jawLower.rotation.x = -0.02 - o * 0.72;
    jawLower.position.z = rest(jawLower).p.z - o * 0.045;
    jawLower.position.y = rest(jawLower).p.y - o * 0.02;

    jawUpper.rotation.x = o * 0.26;
    const pr = clamp(protrude === undefined ? o * 0.55 : protrude, 0, 1);
    jawUpper.position.z = rest(jawUpper).p.z + pr * 0.075;
    jawUpper.position.y = rest(jawUpper).p.y - pr * 0.055;

    // teeth erect as the jaw protrudes — the replacement ranks rotate forward
    for (const rk of upperTeethRanks) {
      const i = Number(rk.name.slice(-1)) || 0;
      rk.rotation.x = rest(rk).r.x - pr * (0.18 + i * 0.30);
    }
    for (const rk of lowerTeethRanks) {
      const i = Number(rk.name.slice(-1)) || 0;
      rk.rotation.x = rest(rk).r.x + pr * (0.16 + i * 0.28);
    }
  }

  function setGills(flare) {
    const f = clamp(flare, 0, 1);
    for (const side of gills.children) {
      side.children.forEach((slit, i) => {
        const r = rest(slit);
        const k = 1 + f * (0.35 - i * 0.03);
        slit.scale.set(r.s.x * k, r.s.y * (1 + f * 0.25), r.s.z);
        slit.position.x = r.p.x * (1 + f * 0.05);
      });
    }
  }

  function setEyes(roll, lidClose) {
    for (const [e, sgn] of [[eyeL, -1], [eyeR, 1]]) {
      const lid = e.userData.lid;
      const r = rest(lid);
      // nictitating membrane rolls up over the eye
      lid.rotation.x = r.r.x - clamp(lidClose, 0, 1) * Math.PI * 0.92;
      const ball = e.children.find((c) => c.name.endsWith('Ball'));
      if (ball) {
        const rb = rest(ball);
        ball.position.set(rb.p.x, rb.p.y + roll * 0.012, rb.p.z + roll * sgn * 0.004);
      }
    }
  }

  function bendBody(pitch, yaw, roll) {
    body.rotation.x += pitch;
    body.rotation.y += yaw;
    body.rotation.z += roll;
  }

  function headLook(pitch, yaw, roll) {
    head.rotation.x += pitch;
    head.rotation.y += yaw;
    head.rotation.z += roll;
  }

  // health-based droop, added over everything
  function applyWound(s) {
    const h = clamp(s.health === undefined ? 1 : s.health, 0, 1);
    const w = 1 - h;
    if (w < 0.001) return;
    // list to one side, drop the head, drag the left pectoral, twitch
    const tw = Math.sin(s.t * 8.5) * 0.02 * w + Math.sin(s.t * 2.1) * 0.03 * w;
    root.rotation.z += -0.30 * w + tw;
    head.rotation.x += 0.16 * w;
    head.rotation.z += -0.12 * w;
    head.rotation.y += 0.07 * w;
    body.rotation.z += -0.10 * w;
    spine1.rotation.z += -0.09 * w;
    spine2.rotation.z += -0.07 * w;
    spine3.rotation.y += 0.05 * w;
    // wounded side pectoral hangs
    pecL.rotation.x += 0.45 * w;
    pecL.rotation.z += -0.30 * w;
    pecR.rotation.x += 0.10 * w;
    dorsalFin.rotation.z += -0.16 * w;
    dorsalFin.rotation.x += 0.10 * w;
    // gasping
    setGills(0.35 + 0.45 * Math.abs(Math.sin(s.t * 2.6)) * w);
    jawLower.rotation.x -= 0.10 * w * (0.5 + 0.5 * Math.sin(s.t * 2.6));
    root.position.y -= 0.06 * w;
  }

  // ------------------------------------------------------------ locomotion
  function poseLocomotion(s) {
    const sp = Math.max(0, s.speed || 0);

    // Gait character by speed band.
    // 0        : hover/station-keeping, barely sculling, mouth working water
    // 0..1     : slow cruise, wide slow beat, body arched, pectorals flared
    // 1..2     : steady cruise
    // 2..3.5   : burst, tail frequency and amplitude climb, body straightens
    // 3.5..6   : sprint, body flattens into a rigid ram, tail hammering
    const cruise = smooth(0.1, 1.2, sp);
    const burst = smooth(1.8, 3.2, sp);
    const sprint = smooth(3.4, 6.0, sp);

    const ampScale = lerp(1.0, 1.28, cruise) * lerp(1.0, 0.86, sprint);
    const headYaw = applySwim(s, ampScale, 0);

    // idle breathing / hovering
    const breath = Math.sin(s.t * 1.15);
    const hover = Math.sin(s.t * 0.72) * 0.5 + Math.sin(s.t * 0.41 + 1.1) * 0.5;

    // At rest: the shark hangs nose-slightly-up and drifts; at speed it levels
    // and finally noses down into the stream.
    const idleW = 1 - smooth(0.0, 0.7, sp);
    root.position.y += hover * 0.045 * idleW + breath * 0.010;
    root.rotation.x += 0.07 * idleW * (1 + 0.25 * breath) - 0.10 * sprint;
    root.rotation.z += Math.sin(s.t * 0.53) * 0.05 * idleW;

    // body extends and flattens with speed
    const stretch = 1 + 0.045 * sprint;
    body.scale.set(1 - 0.035 * sprint, 1 - 0.02 * sprint, stretch);

    // trunk arch: gathered/humped when creeping, straight when sprinting
    const creep = smooth(0.05, 0.9, sp) * (1 - burst);
    body.rotation.x += 0.06 * creep - 0.05 * sprint;
    spine1.rotation.x += -0.05 * creep + 0.02 * sprint;
    spine2.rotation.x += -0.03 * creep;

    // head: leads the yaw at low speed (scanning), locks in line at sprint
    const scan = Math.sin(s.t * 0.62) * 0.22 * idleW + Math.sin(s.t * 0.31) * 0.12 * idleW;
    headLook(
      -0.03 * sprint + 0.05 * idleW * breath,
      headYaw * (1 - 0.55 * sprint) + scan,
      headYaw * 0.30
    );

    // gill beat: fastest at rest (buccal pumping), ram-ventilated at speed
    const gillRate = lerp(2.4, 0.9, smooth(0, 3, sp));
    setGills((0.5 + 0.5 * Math.sin(s.t * gillRate)) * lerp(0.75, 0.25, cruise) + 0.25 * sprint);

    // mouth: cracked open at rest to pump water; sealed and gritted at sprint
    const mouthIdle = 0.10 + 0.09 * (0.5 + 0.5 * Math.sin(s.t * gillRate - 0.5));
    setJaw(mouthIdle * (1 - 0.55 * sprint) + 0.06 * burst, 0.05 * burst + 0.10 * sprint);

    // fins
    applyPectoralIdle(s, lerp(1.0, 0.25, cruise));
    dorsalFin.rotation.x = rest(dorsalFin).r.x + Math.sin(s.stride * TAU - 1.4) * 0.05 * ampScale - 0.06 * sprint;
    dorsalFin.rotation.z = rest(dorsalFin).r.z + Math.sin(s.stride * TAU - 1.6) * 0.09 * ampScale;
    dorsalFin2.rotation.z = rest(dorsalFin2).r.z + Math.sin(s.stride * TAU - 2.3) * 0.10 * ampScale;
    analFin.rotation.z = rest(analFin).r.z + Math.sin(s.stride * TAU - 2.4) * 0.10 * ampScale;

    setEyes(0.2 * sprint, 0);
  }

  // ------------------------------------------------------------------- turn
  function applyTurn(s) {
    const tn = clamp(s.turn || 0, -1, 1);
    if (Math.abs(tn) < 0.001) return;
    const a = tn; // negative = left
    // bank INTO the turn, spine curves, head leads, tail sweeps out
    root.rotation.z += a * 0.42;
    body.rotation.y += a * 0.10;
    head.rotation.y += a * 0.30;
    head.rotation.z += a * 0.16;
    spine1.rotation.y += a * 0.13;
    spine2.rotation.y += a * 0.16;
    spine3.rotation.y += a * 0.17;
    peduncle.rotation.y += a * 0.16;
    tailFin.rotation.y += a * 0.10;

    // inside pectoral tips down and back (brake), outside sweeps flat forward
    const inner = a < 0 ? pecL : pecR;
    const outer = a < 0 ? pecR : pecL;
    const isgn = a < 0 ? -1 : 1;
    inner.rotation.x += Math.abs(a) * 0.62;
    inner.rotation.z += isgn * Math.abs(a) * -0.35;
    inner.rotation.y += isgn * Math.abs(a) * 0.28;
    outer.rotation.x += Math.abs(a) * -0.34;
    outer.rotation.z += -isgn * Math.abs(a) * 0.20;

    const ipel = a < 0 ? pelL : pelR;
    ipel.rotation.x += Math.abs(a) * 0.30;
    dorsalFin.rotation.z += a * 0.14;
    setEyes(-a * 0.5, 0);
  }

  // --------------------------------------------------------------- airborne
  function poseAirborne(s) {
    // breaching: the body arches, fins spread stiff, tail thrashes for grip
    const thrash = Math.sin(s.t * 9.0);
    const thrash2 = Math.sin(s.t * 9.0 - 0.9);

    root.rotation.x += 0.30;
    body.rotation.x += -0.14;
    spine1.rotation.x += -0.10;
    spine2.rotation.x += -0.10;
    spine3.rotation.x += -0.09;
    peduncle.rotation.x += -0.06;

    spine2.rotation.y += thrash * 0.16;
    spine3.rotation.y += thrash2 * 0.22;
    peduncle.rotation.y += Math.sin(s.t * 9.0 - 1.6) * 0.26;
    tailFin.rotation.y += Math.sin(s.t * 9.0 - 2.2) * 0.30;
    tailUpper.rotation.y += Math.sin(s.t * 9.0 - 2.6) * 0.18;
    tailLower.rotation.y += Math.sin(s.t * 9.0 - 2.4) * 0.20;

    // pectorals lock out rigid and wide, like wings
    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x - 0.20, r.y + sgn * 0.18, r.z + sgn * 0.24);
    }
    for (const [g, sgn] of [[pelL, -1], [pelR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x - 0.16, r.y, r.z + sgn * 0.10);
    }
    dorsalFin.rotation.x = rest(dorsalFin).r.x - 0.12;

    // out of the water: mouth agape, gills clamped shut
    setJaw(0.55 + 0.20 * Math.sin(s.t * 6.0), 0.55);
    setGills(0.05);
    headLook(-0.16, Math.sin(s.t * 3.0) * 0.12, 0);
    setEyes(0.6, 0);
  }

  // ============================================================ ACTION POSES
  function actAttack(p, s) {
    // 0..0.30 wind-up: coil back, head cocks, mouth begins to open
    // 0.30..0.55 lunge: whole body straightens, jaws gape and protrude
    // 0.55..0.72 bite: jaws slam shut, head shakes
    // 0.72..1 recovery: unwind, worry the prey
    const wind = smooth(0.0, 0.30, p) * (1 - smooth(0.28, 0.44, p));
    const lunge = smooth(0.26, 0.50, p) * (1 - smooth(0.55, 0.74, p));
    const bite = smooth(0.50, 0.60, p) * (1 - smooth(0.68, 0.90, p));
    const rec = smooth(0.72, 1.0, p);

    // coil: body pulls back and to the side
    root.position.z -= wind * 0.22;
    root.position.z += lunge * 0.42;
    root.rotation.x += wind * 0.16 - lunge * 0.16;

    body.rotation.y += wind * 0.22 - lunge * 0.10;
    body.rotation.x += -wind * 0.10 + lunge * 0.06;
    spine1.rotation.y += wind * 0.30 - lunge * 0.14;
    spine2.rotation.y += wind * 0.34 - lunge * 0.20;
    spine3.rotation.y += wind * 0.30 - lunge * 0.26;
    peduncle.rotation.y += wind * 0.22 - lunge * 0.32;
    tailFin.rotation.y += wind * 0.16 - lunge * 0.34;

    // head thrusts forward and up, then rips down and sideways on the bite
    const shake = Math.sin(p * 46.0) * bite;
    headLook(
      -wind * 0.22 + lunge * 0.30 + bite * 0.26,
      wind * 0.16 - lunge * 0.10 + shake * 0.30,
      shake * 0.34 - lunge * 0.06
    );

    // the jaws: gaping wide through the lunge, protruded, slammed on bite
    const open = wind * 0.55 + lunge * 1.25 - bite * 1.05 - rec * 0.05;
    const protrude = clamp(wind * 0.35 + lunge * 1.0 - bite * 0.55, 0, 1);
    setJaw(Math.max(0, open) + (1 - rec) * 0.05, protrude);

    // pectorals flare to brace the strike
    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(
        r.x - lunge * 0.42 + wind * 0.24 + bite * 0.30,
        r.y + sgn * (lunge * 0.30),
        r.z + sgn * (wind * 0.22 - lunge * 0.10) + shake * 0.08
      );
    }
    dorsalFin.rotation.x = rest(dorsalFin).r.x - lunge * 0.16 + shake * 0.10;
    setGills(0.30 + lunge * 0.65);
    // the eye rolls back under the membrane at the moment of the bite
    setEyes(0.4, smooth(0.42, 0.56, p) * (1 - smooth(0.68, 0.84, p)));
    root.scale.setScalar(1 + lunge * 0.02);
  }

  function actFire(p, s) {
    // A shark's ranged attack: it steadies, hauls water, and spits a
    // hammer-blow of it — jaws snap forward from a locked, still body.
    const aim = smooth(0.0, 0.34, p);
    const charge = smooth(0.20, 0.48, p) * (1 - smooth(0.50, 0.60, p));
    const release = smooth(0.50, 0.57, p) * (1 - smooth(0.62, 0.82, p));
    const recoil = smooth(0.56, 0.68, p) * (1 - smooth(0.80, 1.0, p));
    const settle = smooth(0.80, 1.0, p);

    // body stays put and rigid — that's what makes it read as a shot
    root.rotation.x += -aim * 0.10 + recoil * 0.14;
    root.position.z += charge * -0.05 + release * 0.10 - recoil * 0.12;

    body.rotation.x += -aim * 0.06 + recoil * 0.10;
    spine1.rotation.y += Math.sin(s.t * 3.0) * 0.02 * (1 - settle);
    spine2.rotation.y += Math.sin(s.t * 3.0 - 0.7) * 0.03 * (1 - settle);
    peduncle.rotation.y += Math.sin(s.t * 3.0 - 1.4) * 0.05 * (1 - settle);

    // head aims: steady, lifts, then snaps down with the spit
    headLook(-aim * 0.26 + release * 0.34 - recoil * 0.20, 0, 0);

    // throat swells (charge), then everything fires forward
    const open = aim * 0.30 + charge * 0.55 + release * 0.85 - recoil * 0.6 - settle * 0.4;
    setJaw(Math.max(0, open), clamp(charge * 0.4 + release * 0.9, 0, 1));

    // gills clamp on the charge and blow out on the release
    setGills(charge * 0.15 + release * 1.0 + recoil * 0.5);

    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      // pectorals hold station like outriggers
      g.rotation.set(r.x - 0.10 - recoil * 0.20, r.y + sgn * 0.06, r.z + sgn * (0.12 + charge * 0.10));
    }
    dorsalFin.rotation.x = rest(dorsalFin).r.x - charge * 0.10 + release * 0.16;
    root.scale.set(1 + charge * 0.02, 1 + charge * 0.03, 1 - charge * 0.01);
    setEyes(0.5, release * 0.7);
  }

  function actHit(p, s) {
    // must read inside a quarter second: sharp flinch, then settle
    const punch = Math.exp(-p * 11.0) * Math.sin(p * 26.0 + 0.5);
    const jolt = Math.exp(-p * 6.5);
    const impact = 1 - smooth(0.0, 0.10, p);

    root.rotation.z += punch * 0.34;
    root.rotation.y += punch * 0.20;
    root.rotation.x += jolt * 0.14 * (1 - p);
    root.position.x += punch * 0.10;
    root.position.y += jolt * 0.05;

    body.rotation.z += punch * 0.16;
    body.rotation.y += -punch * 0.14;
    spine1.rotation.y += -punch * 0.20;
    spine2.rotation.y += -punch * 0.24;
    spine3.rotation.y += -punch * 0.26;
    peduncle.rotation.y += -punch * 0.24;
    tailFin.rotation.y += -punch * 0.22;

    headLook(impact * 0.22 + punch * 0.16, punch * 0.26, punch * 0.28);
    setJaw(impact * 0.55 + jolt * 0.20, 0.15);
    setGills(0.4 + jolt * 0.6);

    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + jolt * 0.40, r.y + sgn * punch * 0.16, r.z + sgn * jolt * 0.26 + punch * 0.14);
    }
    dorsalFin.rotation.z = rest(dorsalFin).r.z + punch * 0.24;
    setEyes(0.8, impact * 0.9);
    root.scale.set(1 + jolt * 0.03, 1 - jolt * 0.03, 1 - jolt * 0.02);
  }

  function actBlock(p, s) {
    // A shark has no shield — it turns its armoured shoulder and hard snout
    // into the blow, pitches nose-down, and tucks its eye behind the pectoral.
    const inn = smooth(0.0, 0.22, p);
    const hold = smooth(0.18, 0.30, p) * (1 - smooth(0.70, 0.94, p));
    const out = smooth(0.80, 1.0, p);
    const b = inn * (1 - out);
    const tremor = Math.sin(s.t * 22.0) * 0.014 * hold;

    // weight back and down, shoulder forward, head tucked low
    root.position.z -= b * 0.20;
    root.position.y -= b * 0.10;
    root.rotation.x += b * 0.26 + tremor;
    root.rotation.z += b * 0.18;
    root.rotation.y += b * 0.22;

    body.rotation.x += b * 0.18;
    body.rotation.y += b * 0.16;
    spine1.rotation.y += b * 0.22;
    spine2.rotation.y += b * 0.26;
    spine3.rotation.y += b * 0.22;
    peduncle.rotation.y += b * 0.16;

    // head down and turned so the thick snout and jaw take the impact
    headLook(b * 0.42 + tremor * 2, b * 0.10, b * 0.14);

    // pectorals cupped forward like a brace
    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + b * 0.92, r.y - sgn * b * 0.50, r.z + sgn * b * -0.42);
    }
    for (const [g, sgn] of [[pelL, -1], [pelR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + b * 0.30, r.y, r.z + sgn * b * -0.14);
    }
    dorsalFin.rotation.x = rest(dorsalFin).r.x + b * 0.22;
    setJaw(b * 0.06, 0.0);
    setGills(0.1);
    setEyes(0, b); // membrane closed — nothing gets to the eye
    root.scale.set(1 + b * 0.04, 1 - b * 0.03, 1 - b * 0.05);
  }

  function actGather(p, s) {
    // dive to the bottom, take the thing in the front teeth, rise with it
    const down = smooth(0.0, 0.34, p);
    const close = smooth(0.34, 0.48, p);
    const lift = smooth(0.52, 0.86, p);
    const settle = smooth(0.86, 1.0, p);
    const atBottom = down * (1 - lift);

    root.position.y -= atBottom * 0.42 - lift * 0.10;
    root.rotation.x += atBottom * 0.62 - lift * 0.30 + settle * 0.12;
    root.position.z += atBottom * 0.10;

    body.rotation.x += atBottom * 0.14 - lift * 0.10;
    spine1.rotation.x += -atBottom * 0.10 + lift * 0.10;
    spine2.rotation.x += -atBottom * 0.12 + lift * 0.12;
    spine3.rotation.x += -atBottom * 0.10 + lift * 0.10;
    peduncle.rotation.x += -atBottom * 0.06 + lift * 0.08;
    // tail sculls to hold the nose-down hover
    const scull = Math.sin(p * 22.0) * atBottom * 0.16;
    peduncle.rotation.y += scull;
    tailFin.rotation.y += scull * 1.3;

    headLook(atBottom * 0.34 - lift * 0.22, 0, 0);

    // mouth opens on the way down, closes on the grab, stays shut
    const open = down * 0.85 - close * 0.80 - lift * 0.05;
    setJaw(Math.max(0, open), clamp(down * 0.7 - close * 0.6, 0, 1));

    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + atBottom * 0.62 - lift * 0.30, r.y + sgn * atBottom * 0.14, r.z + sgn * atBottom * -0.20);
    }
    setGills(0.35 + atBottom * 0.35);
    setEyes(-0.6 * atBottom, close * 0.8 * (1 - lift));
  }

  function actDeposit(p, s) {
    // slower reverse of gather: sink, hold, release, back off
    const down = smooth(0.0, 0.42, p);
    const open = smooth(0.44, 0.62, p);
    const back = smooth(0.66, 1.0, p);
    const atBottom = down * (1 - back);

    root.position.y -= atBottom * 0.38 - back * 0.06;
    root.rotation.x += atBottom * 0.50 - back * 0.26;
    root.position.z += atBottom * 0.12 - back * 0.22;

    body.rotation.x += atBottom * 0.12;
    spine1.rotation.x += -atBottom * 0.09;
    spine2.rotation.x += -atBottom * 0.10;
    spine3.rotation.x += -atBottom * 0.08 + back * 0.08;
    const scull = Math.sin(p * 14.0) * atBottom * 0.11;
    peduncle.rotation.y += scull;
    tailFin.rotation.y += scull * 1.3;

    headLook(atBottom * 0.30 - back * 0.16, Math.sin(p * 9.0) * 0.05 * open, 0);
    setJaw(open * 0.85 * (1 - back * 0.7), clamp(open * 0.5, 0, 1));

    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + atBottom * 0.52 - back * 0.20, r.y + sgn * atBottom * 0.10, r.z + sgn * atBottom * -0.16);
    }
    setGills(0.30 + atBottom * 0.25);
    setEyes(-0.4 * atBottom, 0);
  }

  function actEat(p, s) {
    // head down to the carcass and three hard sawing bites, head shaking
    const down = smooth(0.0, 0.20, p);
    const up = smooth(0.84, 1.0, p);
    const eng = down * (1 - up);
    const cyc = clamp((p - 0.16) / 0.66, 0, 1);
    const k = cyc * 3.0; // three chews
    const chew = 0.5 - 0.5 * Math.cos(clamp(k, 0, 3) * TAU);
    const chewActive = eng * (k > 0 && k < 3 ? 1 : 0);
    const saw = Math.sin(k * TAU * 1.0) * chewActive;

    root.position.y -= eng * 0.34;
    root.rotation.x += eng * 0.50;
    root.rotation.z += saw * 0.20;
    root.position.z += eng * 0.06;

    body.rotation.y += saw * 0.14;
    spine1.rotation.y += -saw * 0.18;
    spine2.rotation.y += -saw * 0.22;
    spine3.rotation.y += -saw * 0.20;
    peduncle.rotation.y += -saw * 0.16;
    tailFin.rotation.y += -saw * 0.14;

    headLook(eng * 0.30 - chew * chewActive * 0.16, saw * 0.34, saw * 0.40);

    const open = eng * (0.18 + 0.85 * chew);
    setJaw(open, clamp(eng * (0.15 + 0.6 * chew), 0, 1));
    setGills(0.35 + chew * 0.45 * eng);

    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + eng * 0.52, r.y + sgn * saw * 0.10, r.z + sgn * eng * -0.18 + saw * 0.10);
    }
    setEyes(0.5, chew * eng * 0.9);
  }

  function actDrink(p, s) {
    // A shark doesn't drink, it gulps: head goes down and STAYS there, still,
    // pumping water through slowly, then it lifts away.
    const down = smooth(0.0, 0.24, p);
    const up = smooth(0.78, 1.0, p);
    const held = down * (1 - up);
    const pump = 0.5 + 0.5 * Math.sin(p * TAU * 3.0 - 1.2);

    root.position.y -= held * 0.36;
    root.rotation.x += held * 0.54;
    root.position.z += held * 0.05;

    body.rotation.x += held * 0.08;
    spine1.rotation.x += -held * 0.06;
    spine2.rotation.x += -held * 0.07;
    // barely-there station-keeping scull
    const scull = Math.sin(s.t * 2.0) * held * 0.06;
    spine3.rotation.y += scull;
    peduncle.rotation.y += scull * 1.4;
    tailFin.rotation.y += scull * 1.8;

    headLook(held * 0.26, 0, 0);
    setJaw(held * (0.10 + 0.16 * pump), 0.05);
    setGills(held * (0.25 + 0.55 * pump) + 0.15);

    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + held * 0.48, r.y, r.z + sgn * held * -0.14 + scull * 0.4);
    }
    setEyes(-0.4 * held, held * 0.35);
  }

  function actJump(p, s) {
    // A breach: coil down and BACK, then explode upward, body straight,
    // ending committed and reaching — the airborne overlay picks it up.
    const load = smooth(0.0, 0.34, p);
    const fire = smooth(0.32, 0.72, p);
    const reach = smooth(0.66, 1.0, p);

    root.position.y += -load * 0.30 + fire * 0.62;
    root.position.z += -load * 0.12 + fire * 0.28;
    root.rotation.x += load * 0.34 - fire * 0.66;

    // coil: the whole spine bends into a C, then snaps straight
    body.rotation.x += load * 0.22 - fire * 0.24;
    spine1.rotation.x += -load * 0.24 + fire * 0.20;
    spine2.rotation.x += -load * 0.28 + fire * 0.24;
    spine3.rotation.x += -load * 0.26 + fire * 0.22;
    peduncle.rotation.x += -load * 0.20 + fire * 0.18;

    // huge tail beat drives the launch
    const beat = Math.sin(clamp((p - 0.28) / 0.36, 0, 1) * Math.PI) * fire;
    spine2.rotation.y += beat * 0.22;
    spine3.rotation.y += -beat * 0.34;
    peduncle.rotation.y += -beat * 0.46;
    tailFin.rotation.y += -beat * 0.52;
    tailUpper.rotation.y += -beat * 0.24;
    tailLower.rotation.y += -beat * 0.28;

    headLook(load * 0.24 - fire * 0.40, 0, 0);
    setJaw(load * 0.10 + reach * 0.50, reach * 0.4);
    setGills(0.2 + fire * 0.5);

    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + load * 0.42 - fire * 0.46, r.y + sgn * fire * 0.20, r.z + sgn * (load * -0.20 + fire * 0.26));
    }
    dorsalFin.rotation.x = rest(dorsalFin).r.x + load * 0.18 - fire * 0.22;
    root.scale.set(1 - load * 0.02 + fire * 0.01, 1 - load * 0.04 + fire * 0.04, 1 + load * 0.03 + fire * 0.02);
    setEyes(0.6 * fire, 0);
  }

  function actLand(p, s) {
    // slamming back into the water: reach, take the shock, compress, recover
    const reach = smooth(0.0, 0.24, p) * (1 - smooth(0.24, 0.34, p));
    const impact = smooth(0.26, 0.36, p) * (1 - smooth(0.40, 0.62, p));
    const compress = smooth(0.30, 0.44, p) * (1 - smooth(0.58, 0.86, p));
    const recover = smooth(0.62, 1.0, p);
    const ring = Math.exp(-(p - 0.34) * 9.0) * (p > 0.34 ? 1 : 0) * Math.sin((p - 0.34) * 40.0);

    root.position.y += reach * 0.22 - compress * 0.30 + recover * 0.08;
    root.rotation.x += -reach * 0.34 + impact * 0.30 + compress * 0.18 - recover * 0.16;
    root.rotation.z += ring * 0.14;

    body.rotation.x += -reach * 0.14 + compress * 0.22 - recover * 0.06;
    spine1.rotation.x += reach * 0.10 - compress * 0.20;
    spine2.rotation.x += reach * 0.12 - compress * 0.24 + ring * 0.06;
    spine3.rotation.x += reach * 0.10 - compress * 0.20 + ring * 0.08;
    peduncle.rotation.x += -compress * 0.14 + ring * 0.10;
    peduncle.rotation.y += ring * 0.18;
    tailFin.rotation.y += ring * 0.24;

    headLook(-reach * 0.26 + impact * 0.36 + compress * 0.14 - recover * 0.20, ring * 0.10, ring * 0.14);
    setJaw(reach * 0.55 - compress * 0.4 + Math.max(0, impact * 0.30), reach * 0.35);
    setGills(0.15 + impact * 0.8 + compress * 0.4);

    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(
        r.x - reach * 0.44 + compress * 0.80 - recover * 0.30,
        r.y + sgn * reach * 0.22,
        r.z + sgn * (reach * 0.30 - compress * 0.30)
      );
    }
    dorsalFin.rotation.x = rest(dorsalFin).r.x - reach * 0.14 + compress * 0.18;
    root.scale.set(1 + compress * 0.05, 1 - compress * 0.07, 1 - compress * 0.02);
    setEyes(0.4, impact * 0.9);
  }

  function actSignal(p, s) {
    // A threat display: it rears back, arches, drops the pectorals hard down,
    // gapes the whole dentition open and holds it, then folds back down.
    const rise = smooth(0.0, 0.26, p);
    const hold = smooth(0.24, 0.34, p) * (1 - smooth(0.62, 0.78, p));
    const fall = smooth(0.74, 1.0, p);
    const a = rise * (1 - fall);
    const quiver = Math.sin(p * 58.0) * hold * 0.03;
    const roar = Math.sin(p * 30.0) * hold;

    root.position.y += a * 0.24;
    root.rotation.x += -a * 0.46 + quiver;
    root.position.z += a * 0.05;

    // arched, hunched agonistic posture
    body.rotation.x += -a * 0.24;
    spine1.rotation.x += a * 0.22;
    spine2.rotation.x += a * 0.26;
    spine3.rotation.x += a * 0.22;
    peduncle.rotation.x += a * 0.14;
    // slow sinuous sway while it holds
    const sway = Math.sin(s.t * 2.4) * hold * 0.10;
    spine1.rotation.y += sway * 0.5;
    spine2.rotation.y += sway;
    spine3.rotation.y += sway * 1.3;
    peduncle.rotation.y += sway * 1.5;
    tailFin.rotation.y += sway * 1.7;

    headLook(-a * 0.34 + roar * 0.05, sway * 0.6, 0);

    // the display itself — every tooth on show, jaws hyper-protruded
    const open = a * (1.05 + 0.12 * roar);
    setJaw(open, clamp(a * 1.0, 0, 1));
    setGills(0.4 + a * 0.6 + roar * 0.2 * hold);

    // pectorals plunge — the classic shark threat posture
    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + a * 1.05, r.y + sgn * a * 0.20, r.z + sgn * a * -0.55 + quiver);
    }
    for (const [g, sgn] of [[pelL, -1], [pelR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + a * 0.40, r.y, r.z + sgn * a * -0.24);
    }
    dorsalFin.rotation.x = rest(dorsalFin).r.x - a * 0.24;
    dorsalFin.scale.set(1, 1 + a * 0.14, 1);
    tailUpper.rotation.x = rest(tailUpper).r.x - a * 0.14;
    root.scale.set(1 + a * 0.05, 1 + a * 0.06, 1 - a * 0.01);
    setEyes(-0.8, 0);
  }

  function actSleep(p, s) {
    // Sharks don't lie down — they sink into a torpid hover on the bottom,
    // settle onto the belly and pectoral tips, and go still. Ends at rest.
    const sink = smooth(0.0, 0.55, p);
    const settle = smooth(0.45, 0.86, p);
    const still = smooth(0.80, 1.0, p);
    const slowBreath = Math.sin(s.t * 0.55);

    root.position.y -= sink * 0.34;
    root.rotation.x += sink * 0.10 - settle * 0.06;
    root.rotation.z += settle * 0.16;

    // the body slackens; the tail curls beside it
    body.rotation.x += sink * 0.06;
    body.rotation.y += settle * 0.10;
    spine1.rotation.y += settle * 0.20;
    spine2.rotation.y += settle * 0.28;
    spine3.rotation.y += settle * 0.30;
    peduncle.rotation.y += settle * 0.26;
    tailFin.rotation.y += settle * 0.20;
    spine1.rotation.z += settle * 0.06;
    spine2.rotation.z += settle * 0.08;
    tailUpper.rotation.x = rest(tailUpper).r.x + settle * 0.18;

    // slow spiracular pumping never stops
    const pump = (0.5 + 0.5 * slowBreath) * (0.7 - still * 0.35);
    headLook(settle * 0.14 + slowBreath * 0.02 * still, settle * 0.08, settle * 0.12);
    setJaw(0.08 + pump * 0.16, 0.02);
    setGills(0.15 + pump * 0.45);

    // pectorals splay out and prop the body
    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + settle * 0.30, r.y - sgn * settle * 0.16, r.z + sgn * settle * -0.34);
    }
    for (const [g, sgn] of [[pelL, -1], [pelR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + settle * 0.24, r.y, r.z + sgn * settle * -0.16);
    }
    dorsalFin.rotation.x = rest(dorsalFin).r.x + settle * 0.12;
    setEyes(0, settle * 0.95);
    root.scale.set(1 + settle * 0.02, 1 - settle * 0.03, 1);
  }

  function actWake(p, s) {
    // the reverse: first stir, uncurl, a push off the bottom, ending exactly
    // on the standing (hover) pose
    const q = 1 - p;
    const stir = smooth(0.0, 0.18, p) * (1 - smooth(0.20, 0.36, p));
    const settleOut = smooth(0.10, 0.70, p); // how much of the sleep pose remains
    const rem = 1 - settleOut;
    const push = smooth(0.34, 0.62, p) * (1 - smooth(0.66, 0.92, p));

    root.position.y -= rem * 0.34;
    root.rotation.x += rem * 0.06 - push * 0.14;
    root.rotation.z += rem * 0.16;

    body.rotation.y += rem * 0.10;
    spine1.rotation.y += rem * 0.20 + stir * 0.06;
    spine2.rotation.y += rem * 0.28 - push * 0.16;
    spine3.rotation.y += rem * 0.30 - push * 0.24;
    peduncle.rotation.y += rem * 0.26 - push * 0.30;
    tailFin.rotation.y += rem * 0.20 - push * 0.32;
    spine1.rotation.z += rem * 0.06;
    spine2.rotation.z += rem * 0.08;
    tailUpper.rotation.x = rest(tailUpper).r.x + rem * 0.18;

    headLook(rem * 0.14 - push * 0.12 + stir * 0.10, rem * 0.08 + stir * 0.16, rem * 0.12);
    // a wide yawn on the way up
    const yawn = smooth(0.40, 0.60, p) * (1 - smooth(0.62, 0.80, p));
    setJaw(0.08 * rem + yawn * 0.80, yawn * 0.5);
    setGills(0.25 + yawn * 0.6 + push * 0.35);

    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(
        r.x + rem * 0.30 - push * 0.24,
        r.y - sgn * rem * 0.16,
        r.z + sgn * (rem * -0.34 + push * 0.18)
      );
    }
    for (const [g, sgn] of [[pelL, -1], [pelR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + rem * 0.24, r.y, r.z + sgn * rem * -0.16);
    }
    dorsalFin.rotation.x = rest(dorsalFin).r.x + rem * 0.12;
    setEyes(0.3 * push, rem * 0.95 * (1 - smooth(0.05, 0.25, p) * 0.9));
    root.scale.set(1 + rem * 0.02, 1 - rem * 0.03, 1);
    void q;
  }

  function actDie(p, s) {
    // The kill: a violent thrash, the body goes slack, it rolls belly-up and
    // sinks. The last frame is a wreck, still.
    const thrashW = (1 - smooth(0.0, 0.30, p));
    const slack = smooth(0.22, 0.55, p);
    const roll = smooth(0.30, 0.72, p);
    const down = smooth(0.18, 0.95, p);
    const dead = smooth(0.80, 1.0, p);
    const th = Math.sin(p * 74.0) * thrashW;
    const th2 = Math.sin(p * 74.0 - 1.2) * thrashW;

    // sink and roll onto the back
    root.position.y -= down * 0.62;
    root.rotation.z += roll * Math.PI * 0.92 + th * 0.22 * (1 - roll);
    root.rotation.x += -down * 0.30 + slack * 0.10 + th * 0.12;
    root.rotation.y += th2 * 0.16 * (1 - roll) + roll * 0.10;

    // the spine convulses, then gives out and hangs
    const hang = slack * (1 - dead * 0.15);
    body.rotation.y += th * 0.18 * (1 - slack);
    body.rotation.x += hang * 0.10;
    spine1.rotation.y += th2 * 0.26 * (1 - slack) + hang * 0.12;
    spine2.rotation.y += th * 0.32 * (1 - slack) + hang * 0.18;
    spine3.rotation.y += th2 * 0.34 * (1 - slack) + hang * 0.22;
    peduncle.rotation.y += th * 0.32 * (1 - slack) + hang * 0.24;
    tailFin.rotation.y += th2 * 0.30 * (1 - slack) + hang * 0.20;
    spine1.rotation.x += -hang * 0.10;
    spine2.rotation.x += -hang * 0.14;
    spine3.rotation.x += -hang * 0.16;
    peduncle.rotation.x += -hang * 0.14;
    tailUpper.rotation.x = rest(tailUpper).r.x + hang * 0.22;
    tailLower.rotation.x = rest(tailLower).r.x - hang * 0.10;

    // head lolls
    headLook(hang * 0.24 + th * 0.16 * (1 - slack), th2 * 0.20 * (1 - slack) + hang * 0.16, hang * 0.22);

    // jaw sags open and stays open — teeth exposed
    const gape = thrashW * 0.55 + slack * 0.42;
    setJaw(Math.max(0.30 * dead, gape), 0.12 * (1 - dead));
    setGills(Math.max(0.05, (1 - slack) * 0.9 * (0.5 + 0.5 * Math.sin(p * 24.0))));

    // fins go limp
    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(
        r.x + th * 0.30 * (1 - slack) + hang * 0.50,
        r.y + sgn * th2 * 0.14 * (1 - slack),
        r.z + sgn * (th * 0.20 * (1 - slack) - hang * 0.26)
      );
    }
    for (const [g, sgn] of [[pelL, -1], [pelR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x + hang * 0.34, r.y, r.z + sgn * -hang * 0.18);
    }
    dorsalFin.rotation.x = rest(dorsalFin).r.x + hang * 0.20;
    dorsalFin.rotation.z = rest(dorsalFin).r.z + hang * 0.14;

    setEyes(0, slack * 0.55); // membrane half-drawn, the classic dead stare
    root.scale.set(1, 1 - dead * 0.03, 1);
  }

  function actEvolve(p, s) {
    // The body braces, then splits along its seams — the jaws hyper-extend,
    // the fins spread and lift away from the hull, the dorsal rises, every
    // tooth rank rotates forward. It holds at the top, straining, then closes.
    const brace = smooth(0.0, 0.20, p);
    const openUp = smooth(0.18, 0.48, p);
    const hold = smooth(0.44, 0.52, p) * (1 - smooth(0.66, 0.78, p));
    const close = smooth(0.74, 1.0, p);
    const o = openUp * (1 - close);
    const b = brace * (1 - openUp * 0.6);
    const strain = Math.sin(p * 64.0) * (o * 0.5 + hold * 0.5) * 0.022;
    const pulse = Math.sin(p * 15.0) * o;

    // brace: gathered, tail curled under, then the whole body spreads
    root.position.y += -b * 0.14 + o * 0.30;
    root.rotation.x += b * 0.20 - o * 0.34 + strain;
    root.rotation.z += strain * 1.5;

    body.rotation.x += b * 0.14 - o * 0.20;
    body.scale.set(1 + o * 0.14 + strain, 1 + o * 0.16, 1 + o * 0.05);
    spine1.rotation.x += -b * 0.14 + o * 0.16;
    spine2.rotation.x += -b * 0.16 + o * 0.18;
    spine3.rotation.x += -b * 0.14 + o * 0.16;
    peduncle.rotation.x += -b * 0.10 + o * 0.12;
    spine1.scale.set(1 + o * 0.12, 1 + o * 0.14, 1);
    spine2.scale.set(1 + o * 0.10, 1 + o * 0.12, 1);
    const shiver = Math.sin(p * 40.0) * o * 0.05;
    spine2.rotation.y += shiver;
    spine3.rotation.y += -shiver;
    peduncle.rotation.y += shiver * 1.4;
    tailFin.rotation.y += -shiver * 1.6;

    // head rears, jaws hyper-extend, every rank of teeth swings forward
    headLook(b * 0.20 - o * 0.40 + strain * 2, 0, strain);
    setJaw(b * 0.10 + o * (1.15 + 0.08 * pulse), clamp(o * 1.0, 0, 1));

    // fins lift off the hull like opening panels
    for (const [g, sgn] of [[pecL, -1], [pecR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x - o * 0.34 + b * 0.24, r.y + sgn * o * 0.34, r.z + sgn * (o * 0.42 - b * 0.16) + strain);
      g.scale.set(1, 1 + o * 0.22, 1 + o * 0.10);
    }
    for (const [g, sgn] of [[pelL, -1], [pelR, 1]]) {
      const r = rest(g).r;
      g.rotation.set(r.x - o * 0.20, r.y, r.z + sgn * o * 0.30);
      g.scale.set(1, 1 + o * 0.20, 1);
    }
    dorsalFin.rotation.x = rest(dorsalFin).r.x - o * 0.18 + b * 0.16;
    dorsalFin.scale.set(1 + o * 0.10, 1 + o * 0.42, 1 + o * 0.10);
    dorsalFin2.scale.set(1, 1 + o * 0.36, 1);
    analFin.scale.set(1, 1 + o * 0.34, 1);
    tailUpper.scale.set(1, 1 + o * 0.24, 1 + o * 0.08);
    tailLower.scale.set(1, 1 + o * 0.22, 1);
    tailUpper.rotation.x = rest(tailUpper).r.x - o * 0.16;

    setGills(0.2 + o * 0.95);
    setEyes(-0.6, close * 0.3);
  }

  const ACTIONS = {
    attack: actAttack,
    fire: actFire,
    hit: actHit,
    block: actBlock,
    gather: actGather,
    deposit: actDeposit,
    eat: actEat,
    drink: actDrink,
    jump: actJump,
    land: actLand,
    signal: actSignal,
    sleep: actSleep,
    wake: actWake,
    die: actDie,
    evolve: actEvolve,
  };

  // ================================================================== POSE FN
  root.userData.pose = (situation) => {
    const s = situation || {};
    const sit = {
      speed: s.speed || 0,
      stride: s.stride || 0,
      turn: s.turn || 0,
      grounded: s.grounded === undefined ? true : s.grounded,
      health: s.health === undefined ? 1 : s.health,
      action: s.action || null,
      phase: s.phase === undefined ? 0 : s.phase,
      t: s.t || 0,
      dt: s.dt || 0,
    };

    // whole pose from the rest pose outward, every call
    resetAll();

    if (sit.action && ACTIONS[sit.action]) {
      ACTIONS[sit.action](clamp(sit.phase, 0, 1), sit);
      // wounds still read during actions, except while dying (die owns health)
      if (sit.action !== 'die' && sit.action !== 'sleep') applyWound(sit);
      return;
    }

    if (!sit.grounded) {
      poseAirborne(sit);
      applyTurn(sit);
      applyWound(sit);
      return;
    }

    poseLocomotion(sit);
    applyTurn(sit);
    applyWound(sit);
  };

  // fallback clock, in case nothing drives situations
  let _t = 0;
  root.userData.update = (t, dt) => {
    _t = t !== undefined ? t : _t + (dt || 0.016);
    root.userData.pose({
      speed: 0,
      stride: (_t * 0.4) % 1,
      turn: 0,
      grounded: true,
      health: 1,
      action: null,
      phase: 0,
      t: _t,
      dt: dt || 0.016,
    });
  };

  root.userData.parts = {
    body,
    head,
    jawUpper,
    jawLower,
    spine1,
    spine2,
    spine3,
    peduncle,
    tailFin,
    tailUpper,
    tailLower,
    dorsalFin,
    dorsalFin2,
    analFin,
    gills,
    eyeL,
    eyeR,
    ...finGroups,
  };

  // initial pose so it never appears in raw rest
  root.userData.pose({ speed: 0, stride: 0, turn: 0, grounded: true, health: 1, t: 0, dt: 0 });

  return root;
}