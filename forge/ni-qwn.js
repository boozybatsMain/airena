function build(THREE, TSL) {
// THE ONE QUALITY: fluid multi-limbed mass — a heavy armoured dome trailing eight
// articulated arms that reach, grip and pull.
//
// BRIEF: A squat, heavy mantle dome sits high and slightly back, its top surface
// the primary read. Eight segmented arms radiate from beneath its front rim,
// each a chain of five tapering links with gripper pads underneath. The mantle
// is clad in three overlapping shell plates with visible seams. Eyes are large
// recessed dark lenses in stepped bezels on the front-sides. A siphon nozzle
// exits the rear. Cable harnesses run from ports on the mantle underside into
// each arm's base joint. The whole thing reads as a heavy crawling machine that
// pulls itself along with coordinated arm strokes.
//
// PROPORTIONS (real octopus):
// - Mantle length ≈ 0.4 of total, arms ≈ 0.6
// - Arms taper from base radius ~0.08 to tip ~0.02
// - Eight arms in a radial fan
// - Eyes large, ~20% of mantle width
// - No neck — head and mantle fused

const { Fn, vec2, vec3, vec4, float, uv, positionLocal, positionWorld,
  normalLocal, normalWorld, cameraPosition, time, sin, cos, abs, pow,
  mix, smoothstep, step, fract, floor, dot, cross, normalize, length,
  min, max, clamp, oneMinus, mul, add, sub, div, uniform, attribute,
  varying, If, Loop } = TSL;

// --- MATERIALS ---
const shellMat = new THREE.MeshStandardMaterial();
shellMat.color = new THREE.Color(0xD8D2C6);
shellMat.metalness = 0.08;
shellMat.roughness = 0.6;
shellMat.side = THREE.DoubleSide;

// Wear shader for shells
const wearColor = Fn(() => {
  const pos = positionLocal;
  const nrm = normalLocal;
  const baseColor = vec3(0.847, 0.824, 0.776);
  const darkMetal = vec3(0.33, 0.32, 0.30);
  const grime = vec3(0.22, 0.20, 0.18);

  const edgeDist = length(pos.xz);
  const edgeMask = smoothstep(float(0.0), float(0.15), edgeDist);

  const downMask = smoothstep(float(0.0), float(-0.8), nrm.y);
  const grimeAmount = downMask.mul(0.35);

  const rustNoise = sin(pos.x.mul(12.0).add(pos.y.mul(7.0))).mul(0.5).add(0.5);
  const rustMask = smoothstep(float(0.6), float(0.9), rustNoise).mul(
    smoothstep(float(0.3), float(-0.5), nrm.y)
  ).mul(0.25);

  let col = baseColor;
  col = mix(col, darkMetal, oneMinus(edgeMask).mul(0.6));
  col = mix(col, grime, grimeAmount);
  col = mix(col, vec3(0.76, 0.32, 0.12), rustMask);

  return col;
})();

shellMat.colorNode = wearColor;
shellMat.roughnessNode = Fn(() => {
  const nrm = normalLocal;
  const dustUp = smoothstep(float(0.0), float(0.8), nrm.y);
  return float(0.55).add(dustUp.mul(0.15));
})();

const machineMat = new THREE.MeshStandardMaterial();
machineMat.color = new THREE.Color(0x55524C);
machineMat.metalness = 0.8;
machineMat.roughness = 0.55;

const darkSteelMat = new THREE.MeshStandardMaterial();
darkSteelMat.color = new THREE.Color(0x3E3A34);
darkSteelMat.metalness = 0.75;
darkSteelMat.roughness = 0.5;

const cableMat = new THREE.MeshStandardMaterial();
cableMat.color = new THREE.Color(0x1E1D1B);
cableMat.metalness = 0.0;
cableMat.roughness = 0.9;

const lensMat = new THREE.MeshStandardMaterial();
lensMat.color = new THREE.Color(0x0a0a0e);
lensMat.metalness = 0.1;
lensMat.roughness = 0.08;

const padMat = new THREE.MeshStandardMaterial();
padMat.color = new THREE.Color(0x2a2825);
padMat.metalness = 0.0;
padMat.roughness = 0.95;

const accentMat = new THREE.MeshStandardMaterial();
accentMat.color = new THREE.Color(0xC2521E);
accentMat.metalness = 0.1;
accentMat.roughness = 0.65;

// --- HELPER FUNCTIONS ---
function makeBoltRing(radius, count, boltR) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(boltR, boltR, boltR * 1.5, 6),
      machineMat
    );
    bolt.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    bolt.name = 'bolt';
    g.add(bolt);
  }
  return g;
}

function makeSprocket(radius, teeth) {
  const g = new THREE.Group();
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, radius * 0.4, 12),
    machineMat
  );
  hub.name = 'sprocket_hub';
  g.add(hub);
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, radius * 0.15, teeth),
    darkSteelMat
  );
  disc.name = 'sprocket_disc';
  g.add(disc);
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.15, radius * 0.2, radius * 0.12),
      machineMat
    );
    tooth.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    tooth.rotation.y = -a;
    tooth.name = 'tooth';
    g.add(tooth);
  }
  return g;
}

function makeRam(length, radius) {
  const g = new THREE.Group();
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.1, length * 0.6, 8),
    machineMat
  );
  barrel.position.y = length * 0.3;
  barrel.name = 'ram_barrel';
  g.add(barrel);
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.5, radius * 0.5, length * 0.5, 8),
    darkSteelMat
  );
  rod.position.y = length * 0.7;
  rod.name = 'ram_rod';
  g.add(rod);
  const gland = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.2, radius * 1.2, radius * 0.5, 8),
    darkSteelMat
  );
  gland.position.y = length * 0.6;
  gland.name = 'ram_gland';
  g.add(gland);
  return g;
}

function makeBearingRace(radius) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.TorusGeometry(radius, radius * 0.15, 8, 16),
    machineMat
  );
  outer.rotation.x = Math.PI / 2;
  outer.name = 'bearing_outer';
  g.add(outer);
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 0.6, radius * 0.1, 8, 12),
    darkSteelMat
  );
  inner.rotation.x = Math.PI / 2;
  inner.name = 'bearing_inner';
  g.add(inner);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.08, 6, 6),
      darkSteelMat
    );
    ball.position.set(Math.cos(a) * radius * 0.8, 0, Math.sin(a) * radius * 0.8);
    ball.name = 'bearing_ball';
    g.add(ball);
  }
  return g;
}

function makeGripperPad(w, h) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(w, w * 0.8, h, 8),
    padMat
  );
  pad.name = 'pad';
  g.add(pad);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(w * 0.9, w * 0.12, 6, 12),
    darkSteelMat
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = h * 0.3;
  ring.name = 'pad_ring';
  g.add(ring);
  return g;
}

// --- ROOT ---
const object = new THREE.Group();
object.name = 'octopus';

// === PASS 1: THE FRAME ===
const spinePts = [
  new THREE.Vector3(0, 0.15, 0.3),
  new THREE.Vector3(0, 0.35, 0.1),
  new THREE.Vector3(0, 0.5, -0.1),
  new THREE.Vector3(0, 0.55, -0.3),
  new THREE.Vector3(0, 0.45, -0.5)
];
const spineCurve = new THREE.CatmullRomCurve3(spinePts);

// Mantle core
const mantle = new THREE.Group();
mantle.name = 'mantle';
mantle.position.set(0, 0.45, -0.15);
object.add(mantle);

// Mantle frame segments (stacked blocks along spine)
const mantleSegs = [];
for (let i = 0; i < 5; i++) {
  const t = i / 4;
  const pt = spineCurve.getPoint(t);
  const seg = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.28 - t * 0.06,
      0.30 - t * 0.05,
      0.12,
      8
    ),
    machineMat
  );
  seg.position.copy(pt).sub(new THREE.Vector3(0, 0.45, -0.15));
  seg.name = 'mantle_seg_' + i;
  mantle.add(seg);
  mantleSegs.push(seg);
}

// === PASS 2: THE LEADING END (eyes, brow, front of mantle) ===
const headAssembly = new THREE.Group();
headAssembly.name = 'head_assembly';
headAssembly.position.set(0, 0.1, 0.25);
mantle.add(headAssembly);

// Brow plate
const browShape = new THREE.Shape();
browShape.moveTo(-0.25, 0);
browShape.lineTo(-0.2, 0.08);
browShape.lineTo(0.2, 0.08);
browShape.lineTo(0.25, 0);
browShape.lineTo(0.2, -0.03);
browShape.lineTo(-0.2, -0.03);
browShape.closePath();
const browGeo = new THREE.ExtrudeGeometry(browShape, {
  depth: 0.06, bevelEnabled: true, bevelSize: 0.01,
  bevelThickness: 0.01, bevelSegments: 2
});
const brow = new THREE.Mesh(browGeo, shellMat);
brow.position.set(0, 0.12, 0.12);
brow.rotation.x = -0.2;
brow.name = 'brow_plate';
headAssembly.add(brow);

// Eye bezels and lenses
for (let side = -1; side <= 1; side += 2) {
  const eyeGroup = new THREE.Group();
  eyeGroup.name = side < 0 ? 'eye_left' : 'eye_right';
  eyeGroup.position.set(side * 0.22, 0.05, 0.15);

  const bezelOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.1, 0.05, 12),
    machineMat
  );
  bezelOuter.rotation.x = Math.PI / 2;
  bezelOuter.name = 'bezel_outer';
  eyeGroup.add(bezelOuter);

  const bezelInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.08, 0.04, 12),
    darkSteelMat
  );
  bezelInner.rotation.x = Math.PI / 2;
  bezelInner.position.z = 0.02;
  bezelInner.name = 'bezel_inner';
  eyeGroup.add(bezelInner);

  const lens = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    lensMat
  );
  lens.rotation.x = -Math.PI / 2;
  lens.position.z = 0.03;
  lens.name = 'lens';
  eyeGroup.add(lens);

  const fitting = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.03, 0.02),
    darkSteelMat
  );
  fitting.position.set(side * 0.1, -0.02, 0.01);
  fitting.name = 'eye_fitting';
  eyeGroup.add(fitting);

  headAssembly.add(eyeGroup);
}

// Lower jaw / mouth plate
const jawShape = new THREE.Shape();
jawShape.moveTo(-0.12, 0);
jawShape.lineTo(-0.08, -0.06);
jawShape.lineTo(0.08, -0.06);
jawShape.lineTo(0.12, 0);
jawShape.closePath();
const jawGeo = new THREE.ExtrudeGeometry(jawShape, {
  depth: 0.04, bevelEnabled: true, bevelSize: 0.008,
  bevelThickness: 0.008, bevelSegments: 1
});
const jaw = new THREE.Mesh(jawGeo, shellMat);
jaw.position.set(0, -0.08, 0.1);
jaw.name = 'jaw_plate';
headAssembly.add(jaw);

// Beak
const beakUpper = new THREE.Mesh(
  new THREE.ConeGeometry(0.03, 0.06, 4),
  darkSteelMat
);
beakUpper.position.set(0, -0.1, 0.14);
beakUpper.rotation.x = Math.PI * 0.7;
beakUpper.name = 'beak_upper';
headAssembly.add(beakUpper);

const beakLower = new THREE.Mesh(
  new THREE.ConeGeometry(0.025, 0.05, 4),
  darkSteelMat
);
beakLower.position.set(0, -0.13, 0.13);
beakLower.rotation.x = Math.PI * 0.3;
beakLower.name = 'beak_lower';
headAssembly.add(beakLower);

// Sensor stalks on top of head
for (let i = 0; i < 3; i++) {
  const stalk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.005, 0.06 + i * 0.015, 6),
    machineMat
  );
  stalk.position.set((i - 1) * 0.05, 0.18 + i * 0.01, 0.05);
  stalk.rotation.x = -0.3;
  stalk.name = 'sensor_stalk_' + i;
  headAssembly.add(stalk);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.008, 6, 6),
    darkSteelMat
  );
  tip.position.y = (0.06 + i * 0.015) / 2;
  stalk.add(tip);
}

// === PASS 3: THE ARMS (extremities) ===
const arms = [];
const armCount = 8;
const armBaseY = -0.15;
const armBaseZ = 0.15;

for (let ai = 0; ai < armCount; ai++) {
  const side = ai < 4 ? -1 : 1;
  const idx = ai % 4;
  const spreadAngle = side * (0.2 + idx * 0.35);
  const baseAngle = spreadAngle;

  const armGroup = new THREE.Group();
  armGroup.name = 'arm_' + ai;
  const bx = Math.sin(baseAngle) * 0.22;
  const bz = Math.cos(baseAngle) * 0.15 + armBaseZ;
  armGroup.position.set(bx, armBaseY, bz);
  armGroup.rotation.y = -baseAngle;
  object.add(armGroup);

  const segments = [];
  const segCount = 5;
  let parent = armGroup;

  for (let si = 0; si < segCount; si++) {
    const segLen = 0.18 - si * 0.02;
    const segRad = 0.06 - si * 0.008;

    const segGroup = new THREE.Group();
    segGroup.name = 'arm_' + ai + '_seg_' + si;
    if (si === 0) {
      segGroup.position.set(0, 0, 0.05);
    } else {
      segGroup.position.set(0, 0, segLen + 0.02);
    }
    parent.add(segGroup);

    const segMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(segRad * 0.8, segRad, segLen, 6),
      machineMat
    );
    segMesh.rotation.x = Math.PI / 2;
    segMesh.position.z = segLen / 2;
    segMesh.name = 'seg_body';
    segGroup.add(segMesh);

    if (si > 0) {
      const jointBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(segRad * 1.1, segRad * 1.1, segRad * 0.8, 8),
        darkSteelMat
      );
      jointBarrel.rotation.x = Math.PI / 2;
      jointBarrel.name = 'joint_barrel';
      segGroup.add(jointBarrel);

      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(segRad * 0.2, segRad * 0.2, segRad * 2.5, 6),
        machineMat
      );
      pin.rotation.z = Math.PI / 2;
      pin.name = 'joint_pin';
      segGroup.add(pin);
    }

    if (si < segCount - 1) {
      const pad = makeGripperPad(segRad * 0.6, segRad * 0.3);
      pad.position.set(0, -segRad * 0.8, segLen * 0.5);
      pad.name = 'arm_' + ai + '_pad_' + si;
      segGroup.add(pad);
    }

    if (si < 3) {
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(segRad * 1.2, segRad * 1.3, segLen * 0.6, 6, 1, true, 0, Math.PI * 0.8),
        shellMat
      );
      plate.rotation.x = Math.PI / 2;
      plate.rotation.z = Math.PI * 0.6;
      plate.position.z = segLen * 0.4;
      plate.name = 'arm_plate_' + si;
      segGroup.add(plate);
    }

    segments.push(segGroup);
    parent = segGroup;
  }

  const tipClaw = new THREE.Mesh(
    new THREE.ConeGeometry(0.015, 0.05, 4),
    darkSteelMat
  );
  tipClaw.rotation.x = Math.PI / 2;
  tipClaw.position.z = 0.04;
  tipClaw.name = 'arm_tip';
  parent.add(tipClaw);

  arms.push({ group: armGroup, segments, baseAngle, side, idx });
}

// === PASS 4: THE MECHANISM ===
for (let ai = 0; ai < armCount; ai++) {
  const bearing = makeBearingRace(0.05);
  bearing.position.set(0, 0, 0.02);
  bearing.name = 'arm_bearing_' + ai;
  arms[ai].group.add(bearing);
}

const sprocketL = makeSprocket(0.08, 8);
sprocketL.position.set(-0.2, 0, 0);
sprocketL.name = 'sprocket_left';
mantle.add(sprocketL);

const sprocketR = makeSprocket(0.08, 8);
sprocketR.position.set(0.2, 0, 0);
sprocketR.name = 'sprocket_right';
mantle.add(sprocketR);

const chainGroup = new THREE.Group();
chainGroup.name = 'chain_run';
const chainLinks = 12;
for (let i = 0; i < chainLinks; i++) {
  const t = i / (chainLinks - 1);
  const link = new THREE.Mesh(
    new THREE.BoxGeometry(0.015, 0.008, 0.025),
    darkSteelMat
  );
  link.position.set(
    -0.2 + t * 0.4,
    0.05 + Math.sin(t * Math.PI) * 0.03,
    0
  );
  link.name = 'chain_link_' + i;
  chainGroup.add(link);
}
mantle.add(chainGroup);

for (let side = -1; side <= 1; side += 2) {
  const ram = makeRam(0.25, 0.025);
  ram.position.set(side * 0.25, -0.1, 0);
  ram.rotation.z = side * 0.15;
  ram.name = side < 0 ? 'ram_left' : 'ram_right';
  mantle.add(ram);
}

const gearStack = new THREE.Group();
gearStack.name = 'gear_stack';
gearStack.position.set(0, 0, -0.35);
for (let i = 0; i < 3; i++) {
  const gear = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06 - i * 0.012, 0.06 - i * 0.012, 0.02, 12),
    i % 2 === 0 ? machineMat : darkSteelMat
  );
  gear.position.y = i * 0.025;
  gear.name = 'gear_' + i;
  gearStack.add(gear);
}
mantle.add(gearStack);

const siphon = new THREE.Group();
siphon.name = 'siphon';
siphon.position.set(0.15, -0.05, -0.35);
const siphonTube = new THREE.Mesh(
  new THREE.CylinderGeometry(0.03, 0.045, 0.15, 8),
  machineMat
);
siphonTube.rotation.x = Math.PI * 0.6;
siphonTube.name = 'siphon_tube';
siphon.add(siphonTube);
const siphonNozzle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.025, 0.035, 0.05, 8),
  darkSteelMat
);
siphonNozzle.rotation.x = Math.PI * 0.6;
siphonNozzle.position.set(0, -0.06, -0.08);
siphonNozzle.name = 'siphon_nozzle';
siphon.add(siphonNozzle);
mantle.add(siphon);

// === PASS 5: THE SHELLS ===
const shellTop = new THREE.Mesh(
  new THREE.SphereGeometry(0.32, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
  shellMat
);
shellTop.scale.set(1, 0.7, 1.1);
shellTop.position.set(0, 0.1, -0.05);
shellTop.name = 'shell_top';
mantle.add(shellTop);

for (let side = -1; side <= 1; side += 2) {
  const sideShell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.3, 0.35, 16, 1, true,
      side < 0 ? Math.PI * 0.6 : Math.PI * 1.6, Math.PI * 0.7),
    shellMat
  );
  sideShell.position.set(side * 0.05, 0, 0);
  sideShell.name = side < 0 ? 'shell_left' : 'shell_right';
  mantle.add(sideShell);
}

const rearShell = new THREE.Mesh(
  new THREE.CylinderGeometry(0.25, 0.28, 0.2, 12, 1, true, Math.PI * 0.7, Math.PI * 0.6),
  shellMat
);
rearShell.position.set(0, 0, -0.15);
rearShell.name = 'shell_rear';
mantle.add(rearShell);

const visorShape = new THREE.Shape();
visorShape.moveTo(-0.2, 0);
visorShape.quadraticCurveTo(-0.22, 0.08, -0.15, 0.12);
visorShape.lineTo(0.15, 0.12);
visorShape.quadraticCurveTo(0.22, 0.08, 0.2, 0);
visorShape.lineTo(0.15, -0.02);
visorShape.lineTo(-0.15, -0.02);
visorShape.closePath();
const visorGeo = new THREE.ExtrudeGeometry(visorShape, {
  depth: 0.03, bevelEnabled: true, bevelSize: 0.008,
  bevelThickness: 0.008, bevelSegments: 2
});
const visor = new THREE.Mesh(visorGeo, shellMat);
visor.position.set(0, 0.15, 0.28);
visor.rotation.x = -0.15;
visor.name = 'visor_plate';
headAssembly.add(visor);

for (let i = 0; i < 4; i++) {
  const rib = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.015, 0.25),
    shellMat
  );
  rib.position.set((i - 1.5) * 0.1, 0.28, -0.05);
  rib.name = 'rib_' + i;
  mantle.add(rib);
}

// === PASS 6: CABLE HARNESS ===
for (let ai = 0; ai < armCount; ai++) {
  const arm = arms[ai];
  const bx = arm.group.position.x;
  const bz = arm.group.position.z;

  const cablePtsM = [
    new THREE.Vector3(bx * 0.5, -0.1, bz * 0.5),
    new THREE.Vector3(bx * 0.8, -0.12, bz * 0.8),
    new THREE.Vector3(bx, armBaseY + 0.05, bz)
  ];
  const cableCurveM = new THREE.CatmullRomCurve3(cablePtsM);
  const cableM = new THREE.Mesh(
    new THREE.TubeGeometry(cableCurveM, 8, 0.012, 6),
    cableMat
  );
  cableM.name = 'cable_mantle_to_arm_' + ai;
  mantle.add(cableM);

  const cablePtsA = [
    new THREE.Vector3(0, 0.02, 0),
    new THREE.Vector3(0, -0.02, 0.08),
    new THREE.Vector3(0, -0.03, 0.15)
  ];
  const cableCurveA = new THREE.CatmullRomCurve3(cablePtsA);
  const cableA = new THREE.Mesh(
    new THREE.TubeGeometry(cableCurveA, 6, 0.01, 6),
    cableMat
  );
  cableA.name = 'cable_arm_' + ai;
  arm.group.add(cableA);

  const port = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.025, 0.03, 8),
    darkSteelMat
  );
  port.position.set(0, 0.01, 0.02);
  port.name = 'cable_port_' + ai;
  arm.group.add(port);
}

const trunkPts = [
  new THREE.Vector3(0, -0.2, 0.2),
  new THREE.Vector3(0, -0.22, 0),
  new THREE.Vector3(0, -0.18, -0.2),
  new THREE.Vector3(0.1, -0.15, -0.35)
];
const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
const trunkCable = new THREE.Mesh(
  new THREE.TubeGeometry(trunkCurve, 12, 0.02, 6),
  cableMat
);
trunkCable.name = 'trunk_cable';
mantle.add(trunkCable);

for (let i = 0; i < 3; i++) {
  const wirePts = trunkPts.map(p =>
    new THREE.Vector3(p.x + (i - 1) * 0.02, p.y + 0.01, p.z)
  );
  const wireCurve = new THREE.CatmullRomCurve3(wirePts);
  const wire = new THREE.Mesh(
    new THREE.TubeGeometry(wireCurve, 10, 0.005, 4),
    cableMat
  );
  wire.name = 'signal_wire_' + i;
  mantle.add(wire);
}

for (let i = 0; i < 4; i++) {
  const t = i / 3;
  const pt = trunkCurve.getPoint(t);
  const clamp = new THREE.Mesh(
    new THREE.TorusGeometry(0.025, 0.006, 6, 8),
    machineMat
  );
  clamp.position.copy(pt);
  clamp.name = 'cable_clamp_' + i;
  mantle.add(clamp);
}

// === PASS 7: GREEBLES ===
const boltRingTop = makeBoltRing(0.28, 10, 0.008);
boltRingTop.position.set(0, 0.05, -0.05);
boltRingTop.name = 'bolt_ring_top';
mantle.add(boltRingTop);

for (let i = 0; i < 4; i++) {
  const vent = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.005, 0.008),
    darkSteelMat
  );
  vent.position.set(0.1, 0.3, -0.1 + i * 0.025);
  vent.name = 'vent_' + i;
  mantle.add(vent);
}

for (let i = 0; i < 3; i++) {
  const jbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.02, 0.025),
    machineMat
  );
  jbox.position.set(-0.15 + i * 0.15, -0.18, -0.1);
  jbox.name = 'junction_box_' + i;
  mantle.add(jbox);
}

for (let side = -1; side <= 1; side += 2) {
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.03, 0.005, 6, 8, Math.PI),
    machineMat
  );
  handle.position.set(side * 0.25, 0.15, 0.1);
  handle.rotation.z = Math.PI / 2;
  handle.name = 'handle_' + (side < 0 ? 'left' : 'right');
  mantle.add(handle);
}

const accentPlate = new THREE.Mesh(
  new THREE.BoxGeometry(0.06, 0.04, 0.008),
  accentMat
);
accentPlate.position.set(0.12, 0.1, -0.3);
accentPlate.rotation.y = 0.3;
accentPlate.name = 'accent_plate';
mantle.add(accentPlate);

const statusPort = new THREE.Mesh(
  new THREE.CylinderGeometry(0.01, 0.01, 0.005, 8),
  new THREE.MeshStandardMaterial({
    color: 0x1a3a3a,
    emissive: 0x2a8a7a,
    emissiveIntensity: 0.5,
    metalness: 0.1,
    roughness: 0.3
  })
);
statusPort.position.set(-0.18, 0.08, 0.15);
statusPort.rotation.x = Math.PI / 2;
statusPort.name = 'status_port';
mantle.add(statusPort);

for (let i = 0; i < 4; i++) {
  const fv = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.008, 6),
    darkSteelMat
  );
  fv.position.set(-0.12 + i * 0.08, 0.16, 0.3);
  fv.name = 'visor_bolt_' + i;
  headAssembly.add(fv);
}

// === POSE FUNCTION ===
const segRefs = arms.map(a => a.segments);

object.userData.pose = (s) => {
  const stride = s.stride;
  const speed = s.speed;
  const turn = s.turn;
  const t = s.t;

  mantle.rotation.set(0, 0, 0);
  mantle.position.set(0, 0.45, -0.15);
  mantle.scale.set(1, 1, 1);
  headAssembly.rotation.set(0, 0, 0);

  const breathe = Math.sin(t * 1.5) * 0.02;
  mantle.scale.y = 1 + breathe;
  mantle.position.y = 0.45 + breathe * 0.5;

  if (speed < 0.1 && !s.action) {
    headAssembly.rotation.y = Math.sin(t * 0.7) * 0.15;
    headAssembly.rotation.x = Math.sin(t * 0.5) * 0.05;
  }

  function handleAction(ai, arm, segs) {
    const p = s.phase;
    switch (s.action) {
      case 'attack': {
        const windUp = p < 0.3 ? p / 0.3 : 0;
        const strike = p >= 0.3 && p < 0.6 ? (p - 0.3) / 0.3 : 0;
        const recover = p >= 0.6 ? (p - 0.6) / 0.4 : 0;
        for (let si = 0; si < segs.length; si++) {
          const segDelay = si * 0.08;
          let rot = 0.3;
          if (windUp > 0) rot = 0.3 + windUp * 0.4;
          if (strike > 0) rot = 0.7 - strike * 1.2;
          if (recover > 0) rot = -0.5 + recover * 0.8;
          segs[si].rotation.x = rot + segDelay;
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
        if (ai === 0 || ai === 4) {
          mantle.rotation.x = -strike * 0.1;
        }
        break;
      }
      case 'fire': {
        const aim = p < 0.3 ? p / 0.3 : 1;
        const release = p >= 0.3 && p < 0.5 ? (p - 0.3) / 0.2 : 0;
        mantle.scale.set(1 - release * 0.1, 1 + release * 0.08, 1);
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = 0.4 + aim * 0.1;
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
        break;
      }
      case 'hit': {
        const flinch = p < 0.3 ? p / 0.3 : 1 - (p - 0.3) / 0.7;
        mantle.rotation.x = flinch * 0.15;
        mantle.position.z = -0.15 - flinch * 0.05;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = 0.3 + flinch * 0.3;
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
        break;
      }
      case 'block': {
        const brace = Math.min(p * 3, 1);
        mantle.position.y = 0.45 - brace * 0.08;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = 0.5 + brace * 0.4;
          segs[si].rotation.y = arm.baseAngle * brace * 0.3;
          segs[si].rotation.z = 0;
        }
        headAssembly.rotation.x = brace * 0.2;
        break;
      }
      case 'gather': {
        const reach = p < 0.4 ? p / 0.4 : 1;
        const close = p >= 0.4 && p < 0.7 ? (p - 0.4) / 0.3 : (p >= 0.7 ? 1 : 0);
        const rise = p >= 0.7 ? (p - 0.7) / 0.3 : 0;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = reach * 0.6 - close * 0.3 - rise * 0.3;
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
        mantle.position.y = 0.45 - reach * 0.1 + rise * 0.1;
        break;
      }
      case 'deposit': {
        const lower = p < 0.5 ? p / 0.5 : 1;
        const release = p >= 0.5 && p < 0.7 ? (p - 0.5) / 0.2 : (p >= 0.7 ? 1 : 0);
        const rise = p >= 0.7 ? (p - 0.7) / 0.3 : 0;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = lower * 0.5 - release * 0.2 - rise * 0.3;
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
        mantle.position.y = 0.45 - lower * 0.08 + rise * 0.08;
        break;
      }
      case 'eat': {
        const cycles = 3;
        const chew = Math.sin(p * Math.PI * 2 * cycles);
        headAssembly.rotation.x = 0.3 + chew * 0.05;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = 0.4 + chew * 0.05;
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
        break;
      }
      case 'drink': {
        const down = Math.min(p * 3, 1);
        const up = p > 0.8 ? (p - 0.8) / 0.2 : 0;
        headAssembly.rotation.x = down * 0.4 - up * 0.4;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = 0.3 + down * 0.2 - up * 0.2;
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
        break;
      }
      case 'jump': {
        const crouch = p < 0.33 ? p / 0.33 : 0;
        const extend = p >= 0.33 ? (p - 0.33) / 0.67 : 0;
        mantle.position.y = 0.45 - crouch * 0.1 + extend * 0.15;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = crouch * 0.5 - extend * 0.8;
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
        break;
      }
      case 'land': {
        const reach = p < 0.3 ? p / 0.3 : 1;
        const compress = p >= 0.3 && p < 0.6 ? (p - 0.3) / 0.3 : (p >= 0.6 ? 1 : 0);
        const pushUp = p >= 0.6 ? (p - 0.6) / 0.4 : 0;
        mantle.position.y = 0.45 - compress * 0.1 + pushUp * 0.1;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = -reach * 0.3 + compress * 0.6 - pushUp * 0.3;
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
        break;
      }
      case 'signal': {
        const rise = p < 0.3 ? p / 0.3 : (p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3);
        mantle.position.y = 0.45 + rise * 0.1;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = -rise * 0.4;
          segs[si].rotation.y = arm.baseAngle * rise * 0.5;
          segs[si].rotation.z = 0;
        }
        break;
      }
      case 'sleep': {
        const lower = Math.min(p * 2, 1);
        mantle.position.y = 0.45 - lower * 0.25;
        mantle.scale.y = 1 - lower * 0.15;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = lower * (0.6 + si * 0.15);
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
        headAssembly.rotation.x = lower * 0.3;
        break;
      }
      case 'wake': {
        const rise = p;
        mantle.position.y = 0.2 + rise * 0.25;
        mantle.scale.y = 0.85 + rise * 0.15;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = (1 - rise) * (0.6 + si * 0.15) + rise * 0.25;
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
        headAssembly.rotation.x = (1 - rise) * 0.3;
        break;
      }
      case 'die': {
        const collapse = p;
        mantle.position.y = 0.45 - collapse * 0.35;
        mantle.scale.y = 1 - collapse * 0.3;
        mantle.rotation.z = collapse * 0.15;
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = collapse * (0.8 + si * 0.1);
          segs[si].rotation.y = arm.baseAngle * collapse * 0.8;
          segs[si].rotation.z = collapse * (ai % 2 === 0 ? 0.2 : -0.2);
        }
        headAssembly.rotation.x = collapse * 0.4;
        headAssembly.rotation.z = collapse * 0.1;
        break;
      }
      case 'evolve': {
        const brace = p < 0.2 ? p / 0.2 : 1;
        const open = p >= 0.2 && p < 0.5 ? (p - 0.2) / 0.3 : (p < 0.7 ? 1 : 0);
        const close = p >= 0.7 ? (p - 0.7) / 0.3 : 0;
        mantle.scale.set(1 + open * 0.08, 1 + open * 0.05, 1);
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = brace * 0.3 - open * 0.3 + close * 0.3;
          segs[si].rotation.y = arm.baseAngle * open * 0.3;
          segs[si].rotation.z = 0;
        }
        break;
      }
      default: {
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x = 0.25;
          segs[si].rotation.y = 0;
          segs[si].rotation.z = 0;
        }
      }
    }
  }

  for (let ai = 0; ai < armCount; ai++) {
    const arm = arms[ai];
    const segs = segRefs[ai];
    const phase = stride + ai / armCount;

    if (s.action) {
      handleAction(ai, arm, segs);
    } else if (!s.grounded) {
      for (let si = 0; si < segs.length; si++) {
        segs[si].rotation.x = -0.3 - si * 0.15;
        segs[si].rotation.y = arm.baseAngle * 0.3;
        segs[si].rotation.z = 0;
      }
    } else if (speed < 0.1) {
      for (let si = 0; si < segs.length; si++) {
        const curl = 0.25 + si * 0.1;
        const sway = Math.sin(t * 0.8 + ai * 0.7) * 0.05;
        segs[si].rotation.x = curl + sway;
        segs[si].rotation.y = Math.sin(t * 0.5 + ai) * 0.03;
        segs[si].rotation.z = 0;
      }
    } else {
      const gaitPhase = phase * Math.PI * 2;
      const amp = Math.min(speed / 3, 1);
      const bodyDrop = speed > 2 ? 0.05 : 0;
      mantle.position.y = 0.45 - bodyDrop + breathe * 0.5;

      for (let si = 0; si < segs.length; si++) {
        const segPhase = gaitPhase + si * 0.4;
        const segReach = Math.sin(segPhase) * amp;
        const segCurl = 0.2 + Math.cos(segPhase) * 0.15 * amp;
        const extend = speed > 2 ? -0.15 * (speed - 2) / 4 : 0;

        segs[si].rotation.x = segCurl + extend;
        segs[si].rotation.y = segReach * 0.1;
        segs[si].rotation.z = 0;
      }

      if (Math.abs(turn) > 0.01) {
        const turnLean = turn * 0.15;
        mantle.rotation.z = turnLean;
        headAssembly.rotation.y = turn * 0.3;

        for (let si = 0; si < segs.length; si++) {
          const isInside = (turn > 0 && arm.side > 0) || (turn < 0 && arm.side < 0);
          if (isInside) {
            segs[si].rotation.x += 0.15;
          }
        }
      }
    }

    if (s.health < 0.5 && !s.action) {
      const droop = (1 - s.health * 2) * 0.3;
      if (ai % 2 === 0) {
        for (let si = 0; si < segs.length; si++) {
          segs[si].rotation.x += droop * (si / segs.length);
        }
      }
      mantle.rotation.z += droop * 0.2;
      headAssembly.rotation.x += droop * 0.3;
    }
  }
};

object.userData.update = (t, dt) => {};

return object;
}