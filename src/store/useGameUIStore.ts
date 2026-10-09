import { create } from 'zustand';
import type { GameState, GameStatus } from '../game/domain/GameState';
import type {
  ActionSlot,
  CannonQueue,
  CannonSide,
  MovementAction,
  TokenInventory,
} from '../game/domain/Action';
import type { PlayerId } from '../game/domain/Entity';
import { gameController } from '../app/gameInstance';

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

/** Derives the read-only UI projection from authoritative game state. */
function snapshot(state: GameState): GameUISnapshot {
  const viewerId = gameController.getViewerId();
  const viewer = state.players[viewerId];
  const ship = state.ships[viewer.shipId];

  const others: ShipSummary[] = Object.values(state.players)
    .filter((player) => player.id !== viewerId)
    .map((player) => {
      const other = state.ships[player.shipId];
      return {
        playerId: player.id,
        hull: other?.hp ?? 0,
        maxHull: other?.maxHp ?? 0,
        ally: player.teamId === viewer.teamId,
      };
    });

  let result: MatchResult | null = null;
  if (state.outcome) {
    result =
      state.outcome.kind === 'draw'
        ? 'draw'
        : state.outcome.teamId === viewer.teamId
          ? 'win'
          : 'loss';
  }

  return {
    turn: state.turn,
    status: state.status,
    hull: ship?.hp ?? 0,
    maxHull: ship?.maxHp ?? 0,
    others,
    tokens: { ...viewer.tokens },
    queue: [...viewer.queue],
    cannonQueue: viewer.cannonQueue.map((slot) => ({ ...slot })),
    ammo: viewer.ammo,
    auto: viewer.tokenGeneration.auto,
    requested: viewer.tokenGeneration.requested,
    lockedIn: viewer.lockedIn,
    waitingFor: Object.values(state.players).filter(
      (player) =>
        player.controller === 'human' &&
        player.id !== viewerId &&
        !player.lockedIn,
    ).length,
    canPlan: state.status === 'planning' && !viewer.lockedIn,
    result,
    deadline: gameController.getPlanningDeadline(),
    turnDurationSeconds: state.rules.turnDurationSeconds ?? 0,
  };
}

export const useGameUIStore = create<GameUIStore>(() => ({
  ...snapshot(gameController.getState()),
  activeSlot: null,
  panelOpen: true,
  setPanelOpen: (open) => useGameUIStore.setState({ panelOpen: open }),
  setActiveSlot: (slot) => useGameUIStore.setState({ activeSlot: slot }),
  queuePlayerAction: (action) => {
    const { activeSlot } = useGameUIStore.getState();
    gameController.queuePlayerAction(action, activeSlot ?? undefined);
    useGameUIStore.setState({ activeSlot: null });
  },
  removePlayerAction: (index) => gameController.removePlayerAction(index),
  toggleCannon: (phase, side) => gameController.togglePlayerCannon(phase, side),
  clearPlayerActions: () => {
    gameController.clearPlayerActions();
    useGameUIStore.setState({ activeSlot: null });
  },
  setAuto: (auto) => gameController.setAutoTokenGeneration(auto),
  setRequested: (token) => gameController.setRequestedTokenType(token),
  lockIn: () => gameController.lockInTurn(),
  passTurn: () => gameController.lockInTurn(),
  restart: () => gameController.startNewGame(),
}));

gameController.subscribe((state) => {
  const next = snapshot(state);
  useGameUIStore.setState(
    state.status === 'planning' ? next : { ...next, activeSlot: null },
  );
});
