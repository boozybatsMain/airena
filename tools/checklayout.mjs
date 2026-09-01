/**
 * Текст не лежит на тексте — гейт по §10.6.
 *
 * Боевой HUD собран из трёх абсолютно позиционированных блоков: карточки
 * бойцов прижаты к краям, часы и подпись стоят по центру. Ни один из трёх не
 * знает про остальные, поэтому «помещается» — свойство ШИРИНЫ ОКНА, а не
 * вёрстки, и проверять его надо на нескольких ширинах.
 *
 * Найдено ревью замером, а не глазами: при 1280×720 подпись авторства лежала
 * на плитке кулдауна (70×24 px), id модели — на часах (112×16). При 1440
 * наложений нет вовсе, поэтому глазами на рабочем ноутбуке это не видно
 * никогда.
 *
 * Проверка честная: страница поднимается в настоящем браузере, HUD
 * заполняется настоящим боем, и прямоугольники сравниваются попарно. Без
 * браузера этого не сделать — расположение считает движок, а не CSS-файл.
 *
 * Гейт НЕ входит в `npm test`: он требует поднятого сервера и браузера, а
 * `npm test` обязан работать на голой машине. Он входит в ручной прогон перед
 * выпуском и запускается одной командой.
 *
 *   node tools/checklayout.mjs --result=<файл с пробой>
 */

const WIDTHS = [[1024, 768], [1200, 800], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]];

/*
 * Проба идёт по ВСЕМ листовым текстовым узлам HUD, а не по списку селекторов:
 * список пропускает ровно то, о чём не подумали. Исключаются два класса, и оба
 * названы:
 *
 *   `.dmg` — всплывающий урон. Он мировой и живёт секунду: пролетать над
 *     текстом — его работа.
 *   `.who` — подпись победителя. Это анимированная плашка, которая проезжает
 *     через экран и исчезает; в установившемся состоянии её нет вовсе
 *     (замерено: сразу после анимации её прямоугольник 0×0).
 *
 * Всё остальное обязано не пересекаться в УСТАНОВИВШЕМСЯ состоянии — и во
 * время боя, и после него.
 */
const EXCLUDE = ['.dmg', '.who'];

export const PROBE = `(() => {
  const skip = ${JSON.stringify(EXCLUDE)};
  const walk = (n, out = []) => {
    for (const c of (n ? n.childNodes : [])) {
      if (c.nodeType === 3 && c.textContent.trim()) {
        const e = c.parentElement;
        const r = e.getBoundingClientRect();
        if (r.width > 4 && r.height > 4 && e.offsetParent !== null) out.push({ s: c.textContent.trim().slice(0, 16), r, e });
      } else if (c.nodeType === 1) walk(c, out);
    }
    return out;
  };
  const boxes = [...walk(document.querySelector('#hud')), ...walk(document.querySelector('#screen'))]
    .filter((x) => !skip.some((k) => x.e.closest(k)));
  const hit = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].e.contains(boxes[j].e) || boxes[j].e.contains(boxes[i].e)) continue;
      const a = boxes[i].r; const b = boxes[j].r;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 2 && h > 2) hit.push(boxes[i].s + ' × ' + boxes[j].s + ': ' + Math.round(w) + '×' + Math.round(h));
    }
  }
  return hit;
})()`;

/*
 * ── ЭТОТ ФАЙЛ РАНЬШЕ ВСЕГДА ВЫХОДИЛ НУЛЁМ ─────────────────────────────────
 *
 * Он печатал инструкцию и завершался успехом — то есть выглядел гейтом и им
 * не был. Ревью проверило: `node tools/checklayout.mjs --url=http://localhost:9999`
 * при отсутствующем сервере давал EXIT 0.
 *
 * Поднять браузер отсюда нечем: в зависимостях проекта `three` и `ws`, а
 * тащить `playwright` ради одной проверки — плата, которую платят все и
 * всегда. Поэтому файл теперь честен в обе стороны: он ТРЕБУЕТ, чтобы ему
 * дали результат пробы, и падает, если результата нет.
 *
 * Как этим пользоваться: прогнать `PROBE` в браузере на каждой ширине из
 * `WIDTHS` и передать сюда собранное — файлом или через `--result=`.
 * Тогда «ноль пересечений» становится проверяемым утверждением, а не рассказом
 * о том, что кто-то когда-то смотрел.
 */
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('\n  РАСКЛАДКА БОЕВОГО ЭКРАНА\n');
  const file = arg('result');
  if (!file) {
    console.log('  Нужен результат пробы. Порядок:');
    console.log('    1. поднять сервер, открыть арену, дождаться боя;');
    console.log('    2. на каждой ширине из списка выполнить в консоли выражение PROBE');
    console.log('       (экспортируется этим файлом) — оно возвращает массив пересечений;');
    console.log('    3. сложить всё в JSON вида {"1280x720": [], "1366x768": [], …}');
    console.log('       и передать сюда: node tools/checklayout.mjs --result=<файл>\n');
    console.log('  Ширины:', WIDTHS.map(([w, h]) => `${w}×${h}`).join(', '));
    console.log('\n  ПРОВАЛ: результата пробы нет, проверять нечего\n');
    process.exit(1);
  }
  const { readFileSync } = await import('node:fs');
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { console.log(`  ПРОВАЛ: ${file} не читается — ${e.message}\n`); process.exit(1); }

  let bad = 0;
  for (const [w, h] of WIDTHS) {
    const key = `${w}x${h}`;
    const got = data[key];
    if (!Array.isArray(got)) { console.log(`  ✗ ${key}: пробы нет`); bad++; continue; }
    if (got.length) { console.log(`  ✗ ${key}: пересечений ${got.length} — ${got[0]}`); bad++; continue; }
    console.log(`  ✓ ${key}: пересечений нет`);
  }
  console.log(bad ? `\n  ПРОВАЛ: ${bad}\n` : '\n  ДЕРЖИТ\n');
  process.exit(bad ? 1 : 0);
}
