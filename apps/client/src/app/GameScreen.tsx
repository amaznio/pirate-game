import { LocateFixed } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameClient } from '@pirate/game-core/client/GameClient';
import type { MatchResult } from '@pirate/game-core/domain/MatchResult';
import { Button } from '@/components/ui/button';
import { createPhaserGame, type PhaserHandle } from '../phaser/PhaserGame';
import { bindGameClient, useGameUIStore } from '../store/useGameUIStore';
import { BattleHUD } from '../ui/BattleHUD';
import { BossBar, BossMoment } from '../ui/BossBar';
import { MobilePlanningSheet } from '../ui/MobilePlanningSheet';
import { DesktopSidebar } from '../ui/DesktopSidebar';
import { PreviewToggle } from '../ui/PreviewToggle';
import { SeaGuideButton } from '../ui/SeaGuideDialog';
import { useIsDesktop } from '../ui/useIsDesktop';
import { useDesktopShortcuts } from '../ui/useDesktopShortcuts';
import { GameOverDialog, SunkDialog } from '../ui/EndDialogs';

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
  /**
   * A battle of the solo voyage. `onResult` is called once, as soon as the match
   * has ended, so the voyage has its result even if the page is closed before the
   * player presses Continue; `onContinue` then takes them back to the voyage.
   */
  runBattle?: { onResult: (result: MatchResult | null) => void; onContinue: () => void };
}

/** Catalog keys for the short messages shown over the board. */
const NOTICE_KEYS = {
  ai_took_over: 'notice.aiTookOver',
  not_enough_tokens: 'notice.notEnoughTokens',
  not_enough_ammo: 'notice.notEnoughAmmo',
  not_planning: 'notice.notPlanning',
  already_locked_in: 'notice.alreadyLockedIn',
  malformed_plan: 'notice.malformedPlan',
} as const;

export function GameScreen({
  client,
  canRestart,
  onExit,
  disconnected = false,
  notice = null,
  runBattle,
}: GameScreenProps) {
  const { t } = useTranslation();
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
  const note = useGameUIStore((state) => state.endNote);
  const matchResult = useGameUIStore((state) => state.battle);
  const spectating = useGameUIStore((state) => state.spectating);
  // Told once per sinking; it comes back only if the player is afloat again.
  const [sunkDismissed, setSunkDismissed] = useState(false);
  useEffect(() => {
    if (!spectating) {
      setSunkDismissed(false);
    }
  }, [spectating]);
  const restart = useGameUIStore((state) => state.restart);

  // A voyage battle hands its result over the moment the match ends.
  const runBattleRef = useRef(runBattle);
  runBattleRef.current = runBattle;
  const reportedRef = useRef(false);
  useEffect(() => {
    if (status === 'game_over' && !reportedRef.current && runBattleRef.current) {
      reportedRef.current = true;
      runBattleRef.current.onResult(matchResult);
    }
  }, [status, matchResult]);

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

  const noticeKey =
    notice && notice in NOTICE_KEYS
      ? NOTICE_KEYS[notice as keyof typeof NOTICE_KEYS]
      : 'notice.unknown';

  return (
    <div className="flex h-full w-full overflow-hidden bg-ocean-deep">
      <div className="relative h-full min-w-0 flex-1 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />

        {!desktop && <BattleHUD onHeightChange={onHudHeight} />}
        <BossBar
          className="absolute left-1/2 z-10 -translate-x-1/2"
          style={{ top: desktop ? 12 : hudHeight + 8 }}
        />
        <BossMoment />

        <div
          className="absolute right-3 z-20 flex flex-col gap-2"
          style={{ bottom: desktop ? 12 : sheetHeight + 12 }}
        >
          <PreviewToggle />
          {!desktop && <SeaGuideButton />}
          <Button
            variant="secondary"
            size="icon"
            onClick={() => handleRef.current?.recenterOnPlayer()}
            className="rounded-full bg-card/90 shadow-lg backdrop-blur hover:bg-card"
            aria-label={t('board.recenter')}
            title={t('board.recenter')}
          >
            <LocateFixed />
          </Button>
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
                className="rounded-full bg-destructive px-3 py-1 text-xs font-bold text-white"
              >
                {t('board.reconnecting')}
              </span>
            )}
            {notice && (
              <span
                role="status"
                className="rounded-full bg-card/90 px-3 py-1 text-xs font-bold text-foreground"
              >
                {t(noticeKey)}
              </span>
            )}
            {busy && !disconnected && (
              <span className="rounded-full bg-card/80 px-3 py-1 text-xs font-bold text-foreground">
                {t('board.resolving')}
              </span>
            )}
          </div>
        )}
      </div>

      {desktop && <DesktopSidebar />}

      {/* Sunk while others are still fighting: say so, and let them stay or leave.
          It waits for the turn that sank them to finish animating. */}
      {spectating && status === 'planning' && !sunkDismissed && (
        <SunkDialog onKeepWatching={() => setSunkDismissed(true)} onExit={onExit} />
      )}

      {status === 'game_over' && (
        <GameOverDialog
          result={result}
          note={note}
          canRestart={canRestart}
          onRestart={restart}
          onExit={onExit}
          {...(runBattle ? { onContinue: runBattle.onContinue } : {})}
        />
      )}
    </div>
  );
}
