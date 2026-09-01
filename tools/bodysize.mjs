/**
 * Насколько тело видно на экране.
 *
 * Вьювер подгоняет ГОРИЗОНТАЛЬНЫЙ след тела под диаметр коллайдера, потому что
 * с коллайдером спорить нельзя: «они соприкоснулись» и «выглядит, будто
 * соприкоснулись» должны быть одним утверждением. Но масштаб равномерный, а
 * пропорции модель выбирает сама — и вертикаль после этого не ограничена
 * ничем. Ревью утверждало разброс от 0.13 м до 4.65 м; здесь это проверяется
 * на телах, которые модели действительно написали, а не на предположении.
 *
 *   node tools/bodysize.mjs [--db data/airena.db]
 *   node tools/bodysize.mjs --backfill    записать цену показа в базу
 *
 * `--backfill` существует потому, что цену считает ПРИЁМКА и кладёт в
 * `body_draws`, а тела старше этой колонки её не имеют. Сервер их отдаёт (не
 * знаем цены — не повод отказать), и заполнить колонку надо отдельно, здесь,
 * а не в процессе, который отвечает игрокам.
 */
import { DatabaseSync } from 'node:sqlite';
import * as THREE from 'three/webgpu';
import { buildBody } from '../src/viewer/loadbody.js';
import * as TSL from 'three/tsl';
import { drawCost } from '../src/server/forge/body.js';
import { statsOf } from '../src/core/config.js';

const dbFile = process.argv.includes('--db') ? process.argv[process.argv.indexOf('--db') + 1] : 'data/airena.db';
const db = new DatabaseSync(dbFile);
/*
 * Читается `build_json`, а не `archetype` и `size`.
 *
 * Диаметр, под который вьювер жмёт меш, — это диаметр КОЛЛАЙДЕРА, а коллайдер
 * теперь принадлежит существу: раньше он собирался как «радиус архетипа ×
 * множитель размера», то есть тело мерилось по чужой записи, помноженной на
 * одну свою ось. Записей нет, множителя нет, радиус лежит прямо в
 * телосложении и оплачен очками бюджета.
 *
 * Колонка спрашивается через `pragma_table_info`, а не берётся на веру.
 * Миграции накатывает `openDb`, то есть СЕРВЕР; этот инструмент открывает файл
 * напрямую и на базе, которую сервер ещё не поднимал, просто падал бы с «no
 * such column». Инструмент замера, умирающий от возраста базы, не измеряет
 * ничего — он читает то, что есть, и говорит, чего не хватило.
 */
const hasBuild = !!db.prepare("select 1 AS y from pragma_table_info('creature') where name = 'build_json'").get();
const rows = db.prepare(`select id, name, body_safe${hasBuild ? ', build_json' : ''} from creature where body_safe is not null`).all();
if (!hasBuild) {
  console.log('  в этой базе ещё нет колонки build_json (её добавляет миграция при старте сервера):');
  console.log('  тела меряются против ТЕЛОСЛОЖЕНИЯ ПО УМОЛЧАНИЮ, а не против своего.');
}


const out = [];
for (const r of rows) {
  let root;
  try { root = buildBody(THREE, TSL, r.body_safe, { trusted: false }); }
  catch (e) { out.push({ id: r.id, name: r.name, fail: e.message.slice(0, 50) }); continue; }

  const box = new THREE.Box3().setFromObject(root);
  const s = new THREE.Vector3(); box.getSize(s);
  const foot = Math.max(s.x, s.z) || 1;
  /* Через `statsOf`, а не через свой разбор: границы, потолок бюджета и
     сжатие перебора — правила боя, и цифра, посчитанная здесь по другим
     правилам, описывала бы тело, которого на арене не будет. Кривой или
     пустой `build_json` даёт телосложение по умолчанию — ровно то же, что
     получит это существо в бою. */
  let raw = null;
  try { raw = r.build_json ? JSON.parse(r.build_json) : null; } catch { raw = null; }
  const d = statsOf(raw).radius * 2;
  const scale = d / foot;

  /*
   * Меши и треугольники считаются здесь же, потому что это ОДИН вопрос
   * «сколько стоит показать это тело», просто с двух сторон: сколько раз
   * рендерер должен обратиться к железу и сколько геометрии он при этом
   * прогонит. Число мешей — это число вызовов отрисовки, и оно бьёт по кадрам
   * сильнее, чем треугольники: 6720 мешей это 6720 вызовов на кадр.
   */
  /* Счёт ТОТ ЖЕ, что на приёмке: `drawCost` учитывает и точки, и линии, и
     спрайты. Здесь стоял свой обход только по мешам — то есть колонка,
     заполненная этим инструментом, была бы посчитана другим правилом, чем та,
     что приходит с приёмки. На четырёх телах в базе оба счёта совпали, и
     расхождение осталось бы латентным ровно до первого тела с точками. */
  const meshes = drawCost(root);
  let tris = 0; let instanced = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (o.isInstancedMesh) instanced += o.count || 0;
    const g = o.geometry;
    const n = g.index ? g.index.count : (g.attributes?.position?.count || 0);
    tris += Math.floor(n / 3) * (o.isInstancedMesh ? (o.count || 1) : 1);
  });
  out.push({ id: r.id, name: r.name, meshes, tris, instanced, d, h: s.y * scale, w: s.x * scale, deep: s.z * scale, low: box.min.y * scale });
}

const ok = out.filter((r) => !r.fail);
const hs = ok.map((r) => r.h).sort((a, b) => a - b);
const ratios = ok.map((r) => r.h / r.d).sort((a, b) => a - b);
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];

/*
 * РАЗЛИЧНЫХ тел, а не строк. В базе 27 существ с `body_safe`, но исходников
 * среди них всего четыре: остальные — те же тела, доставшиеся нескольким
 * существам. Печатать «27 тел» значит умножать выборку на семь и называть
 * это статистикой.
 */
const uniq = new Set(rows.map((r) => r.body_safe)).size;
if (process.argv.includes('--backfill')) {
  let wrote = 0; let heavy = 0;
  const { DRAW_MAX } = await import('../src/server/forge/body.js');
  const upd = db.prepare('UPDATE creature SET body_draws = ? WHERE id = ?');
  for (const r of out) {
    if (r.fail || !Number.isFinite(r.meshes)) continue;
    upd.run(r.meshes, r.id);
    wrote++;
    if (r.meshes > DRAW_MAX) heavy++;
  }
  console.log(`\nзаписано цен: ${wrote}, из них выше потолка ${DRAW_MAX}: ${heavy}`);
  /* Потолок — правило ПРИЁМКИ, а не выдачи: тела, принятые до его появления,
     сервер по-прежнему отдаёт, и почему — написано в `src/server/api.js`
     (отказ стоил внешности половине населения ради непроверенной пользы).
     Эта строка их СЧИТАЕТ, а не отбирает. */
  console.log('Потолок действует на приёмке; принятые раньше тела сервер отдаёт как есть.');
  console.log('Строка выше — сколько таких в базе, а не сколько отобрано.\n');
}

console.log(`строк с телом: ${out.length}, различных исходников: ${uniq}, собралось: ${ok.length}, упало: ${out.length - ok.length}`);
if (uniq < 8) console.log(`ВЫБОРКА МАЛА: ${uniq} различных тел — числа ниже описывают их, а не «тела вообще».`);
console.log(`высота, м:  мин ${hs[0]?.toFixed(2)}  25% ${q(hs, 0.25)?.toFixed(2)}  медиана ${q(hs, 0.5)?.toFixed(2)}  75% ${q(hs, 0.75)?.toFixed(2)}  макс ${hs.at(-1)?.toFixed(2)}`);
console.log(`высота/диаметр коллайдера: мин ${ratios[0]?.toFixed(2)}  медиана ${q(ratios, 0.5)?.toFixed(2)}  макс ${ratios.at(-1)?.toFixed(2)}`);
console.log(`пустых (0 мешей): ${ok.filter((r) => !r.meshes).length}`);
console.log(`ниже 0.5 диаметра (блин): ${ok.filter((r) => r.h / r.d < 0.5).length}   выше 3 диаметров (столб): ${ok.filter((r) => r.h / r.d > 3).length}`);
const ms = ok.map((r) => r.meshes).sort((a, b) => a - b);
const ts = ok.map((r) => r.tris).sort((a, b) => a - b);
console.log(`мешей (вызовов отрисовки): мин ${ms[0]}  медиана ${q(ms, 0.5)}  макс ${ms.at(-1)}`);
console.log(`треугольников:             мин ${ts[0]}  медиана ${q(ts, 0.5)}  макс ${ts.at(-1)}`);
for (const r of ok.slice().sort((a, b) => b.meshes - a.meshes).slice(0, 3)) {
  console.log(`  тяжёлое ${String(r.name).slice(0, 22).padEnd(22)} ${r.meshes} мешей, ${r.tris} треугольников`);
}
for (const r of out.filter((x) => x.fail)) console.log(`  упало ${r.name}: ${r.fail}`);
for (const r of ok.slice().sort((a, b) => a.h / a.d - b.h / b.d).slice(0, 3)) console.log(`  низкое  ${String(r.name).slice(0, 24).padEnd(24)} h=${r.h.toFixed(2)} d=${r.d.toFixed(2)} h/d=${(r.h / r.d).toFixed(2)}`);
for (const r of ok.slice().sort((a, b) => b.h / b.d - a.h / a.d).slice(0, 3)) console.log(`  высокое ${String(r.name).slice(0, 24).padEnd(24)} h=${r.h.toFixed(2)} d=${r.d.toFixed(2)} h/d=${(r.h / r.d).toFixed(2)}`);
