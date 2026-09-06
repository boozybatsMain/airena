/**
 * Photograph the arena stand (`src/viewer/arena.html`).
 *
 *   node tools/arenashot.mjs                 every shot below
 *   node tools/arenashot.mjs --only=game,low a subset (ids below)
 *   node tools/arenashot.mjs --exposure=1.1
 *   node tools/arenashot.mjs --extra=shadow=pcf --tag=pcf   a diagnostic, filed apart
 *
 * It does not need the game's server: a tiny static server here hands the
 * page the viewer, three, the addons, the stock bodies and `/api/config`, so
 * the stand can be shot on a machine where nothing else is running. Headless
 * Chrome with WebGPU comes from `tools/vfxchrome.mjs`, ONE at a time, under
 * the same machine-wide lock `tools/shots.mjs` holds — launched with vsync
 * and the frame-rate limit OFF, so the per-frame cost the page measures is
 * a number and not the 60 Hz cap.
 *
 * Output: `reports/arena/stand-<id>.png` at 1440×900 (DPR 1 unless the shot
 * says 2) and `stand.json` with backend, ms/frame, the post graph, console
 * errors, device-level GPU errors and the calibration probes (sRGB + Lab L
 * under named world points) for every capture.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, extname, normalize, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { launchChrome, closeChrome, Cdp, openPage, sleep } from './vfxchrome.mjs';
import { labL } from '../src/viewer/environment.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'reports', 'arena');
const args = new Map(process.argv.slice(2).map((a) => {
  const s = a.replace(/^--/, '');
  const i = s.indexOf('=');
  return i < 0 ? [s, '1'] : [s.slice(0, i), s.slice(i + 1)];
}));
const ONLY = args.has('only') ? args.get('only').split(',') : null;
const EXPOSURE = args.get('exposure');
/* `--extra=ao=2&msaa=0` appends page switches to every shot; `--tag=x` names
   the files `stand-<id>-x.png` so a diagnostic never overwrites a capture. */
const EXTRA = args.has('extra') ? new URLSearchParams(args.get('extra')) : null;
const TAG = args.has('tag') ? `-${args.get('tag')}` : '';

/*
 * ONE CHROME AT A TIME, MACHINE-WIDE — copied from `tools/shots.mjs`.
 *
 * Many agents may ask for captures at once; a headless Chrome with WebGPU is
 * the one expensive thing in this repository, and eight of them once took the
 * machine down. The lock is a directory (mkdir is atomic); a pid file inside
 * lets a crashed holder be reclaimed. Waiting callers poll for up to 20 min.
 */
const LOCK = join(tmpdir(), 'airena-shots.lock');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function acquireLock() {
  const started = Date.now();
  for (;;) {
    try { mkdirSync(LOCK); writeFileSync(join(LOCK, 'pid'), String(process.pid)); return; } catch { /* held */ }
    let pid = 0;
    try { pid = Number(readFileSync(join(LOCK, 'pid'), 'utf8')); } catch { /* being written */ }
    if (pid && !alive(pid)) { try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* raced */ } continue; }
    if (Date.now() - started > 20 * 60e3) throw new Error('another capture has held the Chrome lock for 20 minutes');
    await new Promise((r) => setTimeout(r, 2000));
  }
}
function releaseLock() { try { rmSync(LOCK, { recursive: true, force: true }); } catch { /* already gone */ } }
process.on('exit', releaseLock);

// ── the static server ───────────────────────────────────────────────────────

const MOUNTS = [
  ['/viewer/', join(ROOT, 'src', 'viewer')],
  ['/vendor/', join(ROOT, 'node_modules', 'three', 'build')],
  ['/vendor-addons/', join(ROOT, 'node_modules', 'three', 'examples', 'jsm')],
  ['/bodies/', join(ROOT, 'bodies')],
];
const MIME = {
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

async function configJson() {
  const c = await import('../src/core/config.js');
  return JSON.stringify({
    arena: { half: c.ARENA_HALF, wallHeight: c.WALL_HEIGHT, obstacles: c.OBSTACLES },
    fighters: { blue: { radius: c.DEFAULT_BUILD.radius }, orange: { radius: c.DEFAULT_BUILD.radius } },
    suddenDeathAt: c.SUDDEN_DEATH_AT, suddenDeathRamp: c.SUDDEN_DEATH_RAMP,
  });
}

async function startServer() {
  const config = await configJson();
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/config') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(config);
      return;
    }
    for (const [prefix, dir] of MOUNTS) {
      if (!url.pathname.startsWith(prefix)) continue;
      const rel = normalize(decodeURIComponent(url.pathname.slice(prefix.length)));
      const file = join(dir, rel);
      if (!file.startsWith(dir + sep) && file !== dir) break;
      if (!existsSync(file) || !statSync(file).isFile()) break;
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(readFileSync(file));
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, port: server.address().port };
}

// ── the probes ──────────────────────────────────────────────────────────────

/*
 * World points whose rendered value the brief pins. Chosen to be visible from
 * the default and game cameras and out of every shadow (or deliberately in
 * one). A point outside a frame reads `—`.
 */
const PROBES = [
  { name: 'floor-lit', x: 14, y: 0, z: 12 },
  { name: 'floor-lit-2', x: -14, y: 0, z: -4 },
  { name: 'floor-shadow', x: -4.4, y: 0, z: -4 },
  { name: 'floor-shadow-d', x: 2.4, y: 0, z: 7.6 },
  /* the near-right corner of the field, in the +z wall's shadow (which
     reaches z ≈ 16.2): outside a ±24 m shadow frustum (the √2 rule), lit by
     mistake. At z 17.5 rather than 19 so the top-down `high` camera keeps it
     inside the frame. */
  { name: 'floor-shadow-corner', x: 17, y: 0, z: 17.5 },
  { name: 'floor-centre', x: 3, y: 0, z: -1 },
  { name: 'block-top', x: -7, y: 3.2, z: -3 },
  { name: 'block-top-c', x: 0, y: 3.2, z: -10 },
  { name: 'block-top-d', x: 0, y: 3.2, z: 10 },
  { name: 'block-sun-side', x: 5.78, y: 1.6, z: 3 },
  { name: 'block-shade-side', x: -5.78, y: 1.6, z: -3 },
  /* THE BLOCK RULE, PROBED WHERE THE ESTABLISHING CAMERAS ACTUALLY LOOK
     (round-9). `block-sun-side` reads block b's −x face, which the `vs`
     camera cannot see: on that shot the probe fell through onto a block TOP
     and reported 89.3 as a "sun flank", which is how a blocker survived two
     rounds of captures. The faces below are the ones the default/VS/AAA
     orbits present — the +z flank of every block and the −x flank of the
     blocks right of centre, all of them KEY-LIT — each with the lit floor
     immediately beside it, so the step is measured against its own ground
     and not against the nominal 88.5. `CHECKS.blocks` asserts them. */
  { name: 'block-b-sunz', x: 7.0, y: 1.4, z: 6.5 },
  { name: 'block-b-sunx', x: 5.8, y: 1.4, z: 4.6 },
  { name: 'block-b-top', x: 7.0, y: 3.21, z: 4.6 },
  { name: 'floor-by-b', x: 11.0, y: 0, z: 8.0 },
  { name: 'block-d-sunz', x: 0.0, y: 1.4, z: 11.2 },
  { name: 'block-d-top', x: 0.0, y: 3.21, z: 10.0 },
  { name: 'floor-by-d', x: 5.5, y: 0, z: 13.5 },
  { name: 'block-f-sunx', x: 10.9, y: 1.4, z: -11.0 },
  { name: 'block-f-top', x: 12.5, y: 3.21, z: -11.0 },
  { name: 'floor-by-f', x: 16.0, y: 0, z: -8.0 },
  { name: 'block-e-shadex', x: -10.9, y: 1.4, z: 11.0 },
  { name: 'block-a-sunz', x: -7.0, y: 1.4, z: 0.5 },
  { name: 'floor-by-a', x: -11.0, y: 0, z: 2.0 },
  { name: 'pit-face-lit', x: 8, y: 2, z: -19.98 },
  { name: 'pit-face-lit-x', x: 19.98, y: 2, z: 6 },
  { name: 'pit-face-shaded', x: -19.98, y: 2, z: 4 },
  { name: 'coping-far', x: 8, y: 4.06, z: -20.3 },
  { name: 'plaza-far', x: 0, y: 4.02, z: -26 },
  { name: 'plaza-side', x: 26, y: 4.02, z: 0 },
  { name: 'stair-far', x: 0, y: 2.0, z: -22.5 },
  /* THE WORLD (ARENA-AAA §2). The ring is at 2.05·HALF = 41 m, the deck
     from 53 to 65 with its underside at 15.42 m; these points sit on the
     −x side, which every camera that looks down −z can see. */
  { name: 'tier-tread', x: -43, y: 6.02, z: -6 },
  { name: 'tier-tread-z', x: -16, y: 6.02, z: -43 },
  /* ON the fascia's plane (rr = DECK_IN = 53) and ON the soffit
     (y = DECK_Y = 14.62), not 2.4 m behind the one and 7 cm under the
     other (round-9b): at 90 m a 7 cm miss is half a pixel, and half a pixel
     is all it took for `deck-under-z` to report the tier bank BEHIND the
     cantilever — 69.3 on `low`, which then failed the deck's own value
     band. The page's raycast now names the surface each probe landed on,
     which is how both were found. */
  { name: 'deck-fascia-z', x: -16, y: 15.3, z: -50.53 },
  { name: 'deck-under-z', x: -16, y: 14.62, z: -57 },
  { name: 'plaza-plinth', x: -23.7, y: 4.22, z: 15, r: 1 },
  { name: 'tier-aisle', x: -45, y: 7.02, z: -13.5 },
  { name: 'vomitory', x: -47.6, y: 9.0, z: 0 },
  { name: 'deck-fascia', x: -53, y: 15.3, z: -4 },
  { name: 'deck-under', x: -57, y: 14.62, z: -4 },
  { name: 'far-gate', x: 0, y: 20, z: -78.6 },
  { name: 'plaza-in-stand-shadow', x: -34, y: 4.02, z: 6 },
  { name: 'plaza-lit-band', x: 30, y: 4.02, z: -30 },
  { name: 'body-blue', x: -6, y: 1.0, z: 4 },
  { name: 'body-orange', x: 9, y: 1.0, z: -7 },
  { name: 'ring-blue', x: -6 + 1.5, y: 0.03, z: 4 },
  { name: 'ring-orange', x: 9 + 1.5, y: 0.03, z: -7 },
  { name: 'floor-by-ring-orange', x: 9 + 2.1, y: 0, z: -7 },
  /* the −z banner at u = +9 (the pair that flanks the gate), head and foot */
  { name: 'banner', x: 9, y: 10, z: -42 },
  { name: 'banner-head', x: 9, y: 14.1, z: -42, r: 1 },
  { name: 'banner-foot', x: 9, y: 5.2, z: -42, r: 1 },
  /* THE SAME OBJECT AT THREE RANGES (round-8). `bannerMat` used to be fogged
     toward the ground colour and one frame carried the cloth at S 0.591,
     0.569 and 0.271 — three chromas of one object, the third a pale pink.
     The near, side and far banners are probed apart now so `stand.json`
     reports the spread as a number rather than leaving it to a reviewer's
     pixel picking. */
  { name: 'banner-near', x: -9, y: 10, z: 42, r: 1 },
  { name: 'banner-side', x: 42, y: 10, z: -9, r: 1 },
  { name: 'banner-far', x: -27, y: 10, z: -42, r: 1 },
  { name: 'sky-over-gate', x: 0, y: 40, z: -78.6 },
  /* THE SKY BODIES, MEASURED AGAINST THEIR OWN SKY (round-9). `obj` probes
     sample a named object at `k` radii along screen x and `ky` down screen
     y, so "the planet's core", "its limb" and "the sky one and a half radii
     beside it" survive every change of azimuth, elevation and half-angle —
     the disc moved three times in eight rounds and every judgement of it
     was made on a hand-picked pixel box from one capture. */
  { name: 'planet-core', obj: 'planet', r: 3 },
  /* THE LIT THIRD AND THE SHADED THIRD, WHERE THE THIRDS ARE (round-9b).
     At k ∓0.5 / ky ∓0.35 the pair sampled r/R 0.54–0.61 — the middle half
     of the disc, not its thirds — and it read the terminator off its own
     axis besides: measured round the disc at 0.92 R, `stand-aaa.png` runs
     84.4 at 239° to 72.6 at 90°, a 11.8 L roll, of which that pair caught
     5.4. The gradient's axis is very nearly VERTICAL in every upright
     camera (the sun is over the disc's upper left), so the two points sit
     at r/R ≈ 0.75 up and down it: the lit third and the shaded third the
     rule is written about, still 0.25 R inside the limb ring. */
  { name: 'planet-lit', obj: 'planet', k: -0.28, ky: -0.70, r: 3 },
  { name: 'planet-shade', obj: 'planet', k: 0.18, ky: 0.72, r: 3 },
  { name: 'planet-limb-l', obj: 'planet', k: -0.9, r: 1 },
  { name: 'planet-limb-r', obj: 'planet', k: 0.9, r: 1 },
  { name: 'sky-l-planet', obj: 'planet', k: -1.45, r: 3 },
  { name: 'sky-r-planet', obj: 'planet', k: 1.45, r: 3 },
  { name: 'sky-over-planet', obj: 'planet', ky: -1.45, r: 3 },
  { name: 'moon-core', obj: 'moon', r: 2 },
  { name: 'moon-lit', obj: 'moon', k: -0.45, ky: -0.3, r: 1 },
  { name: 'sky-by-moon', obj: 'moon', k: 3.0, r: 3 },
  { name: 'sky-top', u: 0.5, v: 0.04 },
  { name: 'sky-upper', u: 0.5, v: 0.16 },
  { name: 'horizon-right', u: 0.9, v: 0.42 },
  { name: 'corner-TL', u: 0.014, v: 0.022, r: 5 },
  { name: 'corner-TR', u: 0.986, v: 0.022, r: 5 },
  { name: 'corner-BL', u: 0.014, v: 0.978, r: 5 },
  { name: 'corner-BR', u: 0.986, v: 0.978, r: 5 },
];

const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;

// ── the captures ────────────────────────────────────────────────────────────

/* The game's cameras first — every world-layer judgement is made on those —
   then the brief's comparisons, the tiers, the fallback, the states. Every
   shot runs under the two play rules the page implements (`?ghost=1`: a ring
   hidden by unfaded cover is drawn over it; the near-wall rule is on unless
   `wallrule=0`), so the captures photograph the play condition.
   `jitter: px` asks the page for the shimmer pair measurement after the
   capture (`window.__arenaJitter`); `game-jitter` is the second frame of
   that pair as a PNG, for the eye. */
/* THE PLAY CAMERAS CARRY THE CORAL (round-7). They used to be shot with
   `{ banner: '0' }` — the port's old rule, no banner while the orbit camera
   fights — so `stand-game.png` and its four siblings held 777–2722 coral
   pixels and every one of them was a telegraph ring: the world's only
   saturated object was missing from exactly the frames the product shows.
   The rule is gone from the page and from this file; `game-banner` stays as
   an id so a merged `stand.json` keeps its row. */
const SHOTS = [
  { id: 'game', cam: 'game', quality: 'high', jitter: 0.37 },
  { id: 'game-jitter', cam: 'game', quality: 'high', extra: { jitter: '0.37' } },
  { id: 'game-banner', cam: 'game', quality: 'high' },
  { id: 'game-fade', cam: 'game', quality: 'high', extra: { fade: '1' } },
  { id: 'game-glow', cam: 'game', quality: 'high', extra: { glow: '1' } },
  { id: 'game-medium', cam: 'game', quality: 'medium', jitter: 0.37 },
  { id: 'game-low', cam: 'game', quality: 'low', jitter: 0.37 },
  { id: 'melee', cam: 'melee', quality: 'high' },
  { id: 'near', cam: 'near', quality: 'high' },
  { id: 'counter', cam: 'counter', quality: 'high' },
  { id: 'far', cam: 'far', quality: 'high' },
  { id: 'world', cam: 'world', quality: 'high' },
  /* `aaa` — the deck-height frame ARENA-AAA §2 is judged on (see the preset's
     note in `arena.html`). No capture on disk framed the world the way
     `a2.jpg` does until this one existed. */
  { id: 'aaa', cam: 'aaa', quality: 'high' },
  { id: 'aaa-medium', cam: 'aaa', quality: 'medium' },
  { id: 'aaa-low', cam: 'aaa', quality: 'low' },
  { id: 'default', cam: 'default', quality: 'high' },
  { id: 'high', cam: 'high', quality: 'high' },
  { id: 'low', cam: 'low', quality: 'high' },
  { id: 'low-fade', cam: 'low', quality: 'high', extra: { fade: '1' } },
  { id: 'low-heat', cam: 'low', quality: 'high', extra: { heat: '1' } },
  { id: 'vs', cam: 'vs', quality: 'high' },
  { id: 'default-medium', cam: 'default', quality: 'medium' },
  { id: 'default-low', cam: 'default', quality: 'low' },
  { id: 'default-webgl', cam: 'default', quality: 'high', webgl: true },
  { id: 'default-webgl-fade', cam: 'default', quality: 'high', webgl: true, extra: { fade: '1' } },
  { id: 'default-dpr2', cam: 'default', quality: 'high', dpr: 2 },
  { id: 'default-medium-dpr2', cam: 'default', quality: 'medium', dpr: 2 },
];

/* What the console summary asserts, per shot, on top of the probes: the
   alpha-scaled shadow fade on the WebGL2 backend (block d at 0.35 must lift
   its umbra ≥ 35 % of the way to the lit floor) and the shimmer number. */
const CHECKS = {
  /* The alpha-scaled shadow fade on the WebGL2 backend: block d at opacity
     0.35 must cast about 35 % of a shadow, so its umbra has to sit WELL
     ABOVE the full umbra the same frame measures under an unfaded caster.
     Asked as an absolute (L ≥ 86) this tracked the penumbra width instead:
     `shadowSoft` 0.2 → 0.12 sharpened the umbra and the same correct
     behaviour measured 85.2. Asked as a difference it measures the thing it
     is for. */
  'default-webgl-fade': (row) => {
    const L = row.probes['floor-shadow-d']?.L, full = row.probes['floor-shadow']?.L;
    if (!(L > 0) || !(full > 0)) return null;
    return L - full >= 4 ? null : `floor-shadow-d L ${L} is only ${(L - full).toFixed(1)} over the full umbra (${full}): the alpha-scaled shadow fade did not take on WebGL2`;
  },
  /* THE BANNER RULE, asserted on every capture from the page's own
     projection of all sixteen banners through all ten presets: no camera may
     show a banner whose FOOT is off the frame (it floats) or whose HEAD is
     within 40 px of the top edge (it is a coral tab pinned to the bezel),
     and the four play cameras plus the two establishing ones must each show
     at least one WHOLE banner. */
  '**': (row) => {
    const b = row.stats?.banners;
    if (!b || b.error) return null;
    const bad = [];
    /* `near` (dist 13) and `high` (the top-down diagnostic) are exempt: at
       13 m the whole ring is cut by the top edge and at 46 m up there is no
       ring in the picture at all. `world` looks down on the near stand from
       33 m, so ITS near feet leave the frame by design — heads only. The
       40 px rule (`headTight`) is asked of the cameras the product actually
       shows a world in; `melee` only has to keep its hanging points. */
    const TIGHT = ['game', 'counter', 'far', 'default', 'low', 'vs', 'world', 'aaa'];
    for (const cam of [...TIGHT, 'melee']) {
      const c = b[`${cam}-count`];
      if (!c || !c.shown) continue;
      if (c.headOff) bad.push(`${cam}: ${c.headOff} head(s) off frame`);
      if (c.footOff && cam !== 'world') bad.push(`${cam}: ${c.footOff} foot/feet off frame`);
      if (!c.whole) bad.push(`${cam}: no whole banner`);
      if (TIGHT.includes(cam) && c.headTight) bad.push(`${cam}: ${c.headTight} head(s) under 40 px of sky`);
    }
    return bad.length ? `banners — ${bad.join('; ')}` : null;
  },
  /* THE BLOCK RULE (round-9, the lead's contract): from the establishing, VS
     and AAA framings a cover block's LIT flank must land at least 6 L under
     the floor immediately beside it, its shade flank 8, and its cap at least
     2 L over the same floor. Measured per block against its own ground, so a
     shadow under one of them cannot flatter the number. */
  /* ROUND-9b: A PROBE ONLY COUNTS WHEN IT DREW THE SURFACE IT NAMES. Every
     world-point probe carries the raycast identity of its own pixel now
     (`hit`, `alpha`, `occluded` — see `runProbe` in arena.html), and this
     rule reads it: a point hidden behind other cover, a point that landed on
     a different object, and a block the ring rule has GHOSTED to 0.35 (its
     faces are then 65 % of the floor behind them, which is not the block's
     value) are all reported as skips rather than counted as failures. The
     rule then insists on what it is for: on every camera that shows the
     field, at least two solid blocks must be measured, so the skips can
     never quietly empty it. */
  blocks: (row) => {
    const P = row.probes;
    const read = (k, id) => {
      const p = P[k];
      if (!p || !(p.L > 0)) return { skip: `${k}: off frame` };
      if (p.occluded) return { skip: `${k}: hidden by ${p.hit}` };
      if (id && p.hit && !String(p.hit).startsWith(`block-${id}`)) return { skip: `${k}: pixel is ${p.hit}` };
      if (p.alpha !== undefined && p.alpha < 0.99) return { skip: `${k}: block ${id} ghosted to ${p.alpha} by the ring rule` };
      return { L: p.L };
    };
    const bad = [], skips = [];
    let measured = 0;
    const groups = [
      ['b', 'floor-by-b', ['block-b-sunz', 'block-b-sunx'], [], 'block-b-top'],
      ['d', 'floor-by-d', ['block-d-sunz'], [], 'block-d-top'],
      ['f', 'floor-by-f', ['block-f-sunx'], [], 'block-f-top'],
      ['a', 'floor-by-a', ['block-a-sunz'], ['block-shade-side'], null],
      ['e', 'floor-by-a', [], ['block-e-shadex'], null],
    ];
    for (const [id, floorKey, sun, shade, topKey] of groups) {
      const fl = read(floorKey, null);
      if (fl.skip) { skips.push(fl.skip); continue; }
      const f = fl.L;
      let any = false;
      for (const k of sun) {
        const v = read(k, id);
        if (v.skip) { skips.push(v.skip); continue; }
        any = true;
        if (f - v.L < 6) bad.push(`${k} ${v.L} is ${(f - v.L).toFixed(1)} under its floor (${f}), rule 6`);
      }
      for (const k of shade) {
        const v = read(k, id);
        if (v.skip) { skips.push(v.skip); continue; }
        any = true;
        if (f - v.L < 8) bad.push(`${k} ${v.L} is ${(f - v.L).toFixed(1)} under its floor (${f}), rule 8`);
      }
      if (topKey) {
        const t = read(topKey, id);
        if (t.skip) skips.push(t.skip);
        else { any = true; if (t.L - f < 2) bad.push(`${topKey} ${t.L} is ${(t.L - f).toFixed(1)} over its floor (${f}), rule 2`); }
      }
      if (any) measured += 1;
    }
    /* The "at least two" floor is asked of the six framings the rule is
       ABOUT — the two establishing shots, the VS card, the AAA frame, the
       fight camera and the world view. `melee`, `near`, `counter`, `far`
       and `high` are diagnostics of the orbit's ends, where the lit floor
       beside a block is routinely outside the frame. */
    const FIELD_CAMS = ['game', 'default', 'low', 'vs', 'aaa', 'world'];
    if (measured < 2 && FIELD_CAMS.includes(row.stats?.cam)) bad.push(`only ${measured} solid block(s) measurable in this frame`);
    if (!bad.length) return null;
    return `blocks — ${bad.join('; ')}${skips.length ? ` [skipped: ${skips.join('; ')}]` : ''}`;
  },
  /* THE PLANET RULE (round-9): the disc's core sits 2–4.5 L UNDER the sky
     beside it — a body in a bright hazy sky, not a hole and not a lamp —
     spans at least 6 L from its lit third to its shaded one, and nothing is
     drawn over its face (a megastructure truss line used to cross it, which
     shows up as a limb BRIGHTER than the core by more than the ring). */
  planet: (row) => {
    /* Sudden death takes the fog, the dome and both bodies to the ember by
       design (`?heat=1`): every value band in this file is a peacetime
       number and none of them is asked of that capture. */
    if (/heat=1/.test(row.url || '')) return null;
    const P = row.probes, L = (k) => (P[k] && P[k].L > 0 ? P[k].L : null);
    const core = L('planet-core'), lit = L('planet-lit'), shade = L('planet-shade');
    const skyL = L('sky-l-planet'), skyR = L('sky-r-planet');
    const bad = [];
    /* THE COMPOSITING ORDER FIRST (round-9b), because it is the one fault a
       probe on the disc cannot see: both bodies and all three megastructure
       shells are depth-write-free, so a truss over the planet's face is
       decided by `renderOrder` alone. Asserted on every shot, even the ones
       that frame no sky. */
    const ord = row.stats?.skyOrder;
    if (ord && ord.planet !== undefined) {
      const over = Object.entries(ord).filter(([k, v]) => k.startsWith('megastructure') && v >= ord.planet);
      if (over.length) bad.push(`${over.map(([k, v]) => `${k} renderOrder ${v}`).join(', ')} composites over the planet (${ord.planet})`);
    }
    /* A DISC THE FRAME CUTS IS NOT MEASURABLE HERE. On `default` the planet
       (15° across, hung at 8.5°) runs off the top edge — no camera pitched
       16° down with a 25° half-fov can hold it whole — and what is left of
       it sits in the corner, where the page's own grade (`VIGNETTE` 0.4, a
       WASH toward #F4EEE8) lifts the darker of two neighbouring values more
       than the lighter one and closes the gap the rule measures: core 84.3
       against a sky of 86.0 there, 81.9 against 85.0 on the four cameras
       that frame the whole body. The contract is judged on those four; when
       the disc touches an edge the rule says so and stands down. */
    const disc = P['planet-core'];
    const W = row.stats?.size?.[0] ?? 1440, H = row.stats?.size?.[1] ?? 900;
    const cut = disc && disc.px && disc.rpx
      && (disc.px[0] < disc.rpx || disc.px[0] > W - disc.rpx || disc.px[1] < disc.rpx || disc.px[1] > H - disc.rpx);
    if (cut) return bad.length ? `planet — ${bad.join('; ')}` : null;
    if (core !== null && (skyL !== null || skyR !== null)) {
      /* The two sky samples sit at the planet's OWN elevation, one on each
         side; the near stand's roofline and the mist can only put something
         DARKER in one of them (on `low` the right-hand sample lands on a
         tower and reads 1.1 L under the left), so the sky the disc is judged
         against is the brighter of the pair — the gradient itself. */
      const sky = Math.max(skyL ?? -1, skyR ?? -1);
      const d = sky - core;
      if (d < 2 || d > 4.5) bad.push(`core ${core} is ${d.toFixed(1)} under the sky beside it (${sky.toFixed(1)}), rule 2–4.5`);
      if (lit !== null && shade !== null && lit - shade < 6) bad.push(`face spans only ${(lit - shade).toFixed(1)} L (lit ${lit}, shade ${shade}), rule 6`);
      /* the limb ring: the rim reads OVER the core, which is what makes a
         body darker than its sky read as curvature and not as a hole */
      const limb = Math.max(L('planet-limb-l') ?? -1, L('planet-limb-r') ?? -1);
      if (limb > 0 && limb - core < 0.8) bad.push(`limb ${limb} is only ${(limb - core).toFixed(1)} over the core (${core}), rule 0.8`);
    }
    return bad.length ? `planet — ${bad.join('; ')}` : null;
  },
  /* THE WORLD'S VALUE STRUCTURE, as the lead set it: the tier bank 80–88,
     the deck's underside 72–78 (the frame's darkest non-fighter line), the
     horizon haze ≈ 84 and no sky over 93. Measured on the two cameras built
     to show the world; elsewhere most of these points are off frame. */
  world: (row) => {
    if (/heat=1/.test(row.url || '')) return null;
    const P = row.probes;
    const bad = [];
    /* Same rule as the block check: a band is asserted only where the pixel
       PROVED it is the surface named. From `game` the soffit's own point is
       seen past the cantilever's edge and the pixel is bank (79.0); from
       `world` and `default` a nearer stretch of the same deck stands in
       front of it. Both are reported, neither is a value fault. */
    const band = (k, lo, hi, want) => {
      const p = P[k];
      if (!p || !(p.L > 0)) return;
      if (p.occluded || (p.alpha !== undefined && p.alpha < 0.99)) return;
      if (want && p.hit && p.hit !== want) return;
      if (p.L < lo || p.L > hi) bad.push(`${k} ${p.L}${p.hit ? ` (${p.hit})` : ''} outside ${lo}–${hi}`);
    };
    for (const k of ['tier-tread', 'tier-tread-z']) band(k, 80, 88, 'tier-bank');
    for (const k of ['deck-under', 'deck-under-z']) band(k, 72, 78, 'tier-deck');
    /* the sky's ceiling, asked only of the frame points that PROVED they
       sampled sky: `hit: null` means the raycast found nothing along that
       pixel but the dome (on `game` and `far` the same two points land on
       the tier bank at L 72–81, which is not the sky's business) */
    for (const k of ['sky-top', 'sky-upper', 'corner-TL', 'corner-TR']) {
      const p = P[k];
      if (p && p.L > 0 && p.hit === null && p.L > 93) bad.push(`${k} ${p.L} over the sky's 93 ceiling`);
    }
    return bad.length ? `world — ${bad.join('; ')}` : null;
  },
  '*': (row) => {
    if (!row.jitter) return null;
    const bad = Object.entries(row.jitter.regions).filter(([, r]) => r.mean > 4).map(([k, r]) => `${k} ${r.mean}`);
    return bad.length ? `shimmer: mean |Δ| over 4 codes on ${bad.join(', ')}` : null;
  },
};

async function main() {
  const shots = SHOTS.filter((s) => !ONLY || ONLY.includes(s.id));
  if (!shots.length) { console.log(`no shot matches --only=${ONLY.join(',')}; ids: ${SHOTS.map((s) => s.id).join(' ')}`); return; }
  mkdirSync(OUT, { recursive: true });
  const { server, port } = await startServer();
  const report = { at: new Date().toISOString(), exposure: EXPOSURE ? Number(EXPOSURE) : 1.0, novsync: true, shots: {} };
  await acquireLock();
  let browser = null;
  try {
    browser = await launchChrome({ w: 1440, h: 900, extraFlags: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] });
    const cdp = new Cdp(browser.ws);
    for (const s of shots) {
      const q = new URLSearchParams({ cam: s.cam, quality: s.quality, ghost: '1' });
      if (s.webgl) q.set('webgl', '1');
      if (EXPOSURE) q.set('exposure', EXPOSURE);
      for (const [k, v] of Object.entries(s.extra || {})) q.set(k, v);
      if (EXTRA) for (const [k, v] of EXTRA) q.set(k, v);
      const url = `http://127.0.0.1:${port}/viewer/arena.html?${q}`;
      const started = Date.now();
      const page = await openPage(cdp, url, { w: 1440, h: 900, dpr: s.dpr || 1 });
      let ready = false;
      for (let i = 0; i < 300 && !ready; i++) {
        await sleep(200);
        ready = await page.evaluate('window.__arenaReady === true').catch(() => false);
      }
      const row = { url, file: null, ready, ms: Date.now() - started, stats: null, probes: {}, errors: [], gpuErrors: [] };
      if (ready) {
        /* Wait for the page's own frame-cost measurement (160 frames). */
        let measured = false;
        for (let i = 0; i < 60 && !measured; i++) {
          await sleep(250);
          measured = await page.evaluate('window.__arenaStats.msPerFrame !== null').catch(() => false);
        }
        row.stats = await page.evaluate('JSON.stringify(window.__arenaStats)').then(JSON.parse).catch(() => null);
        const probes = await page.evaluate(`window.__arenaProbe(${JSON.stringify(PROBES)})`).catch((e) => ({ error: e.message }));
        for (const [k, v] of Object.entries(probes || {})) {
          /* `hit`/`alpha`/`occluded` come from the page's own raycast along
             the probe's pixel (round-9b): what the pixel actually shows, how
             transparent that surface was left by the play rules, and whether
             something nearer than the point asked for is standing in the
             way. The rules below read them so a value the world never drew
             cannot fail the world. */
          row.probes[k] = v && v.rgb
            ? {
              hex: hex(v.rgb), L: Math.round(labL(v.rgb) * 10) / 10, px: v.px,
              ...(v.rpx ? { rpx: v.rpx } : {}),
              ...(v.hit !== undefined ? { hit: v.hit, alpha: v.alpha, occluded: v.occluded } : {}),
            }
            : v;
        }
        const file = join(OUT, `stand-${s.id}${TAG}.png`);
        await page.shot(file);
        row.file = file;
        if (s.jitter) {
          row.jitter = await page.evaluate(`window.__arenaJitter(${s.jitter})`).catch((e) => ({ error: e.message }));
        }
        row.gpuErrors = [...new Set(row.stats?.gpuErrors || [])].slice(0, 6);
        row.gpuErrorCount = row.stats?.gpuErrorCount ?? 0;
        if (row.stats) delete row.stats.gpuErrors;
      }
      row.errors = [...new Set(page.errors)];
      row.checks = [CHECKS[s.id], CHECKS['*'], CHECKS['**'], CHECKS.blocks, CHECKS.planet, CHECKS.world]
        .filter(Boolean).map((f) => f(row)).filter(Boolean);
      report.shots[s.id] = row;
      const st = row.stats || {};
      console.log(`\n  ${s.id.padEnd(20)} ${ready ? 'ok' : 'NOT READY'}  ${st.backend || '?'}  ${st.msPerFrame ?? '?'} ms/frame (${st.fps ?? '?'} fps)  ${st.tier || ''} ${st.shadow || ''} dpr${st.dpr ?? '?'}  ${(row.ms / 1000).toFixed(1)}s to first frame`
        + `\n    post   ${(st.post || []).join(' → ')}`
        + (st.wallFade ? `\n    walls  +z ${st.wallFade[0]}  −z ${st.wallFade[1]}  +x ${st.wallFade[2]}  −x ${st.wallFade[3]}` : ''));
      for (const [k, v] of Object.entries(row.probes)) {
        if (v && v.hex) {
          const off = v.occluded || (v.alpha !== undefined && v.alpha < 0.99);
          console.log(`    ${k.padEnd(22)} ${v.hex}  L ${String(v.L).padStart(5)}`
            + (off ? `   ← ${v.hit}${v.occluded ? ' occluded' : ''}${v.alpha < 0.99 ? ` α${v.alpha}` : ''}` : ''));
        }
        else console.log(`    ${k.padEnd(22)} —`);
      }
      if (row.jitter?.regions) {
        console.log(`    jitter ${row.jitter.px} px: ${Object.entries(row.jitter.regions).map(([k, r]) => `${k} mean ${r.mean} p99 ${r.p99}`).join('  ·  ')}`);
      }
      if (row.errors.length) console.log(`    errors ${row.errors.length}:\n      ${row.errors.slice(0, 6).join('\n      ')}`);
      if (row.gpuErrorCount) console.log(`    GPU ERRORS ${row.gpuErrorCount}:\n      ${row.gpuErrors.join('\n      ')}`);
      for (const c of row.checks) console.log(`    CHECK FAILED: ${c}`);
      await cdp.send('Page.close', {}, page.sessionId).catch(() => {});
      await sleep(300);
    }
  } finally {
    if (browser) await closeChrome(browser);
    releaseLock();
    server.close();
  }
  const jsonFile = join(OUT, TAG ? `stand${TAG}.json` : 'stand.json');
  /* A `--only` run MERGES into the existing report: the other shots' rows
     stay, so a re-shoot of two cameras never leaves a stand.json with two
     entries. A full run replaces it. */
  if (ONLY && existsSync(jsonFile)) {
    try {
      const prev = JSON.parse(readFileSync(jsonFile, 'utf8'));
      report.shots = { ...(prev.shots || {}), ...report.shots };
      report.merged = { from: prev.at, shots: Object.keys(report.shots).filter((k) => !shots.some((s) => s.id === k)) };
    } catch { /* unreadable: replace it */ }
  }
  writeFileSync(jsonFile, JSON.stringify(report, null, 2));
  const failed = Object.entries(report.shots).flatMap(([id, r]) => (r.checks || []).map((c) => `${id}: ${c}`));
  console.log(`\n  wrote ${jsonFile}${failed.length ? `\n  ${failed.length} check(s) failed:\n    ${failed.join('\n    ')}` : '\n  all checks passed'}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
