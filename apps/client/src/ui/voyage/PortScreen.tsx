import { Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardTitle } from '@/kit/Field';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { Banner } from '@/kit/Banner';
import { graphFor } from '@pirate/run-core/run/battle';
import { nodeById } from '@pirate/run-core/graph/query';
import { UPGRADE_PRICE } from '@pirate/run-core/run/rules';
import type { RunState, UpgradeId } from '@pirate/run-core/run/types';
import { canTake } from '@pirate/run-core/run/upgrades';
import { runStore, useRun } from '../../run/runStore';
import { AbandonButton, EventBanners, VoyageStats } from './VoyageParts';
import { eventMessages, upgradeBlurb, upgradeName } from './voyageText';

/** A port: what it did for the ship on arrival, then a shop where plunder buys upgrades. */
export function PortScreen({ run, onBack }: { run: RunState; onBack: () => void }) {
  const { t } = useTranslation();
  const events = useRun((state) => state.events);
  const node = nodeById(graphFor(run), run.nodeId);
  const arrival = events.find((event) => event.type === 'portArrival');
  // What is still for sale and of use to the ship as it is now (a bought hull upgrade can make another useless).
  const stock = (run.offer ?? []).filter((id) => canTake(run, id));

  // The area-cleared news, a refit and what was just bought come first.
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
          {arrival.ammoGained > 0 && <Banner tone="info">{t('voyage.reloaded', { count: arrival.ammoGained })}</Banner>}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <CardTitle>{t('voyage.shopTitle')}</CardTitle>
        {stock.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('voyage.soldOut')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {stock.map((id: UpgradeId) => {
              const price = UPGRADE_PRICE[id];
              const affordable = run.plunder >= price;
              return (
                <li key={id} className="flex items-center gap-3 rounded-card border border-border bg-card p-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-bold">{upgradeName(t, id)}</span>
                    <span className="text-sm text-muted-foreground">{upgradeBlurb(t, id)}</span>
                  </div>
                  <Badge variant="secondary" className="gap-1 text-sm" aria-label={t('voyage.priceLabel', { price })}>
                    <Coins aria-hidden />
                    {price}
                  </Badge>
                  <Button
                    disabled={!affordable}
                    title={affordable ? undefined : t('voyage.notEnough')}
                    onClick={() => runStore.getState().apply({ type: 'buyUpgrade', upgrade: id })}
                  >
                    {t('voyage.buy')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Button size="lg" onClick={() => runStore.getState().apply({ type: 'leavePort' })}>
        {t('voyage.sailOn')}
      </Button>
    </ScreenFrame>
  );
}
