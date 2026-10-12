import { describe, expect, it } from 'vitest';
import type { TokenGenerationConfig } from '../../domain/GameState';
import { totalTokens, type TokenInventory } from '../../domain/Action';
import { getShipType, tokenEconomyOf } from '../../config/shipTypes';
import { produceTokens } from '../tokens';

const empty: TokenInventory = { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 };
const auto: TokenGenerationConfig = { auto: true, requested: 'FORWARD', rotationIndex: 0 };
const manual = (requested: TokenGenerationConfig['requested']): TokenGenerationConfig => ({
  auto: false,
  requested,
  rotationIndex: 0,
});

const sloop = tokenEconomyOf(getShipType('sloop'));
const galleon = tokenEconomyOf(getShipType('galleon'));

/** Plays `turns` turns of income into a hold, nothing ever spent. */
function grow(hold: TokenInventory, economy: typeof sloop, turns: number) {
  let current = hold;
  let generation = auto;
  const made: string[] = [];
  for (let i = 0; i < turns; i += 1) {
    const out = produceTokens(current, generation, economy, economy.perTurn);
    current = out.tokens;
    generation = out.tokenGeneration;
    made.push(...out.made);
  }
  return { hold: current, made };
}

describe('balanced production (auto)', () => {
  it('builds each class towards its own mix: a sloop two parts forward to one of each turn', () => {
    const { hold } = grow(empty, sloop, 3);
    expect(totalTokens(hold)).toBe(6);
    expect(hold).toEqual({ FORWARD: 3, TURN_LEFT: 2, TURN_RIGHT: 1 });
  });

  it('keeps a galleon forward-heavy, but it always gets turns too', () => {
    const { hold } = grow(empty, galleon, 3);
    expect(totalTokens(hold)).toBe(12);
    expect(hold.FORWARD).toBeGreaterThanOrEqual(8);
    expect(hold.TURN_LEFT).toBeGreaterThanOrEqual(1);
    expect(hold.TURN_RIGHT).toBeGreaterThanOrEqual(1);
  });

  it('makes what the hold is short of, not the next entry of a fixed order', () => {
    // Plenty of forwards and lefts, no rights: the next tokens are rights.
    const { made } = produceTokens(
      { FORWARD: 4, TURN_LEFT: 2, TURN_RIGHT: 0 },
      auto,
      { ...sloop, cap: null },
      1,
    );
    expect(made).toEqual(['TURN_RIGHT']);
  });

  it('lets the class order decide between equally short types, and moves the order on', () => {
    const first = produceTokens(empty, auto, sloop, 1);
    expect(first.made).toEqual(['FORWARD']);
    expect(first.tokenGeneration.rotationIndex).toBe(1);
  });

  it('is deterministic', () => {
    expect(grow(empty, galleon, 4)).toEqual(grow(empty, galleon, 4));
  });
});

describe('at the cap', () => {
  it('does not make you spend tokens to make room: it swaps the surplus for what you lack', () => {
    const full = { FORWARD: 11, TURN_LEFT: 3, TURN_RIGHT: 0 }; // a galleon at its cap of 14
    expect(totalTokens(full)).toBe(galleon.cap);

    const out = produceTokens(full, auto, galleon, 4);

    expect(totalTokens(out.tokens)).toBe(14);
    expect(out.tokens.TURN_RIGHT).toBeGreaterThanOrEqual(1);
    expect(out.tokens.TURN_LEFT).toBeLessThan(3);
  });

  it('leaves a balanced hold alone instead of swapping back and forth', () => {
    const balanced = { FORWARD: 5, TURN_LEFT: 3, TURN_RIGHT: 2 }; // a brigantine hold of 10
    const brigantine = { ...tokenEconomyOf(getShipType('brigantine')), cap: 10 };

    const out = produceTokens(balanced, auto, brigantine, 3);

    expect(out.tokens).toEqual(balanced);
    expect(out.made).toEqual([]);
    expect(out.tokenGeneration.rotationIndex).toBe(auto.rotationIndex);
  });

  it('with auto off, the token you choose replaces your biggest surplus', () => {
    const full = { FORWARD: 11, TURN_LEFT: 3, TURN_RIGHT: 0 };

    const out = produceTokens(full, manual('TURN_RIGHT'), galleon, 4);

    expect(out.made).toEqual(['TURN_RIGHT', 'TURN_RIGHT', 'TURN_RIGHT', 'TURN_RIGHT']);
    expect(out.tokens.TURN_RIGHT).toBe(4);
    expect(totalTokens(out.tokens)).toBe(14);
  });

  it('with auto off and nothing else to give up, makes nothing', () => {
    const onlyRights = { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 14 };

    const out = produceTokens(onlyRights, manual('TURN_RIGHT'), galleon, 2);

    expect(out.made).toEqual([]);
    expect(out.tokens).toEqual(onlyRights);
  });

  it('never produces past the cap, whatever happens', () => {
    for (const economy of [sloop, galleon]) {
      for (let f = 0; f <= economy.cap!; f += 1) {
        const hold = { FORWARD: f, TURN_LEFT: economy.cap! - f, TURN_RIGHT: 0 };
        const out = produceTokens(hold, auto, economy, 6);
        expect(totalTokens(out.tokens)).toBeLessThanOrEqual(economy.cap!);
      }
    }
  });
});

describe('manual production below the cap', () => {
  it('makes the requested token every time', () => {
    const out = produceTokens(empty, manual('TURN_LEFT'), sloop, 3);
    expect(out.made).toEqual(['TURN_LEFT', 'TURN_LEFT', 'TURN_LEFT']);
    expect(out.tokens.TURN_LEFT).toBe(3);
  });
});
