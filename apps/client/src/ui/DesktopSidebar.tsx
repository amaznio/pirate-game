import { usePreviewSettings } from '../store/previewSettings';
import { FleetList } from './FleetList';
import { PlanningControls } from './PlanningControls';
import { SeaLegend } from './SeaLegend';
import { TimerBar } from './TimerBar';
import { STATUS_LABEL, formatSeconds, useTurnClock } from './useTurnClock';

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
  const { turn, status, planning, timed, remaining, low } = useTurnClock();
  const showPreview = usePreviewSettings((state) => state.showPlanPreview);
  const setShowPreview = usePreviewSettings((state) => state.setShowPlanPreview);

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-parchment/20 bg-ocean text-parchment">
      <div className="flex flex-col gap-3 border-b border-parchment/15 px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-black tracking-wide">Battle Navigation</h1>
          <span className="text-sm font-semibold tabular-nums">
            Turn {turn} ·{' '}
            {planning && timed ? (
              <span className={low ? 'text-hull' : ''}>
                ⏱ {formatSeconds(remaining)}
              </span>
            ) : planning ? (
              'Planning'
            ) : (
              STATUS_LABEL[status]
            )}
          </span>
        </div>
        <TimerBar />
        <FleetList />
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
        <SeaLegend className="border-b border-parchment/10 pb-2" />
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
