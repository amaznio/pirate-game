import { describe, expect, it } from 'vitest';
import { AREAS } from '../../config/areas';
import type { RouteNode } from '../../graph/types';
import { startRun } from '../../run/engine';
import { cargoCapFor, maxHullFor } from '../../run/rules';
import type { RunState } from '../../run/types';
import { playRun, scriptedHullLoss } from '../botPlayer';
import { chooseRoute, chooseUpgrade } from '../policies';
import { formatSummary, summarize } from '../summary';

const state = (patch: Partial<RunState> = {}): RunState => ({ ...startRun(7), phase: 'map', offer: undefined, ...patch });

const node = (patch: Partial<RouteNode>): RouteNode => ({
  id: 'a0:1:0',
  layer: 1,
  index: 0,
  kind: 'battle',
  battle: 'standard',
  x: 0.5,
  y: 0.1,
  ...patch,
});

describe('the bot chooses like a careful player', () => {
  const port = node({ id: 'p', kind: 'port', battle: undefined });
  const easy = node({ id: 'e', battle: 'standard' });
  const ambush = node({ id: 'a', battle: 'ambush' });

  it('prefers an ordinary fight to an ambush, and a port when hurt or hungry', () => {
    expect(chooseRoute(state(), [ambush, easy], 'smart').id).toBe('e');
    expect(chooseRoute(state(), [port, easy], 'smart').id).toBe('p');
    expect(chooseRoute(state({ hull: 1 }), [easy, port], 'smart').id).toBe('p');
    expect(chooseRoute(state({ supplies: 1 }), [easy, port], 'smart').id).toBe('p');
  });

  it('can simply take the first way, or a seeded random one', () => {
    expect(chooseRoute(state(), [ambush, easy], 'first').id).toBe('a');
    expect(chooseRoute(state(), [ambush, easy], 'random')).toEqual(chooseRoute(state(), [ambush, easy], 'random'));
    expect(chooseRoute(state(), [easy], 'smart').id).toBe('e');
  });

  it('mends when badly hurt, stocks up when short, and otherwise grows', () => {
    const all = ['reinforceHull', 'addCannon', 'cannonDamage', 'cannonballs', 'repair', 'provisions'] as const;
    expect(chooseUpgrade(state(), all)).toBe('reinforceHull');
    expect(chooseUpgrade(state({ hull: 1 }), all)).toBe('repair');
    expect(chooseUpgrade(state({ supplies: 0 }), all)).toBe('provisions');
    expect(chooseUpgrade(state({ hull: 1 }), ['addCannon', 'provisions'])).toBe('addCannon');
    expect(chooseUpgrade(state(), ['repair'])).toBe('repair');
  });
});

describe('playRun with scripted wins', () => {
  it('finishes a whole voyage, the same way every time', () => {
    const a = playRun(11, { scripted: true });
    const b = playRun(11, { scripted: true });
    expect({ ...a, wallMs: 0 }).toEqual({ ...b, wallMs: 0 });
    expect(a.result).toBe('victory');
    expect(a.areaReached).toBe(AREAS.length - 1);
    expect(a.battles.length).toBeGreaterThan(20);
    expect(a.battles.every((battle) => battle.won)).toBe(true);
    expect(a.suppliesAtDeparture).toHaveLength(a.legs);
    expect(a.upgrades.length).toBe(a.portsVisited);
  });

  it('can be a short voyage', () => {
    const report = playRun(11, { scripted: true, areaCount: 2 });
    expect(report.result).toBe('victory');
    expect(report.areaReached).toBe(1);
    expect(report.battles.some((battle) => battle.areaIndex === 2)).toBe(false);
  });

  it('costs the hero more hull the deeper it goes', () => {
    expect(scriptedHullLoss(0)).toBeLessThan(scriptedHullLoss(0.9));
    expect(scriptedHullLoss(0)).toBeGreaterThan(0);
  });

  it('never leaves the ship outside what its hull and hold allow', () => {
    const report = playRun(12, { scripted: true });
    for (const supplies of report.suppliesAtDeparture) {
      expect(supplies).toBeGreaterThanOrEqual(0);
      expect(supplies).toBeLessThanOrEqual(cargoCapFor(6));
    }
    expect(report.hullLevel).toBeLessThanOrEqual(6);
    expect(maxHullFor(report.hullLevel)).toBeGreaterThan(0);
  });
});

describe('playRun with real battles', () => {
  it('plays a first area, ending in a victory or a defeat that names its cause', () => {
    const report = playRun(3, { areaCount: 1, heroSkill: 'hard' });
    expect(['victory', 'defeat']).toContain(report.result);
    if (report.result === 'defeat') {
      expect(report.reason).toBeDefined();
      expect(report.battles.at(-1)!.won).toBe(false);
    }
    for (const battle of report.battles) {
      expect(['win', 'draw', 'loss']).toContain(battle.outcome);
      expect(battle.turns).toBeGreaterThan(0);
      expect(battle.won).toBe(battle.outcome === 'win');
    }
  });

  it('can play on after a loss, so every battle of the voyage is measured', () => {
    const report = playRun(3, { areaCount: 1, heroSkill: 'easy', playOn: true });
    expect(report.result).toBe('victory');
    expect(report.battles.length).toBeGreaterThan(3);
  });
});

describe('summarize', () => {
  const reports = [playRun(21, { scripted: true, areaCount: 2 }), playRun(22, { scripted: true, areaCount: 2 })];
  const summary = summarize(reports, 2);

  it('counts the runs and where they ended', () => {
    expect(summary.runs).toBe(2);
    expect(summary.victories).toBe(2);
    expect(summary.endedInArea).toEqual([0, 2]);
    expect(summary.lostTo).toEqual({});
  });

  it('averages the length, the supplies and the ship', () => {
    expect(summary.legsPerRun).toBeGreaterThan(10);
    expect(summary.battlesPerRun).toBeGreaterThan(5);
    expect(summary.supplies.averageAtDeparture).toBeGreaterThan(0);
    expect(summary.supplies.starvedLegShare).toBe(0);
    expect(summary.ship.upgradesPerRun).toBeGreaterThan(3);
    expect(summary.byArea).toHaveLength(2);
    expect(summary.byKind.boss!.battles).toBe(4);
    expect(summary.ship.classAtBoss).toHaveLength(2);
  });

  it('says why lost runs were lost', () => {
    const lost = playRun(3, { areaCount: 1, heroSkill: 'easy' });
    const result = summarize([lost], 1);
    if (lost.result === 'defeat') {
      expect(Object.values(result.lostTo).reduce((a, b) => a + b, 0)).toBe(1);
    }
  });

  it('prints a readable report', () => {
    const text = formatSummary(summary);
    expect(text).toContain('Completed: 2');
    expect(text).toContain('Battles by kind');
    expect(text).toContain('Class when facing each boss');
  });

  it('copes with no runs at all', () => {
    expect(() => formatSummary(summarize([], 2))).not.toThrow();
  });
});
