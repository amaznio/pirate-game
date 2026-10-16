import type { MatchResult } from '@pirate/game-core/domain/MatchResult';
import { buildBattle } from '../battle';
import { applyAction, availableMoves } from '../engine';
import type { RunAction, RunEvent, RunState, UpgradeId } from '../types';

/** Applies an action that must be allowed, and returns the new state. */
export function step(state: RunState, action: RunAction): { state: RunState; events: readonly RunEvent[] } {
  const result = applyAction(state, action);
  if (!result.ok) {
    throw new Error(`Action ${action.type} refused: ${result.error}`);
  }
  return { state: result.state, events: result.events };
}

/** A made-up result for the battle at the ship's node: the hero wins, losing some hull. */
export function winningResult(state: RunState, hullLost = 1, ammoSpent = 1): MatchResult {
  const setup = buildBattle(state);
  const hero = setup.config.participants.find((p) => p.playerId === setup.heroPlayerId)!;
  const hunting = setup.kind === 'hunt';
  return {
    ...(hunting ? { hunt: { ending: 'left' as const, bossSlain: false, monstersSunk: 0, haul: 10 } } : {}),
    outcome: { kind: 'win', teamId: hero.teamId },
    turns: 6,
    ships: [
      {
        playerId: hero.playerId,
        name: 'Hero',
        teamId: hero.teamId,
        shipTypeId: hero.shipTypeId,
        hull: Math.max(1, state.hull - hullLost),
        maxHull: state.hull,
        afloat: !hunting,
        ...(hunting ? { escaped: true } : {}),
        ammo: Math.max(0, state.ammo - ammoSpent),
        tokens: 0,
        pickups: { barrel: 0, crate: 0, plank: 0 },
      },
    ],
  };
}

/** A made-up result in which the hero is sunk. */
export function losingResult(state: RunState): MatchResult {
  const won = winningResult(state);
  return {
    ...won,
    outcome: { kind: 'win', teamId: 'someone-else' },
    ships: won.ships.map((ship) => ({ ...ship, hull: 0, afloat: false })),
  };
}

/** Walks a run to its end with a fixed policy and made-up wins; returns every state seen. */
export function playWithWins(start: RunState, pickUpgrade: (state: RunState) => UpgradeId): RunState[] {
  const seen: RunState[] = [start];
  let state = start;
  for (let guard = 0; guard < 2000 && state.phase !== 'victory' && state.phase !== 'defeat'; guard += 1) {
    if (state.phase === 'port') {
      state = step(state, { type: 'chooseUpgrade', upgrade: pickUpgrade(state) }).state;
    } else if (state.phase === 'map') {
      const moves = availableMoves(state);
      // Prefer a port when one is on offer, else the first way forward.
      const next = moves.find((node) => node.kind === 'port') ?? moves[0]!;
      state = step(state, { type: 'travel', to: next.id }).state;
    } else {
      // The fight begins (and is saved as begun), then it is won.
      state = step(state, { type: 'startBattle' }).state;
      seen.push(state);
      state = step(state, { type: 'finishBattle', result: winningResult(state) }).state;
    }
    seen.push(state);
  }
  return seen;
}
