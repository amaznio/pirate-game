/**
 * A tiny seeded random number generator. The same seed and salt always give
 * the same sequence, so a run's map is the same every time it is built from
 * its seed (and testable).
 */

/** FNV-1a: turns the inputs into one 32-bit number. */
function hash(seed: number, salt: readonly (number | string)[]): number {
  let value = 2166136261;
  const text = `${seed}:${salt.join(':')}`;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Returns a function giving numbers in [0, 1). (mulberry32) */
export function createRng(seed: number, ...salt: readonly (number | string)[]): () => number {
  let state = hash(seed, salt);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number from `min` to `max`, both included. */
export function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One item picked by weight; the weights need not add up to anything in particular. */
export function pickWeighted<T>(rng: () => number, items: ReadonlyArray<{ item: T; weight: number }>): T {
  const total = items.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) {
    throw new Error('pickWeighted needs at least one item with a positive weight');
  }
  let roll = rng() * total;
  for (const entry of items) {
    roll -= Math.max(0, entry.weight);
    if (roll < 0) {
      return entry.item;
    }
  }
  // Floating point can leave a hair of roll over: give the last real item.
  return items[items.length - 1]!.item;
}
