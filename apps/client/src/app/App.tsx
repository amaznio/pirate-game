import { useCallback, useEffect, useRef, useState } from 'react';
import type { AiDifficulty } from '@pirate/game-core/domain/GameState';
import type { MapStyle } from '@pirate/game-core/board/generateBoard';
import { GameScreen } from './GameScreen';
import { matchConfigFromSearch } from './matchFromUrl';
import {
  offlineConfig,
  startOfflineMatch,
  type OfflineMatch,
} from './offlineMatch';
import { onlineSession, useOnlineSession } from './onlineSession';
import { LobbyScreen } from '../ui/menu/LobbyScreen';
import { MainMenu } from '../ui/menu/MainMenu';

/** `?ais=3` and friends start an offline match straight away (handy for testing). */
function offlineFromUrl(): OfflineMatch | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('ais') && !params.has('humans')) {
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
  const [offline, setOffline] = useState<OfflineMatch | null>(offlineFromUrl);
  const offlineRef = useRef<OfflineMatch | null>(offline);
  offlineRef.current = offline;

  // Pick the remembered seat back up after a refresh.
  useEffect(() => {
    void onlineSession?.resume();
  }, []);

  // Stop the in-page host if the page goes away.
  useEffect(() => () => offlineRef.current?.dispose(), []);

  const playOffline = useCallback(
    (opponents: number, name: string, difficulty: AiDifficulty, mapStyle: MapStyle) => {
      setOffline(startOfflineMatch(offlineConfig(opponents, name, difficulty, mapStyle)));
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

  return <MainMenu initialRoomCode={roomFromUrl()} onPlayOffline={playOffline} />;
}
