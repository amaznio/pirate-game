import type { Ship, WeaponMount, WeaponSide } from '../domain/Ship';
import { isShip, mountsOnSide } from '../domain/Ship';
import type { CannonSlot } from '../domain/Action';
import { CANNON_SIDES } from '../domain/Action';
import type { EntityId } from '../domain/Entity';
import type { GameEvent } from '../domain/GameEvent';
import type { Position } from '../domain/Position';
import type { MutableGameState } from './internal';
import { leftBroadside, rightBroadside } from '../domain/Direction';
import { getWeaponType } from '../config/weaponTypes';
import { firstEntityAlongRay, mountOrigin, rayEndpoint } from './collision';
import { applyDamage } from './damage';

function broadsideDirection(ship: Ship, side: WeaponSide) {
  return side === 'left'
    ? leftBroadside(ship.heading)
    : rightBroadside(ship.heading);
}

/** A ship and the cannon move it queued for this phase. */
export interface FirePlan {
  readonly ship: Ship;
  readonly slot: CannonSlot;
}

interface PendingDamage {
  readonly targetId: EntityId;
  readonly amount: number;
}

/**
 * Resolves the cannon moves for one phase, for every ship at once. Each flagged
 * broadside fires every cannon on that side, each spending one cannonball from
 * the owner's shared pool (so a "both sides" move on a two-cannon ship spends
 * four). A cannon fires from its lane: if the cell it fires from is taken, or
 * the pool runs dry, it does not fire and reports why.
 *
 * Fire is simultaneous: every shot is ray-cast against the positions after this
 * phase's movement and before any of this phase's damage lands. Damage is
 * applied afterwards, so ships can destroy each other in the same phase.
 *
 * The simulation decides what is hit: the first blocking entity within weapon
 * range stops the shot. Phaser only animates the resulting events.
 */
export function resolveFirePhase(
  state: MutableGameState,
  plans: readonly FirePlan[],
  phase: number,
): GameEvent[] {
  const events: GameEvent[] = [];
  const pending: PendingDamage[] = [];

  for (const { ship, slot } of plans) {
    for (const side of CANNON_SIDES) {
      if (!slot[side]) {
        continue;
      }

      for (const mount of mountsOnSide(ship, side)) {
        const origin = mountOrigin(state, ship.id, ship.position, ship.heading, mount.lane ?? 0);
        if (!origin) {
          events.push({
            type: 'CANNON_BLOCKED',
            shipId: ship.id,
            side,
            reason: 'obstructed',
            phase,
          });
          continue;
        }

        const owner = state.players[ship.ownerId];
        if (!owner || owner.ammo <= 0) {
          events.push({
            type: 'CANNON_BLOCKED',
            shipId: ship.id,
            side,
            reason: 'out_of_ammo',
            phase,
          });
          continue;
        }

        state.players[ship.ownerId] = { ...owner, ammo: owner.ammo - 1 };
        events.push(...fireMount(state, ship, mount, origin, phase, pending));
      }
    }
  }

  for (const { targetId, amount } of pending) {
    const target = state.ships[targetId];
    if (target) {
      events.push(...applyDamage(state, target, amount, phase));
    }
  }

  return events;
}

/**
 * Fires one cannon from `origin`. Ammo is handled by the caller. Damage to
 * ships is queued in `pending` rather than applied, so all shots in a phase see
 * the same board.
 */
function fireMount(
  state: MutableGameState,
  ship: Ship,
  mount: WeaponMount,
  origin: Position,
  phase: number,
  pending: PendingDamage[],
): GameEvent[] {
  const side = mount.side;
  const events: GameEvent[] = [];
  const weapon = getWeaponType(mount.weaponTypeId);
  const direction = broadsideDirection(ship, side);

  events.push({
    type: 'CANNON_FIRED',
    shipId: ship.id,
    side,
    direction,
    from: { ...origin },
    weaponTypeId: weapon.id,
    range: weapon.range,
    phase,
  });

  const hit = firstEntityAlongRay(state, origin, direction, weapon.range, ship.id);

  if (!hit) {
    events.push({
      type: 'PROJECTILE_MISSED',
      shipId: ship.id,
      side,
      from: { ...origin },
      to: rayEndpoint(origin, direction, weapon.range),
      direction,
      phase,
    });
    return events;
  }

  let damage = 0;
  if (isShip(hit.entity)) {
    const friendly = hit.entity.teamId === ship.teamId;
    if (!friendly || state.rules.friendlyFire) {
      damage = weapon.damage;
      pending.push({ targetId: hit.entity.id, amount: damage });
    }
  }

  events.push({
    type: 'PROJECTILE_HIT',
    shipId: ship.id,
    side,
    targetId: hit.entity.id,
    targetKind: hit.entity.kind,
    from: { ...origin },
    to: { ...hit.position },
    damage,
    phase,
  });

  return events;
}
