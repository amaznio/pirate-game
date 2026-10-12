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
