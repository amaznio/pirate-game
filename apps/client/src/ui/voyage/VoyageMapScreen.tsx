import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Banner } from '@/kit/Banner';
import { MapNode, type MapNodeState } from '@/kit/MapNode';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { graphFor } from '@pirate/run-core/run/battle';
import { availableMoves, legCost } from '@pirate/run-core/run/engine';
import { nodesInLayer } from '@pirate/run-core/graph/query';
import type { RunState } from '@pirate/run-core/run/types';
import { runStore, useRun } from '../../run/runStore';
import { AbandonButton, EventBanners, VoyageStats } from './VoyageParts';
import { kindLabel, mapKindOf, nodeBlurb, nodeTitle, stateLabel } from './voyageText';

/** The route through this area: pick the next stop from the ones in reach. */
export function VoyageMapScreen({ run, onBack }: { run: RunState; onBack: () => void }) {
  const { t } = useTranslation();
  const events = useRun((state) => state.events);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const graph = graphFor(run);
  const moves = availableMoves(run);
  const moveIds = new Set(moves.map((node) => node.id));
  const selected = moves.find((node) => node.id === selectedId) ?? null;

  // Bring the ship's stop into view when the map opens or the ship moves.
  useEffect(() => {
    listRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'center' });
  }, [run.nodeId]);

  const stateOf = (id: string): MapNodeState =>
    id === run.nodeId ? 'current' : run.path.includes(id) ? 'cleared' : moveIds.has(id) ? 'available' : 'locked';

  const cost = selected ? legCost(run, selected.id) : null;
  const short = cost !== null && run.supplies < cost;

  return (
    <ScreenFrame title={t('menu.voyage')} onBack={onBack} actions={<AbandonButton />} wide={false}>
      <VoyageStats run={run} />
      <EventBanners events={events} />
      <Banner tone="objective">{t('voyage.chooseNext')}</Banner>

      <div ref={listRef} role="list" aria-label={t('menu.voyage')} className="flex flex-col items-stretch pb-6">
        {Array.from({ length: graph.layers }, (_, layer) => nodesInLayer(graph, layer)).map((row, index) => (
          <Fragment key={row[0]?.id}>
            {index > 0 && <div className="mx-auto h-4 w-0.5 bg-border" aria-hidden />}
            <div className={row.length > 1 ? 'grid grid-cols-2 gap-3 sm:grid-cols-3' : 'mx-auto w-full max-w-xs'}>
              {row.map((node) => {
                const state = stateOf(node.id);
                const kind = mapKindOf(node);
                return (
                  <MapNode
                    key={node.id}
                    kind={kind}
                    state={state}
                    title={nodeTitle(t, node)}
                    detail={`${kindLabel(t, kind)} · ${stateLabel(t, state)}`}
                    stateLabel={stateLabel(t, state)}
                    onSelect={state === 'available' ? () => setSelectedId(node.id) : undefined}
                  />
                );
              })}
            </div>
          </Fragment>
        ))}
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-head text-2xl font-bold">{nodeTitle(t, selected)}</DialogTitle>
                <DialogDescription className="text-base">{nodeBlurb(t, selected)}</DialogDescription>
              </DialogHeader>
              <p className="text-sm font-bold">{t('voyage.legCost', { count: cost ?? 0 })}</p>
              {short && <Banner tone="warning">{t('voyage.willStarve')}</Banner>}
              <DialogFooter className="gap-2 sm:flex-col-reverse">
                <DialogClose asChild>
                  <Button variant="secondary">{t('voyage.cancel')}</Button>
                </DialogClose>
                <Button
                  size="lg"
                  onClick={() => {
                    setSelectedId(null);
                    runStore.getState().apply({ type: 'travel', to: selected.id });
                  }}
                >
                  {t('voyage.sailHere')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ScreenFrame>
  );
}
