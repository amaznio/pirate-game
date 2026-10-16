import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
import { buildBattle, graphFor } from '@pirate/run-core/run/battle';
import { applyAction, availableMoves, legCost } from '@pirate/run-core/run/engine';
import { BATTLE_REWARD, HUNT_BOSS_BONUS, TREASURE_PER_SUPPLY, classForHullLevel } from '@pirate/run-core/run/rules';
import type { RouteNode } from '@pirate/run-core/graph/types';
import type { RunState } from '@pirate/run-core/run/types';
import { runStore, useRun } from '../../run/runStore';
import { AbandonButton, EventBanners, VoyageStats } from './VoyageParts';
import { aiLevelLabel } from '../menu/aiLevels';
import { mapStyleLabel } from '../menu/mapStyles';
import { fleetText, mapKindOf, nodeBlurb, nodeTitle, stateLabel } from './voyageText';

/** Pixels of map for each layer of the route. */
const ROW = 132;

/** What a stop pays when it is won, in words; none for a port. */
function rewardText(t: TFunction, node: RouteNode): string | null {
  if (node.kind === 'port') {
    return null;
  }
  if (node.kind === 'hunt') {
    return t('voyage.rewardHunt', { count: BATTLE_REWARD.hunt, per: TREASURE_PER_SUPPLY, boss: HUNT_BOSS_BONUS });
  }
  return t('voyage.reward', { count: BATTLE_REWARD[node.kind === 'boss' ? 'boss' : (node.battle ?? 'standard')] });
}

/** The route through this area, drawn as a map: pick the next stop from the ones in reach. */
export function VoyageMapScreen({ run, onBack }: { run: RunState; onBack: () => void }) {
  const { t } = useTranslation();
  const events = useRun((state) => state.events);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const graph = graphFor(run);
  const moves = availableMoves(run);
  const moveIds = new Set(moves.map((node) => node.id));
  const selected = moves.find((node) => node.id === selectedId) ?? null;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const yOf = (node: RouteNode) => node.layer * ROW + ROW / 2;

  // Bring the ship's stop into view when the map opens or the ship moves.
  useEffect(() => {
    mapRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'center' });
  }, [run.nodeId]);

  const stateOf = (id: string): MapNodeState =>
    id === run.nodeId ? 'current' : run.path.includes(id) ? 'cleared' : moveIds.has(id) ? 'available' : 'locked';

  // The legs, with the ones sailed brightest and the ones in reach dashed, drawn from the dimmest up.
  const legs = graph.edges
    .map((edge) => {
      const from = run.path.indexOf(edge.from);
      const sailed = from >= 0 && run.path.indexOf(edge.to) === from + 1;
      const reach = edge.from === run.nodeId && moveIds.has(edge.to);
      return { edge, rank: sailed ? 2 : reach ? 1 : 0 };
    })
    .sort((a, b) => a.rank - b.rank);

  const cost = selected ? legCost(run, selected.id) : null;
  const short = cost !== null && run.supplies < cost;
  const reward = selected ? rewardText(t, selected) : null;
  // Who is in the fight at the chosen stop: the battle it would be, built as if the ship had sailed there.
  const fight = useMemo(() => {
    if (!selected || selected.kind === 'port') {
      return null;
    }
    const arrived = applyAction(run, { type: 'travel', to: selected.id });
    return arrived.ok && arrived.state.phase === 'battle' ? buildBattle(arrived.state) : null;
  }, [run, selected]);
  const shipSrc = `/assets/map/ship-${classForHullLevel(run.hullLevel).id}.png`;

  return (
    <ScreenFrame title={t('menu.voyage')} onBack={onBack} actions={<AbandonButton />} wide={false}>
      <VoyageStats run={run} />
      <EventBanners events={events} />
      <Banner tone="objective">{t('voyage.chooseNext')}</Banner>

      <div
        ref={mapRef}
        role="list"
        aria-label={t('menu.voyage')}
        className="relative mx-auto mb-6 w-full max-w-md"
        style={{ height: graph.layers * ROW }}
      >
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full">
          {legs.map(({ edge, rank }) => {
            const a = byId.get(edge.from)!;
            const b = byId.get(edge.to)!;
            return (
              <line
                key={`${edge.from}>${edge.to}`}
                x1={`${a.x * 100}%`}
                y1={yOf(a)}
                x2={`${b.x * 100}%`}
                y2={yOf(b)}
                strokeLinecap="round"
                strokeWidth={rank === 2 ? 4 : rank === 1 ? 3 : 2}
                strokeDasharray={rank === 1 ? '2 7' : undefined}
                className={rank === 0 ? 'stroke-border' : 'stroke-primary'}
                opacity={rank === 0 ? 0.6 : 1}
              />
            );
          })}
        </svg>
        {graph.nodes.map((node) => {
          const state = stateOf(node.id);
          return (
            <MapNode
              key={node.id}
              kind={mapKindOf(node)}
              state={state}
              label={nodeTitle(t, node)}
              stateLabel={stateLabel(t, state)}
              cost={state === 'available' ? legCost(run, node.id) : null}
              {...(state === 'current' ? { shipSrc } : {})}
              {...(state === 'available' ? { onSelect: () => setSelectedId(node.id) } : {})}
              style={{ left: `${node.x * 100}%`, top: yOf(node) }}
            />
          );
        })}
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
              {reward && <p className="text-sm font-bold">{reward}</p>}
              {fight && (
                <div className="flex flex-col gap-0.5 text-sm">
                  <p className="font-bold">
                    {t('voyage.against')}:{' '}
                    {fight.kind === 'hunt' ? t('voyage.huntAgainst') : fleetText(t, fight.briefing.enemyShipTypeIds)}
                  </p>
                  <p className="text-muted-foreground">
                    {fight.kind !== 'hunt' && `${t('menu.skill')}: ${aiLevelLabel(t, fight.briefing.aiDifficulty)} · `}
                    {t('menu.seas')}: {mapStyleLabel(t, fight.briefing.sea)}
                  </p>
                </div>
              )}
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
