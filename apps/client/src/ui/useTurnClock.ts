import type { TFunction } from 'i18next';
import { useGameUIStore } from '../store/useGameUIStore';
import { useCountdown } from './useCountdown';

const STATUS_KEYS = {
  planning: 'status.planning',
  resolving: 'status.resolving',
  animating: 'status.resolving',
  game_over: 'status.gameOver',
} as const;

/** A human word for the match status, or the raw status if it is unknown. */
export function statusLabel(t: TFunction, status: string): string {
  return status in STATUS_KEYS
    ? t(STATUS_KEYS[status as keyof typeof STATUS_KEYS])
    : status;
}

export function formatSeconds(seconds: number): string {
  return `0:${Math.ceil(seconds).toString().padStart(2, '0')}`;
}

/** Turn number plus the planning countdown, shared by the mobile and desktop HUDs. */
export function useTurnClock() {
  const turn = useGameUIStore((state) => state.turn);
  const status = useGameUIStore((state) => state.status);
  const deadline = useGameUIStore((state) => state.deadline);
  const duration = useGameUIStore((state) => state.turnDurationSeconds);

  const planning = status === 'planning';
  const remaining = useCountdown(planning ? deadline : null);

  return {
    turn,
    status,
    planning,
    /** False when the match has no planning timer. */
    timed: duration > 0,
    remaining,
    low: planning && remaining <= 10,
    fraction: duration > 0 ? Math.min(1, remaining / duration) : 0,
  };
}
