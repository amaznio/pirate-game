import type { Position } from './Position';

/** Stable identity for anything that lives on the board. */
export type EntityId = string;

export type EntityKind = 'ship' | 'rock' | 'island';

/** Anything occupying a grid cell with an identity. */
export interface Entity {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly position: Position;
}

export type Side = 'player' | 'enemy';

export function otherSide(side: Side): Side {
  return side === 'player' ? 'enemy' : 'player';
}
