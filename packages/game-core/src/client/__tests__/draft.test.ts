import { describe, expect, it } from 'vitest';
import {
  draftIsEmpty,
  emptyDraft,
  moveToken,
  placeToken,
  queueToken,
  remainingAmmo,
  remainingTokens,
  removeToken,
  toggleCannon,
} from '../draft';

const POOL = { FORWARD: 3, TURN_LEFT: 2, TURN_RIGHT: 1 };

describe('queueToken', () => {
  it('fills the first empty slot and uses up a token', () => {
    const draft = queueToken(emptyDraft(), POOL, 'FORWARD');

    expect(draft.movement).toEqual(['FORWARD', null, null, null]);
    expect(remainingTokens(POOL, draft).FORWARD).toBe(2);
  });

  it('fills a chosen slot so earlier phases can stay empty', () => {
    const draft = queueToken(emptyDraft(), POOL, 'FORWARD', 2);

    expect(draft.movement).toEqual([null, null, 'FORWARD', null]);
  });

  it('falls back to the first empty slot when the chosen one is taken', () => {
    let draft = queueToken(emptyDraft(), POOL, 'FORWARD', 0);
    draft = queueToken(draft, POOL, 'TURN_LEFT', 0);

    expect(draft.movement).toEqual(['FORWARD', 'TURN_LEFT', null, null]);
  });

  it('cannot queue a token that has run out', () => {
    const draft = queueToken(emptyDraft(), POOL, 'TURN_RIGHT');
    const again = queueToken(draft, POOL, 'TURN_RIGHT');

    expect(again).toBe(draft);
    expect(remainingTokens(POOL, again).TURN_RIGHT).toBe(0);
  });

  it('cannot queue into a full plan', () => {
    let draft = emptyDraft();
    draft = queueToken(draft, POOL, 'FORWARD');
    draft = queueToken(draft, POOL, 'FORWARD');
    draft = queueToken(draft, POOL, 'FORWARD');
    draft = queueToken(draft, POOL, 'TURN_LEFT');
    const full = queueToken(draft, POOL, 'TURN_LEFT');

    expect(draft.movement.every((slot) => slot !== null)).toBe(true);
    expect(full).toBe(draft);
  });

  it('does not change the draft it was given', () => {
    const before = emptyDraft();
    queueToken(before, POOL, 'FORWARD');

    expect(before.movement).toEqual([null, null, null, null]);
  });
});

describe('removeToken', () => {
  it('empties the slot and gives the token back', () => {
    const draft = removeToken(queueToken(emptyDraft(), POOL, 'FORWARD'), 0);

    expect(draft.movement[0]).toBeNull();
    expect(remainingTokens(POOL, draft)).toEqual(POOL);
  });

  it('ignores an empty slot', () => {
    const draft = emptyDraft();
    expect(removeToken(draft, 1)).toBe(draft);
  });
});

describe('toggleCannon', () => {
  it('turns a broadside on and off without touching movement tokens', () => {
    const on = toggleCannon(emptyDraft(), 3, 0, 'left');
    expect(on.cannons[0].left).toBe(1);
    expect(remainingTokens(POOL, on)).toEqual(POOL);

    const off = toggleCannon(on, 3, 0, 'left');
    expect(off.cannons[0].left).toBe(0);
  });

  it('cannot queue more shots than the cannonball pool', () => {
    let draft = emptyDraft();
    draft = toggleCannon(draft, 3, 0, 'left');
    draft = toggleCannon(draft, 3, 0, 'right');
    draft = toggleCannon(draft, 3, 1, 'left');
    const blocked = toggleCannon(draft, 3, 1, 'right');

    expect(remainingAmmo(3, draft.cannons)).toBe(0);
    expect(blocked).toBe(draft);
  });

  it('can always switch a queued shot off, even with no ammo left', () => {
    let draft = toggleCannon(emptyDraft(), 1, 0, 'left');
    draft = toggleCannon(draft, 1, 0, 'left');

    expect(draft.cannons[0].left).toBe(0);
  });
});

describe('draftIsEmpty', () => {
  it('is true only when nothing is planned', () => {
    expect(draftIsEmpty(emptyDraft())).toBe(true);
    expect(draftIsEmpty(queueToken(emptyDraft(), POOL, 'FORWARD'))).toBe(false);
    expect(draftIsEmpty(toggleCannon(emptyDraft(), 3, 0, 'left'))).toBe(false);
  });
});

describe('placeToken', () => {
  it('puts a token in exactly the chosen slot, even past empty ones', () => {
    const draft = placeToken(emptyDraft(), POOL, 'FORWARD', 3);

    expect(draft.movement).toEqual([null, null, null, 'FORWARD']);
    expect(remainingTokens(POOL, draft).FORWARD).toBe(2);
  });

  it('replaces what is in the slot and gives that token back', () => {
    let draft = queueToken(emptyDraft(), POOL, 'FORWARD', 1);
    draft = placeToken(draft, POOL, 'TURN_LEFT', 1);

    expect(draft.movement).toEqual([null, 'TURN_LEFT', null, null]);
    expect(remainingTokens(POOL, draft)).toEqual({ FORWARD: 3, TURN_LEFT: 1, TURN_RIGHT: 1 });
  });

  it('can replace a token with one of the same kind it just freed, when none is left', () => {
    const one = { FORWARD: 1, TURN_LEFT: 0, TURN_RIGHT: 0 };
    let draft = queueToken(emptyDraft(), one, 'FORWARD', 0);
    // The only forward is in slot 0: dropping it on slot 2 asks for a second one, which there is not.
    expect(placeToken(draft, one, 'FORWARD', 2)).toBe(draft);
    // Dropping it on the slot it is in changes nothing.
    expect(placeToken(draft, one, 'FORWARD', 0)).toBe(draft);
    draft = queueToken(emptyDraft(), one, 'FORWARD', 2);
    expect(placeToken(draft, one, 'FORWARD', 2)).toBe(draft);
  });

  it('does nothing with no token left or a slot that is not there', () => {
    const none = { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 };
    const draft = emptyDraft();
    expect(placeToken(draft, none, 'FORWARD', 0)).toBe(draft);
    expect(placeToken(draft, POOL, 'FORWARD', 4)).toBe(draft);
    expect(placeToken(draft, POOL, 'FORWARD', -1)).toBe(draft);
  });

  it('does not change the draft it was given', () => {
    const draft = emptyDraft();
    placeToken(draft, POOL, 'FORWARD', 0);
    expect(draft.movement).toEqual([null, null, null, null]);
  });
});

describe('moveToken', () => {
  it('moves a token to an empty slot', () => {
    const draft = moveToken(queueToken(emptyDraft(), POOL, 'FORWARD', 0), 0, 2);

    expect(draft.movement).toEqual([null, null, 'FORWARD', null]);
    expect(remainingTokens(POOL, draft).FORWARD).toBe(2);
  });

  it('swaps two filled slots', () => {
    let draft = queueToken(emptyDraft(), POOL, 'FORWARD', 0);
    draft = queueToken(draft, POOL, 'TURN_LEFT', 1);

    expect(moveToken(draft, 0, 1).movement).toEqual(['TURN_LEFT', 'FORWARD', null, null]);
  });

  it('ignores an empty source, the same slot and slots that are not there', () => {
    const draft = queueToken(emptyDraft(), POOL, 'FORWARD', 0);
    expect(moveToken(draft, 1, 2)).toBe(draft);
    expect(moveToken(draft, 0, 0)).toBe(draft);
    expect(moveToken(draft, 0, 9)).toBe(draft);
    expect(moveToken(draft, -1, 0)).toBe(draft);
  });
});
