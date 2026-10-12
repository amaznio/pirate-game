import { useTranslation } from 'react-i18next';
import { ACTIONS_PER_TURN } from '@pirate/game-core/domain/Action';
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
          <span
            key={action}
            className={`${meta.bgClass} flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold text-white`}
          >
            <span aria-hidden>{meta.arrow}</span>
            {tokenLabel(t, action)}
            <span className="tabular-nums opacity-90">×{tokens[action]}</span>
          </span>
        );
      })}
      {tokenCap !== null && (
        <span
          title={t('plan.holdFull')}
          className={`rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
            held >= tokenCap ? 'bg-amber-600 text-white' : 'bg-black/25 text-parchment/80'
          }`}
        >
          {held}/{tokenCap}
        </span>
      )}
      <CannonballChip />
      {queuedMoves > 0 && (
        <span className="text-xs font-semibold text-parchment/70">
          {t('plan.planned', { queued: queuedMoves, total: ACTIONS_PER_TURN })}
        </span>
      )}
    </div>
  );
}
