import type { BattleRecord, RunReport } from './botPlayer';

/** How a batch of simulated runs went, boiled down to the numbers worth tuning by. */
export interface RunSummary {
  readonly runs: number;
  readonly victories: number;
  /** For each area: runs that ended there (a victory counts in the last area). */
  readonly endedInArea: readonly number[];
  /** What ended the lost runs: the kind of the fatal battle, or abandoned / timeout. */
  readonly lostTo: Readonly<Record<string, number>>;
  readonly battlesPerRun: number;
  readonly legsPerRun: number;
  readonly turnsPerRun: number;
  readonly wallMsPerRun: number;
  /** Win rate and numbers per area, and per battle kind. */
  readonly byArea: readonly BattleGroup[];
  readonly byKind: Readonly<Record<string, BattleGroup>>;
  readonly plunder: {
    /** In hand on arriving at a port, before shopping. */
    readonly averageAtPort: number;
    readonly highestAtPort: number;
    /** Left unspent when the run ended. */
    readonly averageLeftAtEnd: number;
  };
  readonly ship: {
    readonly upgradesPerRun: number;
    readonly hullLevel: number;
    readonly cannonsPerSide: number;
    readonly cannonDamage: number;
    readonly portsPerRun: number;
    /** For each area's boss: how many times the hero met it as each class. */
    readonly classAtBoss: readonly Readonly<Record<string, number>>[];
  };
}

export interface BattleGroup {
  readonly battles: number;
  readonly winRate: number;
  /** Share that ended in a draw (counted as lost). */
  readonly drawRate: number;
  readonly averageTurns: number;
  /** Hull lost in the won fights, on average. */
  readonly hullLostWhenWon: number;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function group(battles: readonly BattleRecord[]): BattleGroup {
  const won = battles.filter((battle) => battle.won);
  return {
    battles: battles.length,
    winRate: battles.length === 0 ? 0 : won.length / battles.length,
    drawRate: battles.length === 0 ? 0 : battles.filter((battle) => battle.outcome === 'draw').length / battles.length,
    averageTurns: mean(battles.map((battle) => battle.turns)),
    hullLostWhenWon: mean(won.map((battle) => Math.max(0, battle.hullBefore - battle.hullAfter))),
  };
}

export function summarize(reports: readonly RunReport[], areaCount: number): RunSummary {
  const all = reports.flatMap((report) => report.battles);
  const lostTo: Record<string, number> = {};
  for (const report of reports) {
    if (report.result === 'victory') {
      continue;
    }
    const fatal = report.battles.at(-1);
    const key =
      report.reason === 'abandoned' || report.reason === 'timeout'
        ? report.reason
        : fatal && !fatal.won
          ? fatal.kind
          : 'sunk';
    lostTo[key] = (lostTo[key] ?? 0) + 1;
  }
  const kinds = [...new Set(all.map((battle) => battle.kind))];
  const atPort = reports.flatMap((report) => report.plunderAtPort);
  const classAtBoss = Array.from({ length: areaCount }, (_, area) => {
    const counts: Record<string, number> = {};
    for (const battle of all) {
      if (battle.kind === 'boss' && battle.areaIndex === area) {
        counts[battle.heroClass] = (counts[battle.heroClass] ?? 0) + 1;
      }
    }
    return counts;
  });
  return {
    runs: reports.length,
    victories: reports.filter((report) => report.result === 'victory').length,
    endedInArea: Array.from({ length: areaCount }, (_, area) =>
      reports.filter((report) => report.areaReached === area).length,
    ),
    lostTo,
    battlesPerRun: mean(reports.map((report) => report.battles.length)),
    legsPerRun: mean(reports.map((report) => report.legs)),
    turnsPerRun: mean(reports.map((report) => report.totalTurns)),
    wallMsPerRun: mean(reports.map((report) => report.wallMs)),
    byArea: Array.from({ length: areaCount }, (_, area) => group(all.filter((battle) => battle.areaIndex === area))),
    byKind: Object.fromEntries(kinds.map((kind) => [kind, group(all.filter((battle) => battle.kind === kind))])),
    plunder: {
      averageAtPort: mean(atPort),
      highestAtPort: atPort.length === 0 ? 0 : Math.max(...atPort),
      averageLeftAtEnd: mean(reports.map((report) => report.plunderLeft)),
    },
    ship: {
      upgradesPerRun: mean(reports.map((report) => report.upgrades.length)),
      hullLevel: mean(reports.map((report) => report.hullLevel)),
      cannonsPerSide: mean(reports.map((report) => report.cannonsPerSide)),
      cannonDamage: mean(reports.map((report) => report.cannonDamage)),
      portsPerRun: mean(reports.map((report) => report.portsVisited)),
      classAtBoss,
    },
  };
}

const pct = (value: number) => `${(value * 100).toFixed(0)}%`;
const num = (value: number, digits = 1) => value.toFixed(digits);

/** The summary as text for a terminal. */
export function formatSummary(summary: RunSummary): string {
  const lines: string[] = [];
  const { runs, victories } = summary;
  lines.push(`Runs: ${runs}   Completed: ${victories} (${pct(runs === 0 ? 0 : victories / runs)})`);
  lines.push('');
  lines.push('Where the runs ended (area: runs)');
  summary.endedInArea.forEach((count, area) => lines.push(`  area ${area + 1}: ${count}`));
  lines.push('');
  lines.push(`Lost to: ${Object.entries(summary.lostTo).map(([key, count]) => `${key} ${count}`).join(', ') || 'nothing'}`);
  lines.push('');
  lines.push('Length of a run (average)');
  lines.push(
    `  ${num(summary.legsPerRun)} legs, ${num(summary.battlesPerRun)} battles, ${num(summary.turnsPerRun, 0)} turns played, ${num(summary.wallMsPerRun / 1000)} s to simulate`,
  );
  lines.push('');
  lines.push('Battles by area         fought  won  drawn  turns  hull lost');
  summary.byArea.forEach((g, area) =>
    lines.push(`  area ${area + 1}               ${String(g.battles).padStart(5)}  ${pct(g.winRate).padStart(4)}  ${pct(g.drawRate).padStart(5)}  ${num(g.averageTurns).padStart(5)}  ${num(g.hullLostWhenWon).padStart(5)}`),
  );
  lines.push('');
  lines.push('Battles by kind         fought  won  drawn  turns  hull lost');
  for (const [kind, g] of Object.entries(summary.byKind)) {
    lines.push(`  ${kind.padEnd(20)}  ${String(g.battles).padStart(5)}  ${pct(g.winRate).padStart(4)}  ${pct(g.drawRate).padStart(5)}  ${num(g.averageTurns).padStart(5)}  ${num(g.hullLostWhenWon).padStart(5)}`);
  }
  lines.push('');
  lines.push('Plunder');
  lines.push(
    `  ${num(summary.plunder.averageAtPort)} in hand on arriving at a port on average, at most ${summary.plunder.highestAtPort}; ${num(summary.plunder.averageLeftAtEnd)} left unspent at the end of a run`,
  );
  lines.push('');
  lines.push('Ship at the end of a run (average)');
  lines.push(
    `  ${num(summary.ship.upgradesPerRun)} upgrades, ${num(summary.ship.portsPerRun)} ports, hull level ${num(summary.ship.hullLevel)}, ${num(summary.ship.cannonsPerSide)} cannons a side, +${num(summary.ship.cannonDamage)} damage`,
  );
  lines.push('Class when facing each boss');
  summary.ship.classAtBoss.forEach((counts, area) => {
    const text = Object.entries(counts).map(([id, count]) => `${id} ${count}`).join(', ');
    lines.push(`  area ${area + 1}: ${text || 'not reached'}`);
  });
  return lines.join('\n');
}
