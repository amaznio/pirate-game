import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CardTitle } from '@/kit/Field';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { buildBattle, type BattleSetup } from '@pirate/run-core/run/battle';
import type { RunState } from '@pirate/run-core/run/types';
import { aiLevelLabel } from '../menu/aiLevels';
import { mapStyleLabel } from '../menu/mapStyles';
import { objectiveBlurb, objectiveLabel } from '../menu/objectiveChoices';
import { shipLabel } from '../menu/shipClasses';
import { AbandonButton, VoyageStats } from './VoyageParts';

/** "2 × Brigantine, 1 × Galleon": a fleet as the player reads it. */
function fleetText(t: Parameters<typeof shipLabel>[0], shipTypeIds: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const id of shipTypeIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([id, count]) => `${count} × ${shipLabel(t, id)}`).join(', ');
}

/** The fight at this stop: who is in it and what it asks, then sail into it. */
export function BattleBriefingScreen({
  run,
  onBack,
  onSail,
}: {
  run: RunState;
  onBack: () => void;
  onSail: (setup: BattleSetup) => void;
}) {
  const { t } = useTranslation();
  const setup = buildBattle(run);
  const { briefing, kind } = setup;
  const boss = kind === 'boss';
  const hunt = kind === 'hunt';

  return (
    <ScreenFrame
      title={t('voyage.briefingTitle')}
      onBack={onBack}
      actions={<AbandonButton />}
      wide={false}
      footer={
        <Button size="lg" className="w-full" onClick={() => onSail(setup)}>
          {t('menu.setSail')}
        </Button>
      }
    >
      <VoyageStats run={run} />
      <Card>
        <CardTitle>{boss ? t('voyage.bossBattle') : hunt ? t('voyage.kindHunt') : t('voyage.kindBattle')}</CardTitle>
        <p className="font-head text-2xl font-bold">
          {boss ? t('voyage.boss') : hunt ? t('menu.huntTitle') : objectiveLabel(t, kind)}
        </p>
        <p className="text-sm text-muted-foreground">
          {boss ? t('voyage.bossBlurb') : hunt ? t('voyage.huntBriefing') : objectiveBlurb(t, kind)}
        </p>
      </Card>
      <Card>
        <dl className="flex flex-col gap-3 text-base">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t('voyage.youSail')}</dt>
            <dd className="font-bold">
              {shipLabel(t, briefing.heroShipTypeId)} · {t('voyage.cannonsSide', { count: run.cannonsPerSide })}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t('voyage.against')}</dt>
            <dd className="font-bold">
              {hunt ? t('voyage.huntAgainst') : fleetText(t, briefing.enemyShipTypeIds)}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {!hunt && (
            <Badge variant="secondary">
              {t('menu.skill')}: {aiLevelLabel(t, briefing.aiDifficulty)}
            </Badge>
          )}
          <Badge variant="secondary">
            {t('menu.seas')}: {mapStyleLabel(t, briefing.sea)}
          </Badge>
        </div>
      </Card>
    </ScreenFrame>
  );
}
