import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MovementAction } from '@pirate/game-core/domain/Action';
import { useGameUIStore } from '../store/useGameUIStore';
import { TOKEN_META, tokenLabel } from './tokenMeta';

/** What is being dragged: a token from the tray, or the token that sits in a slot. */
export type DragItem =
  | { readonly kind: 'tray'; readonly action: MovementAction }
  | { readonly kind: 'slot'; readonly index: number; readonly action: MovementAction | null };

/** Where it can be dropped: on a phase slot, or back on the tray (which takes a placed token out). */
export type DropTarget = { readonly kind: 'slot'; readonly index: number } | { readonly kind: 'tray' };

export const TRAY_DROP_ID = 'plan-tray';
export const slotDropId = (index: number): string => `plan-slot-${index}`;

/**
 * Drag and drop for the plan, with dnd-kit: drag a token from the tray onto a phase slot, drag a
 * placed token to another slot (swapping if it is filled), or drop a placed token back on the tray
 * to take it out. Tapping still works. A drag starts after the pointer moves a few pixels (so a
 * tap is still a tap) or, on a touch screen, after a short press (so the planning sheet still scrolls).
 * Keyboard users have the tap flow: every token and slot is a button.
 */
export function PlanDnd({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const placePlayerAction = useGameUIStore((state) => state.placePlayerAction);
  const movePlayerAction = useGameUIStore((state) => state.movePlayerAction);
  const removePlayerAction = useGameUIStore((state) => state.removePlayerAction);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    const item = active.data.current as DragItem | undefined;
    const target = over?.data.current as DropTarget | undefined;
    if (!item || !target) {
      return;
    }
    if (target.kind === 'slot') {
      if (item.kind === 'tray') {
        placePlayerAction(item.action, target.index);
      } else {
        movePlayerAction(item.index, target.index);
      }
    } else if (item.kind === 'slot') {
      removePlayerAction(item.index);
    }
  }

  const action = dragging?.action ?? null;
  const meta = action ? TOKEN_META[action] : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => setDragging((active.data.current as DragItem | undefined) ?? null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {action && meta ? (
          <div
            className={`${meta.bgClass} flex items-center gap-2 rounded-lg border border-white/30 px-3 py-1.5 text-sm font-bold text-white shadow-lg`}
          >
            <span className="text-lg leading-none" aria-hidden>
              {meta.arrow}
            </span>
            {tokenLabel(t, action)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
