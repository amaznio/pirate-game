import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useGameUIStore } from '../store/useGameUIStore';
import { SeaLegend } from './SeaLegend';

/**
 * An info button that opens what the wind, whirlpools and loot on this board
 * do. It only appears when the board has something to explain, and it keeps the
 * phone planning sheet free of reading material.
 */
export function SeaGuideButton() {
  const { t } = useTranslation();
  const hazards = useGameUIStore((state) => state.hazards);
  const loot = useGameUIStore((state) => state.loot);
  if (!hazards.wind && !hazards.whirlpool && !loot) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          aria-label={t('hud.seaGuide')}
          title={t('hud.seaGuide')}
          className="rounded-full bg-card/90 shadow-lg backdrop-blur hover:bg-card"
        >
          <Info />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-head text-2xl font-bold">{t('hud.seaGuide')}</DialogTitle>
          <DialogDescription className="sr-only">{t('hud.seaGuide')}</DialogDescription>
        </DialogHeader>
        <SeaLegend className="gap-3 text-sm" />
      </DialogContent>
    </Dialog>
  );
}
