import { useGameUIStore } from '../store/useGameUIStore';
import { usePreviewSettings } from '../store/previewSettings';
import { HullBar } from './ShipStatus';
import { PlanningControls } from './PlanningControls';
import { TimerBar } from './TimerBar';
import { STATUS_LABEL, formatSeconds, useTurnClock } from './useTurnClock';

function HullRow({ label, hp, maxHp }: { label: string; hp: number; maxHp: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 truncate text-xs font-bold uppercase tracking-wide text-parchment/70">
        {label}
      </span>
      <HullBar hp={hp} maxHp={maxHp} />
      <span className="ml-auto text-sm font-semibold tabular-nums">
        {hp}/{maxHp}
      </span>
    </div>
  );
}

const SHORTCUTS: ReadonlyArray<[string, string]> = [
  ['1 2 3', 'Left / Forward / Right'],
  ['Q  E', 'Fire left / right'],
  ['Backspace', 'Remove last move'],
  ['C', 'Clear plan'],
  ['Enter', 'Lock in'],
  ['P', 'Plan preview'],
];

/** Right-hand column for wide screens: status, then the full planning UI. */
export function DesktopSidebar() {
  const hull = useGameUIStore((state) => state.hull);
  const maxHull = useGameUIStore((state) => state.maxHull);
  const others = useGameUIStore((state) => state.others);
  const { turn, status, planning, remaining, low } = useTurnClock();
  const showPreview = usePreviewSettings((state) => state.showPlanPreview);
  const setShowPreview = usePreviewSettings((state) => state.setShowPlanPreview);

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-parchment/20 bg-ocean text-parchment">
      <div className="flex flex-col gap-3 border-b border-parchment/15 px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-black tracking-wide">Battle Navigation</h1>
          <span className="text-sm font-semibold tabular-nums">
            Turn {turn} ·{' '}
            {planning ? (
              <span className={low ? 'text-hull' : ''}>
                ⏱ {formatSeconds(remaining)}
              </span>
            ) : (
              STATUS_LABEL[status]
            )}
          </span>
        </div>
        <TimerBar />
        <HullRow label="You" hp={hull} maxHp={maxHull} />
        {others.map((other) => (
          <HullRow
            key={other.playerId}
            label={
              others.length === 1 && !other.ally ? 'Enemy' : other.playerId
            }
            hp={other.hull}
            maxHp={other.maxHull}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <PlanningControls />
      </div>

      <div className="flex flex-col gap-2 border-t border-parchment/15 px-5 py-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={showPreview}
            onChange={(event) => setShowPreview(event.target.checked)}
            className="h-4 w-4 accent-token-forward"
          />
          Show plan preview on board
        </label>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-parchment/60">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys} className="flex gap-1.5">
              <dt className="font-bold text-parchment/80">{keys}</dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
