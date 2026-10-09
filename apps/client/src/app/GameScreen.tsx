import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameClient } from '@pirate/game-core/client/GameClient';
import { createPhaserGame, type PhaserHandle } from '../phaser/PhaserGame';
import { bindGameClient, useGameUIStore } from '../store/useGameUIStore';
import { BattleHUD } from '../ui/BattleHUD';
import { MobilePlanningSheet } from '../ui/MobilePlanningSheet';
import { DesktopSidebar } from '../ui/DesktopSidebar';
import { PreviewToggle } from '../ui/PreviewToggle';
import { useIsDesktop } from '../ui/useIsDesktop';
import { useDesktopShortcuts } from '../ui/useDesktopShortcuts';

interface GameScreenProps {
  client: GameClient;
  /** Offline matches can be restarted in place; online ones cannot. */
  canRestart: boolean;
  /** Leave the match and go back to the menu. */
  onExit: () => void;
  /** Online only: the connection to the game server is down. */
  disconnected?: boolean;
  /** A short message to show for a moment (e.g. a plan the server refused). */
  notice?: string | null;
}

/** Friendly wording for why the server refused a plan. */
const REFUSAL: Record<string, string> = {
  not_enough_tokens: 'That plan uses movement tokens you do not have.',
  not_enough_ammo: 'That plan fires more cannonballs than you have.',
  not_planning: 'Too late: that turn is already being played.',
  already_locked_in: 'You have already locked in.',
  malformed_plan: 'That plan was not understood.',
};

export function GameScreen({
  client,
  canRestart,
  onExit,
  disconnected = false,
  notice = null,
}: GameScreenProps) {
  // Point the UI at this match before anything below reads from the store.
  useState(() => {
    bindGameClient(client);
    return null;
  });
  useEffect(() => () => bindGameClient(null), []);

  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PhaserHandle | null>(null);
  const status = useGameUIStore((state) => state.status);
  const result = useGameUIStore((state) => state.result);
  const restart = useGameUIStore((state) => state.restart);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const handle = createPhaserGame(containerRef.current, client);
    handleRef.current = handle;
    return () => {
      handle.destroy();
      handleRef.current = null;
    };
  }, [client]);

  const busy = status === 'resolving' || status === 'animating';
  const desktop = useIsDesktop();
  useDesktopShortcuts();

  // On mobile the HUD (top) and planning sheet (bottom) overlay the board; tell
  // the camera how much each covers so recentering and the off-screen
  // indicators use the part of the screen that is actually visible.
  const [sheetHeight, setSheetHeight] = useState(0);
  const [hudHeight, setHudHeight] = useState(0);
  const onSheetHeight = useCallback((pixels: number) => setSheetHeight(pixels), []);
  const onHudHeight = useCallback((pixels: number) => setHudHeight(pixels), []);
  const insetTop = desktop ? 0 : hudHeight;
  const insetBottom = desktop ? 0 : sheetHeight;
  useEffect(() => {
    handleRef.current?.setInsets({ top: insetTop, bottom: insetBottom });
  }, [insetTop, insetBottom]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-ocean-deep">
      <div className="relative h-full min-w-0 flex-1 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />

        {!desktop && <BattleHUD onHeightChange={onHudHeight} />}

        <div
          className="absolute right-3 z-20 flex flex-col gap-2"
          style={{ bottom: desktop ? 12 : sheetHeight + 12 }}
        >
          <PreviewToggle />
          <button
            type="button"
            onClick={() => handleRef.current?.recenterOnPlayer()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-ocean/80 text-lg text-parchment shadow-lg backdrop-blur transition hover:bg-ocean active:scale-95"
            aria-label="Recenter on my ship"
            title="Recenter on my ship"
          >
            ◎
          </button>
        </div>

        {!desktop && <MobilePlanningSheet onHeightChange={onSheetHeight} />}

        {(busy || disconnected || notice) && (
          <div
            className="pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center gap-1.5"
            style={{ top: desktop ? 12 : hudHeight + 8 }}
          >
            {disconnected && (
              <span
                role="status"
                className="rounded-full bg-hull/90 px-3 py-1 text-xs font-bold text-white"
              >
                Connection lost — reconnecting…
              </span>
            )}
            {notice && (
              <span
                role="status"
                className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-parchment"
              >
                {REFUSAL[notice] ?? 'That plan was refused.'}
              </span>
            )}
            {busy && !disconnected && (
              <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-parchment">
                Resolving turn…
              </span>
            )}
          </div>
        )}
      </div>

      {desktop && <DesktopSidebar />}

      {status === 'game_over' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-sm rounded-2xl border border-parchment/25 bg-ocean p-6 text-center shadow-2xl">
            <h2 className="text-2xl font-black text-parchment">
              {result === 'win'
                ? 'Victory!'
                : result === 'draw'
                  ? 'Mutual destruction'
                  : 'Your ship has sunk'}
            </h2>
            <p className="mt-2 text-sm text-parchment/70">
              {result === 'win'
                ? 'The enemy fleet is wreckage.'
                : result === 'draw'
                  ? 'Every ship went down together.'
                  : 'Better luck next voyage, captain.'}
            </p>
            {canRestart && (
              <button
                type="button"
                onClick={restart}
                className="mt-5 w-full rounded-xl bg-parchment px-4 py-3 text-base font-black uppercase tracking-wide text-ink shadow-lg active:scale-95"
              >
                Sail Again
              </button>
            )}
            <button
              type="button"
              onClick={onExit}
              className={`w-full rounded-xl px-4 py-3 text-base font-black uppercase tracking-wide shadow-lg active:scale-95 ${
                canRestart
                  ? 'mt-2 bg-parchment/15 text-parchment'
                  : 'mt-5 bg-parchment text-ink'
              }`}
            >
              {canRestart ? 'Main menu' : 'Back to menu'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
