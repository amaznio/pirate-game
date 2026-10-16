import type { TFunction } from 'i18next';
import type { MapNodeKind, MapNodeState } from '@/kit/MapNode';
import type { RouteNode } from '@pirate/run-core/graph/types';
import type { DefeatReason, RunEvent, UpgradeId } from '@pirate/run-core/run/types';
import { objectiveBlurb, objectiveLabel } from '../menu/objectiveChoices';
import { shipLabel } from '../menu/shipClasses';

/** "2 × Brigantine, 1 × Galleon": a fleet as the player reads it. */
export function fleetText(t: TFunction, shipTypeIds: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const id of shipTypeIds) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([id, count]) => `${count} × ${shipLabel(t, id)}`).join(', ');
}

/** Typed keys for each upgrade's words, so a wrong key is a compile error. */
const UPGRADE_KEYS = {
  reinforceHull: { name: 'voyage.upgrades.reinforceHull.name', blurb: 'voyage.upgrades.reinforceHull.blurb' },
  addCannon: { name: 'voyage.upgrades.addCannon.name', blurb: 'voyage.upgrades.addCannon.blurb' },
  cannonDamage: { name: 'voyage.upgrades.cannonDamage.name', blurb: 'voyage.upgrades.cannonDamage.blurb' },
  cannonballs: { name: 'voyage.upgrades.cannonballs.name', blurb: 'voyage.upgrades.cannonballs.blurb' },
  quickLoaders: { name: 'voyage.upgrades.quickLoaders.name', blurb: 'voyage.upgrades.quickLoaders.blurb' },
  repair: { name: 'voyage.upgrades.repair.name', blurb: 'voyage.upgrades.repair.blurb' },
} as const satisfies Record<UpgradeId, { name: string; blurb: string }>;

export function upgradeName(t: TFunction, id: UpgradeId): string {
  return t(UPGRADE_KEYS[id].name);
}

export function upgradeBlurb(t: TFunction, id: UpgradeId): string {
  return t(UPGRADE_KEYS[id].blurb);
}

const DEFEAT_KEYS = {
  sunk: 'voyage.defeatReason.sunk',
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
  if (node.kind === 'hunt') {
    return t('menu.huntTitle');
  }
  return objectiveLabel(t, node.battle ?? 'standard');
}

/** The picture a stop gets: its battle kind for a battle, else what the stop is. */
export function mapKindOf(node: RouteNode): MapNodeKind {
  if (node.kind === 'battle') {
    return node.battle ?? 'standard';
  }
  return node.kind === 'port' && node.landfall ? 'start' : node.kind;
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
    return t('voyage.portBlurb');
  }
  if (node.kind === 'hunt') {
    return t('voyage.huntBlurb');
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
      case 'battleWon':
        messages.push({
          tone: 'info',
          text:
            event.kind === 'hunt'
              ? t('voyage.eventHuntWon', { haul: event.haul ?? 0, count: event.plunderGained })
              : t('voyage.eventBattleWon', { count: event.plunderGained }),
        });
        if (event.bossSlain) {
          messages.push({ tone: 'info', text: t('voyage.eventKrakenSlain') });
        }
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
