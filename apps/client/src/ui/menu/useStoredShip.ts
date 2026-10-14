import { useState } from 'react';
import { DEFAULT_SHIP_TYPE_ID, isPlayableShipType } from '@pirate/game-core/config/shipTypes';

const KEY = 'pirate:ship';

/** A saved ship id read back: only a class a player can sail counts, else the default. */
export function parseStoredShip(saved: string | null): string {
  return saved !== null && isPlayableShipType(saved) ? saved : DEFAULT_SHIP_TYPE_ID;
}

/** The ship the player last chose, from the last visit (the Sloop if none). */
export function loadStoredShip(): string {
  try {
    return parseStoredShip(window.localStorage.getItem(KEY));
  } catch {
    return DEFAULT_SHIP_TYPE_ID;
  }
}

export function saveStoredShip(shipTypeId: string): void {
  try {
    window.localStorage.setItem(KEY, shipTypeId);
  } catch {
    // Not being able to remember the choice is fine.
  }
}

/**
 * The player's own ship, remembered between visits and shared by Quick battle
 * and the online lobby, so a Galleon captain is not put back in a Sloop.
 */
export function useStoredShip(): [string, (shipTypeId: string) => void] {
  const [ship, setShip] = useState(loadStoredShip);
  const update = (next: string) => {
    setShip(next);
    saveStoredShip(next);
  };
  return [ship, update];
}
