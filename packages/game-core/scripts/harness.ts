/**
 * Balance harness: plays many AI-versus-AI duels and prints how they went.
 *
 *   pnpm harness                          # every pairing of the AI levels
 *   pnpm harness --seeds 100 --sea stormy
 *   pnpm harness --a hard --b easy
 *
 * Each pairing is played from both sides on every seed, so a side advantage
 * shows up as an uneven result for two identical opponents. "Starved" is the
 * share of phases in which a living ship left a slot empty because it had run
 * out of movement tokens (the "waiting a turn for one move" feeling); the
 * roadmap aims for 15 to 25 per cent once ship classes exist.
 */
import { createDuelConfig, type SeaChoice } from '../src/config/matchConfig';
import {
  AI_DIFFICULTIES,
  type AiDifficulty,
} from '../src/domain/GameState';
import { runMatch } from '../src/testing/matchRunner';

interface Options {
  seeds: number;
  sea: SeaChoice;
  a: AiDifficulty | null;
  b: AiDifficulty | null;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { seeds: 40, sea: 'normal', a: null, b: null };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${flag}`);
    }
    switch (flag) {
      case '--seeds':
        options.seeds = Number.parseInt(value, 10);
        break;
      case '--sea':
        options.sea = value as SeaChoice;
        break;
      case '--a':
        options.a = value as AiDifficulty;
        break;
      case '--b':
        options.b = value as AiDifficulty;
        break;
      default:
        throw new Error(`Unknown option ${flag}`);
    }
  }
  if (!Number.isInteger(options.seeds) || options.seeds < 1) {
    throw new Error('--seeds must be a positive whole number');
  }
  for (const level of [options.a, options.b]) {
    if (level && !AI_DIFFICULTIES.includes(level)) {
      throw new Error(`Unknown difficulty ${level}`);
    }
  }
  return options;
}

interface Tally {
  aWins: number;
  bWins: number;
  mutual: number;
  turns: number;
  matches: number;
  starved: number;
  shipPhases: number;
  planningMs: number;
}

/** `a` plays `player` on odd passes and `enemy` on even ones, so sides cancel out. */
function play(a: AiDifficulty, b: AiDifficulty, options: Options): Tally {
  const tally: Tally = {
    aWins: 0,
    bWins: 0,
    mutual: 0,
    turns: 0,
    matches: 0,
    starved: 0,
    shipPhases: 0,
    planningMs: 0,
  };
  for (let seed = 1; seed <= options.seeds; seed += 1) {
    for (const aIsPlayer of [true, false]) {
      const base = createDuelConfig({ seed, sea: options.sea });
      const config = {
        ...base,
        participants: base.participants.map((participant) => ({
          ...participant,
          aiDifficulty:
            (participant.playerId === 'player') === aIsPlayer ? a : b,
        })),
      };
      const record = runMatch(config);
      const aTeam = aIsPlayer ? 'player' : 'enemy';
      if (record.outcome?.kind === 'win') {
        if (record.outcome.teamId === aTeam) {
          tally.aWins += 1;
        } else {
          tally.bWins += 1;
        }
      } else {
        tally.mutual += 1;
      }
      tally.turns += record.turns;
      tally.matches += 1;
      tally.starved += record.starvedPhases;
      tally.shipPhases += record.shipPhases;
      tally.planningMs += record.planningMs;
    }
  }
  return tally;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const pairs: Array<[AiDifficulty, AiDifficulty]> = [];
  if (options.a && options.b) {
    pairs.push([options.a, options.b]);
  } else {
    for (const a of AI_DIFFICULTIES) {
      for (const b of AI_DIFFICULTIES) {
        if (AI_DIFFICULTIES.indexOf(a) <= AI_DIFFICULTIES.indexOf(b)) {
          pairs.push([a, b]);
        }
      }
    }
  }

  console.log(
    `Duels on the ${options.sea} sea, ${options.seeds} seeds x 2 sides per pairing\n`,
  );
  console.log(
    ['pairing'.padEnd(16), 'A wins', 'B wins', 'draws', 'avg turns', 'starved', 'ms/turn']
      .map((cell, index) => (index === 0 ? cell : cell.padStart(9)))
      .join(' '),
  );
  for (const [a, b] of pairs) {
    const t = play(a, b, options);
    const row = [
      `${a} v ${b}`.padEnd(16),
      String(t.aWins).padStart(9),
      String(t.bWins).padStart(9),
      String(t.mutual).padStart(9),
      (t.turns / t.matches).toFixed(1).padStart(9),
      `${((100 * t.starved) / t.shipPhases).toFixed(1)}%`.padStart(9),
      (t.planningMs / t.turns).toFixed(1).padStart(9),
    ];
    console.log(row.join(' '));
  }
}

main();
