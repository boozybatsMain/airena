/**
 * Гейт грамматики §8. Того, чего в `npm test` не было вовсе.
 *
 * Пять осей, тысячи законных сочетаний и ни одной проверки — это состояние,
 * в котором две дыры прожили до внешнего ревью:
 *
 *   — `wall` клал в мир коробку с `w`/`d`, а вся геометрия арены читает
 *     `hx`/`hz`. `clamp(v, undefined, undefined)` возвращает `v`, поэтому
 *     расстояние до стены выходило нулевым ВЕЗДЕ: обоих бойцов вышвыривало
 *     из центра к краю за один тик, а линия взгляда была ложна по всей карте
 *     на все пять секунд жизни стены;
 *   — таблицы осей были обычными объектами, поэтому `TRIGGERS['constructor']`
 *     возвращал функцию. `costOf` получал `NaN`, `NaN > SKILL_BUDGET` — ложь,
 *     и умение с невычислимой ценой ПРОХОДИЛО проверку бюджета и уезжало на
 *     рейтинговую лестницу с кулдауном `NaN`, то есть готовое всегда.
 *
 * Обе — из одного семейства: «неопределённое значение молча притворилось
 * допустимым». Поэтому проверки здесь ищут именно это, а не конкретные два
 * бага: любое нечисло там, где обязано быть число, и любой ключ прототипа,
 * притворившийся частью грамматики.
 *
 *   node tools/checkgrammar.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileBrain } from '../src/brain/host.js';
import { KIT_PRESETS } from '../src/server/forge/pipeline.js';
import { runMatch } from '../src/core/match.js';
import { perceive } from '../src/core/sim.js';
import { compileKit, compileSkill } from '../src/skills/compile.js';
import {
  CHANNELS, DELIVERIES, EFFECTS, ELEMENTS, KIT_BUDGET, SKILL_BUDGET,
  costOf, validateKit, validateSkill,
} from '../src/skills/registry.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const ok = (name, good, note = '') => {
  console.log(`  ${good ? '✓' : '✗'} ${name}${note ? `  ${note}` : ''}`);
  if (!good) failed++;
};

console.log('\n  ГЕЙТ ГРАММАТИКИ §8\n');

// ── 1. ключи прототипа не являются частью грамматики ───────────────────────
const PROTO = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'prototype'];
{
  let leaked = [];
  for (const [name, t] of [['DELIVERIES', DELIVERIES],
    ['EFFECTS', EFFECTS], ['CHANNELS', CHANNELS], ['ELEMENTS', ELEMENTS]]) {
    for (const k of PROTO) if (t[k] !== undefined) leaked.push(`${name}[${k}]`);
  }
  ok('оси не отдают ключи прототипа', leaked.length === 0, leaked.join(', '));
}

// ── 2. невычислимая цена — это отказ, а не пропуск ─────────────────────────
{
  /* Первым кейсом здесь стоял `trigger: 'constructor'` — подделка по оси,
     которой больше нет. После снятия оси он превратился в совершенно
     законное умение, и гейт честно сказал «пропущено». Кейс заменён на
     подделку по живой оси, а не удалён: проверка про то, что имя из
     прототипа не проходит НИ ПО ОДНОЙ оси. */
  const evil = [
    { delivery: '__proto__', effects: ['damage'], element: 'kinetic' },
    { delivery: 'toString', effects: ['damage'], element: 'kinetic' },
    { delivery: 'bolt', effects: ['constructor'], element: 'kinetic' },
    { delivery: 'bolt', effects: ['boost'], channel: '__proto__', element: 'kinetic' },
    { delivery: 'bolt', effects: 'damage', element: 'kinetic' },
    { delivery: 'bolt', effects: [], element: 'kinetic' },
    { delivery: 'bolt', effects: ['damage'], element: '__proto__' },
    /* Злой вход ПРИ НОВОМ ПРАВИЛЕ E1: несуществующая доставка со стихией, у
       которой список форм закрыт, — E1 не имеет права подменить собой
       сообщение о несуществующей доставке или бросить на undefined. */
    { delivery: '__proto__', effects: ['damage'], element: 'time' },
  ];
  const slipped = evil.filter((s) => {
    const c = costOf(s);
    return validateSkill(s).length === 0 && !(c > SKILL_BUDGET);
  });
  ok('подделанное умение не проходит бюджет', slipped.length === 0,
    slipped.length ? JSON.stringify(slipped[0]) : `${evil.length} попыток отвергнуто`);
  const anyNan = evil.some((s) => Number.isNaN(costOf(s)));
  ok('цена никогда не NaN', !anyNan, 'NaN проходит любое сравнение как «не больше»');
}

// ── 3. каждое законное умение компилируется в конечные числа ───────────────
{
  const NUMERIC = ['cooldown', 'windup', 'recover', 'range', 'halfAngle', 'speed',
    'radius', 'duration', 'distance', 'iframes', 'damage', 'moveScale', 'turnScale'];
  let checked = 0; const bad = [];
  const effIds = Object.keys(EFFECTS);
  const combos = [];
  for (let i = 0; i < effIds.length; i++) {
    combos.push([effIds[i]]);
    for (let j = i + 1; j < effIds.length; j++) {
      combos.push([effIds[i], effIds[j]]);
      for (let k = j + 1; k < effIds.length; k++) combos.push([effIds[i], effIds[j], effIds[k]]);
    }
  }
  {
    for (const d of Object.keys(DELIVERIES)) {
      for (const es of combos) {
        const needs = es.some((e) => EFFECTS[e].needsChannel);
        for (const ch of (needs ? Object.keys(CHANNELS) : [null])) {
          const s = { delivery: d, effects: es, element: 'kinetic', ...(ch ? { channel: ch } : {}) };
          if (validateSkill(s).length || costOf(s) > SKILL_BUDGET) continue;
          checked++;
          const { def } = compileSkill(s, 'k');
          for (const f of NUMERIC) {
            if (def[f] !== undefined && !Number.isFinite(def[f])) bad.push(`${d}:${es.join('+')} .${f}=${def[f]}`);
          }
          for (const e of def.effects) {
            if (e.mag !== null && !Number.isFinite(e.mag)) bad.push(`${d}:${e.id} mag=${e.mag}`);
            if (e.duration !== null && !Number.isFinite(e.duration)) bad.push(`${d}:${e.id} duration=${e.duration}`);
          }
        }
      }
    }
  }
  ok(`все ${checked} законных умений дают конечные числа`, bad.length === 0, bad.slice(0, 3).join('; '));
}

// ── 3б. перечисление, которым обоснован бюджет, воспроизводится ───────────
{
  /*
   * Цифры, на которых стоит выбор SKILL_BUDGET, живут в комментарии к нему —
   * и однажды уже разъехались с кодом. Хуже: тот перебор фильтровал кандидатов
   * через `validateSkill`, которая САМА отвергает всё дороже бюджета, то есть
   * применял потолок раньше, чем его обосновывал. Ответ был заложен в вопрос.
   *
   * Здесь перебор честный: нарушение с кодом `budget` пропускается, остальные
   * правила грамматики действуют. Если числа поедут — упадёт этот гейт, а не
   * доверие к комментарию через полгода.
   */
  const effIds = Object.keys(EFFECTS);
  const all = [];
  for (let i = 0; i < effIds.length; i++) {
    all.push([effIds[i]]);
    for (let j = i + 1; j < effIds.length; j++) {
      all.push([effIds[i], effIds[j]]);
      for (let k = j + 1; k < effIds.length; k++) all.push([effIds[i], effIds[j], effIds[k]]);
    }
  }
  let legal = 0; let maxCost = 0; const atBudget = { 22: 0, 24: 0 }; let threeAt22 = 0;
  {
    for (const d of Object.keys(DELIVERIES)) {
      for (const es of all) {
        const needs = es.some((e) => EFFECTS[e].needsChannel);
        for (const ch of (needs ? Object.keys(CHANNELS) : [null])) {
          const sk = { delivery: d, effects: es, element: 'kinetic', ...(ch ? { channel: ch } : {}) };
          if (validateSkill(sk).some((v) => v.code !== 'budget')) continue;
          const c = costOf(sk);
          if (!Number.isFinite(c)) continue;
          legal++;
          if (c > maxCost) maxCost = c;
          if (c <= 22) { atBudget[22]++; if (es.length === 3) threeAt22++; }
          if (c <= 24) atBudget[24]++;
        }
      }
    }
  }
  const want = { legal: 9243, maxCost: 32, at22: 2059, at24: 3488, three22: 322 };
  const got = { legal, maxCost, at22: atBudget[22], at24: atBudget[24], three22: threeAt22 };
  const off = Object.keys(want).filter((k) => want[k] !== got[k]);
  ok('перечисление под SKILL_BUDGET воспроизводится', off.length === 0,
    off.length
      ? off.map((k) => `${k}: в комментарии ${want[k]}, посчитано ${got[k]}`).join('; ')
      : `${legal} законных, самое дорогое ${maxCost}, при 22 — ${atBudget[22]} (из них 3-эффектных ${threeAt22})`);
}

// ── 4. мир остаётся корректным: солиды с размерами, позиции — числа ────────
{
  /* Ключ — СТОРОНА арены (цвет), справа — ИМЯ ФАЙЛА эталонного пилота §1 в
     `brains/kit-stub/`. Это разные вещи, и совпадали они только по случаю. */
  const brains = {
    blue: compileBrain(readFileSync(join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8'), 'blue'),
    orange: compileBrain(readFileSync(join(ROOT, 'brains/kit-stub/gorilla.js'), 'utf8'), 'orange'),
  };
  const bad = [];
  const effIds = Object.keys(EFFECTS);
  let n = 0;
  for (const d of Object.keys(DELIVERIES)) {
    /* Один бой на доставку, эффект берётся по кругу — так за девять боёв
       каждая форма хотя бы раз строит то, что кладёт в мир. */
    for (const bias of [0, 7]) {
      const eff = effIds[(n + bias) % effIds.length];
      const s = { delivery: d, effects: [eff], element: 'kinetic' };
      if (EFFECTS[eff].needsChannel) s.channel = 'speed';
      if (validateSkill(s).length) continue;
      /* Третье умение — чтобы набор был законного размера: `compileKit`
         теперь проверяет и правила набора, и это правильно. */
      /* Наполнители подбираются так, чтобы не совпасть с испытуемым: набор
         из двух одинаковых умений теперь отвергается, и правильно. */
      const sig = `${s.delivery}:${s.effects.join('+')}`;
      const fill = [
        { delivery: 'bolt', effects: ['damage'], element: 'kinetic' },
        { delivery: 'self', effects: ['heal'], element: 'frost' },
        { delivery: 'self', effects: ['shield'], element: 'frost' },
        { delivery: 'lob', effects: ['burn'], element: 'ember' },
      ].filter((k) => `${k.delivery}:${k.effects.join('+')}` !== sig).slice(0, 2);
      const kit = compileKit([s, ...fill]);
      if (kit.problems.length) { bad.push(`${d}:${eff} не собрался`); continue; }
      n++;
      brains.blue.reset?.(); brains.orange.reset?.();
      const r = runMatch(brains, { seed: 911, kits: { blue: kit.defs, orange: kit.defs } });
      const w = r.world;
      for (const box of [...(w.solids || []), ...(w.obstacles || [])]) {
        if (!Number.isFinite(box.hx) || !Number.isFinite(box.hz)) {
          bad.push(`${d}:${eff} солид без полуразмеров: ${JSON.stringify(box).slice(0, 90)}`);
          break;
        }
      }
      for (const id of ['blue', 'orange']) {
        const f = w.fighters[id];
        if (!Number.isFinite(f.x) || !Number.isFinite(f.z) || !Number.isFinite(f.hp)) {
          bad.push(`${d}:${eff} боец ${id} в нечисле: x=${f.x} z=${f.z} hp=${f.hp}`);
        }
      }
    }
  }
  ok(`мир корректен после ${n} боёв со всеми формами`, bad.length === 0, bad.slice(0, 2).join('; '));
}

// ── 5. перцепция не теряет полей на пути в изолят ──────────────────────────
{
  /* undefined исчезает при сериализации, и мозг видит объект без размеров —
     ровно так стена доехала до промпта пустой коробкой. Проверяем, что
     сериализация ничего не роняет. */
  /* Ключ — СТОРОНА арены (цвет), справа — ИМЯ ФАЙЛА эталонного пилота §1 в
     `brains/kit-stub/`. Это разные вещи, и совпадали они только по случаю. */
  const brains = {
    blue: compileBrain(readFileSync(join(ROOT, 'brains/kit-stub/octopus.js'), 'utf8'), 'blue'),
    orange: compileBrain(readFileSync(join(ROOT, 'brains/kit-stub/gorilla.js'), 'utf8'), 'orange'),
  };
  const kit = compileKit([
    { delivery: 'self', effects: ['wall'], element: 'kinetic' },
    { delivery: 'zone', effects: ['damage'], element: 'ember' },
    { delivery: 'bolt', effects: ['damage'], element: 'kinetic' },
  ]);
  if (kit.problems.length) console.log('  · набор для проверки перцепции:', JSON.stringify(kit.problems[0]));
  brains.blue.reset?.(); brains.orange.reset?.();
  const r = runMatch(brains, { seed: 913, kits: { blue: kit.defs, orange: kit.defs } });
  const holes = [];
  const scan = (v, path) => {
    if (v === undefined) { holes.push(path); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => scan(x, `${path}[${i}]`)); return; }
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) scan(v[k], `${path}.${k}`); }
  };
  for (const id of ['blue', 'orange']) scan(perceive(r.world, id), `p(${id})`);
  ok('перцепция не содержит undefined', holes.length === 0, holes.slice(0, 4).join(', '));
}

// ── 6. §9.2: элемент владеет палитрой, эффект владеет ударом ───────────────
{
  /*
   * «Элемент владеет палитрой» — проверяемое утверждение, а не намерение.
   * Пять палитр, чьи насыщенные цвета сходятся, дают пять элементов, которые
   * на экране один. Порог ΔE 10 в Lab — граница, ниже которой цвета на
   * летящей частице уже не различить; берётся минимум по двум насыщенным
   * членам палитры, потому что первый (почти белый блик) одинаков у всех
   * нарочно.
   */
  const srgb = (c) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92);
  const lab = (hex) => {
    const R = srgb(parseInt(hex.slice(1, 3), 16) / 255);
    const G = srgb(parseInt(hex.slice(3, 5), 16) / 255);
    const B = srgb(parseInt(hex.slice(5, 7), 16) / 255);
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.9505;
    const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.089;
    const q = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * q(Y) - 16, 500 * (q(X) - q(Y)), 200 * (q(Y) - q(Z))];
  };
  const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const ids = Object.keys(ELEMENTS);
  let worst = [999, ''];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ELEMENTS[ids[i]].palette; const b = ELEMENTS[ids[j]].palette;
      const d = Math.min(dE(lab(a[1]), lab(b[1])), dE(lab(a[2]), lab(b[2])));
      if (d < worst[0]) worst = [d, `${ids[i]}/${ids[j]}`];
    }
  }
  ok('элементы различимы по цвету (§9.2)', worst[0] >= 10,
    `худшая пара ${worst[1]}: ΔE ${worst[0].toFixed(1)}, порог 10`);

  /* «Эффект владеет ударом» — значит у каждого атома есть своя подпись и она
     нарисована. Реестр описывает подпись словами; вьювер обязан её знать. */
  const drawn = readFileSync(join(ROOT, 'src/viewer/vfx.js'), 'utf8');
  const missing = Object.keys(EFFECTS).filter((id) => !new RegExp(`case '${id}'`).test(drawn));
  ok('у каждого эффекта своя подпись удара (§9.2)', missing.length === 0,
    missing.length ? `не нарисованы: ${missing.join(', ')}` : `${Object.keys(EFFECTS).length} атомов`);

  /* И реестр обязан описывать её словами — иначе рисовать нечего по чему. */
  const noWords = Object.keys(EFFECTS).filter((id) => !EFFECTS[id].vfx);
  ok('реестр описывает подпись каждого атома', noWords.length === 0, noWords.join(', '));
}

// ── 7. каждый канал действительно читается симуляцией ─────────────────────
{
  /*
   * Канал, за который платят и который никто не читает, — это не слабое
   * умение, а обман: слабое умение хотя бы честно. Так жили `turn` (2 очка)
   * и `vision` (4 очка, самый дорогой канал в грамматике) — ни одного
   * обращения к ним во всей симуляции.
   *
   * Проверяется по исходникам, а не по бою: канал может быть подключён и не
   * проявиться в конкретном матче, и тогда прогон соврал бы «не читается».
   */
  const core = ['sim.js', 'deliver.js', 'effects.js']
    .map((f) => readFileSync(join(ROOT, 'src/core', f), 'utf8')).join('\n');
  const unread = Object.keys(CHANNELS).filter((id) => !new RegExp(`channelMul\\([^)]*'${id}'`).test(core));
  ok('каждый канал читается симуляцией', unread.length === 0,
    unread.length ? `никто не читает: ${unread.join(', ')}` : `${Object.keys(CHANNELS).length} каналов`);
}

// ── 7b. русские имена атомов в карточке гостя совпадают с реестром ────────
{
  /*
   * Карточка стартового существа показывается ДО того, как загрузится
   * `/api/grammar`: это первый экран гостя, и лишний запрос на критическом
   * пути стоит дороже, чем копия словаря. Поэтому `arena.js` держит свои
   * DELIV_SHORT и EFF_SHORT — и как всякая копия, они умеют разъезжаться с
   * оригиналом молча. Разъедутся — гость увидит `burn` вместо «горение»
   * ровно там, где мы объясняем ему, чем одно существо отличается от
   * другого.
   */
  const src = readFileSync(join(ROOT, 'src/client/screens/arena.js'), 'utf8');
  const dictOf = (name) => {
    const m = src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`));
    if (!m) return null;
    const out = {};
    for (const pair of m[1].matchAll(/(\w+):\s*'([^']*)'/g)) out[pair[1]] = pair[2];
    return out;
  };
  const dv = dictOf('DELIV_SHORT');
  const ef = dictOf('EFF_SHORT');
  const bad = [];
  if (!dv || !ef) bad.push('словарь не найден в arena.js');
  else {
    for (const [id, d] of Object.entries(DELIVERIES)) if (dv[id] !== d.ru) bad.push(`доставка ${id}: «${dv[id]}» вместо «${d.ru}»`);
    for (const [id, e] of Object.entries(EFFECTS)) if (ef[id] !== e.ru) bad.push(`эффект ${id}: «${ef[id]}» вместо «${e.ru}»`);
  }
  ok('словарь атомов в карточке гостя совпадает с реестром', bad.length === 0,
    bad.length ? bad.join('; ') : `${Object.keys(DELIVERIES).length} доставок и ${Object.keys(EFFECTS).length} эффектов`);
}

// ── 8. копия стартовых наборов в клиент не вернулась ──────────────────────
{
  /*
   * Экран создания ДЕРЖАЛ свою копию трёх стартовых наборов — ради первого
   * кадра: F6 отводит на него десять секунд, и ждать сервер ради трёх
   * карточек значило потратить их на ожидание. Причина была уважительная,
   * долг — настоящий, и однажды он сработал: сервер пересобрал наборы по
   * замерам (D30), в клиенте остались прежние, и экран показывал игроку один
   * набор, а существо получало другой.
   *
   * 31.08 карточки сняты совсем: набор следует из описания, выбирать нечего
   * (D156). Долг закрыт удалением, и проверка развёрнута — она больше не
   * сверяет копию, а следит, чтобы копия не завелась заново. Списка наборов
   * в клиенте быть не должно: имя пресета туда больше не ходит ни в одну
   * сторону.
   */
  const src = readFileSync(join(ROOT, 'src/client/screens/create.js'), 'utf8');
  const bad = [];
  for (const name of Object.keys(KIT_PRESETS)) {
    if (new RegExp(`${name}:\\s*\\{`).test(src)) bad.push(`${name}: копия вернулась в клиент`);
  }
  if (/kitPreset/.test(src)) bad.push('клиент снова шлёт kitPreset на сервер');
  ok('клиент не держит копии стартовых наборов', bad.length === 0,
    bad.length ? bad.join('; ') : 'набор приходит с сервера, разойтись нечему');
}

// ── 9. бюджет набора считается сервером и не обходится ─────────────────────
{
  const over = [
    { delivery: 'beam', effects: ['damage', 'stun', 'blind'], element: 'kinetic' },
    { delivery: 'beam', effects: ['damage', 'stun', 'blind'], element: 'kinetic' },
    { delivery: 'beam', effects: ['damage', 'stun', 'blind'], element: 'kinetic' },
  ];
  const total = over.reduce((s, k) => s + costOf(k), 0);
  const built = compileKit(over);
  ok('набор дороже бюджета не собирается', built.problems.length > 0, `цена ${total} против ${KIT_BUDGET}`);
}



// ── 10. E1: стихия бывает не всякой доставкой (docs/VFX-PLAN.md §7.5) ──────
{
  ok('E1: время не бывает лучом',
    validateSkill({ delivery: 'beam', effects: ['damage'], element: 'time' }).some((b) => b.code === 'E1'),
    'у времени только зона, себя и мигание');
  ok('E1: кислота бывает конусом',
    validateSkill({ delivery: 'cone', effects: ['burn'], element: 'acid' }).length === 0,
    'форма из списка стихии проходит');
  ok('E1 не трогает выпущенные стихии',
    validateSkill({ delivery: 'beam', effects: ['damage'], element: 'arc' }).length === 0,
    'у пяти выпущенных стихий формы не ограничены');
  ok('нерелизная стихия не отдаётся игроку',
    validateKit([
      { delivery: 'zone', effects: ['pull', 'damage'], element: 'gravity' },
      { delivery: 'self', effects: ['boost'], channel: 'armor', element: 'gravity' },
      { delivery: 'cone', effects: ['damage'], element: 'kinetic' },
    ]).some((b) => b.code === 'element_unreleased'),
    'правило набора: сиды и стенд компилируются, HTTP — нет');

  /* У стихии с модулем каждая ОБЕЩАННАЯ форма обязана быть в модуле:
     иначе стенд предложит кнопку, за которой штатный силуэт. Гейт зелен,
     пока файла модуля нет. */
  const NEW = new Set(['gravity', 'time', 'acid', 'radiation']);
  for (const [id, e] of Object.entries(ELEMENTS)) {
    if (!NEW.has(id) || !Array.isArray(e.forms)) continue;
    let mod = null;
    try { mod = await import(`../src/viewer/vfx/${id}.js`); } catch { continue; /* модуль ещё не написан */ }
    for (const f of e.forms) ok(`${id}: форма ${f} есть в модуле`, typeof mod[f] === 'function');
    for (const f of ['impact', 'status', 'charge']) ok(`${id}: ${f} есть в модуле`, typeof mod[f] === 'function');
  }
}

console.log(`\n  ${failed ? `ПРОВАЛ: ${failed}` : 'ДЕРЖИТ'}\n`);
process.exitCode = failed ? 1 : 0;
