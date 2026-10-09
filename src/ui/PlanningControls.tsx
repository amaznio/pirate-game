import { useGameUIStore } from '../store/useGameUIStore';
import { MoveTokenTray } from './MoveTokenTray';
import { PlannedMoves } from './PlannedMoves';
import { CannonballChip } from './CannonballChip';
import { TOKEN_META, TOKEN_ORDER } from './tokenMeta';

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-wide text-parchment/80">
      {children}
    </h3>
  );
}

/**
 * Everything needed to plan a turn: next-token choice, token tray, the four
 * phase rows with cannon toggles, and Clear / Lock In. Shared by the mobile
 * sheet and the desktop sidebar so both behave identically.
 */
export function PlanningControls() {
  const status = useGameUIStore((state) => state.status);
  const hasPlan = useGameUIStore(
    (state) =>
      state.queue.some((slot) => slot !== null) ||
      state.cannonQueue.some((slot) => slot.left || slot.right),
  );
  const auto = useGameUIStore((state) => state.auto);
  const requested = useGameUIStore((state) => state.requested);
  const setAuto = useGameUIStore((state) => state.setAuto);
  const setRequested = useGameUIStore((state) => state.setRequested);
  const lockIn = useGameUIStore((state) => state.lockIn);
  const clearPlayerActions = useGameUIStore((state) => state.clearPlayerActions);

  const planning = status === 'planning';

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl bg-black/20 px-3 py-2">
        <div className="flex items-center justify-between">
          <SectionTitle>Next turn token</SectionTitle>
          <button
            type="button"
            disabled={!planning}
            onClick={() => setAuto(!auto)}
            className={`rounded-lg px-3 py-1 text-xs font-bold shadow transition hover:brightness-110 active:scale-95 disabled:opacity-50 ${
              auto ? 'bg-token-forward text-white' : 'bg-parchment text-ink'
            }`}
          >
            AUTO {auto ? 'ON' : 'OFF'}
          </button>
        </div>
        {!auto && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {TOKEN_ORDER.map((action) => {
              const meta = TOKEN_META[action];
              const selected = requested === action;
              return (
                <button
                  key={action}
                  type="button"
                  disabled={!planning}
                  onClick={() => setRequested(action)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-bold shadow transition hover:brightness-110 active:scale-95 disabled:opacity-50 ${
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
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionTitle>Move tokens</SectionTitle>
        <MoveTokenTray />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <SectionTitle>Plan</SectionTitle>
          <CannonballChip />
        </div>
        <PlannedMoves />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!planning || !hasPlan}
          onClick={clearPlayerActions}
          className="rounded-xl bg-parchment/15 px-4 py-2.5 text-sm font-bold text-parchment transition hover:bg-parchment/25 active:scale-95 disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={!planning}
          onClick={lockIn}
          className="flex-1 rounded-xl bg-parchment px-4 py-2.5 text-base font-black uppercase tracking-wide text-ink shadow-lg transition hover:brightness-105 active:scale-95 disabled:opacity-40"
        >
          {hasPlan ? 'Lock In' : 'Pass Turn'}
        </button>
      </div>
    </div>
  );
}
