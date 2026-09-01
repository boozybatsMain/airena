/**
 * Камеру не дёргает — гейт по этапу 5.
 *
 * `tools/checkframing.mjs` доказывает, что боец В КАДРЕ, и это другой вопрос.
 * Камера может держать обоих идеально и при этом рывками: решатель кадрирования
 * догоняет цель, дёргает дистанцию на скачке, переставляет азимут через
 * короткую сторону — кадр всё время правильный и всё время неприятный.
 * «Чтобы её не дёргало, всё было гладко и плавно» — это требование о
 * ПРОИЗВОДНЫХ, а не о положении, и мерить его надо отдельно.
 *
 * ЧТО МЕРЯЕТСЯ. Состояние камеры за кадр — дистанция, высота, азимут — берётся
 * из того же прогона, что и кадрирование: `checkframing --dump` пишет весь
 * след, здесь он читается. Второго решателя не заводится, второй симуляции
 * тоже: это те же матчи, тот же прибор, другой вопрос.
 *
 * Считается ВТОРАЯ разность по времени — ускорение состояния. Первая (скорость)
 * ничего не говорит: камера обязана двигаться. Дёрганье — это когда скорость
 * меняется резко, и на глаз это ровно оно.
 *
 * Азимут разворачивается через ±π: скачок с +179° на −179° — это два градуса
 * поворота, а в наивной разности 358, и без разворота гейт ловил бы каждый
 * проход камеры через заднюю точку.
 *
 * ГЕЙТ СТОИТ НА 99-м ПРОЦЕНТИЛЕ, А НЕ НА МАКСИМУМЕ, и это не смягчение.
 *
 * Максимум по дистанции — 19 тысяч м/с² при медиане 3. Я решил, что виноват
 * аварийный отъезд камеры, ограничил его скорость — максимум не сдвинулся
 * (19312). Замер отверг объяснение и показал настоящее: рывки стоят там, где
 * боец ТЕЛЕПОРТИРУЕТСЯ. Мигание двигает осьминога на 7.5 м за один тик, боец
 * выходит за край кадра, и камера обязана ответить в тот же кадр — иначе
 * `checkframing` теряет бойца, а это худшая из двух бед.
 *
 * То есть хвост распределения принадлежит не камере, а игре, и гейт на
 * максимуме мерил бы, как часто бойцы мигают. Хвост печатается, но не судится.
 *
 * Судится 99-й процентиль: он про то, как камера ведёт себя ПОЧТИ ВСЕГДА, и он
 * отзывчив — потолок угловой скорости, добавленный в `main.js`, сдвинул его с
 * 18.7 на 17.7 рад/с², и это видно. Потолки взяты на 1.4 от сегодняшнего
 * значения: смысл гейта не «камера идеальна», а «камера не стала дёргаться
 * заметно сильнее, чем в день, когда это признали приемлемым».
 *
 *   node tools/checkcamera.mjs
 *   node tools/checkcamera.mjs --trail=<файл от checkframing --dump>
 *   node tools/checkcamera.mjs --verbose
 *   node tools/checkcamera.mjs --calibrate    напечатать новые пороги
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const CALIBRATE = process.argv.includes('--calibrate');

/*
 * Потолки на вторую разность, в единицах за секунду в квадрате.
 * Сняты 30.08 на 18 матчах × 2 видовых окна: 99-й процентиль × 1.4
 * (200/143.2 = 1.40, 20/14.2 = 1.41, 25/17.7 = 1.41).
 */
const CEIL = {
  dist: Number(process.env.AIRENA_CAM_DIST || 200),
  height: Number(process.env.AIRENA_CAM_HEIGHT || 20),
  az: Number(process.env.AIRENA_CAM_AZ || 25),
};

/*
 * СЛЕД БЕРЁТСЯ ГОТОВЫЙ, ЕСЛИ ОН ЕСТЬ.
 *
 * Прогон кадрирования — 36 реплеев и 52 тысячи кадров, около семи секунд. Гейт вызывал его
 * ВТОРОЙ раз просто чтобы получить тот же самый след, и `npm test` платил за
 * одно и то же дважды.
 *
 * `--trail=<файл>` берёт дамп, который сосед уже написал (`checkframing
 * --dump=…`). Файла нет — гейт не молчит и не считает по пустому: он его
 * требует или запускает соседа сам, и оба случая напечатаны.
 */
const trailArg = process.argv.find((a) => a.startsWith('--trail='))?.slice(8) || null;
console.log('\n  ПЛАВНОСТЬ КАМЕРЫ\n');

let file = trailArg;
let dir = null;
if (!file) {
  dir = mkdtempSync(join(tmpdir(), 'airena-cam-'));
  file = join(dir, 'trail.json');
  try {
    execFileSync(process.execPath, [join(ROOT, 'tools/checkframing.mjs'), `--dump=${file}`],
      { cwd: ROOT, stdio: VERBOSE ? 'inherit' : 'ignore' });
  } catch {
    /* Кадрирование упало — значит мерить плавность нечего и незачем: сначала
       боец должен быть в кадре. Гейт не подменяет собой соседний. */
    console.log('  ✗ checkframing не прошёл — плавность не мерится до него');
    rmSync(dir, { recursive: true, force: true });
    process.exit(1);
  }
} else if (!existsSync(file)) {
  console.log(`  ✗ следа нет: ${file}. Запусти сначала: node tools/checkframing.mjs --dump=${file}`);
  process.exit(1);
}

const runs = JSON.parse(readFileSync(file, 'utf8'));
if (dir) rmSync(dir, { recursive: true, force: true });

const unwrap = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/*
 * Склейка между матчами в замер не идёт: камера там ОБЯЗАНА прыгнуть, ради
 * этого в `main.js` и написан `snap` — иначе новый бой начинался бы с кадра
 * предыдущего. Распознаётся по данным, которые в следе уже есть: время матча
 * сбрасывается, время рендера идёт дальше.
 *
 * На сегодняшних прогонах таких кадров НОЛЬ — каждый прогон это один матч, —
 * и проверка оставлена не про запас, а потому что она отвергла моё первое
 * объяснение хвоста. Я решил, что рывки стоят на склейках (они шли примерно
 * раз в четыре секунды), и ошибся: склеек в данных не было вовсе, а
 * четырёхсекундный ритм оказался кулдауном мигания.
 */
const jerk = { dist: [], height: [], az: [] };
let frames = 0; let cuts = 0;
for (const run of runs) {
  const tr = run.trail || [];
  for (let i = 2; i < tr.length; i++) {
    const dt1 = tr[i - 1].rc - tr[i - 2].rc;
    const dt2 = tr[i].rc - tr[i - 1].rc;
    if (!(dt1 > 1e-4) || !(dt2 > 1e-4)) continue;
    if (tr[i].t < tr[i - 1].t || tr[i - 1].t < tr[i - 2].t) { cuts++; continue; }
    frames++;
    for (const k of ['dist', 'height']) {
      const v1 = (tr[i - 1][k] - tr[i - 2][k]) / dt1;
      const v2 = (tr[i][k] - tr[i - 1][k]) / dt2;
      jerk[k].push(Math.abs(v2 - v1) / ((dt1 + dt2) / 2));
    }
    const a1 = unwrap(tr[i - 2].az, tr[i - 1].az) / dt1;
    const a2 = unwrap(tr[i - 1].az, tr[i].az) / dt2;
    jerk.az.push(Math.abs(a2 - a1) / ((dt1 + dt2) / 2));
  }
}

const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0; };

let bad = 0;
console.log(`  ${runs.length} прогонов, ${frames} кадров с историей, ${cuts} выброшено как склейки\n`);
if (!frames) { console.log('  ✗ след пуст — мерить нечего'); process.exit(1); }

for (const k of ['dist', 'height', 'az']) {
  const arr = jerk[k];
  const p99 = q(arr, 0.99);
  const pass = p99 <= CEIL[k];
  if (!pass) bad++;
  const unit = k === 'az' ? 'рад/с²' : 'м/с²';
  console.log(`  ${pass ? '✓' : '✗'} ${k.padEnd(7)} медиана ${q(arr, 0.5).toFixed(1)}  99% ${p99.toFixed(1)} при потолке ${CEIL[k]} ${unit}`
    + `   (хвост до ${Math.max(...arr).toFixed(0)} — ответ на телепорт, не судится)`);
}

if (CALIBRATE) {
  /*
   * Запас 1.4, а не 2: гейт, вокруг которого оставили вдвое места, пропустит
   * любое ухудшение, которое не дотянуло до двойки. Гейт нужен, чтобы ловить
   * регрессию, а не чтобы всегда быть зелёным.
   */
  console.log('\n  новые потолки (99-й процентиль × 1.4):');
  for (const k of ['dist', 'height', 'az']) console.log(`    ${k}: ${Math.ceil(q(jerk[k], 0.99) * 1.4)}`);
}

console.log(bad ? `\n  ПРОВАЛ: ${bad}\n` : '\n  ДЕРЖИТ\n');
process.exit(bad ? 1 : 0);
