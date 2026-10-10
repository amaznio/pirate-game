/** A fresh random seed for a new match: a 32-bit unsigned integer. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296);
}
