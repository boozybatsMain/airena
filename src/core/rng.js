/**
 * mulberry32 — a 32-bit seeded PRNG.
 *
 * The whole match must be reproducible from `(seed, brainA, brainB)`, which is
 * what makes a headless balance run mean anything and what makes a replay a
 * replay. So there is exactly one source of entropy in the process and every
 * consumer — spawn jitter, the brains' `api.rand()` — draws from it.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A named stream, so one fighter drawing more numbers cannot shift the other's. */
export function streamFrom(seed, salt) {
  let h = seed >>> 0;
  for (let i = 0; i < salt.length; i++) h = (Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0);
  return mulberry32(h);
}
