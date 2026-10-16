import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import type { MovementAction } from '@pirate/game-core/domain/Action';
import { useGameUIStore } from '../store/useGameUIStore';
import { TRAY_DROP_ID, type DragItem, type DropTarget } from './PlanDnd';
import { TOKEN_META, TOKEN_ORDER, tokenLabel } from './tokenMeta';

/** One kind of token in the tray: tap it to fill the first empty slot, or drag it onto a slot. */
function TrayToken({ action }: { action: MovementAction }) {
  const { t } = useTranslation();
  const count = useGameUIStore((state) => state.tokens[action]);
  const canPlan = useGameUIStore((state) => state.canPlan);
  const queueFull = useGameUIStore((state) => state.queue.every((slot) => slot !== null));
  const queuePlayerAction = useGameUIStore((state) => state.queuePlayerAction);
  const item: DragItem = { kind: 'tray', action };
  const drag = useDraggable({ id: `plan-token-${action}`, data: item, disabled: !canPlan || count <= 0 });
  const meta = TOKEN_META[action];
  const label = tokenLabel(t, action);

  return (
    <button
      ref={drag.setNodeRef}
      {...drag.listeners}
      type="button"
      // A tap fills the first empty slot, so it needs one; a drag can replace a full slot.
      disabled={!canPlan || count <= 0}
      onClick={() => {
        if (!queueFull) {
          queuePlayerAction(action);
        }
      }}
      title={`${label} (${meta.key})`}
      className={`${meta.bgClass} flex select-none flex-col items-center justify-center rounded-xl px-3 py-1.5 text-sm font-bold text-white shadow transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 [-webkit-touch-callout:none] ${
        drag.isDragging ? 'opacity-40' : ''
      } ${queueFull && count > 0 ? 'cursor-grab' : ''}`}
    >
      <span className="leading-tight">{label}</span>
      <span className="text-[10px] font-semibold opacity-90">x{count}</span>
    </button>
  );
}

/**
 * Available movement tokens. Tapping one moves it into the first empty queue
 * slot and spends it from the pool; dragging one drops it on any slot. The tray is also
 * where a token dragged out of a slot is dropped to take it out of the plan.
 */
export function MoveTokenTray() {
  const target: DropTarget = { kind: 'tray' };
  const drop = useDroppable({ id: TRAY_DROP_ID, data: target });

  return (
    <div
      ref={drop.setNodeRef}
      className={`grid grid-cols-3 gap-2 rounded-xl ${drop.isOver ? 'ring-2 ring-parchment/60 ring-offset-2 ring-offset-transparent' : ''}`}
    >
      {TOKEN_ORDER.map((action) => (
        <TrayToken key={action} action={action} />
      ))}
    </div>
  );
}
