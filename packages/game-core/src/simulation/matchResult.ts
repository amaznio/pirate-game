import { totalTokens } from '../domain/Action';
import type { GameState } from '../domain/GameState';
import { EMPTY_PICKUP_TALLY, type MatchResult } from '../domain/MatchResult';
import { heroTeams } from './objectives';

/** The result of a finished match, or null while it is still being played. */
export function buildMatchResult(state: GameState): MatchResult | null {
  if (state.outcome === null) {
    return null;
  }
  const outcome = state.outcome;
  const heroes = heroTeams(state);
  return {
    outcome,
    turns: state.turn,
    ...(state.objective === undefined
      ? {}
      : {
          objective: {
            kind: state.objective.kind,
            met: outcome.kind === 'win' && heroes.has(outcome.teamId),
          },
        }),
    ...(state.objective?.kind === 'hunt'
      ? {
          hunt: {
            ending: outcome.kind === 'win' && heroes.has(outcome.teamId) ? ('left' as const) : ('sunk' as const),
            bossSlain:
              state.objective.bossId !== undefined && (state.monsters?.[state.objective.bossId]?.hp ?? 1) <= 0,
            monstersSunk: Object.values(state.monsters ?? {}).filter((monster) => monster.hp <= 0).length,
            haul:
              outcome.kind === 'win' && heroes.has(outcome.teamId)
                ? Object.values(state.players)
                    .filter((player) => heroes.has(player.teamId))
                    .reduce((total, player) => total + (player.haul ?? 0), 0)
                : 0,
          },
        }
      : {}),
    ships: Object.values(state.players).map((player) => {
      const ship = state.ships[player.shipId];
      return {
        playerId: player.id,
        name: player.name,
        teamId: player.teamId,
        shipTypeId: ship?.shipTypeId ?? '',
        hull: ship?.escaped && ship.hullOnExit !== undefined ? ship.hullOnExit : Math.max(0, ship?.hp ?? 0),
        maxHull: ship?.maxHp ?? 0,
        afloat: (ship?.hp ?? 0) > 0,
        ...(ship?.escaped ? { escaped: true } : {}),
        ...(ship?.arrivesOnTurn !== undefined ? { arrivesOnTurn: ship.arrivesOnTurn } : {}),
        ammo: player.ammo,
        tokens: totalTokens(player.tokens),
        pickups: state.pickupsTaken?.[player.id] ?? EMPTY_PICKUP_TALLY,
        ...(player.haul === undefined ? {} : { haul: player.haul }),
      };
    }),
  };
}
