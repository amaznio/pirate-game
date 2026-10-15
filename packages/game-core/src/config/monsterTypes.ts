import type { LashSide, MonsterTypeId } from '../domain/Monster';

/** When a monster surfaces others, and what it surfaces. */
export interface MonsterSpawnRule {
  readonly typeId: MonsterTypeId;
  /** A fresh one every this many turns (0 for never). */
  readonly everyTurns: number;
  /** How many that timer brings. */
  readonly timerCount: number;
  /** Shares of its hull (1 is whole) that each bring a wave when it falls to them. */
  readonly hpThresholds: readonly number[];
  /** How many each of those waves brings. */
  readonly thresholdCount: number;
  /** Most it may have afloat at once. */
  readonly max: number;
  /** How far from its body they rise, nearest and furthest (Chebyshev distance). */
  readonly reach: readonly [number, number];
}

export interface MonsterType {
  readonly id: MonsterTypeId;
  readonly name: string;
  /** Cells it fills along its heading. */
  readonly length: number;
  readonly maxHp: number;
  /** Hull a ship loses to one lash. */
  readonly lashDamage: number;
  /** How many lashes it plans each turn (each in a different phase). */
  readonly lashesPerTurn: number;
  /** Which cells beside or ahead of its bow it can lash. */
  readonly lashSides: readonly LashSide[];
  /**
   * How many of a turn's four phases it spends sailing; 0 means it never moves.
   * Only a one-cell monster may sail, so that it moves through wind, whirlpools and
   * other ships by exactly the rules a ship does.
   */
  readonly movesPerTurn: number;
  /**
   * It has no front: it steps and strikes in any of the four directions, taking
   * that heading for the phase, instead of sailing forward and turning like a ship.
   * Everything else about moving is the ship rules, so it still stops at rocks and
   * other ships and is carried by wind and whirlpools.
   */
  readonly omnidirectional?: boolean;
  /** What it surfaces during the match, if anything. */
  readonly spawns?: MonsterSpawnRule;
  /** The treasure chests it leaves when it is sunk in a hunt: how many, and what each is worth. */
  readonly drop?: { readonly chests: number; readonly value: number };
  /**
   * What it is when it is the boss of a hunt: its title, its hull and what it drops
   * (in place of `maxHp` and `drop`). Absent means it cannot be a boss.
   */
  readonly boss?: {
    readonly title: string;
    readonly maxHp: number;
    readonly drop: { readonly chests: number; readonly value: number };
  };
  /** Only ever surfaced by another monster; never chosen for a match. */
  readonly summoned?: boolean;
}

/**
 * Add new monsters here. The simulation reads every number from this config,
 * so no monster rules are hardcoded elsewhere. All of these are first guesses
 * to be tuned by playing.
 */
export const MONSTER_TYPES: Readonly<Record<MonsterTypeId, MonsterType>> = {
  'giant-squid': {
    id: 'giant-squid',
    name: 'Giant squid',
    length: 2,
    maxHp: 10,
    lashDamage: 2,
    lashesPerTurn: 2,
    lashSides: ['left', 'right', 'front'],
    movesPerTurn: 0,
    drop: { chests: 4, value: 5 },
    boss: { title: 'The Kraken', maxHp: 15, drop: { chests: 8, value: 5 } },
    spawns: {
      typeId: 'tentacle',
      everyTurns: 3,
      timerCount: 1,
      hpThresholds: [0.7, 0.4],
      thresholdCount: 2,
      max: 4,
      reach: [2, 4],
    },
  },
  squid: {
    id: 'squid',
    name: 'Squid',
    length: 1,
    maxHp: 6,
    lashDamage: 2,
    lashesPerTurn: 1,
    lashSides: ['front'],
    movesPerTurn: 2,
    drop: { chests: 2, value: 2 },
  },
  tentacle: {
    id: 'tentacle',
    name: 'Tentacle',
    length: 1,
    maxHp: 2,
    lashDamage: 1,
    lashesPerTurn: 1,
    lashSides: ['front'],
    movesPerTurn: 1,
    omnidirectional: true,
    summoned: true,
    drop: { chests: 1, value: 1 },
  },
  shark: {
    id: 'shark',
    name: 'Shark',
    length: 1,
    maxHp: 4,
    lashDamage: 1,
    lashesPerTurn: 2,
    lashSides: ['front'],
    movesPerTurn: 3,
    drop: { chests: 1, value: 2 },
  },
};

export const MONSTER_TYPE_IDS = Object.keys(MONSTER_TYPES) as MonsterTypeId[];

/** The monsters a match can be started with (not the ones another monster surfaces). */
export const SELECTABLE_MONSTER_TYPE_IDS = MONSTER_TYPE_IDS.filter((id) => !MONSTER_TYPES[id].summoned);

export function getMonsterType(id: MonsterTypeId): MonsterType {
  const type = MONSTER_TYPES[id];
  if (!type) {
    throw new Error(`Unknown monster type: ${id}`);
  }
  return type;
}

/** Whether a monster of this type sails. */
export function isMobileType(type: MonsterType): boolean {
  return type.movesPerTurn > 0;
}
