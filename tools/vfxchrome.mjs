/**
 * Общий запуск headless Chrome по CDP для инструментов съёмки эффектов
 * (`vfxshot.mjs` — кадры, `vfxclip.mjs` — ролики). Вынесено сюда, потому что
 * два инструмента держали бы одну и ту же сотню строк про флаги WebGPU, порт
 * DevTools и ожидание вьювера, и расходились бы по мелочам.
 *
 * WebGPU в headless Chrome работает без виртуального времени
 * (`--virtual-time-budget` ломает инициализацию адаптера: кадр остаётся
 * чёрным — проверено), поэтому все ожидания — настоящие миллисекунды.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import WebSocket from 'ws';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const CHROME_DEFAULT = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* Стойка бойцов, четыре глаза и записи доставок — общие со стендом руками
   (`vfxstand.js`): см. `src/viewer/vfxfixture.js`, файл без three и DOM. */
export { BLUE, ORANGE, CAMS, fxFor } from '../src/viewer/vfxfixture.js';

/* `extraFlags` — e.g. `['--disable-frame-rate-limit', '--disable-gpu-vsync']`
   for a throughput measurement (`arenashot.mjs`): without them every tier
   reads 60 fps, which is the cap, not the cost. Frame captures leave it off. */
export async function launchChrome({ chrome = process.env.CHROME || CHROME_DEFAULT, w = 1600, h = 900, extraFlags = [] } = {}) {
  const profile = join(tmpdir(), `airena-vfxshot-${process.pid}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const flags = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--enable-unsafe-webgpu', '--enable-features=WebGPU', '--ignore-gpu-blocklist',
    '--use-angle=metal', ...extraFlags, `--window-size=${w},${h}`, 'about:blank',
  ];
  const proc = spawn(chrome, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });
  const portFile = join(profile, 'DevToolsActivePort');
  /*
   * EXISTENCE IS NOT CONTENT.
   *
   * Chrome creates this file and writes its two lines a moment later. Waiting
   * only for the file to appear read an empty one on a loaded machine and built
   * `ws://127.0.0.1:undefined` — a capture run died on `Invalid URL` while
   * three agents were photographing screens at once. So the wait is for a port
   * and a path, not for a name in a directory.
   */
  const read = () => {
    if (!existsSync(portFile)) return null;
    try {
      const lines = readFileSync(portFile, 'utf8').trim().split('\n');
      return lines.length >= 2 && /^\d+$/.test(lines[0]) ? lines : null;
    } catch { return null; }
  };
  let devtools = null;
  for (let i = 0; i < 150 && !devtools; i++) { devtools = read(); if (!devtools) await sleep(100); }
  if (!devtools) { proc.kill(); throw new Error(`Chrome не поднял DevTools: ${stderr.slice(-400)}`); }
  const [port, path] = devtools;
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => {
    const bell = setTimeout(() => rej(new Error(`Chrome не принял CDP на порту ${port} за 15 с`)), 15000);
    ws.once('open', () => { clearTimeout(bell); res(); });
    ws.once('error', (e) => { clearTimeout(bell); rej(e); });
  });
  return { proc, ws, profile };
}

/** Закрыть Chrome и подчистить профиль (он дописывается ещё полсекунды после SIGTERM). */
export async function closeChrome({ proc, ws, profile }) {
  try { ws.close(); } catch { /* уже закрыт */ }
  proc.kill();
  for (let i = 0; i < 4; i++) {
    await sleep(400);
    try { rmSync(profile, { recursive: true, force: true }); break; } catch { /* ещё пишет */ }
  }
}

export class Cdp {
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

/** Открыть страницу вьювера: `evaluate`, `shot`, собранные ошибки консоли. */
export async function openPage(cdp, url, { w = 1600, h = 900, dpr = 1 } = {}) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: true, width: w, height: h });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  /* `dpr` 2 emulates a Retina page: `devicePixelRatio` reads 2 and a
     `setPixelRatio(min(dpr, 2))` renderer draws four times the pixels. */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false }, sessionId);
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
    const { writeFileSync } = await import('node:fs');
    const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  return { sessionId, evaluate, shot, errors };
}

/** Дождаться ручек прогона и тел обеих сторон (до 60 с). */
export async function waitReady(page, url) {
  let ready = false;
  for (let i = 0; i < 300 && !ready; i++) {
    await sleep(200);
    ready = await page.evaluate('!!(window.__airenaSweep && window.__airenaSweep.bodies().blue && window.__airenaSweep.bodies().orange)').catch(() => false);
  }
  if (!ready) throw new Error(`вьювер не поднялся за 60 с: ${url} — ошибки: ${page.errors.slice(0, 3).join(' | ')}`);
}
