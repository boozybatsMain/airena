/**
 * The match server: static files on one side, a live fight on a socket on the
 * other.
 *
 * The viewer is served as raw ES modules with an import map — three.js ships a
 * pre-bundled `three.webgpu.js`, so there is nothing for a bundler to do here
 * and one fewer moving part between a reviewer and a running fight.
 */

import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocketServer } from 'ws';

import { compileBrain } from '../brain/host.js';
import {
  ARENA_HALF, FIGHTERS, MATCH_SECONDS, OBSTACLES, SKILLS, SUDDEN_DEATH_AT,
  SUDDEN_DEATH_RAMP, THINK_HZ, TICK_HZ, WALL_HEIGHT,
} from '../core/config.js';
import { createWorld, snapshot, step } from '../core/sim.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT || 8787);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** Which directories a URL may reach, and where they live. */
const MOUNTS = [
  ['/vendor/', join(ROOT, 'node_modules/three/build')],
  ['/bodies/', join(ROOT, 'bodies')],
  /* Реестр грамматики — чистые данные, ни одного node-импорта. Экран берёт
     палитры элементов и русские имена атомов ОТТУДА ЖЕ, откуда сервер берёт
     цены: две копии палитры разошлись бы в первый же день. */
  ['/skills/', join(ROOT, 'src/skills')],
  ['/assets/', join(ROOT, 'preview/assets')],
  ['/', join(ROOT, 'src/viewer')],
];

function brainTags() {
  const dir = join(ROOT, 'brains');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => statSync(join(dir, d)).isDirectory())
    // Both, not either: a half-generated directory in the dropdown is a
    // fight that fails to start for a reason the viewer cannot explain.
    .filter((d) => existsSync(join(dir, d, 'octopus.js')) && existsSync(join(dir, d, 'gorilla.js')))
    .sort();
}

function brainSource(id, tag) {
  const p = join(ROOT, 'brains', tag, `${id}.js`);
  if (!existsSync(p)) throw new Error(`no ${id} brain in tag "${tag}"`);
  return readFileSync(p, 'utf8');
}

function brainMeta(id, tag) {
  const p = join(ROOT, 'brains', tag, `${id}.json`);
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return {
      model: j.model, effort: j.effort, attempts: j.attempts?.length ?? null,
      chars: j.accepted ? j.attempts[j.accepted.attempt]?.chars ?? null : null,
      generatedAt: j.generatedAt, costUsd: j.costUsd,
    };
  } catch { return null; }
}

const CONFIG = {
  arena: { half: ARENA_HALF, wallHeight: WALL_HEIGHT, obstacles: OBSTACLES },
  fighters: FIGHTERS,
  skills: SKILLS,
  tickHz: TICK_HZ,
  thinkHz: THINK_HZ,
  matchSeconds: MATCH_SECONDS,
  suddenDeathAt: SUDDEN_DEATH_AT,
  suddenDeathRamp: SUDDEN_DEATH_RAMP,
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let path = decodeURIComponent(url.pathname);

  /*
   * A frame, off the canvas and onto disk.
   *
   * Reviewing this thing means looking at it, and "look at it" has to survive
   * being handed to someone with a clean context and no browser open. So the
   * viewer can post its own canvas here and the shots land in `reports/screens`
   * as ordinary files anyone can read.
   */
  if (path === '/api/shot' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 40e6) req.destroy(); });
    req.on('end', () => {
      try {
        const { name, png } = JSON.parse(body);
        const dir = join(ROOT, 'reports', 'screens');
        mkdirSync(dir, { recursive: true });
        const safe = String(name).replace(/[^a-z0-9._-]/gi, '_').slice(0, 80);
        writeFileSync(join(dir, `${safe}.png`), Buffer.from(String(png).split(',')[1], 'base64'));
        json(res, { ok: true, file: `reports/screens/${safe}.png` });
      } catch (e) {
        res.writeHead(400); res.end(String(e.message));
      }
    });
    return;
  }

  if (path === '/api/config') return json(res, CONFIG);
  if (path === '/api/recommended') {
    const f = join(ROOT, 'reports', 'tournament.json');
    if (!existsSync(f)) return json(res, null);
    try { return json(res, JSON.parse(readFileSync(f, 'utf8')).recommended ?? null); }
    catch { return json(res, null); }
  }
  if (path === '/api/brains') {
    return json(res, brainTags().map((tag) => ({
      tag,
      octopus: brainMeta('octopus', tag),
      gorilla: brainMeta('gorilla', tag),
      has: {
        octopus: existsSync(join(ROOT, 'brains', tag, 'octopus.js')),
        gorilla: existsSync(join(ROOT, 'brains', tag, 'gorilla.js')),
      },
    })));
  }
  if (path.startsWith('/api/source/')) {
    const [, , , tag, id] = path.split('/');
    // Names, not paths. This server is a local dev tool and the project says so,
    // but handing a decoded URL segment to `join` is a traversal in one line and
    // costs one line to refuse.
    const NAME = /^[A-Za-z0-9_-]+$/;
    if (!NAME.test(tag || '') || !NAME.test(id || '')) { res.writeHead(400); return res.end('bad name'); }
    try { return text(res, brainSource(id, tag)); }
    catch (e) { res.writeHead(404); return res.end(e.message); }
  }

  if (path === '/') path = '/index.html';
  for (const [prefix, dir] of MOUNTS) {
    if (!path.startsWith(prefix)) continue;
    const rel = normalize(path.slice(prefix.length)).replace(/^(\.\.[/\\])+/, '');
    const file = join(dir, rel);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) continue;
    /* Дев-сервер не кеширует ничего. Без этого браузер держит модуль по
       эвристике, правка не видна, и чинится то, что уже починено — час
       на это уже был потрачен один раз. */
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    return createReadStream(file).pipe(res);
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

const json = (res, v) => {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(v));
};
const text = (res, v) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(v);
};

// ---------------------------------------------------------------------------
// the live match
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server, path: '/ws' });

/*
 * `ws` forwards the http server's errors onto itself, and it installs that
 * forwarder when the WebSocketServer is constructed — before the port walk at
 * the bottom of this file installs its own handler. An EventEmitter with no
 * `error` listener throws from inside `emit`, so with 8787 busy the throw came
 * first and the walk never ran: `npm run serve` printed "Emitted 'error' event
 * on WebSocketServer instance" and a net stack trace, which is precisely what
 * the walk exists to avoid. The address errors belong to the walk; anything
 * else here is worth saying out loud.
 */
wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE' || err.code === 'EACCES') return;
  console.error(`  websocket: ${err.message}`);
});

wss.on('connection', (ws) => {
  let timer = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

  const send = (v) => { if (ws.readyState === 1) ws.send(JSON.stringify(v)); };

  ws.on('close', stop);
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.cmd !== 'start') return;
    stop();

    const seed = Number.isFinite(msg.seed) ? msg.seed : Math.floor(Math.random() * 1e6);
    const tags = { octopus: msg.octopus || 'v1', gorilla: msg.gorilla || 'v1' };
    let brains;
    try {
      brains = {
        octopus: compileBrain(brainSource('octopus', tags.octopus), 'octopus'),
        gorilla: compileBrain(brainSource('gorilla', tags.gorilla), 'gorilla'),
      };
    } catch (err) {
      send({ type: 'error', message: err.message });
      return;
    }

    const world = createWorld(seed, { curtainSeconds: 2.6 });
    const think = (id, p, api) => brains[id].tick(p, api);
    const speed = Number.isFinite(msg.speed) && msg.speed > 0 ? Math.min(4, msg.speed) : 1;

    send({
      type: 'match',
      seed,
      tags,
      meta: { octopus: brainMeta('octopus', tags.octopus), gorilla: brainMeta('gorilla', tags.gorilla) },
      spawns: world.spawns,
    });
    send({ type: 'frame', frame: snapshot(world) });

    timer = setInterval(() => {
      if (world.done) {
        stop();
        send({
          type: 'over',
          winner: world.winner,
          reason: world.reason,
          stats: {
            octopus: world.fighters.octopus.stats,
            gorilla: world.fighters.gorilla.stats,
          },
          logs: { octopus: brains.octopus.logs.slice(-20), gorilla: brains.gorilla.logs.slice(-20) },
        });
        return;
      }
      step(world, think);
      send({ type: 'frame', frame: snapshot(world) });
    }, 1000 / (TICK_HZ * speed));
  });
});

/**
 * Take the next free port rather than dying on a busy one. A reviewer who has
 * something else on 8787 should get a URL, not an EADDRINUSE stack trace.
 */
function listen(port, attemptsLeft = 12) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`  ${port} is busy, trying ${port + 1}`);
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    throw err;
  });
  server.listen(port);
}

/*
 * The banner is registered once and reads the port back off the socket, rather
 * than being passed to `server.listen` as its callback. That callback is a
 * fresh 'listening' listener per attempt and they all fire on the bind that
 * finally succeeds: with 8787-8789 held, the walk printed four banners and the
 * first of them named 8787 — a dead URL, at the top of the output, from the
 * code whose whole job is handing a reviewer a live one.
 */
server.once('listening', () => {
  const { port } = server.address();
  console.log(`\n  airena   http://localhost:${port}\n`);
  console.log(`  brains   ${brainTags().join(', ') || '(none yet — run tools/brainforge.mjs --all --tag=v1)'}`);
  console.log('  keys     space = fight, c = camera, click a fighter\'s name to read its brain\n');
});
listen(PORT);
