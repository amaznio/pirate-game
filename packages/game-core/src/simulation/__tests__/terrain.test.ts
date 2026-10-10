import { describe, expect, it } from 'vitest';
import type { GameState } from '../../domain/GameState';
import type { GameEvent } from '../../domain/GameEvent';
import type { Direction } from '../../domain/Direction';
import {
  terrainFrom,
  whirlpoolCells,
  whirlpoolDelta,
  windLane,
  type Spin,
  type TerrainMap,
  type WhirlpoolCorner,
} from '../../domain/Terrain';
import { previewPlayerPlan } from '../preview';
import { resolveTurn } from '../resolveTurn';
import { redactState, viewToState } from '../../view/redact';
import {
  defaultEnemy,
  defaultPlayer,
  gameWith,
  rock,
  submitted,
} from './testUtils';

function board(
  terrain: TerrainMap,
  player: { x: number; y: number; heading?: Direction },
  enemy: { x: number; y: number; heading?: Direction } = { x: 15, y: 3 },
  rocks: Array<[number, number]> = [],
): GameState {
  const state = gameWith(
    defaultPlayer({
      position: { x: player.x, y: player.y },
      heading: player.heading ?? 'EAST',
    }),
    defaultEnemy({
      position: { x: enemy.x, y: enemy.y },
      heading: enemy.heading ?? 'SOUTH',
    }),
    rocks.map(([x, y], index) => rock(`r${index}`, x, y)),
  );
  return { ...state, terrain };
}

/** Where the first whirlpool spin of the turn left the player's ship. */
function firstSpin(events: readonly GameEvent[]) {
  const event = events.find((candidate) => candidate.type === 'SHIP_SPUN');
  if (event?.type !== 'SHIP_SPUN') throw new Error('no spin');
  return event;
}

function pushes(events: readonly GameEvent[]): GameEvent[] {
  return events.filter((event) => event.type === 'SHIP_PUSHED');
}

describe('wind', () => {
  it('pushes a ship that ends its move on a wind cell one cell, keeping its heading', () => {
    const state = board(terrainFrom(windLane({ x: 6, y: 10 }, 'SOUTH', 1)), {
      x: 5,
      y: 10,
    });
    const { nextState, events } = resolveTurn(state, submitted(['FORWARD']));
    expect(nextState.ships['player-ship'].position).toEqual({ x: 6, y: 11 });
    expect(nextState.ships['player-ship'].heading).toBe('EAST');
    expect(pushes(events)).toEqual([
      {
        type: 'SHIP_PUSHED',
        shipId: 'player-ship',
        from: { x: 6, y: 10 },
        to: { x: 6, y: 11 },
        direction: 'SOUTH',
        phase: 0,
      },
    ]);
  });

  it('pushes a ship only one cell per phase, even onto more wind', () => {
    const state = board(terrainFrom(windLane({ x: 6, y: 10 }, 'SOUTH', 3)), {
      x: 5,
      y: 10,
    });
    const { phases } = resolveTurn(state, submitted(['FORWARD']));
    const perPhase = phases.map((phase) => pushes(phase.events).length);
    // Phase 0: sails onto the lane and is pushed once. Phases 1 and 2: it is
    // still on wind, so it is pushed again each phase. Phase 3: off the lane.
    expect(perPhase).toEqual([1, 1, 1, 0]);
  });

  it('carries a ship along a row of wind, a cell each phase', () => {
    const state = board(terrainFrom(windLane({ x: 6, y: 10 }, 'SOUTH', 3)), {
      x: 5,
      y: 10,
    });
    const { nextState } = resolveTurn(state, submitted(['FORWARD']));
    expect(nextState.ships['player-ship'].position).toEqual({ x: 6, y: 13 });
  });

  it('does not push a ship that only sails across wind on the way', () => {
    // A right turn goes forward to (6,10), then sideways to (6,11).
    const state = board(terrainFrom(windLane({ x: 6, y: 10 }, 'EAST', 1)), {
      x: 5,
      y: 10,
    });
    const { nextState, events } = resolveTurn(state, submitted(['TURN_RIGHT']));
    expect(nextState.ships['player-ship'].position).toEqual({ x: 6, y: 11 });
    expect(pushes(events)).toHaveLength(0);
  });

  it('pushes a ship that is not sailing at all', () => {
    const state = board(terrainFrom(windLane({ x: 5, y: 10 }, 'EAST', 1)), {
      x: 5,
      y: 10,
    });
    const { nextState } = resolveTurn(state, submitted([]));
    expect(nextState.ships['player-ship'].position).toEqual({ x: 6, y: 10 });
  });

  it('does not push a ship into a rock, and the ship stays on the wind', () => {
    const state = board(
      terrainFrom(windLane({ x: 6, y: 10 }, 'SOUTH', 1)),
      { x: 5, y: 10 },
      undefined,
      [[6, 11]],
    );
    const { nextState, events } = resolveTurn(state, submitted(['FORWARD']));
    expect(nextState.ships['player-ship'].position).toEqual({ x: 6, y: 10 });
    expect(pushes(events)).toHaveLength(0);
  });

  it('does not push a ship off the board', () => {
    const state = board(terrainFrom(windLane({ x: 0, y: 10 }, 'WEST', 1)), {
      x: 0,
      y: 10,
    });
    const { nextState } = resolveTurn(state, submitted([]));
    expect(nextState.ships['player-ship'].position).toEqual({ x: 0, y: 10 });
  });

  it('does not push a ship into another ship that stays', () => {
    const state = board(
      terrainFrom(windLane({ x: 6, y: 10 }, 'SOUTH', 1)),
      { x: 5, y: 10 },
      { x: 6, y: 11 },
    );
    const { nextState } = resolveTurn(state, submitted(['FORWARD']));
    expect(nextState.ships['player-ship'].position).toEqual({ x: 6, y: 10 });
    expect(nextState.ships['enemy-ship'].position).toEqual({ x: 6, y: 11 });
  });

  it('stops both ships when the wind pushes them into the same cell', () => {
    const state = board(
      terrainFrom(
        windLane({ x: 5, y: 11 }, 'EAST', 1),
        windLane({ x: 7, y: 11 }, 'WEST', 1),
      ),
      { x: 5, y: 11 },
      { x: 7, y: 11 },
    );
    const { nextState } = resolveTurn(state, submitted([]));
    expect(nextState.ships['player-ship'].position).toEqual({ x: 5, y: 11 });
    expect(nextState.ships['enemy-ship'].position).toEqual({ x: 7, y: 11 });
  });

  it('does not loop for ever when wind blows in a circle', () => {
    const state = board(
      terrainFrom(
        windLane({ x: 5, y: 5 }, 'EAST', 1),
        windLane({ x: 6, y: 5 }, 'SOUTH', 1),
        windLane({ x: 6, y: 6 }, 'WEST', 1),
        windLane({ x: 5, y: 6 }, 'NORTH', 1),
      ),
      { x: 5, y: 5 },
    );
    const { events } = resolveTurn(state, submitted([]));
    expect(pushes(events).length).toBeGreaterThan(0);
    expect(pushes(events).length).toBeLessThanOrEqual(8 * 4);
  });
});

describe('whirlpool', () => {
  it('carries a ship on the top-left of a clockwise whirlpool to the top-right and turns it right', () => {
    const state = board(
      terrainFrom(whirlpoolCells({ x: 10, y: 10 }, 'right')),
      { x: 9, y: 10 },
    );
    const { events } = resolveTurn(state, submitted(['FORWARD']));
    expect(firstSpin(events).to).toEqual({ x: 11, y: 10 });
    expect(firstSpin(events).toHeading).toBe('SOUTH');
    expect(events).toContainEqual({
      type: 'SHIP_SPUN',
      shipId: 'player-ship',
      from: { x: 10, y: 10 },
      to: { x: 11, y: 10 },
      fromHeading: 'EAST',
      toHeading: 'SOUTH',
      spin: 'right',
      phase: 0,
    });
  });

  it('carries a ship on the bottom-right of a counter-clockwise whirlpool to the top-right and turns it left', () => {
    const state = board(
      terrainFrom(whirlpoolCells({ x: 10, y: 10 }, 'left')),
      { x: 11, y: 12, heading: 'NORTH' },
    );
    const { events } = resolveTurn(state, submitted(['FORWARD']));
    expect(firstSpin(events).from).toEqual({ x: 11, y: 11 });
    expect(firstSpin(events).to).toEqual({ x: 11, y: 10 });
    expect(firstSpin(events).toHeading).toBe('WEST');
  });

  it('spins a ship that stays in it once per phase, and back to the start after four', () => {
    const state = board(
      terrainFrom(whirlpoolCells({ x: 10, y: 10 }, 'right')),
      { x: 10, y: 10, heading: 'EAST' },
    );
    const { phases, nextState } = resolveTurn(state, submitted([]));
    const spun = phases.map((phase) =>
      phase.events.find((event) => event.type === 'SHIP_SPUN'),
    );
    expect(spun.map((event) => event && 'to' in event && event.to)).toEqual([
      { x: 11, y: 10 },
      { x: 11, y: 11 },
      { x: 10, y: 11 },
      { x: 10, y: 10 },
    ]);
    expect(nextState.ships['player-ship'].position).toEqual({ x: 10, y: 10 });
    expect(nextState.ships['player-ship'].heading).toBe('EAST');
  });

  it('turns ships sharing a whirlpool together without them stopping each other', () => {
    const state = board(
      terrainFrom(whirlpoolCells({ x: 10, y: 10 }, 'right')),
      { x: 10, y: 10 },
      { x: 11, y: 10 },
    );
    const { phases } = resolveTurn(state, submitted([]));
    const [first] = phases;
    const targets = first.events.flatMap((event) =>
      event.type === 'SHIP_SPUN' ? [{ id: event.shipId, to: event.to }] : [],
    );
    expect(targets).toEqual(
      expect.arrayContaining([
        { id: 'player-ship', to: { x: 11, y: 10 } },
        { id: 'enemy-ship', to: { x: 11, y: 11 } },
      ]),
    );
  });

  it('still turns a ship that a rock keeps from moving', () => {
    const state = board(
      terrainFrom(whirlpoolCells({ x: 10, y: 10 }, 'right')),
      { x: 10, y: 10, heading: 'EAST' },
      undefined,
      [[11, 10]],
    );
    const { phases } = resolveTurn(state, submitted([]));
    const spun = phases[0].events.find((event) => event.type === 'SHIP_SPUN');
    expect(spun).toMatchObject({
      from: { x: 10, y: 10 },
      to: { x: 10, y: 10 },
      toHeading: 'SOUTH',
    });
  });

  it('spins a ship the wind has just carried into it', () => {
    const state = board(
      terrainFrom(
        windLane({ x: 9, y: 10 }, 'EAST', 1),
        whirlpoolCells({ x: 10, y: 10 }, 'right'),
      ),
      { x: 8, y: 10 },
    );
    const { events } = resolveTurn(state, submitted(['FORWARD']));
    expect(pushes(events)).toHaveLength(1);
    expect(firstSpin(events).from).toEqual({ x: 10, y: 10 });
    expect(firstSpin(events).to).toEqual({ x: 11, y: 10 });
    expect(firstSpin(events).toHeading).toBe('SOUTH');
  });
});

describe('whirlpool geometry', () => {
  const corners = (spin: Spin): WhirlpoolCorner[] => {
    const cells = whirlpoolCells({ x: 0, y: 0 }, spin);
    return cells.map((cell) => (cell.terrain as { corner: WhirlpoolCorner }).corner);
  };

  it.each(['left', 'right'] as const)('sends a ship round all four cells (%s)', (spin) => {
    const cells = whirlpoolCells({ x: 3, y: 4 }, spin);
    const byKey = new Map(cells.map((cell) => [`${cell.position.x},${cell.position.y}`, cell]));
    expect(corners(spin)).toHaveLength(4);

    let current = cells[0].position;
    const seen = new Set<string>();
    for (let i = 0; i < 4; i += 1) {
      seen.add(`${current.x},${current.y}`);
      const cell = byKey.get(`${current.x},${current.y}`);
      const t = cell?.terrain;
      if (t?.kind !== 'whirlpool') throw new Error('not a whirlpool cell');
      const delta = whirlpoolDelta(t.spin, t.corner);
      current = { x: current.x + delta.x, y: current.y + delta.y };
      expect(byKey.has(`${current.x},${current.y}`)).toBe(true);
    }
    expect(seen.size).toBe(4);
    expect(current).toEqual(cells[0].position);
  });
});

describe('terrain in previews and views', () => {
  it('shows the drift in the plan preview, using the same rules', () => {
    const state = board(terrainFrom(windLane({ x: 6, y: 10 }, 'SOUTH', 2)), {
      x: 5,
      y: 10,
    });
    const withPlan: GameState = {
      ...state,
      players: {
        ...state.players,
        player: {
          ...state.players.player,
          queue: ['FORWARD', null, null, null],
        },
      },
    };
    const preview = previewPlayerPlan(withPlan, 'player');
    expect(preview?.steps[0].position).toEqual({ x: 6, y: 11 });
    // Still on the wind with no move planned, it is carried on a cell.
    expect(preview?.steps[1].position).toEqual({ x: 6, y: 12 });
  });

  it('is public: every viewer gets the terrain, and rebuilding a state keeps it', () => {
    const state = board(terrainFrom(windLane({ x: 6, y: 10 }, 'SOUTH', 2)), {
      x: 5,
      y: 10,
    });
    const view = redactState(state, 'player', null);
    expect(view.terrain).toEqual(state.terrain);
    expect(viewToState(view).terrain).toEqual(state.terrain);
  });
});
