import type { MonsterTypeId } from '@pirate/game-core/domain/Monster';
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
import type { BattleSetup } from '@pirate/run-core/run/battle';
import { VoyageFlow } from '../voyage/VoyageFlow';

interface MainMenuProps {
  /** A room code from the page link (?room=ABCDE), to prefill the join box. */
  initialRoomCode?: string;
  /** Which screen to open on: the voyage, when coming back from one of its battles. */
  initialScreen?: 'home' | 'voyage';
  /** Starts the battle of the solo voyage's current stop. */
  onStartRunBattle: (setup: BattleSetup) => void;
  onPlayOffline: (
    opponents: number,
    name: string,
    difficulty: AiDifficulty,
    mapStyle: MapStyle,
    loot: boolean,
    ships: OfflineShips,
    objective: ObjectiveChoice,
    monsters: readonly MonsterTypeId[],
    monsterWarnings: boolean,
  ) => void;
}

type Screen = 'home' | 'modes' | 'quick' | 'friends' | 'voyage';

/** The screens before a match: Home, Choose a mode, then the mode's own settings. */
export function MainMenu({
  initialRoomCode = '',
  initialScreen = 'home',
  onStartRunBattle,
  onPlayOffline,
}: MainMenuProps) {
  const [name, setName] = useStoredName();
  // A link to a room goes straight to the join screen.
  const [screen, setScreen] = useState<Screen>(initialRoomCode ? 'friends' : initialScreen);
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
            s.monsters,
            s.monsterWarnings,
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

  if (screen === 'voyage') {
    return <VoyageFlow onBack={goModes} onSail={onStartRunBattle} />;
  }

  if (screen === 'modes') {
    return (
      <ModeSelectScreen
        onBack={() => setScreen('home')}
        onQuickBattle={() => setScreen('quick')}
        onFriends={() => setScreen('friends')}
        onVoyage={() => setScreen('voyage')}
      />
    );
  }

  return <HomeScreen onPlay={goModes} />;
}
