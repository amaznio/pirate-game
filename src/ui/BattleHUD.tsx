import { useGameUIStore } from '../store/useGameUIStore';
import { HullBar } from './ShipStatus';
import { TimerBar } from './TimerBar';
import { STATUS_LABEL, formatSeconds, useTurnClock } from './useTurnClock';

/** Compact mobile HUD: both hulls on the left, turn and countdown on the right. */
export function BattleHUD() {
  const hull = useGameUIStore((state) => state.hull);
  const maxHull = useGameUIStore((state) => state.maxHull);
  const others = useGameUIStore((state) => state.others);
  const { turn, status, planning, remaining, low } = useTurnClock();

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-1 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
      <div className="flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl bg-ocean/80 px-3 py-1.5 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="text-hull" aria-hidden>
              ♥
            </span>
            <HullBar hp={hull} maxHp={maxHull} />
            <span className="text-xs font-semibold tabular-nums text-parchment">
              {hull}/{maxHull}
            </span>
          </div>
          {others.map((other) => (
            <div
              key={other.playerId}
              className="flex items-center gap-2 opacity-80"
            >
              <span className="text-xs" aria-hidden>
                {other.ally ? '⚓' : '☠'}
              </span>
              <HullBar hp={other.hull} maxHp={other.maxHull} />
              <span className="text-xs font-semibold tabular-nums text-parchment">
                {other.hull}/{other.maxHull}
              </span>
            </div>
          ))}
        </div>

        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-ocean/80 px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur">
          <span className="text-parchment">Turn {turn}</span>
          <span className="text-parchment/50">·</span>
          {planning ? (
            <span
              className={`tabular-nums ${low ? 'text-hull' : 'text-parchment/80'}`}
            >
              ⏱ {formatSeconds(remaining)}
            </span>
          ) : (
            <span className="text-parchment/80">{STATUS_LABEL[status]}</span>
          )}
        </div>
      </div>

      <TimerBar className="mx-auto w-40" />
    </header>
  );
}
