/**
 * F6 — гейт первого кадра. Цифра, а не декларация.
 *
 * §F6 обещает игроку первый кадр боя за десять секунд по p75. Обещание,
 * которое никто не меряет, — это не обещание, а надежда, и D16 записал это
 * прямо: «цифра без замера не выполняется, а декларируется». Этот файл
 * существовал только в двух ссылках — в D16 и в комментарии `src/client/app.js`,
 * обе утверждали, что он работает, и обе были неправдой. Такая ссылка хуже
 * отсутствия проверки: она закрывает вопрос, не отвечая на него.
 *
 * ЧТО ИМЕННО МЕРИТСЯ. Не время — оно зависит от канала и машины зрителя, и
 * замерить его здесь честно нельзя. Мерится ВЕС: сколько байт браузер обязан
 * скачать и разобрать, прежде чем нарисует первый кадр. Вес — то, чем мы
 * управляем, и единственное, что мы можем испортить в один коммит.
 *
 * Бюджет выведен из обещания, а не выбран: на 10 Мбит/с (медленный домашний
 * канал 2026 года, p75 для мобильного LTE) десять секунд — это около 12 МБ,
 * из которых половина уходит на установление соединений, разбор и первый
 * рендер WebGPU. Отсюда 6 МБ несжатого и 1.8 МБ сжатого на КРИТИЧЕСКИЙ путь —
 * то, без чего кадра не будет.
 *
 * Что в критический путь НЕ входит: тела существ (грузятся после первого
 * кадра, `swapBody`), шрифты (текст рисуется системным, пока они едут),
 * дев-инструменты (в бандл игрока не попадают — это проверяет checkscope).
 *
 *   node tools/checkboot.mjs
 *   node tools/checkboot.mjs --list    показать вклад каждого файла
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIST = process.argv.includes('--list');

/** Потолки критического пути. */
export const RAW_BUDGET = 6 * 1024 * 1024;
export const GZIP_BUDGET = 1.8 * 1024 * 1024;

const ENTRY = 'src/client/index.html';
const EXT = new Set(['.js', '.mjs', '.html', '.css']);
const MOUNTS = [
  ['/viewer/', 'src/viewer'],
  ['/skills/', 'src/skills'],
  ['/vendor/', 'node_modules/three/build'],
  ['/bodies/', 'bodies'],
  ['/fonts/', 'src/client/fonts'],
  ['/', 'src/client'],
];
const LINK = /(?:import\s*\(\s*[`'"]([^`'"$]+)|from\s*['"]([^'"]+)|<script[^>]+src=["']([^"']+)|<link[^>]+href=["']([^"']+)|import\s+['"]([^'"]+))/g;

function resolveRef(ref, from) {
  if (!ref || /^https?:/.test(ref)) return null;
  const clean = ref.split('?')[0];
  if (clean.startsWith('.')) return resolve(dirname(from), clean);
  if (clean === 'three') return join(ROOT, 'node_modules/three/build/three.webgpu.min.js');
  if (clean === 'three/tsl') return join(ROOT, 'node_modules/three/build/three.tsl.min.js');
  for (const [pre, dir] of MOUNTS) if (clean.startsWith(pre)) return join(ROOT, dir, clean.slice(pre.length));
  return null;
}

/**
 * Файлы критического пути.
 *
 * Тела исключены нарочно: первый кадр рисуется телами архетипов, а
 * сгенерированное тело подменяется уже во время боя (`swapBody`), так что в
 * ожидание первого кадра оно не входит.
 */
function critical() {
  const seen = new Set();
  const queue = [join(ROOT, ENTRY)];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f) || !EXT.has(extname(f))) continue;
    if (relative(ROOT, f).startsWith('bodies')) continue;
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    seen.add(f);
    for (const m of text.matchAll(LINK)) {
      const ref = m[1] || m[2] || m[3] || m[4] || m[5];
      const next = resolveRef(String(ref || '').replace(/['"]/g, ''), f);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen];
}

const files = critical();
let raw = 0; let gz = 0;
const rows = [];
for (const f of files) {
  let buf;
  try { buf = readFileSync(f); } catch { continue; }
  const g = gzipSync(buf).length;
  raw += buf.length; gz += g;
  rows.push({ f: relative(ROOT, f), raw: buf.length, gz: g });
}
rows.sort((a, b) => b.gz - a.gz);

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} МБ`;
console.log(`\n  F6 — вес критического пути (${files.length} файлов)\n`);
if (LIST) {
  for (const r of rows.slice(0, 14)) {
    console.log(`  ${r.f.padEnd(46)} ${mb(r.raw).padStart(9)}  →  ${mb(r.gz).padStart(9)} сжатым`);
  }
  console.log('');
}
console.log(`  несжатым  ${mb(raw).padStart(9)}  из ${mb(RAW_BUDGET)}`);
console.log(`  сжатым    ${mb(gz).padStart(9)}  из ${mb(GZIP_BUDGET)}`);

const bad = [];
if (raw > RAW_BUDGET) bad.push(`несжатый вес ${mb(raw)} больше потолка ${mb(RAW_BUDGET)}`);
if (gz > GZIP_BUDGET) bad.push(`сжатый вес ${mb(gz)} больше потолка ${mb(GZIP_BUDGET)}`);

if (bad.length) {
  console.log('\n  ПРОВАЛ:');
  for (const b of bad) console.log(`    ${b}`);
  console.log('\n  Самое тяжёлое:');
  for (const r of rows.slice(0, 5)) console.log(`    ${r.f}  ${mb(r.gz)} сжатым`);
  console.log('');
  process.exitCode = 1;
} else {
  console.log(`\n  ДЕРЖИТ — до первого кадра ${mb(gz)} сжатым, запас ${mb(GZIP_BUDGET - gz)}\n`);
}
