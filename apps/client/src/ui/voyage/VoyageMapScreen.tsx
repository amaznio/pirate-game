import { LocateFixed, ZoomIn, ZoomOut } from 'lucide-react';
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
import { applyAction, availableMoves } from '@pirate/run-core/run/engine';
import { BATTLE_REWARD, HUNT_BOSS_BONUS, TREASURE_PER_PLUNDER, classForHullLevel } from '@pirate/run-core/run/rules';
import type { RouteNode } from '@pirate/run-core/graph/types';
import type { RunState } from '@pirate/run-core/run/types';
import { runStore, useRun } from '../../run/runStore';
import { AbandonButton, EventBanners, VoyageStats } from './VoyageParts';
import { aiLevelLabel } from '../menu/aiLevels';
import { mapStyleLabel } from '../menu/mapStyles';
import { usePanZoom } from './usePanZoom';
import { fleetText, mapKindOf, nodeBlurb, nodeTitle, stateLabel } from './voyageText';

/** Pixels of map for each layer of the route, and how wide the map is (it is dragged and zoomed inside its viewport). */
const ROW = 132;
const WORLD_W = 480;

/** What a stop pays when it is won, in words; none for a port. */
function rewardText(t: TFunction, node: RouteNode): string | null {
  if (node.kind === 'port') {
    return null;
  }
  if (node.kind === 'hunt') {
    return t('voyage.rewardHunt', { count: BATTLE_REWARD.hunt, per: TREASURE_PER_PLUNDER, boss: HUNT_BOSS_BONUS });
  }
  return t('voyage.reward', { count: BATTLE_REWARD[node.kind === 'boss' ? 'boss' : (node.battle ?? 'standard')] });
}

/** The route through this area, drawn as a map: pick the next stop from the ones in reach. */
export function VoyageMapScreen({ run, onBack }: { run: RunState; onBack: () => void }) {
  const { t } = useTranslation();
  const events = useRun((state) => state.events);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [glide, setGlide] = useState(false);
  const firstCentre = useRef(true);

  const graph = graphFor(run);
  const moves = availableMoves(run);
  const moveIds = new Set(moves.map((node) => node.id));
  const selected = moves.find((node) => node.id === selectedId) ?? null;
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const yOf = (node: RouteNode) => node.layer * ROW + ROW / 2;

  const pan = usePanZoom(viewportRef, { width: WORLD_W, height: graph.layers * ROW });
  const here = byId.get(run.nodeId);

  /** Puts our ship's stop a little above the middle, so the stops ahead show; the map slides there after a leg. */
  const centreOnShip = (slide: boolean) => {
    if (!here) {
      return;
    }
    // Fit the map's width, a little magnified on a wide screen and a little shrunk on a phone.
    const fit = Math.max(0.6, Math.min(1.8, pan.boundsNow().viewW / (WORLD_W + 100)));
    setGlide(slide);
    pan.centreOn(here.x * WORLD_W, yOf(here), fit, 0.5, 0.38);
    if (slide) {
      window.setTimeout(() => setGlide(false), 400);
    }
  };

  // Centre on the ship when the map opens and after each leg.
  useEffect(() => {
    centreOnShip(!firstCentre.current);
    firstCentre.current = false;
    // Only when the ship moves or the map is a different one: not on every drag.
  }, [run.nodeId, graph.layers]);

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
    <ScreenFrame title={t('menu.voyage')} onBack={onBack} actions={<AbandonButton />}>
      <VoyageStats run={run} />
      <EventBanners events={events} />
      <Banner tone="objective">{t('voyage.chooseNext')}</Banner>

      {/* The map is a viewport on a larger world: drag to pan, wheel or pinch or the buttons to zoom. */}
      <div
        ref={viewportRef}
        data-dragging={pan.dragging}
        className="relative h-[max(360px,calc(100dvh-15rem))] cursor-grab touch-none select-none overflow-hidden rounded-card border border-border bg-black/10 data-[dragging=true]:cursor-grabbing"
        onFocusCapture={(event) => pan.reveal(event.target as Element)}
        {...pan.handlers}
      >
        <div
          role="list"
          aria-label={t('menu.voyage')}
          className={`absolute left-0 top-0 origin-top-left ${glide ? 'transition-transform duration-300 ease-out' : ''}`}
          style={{
            width: WORLD_W,
            height: graph.layers * ROW,
            transform: `translate(${pan.view.x}px, ${pan.view.y}px) scale(${pan.view.z})`,
          }}
        >
          <svg aria-hidden className="pointer-events-none absolute inset-0 size-full">
            {legs.map(({ edge, rank }) => {
              const from = byId.get(edge.from)!;
              const to = byId.get(edge.to)!;
              return (
                <line
                  key={`${edge.from}>${edge.to}`}
                  x1={from.x * WORLD_W}
                  y1={yOf(from)}
                  x2={to.x * WORLD_W}
                  y2={yOf(to)}
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
                {...(state === 'current' ? { shipSrc } : {})}
                {...(state === 'available' ? { onSelect: () => setSelectedId(node.id) } : {})}
                style={{ left: node.x * WORLD_W, top: yOf(node) }}
              />
            );
          })}
        </div>

        {/* Pressing these must not start a drag of the map under them. */}
        <div className="absolute right-2 top-2 flex flex-col gap-1.5" onPointerDown={(event) => event.stopPropagation()}>
          <Button size="icon" variant="secondary" aria-label={t('voyage.zoomIn')} title={t('voyage.zoomIn')} onClick={() => pan.zoomBy(1.25)}>
            <ZoomIn aria-hidden />
          </Button>
          <Button size="icon" variant="secondary" aria-label={t('voyage.zoomOut')} title={t('voyage.zoomOut')} onClick={() => pan.zoomBy(0.8)}>
            <ZoomOut aria-hidden />
          </Button>
          <Button size="icon" variant="secondary" aria-label={t('voyage.centreShip')} title={t('voyage.centreShip')} onClick={() => centreOnShip(true)}>
            <LocateFixed aria-hidden />
          </Button>
        </div>
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-head text-2xl font-bold">{nodeTitle(t, selected)}</DialogTitle>
                <DialogDescription className="text-base">{nodeBlurb(t, selected)}</DialogDescription>
              </DialogHeader>
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
