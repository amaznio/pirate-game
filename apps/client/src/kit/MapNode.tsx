import { Anchor, Check, House, Lock, Skull, Swords, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MapNodeKind = 'start' | 'battle' | 'port' | 'boss';
export type MapNodeState = 'cleared' | 'current' | 'available' | 'locked';

const KIND_ICONS = {
  start: House,
  battle: Swords,
  port: Wrench,
  boss: Skull,
} as const;

/**
 * One stop on the voyage map. Its state is shown by a badge icon and its words
 * (a check for cleared, a lock for locked, an anchor for "you are here") as
 * well as by fill, so it never rests on colour alone.
 */
export function MapNode({
  kind,
  state,
  title,
  detail,
  stateLabel,
  className,
}: {
  kind: MapNodeKind;
  state: MapNodeState;
  title: string;
  /** The kind and state in words, such as "Battle · cleared". */
  detail: string;
  /** The state alone, for screen readers. */
  stateLabel: string;
  className?: string;
}) {
  const KindIcon = KIND_ICONS[kind];
  const StateIcon = state === 'cleared' ? Check : state === 'locked' ? Lock : state === 'current' ? Anchor : null;
  return (
    <div
      role="listitem"
      aria-label={`${title}, ${stateLabel}`}
      aria-current={state === 'current' ? 'step' : undefined}
      className={cn(
        'relative flex min-h-16 items-center gap-3 rounded-card border-2 px-3 py-2',
        state === 'current' && 'border-primary bg-secondary ring-[3px] ring-ring ring-offset-2 ring-offset-background',
        state === 'cleared' && 'border-border bg-card',
        state === 'available' && 'border-border bg-card',
        state === 'locked' && 'border-dashed border-border bg-card/50 text-muted-foreground',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-btn',
          state === 'current' ? 'bg-primary text-primary-foreground' : 'bg-background/60',
        )}
      >
        <KindIcon className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base font-bold">{title}</span>
        <span className="text-xs font-semibold text-muted-foreground">{detail}</span>
      </span>
      {StateIcon && <StateIcon className="size-5 shrink-0" aria-hidden />}
    </div>
  );
}
