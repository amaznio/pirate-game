import { describe, expect, it } from 'vitest';
import { AttemptLimiter } from './attempts';

describe('AttemptLimiter', () => {
  const clock = () => {
    let now = 1_000_000;
    return { now: () => now, advance: (ms: number) => (now += ms) };
  };

  it('allows guesses until the limit is reached', () => {
    const time = clock();
    const limiter = new AttemptLimiter(3, 60_000, time.now);

    expect(limiter.blocked()).toBe(false);
    limiter.miss();
    limiter.miss();
    expect(limiter.blocked()).toBe(false);
    limiter.miss();
    expect(limiter.blocked()).toBe(true);
  });

  it('lets old misses age out', () => {
    const time = clock();
    const limiter = new AttemptLimiter(2, 60_000, time.now);
    limiter.miss();
    limiter.miss();
    expect(limiter.blocked()).toBe(true);

    time.advance(59_999);
    expect(limiter.blocked()).toBe(true);
    time.advance(2);
    expect(limiter.blocked()).toBe(false);
  });

  it('unblocks one guess at a time as the oldest ages out', () => {
    const time = clock();
    const limiter = new AttemptLimiter(2, 60_000, time.now);
    limiter.miss();
    time.advance(30_000);
    limiter.miss();
    expect(limiter.blocked()).toBe(true);

    time.advance(30_001); // the first miss is gone, the second is not
    expect(limiter.blocked()).toBe(false);
    limiter.miss();
    expect(limiter.blocked()).toBe(true);
  });

  it('starts with no misses', () => {
    expect(new AttemptLimiter().blocked()).toBe(false);
  });
});
