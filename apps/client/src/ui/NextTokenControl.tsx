import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useGameUIStore } from '../store/useGameUIStore';
import { TOKEN_META, TOKEN_ORDER, tokenLabel } from './tokenMeta';

/** The Auto switch for the token the next turn will give you. Choosing by hand is `NextTokenChoice`. */
export function AutoTokenSwitch() {
  const { t } = useTranslation();
  const auto = useGameUIStore((state) => state.auto);
  const setAuto = useGameUIStore((state) => state.setAuto);
  const planning = useGameUIStore((state) => state.status === 'planning');
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-bold">
      {t('plan.autoToken')}
      <Switch
        checked={auto}
        disabled={!planning}
        onCheckedChange={setAuto}
        aria-label={t('plan.nextToken')}
      />
    </label>
  );
}

/**
 * Which token the next turn gives you, picked by hand. Shown only when Auto is
 * off, as a captioned row of arrow buttons so it cannot be mistaken for the
 * tokens you hold (the big buttons below it).
 */
export function NextTokenChoice() {
  const { t } = useTranslation();
  const auto = useGameUIStore((state) => state.auto);
  const requested = useGameUIStore((state) => state.requested);
  const setRequested = useGameUIStore((state) => state.setRequested);
  const planning = useGameUIStore((state) => state.status === 'planning');
  if (auto) {
    return null;
  }
  return (
    <div
      role="group"
      aria-label={t('plan.nextTurnYouGet')}
      className="flex items-center gap-2 rounded-btn bg-background/40 px-3 py-1"
    >
      <span className="min-w-0 flex-1 text-xs font-bold text-muted-foreground">
        {t('plan.nextTurnYouGet')}
      </span>
      {TOKEN_ORDER.map((action) => {
        const meta = TOKEN_META[action];
        const selected = requested === action;
        return (
          <button
            key={action}
            type="button"
            disabled={!planning}
            aria-pressed={selected}
            aria-label={tokenLabel(t, action)}
            title={tokenLabel(t, action)}
            onClick={() => setRequested(action)}
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-xl font-bold outline-none transition focus-visible:ring-[3px] focus-visible:ring-ring active:scale-95 disabled:opacity-40',
              meta.borderClass,
              selected ? `${meta.bgClass} text-ocean-deep` : `bg-transparent ${meta.textClass}`,
            )}
          >
            <span aria-hidden>{meta.arrow}</span>
          </button>
        );
      })}
    </div>
  );
}
