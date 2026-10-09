import type { PlayerId, TeamId } from '../game/domain/Entity';
import type { GameView } from '../game/view/GameView';

/** How a team looks everywhere (ships, avatars, lists). */
export interface TeamStyle {
  /** 0 is the viewer's own team. */
  readonly index: number;
  /** Colour as a number (Phaser) and as CSS (React). */
  readonly color: number;
  readonly css: string;
  /** Ship art frame in the ships atlas. */
  readonly frame: string;
  /** Extra tint for teams beyond the six coloured ship skins, else null. */
  readonly tint: number | null;
}

/** Ship skins in the Kenney atlas, each with a matching UI colour. */
const SKINS: ReadonlyArray<{ frame: string; color: number }> = [
  { frame: 'ship (5).png', color: 0x4f86c6 }, // blue
  { frame: 'ship (3).png', color: 0xc94f4f }, // red
  { frame: 'ship (4).png', color: 0x4f9d69 }, // green
  { frame: 'ship (6).png', color: 0xd9b23a }, // yellow
  { frame: 'ship (7).png', color: 0xe8e0c8 }, // cream
  { frame: 'ship (8).png', color: 0x56606a }, // black
];

/** Colours for further teams; they reuse a skin and tint it. */
const EXTRA_COLORS: readonly number[] = [
  0x8a5fc4, 0xd9803a, 0x3aa6a0, 0xd96fa6, 0x9acd32, 0x8b5a2b, 0x5fb8e8, 0xb04fb0,
  0xe0e0e0, 0xa0522d,
];

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function teamStyleAt(index: number): TeamStyle {
  if (index < SKINS.length) {
    const skin = SKINS[index];
    return {
      index,
      color: skin.color,
      css: toCss(skin.color),
      frame: skin.frame,
      tint: null,
    };
  }
  const extra = index - SKINS.length;
  const color = EXTRA_COLORS[extra % EXTRA_COLORS.length];
  return {
    index,
    color,
    css: toCss(color),
    frame: SKINS[index % SKINS.length].frame,
    tint: color,
  };
}

/**
 * Gives every team in the match a style. The viewer's team is always first
 * (blue); the rest follow in the order they appear, so the same match always
 * looks the same to the same player.
 */
export function assignTeamStyles(
  view: Pick<GameView, 'viewerId' | 'players'>,
): Map<TeamId, TeamStyle> {
  const order: TeamId[] = [];
  const viewerTeam = view.players[view.viewerId]?.teamId;
  if (viewerTeam !== undefined) {
    order.push(viewerTeam);
  }
  for (const player of Object.values(view.players)) {
    if (!order.includes(player.teamId)) {
      order.push(player.teamId);
    }
  }

  const styles = new Map<TeamId, TeamStyle>();
  order.forEach((teamId, index) => styles.set(teamId, teamStyleAt(index)));
  return styles;
}

/** Short text for an avatar: initials of the name ("Bot 2" is "B2"). */
export function avatarGlyph(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** What to call a player in a list: "You" for the viewer, else their name. */
export function displayName(
  view: Pick<GameView, 'viewerId' | 'players'>,
  playerId: PlayerId,
): string {
  return playerId === view.viewerId
    ? 'You'
    : (view.players[playerId]?.name ?? playerId);
}
