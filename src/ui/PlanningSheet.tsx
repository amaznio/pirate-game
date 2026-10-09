import { useState } from 'react';
import { useGameUIStore } from '../store/useGameUIStore';
import { MoveTokenTray } from './MoveTokenTray';
import { PlannedMoves } from './PlannedMoves';
import { TOKEN_META, TOKEN_ORDER } from './tokenMeta';

/** Collapsible bottom planning sheet: the board stays dominant when collapsed. */
export function PlanningSheet() {
  const [expanded, setExpanded] = useState(false);
  const status = useGameUIStore((state) => state.status);
  const hasPlan = useGameUIStore(
    (state) =>
      state.queue.some((slot) => slot !== null) ||
      state.cannonQueue.some((slot) => slot.left || slot.right),
  );
  const ammo = useGameUIStore((state) => state.ammo);
  const cannonQueue = useGameUIStore((state) => state.cannonQueue);
  const auto = useGameUIStore((state) => state.auto);
  const requested = useGameUIStore((state) => state.requested);
  const setAuto = useGameUIStore((state) => state.setAuto);
  const setRequested = useGameUIStore((state) => state.setRequested);
  const lockIn = useGameUIStore((state) => state.lockIn);
  const clearPlayerActions = useGameUIStore((state) => state.clearPlayerActions);

  const planning = status === 'planning';
  const queuedShots = cannonQueue.reduce(
    (total, slot) => total + (slot.left ? 1 : 0) + (slot.right ? 1 : 0),
    0,
  );
  const ammoRemaining = ammo - queuedShots;

  if (!expanded) {
    return (
      <section className="absolute inset-x-0 bottom-0 z-30 border-t border-parchment/20 bg-ocean/85 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <MoveTokenTray compact />
          <button
            type="button"
            disabled={!planning}
            onClick={lockIn}
            className="ml-auto flex shrink-0 items-center gap-1 rounded-xl bg-parchment/15 px-3 py-2 text-sm font-bold text-parchment active:scale-95 disabled:opacity-40"
          >
            {hasPlan ? 'Lock In' : 'Pass'}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex shrink-0 items-center gap-1 rounded-xl bg-parchment px-3 py-2 text-sm font-bold text-ink shadow active:scale-95"
          >
            Plan <span aria-hidden>▴</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="absolute inset-x-0 bottom-0 z-30 max-h-[78vh] overflow-y-auto rounded-t-2xl border-t border-parchment/25 bg-ocean/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-parchment">
            Battle Plan
          </h2>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="rounded-lg bg-parchment/15 px-3 py-1.5 text-sm font-bold text-parchment active:scale-95"
          >
            Hide <span aria-hidden>▾</span>
          </button>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-xl bg-black/20 px-3 py-2">
          <span className="text-xs font-bold uppercase tracking-wide text-parchment/80">
            Next token
          </span>
          <button
            type="button"
            disabled={!planning}
            onClick={() => setAuto(!auto)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold shadow active:scale-95 disabled:opacity-50 ${
              auto ? 'bg-token-forward text-white' : 'bg-parchment text-ink'
            }`}
          >
            AUTO {auto ? 'ON' : 'OFF'}
          </button>
        </div>
        {!auto && (
          <div className="mb-4 grid grid-cols-3 gap-2">
            {TOKEN_ORDER.map((action) => {
              const meta = TOKEN_META[action];
              const selected = requested === action;
              return (
                <button
                  key={action}
                  type="button"
                  disabled={!planning}
                  onClick={() => setRequested(action)}
                  className={`rounded-lg px-2 py-2 text-xs font-bold shadow transition active:scale-95 disabled:opacity-50 ${
                    selected
                      ? `${meta.bgClass} text-white`
                      : 'bg-parchment/15 text-parchment'
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        )}

        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-parchment/80">
          Available Move Tokens
        </h3>
        <MoveTokenTray />

        <div className="mt-4 mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-parchment/80">
            Planned Moves &amp; Cannons
          </h3>
          <span className="flex items-center gap-1.5 rounded-full bg-black/25 px-2.5 py-1 text-xs font-bold text-parchment">
            <span
              className="inline-block h-3 w-3 rounded-full bg-ink ring-1 ring-parchment/40"
              aria-hidden
            />
            {ammoRemaining} / {ammo} cannonballs
          </span>
        </div>
        <PlannedMoves />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={!planning || !hasPlan}
            onClick={clearPlayerActions}
            className="rounded-xl bg-parchment/15 px-4 py-3 text-sm font-bold text-parchment active:scale-95 disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={!planning}
            onClick={lockIn}
            className="flex-1 rounded-xl bg-parchment px-4 py-3 text-base font-black uppercase tracking-wide text-ink shadow-lg active:scale-95 disabled:opacity-40"
          >
            {hasPlan ? 'Lock In Moves' : 'Pass Turn'}
          </button>
        </div>
        {planning && !hasPlan && (
          <p className="mt-2 text-center text-xs text-parchment/60">
            Nothing queued — locking in passes your turn.
          </p>
        )}
      </div>
    </section>
  );
}
