/**
 * Читается ли текст — гейт по §10 и по этапу 5.
 *
 * «Сделай светлую тему» — это не смена шести чисел. Токены цвета подобраны под
 * тёмный фон: `--dim: #93a5b4` на `#10151f` читается, а на белом превращается в
 * серое по светло-серому. Такую поломку не видно на скриншоте того, кто её
 * сделал: глаз достраивает знакомый текст.
 *
 * Поэтому — не вкусовщина, а WCAG. Отношение яркостей 4.5:1 для обычного текста
 * и 3:1 для крупного (≥ 18.66 px при 700, ≥ 24 px иначе) — это AA, и это тот
 * же порог, которым пользуются все остальные.
 *
 * ЧТО ПРОВЕРЯЕТСЯ. Пары «цвет текста на фоне» перечислены здесь списком, а не
 * выведены из CSS: вывести их значило бы написать второй браузер. Список
 * маленький и явный, каждая пара названа человеческими словами, и когда
 * появится следующая — её придётся вписать руками, то есть подумать.
 *
 * Токены читаются ИЗ `kit.css`, а не дублируются: гейт, у которого своя копия
 * палитры, через месяц проверяет чужую палитру.
 *
 *   node tools/checkcontrast.mjs
 *   node tools/checkcontrast.mjs --verbose
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');

const css = readFileSync(join(ROOT, 'src/client/ui/kit.css'), 'utf8');

/** Значения токенов из `:root` — только цвета, только hex и rgb/rgba. */
function tokens() {
  const block = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
  const out = {};
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
  return out;
}
const T = tokens();

/** Разрешить `var(--x)` по цепочке, чтобы алиасы не приходилось повторять. */
function value(v, depth = 0) {
  if (depth > 8) return v;
  const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(String(v).trim());
  return m && T[m[1]] ? value(T[m[1]], depth + 1) : v;
}

/** Принимает и имя токена (`--ink`), и готовое значение (`#fff`, `rgba(...)`). */
function parse(v) {
  const s = String(value(T[String(v).trim()] ?? v)).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return m[1].split('').map((c) => parseInt(c + c, 16)).concat(1);
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  return null;
}

/** Полупрозрачный цвет поверх фона — то, что реально увидит глаз. */
const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3])).concat(1);

const lin = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function ratio(fgTok, bgTok) {
  const bg = parse(bgTok); let fg = parse(fgTok);
  if (!bg || !fg) return null;
  if (fg[3] < 1) fg = over(fg, bg);
  const a = lum(fg); const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/*
 * Пары. `big: true` — там, где текст крупный по CSS: имена бойцов 21 px,
 * заголовки экранов. Для них AA просит 3:1, и требовать 4.5 значило бы
 * запретить ровно ту крупную типографику, ради которой этап 5 и затеян.
 */
const PAIRS = [
  ['основной текст на странице', '--ink', '--bg-page'],
  ['основной текст на плитке', '--ink', '--bg-cell'],
  ['второстепенный текст на странице', '--dim', '--bg-page'],
  ['второстепенный текст на плитке', '--dim', '--bg-cell'],
  ['имя осьминога на сцене', '--name-cy', '--bg-scene', true],
  ['имя гориллы на сцене', '--name-or', '--bg-scene', true],
  ['цвет осьминога на странице', '--oct', '--bg-page', true],
  ['цвет гориллы на странице', '--gor', '--bg-page', true],
  ['опасность на странице', '--bad', '--bg-page'],
  ['успех на странице', '--ok', '--bg-page'],
  ['предупреждение на странице', '--warn', '--bg-page'],
];

let bad = 0;
console.log('\n  КОНТРАСТ ТЕКСТА (WCAG AA)\n');
for (const [what, fg, bg, big] of PAIRS) {
  const need = big ? 3 : 4.5;
  const r = ratio(fg, bg);
  if (r === null) {
    console.log(`  ✗ ${what}: не разобрал ${fg}=${T[fg]} или ${bg}=${T[bg]}`);
    bad++;
    continue;
  }
  const pass = r >= need;
  if (!pass) bad++;
  if (!pass || VERBOSE) {
    console.log(`  ${pass ? '✓' : '✗'} ${what.padEnd(34)} ${r.toFixed(2)}:1  нужно ${need}:1`
      + `  (${parse(fg)?.slice(0, 3).join(',')} на ${parse(bg)?.slice(0, 3).join(',')})`);
  }
}
if (!bad && !VERBOSE) console.log(`  ✓ все ${PAIRS.length} пар проходят AA`);

/*
 * Стороны обязаны различаться МЕЖДУ СОБОЙ, а не только с фоном. Циан и оранж
 * несут в бою единственное значение — «это мой боец», — и на светлой теме их
 * легко свести к одной пастельной каше. Порог тот же ΔE 10 в Lab, что стоит на
 * элементах умений (`tools/checkgrammar.mjs`): один порог на весь проект.
 */
{
  const f = (t) => { const v = t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; return v; };
  const lab = (tok) => {
    const [r, g, b] = parse(tok);
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
    const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const [a, b] = [lab('--oct'), lab('--gor')];
  const dE = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const pass = dE >= 10;
  if (!pass) bad++;
  console.log(`  ${pass ? '✓' : '✗'} стороны различимы между собой  ΔE ${dE.toFixed(1)}, порог 10`);
}

/*
 * ── ЗАШИТЫЙ ФОН ТОЖЕ СУДИТСЯ ──────────────────────────────────────────────
 *
 * Проверка выше смотрит на ПАРЫ ТОКЕНОВ из `:root` — и по построению не видит
 * фон, зашитый прямо в правило. Ревью нашло четыре таких: `.card.on` (#17202e,
 * выбранный пресет на экране создания), `.skillrow` (1.43:1 — экран набора),
 * `.unfit` (карточка существа) и `.skel` (чёрные полосы загрузки на белом).
 * Все четыре — тот самый тёмно-синий, который основатель запретил дословно, и
 * гейт был зелёным: он ловил не тот класс поломки, ради которого написан.
 *
 * Здесь правила разбираются попарно «фон — текст»: у каждого селектора с
 * заливкой берётся его собственный `color` и `color` его потомков (селекторов,
 * начинающихся с него же). Это не каскад браузера, но именно так эти два файла
 * и написаны, и именно эту связь надо проверить.
 */

/*
 * Какое правило задаёт цвет ИМЕННО этому фону.
 *
 * Браузер решает это специфичностью; здесь хватает трёх ступеней, потому что
 * эти два файла так и написаны: тот же селектор → семейство того же класса →
 * потомки. Важно брать САМУЮ ТОЧНУЮ ступень и не смешивать её с остальными:
 * `find` по всему списку возвращал `.btn` там, где цвет задаёт `.btn.primary`,
 * и яркая кнопка объявлялась ошибкой при собственном тёмном тексте.
 */
const baseOf = (sel) => sel.replace(/^([.#]?[\w-]+)(?:[.:][^\s]*)*/, '$1');
/* Состояние — не другой элемент: `.btn.primary:hover` наследует цвет от
   `.btn.primary`, а не от соседа `.btn.ghost`. Без этой ступени наведение на
   яркую кнопку сравнивалось со светлым текстом обычной. */
const statelessOf = (sel) => sel.replace(/:{1,2}[\w-]+(\([^)]*\))?/g, '');
function inksFor(rules, sel) {
  const base = baseOf(sel);
  const bare = statelessOf(sel);
  const rank = (x) => {
    if (x.sel === sel) return 4;
    if (statelessOf(x.sel) === bare) return 3;
    if (x.sel.startsWith(base) && !x.sel.includes(' ')) return 2;
    if (x.sel.startsWith(`${sel} `) || x.sel.startsWith(`${base} `)) return 1;
    return 0;
  };
  const cand = rules.filter((x) => x.fg && rank(x) > 0);
  if (!cand.length) return [];
  const top = Math.max(...cand.map(rank));
  return cand.filter((x) => rank(x) === top);
}

const rules = [];
for (const file of ['src/client/ui/app.css', 'src/client/ui/kit.css']) {
  const text = readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().split('\n').pop().trim();
    if (!sel || sel.startsWith('@')) continue;
    const bg = /(?:^|[^-\w])background(?:-color)?\s*:\s*([^;]+)/.exec(m[2]);
    const fg = /(?:^|[^-\w])color\s*:\s*([^;]+)/.exec(m[2]);
    const one = (v) => (v ? (v[1].match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|var\(--[a-z0-9-]+\)/) || [null])[0] : null);
    rules.push({ file, sel, bg: one(bg), fg: one(fg) });
  }
}

let pairs = 0;
for (const r of rules) {
  if (!r.bg) continue;
  const bgPx = parse(r.bg);
  if (!bgPx) continue;
  /*
   * Полупрозрачное — поверх ФОНА СТРАНИЦЫ, а не поверх белого.
   *
   * Здесь стояло `[255, 255, 255, 1]` — остаток светлой темы, и он пережил её
   * отмену. На тёмной странице гейт складывал тёмную плашку с белым, получал
   * светлую поверхность и объявлял читаемый текст нечитаемым: `.skillrow`
   * читался как 1.53:1 при настоящих 6.98. Проверка, знающая цвет темы
   * наизусть, врёт при первой её смене — здесь это уже второй такой случай.
   */
  const bgSeen = bgPx[3] < 1 ? over(bgPx, parse('--bg-page')) : bgPx;
  /*
   * База селектора — то, к чему прицеплено состояние. `.card.on` это `.card`
   * плюс состояние, и текст внутри него описан правилами `.card .hd`, а не
   * `.card.on .hd`. Без этого шага негативный контроль не срабатывал: я вернул
   * тёмный `#17202e` в `.card.on`, и гейт остался зелёным — то есть проверял
   * не то, что нашло ревью.
   */
  const base = (sel) => sel.replace(/^([.#]?[\w-]+)(?:[.:][^\s]*)*/, '$1');
  const b0 = base(r.sel);
  const inks = inksFor(rules, r.sel).map((x) => ({ sel: x.sel, px: parse(x.fg) })).filter((x) => x.px);
  for (const ink of inks) {
    pairs++;
    const fg = ink.px[3] < 1 ? over(ink.px, bgSeen) : ink.px;
    const a = lum(fg); const b = lum(bgSeen);
    const ratio2 = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    /* 3:1 — порог AA для крупного текста. Правила ниже него читаются плохо при
       ЛЮБОМ размере, и это тот случай, который ревью нашло глазами. */
    if (ratio2 < 3) {
      console.log(`  ✗ ${r.file}: «${ink.sel}» на фоне «${r.sel}» — ${ratio2.toFixed(2)}:1`);
      bad++;
    }
  }
}
if (!bad) console.log(`  ✓ ${pairs} пар «зашитый фон — текст» проходят, худшая не ниже 3:1`);

/*
 * И заливка БЕЗ ТЕКСТА — отдельно, потому что парная проверка её не видит.
 * Так однажды проехал `.skel`: полосы-скелетоны рисуются градиентом и текста в
 * себе не держат, а на чужом по яркости фоне читаются как дыры на месте ещё не
 * приехавшего содержимого.
 *
 * ── ПРОВЕРКА ЗНАЕТ ТЕМУ, А НЕ НАЗЫВАЕТ ЕЁ ─────────────────────────────────
 *
 * Сначала здесь было «тёмных заливок не бывает» — правило, написанное под
 * светлую тему и переставшее что-либо значить в ту минуту, когда основатель
 * вернул тёмную. Гейт, знающий цвет темы наизусть, живёт до первой смены темы
 * и потом врёт.
 *
 * Тема берётся из `--bg-page`, и требование формулируется относительно неё:
 * заливка не может быть по ДРУГУЮ сторону середины яркости, чем страница.
 * Тёмная страница — тёмные плашки; светлая — светлые. Смена темы правит один
 * токен, а не этот файл.
 *
 * Судятся только СЫРЫЕ литералы: заливка ролевым токеном (`var(--oct)` в
 * полосе бюджета) — это краска, а не поверхность, и она обязана быть контрастной.
 */
const pageDark = lum(parse('--bg-page')) < 0.5;
/*
 * `#vfxflash` — не поверхность, а ВСПЫШКА. Белый здесь и есть эффект: ось
 * `screen: 'flash'` из VFX-IR (§9.2) на долю секунды заливает кадр светом,
 * а `opacity` в покое ровно ноль. Судить её по правилу «тёмная страница —
 * тёмные плашки» значит требовать тёмной вспышки.
 */
const DARK_OK = [/\.plate \.t\b/, /#ff4d3d/, /#vfxflash/];
let fills = 0;
for (const r of rules) {
  if (!r.bg || r.bg.startsWith('var(')) continue;
  if (DARK_OK.some((re) => re.test(r.sel) || re.test(r.bg))) continue;
  const px = parse(r.bg);
  if (!px) continue;
  /* Полупрозрачное — поверх страницы: важно то, что увидит глаз. */
  const page = parse('--bg-page');
  const seen = px[3] < 1 ? over(px, page) : px;
  const fillDark = lum(seen) < 0.35;
  const fillLight = lum(seen) > 0.65;
  /*
   * Инверсный элемент — не ошибка, а приём. Единственная яркая кнопка на
   * тёмной странице читается ровно потому, что она одна такая, и текст на ней
   * задан тёмным НАРОЧНО. Отличается это от промаха одним признаком: у той же
   * заливки есть свой цвет текста, лежащий по другую сторону от неё.
   */
  const ownInk = inksFor(rules, r.sel)[0];
  const inkPx = ownInk && parse(ownInk.fg);
  const deliberate = inkPx && (lum(inkPx) < 0.35) !== (lum(seen) < 0.35);
  if (!deliberate && ((pageDark && fillLight) || (!pageDark && fillDark))) {
    console.log(`  ✗ заливка не по теме: «${r.sel}» → ${r.bg.trim()} (яркость ${lum(seen).toFixed(2)}, страница ${pageDark ? 'тёмная' : 'светлая'})`);
    bad++; fills++;
  }
}
if (!fills) console.log(`  ✓ все заливки на стороне темы (страница ${pageDark ? 'тёмная' : 'светлая'})`);

console.log(bad ? `\n  ПРОВАЛ: ${bad}\n` : '\n  ДЕРЖИТ\n');
process.exit(bad ? 1 : 0);
