import type { GameEvent } from '../domain/GameEvent';
import type { Pickup, PickupMap } from '../domain/Pickup';
import type { Ship } from '../domain/Ship';
import { cellKey } from '../domain/Terrain';
import { EMPTY_PICKUP_TALLY } from '../domain/MatchResult';
import { PICKUP_EFFECTS } from '../config/gameRules';
import { getShipType, tokenEconomyOf } from '../config/shipTypes';
import type { MutableGameState } from './internal';
import { produceTokens } from './tokens';

/**
 * What a ship gets from a pickup, written into the state. Returns how much of
 * it actually fitted (a full hull or a full hold gains nothing).
 */
function applyPickup(
  state: MutableGameState,
  ship: Ship,
  pickup: Pickup,
): number {
  const player = state.players[ship.ownerId];
  switch (pickup.kind) {
    case 'barrel': {
      const gained = PICKUP_EFFECTS.barrel.ammo;
      if (player) {
        state.players[ship.ownerId] = { ...player, ammo: player.ammo + gained };
      }
      return player ? gained : 0;
    }
    case 'plank': {
      const gained = Math.min(PICKUP_EFFECTS.plank.hull, ship.maxHp - ship.hp);
      if (gained > 0) {
        state.ships[ship.id] = { ...ship, hp: ship.hp + gained };
      }
      return gained;
    }
    case 'crate': {
      if (!player) {
        return 0;
      }
      const economy = tokenEconomyOf(getShipType(ship.shipTypeId));
      const production = produceTokens(
        player.tokens,
        player.tokenGeneration,
        economy,
        PICKUP_EFFECTS.crate.tokens,
      );
      state.players[ship.ownerId] = {
        ...player,
        tokens: production.tokens,
        tokenGeneration: production.tokenGeneration,
      };
      return production.made.length;
    }
  }
}

/**
 * Hands out the pickups at the end of a phase's movement. A pickup goes to the
 * one ship that ends the phase on its cell. Ships passing over one do not
 * collect it. If more than one ship were somehow on a cell, nobody gets it
 * and it is lost, so no ship is favoured. Nothing respawns.
 */
export function collectPickups(
  state: MutableGameState,
  phase: number,
): GameEvent[] {
  const pickups = state.pickups;
  if (!pickups || Object.keys(pickups).length === 0) {
    return [];
  }

  const shipsByCell = new Map<string, Ship[]>();
  for (const ship of Object.values(state.ships)) {
    if (ship.hp <= 0) {
      continue;
    }
    const key = cellKey(ship.position);
    shipsByCell.set(key, [...(shipsByCell.get(key) ?? []), ship]);
  }

  const events: GameEvent[] = [];
  const remaining: Record<string, Pickup> = { ...pickups };
  for (const key of Object.keys(pickups).sort()) {
    const here = shipsByCell.get(key);
    if (!here) {
      continue;
    }
    const pickup = pickups[key];
    const [x, y] = key.split(',').map(Number);
    delete remaining[key];
    if (here.length > 1) {
      events.push({ type: 'PICKUP_LOST', kind: pickup.kind, at: { x, y }, phase });
      continue;
    }
    const gained = applyPickup(state, here[0], pickup);
    const owner = here[0].ownerId;
    const tally = state.pickupsTaken?.[owner] ?? EMPTY_PICKUP_TALLY;
    state.pickupsTaken = {
      ...state.pickupsTaken,
      [owner]: { ...tally, [pickup.kind]: tally[pickup.kind] + 1 },
    };
    events.push({
      type: 'PICKUP_COLLECTED',
      shipId: here[0].id,
      kind: pickup.kind,
      at: { x, y },
      gained,
      phase,
    });
  }

  state.pickups = remaining as PickupMap;
  return events;
}
