#!/usr/bin/env node
/**
 * СКОЛЬКО ЭФФЕКТА ОСТАЁТСЯ НА ЭКРАНЕ — В ПРОЦЕНТАХ АРЕНЫ.
 *
 * ── зачем ─────────────────────────────────────────────────────────────────
 *
 * Заказ основателя 04.09 звучит как вкус — «не должно захламлять экран» — но
 * проверяется он числом: сколько пикселей арены на кадре ОТЛИЧАЕТСЯ от той же
 * арены без единого эффекта. Один и тот же ракурс, одна и та же стойка бойцов,
 * один и тот же фон; всё, чем кадры разнятся, — это и есть эффект.
 *
 * Три вещи здесь не случайны, и каждая уже однажды дала ложный вердикт.
 *
 * БАЗА — ЭТО `nil/charge`, А НЕ ПУСТОЙ КАДР ЛЮБОЙ ФОРМЫ. `--el=nil` не даёт
 * пустоты: стихии без модуля падают на ШТАТНЫЙ силуэт, и он рисует у луча
 * полную пятилентовую трубу, у стены — серую решётку. Единственная форма, у
 * которой штатный путь возвращает false, — `charge` (замер в
 * docs/VFX-HANDOFF.md: `charge`, `bolt` и `jump` попиксельно совпадают и дают
 * ноль различий между собой).
 *
 * МЕРИТСЯ АРЕНА, А НЕ КАДР: строки 120–790. HUD вспыхивает на касте луча, и
 * замер по всему кадру раздувается примерно на треть — на этом уже один раз
 * построили цифру, которая на 62 % была артефактом.
 *
 * ПОРОГ РАЗЛИЧИЯ 12 ПО МАКСИМАЛЬНОМУ КАНАЛУ. Ниже — шум сглаживания и
 * дрожание теней между кадрами; на пустой паре кадров он даёт 0.0 %.
 *
 *   node tools/vfxclean.mjs --in=reports/vfx/clutter-after
 *   node tools/vfxclean.mjs --in=... --base=reports/vfx/nilbase/nil-charge-t0_30-broadcast.png
 *   node tools/vfxclean.mjs --in=... --at=4.00        только поздний момент
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  if (h) return h.slice(n.length + 3);
  return process.argv.includes(`--${n}`) ? true : d;
};
const IN = resolve(ROOT, String(arg('in', 'reports/vfx/clutter-after')));
const AT = String(arg('at', '') || '');
const PORT = Number(arg('port', 56650));
let BASE = arg('base', null);

/*
 * База снимается ТУТ ЖЕ, если её не дали: держать её в отчёте, снятом полгода
 * назад другим билдом, — это мерить против чужой сборки. Один каст `nil/charge`
 * стоит меньше минуты.
 */
const BASE_DIR = resolve(ROOT, 'reports/vfx/nilbase-auto');
if (!BASE) {
  const want = join(BASE_DIR, 'nil-charge-t0_30-broadcast.png');
  if (!existsSync(want)) {
    console.log('  базы нет — снимаю nil/charge (единственная штатно пустая форма)…');
    const r = spawnSync(join(ROOT, 'tools/vfxshot-lock.sh'),
      [`--port=${PORT}`, '--el=nil', '--kind=charge', '--cams=broadcast,top', '--moments=0.30', `--out=${BASE_DIR}`],
      { stdio: 'inherit' });
    if (r.status !== 0) { console.error('  снять базу не удалось'); process.exit(1); }
  }
  BASE = want;
}
BASE = resolve(ROOT, String(BASE));

const files = readdirSync(IN).filter((f) => f.endsWith('.png')).filter((f) => !AT || f.includes(`t${AT.replace('.', '_')}`));
if (!files.length) { console.error('  кадров нет'); process.exit(1); }

/* Ракурс базы обязан совпадать с ракурсом кадра, иначе меряется поворот
   камеры. Берём базу того же имени ракурса, если она снята. */
const baseFor = (cam) => {
  /*
   * Перечисление — про СУФФИКС САМОЙ БАЗЫ, а не про запрошенный ракурс: базу
   * обычно передают кадром трансляции, и здесь её имя переписывается под
   * нужный глаз. `low` добавлен для полноты (базу могут передать и низким
   * кадром); на выбор для `low`-кадров это не влияло — тот путь работал.
   *
   * ЧТО ДЕЙСТВИТЕЛЬНО ЛОМАЕТ ЗАМЕР: база, снятая ДРУГОЙ камерой. Когда низкий
   * глаз переставили (он смотрел на кастера, а зоны ложатся на цель), старая
   * база перестала быть пустым кадром ТОГО ЖЕ вида, и среднее по всем формам
   * подскочило с 0.26 до 23.67 % — числа такого порядка означают, что
   * сравниваются два разных кадра пустой арены, а не эффект с пустотой.
   * Базу надо переснимать вместе с камерами.
   */
  const alt = BASE.replace(/-(broadcast|low|top|side|cross)\.png$/, `-${cam}.png`);
  return existsSync(alt) ? alt : BASE;
};

const py = `
import sys, json
from PIL import Image
import numpy as np
ARENA = (0, 120, 1600, 790)
THRESH = 12
plan = json.loads(sys.stdin.read())
def load(p):
    return np.asarray(Image.open(p).convert('RGB').crop(ARENA)).astype(int)
cache = {}
out = []
for row in plan['rows']:
    b = cache.get(row['base'])
    if b is None:
        b = load(row['base']); cache[row['base']] = b
    a = load(row['file'])
    if a.shape != b.shape:
        out.append({**row, 'pct': None}); continue
    d = np.abs(a - b).max(axis=-1)
    pct = float((d >= THRESH).sum()) / d.size * 100.0
    out.append({'name': row['name'], 'el': row['el'], 'kind': row['kind'], 't': row['t'], 'cam': row['cam'], 'pct': round(pct, 3)})
print(json.dumps(out))
`;

const rows = [];
for (const f of files) {
  const m = f.match(/^([a-z]+)-([a-z]+(?:\.[a-z]+)?)-t([\d_]+)-([a-z]+)\.png$/);
  if (!m) continue;
  rows.push({ name: f, el: m[1], kind: m[2], t: m[3].replace('_', '.'), cam: m[4], file: join(IN, f), base: baseFor(m[4]) });
}

const r = spawnSync('python3', ['-c', py], { input: JSON.stringify({ rows }), encoding: 'utf8', maxBuffer: 64e6 });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
const res = JSON.parse(r.stdout);

/* Свод: по стихии и форме, отдельной колонкой каждый момент. */
const moments = [...new Set(res.map((x) => x.t))].sort((a, b) => Number(a) - Number(b));
const keys = [...new Set(res.map((x) => `${x.el}/${x.kind}`))].sort();
console.log(`\n  ДОЛЯ АРЕНЫ, ЗАНЯТАЯ ЭФФЕКТОМ, %  (база ${BASE.split('/').slice(-2).join('/')}, порог 12)\n`);
console.log(`  ${'форма'.padEnd(26)}${moments.map((t) => `t=${t}`.padStart(10)).join('')}`);
const late = [];
for (const k of keys) {
  const cells = moments.map((t) => {
    const v = res.filter((x) => `${x.el}/${x.kind}` === k && x.t === t).map((x) => x.pct).filter((x) => x != null);
    return v.length ? (v.reduce((s, x) => s + x, 0) / v.length) : null;
  });
  console.log(`  ${k.padEnd(26)}${cells.map((c) => (c == null ? '—' : c.toFixed(2)).padStart(10)).join('')}`);
  const last = cells[cells.length - 1];
  if (last != null) late.push({ k, last });
}
late.sort((a, b) => b.last - a.last);
console.log(`\n  БОЛЬШЕ ВСЕГО ОСТАЁТСЯ НА ПОСЛЕДНЕМ МОМЕНТЕ (t=${moments[moments.length - 1]}):`);
for (const x of late.slice(0, 8)) console.log(`    ${x.k.padEnd(26)} ${x.last.toFixed(2)} %`);
const mean = late.reduce((s, x) => s + x.last, 0) / Math.max(1, late.length);
console.log(`\n  среднее по всем формам на последнем моменте: ${mean.toFixed(2)} %\n`);
