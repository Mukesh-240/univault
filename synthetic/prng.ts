/** Seeded PRNG (mulberry32). The generator must never use Math.random: same seed -> same dataset. */
export interface Rng {
  next(): number;                       // [0, 1)
  int(min: number, max: number): number; // inclusive
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(xs: readonly T[]): T[];
  digits(n: number): string;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next, int,
    pick: (xs) => xs[int(0, xs.length - 1)],
    chance: (p) => next() < p,
    shuffle: (xs) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) { const j = int(0, i); [out[i], out[j]] = [out[j], out[i]]; }
      return out;
    },
    digits: (n) => Array.from({ length: n }, () => String(int(0, 9))).join(""),
  };
}
