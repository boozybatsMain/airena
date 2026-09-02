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

/** Включает пометку. Зовёт `main.js` — ровно тогда, когда пост-граф собран. */
export function setGlowEnabled(on) { glowOn = !!on; }
export function glowEnabled() { return glowOn; }

/**
 * `amount` — число ИЛИ узел-маска. Материал, помеченный целиком, светится
 * целиком, и на белом полу это стирает палитру в белый (замер на стенде /ice).
 * Маска отдаёт в свечение кант и трещину, а тело оставляет цвету.
 */
export function markGlow(material, amount = 1) {
  if (!glowOn) return material;
  const node = typeof amount === 'number' ? TSL.float(amount) : amount;
  try { material.mrtNode = TSL.mrt({ bloomIntensity: node }); } catch { /* без MRT */ }
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
    material.mrtNode = TSL.mrt({
      bloomIntensity: glowNode,
      distort: TSL.vec3(offsetNode.x, offsetNode.y, strengthNode),
    });
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

/** `THREE.Color` → узел vec3. */
export const col = (c) => TSL.vec3(c.r, c.g, c.b);
