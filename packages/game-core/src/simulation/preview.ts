import type { GameState } from '../domain/GameState';
import type { PlayerId } from '../domain/Entity';
import type { Direction } from '../domain/Direction';
import type { Position } from '../domain/Position';
import type { WeaponSide } from '../domain/Ship';
import { ACTIONS_PER_TURN } from '../domain/Action';
import { resolveTurn } from './resolveTurn';
import { getShipByOwner } from './selectors';

export type PreviewShotOutcome = 'miss' | 'ship' | 'obstacle';

export interface PreviewShot {
  readonly side: WeaponSide;
  readonly direction: Direction;
  readonly from: Position;
  readonly to: Position;
  readonly outcome: PreviewShotOutcome;
}

export interface PreviewStep {
  readonly phase: number;
  readonly position: Position;
  readonly heading: Direction;
  /** True when the planned move this phase was blocked (the ship stays put). */
  readonly blocked: boolean;
  /** True when the player queued a move in this phase. */
  readonly hasMove: boolean;
  readonly shots: readonly PreviewShot[];
}

export interface PlanPreview {
  readonly start: { readonly position: Position; readonly heading: Direction };
  readonly steps: readonly PreviewStep[];
}

/**
 * Dry-runs a player's queued plan through the real simulation with every
 * other ship standing still, so the preview can never disagree with the rules.
 * Pure: does not touch the controller or the given state.
 */
export function previewPlayerPlan(
  state: GameState,
  playerId: PlayerId,
): PlanPreview | null {
  const ship = getShipByOwner(state, playerId);
  const player = state.players[playerId];
  if (!ship || !player || ship.hp <= 0) {
    return null;
  }

  // Only this player's plan is submitted: every other ship stands still.
  const result = resolveTurn(state, {
    [playerId]: { movement: player.queue, cannons: player.cannonQueue },
  });

  let position = ship.position;
  let heading = ship.heading;
  const steps: PreviewStep[] = [];

  for (let phase = 0; phase < ACTIONS_PER_TURN; phase += 1) {
    let blocked = false;
    const shots: PreviewShot[] = [];
    const events = result.phases[phase]?.events ?? [];

    for (const event of events) {
      if (!('shipId' in event) || event.shipId !== ship.id) {
        continue;
      }
      switch (event.type) {
        case 'SHIP_MOVED':
          position = event.to;
          heading = event.heading;
          break;
        case 'SHIP_TURNED':
          heading = event.to;
          break;
        case 'SHIP_PUSHED':
          position = event.to;
          break;
        case 'SHIP_SPUN':
          position = event.to;
          heading = event.toHeading;
          break;
        case 'SHIP_BLOCKED':
          blocked = true;
          break;
        case 'PROJECTILE_MISSED':
          shots.push({
            side: event.side,
            direction: event.direction,
            from: event.from,
            to: event.to,
            outcome: 'miss',
          });
          break;
        case 'PROJECTILE_HIT': {
          shots.push({
            side: event.side,
            direction: directionBetween(event.from, event.to),
            from: event.from,
            to: event.to,
            outcome: event.targetKind === 'ship' ? 'ship' : 'obstacle',
          });
          break;
        }
        default:
          break;
      }
    }

    steps.push({
      phase,
      position,
      heading,
      blocked,
      hasMove: player.queue[phase] !== null,
      shots,
    });
  }

  return {
    start: { position: ship.position, heading: ship.heading },
    steps,
  };
}

function directionBetween(from: Position, to: Position): Direction {
  if (to.x > from.x) return 'EAST';
  if (to.x < from.x) return 'WEST';
  return to.y > from.y ? 'SOUTH' : 'NORTH';
}
