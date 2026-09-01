/**
 * VFX уровня 1 — то, чем видно грамматику §8.
 *
 * Правило, которое здесь главное, и оно из реестра дословно: **variety the
 * player cannot see is not variety**. Четырнадцать атомов и девять доставок
 * стоят ровно столько, сколько их различает зритель, и ни очком больше.
 *
 * READ KIT (§9.2) — неприкосновенная часть, и она разложена так:
 *   ДОСТАВКА задаёт СИЛУЭТ. Луч — цилиндр, конус — клин, болт — спрайт,
 *     лоб — дуга, зона — диск, рывок — лента, мигание — два кольца,
 *     self — оболочка, прыжок — кольцо отрыва и тень под телом.
 *     Силуэт не выбирается и не заменяется.
 *   ЭЛЕМЕНТ задаёт ПАЛИТРУ. Пять палитр, по одной на элемент, взяты из
 *     `src/skills/registry.js` — одного источника на сервер и на экран.
 *   ЭФФЕКТ задаёт ИМПАКТ. Что происходит в точке попадания.
 *
 * И правило §10.1, принуждаемое кодом: **эмиссия зарезервирована
 * исключительно за скиллами, телеграфами и импактами.** Тело не светится
 * никогда. Поэтому весь этот файл рисует в аддитивном блендинге, а тела —
 * нет, и палитры отсюда телу недоступны.
 *
 * Частицы — один инстансированный пул, как в референсе основателя
 * (`ParticleSystem.js`): интеграция движения аналитическая, в вершинном
 * шейдере, ноль аллокаций после конструктора. Идея оттуда, код — нет:
 * там сырой GLSL, а `WebGPURenderer` не рендерит `ShaderMaterial` в
 * принципе (§9.1). Здесь TSL, то есть одно и то же на обоих бэкендах.
 */

import * as THREE from 'three';
import * as TSL from 'three/tsl';

/* Относительный путь: у зрителя он разрешается в тот же `/skills/registry.js`,
   а у нас — в настоящий файл, и модуль становится проверяемым гейтом. */
import { ELEMENTS } from '../skills/registry.js';

/**
 * ── МЕТКА «ЭТО СВЕТИТСЯ» (D163) ───────────────────────────────────────────
 *
 * Bloom в этом проекте не пороговый, а избирательный: растровый проход пишет
 * второй выход `bloomIntensity`, и в свечение попадает ровно то, что его
 * пометило. Причина — арена белая (§10.1), и пороговый bloom засветил бы пол.
 *
 * Из этого получается приятная вещь: правило §10.1 «эмиссия зарезервирована
 * исключительно за скиллами, телеграфами и импактами» перестало быть
 * соглашением в комментарии. Материал без метки физически не может попасть
 * в bloom, а метка ставится только здесь и только этой функцией.
 *
 * `try` не для красоты: `mrtNode` — свойство узловых материалов, и на
 * бэкенде без MRT присваивание может бросить. Эффект обязан нарисоваться и
 * без свечения.
 */
/*
 * Метка ставится, ТОЛЬКО ЕСЛИ конвейер свечения действительно собрался.
 *
 * `material.mrtNode` описывает, что материал пишет в дополнительные выходы
 * растрового прохода. Если у прохода MRT не настроен, а у материала есть, —
 * получается структура выхода БЕЗ ЕДИНОГО ПОЛЯ, и WGSL такой шейдер не
 * компилирует: «structures must have at least one member». Материал молча не
 * рисуется, а с ним и весь кадр.
 *
 * Проверено вживую: с `?bloom=0` арена была чёрной, а консоль — в ошибках
 * компиляции. То есть выключатель, заведённый ради проверки запасного пути,
 * сам этот путь и ломал.
 */
let glowOn = false;

/** Включает пометку. Зовёт `main.js` — ровно тогда, когда `PostProcessing` собран. */
export function setGlowEnabled(on) { glowOn = !!on; }

/** Материал фигуры телеграфа и переключатель его затухания — для `main.js`. */
export { telegraphMat, setFade };

export function markGlow(material, amount = 1) {
  if (!glowOn) return material;
  try { material.mrtNode = TSL.mrt({ bloomIntensity: TSL.float(amount) }); } catch { /* без MRT */ }
  return material;
}

/**
 * Тень прыжка — ЕДИНСТВЕННЫЙ меш этого файла, который не светится.
 *
 * Она не эффект, а показание высоты: тёмный круг на светлом полу. Аддитивный
 * блендинг сделал бы её невидимой (чёрное плюс белое — белое), а метка
 * свечения — светящейся чёрной кляксой. Обычный блендинг, обычный материал,
 * никакой метки.
 */
function shadowMat() {
  const M = THREE.MeshBasicNodeMaterial || THREE.MeshBasicMaterial;
  return new M({
    color: 0x0b1016, transparent: true, opacity: 0.34,
    side: THREE.DoubleSide, depthWrite: false,
  });
}

/*
 * ── СЛОИСТЫЕ МАТЕРИАЛЫ (D163) ─────────────────────────────────────────────
 *
 * Референс основателя (`genex.games/elemental-sandbox`, MIT, three.js + Vite)
 * проверен и НЕ ПОДХОДИТ КАК КОД: он написан на сыром GLSL через
 * `ShaderMaterial`, а `WebGPURenderer` такой материал не рендерит в принципе
 * (§9.1) — ни одной строки оттуда взять нельзя. Взяты ПРИЁМЫ, переписанные
 * на TSL, то есть работающие на обоих бэкендах:
 *
 *   параметрическая труба с послойным рендером  → `tubeMat` (Nova Beam)
 *   лента с изломами по шумовой линии           → `ribbon`  (Storm Lance)
 *   ожог и трещины на полу по SDF и шуму        → `scorch`  (ground burns)
 *   вспышка света в точке попадания             → `flashLight`
 *
 * Правило §9.2 не нарушено: силуэт доставки остаётся тем же (луч — цилиндр,
 * снаряд — летящая голова), меняется только то, ЧЕМ он закрашен.
 */

const { Fn, float, vec2, vec3, vec4, uv, uniform, mix, smoothstep, oneMinus,
  abs: tabs, sin: tsin, fract, pow: tpow, mx_noise_float, mx_fractal_noise_float } = TSL;

/**
 * Труба луча: яркое ядро, мягкая оболочка, бегущая по стволу рябь.
 *
 * Один материал вместо двух мешей «цилиндр плюс цилиндр пожирнее». Плотность
 * считается от расстояния до оси (`uv.y` вдоль, `uv.x` по окружности), и
 * поперёк ствола получается настоящий градиент, а не две ступеньки.
 *
 * `t` — живая униформа, её двигает `update`. Рябь идёт ВДОЛЬ ствола к цели:
 * это то, что отличает выстрел от нарисованной палки, и оно дешевле искр.
 */
/**
 * Одни часы на все узловые материалы этого файла.
 *
 * Не `TSL.time`: он идёт от старта страницы, а нам нужны часы, которые
 * двигает `Vfx.update` — те же, по которым живут частицы. Одна униформа на
 * все материалы, а не по одной на эффект: их за бой создаются сотни, и
 * сотня униформ — это сотня обновлений на кадр вместо одного.
 */
const TIME = TSL.uniform(0);

/*
 * ЗАТУХАНИЕ ЖИВЁТ В УЗЛЕ, А НЕ В `material.opacity`.
 *
 * Если у узлового материала задан `opacityNode`, поле `opacity` не читается
 * вовсе — три.js берёт значение из графа. Написать `o.material.opacity = 1-u`
 * рядом с `opacityNode` значит написать строку, которая ничего не делает, и
 * эффект будет висеть на полу с полной яркостью до самого удаления.
 *
 * Поэтому у каждого такого материала есть своя униформа `fade`, и она
 * умножается внутри графа. Ссылка кладётся в `userData`, чтобы обновлять её
 * из колбэка `spawnMesh` одной строкой.
 */
function withFade(m) {
  const f = TSL.uniform(1);
  m.userData.fade = f;
  return f;
}

/*
 * ── ПУЛ МАТЕРИАЛОВ (замер ревью 01.09) ────────────────────────────────────
 *
 * У узлового материала ключ кэша программы включает `object.id` каждого узла
 * графа (`NodeUtils.getCacheKey`). Значит НОВЫЙ материал — это всегда промах
 * кэша и полная пересборка графа с генерацией WGSL на том же кадре, где
 * эффект появился.
 *
 * Замерено в живом Chrome на WebGPU: кадр со спавном стоит 12–22 мс против
 * 0.3–1.0 мс покоя, и это не прогрев — восемь одинаковых импактов подряд дали
 * 18.1 / 14.8 / 14.7 / 16.3 / 20.7 / 12.9 / 11.5 / 12.8 мс. За бой таких
 * спавнов около ста тридцати, то есть просадка гарантирована ровно на кадрах
 * попаданий — там, где смотреть важнее всего.
 *
 * Материалы теперь берутся из кольца по ключу «вид + палитра». Кольцо, а не
 * один экземпляр: единственное, что различается у двух одновременных
 * эффектов, — униформа затухания, и общий материал заставил бы старший
 * эффект мигать вместе с младшим. Шести хватает: эффект живёт 0.3–3 с, а
 * одновременных одного вида бывает два-три.
 *
 * Цена честная и её видно: при седьмом одновременном эффекте одного вида
 * старший переиспользует материал младшего и доиграет с его прозрачностью.
 * Это дешевле, чем двадцать миллисекунд на каждом попадании.
 */
const MAT_RING = 6;
const matPool = new Map();

function pooled(key, make) {
  let ring = matPool.get(key);
  if (!ring) { ring = { list: [], head: 0 }; matPool.set(key, ring); }
  if (ring.list.length < MAT_RING) {
    const m = make();
    /* Помечен как общий: `updateFx` не имеет права его утилизировать. */
    m.userData.pooled = true;
    ring.list.push(m);
    return m;
  }
  const m = ring.list[ring.head % MAT_RING];
  ring.head++;
  return m;
}

/** Поставить затухание материалу, у которого оно есть. Тихо молчит, если нет. */
function setFade(o, v) {
  const f = o.material && o.material.userData && o.material.userData.fade;
  if (f) f.value = v; else if (o.material) o.material.opacity = v;
}

function tubeMat(P, t = TIME) {
  const M = THREE.MeshBasicNodeMaterial || THREE.MeshBasicMaterial;
  if (!THREE.MeshBasicNodeMaterial) return basic(P[1], 0.95);
  return pooled(`tube:${P.join()}`, () => makeTubeMat(P, t));
}

function makeTubeMat(P, t) {
  const M = THREE.MeshBasicNodeMaterial;
  /*
   * ЯДРО РИСУЕТСЯ ОБЫЧНЫМ БЛЕНДИНГОМ, А НЕ АДДИТИВНЫМ.
   *
   * Это тот же урок, из-за которого в этом файле ДВА пула частиц (см.
   * комментарий у `Particles`): арена белая, и «фон плюс цвет» на белом даёт
   * белое при любом цвете. Проверено на стенде после первой версии: луч
   * `kinetic`, `ember` и `void` дали три одинаковых белых шнура — то есть
   * элемент, единственная ось грамматики, которая существует РАДИ вида,
   * перестал быть виден вовсе.
   *
   * Обычный блендинг оставляет ядру его цвет. Свечение вокруг него даёт
   * внешняя оболочка (она аддитивная) и bloom, которому ядро отдаёт свою
   * яркость через метку — то есть светится оно ровно так же, просто не
   * складывается с полом.
   */
  const m = new M({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const fade = withFade(m);
  /*
   * ЦВЕТ ЛУЧА — ЭТО P[1] И P[2], А БЛИК P[0] — ТОНКАЯ НИТЬ ПО ОСИ.
   *
   * Первая версия красила ядро в P[0]. У всех пяти палитр первый цвет почти
   * белый — это блик, так задумано (см. `hue`), — и на экране получилось ровно
   * то, о чём предупреждает комментарий к `hue`: пять элементов стали
   * НЕОТЛИЧИМЫ. Проверено на стенде: `beam·kinetic`, `beam·arc` и `beam·void`
   * дали три одинаковых белых луча. С bloom стало хуже, а не лучше: свечение
   * растащило белое ядро на всю толщину.
   *
   * Теперь белого ровно столько, сколько его бывает у настоящего раскалённого
   * шнура: центральные пятнадцать процентов. Всё остальное — цвет элемента.
   */
  const c0 = new THREE.Color(P[0]); const c1 = new THREE.Color(P[1]); const c2 = new THREE.Color(P[2]);
  /*
   * «ГДЕ СЕРЕДИНА ТРУБЫ» СЧИТАЕТСЯ ПО НОРМАЛИ, А НЕ ПО `uv.x`.
   *
   * Первая версия брала |uv.x − 0.5|, как будто это расстояние до оси. Для
   * цилиндра `uv.x` — это УГОЛ по окружности: ноль приходится на дальнюю
   * сторону трубы, а не на её видимую середину, и «ядро» рисовалось с той
   * стороны, которую зритель не видит. На стенде это выглядело как ровный
   * белый шнур без всякой слоистости, чем оно и было.
   *
   * Правильная величина — насколько поверхность повёрнута К КАМЕРЕ. В центре
   * видимой трубы нормаль смотрит на зрителя (скалярное произведение ~1), на
   * силуэтных краях она перпендикулярна взгляду (~0). Это то же самое
   * френелевское слагаемое, которым делают трубы в референсе, и оно
   * правильно ведёт себя при любом ракурсе камеры — а камера здесь летает.
   */
  const V = TSL.cameraPosition.sub(TSL.positionWorld).normalize();
  const facing = TSL.normalWorld.dot(V).abs().clamp(0, 1);
  const core = facing.pow(1.6);
  /*
   * Полоса блика УЗКАЯ, и это замер, а не вкус.
   *
   * При `smoothstep(0.72, 1)` белая нить занимала почти всю видимую ширину
   * трубы: у тонкого цилиндра нормаль смотрит на камеру в широкой полосе, а
   * не в одной точке. На экране получался белый шнур с еле тёплым краем —
   * то есть цвет элемента опять терялся, теперь уже по другой причине.
   *
   * 0.94 и половинная сила: блик остаётся бликом, а цвет остаётся цветом.
   */
  const hot = smoothstep(float(0.94), float(1.0), facing).mul(0.55);
  const flow = mx_noise_float(vec3(uv().y.mul(9), t.mul(2.2), 0)).mul(0.35).add(0.85);
  m.colorNode = mix(mix(vec3(c2.r, c2.g, c2.b), vec3(c1.r, c1.g, c1.b), core),
    vec3(c0.r, c0.g, c0.b), hot);
  /* Непрозрачность держится высокой в середине и падает к силуэту: тогда
     труба читается как объём, а не как плоская лента. */
  m.opacityNode = core.mul(flow).clamp(0, 1).mul(fade);
  return markGlow(m, 1);
}

/**
 * Плита пола под зоной: кольцо, заливка и трещины по шуму.
 *
 * Зона живёт секундами и до этого была ровным диском — то есть самая долгая
 * фигура на экране была и самой мёртвой. Трещины дают ей движение, которое
 * не стоит ни одной частицы: шум считается в пикселе.
 */
function zoneMat(colorRing, colorFill, t = TIME) {
  if (!THREE.MeshBasicNodeMaterial) return basic(colorRing, 0.5);
  return pooled(`zone:${colorRing}:${colorFill}`, () => makeZoneMat(colorRing, colorFill, t));
}

function makeZoneMat(colorRing, colorFill, t) {
  const M = THREE.MeshBasicNodeMaterial;
  /* Обычный блендинг по той же причине, что у трубы луча: плита лежит НА
     белом полу, и аддитивная она была бы белым пятном любого элемента. */
  const m = new M({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const fade = withFade(m);
  const cr = new THREE.Color(colorRing); const cf = new THREE.Color(colorFill);
  const q = uv().sub(vec2(0.5, 0.5));
  const r = q.length().mul(2);                       // 0 в центре, 1 на краю
  const rim = smoothstep(float(0.86), float(0.99), r).mul(oneMinus(smoothstep(float(0.99), float(1.0), r)));
  /* Трещины: тонкие линии там, где фрактальный шум близок к нулю. */
  const n = mx_fractal_noise_float(vec3(q.mul(7), t.mul(0.35)), 3, 2, 0.5, 1);
  const crack = oneMinus(smoothstep(float(0.0), float(0.16), tabs(n))).mul(oneMinus(r).clamp(0, 1));
  const pulse = tsin(t.mul(6)).mul(0.12).add(0.88);
  m.colorNode = mix(vec3(cf.r, cf.g, cf.b), vec3(cr.r, cr.g, cr.b), rim.add(crack).clamp(0, 1));
  m.opacityNode = rim.mul(0.85).add(crack.mul(0.5)).add(oneMinus(r).clamp(0, 1).mul(0.12)).mul(pulse).clamp(0, 1).mul(fade);
  return markGlow(m, 1);
}

/**
 * Ожог на полу после попадания.
 *
 * До этого декали существовали ТОЛЬКО в слое модели (VFX-IR), то есть у
 * существа без сгенерированной декорации бой не оставлял на полу ничего —
 * и четыре захардкоженных умения тоже. Пятно живёт секунду с небольшим и
 * гаснет: это след удара, а не разметка.
 */
function scorchMat(color) {
  if (!THREE.MeshBasicNodeMaterial) return basic(color, 0.4);
  return pooled(`scorch:${color}`, () => makeScorchMat(color));
}

function makeScorchMat(color) {
  const M = THREE.MeshBasicNodeMaterial;
  const m = new M({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const fade = withFade(m);
  const c = new THREE.Color(color);
  const q = uv().sub(vec2(0.5, 0.5));
  const r = q.length().mul(2);
  const edge = mx_noise_float(vec3(q.mul(6), 0)).mul(0.22);
  const mask = oneMinus(smoothstep(float(0.45), float(1.0), r.add(edge))).clamp(0, 1);
  m.colorNode = vec3(c.r, c.g, c.b);
  m.opacityNode = mask.pow(1.4).mul(fade);
  return m;   // ожог НЕ светится: он тёмный след, а не источник
}

/**
 * Фигура телеграфа на полу: заливка И ЯРКИЙ КОНТУР.
 *
 * ЗАЧЕМ КОНТУР. Пол арены белый (§10.1, `0xe9e6de` под ключевым светом 2.6),
 * и полупрозрачная заливка на нём даёт отношение яркостей 1.06–1.19:1 —
 * замерено ревью. Красный, который здесь стоял раньше, давал 1.23–1.68 за
 * счёт того, что он ТЕМНЕЕ пола; циан и оранж светлее, и та же прозрачность
 * читается вдвое хуже. То есть замена цвета на цвет стороны (D162), сделанная
 * ради принадлежности, отняла заметность.
 *
 * Контур не зависит от яркости заливки: тонкая линия полной непрозрачности
 * видна на любом фоне, потому что рядом с ней всегда есть контраст к самой
 * себе. Заливка после этого нужна только чтобы сказать «внутри опасно», и
 * ей позволено быть слабой.
 *
 * `kind` — форма развёртки, а не доставки: у конуса это сектор круга (край
 * по радиусу плюс две прямые стороны), у полосы — прямоугольник.
 */
function telegraphMat(color, kind, halfAngle = 1) {
  if (!THREE.MeshBasicNodeMaterial) return null;
  /* Телеграфов ровно четыре на весь бой (две стороны × конус и полоса), они
     живут всю игру и не пересоздаются — кольцо им не нужно, нужен только
     общий конструктор. */
  return makeTelegraphMat(color, kind, halfAngle);
}

function makeTelegraphMat(color, kind, halfAngle) {
  const M = THREE.MeshBasicNodeMaterial;
  const m = new M({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const fade = withFade(m);
  const c = new THREE.Color(color);
  const q = uv().sub(vec2(0.5, 0.5));
  let edge; let inside;
  if (kind === 'cone') {
    const r = q.length().mul(2);
    inside = oneMinus(smoothstep(float(0.97), float(1.0), r));
    /* Дуга по внешнему радиусу плюс две прямые стороны сектора. Угол
       отсчитывается от +Y, как построена геометрия сектора. */
    const arcEdge = smoothstep(float(0.86), float(0.985), r).mul(inside);
    const ang = TSL.atan(q.x, q.y).abs();
    const sideEdge = oneMinus(smoothstep(float(0.0), float(0.05), tabs(ang.sub(float(halfAngle)))))
      .mul(smoothstep(float(0.06), float(0.2), r));
    edge = arcEdge.add(sideEdge).clamp(0, 1);
  } else {
    const dx = tabs(q.x).mul(2); const dy = tabs(q.y).mul(2);
    inside = float(1);
    edge = smoothstep(float(0.86), float(0.995), dx.max(dy)).mul(oneMinus(smoothstep(float(0.995), float(1.0), dx.max(dy))));
  }
  m.colorNode = vec3(c.r, c.g, c.b);
  /* Контур почти непрозрачен, заливка слабая: читаемость несёт линия. */
  m.opacityNode = edge.mul(0.95).add(inside.mul(0.20)).clamp(0, 1).mul(fade);
  /*
   * ФИГУРА НА ПОЛУ НЕ СВЕТИТСЯ, И ЭТО ЗАМЕР, А НЕ ВКУС.
   *
   * Свечение получает на вход КОМПОЗИТ кадра (`colour.mul(glow)`), а не
   * собственный цвет эффекта. Под полупрозрачной фигурой в композите лежит
   * в основном пол, значит bloom подмешивает СВЕТЛОЕ ровно туда, где
   * телеграф пол затемняет, и половина выигрыша от контура съедается.
   *
   * Телеграф и не должен светиться: он разметка, а не источник. §10.1
   * отводит эмиссию скиллам, телеграфам и импактам — но «телеграф» там про
   * полосу каста над головой и линию прицела, которые висят в воздухе, а не
   * про краску на полу.
   */
  return m;
}

/** Палитра элемента: три цвета, от ядра к краю. */
/**
 * Какой цвет палитры взять для i-й частицы.
 *
 * Не `P[i % 3]`. Первый цвет каждой палитры почти белый — так задумано, это
 * блик, — а арена по §10.1 белая. Ровная треть белых частиц на белом полу
 * означает, что треть эффекта не видно, а оставшиеся две трети у разных
 * элементов сближаются: замер по пикселям давал шесть пар элементов из десяти
 * неразличимыми. Блик остаётся, но одним из шести, а не одним из трёх.
 */
export function hue(P, i) {
  const order = [1, 2, 1, 0, 2, 1];
  return P[order[i % 6]];
}

export function palette(element) {
  const p = (ELEMENTS[element] || ELEMENTS.kinetic).palette;
  return p.map((h) => new THREE.Color(h));
}

// ───────────────────────────────────────────────────────────────────────────
// пул частиц
// ───────────────────────────────────────────────────────────────────────────

const MAX_PARTICLES = 3000;

/** Сколько источников света держим под вспышки удара. См. конструктор `Vfx`. */
const LIGHT_POOL = 2;

/**
 * Инстансированные квады с аналитическим движением.
 *
 * У каждой частицы семнадцать чисел: позиция, скорость, ускорение, цвет,
 * размер, время рождения, время жизни, вращение. Дальше её никто не трогает —
 * вершинный шейдер вычисляет, где она сейчас, из `t - born`. Это и есть
 * причина, по которой тысяча частиц стоит один вызов отрисовки и ноль
 * работы на процессоре: обновляется одно число на кадр, общее время.
 */
export class Particles {
  constructor(scene, { blending = THREE.AdditiveBlending, max = MAX_PARTICLES } = {}) {
    this.max = max;
    this.head = 0;
    this.time = TSL.uniform(0);

    const geo = new THREE.InstancedBufferGeometry();
    geo.instanceCount = max;
    /* Квад из двух треугольников — базовая геометрия, одна на все частицы. */
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;

    this.buf = {
      p0: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
      v0: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
      acc: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
      col: new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3),
      /* x: born, y: life, z: size, w: ФОРМА (0 точка, 1 штрих, 2 осколок, 3 искра).
         Здесь раньше лежал `spin`, который не читал никто: ни вершинный узел,
         ни фрагментный. Слот стоял занятым и не делал ничего, а ось «спрайт»
         в грамматике VFX-IR при этом существовала и была невидимой — то есть
         игрок платил за выбор, которого не видно. Реестр умений про это
         говорит прямо: разнообразие, которого не видно, разнообразием не
         является. Слот отдан форме. */
      cfg: new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4),
    };
    for (const [k, a] of Object.entries(this.buf)) {
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(k, a);
    }
    /* Жизнь нулевой длины = частица не существует. Пул стартует пустым. */
    this.geo = geo;

    /*
     * Материал: `MeshBasicNodeMaterial` с ручным биллбордом, а НЕ
     * `SpriteNodeMaterial`.
     *
     * Спрайтовый материал считает позицию из матрицы объекта и своих
     * `scaleNode`/`rotationNode`; инстансный атрибут он в неё не подмешивает,
     * и три тысячи частиц сходятся в одну точку в начале координат. Проверено
     * вживую: данные в буферах верные, время идёт, меш в сцене — и ни одного
     * пикселя на экране.
     *
     * Здесь квад разворачивается к камере в ПРОСТРАНСТВЕ ВИДА: центр частицы
     * переводится модельно-видовой матрицей, а угол квада прибавляется уже
     * после неё, по осям экрана. Это тот же приём, что в референсе основателя,
     * только записанный узлами вместо сырого GLSL — `WebGPURenderer` не
     * рендерит `ShaderMaterial` в принципе (§9.1).
     */
    const { attribute, cameraProjectionMatrix, float, modelViewMatrix, positionLocal, uv, vec2, vec4 } = TSL;
    const t = this.time;
    const p0 = attribute('p0', 'vec3');
    const v0 = attribute('v0', 'vec3');
    const acc = attribute('acc', 'vec3');
    const col = attribute('col', 'vec3');
    const cfg = attribute('cfg', 'vec4');

    const age = t.sub(cfg.x);
    const life = cfg.y;
    /* `u` не клампится: он нужен и ОТРИЦАТЕЛЬНЫМ (частица ещё не родилась —
       так зона сыплет искры пачками в будущее), и больше единицы (умерла). */
    const u = age.div(life.max(float(0.0001)));
    const alive = u.greaterThanEqual(float(0)).and(u.lessThan(float(1)));
    const uc = u.clamp(0, 1);

    /* Аналитическая интеграция: p = p0 + v0·τ + ½a·τ². Ни одного шага, ни
       одной аллокации, ни одной строки работы на процессоре. */
    const tau = age.max(float(0));
    const pos = p0.add(v0.mul(tau)).add(acc.mul(tau).mul(tau).mul(0.5));

    /* Размер гаснет к концу жизни, но не в ноль: частица, схлопнувшаяся в
       точку, читается как артефакт, а не как затухание. Мёртвая — в ноль. */
    const size = cfg.z.mul(float(1).sub(uc.mul(0.5))).mul(alive.select(float(1), float(0)));

    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = blending;
    mat.side = THREE.DoubleSide;
    /*
     * ЧЕТЫРЕ ФОРМЫ, А НЕ ОДИН КРУГ.
     *
     * Форма — это одна из шести осей, которые модель выбирает в VFX-IR (§9.2),
     * и до этого места она не доезжала: все частицы рисовались одинаковым
     * мягким кругом. Проверено глазом на стенде — штрих, осколок и искра были
     * неотличимы, то есть треть грамматики декораций не существовала.
     *
     * Форма делается ДВУМЯ вещами сразу, и обеими нужно:
     *   ПРОПОРЦИЯ квада — штрих обязан быть вытянутым, иначе он круг;
     *   МАСКА в пикселе — осколок обязан иметь углы, иначе он тот же круг.
     * Одной пропорции мало (получается овал), одной маски мало (углы упираются
     * в квадратный квад и срезаются).
     */
    const shape = cfg.w;
    const isStreak = shape.greaterThan(float(0.5)).and(shape.lessThan(float(1.5)));
    const isShard = shape.greaterThan(float(1.5)).and(shape.lessThan(float(2.5)));
    const isSpark = shape.greaterThan(float(2.5));

    /* Штрих вытянут по экранной вертикали: частицы летят, и вертикальный
       штрих читается как след движения, а не как палка. */
    const aspect = vec2(
      isStreak.select(float(0.42), float(1)),
      isStreak.select(float(2.1), float(1)),
    );
    mat.vertexNode = cameraProjectionMatrix.mul(
      modelViewMatrix.mul(vec4(pos, 1)).add(vec4(positionLocal.xy.mul(size).mul(aspect), 0, 0)),
    );
    mat.colorNode = col;

    const q = uv().sub(vec2(0.5, 0.5));
    /* Круг — расстояние; осколок — ромб (сумма модулей); искра — тот же круг,
       но с резким ядром и почти без ореола. */
    const dRound = q.length().mul(2);
    const dDiamond = q.x.abs().add(q.y.abs()).mul(2);
    const d = isShard.select(dDiamond, dRound);
    const soft = float(1).sub(d).clamp(0, 1);
    const mask = isSpark.select(soft.pow(3.2), soft.pow(1.5));
    mat.opacityNode = mask
      .mul(float(1).sub(uc).pow(1.3))
      .mul(alive.select(float(1), float(0)));

    /* Частицы — это скиллы и импакты, то есть ровно то, чему §10.1 разрешает
       эмиссию. Пул целиком помечается светящимся один раз (D163). */
    markGlow(mat, blending === THREE.AdditiveBlending ? 1 : 0.5);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    scene.add(this.mesh);
  }

  /** Продвинуть общее время. Единственное, что делается на кадр. */
  update(now) { this.time.value = now; }

  /**
   * Выпустить пачку. Кольцевая переработка: самая старая частица уступает
   * место, и ничего не аллоцируется — в этом весь смысл пула.
   */
  emit(n, fn) {
    const { p0, v0, acc, col, cfg } = this.buf;
    const start = this.head;
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      /* Первым аргументом идёт НОМЕР В ПАЧКЕ (0..n-1), а не индекс в пуле.
         Вызывающему нужен именно он — разложить частицы по дуге, выбрать
         цвет, растянуть шлейф. Индекс в пуле — внутреннее дело кольца, и
         когда он торчал наружу, «частица номер i» оказывалась частицей
         номер 1380 и улетала за арену. */
      fn(k, {
        pos: (x, y, z) => { p0.array[i * 3] = x; p0.array[i * 3 + 1] = y; p0.array[i * 3 + 2] = z; },
        vel: (x, y, z) => { v0.array[i * 3] = x; v0.array[i * 3 + 1] = y; v0.array[i * 3 + 2] = z; },
        gravity: (x, y, z) => { acc.array[i * 3] = x; acc.array[i * 3 + 1] = y; acc.array[i * 3 + 2] = z; },
        color: (c) => { col.array[i * 3] = c.r; col.array[i * 3 + 1] = c.g; col.array[i * 3 + 2] = c.b; },
        /* Четвёртый аргумент — ФОРМА (см. раскладку `cfg` выше), не спин. */
        life: (born, secs, size, shape = 0) => {
          cfg.array[i * 4] = born; cfg.array[i * 4 + 1] = secs;
          cfg.array[i * 4 + 2] = size; cfg.array[i * 4 + 3] = shape;
        },
      });
    }
    /*
     * ЗАГРУЖАЕТСЯ ТОЛЬКО ТРОНУТЫЙ УЧАСТОК КОЛЬЦА.
     *
     * `needsUpdate` на весь атрибут заставляет WebGPU-бэкенд писать в буфер
     * ВЕСЬ массив: три тысячи инстансов × (3+3+3+3+4) float — это 192 КБ на
     * пул и 384 КБ на оба, на каждом кадре, где хоть что-то вылетело.
     * Замерено 7137 частиц за пятидесятисекундный бой, то есть эмиссия идёт
     * на заметной доле кадров.
     *
     * Запись в кольцо непрерывна, кроме одного случая — переход через конец,
     * — и тогда честнее обновить всё, чем городить два диапазона.
     */
    const wrapped = this.head < start;
    for (const a of [p0, v0, acc, col, cfg]) {
      a.needsUpdate = true;
      if (a.clearUpdateRanges) a.clearUpdateRanges();
      if (!wrapped && a.addUpdateRange) {
        a.addUpdateRange(start * a.itemSize, (this.head - start) * a.itemSize);
      }
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// силуэты доставок
// ───────────────────────────────────────────────────────────────────────────

const rnd = (a, b) => a + Math.random() * (b - a);

/** Разброс по конусу вокруг направления. */
function spread(dx, dz, angle) {
  const a = Math.atan2(dx, dz) + rnd(-angle, angle);
  return [Math.sin(a), Math.cos(a)];
}

/**
 * Слой эффектов: держит пул, знает палитры и рисует силуэт по доставке.
 *
 * ИНВАРИАНТ (§9): VFX никогда не влияет на симуляцию. Этот файл читает
 * `world.fx` и не пишет в него ни разу; прогон с отключённым рендером даёт
 * побитово тот же лог. Проверяемо и проверяется.
 */
export class Vfx {
  /**
   * ДВА пула, и это не роскошь, а следствие §10.1.
   *
   * Арена — белая платформа в мягкой тёмной пустоте. Аддитивный блендинг на
   * белом полу не добавляет ничего: белое плюс свет остаётся белым, и
   * половина эффектов, снятых над полом, оказалась невидимой при том, что
   * буферы были заполнены верно, а время шло. Проверено вживую.
   *
   * Поэтому:
   *   `body` — обычный блендинг, насыщенные цвета элемента. Он и есть
   *     эффект: его видно и на белом полу, и на тёмном фоне.
   *   `glow` — аддитивный, светлый край. Он добавляет свечение там, где
   *     фон тёмный, и честно ничего не делает там, где он белый.
   *
   * Эмиссия при этом по-прежнему только у скиллов, телеграфов и импактов —
   * тело не светится ни в одном из пулов.
   */
  constructor(scene, { spawnMesh } = {}) {
    this.scene = scene;
    this.body = new Particles(scene, { blending: THREE.NormalBlending });
    this.glow = new Particles(scene, { blending: THREE.AdditiveBlending });
    /* `add` — старое имя пула; оставлено как алиас на тело, чтобы вызовы
       читались одинаково: «выпустить искры», а не «выпустить в пул номер». */
    this.add = { emit: (n, fn) => { this.body.emit(n, fn); this.glow.emit(Math.ceil(n * 0.5), fn); } };
    this.spawnMesh = spawnMesh;
    this.now = 0;

    /*
     * ПУЛ ИСТОЧНИКОВ СВЕТА — ДВА, ЗАВЕДЁННЫХ СРАЗУ.
     *
     * `WebGPURenderer` пересобирает конвейер материалов, когда меняется ЧИСЛО
     * источников в сцене. Создавать `PointLight` на каждое попадание значит
     * пересобирать шейдеры посреди боя — это заметно кадром, а попаданий за
     * бой под сотню. `LIGHT_POOL` источников с нулевой яркостью стоят в сцене
     * всё время и переиспользуются по кругу.
     *
     * `distance` ограничивает радиус: свет удара не имеет права осветить всю
     * арену, он должен объяснить одну точку.
     *
     * ИХ ДВА, А НЕ ШЕСТЬ, И ЭТО ЗАМЕР. Три.js включает источник в шейдер
     * независимо от яркости, то есть погашенный стоит столько же, сколько
     * горящий. Замерено на двойнике арены (2880×1800, тени 2048): без пула
     * 1.78 мс на кадр, с шестью погашенными 2.88 мс — плюс 62% ПОСТОЯННО за
     * вспышку, которая живёт 0.22 с. Двух хватает: одновременных попаданий
     * бывает одно-два, а седьмой удар и при шести пришёлся бы на занятый
     * источник.
     */
    this.lights = [];
    this.lightHead = 0;
    for (let i = 0; i < LIGHT_POOL; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 9, 2);
      l.userData.until = 0; l.userData.peak = 0;
      scene.add(l);
      this.lights.push(l);
    }
  }

  update(now) {
    this.now = now;
    /* Общие часы узловых материалов (труба луча, плита зоны) — те же, по
       которым живут частицы, чтобы рябь и искры шли в одном времени. */
    TIME.value = now;
    this.body.update(now);
    this.glow.update(now);
    this.tickLights();
  }

  /** Одна запись из `world.fx`. Возвращает true, если нарисовала. */
  play(e, ctx) {
    const P = palette(e.element);
    switch (e.kind) {
      case 'beam': return this.beam(e, P, ctx);
      case 'cone': return this.cone(e, P, ctx);
      case 'bolt':
      case 'lob': return this.bolt(e, P, ctx);
      case 'zone': return this.zone(e, P, ctx);
      case 'dash': return this.dash(e, P, ctx);
      case 'blink': return this.blink(e, P, ctx);
      case 'self': return this.shell(e, P, ctx);
      case 'jump': return this.hop(e, P, ctx);
      case 'wall': return this.wall(e, P, ctx);
      case 'impact': return this.impact(e, P, ctx);
      case 'status': return this.status(e, P, ctx);
      default: return false;
    }
  }

  // ── луч: цилиндр + искры вдоль ствола ────────────────────────────────
  beam(e, P, ctx) {
    const a = new THREE.Vector3(e.x0, 1.15, e.z0);
    const b = new THREE.Vector3(e.x1, 1.15, e.z1);
    const len = a.distanceTo(b);
    if (len < 0.05) return false;
    /*
     * Толщина ствола — не вкус, а читаемость на дистанции боя.
     *
     * 0.1 м на двадцати метрах — это меньше пикселя, и луч, снятый со стенда,
     * читался как царапина на полу. Арена белая (§10.1), аддитивное свечение
     * на белом не добавляет ничего, поэтому видимость даёт ТОЛЩИНА, а не
     * яркость. 0.16 — всё ещё тонкая линия вблизи и уже линия издали.
     */
    /*
     * Труба, а не два цилиндра. Слоистость (яркое ядро → мягкий край) считается
     * в пикселе по расстоянию до оси, поэтому поперёк ствола настоящий
     * градиент, а не две ступеньки; рябь бежит вдоль ствола к цели.
     * Сегментов по окружности 14, а не 8: на восьми грань ствола видно как
     * грань, и «луч» читается как гранёная палка.
     */
    /*
     * ── МОЛНИЯ У ЭЛЕМЕНТА `arc`, ПРЯМОЙ СТВОЛ У ОСТАЛЬНЫХ ──────────────────
     *
     * Приём из референса основателя (Storm Lance): труба ведётся не по
     * отрезку, а по ЛОМАНОЙ, отклонения которой берутся у шумовой функции.
     * Силуэт §9.2 при этом не нарушен — «цилиндр от кастера к точке
     * попадания» остаётся цилиндром, он просто перестаёт быть прямым.
     *
     * Зачем именно `arc`. Элемент — единственная ось грамматики, которая
     * существует РАДИ ВИДА (§8), и до этого она различалась только палитрой.
     * Палитра на белом полу и под свечением сближается; форма — нет. Молния
     * читается молнией с любого ракурса и на любой яркости.
     *
     * Отклонения ДЕТЕРМИНИРОВАНЫ: `noise` от координат выстрела, а не
     * `Math.random`. Повтор боя обязан выглядеть так же (A2), и «ломаная
     * каждый раз новая» сделала бы два просмотра одного боя разными.
     */
    const kinked = e.element === 'arc';
    let core;
    let glow;
    if (kinked) {
      const seed = Math.abs(e.x0 * 7.3 + e.z0 * 3.1 + len * 11.7);
      const wob = (i, n) => {
        const t = i / n;
        /* Ноль на концах: молния выходит из ствола и приходит в цель, а не
           мимо. Иначе телеграф и попадание расходятся с картинкой. */
        const amp = Math.sin(t * Math.PI) * Math.min(1.1, len * 0.09);
        const f = Math.sin(seed + i * 2.399) * 0.6 + Math.sin(seed * 1.7 + i * 5.13) * 0.4;
        return f * amp;
      };
      const side = new THREE.Vector3().subVectors(b, a).normalize().cross(new THREE.Vector3(0, 1, 0)).normalize();
      const SEGS = 14;
      const pts = [];
      for (let i = 0; i <= SEGS; i++) {
        const t = i / SEGS;
        const p = a.clone().lerp(b, t);
        p.addScaledVector(side, wob(i, SEGS));
        p.y += wob(i + 31, SEGS) * 0.55;
        pts.push(p);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      core = new THREE.Mesh(new THREE.TubeGeometry(curve, SEGS * 2, 0.24, 8, false), tubeMat(P));
      glow = new THREE.Mesh(new THREE.TubeGeometry(curve, SEGS, 0.6, 6, false), basic(P[2], 0.22));
      core.add(glow);
    } else {
      const g = new THREE.CylinderGeometry(0.34, 0.34, len, 14, 1, true);
      g.translate(0, len / 2, 0);
      core = new THREE.Mesh(g, tubeMat(P));
      core.position.copy(a);
      core.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      /* Внешняя оболочка: она даёт лучу объём на расстоянии, где ядро уже
         в один пиксель. */
      const glowG = new THREE.CylinderGeometry(0.62, 0.62, len, 10, 1, true);
      glowG.translate(0, len / 2, 0);
      glow = new THREE.Mesh(glowG, basic(P[2], 0.22));
      core.add(glow);
    }
    this.spawnMesh(core, 0.3, (o, u) => {
      setFade(o, 1 - u);
      glow.material.opacity = 0.18 * (1 - u) ** 2;
      /* Прямой ствол ужимается поперёк — так гаснет луч. Ломаную ужимать
         нельзя: масштаб по локальным осям увёл бы молнию с линии выстрела. */
      if (!kinked) o.scale.set(1 - u * 0.6, 1, 1 - u * 0.6);
    });
    /* Искры по стволу — то, что отличает выстрел от нарисованной палки. */
    /* Искры по стволу — то, что отличает выстрел от нарисованной палки.
       Разложены РАВНОМЕРНО по длине, а не случайно: случайная россыпь на
       двадцати четырёх метрах оставляет проплешины, и луч читается рваным. */
    const dir = b.clone().sub(a).normalize();
    const n = 34;
    this.add.emit(n, (i, s) => {
      const f = (i + rnd(-0.4, 0.4)) / n;
      s.pos(a.x + dir.x * len * f, 1.15 + rnd(-0.14, 0.14), a.z + dir.z * len * f);
      s.vel(rnd(-1.1, 1.1), rnd(0.6, 2.4), rnd(-1.1, 1.1));
      s.gravity(0, -3.4, 0);
      s.color(P[i % 2]);
      s.life(this.now, rnd(0.25, 0.5), rnd(0.22, 0.46));
    });
    if (e.hit) this.burst(e.x1, 1.1, e.z1, P, 26);
    return true;
  }

  // ── конус: клин из частиц, а не полигон ──────────────────────────────
  cone(e, P, ctx) {
    /* Шире и крупнее, чем было (46 частиц по 0.34–0.72): конус — удар в упор,
       и на стенде он читался облачком пыли, а не ударом. */
    const n = 64;
    this.add.emit(n, (i, s) => {
      const [ux, uz] = spread(Math.sin(e.h), Math.cos(e.h), e.halfAngle);
      const d = rnd(0.4, e.range);
      s.pos(e.x, rnd(0.5, 1.4), e.z);
      s.vel(ux * d * 2.6, rnd(0.2, 0.9), uz * d * 2.6);
      s.gravity(0, -3.2, 0);
      s.color(hue(P, i));
      s.life(this.now, rnd(0.26, 0.52), rnd(0.5, 1.0));
    });
    return true;
  }

  // ── снаряд: летящий спрайт со шлейфом ────────────────────────────────
  bolt(e, P, ctx) {
    const [ux, uz] = [Math.sin(e.h), Math.cos(e.h)];
    const secs = Math.min(e.range / (e.speed || 20), 1.6);
    const arc = e.kind === 'lob';
    /* Голова снаряда: одна крупная частица, летящая ровно так же, как летит
       сам снаряд в симуляции, — иначе попадание случается не там, где видно. */
    this.add.emit(1, (i, s) => {
      s.pos(e.x + ux * 0.7, arc ? 1.5 : 1.1, e.z + uz * 0.7);
      s.vel(ux * e.speed, arc ? 5.2 : 0, uz * e.speed);
      s.gravity(0, arc ? -7.5 : 0, 0);
      s.color(P[0]);
      s.life(this.now, secs, 1.15);
    });
    /* Шлейф — частицы, выпущенные вперёд с той же скоростью и меньшей жизнью:
       он тянется за головой сам, без хранения истории. */
    this.add.emit(22, (i, s) => {
      const f = i / 16;
      s.pos(e.x + ux * 0.7, arc ? 1.5 : 1.1, e.z + uz * 0.7);
      s.vel(ux * e.speed * (1 - f * 0.12) + rnd(-0.5, 0.5), (arc ? 5.2 : 0) + rnd(-0.3, 0.3), uz * e.speed * (1 - f * 0.12) + rnd(-0.5, 0.5));
      s.gravity(0, arc ? -7.5 : -0.6, 0);
      s.color(P[1 + (i % 2)]);
      s.life(this.now, secs * rnd(0.5, 0.95), rnd(0.30, 0.62));
    });
    return true;
  }

  // ── зона: диск на полу + столб искр ──────────────────────────────────
  zone(e, P, ctx) {
    /*
     * Одна плита вместо кольца и заливки. Кольцо, заливка и ТРЕЩИНЫ считаются
     * в пикселе (`zoneMat`), поэтому зона перестала быть ровным диском —
     * самой долгой и самой неподвижной фигурой на экране.
     */
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(e.r * 2, e.r * 2),
      zoneMat(P[1], P[2]),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(e.x, 0.03, e.z);
    const life = e.duration || 3;
    this.spawnMesh(ring, life, (o, u) => {
      /* Гаснет в конце, а не всю жизнь: зона опасна, пока стоит. */
      setFade(o, u > 0.82 ? (1 - u) / 0.18 : 1);
    });
    /* Зона живёт секундами, и один залп искр на всю её жизнь читается как
       «мигнуло и погасло». Поэтому искры сыплются пачками по ходу. */
    for (let k = 0; k < Math.ceil(life * 4); k++) {
      const at = this.now + k * 0.25;
      this.add.emit(10, (i, s) => {
        const a = Math.random() * 7, rr = Math.sqrt(Math.random()) * e.r;
        s.pos(e.x + Math.sin(a) * rr, 0.05, e.z + Math.cos(a) * rr);
        s.vel(rnd(-0.2, 0.2), rnd(0.8, 2.1), rnd(-0.2, 0.2));
        s.gravity(0, -1.4, 0);
        s.color(hue(P, i));
        s.life(at, rnd(0.4, 0.9), rnd(0.28, 0.58));
      });
    }
    return true;
  }

  // ── рывок: лента вдоль пути ──────────────────────────────────────────
  dash(e, P, ctx) {
    const a = new THREE.Vector3(e.x0, 0.9, e.z0);
    const b = new THREE.Vector3(e.x1, 0.9, e.z1);
    const len = a.distanceTo(b);
    if (len > 0.2) {
      const g = new THREE.PlaneGeometry(len, 1.5);
      const ribbon = new THREE.Mesh(g, basic(P[1], 0.4));
      ribbon.position.copy(a).lerp(b, 0.5);
      ribbon.lookAt(ribbon.position.clone().add(new THREE.Vector3(0, 1, 0)));
      ribbon.rotation.z = Math.atan2(b.x - a.x, b.z - a.z);
      ribbon.rotation.x = -Math.PI / 2;
      this.spawnMesh(ribbon, 0.3, (o, u) => { o.material.opacity = 0.4 * (1 - u) ** 1.5; });
    }
    this.add.emit(42, (i, s) => {
      const f = Math.random();
      s.pos(a.x + (b.x - a.x) * f, rnd(0.2, 1.5), a.z + (b.z - a.z) * f);
      s.vel(rnd(-1.2, 1.2), rnd(0.3, 1.4), rnd(-1.2, 1.2));
      s.gravity(0, -2.6, 0);
      s.color(hue(P, i));
      s.life(this.now, rnd(0.25, 0.55), rnd(0.28, 0.58));
    });
    if (e.hit) this.burst(e.x1, 1.1, e.z1, P, 22);
    return true;
  }

  // ── мигание: два кольца, откуда и куда ───────────────────────────────
  blink(e, P, ctx) {
    for (const [x, z, grow] of [[e.x0, e.z0, 1], [e.x1, e.z1, -1]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.42, 32), basic(P[0], 0.9));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.06, z);
      this.spawnMesh(ring, 0.4, (o, u) => {
        const k = grow > 0 ? 1 + u * 2.6 : 3.6 - u * 2.6;
        o.scale.setScalar(k);
        o.material.opacity = 0.9 * (1 - u);
      });
    }
    this.add.emit(30, (i, s) => {
      const at = i < 12 ? [e.x0, e.z0] : [e.x1, e.z1];
      const a = Math.random() * 7;
      s.pos(at[0] + Math.sin(a) * 0.4, rnd(0.2, 1.6), at[1] + Math.cos(a) * 0.4);
      s.vel(Math.sin(a) * 2.2, rnd(0.6, 1.8), Math.cos(a) * 2.2);
      s.gravity(0, -3, 0);
      s.color(hue(P, i));
      s.life(this.now, rnd(0.25, 0.5), rnd(0.24, 0.52));
    });
    return true;
  }

  // ── self: оболочка по силуэту тела ───────────────────────────────────
  shell(e, P, ctx) {
    const sph = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 12), basic(P[1], 0.3));
    sph.position.set(e.x, 1.0, e.z);
    this.spawnMesh(sph, 0.6, (o, u) => {
      o.scale.setScalar(0.7 + u * 0.8);
      o.material.opacity = 0.3 * (1 - u) ** 1.3;
    });
    this.add.emit(26, (i, s) => {
      const a = Math.random() * 7;
      s.pos(e.x + Math.sin(a) * 1.1, rnd(0.1, 0.4), e.z + Math.cos(a) * 1.1);
      s.vel(Math.sin(a) * 0.3, rnd(1.4, 2.8), Math.cos(a) * 0.3);
      s.gravity(0, -1.2, 0);
      s.color(hue(P, i));
      s.life(this.now, rnd(0.4, 0.8), rnd(0.26, 0.52));
    });
    return true;
  }

  /*
   * ── прыжок: отрыв и тень ────────────────────────────────────────────
   *
   * Силуэт из реестра — «дуга прыжка и круг тени под телом», и дугу рисует
   * САМО ТЕЛО: `me.y` уже ведёт его по параболе, дублировать её лентой значило
   * бы нарисовать вторую траекторию рядом с настоящей.
   *
   * Значит на VFX остаются две вещи, которых у тела нет:
   *
   *   ОТРЫВ — кольцо пыли из-под ног. Оно объясняет, почему боец вдруг поехал
   *     вверх, и ставится в момент, когда это ещё можно прочитать.
   *   ТЕНЬ — тёмный круг на полу, который СЖИМАЕТСЯ на подъёме и разрастается
   *     на спуске. Это единственный способ понять высоту в изометрии: без
   *     тени прыжок и шаг к камере на экране неразличимы, а от прыжка теперь
   *     зависит, пройдёт ли под бойцом конус (D160).
   *
   * Тень рисуется НЕ палитрой элемента. Она не эффект, а показание высоты, и
   * покрасить её в цвет умения значило бы, что «ледяной прыжок» отбрасывает
   * голубую тень, а «пустотный» — фиолетовую. Тень чёрная у всех, как и на
   * настоящем полу.
   */
  hop(e, P, ctx) {
    const dur = e.duration || 0.55;
    const h = e.height || 1.5;

    /* Кольцо отрыва: расходится по полу и гаснет за треть воздушной фазы. */
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.85, 28),
      basic(P[1], 0.5),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(e.x, 0.03, e.z);
    this.spawnMesh(ring, Math.max(0.35, dur * 0.6), (o, u) => {
      o.scale.setScalar(1 + u * 2.4);
      o.material.opacity = 0.5 * (1 - u) ** 1.4;
    });

    /*
     * Тень. Радиус ведётся по ТОЙ ЖЕ параболе, что и тело
     * (`4·h·u·(1−u)` в sim.js), поэтому круг сжимается ровно в верхней точке
     * дуги, а не в середине по времени показа.
     *
     * И она ЕДЕТ ЗА ТЕЛОМ, а не стоит в точке отрыва. Горизонтальная скорость
     * в прыжке заморожена, а не обнулена (`sim.js`, и это же обещано модели в
     * промпте), поэтому за 0.55 с тело уносит на 2.3–2.9 м — больше двух
     * своих радиусов. Тень, оставшаяся на старте, показывала бы высоту НЕ
     * ТОГО места, а именно ради чтения высоты она и нарисована.
     *
     * Позиция тела берётся из `ctx.bodyPos` — того же моста, которым
     * пользуются импакт и статус. Если моста нет (стенд VFX), тень остаётся
     * в точке отрыва: там тело и не движется.
     */
    const follow = ctx && ctx.bodyPos ? () => ctx.bodyPos(e.who) : null;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      shadowMat(),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(e.x, 0.02, e.z);
    this.spawnMesh(shadow, dur, (o, u) => {
      const y = 4 * h * u * (1 - u);           // высота тела в эту долю фазы
      const k = 1 / (1 + y * 0.55);            // выше — меньше и бледнее
      o.scale.setScalar(0.55 + k * 0.55);
      o.material.opacity = 0.34 * k;
      const at = follow && follow();
      if (at) { o.position.x = at.x; o.position.z = at.z; }
    });

    /* Пыль из-под ног: вниз и в стороны, а не вверх — толчок идёт в пол. */
    this.add.emit(22, (i, s) => {
      const a = (i / 22) * Math.PI * 2;
      s.pos(e.x + Math.sin(a) * 0.5, rnd(0.05, 0.25), e.z + Math.cos(a) * 0.5);
      s.vel(Math.sin(a) * rnd(1.8, 3.4), rnd(0.2, 1.1), Math.cos(a) * rnd(1.8, 3.4));
      s.gravity(0, -3.2, 0);
      s.color(hue(P, i));
      s.life(this.now, rnd(0.3, 0.6), rnd(0.18, 0.4));
    });
    return true;
  }

  // ── стена: плита, вырастающая из пола ────────────────────────────────
  wall(e, P, ctx) {
    /*
     * Размеры — ПОЛНЫЕ, и умножать их на два нельзя.
     *
     * Событие несёт ширину и глубину стены целиком; арена хранит коробку в
     * полуразмерах (`hx`/`hz`) и получает их делением. Рисовать `e.w * 2`
     * значило рисовать стену вдвое шире той, обо что бьются тела: игрок
     * видел укрытие там, где его нет, и это худший вид расхождения картинки
     * с миром — он учит неправильному.
     */
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(e.w, 2.2, e.d),
      basic(P[1], 0.34),
    );
    box.position.set(e.x, 1.1, e.z);
    /* Живёт ровно столько, сколько живёт настоящая стена. */
    this.spawnMesh(box, e.duration || 5, (o, u) => {
      const rise = Math.min(1, u * 12);
      o.scale.set(1, rise, 1);
      o.position.y = 1.1 * rise;
      o.material.opacity = 0.34 * (u > 0.85 ? (1 - u) / 0.15 : 1);
    });
    return true;
  }

  // ── импакт: вспышка в точке попадания ────────────────────────────────
  /**
   * Попадание. Третья нога §9.2: доставка владеет силуэтом, элемент —
   * палитрой, ЭФФЕКТ — ударом.
   *
   * Раньше здесь была одна вспышка на все четырнадцать атомов, и это делало
   * половину грамматики невидимой: оглушение выглядело как урон, а
   * обездвиживание — как оглушение. При этом подписи были УЖЕ НАПИСАНЫ — в
   * `src/skills/registry.js` у каждого атома есть поле `vfx` со словесным
   * описанием его удара («волна от точки удара», «скобы у ног цели»,
   * «кольцо над головой цели»). Здесь они просто нарисованы.
   *
   * Атомы рисуются ВСЕ, а не только первый: умение на два эффекта бьёт
   * дважды, и по экрану это должно быть видно так же, как по цифрам.
   */
  impact(e, P, ctx) {
    /*
     * СЛЕД НА ПОЛУ И ВСПЫШКА СВЕТА (D163).
     *
     * До этого попадание не оставляло на арене ничего: частицы улетали за
     * полсекунды, и через секунду по кадру нельзя было сказать, был здесь бой
     * или нет. Декали существовали только в слое модели (VFX-IR), то есть у
     * существа без сгенерированной декорации — и у всех четырёх
     * захардкоженных умений — пол оставался чистым.
     *
     * Свет — вторая половина того же: сцена освещена тремя статичными
     * источниками, и удар её не трогал вовсе. Короткая вспышка в точке
     * попадания делает то, чего не может сделать ни один аддитивный спрайт, —
     * подсвечивает ТЕЛА и пол вокруг.
     */
    if (!e.blocked) {
      this.scorch(e.x, e.z, P, 0.9);
      this.flashLight(e.x, 1.1, e.z, P[1], 9, 0.22);
    }
    /*
     * Заблокированный выстрел рисуется ОДНИМ знаком отражения.
     *
     * Он несёт тот же список атомов, что и попавший, — иначе снаряд не знал
     * бы, что в нём было, — но рисовать по нему кольцо оглушения и скобы
     * обездвиживания значит показать игроку эффекты, которых не случилось.
     * Укрытие сработало, и единственное, что произошло, — это оно.
     */
    if (e.blocked) {
      this.burst(e.x, 1.05, e.z, P, 10);
      return true;
    }
    const list = Array.isArray(e.effects) && e.effects.length ? e.effects : ['damage'];
    const at = ctx && ctx.bodyPos ? ctx.bodyPos(e.who === 'blue' ? 'orange' : 'blue') : null;
    const x = e.x; const z = e.z;
    let drew = false;
    for (const id of list) drew = this.atomImpact(id, x, z, P, e, at) || drew;
    /* Ни один атом не нарисовался — значит атом новый, а подписи для него
       ещё нет. Общая вспышка лучше пустоты: попадание обязано быть видно. */
    if (!drew) this.burst(x, 1.05, z, P, e.blocked ? 12 : 24);
    return true;
  }

  /** Один атом — одна подпись. Возвращает false, если подписи нет. */
  atomImpact(id, x, z, P, e, at) {
    const n = e.blocked ? 8 : 18;
    switch (id) {
      case 'damage':
        this.burst(x, 1.05, z, P, e.blocked ? 12 : 24);
        return true;

      case 'burn':
        /* Тлеющий шлейф: угли всплывают и держатся дольше вспышки. */
        this.add.emit(n, (i, s) => {
          s.pos(x + rnd(-0.5, 0.5), rnd(0.4, 1.5), z + rnd(-0.5, 0.5));
          s.vel(rnd(-0.5, 0.5), rnd(1.1, 2.6), rnd(-0.5, 0.5));
          s.gravity(0, 0.6, 0);
          s.color(P[1 + (i % 2)]);
          s.life(this.now, rnd(0.6, 1.1), rnd(0.16, 0.36));
        });
        return true;

      case 'knock': {
        /* Волна от точки удара: плоское кольцо по полу, быстрое и широкое. */
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 28), basic(P[1], 0.75));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.06, z);
        this.spawnMesh(ring, 0.4, (o, u) => {
          o.scale.setScalar(1 + u * 7);
          o.material.opacity = 0.75 * (1 - u) ** 1.4;
        });
        return true;
      }

      case 'pull':
        /* Сходящиеся линии: частицы летят К точке, а не от неё. */
        this.add.emit(n + 8, (i, s) => {
          const a = (i / (n + 8)) * Math.PI * 2;
          const r = rnd(3.2, 5.4);
          s.pos(x + Math.sin(a) * r, rnd(0.5, 1.6), z + Math.cos(a) * r);
          s.vel(-Math.sin(a) * r * 2.6, 0, -Math.cos(a) * r * 2.6);
          s.gravity(0, 0, 0);
          s.color(hue(P, i));
          s.life(this.now, 0.38, rnd(0.2, 0.4));
        });
        return true;

      case 'stun': {
        /* Кольцо над головой — там, где его ищут глазами. */
        const y = (at ? 0 : 0) + 2.35;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 8, 22), basic(P[0], 0.9));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, y, z);
        this.spawnMesh(ring, 0.75, (o, u) => {
          o.rotation.z = u * 6.5;
          o.position.y = y + Math.sin(u * Math.PI) * 0.16;
          o.material.opacity = 0.9 * (1 - u) ** 0.7;
        });
        return true;
      }

      case 'root':
        /* Скобы у ног: короткие штыри, вбитые вниз по кругу. */
        this.add.emit(10, (i, s) => {
          const a = (i / 10) * Math.PI * 2;
          s.pos(x + Math.sin(a) * 0.85, rnd(1.0, 1.7), z + Math.cos(a) * 0.85);
          s.vel(0, -4.2, 0);
          s.gravity(0, -3, 0);
          s.color(P[2]);
          s.life(this.now, 0.5, rnd(0.3, 0.5));
        });
        return true;

      case 'blind':
        /* Помеха на силуэте: плотная рябь у головы цели. */
        this.add.emit(24, (i, s) => {
          s.pos(x + rnd(-0.7, 0.7), rnd(1.5, 2.4), z + rnd(-0.7, 0.7));
          s.vel(rnd(-1.6, 1.6), rnd(-0.4, 0.4), rnd(-1.6, 1.6));
          s.gravity(0, 0, 0);
          s.color(hue(P, i));
          s.life(this.now, rnd(0.5, 0.9), rnd(0.12, 0.26));
        });
        return true;

      case 'silence': {
        /* Перечёркнутый знак каста: короткая горизонтальная планка. */
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), basic(P[0], 0.95));
        bar.position.set(x, 2.15, z);
        bar.rotation.z = 0.42;
        this.spawnMesh(bar, 0.45, (o, u) => {
          o.scale.x = 0.3 + u * 1.4;
          o.material.opacity = 0.95 * (1 - u) ** 1.3;
        });
        return true;
      }

      case 'shield': {
        /* Оболочка по силуэту тела. */
        const sh = new THREE.Mesh(new THREE.SphereGeometry(1.35, 18, 12), basic(P[1], 0.28));
        sh.position.set(x, 1.15, z);
        this.spawnMesh(sh, 0.5, (o, u) => {
          o.scale.setScalar(0.7 + u * 0.5);
          o.material.opacity = 0.28 * (1 - u);
        });
        return true;
      }

      case 'heal':
        /* Восходящие искры. */
        this.add.emit(n, (i, s) => {
          const a = Math.random() * 7;
          s.pos(x + Math.sin(a) * 0.7, rnd(0.2, 0.9), z + Math.cos(a) * 0.7);
          s.vel(rnd(-0.3, 0.3), rnd(2.0, 3.6), rnd(-0.3, 0.3));
          s.gravity(0, 0.5, 0);
          s.color(P[i % 2]);
          s.life(this.now, rnd(0.5, 0.85), rnd(0.2, 0.42));
        });
        return true;

      case 'cleanse': {
        /* Сброшенная оболочка: она расходится и гаснет. */
        const sh = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 10), basic(P[0], 0.5));
        sh.position.set(x, 1.15, z);
        this.spawnMesh(sh, 0.42, (o, u) => {
          o.scale.setScalar(1 + u * 1.5);
          o.material.opacity = 0.5 * (1 - u) ** 1.8;
        });
        return true;
      }

      case 'boost':
      case 'weaken': {
        /* Подсветка по каналу: шевроны вверх для усиления, вниз для
           ослабления. Направление и есть всё сообщение. */
        const up = id === 'boost' ? 1 : -1;
        this.add.emit(12, (i, s) => {
          const a = (i / 12) * Math.PI * 2;
          s.pos(x + Math.sin(a) * 0.8, up > 0 ? rnd(0.2, 0.6) : rnd(1.9, 2.4), z + Math.cos(a) * 0.8);
          s.vel(0, up * rnd(2.2, 3.4), 0);
          s.gravity(0, 0, 0);
          s.color(P[up > 0 ? 0 : 2]);
          s.life(this.now, 0.5, rnd(0.18, 0.34));
        });
        return true;
      }

      /* Стена рисуется своей формой при постановке — здесь ей делать нечего. */
      case 'wall': return true;
      default: return false;
    }
  }

  /** Статус на теле: короткая метка нужного цвета. */
  status(e, P, ctx) {
    const at = ctx && ctx.bodyPos ? ctx.bodyPos(e.who) : null;
    if (!at) return false;
    this.add.emit(20, (i, s) => {
      const a = Math.random() * 7;
      s.pos(at.x + Math.sin(a) * 0.6, rnd(0.3, 1.8), at.z + Math.cos(a) * 0.6);
      s.vel(rnd(-0.4, 0.4), e.effect === 'heal' ? rnd(1.2, 2.4) : rnd(-0.3, 0.9), rnd(-0.4, 0.4));
      s.gravity(0, e.effect === 'heal' ? 0.4 : -1.8, 0);
      s.color(hue(P, i));
      s.life(this.now, rnd(0.35, 0.7), rnd(0.24, 0.50));
    });
    return true;
  }

  /** Общая вспышка: конус искр наружу плюс кольцо. */
  /**
   * Ожог на полу. Живёт полторы секунды и гаснет.
   *
   * Долго держать нельзя: за пятидесятисекундный бой ударов бывает под сотню,
   * и пол превратился бы в ковёр. Полторы секунды — это ровно столько, чтобы
   * увидеть «сюда только что попали», и мало, чтобы накопиться.
   */
  scorch(x, z, P, size = 1) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size * 2.6, size * 2.6), scorchMat(P[2]));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.012, z);
    m.rotation.z = Math.random() * Math.PI;
    this.spawnMesh(m, 1.5, (o, u) => {
      o.scale.setScalar(0.7 + u * 0.5);
      setFade(o, u < 0.15 ? u / 0.15 : (1 - (u - 0.15) / 0.85) ** 1.6);
    });
  }

  /**
   * Короткая вспышка настоящего света.
   *
   * Пул на `LIGHT_POOL` источников: WebGPU перестраивает конвейер материалов
   * при изменении ЧИСЛА источников в сцене, и создавать `PointLight` на
   * каждый удар значит пересобирать шейдеры посреди боя. Они заведены сразу,
   * гаснут в ноль и переиспользуются по кругу. Сколько именно и почему —
   * в конструкторе `Vfx`, там же замер.
   */
  flashLight(x, y, z, color, intensity, secs) {
    if (!this.lights) return;
    const l = this.lights[this.lightHead % this.lights.length];
    this.lightHead++;
    l.color.set(color);
    l.position.set(x, y, z);
    l.intensity = intensity;
    l.userData.born = this.now;
    l.userData.secs = secs;
    l.userData.peak = intensity;
  }

  /** Погасить отработавшие вспышки. Зовётся из `update`, один проход на кадр. */
  tickLights() {
    if (!this.lights) return;
    for (const l of this.lights) {
      const u = l.userData;
      if (!u.secs || l.intensity <= 0) continue;
      const k = (this.now - u.born) / u.secs;
      /* Квадратичное затухание: линейное читается как выключатель, а удар —
         это вспышка, у которой есть хвост. */
      l.intensity = k >= 1 ? 0 : u.peak * (1 - k) ** 2;
      if (k >= 1) u.secs = 0;
    }
  }

  burst(x, y, z, P, n) {
    this.add.emit(n, (i, s) => {
      const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3);
      const speed = rnd(4, 11);
      s.pos(x, y, z);
      s.vel(Math.sin(a) * speed, rnd(2, 7), Math.cos(a) * speed);
      s.gravity(0, -14, 0);
      s.color(hue(P, i));
      s.life(this.now, rnd(0.22, 0.5), rnd(0.30, 0.66));
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.34, 24), basic(P[0], 0.8));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.08, z);
    this.spawnMesh(ring, 0.28, (o, u) => {
      o.scale.setScalar(1 + u * 3.4);
      o.material.opacity = 0.8 * (1 - u) ** 1.6;
    });
  }
}

/**
 * Обычный материал эффекта — и он СВЕТИТСЯ.
 *
 * Все меши этого файла — силуэты доставок и импактов, то есть ровно то, чему
 * §10.1 разрешает эмиссию. Метка ставится в одном месте, а не в семнадцати
 * конструкторах: пропущенная метка выглядит как «этот эффект тусклее
 * остальных», и искать её пришлось бы глазами.
 */
function basic(color, opacity, glow = 1) {
  const M = THREE.MeshBasicNodeMaterial || THREE.MeshBasicMaterial;
  return markGlow(new M({
    color, transparent: true, opacity,
    side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), glow);
}
