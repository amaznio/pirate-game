import { Anchor, Compass, Skull, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { Tile } from '@/kit/Tile';
import { useRun } from '../../run/runStore';

interface ModeSelectScreenProps {
  onBack: () => void;
  onQuickBattle: () => void;
  onHunt: () => void;
  onFriends: () => void;
  onVoyage: () => void;
}

/** Pick a mode: the main action (Quick battle) comes first and largest, then the Hunt; Voyage last. */
export function ModeSelectScreen({ onBack, onQuickBattle, onHunt, onFriends, onVoyage }: ModeSelectScreenProps) {
  const { t } = useTranslation();
  // A voyage that is still going on can be carried on; a finished one starts over.
  const ongoing = useRun((state) => state.run !== null && state.run.phase !== 'victory' && state.run.phase !== 'defeat');
  return (
    <ScreenFrame title={t('menu.chooseMode')} onBack={onBack}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Tile
          primary
          icon={<Anchor />}
          title={t('menu.quickTitle')}
          blurb={t('menu.quickBlurb')}
          cta={t('menu.chooseScenario')}
          onClick={onQuickBattle}
          className="md:min-h-64"
        />
        <Tile
          icon={<Skull />}
          title={t('menu.huntTitle')}
          blurb={t('menu.huntBlurb')}
          cta={t('menu.huntCta')}
          onClick={onHunt}
        />
        <Tile
          icon={<Users />}
          title={t('menu.playFriends')}
          blurb={t('menu.friendsBlurb')}
          cta={t('menu.openLobby')}
          onClick={onFriends}
        />
        <Tile
          icon={<Compass />}
          title={t('menu.voyage')}
          blurb={t('menu.voyageBlurb')}
          cta={ongoing ? t('voyage.continue') : t('voyage.new')}
          onClick={onVoyage}
        />
      </div>
    </ScreenFrame>
  );
}
