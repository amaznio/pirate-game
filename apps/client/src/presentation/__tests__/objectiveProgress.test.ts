import { describe, expect, it } from 'vitest';
import { createGame } from '@pirate/game-core/simulation/createGame';
import { createDuelConfig, createHuntConfig } from '@pirate/game-core/config/matchConfig';
import { redactState } from '@pirate/game-core/view/redact';
import type { GameState } from '@pirate/game-core/domain/GameState';
import { endNote, objectiveProgress } from '../objectiveProgress';

const viewOf = (state: GameState) => redactState(state, 'player', null);

describe('objectiveProgress', () => {
  it('is null for a standard match', () => {
    expect(objectiveProgress(viewOf(createGame()))).toBeNull();
  });

  it('shows the haul in the hold for a hunt', () => {
    const state = createGame(createHuntConfig({ seed: 1, sea: 'normal' }));
    expect(objectiveProgress(viewOf(state))).toEqual({ kind: 'hunt', haul: 0 });
    const loaded: GameState = { ...state, players: { ...state.players, player: { ...state.players['player'], haul: 5 } } };
    expect(objectiveProgress(viewOf(loaded))).toEqual({ kind: 'hunt', haul: 5 });
  });

  it('counts turns for survive, never past the limit', () => {
    const base = createGame(createDuelConfig({ sea: 'open', objective: { kind: 'survive', turns: 8 } }));
    expect(objectiveProgress(viewOf({ ...base, turn: 3 }))).toEqual({ kind: 'survive', turn: 3, turns: 8 });
    expect(objectiveProgress(viewOf({ ...base, turn: 12 }))).toEqual({ kind: 'survive', turn: 8, turns: 8 });
  });

  it('scores the viewers team against the best other team for salvage', () => {
    const base = createGame(createDuelConfig({ sea: 'open', objective: { kind: 'salvage', target: 3 } }));
    const state: GameState = {
      ...base,
      pickupsTaken: {
        player: { barrel: 1, crate: 1, plank: 0 },
        enemy: { barrel: 0, crate: 0, plank: 1 },
      },
    };
    expect(objectiveProgress(viewOf(state))).toEqual({ kind: 'salvage', yours: 2, rival: 1, target: 3 });
    expect(objectiveProgress(viewOf(base))).toEqual({ kind: 'salvage', yours: 0, rival: 0, target: 3 });
  });
});

describe('objectiveProgress for a merchant match', () => {
  const merchantView = (patch: Record<string, unknown> = {}) => {
    const base = createGame(createDuelConfig({ sea: 'open', objective: { kind: 'merchant', turns: 12 } }));
    const ships = { ...base.ships, ...(patch.ships as object) };
    return viewOf({ ...base, turn: (patch.turn as number) ?? 1, ships } as GameState);
  };

  it('counts the cells the merchant still has to go, and the turns it has', () => {
    const start = objectiveProgress(merchantView());
    expect(start).toMatchObject({ kind: 'merchant', turn: 1, turns: 12 });
    expect(start && start.kind === 'merchant' ? start.cells : -1).toBe(18);

    const base = createGame(createDuelConfig({ sea: 'open', objective: { kind: 'merchant', turns: 12 } }));
    const moved = merchantView({
      turn: 20,
      ships: { 'merchant-ship': { ...base.ships['merchant-ship'], position: { x: 15, y: 10 } } },
    });
    expect(objectiveProgress(moved)).toEqual({ kind: 'merchant', turn: 12, turns: 12, cells: 4 });
  });

  it('has no distance once the merchant is gone', () => {
    const base = createGame(createDuelConfig({ sea: 'open', objective: { kind: 'merchant', turns: 12 } }));
    const gone = merchantView({
      ships: { 'merchant-ship': { ...base.ships['merchant-ship'], hp: 0 } },
    });
    expect(objectiveProgress(gone)).toMatchObject({ kind: 'merchant', cells: null });
  });

  it('explains how it ended', () => {
    const view = merchantView();
    expect(endNote(view, 'win', 'intercepted')).toBe('intercepted');
    expect(endNote(view, 'loss', 'escaped')).toBe('escaped');
    expect(endNote(view, 'loss', 'objective_failed')).toBe('merchantLost');
    expect(endNote(view, 'draw', undefined)).toBeNull();
  });
});

describe('objectiveProgress for an ambush', () => {
  const ambush = () =>
    createGame(createDuelConfig({ sea: 'open', objective: { kind: 'ambush', turns: 14 } }));

  it('counts raiders afloat and raiders still to come, from the viewers side', () => {
    expect(objectiveProgress(viewOf(ambush()))).toEqual({
      kind: 'ambush',
      turn: 1,
      turns: 14,
      afloat: 1,
      coming: 2,
    });
  });

  it('moves a raider from coming to afloat when it arrives, and counts none once all are sunk', () => {
    const base = ambush();
    const arrived = {
      ...base,
      turn: 3,
      ships: { ...base.ships, 'raider-1-ship': { ...base.ships['raider-1-ship'], hp: 2, arrivesOnTurn: undefined } },
    } as GameState;
    expect(objectiveProgress(viewOf(arrived))).toMatchObject({ afloat: 2, coming: 1 });

    const cleared = {
      ...base,
      ships: Object.fromEntries(
        Object.entries(base.ships).map(([id, ship]) => [
          id,
          ship.teamId === 'player' ? ship : { ...ship, hp: 0, arrivesOnTurn: undefined },
        ]),
      ),
    } as GameState;
    expect(objectiveProgress(viewOf(cleared))).toMatchObject({ afloat: 0, coming: 0 });
  });

  it('explains how it ended', () => {
    const view = viewOf(ambush());
    expect(endNote(view, 'win', 'ambush_broken')).toBe('ambushBroken');
    expect(endNote(view, 'loss', 'overrun')).toBe('ambushOverrun');
    expect(endNote(view, 'loss', 'objective_failed')).toBe('ambushLost');
    expect(endNote(view, 'draw', undefined)).toBeNull();
  });
});

describe('endNote', () => {
  const survive = viewOf(createGame(createDuelConfig({ sea: 'open', objective: { kind: 'survive', turns: 5 } })));
  const salvage = viewOf(createGame(createDuelConfig({ sea: 'open', objective: { kind: 'salvage', target: 2 } })));
  const standard = viewOf(createGame());

  it('says nothing for a standard match or an unfinished one', () => {
    expect(endNote(standard, 'win', 'survived')).toBeNull();
    expect(endNote(survive, null, undefined)).toBeNull();
  });

  it('explains how a survive match ended', () => {
    expect(endNote(survive, 'win', 'survived')).toBe('survived');
    expect(endNote(survive, 'loss', 'objective_failed')).toBe('objectiveFailed');
    expect(endNote(survive, 'win', undefined)).toBeNull();
  });

  it('explains how a salvage match ended, including a draw', () => {
    expect(endNote(salvage, 'win', 'salvaged')).toBe('salvageWon');
    expect(endNote(salvage, 'loss', 'salvaged')).toBe('salvageLost');
    expect(endNote(salvage, 'draw', undefined)).toBe('salvageDraw');
    expect(endNote(salvage, 'loss', undefined)).toBeNull();
  });
});
