import type { RoomVisibility } from '@pirate/game-core/protocol/messages';

/** How the two kinds of room are named and described. */
export const VISIBILITY_CHOICES: ReadonlyArray<{
  readonly value: RoomVisibility;
  readonly label: string;
  readonly blurb: string;
}> = [
  {
    value: 'private',
    label: 'Private',
    blurb: 'Not listed. Only people you give the room key to can join.',
  },
  {
    value: 'public',
    label: 'Public',
    blurb: 'Listed for everyone, who can join with one click.',
  },
];

export function visibilityBlurb(value: RoomVisibility): string {
  return VISIBILITY_CHOICES.find((choice) => choice.value === value)?.blurb ?? '';
}

/** What to call the thing you give a friend. */
export function shareCodeLabel(value: RoomVisibility): string {
  return value === 'public' ? 'Room code' : 'Room key';
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
