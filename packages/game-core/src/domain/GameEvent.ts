import type { Position } from './Position';
import type { Direction } from './Direction';
import type { EntityId, EntityKind } from './Entity';
import type { MovementAction } from './Action';
import type { WeaponSide } from './Ship';
import type { Outcome } from './GameState';
import type { Spin } from './Terrain';

export type ProjectileSide = WeaponSide;

/**
 * A typed, serialisable description of something that happened in the
 * simulation. Events only contain ids, coordinates and numbers so the Phaser
 * layer can animate them without recomputing any rules.
 */
export type GameEvent =
  | { type: 'TURN_STARTED'; turn: number }
  | { type: 'PHASE_STARTED'; phase: number }
  | {
      type: 'SHIP_MOVED';
      shipId: EntityId;
      from: Position;
      to: Position;
      heading: Direction;
      phase: number;
    }
  | {
      type: 'SHIP_TURNED';
      shipId: EntityId;
      from: Direction;
      to: Direction;
      phase: number;
    }
  | {
      type: 'SHIP_BLOCKED';
      shipId: EntityId;
      at: Position;
      heading: Direction;
      action: MovementAction;
      phase: number;
    }
  | {
      /** Wind carried the ship one cell (a row of wind gives several events). */
      type: 'SHIP_PUSHED';
      shipId: EntityId;
      from: Position;
      to: Position;
      direction: Direction;
      phase: number;
    }
  | {
      /**
       * A whirlpool carried the ship to the next cell of its ring and turned
       * it. `from` equals `to` when another ship kept it from moving.
       */
      type: 'SHIP_SPUN';
      shipId: EntityId;
      from: Position;
      to: Position;
      fromHeading: Direction;
      toHeading: Direction;
      spin: Spin;
      phase: number;
    }
  | {
      type: 'CANNON_BLOCKED';
      shipId: EntityId;
      side: ProjectileSide;
      reason: 'out_of_ammo';
      phase: number;
    }
  | {
      type: 'CANNON_FIRED';
      shipId: EntityId;
      side: ProjectileSide;
      direction: Direction;
      from: Position;
      weaponTypeId: string;
      range: number;
      phase: number;
    }
  | {
      type: 'PROJECTILE_HIT';
      shipId: EntityId;
      side: ProjectileSide;
      targetId: EntityId;
      targetKind: EntityKind;
      from: Position;
      to: Position;
      damage: number;
      phase: number;
    }
  | {
      type: 'PROJECTILE_MISSED';
      shipId: EntityId;
      side: ProjectileSide;
      from: Position;
      to: Position;
      direction: Direction;
      phase: number;
    }
  | {
      type: 'SHIP_DAMAGED';
      shipId: EntityId;
      amount: number;
      hp: number;
      maxHp: number;
      phase: number;
    }
  | { type: 'SHIP_DESTROYED'; shipId: EntityId; phase: number }
  | { type: 'PHASE_ENDED'; phase: number }
  | { type: 'TURN_ENDED'; turn: number }
  | { type: 'GAME_ENDED'; outcome: Outcome };

export type GameEventType = GameEvent['type'];
