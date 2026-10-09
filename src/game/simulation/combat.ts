import type { Ship, WeaponSide } from '../domain/Ship';
import { isShip } from '../domain/Ship';
import type { CannonSlot } from '../domain/Action';
import { CANNON_SIDES } from '../domain/Action';
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

/**
 * Resolves the cannon move for one phase: each flagged broadside fires one
 * shot, spending one cannonball from the owner's shared pool. A "both sides"
 * move therefore spends two.
 *
 * The simulation decides what is hit: a ray is cast along the broadside and
 * the first blocking entity within weapon range stops the shot. Phaser only
 * animates the resulting events.
 */
export function resolveCannonSlot(
  state: MutableGameState,
  ship: Ship,
  slot: CannonSlot,
  phase: number,
): GameEvent[] {
  const events: GameEvent[] = [];

  for (const side of CANNON_SIDES) {
    if (!slot[side]) {
      continue;
    }

    if (state.ammo[ship.side] <= 0) {
      events.push({
        type: 'CANNON_BLOCKED',
        shipId: ship.id,
        side,
        reason: 'out_of_ammo',
        phase,
      });
      continue;
    }

    state.ammo[ship.side] -= 1;
    events.push(...fireBroadside(state, ship, side, phase));
  }

  return events;
}

/** Fires a single broadside (one shot). Ammo is handled by the caller. */
export function fireBroadside(
  state: MutableGameState,
  ship: Ship,
  side: WeaponSide,
  phase: number,
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

  if (isShip(hit.entity)) {
    const damage = Math.min(weapon.damage, hit.entity.hp);
    events.push({
      type: 'PROJECTILE_HIT',
      shipId: ship.id,
      side,
      targetId: hit.entity.id,
      targetKind: 'ship',
      from: { ...ship.position },
      to: { ...hit.position },
      damage,
      phase,
    });
    events.push(...applyDamage(state, hit.entity, damage, phase));
  } else {
    events.push({
      type: 'PROJECTILE_HIT',
      shipId: ship.id,
      side,
      targetId: hit.entity.id,
      targetKind: hit.entity.kind,
      from: { ...ship.position },
      to: { ...hit.position },
      damage: 0,
      phase,
    });
  }

  return events;
}
