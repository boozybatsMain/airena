/**
 * ONE CREATURE, ONE FACE.
 *
 * A creature has a body in the arena, and everywhere else it has a mark: the
 * ladder row, the podium card, the chip in the chrome, the VS card, the
 * specimen page while the real body loads. That mark is what a player learns
 * a creature BY — it is the picture they scan a table of sixty rows for — so
 * there may be exactly one of it, and it has to come from the id.
 *
 * WHY THIS FILE EXISTS. There were three of them. `screens/ladder.js` drew a
 * 64-grid animal with a snout and an eye highlight; `screens/creature.js` drew
 * a 110×96 ellipse with a circle head and two, four or six sticks;
 * `screens/birth.js` drew a 320×260 quadruped with a jaw and back plates —
 * three different animals from the same id, while ladder.js's own header
 * comment promised "the same silhouette the Creature screen draws". That is
 * exactly the drift three copies produce, and the FNV hash under them had been
 * written out four times as well.
 *
 * WHY IT IS NOT ONE ANIMAL. The old marks were one animal with its dials
 * turned: a quadruped a little longer or a little shorter, two legs or four.
 * Seven of them in a ladder read as seven copies of the same drawing, which is
 * the opposite of a mark. So the hash picks a FAMILY first — quadruped,
 * serpentine, many-legged, winged, biped, wheeled — and only then the
 * measurements inside it. Six silhouettes that differ in KIND are told apart
 * at a glance in a table; six that differ in degree are not.
 *
 * WHY IT IS NOT THE ABILITY ICON. `/api/creature/:id/icon/:slot` draws one
 * ABILITY, and the same picture is labelled EMBER BEAM two screens away. A
 * picture of a beam is not a picture of the creature that fires it.
 *
 * WHY IT IS NOT A RENDER. A hundred rows would be a hundred WebGL contexts and
 * the browser hands out about sixteen. This is a kilobyte of path.
 *
 * One geometry, drawn once in a 120×96 box and fitted to whatever box the
 * caller gives it, so the shape a player learns in the ladder is the shape
 * that greets them on the specimen page — pixel for pixel, at every size.
 */

import { svg } from '../lib/dom.js';

/** FNV-1a, 32-bit. The one copy. */
export function hashOf(str) {
  let x = 2166136261;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

/* xorshift32 off the hash: the shape needs a dozen independent numbers and a
   32-bit hash has only so many bits to slice. Same seed, same animal, for ever
   — which is the whole point of a mark. */
function rngOf(seed) {
  let s = (seed || 1) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* The canonical drawing space. Every family is composed inside it, so two
   creatures are the same size next to each other however different they are. */
const W = 120;
const H = 96;
const GROUND = 78;

const f = (n) => Number(n).toFixed(1);

/**
 * A tapered band along a centreline — a tail, a snake, a wing spar, a boom.
 *
 * A stroke cannot taper, and a taper is what makes a drawn limb look grown
 * rather than assembled. So the band is a filled outline: the centreline
 * offset by a half-width on each side and closed at the ends.
 */
function ribbon(pts, half) {
  const up = [];
  const dn = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const w = half[i];
    up.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
    dn.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
  }
  const line = (list) => list.map((p, i) => `${i ? 'L' : ''}${f(p[0])} ${f(p[1])}`).join(' ');
  return `M${line(up)} L${line(dn.reverse())} Z`;
}

/** A closed blob: an ellipse with its four quadrants pulled about. */
function blob(cx, cy, rx, ry, pull) {
  const k = 0.5523;
  const [a, b, c, d] = pull;
  return `M${f(cx - rx)} ${f(cy)}`
    + ` C${f(cx - rx)} ${f(cy - ry * k * a)} ${f(cx - rx * k * a)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)}`
    + ` C${f(cx + rx * k * b)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - ry * k * b)} ${f(cx + rx)} ${f(cy)}`
    + ` C${f(cx + rx)} ${f(cy + ry * k * c)} ${f(cx + rx * k * c)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)}`
    + ` C${f(cx - rx * k * d)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + ry * k * d)} ${f(cx - rx)} ${f(cy)} Z`;
}

/**
 * A limb, planted on the ground: a band that tapers from shoulder to ankle
 * along a shallow S, and a foot.
 *
 * Two shapes and not one. A single band bent hard at the ankle to make a foot
 * crossed its own outline, and the tip came out as a downward arrow — sixteen
 * creatures standing on eight arrows each. The foot is its own wedge, and both
 * are filled non-zero, so the overlap at the ankle is ink rather than a hole.
 */
function legOf(x, top, foot, w, kneeOut) {
  const pts = [];
  const wid = [];
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x + kneeOut * Math.sin(t * Math.PI), top + (foot - top) * t]);
    wid.push(w * (1 - 0.42 * t));
  }
  const ankle = pts[n][0];
  const toe = w * 2.1;
  return [
    ribbon(pts, wid),
    `M${f(ankle - w * 0.7)} ${f(foot - w * 1.1)} L${f(ankle + toe)} ${f(foot - w * 0.55)}`
    + ` L${f(ankle + toe)} ${f(foot)} L${f(ankle - w * 1.05)} ${f(foot)} Z`,
  ];
}

/* ── the six families ────────────────────────────────────────────────────── */
/*
 * Each returns an array of path strings, all filled with `currentColor`. They
 * share one contract: stand on GROUND, keep inside the 120×96 box, and be
 * recognisable as a KIND at 22 px — which is the size of the mark in a ladder
 * row, and the reason none of them carries a detail smaller than three units
 * unless `detail` says the drawing is big enough to hold one.
 */

function quadruped(r, detail) {
  const cx = 56;
  const cy = 40;
  const half = 22 + r() * 8;
  const hh = half * (0.40 + r() * 0.22);
  const out = [];

  out.push(blob(cx, cy, half, hh, [1.05, 0.9, 0.95, 1.0]));

  /* the head: a wedge with a jaw. A ball reads as a toy; a jaw reads as
     something that can bite, which is what these things do for a living. */
  const snout = cx + half + 10 + r() * 10;
  const brow = cy - hh * (0.55 + r() * 0.4);
  const chin = cy + hh * (0.25 + r() * 0.25);
  out.push(`M${f(cx + half * 0.62)} ${f(brow - 3)} L${f(snout)} ${f(cy - hh * 0.2)}`
    + ` L${f(snout - 3.5)} ${f(chin)} L${f(cx + half * 0.55)} ${f(chin + 3)} Z`);

  /* the tail: a taper off the hip, level or drooping */
  const drop = r() * 14 - 4;
  const tx = cx - half;
  out.push(ribbon(
    [[tx + 2, cy + hh * 0.2], [tx - 8, cy + drop * 0.3], [tx - 16, cy + drop * 0.7], [tx - 22, cy + drop]],
    [hh * 0.5, hh * 0.3, hh * 0.16, 1],
  ));

  /* four legs, front pair heavier */
  const w = 3.2 + r() * 1.6;
  for (let i = 0; i < 4; i++) {
    const x = cx - half * 0.62 + (i / 3) * half * 1.3;
    out.push(...legOf(x, cy + hh * 0.3, GROUND, w * (i > 1 ? 1.15 : 1), (i % 2 ? 2.2 : -2.2)));
  }

  /* a ridge of back plates, on the drawings big enough to hold one */
  if (detail > 0) {
    const plates = Math.floor(r() * 4);
    for (let i = 0; i < plates; i++) {
      const x = cx - half * 0.5 + i * half * 0.42;
      const top = cy - hh;
      out.push(`M${f(x - 4)} ${f(top + 1)} L${f(x)} ${f(top - 6)} L${f(x + 4)} ${f(top + 1)} Z`);
    }
  }
  return out;
}

function serpentine(r, detail) {
  /*
   * REARED, NOT LAID DOWN. Drawn as a horizontal band with a wave in it, this
   * came out as a leaf: a long flat shape floating over its own shadow, with
   * a prop under it so it would not look airborne. A serpent is read by its
   * POSTURE — coiled tail on the ground, body climbing, head carried high —
   * and posture costs the same number of points as a wave does.
   */
  const x0 = 20;
  const span = 58 + r() * 16;
  const rise = 30 + r() * 15;
  const thick = 6 + r() * 3.5;
  const wave = 4 + r() * 6;
  const phase = r() * Math.PI * 2;
  const n = 20;
  const pts = [];
  const wid = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const climb = t * t * (3 - 2 * t);            /* smoothstep: it uncoils */
    /* the wave may lift the body but never sink it: the floor is the floor */
    const y = GROUND - rise * climb + Math.sin(phase + t * 5.4) * wave * (1 - t * 0.55);
    pts.push([x0 + t * span, Math.min(y, GROUND - thick * 0.4)]);
    /* thin at the tail, heaviest through the middle, narrowing into the neck */
    wid.push(thick * (0.3 + 0.9 * Math.sin(t * Math.PI)));
  }
  const out = [ribbon(pts, wid)];

  const head = pts[n];
  const prev = pts[n - 2];
  let dx = head[0] - prev[0];
  let dy = head[1] - prev[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  /* A lozenge, not a barb. A triangle whose base is wider than the neck put
     two spikes on either side of it and the whole animal came out as a curved
     ARROW — a UI glyph, in a set of creatures. A head swells and then tapers,
     so it is drawn the way the body is. */
  const jaw = 12 + r() * 6;
  const hw = thick * 0.62;
  out.push(ribbon(
    [[head[0], head[1]],
      [head[0] + dx * jaw * 0.42, head[1] + dy * jaw * 0.42],
      [head[0] + dx * jaw * 0.8, head[1] + dy * jaw * 0.8],
      [head[0] + dx * jaw, head[1] + dy * jaw]],
    [hw * 0.95, hw * 1.3, hw * 0.95, hw * 0.28],
  ));

  if (detail > 0) {
    /* a coil of the tail lying on the ground, so it is resting on something */
    out.push(`M${f(x0 - 4)} ${f(GROUND - thick * 0.5)} L${f(x0 + 20)} ${f(GROUND - thick * 0.7)}`
      + ` L${f(x0 + 20)} ${f(GROUND)} L${f(x0 - 4)} ${f(GROUND)} Z`);
  }
  return out;
}

function manylegged(r, detail) {
  const cx = 58;
  const cy = 40;
  const half = 16 + r() * 8;
  const hh = half * (0.55 + r() * 0.35);
  const legs = r() < 0.5 ? 6 : 8;
  const out = [];

  /*
   * The legs go down FIRST so the body sits on top of them, and each one
   * ARCHES: shoulder, up over the back, then down to the ground. Drawn as
   * straight slabs from the body to the floor they read as a fan of blades
   * with something caught in it — the arch is the whole difference between a
   * many-legged animal and a bundle of knives.
   */
  const w = 1.7 + r() * 1.1;
  const reach = 13 + r() * 9;
  const pairs = legs / 2;
  for (let i = 0; i < legs; i++) {
    const side = i % 2 ? 1 : -1;
    const t = Math.floor(i / 2) / Math.max(1, pairs - 1);
    const x = cx - half * 0.7 + t * half * 1.4;
    const span = side * reach * (0.55 + t * 0.5);
    out.push(ribbon(
      [[x, cy], [x + span * 0.5, cy - hh * 0.8 - 4], [x + span, cy - hh * 0.2],
        [x + span * 1.22, cy + hh * 0.9], [x + span * 1.28, GROUND]],
      [w * 1.4, w, w * 0.92, w * 0.78, w * 0.62],
    ));
  }

  out.push(blob(cx, cy, half, hh, [1.0, 1.0, 1.0, 1.0]));
  const hr = hh * (0.4 + r() * 0.2);
  out.push(`M${f(cx + half * 0.7)} ${f(cy - hr * 0.9)} L${f(cx + half + hr * 1.5)} ${f(cy - hr * 0.2)}`
    + ` L${f(cx + half + hr * 1.15)} ${f(cy + hr)} L${f(cx + half * 0.65)} ${f(cy + hr * 0.9)} Z`);
  if (detail > 0) {
    /* two mandibles — what tells a many-legged thing from a beetle-shaped rock */
    const jx = cx + half + hr * 1.5;
    out.push(`M${f(jx - 1)} ${f(cy - hr * 0.5)} L${f(jx + 7)} ${f(cy - hr * 1.7)} L${f(jx + 1.5)} ${f(cy - hr * 0.1)} Z`);
    out.push(`M${f(jx - 1)} ${f(cy + hr * 0.3)} L${f(jx + 7)} ${f(cy + hr * 1.3)} L${f(jx + 1.5)} ${f(cy + hr * 0.7)} Z`);
  }
  return out;
}

function winged(r, detail) {
  const cx = 56;
  const cy = 42;
  const half = 18 + r() * 7;
  const hh = half * (0.42 + r() * 0.2);
  const out = [];

  /* the wing goes behind the body: a swept plane off the shoulder, which is
     the one shape nothing else in the set has */
  const span = 30 + r() * 16;
  const rise = 20 + r() * 11;
  out.push(`M${f(cx + 4)} ${f(cy - hh * 0.6)} Q${f(cx - span * 0.5)} ${f(cy - rise * 1.25)} ${f(cx - span)} ${f(cy - rise * 0.55)}`
    + ` Q${f(cx - span * 0.55)} ${f(cy - rise * 0.3)} ${f(cx - 2)} ${f(cy + hh * 0.15)} Z`);

  out.push(blob(cx, cy, half, hh, [1.0, 0.85, 1.0, 1.0]));

  const neck = 8 + r() * 8;
  const hx = cx + half + neck * 0.5;
  const hy = cy - neck;
  out.push(ribbon([[cx + half * 0.5, cy - hh * 0.4], [hx - 3, hy + 3]], [hh * 0.5, hh * 0.34]));
  out.push(`M${f(hx - 5)} ${f(hy - 5)} L${f(hx + 13 + r() * 5)} ${f(hy + 1)} L${f(hx - 4)} ${f(hy + 6)} Z`);

  const w = 3.2 + r() * 1.4;
  for (let i = 0; i < 2; i++) {
    out.push(...legOf(cx - half * 0.2 + i * half * 0.8, cy + hh * 0.4, GROUND, w, i ? 2.4 : -2.4));
  }
  /* a tail fan keeps it from reading as a bird on a stick */
  if (detail > 0) {
    out.push(`M${f(cx - half * 0.8)} ${f(cy - hh * 0.6)} L${f(cx - half - 17)} ${f(cy - 8)}`
      + ` L${f(cx - half - 15)} ${f(cy + 10)} L${f(cx - half * 0.8)} ${f(cy + hh * 0.6)} Z`);
  }
  return out;
}

function biped(r, detail) {
  /* The tall end of the aspect range: a torso standing up, which is what a
     player calls a golem. */
  const cx = 58;
  const hipY = 58;
  /* Height first, width from the aspect: the box is 96 tall and a torso, a
     neck and a head have to fit above the hip with the legs still under it.
     Sizing the width first put the head 33 units above the top of the box. */
  const halfH = 12 + r() * 6;
  const halfW = halfH / (1.15 + r() * 0.85);
  const cy = hipY - halfH;
  const out = [];

  /* legs first — a standing figure whose legs are drawn over its torso has
     a seam across its hips */
  const lw = 3.4 + r() * 1.8;
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    out.push(...legOf(cx + side * halfW * 0.52, hipY - 3, GROUND, lw, side * 1.6));
  }

  /* arms: hanging, or swung a little forward */
  const swing = r() * 7 - 1;
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    out.push(ribbon(
      [[cx + side * halfW * 0.35, cy - halfH * 0.74],
        [cx + side * (halfW + 4), cy - halfH * 0.05],
        [cx + side * (halfW + 3) + swing, cy + halfH * 0.72]],
      [4.4, 3.6, 2.8],
    ));
  }

  out.push(blob(cx, cy, halfW, halfH, [0.88, 0.88, 1.06, 1.06]));

  /* neck and head: big enough to be a head. A pea on a stalk is a snowman. */
  const hr = 6 + r() * 2.5;
  out.push(ribbon([[cx, cy - halfH + 2], [cx + 1, cy - halfH - 3]], [hr * 0.45, hr * 0.36]));
  out.push(blob(cx + 1.5, cy - halfH - 3 - hr * 0.85, hr * 1.1, hr * 0.85, [1, 1, 1, 1]));

  if (detail > 0) {
    /* a shoulder plate: the line that says armour rather than sack */
    out.push(`M${f(cx - halfW * 1.25)} ${f(cy - halfH * 0.66)} L${f(cx + halfW * 1.25)} ${f(cy - halfH * 0.66)}`
      + ` L${f(cx + halfW * 0.95)} ${f(cy - halfH * 0.28)} L${f(cx - halfW * 0.95)} ${f(cy - halfH * 0.28)} Z`);
  }
  return out;
}

function wheeled(r, detail) {
  const cx = 56;
  const cy = 38;
  const half = 20 + r() * 9;
  const hh = half * (0.30 + r() * 0.15);
  const out = [];

  const wheels = r() < 0.45 ? 1 : 2;
  const rad = 11 + r() * 5;
  const wy = GROUND - rad;
  const xs = wheels === 1 ? [cx] : [cx - half * 0.5, cx + half * 0.55];
  /* Two half-arcs, not one arc that ends where it began: an elliptical arc
     whose endpoints coincide is defined out of existence by the SVG spec, and
     0.01 of a unit apart is close enough for a renderer to round them
     together — which is why the wheels were not there. */
  const circle = (x, y, rd) => `M${f(x - rd)} ${f(y)} A${f(rd)} ${f(rd)} 0 1 0 ${f(x + rd)} ${f(y)}`
    + ` A${f(rd)} ${f(rd)} 0 1 0 ${f(x - rd)} ${f(y)} Z`;
  for (const x of xs) {
    const disc = circle(x, wy, rad);
    /* The hub is a HOLE, so it has to be a second subpath of the same path —
       `fill-rule: evenodd` knocks it out; a second element would only paint
       the same ink over the same ink. Below `stage` it is not drawn at all:
       at 22 px a 4 px hole is a grey smudge in the middle of a wheel. */
    const ir = rad * 0.36;
    const hub = detail > 0 ? ` ${circle(x, wy, ir)}` : '';
    out.push(hub ? { d: disc + hub, rule: 'evenodd' } : disc);
  }
  /* the strut down to the axle, then the chassis over it */
  out.push(ribbon([[cx, cy], [xs[0], wy]], [hh * 0.7, 4]));
  out.push(blob(cx, cy, half, hh, [1.1, 0.75, 1.0, 1.0]));

  /* a boom reaching forward — the arm a wheeled thing fights with */
  const reach = 16 + r() * 14;
  out.push(ribbon(
    [[cx + half * 0.4, cy - hh * 0.4], [cx + half + reach * 0.5, cy - hh - 6], [cx + half + reach, cy - hh - 4 - r() * 8]],
    [hh * 0.75, 4.4, 3],
  ));
  return out;
}

const FAMILIES = [quadruped, serpentine, manylegged, winged, biped, wheeled];

/* How much detail the drawing can carry, by the box it will be seen in.
   `mark` is 22–34 px in a ladder row: anything under three units is a smudge
   there, so the small parts are simply not drawn. */
const DETAIL = { mark: 0, stage: 1, reveal: 2 };

/**
 * The markup of one creature's silhouette. `size` is not a number — it is how
 * big the drawing will be SEEN, which is what decides how much of it to draw:
 * `mark` (a row, a chip, a VS portrait), `stage` (the specimen page's stand-in
 * body), `reveal` (the birth card, where it is the size of a hand).
 */
export function silhouetteMarkup(id, { size = 'mark' } = {}) {
  const detail = DETAIL[size] ?? 0;
  const r = rngOf(hashOf(id));
  const fam = FAMILIES[Math.floor(r() * FAMILIES.length) % FAMILIES.length];
  const lean = (r() * 5 - 2.5) * (detail > 0 ? 1 : 0.6);
  const paths = fam(r, detail);

  /* The shadow is what seats the thing on the ground instead of floating it in
     a white circle, and it is the only part drawn at less than full ink. */
  const shadow = `<ellipse cx="${f(W * 0.5)}" cy="${f(GROUND + 4)}" rx="${f(28 + detail * 4)}" ry="2.6"`
    + ` fill="currentColor" opacity=".16"/>`;

  return `<svg class="silhouette" viewBox="0 0 ${W} ${H}" width="100%" height="100%"`
    + ` preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">`
    + `${shadow}<g transform="rotate(${f(lean)} ${f(W * 0.5)} ${GROUND})" fill="currentColor"`
    + ` stroke="none">`
    + `${paths.map((p) => (typeof p === 'string'
      ? `<path d="${p}"/>`
      : `<path d="${p.d}" fill-rule="${p.rule}"/>`)).join('')}</g></svg>`;
}

/** The same drawing as an element, for callers that mount it directly. */
export function silhouetteSvg(id, opts) {
  return svg(silhouetteMarkup(id, opts));
}

/**
 * The ladder's old name for the small size, kept so a row can ask for what it
 * means rather than for a parameter.
 */
export function markShape(id) {
  return silhouetteMarkup(id, { size: 'mark' });
}
