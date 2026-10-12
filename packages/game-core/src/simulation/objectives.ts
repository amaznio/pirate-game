import type { GameState, Outcome } from '../domain/GameState';
import type { TeamId } from '../domain/Entity';
import type { Objective } from '../domain/Objective';
import type { Ship } from '../domain/Ship';
import { getLivingShips } from './selectors';

/**
 * The teams the objective is written for: those of the human players, or with
 * no human in the match (an AI-versus-AI test) the first player's team.
 */
export function heroTeams(state: GameState): ReadonlySet<TeamId> {
  const players = Object.values(state.players);
  const humans = players.filter((player) => player.controller === 'human');
  const chosen = humans.length > 0 ? humans : players.slice(0, 1);
  return new Set(chosen.map((player) => player.teamId));
}

/** What each team has picked up so far. */
export function pickupsByTeam(state: GameState): Map<TeamId, number> {
  const byTeam = new Map<TeamId, number>();
  for (const player of Object.values(state.players)) {
    const tally = state.pickupsTaken?.[player.id];
    const taken = tally ? tally.barrel + tally.crate + tally.plank : 0;
    byTeam.set(player.teamId, (byTeam.get(player.teamId) ?? 0) + taken);
  }
  return byTeam;
}

/** Ships that have not arrived yet: no hull, and a turn they come on. */
export function pendingShips(state: GameState): Ship[] {
  return Object.values(state.ships).filter((ship) => ship.hp <= 0 && ship.arrivesOnTurn !== undefined);
}

/**
 * The ambush. The hero team wins once every raider is sunk and none are still
 * to arrive; it loses if it is sunk first, or if raiders are still afloat or
 * still to come when its turns run out. A raider still to come is not "sunk",
 * so the usual last-ship rule never ends this match early.
 */
function evaluateAmbush(
  state: GameState,
  objective: Extract<Objective, { kind: 'ambush' }>,
  endOfTurn: boolean,
): Outcome | null {
  const living = getLivingShips(state);
  const heroes = heroTeams(state);
  const hero = living.find((ship) => heroes.has(ship.teamId));
  const raiders = living.filter((ship) => !heroes.has(ship.teamId));
  const coming = pendingShips(state).filter((ship) => !heroes.has(ship.teamId));
  const opposition = raiders[0] ?? coming[0];

  if (!hero) {
    return opposition
      ? { kind: 'win', teamId: opposition.teamId, reason: 'objective_failed' }
      : { kind: 'draw' };
  }
  if (!opposition) {
    return { kind: 'win', teamId: hero.teamId, reason: 'ambush_broken' };
  }
  if (endOfTurn && state.turn >= objective.turns) {
    return { kind: 'win', teamId: opposition.teamId, reason: 'overrun' };
  }
  return null;
}

/**
 * The merchant match. In order: the merchant has got away (the opposition
 * wins), the merchant has been sunk (the hero team wins, or a draw if the hero
 * team went down with it), the hero team has been sunk, and last, the clock: a
 * merchant still afloat when its turns run out has got clean away.
 */
function evaluateMerchant(
  state: GameState,
  objective: Extract<Objective, { kind: 'merchant' }>,
  endOfTurn: boolean,
): Outcome | null {
  const merchant = objective.shipId ? state.ships[objective.shipId] : undefined;
  if (!merchant) {
    return null;
  }
  const living = getLivingShips(state);
  const heroes = heroTeams(state);
  const hero = living.find((ship) => heroes.has(ship.teamId));

  if (merchant.escaped) {
    return { kind: 'win', teamId: merchant.teamId, reason: 'escaped' };
  }
  if (merchant.hp <= 0) {
    return hero
      ? { kind: 'win', teamId: hero.teamId, reason: 'intercepted' }
      : { kind: 'draw' };
  }
  if (!hero) {
    return { kind: 'win', teamId: merchant.teamId, reason: 'objective_failed' };
  }
  if (endOfTurn && state.turn >= objective.turns) {
    return { kind: 'win', teamId: merchant.teamId, reason: 'escaped' };
  }
  return null;
}

/**
 * Whether the objective has settled the match. `endOfTurn` is true only after
 * the last phase of a turn, which is when "survive N turns" is decided. Null
 * means the objective has nothing to say yet (the usual rule then applies).
 */
export function evaluateObjective(state: GameState, endOfTurn: boolean): Outcome | null {
  const objective = state.objective;
  if (!objective) {
    return null;
  }
  const living = getLivingShips(state);
  const heroes = heroTeams(state);

  if (objective.kind === 'survive') {
    const heroAfloat = living.some((ship) => heroes.has(ship.teamId));
    if (!heroAfloat) {
      const opposition = living.find((ship) => !heroes.has(ship.teamId));
      return opposition
        ? { kind: 'win', teamId: opposition.teamId, reason: 'objective_failed' }
        : { kind: 'draw' };
    }
    if (endOfTurn && state.turn >= objective.turns) {
      const hero = living.find((ship) => heroes.has(ship.teamId));
      return hero ? { kind: 'win', teamId: hero.teamId, reason: 'survived' } : null;
    }
    return null;
  }

  if (objective.kind === 'merchant') {
    return evaluateMerchant(state, objective, endOfTurn);
  }
  if (objective.kind === 'ambush') {
    return evaluateAmbush(state, objective, endOfTurn);
  }

  // salvage
  const taken = pickupsByTeam(state);
  const ranked = [...taken.entries()].sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const afloat = Object.keys(state.pickups ?? {}).length;
  if (!best || (best[1] < objective.target && afloat > 0)) {
    return null;
  }
  if (best[1] === 0 || (ranked[1] && ranked[1][1] === best[1])) {
    return { kind: 'draw', reason: 'salvaged' };
  }
  return { kind: 'win', teamId: best[0], reason: 'salvaged' };
}
