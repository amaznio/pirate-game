import { create } from 'zustand';
import type { AiDifficulty, GameStatus } from '@pirate/game-core/domain/GameState';
import { cannonCountsFor, type ClientSnapshot, type GameClient } from '@pirate/game-core/client/GameClient';
import { ONE_CANNON_A_SIDE, type CannonCounts } from '@pirate/game-core/domain/Ship';
import type {
  ActionSlot,
  CannonQueue,
  CannonSide,
  MovementAction,
  TokenInventory,
} from '@pirate/game-core/domain/Action';
import type { PlayerId } from '@pirate/game-core/domain/Entity';
import { getShipType, tokenEconomyOf } from '@pirate/game-core/config/shipTypes';
import { getMonsterType } from '@pirate/game-core/config/monsterTypes';
import type { GameView } from '@pirate/game-core/view/GameView';
import { assignTeamStyles } from '../presentation/teamStyle';
import { NO_HAZARDS, seaHazards, type SeaHazards } from '../presentation/seaHazards';
import type { MatchResult as BattleResult } from '@pirate/game-core/domain/MatchResult';
import { endNote, objectiveProgress, type EndNote, type ObjectiveProgress } from '../presentation/objectiveProgress';

/** Another ship in the match, as the local player sees it (public info only). */
export interface ShipSummary {
  playerId: PlayerId;
  name: string;
  /** Team colour as CSS. */
  color: string;
  hull: number;
  maxHull: number;
  /** On the viewer's team (never an enemy). */
  ally: boolean;
  /** Still afloat. */
  alive: boolean;
  /** Got clean away (a merchant that reached its exit). */
  escaped: boolean;
  /** Not on the board yet: the turn it arrives on (a raider of an ambush). */
  arrivesOnTurn: number | null;
  /** An AI is sailing it (a computer opponent, or a player who is away). */
  bot: boolean;
  /** How well that AI plays, when one is sailing it. */
  difficulty: AiDifficulty | null;
}

export type MatchResult = 'win' | 'loss' | 'draw';

export interface GameUISnapshot {
  turn: number;
  status: GameStatus;
  hull: number;
  maxHull: number;
  /** Most movement tokens the local ship can hold, or null if it has no limit. */
  tokenCap: number | null;
  /** Team colour of the local player as CSS. */
  selfColor: string;
  /** The local player's ship has sunk but the match goes on: they watch. */
  spectating: boolean;
  /** Every other ship in the match. */
  others: ShipSummary[];
  /** Which kinds of wind and whirlpool the board has. */
  hazards: SeaHazards;
  /** Whether any barrel, crate or plank is still afloat (so the legend explains them). */
  loot: boolean;
  /** A hunt: the plan may choose to leave through the exit. */
  canLeave: boolean;
  /** The plan says to leave at the end of the turn. */
  leaving: boolean;
  /** The treasure in the hold (a hunt). */
  haul: number;
  /** The boss of a hunt, while it is on the board (hull 0 once it is slain). */
  boss: { title: string; hp: number; maxHp: number } | null;
  tokens: TokenInventory;
  queue: ActionSlot[];
  cannonQueue: CannonQueue;
  ammo: number;
  /** Cannons on each side of the local ship; a broadside costs one cannonball per cannon. */
  cannonsPerSide: CannonCounts;
  auto: boolean;
  requested: MovementAction;
  /** The local player has locked in and can no longer change their plan. */
  lockedIn: boolean;
  /** Other humans who have not locked in yet. */
  waitingFor: number;
  /** Planning is open and the local player may still edit their plan. */
  canPlan: boolean;
  /** The match result from the local player's point of view, once decided. */
  result: MatchResult | null;
  /** How every ship finished, once the match is over. */
  battle: BattleResult | null;
  /** The local player's id, to find their ship in `battle`. */
  viewerId: string;
  /** How the match's objective stands; null for a standard match. */
  objective: ObjectiveProgress | null;
  /** What to say under the title of a finished match about its objective. */
  endNote: EndNote;
  /** Epoch-ms the current planning window closes, or null when not planning. */
  deadline: number | null;
  turnDurationSeconds: number;
}

interface GameUIStore extends GameUISnapshot {
  /** Movement slot the next token will fill, or null for "first empty". */
  activeSlot: number | null;
  /**
   * Whether the player wants the mobile planning sheet open. It is only shown
   * expanded while planning, and this preference is restored on the next turn.
   */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  setActiveSlot: (slot: number | null) => void;
  queuePlayerAction: (action: MovementAction) => void;
  removePlayerAction: (index: number) => void;
  /** Puts a token in exactly this slot (dropping it there), replacing what is there. */
  placePlayerAction: (action: MovementAction, slot: number) => void;
  /** Moves the token in one slot to another, swapping when the other is filled. */
  movePlayerAction: (from: number, to: number) => void;
  toggleCannon: (phase: number, side: CannonSide) => void;
  /** Sets how many cannons a side fires in a phase. */
  setCannonShots: (phase: number, side: CannonSide, shots: number) => void;
  clearPlayerActions: () => void;
  setLeave: (leave: boolean) => void;
  setAuto: (auto: boolean) => void;
  setRequested: (token: MovementAction) => void;
  lockIn: () => void;
  passTurn: () => void;
  restart: () => void;
}

/** Derives the read-only UI projection from the client's view and draft. */
function snapshot({
  view,
  draft,
  deadline,
  canEdit,
  tokensLeft,
}: ClientSnapshot): GameUISnapshot {
  const self = view.self;
  const ship = view.ships[self.shipId];

  const styles = assignTeamStyles(view);
  const others: ShipSummary[] = Object.values(view.players)
    .filter((player) => player.id !== view.viewerId)
    .map((player) => {
      const other = view.ships[player.shipId];
      return {
        playerId: player.id,
        name: player.name,
        color: styles.get(player.teamId)?.css ?? '#ffffff',
        hull: other?.hp ?? 0,
        maxHull: other?.maxHp ?? 0,
        ally: player.teamId === self.teamId,
        alive: (other?.hp ?? 0) > 0,
        escaped: other?.escaped === true,
        arrivesOnTurn: other?.arrivesOnTurn ?? null,
        bot: player.controller === 'ai',
        difficulty: player.aiDifficulty,
      };
    });

  let result: MatchResult | null = null;
  if (view.outcome) {
    result =
      view.outcome.kind === 'draw'
        ? 'draw'
        : view.outcome.kind === 'eliminated'
          ? 'loss'
          : view.outcome.teamId === self.teamId
            ? 'win'
            : 'loss';
  }

  return {
    turn: view.turn,
    status: view.status,
    hull: ship?.hp ?? 0,
    maxHull: ship?.maxHp ?? 0,
    tokenCap: ship ? tokenEconomyOf(getShipType(ship.shipTypeId)).cap : null,
    selfColor: styles.get(self.teamId)?.css ?? '#4f86c6',
    spectating: (ship?.hp ?? 0) <= 0 && view.outcome === null,
    others,
    hazards: seaHazards(view.terrain),
    loot: Object.keys(view.pickups ?? {}).length > 0,
    canLeave: view.objective?.kind === 'hunt',
    leaving: !!draft.leave,
    haul: self.haul ?? 0,
    boss: bossOf(view),
    tokens: tokensLeft,
    queue: [...draft.movement],
    cannonQueue: draft.cannons,
    ammo: self.ammo,
    cannonsPerSide: cannonCountsFor(view),
    auto: self.tokenGeneration.auto,
    requested: self.tokenGeneration.requested,
    lockedIn: self.lockedIn,
    waitingFor: Object.values(view.players).filter(
      (player) =>
        player.controller === 'human' &&
        player.id !== view.viewerId &&
        !player.lockedIn,
    ).length,
    canPlan: canEdit,
    result,
    battle: view.result ?? null,
    viewerId: view.viewerId,
    objective: objectiveProgress(view),
    endNote: endNote(
      view,
      result,
      view.outcome && 'reason' in view.outcome ? view.outcome.reason : undefined,
    ),
    deadline,
    turnDurationSeconds: view.rules.turnDurationSeconds ?? 0,
  };
}

/** The boss of a hunt, if the view has one. */
function bossOf(view: GameView): GameUISnapshot['boss'] {
  const boss = Object.values(view.monsters ?? {}).find((monster) => monster.boss);
  const title = boss ? getMonsterType(boss.monsterTypeId).boss?.title : undefined;
  return boss && title ? { title, hp: boss.hp, maxHp: boss.maxHp } : null;
}

/** What the UI shows before any match is bound (it is never visible). */
const EMPTY: GameUISnapshot = {
  turn: 1,
  status: 'planning',
  hull: 0,
  maxHull: 0,
  tokenCap: null,
  selfColor: '#4f86c6',
  spectating: false,
  others: [],
  hazards: NO_HAZARDS,
  loot: false,
  canLeave: false,
  leaving: false,
  haul: 0,
  boss: null,
  tokens: { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 },
  queue: [null, null, null, null],
  cannonQueue: [],
  ammo: 0,
  cannonsPerSide: ONE_CANNON_A_SIDE,
  auto: true,
  requested: 'FORWARD',
  lockedIn: false,
  waitingFor: 0,
  canPlan: false,
  result: null,
  battle: null,
  viewerId: '',
  objective: null,
  endNote: null,
  deadline: null,
  turnDurationSeconds: 0,
};

/** The match the UI is showing and controlling. */
let currentClient: GameClient | null = null;
let stopListening: (() => void) | null = null;

/**
 * Points the UI at a match (or at nothing). Everything on screen is a
 * projection of this client, so switching matches is just binding a new one.
 */
export function bindGameClient(client: GameClient | null): void {
  stopListening?.();
  stopListening = null;
  currentClient = client;

  if (!client) {
    useGameUIStore.setState({ ...EMPTY, activeSlot: null });
    return;
  }
  useGameUIStore.setState({
    ...snapshot(client.getSnapshot()),
    activeSlot: null,
  });
  stopListening = client.subscribe((clientSnapshot) => {
    const next = snapshot(clientSnapshot);
    useGameUIStore.setState(
      clientSnapshot.view.status === 'planning'
        ? next
        : { ...next, activeSlot: null },
    );
  });
}

export const useGameUIStore = create<GameUIStore>(() => ({
  ...EMPTY,
  activeSlot: null,
  panelOpen: true,
  setPanelOpen: (open) => useGameUIStore.setState({ panelOpen: open }),
  setActiveSlot: (slot) => useGameUIStore.setState({ activeSlot: slot }),
  queuePlayerAction: (action) => {
    const { activeSlot } = useGameUIStore.getState();
    currentClient?.queueToken(action, activeSlot ?? undefined);
    useGameUIStore.setState({ activeSlot: null });
  },
  removePlayerAction: (index) => currentClient?.removeToken(index),
  placePlayerAction: (action, slot) => {
    currentClient?.placeToken(action, slot);
    useGameUIStore.setState({ activeSlot: null });
  },
  movePlayerAction: (from, to) => currentClient?.moveToken(from, to),
  toggleCannon: (phase, side) => currentClient?.toggleCannon(phase, side),
  setCannonShots: (phase, side, shots) => currentClient?.setCannonShots(phase, side, shots),
  clearPlayerActions: () => {
    currentClient?.clearDraft();
    useGameUIStore.setState({ activeSlot: null });
  },
  setLeave: (leave) => currentClient?.setLeave(leave),
  setAuto: (auto) => currentClient?.setTokenGeneration({ auto }),
  setRequested: (token) => currentClient?.setTokenGeneration({ requested: token }),
  lockIn: () => currentClient?.lockIn(),
  passTurn: () => currentClient?.lockIn(),
  restart: () => currentClient?.restart(),
}));
