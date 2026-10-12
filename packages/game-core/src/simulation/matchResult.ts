import { totalTokens } from '../domain/Action';
import type { GameState } from '../domain/GameState';
import { EMPTY_PICKUP_TALLY, type MatchResult } from '../domain/MatchResult';

/** The result of a finished match, or null while it is still being played. */
export function buildMatchResult(state: GameState): MatchResult | null {
  if (state.outcome === null) {
    return null;
  }
  return {
    outcome: state.outcome,
    turns: state.turn,
    ships: Object.values(state.players).map((player) => {
      const ship = state.ships[player.shipId];
      return {
        playerId: player.id,
        name: player.name,
        teamId: player.teamId,
        shipTypeId: ship?.shipTypeId ?? '',
        hull: Math.max(0, ship?.hp ?? 0),
        maxHull: ship?.maxHp ?? 0,
        afloat: (ship?.hp ?? 0) > 0,
        ammo: player.ammo,
        tokens: totalTokens(player.tokens),
        pickups: state.pickupsTaken?.[player.id] ?? EMPTY_PICKUP_TALLY,
      };
    }),
  };
}
