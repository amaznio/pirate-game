import type { TFunction } from 'i18next';
import type { CannonSide, MovementAction } from '@pirate/game-core/domain/Action';

export interface TokenMeta {
  readonly short: string;
  readonly arrow: string;
  /** Desktop keyboard shortcut. */
  readonly key: string;
  readonly bgClass: string;
  readonly ringClass: string;
  readonly borderClass: string;
  readonly textClass: string;
}

export const TOKEN_META: Record<MovementAction, TokenMeta> = {
  TURN_LEFT: {
    short: 'LEFT',
    arrow: '↰',
    key: '1',
    bgClass: 'bg-token-left',
    ringClass: 'ring-token-left',
    borderClass: 'border-token-left',
    textClass: 'text-token-left',
  },
  FORWARD: {
    short: 'FORWARD',
    arrow: '↑',
    key: '2',
    bgClass: 'bg-token-forward',
    ringClass: 'ring-token-forward',
    borderClass: 'border-token-forward',
    textClass: 'text-token-forward',
  },
  TURN_RIGHT: {
    short: 'RIGHT',
    arrow: '↱',
    key: '3',
    bgClass: 'bg-token-right',
    ringClass: 'ring-token-right',
    borderClass: 'border-token-right',
    textClass: 'text-token-right',
  },
};

export const TOKEN_ORDER: readonly MovementAction[] = [
  'TURN_LEFT',
  'FORWARD',
  'TURN_RIGHT',
];

const TOKEN_LABEL_KEYS = {
  TURN_LEFT: 'token.turnLeft',
  FORWARD: 'token.forward',
  TURN_RIGHT: 'token.turnRight',
} as const satisfies Record<MovementAction, string>;

const CANNON_SIDE_KEYS = {
  left: 'token.turnLeft',
  right: 'token.turnRight',
} as const satisfies Record<CannonSide, string>;

export function tokenLabel(t: TFunction, action: MovementAction): string {
  return t(TOKEN_LABEL_KEYS[action]);
}

/** The word for a broadside ("Left" / "Right"), for labels and aria text. */
export function cannonSideLabel(t: TFunction, side: CannonSide): string {
  return t(CANNON_SIDE_KEYS[side]);
}
