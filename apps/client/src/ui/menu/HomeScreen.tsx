import { Anchor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from './LanguageSwitcher';

/** The front door: the game's name, one Play button, and the language. */
export function HomeScreen({ onPlay }: { onPlay: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <div className="flex justify-end p-4">
        <LanguageSwitcher />
      </div>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-10 px-6 pb-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <Anchor className="size-12 text-primary" aria-hidden />
          <h1 className="font-head text-5xl leading-tight font-bold tracking-wide md:text-6xl">
            {t('app.title')}
          </h1>
        </div>
        <Button size="lg" className="w-full" onClick={onPlay}>
          {t('menu.play')}
        </Button>
      </div>
    </div>
  );
}
