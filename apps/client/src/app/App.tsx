import type { MonsterTypeId } from '@pirate/game-core/domain/Monster';
import { objectiveFor, type ObjectiveChoice } from '../ui/menu/objectiveChoices';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiDifficulty } from '@pirate/game-core/domain/GameState';
import type { MapStyle } from '@pirate/game-core/board/generateBoard';
import type { MatchResult } from '@pirate/game-core/domain/MatchResult';
import type { BattleSetup } from '@pirate/run-core/run/battle';
import { runStore } from '../run/runStore';
import { GameScreen } from './GameScreen';
import { matchConfigFromSearch } from './matchFromUrl';
import {
  offlineConfig,
  startOfflineMatch,
  type OfflineMatch,
  type OfflineShips,
} from './offlineMatch';
import { onlineSession, useOnlineSession } from './onlineSession';
import { LobbyScreen } from '../ui/menu/LobbyScreen';
import { KitBoard } from '../kit/KitBoard';
import { MainMenu } from '../ui/menu/MainMenu';

/** `?ais=3` and friends start an offline match straight away (handy for testing). */
function offlineFromUrl(): OfflineMatch | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('ais') && !params.has('humans') && !params.has('hunt')) {
    return null;
  }
  return startOfflineMatch(matchConfigFromSearch(window.location.search));
}

/** `?room=ABCDE` is a link to a room: it fills in the join box. */
function roomFromUrl(): string {
  return new URLSearchParams(window.location.search).get('room') ?? '';
}

/**
 * Decides which screen to show: the menu, an online room's lobby, or a match
 * (offline in this page, or online on the server).
 */
export default function App() {
  const session = useOnlineSession();
  const showKit = import.meta.env.DEV && new URLSearchParams(window.location.search).has('kit');
  const [offline, setOffline] = useState<OfflineMatch | null>(offlineFromUrl);
  const offlineRef = useRef<OfflineMatch | null>(offline);
  offlineRef.current = offline;
  // The battle of the solo voyage that is being fought, if any.
  const [runBattle, setRunBattle] = useState<OfflineMatch | null>(null);
  const runBattleRef = useRef<OfflineMatch | null>(null);
  runBattleRef.current = runBattle;
  // After a voyage battle the menu opens on the voyage again, not the home screen.
  const [menuStart, setMenuStart] = useState<'home' | 'voyage'>('home');
  // It is used once, when the menu opens, so the next visit starts at home again.
  useEffect(() => {
    if (menuStart === 'voyage') {
      setMenuStart('home');
    }
  }, [menuStart]);

  // Pick the remembered seat back up after a refresh.
  useEffect(() => {
    void onlineSession?.resume();
  }, []);

  // Stop the in-page host if the page goes away.
  useEffect(() => () => offlineRef.current?.dispose(), []);
  useEffect(() => () => runBattleRef.current?.dispose(), []);

  const startRunBattle = useCallback((setup: BattleSetup) => {
    // From here the fight is saved as begun: leaving the page now loses it.
    if (!runStore.getState().apply({ type: 'startBattle' })) {
      return;
    }
    setRunBattle(startOfflineMatch(setup.config));
  }, []);

  /** The match has ended: the voyage takes its result at once (a missing one counts as a loss). */
  const reportRunBattle = useCallback((result: MatchResult | null) => {
    runStore.getState().apply(result ? { type: 'finishBattle', result } : { type: 'loseBattle' });
  }, []);

  /** Back to the voyage. Leaving a fight that is still on (after being sunk) loses it. */
  const leaveRunBattle = useCallback(() => {
    if (runStore.getState().run?.phase === 'battle') {
      runStore.getState().apply({ type: 'loseBattle' });
    }
    runBattleRef.current?.dispose();
    setRunBattle(null);
    setMenuStart('voyage');
  }, []);

  const playOffline = useCallback(
    (
      opponents: number,
      name: string,
      difficulty: AiDifficulty,
      mapStyle: MapStyle,
      loot: boolean,
      ships: OfflineShips,
      objective: ObjectiveChoice,
      monsters: readonly MonsterTypeId[],
      monsterWarnings: boolean,
    ) => {
      setOffline(
        startOfflineMatch(offlineConfig(
          opponents,
          name,
          difficulty,
          mapStyle,
          undefined,
          ships,
          loot,
          objectiveFor(objective),
          monsters,
          monsterWarnings,
        )),
      );
    },
    [],
  );

  const exitOffline = useCallback(() => {
    offlineRef.current?.dispose();
    setOffline(null);
    // Drop the match parameters so a refresh lands on the menu.
    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  if (showKit) {
    return <KitBoard />;
  }

  if (runBattle) {
    return (
      <GameScreen
        key="run-battle"
        client={runBattle.client}
        canRestart={false}
        // Leaving a fight after being sunk loses the voyage.
        onExit={leaveRunBattle}
        runBattle={{ onResult: reportRunBattle, onContinue: leaveRunBattle }}
      />
    );
  }

  if (offline) {
    return (
      <GameScreen
        key="offline"
        client={offline.client}
        canRestart
        onExit={exitOffline}
      />
    );
  }

  if (session.phase === 'playing' && session.client) {
    return (
      <GameScreen
        key="online"
        client={session.client}
        canRestart={false}
        onExit={() => onlineSession?.leave()}
        disconnected={session.connection !== 'connected'}
        notice={session.notice}
      />
    );
  }

  if (session.phase === 'lobby' && session.lobby) {
    return <LobbyScreen lobby={session.lobby} />;
  }

  return (
    <MainMenu
      initialRoomCode={roomFromUrl()}
      initialScreen={menuStart}
      onStartRunBattle={startRunBattle}
      onPlayOffline={playOffline}
    />
  );
}
