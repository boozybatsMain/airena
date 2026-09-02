/**
 * Молния · луч: главный разряд — ПУЧОК-КЛЕТКА по грамматике эталона.
 *
 * Жизнь каста как таймлайн (замер Storm Lance, ref-storm-120/380/800/1500):
 *   0.00–0.30  шар каста у руки ~1.3 м, бело-голубой, с горячим ядром там,
 *              где из него выходит пучок; гаснет к 0.44
 *   0.05–0.16  прорастание: пучок растёт от руки к цели (`reach`), фронт —
 *              лидер — горит ярче
 *   0.16       удар: аддитивное бело-горячее облако ~2.5 м (держится до
 *              0.36, гаснет к 0.56 — на 0.6 виден голый пучок в цели), шипы
 *              радиально (белая и синяя копии), кольцо по полу 0.2 м шириной
 *              до 3 м, веер дуг по полу, свет, толчок, ожог; вспышка кадра —
 *              едва: полноэкранная засветка затягивала кадр вуалью ровно в
 *              тот кадр, что видит зритель
 *   0.16–0.70  полная мощность: сеть перерисовывается каждые 40–60 мс, на
 *              каждой перестройке — вспышка; штрихи вбок от пучка
 *   0.70–1.00  распад ЧИСЛОМ нитей (n ~ k^0.8), оставшиеся — в полный цвет;
 *              прозрачность только в последних 15 % (полупрозрачная сетка на
 *              белом полу — бледный призрак, замер турнира)
 *   0.90–1.40  остывание: рубашка в тёмно-синий, свечение гаснет — метки на
 *              1.2 с уже тёмно-синие (при 1.0–1.5 они были сиреневыми)
 *   0.05–1.90  треск по полу: ковёр коротких синих глифов под путём и вокруг
 *              цели, гуще под дальней половиной; появляется с разрядом,
 *              переживает его (1.0–1.7 с у каждой метки, и у руки тоже) и
 *              гаснет последним
 *
 * Всё поле — одно: пучок, веер и треск пишутся в один буфер на каждой
 * перестройке, а затухание пучка и меток лежит в яркости сегмента, не в
 * униформе. Так каст берёт из кольца материалов один комплект, а не три.
 */

import * as THREE from 'three';
import { clamp01, mulberry, rnd, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { TAU, clampN, env } from './util.js';
import { boltField } from './field.js';
import { restriker, arcSparks, cloud, hotCore, spikes, floorRing } from './common.js';

/** Тайминги, секунды от каста (см. шапку). */
const T = { orb: 0.3, orbEnd: 0.44, out0: 0.05, out1: 0.16, full: 0.7, decay: 1.0, cool0: 0.9, cool1: 1.4, residue: 1.9 };

export function beam(vfx, e, P, ctx) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const fp = kit.footprint(e, ctx);
  const len = fp.len;
  if (!(len > 0.3)) return false;
  const A = [e.x0, 1.15, e.z0];
  const B = [e.x1, 1.1, e.z1];
  const ux = (B[0] - A[0]) / len, uz = (B[2] - A[2]) / len;
  const sx = -uz, sz = ux;
  const dir = fp.dir;
  const hit = e.hit !== false;
  const LIFE = T.residue;

  /* Нитей — по длине: 8 на коротком, 22 на длинном (эталон 12–20 на ~9 м);
     труба — конус от 0.05 м у руки до 0.8 м у цели на длинном пучке
     (эталон 0.8–1.4 м поперёк у дальнего конца). */
  const nFil = clampN(Math.round(6 + len * 1.0), 8, 22);
  const r1 = clampN(0.3 + len * 0.055, 0.45, 0.8);

  /* Треск по полу: глифы под путём (±1.5 м, гуще под дальней половиной) и в
     круге ~2 м вокруг цели. У каждого — своё рождение (большинство сразу,
     хвост до ~1 с) и своя жизнь 1.0–1.7 с НЕЗАВИСИМО от места: прежде
     жизнь 0.3–1.8 при рождении, растущем с `f`, оставляла ближнюю половину
     пути пустой к 1.2 с (замер турнира по шестым долям: [22,23,48,204,419,
     636]). Форма меняется каждые 120 мс от собственного сида, а не на
     каждой перестройке. Треть — точки. */
  const nMark = clampN(Math.round(len * 22), 50, 260);
  const marks = [];
  for (let i = 0; i < nMark; i++) {
    let x, z, f;
    if (hit && rng() < 0.25) {
      const a = rng() * TAU, d = Math.sqrt(rng()) * 2.0;
      x = B[0] + Math.sin(a) * d; z = B[2] + Math.cos(a) * d; f = 1;
    } else {
      f = Math.pow(rng(), 0.6);
      const s = rng() * 2 - 1;
      const lat = Math.sign(s) * Math.pow(Math.abs(s), 1.4) * 1.5;
      x = A[0] + ux * len * f + sx * lat; z = A[2] + uz * len * f + sz * lat;
    }
    marks.push({
      x, z, u: f, dir: rng() * TAU, dot: rng() < 0.33, links: 2 + Math.floor(rng() * 3),
      len: 0.8 + rng() * 0.6,
      born: 0.05 + f * 0.08 + Math.pow(rng(), 2.2) * 0.9,
      life: 1.0 + rng() * 0.7,
      bright: 0.8 + rng() * 0.2,
      seed: (seed ^ Math.imul(i + 1, 0x27d4eb2f)) >>> 0,
      phase: 200 + i,
    });
  }
  /* Веер дуг по полу от цели в момент удара. */
  const nRay = hit ? 7 : 4;
  const rays = [];
  for (let i = 0; i < nRay; i++) rays.push({ a: (i / nRay) * TAU + rng() * (TAU / nRay), len: (hit ? 2.4 : 1.6) * (0.7 + rng() * 0.6), phase: 60 + i });

  const field = boltField(vfx, P, 2400);
  const strandsAt = (t, r) => {
    const out = [];
    const k = t < T.full ? 1 : clamp01(1 - (t - T.full) / (T.decay - T.full));
    const n = Math.round(nFil * Math.pow(k, 0.8));
    if (n >= 2) {
      out.push({
        bundle: true, a: A, b: B, n, r0: 0.05, r1, step: 0.4, width: 0.021,
        bright: k < 0.15 ? k / 0.15 : 1, minY: 0.1, phase: 0,
        rungs: 0.5 + 0.8 * k, stubs: 0.2 + 0.4 * k, tangle: hit ? k : k * 0.4, bend: 0.04,
      });
    }
    const tr = t - T.out1;
    if (tr >= 0 && tr < 0.5) {
      const kr = env(tr, 0.22, 0.5);
      const m = Math.max(2, Math.round(rays.length * (0.5 + 0.5 * kr)));
      for (let i = 0; i < m; i++) {
        const rd = rays[i];
        out.push({ a: [B[0], 0.35, B[2]], b: [B[0] + Math.sin(rd.a) * rd.len, 0.05, B[2] + Math.cos(rd.a) * rd.len], floor: true, floorTop: 0.5, width: 0.02, bright: 0.95 * kr, jag: 0.28, branches: 2, phase: rd.phase, step: 0.26 });
      }
    }
    /* Глифы треска: тонкие (0.006 → рубашка ~1.5 px), БЕЗ ядра (яркость
       отрицательная), каждый гаснет в последних 12 % своей жизни; цвет
       остывает униформой `cool` после смерти пучка. */
    for (const mk of marks) {
      const age = (t - mk.born) / mk.life;
      if (age < 0 || age >= 1) continue;
      const g = mulberry((mk.seed ^ Math.imul(Math.floor(t / 0.12) + 1, 0x9e3779b1)) >>> 0);
      /* Гаснет только в последних 12 %: полупрозрачная метка на белом полу — пастель. */
      const envl = age < 0.08 ? age / 0.08 : age < 0.88 ? 1 : 1 - (age - 0.88) / 0.12;
      out.push({
        glyph: true, x: mk.x, z: mk.z, y: 0.05, dot: mk.dot, links: mk.links, len: mk.len,
        dir: mk.dir + (g() - 0.5) * 0.6, width: 0.006, bright: -mk.bright * envl,
        phase: mk.phase, u: mk.u, rng: g,
      });
    }
    return out;
  };
  const rs = restriker(field, seed, strandsAt, (t) => (t < T.full ? 0.045 : t < T.decay ? 0.07 : 0.11));

  const onHit = () => {
    vfx.flashLight(B[0], 1.6, B[2], P[0], hit ? 30 : 14, 0.4, 11);
    vfx.screen.shake(hit ? 0.45 : 0.2);
    vfx.screen.flash(P[0], hit ? 0.05 : 0.02);
    vfx.screen.aberration(hit ? 0.6 : 0.3);
    /* Ожог — тёмно-синий (P[2]) и компактный: серая крапина радиуса 2.4 с
       тоном P[1] читалась грязью и спорила с синим треском во всех поздних
       кадрах (замер турнира). */
    kit.decal(vfx, { type: 'arc', x: B[0], z: B[2], radius: hit ? 1.6 : 1.1, hold: 20, tint: P[2], seed: (seed % 7) + 1 });
  };
  const state = { hit: false };
  vfx.spawnMesh(field.group, LIFE, (o, u) => {
    const t = u * LIFE;
    const hot = rs.tick(t);
    const reach = clamp01((t - T.out0) / (T.out1 - T.out0)) + 0.001;
    const fade = t < T.residue - 0.35 ? 1 : clamp01((T.residue - t) / 0.35);
    const cool = clamp01((t - T.cool0) / (T.cool1 - T.cool0));
    field.set({ fade, hot, reach, cool });
    if (!state.hit && t >= T.out1) { state.hit = true; onHit(); }
  });
  rs.tick(0);

  /* Шар каста у руки (обычный блендинг с синим ободом — читается на белом
     полу) и горячее ядро на выходе пучка. */
  cloud(vfx, P, { x: A[0], y: 1.15, z: A[2], at: 0, r0: 0.25, r1: 0.68, grow: 0.07, hold: T.orb, life: T.orbEnd, seed: (seed % 5) + 2, dense: 1.35 });
  hotCore(vfx, P, { x: A[0] + ux * 0.3, y: 1.15, z: A[2] + uz * 0.3, r: 0.22, life: 0.5, hold: 0.32 });
  vfx.flashLight(A[0], 1.4, A[2], P[1], 16, 0.35, 7);
  kit.sparks(vfx, { x: A[0], y: 1.15, z: A[2], n: 18, colour: P[0], tail: P[1], speed: 8, life: 0.35, cone: { dir, half: 0.5 }, gravity: -4, size: 0.12, r: rng });

  /* Удар: аддитивное облако, шипы, кольцо, искры — всё от `T.out1`. */
  cloud(vfx, P, { x: B[0], y: 1.05, z: B[2], at: T.out1, r0: 0.35, r1: hit ? 1.25 : 0.65, grow: 0.16, hold: hit ? 0.36 : 0.28, life: hit ? 0.56 : 0.42, squash: 0.85, seed: (seed % 7) + 1, hot: 1.0, dense: 1, additive: true });
  spikes(vfx, P, { x: B[0], y: 1.0, z: B[2], n: hit ? 90 : 30, speed: 15, life: 0.36, size: 0.3, at: vfx.now + T.out1, r: rng });
  spikes(vfx, P, { x: B[0], y: 1.0, z: B[2], n: hit ? 18 : 8, speed: 7, life: 0.45, size: 0.14, at: vfx.now + T.out1 + 0.05, r: rng, up: 0.9 });
  floorRing(vfx, P, { x: B[0], z: B[2], r0: 0.4, r1: hit ? 3.0 : 2.0, life: 0.5, at: T.out1, thick: 0.3 });
  arcSparks(vfx, P, { x: B[0], y: 0.9, z: B[2], n: hit ? 40 : 16, speed: 10, life: 0.5, at: vfx.now + T.out1, r: rng });

  /* Штрихи и точки вбок от пучка всю полную фазу: пучок сыплет, пока стоит.
     Одна траектория — в двух пулах: белая в свечение (тела, стены) и
     глубоко-синяя в тело (белый пол): аддитивный штрих на белом полу не
     существует (замер турнира). */
  const nAlong = clampN(Math.round(len * 12), 24, 140);
  const along = [];
  for (let i = 0; i < nAlong; i++) {
    const f = 0.1 + rng() * 0.9;
    const rr = (0.1 + 0.5 * f) * rng();
    const a = rng() * TAU;
    const side = rng() < 0.5 ? -1 : 1;
    const v = rnd(2.5, 6, rng);
    const streak = i % 3 !== 0;
    along.push({
      x: A[0] + ux * len * f + sx * Math.cos(a) * rr, y: 1.15 + Math.sin(a) * rr, z: A[2] + uz * len * f + sz * Math.cos(a) * rr,
      vx: sx * side * v + rnd(-1, 1, rng), vy: rnd(-1, 2.5, rng), vz: sz * side * v + rnd(-1, 1, rng),
      born: vfx.now + T.out0 + rng() * (T.full - T.out0), life: rnd(0.2, 0.45, rng),
      size: streak ? rnd(0.12, 0.2, rng) : rnd(0.06, 0.1, rng), streak,
    });
  }
  const white = new THREE.Color(0.9, 0.96, 1.0);
  const blue = new THREE.Color(0.08, 0.4, 1.0), tailB = P[2].clone().multiplyScalar(0.7);
  const fill = (c1, c2, glow) => (i, s) => {
    const k = along[i];
    s.pos(k.x, k.y, k.z);
    s.vel(k.vx, k.vy, k.vz);
    s.gravity(0, -5, 0);
    s.color(c1, c2);
    s.life(k.born, k.life, k.size, k.streak ? kit.SHAPE.streak : kit.SHAPE.dot);
    s.ext(0, 0.4, k.streak ? 1 : 0, glow);
  };
  vfx.glow.emit(nAlong, fill(white, P[1], 1));
  vfx.body.emit(nAlong, fill(blue, tailB, 0.4));

  /* Следы: ожог у цели — в момент удара (см. `onHit`), два поменьше под
     путём — сразу: пучок проходит над ними в первые 100 мс. Тёмно-синие и
     небольшие — по той же причине, что и ожог у цели. */
  for (const f of [0.42, 0.72]) {
    if (len * (1 - f) < 1.2) continue;
    kit.decal(vfx, { type: 'arc', x: A[0] + ux * len * f + sx * (rng() - 0.5) * 0.8, z: A[2] + uz * len * f + sz * (rng() - 0.5) * 0.8, radius: 0.8 + rng() * 0.3, hold: 20, tint: P[2], seed: ((seed + Math.round(f * 10)) % 9) + 1 });
  }
  vfx.screen.aberration(0.4);
  return true;
}
