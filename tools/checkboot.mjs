/**
 * F6 — гейт первого кадра. Цифра, а не декларация.
 *
 * §F6 обещает игроку первый кадр боя за десять секунд по p75. Обещание,
 * которое никто не меряет, — это не обещание, а надежда, и D16 записал это
 * прямо: «цифра без замера не выполняется, а декларируется». Этот файл
 * существовал только в двух ссылках — в D16 и в комментарии `src/client/app.js`,
 * обе утверждали, что он работает, и обе были неправдой. Такая ссылка хуже
 * отсутствия проверки: она закрывает вопрос, не отвечая на него.
 *
 * ЧТО ИМЕННО МЕРИТСЯ. Не время — оно зависит от канала и машины зрителя, и
 * замерить его здесь честно нельзя. Мерится ВЕС: сколько байт браузер обязан
 * скачать и разобрать, прежде чем нарисует первый кадр. Вес — то, чем мы
 * управляем, и единственное, что мы можем испортить в один коммит.
 *
 * Бюджет выведен из обещания, а не выбран: на 10 Мбит/с (медленный домашний
 * канал 2026 года, p75 для мобильного LTE) десять секунд — это около 12 МБ,
 * из которых половина уходит на установление соединений, разбор и первый
 * рендер WebGPU. Отсюда 6 МБ несжатого и 1.8 МБ сжатого на КРИТИЧЕСКИЙ путь —
 * то, без чего кадра не будет.
 *
 * Что в критический путь НЕ входит: тела существ (грузятся после первого
 * кадра, `swapBody`), шрифты (текст рисуется системным, пока они едут),
 * дев-инструменты (в бандл игрока не попадают — это проверяет checkscope).
 *
 *   node tools/checkboot.mjs
 *   node tools/checkboot.mjs --list    показать вклад каждого файла
 */

import { gzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIST = process.argv.includes('--list');

/** Потолки критического пути. */
export const RAW_BUDGET = 6 * 1024 * 1024;
export const GZIP_BUDGET = 1.8 * 1024 * 1024;

const ENTRY = 'src/client/index.html';
const EXT = new Set(['.js', '.mjs', '.html', '.css']);
const MOUNTS = [
  ['/viewer/', 'src/viewer'],
  ['/skills/', 'src/skills'],
  ['/vendor/', 'node_modules/three/build'],
  ['/bodies/', 'bodies'],
  ['/fonts/', 'src/client/fonts'],
  ['/', 'src/client'],
];
const LINK = /(?:import\s*\(\s*[`'"]([^`'"$]+)|from\s*['"]([^'"]+)|<script[^>]+src=["']([^"']+)|<link[^>]+href=["']([^"']+)|import\s+['"]([^'"]+))/g;

function resolveRef(ref, from) {
  if (!ref || /^https?:/.test(ref)) return null;
  const clean = ref.split('?')[0];
  if (clean.startsWith('.')) return resolve(dirname(from), clean);
  if (clean === 'three') return join(ROOT, 'node_modules/three/build/three.webgpu.min.js');
  if (clean === 'three/tsl') return join(ROOT, 'node_modules/three/build/three.tsl.min.js');
  /* The importmap's `three/addons/` → `/vendor-addons/` → three's examples/jsm.
     The post nodes the viewer awaits before its first frame (GTAO, denoise,
     SMAA, FXAA, bloom) live there, and without this line they were absent
     from the critical path this gate weighs. */
  if (clean.startsWith('three/addons/')) return join(ROOT, 'node_modules/three/examples/jsm', clean.slice(13));
  for (const [pre, dir] of MOUNTS) if (clean.startsWith(pre)) return join(ROOT, dir, clean.slice(pre.length));
  return null;
}

/**
 * Файлы критического пути.
 *
 * Тела исключены нарочно: первый кадр рисуется телами архетипов, а
 * сгенерированное тело подменяется уже во время боя (`swapBody`), так что в
 * ожидание первого кадра оно не входит.
 */
function critical() {
  const seen = new Set();
  const queue = [join(ROOT, ENTRY)];
  while (queue.length) {
    const f = queue.shift();
    if (seen.has(f) || !EXT.has(extname(f))) continue;
    if (relative(ROOT, f).startsWith('bodies')) continue;
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { continue; }
    seen.add(f);
    for (const m of text.matchAll(LINK)) {
      const ref = m[1] || m[2] || m[3] || m[4] || m[5];
      const next = resolveRef(String(ref || '').replace(/['"]/g, ''), f);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen];
}

const files = critical();
let raw = 0; let gz = 0;
const rows = [];
for (const f of files) {
  let buf;
  try { buf = readFileSync(f); } catch { continue; }
  const g = gzipSync(buf).length;
  raw += buf.length; gz += g;
  rows.push({ f: relative(ROOT, f), raw: buf.length, gz: g });
}
rows.sort((a, b) => b.gz - a.gz);

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} МБ`;
console.log(`\n  F6 — вес критического пути (${files.length} файлов)\n`);
if (LIST) {
  for (const r of rows.slice(0, 14)) {
    console.log(`  ${r.f.padEnd(46)} ${mb(r.raw).padStart(9)}  →  ${mb(r.gz).padStart(9)} сжатым`);
  }
  console.log('');
}
console.log(`  несжатым  ${mb(raw).padStart(9)}  из ${mb(RAW_BUDGET)}`);
console.log(`  сжатым    ${mb(gz).padStart(9)}  из ${mb(GZIP_BUDGET)}`);

/**
 * И ЧТО ИЗ ЭТОГО ВЫШЛО НА САМОМ ДЕЛЕ.
 *
 * Выше — вес: единственное, чем мы управляем, и единственное, что судится.
 * Но байты — это половина обещания F6: вторая половина в том, во что кадр
 * обходится, когда арена уже поднялась, и её этот файл не мерил никогда.
 * Теперь мерит страница (`window.__airenaStats`, `window.__airenaDrawn`), а
 * `tools/shots.mjs` кладёт числа рядом с каждым снимком — так что здесь их
 * достаточно ПРОЧИТАТЬ и показать рядом с весом.
 *
 * Это СПРАВКА, а не ворота: снимков может не быть вовсе (чистый клон), они
 * могут быть месячной давности, и сняты они в headless Chrome, чей GPU
 * медленнее живого. Проваливать сборку по такому числу нечестно; молчать о
 * нём — тоже, потому что «10 секунд до первого кадра» проверяется им, а не
 * гигабайтами.
 */
function measured() {
  const dirs = ['reports/screens/ui', 'reports/screens/fps'].map((d) => join(ROOT, d)).filter((d) => existsSync(d));
  const seen = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      let j;
      try { j = JSON.parse(readFileSync(join(dir, name), 'utf8')); } catch { continue; }
      const sig = j.signals || {};
      const first = sig.drawn && sig.drawn.firstMs;
      const per = (sig.stats && sig.stats.msPerFrame) || sig.msPerFrame;
      /* `drawMs` — сколько из кадра страница потратила на сам вызов отрисовки.
         Дельта между кадрами под vsync — это период дисплея, когда запас есть,
         и стоимость кадра, когда его нет; отличить одно от другого можно
         только этим числом (`window.__airenaStats.drawMs`). */
      const draw = (sig.stats && sig.stats.drawMs) || null;
      /* НЕЛЬЗЯ ОТБРАСЫВАТЬ СНИМОК ЗА ТО, ЧТО ОН НИЧЕГО НЕ НАРИСОВАЛ. Условие
         «нет ни первого кадра, ни среднего» выбрасывало ровно те снимки, ради
         которых стоит смотреть в эту таблицу: страницу, где кадр упал и
         пустой холст ушёл в PNG. Такой снимок теперь остаётся — у него просто
         нет чисел, зато есть счётчики и ошибка. */
      const broke = (sig.drawn && (sig.drawn.blank > 0 || sig.drawn.direct > 0))
        || (Array.isArray(j.errors) && j.errors.length > 0);
      if (!first && !per && !broke) continue;
      seen.push({
        at: statSync(join(dir, name)).mtimeMs, first: first || null, per: per || null, draw, name,
        /* Из чего складываются секунды ДО первого кадра (`mark()` в
           `src/viewer/main.js`). Пока снимок их не несёт — старый снимок,
           другая ветка — колонка просто пустая. */
        marks: sig.marks || null,
        /* Кадры, которые нарисовал запасной путь (`direct`), и кадры, которых
           не нарисовал НИКТО (`blank`) — см. ниже, «кадры, которых никто не
           рисовал». Плюс разрешённая палитра сторон, которую вьювер вешает
           рядом (`window.__airenaDrawn.sides`). */
        direct: (sig.drawn && sig.drawn.direct) || 0,
        blank: (sig.drawn && sig.drawn.blank) || 0,
        sides: (sig.drawn && sig.drawn.sides) || null,
        errs: Array.isArray(j.errors) ? j.errors : [],
      });
    }
  }
  if (!seen.length) return null;
  seen.sort((a, b) => b.at - a.at);
  const fresh = seen.slice(0, 24);
  const mean = (k) => {
    const v = fresh.map((x) => x[k]).filter((x) => typeof x === 'number' && x > 0);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const slow = fresh.filter((x) => typeof x.per === 'number' && x.per > 1000 / 30);
  /*
   * ── ИЗ ЧЕГО СОСТОЯТ СЕКУНДЫ ДО ПЕРВОГО КАДРА ──────────────────────────────
   *
   * `firstDraw` в среднем 9.1 с при обещанных десяти, и до этого замера
   * ЕДИНСТВЕННЫМ измеренным куском была стоимость самой первой отрисовки.
   * Остальные шесть секунд — от `screenReady` до `rendererReady` — были одним
   * числом, внутри которого лежат: загрузка и разбор модулей, поднятие
   * устройства WebGPU, сборка сцены (`buildEnvironment` с её PMREM), сборка
   * пост-графа и два прогрева конвейеров. Оптимизировать не измеренное нельзя,
   * поэтому вьювер ставит отметки, а здесь они складываются в отрезки.
   *
   * Это по-прежнему СПРАВКА: снимки сняты в headless Chrome, и ворота стоят на
   * весе. Но справка теперь показывает, где именно лежит время.
   */
  const STAGES = [
    ['модули', 'screenReady', 'viewerStart'],
    ['устройство', 'viewerStart', 'rendererUp'],
    ['сцена', 'rendererUp', 'envBuilt'],
    ['пост-граф', 'envBuilt', 'postBuilt'],
    ['прекомпиляция', 'postBuilt', 'precompiled'],
    ['прогрев графа', 'precompiled', 'postWarm'],
  ];
  const stages = STAGES.map(([label, from, to]) => {
    const v = fresh
      .map((x) => x.marks)
      .filter((mk) => mk && typeof mk[from] === 'number' && typeof mk[to] === 'number')
      .map((mk) => mk[to] - mk[from])
      .filter((d) => d >= 0);
    return { label, ms: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, n: v.length };
  }).filter((x) => x.ms !== null);
  /*
   * КАДРЫ, КОТОРЫХ НИКТО НЕ РИСОВАЛ.
   *
   * `blank` считает кадры, на которых упал и пост-граф, и запасной прямой
   * рендер; `direct` — кадры, которые вытянул запасной путь. На WebGPU кадр,
   * чей командный буфер так и не отправили, показывает ПРОЗРАЧНУЮ
   * поверхность, поэтому такой снимок выглядит не чёрным, а страницей: ровный
   * `--sky` под HUD. Отличить его от «просто светлой сцены» по картинке нельзя
   * — только по этим двум счётчикам, и четыре круга рецензии подряд спорили
   * именно об этом. Здесь они названы вместе с ошибкой, чей текст вьювер
   * теперь складывает в одну строку с кадрами стека (`where` в
   * `src/viewer/main.js`), так что строка называет материал.
   */
  const broken = fresh.filter((x) => x.blank > 0 || x.direct > 0);
  /* Разрешённая палитра сторон рядом со снимком (ARENA-AAA §1): синий —
     роль игрока, оранжевый — роль противника, или обе «slot» у зрителя. */
  const sides = fresh.filter((x) => x.sides);
  return {
    n: fresh.length, first: mean('first'), per: mean('per'), draw: mean('draw'),
    slow, at: new Date(fresh[0].at), stages, broken, sides,
  };
}
const m = measured();
if (m) {
  const ms = (v) => (v === null ? '—' : `${Math.round(v)} мс`);
  const pad = (n) => String(n).padStart(2, '0');
  const when = `${m.at.getFullYear()}-${pad(m.at.getMonth() + 1)}-${pad(m.at.getDate())} ${pad(m.at.getHours())}:${pad(m.at.getMinutes())}`;
  console.log(`\n  замерено в игре (${m.n} снимков, свежий ${when})`);
  console.log(`  первый кадр  ${ms(m.first).padStart(9)}  — компиляция конвейеров на главном потоке`);
  console.log(`  кадр         ${ms(m.per).padStart(9)}  — скользящее среднее страницы`);
  console.log(`  из них рисование ${ms(m.draw).padStart(5)}  — главный поток; остальное ждёт кадровую развёртку`);
  if (m.stages.length) {
    console.log('\n  до первого кадра, по отрезкам');
    for (const st of m.stages) console.log(`    ${st.label.padEnd(16)} ${ms(st.ms).padStart(9)}  (${st.n} снимков)`);
  }
  /*
   * ПОЛ В 30 КАДРОВ (RENDER-QUALITY §7) — тоже справка, а не ворота.
   *
   * Снимки сняты в headless Chrome с включённой развёрткой, поэтому дельта
   * между кадрами — потолок, а не стоимость; проваливать по ней сборку было бы
   * враньём. Но состояние, чья дельта больше 33 мс, точно НЕ уложилось в
   * 30 fps ни при какой развёртке, и молчать об этом нельзя: это ровно тот
   * случай, который §7 запрещает.
   */
  if (m.broken.length) {
    console.log(`\n  кадры, которых никто не рисовал (${m.broken.length} из ${m.n}):`);
    for (const x of m.broken.slice(0, 8)) {
      const why = x.errs.length ? x.errs[0] : '—';
      console.log(`    ${String(x.name).padEnd(28)} blank ${String(x.blank).padStart(3)}  direct ${String(x.direct).padStart(3)}  ${why}`);
    }
  }
  if (m.sides.length) {
    /*
     * ARENA-AAA §1 звучит как ОДНО правило с двумя ветками, и обе тут видно:
     * у зрителя обе стороны носят слот, у игрока синий всегда «own», а
     * оранжевый всегда «foe» — какой бы слот сервер ни сдал. Расхождением
     * считается только НАРУШЕНИЕ этого, а не то, что среди снимков есть и
     * зритель, и игрок.
     */
    const bad = m.sides.filter((x) => (x.sides.mine
      ? !(x.sides.blue === 'own' && x.sides.orange === 'foe')
      : !(x.sides.blue === 'slot' && x.sides.orange === 'slot')));
    const own = m.sides.filter((x) => x.sides.mine);
    const slots = own.map((x) => x.sides.mine);
    console.log(`\n  палитра сторон  ${own.length} снимков со своим существом`
      + `${slots.length ? ` (слот ${[...new Set(slots)].join(', ')})` : ''}`
      + `, ${m.sides.length - own.length} зрительских`);
    if (bad.length) for (const x of bad.slice(0, 4)) console.log(`    РАСХОДИТСЯ  ${x.name}  blue=${x.sides.blue} orange=${x.sides.orange} mine=${x.sides.mine || '—'}`);
  }
  if (m.slow.length) {
    console.log(`\n  ниже пола в 30 кадров (${m.slow.length} из ${m.n}):`);
    for (const x of m.slow.slice(0, 6)) console.log(`    ${String(x.name).padEnd(28)} ${ms(x.per)}`);
  }
}

const bad = [];
if (raw > RAW_BUDGET) bad.push(`несжатый вес ${mb(raw)} больше потолка ${mb(RAW_BUDGET)}`);
if (gz > GZIP_BUDGET) bad.push(`сжатый вес ${mb(gz)} больше потолка ${mb(GZIP_BUDGET)}`);

if (bad.length) {
  console.log('\n  ПРОВАЛ:');
  for (const b of bad) console.log(`    ${b}`);
  console.log('\n  Самое тяжёлое:');
  for (const r of rows.slice(0, 5)) console.log(`    ${r.f}  ${mb(r.gz)} сжатым`);
  console.log('');
  process.exitCode = 1;
} else {
  console.log(`\n  ДЕРЖИТ — до первого кадра ${mb(gz)} сжатым, запас ${mb(GZIP_BUDGET - gz)}\n`);
}
