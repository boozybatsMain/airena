/**
 * Молния · чистые помощники без three: константы, огибающая, точка на сфере,
 * положение тела. Лист дерева импортов: его тянут и поле, и общие кусочки.
 */

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
