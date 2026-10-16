import type { MatchResult } from '@pirate/game-core/domain/MatchResult';
import type { BattleKind } from '../graph/types';

/** The kinds of upgrade a port can offer. */
export type UpgradeId =
  | 'reinforceHull'
  | 'addCannon'
  | 'cannonDamage'
  | 'cannonballs'
  | 'quickLoaders'
  | 'repair';

export const UPGRADE_IDS: readonly UpgradeId[] = [
  'reinforceHull',
  'addCannon',
  'cannonDamage',
  'cannonballs',
  'quickLoaders',
  'repair',
];

/**
 * Where the voyage stands.
 *  - `map`: at a node whose business is done; choose the next stop.
 *  - `port`: at a port, where the upgrades on offer can be bought with plunder until the ship sails on.
 *  - `battle`: at a battle or boss node; the fight is waiting for its result.
 *  - `victory`, `defeat`: the run is over.
 */
export type RunPhase = 'map' | 'port' | 'battle' | 'victory' | 'defeat';

export type DefeatReason = 'sunk' | 'abandoned';

/** Bumped when the saved shape changes, so an old save is refused, not misread. */
export const SAVE_VERSION = 5;

/**
 * Everything about a run, as plain data so it can be saved and loaded. The map
 * is not stored: it is built again from the seed, the area and the node id.
 */
export interface RunState {
  readonly version: typeof SAVE_VERSION;
  readonly seed: number;
  /** How many areas this run has (5 to start; fewer for a short playtest). */
  readonly areaCount: number;
  readonly areaIndex: number;
  /** The stop the ship is at. */
  readonly nodeId: string;
  /** The stops visited in this area, in order, the current one last. */
  readonly path: readonly string[];
  readonly phase: RunPhase;
  readonly defeatReason?: DefeatReason;

  /** 0 at the start; each hull upgrade adds one. It decides the class, and the maximum hull. */
  readonly hullLevel: number;
  readonly hull: number;
  /** Cannonballs in the hold, carried from battle to battle. */
  readonly ammo: number;
  /** Cannonballs added to the stock a port refills to. */
  readonly ammoBonus: number;
  readonly cannonsPerSide: number;
  /** Extra damage of each cannon. */
  readonly cannonDamage: number;
  /** Extra cannonballs reloaded each turn. */
  readonly reloadBonus: number;
  /** The voyage's money: earned in fights, spent on upgrades at ports. */
  readonly plunder: number;

  /**
   * Set once the fight at this stop has begun. A voyage found in this state when
   * it is loaded was left mid-battle, which counts as a loss: reloading the page
   * is not a way to retry a fight.
   */
  readonly battleStarted?: boolean;
  /** In a port: the upgrades still for sale. */
  readonly offer?: readonly UpgradeId[];
  /** Every upgrade taken so far, in order. */
  readonly upgrades: readonly UpgradeId[];
  readonly battlesWon: number;
  readonly legs: number;
}

/** What the player can do. */
export type RunAction =
  | { readonly type: 'travel'; readonly to: string }
  /** Buy one of the upgrades for sale at the port. */
  | { readonly type: 'buyUpgrade'; readonly upgrade: UpgradeId }
  /** Sail on from the port; the upgrades not bought are gone. */
  | { readonly type: 'leavePort' }
  | { readonly type: 'finishBattle'; readonly result: MatchResult }
  /** The fight at the ship's stop has begun (and cannot be taken back). */
  | { readonly type: 'startBattle' }
  /** The hero was sunk and left the fight before it ended. */
  | { readonly type: 'loseBattle' }
  | { readonly type: 'abandon' };

/** Things that happened, for the screens to tell the player about. */
export type RunEvent =
  | { readonly type: 'travelled'; readonly to: string }
  | { readonly type: 'portArrival'; readonly landfall: boolean; readonly repaired: number; readonly ammoGained: number }
  | { readonly type: 'upgraded'; readonly upgrade: UpgradeId; readonly price: number; readonly refit?: { readonly from: string; readonly to: string } }
  | {
      readonly type: 'battleWon';
      readonly kind: BattleKind | 'boss' | 'hunt';
      readonly plunderGained: number;
      /** A hunt: the treasure banked, and whether the Kraken was slain. */
      readonly haul?: number;
      readonly bossSlain?: boolean;
    }
  /** An objective failed with the ship still afloat: no reward, but the voyage goes on. */
  | { readonly type: 'battleLost'; readonly kind: BattleKind }
  | { readonly type: 'areaCleared'; readonly areaIndex: number }
  | { readonly type: 'victory' }
  | { readonly type: 'defeat'; readonly reason: DefeatReason };

export type RunStep =
  | { readonly ok: true; readonly state: RunState; readonly events: readonly RunEvent[] }
  | { readonly ok: false; readonly error: string };
