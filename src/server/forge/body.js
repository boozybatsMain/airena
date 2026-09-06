/**
 * Тело существа — вторая половина генерации.
 *
 * До этого файла продукт делал мозг, а телом ставил один из двух наших:
 * `bodyRef: archetype`. То есть на экране каждое существо выглядело либо
 * осьминогом, либо гориллой, чей бы промпт его ни породил. Игрок пишет
 * «стеклянная медуза», получает гориллу с медузьей тактикой и справедливо
 * считает, что игра его не услышала.
 *
 * Инструкция для модели живёт в `packages/forge` и НЕ ДУБЛИРУЕТСЯ здесь.
 * Это тот же пакет, которым пользуется `tools/forge.mjs`, и это важно:
 * инструкция в две тысячи строк, у которой появилась вторая копия, через
 * месяц становится двумя разными инструкциями, и никто не может сказать,
 * какая из них та, на которой мерили качество.
 *
 * ЧТО ЗДЕСЬ ЕСТЬ, ЧЕГО НЕТ В ИНСТРУМЕНТЕ. Инструмент пишет файл на диск для
 * человека, который сейчас же на него посмотрит. Продукт отдаёт код в
 * браузер ПОСТОРОННЕГО. Поэтому между ответом модели и базой стоит
 * `analyseBody` (`sandbox/bodyrules.js`), и в базу едет две колонки: то, что
 * написала модель, и то, что можно показывать.
 */

import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analyseBody } from '../sandbox/bodyrules.js';
import { buildBody } from '../../viewer/loadbody.js';
import { callWithRepair, extractCode } from './llm.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Сборка пакета инструкции.
 *
 * `packages/forge` написан на TypeScript, а сервер — на голом JS без шага
 * сборки, и это сознательный выбор всего проекта. Собрать пакет в память
 * один раз при первой генерации дешевле, чем заводить сборку ради одного
 * импорта, и честнее, чем копировать инструкцию сюда руками.
 *
 * Кэш — на модуль: инструкция не меняется в течение жизни процесса.
 */
let forgePromise = null;
export function loadForge() {
  if (forgePromise) return forgePromise;
  forgePromise = (async () => {
    const require = createRequire(join(ROOT, 'package.json'));
    const esbuild = require('esbuild');
    const built = await esbuild.build({
      entryPoints: [join(ROOT, 'packages/forge/src/index.ts')],
      bundle: true, format: 'esm', platform: 'node', target: 'node22',
      write: false, logLevel: 'silent',
    });
    const code = built.outputFiles[0].text;
    return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  })().catch((e) => { forgePromise = null; throw e; });
  return forgePromise;
}

/**
 * Ситуации, в которых тело обязано себя вести, чтобы считаться пригодным.
 *
 * Берутся крайние точки контракта `pose(s)`, а не все: цель —
 * поймать падение, а не оценить анимацию. Полный прогон делает
 * `tools/checkpose.mjs`.
 */
/**
 * Ниже этого и выше этого существо перестаёт читаться как существо.
 *
 * Отношение высоты к горизонтальному следу — единственная мера, переживающая
 * масштабирование во вьювере. Замерено `tools/bodysize.mjs` по всем телам в
 * базе: 0.33 у нашей гориллы (размах рук шире, чем она высока) и 2.02 у
 * самого высокого. Пороги стоят ВНЕ замеренного с большим запасом: задача —
 * отсечь блин и иглу, а не спорить с художником о пропорциях.
 */
export const ASPECT_MIN = 0.12;
export const ASPECT_MAX = 6;

/**
 * Потолок на число мешей — то есть на число вызовов отрисовки за кадр.
 *
 * Топливо ограничивает, сколько тело ДУМАЕТ, а память — сколько оно занимает.
 * Сколько оно стоит ПОКАЗАТЬ, не ограничивало ничто, и это отдельная величина:
 * каждый меш — отдельное обращение к железу, и на арене их всегда два тела.
 *
 * Число выведено от нашего собственного эталона, а не из головы: осьминог —
 * 2115 мешей и 294 тысячи треугольников, горилла — 1501 и 125 тысяч
 * (замерено прямо на `bodies/*.js`, а не по базе: в базе всего четыре
 * различных исходника, и статистику по ним строить не на чем). Арену настраивали и смотрели на них, значит их цена
 * — та, которую мы согласились платить. Полтора эталона — запас на то, что
 * чужое тело сложнее нашего, и всё ещё в том же порядке величины.
 *
 * ЧЕСТНАЯ ОГОВОРКА: связь с кадрами в секунду здесь НЕ ЗАМЕРЕНА — в этой
 * среде нет браузера с видимым окном, а замер fps на скрытой вкладке
 * бессмысленен: рендерер там не работает вовсе. Потолок сказан относительно
 * эталона, а не относительно бюджета кадра, и когда появится замер кадров,
 * его надо будет переснять.
 */
/**
 * Чья это вина — вопрос основателя, заданный дословно: «ошибки должны
 * совершаться крайне редко и не по нашей вине».
 *
 * ── КОДЫ БЕРУТСЯ ИЗ ТОГО, ЧТО ДЕЙСТВИТЕЛЬНО БРОСАЕТСЯ ─────────────────────
 *
 * Здесь стоял список из `429`, `ECONNREFUSED`, `timeout` — и он не совпадал с
 * реальностью НИ ОДНОЙ строкой: `llm.js` бросает `rate` (это и есть 429),
 * `network` (это и есть обрыв), `wall` (это наш потолок времени), `http`.
 * Проверка «на восьми кодах» была сделана вызовом `whoseFault('429')` напрямую
 * — то есть проверяла строки, которых по настоящему пути не бывает.
 *
 * Замерено ревью на живом пути с подменённым `fetch`: HTTP 429 давал
 * `model_code`, `ECONNREFUSED` — `model_code`. Метрика, заведённая ради
 * вопроса основателя, отвечала «виновата модель» на нашу сеть.
 *
 * Список теперь ОДИН на весь конвейер: `OUR_CODES` в `pipeline.js` уже знал
 * правильный ответ, и два файла в одной папке классифицировали один код
 * противоположно.
 */
export const SILENT_CODES = new Set([
  /* Ответа не было вовсе — модель или сеть молчали. */
  'no_answer', 'no_code', 'timeout', 'abort',
  /* То, что бросает `llm.js`. `wall` и `no_key` — вина НАША, но не модели, и
     в этом журнале важно именно «не модель написала плохой код». */
  'rate', 'network', 'http', 'wall', 'no_key', 'no_catalog', 'internal',
  /* Обрезка на НАШЕМ потолке токенов: модель не договорила, а не ошиблась. */
  'truncated',
]);
export const whoseFault = (code) => (SILENT_CODES.has(String(code || '')) ? 'model_silent' : 'model_code');

export const DRAW_MAX = 3200;

/**
 * Цена показа тела: сколько раз рендерер обратится к железу за кадр.
 *
 * ОДНА функция на оба места, где это считается. Их было два — приёмка и выдача
 * тела по HTTP, — и считали они РАЗНОЕ: приёмка учитывала точки, линии и
 * спрайты, выдача только меши. Два счёта одного потолка расходятся молча, и
 * тело, принятое одним, отвергается другим.
 */
export function drawCost(root) {
  let draws = 0;
  root.traverse((o) => {
    if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.geometry) draws++;
  });
  return draws;
}
/** И треугольники: меши могут быть дешёвыми, а один меш — нет. */
export const TRIS_MAX = 600_000;

const POSE_SITUATIONS = [
  { speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0 },
  { speed: 5.5, stride: 0.8, turn: 1, grounded: true, health: 1, action: null, phase: 0 },
  { speed: 3, stride: 0.5, turn: 0, grounded: false, health: 1, action: 'jump', phase: 0.5 },
  { speed: 0, stride: 0, turn: 0, grounded: true, health: 0.2, action: 'hit', phase: 0.5 },
  { speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: 'attack', phase: 0.5 },
  { speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: 'fire', phase: 0.5 },
  { speed: 0, stride: 0, turn: 0, grounded: true, health: 0, action: 'die', phase: 0.5 },
  { speed: 0, stride: 0, turn: 0, grounded: true, health: 0, action: 'die', phase: 1 },
  /*
   * ЭТИХ ТРЁХ НЕ ХВАТАЛО, И ОНИ ЕСТЬ В БОЮ.
   *
   * Вьювер выдаёт семь действий, а приёмка проверяла четыре. Тело, падающее
   * только на `block`, `signal` или `land`, принималось — а в бою первое же
   * блокирование гасит позу НАВСЕГДА (`loadbody.js` не воскрешает её), и
   * существо стоит столбом до конца матча. Молча.
   *
   * Проверять надо ровно то, что случится, а не выборку из этого.
   */
  { speed: 0, stride: 0, turn: 0, grounded: true, health: 0.6, action: 'block', phase: 0.5 },
  { speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: 'signal', phase: 0.5 },
  { speed: 2, stride: 0.3, turn: 0, grounded: true, health: 1, action: 'land', phase: 0.2 },
];

/**
 * Тело ПРОВЕРЯЕТСЯ ДВИЖЕНИЕМ, а не только сборкой.
 *
 * `build()` зовут один раз, и его ошибку видно сразу. `pose()` зовут шестьдесят
 * раз в секунду из цикла рендера, где падение гасится намеренно — иначе одно
 * кривое тело сыпало бы исключениями до конца боя. Тихая деградация правильна в
 * бою и негодна на приёмке: существо доезжает до арены, встаёт и стоит столбом.
 *
 * Замерено на трёх существах, собранных этим самым путём: у одного поза падала
 * во всех двадцати семи ситуациях, у второго — в четырёх, и все четыре это
 * «ранен» и «умирает». То есть игрок не увидел бы, как его существо погибает,
 * и мы бы об этом не узнали.
 *
 * `three` подгружается лениво: он весит мегабайт и нужен только здесь.
 */
export async function posesRun(instrumented) {
  let THREE; let TSL;
  try {
    THREE = await import('three/webgpu');
    TSL = await import('three/tsl');
  } catch {
    /* Нет рендерера в этом окружении — проверять нечем; молча пропускаем,
       гейт `tools/checkpose.mjs` поймает то же самое на CI. */
    return { ok: true, skipped: true };
  }
  let root;
  try {
    /*
     * `trusted: false` — ТОТ ЖЕ РЕЖИМ, В КОТОРОМ ТЕЛО БУДЕТ ЖИТЬ.
     *
     * Стояло `true`, и это выключало на приёмке ровно те стены, которые
     * работают у зрителя: учёт выделенной памяти, ревизию геометрии (48 МБ) и
     * потолок топлива на кадр позы.
     *
     * Замерено ревью: тело с геометрией на 154 МБ приёмка ПРИНИМАЛА, а браузер
     * отказывал; тело с позой дороже кадрового потолка приёмка ПРИНИМАЛА, а в
     * бою поза умирала навсегда. В обоих случаях существо тихо надевало тело
     * архетипа — то есть проверка проверяла не то, что произойдёт.
     */
    root = buildBody(THREE, TSL, instrumented, { trusted: false });
  } catch (e) {
    return { ok: false, where: 'build', message: e.message };
  }
  /*
   * ЕГО ВООБЩЕ ВИДНО?
   *
   * Приёмка проверяла, что код не падает, — и пропускала тело из нуля мешей,
   * потому что пустая `Group` не падает ни на чём. На арене это выглядит как
   * невидимый боец: полоса здоровья движется, урон идёт, на экране пусто.
   *
   * Порог по пропорции, а не по размеру: вьювер всё равно подгонит
   * горизонтальный след под диаметр коллайдера, поэтому абсолютные метры
   * модели ничего не значат, а отношение высоты к следу переживает масштаб.
   *
   * Замерено `tools/bodysize.mjs`: отношение лежит между 0.33 (наша горилла —
   * размах рук шире, чем она высока) и 2.02. Выборка при этом МАЛЕНЬКАЯ —
   * четыре различных исходника на 27 строк в базе, — и порог поставлен с
   * учётом этого: он отсекает вырожденное (блин, иглу, пустоту), а спорить о
   * пропорциях на четырёх телах было бы самообманом. Порог поставлен ВНЕ этого
   * диапазона с запасом — 0.12 и 6.0, — потому что задача здесь отсечь блин и
   * иглу, а не спорить с художником о пропорциях. Наша собственная горилла
   * обязана проходить: гейт, который не пропускает эталон, измеряет себя.
   */
  const box = new THREE.Box3().setFromObject(root);
  const meshes = drawCost(root);
  if (!meshes) return { ok: false, where: 'looks', message: 'the body holds no mesh at all: the fighter would be invisible in the arena' };
  if (box.isEmpty()) return { ok: false, where: 'looks', message: 'the body has no size: the fighter would be invisible in the arena' };
  const ext = new THREE.Vector3();
  box.getSize(ext);
  const foot = Math.max(ext.x, ext.z);
  if (!(foot > 1e-4) || !(ext.y > 1e-4)) {
    return { ok: false, where: 'looks', message: 'the body is flat to zero along one axis: it would not be seen in the arena' };
  }
  /* Цена показа: вызовы отрисовки и геометрия. */
  let tris = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const n = g.index ? g.index.count : (g.attributes?.position?.count || 0);
    tris += Math.floor(n / 3) * (o.isInstancedMesh ? (o.count || 1) : 1);
  });
  if (meshes > DRAW_MAX) {
    return { ok: false, where: 'cost', message: `${meshes} separate meshes means ${meshes} draw calls per frame against a ceiling of ${DRAW_MAX}; merge repeating parts into one mesh or an InstancedMesh` };
  }
  if (tris > TRIS_MAX) {
    return { ok: false, where: 'cost', message: `${Math.round(tris / 1000)} thousand triangles against a ceiling of ${Math.round(TRIS_MAX / 1000)}; lower the segment counts of the spheres and cylinders` };
  }

  const aspect = ext.y / foot;
  if (aspect < ASPECT_MIN) return { ok: false, where: 'looks', message: `the body is ${(1 / aspect).toFixed(0)} times wider than it is tall — in the arena that is a pancake on the floor, not a creature` };
  if (aspect > ASPECT_MAX) return { ok: false, where: 'looks', message: `the body is ${aspect.toFixed(0)} times taller than it is wide — in the arena that is a needle, not a creature` };

  const pose = root.userData && root.userData.pose;
  if (typeof pose !== 'function') return { ok: false, where: 'pose', message: 'there is no userData.pose' };

  /*
   * ПОЗА ОБЯЗАНА ЧТО-ТО МЕНЯТЬ.
   *
   * Проверялось только «не бросила», поэтому `pose = () => {}` принималось. На
   * экране это неотличимо от сломанного: существо стоит столбом, и никто не
   * скажет, оно замерло или так задумано.
   *
   * Снимок берётся по всем узлам: положение, поворот, масштаб. Сравниваются
   * два состояния — покой и бег; если ни одно число не сдвинулось, поза
   * нарисована, но не написана.
   */
  const snapshot = () => {
    const out = [];
    root.traverse((o) => {
      out.push(o.position.x, o.position.y, o.position.z,
        o.rotation.x, o.rotation.y, o.rotation.z,
        o.scale.x, o.scale.y, o.scale.z);
    });
    return out;
  };

  /*
   * ПРИЧИНА БЕРЁТСЯ ИЗ `poseFailed`, А НЕ ИЗ `catch`.
   *
   * При `trusted: false` — а он теперь именно такой, см. выше — обёртка в
   * `loadbody.js` ГЛОТАЕТ исключение позы: гасит её навсегда и кладёт текст в
   * `root.userData.poseFailed`. Значит `catch` здесь недостижим, и приёмка,
   * читавшая только его, для любой упавшей позы возвращала одно и то же
   * «поза ничего не меняет».
   *
   * Это не косметика: на этой строке держится вторая попытка. Модели уезжает
   * `repair` с причиной, и если причина всегда одна и та же неверная, вторая
   * попытка чинит не то. Настоящий текст — «Cannot read properties of
   * undefined» на `block` — лежал рядом и не читался.
   */
  for (const s of POSE_SITUATIONS) {
    try {
      pose({ t: 1, dt: 1 / 60, ...s });
    } catch (e) {
      return { ok: false, where: `pose(${s.action || 'movement'})`, message: e.message };
    }
    const failed = root.userData.poseFailed;
    if (failed) {
      return { ok: false, where: `pose(${s.action || 'movement'})`, message: failed };
    }
  }

  try {
    pose({ t: 0, dt: 1 / 60, speed: 0, stride: 0, turn: 0, grounded: true, health: 1, action: null, phase: 0 });
    const still = snapshot();
    pose({ t: 1.3, dt: 1 / 60, speed: 5.5, stride: 0.8, turn: 1, grounded: true, health: 1, action: null, phase: 0.5 });
    const moving = snapshot();
    const moved = still.some((v, i) => Math.abs(v - moving[i]) > 1e-4);
    if (!moved) {
      return { ok: false, where: 'pose', message: 'the pose changes nothing: the body stands like a post at any speed' };
    }
  } catch (e) {
    return { ok: false, where: 'pose(comparison)', message: e.message };
  }

  return { ok: true, draws: meshes };
}

/**
 * Пол потолка ответа: осьминог — тысяча строк, значит меньше этого телу нельзя.
 *
 * Именно ПОЛ, а не потолок. Здесь стояло плоское число, и оно шло в запрос
 * вместо `bundle.maxTokens` — то есть против правила 2 в `models.js`: «потолок
 * токенов ВЫЧИСЛЯЕТСЯ ИЗ БЮДЖЕТА, а не настраивается». Замерено ревью: каталог
 * посчитал связке потолок 125 600, а тело просило 32 000 и получало обрезанный
 * ответ, который потом записывался как синтаксическая ошибка модели.
 *
 * Берётся максимум из двух: бюджет связки, если он больше, и этот пол, если
 * связка дешёвая и бюджет вышел меньше тысячи строк.
 */
export const BODY_MAX_TOKENS = 32_000;

/**
 * Собрать тело по промпту игрока.
 *
 * @returns {{ok: true, source, safe, costUsd, tries}} или
 *          {{ok: false, code, message, problems, costUsd}}
 */
export async function forgeBody({
  prompt, bundle, style = null, call = callWithRepair, onAttempt = null,
}) {
  const forge = await loadForge();
  const { system, user } = forge.buildMessages(prompt, style ?? forge.DEFAULT_STYLE);

  /*
   * Приёмка идёт ЗДЕСЬ, а не после.
   *
   * `callWithRepair` умеет повторять при неудаче, и его `accept` — это
   * единственное место, где повтор ещё возможен. Проверять тело после
   * возврата значило бы: модель ответила мусором, деньги списаны, повтора
   * не будет. Поэтому анализ безопасности стоит внутри приёмки: код, который
   * не проходит стены, для нас не ответ.
   */
  let admitted = null;
  /*
   * Приёмка асинхронная: проверка позы строит тело и двигает его, а это
   * импорт рендерера и полтысячи миллисекунд. `callWithRepair` умеет ждать
   * `accept`, и это единственное место, где повтор ещё возможен.
   */
  const accept = async (text, reject = () => false) => {
    const src = extractCode(text);
    if (!src || src.length < 200) {
      admitted = { failed: [{ code: 'no_code', message: 'the answer holds no code' }], src: null };
      return reject({ code: 'no_code', message: 'the answer holds no code block with a build function' });
    }
    const a = analyseBody(src);
    if (!a.ok) {
      admitted = { failed: a.problems, src };
      return reject({ code: a.problems[0].code, message: a.problems[0].message });
    }
    const moved = await posesRun(a.source);
    if (!moved.ok) {
      const why = { code: 'pose', message: `the body does not move: ${moved.where} — ${moved.message}` };
      admitted = { failed: [why], src };
      return reject(why);
    }
    admitted = { source: src, safe: a.source, draws: moved.draws ?? null, posesSkipped: !!moved.skipped };
    return true;
  };

  /*
   * ПОВТОР С ОБЪЯСНЕНИЕМ, А НЕ ВСЛЕПУЮ.
   *
   * Вторая попытка идёт с УРЕЗАННЫМ размышлением (`RETRY_THINK_BUDGET`,
   * `llm.js`), и это не изменилось и меняться не должно: замерено на
   * четырнадцати телах — шесть пришли именно вторыми попытками с урезанным
   * бюджетом, и все шесть прошли. Дольше думать над тем же промптом не помогает.
   *
   * Чего не было — ОБЪЯСНЕНИЯ. Модель получала второй шанс и ни слова о том,
   * что было не так, при том что причина у нас в руках: «TSL.mix(...) is not a
   * function», «неизвестное имя objectToControl». Добавлено ровно это, и
   * заслуга урезания бюджета сюда не записывается.
   *
   * Замерено ревью: из восьми отказов пять — неверное обращение с TSL, и три
   * из четырёх повторных прогонов упавших связок проходили с первой попытки.
   * То есть даже слепой повтор помогает; повтор с текстом ошибки обязан
   * помогать сильнее.
   */
  const repair = (why) => {
    if (!why) return null;
    return `Your previous answer was not accepted: ${why.message}\n\n`
      + 'Fix exactly this and send the WHOLE file again, complete, in a single code block. '
      + 'Do not explain in words, do not send a patch — code only.';
  };

  /*
   * ── ОТКАЗ ЛОВИТСЯ, А НЕ УЛЕТАЕТ ИСКЛЮЧЕНИЕМ ───────────────────────────────
   *
   * `callWithRepair` при исчерпании попыток БРОСАЕТ. Ветка `if (!admitted…)`
   * ниже собрана из настоящих причин — `analyseBody` вернул `write_unknown`,
   * поза не двинулась, в ответе нет кода, — и не выполнялась НИ РАЗУ: до неё
   * не доходило.
   *
   * Наружу вместо этого уходило одно слово «модель не вернула годного ответа»,
   * и ровно на нём ломался вопрос основателя «ошибка наша или модели». Ответ
   * на него лежал в `admitted.failed` и выбрасывался.
   */
  let r;
  try {
    r = await call({
      modelId: bundle.modelId,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      maxTokens: Math.max(BODY_MAX_TOKENS, bundle.maxTokens || 0),
      thinkBudget: bundle.thinkBudget,
      accept,
      repair,
      attempts: 3,
      onAttempt,
    });
  } catch (e) {
    /*
     * ПРИЧИНА БЕРЁТСЯ ИЗ `reject`, А НЕ ИЗ `e.code`.
     *
     * `callWithRepair` всегда бросает `LlmError('rejected', …)` — это код
     * ИСХОДА, а не причины, — поэтому `e.code || …` давал `'rejected'` всегда,
     * и `whoseFault` относил к `model_code` даже HTTP 429 и оборванное
     * соединение. Замерено ревью: 429 → `model_code`, `ECONNREFUSED` →
     * `model_code`. То есть журнал, заведённый ради вопроса основателя «ошибки
     * не по нашей вине», отвечал на него одним и тем же словом.
     *
     * Настоящая причина лежит в `e.reject` (последний отказ приёмки) или в
     * `e.cause` (последняя сетевая ошибка). Порядок важен: если приёмка
     * успела высказаться, виновата модель; если нет — молчала сеть.
     */
    const netCode = e.cause && (e.cause.code || e.cause.errno) ? String(e.cause.code || e.cause.errno) : null;
    const problems = admitted?.failed
      || (e.reject ? [{ code: e.reject.code, message: e.reject.message }] : null)
      || [{ code: netCode || 'no_answer', message: e.cause?.message || e.message }];
    return {
      ok: false,
      code: 'body_failed',
      message: problems[0]?.message || e.message || 'the body did not come together',
      problems,
      costUsd: e.costUsd || 0,
      tries: e.tries,
      whose: whoseFault(problems[0]?.code),
    };
  }

  if (!admitted || !admitted.source) {
    const problems = admitted?.failed || [{ code: 'no_code', message: 'the mind returned no code' }];
    return {
      ok: false,
      code: 'body_failed',
      /* Сообщение игроку — человеческое, разбор — рядом для журнала. */
      message: problems[0]?.message || 'the body did not come together',
      problems,
      costUsd: r.costUsd || 0,
      tries: r.tries,
      whose: whoseFault(problems[0]?.code),
    };
  }
  /* Цена показа считается ЗДЕСЬ и едет с телом: приёмка его уже построила,
     значит второго построения — на сервере, при первой выдаче, — не нужно. */
  return {
    ok: true, source: admitted.source, safe: admitted.safe, draws: admitted.draws ?? null,
    costUsd: r.costUsd || 0, tries: r.tries,
  };
}
