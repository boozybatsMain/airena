/**
 * Съёмка ПОСЛЕДОВАТЕЛЬНОСТИ записей: не одна доставка, а несколько записей
 * `world.fx` с задержками — так сим и работает. Нужно для случаев, которых
 * один каст не показывает:
 *   · болт + удар той же пары (кто, умение): снаряд узнаёт точку попадания
 *     (docs/VFX-PLAN.md §7.2), разряд кончается там, а не на полной дальности;
 *   · щит: запись `self` (беат каста) и `status: shield` с длительностью в
 *     тот же тик — держащуюся решётку открывает вторая (§P10);
 *   · зона: удары и статусы, которые она подкладывает каждые 0.5 с.
 *
 * `--seq` — записи через точку с запятой: `kind[:опции]@задержка_в_секундах`,
 * опции — `hit`, `atom=`, `effect=`, `who=`, `blocked`. Моменты `--moments` считаются
 * от ПЕРВОЙ записи. Всё остальное — как у `vfxshot.mjs`, включая замок GPU
 * снаружи (`tools/vfxlock.sh`).
 *
 *   tools/vfxlock.sh node tools/vfxseq.mjs --port=8823 --el=arc \
 *     --seq='bolt@0;impact:atom=damage@0.4' --moments=0.2,0.42,0.6 \
 *     --cams=side,broadcast --out=$PWD/reports/vfx/arc-bolt/hit
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchChrome, closeChrome, Cdp, openPage, waitReady, sleep, BLUE, ORANGE, CAMS, fxFor } from './vfxchrome.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const PORT = args.port || 8823;
const EL = args.el || 'arc';
const OUT = args.out || `${process.cwd()}/reports/vfx/seq`;
const MOMENTS = String(args.moments || '0.3').split(',').map(Number);
const CAM_NAMES = String(args.cams || 'broadcast,side').split(',');
const URL = `http://localhost:${PORT}/?vfx=1&sweep=1`;

/* `kind[:opt,opt]@delay` */
const SEQ = String(args.seq || 'bolt@0').split(';').map((part) => {
  const [head, delay] = part.split('@');
  const [kind, opts = ''] = head.split(':');
  const o = { hit: true, atom: 'damage', effect: 'burn' };
  for (const kv of opts.split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    o[k] = v === undefined ? true : v;
  }
  return { kind, at: Number(delay || 0), opts: o };
}).sort((a, b) => a.at - b.at);

const main = async () => {
  mkdirSync(OUT, { recursive: true });
  const chrome = await launchChrome();
  const cdp = new Cdp(chrome.ws);
  const page = await openPage(cdp, URL);
  const shots = [];
  try {
    await waitReady(page, URL);
    await page.evaluate(`window.__airenaSweep.place(${JSON.stringify({ blue: BLUE, orange: ORANGE })}); true`);
    await sleep(600);
    for (const camName of CAM_NAMES) {
      await page.evaluate(`window.__airenaSweep.cam(${JSON.stringify(CAMS[camName])}); true`);
      await sleep(300);
      /* Вся последовательность ставится ОДНИМ вызовом в странице: задержки
         меряются её же часами, а не круговым временем CDP (оно гуляет на
         десятки миллисекунд). */
      const recs = SEQ.map((s) => ({ at: s.at, fx: fxFor(s.kind, EL, { ...s.opts, t: 0 }) }))
        .filter((r) => r.fx)
        .map((r) => (r.fx.blocked = SEQ.find((s) => s.at === r.at)?.opts.blocked ? true : undefined, r));
      const t0 = await page.evaluate(`(() => {
        const recs = ${JSON.stringify(recs)};
        const t0 = performance.now();
        for (const r of recs) {
          if (r.at <= 0) window.__airenaSweep.cast(r.fx);
          else setTimeout(() => window.__airenaSweep.cast(r.fx), r.at * 1000);
        }
        return t0;
      })()`);
      for (const m of MOMENTS) {
        const target = t0 + m * 1000;
        for (let i = 0; i < 400; i++) {
          const at = await page.evaluate('performance.now()');
          if (at >= target) break;
          await sleep(Math.min(12, Math.max(1, target - at)));
        }
        const actual = ((await page.evaluate('performance.now()')) - t0) / 1000;
        const file = `${EL}-seq-t${String(m).replace('.', '_')}-${camName}.png`;
        await page.shot(join(OUT, file));
        shots.push({ el: EL, moment: m, cam: camName, file, actual: Math.round(actual * 1000) / 1000 });
        console.log(`  ${file} · заказано ${m} с, снято ${actual.toFixed(3)} с`);
      }
      /* Дать эффектам догореть, чтобы следующий глаз снимал с чистого поля. */
      await sleep(2600);
    }
    const fps = await page.evaluate('(() => { try { return window.__airenaSweep.stats(); } catch { return null; } })()');
    writeFileSync(join(OUT, 'index.json'), JSON.stringify({ url: URL, seq: SEQ, el: EL, moments: MOMENTS, cams: CAM_NAMES, shots, stats: fps, errors: page.errors }, null, 2));
    console.log(`${shots.length} кадров → ${OUT}`);
    if (page.errors.length) console.log('ОШИБКИ КОНСОЛИ:', page.errors.slice(0, 5).join(' | '));
  } finally {
    await closeChrome(chrome);
  }
};
main().catch((e) => { console.error(e); process.exit(1); });
