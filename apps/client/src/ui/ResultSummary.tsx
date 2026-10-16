import { useTranslation } from 'react-i18next';
import { useGameUIStore } from '../store/useGameUIStore';

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col rounded-btn bg-background/40 px-3 py-2">
      <dd className="font-head text-2xl font-bold tabular-nums">{value}</dd>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
    </div>
  );
}

/** A few numbers about the battle that just ended, under the result title. */
export function ResultSummary() {
  const { t } = useTranslation();
  const battle = useGameUIStore((state) => state.battle);
  const viewerId = useGameUIStore((state) => state.viewerId);
  if (!battle) {
    return null;
  }

  const mine = battle.ships.find((ship) => ship.playerId === viewerId);
  const loot = mine ? mine.pickups.barrel + mine.pickups.crate + mine.pickups.plank : 0;
  const others = battle.ships.filter((ship) => ship.playerId !== viewerId);

  // A hunt has no enemy ships and no "objective met": it is about the treasure, the monsters and the boss.
  if (battle.hunt) {
    const { hunt } = battle;
    const left = hunt.ending === 'left';
    const lost = !left && (mine?.haul ?? 0) > 0 ? (mine?.haul ?? 0) : 0;
    return (
      <dl className="grid grid-cols-2 gap-2 text-left">
        <Stat value={hunt.haul} label={t('result.hunt.treasureBanked')} />
        {lost > 0 && <Stat value={lost} label={t('result.hunt.treasureLost')} />}
        <Stat value={hunt.monstersSunk} label={t('result.hunt.monstersSunk')} />
        <Stat
          value={hunt.bossSlain ? t('result.hunt.bossSlain') : t('result.hunt.bossAfloat')}
          label={t('result.hunt.boss')}
        />
        <Stat value={battle.turns} label={t('result.turnsPlayed')} />
        {mine && (
          <>
            <Stat
              value={`${mine.hull}/${mine.maxHull}`}
              label={left ? t('result.hunt.hullOnLeaving') : t('result.yourHull')}
            />
            <Stat value={mine.ammo} label={t('result.cannonballsLeft')} />
          </>
        )}
      </dl>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-left">
      <dl className="grid grid-cols-2 gap-2">
        <Stat value={battle.turns} label={t('result.turnsPlayed')} />
        {battle.objective && (
          <Stat
            value={battle.objective.met ? t('result.objectiveMet') : t('result.objectiveMissed')}
            label={t('result.objective')}
          />
        )}
        {mine && (
          <>
            <Stat value={`${mine.hull}/${mine.maxHull}`} label={t('result.yourHull')} />
            <Stat value={mine.ammo} label={t('result.cannonballsLeft')} />
            {loot > 0 && <Stat value={loot} label={t('result.lootTaken')} />}
          </>
        )}
      </dl>
      {others.length > 0 && (
        <div className="rounded-btn bg-background/40 px-3 py-2 text-sm">
          <div className="mb-1 font-bold text-muted-foreground">{t('result.otherShips')}</div>
          <ul className="flex flex-col gap-0.5">
            {others.map((ship) => (
              <li key={ship.playerId} className="flex justify-between gap-3">
                <span className="truncate">{ship.name}</span>
                <span className="font-bold">
                  {ship.afloat
                    ? `${ship.hull}/${ship.maxHull}`
                    : ship.arrivesOnTurn !== undefined
                      ? t('result.neverArrived')
                      : ship.escaped
                        ? t('result.escapedShort')
                        : t('result.sunkShort')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
