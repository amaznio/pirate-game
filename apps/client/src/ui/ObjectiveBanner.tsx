import { useTranslation } from 'react-i18next';
import { useGameUIStore } from '../store/useGameUIStore';

/** The match's objective and how it stands, as one small line. Nothing for a standard match. */
export function ObjectiveBanner({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const progress = useGameUIStore((state) => state.objective);
  if (!progress) {
    return null;
  }

  return (
    <div
      className={`rounded-lg bg-parchment/10 px-3 py-1 text-center text-[11px] font-semibold text-parchment ${className}`}
    >
      {progress.kind === 'survive'
        ? t('objective.surviveProgress', { turn: progress.turn, turns: progress.turns })
        : progress.kind === 'merchant'
          ? progress.cells === null
            ? t('objective.merchantGone')
            : t('objective.merchantProgress', {
                cells: progress.cells,
                turn: progress.turn,
                turns: progress.turns,
              })
          : t('objective.salvageProgress', {
              yours: progress.yours,
              rival: progress.rival,
              target: progress.target,
            })}
    </div>
  );
}
