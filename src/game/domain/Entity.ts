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

/** Identity of a participant (a human or an AI) in a match. */
export type PlayerId = string;

/**
 * Players on the same team never damage each other when friendly fire is off,
 * and a team wins when it is the last one with a ship afloat. Free-for-all is
 * simply every player on their own team.
 */
export type TeamId = string;
