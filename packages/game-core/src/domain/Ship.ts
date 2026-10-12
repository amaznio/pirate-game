import type { Entity, PlayerId, TeamId } from './Entity';
import type { Direction } from './Direction';
import type { CannonQueue } from './Action';

export type WeaponSide = 'left' | 'right';

export const WEAPON_SIDES: readonly WeaponSide[] = ['left', 'right'];

/**
 * A weapon mounted on a broadside. A side with several cannons has several
 * mounts; they all fire from the ship's own cell along the same line, one after
 * the other.
 */
export interface WeaponMount {
  readonly weaponTypeId: string;
  readonly side: WeaponSide;
}

/** How many cannons a ship has on each side. */
export interface CannonCounts {
  readonly left: number;
  readonly right: number;
}

/** What a classic one-cannon-a-side ship has, and what the client assumes before it knows. */
export const ONE_CANNON_A_SIDE: CannonCounts = { left: 1, right: 1 };

/** The mounts on one side, in firing order. */
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
 * Cannonballs a queued plan would spend: one per cannon it fires, never more
 * than the ship has on that side.
 */
export function cannonQueueCost(queue: CannonQueue, counts: CannonCounts): number {
  return queue.reduce(
    (total, slot) =>
      total +
      Math.min(Math.max(0, slot.left), counts.left) +
      Math.min(Math.max(0, slot.right), counts.right),
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
  /** Extra damage each cannon does, brought in from earlier battles. None when absent. */
  readonly bonusDamage?: number;
  /** The ship got clean away (it is out of the match with no hull left). None when absent. */
  readonly escaped?: boolean;
  /**
   * The ship is not on the board yet: it arrives at the start of this turn, and
   * until then it has no hull, so every rule ignores it. None when absent.
   */
  readonly arrivesOnTurn?: number;
}

export function isShip(entity: Entity): entity is Ship {
  return entity.kind === 'ship';
}
