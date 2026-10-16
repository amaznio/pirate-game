import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** Which picture a stop gets (the files in public/assets/map). */
export type MapNodeKind =
  | 'start'
  | 'standard'
  | 'survive'
  | 'salvage'
  | 'merchant'
  | 'ambush'
  | 'hunt'
  | 'port'
  | 'boss';
export type MapNodeState = 'cleared' | 'current' | 'available' | 'locked';

/**
 * One stop on the voyage map: a pixel-art badge with its name under it. Its state shows in the
 * badge (a ring and our ship for where we are, a check for cleared, bright and pressable when it
 * is in reach, dim when it is further on) and in words for screen readers, never by colour alone.
 * It is placed by `style` (left and top) inside the map.
 */
export function MapNode({
  kind,
  state,
  label,
  stateLabel,
  cost,
  shipSrc,
  onSelect,
  style,
}: {
  kind: MapNodeKind;
  state: MapNodeState;
  /** The stop's name, under the badge. */
  label: string;
  /** The state in words, for screen readers. */
  stateLabel: string;
  /** What the leg to this stop costs in supplies, when it is in reach. */
  cost?: number | null;
  /** The picture of our ship, shown in the badge of the stop we are at. */
  shipSrc?: string;
  onSelect?: () => void;
  style?: CSSProperties;
}) {
  const Body = onSelect ? 'button' : 'div';
  return (
    <div
      role="listitem"
      aria-current={state === 'current' ? 'step' : undefined}
      style={style}
      className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
    >
      <Body
        {...(onSelect ? { type: 'button' as const, onClick: onSelect } : {})}
        aria-label={`${label}, ${stateLabel}`}
        className={cn(
          'relative flex size-20 items-center justify-center rounded-card border-2 outline-none',
          state === 'current' && 'border-primary bg-sky-700/40 ring-[3px] ring-ring ring-offset-2 ring-offset-background',
          state === 'cleared' && 'border-border bg-card',
          state === 'available' && 'border-primary bg-card',
          state === 'locked' && 'border-border/50 bg-ocean-deep',
          onSelect &&
            'cursor-pointer transition hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring active:scale-95',
        )}
      >
        {state === 'current' && shipSrc ? (
          <img src={shipSrc} alt="" className="map-bob max-h-16 w-auto [image-rendering:pixelated]" />
        ) : (
          <img
            src={`/assets/map/stop-${kind}.png`}
            alt=""
            className={cn('size-16 [image-rendering:pixelated]', (state === 'locked' || state === 'cleared') && 'opacity-65')}
          />
        )}
        {state === 'cleared' && (
          <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3.5" aria-hidden />
          </span>
        )}
        {state === 'available' && cost != null && (
          <span className="absolute -right-2 -top-2 rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
            −{cost}
          </span>
        )}
      </Body>
      <span
        className={cn(
          'rounded bg-background/85 px-1 text-center text-xs font-bold leading-tight',
          state === 'locked' || state === 'cleared' ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {label}
      </span>
    </div>
  );
}
