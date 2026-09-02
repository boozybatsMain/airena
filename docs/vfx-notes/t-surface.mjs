/* Проверка surfaceSegs в Node: точки на оболочке, клетки держатся. */
import { surfaceSegs } from '../../src/viewer/vfx/arc/field.js';
import { mulberry } from '../../src/viewer/vfx/core.js';

const c = [0, 1.24, 0], r = 1.475, ry = 1.24;
function run(strike) {
  const rng = mulberry((7 ^ Math.imul(strike + 1, 0x9e3779b1)) >>> 0);
  const segs = [];
  surfaceSegs({ surface: true, c, r, ry, n: 12, links: 6, link: 0.3, width: 0.021, rungs: 1.0, offset: 0.03, seed: 7 }, rng,
    (ax, ay, az, bx, by, bz, w, k, ph, u) => segs.push([ax, ay, az, bx, by, bz, w, k, ph, u]));
  return segs;
}
const a = run(0), b = run(1);
const dev = (p) => {
  const q = [(p[0] - c[0]) / r, (p[1] - c[1]) / ry, (p[2] - c[2]) / r];
  return Math.hypot(...q);
};
let maxDev = 0, minDev = 9, nan = 0;
for (const s of a) {
  for (const p of [[s[0], s[1], s[2]], [s[3], s[4], s[5]]]) {
    if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) nan++;
    const d = dev(p); maxDev = Math.max(maxDev, d); minDev = Math.min(minDev, d);
  }
}
console.log('segments strike0:', a.length, 'strike1:', b.length);
console.log('NaN points:', nan);
console.log('normalised radius min/max (1.03 = on the shell):', minDev.toFixed(4), maxDev.toFixed(4));
/* Клетки держатся: узлы нитей (не перемычки, фаза < 60) сдвинулись мало. */
const fil = (segs) => segs.filter((s) => s[8] < 60);
const fa = fil(a), fb = fil(b);
let sum = 0, worst = 0, cnt = Math.min(fa.length, fb.length);
for (let i = 0; i < cnt; i++) {
  const d = Math.hypot(fa[i][0] - fb[i][0], fa[i][1] - fb[i][1], fa[i][2] - fb[i][2]);
  sum += d; worst = Math.max(worst, d);
}
console.log('filament segments:', fa.length, fb.length);
console.log('node drift between restrikes: mean', (sum / cnt).toFixed(4), 'm, worst', worst.toFixed(4), 'm');
/* Ни один штрих не пересекает нутро: середина звена не глубже 0.8 оболочки. */
let inside = 0;
for (const s of fa) {
  const m = [(s[0] + s[3]) / 2, (s[1] + s[4]) / 2, (s[2] + s[5]) / 2];
  if (dev(m) < 0.86) inside++;
}
console.log('segments whose midpoint dives under 0.86 of the shell:', inside, '/', fa.length);
/* Охрана: плоский эллипсоид не пишет ничего. */
let n2 = 0;
surfaceSegs({ surface: true, c, r, ry: 0, n: 5, seed: 1 }, mulberry(1), () => n2++);
console.log('flat guard (ry=0) wrote:', n2);
