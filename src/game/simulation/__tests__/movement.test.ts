import { describe, expect, it } from 'vitest';
import type { Direction } from '../../domain/Direction';
import { pos } from '../../domain/Position';
import {
  getForwardPosition,
  getLeftTurnResult,
  getRightTurnResult,
  resolveActionTarget,
} from '../movement';
import { resolveTurn } from '../resolveTurn';
import {
  cannon,
  defaultEnemy,
  defaultPlayer,
  gameWith,
  rock,
  submitted,
} from './testUtils';

const FORWARD_CASES: Array<{
  heading: Direction;
  expected: { x: number; y: number };
}> = [
  { heading: 'NORTH', expected: { x: 10, y: 9 } },
  { heading: 'EAST', expected: { x: 11, y: 10 } },
  { heading: 'SOUTH', expected: { x: 10, y: 11 } },
  { heading: 'WEST', expected: { x: 9, y: 10 } },
];

describe('forward movement', () => {
  it.each(FORWARD_CASES)(
    'moves one cell $heading',
    ({ heading, expected }) => {
      expect(getForwardPosition(pos(10, 10), heading)).toEqual(expected);
      expect(resolveActionTarget(pos(10, 10), heading, 'FORWARD')).toEqual({
        heading,
        position: expected,
      });
    },
  );
});

describe('turning movement (rotate then advance)', () => {
  it('turns left and advances in the new heading', () => {
    const result = getLeftTurnResult(pos(10, 10), 'NORTH');
    expect(result).toEqual({ heading: 'WEST', position: { x: 9, y: 10 } });
  });

  it('turns right and advances in the new heading', () => {
    const result = getRightTurnResult(pos(10, 10), 'NORTH');
    expect(result).toEqual({ heading: 'EAST', position: { x: 11, y: 10 } });
  });

  it('does not rotate in place', () => {
    const result = resolveActionTarget(pos(10, 10), 'NORTH', 'TURN_RIGHT');
    expect(result.position).not.toEqual(pos(10, 10));
  });
});

describe('blocking', () => {
  it('blocks movement at the board edge', () => {
    const player = defaultPlayer({
      position: pos(0, 0),
      heading: 'NORTH',
      weapons: [],
    });
    const state = gameWith(player, defaultEnemy());
    const result = resolveTurn(state, submitted(['FORWARD']));

    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'SHIP_BLOCKED',
        shipId: 'player-ship',
      }),
    );
    expect(result.nextState.ships['player-ship'].position).toEqual(pos(0, 0));
  });

  it('blocks movement into an obstacle', () => {
    const player = defaultPlayer({
      position: pos(7, 9),
      heading: 'SOUTH',
      weapons: [],
    });
    const state = gameWith(player, defaultEnemy(), [rock('rock-x', 7, 10)]);
    const result = resolveTurn(state, submitted(['FORWARD']));

    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'SHIP_BLOCKED', shipId: 'player-ship' }),
    );
    expect(result.nextState.ships['player-ship'].position).toEqual(pos(7, 9));
  });
});

describe('four-phase resolution order', () => {
  it('resolves phases 0..3 in order and applies each action', () => {
    const player = defaultPlayer({
      position: pos(10, 10),
      heading: 'NORTH',
      weapons: [],
    });
    const state = gameWith(player, defaultEnemy({ weapons: [] }));

    const result = resolveTurn(
      state,
      submitted(['FORWARD', 'FORWARD', 'FORWARD', 'FORWARD']),
    );

    expect(result.phases.map((phase) => phase.index)).toEqual([0, 1, 2, 3]);

    const phaseStarts = result.events
      .filter((event) => event.type === 'PHASE_STARTED')
      .map((event) => (event as { phase: number }).phase);
    expect(phaseStarts).toEqual([0, 1, 2, 3]);

    const moved = result.events.filter(
      (event) => event.type === 'SHIP_MOVED',
    ) as Array<{ shipId: string; to: { x: number; y: number } }>;
    expect(moved.map((event) => event.to)).toEqual([
      { x: 10, y: 9 },
      { x: 10, y: 8 },
      { x: 10, y: 7 },
      { x: 10, y: 6 },
    ]);
    expect(result.nextState.ships['player-ship'].position).toEqual(pos(10, 6));
  });
});

describe('determinism', () => {
  it('produces identical results for identical input', () => {
    const player = defaultPlayer({ position: pos(10, 10), heading: 'NORTH' });
    const enemy = defaultEnemy({ position: pos(10, 6), heading: 'SOUTH' });
    const state = gameWith(player, enemy);

    const makeActions = () =>
      submitted(
        ['FORWARD', 'TURN_LEFT', 'FORWARD', 'FORWARD'],
        [cannon(true, false), cannon(false, false), cannon(false, true), cannon(false, false)],
        ['FORWARD', 'FORWARD', 'TURN_RIGHT', 'FORWARD'],
        [cannon(false, false), cannon(false, false), cannon(false, false), cannon(false, false)],
      );

    const first = resolveTurn(state, makeActions());
    const second = resolveTurn(state, makeActions());

    expect(second.nextState).toEqual(first.nextState);
    expect(second.events).toEqual(first.events);
    expect(second.phases).toEqual(first.phases);
  });
});
