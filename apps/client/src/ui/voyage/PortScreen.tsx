import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ChoiceGroup, ChoiceRow } from '@/kit/ChoiceRow';
import { CardTitle } from '@/kit/Field';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { Banner } from '@/kit/Banner';
import { graphFor } from '@pirate/run-core/run/battle';
import { nodeById } from '@pirate/run-core/graph/query';
import type { RunState, UpgradeId } from '@pirate/run-core/run/types';
import { runStore, useRun } from '../../run/runStore';
import { AbandonButton, EventBanners, VoyageStats } from './VoyageParts';
import { eventMessages, upgradeBlurb, upgradeName } from './voyageText';

/** A port: what it did for the ship on arrival, then one upgrade to take. */
export function PortScreen({ run, onBack }: { run: RunState; onBack: () => void }) {
  const { t } = useTranslation();
  const events = useRun((state) => state.events);
  const [chosen, setChosen] = useState<string>('');
  const node = nodeById(graphFor(run), run.nodeId);
  const arrival = events.find((event) => event.type === 'portArrival');
  const offer = run.offer ?? [];

  // The area-cleared news and any refit or hold warning come first.
  const news = events.filter((event) => event.type !== 'portArrival');
  const hasNews = eventMessages(t, news).length > 0;

  return (
    <ScreenFrame
      title={node.landfall ? t('voyage.landfall') : t('voyage.port')}
      onBack={onBack}
      actions={<AbandonButton />}
      wide={false}
    >
      <VoyageStats run={run} />
      {hasNews && <EventBanners events={news} />}
      {arrival && arrival.type === 'portArrival' && (
        <div className="flex flex-col gap-2">
          {arrival.repaired > 0 && <Banner tone="info">{t('voyage.repaired', { count: arrival.repaired })}</Banner>}
          {arrival.suppliesGained > 0 && (
            <Banner tone="info">{t('voyage.restocked', { count: arrival.suppliesGained })}</Banner>
          )}
          {arrival.ammoGained > 0 && <Banner tone="info">{t('voyage.reloaded', { count: arrival.ammoGained })}</Banner>}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <CardTitle>{t('voyage.chooseUpgrade')}</CardTitle>
        <ChoiceGroup value={chosen} onChange={setChosen} label={t('voyage.chooseUpgrade')}>
          {offer.map((id: UpgradeId) => (
            <ChoiceRow key={id} value={id} title={upgradeName(t, id)} rule={upgradeBlurb(t, id)} showRule />
          ))}
        </ChoiceGroup>
      </section>

      <Button
        size="lg"
        disabled={chosen === ''}
        onClick={() => runStore.getState().apply({ type: 'chooseUpgrade', upgrade: chosen as UpgradeId })}
      >
        {t('voyage.takeUpgrade')}
      </Button>
    </ScreenFrame>
  );
}
