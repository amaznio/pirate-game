import type { TFunction } from 'i18next';
import type { AiDifficulty } from '@pirate/game-core/domain/GameState';

/** The AI levels, easiest first. Names and blurbs live in the i18n catalogs. */
export const AI_LEVELS: readonly AiDifficulty[] = ['easy', 'normal', 'hard'];

/** Typed key lookup, so a wrong key is a compile error. */
const KEYS = {
  easy: { label: 'difficulty.easy.label', blurb: 'difficulty.easy.blurb' },
  normal: { label: 'difficulty.normal.label', blurb: 'difficulty.normal.blurb' },
  hard: { label: 'difficulty.hard.label', blurb: 'difficulty.hard.blurb' },
} as const satisfies Record<AiDifficulty, { label: string; blurb: string }>;

export function aiLevelLabel(t: TFunction, level: AiDifficulty): string {
  return t(KEYS[level].label);
}

export function aiLevelBlurb(t: TFunction, level: AiDifficulty): string {
  return t(KEYS[level].blurb);
}
