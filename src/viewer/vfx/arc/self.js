/**
 * Молния · ЩИТ — РЕШЁТКА, СПЛЕТЁННАЯ С ОБОЛОЧКОЙ (план §3 A4, принцип P2).
 *
 * Приговор основателя 03.09 прежней сборке: «щит не построен, а украшен: он
 * берёт примитив молнии и лепит из него палки как попало. Дуги должны быть
 * ВПЛЕТЕНЫ в саму поверхность щита. Эта беда у вас во многих местах».
 * Прежний закон (девять дуг большого круга между случайными точками у шара
 * плюс пять нитей в пол) удалён; шар и свет оставлены.
 *
 * ЧТО ЗДЕСЬ ВМЕСТО НЕГО. Нити — случайные блуждания ПО эллипсоиду оболочки
 * (`surfaceSegs`, A0.3): каждый узел спроецирован обратно на оболочку, каждый
 * излом — поворот вокруг местной нормали. Ни один штрих не уходит наружу и
 * ни один не пересекает нутро — с бокового глаза все они лежат по силуэту.
 * КЛЕТКИ ДЕРЖАТСЯ между перестройками (ход нити задаёт её собственный сид,
 * дрожь ±0.04 м), так что решётка живёт, а не мигает новой паутиной 20 раз в
 * секунду: кадры на 0.11 с врозь показывают ТЕ ЖЕ многоугольники.
 *
 * ДВЕ ЗАПИСИ, ДВА БЕАТА (§P10). Запись `self` — только БЕАТ КАСТА: 0.25 с
 * роста оболочки и разгона решётки, потом, если щит не открыли, схлопывание
 * ЧИСЛОМ НИТЕЙ за 0.4 с. Это разряд, а не щит: `self: heal` или `self: boost`
 * на молнии не имеет права получить клетку вокруг бойца. Держащийся щит
 * открывает запись `status` с `effect === 'shield'` — она и несёт
 * длительность (§7.7); пока она жива, решётка стоит.
 *
 * ЗАЗЕМЛЕНИЕ уходит с экватора КАСАТЕЛЬНО (сначала полметра вбок по
 * горизонтали, и только потом вниз): нить, воткнутая из шара прямо в пол, —
 * ровно та палка, за которую щит и забраковали.
 */

import * as THREE from 'three';
import { clamp01, mulberry, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { BURN, TAU, clampN } from './util.js';
import { boltField } from './field.js';
import { orb, restriker, arcSparks, stormBurst, heldLight, radialArcs } from './common.js';

/**
 * ОДНО ТЕЛО — ОДИН ЩИТ (§P10). Зона подкладывает `status: shield` каждые
 * 0.5 с, а каст `self` + `shield` кладёт обе записи в один тик: без этой
 * карты на бойце копилось бы по решётке на каждое применение.
 */
const SHIELDS = new Map();

/** Капсула тела: радиус оболочки, полувысота, центр. */
function shapeOf(vfx, e, ctx, who) {
  const bs = ctx && ctx.bodyShape ? ctx.bodyShape(who) : null;
  const p = ctx && ctx.bodyPos ? ctx.bodyPos(who) : null;
  const br = bs ? bs.r : 0.9, h = bs ? bs.h : 2.0;
  return {
    r: br * 1.25 + 0.35,
    ry: h * 0.62,
    at: () => {
      const q = ctx && ctx.bodyPos ? ctx.bodyPos(who) : p;
      return q ? [q.x, q.z] : [e.x ?? 0, e.z ?? 0];
    },
  };
}

/** Жив ли щит этого бойца прямо сейчас (нужно удару: §A7 бьёт по щиту). */
export function shieldOf(who) {
  const s = SHIELDS.get(who);
  return s && s.until > s.vfx.now ? s : null;
}

/**
 * Решётка на оболочке. `hold` — держать до `entry.until` (щит) или прожить
 * `LIFE` и схлопнуться (беат каста).
 */
function lattice(vfx, e, P, ctx, who, entry) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const sh = shapeOf(vfx, e, ctx, who);
  const R = sh.r, RY = sh.ry;
  const GROW = 0.25, FALL = entry ? 0.5 : 0.4;
  const LIFE = entry ? 60 : GROW + 0.35 + FALL;

  /* Нитей — от размера оболочки: 14 на мелком бойце, 22 на крупном. Замер
     i1 (8–14 нитей по 5–8 звеньев на оболочке радиуса 1.5 м): узлов выходило
     ~80 на 28 м² поверхности, среднее расстояние между ними 0.6 м, и
     перемычки почти не находили пар ближе 0.35·R — решётка была пятью
     разрозненными зигзагами на пузыре, ЗАМКНУТЫХ КЛЕТОК НОЛЬ при нужных 12.
     Теперь ~150 узлов, шаг 0.28 м, перемычки ищут пары до 0.5·R. */
  const N = clampN(Math.round(8 + 6 * R), 14, 22);
  const field = boltField(vfx, P, 1400);
  const flare = { at: -1, x: 0, y: 0, z: 0 };

  const itemsAt = (t, g) => {
    const [cx, cz] = sh.at();
    const k = t < GROW ? clamp01(t / GROW) : 1;
    const fall = entry
      ? clamp01((vfx.now - entry.until) / FALL)
      : clamp01((t - (GROW + 0.35)) / FALL);
    /* Схлопывание ЧИСЛОМ НИТЕЙ, а не прозрачностью: щит рвётся, а не тает. */
    const n = Math.max(0, Math.round(N * (2 / N + (1 - 2 / N) * k) * (1 - fall)));
    const out = [];
    if (n >= 1) {
      out.push({
        surface: true, c: [cx, RY, cz], r: R, ry: RY,
        n, links: 6 + Math.floor(g() * 4), link: 0.28, width: 0.021,
        bright: 1.0, rungs: 1.4, offset: 0.03, seed, spin: 0.4, t, minY: 0.06, phase: 0,
      });
    }
    /* Вспышка от попадания: три нити ПО ПОВЕРХНОСТИ из точки удара. */
    if (flare.at > 0 && t - flare.at < 0.2) {
      out.push({
        surface: true, c: [cx, RY, cz], r: R, ry: RY, start: [flare.x, flare.y, flare.z],
        n: 3, links: 4, link: 0.34, width: 0.024, bright: 1.2, rungs: 0.3,
        offset: 0.035, seed: seed ^ 0x77, minY: 0.06, phase: 90,
      });
    }
    /* ЗАЗЕМЛЕНИЕ: с экватора КАСАТЕЛЬНО вбок, и только потом в пол. */
    const nG = n > 0 ? 2 + (g() < 0.5 ? 1 : 0) : 0;
    for (let i = 0; i < nG; i++) {
      /* С ЭКВАТОРА (y = RY, самое широкое место оболочки), горизонтально на
         полметра — и только потом вниз. Нить, воткнутая из шара прямо в пол,
         — ровно та палка, за которую щит и забраковали. */
      const a = (i / 3) * TAU + t * 0.25 + seed * 0.001;
      const px = cx + Math.sin(a) * R * 1.03, pz = cz + Math.cos(a) * R * 1.03;
      const ex = cx + Math.sin(a) * (R + 0.35), ez = cz + Math.cos(a) * (R + 0.35);
      /* Вниз КРУТО: пол в 0.35–0.75 м дальше точки отрыва. Замер i2 — при
         0.8–1.6 м нить ложилась почти горизонтально и читалась отдельной
         проволокой, брошенной по полу рядом со щитом. */
      const d = 0.35 + g() * 0.4;
      out.push({ a: [px, RY, pz], b: [ex, RY * 0.94, ez], width: 0.019, bright: 0.9, jag: 0.12, minY: 0.06, phase: 600 + i, step: 0.22 });
      out.push({ a: [ex, RY * 0.94, ez], b: [cx + Math.sin(a) * (R + 0.35 + d), 0.05, cz + Math.cos(a) * (R + 0.35 + d)], width: 0.019, bright: 0.9, jag: 0.2, branches: 1, minY: 0.05, phase: 600 + i, step: 0.24 });
    }
    /* Ковёр треска кольцом под кромкой: пересевается раз в полсекунды. */
    if (n > 0) {
      const win = Math.floor(t / 0.5);
      const gc = mulberry((seed ^ Math.imul(win + 1, 0x85ebca6b)) >>> 0);
      const m = clampN(Math.round(24 + 8 * R), 24, 40);
      for (let i = 0; i < m; i++) {
        const a = gc() * TAU, d = R * (0.85 + gc() * 0.45);
        out.push({
          glyph: true, x: cx + Math.sin(a) * d, z: cz + Math.cos(a) * d, y: 0.05,
          dot: gc() < 0.45, links: 3 + Math.floor(gc() * 3), len: 0.6 + gc() * 0.6,
          dir: a + Math.PI / 2, width: 0.0055, bright: -(0.7 + 0.3 * gc()), phase: 700 + i,
        });
      }
    }
    return out;
  };
  const rs = restriker(field, seed, itemsAt, 0.055);

  /* Оболочка: только френелевая кромка (`fill` 0) — тело видно насквозь. */
  const shell = orb(P, R, (seed % 5) + 1, 0.5);
  const [x0, z0] = sh.at();
  shell.group.position.set(x0, RY, z0);
  const g = new THREE.Group();
  g.add(field.group, shell.group);
  let lit = null, lightAt = -1;
  vfx.spawnMesh(g, LIFE, (o, u) => {
    const t = u * LIFE;
    const [cx, cz] = sh.at();
    const k = t < GROW ? clamp01(t / GROW) : 1;
    const fall = entry ? clamp01((vfx.now - entry.until) / FALL) : clamp01((t - (GROW + 0.35)) / FALL);
    const flareK = flare.at > 0 && t - flare.at < 0.3 ? 1 - (t - flare.at) / 0.3 : 0;
    field.set({ fade: 1 - fall, hot: Math.max(rs.tick(t), flareK), reach: 1, tail: 0 });
    shell.group.position.set(cx, RY, cz);
    /* `orb.set` масштабирует равномерно — сплющиваем ПОСЛЕ него. */
    shell.set(k * (1 - fall) * (0.9 + 0.1 * Math.sin(t * 11)) * (1 + 0.5 * flareK), 0, R);
    shell.group.scale.set(R, RY, R);
    if (t - lightAt > 0.3 && fall < 1) { lit = heldLight(vfx, cx, RY, cz, P[1], 9, 0.4, 7); lightAt = t; }
    else if (lit) lit(cx, RY, cz);
    if (!o.userData.next || t >= o.userData.next) {
      o.userData.next = t + 0.3;
      if (fall < 0.5) arcSparks(vfx, P, { x: cx, y: RY, z: cz, n: 8, speed: 5, life: 0.4, r: rng, spread: R });
    }
    if (entry && fall >= 1) { g.visible = false; if (SHIELDS.get(who) === entry) SHIELDS.delete(who); }
  });
  rs.tick(0);
  return { flare, r: R, ry: RY, at: sh.at };
}

export function self(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const who = e.who || 'blue';
  const st = lattice(vfx, e, P, ctx, who, null);
  const [x0, z0] = st.at();
  /* Беат каста: выброс, веер по полу, ожог и вспышка. */
  stormBurst(vfx, P, { x: x0, y: st.ry, z: z0, radius: 0.6, endRadius: st.r * 1.6, life: 0.4, intensity: 0.9 });
  radialArcs(vfx, P, seed, x0, z0, 6, 2.4, 0.4, 0.3);
  kit.decal(vfx, { type: 'arc', x: x0, z: z0, radius: st.r * 1.1, hold: 20, tint: BURN, seed: (seed % 7) + 1 });
  vfx.flashLight(x0, st.ry, z0, P[0], 20, 0.25, 8);
  vfx.screen.flash(P[0], 0.06);
  return true;
}

/**
 * Держащийся щит: открывается записью `status: shield` (§P10). Пока запись
 * приходит снова (зона подкладывает её каждые 0.5 с), решётка не заводится
 * заново — двигается только срок.
 */
export function shield(vfx, e, P, ctx, duration) {
  const who = e.who || 'blue';
  const prev = SHIELDS.get(who);
  if (prev && prev.until > vfx.now) { prev.until = vfx.now + duration; return true; }
  const entry = { until: vfx.now + duration, vfx, who };
  SHIELDS.set(who, entry);
  const st = lattice(vfx, e, P, ctx, who, entry);
  entry.st = st;
  return true;
}
