#!/usr/bin/env node
/*
 * Ролик одного каста: скринкаст страницы по CDP (`Page.startScreencast`) на
 * настоящем WebGPU, собранный в mp4 и анимированный webp. Кадры-моменты
 * (`vfxshot.mjs`) показывают, КАК выглядит эффект в момент; ролик — как он
 * ДВИЖЕТСЯ: перестройки молнии, бег колец лазера, затухание. Судить
 * мерцание по пяти стоп-кадрам нельзя.
 *
 *   node tools/vfxclip.mjs --el=arc --kind=beam --cam=side --secs=2.2 --out=reports/vfx/clips
 *
 * Почему скринкаст, а не серия скриншотов: `Page.captureScreenshot` стоит
 * ~0.3 с на WebGPU (замер 02.09) — серия давала бы 3 кадра в секунду.
 * Скринкаст отдаёт кадры компоновщика в jpeg с меткой времени; частота
 * плавает (20–60 к/с), поэтому кадры кладутся в concat-список ffmpeg с их
 * настоящими длительностями и пересэмплируются в ровные `--fps`.
 *
 * Прогрев — как у `vfxshot.mjs`: шесть кастов заполняют кольцо материалов,
 * иначе первые кадры ролика снимают компилятор шейдеров, а не эффект.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CAMS, BLUE, ORANGE, fxFor, launchChrome, closeChrome, Cdp, openPage, waitReady, sleep } from './vfxchrome.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT = resolve(ROOT, args.out || join('reports', 'vfx', 'clips'));
const PORT = Number(args.port || 8823);
const BASE = args.url || `http://localhost:${PORT}/?vfx=1&sweep=1${args.webgl ? '&webgl=1' : ''}`;
const W = Number(args.w || 1600), H = Number(args.h || 900);
const EL = args.el || 'arc', KIND = args.kind || 'beam', CAM = args.cam || 'side';
const SECS = Number(args.secs || 2.2), FPS = Number(args.fps || 30);
const CW = Number(args.cw || 1200);      // ширина кадра скринкаста
const LEAD = Number(args.lead || 0.15);  // секунды до каста в ролике
const FFMPEG = args.ffmpeg || process.env.FFMPEG || 'ffmpeg';

/** Сборка анимированного webp из списка кадров `seq.txt` (см. ниже, почему PIL). */
const PY_WEBP = `
import sys, os
from PIL import Image
d, out, dur, w = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
names = open(os.path.join(d, 'seq.txt')).read().split()
cache, ims = {}, []
for n in names:
    if n not in cache:
        im = Image.open(os.path.join(d, n)).convert('RGB')
        if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        cache[n] = im
    ims.append(cache[n])
ims[0].save(out, 'WEBP', save_all=True, append_images=ims[1:], duration=dur, loop=0, quality=74, method=4)
print('webp', out, len(ims), 'frames', os.path.getsize(out) // 1024, 'KB')
`;

async function main() {
  const fx = fxFor(KIND, EL);
  if (!fx) throw new Error(`нет доставки ${KIND}`);
  if (!CAMS[CAM]) throw new Error(`нет глаза ${CAM}`);
  mkdirSync(OUT, { recursive: true });
  const name = `${EL}-${KIND}-${CAM}`;
  const framesDir = join(OUT, `${name}-frames`);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const chrome = await launchChrome({ w: W, h: H });
  const cdp = new Cdp(chrome.ws);
  try {
    const page = await openPage(cdp, BASE, { w: W, h: H });
    await waitReady(page, BASE);
    await page.evaluate(`window.__airenaSweep.place(${JSON.stringify({ blue: BLUE, orange: ORANGE })}); true`);
    await page.evaluate(`window.__airenaSweep.cam(${JSON.stringify(CAMS[CAM])}); true`);
    await sleep(1500);
    const stats = await page.evaluate('window.__airenaSweep.stats()');
    console.log(`вьювер: ${stats.backend}, bloom ${stats.bloom ? 'on' : 'off'}, ${W}×${H} → ролик ${CW} px`);
    for (let w = 0; w < 6; w++) {
      await page.evaluate(`window.__airenaSweep.cast(${JSON.stringify(fx)}); true`);
      await sleep(450);
    }
    await sleep(Math.max(1500, (SECS + 1.0) * 1000));

    const frames = [];
    let castAt = null;
    cdp.on((m) => {
      if (m.sessionId !== page.sessionId || m.method !== 'Page.screencastFrame') return;
      frames.push({ data: m.params.data, ts: m.params.metadata.timestamp });
      cdp.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }, page.sessionId).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: CW, maxHeight: Math.round((CW * H) / W), everyNthFrame: 1 }, page.sessionId);
    await sleep(LEAD * 1000);
    const t0 = Date.now();
    castAt = await page.evaluate(`(window.__airenaSweep.cast(${JSON.stringify(fx)}), performance.now())`);
    const castWall = Date.now();
    await sleep(SECS * 1000 - (Date.now() - t0) + LEAD * 1000);
    await cdp.send('Page.stopScreencast', {}, page.sessionId);
    await sleep(200);
    const fps = await page.evaluate('window.__airenaSweep.stats()');
    if (frames.length < 5) throw new Error(`скринкаст отдал ${frames.length} кадров`);

    /* Метки времени скринкаста — секунды эпохи; каст — по настенным часам. */
    const castEpoch = castWall / 1000;
    const list = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      const file = `f${String(i).padStart(4, '0')}.jpg`;
      writeFileSync(join(framesDir, file), Buffer.from(f.data, 'base64'));
      const dur = i + 1 < frames.length ? Math.max(0.005, frames[i + 1].ts - f.ts) : 1 / FPS;
      list.push(`file '${file}'\nduration ${dur.toFixed(4)}`);
    }
    list.push(`file 'f${String(frames.length - 1).padStart(4, '0')}.jpg'`);
    writeFileSync(join(framesDir, 'list.txt'), list.join('\n') + '\n');
    const span = frames[frames.length - 1].ts - frames[0].ts;
    const rate = frames.length / Math.max(0.001, span);
    const mp4 = join(OUT, `${name}.mp4`), webp = join(OUT, `${name}.webp`);
    const common = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(framesDir, 'list.txt')];
    execFileSync(FFMPEG, [...common, '-vf', `fps=${FPS},scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4]);
    /* Анимированный webp — через PIL, а не ffmpeg: в сборке ffmpeg на этой
       машине нет libwebp (проверено 03.09), а PIL с webp у проекта уже есть
       (`docs/vfx-notes/metrics.py`). Кадры пересэмплируются в ровные WFPS по
       меткам времени: на каждый такт берётся последний кадр не позже такта. */
    const WFPS = Math.min(FPS, 24), WW = Math.min(CW, Number(args.webpw || 900));
    const seq = [];
    for (let t = frames[0].ts, i = 0; t <= frames[frames.length - 1].ts + 1e-6; t += 1 / WFPS) {
      while (i + 1 < frames.length && frames[i + 1].ts <= t) i++;
      seq.push(`f${String(i).padStart(4, '0')}.jpg`);
    }
    writeFileSync(join(framesDir, 'seq.txt'), seq.join('\n') + '\n');
    let webpOk = true;
    try {
      execFileSync('python3', ['-c', PY_WEBP, framesDir, webp, String(Math.round(1000 / WFPS)), String(WW)], { stdio: ['ignore', 'inherit', 'inherit'] });
    } catch (e) { webpOk = false; console.warn(`webp не собран (нужен python3 с PIL и webp): ${e.message}`); }
    const index = {
      url: BASE, at: new Date().toISOString(), el: EL, kind: KIND, cam: CAM, secs: SECS, lead: LEAD,
      frames: frames.length, screencastFps: +rate.toFixed(1), viewerFps: fps.fps, backend: stats.backend,
      castAtPage: castAt, castOffsetInClip: +(castEpoch - frames[0].ts).toFixed(3),
      files: { mp4, webp: webpOk ? webp : null }, errors: page.errors.slice(0, 20),
    };
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify(index, null, 2));
    if (!args.keep) rmSync(framesDir, { recursive: true, force: true });
    console.log(`${frames.length} кадров за ${span.toFixed(2)} с (${rate.toFixed(1)} к/с), каст на ${index.castOffsetInClip} с → ${mp4}, ${webp}${page.errors.length ? `  (ошибок консоли: ${page.errors.length})` : ''}`);
  } finally {
    await closeChrome(chrome);
  }
}

main().catch((e) => { console.error(`vfxclip: ${e.message}`); process.exit(1); });
