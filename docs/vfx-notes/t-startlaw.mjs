/* Два закона выбора старта на сфере: равномерно в ЯЩИКЕ с проекцией наружу
   против равномерно по СФЕРЕ. Считаем плотность по 24 равновеликим поясам-
   секторам (8 азимутов × 3 равновеликих пояса по широте). */
import { mulberry } from '../../src/viewer/vfx/core.js';
const N = 200000, TAU = Math.PI * 2;
const bin = (x, y, z) => {
  const l = Math.hypot(x, y, z) || 1;
  const az = Math.floor(((Math.atan2(x, z) + Math.PI) / TAU) * 8) % 8;
  /* Равновеликие пояса: делим по sin(широты), а не по самой широте. */
  const lat = Math.min(2, Math.floor(((y / l) + 1) / 2 * 3));
  return lat * 8 + az;
};
const run = (pick) => {
  const g = mulberry(12345), c = new Array(24).fill(0);
  for (let i = 0; i < N; i++) { const [x, y, z] = pick(g); c[bin(x, y, z)]++; }
  const mx = Math.max(...c), mn = Math.min(...c), exp = N / 24;
  return { min: mn, max: mx, ratio: (mn / mx).toFixed(3), worstErr: ((mx - exp) / exp * 100).toFixed(1) + '%' };
};
const box = (g) => [g() * 2 - 1, g() * 2 - 1, g() * 2 - 1];
const sph = (g) => { const a = g() * TAU, e = Math.asin(g() * 2 - 1); return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)]; };
console.log('равномерно в ЯЩИКЕ  →', JSON.stringify(run(box)));
console.log('равномерно по СФЕРЕ →', JSON.stringify(run(sph)));
