import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiDifficulty } from '@pirate/game-core/domain/GameState';
import type { MapStyle } from '@pirate/game-core/board/generateBoard';
import { DEFAULT_SHIP_TYPE_ID } from '@pirate/game-core/config/shipTypes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { ChoiceGroup, ChoiceRow } from '@/kit/ChoiceRow';
import { CardTitle, Field } from '@/kit/Field';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { Segmented } from '@/kit/Segmented';
import { Stepper } from '@/kit/Stepper';
import type { OfflineShips } from '../../app/offlineMatch';
import { useIsDesktop } from '../useIsDesktop';
import { AI_LEVELS, aiLevelBlurb, aiLevelLabel } from './aiLevels';
import { MAP_STYLE_CHOICES, mapStyleBlurb, mapStyleLabel } from './mapStyles';
import {
  OBJECTIVE_CHOICES,
  objectiveBlurb,
  objectiveLabel,
  type ObjectiveChoice,
} from './objectiveChoices';
import { SHIP_CHOICES, shipBlurb, shipLabel } from './shipClasses';
import { useStoredDifficulty } from './useStoredDifficulty';
import { useStoredMapStyle } from './useStoredMapStyle';

export interface QuickBattleSettings {
  opponents: number;
  difficulty: AiDifficulty;
  mapStyle: MapStyle;
  loot: boolean;
  ships: OfflineShips;
  objective: ObjectiveChoice;
}

interface QuickBattleScreenProps {
  onBack: () => void;
  onPlay: (settings: QuickBattleSettings) => void;
}

/** Pick a scenario, tune it under Advanced, and set sail against the computer. */
export function QuickBattleScreen({ onBack, onPlay }: QuickBattleScreenProps) {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const [opponents, setOpponents] = useState(1);
  const [difficulty, setDifficulty] = useStoredDifficulty();
  const [mapStyle, setMapStyle] = useStoredMapStyle();
  const [loot, setLoot] = useState(false);
  const [objective, setObjective] = useState<ObjectiveChoice>('standard');
  const [yourShip, setYourShip] = useState(DEFAULT_SHIP_TYPE_ID);
  const [theirShip, setTheirShip] = useState(DEFAULT_SHIP_TYPE_ID);
  // Open on a wide screen, folded away on a phone.
  const [advancedOpen, setAdvancedOpen] = useState(desktop);

  const setSail = () =>
    onPlay({
      opponents,
      difficulty,
      mapStyle,
      loot,
      ships: { yours: yourShip, theirs: theirShip },
      objective,
    });

  return (
    <ScreenFrame
      title={t('menu.quickTitle')}
      onBack={onBack}
      footer={
        <Button size="lg" className="w-full" onClick={setSail}>
          {t('menu.setSail')}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
        <section className="flex flex-col gap-3">
          <CardTitle>{t('menu.objective')}</CardTitle>
          <ChoiceGroup value={objective} onChange={setObjective} label={t('menu.objective')}>
            {OBJECTIVE_CHOICES.map((choice) => (
              <ChoiceRow
                key={choice}
                value={choice}
                title={objectiveLabel(t, choice)}
                rule={objectiveBlurb(t, choice)}
              />
            ))}
          </ChoiceGroup>
        </section>

        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          <Card>
            <CardTitle>{t('menu.yourBattle')}</CardTitle>
            <p className="font-head text-2xl font-bold">{objectiveLabel(t, objective)}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{t('menu.opponentsCount', { count: opponents })}</Badge>
              <Badge variant="secondary">
                {t('menu.skill')}: {aiLevelLabel(t, difficulty)}
              </Badge>
              <Badge variant="secondary">
                {t('menu.seas')}: {mapStyleLabel(t, mapStyle)}
              </Badge>
              <Badge variant="secondary">
                {t('common.loot')}: {loot ? t('common.lootOn') : t('common.lootOff')}
              </Badge>
              <Badge variant="secondary">
                {t('menu.yourShip')}: {shipLabel(t, yourShip)}
              </Badge>
              <Badge variant="secondary">
                {t('menu.theirShips')}: {shipLabel(t, theirShip)}
              </Badge>
            </div>
          </Card>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <Card className="gap-0 p-0">
              <CollapsibleTrigger className="flex min-h-14 w-full items-center justify-between rounded-card px-4 text-left text-base font-bold outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
                {t('menu.advanced')}
                <ChevronDown
                  className={`size-5 transition ${advancedOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-5 border-t border-border p-4">
                <Field label={t('menu.skill')} hint={aiLevelBlurb(t, difficulty)}>
                  <Segmented
                    label={t('menu.skill')}
                    value={difficulty}
                    onChange={setDifficulty}
                    choices={AI_LEVELS.map((level) => ({
                      label: aiLevelLabel(t, level),
                      value: level,
                    }))}
                  />
                </Field>
                <Field label={t('menu.seas')} hint={mapStyleBlurb(t, mapStyle)}>
                  <Segmented
                    label={t('menu.seas')}
                    value={mapStyle}
                    onChange={setMapStyle}
                    choices={MAP_STYLE_CHOICES.map((style) => ({
                      label: mapStyleLabel(t, style),
                      value: style,
                    }))}
                  />
                </Field>
                <Field label={t('menu.yourShip')} hint={shipBlurb(t, yourShip)}>
                  <Segmented
                    label={t('menu.yourShip')}
                    value={yourShip}
                    onChange={setYourShip}
                    choices={SHIP_CHOICES.map((id) => ({ label: shipLabel(t, id), value: id }))}
                  />
                </Field>
                <Field label={t('menu.theirShips')} hint={t('common.biggerShipStronger')}>
                  <Segmented
                    label={t('menu.theirShips')}
                    value={theirShip}
                    onChange={setTheirShip}
                    choices={SHIP_CHOICES.map((id) => ({ label: shipLabel(t, id), value: id }))}
                  />
                </Field>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold">{t('menu.opponents')}</span>
                  <Stepper
                    label={t('menu.opponents')}
                    value={opponents}
                    min={1}
                    max={7}
                    onChange={setOpponents}
                  />
                </div>
                <Field label={t('common.loot')} hint={t('common.lootBlurb')}>
                  <Switch
                    checked={loot}
                    onCheckedChange={setLoot}
                    aria-label={t('common.loot')}
                  />
                </Field>
              </CollapsibleContent>
            </Card>
          </Collapsible>

        </div>
      </div>
    </ScreenFrame>
  );
}
