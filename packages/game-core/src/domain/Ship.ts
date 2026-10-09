import type { Entity, PlayerId, TeamId } from './Entity';
import type { Direction } from './Direction';

export type WeaponSide = 'left' | 'right';

export const WEAPON_SIDES: readonly WeaponSide[] = ['left', 'right'];

/** A weapon mounted on a broadside. */
export interface WeaponMount {
  readonly weaponTypeId: string;
  readonly side: WeaponSide;
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
