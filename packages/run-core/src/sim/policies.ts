import { createRng } from '../rng';
import type { RouteNode } from '../graph/types';
import { cargoCapFor, maxHullFor } from '../run/rules';
import type { RunState, UpgradeId } from '../run/types';

/**
 * How a simulated player chooses. A real player is smarter and dumber than any
 * rule, so these are only meant to be a steady yardstick: the same bot over the
 * same seeds, before and after a change to the numbers.
 */

export type RoutePolicy = 'smart' | 'first' | 'random';

/** How risky a battle node is to a careful player (lower is worse). */
const BATTLE_APPEAL: Readonly<Record<string, number>> = {
  standard: 0,
  salvage: -0.5,
  survive: -0.5,
  merchant: -0.5,
  ambush: -1.5,
  boss: 0,
};

/** Picks the next stop. A careful player heads for a port when hurt or short of supplies. */
export function chooseRoute(state: RunState, options: readonly RouteNode[], policy: RoutePolicy): RouteNode {
  if (policy === 'first' || options.length === 1) {
    return options[0]!;
  }
  if (policy === 'random') {
    const rng = createRng(state.seed, 'route', state.nodeId);
    return options[Math.floor(rng() * options.length)]!;
  }
  const hurt = state.hull <= maxHullFor(state.hullLevel) * 0.6;
  const hungry = state.supplies <= cargoCapFor(state.hullLevel) * 0.4;
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const node of options) {
    const score =
      node.kind === 'port'
        ? hurt || hungry
          ? 3
          : 1
        : (BATTLE_APPEAL[node.kind === 'boss' ? 'boss' : node.battle ?? 'standard'] ?? 0);
    if (score > bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return best;
}

/** Growth first, then the things that keep the ship afloat, in that order. */
const PRIORITY: readonly UpgradeId[] = [
  'reinforceHull',
  'addCannon',
  'cannonDamage',
  'cannonballs',
  'provisions',
  'repair',
];

/** Picks the upgrade: mend when badly hurt, stock up when short, else grow. */
export function chooseUpgrade(state: RunState, offer: readonly UpgradeId[]): UpgradeId {
  const hurt = state.hull <= maxHullFor(state.hullLevel) * 0.5;
  const hungry = state.supplies <= cargoCapFor(state.hullLevel) * 0.35;
  if (hurt && offer.includes('repair')) {
    return 'repair';
  }
  if (hungry && offer.includes('provisions')) {
    return 'provisions';
  }
  return PRIORITY.find((id) => offer.includes(id)) ?? offer[0]!;
}
