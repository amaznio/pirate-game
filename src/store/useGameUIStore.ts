import { create } from 'zustand';
import type { GameState, GameStatus } from '../game/domain/GameState';
import type {
  ActionSlot,
  CannonQueue,
  CannonSide,
  MovementAction,
  TokenInventory,
} from '../game/domain/Action';
import type { Side } from '../game/domain/Entity';
import { getShipBySide } from '../game/simulation/selectors';
import { TURN_DURATION_SECONDS } from '../game/config/gameRules';
import { gameController } from '../app/gameInstance';

export interface GameUISnapshot {
  turn: number;
  status: GameStatus;
  hull: number;
  maxHull: number;
  enemyHull: number;
  enemyMaxHull: number;
  tokens: TokenInventory;
  queue: ActionSlot[];
  cannonQueue: CannonQueue;
  ammo: number;
  auto: boolean;
  requested: MovementAction;
  winner: Side | null;
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
  const player = getShipBySide(state, 'player');
  const enemy = getShipBySide(state, 'enemy');
  return {
    turn: state.turn,
    status: state.status,
    hull: player?.hp ?? 0,
    maxHull: player?.maxHp ?? 0,
    enemyHull: enemy?.hp ?? 0,
    enemyMaxHull: enemy?.maxHp ?? 0,
    tokens: { ...state.tokenInventories.player },
    queue: [...state.queues.player],
    cannonQueue: state.cannonQueues.player.map((slot) => ({ ...slot })),
    ammo: state.ammo.player,
    auto: state.tokenGeneration.auto,
    requested: state.tokenGeneration.requested,
    winner: state.winner,
    deadline: gameController.getPlanningDeadline(),
    turnDurationSeconds: TURN_DURATION_SECONDS,
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
