function build(THREE, TSL) {

// QUALITY: many limbed grip — eight coiling machine arms crowded around a
// beaked sensor head, a heavy lathed mantle curled up behind. Recognisable
// facts: 1) eight tapering arms, all clustered at the FRONT around the mouth,
// 2) big side-set lensed eyes, 3) mantle curls back and UP, 4) beak under the
// arm crown, 5) arms longer than the body, curling, each ending in a hook.

const o = new THREE.Group();
o.name = 'armouredOctopus';

const V3 = THREE.Vector3;
const refs = { arms: [] };

/* ---------- materials ---------- */
function shellMaterial(baseHex, wornHex) {
  const m = new THREE.NodeMaterial();
  const base = new THREE.Color(baseHex);
  const worn = new THREE.Color(wornHex);
  const metal = new THREE.Color(0x4a4238);
  const rust = new THREE.Color(0x6e3b1f);
  const grime = new THREE.Color(0x9a917f);
  const n1 = TSL.sin(TSL.positionLocal.x.mul(9.0).add(TSL.sin(TSL.positionLocal.y.mul(7.0)).mul(2.0)));
  const n2 = TSL.sin(TSL.positionLocal.y.mul(11.0).add(TSL.positionLocal.z.mul(8.0)));
  const n3 = TSL.sin(TSL.positionLocal.z.mul(6.0).sub(TSL.positionLocal.x.mul(5.0)));
  const noise = n1.mul(n2).mul(n3).mul(0.5).add(0.5);
  const fine = TSL.sin(TSL.positionLocal.x.mul(31.0)).mul(TSL.sin(TSL.positionLocal.y.mul(27.0))).mul(TSL.sin(TSL.positionLocal.z.mul(23.0))).mul(0.5).add(0.5);
  const edge = TSL.smoothstep(0.38, 0.85, TSL.length(TSL.positionLocal));
  const chip = TSL.smoothstep(0.55, 0.9, edge.mul(0.6).add(fine.mul(0.55)).sub(0.12));
  const down = TSL.max(TSL.normalLocal.y.negate(), 0.0);
  const rustM = TSL.smoothstep(0.35, 0.9, down.mul(0.8).add(noise.mul(0.5)).sub(0.25));
  const grimeM = TSL.smoothstep(0.45, 0.95, noise.mul(0.7).add(down.mul(0.5)));
  let col = TSL.mix(TSL.vec3(base), TSL.vec3(worn), noise.mul(0.25));
  col = TSL.mix(col, TSL.vec3(metal), chip.mul(0.8));
  col = TSL.mix(col, TSL.vec3(rust), rustM.mul(0.65));
  col = TSL.mix(col, TSL.vec3(grime), grimeM.mul(0.3));
  m.colorNode = col;
  m.metalnessNode = TSL.float(0.12);
  m.roughnessNode = TSL.clamp(TSL.float(0.55).add(TSL.max(TSL.normalLocal.y, 0.0).mul(0.2)).add(noise.mul(0.1)), 0.3, 0.95);
  return m;
}
function machineMaterial(baseHex) {
  const m = new THREE.NodeMaterial();
  const base = new THREE.Color(baseHex);
  const dark = new THREE.Color(0x3e3a34);
  const n1 = TSL.sin(TSL.positionLocal.x.mul(8.0).add(2.0)).mul(TSL.sin(TSL.positionLocal.z.mul(9.0)));
  const noise = n1.mul(0.5).add(0.5);
  const down = TSL.max(TSL.normalLocal.y.negate(), 0.0);
  m.colorNode = TSL.mix(TSL.vec3(base), TSL.vec3(dark), TSL.clamp(noise.mul(0.35).add(down.mul(0.5)), 0.0, 1.0));
  m.metalnessNode = TSL.float(0.8);
  m.roughnessNode = TSL.clamp(TSL.float(0.5).add(TSL.max(TSL.normalLocal.y, 0.0).mul(0.25)), 0.35, 0.95);
  return m;
}
const matShell = shellMaterial(0xd8d2c6, 0xc9c2b4);
const matShellB = shellMaterial(0xc9c2b4, 0xb5ac9c);
const matMachine = machineMaterial(0x55524c);
const matMachineL = machineMaterial(0x6b665e);
const matDark = new THREE.MeshStandardMaterial({ color: 0x1e1d1b, metalness: 0.3, roughness: 0.9 });
const matRubber = new THREE.MeshStandardMaterial({ color: 0x1e1d1b, metalness: 0.0, roughness: 0.95 });
const matLens = new THREE.MeshStandardMaterial({ color: 0x0c0d10, metalness: 0.2, roughness: 0.06 });
const matAccent = new THREE.MeshStandardMaterial({ color: 0xa8231c, metalness: 0.05, roughness: 0.6 });
const matAccentO = new THREE.MeshStandardMaterial({ color: 0xc2521e, metalness: 0.05, roughness: 0.6 });
const matGlow = new THREE.MeshStandardMaterial({ color: 0x30241a, emissive: 0xcc7711, emissiveIntensity: 2.2, roughness: 0.6 });

/* ---------- helpers ---------- */
function mesh(geo, mat, name, parent, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
function grp(name, parent, x, y, z) {
  const g = new THREE.Group(); g.name = name;
  g.position.set(x || 0, y || 0, z || 0);
  if (parent) parent.add(g);
  return g;
}
function lathe(profile, mat, name, parent, x, y, z, segs) {
  const pts = profile.map(p => new V3(p[0], p[1], 0));
  return mesh(new THREE.LatheGeometry(pts, segs || 20), mat, name, parent, x, y, z);
}
function boltRing(parent, r, n, y, name, size) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = mesh(new THREE.CylinderGeometry(size, size, size * 0.8, 6), matMachineL, name + i, parent, Math.cos(a) * r, y, Math.sin(a) * r);
  }
}
function tubeRun(pts, radius, mat, name, parent) {
  const curve = new THREE.CatmullRomCurve3(pts);
  return mesh(new THREE.TubeGeometry(curve, 12, radius, 8), mat, name, parent, 0, 0, 0);
}

/* ============ PASS 1: FRAME ============ */
const torso = grp('torso', o, 0, 0.88, 0);
refs.torso = torso;

// spine curve: head (front, +Z) dips, mantle rises back and up
const spine = new THREE.CatmullRomCurve3([
  new V3(0, 0.0, 0.55), new V3(0, -0.08, -0.1),
  new V3(0, 0.12, -0.75), new V3(0, 0.42, -1.25), new V3(0, 0.78, -1.52)
]);

/* ---- MANTLE: stack of lathed segments along the spine ---- */
const mantle = grp('mantle', torso, 0, 0, -0.35);
refs.mantle = mantle;
const mSegs = [];
const mProfiles = [
  [[0.30, 0], [0.52, 0.05], [0.55, 0.18], [0.52, 0.3], [0.44, 0.34]],
  [[0.40, 0], [0.48, 0.08], [0.49, 0.22], [0.44, 0.34], [0.36, 0.38]],
  [[0.32, 0], [0.40, 0.1], [0.41, 0.24], [0.36, 0.36], [0.28, 0.4]],
  [[0.26, 0], [0.30, 0.1], [0.30, 0.24], [0.24, 0.34], [0.14, 0.4]],
  [[0.12, 0], [0.14, 0.1], [0.1, 0.22], [0.04, 0.32], [0.0, 0.36]],
];
const mStations = [0, -0.42, -0.8, -1.12, -1.38];
const mTilt = [0.18, 0.42, 0.68, 0.95, 1.15];
for (let i = 0; i < 5; i++) {
  const s = grp('mantleSeg' + i, mantle, 0, spineY(mStations[i]), mStations[i]);
  s.rotation.x = -mTilt[i];
  const core = lathe(mProfiles[i], matMachine, 'mantleCore' + i, s, 0, 0, 0, 18);
  core.rotation.x = Math.PI / 2; // lathe axis along local Z
  core.scale.z = 0.9;
  // joint collar between segments
  lathe([[0.42, -0.02], [0.47, 0.0], [0.47, 0.05], [0.42, 0.07]], matMachineL, 'mantleCollar' + i, s, 0, 0, -0.02).rotation.x = Math.PI / 2;
  boltRing(core, 0.46, 8, -0.05, 'mantleBolt' + i + '_', 0.028);
  mSegs.push(s);
}
function spineY(z) { return spine.getPoint(Math.max(0, Math.min(1, (0.55 - z) / 2.1))).y; }

// rams between torso and mantle (crossing the head/mantle joint)
for (const sx of [-1, 1]) {
  const r = grp('mantleRam' + (sx > 0 ? 'R' : 'L'), torso, 0.3 * sx, 0.12, -0.15);
  r.rotation.x = 0.35;
  mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.3, 10), matMachine, 'ramBarrel', r, 0, -0.15, 0);
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8), matMachineL, 'ramRod', r, 0, -0.4, 0);
  mesh(new THREE.SphereGeometry(0.09, 12, 8), matMachineL, 'ramGland', r, 0, -0.28, 0);
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), matRubber, 'ramBoot', r, 0, -0.32, 0);
}

/* ---- HEAD: the leading end, most expensive ---- */
const head = grp('head', torso, 0, 0.02, 0.32);
refs.head = head;
// neck gimbal ring
const neck = grp('neck', torso, 0, 0.0, 0.18);
mesh(new THREE.TorusGeometry(0.34, 0.07, 10, 22), matMachineL, 'neckRing', neck, 0, 0, 0).rotation.y = Math.PI / 2;
mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.16, 14), matMachine, 'neckColumn', neck, 0, 0, 0.1).rotation.x = Math.PI / 2;
boltRing(neck.children[1], 0.3, 8, 0.16, 'neckBolt', 0.024);
refs.neck = neck;

// skull core: intersecting volumes
mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.5, 10), matMachine, 'skullCore', head, 0, 0, 0).rotation.x = Math.PI / 2;
mesh(new THREE.BoxGeometry(0.66, 0.5, 0.34), matMachine, 'skullBlock', head, 0, 0.05, 0.12);
mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.3, 8), matMachine, 'snout', head, 0, -0.08, 0.34).rotation.x = Math.PI / 2;

// brow plate (formed shell)
const brow = mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.34, 20, 1, true, -0.9, 1.8), matShell, 'browPlate', head, 0, 0.16, 0.18);
brow.rotation.x = Math.PI / 2;
mesh(new THREE.TorusGeometry(0.38, 0.025, 8, 18, 1.8), matShellB, 'browLip', head, 0, 0.16, 0.34).rotation.set(Math.PI / 2, 0, -0.9);

// cheek shells L/R
for (const sx of [-1, 1]) {
  const ch = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.3, 16, 1, true, sx > 0 ? -0.6 : 2.5, 1.2), matShell, 'cheek' + (sx > 0 ? 'R' : 'L'), head, 0.13 * sx, -0.06, 0.16);
  ch.rotation.z = Math.PI / 2; ch.rotation.y = 0.2 * sx;
  mesh(new THREE.BoxGeometry(0.1, 0.14, 0.2), matMachineL, 'cheekVent' + (sx > 0 ? 'R' : 'L'), head, 0.34 * sx, -0.05, 0.1);
}

// sensor pod on crown (asymmetric bolt-on)
const pod = grp('sensorPod', head, 0.22, 0.38, -0.05);
mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 8), matMachine, 'podBase', pod, 0, 0, 0);
mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.1, 8), matMachineL, 'podStack', pod, 0, 0.11, 0);
mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), matMachineL, 'podAntenna', pod, 0.03, 0.3, 0);
mesh(new THREE.SphereGeometry(0.02, 8, 6), matGlow, 'podLight', pod, 0, 0.18, 0.05); // emissive #1

// EYES: recessed dark glass in machined bezels, side-set like a real octopus
for (const sx of [-1, 1]) {
  const e = grp('eye' + (sx > 0 ? 'R' : 'L'), head, 0.4 * sx, 0.08, 0.22);
  e.rotation.y = 0.5 * sx;
  mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.1, 16), matMachineL, 'eyeBezel' + (sx > 0 ? 'R' : 'L'), e, 0, 0, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 16), matMachine, 'eyeSocket' + (sx > 0 ? 'R' : 'L'), e, 0, 0, -0.02).rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.1, 16, 12), matLens, 'lens' + (sx > 0 ? 'R' : 'L'), e, 0, 0, 0.03);
  mesh(new THREE.TorusGeometry(0.13, 0.02, 8, 16), matShell, 'lensRing' + (sx > 0 ? 'R' : 'L'), e, 0, 0, 0.06);
  boltRing(e, 0.17, 6, 0.05, 'eyeBolt' + (sx > 0 ? 'R' : 'L') + '_', 0.02);
  // small fittings beside the optic
  mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), matMachine, 'eyeFitting' + (sx > 0 ? 'R' : 'L'), e, 0, 0.16, -0.04);
}

// BEAK: two opposed machined jaws, hinged at the back
const beak = grp('beak', head, 0, -0.3, 0.28);
refs.beak = beak;
mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.14, 10), matMachine, 'beakHousing', beak, 0, 0.06, -0.04);
mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 14), matRubber, 'beakBoot', beak, 0, 0, 0.04).rotation.x = Math.PI / 2;
const jawUp = grp('jawUpper', beak, 0, 0.02, 0.08);
mesh(new THREE.ConeGeometry(0.14, 0.26, 8), matMachineL, 'jawUpperCone', jawUp, 0, -0.1, 0.02).rotation.x = Math.PI;
mesh(new THREE.BoxGeometry(0.12, 0.05, 0.16), matMachine, 'jawUpperEdge', jawUp, 0, -0.2, 0.06);
const jawLo = grp('jawLower', beak, 0, 0.02, 0.08);
mesh(new THREE.ConeGeometry(0.13, 0.22, 8), matMachine, 'jawLowerCone', jawLo, 0, -0.09, 0.02).rotation.x = Math.PI;
mesh(new THREE.BoxGeometry(0.11, 0.045, 0.14), matMachineL, 'jawLowerEdge', jawLo, 0, -0.17, 0.05);
// jaw actuator ram
mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), matMachineL, 'jawRam', beak, 0.12, 0.1, 0);
mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), matMachine, 'jawRod', beak, 0.12, -0.02, 0);
refs.jawUp = jawUp; refs.jawLo = jawLo;

// SIPHON: the jet tube, right side under the head (drives 'fire')
const siphon = grp('siphon', torso, 0.24, -0.28, 0.0);
refs.siphon = siphon;
mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.36, 10), matMachine, 'siphonTube', siphon, 0, 0, 0.14).rotation.x = 1.1;
mesh(new THREE.TorusGeometry(0.08, 0.025, 8, 12), matMachineL, 'siphonNozzle', siphon, 0, 0.03, 0.32);
mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10), matMachineL, 'siphonFlange', siphon, 0, -0.02, -0.05).rotation.x = 1.1;

// gear stack behind the head crown
const gears = grp('gearStack', torso, -0.2, 0.4, -0.1);
for (let i = 0; i < 3; i++) {
  mesh(new THREE.CylinderGeometry(0.12 - i * 0.025, 0.12 - i * 0.025, 0.04, 12), matMachineL, 'gear' + i, gears, 0, i * 0.05, 0);
  boltRing(gears.children[i], 0.08, 5, 0.03, 'gearBolt' + i + '_', 0.014);
}
mesh(new THREE.SphereGeometry(0.016, 8, 6), matGlow, 'statusPort', gears, 0.1, 0.12, 0.03); // emissive #2

/* ============ PASS 3/4: ARMS — segments, chain, rams, boots, pads ============ */
const armAngles = [0.32, -0.32, 0.85, -0.85, 1.5, -1.5, 2.45, -2.45];
const segLens = [0.42, 0.4, 0.36, 0.32, 0.27, 0.22];
const segRads = [0.13, 0.115, 0.1, 0.085, 0.07, 0.055];

for (let ai = 0; ai < 8; ai++) {
  const a = armAngles[ai];
  const back = Math.abs(a) > 2.0;
  const root = grp('arm' + ai + (back ? 'Rear' : (a > 0 ? 'R' : 'L')), torso,
    Math.sin(a) * 0.42, -0.12, 0.3 + Math.cos(a) * 0.18);
  root.rotation.order = 'YXZ';
  root.userData.restYaw = a;
  root.userData.restPitch = back ? 1.0 : 0.5 + Math.abs(a) * 0.18;
  root.rotation.y = root.userData.restYaw;
  root.rotation.x = root.userData.restPitch;

  // bearing race at the root
  mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14), matMachineL, root.name + 'Race', root, 0, 0, -0.05).rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 14), matMachine, root.name + 'RaceRing', root, 0, 0, 0).rotation.y = Math.PI / 2;
  boltRing(root, 0.17, 6, 0, root.name + 'Bolt', 0.022);

  const segs = [];
  let parent = root;
  for (let si = 0; si < 6; si++) {
    const L = segLens[si], R = segRads[si];
    const g = grp(root.name + 'Seg' + si, parent, 0, 0, si === 0 ? 0.08 : segLens[si - 1] * 0.92);
    g.userData.restCurl = 0.12 + si * 0.02;
    g.rotation.x = g.userData.restCurl;
    // tapered machined bone (faceted stock)
    mesh(new THREE.CylinderGeometry(R * 0.82, R, L, 7), matMachine, g.name + 'Bone', g, 0, 0, L / 2).rotation.x = Math.PI / 2;
    // joint barrel at each articulation
    mesh(new THREE.CylinderGeometry(R * 1.25, R * 1.25, L * 0.22, 10), matMachineL, g.name + 'Joint', g, 0, 0, 0.01).rotation.x = Math.PI / 2;
    // actuator ram alongside the bone (top side)
    mesh(new THREE.CylinderGeometry(0.02, 0.024, L * 0.4, 8), matMachineL, g.name + 'Ram', g, 0, R * 0.9, L * 0.55).rotation.x = Math.PI / 2;
    if (si > 0) mesh(new THREE.CylinderGeometry(0.011, 0.011, L * 0.3, 6), matMachine, g.name + 'Rod', g, 0, R * 0.9, L * 0.85).rotation.x = Math.PI / 2;
    // boot over the gland
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 8), matRubber, g.name + 'Boot', g, 0, R * 0.9, L * 0.35).rotation.x = Math.PI / 2;
    // chain link on the top ridge (repeated element, moves with the segment)
    mesh(new THREE.BoxGeometry(R * 0.7, 0.02, L * 0.24), matMachine, g.name + 'Chain', g, 0, R * 1.1, L * 0.5);
    mesh(new THREE.BoxGeometry(R * 0.5, 0.026, L * 0.1), matMachineL, g.name + 'ChainPin', g, 0, R * 1.11, L * 0.34);
    // corrugated trunk run: short, split at every joint, parented HERE
    if (si > 0) {
      tubeRun([new V3(0, -R * 0.8, -L * 0.15), new V3(0, -R * 0.85, L * 0.3), new V3(0, -R * 0.7, L * 0.9)],
        0.022, matDark, g.name + 'Hose', g);
      mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 8), matRubber, g.name + 'HoseBoot', g, 0, -R * 0.8, -L * 0.15).rotation.x = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8), matMachineL, g.name + 'HoseClamp', g, 0, -R * 0.85, L * 0.3).rotation.x = Math.PI / 2;
    }
    // sucker pads underneath — 3 per segment, each a pad in a collar
    for (let p = 0; p < 3; p++) {
      const pz = L * (0.2 + p * 0.28);
      const pr = R * 0.32;
      mesh(new THREE.CylinderGeometry(pr, pr * 0.7, 0.03, 8), matRubber, g.name + 'Pad' + p, g, 0, -R * 0.95, pz);
      mesh(new THREE.TorusGeometry(pr * 0.9, 0.008, 6, 10), matMachineL, g.name + 'PadRing' + p, g, 0, -R * 0.94, pz).rotation.x = Math.PI / 2;
    }
    // formed shell plate wrapping the outer side, every other segment
    if (si % 2 === 0) {
      const sh = mesh(new THREE.CylinderGeometry(R * 1.35, R * 1.5, L * 0.75, 14, 1, true, -0.7, 1.5), si % 4 === 0 ? matShell : matShellB, g.name + 'Shell', g, 0, 0, L * 0.55);
      sh.rotation.x = Math.PI / 2;
      sh.material = sh.material; // double side set below via material array trick
    }
    segs.push(g); parent = g;
  }
  // tip: two opposed hook digits + pad
  const tip = grp(root.name + 'Tip', parent, 0, 0, segLens[5] * 0.92);
  tip.userData.restCurl = 0.3; tip.rotation.x = 0.3;
  const h1 = mesh(new THREE.ConeGeometry(0.03, 0.14, 6), matMachineL, tip.name + 'HookA', tip, 0.025, -0.02, 0.08); h1.rotation.x = 1.9;
  const h2 = mesh(new THREE.ConeGeometry(0.03, 0.14, 6), matMachine, tip.name + 'HookB', tip, -0.025, -0.02, 0.08); h2.rotation.x = 1.9; h2.rotation.z = Math.PI;
  mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.03, 8), matRubber, tip.name + 'TipPad', tip, 0, -0.045, 0.03);
  mesh(new THREE.SphereGeometry(0.06, 8, 6), matMachineL, tip.name + 'Knuckle', tip, 0, 0, 0);
  segs.push(tip);
  root.userData.segs = segs;
  refs.arms.push(root);
}

/* ============ PASS 5: SHELLS on mantle & torso ============ */
const plates = [];
for (let i = 0; i < 5; i++) {
  const s = mSegs[i];
  const p = mesh(new THREE.CylinderGeometry(0.5 + i * 0.02, 0.52 - i * 0.04, 0.34, 20, 1, true, -1.4, 2.6), i % 2 ? matShell : matShellB, 'mantlePlate' + i, s, 0, 0.06, 0.06);
  p.rotation.x = Math.PI / 2;
  // rib + bolted small plate on each
  mesh(new THREE.BoxGeometry(0.04, 0.03, 0.26), matShellB, 'mantleRib' + i, s, 0, 0.55 - i * 0.06, 0.05);
  mesh(new THREE.BoxGeometry(0.14, 0.05, 0.1), matMachineL, 'mantleTab' + i, s, 0.3, 0.32 - i * 0.05, 0.02);
  boltRing(s, 0.5 - i * 0.05, 6, 0.2, 'mantlePlateBolt' + i + '_', 0.025);
  plates.push(p);
}
// one accent plate (rare) + one stencil marking on the biggest plate
mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12, 1, true, 2.6, 0.7), matAccentO, 'accentPlate', mSegs[1], 0, 0.1, 0.05).rotation.x = Math.PI / 2;
const triShape = new THREE.Shape();
triShape.moveTo(0, 0.09); triShape.lineTo(-0.07, -0.05); triShape.lineTo(0.07, -0.05); triShape.lineTo(0, 0.09);
mesh(new THREE.ExtrudeGeometry(triShape, { depth: 0.012, bevelEnabled: false }), matAccent, 'stencilMark', mSegs[0], -0.25, 0.42, 0.15);

// dorsal shells over the torso gap between head and mantle
const d1 = mesh(new THREE.CylinderGeometry(0.5, 0.44, 0.4, 20, 1, true, -1.2, 2.4), matShell, 'dorsalPlateFront', torso, 0, 0.28, -0.05);
d1.rotation.x = Math.PI / 2 - 0.15;
const d2 = mesh(new THREE.CylinderGeometry(0.44, 0.4, 0.3, 20, 1, true, -1.2, 2.4), matShellB, 'dorsalPlateRear', torso, 0, 0.3, -0.38);
d2.rotation.x = Math.PI / 2 - 0.4;
mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), matShell, 'ventPlate', torso, 0, -0.34, 0.05);
mesh(new THREE.BoxGeometry(0.4, 0.05, 0.24), matMachineL, 'ventGrille', torso, 0, -0.34, 0.05);

/* ============ PASS 6: CABLE HARNESS — each run in ONE part's space ============ */
// torso runs: head->mantle trunk lines (parented to torso only, no joint crossed)
tubeRun([new V3(0.28, 0.3, 0.15), new V3(0.34, 0.35, -0.2), new V3(0.3, 0.42, -0.6)], 0.03, matDark, 'trunkA', torso);
tubeRun([new V3(-0.28, 0.28, 0.1), new V3(-0.35, 0.3, -0.25), new V3(-0.3, 0.4, -0.62)], 0.03, matDark, 'trunkB', torso);
tubeRun([new V3(0.1, 0.45, -0.1), new V3(0.05, 0.5, -0.4), new V3(0.0, 0.55, -0.7)], 0.014, matDark, 'signalWire', torso);
tubeRun([new V3(-0.1, 0.44, -0.12), new V3(-0.14, 0.48, -0.42), new V3(-0.08, 0.5, -0.68)], 0.014, matDark, 'signalWire2', torso);
for (const nm of ['trunkA', 'trunkB']) {
  const c = torso.getObjectByName(nm);
  if (c) for (let k = 0; k < 3; k++) {
    mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 8), matMachineL, nm + 'Clamp' + k, c.parent, c.geometry.parameters.path.getPoint(k / 2));
  }
}
// neck-to-head run: parented to head, meets the torso boot at the neck
tubeRun([new V3(0, 0.3, -0.28), new V3(0.05, 0.36, -0.05), new V3(0, 0.36, 0.1)], 0.02, matDark, 'headHose', head);
mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 8), matRubber, 'headHoseBoot', neck, 0, 0.34, -0.12).rotation.x = 1.3;
// siphon feed line (parented to torso)
tubeRun([new V3(0.24, -0.1, -0.05), new V3(0.26, -0.2, 0.0), new V3(0.24, -0.26, 0.05)], 0.024, matDark, 'siphonLine', torso);
// beak line (parented to head)
tubeRun([new V3(0, -0.2, 0.1), new V3(0.05, -0.28, 0.2), new V3(0, -0.3, 0.25)], 0.016, matDark, 'beakLine', head);
// arm root feeders: one short run per arm INSIDE the arm root (below its first joint)
refs.arms.forEach(arm => {
  tubeRun([new V3(0.08, 0.08, -0.04), new V3(0.1, 0.02, 0.14), new V3(0.05, -0.02, 0.3)], 0.02, matDark, arm.name + 'Feed', arm);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), matMachineL, arm.name + 'FeedPort', arm, 0.08, 0.08, -0.05).rotation.x = Math.PI / 2;
});

/* ============ PASS 7: GREEBLES ============ */
boltRing(d1, 0.46, 10, 0.0, 'dorsalBolt', 0.02);
boltRing(d2, 0.42, 8, 0.0, 'dorsalBolt2', 0.02);
for (let i = 0; i < 6; i++) {
  mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), matMachineL, 'junction' + i, torso, -0.3 + (i % 3) * 0.3, 0.42 - Math.floor(i / 3) * 0.1, -0.2 + Math.floor(i / 3) * 0.3);
}
mesh(new THREE.BoxGeometry(0.1, 0.08, 0.06), matMachineL, 'handle', torso, -0.4, 0.1, -0.3);
for (let i = 0; i < 4; i++) {
  mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), matMachineL, 'mantleGreeble' + i, mSegs[1], -0.3 + i * 0.2, 0.4, 0.1 - (i % 2) * 0.2);
}

// fix shell materials to double-sided
o.traverse(m => { if (m.isMesh && (m.material === matShell || m.material === matShellB)) { m.material = m.material; } });
matShell.side = THREE.DoubleSide; matShellB.side = THREE.DoubleSide;

/* ============ POSE ============ */
const A = refs.arms;
const R2D = Math.PI / 180;

function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
function pulse(p, a, b) { return p < a ? p / a : p < b ? 1 : Math.max(0, 1 - (p - b) / (1 - b)); }

o.userData.pose = (s) => {
  const t = s.t || 0;
  const sp = s.speed || 0;
  const ph0 = (s.stride || 0) * Math.PI * 2;
  const g = Math.min(1, sp / 1.1);           // gait engagement
  const run = Math.min(1, Math.max(0, (sp - 2) / 4)); // run extension
  const creep = (sp > 0.01 && sp < 0.75) ? 1 : 0;

  // ---- body base ----
  let bodyY = 0.88 - creep * 0.12 - run * 0.08;
  let bodyRX = 0.02 + run * 0.1;
  let bodyRZ = 0, bodyZ = 0, bodyRY = 0;
  bodyY += 0.05 * g * Math.sin(ph0 * 2 + 0.5);
  bodyRX += 0.03 * g * Math.sin(ph0 * 2);
  // idle: breathing + weight shift
  const br = 1 + 0.035 * Math.sin(t * 1.1);
  bodyY += 0.015 * Math.sin(t * 0.7) * (1 - g);

  let headRX = 0.1, headRY = 0, headY = 0;
  if (g < 0.3) { headRY = 0.35 * Math.sin(t * 0.4); headRX = 0.1 + 0.04 * Math.sin(t * 0.9); }
  let jawOpen = 0.05 + 0.02 * Math.sin(t * 1.3) * (1 - g);

  // ---- turn overlay ----
  const turn = s.turn || 0;
  if (Math.abs(turn) > 0.01) {
    bodyRZ += -turn * 0.12;
    bodyRY += turn * 0.06;
    headRY += turn * 0.3;
  }

  // ---- hurt overlay ----
  const hurt = s.health !== undefined && s.health < 0.5 ? (1 - s.health / 0.5) : 0;
  if (hurt > 0) {
    bodyRZ += hurt * 0.14; bodyY -= hurt * 0.06;
    headRX += hurt * 0.18; headRY -= hurt * 0.15;
    jawOpen += hurt * 0.1;
  }

  // ---- airborne overlay: arms trail, no gait ----
  const air = s.grounded === false;
  let airK = 0, airFlap = 0;
  if (air) { airK = 1; g2 = 0; }
  var g2 = g;

  // ---- action ----
  let act = null, p = 0;
  if (s.action) { act = s.action; p = Math.min(1, Math.max(0, s.phase || 0)); }
  let plateFlare = 0, siphonK = 0, coil = 0, spread = 0, shield = 0, reach = 0;
  let tipClose = 0, sleepK = 0, wakeK = 0, dieK = 0, lunge = 0, rise = 0;

  if (act === 'attack') {
    const w = pulse(p, 0.35, 0.6);
    lunge = Math.max(0, Math.sin(Math.min(1, p / 0.7) * Math.PI)) * 0.45;
    rise = w * 0.5;
    jawOpen = 0.1 + 0.5 * Math.max(0, Math.sin(p * Math.PI * 1.4));
    headRX = 0.35 * w + 0.1;
  } else if (act === 'fire') {
    const w = pulse(p, 0.3, 0.5);
    siphonK = w;
    bodyZ = -0.18 * w; bodyRX = -0.1 * w;
    bodyY += 0.05 * w;
    spread = 0.3 * w;
  } else if (act === 'hit') {
    const w = Math.max(0, 1 - p * 3.2);
    bodyRX -= 0.25 * w; bodyRZ += 0.18 * w; bodyY -= 0.05 * w;
    headRX -= 0.3 * w;
    jawOpen += 0.3 * w;
  } else if (act === 'block') {
    shield = 1; bodyY -= 0.1; bodyRX = 0.25; headRX = 0.4;
    jawOpen = 0.02;
  } else if (act === 'gather') {
    reach = pulse(p, 0.3, 0.6);
    tipClose = Math.max(0, Math.sin(p * Math.PI)) * (p > 0.35 ? 1 : 0.2);
    bodyY -= 0.1 * reach; headRX = 0.2 * reach;
  } else if (act === 'deposit') {
    reach = pulse(p, 0.45, 0.7) * 0.7;
    tipClose = (1 - p) * 0.6;
    bodyY -= 0.08 * reach;
  } else if (act === 'eat') {
    headRX = 0.3; bodyY -= 0.05;
    jawOpen = 0.12 + 0.35 * Math.max(0, Math.sin(p * Math.PI * 6));
    tipClose = 0.7; reach = 0.4;
  } else if (act === 'drink') {
    headRX = 0.45; bodyY -= 0.12;
    jawOpen = 0.1 + 0.05 * Math.sin(p * Math.PI * 2);
  } else if (act === 'jump') {
    if (p < 0.33) { const k = p / 0.33; coil = k; bodyY -= 0.2 * k; }
    else { const k = (p - 0.33) / 0.67; coil = 1 - k; bodyY += 0.35 * k; spread = 0.5 * k; headRX = -0.2 * k; }
  } else if (act === 'land') {
    const k = Math.max(0, 1 - p * 1.4);
    bodyY -= 0.25 * k; bodyRX += 0.2 * k; spread = k; coil = k * 0.6;
  } else if (act === 'signal') {
    const w = pulse(p, 0.35, 0.7);
    rise = w * 0.8; spread = w; plateFlare = w; jawOpen = 0.4 * w;
    bodyY += 0.18 * w; headRX = -0.25 * w;
  } else if (act === 'sleep') {
    sleepK = ease(Math.min(1, p * 1.15));
  } else if (act === 'wake') {
    wakeK = ease(p);
  } else if (act === 'die') {
    dieK = ease(Math.min(1, p * 1.05));
  } else if (act === 'evolve') {
    const w = pulse(p, 0.4, 0.65);
    plateFlare = w; spread = w * 0.7; bodyY += 0.15 * w; coil = w * 0.3;
    jawOpen = 0.3 * w;
  }

  // ---- write body ----
  const sy = sleepK > 0 || dieK > 0 || wakeK < 1 && act === 'wake';
  let restY = 0.88;
  if (sleepK > 0) { bodyY = restY - 0.42 * sleepK; bodyRX = 0.35 * sleepK; }
  if (act === 'wake') { bodyY = (restY - 0.42) * (1 - wakeK) + restY * wakeK; bodyRX = 0.35 * (1 - wakeK); coil = 0.5 * (1 - wakeK); }
  if (dieK > 0) {
    bodyY = restY - 0.5 * dieK;
    bodyRZ = 1.0 * dieK; bodyRX = 0.2 * dieK; bodyZ = 0.1 * dieK;
    spread = dieK; jawOpen = 0.3 * dieK * (1 - dieK * 0.5);
    headRX = 0.5 * dieK;
  }
  torso.position.set(0, bodyY, bodyZ);
  torso.rotation.set(bodyRX, bodyRY, bodyRZ);

  // breathing / jet contraction on the mantle
  let msx = br, msy = br, msz = br;
  if (act === 'fire') { msz = 1 - 0.3 * siphonK; msx = msy = 1 - 0.15 * siphonK; }
  if (act === 'evolve' || act === 'signal') { msz = 1 + 0.1 * plateFlare; }
  if (sleepK > 0.5 || (act === 'die' && dieK > 0.5)) { msx = msy = 1; }
  mantle.scale.set(msx, msy, msz);
  mantle.rotation.x = 0.06 * Math.sin(t * 0.8) * (1 - g) - 0.15 * siphonK;

  head.position.set(0, headY - hurt * 0.03, 0.32);
  head.rotation.set(headRX, headRY, hurt * 0.1 * -1);
  neck.rotation.y = headRY * 0.5;

  jawUp.rotation.x = jawOpen * 0.7;
  jawLo.rotation.x = -jawOpen * 0.5;
  siphon.scale.set(1, 1, 1 + 0.25 * siphonK);
  siphon.rotation.x = -0.2 * siphonK;

  // plates flare (evolve / signal)
  for (let i = 0; i < plates.length; i++) {
    const fl = 1 + plateFlare * (0.12 + i * 0.05);
    plates[i].scale.set(fl, 1, 1);
  }

  // ---- arms ----
  for (let i = 0; i < 8; i++) {
    const arm = A[i];
    const segs = arm.userData.segs;
    const back = Math.abs(arm.userData.restYaw) > 2.0;
    const side = Math.sign(arm.userData.restYaw) || 1;
    const aph = ph0 + i * (Math.PI / 4);
    const s1 = Math.sin(aph), s2 = Math.sin(aph - 1.0), s3 = Math.sin(aph - 2.0);

    let rootPitch = arm.userData.restPitch;
    let rootYaw = arm.userData.restYaw;
    let curlBase = 0, amp = g2, lift = 0;

    if (air) {
      // trailing: arms reach back and up, gentle beat, NO walking
      rootPitch = arm.userData.restPitch - 0.75;
      curlBase = -0.1;
      lift = 0.12 * Math.sin(t * 2.2 + i);
      if (act === 'jump') { rootPitch = arm.userData.restPitch + 0.5; curlBase = 0.3; }
    } else {
      // gait: reach, plant, pull — wave travels down the arm with stride
      rootPitch += g2 * 0.4 * s1 + run * 0.15 * s1;
      curlBase = g2 * 0.1 * s2;
      if (creep) { curlBase += 0.12; rootPitch += 0.1; } // gathered at a creep
    }

    // turn: inside arms shorten, outside reach; swing into the turn
    if (Math.abs(turn) > 0.01 && !air) {
      const inSide = (turn > 0 && side > 0) || (turn < 0 && side < 0);
      if (!back) {
        rootYaw += turn * 0.25 * (inSide ? 0.6 : 1);
        rootPitch += (inSide ? 0.12 : -0.08) * Math.abs(turn);
      }
    }

    // overlays
    rootPitch += rise * 0.55;
    rootYaw += spread * -Math.sign(arm.userData.restYaw || 1) * (back ? 0.5 : 0.3) * (back ? 1 : Math.abs(arm.userData.restYaw));
    rootPitch -= spread * (back ? 0.3 : 0.15);
    rootPitch += shield * 1.1;
    if (shield) curlBase += 0.25;
    if (coil) { rootPitch += coil * 0.45; curlBase += coil * 0.35; }
    if (reach) { rootPitch -= reach * 0.35; curlBase -= reach * 0.15; }
    if (lunge) rootPitch -= lunge * (back ? 0.2 : 0.5);
    if (sleepK > 0) { rootPitch += sleepK * 0.3; curlBase += sleepK * 0.4; }
    if (act === 'wake') { curlBase += 0.4 * (1 - wakeK); rootPitch += 0.25 * (1 - wakeK); }
    if (dieK > 0) { rootPitch -= dieK * 0.35; curlBase -= dieK * 0.2; }
    if (hurt > 0 && i === 1) { rootPitch += hurt * 0.4; curlBase += hurt * 0.3; } // one arm droops

    arm.rotation.x = rootPitch + lift;
    arm.rotation.y = rootYaw;
    arm.rotation.z = 0;

    for (let si = 0; si < segs.length; si++) {
      const sg = segs[si];
      let c = sg.userData.restCurl + curlBase * (0.5 + si * 0.15);
      if (!air) c += g2 * 0.16 * Math.sin(aph - si * 0.8) * (1 - si * 0.08);
      if (air) c += 0.06 * Math.sin(t * 2.2 + i - si * 0.7);
      if (shield) c += 0.1;
      if (dieK > 0) c -= dieK * 0.08;
      if (tipClose && si >= 4) c += tipClose * 0.5;
      if (reach && si >= 4 && act === 'eat') c += 0.6;
      sg.rotation.x = Math.max(-0.35, Math.min(1.4, c));
      sg.rotation.y = 0; sg.rotation.z = 0;
    }
  }
};

o.userData.update = (t) => { o.userData._t = t; };

return o;
}