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

describe('turning movement (diagonal step)', () => {
  it('turns left: forward one, left one, heading rotated left', () => {
    const result = getLeftTurnResult(pos(10, 10), 'NORTH');
    expect(result).toEqual({ heading: 'WEST', position: { x: 9, y: 9 } });
  });

  it('turns right: forward one, right one, heading rotated right', () => {
    const result = getRightTurnResult(pos(10, 10), 'NORTH');
    expect(result).toEqual({ heading: 'EAST', position: { x: 11, y: 9 } });
  });

  it('is relative to the current heading', () => {
    expect(getLeftTurnResult(pos(10, 10), 'EAST')).toEqual({
      heading: 'NORTH',
      position: { x: 11, y: 9 },
    });
    expect(getRightTurnResult(pos(10, 10), 'SOUTH')).toEqual({
      heading: 'WEST',
      position: { x: 9, y: 11 },
    });
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

describe('blocked turns advance as far as they can', () => {
  const stage = (px: number, py: number, rocks: Array<[number, number]> = []) =>
    gameWith(
      defaultPlayer({ position: pos(px, py), heading: 'NORTH', weapons: [] }),
      defaultEnemy({ position: pos(15, 15) }),
      rocks.map(([x, y], index) => rock(`r${index}`, x, y)),
    );

  it('moves forward but stops when the sideways step is blocked', () => {
    // Turning left at the west edge: forward is free, the left cell is off-board.
    const result = resolveTurn(stage(0, 5), submitted(['TURN_LEFT']));
    const ship = result.nextState.ships['player-ship'];
    expect(ship.position).toEqual(pos(0, 4));
    expect(ship.heading).toBe('WEST');
    expect(result.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['SHIP_MOVED', 'SHIP_TURNED', 'SHIP_BLOCKED']),
    );
  });

  it('still rotates toward the turn side when it cannot move at all', () => {
    const result = resolveTurn(stage(5, 5, [[5, 4]]), submitted(['TURN_RIGHT']));
    const ship = result.nextState.ships['player-ship'];
    expect(ship.position).toEqual(pos(5, 5));
    expect(ship.heading).toBe('EAST');
    expect(result.events.some((event) => event.type === 'SHIP_MOVED')).toBe(
      false,
    );
    expect(result.events.some((event) => event.type === 'SHIP_TURNED')).toBe(
      true,
    );
    expect(result.events.some((event) => event.type === 'SHIP_BLOCKED')).toBe(
      true,
    );
  });

  it('does not rotate when a forward move is blocked', () => {
    const result = resolveTurn(stage(5, 5, [[5, 4]]), submitted(['FORWARD']));
    const ship = result.nextState.ships['player-ship'];
    expect(ship.position).toEqual(pos(5, 5));
    expect(ship.heading).toBe('NORTH');
  });

  it('completes the full diagonal and rotates when nothing blocks it', () => {
    const result = resolveTurn(stage(5, 5), submitted(['TURN_RIGHT']));
    const ship = result.nextState.ships['player-ship'];
    expect(ship.position).toEqual(pos(6, 4));
    expect(ship.heading).toBe('EAST');
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
