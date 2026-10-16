import { useTranslation } from 'react-i18next';
import type { MatchResult } from '@pirate/game-core/domain/MatchResult';
import { useGameUIStore } from '../store/useGameUIStore';
import { PixelHullBar, StatTile } from './ResultParts';

const ICON = {
  turns: '/assets/map/stop-survive.png',
  cannonballs: '/assets/result/icon-cannonballs.png',
  treasure: '/assets/result/icon-treasure.png',
  monsters: '/assets/result/icon-monster.png',
  boss: '/assets/map/stop-boss.png',
  loot: '/assets/map/stop-salvage.png',
  objective: '/assets/map/stop-standard.png',
} as const;

/** A ship class's picture for the list of other ships: sailing to the right, whole or broken in two. */
const shipPicture = (shipTypeId: string, wrecked: boolean): string =>
  `/assets/map/row-${['sloop', 'brigantine', 'galleon'].includes(shipTypeId) ? shipTypeId : 'sloop'}-foe${wrecked ? '-wreck' : ''}.png`;

/** A few numbers about the battle that just ended, under the result title, with a picture for each. */
export function ResultSummaryView({ battle, viewerId }: { battle: MatchResult; viewerId: string }) {
  const { t } = useTranslation();
  const mine = battle.ships.find((ship) => ship.playerId === viewerId);
  const loot = mine ? mine.pickups.barrel + mine.pickups.crate + mine.pickups.plank : 0;
  const others = battle.ships.filter((ship) => ship.playerId !== viewerId);
  const hunt = battle.hunt;
  const left = hunt?.ending === 'left';
  const lost = hunt && !left && (mine?.haul ?? 0) > 0 ? (mine?.haul ?? 0) : 0;

  return (
    <div className="flex flex-col gap-3 text-left">
      <dl className="grid grid-cols-2 gap-2">
        {hunt ? (
          // A hunt has no enemy ships and no "objective met": it is about the treasure, the monsters and the boss.
          <>
            <StatTile icon={ICON.treasure} value={hunt.haul} label={t('result.hunt.treasureBanked')} />
            {lost > 0 && <StatTile icon={ICON.treasure} value={lost} label={t('result.hunt.treasureLost')} />}
            <StatTile icon={ICON.monsters} value={hunt.monstersSunk} label={t('result.hunt.monstersSunk')} />
            <StatTile
              icon={ICON.boss}
              value={hunt.bossSlain ? t('result.hunt.bossSlain') : t('result.hunt.bossAfloat')}
              label={t('result.hunt.boss')}
            />
          </>
        ) : (
          battle.objective && (
            <StatTile
              icon={ICON.objective}
              value={battle.objective.met ? t('result.objectiveMet') : t('result.objectiveMissed')}
              label={t('result.objective')}
            />
          )
        )}
        <StatTile icon={ICON.turns} value={battle.turns} label={t('result.turnsPlayed')} />
        {mine && <StatTile icon={ICON.cannonballs} value={mine.ammo} label={t('result.cannonballsLeft')} />}
        {!hunt && loot > 0 && <StatTile icon={ICON.loot} value={loot} label={t('result.lootTaken')} />}
      </dl>

      {mine && (
        <div className="flex items-center justify-between gap-3 rounded-btn bg-background/40 px-3 py-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-semibold text-muted-foreground">
              {left ? t('result.hunt.hullOnLeaving') : t('result.yourHull')}
            </span>
            <PixelHullBar hp={mine.hull} maxHp={mine.maxHull} />
          </div>
          <span className="font-head text-2xl font-bold tabular-nums">
            {mine.hull}/{mine.maxHull}
          </span>
        </div>
      )}

      {others.length > 0 && (
        <div className="rounded-btn bg-background/40 px-3 py-2 text-sm">
          <div className="mb-1 font-bold text-muted-foreground">{t('result.otherShips')}</div>
          <ul className="flex flex-col gap-1.5">
            {others.map((ship) => (
              <li key={ship.playerId} className="flex items-center gap-3">
                <span className="flex h-12 w-32 shrink-0 items-center justify-start">
                  <img
                    src={shipPicture(ship.shipTypeId, !ship.afloat && !ship.escaped && ship.arrivesOnTurn === undefined)}
                    alt=""
                    className={`[image-rendering:pixelated] ${ship.arrivesOnTurn !== undefined ? 'opacity-50' : ''}`}
                  />
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">{ship.name}</span>
                {ship.afloat ? (
                  <PixelHullBar hp={ship.hull} maxHp={ship.maxHull} scale={1} />
                ) : (
                  <span className="flex items-center gap-1.5 font-bold">
                    {ship.arrivesOnTurn !== undefined
                      ? t('result.neverArrived')
                      : ship.escaped
                        ? t('result.escapedShort')
                        : t('result.sunkShort')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The summary of the battle that just ended, read from the game store. */
export function ResultSummary() {
  const battle = useGameUIStore((state) => state.battle);
  const viewerId = useGameUIStore((state) => state.viewerId);
  return battle ? <ResultSummaryView battle={battle} viewerId={viewerId} /> : null;
}
