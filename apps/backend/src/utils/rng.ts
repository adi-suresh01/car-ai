export type Rng = () => number;

export const createSeededRng = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    // LCG constants from Numerical Recipes
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
};

export const normalizeSeed = (seed?: number): number => {
  if (seed === undefined || !Number.isFinite(seed)) {
    return Math.floor(Math.random() * 1_000_000);
  }
  return Math.floor(seed) >>> 0;
};
