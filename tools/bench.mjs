/**
 * Замер каждого мозга против ОДНОГО эталона.
 *
 *   node tools/bench.mjs --ref=u6 --rounds=200
 *   node tools/bench.mjs --ref=u6 --rounds=200 --tags=or-gem-plain,or-opu-plain
 *
 * Зачем отдельно от `tournament.mjs`: турнир меряет всех против всех и отвечает
 * на вопрос «кто сильнее в среднем». Здесь вопрос другой — «сколько побед даёт
 * этот мозг против одного и того же соперника», и к нему нужен РАЗБРОС, а не
 * только среднее. Один сид — это одно наблюдение, и по нему нельзя судить:
 * тот же мозг на соседнем сиде забивается в угол. Поэтому каждая пара гоняется
 * ROUNDS раз, а к средней печатается интервал — насколько её можно двигать,
 * если бы сидов было меньше.
 *
 * Интервал считается бутстрэпом по фактическим исходам, а не формулой: исходы
 * бинарные и несимметричные у краёв (мозг с 95% побед не может ошибаться на
 * ±10% вверх), а нормальное приближение этого не знает и рисует интервалы,
 * выходящие за 100%.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileBrain } from '../src/brain/host.js';
import { runMatch } from '../src/core/match.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAINS = join(ROOT, 'brains');

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const REF = String(arg('ref', 'u6'));
const ROUNDS = Number(arg('rounds', 200));
const JSON_OUT = process.argv.includes('--json');

const discover = () =>
  readdirSync(BRAINS).filter((t) => existsSync(join(BRAINS, t, 'octopus.js')));

const TAGS = String(arg('tags', '')).length
  ? String(arg('tags')).split(',')
  : discover().filter((t) => /^(or-|sweep-)/.test(t));

/* СТОРОНА -> ИМЯ ФАЙЛА эталонного мозга. Файлы §1 на диске зовутся
   `octopus.js` и `gorilla.js`; стороны арены зовутся цветами. */
const BRAIN_FILE = { blue: 'octopus', orange: 'gorilla' };

const load = (id, tag) => {
  const p = join(BRAINS, tag, `${id}.js`);
  if (!existsSync(p)) throw new Error(`нет ${id} для тега "${tag}"`);
  return compileBrain(readFileSync(p, 'utf8'), `${id}-${tag}`);
};

/*
 * Одна пара, ROUNDS сидов. Возвращает список исходов (1 = победа замеряемого)
 * плюс то, ЧЕМ он победил: без этого таблица говорит «кто», но не «почему».
 */
function pair(subject, subjectTag, refTag) {
  const ref = subject === 'blue' ? 'orange' : 'blue';
  /* Слева СТОРОНА арены (цвет), справа ИМЯ ФАЙЛА в `brains/<тег>/`. Две разные
     вещи: сторона — это цвет, файл — это фикстура §1. */
  const brains = {
    [subject]: load(BRAIN_FILE[subject], subjectTag),
    [ref]: load(BRAIN_FILE[ref], refTag),
  };
  const wins = [];
  const acc = { dealt: 0, taken: 0, secs: 0, faults: 0, uses: {}, hits: {}, melee: 0, ticks: 0 };
  for (let r = 0; r < ROUNDS; r++) {
    brains.blue.reset();
    brains.orange.reset();
    const { result, world } = runMatch(brains, { seed: 5000 + r });
    wins.push(result.winner === subject ? 1 : 0);
    acc.dealt += result[subject].damageDealt;
    acc.taken += result[ref].damageDealt;
    acc.faults += result[subject].faults;
    acc.secs += result.seconds;
    for (const [k, v] of Object.entries(result[subject].uses)) acc.uses[k] = (acc.uses[k] || 0) + v;
    for (const [k, v] of Object.entries(result[subject].hits)) acc.hits[k] = (acc.hits[k] || 0) + v;
    acc.melee += world.meleeTicks || 0;
    acc.ticks += world.tick;
  }
  return { wins, acc };
}

/* Бутстрэп: пересобираем выборку с возвратом и смотрим, куда уезжает средняя. */
function ci(wins, draws = 2000) {
  const n = wins.length;
  let seed = 12345;                       /* свой ГПСЧ — замер обязан быть повторяемым */
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const means = [];
  for (let d = 0; d < draws; d++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += wins[(rnd() * n) | 0];
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  return { lo: means[Math.floor(draws * 0.025)], hi: means[Math.floor(draws * 0.975)] };
}

/* Насколько врёт один сид: доля сидов, где исход противоположен общей картине. */
function coinflip(wins) {
  const mean = wins.reduce((a, b) => a + b, 0) / wins.length;
  const majority = mean >= 0.5 ? 1 : 0;
  return wins.filter((w) => w !== majority).length / wins.length;
}

const pct = (v) => (v * 100).toFixed(0) + '%';
const rows = [];

for (const tag of TAGS) {
  if (tag === REF) continue;
  const out = { tag };
  for (const side of ['blue', 'orange']) {
    try {
      const { wins, acc } = pair(side, tag, REF);
      const mean = wins.reduce((a, b) => a + b, 0) / wins.length;
      const bounds = ci(wins);
      const totalUses = Object.values(acc.uses).reduce((a, b) => a + b, 0);
      const totalHits = Object.values(acc.hits).reduce((a, b) => a + b, 0);
      out[side] = {
        win: mean, lo: bounds.lo, hi: bounds.hi, flip: coinflip(wins),
        dealt: acc.dealt / ROUNDS, taken: acc.taken / ROUNDS,
        secs: acc.secs / ROUNDS, faults: acc.faults / ROUNDS,
        accuracy: totalUses ? totalHits / totalUses : 0,
        uses: totalUses / ROUNDS,
        melee: acc.ticks ? acc.melee / acc.ticks : 0,
      };
    } catch (e) {
      out[side] = { error: e.message };
    }
  }
  if (out.blue?.win != null && out.orange?.win != null) {
    out.score = (out.blue.win + out.orange.win) / 2;
  }
  rows.push(out);
  if (!JSON_OUT) process.stderr.write('.');
}

rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

if (JSON_OUT) {
  console.log(JSON.stringify({ ref: REF, rounds: ROUNDS, rows }, null, 2));
} else {
  process.stderr.write('\n\n');
  console.log(`эталон: ${REF} · ${ROUNDS} сидов на пару · ${rows.length} мозгов\n`);
  console.log('тег'.padEnd(16) + 'счёт'.padStart(7) + 'синяя'.padStart(18) + 'оранжевая'.padStart(18)
    + 'урон'.padStart(9) + 'сбоев'.padStart(8));
  console.log('-'.repeat(76));
  for (const r of rows) {
    const cell = (c) => c?.error ? '  ошибка'.padStart(18)
      : `${pct(c.win)} (${pct(c.lo)}–${pct(c.hi)})`.padStart(18);
    const dmg = r.blue?.dealt != null
      ? ((r.blue.dealt + r.orange.dealt) / 2).toFixed(0).padStart(9) : ''.padStart(9);
    const f = r.blue?.faults != null
      ? ((r.blue.faults + r.orange.faults) / 2).toFixed(1).padStart(8) : ''.padStart(8);
    console.log(r.tag.padEnd(16) + (r.score != null ? pct(r.score) : '—').padStart(7)
      + cell(r.blue) + cell(r.orange) + dmg + f);
  }
  console.log('\nв скобках — интервал: куда уехала бы средняя, будь выборка другой.');
  const flips = rows.flatMap((r) => [r.blue?.flip, r.orange?.flip].filter((x) => x != null));
  if (flips.length) {
    const avg = flips.reduce((a, b) => a + b, 0) / flips.length;
    console.log(`один случайный сид даёт исход, противоположный общей картине, в ${pct(avg)} случаев.`);
  }
}
