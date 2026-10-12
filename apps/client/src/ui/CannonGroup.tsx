import { useTranslation } from 'react-i18next';
import type { CannonSide } from '@pirate/game-core/domain/Action';
import { CannonToggle } from './CannonToggle';
import { cannonSideLabel } from './tokenMeta';

interface CannonGroupProps {
  side: CannonSide;
  phase: number;
  /** Cannons on this side of the ship: one toggle is drawn for each. */
  cannons: number;
  /** How many of them are set to fire. */
  shots: number;
  /** Cannonballs still free to queue. */
  available: number;
  canPlan: boolean;
  onChange: (shots: number) => void;
}

/**
 * One toggle per cannon on a side, the first nearest the move slot. Tapping a cannon that is off sets the side to
 * fire up to it (so tapping the third fires all three); tapping one that is on
 * lowers the side to fire only the cannons before it. Each cannon set to fire
 * costs a cannonball, so a toggle is out of reach when there are not enough.
 */
export function CannonGroup({ side, phase, cannons, shots, available, canPlan, onChange }: CannonGroupProps) {
  const { t } = useTranslation();
  const count = Math.max(1, cannons);
  const sideWord = cannonSideLabel(t, side);
  // The first cannon sits next to the move slot on both sides, so the left group
  // is drawn in reverse: the cannon nearest the centre is the first one loaded.
  const indices = Array.from({ length: count }, (_, index) => index);
  if (side === 'left') {
    indices.reverse();
  }
  return (
    <div
      className="flex shrink-0 items-center gap-0.5"
      role="group"
      aria-label={t('plan.cannonGroup', { side: sideWord, phase: phase + 1 })}
    >
      {indices.map((index) => {
        const active = index < shots;
        // Turning this cannon on also turns on the ones before it.
        const unaffordable = !active && index + 1 - shots > available;
        return (
          <CannonToggle
            key={index}
            small={count > 1}
            active={active}
            disabled={!canPlan || unaffordable}
            label={t('plan.cannonFire', {
              side: sideWord,
              cannon: index + 1,
              phase: phase + 1,
            })}
            onClick={() => onChange(active ? index : index + 1)}
          />
        );
      })}
    </div>
  );
}
