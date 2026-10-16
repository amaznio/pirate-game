import { createRng } from '../rng';
import type { RouteNode } from '../graph/types';
import { UPGRADE_PRICE, maxHullFor } from '../run/rules';
import { canTake } from '../run/upgrades';
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
  hunt: -1,
};

/** Picks the next stop. A careful player heads for a port when hurt. */
export function chooseRoute(state: RunState, options: readonly RouteNode[], policy: RoutePolicy): RouteNode {
  if (policy === 'first' || options.length === 1) {
    return options[0]!;
  }
  if (policy === 'random') {
    const rng = createRng(state.seed, 'route', state.nodeId);
    return options[Math.floor(rng() * options.length)]!;
  }
  const hurt = state.hull <= maxHullFor(state.hullLevel) * 0.6;
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const node of options) {
    const score =
      node.kind === 'port'
        ? hurt
          ? 3
          : 1
        : (BATTLE_APPEAL[node.kind === 'boss' || node.kind === 'hunt' ? node.kind : node.battle ?? 'standard'] ?? 0);
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
  'repair',
];

/**
 * The next upgrade to buy at a shop, or null to sail on: mend first when badly hurt, else the
 * best thing on the list the ship can use and pay for. It never saves up for something dearer.
 */
export function chooseUpgrade(state: RunState, offer: readonly UpgradeId[]): UpgradeId | null {
  const buyable = offer.filter((id) => canTake(state, id) && UPGRADE_PRICE[id] <= state.plunder);
  const hurt = state.hull <= maxHullFor(state.hullLevel) * 0.5;
  if (hurt && buyable.includes('repair')) {
    return 'repair';
  }
  return PRIORITY.find((id) => buyable.includes(id) && id !== 'repair') ?? null;
}
