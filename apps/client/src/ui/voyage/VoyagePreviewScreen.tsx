import { Circle, Package, Ship } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Banner } from '@/kit/Banner';
import { CardTitle } from '@/kit/Field';
import { MapNode, type MapNodeKind, type MapNodeState } from '@/kit/MapNode';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { mapStyleLabel } from '../menu/mapStyles';
import { objectiveBlurb, objectiveLabel, type ObjectiveChoice } from '../menu/objectiveChoices';

/**
 * A placeholder for the solo voyage: nine stops on a fixed route, a few
 * numbers, and the next battle. Nothing here is real game state yet; the
 * numbers and the route are illustrative until the voyage is built.
 */
interface PreviewNode {
  id: string;
  kind: MapNodeKind;
  state: MapNodeState;
  /** A battle objective, or a key for a port, the boss or the start. */
  title: ObjectiveChoice | 'homePort' | 'port' | 'boss';
}

/** Each row is one step along the route; a row of two is a choice. */
const ROUTE: readonly (readonly PreviewNode[])[] = [
  [{ id: 'home', kind: 'start', state: 'cleared', title: 'homePort' }],
  [{ id: 'duel', kind: 'battle', state: 'cleared', title: 'standard' }],
  [
    { id: 'salvage', kind: 'battle', state: 'available', title: 'salvage' },
    { id: 'merchant', kind: 'battle', state: 'current', title: 'merchant' },
  ],
  [{ id: 'port-1', kind: 'port', state: 'available', title: 'port' }],
  [
    { id: 'ambush', kind: 'battle', state: 'locked', title: 'ambush' },
    { id: 'survive', kind: 'battle', state: 'locked', title: 'survive' },
  ],
  [{ id: 'port-2', kind: 'port', state: 'locked', title: 'port' }],
  [{ id: 'boss', kind: 'boss', state: 'locked', title: 'boss' }],
];

export function VoyagePreviewScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();

  const nodeTitle = (node: PreviewNode) =>
    node.title === 'homePort'
      ? t('voyage.homePort')
      : node.title === 'port'
        ? t('voyage.port')
        : node.title === 'boss'
          ? t('voyage.boss')
          : objectiveLabel(t, node.title);
  const kindLabel = (kind: MapNodeKind) =>
    kind === 'start'
      ? t('voyage.kindStart')
      : kind === 'battle'
        ? t('voyage.kindBattle')
        : kind === 'port'
          ? t('voyage.kindPort')
          : t('voyage.kindBoss');
  const stateLabel = (state: MapNodeState) =>
    state === 'cleared'
      ? t('voyage.cleared')
      : state === 'current'
        ? t('voyage.here')
        : state === 'locked'
          ? t('voyage.locked')
          : t('voyage.notTaken');

  return (
    <ScreenFrame
      title={t('menu.voyage')}
      onBack={onBack}
      actions={<Badge variant="outline">{t('voyage.preview')}</Badge>}
      footer={
        <Button size="lg" className="w-full" disabled>
          {t('menu.setSail')}
        </Button>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="gap-1.5 text-sm">
          <Package aria-hidden />
          {t('voyage.supplies')}: 12
        </Badge>
        <Badge variant="secondary" className="gap-1.5 text-sm">
          <Ship aria-hidden />
          {t('voyage.hull')}: 5/6
        </Badge>
        <Badge variant="secondary" className="gap-1.5 text-sm">
          <Circle aria-hidden />
          {t('voyage.cannonballs')}: 8
        </Badge>
      </div>

      <Banner tone="info">{t('voyage.previewBanner')}</Banner>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div role="list" aria-label={t('menu.voyage')} className="mx-auto flex w-full max-w-md flex-col items-stretch">
          {ROUTE.map((row, index) => (
            <Fragment key={row[0]?.id}>
              {index > 0 && <div className="mx-auto h-4 w-0.5 bg-border" aria-hidden />}
              <div className={row.length > 1 ? 'grid grid-cols-2 gap-3' : 'mx-auto w-full max-w-xs'}>
                {row.map((node) => (
                  <MapNode
                    key={node.id}
                    kind={node.kind}
                    state={node.state}
                    title={nodeTitle(node)}
                    detail={`${kindLabel(node.kind)} · ${stateLabel(node.state)}`}
                    stateLabel={stateLabel(node.state)}
                  />
                ))}
              </div>
            </Fragment>
          ))}
        </div>

        <Card>
          <CardTitle>{t('voyage.nextBattle')}</CardTitle>
          <p className="font-head text-2xl font-bold">{objectiveLabel(t, 'merchant')}</p>
          <p className="text-sm text-muted-foreground">{objectiveBlurb(t, 'merchant')}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {t('menu.seas')}: {mapStyleLabel(t, 'stormy')}
            </Badge>
            <Badge variant="secondary">
              {t('common.loot')}: {t('common.lootOn')}
            </Badge>
          </div>
        </Card>
      </div>
    </ScreenFrame>
  );
}
