/**
 * Эмблема существа — процедурный глиф из его id.
 *
 * N7 запрещает косметику: скины, палитры, портреты, баннеры. Это не косметика,
 * а ИДЕНТИФИКАЦИЯ: в списке из двадцати строк и на плите боя существо надо
 * узнавать быстрее, чем прочитывается имя. Глиф не выбирается, не покупается,
 * не меняется и ничего не стоит — он детерминированно выводится из
 * `creature_id`, ровно как аватар-идентикон.
 *
 * Форма — из языка арены: прямые сегменты, прямые углы, ничего органического.
 * Тела — стопки примитивов, пол — размеченный белый, и глиф обязан читаться
 * как техническая маркировка, а не как герб.
 */

const mulberry = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hash = (s) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
};

/**
 * SVG-путь глифа для id. Возвращает строку `<path>`-ов на сетке 130×130.
 *
 * Три-пять сегментов на решётке 5×5, плюс одна засечка. Больше — и на 26 px
 * в строке лестницы это превращается в кляксу; меньше — и глифы становятся
 * похожи друг на друга.
 */
export function glyphPaths(id, { size = 130, color = '#8fd4e4' } = {}) {
  const rnd = mulberry(hash(String(id)));
  const G = 5;
  const pad = size * 0.24;
  const step = (size - pad * 2) / (G - 1);
  const P = (i, j) => [pad + i * step, pad + j * step];

  const n = 3 + Math.floor(rnd() * 3);
  const used = new Set();
  const segs = [];
  let cur = [Math.floor(rnd() * G), Math.floor(rnd() * G)];
  for (let k = 0; k < n; k++) {
    const dirs = [[1, 0], [0, 1], [1, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [-1, -1]];
    const d = dirs[Math.floor(rnd() * dirs.length)];
    const len = 1 + Math.floor(rnd() * 3);
    const nx = Math.max(0, Math.min(G - 1, cur[0] + d[0] * len));
    const ny = Math.max(0, Math.min(G - 1, cur[1] + d[1] * len));
    const key = `${cur[0]},${cur[1]}-${nx},${ny}`;
    if ((nx !== cur[0] || ny !== cur[1]) && !used.has(key)) {
      used.add(key);
      segs.push([P(cur[0], cur[1]), P(nx, ny)]);
    }
    cur = [nx, ny];
  }

  const stroke = size * 0.055;
  const parts = segs.map(([a, b]) =>
    `<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)} L${b[0].toFixed(1)} ${b[1].toFixed(1)}" `
    + `stroke="${color}" stroke-width="${stroke.toFixed(1)}" stroke-linecap="square" fill="none" opacity="0.82"/>`);

  /* Одна точка-узел: она даёт глифу «начало» и делает зеркальные пары
     различимыми — без неё две противоположные ломаные читаются одинаково. */
  const [ax, ay] = segs.length ? segs[0][0] : P(2, 2);
  parts.push(`<rect x="${(ax - stroke).toFixed(1)}" y="${(ay - stroke).toFixed(1)}" `
    + `width="${(stroke * 2).toFixed(1)}" height="${(stroke * 2).toFixed(1)}" fill="${color}" opacity="0.95"/>`);
  return parts.join('');
}

/** Готовый inline-SVG для списков и карточек. */
export function glyphSvg(id, { size = 34, color = '#8fd4e4' } = {}) {
  return `<svg viewBox="0 0 130 130" width="${size}" height="${size}" aria-hidden="true">`
    + `${glyphPaths(id, { color })}</svg>`;
}

/**
 * Плита бойца на арене: глиф вместо PNG-эмблемы.
 *
 * Раньше здесь лежали два растровых ассета (`emblem-laser.png`,
 * `emblem-gorilla2.png`) — они рисовали ВИД, а не существо, и на продуктовой
 * арене, где дерутся именованные существа игроков, показывали бы одну и ту
 * же картинку всем. Заодно это 1.6 МБ, которые F6 считает.
 */
export const glyph = {
  install() {
    addEventListener('airena:match', (e) => {
      const m = e.detail;
      for (const [side, key] of [['oct', 'octopus'], ['gor', 'gorilla']]) {
        const g = document.querySelector(`.glyph[data-side="${side}"]`);
        if (!g) continue;
        const id = m.ids?.[key] || m.names?.[key] || key;
        g.innerHTML = glyphPaths(id, { color: side === 'oct' ? '#8fd4e4' : '#e8b077' });
      }
    });
  },
  paths: glyphPaths,
  svg: glyphSvg,
};
