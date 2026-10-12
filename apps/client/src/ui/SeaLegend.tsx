import { useTranslation } from 'react-i18next';
import { useGameUIStore } from '../store/useGameUIStore';

/**
 * What the wind and whirlpools on this board do. Only the kinds the board
 * actually has are listed, and nothing is shown on open water.
 */
export function SeaLegend({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const hazards = useGameUIStore((state) => state.hazards);
  if (!hazards.wind && !hazards.whirlpool) {
    return null;
  }

  return (
    <dl className={`flex flex-col gap-1 text-[11px] text-parchment/70 ${className}`}>
      {hazards.wind && (
        <div className="flex gap-2">
          <dt className="w-4 shrink-0 text-center font-black text-parchment">»</dt>
          <dd>
            <b className="text-parchment/90">{t('legend.windTitle')}</b>{' '}
            {t('legend.windText')}
          </dd>
        </div>
      )}
      {hazards.whirlpool && (
        <div className="flex gap-2">
          <dt className="w-4 shrink-0 text-center font-black text-parchment">◎</dt>
          <dd>
            <b className="text-parchment/90">{t('legend.whirlpoolTitle')}</b>{' '}
            {t('legend.whirlpoolText')}
          </dd>
        </div>
      )}
    </dl>
  );
}
