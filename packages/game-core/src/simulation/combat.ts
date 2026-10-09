import type { Ship, WeaponSide } from '../domain/Ship';
import { isShip } from '../domain/Ship';
import type { CannonSlot } from '../domain/Action';
import { CANNON_SIDES } from '../domain/Action';
import type { EntityId } from '../domain/Entity';
import type { GameEvent } from '../domain/GameEvent';
import type { MutableGameState } from './internal';
import { leftBroadside, rightBroadside } from '../domain/Direction';
import { getWeaponType } from '../config/weaponTypes';
import { firstEntityAlongRay, rayEndpoint } from './collision';
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
 * broadside fires one shot, spending one cannonball from the owner's shared
 * pool (so a "both sides" move spends two).
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
      events.push(...fireBroadside(state, ship, side, phase, pending));
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
 * Fires a single broadside (one shot). Ammo is handled by the caller. Damage to
 * ships is queued in `pending` rather than applied, so all shots in a phase see
 * the same board.
 */
function fireBroadside(
  state: MutableGameState,
  ship: Ship,
  side: WeaponSide,
  phase: number,
  pending: PendingDamage[],
): GameEvent[] {
  const mount = ship.weapons.find((weapon) => weapon.side === side);
  if (!mount) {
    return [];
  }

  const events: GameEvent[] = [];
  const weapon = getWeaponType(mount.weaponTypeId);
  const direction = broadsideDirection(ship, side);

  events.push({
    type: 'CANNON_FIRED',
    shipId: ship.id,
    side,
    direction,
    from: { ...ship.position },
    weaponTypeId: weapon.id,
    range: weapon.range,
    phase,
  });

  const hit = firstEntityAlongRay(
    state,
    ship.position,
    direction,
    weapon.range,
    ship.id,
  );

  if (!hit) {
    events.push({
      type: 'PROJECTILE_MISSED',
      shipId: ship.id,
      side,
      from: { ...ship.position },
      to: rayEndpoint(ship.position, direction, weapon.range),
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
    from: { ...ship.position },
    to: { ...hit.position },
    damage,
    phase,
  });

  return events;
}
