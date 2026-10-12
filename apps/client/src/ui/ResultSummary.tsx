import { useTranslation } from 'react-i18next';
import { useGameUIStore } from '../store/useGameUIStore';

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
    <div className="mt-4 rounded-xl bg-black/25 p-3 text-left text-xs text-parchment/80">
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        <dt>{t('result.turnsPlayed')}</dt>
        <dd className="text-right font-bold text-parchment">{battle.turns}</dd>
        {battle.objective && (
          <>
            <dt>{t('result.objective')}</dt>
            <dd className="text-right font-bold text-parchment">
              {battle.objective.met ? t('result.objectiveMet') : t('result.objectiveMissed')}
            </dd>
          </>
        )}
        {mine && (
          <>
            <dt>{t('result.yourHull')}</dt>
            <dd className="text-right font-bold text-parchment">
              {mine.hull}/{mine.maxHull}
            </dd>
            <dt>{t('result.cannonballsLeft')}</dt>
            <dd className="text-right font-bold text-parchment">{mine.ammo}</dd>
            {loot > 0 && (
              <>
                <dt>{t('result.lootTaken')}</dt>
                <dd className="text-right font-bold text-parchment">{loot}</dd>
              </>
            )}
          </>
        )}
      </dl>
      {others.length > 0 && (
        <div className="mt-2 border-t border-parchment/10 pt-2">
          <div className="mb-1 font-semibold text-parchment/60">{t('result.otherShips')}</div>
          <ul className="flex flex-col gap-0.5">
            {others.map((ship) => (
              <li key={ship.playerId} className="flex justify-between gap-3">
                <span className="truncate">{ship.name}</span>
                <span className="font-bold text-parchment">
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
