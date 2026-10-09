import { useEffect, useState } from 'react';

/**
 * Returns the number of seconds remaining until `deadline`, ticking while a
 * deadline is set. Purely presentational: the controller owns the authoritative
 * timer and the auto lock-in.
 */
export function useCountdown(deadline: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline === null) {
      return;
    }
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);

  if (deadline === null) {
    return 0;
  }
  return Math.max(0, (deadline - now) / 1000);
}
