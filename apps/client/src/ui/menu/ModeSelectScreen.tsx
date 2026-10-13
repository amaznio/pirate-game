import { Anchor, Compass, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { Tile } from '@/kit/Tile';

interface ModeSelectScreenProps {
  onBack: () => void;
  onQuickBattle: () => void;
  onFriends: () => void;
  onVoyage: () => void;
}

/** Pick a mode: the main action (Quick battle) comes first and largest; Voyage, still a preview, last. */
export function ModeSelectScreen({ onBack, onQuickBattle, onFriends, onVoyage }: ModeSelectScreenProps) {
  const { t } = useTranslation();
  return (
    <ScreenFrame title={t('menu.chooseMode')} onBack={onBack}>
      <div className="grid gap-4 md:grid-cols-3">
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
          badge={t('menu.comingSoon')}
          cta={t('voyage.preview')}
          onClick={onVoyage}
        />
      </div>
    </ScreenFrame>
  );
}
