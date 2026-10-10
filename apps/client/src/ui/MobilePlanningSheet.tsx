import { useEffect, useRef } from 'react';
import { useGameUIStore } from '../store/useGameUIStore';
import { PlanningControls } from './PlanningControls';
import { SeaLegend } from './SeaLegend';
import { ResourceChips } from './ResourceChips';
import { TimerBar } from './TimerBar';

interface MobilePlanningSheetProps {
  /** Reports the sheet's height so the camera can centre above it. */
  onHeightChange: (pixels: number) => void;
}

/**
 * Bottom planning UI. Collapsed it is a read-only strip of what you hold, so
 * moves can only be chosen where the plan itself is visible. Expanded (only
 * while planning) it is a compact sheet that overlays the board.
 */
export function MobilePlanningSheet({ onHeightChange }: MobilePlanningSheetProps) {
  const panelOpen = useGameUIStore((state) => state.panelOpen);
  const setPanelOpen = useGameUIStore((state) => state.setPanelOpen);
  const status = useGameUIStore((state) => state.status);
  const hasPlan = useGameUIStore(
    (state) =>
      state.queue.some((slot) => slot !== null) ||
      state.cannonQueue.some((slot) => slot.left || slot.right),
  );
  const lockIn = useGameUIStore((state) => state.lockIn);

  const planning = status === 'planning';
  const canPlan = useGameUIStore((state) => state.canPlan);
  const lockedIn = useGameUIStore((state) => state.lockedIn);
  const spectating = useGameUIStore((state) => state.spectating);
  const expanded = planning && panelOpen && !spectating;
  const ref = useRef<HTMLElement>(null);

  // The element is re-created when switching between collapsed and expanded,
  // so re-observe whenever that changes.
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const report = () => onHeightChange(element.getBoundingClientRect().height);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeightChange, expanded]);

  if (!expanded) {
    return (
      <section
        ref={ref}
        className="absolute inset-x-0 bottom-0 z-30 border-t border-parchment/20 bg-ocean/90 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {spectating ? (
            <p className="flex-1 text-center text-sm font-semibold text-parchment">
              Your ship was sunk — watching the battle
            </p>
          ) : (
            <ResourceChips />
          )}
          {!spectating && (
            <>
            <button
              type="button"
              disabled={!canPlan}
              onClick={lockIn}
              className="ml-auto shrink-0 rounded-xl bg-parchment/15 px-3 py-2 text-sm font-bold text-parchment active:scale-95 disabled:opacity-40"
            >
              {lockedIn ? 'Locked' : hasPlan ? 'Lock In' : 'Pass'}
            </button>
            <button
              type="button"
              disabled={!planning}
              onClick={() => setPanelOpen(true)}
              className="shrink-0 rounded-xl bg-parchment px-3 py-2 text-sm font-bold text-ink shadow active:scale-95 disabled:opacity-40"
            >
              Plan <span aria-hidden>▴</span>
            </button>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      className="absolute inset-x-0 bottom-0 z-30 max-h-[60vh] overflow-y-auto rounded-t-2xl border-t border-parchment/25 bg-ocean/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur"
    >
      <div className="mx-auto max-w-xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-parchment">
            Battle Plan
          </h2>
          <TimerBar className="flex-1" />
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="rounded-lg bg-parchment/15 px-3 py-1 text-sm font-bold text-parchment active:scale-95"
          >
            Hide <span aria-hidden>▾</span>
          </button>
        </div>
        <PlanningControls />
        <SeaLegend className="mt-3 border-t border-parchment/10 pt-2" />
      </div>
    </section>
  );
}
