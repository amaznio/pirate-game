import { DoorOpen, Gem, Skull } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MapStyle } from '@pirate/game-core/board/generateBoard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { CardTitle, Field } from '@/kit/Field';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { Segmented } from '@/kit/Segmented';
import { MAP_STYLE_CHOICES, mapStyleBlurb, mapStyleLabel } from './mapStyles';
import { SHIP_CHOICES, shipBlurb, shipLabel } from './shipClasses';
import { useStoredMapStyle } from './useStoredMapStyle';
import { useStoredShip } from './useStoredShip';

export interface HuntSettings {
  mapStyle: MapStyle;
  /** The class of your ship (ids). */
  ship: string;
  /** Whether the cells monsters will strike are shown. */
  monsterWarnings: boolean;
}

interface HuntScreenProps {
  onBack: () => void;
  onPlay: (settings: HuntSettings) => void;
}

function BriefingItem({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-btn bg-background/40 text-primary" aria-hidden>
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="font-head text-lg font-bold">{title}</span>
        <span className="text-sm text-muted-foreground">{text}</span>
      </span>
    </li>
  );
}

/** The Hunt: what it is (the treasure, the exit and the boss), a few settings, and set sail. */
export function HuntScreen({ onBack, onPlay }: HuntScreenProps) {
  const { t } = useTranslation();
  const [mapStyle, setMapStyle] = useStoredMapStyle();
  const [ship, setShip] = useStoredShip();
  const [monsterWarnings, setMonsterWarnings] = useState(false);

  return (
    <ScreenFrame
      title={t('menu.huntTitle')}
      onBack={onBack}
      footer={
        <Button size="lg" className="w-full" onClick={() => onPlay({ mapStyle, ship, monsterWarnings })}>
          {t('menu.setSail')}
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_24rem] lg:items-start lg:gap-x-6">
        <section className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
          <CardTitle>{t('menu.huntBriefing')}</CardTitle>
          <Card className="p-4">
            <ul className="flex flex-col gap-4">
              <BriefingItem icon={<Gem className="size-5" />} title={t('menu.huntTreasureTitle')} text={t('menu.huntTreasure')} />
              <BriefingItem icon={<DoorOpen className="size-5" />} title={t('menu.huntExitTitle')} text={t('menu.huntExit')} />
              <BriefingItem icon={<Skull className="size-5" />} title={t('menu.huntBossTitle')} text={t('menu.huntBoss')} />
            </ul>
          </Card>
        </section>
        <Card className="lg:col-start-2 lg:row-start-1">
          <CardTitle>{t('menu.yourBattle')}</CardTitle>
          <p className="font-head text-2xl font-bold">{t('menu.huntTitle')}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {t('menu.seas')}: {mapStyleLabel(t, mapStyle)}
            </Badge>
            <Badge variant="secondary">
              {t('menu.yourShip')}: {shipLabel(t, ship)}
            </Badge>
          </div>
          <div className="mt-2 flex flex-col gap-5">
            <Field label={t('menu.seas')} hint={mapStyleBlurb(t, mapStyle)}>
              <Segmented
                label={t('menu.seas')}
                value={mapStyle}
                onChange={setMapStyle}
                choices={MAP_STYLE_CHOICES.map((style) => ({ label: mapStyleLabel(t, style), value: style }))}
              />
            </Field>
            <Field label={t('menu.yourShip')} hint={shipBlurb(t, ship)}>
              <Segmented
                label={t('menu.yourShip')}
                value={ship}
                onChange={setShip}
                choices={SHIP_CHOICES.map((id) => ({ label: shipLabel(t, id), value: id }))}
              />
            </Field>
            <Field label={t('common.monsterWarnings')} hint={t('common.monsterWarningsBlurb')}>
              <Switch
                checked={monsterWarnings}
                onCheckedChange={setMonsterWarnings}
                aria-label={t('common.monsterWarnings')}
              />
            </Field>
          </div>
        </Card>
      </div>
    </ScreenFrame>
  );
}
