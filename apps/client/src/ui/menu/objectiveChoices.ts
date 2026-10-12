import type { TFunction } from 'i18next';
import {
  DEFAULT_OBJECTIVES,
  type Objective,
  type ObjectiveKind,
} from '@pirate/game-core/domain/Objective';

/** What the menu offers: an ordinary battle, or one of the objectives. */
export type ObjectiveChoice = 'standard' | ObjectiveKind;

export const OBJECTIVE_CHOICES: readonly ObjectiveChoice[] = [
  'standard',
  'survive',
  'salvage',
  'merchant',
  'ambush',
];

/** The objective a menu choice stands for (none for a standard battle). */
export function objectiveFor(choice: ObjectiveChoice): Objective | undefined {
  return choice === 'standard' ? undefined : DEFAULT_OBJECTIVES[choice];
}

export function objectiveLabel(t: TFunction, choice: ObjectiveChoice): string {
  switch (choice) {
    case 'standard':
      return t('menu.objectiveStandard');
    case 'survive':
      return t('menu.objectiveSurvive');
    case 'salvage':
      return t('menu.objectiveSalvage');
    case 'merchant':
      return t('menu.objectiveMerchant');
    case 'ambush':
      return t('menu.objectiveAmbush');
  }
}

export function objectiveBlurb(t: TFunction, choice: ObjectiveChoice): string {
  const objective = objectiveFor(choice);
  switch (choice) {
    case 'standard':
      return t('menu.objectiveBlurb.standard');
    case 'survive':
      return t('menu.objectiveBlurb.survive', {
        turns: objective?.kind === 'survive' ? objective.turns : 0,
      });
    case 'salvage':
      return t('menu.objectiveBlurb.salvage', {
        target: objective?.kind === 'salvage' ? objective.target : 0,
      });
    case 'merchant':
      return t('menu.objectiveBlurb.merchant', {
        turns: objective?.kind === 'merchant' ? objective.turns : 0,
      });
    case 'ambush':
      return t('menu.objectiveBlurb.ambush', {
        turns: objective?.kind === 'ambush' ? objective.turns : 0,
      });
  }
}
