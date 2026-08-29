/**
 * `constants_version` — F9.
 *
 * Каждый мозг записывает, против каких чисел он написан. Версия НЕ ставится
 * руками: рука забывает её поднять ровно тогда, когда это важнее всего —
 * в спешке перед релизом, после правки одной цифры. Поэтому версия
 * вычисляется из самих чисел: хеш раскрываемой части конфигурации.
 *
 * «Раскрываемая часть» — именно та, которую видит мозг в промпте. Если число
 * не доехало до промпта, мозг про него не знает, и его изменение мозг не
 * дезинформирует. Это же свойство делает версию честной: она меняется тогда и
 * только тогда, когда меняется то, во что мозг верит.
 *
 * F9 требует нулевого неверсионированного дрейфа как релизного гейта —
 * `tools/checkstale.mjs` сравнивает записанные таблицы; эта версия даёт ему
 * короткое имя, которое можно положить в БД, в матч и на экран.
 */

import { createHash } from 'node:crypto';

import {
  ARENA_HALF, FIGHTERS, MATCH_SECONDS, OBSTACLES, SKILLS,
  SUDDEN_DEATH_AT, SUDDEN_DEATH_RAMP, THINK_HZ, TICK_HZ, WALL_HEIGHT,
} from './config.js';

/** Ровно то, что уезжает в промпт мозга. */
export function disclosed() {
  return {
    fighters: FIGHTERS,
    skills: SKILLS,
    arena: { half: ARENA_HALF, wallHeight: WALL_HEIGHT, obstacles: OBSTACLES },
    tickHz: TICK_HZ,
    thinkHz: THINK_HZ,
    matchSeconds: MATCH_SECONDS,
    suddenDeathAt: SUDDEN_DEATH_AT,
    suddenDeathRamp: SUDDEN_DEATH_RAMP,
  };
}

/** Устойчивая сериализация: порядок ключей не должен менять версию. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  /* Числа приводим к фиксированному виду: 0.35 и 0.350000000001 — это одна
     константа, и разная версия у них означала бы ложную тревогу гейта. */
  if (typeof v === 'number') return Number(v.toFixed(6)).toString();
  return JSON.stringify(v);
}

let cached = null;

/** Короткая версия вида `c-9f3a21`. */
export function constantsVersion() {
  if (cached) return cached;
  const h = createHash('sha256').update(stable(disclosed())).digest('hex');
  cached = `c-${h.slice(0, 8)}`;
  return cached;
}

/** Полный хеш — для отчётов и для сравнения между релизами. */
export function constantsHash() {
  return createHash('sha256').update(stable(disclosed())).digest('hex');
}
