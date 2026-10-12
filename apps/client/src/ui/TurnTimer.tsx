import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatSeconds, useTurnClock } from './useTurnClock';

/**
 * The planning countdown: icon, digits and a bar. When time is low the bar
 * turns red and the word "Hurry" appears, so urgency is never colour alone.
 * Renders nothing outside planning or in a match with no timer.
 */
export function TurnTimer({
  className,
  lead,
}: {
  className?: string;
  /** Text on the same row before the clock, such as the turn number. */
  lead?: ReactNode;
}) {
  const { t } = useTranslation();
  const { planning, timed, remaining, low, fraction } = useTurnClock();
  if (!planning || !timed) {
    return null;
  }
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center gap-2">
        {lead}
        <Clock className="size-4 shrink-0" aria-hidden />
        <span className="text-base font-black tabular-nums">{formatSeconds(remaining)}</span>
        {low && <Badge variant="destructive">{t('hud.hurry')}</Badge>}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-background/60">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-200 ease-linear',
            low ? 'bg-hull-deep' : 'bg-token-forward',
          )}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}
