#!/usr/bin/env node
/**
 * The invariants. `node tools/test.mjs`
 *
 * Not a coverage exercise — every case here is one that has either already gone
 * wrong in this repo or is invisible while it goes wrong. The runaway-brain
 * case is the clearest of the second kind: a 200-round sweep that silently
 * hangs on round 137 costs more than every other check combined, and nothing
 * about watching a fight would reveal it.
 */

import { readFileSync } from 'node:fs';

import { compileBrain } from '../src/brain/host.js';
import {
  ARENA_HALF, BUILD_AXES, BUILD_BUDGET, DEFAULT_BUILD, OBSTACLES, SKILLS,
  SPAWN_RADIUS, SUDDEN_DEATH_AT, buildCost, normalizeBuild, statsOf,
} from '../src/core/config.js';
/* `inCone`, `segBox` и `DT` отсюда ушли: первый жил в единственной проверке,
   которую съел архетип (см. группу `simulation`), а два других не читались
   уже давно — мёртвый импорт врёт про то, что файл проверяет. */
import { dist2, hasLos } from '../src/core/geom.js';
import { createNav } from '../src/core/nav.js';
import { runMatch } from '../src/core/match.js';
import { createWorld, perceive, snapshot, step, SOLIDS, burnRate } from '../src/core/sim.js';
/* Кит собирается прямо здесь: инвариант навеса — про доставку из грамматики,
   а её нет ни у одного из двух эталонов §1. */
import { compileKit } from '../src/skills/compile.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ''}`); }
};
const group = (n) => console.log(`\n${n}`);

/*
 * Слева — СТОРОНА арены, справа — ИМЯ ФАЙЛА болванки на диске.
 *
 * Стороны зовутся `blue` и `orange`: это цвета и ничего больше, видов нет.
 * А `brains/stub/octopus.js` и `.../gorilla.js` — файлы эталонной фикстуры
 * §1, у них свои имена, и переименование их поехало бы в §16.
 */
const STUB_FILE = { blue: 'octopus', orange: 'gorilla' };
const stub = (side) => compileBrain(
  readFileSync(new URL(`../brains/stub/${STUB_FILE[side]}.js`, import.meta.url), 'utf8'), side);
const stubs = () => ({ blue: stub('blue'), orange: stub('orange') });

// ---------------------------------------------------------------------------
group('arena');

{
  const key = (o) => `${o.x.toFixed(3)}|${o.z.toFixed(3)}|${o.hx}|${o.hz}`;
  const set = new Set(OBSTACLES.map(key));
  const asym = OBSTACLES.filter((o) => !set.has(key({ x: -o.x, z: -o.z, hx: o.hx, hz: o.hz })));
  ok('layout is symmetric under a 180 degree rotation', asym.length === 0, `asymmetric: ${asym.map((o) => o.id)}`);
}
{
  // every spawn angle the seeded picker can choose must be legal for both bodies
  let bad = 0;
  for (let s = 1; s <= 200; s++) {
    const w = createWorld(s);
    for (const id of ['blue', 'orange']) {
      const f = w.fighters[id], r = f.def.radius;
      if (Math.abs(f.x) > ARENA_HALF - r || Math.abs(f.z) > ARENA_HALF - r) bad++;
      for (const o of OBSTACLES) {
        if (Math.abs(f.x - o.x) < o.hx + r && Math.abs(f.z - o.z) < o.hz + r) bad++;
      }
    }
    const a = w.fighters.blue, b = w.fighters.orange;
    if (Math.abs(dist2(a.x, a.z, b.x, b.z) - SPAWN_RADIUS * 2) > 0.01) bad++;
    // and they must be looking at each other
    const toB = Math.atan2(b.x - a.x, b.z - a.z);
    const toA = Math.atan2(a.x - b.x, a.z - b.z);
    if (Math.abs(((a.heading - toB + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.01) bad++;
    if (Math.abs(((b.heading - toA + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.01) bad++;
  }
  ok('200 seeded spawn pairs are legal, diametric and face each other', bad === 0, `${bad} violations`);
}
{
  /*
   * САМОЕ ТОЛСТОЕ ТЕЛО, КОТОРОЕ ВООБЩЕ МОЖНО КУПИТЬ, а не радиус архетипа.
   *
   * Здесь стоял `FIGHTERS.gorilla.radius` — радиус более крупной из двух
   * записей, то есть худший случай в мире, где тел ровно два. Тел теперь
   * сколько угодно, и худший случай — верхняя граница оси. Она к тому же
   * БЕСПЛАТНА: цена радиуса убывает (`axisCost`, `inverse`), так что тело
   * шириной в потолок — не экзотика, а самый дешёвый способ потратить
   * бюджет, и через арену оно обязано проходить.
   *
   * Тем же радиусом берётся отступ при выборе точек: точка, в которую такое
   * тело просто не помещается, про связность не говорит ничего.
   */
  const fattest = BUILD_AXES.radius.max;
  const nav = createNav(SOLIDS, ARENA_HALF, fattest);
  let unreachable = 0, tested = 0;
  for (let i = 0; i < 400; i++) {
    const rand = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
    const p = (n) => (rand(n) * 2 - 1) * (ARENA_HALF - fattest);
    const a = { x: p(1), z: p(2) }, b = { x: p(3), z: p(4) };
    const inside = (q) => OBSTACLES.some((o) => Math.abs(q.x - o.x) < o.hx + fattest && Math.abs(q.z - o.z) < o.hz + fattest);
    if (inside(a) || inside(b)) continue;
    tested++;
    if (!nav.path(a.x, a.z, b.x, b.z)) unreachable++;
  }
  ok(`navigation connects every free pair (${tested} sampled)`, unreachable === 0, `${unreachable} unreachable`);
}
{
  let bad = 0;
  for (let i = 0; i < 300; i++) {
    const r = (n) => ((Math.sin(i * 3.1 + n) * 12345.678) % 1 + 1) % 1;
    const a = { x: (r(1) * 2 - 1) * ARENA_HALF, z: (r(2) * 2 - 1) * ARENA_HALF };
    const b = { x: (r(3) * 2 - 1) * ARENA_HALF, z: (r(4) * 2 - 1) * ARENA_HALF };
    if (hasLos(a.x, a.z, b.x, b.z, SOLIDS) !== hasLos(b.x, b.z, a.x, a.z, SOLIDS)) bad++;
  }
  ok('line of sight is symmetric', bad === 0, `${bad} asymmetric pairs`);
}

// ---------------------------------------------------------------------------
group('simulation');

{
  const a = runMatch(stubs(), { seed: 4242 });
  const b = runMatch(stubs(), { seed: 4242 });
  ok('a match is reproducible from its seed', JSON.stringify(a.result.log) === JSON.stringify(b.result.log));
  const c = runMatch(stubs(), { seed: 4243 });
  ok('a different seed is a different match', JSON.stringify(a.result.log) !== JSON.stringify(c.result.log));
}
{
  let overlaps = 0, outside = 0, insideBlock = 0;
  const brains = stubs();
  const world = createWorld(99);
  const think = (id, p, api) => brains[id].tick(p, api);
  while (!world.done && world.tick < 2400) {
    step(world, think);
    const o = world.fighters.blue, g = world.fighters.orange;
    if (dist2(o.x, o.z, g.x, g.z) < o.def.radius + g.def.radius - 0.02) overlaps++;
    for (const f of [o, g]) {
      if (Math.abs(f.x) > ARENA_HALF - f.def.radius + 0.02) outside++;
      if (Math.abs(f.z) > ARENA_HALF - f.def.radius + 0.02) outside++;
      for (const b of OBSTACLES) {
        const qx = Math.max(b.x - b.hx, Math.min(f.x, b.x + b.hx));
        const qz = Math.max(b.z - b.hz, Math.min(f.z, b.z + b.hz));
        if (dist2(f.x, f.z, qx, qz) < f.def.radius - 0.03) insideBlock++;
      }
    }
  }
  ok('bodies never overlap each other', overlaps === 0, `${overlaps} ticks overlapping`);
  ok('bodies never leave the arena', outside === 0, `${outside} ticks outside`);
  ok('bodies never enter a block', insideBlock === 0, `${insideBlock} ticks inside`);
}
{
  // The dash must report the velocity it is actually travelling at. It used to
  // report zero, which made the viewer play a standing pose at 15 m/s and told
  // the opposing brain a charging fighter was stationary.
  const world = createWorld(7);
  let sawDash = false, reportedZero = false, maxReported = 0;
  const think = (id, p, api) => {
    if (id === 'orange') { api.faceAt(p.enemy.x, p.enemy.z); api.use('charge'); }
    else api.move(0, 0);
    return null;
  };
  for (let i = 0; i < 300 && !world.done; i++) {
    step(world, think);
    const g = world.fighters.orange;
    if (g.act && g.act.phase === 'dash') {
      sawDash = true;
      const rv = Math.hypot(g.rvx, g.rvz);
      maxReported = Math.max(maxReported, rv);
      if (rv < 1) reportedZero = true;
    }
  }
  ok('a charge actually dashes', sawDash);
  ok('the dash reports its true speed', sawDash && !reportedZero && maxReported > 12,
    `max reported ${maxReported.toFixed(1)} m/s, expected ~${SKILLS.charge.dashSpeed}`);
}
{
  /*
   * ── ЗАМЕНА ИНВАРИАНТА, УМЕРШЕГО ВМЕСТЕ С АРХЕТИПОМ ────────────────────
   *
   * Здесь стояло «smash connects exactly when dist <= range + both radii»,
   * и оба радиуса читались из `FIGHTERS.gorilla` и `FIGHTERS.octopus` — из
   * двух литеральных записей, одинаковых в каждом бою. Записей больше нет, и
   * одного числа «докуда достаёт удар» у игры не существует: радиус
   * принадлежит СУЩЕСТВУ, и у каждой пары он свой. Проверять «ту самую»
   * длину стало нечего.
   *
   * Свойство при этом не потеряно, и потому слот освободился честно:
   * `tools/checkbehaviour.mjs` меряет и длину удара, и ширину конуса
   * двоичным поиском на живой симуляции и сверяет с тем, что промпт сказал
   * мозгу. Это строго сильнее, чем сверка `inCone` с той же арифметикой,
   * записанной строкой ниже.
   *
   * Слот отдан правилу, у которого другого дома в гейтах нет. «Любые
   * характеристики» держатся ровно на одном: у каждой оси есть цена, а у
   * набора — потолок. Если перебор проходит молча, свобода превращается в
   * «999 здоровья»; если сжатие не доезжает до мира — существо дерётся не
   * теми числами, которые ему выдали. Проверяются обе половины: арифметика
   * и её доставка в бой.
   */
  const greedy = Object.fromEntries(
    Object.entries(BUILD_AXES).map(([k, a]) => [k, a.inverse ? a.min : a.max]),
  );
  const norm = normalizeBuild(greedy);
  const world = createWorld(77, { builds: { blue: greedy, orange: DEFAULT_BUILD } });
  const axes = Object.keys(BUILD_AXES);
  const same = (a, b) => axes.every((k) => Math.abs(a[k] - b[k]) < 1e-9);
  const served = world.fighters.blue.def;
  ok('a build over budget is squeezed, and the fight uses the squeezed numbers',
    buildCost(greedy) > BUILD_BUDGET
      && norm.squeezed > 0 && norm.cost <= BUILD_BUDGET + 1e-9
      && served.hp < greedy.hp
      && same(served, statsOf(greedy))
      /* И вторая сторона держит СВОЁ телосложение: сжатие соседа её не
         касается, потому что числа больше не принадлежат стороне арены. */
      && same(world.fighters.orange.def, statsOf(DEFAULT_BUILD)),
    `cost ${buildCost(greedy)} -> ${norm.cost} at a budget of ${BUILD_BUDGET}; `
    + `hp asked ${greedy.hp}, served ${served.hp}`);
}
{
  const t0 = burnRate(SUDDEN_DEATH_AT - 0.1), t1 = burnRate(SUDDEN_DEATH_AT + 10);
  ok('nothing burns before sudden death', t0 === 0);
  ok('the burn rises after it', t1 > 0);
  // and a pair that refuses to fight must still be resolved
  const passive = { tick: () => null };
  const { result } = runMatch({ blue: passive, orange: passive }, { seed: 3 });
  ok('two fighters who do nothing are still killed by the arena',
    result.reason === 'kill' || result.reason === 'double-ko', `reason was ${result.reason} at ${result.seconds}s`);
  ok('and it happens well before the backstop clock', result.seconds < 62, `${result.seconds}s`);
}
{
  const world = createWorld(11);
  let bad = 0;
  const think = (id, p, api) => {
    if (id === 'blue') { api.use('blink', Math.cos(p.t * 3), Math.sin(p.t * 5)); api.move(1, 0); }
    return null;
  };
  for (let i = 0; i < 900 && !world.done; i++) {
    step(world, think);
    const f = world.fighters.blue;
    if (Math.abs(f.x) > ARENA_HALF - f.def.radius + 0.02) bad++;
    for (const b of OBSTACLES) {
      const qx = Math.max(b.x - b.hx, Math.min(f.x, b.x + b.hx));
      const qz = Math.max(b.z - b.hz, Math.min(f.z, b.z + b.hz));
      if (dist2(f.x, f.z, qx, qz) < f.def.radius - 0.05) bad++;
    }
  }
  ok('a blink never lands inside a block or outside the arena', bad === 0, `${bad} bad landings`);
}
{
  /*
   * ── НАВЕС ПОПАДАЕТ ТОЛЬКО ТУДА, КУДА УПАЛ ─────────────────────────────
   *
   * Два свойства одной механики, и до 04.09 симуляция нарушала ОБА сразу:
   * навес проверялся тем же тестом близости, что и болт, на каждом тике
   * полёта. То есть попадал по дороге, пролетая НАД целью, а долетев до
   * конца жизни — уходил в промах и не применял ничего. Замер на этой самой
   * расстановке до правки: враг в 5 м, дальность заказана 12 м — удар в
   * точке z=3.4, 26 урона, промахов ноль. Заказ основателя дословно: «не
   * должна попадать, если пролетает над существом… попадает только туда,
   * куда попала».
   *
   * Проверяется расстановкой, а не арифметикой: обе половины — про то, что
   * делает `tickProjectiles` за 38 тиков полёта, и повторить это формулой
   * в тесте значит проверить формулу, а не симуляцию.
   */
  const kit = compileKit([
    { delivery: 'lob', effects: ['damage'], element: 'ember' },
    { delivery: 'self', effects: ['heal'], element: 'frost' },
    { delivery: 'bolt', effects: ['damage'], element: 'kinetic' },
  ]);
  /**
   * Один навес: синий стоит в (x0,0) курсом на +Z, оранжевый — в (x0,gap).
   * `ask` — дальность, которую называет мозг; `null` — не называет вовсе.
   */
  const shot = (gap, ask, x0 = 0) => {
    const w = createWorld(5, { kits: { blue: kit.defs, orange: kit.defs } });
    const B = w.fighters.blue, O = w.fighters.orange;
    B.x = x0; B.z = 0; B.heading = 0; B.wantHeading = 0;
    O.x = x0; O.z = gap; O.heading = Math.PI; O.wantHeading = Math.PI;
    const hp0 = O.hp;
    let fired = false;
    const cast = [], impacts = [];
    const think = (id, p, api) => {
      api.stop();
      if (id !== 'blue') return null;
      api.face(0, 1);
      if (!fired && api.ready('k1')) fired = ask === null ? api.use('k1') : api.use('k1', ask);
      return null;
    };
    for (let i = 0; i < 150 && !w.done; i++) {
      /* Цель стоит: инвариант про прицел, а не про её манёвр. */
      O.x = x0; O.z = gap; O.vx = 0; O.vz = 0;
      step(w, think);
      for (const e of w.fx) {
        if (e.kind === 'lob') cast.push(e);
        if (e.kind === 'impact' && e.who === 'blue') impacts.push(e);
      }
    }
    return {
      damage: hp0 - O.hp,
      misses: w.log.filter((e) => e.type === 'miss' && e.who === 'blue' && e.skill === 'k1').length,
      cast: cast[0] || null,
      impact: impacts[0] || null,
    };
  };

  const over = shot(5, 12);
  ok('a lob does not touch what it flies over',
    over.damage === 0 && over.misses === 1 && over.impact === null,
    `урон ${over.damage}, промахов ${over.misses}, ударов ${over.impact ? 1 : 0}`);

  const onto = shot(5, null);
  ok('a lob with no range asked lands on the enemy',
    onto.damage > 0 && onto.misses === 0 && Math.abs(onto.cast.aim - 5) < 0.1,
    `урон ${onto.damage}, промахов ${onto.misses}, aim ${onto.cast && onto.cast.aim}`);

  /* Точка в записи — ТА ЖЕ, по которой считает сим: вьювер кладёт лужу по
     ней, и разойтись им нельзя (кислота уже уезжала за край арены). */
  ok('the lob record carries the point the sim resolved at',
    onto.impact && Math.hypot(onto.impact.x - onto.cast.x1, onto.impact.z - onto.cast.z1) < 0.01,
    onto.impact ? `удар (${onto.impact.x}, ${onto.impact.z}) против записи (${onto.cast.x1}, ${onto.cast.z1})` : 'удара не было');

  /* Судья приёмки нашёл радиационный навес, лежавший три кадра подряд по ту
     сторону стены. Зажим — по границам поля из config.js. */
  const far = shot(6, 15, ARENA_HALF - 4);
  ok('a lob never lands outside the arena',
    far.cast && Math.abs(far.cast.x1) <= ARENA_HALF && Math.abs(far.cast.z1) <= ARENA_HALF,
    far.cast ? `точка (${far.cast.x1}, ${far.cast.z1}) при половине поля ${ARENA_HALF}` : 'каста не было');
}

// ---------------------------------------------------------------------------
group('sandbox');

{
  const runaway = compileBrain('function think(p, api) { while (true) {} }', 'runaway');
  const t0 = Date.now();
  const { result } = runMatch({ blue: runaway, orange: stub('orange') }, { seed: 5 });
  const wall = Date.now() - t0;
  /*
   * Проверяется ПРИЧИНА остановки, а не секундомер.
   *
   * Здесь стояло `wall < 30000`, и это делало тест зависящим от загрузки
   * машины: на занятой он падал, хотя код вёл себя правильно — ровно та же
   * болезнь, от которой мы лечили сам движок (A1: предел по инструкциям, а не
   * по времени). Тест, который меряет часы, меряет соседей по машине.
   *
   * Настоящее свойство: цикл останавливает ТОПЛИВО, и бой доигрывается.
   * Стена по времени остаётся вторым условием с запасом в четыре минуты —
   * от настоящего зависания, а не от загрузки.
   */
  const byFuel = result.log.some((e) => e.type === 'fault' && /fuel|топлив/i.test(String(e.error)));
  ok('a brain in an infinite loop does not hang the match',
    result.seconds > 0 && byFuel && wall < 240000,
    `${wall} ms, остановлен ${byFuel ? 'топливом' : 'чем-то другим'}`);
  ok('and its faults are counted', result.blue.faults > 0, `${result.blue.faults} faults`);
  ok('and the other fighter still wins', result.winner === 'orange', `winner ${result.winner}`);
}
{
  const thrower = compileBrain('function think(p, api) { null.x; }', 'thrower');
  const { result } = runMatch({ blue: thrower, orange: stub('orange') }, { seed: 5 });
  ok('a brain that throws is switched off, not crashed through', result.blue.faults >= 1 && result.seconds > 0);
}
{
  const greedy = compileBrain('function think(p, api) { for (let i = 0; i < 5000; i++) api.ray(1, 0, 5); }', 'greedy');
  const { result } = runMatch({ blue: greedy, orange: stub('orange') }, { seed: 5 });
  const first = result.log.find((e) => e.type === 'fault' && e.who === 'blue');
  ok('exhausting the perception budget raises rather than lying',
    !!first && /perception calls/.test(String(first.error)), first ? first.error : 'no fault raised');
}
{
  const w = createWorld(1);
  const p = perceive(w, 'blue');
  const required = ['t', 'dt', 'tick', 'timeLeft', 'burn', 'burnStartsIn', 'self', 'enemy', 'arena', 'events', 'mem'];
  const missing = required.filter((k) => !(k in p));
  ok('perception carries every field the prompt documents', missing.length === 0, `missing: ${missing}`);
  const selfReq = ['x', 'z', 'y', 'vx', 'vz', 'speed', 'heading', 'hp', 'maxHp', 'radius', 'maxSpeed',
    'turnRate', 'alive', 'airborne', 'stunned', 'invulnerable', 'busy', 'casting', 'cooldowns', 'skills'];
  ok('and every documented self field', selfReq.every((k) => k in p.self),
    `missing: ${selfReq.filter((k) => !(k in p.self))}`);
  ok('and enemy.visible is the same test the beam performs',
    typeof p.enemy.visible === 'boolean' && p.enemy.visible === hasLos(p.self.x, p.self.z, p.enemy.x, p.enemy.z, SOLIDS));
}
{
  // `reset()` is what the sweep tooling uses instead of recompiling. If it left
  // one byte of state behind, every balance number in the project would be
  // measured on matches that depend on the ones before them.
  const so = readFileSync(new URL('../brains/stub/octopus.js', import.meta.url), 'utf8');
  const sg = readFileSync(new URL('../brains/stub/gorilla.js', import.meta.url), 'utf8');
  const fresh = [];
  for (let r = 0; r < 6; r++) {
    fresh.push(JSON.stringify(runMatch({ blue: compileBrain(so, 'o'), orange: compileBrain(sg, 'g') }, { seed: 3000 + r }).result.log));
  }
  const reused = { blue: compileBrain(so, 'o'), orange: compileBrain(sg, 'g') };
  const recycled = [];
  for (let r = 0; r < 6; r++) {
    reused.blue.reset(); reused.orange.reset();
    recycled.push(JSON.stringify(runMatch(reused, { seed: 3000 + r }).result.log));
  }
  ok('reset() is indistinguishable from a fresh compile',
    fresh.every((v, i) => v === recycled[i]),
    `${fresh.filter((v, i) => v !== recycled[i]).length} of 6 matches differed`);
}
{
  // memory must not survive a fresh compile, or 200 seeded rounds stop being 200 samples
  const counter = compileBrain('let n = 0;\nfunction think(p, api) { n++; api.say(String(n)); }', 'counter');
  const a = runMatch({ blue: counter, orange: stub('orange') }, { seed: 8 });
  const b = runMatch({ blue: compileBrain('let n = 0;\nfunction think(p, api) { n++; api.say(String(n)); }', 'counter'), orange: stub('orange') }, { seed: 8 });
  ok('a freshly compiled brain starts from a clean slate',
    JSON.stringify(a.result.log) === JSON.stringify(b.result.log));
}

// ---------------------------------------------------------------------------
group('wire');

{
  const w = createWorld(2);
  const s = snapshot(w);
  const need = ['t', 'tick', 'over', 'winner', 'blue', 'orange', 'fx'];
  ok('a snapshot carries what the viewer reads', need.every((k) => k in s), `missing: ${need.filter((k) => !(k in s))}`);
  const fn = ['x', 'y', 'z', 'vx', 'vz', 'h', 'hp', 'maxHp', 'alive', 'act', 'phase', 'actPhase', 'inv', 'stun', 'say', 'cd'];
  ok('and every per-fighter field', fn.every((k) => k in s.blue), `missing: ${fn.filter((k) => !(k in s.blue))}`);
  ok('and it is JSON-safe', JSON.parse(JSON.stringify(s)).tick === s.tick);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
