import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { classForHullLevel } from '@pirate/run-core/run/rules';
import type { RunState } from '@pirate/run-core/run/types';
import { runStore } from '../../run/runStore';
import { shipLabel } from '../menu/shipClasses';
import { defeatText } from './voyageText';

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col rounded-btn bg-background/40 px-3 py-2">
      <dd className="font-head text-2xl font-bold tabular-nums">{value}</dd>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
    </div>
  );
}

/** The voyage is over: how it ended and what it came to. */
export function VoyageEndScreen({ run, onMenu }: { run: RunState; onMenu: () => void }) {
  const { t } = useTranslation();
  const won = run.phase === 'victory';
  return (
    <ScreenFrame
      title={won ? t('voyage.victoryTitle') : t('voyage.defeatTitle')}
      wide={false}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={() => { runStore.getState().discard(); onMenu(); }}>
            {t('voyage.mainMenu')}
          </Button>
          <Button size="lg" className="flex-1" onClick={() => runStore.getState().start()}>
            {t('voyage.new')}
          </Button>
        </>
      }
    >
      <p className="text-base text-muted-foreground">
        {won ? t('voyage.victoryBody') : defeatText(t, run.defeatReason ?? 'sunk')}
      </p>
      <Card>
        <dl className="grid grid-cols-2 gap-2">
          <Stat value={run.battlesWon} label={t('voyage.statBattles')} />
          <Stat value={run.legs} label={t('voyage.statLegs')} />
          <Stat value={run.upgrades.length} label={t('voyage.statUpgrades')} />
          <Stat value={`${run.areaIndex + 1}/${run.areaCount}`} label={t('voyage.statArea')} />
          <Stat value={shipLabel(t, classForHullLevel(run.hullLevel).id)} label={t('voyage.statShip')} />
        </dl>
      </Card>
    </ScreenFrame>
  );
}
