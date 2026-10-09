import type { CannonSide, MovementAction } from '../game/domain/Action';

export interface TokenMeta {
  readonly label: string;
  readonly short: string;
  readonly arrow: string;
  readonly bgClass: string;
  readonly ringClass: string;
}

export const TOKEN_META: Record<MovementAction, TokenMeta> = {
  TURN_LEFT: {
    label: 'Left',
    short: 'LEFT',
    arrow: '↰',
    bgClass: 'bg-token-left',
    ringClass: 'ring-token-left',
  },
  FORWARD: {
    label: 'Forward',
    short: 'FORWARD',
    arrow: '↑',
    bgClass: 'bg-token-forward',
    ringClass: 'ring-token-forward',
  },
  TURN_RIGHT: {
    label: 'Right',
    short: 'RIGHT',
    arrow: '↱',
    bgClass: 'bg-token-right',
    ringClass: 'ring-token-right',
  },
};

export const TOKEN_ORDER: readonly MovementAction[] = [
  'TURN_LEFT',
  'FORWARD',
  'TURN_RIGHT',
];

export const CANNON_META: Record<CannonSide, { readonly label: string }> = {
  left: { label: 'Fire left' },
  right: { label: 'Fire right' },
};
