function build(THREE, TSL) {
  const root = new THREE.Group();
  root.name = 'ArmouredOctopus';

  // ---------------------------------------------------------------------
  // Palette
  // ---------------------------------------------------------------------
  const C = {
    plate:      new THREE.Color(0x39434f),
    plateDark:  new THREE.Color(0x232a33),
    plateLight: new THREE.Color(0x5c6a79),
    brass:      new THREE.Color(0x9a7b3f),
    brassDark:  new THREE.Color(0x5e4a24),
    flesh:      new THREE.Color(0x8a3f4e),
    fleshDeep:  new THREE.Color(0x4a1f2b),
    sucker:     new THREE.Color(0xd9a2a6),
    eye:        new THREE.Color(0xf2e2b0),
    glow:       new THREE.Color(0x64e6ff),
  };

  // ---------------------------------------------------------------------
  // Materials (NodeMaterial + TSL)
  // ---------------------------------------------------------------------

  // Armour plating: brushed metal with etched banding and edge-wear.
  const plateMat = new THREE.MeshStandardNodeMaterial({
    metalness: 0.85,
    roughness: 0.42,
  });
  {
    const { Fn, vec3, float, positionLocal, normalLocal, sin, abs, fract,
            mix, smoothstep, dot, normalize, pow, oneMinus, max } = TSL;

    plateMat.colorNode = Fn(() => {
      const p = positionLocal;
      // fine brushed grain along Y
      const grain = sin(p.y.mul(180.0)).mul(0.5).add(0.5);
      // etched concentric banding
      const band = abs(fract(p.y.mul(6.0).add(p.z.mul(1.2))).sub(0.5)).mul(2.0);
      const groove = smoothstep(float(0.0), float(0.22), band);
      // upward faces catch light -> lighter alloy
      const up = max(dot(normalize(normalLocal), vec3(0.0, 1.0, 0.0)), float(0.0));
      let col = mix(vec3(C.plateDark.r, C.plateDark.g, C.plateDark.b),
                    vec3(C.plate.r, C.plate.g, C.plate.b),
                    pow(up, float(0.6)));
      col = mix(col.mul(0.62), col, groove);
      col = mix(col, vec3(C.plateLight.r, C.plateLight.g, C.plateLight.b),
                grain.mul(0.10));
      return col;
    })();

    plateMat.roughnessNode = Fn(() => {
      const p = positionLocal;
      const band = abs(fract(p.y.mul(6.0).add(p.z.mul(1.2))).sub(0.5)).mul(2.0);
      const groove = smoothstep(float(0.0), float(0.22), band);
      return mix(float(0.78), float(0.30), groove);
    })();
  }

  // Darker sub-plate / strapping metal.
  const strapMat = new THREE.MeshStandardNodeMaterial({
    metalness: 0.9, roughness: 0.55,
  });
  {
    const { Fn, vec3, float, positionLocal, sin, mix } = TSL;
    strapMat.colorNode = Fn(() => {
      const n = sin(positionLocal.x.mul(90.0)).mul(sin(positionLocal.z.mul(90.0)))
                 .mul(0.5).add(0.5);
      return mix(vec3(C.plateDark.r, C.plateDark.g, C.plateDark.b).mul(0.7),
                 vec3(C.plate.r, C.plate.g, C.plate.b).mul(0.8), n.mul(0.5));
    })();
  }

  // Brass rivets / trim.
  const brassMat = new THREE.MeshStandardNodeMaterial({
    metalness: 1.0, roughness: 0.32,
  });
  {
    const { Fn, vec3, float, normalLocal, normalize, dot, max, pow, mix } = TSL;
    brassMat.colorNode = Fn(() => {
      const up = max(dot(normalize(normalLocal), vec3(0.35, 1.0, 0.25)), float(0.0));
      return mix(vec3(C.brassDark.r, C.brassDark.g, C.brassDark.b),
                 vec3(C.brass.r, C.brass.g, C.brass.b), pow(up, float(0.5)));
    })();
  }

  // Living flesh: soft, mottled, faintly iridescent, damp.
  const fleshMat = new THREE.MeshStandardNodeMaterial({
    metalness: 0.02, roughness: 0.62,
  });
  {
    const { Fn, vec3, float, positionLocal, normalLocal, cameraPosition,
            positionWorld, sin, cos, mix, smoothstep, normalize, dot, abs,
            oneMinus, pow, clamp } = TSL;

    const mottle = Fn(([p]) => {
      const a = sin(p.x.mul(11.0)).mul(cos(p.y.mul(9.0).add(1.3)));
      const b = sin(p.z.mul(13.0).add(2.1)).mul(cos(p.x.mul(7.0).sub(0.7)));
      const c = sin(p.y.mul(23.0)).mul(0.35);
      return a.mul(0.5).add(b.mul(0.35)).add(c).mul(0.5).add(0.5);
    });

    fleshMat.colorNode = Fn(() => {
      const p = positionLocal;
      const m = mottle(p);
      let col = mix(vec3(C.fleshDeep.r, C.fleshDeep.g, C.fleshDeep.b),
                    vec3(C.flesh.r, C.flesh.g, C.flesh.b),
                    smoothstep(float(0.25), float(0.85), m));
      // underside pales toward the suckers
      const down = clamp(normalize(normalLocal).y.negate(), float(0.0), float(1.0));
      col = mix(col, vec3(0.86, 0.62, 0.60), pow(down, float(2.0)).mul(0.45));
      // wet rim light
      const V = normalize(cameraPosition.sub(positionWorld));
      const fres = pow(oneMinus(abs(dot(normalize(normalLocal), V))), float(3.0));
      col = mix(col, vec3(0.45, 0.62, 0.72), fres.mul(0.35));
      return col;
    })();

    fleshMat.roughnessNode = Fn(() => {
      const m = mottle(positionLocal);
      return mix(float(0.38), float(0.72), m);
    })();
  }

  const suckerMat = new THREE.MeshStandardNodeMaterial({
    color: C.sucker, metalness: 0.0, roughness: 0.35,
  });

  // Eyes: dark slit pupil in a pale iris, glassy.
  const eyeMat = new THREE.MeshStandardNodeMaterial({
    metalness: 0.1, roughness: 0.12,
  });
  {
    const { Fn, vec3, float, positionLocal, abs, smoothstep, mix, length, vec2 } = TSL;
    eyeMat.colorNode = Fn(() => {
      const p = positionLocal;
      const slit = smoothstep(float(0.012), float(0.05), abs(p.x))
                    .max(smoothstep(float(0.085), float(0.11), abs(p.y)));
      const iris = smoothstep(float(0.12), float(0.02), length(vec2(p.x, p.y)));
      let col = mix(vec3(0.10, 0.09, 0.08),
                    vec3(C.eye.r, C.eye.g, C.eye.b), slit);
      col = mix(vec3(0.06, 0.05, 0.05), col, iris.mul(0.55).add(0.45));
      return col;
    })();
    eyeMat.emissiveNode = Fn(() => {
      const p = positionLocal;
      const slit = smoothstep(float(0.012), float(0.05), abs(p.x));
      return vec3(C.eye.r, C.eye.g, C.eye.b).mul(slit.mul(0.16));
    })();
  }

  // Bioluminescent vent glow that pulses; driven by TSL time (ambient, always on).
  const glowMat = new THREE.MeshStandardNodeMaterial({
    metalness: 0.0, roughness: 0.4,
  });
  {
    const { Fn, vec3, float, positionLocal, time, sin, mix, smoothstep, abs } = TSL;
    glowMat.colorNode = Fn(() =>
      vec3(C.glow.r, C.glow.g, C.glow.b).mul(0.35)
    )();
    glowMat.emissiveNode = Fn(() => {
      const pulse = sin(time.mul(1.7).add(positionLocal.z.mul(4.0))).mul(0.5).add(0.5);
      const core = smoothstep(float(0.5), float(0.0), abs(positionLocal.y));
      return vec3(C.glow.r, C.glow.g, C.glow.b)
              .mul(mix(float(0.45), float(1.5), pulse))
              .mul(core.mul(0.6).add(0.4));
    })();
  }

  // ---------------------------------------------------------------------
  // Small builders
  // ---------------------------------------------------------------------
  const mesh = (geo, mat, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // Curved armour shell segment (a slice of a sphere shell, thickened).
  function shellSlice(r, thick, phiStart, phiLen, thetaStart, thetaLen, seg = 20) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, (seg / 2) | 0),
      phiStart, phiLen, thetaStart, thetaLen);
    const inner = new THREE.SphereGeometry(r - thick, seg, Math.max(6, (seg / 2) | 0),
      phiStart, phiLen, thetaStart, thetaLen);
    // Merge by pushing inner as a second (flipped) mesh — cheap and readable.
    const grp = new THREE.Group();
    const outer = new THREE.Mesh(g, plateMat);
    const inn = new THREE.Mesh(inner, strapMat);
    inn.scale.setScalar(1.0);
    inn.geometry.scale(1, 1, 1);
    grp.add(outer, inn);
    return grp;
  }

  function rivetRing(count, radius, rivetR, yFn, zScale = 1, name = 'RivetRing') {
    const g = new THREE.Group();
    g.name = name;
    const geo = new THREE.SphereGeometry(rivetR, 8, 6);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = mesh(geo, brassMat, `${name}_${i}`);
      r.position.set(Math.cos(a) * radius, yFn ? yFn(a) : 0, Math.sin(a) * radius * zScale);
      r.scale.set(1, 0.6, 1);
      g.add(r);
    }
    return g;
  }

  // ---------------------------------------------------------------------
  // BODY — mantle (the bulbous head-sac), armoured.
  // Root origin sits at the "hip" of the creature: where the arms meet the mantle.
  // ---------------------------------------------------------------------
  const body = new THREE.Group();
  body.name = 'Body';           // master rig node — everything hangs here
  body.position.set(0, 1.05, 0);
  root.add(body);

  // --- soft mantle underneath the armour ------------------------------
  const mantle = new THREE.Group();
  mantle.name = 'Mantle';       // pivots about the base of the sac
  body.add(mantle);

  {
    // Lathe profile: teardrop sac pointing up/back.
    const pts = [];
    const N = 22;
    for (let i = 0; i <= N; i++) {
      const t = i / N;                        // 0 = base, 1 = tip
      const y = t * 1.85;
      // fat near base, tapering to a rounded point
      const r = Math.sin(Math.pow(t, 0.72) * Math.PI * 0.98) * 0.86 + 0.06 * (1 - t);
      pts.push(new THREE.Vector2(Math.max(r, 0.02), y));
    }
    const sacGeo = new THREE.LatheGeometry(pts, 28);
    const sac = mesh(sacGeo, fleshMat, 'MantleSac');
    sac.scale.set(1.0, 1.0, 1.12);
    mantle.add(sac);

    // mantle is slung back a touch — the whole creature leans onto its arms
    mantle.rotation.x = -0.16;
  }

  // --- armour: dorsal carapace over the mantle ------------------------
  const carapace = new THREE.Group();
  carapace.name = 'Carapace';
  carapace.position.set(0, 0.05, 0);
  mantle.add(carapace);

  // Big overlapping banded plates up the sac.
  const carapacePlates = [];
  {
    const bands = 5;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const seg = new THREE.Group();
      seg.name = `CarapacePlate_${i}`;
      // origin at the band's lower lip so it can flare open (evolve/signal)
      seg.position.set(0, 0.18 + t * 1.28, 0);
      carapace.add(seg);
      carapacePlates.push(seg);

      const r = 0.92 - t * 0.50;
      const h = 0.34 - t * 0.09;
      const geo = new THREE.CylinderGeometry(r * 0.86, r, h, 26, 1, true);
      const shell = mesh(geo, plateMat, `CarapaceShell_${i}`);
      shell.position.y = h * 0.5;
      shell.scale.set(1.0, 1.0, 1.14);
      seg.add(shell);

      // flared lower lip of each band (the overlap edge)
      const lipGeo = new THREE.TorusGeometry(r * 1.005, 0.045 - t * 0.008, 8, 26);
      const lip = mesh(lipGeo, strapMat, `CarapaceLip_${i}`);
      lip.rotation.x = Math.PI / 2;
      lip.scale.set(1, 1.14, 1);
      seg.add(lip);

      // rivets around each band
      const rv = rivetRing(10 - i, r * 1.0, 0.045, () => h * 0.55, 1.14,
        `CarapaceRivets_${i}`);
      seg.add(rv);

      // dorsal ridge spike on the back of each band
      const spike = mesh(new THREE.ConeGeometry(0.10 - t * 0.015, 0.30 - t * 0.05, 6),
        plateMat, `DorsalSpike_${i}`);
      spike.position.set(0, h * 0.5, -r * 1.02);
      spike.rotation.x = -0.9;
      seg.add(spike);

      const spikeTip = mesh(new THREE.ConeGeometry(0.045, 0.10, 6), brassMat,
        `DorsalSpikeTip_${i}`);
      spikeTip.position.set(0, h * 0.5 + 0.16, -r * 1.02 - 0.14);
      spikeTip.rotation.x = -0.9;
      seg.add(spikeTip);
    }
  }

  // Crown cap at the top of the mantle.
  const crown = new THREE.Group();
  crown.name = 'Crown';
  crown.position.set(0, 1.80, 0);
  mantle.add(crown);
  {
    const cap = mesh(new THREE.SphereGeometry(0.30, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      plateMat, 'CrownCap');
    crown.add(cap);
    const finial = mesh(new THREE.ConeGeometry(0.085, 0.34, 8), brassMat, 'CrownFinial');
    finial.position.y = 0.26;
    crown.add(finial);
    const collar = mesh(new THREE.TorusGeometry(0.30, 0.05, 8, 20), strapMat, 'CrownCollar');
    collar.rotation.x = Math.PI / 2;
    crown.add(collar);
  }

  // Two dorsal vents that glow (the ambient bio-light).
  const vents = new THREE.Group();
  vents.name = 'Vents';
  mantle.add(vents);
  for (let s = -1; s <= 1; s += 2) {
    const v = mesh(new THREE.CapsuleGeometry(0.055, 0.34, 4, 8), glowMat,
      `Vent_${s < 0 ? 'L' : 'R'}`);
    v.position.set(0.46 * s, 0.95, -0.60);
    v.rotation.set(0.25, 0, 0.35 * s);
    vents.add(v);
  }

  // --- head / brow: the front of the mantle, with the eye turrets -----
  const head = new THREE.Group();
  head.name = 'Head';                 // pivots at the brow root
  head.position.set(0, 0.62, 0.30);
  mantle.add(head);

  {
    const brow = mesh(new THREE.SphereGeometry(0.62, 22, 16), fleshMat, 'Brow');
    brow.scale.set(1.02, 0.72, 0.80);
    head.add(brow);

    // brow visor — a heavy forward-jutting plate
    const visor = new THREE.Group();
    visor.name = 'Visor';
    visor.position.set(0, 0.16, 0.12);
    head.add(visor);

    const vGeo = new THREE.SphereGeometry(0.66, 22, 12, -Math.PI * 0.72, Math.PI * 1.44,
      0, Math.PI * 0.52);
    const vm = mesh(vGeo, plateMat, 'VisorShell');
    vm.scale.set(1.0, 0.72, 0.92);
    vm.rotation.x = 0.42;
    visor.add(vm);

    const vRidge = mesh(new THREE.TorusGeometry(0.50, 0.055, 8, 22, Math.PI * 1.25),
      brassMat, 'VisorRidge');
    vRidge.rotation.set(Math.PI / 2 + 0.30, 0, -Math.PI * 0.625 + Math.PI);
    vRidge.position.set(0, 0.05, 0.10);
    visor.add(vRidge);

    // central nasal keel
    const keel = mesh(new THREE.ConeGeometry(0.10, 0.46, 4), plateMat, 'VisorKeel');
    keel.position.set(0, 0.02, 0.46);
    keel.rotation.set(Math.PI / 2 + 0.18, Math.PI / 4, 0);
    visor.add(keel);
  }

  // Eye turrets — armoured pods on the sides of the head.
  const eyes = [];
  for (let s = -1; s <= 1; s += 2) {
    const side = s < 0 ? 'L' : 'R';
    const turret = new THREE.Group();
    turret.name = `EyeTurret_${side}`;
    turret.position.set(0.50 * s, 0.10, 0.22);
    turret.rotation.y = 0.42 * s;
    head.add(turret);

    const housing = mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.24, 14),
      plateMat, `EyeHousing_${side}`);
    housing.rotation.z = Math.PI / 2;
    housing.position.x = 0.06 * s;
    turret.add(housing);

    const rim = mesh(new THREE.TorusGeometry(0.215, 0.045, 8, 18), brassMat,
      `EyeRim_${side}`);
    rim.rotation.y = Math.PI / 2;
    rim.position.x = 0.19 * s;
    turret.add(rim);

    const globe = new THREE.Group();
    globe.name = `Eye_${side}`;                  // rotates to look around
    globe.position.set(0.15 * s, 0, 0);
    turret.add(globe);

    const ball = mesh(new THREE.SphereGeometry(0.185, 16, 12), eyeMat, `EyeBall_${side}`);
    ball.rotation.y = Math.PI / 2 * s;
    globe.add(ball);

    // armoured lid that can clamp shut over the eye
    const lid = new THREE.Group();
    lid.name = `EyeLid_${side}`;
    lid.position.set(0.02 * s, 0.02, 0);
    turret.add(lid);
    const lidGeo = new THREE.SphereGeometry(0.215, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45);
    const lidM = mesh(lidGeo, plateMat, `EyeLidShell_${side}`);
    lidM.rotation.z = -Math.PI / 2 * s;
    lidM.position.x = 0.14 * s;
    lid.add(lidM);

    eyes.push({ globe, lid, side, s });
  }

  // Siphon — the funnel below the head; it flares when the animal jets.
  const siphon = new THREE.Group();
  siphon.name = 'Siphon';
  siphon.position.set(0, 0.14, 0.42);
  mantle.add(siphon);
  {
    const tube = mesh(new THREE.CylinderGeometry(0.115, 0.19, 0.46, 14, 1, true),
      fleshMat, 'SiphonTube');
    tube.position.y = -0.10;
    tube.rotation.x = 1.05;
    siphon.add(tube);
    const collar = mesh(new THREE.TorusGeometry(0.135, 0.045, 8, 16), brassMat, 'SiphonCollar');
    collar.position.set(0, -0.28, 0.20);
    collar.rotation.x = 1.05 + Math.PI / 2;
    siphon.add(collar);
  }

  // --- beak: hidden between the arms, under the body ------------------
  const beak = new THREE.Group();
  beak.name = 'Beak';
  beak.position.set(0, -0.16, 0.20);
  body.add(beak);
  {
    const socket = mesh(new THREE.SphereGeometry(0.28, 16, 12), fleshMat, 'BeakSocket');
    socket.scale.set(1.0, 0.75, 1.0);
    beak.add(socket);

    const upper = new THREE.Group();
    upper.name = 'BeakUpper';                 // pivots at the hinge
    upper.position.set(0, 0.02, 0.02);
    beak.add(upper);
    const uj = mesh(new THREE.ConeGeometry(0.16, 0.34, 4), plateMat, 'BeakUpperJaw');
    uj.position.set(0, -0.10, 0.10);
    uj.rotation.set(Math.PI * 0.92, Math.PI / 4, 0);
    upper.add(uj);

    const lower = new THREE.Group();
    lower.name = 'BeakLower';
    lower.position.set(0, -0.02, 0.02);
    beak.add(lower);
    const lj = mesh(new THREE.ConeGeometry(0.135, 0.28, 4), brassMat, 'BeakLowerJaw');
    lj.position.set(0, -0.14, 0.08);
    lj.rotation.set(Math.PI * 0.98, Math.PI / 4, 0);
    lower.add(lj);
  }

  // --- gorget: the ring of armour where mantle meets arms -------------
  const gorget = new THREE.Group();
  gorget.name = 'Gorget';
  body.add(gorget);
  {
    const ring = mesh(new THREE.CylinderGeometry(1.02, 1.12, 0.36, 26, 1, true),
      plateMat, 'GorgetRing');
    ring.position.y = -0.06;
    ring.scale.set(1, 1, 1.08);
    gorget.add(ring);

    const lip = mesh(new THREE.TorusGeometry(1.12, 0.06, 8, 28), strapMat, 'GorgetLip');
    lip.position.y = -0.24;
    lip.rotation.x = Math.PI / 2;
    lip.scale.set(1, 1.08, 1);
    gorget.add(lip);

    gorget.add(rivetRing(14, 1.06, 0.05, () => 0.02, 1.08, 'GorgetRivets'));
  }

  // ---------------------------------------------------------------------
  // ARMS — eight, each a chain of segments, each segment armoured.
  // Origin of every segment sits at its own joint.
  // Arm 0 is front-right, going anticlockwise viewed from above.
  // ---------------------------------------------------------------------
  const ARM_COUNT = 8;
  const SEGS = 7;
  const arms = [];

  // Angles: spread the eight arms around, with a bias forward (front pair
  // reach ahead, rear pair trail).
  const armAngles = [];
  for (let i = 0; i < ARM_COUNT; i++) {
    // measured from +Z (front), signed: negative = right side
    const a = (i / ARM_COUNT) * Math.PI * 2;
    armAngles.push(a);
  }

  function buildArm(index) {
    const ang = (index / ARM_COUNT) * Math.PI * 2 + Math.PI / ARM_COUNT;
    // place around the gorget
    const rx = Math.sin(ang) * 0.86;
    const rz = Math.cos(ang) * 0.94;

    const armRoot = new THREE.Group();
    armRoot.name = `Arm_${index}`;
    armRoot.position.set(rx, -0.20, rz);
    // point the arm outward and down
    armRoot.rotation.order = 'YXZ';
    armRoot.rotation.y = ang;
    armRoot.rotation.x = 0.85;          // splay down/out
    body.add(armRoot);

    // shoulder pauldron over the arm base
    const pauld = new THREE.Group();
    pauld.name = `Pauldron_${index}`;
    armRoot.add(pauld);
    const pg = new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const pm = mesh(pg, plateMat, `PauldronShell_${index}`);
    pm.rotation.x = Math.PI;            // cup facing down the arm
    pm.position.y = 0.04;
    pm.scale.set(1.1, 0.9, 1.1);
    pauld.add(pm);
    const pr = mesh(new THREE.TorusGeometry(0.355, 0.045, 8, 18), brassMat,
      `PauldronRim_${index}`);
    pr.rotation.x = Math.PI / 2;
    pr.position.y = -0.16;
    pauld.add(pr);

    // chain of segments
    const segs = [];
    let parent = armRoot;
    const baseLen = 0.42;
    for (let j = 0; j < SEGS; j++) {
      const t = j / (SEGS - 1);
      const seg = new THREE.Group();
      seg.name = `Arm_${index}_Seg_${j}`;
      seg.position.set(0, j === 0 ? -0.10 : -(baseLen * (1 - 0.085 * (j - 1))), 0);
      seg.rotation.order = 'YXZ';
      parent.add(seg);

      const len = baseLen * (1 - 0.085 * j);
      const rTop = 0.235 * (1 - t * 0.80) + 0.028;
      const rBot = 0.235 * (1 - (t + 1 / (SEGS - 1)) * 0.80) + 0.022;

      // soft tentacle core
      const core = mesh(new THREE.CylinderGeometry(rTop, Math.max(rBot, 0.02), len * 1.06, 12),
        fleshMat, `Arm_${index}_Flesh_${j}`);
      core.position.y = -len * 0.5;
      seg.add(core);

      // armour band — a segmented sleeve, smaller toward the tip; the
      // last two segments are bare flesh (the whip end).
      if (j < SEGS - 2) {
        const sleeve = new THREE.Group();
        sleeve.name = `Arm_${index}_Plate_${j}`;
        seg.add(sleeve);

        const sl = mesh(new THREE.CylinderGeometry(rTop * 1.30, rBot * 1.24, len * 0.76, 14, 1, true),
          plateMat, `Arm_${index}_PlateShell_${j}`);
        sl.position.y = -len * 0.36;
        sleeve.add(sl);

        const cuff = mesh(new THREE.TorusGeometry(rTop * 1.32, 0.036, 8, 16), strapMat,
          `Arm_${index}_Cuff_${j}`);
        cuff.rotation.x = Math.PI / 2;
        cuff.position.y = -len * 0.02;
        sleeve.add(cuff);

        // outward-facing scute
        const scute = mesh(new THREE.ConeGeometry(rTop * 0.55, rTop * 1.25, 4), brassMat,
          `Arm_${index}_Scute_${j}`);
        scute.position.set(0, -len * 0.34, rTop * 1.28);
        scute.rotation.set(Math.PI / 2, Math.PI / 4, 0);
        sleeve.add(scute);
      }

      // suckers along the inner (front, +Z in arm-local) face
      const suckGrp = new THREE.Group();
      suckGrp.name = `Arm_${index}_Suckers_${j}`;
      seg.add(suckGrp);
      const nS = j < SEGS - 2 ? 2 : 3;
      for (let k = 0; k < nS; k++) {
        const ty = -len * ((k + 0.5) / nS);
        const sr = (rTop * 0.40) * (1 - 0.10 * k);
        const off = 0.055 * ((k % 2) ? 1 : -1);
        const s = mesh(new THREE.CylinderGeometry(sr, sr * 0.8, sr * 0.5, 8), suckerMat,
          `Arm_${index}_Sucker_${j}_${k}`);
        s.position.set(off * rTop * 4.0, ty, -(rTop * 0.96));
        s.rotation.x = Math.PI / 2;
        suckGrp.add(s);
      }

      // tip barb on the very last segment
      if (j === SEGS - 1) {
        const barb = mesh(new THREE.ConeGeometry(0.045, 0.20, 6), brassMat,
          `Arm_${index}_Barb`);
        barb.position.y = -len * 1.02;
        barb.rotation.x = Math.PI;
        seg.add(barb);
      }

      segs.push({ node: seg, len, t });
      parent = seg;
    }

    // classification for gait
    // frontness: +1 arm points forward, -1 backward
    const frontness = Math.cos(ang);
    const sideness = Math.sin(ang);   // +1 right, -1 left

    const arm = { root: armRoot, pauldron: pauld, segs, ang, frontness, sideness, index };
    arms.push(arm);
    return arm;
  }

  for (let i = 0; i < ARM_COUNT; i++) buildArm(i);

  // ---------------------------------------------------------------------
  // Rest pose snapshot — every animated node's neutral transform.
  // ---------------------------------------------------------------------
  const rest = new Map();
  const remember = (o) => rest.set(o, {
    p: o.position.clone(),
    r: new THREE.Euler().copy(o.rotation),
    s: o.scale.clone(),
  });
  const restore = (o) => {
    const r = rest.get(o);
    o.position.copy(r.p);
    o.rotation.copy(r.r);
    o.scale.copy(r.s);
  };

  const animated = [body, mantle, carapace, head, crown, siphon, beak, gorget,
    beak.getObjectByName('BeakUpper'), beak.getObjectByName('BeakLower')];
  carapacePlates.forEach(p => animated.push(p));
  eyes.forEach(e => { animated.push(e.globe); animated.push(e.lid); });
  arms.forEach(a => {
    animated.push(a.root);
    animated.push(a.pauldron);
    a.segs.forEach(s => animated.push(s.node));
  });
  animated.forEach(remember);

  const beakUpper = beak.getObjectByName('BeakUpper');
  const beakLower = beak.getObjectByName('BeakLower');

  // ---------------------------------------------------------------------
  // POSE
  // ---------------------------------------------------------------------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  // 0..1 up-and-back-down
  const arc = (t) => Math.sin(clamp(t, 0, 1) * Math.PI);
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  root.userData.pose = (s) => {
    const t = s.t || 0;
    const speed = Math.max(0, s.speed || 0);
    const stride = ((s.stride || 0) % 1 + 1) % 1;
    const turn = clamp(s.turn || 0, -1, 1);
    const grounded = s.grounded === undefined ? true : !!s.grounded;
    const health = s.health === undefined ? 1 : clamp(s.health, 0, 1);
    const action = s.action || null;
    const phase = clamp(s.phase || 0, 0, 1);

    // ---- reset every animated node to rest -------------------------
    for (let i = 0; i < animated.length; i++) restore(animated[i]);

    // =================================================================
    // GAIT — the octopus crawls: arms move in a two-wave metachronal
    // pattern, front arms reaching and pulling, rear arms pushing.
    // The body surges forward/back with each pull and bobs vertically.
    // =================================================================

    // gait character by speed
    const creep = clamp((0.9 - speed) / 0.9, 0, 1);        // 1 at stand, 0 by 0.9
    const runBlend = clamp((speed - 1.6) / 1.6, 0, 1);      // walk -> run at 2..3
    const sprint = clamp((speed - 3.0) / 3.0, 0, 1);        // 3..6
    const moving = clamp(speed / 0.6, 0, 1);

    // stance height: low & gathered at a creep, higher at a walk, then
    // FLATTENED and stretched forward at speed (jet-crawl).
    const crouch = lerp(0.0, -0.30, creep * moving)          // creep: low
                 + lerp(0.0, -0.22, sprint);                 // sprint: flat
    const bodyRise = lerp(0.0, 0.10, clamp(speed / 2, 0, 1) * (1 - sprint));

    const cyc = stride * TAU;

    // Global body surge: two pulls per stride cycle (arms alternate sets).
    const surge = Math.sin(cyc * 2) * 0.055 * moving * lerp(1, 1.9, runBlend);
    const bob = Math.cos(cyc * 2) * 0.045 * moving * (1 - sprint * 0.5);

    // idle breathing — the mantle inflates and deflates, always
    const breathe = Math.sin(t * 1.15) * 0.5 + 0.5;
    const breathAmp = lerp(0.055, 0.018, moving);
    const idleSway = Math.sin(t * 0.62) * (1 - moving) * 0.06;
    const idleNod = Math.sin(t * 0.47 + 1.1) * (1 - moving) * 0.05;

    // wound: sag to one side, drop a shoulder, list forward
    const hurt = 1 - health;
    const hurtSag = hurt * 0.85;

    body.position.y += crouch + bodyRise + bob;
    body.position.z += surge;
    body.rotation.x += lerp(0, 0.22, sprint) + lerp(0, -0.10, creep * moving)
                     + idleNod + hurt * 0.16;
    body.rotation.z += -turn * 0.24 * moving + hurtSag * 0.20;
    body.rotation.y += turn * 0.10 * moving + idleSway * 0.6;

    // mantle: breathes, trails behind on acceleration, banks on a turn
    mantle.scale.set(
      1 + breathe * breathAmp,
      1 - breathe * breathAmp * 0.55,
      1 + breathe * breathAmp
    );
    mantle.rotation.x += lerp(0, -0.26, sprint) + Math.sin(cyc * 2 + 0.8) * 0.05 * moving
                       + hurt * 0.10;
    mantle.rotation.z += -turn * 0.20 + hurtSag * 0.14;
    mantle.rotation.y += turn * 0.14;

    // carapace bands ripple faintly with breath; clamp tighter at speed
    for (let i = 0; i < carapacePlates.length; i++) {
      const p = carapacePlates[i];
      const k = i / (carapacePlates.length - 1);
      const w = Math.sin(t * 1.15 - k * 1.2) * 0.5 + 0.5;
      p.scale.setScalar(1 + w * 0.018 * (1 - moving * 0.6));
      p.rotation.x += w * 0.02 * (1 - moving) - sprint * 0.02;
    }

    // head: leads the turn, drops in line with the spine at a sprint
    head.rotation.x += lerp(0.0, -0.30, sprint) + lerp(0, 0.16, creep * moving)
                     + idleNod * 1.6 + hurt * 0.30;
    head.rotation.y += turn * 0.46 + Math.sin(t * 0.33) * (1 - moving) * 0.22;
    head.rotation.z += -turn * 0.16 + hurtSag * 0.18;

    // eyes: scan when idle, lock forward at speed, half-lidded when hurt
    const scanY = Math.sin(t * 0.71) * 0.30 * (1 - moving);
    const scanX = Math.sin(t * 0.43 + 2.0) * 0.16 * (1 - moving);
    for (const e of eyes) {
      e.globe.rotation.y += scanY + turn * 0.5;
      e.globe.rotation.x += scanX;
      e.lid.rotation.x += -0.05 + hurt * 0.55 + sprint * 0.18;
    }

    // siphon: flares and points back when fast (it is jetting)
    siphon.scale.setScalar(1 + breathe * 0.10 + moving * 0.14);
    siphon.rotation.x += lerp(0, -0.30, moving);

    // beak: idles slightly, clamps at speed
    const beakIdle = (Math.sin(t * 0.9) * 0.5 + 0.5) * 0.10 * (1 - moving);
    beakUpper.rotation.x += -beakIdle * 0.5;
    beakLower.rotation.x += beakIdle;

    // ---- arms: metachronal crawl -----------------------------------
    // Each arm has a phase offset so a wave travels around the body.
    // Front arms (frontness>0) reach and pull; rear arms push off.
    const armPose = (arm, k) => {
      const { segs, frontness, sideness, index } = arm;

      // phase offset: alternate sides + travel a wave front-to-back
      const alt = (index % 2) * 0.5;
      const wave = (1 - frontness) * 0.16;
      const ph = (stride + alt + wave) % 1;

      // reach (arm extends forward) then pull (arm curls back)
      const reach = Math.sin(ph * TAU) * moving;
      const lift = Math.max(0, Math.sin(ph * TAU + Math.PI * 0.5));

      // stride amplitude grows with speed
      const amp = lerp(0.10, 0.62, clamp(speed / 6, 0, 1))
                * lerp(0.75, 1.0, 1 - creep * 0.4);
      const liftAmp = lerp(0.10, 0.42, clamp(speed / 6, 0, 1)) * (1 - creep * 0.35);

      // rest attitude changes with gait: gathered under body at a creep,
      // splayed and reaching at a sprint
      const splay = lerp(0.0, 0.30, sprint) - creep * moving * 0.22;
      arm.root.rotation.x += splay
        + reach * amp * frontness * 0.9
        + lift * liftAmp * 0.55 * (frontness > 0 ? 1 : -0.5)
        + hurt * 0.20 * (index % 3 === 0 ? 1 : 0.3);
      arm.root.rotation.y += reach * amp * 0.55 * sideness * -1
        + turn * 0.42 * (sideness > 0 ? -1 : 1) * 0.6;
      arm.root.rotation.z += -turn * 0.30 * frontness
        + reach * amp * 0.22 * sideness;

      // inside-limb shortening on a turn: arms on the inside of the
      // turn curl up, outside arms extend
      const inside = (turn < 0 ? -sideness : sideness); // 1 if this arm is inside
      const curlTurn = clamp(inside, 0, 1) * Math.abs(turn) * 0.36;
      const extTurn = clamp(-inside, 0, 1) * Math.abs(turn) * -0.20;

      // segment-by-segment travelling curl
      for (let j = 0; j < segs.length; j++) {
        const sg = segs[j];
        const tt = j / (segs.length - 1);
        const delay = tt * 0.30;
        const local = Math.sin((ph - delay) * TAU);
        const localL = Math.sin((ph - delay) * TAU + 1.2);

        // base curl: arms are never straight — they always have S-curve
        const idleCurl = Math.sin(t * 0.9 - tt * 2.4 + index * 0.8)
                       * 0.10 * (1 - moving * 0.6);

        const pull = local * amp * 0.55 * (0.35 + tt);
        const tipWhip = localL * lerp(0.05, 0.34, sprint) * Math.pow(tt, 2);

        sg.node.rotation.x += 0.14 + idleCurl + pull * (frontness > 0 ? 1 : -0.7)
          + curlTurn * (0.3 + tt) + extTurn * (0.3 + tt)
          + lerp(0, 0.10, sprint) * tt
          + hurt * 0.22 * tt * (index % 3 === 0 ? 1 : 0.25);
        sg.node.rotation.z += (idleCurl * 0.6 + tipWhip) * (index % 2 ? 1 : -1)
          + turn * 0.10 * tt;
        sg.node.rotation.y += localL * 0.10 * tt * moving;
      }

      arm.pauldron.rotation.x += reach * 0.10 * moving;
    };

    // =================================================================
    // AIRBORNE — off the ground: the arms stop crawling entirely and
    // stream backward like a jellyfish bell; the mantle points the way.
    // =================================================================
    const airborne = !grounded;

    // =================================================================
    // ACTIONS
    // =================================================================
    let handled = false;

    const setArmsUniform = (fn) => {
      for (let i = 0; i < arms.length; i++) fn(arms[i], i);
    };

    // helper: apply a uniform curl amount to every segment of an arm
    const curlArm = (arm, base, perSeg, twist = 0, tipBias = 1) => {
      for (let j = 0; j < arm.segs.length; j++) {
        const tt = j / (arm.segs.length - 1);
        arm.segs[j].node.rotation.x += base + perSeg * (tt * tipBias + 0.2);
        arm.segs[j].node.rotation.z += twist * tt;
      }
    };

    if (action === 'attack') {
      handled = true;
      // Wind-up: the body coils back, the front two arms rear up.
      // Commit: they lash forward and the beak drives out.
      const wind = clamp(phase / 0.30, 0, 1);
      const strike = clamp((phase - 0.30) / 0.22, 0, 1);
      const rec = clamp((phase - 0.52) / 0.48, 0, 1);

      const w = smooth(wind) * (1 - smooth(strike));
      const st = smooth(strike) * (1 - smooth(rec) * 0.9);

      body.position.z += -0.30 * w + 0.55 * st;
      body.position.y += 0.22 * w - 0.14 * st;
      body.rotation.x += -0.30 * w + 0.46 * st;
      mantle.rotation.x += -0.24 * w + 0.34 * st;
      head.rotation.x += -0.20 * w + 0.42 * st;
      crown.rotation.x += -0.10 * w;

      // beak snaps open then bites shut on the commit
      beakUpper.rotation.x += -0.65 * w - 0.85 * clamp(w + st * 0.2, 0, 1) * 0 - 0.15;
      beakLower.rotation.x += 1.05 * w - 0.30 * st;
      beak.position.z += 0.10 * st;

      for (const e of eyes) e.lid.rotation.x += 0.30 * st;

      setArmsUniform((arm, i) => {
        const front = arm.frontness;
        const isStriker = front > 0.55;   // the two forward arms
        if (isStriker) {
          arm.root.rotation.x += -1.05 * w + 1.35 * st;
          curlArm(arm, -0.30 * w, -0.75 * w + 1.10 * st,
            arm.sideness * (0.20 * st), 1.2);
        } else if (front > -0.2) {
          // mid arms brace outward
          arm.root.rotation.x += 0.28 * (w + st * 0.4);
          arm.root.rotation.y += arm.sideness * 0.22 * (w + st);
          curlArm(arm, 0.16 * (w + st), 0.24 * w);
        } else {
          // rear arms plant and drive the strike
          arm.root.rotation.x += 0.45 * w - 0.30 * st;
          curlArm(arm, 0.22 * w, 0.55 * w - 0.25 * st);
        }
      });
    }

    else if (action === 'fire') {
      handled = true;
      // Aim: body settles low and steady, siphon aligns forward, one
      // front arm steadies like a barrel. Release: siphon punches, the
      // mantle contracts hard. Recoil: body rocks back.
      const aim = clamp(phase / 0.42, 0, 1);
      const shot = clamp((phase - 0.42) / 0.10, 0, 1);
      const recoil = clamp((phase - 0.52) / 0.48, 0, 1);

      const a = smooth(aim);
      const sh = arc(shot);
      const rc = smooth(recoil);

      body.position.y += -0.16 * a;
      body.rotation.x += 0.06 * a - 0.24 * sh + 0.02 * rc;
      body.position.z += 0.04 * a - 0.14 * sh * (1 - rc);

      // mantle contracts violently (that is the jet)
      const squeeze = sh * (1 - rc * 0.4);
      mantle.scale.set(1 - squeeze * 0.20, 1 + squeeze * 0.18, 1 - squeeze * 0.20);
      mantle.rotation.x += -0.10 * a - 0.16 * sh;

      // siphon aims forward, flares on the shot
      siphon.rotation.x += -0.55 * a - 0.25 * sh;
      siphon.scale.setScalar(1 + a * 0.15 + sh * 0.55);

      head.rotation.x += -0.08 * a + 0.16 * sh;
      for (const e of eyes) {
        e.globe.rotation.x += -0.10 * a;
        e.lid.rotation.x += 0.22 * a + 0.35 * sh;
      }

      // carapace bands lock down while aiming
      for (let i = 0; i < carapacePlates.length; i++) {
        carapacePlates[i].scale.setScalar(1 - a * 0.02 - sh * 0.03);
      }

      setArmsUniform((arm) => {
        const front = arm.frontness;
        if (front > 0.55) {
          // the barrel arms: raised, extended, dead still
          arm.root.rotation.x += -0.85 * a + 0.20 * sh;
          curlArm(arm, -0.22 * a, -0.42 * a + 0.35 * sh, 0, 0.8);
        } else {
          // the rest brace wide and low, absorbing the recoil
          arm.root.rotation.x += 0.34 * a + 0.18 * sh;
          arm.root.rotation.y += arm.sideness * 0.20 * a;
          curlArm(arm, 0.18 * a, 0.42 * a + 0.30 * sh * (1 - front));
        }
      });
    }

    else if (action === 'hit') {
      handled = true;
      // Fast flinch away from the front, then settle. Must read quick.
      const f = phase < 0.22 ? phase / 0.22 : 1 - (phase - 0.22) / 0.78;
      const k = clamp(f, 0, 1);
      const shake = Math.sin(phase * 34) * Math.pow(1 - phase, 2.0);

      body.position.z += -0.34 * k;
      body.position.y += -0.14 * k;
      body.rotation.x += -0.34 * k + shake * 0.10;
      body.rotation.z += shake * 0.16;

      mantle.rotation.x += -0.26 * k;
      mantle.scale.set(1 - k * 0.10, 1 + k * 0.08, 1 - k * 0.10);
      head.rotation.x += 0.36 * k;
      head.rotation.z += shake * 0.20;

      for (const e of eyes) e.lid.rotation.x += 0.70 * k;
      beakUpper.rotation.x += -0.30 * k;
      beakLower.rotation.x += 0.55 * k;

      // carapace plates jolt
      for (let i = 0; i < carapacePlates.length; i++) {
        carapacePlates[i].rotation.x += shake * 0.09 * (1 + i * 0.15);
      }

      setArmsUniform((arm, i) => {
        arm.root.rotation.x += 0.42 * k + shake * 0.10;
        arm.root.rotation.y += arm.sideness * 0.16 * k;
        curlArm(arm, 0.20 * k, 0.62 * k, shake * 0.12 * (i % 2 ? 1 : -1));
      });
    }

    else if (action === 'block') {
      handled = true;
      // Weight back and down; the thickest thing it has — the carapace
      // and the front pauldrons — turned toward +Z, head tucked behind.
      const k = phase < 0.25 ? smooth(phase / 0.25)
              : phase > 0.80 ? smooth((1 - phase) / 0.20) : 1;

      body.position.y += -0.42 * k;
      body.position.z += -0.22 * k;
      body.rotation.x += 0.52 * k;      // tip the shell forward like a shield

      mantle.rotation.x += 0.40 * k;
      mantle.scale.set(1 + k * 0.06, 1 - k * 0.06, 1 + k * 0.04);

      // head tucks down and back, behind the visor
      head.rotation.x += 0.62 * k;
      head.position.y += -0.14 * k;
      head.position.z += -0.12 * k;
      for (const e of eyes) e.lid.rotation.x += 0.95 * k;   // lids clamp shut

      // plates clamp tight, spikes forward
      for (let i = 0; i < carapacePlates.length; i++) {
        carapacePlates[i].scale.setScalar(1 - k * 0.035);
        carapacePlates[i].rotation.x += k * 0.10;
      }
      crown.rotation.x += k * 0.20;

      beakUpper.rotation.x += -0.10 * k;
      beakLower.rotation.x += 0.10 * k;

      setArmsUniform((arm) => {
        const front = arm.frontness;
        if (front > 0.1) {
          // front arms fold up into a shield wall across the face
          arm.root.rotation.x += -0.95 * k;
          arm.root.rotation.y += arm.sideness * -0.35 * k;
          curlArm(arm, -0.30 * k, 1.35 * k, arm.sideness * 0.18 * k, 1.15);
        } else {
          // rear arms plant wide and take the load
          arm.root.rotation.x += 0.50 * k;
          arm.root.rotation.y += arm.sideness * 0.30 * k;
          curlArm(arm, 0.28 * k, 0.30 * k);
        }
      });
    }

    else if (action === 'gather') {
      handled = true;
      // Down for it, close on it, come back up with it.
      const down = clamp(phase / 0.34, 0, 1);
      const close = clamp((phase - 0.34) / 0.22, 0, 1);
      const up = clamp((phase - 0.56) / 0.44, 0, 1);

      const d = smooth(down) * (1 - smooth(up));
      const c = smooth(close) * (1 - smooth(up) * 0.55);
      const u = smooth(up);

      body.position.y += -0.52 * d - 0.10 * c + 0.30 * u;
      body.position.z += 0.24 * d - 0.10 * u;
      body.rotation.x += 0.46 * d - 0.24 * u;

      mantle.rotation.x += 0.30 * d - 0.20 * u;
      head.rotation.x += 0.60 * d + 0.12 * c - 0.42 * u;
      for (const e of eyes) e.globe.rotation.x += 0.30 * d;

      beak.position.y += -0.06 * d;
      beakUpper.rotation.x += -0.30 * d + 0.20 * c;
      beakLower.rotation.x += 0.45 * d - 0.35 * c;

      setArmsUniform((arm) => {
        const front = arm.frontness;
        if (front > 0.3) {
          // front arms reach down and close around the object
          arm.root.rotation.x += 0.62 * d - 0.20 * c - 0.55 * u;
          arm.root.rotation.y += arm.sideness * -0.22 * c;
          curlArm(arm, 0.25 * d, 0.30 * d + 1.30 * c + 0.35 * u,
            arm.sideness * 0.14 * c, 1.25);
        } else {
          // rear arms brace and take the weight coming up
          arm.root.rotation.x += 0.30 * d + 0.12 * u;
          curlArm(arm, 0.18 * d, 0.44 * d + 0.30 * u);
        }
      });
    }

    else if (action === 'deposit') {
      handled = true;
      // Reverse of gather, and slower: carry, lower, open, withdraw.
      const carry = clamp(phase / 0.20, 0, 1);
      const lower = clamp((phase - 0.20) / 0.40, 0, 1);
      const open = clamp((phase - 0.60) / 0.18, 0, 1);
      const back = clamp((phase - 0.78) / 0.22, 0, 1);

      const cr = smooth(carry);
      const lo = smooth(lower);
      const op = smooth(open);
      const bk = smooth(back);

      body.position.y += -0.16 * cr - 0.36 * lo + 0.34 * bk;
      body.position.z += 0.12 * cr + 0.16 * lo - 0.22 * bk;
      body.rotation.x += 0.16 * cr + 0.34 * lo - 0.34 * bk;

      mantle.rotation.x += 0.14 * cr + 0.24 * lo - 0.26 * bk;
      head.rotation.x += 0.28 * cr + 0.44 * lo - 0.10 * op - 0.50 * bk;
      for (const e of eyes) e.globe.rotation.x += 0.26 * lo;

      beakUpper.rotation.x += -0.14 * lo;
      beakLower.rotation.x += 0.22 * lo - 0.10 * bk;

      setArmsUniform((arm) => {
        const front = arm.frontness;
        if (front > 0.3) {
          // held closed, lowered, then opened and drawn away
          const hold = 1.30 * (cr * 0.85 + lo * 0.15) * (1 - op);
          arm.root.rotation.x += -0.35 * cr + 0.85 * lo - 0.20 * op - 0.50 * bk;
          curlArm(arm, 0.10 * lo, hold + 0.20 * lo - 0.55 * bk,
            arm.sideness * 0.12 * op, 1.25);
        } else {
          arm.root.rotation.x += 0.22 * lo + 0.10 * bk;
          curlArm(arm, 0.14 * lo, 0.36 * lo + 0.16 * bk);
        }
      });
    }

    else if (action === 'eat') {
      handled = true;
      // Head down to the source; the beak works, cycling 3x; arms feed
      // it inward in the same rhythm.
      const down = clamp(phase / 0.20, 0, 1);
      const upP = clamp((phase - 0.82) / 0.18, 0, 1);
      const hold = smooth(down) * (1 - smooth(upP));
      const chewPhase = clamp((phase - 0.18) / 0.64, 0, 1);
      const chew = Math.sin(chewPhase * TAU * 3) * 0.5 + 0.5;
      const chewActive = (phase > 0.16 && phase < 0.86) ? 1 : 0;
      const ch = chew * chewActive;

      body.position.y += -0.46 * hold - 0.05 * ch;
      body.position.z += 0.20 * hold;
      body.rotation.x += 0.42 * hold + 0.05 * ch;

      mantle.rotation.x += 0.26 * hold;
      mantle.scale.set(1 + ch * 0.03, 1 - ch * 0.03, 1 + ch * 0.03);
      head.rotation.x += 0.58 * hold + 0.10 * ch;
      for (const e of eyes) e.lid.rotation.x += 0.35 * hold + 0.20 * ch;

      // the beak is what eats
      beakUpper.rotation.x += -0.42 * ch - 0.06 * hold;
      beakLower.rotation.x += 0.62 * ch + 0.10 * hold;
      beak.position.z += 0.05 * hold;

      setArmsUniform((arm, i) => {
        const front = arm.frontness;
        const off = (i % 3) * 0.33;
        const feed = Math.sin((chewPhase * 3 + off) * TAU) * 0.5 + 0.5;
        if (front > 0.1) {
          arm.root.rotation.x += 0.34 * hold - 0.30 * feed * chewActive;
          curlArm(arm, 0.20 * hold, 0.55 * hold + 0.75 * feed * chewActive, 0, 1.2);
        } else {
          arm.root.rotation.x += 0.26 * hold;
          curlArm(arm, 0.16 * hold, 0.34 * hold + 0.14 * feed * chewActive);
        }
      });
    }

    else if (action === 'drink') {
      handled = true;
      // Slower and stiller than eating: down, held, up.
      const down = clamp(phase / 0.26, 0, 1);
      const upP = clamp((phase - 0.76) / 0.24, 0, 1);
      const hold = smooth(down) * (1 - smooth(upP));
      const draw = (Math.sin(phase * TAU * 1.6) * 0.5 + 0.5) * hold;   // slow pull

      body.position.y += -0.54 * hold;
      body.position.z += 0.24 * hold;
      body.rotation.x += 0.50 * hold;

      mantle.rotation.x += 0.28 * hold;
      mantle.scale.set(1 - draw * 0.03, 1 + draw * 0.05, 1 - draw * 0.03);
      head.rotation.x += 0.66 * hold;
      for (const e of eyes) {
        e.lid.rotation.x += 0.55 * hold;
        e.globe.rotation.x += 0.22 * hold;
      }

      beakUpper.rotation.x += -0.12 * hold - 0.06 * draw;
      beakLower.rotation.x += 0.18 * hold + 0.10 * draw;
      siphon.scale.setScalar(1 + draw * 0.10);

      setArmsUniform((arm) => {
        const front = arm.frontness;
        arm.root.rotation.x += (front > 0.1 ? 0.48 : 0.24) * hold;
        arm.root.rotation.y += arm.sideness * 0.14 * hold;
        curlArm(arm, 0.16 * hold, (front > 0.1 ? 0.55 : 0.36) * hold + 0.06 * draw);
      });
    }

    else if (action === 'jump') {
      handled = true;
      // Crouch and load through the first third, then extend. Ends
      // committed and reaching — an octopus does this by coiling every
      // arm and firing them straight while the mantle jets.
      const load = clamp(phase / 0.36, 0, 1);
      const ext = clamp((phase - 0.36) / 0.64, 0, 1);
      const l = smooth(load) * (1 - smooth(ext));
      const e = ease(ext);

      body.position.y += -0.62 * l + 0.85 * e;
      body.position.z += -0.10 * l + 0.28 * e;
      body.rotation.x += 0.36 * l - 0.42 * e;

      mantle.rotation.x += 0.26 * l - 0.34 * e;
      mantle.scale.set(1 + l * 0.10 - e * 0.14, 1 - l * 0.12 + e * 0.20,
                       1 + l * 0.10 - e * 0.14);
      head.rotation.x += 0.30 * l - 0.46 * e;
      for (const ey of eyes) ey.lid.rotation.x += 0.30 * l;

      siphon.rotation.x += 0.30 * l - 0.60 * e;
      siphon.scale.setScalar(1 + l * 0.10 + e * 0.40);

      for (let i = 0; i < carapacePlates.length; i++) {
        carapacePlates[i].scale.setScalar(1 - l * 0.03 + e * 0.02);
      }

      setArmsUniform((arm) => {
        // coil tight, then snap straight and trail
        arm.root.rotation.x += 0.55 * l - 0.95 * e;
        arm.root.rotation.y += arm.sideness * (0.20 * l - 0.10 * e);
        curlArm(arm, 0.30 * l - 0.20 * e, 1.15 * l - 0.95 * e, 0, 1.1);
      });
    }

    else if (action === 'land') {
      handled = true;
      // Reach for the ground, take the shock, compress, push back up.
      const reach = clamp(phase / 0.28, 0, 1);
      const impact = clamp((phase - 0.28) / 0.16, 0, 1);
      const rise = clamp((phase - 0.44) / 0.56, 0, 1);

      const r = smooth(reach) * (1 - smooth(impact));
      const im = arc(impact) * (1 - smooth(rise) * 0.6);
      const comp = smooth(impact) * (1 - smooth(rise));
      const up = smooth(rise);

      body.position.y += 0.28 * r - 0.62 * comp - 0.18 * im + 0.02 * up;
      body.rotation.x += -0.24 * r + 0.36 * comp;

      mantle.rotation.x += -0.20 * r + 0.26 * comp;
      mantle.scale.set(1 + comp * 0.12, 1 - comp * 0.14, 1 + comp * 0.12);
      head.rotation.x += -0.16 * r + 0.34 * comp - 0.06 * up;
      for (const ey of eyes) ey.lid.rotation.x += 0.45 * comp;

      for (let i = 0; i < carapacePlates.length; i++) {
        carapacePlates[i].rotation.x += im * 0.10 * (1 + i * 0.2);
      }

      setArmsUniform((arm) => {
        // arms splay out and down to catch, then fold under the load
        arm.root.rotation.x += -0.55 * r + 0.62 * comp - 0.10 * up;
        arm.root.rotation.y += arm.sideness * (0.34 * r + 0.14 * comp);
        curlArm(arm, -0.20 * r + 0.24 * comp, -0.35 * r + 0.95 * comp - 0.10 * up);
      });
    }

    else if (action === 'signal') {
      handled = true;
      // Rise, open, spread every arm and every carapace band, hold,
      // come back down. The display posture.
      const rise = clamp(phase / 0.24, 0, 1);
      const hold = phase < 0.24 ? 0
                 : phase < 0.68 ? 1
                 : 1 - smooth((phase - 0.68) / 0.32);
      const openK = clamp(Math.max(smooth(rise) * (phase < 0.68 ? 1 : 0), hold), 0, 1);
      const k = openK;
      const flare = k * (1 + Math.sin(phase * TAU * 4) * 0.10);

      body.position.y += 0.55 * k;
      body.rotation.x += -0.34 * k;

      mantle.rotation.x += -0.30 * k;
      mantle.scale.set(1 + k * 0.16, 1 + k * 0.10, 1 + k * 0.16);

      // carapace bands fan open like a hood
      for (let i = 0; i < carapacePlates.length; i++) {
        const kk = i / (carapacePlates.length - 1);
        carapacePlates[i].rotation.x += -flare * (0.16 + kk * 0.22);
        carapacePlates[i].scale.setScalar(1 + flare * (0.05 + kk * 0.08));
        carapacePlates[i].position.y += flare * 0.05 * kk;
      }
      crown.rotation.x += -k * 0.24;
      crown.scale.setScalar(1 + k * 0.12);

      head.rotation.x += -0.44 * k;
      for (const e of eyes) {
        e.lid.rotation.x += -0.28 * k;   // eyes wide
        e.globe.rotation.x += -0.16 * k;
      }

      // the call comes out of the beak and the siphon
      beakUpper.rotation.x += -0.55 * k;
      beakLower.rotation.x += 0.95 * k;
      siphon.scale.setScalar(1 + k * 0.45);
      siphon.rotation.x += -0.35 * k;

      setArmsUniform((arm, i) => {
        // all eight thrown wide and up — the umbrella display
        const wob = Math.sin(phase * TAU * 3 + i * 0.7) * 0.10 * k;
        arm.root.rotation.x += -0.95 * k + wob;
        arm.root.rotation.y += arm.sideness * 0.55 * k;
        arm.root.rotation.z += arm.frontness * 0.20 * k;
        curlArm(arm, -0.30 * k, -0.55 * k + wob * 2.0,
          (i % 2 ? 1 : -1) * 0.22 * k, 1.2);
      });
    }

    else if (action === 'sleep') {
      handled = true;
      // Lower onto the ground, fold the arms in over the body, plates
      // clamp, lids shut. Ends at rest and STAYS.
      const k = smooth(clamp(phase / 0.82, 0, 1));
      const settle = Math.sin(t * 0.5) * 0.012 * k;    // faint breathing at rest

      body.position.y += -0.86 * k;
      body.rotation.x += 0.16 * k;
      body.rotation.z += 0.10 * k;

      mantle.rotation.x += 0.20 * k;
      mantle.rotation.z += 0.10 * k;
      mantle.scale.set(1 + k * 0.05 + settle, 1 - k * 0.10, 1 + k * 0.05 + settle);

      for (let i = 0; i < carapacePlates.length; i++) {
        carapacePlates[i].scale.setScalar(1 - k * 0.03);
        carapacePlates[i].rotation.x += k * 0.06;
      }

      head.rotation.x += 0.42 * k;
      head.rotation.z += 0.14 * k;
      head.position.y += -0.10 * k;
      for (const e of eyes) {
        e.lid.rotation.x += 1.05 * k;    // armoured lids shut
        e.globe.rotation.x += 0.20 * k;
      }
      beakUpper.rotation.x += -0.05 * k;
      beakLower.rotation.x += 0.06 * k;
      siphon.scale.setScalar(1 - k * 0.10);

      setArmsUniform((arm, i) => {
        // arms curl in and blanket the body
        arm.root.rotation.x += -0.62 * k;
        arm.root.rotation.y += arm.sideness * -0.28 * k;
        curlArm(arm, 0.10 * k, 1.55 * k + settle * 6,
          (i % 2 ? 1 : -1) * 0.16 * k, 1.25);
      });
    }

    else if (action === 'wake') {
      handled = true;
      // From the sleep pose back to standing: a stir, a push, a settle.
      // k goes 1 -> 0 across the phase (the inverse of sleep).
      const stir = clamp(phase / 0.24, 0, 1);
      const push = clamp((phase - 0.24) / 0.42, 0, 1);
      const settleP = clamp((phase - 0.66) / 0.34, 0, 1);
      const k = 1 - smooth(clamp((phase - 0.10) / 0.80, 0, 1));
      const twitch = Math.sin(stir * TAU * 2) * 0.10 * (1 - smooth(push));
      const over = arc(settleP) * 0.10;   // small overshoot settling in

      body.position.y += -0.86 * k + over * 0.5;
      body.rotation.x += 0.16 * k - over * 0.4;
      body.rotation.z += 0.10 * k + twitch * 0.10;

      mantle.rotation.x += 0.20 * k - over * 0.3;
      mantle.rotation.z += 0.10 * k;
      mantle.scale.set(1 + k * 0.05, 1 - k * 0.10 + over * 0.10, 1 + k * 0.05);

      for (let i = 0; i < carapacePlates.length; i++) {
        carapacePlates[i].scale.setScalar(1 - k * 0.03 + over * 0.03);
        carapacePlates[i].rotation.x += k * 0.06 - over * 0.06;
      }

      head.rotation.x += 0.42 * k - over * 0.5 + twitch * 0.16;
      head.rotation.z += 0.14 * k;
      head.rotation.y += twitch * 0.30;
      head.position.y += -0.10 * k;
      for (const e of eyes) {
        e.lid.rotation.x += 1.05 * k - over * 0.35;
        e.globe.rotation.y += twitch * 0.6;
      }
      beakUpper.rotation.x += -0.05 * k - over * 0.20;
      beakLower.rotation.x += 0.06 * k + over * 0.35;
      siphon.scale.setScalar(1 - k * 0.10 + over * 0.15);

      setArmsUniform((arm, i) => {
        const t2 = twitch * (i % 2 ? 1 : -1);
        arm.root.rotation.x += -0.62 * k + over * 0.25 + t2 * 0.20;
        arm.root.rotation.y += arm.sideness * -0.28 * k;
        curlArm(arm, 0.10 * k, 1.55 * k - over * 0.35,
          (i % 2 ? 1 : -1) * 0.16 * k, 1.25);
      });
    }

    else if (action === 'die') {
      handled = true;
      // Rear once, buckle, collapse sideways, arms go slack and splay.
      // The last frame is a wreck on the ground.
      const rear = arc(clamp(phase / 0.20, 0, 1)) * (1 - clamp((phase - 0.24) / 0.2, 0, 1));
      const fall = smooth(clamp((phase - 0.20) / 0.42, 0, 1));
      const dead = smooth(clamp((phase - 0.55) / 0.45, 0, 1));
      const spasm = Math.sin(phase * TAU * 5) * Math.max(0, 1 - phase * 2.2) * 0.10;

      body.position.y += 0.22 * rear - 1.00 * fall;
      body.position.z += -0.10 * rear + 0.16 * fall;
      body.rotation.x += -0.30 * rear + 0.30 * fall + spasm;
      body.rotation.z += 0.10 * rear + 1.10 * fall;   // topples onto its side
      body.rotation.y += 0.18 * fall;

      mantle.rotation.x += -0.24 * rear + 0.22 * fall;
      mantle.rotation.z += 0.26 * fall;
      // deflates as it dies
      const deflate = dead * 0.16;
      mantle.scale.set(1 - deflate, 1 - deflate * 1.4, 1 - deflate);

      for (let i = 0; i < carapacePlates.length; i++) {
        carapacePlates[i].rotation.x += -rear * 0.10 + fall * 0.06 + spasm * 0.4;
        carapacePlates[i].scale.setScalar(1 - dead * 0.02);
      }

      head.rotation.x += -0.34 * rear + 0.60 * fall + 0.16 * dead;
      head.rotation.z += 0.34 * fall;
      for (const e of eyes) {
        e.lid.rotation.x += -0.30 * rear + 0.85 * dead;
        e.globe.rotation.x += 0.30 * dead;
      }
      beakUpper.rotation.x += -0.45 * rear - 0.10 * dead;
      beakLower.rotation.x += 0.80 * rear + 0.35 * dead;   // jaw hangs open
      siphon.scale.setScalar(1 - dead * 0.25);

      setArmsUniform((arm, i) => {
        const s2 = (i % 2 ? 1 : -1);
        // thrash on the rear, then go limp and sprawl
        arm.root.rotation.x += -0.55 * rear + 0.75 * fall - 0.30 * dead + spasm * s2;
        arm.root.rotation.y += arm.sideness * (0.30 * rear + 0.45 * fall);
        arm.root.rotation.z += s2 * 0.20 * fall;
        curlArm(arm,
          -0.20 * rear + 0.18 * fall,
          -0.45 * rear + 0.55 * fall - 0.45 * dead + spasm * 2.0 * s2,
          s2 * (0.20 * fall + 0.10 * dead), 1.1);
      });
    }

    else if (action === 'evolve') {
      handled = true;
      // Brace, split open along the plate seams, hold at the top, close.
      const brace = clamp(phase / 0.22, 0, 1);
      const openR = clamp((phase - 0.22) / 0.22, 0, 1);
      const holdR = phase > 0.44 && phase < 0.70 ? 1 : 0;
      const closeR = clamp((phase - 0.70) / 0.30, 0, 1);

      const br = smooth(brace) * (1 - smooth(openR));
      const op = Math.max(smooth(openR) * (1 - smooth(closeR)),
                          holdR * (1 - smooth(closeR)));
      const shudder = Math.sin(phase * TAU * 14) * op * 0.035
                    + Math.sin(phase * TAU * 26) * br * 0.02;

      body.position.y += -0.30 * br + 0.42 * op;
      body.rotation.x += 0.24 * br - 0.20 * op + shudder;
      body.rotation.z += shudder * 0.6;

      mantle.rotation.x += 0.18 * br - 0.22 * op;
      mantle.scale.set(1 + br * 0.04 + op * 0.20, 1 - br * 0.06 + op * 0.16,
                       1 + br * 0.04 + op * 0.20);

      // the seams: bands lift and separate, light pours from between
      for (let i = 0; i < carapacePlates.length; i++) {
        const kk = i / (carapacePlates.length - 1);
        carapacePlates[i].position.y += op * (0.10 + kk * 0.16);
        carapacePlates[i].rotation.x += -op * (0.20 + kk * 0.26) + br * 0.06 + shudder;
        carapacePlates[i].scale.setScalar(1 + op * 0.10 - br * 0.03);
      }
      crown.position.y += op * 0.34;
      crown.rotation.x += -op * 0.20;
      crown.scale.setScalar(1 + op * 0.16);

      head.rotation.x += 0.20 * br - 0.40 * op + shudder * 1.5;
      for (const e of eyes) {
        e.lid.rotation.x += 0.55 * br - 0.35 * op;
        e.globe.rotation.x += -0.15 * op;
      }
      beakUpper.rotation.x += -0.20 * br - 0.40 * op;
      beakLower.rotation.x += 0.30 * br + 0.70 * op;
      siphon.scale.setScalar(1 + op * 0.35);

      setArmsUniform((arm, i) => {
        const s2 = (i % 2 ? 1 : -1);
        // planted hard while bracing, then thrown outward as it opens
        arm.root.rotation.x += 0.55 * br - 0.75 * op + shudder * s2;
        arm.root.rotation.y += arm.sideness * (0.16 * br + 0.42 * op);
        curlArm(arm, 0.30 * br - 0.25 * op, 0.85 * br - 0.60 * op + shudder * 3.0 * s2,
          s2 * 0.18 * op, 1.15);
      });
    }

    // =================================================================
    // No action: gait + overlays
    // =================================================================
    if (!handled) {
      if (airborne) {
        // Off the ground the arms STOP crawling. The mantle leads, the
        // arms stream back in a soft bell and pulse slowly — a jetting
        // octopus, not a body pedalling in mid-air.
        const beat = Math.sin(t * 2.6);
        const bell = beat * 0.5 + 0.5;

        body.rotation.x += -0.34 + beat * 0.06;
        body.position.y += 0.06 + beat * 0.05;

        mantle.rotation.x += -0.28;
        mantle.scale.set(1 - bell * 0.09, 1 + bell * 0.12, 1 - bell * 0.09);

        head.rotation.x += -0.20 + turn * 0.10;
        head.rotation.y += turn * 0.35;
        for (const e of eyes) e.lid.rotation.x += 0.18;

        siphon.rotation.x += -0.55;
        siphon.scale.setScalar(1 + bell * 0.32);

        for (let i = 0; i < carapacePlates.length; i++) {
          const kk = i / (carapacePlates.length - 1);
          carapacePlates[i].rotation.x += -bell * 0.03 * kk;
        }

        for (let i = 0; i < arms.length; i++) {
          const arm = arms[i];
          const s2 = (i % 2 ? 1 : -1);
          const trail = Math.sin(t * 2.6 - i * 0.5) * 0.12;
          // all eight swept back into a streamlined bundle
          arm.root.rotation.x += -0.85 + bell * 0.22 + trail * 0.4;
          arm.root.rotation.y += arm.sideness * 0.16;
          arm.root.rotation.z += s2 * 0.06;
          for (let j = 0; j < arm.segs.length; j++) {
            const tt = j / (arm.segs.length - 1);
            const w = Math.sin(t * 2.6 - tt * 2.2 - i * 0.5);
            arm.segs[j].node.rotation.x += -0.22 * tt + w * 0.14 * tt
                                          + bell * 0.10 * tt;
            arm.segs[j].node.rotation.z += w * 0.10 * tt * s2;
          }
          arm.pauldron.rotation.x += -0.08;
        }
      } else {
        for (let i = 0; i < arms.length; i++) armPose(arms[i], i);
      }

      // wounded overlay — favour one side, let two arms hang and drag
      if (hurt > 0.05 && !airborne) {
        const drag = hurt;
        for (let i = 0; i < arms.length; i++) {
          if (i % 4 !== 0) continue;              // two of the eight go limp
          const arm = arms[i];
          arm.root.rotation.x += 0.34 * drag;
          arm.root.rotation.z += 0.22 * drag;
          for (let j = 0; j < arm.segs.length; j++) {
            const tt = j / (arm.segs.length - 1);
            arm.segs[j].node.rotation.x += 0.34 * drag * tt;
            arm.segs[j].node.rotation.z += 0.16 * drag * tt;
          }
        }
        // a plate hangs loose
        if (carapacePlates[2]) {
          carapacePlates[2].rotation.x += drag * 0.18;
          carapacePlates[2].rotation.z += drag * 0.14;
        }
        crown.rotation.z += drag * 0.16;
        siphon.scale.setScalar(1 - drag * 0.12);
        // laboured breathing
        const gasp = Math.sin(t * 2.4) * 0.5 + 0.5;
        mantle.scale.multiplyScalar(1 + gasp * 0.035 * drag);
      }
    }
  };

  // Fallback clock animation (ambient drift when nothing drives pose).
  root.userData.update = (t, dt) => {
    if (!root.userData._posed) {
      root.userData.pose({ t, dt, speed: 0, stride: 0, turn: 0,
        grounded: true, health: 1, action: null, phase: 0 });
    }
  };

  // Prime the rig into its standing pose.
  root.userData.pose({ t: 0, dt: 0, speed: 0, stride: 0, turn: 0,
    grounded: true, health: 1, action: null, phase: 0 });

  return root;
}