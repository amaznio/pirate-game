import { describe, expect, it } from 'vitest';
import { createGame } from '@pirate/game-core/simulation/createGame';
import { createSkirmishConfig } from '@pirate/game-core/config/matchConfig';
import { redactState } from '@pirate/game-core/view/redact';
import {
  assignTeamStyles,
  avatarGlyph,
  displayName,
  teamStyleAt,
} from '../teamStyle';

const viewFor = (viewerId: string, ais: number, teamMode: 'ffa' | 'teams' = 'ffa') =>
  redactState(
    createGame(createSkirmishConfig({ humans: 1, ais, teamMode })),
    viewerId,
    null,
  );

describe('assignTeamStyles', () => {
  it("gives the viewer's team the first (blue) style", () => {
    const view = viewFor('p1', 3);
    const styles = assignTeamStyles(view);

    expect(styles.get('p1')?.index).toBe(0);
    expect(styles.get('p1')?.frame).toBe('ship (5).png');
  });

  it('gives every team a different colour', () => {
    const styles = assignTeamStyles(viewFor('p1', 7));

    const colours = new Set([...styles.values()].map((style) => style.color));
    expect(styles.size).toBe(8);
    expect(colours.size).toBe(8);
  });

  it('puts players on the same team in the same style', () => {
    const view = viewFor('p1', 3, 'teams');
    const styles = assignTeamStyles(view);

    expect(styles.size).toBe(2);
    expect(styles.get('team-a')).toBeDefined();
    expect(styles.get('team-b')).toBeDefined();
  });

  it('is the same for the same viewer every time', () => {
    const a = [...assignTeamStyles(viewFor('p1', 3)).entries()];
    const b = [...assignTeamStyles(viewFor('p1', 3)).entries()];

    expect(a).toEqual(b);
  });

  it('puts whoever is viewing on blue, whichever player that is', () => {
    const view = viewFor('p3', 3);

    expect(assignTeamStyles(view).get('p3')?.index).toBe(0);
  });
});

describe('teamStyleAt', () => {
  it('uses the coloured ship skins first, untinted', () => {
    for (let i = 0; i < 6; i += 1) {
      expect(teamStyleAt(i).tint).toBeNull();
    }
  });

  it('tints a reused skin for teams beyond the sixth', () => {
    const style = teamStyleAt(6);

    expect(style.tint).toBe(style.color);
    expect(style.frame).toBe(teamStyleAt(0).frame);
  });

  it('formats colours as CSS', () => {
    expect(teamStyleAt(0).css).toBe('#4f86c6');
  });
});

describe('avatarGlyph', () => {
  it.each([
    ['Player 1', 'P1'],
    ['Bot 2', 'B2'],
    ['Enemy', 'EN'],
    ['  ', '?'],
    ['Black Beard Pete', 'BB'],
  ])('turns %s into %s', (name, glyph) => {
    expect(avatarGlyph(name)).toBe(glyph);
  });
});

describe('displayName', () => {
  it('calls the viewer "You" and others by name', () => {
    const view = viewFor('p1', 1);

    expect(displayName(view, 'p1')).toBe('You');
    expect(displayName(view, 'p2')).toBe('Bot 2');
  });
});
