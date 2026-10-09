import { useGameUIStore } from '../store/useGameUIStore';
import { HullBar } from './ShipStatus';
import { useCountdown } from './useCountdown';

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  resolving: 'Resolving',
  animating: 'Resolving',
  game_over: 'Battle over',
};

function formatSeconds(seconds: number): string {
  return `0:${Math.ceil(seconds).toString().padStart(2, '0')}`;
}

/** Minimal top HUD: hull on the left, turn/phase/countdown on the right. */
export function BattleHUD() {
  const hull = useGameUIStore((state) => state.hull);
  const maxHull = useGameUIStore((state) => state.maxHull);
  const turn = useGameUIStore((state) => state.turn);
  const status = useGameUIStore((state) => state.status);
  const deadline = useGameUIStore((state) => state.deadline);
  const turnDurationSeconds = useGameUIStore((state) => state.turnDurationSeconds);

  const remaining = useCountdown(status === 'planning' ? deadline : null);
  const planning = status === 'planning';
  const low = planning && remaining <= 10;

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-1 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
      <div className="flex items-center justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-ocean/80 px-3 py-1.5 shadow-lg backdrop-blur">
          <span className="text-hull" aria-hidden>
            ♥
          </span>
          <HullBar hp={hull} maxHp={maxHull} />
          <span className="text-xs font-semibold tabular-nums text-parchment">
            {hull}/{maxHull}
          </span>
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

      {planning && (
        <div className="mx-auto h-1 w-40 overflow-hidden rounded-full bg-black/40">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
              low ? 'bg-hull' : 'bg-token-forward'
            }`}
            style={{
              width: `${Math.min(100, (remaining / turnDurationSeconds) * 100)}%`,
            }}
          />
        </div>
      )}
    </header>
  );
}
