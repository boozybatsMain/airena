#!/usr/bin/env node
/*
 * Прогон снимков эффектов: один и тот же каст — с нескольких ракурсов и в
 * несколько моментов, в настоящем вьювере, на настоящем WebGPU.
 *
 *   node tools/vfxshot.mjs                       все элементы × доставки из плана
 *   node tools/vfxshot.mjs --el=frost            один элемент
 *   node tools/vfxshot.mjs --el=frost --kind=cone
 *   node tools/vfxshot.mjs --out=reports/vfx/before --tag=before
 *   node tools/vfxshot.mjs --url=http://localhost:8823/?vfx=1
 *   node tools/vfxshot.mjs --webgl               тот же прогон на WebGL2
 *   node tools/vfxshot.mjs --moments=0.06,0.12,0.38,0.8,1.5   близкие моменты — отдельными кастами
 *   node tools/vfxshot.mjs --fight --seed=101    настоящий бой на дев-вьювере
 *   node tools/vfxshot.mjs --watch=<match id> --url='http://localhost:8787/?vfx=1&sweep=1'
 *   node tools/vfxshot.mjs --watch=<match id> --oncast   (кадр по касту, а не по таймеру)
 *                                                  повтор боя из базы продукта: камера
 *                                                  решателя, наборы, тряска — как у зрителя
 *
 * Зачем инструмент, а не «открой и посмотри». Эффект, снятый с одного
 * ракурса в один момент, проверяет ракурс и момент, а не эффект: то, что
 * читается сверху, сбоку не видно вовсе; то, что красиво на пике, до пика и
 * после — пустой пол. Поэтому каждый каст снимается сеткой: четыре глаза
 * (трансляционный, поперечный на той же дистанции, низкий боковой, верхний)
 * на три момента (выход, пик, удержание), и все кадры лежат рядом с именем в
 * файле.
 *
 * Без зависимостей: Chrome запускается headless, разговор с ним — по CDP
 * через `ws`, который в проекте уже есть. WebGPU в headless Chrome работает
 * без виртуального времени (`--virtual-time-budget` ломает инициализацию
 * адаптера: кадр остаётся чёрным — проверено), поэтому ждём реальные
 * миллисекунды.
 *
 * Пути: снимки кладутся в `--out` (по умолчанию `reports/vfx/<tag>`), имя
 * файла — `<el>-<kind>-<момент>-<ракурс>.png`, и рядом пишется `index.json`
 * с планом, чтобы галерею можно было собрать без разбора имён.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
/* Запуск Chrome, глаза, стойка бойцов и записи доставок — общие с
   `vfxclip.mjs` (ролики): см. `vfxchrome.mjs`. */
import { ELEMENTS as REGISTRY_ELEMENTS } from '../src/skills/registry.js';
import { CAMS, BLUE, ORANGE, fxFor, launchChrome, closeChrome, Cdp, openPage, waitReady, sleep } from './vfxchrome.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? '1'] : [a, '1'];
}));

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const TAG = args.tag || 'shots';
const OUT = resolve(ROOT, args.out || join('reports', 'vfx', TAG));
const PORT = Number(args.port || 8823);
const BASE = args.url || `http://localhost:${PORT}/?vfx=1&sweep=1${args.webgl ? '&webgl=1' : ''}${args.bloom === '0' ? '&bloom=0' : ''}`;
const W = Number(args.w || 1600), H = Number(args.h || 900);

/* ── план ──────────────────────────────────────────────────────────────── */

/*
 * СПИСОК СТИХИЙ БЕРЁТСЯ ИЗ РЕЕСТРА, А НЕ ИЗ ПАМЯТИ ЭТОГО ФАЙЛА.
 *
 * Здесь стояли пять имён списком — те пять, что существовали, когда съёмку
 * писали. Потом выпустили гравитацию, время, кислоту, радиацию и лазер, а
 * список остался, и `--all` (флага с таким именем тут вообще нет) молча
 * снимал ПОЛОВИНУ набора. Цена ошибки видна по кругу приёмки: три судьи
 * независимо пересчитали каталог и нашли 30 форм там, где отчёт обещал 60, —
 * и были правы, а отчёт нет. Причём четыре из пяти пропущенных модулей как
 * раз в этом круге и правились, то есть непроверенным осталось именно новое.
 *
 * Теперь набор один и тот же у грамматики, у гейта и у съёмки: пропасть
 * между ними больше не может открыться молча.
 */
const ALL_ELEMENTS = Object.keys(REGISTRY_ELEMENTS);
const ELEMENTS = (args.el ? args.el.split(',') : ALL_ELEMENTS);
const KINDS = (args.kind ? args.kind.split(',') : ['cone', 'self', 'zone', 'beam', 'bolt', 'lob']);

/*
 * ── ПЕРЕБОР ПО АТОМАМ (заказ 04.09: «каждый эффект технически выполняет
 * отдельную функцию, совпадающую с его визуалом») ─────────────────────────
 *
 * У формы `impact` и формы `status` эффект — не сама форма, а АТОМ внутри неё:
 * четырнадцать подписей удара (`atomImpact` в `vfx.js`) и десять носителей
 * статуса. Без этого перебора прогон снимал ровно один из них — `damage` и
 * `burn` по умолчанию `fxFor`, — то есть тринадцать подписей из четырнадцати
 * не были сняты НИ РАЗУ, и «отдельная функция» проверялась на слово.
 *
 *   --atom=damage,burn,knock,...    (только для kind=impact)
 *   --effect=shield,stun,root,...   (только для kind=status)
 *
 * Имя файла получает атом суффиксом, иначе четырнадцать ударов перезаписали бы
 * друг друга: `<el>-impact.damage-t0_20-broadcast.png`.
 */
const ATOMS = (args.atom ? args.atom.split(',') : [null]);
const EFFECTS = (args.effect ? args.effect.split(',') : [null]);
/** Что перебирать внутри формы: атомы для удара, эффекты для статуса. */
function variantsOf(kind) {
  /* Зона перебирается по атомам так же, как удар: с 04.09 её запись несёт
     список эффектов, и «зона, которая тянет» — это отдельный кадр. */
  if (kind === 'impact' || kind === 'zone') return ATOMS.map((a) => (a ? { atom: a, tag: a } : { tag: null }));
  if (kind === 'status') return EFFECTS.map((e) => (e ? { effect: e, tag: e } : { tag: null }));
  return [{ tag: null }];
}

const CAM_NAMES = (args.cams ? args.cams.split(',') : Object.keys(CAMS));

/* Моменты от каста, секунды: выход, пик, удержание. */
const MOMENTS = (args.moments ? args.moments.split(',').map(Number) : [0.2, 0.7, 1.6]);

/*
 * МОМЕНТЫ ДЕЛЯТСЯ НА КАСТЫ. `Page.captureScreenshot` на WebGPU стоит ~0.3 с и
 * сдвигает следующий момент того же каста: один каст с 0.06, 0.15, 0.3
 * снимался на 0.06, 0.43, 0.78 (замер 02.09). Поэтому в одном касте моменты
 * стоят не ближе `--gap` (0.45 с), а близкие уходят в отдельные касты того же
 * глаза. Эффекты детерминированы от координат каста (A2), кадры разных кастов
 * совпадают — проверено на пяти моментах полировки молнии.
 */
const GAP = Number(args.gap || 0.45);
function groupMoments(ms) {
  const groups = [];
  for (const m of [...ms].sort((a, b) => a - b)) {
    let g = groups.find((gr) => m - gr[gr.length - 1] >= GAP);
    if (!g) { g = []; groups.push(g); }
    g.push(m);
  }
  return groups;
}
const GROUPS = groupMoments(MOMENTS);

/* ── прогон ─────────────────────────────────────────────────────────────── */

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = await launchChrome({ chrome: args.chrome, w: W, h: H });
  const cdp = new Cdp(chrome.ws);
  const index = { url: BASE, at: new Date().toISOString(), w: W, h: H, cams: CAMS, moments: MOMENTS, casts: GROUPS, gap: GAP, shots: [] };
  try {
    const page = await openPage(cdp, BASE, { w: W, h: H });
    /* Сцена готова, когда есть ручки прогона и тела обеих сторон. */
    await waitReady(page, BASE);
    /*
     * ПАМЯТКА «КАК ЧИТАТЬ БОЙ» СНИМАЕТСЯ И НА СТОЙКЕ, А НЕ ТОЛЬКО В БОЮ.
     *
     * Гасили её пока только в записи боя, а стойка снималась с ней — панель
     * стоит в правом нижнем углу и попадает В ИЗМЕРЯЕМУЮ ПОЛОСУ АРЕНЫ (строки
     * 120–790). Разностный замер её вычитает, потому что она одинакова в базе
     * и в кадре, а вот судья, которому велено «посмотреть глазами», видит её
     * на каждом кадре и справедливо считает шумом. Ключ тот же, каким её
     * гасит игрок, — съёмка не выключает ничего особенного, а приходит «не в
     * первый раз».
     */
    await page.evaluate(`(() => {
      /*
       * ПАМЯТОК ДВЕ, И ОНИ НА РАЗНЫХ СТРАНИЦАХ.
       *
       * Продуктовая («#howto», src/client/index.html) гасится ключом, как у
       * человека, — но показывается она ПО СОБЫТИЮ airena:match, а слушатель
       * ставится при загрузке, то есть позже нашего вызова он вернул бы её
       * обратно; поэтому элемент удаляется, а не прячется.
       *
       * Стендовая («#legend», src/viewer/index.html) — вообще другая: ни
       * ключа, ни кнопки. Её искали по чужому идентификатору, и снималась
       * она поэтому НИКОГДА: панель стояла в правом нижнем углу на всех
       * кадрах развёртки, внутри измеряемой полосы арены (строки 120–790),
       * и три судьи приёмки честно назвали её шумом.
       */
      const el = document.getElementById('howto');
      try { localStorage.setItem('airena.howto', (el && el.dataset.v) || '2'); } catch { /* приватный режим */ }
      if (el) el.remove();
      document.getElementById('legend')?.remove();
      return true;
    })()`);
    /* Прогрев: первый кадр с новым материалом на WebGPU пустой (стенд /ice
       выяснил это первым), и конвейеры собираются на первом появлении. */
    await page.evaluate(`window.__airenaSweep.place(${JSON.stringify({ blue: BLUE, orange: ORANGE })}); true`);
    await page.evaluate(`window.__airenaSweep.cam(${JSON.stringify(CAMS[CAM_NAMES[0]])}); true`);
    await sleep(1500);
    const stats = await page.evaluate('window.__airenaSweep.stats()');
    console.log(`вьювер: ${stats.backend}, bloom ${stats.bloom ? 'on' : 'off'}, ${W}×${H}`);
    index.backend = stats.backend;

    if (args.fight || args.watch) {
      await fightRun(page, index, !!args.watch);
    } else {
      for (const el of ELEMENTS) {
        for (const kind of KINDS) {
        for (const v of variantsOf(kind)) {
          /*
           * `--who=blue|orange` — НА КОМ ПОКАЗЫВАТЬ СТАТУС.
           *
           * Стойка по умолчанию раскладывает эффекты так же, как сим: щит,
           * лечение, очищение и усиление ложатся на кастера (синий), прочие
           * на цель (оранжевый). Для игры это верно, а для СРАВНЕНИЯ двух
           * знаков — нет: судья приёмки справедливо снял мой довод про
           * усиление и ослабление, потому что их рамки сняты с разных бойцов
           * разного роста, и «дорожки идут навстречу» из таких кадров не
           * следует. Флаг ставит оба знака на одно тело.
           */
          const fx = fxFor(kind, el, {
            ...(v.tag ? (kind === 'status' ? { effect: v.effect } : { atom: v.atom }) : {}),
            ...(args.who ? { who: args.who } : {}),
          });
          if (!fx) continue;
          const label = v.tag ? `${kind}.${v.tag}` : kind;
          /*
           * Прогрев конкретного эффекта — КОЛЬЦОМ, а не одним кастом.
           *
           * Материалы берутся из пула по шесть на вид (`pooled` в vfx.js), и
           * каждый новый экземпляр — это сборка конвейера на первом
           * появлении: в headless Chrome она занимала до секунды, и кадр
           * «пика» снимал пустой пол. Шесть кастов подряд заполняют кольцо,
           * дальше конвейеры готовы, и снимок ловит эффект, а не компилятор.
           */
          for (let w = 0; w < 6; w++) {
            await page.evaluate(`window.__airenaSweep.cast(${JSON.stringify(fx)}); true`);
            await sleep(450);
          }
          await sleep(Math.max(1500, (MOMENTS[MOMENTS.length - 1] + 1.0) * 1000));
          for (const camName of CAM_NAMES) {
            await page.evaluate(`window.__airenaSweep.cam(${JSON.stringify(CAMS[camName])}); true`);
            await sleep(150);
            /* Каст на глаз и группу моментов (см. `groupMoments`): моменты
               снимаются последовательно по часам СТРАНИЦЫ (ответ `cast`
               возвращает её `performance.now()`), ракурс меняется между
               кастами. */
            for (const [gi, group] of GROUPS.entries()) {
              const t0 = Date.now();
              const pageT0 = await page.evaluate(`(window.__airenaSweep.cast(${JSON.stringify(fx)}), performance.now())`);
              for (const m of group) {
                const wait = t0 + m * 1000 - Date.now();
                if (wait > 0) await sleep(wait);
                const name = `${el}-${label}-t${m.toFixed(2).replace('.', '_')}-${camName}.png`;
                const at = await page.evaluate('performance.now()');
                await page.shot(join(OUT, name));
                index.shots.push({ el, kind, atom: v.tag || null, moment: m, cam: camName, cast: gi, file: name, actual: +((at - pageT0) / 1000).toFixed(3) });
              }
              /* Дать эффекту догореть, чтобы следующий каст не снимал хвост. */
              await sleep(Math.max(1200, 3800 - (Date.now() - t0)));
            }
          }
          console.log(`  ${el} · ${label}: ${CAM_NAMES.length * MOMENTS.length} кадров, кастов на глаз: ${GROUPS.length}`);
        }
        }
      }
    }
    const fps = await page.evaluate('window.__airenaSweep.stats()');
    index.fps = fps.fps; index.draws = fps.draws;
    index.errors = page.errors.slice(0, 20);
    writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2));
    console.log(`${index.shots.length} кадров → ${OUT}${page.errors.length ? `  (ошибок консоли: ${page.errors.length})` : ''}`);
  } finally {
    await closeChrome(chrome);
  }
}

/*
 * Настоящий бой: камера решателя, тряска, HUD — всё как у зрителя. Снимаем
 * каждые `--every` секунд `--n` кадров и отдельно каждый кадр, в котором
 * сработал эффект (по событию сокета `airena:frame` с непустым `fx`).
 */
async function fightRun(page, index, watching = false) {
  const n = Number(args.n || 24), every = Number(args.every || 0.8);
  /*
   * ГЛАЗ БОЯ. По умолчанию — камера решателя (`null`), та самая, которую
   * видит зритель. Но судья приёмки справедливо заметил, что «посмотреть с
   * разных ракурсов» выполнено только для стоек: все кадры записи сняты одним
   * глазом. `--fightcam=low|top|side` прикалывает бой к неподвижному глазу
   * стойки — тогда одну и ту же запись можно снять трижды и сравнить.
   */
  const eye = args.fightcam && CAMS[args.fightcam] ? CAMS[args.fightcam] : null;
  await page.evaluate(`window.__airenaSweep.cam(${eye ? JSON.stringify(eye) : 'null'}); true`);
  await page.evaluate(`(() => {
    window.__fxSeen = [];
    addEventListener('airena:frame', (ev) => { const f = ev.detail.frame; if (f && f.fx && f.fx.length) window.__fxSeen.push({ t: f.t, kinds: f.fx.map((e) => e.kind + ':' + (e.element || '')) }); });
    return true;
  })()`);
  if (!watching) {
    await page.evaluate(`(() => {
      const sel = (id, v) => { const s = document.querySelector(id); if (s && v) s.value = v; };
      sel('#sel-oct', ${JSON.stringify(args.blue || '')}); sel('#sel-gor', ${JSON.stringify(args.orange || '')});
      ${args.seed ? `const b = document.querySelector('#seed'); if (b) b.value = ${JSON.stringify(String(args.seed))};` : ''}
      window.airena ? window.airena.startMatch() : document.querySelector('#btn-run').click();
      return true;
    })()`);
  }
  /* Повтор из базы просим ТОЛЬКО когда сцена готова: по `?m=` он стартовал
     бы на загрузке страницы, и первые десять секунд боя уходили на сборку
     WebGPU и тел. Маршрут продукта — хеш, `app.js` сам зовёт повтор. */
  if (watching) {
    /*
     * ПАМЯТКА «КАК ЧИТАТЬ БОЙ» СНИМАЕТСЯ ДО ПОВТОРА.
     *
     * Она закрывала четверть арены во всех тридцати кадрах записи, и судья
     * приёмки честно написал, что бой приходится судить сквозь неё. Панель
     * гасится тем же ключом, каким её гасит игрок (`airena.howto`), — то есть
     * съёмка не выключает ничего особенного, а просто приходит «не в первый
     * раз». Версию ключа читаем со страницы, чтобы она не разъехалась с
     * `app.js`.
     */
    await page.evaluate(`(() => {
      /*
       * ПАМЯТОК ДВЕ, И ОНИ НА РАЗНЫХ СТРАНИЦАХ.
       *
       * Продуктовая («#howto», src/client/index.html) гасится ключом, как у
       * человека, — но показывается она ПО СОБЫТИЮ airena:match, а слушатель
       * ставится при загрузке, то есть позже нашего вызова он вернул бы её
       * обратно; поэтому элемент удаляется, а не прячется.
       *
       * Стендовая («#legend», src/viewer/index.html) — вообще другая: ни
       * ключа, ни кнопки. Её искали по чужому идентификатору, и снималась
       * она поэтому НИКОГДА: панель стояла в правом нижнем углу на всех
       * кадрах развёртки, внутри измеряемой полосы арены (строки 120–790),
       * и три судьи приёмки честно назвали её шумом.
       */
      const el = document.getElementById('howto');
      try { localStorage.setItem('airena.howto', (el && el.dataset.v) || '2'); } catch { /* приватный режим */ }
      if (el) el.remove();
      document.getElementById('legend')?.remove();
      return true;
    })()`);
    await page.evaluate(`(location.hash = ${JSON.stringify('#/watch/' + args.watch)}, true)`);
  }
  for (let i = 0; i < 150; i++) {
    const going = await page.evaluate('!!(window.airena && window.airena.frames && window.airena.frames.length > 2)').catch(() => false);
    if (going) break;
    await sleep(200);
  }
  await sleep(300);
  /*
   * ── КАДР ПО КАСТУ, А НЕ ПО ТАЙМЕРУ ───────────────────────────────────────
   *
   * `--oncast` ждёт ЗАПИСЬ в `world.fx` и снимает сразу после неё. Прежний
   * равномерный шаг ловил формы по вероятности, и это померено: у галереи
   * `f2-fight-laser-void` медианный шаг 1.52 с при жизни лазерного ствола
   * 0.63 с — луч записан в окнах восьми кадров из двадцати шести и НЕ ПОПАЛ
   * НИ НА ОДИН. Три судьи приёмки independently написали одно и то же: «ни
   * один кадр не застаёт луч в касте», «4 из 21 кадра — пустая арена». Это
   * был дефект съёмки, а не слоя, и растягивать ради него жизнь эффекта
   * значило бы нарушить пункт 4 заказа.
   *
   * Задержка `--castlag` (по умолчанию 0.18 с) — не «чтобы покрасивее»:
   * доставка ставит носитель в тот же кадр, а вход формы занимает 0.1–0.15 с,
   * и снимок ровно в миг записи застаёт эффект в нуле.
   */
  const onCast = args.oncast !== undefined && String(args.oncast) !== 'false';
  const lag = Number(args.castlag ?? 0.18);
  let shot = 0;
  const grab = async (why) => {
    if (eye) await page.evaluate(`window.__airenaSweep.cam(${JSON.stringify(eye)}); true`);
    const t = await page.evaluate('(window.airena && window.airena.renderClock) || 0');
    const name = `fight-${String(shot).padStart(2, '0')}-t${Number(t).toFixed(1).replace('.', '_')}.png`;
    await page.shot(join(OUT, name));
    const seen = await page.evaluate('(window.__fxSeen || []).splice(0).map((s) => s.kinds.join(",")).join(";")');
    index.shots.push({ fight: true, file: name, t, fx: seen, why });
    shot += 1;
    return page.evaluate('!!(window.airena && window.airena.over)');
  };
  if (onCast) {
    /* Ждём каст, снимаем, повторяем. Голодание невозможно: если каста нет
       дольше `every`, снимок делается всё равно — иначе тихий отрезок боя
       выпал бы из галереи целиком. */
    await page.evaluate('window.__fxWait = []; addEventListener("airena:frame", (ev) => { const f = ev.detail.frame; if (f && f.fx && f.fx.length) window.__fxWait.push(f.t); }); true');
    let waited = 0;
    while (shot < n) {
      const hit = await page.evaluate('(window.__fxWait.splice(0).length > 0)').catch(() => false);
      if (hit) {
        await sleep(lag * 1000);
        if (await grab('каст')) break;
        waited = 0;
      } else if (waited >= every * 1000) {
        if (await grab('тишина')) break;
        waited = 0;
      } else {
        await sleep(120);
        waited += 120;
        continue;
      }
      if (await page.evaluate('!!(window.airena && window.airena.over)')) break;
    }
  } else {
    for (let i = 0; i < n; i++) {
      /* Решатель кадрирования двигает камеру каждый кадр, поэтому неподвижный
         глаз надо ставить заново перед каждым снимком, а не один раз. */
      if (await grab('шаг')) break;
      await sleep(every * 1000);
    }
  }
}

main().catch((e) => { console.error(`vfxshot: ${e.message}`); process.exit(1); });
