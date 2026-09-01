/**
 * Гейт: сгенерированное тело обязано ДВИГАТЬСЯ, а не только собираться.
 *
 * `tools/checkbody.mjs` проверяет, что тело безопасно и что `build()` вернул
 * сцену. Этого мало, и разница видна на цифрах: из шести сгенерированных тел,
 * прошедших все стены, два падали в `pose()` на первом же кадре, а одно не
 * двигалось ни в одной ситуации. То есть существо доезжало до арены,
 * собиралось, вставало — и стояло столбом весь бой или роняло позу в первом
 * же кадре.
 *
 * Причина в разделении труда: `build()` зовут один раз при загрузке и его
 * ошибку видно сразу, а `pose()` зовут шестьдесят раз в секунду из цикла
 * рендера, где падение проглатывается (`loadbody.js` гасит позу навсегда,
 * чтобы не сыпать исключениями). Тихая деградация — правильное поведение в
 * бою и негодное на приёмке: тело, которое не шевелится, ничем не отличается
 * от тела, которое шевелится, пока на него не посмотришь.
 *
 * Здесь на него смотрят. Каждое тело строится и прогоняется по всем
 * ситуациям из `packages/forge` (стояние, ходьба, бег, прыжок, все действия,
 * смерть), и проверяется ДВА свойства:
 *
 *   1. поза не бросает ни в одной ситуации;
 *   2. поза что-то МЕНЯЕТ — между «стоит» и «бежит» геометрия обязана
 *      отличаться. Тело, у которого `pose()` есть и ничего не делает,
 *      формально исправно и на экране мертво.
 *
 *   node tools/checkpose.mjs                  все тела из базы и с диска
 *   node tools/checkpose.mjs --only=bodies    только рукописные
 *   node tools/checkpose.mjs --verbose        показать каждую ситуацию
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';

import { openDb } from '../src/server/db.js';
import { analyseBody } from '../src/server/sandbox/bodyrules.js';
import { buildBody } from '../src/viewer/loadbody.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : (process.argv.includes(`--${n}`) ? true : d);
};
const VERBOSE = !!arg('verbose', false);
const ONLY = arg('only', null);

/**
 * Ситуации, в которых тело обязано себя вести.
 *
 * Список повторяет контракт `pose(s)` из `packages/forge`: локомоция задаётся
 * скоростью и фазой шага, действия — именем и фазой. Берём крайние точки, а не
 * все двадцать пять: цель — поймать падение и неподвижность, а не измерить
 * анимацию.
 */
const SITUATIONS = [
  ['стоит', { t: 0, dt: 1 / 60, speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0 }],
  ['идёт', { t: 1, dt: 1 / 60, speed: 1.2, stride: 0.3, turn: 0, grounded: true, health: 1, action: null, phase: 0 }],
  ['бежит', { t: 2, dt: 1 / 60, speed: 5.5, stride: 0.8, turn: 0, grounded: true, health: 1, action: null, phase: 0 }],
  ['поворачивает', { t: 3, dt: 1 / 60, speed: 2, stride: 0.5, turn: 1, grounded: true, health: 1, action: null, phase: 0 }],
  ['в воздухе', { t: 4, dt: 1 / 60, speed: 3, stride: 0.5, turn: 0, grounded: false, health: 1, action: 'jump', phase: 0.5 }],
  ['ранен', { t: 5, dt: 1 / 60, speed: 1, stride: 0.2, turn: 0, grounded: true, health: 0.2, action: null, phase: 0 }],
];
for (const a of ['attack', 'fire', 'hit', 'block', 'signal', 'land', 'die']) {
  for (const ph of [0, 0.5, 1]) {
    SITUATIONS.push([`${a} ${ph}`, { t: 6, dt: 1 / 60, speed: 0, stride: 0, turn: 0, grounded: true, health: a === 'die' ? 0 : 1, action: a, phase: ph }]);
  }
}

/** Отпечаток позы: сумма мировых координат вершинных центров. Меняется — значит двигается. */
function fingerprint(root) {
  root.updateMatrixWorld(true);
  let acc = 0; let n = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    n++;
    acc += o.matrixWorld.elements[12] * 1.1 + o.matrixWorld.elements[13] * 2.3 + o.matrixWorld.elements[14] * 3.7;
    acc += o.matrixWorld.elements[0] * 0.7 + o.matrixWorld.elements[5] * 0.9;
  });
  return { acc: Math.round(acc * 1e4) / 1e4, meshes: n };
}

function collect() {
  const out = [];
  if (ONLY !== 'db') {
    for (const f of readdirSync(join(ROOT, 'bodies')).filter((x) => x.endsWith('.js'))) {
      out.push({ name: `bodies/${f}`, src: readFileSync(join(ROOT, 'bodies', f), 'utf8'), trusted: true });
    }
  }
  if (ONLY === 'bodies') return out;
  const dbFile = join(ROOT, 'data/airena.db');
  if (existsSync(dbFile)) {
    const db = openDb(dbFile);
    const rows = db.prepare(`SELECT name, body_source FROM creature
                             WHERE body_safe IS NOT NULL AND state = 'active'`).all();
    /* Уникальные по содержимому: библиотека носит одно тело на многих. */
    const seen = new Set();
    for (const r of rows) {
      const key = `${r.body_source.length}:${r.body_source.slice(0, 200)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: `существо «${r.name}»`, src: r.body_source, trusted: false });
    }
    db.close();
  }
  return out;
}

const bodies = collect();
console.log(`\n  ПОЗЫ: ${bodies.length} различных тел, по ${SITUATIONS.length} ситуаций\n`);

let bad = 0;
for (const b of bodies) {
  const a = b.trusted ? { ok: true, source: b.src } : analyseBody(b.src);
  if (!a.ok) {
    console.log(`  ✗ ${b.name.padEnd(34)} не проходит стены: ${a.problems[0].message.slice(0, 44)}`);
    bad++; continue;
  }
  let root;
  try {
    /* trusted: поза не гасится после первой ошибки — см. ниже. */
    root = buildBody(THREE, TSL, a.source, { trusted: true });
  } catch (e) {
    console.log(`  ✗ ${b.name.padEnd(34)} build() упал: ${String(e.message).slice(0, 46)}`);
    bad++; continue;
  }
  const pose = root.userData && root.userData.pose;
  if (typeof pose !== 'function') {
    console.log(`  ✗ ${b.name.padEnd(34)} нет userData.pose — тело не может двигаться`);
    bad++; continue;
  }

  /*
   * Тело строится ДОВЕРЕННЫМ, чтобы поза не гасилась после первого падения.
   *
   * `loadbody.js` намеренно выключает позу навсегда, поймав первую ошибку:
   * в бою это правильно — одно кривое тело не должно сыпать исключениями
   * шестьдесят раз в секунду. Но на приёмке это скрывает всё, кроме первой
   * ситуации, и отчёт получался «падает в ? ситуациях».
   */
  const threw = [];
  const prints = [];
  for (const [label, s] of SITUATIONS) {
    try {
      pose(s);
      prints.push(fingerprint(root).acc);
      if (VERBOSE) console.log(`      ${label.padEnd(14)} ${prints[prints.length - 1]}`);
    } catch (e) {
      threw.push(`${label}: ${String(e.message).slice(0, 40)}`);
      prints.push(null);
    }
  }
  const silent = threw.length ? null : root.userData.poseFailed;
  const distinct = new Set(prints.filter((x) => x !== null)).size;

  if (threw.length || silent) {
    console.log(`  ✗ ${b.name.padEnd(34)} поза падает в ${threw.length || '?'} из ${SITUATIONS.length}: ${threw[0] || silent}`);
    if (VERBOSE) for (const t of threw.slice(0, 6)) console.log(`        ${t}`);
    bad++;
  } else if (distinct < 2) {
    console.log(`  ✗ ${b.name.padEnd(34)} поза не меняет ничего: все ${prints.length} ситуаций дают одну геометрию`);
    bad++;
  } else {
    console.log(`  ✓ ${b.name.padEnd(34)} ${distinct} различных поз из ${prints.length}`);
  }
}

console.log(`\n  ${bad ? `ПРОВАЛ: ${bad} из ${bodies.length} тел` : `ДЕРЖИТ — все ${bodies.length} тел двигаются`}\n`);
process.exitCode = bad ? 1 : 0;
