/**
 * The portrait: one creature's body, lit and slowly turning, in a small scene.
 *
 * WHY A REAL SCENE AND NOT A PICTURE. The body is the one part of a creature
 * the player invented and the arena obeys — the same source that fights is
 * the source that poses here. A rendered still would drift from the fight the
 * first time a body is regenerated, and a creature whose portrait is not the
 * thing on the arena floor is a lie in the most visible place on the page.
 *
 * The recipe is `src/viewer/body.html`'s, minus the developer's furniture:
 * fetch the source, build it behind the three walls of `loadbody.js`, frame
 * it by its own bounding box (both fields of view — a nine-metre wingspan is
 * small vertically and huge horizontally), light it, turn it.
 *
 * WHAT IS DIFFERENT HERE: the background is transparent, because the portrait
 * sits on the page's own ground and a grey rectangle would cut a hole in it;
 * and the whole module is imported lazily, so a player who never opens the
 * Creature screen never pays for a second renderer.
 *
 * `silhouette()` and `wire()` exist for the birth reveal (§6.4): shadow first,
 * then wireframe, then the creature itself.
 */

const API = () => (typeof window !== 'undefined' && window.__api) || '';

/** Where a body's source lives: its own, or the stock one it borrowed. */
function sourceUrls({ creatureId, bodyRef }) {
  const out = [];
  const ref = String(bodyRef || '');
  if (creatureId && (!ref || ref.startsWith('gen:'))) out.push(`${API()}/api/body/${creatureId}`);
  if (ref && !ref.startsWith('gen:')) out.push(`/bodies/${ref.replace(/[^\w-]/g, '')}.js`);
  else if (creatureId) out.push(`${API()}/api/body/${creatureId}`);
  return [...new Set(out)];
}

async function fetchSource(opts) {
  let last = null;
  for (const url of sourceUrls(opts)) {
    try {
      const res = await fetch(url);
      if (!res.ok) { last = new Error(`${res.status}`); continue; }
      const text = await res.text();
      if (text && text.length > 32) return text;
    } catch (e) { last = e; }
  }
  throw last || new Error('no body');
}

/**
 * `size` is the creature's own scale: a big body is framed a little wider so
 * two portraits side by side still read as different sizes.
 *
 * `turn` asks for the slow rotation; a system-level request for reduced motion
 * overrules it, so callers may pass `true` unconditionally.
 *
 * `label` is the sentence a screen reader is given for the picture. It is a
 * parameter and not a constant because the caller is the only one who knows
 * WHICH creature this is: the canvas is the dominant element of the Creature
 * screen and the climax of the birth reveal, and it used to carry no `role`
 * and no name at all — a reader met an unlabelled canvas where the product
 * puts its subject. There is always a name, because a picture with a role and
 * no name is worse than one with neither.
 */
export async function portrait(container, { creatureId = null, bodyRef = null, size = 1, label = null } = {}, { turn = true } = {}) {
  const dead = { ok: false, error: null, canvas: null, destroy() {}, silhouette() {}, wire() {} };
  if (!container) return dead;

  let THREE; let TSL; let buildBody;
  try {
    const [three, tsl, loader] = await Promise.all([
      import('three'),
      import('three/tsl'),
      import('/viewer/loadbody.js'),
    ]);
    THREE = three; TSL = tsl; buildBody = loader.buildBody;
  } catch (e) {
    return { ...dead, error: e };
  }

  let source;
  try { source = await fetchSource({ creatureId, bodyRef }); }
  catch (e) { return { ...dead, error: e }; }

  /*
   * WebGPU when the browser has it, WebGL2 when it does not — the same two
   * paths the arena takes, for the same reason: a portrait that draws nothing
   * on a machine that can still draw the fight is a bug the player blames on
   * their creature.
   */
  let renderer;
  try {
    renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    await renderer.init();
  } catch (e) {
    try {
      renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true, forceWebGL: true });
      await renderer.init();
    } catch (e2) { return { ...dead, error: e2 }; }
  }

  const canvas = renderer.domElement;
  canvas.className = 'portrait-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', String(label || '').trim() || 'The creature');
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;

  const scene = new THREE.Scene();
  /*
   * A WARM RIG, NOT THE ARENA'S. The arena is a dark hall; this page is warm
   * off-white (§2.1). A body lit for the hall reads as a black cut-out here,
   * so: a bright sky-to-sand hemisphere, one warm key from the front left and
   * a cool rim from behind, which is what puts an edge on a dark carapace
   * standing on a light ground.
   */
  scene.add(new THREE.HemisphereLight(0xfff6ec, 0xb9a795, 2.6));
  const key = new THREE.DirectionalLight(0xfff1dd, 3.1);
  key.position.set(5, 8, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa8c8ff, 1.5);
  rim.position.set(-6, 4, -7);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  fill.position.set(-4, 2, 6);
  scene.add(fill);

  let root = null;
  try {
    root = buildBody(THREE, TSL, source, { trusted: false });
    scene.add(root);
  } catch (e) {
    renderer.dispose?.();
    return { ...dead, error: e };
  }

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  const box = new THREE.Box3().setFromObject(root);
  const span = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  /* Degenerate bodies exist; a zero span would put the camera inside them. */
  span.set(Math.max(span.x, 0.2), Math.max(span.y, 0.2), Math.max(span.z, 0.2));

  /*
   * Framed by BOTH fields of view: the axis that runs out first is the one
   * that decides (see the same note in src/viewer/body.html).
   *
   * HOW MUCH AIR. The padding factor is the whole answer to "how big is the
   * creature on the page", and 1.34 with a flat 0.4 m of slack was too much of
   * both: on the Creature screen the body covered about a seventh of its own
   * 56 % column, which a review read — correctly — as a page with an empty
   * lower half and a thumbnail in it. 1.18 puts the constraining axis at 85 %
   * of the frame, which is a portrait crop rather than a product shot, and
   * still leaves room for the turn to swing a tail or a wing through without
   * clipping. The slack drops with it: a flat 0.4 m is a third of the distance
   * to a small body and nothing to a large one, so it framed exactly the
   * creatures that needed it least.
   *
   * The size bonus stays: a nine-metre body is pulled back a little further so
   * two portraits side by side still read as different sizes.
   */
  function reach() {
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const byHeight = (span.y / 2) / Math.tan(vHalf);
    const byWidth = (Math.max(span.x, span.z) / 2) / Math.tan(hHalf);
    return Math.max(byHeight, byWidth) * (1.18 + Math.min(0.26, Math.max(0, size - 1) * 0.12)) + 0.22;
  }
  let dist = reach();

  container.appendChild(canvas);

  function resize() {
    const r = container.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const hgt = Math.max(1, Math.round(r.height));
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
    renderer.setSize(w, hgt, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${hgt}px`;
    dist = reach();
  }
  resize();

  let ro = null;
  try { ro = new ResizeObserver(resize); ro.observe(container); }
  catch { addEventListener('resize', resize); }

  let t = 0;
  let alive = true;
  /* Three quarters from the front: the pose that shows a silhouette and a
     face at once, and where a body that was only sculpted from one side is
     immediately obvious. */
  const START = 0.85;

  /*
   * REDUCED MOTION STOPS THE TURN.
   *
   * This is 60 vh of the Creature screen — the largest moving thing the
   * product draws outside the arena — and it turns for as long as the page is
   * open, with nothing to stop it. A player who told their system to ask for
   * less motion is asking about exactly this. Stopped, the portrait keeps
   * everything that makes it worth having: the real body, the warm rig, the
   * three-quarter pose. It only stops being a thing that never sits still.
   *
   * Watched, not read once: the query is answered live so a setting changed
   * while the page is open takes effect without a reload. `ui/orbit.js` reads
   * the same query for the same reason.
   */
  const calm = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let spin = turn && !(calm && calm.matches);
  const onCalm = () => { spin = turn && !calm.matches; };
  try { calm?.addEventListener('change', onCalm); } catch { /* older browsers: the first read stands */ }

  renderer.setAnimationLoop(() => {
    if (!alive) return;
    t += 1 / 60;
    const a = START + (spin ? t * 0.18 : 0);
    /* Just above the body's own centre: enough to read the back and the top of
       a carapace, not so much that a tall body's head leaves the frame now
       that the frame is tight. */
    camera.position.set(
      mid.x + Math.sin(a) * dist,
      mid.y + span.y * 0.16 + dist * 0.12,
      mid.z + Math.cos(a) * dist,
    );
    camera.lookAt(mid.x, mid.y, mid.z);
    if (typeof root.userData.pose === 'function') {
      try { root.userData.pose({ t, speed: 0, grounded: true, action: null, phase: 0 }); }
      catch { /* a body that cannot hold a pose still has a silhouette */ }
    }
    renderer.render(scene, camera);
  });

  /** Every material in the body, arrays included. */
  function materials(fn) {
    root.traverse((o) => {
      if (!o.material) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) fn(m);
    });
  }

  return {
    ok: true,
    error: null,
    canvas,

    /** The reveal's first beat: a shape with no surface yet. */
    silhouette(on) {
      canvas.style.filter = on ? 'brightness(0) contrast(2) opacity(.9)' : '';
    },

    wire(on) {
      materials((m) => {
        if ('wireframe' in m) { m.wireframe = !!on; m.needsUpdate = true; }
      });
    },

    destroy() {
      alive = false;
      try { renderer.setAnimationLoop(null); } catch { /* already gone */ }
      try { calm?.removeEventListener('change', onCalm); } catch { /* never listened */ }
      try { ro ? ro.disconnect() : removeEventListener('resize', resize); } catch { /* never observed */ }
      try {
        root.traverse((o) => {
          o.geometry?.dispose?.();
          if (!o.material) return;
          for (const m of (Array.isArray(o.material) ? o.material : [o.material])) m.dispose?.();
        });
      } catch { /* a half-built body disposes what it can */ }
      try { scene.clear(); } catch { /* nothing to clear */ }
      try { renderer.dispose(); } catch { /* backend already released */ }
      canvas.remove();
    },
  };
}
