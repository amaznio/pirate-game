import type { Entity, PlayerId, TeamId } from './Entity';
import type { Direction } from './Direction';
import type { CannonQueue } from './Action';

export type WeaponSide = 'left' | 'right';

export const WEAPON_SIDES: readonly WeaponSide[] = ['left', 'right'];

/**
 * A weapon mounted on a broadside. `lane` is how many cells along the ship's
 * heading the shot starts from: 0 is the ship's own cell (abeam), +1 one cell
 * ahead (fore), -1 one cell astern (aft). It defaults to 0.
 */
export interface WeaponMount {
  readonly weaponTypeId: string;
  readonly side: WeaponSide;
  readonly lane?: number;
}

/** How many cannons a ship has on each side. */
export interface CannonCounts {
  readonly left: number;
  readonly right: number;
}

/** What a classic one-cannon-a-side ship has, and what the client assumes before it knows. */
export const ONE_CANNON_A_SIDE: CannonCounts = { left: 1, right: 1 };

/** The mounts on one side, in firing order (the order they were built in). */
export function mountsOnSide(
  ship: Pick<Ship, 'weapons'>,
  side: WeaponSide,
): readonly WeaponMount[] {
  return ship.weapons.filter((weapon) => weapon.side === side);
}

export function cannonCountsOf(ship: Pick<Ship, 'weapons'>): CannonCounts {
  return {
    left: mountsOnSide(ship, 'left').length,
    right: mountsOnSide(ship, 'right').length,
  };
}

/**
 * Cannonballs a queued plan would spend: one per cannon on every broadside it
 * fires, so a three-cannon side costs three.
 */
export function cannonQueueCost(queue: CannonQueue, counts: CannonCounts): number {
  return queue.reduce(
    (total, slot) =>
      total + (slot.left ? counts.left : 0) + (slot.right ? counts.right : 0),
    0,
  );
}

/** A ship is an entity with a heading, hull integrity and weapons. */
export interface Ship extends Entity {
  readonly kind: 'ship';
  /** The player who commands this ship (one ship per player). */
  readonly ownerId: PlayerId;
  readonly teamId: TeamId;
  readonly shipTypeId: string;
  readonly heading: Direction;
  readonly hp: number;
  readonly maxHp: number;
  readonly weapons: readonly WeaponMount[];
}

export function isShip(entity: Entity): entity is Ship {
  return entity.kind === 'ship';
}
