/**
 * Рисование прошорканных рамок по разметке — с мемоизацией.
 *
 * `wornTex` синхронно растеризует канвас и возвращает data-URL. На десяти
 * элементах боевого HUD это незаметно; на строке лестницы, которых на экране
 * два десятка, это блокирующий кадр каждый раз. Поэтому ключ — вся подпись
 * рамки, а не «примерно та же»: две панели одного размера с разными сидами
 * обязаны отличаться, иначе износ станет узором.
 */

import { wornTex, rectPts, CY } from './worn.js';

const cache = new Map();
const MAX = 240;

function tex(w, h, seed, color, shapes, opts) {
  const key = `${w}x${h}:${seed}:${color}:${JSON.stringify(opts)}:${shapes.length}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = wornTex(w, h, seed, color, shapes, opts);
  /* Простое вытеснение по возрасту: Map хранит порядок вставки. */
  if (cache.size >= MAX) cache.delete(cache.keys().next().value);
  cache.set(key, url);
  return url;
}

/**
 * Пройти по поддереву и покрасить всё, что просило рамку.
 *
 * Разметка объявляет намерение (`data-frame`), а не результат: размер элемента
 * известен только после раскладки, и вычислять его в момент создания узла
 * значит вычислять его до того, как он существует.
 */
export function paintFrames(root) {
  if (!root) return;
  const els = root.querySelectorAll('[data-frame]');
  for (const el of els) {
    let spec;
    try { spec = JSON.parse(el.dataset.frame || '{}'); } catch { spec = {}; }
    const target = el.querySelector(':scope > .fr') || el;
    const r = el.getBoundingClientRect();
    const w = Math.round(spec.w || r.width);
    const h = Math.round(spec.h || r.height);
    if (w < 8 || h < 8) continue;
    const seed = spec.seed ?? 7;
    const color = spec.color || CY;
    const cut = spec.cut ?? 16;
    const pts = spec.kind === 'tile'
      ? rectPts(w, h, 3.5, 0, '')
      : [[0.8, 0.8], [w - cut, 0.8], [w - 0.8, cut], [w - 0.8, h - 0.8], [0.8, h - 0.8]];
    target.style.setProperty('--wf', `url(${tex(w, h, seed, color, [pts],
      { base: spec.kind === 'tile' ? 0.8 : 1.1, jitter: 0.6, ticks: 2 })})`);
    /* Один раз. Повторная покраска на каждом рендере — это тот же
       блокирующий кадр, только реже и внезапнее. */
    delete el.dataset.frame;
    el.dataset.framed = '1';
  }
}

/** Перекрасить всё заново — после изменения размера окна. */
export function repaintAll(root = document) {
  for (const el of root.querySelectorAll('[data-framed]')) {
    const target = el.querySelector(':scope > .fr') || el;
    target.style.removeProperty('--wf');
  }
}
