import type { Ship } from '../domain/Ship';
import type { GameEvent } from '../domain/GameEvent';
import type { MutableGameState } from './internal';

/**
 * Applies hull damage to a ship in the mutable draft and returns the resulting
 * events (SHIP_DAMAGED, and SHIP_DESTROYED when the hull reaches zero).
 */
export function applyDamage(
  state: MutableGameState,
  target: Ship,
  amount: number,
  phase: number,
): GameEvent[] {
  const damage = Math.max(0, Math.min(amount, target.hp));
  const hp = target.hp - damage;
  state.ships[target.id] = { ...target, hp };

  const events: GameEvent[] = [
    {
      type: 'SHIP_DAMAGED',
      shipId: target.id,
      amount: damage,
      hp,
      maxHp: target.maxHp,
      phase,
    },
  ];

  if (hp <= 0) {
    events.push({ type: 'SHIP_DESTROYED', shipId: target.id, phase });
  }

  return events;
}
