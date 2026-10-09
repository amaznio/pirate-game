import type { AiDifficulty } from '@pirate/game-core/domain/GameState';

/** How each AI level is named and described in the menus. */
export const AI_LEVELS: ReadonlyArray<{
  readonly value: AiDifficulty;
  readonly label: string;
  readonly blurb: string;
}> = [
  {
    value: 'easy',
    label: 'Easy',
    blurb: 'Slow to react and easily distracted. A good first voyage.',
  },
  {
    value: 'normal',
    label: 'Normal',
    blurb: 'Plans ahead and hunts you down, with the odd slip.',
  },
  {
    value: 'hard',
    label: 'Hard',
    blurb: 'Plays its best plan and keeps out of your line of fire.',
  },
];

export function aiLevelLabel(level: AiDifficulty): string {
  return AI_LEVELS.find((entry) => entry.value === level)?.label ?? level;
}

export function aiLevelBlurb(level: AiDifficulty): string {
  return AI_LEVELS.find((entry) => entry.value === level)?.blurb ?? '';
}
