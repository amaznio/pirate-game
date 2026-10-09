import { useGameUIStore } from '../store/useGameUIStore';
import { useCountdown } from './useCountdown';

export const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  resolving: 'Resolving',
  animating: 'Resolving',
  game_over: 'Battle over',
};

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
    remaining,
    low: planning && remaining <= 10,
    fraction: duration > 0 ? Math.min(1, remaining / duration) : 0,
  };
}
