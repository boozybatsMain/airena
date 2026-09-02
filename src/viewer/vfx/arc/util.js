/**
 * Молния · чистые помощники без three: константы, огибающая, точка на сфере,
 * касательная и поворот у поверхности, положение тела, цвет ожога. Лист
 * дерева импортов: его тянут и поле, и общие кусочки.
 */
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
export const hex = (P) => P.map((c) => c.getHexString()).join();

/** Огибающая: полная до `full`, потом гаснет к `life`. */
export const env = (t, full, life) => (t < full ? 1 : Math.max(0, 1 - (t - full) / Math.max(0.01, life - full)) ** 1.4);

/** Точка на сфере радиуса R (равномерно). */
export function onSphere(rng, R) {
  const a = rng() * TAU, e = Math.asin(rng() * 2 - 1);
  return [Math.cos(e) * Math.sin(a) * R, Math.sin(e) * R, Math.cos(e) * Math.cos(a) * R];
}

export const bodyAt = (ctx, who) => (ctx && ctx.bodyPos ? ctx.bodyPos(who) : null);

/* Касательная к поверхности в точке с нормалью nrm: случайный вектор минус
   его проекция на нормаль. Нужна `surfaceSegs`: нить на щите идёт ПО
   поверхности, а не торчит из неё наружу (принцип P2). */
export function tangent(rng, nrm) {
  let vx = rng() * 2 - 1, vy = rng() * 2 - 1, vz = rng() * 2 - 1;
  const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
  const nx = nrm[0] / nl, ny = nrm[1] / nl, nz = nrm[2] / nl;
  const d = vx * nx + vy * ny + vz * nz;
  vx -= nx * d; vy -= ny * d; vz -= nz * d;
  const l = Math.hypot(vx, vy, vz) || 1;
  return [vx / l, vy / l, vz / l];
}

/* Поворот Родрига вектора v вокруг оси nrm на угол a: излом нити на
   поверхности остаётся касательным к ней. */
export function rotateAroundNormal(v, nrm, a) {
  const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
  const nx = nrm[0] / nl, ny = nrm[1] / nl, nz = nrm[2] / nl;
  const c = Math.cos(a), s = Math.sin(a), d = (1 - c) * (v[0] * nx + v[1] * ny + v[2] * nz);
  return [v[0] * c + (ny * v[2] - nz * v[1]) * s + nx * d,
          v[1] * c + (nz * v[0] - nx * v[2]) * s + ny * d,
          v[2] * c + (nx * v[1] - ny * v[0]) * s + nz * d];
}

/**
 * ЦВЕТ ОЖОГА на полу. Замер круга 2: след `arc` в оттенке `P[2]` на белом
 * полу читался серой копотью (61,94,136) — HDR-синий держит цвет. Один на
 * весь модуль: каждый `kit.decal({ type: 'arc' })` молнии красится им.
 */
export const BURN = new THREE.Color(0.0, 0.45, 1.5);
