import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useGameUIStore } from '../store/useGameUIStore';
import { CannonballChip } from './CannonballChip';
import { AutoTokenSwitch, NextTokenChoice } from './NextTokenControl';
import { PlanningControls } from './PlanningControls';
import { ResourceChips } from './ResourceChips';

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
  const { t } = useTranslation();
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
        className="absolute inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-card-foreground backdrop-blur"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {spectating ? (
            <p className="flex-1 text-center text-sm font-bold">{t('hud.sunkWatching')}</p>
          ) : (
            <ResourceChips />
          )}
          {!spectating && (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto shrink-0"
                disabled={!canPlan}
                onClick={lockIn}
              >
                {lockedIn ? t('hud.locked') : hasPlan ? t('hud.lockIn') : t('hud.pass')}
              </Button>
              <Button
                size="sm"
                className="shrink-0"
                disabled={!planning}
                onClick={() => setPanelOpen(true)}
              >
                {t('hud.plan')} <ChevronUp aria-hidden />
              </Button>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      className="absolute inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-tile border-t-2 border-border bg-card px-4 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-card-foreground shadow-2xl backdrop-blur"
    >
      <div className="mx-auto max-w-xl">
        <div className="mb-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            aria-label={t('hud.hide')}
            className="flex min-h-11 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            <ChevronDown className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="font-head text-lg font-bold">{t('hud.battlePlan')}</h2>
          </button>
          <AutoTokenSwitch />
          <CannonballChip />
        </div>
        <div className="mb-2 empty:hidden">
          <NextTokenChoice />
        </div>
        <PlanningControls compact />
      </div>
    </section>
  );
}
