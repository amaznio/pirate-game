import { cannonQueueCost } from '@pirate/game-core/domain/Ship';
import { useGameUIStore } from '../store/useGameUIStore';

/** Cannonballs held, queued this turn, and still free to queue. */
export function useAmmo(): { ammo: number; queued: number; remaining: number } {
  const ammo = useGameUIStore((state) => state.ammo);
  const queued = useGameUIStore((state) => cannonQueueCost(state.cannonQueue, state.cannonsPerSide));
  return { ammo, queued, remaining: ammo - queued };
}
