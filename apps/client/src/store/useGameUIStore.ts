import { create } from 'zustand';
import type { AiDifficulty, GameStatus } from '@pirate/game-core/domain/GameState';
import type { ClientSnapshot, GameClient } from '@pirate/game-core/client/GameClient';
import type {
  ActionSlot,
  CannonQueue,
  CannonSide,
  MovementAction,
  TokenInventory,
} from '@pirate/game-core/domain/Action';
import type { PlayerId } from '@pirate/game-core/domain/Entity';
import { assignTeamStyles } from '../presentation/teamStyle';
import { NO_HAZARDS, seaHazards, type SeaHazards } from '../presentation/seaHazards';

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
  /** Team colour of the local player as CSS. */
  selfColor: string;
  /** The local player's ship has sunk but the match goes on: they watch. */
  spectating: boolean;
  /** Every other ship in the match. */
  others: ShipSummary[];
  /** Which kinds of wind and whirlpool the board has. */
  hazards: SeaHazards;
  tokens: TokenInventory;
  queue: ActionSlot[];
  cannonQueue: CannonQueue;
  ammo: number;
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
  toggleCannon: (phase: number, side: CannonSide) => void;
  clearPlayerActions: () => void;
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
        bot: player.controller === 'ai',
        difficulty: player.aiDifficulty,
      };
    });

  let result: MatchResult | null = null;
  if (view.outcome) {
    result =
      view.outcome.kind === 'draw'
        ? 'draw'
        : view.outcome.teamId === self.teamId
          ? 'win'
          : 'loss';
  }

  return {
    turn: view.turn,
    status: view.status,
    hull: ship?.hp ?? 0,
    maxHull: ship?.maxHp ?? 0,
    selfColor: styles.get(self.teamId)?.css ?? '#4f86c6',
    spectating: (ship?.hp ?? 0) <= 0 && view.outcome === null,
    others,
    hazards: seaHazards(view.terrain),
    tokens: tokensLeft,
    queue: [...draft.movement],
    cannonQueue: draft.cannons,
    ammo: self.ammo,
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
    deadline,
    turnDurationSeconds: view.rules.turnDurationSeconds ?? 0,
  };
}

/** What the UI shows before any match is bound (it is never visible). */
const EMPTY: GameUISnapshot = {
  turn: 1,
  status: 'planning',
  hull: 0,
  maxHull: 0,
  selfColor: '#4f86c6',
  spectating: false,
  others: [],
  hazards: NO_HAZARDS,
  tokens: { FORWARD: 0, TURN_LEFT: 0, TURN_RIGHT: 0 },
  queue: [null, null, null, null],
  cannonQueue: [],
  ammo: 0,
  auto: true,
  requested: 'FORWARD',
  lockedIn: false,
  waitingFor: 0,
  canPlan: false,
  result: null,
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
  toggleCannon: (phase, side) => currentClient?.toggleCannon(phase, side),
  clearPlayerActions: () => {
    currentClient?.clearDraft();
    useGameUIStore.setState({ activeSlot: null });
  },
  setAuto: (auto) => currentClient?.setTokenGeneration({ auto }),
  setRequested: (token) => currentClient?.setTokenGeneration({ requested: token }),
  lockIn: () => currentClient?.lockIn(),
  passTurn: () => currentClient?.lockIn(),
  restart: () => currentClient?.restart(),
}));
