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
 *   node tools/vfxshot.mjs --moments=0.06,0.12,0.38,0.8,1.5   близкие моменты — отдельными кастами
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

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
/* Запуск Chrome, глаза, стойка бойцов и записи доставок — общие с
   `vfxclip.mjs` (ролики): см. `vfxchrome.mjs`. */
import { CAMS, BLUE, ORANGE, fxFor, launchChrome, closeChrome, Cdp, openPage, waitReady, sleep } from './vfxchrome.mjs';

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

/* ── план ──────────────────────────────────────────────────────────────── */

const ELEMENTS = (args.el ? args.el.split(',') : ['frost', 'ember', 'arc', 'void', 'kinetic']);
const KINDS = (args.kind ? args.kind.split(',') : ['cone', 'self', 'zone', 'beam', 'bolt', 'lob']);

const CAM_NAMES = (args.cams ? args.cams.split(',') : Object.keys(CAMS));

/* Моменты от каста, секунды: выход, пик, удержание. */
const MOMENTS = (args.moments ? args.moments.split(',').map(Number) : [0.2, 0.7, 1.6]);

/*
 * МОМЕНТЫ ДЕЛЯТСЯ НА КАСТЫ. `Page.captureScreenshot` на WebGPU стоит ~0.3 с и
 * сдвигает следующий момент того же каста: один каст с 0.06, 0.15, 0.3
 * снимался на 0.06, 0.43, 0.78 (замер 02.09). Поэтому в одном касте моменты
 * стоят не ближе `--gap` (0.45 с), а близкие уходят в отдельные касты того же
 * глаза. Эффекты детерминированы от координат каста (A2), кадры разных кастов
 * совпадают — проверено на пяти моментах полировки молнии.
 */
const GAP = Number(args.gap || 0.45);
function groupMoments(ms) {
  const groups = [];
  for (const m of [...ms].sort((a, b) => a - b)) {
    let g = groups.find((gr) => m - gr[gr.length - 1] >= GAP);
    if (!g) { g = []; groups.push(g); }
    g.push(m);
  }
  return groups;
}
const GROUPS = groupMoments(MOMENTS);

/* ── прогон ─────────────────────────────────────────────────────────────── */

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = await launchChrome({ chrome: args.chrome, w: W, h: H });
  const cdp = new Cdp(chrome.ws);
  const index = { url: BASE, at: new Date().toISOString(), w: W, h: H, cams: CAMS, moments: MOMENTS, casts: GROUPS, gap: GAP, shots: [] };
  try {
    const page = await openPage(cdp, BASE, { w: W, h: H });
    /* Сцена готова, когда есть ручки прогона и тела обеих сторон. */
    await waitReady(page, BASE);
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
            /* Каст на глаз и группу моментов (см. `groupMoments`): моменты
               снимаются последовательно по часам СТРАНИЦЫ (ответ `cast`
               возвращает её `performance.now()`), ракурс меняется между
               кастами. */
            for (const [gi, group] of GROUPS.entries()) {
              const t0 = Date.now();
              const pageT0 = await page.evaluate(`(window.__airenaSweep.cast(${JSON.stringify(fx)}), performance.now())`);
              for (const m of group) {
                const wait = t0 + m * 1000 - Date.now();
                if (wait > 0) await sleep(wait);
                const name = `${el}-${kind}-t${m.toFixed(2).replace('.', '_')}-${camName}.png`;
                const at = await page.evaluate('performance.now()');
                await page.shot(join(OUT, name));
                index.shots.push({ el, kind, moment: m, cam: camName, cast: gi, file: name, actual: +((at - pageT0) / 1000).toFixed(3) });
              }
              /* Дать эффекту догореть, чтобы следующий каст не снимал хвост. */
              await sleep(Math.max(1200, 3800 - (Date.now() - t0)));
            }
          }
          console.log(`  ${el} · ${kind}: ${CAM_NAMES.length * MOMENTS.length} кадров, кастов на глаз: ${GROUPS.length}`);
        }
      }
    }
    const fps = await page.evaluate('window.__airenaSweep.stats()');
    index.fps = fps.fps; index.draws = fps.draws;
    index.errors = page.errors.slice(0, 20);
    writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
    console.log(`${index.shots.length} кадров → ${OUT}${page.errors.length ? `  (ошибок консоли: ${page.errors.length})` : ''}`);
  } finally {
    await closeChrome(chrome);
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
