import { useState } from 'react';
import {
  DEFAULT_MAP_STYLE,
  MAP_STYLES,
  type MapStyle,
} from '@pirate/game-core/board/generateBoard';

const KEY = 'pirate:mapStyle';

function load(): MapStyle {
  try {
    const saved = window.localStorage.getItem(KEY);
    return MAP_STYLES.find((style) => style === saved) ?? DEFAULT_MAP_STYLE;
  } catch {
    return DEFAULT_MAP_STYLE;
  }
}

/** The kind of sea the player last chose, remembered between visits. */
export function useStoredMapStyle(): [MapStyle, (style: MapStyle) => void] {
  const [style, setStyle] = useState(load);

  const update = (next: MapStyle) => {
    setStyle(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Not being able to remember the choice is fine.
    }
  };

  return [style, update];
}
