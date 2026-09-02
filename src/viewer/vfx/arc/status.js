/**
 * Молния · СТАТУС — наэлектризованное тело (план §3 A9).
 *
 * Запись `status` приходит на КАЖДОЕ применение: зона подкладывает горение,
 * оглушение, корни, слепоту, немоту, усиление и ослабление каждые 0.5 с, а
 * каст `self` + `shield` кладёт `self` и `status: shield` в один тик. Поэтому
 * ОДНО ТЕЛО — ОДИН ЭФФЕКТ (§P10): карта `STATUS` по паре «тело:эффект»;
 * пришла запись на живой эффект — двигаем срок и НИЧЕГО не заводим.
 *
 * Как это выглядит. Разряды ползут ПО КАПСУЛЕ тела (`surfaceSegs`, A0.3 —
 * тот же примитив, что у щита; принцип P2), вспышками по 0.15 с каждые
 * 0.4 с: тело бьёт током, а не носит наклейку. Клетки держатся внутри
 * вспышки, между вспышками рисунок новый — это разные разряды.
 *
 * `shield` уходит в решётку щита (`self.js`): её открывает именно эта запись,
 * она же несёт длительность. Лечение, очищение и усиление — те же вспышки,
 * но реже (раз в 0.8 с) и в светлом `P[1]`: это не удар током, а подпитка.
 */

import * as THREE from 'three';
import { clamp01, mulberry, seedOf } from '../core.js';
import { clampN } from './util.js';
import { boltField } from './field.js';
import { restriker, arcSparks } from './common.js';
import { shield as shieldLattice } from './self.js';
import { EFFECTS } from '../../../skills/registry.js';

/** Живые статусы по паре «тело:эффект» (§P10). */
const STATUS = new Map();

/** Длительность: из записи, из реестра, иначе одноразовая вспышка. */
export const durationOf = (e) => e.duration ?? EFFECTS[e.effect]?.duration ?? 1.5;

/* Эффекты, которые бьют током, и те, что подпитывают. */
const SHOCK = new Set(['burn', 'stun', 'root', 'blind', 'silence', 'weaken']);

export function status(vfx, e, P, ctx) {
  const who = e.who || 'orange';
  const dur = durationOf(e);
  if (e.effect === 'shield') return shieldLattice(vfx, e, P, ctx, dur);

  const key = `${who}:${e.effect}`;
  const live = STATUS.get(key);
  if (live && live.until > vfx.now) { live.until = vfx.now + dur; return true; }
  const entry = { until: vfx.now + dur };
  STATUS.set(key, entry);

  const seed = seedOf(e);
  const rng = mulberry(seed);
  const shock = SHOCK.has(e.effect);
  /* Одноразовые (лечение, очищение) живут 0.6 с — у них нет длительности ни
     в записи, ни в реестре (§P10). */
  const oneShot = e.duration == null && EFFECTS[e.effect]?.duration == null;
  const PERIOD = shock ? 0.4 : 0.8;
  const FLASH = oneShot ? 0.6 : 0.15;
  const MAX = oneShot ? 0.7 : 60;

  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(who) : null;
  const shape = () => {
    const b = ctx && ctx.bodyShape ? ctx.bodyShape(who) : bs;
    const p = ctx && ctx.bodyPos ? ctx.bodyPos(who) : null;
    const r = (b ? b.r : 0.9) * 1.1;
    const ry = (b ? b.h : 2.0) * 0.55;
    const x = b ? b.x : (p ? p.x : e.x ?? 0);
    const z = b ? b.z : (p ? p.z : e.z ?? 0);
    return { c: [x, ry, z], r, ry };
  };

  const field = boltField(vfx, P, 700);
  /* Вспышка: своё окно каждые PERIOD секунд; сид окна входит в сид нитей,
     так что рисунок между вспышками разный, а внутри вспышки — тот же. */
  const itemsAt = (t, g) => {
    const win = Math.floor(t / PERIOD);
    const phase = t - win * PERIOD;
    if (phase > FLASH) return [];
    const sp = shape();
    return [{
      surface: true, c: sp.c, r: sp.r, ry: sp.ry,
      n: clampN(Math.round(2 + 2 * sp.r), 3, 6), links: 4, link: 0.24,
      width: 0.019, bright: shock ? 1.0 : 0.9, rungs: 0.5, offset: 0.04,
      seed: (seed ^ Math.imul(win + 1, 0x9e3779b1)) >>> 0, minY: 0.06, phase: 0,
    }];
  };
  const rs = restriker(field, seed, itemsAt, 0.05);

  const g = new THREE.Group();
  g.add(field.group);
  vfx.spawnMesh(g, MAX, (o, u) => {
    const t = u * MAX;
    if (vfx.now > entry.until) {
      g.visible = false;
      if (STATUS.get(key) === entry) STATUS.delete(key);
      return;
    }
    g.visible = true;
    const win = Math.floor(t / PERIOD);
    const phase = t - win * PERIOD;
    /* Огибающая вспышки: мгновенный вход, спад за последнюю треть. */
    const k = phase > FLASH ? 0 : clamp01((FLASH - phase) / (FLASH * 0.4));
    field.set({ fade: k, hot: rs.tick(t), reach: 1, tail: 0 });
    if (o.userData.win !== win && phase < FLASH) {
      o.userData.win = win;
      const sp = shape();
      arcSparks(vfx, P, { x: sp.c[0], y: sp.c[1], z: sp.c[2], n: 6, speed: 4, life: 0.35, r: rng, spread: sp.r });
    }
  });
  rs.tick(0);
  return true;
}
