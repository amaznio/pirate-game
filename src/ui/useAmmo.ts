import { useGameUIStore } from '../store/useGameUIStore';

/** Cannonballs held, queued this turn, and still free to queue. */
export function useAmmo(): { ammo: number; queued: number; remaining: number } {
  const ammo = useGameUIStore((state) => state.ammo);
  const queued = useGameUIStore((state) =>
    state.cannonQueue.reduce(
      (total, slot) => total + (slot.left ? 1 : 0) + (slot.right ? 1 : 0),
      0,
    ),
  );
  return { ammo, queued, remaining: ammo - queued };
}
