import type { Ship, WeaponMount, WeaponSide } from '../domain/Ship';
import { isShip, mountsOnSide } from '../domain/Ship';
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
 * Resolves the cannon moves for one phase, for every ship at once. Each side
 * fires as many of its cannons as the move asks for (one, two, three...), one
 * after the other, from the ship's own cell along the same line. Each cannon
 * spends one cannonball from the owner's shared pool; when the pool runs dry the
 * rest report `out_of_ammo`.
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
      if (slot[side] <= 0) {
        continue;
      }

      // The slot says how many cannons to fire; they go in order from the first.
      const mounts = mountsOnSide(ship, side);
      mounts.slice(0, slot[side]).forEach((mount, index) => {
        const owner = state.players[ship.ownerId];
        if (!owner || owner.ammo <= 0) {
          events.push({
            type: 'CANNON_BLOCKED',
            shipId: ship.id,
            side,
            reason: 'out_of_ammo',
            phase,
          });
          return;
        }

        state.players[ship.ownerId] = { ...owner, ammo: owner.ammo - 1 };
        events.push(
          ...fireMount(state, ship, mount, mounts.length > 1 ? index : undefined, phase, pending),
        );
      });
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
 * Fires one cannon from the ship's own cell. Ammo is handled by the caller.
 * Damage to ships is queued in `pending` rather than applied, so all shots in a
 * phase see the same board. `cannon` numbers the cannons of a side that has
 * several, so the events can be told apart; it is left out for a lone cannon.
 */
function fireMount(
  state: MutableGameState,
  ship: Ship,
  mount: WeaponMount,
  cannon: number | undefined,
  phase: number,
  pending: PendingDamage[],
): GameEvent[] {
  const side = mount.side;
  const origin = ship.position;
  const events: GameEvent[] = [];
  const weapon = getWeaponType(mount.weaponTypeId);
  const direction = broadsideDirection(ship, side);
  const numbered = cannon === undefined ? {} : { cannon };

  events.push({
    type: 'CANNON_FIRED',
    shipId: ship.id,
    side,
    direction,
    from: { ...origin },
    weaponTypeId: weapon.id,
    range: weapon.range,
    ...numbered,
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
      ...numbered,
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
    ...numbered,
    phase,
  });

  return events;
}
