import { useTranslation } from 'react-i18next';
import { useGameUIStore } from '../store/useGameUIStore';
import { TOKEN_META, tokenLabel } from './tokenMeta';
import { CannonGroup } from './CannonGroup';
import { useAmmo } from './useAmmo';

/**
 * The four phase rows: a movement slot flanked by a cannonball toggle for the
 * left and right broadside. Movement and cannon are independent queues that
 * line up per phase.
 *
 * Tapping an empty movement slot selects it, so a later token can be placed
 * there and earlier slots left empty (e.g. move, empty, move, move).
 */
export function PlannedMoves() {
  const { t } = useTranslation();
  const queue = useGameUIStore((state) => state.queue);
  const cannonQueue = useGameUIStore((state) => state.cannonQueue);
  const canPlan = useGameUIStore((state) => state.canPlan);
  const activeSlot = useGameUIStore((state) => state.activeSlot);
  const setActiveSlot = useGameUIStore((state) => state.setActiveSlot);
  const removePlayerAction = useGameUIStore((state) => state.removePlayerAction);
  const setCannonShots = useGameUIStore((state) => state.setCannonShots);

  const available = useAmmo().remaining;
  const perSide = useGameUIStore((state) => state.cannonsPerSide);

  return (
    <ol className="flex flex-col gap-1">
      {queue.map((slot, index) => {
        const meta = slot ? TOKEN_META[slot] : null;
        const cannon = cannonQueue[index] ?? { left: 0, right: 0 };
        const armed = activeSlot === index;

        return (
          <li key={index} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5">
            <CannonGroup
              side="left"
              phase={index}
              cannons={perSide.left}
              shots={cannon.left}
              available={available}
              canPlan={canPlan}
              onChange={(shots) => setCannonShots(index, 'left', shots)}
            />

            <button
              type="button"
              disabled={!canPlan}
              aria-label={
                slot
                  ? t('plan.removeFrom', { token: tokenLabel(t, slot), phase: index + 1 })
                  : t('plan.chooseFor', { phase: index + 1 })
              }
              onClick={() => {
                if (slot) {
                  removePlayerAction(index);
                } else {
                  setActiveSlot(armed ? null : index);
                }
              }}
              className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition active:scale-[0.99] disabled:cursor-not-allowed ${
                meta
                  ? `${meta.bgClass} border-white/20 text-white`
                  : armed
                    ? 'border-token-forward bg-token-forward/15 text-parchment'
                    : 'border-parchment/25 bg-black/20 text-parchment/60'
              }`}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/30 text-xs font-bold">
                {index + 1}
              </span>
              <span className="text-lg leading-none" aria-hidden>
                {meta ? meta.arrow : '＋'}
              </span>
              <span className="min-w-0 truncate text-sm font-semibold">
                {slot ? tokenLabel(t, slot) : armed ? t('plan.tapToken') : t('plan.empty')}
              </span>
              {meta && (
                <span
                  className="ml-auto shrink-0 text-base leading-none opacity-70"
                  title={t('plan.tapToRemove')}
                  aria-hidden
                >
                  ×
                </span>
              )}
            </button>

            <CannonGroup
              side="right"
              phase={index}
              cannons={perSide.right}
              shots={cannon.right}
              available={available}
              canPlan={canPlan}
              onChange={(shots) => setCannonShots(index, 'right', shots)}
            />
          </li>
        );
      })}
    </ol>
  );
}
