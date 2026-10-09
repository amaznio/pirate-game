import { useEffect, useRef } from 'react';
import { createPhaserGame, type PhaserHandle } from '../phaser/PhaserGame';
import { eventBus, gameController } from './gameInstance';
import { useGameUIStore } from '../store/useGameUIStore';
import { BattleHUD } from '../ui/BattleHUD';
import { PlanningSheet } from '../ui/PlanningSheet';

export function GameScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PhaserHandle | null>(null);
  const status = useGameUIStore((state) => state.status);
  const winner = useGameUIStore((state) => state.winner);
  const restart = useGameUIStore((state) => state.restart);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const handle = createPhaserGame(containerRef.current, gameController, eventBus);
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
  }, []);

  const busy = status === 'resolving' || status === 'animating';

  return (
    <div className="relative h-full w-full overflow-hidden bg-ocean-deep">
      <div ref={containerRef} className="absolute inset-0" />

      <BattleHUD />

      <button
        type="button"
        onClick={() => handleRef.current?.recenterOnPlayer()}
        className="absolute right-3 bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+5.5rem))] z-20 flex h-10 w-10 items-center justify-center rounded-full bg-ocean/80 text-lg text-parchment shadow-lg backdrop-blur active:scale-95"
        aria-label="Recenter on my ship"
        title="Recenter on my ship"
      >
        ◎
      </button>

      <PlanningSheet />

      {busy && (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-20 flex justify-center">
          <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-parchment">
            Resolving turn…
          </span>
        </div>
      )}

      {status === 'game_over' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-parchment/25 bg-ocean p-6 text-center shadow-2xl">
            <h2 className="text-2xl font-black text-parchment">
              {winner === 'player' ? 'Victory!' : 'Your ship has sunk'}
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              {winner === 'player'
                ? 'The enemy vessel is wreckage.'
                : 'Better luck next voyage, captain.'}
            </p>
            <button
              type="button"
              onClick={restart}
              className="mt-5 w-full rounded-xl bg-parchment px-4 py-3 text-base font-black uppercase tracking-wide text-ink shadow-lg active:scale-95"
            >
              Sail Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
