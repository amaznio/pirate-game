import { useState } from 'react';

const NAME_KEY = 'pirate:name';

function load(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/** The player's display name, remembered between visits. */
export function useStoredName(): [string, (name: string) => void] {
  const [name, setName] = useState(load);

  const update = (next: string) => {
    setName(next);
    try {
      window.localStorage.setItem(NAME_KEY, next);
    } catch {
      // Not being able to remember a name is fine.
    }
  };

  return [name, update];
}
