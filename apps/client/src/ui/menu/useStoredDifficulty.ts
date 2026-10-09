import { useState } from 'react';
import {
  AI_DIFFICULTIES,
  DEFAULT_AI_DIFFICULTY,
  type AiDifficulty,
} from '@pirate/game-core/domain/GameState';

const KEY = 'pirate:difficulty';

function load(): AiDifficulty {
  try {
    const saved = window.localStorage.getItem(KEY);
    return AI_DIFFICULTIES.find((level) => level === saved) ?? DEFAULT_AI_DIFFICULTY;
  } catch {
    return DEFAULT_AI_DIFFICULTY;
  }
}

/** The AI difficulty the player last chose, remembered between visits. */
export function useStoredDifficulty(): [AiDifficulty, (level: AiDifficulty) => void] {
  const [level, setLevel] = useState(load);

  const update = (next: AiDifficulty) => {
    setLevel(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Not being able to remember the choice is fine.
    }
  };

  return [level, update];
}
