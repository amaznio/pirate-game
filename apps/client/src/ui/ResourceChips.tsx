import { useGameUIStore } from '../store/useGameUIStore';
import { TOKEN_META, TOKEN_ORDER } from './tokenMeta';
import { CannonballChip } from './CannonballChip';

/**
 * Read-only view of what the player holds: movement tokens and cannonballs.
 * Deliberately not interactive, so moves can only be planned where the plan is
 * visible.
 */
export function ResourceChips() {
  const tokens = useGameUIStore((state) => state.tokens);
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
            {meta.label}
            <span className="tabular-nums opacity-90">×{tokens[action]}</span>
          </span>
        );
      })}
      <CannonballChip />
      {queuedMoves > 0 && (
        <span className="text-xs font-semibold text-parchment/70">
          {queuedMoves}/4 planned
        </span>
      )}
    </div>
  );
}
