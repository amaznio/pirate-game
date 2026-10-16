import type { Direction } from './Direction';
import type { Position } from './Position';

/**
 * A way for a battle to end other than "last team standing". Every objective is
 * written from the side of the **hero team** (the humans' team; with no human in
 * the match, the first player's team). The others are the opposition. The usual
 * rule still applies on top: a team left alone afloat wins.
 *
 *  - `survive`: the hero team wins by still being afloat when turn `turns`
 *    ends; it loses if it is sunk first.
 *  - `salvage`: the hero team hauls floating pickups while the opposition tries to
 *    stop it. Only the hero team collects (a ship of the opposition on a pickup
 *    takes nothing and leaves it afloat). The hero team wins on taking `target`
 *    of them; if none are left afloat before that, it has lost the race and the
 *    opposition wins (`objective_failed`). The board is given `target + 3`
 *    pickups, so a few can be lost to a blocker or a collision.
 *  - `merchant`: an unarmed cargo ship makes for the `exit` edge of the board.
 *    The hero team wins by sinking it first. It loses if the merchant reaches
 *    the edge, gets clean away when turn `turns` ends, or the hero team is sunk.
 *    The merchant sails for the opposition (with any escorts), so it is never
 *    shot at by them and they are not shot at by it. `shipId` and `exit` are
 *    filled in when the match is built.
 *  - `ambush`: the hero team starts hemmed in by a first wave, and more ships
 *    arrive at the start of later turns (see `ambushLayout`). The hero team wins
 *    by sinking every raider, those still to arrive included; it loses if it is
 *    sunk, or if raiders are still afloat or still to come when turn `turns` ends.
 *  - `hunt`: sea monsters only, no enemy ships and no turn limit. The hero
 *    leaves through the `exit` edge with what it carries (the hunt is won, the
 *    haul banked) or is sunk (the hunt is lost). Killing the boss monster does not
 *    end it: the boss drops loot and the hero has to collect it and leave. The
 *    usual "last team standing" rule is switched off. `exit` and `bossId` are
 *    filled in when the match is built.
 */
export type Objective =
  | { readonly kind: 'survive'; readonly turns: number }
  | { readonly kind: 'salvage'; readonly target: number }
  | {
      readonly kind: 'merchant';
      /** Turns the merchant has to get away in. */
      readonly turns: number;
      /** The merchant's ship id, set when the match is built. */
      readonly shipId?: string;
      /** The edge of the board the merchant is making for, set when the match is built. */
      readonly exit?: Direction;
    }
  | { readonly kind: 'ambush'; readonly turns: number }
  | {
      readonly kind: 'hunt';
      /** The edge of the board the hero leaves by, set when the match is built. */
      readonly exit?: Direction;
      /** The monster that is the boss, set when the match is built. */
      readonly bossId?: string;
    };

export type ObjectiveKind = Objective['kind'];

export const OBJECTIVE_KINDS: readonly ObjectiveKind[] = ['survive', 'salvage', 'merchant', 'ambush', 'hunt'];

/** Default numbers when an objective is chosen from a menu (a solo run sets its own). */
export const DEFAULT_OBJECTIVES: Readonly<Record<ObjectiveKind, Objective>> = {
  survive: { kind: 'survive', turns: 8 },
  salvage: { kind: 'salvage', target: 4 },
  merchant: { kind: 'merchant', turns: 12 },
  ambush: { kind: 'ambush', turns: 14 },
  hunt: { kind: 'hunt' },
};

/** The player id and ship id of the merchant in a merchant match. */
export const MERCHANT_PLAYER_ID = 'merchant';
export const MERCHANT_SHIP_ID = 'merchant-ship';
/** The team the merchant and every AI ship sail for in a merchant match. */
export const ESCORT_TEAM_ID = 'escort';

/** Where the merchant starts (the middle of the west edge) and which edge it makes for. */
export function merchantRoute(height: number): { spawn: Position; heading: Direction; exit: Direction } {
  return { spawn: { x: 1, y: Math.floor(height / 2) }, heading: 'EAST', exit: 'EAST' };
}

/** How many pickups a salvage board holds. */
export function salvagePickupCount(target: number): number {
  return Math.max(1, target + 3);
}

/** Why a match with an objective ended as it did (absent for the usual last-team-standing end). */
export type OutcomeReason =
  | 'survived'
  | 'salvaged'
  | 'objective_failed'
  | 'intercepted'
  | 'escaped'
  | 'ambush_broken'
  | 'overrun'
  | 'left';

/**
 * The side a sunk hero loses to in a hunt. The monsters have no team in the
 * state, so this only names who won when the hunt is lost.
 */
export const MONSTER_TEAM_ID = 'monsters';

/** The hero's player id in a hunt. */
export const HUNT_PLAYER_ID = 'player';

/** How many rows deep the exit area runs along its edge. */
export const EXIT_DEPTH = 2;

/** The team every raider sails for in an ambush match. */
export const AMBUSH_TEAM_ID = 'raiders';

/** Where an ambush's ships start, and when the late ones arrive. */
export interface AmbushLayout {
  /** One start per AI ship already on the board at the beginning, round the hero. */
  readonly firstWave: ReadonlyArray<{ readonly position: Position; readonly heading: Direction }>;
  /** Ships that arrive at the start of a turn, from the corners. */
  readonly reinforcements: ReadonlyArray<{
    readonly position: Position;
    readonly heading: Direction;
    readonly turn: number;
  }>;
}

const FIRST_WAVE_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -5],
  [-5, 0],
  [5, 0],
  [0, 5],
  [-4, -4],
  [4, -4],
  [-4, 4],
  [4, 4],
];

/** The turn the first reinforcement arrives, and the gap between the rest. */
export const FIRST_ARRIVAL_TURN = 3;
export const ARRIVAL_GAP_TURNS = 2;

function headingTowards(from: Position, to: Position): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'EAST' : 'WEST';
  }
  return dy > 0 ? 'SOUTH' : 'NORTH';
}

/**
 * Lays out an ambush on a board for a hero starting at `hero` against `ais`
 * ships already there: they are spread round the hero five cells off (hemming
 * it in), facing it. At least two more ships (as many as the first wave, if that
 * is more) arrive one at a time from the corners, from turn 3, two turns apart.
 * Pure, so the terrain generator can keep these cells clear.
 */
export function ambushLayout(
  width: number,
  height: number,
  hero: Position,
  ais: number,
): AmbushLayout {
  const inside = (p: Position): boolean => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  const firstWave: Array<{ position: Position; heading: Direction }> = [];
  for (const [dx, dy] of FIRST_WAVE_OFFSETS) {
    if (firstWave.length >= ais) {
      break;
    }
    const position = { x: hero.x + dx, y: hero.y + dy };
    if (inside(position)) {
      firstWave.push({ position, heading: headingTowards(position, hero) });
    }
  }

  const centre = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  const corners: Position[] = [
    { x: 1, y: 1 },
    { x: width - 2, y: height - 2 },
    { x: width - 2, y: 1 },
    { x: 1, y: height - 2 },
  ];
  const reinforcements = Array.from({ length: Math.max(2, ais) }, (_, index) => {
    const position = corners[index % corners.length];
    return {
      position,
      heading: headingTowards(position, centre),
      turn: FIRST_ARRIVAL_TURN + ARRIVAL_GAP_TURNS * index,
    };
  });
  return { firstWave, reinforcements };
}
