/**
 * Прелюдия мозга — то, что у него есть, кроме `p`, `api` и `mem`.
 *
 * Живёт отдельным файлом ровно по одной причине: её потребителей ДВА, и они
 * нужны в разной форме. Хост (`host.js`) инжектит её как ТЕКСТ в контекст
 * `node:vm`; изолят (`server/sandbox/worker.js`) строит из неё ОБЪЕКТ и
 * передаёт аргументом. Пока это был текст внутри host.js, изолят держал
 * собственную рукописную копию — и она разошлась на `angleTo`, которая
 * принимает heading и вектор, а не два вектора. Разошлась молча: мозги
 * запускались, не падали и промахивались все до одного, а матч кончался
 * ничьёй на исходе времени. Один источник закрывает этот класс целиком.
 */

export const PRELUDE = `
const V = {
  add: (a, b) => ({ x: a.x + b.x, z: a.z + b.z }),
  sub: (a, b) => ({ x: a.x - b.x, z: a.z - b.z }),
  scale: (a, s) => ({ x: a.x * s, z: a.z * s }),
  len: (a) => Math.sqrt(a.x * a.x + a.z * a.z),
  dist: (a, b) => Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)),
  dot: (a, b) => a.x * b.x + a.z * b.z,
  norm: (a) => {
    const l = Math.sqrt(a.x * a.x + a.z * a.z);
    return l < 1e-9 ? { x: 0, z: 0 } : { x: a.x / l, z: a.z / l };
  },
  toward: (a, b) => V.norm({ x: b.x - a.x, z: b.z - a.z }),
  away: (a, b) => V.norm({ x: a.x - b.x, z: a.z - b.z }),
  perp: (a) => ({ x: -a.z, z: a.x }),
  rot: (a, r) => ({ x: a.x * Math.cos(r) - a.z * Math.sin(r), z: a.x * Math.sin(r) + a.z * Math.cos(r) }),
  lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }),
  heading: (a) => Math.atan2(a.x, a.z),
  fromHeading: (h) => ({ x: Math.sin(h), z: Math.cos(h) }),
  angleTo: (h, a) => {
    let d = (Math.atan2(a.x, a.z) - h) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d <= -Math.PI) d += Math.PI * 2;
    return d;
  },
  clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
  lead: (shooter, target, targetVel, projectileSpeed) => {
    if (!projectileSpeed || projectileSpeed <= 0) return { x: target.x, z: target.z };
    const rx = target.x - shooter.x, rz = target.z - shooter.z;
    const a = targetVel.x * targetVel.x + targetVel.z * targetVel.z - projectileSpeed * projectileSpeed;
    const b = 2 * (rx * targetVel.x + rz * targetVel.z);
    const c = rx * rx + rz * rz;
    let t = 0;
    if (Math.abs(a) < 1e-6) { t = Math.abs(b) < 1e-9 ? 0 : -c / b; }
    else {
      const d = b * b - 4 * a * c;
      if (d >= 0) {
        const s = Math.sqrt(d);
        const t1 = (-b - s) / (2 * a), t2 = (-b + s) / (2 * a);
        const good = [t1, t2].filter((v) => v > 0);
        t = good.length ? Math.min(...good) : 0;
      }
    }
    if (!(t > 0) || !isFinite(t)) t = 0;
    return { x: target.x + targetVel.x * t, z: target.z + targetVel.z * t };
  },
};
`;
