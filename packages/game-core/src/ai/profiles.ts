import type { AiDifficulty } from '../domain/GameState';

/**
 * What an AI cares about and how well it plays. Difficulty is nothing more than
 * a profile, so tuning a level (or adding one) means editing numbers here.
 *
 * A plan is scored as:  shots that land
 *                       -  how many moves it still needs to reach a firing
 *                          position (0 when it ends up in one)
 *                       -  what its movement tokens cost
 *                       -  how exposed the final position is  (hard only)
 */
export interface AiProfile {
  readonly label: string;

  // What a plan is worth.
  /** Score for each shot that would hit an enemy. */
  readonly hitValue: number;
  /** Extra score when that shot would sink the ship. */
  readonly killBonus: number;
  /**
   * Score lost for every move still needed to get into a position from which a
   * broadside hits the target. This is what draws the AI toward its target,
   * going round it when it has to, instead of just closing the distance.
   */
  readonly approachWeight: number;
  /** Score lost per cell of plain distance to the target (a tie-breaker). */
  readonly distanceWeight: number;
  /** Score lost per movement token spent: a reason to hold when a move is not worth it. */
  readonly tokenCost: number;
  /** Score lost for each enemy broadside that covers the final position. */
  readonly dangerWeight: number;
  /** Score lost for ending close to the edge of the board (a corner is a trap). */
  readonly edgeWeight: number;

  // How well it plays.
  /** Most movement tokens it will spend in a turn. */
  readonly maxMoves: number;
  /** Chance it picks one of the next-best plans instead of the best. */
  readonly mistakeRate: number;
  /** How many of the best plans a mistake is chosen from. */
  readonly mistakePool: number;
  /** Chance it actually takes a shot that is available. */
  readonly fireChance: number;
}

export const AI_PROFILES: Readonly<Record<AiDifficulty, AiProfile>> = {
  /** Slow to react and often distracted, but it still heads for you. */
  easy: {
    label: 'Easy',
    hitValue: 50,
    killBonus: 0,
    approachWeight: 5,
    distanceWeight: 0.5,
    tokenCost: 0,
    dangerWeight: 0,
    edgeWeight: 0,
    maxMoves: 2,
    mistakeRate: 0.5,
    mistakePool: 6,
    fireChance: 0.6,
  },
  /** Plans well and hunts you down, with the odd slip. */
  normal: {
    label: 'Normal',
    hitValue: 50,
    killBonus: 30,
    approachWeight: 8,
    distanceWeight: 0.5,
    tokenCost: 3,
    dangerWeight: 0,
    edgeWeight: 0,
    maxMoves: 4,
    mistakeRate: 0.1,
    mistakePool: 3,
    fireChance: 1,
  },
  /** Plays the best plan it can find, and keeps out of your line of fire. */
  hard: {
    label: 'Hard',
    hitValue: 60,
    killBonus: 40,
    approachWeight: 8,
    distanceWeight: 0.5,
    tokenCost: 4,
    dangerWeight: 25,
    edgeWeight: 5,
    maxMoves: 4,
    mistakeRate: 0,
    mistakePool: 1,
    fireChance: 1,
  },
};

export function profileFor(difficulty: AiDifficulty): AiProfile {
  return AI_PROFILES[difficulty];
}
