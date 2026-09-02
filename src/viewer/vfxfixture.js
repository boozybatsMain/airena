/**
 * СТОЙКА ДЛЯ ПОКАЗА ЭФФЕКТОВ: где стоят бойцы, откуда смотрят четыре глаза и
 * какая запись `world.fx` соответствует каждой доставке. Один источник и для
 * прогона снимков (`tools/vfxshot.mjs`, `tools/vfxclip.mjs` через
 * `tools/vfxchrome.mjs`), и для стенда руками (`vfxstand.js`): то, что
 * основатель нажимает кнопкой, обязано быть тем же кастом, что снимают судьи,
 * иначе спор «у меня было не так» не разрешить.
 *
 * Файл чистый (без three и DOM): его импортирует и браузер, и node.
 */

/* Бойцы стоят так, чтобы каст шёл слева направо в кадре трансляции, и в
   стороне от блоков `a` (−7,−3) и `b` (7,3): с трансляционного глаза
   (+x,+z) тело у блока `b` пряталось за ним целиком. */
export const BLUE = { x: -3.5, z: -1.5, h: Math.PI * 0.32 };
export const ORANGE = { x: 3.0, z: 5.0, h: Math.PI * 1.32 };

/* Четыре глаза. `broadcast` — дистанция и высота решателя боя (13–34 м,
   высота 2.8 + 0.42·dist), чтобы «огромный» мерилось там, где смотрят. */
export const CAMS = {
  broadcast: { az: Math.PI * 0.25, pitch: 0.46, dist: 26, look: { x: 0, y: 1.2, z: 1.6 } },
  /* Тот же глаз решателя, но ПОПЕРЁК каста: с `broadcast` луч от синего к
     оранжевому идёт почти вдоль взгляда и схлопывается в столбик — судить по
     нему форму пучка нельзя (замер турнира молнии 02.09). */
  side: { az: -Math.PI * 0.25, pitch: 0.46, dist: 26, look: { x: 0, y: 1.2, z: 1.6 } },
  low: { az: Math.PI * 0.62, pitch: 0.2, dist: 15, look: { x: 0, y: 1.4, z: 1.6 } },
  top: { az: Math.PI * 0.1, pitch: 1.15, dist: 22, look: { x: 0, y: 0.6, z: 1.6 } },
};

/** Подписи глаз для стенда. */
export const CAM_LABELS = {
  broadcast: ['Broadcast', '26 m, along the cast — the viewer\'s eye'],
  side: ['Side', '26 m, across the cast — shape'],
  low: ['Low', '15 m, floor level'],
  top: ['Top', '22 m, from above — residue'],
};

/*
 * Формы доставок в порядке грамматики каста (docs/VFX.md §4). Первые восемь
 * — те, для которых у элементных модулей есть своё тело (`cone zone self beam
 * bolt lob impact charge`); остальные пять сим тоже кладёт в `world.fx`
 * (`src/core/deliver.js`, `effects.js`), но рисуются только штатным силуэтом
 * `vfx.js`. `sim` — кладёт ли эту запись симуляция (заряд — запись только
 * вьювера из телеграфа).
 */
export const FORMS = [
  { kind: 'beam', ru: 'луч', what: 'Instant line from the caster to the target; hit or miss.' },
  { kind: 'cone', ru: 'конус', what: 'Sector in front of the caster: range × half-angle.' },
  { kind: 'zone', ru: 'зона', what: 'Disc on a point that works for several seconds.' },
  { kind: 'self', ru: 'щит', what: 'Shell on the caster\'s own body.' },
  { kind: 'bolt', ru: 'болт', what: 'Straight projectile; cover stops it.' },
  { kind: 'lob', ru: 'навес', what: 'Arcing projectile over cover; lands on a point.' },
  { kind: 'impact', ru: 'удар', what: 'Hit on the victim; one flash per atom (damage, burn, stun…).' },
  { kind: 'charge', ru: 'заряд', what: 'Wind-up on the caster before the cast (viewer-only record).', sim: false },
  { kind: 'dash', ru: 'рывок', what: 'The caster crosses a line.' },
  { kind: 'blink', ru: 'блинк', what: 'Teleport between two points.' },
  { kind: 'jump', ru: 'прыжок', what: 'Hop with a landing.' },
  { kind: 'wall', ru: 'стена', what: 'A box placed on the floor for a while.' },
  { kind: 'status', ru: 'статус', what: 'Effect applied to a body: burn, stun, root, shield, heal…' },
];

/** Атомы удара и эффекты статуса, которые кладёт `src/core/effects.js`. */
export const ATOMS = ['damage', 'burn', 'knock', 'pull', 'stun', 'root', 'shield', 'heal', 'cleanse', 'blind', 'silence', 'boost', 'weaken', 'wall'];
export const STATUSES = ['burn', 'stun', 'root', 'shield', 'heal', 'cleanse', 'blind', 'silence', 'boost', 'weaken'];

/**
 * Запись `world.fx` для доставки `kind` стихии `element` в этой стойке: те же
 * поля, что кладёт `src/core/deliver.js`. Всё стреляет от синего в сторону
 * оранжевого. `hit` — попал ли луч/конус, `atom` — атом удара, `effect` —
 * эффект статуса, `t` — время каста (входит в сид: другой `t` — другой
 * рисунок того же эффекта).
 */
export function fxFor(kind, element, { hit = true, atom = 'damage', effect = 'burn', t = 0 } = {}) {
  const base = { kind, element, who: 'blue', t, skill: 'k1' };
  const h = Math.atan2(ORANGE.x - BLUE.x, ORANGE.z - BLUE.z);
  const dist = Math.hypot(ORANGE.x - BLUE.x, ORANGE.z - BLUE.z);
  switch (kind) {
    case 'beam': return { ...base, x0: BLUE.x, z0: BLUE.z, x1: ORANGE.x, z1: ORANGE.z, hit };
    case 'cone': return { ...base, x: BLUE.x, z: BLUE.z, h, range: 3.4, halfAngle: 0.96, hit };
    case 'bolt': return { ...base, x: BLUE.x, z: BLUE.z, h, range: dist, speed: 22 };
    case 'lob': return { ...base, x: BLUE.x, z: BLUE.z, h, range: dist, speed: 12 };
    case 'zone': return { ...base, x: ORANGE.x, z: ORANGE.z, r: 3.0, duration: 3 };
    case 'dash': return { ...base, x0: BLUE.x, z0: BLUE.z, x1: ORANGE.x - 1.5, z1: ORANGE.z - 1, hit };
    case 'blink': return { ...base, x0: BLUE.x, z0: BLUE.z, x1: BLUE.x + 4, z1: BLUE.z + 3 };
    case 'self': return { ...base, x: BLUE.x, z: BLUE.z };
    case 'jump': return { ...base, x: BLUE.x, z: BLUE.z, h, height: 2.2, duration: 0.55 };
    case 'wall': return { ...base, x: 1, z: 1, w: 4, d: 1, duration: 4 };
    /* `who` удара — КАСТЕР, как пишет `pushImpact` в deliver.js; жертву вьювер
       выводит сам (другой боец). У статуса наоборот: `who` — цель
       (`effects.js` пишет `to.id`). `channel` нужен усилению и ослаблению. */
    case 'impact': return { ...base, x: ORANGE.x, z: ORANGE.z, effects: [atom] };
    case 'status': return { ...base, who: 'orange', effect, ...(effect === 'boost' || effect === 'weaken' ? { channel: 'speed' } : {}) };
    /* Заряд в замахе — запись только вьювера (см. docs/VFX.md §4). */
    case 'charge': return { ...base, x: BLUE.x, z: BLUE.z, h, windup: 0.9, for: 'cone' };
    default: return null;
  }
}
