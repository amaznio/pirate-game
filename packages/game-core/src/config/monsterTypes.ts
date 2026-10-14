import type { LashSide, MonsterTypeId } from '../domain/Monster';

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
  },
};

export const MONSTER_TYPE_IDS = Object.keys(MONSTER_TYPES) as MonsterTypeId[];

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
