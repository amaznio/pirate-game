import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { usePreviewSettings } from '../store/previewSettings';
import { FleetList } from './FleetList';
import { PlanningControls } from './PlanningControls';
import { ObjectiveBanner } from './ObjectiveBanner';
import { SeaLegend } from './SeaLegend';
import { TurnTimer } from './TurnTimer';
import { statusLabel, useTurnClock } from './useTurnClock';

const SHORTCUTS = [
  { keys: '1 2 3', labelKey: 'hud.shortcuts.moves' },
  { keys: 'Q  E', labelKey: 'hud.shortcuts.fire' },
  { keys: 'Backspace', labelKey: 'hud.shortcuts.remove' },
  { keys: 'C', labelKey: 'hud.shortcuts.clear' },
  { keys: 'Enter', labelKey: 'hud.shortcuts.lockIn' },
  { keys: 'P', labelKey: 'hud.shortcuts.preview' },
] as const;

/** Right-hand column for wide screens: status, then the full planning UI. */
export function DesktopSidebar() {
  const { t } = useTranslation();
  const { turn, status, planning, timed } = useTurnClock();
  const showPreview = usePreviewSettings((state) => state.showPlanPreview);
  const setShowPreview = usePreviewSettings((state) => state.setShowPlanPreview);

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-card text-card-foreground">
      <div className="flex flex-col gap-3 border-b border-border px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between">
          <h1 className="font-head text-xl font-bold tracking-wide">{t('app.title')}</h1>
          <span className="text-sm font-bold">
            {t('hud.turn', { turn })}
            {!(planning && timed) && <> · {planning ? t('status.planning') : statusLabel(t, status)}</>}
          </span>
        </div>
        <TurnTimer />
        <ObjectiveBanner />
        <FleetList />
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        <PlanningControls />

        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-bold">
            {t('hud.showPreview')}
            <Switch checked={showPreview} onCheckedChange={setShowPreview} />
          </label>
          <SeaLegend className="border-b border-border pb-2" />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex gap-1.5">
                <dt className="font-bold text-foreground">{shortcut.keys}</dt>
                <dd>{t(shortcut.labelKey)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </aside>
  );
}
