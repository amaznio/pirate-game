import { describe, expect, it } from 'vitest';
import {
  createDuelConfig,
  createSkirmishConfig,
  type MatchConfig,
} from '../../config/matchConfig';
import { runMatch } from '../../testing/matchRunner';

/**
 * Golden matches: whole AI-versus-AI games on fixed seeds, reduced to a
 * fingerprint of every event they produced plus how they ended.
 *
 * These pin today's rules. A change to movement, combat, the sea, tokens, the
 * board generator or the AI changes a fingerprint and fails here. When a rule
 * is changed on purpose, check the new behaviour, then refresh with
 * `pnpm --filter @pirate/game-core exec vitest run -u golden` and commit the
 * updated snapshot with the change. Otherwise a failure here is a regression.
 */
const SCENARIOS: Record<string, () => MatchConfig> = {
  'duel, normal sea, seed 1': () => createDuelConfig({ seed: 1 }),
  'duel, normal sea, seed 7, hard': () =>
    createDuelConfig({ seed: 7, aiDifficulty: 'hard' }),
  'duel, stormy sea, seed 3, easy': () =>
    createDuelConfig({ seed: 3, sea: 'stormy', aiDifficulty: 'easy' }),
  'duel, calm sea, seed 5': () => createDuelConfig({ seed: 5, sea: 'calm' }),
  'duel, open water, seed 2, hard': () =>
    createDuelConfig({ seed: 2, sea: 'open', aiDifficulty: 'hard' }),
  'free-for-all of 4, seed 11': () =>
    createSkirmishConfig({ humans: 0, ais: 4, teamMode: 'ffa', seed: 11 }),
  'free-for-all of 6, stormy, seed 4': () =>
    createSkirmishConfig({ humans: 0, ais: 6, teamMode: 'ffa', seed: 4, sea: 'stormy' }),
  'two teams of 3, seed 9': () =>
    createSkirmishConfig({ humans: 0, ais: 6, teamMode: 'teams', seed: 9 }),
  'large board, 5 ships, seed 21': () =>
    createSkirmishConfig({
      humans: 0,
      ais: 5,
      teamMode: 'ffa',
      seed: 21,
      width: 30,
      height: 30,
    }),
  // Added with the ship classes (phase 1); the sloop scenarios above predate them.
  'duel, brigantine v sloop, seed 6': () =>
    createDuelConfig({ seed: 6, shipTypeIds: ['brigantine', 'sloop'] }),
  'duel, galleon v brigantine, stormy, seed 8': () =>
    createDuelConfig({ seed: 8, sea: 'stormy', shipTypeIds: ['galleon', 'brigantine'] }),
  'free-for-all of 3 classes and a bot, seed 13': () =>
    createSkirmishConfig({
      humans: 0,
      ais: 4,
      teamMode: 'ffa',
      seed: 13,
      shipTypeIds: ['sloop', 'brigantine', 'galleon', 'sloop'],
    }),
};

describe('golden matches', () => {
  for (const [name, build] of Object.entries(SCENARIOS)) {
    it(`plays the same way: ${name}`, () => {
      const record = runMatch(build());

      expect({
        turns: record.turns,
        outcome: record.outcome,
        hull: record.hull,
        events: record.events.length,
        hash: record.hash,
      }).toMatchSnapshot();
    });
  }

  it('gives the same match every time it is replayed', () => {
    const config = createSkirmishConfig({ humans: 0, ais: 4, teamMode: 'ffa', seed: 11 });

    expect(runMatch(config).hash).toBe(runMatch(config).hash);
  });

  it('gives a different match for a different seed', () => {
    const a = runMatch(createDuelConfig({ seed: 1 }));
    const b = runMatch(createDuelConfig({ seed: 2 }));

    expect(a.hash).not.toBe(b.hash);
  });
});
