#!/usr/bin/env node
/**
 * КОНТАКТНЫЙ ЛИСТ: кадры прогона — в одну картинку.
 *
 * Прогон снимков кладёт сотни PNG по 1600×900, и смотреть их по одному —
 * это смотреть на ракурс и момент, а не на эффект (та же причина, по которой
 * `vfxshot` снимает сеткой). Судить «не захламляет ли экран» можно ТОЛЬКО
 * рядом: захламление — это про то, что осталось на полу от предыдущего, а не
 * про то, как выглядит пик.
 *
 * Лист строится сеткой «строка — стихия или форма, столбец — момент», с
 * подписями, и обрезается по АРЕНЕ (строки 120–790 полного кадра): HUD и
 * панель дева к эффекту отношения не имеют и съедают половину листа.
 *
 *   node tools/vfxsheet.mjs --in=reports/vfx/clutter-after --out=reports/vfx/sheets/all.png
 *   node tools/vfxsheet.mjs --in=... --kind=zone            только зоны
 *   node tools/vfxsheet.mjs --in=... --el=acid --cam=top
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  if (h) return h.slice(n.length + 3);
  return process.argv.includes(`--${n}`) ? true : d;
};

const IN = resolve(ROOT, String(arg('in', 'reports/vfx/clutter-after')));
const OUT = resolve(ROOT, String(arg('out', 'reports/vfx/sheets/sheet.png')));
const PLAN = `${OUT}.plan.json`;
const KIND = String(arg('kind', '') || '');
const EL = String(arg('el', '') || '');
const CAM = String(arg('cam', 'broadcast'));
const COLS = Number(arg('cols', 0));

const files = readdirSync(IN).filter((f) => f.endsWith('.png'));
/* Имя кадра: `<el>-<kind>-t<момент>-<ракурс>.png` (см. `vfxshot.mjs`). */
const parsed = files.map((f) => {
  /* Имя формы может нести атом через точку (`impact.stun`) — прогон
     перебирает подписи ударов и статусов (`--atom`/`--effect`). */
  const m = f.match(/^([a-z]+)-([a-z]+(?:\.[a-z]+)?)-t([\d_]+)-([a-z]+)\.png$/);
  return m ? { f, el: m[1], kind: m[2], t: m[3].replace('_', '.'), cam: m[4] } : null;
}).filter(Boolean)
  .filter((x) => (!KIND || x.kind === KIND) && (!EL || x.el === EL) && (!CAM || x.cam === CAM));

if (!parsed.length) { console.error('  подходящих кадров нет'); process.exit(1); }

const moments = [...new Set(parsed.map((x) => x.t))].sort((a, b) => Number(a) - Number(b));
/*
 * КЛЕТКА ВНЕ ГРАММАТИКИ ПОДПИСЫВАЕТСЯ, А НЕ МОЛЧИТ.
 *
 * Прогон снимает декартово произведение стихия×форма, а правило E1 разрешает
 * стихии не всякую доставку: у времени нет луча, у лазера нет зоны. Пустой
 * кадр такой пары читается как «эффект сломан», и судья первого круга честно
 * так и написал. Легальность спрашивается у самого реестра — не у копии
 * списка здесь.
 */
const { ELEMENTS } = await import('../src/skills/registry.js');
const legal = (el, kind) => {
  const e = ELEMENTS[el];
  const base = String(kind).split('.')[0];
  if (!e || !Array.isArray(e.forms)) return true;
  /*
   * СТЕНА — ЭТО ЭФФЕКТ, А НЕ ДОСТАВКА, и в `ELEMENTS[el].forms` её нет и быть
   * не может: `wall` живёт в таблице эффектов (`registry.js`, klass WORLD).
   * Лист поэтому метил КАЖДУЮ строку стены «вне грамматики» — то есть
   * сообщал судье, что настоящая игровая форма нелегальна. Поймал это судья
   * контактных форм круга приёмки. Тот же список, что у удара и статуса:
   * это не доставки, и спрашивать о них список доставок бессмысленно.
   */
  if (['impact', 'status', 'charge', 'wall'].includes(base)) return true;
  return e.forms.includes(base);
};
const rows = [...new Set(parsed.map((x) => `${x.el}/${x.kind}${legal(x.el, x.kind) ? '' : ' · вне грамматики'}`))];
const cols = COLS || moments.length;

mkdirSync(dirname(OUT), { recursive: true });

const py = `
import sys, json
from PIL import Image, ImageDraw
plan = json.load(open(${JSON.stringify(PLAN)}))
CELL_W, CELL_H = 420, 236          # арена 1600x670 -> 420x176 плюс подпись
ARENA = (0, 120, 1600, 790)        # строки арены (docs/VFX-HANDOFF: HUD мигает на луче)
rows, moments, indir = plan['rows'], plan['moments'], plan['dir']
W = CELL_W * len(moments) + 150
H = CELL_H * len(rows) + 30
sheet = Image.new('RGB', (W, H), (26, 27, 30))
d = ImageDraw.Draw(sheet)
for ci, t in enumerate(moments):
    d.text((150 + ci * CELL_W + 8, 8), f't = {t} s', fill=(200, 205, 215))
for ri, row in enumerate(rows):
    y = 30 + ri * CELL_H
    d.text((8, y + CELL_H // 2 - 6), row, fill=(230, 232, 238))
    for ci, t in enumerate(moments):
        name = plan['cells'].get(f'{row}|{t}')
        if not name: continue
        im = Image.open(f'{indir}/{name}').convert('RGB').crop(ARENA)
        im.thumbnail((CELL_W - 8, CELL_H - 14))
        sheet.paste(im, (150 + ci * CELL_W + 4, y + 4))
sheet.save(${JSON.stringify(OUT)})
print(f'{W}x{H}')
`;

const cells = {};
for (const x of parsed) cells[`${x.el}/${x.kind}${legal(x.el, x.kind) ? '' : ' · вне грамматики'}|${x.t}`] = x.f;
const { writeFileSync } = await import('node:fs');
/*
 * ПЛАН ЛОЖИТСЯ РЯДОМ С ЛИСТОМ, А НЕ ВО ВХОДНОЙ КАТАЛОГ.
 *
 * Здесь стоял общий `.sheet.json` ВНУТРИ каталога кадров: два запуска по
 * одному каталогу (а ракурсов три, и снимают их обычно разом) затирали план
 * друг друга и молча отдавали лист чужого ракурса. Поймал это на себе судья
 * зон круга приёмки: его лист с `--cam=top` вышел байт-в-байт равным
 * broadcast, и он честно об этом написал вместо того, чтобы поверить листу.
 * Имя плана теперь производится от ИМЕНИ ЛИСТА, которое у каждого запуска
 * своё, — столкнуться нечему.
 */
writeFileSync(PLAN, JSON.stringify({ rows, moments, dir: IN, cells }));

const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr || r.stdout); process.exit(1); }
console.log(`  лист ${r.stdout.trim()} → ${OUT}  (${rows.length} строк × ${cols} моментов, ракурс ${CAM})`);
