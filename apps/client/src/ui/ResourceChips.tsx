import { useTranslation } from 'react-i18next';
import { ACTIONS_PER_TURN } from '@pirate/game-core/domain/Action';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useGameUIStore } from '../store/useGameUIStore';
import { TOKEN_META, TOKEN_ORDER, tokenLabel } from './tokenMeta';
import { CannonballChip } from './CannonballChip';

/**
 * Read-only view of what the player holds: movement tokens and cannonballs.
 * Deliberately not interactive, so moves can only be planned where the plan is
 * visible.
 */
export function ResourceChips() {
  const { t } = useTranslation();
  const tokens = useGameUIStore((state) => state.tokens);
  const tokenCap = useGameUIStore((state) => state.tokenCap);
  const held = tokens.FORWARD + tokens.TURN_LEFT + tokens.TURN_RIGHT;
  const queuedMoves = useGameUIStore(
    (state) => state.queue.filter((slot) => slot !== null).length,
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {TOKEN_ORDER.map((action) => {
        const meta = TOKEN_META[action];
        return (
          <Badge key={action} className={cn(meta.bgClass, 'gap-1 text-ocean-deep')}>
            <span aria-hidden>{meta.arrow}</span>
            {tokenLabel(t, action)}
            <span className="tabular-nums">×{tokens[action]}</span>
          </Badge>
        );
      })}
      {tokenCap !== null && (
        <Badge
          title={t('plan.holdFull')}
          variant={held >= tokenCap ? 'default' : 'secondary'}
          className={cn('tabular-nums', held >= tokenCap && 'bg-gold text-ink')}
        >
          {held}/{tokenCap}
        </Badge>
      )}
      <CannonballChip />
      {queuedMoves > 0 && (
        <span className="text-xs font-bold text-muted-foreground">
          {t('plan.planned', { queued: queuedMoves, total: ACTIONS_PER_TURN })}
        </span>
      )}
    </div>
  );
}
