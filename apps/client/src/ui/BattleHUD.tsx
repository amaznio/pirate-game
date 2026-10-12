import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FleetList } from './FleetList';
import { ObjectiveBanner } from './ObjectiveBanner';
import { TurnTimer } from './TurnTimer';
import { statusLabel, useTurnClock } from './useTurnClock';

interface BattleHUDProps {
  /** Reports the HUD's height so off-screen indicators stay clear of it. */
  onHeightChange?: (pixels: number) => void;
}

/** Compact mobile HUD: every ship's hull on the left, turn and countdown on the right. */
export function BattleHUD({ onHeightChange }: BattleHUDProps) {
  const { t } = useTranslation();
  const { turn, status, planning, timed } = useTurnClock();
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
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-1.5 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="pointer-events-auto rounded-card bg-card/90 px-3 py-1.5 text-card-foreground shadow-lg backdrop-blur">
          <FleetList compact />
        </div>

        <div className="pointer-events-auto flex min-w-28 flex-col gap-1 rounded-card bg-card/90 px-3 py-1.5 text-card-foreground shadow-lg backdrop-blur">
          {planning && timed ? (
            <TurnTimer lead={<span className="text-sm font-bold">{t('hud.turn', { turn })}</span>} />
          ) : (
            <span className="text-sm font-bold">
              {t('hud.turn', { turn })}
              <span className="text-muted-foreground">
                {' \u00b7 '}
                {planning ? t('status.planning') : statusLabel(t, status)}
              </span>
            </span>
          )}
        </div>
      </div>

      <ObjectiveBanner className="pointer-events-auto mx-auto bg-card/90 py-1 text-xs backdrop-blur" />
    </header>
  );
}
