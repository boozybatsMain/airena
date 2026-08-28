/**
 * What a viewer actually sees.
 *
 * ── why this exists ──────────────────────────────────────────────────────────
 *
 * The style audit could already prove a cable harness had been *built*: forty
 * runs, nine times the body's own length, hoses twelve to thirty-nine pixels
 * thick at a normal render size. And the body still read as having no cable on
 * it, because every run was threaded under the armour.
 *
 * Counting what exists is therefore not enough — the rule the style actually
 * cares about is "the middle layer SHOWS", and showing is an occlusion
 * question. So this casts parallel grids of rays from eight directions and
 * records what each one hits first, which is as close to "what a person sees"
 * as arithmetic gets.
 *
 * ── calibrated against a human read, not invented ────────────────────────────
 *
 * Measured on four live bodies and checked against what the operator said about
 * each one without seeing these numbers:
 *
 *   panther-noimg  12.7 %  "the harness reads"
 *   panther-2      11.3 %  "cables run along the body now"
 *   gorilla-1       3.0 %  "there are tubes, even pretty ones, but there could be more"
 *   trex-v19        1.1 %  "no cable at all"
 *
 * The boundary between "reads" and "barely there" sits between 3 % and 11 %, so
 * the audit complains under 6 % — comfortably below the good bodies and above
 * the one the operator still credited with having some.
 */

/** Eight directions: the six `forgeshot.mjs` angles plus two obliques. */
const DIRECTIONS = [
  [38, 14], [0, 4], [90, 4], [180, 8], [270, 4], [0, 78], [60, -8], [135, 20],
];

/**
 * Четыре луча с высоты БОЕВОЙ камеры.
 *
 * Камера арены стоит в (0, 26, 34) и смотрит в (0, 1, 0) — это подъём **36°**
 * (`src/viewer/main.js:52-54`). Среди восьми направлений выше такого нет:
 * подъёмы идут 4, 4, 4, 8, 14, 20, затем сразу 78. Между 20 и 78 провал, и
 * ровно в нём находится единственная точка, с которой игрок вообще видит
 * существо.
 *
 * Последствие измерено ревьюером на двух телах сразу: у обоих верх пустой —
 * голый белый многоугольник без единого болта у одного, пустой диск у другого,
 * — потому что «сверху» в этой метрике весит одну восьмую и приходит с почти
 * отвесных 78°, где виден только силуэт. Одно тело при этом вложило 22 тысячи
 * треугольников в болты на щупальцах, которые в бою не видны.
 *
 * Азимуты берутся по кругу: бойцы разворачиваются друг к другу, и «перёд»
 * тела в бою не гарантирован ничем.
 */
const CAMERA_ELEVATION = 36;
const CAMERA_DIRECTIONS = [
  [0, CAMERA_ELEVATION], [90, CAMERA_ELEVATION],
  [180, CAMERA_ELEVATION], [270, CAMERA_ELEVATION],
];

/** Направления замера: с AUDIT_V2 — включая высоту боевой камеры. */
const SAMPLED = process.env.AUDIT_V2 === '1'
  ? [...DIRECTIONS, ...CAMERA_DIRECTIONS]
  : DIRECTIONS;

/** Rays per side of the grid, per direction. 26² × 8 ≈ 5 400 rays — tens of ms. */
const GRID = 26;

/**
 * @param THREE the three.js namespace the body was built against
 * @param object the built creature
 * @param bodyExtent its longest dimension, so "greeble" means the same thing here
 *   as it does in `audit.ts`
 * @returns first-hit counts by category, or null when nothing was hit at all
 */
export function sampleVisibility(THREE, object, bodyExtent) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return null;
  const centre = new THREE.Vector3();
  box.getCenter(centre);

  // Classify once. `greeble` uses the same fortieth-of-the-body rule the audit
  // does, so the two numbers are talking about the same parts.
  const kind = new Map();
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.geometry.type === 'TubeGeometry') {
      kind.set(o, 'tube');
      return;
    }
    const bb = new THREE.Box3().setFromObject(o);
    if (bb.isEmpty()) {
      kind.set(o, 'body');
      return;
    }
    const v = new THREE.Vector3();
    bb.getSize(v);
    kind.set(o, Math.max(v.x, v.y, v.z) < bodyExtent / 40 ? 'greeble' : 'body');
  });

  const ray = new THREE.Raycaster();
  let tube = 0;
  let greeble = 0;
  /* Отдельный счёт по лучам с высоты боевой камеры. */
  const cameraHits = { samples: 0, greeble: 0, tube: 0 };
  const isCameraDir = (elDeg) => process.env.AUDIT_V2 === '1' && elDeg === CAMERA_ELEVATION;
  let bodyHits = 0;

  for (const [azDeg, elDeg] of SAMPLED) {
    const az = (azDeg * Math.PI) / 180;
    const el = (elDeg * Math.PI) / 180;
    const dir = new THREE.Vector3(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      Math.cos(az) * Math.cos(el),
    ).normalize();
    // Any up-vector that is not parallel to the view, so the grid has a basis.
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();
    const realUp = new THREE.Vector3().crossVectors(right, dir).normalize();
    const back = dir.clone().multiplyScalar(bodyExtent * 1.5);
    const into = dir.clone().negate();

    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const u = (i / (GRID - 1) - 0.5) * bodyExtent;
        const v = (j / (GRID - 1) - 0.5) * bodyExtent;
        const origin = centre.clone().add(back)
          .add(right.clone().multiplyScalar(u))
          .add(realUp.clone().multiplyScalar(v));
        ray.set(origin, into);
        const hit = ray.intersectObject(object, true)[0];
        if (!hit) continue;
        const which = kind.get(hit.object) ?? 'body';
        if (which === 'tube') tube++;
        else if (which === 'greeble') greeble++;
        if (isCameraDir(elDeg)) {
          cameraHits.samples++;
          if (which === 'greeble') cameraHits.greeble++;
          else if (which === 'tube') cameraHits.tube++;
        }
        else bodyHits++;
      }
    }
  }

  const samples = tube + greeble + bodyHits;
  /*
   * `camera` — то же самое, но только с лучей боевой высоты.
   *
   * Общая сумма по всем направлениям не отличает «деталь есть где-то» от
   * «деталь есть там, куда игрок смотрит». Оба тела первого замера набрали
   * приличную плотность деталей и при этом имели голую макушку — единственную
   * поверхность, которая в бою под камерой всегда.
   */
  return samples === 0 ? null : { samples, tube, greeble, camera: cameraHits };
}
