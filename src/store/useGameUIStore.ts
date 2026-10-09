import { create } from 'zustand';
import type { GameStatus } from '../game/domain/GameState';
import type { ClientSnapshot } from '../game/client/GameClient';
import type {
  ActionSlot,
  CannonQueue,
  CannonSide,
  MovementAction,
  TokenInventory,
} from '../game/domain/Action';
import type { PlayerId } from '../game/domain/Entity';
import { gameClient } from '../app/gameInstance';

/** Another ship in the match, as the local player sees it (public info only). */
export interface ShipSummary {
  playerId: PlayerId;
  hull: number;
  maxHull: number;
  /** On the viewer's team (never an enemy). */
  ally: boolean;
}

export type MatchResult = 'win' | 'loss' | 'draw';

export interface GameUISnapshot {
  turn: number;
  status: GameStatus;
  hull: number;
  maxHull: number;
  /** Every other ship in the match. */
  others: ShipSummary[];
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

  const others: ShipSummary[] = Object.values(view.players)
    .filter((player) => player.id !== view.viewerId)
    .map((player) => {
      const other = view.ships[player.shipId];
      return {
        playerId: player.id,
        hull: other?.hp ?? 0,
        maxHull: other?.maxHp ?? 0,
        ally: player.teamId === self.teamId,
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
    others,
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

export const useGameUIStore = create<GameUIStore>(() => ({
  ...snapshot(gameClient.getSnapshot()),
  activeSlot: null,
  panelOpen: true,
  setPanelOpen: (open) => useGameUIStore.setState({ panelOpen: open }),
  setActiveSlot: (slot) => useGameUIStore.setState({ activeSlot: slot }),
  queuePlayerAction: (action) => {
    const { activeSlot } = useGameUIStore.getState();
    gameClient.queueToken(action, activeSlot ?? undefined);
    useGameUIStore.setState({ activeSlot: null });
  },
  removePlayerAction: (index) => gameClient.removeToken(index),
  toggleCannon: (phase, side) => gameClient.toggleCannon(phase, side),
  clearPlayerActions: () => {
    gameClient.clearDraft();
    useGameUIStore.setState({ activeSlot: null });
  },
  setAuto: (auto) => gameClient.setTokenGeneration({ auto }),
  setRequested: (token) => gameClient.setTokenGeneration({ requested: token }),
  lockIn: () => gameClient.lockIn(),
  passTurn: () => gameClient.lockIn(),
  restart: () => gameClient.restart(),
}));

gameClient.subscribe((clientSnapshot) => {
  const next = snapshot(clientSnapshot);
  useGameUIStore.setState(
    clientSnapshot.view.status === 'planning'
      ? next
      : { ...next, activeSlot: null },
  );
});
