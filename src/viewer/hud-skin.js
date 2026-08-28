/**
 * Прошорканные рамки HUD — перенос из preview/arena.html.
 *
 * Контур рисуется «мелом, который плохо пишет»: два медленных синуса по длине
 * дуги дают яркость «изредка хорошо, чаще бледно», затем краску съедают
 * царапины и вытертые пятна через destination-out. У каждого элемента свой
 * seed — износ нигде не повторяется. Модуль чисто косметический: он только
 * красит фоны/оверлеи и не трогает ни одного крючка main.js.
 */

const mulberry = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function wornTex(w, h, seed, color, shapes, opts = {}) {
  const jitter = opts.jitter === undefined ? 1.05 : opts.jitter;
  const tickN = opts.ticks === undefined ? 3 : opts.ticks;
  const S = 2;
  const c = document.createElement('canvas');
  c.width = w * S; c.height = h * S;
  const g = c.getContext('2d');
  g.scale(S, S);
  const rnd = mulberry(seed);
  const base = opts.base || 1.15;
  g.lineCap = 'round';
  const f1 = 0.045 + rnd() * 0.03, f2 = 0.011 + rnd() * 0.009;
  const ph1 = rnd() * 7, ph2 = rnd() * 7;
  let arc = rnd() * 40;
  for (const pts of shapes) {
    const closed = opts.open ? 0 : 1;
    for (let i = 0; i < pts.length - 1 + closed; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.round(len / 4));
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        arc += len / steps;
        const n = (0.5 + 0.5 * Math.sin(arc * f1 + ph1))
                * (0.5 + 0.5 * Math.sin(arc * f2 + ph2));
        const alpha = 0.14 + 0.72 * Math.pow(n, 1.5) + rnd() * 0.08;
        const wdt = base * (0.55 + 0.45 * n + rnd() * 0.12 * jitter);
        const x0 = a[0] + (b[0] - a[0]) * t0, y0 = a[1] + (b[1] - a[1]) * t0;
        const x1 = a[0] + (b[0] - a[0]) * t1, y1 = a[1] + (b[1] - a[1]) * t1;
        g.strokeStyle = `rgba(${color},${alpha.toFixed(2)})`;
        g.lineWidth = wdt;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        if (rnd() < 0.4) {
          const nx = -(y1 - y0), ny = (x1 - x0);
          const nl = Math.hypot(nx, ny) || 1, off = (rnd() - 0.5) * 1.2;
          g.strokeStyle = `rgba(${color},${(alpha * 0.3).toFixed(2)})`;
          g.lineWidth = wdt * 0.55;
          g.beginPath();
          g.moveTo(x0 + nx / nl * off, y0 + ny / nl * off);
          g.lineTo(x1 + nx / nl * off, y1 + ny / nl * off);
          g.stroke();
        }
      }
    }
    for (let i = 0; i < tickN + rnd() * tickN; i++) {
      const si = Math.floor(rnd() * (pts.length - 1));
      const a = pts[si], b = pts[si + 1] || pts[0];
      const t = rnd(), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
      g.strokeStyle = `rgba(${color},${(0.3 + rnd() * 0.35).toFixed(2)})`;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(px - nx * 2.2, py - ny * 2.2);
      g.lineTo(px + nx * 2.2, py + ny * 2.2);
      g.stroke();
    }
  }
  g.globalCompositeOperation = 'destination-out';
  const n = Math.round((w + h) / 4.5);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h;
    const ang = (rnd() < 0.7 ? -0.6 : 0.9) + (rnd() - 0.5) * 0.7;
    const len = 5 + rnd() * 34;
    g.strokeStyle = `rgba(0,0,0,${(0.15 + rnd() * 0.4).toFixed(2)})`;
    g.lineWidth = 0.3 + rnd() * 0.9;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }
  for (let i = 0; i < 5 + rnd() * 5; i++) {
    const x = rnd() * w, y = rnd() * h, r = 3 + rnd() * 9;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${(0.25 + rnd() * 0.35).toFixed(2)})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return c.toDataURL();
}

// углы скруглены короткими фасками; cut — срезанный угол побольше
const rectPts = (w, h, r, cut, cutAt) => {
  const p = [];
  const C = (x, y) => p.push([x, y]);
  if (cutAt === 'br') {
    C(r, .8); C(w - r, .8); C(w - .8, r);
    C(w - .8, h - cut); C(w - cut, h - .8);
    C(r, h - .8); C(.8, h - r); C(.8, r);
  } else if (cutAt === 'bl') {
    C(r, .8); C(w - r, .8); C(w - .8, r);
    C(w - .8, h - r); C(w - r, h - .8);
    C(cut, h - .8); C(.8, h - cut); C(.8, r);
  } else {
    C(r, .8); C(w - r, .8); C(w - .8, r); C(w - .8, h - r);
    C(w - r, h - .8); C(r, h - .8); C(.8, h - r); C(.8, r);
  }
  return p;
};

const CY = '141,205,224';
const OR = '224,164,106';

// эмблемы: срез нижнего правого угла у осьминога, зеркально у гориллы
{
  const imgs = document.querySelectorAll('#bar-oct .wf-emblem, #bar-gor .wf-emblem');
  if (imgs[0]) imgs[0].setAttribute('href', wornTex(130, 130, 11, CY, [rectPts(130, 130, 7, 26, 'br')]));
  if (imgs[1]) imgs[1].setAttribute('href', wornTex(130, 130, 47, OR, [rectPts(130, 130, 7, 26, 'bl')]));
}

// HP-бары: контур-параллелограмм + наклонные делители стадий
{
  const dividers = (mirror) => {
    const out = [];
    for (const x of [66, 132, 198, 264]) {
      out.push(mirror ? [[x - 2.5, 0], [x + 2.5, 16]] : [[x + 2.5, 0], [x - 2.5, 16]]);
    }
    return out;
  };
  const oct = document.querySelector('#bar-oct .hp');
  const gor = document.querySelector('#bar-gor .hp');
  if (oct) oct.style.setProperty('--wf', `url(${wornTex(330, 16, 23, '150,210,225',
    [[[5, .6], [329.4, .6], [324.6, 15.4], [.6, 15.4]], ...dividers(false)],
    { base: 1.0, jitter: 0.6, ticks: 2, open: false })})`);
  if (gor) gor.style.setProperty('--wf', `url(${wornTex(330, 16, 71, '230,168,100',
    [[[.6, .6], [325, .6], [329.4, 15.4], [5.4, 15.4]], ...dividers(true)],
    { base: 1.0, jitter: 0.6, ticks: 2, open: false })})`);
}

// плитки кулдаунов: каждому свой seed
for (const [i, el] of [...document.querySelectorAll('.cd')].entries()) {
  const orange = !!el.closest('#bar-gor');
  el.style.setProperty('--wf', `url(${wornTex(64, 34, 300 + i * 17,
    orange ? OR : CY, [rectPts(64, 34, 3.5, 0, '')],
    { base: 0.72, jitter: 0.5, ticks: 1 })})`);
}

// легенда: скобки по углам со срезом верхнего правого
{
  const el = document.querySelector('#legend .lfr');
  if (el) {
    const w = 268, h = el.parentElement.getBoundingClientRect().height || 150;
    el.style.setProperty('--wf', `url(${wornTex(w, h, 137, CY, [
      [[.8, 34], [.8, .8], [58, .8]],
      [[w - 70, .8], [w - 14.4, .8], [w - .8, 14.4], [w - .8, 44]],
      [[.8, h - 30], [.8, h - .8], [54, h - .8]],
      [[w - 60, h - .8], [w - .8, h - .8], [w - .8, h - 38]],
    ], { open: true, base: 1.2, jitter: 0.5, ticks: 1 })})`);
  }
}

// линия заголовка ленты: подчерк по тексту, полка, горка, разрыв, уголок
{
  const el = document.querySelector('#feedwrap .wf-feedline');
  if (el) {
    el.setAttribute('href', wornTex(400, 40, 313, '86,152,172', [
      [[0, 24], [119, 24]],
      [[122, 11], [136, 11], [149, 24], [334, 24]],
      [[341, 24], [346, 24], [346, 34]],
      [[337, 33], [343, 27]],
    ], { open: true, base: 1.25, jitter: 0.45, ticks: 0 }));
  }
}
