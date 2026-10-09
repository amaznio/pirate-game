import { describe, expect, it } from 'vitest';
import {
  draftIsEmpty,
  emptyDraft,
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
    expect(on.cannons[0].left).toBe(true);
    expect(remainingTokens(POOL, on)).toEqual(POOL);

    const off = toggleCannon(on, 3, 0, 'left');
    expect(off.cannons[0].left).toBe(false);
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

    expect(draft.cannons[0].left).toBe(false);
  });
});

describe('draftIsEmpty', () => {
  it('is true only when nothing is planned', () => {
    expect(draftIsEmpty(emptyDraft())).toBe(true);
    expect(draftIsEmpty(queueToken(emptyDraft(), POOL, 'FORWARD'))).toBe(false);
    expect(draftIsEmpty(toggleCannon(emptyDraft(), 3, 0, 'left'))).toBe(false);
  });
});
