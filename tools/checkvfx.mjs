/**
 * Гейт VFX уровня 1 (§9.2): что модель написала, то зритель переживёт.
 *
 *   node tools/checkvfx.mjs
 *   node tools/checkvfx.mjs --falsify   сломать правила и показать, что ловится
 *
 * ── зачем ──────────────────────────────────────────────────────────────────
 *
 * Уровень 1 — единственный слой генерации, который исполняется в браузере
 * ПОСТОРОННЕГО человека. Не автора существа, а зрителя, зашедшего посмотреть
 * чужой бой. Именно поэтому §9.2 отвергает уровень 3 письменно и навсегда, и
 * именно поэтому здесь проверяется не «красиво ли», а три вещи:
 *
 *   1. Никакой IR не может нарушить read-kit. Силуэт, палитра и импакт
 *      задаются сервером, и в грамматике частей нет ни одного поля, которым
 *      их можно тронуть. Это проверяется перебором ВСЕХ имён полей, а не
 *      верой в то, что я ничего не забыл.
 *   2. Никакой принятый IR не может стоить дороже бюджета кадра. Бюджет
 *      принуждается дважды — на записи и на воспроизведении, — потому что
 *      база переживает изменение пределов.
 *   3. Любой законный IR рисуется без исключения. «Худший случай — скучный
 *      эффект, а не чёрный экран» — это требование §9.2, и оно проверяемо
 *      только перебором.
 */

import { deepStrictEqual } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

import {
  DECALS, EMITTERS, MAX_DELAY, MAX_LAYERS, MAX_LIFE, MAX_PARTICLES, MAX_SHAKE,
  MOTIONS, SCREENS, SPRITES, canonicalIr, decorCount, validateIr, vfxGrammar,
} from '../src/vfx/ir.js';
import { ELEMENTS } from '../src/skills/registry.js';

const FALSIFY = process.argv.includes('--falsify');
let bad = 0;
const ok = (name, pass, note) => {
  console.log(`  ${pass ? '✓' : '✗'} ${name}${note ? `  ${note}` : ''}`);
  if (!pass) bad++;
};

const layer = (over = {}) => ({
  emitter: 'ring', motion: 'linear', sprite: 'dot', decal: 'none',
  from: 0, to: 2, count: 20, life: 0.8, delay: 0, speed: 3, size: 0.2, ...over,
});

console.log('\n  ГЕЙТ VFX УРОВНЯ 1 §9.2\n');

// ── 1. таблицы частей не отдают ключи прототипа ───────────────────────────
{
  /* Тот же класс, которым однажды пробивался бюджет умений: `TRIGGERS['constructor']`
     на обычном литерале возвращает функцию, то есть истину. */
  const keys = ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty'];
  const leaks = [];
  for (const [name, t] of [['EMITTERS', EMITTERS], ['MOTIONS', MOTIONS], ['SPRITES', SPRITES],
    ['DECALS', DECALS], ['SCREENS', SCREENS]]) {
    for (const k of keys) if (t[k] !== undefined) leaks.push(`${name}.${k}`);
  }
  ok('таблицы частей не отдают ключи прототипа', leaks.length === 0,
    leaks.length ? leaks.join(', ') : `${keys.length} ключей на 5 таблицах`);

  const viaProto = validateIr({ layers: [layer({ emitter: 'constructor' })] });
  ok('имя из прототипа не проходит как часть', viaProto.length > 0,
    viaProto.length ? `отвергнуто: ${viaProto[0].code}` : 'ПРОШЛО');
}

// ── 2. в IR нечем тронуть read-kit ────────────────────────────────────────
{
  /*
   * ПРОВЕРЯЕТСЯ НЕ НАМЕРЕНИЕ, А ПОВЕРХНОСТЬ.
   *
   * Правило «модель может добавлять, но не заменять» держится тем, что в
   * каноническом IR нет полей, называющих цвет, форму или силуэт. Значит
   * достаточно перебрать ВСЕ поля, которые канонизация выпускает наружу, и
   * убедиться, что запретных слов среди них нет. Так проверка не зависит от
   * того, помню ли я, что добавлял в грамматику в прошлый раз.
   */
  const FORBIDDEN = /color|colour|rgb|hex|tint|mesh|geometry|shader|material|silhouette|palette|texture|url|src|code|fn|eval/i;
  const full = canonicalIr({
    layers: [layer(), layer({ emitter: 'trail' }), layer({ emitter: 'rain' })],
    screen: 'shake', screenAmount: 0.1,
  });
  const names = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) { names.add(k); walk(v); }
  };
  walk(full);
  const leaks = [...names].filter((n) => FORBIDDEN.test(n));
  ok('в IR нет поля, которым можно тронуть read-kit', leaks.length === 0,
    leaks.length ? `запретные поля: ${leaks.join(', ')}` : `${names.size} полей, ни одного запретного`);

  /* Цвет выбирается ступенью палитры, и ступеней ровно столько, сколько в
     палитре элемента. Ступень вне диапазона — отказ, а не кламп: кламп принял
     бы «цвет номер 47» и молча нарисовал первый. */
  const stops = ELEMENTS.kinetic.palette.length;
  const outOfRange = validateIr({ layers: [layer({ from: stops })] });
  ok('ступень палитры вне диапазона отвергается', outOfRange.length > 0,
    `палитра из ${stops} ступеней, ${stops} отвергнута`);
}

// ── 3. бюджет частиц принуждается СУММОЙ ──────────────────────────────────
{
  const perLayer = validateIr({ layers: [layer({ count: MAX_PARTICLES + 1 })] });
  ok('слой дороже бюджета отвергается', perLayer.length > 0);

  /*
   * Главное здесь. Предел на слой без предела на сумму обходится копированием
   * слоя, и три «законных» слоя дают втрое больше бюджета. Именно так
   * выглядит дыра, которую легко не заметить: каждый слой по отдельности
   * проходит любую проверку.
   */
  const each = Math.ceil(MAX_PARTICLES / 2);
  const bySum = validateIr({ layers: [layer({ count: each }), layer({ count: each }), layer({ count: each })] });
  ok('три законных слоя не обходят бюджет суммой', bySum.some((p) => p.code === 'budget'),
    `${each} × 3 = ${each * 3} против бюджета ${MAX_PARTICLES}`);

  const tooMany = validateIr({ layers: Array.from({ length: MAX_LAYERS + 1 }, () => layer({ count: 1 })) });
  ok('слоёв больше предела отвергается', tooMany.some((p) => p.code === 'layers'),
    `${MAX_LAYERS + 1} слоёв против предела ${MAX_LAYERS}`);
}

// ── 4. время и экран ограничены ───────────────────────────────────────────
{
  ok('жизнь дольше предела отвергается', validateIr({ layers: [layer({ life: MAX_LIFE + 0.1 })] }).length > 0,
    `предел ${MAX_LIFE} с`);
  ok('задержка дольше предела отвергается', validateIr({ layers: [layer({ delay: MAX_DELAY + 0.1 })] }).length > 0,
    `предел ${MAX_DELAY} с`);
  ok('тряска сверх предела отвергается',
    validateIr({ layers: [layer()], screen: 'shake', screenAmount: MAX_SHAKE + 0.01 }).length > 0,
    `предел ${MAX_SHAKE}`);
  ok('экранный эффект без силы отвергается',
    validateIr({ layers: [layer()], screen: 'flash' }).length > 0,
    'screen без screenAmount — это «трясти на сколько получится»');
}

// ── 5. канонизация снимает лишнее ─────────────────────────────────────────
{
  /*
   * Проверка отвечает «да» или «нет», но не снимает добавок. Модель может
   * прислать законный IR с лишним полем: само по себе оно безвредно, но оно
   * доедет до базы, а через месяц кто-нибудь начнёт его читать.
   */
  const c = canonicalIr({
    layers: [{ ...layer(), сюрприз: 'привет', onclick: 'alert(1)' }],
    screen: 'none', лишнее: 1,
  });
  const keys = Object.keys(c.layers[0]);
  ok('канонизация не пропускает незнакомые поля',
    !keys.includes('сюрприз') && !keys.includes('onclick') && !('лишнее' in c),
    `наружу вышло ${keys.length} известных полей`);

  /* Дважды канонизированный IR обязан совпасть с однажды канонизированным:
     иначе форма зависит от того, сколько раз её трогали, и сравнить два IR
     нельзя. */
  let same = true;
  try { deepStrictEqual(canonicalIr(c), c); } catch { same = false; }
  ok('канонизация идемпотентна', same);

  ok('невалидный IR канонизируется в null', canonicalIr({ layers: [] }) === null);
}

// ── 6. КАЖДЫЙ законный IR рисуется без исключения ─────────────────────────
{
  /*
   * «Худший случай — скучный эффект, а не чёрный экран» (§9.2) проверяется
   * только перебором. Интерпретатор гоняется на заглушках пула: сам three.js
   * тут не нужен — нужна уверенность, что ни одна комбинация частей не
   * бросает и не выходит за бюджет.
   */
  const { playIr, resetBudget } = await import('../src/viewer/vfxir.js');
  let cases = 0; let drawn = 0; let over = 0; const errs = [];
  const evt = { element: 'kinetic', x0: 0, z0: 0, x1: 4, z1: 3, who: 'octopus', skill: 'k1' };

  for (const emitter of Object.keys(EMITTERS)) {
    for (const motion of Object.keys(MOTIONS)) {
      for (const sprite of Object.keys(SPRITES)) {
        for (const decal of Object.keys(DECALS)) {
          const ir = canonicalIr({ layers: [layer({ emitter, motion, sprite, decal, count: 40 })] });
          if (!ir) { errs.push(`${emitter}/${motion}/${sprite}/${decal}: не канонизировался`); continue; }
          cases++;
          let emitted = 0;
          const vfx = {
            now: 10,
            add: {
              emit: (n, fn) => {
                emitted += n;
                for (let k = 0; k < n; k++) {
                  fn(k, {
                    pos: (x, y, z) => { if (![x, y, z].every(Number.isFinite)) throw new Error('позиция не число'); },
                    vel: (x, y, z) => { if (![x, y, z].every(Number.isFinite)) throw new Error('скорость не число'); },
                    gravity: (x, y, z) => { if (![x, y, z].every(Number.isFinite)) throw new Error('ускорение не число'); },
                    color: (c) => { if (!c || !Number.isFinite(c.r)) throw new Error('цвет не цвет'); },
                    life: (born, secs, size) => {
                      if (!Number.isFinite(born) || !(secs > 0) || !(size > 0)) throw new Error('жизнь не число');
                    },
                  });
                }
              },
            },
          };
          try {
            /* Бюджет живёт между вызовами (один каст — одна декорация, потолок
               в секунду), а перебор — это 480 «кастов» в одну и ту же
               миллисекунду. Без сброса второй и все следующие законно
               получают ноль, и гейт читает это как «рисует пустоту». */
            resetBudget();
            if (playIr(vfx, ir, evt, {})) drawn++;
            if (emitted > MAX_PARTICLES) over++;
          } catch (e) { errs.push(`${emitter}/${motion}/${sprite}/${decal}: ${e.message}`); }
        }
      }
    }
  }
  ok('каждое сочетание частей рисуется без исключения', errs.length === 0,
    errs.length ? errs.slice(0, 3).join(' | ') : `${cases} сочетаний, все нарисованы`);
  ok('и ни одно не рисует больше бюджета', over === 0, `бюджет ${MAX_PARTICLES} частиц`);
  ok('и ни одно не рисует пустоту', drawn === cases, `${drawn} из ${cases}`);
}

// ── 6b. КАЖДАЯ ОСЬ ГРАММАТИКИ ДОЕЗЖАЕТ ДО ЭКРАНА ──────────────────────────
{
  /*
   * ЭТОТ ГЕЙТ НАПИСАН ПОТОМУ, ЧТО ПРЕДЫДУЩИЕ ЕГО НЕ ЛОВИЛИ.
   *
   * Проверка «всё рисуется без исключения» проходила при том, что две оси из
   * шести интерпретатор не читал ВОВСЕ: `sprite` и `decal` доезжали до базы,
   * проверялись валидатором — и не влияли ни на один пиксель. Все четыре
   * формы рисовались одинаковым мягким кругом, следа на полу не было никогда.
   * Поймано глазом на стенде, с низкого ракурса, а не гейтом.
   *
   * Это ровно то, что реестр умений запрещает дословно: разнообразие,
   * которого игрок не видит, разнообразием не является. Ось, за которую
   * платят генерацией и вниманием модели, обязана менять картинку — и
   * проверять это надо не «нарисовалось ли что-то», а «отличается ли».
   */
  const { playIr, resetBudget } = await import('../src/viewer/vfxir.js');
  const evt = { element: 'kinetic', x0: 0, z0: 0, x1: 4, z1: 3, who: 'octopus', skill: 'k1' };

  const run = (over) => {
    resetBudget();
    const shapes = new Set(); const sizes = new Set();
    let meshes = 0;
    const vfx = {
      now: 5,
      spawnMesh: () => { meshes++; },
      add: { emit: (n, fn) => {
        for (let k = 0; k < n; k++) {
          fn(k, {
            pos: () => {}, vel: () => {}, gravity: () => {}, color: () => {},
            life: (born, secs, size, shape) => { shapes.add(shape); sizes.add(Math.round(size * 1000)); },
          });
        }
      } },
    };
    playIr(vfx, canonicalIr({ layers: [layer(over)] }), evt, {});
    return { shapes: [...shapes], sizes: [...sizes], meshes };
  };

  const perSprite = Object.keys(SPRITES).map((sprite) => [sprite, run({ sprite })]);
  const codes = perSprite.map(([, r]) => r.shapes.join(','));
  ok('каждая форма спрайта уезжает в шейдер своим кодом', new Set(codes).size === codes.length,
    perSprite.map(([n, r]) => `${n}→${r.shapes.join('/')}`).join(' '));

  const scales = perSprite.map(([, r]) => r.sizes[0]);
  ok('и своим размером', new Set(scales).size === scales.length,
    perSprite.map(([n, r]) => `${n}:${(r.sizes[0] / 1000).toFixed(2)}м`).join(' '));

  for (const decal of Object.keys(DECALS)) {
    const r = run({ decal });
    const want = decal !== 'none';
    ok(`след «${decal}» ${want ? 'кладётся' : 'не кладётся'}`, (r.meshes > 0) === want,
      `мешей ${r.meshes}`);
  }

  /* Эмиттер и движение обязаны менять ТРАЕКТОРИЮ, а не только имя. */
  const path = (over) => {
    resetBudget();
    const pts = [];
    const vfx = { now: 5, spawnMesh: () => {}, add: { emit: (n, fn) => {
      for (let k = 0; k < n; k++) {
        fn(k, {
          pos: (x, y, z) => pts.push([x, y, z]),
          vel: (x, y, z) => pts.push([x, y, z]),
          gravity: (x, y, z) => pts.push([x, y, z]),
          color: () => {}, life: () => {},
        });
      }
    } } };
    playIr(vfx, canonicalIr({ layers: [layer({ ...over, count: 8 })] }), evt, {});
    return JSON.stringify(pts.map((p) => p.map((v) => Math.round(v * 100))));
  };
  const byEmitter = Object.keys(EMITTERS).map((emitter) => path({ emitter }));
  ok('каждый эмиттер даёт свою раскладку', new Set(byEmitter).size === byEmitter.length,
    `${byEmitter.length} эмиттеров, ${new Set(byEmitter).size} различимых`);
  const byMotion = Object.keys(MOTIONS).map((motion) => path({ motion }));
  ok('каждое движение даёт своё ускорение', new Set(byMotion).size === byMotion.length,
    `${byMotion.length} движений, ${new Set(byMotion).size} различимых`);

  /*
   * ЦВЕТ: ПРОВЕРЯЕТСЯ СОСТАВ, А НЕ СТРОКА.
   *
   * Здесь стояло `colours({from:0,to:0}) !== colours({from:2,to:2})` — то есть
   * сравнение двух строк. Оно проходило при том, что ось не влияла ни на один
   * пиксель: старый код брал цвет по фиксированному циклу и сдвигал индекс,
   * так что состав цветов оставался тем же, менялся только порядок. Строки
   * при этом честно различались.
   *
   * Это второй раз подряд одна и та же ошибка (первый — D70, мёртвые оси
   * спрайта и следа), и оба раза её пропускала проверка вида «что-то
   * изменилось». Поэтому здесь проверяется СОСТАВ: девять сочетаний ступеней
   * обязаны давать девять разных наборов цветов, однородный слой обязан быть
   * однородным, а слой «от края до края» — содержать оба края.
   */
  const colours = (over) => {
    const out = [];
    const vfx = { now: 5, spawnMesh: () => {}, add: { emit: (n, fn) => {
      for (let k = 0; k < n; k++) {
        fn(k, { pos: () => {}, vel: () => {}, gravity: () => {}, color: (c) => out.push(c.clone()), life: () => {} });
      }
    } } };
    resetBudget();
    playIr(vfx, canonicalIr({ layers: [layer({ ...over, count: 24 })] }), evt, {});
    return out;
  };
  /* Ключ — ПОСЛЕДОВАТЕЛЬНОСТЬ, а не множество: «от блика к ядру» и «от ядра
     к блику» состоят из одних цветов и выглядят по-разному, потому что
     первыми гаснут разные частицы. Множество их бы склеило. */
  const key = (list) => list.map((c) => `${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)}`).join('|');
  const nine = [];
  for (let f = 0; f <= 2; f++) for (let t2 = 0; t2 <= 2; t2++) nine.push([`${f}→${t2}`, key(colours({ from: f, to: t2 }))]);
  ok('девять сочетаний ступеней дают девять разных наборов цветов',
    new Set(nine.map(([, k]) => k)).size === 9,
    `различимых ${new Set(nine.map(([, k]) => k)).size} из 9`);

  const flat = colours({ from: 1, to: 1 });
  ok('однородный слой однороден', new Set(flat.map((c) => c.getHexString())).size === 1,
    `${new Set(flat.map((c) => c.getHexString())).size} цвет(ов)`);

  const span = colours({ from: 0, to: 2 });
  const first = span[0].getHexString(); const last = span[span.length - 1].getHexString();
  ok('слой от края до края меняет цвет по пачке', first !== last, `${first} → ${last}`);

  /* И видимость: ни одна частица не должна быть светлее белого пола. */
  const tooPale = [].concat(...nine.map((_, i) => [])).length;
  const worst = Math.max(...[0, 1, 2].flatMap((f) => [0, 1, 2].map((t2) => Math.max(
    ...colours({ from: f, to: t2 }).map((c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b),
  ))));
  ok('ни одна частица не сливается с белым полом', worst <= 0.83 && tooPale === 0,
    `самая светлая ${worst.toFixed(2)}, порог 0.83`);
}

// ── 6c. след на полу обязан быть виден на белом полу ──────────────────────
{
  /*
   * Пол арены белый (§10.1), и след, покрашенный светлой ступенью палитры,
   * на нём не виден вовсе — поймано глазом с верхнего ракурса на морозном
   * элементе, у которого первые две ступени яркостью 0.93 и 0.65.
   *
   * Правило измеримое, поэтому и проверяемое: след берёт ступень с
   * наибольшим контрастом к белому. Порог — контраст 3:1, нижняя планка
   * WCAG для крупной графики; ниже он перестаёт быть меткой места.
   */
  const { floorInk } = await import('../src/viewer/vfxir.js');
  const { palette } = await import('../src/viewer/vfx.js');
  const lum = (c) => {
    const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const worst = [];
  for (const el of Object.keys(ELEMENTS)) {
    const ink = floorInk(palette(el));
    const contrast = 1.05 / (lum(ink) + 0.05);
    worst.push([el, contrast]);
  }
  worst.sort((a, b) => a[1] - b[1]);
  ok('след виден на белом полу на каждом элементе', worst[0][1] >= 3,
    `худший ${worst[0][0]}: контраст ${worst[0][1].toFixed(1)}:1, порог 3:1`);
}

// ── 7. интерпретатор не верит базе на слово ───────────────────────────────
{
  /*
   * Этот IR не мог бы попасть в базу через валидатор — но мог попасть до того,
   * как пределы стали такими. Вьювер, который верит базе, однажды получит
   * каст на три тысячи частиц и уронит кадр ЗРИТЕЛЮ. Правило то же, что у
   * сервера с ценами умений: цифра снаружи не авторитетна, даже если снаружи —
   * это мы вчера.
   */
  const { playIr } = await import('../src/viewer/vfxir.js');
  const stale = {
    layers: [{ emitter: 'burst', motion: 'gravity', sprite: 'streak', decal: 'none',
      from: 0, to: 2, count: 3000, life: 99, delay: 0, speed: 400, size: 9 }],
    screen: 'shake', screenAmount: 5,
  };
  let emitted = 0; let shake = 0; let maxLife = 0; let maxSize = 0;
  const vfx = {
    now: 0,
    add: { emit: (n, fn) => {
      emitted += n;
      for (let k = 0; k < n; k++) {
        fn(k, {
          pos: () => {}, vel: () => {}, gravity: () => {}, color: () => {},
          life: (born, secs, size) => { maxLife = Math.max(maxLife, secs); maxSize = Math.max(maxSize, size); },
        });
      }
    } },
  };
  playIr(vfx, stale, { element: 'kinetic', x0: 0, z0: 0, x1: 1, z1: 0 },
    { shake: (a) => { shake = a; } });
  ok('устаревший IR из базы урезается по частицам', emitted <= MAX_PARTICLES, `${emitted} против ${MAX_PARTICLES}`);
  ok('и по жизни', maxLife <= MAX_LIFE, `${maxLife.toFixed(2)} против ${MAX_LIFE}`);
  ok('и по размеру', maxSize <= 1.2, `${maxSize}`);
  ok('и по тряске', shake <= MAX_SHAKE, `${shake} против ${MAX_SHAKE}`);
}

// ── 7b. БЮДЖЕТ ПРОВЕРЯЕТСЯ НА НАСТОЯЩЕМ БОЮ, А НЕ НА ОДНОМ ВЫЗОВЕ ─────────
{
  /*
   * ЗАЧЕМ ЭТОТ БЛОК СУЩЕСТВУЕТ.
   *
   * Все проверки выше гоняют `playIr` по одному разу и меряют, сколько он
   * потратил. Этого хватало ровно до тех пор, пока не выяснилось, что предел
   * «частиц на КАСТ» принуждался на ВЫЗОВ, а вызывается он на каждой записи
   * `world.fx`. Один каст зоны даёт их тринадцать: удар тикает каждые полсекунды,
   * self и targeted расщепляются надвое. Законный набор из трёх зон с законным
   * IR умножал бюджет в тринадцать раз — 2880 частиц в секунду в кольцо на 3000.
   *
   * Последствие тоньше, чем просадка кадра: декорация ВЫТЕСНЯЛА read-kit из
   * общего кольцевого пула, не тронув ни одного запретного поля. Правило
   * «добавлять, но не заменять» обходилось не через грамматику, а через
   * переполнение — то есть проверка полей его не охраняла вовсе.
   *
   * Поэтому здесь гоняется НАСТОЯЩИЙ бой настоящим движком, а декорация
   * играется на всех его записях `fx`, как это делает вьювер.
   */
  const { playIr, resetBudget } = await import('../src/viewer/vfxir.js');
  const { runMatch } = await import('../src/core/match.js');
  const { compileKit } = await import('../src/skills/compile.js');
  const { compileBrain } = await import('../src/brain/host.js');
  const { readFileSync: rf } = await import('node:fs');

  /*
   * НАБОР ВЫБРАН ВРАЖДЕБНО, А НЕ УДОБНО.
   *
   * Первая версия брала три зоны с уроном — и не задевала худший случай. Он
   * такой: атом `wall` на доставке `zone` пишет отдельную запись `fx` НА
   * КАЖДОМ ТИКЕ зоны, а тики идут через полсекунды. Именно на нём дедуп и
   * промахивался, и именно его гейт обязан гонять.
   *
   * Набор законный: `validateKit` его принимает, 51 очко из 52.
   */
  const zone = { delivery: 'zone', effects: ['wall', 'damage'], element: 'kinetic' };
  const kit = compileKit([
    zone,
    { ...zone, effects: ['wall', 'burn'] },
    { ...zone, effects: ['wall'] },
  ], { size: null });
  ok('враждебный набор законен, иначе гейт гоняет невозможное',
    kit.problems.length === 0, kit.problems.length ? kit.problems[0].ru : 'три зоны со стеной приняты');
  const heavy = canonicalIr({
    layers: [layer({ count: 40, decal: 'scorch' }), layer({ count: 40, decal: 'ring' }), layer({ count: 40, decal: 'cross' })],
    screen: 'flash', screenAmount: MAX_SHAKE,
  });

  const R = join(ROOT, 'brains/kit-stub/');
  const brains = {
    octopus: compileBrain(rf(join(R, 'octopus.js'), 'utf8'), 'octopus'),
    gorilla: compileBrain(rf(join(R, 'gorilla.js'), 'utf8'), 'gorilla'),
  };
  /* `record: true` — иначе кадры не пишутся вовсе и гейт «пройдёт» на нуле
     событий. Гейт, который ничего не померил и сказал «держит», хуже
     отсутствующего: он закрывает вопрос, не ответив на него. */
  const m = runMatch(brains, { seed: 11, record: true, kits: { octopus: kit.defs, gorilla: kit.defs } });

  const all = [];
  for (const fr of (m.frames || [])) for (const f of (fr.fx || [])) all.push({ ...f, t: f.t ?? fr.t });
  ok('бой дал записи эффектов, есть что мерить', all.length > 0, `${all.length} записей fx`);

  resetBudget();
  let spent = 0; let plays = 0; let meshes = 0; let flashes = 0;
  const perSecond = new Map();
  const vfx = {
    now: 0,
    spawnMesh: () => { meshes++; },
    add: { emit: (n) => {
      spent += n;
      const sec = Math.floor(vfx.now);
      perSecond.set(sec, (perSecond.get(sec) || 0) + n);
    } },
  };
  /*
   * ЗНАМЕНАТЕЛЬ БЕРЁТСЯ ИЗ ЛОГА СИМУЛЯЦИИ, А НЕ ИЗ ТОГО ЖЕ ПРЕДИКАТА.
   *
   * Здесь стояло `if (e.kind !== 'impact' && e.kind !== 'status') casts++` —
   * ровно то условие, по которому `playIr` решает, играть ли. Значит
   * `plays <= casts` было истинно ПО ПОСТРОЕНИЮ: три утверждения ниже не
   * могли упасть никогда, что бы ни делал интерпретатор.
   *
   * И под этим прикрытием инвариант был нарушён по-настоящему: атом `wall` на
   * доставке `zone` пишет запись `fx{kind:'wall'}` на КАЖДОМ тике зоны, тики
   * идут ровно через 0.5 с, а дедуп сравнивал строго `< CAST_GAP` (0.5) — то
   * есть не срабатывал ни разу. Законный набор давал 40 проигрываний на 20
   * касто́в, и гейт печатал ✓.
   *
   * Настоящий каст — это `use` или `passive` в логе боя: их пишет симуляция,
   * а не слой эффектов, и подогнать их под ответ нельзя.
   */
  /* Только `use`: событий `passive` больше нет — ось «триггер» снята (D102),
     и умения не срабатывают сами. Считать несуществующий тип значит завышать
     знаменатель и делать утверждение слабее, чем кажется. */
  const realCasts = (m.world?.log || []).filter((e) => e.type === 'use').length;
  ok('бой дал касты, есть с чем сравнивать', realCasts > 0, `${realCasts} касто́в в логе`);
  const casts = realCasts;
  for (const e of all) {
    if (!e.element) continue;
    vfx.now = Number.isFinite(e.t) ? e.t : vfx.now;
    const before = spent;
    playIr(vfx, heavy, e, { flash: () => { flashes++; } });
    if (spent > before) plays++;
  }

  const peak = Math.max(0, ...perSecond.values());
  ok('декорация не переполняет кольцо частиц', peak <= 900,
    `пик ${peak} частиц в секунду, потолок 900 (кольцо 3000)`);
  ok('декорация играется раз на каст, а не раз на запись боя', plays <= casts,
    `${plays} проигрываний на ${casts} касто́в и ${all.filter((e) => e.element).length} записей fx`);
  ok('следов на полу не больше, чем касто́в', meshes <= casts,
    `${meshes} мешей на ${casts} касто́в`);
  ok('вспышек кадра не больше, чем касто́в', flashes <= casts,
    `${flashes} вспышек`);
}

// ── 8. грамматика частей отдаётся наружу и считается ──────────────────────
{
  const g = vfxGrammar();
  ok('грамматика частей отдаётся целиком',
    !!(g.emitters && g.motions && g.sprites && g.decals && g.screens && g.limits),
    `${decorCount()} декораций на слой`);
  ok('пределы в грамматике совпадают с кодом',
    g.limits.layers === MAX_LAYERS && g.limits.particles === MAX_PARTICLES
    && g.limits.life === MAX_LIFE && g.limits.delay === MAX_DELAY && g.limits.shake === MAX_SHAKE);
}

// ── 9. разбор ответа модели ───────────────────────────────────────────────
{
  const { parseVfx } = await import('../src/server/forge/pipeline.js');
  const names = ['k1', 'k2', 'k3'];
  const good = JSON.stringify({ k1: { layers: [layer()] }, k2: { layers: [layer({ emitter: 'rain' })] } });
  const got = parseVfx(`вот держи:\n${good}\nготово`, names);
  ok('разбор достаёт JSON из болтовни модели', !!got && !!got.k1 && !!got.k2);

  /*
   * ОДНО КРИВОЕ УМЕНИЕ НЕ ЛИШАЕТ ДЕКОРАЦИИ ОСТАЛЬНЫЕ.
   *
   * Соблазн был отвергать весь ответ целиком — «раз ошиблись, переспросим».
   * Но переспрашивать стоит денег и времени игрока, а read-kit нарисует
   * кривое умение и без декорации. Выпадает только оно.
   */
  const mixed = JSON.stringify({ k1: { layers: [layer()] }, k2: { layers: [layer({ count: 99999 })] } });
  const part = parseVfx(mixed, names);
  ok('кривое умение выпадает, целые остаются', !!part && !!part.k1 && !part.k2);

  ok('мусор разбирается в null', parseVfx('никакого джейсона', names) === null);
  ok('пустой ответ разбирается в null', parseVfx('{}', names) === null);
}

if (FALSIFY) {
  console.log('\n  --falsify: ломаем правила и смотрим, ловится ли\n');
  /* Каждая строка тут — это дыра, которая реально была бы дырой. */
  const breaks = [
    ['цвет строкой вместо ступени', { layers: [{ ...layer(), from: '#ff0000' }] }],
    ['отрицательное число частиц', { layers: [layer({ count: -5 })] }],
    ['дробное число частиц', { layers: [layer({ count: 2.5 })] }],
    ['жизнь ноль', { layers: [layer({ life: 0 })] }],
    ['слой не объект', { layers: ['ring'] }],
    ['layers не массив', { layers: { emitter: 'ring' } }],
    ['IR это массив', [layer()]],
    ['NaN в скорости', { layers: [layer({ speed: NaN })] }],
    ['Infinity в размере', { layers: [layer({ size: Infinity })] }],
  ];
  for (const [why, ir] of breaks) {
    ok(`ловится: ${why}`, validateIr(ir).length > 0, validateIr(ir)[0]?.code || 'ПРОШЛО');
  }
}

console.log(bad ? `\n  ПРОВАЛ: ${bad}\n` : '\n  ДЕРЖИТ\n');
process.exit(bad ? 1 : 0);
