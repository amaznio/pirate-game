/**
 * Balance harness for the solo voyage: a bot plays whole runs on the real maps
 * with real AI-versus-AI battles (or, with --scripted, no fighting), then prints
 * how they went. The default pilot is `matched`: as good as the enemy it faces.
 * An AI-versus-AI duel often ends in a draw, which loses a battle, so absolute
 * completion rates are low; read them as better or worse than before.
 *
 *   pnpm harness:run                         # 8 runs of all five areas
 *   pnpm harness:run --runs 30 --areas 2     # a shorter voyage, more runs
 *   pnpm harness:run --skill hard            # a fixed pilot level instead of `matched`
 *   pnpm harness:run --scripted              # no fighting: every battle is won, for the economy and length
 *   pnpm harness:run --playon                # record a lost battle but sail on, to measure every battle
 *   pnpm harness:run --route first|random    # a different way of choosing the route
 *   pnpm harness:run --seed0 1000            # other seeds (seed0, seed0 + 1, ...)
 *   pnpm harness:run --json out.json         # also write every run's report
 *
 * The bot is a yardstick, not a stand-in for a person: read the numbers as
 * "better or worse than before", over the same seeds. One run is about 45
 * battles, so a full run takes a while to simulate.
 */
import { writeFileSync } from 'node:fs';
import { AREAS } from '../src/config/areas';
import { playRun, type BotOptions } from '../src/sim/botPlayer';
import type { RoutePolicy } from '../src/sim/policies';
import { formatSummary, summarize } from '../src/sim/summary';

interface Options {
  runs: number;
  areas: number;
  seed0: number;
  skill: NonNullable<BotOptions['heroSkill']>;
  scripted: boolean;
  playOn: boolean;
  route: RoutePolicy;
  json: string | null;
  quiet: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = { runs: 8, areas: AREAS.length, seed0: 1, skill: 'matched', scripted: false, playOn: false, route: 'smart', json: null, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--quiet') {
      options.quiet = true;
      continue;
    }
    if (flag === '--scripted') {
      options.scripted = true;
      continue;
    }
    if (flag === '--playon') {
      options.playOn = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${flag}`);
    }
    i += 1;
    switch (flag) {
      case '--runs':
        options.runs = Number.parseInt(value, 10);
        break;
      case '--areas':
        options.areas = Number.parseInt(value, 10);
        break;
      case '--seed0':
        options.seed0 = Number.parseInt(value, 10);
        break;
      case '--skill':
        options.skill = value as Options['skill'];
        break;
      case '--route':
        options.route = value as RoutePolicy;
        break;
      case '--json':
        options.json = value;
        break;
      default:
        throw new Error(`Unknown option ${flag}`);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
console.log(
  `Playing ${options.runs} runs of ${options.areas} area(s), ${options.scripted ? 'scripted wins' : `pilot ${options.skill}`}, route ${options.route}, seeds from ${options.seed0}\n`,
);

const reports = [];
for (let i = 0; i < options.runs; i += 1) {
  const seed = options.seed0 + i;
  const report = playRun(seed, { areaCount: options.areas, heroSkill: options.skill, scripted: options.scripted, playOn: options.playOn, route: options.route });
  reports.push(report);
  if (!options.quiet) {
    const end =
      report.result === 'victory'
        ? 'completed'
        : `lost in area ${report.areaReached + 1} (${report.reason}${report.battles.at(-1) && !report.battles.at(-1)!.won ? `, ${report.battles.at(-1)!.kind}` : ''})`;
    console.log(
      `seed ${String(seed).padStart(5)}: ${end}; ${report.battles.length} battles, ${report.upgrades.length} upgrades, hull level ${report.hullLevel}, ${(report.wallMs / 1000).toFixed(1)} s`,
    );
  }
}

console.log(`\n${formatSummary(summarize(reports, options.areas))}`);
if (options.json) {
  writeFileSync(options.json, JSON.stringify(reports, null, 2));
  console.log(`\nWrote ${options.json}`);
}
