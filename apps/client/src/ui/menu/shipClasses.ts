import { SHIP_TYPES } from '@pirate/game-core/config/shipTypes';

/** The ship classes on offer in the menus, smallest first. */
export const SHIP_CHOICES: ReadonlyArray<{
  readonly value: string;
  readonly label: string;
  readonly blurb: string;
}> = Object.values(SHIP_TYPES).map((type) => ({
  value: type.id,
  label: type.name,
  blurb: `${type.description} Hull ${type.maxHp}.`,
}));

/** A ship class's name, or the id itself if it is not one we know. */
export function shipLabel(shipTypeId: string): string {
  return SHIP_CHOICES.find((choice) => choice.value === shipTypeId)?.label ?? shipTypeId;
}

export function shipBlurb(shipTypeId: string): string {
  return SHIP_CHOICES.find((choice) => choice.value === shipTypeId)?.blurb ?? '';
}
