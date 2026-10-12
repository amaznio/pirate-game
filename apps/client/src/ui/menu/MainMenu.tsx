import { useState } from 'react';
import type { AiDifficulty } from '@pirate/game-core/domain/GameState';
import type { MapStyle } from '@pirate/game-core/board/generateBoard';
import type { OfflineShips } from '../../app/offlineMatch';
import { FriendsScreen } from './FriendsScreen';
import { HomeScreen } from './HomeScreen';
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

type Screen = 'home' | 'quick' | 'friends';

/** The screens before a match: the home hub, Quick battle, and Play with friends. */
export function MainMenu({ initialRoomCode = '', onPlayOffline }: MainMenuProps) {
  const [name, setName] = useStoredName();
  // A link to a room goes straight to the join screen.
  const [screen, setScreen] = useState<Screen>(initialRoomCode ? 'friends' : 'home');
  const goHome = () => setScreen('home');

  if (screen === 'quick') {
    return (
      <QuickBattleScreen
        onBack={goHome}
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
    return <FriendsScreen name={name} onBack={goHome} initialRoomCode={initialRoomCode} />;
  }

  return (
    <HomeScreen
      name={name}
      onNameChange={setName}
      onQuickBattle={() => setScreen('quick')}
      onFriends={() => setScreen('friends')}
    />
  );
}
