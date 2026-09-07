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
  ARENA_HALF, BUILD_AXES, BUILD_BUDGET, DEFAULT_BUILD, OBSTACLES, SAY_EVERY, SKILLS,
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
import { DELIVERIES as GRAMMAR_DELIVERIES, EFFECTS as GRAMMAR_EFFECTS } from '../src/skills/registry.js';
import { KNOCKBACK_DRAG } from '../src/core/config.js';
const HEAL_ATOM = GRAMMAR_EFFECTS.heal;

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
group('grammar mechanics');

/*
 * The four rules the 07.09 overhaul added to the grammar, each one checked in
 * a controlled world rather than argued: the aim point, the immunity window,
 * the grammar interrupt, and the one-per-caster caps on fields and walls.
 * Every one of them is a promise the prompt makes to a mind.
 */
const mech = (kitA, kitB, thinkA, thinkB, opts = {}) => {
  const a = compileKit(kitA, opts), b = compileKit(kitB, opts);
  const w = createWorld(11, { kits: { blue: a.defs, orange: b.defs } });
  const think = (id, p, api) => (id === 'blue' ? thinkA : thinkB)(p, api, w);
  return { w, think };
};
const place = (f, x, z, heading) => {
  f.x = x; f.z = z; f.px = x; f.pz = z; f.heading = heading; f.wantHeading = heading;
  f.vx = 0; f.vz = 0; f.kx = 0; f.kz = 0; f.y = 0;
};
const LOB = [{ delivery: 'lob', effects: ['damage'], element: 'ember' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }];
const ZONE = [{ delivery: 'zone', effects: ['damage'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }];
const STUNBOLT = [{ delivery: 'bolt', effects: ['stun'], element: 'void' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }];
const BEAM = [{ delivery: 'beam', effects: ['damage'], element: 'laser' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }];
const STUNCONE = [{ delivery: 'cone', effects: ['stun'], element: 'kinetic' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }];
const WALL = [{ delivery: 'self', effects: ['wall'], element: 'kinetic' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }];
const idle = (p, api) => { api.move(0, 0); };

{
  // A mortar ordered at a point lands on the point, whatever the facing.
  const { w, think } = mech(LOB, BEAM, (p, api) => {
    if (api.ready('k1')) api.use('k1', { x: -3, z: 4 });
  }, idle);
  place(w.fighters.blue, 3, -2, 0); place(w.fighters.orange, 12, 12, Math.PI);
  let landed = null, aim = null;
  for (let i = 0; i < 120 && !landed; i++) {
    step(w, think);
    for (const e of w.fx) if (e.kind === 'lob') aim = { x: e.x1, z: e.z1 };
    for (const e of w.log) if (e.type === 'miss' && e.who === 'blue') landed = true;
  }
  ok('a mortar aimed at a point lands on that point',
    !!aim && Math.abs(aim.x + 3) < 0.05 && Math.abs(aim.z - 4) < 0.05, `landed at ${JSON.stringify(aim)}`);
}
{
  // A field ordered at a point lands on the point, clamped to its range.
  const { w, think } = mech(ZONE, BEAM, (p, api) => {
    if (api.ready('k1')) api.use('k1', { x: 4, z: 6 });
  }, idle);
  place(w.fighters.blue, 0, 0, Math.PI); place(w.fighters.orange, -12, -12, 0);
  for (let i = 0; i < 40 && !(w.zones && w.zones.length); i++) step(w, think);
  const z = (w.zones || [])[0];
  ok('a field aimed at a point lands on that point',
    !!z && Math.abs(z.x - 4) < 0.05 && Math.abs(z.z - 6) < 0.05, `field at ${JSON.stringify(z && { x: z.x, z: z.z })}`);
  const { w: w2, think: t2 } = mech(ZONE, BEAM, (p, api) => {
    if (api.ready('k1')) api.use('k1', { x: 0, z: 30 });
  }, idle);
  place(w2.fighters.blue, 0, 0, 0); place(w2.fighters.orange, 12, 12, 0);
  for (let i = 0; i < 40 && !(w2.zones && w2.zones.length); i++) step(w2, t2);
  const z2 = (w2.zones || [])[0];
  ok('and never beyond its range', !!z2 && Math.abs(z2.z - 12) < 0.05 && Math.abs(z2.x) < 0.05, `field at ${JSON.stringify(z2 && { x: z2.x, z: z2.z })}`);
}
{
  // A second stun inside the immunity window lands on nothing and says so.
  const { w, think } = mech(STUNBOLT, BEAM, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (api.ready('k1') && p.enemy.visible) api.use('k1');
  }, idle, { fixedCooldown: 1.1 });
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 6, Math.PI);
  for (let i = 0; i < 30 * 12 && !w.done; i++) step(w, think);
  const stuns = w.log.filter((e) => e.type === 'use' && e.who === 'blue' && e.skill === 'k1').length;
  const immune = w.log.filter((e) => e.type === 'immune' && e.effect === 'stun').length;
  ok('a stun inside the immunity window is refused', stuns >= 6 && immune >= 2, `${stuns} casts, ${immune} refused as immune`);
  const seen = perceive(w, 'blue');
  ok('and perception names what the enemy is immune to', Array.isArray(seen.enemy.immune) && Array.isArray(seen.self.immune));
}
{
  // A stun landing on a grammar wind-up cancels it.
  let cast = false;
  const { w, think } = mech(STUNCONE, BEAM, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (p.enemy.casting && p.enemy.casting.telegraph && api.ready('k1')) api.use('k1');
  }, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (!cast && p.t > 0.5 && api.ready('k1')) { api.use('k1'); cast = true; }
  });
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 3.2, Math.PI);
  for (let i = 0; i < 90; i++) step(w, think);
  const interrupted = w.log.some((e) => e.type === 'interrupt' && e.who === 'blue' && e.skill === 'k1');
  const beamFired = w.log.some((e) => (e.type === 'damage' || e.type === 'miss') && e.who === 'orange' && e.skill === 'k1');
  ok('a stun on a wind-up cancels the cast', interrupted && !beamFired, `interrupt ${interrupted}, beam still fired ${beamFired}`);
}
{
  // One field per ability per caster: the new cast replaces the old.
  const { w, think } = mech(ZONE, BEAM, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (api.ready('k1')) api.use('k1');
  }, idle, { fixedCooldown: 1.1 });
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 8, Math.PI);
  let most = 0;
  for (let i = 0; i < 30 * 6; i++) { step(w, think); most = Math.max(most, (w.zones || []).filter((z) => z.who === 'blue').length); }
  ok('a caster never has two fields of one ability on the floor', most === 1, `${most} at once`);
}
{
  // One wall per caster, the same way — whichever ability built it.
  const { w, think } = mech(WALL, BEAM, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (api.ready('k1')) api.use('k1');
  }, idle, { fixedCooldown: 1.1 });
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 10, Math.PI);
  let most = 0, navSaw = false;
  for (let i = 0; i < 30 * 6; i++) {
    step(w, think);
    most = Math.max(most, w.obstacles.filter((o) => o.temporary && o.by === 'blue').length);
    /* The navigator must know the wall: a path from behind it to the enemy is not direct. */
    const r = w.nav.orange.path(0, 0, 0, 10);
    if (r && !r.direct) navSaw = true;
  }
  ok('a caster never has two walls standing', most === 1, `${most} at once`);
  ok('and the navigator routes around a temporary wall', navSaw);
}
{
  // A lunge travels: the body moves over several ticks, the hit lands on contact.
  const DASH = [{ delivery: 'dash', effects: ['damage'], element: 'kinetic' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }];
  const { w, think } = mech(DASH, BEAM, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (p.t > 0.3 && api.ready('k1')) api.use('k1');
  }, idle);
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 6, Math.PI);
  let dashTicks = 0, maxStep = 0, lastX = 0, lastZ = 0;
  for (let i = 0; i < 60; i++) {
    const b = w.fighters.blue;
    const px = b.x, pz = b.z;
    step(w, think);
    if (b.act && b.act.phase === 'dash') { dashTicks++; maxStep = Math.max(maxStep, dist2(px, pz, b.x, b.z)); }
    lastX = b.x; lastZ = b.z;
  }
  const hit = w.log.some((e) => e.type === 'damage' && e.who === 'blue' && e.skill === 'k1');
  ok('a lunge travels over several ticks and lands on contact', dashTicks >= 3 && maxStep < 1.0 && hit,
    `${dashTicks} dash ticks, largest step ${maxStep.toFixed(2)} m, hit ${hit}`);
  ok('and the lunge stops on the body it hit', dist2(lastX, lastZ, 0, 6) < 3.2, `ended ${dist2(lastX, lastZ, 0, 6).toFixed(2)} m from the target`);
}
{
  // A knock is an impulse on the knockback slot: a stationary default body moves about mag²/(2·drag) metres.
  const KNOCK = [{ delivery: 'cone', effects: ['knock'], element: 'kinetic' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }];
  const { w, think } = mech(KNOCK, BEAM, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (p.t > 0.2 && api.ready('k1')) api.use('k1');
  }, idle, { fixedCooldown: 30 });
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 3.0, Math.PI);
  for (let i = 0; i < 60; i++) step(w, think);
  const moved = w.fighters.orange.z - 3.0;
  /* The registry's knock magnitude squared over twice the drag, a shade under
     because the impulse is dropped below the 0.4 m/s cut-off. */
  const KNOCK_WANT = GRAMMAR_EFFECTS.knock.mag ** 2 / (2 * KNOCKBACK_DRAG);
  ok('a knock moves the target about mag squared over twice the drag', moved > 0.75 * KNOCK_WANT && moved <= KNOCK_WANT + 0.05, `moved ${moved.toFixed(2)} m, expected ≈ ${KNOCK_WANT.toFixed(2)}`);
}
{
  // A heal is a share of the missing hp, floored and capped.
  const HEAL = [{ delivery: 'self', effects: ['heal'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }];
  const { w, think } = mech(HEAL, BEAM, (p, api) => { if (p.t > 0.2 && api.ready('k1')) api.use('k1'); }, idle, { fixedCooldown: 30 });
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 15, Math.PI);
  const MISSING = 60; // → the registry's share of it, between its floor and its cap
  w.fighters.blue.hp = w.fighters.blue.hp - MISSING;
  for (let i = 0; i < 30; i++) step(w, think);
  const healed = w.log.find((e) => e.type === 'heal' && e.who === 'blue');
  const H = HEAL_ATOM;
  const want = Math.min(H.mag, Math.max(H.floor ?? 0, MISSING * (H.share ?? 1)));
  ok('a heal gives a share of the missing hp', !!healed && Math.abs(healed.amount - want) < 0.01, `healed ${healed && healed.amount}, wanted ${want}`);
}
{
  // A hit the shield ate whole is still reported to both sides (a field's first tick is a fraction of a hit, under the shield's amount).
  const { w, think } = mech([{ delivery: 'zone', effects: ['damage'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }],
    [{ delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }],
    (p, api) => { if (p.t > 0.5 && api.ready('k1')) api.use('k1', { x: p.enemy.x, z: p.enemy.z }); },
    (p, api) => { if (api.ready('k1')) api.use('k1'); }, { fixedCooldown: 30 });
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 8, Math.PI);
  let dealt = null;
  const think2 = (id, p, api) => { if (id === 'blue') for (const e of p.events) if (e.type === 'dealt' && !dealt) dealt = e; return think(id, p, api); };
  for (let i = 0; i < 60; i++) step(w, think2);
  ok('a hit absorbed by a shield is reported as dealt with the absorbed amount', !!dealt && dealt.absorbed > 0 && dealt.amount === 0, JSON.stringify(dealt));
}

/*
 * ── THE ROUND-1 FIXES, EACH WITH THE DEFECT IT CLOSES ──────────────────────
 *
 * Every case below is a rule a reviewer measured the world breaking. They are
 * written against behaviour, not against the lines that implement it: a rule
 * that can only be checked by reading the code is a rule that will be broken
 * by the next reader of that code.
 */
{
  // MEDIUM-1: `absorbed` on a hit that got THROUGH the shield, not only on one
  // the shield ate whole. `const struck` used to be scoped inside a block the
  // reader sat outside of, so the field was silently never attached.
  const BOLT = [{ delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }];
  const SHIELD = [{ delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }];
  let fired = false, up = false, dealt = null;
  const { w, think } = mech(BOLT, SHIELD,
    (p, api) => { api.faceAt(p.enemy.x, p.enemy.z); if (p.t > 0.5 && !fired && api.ready('k1')) { api.use('k1'); fired = true; } },
    (p, api) => { api.move(0, 0); if (!up && api.ready('k1')) { api.use('k1'); up = true; } });
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 6, Math.PI);
  const watch = (id, p, api) => { if (id === 'blue') for (const e of p.events) if (e.type === 'dealt' && !dealt) dealt = e; return think(id, p, api); };
  for (let i = 0; i < 90; i++) step(w, watch);
  ok('a hit that broke the shield carries what the shield took',
    !!dealt && dealt.amount === 12 && dealt.absorbed === 12, JSON.stringify(dealt));
}
{
  // LOW-4: an immunity window EXPIRES. The window is duration + immune from the
  // moment the control lands, so a cooldown longer than that lands every time.
  const SB = [{ delivery: 'bolt', effects: ['stun'], element: 'void' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }];
  const { w, think } = mech(SB, BEAM, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (api.ready('k1')) api.use('k1');
  }, idle, { fixedCooldown: 4.5 });
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 6, Math.PI);
  for (let i = 0; i < 30 * 14 && !w.done; i++) step(w, think);
  const casts = w.log.filter((e) => e.type === 'use' && e.who === 'blue').length;
  const refused = w.log.filter((e) => e.type === 'immune').length;
  ok('an immunity window expires and the next control lands',
    casts >= 3 && refused === 0, `${casts} casts, ${refused} refused`);
}
{
  // HIGH-2 / spectacle 3: a field applies its control ONCE per cast per body,
  // at the registry's whole duration, and never refuses its own later ticks.
  const ZS = [{ delivery: 'zone', effects: ['stun'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }];
  let cast = false, applied = 0;
  const { w, think } = mech(ZS, BEAM, (p, api) => {
    if (!cast && p.t > 0.3 && api.ready('k1')) { api.use('k1', { x: p.enemy.x, z: p.enemy.z }); cast = true; }
  }, idle, { fixedCooldown: 30 });
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 8, Math.PI);
  for (let i = 0; i < 30 * 6; i++) { step(w, think); for (const f of w.fx) if (f.kind === 'status' && f.effect === 'stun') applied++; }
  const dur = compileKit(ZS).defs.k1.effects.find((e) => e.id === 'stun').duration;
  ok('a field lands its control once per cast, at its whole duration',
    applied === 1 && w.log.filter((e) => e.type === 'immune').length === 0 && dur === 1.0,
    `${applied} applications, ${w.log.filter((e) => e.type === 'immune').length} immune lines, duration ${dur}`);
}
{
  // F2: a mortar aimed at a point lands ON it even while the caster walks —
  // the distance is read at the strike, as the direction always was.
  const LOB2 = [{ delivery: 'lob', effects: ['damage'], element: 'ember' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }];
  let aim = null;
  const { w, think } = mech(LOB2, BEAM, (p, api) => {
    api.move(0, 1);
    if (api.ready('k1')) api.use('k1', { x: 0, z: 10 });
  }, idle);
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 14, 14, Math.PI);
  for (let i = 0; i < 40 && !aim; i++) { step(w, think); for (const e of w.fx) if (e.kind === 'lob') aim = { x: e.x1, z: e.z1 }; }
  const moved = w.fighters.blue.z;
  ok('a mortar lands on its point while the caster walks toward it',
    !!aim && Math.abs(aim.z - 10) < 0.05 && Math.abs(aim.x) < 0.05 && moved > 0.2,
    `landed ${JSON.stringify(aim)} after walking ${moved.toFixed(2)} m`);
}
{
  // F6: the aim point holds through the wind-up; a later faceAt does not take it.
  const BOLT2 = [{ delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }];
  let ordered = false, released = null;
  const { w, think } = mech(BOLT2, BEAM, (p, api) => {
    if (!ordered && api.ready('k1')) { api.use('k1', { x: 10, z: 10 }); ordered = true; } else api.faceAt(0, -10);
  }, idle);
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, -14, -14, 0);
  for (let i = 0; i < 40 && released === null; i++) { step(w, think); for (const e of w.fx) if (e.kind === 'bolt') released = e.h; }
  ok('an aim point is not replaced by a later faceAt',
    released !== null && Math.abs(released - Math.atan2(10, 10)) < 1e-6,
    `left at ${released}, wanted ${Math.atan2(10, 10)}`);
}
{
  // F4: the DODGER is told, once per ability per tick, and the log carries the
  // `evade` line the dodge metrics are counted from.
  const HIT = [{ delivery: 'bolt', effects: ['damage', 'knock'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }];
  const evs = { blue: [], orange: [] };
  let fired = false;
  const { w, think } = mech(HIT, BEAM,
    (p, api) => { api.faceAt(p.enemy.x, p.enemy.z); if (!fired && p.t > 0.4 && api.ready('k1')) { api.use('k1'); fired = true; } },
    idle);
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 5, Math.PI);
  const watch = (id, p, api) => { for (const e of p.events) evs[id].push(e); return think(id, p, api); };
  for (let i = 0; i < 70; i++) { step(w, watch); if (w.projectiles.length) w.fighters.orange.iframes = 1; }
  const evaded = evs.orange.filter((e) => e.type === 'evaded');
  const missed = evs.blue.filter((e) => e.type === 'missed' && e.reason === 'invulnerable');
  ok('a dodge is announced to the dodger, once for a two-effect ability',
    evaded.length === 1 && missed.length === 1 && w.log.some((e) => e.type === 'evade' && e.who === 'orange'),
    `${evaded.length} evaded, ${missed.length} missed, ${w.log.filter((e) => e.type === 'evade').length} log lines`);
}
{
  // F5: an ability carrying no damage announces what landed.
  const ROOTB = [{ delivery: 'bolt', effects: ['root'], element: 'void' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }];
  const seen = [];
  let fired = false;
  const { w, think } = mech(ROOTB, BEAM,
    (p, api) => { api.faceAt(p.enemy.x, p.enemy.z); if (!fired && p.t > 0.4 && api.ready('k1')) { api.use('k1'); fired = true; } }, idle);
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 5, Math.PI);
  const watch = (id, p, api) => { if (id === 'blue') for (const e of p.events) if (e.type === 'dealt') seen.push(e); return think(id, p, api); };
  for (let i = 0; i < 60; i++) step(w, watch);
  ok('a hit that carries only a control still announces what landed',
    seen.length === 1 && seen[0].amount === 0 && JSON.stringify(seen[0].landed) === '["root"]',
    JSON.stringify(seen));
}
{
  // F3: a WORLD atom is built even when the delivery carrying it misses —
  // for a bolt and a mortar too, not only for the four shapes that resolve.
  const WB = [{ delivery: 'bolt', effects: ['damage', 'wall'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }];
  let n = 0;
  const { w, think } = mech(WB, BEAM, (p, api) => {
    api.face(1, 0);
    if (n < 1 && p.t > 0.3 && api.ready('k1')) { api.use('k1'); n++; }
  }, idle, { fixedCooldown: 30 });
  place(w.fighters.blue, 0, 0, Math.PI / 2); place(w.fighters.orange, 0, 17, Math.PI);
  for (let i = 0; i < 120; i++) step(w, think);
  ok('a wall is built even when the bolt carrying it misses',
    w.log.some((e) => e.type === 'wall' && e.who === 'blue') && w.log.some((e) => e.type === 'miss' && e.who === 'blue'),
    `${w.log.filter((e) => e.type === 'wall').length} walls, ${w.log.filter((e) => e.type === 'miss').length} misses`);
}
{
  // H2: the caster's own wall is cover it can shoot FROM; the enemy's shot
  // still stops on it.
  const WSELF = [{ delivery: 'self', effects: ['wall'], element: 'kinetic' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'lob', effects: ['damage'], element: 'ember' }];
  let raised = false, shot = false;
  const { w, think } = mech(WSELF, WSELF, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (!raised && p.t > 0.2 && api.ready('k1')) { raised = true; api.use('k1'); return; }
    if (raised && !shot && p.t > 1.2 && api.ready('k2')) { shot = true; api.use('k2'); }
  }, (p, api) => {
    api.move(0, 0); api.faceAt(p.enemy.x, p.enemy.z);
    if (p.t > 1.2 && api.ready('k2')) api.use('k2');
  });
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 9, Math.PI);
  for (let i = 0; i < 150; i++) { step(w, think); place(w.fighters.orange, 0, 9, Math.PI); place(w.fighters.blue, 0, 0, 0); }
  const mine = w.log.some((e) => e.type === 'damage' && e.who === 'blue');
  const theirs = w.log.filter((e) => e.type === 'miss' && e.who === 'orange' && e.reason === 'cover').length;
  ok('a caster shoots through its own wall and the enemy does not',
    mine && theirs > 0, `own bolt landed ${mine}, enemy blocked ${theirs} times`);
}
{
  // H2/M3: a second fire EXTENDS the first, capped at twice the atom's length.
  const CB = [{ delivery: 'cone', effects: ['burn'], element: 'ember' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }, { delivery: 'self', effects: ['shield'], element: 'frost' }];
  const { w, think } = mech(CB, BEAM, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (api.ready('k1')) api.use('k1');
  }, idle);
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 3.0, Math.PI);
  const dur = compileKit(CB).defs.k1.effects[0].duration;
  let most = 0, twice = false;
  for (let i = 0; i < 30 * 10; i++) {
    step(w, think); place(w.fighters.orange, 0, 3.0, Math.PI);
    const st = w.fighters.orange.status;
    if (st && st.burn) { const left = st.burn.until - w.t; most = Math.max(most, left); if (left > dur + 1e-6) twice = true; }
  }
  ok('a burn extends the fire already running, capped at twice its length',
    twice && most <= 2 * dur + 1e-6, `longest remaining ${most.toFixed(3)} s against a ${dur} s atom`);
}
{
  // LOW-2: a stun ends a lunge's travel where it stands.
  const D = [{ delivery: 'dash', effects: ['damage'], element: 'kinetic' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }];
  let dashed = false;
  const { w, think } = mech(D, BEAM, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (!dashed && p.t > 0.5 && api.ready('k1')) { api.use('k1'); dashed = true; }
  }, idle);
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 12, Math.PI);
  let stunned = false, travelled = 0;
  for (let i = 0; i < 90; i++) {
    const b = w.fighters.blue; const px = b.x, pz = b.z;
    step(w, think);
    if (b.act && b.act.phase === 'dash') {
      travelled += dist2(px, pz, b.x, b.z);
      /* Land the stun a third of the way through the travel, the way a bolt
         would: the harness writes the status the atom writes. */
      if (!stunned && travelled > 2) { b.stun = 0.6; stunned = true; }
    }
  }
  ok('a stun ends a lunge where it stands', stunned && travelled < 4,
    `travelled ${travelled.toFixed(2)} m of 8 after the stun landed at 2 m`);
}
{
  // LOW-4: a lunge passes UNDER a body that is in the air.
  const D2 = [{ delivery: 'dash', effects: ['damage'], element: 'kinetic' }, { delivery: 'self', effects: ['shield'], element: 'frost' }, { delivery: 'bolt', effects: ['damage'], element: 'arc' }];
  let dashed = false;
  const { w, think } = mech(D2, BEAM, (p, api) => {
    api.faceAt(p.enemy.x, p.enemy.z);
    if (!dashed && p.t > 0.5 && api.ready('k1')) { api.use('k1'); dashed = true; }
  }, idle);
  place(w.fighters.blue, 0, 0, 0); place(w.fighters.orange, 0, 6, Math.PI);
  for (let i = 0; i < 90; i++) { w.fighters.orange.y = 1.2; w.fighters.orange.yTick = 1.2; step(w, think); }
  ok('a lunge passes under a body that is in the air',
    !w.log.some((e) => e.type === 'damage' && e.who === 'blue')
      && w.log.some((e) => e.type === 'miss' && e.who === 'blue' && e.reason === 'airborne'),
    w.log.filter((e) => e.type === 'miss' || e.type === 'damage').map((e) => `${e.type}:${e.reason || ''}`).join(' '));
}
{
  // D160: a creature has EXACTLY the three abilities it bought, and no free
  // fourth verb. A universal `hop` was appended for one day and reverted
  // (DESIGN.md D195); these three hold the door shut.
  const built = compileKit(BEAM);
  ok('a compiled kit is exactly the abilities the creature bought',
    built.names.length === BEAM.length
      && built.names.every((n, i) => n === `k${i + 1}`)
      && Object.keys(built.defs).length === BEAM.length,
    JSON.stringify(built.names));
  const w = createWorld(3, { kits: { blue: built.defs } });
  const mine = perceive(w, 'blue');
  ok('and no entry of the kit perception sends carries universal or cost',
    mine.self.skills.length === BEAM.length
      && Object.keys(mine.self.kit).length === BEAM.length
      && Object.values(mine.self.kit).every((d) => d.universal === undefined && d.cost === undefined)
      && Object.keys(mine.self.cooldowns).length === BEAM.length,
    JSON.stringify(mine.self.skills));
  let used = null;
  for (let i = 0; i < 30; i++) step(w, (id, p, api) => { if (id === 'blue' && used === null && api.ready('k1')) used = api.use('hop'); });
  ok('and a verb the creature did not buy is refused as unknown',
    used === false
      && w.log.some((e) => e.type === 'refused' && e.who === 'blue' && e.skill === 'hop' && e.reason === 'unknown')
      && !w.log.some((e) => e.type === 'use' && e.skill === 'hop'),
    `used ${used}`);
}
{
  // Spectacle 8: a quip is accepted at most once every SAY_EVERY seconds, and a
  // dropped one is not a fault and costs no budget.
  const { w, think } = mech(BEAM, BEAM, (p, api) => { api.say(`x${p.tick}`); }, idle);
  for (let i = 0; i < 30 * 12; i++) step(w, think);
  const said = w.log.filter((e) => e.type === 'say' && e.who === 'blue');
  const gaps = said.slice(1).map((e, i) => e.t - said[i].t);
  ok('a fighter quips at most once every SAY_EVERY seconds',
    said.length >= 2 && said.length <= Math.ceil(12 / SAY_EVERY) + 1
      && gaps.every((g) => g >= SAY_EVERY - 1e-6)
      && w.fighters.blue.stats.faults === 0,
    `${said.length} lines in 12 s, gaps ${gaps.map((g) => g.toFixed(2)).join(',')}`);
}
{
  // LOW-4: the headline rule, held by a gate rather than by a comment. A
  // registry edit to 5 s used to pass every check in the repository.
  const overFixture = Object.entries(SKILLS).filter(([, s]) => (s.cooldown ?? 0) > 3.0 + 1e-9);
  ok('every reference-fixture cooldown is three seconds or less', overFixture.length === 0,
    overFixture.map(([k, s]) => `${k} ${s.cooldown}`).join(', '));
  const overDelivery = Object.entries(GRAMMAR_DELIVERIES).filter(([, d]) => (d.cooldown ?? 0) > 3.0 + 1e-9);
  ok('and every delivery in the grammar', overDelivery.length === 0,
    overDelivery.map(([k, d]) => `${k} ${d.cooldown}`).join(', '));
}
{
  // LOW-4: determinism where the product actually lives — compiled kits and the
  // pilot panel, not the two fixture stubs. Same seed, twice, same log.
  const src = (f) => readFileSync(new URL(`../brains/pilots/${f}`, import.meta.url), 'utf8');
  const KIT_A = [{ delivery: 'cone', effects: ['damage', 'knock'], element: 'kinetic' },
    { delivery: 'zone', effects: ['burn', 'root'], element: 'ember' },
    { delivery: 'self', effects: ['shield', 'heal'], element: 'frost' }];
  const KIT_B = [{ delivery: 'bolt', effects: ['damage', 'silence'], element: 'void' },
    { delivery: 'lob', effects: ['damage'], element: 'acid' },
    { delivery: 'blink', effects: ['cleanse'], element: 'void' }];
  const kits = { blue: compileKit(KIT_A).defs, orange: compileKit(KIT_B).defs };
  const run = () => JSON.stringify(runMatch({
    blue: compileBrain(src('rusher.js'), 'rusher'),
    orange: compileBrain(src('kiter.js'), 'kiter'),
  }, { seed: 90210, kits }).result.log);
  const a = run(), b = run();
  ok('two runs of one seed with kits and pilots are the same fight', a === b,
    `${a.length} vs ${b.length} bytes`);
}

{
  // A kitted mind facing a reference-fixture opponent still finds a kit under p.enemy.kit.
  const a = compileKit(BEAM);
  const w = createWorld(13, { kits: { blue: a.defs } });
  const seen = perceive(w, 'blue');
  const names = Object.keys(seen.enemy.kit || {});
  ok('a fixture opponent presents its skills as a kit', names.length === 3 && names.every((n) => seen.enemy.skills.includes(n)) && seen.enemy.kit.smash.kind === 'cone',
    `enemy.kit keys ${names.join(',')}`);
  ok('and a fixture fighter\'s own kit view stays null', perceive(w, 'orange').self.kit === null);
}

{
  // The grammar modules the browser imports must stay free of Node-only imports.
  // An import of core/config.js (node:fs) in registry.js broke every client screen on 07.09.
  const served = ['registry.js', 'describe.js'];
  const importsOf = (src) => src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n');
  const dirty = served.filter((f) => /core\/config\.js|node:/.test(importsOf(readFileSync(new URL(`../src/skills/${f}`, import.meta.url), 'utf8'))));
  ok('the grammar modules served to the browser import nothing Node-only', dirty.length === 0, `dirty: ${dirty.join(', ')}`);
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
