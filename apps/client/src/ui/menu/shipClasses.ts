import type { TFunction } from 'i18next';
import { SHIP_TYPES, getShipType, playableShipTypeIds } from '@pirate/game-core/config/shipTypes';
import { tDynamic } from '../../i18n/translate';

/** The ship classes on offer in the menus, smallest first (ids). */
export const SHIP_CHOICES: readonly string[] = playableShipTypeIds();

/** A ship class's name, from the catalog (falling back to the config name). */
export function shipLabel(t: TFunction, shipTypeId: string): string {
  const type = SHIP_TYPES[shipTypeId];
  return tDynamic(t, `ship.${shipTypeId}.name`, { defaultValue: type?.name ?? shipTypeId });
}

/** A ship class's one-line description plus its hull, for the menus. */
export function shipBlurb(t: TFunction, shipTypeId: string): string {
  if (!SHIP_TYPES[shipTypeId]) {
    return '';
  }
  const type = getShipType(shipTypeId);
  const description = tDynamic(t, `ship.${shipTypeId}.description`, {
    defaultValue: type.description,
  });
  return `${description} ${t('ship.hull', { hp: type.maxHp })}`;
}
