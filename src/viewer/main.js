/**
 * The viewer.
 *
 * ── the part that quietly decides whether any of this looks real ────────────
 *
 * The two bodies are finished art with one entry point: `root.userData.pose(s)`
 * where s = { t, dt, speed, stride, turn, grounded, health, action, phase }.
 * Three of those fields are easy to get wrong in a way that reads as "the
 * animation is broken" rather than as "the bridge is wrong", so they are
 * spelled out here:
 *
 *  - `speed` is in BODY LENGTHS per second, not metres. The body is measured
 *    with a Box3 at load and the sim's metres are divided by it. Feed it metres
 *    and a 4.6 m/s octopus reads as a sprint at the clamp ceiling and never
 *    varies again.
 *  - `stride` is a gait phase that must accumulate by DISTANCE TRAVELLED, not
 *    by time. Accumulate by time and the feet skate whenever the body is
 *    accelerating, decelerating, knocked back or held against a wall — which
 *    in this game is most of the time.
 *  - `stride` carries the SIGN of travel against facing, so a body backing away
 *    from the gorilla backpedals instead of moonwalking.
 *
 * ── and the part that decides whether it looks fair ─────────────────────────
 *
 * Snapshots arrive at the sim rate. Rendering the newest one on arrival makes
 * every motion a staircase, so the render clock runs one snapshot interval in
 * the past and interpolates between the two frames that bracket it. Headings
 * are interpolated the short way round; interpolating the raw radians spins a
 * body the long way through a heading wrap once per fight, which looks exactly
 * like a physics bug.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
const errBox = $('#err');
const fail = (m) => { errBox.style.display = 'block'; errBox.textContent += `${m}\n`; console.error(m); };

// ---------------------------------------------------------------------------
// scene
// ---------------------------------------------------------------------------

const cfg = await (await fetch('/api/config')).json();
const HALF = cfg.arena.half;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0f14);
scene.fog = new THREE.Fog(0x0d0f14, 55, 110);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.3, 400);
camera.position.set(0, 26, 34);
camera.lookAt(0, 1, 0);

/*
 * WebGPU when the browser has it, WebGL2 when it does not, and `?webgl=1` to
 * take the fallback path deliberately — because a fallback nobody can exercise
 * on purpose is a fallback nobody has tested.
 */
const forceWebGL = new URLSearchParams(location.search).get('webgl') === '1';
let renderer;
try {
  renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
  await renderer.init();
  window.__airenaBackend = forceWebGL ? 'webgl2 (forced)' : 'webgpu';
} catch (e) {
  fail(`WebGPU unavailable (${e.message}) — falling back to WebGL2`);
  renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: true });
  await renderer.init();
  window.__airenaBackend = 'webgl2 (fallback)';
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x2a2f38, 1.5));
const key = new THREE.DirectionalLight(0xfff4e0, 2.6);
key.position.set(16, 30, 12);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -30; key.shadow.camera.right = 30;
key.shadow.camera.top = 30; key.shadow.camera.bottom = -30;
key.shadow.camera.near = 1; key.shadow.camera.far = 90;
key.shadow.bias = -0.0012;
scene.add(key);
const rim = new THREE.DirectionalLight(0x7fa8ff, 0.9);
rim.position.set(-18, 12, -16);
scene.add(rim);

// the floor: a white square, because the whole point is to see the two of them
const floorMat = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.92, metalness: 0.02 });
const floor = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.4, HALF * 2), floorMat);
floor.position.y = -0.2;
floor.receiveShadow = true;
scene.add(floor);

// A dark apron beyond the walls. The framing is sized to the pair, so at close
// quarters near a corner the camera looks over the wall — and a void there
// reads as a hole in the world rather than as the outside of a building.
const apron = new THREE.Mesh(
  new THREE.PlaneGeometry(HALF * 8, HALF * 8),
  new THREE.MeshStandardMaterial({ color: 0x151922, roughness: 1, metalness: 0 }),
);
apron.rotation.x = -Math.PI / 2;
apron.position.y = -0.45;
apron.receiveShadow = true;
scene.add(apron);

const grid = new THREE.GridHelper(HALF * 2, HALF * 2, 0x9aa0aa, 0xc9c6be);
grid.position.y = 0.012;
grid.material.transparent = true;
grid.material.opacity = 0.5;
scene.add(grid);

/**
 * Everything opaque that can stand between the eye and a fighter.
 *
 * The four walls are 4 m tall and are NOT in `cfg.arena.obstacles` — the sim
 * carries them separately, as arena bounds — so the viewer's occlusion test
 * never looked at them, and the camera reported "clear" with a wall across the
 * shot. Measured with a per-frame recorder over 12 matches and 16 573 live
 * fighter-frames (l1/l3, l1/l4, l3/l1, l1/l6, l2/l5, l4/l2, seeds 101 and 202):
 * a fighter was COMPLETELY invisible — all three sample heights blocked — in
 * 12.1% of frames and 22.3% had at least one blocked. So both kinds of solid
 * live in one list from here on, each with its own material rather than a
 * shared one, because the same list answers three questions: what the camera
 * has to climb over, what has to get out of the way, and where the aim line
 * stops. Adding them does NOT make the camera clear them by itself: over 24
 * matches and 25 498 live fighter-frames, 345 of the 1 905 fully-hidden frames
 * are still a single wall blocking all three heights (18.1%), against 1 560 for
 * the blocks. A wall is 40 m long and the eye orbits inside the room, so there
 * is no azimuth that clears it — which is exactly why the fade and the
 * silhouette below are the load-bearing half of this fix and the camera is not.
 *
 * `transparent` is set at construction even though everything starts fully
 * opaque: flipping the flag later would rebuild the pipeline in the middle of a
 * fight, and the fade below has to be free to start on any frame.
 */
const SOLIDS = [];

for (const [x, z, sx, sz] of [
  [0, HALF + 0.4, HALF * 2 + 1.6, 0.8], [0, -HALF - 0.4, HALF * 2 + 1.6, 0.8],
  [HALF + 0.4, 0, 0.8, HALF * 2 + 1.6], [-HALF - 0.4, 0, 0.8, HALF * 2 + 1.6],
]) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.8, metalness: 0.05, transparent: true });
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, cfg.arena.wallHeight, sz), mat);
  m.position.set(x, cfg.arena.wallHeight / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  /*
   * The walls get the same wireframe the blocks get, for the same reason.
   *
   * They were not in the fade set at all until the occlusion fix put them
   * there, so nothing had ever needed to survive a wall fading -- and the fix
   * shipped without this, which left a wall that dissolved to 0.24 with nothing
   * behind it: 31 frames of one match had the near wall glassed over and no
   * edge to say where the arena stopped. Measured by the verifier, not guessed.
   */
  const wallEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(m.geometry),
    new THREE.LineBasicMaterial({ color: 0x59606f }),
  );
  wallEdge.position.copy(m.position);
  scene.add(wallEdge);
  SOLIDS.push({ x, z, hx: sx / 2, hz: sz / 2, h: cfg.arena.wallHeight, mats: [mat], fade: 1, want: 1 });
}

for (const o of cfg.arena.obstacles) {
  const side = new THREE.MeshStandardMaterial({ color: 0xb9b4a8, roughness: 0.85, metalness: 0.04, transparent: true });
  const top = new THREE.MeshStandardMaterial({ color: 0x8d8879, roughness: 0.8, metalness: 0.06, transparent: true });
  const m = new THREE.Mesh(new THREE.BoxGeometry(o.hx * 2, o.h, o.hz * 2), [side, side, top, side, side, side]);
  m.position.set(o.x, o.h / 2, o.z);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  // The edges are NOT in the fade. A block that dissolves entirely takes the
  // arena's geometry with it — the cover a viewer is reading the fight against
  // — so what fades is the fill, and the wireframe stays to say the block is
  // still there and still stops a charge.
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(m.geometry),
    new THREE.LineBasicMaterial({ color: 0x6a6559 }),
  );
  edge.position.copy(m.position);
  scene.add(edge);
  SOLIDS.push({ x: o.x, z: o.z, hx: o.hx, hz: o.hz, h: o.h, mats: [side, top], fade: 1, want: 1 });
}

/**
 * Is the segment eye -> point inside this box?
 *
 * Three axes, not two. The old test at this spot was a flat X/Z slab over the
 * blocks alone, and height is not a detail here: the eye orbits 13-34 m out and
 * sits 12 m up, so most sight lines that cross a 3.2 m block in plan view pass
 * well above it. Over 25 498 live fighter-frames a plan-view slab test on the
 * blocks alone calls 35.0% blocked, the same test with the walls added calls
 * 74.6%, and this one calls 16.4% — so simply adding the walls to the old test
 * would have put the camera in permanent evasion, climbing and orbiting away
 * from a picture that was never obstructed.
 */
function segSolid(eye, px, py, pz, o) {
  let t0 = 0, t1 = 1;
  const axes = [
    [eye.x, px - eye.x, o.x - o.hx, o.x + o.hx],
    [eye.y, py - eye.y, 0, o.h],
    [eye.z, pz - eye.z, o.z - o.hz, o.z + o.hz],
  ];
  for (const [s, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) { if (s < lo || s > hi) return false; continue; }
    let a = (lo - s) / d, b = (hi - s) / d;
    if (a > b) { const q = a; a = b; b = q; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return t1 > 0 && t0 < 1;
}

/**
 * How much of a body is behind something, from this eye, as 0..3.
 *
 * Three heights up the body rather than one centre point, because "the head is
 * showing over a block" and "there is a wall across the whole animal" are
 * different pictures and the camera should only pay to fix the second. The
 * sample heights are the same ones the audit recorder used, so the number this
 * returns is the number that was measured.
 */
const SAMPLE_HEIGHTS = [0.15, 0.5, 0.9];
function hiddenCount(eye, f, height, mark) {
  let n = 0;
  for (const u of SAMPLE_HEIGHTS) {
    const py = f.y + height * u;
    let any = false;
    for (const o of SOLIDS) {
      if (!segSolid(eye, f.x, py, f.z, o)) continue;
      any = true;
      // every blocker, not just the first: a body caught between a block and
      // the wall behind it is hidden by both, and fading one of them out still
      // leaves nothing to look at
      if (mark) o.hits++; else break;
    }
    if (any) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// bodies
// ---------------------------------------------------------------------------

/**
 * Load one art asset.
 *
 * `build(THREE, TSL)` is evaluated as-is: these files are two of ours and there
 * is nothing here to defend against. What matters is measuring the result — the
 * pose function wants speed in body lengths, and the only place that number
 * exists is the geometry.
 */
async function loadBody(name) {
  const src = await (await fetch(`/bodies/${name}.js`)).text();
  const make = new Function('THREE', 'TSL', `${src}\n;return build(THREE, TSL);`);
  const root = make(THREE, TSL);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  /**
   * Measure, then make the picture agree with the physics.
   *
   * These two files were authored independently of this arena and land at
   * whatever scale their geometry happened to end at. A body drawn smaller than
   * its own collider stops short of everything it touches and reads as
   * floating; drawn larger, it visibly overlaps a wall it never entered. So the
   * mesh is scaled until its horizontal footprint IS the collision diameter the
   * simulation uses, and after that "they are touching" and "they look like
   * they are touching" are the same statement.
   */
  const raw = new THREE.Box3().setFromObject(root);
  const rawSize = new THREE.Vector3();
  raw.getSize(rawSize);
  const footprint = Math.max(rawSize.x, rawSize.z) || 1;
  const scale = (cfg.fighters[name].radius * 2) / footprint;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  // The gait phase wants body lengths: the longest horizontal extent.
  const length = Math.max(size.x, size.z) || 2.5;

  /*
   * The meshes, listed once, with their bounds precomputed.
   *
   * `spanY` runs this list every frame (see below) and `Box3.setFromObject`
   * over the same tree costs 0.437 ms for the octopus and 0.326 ms for the
   * gorilla — 0.76 ms a frame for both, 4.6% of a 60 Hz budget, to answer one
   * scalar question. The flat list plus a min-Y-only scan answers it in 0.049
   * and 0.039 ms: 0.088 ms a frame, 13x cheaper, and it is the same number.
   */
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    meshes.push(o);
  });
  return { root, length, height: size.y, scale, footprint, meshes };
}

/**
 * The lowest point of this body's geometry right now, in world Y.
 *
 * The obvious thing — measure the bounding box once at rest and lift by that —
 * is what shipped first, and it buries a corpse: the gorilla's `die` pose
 * reaches 2.07 m below its own origin against a rest-measured 0.02 m. The
 * second thing that shipped was a table sampled at load, nine actions by
 * sixteen phases by eight speed bins, and it is wrong in a subtler way: it
 * samples `turn: 0, health: 1, grounded: true` and the fight is full of
 * turning, wounded, airborne bodies. Swept on these two files, the octopus's
 * own pose drops from -0.102 m at turn 0 to -0.492 m at turn ±1 and -0.567 m at
 * a quarter health — nearly half a metre the table never saw. Measured over 12
 * matches / 16 573 live fighter-frames, geometry was below the floor plane in
 * 35.7% of them, worst -0.544 m on a body 1.13 m tall.
 *
 * So the pose is measured after it is struck, not predicted from a key. There
 * is no key left to get wrong, and no interpolation between bins to smooth over
 * the states that matter.
 */
const _span = { min: 0, max: 0 };
function spanY(body) {
  let lo = Infinity, hi = -Infinity;
  for (const o of body.meshes) {
    const bb = o.geometry.boundingBox;
    const e = o.matrixWorld.elements;
    // row 1 of the world matrix is all that contributes to Y: the box's centre
    // projects onto it, and its half-extents project onto the absolute values
    const ax = e[1], ay = e[5], az = e[9];
    const c = ax * (bb.min.x + bb.max.x) * 0.5 + ay * (bb.min.y + bb.max.y) * 0.5
      + az * (bb.min.z + bb.max.z) * 0.5 + e[13];
    const r = Math.abs(ax) * (bb.max.x - bb.min.x) * 0.5
      + Math.abs(ay) * (bb.max.y - bb.min.y) * 0.5
      + Math.abs(az) * (bb.max.z - bb.min.z) * 0.5;
    if (c - r < lo) lo = c - r;
    if (c + r > hi) hi = c + r;
  }
  _span.min = lo; _span.max = hi;
  return _span;
}

/**
 * Which way this body has to turn to end up lying on the ground.
 *
 * Both `die` poses are authored as a collapse about the rig's own hip, and at
 * phase 1 they end up standing on end: measured on these two files, the gorilla
 * spans 2.601 m in Y — taller than its own 2.079 m standing pose — with 2.056 m
 * of it below the floor, and the octopus 1.853 m against a 1.127 m standing
 * height. Anything that lifts that back out of the floor produces a corpse
 * TALLER than the living animal, propped on one limb, which is what shipped.
 *
 * So the fall is searched rather than typed: the death pose is struck once at
 * load, turned through every 15 degrees of body-local pitch and roll within
 * ±90, dropped onto the floor, and scored by where its MASS ends up — the
 * volume-weighted mean height of its geometry, which is the potential energy
 * gravity would have taken out of it. Ties inside 3 cm go to the shortest turn.
 *
 * Height alone was tried first and it cannot tell a corpse from a crouch: both
 * ±90 degrees of roll leave the gorilla exactly 1.777 m tall, but at -90 it
 * comes to rest propped on its own limbs with its mass at 0.960 m and at +90 it
 * is on its back with its mass at 0.817 m, and only one of those reads as dead.
 * What the search settles on: the gorilla 15/90, its mass falling from 1.398 m
 * to 0.706 m and its height from 2.601 m to 1.754 m against a 2.079 m standing
 * pose; the octopus 30/90, mass 1.074 m to 0.406 m, height 1.853 m to 1.034 m
 * against 1.127 m standing. Both corpses end up lower and wider than the living
 * animal, which is the whole point — the silhouette has to say it.
 *
 * The rotation is applied in Y-X-Z order at draw time so pitch and roll stay in
 * the BODY's frame: in the default X-Y-Z the pitch would be a world-space tip
 * and everything measured here would only hold for a corpse facing north.
 */
function fallOrientation(body) {
  const keepP = body.root.position.clone();
  const keepR = body.root.rotation.clone();
  body.root.position.set(0, 0, 0);
  body.root.rotation.set(0, 0, 0, 'YXZ');
  body.root.userData.pose({
    t: 0, dt: 1 / 60, speed: 0, stride: 0, turn: 0,
    grounded: true, health: 0, action: 'die', phase: 1,
  });
  /** Volume-weighted mean height of the posed geometry, in world Y. */
  const massY = () => {
    let sum = 0, w = 0;
    for (const o of body.meshes) {
      const bb = o.geometry.boundingBox;
      const e = o.matrixWorld.elements;
      const vol = (bb.max.x - bb.min.x) * (bb.max.y - bb.min.y) * (bb.max.z - bb.min.z) + 1e-9;
      const cy = e[1] * (bb.min.x + bb.max.x) * 0.5 + e[5] * (bb.min.y + bb.max.y) * 0.5
        + e[9] * (bb.min.z + bb.max.z) * 0.5 + e[13];
      sum += cy * vol; w += vol;
    }
    return sum / w;
  };
  const tried = [];
  for (let ix = -6; ix <= 6; ix++) {
    for (let iz = -6; iz <= 6; iz++) {
      body.root.rotation.set((ix * Math.PI) / 12, 0, (iz * Math.PI) / 12, 'YXZ');
      body.root.updateMatrixWorld(true);
      const s = spanY(body);
      // scored as it would be drawn: standing on the floor, not where the pose
      // happens to have left it
      tried.push({
        ix, iz, turn: Math.abs(ix) + Math.abs(iz),
        rest: massY() - s.min, height: s.max - s.min,
      });
    }
  }
  const lowest = Math.min(...tried.map((t) => t.rest));
  let best = null;
  for (const t of tried) {
    if (t.rest > lowest + 0.03) continue;
    if (!best || t.turn < best.turn) best = t;
  }
  body.root.position.copy(keepP);
  body.root.rotation.copy(keepR);
  return {
    rx: (best.ix * Math.PI) / 12, rz: (best.iz * Math.PI) / 12,
    height: +best.height.toFixed(3), rest: +best.rest.toFixed(3),
  };
}

const bodies = {};
for (const id of ['octopus', 'gorilla']) {
  try {
    bodies[id] = await loadBody(id);
    bodies[id].fall = fallOrientation(bodies[id]);
    scene.add(bodies[id].root);
  } catch (e) {
    fail(`body "${id}" failed to build: ${e.message}`);
  }
}

/** Per-fighter animation state that lives between frames. */
const anim = {
  octopus: { stride: 0, turn: 0, lastX: null, lastZ: null, hitUntil: 0, lastHp: null },
  gorilla: { stride: 0, turn: 0, lastX: null, lastZ: null, hitUntil: 0, lastHp: null },
};

// ---------------------------------------------------------------------------
// effects
// ---------------------------------------------------------------------------

const COLOR = { octopus: 0x39c6d8, gorilla: 0xe0762b };

/**
 * Lay a flat geometry on the ground so that its local +Y becomes world +Z.
 *
 * The sign is the whole point and it was wrong for a while. Rotating -PI/2
 * about X sends local +Y to world MINUS Z, so every ground telegraph and the
 * smash effect were drawn a half-turn away from the direction the skill
 * actually went — a danger zone painted behind the body that was about to
 * swing. It looked entirely plausible in a screenshot, which is why there is
 * now a load-time check (see `checkTelegraphOrientation`) rather than an eye.
 *
 * +PI/2 puts the face normal downwards, so anything using this needs
 * DoubleSide; that is cheaper than another sign to get wrong.
 */
function layFlat(obj) { obj.rotation.x = Math.PI / 2; return obj; }
/** Point a laid-flat object along a simulation heading. */
function faceHeading(obj, h) { obj.rotation.z = -h; return obj; }

/**
 * Metres of travel per gait cycle, as a fraction of body length.
 *
 * The gait phase accumulates by DISTANCE, which is the part that matters: drive
 * it by time instead and the feet skate every time the body accelerates, is
 * knocked back, or is held against a wall — which in this game is most of the
 * match. This constant only sets how many cycles that distance buys, and it is
 * the one number in the bridge that has to be judged by eye: too small and the
 * legs churn, too large and they drag. Exposed here rather than buried in the
 * expression so it can be moved without hunting for it.
 */
const STRIDE_PER_LENGTH = 0.85;

/**
 * Metres of ground per body length, for the SPEED the pose functions read.
 *
 * The obvious divisor is the measured AABB, and that is what shipped: it is the
 * one number in the file that is already known. It is also the wrong one. The
 * AABB measures the animal nose to tail, and no animal covers its own length in
 * a stride. Measured on these two files — 2.5 m for the gorilla, 2.0 m for the
 * octopus — top speed came out at 2.14 and 2.43 body lengths per second, while
 * `bodies/gorilla.js` opens its gallop blend at 2.6 and its sprint at 2.8 and
 * `bodies/octopus.js` opens its fast blend at 3.0. So the gallop was pinned at
 * exactly 0.00 for entire matches: the gorilla could only walk, and the chase —
 * the part of the fight the camera is built to hold — was shot at a stroll.
 *
 * These are gait lengths judged against those bands instead, and they put top
 * speed at 3.96 bl/s (gorilla) and 3.34 (octopus): inside the gallop, into the
 * sprint, with the whole walk/run/gallop ladder reachable. Not read from the
 * geometry, because what one stride covers is a property of how the animal is
 * animated, not of how long it is. `stride` keeps the measured length above —
 * that sets cadence, which was judged by eye and is right.
 */
const GAIT_LENGTH = { octopus: 1.45, gorilla: 1.35 };

const fxPool = [];

function spawnFx(obj, life, update) {
  scene.add(obj);
  fxPool.push({ obj, born: performance.now() / 1000, life, update });
}

function playFx(e) {
  if (e.kind === 'beam') beamFx(e);
  else if (e.kind === 'blink') blinkFx(e);
  else if (e.kind === 'cone') coneFx(e);
  else if (e.kind === 'hit') {
    // A knock on the lens, scaled to the hit. The cheapest thing in the whole
    // viewer that makes an impact read as an impact rather than as a number
    // changing.
    camState.shake = Math.min(0.55, camState.shake + e.amount / 90);
    floatDamage(e.x, e.z, e.amount, e.who);
    const src = e.who === 'octopus' ? 'gorilla' : 'octopus';
    pushFeed(`<span style="color:#${COLOR[src].toString(16)}">${sideName[src]}</span> · ${skillRu(e.skill)} · <b>${e.amount}</b>`, `${src}|${e.skill}|${e.amount}`);
  }
}

/** Fire every queued effect the render clock has now caught up with. */
function playFxUpTo(clock) {
  while (pendingFx.length && pendingFx[0].t <= clock) {
    for (const e of pendingFx.shift().fx) playFx(e);
  }
}

function updateFx(now) {
  for (let i = fxPool.length - 1; i >= 0; i--) {
    const f = fxPool[i];
    const u = (now - f.born) / f.life;
    if (u >= 1) { scene.remove(f.obj); f.obj.traverse?.((o) => o.geometry?.dispose?.()); fxPool.splice(i, 1); continue; }
    f.update(f.obj, u);
  }
}

function beamFx(e) {
  const c = COLOR[e.who];
  const a = new THREE.Vector3(e.x0, 1.15, e.z0);
  const b = new THREE.Vector3(e.x1, 1.15, e.z1);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(0.11, 0.11, len, 8, 1, true);
  g.translate(0, len / 2, 0);
  const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  const glowG = new THREE.CylinderGeometry(0.34, 0.34, len, 8, 1, true);
  glowG.translate(0, len / 2, 0);
  const glow = new THREE.Mesh(glowG, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  mesh.add(glow);
  spawnFx(mesh, 0.22, (o, u) => {
    o.material.opacity = 0.95 * (1 - u);
    glow.material.opacity = 0.22 * (1 - u) ** 2;
    o.scale.set(1 - u * 0.55, 1, 1 - u * 0.55);
  });
  if (e.hit) impactFlash(e.x1, e.z1, c);
  else {
    /*
     * The one event class the feed never carried, and the only one that is not
     * a repeat: the sim counts misses and blocked shots separately (a laser
     * that ends on a solid is 'cover', one that ends at full range is 'aim'),
     * and a beam that ends short of its 24 m range ended on something. That is
     * the difference between "it dodged" and "it used the block", which is the
     * whole tactical story of this arena.
     */
    const cover = len < cfg.skills.laser.range - 0.05;
    pushFeed(`<span style="color:#${c.toString(16)}">${sideName[e.who]}</span> · ${skillRu('laser')} · <span style="opacity:.65">${cover ? 'закрыт укрытием' : 'мимо'}</span>`,
      `${e.who}|laser|${cover ? 'cover' : 'aim'}`);
  }
}

function impactFlash(x, z, c) {
  const s = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 12, 8),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  s.position.set(x, 1.15, z);
  spawnFx(s, 0.3, (o, u) => { o.scale.setScalar(1 + u * 2.4); o.material.opacity = 0.85 * (1 - u); });
}

function blinkFx(e) {
  const c = COLOR[e.who];
  for (const [x, z, dir] of [[e.x0, e.z0, 1], [e.x1, e.z1, -1]]) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.09, 8, 28),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    layFlat(r);
    r.position.set(x, 0.6, z);
    spawnFx(r, 0.45, (o, u) => {
      o.scale.setScalar(dir > 0 ? 1 + u * 2.6 : 3.4 - u * 2.4);
      o.position.y = 0.6 + u * 1.4;
      o.material.opacity = 0.9 * (1 - u);
    });
  }
}

function coneFx(e) {
  const c = COLOR[e.who];
  const g = new THREE.CircleGeometry(e.range, 24, -e.half + Math.PI / 2, e.half * 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color: e.hit ? c : 0x8a8f99, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
  }));
  layFlat(m);
  faceHeading(m, e.heading);
  m.position.set(e.x, 0.06, e.z);
  spawnFx(m, 0.3, (o, u) => { o.material.opacity = 0.55 * (1 - u); o.scale.setScalar(1 + u * 0.12); });
  if (!e.hit) {
    pushFeed(`<span style="color:#${c.toString(16)}">${sideName[e.who]}</span> · ${skillRu('smash')} · <span style="opacity:.65">мимо</span>`, `${e.who}|smash|miss`);
  }
}

// ---------------------------------------------------------------------------
// telegraphs — the part that makes the fight readable
// ---------------------------------------------------------------------------

/**
 * Everything a watcher needs in order to see a decision BEFORE its consequence.
 *
 * A hit that arrives with no warning is arbitrary; a hit that arrives after a
 * visible wind-up is a thing someone failed to dodge, and that is the whole
 * difference between a number changing and a fight. Each of these is drawn from
 * the same state the simulation resolves against — the aim line uses the
 * current heading because the beam uses the current heading, the danger cone
 * uses `range + radius` because `inCone` does — so a telegraph can never
 * promise something the strike will not deliver.
 */
function makeTelegraph(id) {
  const c = COLOR[id];
  const g = new THREE.Group();

  /*
   * A filled disc under the feet plus a hard rim at exactly the collision
   * radius. Two jobs: it says where a small dark body is on a big pale floor,
   * and it makes "they are touching" visible — the two rims meet at the instant
   * the solver starts pushing them apart, so a viewer can see a body block
   * rather than wondering why one stopped.
   */
  const ring = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(cfg.fighters[id].radius, 40),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(cfg.fighters[id].radius * 0.87, cfg.fighters[id].radius, 44),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.add(disc); ring.add(rim);
  layFlat(ring);
  ring.position.y = 0.03;
  ring.userData.rim = rim;
  ring.userData.disc = disc;
  g.add(ring);

  const sk = cfg.skills;
  const cone = new THREE.Mesh(
    new THREE.CircleGeometry(1, 30, -sk.smash.halfAngle + Math.PI / 2, sk.smash.halfAngle * 2),
    new THREE.MeshBasicMaterial({ color: 0xff4d3d, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  layFlat(cone);
  cone.position.y = 0.045;
  cone.visible = false;
  g.add(cone);

  const laneLen = sk.charge.dashSpeed * sk.charge.dashSeconds;
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, laneLen),
    new THREE.MeshBasicMaterial({ color: 0xff4d3d, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  lane.geometry.translate(0, laneLen / 2, 0);
  layFlat(lane);
  lane.position.y = 0.04;
  lane.visible = false;
  g.add(lane);

  const aim = new THREE.Mesh(
    new THREE.PlaneGeometry(0.06, sk.laser.range),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  aim.geometry.translate(0, sk.laser.range / 2, 0);
  layFlat(aim);
  aim.position.y = 0.05;
  aim.visible = false;
  g.add(aim);

  // A wireframe, not a solid. A filled sphere at this radius reads as the body
  // vanishing rather than as the body being untouchable, and the whole point of
  // an i-frame telegraph is that you can still see what it is protecting.
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.fighters[id].radius * 1.45, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, wireframe: true }),
  );
  shell.visible = false;
  g.add(shell);

  scene.add(g);
  return { g, ring, cone, lane, laneLen, aim, shell };
}

/**
 * How far a charge launched from here along `h` can actually travel.
 *
 * The lane was drawn at its nominal 12 m — dashSpeed * dashSeconds — and never
 * trimmed, while the simulation ends a dash the instant the swept body meets
 * anything solid. Over an even sweep of the floor the sim cuts 73.2% of dashes
 * short, by 5.23 m on average, so the one telegraph the gorilla fully commits
 * to was routinely promising reach straight through a block it would stop dead
 * against — and the octopus was being told to clear ground it never had to
 * leave. A telegraph that overstates is worse than none: it teaches a dodge
 * that is not needed and hides the one that is.
 *
 * This marches the swept body exactly as `dashStep` does — the same 0.5 m tick,
 * the same circle-against-box rule, the same walls — rather than solving a ray
 * against the geometry. A closed-form answer was written first and it was wrong
 * in the place it mattered: expanding a block by the body radius squares off
 * its corners, so a gorilla standing on the diagonal beside a block read as
 * already touching it and the lane collapsed to nothing in 8.3% of the sweep.
 * Twenty-four steps against six boxes, only on the frames a charge is being
 * telegraphed, is not worth being clever about.
 */
function dashReach(id, x, z, h, budget) {
  const r = cfg.fighters[id].radius;
  const step = cfg.skills.charge.dashSpeed / cfg.tickHz;
  const dx = Math.sin(h), dz = Math.cos(h);
  let gone = 0;
  while (gone + step <= budget + 1e-6) {
    const nx = x + dx * (gone + step), nz = z + dz * (gone + step);
    // the walls are not in `cfg.arena.obstacles`: a charge stops with its rim
    // against the inside face, which is all four of them at once
    if (Math.abs(nx) + r > HALF || Math.abs(nz) + r > HALF) break;
    let struck = false;
    for (const o of cfg.arena.obstacles) {
      const qx = THREE.MathUtils.clamp(nx, o.x - o.hx, o.x + o.hx);
      const qz = THREE.MathUtils.clamp(nz, o.z - o.hz, o.z + o.hz);
      if ((nx - qx) ** 2 + (nz - qz) ** 2 < r * r) { struck = true; break; }
    }
    if (struck) break;
    gone += step;
  }
  return gone;
}

/**
 * How far a beam fired from (x, z) along `h` travels before it meets a solid.
 *
 * Plan view only, and deliberately: the blocks are 3.2 m, the walls are 4 m and
 * the beam flies at 1.15 m, so nothing the footprint stops can be cleared by
 * height. This is the same question `segBoxes` answers for the simulation in
 * `resolveStrike`, over the same set of boxes, so the line ends where the shot
 * ends. It ignores the enemy body on purpose — a beam that would hit is still
 * aimed at the wall behind, and drawing it short of the target would say the
 * shot stops there whether or not the target moves.
 */
function beamReach(x, z, h, rOff) {
  const range = cfg.skills.laser.range;
  const dx = Math.sin(h) * range, dz = Math.cos(h) * range;
  const ox = x + Math.sin(h) * rOff, oz = z + Math.cos(h) * rOff;
  let best = 1;
  for (const o of SOLIDS) {
    let t0 = 0, t1 = 1;
    let miss = false;
    for (const [s, d, lo, hi] of [[ox, dx, o.x - o.hx, o.x + o.hx], [oz, dz, o.z - o.hz, o.z + o.hz]]) {
      if (Math.abs(d) < 1e-9) { if (s < lo || s > hi) { miss = true; break; } continue; }
      let a = (lo - s) / d, b = (hi - s) / d;
      if (a > b) { const q = a; a = b; b = q; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) { miss = true; break; }
    }
    if (!miss && t1 > 0 && t0 < best) best = Math.max(0, t0);
  }
  return best * range;
}

const tele = { octopus: makeTelegraph('octopus'), gorilla: makeTelegraph('gorilla') };

/**
 * What a fighter looks like when there is something between it and the eye.
 *
 * The camera can climb over a solid and step around it, and with the walls in
 * the test it now does — but a body pressed against a 3.2 m block a metre away
 * cannot be cleared from any angle the framing rule is allowed to take, and a
 * chase spends its life against cover. Measured: completely invisible in 12.1%
 * of live fighter-frames before, 10.5% after the camera work alone. The audit
 * caught the octopus casting its laser through an entire 0.83 s charge from
 * behind a block — the mage-and-warrior beat this whole viewer exists to show,
 * played with the mage off screen — so the last 10% is not a rounding error.
 *
 * Two answers, in this order. The occluders between eye and body fade (their
 * edge wireframes stay, so the cover is still legible), and a silhouette drawn
 * with `depthTest: false` puts the fighter's colour and position through the
 * geometry regardless. Together they cover 98.2% of the frames where the body
 * is geometrically hidden — the other 1.8% is the fade's own ramp — and they
 * cost the arena almost nothing: averaged over a match, 0.43 of the ten solids
 * is dimmed at any instant. The silhouette is deliberately weak — a soft body
 * tint and a hard ground ring, the same ring language the telegraphs already
 * use — because it exists to say WHERE, not to replace the animal with a
 * lozenge.
 */
const GHOST_BODY = 0.30;
const GHOST_RING = 0.85;
/** What an occluder fades to. Below about this the arena stops reading as solid. */
const FADE_TO = 0.24;

function makeGhost(id) {
  const c = COLOR[id];
  const rad = cfg.fighters[id].radius;
  const h = Math.max(0.6, bodies[id]?.height ?? 2);
  const r = rad * 0.6;
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: 0, depthTest: false, depthWrite: false,
  });
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.1, h - r * 2), 3, 12), bodyMat);
  cap.position.y = h / 2;
  cap.renderOrder = 999;
  g.add(cap);
  const ringMat = new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(rad * 0.82, rad, 40), ringMat);
  layFlat(ring);
  ring.position.y = 0.05;
  ring.renderOrder = 999;
  g.add(ring);
  g.visible = false;
  scene.add(g);
  return { g, bodyMat, ringMat, on: 0 };
}

const ghosts = { octopus: makeGhost('octopus'), gorilla: makeGhost('gorilla') };

/**
 * Fade whatever is in the way, and show the silhouette while it is still there.
 *
 * Two of a body's three sample heights behind one solid is the threshold: a
 * block that clips a foot is not worth dissolving the arena for, and by the
 * time two of the three are gone the animal is unreadable. Getting out of the
 * way is quick (rate 14) and coming back is slow (3.5), because being late is
 * the only way the fast direction can fail, while a fast return strobes the
 * whole block every time a fighter crosses its corner.
 */
function updateOcclusion(view, dt) {
  for (const o of SOLIDS) o.want = 1;
  for (const id of ['octopus', 'gorilla']) {
    const v = view[id];
    const gh = ghosts[id];
    const body = bodies[id];
    if (!v || !body) continue;
    for (const o of SOLIDS) o.hits = 0;
    const n = hiddenCount(camera.position, v, body.height, true);
    for (const o of SOLIDS) if (o.hits >= 2) o.want = FADE_TO;
    const want = n >= 3 ? 1 : 0;
    gh.on += (want - gh.on) * (1 - Math.exp(-(want > gh.on ? 16 : 5) * dt));
    gh.g.visible = gh.on > 0.02;
    if (gh.g.visible) {
      gh.g.position.set(v.x, v.y, v.z);
      // a corpse keeps the ring and loses the standing lozenge, which would be
      // the one shape on screen still claiming the loser is on its feet
      gh.bodyMat.opacity = v.alive ? GHOST_BODY * gh.on : 0;
      gh.ringMat.opacity = GHOST_RING * gh.on;
      // white while the blink i-frames are up, so the one moment the octopus is
      // untouchable still reads as untouchable when it happens behind a wall
      gh.bodyMat.color.setHex(v.inv ? 0xffffff : COLOR[id]);
      gh.ringMat.color.setHex(v.inv ? 0xffffff : COLOR[id]);
    }
  }
  for (const o of SOLIDS) {
    o.fade += (o.want - o.fade) * (1 - Math.exp(-(o.want < o.fade ? 14 : 3.5) * dt));
    for (const m of o.mats) m.opacity = o.fade;
  }
}

/**
 * Do the ground telegraphs point where the simulation says the skill will go?
 *
 * This is not paranoia about three.js Euler order — it is the one thing in the
 * viewer that, if it were wrong, would be WORSE than not drawing it at all. A
 * danger zone drawn on the wrong side of a body does not merely fail to warn,
 * it actively misleads, and it would look perfectly plausible in every
 * screenshot. Four headings, checked at load, in the same frame of reference
 * the simulation uses: heading 0 is +Z and heading PI/2 is +X.
 */
(function checkTelegraphOrientation() {
  const t = tele.gorilla;
  const probe = new THREE.Object3D();
  probe.position.set(0, 1, 0); // the +Y axis of the flat geometries, before rotation
  t.cone.add(probe);
  const keep = t.g.position.clone();
  t.g.position.set(0, 0, 0);
  const out = new THREE.Vector3();
  for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    t.cone.rotation.z = -h;
    t.g.updateMatrixWorld(true);
    probe.getWorldPosition(out);
    const wantX = Math.sin(h), wantZ = Math.cos(h);
    if (Math.hypot(out.x - wantX, out.z - wantZ) > 0.02) {
      fail(`telegraph points the wrong way at heading ${h.toFixed(2)}: `
        + `drawn towards (${out.x.toFixed(2)}, ${out.z.toFixed(2)}), skill goes to (${wantX.toFixed(2)}, ${wantZ.toFixed(2)})`);
    }
  }
  t.cone.remove(probe);
  t.g.position.copy(keep);
})();

/** Where in a skill's own clock we are, in seconds, from the snapshot's 0..1. */
function actElapsed(f) {
  const sk = cfg.skills[f.act];
  if (!sk) return 0;
  const total = (sk.windup || 0) + (sk.airborne || 0) + (sk.dashSeconds || 0) + (sk.recover || 0);
  return f.phase * total;
}

function updateTelegraph(id, v) {
  const t = tele[id];
  t.g.position.set(v.x, 0, v.z);
  t.g.visible = v.alive;
  if (!v.alive) return;

  t.ring.userData.rim.material.opacity = v.stun ? 0.35 : 0.95;
  t.ring.userData.disc.material.opacity = v.stun ? 0.06 : 0.16;

  const sk = cfg.skills;
  const el = actElapsed(v);

  /*
   * Both wind-ups are under a third of a second — eight frames at 30 Hz — so a
   * telegraph that fades UP from nothing spends most of its life invisible and
   * the hit still arrives unannounced. They start clearly visible and brighten,
   * which is the difference between "there was a warning" and "there was a
   * warning you could act on".
   */
  const winding = v.act === 'smash' && v.actPhase === 'windup';
  t.cone.visible = winding;
  if (winding) {
    const u = THREE.MathUtils.clamp(el / sk.smash.windup, 0, 1);
    t.cone.scale.setScalar(sk.smash.range + cfg.fighters[id].radius);
    faceHeading(t.cone, v.h);
    t.cone.material.opacity = 0.30 + 0.35 * u;
  }

  // charge: the lane while it can still be aimed, and again while it travels,
  // so the committed path is visible rather than inferred from a blur
  const revving = v.act === 'charge' && v.actPhase === 'windup';
  const running = v.act === 'charge' && v.actPhase === 'dash';
  t.lane.visible = revving || running;
  if (revving || running) {
    // Trimmed twice: by the dash time still unspent, and by the first solid in
    // the way. Mid-dash the lane is what is LEFT of the charge, which is the
    // only honest thing to draw once part of it has been spent.
    const spent = running ? THREE.MathUtils.clamp(el - sk.charge.windup, 0, sk.charge.dashSeconds) : 0;
    const budget = sk.charge.dashSpeed * (sk.charge.dashSeconds - spent);
    faceHeading(t.lane, v.h);
    t.lane.scale.set(1, Math.max(0.02, dashReach(id, v.x, v.z, v.h, budget)) / t.laneLen, 1);
  }
  if (revving) {
    const u = THREE.MathUtils.clamp(el / sk.charge.windup, 0, 1);
    t.lane.material.opacity = 0.24 + 0.30 * u;
  } else if (running) {
    const u = THREE.MathUtils.clamp((el - sk.charge.windup) / sk.charge.dashSeconds, 0, 1);
    t.lane.material.opacity = 0.45 * (1 - u);
  }

  // laser: where the beam will leave from, tracked live through the cast
  const casting = v.act === 'laser' && v.actPhase === 'windup';
  t.aim.visible = casting;
  if (casting) {
    const u = THREE.MathUtils.clamp(el / sk.laser.windup, 0, 1);
    faceHeading(t.aim, v.h);
    t.aim.material.opacity = 0.34 + 0.4 * u;
    /*
     * Trimmed at the first solid, like the charge lane beside it.
     *
     * The lane has been honest about its reach since `dashReach` went in, with
     * a comment arguing that a telegraph which overstates is worse than none.
     * The aim line was not: it was drawn at the full 24 m range and ran through
     * blocks and out through the 4 m walls into the void, while the legend
     * promised "where the beam will go" and the sim blocked the shot — the
     * stats count it, `blocked.laser` was 1 of 9 uses in one match. The beam
     * leaves from `radius + 0.2` ahead of the centre and stops at the first
     * solid (sim.js resolveStrike), so the drawn plane, which starts at the
     * centre, ends exactly where the beam does.
     */
    const rOff = cfg.fighters[id].radius + 0.2;
    t.aim.scale.set(1 + u * 4, (rOff + beamReach(v.x, v.z, v.h, rOff)) / sk.laser.range, 1);
  }

  t.shell.visible = v.inv;
  if (v.inv) {
    t.shell.position.y = cfg.fighters[id].radius * 1.2 + v.y;
    t.shell.material.opacity = 0.45 + 0.25 * Math.sin(performance.now() / 55);
    t.shell.rotation.y += 0.06;
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

const hud = $('#hud');
const feed = $('#feed');
const bars = {
  octopus: { wrap: $('#bar-oct'), fill: $('#bar-oct .hp > i'), label: $('#bar-oct .hp > b'), cds: $('#bar-oct .cds'), meta: $('#meta-oct') },
  gorilla: { wrap: $('#bar-gor'), fill: $('#bar-gor .hp > i'), label: $('#bar-gor .hp > b'), cds: $('#bar-gor .cds'), meta: $('#meta-gor') },
};
/**
 * Русские подписи умений и имена существ на плитах.
 *
 * Экран боя утверждён поэлементно (§10.6) — но утверждён он был как
 * инструмент ревьюера, на английском и с видами вместо существ. В продукте
 * на плите стоит имя существа игрока, а не название стороны, и подпись чипа
 * читается по-русски. Таблица тут, а не в клиенте, потому что чипы строит
 * этот файл.
 */
const SKILL_RU = {
  laser: 'луч', blink: 'рывок', smash: 'удар', charge: 'разгон', jump: 'прыжок',
  beam: 'луч', cone: 'конус', bolt: 'снаряд', lob: 'навес', zone: 'зона', dash: 'рывок',
};
const skillRu = (id) => SKILL_RU[id] || id;
const REASON_RU = {
  kill: 'у соперника кончилось здоровье',
  timeout: 'время вышло — здоровья осталось больше',
  'timeout-draw': 'время вышло — здоровье поровну',
  'double-ko': 'оба выбыли в один тик',
};

/** Имя существа на стороне — приходит в сообщении `match`. */
const sideName = { octopus: 'осьминог', gorilla: 'горилла' };

const cdEls = { octopus: {}, gorilla: {} };
for (const id of ['octopus', 'gorilla']) {
  for (const s of cfg.fighters[id].skills.concat('jump')) {
    const el = document.createElement('div');
    el.className = 'cd';
    el.textContent = skillRu(s);
    el.dataset.skill = s;
    bars[id].cds.appendChild(el);
    cdEls[id][s] = el;
  }
}

const sayEls = { octopus: null, gorilla: null };
const lastSaid = { octopus: null, gorilla: null };
function setSay(id, textValue) {
  /*
   * Реплика дублируется в ленту.
   *
   * F11 закрыл исходник и назначил эти строки одним из двух доказательств,
   * что поведение написала модель. Пузырь висит три секунды над телом, и
   * зритель, смотревший в другую половину арены, теряет единственное
   * доказательство, которое там было. Лента его сохраняет.
   */
  if (textValue && lastSaid[id] !== textValue) {
    lastSaid[id] = textValue;
    pushFeed(`<span style="color:#${COLOR[id].toString(16)}">${sideName[id]}</span> · <i style="font-style:normal;opacity:.9">«${textValue}»</i>`);
  }
  if (!textValue) {
    if (sayEls[id]) { sayEls[id].remove(); sayEls[id] = null; }
    return;
  }
  if (!sayEls[id]) {
    const d = document.createElement('div');
    d.className = 'saybubble';
    d.style.color = `#${COLOR[id].toString(16).padStart(6, '0')}`;
    hud.appendChild(d);
    sayEls[id] = d;
  }
  sayEls[id].textContent = textValue;
}

function floatDamage(x, z, amount, who) {
  const d = document.createElement('div');
  d.className = 'dmg';
  d.textContent = `-${amount}`;
  d.style.color = `#${COLOR[who === 'octopus' ? 'gorilla' : 'octopus'].toString(16).padStart(6, '0')}`;
  hud.appendChild(d);
  const born = performance.now();
  const tick = () => {
    const u = (performance.now() - born) / 1100;
    if (u >= 1) { d.remove(); return; }
    const v = project(x, 1.8 + u * 2.2, z);
    d.style.left = `${v.x}px`; d.style.top = `${v.y}px`;
    d.style.opacity = String(1 - u * u);
    d.style.fontSize = `${20 - u * 5}px`;
    requestAnimationFrame(tick);
  };
  tick();
}

const _p = new THREE.Vector3();
function project(x, y, z) {
  _p.set(x, y, z).project(camera);
  return { x: (_p.x * 0.5 + 0.5) * innerWidth, y: (-_p.y * 0.5 + 0.5) * innerHeight };
}

/**
 * The feed, with the repeats collapsed.
 *
 * Every laser does exactly 27 and every smash exactly 35, so a fight that goes
 * the distance prints the same string eight times in a row and the feed carries
 * nothing but ordering — eight consecutive "octopus laser 27" lines in the
 * audit shots. Counting the repeat instead keeps the ordering, says how many,
 * and leaves room in fourteen lines for the events that are not repeats.
 */
function pushFeed(line, key) {
  const top = feed.firstChild;
  const stamp = `<span class="ft">${renderClock.toFixed(1)}</span>`;
  if (key && top && top.dataset.key === key) {
    top.dataset.n = String((Number(top.dataset.n) || 1) + 1);
    top.innerHTML = `${stamp}${line} <span style="opacity:.6">x${top.dataset.n}</span>`;
    return;
  }
  const d = document.createElement('div');
  d.innerHTML = `${stamp}${line}`;
  if (key) d.dataset.key = key;
  feed.prepend(d);
  while (feed.children.length > 14) feed.lastChild.remove();
}

/**
 * Nameplates: the two numbers that change, over the fighter they belong to.
 *
 * `project` already puts the taunt bubble on a body, so this is the same trick
 * with the health bar and the cast bar a duel is actually read from. The cast
 * bar is the more valuable of the two: the laser's wind-up is 0.65 s of config
 * and 0.667 s on the tick clock — long enough to react to — and until now the
 * only sign it was happening at all was a thin line on the floor.
 */
const plates = {};
for (const id of ['octopus', 'gorilla']) {
  const d = document.createElement('div');
  d.className = 'plate';
  d.style.color = `#${COLOR[id].toString(16).padStart(6, '0')}`;
  d.innerHTML = '<div class="lab"></div><div class="t"><i></i></div><div class="t cast"><i></i></div>';
  d.style.display = 'none';
  hud.appendChild(d);
  plates[id] = { root: d, lab: d.querySelector('.lab'), hp: d.querySelector('.t > i'), cast: d.querySelector('.cast > i') };
}

function updatePlate(id, v, height) {
  const p = plates[id];
  if (!v.alive) { p.root.style.display = 'none'; return; }
  const sk = cfg.skills[v.act];
  const casting = !!sk && v.actPhase === 'windup' && (sk.windup || 0) > 0.05;
  p.root.style.display = 'block';
  p.root.classList.toggle('casting', casting);
  p.hp.style.width = `${THREE.MathUtils.clamp(v.hp / v.maxHp, 0, 1) * 100}%`;
  if (casting) {
    p.lab.textContent = v.act;
    p.cast.style.width = `${THREE.MathUtils.clamp(actElapsed(v) / sk.windup, 0, 1) * 100}%`;
  }
  const at = project(v.x, v.y + height + 0.45, v.z);
  p.root.style.left = `${at.x}px`;
  p.root.style.top = `${at.y}px`;
}

// ---------------------------------------------------------------------------
// the socket
// ---------------------------------------------------------------------------

let frames = [];
/**
 * Effects waiting for the render clock to reach them, `{ t, fx }` in order.
 *
 * They used to fire the instant their frame arrived off the socket, which put
 * every beam, blink ring, screen shake and damage number one to two snapshot
 * intervals AHEAD of the body that caused it — the flash landed before the arm
 * came down and the hit number floated off a fighter still winding up. The
 * bodies are drawn at `renderClock`; so is this now.
 */
let pendingFx = [];
let matchInfo = null;
let renderClock = 0;
let over = null;

/**
 * The fight is decided — read off the frame being DRAWN, not off the message.
 *
 * `over` above is the socket's `over` message, and the server runs the world
 * with `curtainSeconds` 2.6, so that message lands 2.6 s after somebody dies.
 * The camera had nothing else to go on, which made the whole death animation
 * and topple — 154 rendered frames a match at 60 Hz, measured over 24 kills on
 * l1/l3, l1/l4, l3/l1, l1/l6, l2/l5, l4/l2 at seeds 101, 202, 303, 404 — a
 * window in which the framing rule dropped the corpse (`holds` and
 * `checkFraming` both skipped a dead fighter until `over` arrived) and the kill
 * push-in had not started: mean eye distance across that window 19.26 m against
 * 15.11 m off this flag, and 19.21 m against 14.50 m at the 1.3 s mark, which
 * is the middle of the topple. The push-in was arriving after its own shot.
 *
 * The snapshot has carried `over` per frame all along (`sim.js` sets it on the
 * same tick that sets `alive: false`), so the flag is free and it is exactly in
 * step with the corpse the viewer is drawing — `view[id].alive` comes from the
 * same bracket frame. The banner, the stats and the loop timer still wait for
 * the message, because those are about the match REPORT and not about the shot.
 */
let decided = false;

const SNAP_DT = 1 / cfg.tickHz;
/** How far behind the newest snapshot the render clock runs. Two intervals. */
const DELAY = SNAP_DT * 2;

let ws;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  window.__ws = () => (ws ? ws.readyState : -1);
  /* Одна дверь наружу для оболочки: попросить сервер повторить конкретный
     бой. Второй сокет дал бы второе мнение о том, что сейчас идёт. */
  window.__airenaSend = (v) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(v)); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    /*
     * Everything the socket says is re-broadcast as a DOM event.
     *
     * The product shell (tabs, result panel, idle countdown) has to react to
     * the same messages, and giving it a second socket would give it a second
     * opinion about what fight is running. One socket, one truth, and the
     * shell listens rather than asks.
     */
    dispatchEvent(new CustomEvent(`airena:${m.type}`, { detail: m }));
    if (m.type === 'error') { fail(m.message); return; }
    if (m.type === 'match') {
      frames = []; pendingFx = []; renderClock = 0; over = null; decided = false; matchInfo = m; framingLost = false;
      // Snap rather than ease onto the first frame: easing in from the previous
      // match's framing means the opening seconds — the approach, which is the
      // only part of the fight with the whole arena in it — are shot from
      // wherever the last one ended.
      camState.snap = true;
      $('#banner').classList.remove('on');
      feed.innerHTML = '';
      for (const id of ['octopus', 'gorilla']) {
        const meta = m.meta[id];
        /* Под именем — автор мозга, и всё. Теги, effort и длина исходника —
           дев-телеметрия; на продуктовой плите они занимают место, где должно
           стоять единственное, что игроку важно: кто это написал. */
        bars[id].meta.textContent = meta?.model || '';
        anim[id].lastHp = null; anim[id].lastX = null;
        /*
         * The plate carries the CREATURE's name when the server sends one.
         * `octopus` and `gorilla` are the names of the two SIDES — cyan and
         * orange — not of the things fighting; once creatures belong to
         * players, printing the side name on the plate is printing the wrong
         * word in the most visible place on the screen.
         */
        if (m.names && m.names[id]) {
          const el = $(id === 'octopus' ? '#bar-oct .name' : '#bar-gor .name');
          if (el) el.textContent = m.names[id];
          sideName[id] = m.names[id];
        }
      }
      $('#clock .s').textContent = `бой №${m.seed}`;
      const box = $('#seed');
      if (box && box.value.trim() === '') box.placeholder = String(m.seed);
      return;
    }
    if (m.type === 'frame') {
      frames.push(m.frame);
      if (frames.length === 1) renderClock = m.frame.t - DELAY;
      if (frames.length > 240) frames.splice(0, frames.length - 240);
      if (m.frame.fx.length) pendingFx.push({ t: m.frame.t, fx: m.frame.fx });
      return;
    }
    if (m.type === 'over') {
      // The last frame's effects have no successor to walk the render clock
      // past them — the clock is held one tick behind the newest snapshot — so
      // without this the killing blow is the one hit that never flashes.
      playFxUpTo(Infinity);
      over = m;
      const b = $('#banner');
      b.querySelector('.who').textContent = m.winner ? `${sideName[m.winner]} · ПОБЕДА` : 'НИЧЬЯ';
      b.querySelector('.who').style.color = m.winner ? `#${COLOR[m.winner].toString(16)}` : '#fff';
      b.querySelector('.why').textContent = REASON_RU[m.reason] || m.reason;
      b.classList.add('on');
      if ($('#chk-loop').checked) setTimeout(startMatch, 2600);
      /*
       * `faults 0/716 · uses {...}` больше не печатается в ленту.
       *
       * Это телеметрия, и стояла она ровно в том слоте, который §10.3 отводит
       * под свидетельство: последнее, что видит зритель после боя. Ревьюеру
       * она по-прежнему доступна — в дев-режиме, в консоли.
       */
      if (new URLSearchParams(location.search).get('dev')) {
        for (const id of ['octopus', 'gorilla']) {
          const s = m.stats[id];
          console.log(`${id}: faults ${s.faults}/${s.thinks} · uses`, s.uses);
        }
      }
    }
  };
  ws.onclose = () => setTimeout(connect, 900);
}
/*
 * Сокет открывается В КОНЦЕ файла, а не здесь.
 *
 * Модуль приостанавливается на двух верхнеуровневых await (`/api/config` и
 * `/api/recommended`), и всё, что объявлено ниже через `let`, во время этой
 * паузы ещё не инициализировано. Дев-вьювер этого не замечал: там матч
 * начинается по пробелу, то есть заведомо после конца evaluation. Продуктовый
 * сервер шлёт `match` сразу на подключение — и `onmessage` падал на
 * `framingLost` с «Cannot access before initialization», а вместе с ним
 * умирал весь рендер.
 */

/**
 * A specific fight, again.
 *
 * There is no replay FILE because there does not need to be one: a match is a
 * pure function of (seed, brainA, brainB), so naming the seed replays it
 * exactly. `?seed=123456&oct=g1&gor=g2` reproduces any fight in the report, and
 * the seed of whatever you are watching is printed under the clock.
 */
let forcedSeed = null;

function startMatch() {
  if (!ws || ws.readyState !== 1) {
    // Silent no-ops are how a viewer ends up looking broken for a reason nobody
    // can see. Say what happened and try again when the socket comes back.
    fail(`not connected (socket state ${ws ? ws.readyState : 'none'}) — retrying`);
    setTimeout(startMatch, 700);
    return;
  }
  errBox.style.display = 'none';
  errBox.textContent = '';
  const seedBox = $('#seed');
  const typed = seedBox && seedBox.value.trim() !== '' ? Number(seedBox.value) : NaN;
  const seed = Number.isFinite(typed) ? typed : (forcedSeed !== null ? forcedSeed : undefined);
  forcedSeed = null;
  ws.send(JSON.stringify({
    cmd: 'start',
    octopus: $('#sel-oct').value,
    gorilla: $('#sel-gor').value,
    speed: Number($('#sel-speed').value),
    ...(seed === undefined ? {} : { seed }),
  }));
}
$('#btn-run').onclick = startMatch;
addEventListener('keydown', (e) => {
  const t = e.target;
  /* TEXTAREA joined this list the moment the product grew a prompt field:
     Space is "fight" here and a space character there, and preventDefault on
     the wrong one silently eats every second word the player types. */
  if (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
      || t.isContentEditable || document.body.dataset.typing === '1') return;
  if (e.code === 'Space') { e.preventDefault(); startMatch(); }
  if (e.key === 'c' || e.key === 'C') $('#btn-cam').click();
  if (e.key === 'Escape') $('#code').classList.remove('on');
});

/**
 * The brain, on screen — MOVED OUT.
 *
 * The panel that fetches `/api/source/<tag>/<id>` now lives in
 * `src/viewer/devpanel.js`, which only the dev viewer loads. It stayed here
 * for a while behind "the handler never binds in the product, there is no
 * data-fighter attribute" — and that is exactly the reasoning F11 exists to
 * refuse. The string `/api/source/` shipping in the player's bundle is a
 * path, and a path that only a missing attribute closes is not closed.
 *
 * Worse than the leak is the shape of it: a visitor reads a brain's source on
 * the landing page, makes their own four minutes later, and cannot read that
 * one. Bait and switch, at the exact moment we ask for an account.
 *
 * `tools/checkscope.mjs` fails the build if it comes back.
 */

/**
 * Three kinds of thing in one list, said out loud.
 *
 * `j3`, `probe-corner` and `stub` are not entries in the same competition and
 * the difference is the whole claim this project makes: one was written by a
 * model, one is a hand-written degeneracy probe that exists to be beaten, and
 * one is the reference floor everything is measured against. A flat list of
 * tags invites a reader to compare a generated brain's showing against a
 * probe's as though both were candidates. The sidecar meta is the
 * discriminator rather than the tag spelling — a generated brain has a JSON
 * naming the model that wrote it, a hand-written one has none.
 */
/* Список тегов — дев-удобство, а не часть боя. На продуктовом сервере
   этого маршрута нет вовсе (F11: исходники и теги чужих мозгов наружу не
   ходят), и падать из-за отсутствующего выпадающего списка — значит терять
   картинку ради инструмента ревьюера. */
const tagList = await fetch('/api/brains')
  .then((r) => (r.ok ? r.json() : []))
  .then((v) => (Array.isArray(v) ? v : []))
  .catch(() => []);
const BRAIN_GROUPS = [
  ['written by a model', (t, id) => !!t[id]],
  ['hand-written probes', (t, id) => !t[id] && t.tag !== 'stub'],
  ['reference stub', (t) => t.tag === 'stub'],
];
for (const [sel, id] of [[$('#sel-oct'), 'octopus'], [$('#sel-gor'), 'gorilla']]) {
  for (const [label, belongs] of BRAIN_GROUPS) {
    const group = document.createElement('optgroup');
    group.label = label;
    for (const t of tagList) {
      if (!t.has[id] || !belongs(t, id)) continue;
      const o = document.createElement('option');
      o.value = t.tag; o.textContent = t.tag;
      group.appendChild(o);
    }
    if (group.children.length) sel.appendChild(group);
  }
  const preferred = [...sel.options].find((o) => o.value !== 'stub');
  if (preferred) sel.value = preferred.value;
}
/**
 * Capture mode: `?shots=1&oct=f1&gor=f1&n=20&every=1.1`
 *
 * A reviewer with a clean context needs to be able to LOOK at this, and the
 * cheapest way to make that survive being handed to someone else is a set of
 * PNGs on disk that anyone can regenerate with a URL. It also sidesteps the
 * fact that a devtools console runs in an isolated world and cannot see this
 * module's own scope at all.
 */
const params = new URLSearchParams(location.search);
if (params.get('seed')) {
  forcedSeed = Number(params.get('seed'));
  const box = $('#seed');
  if (box) box.value = params.get('seed');
}

// open on the closest fight the tournament found, when there has been one
try {
  const rec = await (await fetch('/api/recommended')).json();
  if (rec) {
    if ([...$('#sel-oct').options].some((o) => o.value === rec.octopus)) $('#sel-oct').value = rec.octopus;
    if ([...$('#sel-gor').options].some((o) => o.value === rec.gorilla)) $('#sel-gor').value = rec.gorilla;
  }
} catch { /* no tournament has been run; the first tag is fine */ }

/**
 * Post the current canvas to the server, which writes it to reports/screens.
 *
 * The read has to happen inside the frame, immediately after the draw: once the
 * canvas has been presented the drawing buffer is gone and `toDataURL` returns
 * a blank image on both backends. So this queues, and the loop serves it.
 */
let pendingShot = null;
function shoot(name) {
  return new Promise((resolve) => { pendingShot = { name, resolve }; });
}

// ---------------------------------------------------------------------------
// camera
// ---------------------------------------------------------------------------

const camModes = ['auto', 'wide', 'top'];
let camMode = 0;
/*
 * When the last cut was, because a cut is not a framing failure.
 *
 * Switching modes carries `camState.look` across and plants the eye somewhere
 * new in the same frame, so for a few frames the old aim point is being shot
 * from the new position and a body can genuinely leave the picture. That is
 * what pressing the button asks for. `checkFraming` judges the framing RULE,
 * so it stands down until the ease has caught up — otherwise the one assertion
 * in this file cries wolf every time someone tries the other two cameras.
 */
let camCutAt = -1;
$('#btn-cam').onclick = () => {
  camMode = (camMode + 1) % camModes.length;
  camCutAt = performance.now() / 1000;
  $('#btn-cam').textContent = camModes[camMode];
};

const camState = { az: Math.PI * 0.25, look: new THREE.Vector3(), dist: 30, height: 16, shake: 0, cover: 0, orbit: 0 };
/** The side melee is shot from once the pair is close enough to anchor to. */
const CAM_ANCHOR = Math.PI * 0.25;
const ARENA_CENTRE = new THREE.Vector3(0, 1.2, 0);
/** A stand-in for `camera`, so a framing can be tried before it is committed. */
const trialCam = new THREE.PerspectiveCamera(46, 1, 0.3, 400);

/**
 * How much of the half-frame the pair and the wall-bias between them may fill.
 *
 * The distance solve below asks for room for both, but the [13, 34] clamp is
 * allowed to refuse it and `camState.dist` eases toward its answer rather than
 * jumping to it — so the bias is bounded a second time, against the frame the
 * shot really has rather than the one it asked for. The remaining 38% pays for
 * that lag, for the shake, and for the fact that `halfFrameAt` measures across
 * the ground distance and ignores the camera's elevation, so it reads low.
 */
const AIM_HEADROOM = 0.62;
/** How far out a body may sit before the framing counts as having lost it. */
const FRAME_EDGE = 0.92;
/** What the framing solves for, leaving the edge slack for the hit shake. */
const FRAME_TARGET = 0.88;

/**
 * A trial eye, for the camera to ask "would I see them from over there?".
 *
 * The old test at this spot looped `cfg.arena.obstacles` and nothing else, so
 * the four walls — the tallest opaque things in the arena — were invisible to
 * it, and `hidden()` reported a clear shot with a wall across the picture 12.1%
 * of the time. It also flattened the world to 2D, which cannot be extended to
 * the walls: the eye orbits outside them. `hiddenCount` is the 3D answer over
 * every solid; this wraps it for the two candidate azimuths.
 */
const trialEye = { x: 0, y: 0, z: 0 };
function eyeHides(az, dist, height, look, f, id) {
  trialEye.x = look.x + Math.sin(az) * dist;
  trialEye.y = height;
  trialEye.z = look.z + Math.cos(az) * dist;
  return hiddenCount(trialEye, f, bodies[id]?.height ?? 2, false);
}

/**
 * Framing rule: sit on the perpendicular bisector of the pair, so both bodies
 * are in profile and the gap between them is the widest thing on screen — that
 * gap IS the fight. The side is chosen to be the one the camera is already on,
 * because swapping sides mid-chase reverses the picture and reads as a cut.
 */
function updateCamera(a, b, dt) {
  const pair = [['octopus', a], ['gorilla', b]];
  const mid = new THREE.Vector3((a.x + b.x) / 2, 1.2, (a.z + b.z) / 2);
  const sep = Math.hypot(b.x - a.x, b.z - a.z);
  const snap = camState.snap;
  camState.snap = false;
  const ease = (rate) => (snap ? 1 : 1 - Math.exp(-rate * dt));

  /* Half the frame's width in metres at a subject `d` metres away, along the
     ground. The camera is elevated, so the true slant range is longer than `d`
     and this reads low — which is the direction an error here should point. */
  const hFov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
  const halfFrameAt = (d) => d * Math.tan(hFov / 2);

  /*
   * Bias the look-at inward as the fight approaches a wall.
   *
   * The framing rule is sized to the pair and knows nothing about the arena, so
   * a fight that ends in a corner is shot from outside the building: half the
   * frame is the dark apron and the two fighters are pushed to one edge. That
   * matters more than it sounds, because the frame it ruins is usually the last
   * one — the kill happens where somebody got cornered. Pulling the target up
   * to 45% of the way to the centre turns the camera back over the floor.
   *
   * What the pull cannot do is ignore the frame it is moving inside of. It
   * displaces the aim by up to 45% of the pair's distance from the centre —
   * around ten metres deep in a corner, more than the whole half-frame buys at
   * the near end of the distance clamp — and it used to be applied flat, with
   * nothing checking that the fighters came with it. Six matches, 8 705
   * fighter-frames: one of the two projected clean off the screen in 13.3% of
   * them, 44.4% in the worst pairing, peaking at |ndc| 3.12 — a body a full
   * screen width outside the picture, in the frame where somebody was being
   * cornered and killed. The cure for a corner cannot be losing the fighter who
   * got cornered, so the demand below buys its own room in the distance solve,
   * is bounded by what that distance actually granted, and is then tried
   * against the real projection before anything commits to it. Eight matches
   * after, six of them the same seeds: 0 off the screen out of 8 432, worst
   * |ndc| 0.882 — which is exactly `FRAME_TARGET`, so it is the trial binding.
   */
  const edge = Math.max(Math.abs(mid.x), Math.abs(mid.z)) / HALF;
  const wantPull = THREE.MathUtils.clamp((edge - 0.45) / 0.45, 0, 1) * 0.45;
  /** Metres the full pull would move the aim off the pair's true midpoint. */
  const bias = wantPull * Math.hypot(mid.x, mid.z);
  /** As much of that pull as a frame this wide can pay for. */
  const affordable = (halfFrame) => {
    const room = Math.max(0, halfFrame * AIM_HEADROOM - sep / 2);
    return bias > 1e-3 ? Math.min(1, room / bias) * wantPull : 0;
  };
  const aimAt = (pull) => mid.clone().lerp(ARENA_CENTRE, pull);

  if (camModes[camMode] === 'top') {
    const d = Math.max(20, sep * 1.1 + 12);
    // Straight down, so the frame's SHORT side is the one the bias has to fit
    // inside: a pull along world Z leaves the top of the picture, not the side.
    // No trial is needed here — nothing is tilted, so the arithmetic is exact.
    camState.look.lerp(aimAt(affordable(halfFrameAt(d) / camera.aspect)), 1 - Math.exp(-4 * dt));
    camera.position.set(camState.look.x, d, camState.look.z + 0.01);
    camera.lookAt(camState.look);
    return;
  }
  if (camModes[camMode] === 'wide') {
    camState.look.lerp(new THREE.Vector3(0, 1, 0), 1 - Math.exp(-3 * dt));
    camera.position.set(0, 30, 42);
    camera.lookAt(camState.look);
    return;
  }

  let want = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
  // pick the representative of {want, want+PI} nearer the current azimuth
  let d = ((want - camState.az + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(d) > Math.PI / 2) want += Math.PI;

  /*
   * Anchor the perpendicular as they close.
   *
   * The bisector rule is rigidly tied to the pair's axis, and a kite IS the
   * octopus circling the gorilla — so the axis sweeps a full turn and the shot
   * sweeps with it. Damping lags that, it does not stop it, and the result is a
   * camera that never settles during the one part of the fight worth watching.
   * Below about twelve metres the framing blends toward a fixed arena azimuth,
   * so melee is shot from a stable side with the blocks where the eye left them.
   */
  const anchorPull = THREE.MathUtils.clamp((12 - sep) / 7, 0, 1) * 0.8;
  let toAnchor = ((CAM_ANCHOR - want + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(toAnchor) > Math.PI / 2) toAnchor -= Math.sign(toAnchor) * Math.PI;
  /*
   * The anchor is a LINE, not a direction — melee may be shot from either end
   * of it — and the fold above is what makes it one. But the fold is a step:
   * one frame either side of |toAnchor| = PI/2 the pull points opposite ways,
   * so `want` moves by PI * anchorPull in a single frame and the eye snaps.
   * Measured worst case 0.23 rad, about 13 degrees, inside one frame.
   *
   * Fading the pull out as it approaches the fold costs nothing where the
   * anchor does its work — dead ahead of either end, `fold` is 1 — and makes
   * the crossing continuous, because the term is already zero by the time its
   * sign changes.
   */
  const fold = THREE.MathUtils.clamp((Math.PI / 2 - Math.abs(toAnchor)) / 0.35, 0, 1);
  want += toAnchor * anchorPull * fold;

  /*
   * The one azimuth discontinuity left in this function, and why it is left.
   *
   * Measure per-frame azimuth motion by the JUMP IN ANGULAR VELOCITY — |dw| =
   * |(az_n - az_n-1)/dt - (az_n-1 - az_n-2)/dt|, rad/s — never by a raw
   * per-frame second difference. A second difference is a function of the frame
   * time: over the same 24 matches its worst value is 0.168 rad at 30 Hz,
   * 0.088 at 60 Hz and 0.044 at 120 Hz, so two runs of one seed at different
   * frame rates cannot be compared and a dropped frame reads as camera jerk.
   * |dw| converges instead — 5.05, 5.30, 5.26 rad/s over those same three — so
   * it is a fact about this code and not about the machine it ran on.
   *
   * By that metric the representative pick 30 lines up is the largest event
   * here. Choosing whichever of {want, want + PI} is nearer moves the TARGET by
   * PI on the frame the nearer one changes, and `d * ease(1.6)` reverses at
   * full speed: 15 changes across 24 matches, and 13 of the 14 frames anywhere
   * in those matches with |dw| above 3 rad/s are one of them.
   *
   * It is left alone deliberately. The change happens when the eye is PI/2 from
   * both ends of the bisector — looking straight down the pair's axis, where
   * the two are one behind the other and either direction is equally right. A
   * continuous error term over the line (sin(2d)/2) removes the reversal and
   * halves the slew rate everywhere else to do it, and it cannot be applied
   * here anyway: the anchor blend above moves `want` up to 1.26 rad off the
   * bisector, so `d` is not bounded by PI/2 by the time it reaches this line —
   * measured at -2.79 and +2.05 rad, where a folded term drives the eye the
   * wrong way. Trading a once-in-four-matches reversal for a slower servo in
   * every frame is the wrong trade. This wants a different framing rule, not a
   * smoothing term bolted onto this one.
   */
  d = ((want - camState.az + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  camState.az += d * ease(1.6);

  /*
   * Close, and derived rather than guessed.
   *
   * A 2 m body in a 40 m arena is a realistic scale and an unreadable shot:
   * from far enough to hold the whole floor, a fighter is twenty pixels and its
   * wind-up is invisible. So the shot is sized to the PAIR — solve the horizontal
   * field of view for the distance at which the two of them plus a margin
   * exactly fill the frame. The camera is then as tight as it can be without
   * ever losing one of them, which is the only framing rule a 1v1 needs.
   */
  const margin = 5.5;
  // `bias` is in the solve because the wall pull moves the aim off the pair and
  // the frame has to hold the pair PLUS that offset, not just the pair.
  const need = (sep / 2 + bias + margin) / Math.tan(hFov / 2);
  /*
   * Close in on the kill.
   *
   * The wide framing that holds a chase is the wrong shot for a corpse: it left
   * the winner 120 px tall at the bottom of the picture with the loser behind a
   * wall while the banner said who won. The pair are by definition together at
   * that point, so `need` is already at its floor; this takes another quarter
   * off it and lets the ease carry the eye in over about a second. The framing
   * servo below still has the last word, so the push-in can ask for more than
   * the frame can hold and simply gets as much as it can.
   *
   * `decided`, not `over`: the socket's `over` message is 2.6 s of curtain late
   * and the push-in used to miss the shot it exists for entirely. Over 24 kills
   * the eye was at 19.65 m when the fighter died and still 18.43 m when the
   * message landed — mean 19.26 m across the whole death and topple. Off the
   * frame flag it is 15.11 m across the same window and 14.50 m at the 1.3 s
   * mark. It does not reach the 9.5 m floor in most of them and should not:
   * `need * 0.75` is still sized to the pair, and the servo below still has the
   * last word.
   */
  const targetDist = THREE.MathUtils.clamp(decided ? need * 0.75 : need, decided ? 9.5 : 13, 34);
  /*
   * Pull back fast, close in slow.
   *
   * A blink moves the octopus 7.5 m in one tick, so `sep` and `targetDist` step
   * discontinuously while `camState.dist` is still easing. At a symmetric 2.6
   * the eye is roughly half a second behind the jump, and half a second is long
   * enough to push the fighter who just teleported past `FRAME_EDGE` -- measured
   * on the long-match seeds, where the octopus reached |ndc| 0.992 and the
   * framing assertion fired. The teleport is also the single most watchable
   * thing the octopus does, so losing the frame exactly there is the worst
   * possible time to lose it.
   *
   * Widening is the safe direction: it can only ever show more of the arena, so
   * it can be near-immediate. Tightening is the direction that pumps -- it is
   * what made the shot breathe in and out around every passing block -- so it
   * keeps the old rate. The asymmetry leaves a mild bias toward the wider shot,
   * which is the bias a 1v1 wants.
   *
   * Measured, when this went in, on eight long-match seeds of l1 vs l3 alone:
   * 1 of 8 lost a fighter at |ndc| 0.992 -> 0 of 8, worst 0.792. That was one
   * pairing, and the comment that stood here read as though it were the system.
   * It was not: the same asymmetry over six pairings (l1/l3, l1/l4, l3/l1,
   * l1/l6, l2/l5, l4/l2, seeds 101 and 202) still put a body past FRAME_EDGE in
   * 1 match of 12 — rare per frame, 1 in 12 per MATCH, and a viewer counts
   * matches. The ease is right and it is not sufficient; what closes the gap is
   * the framing servo at the end of this function.
   */
  /*
   * Eased, then speed-limited.
   *
   * The asymmetry above is what keeps a 7.5 m blink in frame, and it works --
   * but at rate 9 the first frame after a teleport moved the eye 2.4 m on its
   * own, which reads as a lurch even though the framing is correct. Capping the
   * dolly at 26 m/s spends about a third of a second covering the same blink
   * instead of a single frame, and leaves the slow direction untouched: the cap
   * is far above anything the 2.6 ease ever asks for.
   */
  const stepDist = (targetDist - camState.dist) * ease(targetDist > camState.dist ? 9 : 2.6);
  /*
   * The cap does not apply to the snap, because the snap is not a dolly.
   *
   * `ease()` returns 1 on the first frame of a match, which plants the azimuth,
   * the height and the look-at — but the cap sat outside that and held the
   * DISTANCE to 26 m/s, so the eye crawled out from wherever the last fight
   * ended while the new one had already started 31 m apart. That is exactly the
   * "shot from wherever the last one ended" the snap exists to prevent, and it
   * was a real assertion failure, not a theoretical one: over 12 back-to-back
   * matches (l1/l3, l1/l4, l3/l1, l1/l6, l2/l5, l4/l2 at seeds 101 and 202) the
   * framing assertion fired at t=0.0 s in 8 of them, worst |ndc| 1.46 — a body
   * half a screen outside the picture on the opening frame. 0 of 12 after.
   * Only the first frame of a match is exempt; every dolly move still caps.
   */
  const capDist = snap ? Infinity : 26 * dt;
  camState.dist += THREE.MathUtils.clamp(stepDist, -capDist, capDist);
  /*
   * Rise, and step sideways, when something is in the way.
   *
   * Six 3.2 m boxes and four 4 m walls at this elevation occlude often, and
   * pulling the camera in and out every time one crosses the line pumps the
   * shot. Climbing over is invisible and usually enough; when it is not — a body
   * directly behind a long block — a small orbit is. Both candidates are tested
   * before committing so the camera never rotates toward a worse view, and the
   * nudge is blended rather than snapped.
   *
   * The count is now 0..6 (three heights on each of two bodies) instead of 0..2,
   * so climbing and stepping also answer the case that used to read the same as
   * clear: one fighter half behind something. What the eye can NOT clear is a
   * wall — 18.1% of fully-hidden frames over 25 498 are one wall covering all
   * three heights, and no azimuth inside a closed room escapes a 40 m slab —
   * nor a body pressed against a 3.2 m block a metre away. Both of those are
   * what the fade and the silhouette are for; this loop only buys the cases an
   * orbit or a climb can actually win.
   */
  const hiddenAt = (az, h) => eyeHides(az, camState.dist, h, camState.look, a, 'octopus')
    + eyeHides(az, camState.dist, h, camState.look, b, 'gorilla');
  const here = hiddenAt(camState.az, camState.height);
  const blocked = here > 0;
  let wantOrbit = 0;
  if (blocked) {
    const left = hiddenAt(camState.az - 0.7, camState.height);
    const right = hiddenAt(camState.az + 0.7, camState.height);
    /*
     * A whole sample point better, not merely different.
     *
     * `hiddenAt` counts hidden samples out of six, so `left < here` fires on a
     * one-sample flicker that the next frame undoes — and with the walls now in
     * the occlusion set, `blocked` is true far more often and a 40 m wall is
     * never actually escapable, so the tie case is the common case. Measured on
     * one match it was stepping the azimuth 13 degrees inside a single frame.
     * Demanding a full point of improvement leaves the orbit for the cases an
     * orbit can win and stops it hunting around the ones it cannot.
     */
    if (left <= here - 1 || right <= here - 1) wantOrbit = left <= right ? -0.7 : 0.7;
  }
  /*
   * The orbit RATE is eased too, and for the same reason the cover term is.
   *
   * `wantOrbit` used to be added to the azimuth directly, which made it a
   * 0.84 rad/s angular velocity switched on and off between one frame and the
   * next. Measured with a metric that survives a dropped frame — the per-frame
   * jump in angular velocity, |dw| in rad/s, which converges as dt shrinks
   * where a raw per-frame second difference does not — that switch is the most
   * common discontinuity in this camera: over 24 matches and 26 830 rendered
   * frames at a fixed 60 Hz it put |dw| past 0.2 rad/s on 1 507 of them, p99
   * 0.852 rad/s, which at a 20 m shot is 17 m/s of lateral eye speed appearing
   * inside one frame.
   *
   * Fast on, slow off, like the occluder fade above and for the same reason:
   * being late to escape is the only way the escape can fail, and the release
   * edge buys nothing by being instant. At 25/4 the jerk frames fall to 529 and
   * p99 to 0.285 rad/s. It is not free — the eye reaches its escape angle a
   * little later, and fully-hidden fighter-frames go 9.9% -> 10.2% over the
   * same 24 matches (hidden at all, 18.6% -> 18.9%) — but every one of those
   * frames has the silhouette up, because `updateOcclusion` raises the ghost on
   * exactly the same three-of-three test. Rate 1.1, which is what `cover` uses,
   * buys only 0.1 rad/s more and costs 13.2% fully hidden; 40/8 costs 10.0% and
   * leaves p99 at 0.398. 25/4 is the knee of that curve.
   */
  camState.orbit += (wantOrbit - camState.orbit) * ease(Math.abs(wantOrbit) > Math.abs(camState.orbit) ? 25 : 4);
  camState.az += camState.orbit * (1 - Math.exp(-1.2 * dt));
  /*
   * Cover is eased, not switched.
   *
   * This used to read `blocked ? 0.62 : 0.42` off a boolean recomputed every
   * frame. At a 20 m shot that is a four-metre step in the target height, and
   * `blocked` flickers whenever a body grazes the edge of a block: measured
   * over 775 frames the eye swung between 8.61 m and 20.49 m and reversed
   * direction 35 times in 22 seconds, which is the "camera shakes" a viewer
   * reports. Dropping the term entirely cut the mean height jerk 0.01707 ->
   * 0.00387, so this is three quarters of it. Easing a continuous `cover`
   * instead keeps the climb — a blocked shot still rises — and spends about a
   * second doing it rather than one frame.
   */
  camState.cover += ((blocked ? 1 : 0) - camState.cover) * ease(1.1);
  const wantHeight = 2.8 + camState.dist * (0.42 + 0.20 * camState.cover);
  camState.height += (wantHeight - camState.height) * ease(1.4);

  /*
   * The bias, tried before it is committed to.
   *
   * `affordable` is honest arithmetic about the frame's WIDTH and blind to its
   * height, and in this shot those are different problems: the eye is tilted
   * down, so a bias that happens to land along the view axis moves a body up or
   * down the picture by an amount that depends on how much nearer it is than
   * the aim point. Modelling that is a page of trigonometry; projecting the
   * candidate is four lines. So the eased look-at is built, both bodies are
   * projected through a stand-in camera placed exactly where this one is about
   * to go, and the pull is halved until they fit — or abandoned. Five trials at
   * most, almost always none, and the frame that needs one is the frame the
   * whole bias exists for. Caught a corner at (-18.7, -14.4) that the width
   * arithmetic passed and the picture dropped off the bottom edge.
   */
  const eased = ease(7);
  const holds = (look) => {
    trialCam.fov = camera.fov; trialCam.aspect = camera.aspect;
    trialCam.updateProjectionMatrix();
    trialCam.position.set(
      look.x + Math.sin(camState.az) * camState.dist,
      camState.height,
      look.z + Math.cos(camState.az) * camState.dist,
    );
    trialCam.lookAt(look.x, look.y + 0.4, look.z);
    trialCam.updateMatrixWorld();
    for (const [id, f] of pair) {
      // A dead fighter is dropped while the fight is live — the corpse is not
      // what the shot is about — and kept once it is decided, because then it
      // is exactly what the shot is about. Gated on the frame's own flag, not
      // on the socket's `over` message: that message is 2.6 s of curtain late,
      // which is the whole death animation and topple.
      if (!f.alive && !decided) continue;
      _p.set(f.x, f.y + (bodies[id]?.height ?? 2) * 0.5, f.z).project(trialCam);
      if (Math.abs(_p.x) > FRAME_TARGET || Math.abs(_p.y) > FRAME_TARGET) return false;
    }
    return true;
  };
  let pull = affordable(halfFrameAt(camState.dist));
  let look = camState.look.clone().lerp(aimAt(pull), eased);
  for (let i = 0; i < 5 && pull > 0.002 && !holds(look); i++) {
    pull = i === 4 ? 0 : pull * 0.5;
    look = camState.look.clone().lerp(aimAt(pull), eased);
  }
  camState.look.copy(look);

  /*
   * Give up the bias and the frame still does not hold? Then back off.
   *
   * The loop above can only surrender the wall bias; when the trial fails at
   * pull 0 the shot commits anyway, and that is the one path by which this
   * camera loses a fighter. It is rare — over 12 matches and 16 573 live
   * fighter-frames across l1/l3, l1/l4, l3/l1, l1/l6, l2/l5 and l4/l2, one frame
   * crossed FRAME_EDGE (|ndc| 0.941) and none left the picture — but a viewer
   * counts matches, not frames, and that was 1 match in 12. The comment this
   * replaces claimed the case was measured away on eight seeds of ONE pairing,
   * which is how it came back.
   *
   * Steps of 8% until it holds, at most four (+36% in one frame), rather than a
   * closed-form solve: the fault is always that an ease is lagging something —
   * a 7.5 m blink, a corner pull, the near body dropping down a tilted frame —
   * and stepping the projection is the same four lines the bias trial above
   * already uses. One step per frame was tried first and let a blink through at
   * |ndc| 0.96 on seed 808 (l1 vs l3, t=21.6 s): the body outran it for a frame.
   * Four steps cannot pump the shot, because the loop stops the moment the frame
   * holds and these frames are rare — 1 in 13 matches reached the edge at all.
   * 44 m is past the 34 m clamp on purpose: that clamp is a taste limit, this is
   * the limit past which a fighter is off screen.
   *
   * After, over 20 matches and 20 815 live fighter-frames on those six pairings
   * plus the two seeds that had failed: 0 frames past FRAME_EDGE, worst |ndc|
   * 0.859, no framing assertion. The shot did not get wider to buy it — mean
   * distance 18.2 m and the servo never once reached even the 34 m clamp, let
   * alone this cap.
   */
  for (let i = 0; i < 4 && camState.dist < 44 && !holds(camState.look); i++) {
    camState.dist = Math.min(44, camState.dist * 1.08);
  }

  camState.shake = Math.max(0, camState.shake - dt * 2.4);
  const k = camState.shake * camState.shake;
  const t = performance.now() / 1000;
  camera.position.set(
    camState.look.x + Math.sin(camState.az) * camState.dist + Math.sin(t * 47) * k,
    camState.height + Math.sin(t * 61 + 1.7) * k * 0.8,
    camState.look.z + Math.cos(camState.az) * camState.dist + Math.sin(t * 53 + 3.1) * k,
  );
  camera.lookAt(camState.look.x, camState.look.y + 0.4, camState.look.z);
}

/**
 * The one way this camera fails without looking like it failed.
 *
 * Every other framing mistake announces itself the moment you glance at the
 * screen. Losing a fighter off the edge does not: the shot stays composed, the
 * HUD keeps moving, and what reads as broken is the FIGHT — a body that
 * vanishes and teleports back in from nowhere. So both of them are projected
 * every frame and the first frame that drops one says so. `FRAME_EDGE` rather
 * than 1.0 because a body is two metres wide and its shoulder leaves the frame
 * well before its centre does.
 *
 * Once per match, not per frame: the failure is a run of hundreds of
 * consecutive frames, and `fail` appends to a box that never scrolls.
 */
let framingLost = false;
function checkFraming(view, t) {
  if (framingLost || performance.now() / 1000 - camCutAt < 0.6) return;
  // `project` reads `camera.matrixWorldInverse`, which the renderer only
  // refreshes at draw — without this the assertion grades the previous frame's
  // camera against this frame's positions and reports phantoms during a snap.
  camera.updateMatrixWorld();
  for (const id of ['octopus', 'gorilla']) {
    const v = view[id];
    // The same rule the framing solves against: the loser counts once the fight
    // is decided, so "the banner is on empty floor" is also an assertion
    // failure. On the FRAME's flag rather than the socket message, which closes
    // a 2.6 s blind spot — the death animation and the topple, 154 frames a
    // match. Nothing was actually being lost in there: over 24 kills the corpse
    // reached |ndc| 0.629 unwatched, and 0.714 now that the push-in closes on
    // it, against FRAME_EDGE 0.92 and 0.874 for a live fighter over the same
    // matches. This is about the window being watched at all.
    if (!v || (!v.alive && !decided)) continue;
    _p.set(v.x, v.y + (bodies[id]?.height ?? 2) * 0.5, v.z).project(camera);
    if (Math.abs(_p.x) <= FRAME_EDGE && Math.abs(_p.y) <= FRAME_EDGE) continue;
    framingLost = true;
    fail(`camera lost ${id} at t=${t.toFixed(1)}s — ndc (${_p.x.toFixed(2)}, ${_p.y.toFixed(2)}), `
      + `body at (${v.x.toFixed(1)}, ${v.z.toFixed(1)}), eye ${camState.dist.toFixed(1)} m out`);
    return;
  }
}

// ---------------------------------------------------------------------------
// the sim -> pose bridge
// ---------------------------------------------------------------------------

/**
 * What the body plays for what the simulation is doing.
 *
 * The phase is remapped per skill so that the visual wind-up occupies the same
 * wall time as the mechanical one. That is the difference between a telegraph a
 * watcher can act on and a decoration: when the gorilla's arms are over its
 * head, the cone has not landed yet, and when they come down it has.
 */
function poseAction(f, id, now) {
  if (!f.alive) return { action: 'die', phase: Math.min(1, f.phase) };
  if (f.act === 'laser') return { action: 'fire', phase: f.phase };
  if (f.act === 'smash') return { action: 'attack', phase: f.phase };
  if (f.act === 'blink') return { action: 'signal', phase: Math.min(1, f.phase * 1.6) };
  if (f.act === 'jump') {
    const sk = cfg.skills.jump;
    const total = sk.windup + sk.airborne + sk.recover;
    const air = (sk.windup + sk.airborne) / total;
    return f.phase < air
      ? { action: 'jump', phase: f.phase / air }
      : { action: 'land', phase: (f.phase - air) / (1 - air) };
  }
  if (f.act === 'charge') {
    const sk = cfg.skills.charge;
    const total = sk.windup + sk.dashSeconds + sk.recover;
    const w = sk.windup / total;
    if (f.actPhase === 'windup') return { action: 'block', phase: Math.min(1, f.phase / w) };
    if (f.actPhase === 'recover') return { action: 'land', phase: 0.5 };
    return { action: null, phase: 0 }; // the dash is locomotion, and fast
  }
  if (now < anim[id].hitUntil) {
    return { action: 'hit', phase: 1 - (anim[id].hitUntil - now) / 0.34 };
  }
  return { action: null, phase: 0 };
}

const shortAngle = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

function interpolate(t) {
  if (frames.length === 0) return null;
  if (frames.length === 1) return { a: frames[0], b: frames[0], u: 0 };
  let i = frames.length - 1;
  while (i > 0 && frames[i].t > t) i--;
  const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
  const span = b.t - a.t;
  const u = span > 1e-6 ? THREE.MathUtils.clamp((t - a.t) / span, 0, 1) : 0;
  return { a, b, u };
}

const lerp = (a, b, u) => a + (b - a) * u;

// ---------------------------------------------------------------------------
// the loop
// ---------------------------------------------------------------------------

boot.remove();
let last = performance.now() / 1000;

/**
 * The loop, with its first throw made visible.
 *
 * `setAnimationLoop` swallows an exception into the console and keeps calling,
 * so a single bad frame becomes a page that renders a static arena, accepts
 * clicks, reports no error and does nothing — which is indistinguishable from
 * a dead socket and cost an hour once already.
 */
let loopFailed = false;
if (params.get('shots')) {
  const oct = params.get('oct'), gor = params.get('gor');
  if (oct) $('#sel-oct').value = oct;
  if (gor) $('#sel-gor').value = gor;
  const n = Number(params.get('n') || 20);
  const every = Number(params.get('every') || 1.1) * 1000;
  const prefix = params.get('prefix') || 'match';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /*
   * Strictly sequential. `shoot` holds one slot that the render loop drains,
   * so two overlapping calls lose one of them and leave a promise that never
   * settles — which an interval-driven capture produces on its first slow
   * frame. Awaiting each shot before asking for the next removes the race
   * rather than racing more carefully.
   */
  (async () => {
    const done = [];
    startMatch();
    await sleep(500);
    for (let i = 0; i < n; i++) {
      let guard = 0;
      while (!frames.length && guard++ < 50) await sleep(150);
      if (!frames.length) break;
      const t = frames[frames.length - 1].t;
      done.push(await shoot(`${prefix}-${String(i).padStart(2, '0')}-t${t.toFixed(1).replace('.', '_')}`));
      if (over) break;
      await sleep(every);
    }
    // Left in the DOM, which a devtools console in an isolated world can read.
    const tag = document.createElement('div');
    tag.id = 'shots-done';
    tag.textContent = JSON.stringify(done);
    tag.style.display = 'none';
    document.body.appendChild(tag);
    document.title = `Airena — ${done.length} shots`;
  })();
}

renderer.setAnimationLoop(() => {
  try { frame(); } catch (e) {
    if (!loopFailed) { loopFailed = true; fail(`render loop: ${e.stack || e.message}`); }
  }
});

function frame() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - last);
  last = now;

  if (frames.length) {
    const newest = frames[frames.length - 1].t;
    renderClock += dt;
    // Snap back if the socket ran ahead or behind; a drifting render clock is
    // how an interpolated view slowly turns into a slideshow.
    if (renderClock > newest - DELAY * 0.5) renderClock = newest - DELAY * 0.5;
    if (renderClock < newest - DELAY * 4) renderClock = newest - DELAY;
  }
  playFxUpTo(renderClock);

  const fr = interpolate(renderClock);
  if (fr) {
    // Taken from the bracket frame the bodies are posed from, so "the fight is
    // decided" and "this body is a corpse" can never disagree by a frame.
    decided = !!fr.a.over;
    const view = {};
    for (const id of ['octopus', 'gorilla']) {
      const a = fr.a[id], b = fr.b[id];
      const x = lerp(a.x, b.x, fr.u), z = lerp(a.z, b.z, fr.u), y = lerp(a.y, b.y, fr.u);
      const h = shortAngle(a.h, b.h, fr.u);
      const speedMs = Math.hypot(lerp(a.vx, b.vx, fr.u), lerp(a.vz, b.vz, fr.u));
      view[id] = { ...a, x, y, z, h, speedMs, hp: lerp(a.hp, b.hp, fr.u) };
    }

    for (const id of ['octopus', 'gorilla']) {
      const body = bodies[id];
      const v = view[id];
      const st = anim[id];
      if (!body) continue;

      if (st.lastHp !== null && v.hp < st.lastHp - 0.01 && v.alive) st.hitUntil = now + 0.34;
      st.lastHp = v.hp;

      const moved = st.lastX === null ? 0 : Math.hypot(v.x - st.lastX, v.z - st.lastZ);
      // sign of travel against facing, so backing away backpedals
      let sign = 1;
      if (moved > 1e-5) {
        const fx = Math.sin(v.h), fz = Math.cos(v.h);
        sign = ((v.x - st.lastX) * fx + (v.z - st.lastZ) * fz) >= 0 ? 1 : -1;
      }
      st.lastX = v.x; st.lastZ = v.z;
      st.stride += (sign * moved) / (body.length * STRIDE_PER_LENGTH);

      const targetTurn = THREE.MathUtils.clamp(
        ((shortAngle(fr.a[id].h, fr.b[id].h, 1) - fr.a[id].h) / Math.max(1e-4, fr.b.t - fr.a.t)) / cfg.fighters[id].turnRate,
        -1, 1,
      );
      st.turn += (targetTurn - st.turn) * (1 - Math.exp(-8 * dt));

      const pa = poseAction(v, id, now);
      const speedBl = THREE.MathUtils.clamp(v.speedMs / GAIT_LENGTH[id], 0, 6);

      /*
       * The fall, ramped over the 1.5 s the sim gives a death.
       *
       * `fallOrientation` measured where the body has to end up; this is when it
       * gets there. The turn starts a quarter of the way into the death so the
       * pose's own collapse reads first and the topple finishes it, and both are
       * done together — a corpse that is still rotating after the banner is up
       * looks like a physics glitch rather than a body coming to rest.
       */
      const fell = v.alive ? 0 : THREE.MathUtils.smoothstep(pa.phase, 0.25, 1);
      const fall = body.fall;
      body.root.position.set(v.x, v.y, v.z);
      body.root.rotation.set(fall.rx * fell, v.h, fall.rz * fell, 'YXZ');
      body.root.userData.pose({
        t: now,
        dt,
        speed: speedBl,
        stride: st.stride,
        turn: st.turn,
        grounded: v.y < 0.02,
        health: THREE.MathUtils.clamp(v.hp / v.maxHp, 0, 1),
        action: pa.action,
        phase: pa.phase,
      });
      /*
       * Measure the pose that was actually struck, then stand it on the floor.
       *
       * Upward only while alive — a hop legitimately leaves the ground and
       * pulling it back down would cancel the jump — but exact for a corpse,
       * because a body lying on its back can end up ABOVE the floor as easily as
       * below it and a corpse hovering 0.12 m over its own shadow is the same
       * bug in the other direction.
       *
       * The price is one extra world-matrix pass, 0.31 ms a frame for both
       * bodies, plus 0.088 ms for the scan itself: 2.4% of a 60 Hz budget to
       * take frames-below-the-floor from 35.7% to 0.0% and leave nothing for a
       * smoothing filter to lag behind. The eased lift this replaces was itself
       * a lag: at rate 14 it was still a quarter of the way behind a pose that
       * changed on the frame a skill started.
       */
      body.root.updateMatrixWorld(true);
      const low = spanY(body).min;
      body.root.position.y = v.y + (v.alive ? Math.max(0, -low) : -low);
      body.root.visible = true;

      // HUD
      const frac = THREE.MathUtils.clamp(v.hp / v.maxHp, 0, 1);
      bars[id].fill.style.width = `${frac * 100}%`;
      bars[id].label.textContent = `${Math.ceil(v.hp)} / ${v.maxHp}`;
      /*
       * A corpse has no cooldowns.
       *
       * This loop had no `alive` guard, so a dead fighter's chips went on
       * ticking and re-lighting: a gorilla at 0/205 read back
       * ['smash|cd ready', 'charge 1.0|cd cool', 'jump|cd ready'] — a glowing
       * ready smash on a body the banner had already declared dead, with a
       * charge timer counting down in real time. Freeze the chips, grey the
       * column, and say what the column is now a record OF.
       */
      bars[id].wrap.classList.toggle('dead', !v.alive);
      for (const [sk, el] of Object.entries(cdEls[id])) {
        if (!v.alive) { el.className = 'cd cool'; el.textContent = skillRu(sk); continue; }
        const cd = v.cd ? v.cd[sk] : 0;
        el.className = `cd ${cd > 0.001 ? 'cool' : 'ready'}`;
        el.textContent = cd > 0.001 ? `${skillRu(sk)} ${cd.toFixed(1)}` : skillRu(sk);
      }
      updateTelegraph(id, v);
      updatePlate(id, v, body.height || 2);
      setSay(id, v.say);
      if (sayEls[id]) {
        const p = project(v.x, (body.height || 2) + 1.1, v.z);
        sayEls[id].style.left = `${p.x}px`;
        sayEls[id].style.top = `${p.y}px`;
      }
    }

    updateCamera(view.octopus, view.gorilla, dt);
    // after the camera, because both answers are about THIS frame's eye
    updateOcclusion(view, dt);
    checkFraming(view, fr.a.t);
    $('#clock .t').textContent = fr.a.t.toFixed(1);

    /*
     * Sudden death has to be VISIBLE. It is the one rule that changes what a
     * good decision is — from "outlast them" to "finish this" — and a rule that
     * changes the game silently is indistinguishable from the fighters both
     * losing health for no reason.
     */
    const burn = Math.max(0, cfg.suddenDeathRamp * (fr.a.t - cfg.suddenDeathAt));
    const heat = THREE.MathUtils.clamp(burn / 0.16, 0, 1);
    floorMat.color.setRGB(0.914 - heat * 0.42, 0.902 - heat * 0.63, 0.871 - heat * 0.66);
    scene.fog.color.setRGB(0.051 + heat * 0.20, 0.059, 0.078);
    scene.background.setRGB(0.051 + heat * 0.20, 0.059, 0.078);
    const clockEl = $('#clock .s');
    if (burn > 0) {
      clockEl.textContent = `ВНЕЗАПНАЯ СМЕРТЬ · арена жжёт обоих, −${(burn * 100).toFixed(1)}% в секунду`;
      clockEl.style.color = '#ff6a52';
      clockEl.classList.add('burning');
    } else if (matchInfo) {
      /* Слово seed игроку не показывается — сид это НОМЕР боя, и «бой №483634»
         читается любым посетителем, а `seed` только тем, кто уже свой. */
      const left = Math.max(0, cfg.suddenDeathAt - fr.a.t);
      clockEl.textContent = left < 10
        ? `бой №${matchInfo.seed} · арена загорится через ${left.toFixed(0)} с`
        : `бой №${matchInfo.seed}`;
      clockEl.style.color = '';
      clockEl.classList.remove('burning');
    }
    // A handle for a human (or a reviewer's console) to inspect the live view.
    // `decided` as well as `over`: the 2.6 s between them is the curtain, and a
    // recorder that splits a match on `over` alone cannot see into it.
    window.airena = { THREE, TSL, view, frames, bodies, camera, camState, scene, cfg, over, decided, matchInfo, renderClock, shoot, startMatch, tele, ghosts, solids: SOLIDS, backend: window.__airenaBackend };
  }

  updateFx(now);
  renderer.render(scene, camera);

  if (pendingShot) {
    const { name, resolve } = pendingShot;
    pendingShot = null;
    const png = renderer.domElement.toDataURL('image/png');
    fetch('/api/shot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, png }),
    }).then((r) => r.json()).then((j) => resolve(j.file)).catch((e) => resolve(String(e)));
  }
}

/* Всё объявлено — можно подключаться. См. комментарий выше. */
connect();
