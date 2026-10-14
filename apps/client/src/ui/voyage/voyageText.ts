import type { TFunction } from 'i18next';
import type { MapNodeKind, MapNodeState } from '@/kit/MapNode';
import type { RouteNode } from '@pirate/run-core/graph/types';
import type { DefeatReason, RunEvent, UpgradeId } from '@pirate/run-core/run/types';
import { objectiveBlurb, objectiveLabel } from '../menu/objectiveChoices';
import { shipLabel } from '../menu/shipClasses';

/** Typed keys for each upgrade's words, so a wrong key is a compile error. */
const UPGRADE_KEYS = {
  reinforceHull: { name: 'voyage.upgrades.reinforceHull.name', blurb: 'voyage.upgrades.reinforceHull.blurb' },
  addCannon: { name: 'voyage.upgrades.addCannon.name', blurb: 'voyage.upgrades.addCannon.blurb' },
  cannonDamage: { name: 'voyage.upgrades.cannonDamage.name', blurb: 'voyage.upgrades.cannonDamage.blurb' },
  cannonballs: { name: 'voyage.upgrades.cannonballs.name', blurb: 'voyage.upgrades.cannonballs.blurb' },
  repair: { name: 'voyage.upgrades.repair.name', blurb: 'voyage.upgrades.repair.blurb' },
  provisions: { name: 'voyage.upgrades.provisions.name', blurb: 'voyage.upgrades.provisions.blurb' },
} as const satisfies Record<UpgradeId, { name: string; blurb: string }>;

export function upgradeName(t: TFunction, id: UpgradeId): string {
  return t(UPGRADE_KEYS[id].name);
}

export function upgradeBlurb(t: TFunction, id: UpgradeId): string {
  return t(UPGRADE_KEYS[id].blurb);
}

const DEFEAT_KEYS = {
  sunk: 'voyage.defeatReason.sunk',
  starved: 'voyage.defeatReason.starved',
  abandoned: 'voyage.defeatReason.abandoned',
} as const satisfies Record<DefeatReason, string>;

export function defeatText(t: TFunction, reason: DefeatReason): string {
  return t(DEFEAT_KEYS[reason]);
}

/** What a stop on the map is called. */
export function nodeTitle(t: TFunction, node: RouteNode): string {
  if (node.kind === 'boss') {
    return t('voyage.boss');
  }
  if (node.kind === 'port') {
    return node.landfall ? t('voyage.landfall') : t('voyage.port');
  }
  return objectiveLabel(t, node.battle ?? 'standard');
}

/** The icon kind of a stop. */
export function mapKindOf(node: RouteNode): MapNodeKind {
  return node.kind === 'port' && node.landfall ? 'start' : node.kind;
}

export function kindLabel(t: TFunction, kind: MapNodeKind): string {
  switch (kind) {
    case 'start':
      return t('voyage.kindStart');
    case 'battle':
      return t('voyage.kindBattle');
    case 'port':
      return t('voyage.kindPort');
    case 'boss':
      return t('voyage.kindBoss');
  }
}

export function stateLabel(t: TFunction, state: MapNodeState): string {
  switch (state) {
    case 'cleared':
      return t('voyage.cleared');
    case 'current':
      return t('voyage.here');
    case 'locked':
      return t('voyage.locked');
    case 'available':
      return t('voyage.notTaken');
  }
}

/** One line about what a stop holds, for the card shown before sailing there. */
export function nodeBlurb(t: TFunction, node: RouteNode): string {
  if (node.kind === 'boss') {
    return t('voyage.bossBlurb');
  }
  if (node.kind === 'port') {
    return t('voyage.chooseUpgrade');
  }
  return objectiveBlurb(t, node.battle ?? 'standard');
}

export interface EventMessage {
  readonly tone: 'info' | 'warning';
  readonly text: string;
}

/** What happened in the last step, as short messages for the player. */
export function eventMessages(t: TFunction, events: readonly RunEvent[]): EventMessage[] {
  const messages: EventMessage[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'starved':
        messages.push({ tone: 'warning', text: t('voyage.eventStarved', { count: event.hullLost }) });
        break;
      case 'battleWon':
        messages.push({ tone: 'info', text: t('voyage.eventBattleWon', { count: event.suppliesGained }) });
        break;
      case 'areaCleared':
        messages.push({ tone: 'info', text: t('voyage.eventAreaCleared', { n: event.areaIndex + 1 }) });
        break;
      case 'upgraded':
        messages.push({ tone: 'info', text: t('voyage.eventUpgraded', { name: upgradeName(t, event.upgrade) }) });
        if (event.refit) {
          messages.push({
            tone: 'info',
            text: t('voyage.eventRefit', {
              from: shipLabel(t, event.refit.from),
              to: shipLabel(t, event.refit.to),
            }),
          });
        }
        break;
      default:
        break;
    }
  }
  return messages;
}
