/**
 * Counts wrong guesses so that a connection cannot try codes in bulk. After
 * `max` misses inside `windowMs` it refuses further tries until the oldest has
 * aged out. The clock is a parameter so tests need not wait.
 */
export class AttemptLimiter {
  private readonly misses: number[] = [];

  constructor(
    private readonly max = 8,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** True while this connection has used up its wrong guesses. */
  blocked(): boolean {
    this.forget();
    return this.misses.length >= this.max;
  }

  /** Records a wrong guess. */
  miss(): void {
    this.forget();
    this.misses.push(this.now());
  }

  private forget(): void {
    const cutoff = this.now() - this.windowMs;
    while (this.misses.length > 0 && this.misses[0] <= cutoff) {
      this.misses.shift();
    }
  }
}
