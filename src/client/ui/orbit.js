/**
 * The waiting animation: three orbits, five dots, one ring that sweeps.
 *
 * Reference: uikit.png "LOADING" — soft concentric rings around a lit core,
 * under the words SEARCHING FOR OPPONENT.
 *
 * WHY GEOMETRY AND NOT A SPINNER. §1.5 forbids fake progress: a bar that
 * fills at a rate nobody measured is a lie told once a second. This says
 * something true instead — *something is being looked for* — and says it with
 * the same vocabulary as the rest of the product: thin lines, one accentless
 * ink, no motion that demands to be watched.
 *
 * `search` is the calm version, between fights. `birth` is denser and faster:
 * a creature is being written, and the screen may hold that for minutes.
 * `collapse()` gathers everything into a point — the beat that ends the wait
 * on the birth screen, before the portrait fades in.
 */

const TAU = Math.PI * 2;
const ease = (p) => 1 - (1 - p) ** 3;

/**
 * THE CORE IS THE ONLY SATURATED THING, AND IT IS WHY THE FIGURE READS.
 *
 * The first cut drew everything in one ink at one alpha: three near-black
 * hairlines and five 2.8 px dots on a veiled photograph. Reviewed at 1440 px it
 * was called a physics debug gizmo — accurate, because a diagram of ellipses
 * with no subject is a diagram. The reference (uikit.png, LOADING) is not that:
 * it is soft concentric rings *around a lit body*, and the body is what the eye
 * lands on. So the geometry stays ink and quiet, and the middle gets a small
 * `--info` sphere inside a soft halo — the one place on the waiting screen
 * where colour is spent.
 */
const HALO = 24;                        /* px of glow around the core */

/** `#RRGGBB` → `rgba(…)`, so one colour can be drawn at several strengths. */
function rgba(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Small deterministic generator: the same seed draws the same orbits. */
function rng(seed) {
  let s = (Math.abs(Math.round(seed)) || 1) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function orbit(canvas, { mode = 'search', seed = 1, color = '#2E2E33', core = '#6EA8FF' } = {}) {
  const g = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!g) return { stop() {}, collapse() {} };

  const dense = mode === 'birth';
  /*
   * THE SETTING IS READ EVERY FRAME, NOT ONCE.
   *
   * This used to be a boolean taken at construction. The birth screen holds
   * for three to six minutes and LIVE's searching state for as long as the
   * arena is busy, so a player who turned "reduce motion" on while one of them
   * was open kept the moving orbit until they reloaded the page — which is the
   * one thing an accessibility setting must never require. The query object is
   * held instead, `calm.matches` is asked inside `draw()`, and the change
   * event is subscribed so the answer takes effect on the next frame.
   * `ui/portrait.js` does the same, and said in a comment that this file did.
   */
  const calm = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };
  const rand = rng(seed);

  /* Three ellipses: radius, flattening, tilt, angular speed. Different tilts
     are what makes them read as orbits rather than as a target. */
  const RINGS = [
    { r: 1.00, flat: 0.30, tilt: -0.38, spin: 0.17 },
    { r: 0.76, flat: 0.62, tilt: 0.62, spin: -0.24 },
    { r: 0.52, flat: 0.26, tilt: 1.28, spin: 0.33 },
  ];
  const DOTS = [0, 0, 1, 1, 2].map((ring, i) => ({
    ring,
    phase: rand() * TAU,
    speed: RINGS[ring].spin * (0.85 + rand() * 0.5) * (dense ? 1.9 : 1),
    size: i === 4 ? 2.6 : 3.2,
  }));

  const SWEEP = dense ? 1.7 : 2.9;      // seconds per pass of the scanning ring
  const CORE = dense ? 6 : 5.2;         // radius of the lit body in the middle

  /*
   * THE INK IS ONE STEP STRONGER WHERE THE FIGURE IS THE SUBJECT.
   *
   * `birth` is the only place this animation is the dominant thing on its
   * screen (§1.6): it stands alone in the middle of a veiled ground under a
   * 60 px state word, and at the search mode's weight the ellipses read as a
   * ghost of a diagram rather than as the thing the player is watching. On
   * LIVE the same figure stands on the bright arena floor and
   * `ui/screens/live.css` already thickens it optically from the outside —
   * raising the alpha here as well would double a correction that has already
   * been made once. So the lift is scoped to the mode that needs it, and
   * `search` and `boot` are untouched to the pixel.
   */
  const INK = dense ? { back: 0.22, front: 0.44 } : { back: 0.18, front: 0.34 };
  const SWEEP_INK = dense ? 0.48 : 0.34;

  /*
   * SIZE IS PINNED ONCE, ON PURPOSE.
   *
   * A canvas with no CSS size takes its layout size from its width/height
   * attributes — the very numbers a device-pixel-ratio backing store has to
   * multiply. Writing the backing size back into an unpinned canvas grows it
   * by the ratio on every measurement, forever. So: measure once, pin the CSS
   * size to what was measured, and let the attributes carry the ratio alone.
   */
  const first = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(first.width || canvas.width || 160));
  const cssH = Math.max(1, Math.round(first.height || canvas.height || 160));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  let dpr = 0;
  /** True when the backing store had to be rebuilt — the frame must be redrawn. */
  function fit() {
    const d = Math.min(devicePixelRatio || 1, 2);
    if (d === dpr) return false;
    dpr = d;
    canvas.width = Math.round(cssW * d);
    canvas.height = Math.round(cssH * d);
    return true;
  }

  const COLLAPSE = 700;                 /* ms the gather takes */
  let raf = 0;
  let collapsedAt = 0;
  let stopped = false;
  let drawn = false;
  /*
   * TIME THE FIGURE HAS ACTUALLY MOVED FOR.
   *
   * Not the wall clock: every rotation, sweep, breath and pulse is derived
   * from this, and it only advances while motion is allowed. Turning the
   * setting on therefore FREEZES the orbit where it stands instead of snapping
   * it to a canonical pose, and turning it off resumes from the same place —
   * a jump would be its own piece of motion, which is the opposite of what was
   * asked for.
   */
  let t = 0;
  let last = performance.now();

  function draw(now) {
    raf = requestAnimationFrame(draw);
    const still = calm.matches;
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    if (!still) t += dt;
    const grew = fit();
    /*
     * NOTHING CAN MOVE, SO NOTHING IS PAINTED.
     *
     * Under reduced motion every term above is pinned, and the collapse — the
     * one thing still driven by the wall clock — is either not running or long
     * finished. The canvas would then be cleared and rebuilt, ellipse by
     * ellipse, sixty times a second, for the whole three-to-six minutes of a
     * birth: a continuous compositor load on exactly the machines that asked
     * for less of it. The loop keeps turning, cheaply, so a change of setting
     * or of display still lands on the next frame.
     */
    const gathering = collapsedAt && now - collapsedAt <= COLLAPSE;
    if (still && drawn && !grew && !gathering) return;
    drawn = true;
    const cx = cssW / 2;
    const cy = cssH / 2;
    const R = Math.min(cssW, cssH) * 0.42;

    /* 1 while orbiting, 0 once gathered into the point */
    const k = collapsedAt ? Math.max(0, 1 - ease(Math.min(1, (now - collapsedAt) / COLLAPSE))) : 1;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineCap = 'round';

    /*
     * The ellipses, in two halves.
     *
     * One even hairline reads as a flat target — the reference (uikit.png,
     * LOADING) reads as a sphere with rings around it because the far side of
     * every ring is dimmer than the near side. That is the whole difference,
     * and it costs one extra stroke: the back arc at half the weight, the
     * front arc over it.
     */
    g.lineWidth = 1.25;
    for (const ring of RINGS) {
      const rx = R * ring.r * k;
      if (rx < 0.6) continue;
      const rot = ring.tilt + t * ring.spin * 0.12;
      g.globalAlpha = INK.back * k;
      g.beginPath();
      g.ellipse(cx, cy, rx, rx * ring.flat, rot, Math.PI, TAU);
      g.stroke();
      g.globalAlpha = INK.front * k;
      g.beginPath();
      g.ellipse(cx, cy, rx, rx * ring.flat, rot, 0, Math.PI);
      g.stroke();
    }

    /* The scanning ring: one pass in `search`, two overlapping in `birth`. It
       breathes over about four seconds — a search that pulses is looking, one
       that repeats at a fixed weight is a loop. */
    if (k > 0.02) {
      g.lineWidth = 1.4;
      const breath = still ? 1 : 0.72 + 0.28 * Math.sin(t * TAU / 4.2);
      const passes = dense ? [0, 0.5] : [0];
      for (const off of passes) {
        const p = (((t / SWEEP) + off) % 1 + 1) % 1;
        const rr = R * 1.14 * p * k;
        g.globalAlpha = (1 - p) ** 1.7 * SWEEP_INK * k * breath;
        g.beginPath();
        g.ellipse(cx, cy, rr, rr * 0.72, 0, 0, TAU);
        g.stroke();
      }
    }

    /* the five dots — near ones solid, far ones small and faint, same reason */
    for (const d of DOTS) {
      const ring = RINGS[d.ring];
      const a = d.phase + t * d.speed * TAU * 0.5;
      const rx = R * ring.r * k;
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * rx * ring.flat;
      const c = Math.cos(ring.tilt);
      const s = Math.sin(ring.tilt);
      const near = 0.5 + 0.5 * Math.sin(a);          /* 1 in front, 0 behind */
      g.globalAlpha = (0.34 + 0.5 * near) * (0.55 + 0.45 * k);
      g.beginPath();
      g.arc(cx + px * c - py * s, cy + px * s + py * c, d.size * (0.82 + 0.3 * near), 0, TAU);
      g.fill();
    }

    /* The core: a lit body that swells as everything arrives at it, inside a
       halo that falls off to nothing — the LOADING motif of the kit, and the
       only saturated pixel on the screen. */
    const pulse = still ? 0 : Math.sin(t * (dense ? 3.2 : 1.9)) * 0.10;
    const cr = CORE * (1 + pulse) * (1 + (1 - k) * 0.55);
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, cr + HALO);
    glow.addColorStop(0, rgba(core, 0.42));
    glow.addColorStop(0.3, rgba(core, 0.15));
    glow.addColorStop(1, rgba(core, 0));
    g.globalAlpha = 1;
    g.fillStyle = glow;
    g.beginPath();
    g.arc(cx, cy, cr + HALO, 0, TAU);
    g.fill();
    g.fillStyle = core;
    g.globalAlpha = 0.94;
    g.beginPath();
    g.arc(cx, cy, cr, 0, TAU);
    g.fill();
    /* the shell the reference draws just off the body's edge */
    g.globalAlpha = 0.26;
    g.strokeStyle = core;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, cr + 6 + (1 - k) * 10, 0, TAU);
    g.stroke();
    g.globalAlpha = 1;
  }

  fit();
  raf = requestAnimationFrame(draw);

  /* The loop keeps turning either way, so the listener has one job: make the
     very next frame paint, whichever direction the setting moved. */
  const wake = () => { drawn = false; };
  calm.addEventListener?.('change', wake);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      calm.removeEventListener?.('change', wake);
    },
    collapse() {
      if (!collapsedAt) collapsedAt = performance.now();
    },
  };
}
