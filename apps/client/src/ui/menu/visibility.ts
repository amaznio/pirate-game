import type { TFunction } from 'i18next';
import type { RoomVisibility } from '@pirate/game-core/protocol/messages';

/** How the two kinds of room are named and described (private first). */
export const VISIBILITY_CHOICES: readonly RoomVisibility[] = ['private', 'public'];

const KEYS = {
  private: {
    label: 'roomVisibility.private.label',
    blurb: 'roomVisibility.private.blurb',
  },
  public: {
    label: 'roomVisibility.public.label',
    blurb: 'roomVisibility.public.blurb',
  },
} as const satisfies Record<RoomVisibility, { label: string; blurb: string }>;

export function visibilityLabel(t: TFunction, value: RoomVisibility): string {
  return t(KEYS[value].label);
}

export function visibilityBlurb(t: TFunction, value: RoomVisibility): string {
  return t(KEYS[value].blurb);
}

/** What to call the thing you give a friend. */
export function shareCodeLabel(t: TFunction, value: RoomVisibility): string {
  return value === 'public' ? t('roomVisibility.codeLabel') : t('roomVisibility.keyLabel');
}

const KEY = 'pirate:visibility';

/** The visibility the player last chose for a new room (private if none). */
export function loadVisibility(): RoomVisibility {
  try {
    return window.localStorage.getItem(KEY) === 'public' ? 'public' : 'private';
  } catch {
    return 'private';
  }
}

export function saveVisibility(value: RoomVisibility): void {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // Not being able to remember the choice is fine.
  }
}
