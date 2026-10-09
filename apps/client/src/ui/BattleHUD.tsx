import { useEffect, useRef } from 'react';
import { FleetList } from './FleetList';
import { TimerBar } from './TimerBar';
import { STATUS_LABEL, formatSeconds, useTurnClock } from './useTurnClock';

interface BattleHUDProps {
  /** Reports the HUD's height so off-screen indicators stay clear of it. */
  onHeightChange?: (pixels: number) => void;
}

/** Compact mobile HUD: every ship's hull on the left, turn and countdown on the right. */
export function BattleHUD({ onHeightChange }: BattleHUDProps) {
  const { turn, status, planning, timed, remaining, low } = useTurnClock();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !onHeightChange) {
      return;
    }
    const report = () => onHeightChange(element.getBoundingClientRect().height);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return (
    <header
      ref={ref}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-1 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="pointer-events-auto rounded-2xl bg-ocean/80 px-3 py-1.5 shadow-lg backdrop-blur">
          <FleetList compact />
        </div>

        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-ocean/80 px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur">
          <span className="text-parchment">Turn {turn}</span>
          <span className="text-parchment/50">·</span>
          {planning && timed ? (
            <span
              className={`tabular-nums ${low ? 'text-hull' : 'text-parchment/80'}`}
            >
              ⏱ {formatSeconds(remaining)}
            </span>
          ) : planning ? (
            <span className="text-parchment/80">Planning</span>
          ) : (
            <span className="text-parchment/80">{STATUS_LABEL[status]}</span>
          )}
        </div>
      </div>

      <TimerBar className="mx-auto w-40" />
    </header>
  );
}
