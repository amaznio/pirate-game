import { useState } from 'react';
import type { AiDifficulty } from '@pirate/game-core/domain/GameState';
import type { MapStyle } from '@pirate/game-core/board/generateBoard';
import type { OfflineShips } from '../../app/offlineMatch';
import { FriendsScreen } from './FriendsScreen';
import { HomeScreen } from './HomeScreen';
import { ModeSelectScreen } from './ModeSelectScreen';
import type { ObjectiveChoice } from './objectiveChoices';
import { QuickBattleScreen } from './QuickBattleScreen';
import { useStoredName } from './useStoredName';

interface MainMenuProps {
  /** A room code from the page link (?room=ABCDE), to prefill the join box. */
  initialRoomCode?: string;
  onPlayOffline: (
    opponents: number,
    name: string,
    difficulty: AiDifficulty,
    mapStyle: MapStyle,
    loot: boolean,
    ships: OfflineShips,
    objective: ObjectiveChoice,
  ) => void;
}

type Screen = 'home' | 'modes' | 'quick' | 'friends';

/** The screens before a match: Home, Choose a mode, then the mode's own settings. */
export function MainMenu({ initialRoomCode = '', onPlayOffline }: MainMenuProps) {
  const [name, setName] = useStoredName();
  // A link to a room goes straight to the join screen.
  const [screen, setScreen] = useState<Screen>(initialRoomCode ? 'friends' : 'home');
  const goModes = () => setScreen('modes');

  if (screen === 'quick') {
    return (
      <QuickBattleScreen
        onBack={goModes}
        onPlay={(s) =>
          onPlayOffline(
            s.opponents,
            name.trim(),
            s.difficulty,
            s.mapStyle,
            s.loot,
            s.ships,
            s.objective,
          )
        }
      />
    );
  }

  if (screen === 'friends') {
    return (
      <FriendsScreen
        name={name}
        onNameChange={setName}
        onBack={goModes}
        initialRoomCode={initialRoomCode}
      />
    );
  }

  if (screen === 'modes') {
    return (
      <ModeSelectScreen
        onBack={() => setScreen('home')}
        onQuickBattle={() => setScreen('quick')}
        onFriends={() => setScreen('friends')}
      />
    );
  }

  return <HomeScreen onPlay={goModes} />;
}
