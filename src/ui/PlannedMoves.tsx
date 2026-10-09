import { useGameUIStore } from '../store/useGameUIStore';
import { TOKEN_META } from './tokenMeta';
import { CannonToggle } from './CannonToggle';
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
  const queue = useGameUIStore((state) => state.queue);
  const cannonQueue = useGameUIStore((state) => state.cannonQueue);
  const status = useGameUIStore((state) => state.status);
  const activeSlot = useGameUIStore((state) => state.activeSlot);
  const setActiveSlot = useGameUIStore((state) => state.setActiveSlot);
  const removePlayerAction = useGameUIStore((state) => state.removePlayerAction);
  const toggleCannon = useGameUIStore((state) => state.toggleCannon);

  const planning = status === 'planning';
  const available = useAmmo().remaining;

  return (
    <ol className="flex flex-col gap-1">
      {queue.map((slot, index) => {
        const meta = slot ? TOKEN_META[slot] : null;
        const cannon = cannonQueue[index] ?? { left: false, right: false };
        const armed = activeSlot === index;
        const leftDisabled = !planning || (!cannon.left && available <= 0);
        const rightDisabled = !planning || (!cannon.right && available <= 0);

        return (
          <li key={index} className="flex items-center gap-2">
            <CannonToggle
              active={cannon.left}
              disabled={leftDisabled}
              label={`Fire left in phase ${index + 1}`}
              onClick={() => toggleCannon(index, 'left')}
            />

            <button
              type="button"
              disabled={!planning}
              onClick={() => {
                if (slot) {
                  removePlayerAction(index);
                } else {
                  setActiveSlot(armed ? null : index);
                }
              }}
              className={`flex flex-1 items-center gap-3 rounded-lg border px-3 py-1.5 text-left transition active:scale-[0.99] disabled:cursor-not-allowed ${
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
              <span className="text-sm font-semibold">
                {meta ? meta.label : armed ? 'Tap a token' : 'Empty'}
              </span>
              {meta && (
                <span className="ml-auto text-[10px] font-semibold uppercase opacity-80">
                  tap to remove
                </span>
              )}
            </button>

            <CannonToggle
              active={cannon.right}
              disabled={rightDisabled}
              label={`Fire right in phase ${index + 1}`}
              onClick={() => toggleCannon(index, 'right')}
            />
          </li>
        );
      })}
    </ol>
  );
}
