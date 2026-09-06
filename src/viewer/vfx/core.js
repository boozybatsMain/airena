/**
 * Общий фундамент слоя эффектов: часы, затухание, пул материалов, метка
 * свечения, детерминированная случайность. Вынесено из `vfx.js`, потому что
 * теперь на нём стоят три файла (набор `kit.js` и элементные модули), а
 * круговой импорт между ними и оркестратором — это тот класс дефекта, который
 * ловится только в браузере и только когда уже поздно.
 *
 * Всё здесь работает на обоих бэкендах: TSL, ни строки GLSL (§9.1).
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';

/*
 * ── МЕТКА «ЭТО СВЕТИТСЯ» (D163) ───────────────────────────────────────────
 *
 * Bloom избирательный, а не пороговый: растровый проход пишет второй выход
 * `bloomIntensity`, и в свечение попадает ровно то, что его пометило. Причина —
 * арена белая (§10.1), и пороговый bloom засветил бы пол. Материал без метки
 * физически не может попасть в bloom, а метка ставится только здесь.
 *
 * Метка ставится, ТОЛЬКО ЕСЛИ конвейер свечения действительно собрался:
 * материал с `mrtNode` при проходе без MRT компилируется в структуру выхода
 * без единого поля, WGSL такое не собирает, и исчезает весь кадр (проверено:
 * с `?bloom=0` арена была чёрной).
 */
let glowOn = false;

/*
 * ── МЕТКА СНИМАЕТСЯ ТАМ ЖЕ, ГДЕ СТАВИТСЯ (ARENA-AAA, приёмка 06.09, blocker
 * «dropPost cannot reach the materials most likely to be carrying the fault»)
 *
 * `dropPost` в `main.js` — единственный выход из чёрного холста: пост-граф
 * бросил дважды, граф снимается, и вместе с ним обязана сняться КАЖДАЯ метка
 * свечения, потому что материал с `mrtNode` при проходе без MRT собирает
 * `struct OutputType {}`, а WGSL такого не принимает — буфер команд
 * отбрасывается целиком (довод ниже, строки про `SafeMRT`). Снимал он их
 * обходом сцены, и обход сцены — это ровно то, чего НЕДОСТАТОЧНО: пул
 * материалов (`matPool`, до `MAT_RING` штук на ключ) держит помеченные
 * материалы МЕЖДУ эффектами, то есть ВНЕ сцены, и оба материала `Particles`
 * живут в своих мешах, которые тоже могут быть сняты. Первый же эффект,
 * сыгранный после спасения, возвращал страницу ровно в ту аварию, из которой
 * спасение выводило, — и молча: `postFailed` уже отработал, второго отчёта
 * не будет.
 *
 * Поэтому метка знает своих. Каждый материал, которому её поставили,
 * записывается сюда — слабой ссылкой, чтобы список не держал в живых то, что
 * `updateFx` утилизировал, — и `setGlowEnabled(false)` снимает метки со всех
 * разом. Хук документирован и вызывается сам: `main.js` уже зовёт
 * `setGlowEnabled(false)` первой строкой `dropPost`, значит правка на его
 * стороне не нужна вовсе, а обход сцены остаётся у него ремнём поверх пояса.
 * `clearGlowMarks()` экспортируется отдельно для стенда и для будущих мест,
 * где граф снимают, не трогая флаг.
 *
 * ПОЛНОТА ПО ПОСТРОЕНИЮ, А НЕ ПО ПАМЯТИ: список ведёт сам `markGlow` (и
 * `markDistort`), то есть новый пул или новый материал попадают в него тем же
 * действием, которым получают метку. Забыть добавить нечего.
 */
/** Слабые ссылки на всё, чему ставили `mrtNode`. Чистится при обходе. */
const marked = new Set();
/* `WeakRef` есть во всех браузерах, которые тянут WebGPU, и в Node ≥ 14.6;
   запасной путь — обычная ссылка, список коротким живёт только в гейтах. */
const Ref = typeof WeakRef === 'function' ? WeakRef : class { constructor(v) { this.v = v; } deref() { return this.v; } };

function remember(material) {
  try { marked.add(new Ref(material)); } catch { /* без WeakRef — не ведём */ }
}

/**
 * Снять метку свечения со ВСЕХ материалов, которым её ставили, — включая те,
 * что сейчас лежат в пуле и в сцене не встречаются. Зовётся из
 * `setGlowEnabled(false)`; отдельно — для стенда.
 */
export function clearGlowMarks() {
  let n = 0;
  for (const ref of marked) {
    const m = ref.deref();
    marked.delete(ref);
    if (!m) continue;
    if (m.mrtNode) { m.mrtNode = null; m.needsUpdate = true; n++; }
  }
  return n;
}

/** Сколько материалов помечено прямо сейчас (для гейтов и стенда). */
export function glowMarkCount() {
  let n = 0;
  for (const ref of marked) { if (ref.deref()) n++; else marked.delete(ref); }
  return n;
}

/**
 * Включает пометку. Зовёт `main.js` — ровно тогда, когда пост-граф собран.
 * ВЫКЛЮЧЕНИЕ СНИМАЕТ УЖЕ ПОСТАВЛЕННЫЕ МЕТКИ: см. довод выше — материал с
 * `mrtNode` под проходом без MRT не рисует ничего и роняет весь буфер команд,
 * а пул держит такие материалы вне сцены, где обход сцены их не находит.
 */
export function setGlowEnabled(on) {
  const next = !!on;
  if (!next && glowOn) { glowOn = next; clearGlowMarks(); return; }
  glowOn = next;
}
export function glowEnabled() { return glowOn; }

/*
 * ── MRT, КОТОРЫЙ ВЫРОЖДАЕТСЯ В ОБЫЧНЫЙ ВЫХОД ─────────────────────────────────
 *
 * Помеченный материал рисуется не только основным проходом. Отражение пола
 * (`environment.js`, `TSL.reflector`) рендерит сцену с `renderer.setMRT(null)`,
 * и тогда `NodeMaterial` берёт `mrtNode` материала САМ ПО СЕБЕ: `MRTNode.setup`
 * ищет в цели прохода текстуру `bloomIntensity`, не находит (индекс −1) и
 * собирает `struct OutputType {}` — WGSL такое не принимает, буфер команд
 * отбрасывается, отражение не пишется. Ошибка приходит как `uncapturederror`
 * устройства, не в консоль, поэтому её никто не видел (замер: 324 ошибки за
 * 160 кадров). Узел ниже отдаёт настоящий MRT, только когда у рендерера он
 * есть, а иначе — обычный `output`. `merge` оставлен, чтобы `mrt.merge(…)`
 * основного прохода дополнял его как раньше.
 */
/* `THREE.Node` is on the WebGPU build the browser's importmap points `three`
   at. The gates that import this file in Node (`tools/checkvfx.mjs`,
   `tools/checkdocs.mjs`) resolve `three` to the core build, where it is not,
   and a class cannot extend `undefined`; there the mark is never set (the
   glow is off), so the base only has to exist. */
class SafeMRT extends (THREE.Node || Object) {
  constructor(outputs) { super('vec4'); this.outputNodes = outputs; this.isMRTNode = true; }
  has(name) { return this.outputNodes[name] !== undefined; }
  get(name) { return this.outputNodes[name]; }
  merge(m) { return TSL.mrt({ ...this.outputNodes, ...m.outputNodes }); }
  setup(builder) { return builder.renderer.getMRT() !== null ? TSL.mrt(this.outputNodes) : TSL.vec4(TSL.output); }
}

/*
 * ── ОБЩИЙ ЗАЖИМ СВЕЧЕНИЯ (ARENA-AAA, приёмка 06.09) ───────────────────────
 *
 * Метки свечения расставлялись по одной, каждым модулем в своё время, и
 * почти везде это `1` — полная сила. Пока мир был тёмным, это читалось;
 * теперь пол сидит на L* 88-90, и на нём bloom работает НЕ КАК СВЕТ, А КАК
 * ЛАСТИК: он подмешивает светлое туда, где и так светло, и эффект теряет
 * не яркость, а форму — судья 06.09 описал это как «белые круглые кляксы» и
 * «дымка поверх умирающего бойца». Требование основателя записано одним
 * словом: «bloom marks restrained».
 *
 * Один множитель на весь слой, а не сорок правок по модулям, — и потому что
 * это ОДНО решение (сколько свечения терпит белый мир), и потому что
 * пересматривать его придётся ещё раз, когда мир снова изменится. Силуэт и
 * тайминг эффектов он не трогает: `bloomIntensity` — это маска, по которой
 * пост-граф решает, что попадает в свечение, а не то, что рисуется.
 *
 * 0.7 — ЗНАЧЕНИЕ, А НЕ ДОКАЗАТЕЛЬСТВО, и честно сказать про него можно
 * только это: тридцать процентов метки сняты со всего слоя разом, и дальше
 * дело решает замер по кадру, а не число здесь. Правило замера записано в
 * тех же единицах, что у судьи: в `reports/screens/ui/live-*.png` внутри
 * арены (то есть вне панелей HUD) не должно оставаться пикселей эффекта
 * светлее копинга — #F4EEE8, L* 94 (ARENA-BRIEF §3 «nothing exceeds»).
 * Если после правки эффектов такие пиксели появятся — двигать надо этот
 * множитель, а не метки по модулям: они расставлены по СМЫСЛУ («светится
 * кант, а не тело»), и переписывать их ради экспозиции значит терять смысл.
 */
export const GLOW_TRIM = 0.7;

/**
 * `amount` — число ИЛИ узел-маска. Материал, помеченный целиком, светится
 * целиком, и на белом полу это стирает палитру в белый (замер на стенде /ice).
 * Маска отдаёт в свечение кант и трещину, а тело оставляет цвету.
 */
export function markGlow(material, amount = 1) {
  if (!glowOn) return material;
  const node = typeof amount === 'number' ? TSL.float(amount * GLOW_TRIM) : TSL.float(GLOW_TRIM).mul(amount);
  try { material.mrtNode = new SafeMRT({ bloomIntensity: node }); remember(material); } catch { /* без MRT */ }
  return material;
}

/**
 * Тепловое искажение пишется третьим выходом растрового прохода (`distort`:
 * смещение xy и сила z), и читает его только пост-граф. Материал-прокси
 * (марево над огнём) пишет смещение и ничего не рисует в цвет; все прочие
 * материалы пишут ноль по умолчанию (`MRTNode.merge` дополняет их выход
 * значениями прохода).
 */
export function markDistort(material, offsetNode, strengthNode, glowNode = TSL.float(0)) {
  if (!glowOn) return material;
  try {
    material.mrtNode = new SafeMRT({
      bloomIntensity: TSL.float(GLOW_TRIM).mul(glowNode),
      distort: TSL.vec3(offsetNode.x, offsetNode.y, strengthNode),
    });
    remember(material);
  } catch { /* без MRT */ }
  return material;
}

/**
 * Одни часы на все узловые материалы слоя. Не `TSL.time`: он идёт от старта
 * страницы, а нужны часы, которые двигает `Vfx.update` — те же, по которым
 * живут частицы. Одна униформа, а не по одной на эффект.
 */
export const TIME = TSL.uniform(0);

/*
 * ЗАТУХАНИЕ ЖИВЁТ В УЗЛЕ, А НЕ В `material.opacity`. Если у узлового материала
 * задан `opacityNode`, поле `opacity` не читается вовсе. Поэтому у такого
 * материала есть своя униформа `fade`, и она умножается внутри графа.
 */
export function withFade(m) {
  const f = TSL.uniform(1);
  m.userData.fade = f;
  return f;
}

/** Поставить затухание материалу, у которого оно есть. Тихо молчит, если нет. */
export function setFade(o, v) {
  const f = o.material && o.material.userData && o.material.userData.fade;
  if (f) f.value = v; else if (o.material) o.material.opacity = v;
}

/*
 * ── ПУЛ МАТЕРИАЛОВ (замер ревью 01.09) ────────────────────────────────────
 *
 * Новый узловой материал — всегда промах кэша программ и полная пересборка
 * графа на кадре спавна: 12–22 мс против 0.3–1.0 мс покоя. Материалы берутся
 * из кольца по ключу «вид + палитра»; кольцо, а не один экземпляр, потому что
 * два одновременных эффекта различаются только униформами (затухание,
 * возраст), и общий материал заставил бы старший мигать вместе с младшим.
 *
 * Цена честная и её видно: при (MAT_RING+1)-м одновременном эффекте одного
 * вида старший переиспользует материал младшего.
 */
export const MAT_RING = 6;
const matPool = new Map();

export function pooled(key, make, ring = MAT_RING) {
  let slot = matPool.get(key);
  if (!slot) { slot = { list: [], head: 0 }; matPool.set(key, slot); }
  if (slot.list.length < ring) {
    const m = make();
    /* Помечен как общий: `updateFx` не имеет права его утилизировать. */
    m.userData.pooled = true;
    slot.list.push(m);
    return m;
  }
  const m = slot.list[slot.head % ring];
  slot.head++;
  return m;
}

/** Геометрия, которую делят эффекты: `updateFx` её не утилизирует. */
export function shared(geometry) {
  geometry.userData.shared = true;
  return geometry;
}

/** Аддитивный «просто цвет» с меткой свечения — для оболочек и вспышек. */
export function basic(color, opacity, glow = 1) {
  const M = THREE.MeshBasicNodeMaterial || THREE.MeshBasicMaterial;
  return markGlow(new M({
    color, transparent: true, opacity, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }), glow);
}

/* ── детерминированная случайность ────────────────────────────────────────
 *
 * Повтор боя обязан выглядеть так же (A2): всё, что похоже на случай, берётся
 * от координат каста через `mulberry`, а не от `Math.random`. */
export const mulberry = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Сид от записи `world.fx`: координаты и время каста, целое. */
export function seedOf(e) {
  const x = e.x ?? e.x0 ?? 0, z = e.z ?? e.z0 ?? 0, t = e.t ?? 0;
  return (Math.round(x * 97.3 + z * 31.7 + t * 1000) ^ 0x5bd1e995) >>> 0;
}

const BACK_C1 = 1.70158, BACK_C3 = BACK_C1 + 1;
export const easeOutBack = (x) => 1 + BACK_C3 * Math.pow(x - 1, 3) + BACK_C1 * Math.pow(x - 1, 2);
export const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
export const easeInQuad = (x) => x * x;
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Случай между `a` и `b` от генератора `r` (по умолчанию `Math.random`). */
export const rnd = (a, b, r = Math.random) => a + r() * (b - a);

/** Разброс по конусу вокруг направления. */
export function spread(dx, dz, angle, r = Math.random) {
  const a = Math.atan2(dx, dz) + rnd(-angle, angle, r);
  return [Math.sin(a), Math.cos(a)];
}

/* sRGB ↔ Lab в двадцать строк: судья меряет в Lab, и правило, записанное в
   тех же единицах, проверяется его же прибором, а не на слово. */
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const labFi = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);

export function srgbToLab(r, g, b) {
  const R = toLin(r); const G = toLin(g); const B = toLin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  return [116 * labF(Y) - 16, 500 * (labF(X) - labF(Y)), 200 * (labF(Y) - labF(Z))];
}

export function labToSrgb(L, a, b) {
  const fy = (L + 16) / 116; const fx = fy + a / 500; const fz = fy - b / 200;
  const X = labFi(fx) * 0.95047; const Y = labFi(fy); const Z = labFi(fz) * 1.08883;
  return [
    X * 3.2406 + Y * -1.5372 + Z * -0.4986,
    X * -0.9689 + Y * 1.8758 + Z * 0.0415,
    X * 0.0557 + Y * -0.2040 + Z * 1.0570,
  ].map((v) => Math.min(1, Math.max(0, toSrgb(Math.max(0, v)))));
}

export const hsvOf = (r, g, b) => {
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
};
export const rgbOfHsv = (h, s, v) => {
  const C = v * s; const X = C * (1 - Math.abs(((h / 60) % 2) - 1)); const m = v - C; const t = h / 60;
  const p = t < 1 ? [C, X, 0] : t < 2 ? [X, C, 0] : t < 3 ? [0, C, X]
    : t < 4 ? [0, X, C] : t < 5 ? [X, 0, C] : [C, 0, X];
  return p.map((q) => q + m);
};


/*
 * ── ЧЬЯ ЭТО КРАСКА (ARENA-AAA §1, приёмка 06.09) ──────────────────────────
 *
 * Директива основателя: СИНИЙ — существо игрока, коралловый — противник, на
 * каждой поверхности, «включая тинты эффектов, производные от стороны». До
 * сих пор слой эффектов о сторонах не знал ВООБЩЕ: `play` получает запись с
 * полем `who` («blue» / «orange»), и дальше оно использовалось только чтобы
 * найти капсулу тела. Поэтому мороз шёл своей бирюзой, а пыль удара — своей
 * бурой, и ни одна из них не говорила, ЧЕЙ это удар.
 *
 * Владение решает `main.js` (`applySides`), и решает ОДИН РАЗ на матч: он же
 * публикует ответ в `window.__airenaSides` — `{ blue: 'own'|'slot', orange:
 * …, mine }`, — и `tools/shots.mjs` кладёт его в сайдкар каждого снимка.
 * Читать этот ответ, а не считать свой, — единственный способ, которым слой
 * эффектов может НЕ РАЗОЙТИСЬ с полом и HUD: расхождение здесь означало бы
 * коралловый купол над синим кольцом.
 *
 * Три источника по убыванию надёжности, и все три дают один и тот же ответ,
 * когда есть первый:
 *   1. `ctx.sideColor(who)` — если контекст его даёт. Это дверь для `main.js`:
 *      он может отдать СВОЙ `SCENE_COLOR[who]` (уже прогнанный через обратный
 *      тон-мап), и тогда эффект и пол красятся буквально одним числом.
 *   2. `window.__airenaSides` — опубликованный ответ `applySides`.
 *   3. Слоты по умолчанию (первый слот — синий): зритель без своего существа
 *      и любой стенд.
 *
 * Токены здесь те же, что у HUD и у пола (`--info`, `--accent`), но БЕЗ
 * предтонирования: палитры эффектов тоже идут в линейное пространство прямым
 * `convertSRGBToLinear`, и смешивать их с предтонированным числом значило бы
 * складывать две разные шкалы.
 */
const OWN_HEX = 0x6EA8FF;   /* --info: существо игрока */
const FOE_HEX = 0xFF7A5C;   /* --accent: противник */
/* `new THREE.Color(hex)` УЖЕ переводит из sRGB в рабочее (линейное)
   пространство — управление цветом в три.js включено. Второй перевод
   (`convertSRGBToLinear`) давал #FF3219 вместо #FF7A5C, то есть чужой цвет
   стороны; поймано замером оттенка. */
const SIDE_TONE = { own: new THREE.Color(OWN_HEX), foe: new THREE.Color(FOE_HEX) };
/** Без матча слоты держат свои имена: первый слот — синий (как в `main.js`). */
const SLOT_ROLE = { blue: 'own', orange: 'foe' };

/** Какую роль носит слот прямо сейчас. */
export function sideRole(who) {
  const s = typeof window !== 'undefined' && window.__airenaSides;
  const r = s && s[who];
  return r === 'own' || r === 'foe' ? r : (SLOT_ROLE[who] || 'own');
}

/**
 * Цвет стороны каста, в линейном пространстве. `ctx` — контекст `play`.
 * Возвращает ОБЩИЙ объект: звать `.clone()`, если нужно править.
 */
export function sideTone(who, ctx = null) {
  const given = ctx && typeof ctx.sideColor === 'function' ? ctx.sideColor(who) : null;
  if (given && given.isColor) return given;
  return SIDE_TONE[sideRole(who)];
}

/*
 * ── МАССА ЭФФЕКТА, ПОДПИСАННАЯ СТОРОНОЙ, НО НЕ ПЕРЕКРАШЕННАЯ В НЕЁ ────────
 *
 * Судья 06.09 просит два условия сразу: «эффект носит цвет своей стороны» и
 * «ни одна масса эффекта больше 1 000 px не сидит ниже b* 0», при том что
 * цвет игрока сам холодный. Совместимы они ровно одним способом: СТОРОНА
 * ДАЁТ ОТТЕНОК, А НЕ ГРОМКОСТЬ, и делает это в пределах мира. Инструмент —
 * `worldTone` ниже (там же довод, почему поворот оттенка HSV для этого не
 * годится: бирюза и коралл стоят на круге почти напротив друг друга, и
 * кратчайшая дуга между ними идёт через пурпур).
 *
 * `k` — доля пути к оттенку стороны, `bFloor` — пол по b*, `cap` — потолок
 * цветности. Умолчания — те, по которым мерил судья.
 */
export function sideWash(colour, who, opts = {}) {
  const { ctx = null, ...rest } = opts;
  return worldTone(colour, sideTone(who, ctx), rest);
}

/** Масса без стороны (стенд, зритель-фон): только приведение к миру. */
export function massTone(colour, opts = {}) { return worldTone(colour, null, opts); }

/*
 * ── ПРИВЕДЕНИЕ КРАСКИ ЭФФЕКТА К МИРУ (ARENA-AAA, приёмка 06.09) ───────────
 *
 * Судья 06.09 отверг две массы подряд, и обе — по одной причине, записанной
 * в двух разных единицах:
 *   · мороз — «единственная холодная масса в тёплом мире, и лежит прямо
 *     поверх бойца»: купол 2 060 px с b* −3.3 против площади b* +9.5, то
 *     есть 12.8 пункта поперёк оси, которую `environment.js` держит своей
 *     дисциплиной («a ≤ 3, b 7-11: тёплый, никогда не розовый, никогда не
 *     синий»);
 *   · шлейф удара — «грязь, а не тёплый акцент палитры»: #A17961, тон 58 при
 *     C 22.8, ровно посередине между коралловым акцентом (тон 40 при C 63) и
 *     песком площади (тон 73 при C 11), — то есть цвет, которого в палитре
 *     нет ни в одном конце.
 * Приёмочное правило судьи одно и меряется прибором: НИ ОДНА МАССА ЭФФЕКТА
 * ПЛОЩАДЬЮ БОЛЬШЕ 1 000 px НЕ ИМЕЕТ ПРАВА СИДЕТЬ НИЖЕ b* 0 (метки сторон —
 * исключение: синий телеграф принадлежит игроку и обязан быть холодным).
 *
 * ПОЧЕМУ НЕ ПОВОРОТ ОТТЕНКА, КОТОРЫМ СДЕЛАНА ГРАДУИРОВКА В `vfx.js`. Бирюза
 * и коралл стоят на круге почти напротив друг друга (191° и 6°), и
 * кратчайшая дуга между ними идёт либо через зелень, либо через пурпур —
 * замерено: `k = 0.6` давало #F27FA5, розовый. Поворот годится, когда цвета
 * соседи; здесь нужен другой инструмент.
 *
 * ЧТО ДЕЛАЕТСЯ. Работа идёт в Lab и ТОЛЬКО с парой (a*, b*), то есть со
 * цветностью; светлота источника не трогается вовсе — иначе масса меняет
 * вес, а вес эффекта это его форма (§9.2). Пара тянется к направлению
 * стороны той же длины (сторона даёт ОТТЕНОК, а не громкость), затем длина
 * зажимается потолком мира, затем b* поднимается до пола. Итог: масса своей
 * стороны читается как «эта штука принадлежит синему» наклоном a*, но не
 * добавляет миру третьего холодного пятна.
 */
/** Потолок цветности массы: площадь мира держит C* 8-11, баннер 64. */
export const MASS_CHROMA = 14;

/** Оттенок в Lab (радианы) — направление пары (a*, b*). */
function labHue(c) {
  const s = c.clone().convertLinearToSRGB();
  const [, a, b] = srgbToLab(s.r, s.g, s.b);
  return Math.atan2(b, a);
}

/**
 * Привести цвет массы к миру, наклонив его к стороне.
 *
 * `colour` — линейный `THREE.Color`; `side` — линейный цвет стороны (может
 * быть `null`: тогда наклона нет, только зажим); `k` — доля пути к оттенку
 * стороны; `bFloor` — минимальный b*; `cap` — потолок цветности.
 */
export function worldTone(colour, side, { k = 0.5, bFloor = 0, cap = MASS_CHROMA } = {}) {
  const s0 = colour.clone().convertLinearToSRGB();
  const [L, a0, b0] = srgbToLab(s0.r, s0.g, s0.b);
  /*
   * ГРОМКОСТЬ ЗАЖИМАЕТСЯ ПЕРВОЙ, ОТТЕНОК РЕШАЕТСЯ ВТОРЫМ, И ПОРЯДОК ВАЖЕН.
   * Сперва было наоборот, и вот что получалось: у морозной вуали C* 25 при
   * потолке 12, доля пути 0.45 отсчитывалась от НЕзажатой пары — то есть
   * почти вся уходила на то, чтобы сбить громкость, и на оттенок не
   * оставалось ничего. Замер: своя вуаль a* −6.9, чужая −6.5, разницы нет.
   * С зажимом впереди обе стартуют с одной длины, и доля пути честно
   * работает оттенком: −5.3 против −0.7.
   */
  const C0 = Math.hypot(a0, b0);
  const s = C0 > cap ? cap / C0 : 1;
  let a = a0 * s; let b = b0 * s;
  if (side) {
    const th = labHue(side);
    const C = Math.min(C0, cap);
    a += (Math.cos(th) * C - a) * k;
    b += (Math.sin(th) * C - b) * k;
  }
  const len = Math.hypot(a, b);
  if (len > cap) { a = (a / len) * cap; b = (b / len) * cap; }
  if (b < bFloor) b = bFloor;
  const [r, g, bb] = labToSrgb(L, a, b);
  return new THREE.Color(r, g, bb).convertSRGBToLinear();
}

/** `THREE.Color` → узел vec3. */
export const col = (c) => TSL.vec3(c.r, c.g, c.b);
