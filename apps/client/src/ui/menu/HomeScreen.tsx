import { Anchor, Compass, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { Tile } from '@/kit/Tile';
import { LanguageSwitcher } from './LanguageSwitcher';

interface HomeScreenProps {
  name: string;
  onNameChange: (name: string) => void;
  onQuickBattle: () => void;
  onFriends: () => void;
}

/** The hub: three tiles, with the main action (Quick battle) last and largest. */
export function HomeScreen({ name, onNameChange, onQuickBattle, onFriends }: HomeScreenProps) {
  const { t } = useTranslation();
  return (
    <ScreenFrame
      title={t('app.title')}
      actions={
        <>
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            maxLength={20}
            placeholder={t('menu.namePlaceholder')}
            aria-label={t('menu.yourName')}
            className="min-h-11 w-40 rounded-btn border-2 border-border bg-secondary/40 px-3 text-base font-bold text-foreground outline-none placeholder:font-semibold placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
          />
          <LanguageSwitcher />
        </>
      }
    >
      <p className="font-head text-4xl font-bold leading-tight md:text-5xl">{t('app.tagline')}</p>
      <div className="grid gap-4 md:grid-cols-3">
        <Tile
          icon={<Compass />}
          title={t('menu.voyage')}
          blurb={t('menu.voyageBlurb')}
          badge={t('menu.comingSoon')}
        />
        <Tile
          icon={<Users />}
          title={t('menu.playFriends')}
          blurb={t('menu.friendsBlurb')}
          cta={t('menu.openLobby')}
          onClick={onFriends}
        />
        <Tile
          primary
          icon={<Anchor />}
          title={t('menu.quickTitle')}
          blurb={t('menu.quickBlurb')}
          cta={t('menu.chooseScenario')}
          onClick={onQuickBattle}
          className="md:min-h-64"
        />
      </div>
    </ScreenFrame>
  );
}
