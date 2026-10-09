/**
 * A tiny seeded random number generator for the AI. The same match, turn and
 * player always give the same sequence, so an AI's "mistakes" are repeatable
 * (and testable) instead of changing from run to run.
 */

/** FNV-1a: turns the inputs into one 32-bit number. */
function hash(seed: number, turn: number, playerId: string): number {
  let value = 2166136261;
  const text = `${seed}:${turn}:${playerId}`;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Returns a function giving numbers in [0, 1). (mulberry32) */
export function createRng(seed: number, turn: number, playerId: string): () => number {
  let state = hash(seed, turn, playerId);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
