// Локальный просмотр документов Airena. Оборачивает страницы так же,
// как это делает хостинг артефактов: charset + viewport.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gallery } from './gallery.mjs';

/* Снимки тел лежат в студии Autoage — она только читается, не правится. */
const SHOTS = '/Users/boozybats/Public/Repos/work/Autoage/captures/forge';
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.js': 'text/javascript; charset=utf-8' };

const PAGES = {
  '/': 'spec.html',
  '/spec': 'spec.html',
  '/creature': 'creature.html',
  '/arena': 'arena.html',
  '/uikit': 'uikit.html',
  '/ice': 'ice.html',
  '/frost': 'frost.html',
  '/elements': 'elements.html',
};

/* Макет арены — настоящий three.js и настоящие тела из репозитория. */
const REPO = new URL('..', import.meta.url).pathname;
const STATIC = {
  '/vendor/': join(REPO, 'node_modules/three/build'),
  /* Аддоны нужны стенду `/ice`: узел свечения живёт именно там. */
  '/vendor-addons/': join(REPO, 'node_modules/three/examples/jsm'),
  /* Стенд `/elements` импортирует БОЕВОЙ `src/viewer/vfx.js` как модуль:
     проверяется тот код, что рисует бой, а не его копия на стенде. */
  '/src/': join(REPO, 'src'),
  '/bodies/': join(REPO, 'bodies'),
  '/assets/': join(REPO, 'preview/assets'),
};

const wrap = (body) => `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>*{margin:0}</style></head><body>${body}</body></html>`;

createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '') || '/';

  /* Витрина тел: сама страница и картинки к ней. */
  if (path === '/bodies') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(gallery());
    return;
  }
  if (path.startsWith('/shot/')) {
    const rel = path.slice('/shot/'.length);
    /* Только внутрь папки снимков и только картинки. */
    if (rel.includes('..') || !MIME[extname(rel)]) { res.writeHead(400); res.end(); return; }
    const f = join(SHOTS, rel);
    if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(rel)], 'Cache-Control': 'no-store' });
    res.end(readFileSync(f));
    return;
  }

  for (const [prefix, dir] of Object.entries(STATIC)) {
    if (!path.startsWith(prefix)) continue;
    const rel = path.slice(prefix.length);
    if (rel.includes('..') || !MIME[extname(rel)]) { res.writeHead(400); res.end(); return; }
    const f = join(dir, rel);
    if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(rel)], 'Cache-Control': 'no-store' });
    res.end(readFileSync(f));
    return;
  }

  const file = PAGES[path];
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(wrap('<p style="font:16px sans-serif;padding:40px">Нет такой страницы. Есть: ' +
      Object.keys(PAGES).concat(['/bodies']).join(', ') + '</p>'));
    return;
  }
  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(wrap(readFileSync(new URL(file, import.meta.url), 'utf8')));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(e));
  }
}).listen(8899, () => console.log('Airena preview: http://localhost:8899'));
