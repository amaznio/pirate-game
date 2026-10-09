import { useTurnClock } from './useTurnClock';

/** Thin planning countdown bar; renders nothing outside planning. */
export function TimerBar({ className = '' }: { className?: string }) {
  const { planning, low, fraction } = useTurnClock();
  if (!planning) {
    return null;
  }
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-black/40 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
          low ? 'bg-hull' : 'bg-token-forward'
        }`}
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}
