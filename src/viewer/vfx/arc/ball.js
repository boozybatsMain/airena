/**
 * Молния · БОЛТ и НАВЕС — разряд с НЕПОДВИЖНЫМ НАЧАЛОМ (план §3 A2/A3, P1).
 *
 * Приговор основателя 03.09 прежней сборке: «это кусок, область, в которой
 * рисуется молния, и этот кусок летит вперёд вместе с молнией внутри. У
 * настоящей молнии начало НЕ ДВИЖЕТСЯ. Она не летит целиком: её ветви сами
 * тянутся вперёд, а хвост позади гаснет». Шаровая молния с дугами на ней и
 * шлейфом — удалена целиком.
 *
 * ЧТО ЗДЕСЬ ВМЕСТО НЕЁ. Разряд от руки `A` до конца `B` стоит в пространстве
 * ЦЕЛИКОМ и переписывается каждые 45 мс (пучок `bundleSegs`, тот же примитив,
 * что у луча). Светится только полоса вдоль пути — окно `tail`..`reach`
 * (униформа `tail`, A0.1). Голова окна идёт вперёд со скоростью снаряда,
 * хвост отстаёт на `W` метров: первые `W/speed` секунд начало у руки горит,
 * потом хвост её отпускает. Глазу это читается живым разрядом, ползущим
 * вперёд, — а замри кадр, и от руки к голове идёт цельный путь.
 *
 * ВТОРОЕ ПОЛЕ — ГОЛОВА (`headF`, A0.5). Закон прорастания гасит всё, что
 * лежит в окне 0.18 доли пути ПОД `reach`, — значит на самом конце разряда
 * не нарисовать ничего. Лидер (2–3 нити, уходящие в стороны и кончающиеся в
 * ВОЗДУХЕ, как у настоящего разряда) и клубок на конце живут в отдельном
 * поле с `reach: 1, tail: 0`; оно же ведёт след треска по полу — метки в
 * главном поле хвост бы съел.
 *
 * НАВЕС (`lob`) — тот же разряд по параболе: `lift` (A0.2) добавляет дугу к
 * оси рука→точка падения, голова взбирается, переваливает и приходит вниз.
 * Удар вниз — естественный конец параболы, а не отдельный эффект.
 *
 * КОНЕЦ РАЗРЯДА — там, где кончился снаряд. Сим пишет болт в момент запуска
 * и не знает о попадании; про попадание она пишет `impact` той же парой
 * (кто, умение). `vfx.flight` (§7.2) связывает их: `state.hit` приходит с
 * точкой и моментом. Три исхода: попал (клубок, кольцо, ожог), заблокирован
 * укрытием (полклубка, без ожога и тряски), промах (голова доходит до `B` и
 * окно схлопывается — энергия, не попавшая никуда, просто кончается).
 *
 * Замеры (03.09, стойка: болт 9.2 м на 22 м/с, окно 4.8 м):
 *   · 0.15 с — голова на 3.3 м, начало ещё горит: коробка у руки hot > 20;
 *   · 0.35 с — голова 0.84 пути, хвост 0.31: у руки hot = 0, синего от следа
 *     на полу > 150. Именно это и значит «начало не движется, но погасло».
 */

import * as THREE from 'three';
import { clamp01, mulberry, seedOf } from '../core.js';
import * as kit from '../kit.js';
import { BURN, clampN } from './util.js';
import { boltField } from './field.js';
import { restriker, cloud, hotCore, stormBurst, arcSparks, spikes, floorRing, heldLight, radialArcs } from './common.js';

/* Поворот единичного горизонтального вектора на угол. */
const rotY = (ux, uz, a) => [ux * Math.cos(a) + uz * Math.sin(a), -ux * Math.sin(a) + uz * Math.cos(a)];

function ball(vfx, e, P, ctx, lob) {
  const seed = seedOf(e);
  const rng = mulberry(seed);
  const ux = Math.sin(e.h), uz = Math.cos(e.h);
  const fp = kit.footprint(e, ctx);
  /* ОПИСЬ НАСТРАИВАЕМОГО. Значения по умолчанию — сегодняшние: запись, не
     несущая поля, даёт прежний кадр (см. `kit.tune`).
     Размеры посадки ведутся `fp.radius` — это `IMPACT_RADIUS` из kit.js,
     заведённый ровно на этот случай («у болта и навеса своего радиуса нет,
     есть точка»). Он считался и не читался: вся посадка была числами. */
  const S = kit.tune(e, {
    speed: 20,        /* скорость снаряда, м/с */
    range: 10,        /* дальность, м */
    y: 1.1,           /* высота вылета, м */
    yEnd: lob ? 0.25 : 1.1,  /* высота конца: навес приходит в пол, болт летит ровно, м */
    apex: 0.35,       /* подъём параболы навеса, доли длины */
    window: 0.22,     /* окно свечения, с полёта (зажато 3–6 м) */
    filaments: null,  /* нитей в пучке; null — от длины */
    spread: 0.5,      /* труба пучка у конца, м */
    ringR: fp.radius * (lob ? 1.857 : 1.571),   /* кольцо посадки, м */
    burnRadius: fp.radius * (lob ? 1 : 0.857),  /* ожог посадки, м */
    burnAfter: 8,     /* ожог переживает полёт на столько, с */
  });
  const speed = Math.max(4, S.speed);
  const len = Math.max(1.5, S.range);
  /* Жизнь снаряда в симе — ровно `range / speed` (`deliver.js`), потолка нет:
     разряд обязан кончиться там же, где снаряд. */
  const travel = len / speed;
  const A = [e.x + ux * 0.7, S.y, e.z + uz * 0.7];
  const B = [A[0] + ux * len, S.yEnd, A[2] + uz * len];
  const apex = S.apex * len;
  /* Парабола навеса — ДОБАВКА к оси: сама ось уже сводит 1.1 м к 0.25 м. */
  const lift = lob ? (t) => 4 * apex * t * (1 - t) : null;
  const headAt = (f) => [
    A[0] + ux * len * f,
    Math.max(0.12, A[1] + (B[1] - A[1]) * f + (lift ? lift(f) : 0)),
    A[2] + uz * len * f,
  ];

  /* ОКНО. 0.22 с полёта, но не короче 3 м и не длиннее 6: на медленном
     навесе (12 м/с) окно 2.6 м читалось обрубком, на быстром болте (22 м/с)
     окно 4.8 м — это половина пути, разряд виден весь полёт. */
  const W = clampN(S.window * speed, 3, 6);
  const state = { hit: null };
  vfx.flight(e.who, e.skill, state);

  /* ── главное поле: разряд целиком, светится окно ─────────────────────── */
  const field = boltField(vfx, P, 900);
  /* Толщина пучка: 8–12 нитей в трубе 0.5 м при ядре 0.024 м. Замер i1
     (6–10 нитей, труба 0.35, ядро 0.021): с бокового глаза разряд читался
     ПРОВОЛОКОЙ в одну нить — 59 горячих в коробке у руки против 300+ у луча
     в столбе. Болт тоньше луча по смыслу (снаряд, а не ствол), но не в
     четыре раза. */
  const bundleAt = () => [{
    bundle: true, a: A, b: B, lift,
    n: S.filaments ?? clampN(Math.round(6 + len * 0.6), 8, 12),
    r0: 0.05, r1: S.spread, step: 0.4, width: 0.024, heroes: 2,
    rungs: 0.8, stubs: 0.5, tangle: 0, bend: 0.03, minY: lob ? 0.08 : 0.1,
  }];
  const rs = restriker(field, seed, bundleAt, 0.045);

  /* ── второе поле: голова, её ветви и след треска по полу ─────────────── */
  const headF = boltField(vfx, P, 1100);
  /* След на полу: места и форма меток посчитаны один раз, каждая метка живёт
     своё время от прохода головы — так ковёр остаётся на месте и остывает,
     а не мигает новым узором каждую перестройку (тот же приём, что у луча). */
  const nMark = clampN(Math.round(14 * len), 30, 160);
  const marks = [];
  for (let i = 0; i < nMark; i++) {
    const f = rng();
    const lat = (rng() - 0.5) * 1.2;
    const [sx, sz] = rotY(ux, uz, Math.PI / 2);
    marks.push({
      x: A[0] + ux * len * f + sx * lat, z: A[2] + uz * len * f + sz * lat,
      born: f * travel + 0.02, life: 0.6 + rng() * 0.4,
      dot: rng() < 0.4, links: 3 + Math.floor(rng() * 3), scale: 0.7 + rng() * 0.8,
      dir: Math.atan2(ux, uz) + (rng() - 0.5) * 1.6, g: mulberry((seed ^ Math.imul(i + 1, 0x2545f491)) >>> 0),
      f,
    });
  }
  /* Состояние головы, общее для перестройщика и кадра: где она, жива ли,
     и завязался ли клубок удара. */
  const hd = { f: 0, done: false, tangle: 0, tangleUntil: -1 };
  const headItems = (t, g) => {
    const out = [];
    const H = headAt(hd.f);
    /* Лидер: 2–3 нити под 30–60° в стороны, кончаются В ВОЗДУХЕ. Это и есть
       «ветви тянутся вперёд»: у настоящего разряда конец всегда разветвлён. */
    if (!hd.done || hd.tangle > 0) {
      /* ГОЛОВНОЙ УЧАСТОК. Закон прорастания гасит всё, что лежит в 0.18 доли
         пути под `reach`, — на болте 9.2 м это 1.66 м ТЕМНОТЫ перед головой:
         в ролике i1 клубок висел оторванным от пучка, и путь от руки к
         голове рвался (провал теста P1). Здесь тот же участок нарисован в
         свободном поле, где `reach` = 1: пучок из главного поля плавно
         входит в него, и разряд остаётся цельным. */
      /* Перекрытие 0.30 доли пути, не 0.22: окно гашения — 0.18, и на стыке
         между перестройками главного поля голова на два кадра отрывалась от
         пучка (замер 03.09 по ролику на 0.20 с: «изолированный клубок с
         разрывом спереди и сзади»). Запас в 0.12 доли закрывает стык. */
      const back = Math.max(0, hd.f - 0.30);
      const Hb = headAt(back);
      if (hd.f > 0.02) {
        out.push({
          bundle: true, a: Hb, b: H, n: 5, r0: 0.34, r1: 0.16, cone: 1.0,
          width: 0.023, bright: 1.0, heroes: 2, step: 0.34,
          rungs: 0.6, stubs: 0.35, tangle: 0, bend: 0.02, phase: 300, minY: 0.1,
        });
      }
      const nLead = 2 + (g() < 0.5 ? 1 : 0);
      for (let i = 0; i < nLead; i++) {
        const a = (0.52 + g() * 0.53) * (g() < 0.5 ? -1 : 1);
        const [dx, dz] = rotY(ux, uz, a);
        const L = 0.5 + g() * 0.7;
        out.push({
          a: H, b: [H[0] + dx * L, Math.max(0.1, H[1] + (g() - 0.5) * 0.6), H[2] + dz * L],
          width: 0.018, bright: 0.9, jag: 0.2, branches: 1, minY: 0.1, phase: 500 + i, step: 0.26,
        });
      }
      /* Клубок головы: четыре нити внахлёст, яркость 1.15. Фронт и кончик
         лидера у этого поля выключены (`reach` = 1) — белизна берётся
         наложением нитей и вспышкой перестройки. */
      out.push({
        bundle: true, a: [H[0] - ux * 0.4, H[1], H[2] - uz * 0.4], b: [H[0] + ux * 0.15, H[1], H[2] + uz * 0.15],
        n: 4, r0: 0.05, r1: 0.12, width: 0.021, heroes: 2, step: 0.2,
        rungs: 0.4, stubs: 0, tangle: hd.tangle, bend: 0, phase: 0, minY: 0.1,
      });
    }
    /* Метки, живые сейчас: свежая — модуль яркости 1.0, к концу жизни 0.6
       (в материале это переход синей крошки в тёмно-синюю). */
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      const age = t - m.born;
      if (age < 0 || age >= m.life) continue;
      out.push({
        glyph: true, x: m.x, z: m.z, y: 0.05, dot: m.dot, links: m.links, len: m.scale,
        dir: m.dir, width: 0.0055, bright: -(1 - 0.4 * (age / m.life)), phase: 700 + i, rng: m.g, u: 1,
      });
    }
    return out;
  };
  const rsHead = restriker(headF, seed ^ 0x9d1, headItems, 0.045);

  /* ── выброс у руки ───────────────────────────────────────────────────── */
  cloud(vfx, P, { x: A[0], y: S.y, z: A[2], kind: 'orb', r0: 0.2, r1: 0.45, grow: 0.06, hold: 0.10, life: 0.22, seed: (seed % 5) + 1 });
  hotCore(vfx, P, { x: A[0], y: S.y, z: A[2], r: 0.15, life: 0.25 });
  kit.sparks(vfx, { x: A[0], y: S.y, z: A[2], n: 12, colour: P[1], tail: P[2], speed: 11, life: 0.35, cone: { dir: e.h, half: 0.45 }, gravity: -6, size: 0.14, r: rng });
  vfx.flashLight(A[0], S.y, A[2], P[1], 12, 0.2, 7);

  /* ── жизнь ───────────────────────────────────────────────────────────── */
  const root = new THREE.Group();
  root.add(field.group, headF.group);
  const LIFE = travel + 0.6;
  let lit = null;          /* свет, ведомый за головой */
  let lightAt = -1;
  let impactDone = false;
  let endF = 1;            /* доля пути, на которой разряд кончился */
  let endT = travel;       /* когда это случилось */
  vfx.spawnMesh(root, LIFE, (o, u) => {
    const t = u * LIFE;
    /* Попадание: сим прислала точку — считаем долю пути до неё. */
    if (state.hit && state.hit.tt == null) {
      const d = Math.hypot(state.hit.x - A[0], state.hit.z - A[2]);
      state.hit.tt = t;
      endF = clamp01(d / len);
      endT = t;
    }
    const head = clamp01(t / travel);
    const capped = Math.min(head, endF);
    /* После конца окно схлопывается к голове за 0.2 с: разряд гаснет с
       хвоста, а не пропадает целиком. */
    const done = t >= endT && (state.hit || head >= 1);
    hd.f = capped; hd.done = done;
    if (hd.tangleUntil > 0 && t > hd.tangleUntil) hd.tangle = 0;
    const collapse = done ? clamp01((t - endT) / 0.2) : 0;
    const tail0 = Math.max(0, capped - W / len);
    const tail = tail0 + (capped - tail0) * collapse;
    const hot = rs.tick(t);
    field.set({ fade: 1, hot, reach: capped + 0.001, tail: Math.max(1e-4, tail) });
    headF.set({ fade: 1, hot: rsHead.tick(t), reach: 1, tail: 0 });

    /* Свет ведём за головой; пул круговой с квадратичным спадом, так что
       вспышку надо возобновлять каждые ~0.3 с, иначе она гаснет сама. */
    const H = headAt(capped);
    if (!done) {
      if (t - lightAt > 0.3) { lit = heldLight(vfx, H[0], H[1], H[2], P[1], 10, 0.4, 7); lightAt = t; }
      else if (lit) lit(H[0], H[1], H[2]);
    }

    if (done && !impactDone) {
      impactDone = true;
      const X = state.hit ? state.hit.x : B[0], Z = state.hit ? state.hit.z : B[2];
      const Y = Math.max(0.6, headAt(endF)[1]);
      const blocked = state.hit ? state.hit.blocked : false;
      /* НАВЕС ПАДАЕТ ВСЕГДА. Болт, не попавший ни во что, просто кончается
         (энергия иссякла), а навес брошен В ТОЧКУ: парабола кончается на
         полу, и удар вниз — её естественный конец. Замер 03.09 (судья, 35 из
         100 за посадку): без записи `impact` от сима навес приходил к цели и
         гас без вспышки, кольца и ожога — «посадка неотличима от промаха». */
      const lands = !!state.hit || lob;
      /* Клубок удара живёт две перестройки — 0.1 с белой путаницы в точке. */
      if (lands) { hd.tangle = blocked ? 0.5 : 1; hd.tangleUntil = t + 0.1; }
      if (lands && !blocked) {
        spikes(vfx, P, { x: X, y: Y, z: Z, n: 40, speed: 13, life: 0.34, r: rng });
        floorRing(vfx, P, { x: X, z: Z, r0: 0.3, r1: S.ringR, life: 0.4 });
        arcSparks(vfx, P, { x: X, y: Y, z: Z, n: 24, speed: 11, life: 0.45, r: rng });
        vfx.flashLight(X, Y, Z, P[1], 24, 0.35, 8);
        vfx.screen.shake(lob ? 0.35 : 0.3);
        vfx.screen.aberration(0.4);
        /* Ожог живёт от ПОЛЁТА, а не двадцать секунд всегда: разряд кончается
           там же, где снаряд, и след обязан считаться от того же срока. */
        kit.decal(vfx, { type: 'arc', x: X, z: Z, radius: S.burnRadius, hold: travel + S.burnAfter, tint: BURN, seed: (seed % 7) + 1 });
        if (lob) {
          stormBurst(vfx, P, { x: X, y: Math.max(0.7, Y), z: Z, radius: 0.6, endRadius: 2.2, life: 0.45, intensity: 1.2 });
          radialArcs(vfx, P, seed, X, Z, 8, fp.radius * 1.714, 0.45, 0.4);
          kit.impactKit(vfx, { x: X, z: Z, y: 0.9, radius: fp.radius * 1.286, colours: P, strength: 1.1 });
        }
      } else if (blocked) {
        /* Об укрытие: полклубка и дюжина шипов, без ожога, кольца и тряски. */
        spikes(vfx, P, { x: X, y: Y, z: Z, n: 12, speed: 10, life: 0.26, r: rng });
        vfx.flashLight(X, Y, Z, P[1], 10, 0.2, 5);
      }
      /* Промах болта (`state.hit` пуст) — ничего: энергия просто кончилась. */
    }
    if (t > LIFE - 0.05) vfx.flights.delete(`${e.who}:${e.skill}`);
  });
  rs.tick(0); rsHead.tick(0);
  return true;
}

export function bolt(vfx, e, P, ctx) { return ball(vfx, e, P, ctx, false); }
export function lob(vfx, e, P, ctx) { return ball(vfx, e, P, ctx, true); }
