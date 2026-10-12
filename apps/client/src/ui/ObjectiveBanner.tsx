import { useTranslation } from 'react-i18next';
import { Banner } from '@/kit/Banner';
import { useGameUIStore } from '../store/useGameUIStore';

/** The match's objective and how it stands, as one small line. Nothing for a standard match. */
export function ObjectiveBanner({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const progress = useGameUIStore((state) => state.objective);
  if (!progress) {
    return null;
  }

  return (
    <Banner tone="objective" className={className}>
      {progress.kind === 'survive'
        ? t('objective.surviveProgress', { turn: progress.turn, turns: progress.turns })
        : progress.kind === 'ambush'
          ? t('objective.ambushProgress', {
              afloat: progress.afloat,
              coming: progress.coming,
              turn: progress.turn,
              turns: progress.turns,
            })
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
    </Banner>
  );
}
