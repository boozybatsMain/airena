/**
 * The style audit — the checklist, enforced instead of requested.
 *
 * ── why this exists ──────────────────────────────────────────────────────────
 *
 * Twelve runs of "brutal big t-rex" were spent discovering that a rule written
 * in prose is a *hope*. "The painted shells are at most a third of the visible
 * surface" was in the directive, and in a numbered checklist at the end of the
 * directive, for nine consecutive bodies that came back two thirds orange. The
 * same is true of the cable count, of the flat/curved mix, and of the rule that
 * no body section is one primitive. Adding a twenty-sixth paragraph to a
 * five-thousand-token instruction does not fix that; it displaces some other
 * rule, which is the failure mode the whole series demonstrated.
 *
 * So this file measures the body that actually came back and states, in the
 * model's own terms, which rules it broke. `forgeCreature`'s `verify` hook
 * already runs the code and hands failures back as a repair turn — until now
 * only for exceptions. A style violation is a failure of the same kind: the
 * reply did not do what it was told, and the model is perfectly capable of
 * fixing it when told which number is wrong.
 *
 * ── what it will and will not judge ──────────────────────────────────────────
 *
 * Only things that are **countable off the geometry**. Proportion, silhouette,
 * elegance, whether the jaw reads as a jaw — none of that is here, because a
 * number that pretends to measure taste is worse than no number. What is here is
 * the set of rules that were violated *numerically* and repeatedly, where the
 * violation is not a matter of opinion: how much of the surface is accent
 * colour, how many separate tube runs exist, whether one primitive is most of
 * the body.
 *
 * The audit never edits anything. It returns sentences.
 */

/**
 * Включает исправления аудита, найденные ревьюерами: ложный акцент на почти
 * чёрном и решётка, спрятанная за переменной. За флагом, чтобы идущий замер
 * протокола не сбился на середине — обе половины A/B обязаны судиться одним
 * и тем же аудитом.
 */
const AUDIT_V2 = process.env.AUDIT_V2 === '1';

/** One mesh, reduced to the facts the audit can use. Structural — no three.js here. */
export interface AuditMesh {
  /** `geometry.type`, e.g. `ExtrudeGeometry`, `BoxGeometry`, `SphereGeometry`. */
  readonly geometry: string;
  /** Triangles, used as the stand-in for visible surface. */
  readonly triangles: number;
  /** Linear sRGB-ish `[r, g, b]` in 0..1, off the material's colour. */
  readonly color: readonly [number, number, number];
  /** True when the material carries a non-black emissive. */
  readonly emissive: boolean;
  /**
   * `geometry.parameters.radius`, where the primitive has one.
   *
   * Read for the cable harness: a dozen hoses all cut to the same radius is a
   * comb, not plumbing. Real cable comes in thick corrugated runs and thin
   * wire, and the difference is visible from across the room.
   */
  readonly radius?: number;
  /**
   * The mesh's longest world-space dimension.
   *
   * Read for greeble density. "More detail" as prose has been asked for and
   * ignored repeatedly, and a raw mesh count does not distinguish a body of
   * four hundred large plates from one of forty plates and three hundred bolt
   * heads — which is exactly the difference between a shape and something
   * somebody built.
   */
  readonly extent?: number;
  /**
   * For a `TubeGeometry`, the length of the curve it was swept along.
   *
   * Counting tube *instances* turned out to be trivially satisfiable without
   * building a harness: a body passed a threshold of fifteen while carrying no
   * visible cable at all, because fifteen stubs are fifteen tubes. Length is
   * the thing that cannot be faked — to satisfy it you have to actually route
   * cable across the body.
   */
  readonly tubeLength?: number;
}

export interface AuditBody {
  readonly meshes: readonly AuditMesh[];
  /** World-space size of the whole body. */
  readonly size: { readonly x: number; readonly y: number; readonly z: number };
  /** Named parts, as the studio's picker would list them. */
  readonly namedParts: number;
  /**
   * What a viewer actually sees, sampled by `tools/visibility.mjs`.
   *
   * Counting what was *built* turned out not to be the rule the style cares
   * about. A live body carried forty cable runs totalling nine times its own
   * length, in hoses thick enough to see — and read as having no cable at all,
   * because every run was threaded under the armour. "The middle layer shows"
   * is an occlusion question, so it is answered by casting rays.
   *
   * Optional: a caller with no renderer omits it and those rules go quiet
   * rather than firing on missing data.
   */
  readonly visible?: {
    readonly samples: number;
    /** First hits landing on a `TubeGeometry`. */
    readonly tube: number;
    /** First hits landing on a part under a fortieth of the body. */
    readonly greeble: number;
  };
}

export interface AuditFinding {
  /** Stable id, so a caller can suppress one without pattern-matching prose. */
  readonly rule: string;
  /** What to tell the model. Written as an instruction it can act on. */
  readonly message: string;
}

/**
 * Geometry types that produce flat faces and hard chamfered edges, against
 * those that produce curvature. The style asks for roughly two thirds of the
 * first — `LatheGeometry` is deliberately counted as curved, because a turned
 * part is a body of revolution however many steps its profile has.
 */
const FLAT_GEOMETRY = new Set(['BoxGeometry', 'ExtrudeGeometry', 'PolyhedronGeometry', 'BufferGeometry', 'ShapeGeometry', 'PlaneGeometry']);
const CURVED_GEOMETRY = new Set(['SphereGeometry', 'CylinderGeometry', 'CapsuleGeometry', 'LatheGeometry', 'TorusGeometry', 'TubeGeometry', 'ConeGeometry', 'RingGeometry', 'TorusKnotGeometry']);

/**
 * Is this colour one of the style's painted accents rather than its greys?
 *
 * Saturation, not hue matching. The palette names four accents and three base
 * metals, and the metals are all under 0.2 saturation by construction while
 * every accent is well over 0.35 — so the split is robust to a model that
 * picked a neighbouring orange instead of the exact hex, which is a thing it
 * should be allowed to do.
 */
/**
 * Минимальная яркость, ниже которой цвет не может быть акцентом.
 *
 * `(max - min) / max` для тёмных цветов взрывается: у кабельного `#17150F`
 * (яркость 0.09, из домашней же палитры) абсолютная разница копеечная, а
 * относительная — 0.35, и он проходит порог насыщенности. Аудит объявлял самый
 * тёмный цвет палитры «насыщенным акцентом» и требовал его убрать — то есть
 * гнал тело в ремонт ровно за то, чего от него хотели. Замерено на
 * `ab-son-blind-3`: из 13 цветов ложно срабатывал один, и он же кабель, то есть
 * 8% поверхности.
 *
 * Порог 0.18 отделяет почти-чёрный от тёмного, но настоящего акцента: самый
 * тёмный честный акцент в палитре — `#5C3A0E`, яркость 0.36.
 */
const ACCENT_MIN_LUMA = 0.18;

function isAccent(color: readonly [number, number, number]): boolean {
  const max = Math.max(color[0], color[1], color[2]);
  const min = Math.min(color[0], color[1], color[2]);
  if (max <= 0.001) return false;
  if (AUDIT_V2 && max < ACCENT_MIN_LUMA) return false;
  const saturation = (max - min) / max;
  return saturation > 0.32;
}

/** Share of the body's triangles carrying an accent-coloured material. */
export function accentShare(body: AuditBody): number {
  let total = 0;
  let accent = 0;
  for (const mesh of body.meshes) {
    total += mesh.triangles;
    if (isAccent(mesh.color)) accent += mesh.triangles;
  }
  return total === 0 ? 0 : accent / total;
}

/** Share of the body's triangles on flat-faced geometry, of those the audit can classify. */
export function flatShare(body: AuditBody): number | null {
  let flat = 0;
  let curved = 0;
  for (const mesh of body.meshes) {
    if (FLAT_GEOMETRY.has(mesh.geometry)) flat += mesh.triangles;
    else if (CURVED_GEOMETRY.has(mesh.geometry)) curved += mesh.triangles;
  }
  const known = flat + curved;
  return known === 0 ? null : flat / known;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * What this body got wrong, in sentences a model can act on.
 *
 * Thresholds are deliberately slack against the directive's own numbers — the
 * directive says "at most a third" and this complains at half. The audit is a
 * backstop against gross violation, not a second art director: a body at 38 %
 * accent has understood the rule and made a judgement, and paying for another
 * call to argue with it would be the tail wagging the dog.
 */
export function auditBody(body: AuditBody): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const totalTriangles = body.meshes.reduce((sum, m) => sum + m.triangles, 0);
  if (totalTriangles === 0) return findings;

  const accent = accentShare(body);
  /*
   * 0.15, not 0.5.
   *
   * The old ceiling was written when the style allowed "at most a third" accent
   * and complained only at gross violation. The reference set turns out to carry
   * essentially NONE — three blind graders, on four different subjects, named the
   * saturated pads and chips as one of the three costliest things on the body
   * every single time, at shares far under a half. A backstop that never fires on
   * the failure everybody can see is not a backstop.
   */
  if (accent > 0.15) {
    findings.push({
      rule: 'accent-share',
      message:
        `${pct(accent)} of this body's surface is painted in a saturated accent colour. In this style the accent is a `
        + 'handful of plates or none at all: about half the body is chalky bone-white shell (#D8D2C6, #C9C2B4, #B5AC9C) '
        + 'and most of the rest is the DARK machine underneath it (#55524C, #6B665E, #3E3A34, #4A4238). Repaint the '
        + 'shells bone white, keep the frame and the mechanism dark, and leave the accent (#C2521E, #A8231C) on a few '
        + 'plates.',
    });
  }

  const flat = flatShare(body);
  if (flat !== null && flat < 0.25) {
    findings.push({
      rule: 'too-curved',
      message:
        `Only ${pct(flat)} of this body is flat machined faces; the rest is spheres, cylinders and capsules. `
        + 'Hard-surface metal is roughly two thirds flat faces meeting at chamfered edges. Rebuild the large masses as '
        + 'ExtrudeGeometry plates with bevelEnabled, and keep the round primitives for joints, housings and hoses.',
    });
  }
  if (flat !== null && flat > 0.92) {
    findings.push({
      rule: 'too-boxy',
      message:
        `${pct(flat)} of this body is flat-faced geometry with almost no curvature. Add the pressed-metal half: shells `
        + 'formed around the volumes as partial cylinders and partial spheres, lathed housings at the joints, and hoses '
        + 'as tubes along curves.',
    });
  }

  /*
   * The harness, counted and measured.
   *
   * The threshold was 8 and a body with no visible cable at all passed it, so
   * it was catching "none" rather than "not enough". 15 is what the directive
   * has always asked for, and it is roughly what the reference art carries.
   */
  const bodyExtent = Math.max(body.size.x, body.size.y, body.size.z);
  const tubes = body.meshes.filter((m) => m.geometry === 'TubeGeometry');
  /*
   * The harness, measured by LENGTH rather than by count.
   *
   * Counting instances alone was gameable, so this also measures cumulative
   * routed length against the body's own size — which cannot be satisfied by
   * fifteen stubs.
   *
   * **Five, not eight.** Eight was a guess and it was wrong in the direction
   * that matters: it flagged the two bodies the operator had picked out as
   * having the best harnesses. Measured across four live bodies —
   *
   *   gorilla-1      9.4 body-lengths, and the cable is invisible
   *   panther-noimg  6.9, harness reads
   *   panther-2      6.0, harness reads
   *   trex-v19       3.7, "no cable at all"
   *
   * — length turns out to be a poor predictor of whether a harness reads at
   * all: the longest of the four is the one you cannot see. So this stays a
   * loose backstop against a body that built essentially nothing, and
   * `cable-hidden` below carries the real judgement.
   */
  const routed = tubes.reduce((sum, t) => sum + (typeof t.tubeLength === 'number' ? t.tubeLength : 0), 0);
  const bodyLengths = bodyExtent > 0 ? routed / bodyExtent : 0;
  const measurable = tubes.filter((t) => typeof t.tubeLength === 'number').length;

  if (tubes.length < 15 || (measurable >= 4 && bodyLengths < 5)) {
    const how = tubes.length < 15
      ? `only ${tubes.length} tube run${tubes.length === 1 ? '' : 's'}`
      : `${tubes.length} tube runs, but they add up to only ${bodyLengths.toFixed(1)} body-lengths of cable`;
    findings.push({
      rule: 'cable-mass',
      message:
        `This body has ${how}. A harness is at least fifteen runs totalling five times the body's own length — thick `
        + 'corrugated hoses and thin wire together, each one long enough to travel: out of a port, down the neck or '
        + 'along the spine, over a shoulder, into a hip, behind a knee, and into another port. Short stubs do not '
        + 'count. Build it as its own pass over the finished body, as TubeGeometry along CatmullRomCurve3.',
    });
  } else {
    // Thickness variety, but only once there is a harness to judge.
    const radii = tubes.map((t) => t.radius).filter((r): r is number => typeof r === 'number' && r > 0);
    if (radii.length >= 8) {
      const thickest = Math.max(...radii);
      const thinnest = Math.min(...radii);
      if (thickest / thinnest < 2) {
        findings.push({
          rule: 'cable-uniform',
          message:
            `Every hose on this body is nearly the same thickness (${thinnest.toFixed(3)} to ${thickest.toFixed(3)}). `
            + 'That reads as a comb, not as plumbing. A real harness mixes thick corrugated trunk lines with thin '
            + 'signal wire — make the thickest run at least three times the radius of the thinnest, gather several '
            + 'thin ones into clamped bundles, and let a couple of heavy ones carry the eye along the body.',
        });
      }
    }
  }

  const emissive = body.meshes.filter((m) => m.emissive).length;
  if (emissive > 6) {
    findings.push({
      rule: 'too-lit',
      message:
        `${emissive} separate parts on this body glow. The style allows at most TWO small emissive spots in total — a `
        + 'status port, a heat slot — and the eyes are NOT among them: eyes are dark recessed glass in a machined '
        + 'bezel, low roughness, no emissive at all. Take the emissive off everything else.',
    });
  }

  const biggest = body.meshes.reduce((max, m) => Math.max(max, m.triangles), 0);
  if (biggest / totalTriangles > 0.3) {
    const dominant = body.meshes.find((m) => m.triangles === biggest);
    findings.push({
      rule: 'one-primitive-body',
      message:
        `A single ${dominant?.geometry ?? 'mesh'} is ${pct(biggest / totalTriangles)} of this body's whole surface. `
        + 'No body section may be one primitive — a torso or a leading end is four to eight intersecting volumes that '
        + 'change section along their length, with a readable shoulder line where planes meet.',
    });
  }

  /*
   * Built is not the same as SEEN, and this is where that is enforced.
   *
   * Calibrated against a human read rather than invented — see
   * `tools/visibility.mjs` for the four bodies and what the operator said about
   * each of them before seeing any of these numbers. "Reads as having a
   * harness" sits at 11–13 %; "there are tubes but there could be more" was
   * 3 %; "no cable at all" was 1 %.
   */
  if (body.visible !== undefined && body.visible.samples >= 200) {
    const seenTube = body.visible.tube / body.visible.samples;
    const seenGreeble = body.visible.greeble / body.visible.samples;

    if (routed > 0 && seenTube < 0.06) {
      findings.push({
        rule: 'cable-hidden',
        message:
          `The harness is there — ${tubes.length} runs — but only ${pct(seenTube)} of what a viewer sees is cable. It is `
          + 'threaded under the armour, where it does nothing. Route it OUTSIDE: over the shoulder rather than through '
          + 'it, along the outside of a limb, standing clear of the body between clamps, crossing the gap at every '
          + 'joint where it is most visible. And open the shells up so there is somewhere for it to show.',
      });
    }

    if (seenGreeble < 0.04) {
      findings.push({
        rule: 'greebles-hidden',
        message:
          `Only ${pct(seenGreeble)} of what a viewer sees is small hardware. Bolt heads, clamps and connectors have to `
          + 'sit ON the outer faces of the shells and along their edges where they are looked at — not tucked into the '
          + 'frame underneath, where they cost geometry and show nothing.',
      });
    }
  }

  /*
   * Greeble density, measured against the body's own size.
   *
   * A greeble is anything under a twentieth of the body's longest dimension —
   * bolt heads, clamps, connectors, blanking plates, hinge pins. The reference
   * art carries hundreds; bodies that satisfy every other rule and still read
   * cheap are the ones carrying a dozen. Relative rather than absolute so the
   * same rule holds for a body four units long and one forty units long.
   */
  const sized = body.meshes.filter((m) => typeof m.extent === 'number' && m.extent > 0);
  if (sized.length >= 20) {
    if (bodyExtent > 0) {
      /*
       * A twentieth of the body was too generous — on a three-unit body that is
       * fifteen centimetres, which catches structural parts rather than
       * hardware, and a body with no visible bolt anywhere passed at sixty. A
       * fortieth is a bolt head, and the reference art carries hundreds.
       */
      const greebles = sized.filter((m) => (m.extent as number) < bodyExtent / 40).length;
      if (greebles < 120) {
        findings.push({
          rule: 'too-few-greebles',
          message:
            `This body carries only ${greebles} genuinely small parts — anything under a fortieth of its length counts, `
            + 'which is the size of a bolt head or a clamp. A machine of this scale needs hundreds: a bolt head round every flange, a clamp everywhere a hose passes a frame '
            + 'member, connectors, blanking plates, junction boxes, hinge pins, cable ties, grab handles, vent grilles. '
            + 'They are what give it scale and make it look expensive. Add them as their own pass over the finished '
            + 'body, and do not spend the budget enlarging the parts that are already there.',
        });
      }
    }
  }

  /*
   * 12 was "did it name anything at all". The bodies that pass everything else
   * and still read as cheap are the ones with forty large parts and no
   * articulation — so this now asks for the detail the style has always
   * described: a limb of a dozen pieces, a head that is the busiest section.
   */
  if (body.namedParts > 0 && body.namedParts < 40) {
    findings.push({
      rule: 'too-few-parts',
      message:
        `Only ${body.namedParts} parts on this body carry a .name. A body at this scale should be built from many `
        + 'small named pieces — a limb is a dozen, the head is the busiest section of all. Every meaningful part needs '
        + 'its own named Object3D: the game severs organs and grows new ones by name, and an unnamed part cannot be '
        + 'shot off or replaced.',
    });
  }

  return findings;
}

/**
 * The one style violation that is visible in the *source* rather than in the
 * geometry: a repeating lattice painted over the whole body.
 *
 * `fract(position * frequency)` on two or three axes is the cheap way to draw
 * "panel lines", and it is what a model reaches for every time. What it actually
 * produces is graph paper — one grid at one frequency stretched across every
 * part, ignoring where anything ends. Observed on every body in the variance
 * run, in this exact shape:
 *
 *     const g1 = abs(fract(p.y.mul(3.1)).sub(0.5));
 *     const g2 = abs(fract(p.x.mul(2.7)).sub(0.5));
 *     const g3 = abs(fract(p.z.mul(2.9)).sub(0.5));
 *
 * Two axes is the threshold, deliberately. One `fract` is a legitimate way to
 * break up grime or scatter wear, and flagging it would punish the shader work
 * the style actually asks for. Two or three, each on a different axis of the
 * same position, is a grid and nothing else.
 */
export function auditSource(source: string): AuditFinding[] {
  const axes = new Set<string>();
  // `fract(p.y.mul(3.1))`, `fract(positionLocal.x.mul(4))`, `fract(pos.z.mul(n))`
  const lattice = /fract\s*\(\s*[A-Za-z_$][\w$]*\s*\.\s*([xyz])\s*\.\s*mul\b/g;
  /*
   * Вторая форма той же решётки: ось кладут в переменную, и совпадения нет.
   *   const ay = TSL.positionLocal.y;
   *   TSL.step(0.9, TSL.fract(ay.mul(26)))
   * Найдено ревьюером на `ab-son-sighted-3`: миллиметровка видна на всех семи
   * ракурсах, а проверка молчала — регулярка ждала литерал `p.y.mul`.
   * Ловим присваивание оси в переменную, затем `fract(<эта переменная>.mul`.
   */
  const alias = /\b([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$.]*\.\s*([xyz])\b/g;
  const aliased = new Map<string, string>();
  for (let m = alias.exec(source); m !== null; m = alias.exec(source)) aliased.set(m[1], m[2]);
  for (let m = lattice.exec(source); m !== null; m = lattice.exec(source)) axes.add(m[1]);
  if (AUDIT_V2) {
    for (const [name, axis] of aliased) {
      const viaAlias = new RegExp(`fract\\s*\\(\\s*${name}\\s*\\.\\s*mul\\b`);
      if (viaAlias.test(source)) axes.add(axis);
    }
  }

  const glowingStripe = AUDIT_V2 && axes.size === 1 && /emissiveNode/.test(source);
  if (axes.size < 2 && !glowingStripe) return [];
  return [
    {
      rule: 'panel-line-lattice',
      message:
        `This body draws a repeating lattice in its shader — fract() of the position on ${axes.size} axes `
        + `(${[...axes].sort().join(', ')}). That is graph paper: one grid at one frequency stretched over every part, `
        + 'regardless of where anything actually ends, and it is the clearest tell that a body was generated rather '
        + 'than built. Delete it. A panel line is where a plate stops, and you already built those edges — the bevel '
        + 'on an extruded plate, the rim of a formed shell, the gap between two overlapping pieces. Keep the shader '
        + 'for grime, worn paint and oxidation, which are gradients driven by normalLocal and positionLocal, not lines.',
    },
  ];
}

/**
 * The findings as one repair turn, or null when the body passed.
 *
 * Phrased as a compiler would phrase it — what is wrong and what to do — because
 * that is what the repair path in `call.ts` already sends and what models
 * respond to. It asks for the whole function back, since that is the only shape
 * the runtime can call.
 */
export function auditFailureMessage(findings: readonly AuditFinding[]): string | null {
  if (findings.length === 0) return null;
  return (
    'The body builds and runs, but it breaks the house style in ways that are measurable on the geometry:\n\n'
    + findings.map((f, i) => `${i + 1}. ${f.message}`).join('\n\n')
    + '\n\nKeep everything that is already right — the subject, the anatomy, the parts and their names — and fix only '
    + 'these. Send the whole build function again.'
  );
}
