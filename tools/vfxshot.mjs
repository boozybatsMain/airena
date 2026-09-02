#!/usr/bin/env node
/*
 * Прогон снимков эффектов: один и тот же каст — с нескольких ракурсов и в
 * несколько моментов, в настоящем вьювере, на настоящем WebGPU.
 *
 *   node tools/vfxshot.mjs                       все элементы × доставки из плана
 *   node tools/vfxshot.mjs --el=frost            один элемент
 *   node tools/vfxshot.mjs --el=frost --kind=cone
 *   node tools/vfxshot.mjs --out=reports/vfx/before --tag=before
 *   node tools/vfxshot.mjs --url=http://localhost:8823/?vfx=1
 *   node tools/vfxshot.mjs --webgl               тот же прогон на WebGL2
 *   node tools/vfxshot.mjs --fight --seed=101    настоящий бой на дев-вьювере
 *   node tools/vfxshot.mjs --watch=<match id> --url='http://localhost:8787/?vfx=1&sweep=1'
 *                                                  повтор боя из базы продукта: камера
 *                                                  решателя, наборы, тряска — как у зрителя
 *
 * Зачем инструмент, а не «открой и посмотри». Эффект, снятый с одного
 * ракурса в один момент, проверяет ракурс и момент, а не эффект: то, что
 * читается сверху, сбоку не видно вовсе; то, что красиво на пике, до пика и
 * после — пустой пол. Поэтому каждый каст снимается сеткой: четыре глаза
 * (трансляционный, поперечный на той же дистанции, низкий боковой, верхний)
 * на три момента (выход, пик, удержание), и все кадры лежат рядом с именем в
 * файле.
 *
 * Без зависимостей: Chrome запускается headless, разговор с ним — по CDP
 * через `ws`, который в проекте уже есть. WebGPU в headless Chrome работает
 * без виртуального времени (`--virtual-time-budget` ломает инициализацию
 * адаптера: кадр остаётся чёрным — проверено), поэтому ждём реальные
 * миллисекунды.
 *
 * Пути: снимки кладутся в `--out` (по умолчанию `reports/vfx/<tag>`), имя
 * файла — `<el>-<kind>-<момент>-<ракурс>.png`, и рядом пишется `index.json`
 * с планом, чтобы галерею можно было собрать без разбора имён.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const TAG = args.tag || 'shots';
const OUT = resolve(ROOT, args.out || join('reports', 'vfx', TAG));
const PORT = Number(args.port || 8823);
const BASE = args.url || `http://localhost:${PORT}/?vfx=1&sweep=1${args.webgl ? '&webgl=1' : ''}${args.bloom === '0' ? '&bloom=0' : ''}`;
const W = Number(args.w || 1600), H = Number(args.h || 900);
const CHROME = args.chrome || process.env.CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* ── план ──────────────────────────────────────────────────────────────── */

const ELEMENTS = (args.el ? args.el.split(',') : ['frost', 'ember', 'arc', 'void', 'kinetic']);
const KINDS = (args.kind ? args.kind.split(',') : ['cone', 'self', 'zone', 'beam', 'bolt', 'lob']);

/* Бойцы стоят так, чтобы каст шёл слева направо в кадре трансляции, и в
   стороне от блоков `a` (−7,−3) и `b` (7,3): с трансляционного глаза
   (+x,+z) тело у блока `b` пряталось за ним целиком. */
const BLUE = { x: -3.5, z: -1.5, h: Math.PI * 0.32 };
const ORANGE = { x: 3.0, z: 5.0, h: Math.PI * 1.32 };

/* Четыре глаза. `broadcast` — дистанция и высота решателя боя (13–34 м,
   высота 2.8 + 0.42·dist), чтобы «огромный» мерилось там, где смотрят. */
const CAMS = {
  broadcast: { az: Math.PI * 0.25, pitch: 0.46, dist: 26, look: { x: 0, y: 1.2, z: 1.6 } },
  /* Тот же глаз решателя, но ПОПЕРЁК каста: с `broadcast` луч от синего к
     оранжевому идёт почти вдоль взгляда и схлопывается в столбик — судить по
     нему форму пучка нельзя (замер турнира молнии 02.09). */
  side: { az: -Math.PI * 0.25, pitch: 0.46, dist: 26, look: { x: 0, y: 1.2, z: 1.6 } },
  low: { az: Math.PI * 0.62, pitch: 0.2, dist: 15, look: { x: 0, y: 1.4, z: 1.6 } },
  top: { az: Math.PI * 0.1, pitch: 1.15, dist: 22, look: { x: 0, y: 0.6, z: 1.6 } },
};
const CAM_NAMES = (args.cams ? args.cams.split(',') : Object.keys(CAMS));

/* Моменты от каста, секунды: выход, пик, удержание. */
const MOMENTS = (args.moments ? args.moments.split(',').map(Number) : [0.2, 0.7, 1.6]);

function fxFor(kind, element) {
  const base = { kind, element, who: 'blue', t: 0, skill: 'k1' };
  const h = Math.atan2(ORANGE.x - BLUE.x, ORANGE.z - BLUE.z);
  const dist = Math.hypot(ORANGE.x - BLUE.x, ORANGE.z - BLUE.z);
  switch (kind) {
    case 'beam': return { ...base, x0: BLUE.x, z0: BLUE.z, x1: ORANGE.x, z1: ORANGE.z, hit: true };
    case 'cone': return { ...base, x: BLUE.x, z: BLUE.z, h, range: 3.4, halfAngle: 0.96, hit: true };
    case 'bolt': return { ...base, x: BLUE.x, z: BLUE.z, h, range: dist, speed: 22 };
    case 'lob': return { ...base, x: BLUE.x, z: BLUE.z, h, range: dist, speed: 12 };
    case 'zone': return { ...base, x: ORANGE.x, z: ORANGE.z, r: 3.0, duration: 3 };
    case 'dash': return { ...base, x0: BLUE.x, z0: BLUE.z, x1: ORANGE.x - 1.5, z1: ORANGE.z - 1, hit: true };
    case 'blink': return { ...base, x0: BLUE.x, z0: BLUE.z, x1: BLUE.x + 4, z1: BLUE.z + 3 };
    case 'self': return { ...base, x: BLUE.x, z: BLUE.z };
    case 'jump': return { ...base, x: BLUE.x, z: BLUE.z, h, height: 2.2, duration: 0.55 };
    case 'wall': return { ...base, x: 1, z: 1, w: 4, d: 1, duration: 4 };
    case 'impact': return { ...base, x: ORANGE.x, z: ORANGE.z, who: 'orange', effects: ['damage'] };
    case 'status': return { ...base, who: 'orange', effect: 'burn' };
    /* Заряд в замахе — запись только вьювера (см. docs/VFX.md §4). */
    case 'charge': return { ...base, x: BLUE.x, z: BLUE.z, h, windup: 0.9, for: 'cone' };
    default: return null;
  }
}

/* ── Chrome по CDP ─────────────────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchChrome() {
  const profile = join(tmpdir(), `airena-vfxshot-${process.pid}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const flags = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--enable-unsafe-webgpu', '--enable-features=WebGPU', '--ignore-gpu-blocklist',
    '--use-angle=metal', `--window-size=${W},${H}`, 'about:blank',
  ];
  const proc = spawn(CHROME, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) { proc.kill(); throw new Error(`Chrome не поднял DevTools: ${stderr.slice(-400)}`); }
  const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  return { proc, ws, profile };
}

class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waiting = new Map(); this.listeners = [];
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.id && this.waiting.has(m.id)) {
        const { res, rej } = this.waiting.get(m.id); this.waiting.delete(m.id);
        if (m.error) rej(new Error(`${m.error.message} (${m.error.data || ''})`)); else res(m.result);
      } else if (m.method) for (const l of this.listeners) l(m);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((res, rej) => this.waiting.set(id, { res, rej }));
  }
  on(fn) { this.listeners.push(fn); }
}

async function openPage(cdp, url) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, width: W, height: H });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);
  const errors = [];
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
  });
  await cdp.send('Page.navigate', { url }, sessionId);
  const evaluate = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async (file) => {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  return { sessionId, evaluate, shot, errors };
}

/* ── прогон ─────────────────────────────────────────────────────────────── */

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { proc, ws, profile } = await launchChrome();
  const cdp = new Cdp(ws);
  const index = { url: BASE, at: new Date().toISOString(), w: W, h: H, cams: CAMS, moments: MOMENTS, shots: [] };
  try {
    const page = await openPage(cdp, BASE);
    /* Сцена готова, когда есть ручки прогона и тела обеих сторон. */
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) {
      await sleep(200);
      ready = await page.evaluate('!!(window.__airenaSweep && window.__airenaSweep.bodies().blue && window.__airenaSweep.bodies().orange)').catch(() => false);
    }
    if (!ready) throw new Error(`вьювер не поднялся за 60 с: ${BASE} — ошибки: ${page.errors.slice(0, 3).join(' | ')}`);
    /* Прогрев: первый кадр с новым материалом на WebGPU пустой (стенд /ice
       выяснил это первым), и конвейеры собираются на первом появлении. */
    await page.evaluate(`window.__airenaSweep.place(${JSON.stringify({ blue: BLUE, orange: ORANGE })}); true`);
    await page.evaluate(`window.__airenaSweep.cam(${JSON.stringify(CAMS[CAM_NAMES[0]])}); true`);
    await sleep(1500);
    const stats = await page.evaluate('window.__airenaSweep.stats()');
    console.log(`вьювер: ${stats.backend}, bloom ${stats.bloom ? 'on' : 'off'}, ${W}×${H}`);
    index.backend = stats.backend;

    if (args.fight || args.watch) {
      await fightRun(page, index, !!args.watch);
    } else {
      for (const el of ELEMENTS) {
        for (const kind of KINDS) {
          const fx = fxFor(kind, el);
          if (!fx) continue;
          /*
           * Прогрев конкретного эффекта — КОЛЬЦОМ, а не одним кастом.
           *
           * Материалы берутся из пула по шесть на вид (`pooled` в vfx.js), и
           * каждый новый экземпляр — это сборка конвейера на первом
           * появлении: в headless Chrome она занимала до секунды, и кадр
           * «пика» снимал пустой пол. Шесть кастов подряд заполняют кольцо,
           * дальше конвейеры готовы, и снимок ловит эффект, а не компилятор.
           */
          for (let w = 0; w < 6; w++) {
            await page.evaluate(`window.__airenaSweep.cast(${JSON.stringify(fx)}); true`);
            await sleep(450);
          }
          await sleep(Math.max(1500, (MOMENTS[MOMENTS.length - 1] + 1.0) * 1000));
          for (const camName of CAM_NAMES) {
            await page.evaluate(`window.__airenaSweep.cam(${JSON.stringify(CAMS[camName])}); true`);
            await sleep(150);
            /* Один каст на глаз: моменты снимаются последовательно по часам
               СТРАНИЦЫ (ответ `cast` возвращает её `performance.now()`), ракурс
               меняется между кастами. Эффекты детерминированы от координат
               каста (A2), кадры совпадут. */
            const t0 = Date.now();
            const pageT0 = await page.evaluate(`(window.__airenaSweep.cast(${JSON.stringify(fx)}), performance.now())`);
            for (const m of MOMENTS) {
              const wait = t0 + m * 1000 - Date.now();
              if (wait > 0) await sleep(wait);
              const name = `${el}-${kind}-t${m.toFixed(2).replace('.', '_')}-${camName}.png`;
              const at = await page.evaluate('performance.now()');
              await page.shot(join(OUT, name));
              index.shots.push({ el, kind, moment: m, cam: camName, file: name, actual: +((at - pageT0) / 1000).toFixed(3) });
            }
            /* Дать эффекту догореть, чтобы следующий ракурс не снимал хвост. */
            await sleep(Math.max(1200, 3800 - (Date.now() - t0)));
          }
          console.log(`  ${el} · ${kind}: ${CAM_NAMES.length * MOMENTS.length} кадров`);
        }
      }
    }
    const fps = await page.evaluate('window.__airenaSweep.stats()');
    index.fps = fps.fps; index.draws = fps.draws;
    index.errors = page.errors.slice(0, 20);
    writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
    console.log(`${index.shots.length} кадров → ${OUT}${page.errors.length ? `  (ошибок консоли: ${page.errors.length})` : ''}`);
  } finally {
    try { ws.close(); } catch { /* уже закрыт */ }
    proc.kill();
    /* Chrome дописывает профиль ещё с полсекунды после SIGTERM; две попытки
       с паузой, и мусор в tmp не считается провалом прогона. */
    for (let i = 0; i < 4; i++) {
      await sleep(400);
      try { rmSync(profile, { recursive: true, force: true }); break; } catch { /* ещё пишет */ }
    }
  }
}

/*
 * Настоящий бой: камера решателя, тряска, HUD — всё как у зрителя. Снимаем
 * каждые `--every` секунд `--n` кадров и отдельно каждый кадр, в котором
 * сработал эффект (по событию сокета `airena:frame` с непустым `fx`).
 */
async function fightRun(page, index, watching = false) {
  const n = Number(args.n || 24), every = Number(args.every || 0.8);
  await page.evaluate(`window.__airenaSweep.cam(null); true`);
  await page.evaluate(`(() => {
    window.__fxSeen = [];
    addEventListener('airena:frame', (ev) => { const f = ev.detail.frame; if (f && f.fx && f.fx.length) window.__fxSeen.push({ t: f.t, kinds: f.fx.map((e) => e.kind + ':' + (e.element || '')) }); });
    return true;
  })()`);
  if (!watching) {
    await page.evaluate(`(() => {
      const sel = (id, v) => { const s = document.querySelector(id); if (s && v) s.value = v; };
      sel('#sel-oct', ${JSON.stringify(args.blue || '')}); sel('#sel-gor', ${JSON.stringify(args.orange || '')});
      ${args.seed ? `const b = document.querySelector('#seed'); if (b) b.value = ${JSON.stringify(String(args.seed))};` : ''}
      window.airena ? window.airena.startMatch() : document.querySelector('#btn-run').click();
      return true;
    })()`);
  }
  /* Повтор из базы просим ТОЛЬКО когда сцена готова: по `?m=` он стартовал
     бы на загрузке страницы, и первые десять секунд боя уходили на сборку
     WebGPU и тел. Маршрут продукта — хеш, `app.js` сам зовёт повтор. */
  if (watching) await page.evaluate(`(location.hash = ${JSON.stringify('#/watch/' + args.watch)}, true)`);
  for (let i = 0; i < 150; i++) {
    const going = await page.evaluate('!!(window.airena && window.airena.frames && window.airena.frames.length > 2)').catch(() => false);
    if (going) break;
    await sleep(200);
  }
  await sleep(300);
  for (let i = 0; i < n; i++) {
    const t = await page.evaluate('(window.airena && window.airena.renderClock) || 0');
    const name = `fight-${String(i).padStart(2, '0')}-t${Number(t).toFixed(1).replace('.', '_')}.png`;
    await page.shot(join(OUT, name));
    const seen = await page.evaluate('(window.__fxSeen || []).splice(0).map((s) => s.kinds.join(",")).join(";")');
    index.shots.push({ fight: true, file: name, t, fx: seen });
    const over = await page.evaluate('!!(window.airena && window.airena.over)');
    if (over) break;
    await sleep(every * 1000);
  }
}

main().catch((e) => { console.error(`vfxshot: ${e.message}`); process.exit(1); });
